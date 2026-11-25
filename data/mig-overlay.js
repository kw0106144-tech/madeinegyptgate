/* MIGOVL — the content-overlay applier (ACC-CONTRACT §4.5). The admin's published edits reach every page WITHOUT a rebuild:
   the Worker compiles them into ONE file served at /data/overlay.js (window.MIGOVL_DATA = {v, at, c, tr, hp, plans, settings, cats,
   banners, banner_hide, notices, pay}); the static build ships a no-op copy (window.MIGOVL_DATA = null).
   Load order (site.py page(), P-S1): data/i18n.js → THIS FILE → data/overlay.js → data/plan.js → data/plans-live.js → … every data file.
   At load it installs accessor setters on the globals the data files assign (window.MIGOLDFAC = …, window.REAL = …, window.MIG = …),
   so each collection is patched the moment its file runs — head scripts, end-of-body scripts, the async oldfac.js of factories.html,
   or a second copy on the same page — and before any page script reads it. If MIGOVL_DATA arrives after a data file, a setter on
   MIGOVL_DATA applies to every target already assigned. Per collection: edits (by key), then hides (hole = delete arr[i] so other
   indices stay valid; splice = in-place removal for id-addressed lists), then adds (push; parallel arrays at the same index).
   Every string written is neutralised again (no <, >, quotes or backticks — defence in depth behind the server); URLs are validated;
   HTML is built only through esc(). Any failure leaves that collection exactly as built (one console.warn) and never throws.
   window.MIGOVL_ADMIN = 1 (panel.html): no setters, only the pure helpers (schema, key, fromRow, toRow …).
   ES5, no dependencies; safe in the vm sandboxes of tools/dump-data.mjs and worker/build-index.js (no DOM there). */
(function () {
  "use strict";
  var W = typeof window !== "undefined" ? window : this;
  if (!W || (W.MIGOVL && W.MIGOVL.__migovl)) return;
  var ADMIN = !!W.MIGOVL_ADMIN, HAS = Object.prototype.hasOwnProperty;
  var D = null, VALS = {}, PLAN = {}, PEND = {}, WARN = {}, WAIT = [];

  /* ---------- text & URL safety (§0.4) ---------- */
  function neutral(s, one) {
    s = String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/</g, "\u2039").replace(/>/g, "\u203a").replace(/"/g, "\u201d").replace(/'/g, "\u2019").replace(/`/g, "\u02cb");
    if (one) s = s.replace(/\s+/g, " ");
    return s.replace(/^\s+|\s+$/g, "");
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"'`]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]; }); }
  var REL = /^\/(media\/u|img)\/[A-Za-z0-9\/_\-.]+$|^img\/[A-Za-z0-9\/_\-.]+$/;
  /* https absolute URL (no credentials, spaces, quotes, angle brackets, backslashes), or a same-site media/img path */
  function okUrl(u) {
    u = String(u == null ? "" : u);
    if (!u || u.length > 500) return false;
    if (REL.test(u) && u.indexOf("..") < 0) return true;
    return /^https:\/\/[^\/?#@\s"'<>`\\]+(?:[\/?#][^\s"'<>`\\]*)?$/i.test(u);
  }
  /* image URLs also go into CSS url(…): no parentheses either */
  function okImg(u) { return okUrl(u) && !/[()]/.test(String(u)); }
  /* a link: https URL or a same-site relative path (register.html#partner, /factories/…) — never javascript:, data: or //host */
  function okLink(u) {
    u = String(u == null ? "" : u);
    if (okUrl(u)) return true;
    return u.length <= 300 && /^(\/(?!\/)|[A-Za-z0-9])[A-Za-z0-9\/_\-.%]*(\?[A-Za-z0-9_\-=&.%]*)?(#[^\s"'<>`\\]*)?$/.test(u) && !/^[a-z][a-z0-9+.\-]*:/i.test(u);
  }
  /* slug of an Arabic or Latin name (§4.4): NFC; letters and digits kept; every other run becomes "-"; ≤ 60 chars */
  function slugAr(s) {
    s = String(s || ""); if (s.normalize) s = s.normalize("NFC");
    s = s.replace(/[^A-Za-z0-9\u0621-\u064a\u0660-\u0669\u066e-\u06d3\u06d5\u06fa-\u06fc\u06ff]+/g, "-").replace(/^-+|-+$/g, "");
    return s.slice(0, 60).replace(/-+$/, "");
  }
  /* decoded NFC pathname of a URL (the key of directory companies and products) */
  function pathKey(u) {
    var p = String(u == null ? "" : u).replace(/^[a-z][a-z0-9+.\-]*:\/\/[^\/?#]*/i, "").replace(/[?#][\s\S]*$/, "");
    if (!p) p = "/";
    if (p.indexOf("%") > -1) { try { p = decodeURIComponent(p); } catch (e) { /* kept as is */ } }
    return p.normalize ? p.normalize("NFC") : p;
  }
  function cl(x) { return x == null || typeof x !== "object" ? x : JSON.parse(JSON.stringify(x)); }
  function warn(k, e) { if (WARN[k]) return; WARN[k] = 1; try { if (W.console && console.warn) console.warn("MIGOVL: " + k + " stays as built (" + (e && e.message ? e.message : e) + ")"); } catch (x) { /* no console */ } }
  /* today in Cairo, YYYY-MM-DD */
  var TODAY = "";
  function today() {
    if (TODAY) return TODAY;
    try { TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { TODAY = ""; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) TODAY = new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
    return TODAY;
  }
  function addDays(d, n) { return new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10); }

  /* ---------- value types of the named fields ---------- */
  function val(t, v, arr) {
    switch (t) {
      case "s": return v == null ? "" : neutral(v, 1);
      case "t": return v == null ? "" : neutral(v);
      case "u": return okUrl(v) ? String(v) : "";
      case "i": return okImg(v) ? String(v) : "";
      case "n": return v === null || v === undefined || v === "" || !isFinite(+v) ? null : +v;
      case "I": return v === null || v === undefined || v === "" || !isFinite(+v) ? "" : Math.round(+v);
      case "b": return arr ? (v ? 1 : 0) : !!v;
      case "a": return (Array.isArray(v) ? v : (v == null || v === "" ? [] : String(v).split(/\s*[\n\u060c,]\s*/))).map(function (x) { return neutral(x, 1).slice(0, 200); }).filter(function (x) { return !!x; }).slice(0, 30);
      case "d": v = String(v == null ? "" : v); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
      case "g": v = String(v == null ? "" : v); return /^[A-Z]{3}$/.test(v) ? v : "";
      case "G": return (Array.isArray(v) ? v : []).filter(function (x) { return /^[A-Z]{3}$/.test(String(x)); }).map(String).slice(0, 27);
      case "k": v = String(v == null ? "" : v); return /^[a-z0-9_\-]{1,32}$/.test(v) ? v : "other";
      case "c": v = String(v == null ? "" : v); return /^[a-z][0-9]{1,2}$/.test(v) ? v : "e3";
      case "S": v = Math.round(+v); return v >= 0 && v <= 6 ? v : 0;
      case "U": return (Array.isArray(v) ? v : []).filter(function (x) { return Array.isArray(x); }).slice(0, 10).map(function (x) { return [val("d", x[0]) || neutral(x[0], 1).slice(0, 10), neutral(x[1]).slice(0, 600)]; });
      case "e": return v == null ? "" : neutral(v, 1);
    }
    return v == null ? "" : neutral(v, 1);
  }

  /* ---------- the collections (§4.4): global, key, hide mode, named fields → [target, type, flag] ----------
     target: a number = array index; a string = object key; "@" = the parallel array (MIGOLDFACD / MIGP2F); "@fp" = MIGFACX.fp[name].
     flag "add": only set on adds (the base row keeps it: it is the key or generated). */
  var DEF = {
    fac: { g: "MIGOLDFAC", par: "MIGOLDFACD", arr: 1, hide: "hole", idp: "c-", hub: "/factories/",
      key: function (r) { return pathKey(r[7]); },
      f: { name: [0, "s"], sector: [1, "s"], location: [2, "s"], type: [3, "s"], verified: [4, "b"], logo: [15, "i"], url: [7, "u", "add"],
        description: ["@", "t"], products: [9, "a"], gov: [10, "g"], website: [17, "u"] } },
    facx: { g: "MIGFACX", sub: "list", arr: 1, hide: "hole", noadd: 1, hub: "/factories/",
      key: function (r) { return String(r[0]); },
      f: { sector: [1, "s"], location: [2, "s"], type: [3, "s"], description: [4, "t"], verified: [5, "b"], logo: [6, "i"], cover: [7, "c"],
        source_url: [8, "u"], website: [9, "u"], products: ["@fp", "a"] } },
    prod: { g: "MIGOLDP", par: "MIGP2F", arr: 1, hide: "hole", idp: "p-", hub: "/products/",
      key: function (r) { return pathKey(r[5]); },
      f: { name: [0, "s"], description: [1, "t"], category: [2, "k"], image: [9, "i"], url: [5, "u", "add"], name_en: [6, "s"], price: [11, "s"],
        featured: [12, "b"], company_url: ["@", "u"] } },
    tend: { g: "MIGTEND", arr: 1, hide: "splice", hub: "/tenders/",
      key: function (r) { return r[0] + "|" + r[3]; },
      f: { ref: [0, "s", "add"], type: [1, "s"], title: [3, "s"], entity: [4, "s"], gov_name: [5, "s"], sector: [6, "s"], booklet: [7, "I"], bond: [8, "s"],
        deadline: [9, "d"], gov: [10, "g"], source_url: [11, "u"], details: [14, "t"], contacts: [15, "t"] } },
    rfq: { g: "MIGRFQ", arr: 1, hide: "splice", hub: "/rfq/",
      key: function (r) { return String(r[0]); },
      f: { no: [0, "s", "add"], date: [1, "d"], title: [2, "s"], details: [3, "t"], delivery: [4, "s"], qty: [5, "s"], deadline: [6, "d"], gov: [7, "g"],
        url: [8, "u"], sector: [9, "s"], details_en: [10, "t"] } },
    offer: { g: "MIGOFFERS", hide: "splice", hub: "/offers/",
      key: function (o) { return String(o.id); },
      f: { id: ["id", "s", "add"], product_ar: ["product_ar", "s"], product_en: ["product_en", "s"], brand: ["brand", "s"], made_in_egypt: ["made_in_egypt", "b"],
        category_ar: ["category_ar", "s"], category_en: ["category_en", "s"], size_unit: ["size_unit", "s"], price_egp: ["price_egp", "n"],
        old_price_egp: ["old_price_egp", "n"], store_ar: ["store_ar", "s"], store_en: ["store_en", "s"], cities_ar: ["cities_ar", "a"],
        region_codes: ["region_codes", "G"], branch_example: ["branch_example", "s"], branch_en: ["branch_en", "s"], lat: ["lat", "n"], lon: ["lon", "n"],
        approx: ["approx", "b"], valid_from: ["valid_from", "d"], valid_to: ["valid_to", "d"], source_url: ["source_url", "u"], image: ["img", "i"] } },
    zone: { g: "MIGZONES", hide: "splice", hub: "/industrial-zones/",
      key: function (z) { return String(z.id); },
      f: { id: ["id", "s", "add"], name_ar: ["name_ar", "s"], name_en: ["name_en", "s"], type: ["type", "e"], region_code: ["region_code", "g"], city: ["city", "s"],
        lat: ["lat", "n"], lon: ["lon", "n"], approx: ["approx", "b"], coord_source: ["coord_source", "u"], area_km2: ["area_km2", "n"], area_text: ["area_text", "s"],
        focus_sectors_ar: ["focus_sectors_ar", "a"], operator_ar: ["operator_ar", "s"], website: ["website", "u"], status_ar: ["status_ar", "s"],
        notes: ["notes", "t"], source_url: ["source_url", "u"] } },
    news: { g: "REAL", sub: "news", hide: "hole", hub: "/news/",
      key: function (n) { return String(n.url); },
      f: { id: ["id", "s", "add"], title_ar: ["title_ar", "s"], summary_ar: ["summary_ar", "t"], source_name: ["source_name", "s"], date: ["date", "d"],
        category_ar: ["category_ar", "s"], region_code: ["region_code", "g"], url: ["url", "u"], image: ["image_file", "i"] } },
    event: { g: "REAL", sub: "events", hide: "hole", hub: "/events/",
      key: function (e) { return String(e.id); },
      f: { id: ["id", "s", "add"], name_ar: ["name_ar", "s"], name_en: ["name_en", "s"], start_date: ["start_date", "d"], end_date: ["end_date", "d"],
        venue: ["venue", "s"], organizer: ["organizer", "s"], sector_ar: ["sector_ar", "s"], url: ["url", "u"], about_ar: ["about_ar", "t"],
        agenda_ar: ["agenda_ar", "a"], source_url: ["source_url", "u"], city: ["city", "s"], region_code: ["region_code", "g"], image: ["image_file", "i"] } },
    award: { g: "REAL", sub: "awards", hide: "hole", hub: "/awards/",
      key: function (a) { return a.title_ar + "|" + a.date + "|" + (a.source_url || ""); },
      f: { id: ["id", "s", "add"], title_ar: ["title_ar", "s"], winner_ar: ["winner_ar", "s"], awarding_entity_ar: ["awarding_entity_ar", "s"],
        value_egp_million: ["value_egp_million", "n"], value_usd_million: ["value_usd_million", "n"], value_eur_million: ["value_eur_million", "n"],
        region_code: ["region_code", "g"], city: ["city", "s"], date: ["date", "d"], source_url: ["source_url", "u"] } },
    opp: { g: "REAL", sub: "tenders", hide: "hole", hub: "/tenders/",
      key: function (t) { return String(t.id); },
      f: { id: ["id", "s", "add"], ref: ["ref", "s"], kind: ["kind", "s"], title_ar: ["title_ar", "s"], title_en: ["title_en", "s"], entity_ar: ["entity_ar", "s"],
        entity_en: ["entity_en", "s"], region_code: ["region_code", "g"], city: ["city", "s"], sector_ar: ["sector_ar", "s"], publish_date: ["publish_date", "d"],
        closing_date: ["closing_date", "d"], status: ["status", "e"], procurement_type: ["procurement_type", "s"], bid_bond_egp: ["bid_bond_egp", "n"],
        booklet_price_egp: ["booklet_price_egp", "n"], source_url: ["source_url", "u"], via: ["via", "s"], note: ["note", "t"] } },
    intl: { g: "REAL", sub: "tenders_intl", hide: "hole", noadd: 1, hub: "/tenders/",
      key: function (t) { return String(t.ref); },
      f: { title_ar: ["title_ar", "s"], title_en: ["title_en", "s"], entity_ar: ["entity_ar", "s"], sector_ar: ["sector_ar", "s"], closing_date: ["closing_date", "d"],
        estimated_value: ["estimated_value", "n"], currency: ["currency", "s"], source_url: ["source_url", "u"] } },
    video: { g: "MIGVIDS", hide: "splice", hub: "/videos/",
      key: function (v) { return String(v.id); },
      f: { id: ["id", "s", "add"], title_ar: ["title_ar", "s"], title_en: ["title_en", "s"], channel: ["channel", "s"], date: ["date", "d"], date_approx: ["date_approx", "b"],
        category_ar: ["category_ar", "s"], governorate: ["governorate", "g"], lang: ["lang", "e"], title_original: ["title_original", "s", "add"],
        url: ["url", "u", "add"], source_url: ["source_url", "u", "add"], thumb: ["thumb", "i", "add"], duration: ["duration", "n", "add"], verified_oembed: ["verified_oembed", "b", "add"] } },
    proj: { g: "MIG.PROJECTS", arr: 1, hide: "splice", hub: "/projects/",
      key: function (p) { return String(p[0]); },
      f: { id: [0, "s", "add"], name: [1, "s"], region: [2, "s"], city: [3, "s"], sector: [4, "s"], stage: [5, "S"], value: [6, "n"], owner: [7, "s"],
        contractor: [8, "s"], consultant: [9, "s"], start: [10, "s"], end: [11, "s"], updates: [14, "U"], source_url: [15, "u"], image: [16, "i"] } }
  };
  var GLOB = {}; /* global name → the collections it carries */
  Object.keys(DEF).forEach(function (c) { var g = DEF[c].g; (GLOB[g] = GLOB[g] || []).push(c); });

  /* ---------- named fields ⇄ rows ---------- */
  function rowOf(c, host) { var d = DEF[c]; return d.sub ? (host && host[d.sub]) : host; }
  function parOf(c) { var d = DEF[c]; return d.par ? VALS[d.par] : null; }
  /* the build row → named fields (the panel's editor; MIGOLDFACD / MIGP2F / MIGFACX.fp read when loaded) */
  function fromRow(c, r, i) {
    var d = DEF[c], o = {}; if (!d || !r) return o;
    Object.keys(d.f).forEach(function (n) {
      var t = d.f[n][0], v;
      if (t === "@") { var P = parOf(c) || (d.par && W[d.par]); v = P && i != null ? P[i] : undefined; }
      else if (t === "@fp") { var X = VALS.MIGFACX || W.MIGFACX; v = X && X.fp ? X.fp[r[0]] : undefined; }
      else v = r[t];
      if (v !== undefined) o[n] = cl(v);
    });
    if (c === "fac" && r[16]) o.id = r[16];
    if (c === "prod" && r[10]) o.id = r[10];
    if (c === "facx") o.name = r[0];
    if ((c === "offer" || c === "news" || c === "event") && o.image === undefined && (r.image_file || r.img)) o.image = r.image_file || r.img;
    return o;
  }
  /* named fields → a row: `base` given = a copy of it with the fields applied; else a new (added) row */
  function toRow(c, f, base, i) {
    var d = DEF[c]; if (!d) return null;
    var r = base ? cl(base) : (d.arr ? [] : {}), x = { par: undefined, fp: undefined };
    if (!base) build(c, r, f || {}, x); else setFields(c, r, f || {}, false, x, i);
    return r;
  }
  /* write the named fields of an edit (base) or an add into a row; parallel values are returned in x */
  function setFields(c, r, f, isAdd, x, i) {
    var d = DEF[c];
    for (var n in f) {
      if (!HAS.call(f, n) || !HAS.call(d.f, n)) continue;
      var s = d.f[n], t = s[0];
      if (s[2] === "add" && !isAdd) continue;
      var v = val(s[1], f[n], d.arr);
      if (t === "@") x.par = v;
      else if (t === "@fp") x.fp = v;
      else r[t] = v;
    }
    post(c, r, f, isAdd, x, i);
  }
  /* derived values (§4.4) */
  function post(c, r, f, isAdd, x) {
    var td = today(), has = function (k) { return HAS.call(f, k); };
    if (c === "fac") {
      if (isAdd || has("gov")) r[11] = ((+r[11] || 0) & ~1) | (r[10] ? 0 : 1);
      if (isAdd || has("description")) r[11] = ((+r[11] || 0) & ~2) | (x.par ? 0 : 2);
    } else if (c === "tend") {
      if (isAdd || has("deadline")) { var dl = r[9]; r[2] = !dl ? "غير محدد الموعد" : dl < td ? "منتهية" : dl <= addDays(td, 7) ? "تنتهي قريباً" : "سارية"; }
      if (!r[5] && r[10] && W.MIGREG && MIGREG.name) { try { r[5] = MIGREG.name(r[10]) || ""; } catch (e) { /* no name */ } }
      r[12] = ((+r[12] || 0) & ~13) | (r[10] ? 0 : 1) | (r[9] ? 0 : 4) | (r[4] ? 0 : 8);
    } else if (c === "rfq") {
      if (isAdd && !r[1]) r[1] = td;
      r[11] = ((+r[11] || 0) & ~33) | (r[7] ? 0 : 1) | (r[5] || r[4] || r[6] ? 0 : 32);
    } else if (c === "offer") {
      if (has("image")) r.image_file = r.img;
      var p = r.price_egp, o = r.old_price_egp;
      r.discount_pct = o != null && p != null && o > p && o > 0 ? Math.round((o - p) / o * 1000) / 10 : null;
      r.price_sar = r.price_aed = p; r.old_price_sar = r.old_price_aed = o; r.saudi_made = r.made_in_uae = !!r.made_in_egypt;
      if (isAdd || has("price_egp") || has("source_url")) r.source_checked = val("d", f.source_checked) || td;
    } else if (c === "news") {
      if (has("image")) r.image_url = "";
    } else if (c === "opp") {
      if (r.closing_date && r.closing_date < td) r.status = "closed";
      else if (r.status !== "closed") r.status = "open";
    } else if (c === "video" && isAdd) {
      var u = "https://www.youtube.com/watch?v=" + r.id;
      r.url = r.source_url = u; if (!r.thumb) r.thumb = "https://i.ytimg.com/vi/" + r.id + "/hqdefault.jpg";
    }
  }
  /* a new row from an add record */
  function build(c, r, f, x) {
    var d = DEF[c], id = String(f.id || f.no || f.ref || "");
    if (d.arr) {
      /* every index of the real shape exists ("" by default), then the type-specific defaults */
      var n0 = { fac: 18, prod: 13, tend: 16, rfq: 13, proj: 17 }[c] || 0, set = function (o) { for (var k in o) if (HAS.call(o, k)) r[+k] = o[k]; };
      for (var k = 0; k < n0; k++) r[k] = "";
      if (c === "fac") set({ 3: "مصنع", 4: 0, 5: -1, 6: 0, 9: [], 11: 0, 16: id });
      else if (c === "prod") set({ 2: "other", 3: -1, 4: 0, 7: 0, 10: id, 12: 0 });
      else if (c === "tend") set({ 0: id, 12: 0 });
      else if (c === "rfq") set({ 0: id, 11: 0 });
      else if (c === "proj") set({ 0: id, 5: 0, 6: null, 12: null, 13: [], 14: [] });
    } else {
      r.id = id;
      if (c === "award") { r.value_sar_million = null; r.value_aed_million = null; }
      if (c === "news") r.image_url = "";
    }
    setFields(c, r, f, true, x);
    if (c === "fac" && !r[7]) r[7] = "https://www.madeinegyptgate.com/factories/" + slugAr(r[0]) + "-" + id.slice(2) + "/";
    if (c === "prod") {
      if (!r[5]) r[5] = "https://www.madeinegyptgate.com/industrial_products/" + slugAr(r[0]) + "-" + id.slice(2) + "/";
      r[7] = (x.par ? 0 : 16) | (r[9] ? 0 : 128);
      if (!r[1] && x.par) { var F = VALS.MIGOLDFAC || []; for (var n = 0; n < F.length; n++) if (F[n] && F[n][7] === x.par) { r[1] = neutral("من إنتاج " + F[n][0], 1); break; } }
    }
    return r;
  }
  function idOf(c, r) {
    if (!r) return "";
    if (c === "fac") return r[16] || ""; if (c === "prod") return r[10] || "";
    if (DEF[c].arr) return String(r[0]);
    return String(r.id || "");
  }

  /* ---------- apply one collection to its array (in place) ---------- */
  function apply(c, arr) {
    var d = DEF[c], cd = D && D.c && D.c[c];
    if (!cd || !arr || typeof arr.length !== "number" || HAS.call(arr, "__migovl_" + c)) return;
    try { Object.defineProperty(arr, "__migovl_" + c, { value: D.v, enumerable: false, configurable: true }); } catch (e) { return; }
    try {
      var E = cd.e && typeof cd.e === "object" ? cd.e : {}, H = Array.isArray(cd.h) ? cd.h : [], A = Array.isArray(cd.a) ? cd.a : [];
      var need = {}, hidden = {}, plan = { e: [], h: [], a: [] }, ek = Object.keys(E), i;
      ek.forEach(function (k) { need[k] = 1; }); H.forEach(function (k) { need[String(k)] = 1; hidden[String(k)] = 1; });
      var idx = {};
      if (ek.length || H.length) for (i = 0; i < arr.length; i++) { if (!arr[i]) continue; var k0; try { k0 = d.key(arr[i]); } catch (x) { continue; } if (HAS.call(need, k0) && !HAS.call(idx, k0)) idx[k0] = i; }
      /* 1. edits */
      ek.forEach(function (k) {
        if (!HAS.call(idx, k) || !E[k] || typeof E[k] !== "object") return;
        var r = arr[idx[k]], x = { par: undefined, fp: undefined };
        setFields(c, r, E[k], false, x, idx[k]);
        if (x.par !== undefined || x.fp !== undefined) plan.e.push([idx[k], x]);
        if (c === "facx" && x.fp !== undefined) { var X = VALS.MIGFACX; if (X && X.fp) X.fp[r[0]] = x.fp; }
      });
      /* 2. hides */
      var hi = Object.keys(hidden).filter(function (k) { return HAS.call(idx, k); }).map(function (k) { return idx[k]; }).sort(function (a, b) { return b - a; });
      if (d.hide === "hole") hi.forEach(function (j) { delete arr[j]; plan.h.push(j); });
      else hi.forEach(function (j) { arr.splice(j, 1); });
      /* 3. adds */
      if (!d.noadd) A.forEach(function (f) {
        if (!f || typeof f !== "object" || f.hidden || f.deleted) return;
        if (c === "video" && !/^[A-Za-z0-9_\-]{11}$/.test(String(f.id || ""))) return;
        if (!String(f.id || f.no || f.ref || "")) return;
        var x = { par: undefined, fp: undefined }, r = build(c, d.arr ? [] : {}, f, x);
        arr.push(r); plan.a.push([arr.length - 1, x]);
      });
      PLAN[c] = plan;
      /* the parallel array (MIGOLDFACD / MIGP2F), if it is already assigned */
      if (d.par && PEND[d.par]) { var P = PEND[d.par]; delete PEND[d.par]; par(c, P); }
    } catch (e) { warn(c, e); }
  }
  /* the parallel array by the same index plan as its main array */
  function par(c, P) {
    var pl = PLAN[c];
    if (!pl) { PEND[DEF[c].par] = P; return; }
    if (!P || HAS.call(P, "__migovl_p" + c)) return;
    try { Object.defineProperty(P, "__migovl_p" + c, { value: 1, enumerable: false, configurable: true }); } catch (e) { return; }
    try {
      pl.e.forEach(function (a) { if (a[1].par !== undefined) P[a[0]] = a[1].par; });
      pl.h.forEach(function (j) { delete P[j]; });
      pl.a.forEach(function (a) { P[a[0]] = a[1].par !== undefined ? a[1].par : ""; });
    } catch (e) { warn(c + " (parallel)", e); }
  }
  /* MIGFACX: list + fp (adds of products to fp for edited rows are already written by apply) */
  function applyGlobal(g, v) {
    if (!D || !v) return;
    (GLOB[g] || []).forEach(function (c) {
      var arr = rowOf(c, v);
      if (arr) apply(c, arr);
    });
    if (g === "MIGOLDFACD") par("fac", v);
    if (g === "MIGP2F") par("prod", v);
  }

  /* ---------- English (§4.5.4): tr pairs registered as the data files do ---------- */
  var NUM = /[0-9\u0660-\u0669][0-9\u0660-\u0669,.:%\/\-]*/g, TRP = null;
  function trKey(ar) { return String(ar).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").replace(NUM, "{n}"); }
  function nNum(s) { var m = String(s).match(NUM); return m ? m.length : 0; }
  function addTr(dict, pairs, over) {
    for (var ar in pairs) {
      if (!HAS.call(pairs, ar)) continue;
      var a = neutral(ar), e = neutral(pairs[ar]);
      if (!a || !e || !/[\u0600-\u06FF]/.test(a) || nNum(a) !== nNum(e)) continue;
      var k = trKey(a); if (k === "__proto__") continue;
      if (over || dict[k] == null) dict[k] = e.replace(NUM, "{n}");
    }
  }
  function regTr() {
    if (ADMIN || W.MIGLANG !== "en" || !D || !D.tr || typeof D.tr !== "object") return;
    TRP = D.tr;
    if (W.I18N_EN && typeof W.I18N_EN === "object") { addTr(W.I18N_EN, TRP, true); return; }
    /* the dictionary has not arrived yet (data/i18n.js retries a cut-off download): add the pairs when it is assigned */
    var cur = W.I18N_EN;
    try {
      Object.defineProperty(W, "I18N_EN", { configurable: true, enumerable: true, get: function () { return cur; },
        set: function (v) { cur = v; if (v && typeof v === "object" && TRP) { try { addTr(v, TRP, true); } catch (e) { warn("tr", e); } } } });
    } catch (e) { warn("tr", e); }
  }
  /* public helper for the other site scripts (plans-live.js, settings-live.js): add English pairs when they are missing */
  function trFill(pairs) { if (W.MIGLANG === "en" && W.I18N_EN && typeof W.I18N_EN === "object") try { addTr(W.I18N_EN, pairs, false); } catch (e) { /* ignore */ } }

  /* ---------- the published data ---------- */
  function setData(v) {
    if (!v || typeof v !== "object" || !v.v || D) return;   /* first valid publish wins (a page never mixes two versions) */
    D = v;
    try { regTr(); } catch (e) { warn("tr", e); }
    Object.keys(VALS).forEach(function (g) { applyGlobal(g, VALS[g]); });
    var w = WAIT; WAIT = []; w.forEach(function (fn) { try { fn(D); } catch (e) { warn("listener", e); } });
    if (typeof document !== "undefined" && document && typeof document.addEventListener === "function") ready(function () { try { notices(); } catch (e) { warn("notices", e); } });
  }
  function onData(fn) { if (D) { try { fn(D); } catch (e) { warn("listener", e); } } else WAIT.push(fn); }

  /* accessor setters on the globals the data files assign */
  function hook(obj, name, g) {
    var cur;
    try {
      cur = obj[name];
      Object.defineProperty(obj, name, { configurable: true, enumerable: true,
        get: function () { return cur; },
        set: function (v) { cur = v; VALS[g] = v; if (g === "MIG") { hookMig(v); return; } try { applyGlobal(g, v); } catch (e) { warn(g, e); } } });
    } catch (e) { warn(g, e); return; }
    if (cur !== undefined) { VALS[g] = cur; if (g === "MIG") hookMig(cur); else applyGlobal(g, cur); }
  }
  /* window.MIG (data/projects.js: window.MIG = window.MIG || {}; MIG.PROJECTS = []; … MIG.PROJECTS = MIG.PROJECTS_REAL) */
  function hookMig(m) {
    if (!m || typeof m !== "object" || HAS.call(m, "__migovl")) return;
    try { Object.defineProperty(m, "__migovl", { value: 1, enumerable: false }); } catch (e) { return; }
    hook(m, "PROJECTS", "MIG.PROJECTS");
  }
  if (!ADMIN) {
    ["MIGOLDFAC", "MIGOLDFACD", "MIGOLDP", "MIGP2F", "MIGTEND", "MIGRFQ", "MIGOFFERS", "MIGZONES", "MIGVIDS", "MIGFACX", "REAL"].forEach(function (g) { hook(W, g, g); });
    hook(W, "MIG", "MIG");
    var cur0 = W.MIGOVL_DATA;
    try {
      Object.defineProperty(W, "MIGOVL_DATA", { configurable: true, enumerable: true, get: function () { return D || cur0; },
        set: function (v) { cur0 = v; try { setData(v); } catch (e) { warn("overlay", e); } } });
    } catch (e) { warn("overlay", e); }
    if (cur0) setData(cur0);
  }

  /* ---------- page helpers ---------- */
  function ready(fn) { if (typeof document === "undefined" || !document) return; if (document.readyState === "loading" && document.addEventListener) document.addEventListener("DOMContentLoaded", fn); else fn(); }
  function getArr(c) { var d = DEF[c], g = d.g === "MIG.PROJECTS" ? (W.MIG && W.MIG.PROJECTS) : W[d.g]; return d.sub ? g && g[d.sub] : g; }
  function count(c) { var a = getArr(c), n = 0; if (!a) return 0; if (DEF[c] && DEF[c].hide === "hole") { for (var i = 0; i < a.length; i++) if (a[i]) n++; return n; } return a.length; }
  function idx(c, id) { var a = getArr(c); if (!a || !id) return -1; for (var i = a.length - 1; i >= 0; i--) if (a[i] && idOf(c, a[i]) === String(id)) return i; return -1; }
  function isHidden(c, i) { var a = getArr(c); return !!(a && i >= 0 && i < a.length && !a[i]); }
  var PAGE = { fac: "company.html#", news: "article.html#", award: "winner.html#", event: "event.html#", offer: "offer.html#", proj: "project.html#", zone: "city.html#" };
  function href(c, i) {
    var a = getArr(c), r = a && a[i]; if (!r) return "";
    if (c === "fac") return "company.html#" + (r[16] || i);
    if (c === "facx") return "company.html#x" + i;
    if (c === "news") return "article.html#" + (/^n-/.test(r.id || "") ? r.id : i);
    if (c === "award") return "winner.html#" + (/^a-/.test(r.id || "") ? r.id : i);
    if (c === "opp") return "opportunity.html#" + (W.MIGOID ? String(W.MIGOID(r, i)).toLowerCase() : "md" + (i + 1));
    if (c === "tend") return "tenders/search/#" + encodeURIComponent(r[0]);
    if (c === "rfq") return "rfq/search/#" + encodeURIComponent(r[0]);
    return PAGE[c] ? PAGE[c] + encodeURIComponent(idOf(c, r)) : "";
  }
  function logo(r) { if (!r) return ""; var u = r.length > 15 ? r[15] : r.length === 10 ? r[6] : ""; return okImg(u) && /^(\/media\/u\/|https:)/.test(u) ? u : ""; }
  function image(r) { if (!r) return ""; var u = Array.isArray(r) ? r[9] : (r.image_file || r.img || ""); return okImg(u) ? u : ""; }
  /* unquoted url(): the consumers put this inside style="…" attributes; a validated image URL has no quotes, spaces or parentheses */
  function bg(u) { return okImg(u) ? "background-image:url(" + String(u) + ");background-size:contain;background-position:center;background-repeat:no-repeat" : ""; }
  function imgTag(u, alt, cls) { return okImg(u) ? '<img src="' + esc(u) + '" alt="' + esc(alt || "") + '"' + (cls ? ' class="' + esc(cls) + '"' : "") + ' loading="lazy" decoding="async">' : ""; }
  function inWin(o) { var t = today(); return (!o.start || String(o.start) <= t) && (!o.end || String(o.end) >= t); }
  function EN() { return W.MIGLANG === "en"; }
  function pick(o, k) { return EN() ? (o[k + "_en"] || o[k + "_ar"] || "") : (o[k + "_ar"] || ""); }
  /* the banner strips (site.py SBN_JS calls this for every .sbn before it starts the slider): published banners + hidden built-ins */
  function banners(sec, k) {
    if (!D || !sec || !sec.querySelector) return;
    var st = sec.querySelector(".sbn-stage"); if (!st) return;
    var core = sec.classList && sec.classList.contains("core"), home = W.MIGPAGE === "home";
    var hide = (D.banner_hide || []).map(function (s) { return String(s).replace(/^\//, "").split("?")[0]; });
    [].slice.call(st.querySelectorAll(".sbn-s")).forEach(function (a) {
      var im = a.querySelector("img.fg"), src = im ? String(im.getAttribute("src") || "").replace(/^\//, "").split("?")[0] : "";
      if (src && hide.indexOf(src) > -1) a.parentNode.removeChild(a);
    });
    var L = (Array.isArray(D.banners) ? D.banners : []).filter(function (b) {
      if (!b || !okImg(b.img) || !inWin(b)) return false;
      var p = String(b.place || ""); return core ? p === "partner" : (p === "strategic" || (p === "home" && home));
    }).sort(function (a, b) { return (+a.sort || 0) - (+b.sort || 0); });
    if (!L.length && !hide.length) return;
    var first = st.querySelector(".sbn-s, .sbn-nav");
    L.forEach(function (b) {
      var a = document.createElement("a"), link = okLink(b.link) ? String(b.link) : "", alt = neutral(pick(b, "alt") || pick(b, "title"), 1);
      a.className = "sbn-s"; a.setAttribute("href", link || "register.html#" + (core ? "partner" : "strategic"));
      if (/^https:/i.test(link)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      a.innerHTML = '<img class="bg" src="' + esc(b.img) + '" alt="" aria-hidden="true" loading="lazy"><img class="fg" src="' + esc(b.img) + '" alt="' + esc(alt) + '" loading="lazy">';
      if (first) st.insertBefore(a, first); else st.appendChild(a);
    });
    var sl = [].slice.call(st.querySelectorAll(".sbn-s")), real = sl.filter(function (a) { return !a.classList.contains("sbn-empty"); });
    if (real.length) sl.forEach(function (a) { if (a.classList.contains("sbn-empty")) a.parentNode.removeChild(a); });
    sl = [].slice.call(st.querySelectorAll(".sbn-s"));
    if (!sl.length) { /* every built-in banner hidden and none published: the honest «reserved» placeholder, as the build does */
      var cta = sec.querySelector(".sbn-cta"), e = document.createElement("a");
      e.className = "sbn-s on sbn-empty"; e.setAttribute("href", cta ? cta.getAttribute("href") : "register.html#plans");
      e.innerHTML = "<span>" + esc("مساحة إعلانية محجوزة لـ" + (sec.getAttribute("aria-label") || "")) + "</span>";   /* the build's wording; data/i18n.js translates it */
      st.insertBefore(e, st.firstChild); return;
    }
    sl.forEach(function (a, i) { a.classList.toggle("on", i === 0); });
  }
  /* market categories (market.html CATS = [[key, ar, icon], …]) merged with the published «تصنيفات السوق» */
  function cats(C) {
    C = Array.isArray(C) ? C : []; if (!D || !D.cats || typeof D.cats !== "object") return C;
    var M = D.cats, out = [], seen = {}, tr = {};
    C.forEach(function (c) {
      var k = c && c[0], o = k && HAS.call(M, k) ? M[k] : null; seen[k] = 1;
      if (o && +o.hidden) return;
      out.push(o ? [k, neutral(o.ar, 1) || c[1], neutral(o.icon, 1) || c[2]] : c);
      if (o && o.ar && o.en) tr[o.ar] = o.en;
    });
    Object.keys(M).forEach(function (k) {
      var o = M[k]; if (seen[k] || !o || +o.hidden || !/^[a-z0-9_\-]{1,32}$/.test(k) || !o.ar) return;
      out.push([k, neutral(o.ar, 1), neutral(o.icon, 1) || "📦"]); if (o.en) tr[o.ar] = o.en;
    });
    trFill(tr);
    return out;
  }
  var NCSS = ".mig-ntc{font-size:.9rem;line-height:1.6}.mig-ntc .wrap{display:flex;gap:10px;align-items:center;padding-block:8px}.mig-ntc span{flex:1;min-width:0}.mig-ntc a{font-weight:800;text-decoration:underline;color:inherit}.mig-ntc button{border:0;background:none;color:inherit;font:inherit;font-size:1rem;cursor:pointer;padding:2px 6px}.mig-ntc-info{background:#E8F1FB;color:#0B3B66}.mig-ntc-success{background:#E3F7EA;color:#0B6B35}.mig-ntc-warn{background:#FFF4D6;color:#7A5A00}";
  function lsGet(k) { try { return W.localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (W.localStorage) localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  /* the announcement bar under the header (published «إعلانات الموقع») */
  function notices() {
    if (ADMIN || !D || !Array.isArray(D.notices) || typeof document === "undefined" || !document.querySelector) return;
    var hdr = document.querySelector(".site-hdr"); if (!hdr || document.querySelector(".mig-ntc")) return;
    var pg = W.MIGPAGE || "", L = D.notices.filter(function (n) {
      if (!n || !n.id || !inWin(n)) return false;
      if (Array.isArray(n.pages) && n.pages.length && n.pages.indexOf(pg) < 0) return false;
      return !(+n.dismissible && lsGet("mig-notice-" + n.id + "-" + D.v));
    });
    if (!L.length) return;
    if (!document.getElementById("mig-ntc-css")) { var st = document.createElement("style"); st.id = "mig-ntc-css"; st.textContent = NCSS; (document.head || document.documentElement).appendChild(st); }
    var after = hdr;
    L.slice(0, 3).forEach(function (n) {
      var lv = /^(info|success|warn)$/.test(n.level) ? n.level : "info", t = neutral(pick(n, "text"), 1), d = document.createElement("div");
      if (!t) return;
      d.className = "mig-ntc mig-ntc-" + lv; d.setAttribute("role", "status");
      d.innerHTML = '<div class="wrap"><span>' + esc(t) + "</span>" + (okLink(n.link) ? '<a href="' + esc(n.link) + '"' + (/^https:/i.test(n.link) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(EN() ? "Details" : "التفاصيل") + "</a>" : "")
        + (+n.dismissible ? '<button type="button" aria-label="' + esc(EN() ? "Close" : "إغلاق") + '">✕</button>' : "") + "</div>";
      var b = d.querySelector("button");
      if (b) b.onclick = function () { lsSet("mig-notice-" + n.id + "-" + D.v, "1"); if (d.parentNode) d.parentNode.removeChild(d); };
      after.parentNode.insertBefore(d, after.nextSibling); after = d;
    });
  }
  /* a generated SEO page whose item was hidden or deleted after the build (optional, P-T5) */
  var HUBS = { factories: "/factories/", industrial_products: "/products/", products: "/products/", "tender-item": "/tenders/", tenders: "/tenders/", rfq: "/rfq/", news: "/news/",
    events: "/events/", awards: "/awards/", offers: "/offers/", "industrial-zones": "/industrial-zones/", projects: "/projects/", videos: "/videos/" };
  function hidePathNotice() {
    if (!D || !Array.isArray(D.hp) || typeof location === "undefined" || typeof document === "undefined") return false;
    var p = pathKey(location.pathname), en = /^\/en\//.test(p), q = en ? p.slice(3) : p;
    if (D.hp.indexOf(p) < 0 && D.hp.indexOf(q) < 0) return false;
    var hub = (en ? "/en" : "") + (HUBS[q.split("/")[1]] || "/");
    var m = document.querySelector("main"); if (!m) return false;
    m.innerHTML = '<div class="wrap" style="padding:48px 16px;text-align:center"><h1 style="font-size:1.4rem">' + esc(en ? "This content is not shown at the moment" : "المحتوى ده مش معروض حالياً") + '</h1><p><a href="' + esc(hub) + '">' + esc(en ? "Back to the list" : "ارجع للقائمة") + "</a></p></div>";
    return true;
  }
  /* JSON-friendly copy of the row mapping for the panel */
  function schema() {
    var o = {};
    Object.keys(DEF).forEach(function (c) { var d = DEF[c]; o[c] = { global: d.g, sub: d.sub || "", parallel: d.par || "", array_rows: !!d.arr, hide: d.hide, adds: !d.noadd, id_prefix: d.idp || "", hub: d.hub, fields: cl(d.f) }; });
    return o;
  }

  W.MIGOVL = {
    __migovl: 1, admin: ADMIN,
    get v() { return D ? D.v : 0; }, get data() { return D; },
    schema: schema(), key: function (c, r) { try { return DEF[c] && r ? DEF[c].key(r) : ""; } catch (e) { return ""; } },
    fromRow: fromRow, toRow: toRow, idx: idx, isHidden: isHidden, count: count, href: href, logo: logo, image: image, bg: bg, imgTag: imgTag,
    banners: banners, cats: cats, notices: notices, hidePathNotice: hidePathNotice, onData: onData, trFill: trFill,
    esc: esc, neutral: neutral, okUrl: okUrl, okImg: okImg, okLink: okLink, slugAr: slugAr, pathKey: pathKey, today: today
  };
})();
