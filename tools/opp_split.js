/* Members-only opportunities (owner decision 2026-11-28): the split of the public data files.
   Tenders, RFQs, project news, procurement news, contract awards and contractor material requests are FOR MEMBERS: a visitor sees the
   lists with their titles (sector, governorate, country, dates, status); the details (issuing / awarding entity, winner, source link,
   documents, value, bond, description, the issuer's procurement address, contractor / owner / consultant) are read only from the Worker
   (GET /api/me/opps, worker/src/opp-lock.js) by a signed-in member whose plan covers them.

   The repository keeps the FULL records (tools/daily_media/merge.py and the Control Center keep writing them as before). This module
   makes the split at build time:
     - the site build (site.py) writes the REDACTED copies of the data files into <out>/data/ (real files instead of the symlinks into
       the repository), so the published /data/*.js files carry the teaser fields only;
     - worker/build-items.js puts the locked fields into worker/src/items.json `L` (bundled into the Worker's code, never served as a
       file), in the same shape the browser patches back (data/opp-full.js).
   Keys (the browser computes the same ones, data/opp-full.js): t = MIGTEND «ref|title» (+ «#n» for the n-th repeat), q = MIGRFQ no,
   rt = REAL.tenders id (else title), ri = REAL.tenders_intl «ref|title», ra = REAL.awards «title|date», rn = procurement news
   «title|date», p = MIG.PROJECTS_REAL id, l = MIG.LEADS id; en = the English of the locked texts, removed from the public dictionaries.
   Node, no dependencies. CLI: node tools/opp_split.js --data <dir> --out <dir>  (writes the redacted files, prints a JSON summary)
                              node tools/opp_split.js --data <dir> --locked <file.json> */
"use strict";
const fs = require("fs"), path = require("path");

/* the files with locked fields (everything else under data/ is published as it is) */
const FILES = ["oldtend.js", "oldrfq.js", "real.js", "projects.js"];
/* MIGTEND: 4 entity, 7 booklet, 8 bond, 11 source url, 14 description, 15 the issuer's procurement address */
const TEND_LOCK = [4, 7, 8, 11, 14, 15];
/* MIGRFQ: 3 details, 4 delivery, 5 quantity, 10 English details (8 = the platform's own page, kept) */
const RFQ_LOCK = [3, 4, 5, 10];
const RT_LOCK = ["entity_ar", "entity_en", "bid_bond_egp", "booklet_price_egp", "source_url", "detail_url", "via", "estimated_value_sar", "estimated_value", "estimated_value_egp", "currency",
  "details_ar", "details_en", "description_ar", "description_en", "contacts"];
const RI_LOCK = ["entity_ar", "entity_en", "estimated_value", "currency", "source_name", "source_url", "detail_url", "details_ar", "details_en", "description_ar", "description_en"];
/* an award's winner, awarding entity, values (EGP / USD / EUR / its own currency: value_million + currency), source and reference
   (tools/daily_media/merge.py 2026-11-28); kept: title, market, kind, sector, country, governorate, city, date */
const RA_LOCK_RX = /^(winner_|awarding_entity|value_|source_|entity_|details_|amount|currency$|ref$|detail_url$)/;
const RN_LOCK = ["summary_ar", "summary_en", "url", "source_name", "image_url", "image_file"];
/* MIG.PROJECTS_REAL: 6 value, 7 owner, 8 contractor, 9 consultant, 12 progress %, 13 packages, 14 updates (the project news: the dates
   stay, the text is locked), 15 source url. Kept: 0 id, 1 name, 2 governorate, 3 location, 4 sector, 5 stage, 10 start, 11 end, 16 photo */
const PROJ_BLANK = { 6: null, 7: "", 8: "", 9: "", 12: null, 13: [], 15: "" };
/* MIG.LEADS: 5 quantity, 6 unit, 8 deadline days, 9 budget, 10 notes, 11 source url (2 the contractor, 4 the title: the list's teaser) */
const LEAD_LOCK = [5, 6, 8, 9, 10, 11];
const PROCUREMENT = "أخبار المشتريات";

const s = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const tendKey = (t, seen) => { const k = s(t[0]) + "|" + s(t[3]), n = (seen[k] = (seen[k] || 0) + 1); return n > 1 ? k + "#" + n : k; };
const rtKey = r => s(r.id) || s(r.title_ar);
const riKey = r => s(r.ref) + "|" + s(r.title_ar);
const raKey = r => s(r.title_ar) + "|" + s(r.date);
const isProc = n => n && s(n.category_ar) === PROCUREMENT;

/* the JSON value that starts at text[i] ('[' or '{'): its end index (exclusive), strings and escapes respected */
function jsonEnd(text, i) {
  let depth = 0, str = false;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (str) { if (ch === "\\") k++; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") { depth--; if (!depth) return k + 1; }
  }
  return -1;
}
/* replace the JSON value assigned by `lhs` («window.MIGTEND=», «MIG.PROJECTS_REAL =», «var A =») — fn(value) returns the new value;
   a missing assignment leaves the text as it is (returns found: false) */
function editJson(text, lhs, fn) {
  const rx = new RegExp("(^|[\\n;{(]\\s*)" + lhs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s*=\s*$/, "\\s*=\\s*"), "m"), m = rx.exec(text);
  if (!m) return { text, found: false };
  const start = m.index + m[0].length, end = jsonEnd(text, start);
  if (end < 0) throw new Error("opp_split: unterminated JSON after " + lhs);
  const v = JSON.parse(text.slice(start, end)), nv = fn(v);
  return { text: text.slice(0, start) + JSON.stringify(nv) + text.slice(end), found: true };
}
function readJson(text, lhs) { let out; editJson(text, lhs, v => { out = v; return v; }); return out; }

/* the English twins of the locked Arabic texts leave the public dictionaries too (REAL_EN, MIGPROJ_EN, oldtend.js A):
   exact key, or the key with its digit runs as {n} (data/i18n.js) */
const nKey = t => s(t).replace(/[0-9٠-٩][0-9٠-٩.,٫٬]*/g, "{n}");
function pruneDict(d, locked, en) {
  if (!d || typeof d !== "object") return d;
  const out = {};
  for (const k of Object.keys(d)) { const kk = s(k); if (locked.has(kk) || locked.has(nKey(kk))) en[k] = d[k]; else out[k] = d[k]; }
  return out;
}

/* texts: {name: file text} for FILES (a missing file is skipped) → {files: {name: redacted text}, locked: {...}, counts} */
function split(texts) {
  const L = { t: {}, q: {}, rt: {}, ri: {}, ra: {}, rn: {}, p: {}, l: {}, en: {} }, lockedText = new Set(), files = {}, counts = {};
  const keep = v => { const t = s(v); if (t.length > 1) { lockedText.add(t); lockedText.add(nKey(t)); } };
  /* 1. collect + redact (the dictionaries are pruned in step 2, once every locked text is known) */
  let tx = texts["oldtend.js"];
  if (tx != null) {
    const seen = {};
    tx = editJson(tx, "window.MIGTEND=", rows => rows.map(t => {
      if (!Array.isArray(t)) return t;
      const k = tendKey(t, seen), v = TEND_LOCK.map(i => (t[i] == null ? "" : t[i]));
      if (v.some(x => x !== "" && x != null)) L.t[k] = v;
      TEND_LOCK.forEach(i => { if (i === 4 || i === 14 || i === 15) keep(t[i]); if (i < t.length) t[i] = ""; });
      return t;
    })).text;
    files["oldtend.js"] = tx; counts.t = Object.keys(L.t).length;
  }
  tx = texts["oldrfq.js"];
  if (tx != null) {
    tx = editJson(tx, "window.MIGRFQ=", rows => rows.map(q => {
      if (!Array.isArray(q)) return q;
      const v = RFQ_LOCK.map(i => (q[i] == null ? "" : q[i]));
      if (v.some(x => x !== "")) L.q[s(q[0])] = v;
      RFQ_LOCK.forEach(i => { keep(q[i]); if (i < q.length) q[i] = ""; });
      return q;
    })).text;
    files["oldrfq.js"] = tx; counts.q = Object.keys(L.q).length;
  }
  tx = texts["real.js"];
  if (tx != null) {
    tx = editJson(tx, "window.REAL=", R => {
      const cut = (list, key, test, bucket) => (list || []).map(r => {
        if (!r || typeof r !== "object") return r;
        const o = {}, rest = {};
        for (const k of Object.keys(r)) { if (test(k)) { o[k] = r[k]; if (typeof r[k] === "string") keep(r[k]); } else rest[k] = r[k]; }
        if (Object.keys(o).length) bucket[key(r)] = o;
        return rest;
      });
      R.tenders = cut(R.tenders, rtKey, k => RT_LOCK.includes(k), L.rt);
      R.tenders_intl = cut(R.tenders_intl, riKey, k => RI_LOCK.includes(k), L.ri);
      /* the market / country of each international tender is public (the list shows it): kept beside the locked fields for the server's
         plan check (opp-lock.js) */
      for (const r of R.tenders_intl || []) if (r && L.ri[riKey(r)]) Object.assign(L.ri[riKey(r)], { _m: s(r.market), _c: s(r.country_ar) });
      R.awards = cut(R.awards, raKey, k => RA_LOCK_RX.test(k), L.ra);
      R.news = (R.news || []).map(n => (isProc(n) ? cut([n], raKey, k => RN_LOCK.includes(k), L.rn)[0] : n));
      return R;
    }).text;
    files["real.js"] = tx;
    counts.rt = Object.keys(L.rt).length; counts.ri = Object.keys(L.ri).length; counts.ra = Object.keys(L.ra).length; counts.rn = Object.keys(L.rn).length;
  }
  tx = texts["projects.js"];
  if (tx != null) {
    tx = editJson(tx, "MIG.PROJECTS_REAL =", rows => rows.map(p => {
      if (!Array.isArray(p)) return p;
      const o = {};
      for (const i of Object.keys(PROJ_BLANK)) if (+i < p.length) { o[i] = p[i]; if (typeof p[i] === "string") keep(p[i]); p[i] = PROJ_BLANK[i]; }
      if (Array.isArray(p[14])) { o[14] = p[14]; p[14] = p[14].map(u => (Array.isArray(u) ? (keep(u[1]), [u[0], ""]) : u)); }
      L.p[s(p[0])] = o;
      return p;
    })).text;
    tx = editJson(tx, "MIG.LEADS_UNVERIFIED =", () => []).text;   /* never read by a page (data/projects.js header) */
    tx = editJson(tx, "MIG.LEADS =", rows => rows.map(l => {
      if (!Array.isArray(l)) return l;
      const o = {};
      for (const i of LEAD_LOCK) if (i < l.length) { o[i] = l[i]; keep(l[i]); l[i] = ""; }
      L.l[s(l[0])] = o;
      return l;
    })).text;
    files["projects.js"] = tx; counts.p = Object.keys(L.p).length; counts.l = Object.keys(L.l).length;
  }
  /* 2. the English of the locked texts */
  if (files["real.js"]) files["real.js"] = editJson(files["real.js"], "window.REAL_EN=", d => pruneDict(d, lockedText, L.en)).text;
  if (files["projects.js"]) files["projects.js"] = editJson(files["projects.js"], "window.MIGPROJ_EN=", d => pruneDict(d, lockedText, L.en)).text;
  if (files["oldtend.js"]) files["oldtend.js"] = editJson(files["oldtend.js"], "var A =", d => pruneDict(d, lockedText, L.en)).text;
  counts.en = Object.keys(L.en).length;
  return { files, locked: L, counts };
}

function readFiles(dir) {
  const texts = {};
  for (const f of FILES) { const p = path.join(dir, f); if (fs.existsSync(p)) texts[f] = fs.readFileSync(p, "utf8"); }
  return texts;
}
const splitDir = dir => split(readFiles(dir));

module.exports = { FILES, TEND_LOCK, RFQ_LOCK, RT_LOCK, RI_LOCK, RN_LOCK, LEAD_LOCK, PROCUREMENT, split, splitDir, editJson, readJson, jsonEnd, tendKey, rtKey, riKey, raKey, nKey };

if (require.main === module) {
  const a = process.argv.slice(2), opt = {};
  for (let i = 0; i < a.length; i += 2) opt[a[i].replace(/^--/, "")] = a[i + 1];
  const dir = opt.data || path.join(__dirname, "..", "data");
  const r = splitDir(dir);
  if (opt.out) {
    fs.mkdirSync(opt.out, { recursive: true });
    for (const [f, t] of Object.entries(r.files)) {
      const p = path.join(opt.out, f);
      try { if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p); } catch (e) { /* not there */ }
      fs.writeFileSync(p, t);
    }
  }
  if (opt.locked) fs.writeFileSync(opt.locked, JSON.stringify(r.locked));
  console.log(JSON.stringify({ files: Object.keys(r.files), counts: r.counts }));
}
