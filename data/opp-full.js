/* Members-only opportunities (owner decision 2026-11-28) — the browser side. ES5, no dependencies.
   Tenders, RFQs, project news, procurement news, contract awards and the contractors' material requests are for members: the public
   copies of data/oldtend.js, oldrfq.js, real.js and projects.js carry the teaser fields only (title, sector, governorate, country, dates,
   status — tools/opp_split.js at build time). For a signed-in member whose plan covers them this file reads the locked fields from the
   Worker (GET /api/me/opps with the member's own session: worker/src/opp-lock.js decides by the plan in force) and puts them back into
   the page's data (window.MIGTEND, MIGRFQ, REAL.tenders / tenders_intl / awards / news, MIG.PROJECTS, MIG.LEADS), so the pages show the
   details exactly as before. A visitor (or a plan without them) gets nothing: every click on such an item goes to the registration page
   with the plan that includes it preselected (MIGOPP.go).
   - loaded right BEFORE data/real.js on every app page (site.py: the Control Center's edits get their locked fields back before
     data/mig-overlay.js applies them); MIGOPP.patch() runs again after real / oldtend / oldrfq / projects (site.py _bust)
     and after data files a page loads later (data/janna.js need(), data/acc.js load1 → MIGOPP.full)
   - the first page of a session reads the Worker once (synchronously, so the page's own code finds the data at load — a member only);
     the answer is kept in sessionStorage for an hour under the session's own token (a sign-out / another member = another key)
   - MIGOPP.can(kind, market, country): may this viewer open the details? (data/plan.js MIGPLAN.can / inScope; the team: yes)
   - MIGOPP.need(kind, market) → the plan that includes it · MIGOPP.url(kind, market) → /register/#<plan> · MIGOPP.go(kind, market, label)
   - MIGOPP.guard(event, kind, market): a click handler helper — a visitor's click goes to the registration page instead
   kinds: tenders | rfq | awards | projects | leads | procurement */
(function () {
  var W = window, API = "/api/me/opps", SKEY = "mig-opp-v1", TTL = 3600000, NEG = 600000;
  if (W.MIGOPP && W.MIGOPP.patch) { W.MIGOPP.patch(); return; }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function s(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
  function EN() { return W.MIGLANG === "en" || document.documentElement.lang === "en"; }
  /* the session's token: the platform session (mig-api.js), else Bassem's advisor token (advisor.html#login=…) */
  function tok() {
    var t = ls("mig-tok"); if (t) return t;
    try { var a = JSON.parse(ss("mig-adv-token") || "null"); if (a && a.t) return String(a.t); } catch (e) {}
    return "";
  }
  /* staff (the cached answer of /api/me says role admin; the server decides again) */
  function staff() { try { var c = JSON.parse(ls("mig-me") || "null"); return !!(tok() && c && c.user && c.user.role === "admin"); } catch (e) { return false; } }
  var FEAT = { tenders: "tenders", rfq: "rfq", rfqs: "rfq", awards: "awards", winners: "awards", projects: "projects", leads: "leads", procurement: "procurement" };
  function plan() { return W.MIGPLAN || null; }
  /* may the viewer open the details of an item of this kind (and market: local | gulf | africa | asia | europe; country for the Gulf) */
  function can(kind, market, country) {
    if (!tok()) return false;
    if (staff()) return true;
    var P = plan(), f = FEAT[kind] || "tenders", m = market || "local";
    /* no data/plan.js (the kiosk, the Control Center): the server's last answer (/api/me user.markets, cached by data/mig-api.js) */
    if (!P || !P.can) { try { var c = JSON.parse(ls("mig-me") || "null"), u = c && c.user; return !!(u && u.markets && u.markets.indexOf(m === "intl" ? "europe" : m) > -1 && !(u.plan_expires && Date.parse(u.plan_expires) < Date.now())); } catch (e) { return false; } }
    if (!P.can(f)) return false;
    if (m === "local") return P.market ? P.market("local") : true;
    if (P.inScope) { var cc = P.gccCode ? P.gccCode(country || "") : ""; return P.inScope(m, cc); }
    return P.market ? P.market(m) : false;
  }
  var NEEDM = { gulf: "premium", africa: "partner", asia: "strategic", europe: "strategic", intl: "strategic" };
  function need(kind, market) { if (kind === "procurement") return "premium"; return NEEDM[market] || "basic"; }
  function url(kind, market) { return "/register/" + (EN() ? "?lang=en" : "") + "#" + need(kind, market); }
  function go(kind, market, label) {
    try { sessionStorage.setItem("mig-gate", s(label || document.title).slice(0, 120)); } catch (e) {}
    location.href = url(kind, market);
  }
  /* a click on a teaser: a viewer without the plan goes to the registration page (returns true when it did) */
  function guard(ev, kind, market, country, label) {
    if (can(kind, market, country)) return false;
    if (ev && ev.preventDefault) { ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation(); }
    go(kind, market, label);
    return true;
  }

  /* ---------- every link to an item's details, on every page (lists, home strips, governorate pages, the map, search results, the
     assistants' screens): a viewer without the plan goes to the registration page with the plan that includes it. The link stays in the
     page (search engines follow it to the item's public teaser page). data-opp-market="gulf|africa|…" on the link (or a parent) = its market */
  var KINDS = [
    ["tenders", /^\/(?:en\/)?(?:tender-item\/[^\/?#]+|tenders\/search\/?#.+|tenders(?:\.html)?#.+|opportunity(?:\.html|\/)?#.+)/],
    ["rfq", /^\/(?:en\/)?(?:rfq\/(?!new\/|search\/?(?:$|[?]))[^\/?#]+|rfq\/search\/?#.+|rfqs(?:\.html)?#.+)/],
    ["awards", /^\/(?:en\/)?(?:awards\/(?!search\/?(?:$|[?]))[^\/?#]+|awards\/search\/?#.+|winner(?:\.html|\/)?#.+|entity(?:\.html|\/)?#.+)/],
    ["projects", /^\/(?:en\/)?(?:projects\/(?!search\/?(?:$|[?]))[^\/?#]+|project(?:\.html|\/)?#.+)/],
    ["leads", /^\/(?:en\/)?lead(?:\.html|\/)?#.+/]
  ];
  function kindOf(a) {
    var h = a.getAttribute("href") || "", u;
    if (!h || /^(?:mailto|tel|javascript):/i.test(h)) return "";
    try { u = new URL(h, location.href); } catch (e) { return ""; }
    if (u.host !== location.host) return "";
    var p = u.pathname + (u.hash || "");
    if (/^\/(?:en\/)?(?:tenders|rfq|awards|projects)\/(?:category|entity|search)?\/?$/.test(u.pathname) && !u.hash) return "";
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i][1].test(p)) return KINDS[i][0];
    return "";
  }
  function onClick(e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null; if (!a || a.hasAttribute("data-opp-free")) return;
    var k = kindOf(a); if (!k) return;
    var mEl = a.closest ? a.closest("[data-opp-market]") : null, mk = mEl ? mEl.getAttribute("data-opp-market") : "local";
    guard(e, k, mk || "local", mEl ? mEl.getAttribute("data-opp-country") || "" : "", a.textContent);
  }
  try { document.addEventListener("click", onClick, true); } catch (e) {}

  /* ---------- the Worker's answer (cached for the session) ---------- */
  var SETS = null, TRIED = false;
  function ckey(t) { return t.slice(-16); }
  function cached() {
    var t = tok(); if (!t) return null;
    try {
      var c = JSON.parse(ss(SKEY) || "null");
      if (!c || c.k !== ckey(t)) return null;
      if (c.neg) return c.at + NEG > Date.now() ? { neg: 1 } : null;
      return c.at + TTL > Date.now() ? c.sets : null;
    } catch (e) { return null; }
  }
  function keep(sets, neg) { var t = tok(); if (!t) return; try { ss(SKEY, JSON.stringify(neg ? { k: ckey(t), at: Date.now(), neg: 1 } : { k: ckey(t), at: Date.now(), sets: sets })); } catch (e) { ss(SKEY, null); } }
  function wanted() { return !!tok() && (staff() || can("tenders", "local") || can("rfq", "local") || can("projects", "local") || can("awards", "local")); }
  function answer(x) {
    if (x.status === 200) { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} if (j && j.sets) { SETS = j.sets; keep(j.sets); return true; } }
    if (x.status === 401 || x.status === 403) keep(null, true);
    return false;
  }
  function fetchSync() {
    if (TRIED) return; TRIED = true;
    var c = cached(); if (c) { if (!c.neg) SETS = c; return; }
    if (!wanted() || !W.XMLHttpRequest) return;
    try { var x = new XMLHttpRequest(); x.open("GET", API, false); x.setRequestHeader("Authorization", "Bearer " + tok()); x.setRequestHeader("Accept", "application/json"); x.send(null); answer(x); } catch (e) {}
  }
  function fetchAsync(cb) {
    var c = cached(); if (c) { if (!c.neg) SETS = c; cb(!c.neg); return; }
    if (!tok() || !W.XMLHttpRequest) { cb(false); return; }
    try {
      var x = new XMLHttpRequest(); x.open("GET", API, true); x.setRequestHeader("Authorization", "Bearer " + tok()); x.setRequestHeader("Accept", "application/json");
      x.onreadystatechange = function () { if (x.readyState === 4) cb(answer(x)); };
      x.send(null);
    } catch (e) { cb(false); }
  }

  /* ---------- putting the details back (the same keys as tools/opp_split.js) ---------- */
  var TEND = [4, 7, 8, 11, 14, 15], RFQ = [3, 4, 5, 10], done = 0;
  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  /* only what the public copy left empty: a value the Control Center's published edit gave (the overlay) stays */
  function empty(v) { return v == null || v === "" || (v && typeof v === "object" && v.length === 0); }
  function assign(r, o) { for (var k in o) if (own(o, k) && k.charAt(0) !== "_" && empty(r[k])) r[k] = o[k]; }
  function fill(row, i, v) { if (empty(row[i]) || (i === 14 && row[i] && row[i].length && !row[i].some(function (u) { return u && u[1]; }))) row[i] = v; }
  /* the published Control Center edits (window.MIGOVL_DATA, data/mig-overlay.js): their locked fields go back in BEFORE the data files are
     applied (this file is loaded before data/real.js) — {coll: {e: {base_key: fields}, a: {id: fields}}} */
  var OVD = 0;
  function overlay() {
    var O = W.MIGOVL_DATA, V = SETS && SETS.ov; if (OVD || !V || !O || !O.c) return;
    OVD = 1;
    for (var c in V) {
      if (!own(V, c) || !O.c[c]) continue;
      var cd = O.c[c], x = V[c];
      if (cd.e && x.e) for (var k in x.e) if (own(x.e, k) && cd.e[k]) { for (var f in x.e[k]) if (own(x.e[k], f)) cd.e[k][f] = x.e[k][f]; }
      if (cd.a && x.a) cd.a.forEach(function (r) { var id = r && String(r.id || r.no || r.ref || ""), y = id && x.a[id]; if (y) for (var f in y) if (own(y, f)) r[f] = y[f]; });
    }
  }
  function apply() {
    var L = SETS; if (!L) return 0;
    var n = 0, T = W.MIGTEND, Q = W.MIGRFQ, R = W.REAL, M = W.MIG;
    if (T && L.t && !T._opp) {
      var seen = {};
      T.forEach(function (t) {
        if (!t || !t.length) return;
        var k = s(t[0]) + "|" + s(t[3]); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += "#" + seen[k];
        var v = L.t[k]; if (!v) return;
        for (var i = 0; i < TEND.length; i++) fill(t, TEND[i], v[i]); n++;
      });
      T._opp = 1;
    }
    if (Q && L.q && !Q._opp) { Q.forEach(function (q) { var v = q && L.q[s(q[0])]; if (!v) return; for (var i = 0; i < RFQ.length; i++) fill(q, RFQ[i], v[i]); n++; }); Q._opp = 1; }
    if (R && !R._opp) {
      var one = function (list, map, key) { if (!list || !map) return; list.forEach(function (r) { var v = r && map[key(r)]; if (v) { assign(r, v); n++; } }); };
      one(R.tenders, L.rt, function (r) { return s(r.id) || s(r.title_ar); });
      one(R.tenders_intl, L.ri, function (r) { return s(r.ref) + "|" + s(r.title_ar); });
      one(R.awards, L.ra, function (r) { return s(r.title_ar) + "|" + s(r.date); });
      one(R.news, L.rn, function (r) { return s(r.title_ar) + "|" + s(r.date); });
      R._opp = 1;
    }
    if (M && M.PROJECTS_REAL && L.p && !M.PROJECTS_REAL._opp) {
      M.PROJECTS_REAL.forEach(function (p) { var v = p && L.p[s(p[0])]; if (!v) return; for (var i in v) if (own(v, i)) fill(p, +i, v[i]); n++; });
      M.PROJECTS_REAL._opp = 1;
      /* the project news, as data/projects.js builds them (now with their text) */
      if (M.PROJECTS === M.PROJECTS_REAL || !M.PROJECTS || !M.PROJECTS.length) {
        M.PROJECTS = M.PROJECTS_REAL; M.NEWS = [];
        M.PROJECTS.forEach(function (p) { (p[14] || []).forEach(function (u) { if (u && u[0]) M.NEWS.push([u[0], p[0], u[1]]); }); });
        M.NEWS.sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0; }); M.NEWS = M.NEWS.slice(0, 80);
      }
    }
    if (M && M.LEADS && L.l && !M.LEADS._opp) { M.LEADS.forEach(function (l) { var v = l && L.l[s(l[0])]; if (!v) return; for (var i in v) if (own(v, i)) fill(l, +i, v[i]); n++; }); M.LEADS._opp = 1; }
    if (L.en && !done) { var D = W.I18N_EN; if (D) for (var k in L.en) if (own(L.en, k) && D[k] == null) D[k] = L.en[k]; }
    done += n;
    return n;
  }
  function patch() { fetchSync(); overlay(); var n = apply(); if (n) { try { document.documentElement.classList.add("mig-opp-full"); } catch (e) {} } return n; }
  /* async (the Control Center, pages that load data files later): cb(true) once the member's details are in the page's data */
  function full(cb) { if (SETS) { overlay(); apply(); cb(true); return; } fetchAsync(function (ok) { if (ok) { overlay(); apply(); } cb(!!ok); }); }
  W.MIGOPP = { patch: patch, full: full, can: can, need: need, url: url, go: go, guard: guard, kindOf: kindOf, has: function () { return !!SETS; },
    clear: function () { SETS = null; TRIED = false; ss(SKEY, null); } };
  patch();
})();
