/* Language engine: Arabic (default, RTL) ⇄ English (LTR). Load FIRST on every page.
   English: ?lang=en or the language button (remembered). Translates every text node and attribute — including content
   rendered later — from window.I18N_EN (data/i18n-en.js, Arabic→English, numbers as {n}).
   English first paint (bug sweep 2026-11-19, group 17): the whole dictionary is 7.8 MB, so an app page (site.py page()) names
   its own parts of it, written at build time by tools/i18n_subset.py (window.MIGI18N_SUB, /assets/i18n/<page>.<hash>.js):
   part 1 = what the page's markup asks for, loaded here; part 2 = everything else the page and its scripts can show, loaded
   by MIGI18N_MORE() — the script site.py puts right after the markup: it translates the markup, shows the page and loads
   part 2 before the page's own scripts run. Until then the page is hidden (never longer than WAIT ms). Every lookup the parts
   miss is checked against the Bloom filter of the full dictionary (MIGI18N_BLOOM, named by part 1, fetched once the page is
   up): when the full dictionary may have that entry, it is loaded (data/i18n-en.js), merged in (entries the page already has
   stay) and every text that missed is translated again from its Arabic original, so the page ends as it would with the full
   dictionary. Pages without parts (janna.html, the assistant on the generated pages) load the full dictionary as before. */
(function () {
  var q = /[?&]lang=(en|ar)\b/.exec(location.search), L = "ar";
  try { if (q) localStorage.setItem("mig-lang", q[1]); L = localStorage.getItem("mig-lang") || "ar"; } catch (e) { if (q) L = q[1]; }
  window.MIGLANG = L;
  window.MIGSETLANG = function (l) { try { localStorage.setItem("mig-lang", l); } catch (e) {} var u = location.href.replace(/([?&])lang=(en|ar)&?/, "$1").replace(/[?&]$/, ""); location.href = u; };
  if (L !== "en") return;
  var DE = document.documentElement, VER = window.MIGVER_EN || "", SUB = window.MIGI18N_SUB, WAIT = 6000;
  var FAST = typeof SUB === "string" && /^\/assets\/i18n\/[\w-]+\.[0-9a-f]{10}\.js$/.test(SUB) && document.readyState === "loading";
  if (!window.I18N_EN && document.readyState === "loading") {
    /* the page's part (and the whole dictionary only when the part could not be loaded) */
    if (FAST) document.write('<script src="' + SUB + '" charset="utf-8"><\/script><script>window.I18N_EN||document.write(\'<script src="data/i18n-en.js' + VER + '"><\\/script>\')<\/script>');
    else document.write('<script src="data/i18n-en.js' + VER + '"><\/script>');
  }
  DE.lang = "en"; DE.dir = "ltr";
  /* dates & numbers in English */
  var DTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (loc, o) { if (typeof loc === "string" && /^ar/.test(loc)) loc = /islamic/.test(loc) ? "en-u-ca-islamic-umalqura-nu-latn" : "en-GB"; return new DTF(loc, o); };
  Intl.DateTimeFormat.prototype = DTF.prototype; Intl.DateTimeFormat.supportedLocalesOf = DTF.supportedLocalesOf;
  var NUM = /[0-9٠-٩][0-9٠-٩,.:%/\-]*/g, AR = /[\u0600-\u06FF]/, D = null, done = new WeakMap(), HAS = Object.prototype.hasOwnProperty;
  /* TRACK = 1 while lookups go to the parts; MISS = keys they missed (not yet checked against the Bloom filter); REC = 1 while
     misses are kept in REDO = [node, what, Arabic, English]: the texts whose translation missed an entry, translated again from
     the Arabic when the dictionary grows (the fast path translates the markup before the page's own scripts add their pairs) */
  var TRACK = 0, REC = FAST ? 1 : 0, MISSED = 0, MISS = [], SEEN = Object.create(null), REDO = [], TT = null, FULL = 0, BF = null, BFAIL = 0, SCAN = 0;
  function dict() { if (!D) { if (!window.I18N_EN) return {}; D = window.I18N_EN; TRACK = FAST && window.MIGI18N_BLOOM && !FULL ? 1 : 0; } return D; }
  function look(k) {
    var v = dict()[k];
    if (v == null) { if (REC) MISSED = 1; if (TRACK && !SEEN[k]) { SEEN[k] = 1; MISS.push(k); if ((BF || BFAIL) && !SCAN) SCAN = setTimeout(scan, 0); } }
    return v;
  }
  /* «…» ، ؛ ؟ left around a translated core (the dictionary is keyed on the core) become their English forms “…” , ; ? */
  function af(x) { return x ? x.replace(/«/g, "“").replace(/»/g, "”").replace(/،/g, ",").replace(/؛/g, ";").replace(/؟/g, "?") : x; }
  function tr(s) {
    var t = s.replace(/\s+/g, " ").trim(); if (!t || !AR.test(t)) return null;
    var nums = [], k = t.replace(NUM, function (m) { nums.push(m); return "{n}"; }), v = look(k), x;
    if (v == null) { /* strip leading/trailing emoji, symbols and punctuation, translate the core */
      var m = /^([^\u0600-\u06FFA-Za-z0-9{]*)([\s\S]*?)([^\u0600-\u06FFA-Za-z0-9}]*)$/.exec(k);
      if (m && (m[1] || m[3]) && m[2]) {
        if ((x = look(m[2])) != null) v = af(m[1]) + x + af(m[3]);
        /* only one side stripped: «🏭 Name (ACME)» (the key keeps its closing bracket) or «Name.» with a leading symbol kept */
        else if (m[1] && m[3] && (x = look(m[2] + m[3])) != null) v = af(m[1]) + x;
        else if (m[1] && m[3] && (x = look(m[1] + m[2])) != null) v = x + af(m[3]);
      }
    }
    if (v == null && /، /.test(t)) { /* Arabic comma-separated lists */ var li = t.split("، "), okl = true, outl = li.map(function (x) { var r = tr(x); if (r == null) okl = false; return r == null ? x : r.trim(); }); if (okl) return s.match(/^\s*/)[0] + outl.join(", ") + s.match(/\s*$/)[0]; }
    if (v == null) { /* try parts split by common separators */ var parts = t.split(/( · | – | — | \| |: )/); if (parts.length > 1) { var ok = false, out = parts.map(function (p) { var r = /^( · | – | — | \| |: )$/.test(p) ? p : tr(p); if (r != null && r !== p) ok = true; return r == null ? p : r; }).join(""); return ok ? out : null; } return null; }
    var i = 0; v = v.replace(/\{n\}/g, function (m0, off) { var x = String(nums[i++] || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }), nx = v.charAt(off + 3); if (nx !== "" && /[,.:\/\-]$/.test(x)) x = x.slice(0, -1); return x; });
    var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0]; return lead + v + tail;
  }
  /* a text node's English (null: leave it) */
  function txt(p, s) {
    var r = tr(s); if (r == null && /^\s*[←→‹›]\s*$/.test(s)) r = (p.closest && p.closest(".crumb")) ? s.replace(/[‹›]/g, "›") : p.nodeName === "BUTTON" ? s.replace(/[←‹›]/g, function (c) { return c === "←" ? "→" : c === "‹" ? "›" : "‹"; }) : s.replace(/←/g, "→");
    if (r != null) r = /Previous|Prev\b|Back\b/i.test(r) ? r.replace(/→/g, "←") : r.replace(/←/g, "→");
    return r;
  }
  function keep(x) { var e = x[0]; return e.isConnected !== false && (x[1] === 0 ? e.nodeValue : x[1] === 1 ? e.value : e.getAttribute(x[1])) === x[3]; }
  function miss1(x) { REDO.push(x); if (REDO.length > 4000) REDO = REDO.filter(keep); }
  function node(n) {
    if (n.nodeType === 3) { var p = n.parentNode; if (!p || /^(SCRIPT|STYLE)$/.test(p.nodeName) || (p.closest && p.closest('[translate="no"]'))) return; if (done.get(n) === n.nodeValue) return; if (p.nodeName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", p.textContent); var s = n.nodeValue; MISSED = 0; var r = txt(p, s); if (r != null) n.nodeValue = r; done.set(n, n.nodeValue); if (MISSED) miss1([n, 0, s, n.nodeValue]); return; }
    if (n.nodeType !== 1) return;
    if (n.hasAttribute("dir") && n.getAttribute("dir") === "rtl") n.setAttribute("dir", "ltr");
    if (n.hasAttribute("lang") && n.getAttribute("lang") === "ar") n.setAttribute("lang", "en");
    ["placeholder", "title", "aria-label", "alt", "value"].forEach(function (a) { if (!n.hasAttribute(a)) return; if (a === "value" && !(n.nodeName === "INPUT" && /button|submit/.test(n.type))) { if (n.nodeName === "INPUT" && (n.type === "text" || n.type === "search" || !n.type) && AR.test(n.value)) { var s0 = n.value; MISSED = 0; var rv = tr(s0); if (rv != null) n.value = rv; if (MISSED) miss1([n, 1, s0, n.value]); } return; } var v = n.getAttribute(a); MISSED = 0; var r = tr(v); if (r != null) n.setAttribute(a, r); if (MISSED) miss1([n, a, v, n.getAttribute(a)]); });
    if (n.nodeName === "META") { var c = n.getAttribute("content"); MISSED = 0; var rc = c && tr(c); if (rc != null) n.setAttribute("content", rc); if (MISSED) miss1([n, "content", c, n.getAttribute("content")]); }
  }
  function walk(root) { if (!root) return; if (root.nodeType === 3) { node(root); return; } node(root); var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); var n; while ((n = w.nextNode())) node(n); }
  function title() { var s = document.title; MISSED = 0; var r = tr(s); if (r != null) document.title = r; if (MISSED) TT = [s, document.title]; }
  var css = document.createElement("style");
  css.textContent = 'body{direction:ltr}[dir="rtl"]{direction:ltr}.util .lng .l-en{display:none!important}.util .lng .l-ar{display:inline-flex!important}';
  document.head.appendChild(css);
  var pending = [], tmr = 0;
  var mo = new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === "characterData") pending.push(m.target); else { m.addedNodes.forEach(function (a) { pending.push(a); }); if (m.type === "attributes") pending.push(m.target); } }); if (!tmr) tmr = requestAnimationFrame(function () { tmr = 0; var p = pending; pending = []; p.forEach(walk); title(); }); });
  function observe() { mo.observe(DE, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "alt", "dir", "content"] }); }
  /* the dictionary is one large file: when it did not arrive (a cut-off download), fetch it once more and translate the page when it lands */
  function retry() {
    if (window.I18N_EN || retry.on) return; retry.on = 1;
    var sc = document.createElement("script"), v = window.MIGVER_EN || "";
    sc.src = "data/i18n-en.js" + v + (v ? "&" : "?") + "retry=1"; sc.charset = "utf-8"; sc.async = true;
    sc.onload = function () { D = null; walk(document.head); walk(document.body); title(); };
    (document.head || document.documentElement).appendChild(sc);
  }
  /* ---------- the part's fallback: the Bloom filter of every key of the full dictionary (FNV-1a + murmur3 mix, double hashing) */
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }
  function mix(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h | 1) >>> 0; }
  function inFull(k) { var B = window.MIGI18N_BLOOM, h1 = fnv(k), h2 = mix(h1); for (var i = 0; i < B.k; i++) { var b = (h1 + i * h2) % B.m; if (!(BF[b >> 3] & (1 << (b & 7)))) return false; } return true; }
  function scan() {
    SCAN = 0; if (!TRACK || FULL) { MISS = []; return; }
    while (MISS.length) { var k = MISS.pop(); if (dict()[k] != null) continue; if (BFAIL || inFull(k)) { MISS = []; full(); return; } }
  }
  function bloom() {
    var B = window.MIGI18N_BLOOM; if (!TRACK || bloom.on || !B) return; bloom.on = 1;
    var x = new XMLHttpRequest(); x.open("GET", B.u, true); x.responseType = "arraybuffer";
    x.onload = function () { if (x.status === 200 && x.response && x.response.byteLength * 8 >= B.m) BF = new Uint8Array(x.response); else BFAIL = 1; scan(); };
    x.onerror = function () { BFAIL = 1; scan(); };
    x.send();
  }
  /* texts that missed an entry are translated again from their Arabic original once the dictionary grew: the page's own scripts
     add entries after the first pass (site.py EN_JS, the meta description …), and the full dictionary may arrive */
  var dsize = -1;
  function redo(force) {
    if (!REDO.length && !TT) return;
    var D0 = window.I18N_EN, sz = D0 ? Object.keys(D0).length : 0;
    if (!force && sz === dsize) return; dsize = sz;
    var R = REDO; REDO = [];
    R.forEach(function (x) {
      var e = x[0], a = x[1], r;
      if (a === 0) { if (e.nodeValue !== x[3] || !e.parentNode) return; MISSED = 0; r = txt(e.parentNode, x[2]); if (r != null && r !== e.nodeValue) e.nodeValue = r; done.set(e, e.nodeValue); if (MISSED) REDO.push([e, 0, x[2], e.nodeValue]); }
      else if (a === 1) { if (e.value !== x[3]) return; MISSED = 0; r = tr(x[2]); if (r != null && r !== e.value) e.value = r; if (MISSED) REDO.push([e, 1, x[2], e.value]); }
      else { if (e.getAttribute(a) !== x[3]) return; MISSED = 0; r = tr(x[2]); if (r != null && r !== x[3]) e.setAttribute(a, r); if (MISSED) REDO.push([e, a, x[2], e.getAttribute(a)]); }
    });
    if (TT && document.title === TT[1]) { var t0 = TT[0], r1; TT = null; MISSED = 0; r1 = tr(t0); if (r1 != null && r1 !== document.title) document.title = r1; if (MISSED) TT = [t0, document.title]; }
  }
  /* the full dictionary, merged into the parts (the entries the page has stay: the parts' own and what its scripts set), then
     every text that missed is translated again. merger() catches the assignment data/i18n-en.js makes, merged() ends it */
  var CUR = null;
  function merger() {
    if (FULL) return false; FULL = 1; CUR = window.I18N_EN;
    try {
      Object.defineProperty(window, "I18N_EN", { configurable: true, enumerable: true, get: function () { return CUR; },
        set: function (v) { if (FULL === 1 && v && typeof v === "object" && v !== CUR) { for (var k in v) if (HAS.call(v, k) && !HAS.call(CUR, k)) CUR[k] = v[k]; FULL = 2; } else CUR = v; } });
    } catch (e) { FULL = 3; return false; }
    return true;
  }
  function merged() {
    try { delete window.I18N_EN; window.I18N_EN = CUR; } catch (e) {}
    if (FULL !== 2) { FULL = 3; return; }
    TRACK = 0; D = CUR; MISS = []; redo(true); if (start.on) { REC = 0; REDO = []; TT = null; }
  }
  function full() {
    if (!merger()) return;
    var sc = document.createElement("script");
    sc.src = "data/i18n-en.js" + VER; sc.charset = "utf-8"; sc.async = true;
    sc.onload = sc.onerror = merged;
    (document.head || DE).appendChild(sc);
  }
  /* ---------- the fast path: hidden until translated (never longer than WAIT ms) */
  var hide = null, wmo = null, tw = 0, more = 0;
  function reveal() { if (tw) { clearTimeout(tw); tw = 0; } if (hide && hide.parentNode) hide.parentNode.removeChild(hide); hide = null; }
  function pass() { walk(document.head); walk(document.body); title(); }
  function first() { if (first.on) return; first.on = 1; pass(); observe(); dsize = window.I18N_EN ? Object.keys(window.I18N_EN).length : 0; }
  /* part 2 of the page's dictionary (named by part 1): everything else the page and its scripts can show. MIGI18N_ADD() adds
     its entries (an entry the page already has stays) and translates again what missed one */
  function moreSrc() { var u = window.MIGI18N_MORE_SRC; return TRACK && typeof u === "string" && /^\/assets\/i18n\/[\w-]+-2\.[0-9a-f]{10}\.js$/.test(u) ? u : ""; }
  window.MIGI18N_ADD = function (o) {
    var cur = window.I18N_EN; more = 2; if (!o || typeof o !== "object" || !cur || typeof cur !== "object") return;
    for (var k in o) if (HAS.call(o, k) && !HAS.call(cur, k)) cur[k] = o[k];
    redo();
  };
  if (FAST) {
    /* site.py page() runs MIGI18N_MORE() right after the page's markup: translate the markup (part 1), show the page, then load
       part 2 before the page's own scripts run (they show the rest; the page paints while part 2 loads) */
    window.MIGI18N_MORE = function () {
      if (document.readyState !== "loading" || first.on) return;
      first(); reveal();
      var u = moreSrc(); if (u && !more) { more = 1; document.write('<script src="' + u + '" charset="utf-8"><\/script><script>window.MIGI18N_MISS2&&MIGI18N_MISS2()<\/script>'); }
    };
    window.MIGI18N_MISS2 = function () {
      if (more === 2 || !merger()) return;
      document.write('<script src="data/i18n-en.js' + VER + '" charset="utf-8"><\/script><script>window.MIGI18N_MERGED&&MIGI18N_MERGED()<\/script>');
    };
    window.MIGI18N_MERGED = merged;
    hide = document.createElement("style");
    hide.textContent = "body,body *{visibility:hidden!important}";
    document.head.appendChild(hide);
    tw = setTimeout(reveal, WAIT);
    /* the parser adding a script means every script before it has run: each one added translates again the texts that missed an
       entry its predecessors have added since (site.py EN_JS …). Without MIGI18N_MORE(), the first pass runs when the parser adds
       data/bot-en.js (site.py page(): the assistants' scripts follow the page's own) */
    wmo = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i].addedNodes;
        for (var j = 0; j < a.length; j++) {
          if (a[j].nodeName !== "SCRIPT") continue;
          if (!first.on) { if (!/(^|\/)data\/bot-en\.js(\?|$)/.test(a[j].getAttribute("src") || "")) continue; first(); reveal(); }
          redo();
        }
      }
    });
    wmo.observe(DE, { childList: true, subtree: true });
  }
  /* "content": meta descriptions that page scripts set after the first pass (MIGSEO) are translated too */
  function start() {
    start.on = 1; retry(); if (first.on) { pass(); redo(); } else first(); if (wmo) { wmo.disconnect(); wmo = null; } reveal();
    if (!TRACK) { REC = 0; REDO = []; TT = null; }
    var u = moreSrc(); if (u && !more) { more = 1; var sc = document.createElement("script"); sc.src = u; sc.charset = "utf-8"; sc.async = true; (document.head || DE).appendChild(sc); }
    if (FAST) setTimeout(bloom, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.MIGTR = function (s) { var r = tr(String(s)); return r == null ? s : r; };
  /* text drawn on <canvas> (maps) is not in the DOM: translate it at draw time */
  try { ["fillText", "strokeText"].forEach(function (f) { var C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, orig = C && C[f]; if (!orig) return; C[f] = function (t) { var a = [].slice.call(arguments); if (/[\u0600-\u06FF]/.test(a[0])) a[0] = window.MIGTR(a[0]); return orig.apply(this, a); }; }); } catch (e) {}
})();
