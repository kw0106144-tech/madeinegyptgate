/* Admin Control Center (panel.html) — shared primitives for acc.js and the acc-*.js helpers (docs/janna/ACC-CONTRACT.md §0.3–§0.6).
   - HTTP: ccJson / ccErr / ccPreflight answer with CORS ONLY for the site origins (+ env.CC_ORIGINS), Cache-Control no-store, nosniff, Vary.
   - ids (rid), text safety (neutral, URL + contact checks), CSV with the formula guard, paging, IN-chunking (D1: ≤ 100 bound params).
   - roles & permissions (§0.5) and the audit log (§0.6): every admin write leaves one cc_audit row, or nothing changes.
   - "fail open": reads of the 0006 tables return empty results on a database without them; writes answer 503 store_off.
   Allowed imports (§0.2): common.js, auth.js, crypto.js, inquiries.js, candidates.js, meetings.js, whatsapp.js, text.js, data.json. */
import DATA from "./data.json";
import { line, str, now, scalar, isEmail, mail, site } from "./common.js";
import { norm } from "./text.js";
import { cairoToUtc } from "./meetings.js";

/* ---------- HTTP (own CORS rule: never "*", §0.3) ---------- */
export const SITE_ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
export const ccOrigins = env => [...SITE_ORIGINS, ...String((env && env.CC_ORIGINS) || "").split(",").map(s => s.trim()).filter(Boolean)];
export function ccCors(req, env) {
  const o = req && req.headers ? req.headers.get("Origin") : "";
  return o && ccOrigins(env).includes(o) ? { "Access-Control-Allow-Origin": o } : {};
}
const BASE_H = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
export const ccJson = (req, env, body, status = 200, extra) => new Response(JSON.stringify(body), { status, headers: { ...BASE_H, ...ccCors(req, env), ...(extra || {}) } });
export const ccErr = (req, env, status, code, msg, extra) => ccJson(req, env, { error: msg || code, code, ...(extra || {}) }, status);
export function ccPreflight(req, env) {
  const c = ccCors(req, env);
  return new Response(null, { status: 204, headers: { Vary: "Origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    ...(c["Access-Control-Allow-Origin"] ? { ...c, "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "600" } : {}) } });
}
/* thrown inside handlers; the routers turn it into ccErr(status, code, msg, extra) */
export class HttpErr extends Error { constructor(status, code, msg, extra) { super(msg || code); this.status = status; this.code = code; this.extra = extra || undefined; } }
export const fail = (status, code, msg, extra) => { throw new HttpErr(status, code, msg, extra); };
export const errOf = (req, env, e) => ccErr(req, env, e.status || 500, e.code || "server", e.message || "server error", e.extra);
/* body ≤ max (default 64 KB, §0.3): {} for an empty body; 413 / 400 thrown */
export async function body(req, max = 64 * 1024) {
  let t = "";
  try { t = await req.text(); } catch (e) { fail(400, "bad_json", "unreadable body"); }
  if (t.length > max) fail(413, "too_large", "request too large", { max });
  if (!t) return {};
  let o; try { o = JSON.parse(t); } catch (e) { fail(400, "bad_json", "bad json"); }
  if (!o || typeof o !== "object" || Array.isArray(o)) fail(400, "bad_json", "a JSON object is required");
  return o;
}

/* ---------- ids (ACC-CONTRACT §0.3: alphabet of 31 lower-case characters, like inquiries' REF alphabet) ---------- */
export const RID_ALPHA = "23456789abcdefghjkmnpqrstuvwxyz";
export function rid(n) { let s = ""; while (s.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) { if (b < 248 && s.length < n) s += RID_ALPHA[b % 31]; } return s; } // 248 = 8×31: no modulo bias

/* ---------- text safety (§0.4) ---------- */
export const neutral = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "ˋ").trim();
export const txt = (v, max) => neutral(scalar(v)).replace(/\r\n?/g, "\n").slice(0, max).trim();          // multi-line public text
export const txt1 = (v, max) => neutral(scalar(v)).replace(/\s+/g, " ").slice(0, max).trim();            // single-line public text
/* https absolute URL (no credentials / spaces / quotes / angle brackets, ≤ 500) or a same-site media/img path; "" passes (required is the caller's) */
export function urlOk(u) {
  const s = scalar(u);
  if (!s) return true;
  if (s.length > 500 || /[\s"'<>`\\]/.test(s)) return false;
  if (/^https:\/\//i.test(s)) { try { const x = new URL(s); return x.protocol === "https:" && !x.username && !x.password && !!x.hostname; } catch (e) { return false; } }
  if ((/^\/(media\/u|img)\/[A-Za-z0-9/_\-.]+$/.test(s) || /^img\/[A-Za-z0-9/_\-.]+$/.test(s)) && !s.includes("..")) return true;
  return false;
}
export const isHttps = u => { const s = scalar(u); return !!s && /^https:\/\//i.test(s) && urlOk(s); };

/* contact data in public text — the SAME rule as functions/_lib/seo-privacy.js (copied: builders may not import functions/**):
   Egyptian mobiles/landlines in any spelling, numbers after a phone word, wa.me / tel: links, e-mail addresses incl. «[at] [dot]».
   The platform's own published contacts (and env SEO_PUBLIC_CONTACTS) are allowed. */
const PLATFORM_PHONES = ["+20238346757", "+201279188996"], PLATFORM_EMAIL_DOMAINS = ["madeinegyptgate.com"];
const asciiDigits = s => String(s == null ? "" : s).replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf));
export function phoneKey(v) { let d = asciiDigits(v).replace(/\D/g, "").replace(/^00/, ""); if (/^20\d{9,10}$/.test(d)) d = d.slice(2); return d.replace(/^0+/, ""); }
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
const LINK_RX = /(?:wa\.me\/\+?\d{6,}|whatsapp\.com\/send\/?\?phone=\+?\d{6,}|\b(?:tel|sms|callto):\+?[\d\s\-.()]{5,})/gi;
const EMAIL_RX = /[a-z0-9._%+-]+\s*(?:@|＠|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*([a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\})\s*[a-z0-9-]+)+)/gi;
const emailDomain = d => d.toLowerCase().replace(/\s+/g, "").replace(/[([{]dot[)\]}]/g, ".");
function emailAllowed(m, domain, allow) {
  const dom = emailDomain(domain), addr = m.toLowerCase().replace(/\s+/g, "").replace(/[([{]at[)\]}]|＠/g, "@").replace(/[([{]dot[)\]}]/g, ".");
  return allow.emails.has(addr) || [...allow.domains].some(a => dom === a || dom.endsWith("." + a));
}
export function findContacts(text, env) {
  const allow = allowList(env), s = asciiDigits(text), out = [];
  for (const rx of [MOBILE_RX, LAND_RX]) for (const m of s.matchAll(rx)) if (!allow.phones.has(phoneKey(m[0]))) out.push({ kind: "phone", value: m[0].trim() });
  for (const m of s.matchAll(WORD_RX)) if (!allow.phones.has(phoneKey(m[1]))) out.push({ kind: "phone", value: m[1].trim() });
  for (const m of s.matchAll(LINK_RX)) if (!allow.phones.has(phoneKey(m[0]))) out.push({ kind: "phone", value: m[0].trim() });
  for (const m of s.matchAll(EMAIL_RX)) if (!emailAllowed(m[0], m[1], allow)) out.push({ kind: "email", value: m[0].trim() });
  return out;
}
export const hasContact = (v, env) => findContacts(Array.isArray(v) ? v.join(" ") : scalar(v), env).length > 0;
export const CONTACT_MSG = "بيانات التواصل الشخصية مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة / personal phone numbers and e-mail addresses are not published — buyers contact you through the platform";

/* 422 helper: v.err(field, msg) collects, v.done() throws {errors:[{field, msg}]} */
export function validator() {
  const errors = [];
  return { errors, err(field, msg, code) { errors.push({ field, msg, ...(code ? { code } : {}) }); }, done(code = "invalid") { if (errors.length) fail(422, errors.find(e => e.code) ? errors.find(e => e.code).code : code, errors[0].msg, { errors }); } };
}

/* ---------- CSV (§0.3): UTF-8 BOM, \n, every cell quoted, formula guard ---------- */
const csvCell = v => { let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
export const csvText = (cols, rows) => "﻿" + [cols.map(csvCell).join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n") + "\n";
export function csvRes(req, env, section, text, day) {
  return new Response(text, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${section}-${day}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
}

/* ---------- paging & lists ---------- */
export function paging(url, def = 50, max = 200) {
  const page = Math.max(0, Math.min(100000, parseInt(url.searchParams.get("page"), 10) || 0)), limit = Math.min(max, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || def));
  return { page, limit, offset: page * limit };
}
export const likeOf = q => "%" + String(q).replace(/[%_\\]/g, "") + "%";
export const isNoTable = e => /no such table/i.test(String((e && e.message) || e));
export async function all(env, sql, ...args) { try { const { results } = await env.DB.prepare(sql).bind(...args).all(); return results || []; } catch (e) { if (isNoTable(e)) return []; throw e; } }
export async function first(env, sql, ...args) { try { return (await env.DB.prepare(sql).bind(...args).first()) || null; } catch (e) { if (isNoTable(e)) return null; throw e; } }
/* COUNT(*) AS n → number, or null when the table does not exist (a metric without a source is null, never an invented 0) */
export async function countOf(env, sql, ...args) { try { const r = await env.DB.prepare(sql).bind(...args).first(); return r ? Number(r.n || 0) : 0; } catch (e) { if (isNoTable(e)) return null; throw e; } }
/* SELECT … WHERE col IN (…) in chunks of 90 bound values (D1 allows 100 per statement) */
export async function allIn(env, sqlOf, values, ...extra) {
  const out = [], v = [...new Set(values.filter(x => x != null && x !== ""))];
  for (let i = 0; i < v.length; i += 90) { const part = v.slice(i, i + 90); out.push(...await all(env, sqlOf(part.map(() => "?").join(", ")), ...part, ...extra)); }
  return out;
}
const TBL = new WeakMap(); // env.DB → Set of tables known to exist (positive answers only: a dropped table is noticed at once)
export async function hasTable(env, name) {
  if (!env || !env.DB) return false;
  let s = TBL.get(env.DB); if (!s) { s = new Set(); TBL.set(env.DB, s); }
  if (s.has(name)) return true;
  try { await env.DB.prepare(`SELECT 1 AS x FROM ${name} LIMIT 1`).first(); s.add(name); return true; } catch (e) { return false; }
}
export async function needTables(env, ...names) { for (const n of names) if (!(await hasTable(env, n))) fail(503, "store_off", "the Control Center tables are missing — apply migrations/0006_admin_center.sql"); }
/* one D1 transaction; a failing audit insert means NOTHING was written (§0.6) */
export async function batch(env, stmts) {
  try { return await env.DB.batch(stmts); }
  catch (e) {
    const s = String((e && e.message) || e);
    if (/cc_audit/.test(s)) throw new HttpErr(500, "audit_failed", "the audit log could not be written — nothing was changed");
    if (isNoTable(e)) throw new HttpErr(503, "store_off", "the Control Center tables are missing — apply migrations/0006_admin_center.sql");
    throw e;
  }
}
export const jget = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
export const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + "T00:00:00Z")) && new Date(Date.parse(d + "T00:00:00Z")).toISOString().slice(0, 10) === d;
/* the first instant of a Cairo day (00:00 can fall in the spring DST gap → 01:00) and of the day after it, as ISO */
export const dayStartIso = d => { const ms = cairoToUtc(d, "00:00") ?? cairoToUtc(d, "01:00"); return ms == null ? d + "T00:00:00.000Z" : new Date(ms).toISOString(); };
export const dayAfterIso = d => dayStartIso(new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10));
export const maskEmail = e => { const s = String(e || ""), at = s.lastIndexOf("@"); return at < 1 ? "" : s[0] + "•••@" + s.slice(at + 1); };

/* ---------- roles & permissions (§0.5) ---------- */
export const ROLES = ["owner", "admin", "editor", "support", "seo", "data"];
/* §12.1 team roles: seo = the SEO team page only (seo-team.html, /api/seo/*); data = the front desk only (data-desk.html, /api/team/desk/*).
   Neither has any Control Center (/api/admin/cc/*) access; owner/admin can do everything both can. */
/* clean URLs of the deploy-2 build (seo-team.html / data-desk.html 301 there); the Control Center itself is /admin/ (FRONTEND.md) */
export const TEAM_ROLES = { seo: "seo-team/", data: "data-desk/" };
export const CC_PAGE = "admin/";
export const DESK_PERMS = ["desk.inquiry", "desk.member", "desk.content", "desk.mine"];
export const PERMS = ["stats.read", "members.read", "members.write", "members.contact", "members.plan", "members.delete", "customers.read", "customers.write",
  "directory.read", "directory.write", "directory.verify", "directory.link", "legacy.contacts", "approvals.products", "approvals.company",
  "orders.read", "orders.reply", "orders.note", "orders.close", "orders.rfq", "orders.resend", "orders.block", "content.read", "content.write", "content.publish", "content.toggle",
  "media.upload", "media.delete", "plans.read", "plans.write", "plans.sync", "pay.read", "pay.invoice", "pay.mark_paid", "pay.config",
  "email.read", "email.templates", "email.test", "email.config", "settings.read", "settings.write", "seo", "staff.read", "staff.write",
  "audit.read", "audit.export", "reports.read", "reports.export", "wa.read", "bassem.read", "import.run", "keys.manage", "dev.manage",
  "meetings.bassem", "meetings.cap", ...DESK_PERMS];
/* keys.manage = «مفاتيح الخدمات» (respond.io token, Anam key, the WhatsApp live switch — owner decision 2026-11-18): owner only
   dev.manage = «🛠️ المطوّر» (feature switches, deploys + rollback, health, its audit — owner request 2026-11-19, acc-dev.js): owner only
   meetings.bassem = «📞 اجتماعات باسم» (send Bassem into a Meet / Zoom / Teams call of the team, list, cancel — bassem-meetings.js; every
   invite uses paid Anam minutes): owner + admin only — never editor / support, never X-Platform-Key (an invite needs a person)
   meetings.cap = the daily cap of those invites: owner only */
export const OWNER_ONLY = new Set(["members.delete", "content.toggle", "pay.config", "email.config", "audit.export", "import.run", "keys.manage", "dev.manage", "meetings.cap"]);
const ADMIN_P = PERMS.filter(p => !OWNER_ONLY.has(p));
const PERSON_ONLY = ["meetings.bassem"]; // never through X-Platform-Key
/* «مدير محدود» (owner request 2026-11-23): an admin listed here gets every admin permission except the general settings, the team and
   the plans/prices — for the shared rfqs@ team mailbox. The row in cc_staff stays role "admin"; roleOf() answers "manager". */
export const LIMITED_ADMINS = ["rfqs@madeinegyptgate.com"];
const LIMITED_DENY = ["settings.write", "staff.write", "plans.write", "plans.sync"];
export const ROLE_PERMS = {
  owner: PERMS,
  admin: ADMIN_P,
  manager: ADMIN_P.filter(p => !LIMITED_DENY.includes(p)),
  editor: ["stats.read", "directory.read", "directory.write", "approvals.products", "content.read", "content.write", "content.publish", "media.upload", "media.delete", "plans.read", "settings.read", "seo"],
  support: ["stats.read", "members.read", "members.contact", "customers.read", "customers.write", "directory.read", "legacy.contacts", "orders.read", "orders.reply", "orders.note", "orders.close", "orders.rfq",
    "content.read", "plans.read", "pay.read", "settings.read", "wa.read", "bassem.read"],
  seo: ["seo"],
  data: DESK_PERMS,
  platform: ADMIN_P.filter(p => !DESK_PERMS.includes(p) && !PERSON_ONLY.includes(p)), // X-Platform-Key = admin permissions minus every owner-only one (and the desk + Bassem's meeting invites: they need a person)
};
/* the roles an admin (not an owner) may grant or change */
export const ADMIN_GRANTS = ["editor", "support", "seo", "data"];
/* members.role written when a Control Center role is granted, so the existing /api/admin/* console and /api/seo/* keep working */
export const MEMBER_ROLE = { owner: "admin", admin: "admin", editor: "seo", support: "user", seo: "seo", data: "user" };
export const adminList = env => String((env && env.ADMIN_EMAILS) || "").toLowerCase().split(/[\s,;]+/).filter(isEmail);
export const isBootstrap = (env, m) => !!(m && m.email && m.email_verified_at && adminList(env).includes(String(m.email).toLowerCase()));
/* the role of a signed-in member (normative order §0.5); via = "legacy" (old-password bridge session) → none */
export async function roleOf(env, m, via) {
  if (!m || via === "legacy") return null;
  if (isBootstrap(env, m)) return "owner";
  const s = await first(env, "SELECT role FROM cc_staff WHERE member_id = ? AND disabled_at = ''", m.id);
  const lim = LIMITED_ADMINS.includes(String(m.email || "").toLowerCase());
  if (s && ROLES.includes(s.role)) return s.role === "admin" && lim ? "manager" : s.role;
  if (m.role === "admin") return lim ? "manager" : "admin";
  return null;
}
export async function sessionVia(env, m) {
  if (m && m._via === "legacy") return "legacy"; // "lg…" session id (auth.js) — no D1 read
  if (!m || !m._sid_hash) return "code";
  const r = await first(env, "SELECT via FROM cc_session_meta WHERE sid_hash = ?", m._sid_hash);
  return r && r.via === "legacy" ? "legacy" : "code";
}

/* ---------- audit (§0.6) ---------- */
const SECRET_KEY_RX = /pass|secret|token|api_?key|hmac|server_key/i;
export function redact(v, depth = 0) {
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 2000 ? v.slice(0, 2000) : v;
  if (typeof v !== "object" || depth > 8) return null;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => redact(x, depth + 1));
  const o = {}; for (const k of Object.keys(v)) o[k] = SECRET_KEY_RX.test(k) ? "***" : redact(v[k], depth + 1); return o;
}
/* the changed fields only: {before, after, keys} */
export function changed(before, after) {
  const b = {}, a = {};
  for (const k of Object.keys(after || {})) if (JSON.stringify((before || {})[k]) !== JSON.stringify(after[k])) { b[k] = (before || {})[k] === undefined ? null : before[k]; a[k] = after[k]; }
  return { before: b, after: a, keys: Object.keys(a) };
}
const AUDIT_COLS = "at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id";
const auditVals = e => [e.at || now(), line(e.actor_id, 80), line(e.actor_email, 254).toLowerCase(), line(e.actor_role, 20), line(e.action, 60), line(e.target_type, 40), line(e.target_id == null ? "" : String(e.target_id), 160),
  str(e.summary == null ? "" : String(e.summary), 500), JSON.stringify(redact(e.before === undefined ? null : e.before)), JSON.stringify(redact(e.after === undefined ? null : e.after)), line(e.ip_hash, 64), line(e.req_id, 40)];
export function auditStmt(env, e) {
  return env.DB.prepare(`INSERT INTO cc_audit (${AUDIT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditVals(e));
}
/* the same row, written only when `cond` (SQL, ? params in `args`) holds at that point of a batch — the audit of a check-and-write
   statement (INSERT … SELECT … WHERE <invariant>) that may have written nothing (review F4) */
export function auditStmtIf(env, e, cond, args = []) {
  return env.DB.prepare(`INSERT INTO cc_audit (${AUDIT_COLS}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${cond}`).bind(...auditVals(e), ...args);
}
/* one audit row → its id; failure → HttpErr 500 audit_failed (the caller has not written anything yet) */
export async function audit(env, e) {
  try { const r = await auditStmt(env, e).run(); return (r && r.meta && r.meta.last_row_id) || 0; }
  catch (x) { throw new HttpErr(500, "audit_failed", "the audit log could not be written — nothing was changed"); }
}
/* audit-first writes that run in other modules (teamReply, routing, content): the row is written BEFORE the change and completed after */
export async function auditDone(env, id, patch) {
  if (!id) return;
  const sets = [], args = [];
  if (patch.target_id !== undefined) { sets.push("target_id = ?"); args.push(line(String(patch.target_id), 160)); }
  if (patch.after !== undefined) { sets.push("after_json = ?"); args.push(JSON.stringify(redact(patch.after))); }
  if (patch.summary !== undefined) { sets.push("summary = ?"); args.push(str(String(patch.summary), 500)); }
  if (!sets.length) return;
  try { await env.DB.prepare(`UPDATE cc_audit SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run(); } catch (e) { console.error("audit update", e && e.message); }
}
/* actor fields for code paths outside the router (payments' activation, the bridge, cron): by = "provider:paymob" | "system" | member row | {actor_id…} */
export function actorOf(by) {
  if (by && typeof by === "object") {
    if (by.actor_id !== undefined) return { actor_id: by.actor_id, actor_email: by.actor_email || "", actor_role: by.actor_role || "" };
    return { actor_id: by.id || "", actor_email: by.email || "", actor_role: by.role || "" };
  }
  const s = line(by || "system", 80);
  return { actor_id: s, actor_email: isEmail(s) ? s : "", actor_role: s.startsWith("provider:") ? "provider" : s === "platform" ? "platform" : "system" };
}

/* ---------- directory (worker/src/data.json f rows: [name, type, activity, location, products, "company.html#<ref>"]) ---------- */
let DIR = null;
export function dirRow(ref) {
  if (!DIR) { DIR = new Map(); for (const f of DATA.f || []) { const m = /company\.html#(.+)$/.exec(f[5] || ""); if (m) DIR.set(m[1], f); } }
  return DIR.get(String(ref == null ? "" : ref)) || null;
}
export const DIR_REF_RX = /^(\d{1,6}|x\d{1,6}|c-[2-9a-hjkmnp-z]{8})$/;
/* the public name of a directory ref: data.json for "12" / "x3", the content row for an added "c-…" company */
export async function factoryNames(env, refs) {
  const out = new Map(), adds = [];
  for (const r of new Set(refs.filter(Boolean))) { const f = dirRow(r); if (f) out.set(r, f[0]); else if (/^c-/.test(r)) adds.push(r); }
  if (adds.length) for (const row of await allIn(env, ph => `SELECT id, live_json, draft_json FROM cc_content WHERE coll = 'fac' AND id IN (${ph})`, adds)) {
    const f = jget(row.live_json || "", null) || jget(row.draft_json, {}); out.set(row.id, line((f && f.name) || "", 160));
  }
  return out;
}
/* a directory row (data.json) or an added company row exists for this ref */
export async function refExists(env, ref) {
  if (!DIR_REF_RX.test(String(ref || ""))) return false;
  if (dirRow(ref)) return true;
  return /^c-/.test(ref) ? !!(await first(env, "SELECT id FROM cc_content WHERE coll = 'fac' AND id = ? AND deleted = 0", ref)) : false;
}
/* best directory match for a company name (legacy import «suggested_ref»): Dice coefficient over character bigrams of norm(), ≥ 0.8 */
let DIRIX = null;
const bigrams = s => { const t = " " + s + " ", out = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };
function dice(a, b) { let n = 0, sa = 0, sb = 0; for (const v of a.values()) sa += v; for (const v of b.values()) sb += v; for (const [g, v] of a) if (b.has(g)) n += Math.min(v, b.get(g)); return sa + sb ? (2 * n) / (sa + sb) : 0; }
const STOPN = new Set(["شركه", "شركة", "مصنع", "مؤسسه", "مؤسسة", "للصناعات", "لصناعه", "لصناعة", "co", "company", "factory", "ltd", "llc", "group", "and", "&", "ش", "م"]);
const nameToks = s => norm(s).split(" ").filter(w => w.length > 1 && !STOPN.has(w));
export function bestDirMatch(name) {
  const n = norm(name); if (!n) return { ref: "", score: 0 };
  if (!DIRIX) {
    DIRIX = { rows: [], tok: new Map() };
    for (const f of DATA.f || []) {
      const m = /company\.html#(.+)$/.exec(f[5] || ""); if (!m) continue;
      const i = DIRIX.rows.push({ ref: m[1], n: norm(f[0]), bg: null }) - 1;
      for (const t of nameToks(f[0])) { if (!DIRIX.tok.has(t)) DIRIX.tok.set(t, []); DIRIX.tok.get(t).push(i); }
    }
  }
  const cand = new Set(); for (const t of nameToks(name)) for (const i of DIRIX.tok.get(t) || []) cand.add(i);
  let best = { ref: "", score: 0 }; const bq = bigrams(n);
  for (const i of cand) { const r = DIRIX.rows[i]; if (r.n === n) return { ref: r.ref, score: 1 }; if (!r.bg) r.bg = bigrams(r.n); const s = dice(bq, r.bg); if (s > best.score) best = { ref: r.ref, score: Math.round(s * 1000) / 1000 }; }
  return best.score >= 0.8 ? best : { ref: "", score: best.score };
}

/* ---------- e-mails sent by acc (templates of the e-mail center, §6.1) ----------
   Rendered by CC.email.renderTemplate (overrides, on/off) when available, else these defaults (contract §6.1 texts); always sent through
   common.js mail() (footer, PDPL line, unsubscribe when the template has a list). msg.tpl names the template; the id starts with it. */
const FALLBACK = {
  member_invite: { ar: ["حسابك على منصة صنع في مصر جاهز", "أهلاً {{name}}، حساب {{company}} على منصة صنع في مصر جاهز. ادخل بكود على الإيميل من غير باسورد: {{login_url}}"],
    en: ["Your Made in Egypt Gate account is ready", "Hello {{name}}, the account of {{company}} on Made in Egypt Gate is ready. Sign in with a code sent to this e-mail, no password: {{login_url}}"] },
  legacy_login_notice: { ar: ["تنبيه أمان: دخول بالباسورد القديم", "حد دخل على حسابك بالباسورد القديم يوم {{when}}. لو مش انت اضغط هنا وهنقفل الدخول بالباسورد القديم فوراً: {{stop_url}}"],
    en: ["Security notice: sign-in with the old password", "Someone signed in to your account with the old password on {{when}}. If it was not you, click here and we will switch off old-password sign-in at once: {{stop_url}}"] },
  product_approved: { ar: ["اتوافق على منتجك {{product}}", "اتوافق على منتجك «{{product}}» وبقى ظاهر في سوق المنصة: {{url}}"], en: ["Your product {{product}} was approved", "Your product “{{product}}” was approved and is now shown in the marketplace: {{url}}"] },
  product_rejected: { ar: ["ماتوافقش على منتجك {{product}}", "ماتوافقش على منتجك «{{product}}» — السبب: {{reason}}. تقدر تعدّل وتبعت تاني من لوحتك: {{url}}"], en: ["Your product {{product}} was not approved", "Your product “{{product}}” was not approved — reason: {{reason}}. You can edit it and send it again from your dashboard: {{url}}"] },
  company_approved: { ar: ["اتوافق على طلب ملف شركتك", "اتوافق على طلبك الخاص بملف «{{company}}» في دليل المنصة: {{url}}"], en: ["Your company profile request was approved", "Your request for the “{{company}}” listing in the platform directory was approved: {{url}}"] },
  company_rejected: { ar: ["ماتوافقش على طلب ملف شركتك", "ماتوافقش على طلبك الخاص بملف «{{company}}» — السبب: {{reason}}. تقدر تعدّل وتبعت تاني من لوحتك: {{url}}"], en: ["Your company profile request was not approved", "Your request for the “{{company}}” listing was not approved — reason: {{reason}}. You can edit it and send it again from your dashboard: {{url}}"] },
  staff_added: { ar: ["اتضافت في لوحة إدارة منصة صنع في مصر", "اتضافت كـ{{role}} في لوحة إدارة منصة صنع في مصر. ادخل بكود على الإيميل: {{login_url}}"], en: ["You were added to the Made in Egypt Gate admin panel", "You were added as {{role}} to the Made in Egypt Gate admin panel. Sign in with an e-mail code: {{login_url}}"] },
};
const LISTS_OF = { product_approved: "updates", product_rejected: "updates", company_approved: "updates", company_rejected: "updates" };
const fillVars = (s, vars) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : ""));
export function fallbackTpl(key, vars, lang) {
  const f = FALLBACK[key]; if (!f) return null;
  return { subject: fillVars(lang === "en" ? f.en[0] : f.ar[0], vars), ar: fillVars(f.ar[1], vars), en: fillVars(f.en[1], vars), list: LISTS_OF[key] || "", why: "" };
}
export async function sendTpl(env, CC, key, to, vars, { lang = "ar", idTail = "", replyTo } = {}) {
  if (!to || !isEmail(to)) return { sent: false, error: "no valid recipient" };
  let t = null;
  try { if (CC && CC.email && typeof CC.email.renderTemplate === "function") t = await CC.email.renderTemplate(env, key, { lang, vars }); } catch (e) { t = null; }
  if (t && t.enabled === false) return { sent: false, skipped: "template_off" };
  if (!t || !t.subject) t = fallbackTpl(key, vars, lang);
  if (!t) return { sent: false, error: "unknown template" };
  try {
    return await mail(env, { id: key + "-" + (idTail || rid(10)), tpl: key, ...(t.__rendered ? { __rendered: t.__rendered } : {}), to, lang, subject: t.subject, ar: t.ar, en: t.en, list: t.list || undefined, why: t.why || undefined, replyTo });
  } catch (e) { return { sent: false, error: line(e && e.message, 160) }; }
}
/* THE sign-in page of deploy 2 (/login/: e-mail code + the old-password card + staff routing); /login.html stays the owner's OLD system */
export const loginUrl = env => site(env) + "login/";
export const dashUrl = (env, hash) => site(env) + "dashboard.html" + (hash ? "#" + hash : "");
