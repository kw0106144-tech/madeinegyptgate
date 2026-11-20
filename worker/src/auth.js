/* One login for every plan (owner decision 2): a one-time 6-digit code by email, no passwords.
   POST /api/auth/request {email, lang, turnstile?} → {ok:true}       (same answer whether or not an account exists)
   POST /api/auth/verify  {email, code}              → {token, user, expires_at}
   POST /api/auth/logout  (Bearer)                    → {ok:true}       (revokes this session)
   POST /api/auth/link    {t}                         → {token, user, expires_at}   (signed one-time login link from an email)
   GET  /api/auth/health                              → {ok, store, auth, email, whatsapp, turnstile}
   Login links (every routed-inquiry email to a factory + the 48 h reminder; they work WITHOUT inbound e-mail):
   <site>dashboard.html#lt=<t>&tab=incoming&ref=<REF> — t = l1.<b64url(member id)>.<nonce>.<exp>.<HMAC(secret, lt|id|nonce|exp|email)>,
   7 days, bound to the member AND the address it was mailed to (a changed address voids it), single use (only SHA-256 of the
   nonce is stored: logins row, purpose inq_link). The page exchanges it with POST /api/auth/link and drops it from the URL.
   A link opens a SHORT, LIMITED session (scope "link", 24 h): incoming requests, quotes, replies, notifications — but no Bassem
   (/api/advisor/*), no profile / settings / WhatsApp changes and no admin console (403 full_login_required → sign in with a code).
   Admin accounts never get links. Codes: every attempt is counted before the compare; Turnstile is REQUIRED on /request when
   TURNSTILE_SECRET is set; one global budget of code e-mails per hour (AUTH_CODES_PER_HOUR, default 300).
   Codes: keyed SHA-256 only, bound to the EXACT address they were mailed to, 10 min, 5 wrong attempts burn the code, max 5 codes /
   address / hour and 10 / day, 20 / IP / hour; 15 wrong codes for one address in a day lock it until the next day.
   Accounts: a sign-in reuses an existing row only when the platform verified it (verified = 1) or it was itself created by an
   email-code sign-in — never a row someone else created (e.g. the advisor's test-only open mode).
   Turnstile (TURNSTILE_SECRET): checked on /request when the page sends a token; the login dialog may omit it (rate limits apply).
   Token v2.<b64url(member id)>.<session id>.<exp>.<HMAC(secret, v2|id|sid|exp)> — secret AUTH_SECRET or ADVISOR_SECRET.
   The same token is accepted by /api/advisor/* (Bassem) when the member's plan is partner / strategic (checked on the server).
   App-store reviewers (review-signin.js, «🛠️ المطوّر» store_review_signin, default OFF): while the owner's switch is on and his period runs,
   /request for the ONE review address sends nothing and /verify takes the owner's code for it (audited review.signin) — a normal full
   session that ends with the owner's review period at the latest, and that never adopts the mailbox's earlier anonymous requests; every
   other address and code follows the rules above exactly. */
import { json, err, preflight, readJson, bodyErr, line, now, iso, hex, sha256, hmac, safeEq, b64url, unb64url, enc, isEmail, emailKey, ipHash, rateOk, rateCount, isBlocked, human, mail, emailOn, secretOf, userOut, effPlan, membersByMailbox, isGmail, site, isAdmin } from "./common.js";
import { respondioToken } from "./service-keys.js"; // the WhatsApp token: RESPONDIO_TOKEN or the Control Center slot (leaf module, no cycle)
import { featureOn, offMessage } from "./flags.js";   // «🛠️ المطوّر»: registrations off → a NEW mailbox gets 503 feature_off (members sign in)
import { reviewFor, reviewCodeOk, auditReviewSignin, staffish } from "./review-signin.js"; // «دخول مراجعي المتاجر»: store_review_signin (owner-only, audited)

const CODES_GLOBAL_HOUR = 300, LINK_SESSION_HOURS = 24;
const CODE_MIN = 10, MAX_ATTEMPTS = 5, TOKEN_DAYS = 30, CODES_PER_EMAIL_HOUR = 5, CODES_PER_EMAIL_DAY = 10, CODES_PER_IP_HOUR = 20, FAILS_PER_EMAIL_DAY = 15, LINK_DAYS = 7, LINKS_PER_IP_10MIN = 30;

/* ---------- signed one-time login links (no password, no code: the link itself was mailed to the member) ---------- */
/* an admin account, or one that WOULD be admin once its address is confirmed (listed in ADMIN_EMAILS) — never gets a link */
const adminish = (env, m) => isAdmin(env, { ...m, email_verified_at: "x" });
const linkSig = async (env, memberId, nonce, exp, email) => (await hmac(secretOf(env), `lt|${memberId}|${nonce}|${exp}|${String(email || "").toLowerCase()}`)).slice(0, 32);
export async function signLoginLink(env, member, nowMs = Date.now()) {
  if (!member || !member.id || !secretOf(env) || !env.DB || adminish(env, member)) return ""; // admins always sign in with a code
  const nonce = hex(16), exp = Math.floor(nowMs / 1000) + LINK_DAYS * 86400;
  await env.DB.prepare("INSERT INTO logins (code_hash, member_id, purpose, created_at, expires_at) VALUES (?, ?, 'inq_link', ?, ?)").bind(await sha256("lt|" + nonce), member.id, iso(nowMs), iso(exp * 1000)).run();
  return ["l1", b64url(enc.encode(member.id)), nonce, exp, await linkSig(env, member.id, nonce, exp, member.email)].join(".");
}
/* the dashboard opened on «طلبات واردة لي» for that request, signed in by the link */
export async function dashLoginUrl(env, member, ref, nowMs = Date.now()) {
  const t = await signLoginLink(env, member, nowMs);
  const tail = "tab=incoming" + (ref ? "&ref=" + encodeURIComponent(ref) : "");
  return t ? `${site(env)}dashboard.html#lt=${t}&${tail}` : `${site(env)}dashboard.html#${tail}`;
}

export async function signSession(secret, memberId, sid, exp) {
  return ["v2", b64url(enc.encode(memberId)), sid, exp, await hmac(secret, `v2|${memberId}|${sid}|${exp}`)].join(".");
}
async function parseV2(env, token) {
  const p = String(token || "").split(".");
  const secret = secretOf(env);
  if (p.length !== 5 || p[0] !== "v2" || !secret || !/^(?:[a-f0-9]{32}|l[kg][a-f0-9]{30})$/.test(p[2])) return null; // "lk…" = a login-link session, "lg…" = an old-password bridge session
  let memberId; try { memberId = new TextDecoder().decode(unb64url(p[1])); } catch (e) { return null; }
  const exp = +p[3];
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  if (!safeEq(await hmac(secret, `v2|${memberId}|${p[2]}|${exp}`), p[4])) return null;
  return { memberId, sid: p[2], exp };
}
export const bearer = req => { const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i); return m ? m[1] : ""; };
/* → member row or null (bad / expired / revoked token, member removed) */
export async function authUser(req, env, token) {
  if (!env.DB) return null;
  const t = await parseV2(env, token || bearer(req));
  if (!t) return null;
  const sh = await sha256(t.sid);
  const s = await env.DB.prepare("SELECT * FROM auth_sessions WHERE sid_hash = ?").bind(sh).first();
  if (!s || s.member_id !== t.memberId || s.revoked_at || s.expires_at < now()) return null;
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(t.memberId).first();
  if (!m) return null;
  if (m.email && await isBlocked(env, { email: m.email })) return null; // blocked by an admin: every session stops working
  const hourAgo = iso(Date.now() - 3600000);
  if (!m.last_seen_at || m.last_seen_at < hourAgo) {
    const t2 = now();
    await env.DB.batch([env.DB.prepare("UPDATE members SET last_seen_at = ? WHERE id = ?").bind(t2, m.id), env.DB.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE sid_hash = ?").bind(t2, sh)]);
  }
  m._sid_hash = sh;
  // link session (POST /api/auth/link): 24 h, no advisor, no profile / settings changes. An old-password bridge session (POST
  // /api/auth/legacy, acc-legacy.js: "lg…") has the SAME limited scope (review F8): the old system's word is no proof of the mailbox
  m._scope = /^l[kg]/.test(t.sid) ? "link" : "full";
  if (t.sid.startsWith("lg")) m._via = "legacy";
  return m;
}
/* a session opened by an e-mailed login link (not by an e-mail code) — refused where it could take the account over (SEC M2) */
export const isLinkSession = m => !!(m && m._scope === "link");
export const linkSessionErr = () => err(403, "full_login_required", "signed in by an e-mail link: sign in with an e-mail code to do this", { login: "code" });
export const isV2 = token => String(token || "").startsWith("v2.");

const codeHash = (env, email, code) => sha256(secretOf(env) + "|code|" + email + "|" + code); // email = the exact address it was sent to
function sixDigits() { const a = crypto.getRandomValues(new Uint32Array(1))[0]; return String(a % 1000000).padStart(6, "0"); }

export async function handleAuth(req, env) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "").replace(/\/+$/, "") || "/";
  try {
    if (path === "/health" || path === "/") { // ok:false while the advisor's test-only open mode is on (anyone could mint advisor members)
      const open = env.ADVISOR_OPEN_MODE === "1";
      return json({ ok: !!(env.DB && secretOf(env) && emailOn(env)) && !open, store: env.DB ? "d1" : "none", auth: !!secretOf(env), email: emailOn(env), whatsapp: !!respondioToken(env), turnstile: !!env.TURNSTILE_SECRET,
        platform_key: !!env.PLATFORM_KEY, advisor_open_mode: open, ...(open ? { error: "ADVISOR_OPEN_MODE=1 is for local testing only — remove it before launch" } : {}) });
    }
    if (!env.DB) return err(503, "store_off", "store not configured");
    if (!secretOf(env)) return err(503, "auth_off", "auth not configured");
    if (req.method !== "POST") return err(405, "method", "method not allowed");
    if (path === "/request") return await requestCode(req, env);
    if (path === "/verify") return await verify(req, env);
    if (path === "/logout") return await logout(req, env);
    if (path === "/link") return await linkLogin(req, env);
    return err(404, "not_found", "not found");
  } catch (e) {
    console.error("auth error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}

async function requestCode(req, env) {
  const b = await readJson(req, 8192); const be = bodyErr(b); if (be) return be;
  const email = line(b.email, 254).toLowerCase(), lang = String(b.lang || "").startsWith("en") ? "en" : "ar";
  if (!isEmail(email)) return err(400, "invalid_email", "valid email required");
  if (await reviewFor(env, email)) return json({ ok: true }); // «دخول مراجعي المتاجر»: no e-mail — the code of this one address is the owner's
  if (!emailOn(env)) return err(503, "email_off", "email not configured");
  const h = await human(req, env, b); if (h) return h; // TURNSTILE_SECRET set → the sign-in dialog MUST send a token (SEC M1)
  const key = emailKey(email), ih = await ipHash(req, env);
  if (await isBlocked(env, { email, ip_hash: ih })) return json({ ok: true }); // blocked: silently nothing (no oracle)
  if (!(await rateOk(env, "authip|" + ih, CODES_PER_IP_HOUR, 3600)) || !(await rateOk(env, "authem|" + key, CODES_PER_EMAIL_HOUR, 3600)) || !(await rateOk(env, "authemd|" + key, CODES_PER_EMAIL_DAY, 86400))) return err(429, "rate_limited", "too many codes, try again later");
  // one global hourly budget of code e-mails, whatever the networks (protects the Resend quota and the sender's reputation)
  if (!(await rateOk(env, "authglobal", Math.max(10, parseInt(env.AUTH_CODES_PER_HOUR, 10) || CODES_GLOBAL_HOUR), 3600))) return err(429, "rate_limited", "too many sign-in requests right now, try again in a few minutes");
  const code = sixDigits(), t = Date.now();
  await env.DB.prepare("UPDATE auth_codes SET used_at = ? WHERE email = ? AND used_at = ''").bind(iso(t), email).run(); // only the newest code for this address works
  await env.DB.prepare("INSERT INTO auth_codes (email_key, email, code_hash, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(key, email, await codeHash(env, email, code), ih, iso(t), iso(t + CODE_MIN * 60000)).run();
  const r = await mail(env, { id: "code-" + hex(8), to: email, lang, subject: lang === "en" ? `Your sign-in code: ${code}` : `كود الدخول: ${code}`,
    ar: `كود الدخول لمنصة صنع في مصر:\n\n${code}\n\nالكود صالح ${CODE_MIN} دقائق ويُستخدم مرة واحدة. لو مش انت اللي طلبته تجاهل الرسالة — محدش هيقدر يدخل من غير الكود.`,
    en: `Your Made in Egypt Gate sign-in code:\n\n${code}\n\nIt is valid for ${CODE_MIN} minutes and works once. If you did not ask for it, ignore this email — nobody can sign in without the code.`,
    why: "وصلتك الرسالة لأن حد كتب الإيميل ده في شاشة الدخول / You received this because this address was entered on the sign-in screen." });
  if (!r.sent) return err(502, "send_failed", "could not send the code, try again");
  return json({ ok: true });
}

async function verify(req, env) {
  const b = await readJson(req, 8192); const be = bodyErr(b); if (be) return be;
  const email = line(b.email, 254).toLowerCase(), code = line(b.code, 12).replace(/\s/g, "");
  if (!isEmail(email)) return err(400, "invalid_email", "valid email required");
  if (!/^\d{6}$/.test(code)) return err(400, "invalid_code", "6-digit code required");
  const key = emailKey(email), t = now();
  if (!(await rateOk(env, "authv|" + await ipHash(req, env), 30, 600))) return err(429, "rate_limited", "too many attempts, try again later"); // guessing across many addresses
  // «دخول مراجعي المتاجر» (review-signin.js): the ONE review address takes the owner's code while his switch is on and the period runs. The
  // attempt counts against the address's daily wrong-code limit first, like any code; a code that is not his falls through to the e-mailed one
  const rv = await reviewFor(env, email);
  let review = false, row = null;
  if (rv) {
    if (!(await rateOk(env, "authvf|" + key, FAILS_PER_EMAIL_DAY, 86400))) return err(429, "locked", "too many wrong codes for this address today, try again tomorrow");
    review = await reviewCodeOk(env, rv, email, code);
  }
  if (!review) {
    // the code works only for the exact address it was mailed to (a "+tag" address may be someone else's mailbox)
    row = await env.DB.prepare("SELECT * FROM auth_codes WHERE email = ? AND used_at = '' ORDER BY id DESC LIMIT 1").bind(email).first();
    if (!row || row.expires_at < t) return err(401, "invalid_code", "invalid or expired code");
    // every attempt is counted BEFORE the compare, atomically (SEC L1): parallel guesses can never all be checked against one code
    if (!rv && !(await rateOk(env, "authvf|" + key, FAILS_PER_EMAIL_DAY, 86400))) return err(429, "locked", "too many wrong codes for this address today, try again tomorrow");
    const claim = await env.DB.prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ? AND used_at = '' AND attempts < ?").bind(row.id, MAX_ATTEMPTS).run();
    if (!claim.meta || claim.meta.changes !== 1) { await env.DB.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ? AND used_at = ''").bind(t, row.id).run(); return err(429, "too_many_attempts", "too many attempts, request a new code"); }
    if (!safeEq(await codeHash(env, row.email, code), row.code_hash)) {
      const n = (await env.DB.prepare("SELECT attempts FROM auth_codes WHERE id = ?").bind(row.id).first("attempts")) || MAX_ATTEMPTS;
      if (n >= MAX_ATTEMPTS) await env.DB.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ? AND used_at = ''").bind(t, row.id).run(); // 5 wrong → the code is burnt
      return err(401, "invalid_code", "invalid or expired code", { attempts_left: Math.max(0, MAX_ATTEMPTS - n) });
    }
  }
  const mailbox = review ? email : row.email; // the exact address the code belongs to
  // registrations paused (the owner's switch): only after a right code (the mailbox is proven, so nothing is revealed to anyone else), and
  // before the code is used up — an existing member signs in as usual, a new address hears it clearly and nothing is created
  if (!(await featureOn(env, "registrations")) && !(await findByEmail(env, mailbox))) return err(503, "feature_off", undefined, { feature: "registrations", message: offMessage("registrations") });
  if (!review) {
    const used = await env.DB.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ? AND used_at = ''").bind(t, row.id).run();
    if (!used.meta || used.meta.changes !== 1) return err(401, "invalid_code", "invalid or expired code");
  }
  // one account per mailbox: an existing member row (e.g. activated by the platform for Bassem) is reused
  let m = await findByEmail(env, mailbox);
  if (review && (await staffish(env, m))) return err(401, "invalid_code", "invalid or expired code"); // the review code never opens a staff account
  if (!m) {
    const id = "u" + hex(8);
    await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at) VALUES (?, '', ?, 'visitor', 0, ?, ?, ?)").bind(id, mailbox, t, t, t).run();
    m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  } else await env.DB.prepare("UPDATE members SET email_verified_at = CASE WHEN email_verified_at = '' THEN ? ELSE email_verified_at END, last_seen_at = ? WHERE id = ?").bind(t, t, m.id).run();
  m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first();
  // requests this mailbox sent before signing in become theirs (tracking without last-4, bell notifications on replies), and
  // the opportunities / projects they registered interest in are followed now — once, at attach time (what their receipt said).
  // Never at a review sign-in: the owner's code proves nothing about who sent them (review-signin.js; review F5)
  const { results: loose } = review ? { results: [] } : isGmail(mailbox)
    ? await env.DB.prepare("SELECT id, kind, target_type, target_id, target_name FROM inquiries WHERE user_id = '' AND email_key = ? AND (lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com') LIMIT 200").bind(emailKey(mailbox)).all()
    : await env.DB.prepare("SELECT id, kind, target_type, target_id, target_name FROM inquiries WHERE user_id = '' AND lower(email) = ? LIMIT 200").bind(mailbox).all();
  const att = [];
  for (const q of loose || []) {
    att.push(env.DB.prepare("UPDATE inquiries SET user_id = ? WHERE id = ? AND user_id = ''").bind(m.id, q.id));
    if (/^(opp_offer|lead_interest|project_interest)$/.test(q.kind) && q.target_type && q.target_id)
      att.push(env.DB.prepare("INSERT OR IGNORE INTO follows (user_id, kind, ref_id, label, url, created_at) VALUES (?, ?, ?, ?, '', ?)").bind(m.id, String(q.target_type).slice(0, 30), q.target_id, q.target_name || "", t));
  }
  if (att.length) await env.DB.batch(att);
  if (review) await auditReviewSignin(env, req, m, rv); // «دخول مراجعي المتاجر»: every review sign-in is in the audit log
  // a review session ends with the owner's review period at the latest (review F4); turning the sign-in off ends it at once (review-signin.js)
  return json(await issueSession(env, m, review ? { expMs: Date.parse(rv.until) } : {}));
}
/* a normal 30-day session for a member (email-code sign-in or a login link); expMs: a session that must end earlier (the store reviewer's) */
export async function issueSession(env, m, { scope = "full", expMs } = {}) {
  const link = scope === "link", sid = link ? "lk" + hex(15) : hex(16);
  let exp = Math.floor(Date.now() / 1000) + (link ? LINK_SESSION_HOURS * 3600 : TOKEN_DAYS * 86400);
  if (Number.isFinite(expMs) && expMs > Date.now()) exp = Math.min(exp, Math.floor(expMs / 1000));
  await env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(sid), m.id, now(), iso(exp * 1000)).run();
  return { token: await signSession(secretOf(env), m.id, sid, exp), expires_at: iso(exp * 1000), user: userOut(env, m), scope: link ? "link" : "full" };
}
/* POST /api/auth/link {t} — exchanges a signed one-time login link for a session (wrong / used / expired → 401 with a code) */
async function linkLogin(req, env) {
  const b = await readJson(req, 4096); const be = bodyErr(b); if (be) return be;
  const t = line(b.t || b.lt || b.token, 400);
  const bad = (code, error) => err(401, code, error || "invalid or expired link — sign in with an email code", { login: "code" });
  if (!(await rateOk(env, "authlink|" + await ipHash(req, env), LINKS_PER_IP_10MIN, 600))) return err(429, "rate_limited", "too many attempts, try again later");
  const p = /^l1\.([A-Za-z0-9_-]{1,120})\.([a-f0-9]{32})\.(\d{9,11})\.([A-Za-z0-9_-]{32})$/.exec(t);
  if (!p) return bad("invalid_link");
  let memberId; try { memberId = new TextDecoder().decode(unb64url(p[1])); } catch (e) { return bad("invalid_link"); }
  const h = await sha256("lt|" + p[2]), exp = +p[3];
  const row = await env.DB.prepare("SELECT * FROM logins WHERE code_hash = ?").bind(h).first();
  const m = row && row.purpose === "inq_link" && row.member_id === memberId ? await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first() : null;
  if (!m || !safeEq(await linkSig(env, memberId, p[2], exp, m.email), p[4])) return bad("invalid_link"); // a changed address voids old links
  if (exp < Math.floor(Date.now() / 1000) || row.expires_at < now()) return bad("expired_link", "this link has expired — sign in with an email code");
  if (row.used_at) return bad("used_link", "this link was already used — sign in with an email code");
  const ts = now(), used = await env.DB.prepare("UPDATE logins SET used_at = ? WHERE code_hash = ? AND used_at = ''").bind(ts, h).run();
  if (!used.meta || used.meta.changes !== 1) return bad("used_link", "this link was already used — sign in with an email code");
  if (m.email && await isBlocked(env, { email: m.email })) return err(403, "blocked", "this account is blocked");
  if (adminish(env, m)) return err(403, "full_login_required", "admin accounts sign in with an e-mail code", { login: "code" });
  // the link was mailed to this member's address: that mailbox is confirmed now (same as an email code)
  await env.DB.prepare("UPDATE members SET email_verified_at = CASE WHEN email_verified_at = '' THEN ? ELSE email_verified_at END, last_seen_at = ? WHERE id = ?").bind(ts, ts, m.id).run();
  return json(await issueSession(env, await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first(), { scope: "link" }));
}
/* the member row for a mailbox: the highest active plan wins (platform-activated rows before self-created ones). Only rows the
   platform verified or that an email-code sign-in created are ever adopted — a row anyone else created with this address
   (e.g. through the advisor's test-only open mode) is ignored, so it can neither raise this person's plan nor capture their login. */
export async function findByEmail(env, email) {
  const rows = (await membersByMailbox(env, email)).filter(m => m.verified || m.email_verified_at);
  if (!rows.length) return null;
  const LV = { visitor: 0, profile: 1, basic: 2, premium: 3, partner: 4, strategic: 5 };
  return rows.sort((a, b) => (LV[effPlan(b)] || 0) - (LV[effPlan(a)] || 0) || (b.verified || 0) - (a.verified || 0) || String(a.created_at).localeCompare(String(b.created_at)))[0];
}

async function logout(req, env) {
  const m = await authUser(req, env);
  if (!m) return err(401, "unauthorized", "unauthorized");
  await env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE sid_hash = ?").bind(now(), m._sid_hash).run();
  return json({ ok: true });
}
