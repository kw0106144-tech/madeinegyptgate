/* The OLD PHP system (Hostinger, api/index.php — source not available) stays reachable and untouched (ACC-CONTRACT §3.1.13):
   - handleOldApi: ANY /api/index.php* → the same request to LEGACY_ORIGIN/api/index.php (method, query, headers incl. cookies, body
     streamed through; nothing read, logged or stored), response as is + Cache-Control no-store — exactly mis-egypt's serve().
     Built and tested, NOT routed in deploy 2 (mis-egypt keeps the route).
   - the old-password bridge POST /api/auth/legacy: e-mail + password are checked SERVER-SIDE by the old API (a=login → a=me → a=logout);
     on success the D1 member is upserted (plan by the import rule) and a v2 session (7 days) is issued, marked via="legacy"
     (cc_session_meta + its "lg…" session id) so it never gets a Control Center role. The password is never stored, logged or echoed.
     Review F8 — the old system's word is no proof of the mailbox, so the bridge is only for accounts that came FROM the old system:
     · refused (403 use_email_code, before the old server is contacted) when any account of that mailbox has proven it (email_verified_at),
       or when the account was not imported / created by the bridge (no cc_member_meta.legacy_id, source not import / legacy_login);
     · Turnstile is REQUIRED when TURNSTILE_SECRET is set;
     · the session has the scope of an e-mailed login link (auth.js "lg…" = link scope): read the dashboard, pay invoices, answer routed
       requests — no Bassem, no profile / settings / products / company changes, no Control Center or team boards. */
import { line, now, iso, hex, sha256, hmac, safeEq, isEmail, emailKey, ipHash, rateOk, rateCount, human, secretOf, cairoDay, canonPlan, PLAN_LV, effPlan, userOut, esc, site, isBlocked, membersByMailbox, emailOn } from "./common.js";
import { signSession, findByEmail } from "./auth.js";
import { cairoToUtc } from "./meetings.js";
import { e164 } from "./whatsapp.js";
import { ccJson, ccErr, ccPreflight, fail, body, first, all, needTables, hasTable, batch, auditStmt, actorOf, adminList, sendTpl, maskEmail, jget, dateOk, errOf } from "./acc-base.js";
import { setPlan, metaUpsert, metaOf } from "./acc-members.js";

export const DEFAULT_LEGACY_ORIGIN = "https://mindful-mediumslateblue-okapi-21.hostingersite.com/egypt";
const cleanOrigin = s => String(s || "").trim().replace(/\/+$/, "");
/* proxy: env.LEGACY_ORIGIN or the Hostinger default; "off" → disabled */
export function proxyOrigin(env) { const o = cleanOrigin(env && env.LEGACY_ORIGIN); if (o === "off") return ""; return /^https:\/\/[^\s"'<>]+$/.test(o) ? o : DEFAULT_LEGACY_ORIGIN; }
/* bridge / import: only an explicitly configured https origin (wrangler [vars] LEGACY_ORIGIN, P-W7) */
export function bridgeOrigin(env) { const o = cleanOrigin(env && env.LEGACY_ORIGIN); return o && o !== "off" && /^https:\/\/[^\s"'<>]+$/.test(o) ? o : ""; }
const oldJson = (status, o, extra) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(extra || {}) } });

export async function handleOldApi(req, env, ctx) {
  env = env || {};
  const origin = proxyOrigin(env);
  if (!origin) return oldJson(503, { ok: false, error: "legacy_off" });
  if (env.DB) { try { if (!(await rateOk(env, "oldapi|" + (await ipHash(req, env)), 120, 60))) return oldJson(429, { ok: false, error: "rate_limited" }, { "Retry-After": "60" }); } catch (e) { /* limiter unavailable: pass */ } }
  const url = new URL(req.url), o = new URL(origin + "/api/index.php");
  o.search = url.search;
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const fwd = new Request(o.toString(), { method: req.method, headers: req.headers, body: hasBody ? req.body : undefined, redirect: "manual", ...(hasBody ? { duplex: "half" } : {}) });
  let r;
  try { r = await fetch(fwd, { cf: { cacheTtl: -1 } }); } catch (e) { return oldJson(502, { ok: false, error: "legacy_unreachable" }); }
  const res = new Response(r.body, r);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* ---------- POST /api/auth/legacy ---------- */
const LIM = { netPer15: 10, emailHour: 5, emailDay: 10, failsDay: 5, sessionDays: 7 };
function setCookies(h) {
  const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : (h.get("set-cookie") ? h.get("set-cookie").split(/,(?=\s*[A-Za-z0-9_\-.]+=)/) : []);
  return list.map(c => String(c).split(";")[0].trim()).filter(c => /^[A-Za-z0-9_\-.]+=/.test(c)).join("; ");
}
async function oldCall(origin, action, payload, cookie) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${origin}/api/index.php?a=${action}`, { method: "POST", redirect: "manual", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "MIG-legacy-bridge/1", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(payload || {}) });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, j, cookie: setCookies(r.headers) };
  } finally { clearTimeout(tm); }
}
/* the import rule of §1.5 for one old user row: what the new member gets (never lowers a higher plan already in force) */
export function legacyPlanRule(m, meta, u, nowIso = now()) {
  const plan = canonPlan(u && u.plan), st = String((u && u.status) || "").toLowerCase(), until = line(u && u.plan_until, 10), today = cairoDay(Date.parse(nowIso));
  const out = { legacy: { legacy_status: line(st, 20), legacy_plan: plan === "visitor" ? "" : plan, legacy_plan_until: dateOk(until) ? until : "" } };
  if (plan === "visitor") return out;
  if (meta && meta.status === "suspended") return out; // an admin's suspension is never lifted by the old system's data (review PAY-H3)
  const cur = m ? effPlan(m, nowIso) : "visitor";
  if (st === "active" && (!until || (dateOk(until) && until >= today))) {
    const exp = until ? new Date(cairoToUtc(until, "23:59")).toISOString() : "";
    if (PLAN_LV[cur] > PLAN_LV[plan]) return out; // a higher plan is already in force
    if (cur === plan) { const later = !m.plan_expires || !exp ? "" : (m.plan_expires > exp ? m.plan_expires : exp); if (later !== (m.plan_expires || "")) out.plan = { plan, expires: later }; return out; }
    out.plan = { plan, expires: exp };
  } else if (st === "pending" && cur === "visitor" && (!meta || meta.status !== "suspended")) out.pending = plan;
  return out;
}
const fail401 = () => fail(401, "invalid_credentials", "الإيميل أو الباسورد غلط / wrong e-mail or password");
export async function legacyLogin(req, env, ctx, CC) {
  const b = await body(req, 8192);
  const email = line(b.email, 254).toLowerCase(), password = typeof b.password === "string" ? b.password : "", lang = String(b.lang || "").startsWith("en") ? "en" : "ar";
  if (!isEmail(email)) fail(400, "invalid_email", "a valid e-mail is required");
  if (!password || password.length > 200) fail(400, "invalid_password", "password required (1–200 characters)");
  const origin = bridgeOrigin(env);
  if (!origin) fail(503, "legacy_off", "النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل / the old system is not available — sign in with an e-mail code");
  if (!secretOf(env)) fail(503, "auth_off", "auth not configured");
  // the security notice («مش انت؟» stop link) is part of the bridge's safety: no e-mail provider → no bridge
  if (!emailOn(env)) fail(503, "legacy_off", "النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل / the old-password sign-in is not available — sign in with an e-mail code");
  await needTables(env, "cc_member_meta", "cc_session_meta", "cc_audit");
  const h = await human(req, env, b); if (h) return h; // required whenever TURNSTILE_SECRET is set (review F8)
  const key = emailKey(email), ih = await ipHash(req, env), day = cairoDay();
  if ((await rateCount(env, "lgfail|" + key + "|" + day, 2 * 86400)) >= LIM.failsDay) fail(429, "locked", "محاولات كتير — جرّب بكرة أو ادخل بكود على الإيميل / too many failed attempts today", { retry: "tomorrow" });
  if (!(await rateOk(env, "lgnet|" + ih, LIM.netPer15, 900)) || !(await rateOk(env, "lgem|" + key, LIM.emailHour, 3600)) || !(await rateOk(env, "lgemd|" + key, LIM.emailDay, 86400))) fail(429, "rate_limited", "محاولات كتير — جرّب بعد شوية / too many attempts, try again later");
  // staff never use the bridge — refused BEFORE the old server is contacted
  if (adminList(env).includes(email)) fail(403, "use_email_code", "الحساب ده لازم يدخل بكود على الإيميل / this account signs in with an e-mail code");
  const CODE_ONLY = "الحساب ده لازم يدخل بكود على الإيميل / this account signs in with an e-mail code";
  for (const m of await membersByMailbox(env, email, "id, email, role, email_verified_at")) { // the same mailbox incl. Gmail spellings
    if (m.role === "admin" || m.role === "seo") fail(403, "use_email_code", CODE_ONLY);
    if (await first(env, "SELECT 1 AS x FROM cc_staff WHERE member_id = ? AND disabled_at = ''", m.id)) fail(403, "use_email_code", CODE_ONLY);
    // a mailbox that was proven once (e-mail code / login link) signs in with a code from then on — never on the old system's word
    if (m.email_verified_at) fail(403, "use_email_code", CODE_ONLY);
    const meta = await metaOf(env, m.id); if (meta && meta.legacy_login_off) fail(403, "use_email_code", "الدخول بالباسورد القديم اتقفل للحساب ده — ادخل بكود على الإيميل / old-password sign-in is switched off for this account");
  }
  { // an existing account is reachable through the bridge only when it came from the old system (the import tool or an earlier bridge sign-in)
    const ex = await findByEmail(env, email), exMeta = ex ? await metaOf(env, ex.id) : null;
    if (ex && !(exMeta && (exMeta.legacy_id || ["import", "legacy_login"].includes(exMeta.source)))) fail(403, "use_email_code", CODE_ONLY);
  }
  let login, me;
  try { login = await oldCall(origin, "login", { email, password }); } catch (e) { fail(503, "legacy_off", "النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل / the old system is not reachable"); }
  if (login.status >= 500) fail(503, "legacy_off", "النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل / the old system is not reachable");
  if (!login.j || login.j.ok !== true) { await rateOk(env, "lgfail|" + key + "|" + day, 1000, 2 * 86400); fail401(); }
  try { me = await oldCall(origin, "me", {}, login.cookie); } catch (e) { fail(503, "legacy_off", "the old system is not reachable"); }
  finally { if (login.cookie) { const job = oldCall(origin, "logout", {}, login.cookie).catch(() => null); if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); } }
  if (me.status >= 500) fail(503, "legacy_off", "the old system is not reachable");
  const u = me.j && me.j.ok === true && me.j.user && typeof me.j.user === "object" ? me.j.user : null;
  if (!u) { await rateOk(env, "lgfail|" + key + "|" + day, 1000, 2 * 86400); fail401(); }
  const uEmail = line(u.email || (u.member && u.member.email) || "", 254).toLowerCase();
  if (uEmail !== email) fail(409, "email_mismatch", "the old system answered for another address — sign in with an e-mail code");
  if (await isBlocked(env, { email })) fail(403, "blocked", "this account is blocked");
  // upsert the member (the bridge does NOT prove the mailbox: email_verified_at stays '')
  const t = now();
  let m = await findByEmail(env, email), created = false;
  const company = line(u.company || (u.member && u.member.company) || "", 160), name = line(u.manager || u.name || "", 120), phone = e164(u.tel || u.phone || "");
  if (!m) { const id = "u" + hex(8); created = true; await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, name, phone) VALUES (?, ?, ?, 'visitor', 1, ?, ?, ?, ?)").bind(id, company, email, t, t, name, phone).run(); m = await first(env, "SELECT * FROM members WHERE id = ?", id); }
  else { const fill = {}; if (!m.company && company && !m.factory_ref) fill.company = company; if (!m.name && name) fill.name = name; if (!m.phone && phone) fill.phone = phone;
    const cols = Object.keys(fill); if (cols.length) await env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => fill[c]), t, m.id).run(); }
  const meta = await metaOf(env, m.id), rule = legacyPlanRule(m, meta, u, t);
  const metaSet = { ...rule.legacy, source: meta && meta.source ? meta.source : "legacy_login", legacy_last_login: line(u.last_login || "", 40) || (meta && meta.legacy_last_login) || "" };
  if (u.id != null && !(meta && meta.legacy_id)) { const lid = line(String(u.id), 40); if (lid && !(await first(env, "SELECT 1 AS x FROM cc_member_meta WHERE legacy_id = ? AND member_id != ?", lid, m.id))) metaSet.legacy_id = lid; }
  if (rule.pending) Object.assign(metaSet, { status: "pending", requested_plan: rule.pending });
  if (u.data && typeof u.data === "object") metaSet.legacy_profile_json = JSON.stringify(cleanProfile(u.data)); else if (typeof u.data === "string" && u.data.length < 20000) metaSet.legacy_profile_json = JSON.stringify(cleanProfile(jget(u.data, {})));
  await batch(env, [metaUpsert(env, m.id, metaSet, t), auditStmt(env, { ...actorOf("system"), action: "member.legacy_login", target_type: "member", target_id: m.id, summary: `old-password sign-in ${maskEmail(email)}${created ? " (new account)" : ""}`, after: { created, plan_rule: rule.plan ? rule.plan.plan : rule.pending ? "pending:" + rule.pending : "" }, ip_hash: ih })]);
  if (rule.plan) await setPlan(env, { memberId: m.id, plan: rule.plan.plan, expires: rule.plan.expires, by: "system", reason: "legacy_login" });
  // a v2 session (7 days) marked as a bridge session: "lg…" = the limited scope of an e-mailed login link (auth.js, review F8)
  const sid = "lg" + hex(15), exp = Math.floor(Date.now() / 1000) + LIM.sessionDays * 86400, sh = await sha256(sid);
  await batch(env, [env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sh, m.id, t, iso(exp * 1000)), env.DB.prepare("INSERT INTO cc_session_meta (sid_hash, via, created_at) VALUES (?, 'legacy', ?)").bind(sh, t)]);
  const fresh = await first(env, "SELECT * FROM members WHERE id = ?", m.id);
  const stop = await stopUrl(env, m.id), when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const notice = sendTpl(env, CC, "legacy_login_notice", email, { stop_url: stop, when }, { lang, idTail: m.id + "-" + hex(4) }).catch(e => console.error("legacy notice", e && e.message));
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notice); else await notice;
  return { token: await signSession(secretOf(env), m.id, sid, exp), expires_at: iso(exp * 1000), user: userOut(env, fresh), via: "legacy", scope: "link" };
}
const PROFILE_KEYS = ["addr", "web", "act", "cr", "vat", "video", "cap", "year", "emp", "thick", "x", "l", "i", "yt", "mk"];
export function cleanProfile(d) { const o = {}; if (!d || typeof d !== "object") return o; for (const k of PROFILE_KEYS) if (d[k] != null && (typeof d[k] === "string" || typeof d[k] === "number")) o[k] = line(String(d[k]), 500); return o; }

/* ---------- «مش انت؟» — GET confirm page / POST: every session of that member ends and the bridge is switched off ---------- */
const stopSig = async (env, id) => (await hmac(secretOf(env) || "mig", "lgstop|" + id)).slice(0, 32);
export async function stopUrl(env, id) { return `${site(env)}api/auth/legacy/stop?m=${encodeURIComponent(id)}&s=${await stopSig(env, id)}`; }
const page = (title, inner) => new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;background:#F4F6F5;color:#1d2b22;margin:0;padding:40px 16px}main{max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px -15px rgba(0,0,0,.25)}button{background:#8E0B20;color:#fff;border:0;border-radius:999px;padding:10px 22px;font:inherit;cursor:pointer}p[dir=ltr]{color:#555}</style></head><body><main>${inner}</main></body></html>`,
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
export async function legacyStop(req, env) {
  const url = new URL(req.url), id = line(url.searchParams.get("m"), 40), s = line(url.searchParams.get("s"), 64);
  const ok = !!id && !!s && !!secretOf(env) && safeEq(s, await stopSig(env, id));
  if (!ok || !env.DB) return page("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>");
  if (req.method === "GET") return page("قفل الدخول بالباسورد القديم", `<h2>مش انت اللي دخلت؟</h2><p>لما تأكد، كل الجلسات المفتوحة على حسابك هتتقفل، والدخول بالباسورد القديم هيتقفل نهائياً — وتقدر تدخل بعدها بكود على الإيميل بس.</p><p dir="ltr">Not you? Confirm and every open session ends and old-password sign-in is switched off for good — you can still sign in with an e-mail code.</p><form method="post"><button type="submit">اقفل الدخول بالباسورد القديم / Switch it off</button></form>`);
  if (req.method !== "POST") return page("رابط غير صالح", "<h2>Method not allowed</h2>");
  const m = await first(env, "SELECT id, email FROM members WHERE id = ?", id);
  if (!m) return page("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>");
  const t = now();
  await batch(env, [env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at = ''").bind(t, m.id), metaUpsert(env, m.id, { legacy_login_off: 1 }, t),
    auditStmt(env, { ...actorOf("system"), action: "member.legacy_stop", target_type: "member", target_id: m.id, summary: `old-password sign-in switched off by the account holder (${maskEmail(m.email)})`, after: { legacy_login_off: 1 } })]);
  return page("تم", "<h2>✓ اتقفل الدخول بالباسورد القديم</h2><p>كل الجلسات اتقفلت. ادخل بكود على الإيميل من صفحة الدخول.</p><p dir=\"ltr\">Done — every session ended. Sign in with an e-mail code from the sign-in page.</p>");
}
export async function bridgeReady(env) {
  if (!(bridgeOrigin(env) && env && env.DB && secretOf(env) && emailOn(env))) return false;
  for (const t of ["cc_member_meta", "cc_session_meta", "cc_audit"]) if (!(await hasTable(env, t))) return false;
  return true;
}
export async function handleLegacyAuth(req, env, ctx, CC) {
  env = env || {};
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const path = new URL(req.url).pathname.replace(/^\/api\/auth\/legacy/, "").replace(/\/+$/, "") || "/";
  try {
    // enabled only when every prerequisite is met: LEGACY_ORIGIN (not "off"), the session secret, D1 with the 0006 tables, and an
    // e-mail provider for the security notice — /login/ shows «حساب قديم؟» only then (deploy 2 integration)
    if (path === "/health") return ccJson(req, env, { enabled: await bridgeReady(env) });
    if (path === "/stop") return await legacyStop(req, env);
    if (path !== "/") return ccErr(req, env, 404, "not_found", "not found");
    if (req.method !== "POST") return ccErr(req, env, 405, "method", "method not allowed");
    if (!env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    const out = await legacyLogin(req, env, ctx, CC);
    return out instanceof Response ? out : ccJson(req, env, out);
  } catch (e) {
    if (e && e.status) return errOf(req, env, e);
    console.error("legacy auth", e && e.message); // never the body: it holds the password
    return ccErr(req, env, 500, "server", "server error");
  }
}
export { all };
