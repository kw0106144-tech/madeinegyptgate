#!/usr/bin/env node
/* Dump the site's data/*.js globals to one JSON file for the static SEO build (seo_build.part.py).
   Usage: node tools/dump-data.mjs <dataDir> <outJson>
     e.g. node tools/dump-data.mjs site/data build/data.json
   The data files are browser scripts (window.X = …, IIFEs such as facx.js that merge factories.js), so they are
   evaluated in a vm sandbox in the same order the pages load them. Two passes:
     1. Arabic pass (MIGLANG "ar"): the data itself, exactly as the Arabic pages see it.
     2. English pass (MIGLANG "en", i18n-en.js first): only to collect the English dictionary I18N_EN, including
        the entries the data files add to it in English mode (names, cleaned descriptions, REAL_EN, cities …).
   Nothing here invents or changes data; derived values (governorate of a public-source factory, MIGOID ids) are
   computed with the site's own runtime functions (MIGREG.of, MIGOID). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const [, , dataDirArg, outArg] = process.argv;
if (!dataDirArg || !outArg) {
  console.error("usage: node tools/dump-data.mjs <dataDir> <outJson>");
  process.exit(2);
}
const DATA = path.resolve(dataDirArg);
const OUT = path.resolve(outArg);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// load order matters: regions (MIGREG) → factories (MIGFAC) → facx (merges MIGFAC, pins cities) → the rest
const REQUIRED = ["regions.js", "factories.js", "facx.js", "oldfac.js", "oldfacd.js", "oldprod.js", "oldtend.js", "oldrfq.js", "zones.js", "real.js", "projects.js"];
const OPTIONAL = ["offers.js", "registry.js", "exportmap.js"];

function sandbox(lang) {
  const noop = () => {};
  const el = () => ({ style: {}, dataset: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
  const ctx = {
    console: { log: noop, warn: noop, error: (...a) => console.error("[data]", ...a), info: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, requestAnimationFrame: noop,
    document: { readyState: "complete", write: noop, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: el, documentElement: el(), head: el(), body: el(), cookie: "" },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { hash: "", search: lang === "en" ? "?lang=en" : "", pathname: "/", href: "https://madeinegyptgate.com/", origin: "https://madeinegyptgate.com" },
    navigator: { language: lang, userAgent: "dump-data" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    MIGLANG: lang,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

function run(ctx, file, required) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) {
    if (required) { console.error("dump-data: missing required data file " + p); process.exit(1); }
    console.error("dump-data: optional data file not found, skipped: " + file);
    return false;
  }
  try {
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: file, timeout: 60000 });
    return true;
  } catch (e) {
    console.error("dump-data: error in " + file + ": " + e.message);
    if (required) process.exit(1);
    return false;
  }
}

const fileMeta = {};
for (const f of [...REQUIRED, ...OPTIONAL, "i18n-en.js"]) {
  const p = path.join(DATA, f);
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    fileMeta[f] = { bytes: buf.length, sha1: crypto.createHash("sha1").update(buf).digest("hex"), mtime: fs.statSync(p).mtime.toISOString() };
  }
}

/* the published Control Center edits (ACC-CONTRACT §4.6): data/mig-overlay.js + the overlay pulled by deploy.sh (build/overlay.js) run
   BEFORE the data files, exactly as on the pages; hidden rows of hole collections become null in data.json (indices stay stable) */
function runOverlay(ctx) {
  const f = process.env.MIG_OVERLAY_FILE || path.join(ROOT, "build", "overlay.js");
  if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: "overlay.js", timeout: 10000 });
}
/* ---------- pass 1: Arabic data ---------- */
const A = sandbox("ar");
run(A, "mig-overlay.js", false); runOverlay(A);
for (const f of REQUIRED) run(A, f, true);
for (const f of OPTIONAL) run(A, f, false);

const W = A; // window
const MIGREG = W.MIGREG;
const facxList = (W.MIGFACX && W.MIGFACX.list) || [];
const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

/* export markets: the JS object `var M = {...}` in exportmarket.part.py (page code, read-only here) */
let exportMarkets = null;
try {
  const src = fs.readFileSync(path.join(ROOT, "exportmarket.part.py"), "utf8");
  const m = /var M = (\{[\s\S]*?\n\});\s*\nvar KEYS = (\[[^\]]*\]);/.exec(src);
  if (m) {
    const c2 = vm.createContext({});
    exportMarkets = vm.runInContext("({M: " + m[1] + ", KEYS: " + m[2] + "})", c2, { timeout: 5000 });
    exportMarkets = clone(exportMarkets);
  }
} catch (e) {
  console.error("dump-data: export markets not read: " + e.message);
}

/* facx.js SAME: MIGFAC names whose company facx.js keeps under its researched spelling (the closure does not export it). The
   pages' VFX() test (pages.part.py) uses the same table: a MIGFACX row is one of the 91 MIGFAC companies verified by the platform
   team when its name is a MIGFAC name_ar or the researched spelling of one. */
let facxSame = null;
try {
  const m = /var SAME = (\{[^;]*\});/.exec(fs.readFileSync(path.join(DATA, "facx.js"), "utf8"));
  if (m) facxSame = JSON.parse(m[1]);
} catch (e) {
  console.error("dump-data: facx.js SAME table not read: " + e.message);
}

const real = clone(W.REAL) || {};
const out = {
  meta: { generated_at: new Date().toISOString(), data_dir: DATA, files: fileMeta },
  fac: clone(W.MIGOLDFAC) || [],
  facd: clone(W.MIGOLDFACD) || [],
  facd_pfx: clone(W.MIGOLDFACD_PFX) || {},
  fac_map: clone(W.MIGOLDFAC_MAP) || [],
  fac_urlmap: clone(W.MIGOLDFAC_URLMAP) || {},
  facx: clone(facxList),
  facx_fp: clone(W.MIGFACX && W.MIGFACX.fp) || {},
  facx_raw_sector: clone(W.MIGFACX && W.MIGFACX.rawSector) || {},
  facx_city_en: clone(W.MIGFACX && W.MIGFACX.cityEn) || {},
  facx_same: facxSame || clone(W.MIGFACX && W.MIGFACX.same) || null,
  facx_gov: facxList.map((x) => (MIGREG && MIGREG.of ? MIGREG.of(x[2]) : "") || ""),
  migfac: clone(W.MIGFAC) || [],
  prod: clone(W.MIGOLDP) || [],
  p2f: clone(W.MIGP2F) || [],
  prod_map: clone(W.MIGOLDP_MAP) || [],
  tend: clone(W.MIGTEND) || [],
  rfq: clone(W.MIGRFQ) || [],
  zones: clone(W.MIGZONES) || [],
  real,
  real_oid: (real.tenders || []).map((t, i) => (!t ? null : W.MIGOID ? W.MIGOID(t, i) : "MD" + (i + 1))),   // a hidden opportunity is null
  projects_real: clone(W.MIG && W.MIG.PROJECTS_REAL) || [],
  project_stages: clone(W.MIG && W.MIG.STAGES) || [],
  offers: clone(W.MIGOFFERS) || [],
  regions: MIGREG ? clone(MIGREG.list) : [],
  region_img: MIGREG && MIGREG.img ? Object.fromEntries((MIGREG.list || []).map((r) => [r[0], MIGREG.img(r[0])])) : {},
  sectors: clone(W.MIGSECTORS) || [],
  inc_bits: clone(W.MIGINC && W.MIGINC.bits) || {},
  reg: W.REG ? { companies: clone(W.REG.companies) || [], agencies: clone(W.REG.agencies) || [] } : { companies: [], agencies: [] },
  export_markets: exportMarkets,
  i18n_en: {},
  overlay: W.MIGOVL_DATA ? { v: W.MIGOVL_DATA.v, at: W.MIGOVL_DATA.at } : null,   // P-B4 writes /_seo/overlay-baked.json from it
};

/* ---------- pass 2: English dictionary ---------- */
const E = sandbox("en");
if (run(E, "i18n-en.js", false)) {
  run(E, "mig-overlay.js", false); runOverlay(E);   /* English of edited / added texts (tr) lands in I18N_EN */
  for (const f of REQUIRED) run(E, f, true);
  for (const f of OPTIONAL) run(E, f, false);
  out.i18n_en = clone(E.I18N_EN) || {};
  out.real_en = clone(E.REAL_EN) || {};
} else {
  out.real_en = clone(W.REAL_EN) || {};
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = OUT + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(out));
fs.renameSync(tmp, OUT);
const n = (k) => (Array.isArray(out[k]) ? out[k].length : Object.keys(out[k] || {}).length);
console.log(`dump-data: ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB) fac=${n("fac")} facx=${n("facx")} prod=${n("prod")} tend=${n("tend")} rfq=${n("rfq")} zones=${n("zones")} news=${(real.news || []).length} events=${(real.events || []).length} awards=${(real.awards || []).length} tenders=${(real.tenders || []).length} intl=${(real.tenders_intl || []).length} projects=${n("projects_real")} offers=${n("offers")} i18n=${n("i18n_en")}`);
