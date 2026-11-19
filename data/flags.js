/* data/flags.js — MIGFLAGS: the platform's feature switches as the site's pages see them (Control Center «🛠️ المطوّر» → «المزايا»,
   owner only; registry worker/src/flags.js). Source: GET /api/settings → features {key: EFFECTIVE bool} (scopes client | both;
   Cache-Control public 60 s), kept for 3 minutes in this tab (sessionStorage "mig-flags") so a page never asks twice. The server
   enforces every switch itself (503 feature_off); this file only hides the UI of what is off. Fail-open: no API (static preview),
   a failed request, a missing key → the registry default (everything on, noise_mode_default off). Never blocks a page.
     MIGFLAGS.on(key)            → true / false (the default until the answer is in)
     MIGFLAGS.ready(fn, maxMs)   → fn() once the answer is in, or after maxMs (default 2500) with the defaults — never later
     MIGFLAGS.all() / .loaded() / .refresh() / .apply() (markup added later) / .msg(key)
   On the /intel/ pages (migate-intel takes the site's <head>), intel_pages never hides their own links: they stay served.
   Applied to the page: <html class="mig-off-<key>"> for every key that is off (CSS below hides the call buttons / intel links);
   [data-mig-feature~="key"] is hidden while the key is off; [data-mig-off~="key"] is shown only while it is off (an empty one gets the
   built-in message, e.g. the register page's «التسجيل الجديد موقوف مؤقتاً»). Event "mig:flags" {features, from} on window.
   ES5, no dependencies, ~3 KB. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIGFLAGS) return;
  var DEF = { janna_live: true, bassem_live: true, janna_welcome: true, standing_figures: true, noise_mode_default: false, intel_pages: true, registrations: true };
  var SK = "mig-flags", TTL = 180000, WAIT = 2500;
  var F = null, FROM = "", CBS = [], DONE = false, BUSY = false;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function en() { return W.MIGLANG === "en" || (D.documentElement.getAttribute("lang") || "").slice(0, 2) === "en"; }
  var MSG = {
    registrations: ["التسجيل الجديد موقوف مؤقتاً — جرّب تاني بعد شوية. لو عندك حساب على المنصة، ادخل بالإيميل بتاعه عادي.", "New registrations are paused for now — please try again later. If you already have an account, sign in with its e-mail as usual."],
    janna_live: ["مكالمات جنة المباشرة موقوفة مؤقتاً — تقدر تكلّمها كتابة من «اسأل جنة».", "Live calls with Janna are paused for now — you can still write to her via «Ask Janna»."],
    bassem_live: ["مكالمات باسم المباشرة موقوفة مؤقتاً — جرّب تاني بعد شوية.", "Live calls with Bassem are paused for now — please try again later."]
  };
  function on(k) { if (F && own(F, k)) return F[k]; return own(DEF, k) ? DEF[k] : true; }
  function all() { var o = {}, k; for (k in DEF) if (own(DEF, k)) o[k] = DEF[k]; if (F) for (k in F) if (own(F, k)) o[k] = F[k]; return o; }
  function clean(o) {
    if (!o || typeof o !== "object" || Object.prototype.toString.call(o) === "[object Array]") return null;
    var out = {}, n = 0; for (var k in o) if (own(o, k) && /^[a-z][a-z0-9_]{0,39}$/.test(k) && typeof o[k] === "boolean") { out[k] = o[k]; n++; }
    return n ? out : null;
  }
  /* every way into a live call: Janna's button, her invitation box's call, the contact page's «ابدأ اجتماع مع جنة» (#meetB), the meeting
     page's join / talk buttons (#mtgNow, #mtgGo), the forms' «احجز اجتماع مع جنة» ([data-mgq-meet]); Bassem's 🎥 on /advisor/ and in his bubble */
  var CSS = "html.mig-off-janna_live .jnl-btn,html.mig-off-janna_live .jw-sb .jw-acts .jw-call,html.mig-off-janna_live #meetB,html.mig-off-janna_live #mtgNow,html.mig-off-janna_live #mtgGo,html.mig-off-janna_live [data-mgq-meet]"
    + ",html.mig-off-bassem_live #advLive,html.mig-off-bassem_live .advlv,html.mig-off-bassem_live [data-bs=video],html.mig-off-bassem_live .bst-call"
    + ",html.mig-off-intel_pages a[href='/intel'],html.mig-off-intel_pages a[href^='/intel/'],html.mig-off-intel_pages a[href^='https://madeinegyptgate.com/intel/'],html.mig-off-intel_pages a[href^='https://www.madeinegyptgate.com/intel/'],html.mig-off-intel_pages [data-intel]{display:none!important}"
    + "[data-mig-off]{display:block;grid-column:1/-1;box-sizing:border-box;width:100%;max-width:880px;margin:0 auto 16px;padding:16px 18px;border-radius:14px;background:#FFF7E6;border:1px solid #F5DFA6;color:#7A5B00;font-weight:700;line-height:1.8;text-align:center}[data-mig-off][hidden]{display:none!important}";
  function style() {
    if (D.getElementById("mig-flags-css")) return;
    var s = D.createElement("style"); s.id = "mig-flags-css"; s.textContent = CSS; (D.head || D.documentElement).appendChild(s);
  }
  function each(sel, fn) { var l = D.querySelectorAll(sel); for (var i = 0; i < l.length; i++) try { fn(l[i]); } catch (e) {} }
  function keysOf(el, a) { return String(el.getAttribute(a) || "").split(/\s+/); }
  /* the /intel/ pages themselves (migate-intel, with the site's head scripts): the switch never hides their own links — they stay served */
  function onIntel() { try { return /^\/intel(\/|$)/.test(W.location.pathname || ""); } catch (e) { return false; } }
  function apply() {
    var de = D.documentElement, m = all();
    if (onIntel()) m.intel_pages = true;
    for (var k in m) if (own(m, k)) { var c = "mig-off-" + k; if (m[k] === false) { if ((" " + de.className + " ").indexOf(" " + c + " ") < 0) de.className = (de.className ? de.className + " " : "") + c; } else de.className = (" " + de.className + " ").replace(" " + c + " ", " ").replace(/^\s+|\s+$/g, ""); }
    if (!D.body) return;
    each("[data-mig-feature]", function (el) { var off = keysOf(el, "data-mig-feature").some(function (x) { return x && on(x) === false; }); if (off) { if (!el.hasAttribute("data-mig-was")) el.setAttribute("data-mig-was", el.hidden ? "1" : "0"); el.hidden = true; } else if (el.hasAttribute("data-mig-was")) { el.hidden = el.getAttribute("data-mig-was") === "1"; el.removeAttribute("data-mig-was"); } });
    each("[data-mig-off]", function (el) {
      var ks = keysOf(el, "data-mig-off"), off = ks.filter(function (x) { return x && on(x) === false; });
      el.hidden = !off.length;
      if (off.length && !el.getAttribute("data-mig-own") && MSG[off[0]]) { if (!el.textContent.replace(/\s+/g, "")) el.setAttribute("data-mig-filled", "1"); if (el.getAttribute("data-mig-filled")) { el.textContent = MSG[off[0]][en() ? 1 : 0]; el.setAttribute("role", "status"); el.setAttribute("translate", "no"); } }
    });
  }
  function settle(map, from) {
    var was = F ? JSON.stringify(F) : "";
    if (map) { F = map; FROM = from; }
    style(); apply();
    if (!DONE || (map && JSON.stringify(F) !== was)) {
      DONE = true;
      try { W.dispatchEvent(new CustomEvent("mig:flags", { detail: { features: all(), from: FROM || "default" } })); } catch (e) {}
    }
    var l = CBS; CBS = []; for (var i = 0; i < l.length; i++) { try { l[i](); } catch (e) {} }
  }
  function cached() {
    try { var o = JSON.parse(W.sessionStorage.getItem(SK) || "null"); if (o && +o.t > 0 && Date.now() - o.t < TTL && Date.now() >= o.t) return clean(o.f); } catch (e) {}
    return null;
  }
  function fetchNow() {
    if (BUSY || !W.fetch) { if (!W.fetch) settle(null, "default"); return; }
    BUSY = true;
    var fin = false, ctl = W.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (fin) return; fin = true; BUSY = false; try { if (ctl) ctl.abort(); } catch (e) {} settle(null, "default"); }, 4000);
    fetch("/api/settings", { method: "GET", headers: { Accept: "application/json" }, credentials: "omit", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok || (r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw new Error("no api");
      return r.json();
    }).then(function (j) {
      if (fin) return; fin = true; BUSY = false; clearTimeout(tm);
      var f = clean(j && j.features);
      if (f) { try { W.sessionStorage.setItem(SK, JSON.stringify({ t: Date.now(), f: f, v: String((j && j.features_v) || "") })); } catch (e) {} }
      settle(f, f ? "api" : "default");
    }, function () { if (fin) return; fin = true; BUSY = false; clearTimeout(tm); settle(null, "default"); });
  }
  W.MIGFLAGS = {
    on: on, all: all, defaults: function () { var o = {}; for (var k in DEF) if (own(DEF, k)) o[k] = DEF[k]; return o; },
    loaded: function () { return DONE; }, from: function () { return FROM || "default"; },
    ready: function (fn, max) {
      if (typeof fn !== "function") return;
      if (DONE) { fn(); return; }
      var ran = false, once = function () { if (ran) return; ran = true; fn(); };
      CBS.push(once); setTimeout(once, max > 0 ? max : WAIT);
    },
    refresh: function () { try { W.sessionStorage.removeItem(SK); } catch (e) {} fetchNow(); },
    /* a page that renders [data-mig-feature] / [data-mig-off] after the answer (e.g. the meeting page) applies them again */
    apply: function () { try { apply(); } catch (e) {} },
    msg: function (k) { return MSG[k] ? MSG[k][en() ? 1 : 0] : ""; }
  };
  var c = cached();
  if (c) settle(c, "cache"); else { style(); apply(); fetchNow(); }
  /* the page's own markup ([data-mig-feature] / [data-mig-off]) once it is parsed */
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", function () { apply(); });
})();
