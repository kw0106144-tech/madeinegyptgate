/* Shared helpers for the interactive platform API (auth, me, inquiries, admin, ev, whatsapp, cron).
   Plans (same keys as data/plan.js): visitor < profile («تسجيل بيانات الشركة فقط» / "data") < basic < premium < partner < strategic.
   The owner's plan matrix (2026-11-18; the Control Center matrix cc_plans is the source of truth, these are the code defaults):
   profile = the company profile in the directory and in search results ONLY (no tenders, RFQs, awards, project / procurement news,
   products, incoming requests or alerts) · basic = Egypt: tenders, RFQs, awards, project news (+ respond, incoming, stats, alerts) ·
   premium = + 3 GCC states the member chooses (members.prefs_json.gcc; none chosen yet = all six, as before) + procurement news +
   priority · partner = + all six GCC states + Africa + Bassem · strategic = every market. Directories are open to everyone. */
import { sendEmail, isEmail, esc, parseFrom, sender, inboundOn } from "./advisor.js";
import { cairoLocal } from "./meetings.js";
import { prepareMail, mailReady } from "./email-center.js"; // e-mail center (ACC-CONTRACT §6): overrides, provider, log

export const PLAN_LV = { visitor: 0, profile: 1, basic: 2, premium: 3, partner: 4, strategic: 5 };
const PLAN_ALIAS = { "": "visitor", none: "visitor", data: "profile", "data-only": "profile", data_only: "profile", core: "partner", "core-partner": "partner" };
export const MARKETS = ["local", "gulf", "africa", "asia", "europe"];
export const PLAN_SCOPE = { visitor: ["local"], profile: [], basic: ["local"], premium: ["local", "gulf"], partner: ["local", "gulf", "africa"], strategic: MARKETS }; // profile: no opportunity market (matrix m_local 0)
export const PLAN_NAME = { visitor: ["زائر", "Visitor"], profile: ["تسجيل بيانات الشركة فقط", "Company data only"], basic: ["الباقة الأساسية", "Basic"], premium: ["الباقة المميزة", "Premium"], partner: ["باقة الشريك الأساسي", "Core Partner"], strategic: ["باقة الشريك الاستراتيجي", "Strategic Partner"] };
export const canonPlan = p => { const k = String(p == null ? "" : p).toLowerCase().trim(); const a = PLAN_ALIAS[k] !== undefined ? PLAN_ALIAS[k] : k; return PLAN_LV[a] !== undefined ? a : "visitor"; };
/* the plan in force right now (an expired plan counts as visitor) */
export function effPlan(m, nowIso = new Date().toISOString()) {
  if (!m) return "visitor";
  if (m.plan_expires && String(m.plan_expires) < nowIso) return "visitor";
  return canonPlan(m.plan);
}
export const planLv = m => PLAN_LV[effPlan(m)];
export const scopeOf = m => PLAN_SCOPE[effPlan(m)] || ["local"];
/* ---------- plan capabilities (Control Center matrix; acc.js calls setPlanCaps at boot — defaults = the original hard-coded rules) ---------- */
let PLAN_CAPS = null;                                  // {plan: {key: number|0|1}} from cc_plans.caps_json
export function setPlanCaps(c) { PLAN_CAPS = c && typeof c === "object" ? c : null; }
const CAP_DEFAULT = { alerts: 2, listing: 1, respond: 2, incoming: 2, stats: 2, priority: 3, featured: 3, procurement: 3, bassem: 4 }; // minimum plan level (alerts from basic, procurement news from premium)
export function planCan(m, cap, nowIso) {              // nowIso: the cron's clock (digest/bassem pass iso(nowMs)), else now
  const p = effPlan(m, nowIso), c = PLAN_CAPS && PLAN_CAPS[p];
  if (p === "visitor") return false;
  if (c && cap in c) return !!c[cap];
  return cap in CAP_DEFAULT ? PLAN_LV[p] >= CAP_DEFAULT[cap] : false;
}
const LIMIT_DEFAULT = { products: { profile: 0, basic: 30, premium: 80, partner: 200, strategic: -1 }, images_per_product: { basic: 1, premium: 1, partner: 1, strategic: 1 } };
export function planLimit(m, key, nowIso) {            // -1 = unlimited, 0 = not available
  const p = effPlan(m, nowIso), c = PLAN_CAPS && PLAN_CAPS[p];
  if (p === "visitor") return 0;
  if (c && typeof c[key] === "number") return c[key];
  return (LIMIT_DEFAULT[key] && LIMIT_DEFAULT[key][p]) || 0;
}
/* plan keys that have a capability — for SQL pre-filters (matching candidates, Bassem's cron); never empty-string-injected */
export const plansWith = cap => Object.keys(PLAN_LV).filter(p => p !== "visitor" && planCan({ plan: p }, cap));

/* ---------- the GCC states of a plan with the Gulf market (owner, 2026-11-18): Premium = Egypt + the 3 GCC states the member picks on the
   registration form; Core Partner / Strategic = all six. Matrix key gcc_pick (built-in, acc-plans.js): how many the member picks, 0 = all six.
   The member's choice lives in members.prefs_json {gcc: ["SA", "AE", "QA"], gcc_src: signup|member|admin|desk|janna, gcc_at: ISO}.
   No valid choice yet («pending»: today's members, old invoices) = all six, as before, plus a prompt to choose (DESIGN Q3). ---------- */
export const GCC = ["SA", "AE", "KW", "QA", "BH", "OM"];
/* the names the messages use (the same as data/plan.js MIGPLAN.GCC) */
const GCC_NAME = { SA: ["السعودية", "Saudi Arabia"], AE: ["الإمارات", "UAE"], KW: ["الكويت", "Kuwait"], QA: ["قطر", "Qatar"], BH: ["البحرين", "Bahrain"], OM: ["عُمان", "Oman"] };
export const gccNames = (codes, en) => (codes || []).filter(c => GCC_NAME[c]).map(c => GCC_NAME[c][en ? 1 : 0]).join(en ? ", " : "، ");
const GCC_RX = [["SA", /السعود|الرياض|جد[ةه]|الدمام|saudi|\bksa\b|riyadh|jeddah|dammam/i], ["AE", /الإمارات|الامارات|دبي|ظبي|الشارق[ةه]|\buae\b|emirates|dubai|dhabi|sharjah/i],
  ["KW", /الكويت|kuwait/i], ["QA", /قطر|الدوح[ةه]|qatar|doha/i], ["BH", /البحرين|المنام[ةه]|bahrain|manama/i], ["OM", /عُمان|عمان|مسقط|\boman|muscat/i]];
const AMMAN = /عمّان|عَمّان|\bamman\b/i, JORDAN = /الأردن|الاردن|jordan/i;
/* a GCC state code from a code or a name («السعودية», "KSA", «عُمان» → OM); "" otherwise — «عمّان» / "Amman" (Jordan) is never Oman,
   «المملكة المتحدة» is not Saudi Arabia */
export function gccCode(s) {
  const t = String(s == null ? "" : s).trim(); if (!t) return "";
  if (GCC.includes(t.toUpperCase())) return t.toUpperCase();
  if (AMMAN.test(t) || (JORDAN.test(t) && /عمان/.test(t))) return "";
  for (const [c, rx] of GCC_RX) if (rx.test(t)) return c;
  return "";
}
/* a list of states (array, or text "SA,AE,QA" / «السعودية والإمارات وقطر» — «و» stays on the word, the names match inside it) → unique
   codes in order; unknown entries are dropped */
export function normGcc(v) {
  const a = Array.isArray(v) ? v : String(v == null ? "" : v).split(/[\s,،;|/]+/), out = [];
  for (const x of a.slice(0, 20)) { const c = gccCode(typeof x === "string" || typeof x === "number" ? String(x) : ""); if (c && !out.includes(c)) out.push(c); }
  return out;
}
/* Arab countries outside the GCC (RFQ country "ARAB"): they keep today's receivers — every plan with the Gulf market (DESIGN Q1) */
const ARAB_RX = /العراق|الأردن|الاردن|لبنان|سوري[اة]|اليمن|فلسطين|عمّان|عَمّان|بغداد|بيروت|دمشق|صنعاء|\b(iraq|jordan|leban|syria|yemen|palestin|amman|baghdad|beirut|damascus|sana'?a)/i;
/* the country of a Gulf-market item: a GCC code, "ARAB" (another Arab country) or "" (unknown) */
export function gulfCountry(s) {
  const t = String(s == null ? "" : s).trim(); if (!t) return "";
  if (/^arab$/i.test(t)) return "ARAB";
  return gccCode(t) || (ARAB_RX.test(t) ? "ARAB" : "");
}
const GCC_PICK_DEFAULT = { premium: 3 };
/* how many GCC states a plan's member picks (matrix gcc_pick, valid 1..5); 0 = the plan covers all six (or has no Gulf market) */
export function gccPick(plan) {
  const c = PLAN_CAPS && PLAN_CAPS[plan], v = c && "gcc_pick" in c ? Number(c.gcc_pick) : GCC_PICK_DEFAULT[plan] || 0;
  return Number.isInteger(v) && v > 0 && v < 6 ? v : 0;
}
/* the member's GCC coverage → {pick, all, chosen, pending, covers}: no Gulf market → nothing; pick 0 → all six; a stored choice of exactly
   `pick` states → those; otherwise pending → all six for now (today's behaviour) */
export function gccOf(m, nowIso) {
  const p = effPlan(m, nowIso);
  if (!(PLAN_SCOPE[p] || []).includes("gulf")) return { pick: 0, all: false, chosen: [], pending: false, covers: [] };
  const pick = gccPick(p);
  if (!pick) return { pick: 0, all: true, chosen: [], pending: false, covers: GCC.slice() };
  const ch = normGcc(prefsOf(m).gcc);
  return ch.length === pick ? { pick, all: false, chosen: ch, pending: false, covers: ch } : { pick, all: false, chosen: [], pending: true, covers: GCC.slice() };
}
/* does the member's plan cover a Gulf-market item in country cc (a GCC code | "ARAB" | "" unknown)? */
export function gulfCovers(m, cc, nowIso) {
  const g = gccOf(m, nowIso);
  if (!g.all && !g.pick) return false;                    // no Gulf market in the plan
  if (cc === "ARAB") return true;                         // another Arab country: today's receivers (DESIGN Q1)
  if (!GCC.includes(cc)) return g.all || g.pending;       // unknown country: only the plans with all six (or a member who has not chosen yet)
  return g.covers.includes(cc);
}

export const SITE = "https://madeinegyptgate.com/";
export const site = env => { const u = String((env && env.SITE_URL) || SITE); return /^https:\/\/[^\s"<>]+\/$/.test(u) ? u : SITE; };
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "86400" };
export const json = (o, s = 200, h) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...(h || {}) } });
/* errors: {error, code} (API contract) */
export const err = (s, code, error, extra) => json({ error: error || code, code, ...(extra || {}) }, s);
export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const enc = new TextEncoder();
export const now = () => new Date().toISOString();
export const iso = ms => new Date(ms).toISOString();
export const scalar = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
export const str = (v, max) => scalar(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
export const line = (v, max) => str(v, max * 2).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
export const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
export const b64url = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64url = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
export const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
export function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
export const jparse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
export { isEmail, esc, parseFrom, sender, inboundOn };

/* signing secret for platform tokens / links: AUTH_SECRET, else ADVISOR_SECRET (one login for the whole platform) */
export const secretOf = env => (env && (env.AUTH_SECRET || env.ADVISOR_SECRET)) || "";
/* the network a request comes from, for rate limits: an IPv4 address, or the /64 of an IPv6 address (one subscriber line gets a
   whole /64, so per-address IPv6 limits are no limits at all — SEC M1). "::" is expanded; IPv4-mapped IPv6 counts as IPv4. */
export function ipNet(raw) {
  let ip = String(raw || "").split(",")[0].trim().toLowerCase().replace(/^\[|\](:\d+)?$/g, "").replace(/%.*$/, "");
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4 && (!ip.includes(":") || /^(0{0,4}:){0,5}(::)?ffff:/.test(ip) || ip.startsWith("::"))) return v4[1];
  if (!ip.includes(":")) return ip;
  const [h, t] = ip.split("::"), hs = h ? h.split(":") : [], ts = t ? t.split(":") : [];
  const g = t !== undefined ? [...hs, ...Array(Math.max(0, 8 - hs.length - ts.length)).fill("0"), ...ts] : hs;
  return g.slice(0, 4).map(x => (x || "0").replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
/* never store a raw IP: keyed hash of the network (ipNet), truncated */
export async function ipHash(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "";
  return (await sha256((secretOf(env) || env.MEETINGS_SECRET || "mig") + "|ip|" + ipNet(ip))).slice(0, 32);
}
/* rate-limit key for an address: lower case, no +tag (Gmail: no dots). NEVER an identity: on many domains "a+b@x" is a
   different mailbox than "a@x" — ownership checks use sameMailbox() instead. */
export function emailKey(e) {
  const s = line(e, 254).toLowerCase(), at = s.lastIndexOf("@"); if (at < 1) return s;
  let local = s.slice(0, at).split("+")[0], dom = s.slice(at + 1);
  if (dom === "googlemail.com") dom = "gmail.com";
  if (dom === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + dom;
}
const GMAIL = /@(gmail|googlemail)\.com$/;
export const isGmail = e => GMAIL.test(String(e || "").toLowerCase());
/* the same mailbox: identical address, or two Gmail spellings Google itself delivers to one inbox (dots / +tag) */
export function sameMailbox(a, b) {
  a = line(a, 254).toLowerCase(); b = line(b, 254).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return isGmail(a) && isGmail(b) && emailKey(a) === emailKey(b);
}
/* members whose address is the same mailbox as `email` (exact match, plus the Gmail spellings) */
export async function membersByMailbox(env, email, cols = "*") {
  const e = line(email, 254).toLowerCase();
  if (!e) return [];
  const { results } = isGmail(e)
    ? await env.DB.prepare(`SELECT ${cols}, email AS _em FROM members WHERE lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com' LIMIT 5000`).all()
    : await env.DB.prepare(`SELECT ${cols}, email AS _em FROM members WHERE lower(email) = ? LIMIT 50`).bind(e).all();
  return (results || []).filter(m => sameMailbox(m._em, e)).map(m => { const o = { ...m }; delete o._em; return o; });
}

/* ---------- links / impersonation (anti-phishing) ---------- */
const TLD = "com|net|org|info|biz|io|co|me|app|site|online|store|shop|xyz|top|link|click|live|life|ly|eg|sa|ae|kw|qa|om|bh|ru|cn|tk|ml|ga|cf|gq|pw|icu|vip|club|today|support|page|website|tech|cloud|digital|email";
const LINK_RX = new RegExp(`\\b(?:https?:\\/\\/|hxxps?:\\/\\/|www\\.)[^\\s<>"']+|\\b[a-z0-9](?:[a-z0-9-]{0,62})(?:\\.[a-z0-9-]{1,63})*\\.(?:${TLD})\\b(?:\\/[^\\s<>"']*)?`, "gi");
export const hasLink = s => { LINK_RX.lastIndex = 0; const r = LINK_RX.test(String(s || "")); LINK_RX.lastIndex = 0; return r; };
/* replace every link that does not point at the platform itself (anonymous buyer text relayed to factories) */
export function stripLinks(s, env) {
  const own = new URL(site(env)).hostname.toLowerCase().replace(/^www\./, "");
  const host = u => u.replace(/^(https?|hxxps?):\/\//i, "").split(/[\/?#:]/)[0].toLowerCase().replace(/^www\./, ""); // exact host: no "madeinegyptgate.com.evil.example"
  return String(s == null ? "" : s).replace(LINK_RX, u => (host(u) === own ? u : "[رابط محذوف / link removed]"));
}
/* names a member may not give itself (buyers see them as the sender of quotes and replies) */
const BRAND_RX = /منص[ةه]\s*صنع\s*في\s*مصر|صنع\s*في\s*مصر\s*[-—–]?\s*(gate|جيت)|made\s*in\s*egypt\s*gate|madeinegypt|بوابة\s*صنع\s*في\s*مصر|(فريق|إدارة|ادارة|قسم\s*\S+)\s+المنص[ةه]|platform\s+(team|support|admin|billing)/i;
export const impersonates = s => BRAND_RX.test(String(s || ""));
export const hasEmailAddr = s => /[^\s@<>()"]+@[^\s@<>()"]+\.[a-z]{2,}/i.test(String(s || ""));

/* ---------- governorates: the site's codes (data/regions.js) → names ---------- */
export const GOV_CODES = { CAI: ["القاهرة", "Cairo"], GIZ: ["الجيزة", "Giza"], ALX: ["الإسكندرية", "Alexandria"], QLB: ["القليوبية", "Qalyubia"], SHR: ["الشرقية", "Sharqia"], DKH: ["الدقهلية", "Dakahlia"], GHR: ["الغربية", "Gharbia"], MNF: ["المنوفية", "Monufia"], BHR: ["البحيرة", "Beheira"], KFS: ["كفر الشيخ", "Kafr El Sheikh"], DMT: ["دمياط", "Damietta"], PTS: ["بورسعيد", "Port Said"], ISM: ["الإسماعيلية", "Ismailia"], SUZ: ["السويس", "Suez"], NSN: ["شمال سيناء", "North Sinai"], JSN: ["جنوب سيناء", "South Sinai"], FYM: ["الفيوم", "Faiyum"], BNS: ["بني سويف", "Beni Suef"], MNY: ["المنيا", "Minya"], AST: ["أسيوط", "Asyut"], SHG: ["سوهاج", "Sohag"], QNA: ["قنا", "Qena"], LXR: ["الأقصر", "Luxor"], ASN: ["أسوان", "Aswan"], BBA: ["البحر الأحمر", "Red Sea"], WAD: ["الوادي الجديد", "New Valley"], MTR: ["مطروح", "Matrouh"] };
export const govName = (v, en) => { const s = line(v, 60), c = GOV_CODES[s.toUpperCase()]; return c ? c[en ? 1 : 0] : s; };
export const LIM_REQ = 64 * 1024;
export async function readJson(req, max = LIM_REQ) {
  const t = await req.text();
  if (t.length > max) return { tooLarge: true };
  if (!t) return {};
  try { const o = JSON.parse(t); return o && typeof o === "object" && !Array.isArray(o) ? o : { bad: true }; } catch (e) { return { bad: true }; }
}
export const bodyErr = b => (b.tooLarge ? err(413, "too_large", "request too large") : b.bad ? err(400, "bad_json", "bad json") : null);

/* fixed-window rate limiter in D1 (table rl). Returns true when the call is allowed. One statement (count + read back with RETURNING,
   SQLite ≥ 3.35 — D1 and node:sqlite): one D1 round trip instead of two on every limited call (speed 2026-11-20: knowledge_lookup,
   bassem_recall's memory GET and the session token all wait for it) */
export async function rateOk(env, key, limit, windowSec, nowMs = Date.now()) {
  return (await rateN(env, key, windowSec, nowMs)) <= limit;
}
/* the same counter as rateOk (one statement), returning this request's number in the window (1 = the first) */
export async function rateN(env, key, windowSec, nowMs = Date.now()) {
  const win = Math.floor(nowMs / 1000 / windowSec), k = key + "|" + win;
  const n = await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(k, iso((win + 1) * windowSec * 1000)).first("n");
  return n || 0;
}
/* page analytics helpers (acc-stats.js pageView, guard.js): a coarse browser/os/device family — never the user agent itself — and a
   site path without query or fragment (decoded, NFC, ≤ 200 characters; "" when it is not a path of this site) */
export function uaFamily(ua) {
  const b = /Edg\//.test(ua) ? "edge" : /OPR\/|Opera/.test(ua) ? "opera" : /SamsungBrowser/.test(ua) ? "samsung" : /Firefox\/|FxiOS/.test(ua) ? "firefox" : /Chrome\/|CriOS/.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  const o = /Android/.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) ? "ios" : /Windows/.test(ua) ? "windows" : /Mac OS X|Macintosh/.test(ua) ? "mac" : /Linux|CrOS/.test(ua) ? "linux" : "other";
  return `${b}/${o}/${/Mobi|Android|iPhone|iPad/.test(ua) ? "m" : "d"}`;
}
export function cleanPath(p) {
  let s = typeof p === "string" ? p : "";
  s = s.split(/[?#]/)[0];
  try { s = decodeURIComponent(s); } catch (e) { return ""; }
  s = s.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  if (!s.startsWith("/") || s.startsWith("//")) return "";
  return s.slice(0, 200);
}
/* Anam's webhooks (janna_lookup, platform_item, knowledge_lookup) answer a malformed / limited POST with 200 + a text the model can act on
   (speed 2026-11-20: a 400 reached the model as a bare "HTTP error 400" and it retried blind). Anam then counts the call as a success, so
   each one leaves this log line instead — the path and a code, never the request body */
export const toolSoftError = (path, code) => console.warn("tool-soft-error", path, code);
export async function rateCount(env, key, windowSec, nowMs = Date.now()) {
  const win = Math.floor(nowMs / 1000 / windowSec);
  return (await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(key + "|" + win).first("n")) || 0;
}
export async function isBlocked(env, { email, ip_hash }) {
  const keys = [];
  if (email) keys.push(["email", emailKey(email)]);
  if (ip_hash) keys.push(["ip", ip_hash]);
  for (const [k, v] of keys) if (await env.DB.prepare("SELECT 1 AS x FROM blocks WHERE kind = ? AND value = ?").bind(k, v).first("x")) return true;
  return false;
}
/* optional Cloudflare Turnstile (on when TURNSTILE_SECRET is set). {optional:true}: a missing token is allowed (the
   caller has its own rate limits) but a token that is sent is always checked. */
export async function human(req, env, b, { optional = false } = {}) {
  if (!env.TURNSTILE_SECRET) return null;
  const token = line(b.turnstile || b.turnstile_token, 2048);
  if (!token && optional) return null;
  if (!token) return err(403, "verification_required", "verification required");
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: req.headers.get("CF-Connecting-IP") || undefined }) });
    const j = await r.json();
    return j && j.success === true ? null : err(403, "verification_failed", "verification failed");
  } catch (e) { return err(503, "verification_unavailable", "verification unavailable"); }
}

/* ---------- Egypt time ---------- */
export const cairoDay = (ms = Date.now()) => cairoLocal(ms).date;           // "2026-11-18"
export const cairoHM = (ms = Date.now()) => cairoLocal(ms).time;            // "09:05"
export const cairoDow = (ms = Date.now()) => new Date(cairoDay(ms) + "T12:00:00Z").getUTCDay(); // 0 = Sunday
export const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/* ---------- email ---------- */
export const emailOn = env => !!(env && mailReady(env)); // Control Center key, RESEND_API_KEY or the SEND_EMAIL binding
/* sender = MAIL_FROM «منصة صنع في مصر <noreply@madeinegyptgate.com>» (NOTIFY_FROM may override it for platform emails) */
const platformSender = env => (env && env.NOTIFY_FROM ? parseFrom(env.NOTIFY_FROM, sender(env)) : sender(env));
export const fromAddr = env => platformSender(env).email;
export const fromName = env => platformSender(env).name;
export const team = env => { const t = line((env && env.TEAM_EMAIL) || "", 254); return isEmail(t) ? t : ""; };
/* Reply-To of emails nobody should answer by email (Email Routing is off): NOREPLY_EMAIL, else the sender address itself */
export const noReply = env => { const a = line((env && env.NOREPLY_EMAIL) || "", 254).toLowerCase(); return isEmail(a) ? a : fromAddr(env); };
/* the platform's own mailboxes that get "action needed" notices: TEAM_EMAIL + ADMIN_EMAILS (deduplicated) */
export const adminEmails = env => [...new Set([team(env), ...String((env && env.ADMIN_EMAILS) || "").split(/[\s,;]+/)].map(x => line(x, 254).toLowerCase()).filter(isEmail))];
export const replyDomain = env => line((env && env.REPLY_DOMAIN) || "reply.madeinegyptgate.com", 120).toLowerCase();
export const BRAND = { email: "", name: "منصة صنع في مصر" };

/* unsubscribe links: <site>api/unsub?e=<b64url(email_key)>&l=<list>&s=<hmac> — e-mail lists: digest | updates | incoming | all;
   "whatsapp" = the one-click "stop WhatsApp" link in the consent notice (not an e-mail list) */
export const EMAIL_LISTS = ["digest", "updates", "incoming", "bassem"]; // bassem = Bassem's daily e-mail (WhatsApp fallback)
export const LISTS = [...EMAIL_LISTS, "all", "whatsapp"];
export async function unsubUrl(env, email, list) {
  const e = b64url(enc.encode(emailKey(email)));
  const s = (await hmac(secretOf(env) || "mig", "unsub|" + e + "|" + list)).slice(0, 22);
  return `${site(env)}api/unsub?e=${e}&l=${list}&s=${s}`;
}
export async function unsubscribed(env, email, list) {
  const k = emailKey(email);
  return !!(await env.DB.prepare("SELECT 1 AS x FROM unsubscribes WHERE email_key = ? AND list IN (?, 'all')").bind(k, list).first("x"));
}
function linkify(text, env) {
  const own = [site(env), SITE];
  return esc(text).replace(/(https:\/\/[^\s<]+)/g, u => (own.some(o => u.startsWith(esc(o))) ? `<a href="${u}">${u}</a>` : u)).replace(/\r?\n/g, "<br>");
}
/* bilingual mail: {to, subject, ar, en, lang, list?, replyTo?, id?, why?} — Arabic first unless lang=en; list → unsubscribe footer */
export async function mail(env, m) {
  if (!m.to || !isEmail(m.to)) return { sent: false, error: "no valid recipient" };
  m = await prepareMail(env, m);                       // e-mail center: per-template on/off + subject/intro/outro overrides
  if (m.__skip) return { sent: false, skipped: m.__skip, error: m.__skip };
  if (m.list && await unsubscribed(env, m.to, m.list)) return { sent: false, skipped: "unsubscribed", error: "unsubscribed" };
  const first = m.lang === "en" ? m.en : m.ar, second = m.lang === "en" ? m.ar : m.en;
  let foot = "—\nمنصة صنع في مصر · Made in Egypt Gate · " + site(env);
  if (m.why) foot += "\n" + m.why;
  let headers;
  if (m.list) {
    const u = await unsubUrl(env, m.to, m.list);
    foot += `\nلإيقاف هذا النوع من الرسائل / Unsubscribe: ${u}`;
    headers = { "List-Unsubscribe": `<${u}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  }
  foot += "\nبياناتك محمية وفق قانون حماية البيانات الشخصية المصري 151/2020 · Your data is handled under Egypt's PDPL (Law 151/2020).";
  const text = `${first}\n\n—\n\n${second}\n\n${foot}`;
  const html = `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.8;color:#222"><div dir="${m.lang === "en" ? "ltr" : "rtl"}">${linkify(first, env)}</div><hr style="border:none;border-top:1px solid #ddd;margin:20px 0"><div dir="${m.lang === "en" ? "rtl" : "ltr"}">${linkify(second, env)}</div><div style="color:#777;font-size:12px;margin-top:24px">${linkify(foot, env)}</div></div>`;
  return sendEmail(env, { id: m.id, tpl: m.tpl, list: m.list, from: { email: fromAddr(env), name: m.fromName || fromName(env) }, to: [m.to], replyTo: m.replyTo, subject: line(m.subject, 200), text, html, headers });
}

/* ---------- in-app notifications (A6) — bilingual: {title, body} Arabic + {title_en, body_en} English ---------- */
export async function notify(env, userId, n) {
  if (!userId) return;
  await env.DB.prepare("INSERT INTO notifications (user_id, kind, title, body, url, ref, created_at, title_en, body_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(userId, line(n.kind, 30), line(n.title, 200), str(n.body || "", 1000), line(n.url || "", 500), line(n.ref || "", 120), now(), line(n.title_en || "", 200), str(n.body_en || "", 1000)).run();
}

export const PREF_DEFAULT = { morning_time: "09:00", session_time: "", days: [0, 1, 2, 3, 4, 5, 6], call_today_at: "", pause: false, wa_optin: false, email_digest: true };
export const prefsOf = m => ({ ...PREF_DEFAULT, ...jparse((m && m.prefs_json) || "{}", {}) });
/* days: stored as 0-6 (0 = Sunday, same as cairoDow); the page may send names ("sat", "saturday", «السبت») or numbers */
export const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_AR = [/^(ال)?احد$/, /^(ال)?(اثنين|اتنين)$/, /^(ال)?(ثلاثاء|ثلاثا|تلات|تلاتاء)$/, /^(ال)?(اربعاء|اربع|اربعا)$/, /^(ال)?خميس$/, /^(ال)?جمع[ةه]$/, /^(ال)?سبت$/];
export function dayIndex(x) {
  if (typeof x === "number") return Number.isInteger(x) && x >= 0 && x <= 6 ? x : -1;
  const s = String(x == null ? "" : x).trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  if (/^[0-6]$/.test(s)) return +s;
  const en = DAY_NAMES.indexOf(s.slice(0, 3)); if (en > -1 && /^[a-z]+$/.test(s)) return en;
  return DAY_AR.findIndex(rx => rx.test(s));
}
/* what the API returns as prefs: the stored choices + computed fields (day names, incoming requests on/off, phone check) */
export const prefsOut = m => { const { gcc, gcc_src, gcc_at, gcc_next, ...p } = prefsOf(m), d0 = (Array.isArray(p.days) ? p.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6), days = d0.length ? d0 : [0, 1, 2, 3, 4, 5, 6]; // empty = every day (what the cron does)
  return { ...p, days, day_names: days.map(d => DAY_NAMES[d]), incoming: !(m && m.inbox_paused), wa_verified: !!(m && m.wa_verified_at) }; }; // the GCC choice is not a pref: userOut.gcc
/* the GCC states chosen with an invoice that is not paid yet (members.prefs_json.gcc_next = {gcc, inv: invoice no, at}): they apply only
   when THAT invoice is paid (payments.js runActivation) — until then the plan in force and its states stay as they are */
export function gccNextOf(m) {
  const x = prefsOf(m).gcc_next;
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const g = normGcc(x.gcc), inv = line(x.inv, 40);
  return g.length && inv ? { gcc: g, inv, at: line(x.at, 40) } : null;
}
const ADMIN_LIST = env => String((env && env.ADMIN_EMAILS) || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
export const isAdmin = (env, m) => !!(m && (m.role === "admin" || (m.email && m.email_verified_at && ADMIN_LIST(env).includes(String(m.email).toLowerCase()))));
export function userOut(env, m) {
  const plan = effPlan(m), admin = isAdmin(env, m), g = gccOf(m), nx = gccNextOf(m);
  return { id: m.id, email: m.email, name: m.name || "", title: m.title || "", company: m.company || "", phone: m.phone || "", sector: m.sector || "", governorate: m.governorate || "", products: m.products || "",
    plan, plan_name: PLAN_NAME[plan], plan_expires: m.plan_expires || "", markets: PLAN_SCOPE[plan], role: admin ? "admin" : plan === "visitor" ? "visitor" : "member",
    activated_at: m.activated_at || "", verified: !!m.verified, factory_ref: m.factory_ref || "", inbox_paused: !!m.inbox_paused, prefs: prefsOut(m), created_at: m.created_at,
    // markets stays plan-level; gcc = the Premium choice in force (+ next: the states chosen with an unpaid invoice, applied when it is paid)
    company_locked: !!m.factory_ref, gcc: { pick: g.pick, all: g.all, chosen: g.chosen, pending: g.pending, ...(nx ? { next: { gcc: nx.gcc, inv: nx.inv } } : {}) } };
}

/* ---------- unsubscribe lists: turn one list back on without losing the others ---------- */
export async function resubscribe(env, email, list) {
  const k = emailKey(email), t = now();
  const all = await env.DB.prepare("SELECT 1 AS x FROM unsubscribes WHERE email_key = ? AND list = 'all'").bind(k).first("x");
  const stmts = [env.DB.prepare("DELETE FROM unsubscribes WHERE email_key = ? AND list = ?").bind(k, list)];
  if (all) { // "all" stays off for the other lists: split it into the ones not turned back on
    stmts.push(env.DB.prepare("DELETE FROM unsubscribes WHERE email_key = ? AND list = 'all'").bind(k));
    for (const l of EMAIL_LISTS) if (l !== list) stmts.push(env.DB.prepare("INSERT INTO unsubscribes (email_key, list, created_at) VALUES (?, ?, ?) ON CONFLICT(email_key, list) DO NOTHING").bind(k, l, t));
  }
  await env.DB.batch(stmts);
}

/* a tool webhook's POST body, tolerant (2026-11-21: Anam's janna_lookup / knowledge_lookup started arriving with the arguments outside a
   JSON body — every call answered «bad json»): JSON object (its bodyParams / queryParams / pathParams merged in), an empty body, or a
   form-encoded one. → an object, or null when the body is something else. Never logs the body. */
export async function toolBody(req) {
  let t = "";
  try { t = await req.text(); } catch (e) { return null; }
  t = String(t || "").trim();
  if (!t) return {};
  if (t[0] === "{") {
    let o; try { o = JSON.parse(t); } catch (e) { return null; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out = {};
    for (const k of ["queryParams", "pathParams", "bodyParams"]) if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) Object.assign(out, o[k]);
    for (const k of Object.keys(o)) if (!["queryParams", "pathParams", "bodyParams", "headers"].includes(k)) out[k] = o[k];
    return out;
  }
  if (/^[^=&\s]+=/.test(t)) { try { return Object.fromEntries(new URLSearchParams(t)); } catch (e) { return null; } }
  return null;
}
