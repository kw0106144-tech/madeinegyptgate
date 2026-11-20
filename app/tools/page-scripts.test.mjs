#!/usr/bin/env node
// Optional, not in CI: what the Android app's own scripts do inside a page, in a real Chrome with the native channels stubbed
// (MigPage.SCRIPT: pull to reload + print; MigDownloads.captureScript: page-made files; MigWindows.CALL_JS: "is a call open?").
// The JVM tests write the scripts first; then:
//   (cd android && ./gradlew testDebugUnitTest)                       # → android/app/build/mig-page-scripts/*.js
//   npm i --prefix /tmp/pw playwright-core@1.48.2
//   node tools/page-scripts.test.mjs [scripts dir] [dir with node_modules/playwright-core]   (CHROME=/path/to/chrome)
// Defaults: android/app/build/mig-page-scripts, $PLAYWRIGHT_DIR, /usr/bin/google-chrome. The harness itself is Node / Chrome
// test code; the scripts under test are ES5 (acorn --ecma5 android/app/build/mig-page-scripts/*.js).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] || join(APP, "android/app/build/mig-page-scripts");
const pwDir = process.argv[3] || process.env.PLAYWRIGHT_DIR || "/tmp/pw";
const { chromium } = createRequire(pwDir + "/")("playwright-core");
const PAGE = readFileSync(dir + "/page.js", "utf8");
const CAP = readFileSync(dir + "/download-capture.js", "utf8"); // key 0123456789abcdef
const CALL = readFileSync(dir + "/call-open.js", "utf8");
const stubs = `window.__msgs=[];['MIGAppPull','MIGAppPrint','MIGAppDownload'].forEach(function(n){window[n]={postMessage:function(m){window.__msgs.push([n,m]);}};});`;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); };
const html = `<!doctype html><html><head><meta name=viewport content="width=device-width"><style>
body{margin:0;font:16px sans-serif} .long{height:3000px} #box{height:100px;overflow-y:auto} #box div{height:400px}
#drawer{position:fixed;top:0;right:0;width:200px;height:200px;background:#eee} canvas{width:100px;height:100px}
</style></head><body><p id=text>hello</p><div id=box><div>scroll</div></div><div id=drawer><b id=inDrawer>basket</b></div>
<canvas id=cv></canvas><a id=plain href="/x/">plain</a><iframe id=fr src="/frame/"></iframe><div class=long></div></body></html>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
await ctx.route("https://madeinegyptgate.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: r.request().url().includes("/frame/") ? "<p>frame</p>" : html }));
await ctx.addInitScript({ content: stubs + PAGE + CAP });
const page = await ctx.newPage();
await page.goto("https://madeinegyptgate.com/");
const touch = (sel, n = 1) => page.evaluate(([sel, n]) => {
  window.__msgs = [];
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const ts = [];
  for (let i = 0; i < n; i++) ts.push(new Touch({ identifier: i + 1, target: el, clientX: r.left + 5 + i, clientY: r.top + 5 }));
  el.dispatchEvent(new TouchEvent("touchstart", { touches: ts, targetTouches: ts, changedTouches: ts, bubbles: true, cancelable: true }));
  return window.__msgs.filter((m) => m[0] === "MIGAppPull").map((m) => m[1]);
}, [sel, n]);
// pull to reload
ok(JSON.stringify(await touch("#text")) === '["1"]', "pull: at the top, on text → yes");
ok(JSON.stringify(await touch("#box div")) === '["0"]', "pull: inside a box that scrolls → no");
ok(JSON.stringify(await touch("#inDrawer")) === '["0"]', "pull: inside a fixed panel (the market basket) → no");
ok(JSON.stringify(await touch("#cv")) === '["0"]', "pull: on a canvas (a map) → no");
ok(JSON.stringify(await touch("#text", 2)) === "[]", "pull: two fingers (a pinch) → nothing sent");
await page.evaluate(() => document.documentElement.classList.add("jnl-on"));
ok(JSON.stringify(await touch("#text")) === '["0"]', "pull: during a live call (html.jnl-on) → no");
await page.evaluate(() => { document.documentElement.classList.remove("jnl-on"); document.documentElement.classList.add("nav-open"); });
ok(JSON.stringify(await touch("#text")) === '["0"]', "pull: phone menu open (html.nav-open) → no");
await page.evaluate(() => { document.documentElement.classList.remove("nav-open"); document.body.style.overflow = "hidden"; });
ok(JSON.stringify(await touch("#text")) === '["0"]', "pull: the page locked its scrolling (a dialog) → no");
await page.evaluate(() => { document.body.style.overflow = ""; window.scrollTo(0, 200); });
await page.waitForTimeout(100);
ok(JSON.stringify(await touch("#text")) === '["0"]', "pull: scrolled down → no");
await page.evaluate(() => window.scrollTo(0, 0));
// print
const pr = await page.evaluate(() => { window.__msgs = []; window.print(); return window.__msgs; });
ok(JSON.stringify(pr) === '[["MIGAppPrint","print"]]', "print: window.print() → MIGAppPrint");
const framePrint = await page.evaluate(() => { const w = document.getElementById("fr").contentWindow; return String(w.print).indexOf("MIGAppPrint") < 0; });
ok(framePrint, "print: a frame (the call's shared screen) keeps the WebView's own print");
// downloads
const dl = await page.evaluate(() => new Promise((res) => {
  window.__msgs = [];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿\"id\",\"name\"\n\"1\",\"مصنع\""], { type: "text/csv;charset=utf-8" }));
  a.download = "invoices-2026-11-20.csv";
  document.body.appendChild(a); a.click(); // data/acc.js saveBlob: click, revoke after 500 ms
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  setTimeout(() => res(window.__msgs), 900);
}));
const m = dl.filter((x) => x[0] === "MIGAppDownload").map((x) => JSON.parse(x[1]));
ok(m.length === 1 && m[0].k === "0123456789abcdef" && m[0].name === "invoices-2026-11-20.csv" && /^data:text\/csv/.test(m[0].data), "download: a page-made blob (Control Center export) → name, type, data, key");
const csv = m.length ? Buffer.from(m[0].data.split(",")[1], "base64").toString("utf8") : "";
ok(csv.includes("مصنع"), "download: the file's bytes arrive whole (UTF-8)");
const dd = await page.evaluate(() => new Promise((res) => {
  window.__msgs = [];
  document.body.insertAdjacentHTML("beforeend", '<a id=ics download="meeting-with-janna.ics" href="data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR">add</a>');
  document.getElementById("ics").click();
  setTimeout(() => res(window.__msgs), 200);
}));
const d2 = dd.filter((x) => x[0] === "MIGAppDownload").map((x) => JSON.parse(x[1]));
ok(d2.length === 1 && d2[0].name === "meeting-with-janna.ics" && d2[0].data.startsWith("data:text/calendar"), "download: a data: link with download=… (the call's «أضف للتقويم») → its own name");
const prevented = await page.evaluate(() => new Promise((res) => {
  window.__msgs = [];
  document.body.insertAdjacentHTML("beforeend", '<a id=stop download="x.csv" href="data:text/csv,a">x</a>');
  const a = document.getElementById("stop"); a.addEventListener("click", (e) => e.preventDefault());
  a.click(); setTimeout(() => res(window.__msgs.length), 200);
}));
ok(prevented === 0, "download: a click the page cancelled itself → nothing");
const plain = await page.evaluate(() => { window.__msgs = []; const a = document.getElementById("plain"); let def = null; window.addEventListener("click", (e) => { def = e.defaultPrevented; e.preventDefault(); }, { once: true }); a.click(); return [window.__msgs.length, def]; });
ok(plain[0] === 0 && plain[1] === false, "download: an ordinary link is left alone");
// CALL_JS
ok((await page.evaluate(CALL)) === false, "call: no call → false");
ok((await page.evaluate(`document.documentElement.classList.add('jnl-on');` + CALL)) === true, "call: html.jnl-on (no JANNA_LIVE) → true");
ok((await page.evaluate(`document.documentElement.classList.remove('jnl-on'); window.JANNA_LIVE={isOpen:function(){return true;}};` + CALL)) === true, "call: JANNA_LIVE.isOpen() → true");
ok((await page.evaluate(`window.JANNA_LIVE={isOpen:function(){return false;}};` + CALL)) === false, "call: JANNA_LIVE.isOpen() false → false");
await browser.close();
console.log(fails ? fails + " failed" : "all passed");
process.exit(fails ? 1 : 0);
