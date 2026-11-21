/* data/guard.js — «حماية الموقع» (owner 2026-11-21: «عايزك تقفل ان اي حد يقدر يسحب ب control s الفرونت او الكود او جنه او باسم ولو حد
   حاول يدخل يجيب احنا بانيين الموقع ازاي كل ده يبقي مقفول ويجيلي نوتيفكشن»). Loaded on every page (seo_build.part.py head_html, the
   Control Center /admin/ and the kiosk janna.html), ES5, no dependencies.
   The honest limit: what a browser shows it has downloaded, so nothing here can make copying impossible — it makes it harder and
   reports the attempts. The secret parts (the Worker's code, the keys, Janna's and Bassem's instructions on Anam, member data) never
   reach a browser at all.
   - Ctrl/Cmd+S (save), Ctrl+U / Cmd+Opt+U (view source), F12, Ctrl+Shift+I|J|C, Cmd+Opt+I|J|C, Cmd+Shift+C (developer tools): the
     browser's action is cancelled. Nothing else: typing, copy / paste, Ctrl+P (print), Ctrl+F, AltGr letters, an IME, the screen
     readers' keys (Insert / Ctrl+Opt combos) and Ctrl+U inside an editable field (underline) are left alone.
   - Right-click and drag on pictures, videos, canvases and SVG, and on the figures of Janna and Bassem and the hologram (a link or a
     button inside them keeps its own menu); no selection on Janna's / Bassem's elements (their input fields stay selectable); no iOS
     long-press "save image" on pictures and videos.
   - Developer tools opened (approximate: a docked panel shrinks the page by a lot without a zoom change — desktops only).
   - Each kind of attempt is reported ONCE per page (≤ 6 a page) with navigator.sendBeacon to POST /api/ev/guard {t, p}: the kind and
     the page's path only. The Worker (worker/src/guard.js) adds a daily visitor hash and the browser family — no IP is stored — and
     e-mails the owner a summary at most once an hour. Not reported: bots, the staff pages (/admin/, /seo-admin/, /seo-team/,
     /data-desk/, /inbox/: the team works with the developer tools there — the keys are still guarded), frames, other hosts.
   - Search engines and screen readers see the page exactly as before (nothing is hidden, no text changes).
   - The platform's apps (user agent «MIGApp/…») follow exactly the same rules.
   Switches: the owner's «🛠️ المطوّر» → «المزايا» → site_guard (data/flags.js MIGFLAGS, else GET /api/settings, kept 3 minutes in this
   tab) — OFF removes everything at once; a build-time kill is data-guard="off" on the script tag (seo/config.json "guard": {"kill": true}).
   In the console: MIGGUARD.state(). */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIGGUARD) return;
  var SC = D.currentScript || null;
  var ON = false, WHY = "", SENT = {}, N = 0, MAXN = 6, STYLE = null, BOUND = false;
  var UA = String((W.navigator && W.navigator.userAgent) || "");
  var BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;
  var STAFF = /^\/(?:en\/)?(?:admin|seo-admin|seo-team|data-desk|inbox)(?:[\/.?#]|$)/;
  var path = function () { try { return String(W.location.pathname || "/"); } catch (e) { return "/"; } };
  var top = (function () { try { return W.top === W; } catch (e) { return false; } })();
  var REPORT = (function () {
    try { return top && !BOT.test(UA) && !STAFF.test(path()) && W.location.protocol === "https:" && /(^|\.)madeinegyptgate\.com$/i.test(W.location.hostname); } catch (e) { return false; }
  })();
  W.MIGGUARD = { state: function () { return { on: ON, why: WHY, reported: SENT, report: REPORT }; } };
  if (SC && SC.getAttribute("data-guard") === "off") { WHY = "build_off"; return; }

  /* ---------- the beacon ---------- */
  function send(t) {
    if (!ON || !REPORT || SENT[t] || N >= MAXN) return;
    SENT[t] = 1; N++;
    var body = JSON.stringify({ t: t, p: path() });
    try { if (W.navigator.sendBeacon && W.navigator.sendBeacon("/api/ev/guard", body)) return; } catch (e) {}
    try { var x = new XMLHttpRequest(); x.open("POST", "/api/ev/guard", true); x.setRequestHeader("Content-Type", "text/plain;charset=UTF-8"); x.send(body); } catch (e2) {}
  }

  /* ---------- the keys ---------- */
  function editable(el) {
    for (var i = 0; el && el.nodeType === 1 && i < 30; el = el.parentNode, i++) {
      var n = String(el.nodeName || "").toUpperCase();
      if (n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || el.isContentEditable) return true;
    }
    return false;
  }
  /* the letter of a shortcut: the key's own letter, else the key code (an Arabic layout, Option on a Mac), else the physical key */
  function letterOf(e) {
    var s = String(e.key || "");
    if (/^[a-zA-Z]$/.test(s)) return s.toLowerCase();
    var k = e.keyCode || e.which || 0;
    if (k >= 65 && k <= 90) return String.fromCharCode(k + 32);
    var c = String(e.code || "");
    return /^Key[A-Z]$/.test(c) ? c.charAt(3).toLowerCase() : "";
  }
  function kindOf(e) {
    if (e.isComposing) return "";
    try { if (e.getModifierState && e.getModifierState("AltGraph")) return ""; } catch (x) {}
    if (e.key === "F12" || e.keyCode === 123) return "devtools_key";
    var L = letterOf(e), alt = !!e.altKey, sh = !!e.shiftKey, ctrl = !!e.ctrlKey, meta = !!e.metaKey;
    if (!L) return "";
    if (ctrl && !meta && !alt) {                     /* Windows, Linux, ChromeOS */
      if (!sh && L === "s") return "save";
      if (!sh && L === "u") return "source";
      if (sh && (L === "i" || L === "j" || L === "c")) return "devtools_key";
      return "";
    }
    if (meta && !ctrl) {                             /* macOS */
      if (!alt && !sh && L === "s") return "save";
      if (alt && !sh && L === "u") return "source";
      if (alt && (L === "i" || L === "j" || L === "c")) return "devtools_key";
      if (sh && !alt && L === "c") return "devtools_key";
    }
    return "";
  }
  function onKey(e) {
    if (!ON) return;
    var t = kindOf(e);
    if (!t || (t === "source" && editable(e.target))) return; /* Ctrl+U in a rich-text field = underline */
    try { e.preventDefault(); } catch (x) {}
    send(t);
  }

  /* ---------- pictures, videos and the personas ---------- */
  /* the figures of Janna (data/janna.js), Bassem (data/bassem.js, bassem-stand.js), the live call's video (janna-live.js, call-holo.js) and
     the hologram (holo.js) — not their chat text, whose links and buttons keep the browser's menu */
  var FIG = /(^|\s)(jn-fig|jn-stage|jn-photo|jn-pic|jn-svg|jn-mini|jn-spot|jn-beam|bs-fig|bs-pic|bs-photo|bs-mini|jv-cont|jv-holo|jv-lgm|jvh-[\w-]+|mgh[\w-]*|bst-fig|bst-pic|bst-img|jn-kiosk)(\s|$)/;
  var MEDIA = { IMG: 1, VIDEO: 1, CANVAS: 1, PICTURE: 1, SVG: 1 };
  function guarded(el) {
    for (var i = 0; el && el.nodeType === 1 && i < 30; el = el.parentNode, i++) {
      var n = String(el.nodeName || "").toUpperCase();
      if (n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || el.isContentEditable) return false;
      if (MEDIA[n]) return true;
      if (i > 0 && (n === "A" || n === "BUTTON" || n === "LABEL")) return false; /* a link around plain text: its own menu */
      var c = el.getAttribute ? String(el.getAttribute("class") || "") : "";
      if (c && FIG.test(c)) return true;
    }
    return false;
  }
  function onMenu(e) {
    if (!ON || !guarded(e.target)) return;
    try { e.preventDefault(); } catch (x) {}
    send("save_image");
  }
  function onDrag(e) {
    if (!ON || !guarded(e.target)) return;
    try { e.preventDefault(); } catch (x) {}
  }
  var SEL = "[class^='jn-'],[class*=' jn-'],.jnl,[class^='jnl-'],[class*=' jnl-'],[class^='bs-'],[class*=' bs-'],[class^='bst-'],[class*=' bst-']"
    + ",[class^='jv-'],[class*=' jv-'],[class^='jvh-'],[class*=' jvh-'],[class^='mgh'],[class*=' mgh'],[class^='jw-'],[class*=' jw-']";
  var TXT = SEL.split(",");
  var CSS = SEL + "{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}"
    + TXT.map(function (s) { return s + " input," + s + " textarea," + s + " select," + s + " [contenteditable]," + s + " [contenteditable] *"; }).join(",")
    + "{-webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text}"
    + "img,video,canvas,picture,svg{-webkit-user-drag:none;-webkit-touch-callout:none}";
  function addStyle() {
    if (STYLE || !D.createElement) return;
    try { STYLE = D.createElement("style"); STYLE.id = "mig-guard-css"; STYLE.textContent = CSS; (D.head || D.documentElement).appendChild(STYLE); } catch (e) { STYLE = null; }
  }

  /* ---------- developer tools opened (approximate, desktops only) ---------- */
  var DESK = !/Mobi|Android|iPhone|iPad|iPod|MIGApp/i.test(UA) && !((W.navigator.maxTouchPoints || 0) > 1 && /Macintosh/.test(UA));
  var Z0 = 0, GW = 0, GH = 0, dtT = 0;
  function gaps() { return [(W.outerWidth || 0) - (W.innerWidth || 0), (W.outerHeight || 0) - (W.innerHeight || 0)]; }
  function baseline() { var g = gaps(); Z0 = W.devicePixelRatio || 1; GW = g[0]; GH = g[1]; }
  function dtCheck() {
    dtT = 0;
    if (!ON || !DESK || SENT.devtools_open || !W.outerWidth || !W.outerHeight) return;
    if ((W.devicePixelRatio || 1) !== Z0) { baseline(); return; } /* a zoom change moves both sizes: a new baseline, no report */
    var g = gaps();
    if (g[0] - GW > 380 || g[1] - GH > 250) send("devtools_open");
    else { if (g[0] < GW) GW = g[0]; if (g[1] < GH) GH = g[1]; }
  }
  function onResize() { if (!dtT) dtT = W.setTimeout(dtCheck, 400); }

  /* ---------- on / off ---------- */
  function enable() {
    if (ON) return;
    ON = true; WHY = "";
    addStyle();
    if (!BOUND) {
      BOUND = true;
      W.addEventListener("keydown", onKey, true);
      D.addEventListener("contextmenu", onMenu, true);
      D.addEventListener("dragstart", onDrag, true);
      W.addEventListener("resize", onResize);
    }
    baseline();
  }
  function disable(why) {
    ON = false; WHY = why || "off";
    if (BOUND) {
      BOUND = false;
      W.removeEventListener("keydown", onKey, true);
      D.removeEventListener("contextmenu", onMenu, true);
      D.removeEventListener("dragstart", onDrag, true);
      W.removeEventListener("resize", onResize);
    }
    if (STYLE && STYLE.parentNode) STYLE.parentNode.removeChild(STYLE);
    STYLE = null;
  }
  function apply(v) { if (v === false) disable("switch_off"); else if (v === true && !ON && WHY === "switch_off") enable(); }

  /* the owner's switch: data/flags.js when the page has it (fail-open = ON), else GET /api/settings (kept 3 minutes in this tab) */
  var FK = "mig-guard-f", TTL = 180000;
  function viaFlags() {
    var F = W.MIGFLAGS;
    if (!F || typeof F.on !== "function") return false;
    var go = function () { try { apply(F.on("site_guard")); } catch (e) {} };
    if (typeof F.ready === "function") F.ready(go, 4000); else go();
    W.addEventListener("mig:flags", go);
    return true;
  }
  function viaApi() {
    var c = null;
    try { c = JSON.parse(W.sessionStorage.getItem(FK) || "null"); } catch (e) { c = null; }
    if (c && typeof c.on === "boolean" && typeof c.at === "number" && new Date().getTime() - c.at < TTL) { apply(c.on); return; }
    try {
      var x = new XMLHttpRequest();
      x.open("GET", "/api/settings", true);
      x.timeout = 6000;
      x.onload = function () {
        try {
          if (x.status !== 200) return;
          var j = JSON.parse(x.responseText || "null"), v = j && j.features ? j.features.site_guard : undefined;
          if (typeof v !== "boolean") return;
          try { W.sessionStorage.setItem(FK, JSON.stringify({ on: v, at: new Date().getTime() })); } catch (e2) {}
          apply(v);
        } catch (e3) {}
      };
      x.send();
    } catch (e4) {}
  }
  function switchLater() {
    if (viaFlags()) return;
    var done = false, once = function () { if (done) return; done = true; if (!viaFlags()) viaApi(); };
    if (D.readyState === "complete") once();
    else { W.addEventListener("load", once); W.setTimeout(once, 5000); }
  }

  enable();
  switchLater();
})();
