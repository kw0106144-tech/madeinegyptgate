/* Control Center — content overlay, media, member self-service and the moderation queue (deploy 2).
   Normative spec: docs/janna/ACC-CONTRACT.md §3.2 (API), §4 (overlay), §4.11 (media), §3.1.7 + §8.4 (approvals), §3.1.15 (self-service).

   * Collections (§4.4): fac facx prod tend rfq offer zone news event award opp intl video proj banner notice cats. Edits are stored in
     D1 cc_content with NAMED fields (never array indices): kind "base" = an edit / hide of a row of the static data (addressed by its
     collection key), kind "add" = a new item (stable id). draft_json = working copy, live_json = published copy.
   * Publish → compile ALL live rows + cc_plans + public cc_settings + cats + pay readiness into ONE file (≤ 512 KiB), stored in D1
     cc_overlay (newest 20) and KV SEO_KV "acc:overlay" (+ "acc:overlay:prev"); served at GET /data/overlay.js (isolate memo 30 s →
     caches.default → KV → D1 → no-op; never a 5xx). Every string is neutralised (§0.4) before it is stored and again at compile.
   * Hidden / deleted items with a static SEO page get noindex / a 301 at the edge through the EXISTING SEO API (/api/seo/page,
     /api/seo/redirects) called with the acting admin's own Authorization header — this module never writes the KV key "seo:bundle".
   * Media (R2 binding MEDIA): JPEG / PNG / WebP only, checked by magic bytes, dimensions parsed from the header, EXIF / XMP / IPTC /
     comments / PNG text chunks stripped (no re-encoding), key u/<yyyy>/<id>.<ext>. Served at GET /media/u/* (public, or a signed
     1-hour preview for member uploads that are not approved yet). Meeting recordings (meetings/…) are never reachable here.
   * Member self-service: /api/me/products (within the plan's product limit, images, review), /api/me/company (claim / create / edit
     requests for the member's own directory listing), /api/me/media; the admin queue /api/admin/cc/approvals*.
   Static imports (contract §0.2): ./common.js, ./auth.js, ./data.json only. Cross-area calls go through the CC object (payments'
   payReady, the e-mail center's renderTemplate) and are optional: without them this module still works with honest defaults.
   Every module-level cache is keyed by env.DB (WeakMap): the test suite creates many environments in one process. */
import { readJson, line, now, iso, hmac, safeEq, jparse, secretOf, cairoDay, site, rateOk, GOV_CODES, isEmail, emailKey, mail, notify, effPlan, PLAN_LV } from "./common.js";
import * as COMMON from "./common.js"; // planCan / planLimit arrive with integration patch P-W2 — used when present (runtime check)
import { authUser, isLinkSession } from "./auth.js";
import DATA from "./data.json";

/* ============================================ constants ============================================ */
export const OVERLAY_LIMIT = 524288;            // 512 KiB hard limit of /data/overlay.js (413 overlay_too_large)
export const OVERLAY_WARN = 262144;             // the panel warns above 256 KiB
const KEEP_VERSIONS = 20, LOCK_KEY = "overlay:publish", LOCK_MS = 30000;
const KV_KEY = "acc:overlay", KV_PREV = "acc:overlay:prev";
const MEMO_MS = 30000, MEDIA_MEMO_MS = 60000, EDGE_CALLS = 45, NET_TIMEOUT = 8000, PREVIEW_S = 3600;
const NOOP_JS = "window.MIGOVL_DATA=null;\n";
const RID_ABC = "23456789abcdefghjkmnpqrstuvwxyz"; // 31 characters (no 0 1 i l o), like the inquiry REF alphabet
const RID_RX = "[2-9a-hjkmnp-z]";
const MB = 1024 * 1024, MAX_ADMIN_UPLOAD = 5 * MB, MAX_MEMBER_UPLOAD = 3 * MB;
const MIMES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PURPOSES = ["logo", "product", "banner", "news", "event", "zone", "offer", "project", "notice", "other"];
const PURPOSE_MIN = { banner: [1120, 200], logo: [96, 96], product: [300, 300] };
const GOVS = Object.keys(GOV_CODES);
export const BASE_CATS = ["food", "build", "plastic", "elec", "glass", "metal", "petro", "med", "furn", "cosm", "other"];
/* collections whose published changes reach the generated static SEO pages only after a build (§4.9) */
const STATIC_COLLS = new Set(["fac", "facx", "prod", "tend", "rfq", "news", "event", "award", "opp", "intl", "offer", "zone", "proj", "video"]);

/* ============================================ small helpers ============================================ */
class CE extends Error { constructor(status, code, msg, extra) { super(msg || code); this.status = status; this.code = code; this.extra = extra || {}; if (this.extra.errors) this.errors = this.extra.errors; } }
const fail = (status, code, msg, extra) => { throw new CE(status, code, msg, extra); };
const own = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const noTable = e => /no such table|no such column/i.test(String((e && e.message) || e));
const te = new TextEncoder();
const utf8len = s => te.encode(s).length;
const clen = s => Array.from(String(s)).length;
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const actorOf = adm => (adm && adm.member ? String(adm.member.email || adm.member.id || "") : adm && adm.role === "platform" ? "platform" : "system");
export function rid(n) {
  let s = "";
  while (s.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < 248 && s.length < n) s += RID_ABC[b % 31]; // 248 = 8 × 31: no bias
  return s;
}
const hex2 = async (data) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? te.encode(data) : data))].map(b => b.toString(16).padStart(2, "0")).join("");
/* a deterministic id (import re-runs map to the same row): rid alphabet from a hash */
async function ridOf(seed, n) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(seed))); let s = ""; for (let i = 0; s.length < n && i < h.length; i++) s += RID_ABC[h[i] % 31]; return s; }
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = sortDeep(v[k]); return o; }
  return v;
}
const stable = v => JSON.stringify(sortDeep(v));
/* JSON for a <script>: keys sorted; < > & U+2028 U+2029 escaped (no "</script", no line terminators inside string literals) */
const scriptJson = v => stable(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/* ============================================ HTTP (own wrapper, contract §0.3) ============================================ */
const SITE_ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
function ccCors(req, env) {
  const o = (req && req.headers.get("Origin")) || "", extra = String((env && env.CC_ORIGINS) || "").split(",").map(s => s.trim()).filter(Boolean);
  return o && (SITE_ORIGINS.includes(o) || extra.includes(o)) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "600" } : {};
}
const ccHead = (req, env) => ({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) });
const ccJson = (req, env, body, status = 200, extra) => new Response(JSON.stringify(body), { status, headers: { ...ccHead(req, env), ...(extra || {}) } });
const ccErr = (req, env, status, code, msg, extra) => ccJson(req, env, { error: msg || code, code, ...(extra || {}) }, status);
const ccPreflight = (req, env) => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
const fromCE = (req, env, e) => ccErr(req, env, e.status || 500, e.code || "server", e.message, e.extra);
async function body(req, max) { const b = await readJson(req, max); if (b.tooLarge) fail(413, "too_large", "request too large"); if (b.bad) fail(400, "bad_json", "bad json"); return b; }

/* ============================================ text safety (contract §0.4) ============================================ */
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, BIDI = /[\u202a-\u202e\u2066-\u2069]/g; // bidi embedding controls can disguise text
export const neutral = s => String(s == null ? "" : s).replace(CTRL, "").replace(BIDI, "").replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "ˋ").trim();
const neutral1 = s => neutral(String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ")).replace(/\s+/g, " ");
const neutralM = s => neutral(String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/\t/g, " ")).replace(/[ \u00a0]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
/* https: absolute URL — no credentials, no spaces / quotes / angle brackets / backslashes, ≤ max (kept as typed: base data URLs carry raw Arabic) */
export function httpsUrl(v, max = 500) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (s.length > max || /[\s"'<>`\\\u0000-\u001f]/.test(s) || !/^https:\/\/[^/]/i.test(s)) return null;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password && u.hostname ? s : null; } catch (e) { return null; }
}
/* same-site image path (§0.4): /media/u/… /img/… img/… (no "..", no other characters) */
const IMG_PATH_RX = /^(?:\/(?:media\/u|img)\/|img\/)[A-Za-z0-9/_\-.]+$/;
const imgPath = v => { const s = String(v == null ? "" : v).trim(); if (!s) return ""; return s.length <= 300 && IMG_PATH_RX.test(s) && !/(^|\/)\.\.?(\/|$)/.test(s) ? s : null; };
const MEDIA_RX = new RegExp(`^/media/u/(\\d{4})/(${RID_RX}{16})\\.(jpg|png|webp)$`);
/* a link: https URL or a same-site path ("/register.html#partner") — never "//host", javascript:, data: */
const linkOk = v => { const s = String(v == null ? "" : v).trim(); if (!s) return ""; if (/^\/(?!\/)/.test(s)) return s.length <= 500 && !/[\s"'<>`\\\u0000-\u001f]/.test(s) ? s : null; return httpsUrl(s); };

/* ---------- contact data in public text (port of functions/_lib/seo-privacy.js — same rule, the Worker cannot import it) ---------- */
const PLATFORM_PHONES = ["+20238346757", "+201279188996"], PLATFORM_EMAIL_DOMAINS = ["madeinegyptgate.com"];
const asciiDigits = s => String(s == null ? "" : s).replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf));
function phoneKey(v) { let d = asciiDigits(v).replace(/\D/g, "").replace(/^00/, ""); if (/^20\d{9,10}$/.test(d)) d = d.slice(2); return d.replace(/^0+/, ""); }
function allowList(env) {
  const phones = new Set(PLATFORM_PHONES.map(phoneKey)), domains = new Set(PLATFORM_EMAIL_DOMAINS), emails = new Set();
  for (const raw of String((env && env.SEO_PUBLIC_CONTACTS) || "").split(/[,;\n]+/)) {
    const s = raw.trim().toLowerCase(); if (!s) continue;
    if (s.startsWith("@")) domains.add(s.slice(1)); else if (s.includes("@")) emails.add(s); else if (phoneKey(s).length >= 5) phones.add(phoneKey(s));
  }
  return { phones, domains, emails };
}
const SEP = "[\\s\\-./()\\u00a0\\u200e\\u200f]*";
const MOBILE_RX = new RegExp(`(?<![\\d+])(?:(?:\\+|00)${SEP}20${SEP}|0)${SEP}1[0125](?:${SEP}\\d){8}(?!\\d)`, "g");
const LAND_RX = new RegExp(`(?<![\\d+])(?:(?:\\+|00)${SEP}20${SEP}\\(?0?|\\(?0)(?:2\\)?(?:${SEP}\\d){8}|3\\)?(?:${SEP}\\d){7}|(?:4[0-8]|5[05-7]|6[2-9]|8[2468]|9[2-7])\\)?(?:${SEP}\\d){7})(?!\\d)`, "g");
const WORD_RX = new RegExp(`(?:الخط الساخن|خط ساخن|رقم الهاتف|رقم التليفون|تليفاكس|تليفون|تلفون|هاتف|فاكس|موبايل|محمول|جوال|واتساب|واتس اب|واتس|اتصل|اتصال|hot\\s?line|telephone|tel|phone|mobile|cell|fax|whats\\s?app|call)\\s*[:：\\-–]?\\s*((?:\\+|00)?\\d(?:${SEP}\\d){4,})`, "gi");
const WA_RX = /(?:wa\.me\/\+?\d{6,}|whatsapp\.com\/send\/?\?phone=\+?\d{6,}|\b(?:tel|sms|callto):\+?[\d\s\-.()]{5,})/gi;
const MAIL_RX = /[a-z0-9._%+-]+\s*(?:@|＠|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*([a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\})\s*[a-z0-9-]+)+)/gi;
const mailDom = d => d.toLowerCase().replace(/\s+/g, "").replace(/[([{]dot[)\]}]/g, ".");
function mailAllowed(m, domain, allow) {
  const dom = mailDom(domain), addr = m.toLowerCase().replace(/\s+/g, "").replace(/[([{]at[)\]}]|＠/g, "@").replace(/[([{]dot[)\]}]/g, ".");
  return allow.emails.has(addr) || [...allow.domains].some(a => dom === a || dom.endsWith("." + a));
}
export function findContacts(text, allow = allowList()) {
  const s = asciiDigits(text), out = [], seen = new Set();
  const add = (kind, value) => { const k = kind === "phone" ? "p|" + phoneKey(value) : "e|" + value.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ kind, value: value.trim() }); } };
  for (const rx of [MOBILE_RX, LAND_RX]) for (const m of s.matchAll(rx)) if (!allow.phones.has(phoneKey(m[0]))) add("phone", m[0]);
  for (const m of s.matchAll(WORD_RX)) if (!allow.phones.has(phoneKey(m[1]))) add("phone", m[1]);
  for (const m of s.matchAll(WA_RX)) if (!allow.phones.has(phoneKey(m[0]))) add("phone", m[0]);
  for (const m of s.matchAll(MAIL_RX)) if (!mailAllowed(m[0], m[1], allow)) add("email", m[0]);
  return out;
}
const CONTACT_MSG = "بيانات التواصل الشخصية (تليفون، واتساب، إيميل) مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة / phone numbers, WhatsApp numbers and e-mail addresses are not published (buyers contact through the platform)";

/* ============================================ collections (§4.4) ============================================ */
/* field: {n, t, max, req (required on add), en (English twin → tr), tr (twin only), enum, min, maxv, nul (empty value: null | ""),
   items, perm, src (the source URL: required to publish where the collection needs one), priv (stored, never compiled), purpose}
   types: t one-line text · m multi-line text · e enum · b true/false · b01 0/1 · n number · i integer · d YYYY-MM-DD · gov region code
   · govs list of codes · url https URL · link https URL or same-site path · img same-site image path · list list of one-line texts ·
   yt YouTube URL · upd [[date, text]] · pages page keys · social {facebook, x, instagram, linkedin, youtube, tiktok} · slug category key */
const f = (n, t, o) => Object.assign({ n, t }, o || {});
const TYPES_FAC = ["مصنع", "شركة ومورد"], TYPES_FACX = ["مصنع", "شركة"];
const TEND_TYPES = ["مناقصة عامة", "مناقصة", "ممارسة عامة", "مناقصة محدودة"];
const ZONE_TYPES = ["industrial_area", "industrial_city", "free_zone", "tech_park", "port_zone", "investment_zone"];
const LEGACY_IMG = f("legacy_img", "legacyurl", { priv: 1 }); // the old system's image URL (import): admin-only until the image is re-uploaded
export const COLLS = {
  fac: { ar: "دليل الشركات", en: "Company directory", global: "window.MIGOLDFAC (+ MIGOLDFACD)", key: "decoded NFC pathname of row[7]", hide: "hole", adds: true, idp: "c-", contacts: true, hub: "/factories/", perm: "directory.write", seo_prefix: "/factories/",
    derived: ["id", "url"], fields: [
      f("name", "t", { max: 160, req: 1, en: "name_en" }), f("name_en", "t", { max: 160, tr: 1 }), f("sector", "t", { max: 80, req: 1 }), f("location", "t", { max: 160 }),
      f("type", "e", { enum: TYPES_FAC, req: 1 }), f("verified", "b01", { perm: "directory.verify" }), f("logo", "img", { purpose: "logo" }),
      f("description", "m", { max: 2000, en: "description_en" }), f("description_en", "m", { max: 2000, tr: 1 }),
      f("products", "list", { items: 30, max: 80, en: "products_en" }), f("products_en", "list", { items: 30, max: 80, tr: 1 }),
      f("gov", "gov", { req: 1 }), f("website", "url"), f("video", "yt"), f("social", "social")] },
  facx: { ar: "شركات من مصادر عامة", en: "Public-source companies", global: "window.MIGFACX.list (+ .fp)", key: "row[0] (name)", hide: "hole", adds: false, contacts: true, hub: "/factories/", perm: "directory.write", seo_prefix: "",
    derived: [], fields: [
      f("name_en", "t", { max: 160, tr: 1 }), f("sector", "t", { max: 80 }), f("location", "t", { max: 160 }), f("type", "e", { enum: TYPES_FACX }),
      f("description", "m", { max: 2000, en: "description_en" }), f("description_en", "m", { max: 2000, tr: 1 }), f("verified", "b01", { perm: "directory.verify" }),
      f("logo", "img", { purpose: "logo" }), f("cover", "t", { max: 20, pattern: /^[a-z0-9_-]{0,20}$/ }), f("source_url", "url"), f("website", "url"),
      f("products", "list", { items: 30, max: 80, en: "products_en" }), f("products_en", "list", { items: 30, max: 80, tr: 1 })] },
  prod: { ar: "المنتجات", en: "Products", global: "window.MIGOLDP (+ MIGP2F)", key: "decoded NFC pathname of row[5]", hide: "hole", adds: true, idp: "p-", contacts: true, hub: "/products/", seo_prefix: "/industrial_products/",
    derived: ["id", "url"], fields: [
      f("name", "t", { max: 120, req: 1, en: "name_en" }), f("name_en", "t", { max: 120 }), f("description", "m", { max: 600, en: "description_en" }), f("description_en", "m", { max: 600, tr: 1 }),
      f("category", "cat", { req: 1 }), f("image", "img", { purpose: "product" }), f("images", "imgs", { items: 10 }), f("price", "t", { max: 40 }), f("featured", "b01"),
      f("company_url", "url", { req: 1, memberOptional: 1 }), f("company_ref", "t", { max: 20, pattern: new RegExp(`^(?:\\d{1,6}|x\\d{1,6}|c-${RID_RX}{8})?$`) }), LEGACY_IMG] },
  tend: { ar: "مناقصات المنصة", en: "Platform tenders", global: "window.MIGTEND", key: "row[0] + \"|\" + row[3] (ref|title)", hide: "splice", adds: true, src: "source_url", hub: "/tenders/", seo_prefix: "/tender-item/",
    derived: ["id", "ref"], fields: [
      f("type", "e", { enum: TEND_TYPES, req: 1 }), f("title", "t", { max: 300, req: 1, en: "title_en" }), f("title_en", "t", { max: 300, tr: 1 }),
      f("entity", "t", { max: 160, en: "entity_en" }), f("entity_en", "t", { max: 160, tr: 1 }), f("gov_name", "t", { max: 60 }), f("sector", "t", { max: 120 }),
      f("booklet", "i", { min: 0, maxv: 100000000, nul: "" }), f("bond", "t", { max: 60 }), f("deadline", "d"), f("gov", "gov"), f("source_url", "url", { src: 1 }),
      /* owner 2026-11-25: every tender carries its description and the issuer's procurement contacts (one «label: value» per line) — shown to subscribers only (oldlists.part.py detail) */
      f("details", "m", { max: 2000 }), f("contacts", "m", { max: 1000 })] },
  rfq: { ar: "طلبات عروض المشترين", en: "Buyer RFQs", global: "window.MIGRFQ", key: "String(row[0])", hide: "splice", adds: true, contacts: true, hub: "/rfq/", seo_prefix: "/rfq/",
    derived: ["id", "no", "url"], priv: ["client", "phone", "email", "channel", "inquiry_ref", "status", "source_url"], fields: [
      f("date", "d"), f("title", "t", { max: 300, req: 1 }), f("details", "m", { max: 2000, en: "details_en" }), f("details_en", "m", { max: 2000 }),
      f("delivery", "t", { max: 120 }), f("qty", "t", { max: 60 }), f("deadline", "d"), f("gov", "gov"), f("sector", "t", { max: 120 })] },
  offer: { ar: "عروض المحلات", en: "Retail offers", global: "window.MIGOFFERS", key: "o.id", hide: "splice", adds: true, idp: "cc-of-", src: "source_url", hub: "/offers/", seo_prefix: "",
    derived: ["id", "discount_pct", "price_sar", "price_aed", "old_price_sar", "old_price_aed", "saudi_made", "made_in_uae", "source_checked", "img", "image_file", "note"], fields: [
      f("product_ar", "t", { max: 200, req: 1, en: "product_en" }), f("product_en", "t", { max: 200 }), f("brand", "t", { max: 80 }), f("made_in_egypt", "b"),
      f("category_ar", "t", { max: 80, en: "category_en" }), f("category_en", "t", { max: 80 }), f("size_unit", "t", { max: 40 }),
      f("price_egp", "n", { min: 0, maxv: 10000000, req: 1 }), f("old_price_egp", "n", { min: 0, maxv: 10000000, nul: null }),
      f("store_ar", "t", { max: 120, req: 1, en: "store_en" }), f("store_en", "t", { max: 120 }), f("cities_ar", "list", { items: 30, max: 60 }), f("region_codes", "govs", { items: 27 }),
      f("branch_example", "t", { max: 200, en: "branch_en" }), f("branch_en", "t", { max: 200 }), f("lat", "n", { min: -90, maxv: 90, nul: null }), f("lon", "n", { min: -180, maxv: 180, nul: null }),
      f("approx", "b"), f("valid_from", "d"), f("valid_to", "d", { req: 1 }), f("source_url", "url", { src: 1 }), f("image", "img", { purpose: "offer" })] },
  zone: { ar: "المناطق الصناعية", en: "Industrial zones", global: "window.MIGZONES", key: "z.id", hide: "splice", adds: true, idp: "cc-zone-", src: "source_url", hub: "/industrial-zones/", seo_prefix: "/industrial-zones/",
    derived: ["id"], fields: [
      f("name_ar", "t", { max: 200, req: 1, en: "name_en" }), f("name_en", "t", { max: 200 }), f("type", "e", { enum: ZONE_TYPES, req: 1 }), f("region_code", "gov", { req: 1 }),
      f("city", "t", { max: 120 }), f("lat", "n", { min: -90, maxv: 90, nul: null }), f("lon", "n", { min: -180, maxv: 180, nul: null }), f("approx", "b"), f("coord_source", "url"),
      f("area_km2", "n", { min: 0, maxv: 100000, nul: null }), f("area_text", "t", { max: 200 }), f("focus_sectors_ar", "list", { items: 20, max: 80 }), f("operator_ar", "t", { max: 160 }),
      f("website", "url"), f("status_ar", "t", { max: 80 }), f("notes", "m", { max: 600 }), f("source_url", "url", { src: 1 })] },
  news: { ar: "الأخبار", en: "News", global: "window.REAL.news", key: "n.url", hide: "hole", adds: true, idp: "n-", src: "url", hub: "/news/", seo_prefix: "/news/",
    derived: ["id", "image_file", "image_url"], fields: [
      f("title_ar", "t", { max: 300, req: 1, en: "title_en" }), f("title_en", "t", { max: 300, tr: 1 }), f("summary_ar", "m", { max: 1200, en: "summary_en" }), f("summary_en", "m", { max: 1200, tr: 1 }),
      f("source_name", "t", { max: 120, req: 1 }), f("date", "d", { req: 1 }), f("category_ar", "t", { max: 80 }), f("region_code", "gov", { nul: null }),
      f("url", "url", { req: 1, src: 1 }), f("image", "img", { purpose: "news" }), LEGACY_IMG] },
  event: { ar: "الفعاليات والمعارض", en: "Events & exhibitions", global: "window.REAL.events", key: "e.id", hide: "hole", adds: true, idp: "cc-ev-", src: "source_url", hub: "/events/", seo_prefix: "/events/",
    derived: ["id", "image_file"], fields: [
      f("name_ar", "t", { max: 300, req: 1, en: "name_en" }), f("name_en", "t", { max: 300 }), f("start_date", "d", { req: 1 }), f("end_date", "d"), f("venue", "t", { max: 200 }),
      f("organizer", "t", { max: 160, nul: null }), f("sector_ar", "t", { max: 120 }), f("url", "url"), f("about_ar", "m", { max: 2000 }), f("agenda_ar", "list", { items: 12, max: 200 }),
      f("source_url", "url", { src: 1 }), f("city", "t", { max: 120 }), f("region_code", "gov"), f("image", "img", { purpose: "event" }), LEGACY_IMG] },
  award: { ar: "الترسيات والفائزون", en: "Awards & winners", global: "window.REAL.awards", key: "title_ar + \"|\" + date + \"|\" + (source_url || \"\")", hide: "hole", adds: true, idp: "a-", src: "source_url", hub: "/awards/", seo_prefix: "/awards/",
    derived: ["id", "value_sar_million", "value_aed_million"], fields: [
      f("title_ar", "t", { max: 300, req: 1, en: "title_en" }), f("title_en", "t", { max: 300, tr: 1 }), f("winner_ar", "t", { max: 200, req: 1, en: "winner_en" }), f("winner_en", "t", { max: 200, tr: 1 }),
      f("awarding_entity_ar", "t", { max: 200, en: "awarding_entity_en" }), f("awarding_entity_en", "t", { max: 200, tr: 1 }),
      f("value_egp_million", "n", { min: 0, maxv: 10000000, nul: null }), f("value_usd_million", "n", { min: 0, maxv: 10000000, nul: null }), f("value_eur_million", "n", { min: 0, maxv: 10000000, nul: null }),
      f("region_code", "gov"), f("city", "t", { max: 120 }), f("date", "d", { req: 1 }), f("source_url", "url", { src: 1 })] },
  opp: { ar: "فرص بمصادر", en: "Sourced opportunities", global: "window.REAL.tenders", key: "t.id", hide: "hole", adds: true, src: "source_url", hub: "/tenders/", seo_prefix: "",
    derived: ["id"], fields: [
      f("ref", "t", { max: 80 }), f("kind", "t", { max: 40 }), f("title_ar", "t", { max: 300, req: 1, en: "title_en" }), f("title_en", "t", { max: 300 }),
      f("entity_ar", "t", { max: 200, req: 1, en: "entity_en" }), f("entity_en", "t", { max: 200 }), f("region_code", "gov"), f("city", "t", { max: 120 }), f("sector_ar", "t", { max: 120 }),
      f("publish_date", "d", { req: 1 }), f("closing_date", "d"), f("status", "e", { enum: ["open", "closed"] }), f("procurement_type", "t", { max: 80 }),
      f("bid_bond_egp", "n", { min: 0, maxv: 100000000000, nul: null }), f("booklet_price_egp", "n", { min: 0, maxv: 100000000, nul: null }), f("source_url", "url", { src: 1 }),
      f("via", "t", { max: 200 }), f("note", "m", { max: 600 })] },
  intl: { ar: "فرص دولية", en: "International opportunities", global: "window.REAL.tenders_intl", key: "t.ref", hide: "hole", adds: false, hub: "/tenders/", seo_prefix: "",
    derived: [], fields: [
      f("title_ar", "t", { max: 300, en: "title_en" }), f("title_en", "t", { max: 300 }), f("entity_ar", "t", { max: 200 }), f("sector_ar", "t", { max: 120 }), f("closing_date", "d"),
      f("estimated_value", "n", { min: 0, maxv: 1e13, nul: null }), f("currency", "t", { max: 10 }), f("source_url", "url")] },
  video: { ar: "الفيديوهات", en: "Videos", global: "window.MIGVIDS", key: "v.id (YouTube id)", hide: "splice", adds: true, src: "source_url", hub: "", seo_prefix: "",
    derived: ["id", "source_url", "thumb", "title_original", "verified_oembed", "duration"], fields: [
      f("url", "yt", { req: 1 }), f("title_ar", "t", { max: 300, req: 1, en: "title_en" }), f("title_en", "t", { max: 300 }), f("channel", "t", { max: 120 }), f("date", "d"),
      f("date_approx", "b"), f("category_ar", "t", { max: 80 }), f("governorate", "gov"), f("lang", "e", { enum: ["ar", "en"] })] },
  proj: { ar: "المشاريع", en: "Projects", global: "window.MIG.PROJECTS", key: "p[0]", hide: "splice", adds: true, src: "source_url", hub: "/projects/", seo_prefix: "/projects/",
    derived: ["id"], fields: [
      f("name", "t", { max: 300, req: 1 }), f("region", "t", { max: 120 }), f("city", "t", { max: 120 }), f("sector", "t", { max: 120 }), f("stage", "i", { min: 0, maxv: 6, req: 1 }),
      f("value", "n", { min: 0, maxv: 1e9, nul: null }), f("owner", "t", { max: 200 }), f("contractor", "t", { max: 200 }), f("consultant", "t", { max: 200 }),
      f("start", "t", { max: 20 }), f("end", "t", { max: 20 }), f("updates", "upd", { items: 10, max: 500 }), f("source_url", "url", { req: 1, src: 1 }), f("image", "img", { purpose: "project" }), LEGACY_IMG] },
  banner: { ar: "البانرات الإعلانية", en: "Banners", global: "(overlay only) banners / banner_hide", key: "built-in banner image path (hide only)", hide: "splice", adds: true, idp: "b-", hub: "", seo_prefix: "",
    derived: ["id"], priv: ["member_id"], fields: [
      f("place", "e", { enum: ["strategic", "partner", "home"], req: 1 }), f("img", "img", { purpose: "banner", req_pub: 1 }), f("link", "link"),
      f("title_ar", "t", { max: 120 }), f("title_en", "t", { max: 120 }), f("alt_ar", "t", { max: 160 }), f("alt_en", "t", { max: 160 }),
      f("start", "d"), f("end", "d"), f("sort", "i", { min: 0, maxv: 1000, def: 10 }), LEGACY_IMG] },
  notice: { ar: "إعلانات الموقع", en: "Site notices", global: "(overlay only) notices", key: "— (adds only)", hide: "splice", adds: true, idp: "nt-", bases: false, hub: "", seo_prefix: "",
    derived: ["id"], fields: [
      f("text_ar", "t", { max: 200, req: 1 }), f("text_en", "t", { max: 200 }), f("link", "link"), f("level", "e", { enum: ["info", "success", "warn"], def: "info" }),
      f("pages", "pages", { items: 50 }), f("start", "d"), f("end", "d"), f("dismissible", "b01", { def: 1 })] },
  cats: { ar: "تصنيفات السوق", en: "Market categories", global: "(overlay only) cats", key: "category key (food, build …)", hide: "splice", adds: true, hub: "", seo_prefix: "",
    derived: [], fields: [f("key", "slug", { req: 1, addOnly: 1 }), f("ar", "t", { max: 60, req: 1 }), f("en", "t", { max: 60 }), f("icon", "t", { max: 8 })] },
};
const CONTENT_COLLS = ["fac", "facx", "prod", "tend", "rfq", "offer", "zone", "news", "event", "award", "opp", "intl", "video", "proj"];
const fieldOf = (coll, n) => COLLS[coll].fields.find(x => x.n === n);
/* the schema as JSON for the panel (GET /api/admin/cc/content/schema) */
export function schemaJson() {
  const colls = {};
  for (const [k, C] of Object.entries(COLLS)) colls[k] = {
    label_ar: C.ar, label_en: C.en, global: C.global, key: C.key, hide_mode: C.hide, adds: !!C.adds, bases: C.bases !== false, source_required: C.src || "", id_prefix: C.idp || "",
    hub: C.hub || "", seo_prefix: C.seo_prefix || "", static_impact: STATIC_COLLS.has(k), contacts_refused: !!C.contacts, derived: C.derived || [], private: C.priv || [],
    fields: C.fields.map(x => ({ name: x.n, type: x.t, max: x.max || null, items: x.items || null, required_on_add: !!x.req, required_to_publish: !!(x.req || x.src || x.req_pub), enum: x.enum || (x.t === "cat" ? BASE_CATS : x.t === "gov" || x.t === "govs" ? GOVS : undefined),
      min: x.min != null ? x.min : undefined, max_value: x.maxv != null ? x.maxv : undefined, public: !x.priv, en: x.en || undefined, tr_only: !!x.tr, perm: x.perm || undefined, purpose: x.purpose || undefined, add_only: !!x.addOnly })),
  };
  return { colls, limit: OVERLAY_LIMIT, warn: OVERLAY_WARN, media: { types: Object.keys(MIMES), max_admin: MAX_ADMIN_UPLOAD, max_member: MAX_MEMBER_UPLOAD, purposes: PURPOSES, min: PURPOSE_MIN } };
}

/* ============================================ validation ============================================ */
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const dateOk = s => DATE_RX.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const SLUG_RX = /^[a-z][a-z0-9_]{1,19}$/, PAGE_RX = /^[a-z0-9][a-z0-9_\-./]{0,60}$/;
const SOCIAL_KEYS = ["facebook", "x", "instagram", "linkedin", "youtube", "tiktok"];
const TEXTY = new Set(["t", "m", "list"]);
export function ytId(v) {
  const s = String(v == null ? "" : v).trim(); if (!s) return "";
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  let id = "";
  if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "youtube-nocookie.com" || h === "music.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); id = m ? m[1] : ""; }
  } else return null;
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
const ytUrl = id => "https://www.youtube.com/watch?v=" + id;
/* market category keys: the base keys + category adds that are not deleted */
async function catKeys(env) {
  const keys = new Set(BASE_CATS);
  try { for (const r of (await env.DB.prepare("SELECT draft_json, live_json FROM cc_content WHERE coll = 'cats' AND kind = 'add' AND deleted = 0").all()).results || []) { const k = jparse(r.live_json || r.draft_json, {}).key; if (SLUG_RX.test(k || "")) keys.add(k); } } catch (e) { /* no table */ }
  return keys;
}
/* a /media/u/ reference must be a known, non-deleted upload: public (admin) — or pending when the caller is the approval flow /
   the member's own submission (allowPending); banners must be ≥ 1120 × 200 */
async function mediaRef(env, path, F, o) {
  const m = MEDIA_RX.exec(path); if (!m) return { v: path };
  let row = null; try { row = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(m[2]).first(); } catch (e) { row = null; }
  if (!row || row.r2_key !== `u/${m[1]}/${m[2]}.${m[3]}` || row.status === "deleted" || row.status === "rejected") return { err: "invalid_image", msg: "الصورة مش موجودة في مكتبة الصور / image not found in the media library" };
  if (row.status !== "public" && !(o.allowPending && (!o.memberId || (row.owner_type === "member" && row.owner_id === o.memberId)))) return { err: "invalid_image", msg: "الصورة لسه بانتظار الموافقة / image is not approved yet" };
  const min = F.purpose && PURPOSE_MIN[F.purpose];
  if (F.purpose === "banner" && min && (row.width < min[0] || row.height < min[1])) return { err: "invalid_image", msg: `صورة البانر لازم تكون ${min[0]}×${min[1]} على الأقل / banner images must be at least ${min[0]}×${min[1]}` };
  return { v: path, media: row };
}
function textCheck(s, F, contactsOn, allow) {
  if (F.max && clen(s) > F.max) return { err: "too_long", msg: `${F.n}: الحد الأقصى ${F.max} حرف / at most ${F.max} characters` };
  if (F.pattern && !F.pattern.test(s)) return { err: "invalid_value", msg: `${F.n}: قيمة غير صحيحة / invalid value` };
  if (contactsOn && s) { const c = findContacts(s, allow); if (c.length) return { err: "invalid_contact", msg: CONTACT_MSG }; }
  return null;
}
async function normValue(env, coll, F, raw, o, contactsOn, allow) {
  const t = F.t, s = typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : null;
  const bad = (err, msg) => ({ err, msg: msg || `${F.n}: قيمة غير صحيحة / invalid value` });
  switch (t) {
    case "t": case "m": { if (s == null) return bad("invalid_value"); const v = t === "t" ? neutral1(s) : neutralM(s); const e = textCheck(v, F, contactsOn, allow); return e || { v }; }
    case "e": { const v = String(s == null ? "" : s).trim(); if (!v) return { v: "" }; return F.enum.includes(v) ? { v } : bad("invalid_enum", `${F.n}: لازم تكون واحدة من ${F.enum.join(" · ")} / must be one of ${F.enum.join(", ")}`); }
    case "cat": { const v = String(s == null ? "" : s).trim().toLowerCase(); if (!v) return { v: "" }; return (await catKeys(env)).has(v) ? { v } : bad("invalid_enum", `${F.n}: تصنيف غير معروف / unknown category`); }
    case "slug": { const v = String(s == null ? "" : s).trim().toLowerCase(); if (!v) return { v: "" }; return SLUG_RX.test(v) ? { v } : bad("invalid_value", "key: حروف إنجليزية صغيرة وأرقام / lower-case letters, digits, _ (2–20)"); }
    case "b": { if (raw === true || raw === false) return { v: raw }; const v = String(raw).toLowerCase(); return ["1", "true", "yes", "on"].includes(v) ? { v: true } : ["0", "false", "no", "off", ""].includes(v) ? { v: false } : bad("invalid_value"); }
    case "b01": { if (raw === true || raw === 1 || raw === "1" || raw === "true") return { v: 1 }; if (raw === false || raw === 0 || raw === "0" || raw === "false" || raw === "") return { v: 0 }; return bad("invalid_value"); }
    case "n": case "i": {
      if (raw === "" ) return { v: F.nul !== undefined ? F.nul : null };
      const v = typeof raw === "number" ? raw : /^-?\d+(?:\.\d+)?$/.test(String(raw).trim()) ? Number(String(raw).trim()) : NaN;
      if (!Number.isFinite(v) || (t === "i" && !Number.isInteger(v))) return bad("invalid_number", `${F.n}: رقم غير صحيح / not a valid number`);
      if ((F.min != null && v < F.min) || (F.maxv != null && v > F.maxv)) return bad("invalid_number", `${F.n}: خارج المدى ${F.min}–${F.maxv} / out of range`);
      return { v };
    }
    case "d": { const v = String(s == null ? "" : s).trim(); if (!v) return { v: "" }; return dateOk(v) ? { v } : bad("invalid_date", `${F.n}: التاريخ بالشكل YYYY-MM-DD / date as YYYY-MM-DD`); }
    case "gov": { const v = String(s == null ? "" : s).trim().toUpperCase(); if (!v) return { v: F.nul === null ? null : "" }; return GOVS.includes(v) ? { v } : bad("invalid_gov", `${F.n}: كود محافظة غير معروف / unknown governorate code`); }
    case "govs": { const a = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,،]+/); const v = [...new Set(a.map(x => String(x).trim().toUpperCase()).filter(Boolean))]; if (v.length > (F.items || 27) || v.some(x => !GOVS.includes(x))) return bad("invalid_gov"); return { v }; }
    case "url": { const v = httpsUrl(raw); return v === null ? bad("invalid_url", `${F.n}: لازم رابط https كامل / must be a full https URL`) : { v }; }
    case "legacyurl": { const v = String(s == null ? "" : s).trim(); if (!v) return { v: "" }; return v.length <= 500 && /^https?:\/\/[^\s"'<>`\\]+$/i.test(v) ? { v } : bad("invalid_url"); }
    case "link": { const v = linkOk(raw); return v === null ? bad("invalid_url", `${F.n}: رابط على الموقع (/…) أو https / a site path (/…) or an https URL`) : { v }; }
    case "img": { const v = imgPath(raw); if (v === null) return bad("invalid_url", `${F.n}: ارفع الصورة من مكتبة الصور / upload the image to the media library`); if (!v) return { v: "" }; return mediaRef(env, v, F, o); }
    case "imgs": {
      const a = Array.isArray(raw) ? raw : []; if (!Array.isArray(raw) || a.length > (F.items || 10)) return bad("invalid_list");
      const out = []; for (const x of a) { const v = imgPath(x); if (!v) return bad("invalid_url"); const r = await mediaRef(env, v, F, o); if (r.err) return r; out.push(v); } return { v: out };
    }
    case "list": {
      const a = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\n|[,،]\s*/) : null; if (!a) return bad("invalid_list");
      const v = a.map(x => neutral1(typeof x === "string" || typeof x === "number" ? x : "")).filter(Boolean);
      if (v.length > F.items) return bad("invalid_list", `${F.n}: الحد الأقصى ${F.items} عنصر / at most ${F.items} items`);
      for (const x of v) { const e = textCheck(x, F, contactsOn, allow); if (e) return e; }
      return { v };
    }
    case "yt": { const id = ytId(raw); if (id === null) return bad("invalid_youtube", "رابط يوتيوب غير صحيح / not a YouTube video URL"); return { v: id ? ytUrl(id) : "" }; }
    case "upd": {
      if (!Array.isArray(raw) || raw.length > F.items) return bad("invalid_list");
      const v = []; for (const u of raw) { const d = String((Array.isArray(u) ? u[0] : u && u.date) || "").trim(), x = neutralM(Array.isArray(u) ? u[1] : u && u.text); if ((d && !dateOk(d)) || !x || clen(x) > F.max) return bad("invalid_list", "updates: [[YYYY-MM-DD, text ≤ 500]]"); v.push([d, x]); }
      return { v };
    }
    case "pages": { const a = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/); const v = [...new Set(a.map(x => String(x).trim().toLowerCase()).filter(Boolean))]; if (v.length > F.items || v.some(x => !PAGE_RX.test(x))) return bad("invalid_value", "pages: page keys (home, market …)"); return { v }; }
    case "social": {
      const o2 = obj(raw), v = {};
      for (const [k, x] of Object.entries(o2)) { if (!SOCIAL_KEYS.includes(k)) return bad("invalid_value", "social: " + SOCIAL_KEYS.join(", ")); const u = httpsUrl(x); if (u === null) return bad("invalid_url"); if (u) v[k] = u; }
      return { v };
    }
  }
  return bad("invalid_value");
}
/* → {out, errors, warnings}; out[k] = null means "clear" (base: back to the build value; add: the default) */
async function validateFields(env, coll, input, o) {
  const C = COLLS[coll], out = {}, errors = [], warnings = [], src = o.source || "admin";
  const contactsOn = !!C.contacts || src === "member", allow = allowList(env), derived = new Set(C.derived || []);
  if (input != null && (typeof input !== "object" || Array.isArray(input))) return { out, errors: [{ field: "fields", code: "invalid_value", msg: "fields must be an object" }], warnings };
  for (const [k, raw] of Object.entries(obj(input))) {
    const F = fieldOf(coll, k);
    if (!F) { if (!derived.has(k)) errors.push({ field: k, code: "unknown_field", msg: `${k}: حقل غير معروف في ${coll} / unknown field` }); continue; }
    if (F.addOnly && !o.add) { errors.push({ field: k, code: "readonly", msg: `${k}: مايتغيرش بعد الإضافة / cannot be changed` }); continue; }
    if (F.perm && o.adm && !o.adm.can(F.perm)) fail(403, "forbidden", `${k}: محتاج صلاحية ${F.perm}`, { need: F.perm, field: k });
    if (raw === null) { out[k] = null; continue; }
    const r = await normValue(env, coll, F, raw, o, contactsOn, allow);
    if (r.err) {
      // the import keeps an old image URL aside (admin-only) instead of failing the row; the image is re-uploaded before publishing
      if (src === "import" && F.t === "img" && fieldOf(coll, "legacy_img")) { const lv = await normValue(env, coll, LEGACY_IMG, raw, o, false, allow); if (!lv.err && lv.v) out.legacy_img = lv.v; warnings.push({ field: k, code: "image_needs_reupload", msg: "الصورة القديمة محفوظة للإدارة — لازم ترفعها تاني قبل النشر / re-upload the image before publishing" }); continue; }
      errors.push({ field: k, code: r.err, msg: r.msg }); continue;
    }
    out[k] = r.v;
  }
  return { out, errors, warnings };
}
const PRIV_COMMON = ["note"];
async function validatePrivate(env, coll, input) {
  const out = {}, errors = [], allowed = new Set([...(COLLS[coll].priv || []), ...PRIV_COMMON, ...(coll === "fac" || coll === "facx" ? ["ref"] : [])]);
  for (const [k, raw] of Object.entries(obj(input))) {
    if (!allowed.has(k)) { errors.push({ field: "private." + k, code: "unknown_field", msg: `private.${k}: حقل غير معروف / unknown field` }); continue; }
    if (raw === null || raw === "") { out[k] = null; continue; }
    const s = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
    let v = neutral1(s), ok = true;
    if (k === "email") { v = line(s, 254).toLowerCase(); ok = isEmail(v); }
    else if (k === "phone") ok = /^[+\d][\d\s\-().]{3,30}$/.test(v);
    else if (k === "status") ok = ["active", "closed"].includes(v);
    else if (k === "inquiry_ref") ok = /^[A-Za-z0-9-]{3,40}$/.test(v);
    else if (k === "member_id") ok = /^[A-Za-z0-9_-]{1,40}$/.test(v);
    else if (k === "source_url") { v = httpsUrl(s) || ""; ok = !!v; }
    else if (k === "ref") ok = new RegExp(`^(?:\\d{1,6}|x\\d{1,6}|c-${RID_RX}{8})$`).test(v);
    else ok = clen(v) <= (k === "note" ? 1000 : 200);
    if (!ok) errors.push({ field: "private." + k, code: "invalid_value", msg: `private.${k}: قيمة غير صحيحة / invalid value` }); else out[k] = v;
  }
  return { out, errors };
}
/* the static SEO page path of an item: decoded, NFC, trailing slash for directory-style paths */
export function normSeoPath(p) {
  let s = String(p == null ? "" : p).trim(); if (!s) return "";
  if (/^https?:\/\//i.test(s)) { try { const u = new URL(s); if (!/(^|\.)madeinegyptgate\.com$/i.test(u.hostname)) return null; s = u.pathname; } catch (e) { return null; } }
  try { s = decodeURIComponent(s); } catch (e) { return null; }
  s = s.normalize("NFC");
  if (!s.startsWith("/") || s.startsWith("//") || /[?#\s"'<>`\\]/.test(s) || clen(s) > 512 || /^\/(api|_seo)(\/|$)/i.test(s)) return null;
  if (!s.endsWith("/") && !/\.[A-Za-z0-9]{1,8}$/.test(s.slice(s.lastIndexOf("/") + 1))) s += "/";
  return s;
}
/* collection key of a base row (§4.4) — fac / prod: the decoded NFC pathname of the legacy URL */
function normBaseKey(coll, k) {
  let s = String(k == null ? "" : k).trim(); if (!s || s.length > 600 || /[\u0000-\u001f]/.test(s)) return null;
  if (coll === "fac" || coll === "prod") { if (/^https?:\/\//i.test(s)) { try { s = new URL(s).pathname; } catch (e) { return null; } } try { s = decodeURIComponent(s); } catch (e) { /* keep */ } s = s.normalize("NFC"); return s.startsWith("/") ? s : null; }
  if (coll === "cats") { s = s.toLowerCase(); return SLUG_RX.test(s) || BASE_CATS.includes(s) ? s : null; }
  if (coll === "banner") return imgPath(s) || null;
  if (coll === "notice") return null; // notices have no base rows
  return s.normalize("NFC");
}

/* ============================================ records (adds) and derived fields ============================================ */
const SITE_URL = "https://www.madeinegyptgate.com/";
export function slugAr(s) {
  let x = String(s == null ? "" : s).normalize("NFC").toLowerCase().replace(/[ً-ٰٟـ]/g, "");
  x = x.replace(/[^a-z0-9ؠ-ي٠-٩ٱ-ۓ۰-۹]+/g, "-").replace(/^-+|-+$/g, "");
  x = Array.from(x).slice(0, 60).join("").replace(/-+$/g, "");
  return x || "item";
}
function defVal(F) {
  if (F.def !== undefined) return F.def;
  switch (F.t) {
    case "b": return false; case "b01": return 0;
    case "n": case "i": return F.nul !== undefined ? F.nul : null;
    case "gov": return F.nul === null ? null : "";
    case "list": case "govs": case "imgs": case "upd": case "pages": return [];
    case "social": return {};
    default: return "";
  }
}
const isEmpty = v => v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
function defaultsOf(coll) { const r = {}; for (const F of COLLS[coll].fields) if (!F.priv) r[F.n] = defVal(F); return r; }
const round1 = x => Math.round(x * 10) / 10;
/* compatibility / derived keys of object collections (offers, news, events) — for adds and for edits that touch the source keys */
function deriveObj(coll, rec, isAdd) {
  if (coll === "offer") {
    const p = rec.price_egp, o = rec.old_price_egp;
    if (own(rec, "price_egp")) { rec.price_sar = p; rec.price_aed = p; }
    if (own(rec, "old_price_egp")) { rec.old_price_sar = o; rec.old_price_aed = o; }
    if (own(rec, "price_egp") && own(rec, "old_price_egp")) rec.discount_pct = typeof o === "number" && typeof p === "number" && o > p ? round1(((o - p) / o) * 100) : null;
    if (own(rec, "made_in_egypt")) { rec.saudi_made = !!rec.made_in_egypt; rec.made_in_uae = !!rec.made_in_egypt; }
    if (own(rec, "image")) { rec.img = rec.image; rec.image_file = rec.image; }
    if (isAdd && !own(rec, "note")) rec.note = null;
  } else if (coll === "news") { if (own(rec, "image")) { rec.image_file = rec.image; rec.image_url = ""; } }
  else if (coll === "event") { if (own(rec, "image")) rec.image_file = rec.image; }
  else if (coll === "award" && isAdd) { rec.value_sar_million = null; rec.value_aed_million = null; }
  return rec;
}
async function counter(env, k) {
  const r = await env.DB.prepare("INSERT INTO cc_counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(k).first();
  if (!r || !Number.isFinite(+r.n)) fail(503, "store_off", "counter unavailable");
  return +r.n;
}
const LEGACY_ID_RX = /^L[A-Za-z0-9_-]{1,40}$/;
const ID_FORMAT = { fac: new RegExp(`^c-${RID_RX}{8}$`), prod: new RegExp(`^p-${RID_RX}{8}$`), offer: new RegExp(`^cc-of-${RID_RX}{8}$`), zone: new RegExp(`^cc-zone-${RID_RX}{8}$`),
  news: new RegExp(`^n-${RID_RX}{8}$`), event: new RegExp(`^cc-ev-${RID_RX}{8}$`), award: new RegExp(`^a-${RID_RX}{8}$`), banner: new RegExp(`^b-${RID_RX}{8}$`), notice: new RegExp(`^nt-${RID_RX}{8}$`),
  tend: /^TEN-\d{4}-C\d{3,}$/, rfq: /^C\d{4,}$/, opp: /^cc-tnd-\d{6,}$/, proj: /^cc-p\d+$/, video: /^[A-Za-z0-9_-]{11}$/, cats: /^cat-[a-z][a-z0-9_]{1,19}$/ };
/* cc_content.id of a collection id (import ids "L…" are prefixed with the collection: legacy id spaces overlap) */
const rowIdOf = (coll, cid) => (LEGACY_ID_RX.test(cid) ? coll + ":" + cid : cid);
/* the collection id the caller gave (approvals: the member product id; the import: a stable legacy id, mapped deterministically so a
   re-run lands on the same row; videos: the YouTube id of the URL; categories: "cat-<key>") → id | "" (none given) */
async function givenCollId(coll, o) {
  const fl = obj(o.fields);
  if (coll === "video") { const id = ytId(fl.url); return id || ""; }
  if (coll === "cats") { const k = String(fl.key || "").trim().toLowerCase(); return SLUG_RX.test(k) ? "cat-" + k : ""; }
  const given = o.id != null ? String(o.id).trim() : (coll === "tend" && o.source === "import" && LEGACY_ID_RX.test(String(fl.ref || ""))) ? String(fl.ref) : (coll === "rfq" && o.source === "import" && LEGACY_ID_RX.test(String(fl.no || ""))) ? String(fl.no) : "";
  if (!given) return "";
  if (ID_FORMAT[coll] && ID_FORMAT[coll].test(given)) return given;
  if (o.source === "import") {
    if (LEGACY_ID_RX.test(given) && ["tend", "rfq", "proj"].includes(coll)) return given; // contract §1.5: tender ref / rfq no / project id "L<legacy id>"
    if (COLLS[coll].idp) return COLLS[coll].idp + await ridOf("import|" + coll + "|" + given, 8);
    if (coll === "opp") { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode("import|opp|" + given))); return "cc-tnd-9" + String(((h[0] << 16) | (h[1] << 8) | h[2]) % 10000000).padStart(7, "0"); } // 9xxxxxxx: never reached by the 700001+ counter
  }
  fail(400, "invalid_id", `id غير صحيح لـ ${coll} / invalid id for ${coll}`);
}
/* the collection id of a new add: the given one, else generated (rid / counters) */
async function newCollId(env, coll, rec, o) {
  if (coll === "video") { const id = ytId(rec.url); if (!id) fail(422, "invalid_youtube", "رابط يوتيوب غير صحيح / not a YouTube video URL", { errors: [{ field: "url", code: "invalid_youtube", msg: "YouTube URL required" }] }); return id; }
  if (coll === "cats") { if (!SLUG_RX.test(rec.key || "")) fail(422, "required", "key مطلوب / key required", { errors: [{ field: "key", code: "required", msg: "key required" }] }); if (BASE_CATS.includes(rec.key)) fail(409, "exists", "التصنيف ده موجود — عدّله بدل ما تضيفه / this category exists: edit it", { base_key: rec.key }); return "cat-" + rec.key; }
  const given = await givenCollId(coll, o);
  if (given) return given;
  const yyyy = cairoDay().slice(0, 4);
  switch (coll) {
    case "tend": return `TEN-${yyyy}-C${String(await counter(env, "tend:" + yyyy)).padStart(3, "0")}`;
    case "rfq": return "C" + (1000 + await counter(env, "rfq"));
    case "opp": return "cc-tnd-" + (700000 + await counter(env, "opp"));
    case "proj": return "cc-p" + await counter(env, "proj");
    default: return COLLS[coll].idp + rid(8);
  }
}
function finishAdd(coll, rec, cid, neverPublished) {
  rec.id = cid;
  if (coll === "tend") rec.ref = cid;
  if (coll === "rfq") { rec.no = cid; rec.url = ""; }
  if ((coll === "fac" || coll === "prod") && (neverPublished || !rec.url)) rec.url = SITE_URL + (coll === "fac" ? "factories/" : "industrial_products/") + slugAr(rec.name) + "-" + cid.replace(/^[a-z]-/, "") + "/";
  if (coll === "video") { rec.url = ytUrl(cid); rec.source_url = ytUrl(cid); rec.thumb = `https://i.ytimg.com/vi/${cid}/hqdefault.jpg`; if (!own(rec, "verified_oembed")) rec.verified_oembed = false; if (!own(rec, "title_original")) rec.title_original = ""; }
  return deriveObj(coll, rec, true);
}
/* YouTube oEmbed (read-only GET): fills title_original / channel; verified_oembed only when it answered 200 */
async function oembed(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl(id))}&format=json`, { headers: { Accept: "application/json" }, signal: timeoutSignal(NET_TIMEOUT) });
    if (r.status !== 200) return { ok: false };
    const j = await r.json();
    return { ok: true, title: neutral1(j && j.title).slice(0, 300), channel: neutral1(j && j.author_name).slice(0, 120) };
  } catch (e) { return { ok: false }; }
}
const timeoutSignal = ms => (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined);

/* ============================================ cc_content rows ============================================ */
const jl = (s, d) => (s ? jparse(s, d) : d);
function rowOut(r, adm) {
  if (!r) return null;
  const out = { id: r.id, coll: r.coll, kind: r.kind, base_key: r.base_key, state: r.state, draft: jl(r.draft_json, {}), live: r.live_json ? jl(r.live_json, null) : null,
    hidden: !!r.hidden, live_hidden: !!r.live_hidden, deleted: !!r.deleted, seo_path: r.seo_path, static_impact: !!r.static_impact, source: r.source, member_id: r.member_id, rev: r.rev,
    published_v: r.published_v, created_by: r.created_by, created_at: r.created_at, updated_by: r.updated_by, updated_at: r.updated_at, published_by: r.published_by, published_at: r.published_at };
  if (!adm || adm.can("legacy.contacts") || adm.can("orders.read")) out.private = jl(r.private_json, {});
  return out;
}
const getRow = (env, coll, id) => env.DB.prepare("SELECT * FROM cc_content WHERE id = ? AND coll = ?").bind(id, coll).first();
const getBaseRow = (env, coll, key) => env.DB.prepare("SELECT * FROM cc_content WHERE coll = ? AND kind = 'base' AND base_key = ?").bind(coll, key).first();
function diff(a, b) {
  const before = {}, after = {}; a = obj(a); b = obj(b);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (stable(a[k]) !== stable(b[k])) { before[k] = a[k] === undefined ? null : a[k]; after[k] = b[k] === undefined ? null : b[k]; }
  return { before, after };
}
const titleOf = (coll, rec) => { rec = obj(rec); return String(rec.name || rec.title || rec.title_ar || rec.name_ar || rec.product_ar || rec.text_ar || rec.ar || rec.key || "").slice(0, 160); };
const audited = async (adm, action, id, before, after, summary, type = "content") => {
  if (!adm || typeof adm.audit !== "function") return;
  try { await adm.audit(action, type, String(id), before, after, summary); }
  catch (e) { fail(500, "audit_failed", "التعديل ماتحفظش: سجل العمليات مش متاح / not saved: the audit log is unavailable"); }
};
/* the core save (HTTP create / patch and the exported upsert):
   o = {coll, mode: "create"|"patch"|"upsert", base_key?, id?, fields, private?, seo_path?, status? (rfq), by, source, member_id, adm,
        allowPendingMedia, memberId (media owner check), company_name, action} → {row, warnings} */
async function saveContent(env, o) {
  const coll = o.coll, C = COLLS[coll];
  if (!C) fail(404, "unknown_collection", "مجموعة غير معروفة / unknown collection");
  if (!env.DB) fail(503, "store_off", "store not configured");
  let row = null, kind = o.kind || (o.base_key != null && o.base_key !== "" ? "base" : "add"), baseKey = "";
  if (o.mode === "patch") {
    row = await getRow(env, coll, o.id); if (!row) fail(404, "not_found", "مش موجود / not found");
    kind = row.kind; if (row.deleted && kind === "add") fail(409, "state", "اتحذف — مستني النشر / deleted (waiting for the next publish)");
  } else if (kind === "base") {
    if (C.bases === false) fail(400, "no_base", "المجموعة دي مفيهاش صفوف أصلية / this collection has no base rows");
    baseKey = normBaseKey(coll, o.base_key); if (!baseKey) fail(422, "invalid_base_key", "مفتاح الصف غير صحيح / invalid base_key", { errors: [{ field: "base_key", code: "invalid_base_key", msg: "invalid base_key" }] });
    row = await getBaseRow(env, coll, baseKey);
    if (row && o.mode === "create") fail(409, "exists", "الصف ده ليه تعديل محفوظ — استخدم التعديل / an edit row exists: use PATCH", { id: row.id });
  } else {
    if (!C.adds) fail(400, "no_adds", "المجموعة دي مفيهاش إضافة — تعديل وإخفاء بس / this collection is edit / hide only");
    if (o.mode === "upsert") { const gid = await givenCollId(coll, o); if (gid) row = await getRow(env, coll, rowIdOf(coll, gid)); }
  }
  const isNewAdd = kind === "add" && !row;
  const v = await validateFields(env, coll, o.fields, { add: isNewAdd || (kind === "add" && o.mode === "upsert"), source: o.source, adm: o.adm, allowPending: o.allowPendingMedia, memberId: o.memberId });
  const pv = await validatePrivate(env, coll, o.private);
  let seo = row ? row.seo_path : "";
  if (o.seo_path !== undefined) { const sp = o.seo_path === null ? "" : normSeoPath(o.seo_path); if (sp === null) v.errors.push({ field: "seo_path", code: "invalid_path", msg: "seo_path: مسار صفحة على الموقع / a page path of this site" }); else seo = sp; }
  const errors = [...v.errors, ...pv.errors];
  const old = row ? jl(row.draft_json, {}) : {};
  let draft;
  if (kind === "base") {
    draft = { ...old }; for (const k of C.derived || []) delete draft[k]; // derived keys are recomputed from the named fields left
    for (const [k, x] of Object.entries(v.out)) { if (x === null) delete draft[k]; else draft[k] = x; }
    deriveObj(coll, draft, false);
  }
  else {
    draft = row ? { ...defaultsOf(coll), ...old } : defaultsOf(coll);
    for (const [k, x] of Object.entries(v.out)) draft[k] = x === null ? defVal(fieldOf(coll, k)) : x;
    if (coll === "prod" && !draft.description && o.company_name) draft.description = neutral1("من إنتاج " + o.company_name).slice(0, 600);
  }
  // required fields of a new item (the import may save incomplete drafts: they are checked again at publish)
  if (kind === "add") for (const F of C.fields) if (F.req && isEmpty(draft[F.n]) && (isNewAdd || own(v.out, F.n)) && !(F.memberOptional && o.source === "member")) {
    if (o.source === "import" || (o.lenient || []).includes(F.n)) v.warnings.push({ field: F.n, code: "required", msg: `${F.n}: مطلوب قبل النشر / required before publishing` });
    else errors.push({ field: F.n, code: "required", msg: `${F.n}: مطلوب / required` });
  }
  if (kind === "base") for (const F of C.fields) if (F.req && own(v.out, F.n) && isEmpty(draft[F.n]) && v.out[F.n] !== null) errors.push({ field: F.n, code: "required", msg: `${F.n}: مطلوب / required` });
  if (kind === "base" && coll === "banner" && Object.keys(v.out).length) errors.push({ field: "fields", code: "readonly", msg: "البانرات الأصلية بتتخفي بس — ضيف بانر جديد بدلها / built-in banners can only be hidden: add a new banner" });
  if (kind === "add" && C.src && isEmpty(draft[C.src]) && !v.warnings.some(w => w.field === C.src)) v.warnings.push({ field: C.src, code: "source_required", msg: "المصدر مطلوب للنشر — من غير مصدر الإعلان بيفضل مسودة / a source URL is required to publish" });
  if (errors.length) fail(422, errors[0].code, errors[0].msg, { errors, warnings: v.warnings });
  // ids and derived fields of adds
  let id = row ? row.id : "", cid = "";
  if (kind === "add") {
    cid = row ? String(old.id || (coll === "cats" ? old.key : "") || row.id) : await newCollId(env, coll, draft, o);
    if (!row) { id = rowIdOf(coll, cid); if (await env.DB.prepare("SELECT 1 AS x FROM cc_content WHERE id = ?").bind(id).first("x")) fail(409, "exists", "موجود بالفعل / already exists", { id }); }
    finishAdd(coll, draft, cid, !row || !row.live_json);
    if (coll === "video" && (isNewAdd || own(v.out, "url") || !draft.verified_oembed)) {
      const oe = await oembed(cid);
      draft.verified_oembed = oe.ok;
      if (oe.ok) { draft.title_original = oe.title; if (!draft.channel) draft.channel = oe.channel; }
      else v.warnings.push({ field: "url", code: "oembed_required", msg: "يوتيوب ماأكدش الفيديو — مش هينفع يتنشر / YouTube did not confirm this video: it cannot be published" });
    }
  } else id = row ? row.id : "e-" + rid(8);
  if (kind === "add" && o.mode !== "create" && row && own(v.out, "url") && coll === "video" && ytId(v.out.url) !== cid) fail(422, "readonly", "url: الفيديو مايتغيرش — ضيف فيديو جديد / the video itself cannot change: add a new one", { errors: [{ field: "url", code: "readonly", msg: "readonly" }] });
  const priv = { ...jl(row && row.private_json, {}) }; for (const [k, x] of Object.entries(pv.out)) { if (x === null) delete priv[k]; else priv[k] = x; }
  let hidden = row ? row.hidden : 0;
  if (o.status !== undefined && coll === "rfq") { if (!["active", "closed"].includes(o.status)) fail(422, "invalid_enum", "status: active | closed"); priv.status = o.status; hidden = o.status === "closed" ? 1 : 0; }
  if (o.hidden !== undefined) hidden = o.hidden ? 1 : 0;
  const t = now(), by = o.by || "system", dj = stable(draft), pj = stable(priv);
  const live = row ? row.live_json : "", deleted = row ? (o.undelete && row.kind === "base" ? 0 : row.deleted) : 0;
  const state = live && dj === live && hidden === (row ? row.live_hidden : 0) && !deleted ? "published" : "draft";
  const ch = diff(old, draft);
  if (row && (row.hidden !== hidden)) { ch.before.hidden = !!row.hidden; ch.after.hidden = !!hidden; }
  if (row && row.deleted !== deleted) { ch.before.deleted = !!row.deleted; ch.after.deleted = !!deleted; }
  if (row && seo !== row.seo_path) { ch.before.seo_path = row.seo_path; ch.after.seo_path = seo; }
  const summary = `${coll} ${kind}: ${titleOf(coll, draft) || baseKey || id}`;
  if (typeof o.preCommit === "function") await o.preCommit(id, ch.before, ch.after, summary);
  else if (o.audit !== false) await audited(o.adm, o.action || (row ? "content.edit" : "content.create"), id, ch.before, ch.after, summary);
  const si = STATIC_COLLS.has(coll) ? 1 : 0;
  if (!row) {
    await env.DB.prepare(`INSERT INTO cc_content (id, coll, kind, base_key, state, draft_json, live_json, hidden, live_hidden, deleted, private_json, seo_path, static_impact, source, member_id, rev, published_v, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, '', ?, 0, 0, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`).bind(id, coll, kind, kind === "base" ? baseKey : "", dj, hidden, pj, seo, si, o.source || "admin", o.member_id || "", by, t, by, t).run();
  } else {
    await env.DB.prepare("UPDATE cc_content SET draft_json = ?, private_json = ?, hidden = ?, deleted = ?, seo_path = ?, state = ?, static_impact = ?, member_id = CASE WHEN ? != '' THEN ? ELSE member_id END, rev = rev + 1, updated_by = ?, updated_at = ? WHERE id = ?")
      .bind(dj, pj, hidden, deleted, seo, state, si, o.member_id || "", o.member_id || "", by, t, id).run();
  }
  return { row: await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(id).first(), warnings: v.warnings };
}

/* ============================================ locks (cc_locks) ============================================ */
async function lockTake(env, k, ms) {
  const owner = rid(10), t = Date.now();
  await env.DB.prepare("INSERT INTO cc_locks (k, until, owner) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET until = excluded.until, owner = excluded.owner WHERE cc_locks.until < ?").bind(k, iso(t + ms), owner, iso(t)).run();
  const r = await env.DB.prepare("SELECT owner FROM cc_locks WHERE k = ?").bind(k).first();
  return r && r.owner === owner ? owner : null;
}
async function lockFree(env, k, owner) { try { await env.DB.prepare("DELETE FROM cc_locks WHERE k = ? AND owner = ?").bind(k, owner).run(); } catch (e) { /* expires by itself */ } }
/* D1 allows ≤ 100 bound parameters per statement: IN (…) lists are chunked */
async function selectIn(env, sql, ids, extra = []) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) { const part = ids.slice(i, i + 80); out.push(...(((await env.DB.prepare(sql.replace("(?)", "(" + part.map(() => "?").join(",") + ")")).bind(...part, ...extra).all()).results) || [])); }
  return out;
}
async function batchAll(env, stmts) { for (let i = 0; i < stmts.length; i += 400) await env.DB.batch(stmts.slice(i, i + 400)); }

/* ============================================ compile (§4.2) ============================================ */
const pubRec = (coll, rec) => { const o = {}; for (const [k, v] of Object.entries(obj(rec))) { const F = fieldOf(coll, k); if (!(F && F.priv)) o[k] = v; } return o; };
/* every string VALUE neutralised once more (defence in depth); keys stay as they are: base keys must equal the build data byte for byte
   (they are lookup keys only — the applier never renders them) */
function neutralValues(v, d = 0) {
  if (d > 16) return null;
  if (typeof v === "string") return neutral(v);
  if (Array.isArray(v)) return v.map(x => neutralValues(x, d + 1));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = neutralValues(x, d + 1); return o; }
  return typeof v === "number" && !Number.isFinite(v) ? null : v;
}
function trPairs(coll, rec, tr) {
  for (const F of COLLS[coll].fields) {
    if (!F.en) continue;
    const a = rec[F.n], b = rec[F.en];
    if (typeof a === "string" && typeof b === "string" && a && b) tr[a] = b;
    else if (Array.isArray(a) && Array.isArray(b)) a.forEach((x, i) => { if (typeof x === "string" && typeof b[i] === "string" && x && b[i]) tr[x] = b[i]; });
  }
}
const SETTING_URL = /^(social_[a-z]+|operator_url)$/, SETTING_MAIL = /^(contact_email|support_email|billing_email)$/;
async function settingsBlock(env) {
  try {
    const { results } = await env.DB.prepare("SELECT k, v FROM cc_settings WHERE scope = 'public' ORDER BY k").all();
    const out = {}; let cats = null;
    for (const r of results || []) {
      const k = String(r.k), v = String(r.v == null ? "" : r.v);
      if (!/^[a-z][a-z0-9_.]{0,63}$/.test(k)) continue;
      if (k === "cats") { cats = jparse(v, null); continue; }
      if (SETTING_URL.test(k)) { if (v === "" || v === "-" || httpsUrl(v)) out[k] = v; continue; }
      if (SETTING_MAIL.test(k)) { if (v === "" || isEmail(v)) out[k] = v.toLowerCase(); continue; }
      out[k] = neutralM(v).slice(0, 2000);
    }
    return { settings: out, cats };
  } catch (e) { return { settings: null, cats: null }; }
}
async function plansBlock(env, vatRaw) {
  try {
    const { results } = await env.DB.prepare("SELECT plan, sort, name_ar, name_en, price_egp, duration_days, sellable, caps_json FROM cc_plans ORDER BY sort").all();
    if (!results || !results.length) return null;
    const list = {};
    for (const r of results) {
      const caps = {}; for (const [k, x] of Object.entries(obj(jparse(r.caps_json, {})))) if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && typeof x === "number" && Number.isFinite(x)) caps[k] = x;
      list[r.plan] = { name_ar: neutral1(r.name_ar), name_en: neutral1(r.name_en), price_egp: int(r.price_egp, 0), duration_days: int(r.duration_days, 365), sellable: r.sellable ? 1 : 0, sort: int(r.sort, 0), caps };
    }
    const vat = int(vatRaw, 1400);
    return { vat_bp: vat >= 0 && vat <= 5000 ? vat : 1400, currency: "EGP", list };
  } catch (e) { return null; }
}
async function payBlock(env, CC, prev) {
  if (CC && CC.payments && typeof CC.payments.payReady === "function") {
    try { const p = await CC.payments.payReady(env); return { ready: !!(p && p.ready), manual: !!(p && p.manual) }; } catch (e) { /* keep the previous state */ }
  }
  return prev && typeof prev === "object" ? { ready: !!prev.ready, manual: !!prev.manual } : { ready: false, manual: false };
}
const dataOfJs = js => { const m = /^window\.MIGOVL_DATA=(\{[\s\S]*\});\n/.exec(String(js || "")); return m ? jparse(m[1], null) : null; };
/* rows = every cc_content row in its NEW live state → {data, js, bytes, sha, counts} */
async function compileOverlay(env, rows, v, CC, prevData) {
  const at = iso(v), c = {}, tr = {}, hp = new Set(), counts = {};
  const by = {}; for (const r of rows) (by[r.coll] = by[r.coll] || []).push(r);
  const order = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
  const liveOf = r => (r.live_json ? jl(r.live_json, {}) : null);
  for (const coll of CONTENT_COLLS) {
    const e = {}, h = [], a = [];
    for (const r of (by[coll] || []).slice().sort(order)) {
      const live = liveOf(r), hiddenLive = !!(r.deleted || (r.live_json && r.live_hidden));
      if (r.kind === "base") {
        if (hiddenLive && (r.live_json || r.deleted)) { h.push(r.base_key); if (r.seo_path) hp.add(r.seo_path); }
        else if (live && Object.keys(live).length) { const rec = pubRec(coll, live); e[r.base_key] = rec; trPairs(coll, rec, tr); }
      } else {
        if (!live || hiddenLive) { if (live && r.seo_path) hp.add(r.seo_path); continue; }
        if (coll === "video" && live.verified_oembed !== true) continue;
        const rec = pubRec(coll, live); a.push(rec); trPairs(coll, rec, tr);
      }
    }
    h.sort();
    counts[coll] = { e: Object.keys(e).length, h: h.length, a: a.length };
    if (counts[coll].e || counts[coll].h || counts[coll].a) c[coll] = { e, h, a };
  }
  const banners = [], banner_hide = [], notices = [], cats = {};
  for (const r of (by.banner || []).slice().sort(order)) {
    const live = liveOf(r), hiddenLive = !!(r.deleted || (r.live_json && r.live_hidden));
    if (r.kind === "base") { if (hiddenLive && (r.live_json || r.deleted)) banner_hide.push(r.base_key); continue; }
    if (live && !hiddenLive && live.img) banners.push(pubRec("banner", live));
  }
  banners.sort((x, y) => (x.sort || 0) - (y.sort || 0) || String(x.id).localeCompare(String(y.id)));
  banner_hide.sort();
  for (const r of (by.notice || []).slice().sort(order)) { const live = liveOf(r); if (live && !(r.deleted || r.live_hidden)) notices.push(pubRec("notice", live)); }
  const sb = await settingsBlock(env);
  for (const [k, x] of Object.entries(obj(sb.cats))) if (SLUG_RX.test(k) || BASE_CATS.includes(k)) { const o = obj(x), y = {}; for (const q of ["ar", "en", "icon"]) if (typeof o[q] === "string") y[q] = neutral1(o[q]).slice(0, 60); if (o.hidden) y.hidden = 1; cats[k] = y; }
  for (const r of (by.cats || []).slice().sort(order)) {
    const live = liveOf(r), hiddenLive = !!(r.deleted || (r.live_json && r.live_hidden));
    if (r.kind === "base") { if (!live && !r.deleted) continue; const y = { ...(cats[r.base_key] || {}), ...pubRec("cats", live || {}) }; delete y.key; if (hiddenLive) y.hidden = 1; else delete y.hidden; cats[r.base_key] = y; }
    else if (live && live.key && !hiddenLive) cats[live.key] = { ar: live.ar || "", en: live.en || "", icon: live.icon || "", hidden: 0 };
  }
  const plans = await plansBlock(env, sb.settings ? sb.settings.vat_bp : undefined);
  const data = { v, at, c, tr, hp: [...hp].sort(), cats, banners, banner_hide, notices, pay: await payBlock(env, CC, prevData && prevData.pay) };
  if (plans) data.plans = plans;
  if (sb.settings) data.settings = sb.settings;
  const safe = neutralValues(data);
  const js = "window.MIGOVL_DATA=" + scriptJson(safe) + ";\n/* Made in Egypt Gate — published admin edits v=" + v + " (" + at + "). Applied by data/mig-overlay.js; do not edit. */\n";
  return { data: safe, js, bytes: utf8len(js), sha: await hex2(js), counts };
}

/* ============================================ publish (§4.3) ============================================ */
const MEDIA_FIELDS = new Set(["img", "imgs"]);
/* what keeps a row from being published → [{field, code, msg}] */
async function publishProblems(env, r) {
  if (r.deleted) return [];
  const C = COLLS[r.coll], rec = jl(r.draft_json, {}), out = [];
  if (!C) return [{ field: "coll", code: "unknown_collection", msg: "unknown collection" }];
  if (r.kind === "add") {
    for (const F of C.fields) if ((F.req || F.req_pub) && isEmpty(rec[F.n]) && !(F.memberOptional && r.source === "member")) out.push({ field: F.n, code: "required", msg: `${F.n}: مطلوب قبل النشر / required before publishing` });
    if (C.src && isEmpty(rec[C.src])) out.push({ field: C.src, code: "source_required", msg: "المصدر مطلوب للنشر — من غير مصدر الإعلان بيفضل مسودة / a source URL is required to publish" });
    if (r.coll === "video" && rec.verified_oembed !== true) out.push({ field: "url", code: "oembed_required", msg: "يوتيوب ماأكدش الفيديو (oEmbed) — مايتنشرش / only videos confirmed by YouTube oEmbed can be published" });
  } else {
    if (C.src && own(rec, C.src) && isEmpty(rec[C.src])) out.push({ field: C.src, code: "source_required", msg: "المصدر مطلوب للنشر / a source URL is required to publish" });
    for (const F of C.fields) if (F.req && own(rec, F.n) && isEmpty(rec[F.n])) out.push({ field: F.n, code: "required", msg: `${F.n}: مطلوب / required` });
  }
  if (C.src && !isEmpty(rec[C.src]) && !httpsUrl(rec[C.src])) out.push({ field: C.src, code: "invalid_url", msg: "invalid source URL" });
  for (const F of C.fields) if (MEDIA_FIELDS.has(F.t) && !isEmpty(rec[F.n])) for (const p of [].concat(rec[F.n])) {
    const m = MEDIA_RX.exec(String(p)); if (!m) continue;
    let st = null; try { st = await env.DB.prepare("SELECT status FROM cc_media WHERE id = ?").bind(m[2]).first("status"); } catch (e) { st = null; }
    if (st !== "public") out.push({ field: F.n, code: "invalid_image", msg: "الصورة لسه مش معتمدة أو اتمسحت / the image is not public" });
  }
  return out;
}
const OVL_MEMO = new WeakMap(); // env.DB (or env) → {js, v, enabled, etag, at}
const memoKey = env => (env && env.DB) || env || OVL_MEMO;
async function overlayEnabled(env) { try { const v = await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'overlay.enabled'").first("v"); return v == null ? true : String(v) !== "0"; } catch (e) { return true; } }
const etagOf = (v, enabled) => `"ovl-${v}${enabled ? "" : "-off"}"`;
async function kvPutOverlay(env, js, v, at, bytes, enabled) {
  if (!env.SEO_KV || typeof env.SEO_KV.put !== "function") return false;
  try { await env.SEO_KV.put(KV_KEY, enabled ? js : NOOP_JS, { metadata: { v, at, bytes, enabled: enabled ? 1 : 0 } }); return true; } catch (e) { return false; }
}
/* ONE cache key for both hosts (madeinegyptgate.com and www.): the canonical site URL, whatever host the request came on */
const overlayCacheKey = env => new Request(new URL("data/overlay.js", site(env)).toString(), { method: "GET" });
const cacheOf = () => (typeof caches !== "undefined" && caches && caches.default ? caches.default : null);
async function purgeOverlayCache(env) { try { const c = cacheOf(); if (c) await c.delete(overlayCacheKey(env)); } catch (e) { /* best effort, this PoP only */ } }
/* publishOverlay(env, {by, reason, ids?, all?, note?, CC?, audit?: async (summary) => void, strict?}) → {v, at, bytes, published, skipped, edge_ids, kv, warn, counts}
   Copies the selected drafts (+ every pending deletion) to live, compiles ALL live rows + plans + public settings + cats + pay readiness,
   stores the file (D1 cc_overlay, newest 20 · KV acc:overlay + acc:overlay:prev) and plans the edge actions. Nothing is written when
   the file would exceed 512 KiB (413 overlay_too_large) or a selected row cannot be published (422). */
export async function publishOverlay(env, opts = {}) {
  if (!env || !env.DB) fail(503, "store_off", "store not configured");
  const by = String(opts.by || "system").slice(0, 254);
  let owner;
  try { owner = await lockTake(env, LOCK_KEY, LOCK_MS); } catch (e) { if (noTable(e)) fail(503, "store_off", "migration 0006 is not applied"); throw e; }
  // a publish takes well under a second: wait a little for a running one (plans / settings / approvals saves publish too) before 409
  for (let waited = 0, step = 250, max = opts.lockWaitMs == null ? 3000 : +opts.lockWaitMs; !owner && waited < max; waited += step, step = Math.min(step * 2, 1000)) {
    await new Promise(r => setTimeout(r, Math.min(step, max - waited)));
    owner = await lockTake(env, LOCK_KEY, LOCK_MS);
  }
  if (!owner) fail(409, "locked", "في نشر شغال دلوقتي — جرّب تاني بعد 5 ثواني / another publish is running, retry in 5 s", { retry_after_s: 5 });
  try {
    const rows = (await env.DB.prepare("SELECT * FROM cc_content").all()).results || [];
    const ids = new Set((Array.isArray(opts.ids) ? opts.ids : []).map(String));
    for (const id of ids) if (!rows.some(r => r.id === id)) fail(404, "not_found", "مش موجود / not found: " + id, { id });
    const sel = rows.filter(r => r.state !== "published" && (opts.all || ids.has(r.id) || r.deleted));
    const skipped = [], errs = [];
    for (const r of sel) { const p = await publishProblems(env, r); if (p.length) (ids.has(r.id) && opts.strict !== false ? errs : skipped).push({ id: r.id, coll: r.coll, code: p[0].code, field: p[0].field, msg: p[0].msg, errors: p }); }
    if (errs.length) fail(422, errs[0].code, errs[0].msg, { errors: errs });
    const skip = new Set(skipped.map(s => s.id));
    const prev = await env.DB.prepare("SELECT v, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first();
    const v = Math.max(Date.now(), (prev ? +prev.v : 0) + 1), at = iso(v), day = cairoDay(v);
    const pub = new Map(); // id → new row state
    for (const r of sel) {
      if (skip.has(r.id)) continue;
      let dj = r.draft_json;
      if (r.coll === "offer" && !r.deleted) { const d = jl(dj, {}); d.source_checked = day; dj = stable(d); } // offers: source checked = the publish day
      pub.set(r.id, { ...r, draft_json: dj, live_json: dj, live_hidden: r.deleted ? 1 : r.hidden, state: "published", published_v: v, published_by: by, published_at: at });
    }
    const next = rows.map(r => pub.get(r.id) || r);
    // base rows that carry nothing any more (reverted / unhidden without edits) are removed after this publish
    const drop = new Set([...pub.values()].filter(r => r.kind === "base" && !r.live_hidden && !r.deleted && (r.live_json === "{}" || r.live_json === "")).map(r => r.id));
    const comp = await compileOverlay(env, next.filter(r => !drop.has(r.id)), v, opts.CC, dataOfJs(prev && prev.js));
    if (comp.bytes > OVERLAY_LIMIT) fail(413, "overlay_too_large", `ملف التعديلات المنشورة كبير (${comp.bytes} بايت > ${OVERLAY_LIMIT}) — قلّل الإضافات أو النصوص الطويلة / the published file would be too large`, { bytes: comp.bytes, limit: OVERLAY_LIMIT });
    const edge = await planEdge(env, [...pub.values()]);
    if (typeof opts.audit === "function") await opts.audit({ v, bytes: comp.bytes, published: pub.size, ids: [...pub.keys()].slice(0, 200), skipped: skipped.length, reason: opts.reason || "" });
    const stmts = [];
    for (const r of pub.values()) {
      if (drop.has(r.id)) stmts.push(env.DB.prepare("DELETE FROM cc_content WHERE id = ?").bind(r.id));
      else stmts.push(env.DB.prepare("UPDATE cc_content SET draft_json = ?, live_json = ?, live_hidden = ?, state = 'published', published_v = ?, published_by = ?, published_at = ? WHERE id = ?").bind(r.draft_json, r.live_json, r.live_hidden, v, by, at, r.id));
    }
    stmts.push(...edge.stmts);
    stmts.push(env.DB.prepare("INSERT INTO cc_overlay (v, at, by, bytes, sha, counts_json, js, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(v, at, by, comp.bytes, comp.sha, stable(comp.counts), comp.js, String(opts.note || opts.reason || "").slice(0, 300)));
    // the newest KEEP_VERSIONS versions, AND the newest KEEP_VERSIONS published by the team: member-triggered versions ("member:<id>",
    // "system:member" — review F7) can never push the team's versions out of the rollback history
    stmts.push(env.DB.prepare(`DELETE FROM cc_overlay WHERE v NOT IN (SELECT v FROM cc_overlay ORDER BY v DESC LIMIT ${KEEP_VERSIONS}) AND v NOT IN (SELECT v FROM cc_overlay WHERE "by" NOT LIKE 'member:%' AND "by" != 'system:member' ORDER BY v DESC LIMIT ${KEEP_VERSIONS})`));
    await batchAll(env, stmts);
    const enabled = await overlayEnabled(env);
    let kv = false;
    if (env.SEO_KV && typeof env.SEO_KV.put === "function") {
      try { if (prev && prev.js) await env.SEO_KV.put(KV_PREV, prev.js); } catch (e) { /* prev is a convenience copy */ }
      kv = await kvPutOverlay(env, comp.js, v, at, comp.bytes, enabled);
    }
    OVL_MEMO.set(memoKey(env), { js: enabled ? comp.js : NOOP_JS, v, enabled, etag: etagOf(v, enabled), at: Date.now() });
    await purgeOverlayCache(env);
    return { v, at, bytes: comp.bytes, published: pub.size, skipped, edge_ids: edge.contentIds, kv, warn: comp.bytes > OVERLAY_WARN, counts: comp.counts };
  } finally { await lockFree(env, LOCK_KEY, owner); }
}

/* ============================================ edge actions through the existing SEO API (§4.10) ============================================ */
/* the edge state a published row wants: none | noindex | redirect (deleted → 301 to the collection hub; no hub → noindex) */
function edgeWant(r) {
  if (!r.seo_path) return "none";
  if (r.deleted) return COLLS[r.coll] && COLLS[r.coll].hub ? "redirect" : "noindex";
  return r.live_hidden ? "noindex" : "none";
}
function edgeCur(list) { let st = "none", last = null; for (const e of list) if (e.status === "done") { if (e.action === "restore") { st = "none"; last = null; } else { st = e.action; last = e; } } return { st, last }; }
async function planEdge(env, pubRows) {
  const stmts = [], contentIds = [];
  let all;
  try { all = pubRows.length ? await selectIn(env, "SELECT * FROM cc_edge WHERE content_id IN (?) ORDER BY id", pubRows.map(r => r.id)) : []; } catch (e) { if (noTable(e)) return { stmts, contentIds }; throw e; }
  const t = now();
  for (const r of pubRows) {
    const mine = all.filter(e => e.content_id === r.id), cur = edgeCur(mine), want = edgeWant(r);
    if (mine.some(e => e.status === "pending" || e.status === "failed")) stmts.push(env.DB.prepare("UPDATE cc_edge SET status = 'cancelled', updated_at = ? WHERE content_id = ? AND status IN ('pending', 'failed')").bind(t, r.id));
    if (cur.st === want) continue;
    const acts = [];
    if (cur.st !== "none") acts.push({ action: "restore", path: cur.last.path, to: "", before: { ...jl(cur.last.before_json, {}), coll: r.coll, undo: cur.st } });
    if (want !== "none") acts.push({ action: want, path: r.seo_path, to: want === "redirect" ? COLLS[r.coll].hub : "", before: { coll: r.coll } });
    for (const a of acts) stmts.push(env.DB.prepare("INSERT INTO cc_edge (content_id, path, action, to_path, before_json, status, attempts, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, '', ?, ?)").bind(r.id, a.path, a.action, a.to, stable(a.before), t, t));
    if (acts.length) contentIds.push(r.id);
  }
  return { stmts, contentIds };
}
async function seoCall(env, auth, method, path, payload) {
  const r = await fetch(new URL(path, site(env)).toString(), { method, headers: { Authorization: auth, Accept: "application/json", "User-Agent": "MIG-control-center/1", ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined, signal: timeoutSignal(NET_TIMEOUT) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j };
}
const apiErr = (r, what) => `${what}: HTTP ${r.status}${r.j && r.j.code ? " " + r.j.code : ""}`;
async function execEdge(env, auth, e) {
  const b = jl(e.before_json, {}), coll = b.coll || "", calls = { n: 0 };
  const call = async (m, p, payload) => { calls.n++; return seoCall(env, auth, m, p, payload); };
  const q = encodeURIComponent(e.path);
  if (e.action === "noindex") {
    const g = await call("GET", "api/seo/page?path=" + q);
    if (!g.ok) return { ok: false, calls: calls.n, error: apiErr(g, "GET /api/seo/page") };
    const before = { coll, robots: (g.j && g.j.override && g.j.override.robots) || "", note: (g.j && g.j.meta && g.j.meta.note) || "" };
    const p = await call("PATCH", "api/seo/page", { path: e.path, robots: "noindex,follow", note: `مخفي من لوحة الإدارة: ${coll}/${e.content_id}` });
    return p.ok ? { ok: true, calls: calls.n, before } : { ok: false, calls: calls.n, error: apiErr(p, "PATCH /api/seo/page") };
  }
  if (e.action === "redirect") {
    const g = await call("GET", "api/seo/redirects?q=" + q);
    if (!g.ok) return { ok: false, calls: calls.n, error: apiErr(g, "GET /api/seo/redirects") };
    const found = ((g.j && g.j.admin) || []).find(x => x && x.from === e.path) || null;
    const before = { coll, redirect: found ? { to: found.to, code: found.code, note: found.note || "" } : null };
    const p = await call("POST", "api/seo/redirects", { from: e.path, to: e.to_path, code: 301, note: `محذوف من لوحة الإدارة: ${coll}/${e.content_id}` });
    return p.ok ? { ok: true, calls: calls.n, before } : { ok: false, calls: calls.n, error: apiErr(p, "POST /api/seo/redirects") };
  }
  // restore what was there before the hide / delete
  if (b.undo === "noindex") { // a page the next build dropped has nothing left to restore (400 unknown_path)
    const p = await call("PATCH", "api/seo/page", { path: e.path, robots: b.robots || "", note: b.note || "" });
    return p.ok || (p.status === 400 && p.j && p.j.code === "unknown_path") ? { ok: true, calls: calls.n, before: b } : { ok: false, calls: calls.n, error: apiErr(p, "PATCH /api/seo/page") };
  }
  if (b.undo === "redirect") {
    const p = b.redirect && b.redirect.to ? await call("POST", "api/seo/redirects", { from: e.path, to: b.redirect.to, code: +b.redirect.code || 301, note: b.redirect.note || "" }) : await call("DELETE", "api/seo/redirects?from=" + q);
    return p.ok || p.status === 404 ? { ok: true, calls: calls.n, before: b } : { ok: false, calls: calls.n, error: apiErr(p, "restore redirect") };
  }
  return { ok: true, calls: calls.n, before: b };
}
/* runs pending (and, on a retry, failed) edge actions with the caller's own Authorization header, ≤ budget SEO API calls.
   Actions of one item run in order; an item whose action failed waits for the next retry. → {done, failed, pending, items} */
export async function runEdge(env, auth, { contentIds = null, retryFailed = false, budget = EDGE_CALLS } = {}) {
  const out = { done: 0, failed: 0, pending: 0, items: [] };
  let rows;
  try {
    const st = retryFailed ? "('pending', 'failed')" : "('pending')";
    rows = contentIds ? (contentIds.length ? await selectIn(env, `SELECT * FROM cc_edge WHERE content_id IN (?) AND status IN ${st} ORDER BY id`, contentIds) : [])
      : (await env.DB.prepare(`SELECT * FROM cc_edge WHERE status IN ${st} ORDER BY id LIMIT 200`).all()).results || [];
  } catch (e) { if (noTable(e)) return out; throw e; }
  let calls = 0; const blocked = new Set();
  for (const e of rows) {
    const need = e.action === "restore" ? 1 : 2;
    if (blocked.has(e.content_id) || calls + need > budget) { out.pending++; continue; }
    const t = now();
    if (!/^Bearer\s+\S+$/i.test(String(auth || ""))) {
      await env.DB.prepare("UPDATE cc_edge SET error = ?, updated_at = ? WHERE id = ?").bind("محتاج دخول أدمن (Bearer) — أعد المحاولة من «النشر والتحديث» / needs an admin sign-in: retry from the panel", t, e.id).run();
      out.pending++; blocked.add(e.content_id); out.items.push({ path: e.path, action: e.action, status: "pending" }); continue;
    }
    let r; try { r = await execEdge(env, auth, e); } catch (x) { r = { ok: false, calls: need, error: "network: " + String((x && x.message) || x).slice(0, 160) }; }
    calls += r.calls || need;
    if (r.ok) { await env.DB.prepare("UPDATE cc_edge SET status = 'done', attempts = attempts + 1, error = '', before_json = ?, updated_at = ?, done_at = ? WHERE id = ?").bind(stable(r.before || {}), t, t, e.id).run(); out.done++; out.items.push({ path: e.path, action: e.action, status: "done" }); }
    else { await env.DB.prepare("UPDATE cc_edge SET status = 'failed', attempts = attempts + 1, error = ?, updated_at = ? WHERE id = ?").bind(String(r.error || "failed").slice(0, 300), t, e.id).run(); out.failed++; blocked.add(e.content_id); out.items.push({ path: e.path, action: e.action, status: "failed", error: r.error }); }
  }
  return out;
}

/* ============================================ GET /data/overlay.js ============================================ */
async function currentOverlay(env, ctx) {
  const k = memoKey(env), m = OVL_MEMO.get(k);
  if (m && Date.now() - m.at < MEMO_MS) return m;
  let cur = null;
  if (env && env.SEO_KV && typeof env.SEO_KV.getWithMetadata === "function") {
    try { const r = await env.SEO_KV.getWithMetadata(KV_KEY, { type: "text", cacheTtl: 60 }); if (r && typeof r.value === "string" && r.value) { const md = obj(r.metadata), en = md.enabled !== 0 && md.enabled !== "0"; cur = { js: en ? r.value : NOOP_JS, v: +md.v || 0, enabled: en }; } } catch (e) { cur = null; }
  }
  if (!cur && env && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT v, at, bytes, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first();
      if (row && row.js) {
        const en = await overlayEnabled(env);
        cur = { js: en ? row.js : NOOP_JS, v: +row.v, enabled: en };
        if (env.SEO_KV && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(kvPutOverlay(env, row.js, +row.v, row.at, row.bytes, en)); // KV self-heal
      }
    } catch (e) { cur = null; }
  }
  if (!cur) cur = { js: NOOP_JS, v: 0, enabled: true };
  cur.etag = etagOf(cur.v, cur.enabled); cur.at = Date.now();
  OVL_MEMO.set(k, cur);
  return cur;
}
const notModified = (req, etag) => { const h = req.headers.get("If-None-Match") || ""; return !!etag && h.split(",").map(s => s.trim().replace(/^W\//, "")).includes(etag); };
function overlayResponse(cur, head) {
  const h = { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=60, stale-while-revalidate=300", ETag: cur.etag, "X-Content-Type-Options": "nosniff", "X-Overlay-V": String(cur.v) };
  return new Response(head ? null : cur.js, { status: 200, headers: h });
}
export async function serveOverlay(req, env, ctx) {
  env = env || {};
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  let cur = null;
  try {
    // source order: isolate memo (the publishing isolate sees a publish at once) → caches.default (this PoP, ≤ 60 s) → KV → D1 → no-op
    const k = memoKey(env), m = OVL_MEMO.get(k);
    if (m && Date.now() - m.at < MEMO_MS) cur = m;
    const cache = cur ? null : cacheOf(), key = cache ? overlayCacheKey(env) : null;
    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit) { const etag = hit.headers.get("ETag") || "", js = await hit.text(); cur = { js, v: int(hit.headers.get("X-Overlay-V"), 0), enabled: !/-off"$/.test(etag), etag, at: Date.now() }; OVL_MEMO.set(k, cur); }
      } catch (e) { cur = null; /* cache unavailable */ }
    }
    if (!cur) {
      cur = await currentOverlay(env, ctx);
      if (cache && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(key, overlayResponse(cur, false)).catch(() => {}));
    }
  } catch (e) { cur = { js: NOOP_JS, v: 0, enabled: true, etag: etagOf(0, true) }; }
  if (notModified(req, cur.etag)) return new Response(null, { status: 304, headers: { ETag: cur.etag, "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" } });
  return overlayResponse(cur, req.method === "HEAD");
}

/* ============================================ media (§4.11, R2 binding MEDIA) ============================================ */
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => b[i] * 16777216 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 16777216;
function concatU8(parts) { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; }
class BadImage extends Error { constructor(why) { super(why); this.why = why; } }
/* the real type from the first bytes (the declared Content-Type must match it) */
export function sniffImage(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}
const isSOF = m => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/* JPEG: walk the segments; drop APP1 (EXIF / XMP), APP13 (IPTC / Photoshop) and COM; keep the entropy-coded scans; stop at EOI
   (anything appended after the image — a polyglot payload — is dropped) */
function cleanJpeg(b) {
  const parts = [b.subarray(0, 2)]; let i = 2, w = 0, h = 0, sos = false, eoi = false;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new BadImage("corrupt");
    let m = b[i + 1]; while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }
    if (m === undefined) throw new BadImage("corrupt");
    if (m === 0xd9) { parts.push(b.subarray(i, i + 2)); eoi = true; break; }
    if (m === 0xd8) throw new BadImage("corrupt");
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) throw new BadImage("corrupt");
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new BadImage("corrupt");
    if (isSOF(m)) { if (len < 8) throw new BadImage("corrupt"); h = u16be(b, i + 5); w = u16be(b, i + 7); }
    if (!(m === 0xe1 || m === 0xed || m === 0xfe)) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
    if (m === 0xda) {
      sos = true; const s = i;
      while (i < b.length) { if (b[i] === 0xff) { const n = b[i + 1]; if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { i += 2; continue; } if (n === 0xff) { i++; continue; } break; } i++; }
      parts.push(b.subarray(s, i));
    }
  }
  if (!w || !h) throw new BadImage("no_dimensions");
  if (!sos) throw new BadImage("corrupt");
  if (!eoi) parts.push(new Uint8Array([0xff, 0xd9]));
  return { w, h, bytes: concatU8(parts) };
}
const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);
function cleanPng(b) {
  const parts = [b.subarray(0, 8)]; let i = 8, w = 0, h = 0, first = true, end = false;
  while (i + 12 <= b.length) {
    const len = u32be(b, i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (!/^[A-Za-z]{4}$/.test(type) || len > b.length - i - 12) throw new BadImage("corrupt");
    if (first) { if (type !== "IHDR" || len !== 13) throw new BadImage("corrupt"); w = u32be(b, i + 8); h = u32be(b, i + 12); first = false; }
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === "IEND") { end = true; break; }
  }
  if (!w || !h) throw new BadImage("no_dimensions");
  if (!end) throw new BadImage("corrupt");
  return { w, h, bytes: concatU8(parts) };
}
function cleanWebp(b) {
  const size = u32le(b, 4), end = 8 + size;
  if (size < 4 || end > b.length) throw new BadImage("corrupt");
  let i = 12, w = 0, h = 0, vp8x = -1; const chunks = [];
  while (i + 8 <= end) {
    const cc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]), n = u32le(b, i + 4), tot = 8 + n + (n & 1);
    if (i + 8 + n > end) throw new BadImage("corrupt");
    const d = b.subarray(i + 8, i + 8 + n);
    if (cc === "VP8 ") { if (n < 10 || d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new BadImage("corrupt"); if (vp8x < 0 && !w) { w = u16le(d, 6) & 0x3fff; h = u16le(d, 8) & 0x3fff; } }
    else if (cc === "VP8L") { if (n < 5 || d[0] !== 0x2f) throw new BadImage("corrupt"); if (vp8x < 0 && !w) { w = 1 + (d[1] | ((d[2] & 0x3f) << 8)); h = 1 + (((d[2] & 0xc0) >> 6) | (d[3] << 2) | ((d[4] & 0x0f) << 10)); } }
    else if (cc === "VP8X") { if (n < 10) throw new BadImage("corrupt"); vp8x = chunks.length; w = 1 + u24le(d, 4); h = 1 + u24le(d, 7); }
    if (cc !== "EXIF" && cc !== "XMP ") chunks.push(b.subarray(i, Math.min(i + tot, end)));
    i += tot;
  }
  if (!w || !h) throw new BadImage("no_dimensions");
  if (vp8x >= 0) { const c = chunks[vp8x].slice(); c[8] &= ~0x0c; chunks[vp8x] = c; } // EXIF (0x08) / XMP (0x04) flags off
  const bodyU8 = concatU8(chunks), out = new Uint8Array(12 + bodyU8.length);
  out.set(b.subarray(0, 12)); const sz = 4 + bodyU8.length; out[4] = sz & 255; out[5] = (sz >> 8) & 255; out[6] = (sz >> 16) & 255; out[7] = (sz >>> 24) & 255; out.set(bodyU8, 12);
  return { w, h, bytes: out };
}
/* → {w, h, bytes (metadata stripped)} — throws BadImage {why} */
export function inspectImage(mime, b) {
  const r = mime === "image/jpeg" ? cleanJpeg(b) : mime === "image/png" ? cleanPng(b) : mime === "image/webp" ? cleanWebp(b) : null;
  if (!r) throw new BadImage("unsupported");
  return r;
}
/* exported for src/chat-media.js (the photos of Janna's and Bassem's calls apply the identical rules and Arabic reasons) */
export function dimsProblem(w, h, purpose) {
  if (w < 64 || h < 64) return "too_small";
  if (w > 6000 || h > 6000) return "too_large_dimensions";
  if (w * h > 36000000) return "too_many_pixels";
  const min = PURPOSE_MIN[purpose]; if (min && (w < min[0] || h < min[1])) return "too_small_for_" + purpose;
  return "";
}
export const WHY_AR = { too_small: "الصورة صغيرة (أقل من 64×64)", too_large_dimensions: "أبعاد الصورة أكبر من 6000×6000", too_many_pixels: "الصورة أكبر من 36 ميجابكسل", corrupt: "الملف مش صورة سليمة", no_dimensions: "مش قادرين نقرا أبعاد الصورة", empty: "الملف فاضي", too_small_for_banner: "صورة البانر لازم تكون 1120×200 على الأقل", too_small_for_logo: "اللوجو لازم يكون 96×96 على الأقل", too_small_for_product: "صورة المنتج لازم تكون 300×300 على الأقل" };
const publicPath = row => "/media/" + row.r2_key;
async function mediaSig(env, id, e) { const s = secretOf(env); return s ? (await hmac(s, "media|" + id + "|" + e)).slice(0, 32) : ""; }
async function previewUrl(env, row) { const e = Math.floor(Date.now() / 1000) + PREVIEW_S, s = await mediaSig(env, row.id, e); return s ? publicPath(row) + "?e=" + e + "&s=" + s : ""; }
async function mediaOut(env, row) {
  const pub = publicPath(row);
  return { id: row.id, url: row.status === "public" ? pub : await previewUrl(env, row), public_url: pub, abs_url: site(env).replace(/\/$/, "") + pub, width: row.width, height: row.height, bytes: row.bytes, mime: row.mime,
    purpose: row.purpose, status: row.status, owner_type: row.owner_type, owner_id: row.owner_id, orig_name: row.orig_name, created_at: row.created_at };
}
const MEDIA_MEMO = new WeakMap(); // env.DB → Map(id → {at, row})
async function mediaRowCached(env, id) {
  let m = MEDIA_MEMO.get(env.DB); if (!m) { m = new Map(); MEDIA_MEMO.set(env.DB, m); }
  const c = m.get(id); if (c && Date.now() - c.at < MEDIA_MEMO_MS) return c.row;
  const row = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first();
  if (m.size > 2000) m.clear();
  m.set(id, { at: Date.now(), row }); return row;
}
const forgetMedia = (env, ids) => { const m = env && env.DB && MEDIA_MEMO.get(env.DB); if (m) for (const id of ids) m.delete(id); };
/* uploadMedia(env, {owner_type: "admin"|"member", owner_id, purpose, body: ArrayBuffer|Uint8Array, type, name}) → {media, duplicate?}
   throws CE {status, code} — 503 media_off · 413 too_large · 415 unsupported_type · 422 invalid_image {why} */
export async function uploadMedia(env, { owner_type, owner_id, purpose, body: raw, type, name } = {}) {
  if (!env || !env.MEDIA || typeof env.MEDIA.put !== "function") fail(503, "media_off", "رفع الصور محتاج تفعيل R2 / uploads need the R2 binding MEDIA");
  if (!env.DB) fail(503, "store_off", "store not configured");
  if (owner_type !== "admin" && owner_type !== "member") fail(400, "invalid_owner", "owner_type: admin | member");
  const pp = PURPOSES.includes(purpose) ? purpose : "other";
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw || new ArrayBuffer(0));
  const max = owner_type === "member" ? MAX_MEMBER_UPLOAD : MAX_ADMIN_UPLOAD;
  if (u8.length > max) fail(413, "too_large", `الصورة أكبر من ${max / MB} ميجا / larger than ${max / MB} MB`, { limit: max });
  if (!u8.length) fail(422, "invalid_image", WHY_AR.empty + " / empty file", { why: "empty" });
  const decl = String(type || "").split(";")[0].trim().toLowerCase();
  if (!MIMES[decl]) fail(415, "unsupported_type", "الصور المسموحة: JPEG أو PNG أو WebP / only JPEG, PNG or WebP", { why: "type" });
  const sniff = sniffImage(u8);
  if (sniff !== decl) fail(415, "unsupported_type", "محتوى الملف مش مطابق لنوعه — ارفع صورة JPEG أو PNG أو WebP حقيقية / the file content is not the declared image type", { why: sniff ? "type_mismatch" : "not_an_image" });
  let img; try { img = inspectImage(decl, u8); } catch (e) { const why = (e && e.why) || "corrupt"; fail(422, "invalid_image", (WHY_AR[why] || WHY_AR.corrupt) + " / invalid image", { why }); }
  const why = dimsProblem(img.w, img.h, pp);
  if (why) fail(422, "invalid_image", (WHY_AR[why] || why) + ` (${img.w}×${img.h})`, { why, width: img.w, height: img.h });
  const sha = await hex2(img.bytes);
  try {
    const dup = await env.DB.prepare("SELECT * FROM cc_media WHERE sha256 = ? AND owner_type = ? AND owner_id = ? AND status NOT IN ('deleted', 'rejected') ORDER BY created_at LIMIT 1").bind(sha, owner_type, String(owner_id || "")).first();
    if (dup) return { media: await mediaOut(env, dup), duplicate: true };
  } catch (e) { if (noTable(e)) fail(503, "store_off", "migration 0006 is not applied"); throw e; }
  const id = rid(16), yyyy = cairoDay().slice(0, 4), ext = MIMES[decl], key = `u/${yyyy}/${id}.${ext}`, t = now();
  await env.MEDIA.put(key, img.bytes, { httpMetadata: { contentType: decl }, customMetadata: { owner_type, owner_id: String(owner_id || ""), purpose: pp, sha256: sha } });
  try {
    await env.DB.prepare("INSERT INTO cc_media (id, r2_key, owner_type, owner_id, purpose, mime, bytes, width, height, sha256, status, orig_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, key, owner_type, String(owner_id || ""), pp, decl, img.bytes.length, img.w, img.h, sha, owner_type === "admin" ? "public" : "pending", neutral1(name || "").slice(0, 120), t, t).run();
  } catch (e) { try { await env.MEDIA.delete(key); } catch (x) { /* orphan is removed by the cron */ } throw e; }
  return { media: await mediaOut(env, await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first()) };
}
/* approval of a member's product / company request makes its images public */
export async function mediaPublic(env, ids, by = "") {
  const list = [...new Set([].concat(ids || []).map(x => String(x).replace(/^.*\/([2-9a-hjkmnp-z]{16})\.(jpg|png|webp)$/, "$1")).filter(x => new RegExp(`^${RID_RX}{16}$`).test(x)))];
  if (!list.length || !env || !env.DB) return { updated: 0 };
  let n = 0, t = now();
  for (const id of list) { const r = await env.DB.prepare("UPDATE cc_media SET status = 'public', approved_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(String(by).slice(0, 254), t, id).run(); n += (r.meta && r.meta.changes) || 0; }
  forgetMedia(env, list);
  return { updated: n };
}
/* which content rows / member products / pending company requests use each media id */
async function mediaUsage(env) {
  const use = new Map(), add = (mid, ref) => { if (!use.has(mid)) use.set(mid, new Set()); use.get(mid).add(ref); };
  const rx = /\/media\/u\/\d{4}\/([2-9a-hjkmnp-z]{16})\.(?:jpg|png|webp)/g;
  try { for (const r of (await env.DB.prepare("SELECT id, draft_json, live_json FROM cc_content WHERE draft_json LIKE '%/media/u/%' OR live_json LIKE '%/media/u/%'").all()).results || []) for (const m of String(r.draft_json + r.live_json).matchAll(rx)) add(m[1], r.id); } catch (e) { /* no table */ }
  try { for (const r of (await env.DB.prepare("SELECT id, draft_json, live_json FROM cc_member_products WHERE state != 'deleted'").all()).results || []) for (const j of [jl(r.draft_json, {}), jl(r.live_json, {})]) for (const x of [].concat(obj(j).images || [])) add(String(x), "mp:" + r.id); } catch (e) { /* no table */ }
  try { for (const r of (await env.DB.prepare("SELECT id, fields_json FROM cc_company_requests WHERE state = 'pending'").all()).results || []) for (const m of String(r.fields_json).matchAll(rx)) add(m[1], "cr:" + r.id); } catch (e) { /* no table */ }
  return use;
}
async function mediaRoute(req, env, ctx, adm, url, p) {
  const M = req.method, id = decodeURIComponent(p.split("/")[2] || "");
  if (p === "/media" && M === "POST") {
    need(adm, "media.upload");
    const len = +req.headers.get("Content-Length") || 0;
    if (len > MAX_ADMIN_UPLOAD) fail(413, "too_large", "الصورة أكبر من 5 ميجا / larger than 5 MB", { limit: MAX_ADMIN_UPLOAD });
    const purpose = url.searchParams.get("purpose") || "other";
    if (!PURPOSES.includes(purpose)) fail(400, "invalid_purpose", "purpose: " + PURPOSES.join(" | "));
    const r = await uploadMedia(env, { owner_type: "admin", owner_id: adm.member ? adm.member.id : "platform", purpose, body: await req.arrayBuffer(), type: req.headers.get("Content-Type"), name: url.searchParams.get("name") || "" });
    if (!r.duplicate) await audited(adm, "media.upload", r.media.id, null, { purpose, bytes: r.media.bytes, width: r.media.width, height: r.media.height }, "upload " + purpose);
    return ccJson(req, env, r, r.duplicate ? 200 : 201);
  }
  if (p === "/media" && M === "GET") {
    need(adm, "content.read");
    const page = Math.max(0, int(url.searchParams.get("page"), 0)), limit = Math.min(200, Math.max(1, int(url.searchParams.get("limit"), 50)));
    const where = [], args = [];
    for (const [k, col] of [["purpose", "purpose"], ["status", "status"], ["owner", "owner_type"]]) { const v = url.searchParams.get(k); if (v) { where.push(col + " = ?"); args.push(v); } }
    if (!url.searchParams.get("status")) where.push("status != 'deleted'");
    const w = where.length ? " WHERE " + where.join(" AND ") : "";
    let rows = [], total = 0;
    try {
      total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_media" + w).bind(...args).first("n")) || 0;
      rows = (await env.DB.prepare("SELECT * FROM cc_media" + w + " ORDER BY created_at DESC, id LIMIT ? OFFSET ?").bind(...args, limit, page * limit).all()).results || [];
    } catch (e) { if (!noTable(e)) throw e; }
    const use = rows.length ? await mediaUsage(env) : new Map();
    const items = []; for (const r of rows) items.push({ ...(await mediaOut(env, r)), used_by: [...(use.get(r.id) || [])] });
    return ccJson(req, env, { items, total, page, limit, media_r2: !!env.MEDIA });
  }
  if (id && M === "DELETE") {
    need(adm, "media.delete");
    const row = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first();
    if (!row || row.status === "deleted") fail(404, "not_found", "مش موجودة / not found");
    const used = [...((await mediaUsage(env)).get(id) || [])];
    if (used.length) fail(409, "in_use", "الصورة مستخدمة — شيلها من العناصر دي الأول / the image is in use", { used_by: used });
    await audited(adm, "media.delete", id, { status: row.status, purpose: row.purpose }, { status: "deleted" }, "delete media");
    await env.DB.prepare("UPDATE cc_media SET status = 'deleted', updated_at = ? WHERE id = ?").bind(now(), id).run();
    try { if (env.MEDIA) await env.MEDIA.delete(row.r2_key); } catch (e) { /* the cron retries orphans */ }
    forgetMedia(env, [id]);
    try { if (typeof caches !== "undefined" && caches.default) await caches.default.delete(new Request(site(env).replace(/\/$/, "") + publicPath(row))); } catch (e) { /* this PoP only */ }
    return ccJson(req, env, { ok: true });
  }
  fail(405, "method", "method not allowed");
}
/* GET /media/u/<yyyy>/<id>.<ext> — public uploads (long cache) or a signed 1-hour preview of a pending one */
export async function serveMedia(req, env, ctx) {
  env = env || {};
  const H404 = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  const notFound = () => new Response("not found", { status: 404, headers: H404 });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { ...H404, Allow: "GET, HEAD" } });
  const url = new URL(req.url), m = MEDIA_RX.exec(url.pathname);
  if (!m || !env.MEDIA || !env.DB) return notFound();
  try {
    const row = await mediaRowCached(env, m[2]);
    if (!row || row.r2_key !== `u/${m[1]}/${m[2]}.${m[3]}` || !row.r2_key.startsWith("u/") || row.status === "deleted") return notFound();
    const pub = row.status === "public";
    if (!pub) {
      const e = int(url.searchParams.get("e"), 0), s = url.searchParams.get("s") || "", nowS = Math.floor(Date.now() / 1000);
      if (!(e >= nowS && e <= nowS + PREVIEW_S + 60 && s.length === 32 && safeEq(s, await mediaSig(env, row.id, e)))) return notFound();
    }
    const etag = `"${String(row.sha256).slice(0, 32)}"`;
    const head = { "Content-Type": row.mime, "Cache-Control": pub ? "public, max-age=31536000, immutable" : "private, no-store", ETag: etag, "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline", "Access-Control-Allow-Origin": "*", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "cross-origin" };
    if (notModified(req, etag)) return new Response(null, { status: 304, headers: head });
    const cache = pub ? cacheOf() : null, ck = cache ? new Request(new URL(url.pathname, site(env)).toString()) : null;
    if (cache) { try { const hit = await cache.match(ck); if (hit) return new Response(req.method === "HEAD" ? null : hit.body, { status: 200, headers: head }); } catch (e) { /* miss */ } }
    const o = await env.MEDIA.get(row.r2_key);
    if (!o) return notFound();
    const buf = await o.arrayBuffer();
    if (cache && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(ck, new Response(buf, { headers: { ...head, "Cache-Control": "public, max-age=3600" } })).catch(() => {})); // ≤ 1 h at the PoP (a deletion takes effect)
    return new Response(req.method === "HEAD" ? null : buf, { status: 200, headers: { ...head, "Content-Length": String(buf.byteLength) } });
  } catch (e) { return notFound(); }
}

/* ============================================ plan helpers (P-W2's planCan / planLimit when present, else today's rules) ============================================ */
const CAP_MIN = { alerts: 1, listing: 1, respond: 2, incoming: 2, stats: 2, priority: 3, featured: 3, bassem: 4 };
const LIMIT_DEFAULT = { products: { profile: 0, basic: 30, premium: 80, partner: 200, strategic: -1 }, images_per_product: { basic: 1, premium: 1, partner: 1, strategic: 1 } };
export function planCanX(m, cap) {
  if (typeof COMMON.planCan === "function") return !!COMMON.planCan(m, cap);
  const p = effPlan(m); if (p === "visitor") return false;
  return cap in CAP_MIN ? PLAN_LV[p] >= CAP_MIN[cap] : false;
}
export function planLimitX(m, key) {
  if (typeof COMMON.planLimit === "function") { const n = COMMON.planLimit(m, key); return Number.isFinite(n) ? n : 0; }
  const p = effPlan(m); if (p === "visitor") return 0;
  return (LIMIT_DEFAULT[key] && LIMIT_DEFAULT[key][p]) || 0;
}

/* ============================================ directory look-ups (worker/src/data.json + cc_content) ============================================ */
let DIR = null;
function dirIndex() { if (!DIR) { DIR = new Map(); for (const r of DATA.f || []) { const m = /^company\.html#(.+)$/.exec(String(r[5] || "")); if (m) DIR.set(m[1], r); } } return DIR; }
const FACREF_RX = new RegExp(`^(?:\\d{1,6}|x\\d{1,6}|c-${RID_RX}{8})$`);
/* the public listing behind a factory_ref ("12", "x3" or an added "c-…") — what the server knows (the dashboard enriches it from the data files) */
async function listingOf(env, ref) {
  if (!ref || !FACREF_RX.test(ref)) return null;
  if (ref.startsWith("c-")) {
    let r = null; try { r = await getRow(env, "fac", ref); } catch (e) { r = null; }
    if (!r) return null;
    const x = jl(r.live_json || r.draft_json, {});
    return { ref, source: "added", name: x.name || "", type: x.type || "", sector: x.sector || "", location: x.location || "", gov: x.gov || "", description: x.description || "", products: x.products || [],
      website: x.website || "", logo: x.logo || "", video: x.video || "", social: x.social || {}, published: !!(r.live_json && !r.live_hidden && !r.deleted), url: x.url || "" };
  }
  const f = dirIndex().get(ref); if (!f) return null;
  const out = { ref, source: "build", name: f[0], type: f[1], sector: f[2], location: f[3], products: f[4] ? String(f[4]).split(/،\s*/).filter(Boolean) : [], published: true };
  try { // live edits approved through the platform (base rows carry private.ref)
    const coll = ref.startsWith("x") ? "facx" : "fac";
    for (const r of (await env.DB.prepare("SELECT * FROM cc_content WHERE coll = ? AND kind = 'base' AND private_json LIKE ?").bind(coll, `%"ref":"${ref}"%`).all()).results || []) {
      if (jl(r.private_json, {}).ref !== ref) continue;
      Object.assign(out, pubRec(coll, jl(r.live_json, {}))); out.base_key = r.base_key; if (r.live_hidden || r.deleted) out.published = false;
    }
  } catch (e) { /* no table */ }
  return out;
}
async function factoryName(env, ref) { const l = await listingOf(env, ref); return l ? l.name : ""; }
/* the member already linked to a listing (one listing ↔ one account) */
async function linkedMember(env, ref, exceptId) { return env.DB.prepare("SELECT id FROM members WHERE factory_ref = ? AND id != ? LIMIT 1").bind(ref, exceptId || "").first("id"); }

/* ============================================ e-mails + bells to members (templates of the e-mail center when wired) ============================================ */
const TPL_DEFAULT = {
  product_approved: v => ({ subject: `اتوافق على منتجك «${v.product}» / Your product “${v.product}” was approved`, list: "updates",
    ar: `أهلاً،\nاتوافق على منتجك «${v.product}» وبقى ظاهر في سوق المنصة خلال دقايق.\nتقدر تشوفه وتعدّله من لوحتك: ${v.url}`,
    en: `Hello,\nYour product “${v.product}” was approved and appears in the marketplace within minutes.\nYou can view and edit it from your dashboard: ${v.url}` }),
  product_rejected: v => ({ subject: `ماتوافقش على منتجك «${v.product}» / Your product “${v.product}” was not approved`, list: "updates",
    ar: `أهلاً،\nماتوافقش على منتجك «${v.product}» — السبب: ${v.reason}.\nتقدر تعدّل وتبعت تاني من لوحتك: ${v.url}`,
    en: `Hello,\nYour product “${v.product}” was not approved — reason: ${v.reason}.\nYou can edit it and send it again from your dashboard: ${v.url}` }),
  company_approved: v => ({ subject: `اتوافق على طلب ملف «${v.company}» / Your company request for “${v.company}” was approved`, list: "updates",
    ar: `أهلاً،\nاتوافق على طلبك الخاص بملف «${v.company}» في دليل المنصة، والتحديث بيظهر على الموقع خلال دقايق.\nلوحتك: ${v.url}`,
    en: `Hello,\nYour request for the directory listing “${v.company}” was approved; the change appears on the site within minutes.\nYour dashboard: ${v.url}` }),
  company_rejected: v => ({ subject: `ماتوافقش على طلب ملف «${v.company}» / Your company request for “${v.company}” was not approved`, list: "updates",
    ar: `أهلاً،\nماتوافقش على طلبك الخاص بملف «${v.company}» — السبب: ${v.reason}.\nتقدر تعدّل وتبعت تاني من لوحتك: ${v.url}`,
    en: `Hello,\nYour request for the listing “${v.company}” was not approved — reason: ${v.reason}.\nYou can edit it and send it again from your dashboard: ${v.url}` }),
};
async function renderFor(env, CC, key, vars) {
  if (CC && CC.email && typeof CC.email.renderTemplate === "function") { try { const t = await CC.email.renderTemplate(env, key, { lang: "ar", vars }); if (t && t.subject && t.ar) return t; } catch (e) { /* defaults */ } }
  return { ...TPL_DEFAULT[key](vars), tpl: key };
}
/* the e-mail center's convention: mail(env, {id, to, ...rendered}) — tpl + __rendered tell prepareMail() the text is final */
const tplMsg = (t, key, id, to) => ({ tpl: key, ...(t.__rendered ? { __rendered: t.__rendered } : {}), id, to, lang: "ar", subject: t.subject, ar: t.ar, en: t.en, list: t.list === undefined ? "updates" : t.list || undefined, ...(t.why ? { why: t.why } : {}) });
const sendSafe = async (env, msg) => { try { return await mail(env, msg); } catch (e) { return { sent: false, error: "mail" }; } };
const bellSafe = async (env, id, n) => { try { await notify(env, id, n); } catch (e) { /* best effort */ } };
const dashUrl = (env, tab) => site(env) + "dashboard.html#" + tab;
async function mailProductDecision(env, CC, m, ok, product, reason, uniq) {
  const vars = { product, reason: reason || "", url: dashUrl(env, "products") }, key = ok ? "product_approved" : "product_rejected", t = await renderFor(env, CC, key, vars);
  const r = !m || !isEmail(m.email) || t.enabled === false ? { sent: false, skipped: t.enabled === false ? "template_off" : undefined } : ok
    ? await sendSafe(env, tplMsg(t, key, `prodok-${uniq}`, m.email))
    : await sendSafe(env, tplMsg(t, key, `prodno-${uniq}`, m.email));
  if (m) await bellSafe(env, m.id, { kind: key, url: "dashboard.html#products", title: ok ? `اتوافق على منتجك «${product}»` : `ماتوافقش على منتجك «${product}»`, body: ok ? "المنتج بقى ظاهر في السوق." : "السبب: " + reason,
    title_en: ok ? `Your product “${product}” was approved` : `Your product “${product}” was not approved`, body_en: ok ? "It is now listed in the marketplace." : "Reason: " + reason });
  return r;
}
async function mailCompanyDecision(env, CC, m, ok, company, reason, uniq) {
  const vars = { company, reason: reason || "", url: dashUrl(env, "company") }, key = ok ? "company_approved" : "company_rejected", t = await renderFor(env, CC, key, vars);
  const r = !m || !isEmail(m.email) || t.enabled === false ? { sent: false, skipped: t.enabled === false ? "template_off" : undefined } : ok
    ? await sendSafe(env, tplMsg(t, key, `compok-${uniq}`, m.email))
    : await sendSafe(env, tplMsg(t, key, `compno-${uniq}`, m.email));
  if (m) await bellSafe(env, m.id, { kind: key, url: "dashboard.html#company", title: ok ? `اتوافق على طلب ملف «${company}»` : `ماتوافقش على طلب ملف «${company}»`, body: ok ? "التحديث بيظهر على الموقع خلال دقايق." : "السبب: " + reason,
    title_en: ok ? `Your request for “${company}” was approved` : `Your request for “${company}” was not approved`, body_en: ok ? "The change appears on the site within minutes." : "Reason: " + reason });
  return r;
}

/* ============================================ exported content operations (used through CC.content) ============================================ */
/* upsert(env, {coll, kind, base_key, id?, fields, private?, seo_path?, publish?, by, source?, member_id?, CC?, company_name?}) → {item, published_v?, warnings}
   The same validation as the HTTP path; an existing row (base: same key · add: same id) is updated, else created. Throws CE {status, code, errors}. */
export async function upsert(env, o = {}) {
  const res = await saveContent(env, { ...o, mode: "upsert", by: o.by || "system", source: o.source || "admin", adm: o.adm || null, audit: false, allowPendingMedia: o.source === "member", memberId: o.member_id || "" });
  const out = { item: rowOut(res.row), warnings: res.warnings };
  if (o.publish) { const p = await publishOverlay(env, { by: o.by || "system", ids: [res.row.id], CC: o.CC, reason: o.reason || "upsert" }); out.published_v = p.v; out.item = rowOut(await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(res.row.id).first()); }
  return out;
}
/* member-triggered publishes (a member hides / shows / deletes an approved product of theirs, acc-me.js) are coalesced and bounded (review
   F7): the change is saved as a draft by "member:<id>" at once; it is published right away only within MEMBER_PUB (per member and in total,
   per hour) and while the publish lock is free — otherwise contentCron (every 15 min) ships every waiting member change in ONE version. A
   member can therefore never churn the publish lock, the KV keys, the edge cache or the team's rollback history. */
export const MEMBER_PUB = Object.freeze({ member: 6, all: 60, window_s: 3600 });
const MEMBER_PENDING = "state = 'draft' AND updated_by LIKE 'member:%'";
export async function memberPublish(env, { memberId, CC } = {}) {
  const ids = ((await env.DB.prepare(`SELECT id FROM cc_content WHERE ${MEMBER_PENDING} AND member_id = ? ORDER BY updated_at LIMIT 200`).bind(String(memberId || "")).all()).results || []).map(r => r.id);
  if (!ids.length) return { published: false, pending: 0 };
  if (!(await rateOk(env, "mepub|" + memberId, MEMBER_PUB.member, MEMBER_PUB.window_s)) || !(await rateOk(env, "mepub|all", MEMBER_PUB.all, MEMBER_PUB.window_s))) return { published: false, deferred: true, pending: ids.length };
  try { const p = await publishOverlay(env, { by: "member:" + memberId, ids, CC, reason: "member", lockWaitMs: 1000, strict: false }); return { published: true, v: p.v }; }
  catch (e) { if (e instanceof CE && (e.code === "locked" || e.status === 409)) return { published: false, deferred: true, pending: ids.length }; throw e; }
}
/* setHidden(env, {coll, id | base_key, hidden, publish, by, seo_path?, CC?}) → {item, published_v?} (a base row without an edit row gets one) */
export async function setHidden(env, o = {}) {
  let row = null;
  if (o.id) row = await getRow(env, o.coll, String(o.id));
  else if (o.base_key != null) { const k = normBaseKey(o.coll, o.base_key); row = k ? await getBaseRow(env, o.coll, k) : null; }
  const res = row ? await saveContent(env, { coll: o.coll, mode: "patch", id: row.id, fields: {}, seo_path: o.seo_path, hidden: !!o.hidden, by: o.by || "system", source: row.source, audit: false })
    : o.base_key != null ? await saveContent(env, { coll: o.coll, mode: "upsert", kind: "base", base_key: o.base_key, fields: {}, seo_path: o.seo_path, hidden: !!o.hidden, by: o.by || "system", audit: false })
    : fail(404, "not_found", "مش موجود / not found");
  const out = { item: rowOut(res.row) };
  if (o.publish) { const p = await publishOverlay(env, { by: o.by || "system", ids: res.row.state === "published" ? [] : [res.row.id], CC: o.CC, reason: "hide" }); out.published_v = p.v; out.edge_ids = p.edge_ids; out.item = rowOut(await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(res.row.id).first()); }
  return out;
}
/* delete semantics (§3.2 / §4.8): add never published → row deleted (desk rows are kept, marked deleted, for the desk history) · published add
   → deleted (dropped at the next publish) · base row, mode "revert" (default) → back to the build data · base row, mode "remove" → permanent hide + 301 */
async function removeContent(env, row, { mode = "revert", by = "system", reason = "" } = {}) {
  const t = now();
  if (row.kind === "add") {
    if (!row.live_json) {
      if (row.source === "desk") { const pr = { ...jl(row.private_json, {}), ...(reason ? { reject_reason: neutral1(reason).slice(0, 500) } : {}) }; await env.DB.prepare("UPDATE cc_content SET deleted = 1, hidden = 1, state = 'published', private_json = ?, updated_by = ?, updated_at = ?, rev = rev + 1 WHERE id = ?").bind(stable(pr), by, t, row.id).run(); return "kept"; }
      await env.DB.prepare("DELETE FROM cc_content WHERE id = ?").bind(row.id).run(); return "deleted";
    }
    await env.DB.prepare("UPDATE cc_content SET deleted = 1, state = 'unpublished', updated_by = ?, updated_at = ?, rev = rev + 1 WHERE id = ?").bind(by, t, row.id).run(); return "pending";
  }
  if (mode === "remove") { await env.DB.prepare("UPDATE cc_content SET deleted = 1, hidden = 1, state = 'draft', updated_by = ?, updated_at = ?, rev = rev + 1 WHERE id = ?").bind(by, t, row.id).run(); return "pending"; }
  if (!row.live_json && !row.live_hidden) { await env.DB.prepare("DELETE FROM cc_content WHERE id = ?").bind(row.id).run(); return "deleted"; }
  await env.DB.prepare("UPDATE cc_content SET draft_json = '{}', hidden = 0, deleted = 0, state = 'draft', updated_by = ?, updated_at = ?, rev = rev + 1 WHERE id = ?").bind(by, t, row.id).run(); return "pending";
}

/* ============================================ member self-service: /api/me/products, /api/me/company, /api/me/media ============================================ */
const MP_FIELDS = ["name", "name_en", "category", "description", "description_en", "price"];
const MP_ID_RX = new RegExp(`^p-${RID_RX}{8}$`), CR_ID_RX = new RegExp(`^cr-${RID_RX}{10}$`), MEDIA_ID_RX = new RegExp(`^${RID_RX}{16}$`);
/* products that count against the plan limit: everything except deleted ones and rejected ones that were never approved */
async function mpUsed(env, mid, exceptId = "") { return (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_member_products WHERE member_id = ? AND id != ? AND state != 'deleted' AND NOT (state = 'rejected' AND live_json = '')").bind(mid, exceptId).first("n")) || 0; }
const imgLimit = m => { const n = planLimitX(m, "images_per_product"); return n === -1 ? 10 : Math.max(1, Math.min(10, n || 1)); };
const mediaIdOf = x => { const s = String(x == null ? "" : x).trim(); if (MEDIA_ID_RX.test(s)) return s; const m = MEDIA_RX.exec(s.split("?")[0]); return m ? m[2] : ""; };
/* the member's own uploads (not deleted / rejected) of the given purposes */
async function ownMedia(env, m, ids, purposes) {
  const out = [];
  for (const x of ids) {
    const id = mediaIdOf(x); if (!id) return { err: "invalid_image", msg: "صورة غير معروفة / unknown image" };
    const r = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first();
    if (!r || r.owner_type !== "member" || r.owner_id !== m.id || r.status === "deleted" || r.status === "rejected" || (purposes && !purposes.includes(r.purpose))) return { err: "invalid_image", msg: "الصورة دي مش من رفعك أو اتمسحت / not one of your uploads" };
    out.push(r);
  }
  return { rows: out };
}
async function mpValidate(env, m, input, images, { requireAll }) {
  const fin = obj(input), errors = [], fields = {};
  for (const k of Object.keys(fin)) if (!MP_FIELDS.includes(k)) errors.push({ field: k, code: "unknown_field", msg: `${k}: حقل غير معروف / unknown field` });
  const pick = {}; for (const k of MP_FIELDS) if (own(fin, k) && fin[k] !== null) pick[k] = fin[k];
  const v = await validateFields(env, "prod", pick, { add: true, source: "member" });
  errors.push(...v.errors); Object.assign(fields, v.out);
  let imageIds;
  if (images !== undefined) {
    if (!Array.isArray(images)) errors.push({ field: "images", code: "invalid_list", msg: "images: list of uploaded image ids" });
    else if (images.length > imgLimit(m)) errors.push({ field: "images", code: "limit", msg: `باقتك بتسمح بـ ${imgLimit(m)} صورة لكل منتج / your plan allows ${imgLimit(m)} image(s) per product` });
    else { const r = await ownMedia(env, m, images, ["product"]); if (r.err) errors.push({ field: "images", code: r.err, msg: r.msg }); else imageIds = r.rows.map(x => x.id); }
  }
  if (requireAll) for (const k of ["name", "category"]) if (isEmpty(fields[k])) errors.push({ field: k, code: "required", msg: `${k}: مطلوب / required` });
  return { fields, imageIds, errors };
}
async function mpOut(env, r) {
  const d = jl(r.draft_json, {}), images = [];
  for (const id of [].concat(d.images || [])) { let mr = null; try { mr = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(String(id)).first(); } catch (e) { mr = null; } if (mr && mr.status !== "deleted") images.push({ id: mr.id, url: mr.status === "public" ? publicPath(mr) : await previewUrl(env, mr), w: mr.width, h: mr.height, status: mr.status }); }
  const f2 = {}; for (const k of MP_FIELDS) f2[k] = d[k] == null ? "" : d[k];
  return { id: r.id, state: r.state, fields: f2, images, live: r.live_json ? jl(r.live_json, null) : null, reject_reason: r.reject_reason, submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, factory_ref: r.factory_ref, created_at: r.created_at, updated_at: r.updated_at };
}
const planNeed = () => (typeof COMMON.plansWith === "function" ? COMMON.plansWith("products")[0] : "") || "basic";
async function meProducts(req, env, ctx, CC, m, url, seg) {
  const M = req.method, id = seg[1] || "", act = seg[2] || "";
  if (M === "GET" && !id) {
    let rows = []; try { rows = (await env.DB.prepare("SELECT * FROM cc_member_products WHERE member_id = ? AND state != 'deleted' ORDER BY created_at DESC LIMIT 500").bind(m.id).all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
    const limit = planLimitX(m, "products"), used = rows.filter(r => !(r.state === "rejected" && !r.live_json)).length;
    const need = limit === 0 ? "plan" : !m.factory_ref ? "link" : null, items = [];
    for (const r of rows) items.push(await mpOut(env, r));
    return { items, limit, used, can_add: need === null && (limit === -1 || used < limit), need, images_per_product: imgLimit(m), plan_needed: limit === 0 ? planNeed() : null };
  }
  if (M === "GET") fail(405, "method", "method not allowed");
  if (!(await rateOk(env, "meprod|" + m.id, 120, 3600))) fail(429, "rate_limited", "تعديلات كتير — جرّب بعد شوية / too many changes, try again later");
  const limit = planLimitX(m, "products");
  if (!id && M === "POST") {
    const b = await body(req);
    if (limit === 0) fail(403, "plan", "باقتك مش بتشمل منتجات في السوق / your plan does not include marketplace products", { need: planNeed() });
    if (!m.factory_ref) fail(409, "link_required", "اربط حسابك بملف شركتك الأول من «ملف الشركة» / link your company listing first");
    const used = await mpUsed(env, m.id);
    if (limit !== -1 && used >= limit) fail(429, "limit", `وصلت للحد (${limit} منتج) — رقّي الباقة لمنتجات أكتر / you reached your plan's product limit`, { limit, used });
    const v = await mpValidate(env, m, b.fields, b.images === undefined ? [] : b.images, { requireAll: true });
    if (v.errors.length) fail(422, v.errors[0].code, v.errors[0].msg, { errors: v.errors });
    let pid = "p-" + rid(8); for (let i = 0; i < 3 && await env.DB.prepare("SELECT 1 AS x FROM cc_content WHERE id = ? UNION SELECT 1 FROM cc_member_products WHERE id = ?").bind(pid, pid).first("x"); i++) pid = "p-" + rid(8);
    const t = now(), submit = b.submit === true, d = { ...v.fields, images: v.imageIds || [] };
    await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, live_json, reject_reason, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)")
      .bind(pid, m.id, m.factory_ref, submit ? "pending" : "draft", stable(d), submit ? t : "", t, t).run();
    return [201, { item: await mpOut(env, await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ?").bind(pid).first()) }];
  }
  if (!MP_ID_RX.test(id)) fail(404, "not_found", "مش موجود / not found");
  const r = await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ? AND member_id = ?").bind(id, m.id).first();
  if (!r || r.state === "deleted") fail(404, "not_found", "مش موجود / not found");
  const t = now();
  if (M === "DELETE" && !act) {
    await env.DB.prepare("UPDATE cc_member_products SET state = 'deleted', updated_at = ? WHERE id = ?").bind(t, id).run();
    let published_v = null;
    if (r.live_json) { const cr = await getRow(env, "prod", id); if (cr) { await removeContent(env, cr, { by: "member:" + m.id }); published_v = (await publishOverlay(env, { by: "member:" + m.id, ids: [], CC, reason: "member delete" })).v; } }
    return { ok: true, published_v };
  }
  if (M === "POST" && act === "hide") {
    const b = await body(req), hide = b.hidden !== false;
    if (!r.live_json) fail(409, "state", "المنتج لسه مااتنشرش / not published yet");
    const res = await setHidden(env, { coll: "prod", id, hidden: hide, publish: true, by: "member:" + m.id, CC });
    await env.DB.prepare("UPDATE cc_member_products SET state = ?, updated_at = ? WHERE id = ?").bind(hide ? "hidden" : (r.draft_json === r.live_json ? "approved" : r.state === "hidden" ? "approved" : r.state), t, id).run();
    return { item: await mpOut(env, await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ?").bind(id).first()), published_v: res.published_v };
  }
  if ((M === "PATCH" && !act) || (M === "POST" && act === "submit")) {
    const b = M === "PATCH" ? await body(req) : {}, submit = act === "submit" || b.submit === true;
    const v = await mpValidate(env, m, b.fields, b.images, { requireAll: false });
    if (v.errors.length) fail(422, v.errors[0].code, v.errors[0].msg, { errors: v.errors });
    const d = { ...jl(r.draft_json, {}) }; for (const [k, x] of Object.entries(v.fields)) d[k] = x; if (v.imageIds) d.images = v.imageIds;
    for (const k of Object.keys(obj(b.fields))) if (b.fields[k] === null && MP_FIELDS.includes(k) && !["name", "category"].includes(k)) d[k] = "";
    if (submit) {
      if (limit === 0) fail(403, "plan", "باقتك مش بتشمل منتجات في السوق / your plan does not include marketplace products", { need: planNeed() });
      if (!m.factory_ref) fail(409, "link_required", "اربط حسابك بملف شركتك الأول / link your company listing first");
      for (const k of ["name", "category"]) if (isEmpty(d[k])) fail(422, "required", `${k}: مطلوب / required`, { errors: [{ field: k, code: "required", msg: "required" }] });
    }
    if (r.state === "rejected" && !r.live_json) { const used = await mpUsed(env, m.id, id); if (limit !== -1 && used >= limit) fail(429, "limit", `وصلت للحد (${limit} منتج) / you reached your plan's product limit`, { limit, used }); }
    const ns = submit ? "pending" : "draft";
    await env.DB.prepare("UPDATE cc_member_products SET draft_json = ?, state = ?, submitted_at = CASE WHEN ? = 'pending' THEN ? ELSE submitted_at END, reject_reason = CASE WHEN ? = 'pending' THEN '' ELSE reject_reason END, factory_ref = CASE WHEN ? = 'pending' THEN ? ELSE factory_ref END, updated_at = ? WHERE id = ?")
      .bind(stable(d), ns, ns, t, ns, ns, m.factory_ref || r.factory_ref, t, id).run();
    return { item: await mpOut(env, await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ?").bind(id).first()) };
  }
  fail(405, "method", "method not allowed");
}
/* the listing fields a member may ask to change (§8.4): by plan, and facx rows keep their name (it keys their data) */
function companyAllowed(m, ref) {
  const x = String(ref || "").startsWith("x");
  const a = x ? ["sector", "location", "type", "description", "products", "website", "logo"] : ["name", "sector", "location", "type", "gov", "description", "products", "website", "logo"];
  if (planCanX(m, "video")) a.push("video");
  if (planCanX(m, "social")) a.push("social");
  return a;
}
async function companyValidate(env, m, kind, ref, input) {
  const errors = [], fin = obj(input), out = {};
  const coll = String(ref || "").startsWith("x") ? "facx" : "fac", allowed = kind === "claim" ? ["note"] : companyAllowed(m, kind === "create" ? "" : ref);
  const pick = {};
  for (const [k, x] of Object.entries(fin)) {
    if (!allowed.includes(k)) { errors.push({ field: k, code: k === "name" && coll === "facx" ? "name_locked" : "not_allowed", msg: k === "name" && coll === "facx" ? "اسم الشركة ده ثابت في الدليل — كلّمنا لو محتاج تغييره / this name cannot be changed here" : `${k}: مش متاح في باقتك أو للطلب ده / not available for this request or plan` }); continue; }
    if (k === "note") { const s = neutralM(x); if (clen(s) > 500) errors.push({ field: k, code: "too_long", msg: "note ≤ 500" }); else if (s) out.note = s; continue; }
    if (k === "logo") { if (x === null || x === "") { out.logo = ""; continue; } const r = await ownMedia(env, m, [x], ["logo", "other"]); if (r.err) errors.push({ field: k, code: r.err, msg: r.msg }); else out.logo = publicPath(r.rows[0]); continue; }
    if (x !== null) pick[k] = x;
  }
  const v = await validateFields(env, coll, pick, { add: true, source: "member" });
  errors.push(...v.errors); Object.assign(out, v.out);
  if (kind === "create") for (const k of ["name", "sector", "type", "gov"]) if (isEmpty(out[k])) errors.push({ field: k, code: "required", msg: `${k}: مطلوب / required` });
  if (kind === "edit" && !Object.keys(out).length && !errors.length) errors.push({ field: "fields", code: "required", msg: "مفيش تعديل / nothing to change" });
  return { fields: out, errors };
}
const crOut = r => ({ id: r.id, kind: r.kind, state: r.state, factory_ref: r.factory_ref, fields: jl(r.fields_json, {}), reject_reason: r.reject_reason, reviewed_at: r.reviewed_at, created_at: r.created_at, updated_at: r.updated_at });
async function legacyHint(env, m) {
  if (!m.email_verified_at) return null; // only a mailbox the platform confirmed (never a session of the old-password bridge alone)
  try {
    const lc = await env.DB.prepare("SELECT company, activity, web FROM cc_legacy_companies WHERE email_key = ? ORDER BY updated_at DESC LIMIT 1").bind(emailKey(m.email)).first();
    if (lc) return { company: lc.company || "", activity: lc.activity || "", web: lc.web || "" };
    const meta = await env.DB.prepare("SELECT legacy_profile_json FROM cc_member_meta WHERE member_id = ?").bind(m.id).first("legacy_profile_json");
    const p = obj(jparse(meta || "{}", {})); if (p.act || p.web) return { company: m.company || "", activity: String(p.act || ""), web: String(p.web || "") };
  } catch (e) { /* no tables */ }
  return null;
}
async function meCompany(req, env, ctx, CC, m, url, seg) {
  const M = req.method;
  if (M === "GET" && seg.length === 1) {
    let reqs = []; try { reqs = (await env.DB.prepare("SELECT * FROM cc_company_requests WHERE member_id = ? ORDER BY created_at DESC LIMIT 20").bind(m.id).all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
    const open = reqs.find(r => r.state === "pending");
    return { linked: !!m.factory_ref, factory_ref: m.factory_ref || "", listing: m.factory_ref ? await listingOf(env, m.factory_ref) : null, requests: reqs.map(crOut), open_request: open ? crOut(open) : null,
      allowed: companyAllowed(m, m.factory_ref), can_request: planCanX(m, "listing"), legacy_hint: await legacyHint(env, m) };
  }
  if (!(await rateOk(env, "mecomp|" + m.id, 30, 86400))) fail(429, "rate_limited", "طلبات كتير النهارده — جرّب بكرة / too many requests today");
  if (M === "POST" && seg.length === 1) {
    const b = await body(req), kind = String(b.kind || "");
    if (!["edit", "claim", "create"].includes(kind)) fail(422, "invalid_enum", "kind: edit | claim | create", { errors: [{ field: "kind", code: "invalid_enum", msg: "edit | claim | create" }] });
    if (!planCanX(m, "listing")) fail(403, "plan", "باقتك مش بتشمل ملف الشركة في الدليل / your plan does not include the directory listing", { need: (typeof COMMON.plansWith === "function" ? COMMON.plansWith("listing")[0] : "") || "profile" });
    const open = await env.DB.prepare("SELECT id FROM cc_company_requests WHERE member_id = ? AND state = 'pending' LIMIT 1").bind(m.id).first("id");
    if (open) fail(409, "open_request", "عندك طلب لسه بيتراجع — استنى الرد أو اسحبه / you already have a request under review", { id: open });
    let ref = "";
    if (kind === "edit") { if (!m.factory_ref) fail(409, "link_required", "حسابك مش مربوط بملف في الدليل — اطلب ربطه الأول / link your listing first"); ref = m.factory_ref; }
    else {
      if (m.factory_ref) fail(409, "already_linked", "حسابك مربوط بملف بالفعل — استخدم طلب تعديل / your account is already linked: send an edit request");
      if (kind === "claim") {
        ref = String(b.factory_ref || "").trim();
        if (!FACREF_RX.test(ref) || !(await listingOf(env, ref))) fail(422, "invalid_ref", "الملف ده مش موجود في الدليل / this listing does not exist", { errors: [{ field: "factory_ref", code: "invalid_ref", msg: "unknown listing" }] });
        if (await linkedMember(env, ref, m.id)) fail(409, "claimed", "الملف ده مربوط بحساب تاني — كلّمنا / this listing belongs to another account: contact us");
      }
    }
    const v = await companyValidate(env, m, kind, ref, b.fields);
    if (v.errors.length) fail(422, v.errors[0].code, v.errors[0].msg, { errors: v.errors });
    const id = "cr-" + rid(10), t = now();
    await env.DB.prepare("INSERT INTO cc_company_requests (id, member_id, kind, factory_ref, fields_json, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)").bind(id, m.id, kind, ref, stable(v.fields), t, t).run();
    return [201, { request: crOut(await env.DB.prepare("SELECT * FROM cc_company_requests WHERE id = ?").bind(id).first()) }];
  }
  if (M === "DELETE" && seg[1] === "requests" && seg[2]) {
    const r = CR_ID_RX.test(seg[2]) ? await env.DB.prepare("SELECT * FROM cc_company_requests WHERE id = ? AND member_id = ?").bind(seg[2], m.id).first() : null;
    if (!r) fail(404, "not_found", "مش موجود / not found");
    if (r.state !== "pending") fail(409, "state", "الطلب اتراجع خلاص / the request was already reviewed");
    await env.DB.prepare("UPDATE cc_company_requests SET state = 'withdrawn', updated_at = ? WHERE id = ?").bind(now(), r.id).run();
    return { ok: true };
  }
  fail(405, "method", "method not allowed");
}
/* POST /api/me/media?purpose=product|logo — the member's own upload (pending until an approval makes it public), 10 / hour */
async function meMedia(req, env, m, url) {
  if (req.method !== "POST") fail(405, "method", "method not allowed");
  if (!planCanX(m, "listing") && planLimitX(m, "products") === 0) fail(403, "plan", "رفع الصور متاح لأصحاب الباقات / uploads need a plan with a listing or products", { need: "profile" });
  const purpose = url.searchParams.get("purpose") || "product";
  if (!["product", "logo"].includes(purpose)) fail(400, "invalid_purpose", "purpose: product | logo");
  const len = +req.headers.get("Content-Length") || 0;
  if (len > MAX_MEMBER_UPLOAD) fail(413, "too_large", "الصورة أكبر من 3 ميجا / larger than 3 MB", { limit: MAX_MEMBER_UPLOAD });
  if (!(await rateOk(env, "memedia|" + m.id, 10, 3600))) fail(429, "rate_limited", "رفعت صور كتير — جرّب بعد ساعة / too many uploads, try again in an hour");
  const r = await uploadMedia(env, { owner_type: "member", owner_id: m.id, purpose, body: await req.arrayBuffer(), type: req.headers.get("Content-Type"), name: url.searchParams.get("name") || "" });
  return [r.duplicate ? 200 : 201, { media: { id: r.media.id, url: r.media.url, width: r.media.width, height: r.media.height, bytes: r.media.bytes, status: r.media.status } }];
}
/* handleMeContent(req, env, ctx, CC, member?) — /api/me/products*, /api/me/company*, /api/me/media. Authenticates itself (v2 session) unless the
   router passes the signed-in member. Sessions opened by an e-mailed login link may read but not write (403 full_login_required). */
export async function handleMeContent(req, env, ctx, CC, member) {
  env = env || {};
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  try {
    if (!env.DB) fail(503, "store_off", "store not configured");
    const m = member || await authUser(req, env);
    if (!m) fail(401, "unauthorized", "unauthorized");
    const url = new URL(req.url), seg = url.pathname.replace(/^\/api\/me\//, "").replace(/\/+$/, "").split("/").map(s => decodeURIComponent(s));
    if (req.method !== "GET" && req.method !== "HEAD" && isLinkSession(m)) fail(403, "full_login_required", "ادخل بكود على الإيميل عشان تعدّل / sign in with an e-mail code to make changes", { login: "code" });
    let r;
    if (seg[0] === "products") r = await meProducts(req, env, ctx, CC, m, url, seg);
    else if (seg[0] === "company") r = await meCompany(req, env, ctx, CC, m, url, seg);
    else if (seg[0] === "media" && seg.length === 1) r = await meMedia(req, env, m, url);
    else fail(404, "not_found", "not found");
    return Array.isArray(r) ? ccJson(req, env, r[1], r[0]) : ccJson(req, env, r);
  } catch (e) {
    if (e instanceof CE) return fromCE(req, env, e);
    if (noTable(e)) return ccErr(req, env, 503, "store_off", "migration 0006 is not applied");
    console.error("me content error", e && e.message);
    return ccErr(req, env, 500, "server", "server error");
  }
}
/* compat for the router of §3.2 (handleMemberMedia(req, env, ctx, member)) */
export async function handleMemberMedia(req, env, ctx, member) { return handleMeContent(req, env, ctx, null, member); }

/* ============================================ permissions ============================================ */
const OWNER_ONLY = new Set(["content.toggle"]);
function need(adm, p) {
  if (!adm || typeof adm.can !== "function" || !adm.can(p)) fail(403, OWNER_ONLY.has(p) ? "owner_only" : "forbidden", OWNER_ONLY.has(p) ? "للمالك بس / owner only" : "مش مسموح لدورك / not allowed for your role", { need: p });
}
const canAny = (adm, ...ps) => !!adm && typeof adm.can === "function" && ps.some(p => adm.can(p));

/* ============================================ moderation queue /api/admin/cc/approvals* (§3.1.7, §8.4) + desk drafts (§12) ============================================ */
async function memberBrief(env, id) {
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return m ? { id: m.id, email: m.email, company: m.company, name: m.name, plan: effPlan(m), factory_ref: m.factory_ref } : null;
}
const reasonOf = b => { const r = neutral1(b && b.reason); if (clen(r) < 3 || clen(r) > 500) fail(422, "invalid_reason", "اكتب سبب الرفض (3–500 حرف) / a reason of 3–500 characters is required", { errors: [{ field: "reason", code: "invalid_reason", msg: "3–500 characters" }] }); return r; };
const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
async function productItem(env, r) {
  const o = await mpOut(env, r), m = await memberBrief(env, r.member_id);
  return { type: "product", id: r.id, member: m, factory_ref: r.factory_ref, factory_name: await factoryName(env, r.factory_ref), kind: r.live_json ? "update" : "new", submitted_at: r.submitted_at || r.created_at, state: r.state,
    summary: "منتج: " + (o.fields.name || ""), fields: o.fields, current: o.live, images: o.images, reject_reason: r.reject_reason };
}
async function companyItem(env, r) {
  const m = await memberBrief(env, r.member_id), fields = jl(r.fields_json, {}), listing = r.factory_ref ? await listingOf(env, r.factory_ref) : null;
  const current = {}; if (listing) for (const k of Object.keys(fields)) if (own(listing, k)) current[k] = listing[k];
  let legacy = []; try { if (m && m.email) legacy = ((await env.DB.prepare("SELECT company, status, factory_ref, suggested_ref FROM cc_legacy_companies WHERE email_key = ? LIMIT 5").bind(emailKey(m.email)).all()).results) || []; } catch (e) { legacy = []; }
  const dom = m && m.email ? String(m.email).split("@")[1].toLowerCase() : "", site2 = hostOf(fields.website || (listing && listing.website) || "");
  return { type: "company", id: r.id, member: m, factory_ref: r.factory_ref, factory_name: listing ? listing.name : "", kind: r.kind, submitted_at: r.created_at, state: r.state,
    summary: (r.kind === "claim" ? "طلب ربط: " : r.kind === "create" ? "شركة جديدة: " : "تعديل: ") + (fields.name || (listing && listing.name) || Object.keys(fields).join("، ")),
    fields, current: r.kind === "create" ? null : current, reject_reason: r.reject_reason, evidence: { same_domain: dom && site2 ? dom === site2 || dom.endsWith("." + site2) : null, legacy, plan: m ? m.plan : "" } };
}
function deskState(r) {
  const p = jl(r.private_json, {});
  if (r.deleted) return p.reject_reason ? "rejected" : "deleted";
  if (r.live_json && !r.live_hidden) return "published";
  if (r.live_json && r.live_hidden) return "hidden";
  return "draft";
}
const DESK = { tenders: "tend", projects: "proj", rfqs: "rfq" }, DESK_NAME = { tend: "tenders", proj: "projects", rfq: "rfqs" };
const DESK_STATE = { published: ["منشور", "Published"], draft: ["بانتظار موافقة الإدارة", "Waiting for admin approval"], hidden: ["مخفي", "Hidden"], rejected: ["مرفوض", "Rejected"], deleted: ["اتحذف", "Deleted"] };
function deskLink(env, coll, ref) {
  if (!ref) return "";
  return site(env) + (coll === "tend" ? "tenders/search/#" : coll === "rfq" ? "rfq/search/#" : "project.html#") + encodeURIComponent(ref);
}
function deskItem(env, r) {
  const d = jl(r.draft_json, {}), p = jl(r.private_json, {}), st = deskState(r), ref = String(d.ref || d.no || d.id || "");
  return { id: r.id, ref, collection: DESK_NAME[r.coll] || r.coll, coll: r.coll, title: String(d.title || d.name || ""), state: st, state_ar: DESK_STATE[st][0], state_en: DESK_STATE[st][1],
    reject_reason: p.reject_reason || "", source_url: d.source_url || p.source_url || "", created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at, published_at: r.published_at, link: st === "published" ? deskLink(env, r.coll, ref) : "" };
}
async function approvalsList(env, adm, url) {
  const sp = url.searchParams, type = sp.get("type") || "", page = Math.max(0, int(sp.get("page"), 0)), limit = Math.min(200, Math.max(1, int(sp.get("limit"), 50)));
  const st = sp.get("state") || "pending";
  const types = type ? [type] : ["product", "company", "desk"].filter(t => (t === "product" ? canAny(adm, "approvals.products") : t === "company" ? canAny(adm, "approvals.company") : canAny(adm, "content.publish")));
  for (const t of types) { if (!["product", "company", "desk"].includes(t)) fail(400, "invalid_type", "type: product | company | desk"); need(adm, t === "product" ? "approvals.products" : t === "company" ? "approvals.company" : "content.publish"); }
  if (!types.length) fail(403, "forbidden", "مش مسموح لدورك / not allowed for your role", { need: "approvals.products" });
  const take = (page + 1) * limit; let all = [], total = 0;
  try {
    if (types.includes("product")) {
      total += (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_member_products WHERE state = ?").bind(st).first("n")) || 0;
      for (const r of (await env.DB.prepare("SELECT * FROM cc_member_products WHERE state = ? ORDER BY submitted_at, id LIMIT ?").bind(st, take).all()).results || []) all.push(await productItem(env, r));
    }
    if (types.includes("company")) {
      total += (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_company_requests WHERE state = ?").bind(st).first("n")) || 0;
      for (const r of (await env.DB.prepare("SELECT * FROM cc_company_requests WHERE state = ? ORDER BY created_at, id LIMIT ?").bind(st, take).all()).results || []) all.push(await companyItem(env, r));
    }
    if (types.includes("desk")) { const q = await deskQueue(env, { state: st, limit: take }); total += q.total; all.push(...q.items); }
  } catch (e) { if (!noTable(e)) throw e; }
  all.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)) || String(a.id).localeCompare(String(b.id)));
  if (st !== "pending") all.reverse();
  return { items: all.slice(page * limit, page * limit + limit), total, page, limit };
}
/* checks + the approved version of a member product (nothing written) */
async function productPrep(env, id, corr) {
  const r = MP_ID_RX.test(id) ? await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ?").bind(id).first() : null;
  if (!r) fail(404, "not_found", "مش موجود / not found");
  if (r.state !== "pending") fail(409, "state", "المنتج مش بانتظار المراجعة / not waiting for review");
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first();
  if (!m) fail(409, "state", "حساب العضو مش موجود / the member account is gone");
  const c = { ...obj(corr) }, cu = own(c, "company_url") ? c.company_url : undefined; delete c.company_url;
  const v = await mpValidate(env, m, c, c.images !== undefined ? c.images : undefined, { requireAll: false });
  delete c.images;
  if (v.errors.length) fail(422, v.errors[0].code, v.errors[0].msg, { errors: v.errors });
  const d = { ...jl(r.draft_json, {}), ...v.fields }; if (v.imageIds) d.images = v.imageIds;
  for (const k of ["name", "category"]) if (isEmpty(d[k])) fail(422, "required", `${k}: مطلوب / required`, { errors: [{ field: k, code: "required", msg: "required" }] });
  const imgs = []; for (const mid of [].concat(d.images || [])) { const mr = await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(String(mid)).first(); if (mr && mr.status !== "deleted" && mr.status !== "rejected") imgs.push(mr); }
  let company_url = "";
  if (cu !== undefined) { company_url = httpsUrl(cu); if (company_url === null) fail(422, "invalid_url", "company_url: رابط https / an https URL", { errors: [{ field: "company_url", code: "invalid_url", msg: "https URL" }] }); }
  else if (/^c-/.test(r.factory_ref)) { const l = await listingOf(env, r.factory_ref); company_url = (l && l.url) || ""; }
  else { const cur = await getRow(env, "prod", r.id); company_url = (cur && jl(cur.draft_json, {}).company_url) || ""; }
  const paths = imgs.map(publicPath), company_name = (await factoryName(env, r.factory_ref)) || m.company || "";
  const rec = { name: d.name, name_en: d.name_en || "", category: d.category, description: d.description || "", description_en: d.description_en || "", price: d.price || "", image: paths[0] || "", images: paths.length > 1 ? paths : [], company_url, company_ref: FACREF_RX.test(r.factory_ref || "") ? r.factory_ref : "" };
  return { r, m, d, rec, imageIds: imgs.map(x => x.id), company_name };
}
async function productCommit(env, adm, p) {
  const by = actorOf(adm);
  const res = await saveContent(env, { coll: "prod", mode: "upsert", kind: "add", id: p.r.id, fields: p.rec, by, source: "member", member_id: p.m.id, audit: false, allowPendingMedia: true, memberId: p.m.id, company_name: p.company_name });
  await mediaPublic(env, p.imageIds, by);
  return res.row.id;
}
async function productFinal(env, adm, CC, p) {
  const t = now(), dj = stable(p.d);
  await env.DB.prepare("UPDATE cc_member_products SET state = 'approved', draft_json = ?, live_json = ?, reject_reason = '', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(dj, dj, actorOf(adm), t, t, p.r.id).run();
  await mailProductDecision(env, CC, p.m, true, p.d.name, "", p.r.id + "-" + Date.now().toString(36));
}
async function approveCompany(env, adm, CC, id, b) {
  const r = CR_ID_RX.test(id) ? await env.DB.prepare("SELECT * FROM cc_company_requests WHERE id = ?").bind(id).first() : null;
  if (!r) fail(404, "not_found", "مش موجود / not found");
  if (r.state !== "pending") fail(409, "state", "الطلب مش بانتظار المراجعة / not waiting for review");
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first();
  if (!m) fail(409, "state", "حساب العضو مش موجود / the member account is gone");
  const by = actorOf(adm), base = jl(r.fields_json, {}), corr = obj(b.fields);
  const ref = r.factory_ref, coll = String(ref || "").startsWith("x") ? "facx" : "fac";
  const fields = { ...base }; delete fields.note;
  if (Object.keys(corr).length) { const v = await validateFields(env, coll, corr, { add: true, source: "member", adm, allowPending: true, memberId: m.id }); if (v.errors.length) fail(422, v.errors[0].code, v.errors[0].msg, { errors: v.errors }); for (const [k, x] of Object.entries(v.out)) { if (x === null) delete fields[k]; else fields[k] = x; } }
  const logoIds = fields.logo ? [fields.logo] : [];
  let factory_ref = ref, published_v = null, cid = null, newName = "";
  if (r.kind === "claim") {
    const l = await listingOf(env, ref); if (!l) fail(409, "state", "الملف ده مبقاش موجود / the listing no longer exists");
    if (await linkedMember(env, ref, m.id)) fail(409, "claimed", "الملف ده مربوط بحساب تاني / this listing belongs to another account");
    if (m.factory_ref && m.factory_ref !== ref) fail(409, "already_linked", "الحساب مربوط بملف تاني / the account is linked to another listing");
    await audited(adm, "approval.company.approve", id, { factory_ref: m.factory_ref || "" }, { factory_ref: ref, kind: "claim" }, "claim " + l.name, "company_request");
    await env.DB.prepare("UPDATE members SET factory_ref = ?, company = ?, updated_at = ? WHERE id = ?").bind(ref, l.name || m.company, now(), m.id).run();
    newName = l.name;
  } else if (r.kind === "create") {
    if (m.factory_ref) fail(409, "already_linked", "الحساب مربوط بملف بالفعل / the account is already linked");
    for (const k of ["name", "sector", "type", "gov"]) if (isEmpty(fields[k])) fail(422, "required", `${k}: مطلوب / required`, { errors: [{ field: k, code: "required", msg: "required" }] });
    await audited(adm, "approval.company.approve", id, null, { kind: "create", fields }, "create " + fields.name, "company_request");
    const res = await saveContent(env, { coll: "fac", mode: "upsert", kind: "add", fields, by, source: "member", member_id: m.id, audit: false, allowPendingMedia: true, memberId: m.id });
    cid = res.row.id; factory_ref = cid; newName = fields.name;
  } else {
    if (m.factory_ref !== ref) fail(409, "state", "الحساب اتربط بملف تاني من وقت الطلب / the account's listing changed since the request");
    await audited(adm, "approval.company.approve", id, null, { kind: "edit", factory_ref: ref, fields }, "edit " + (fields.name || ref), "company_request");
    if (ref.startsWith("c-")) { const res = await saveContent(env, { coll: "fac", mode: "patch", id: ref, fields, by, source: "member", audit: false, allowPendingMedia: true, memberId: m.id }); cid = res.row.id; }
    else {
      let bk = b.base_key != null ? String(b.base_key) : "";
      if (!bk && coll === "facx") { const f = dirIndex().get(ref); bk = f ? f[0] : ""; }
      if (!bk) fail(422, "base_key_required", "ابعت base_key (مسار رابط الشركة في الدليل) مع الموافقة / send the listing's base_key with the approval", { errors: [{ field: "base_key", code: "base_key_required", msg: "the decoded pathname of MIGOLDFAC[ref][7]" }] });
      if (coll === "facx") delete fields.name;
      const res = await saveContent(env, { coll, mode: "upsert", kind: "base", base_key: bk, fields, private: { ref }, by, source: "member", member_id: m.id, audit: false, allowPendingMedia: true, memberId: m.id });
      cid = res.row.id;
    }
    if (fields.name && coll === "fac") newName = fields.name;
  }
  if (logoIds.length) await mediaPublic(env, logoIds, by);
  if (cid) published_v = (await publishOverlay(env, { by, ids: [cid], CC, reason: "approval" })).v;
  const t = now();
  if (r.kind === "create") await env.DB.prepare("UPDATE members SET factory_ref = ?, company = ?, updated_at = ? WHERE id = ?").bind(factory_ref, newName || m.company, t, m.id).run();
  else if (r.kind === "edit" && newName) await env.DB.prepare("UPDATE members SET company = ?, updated_at = ? WHERE id = ?").bind(newName, t, m.id).run();
  await env.DB.prepare("UPDATE cc_company_requests SET state = 'approved', fields_json = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(stable({ ...base, ...fields }), by, t, t, id).run();
  await mailCompanyDecision(env, CC, m, true, newName || fields.name || (await factoryName(env, factory_ref)) || m.company || "", "", id);
  return { ok: true, factory_ref, published_v, content_id: cid };
}
async function approvalsRoute(req, env, ctx, adm, url, p) {
  const M = req.method, seg = p.split("/").slice(2).map(s => decodeURIComponent(s)), CC = adm.CC || null, by = actorOf(adm);
  if (M === "GET" && !seg.length) return ccJson(req, env, await approvalsList(env, adm, url));
  if (M !== "POST") fail(405, "method", "method not allowed");
  const b = await body(req);
  if (seg[0] === "products" && seg[1] === "approve" && seg.length === 2) {
    need(adm, "approvals.products");
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))] : [];
    if (!ids.length || ids.length > 50) fail(422, "invalid_ids", "ids: 1–50 منتج / 1–50 products", { errors: [{ field: "ids", code: "invalid_ids", msg: "1–50 ids" }] });
    const ok = [], failed = [], contentIds = [];
    for (const id of ids) {
      try { const pr = await productPrep(env, id, null); await audited(adm, "approval.product.approve", id, { state: pr.r.state }, { state: "approved", fields: pr.rec }, "منتج: " + pr.rec.name, "member_product"); contentIds.push(await productCommit(env, adm, pr)); ok.push(pr); }
      catch (e) { if (e instanceof CE && e.code === "audit_failed") throw e; failed.push({ id, code: e instanceof CE ? e.code : "server" }); }
    }
    let published_v = null;
    if (contentIds.length) published_v = (await publishOverlay(env, { by, ids: contentIds, CC, reason: "approval" })).v;
    for (const pr of ok) await productFinal(env, adm, CC, pr);
    return ccJson(req, env, { ok: true, approved: ok.length, failed, published_v });
  }
  const [type, id, act] = seg;
  if (seg.length !== 3 || !["approve", "reject"].includes(act)) fail(404, "not_found", "not found");
  if (type === "product") {
    need(adm, "approvals.products");
    if (act === "approve") {
      const pr = await productPrep(env, id, b.fields);
      await audited(adm, "approval.product.approve", id, { state: pr.r.state }, { state: "approved", fields: pr.rec }, "منتج: " + pr.rec.name, "member_product");
      const cid = await productCommit(env, adm, pr), pv = (await publishOverlay(env, { by, ids: [cid], CC, reason: "approval" })).v;
      await productFinal(env, adm, CC, pr);
      return ccJson(req, env, { ok: true, content_id: cid, published_v: pv });
    }
    const reason = reasonOf(b), r = MP_ID_RX.test(id) ? await env.DB.prepare("SELECT * FROM cc_member_products WHERE id = ?").bind(id).first() : null;
    if (!r) fail(404, "not_found", "مش موجود / not found");
    if (r.state !== "pending") fail(409, "state", "المنتج مش بانتظار المراجعة / not waiting for review");
    await audited(adm, "approval.product.reject", id, { state: r.state }, { state: "rejected", reason }, "رفض منتج", "member_product");
    const t = now();
    await env.DB.prepare("UPDATE cc_member_products SET state = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(reason, by, t, t, id).run();
    await mailProductDecision(env, CC, await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first(), false, jl(r.draft_json, {}).name || "", reason, id + "-" + Date.now().toString(36));
    return ccJson(req, env, { ok: true });
  }
  if (type === "company") {
    need(adm, "approvals.company");
    if (act === "approve") return ccJson(req, env, await approveCompany(env, adm, CC, id, b));
    const reason = reasonOf(b), r = CR_ID_RX.test(id) ? await env.DB.prepare("SELECT * FROM cc_company_requests WHERE id = ?").bind(id).first() : null;
    if (!r) fail(404, "not_found", "مش موجود / not found");
    if (r.state !== "pending") fail(409, "state", "الطلب مش بانتظار المراجعة / not waiting for review");
    await audited(adm, "approval.company.reject", id, { state: r.state }, { state: "rejected", reason }, "رفض طلب شركة", "company_request");
    const t = now();
    await env.DB.prepare("UPDATE cc_company_requests SET state = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(reason, by, t, t, id).run();
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first(), f = jl(r.fields_json, {});
    await mailCompanyDecision(env, CC, m, false, f.name || (await factoryName(env, r.factory_ref)) || (m && m.company) || "", reason, id);
    return ccJson(req, env, { ok: true });
  }
  if (type === "desk") { need(adm, "content.publish"); return ccJson(req, env, await deskReview(env, adm, id, act, b)); }
  fail(404, "not_found", "not found");
}

/* ============================================ front desk (§12.3 — POST /api/team/desk/content, GET /api/team/desk/mine are acc's routes) ============================================ */
const REDACT_RX = /pass|secret|token|api_?key|hmac|server_key/i;
function redact(v, d = 0) {
  if (d > 8 || v == null) return v == null ? null : v;
  if (typeof v === "string") return v.length > 2000 ? v.slice(0, 2000) : v;
  if (Array.isArray(v)) return v.map(x => redact(x, d + 1));
  if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = REDACT_RX.test(k) ? "***" : redact(x, d + 1); return o; }
  return v;
}
async function auditDirect(env, e) {
  try {
    await env.DB.prepare("INSERT INTO cc_audit (at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(now(), String(e.actor_id || ""), String(e.actor_email || ""), String(e.actor_role || ""), e.action, e.target_type || "", String(e.target_id || ""), String(e.summary || "").slice(0, 300), JSON.stringify(redact(e.before === undefined ? null : e.before)), JSON.stringify(redact(e.after === undefined ? null : e.after)), String(e.ip_hash || ""), String(e.req_id || "")).run();
  } catch (x) { fail(500, "audit_failed", "التسجيل ماتحفظش: سجل العمليات مش متاح / not saved: the audit log is unavailable"); }
}
/* deskCreate(env, collection, item, {by, source_url?, document?, audit?, actor_id?, actor_role?, ip_hash?, req_id?, CC?})
     collection: "tenders" | "projects" | "rfqs" (or tend | proj | rfq); item: the overlay fields of §4.4 (tend: type, title, entity, gov, sector, deadline …;
     proj: name, stage, region, city, sector, owner …; rfq: title, details, qty, delivery, deadline, gov, sector, date).
   An official source (opts.source_url / item.source_url: https · or opts.document: an uploaded PUBLIC image /media/u/… or its id) →
   published at once through the overlay; without one → a draft that admins approve in panel.html («الموافقات» → type desk).
   Stores created_by = by, source = "desk"; audits ONCE (opts.audit = acc's adm.audit, else a direct cc_audit row) before anything is written.
   → {ok, id, ref, collection, coll, state: "published"|"draft", published_v, publish_error, warnings, link, item}. Throws CE {status, code, errors}. */
export async function deskCreate(env, collection, item, opts = {}) {
  if (!env || !env.DB) fail(503, "store_off", "store not configured");
  const coll = DESK[collection] || (DESK_NAME[collection] ? collection : null);
  if (!coll) fail(400, "invalid_collection", "collection: tenders | projects | rfqs");
  const by = line(opts.by, 254).toLowerCase();
  if (!isEmail(by)) fail(400, "required", "by: the team member's e-mail is required");
  if (item != null && (typeof item !== "object" || Array.isArray(item))) fail(422, "invalid_value", "item must be an object", { errors: [{ field: "item", code: "invalid_value", msg: "object" }] });
  const fields = { ...obj(item) }, raw = opts.source_url != null && opts.source_url !== "" ? opts.source_url : fields.source_url;
  delete fields.source_url;
  let src = "";
  if (raw != null && raw !== "") { src = httpsUrl(raw); if (src === null) fail(422, "invalid_url", "رابط المصدر لازم يكون https كامل / the source must be a full https URL", { errors: [{ field: "source_url", code: "invalid_url", msg: "https URL" }] }); }
  if (!src && opts.document) {
    const id = mediaIdOf(opts.document), mr = id ? await env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first() : null;
    if (!mr || mr.status !== "public") fail(422, "invalid_image", "المستند المرفوع مش موجود في مكتبة الصور / the uploaded document was not found", { errors: [{ field: "document", code: "invalid_image", msg: "unknown or not public" }] });
    src = site(env).replace(/\/$/, "") + publicPath(mr);
  }
  if (src && coll !== "rfq") fields.source_url = src;
  const priv = {};
  if (coll === "rfq") { // the walk-in client's contact data is admin-only (never compiled, never public)
    if (!fields.date) fields.date = cairoDay();
    for (const k of ["client", "phone", "email", "channel"]) if (own(fields, k)) { if (fields[k] != null && fields[k] !== "") priv[k] = fields[k]; delete fields[k]; }
    if (src) priv.source_url = src;
  }
  const preCommit = async (id, before, after, summary) => {
    const ent = { action: "desk.content", target_type: "content", target_id: id, before: null, after: { ...after, coll, published: !!src }, summary: "مكتب الاستقبال — " + summary };
    if (typeof opts.audit === "function") { try { await opts.audit(ent.action, ent.target_type, ent.target_id, ent.before, ent.after, ent.summary); } catch (e) { fail(500, "audit_failed", "التسجيل ماتحفظش: سجل العمليات مش متاح / not saved: the audit log is unavailable"); } }
    else await auditDirect(env, { ...ent, actor_id: opts.actor_id, actor_email: by, actor_role: opts.actor_role || "data", ip_hash: opts.ip_hash, req_id: opts.req_id });
  };
  const res = await saveContent(env, { coll, mode: "create", kind: "add", fields, private: Object.keys(priv).length ? priv : undefined, by, source: "desk", lenient: [COLLS[coll].src].filter(Boolean), preCommit });
  let state = "draft", published_v = null, publish_error = null;
  if (src) { try { published_v = (await publishOverlay(env, { by, ids: [res.row.id], CC: opts.CC, reason: "desk" })).v; state = "published"; } catch (e) { publish_error = (e && e.code) || "publish_failed"; } }
  const row = await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(res.row.id).first(), it = deskItem(env, row);
  return { ok: true, id: row.id, ref: it.ref, collection: DESK_NAME[coll], coll, state, published_v, publish_error, warnings: res.warnings, link: it.link, item: it };
}
/* deskQueue(env, {state?: "pending"|"approved"|"rejected", page?, limit?}) → {items:[approval item of type "desk"], total} — desk drafts for «الموافقات» */
export async function deskQueue(env, o = {}) {
  const st = o.state || "pending", page = Math.max(0, int(o.page, 0)), limit = Math.min(500, Math.max(1, int(o.limit, 50)));
  const w = st === "pending" ? "deleted = 0 AND live_json = ''" : st === "approved" ? "deleted = 0 AND live_json != ''" : st === "rejected" ? "deleted = 1" : "0";
  try {
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM cc_content WHERE source = 'desk' AND kind = 'add' AND ${w}`).first("n")) || 0, items = [];
    for (const r of (await env.DB.prepare(`SELECT * FROM cc_content WHERE source = 'desk' AND kind = 'add' AND ${w} ORDER BY created_at, id LIMIT ? OFFSET ?`).bind(limit, page * limit).all()).results || []) {
      const it = deskItem(env, r);
      items.push({ type: "desk", id: r.id, coll: r.coll, collection: it.collection, member: null, created_by: r.created_by, factory_ref: "", factory_name: "", kind: it.collection, submitted_at: r.created_at, state: st,
        summary: (r.coll === "tend" ? "مناقصة: " : r.coll === "proj" ? "مشروع: " : "طلب عرض سعر: ") + it.title, fields: jl(r.draft_json, {}), current: null, source_url: it.source_url, reject_reason: it.reject_reason, ref: it.ref });
    }
    return { items, total, page, limit };
  } catch (e) { if (noTable(e)) return { items: [], total: 0, page, limit }; throw e; }
}
/* deskReview(env, adm, id, "approve"|"reject", {fields?, source_url?, reason?}) — an admin decides a desk draft (perm content.publish, checked by the caller):
   approve = corrections + publish (tenders / projects still need their official source: 422 source_required) · reject = reason (3–500) shown in «إدخالاتي» */
export async function deskReview(env, adm, id, act, b = {}) {
  const by = actorOf(adm), CC = (adm && adm.CC) || null;
  const row = await env.DB.prepare("SELECT * FROM cc_content WHERE id = ? AND source = 'desk' AND kind = 'add'").bind(String(id)).first();
  if (!row) fail(404, "not_found", "مش موجود / not found");
  if (row.deleted || row.live_json) fail(409, "state", "الإدخال ده اتراجع خلاص / already reviewed");
  if (act === "reject") {
    const reason = reasonOf(b);
    await audited(adm, "approval.desk.reject", id, { state: "draft" }, { state: "rejected", reason }, "رفض إدخال مكتب الاستقبال", "content");
    await removeContent(env, row, { by, reason });
    return { ok: true, id, state: "rejected" };
  }
  if (act !== "approve") fail(400, "invalid_action", "approve | reject");
  const corr = { ...obj(b.fields) }, priv = {};
  delete corr.source_url;
  if (b.source_url !== undefined || own(obj(b.fields), "source_url")) { const su = b.source_url !== undefined ? b.source_url : b.fields.source_url; if (row.coll === "rfq") priv.source_url = su; else corr.source_url = su; }
  const pre = await publishProblems(env, { ...row, draft_json: stable({ ...jl(row.draft_json, {}), ...(corr.source_url ? { source_url: corr.source_url } : {}) }) });
  if (!Object.keys(corr).length && pre.length) fail(422, pre[0].code, pre[0].msg, { errors: pre });
  if (Object.keys(corr).length || Object.keys(priv).length) await saveContent(env, { coll: row.coll, mode: "patch", id: row.id, fields: corr, private: priv, by, source: "desk", adm, action: "approval.desk.edit" });
  const p = await publishOverlay(env, { by, ids: [row.id], CC, reason: "desk approval", audit: async s => audited(adm, "approval.desk.approve", row.id, { state: "draft" }, { state: "published", v: s.v }, "اعتماد إدخال مكتب الاستقبال", "content") });
  const e = p.edge_ids.length && adm && adm.auth ? await runEdge(env, adm.auth, { contentIds: p.edge_ids }) : { items: [] };
  return { ok: true, id: row.id, state: "published", published_v: p.v, edge: e.items };
}
/* deskMine(env, by, {kind?: "tenders"|"projects"|"rfqs", page?, limit?}) → {items:[deskItem], total, page, limit} — only the rows this e-mail created at the desk */
export async function deskMine(env, by, o = {}) {
  const who = line(by, 254).toLowerCase();
  if (!isEmail(who)) fail(400, "required", "by: the team member's e-mail is required");
  const colls = o.kind ? [DESK[o.kind] || (DESK_NAME[o.kind] ? o.kind : null)] : ["tend", "proj", "rfq"];
  if (colls.includes(null)) fail(400, "invalid_kind", "kind: tenders | projects | rfqs");
  const page = Math.max(0, int(o.page, 0)), limit = Math.min(100, Math.max(1, int(o.limit, 50)));
  if (!env || !env.DB) return { items: [], total: 0, page, limit };
  try {
    const inS = colls.map(() => "?").join(",");
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM cc_content WHERE source = 'desk' AND created_by = ? AND coll IN (${inS})`).bind(who, ...colls).first("n")) || 0;
    const rows = (await env.DB.prepare(`SELECT * FROM cc_content WHERE source = 'desk' AND created_by = ? AND coll IN (${inS}) ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).bind(who, ...colls, limit, page * limit).all()).results || [];
    return { items: rows.map(r => deskItem(env, r)), total, page, limit };
  } catch (e) { if (noTable(e)) return { items: [], total: 0, page, limit }; throw e; }
}

/* ============================================ admin content API /api/admin/cc/content/* (§3.2) ============================================ */
async function publishAndEdge(env, adm, req, o) {
  const p = await publishOverlay(env, { by: actorOf(adm), ids: o.ids, all: o.all, note: o.note, CC: adm.CC || null, reason: o.reason || "",
    audit: async s => audited(adm, "content.publish", s.v, null, { published: s.published, bytes: s.bytes, ids: s.ids, skipped: s.skipped, reason: s.reason }, `نشر ${s.published} تعديل`, "overlay") });
  const e = p.edge_ids.length ? await runEdge(env, req.headers.get("Authorization") || "", { contentIds: p.edge_ids }) : { items: [] };
  let nr = 0; try { nr = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE static_impact = 1 AND published_v = ?").bind(p.v).first("n")) || 0; } catch (x) { nr = 0; }
  return { ok: true, v: p.v, published_v: p.v, bytes: p.bytes, published: p.published, skipped: p.skipped, edge: e.items, needs_rebuild: nr, kv: p.kv, warn: p.warn, visible_within_s: 120 };
}
async function contentList(env, adm, coll, url) {
  const sp = url.searchParams, page = Math.max(0, int(sp.get("page"), 0)), all = sp.get("all") === "1", limit = all ? 5000 : Math.min(200, Math.max(1, int(sp.get("limit"), 50)));
  const where = ["coll = ?"], args = [coll], st = sp.get("state") || "";
  if (["draft", "published", "unpublished"].includes(st)) { where.push("state = ?"); args.push(st); }
  else if (st === "hidden") where.push("hidden = 1 AND deleted = 0");
  else if (st === "deleted") where.push("deleted = 1");
  if (st !== "deleted" && sp.get("deleted") !== "1") where.push("NOT (kind = 'add' AND deleted = 1 AND state = 'published')"); // gone for good
  for (const k of ["source", "kind", "member_id"]) { const v = sp.get(k); if (v) { where.push(k + " = ?"); args.push(v); } }
  if (coll === "news" && sp.get("category") === "procurement") { where.push("(draft_json LIKE ? OR live_json LIKE ?)"); args.push('%"category_ar":"أخبار المشتريات"%', '%"category_ar":"أخبار المشتريات"%'); }
  const q = (sp.get("q") || "").trim().slice(0, 100);
  if (q) { const like = "%" + q.replace(/[\\%_]/g, c => "\\" + c) + "%"; where.push("(id LIKE ? ESCAPE '\\' OR base_key LIKE ? ESCAPE '\\' OR draft_json LIKE ? ESCAPE '\\' OR live_json LIKE ? ESCAPE '\\')"); args.push(like, like, like, like); }
  const w = where.join(" AND ");
  try {
    const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE " + w).bind(...args).first("n")) || 0;
    const rows = (await env.DB.prepare("SELECT * FROM cc_content WHERE " + w + " ORDER BY updated_at DESC, id LIMIT ? OFFSET ?").bind(...args, limit, page * limit).all()).results || [];
    return { items: rows.map(r => rowOut(r, adm)), total, page, limit };
  } catch (e) { if (noTable(e)) return { items: [], total: 0, page, limit, store: false }; throw e; }
}
export async function contentStatus(env, bakedRaw) {
  const baked = /^\d{1,16}$/.test(String(bakedRaw == null ? "" : bakedRaw)) ? +bakedRaw : null;
  const out = { v: 0, at: "", by: "", bytes: 0, limit: OVERLAY_LIMIT, warn: OVERLAY_WARN, enabled: true, drafts: 0, edge: { pending: 0, failed: 0, items: [] }, needs_rebuild: { n: 0, items: [] }, kv: false, baked_v: baked, store: true };
  if (!env || !env.DB) { out.store = false; return out; }
  try {
    const last = await env.DB.prepare("SELECT v, at, by, bytes FROM cc_overlay ORDER BY v DESC LIMIT 1").first();
    if (last) Object.assign(out, { v: +last.v, at: last.at, by: last.by, bytes: last.bytes });
    out.enabled = await overlayEnabled(env);
    out.drafts = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE state != 'published'").first("n")) || 0;
    out.edge.pending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_edge WHERE status = 'pending'").first("n")) || 0;
    out.edge.failed = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_edge WHERE status = 'failed'").first("n")) || 0;
    out.edge.items = ((await env.DB.prepare("SELECT id, content_id, path, action, to_path, status, attempts, error, created_at, updated_at FROM cc_edge WHERE status IN ('pending', 'failed') ORDER BY id DESC LIMIT 50").all()).results) || [];
    const bv = baked == null ? 0 : baked;
    out.needs_rebuild.n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE static_impact = 1 AND published_v > ?").bind(bv).first("n")) || 0;
    const rows = ((await env.DB.prepare("SELECT id, coll, kind, base_key, live_json, live_hidden, deleted, published_v, published_at FROM cc_content WHERE static_impact = 1 AND published_v > ? ORDER BY published_v DESC, id LIMIT 200").bind(bv).all()).results) || [];
    out.needs_rebuild.items = rows.map(r => ({ coll: r.coll, id: r.id, title: titleOf(r.coll, jl(r.live_json, {})) || r.base_key, op: r.deleted ? "delete" : r.live_hidden ? "hide" : r.kind === "add" ? "add" : "edit", published_v: r.published_v, published_at: r.published_at }));
    try { // public settings print on the static pages too (footer, contact page)
      const sr = ((await env.DB.prepare("SELECT k, updated_at FROM cc_settings WHERE scope = 'public' AND updated_at > ? ORDER BY updated_at DESC LIMIT 50").bind(baked == null ? "2026-11-18T00:00:00.000Z" : iso(baked)).all()).results) || [];
      for (const r of sr) out.needs_rebuild.items.push({ coll: "settings", id: r.k, title: r.k, op: "edit", published_v: null, published_at: r.updated_at });
      out.needs_rebuild.n += sr.length;
    } catch (e) { /* no settings table */ }
  } catch (e) { if (noTable(e)) { out.store = false; return out; } throw e; }
  if (env.SEO_KV && typeof env.SEO_KV.getWithMetadata === "function") {
    try { const r = await env.SEO_KV.getWithMetadata(KV_KEY, { type: "text" }); const md = obj(r && r.metadata); out.kv = out.v ? !!(r && r.value) && +md.v === out.v : true; } catch (e) { out.kv = false; }
  }
  return out;
}
async function contentRoute(req, env, ctx, adm, url, p) {
  const M = req.method, seg = p.split("/").slice(2).map(s => decodeURIComponent(s)), head = seg[0] || "";
  const by = actorOf(adm), auth = req.headers.get("Authorization") || "";
  if (head === "schema" && M === "GET") { need(adm, "content.read"); return ccJson(req, env, schemaJson()); }
  if (head === "status" && M === "GET") { need(adm, "content.read"); return ccJson(req, env, await contentStatus(env, url.searchParams.get("baked_v"))); }
  if (head === "counts" && M === "GET") { need(adm, "stats.read"); return ccJson(req, env, await contentCounts(env)); }
  if (head === "overlay" && M === "GET") {
    need(adm, "content.read");
    let row = null; try { row = await env.DB.prepare("SELECT v, at, by, bytes, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first(); } catch (e) { if (!noTable(e)) throw e; }
    return ccJson(req, env, { v: row ? +row.v : 0, at: row ? row.at : "", by: row ? row.by : "", bytes: row ? row.bytes : 0, data: row ? dataOfJs(row.js) : null });
  }
  if (head === "publish" && M === "POST") {
    need(adm, "content.publish");
    const b = await body(req), ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : null;
    if (!(ids && ids.length) && b.all !== true) fail(400, "required", "ids أو all:true مطلوب / ids or all:true required");
    return ccJson(req, env, await publishAndEdge(env, adm, req, { ids: ids || [], all: b.all === true, note: neutral1(b.note).slice(0, 300), reason: "publish" }));
  }
  if (head === "edge-retry" && M === "POST") {
    need(adm, "content.publish");
    const r = await runEdge(env, auth, { retryFailed: true });
    let left = 0; try { left = (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_edge WHERE status IN ('pending', 'failed')").first("n")) || 0; } catch (e) { left = 0; }
    if (r.done || r.failed) await audited(adm, "content.edge_retry", "edge", null, { done: r.done, failed: r.failed }, "edge retry", "overlay");
    return ccJson(req, env, { done: r.done, failed: r.failed, pending: left, items: r.items });
  }
  if (head === "overlay-toggle" && M === "POST") {
    need(adm, "content.toggle");
    const b = await body(req); if (typeof b.enabled !== "boolean") fail(422, "invalid_value", "enabled: true | false", { errors: [{ field: "enabled", code: "invalid_value", msg: "boolean" }] });
    const was = await overlayEnabled(env);
    await audited(adm, "content.toggle", "overlay.enabled", { enabled: was }, { enabled: b.enabled }, b.enabled ? "تشغيل التعديلات المنشورة" : "إيقاف كل التعديلات المنشورة مؤقتاً", "settings");
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES ('overlay.enabled', 'system', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(b.enabled ? "1" : "0", by, now()).run();
    const last = await env.DB.prepare("SELECT v, at, bytes, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first();
    if (last) await kvPutOverlay(env, last.js, +last.v, last.at, last.bytes, b.enabled);
    else if (env.SEO_KV && !b.enabled) { try { await env.SEO_KV.put(KV_KEY, NOOP_JS, { metadata: { v: 0, at: now(), bytes: NOOP_JS.length, enabled: 0 } }); } catch (e) { /* the D1 flag rules */ } }
    OVL_MEMO.delete(memoKey(env)); await purgeOverlayCache(env);
    return ccJson(req, env, { ok: true, enabled: b.enabled });
  }
  const coll = head, C = COLLS[coll];
  if (!C) fail(404, "unknown_collection", "مجموعة غير معروفة / unknown collection");
  const read = () => need(adm, "content.read"), write = () => { need(adm, "content.write"); if (C.perm) need(adm, C.perm); };
  const id = seg[1] || "", act = seg[2] || "";
  if (!id && M === "GET") { read(); return ccJson(req, env, await contentList(env, adm, coll, url)); }
  if (id === "hide" && !act && M === "POST") {
    write(); const b = await body(req); if (b.publish === true) need(adm, "content.publish");
    const res = await saveContent(env, { coll, mode: "upsert", kind: "base", base_key: b.base_key, fields: {}, seo_path: b.seo_path, hidden: true, by, source: "admin", adm, action: "content.hide" });
    const out = { item: rowOut(res.row, adm), edge: [] };
    if (b.publish === true && res.row.state !== "published") Object.assign(out, await publishAndEdge(env, adm, req, { ids: [res.row.id], reason: "hide" }), { item: rowOut(await getRow(env, coll, res.row.id), adm) });
    return ccJson(req, env, out, 201);
  }
  if (!id && M === "POST") {
    write(); const b = await body(req); if (b.publish === true) need(adm, "content.publish");
    const res = await saveContent(env, { coll, mode: "create", base_key: b.base_key, fields: b.fields, private: b.private, seo_path: b.seo_path, status: coll === "rfq" ? b.status : undefined, by, source: "admin", adm, action: "content.create" });
    const out = { item: rowOut(res.row, adm), warnings: res.warnings, edge: [] };
    if (b.publish === true) Object.assign(out, await publishAndEdge(env, adm, req, { ids: [res.row.id], reason: "save" }), { item: rowOut(await getRow(env, coll, res.row.id), adm) });
    return ccJson(req, env, out, 201);
  }
  if (!id) fail(405, "method", "method not allowed");
  const row = await getRow(env, coll, id);
  if (!row) fail(404, "not_found", "مش موجود / not found");
  if (!act && M === "GET") {
    read(); let history = [];
    try { history = ((await env.DB.prepare("SELECT * FROM cc_audit WHERE target_type = 'content' AND target_id = ? ORDER BY id DESC LIMIT 20").bind(id).all()).results) || []; } catch (e) { history = []; }
    return ccJson(req, env, { item: rowOut(row, adm), history });
  }
  if (!act && M === "PATCH") {
    write(); const b = await body(req); if (b.publish === true) need(adm, "content.publish");
    const res = await saveContent(env, { coll, mode: "patch", id, fields: b.fields, private: b.private, seo_path: b.seo_path, status: coll === "rfq" ? b.status : undefined, by, source: row.source, adm, action: coll === "rfq" && b.status ? "content.status" : "content.edit" });
    const out = { item: rowOut(res.row, adm), warnings: res.warnings, edge: [] };
    if (coll === "rfq" && b.status === "closed") { const pr = jl(res.row.private_json, {}); out.closed = true; out.inquiry_ref = pr.inquiry_ref || ""; } // the panel then closes the inquiry (POST /api/admin/cc/orders/:ref/close)
    if (b.publish === true && res.row.state !== "published") Object.assign(out, await publishAndEdge(env, adm, req, { ids: [id], reason: "save" }), { item: rowOut(await getRow(env, coll, id), adm) });
    return ccJson(req, env, out);
  }
  if ((act === "hide" || act === "unhide") && M === "POST") {
    write(); const b = await body(req); if (b.publish === true) need(adm, "content.publish");
    // a removed base row (permanent hide + 301) comes back with «إظهار»; a deleted add is gone (add it again)
    if (row.deleted && !(row.kind === "base" && act === "unhide")) fail(409, "state", row.kind === "add" ? "اتحذف — ضيفه من جديد / deleted: add it again" : "محذوف — مستني النشر / deleted (waiting for the next publish)");
    const res = await saveContent(env, { coll, mode: "patch", id, fields: {}, seo_path: b.seo_path, hidden: act === "hide", undelete: act === "unhide", by, source: row.source, adm, action: "content." + act });
    const out = { item: rowOut(res.row, adm), edge: [] };
    if (b.publish === true && res.row.state !== "published") Object.assign(out, await publishAndEdge(env, adm, req, { ids: [id], reason: act }), { item: rowOut(await getRow(env, coll, id), adm) });
    return ccJson(req, env, out);
  }
  if (act === "discard" && M === "POST") {
    write();
    if (row.kind === "add" && !row.live_json) fail(409, "state", "لسه مااتنشرش — احذفه بدل كده / never published: delete it instead");
    if (row.deleted && row.state === "published") fail(409, "state", row.kind === "add" ? "اتشال من الموقع خلاص / already removed" : "اتشال من الموقع — استخدم «إظهار» / removed: use unhide");
    await audited(adm, "content.discard", id, { draft: jl(row.draft_json, {}), hidden: !!row.hidden, deleted: !!row.deleted }, { draft: jl(row.live_json, {}), hidden: !!row.live_hidden, deleted: false }, "رجوع للنسخة المنشورة");
    if (row.kind === "base" && !row.live_json && !row.live_hidden) { await env.DB.prepare("DELETE FROM cc_content WHERE id = ?").bind(id).run(); return ccJson(req, env, { item: null, removed: true }); }
    await env.DB.prepare("UPDATE cc_content SET draft_json = live_json, hidden = live_hidden, deleted = 0, state = 'published', rev = rev + 1, updated_by = ?, updated_at = ? WHERE id = ?").bind(by, now(), id).run();
    return ccJson(req, env, { item: rowOut(await getRow(env, coll, id), adm) });
  }
  if (!act && M === "DELETE") {
    need(adm, "content.publish"); if (C.perm) need(adm, C.perm);
    const b = await body(req);
    if (!(b.confirm === true || url.searchParams.get("confirm") === "1")) fail(400, "confirm_required", "أكّد الحذف (confirm: true) / confirm the deletion");
    const mode = b.mode === "remove" ? "remove" : "revert";
    await audited(adm, "content.delete", id, { state: row.state, deleted: !!row.deleted, hidden: !!row.hidden }, { deleted: row.kind === "add" || mode === "remove", revert: row.kind === "base" && mode === "revert" }, `${coll}: ${titleOf(coll, jl(row.draft_json, {})) || row.base_key || id}`);
    const result = await removeContent(env, row, { mode, by });
    const out = { ok: true, result, edge: [] };
    if (b.publish === true && result === "pending") Object.assign(out, await publishAndEdge(env, adm, req, { ids: [id], reason: "delete" }));
    return ccJson(req, env, out);
  }
  fail(405, "method", "method not allowed");
}
/* handleContentAdmin(req, env, ctx, adm) — /api/admin/cc/content/*, /api/admin/cc/media*, /api/admin/cc/approvals* (adm from acc's router:
   {member, role, perms, can(p), audit(action, type, id, before, after, summary), CC, …}) */
export async function handleContentAdmin(req, env, ctx, adm) {
  env = env || {};
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  try {
    if (!adm || typeof adm.can !== "function") fail(401, "unauthorized", "unauthorized");
    if (!env.DB) fail(503, "store_off", "store not configured");
    const url = new URL(req.url), p = url.pathname.replace(/^\/api\/admin\/cc/, "").replace(/\/+$/, "") || "/";
    if (p === "/approvals" || p.startsWith("/approvals/")) return await approvalsRoute(req, env, ctx, adm, url, p);
    if (p === "/media" || p.startsWith("/media/")) return await mediaRoute(req, env, ctx, adm, url, p);
    if (p === "/content" || p.startsWith("/content/")) return await contentRoute(req, env, ctx, adm, url, p);
    fail(404, "not_found", "not found");
  } catch (e) {
    if (e instanceof CE) return fromCE(req, env, e);
    if (noTable(e)) return ccErr(req, env, 503, "store_off", "migration 0006 is not applied");
    console.error("content admin error", e && e.message);
    return ccErr(req, env, 500, "server", "server error");
  }
}

/* ============================================ counts (statistics) and cron ============================================ */
/* base counts from worker/src/data.json (the build index) ± the published adds / hides of the live overlay; null = no source (never 0 invented) */
export async function contentCounts(env) {
  const n = DATA.n && typeof DATA.n === "object" ? DATA.n : null, num = x => (x === null || x === undefined || x === "" || !Number.isFinite(+x) ? null : +x);
  const ik = { news: 0, event: 0, award: 0 }; let opp = 0;
  for (const r of DATA.i || []) { if (r[0] === "tender") { if (/^opportunity\.html#et/i.test(String(r[6] || ""))) opp++; } else if (r[0] in ik) ik[r[0]]++; }
  const pick = (k, fb) => (n && num(n[k]) !== null ? num(n[k]) : fb);
  const out = { tenders: (DATA.t || []).length + opp, companies: (DATA.f || []).length, rfqs: (DATA.q || []).length, news: pick("news", ik.news), videos: pick("videos", null), products: pick("products", (DATA.p || []).length),
    offers: (DATA.o || []).length, zones: (DATA.z || []).length, events: pick("events", ik.event), awards: pick("awards", ik.award), projects: pick("projects", null) };
  try {
    const row = env && env.DB ? await env.DB.prepare("SELECT counts_json FROM cc_overlay ORDER BY v DESC LIMIT 1").first() : null;
    if (row && await overlayEnabled(env)) {
      const c = obj(jparse(row.counts_json, {})), d = k => int(obj(c[k]).a, 0) - int(obj(c[k]).h, 0);
      const add = (key, ...cs) => { if (out[key] !== null) out[key] += cs.reduce((s, k) => s + d(k), 0); };
      add("tenders", "tend", "opp"); add("companies", "fac", "facx"); add("rfqs", "rfq"); add("news", "news"); add("videos", "video"); add("products", "prod");
      add("offers", "offer"); add("zones", "zone"); add("events", "event"); add("awards", "award"); add("projects", "proj");
    }
  } catch (e) { /* base counts only */ }
  return out;
}
/* every 15 min (acc's ccCron): expired locks · KV self-heal from D1 · re-publish when the payment readiness changed (CC given) · member uploads
   nobody uses after 7 days → R2 delete. Edge actions need an admin token, so they are only retried from the panel. */
export async function contentCron(env, nowMs = Date.now(), CC = null) {
  const out = { locks: 0, kv: "skip", pay: "skip", orphans: 0 };
  if (!env || !env.DB) return out;
  try { const r = await env.DB.prepare("DELETE FROM cc_locks WHERE k LIKE 'overlay:%' AND until < ?").bind(iso(nowMs)).run(); out.locks = (r.meta && r.meta.changes) || 0; } catch (e) { /* no table */ }
  let last = null; try { last = await env.DB.prepare("SELECT v, at, bytes, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first(); } catch (e) { last = null; }
  if (last && env.SEO_KV && typeof env.SEO_KV.getWithMetadata === "function") {
    try {
      const en = await overlayEnabled(env), r = await env.SEO_KV.getWithMetadata(KV_KEY, { type: "text" }), md = obj(r && r.metadata);
      if (!r || !r.value || +md.v !== +last.v || (md.enabled === 0 ? 0 : 1) !== (en ? 1 : 0)) out.kv = (await kvPutOverlay(env, last.js, +last.v, last.at, last.bytes, en)) ? "healed" : "failed";
      else out.kv = "ok";
    } catch (e) { out.kv = "failed"; }
  }
  // member changes that waited (memberPublish over its limits, or the lock was busy): one publish for all of them
  try {
    const ids = ((await env.DB.prepare(`SELECT id FROM cc_content WHERE ${MEMBER_PENDING} ORDER BY updated_at LIMIT 500`).all()).results || []).map(r => r.id);
    if (ids.length) { const p = await publishOverlay(env, { by: "system:member", ids, CC, reason: "member", strict: false }); out.member = { published: p.published, v: p.v }; last = await env.DB.prepare("SELECT v, at, bytes, js FROM cc_overlay ORDER BY v DESC LIMIT 1").first(); }
  } catch (e) { out.member = { error: String((e && (e.code || e.message)) || e).slice(0, 80) }; }
  if (last && CC && CC.payments && typeof CC.payments.payReady === "function") {
    try {
      const d = dataOfJs(last.js), pr = await CC.payments.payReady(env);
      if (d && (!!(d.pay && d.pay.ready) !== !!(pr && pr.ready) || !!(d.pay && d.pay.manual) !== !!(pr && pr.manual))) { await publishOverlay(env, { by: "system", reason: "payment readiness", CC }); out.pay = "republished"; } else out.pay = "ok";
    } catch (e) { out.pay = "failed"; }
  }
  try {
    const cand = ((await env.DB.prepare("SELECT * FROM cc_media WHERE owner_type = 'member' AND status != 'deleted' AND created_at < ? ORDER BY created_at LIMIT 100").bind(iso(nowMs - 7 * 86400000)).all()).results) || [];
    if (cand.length) {
      const use = await mediaUsage(env), t = iso(nowMs);
      for (const r of cand) {
        if (use.has(r.id)) continue;
        try { if (env.MEDIA) await env.MEDIA.delete(r.r2_key); } catch (e) { continue; }
        await env.DB.prepare("UPDATE cc_media SET status = 'deleted', updated_at = ? WHERE id = ?").bind(t, r.id).run(); out.orphans++;
      }
      forgetMedia(env, cand.map(r => r.id));
    }
  } catch (e) { /* no table */ }
  return out;
}
