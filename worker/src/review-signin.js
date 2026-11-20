/* «دخول مراجعي المتاجر» — the App Store / Google Play reviewers' sign-in (app parity plan 2026-11-20, item store-review-signin; owner
   decision «review access», option a). Apple 2.1(a) and Google Play «App access» need a way into a member account; the platform's only
   sign-in is a 6-digit code e-mailed to the member (no passwords). This is ONE deliberate, owner-only, audited, time-limited exception:
     - the owner saves, in «🛠️ المطوّر» (acc-dev.js GET|PUT|DELETE /api/admin/cc/dev/review, dev.manage = owner only, audited dev.review),
       ONE address (a mailbox the team owns) and a 6-digit code he types, for at most REVIEW_MAX_DAYS days. Only an HMAC of the code with
       CONFIG_SECRET is stored (cc_settings k = "dev.review_signin", scope 'system' — flags.js readReview); the code is never shown again;
     - while the switch store_review_signin is on (flags.js, default OFF; locked until the address + code are saved and unexpired) and
       before the expiry, POST /api/auth/request for exactly that address answers ok without sending an e-mail, and POST /api/auth/verify
       accepts that code for exactly that address (constant-time compare; every attempt counts against the address's daily wrong-code
       limit, as an e-mailed code does) — the session is the NORMAL full session of that address's member (issueSession: the format and
       authUser do not change), plus one audit row review.signin;
     - any other address, a wrong code, the switch off or the period over → today's e-mailed-code rules, exactly.
   The owner activates a real plan on that account for the review (no sample data), puts the address and code in the App Review notes and
   Play «App access», and switches it off after the approval. Never a staff account: an address of the platform's admins (ADMIN_EMAILS, the
   admin flag) or of a Control Center team member is refused when it is saved (422 staff_account) and again at the sign-in (staffish). */
import { hmac, safeEq, line, now, iso, isEmail, ipHash, isAdmin, adminEmails } from "./common.js";
import { featureOn, readReview, REVIEW_KEY, REVIEW_MAX_DAYS, forgetFeatures } from "./flags.js";

const TAG = "mig-review|";
const cfgSecret = env => String((env && env.CONFIG_SECRET) || "");
export const REVIEW_CODE_RX = /^\d{6}$/;
/* a code nobody guesses first: 6 digits, not one digit six times, not a straight run up or down (123456, 987654 …) */
export function weakCode(c) {
  c = String(c || "");
  if (!REVIEW_CODE_RX.test(c) || /^(\d)\1{5}$/.test(c)) return true;
  let up = true, down = true;
  for (let i = 1; i < 6; i++) { const d = c.charCodeAt(i) - c.charCodeAt(i - 1); if (d !== 1 && d !== -9) up = false; if (d !== -1 && d !== 9) down = false; }
  return up || down;
}
export async function reviewHash(env, email, code) {
  const s = cfgSecret(env);
  return s ? hmac(s, TAG + String(email || "").toLowerCase() + "|" + String(code || "")) : "";
}
/* the review account in force for EXACTLY this address (switch on, saved, unexpired, CONFIG_SECRET set) → its config, else null */
export async function reviewFor(env, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !cfgSecret(env) || !(await featureOn(env, "store_review_signin"))) return null;
  const r = await readReview(env);
  return r && r.live && r.email === e ? r : null;
}
export async function reviewCodeOk(env, r, email, code) {
  if (!r || !REVIEW_CODE_RX.test(String(code || ""))) return false;
  const h = await reviewHash(env, email, code);
  return !!h && safeEq(h, r.code_hash);
}
/* a staff account (an admin, ADMIN_EMAILS, a Control Center / team role): never opened by the review code */
export async function staffish(env, m) {
  if (!m) return false;
  if (isAdmin(env, { ...m, email_verified_at: m.email_verified_at || "x" })) return true;
  try { return !!(await env.DB.prepare("SELECT 1 AS x FROM cc_staff WHERE member_id = ?").bind(m.id).first()); } catch (e) { return false; }
}
async function staffAddress(env, email) {
  if (adminEmails(env).includes(email)) return true;
  try { if (await env.DB.prepare("SELECT 1 AS x FROM members WHERE lower(email) = ? AND role = 'admin' LIMIT 1").bind(email).first()) return true; } catch (e) { /* no members table: nothing to match */ }
  try { return !!(await env.DB.prepare("SELECT 1 AS x FROM members m JOIN cc_staff s ON s.member_id = m.id WHERE lower(m.email) = ? LIMIT 1").bind(email).first()); } catch (e) { return false; }
}
/* the audit row of a review sign-in (the member it opened, from where) — never the code */
export async function auditReviewSignin(env, req, m, r) {
  try {
    await env.DB.prepare("INSERT INTO cc_audit (at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id) VALUES (?, ?, ?, 'review', 'review.signin', 'member', ?, ?, 'null', ?, ?, '')")
      .bind(now(), line(m.id, 80), line(m.email, 254).toLowerCase(), line(m.id, 160), "store reviewer sign-in (store_review_signin)", JSON.stringify({ until: r.until, plan: m.plan || "" }), line(await ipHash(req, env), 64)).run();
  } catch (e) { console.error("review sign-in: audit row not written", (e && e.message) || "error"); }
}

/* ---------- the owner's settings (acc-dev.js /dev/review) ---------- */
const view = (r, on) => ({ set: !!r, email: r ? r.email : "", until: r ? r.until : "", live: !!(r && r.live), set_by: r ? r.by : "", set_at: r ? r.at : "",
  switch_on: !!on, active: !!(r && r.live && on), max_days: REVIEW_MAX_DAYS, code_rule: "6 digits" });
export async function reviewView(env) { return view(await readReview(env), await featureOn(env, "store_review_signin", { fresh: true })); }
/* PUT {email, code, days} → saved (the code as an HMAC only) · DELETE → removed. `H` = acc-dev.js's helpers (fail, validator, batch, audit) */
export async function reviewSave(env, adm, b, H) {
  const v = H.validator(), email = line(b.email, 254).toLowerCase(), code = String(b.code == null ? "" : b.code).replace(/\s/g, ""), days = Number(b.days);
  if (!isEmail(email)) v.err("email", "إيميل صحيح لصندوق بريد بتاع الفريق / a valid address of a mailbox the team owns", "invalid_email");
  if (!REVIEW_CODE_RX.test(code)) v.err("code", "6 أرقام / 6 digits", "invalid_code");
  else if (weakCode(code)) v.err("code", "كود سهل يتخمّن (رقم واحد مكرر أو أرقام ورا بعض) — اختار كود تاني / too easy to guess (one digit repeated, or a straight run) — choose another", "weak_code");
  if (!Number.isInteger(days) || days < 1 || days > REVIEW_MAX_DAYS) v.err("days", `من 1 لـ ${REVIEW_MAX_DAYS} يوم / 1 to ${REVIEW_MAX_DAYS} days`, "invalid_days");
  if (isEmail(email) && (await staffAddress(env, email))) v.err("email", "ده إيميل حساب من فريق المنصة — استخدم إيميل عضو عادي للمراجعة / this is a platform team account — use an ordinary member's address for the review", "staff_account");
  v.done();
  if (!cfgSecret(env)) H.fail(503, "config_secret_missing", "CONFIG_SECRET مش متسجّل على الـ Worker — الكود مايتحفظش من غيره / CONFIG_SECRET is not set on the Worker — the code cannot be stored without it");
  await H.needTables(env, "cc_settings", "cc_audit");
  const before = await readReview(env), t = now(), until = iso(Date.now() + days * 86400000), by = line((adm && adm.actor && (adm.actor.actor_email || adm.actor.actor_id)) || "owner", 254);
  const val = JSON.stringify({ v: 1, email, code_hash: await reviewHash(env, email, code), until, by, at: t });
  await H.batch(env, [
    env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'system', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET scope = 'system', v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(REVIEW_KEY, val, by, t),
    H.auditStmt(env, { ...adm.actor, action: "dev.review", target_type: "review", target_id: email, before: before ? { email: before.email, until: before.until } : null,
      after: { email, until, days, code: "(new, stored as an HMAC)" }, summary: `store reviewer sign-in saved for ${email} until ${until.slice(0, 10)}`, ip_hash: adm.ipHash, req_id: adm.reqId }),
  ]);
  forgetFeatures(env);
  return { ok: true, ...(await reviewView(env)) };
}
export async function reviewClear(env, adm, H) {
  await H.needTables(env, "cc_settings", "cc_audit");
  const before = await readReview(env);
  if (!before) return { ok: true, unchanged: true, ...(await reviewView(env)) };
  await H.batch(env, [
    env.DB.prepare("DELETE FROM cc_settings WHERE k = ?").bind(REVIEW_KEY),
    H.auditStmt(env, { ...adm.actor, action: "dev.review", target_type: "review", target_id: before.email, before: { email: before.email, until: before.until }, after: null,
      summary: `store reviewer sign-in removed (${before.email})`, ip_hash: adm.ipHash, req_id: adm.reqId }),
  ]);
  forgetFeatures(env);
  return { ok: true, ...(await reviewView(env)) };
}
