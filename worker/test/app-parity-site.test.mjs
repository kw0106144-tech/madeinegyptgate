// node --test for the SITE side of the app parity plan (2026-11-20): browser files run in a vm sandbox with a fake page, with and without
// the platform's own app's user agent («… MIGApp/1.0 (ios|android)»). Browsers must stay exactly as they are; inside the app:
//   data/flags.js   MIGFLAGS.app() / buyOff(), html.mig-off-app_buy_<p>, the memo of the app's switches, «الباقات والتسجيل» → «التسجيل»
//   data/mig-api.js the sign-in step {email, at} kept in localStorage (the app may be restarted while the member reads his code)
//   data/seo.js     no advertising / retargeting pixel in the iPhone app (first-party analytics stay)
//   data/pwa.js     navigator.share = the app's share sheet where the WebView has no Web Share
//   seo_build.part.py the head script that marks <html class="mig-app mig-app-<p>"> before the first paint
// Run: cd worker && npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const UA_WEB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MIGApp/1.0 (ios)";
const UA_AND = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 MIGApp/1.0 (android)";
function store(init) { const o = Object.assign({}, init || {}); return { o, getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: k => { delete o[k]; } }; }
const tick = () => new Promise(r => setTimeout(r, 0));

/* ---------- data/flags.js ---------- */
function flagsPage({ ua, features, ls = {}, anchors = [] } = {}) {
  const de = { className: "", getAttribute: k => (k === "lang" ? "ar" : null) }, events = [];
  const listeners = {}, styles = [];
  const doc = { documentElement: de, head: { appendChild(x) { styles.push(x); } }, body: {}, readyState: "complete", getElementById: () => null, createElement: () => ({ style: {} }),
    querySelectorAll: sel => (/#plans/.test(sel) ? anchors : []), addEventListener(n, fn) { (listeners[n] = listeners[n] || []).push(fn); } };
  const win = { navigator: { userAgent: ua }, sessionStorage: store(), localStorage: store(ls), addEventListener() {}, dispatchEvent: e => events.push(e) };
  win.fetch = () => Promise.resolve({ ok: true, headers: { get: () => "application/json" }, json: () => Promise.resolve({ features: features || {}, features_v: "v1" }) });
  const ctx = vm.createContext({ window: win, document: doc, fetch: win.fetch, setTimeout, clearTimeout, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; }, JSON, Object, String, Date, Math });
  vm.runInContext(read("data/flags.js"), ctx);
  return { win, doc, de, F: win.MIGFLAGS, events, listeners, css: () => styles.map(x => x.textContent || "").join("") };
}
const cls = de => (" " + de.className + " ");
/* a link; `inside` = the element it sits in ("NAV" / "HEADER" = the main menu, "SECTION" = a page's own text) */
function anchor(href, text, inside = "NAV", attrs = {}) { const a = { nodeType: 1, nodeName: "A", parentNode: { nodeType: 1, nodeName: inside, parentNode: null }, attrs: { href, ...attrs }, textContent: text, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; } }; return a; }

describe("data/flags.js — the app's switches", () => {
  test("a browser: no app, never buyOff, whatever the switches say", async () => {
    const P = flagsPage({ ua: UA_WEB, features: { app_buy_ios: false, app_buy_android: false } });
    await tick(); await tick();
    assert.equal(P.F.app(), ""); assert.equal(P.F.buyOff(), false);
    assert.equal(P.win.localStorage.getItem("mig-flags-app"), null, "no app memo in a browser");
  });
  test("the iPhone app: ON by default (exactly like the website); OFF from the server → buyOff, the html class, the memo", async () => {
    let P = flagsPage({ ua: UA_IOS, features: {} });
    assert.equal(P.F.app(), "ios"); assert.equal(P.F.buyOff(), false, "the default before and after the answer");
    await tick(); await tick();
    assert.equal(P.F.buyOff(), false);
    P = flagsPage({ ua: UA_IOS, features: { app_buy_ios: false, app_buy_android: true } });
    await tick(); await tick();
    assert.equal(P.F.buyOff(), true);
    assert.ok(cls(P.de).includes(" mig-off-app_buy_ios "), P.de.className);
    assert.deepEqual(JSON.parse(P.win.localStorage.getItem("mig-flags-app")), { app_buy_ios: false, app_buy_android: true });
    // the next cold start: the memo is the default until the server answers (no flash of prices)
    const Q = flagsPage({ ua: UA_IOS, features: {}, ls: { "mig-flags-app": JSON.stringify({ app_buy_ios: false }) } });
    assert.equal(Q.F.buyOff(), true, "from the first moment");
    assert.ok(cls(Q.de).includes(" mig-off-app_buy_ios "));
  });
  test("the Android app follows ITS switch only; the plans menu item becomes «التسجيل» (the form) while buying is off, and comes back", async () => {
    const a = anchor("/register/#plans", "الباقات والتسجيل");
    const P = flagsPage({ ua: UA_AND, features: { app_buy_ios: false, app_buy_android: true }, anchors: [a] });
    await tick(); await tick();
    assert.equal(P.F.app(), "android"); assert.equal(P.F.buyOff(), false);
    assert.deepEqual([a.textContent, a.getAttribute("href")], ["الباقات والتسجيل", "/register/#plans"]);
    const B = flagsPage({ ua: UA_AND, features: { app_buy_android: false }, anchors: [a] });
    await tick(); await tick();
    assert.equal(B.F.buyOff(), true);
    assert.deepEqual([a.textContent, a.getAttribute("href")], ["التسجيل", "/register/#form"]);
    // the switch back on: the menu item comes back as it was
    const C = flagsPage({ ua: UA_AND, features: { app_buy_android: true }, ls: { "mig-flags-app": JSON.stringify({ app_buy_android: false }) }, anchors: [a] });
    assert.equal(C.F.buyOff(), true, "the memo first");
    await tick(); await tick();
    assert.equal(C.F.buyOff(), false);
    assert.deepEqual([a.textContent, a.getAttribute("href"), a.hasAttribute("data-mig-buy-was")], ["الباقات والتسجيل", "/register/#plans", false]);
  });
  test("buying off (review F1): every link to the plans leads to the form — words kept outside the menu — and a link marked [data-mig-buy] is left to the CSS", async () => {
    const hub = anchor("/register/#plans", "🏭 سجّل منشأتك بالدليل الآن", "SECTION"), buy = anchor("/register/#plans", "📦 الباقات والأسعار ←", "SECTION", { "data-mig-buy": "" });
    const P = flagsPage({ ua: UA_IOS, features: { app_buy_ios: false }, anchors: [hub, buy] });
    await tick(); await tick();
    assert.deepEqual([hub.textContent, hub.getAttribute("href")], ["🏭 سجّل منشأتك بالدليل الآن", "/register/#form"], "a page's own link: the form, its words kept");
    assert.equal(buy.getAttribute("href"), "/register/#plans", "a buying link is hidden, not turned");
    // a link a page writes later (Janna's chat, the dashboard): turned at the tap, before the WebView follows it
    const late = anchor("register.html#plans", "الباقات", "SECTION"), inner = { nodeType: 1, nodeName: "SPAN", parentNode: late };
    assert.equal((P.listeners.click || []).length, 1, "one tap listener, in the app only");
    P.listeners.click[0]({ target: inner });
    assert.equal(late.getAttribute("href"), "register.html#form");
    const web = flagsPage({ ua: UA_WEB, features: { app_buy_ios: false }, anchors: [anchor("/register/#plans", "x", "SECTION")] });
    assert.equal((web.listeners.click || []).length, 0, "no tap listener in a browser");
    // the paid plans' own links (the banners' «احجز باقة …», the footer's «كن شريكاً») are hidden by the CSS, inside THAT app only
    const css = P.css();
    for (const h of ["partner", "strategic", "premium", "basic", "profile"])
      for (const p of ["ios", "android"]) assert.ok(css.includes(`html.mig-app-${p}.mig-off-app_buy_${p} a[href*='register'][href$='#${h}']`), p + " #" + h);
  });
  test("the CSS hides [data-mig-buy] only under html.mig-app-<p>.mig-off-app_buy_<p>", () => {
    const src = read("data/flags.js");
    assert.match(src, /html\.mig-app-ios\.mig-off-app_buy_ios \[data-mig-buy\],html\.mig-app-android\.mig-off-app_buy_android \[data-mig-buy\]/);
  });
});

/* ---------- seo_build.part.py: the head script (before the first paint) ---------- */
describe("the head script of every page (seo_build.part.py pwa_head APP_HEAD_JS)", () => {
  /* the Python string literals of the assignment, joined (comments between them skipped) → the <style> and the <script> */
  const src = read("seo_build.part.py"), a = src.indexOf("APP_HEAD_JS = ("), b = src.indexOf("</script>')", a);
  const joined = a > 0 && b > a ? [...src.slice(a, b + 11).matchAll(/r?'([^']*)'/g)].map(x => x[1]).join("") : "";
  const m = /<style>([\s\S]*?)<\/style><script>([\s\S]*?)<\/script>/.exec(joined), js = m ? m[2] : "";
  function run(ua, ls) {
    const de = { className: "x" };
    const ctx = vm.createContext({ navigator: { userAgent: ua }, document: { documentElement: de }, localStorage: store(ls), JSON });
    vm.runInContext(js, ctx);
    return de.className;
  }
  test("found, with its CSS for the app-only bits and for buying off (from the first paint)", () => {
    assert.ok(js.length > 100, "APP_HEAD_JS");
    assert.match(m[1], /html\.mig-app \[data-mig-app-only\]\[hidden\]\{display:inline!important\}/);
    assert.match(m[1], /html\.mig-app-ios\.mig-off-app_buy_ios \[data-mig-buy\],html\.mig-app-android\.mig-off-app_buy_android \[data-mig-buy\]\{display:none!important\}/);
  });
  test("browser: nothing; the apps: their marks; buying off remembered → its class at once", () => {
    assert.equal(run(UA_WEB), "x");
    assert.equal(run(UA_IOS), "x mig-app mig-app-ios");
    assert.equal(run(UA_AND), "x mig-app mig-app-android");
    assert.equal(run(UA_IOS, { "mig-flags-app": JSON.stringify({ app_buy_ios: false }) }), "x mig-app mig-app-ios mig-off-app_buy_ios");
    assert.equal(run(UA_AND, { "mig-flags-app": JSON.stringify({ app_buy_ios: false }) }), "x mig-app mig-app-android", "the other platform's memo does nothing");
  });
});

/* ---------- data/mig-api.js: the sign-in step (restore-place-and-signin-step) ---------- */
describe("data/mig-api.js pend(): where the code step is kept", () => {
  const src = read("data/mig-api.js"), a = src.indexOf('  var PK = "mig-sgn"'), b = src.indexOf("  function signinForm(host, o)");
  function run(ua) {
    const ls = store(), ss = store();
    const ctx = vm.createContext({ window: { navigator: { userAgent: ua } }, navigator: { userAgent: ua }, localStorage: ls, sessionStorage: ss, JSON });
    vm.runInContext(src.slice(a, b) + ";this.__pend = pend;", ctx);
    return { pend: ctx.__pend, ls, ss };
  }
  test("found", () => { assert.ok(a > 0 && b > a); });
  test("a browser: sessionStorage, as today; the app: localStorage (the app may be restarted) — never the code; null clears it", () => {
    const B = run(UA_WEB); B.pend({ email: "a@b.co", at: 5 });
    assert.ok("mig-sgn" in B.ss.o); assert.ok(!("mig-sgn" in B.ls.o));
    assert.deepEqual(B.pend(), { email: "a@b.co", at: 5 });
    for (const ua of [UA_IOS, UA_AND]) {
      const P = run(ua); P.pend({ email: "a@b.co", at: 7 });
      assert.ok("mig-sgn" in P.ls.o, ua); assert.ok(!("mig-sgn" in P.ss.o), ua);
      assert.deepEqual(P.pend(), { email: "a@b.co", at: 7 });
      P.pend(null); assert.ok(!("mig-sgn" in P.ls.o));
    }
    assert.match(src, /if \(pd && !\(age >= 0 && age < CODE_MS && RXM\.test\(pd\.email\)\)\)/, "the 10-minute limit is checked where it is read");
  });
});

/* ---------- data/seo.js: no ad pixels in the iPhone app (ios-ad-pixels) ---------- */
describe("data/seo.js", () => {
  const IDS = { google_ads: "AW-1", ga4: "G-1", meta_pixel: "111", snap_pixel: "s1", tiktok_pixel: "t1", linkedin_partner: "9", x_pixel: "x1", clarity: "c1", hotjar: "7", gtm: "GTM-1" };
  let src = read("data/seo.js");
  for (const [k, v] of Object.entries(IDS)) src = src.replace(new RegExp("(\\s" + k + ': )""'), '$1"' + v + '"');
  function run(ua) {
    const scripts = [], win = { MIGPAGE: "factories", dataLayer: null };
    const doc = { head: { appendChild: s => { if (s.src) scripts.push(s.src); } }, createElement: () => ({ setAttribute() {} }), addEventListener() {} };
    const ctx = vm.createContext({ window: win, document: doc, navigator: { userAgent: ua }, location: { pathname: "/factories/" }, localStorage: store(), Date, Object });
    vm.runInContext(src, ctx);
    return { scripts, win };
  }
  test("a browser: every configured tag (the test IDs) loads", () => {
    const r = run(UA_WEB).scripts.join(" ");
    for (const host of ["connect.facebook.net", "sc-static.net", "analytics.tiktok.com", "snap.licdn.com", "static.ads-twitter.com", "googletagmanager.com/gtag/js?id=G-1", "clarity.ms", "hotjar.com"]) assert.ok(r.includes(host), host);
  });
  test("the iPhone app: no Meta / Snap / TikTok / LinkedIn / X pixel and no Google Ads config — GA4, Clarity, Hotjar stay; GTM learns mig_app", () => {
    const R = run(UA_IOS), r = R.scripts.join(" ");
    for (const host of ["connect.facebook.net", "sc-static.net", "analytics.tiktok.com", "snap.licdn.com", "static.ads-twitter.com"]) assert.ok(!r.includes(host), host);
    assert.ok(r.includes("gtag/js?id=G-1") && r.includes("clarity.ms") && r.includes("hotjar.com"));
    assert.ok(!R.win.fbq && !R.win.snaptr, "no pixel queues");
    const cfg = (R.win.dataLayer || []).filter(x => x && x[0] === "config").map(x => x[1]);
    assert.ok(cfg.includes("G-1") && !cfg.includes("AW-1"), JSON.stringify(cfg));
    assert.ok((R.win.dataLayer || []).some(x => x && x.mig_app === "ios"));
  });
  test("the Android app keeps every tag (Apple's rule is the iPhone's)", () => { assert.ok(run(UA_AND).scripts.join(" ").includes("connect.facebook.net")); });
});

/* ---------- data/pwa.js: the app's share sheet (share-and-copy-links) ---------- */
describe("data/pwa.js navigator.share in the app", () => {
  function run(ua, nav, cap) {
    const win = { Capacitor: cap }, n = Object.assign({ userAgent: ua }, nav || {});
    win.top = {}; /* a frame for this test: pwa.js stops right after the share part */
    const doc = { currentScript: null, getElementsByTagName: () => [], documentElement: { className: "", getAttribute: () => "ar" } };
    const ctx = vm.createContext({ window: win, document: doc, navigator: n, location: { protocol: "https:", hostname: "madeinegyptgate.com" }, setTimeout, clearTimeout, String });
    vm.runInContext(read("data/pwa.js"), ctx);
    return { win, nav: n };
  }
  test("Android app without Web Share → the Capacitor Share plugin with {title, text, url}", async () => {
    const got = [], cap = { Plugins: { Share: { share: o => { got.push(o); return Promise.resolve({}); } } } };
    const R = run(UA_AND, {}, cap);
    assert.equal(typeof R.nav.share, "function");
    await R.nav.share({ title: "مصنع", url: "https://madeinegyptgate.com/factories/x/" });
    assert.deepEqual(JSON.parse(JSON.stringify(got)), [{ title: "مصنع", text: "", url: "https://madeinegyptgate.com/factories/x/", dialogTitle: "مصنع" }]); /* (another realm's objects) */
  });
  test("a browser, or an app that has Web Share, keeps its own", () => {
    assert.equal(run(UA_WEB, {}, { Plugins: { Share: { share() {} } } }).nav.share, undefined);
    const own = function () {}; assert.equal(run(UA_IOS, { share: own }, { Plugins: { Share: { share() {} } } }).nav.share, own);
  });
});

/* ---------- static guarantees in the call / chat / payment files (their behaviour is checked in the browser runs) ---------- */
describe("the app's words and switches in the browser files", () => {
  const LIVE = read("data/janna-live.js"), CHAT = read("data/janna.js"), WEL = read("data/janna-welcome.js"), PAY = read("data/pay.js");
  test("janna-live.js: the microphone is the app's, the Android wait is 60 s, a refused microphone never asks twice, the consent card before any session", () => {
    assert.match(LIVE, /اسمح للتطبيق يستخدم الميكروفون علشان تتكلم مع /);
    assert.match(LIVE, /الإعدادات ← صنع في مصر ← الميكروفون/); assert.match(LIVE, /إعدادات الموبايل ← التطبيقات ← صنع في مصر ← الأذونات ← الميكروفون/);
    assert.match(LIVE, /al\.href = "app-settings:"/);
    assert.match(LIVE, /var stl = INAPP && sdkBox\(\) \?/, "the «افتح الإعدادات» link in both apps (the Android app opens its own settings page for app-settings: too)");
    assert.match(LIVE, /INAPP === "android" \? 60000 : 15000/);
    assert.match(LIVE, /if \(!ms && INAPP === "android" && \(me\.micDenied \|\| me\.micErr === "NotAllowedError"\)\) \{ ms = silentMic\(\);/);
    assert.match(LIVE, /if \(!ov && aiNeed\(\) && !o\.__aiok\) \{ aiCard\(p, function \(\) \{ o\.__aiok = 1; open\(o\); \}\); return; \}/);
    assert.match(LIVE, /F\.on\(INAPP \? "call_consent_app" : "call_consent_web"\) === true/);
    assert.match(LIVE, /ff: 1, cs: 1 \};[^\n]*if \(aiOk\(\)\) b\.consent = true;/);
    assert.match(LIVE, /if \(c === "consent_required"\) \{ aiSet\(false\);/);
  });
  test("janna.js: the app's «nomic» without «المتصفح»; no price while buying is off there", () => {
    assert.match(CHAT, /"nomic\.app": \{ m: "empathetic", ar: "الميكروفون مش متاح للتطبيق/);
    assert.match(CHAT, /var NOMIC = \/\\bMIGApp\\b\/\.test\(navigator\.userAgent \|\| ""\) \? "nomic\.app" : "nomic";/);
    assert.match(CHAT, /if \(!o \|\| noBuy\(\)\) return null;/);
    assert.match(CHAT, /function planPriceTxt\(k\) \{\s*if \(noBuy\(\)\) return "";/);
  });
  test("janna-welcome.js: in the app she waits for a tap unless app_janna_autovoice is on", () => {
    assert.match(WEL, /function appQuiet\(\) \{ var F = W\.MIGFLAGS; return INAPP && !TAPPED && !\(F && F\.on && F\.on\("app_janna_autovoice"\) === true\); \}/);
    assert.match(WEL, /if \(!first\) \{ if \(!appQuiet\(\)\) tryVoice\(\); return; \}/);
    assert.match(WEL, /if \(fresh && appQuiet\(\)\) \{ sndShow\(\); armGesture\(\); \}/);
  });
  test("pay.js: the app opens the gateway in the in-app browser and confirms only when it is closed; buying off → the invoice only", () => {
    assert.match(PAY, /if \(inApp\(u, b, er\)\) return;/);
    assert.match(PAY, /BR\.addListener\("browserFinished"/);
    /* an app window without the bridge (a page opened over another one): the gateway goes to the phone's browser, this page stays and confirms on return */
    assert.match(PAY, /if \(APPUA\) away\(b, er, false\);/);
    assert.match(PAY, /T\("كمّل الدفع في صفحة بوابة الدفع الآمنة — لما ترجع هنا هنأكد الدفع", "Finish the payment on the secure payment gateway page — when you come back here, we will confirm the payment"\)/);
    assert.match(PAY, /if \(buyOff\(\)\) \{ box\(card\(i\) \+ msg\("info", "ℹ️", T\("الدفع مش متاح جوه التطبيق\."/);
  });
});
