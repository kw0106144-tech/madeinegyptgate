#!/usr/bin/env python3
"""The app's changes to the iOS project that `npx cap add ios` generated (app/ios/App). Safe to run again: it only adds what is
missing, so the result is the same every time.

    python3 app/tools/ios_project.py          # apply (after a fresh `npx cap add ios`, or to repair)
    python3 app/tools/ios_project.py --check  # CI and `npm run check`: exit 1 when something is missing

It keeps in place:
  * App/Info.plist: microphone / camera / photo library / speech recognition purpose texts (English base; Arabic + English in
    InfoPlist.strings), the languages ar + en, ITSAppUsesNonExemptEncryption = NO (only the HTTPS / WebRTC encryption that iOS
    itself provides);
  * App/en.lproj/InfoPlist.strings, App/ar.lproj/InfoPlist.strings: the home-screen name and the purpose texts per language;
  * App/App.entitlements: Associated Domains applinks:madeinegyptgate.com (Universal Links) and webcredentials:madeinegyptgate.com
    (saved passwords of the old-account form shared with the site); the App ID needs the capability, the site serves the file
    (seo/config.json app.ios_team_id, app/well-known/README.md);
  * App.xcodeproj/project.pbxproj: MainViewController.swift in the build, the InfoPlist.strings variant group, knownRegions ar,
    CODE_SIGN_ENTITLEMENTS, MARKETING_VERSION 1.0.0.
--check also verifies what the app's own Swift code must keep (MainViewController.swift: new windows as sheets, the back swipe,
pull to refresh, dialogs, Quick Look, printing …; SWIFT_NEEDS) and that CapApp-SPM/Package.swift has no @capacitor/keyboard on
iOS (capacitor.config.json ios.includePlugins leaves it out, so `npx cap sync ios` writes the package without it).
"""
import hashlib
import os
import plistlib
import re
import sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IOS = os.path.join(APP, "ios", "App")
PLIST = os.path.join(IOS, "App", "Info.plist")
PBX = os.path.join(IOS, "App.xcodeproj", "project.pbxproj")
ENT = os.path.join(IOS, "App", "App.entitlements")
SWIFT = os.path.join(IOS, "App", "MainViewController.swift")
SPM = os.path.join(IOS, "CapApp-SPM", "Package.swift")

PURPOSE = {
    "en": {
        "CFBundleDisplayName": "Made in Egypt Gate",
        "NSMicrophoneUsageDescription": "The microphone is used only when you start a live call with Janna or Bassem, the platform's assistants, or tap the microphone in Janna's chat to speak instead of typing.",
        "NSCameraUsageDescription": "The camera is used only when you choose to take a photo to upload, such as registration documents or product photos.",
        "NSPhotoLibraryUsageDescription": "Your photo library is used only when you choose a photo or document to upload, such as registration documents or product photos.",
        "NSPhotoLibraryAddUsageDescription": "Lets you save an image from the platform to your photos when you choose to.",
        "NSSpeechRecognitionUsageDescription": "Speech recognition turns what you say to Janna into text when you tap the microphone in her chat.",
    },
    "ar": {
        "CFBundleDisplayName": "صنع في مصر",
        "NSMicrophoneUsageDescription": "يُستخدم الميكروفون فقط عندما تبدأ مكالمة مباشرة مع جنة أو باسم، مساعدَي المنصة، أو عندما تضغط على زر الميكروفون في محادثة جنة لتتحدث بدلًا من الكتابة.",
        "NSCameraUsageDescription": "تُستخدم الكاميرا فقط عندما تختار تصوير صورة لرفعها، مثل مستندات التسجيل أو صور المنتجات.",
        "NSPhotoLibraryUsageDescription": "تُستخدم مكتبة الصور فقط عندما تختار صورة أو مستندًا لرفعه، مثل مستندات التسجيل أو صور المنتجات.",
        "NSPhotoLibraryAddUsageDescription": "لحفظ صورة من المنصة في صورك عندما تختار ذلك.",
        "NSSpeechRecognitionUsageDescription": "يُستخدم التعرّف على الكلام لتحويل ما تقوله لجنة إلى نص عندما تضغط على زر الميكروفون في محادثتها.",
    },
}
ASSOCIATED = ["applinks:madeinegyptgate.com", "webcredentials:madeinegyptgate.com"]
# What MainViewController.swift must keep, so that the app behaves like the site in Safari (app/README.md "What the app does")
SWIFT_NEEDS = [
    ("createWebViewWith", "the site's new windows (target=_blank, window.open) as a sheet over the page, never Safari"),
    ("webViewDidClose", "window.close() closes that sheet"),
    ("allowsBackForwardNavigationGestures = true", "the back / forward swipe"),
    ("refreshControl", "pull to refresh"),
    ("runJavaScriptConfirmPanelWithMessage", "confirm() in the page's language, over the sheet on top"),
    ("SFSafariViewController", "another site's page over a live call"),
    ("callOpenJS", "the live-call check (JANNA_LIVE.isOpen) before a link leaves or replaces the call's page"),
    ("QLPreviewController", "Quick Look for calendar files, PDFs, pictures"),
    ("migPrint", "window.print() → the system print sheet"),
    ("estimatedProgress", "the page-load bar"),
    ("MIGPlace", "the page kept for the next start"),
    ("safeAreaJS", "pages with viewport-fit=cover below the status bar once, not twice, on current WebKit"),
]


def uid(label):
    """stable 24-hex object id for the project file (same label = same id on every run)"""
    return hashlib.md5(("madeinegyptgate.app/" + label).encode()).hexdigest()[:24].upper()


ID = {k: uid(k) for k in ("mvc.ref", "mvc.build", "strings.group", "strings.build", "strings.en", "strings.ar", "entitlements.ref")}


def strings_file(lang):
    rows = ['/* %s: the home-screen name and the purpose texts iOS shows before it asks (app/tools/ios_project.py) */' % lang]
    for k, v in PURPOSE[lang].items():
        rows.append('"%s" = "%s";' % (k, v.replace("\\", "\\\\").replace('"', '\\"')))
    return "\n".join(rows) + "\n"


ENTITLEMENTS = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                '<plist version="1.0">\n<dict>\n'
                '\t<!-- Universal Links + shared web credentials: the site must serve /.well-known/apple-app-site-association (app/well-known/) -->\n'
                '\t<key>com.apple.developer.associated-domains</key>\n\t<array>\n'
                + "".join("\t\t<string>%s</string>\n" % d for d in ASSOCIATED) +
                '\t</array>\n</dict>\n</plist>\n')


def plist_changes(p):
    want = {
        "NSMicrophoneUsageDescription": PURPOSE["en"]["NSMicrophoneUsageDescription"],
        "NSCameraUsageDescription": PURPOSE["en"]["NSCameraUsageDescription"],
        "NSPhotoLibraryUsageDescription": PURPOSE["en"]["NSPhotoLibraryUsageDescription"],
        "NSPhotoLibraryAddUsageDescription": PURPOSE["en"]["NSPhotoLibraryAddUsageDescription"],
        "NSSpeechRecognitionUsageDescription": PURPOSE["en"]["NSSpeechRecognitionUsageDescription"],
        "CFBundleLocalizations": ["ar", "en"],
        "ITSAppUsesNonExemptEncryption": False,
    }
    return {k: v for k, v in want.items() if p.get(k) != v}


def pbx_missing(s):
    miss = []
    if "MainViewController.swift in Sources" not in s:
        miss.append("MainViewController.swift in the Sources build phase")
    if "InfoPlist.strings in Resources" not in s or "path = ar.lproj/InfoPlist.strings" not in s or "path = en.lproj/InfoPlist.strings" not in s:
        miss.append("InfoPlist.strings (en, ar) in the Resources build phase")
    if not re.search(r"knownRegions = \([^)]*\bar,", s):
        miss.append("knownRegions ar")
    if s.count("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;") < 2:
        miss.append("CODE_SIGN_ENTITLEMENTS (Debug + Release)")
    if "MARKETING_VERSION = 1.0;" in s:
        miss.append("MARKETING_VERSION 1.0.0")
    return miss


def insert_after(s, anchor, text):
    i = s.index(anchor) + len(anchor)
    return s[:i] + text + s[i:]


def patch_pbx(s):
    m = ID
    if "MainViewController.swift in Sources" not in s:
        s = insert_after(s, "/* Begin PBXBuildFile section */\n",
                         "\t\t%s /* MainViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = %s /* MainViewController.swift */; };\n" % (m["mvc.build"], m["mvc.ref"]))
        s = insert_after(s, "/* Begin PBXFileReference section */\n",
                         "\t\t%s /* MainViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MainViewController.swift; sourceTree = \"<group>\"; };\n" % m["mvc.ref"])
        s = re.sub(r"(/\* Sources \*/ = \{\s*isa = PBXSourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(\n)",
                   lambda x: x.group(1) + "\t\t\t\t%s /* MainViewController.swift in Sources */,\n" % m["mvc.build"], s, count=1)
        s = s.replace("\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,\n",
                      "\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,\n\t\t\t\t%s /* MainViewController.swift */,\n" % m["mvc.ref"], 1)
    if "InfoPlist.strings in Resources" not in s:
        s = insert_after(s, "/* Begin PBXBuildFile section */\n",
                         "\t\t%s /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = %s /* InfoPlist.strings */; };\n" % (m["strings.build"], m["strings.group"]))
        s = insert_after(s, "/* Begin PBXFileReference section */\n",
                         "\t\t%s /* en */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = en; path = en.lproj/InfoPlist.strings; sourceTree = \"<group>\"; };\n"
                         "\t\t%s /* ar */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = ar; path = ar.lproj/InfoPlist.strings; sourceTree = \"<group>\"; };\n" % (m["strings.en"], m["strings.ar"]))
        s = insert_after(s, "/* Begin PBXVariantGroup section */\n",
                         "\t\t%s /* InfoPlist.strings */ = {\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n\t\t\t\t%s /* en */,\n\t\t\t\t%s /* ar */,\n\t\t\t);\n"
                         "\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = \"<group>\";\n\t\t};\n" % (m["strings.group"], m["strings.en"], m["strings.ar"]))
        s = re.sub(r"(/\* Resources \*/ = \{\s*isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(\n)",
                   lambda x: x.group(1) + "\t\t\t\t%s /* InfoPlist.strings in Resources */,\n" % m["strings.build"], s, count=1)
        s = s.replace("\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n",
                      "\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\t%s /* InfoPlist.strings */,\n" % m["strings.group"], 1)
    if "App.entitlements */ = {isa = PBXFileReference" not in s:
        s = insert_after(s, "/* Begin PBXFileReference section */\n",
                         "\t\t%s /* App.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = \"<group>\"; };\n" % m["entitlements.ref"])
        s = s.replace("\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n",
                      "\t\t\t\t%s /* App.entitlements */,\n\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n" % m["entitlements.ref"], 1)
    if not re.search(r"knownRegions = \([^)]*\bar,", s):
        s = re.sub(r"(knownRegions = \(\n)", lambda x: x.group(1) + "\t\t\t\tar,\n", s, count=1)
    if s.count("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;") < 2:
        s = s.replace("\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n",
                      "\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n")
    s = s.replace("MARKETING_VERSION = 1.0;", "MARKETING_VERSION = 1.0.0;")
    return s


def ci_sign(team, profile):
    """CI only, never committed: manual App Store signing of the App target's Release configuration. Set in the project file
    instead of on the xcodebuild command line, because command-line settings reach the Swift packages too, and a package
    cannot take a provisioning profile."""
    if not re.fullmatch(r"[A-Z0-9]{10}", team or ""):
        sys.exit("--ci-sign: the Apple Team ID is 10 letters / digits")
    if not profile or '"' in profile or "\n" in profile:
        sys.exit("--ci-sign: unusable provisioning profile name")
    s = open(PBX, encoding="utf-8").read()
    rx = re.compile(r"(504EC3181FED79650016851F /\* Release \*/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{\n)(.*?)(\t\t\t\};\n\t\t\tname = Release;)", re.S)
    m = rx.search(s)
    if not m:
        sys.exit("--ci-sign: the App target's Release configuration was not found")
    body = re.sub(r"\t\t\t\t(CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|DEVELOPMENT_TEAM|PROVISIONING_PROFILE_SPECIFIER) = [^\n]*;\n", "", m.group(2))
    body += ('\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tCODE_SIGN_STYLE = Manual;\n'
             '\t\t\t\tDEVELOPMENT_TEAM = %s;\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "%s";\n' % (team, profile))
    s = s[:m.start(2)] + body + s[m.end(2):]
    with open(PBX, "w", encoding="utf-8") as fh:
        fh.write(s)
    print("App target Release: manual signing with team %s and profile «%s»" % (team, profile))


def main():
    if sys.argv[1:2] == ["--ci-sign"]:
        if len(sys.argv) != 4:
            sys.exit("usage: ios_project.py --ci-sign <TEAM_ID> <PROFILE_NAME>")
        ci_sign(sys.argv[2], sys.argv[3])
        return
    check = "--check" in sys.argv[1:]
    problems = []
    with open(PLIST, "rb") as fh:
        plist = plistlib.load(fh)
    changes = plist_changes(plist)
    files = {os.path.join(IOS, "App", lang + ".lproj", "InfoPlist.strings"): strings_file(lang) for lang in PURPOSE}
    files[ENT] = ENTITLEMENTS
    pbx = open(PBX, encoding="utf-8").read()
    if check:
        problems += ["Info.plist " + k for k in changes]
        problems += [os.path.relpath(p, APP) for p, body in files.items() if not os.path.exists(p) or open(p, encoding="utf-8").read() != body]
        problems += ["project.pbxproj: " + x for x in pbx_missing(pbx)]
        if not os.path.exists(SWIFT):
            problems.append("ios/App/App/MainViewController.swift")
        else:
            swift = open(SWIFT, encoding="utf-8").read()
            problems += ["MainViewController.swift: %s (%s)" % (k, why) for k, why in SWIFT_NEEDS if k not in swift]
        if os.path.exists(SPM) and "CapacitorKeyboard" in open(SPM, encoding="utf-8").read():
            problems.append("CapApp-SPM/Package.swift has @capacitor/keyboard: it hides Safari's form bar (previous / next / Done) on every"
                            " field; capacitor.config.json ios.includePlugins must leave it out, then `npx cap sync ios`")
        if "MainViewController()" not in open(os.path.join(IOS, "App", "SceneDelegate.swift"), encoding="utf-8").read():
            problems.append("SceneDelegate.swift: rootViewController = MainViewController()")
        if problems:
            print("iOS project is missing the app's changes (run python3 app/tools/ios_project.py):\n  - " + "\n  - ".join(problems))
            sys.exit(1)
        print("iOS project: ok")
        return
    if changes:
        plist.update(changes)
        with open(PLIST, "wb") as fh:
            plistlib.dump(plist, fh, sort_keys=False)
    for p, body in files.items():
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(body)
    new = patch_pbx(pbx)
    if new != pbx:
        with open(PBX, "w", encoding="utf-8") as fh:
            fh.write(new)
    left = pbx_missing(new)
    if left:
        sys.exit("could not apply: " + ", ".join(left))
    print("iOS project patched: Info.plist %d key(s), %d file(s), project.pbxproj %s" % (len(changes), len(files), "changed" if new != pbx else "unchanged"))


if __name__ == "__main__":
    main()
