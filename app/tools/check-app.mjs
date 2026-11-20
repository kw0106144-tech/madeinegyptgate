#!/usr/bin/env node
// Offline checks of the app folder (no network, nothing is built): `cd app && npm run check`. CI runs it before every build.
//  - capacitor.config.json: the live site, the two allowed hosts, the user agent marks, no errorPath and no SystemBars inset
//    handling (the native code owns both)
//  - www/: index.html + offline.html exist, the offline page is self-contained (no other file of the app can be reached from it)
//    and its inline scripts parse as ES5 (the site's rule for browser code) when acorn is installed (see app/README.md)
//  - Android: permissions for the live calls (Bluetooth headsets below Android 12), App Links filter, file chooser and speech
//    recognition queries, backup rules without the WebView's data, strings in Arabic and English for every name, the browser-tab
//    parity code (new windows, page process, print, pull to reload, dialogs …: app/README.md), the layout that overrides
//    Capacitor's, and every path of ../deploy/legacy-live.txt kept out of the app (MigLinks)
//  - iOS: python3 tools/ios_project.py --check (purpose texts, InfoPlist.strings ar + en, entitlements, project file)
//  - store texts: the length limits of Google Play and the App Store
//  - well-known templates: valid JSON, placeholders still marked, the same relations / iOS path rules as the site build (../seo_app.part.py)
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(APP, p), "utf8");
const errors = [];
const notes = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

// capacitor.config.json
const cfg = JSON.parse(read("capacitor.config.json"));
need(cfg.appId === "com.madeinegyptgate.app", "appId must be com.madeinegyptgate.app");
need(cfg.appName === "صنع في مصر", "appName must be «صنع في مصر»");
need(cfg.server?.url === "https://madeinegyptgate.com", "server.url must be https://madeinegyptgate.com");
need(JSON.stringify(cfg.server?.allowNavigation) === JSON.stringify(["madeinegyptgate.com", "www.madeinegyptgate.com"]), "server.allowNavigation must be exactly the two hosts of the site");
need(cfg.server?.androidScheme === "https" && cfg.server?.cleartext !== true, "androidScheme https, no cleartext");
need(!cfg.server?.errorPath, "no server.errorPath: MainActivity / MainViewController show the offline page (Capacitor would show it for HTTP errors and cancelled loads too)");
need(cfg.android?.appendUserAgent === "MIGApp/1.0 (android)", "android.appendUserAgent must be MIGApp/1.0 (android)");
need(cfg.ios?.appendUserAgent === "MIGApp/1.0 (ios)", "ios.appendUserAgent must be MIGApp/1.0 (ios)");
need(cfg.plugins?.App?.disableBackButtonHandler === true, "plugins.App.disableBackButtonHandler must be true (MainActivity handles the back button)");
need(cfg.plugins?.SystemBars?.insetsHandling === "disable", "plugins.SystemBars.insetsHandling must be \"disable\" (MainActivity keeps the WebView between the bars; Capacitor's handling would put most site pages under a white status bar strip)");
need(cfg.zoomEnabled === true, "zoomEnabled must be true: pinch-zoom of photos, tables and small text, as in the phone's browser (the site's viewports allow it)");
need(cfg.ios?.allowsLinkPreview === true, "ios.allowsLinkPreview must be true: the long-press link menu (open, copy, share), as in Safari");
const pkg = JSON.parse(read("package.json"));
const plugins = Object.keys(pkg.dependencies || {}).filter((n) => n.startsWith("@capacitor/") && !["@capacitor/android", "@capacitor/ios", "@capacitor/core", "@capacitor/cli"].includes(n));
const iosPlugins = cfg.ios?.includePlugins;
need(Array.isArray(iosPlugins) && !iosPlugins.includes("@capacitor/keyboard"), "ios.includePlugins must leave out @capacitor/keyboard: it hides Safari's form bar (previous / next / Done / AutoFill) and WKWebView's own keyboard handling");
need(Array.isArray(iosPlugins) && plugins.filter((n) => n !== "@capacitor/keyboard").every((n) => iosPlugins.includes(n)), "ios.includePlugins must list every other plugin of package.json");

// www
for (const f of ["www/index.html", "www/offline.html"]) need(existsSync(join(APP, f)), f + " is missing");
const offline = read("www/offline.html");
need(/lang="ar" dir="rtl"/.test(offline) && /lang="en" dir="ltr"/.test(offline), "offline.html must have the Arabic and the English text");
need(/<!--LOGO--><img class="logo" src="data:image\/png;base64,/.test(offline), "offline.html: the logo must be inline (python3 tools/make_assets.py)");
need(!/<(script|link|img)\b[^>]*\b(src|href)="(?!data:|https:\/\/madeinegyptgate\.com\/)/i.test(offline), "offline.html must not load other files (only data: and links to the site)");
let acorn = null;
for (const base of [APP, process.env.ACORN_DIR || ""]) {
  if (!base) continue;
  try { acorn = createRequire(join(base, "package.json"))("acorn"); break; } catch { /* not installed there */ }
}
const scripts = [];
for (const f of ["www/index.html", "www/offline.html"]) {
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(read(f)))) if (!/\bsrc=/.test(m[1])) scripts.push([f, m[2]]);
}
if (acorn) {
  for (const [f, code] of scripts) {
    try { acorn.parse(code, { ecmaVersion: 5 }); } catch (e) { errors.push(`${f}: inline script is not ES5 (${e.message})`); }
  }
} else notes.push("ES5 check skipped: acorn not found (ACORN_DIR=<dir with node_modules/acorn>)");

// Android
const man = read("android/app/src/main/AndroidManifest.xml");
for (const p of ["INTERNET", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "CAMERA", "ACCESS_NETWORK_STATE"]) need(man.includes(`android.permission.${p}"`), "AndroidManifest.xml: permission " + p);
need(/android:autoVerify="true"[\s\S]*?android:host="madeinegyptgate.com"/.test(man), "AndroidManifest.xml: App Links filter for madeinegyptgate.com");
need(/android.hardware.camera" android:required="false"/.test(man) && /android.hardware.microphone" android:required="false"/.test(man), "AndroidManifest.xml: camera / microphone must be optional features");
need(man.includes("android.media.action.IMAGE_CAPTURE"), "AndroidManifest.xml: queries for the camera app (file chooser)");
need(man.includes("android.speech.RecognitionService"), "AndroidManifest.xml: queries for android.speech.RecognitionService (the 🎤 of Janna's chat on Android 11+)");
need(/android\.permission\.BLUETOOTH"\s+android:maxSdkVersion="30"/.test(man), "AndroidManifest.xml: android.permission.BLUETOOTH with maxSdkVersion 30 (live calls on Bluetooth earbuds, Android 7–11)");
need(/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(man) && /android:fullBackupContent="@xml\/backup_rules"/.test(man), "AndroidManifest.xml: dataExtractionRules + fullBackupContent (backups without the WebView's sign-in data)");
for (const f of ["data_extraction_rules", "backup_rules"]) {
  const x = existsSync(join(APP, `android/app/src/main/res/xml/${f}.xml`)) ? read(`android/app/src/main/res/xml/${f}.xml`) : "";
  need(/<exclude domain="root" path="app_webview\/" \/>/.test(x) && /<exclude domain="sharedpref" path="mig_session\.xml" \/>/.test(x), `res/xml/${f}.xml must leave out app_webview/ and mig_session.xml`);
}
const enStrings = read("android/app/src/main/res/values/strings.xml");
const arStrings = read("android/app/src/main/res/values-ar/strings.xml");
need(/name="app_name">Made in Egypt Gate</.test(enStrings), "values/strings.xml app_name");
need(/name="app_name">صنع في مصر</.test(arStrings), "values-ar/strings.xml app_name");
const names = (x) => [...x.matchAll(/<string name="([^"]+)"(?![^>]*translatable="false")/g)].map((m) => m[1]);
for (const n of names(enStrings)) need(names(arStrings).includes(n), `values-ar/strings.xml has no «${n}» (every native text in Arabic and English)`);
for (const n of names(arStrings)) need(names(enStrings).includes(n), `values/strings.xml has no "${n}"`);
const JAVA = "android/app/src/main/java/com/madeinegyptgate/app/";
const java = {};
for (const f of ["MainActivity", "MigWebViewClient", "MigChromeClient", "MigDownloads", "MigLinks", "MigWindows", "MigPage", "MigPullLayout", "MigAsk", "MigOut"]) {
  if (!existsSync(join(APP, `${JAVA}${f}.java`))) { errors.push(f + ".java is missing"); java[f] = ""; continue; }
  java[f] = read(`${JAVA}${f}.java`);
}
need(existsSync(join(APP, "android/app/src/test/java/com/madeinegyptgate/app/MigLogicTest.java")), "MigLogicTest.java is missing (JVM tests of MigLinks / MigAsk / MigDownloads)");
// what a browser tab does (app/README.md "What the app does"), checked by name so a merge or an upgrade cannot drop it unseen
need(java.MainActivity.includes("setSupportMultipleWindows(true)"), "MainActivity.java: setSupportMultipleWindows(true) (target=_blank / window.open → a window over the page, same-site-new-windows)");
for (const m of ["onCreateWindow", "onCloseWindow", "onRequestFocus", "onJsConfirm", "onProgressChanged", "onPermissionRequestCanceled", "onShowFileChooser"]) need(java.MigChromeClient.includes(`public ${m === "onCreateWindow" || m === "onJsConfirm" || m === "onShowFileChooser" ? "boolean" : "void"} ${m}(`), `MigChromeClient.java: ${m} is missing`);
need(java.MigChromeClient.includes("SCREEN_ORIENTATION_SENSOR"), "MigChromeClient.java: full-screen video follows the rotation (SCREEN_ORIENTATION_SENSOR)");
need(java.MigWebViewClient.includes("onRenderProcessGone") && java.MainActivity.includes("recreate()"), "MigWebViewClient / MainActivity: a stopped page process starts the page again (onRenderProcessGone → recreate)");
need(java.MainActivity.includes("onSaveInstanceState") && java.MainActivity.includes("MigLinks.restoreUrl"), "MainActivity.java: the same page after Android reclaimed the app (onSaveInstanceState → MigLinks.restoreUrl)");
need(java.MigPage.includes('"MIGAppPrint"') && java.MigPage.includes("PrintManager"), "MigPage.java: the print bridge (window.print → MIGAppPrint → PrintManager)");
need(java.MigPage.includes('"MIGAppPull"') && java.MigPullLayout.includes("canChildScrollUp"), "MigPage.java / MigPullLayout.java: pull to reload asks the page (MIGAppPull)");
need(java.MigDownloads.includes("DownloadManager.Request") && !/new Intent\(Intent\.ACTION_VIEW, Uri\.parse\(url\)\)/.test(java.MigDownloads), "MigDownloads.java: web files go to DownloadManager, never ACTION_VIEW (an App Link would come back to the app: a loop)");
// the old system (CLAUDE.md rule 10) and the API / payment pages never open in the app from a link: MigLinks.isAppPage
const legacyFile = join(APP, "..", "deploy", "legacy-live.txt");
if (existsSync(legacyFile)) {
  for (const line of readFileSync(legacyFile, "utf8").split("\n")) {
    const path = line.trim();
    if (!path || path.startsWith("#")) continue;
    const rx = path.slice(1).replace(/\*$/, "").replace(/\./g, "\\\\.");
    need(java.MigLinks.includes(rx), `MigLinks.java NOT_APP_PAGE must keep ${path} (deploy/legacy-live.txt) out of the app`);
  }
} else notes.push("deploy/legacy-live.txt not found: the old system's paths were not compared with MigLinks.java");
for (const p of ["api(/.*)?", "media/", "(en/)?pay("]) need(java.MigLinks.includes(p), `MigLinks.java NOT_APP_PAGE must keep ${p} out of the app (app-links-live)`);
// the WebView layout: ours overrides Capacitor's (same class and id), so pull to reload and the load bar exist
const lay = read("android/app/src/main/res/layout/capacitor_bridge_layout_main.xml");
need(/<com\.getcapacitor\.CapacitorWebView\s+android:id="@\+id\/webview"/.test(lay) && lay.includes("MigPullLayout") && lay.includes('android:id="@+id/mig_progress"'), "layout/capacitor_bridge_layout_main.xml: the CapacitorWebView (id webview) inside MigPullLayout, with mig_progress");
const capLayout = join(APP, "node_modules/@capacitor/android/capacitor/src/main/res/layout/capacitor_bridge_layout_main.xml");
if (existsSync(capLayout)) {
  const cap = readFileSync(capLayout, "utf8");
  need(/<com\.getcapacitor\.CapacitorWebView\s+android:id="@\+id\/webview"/.test(cap) && (cap.match(/<[A-Za-z]/g) || []).length === 2, "Capacitor changed its own capacitor_bridge_layout_main.xml: compare it with app/android/app/src/main/res/layout/capacitor_bridge_layout_main.xml, which overrides it");
} else notes.push("node_modules not installed: Capacitor's own layout was not compared with the app's override (npm ci)");

// iOS
try { execFileSync("python3", [join(APP, "tools", "ios_project.py"), "--check"], { stdio: "pipe" }); }
catch (e) { errors.push(String(e.stdout || e.message).trim()); }

// store texts (fastlane layout): Google Play title 30 / short 80 / full 4000; App Store name 30 / subtitle 30 / promo 170 / keywords 100 bytes / description 4000
const len = (s) => [...s.replace(/\n$/, "")].length;
const limits = [
  ["store/fastlane/metadata/android/%/title.txt", 30], ["store/fastlane/metadata/android/%/short_description.txt", 80], ["store/fastlane/metadata/android/%/full_description.txt", 4000],
  ["store/fastlane/metadata/ios/%/name.txt", 30], ["store/fastlane/metadata/ios/%/subtitle.txt", 30], ["store/fastlane/metadata/ios/%/promotional_text.txt", 170], ["store/fastlane/metadata/ios/%/description.txt", 4000],
];
const locales = { android: ["ar", "en-US"], ios: ["ar-SA", "en-US"] };
for (const [pattern, max] of limits) {
  for (const loc of locales[pattern.includes("/android/") ? "android" : "ios"]) {
    const f = pattern.replace("%", loc);
    if (!existsSync(join(APP, f))) { errors.push(f + " is missing"); continue; }
    const n = len(read(f));
    need(n > 0 && n <= max, `${f}: ${n} characters (limit ${max})`);
  }
}
for (const loc of locales.ios) {
  const f = `store/fastlane/metadata/ios/${loc}/keywords.txt`;
  if (!existsSync(join(APP, f))) { errors.push(f + " is missing"); continue; }
  const b = Buffer.byteLength(read(f).replace(/\n$/, ""), "utf8");
  need(b <= 100, `${f}: ${b} bytes (limit 100)`);
}

// well-known templates (the site build writes the real files from seo/config.json "app": ../seo_app.part.py; these show the format)
const al = JSON.parse(read("well-known/assetlinks.json"));
need(al[0]?.target?.package_name === "com.madeinegyptgate.app", "assetlinks.json package_name");
need(JSON.stringify(al[0]?.relation) === JSON.stringify(["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"]), "assetlinks.json relation: handle_all_urls + get_login_creds (as the site build writes it)");
const aasa = JSON.parse(read("well-known/apple-app-site-association"));
need(Array.isArray(aasa?.applinks?.details) && aasa.applinks.details.every((d) => (d.appIDs || []).every((x) => x.endsWith(".com.madeinegyptgate.app"))), "apple-app-site-association appIDs");
// the API, payment pages, files and the old system stay in the browser, then every other page opens in the app (the first match wins)
const AASA_OUT = ["/api/*", "/pay*", "/media/*", "/panel.html", "/login.html"];
const comps = aasa?.applinks?.details?.[0]?.components || [];
need(JSON.stringify(comps.map((c) => [c["/"], c.exclude === true])) === JSON.stringify(AASA_OUT.map((p) => [p, true]).concat([["/*", false]])), "apple-app-site-association components: " + AASA_OUT.join(", ") + " excluded (the browser), then /* (app-links-live)");
need((aasa?.webcredentials?.apps || []).length === 1 && aasa.webcredentials.apps[0].endsWith(".com.madeinegyptgate.app"), "apple-app-site-association webcredentials.apps (saved passwords of the old-account form)");
const seoApp = join(APP, "..", "seo_app.part.py");
if (existsSync(seoApp)) {
  const py = readFileSync(seoApp, "utf8");
  const m = /AASA_BROWSER = \(([\s\S]*?)\)\n\n/.exec(py);
  const gen = m ? [...m[1].matchAll(/\('([^']+)',/g)].map((x) => x[1]) : [];
  need(JSON.stringify(gen) === JSON.stringify(AASA_OUT), "../seo_app.part.py AASA_BROWSER must list exactly " + AASA_OUT.join(", ") + " (the template and the site build agree)");
  need(py.includes("'delegate_permission/common.get_login_creds'"), "../seo_app.part.py assetlinks(): the get_login_creds relation");
} else notes.push("../seo_app.part.py not found: the app-links templates were not compared with the site build");

for (const n of notes) console.log("note: " + n);
if (errors.length) {
  console.error("app check: " + errors.length + " problem(s)\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`app check: ok (${scripts.length} inline script(s)${acorn ? " ES5" : ""}, store texts within limits)`);
