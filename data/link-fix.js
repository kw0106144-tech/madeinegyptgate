/* link-fix.js — the app's legacy links go straight to their clean pages, with no redirect screen in between.
   Owner 2026-11-18: «لما بضغط على أي صفحة في المنصة وأنا بتصفحها بييجي في ثانية شاشة فيها إيرور وبعدها بيفتح الصفحة عادي».
   Cause: the app pages (and data/*.js: Janna's results, the map, the bot, the overlay) still build links like company.html#N,
   region.html#CODE, city.html#ID, offer / opportunity / project / entity / winner / article / event / lead / export-market.html#…
   Each of those is a redirect stub (seo_build.part.py SHIM_TPL) that downloads its /_seo/hash/<type>.json map (the company map is
   ~430 KB, ~83 KB compressed) and only then jumps: meanwhile the visitor saw «جاري فتح الصفحة الجديدة… إن لم يتم التحويل
   تلقائياً…» on a bare grey page.
   1) Links are made clean IN PLACE (their href is rewritten, so a new tab, «copy link» and crawlers that run scripts get the final URL
      too), on the page as built and on everything the page renders later (a MutationObserver):
      - a stub link, with the SAME map and the SAME rules as the stub (internal links = the current numbering; no hash or no entry →
        the section hub). A member factory (company.html#N) needs no map when the page has the directory (data/oldfac.js): the
        generator writes its page at /factories/<slug of MIGOLDFAC[N][7]>/ (seo_build.part.py), so the path comes from the record.
      - an app page's old name (bourse.html#x, market.html, legal.html#privacy, factories.html#q=… …) → its clean path, by the same
        rules as the build (seo_rewrite_links: seo/config.json static_paths; a generated hub with a #fragment → its interactive page).
        /panel.html and /login.html are the owner's old system and are never touched.
      - a link to this site on www. / as an absolute URL → this origin (one hop less).
      - a directory link that carries a query (data-q / data-fq on a link to the factories directory — the home banners, the city
        pages …) → /factories/search/#q=<query>, which that page reads (the hub /factories/ does not read the old sessionStorage
        «mig-q» any more).
      - English (window.MIGLANG === "en" on a page outside /en/: an app page that switched itself to English): every link to a page
        that HAS an /en/ twin (/_seo/en-paths.json, the build's own list) → that twin; app pages without one (/market/, /register/ …)
        stay as they are (they switch to English themselves). A stub page without a twin gets ?lang=en, as the stub does. Links
        that choose a language on purpose (hreflang, data-lang, lang="ar") and the sign-in link (data-mig-dash) are left alone.
   2) A plain left click on a link that is not clean yet (its map is still on its way) is resolved the same way and the browser goes
      to the final URL directly; meanwhile the current page stays and a thin line runs along the top. The maps a page's links need are
      fetched once the page is idle, never in the way of its own files (the company map only when the page has company links it cannot
      resolve from the directory and the visitor is not on Save-Data, else when the pointer/finger comes near one; the English list
      only in English); a click or a pointer near a link fetches its map at once.
   The app pages' own templates (home2.part.html, market.part.html, pages.part.py, map.part.py …) already write the clean URL where the
   record gives it (member factories, products, app pages, the directory search); what is left for this file are the links whose
   path only the generator's maps know (articles, cities, governorates, offers, awards, projects, tenders, researched factories).
   Anything unusual — modifier keys, download links, a click another handler already prevented, a map that does not arrive within
   3 s — falls back to the original link (the stub still works).
   window.MIGLINK = { resolve(url, cb) → cb(cleanUrl | null), go(url), clean(url) → the clean URL now (or url), upgrade(root) } for
   scripts that navigate or build links by code. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window, D = document, L = W.location;
  if (W.MIGLINK) return;
  var HUB = { company: "/factories/", region: "/governorates/", city: "/industrial-zones/", offer: "/offers/", opportunity: "/tenders/",
    project: "/projects/", entity: "/tenders/", winner: "/awards/", article: "/news/", event: "/events/", lead: "/projects/",
    "export-market": "/export/" };
  var PRX = /^\/(company|region|city|offer|opportunity|project|entity|winner|article|event|lead|export-market)\.html$/;
  /* the app pages' clean paths (seo/config.json static_paths) and the generated hubs [hub, interactive page] (app_paths) */
  var STATIC = { home: "/", index: "/", about: "/about/", advisor: "/advisor/", agencies: "/agencies/", bourse: "/bourse/",
    "consultant-leads": "/consultant-leads/", contact: "/contact/", "contractor-leads": "/contractor-leads/", contractors: "/contractors/",
    dashboard: "/dashboard/", deal: "/deal/", intl: "/intl/", leads: "/leads/", legal: "/legal/", map: "/map/", market: "/market/",
    "media-center": "/media-center/", meeting: "/meeting/", outlets: "/outlets/", "project-news": "/project-news/", radar: "/radar/",
    register: "/register/", suppliers: "/suppliers/", track: "/track/", "useful-links": "/useful-links/", videos: "/videos/",
    admin: "/admin/", inbox: "/inbox/", "seo-admin": "/seo-admin/", "seo-team": "/seo-team/", "data-desk": "/data-desk/",
    signin: "/login/", pay: "/pay/", factory: "/factories/" };
  var GEN = { factories: ["/factories/", "/factories/search/"], tenders: ["/tenders/", "/tenders/search/"], rfqs: ["/rfq/", "/rfq/search/"],
    winners: ["/awards/", "/awards/search/"], news: ["/news/", "/news/search/"], events: ["/events/", "/events/calendar/"],
    projects: ["/projects/", "/projects/search/"], offers: ["/offers/", "/offers/search/"], cities: ["/industrial-zones/", "/industrial-zones/explore/"] };
  var APRX = /^\/([\w-]+)\.html$/, SELF = /^(?:www\.)?madeinegyptgate\.com$/i, EN_P = /^\/en(\/|$)/;
  /* paths that are files, not pages (never an /en/ twin) */
  var NOPAGE = /^\/(?:api|data|img|media|assets|fonts|_seo|downloads|sitemaps|cdn-cgi)\/|\.(?:[a-z0-9]{2,5})$/i;
  var maps = {}, wait = {}, HAS = Object.prototype.hasOwnProperty;
  function noop() {}
  function has(o, k) { return HAS.call(o, k); }
  function dec(s) { s = String(s || ""); try { s = decodeURIComponent(s); } catch (e) {} return s.normalize ? s.normalize("NFC") : s; }
  function enc(p) { return /[^\x21-\x7e]/.test(p) ? encodeURI(p) : p; }   /* a decoded path from a map → a valid href */

  /* ---------- maps (the same files the stubs read) + the English list ---------- */
  function load(key, cb) {
    cb = cb || noop;
    if (has(maps, key)) { cb(maps[key]); return; }
    if (wait[key]) { wait[key].push(cb); return; }
    wait[key] = [cb];
    var fin = function (m) {
      maps[key] = m && typeof m === "object" ? m : false;
      var l = wait[key] || []; wait[key] = null;
      for (var i = 0; i < l.length; i++) { try { l[i](maps[key]); } catch (e) {} }
      later();
    };
    try {
      var x = new XMLHttpRequest();
      x.open("GET", key === "~en" ? "/_seo/en-paths.json" : "/_seo/hash/" + key + ".json", true);
      x.timeout = 10000;
      x.onload = function () { var m = false; if (x.status >= 200 && x.status < 300) { try { m = JSON.parse(x.responseText); } catch (e) { m = false; } } fin(m); };
      x.onerror = x.ontimeout = x.onabort = function () { fin(false); };
      x.send();
    } catch (e) { fin(false); }
  }
  function pick(m, h) {
    var k = [h, h.toLowerCase(), h.toUpperCase(), h.replace(/^reg-/i, "").toUpperCase()];
    for (var i = 0; i < k.length; i++) { if (has(m, k[i]) && m[k[i]]) return m[k[i]]; }
    return "";
  }
  /* a member factory's page from its own directory record (no map): not for rows the Control Center added after the build (row[16]) */
  function member(n) {
    var f = (W.MIGOLDFAC || [])[n], u = f && !f[16] ? String(f[7] || "") : "";
    var m = /^https?:\/\/(?:www\.)?madeinegyptgate\.com\/factories\/([^\/?#]+)\/?$/i.exec(u);
    return m ? "/factories/" + encodeURIComponent(dec(m[1])) + "/" : "";
  }
  /* the /en/ twin of a site path ("" when the build has none) */
  function twin(p) {
    var m = maps["~en"]; if (!m) return "";
    var k = dec(p), v = has(m, k) ? m[k] : has(m, k + "/") ? m[k + "/"] : (k.length > 1 && /\/$/.test(k) && has(m, k.slice(0, -1))) ? m[k.slice(0, -1)] : "";
    return typeof v === "string" && EN_P.test(v) ? enc(v) : "";
  }
  function split(u) { var m = /^([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/.exec(u) || [u, u, "", ""]; return { p: m[1] || "", s: m[2] || "", h: m[3] || "" }; }
  function noLang(s) { var q = s.replace(/^\?/, "").split("&").filter(function (x) { return x && !/^lang=/.test(x); }).join("&"); return q ? "?" + q : ""; }
  function enOn() { return W.MIGLANG === "en" && !EN_P.test(L.pathname || ""); }

  /* ---------- a link → where it should point ---------- */
  function raw(a) { return (a.getAttribute && (a.getAttribute("href") || a.getAttribute("xlink:href"))) || ""; }
  function target(a) {
    var r = raw(a);
    if (!r || r.charAt(0) === "#" || /^(?:mailto|tel|sms|javascript|data|blob):/i.test(r)) return null;
    var x = a;
    /* SVG <a> (the map) has no host / pathname / hash: read its href through an HTML anchor */
    if (typeof a.pathname !== "string") { x = D.createElement("a"); x.href = r; }
    var host = x.host || "";
    if (host && host !== L.host && !SELF.test(host)) return null;
    var path = x.pathname || "";
    if (path.charAt(0) !== "/") path = "/" + path;   /* old IE-style pathname */
    return { raw: r, path: path, search: x.search || "", hash: x.hash || "", self: !!host && host !== L.host };
  }
  function skipEn(a) { return a.hasAttribute("hreflang") || a.hasAttribute("data-lang") || a.hasAttribute("data-mig-dash") || a.getAttribute("lang") === "ar"; }
  /* → the final URL (string), null (leave the link as it is) or { need: map key } */
  function compute(a, force) {
    var g = target(a); if (!g) return null;
    if (/^\/(?:panel|login)\.html$/i.test(g.path)) return null;          /* the owner's old system (deploy/legacy-live.txt) */
    var EN = enOn() || force === "en", u = null, stub = false, m, need = null;
    if ((m = PRX.exec(g.path))) {
      var t = m[1], h = dec(g.hash.slice(1)), q = /[?&]lang=(en|ar)(&|$)/.exec(g.search), p = "";
      if (q) EN = q[1] === "en";
      stub = true;
      if (!h) p = HUB[t];
      else if (t === "company" && /^\d+$/.test(h)) p = member(+h);
      if (!p) {
        if (!has(maps, t)) return { need: t };
        if (!maps[t]) return null;                                          /* the map did not arrive: the stub still works */
        p = pick(maps[t], h);
        if (!p || p.charAt(0) !== "/" || p.charAt(1) === "/") p = HUB[t];
      }
      u = enc(p);
    } else if ((m = APRX.exec(g.path)) && (has(STATIC, m[1]) || has(GEN, m[1]))) {
      var k = m[1], fr = g.hash.length > 1 ? g.hash : "";
      u = has(GEN, k) ? (fr ? GEN[k][1] : GEN[k][0]) + g.search + fr : STATIC[k] + g.search + (k === "factory" ? "" : fr);
    } else if (g.self) u = g.path + g.search + g.hash;
    /* a directory link with a query (the factories hub does not read sessionStorage «mig-q») → the directory search with #q= */
    var dq = a.getAttribute("data-fq") || a.getAttribute("data-q"), cur = split(u || g.path + g.search + g.hash);
    if (dq && /\S/.test(dq) && cur.h.length < 2 && /^\/(?:en\/)?factories\/?$/.test(dec(cur.p))) { u = "/factories/search/#q=" + encodeURIComponent(dq.replace(/^\s+|\s+$/g, "")); stub = false; }
    /* English: the /en/ twin when the build has one */
    if (EN && !skipEn(a)) {
      var b = split(u || g.path + g.search + g.hash);
      if (b.p && !EN_P.test(b.p) && !NOPAGE.test(b.p)) {
        if (!has(maps, "~en")) need = "~en";
        else if (maps["~en"]) {
          var tw = twin(b.p);
          if (tw) u = tw + noLang(b.s) + b.h;
          else if (stub && !/[?&]lang=/.test(b.s)) u = b.p + (b.s ? b.s + "&" : "?") + "lang=en" + b.h;
        }
      }
    }
    if (need) return { need: need, u: u };
    return u && u !== g.raw ? u : null;
  }
  function setHref(a, u) {
    if (a.hasAttribute("href")) a.setAttribute("href", u);
    else if (a.getAttributeNS && a.hasAttributeNS && a.hasAttributeNS("http://www.w3.org/1999/xlink", "href")) a.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", u);
    else a.setAttribute("href", u);
  }

  /* ---------- 1) make links clean in place ---------- */
  function saveData() { try { var c = W.navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))); } catch (e) { return false; } }
  function upgrade(root) {
    var as = root && root.querySelectorAll ? root.querySelectorAll("a") : [], asked = {};
    if (root && root.nodeName && /^a$/i.test(root.nodeName)) as = [root].concat([].slice.call(as));
    for (var i = 0; i < as.length && i < 6000; i++) {
      var a = as[i], r = raw(a);
      if (!r || a._mlf === r) continue;
      var c; try { c = compute(a); } catch (e) { c = null; }
      if (c && typeof c === "object") {
        if (c.u && c.u !== r) { setHref(a, c.u); r = c.u; }                   /* clean already, its /en/ twin comes with the list */
        if (!asked[c.need] && !(c.need === "company" && saveData())) { asked[c.need] = 1; want(c.need); }
        continue;
      }
      if (c) { setHref(a, c); r = c; }
      a._mlf = r;
    }
  }
  /* the maps a page's links need are fetched once the page is idle (never in the way of its own files); a click or a pointer near a
     link fetches its map at once */
  var wanted = {};
  function want(key) { if (has(maps, key) || wait[key] || wanted[key]) return; wanted[key] = 1; idle(function () { load(key); }, 0); }
  var tm = 0, queue = [], full = false;
  function later(node) {
    if (node) queue.push(node); else full = true;
    if (tm) return;
    tm = setTimeout(function () {
      tm = 0; var q = queue, f = full; queue = []; full = false;
      if (f) { upgrade(D); return; }
      for (var i = 0; i < q.length; i++) if (q[i].parentNode || q[i] === D.documentElement) upgrade(q[i]);
    }, 120);
  }
  function watch() {
    if (!W.MutationObserver || !D.documentElement) return;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) { var n = ms[i].addedNodes; for (var j = 0; j < n.length; j++) if (n[j].nodeType === 1) later(n[j]); }
    }).observe(D.documentElement, { childList: true, subtree: true });
  }

  /* ---------- a thin progress line while a map is on its way ---------- */
  var barEl = null;
  function bar(on) {
    if (!on) { if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl); barEl = null; return; }
    if (barEl || !D.body) return;
    if (!D.getElementById("mig-lf-css")) {
      var st = D.createElement("style"); st.id = "mig-lf-css";
      st.textContent = ".mig-lf{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483600;pointer-events:none;background:linear-gradient(90deg,transparent,#C8102E,#F59E0B,transparent);background-size:40% 100%;background-repeat:no-repeat;animation:migLf 1s linear infinite}"
        + "@keyframes migLf{from{background-position:-40% 0}to{background-position:140% 0}}@media (prefers-reduced-motion:reduce){.mig-lf{animation:none;background:#C8102E}}";
      (D.head || D.documentElement).appendChild(st);
    }
    barEl = D.createElement("div"); barEl.className = "mig-lf"; barEl.setAttribute("aria-hidden", "true");
    D.body.appendChild(barEl);
  }

  /* ---------- 2) a click on a link that is not clean yet: resolve, then navigate (fallback: the original link) ---------- */
  /* cb(final URL | null): loads the maps the link needs (at most two rounds: the type map, then the English list) */
  function resolveA(a, cb, force) {
    var n = 0;
    (function step() {
      var c; try { c = compute(a, force); } catch (e) { c = null; }
      if (c && typeof c === "object" && n++ < 3) { load(c.need, function () { step(); }); return; }
      cb(typeof c === "string" ? c : null);
    })();
  }
  var busy = false;
  function goA(a, href, force) {
    if (busy) return; busy = true;
    var gone = false, t3 = 0;
    var go = function (u) {
      if (gone) return; gone = true; clearTimeout(t3); bar(false);
      try { L.assign(u || href); } catch (e) { L.href = u || href; }
      setTimeout(function () { busy = false; bar(false); }, 4000);   /* navigation cancelled (e.g. a beforeunload prompt): clean up */
    };
    t3 = setTimeout(function () { go(href); }, 3000);
    var c0; try { c0 = compute(a, force); } catch (e) { c0 = null; }
    if (c0 && typeof c0 === "object") bar(true);
    resolveA(a, go, force);
  }
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href],a[*|href]") : null;
    if (!a || a.hasAttribute("download")) return;
    var tg = (a.getAttribute("target") || "").toLowerCase();
    if (tg && tg !== "_self") return;
    var c; try { c = compute(a); } catch (x) { c = null; }
    if (!c) return;
    e.preventDefault();
    var href = typeof a.href === "string" ? a.href : raw(a);
    if (typeof c === "string") { a._mlf = null; setHref(a, c); try { L.assign(c); } catch (x) { L.href = c; } return; }
    goA(a, href);
  }
  /* bubbling, on window: every page handler (modals, quick views, Janna's own links) runs first and may prevent the click */
  W.addEventListener("click", onClick, false);

  /* ---------- prefetch ---------- */
  function near(e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href],a[*|href]") : null; if (!a) return;
    var c; try { c = compute(a); } catch (x) { c = null; }
    if (c && typeof c === "object") load(c.need);
  }
  D.addEventListener("pointerover", near, true);
  D.addEventListener("touchstart", near, true);
  D.addEventListener("focusin", near, true);
  function idle(fn, ms) { setTimeout(function () { if (W.requestIdleCallback) W.requestIdleCallback(fn, { timeout: 3000 }); else fn(); }, ms); }
  var started = false;
  function start() {
    if (started) return; started = true;
    upgrade(D); watch();
    idle(function () { upgrade(D); }, 1200); idle(function () { upgrade(D); }, 6000);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  W.addEventListener("load", function () { later(); });
  /* bfcache: a page shown again keeps its upgraded links; the language may have changed in another tab meanwhile */
  W.addEventListener("pageshow", function (e) { if (e && e.persisted) later(); });

  function anchor(url) { var a = D.createElement("a"); a.setAttribute("href", String(url == null ? "" : url)); return a; }
  W.MIGLINK = {
    /* url (absolute or relative to the page) → cb(clean URL, or null when it is not a legacy link) */
    resolve: function (url, cb) { cb = cb || noop; resolveA(anchor(url), function (u) { cb(u || null); }); },
    go: function (url) {
      var a = anchor(url), c; try { c = compute(a); } catch (e) { c = null; }
      if (!c) { try { L.assign(a.href); } catch (e) { L.href = a.href; } return; }
      if (typeof c === "string") { try { L.assign(c); } catch (e) { L.href = c; } return; }
      goA(a, a.href);
    },
    /* the clean URL with the maps already loaded (sync; the url itself when it cannot be resolved yet) */
    clean: function (url) { var a = anchor(url), c; try { c = compute(a); } catch (e) { c = null; } return typeof c === "string" ? c : c && c.u ? c.u : String(url); },
    upgrade: function (root) { upgrade(root || D); }
  };
})();
