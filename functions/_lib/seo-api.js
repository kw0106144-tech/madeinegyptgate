/* /api/seo/* — admin API of the edge SEO layer (docs/janna/SEO-SPEC.md §2.4–2.5), served by the Pages Function
   functions/api/seo/[[path]].js. Same-origin JSON (no CORS header), errors {error, code} like the Worker.
   Auth (seo-auth.js): platform login token (Bearer, v2 HMAC) + role admin (or "seo"); X-Platform-Key only for
   GET /health, GET /export.csv, GET /export.json and POST /indexnow.
   Admin-only (403 admin_only for the seo role): search-engine verification tokens (they make the holder an owner in
   Search Console), robots lines that shut any crawler out of the whole site, and rollbacks that would change either.
   Override text and JSON-LD are public page text: phones / WhatsApp numbers / e-mails are refused (seo-privacy.js).
   Preview deployments (*.<project>.pages.dev) are read-only (403 preview_read_only) unless SEO_PREVIEW_WRITES = "1".

   Storage = Workers KV binding SEO_KV (no D1 tables needed):
     seo:bundle / seo:bundle:prev  the bundle the middleware applies (+ admin metadata under "meta"); every change writes
                                   prev then bundle (rollback = swap). Edge visibility: same isolate at once, elsewhere
                                   ≤ SEO_TTL (60 s) + KV cache (60 s).
     seo:log                       change history (newest first, ≤ 1,000 entries / ~1 MB)
     seo:keywords                  keyword clusters (seeded from the build's /_seo/keywords.json until first saved)
     seo:gsc:pages|queries         Search Console Performance CSV imports
     seo:indexnow:log, seo:indexnow:day:<date>, seo:rebuild:last   IndexNow log, daily cap (20), rebuild throttle (10 min)
     seo:indexnow:sent             per page, the state it was last sent to IndexNow in ("<lastmod>|<override saved at>")
   Endpoints (path relative to /api/seo):
     GET  /health                         → {ok, kv, d1, auth, role, bundle_v, bundle_bytes, overrides, redirects, build_redirects, manifest, deploy_hook, indexnow, gsc}
     GET  /pages?type=&lang=&q=&issue=&override=1&sort=score|-score|path&limit≤500&offset=   → {total, items, summary}
     GET  /page?path=                     → {defaults, override, meta, effective, score, issues, history[≤50], bundle_v}
     PUT  /page {path, title?, description?, keywords?, h1?, intro?, canonical?, robots?, og_title?, og_description?, og_image?,
                 jsonld?, target_kw?, secondary_kw?[], note?, ping_indexnow?, force?}  PUT replaces the page's override fields
                 (absent = build default), PATCH changes only the fields sent ("" / null removes one); target_kw /
                 secondary_kw / note always merge     → {ok, override, meta, bundle_v, warnings, indexnow?}
     DELETE /page?path=                   → {ok, removed, bundle_v}
     POST /rollback                       → {ok, bundle_v, restored}
     GET  /overrides                      → {items:[{path, fields, target_kw, secondary_kw, note, updated_by, updated_at}]}
     GET  /history?ref=&kind=&limit=      → {items}
     GET  /export.csv?kind=overrides|redirects|pages (+ pages filters)   → text/csv, UTF-8 with BOM
     GET  /export.json                    → {v, at, ov, rd, cfg}   (for tools/seo-pull.mjs → build/seo-overrides.json)
     POST /import?kind=overrides|redirects&dry_run=1[&force=1]  body text/csv ≤ 2 MB, ≤ 5,000 rows
                                          → {dry_run, applied, create, update, unchanged, delete, errors:[{line, field, msg}], warnings}
     GET  /redirects?q=                   → {admin:[{from, to, code, note, …}], build_count}
     POST /redirects {from, to, code: 301|302|410, note}   → {ok, redirect, collapsed, repointed, warnings, bundle_v}
     DELETE /redirects?from=              → {ok, bundle_v}
     GET  /test?url=                      → {chain:[{url, status, location}], hops, final_status, warning}
     GET  /config                         → {verify, robots_extra, indexnow_key, indexnow_key_set, thresholds, site}
     PUT  /config {verify?, robots_extra?, thresholds?, confirm_block_all?}   → {ok, bundle_v}
     POST /indexnow/key                   → {key, key_url, bundle_v}
     POST /indexnow {urls?:[…≤10,000], since?: ISO, all?: true, resend?: true}   → {ok, sent, status, message, skipped}
                                          (since skips pages already sent in their current state: ledger seo:indexnow:sent)
     GET  /indexnow/log                   → {items}
     POST /rebuild                        → {ok, triggered_at} | {ok:false, reason:"deploy_hook_not_configured"}
     GET  /keywords ; PUT /keywords {cluster, target_url, target_kw, secondary_kw[], difficulty} | {items:[…]}
     POST /gsc/import (text/csv: Search Console → Performance → Export, Pages or Queries) → {ok, kind, rows}
     GET  /gsc?page=&query=               → {connected:false, source:"csv"|"none", rows} */
import {
  KV_BUNDLE, KV_PREV, EMPTY, VERIFY_META, VERIFY_RX, ROBOTS_LINE_RX, ROBOTS_VALUES,
  siteOrigin, normPath, altSlash, lookup, samePage, targetPath, absUrl, sanitizeBundle, setBundleMemo, loadBundle, edgeTtlMs,
  assetFetch, loadAssetJson, loadRedirects, cleanRobotsExtra, indexNowKeys,
} from "./seo-edge.js";
import { resolveCaller, authMode } from "./seo-auth.js";
import { scorePage, DEFAULT_THRESHOLDS, ISSUES, normAr, clen } from "./seo-score.js";
import { allowList, findContacts, findJsonLdContacts, CONTACT_MSG } from "./seo-privacy.js";

const KV_LOG = "seo:log", KV_KW = "seo:keywords", KV_GSC = "seo:gsc:", KV_INX_LOG = "seo:indexnow:log", KV_INX_DAY = "seo:indexnow:day:", KV_REBUILD = "seo:rebuild:last";
const KV_INX_SENT = "seo:indexnow:sent"; // {at, m:{path: "<manifest lastmod>|<override updated_at>"}} = the state each page was last sent in
const MAX_BUNDLE = 5 * 1024 * 1024, MAX_IMPORT = 2 * 1024 * 1024, MAX_ROWS = 5000, MAX_URLS = 10000, INDEXNOW_PER_DAY = 20;
const own = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const utf8len = s => new TextEncoder().encode(s).length;
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const yes = v => /^(1|true|yes|on)$/i.test(String(v == null ? "" : v));
const nowIso = () => new Date().toISOString();
const hosts = site => { const h = new URL(site).host; return [h, h.startsWith("www.") ? h.slice(4) : "www." + h]; };

/* ---------- responses ---------- */
const HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
export const json = (o, s = 200, h) => new Response(JSON.stringify(o), { status: s, headers: { ...HDR, ...(h || {}) } });
export const err = (s, code, error, extra) => json({ error: error || code, code, ...(extra || {}) }, s);
export class ApiError extends Error { constructor(s, code, msg, extra) { super(msg || code); this.s = s; this.code = code; this.extra = extra; } }
const fail = (s, code, msg, extra) => { throw new ApiError(s, code, msg, extra); };
/* Search-console verification tokens make their holder an OWNER of the site in Google / Bing / Yandex (owners can hide
   the whole site with the Removals tool), and a whole-site robots block drops every page: both are admin-only. The SEO
   role (spec: «Restricted» in Search Console) keeps everything else. */
const ADMIN_ONLY = what => fail(403, "admin_only", `only an admin can change ${what}`);
async function readText(req, max) {
  if ((+req.headers.get("Content-Length") || 0) > max) fail(413, "too_large", "request too large");
  const t = await req.text();
  if (t.length > max) fail(413, "too_large", "request too large");
  return t;
}
async function readBody(req, max = 65536) {
  const t = await readText(req, max);
  if (!t.trim()) return {};
  let o; try { o = JSON.parse(t); } catch (e) { fail(400, "bad_json", "bad json"); }
  if (!o || typeof o !== "object" || Array.isArray(o)) fail(400, "bad_json", "bad json");
  return o;
}

/* ---------- validation (spec §2.5) ---------- */
export const OV_FIELDS = ["title", "description", "keywords", "h1", "intro", "canonical", "robots", "og_title", "og_description", "og_image", "jsonld"];
export const META_FIELDS = ["target_kw", "secondary_kw", "note"];
const LIMITS = { title: [1, 120], h1: [1, 120], og_title: [1, 120], description: [1, 320], og_description: [1, 320], keywords: [1, 255], intro: [1, 1200] };
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/* plain one-line text: control characters stripped, whitespace collapsed */
export const plain = v => (v == null ? "" : String(v).replace(CTRL, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim());
const ctxOk = c => (typeof c === "string" ? /schema\.org/i.test(c) : Array.isArray(c) ? c.some(ctxOk) : !!c && typeof c === "object" && ctxOk(c["@vocab"] || ""));
export const schemaCtxOk = j => (Array.isArray(j) ? j.length > 0 && j.every(x => !!x && typeof x === "object" && ctxOk(x["@context"])) : !!j && typeof j === "object" && ctxOk(j["@context"]));
function siteUrl(v, site) {
  try { const u = new URL(String(v).trim()); return u.protocol === "https:" && u.host === new URL(site).host && !u.hash && !String(v).includes("#") ? u.href : null; } catch (e) { return null; }
}
function httpsUrl(v, max) {
  const s = String(v).trim();
  if (s.length > max || /\s/.test(s)) return null;
  try { const u = new URL(s); return u.protocol === "https:" && u.href.length <= max ? u.href : null; } catch (e) { return null; }
}
/* → {fields, errors:[{field, msg}]} — empty / null values mean "not overridden".
   Override text is public page text: phones / WhatsApp numbers / e-mails are refused (owner rule, seo-privacy.js). */
const PUBLIC_TEXT = new Set(["title", "description", "keywords", "h1", "intro", "og_title", "og_description"]);
export function validateOverride(b, site, allow = allowList()) {
  const fields = {}, errors = [], bad = (field, msg) => errors.push({ field, msg });
  const contact = (f, found) => bad(f, `${CONTACT_MSG} — ${f}: «${found.map(c => c.value).slice(0, 3).join("», «")}»`);
  for (const f of OV_FIELDS) {
    const raw = b[f];
    if (raw == null || raw === "") continue;
    if (f === "jsonld") {
      let s = raw;
      if (typeof s !== "string") { try { s = JSON.stringify(s); } catch (e) { bad(f, "jsonld is not valid JSON"); continue; } }
      if (!s.trim()) continue;
      if (utf8len(s) > 20480) { bad(f, "jsonld must be at most 20 KB"); continue; }
      let j; try { j = JSON.parse(s); } catch (e) { bad(f, "jsonld is not valid JSON: " + String(e.message).slice(0, 120)); continue; }
      if (!schemaCtxOk(j)) { bad(f, 'jsonld needs a top-level "@context" with schema.org'); continue; }
      const found = findJsonLdContacts(j, allow);
      if (found.length) { contact(f, found); continue; }
      fields.jsonld = JSON.stringify(j);
      continue;
    }
    if (typeof raw !== "string") { bad(f, f + " must be text"); continue; }
    if (LIMITS[f]) {
      const s = plain(raw);
      if (!s) continue;
      const n = clen(s);
      const found = PUBLIC_TEXT.has(f) ? findContacts(s, allow) : [];
      if (n < LIMITS[f][0] || n > LIMITS[f][1]) bad(f, `${f} must be ${LIMITS[f][0]}–${LIMITS[f][1]} characters (now ${n})`);
      else if (found.length) contact(f, found);
      else fields[f] = s;
    } else if (f === "canonical") {
      const u = siteUrl(raw, site);
      if (!u) bad(f, `canonical must be an absolute ${site}/… URL without #`); else fields[f] = u;
    } else if (f === "robots") {
      const r = raw.toLowerCase().replace(/\s+/g, "");
      if (!ROBOTS_VALUES.includes(r)) bad(f, "robots must be one of: " + ROBOTS_VALUES.join(" | ")); else fields[f] = r;
    } else if (f === "og_image") {
      const u = httpsUrl(raw, 500);
      if (!u) bad(f, "og_image must be an https URL (at most 500 characters)"); else fields[f] = u;
    }
  }
  return { fields, errors };
}
export function validateMeta(b) {
  const meta = {}, errors = [];
  const tk = plain(b.target_kw);
  if (tk) { if (clen(tk) > 120) errors.push({ field: "target_kw", msg: "target_kw is longer than 120 characters" }); else meta.target_kw = tk; }
  if (b.secondary_kw != null && b.secondary_kw !== "") {
    const list = (Array.isArray(b.secondary_kw) ? b.secondary_kw : String(b.secondary_kw).split("|")).map(plain).filter(Boolean);
    if (list.length > 20 || list.some(s => clen(s) > 120)) errors.push({ field: "secondary_kw", msg: "at most 20 secondary keywords of ≤ 120 characters" });
    else if (list.length) meta.secondary_kw = [...new Set(list)];
  }
  const note = plain(b.note);
  if (note) { if (clen(note) > 500) errors.push({ field: "note", msg: "note is longer than 500 characters" }); else meta.note = note; }
  return { meta, errors };
}
export function checkPath(p) {
  const raw = typeof p === "string" ? p.trim() : "";
  if (!raw) fail(400, "invalid_path", "path is required", { field: "path" });
  if (!raw.startsWith("/") && !/^https?:\/\//i.test(raw)) fail(400, "invalid_path", 'path must start with "/"', { field: "path" });
  const path = normPath(raw);
  if (/^\/(api|_seo)(\/|$)/i.test(path)) fail(400, "invalid_path", "/api/ and /_seo/ cannot be overridden", { field: "path" });
  if (clen(path) > 512) fail(400, "invalid_path", "path is longer than 512 characters", { field: "path" });
  return path;
}
/* → {from, to, code, note, errors}; `to` is stored as a same-site path (absolute same-site URLs are reduced to their path) */
export function validateRedirect(b, site) {
  const errors = [], bad = (field, msg) => errors.push({ field, msg }), H = hosts(site);
  let fromRaw = typeof b.from === "string" ? b.from.trim() : "", from = "";
  if (!fromRaw) bad("from", "from is required");
  else {
    if (/^https?:\/\//i.test(fromRaw)) {
      try { const u = new URL(fromRaw); if (!H.includes(u.host)) bad("from", "from must be on " + H[0]); if (u.search || u.hash) bad("from", "from must be a path without ? or #"); fromRaw = u.pathname; }
      catch (e) { bad("from", "from is not a valid URL"); }
    } else if (!fromRaw.startsWith("/")) bad("from", 'from must start with "/"');
    else if (/[?#]/.test(fromRaw)) bad("from", "from must be a path without ? or #");
    from = normPath(fromRaw);
    if (from === "/") bad("from", 'the home page "/" cannot be redirected');
    if (/^\/(api|_seo)(\/|$)/i.test(from)) bad("from", "/api/ and /_seo/ cannot be redirected");
    if (clen(from) > 512) bad("from", "from is longer than 512 characters");
  }
  const code = b.code == null || b.code === "" ? 301 : +b.code;
  if (![301, 302, 410].includes(code)) bad("code", "code must be 301, 302 or 410");
  let to = "";
  if (code !== 410) {
    const t = typeof b.to === "string" ? b.to.trim() : "";
    if (!t) bad("to", "to is required (or use code 410)");
    else if (/[\\\s\u0000-\u001f]/.test(t)) bad("to", "to must not contain spaces or backslashes");
    else if (/^https?:\/\//i.test(t)) {
      try { const u = new URL(t); if (u.protocol !== "https:" || !H.includes(u.host)) bad("to", "to must be a path or an https URL on " + H[0]); else to = u.pathname + u.search + u.hash; }
      catch (e) { bad("to", "to is not a valid URL"); }
    } else if (!t.startsWith("/") || t.startsWith("//")) bad("to", 'to must start with "/" (this site)');
    else to = t;
    if (to && clen(to) > 1024) bad("to", "to is longer than 1,024 characters");
    const tp = to ? normPath(to.split(/[?#]/)[0]) : "";
    if (tp && from && (tp === from || altSlash(tp) === from)) bad("to", "redirect loop: to is the same page as from");
  }
  const note = plain(b.note).slice(0, 500);
  return { from, to, code, note, errors };
}
/* follow `to` through the admin table (and the build's exact map) → {to} final target, {loop}, or {gone} */
export function collapseTarget(rd, R, from, to) {
  const seen = new Set([from]);
  let cur = to;
  for (let i = 0; i < 10; i++) {
    const p = normPath(String(cur).split(/[?#]/)[0]), alt = altSlash(p);
    if (seen.has(p) || (alt && seen.has(alt))) return { loop: true };
    seen.add(p);
    const a = lookup(rd, p);
    if (a && typeof a === "object" && !samePage(targetPath(a.to), p)) { if (+a.code === 410) return { gone: true, to: cur }; cur = a.to; continue; }
    const e = R && lookup(R.exact, p);
    if (e && !samePage(targetPath(e), p)) { cur = e; continue; }
    return { to: cur, collapsed: i > 0 };
  }
  return { loop: true };
}
/* collapse every chain in the admin table (after a save or an import) → list of re-pointed `from` paths */
export function flattenAll(rd, R) {
  const changed = [];
  for (const [f, r] of Object.entries(rd)) {
    if (!r || typeof r !== "object" || +r.code === 410 || !r.to) continue;
    const c = collapseTarget(rd, R, f, r.to);
    if (!c.loop && !c.gone && c.to && c.to !== r.to) { rd[f] = { ...r, to: c.to }; changed.push(f); }
  }
  return changed;
}
/* a Disallow value that matches EVERY path ("/", "/*", "*", "/*$" …: Google reads * as any characters and $ as the end) */
export const disallowsAll = v => v === "/" || /^\/?\*+\$?$/.test(v);
/* user agents a robots_extra list shuts out of the whole site (lower case; "*" = every crawler) */
export function blockedAgents(lines) {
  const out = new Set();
  let uas = [], inRules = false;
  for (const l of Array.isArray(lines) ? lines : []) {
    const s = String(l == null ? "" : l).trim(), i = s.indexOf(":");
    if (!s || i < 0) continue;
    const k = s.slice(0, i).trim().toLowerCase(), v = s.slice(i + 1).trim();
    if (k === "user-agent") { if (inRules) { uas = []; inRules = false; } if (v) uas.push(v.toLowerCase()); }
    else if (k !== "sitemap") { inRules = true; if (k === "disallow" && disallowsAll(v)) for (const u of uas) out.add(u); }
  }
  return [...out].sort();
}
/* prev = the lines saved now: only agents NEWLY shut out of the whole site need confirm_block_all (and an admin) */
export function validateRobotsExtra(input, confirmBlockAll, prev) {
  const lines = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : null;
  if (!lines) return { lines: [], errors: [{ field: "robots_extra", msg: "robots_extra must be a list of lines" }] };
  const out = [], errors = [];
  let uas = [], inRules = false;
  if (lines.length > 100) errors.push({ field: "robots_extra", msg: "at most 100 lines" });
  lines.slice(0, 100).forEach((l, i) => {
    const s = String(l == null ? "" : l).replace(CTRL, "").trim();
    if (!s) { out.push(""); return; }
    if (s.length > 200 || !ROBOTS_LINE_RX.test(s)) { errors.push({ field: "robots_extra", line: i + 1, msg: `line ${i + 1}: use "User-agent|Allow|Disallow|Crawl-delay|Sitemap: value" (no "#")` }); return; }
    const k = s.slice(0, s.indexOf(":")).trim().toLowerCase(), v = s.slice(s.indexOf(":") + 1).trim();
    if (k === "user-agent") { if (inRules) { uas = []; inRules = false; } if (!v) errors.push({ field: "robots_extra", line: i + 1, msg: `line ${i + 1}: User-agent needs a value` }); uas.push(v); }
    else if (k === "sitemap") { if (!/^https:\/\//i.test(v)) errors.push({ field: "robots_extra", line: i + 1, msg: `line ${i + 1}: Sitemap needs an absolute https URL` }); }
    else {
      if (!uas.length) errors.push({ field: "robots_extra", line: i + 1, msg: `line ${i + 1}: put a "User-agent:" line before rules` });
      inRules = true;
    }
    out.push(s);
  });
  const blocked = blockedAgents(out), before = new Set(blockedAgents(prev)), added = blocked.filter(a => !before.has(a));
  if (added.length && !confirmBlockAll) {
    const who = added.includes("*") ? "every crawler («User-agent: *»)" : added.map(a => "«" + a + "»").join(", ");
    errors.push({ field: "robots_extra", code: "confirm_block_all", agents: added, msg: `these lines block the WHOLE site for ${who} — search engines drop every page. Send confirm_block_all:true (admin only) to save them` });
  }
  return { lines: cleanRobotsExtra(out), errors, block_all: blocked.length > 0, blocked_agents: blocked, new_block_agents: added };
}
export function validateVerify(v) {
  if (v == null) return { verify: {}, errors: [] };
  if (typeof v !== "object" || Array.isArray(v)) return { verify: {}, errors: [{ field: "verify", msg: "verify must be an object {google, bing, yandex}" }] };
  const out = {}, errors = [];
  for (const k of Object.keys(v)) {
    if (!own(VERIFY_META, k)) { errors.push({ field: "verify." + k, msg: "unknown engine (google, bing, yandex)" }); continue; }
    let t = v[k];
    if (t == null || t === "") continue;
    t = String(t).trim();
    const m = t.match(/content\s*=\s*["']([^"']+)["']/i);
    if (m) t = m[1].trim();
    t = t.replace(/^(google-site-verification|msvalidate\.01|yandex-verification)\s*[=:]\s*/i, "");
    if (!VERIFY_RX.test(t)) errors.push({ field: "verify." + k, msg: "paste only the content value (8–120 characters: letters, digits, _ - : .)" });
    else out[k] = t;
  }
  return { verify: out, errors };
}
const TH_RANGE = {
  min_hub_members: [1, 1000], min_tender_cat: [1, 1000], min_tender_entity: [1, 1000], min_gov_items: [1, 1000], min_company_words: [0, 5000],
  min_company_words_with_products: [0, 5000], min_company_products: [0, 1000], min_facx_words: [0, 5000], min_product_words: [0, 5000],
  news_index_min_words: [0, 5000], tender_expired_index_days: [0, 3650], listing_page_size: [10, 500], hub_min_words: [0, 5000], detail_min_words: [0, 5000],
};
/* the thresholds the BUILD used (seo/config.json → /_seo/config.json): numeric keys of TH_RANGE + slug_mode */
export function pickThresholds(cfg) {
  const out = {};
  for (const [k, v] of Object.entries(obj(cfg))) {
    if (k === "slug_mode" && (v === "legacy" || v === "hash")) out[k] = v;
    else if (own(TH_RANGE, k) && Number.isInteger(v) && v >= TH_RANGE[k][0] && v <= TH_RANGE[k][1]) out[k] = v;
  }
  return out;
}
async function buildThresholds(env, req) { return pickThresholds(await loadAssetJson(env, req, "/_seo/config.json")); }
export function validateThresholds(t, cur) {
  const out = { ...obj(cur) }, errors = [];
  if (t == null) return { thresholds: out, errors };
  if (typeof t !== "object" || Array.isArray(t)) return { thresholds: out, errors: [{ field: "thresholds", msg: "thresholds must be an object" }] };
  for (const [k, v] of Object.entries(t)) {
    if (v == null || v === "") { if (own(out, k)) delete out[k]; continue; }
    if (k === "slug_mode") { if (v === "legacy" || v === "hash") out[k] = v; else errors.push({ field: "thresholds.slug_mode", msg: "slug_mode must be legacy or hash" }); continue; }
    if (!own(TH_RANGE, k)) { errors.push({ field: "thresholds." + k, msg: "unknown threshold" }); continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < TH_RANGE[k][0] || n > TH_RANGE[k][1]) errors.push({ field: "thresholds." + k, msg: `${k} must be a whole number ${TH_RANGE[k][0]}–${TH_RANGE[k][1]}` });
    else out[k] = n;
  }
  return { thresholds: out, errors };
}
const firstErr = errors => fail(400, "invalid_" + String(errors[0].field || "input").replace(/\..*$/, ""), errors[0].msg, { field: errors[0].field, errors });

/* ---------- CSV (RFC 4180; "," or ";" or tab; UTF-8 BOM on export; formula-safe) ---------- */
export function csvParse(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = s.slice(0, s.search(/\r?\n|$/));
  const d = firstLine.includes(",") ? "," : firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", q = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "") { q = true; i++; continue; }
    if (c === d) { row.push(cell); cell = ""; i++; continue; }
    if (c === "\r" && s[i + 1] === "\n") { i++; continue; }
    if (c === "\n" || c === "\r") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export function csvCell(v) {
  let s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard (removed again on import)
  return /[",;\r\n\t]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const unformula = s => String(s == null ? "" : s).replace(/^'(?=[=+\-@\t\r])/, "");
export const toCsv = (head, rows) => "\uFEFF" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const csvResponse = (name, body) => new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" } });

/* ---------- build manifest (/_seo/pages.json from the generator; spec §1.11 short keys or long keys) ---------- */
const MANIFEST_CANDIDATES = ["/_seo/pages.json", "/seo-manifest.json", "/_seo/seo-manifest.json"];
const pick = (r, ks) => { for (const k of ks) if (r[k] != null && r[k] !== "") return r[k]; return undefined; };
const str = v => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = v => (Number.isFinite(+v) ? +v : 0);
export function normRow(r, keyPath) {
  if (!r || typeof r !== "object") return null;
  const p = pick(r, ["p", "path", "url", "loc"]) || keyPath;
  if (typeof p !== "string" || !p) return null;
  const path = normPath(p), s = pick(r, ["s", "schema", "schema_types"]), h1raw = str(pick(r, ["h1", "h"])), h1n = pick(r, ["h1n", "h1_count"]);
  const multi = h1raw === "MULTI", h1 = multi ? "" : h1raw; // seo_build.part.py writes h1:"MULTI" for pages with several <h1>
  return {
    path, lang: str(pick(r, ["l", "lang"])) || (/^\/en(\/|$)/.test(path) ? "en" : "ar"), type: str(pick(r, ["t", "type", "kind"])),
    title: str(pick(r, ["ti", "title"])), description: str(pick(r, ["d", "desc", "description"])), h1, h1_count: h1n != null ? num(h1n) : multi ? 2 : h1 ? 1 : 0,
    canonical: str(pick(r, ["c", "canonical"])), robots: str(pick(r, ["r", "robots"])) || "index,follow",
    words: num(pick(r, ["w", "words"])), images: num(pick(r, ["im", "imgs", "images"])), images_no_alt: num(pick(r, ["ina", "imgs_no_alt", "images_no_alt"])),
    schema: Array.isArray(s) ? s.map(String) : s ? String(s).split(/[\s,|]+/).filter(Boolean) : [],
    alt: str(pick(r, ["a", "alt", "alt_lang_path"])), lastmod: str(pick(r, ["lm", "lastmod"])), cluster: str(pick(r, ["k", "cluster"])),
    why: str(pick(r, ["why", "index_reason", "reason"])), kw: str(pick(r, ["kw", "target_kw"])), raw: r,
  };
}
export function normalizeManifest(raw) {
  let list = null;
  if (Array.isArray(raw)) list = raw.map(r => normRow(r));
  else if (raw && typeof raw === "object") {
    const arr = [raw.pages, raw.rows, raw.items].find(Array.isArray);
    if (arr) list = arr.map(r => normRow(r));
    else if (Object.keys(raw).some(k => k.startsWith("/"))) list = Object.entries(raw).filter(([k]) => k.startsWith("/")).map(([k, r]) => normRow(r, k));
  }
  if (!list) return null;
  const seen = new Set(), rows = [];
  for (const r of list) if (r && !seen.has(r.path)) { seen.add(r.path); rows.push(r); }
  return rows;
}
let manMemo = { at: 0, rows: null, byPath: null, src: "" };
export async function loadManifest(env, req, now = Date.now()) {
  if (now - manMemo.at < (manMemo.rows ? 300000 : 60000)) return manMemo;
  const cands = [env.SEO_MANIFEST, ...MANIFEST_CANDIDATES].filter(p => typeof p === "string" && p.startsWith("/"));
  for (const p of [...new Set(cands)]) {
    try {
      const r = await assetFetch(env, req, p);
      if (!r || !r.ok) continue;
      const rows = normalizeManifest(await r.json());
      if (rows) return (manMemo = { at: now, rows, byPath: new Map(rows.map(x => [x.path, x])), src: p });
    } catch (e) { /* next candidate */ }
  }
  return (manMemo = { at: now, rows: null, byPath: null, src: "" });
}
const rowOut = r => { const { raw, ...n } = r; return { ...obj(raw), ...n }; };

/* ---------- KV store ---------- */
const normMeta = m => ({ ov: obj(m && m.ov), rd: obj(m && m.rd) });
async function readBundle(env) {
  let raw;
  try { raw = await env.SEO_KV.get(KV_BUNDLE, { type: "json" }); } catch (e) { fail(503, "kv_error", "KV is unavailable, try again"); }
  const b = sanitizeBundle(raw) || { ...EMPTY, ov: {}, rd: {}, cfg: {} };
  b.meta = normMeta(b.meta);
  return b;
}
const clone = x => JSON.parse(JSON.stringify(x));
/* read → change → write prev + bundle (one publish). fn(next) may throw ApiError; returns {log:[…], noop?, …} */
async function mutate(env, who, fn) {
  const cur = await readBundle(env), next = clone(cur);
  const r = (await fn(next)) || {};
  if (r.noop) return { bundle: cur, ...r };
  next.v = Math.max(Date.now(), (Number(cur.v) || 0) + 1);
  next.at = new Date(next.v).toISOString();
  next.by = who.id || "";
  const s = JSON.stringify(next);
  if (utf8len(s) > MAX_BUNDLE) fail(413, "bundle_too_large", "the SEO bundle would exceed 5 MB — remove overrides or long JSON-LD first");
  await env.SEO_KV.put(KV_PREV, JSON.stringify(cur));
  await env.SEO_KV.put(KV_BUNDLE, s);
  setBundleMemo(next);
  if (r.log && r.log.length) await appendLog(env, who, r.log);
  return { bundle: next, ...r };
}
async function readJsonKV(env, key, d) { try { const v = await env.SEO_KV.get(key, { type: "json" }); return v == null ? d : v; } catch (e) { return d; } }
async function readLog(env) { const l = await readJsonKV(env, KV_LOG, []); return Array.isArray(l) ? l : []; }
async function appendLog(env, who, entries) {
  const at = nowIso(), rnd = () => Math.random().toString(36).slice(2, 8);
  const add = entries.map(e => ({ id: at.replace(/\D/g, "").slice(0, 17) + "-" + rnd(), at, by: who.id || "", by_email: who.email || "", kind: e.kind, ref: e.ref, before: e.before === undefined ? null : e.before, after: e.after === undefined ? null : e.after, ...(e.via ? { via: e.via } : {}) }));
  let log = add.concat(await readLog(env)).slice(0, 1000), s = JSON.stringify(log);
  while (s.length > 1000000 && log.length > 1) { log = log.slice(0, Math.floor(log.length * 0.8)); s = JSON.stringify(log); }
  await env.SEO_KV.put(KV_LOG, s);
}
const rlMem = new Map();
export async function rateOk(env, key, limit, windowSec, now = Date.now()) {
  const win = Math.floor(now / 1000 / windowSec), k = key + "|" + win;
  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(k, new Date((win + 1) * windowSec * 1000).toISOString()).run();
      return ((await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(k).first("n")) || 0) <= limit;
    } catch (e) { /* no rl table → per-isolate counter */ }
  }
  const n = (rlMem.get(k) || 0) + 1;
  rlMem.set(k, n);
  if (rlMem.size > 500) for (const key2 of rlMem.keys()) { if (!key2.endsWith("|" + win)) rlMem.delete(key2); }
  return n <= limit;
}

/* ---------- page probe (does the deployed page exist / carry the hooks?) ---------- */
async function probePage(env, req, path) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") return { exists: false, status: 0 };
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(path, req.url).toString(), { method: "GET", redirect: "manual" }));
    if (r.status !== 200 || !/text\/html/i.test(r.headers.get("Content-Type") || "")) return { exists: false, status: r.status, location: r.headers.get("Location") || "" };
    const html = await r.text();
    return { exists: true, status: 200, hasIntro: /\bdata-seo\s*=\s*["']?intro["'\s>/]/i.test(html), hasH1: /<h1\b[^>]*\bdata-seo\s*=\s*["']?h1["'\s>/]/i.test(html) };
  } catch (e) { return { exists: false, status: 0 }; }
}
const sameJson = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
const sortObj = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const fieldsOnly = o => { const x = { ...obj(o) }; delete x.ix; return sortObj(x); };
const metaOnly = m => { const x = {}; for (const k of META_FIELDS) if (m && m[k] != null && m[k] !== "" && !(Array.isArray(m[k]) && !m[k].length)) x[k] = m[k]; return x; };

/* ---------- keywords (seo/keywords.json → /_seo/keywords.json) ---------- */
const DIFF = { l: "L", low: "L", m: "M", medium: "M", h: "H", high: "H" };
export function normKeywordItem(x, site) {
  if (!x || typeof x !== "object") return null;
  const cluster = plain(pick(x, ["cluster", "id", "key"]) || "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(cluster)) return null;
  let tu = str(pick(x, ["target_url", "url", "target"]) || "");
  tu = tu ? (/^https?:\/\//i.test(tu) ? normPath(tu) : tu.startsWith("/") ? normPath(tu) : "") : "";
  const sec = pick(x, ["secondary_kw", "secondary", "secondaries"]);
  return {
    cluster, name: plain(x.name || "").slice(0, 120), target_url: tu, target_kw: plain(pick(x, ["target_kw", "keyword", "kw"]) || "").slice(0, 120),
    secondary_kw: (Array.isArray(sec) ? sec : sec ? String(sec).split(/[|,،]/) : []).map(plain).filter(Boolean).slice(0, 20),
    difficulty: DIFF[String(pick(x, ["difficulty", "kd"]) || "").toLowerCase()] || "",
    ...(x.updated_at ? { updated_at: str(x.updated_at), updated_by: str(x.updated_by) } : {}),
  };
}
function normKeywords(raw, site) {
  let arr = Array.isArray(raw) ? raw : raw && Array.isArray(raw.clusters) ? raw.clusters : raw && Array.isArray(raw.items) ? raw.items
    : raw && typeof raw === "object" ? Object.entries(raw).filter(([, v]) => v && typeof v === "object").map(([k, v]) => ({ cluster: k, ...v })) : [];
  return arr.map(x => normKeywordItem(x, site)).filter(Boolean);
}
async function readKeywords(env, req) {
  const k = await readJsonKV(env, KV_KW, null);
  if (k && Array.isArray(k.items)) return { items: k.items, at: k.at || "", source: "kv" };
  const seed = await loadAssetJson(env, req, "/_seo/keywords.json");
  return { items: normKeywords(seed, siteOrigin(env)), at: "", source: seed ? "build" : "none" };
}

/* ---------- scored manifest (memo per manifest × bundle × keywords) ---------- */
let scoredMemo = { key: "", rows: null, summary: null };
async function scoredRows(env, req, man) {
  const b = await loadBundle(env), kw = await readKeywords(env, req), bth = await buildThresholds(env, req);
  const key = man.at + "|" + man.src + "|" + b.v + "|" + kw.source + kw.at + "|" + JSON.stringify(bth);
  if (scoredMemo.key === key && scoredMemo.rows) return scoredMemo;
  // thresholds: spec defaults < what the build used (/_seo/config.json) < the admin's override (cfg.thresholds)
  const site = siteOrigin(env), meta = normMeta(b.meta).ov, th = { ...DEFAULT_THRESHOLDS, ...bth, ...obj(b.cfg.thresholds) };
  const byCluster = new Map(kw.items.map(k => [k.cluster, k])), byUrl = new Map(kw.items.filter(k => k.target_url).map(k => [k.target_url, k]));
  const rows = man.rows.map(r => {
    const ov = own(b.ov, r.path) ? b.ov[r.path] : null, m = meta[r.path] || null;
    const target = (m && m.target_kw) || r.kw || (byUrl.get(r.path) || byCluster.get(r.cluster) || {}).target_kw || "";
    const s = scorePage(r, { ov, target_kw: target, twin: r.alt ? man.byPath.get(normPath(r.alt)) : null, site, thresholds: th });
    return { ...rowOut(r), override: ov, meta: m, target_kw: target, effective: s.eff, score: s.score, issues: s.issues, kw_title: s.kw_title, kw_h1: s.kw_h1, intentional_noindex: s.intentional_noindex };
  });
  const count = (f) => rows.reduce((m, r) => { const k = f(r); if (k != null && k !== "") m[k] = (m[k] || 0) + 1; return m; }, {});
  const issues = {}; for (const r of rows) for (const i of r.issues) issues[i] = (issues[i] || 0) + 1;
  const summary = {
    pages: rows.length, by_type: count(r => r.type || "?"), by_lang: count(r => r.lang),
    indexable: rows.filter(r => !/noindex/i.test(r.effective.robots)).length, noindex: rows.filter(r => /noindex/i.test(r.effective.robots)).length,
    noindex_reasons: count(r => (/noindex/i.test(r.effective.robots) ? r.why || (r.override && r.override.robots ? "override" : "build") : null)),
    overrides: rows.filter(r => r.override).length, issues, avg_score: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0,
    last_build: rows.reduce((a, r) => (r.lastmod > a ? r.lastmod : a), ""), bundle_v: b.v,
  };
  return (scoredMemo = { key, rows, summary });
}
function filterRows(rows, q) {
  const type = q.get("type") || "", lang = q.get("lang") || "", issue = q.get("issue") || "", text = normAr(q.get("q") || ""), ovOnly = yes(q.get("override"));
  let items = rows.filter(r => (!type || r.type === type) && (!lang || r.lang === lang) && (!issue || r.issues.includes(issue)) && (!ovOnly || r.override)
    && (!text || normAr(r.path + " " + r.title + " " + r.h1 + " " + r.effective.title).includes(text)));
  const sort = q.get("sort") || "";
  if (sort === "score") items = items.slice().sort((a, b) => a.score - b.score);
  else if (sort === "-score") items = items.slice().sort((a, b) => b.score - a.score);
  else if (sort === "path") items = items.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return items;
}

/* ---------- handlers ---------- */
async function health({ env, request: req }, who) {
  let raw = null, kv = true;
  try { raw = await env.SEO_KV.get(KV_BUNDLE); } catch (e) { kv = false; }
  let b = null; try { b = raw ? sanitizeBundle(JSON.parse(raw)) : null; } catch (e) { b = null; }
  const man = await loadManifest(env, req), R = await loadRedirects(env, req);
  return json({
    ok: kv, kv, d1: !!env.DB, auth: authMode(env), role: who.role, me: { id: who.id, email: who.email },
    bundle_v: b ? b.v : 0, bundle_at: (b && b.at) || "", bundle_bytes: raw ? utf8len(raw) : 0,
    overrides: b ? Object.keys(b.ov).length : 0, redirects: b ? Object.keys(b.rd).length : 0, build_redirects: R ? R.count : 0,
    manifest: man.rows ? { src: man.src, rows: man.rows.length } : null, deploy_hook: !!env.PAGES_DEPLOY_HOOK,
    indexnow: indexNowKeys(b || EMPTY, env).length > 0, gsc: false, edge_ttl_s: edgeTtlMs(env) / 1000, site: siteOrigin(env),
  });
}
async function pages({ env, request: req }, who, url) {
  const man = await loadManifest(env, req);
  if (!man.rows) return err(503, "manifest_unavailable", "the build manifest (/_seo/pages.json) is not deployed yet");
  const sc = await scoredRows(env, req, man), items = filterRows(sc.rows, url.searchParams);
  const limit = Math.min(500, Math.max(1, int(url.searchParams.get("limit"), 100))), offset = Math.max(0, int(url.searchParams.get("offset"), 0));
  return json({ total: items.length, offset, limit, items: items.slice(offset, offset + limit), summary: sc.summary, issues: ISSUES, bundle_v: sc.summary.bundle_v });
}
async function getPage({ env, request: req }, who, url) {
  const path = checkPath(url.searchParams.get("path")), site = siteOrigin(env);
  const [b, man, log, kw] = [await readBundle(env), await loadManifest(env, req), await readLog(env), await readKeywords(env, req)];
  const row = man.byPath ? man.byPath.get(path) || null : null, ov = own(b.ov, path) ? b.ov[path] : null, m = b.meta.ov[path] || null;
  let sc = null;
  if (row) {
    const k = (m && m.target_kw) || row.kw || (kw.items.find(x => x.target_url === path) || kw.items.find(x => x.cluster === row.cluster) || {}).target_kw || "";
    sc = scorePage(row, { ov, target_kw: k, twin: row.alt ? man.byPath.get(normPath(row.alt)) : null, site, thresholds: { ...DEFAULT_THRESHOLDS, ...await buildThresholds(env, req), ...obj(b.cfg.thresholds) } });
  }
  return json({ path, url: absUrl(site, path), defaults: row ? rowOut(row) : null, override: ov, meta: m, effective: sc ? sc.eff : null, score: sc ? sc.score : null, issues: sc ? sc.issues : [], history: log.filter(e => e.ref === path).slice(0, 50), bundle_v: b.v });
}
async function putPage(ctx, who, patch) {
  const { env, request: req } = ctx, b = await readBody(req, 65536), site = siteOrigin(env);
  const path = checkPath(b.path);
  const given = OV_FIELDS.filter(f => own(b, f));
  const { fields, errors } = validateOverride(b, site, allowList(env)), vm = validateMeta(b);
  if (errors.length || vm.errors.length) firstErr([...errors, ...vm.errors]);
  const force = b.force === true && who.role === "admin";
  const probe = await probePage(env, req, path), man = probe.exists ? null : await loadManifest(env, req);
  const exists = probe.exists || !!(man && man.byPath && man.byPath.has(path));
  if (!exists && !force) {
    const hint = probe.status >= 300 && probe.status < 400 ? ` (it redirects to ${probe.location || "another URL"} — use that path)` : "";
    fail(400, "unknown_path", "path is not a page of this site" + hint + (who.role === "admin" ? "; send force:true to save it anyway" : ""), { field: "path" });
  }
  const warnings = [];
  const out = await mutate(env, who, next => {
    const before = own(next.ov, path) ? next.ov[path] : null, bm = next.meta.ov[path] || null;
    let f;
    if (patch) {
      f = { ...obj(before) };
      for (const k of given) { if (own(fields, k)) f[k] = fields[k]; else delete f[k]; }
    } else f = { ...fields };
    // admin metadata always merges: only target_kw / secondary_kw / note present in the body change
    const mm = { ...metaOnly(bm) };
    for (const k of META_FIELDS) if (own(b, k)) { if (own(vm.meta, k)) mm[k] = vm.meta[k]; else delete mm[k]; }
    vm.meta = mm;
    delete f.ix;
    if (f.intro) {
      if (probe.exists ? !probe.hasIntro && probe.hasH1 : !!(before && before.ix)) f.ix = 1;
      if (probe.exists && !probe.hasIntro && !probe.hasH1) warnings.push({ field: "intro", msg: "the page has no data-seo=intro or data-seo=h1 element, so the intro cannot be shown" });
    }
    if (f.h1 && probe.exists && !probe.hasH1) warnings.push({ field: "h1", msg: "the page has no h1[data-seo=h1] element, so the H1 override cannot be applied" });
    const hasF = Object.keys(f).length > 0, newMeta = metaOnly(vm.meta), hasM = Object.keys(newMeta).length > 0;
    if (sameJson(before && sortObj(before), hasF ? sortObj(f) : null) && sameJson(metaOnly(bm), newMeta)) return { noop: true, override: before, meta: bm };
    if (hasF) next.ov[path] = f; else delete next.ov[path];
    const at = nowIso();
    if (hasF || hasM) next.meta.ov[path] = { ...newMeta, updated_by: who.id, updated_by_email: who.email || "", updated_at: at }; else delete next.meta.ov[path];
    return { override: hasF ? f : null, meta: next.meta.ov[path] || null, log: [{ kind: "override", ref: path, before: before || bm ? { fields: before, meta: metaOnly(bm) } : null, after: hasF || hasM ? { fields: hasF ? f : null, meta: newMeta } : null }] };
  });
  const res = { ok: true, path, override: out.override || null, meta: out.meta || null, bundle_v: out.bundle.v, changed: !out.noop, warnings, visible_within_s: edgeTtlMs(env) / 1000 + 60 };
  if (b.ping_indexnow === true) res.indexnow = await indexNowSend(env, who, [absUrl(site, path)], "page", req);
  return json(res);
}
async function deletePage({ env, request: req }, who, url) {
  let p = url.searchParams.get("path");
  if (!p && req.headers.get("Content-Type")) { try { p = (await readBody(req)).path; } catch (e) { p = null; } }
  const path = checkPath(p);
  const out = await mutate(env, who, next => {
    const before = own(next.ov, path) ? next.ov[path] : null, bm = next.meta.ov[path] || null;
    if (!before && !bm) return { noop: true, removed: false };
    delete next.ov[path]; delete next.meta.ov[path];
    return { removed: true, log: [{ kind: "override", ref: path, before: { fields: before, meta: metaOnly(bm) }, after: null }] };
  });
  return json({ ok: true, path, removed: !!out.removed, bundle_v: out.bundle.v });
}
async function rollback({ env }, who) {
  const cur = await readBundle(env);
  let prev = null;
  try { prev = sanitizeBundle(await env.SEO_KV.get(KV_PREV, { type: "json" })); } catch (e) { fail(503, "kv_error", "KV is unavailable, try again"); }
  if (!prev) return err(409, "no_previous", "there is no previous version to roll back to");
  if (who.role !== "admin") { // a rollback must not let the SEO role change what only an admin may change
    if (!sameJson(sortObj(obj(prev.cfg.verify)), sortObj(obj(cur.cfg.verify)))) ADMIN_ONLY("search-engine verification (this rollback would change it)");
    const was = new Set(blockedAgents(cur.cfg.robots_extra)), add = blockedAgents(prev.cfg.robots_extra).filter(a => !was.has(a));
    if (add.length) ADMIN_ONLY("robots.txt lines that block the whole site (this rollback would restore them: " + add.join(", ") + ")");
  }
  const next = { ...prev, meta: normMeta(prev.meta), v: Math.max(Date.now(), cur.v + 1, prev.v + 1), by: who.id, restored_from: prev.v };
  next.at = new Date(next.v).toISOString();
  await env.SEO_KV.put(KV_PREV, JSON.stringify(cur));
  await env.SEO_KV.put(KV_BUNDLE, JSON.stringify(next));
  setBundleMemo(next);
  await appendLog(env, who, [{ kind: "rollback", ref: "bundle", before: { v: cur.v }, after: { v: next.v, restored: prev.v } }]);
  return json({ ok: true, bundle_v: next.v, restored: prev.v });
}
function overrideItems(b) {
  const paths = [...new Set([...Object.keys(b.ov), ...Object.keys(b.meta.ov)])].sort();
  return paths.map(p => { const m = b.meta.ov[p] || {}; return { path: p, fields: own(b.ov, p) ? b.ov[p] : {}, target_kw: m.target_kw || "", secondary_kw: m.secondary_kw || [], note: m.note || "", updated_by: m.updated_by || "", updated_by_email: m.updated_by_email || "", updated_at: m.updated_at || "" }; });
}
async function overrides({ env }) { const b = await readBundle(env); return json({ items: overrideItems(b), bundle_v: b.v }); }
async function history({ env }, who, url) {
  const ref = url.searchParams.get("ref"), kind = url.searchParams.get("kind"), limit = Math.min(1000, Math.max(1, int(url.searchParams.get("limit"), 100)));
  const r = ref ? (ref.startsWith("/") ? normPath(ref) : ref) : null;
  return json({ items: (await readLog(env)).filter(e => (!r || e.ref === r) && (!kind || e.kind === kind)).slice(0, limit) });
}
const OV_HEAD = ["path", ...OV_FIELDS, ...META_FIELDS];
const RD_HEAD = ["from", "to", "code", "note"];
const PG_HEAD = ["path", "lang", "type", "title", "title_len", "description", "desc_len", "h1", "words", "images", "images_no_alt", "schema", "robots", "canonical", "alt", "lastmod", "cluster", "why", "overridden", "target_kw", "score", "issues"];
async function exportCsv({ env, request: req }, who, url) {
  const kind = url.searchParams.get("kind") || "overrides", day = nowIso().slice(0, 10);
  if (kind === "overrides") {
    const b = await readBundle(env);
    return csvResponse(`seo-overrides-${day}.csv`, toCsv(OV_HEAD, overrideItems(b).map(it => [it.path, ...OV_FIELDS.map(f => it.fields[f] || ""), it.target_kw, it.secondary_kw, it.note])));
  }
  if (kind === "redirects") {
    const b = await readBundle(env);
    return csvResponse(`seo-redirects-${day}.csv`, toCsv(RD_HEAD, Object.keys(b.rd).sort().map(f => [f, b.rd[f].to || "", b.rd[f].code || 301, (b.meta.rd[f] || {}).note || ""])));
  }
  if (kind === "pages") {
    const man = await loadManifest(env, req);
    if (!man.rows) return err(503, "manifest_unavailable", "the build manifest (/_seo/pages.json) is not deployed yet");
    const rows = filterRows((await scoredRows(env, req, man)).rows, url.searchParams);
    return csvResponse(`seo-pages-${day}.csv`, toCsv(PG_HEAD, rows.map(r => [r.path, r.lang, r.type, r.effective.title, clen(r.effective.title), r.effective.description, clen(r.effective.description), r.effective.h1, r.words, r.images, r.images_no_alt, r.schema, r.effective.robots, r.effective.canonical, r.alt, r.lastmod, r.cluster, r.why, r.override ? 1 : 0, r.target_kw, r.score, r.issues])));
  }
  return err(400, "invalid_kind", "kind must be overrides, redirects or pages");
}
async function exportJson({ env }) {
  const b = await readBundle(env);
  return json({ v: b.v, at: b.at || "", ov: b.ov, rd: b.rd, cfg: { verify: obj(b.cfg.verify), robots_extra: Array.isArray(b.cfg.robots_extra) ? b.cfg.robots_extra : [], indexnow_key: b.cfg.indexnow_key || "", thresholds: obj(b.cfg.thresholds) } });
}
async function importCsv(ctx, who, url) {
  const { env, request: req } = ctx;
  const kind = url.searchParams.get("kind") || "overrides";
  if (kind !== "overrides" && kind !== "redirects") return err(400, "invalid_kind", "kind must be overrides or redirects");
  const dry = yes(url.searchParams.get("dry_run")), force = yes(url.searchParams.get("force")) && who.role === "admin";
  const table = csvParse(await readText(req, MAX_IMPORT));
  if (!table.length) return err(400, "empty_csv", "the CSV is empty");
  const head = table[0].map(h => String(h).replace(/^\uFEFF/, "").trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < table.length; i++) if (table[i].some(c => String(c).trim() !== "")) rows.push({ line: i + 1, cells: table[i] });
  if (rows.length > MAX_ROWS) return err(413, "too_many_rows", "at most 5,000 rows per import");
  const get = (cells, name) => { const i = head.indexOf(name); return i < 0 ? undefined : unformula(cells[i]); };
  const site = siteOrigin(env), cur = await readBundle(env), errors = [], warnings = [], allow = allowList(env);
  let create = 0, update = 0, unchanged = 0, del = 0, R = null;
  const plan = [];
  if (kind === "overrides") {
    if (!head.includes("path")) return err(400, "missing_column", 'the CSV needs a "path" column');
    const man = await loadManifest(env, req);
    if (!man.rows && !force) return err(409, "manifest_unavailable", "the build manifest is not available to check paths" + (who.role === "admin" ? "; re-run with force=1" : ""));
    const seen = new Set();
    for (const { line, cells } of rows) {
      let path;
      try { path = checkPath(get(cells, "path")); } catch (e) { errors.push({ line, field: "path", msg: e.message }); continue; }
      if (seen.has(path)) { errors.push({ line, field: "path", msg: "this path appears twice in the file" }); continue; }
      seen.add(path);
      if (man.rows && !man.byPath.has(path) && !force) { errors.push({ line, field: "path", msg: "not a page of this site (not in the build manifest)" }); continue; }
      const input = {};
      for (const f of [...OV_FIELDS, ...META_FIELDS]) { const v = get(cells, f); if (v !== undefined) input[f] = v; }
      const vo = validateOverride(input, site, allow), vm = validateMeta(input);
      if (vo.errors.length || vm.errors.length) { for (const e of [...vo.errors, ...vm.errors]) errors.push({ line, ...e }); continue; }
      const before = own(cur.ov, path) ? cur.ov[path] : null, bm = cur.meta.ov[path] || null, nm = metaOnly(vm.meta);
      const hasF = Object.keys(vo.fields).length > 0, hasM = Object.keys(nm).length > 0;
      if (!hasF && !hasM) { if (before || bm) { del++; plan.push({ path, line, del: true }); } else unchanged++; continue; }
      if (sameJson(before ? fieldsOnly(before) : null, hasF ? sortObj(vo.fields) : null) && sameJson(metaOnly(bm), nm)) { unchanged++; continue; }
      before || bm ? update++ : create++;
      plan.push({ path, line, fields: hasF ? vo.fields : null, meta: hasM ? nm : null, before, bm, ix: before && before.intro && before.ix ? 1 : 0 });
    }
    if (!dry && !errors.length) { // where to show a new intro: probe up to 30 pages, the rest keep in-place replacement only
      let probes = 0;
      for (const p of plan) if (p.fields && p.fields.intro && !p.ix && !(p.before && p.before.intro)) {
        if (probes++ >= 30) { warnings.push({ line: p.line, field: "intro", msg: "intro shown only where the page has a data-seo=intro element" }); continue; }
        const pr = await probePage(env, req, p.path);
        if (pr.exists && !pr.hasIntro && pr.hasH1) p.ix = 1;
      }
    }
  } else {
    if (!head.includes("from")) return err(400, "missing_column", 'the CSV needs a "from" column');
    R = await loadRedirects(env, req);
    const rd = clone(cur.rd), seen = new Set(), lineOf = {};
    for (const { line, cells } of rows) {
      const v = validateRedirect({ from: get(cells, "from"), to: get(cells, "to") || "", code: get(cells, "code"), note: get(cells, "note") }, site);
      if (v.errors.length) { for (const e of v.errors) errors.push({ line, ...e }); continue; }
      if (seen.has(v.from)) { errors.push({ line, field: "from", msg: "this from path appears twice in the file" }); continue; }
      seen.add(v.from); lineOf[v.from] = line;
      const before = own(cur.rd, v.from) ? cur.rd[v.from] : null, bnote = (cur.meta.rd[v.from] || {}).note || "";
      const after = v.code === 410 ? { to: "", code: 410 } : { to: v.to, code: v.code };
      rd[v.from] = after;
      if (before && before.to === after.to && +before.code === after.code && bnote === v.note) { unchanged++; continue; }
      before ? update++ : create++;
      plan.push({ from: v.from, line, after, note: v.note, before });
    }
    for (const p of plan) {
      if (p.after.code === 410) continue;
      const c = collapseTarget(rd, R, p.from, p.after.to);
      if (c.loop) errors.push({ line: p.line, field: "to", msg: "redirect loop" });
      else if (c.gone) errors.push({ line: p.line, field: "to", msg: "the target is marked 410 (gone)" });
      else if (c.to !== p.after.to) { p.after.to = c.to; rd[p.from] = p.after; warnings.push({ line: p.line, field: "to", msg: "chain collapsed to the final target " + c.to }); }
    }
  }
  const resp = { dry_run: dry, applied: false, kind, create, update, unchanged, delete: del, errors, warnings };
  if (dry) return json(resp);
  if (errors.length) return json({ ...resp, code: "import_errors", error: "nothing was applied: fix the errors and import again" }, 400);
  if (!plan.length) return json({ ...resp, applied: true, bundle_v: cur.v });
  const at = nowIso();
  const out = await mutate(env, who, next => {
    const log = [];
    for (const p of plan) {
      if (kind === "overrides") {
        const before = own(next.ov, p.path) ? next.ov[p.path] : null, bm = next.meta.ov[p.path] || null;
        if (p.del || !p.fields) delete next.ov[p.path]; else next.ov[p.path] = p.fields.intro && p.ix ? { ...p.fields, ix: 1 } : { ...p.fields };
        if (p.del || !p.meta) { if (p.del || !p.fields) delete next.meta.ov[p.path]; else next.meta.ov[p.path] = { updated_by: who.id, updated_by_email: who.email || "", updated_at: at }; }
        else next.meta.ov[p.path] = { ...p.meta, updated_by: who.id, updated_by_email: who.email || "", updated_at: at };
        log.push({ kind: "override", ref: p.path, via: "import", before: before || bm ? { fields: before, meta: metaOnly(bm) } : null, after: p.del ? null : { fields: p.fields, meta: p.meta || {} } });
      } else {
        next.rd[p.from] = p.after;
        next.meta.rd[p.from] = { ...(next.meta.rd[p.from] || { created_by: who.id, created_at: at }), note: p.note, updated_at: at, updated_by: who.id };
        log.push({ kind: "redirect", ref: p.from, via: "import", before: p.before, after: p.after });
      }
    }
    const repointed = kind === "redirects" ? flattenAll(next.rd, R) : [];
    for (const f of repointed) log.push({ kind: "redirect", ref: f, via: "import", before: null, after: { to: next.rd[f].to, repointed: true } });
    return { repointed, log: log.length <= 100 ? log : [{ kind: "import", ref: kind, after: { create, update, delete: del, paths: plan.slice(0, 500).map(p => p.path || p.from) } }] };
  });
  return json({ ...resp, applied: true, repointed: out.repointed || [], bundle_v: out.bundle.v });
}
async function redirectsGet({ env, request: req }, who, url) {
  const b = await readBundle(env), R = await loadRedirects(env, req), q = normAr(url.searchParams.get("q") || "");
  const admin = Object.keys(b.rd).sort().map(f => ({ from: f, to: b.rd[f].to || "", code: +b.rd[f].code || 301, ...obj(b.meta.rd[f]) }))
    .filter(r => !q || normAr(r.from + " " + r.to + " " + (r.note || "")).includes(q));
  return json({ admin, build_count: R ? R.count : 0, bundle_v: b.v });
}
async function redirectsPost(ctx, who) {
  const { env, request: req } = ctx, b = await readBody(req), site = siteOrigin(env);
  const v = validateRedirect(b, site);
  if (v.errors.length) firstErr(v.errors);
  const R = await loadRedirects(env, req), warnings = [];
  const out = await mutate(env, who, next => {
    const before = own(next.rd, v.from) ? next.rd[v.from] : null;
    let to = v.to, collapsed = false;
    if (v.code !== 410) {
      const tmp = { ...next.rd }; delete tmp[v.from];
      const c = collapseTarget(tmp, R, v.from, v.to);
      if (c.loop) fail(400, "redirect_loop", "this redirect would create a loop", { field: "to" });
      if (c.gone) fail(400, "target_gone", "the target is marked 410 (gone)", { field: "to" });
      collapsed = c.to !== v.to; to = c.to;
    }
    const after = v.code === 410 ? { to: "", code: 410 } : { to, code: v.code };
    next.rd[v.from] = after;
    const repointed = flattenAll(next.rd, R).filter(f => f !== v.from);
    const at = nowIso();
    next.meta.rd[v.from] = { ...(next.meta.rd[v.from] || { created_by: who.id, created_at: at }), note: v.note, updated_by: who.id, updated_at: at };
    return { redirect: { from: v.from, ...after }, collapsed, repointed, log: [{ kind: "redirect", ref: v.from, before, after }, ...repointed.map(f => ({ kind: "redirect", ref: f, before: null, after: { to: next.rd[f].to, repointed_by: v.from } }))] };
  });
  if (v.code !== 410) {
    const pr = await probePage(env, req, out.redirect.to.split(/[?#]/)[0]);
    if (!pr.exists) warnings.push({ field: "to", msg: "the target does not answer 200 on this deployment" + (pr.status ? " (HTTP " + pr.status + ")" : "") });
  }
  return json({ ok: true, redirect: out.redirect, collapsed: out.collapsed, repointed: out.repointed, warnings, bundle_v: out.bundle.v });
}
async function redirectsDelete({ env, request: req }, who, url) {
  let f = url.searchParams.get("from");
  if (!f && req.headers.get("Content-Type")) { try { f = (await readBody(req)).from; } catch (e) { f = null; } }
  if (typeof f !== "string" || !f.trim()) return err(400, "invalid_from", "from is required", { field: "from" });
  const from = normPath(f);
  const out = await mutate(env, who, next => {
    const key = own(next.rd, from) ? from : own(next.rd, altSlash(from)) ? altSlash(from) : null;
    if (!key) return { noop: true, removed: false };
    const before = next.rd[key];
    delete next.rd[key]; delete next.meta.rd[key];
    return { removed: true, log: [{ kind: "redirect", ref: key, before, after: null }] };
  });
  return json({ ok: true, removed: !!out.removed, bundle_v: out.bundle.v });
}
async function testUrl({ env, request: req }, who, url) {
  const site = siteOrigin(env), allowed = new Set([...hosts(site), new URL(req.url).host]);
  let u; try { u = new URL(url.searchParams.get("url") || "", site + "/"); } catch (e) { return err(400, "invalid_url", "invalid url"); }
  if (!/^https?:$/.test(u.protocol) || !allowed.has(u.host)) return err(400, "not_our_host", "only URLs on " + [...allowed].join(", ") + " can be tested");
  const chain = [];
  for (let i = 0; i <= 5; i++) {
    let r;
    try { r = await fetch(u.toString(), { method: "GET", redirect: "manual", headers: { "User-Agent": "MIG-SEO-redirect-test/1.0" } }); }
    catch (e) { chain.push({ url: u.toString(), status: 0, location: "", error: String(e && e.message || e).slice(0, 120) }); break; }
    const loc = r.headers.get("Location") || "";
    chain.push({ url: u.toString(), status: r.status, location: loc });
    try { await r.body?.cancel(); } catch (e) { /* ignore */ }
    if (!(r.status >= 300 && r.status < 400 && loc)) break;
    const nu = new URL(loc, u);
    if (!allowed.has(nu.host)) { chain.push({ url: nu.toString(), status: null, location: "", external: true }); break; }
    u = nu;
  }
  const hops = chain.filter(c => c.status >= 300 && c.status < 400).length, last = chain[chain.length - 1];
  return json({ chain, hops, final_status: last ? last.status : 0, warning: hops > 5 ? "too many redirects" : hops > 1 ? "more than one redirect hop — collapse the chain" : "" });
}
async function configGet({ env, request: req }, who) {
  const b = await readBundle(env), build = await buildThresholds(env, req), extra = Array.isArray(b.cfg.robots_extra) ? b.cfg.robots_extra : [];
  const key = indexNowKeys(b, env)[0] || "";
  return json({ verify: obj(b.cfg.verify), robots_extra: extra, robots_blocked_agents: blockedAgents(extra), indexnow_key: key, indexnow_key_set: !!key, indexnow_key_url: key ? siteOrigin(env) + "/" + key + ".txt" : "", thresholds: { ...DEFAULT_THRESHOLDS, ...build, ...obj(b.cfg.thresholds) }, thresholds_build: build, thresholds_override: obj(b.cfg.thresholds), can: { verify: who.role === "admin", block_all: who.role === "admin" }, site: siteOrigin(env), bundle_v: b.v });
}
async function configPut({ env, request: req }, who) {
  const b = await readBody(req);
  const out = await mutate(env, who, next => {
    const before = clone(next.cfg), cfg = next.cfg, errors = [];
    if (own(b, "verify")) { // per engine: a value sets it, "" / null removes it, engines not sent are kept; verify:null clears all
      if (b.verify === null) cfg.verify = {};
      else { const v = validateVerify(b.verify), m = { ...obj(cfg.verify) }; errors.push(...v.errors); for (const k of Object.keys(obj(b.verify))) { if (own(v.verify, k)) m[k] = v.verify[k]; else delete m[k]; } cfg.verify = m; }
      if (who.role !== "admin" && !errors.length && !sameJson(sortObj(obj(before.verify)), sortObj(obj(cfg.verify)))) ADMIN_ONLY("search-engine verification (it makes the token holder an owner of the site in Search Console)");
    }
    if (own(b, "robots_extra")) {
      const r = validateRobotsExtra(b.robots_extra == null ? [] : b.robots_extra, b.confirm_block_all === true, before.robots_extra);
      if (r.new_block_agents.length && who.role !== "admin" && !r.errors.some(e => e.code !== "confirm_block_all")) ADMIN_ONLY("robots.txt lines that block the whole site (" + r.new_block_agents.join(", ") + ")");
      errors.push(...r.errors); cfg.robots_extra = r.lines;
    }
    if (own(b, "thresholds")) { const t = validateThresholds(b.thresholds, cfg.thresholds); errors.push(...t.errors); cfg.thresholds = t.thresholds; }
    if (errors.length) { const blk = errors.find(e => e.code === "confirm_block_all"); if (blk) fail(400, "confirm_block_all", blk.msg, { field: "robots_extra", errors }); firstErr(errors); }
    if (sameJson(before, cfg)) return { noop: true };
    return { log: [{ kind: "config", ref: "config", before, after: clone(cfg) }] };
  });
  return json({ ok: true, changed: !out.noop, bundle_v: out.bundle.v });
}
async function indexNowKey({ env }, who) {
  const key = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");
  const out = await mutate(env, who, next => { const before = next.cfg.indexnow_key || null; next.cfg.indexnow_key = key; return { log: [{ kind: "config", ref: "indexnow_key", before: before ? { set: true } : null, after: { set: true } }] }; });
  return json({ ok: true, key, key_url: siteOrigin(env) + "/" + key + ".txt", bundle_v: out.bundle.v, note: "the key file is live on the edge within about a minute" });
}
const INX_MSG = { 200: "ok", 202: "accepted (the key is being validated)", 400: "bad request", 403: "the key file is not served yet or the key is wrong", 422: "URLs are not on this host or do not match the key", 429: "throttled — too many submissions" };
/* page state for the sent ledger: build lastmod (day) + the override's save time → a page is "changed" when either moves */
async function pageSig(env, req) {
  const b = await readBundle(env), man = await loadManifest(env, req), meta = b.meta.ov;
  return p => { const r = man.byPath && man.byPath.get(p); return (r ? r.lastmod : "") + "|" + ((meta[p] && meta[p].updated_at) || ""); };
}
async function readSent(env) { const l = await readJsonKV(env, KV_INX_SENT, null); return l && typeof l.m === "object" && l.m ? l.m : {}; }
async function recordSent(env, req, urls) {
  try {
    const sig = await pageSig(env, req), m = await readSent(env);
    for (const u of urls) { const p = normPath(new URL(u).pathname); delete m[p]; m[p] = sig(p); }
    const keys = Object.keys(m);
    if (keys.length > 20000) for (const k of keys.slice(0, keys.length - 20000)) delete m[k]; // oldest first
    await env.SEO_KV.put(KV_INX_SENT, JSON.stringify({ at: nowIso(), m }));
  } catch (e) { /* the ledger only saves IndexNow quota */ }
}
async function indexNowSend(env, who, urls, source, req) {
  const b = await readBundle(env), key = indexNowKeys(b, env)[0];
  if (!key) return { ok: false, status: 0, sent: 0, code: "no_key", message: "generate an IndexNow key first" };
  if (!urls.length) return { ok: false, status: 0, sent: 0, code: "no_urls", message: "no URLs to send" };
  const day = nowIso().slice(0, 10);
  let n = 0; try { n = +(await env.SEO_KV.get(KV_INX_DAY + day)) || 0; } catch (e) { n = 0; }
  if (n >= INDEXNOW_PER_DAY) return { ok: false, status: 429, sent: 0, code: "daily_limit", message: `at most ${INDEXNOW_PER_DAY} IndexNow submissions per day` };
  const site = siteOrigin(env), ep = String(env.INDEXNOW_ENDPOINT || "");
  const endpoint = /^https:\/\//.test(ep) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(ep) ? ep : "https://api.indexnow.org/indexnow";
  let status = 0, text = "";
  try {
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls }) });
    status = r.status; text = (await r.text()).slice(0, 300);
  } catch (e) { text = String(e && e.message || e).slice(0, 200); }
  try { await env.SEO_KV.put(KV_INX_DAY + day, String(n + 1), { expirationTtl: 172800 }); } catch (e) { /* counter only */ }
  const ok = status === 200 || status === 202, message = INX_MSG[status] || (status ? "HTTP " + status + (text ? ": " + text : "") : "network error: " + text);
  if (ok && req) await recordSent(env, req, urls);
  const log = await readJsonKV(env, KV_INX_LOG, []);
  try { await env.SEO_KV.put(KV_INX_LOG, JSON.stringify([{ at: nowIso(), by: who.id || "", by_email: who.email || "", source, count: urls.length, status, ok, message, sample: urls.slice(0, 5) }, ...(Array.isArray(log) ? log : [])].slice(0, 200))); } catch (e) { /* log only */ }
  return { ok, status, sent: ok ? urls.length : 0, message };
}
async function sitemapUrls(env, req, limit) {
  const out = [], seenMaps = new Set(), queue = ["/sitemap.xml"];
  while (queue.length && out.length < limit && seenMaps.size < 80) {
    const p = queue.shift();
    if (seenMaps.has(p)) continue;
    seenMaps.add(p);
    let xml = "";
    try { const r = await assetFetch(env, req, p); if (!r || !r.ok) continue; xml = await r.text(); } catch (e) { continue; }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1].replace(/&amp;/g, "&"));
    if (/<sitemapindex/i.test(xml)) { for (const l of locs) { try { queue.push(new URL(l).pathname); } catch (e) { /* skip */ } } }
    else for (const l of locs) { if (out.length >= limit) break; out.push(l); }
  }
  return out;
}
async function indexNowPost({ env, request: req }, who) {
  const b = await readBody(req, 2 * 1024 * 1024), site = siteOrigin(env), host = new URL(site).host, set = new Set(), bad = [];
  const addUrl = u => { try { const x = new URL(String(u), site + "/"); if (x.protocol === "https:" && x.host === host && !x.hash) set.add(x.toString()); else bad.push(String(u)); } catch (e) { bad.push(String(u)); } };
  if (Array.isArray(b.urls)) b.urls.slice(0, MAX_URLS + 1).forEach(addUrl);
  if (bad.length) return err(400, "url_not_on_host", `every URL must be https://${host}/…`, { urls: bad.slice(0, 5) });
  let source = "urls", skipped = 0;
  if (b.since) {
    // changed since `since`: overrides saved after it + pages whose build lastmod (a day) is on or after its day — minus
    // pages already sent in exactly their current state (the ledger), so a same-day build does not resend every page
    const t = Date.parse(b.since);
    if (!Number.isFinite(t)) return err(400, "invalid_since", "since must be an ISO date");
    const since = new Date(t).toISOString(), bundle = await readBundle(env), man = await loadManifest(env, req), cand = new Set();
    for (const [p, m] of Object.entries(bundle.meta.ov)) if (m && m.updated_at >= since && !/noindex/i.test((bundle.ov[p] || {}).robots || "")) cand.add(p);
    if (man.rows) for (const r of man.rows) if (r.lastmod && r.lastmod >= since.slice(0, Math.max(10, r.lastmod.length)) && !/noindex/i.test((bundle.ov[r.path] || {}).robots || r.robots)) cand.add(r.path);
    const sent = b.resend === true ? {} : await readSent(env), sig = await pageSig(env, req);
    for (const p of cand) { if (own(sent, p) && sent[p] === sig(p)) skipped++; else addUrl(absUrl(site, p)); }
    source = "since";
  }
  if (b.all === true) {
    const bundle = await readBundle(env), man = await loadManifest(env, req);
    if (man.rows) { for (const r of man.rows) if (!/noindex/i.test((bundle.ov[r.path] || {}).robots || r.robots)) addUrl(absUrl(site, r.path)); }
    else for (const u of await sitemapUrls(env, req, MAX_URLS)) addUrl(u);
    source = "all";
  }
  const urls = [...set];
  if (!urls.length) return err(400, "no_urls", skipped ? `nothing changed since the last send (${skipped} pages were already sent in their current state; resend:true sends them again)` : "nothing to send: give urls, since or all:true", { skipped });
  const r = await indexNowSend(env, who, urls.slice(0, MAX_URLS), source, req);
  return json({ ...r, truncated: urls.length > MAX_URLS, total: urls.length, skipped }, r.code === "no_key" ? 409 : r.code === "daily_limit" ? 429 : 200);
}
async function indexNowLog({ env }) { const l = await readJsonKV(env, KV_INX_LOG, []); return json({ items: Array.isArray(l) ? l : [] }); }
async function rebuild({ env }, who) {
  if (!env.PAGES_DEPLOY_HOOK) return json({ ok: false, reason: "deploy_hook_not_configured", message: "التعديلات شغالة فوراً على الطبقة الطرفية؛ خرائط الموقع تتحدث مع النشر القادم / Edge changes are live now; sitemaps refresh with the next deploy." });
  const last = await env.SEO_KV.get(KV_REBUILD);
  if (last && Date.now() - Date.parse(last) < 600000) return err(429, "too_soon", "one rebuild per 10 minutes", { retry_after_s: Math.ceil((600000 - (Date.now() - Date.parse(last))) / 1000) });
  let r;
  try { r = await fetch(env.PAGES_DEPLOY_HOOK, { method: "POST" }); } catch (e) { return json({ ok: false, reason: "deploy_hook_failed", status: 0 }, 502); }
  if (!r.ok) return json({ ok: false, reason: "deploy_hook_failed", status: r.status }, 502);
  const at = nowIso();
  await env.SEO_KV.put(KV_REBUILD, at, { expirationTtl: 86400 });
  await appendLog(env, who, [{ kind: "rebuild", ref: "deploy_hook", after: { at } }]);
  return json({ ok: true, triggered_at: at });
}
async function keywordsGet({ env, request: req }) { const k = await readKeywords(env, req); return json({ items: k.items, source: k.source, at: k.at }); }
async function keywordsPut({ env, request: req }, who) {
  const b = await readBody(req, 262144), site = siteOrigin(env), k = await readKeywords(env, req);
  const input = Array.isArray(b.items) ? b.items : [b], at = nowIso(), map = new Map(k.items.map(x => [x.cluster, x]));
  for (const x of input) {
    const n = normKeywordItem(x, site);
    if (!n) return err(400, "invalid_cluster", "cluster must be 1–40 letters, digits, _ or -", { field: "cluster" });
    if (x.target_url && !n.target_url) return err(400, "invalid_target_url", "target_url must be a path on this site", { field: "target_url" });
    map.set(n.cluster, { ...n, updated_by: who.id, updated_at: at });
  }
  const items = [...map.values()].sort((a, c) => (a.cluster < c.cluster ? -1 : 1));
  await env.SEO_KV.put(KV_KW, JSON.stringify({ at, by: who.id, items }));
  await appendLog(env, who, [{ kind: "keywords", ref: input.map(x => x.cluster).join(",").slice(0, 200), after: { count: input.length } }]);
  return json({ ok: true, items });
}
const GSC_COLS = {
  page: ["top pages", "page", "pages", "url", "أهم الصفحات", "الصفحة", "الصفحات"],
  query: ["top queries", "query", "queries", "أهم طلبات البحث", "طلبات البحث", "طلب البحث", "أهم الاستعلامات", "الاستعلام"],
  clicks: ["clicks", "النقرات"], impressions: ["impressions", "مرات الظهور"],
  ctr: ["ctr", "نسبة النقر إلى الظهور", "نسبة النقر إلى مرات الظهور", "نسبة النقر"], position: ["position", "average position", "الموضع", "متوسط الموضع", "الترتيب", "متوسط الترتيب"],
};
const gscNum = v => { let s = String(v == null ? "" : v).trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/٫/g, ".").replace(/[,٬\s]/g, ""); const pct = s.endsWith("%"); s = s.replace(/%$/, ""); const n = parseFloat(s); return Number.isFinite(n) ? (pct ? n / 100 : n) : 0; };
async function gscImport({ env, request: req }, who) {
  const table = csvParse(await readText(req, 5 * 1024 * 1024));
  if (table.length < 2) return err(400, "empty_csv", "the CSV is empty");
  const head = table[0].map(h => String(h).replace(/^\uFEFF/, "").trim().toLowerCase()), col = k => head.findIndex(h => GSC_COLS[k].includes(h));
  const ip = col("page"), iq = col("query");
  if (ip < 0 && iq < 0) return err(400, "gsc_format", "expected a Search Console Performance export (the Pages or Queries CSV)");
  const kind = ip >= 0 ? "pages" : "queries", ik = ip >= 0 ? ip : iq, [ic, ii, it, ipos] = ["clicks", "impressions", "ctr", "position"].map(col);
  const rows = [];
  for (const r of table.slice(1, 50001)) {
    const key = String(r[ik] || "").trim();
    if (!key) continue;
    rows.push({ [kind === "pages" ? "page" : "query"]: key, ...(kind === "pages" ? { path: normPath(key) } : {}), clicks: gscNum(r[ic]), impressions: gscNum(r[ii]), ctr: gscNum(r[it]), position: gscNum(r[ipos]) });
  }
  await env.SEO_KV.put(KV_GSC + kind, JSON.stringify({ at: nowIso(), by: who.id, rows }));
  await appendLog(env, who, [{ kind: "gsc_import", ref: kind, after: { rows: rows.length } }]);
  return json({ ok: true, kind, rows: rows.length });
}
async function gscGet({ env }, who, url) {
  const [p, q] = [await readJsonKV(env, KV_GSC + "pages", null), await readJsonKV(env, KV_GSC + "queries", null)];
  const fp = url.searchParams.get("page"), fq = normAr(url.searchParams.get("query") || ""), fpp = fp ? normPath(fp) : "";
  const rows = [...((p && p.rows) || []).map(r => ({ kind: "page", ...r })), ...((q && q.rows) || []).map(r => ({ kind: "query", ...r }))]
    .filter(r => (!fpp || r.kind !== "page" || r.path === fpp) && (!fq || r.kind !== "query" || normAr(r.query).includes(fq)));
  return json({ connected: false, source: p || q ? "csv" : "none", imported: { pages: p ? { at: p.at, rows: p.rows.length } : null, queries: q ? { at: q.at, rows: q.rows.length } : null }, rows: rows.slice(0, 5000) });
}

/* ---------- router ---------- */
const ROUTES = {
  "GET /": health, "GET /health": health,
  "GET /pages": pages,
  "GET /page": getPage, "PUT /page": (c, w) => putPage(c, w, false), "PATCH /page": (c, w) => putPage(c, w, true), "DELETE /page": deletePage,
  "POST /rollback": rollback, "GET /overrides": overrides, "GET /history": history,
  "GET /export.csv": exportCsv, "GET /export.json": exportJson, "POST /import": importCsv,
  "GET /redirects": redirectsGet, "POST /redirects": redirectsPost, "PUT /redirects": redirectsPost, "DELETE /redirects": redirectsDelete,
  "GET /test": testUrl,
  "GET /config": configGet, "PUT /config": configPut,
  "POST /indexnow/key": indexNowKey, "POST /indexnow": indexNowPost, "GET /indexnow/log": indexNowLog,
  "POST /rebuild": rebuild,
  "GET /keywords": keywordsGet, "PUT /keywords": keywordsPut,
  "POST /gsc/import": gscImport, "GET /gsc": gscGet,
};
const PATHS = new Set(Object.keys(ROUTES).map(k => k.slice(k.indexOf(" ") + 1)));
const PLATFORM_ROUTES = new Set(["GET /", "GET /health", "GET /export.csv", "GET /export.json", "POST /indexnow"]);

/* Preview deployments (<hash>.<project>.pages.dev, <branch>.<project>.pages.dev) run with the PRODUCTION KV, D1 and
   secrets unless the Pages project gives [env.preview] its own bindings. They answer reads but refuse every change
   (403 preview_read_only) unless SEO_PREVIEW_WRITES = "1" — set that only together with a separate preview KV. The
   production alias <project>.pages.dev and the custom domains can write. */
export const isPreviewHost = host => { const h = String(host || "").toLowerCase().replace(/:\d+$/, ""); return h.endsWith(".pages.dev") && h.split(".").length > 3; };

/* ctx = Pages Function context {request, env, waitUntil, …} */
export async function handleSeoApi(ctx) {
  const { request: req } = ctx, env = ctx.env || {};
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^.*?\/api\/seo/, "").replace(/\/+$/, "") || "/";
  const M = req.method === "HEAD" ? "GET" : req.method;
  if (M === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Cache-Control": "no-store" } });
  const key = M + " " + sub, fn = ROUTES[key];
  try {
    if (!fn) return PATHS.has(sub) ? err(405, "method", "method not allowed") : err(404, "not_found", "not found");
    if (!env.SEO_KV) return err(503, "kv_off", "the SEO_KV binding is missing in the Pages project");
    if (M !== "GET" && isPreviewHost(url.host) && !yes(env.SEO_PREVIEW_WRITES)) return err(403, "preview_read_only", "this is a preview deployment: it shares the production SEO data, so changes are saved only on " + siteOrigin(env) + "/seo-admin/ (or give previews their own KV and set SEO_PREVIEW_WRITES=1)");
    const who = await resolveCaller(req, env);
    if (!who.ok) return err(who.status, who.code, who.error);
    if (who.platform && !PLATFORM_ROUTES.has(key)) return err(403, "forbidden", "the platform key may only call GET /health, GET /export.csv, GET /export.json and POST /indexnow");
    if (M !== "GET" && !(await rateOk(env, "seo|" + who.id, 120, 60))) return err(429, "rate_limited", "too many changes — wait a minute");
    return await fn({ ...ctx, env, request: req }, who, url);
  } catch (e) {
    if (e instanceof ApiError) return err(e.s, e.code, e.message, e.extra);
    console.error("seo api error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}
export function resetApiMemos() { manMemo = { at: 0, rows: null, byPath: null, src: "" }; scoredMemo = { key: "", rows: null, summary: null }; rlMem.clear(); }
