/* data/pwa.js — the installable app (PWA) on every page (seo_build.part.py pwa_head puts it in every <head>, defer). ES5, no dependencies.
   1. Registers /sw.js (scope "/", seo_build.part.py emit_pwa) after the page has loaded — only on https (or localhost), only in the top
      window (never inside a frame: Janna's / Bassem's shared screen is a same-origin iframe), and never inside the platform's own
      native app, which names itself in its user agent ("MIGApp"; it has its own shell and caching). Kill switch: a build with
      seo/config.json "pwa": {"kill": true} gives this tag data-pwa="off" → nothing is registered, the existing registration of /sw.js
      is removed and the app's caches (mig-pwa-*) are deleted.
   2. The install invitation (Arabic first, English twin; translate="no", this file renders both languages itself):
      - Android / Chrome / Edge / Samsung on a phone or tablet: the browser's beforeinstallprompt is kept (its own mini-bar is held
        back) and a slim bar at the top of the page offers «📲 نزّل التطبيق» + «تثبيت» (the browser's own install dialog) + ✕;
      - iPhone / iPad Safari (no install event there): the same bar with the hint «شارك ← أضف إلى الشاشة الرئيسية» and the share icon;
      - never when the site already runs as the app (display-mode standalone, navigator.standalone), never on the staff and members'
        pages (/admin/, /login/, /dashboard/, /advisor/, /meeting/, /inbox/, /seo-admin/, /seo-team/, /data-desk/, /pay/, the kiosk),
        never during a live call (html.jnl-on, JANNA_LIVE.live()) — a call that starts hides it —, not over the open phone menu, and on
        desktops never (the browser's own install button in the address bar stays);
      - not on the first seconds of a first visit: from the second page of the visit, or after 25 s on the first one; when the visitor
        has scrolled far down it waits until they are back near the top (the bar sits above the header, in the page flow, so it never
        covers Janna's figure, her box, the WhatsApp button or the captions);
      - ✕ (or «تثبيت» then «إلغاء» in the browser's dialog) → not again for 30 days on this browser (localStorage "mig-pwa-x"); an install
        → never again ("mig-pwa-in"). Without localStorage the bar is not shown at all (a dismissal could not be remembered).
   3. On an app page in English (MIGLANG "en": the page's own head names the Arabic manifest) the manifest link is switched to
      /manifest.en.webmanifest, so an English visitor installs the English app.
   window.MIGPWA: {off, app, state()} — state() tells what happened on this page (for support and tests). */
(function () {
  "use strict";
  var W = window, D = document, N = navigator, DE = D.documentElement, UA = N.userAgent || "";
  if (W.MIGPWA) return;
  var me = D.currentScript || null, i;
  if (!me) { var ss = D.getElementsByTagName("script"); for (i = ss.length - 1; i >= 0; i--) if (/\/data\/pwa\.js/.test(ss[i].src || "")) { me = ss[i]; break; } }
  var OFF = !!(me && me.getAttribute("data-pwa") === "off");
  var TOP = false; try { TOP = W.top === W.self; } catch (e) { TOP = false; }
  var APP = /\bMIGApp\b/.test(UA);
  var ST = { sw: "", banner: "", why: "" };
  W.MIGPWA = { off: OFF, app: APP, state: function () { return { sw: ST.sw, banner: ST.banner, why: ST.why, installed: installed(), off: OFF, app: APP, top: TOP }; } };
  if (!TOP) { ST.why = "frame"; return; }

  function en() { return W.MIGLANG === "en" || (DE.getAttribute("lang") || "").slice(0, 2) === "en"; }
  function T(ar, e) { return en() ? e : ar; }
  function now() { return new Date().getTime(); }
  function get(k, s) { try { return (s ? W.sessionStorage : W.localStorage).getItem(k); } catch (e) { return null; } }
  function put(k, v, s) { try { (s ? W.sessionStorage : W.localStorage).setItem(k, v); return true; } catch (e) { return false; } }
  function installed() {
    try {
      if (N.standalone === true) return true;
      if (W.matchMedia) { var m = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]; for (var j = 0; j < m.length; j++) if (W.matchMedia("(display-mode: " + m[j] + ")").matches) return true; }
    } catch (e) {}
    return false;
  }
  if (installed()) DE.className += (DE.className ? " " : "") + "mig-standalone";

  /* ---------- 3. the English manifest on app pages in English ---------- */
  function fitLang() {
    if (!en()) return;
    var l = D.querySelector('link[rel="manifest"]'), t = D.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (l && /\/manifest\.webmanifest$/.test(l.getAttribute("href") || "")) l.setAttribute("href", "/manifest.en.webmanifest");
    if (t && /[؀-ۿ]/.test(t.getAttribute("content") || "")) t.setAttribute("content", "Made in Egypt");
  }
  fitLang();

  /* ---------- 1. the service worker ---------- */
  function secure() { return location.protocol === "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); }
  var SW = "serviceWorker" in N && secure();
  function unregister() {
    try {
      N.serviceWorker.getRegistrations().then(function (rs) {
        for (var j = 0; j < rs.length; j++) { var w = rs[j].active || rs[j].waiting || rs[j].installing; if (w && /\/sw\.js(\?|$)/.test(w.scriptURL || "")) rs[j].unregister(); }
      }, function () {});
      if (W.caches && W.caches.keys) W.caches.keys().then(function (ks) { for (var j = 0; j < ks.length; j++) if (ks[j].indexOf("mig-pwa-") === 0) W.caches["delete"](ks[j]); }, function () {});
    } catch (e) {}
  }
  function register() {
    if (!SW) { ST.sw = "unsupported"; return; }
    if (OFF || APP) { ST.sw = OFF ? "off" : "app"; unregister(); return; }
    try {
      N.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(function () { ST.sw = "registered"; }, function (e) { ST.sw = "failed: " + (e && e.message || e); });
      ST.sw = "registering";
    } catch (e) { ST.sw = "failed"; }
  }
  function afterLoad(fn, ms) { var go = function () { setTimeout(fn, ms); }; if (D.readyState === "complete") go(); else W.addEventListener("load", go); }
  afterLoad(register, 1200);

  /* ---------- 2. the install invitation ---------- */
  var QUIET_RX = /^\/(?:en\/)?(?:admin|login|dashboard|advisor|meeting|inbox|seo-admin|seo-team|data-desk|pay|panel|janna)(?:[\/.?#]|$)/;
  var QUIET_KEYS = { admin: 1, signin: 1, dashboard: 1, advisor: 1, meeting: 1, inbox: 1, "seo-admin": 1, "seo-team": 1, "data-desk": 1, pay: 1, janna: 1 };
  var MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (/Macintosh/.test(UA) && N.maxTouchPoints > 1);
  var IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && N.maxTouchPoints > 1);
  var IOS_SAFARI = IOS && /Safari\//.test(UA) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|TikTok|musical_ly|Pinterest|LinkedInApp|MicroMessenger/.test(UA);
  var KX = "mig-pwa-x", KI = "mig-pwa-in", KPV = "mig-pwa-pv", DAYS = 30, FIRST_WAIT = 25000;
  var BIP = null, EL = null, WANT = "", T0 = now();
  var PV = (+(get(KPV, 1) || 0) || 0) + 1; put(KPV, String(PV), 1);
  function quiet() { return QUIET_RX.test(location.pathname) || !!QUIET_KEYS[W.MIGPAGE || ""] || !!W.JANNA_KIOSK || !!W.JANNA_EMBED; }
  function live() { try { return DE.className.indexOf("jnl-on") > -1 || !!(W.JANNA_LIVE && W.JANNA_LIVE.live && W.JANNA_LIVE.live()); } catch (e) { return false; } }
  function remembered() { if (get(KI)) return true; var t = +(get(KX) || 0); return t > 0 && now() - t < DAYS * 864e5; }
  function storage() { try { W.localStorage.setItem("mig-pwa-t", "1"); W.localStorage.removeItem("mig-pwa-t"); return true; } catch (e) { return false; } }
  function blocked() {
    if (OFF) return "off"; if (APP) return "app"; if (!MOBILE) return "desktop"; if (quiet()) return "quiet page"; if (installed()) return "installed";
    if (!storage()) return "no storage"; if (remembered()) return "dismissed"; return "";
  }

  W.addEventListener("beforeinstallprompt", function (e) {
    if (!MOBILE || OFF || APP) return;          /* desktops keep the browser's own install button */
    try { e.preventDefault(); } catch (x) {}    /* phones: our bar instead of the browser's mini-bar (also silent on the quiet pages) */
    BIP = e;
    want("prompt");
  });
  W.addEventListener("appinstalled", function () { put(KI, "1"); BIP = null; hide(); ST.banner = "installed"; });
  if (IOS_SAFARI) want("ios");

  function want(kind) {
    var why = blocked();
    if (why) { ST.why = why; return; }
    if (EL || WANT === kind) return;
    WANT = kind;
    var wait = PV >= 2 ? 1500 : Math.max(1500, FIRST_WAIT - (now() - T0));
    setTimeout(function () { tryShow(kind); }, wait);
  }
  function tryShow(kind) {
    if (EL || blocked()) return;
    if (kind === "prompt" && !BIP) return;
    if (live() || DE.className.indexOf("nav-open") > -1 || !D.body) { ST.why = live() ? "live call" : "menu open"; setTimeout(function () { tryShow(kind); }, 4000); return; }
    var y = W.pageYOffset || DE.scrollTop || 0;
    if (y > 600) {
      ST.why = "scrolled";
      var onS = function () { if ((W.pageYOffset || DE.scrollTop || 0) < 300) { W.removeEventListener("scroll", onS); tryShow(kind); } };
      W.addEventListener("scroll", onS, { passive: true });
      return;
    }
    show(kind);
  }

  var SHARE = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function css() {
    if (D.getElementById("migPwaCss")) return;
    var s = D.createElement("style"); s.id = "migPwaCss";
    s.textContent = ".mig-pwa{position:relative;z-index:35;display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;margin:0;padding:8px 12px;background:#8E0B20;color:#fff;"
      + "font:600 14px/1.45 Cairo,Tahoma,\"Segoe UI\",sans-serif;box-shadow:0 2px 10px -4px rgba(0,0,0,.45);animation:migPwaIn .35s ease both}"
      + ".mig-pwa img{flex:none;width:40px;height:40px;border-radius:10px;background:#fff}"
      + ".mig-pwa .mp-t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}"
      + ".mig-pwa .mp-t b{font-weight:800;font-size:15px;line-height:1.35}"
      + ".mig-pwa .mp-t span{font-weight:500;font-size:12.5px;line-height:1.5;opacity:.95}"
      + ".mig-pwa .mp-t svg{display:inline-block;vertical-align:-3px;margin:0 2px}"
      + ".mig-pwa .mp-t i{font-style:normal;font-weight:800;white-space:nowrap}"
      + ".mig-pwa button{flex:none;cursor:pointer;-webkit-tap-highlight-color:transparent}"
      + ".mig-pwa .mp-go{min-height:40px;padding:6px 18px;border:0;border-radius:999px;background:#fff;color:#8E0B20;font:800 14px Cairo,Tahoma,\"Segoe UI\",sans-serif}"
      + ".mig-pwa .mp-x{width:40px;height:40px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:16px;line-height:40px}"
      + ".mig-pwa button:focus-visible{outline:2px solid #fff;outline-offset:2px}"
      + "html.jnl-on .mig-pwa{display:none!important}@media print{.mig-pwa{display:none!important}}"
      + "@keyframes migPwaIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.mig-pwa{animation:none}}";
    (D.head || DE).appendChild(s);
  }
  function show(kind) {
    var ios = kind === "ios", b = D.body;
    css();
    EL = D.createElement("div");
    EL.className = "mig-pwa"; EL.id = "migPwa";
    EL.setAttribute("role", "region"); EL.setAttribute("translate", "no");
    EL.setAttribute("aria-label", T("تثبيت تطبيق منصة صنع في مصر", "Install the Made in Egypt Gate app"));
    EL.setAttribute("dir", en() ? "ltr" : "rtl"); EL.setAttribute("lang", en() ? "en" : "ar");
    EL.innerHTML = '<img src="/img/app/icon-192.png" alt="" width="40" height="40">'
      + '<div class="mp-t"><b>' + T("📲 نزّل التطبيق", "📲 Get the app") + '</b><span>'
      + (ios ? T("اضغط " + SHARE + " <i>«شارك»</i> ← <i>«أضف إلى الشاشة الرئيسية»</i>", "Tap " + SHARE + " <i>Share</i> → <i>Add to Home Screen</i>")
             : T("منصة صنع في مصر على شاشة موبايلك", "Made in Egypt Gate on your phone's home screen")) + '</span></div>'
      + (ios ? "" : '<button type="button" class="mp-go">' + T("تثبيت", "Install") + "</button>")
      + '<button type="button" class="mp-x" aria-label="' + T("إغلاق", "Close") + '">✕</button>';
    var sk = b.querySelector("a.skip");
    if (sk && sk.parentNode === b) b.insertBefore(EL, sk.nextSibling); else b.insertBefore(EL, b.firstChild);
    ST.banner = kind; ST.why = "";
    EL.querySelector(".mp-x").onclick = function () { put(KX, String(now())); hide(); ST.banner = "dismissed"; };
    var go = EL.querySelector(".mp-go");
    if (go) go.onclick = function () {
      var p = BIP; BIP = null;
      if (!p || !p.prompt) { hide(); return; }
      try {
        var r = p.prompt();
        if (r && r.then) r.then(null, function () {});
      } catch (e) {}
      if (p.userChoice && p.userChoice.then) p.userChoice.then(function (c) { if (c && c.outcome === "accepted") { put(KI, "1"); ST.banner = "accepted"; } else { put(KX, String(now())); ST.banner = "declined"; } }, function () {});
      hide();
    };
    /* a live call that starts while the bar is up hides it (CSS html.jnl-on does too) */
    if (W.MutationObserver) { try { new MutationObserver(function () { if (live()) hide(); }).observe(DE, { attributes: true, attributeFilter: ["class"] }); } catch (e) {} }
  }
  function hide() { if (EL && EL.parentNode) EL.parentNode.removeChild(EL); EL = null; }
})();
