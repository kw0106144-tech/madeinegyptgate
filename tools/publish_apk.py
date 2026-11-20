#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publish a signed Android APK of the app on the site: /app/ (seo_app.part.py) offers it at the stable link /app/android.apk.

    python3 tools/publish_apk.py app-release.apk --sdk "$ANDROID_HOME"            # reads the version from the APK (aapt2)
    python3 tools/publish_apk.py app-release.apk --version 1.0.0 --code 7 --i-checked

What it does, in the repository (it never builds, signs, commits or deploys anything):
  1. Checks the file: an Android package of at most 25 MiB (Cloudflare Pages), signed with APK Signature Scheme v2/v3 by a
     certificate that seo/config.json "app" android_cert_sha256 lists (the release key, the value served in
     /.well-known/assetlinks.json) and never by the Android debug key — read from the file itself, no Android SDK needed.
  2. With the Android SDK (--sdk DIR, else $ANDROID_HOME / $ANDROID_SDK_ROOT, else aapt2 / apksigner on PATH): apksigner verify
     (the signature is valid; the same certificates), aapt2 dump badging (package com.madeinegyptgate.app, versionName,
     versionCode, minSdkVersion, and NOT «application-debuggable»). Without the SDK the version comes from --version / --code and
     --i-checked says that you checked those two things elsewhere (apksigner verify --print-certs, aapt2 dump badging).
  3. Refuses a versionCode lower than or equal to the published one (Android installs an update over the old app only when the
     versionCode is higher and the signing key is the same).
  4. Copies the APK to downloads/android/madeinegyptgate-<versionName>-<versionCode>.apk, writes downloads/android/latest.json
     {version, code, file, bytes, sha256, min_sdk, published, package, cert_sha256} and keeps only the newest --keep (2) APKs:
     the previous one stays reachable for a browser that still holds the previous /app/android.apk redirect.
  5. Prints what to commit. The next site build shows the new version on /app/ and points /app/android.apk at it; deploy-site
     publishes it after the merge (CLAUDE.md 5.7).
Exit: 0 = published (or already published), 1 = refused, 2 = usage. Standard library only (Python >= 3.8).
"""
import argparse
import datetime
import glob
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CHANNEL = "downloads/android"
VERSION_RX = re.compile(r"^[0-9][0-9A-Za-z._-]{0,39}$")


def load_stage(repo):
    """deploy/stage.py: the same APK reader the pre-deploy gate uses (apk_signers, apk_problems, file_sha256 …)"""
    p = os.path.join(repo, "deploy", "stage.py")
    spec = importlib.util.spec_from_file_location("mig_stage", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def sdk_tools(sdk):
    """(aapt2, apksigner) of the newest build-tools of an Android SDK, else the ones on PATH; (None, None) when there are none"""
    for d in [sdk, os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]:
        if not d:
            continue
        bts = sorted(glob.glob(os.path.join(d, "build-tools", "*")),
                     key=lambda x: [int(n) if n.isdigit() else 0 for n in re.split(r"[.-]", os.path.basename(x))])
        for bt in reversed(bts):
            a, s = os.path.join(bt, "aapt2"), os.path.join(bt, "apksigner")
            if os.access(a, os.X_OK) and os.access(s, os.X_OK):
                return a, s
        if d == sdk:
            raise SystemExit("publish_apk: --sdk %s has no build-tools/<version>/aapt2 + apksigner" % sdk)
    a, s = shutil.which("aapt2"), shutil.which("apksigner")
    return (a, s) if a and s else (None, None)


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
    return p.returncode, p.stdout


def badging(aapt2, apk):
    rc, out = run([aapt2, "dump", "badging", apk])
    if rc != 0:
        raise SystemExit("publish_apk: aapt2 dump badging failed:\n" + out[-2000:])
    m = re.search(r"^package: name='([^']*)' versionCode='([^']*)' versionName='([^']*)'", out, re.M)
    ms = re.search(r"^(?:sdkVersion|minSdkVersion):'(\d+)'", out, re.M)
    if not m:
        raise SystemExit("publish_apk: aapt2 did not print the package line")
    return {"package": m.group(1), "code": m.group(2), "version": m.group(3), "min_sdk": int(ms.group(1)) if ms else None,
            "debuggable": bool(re.search(r"^application-debuggable", out, re.M))}


def verify(apksigner, apk):
    rc, out = run([apksigner, "verify", "--print-certs", "--verbose", apk])
    if rc != 0 or not re.search(r"^Verifies\s*$", out, re.M):
        raise SystemExit("publish_apk: apksigner verify refuses the APK (not a valid signed APK):\n" + out[-2000:])
    certs = [":".join(h[i:i + 2] for i in range(0, 64, 2)).upper()
             for h in re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})\s*$", out, re.M)]
    return certs, out


def min_sdk_default(repo):
    try:
        t = open(os.path.join(repo, "app", "android", "variables.gradle"), encoding="utf-8").read()
        m = re.search(r"minSdkVersion\s*=\s*(\d+)", t)
        return int(m.group(1)) if m else 24
    except OSError:
        return 24


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog="\n".join(__doc__.split("\n")[1:]))
    ap.add_argument("apk", help="the signed release APK (for example the android-release artifact of the app-android workflow)")
    ap.add_argument("--sdk", help="Android SDK directory (build-tools/<version>/aapt2 and apksigner); default $ANDROID_HOME")
    ap.add_argument("--version", help="versionName (without the SDK; with it, must match the APK)")
    ap.add_argument("--code", type=int, help="versionCode (without the SDK; with it, must match the APK)")
    ap.add_argument("--min-sdk", type=int, help="minSdkVersion (without the SDK; default: app/android/variables.gradle)")
    ap.add_argument("--i-checked", action="store_true",
                    help="no Android SDK here: I checked with apksigner / aapt2 elsewhere that the APK verifies and is not debuggable")
    ap.add_argument("--keep", type=int, default=2, help="how many APKs stay in downloads/android/ (default 2: this one and the previous)")
    ap.add_argument("--published", help="the date shown on /app/ (YYYY-MM-DD, default today)")
    ap.add_argument("--repo", default=REPO, help="the repository root (default: the one this tool is in)")
    ap.add_argument("--dry-run", action="store_true", help="check everything, write nothing")
    a = ap.parse_args(argv)

    repo = os.path.abspath(a.repo)
    apk = os.path.abspath(a.apk)
    if not os.path.isfile(apk):
        ap.error("%s: no such file" % a.apk)
    if a.keep < 1:
        ap.error("--keep must be at least 1")
    st = load_stage(repo)
    cfg = json.load(open(os.path.join(repo, "seo", "config.json"), encoding="utf-8")).get("app") or {}
    package = cfg.get("android_package") or st.APP_PACKAGE
    allowed = [x for x in (cfg.get("android_cert_sha256") or []) if isinstance(x, str) and st.CERT_FP_RX.match(x)]
    refuse = []

    # 1. the file itself (no SDK needed)
    size = os.path.getsize(apk)
    refuse += st.apk_problems(apk)
    if size > st.MAX_FILE_BYTES:
        refuse.append("%.1f MiB: Cloudflare Pages takes 25 MiB per file at most" % (size / 1048576.0))
    sg = st.apk_signers(apk)
    if sg["problem"]:
        refuse.append(sg["problem"])
    elif sg["debug"]:
        refuse.append("signed with the Android DEBUG key (CN=Android Debug): build and sign a release APK")
    elif not allowed:
        refuse.append("seo/config.json \"app\" android_cert_sha256 lists no release certificate to compare with")
    else:
        other = [c for c in sg["certs"] if c not in allowed]
        if other:
            refuse.append("signed by %s, a certificate seo/config.json \"app\" android_cert_sha256 does not list (%s). A debug or "
                          "wrong key? Android installs an update only when the key is the same as the installed app's."
                          % (", ".join(other), ", ".join(allowed)))
    if refuse:
        raise SystemExit("publish_apk: REFUSED %s:\n  - %s" % (a.apk, "\n  - ".join(refuse)))

    # 2. the SDK checks (or the human's word)
    aapt2, apksigner = sdk_tools(a.sdk)
    if aapt2:
        b = badging(aapt2, apk)
        certs, _ = verify(apksigner, apk)
        if sorted(certs) != sorted(sg["certs"]):
            refuse.append("apksigner names the signers %s, the signing block %s" % (certs, sg["certs"]))
        if b["debuggable"]:
            refuse.append("aapt2: application-debuggable (a debug build: never publish one)")
        if b["package"] != package:
            refuse.append("aapt2: package %s, the app is %s" % (b["package"], package))
        if a.version and a.version != b["version"]:
            refuse.append("--version %s, the APK says %s" % (a.version, b["version"]))
        if a.code and str(a.code) != b["code"]:
            refuse.append("--code %s, the APK says %s" % (a.code, b["code"]))
        version, code, min_sdk = b["version"], int(b["code"]) if b["code"].isdigit() else 0, b["min_sdk"] or min_sdk_default(repo)
        how = "apksigner verify + aapt2 dump badging (%s)" % os.path.dirname(aapt2)
    else:
        if not (a.version and a.code):
            ap.error("no Android SDK found (--sdk, $ANDROID_HOME, PATH): give --version and --code (and --i-checked)")
        if not a.i_checked:
            ap.error("no Android SDK found to check that the APK verifies and is not debuggable: check it elsewhere "
                     "(apksigner verify --print-certs; aapt2 dump badging: no «application-debuggable») and add --i-checked")
        version, code, min_sdk = a.version, a.code, a.min_sdk or min_sdk_default(repo)
        how = "signing block read here; verification and «not debuggable» checked by hand (--i-checked)"
    if not VERSION_RX.match(version or ""):
        refuse.append("versionName %r is not a version such as 1.0.0" % version)
    if not 1 <= code <= 2100000000:
        refuse.append("versionCode %r is not 1 … 2100000000" % code)
    if not isinstance(min_sdk, int) or not 21 <= min_sdk <= 99:
        refuse.append("minSdkVersion %r is not an API level 21 … 99" % (min_sdk,))
    published = a.published or datetime.date.today().isoformat()
    try:
        datetime.date.fromisoformat(published)
    except ValueError:
        refuse.append("--published %r is not a date YYYY-MM-DD" % published)

    # 3. against what is published
    chan = os.path.join(repo, *CHANNEL.split("/"))
    lj_path = os.path.join(chan, "latest.json")
    sha = st.file_sha256(apk)
    cur = None
    if os.path.isfile(lj_path):
        try:
            cur = json.load(open(lj_path, encoding="utf-8"))
        except ValueError:
            refuse.append("%s/latest.json is not valid JSON: fix it by hand first" % CHANNEL)
    if isinstance(cur, dict) and isinstance(cur.get("code"), int):
        same = cur["code"] == code and cur.get("sha256") == sha
        if same and not refuse:     # (a refusal above, such as aapt2's «debuggable», still refuses the published file)
            print("publish_apk: %s (version %s, build %d) is already the published APK: nothing to do" % (cur.get("file"), cur.get("version"), code))
            return 0
        if code <= cur["code"] and not same:
            refuse.append("versionCode %d is not higher than the published %d (%s): Android installs an update only over a lower "
                          "versionCode — build again with a higher one" % (code, cur["code"], cur.get("file")))
    if refuse:
        raise SystemExit("publish_apk: REFUSED %s:\n  - %s" % (a.apk, "\n  - ".join(refuse)))

    name = "madeinegyptgate-%s-%d.apk" % (version, code)
    if not st.APK_NAME_RX.match(name):
        raise SystemExit("publish_apk: REFUSED: %s is not a valid file name" % name)
    latest = {"version": version, "code": code, "file": name, "bytes": size, "sha256": sha, "min_sdk": min_sdk,
              "published": published, "package": package, "cert_sha256": sg["certs"]}
    olds = sorted([n for n in (os.listdir(chan) if os.path.isdir(chan) else []) if st.APK_NAME_RX.match(n) and n != name],
                  key=lambda n: int(st.APK_NAME_RX.match(n).group(2)), reverse=True)
    drop = olds[max(0, a.keep - 1):]
    print("publish_apk: %s\n  checks: %s\n  signer: %s (%s)\n  version %s, build %d, Android API %d+, %.1f MB\n  SHA-256 %s"
          % (a.apk, how, ", ".join(sg["certs"]), ",".join(sg["schemes"]), version, code, min_sdk, size / 1048576.0, sha))
    if a.dry_run:
        print("  dry run: would write %s/%s + latest.json%s" % (CHANNEL, name, ("; remove " + ", ".join(drop)) if drop else ""))
        return 0

    # 4. write (temporary names first: an interrupted run leaves the channel as it was)
    os.makedirs(chan, exist_ok=True)
    dst = os.path.join(chan, name)
    shutil.copyfile(apk, dst + ".tmp")
    if st.file_sha256(dst + ".tmp") != sha:
        os.remove(dst + ".tmp")
        raise SystemExit("publish_apk: the copy differs from the original (disk?): nothing published")
    os.replace(dst + ".tmp", dst)
    with open(lj_path + ".tmp", "w", encoding="utf-8") as f:
        f.write(json.dumps(latest, indent=1, ensure_ascii=False) + "\n")
    os.replace(lj_path + ".tmp", lj_path)
    for n in drop:
        os.remove(os.path.join(chan, n))

    # 5. what to commit
    print("  written: %s/%s, %s/latest.json%s" % (CHANNEL, name, CHANNEL, ("; removed " + ", ".join(drop)) if drop else ""))
    print("\nNext (CLAUDE.md 5.7):\n"
          "  1. git switch -c release/android-%s-%d && git add -A %s/\n"
          "  2. build + stage (CLAUDE.md 3.2 / 3.3): /app/ shows version %s (build %d), /app/android.apk → %s/%s\n"
          "  3. commit, push, open a pull request; after the merge deploy-site publishes the page and the file.\n"
          "     Never commit a debug APK (the stage refuses one)." % (version, code, CHANNEL, version, code, CHANNEL, name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
