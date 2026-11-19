#!/usr/bin/env node
// Offline checks of the app folder (no network, nothing is built): `cd app && npm run check`. CI runs it before every build.
//  - capacitor.config.json: the live site, the two allowed hosts, the user agent marks, no errorPath (the native code owns it)
//  - www/: index.html + offline.html exist, the offline page is self-contained (no other file of the app can be reached from it)
//    and its inline scripts parse as ES5 (the site's rule for browser code) when acorn is installed (see app/README.md)
//  - Android: permissions for the live calls, App Links filter, file chooser queries, strings in Arabic and English
//  - iOS: python3 tools/ios_project.py --check (purpose texts, InfoPlist.strings ar + en, entitlements, project file)
//  - store texts: the length limits of Google Play and the App Store
//  - well-known templates: valid JSON, placeholders still marked (they are filled when the owner has the keys)
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
need(/name="app_name">Made in Egypt Gate</.test(read("android/app/src/main/res/values/strings.xml")), "values/strings.xml app_name");
need(/name="app_name">صنع في مصر</.test(read("android/app/src/main/res/values-ar/strings.xml")), "values-ar/strings.xml app_name");
for (const f of ["MainActivity", "MigWebViewClient", "MigChromeClient", "MigDownloads", "MigLinks"]) need(existsSync(join(APP, `android/app/src/main/java/com/madeinegyptgate/app/${f}.java`)), f + ".java is missing");

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

// well-known templates
const al = JSON.parse(read("well-known/assetlinks.json"));
need(al[0]?.target?.package_name === "com.madeinegyptgate.app", "assetlinks.json package_name");
const aasa = JSON.parse(read("well-known/apple-app-site-association"));
need(Array.isArray(aasa?.applinks?.details) && aasa.applinks.details.every((d) => (d.appIDs || []).every((x) => x.endsWith(".com.madeinegyptgate.app"))), "apple-app-site-association appIDs");

for (const n of notes) console.log("note: " + n);
if (errors.length) {
  console.error("app check: " + errors.length + " problem(s)\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`app check: ok (${scripts.length} inline script(s)${acorn ? " ES5" : ""}, store texts within limits)`);
