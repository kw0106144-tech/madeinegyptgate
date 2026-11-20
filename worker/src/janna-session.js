/* «جنة لايف» without a third-party mark in the video — short-lived Anam session tokens minted by the Worker, so the site runs the
   live call itself with the Anam JS SDK (data/janna-live.js) instead of the agent widget. A widget session carries Anam's disclosure
   mark; SDK sessions do not (Anam docs, security/ai-avatar-disclosure: showAIAvatarDisclosure defaults to false and is bound to the
   token) — the page shows its OWN AI label on the video instead («جنة · مساعِدة بالذكاء الاصطناعي» / "Janna · AI assistant").

   POST /api/janna/session  {agent: "janna" | "bassem", lang: "ar" | "en"}
     200 {sessionToken, agent, lang, expires_in, max_session_sec[, media_ticket]}  + header Server-Timing (boot / checks / ctx / persona / wait / token /
                                          total, ms; also on the 502s) — where the wait before «بنوصّلك…» went (serverTiming below)
     503 {error: "anam_not_configured"}   no ANAM_API_KEY secret (nor the Control Center's sealed "anam.api_key" slot) → the page keeps
                                          the widget, exactly as before
     403 origin_not_allowed               Origin (else Referer) is not https://madeinegyptgate.com / https://www.madeinegyptgate.com
                                          (or SITE_URL's origin); JANNA_DEV_ORIGINS=1 also allows http://localhost:* / http://127.0.0.1:*
     400 bad_json | bad_agent | bad_lang · 405 method · 413 too_large · 503 store_off (the limits need D1)
     403 blocked                          a network an admin blocked (blocks table)
     429 rate_limited                     JANNA_IP_SESSIONS_PER_HOUR (default 6) tokens per network per hour — keyed hash of the IP network
                                          (common.js ipHash: IPv4 address / IPv6 /64), never the IP itself
     401 login_required | 403 full_login_required | 403 plan    Bassem only: a signed-in member (platform session, or Bassem's own
                                          advisor token) whose plan in force has «bassem» in the Control Center plans matrix (common.js
                                          planCan, read at CALL time — default partner / strategic), or platform staff (admin, ADMIN_EMAILS,
                                          Control Center owner / admin / support). An e-mailed login link never opens Bassem (same rule as advisor.js).
     429 daily_cap                        JANNA_DAILY_SESSIONS (default 120; "0" = live calls off) tokens per Cairo day for the whole site —
                                          protects the plan's minutes. Counted only for tokens Anam really issued.
     502 upstream | upstream_unreachable  Anam refused or did not answer (status only; nothing is counted against the day)
   The persona comes ONLY from the fixed allow-list below (agent + lang); nothing the browser sends is passed to Anam.
   Anam request (docs: api-reference/sessions/create-session-token): {personaConfig: {personaId}, sessionOptions:
   {showAIAvatarDisclosure: false}, expiresInSeconds, maxSessions: 1, clientLabel}. One token starts one session; the page ends the
   call at max_session_sec (7200 s since the Anam Growth plan, warning 2 minutes before) — Anam's own limit for a saved persona is the persona's
   maxSessionLengthSeconds (Lab / PUT /v1/personas/{id}), which should be set to the same 600.
   Bassem for a member whose plan has «bassem» and whose profile has a name AND a title (bassem-context.js): the saved persona is read
   (GET /v1/personas/{id}, PERSONA_TIMEOUT_MS; started beside the member's D1 context, not after it — 2026-11-19) and the token is minted
   for an ephemeral copy of it — same avatar, voice, LLM, tools,
   language, voice detection and director notes — whose prompt ends with the member's context from D1 (honorific + first name,
   company, sector, plan, the plan's markets) and whose initialMessage greets him by name; maxSessionLengthSeconds = 600. A saved
   persona cannot take a per-session prompt or first message (its personaConfig is {personaId} only). The persona read failing → today's
   request; Anam refusing the enriched config (any HTTP error / no token) → today's request ONCE, within ANAM_BUDGET_MS (counted from
   the start of the request). 200 then carries member_context: true. Staff allowed only as staff, and members without a name or a
   known title: today's request exactly. Off without a code change: the Worker variable BASSEM_MEMBER_CONTEXT = 0 / off / false / no;
   for one call: the body's member_context: false (e.g. the page retrying after an enriched session failed to start) — the page can
   only turn the context OFF, never on.
   Consolidation (holo4 + holo5 + holo6, bassemContext below): the block also carries «النهارده: <the Cairo date>», the member's factory
   profile (profile.js, migration 0007) and Bassem's memory of him (memory.js memoryContext, migration 0008: the last calls, searches,
   open follow-ups and what did not get done), each inside its own data markers, ≤ BLOCK_MAX characters in all. A member with no name /
   known title gets the enriched persona too when that memory or profile has something (neutral first sentence, «don't invent a name»).
   Body continue_call: "<call id>" (the call page's chain, a part after the first): the last words of THAT call are read from Bassem's
   memory on the server (this member's own stored turns, ≤ 3 h old) and the part starts WITHOUT a greeting (skipGreeting) — 200 then
   also carries continued: true; memory: true when the memory block was included. Nothing of the page's text reaches the prompt.
   Janna's memory (0009, visitor.js jannaSessionContext): body visitor_id = the page's random first-party visitor id (32 hex). When that
   visitor has talked to Janna before, and / or «بنك المعلومات» has answers the team approved (knowledge.js), Janna's saved persona is
   copied the same way (ephemeralFrom) with a short visitor block (VISITOR_BLOCK markers: visits, what was asked, interest, stage, open
   tasks — no name, no e-mail, no phone) and the 10 most asked Q&A (KNOWLEDGE_BLOCK markers), ≤ BLOCK_MAX; a returning visitor is
   greeted «أهلاً بيك تاني …», otherwise the persona's own first sentence is kept. Signed in with a full session, the visitor id is linked
   to the member. Nothing to add → today's plain request exactly. 200 then carries visitor_context: true (+ memory / knowledge). Off: the
   Worker variable JANNA_VISITOR_CONTEXT = 0 / off, or the body's visitor_context: false for one call. Janna never needs a sign-in: a bad
   or missing token is ignored.
   The platform's own apps (app parity plan 2026-11-20, app-ua.js — a request whose User-Agent says «MIGApp/<v> (ios|android)»):
     400 consent_required   «🛠️ المطوّر» call_consent_app (a request from the app) / call_consent_web (any other) is on and the body has no
                            consent: true — the page shows the owner-approved card first (data/janna-live.js). A page that knows the card
                            sends cs: 1; an older page gets the refusal it can show instead of falling back to Anam's widget (which talks to
                            Anam directly): code feature_off (ff: 1) / daily_cap (no ff) — error stays "consent_required".
     app_buy_<platform> off: the session from THAT app gets one fixed line (APP_NO_PRICES) at the end of the persona's prompt through the
                            same ephemeral copy as the member / visitor context (no line when the persona cannot be copied: today's request).
   The key is never logged, echoed or sent to the browser; errors log the upstream HTTP status only (never the member's data). */
import { readJson, ipHash, rateOk, isBlocked, planCan, isAdmin, site, cairoDay, jparse, secretOf } from "./common.js";
import { authUser, bearer, isV2, isLinkSession } from "./auth.js";
import { verifyToken } from "./advisor.js";
import { getSecret } from "./crypto.js";
import { memberContext, ephemeralFrom, todayLineAr, fitBlock, BLOCK_MAX } from "./bassem-context.js";
// consolidation (holo4 profile + holo6 memory + holo5 continuation): what Bassem knows about the member when the call starts
import { memoryContext, MEMORY_BLOCK, CONTEXT_MAX, callIdOk } from "./memory.js";
import { memberProfile } from "./profile.js";
import { resumeContext, RESUME_BLOCK } from "./resume.js";
import { forLLM, instructionLike, stripCues } from "./text.js";
import { jannaSessionContext, visitorContextOn, vidOk } from "./visitor.js"; // 0009: Janna's memory of her visitors + «بنك المعلومات»
import { featureOn, offMessage } from "./flags.js"; // «🛠️ المطوّر»: janna_live / bassem_live (owner switches, 503 feature_off)
import { svc } from "./service-keys.js";            // the panel's Anam key as ccBoot already read it for this request (memo ≤ 60 s)
import { appOf } from "./app-ua.js";                // the platform's own apps (MIGApp user agent): the store-rule switches below
import { mediaTicket } from "./chat-ticket.js";      // 📎 the photo ticket of Janna's call (src/chat-media.js, switch chat_photos)
import { hasTable } from "./acc-base.js";            // 0011: the calls report's call_sessions row (a missing table writes nothing)

export const ANAM_TOKEN_URL = "https://api.anam.ai/v1/auth/session-token";
export const ANAM_PERSONA_URL = "https://api.anam.ai/v1/personas/"; // + a persona id from PERSONAS (read-only GET, Bassem's member context)
/* agent + lang → Anam persona (the same ids as data/janna-live.js AGENTS); Bassem advises in Arabic on every page */
export const PERSONAS = Object.freeze({
  janna: Object.freeze({ ar: "5f06d835-22cc-4460-b412-84cefa9e565b", en: "e5101653-65b4-44a6-85e5-ec2e78f82685" }),
  bassem: Object.freeze({ ar: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be", en: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be" }),
});
/* app_buy_<platform> off (store rules): the fixed rule added to the persona's prompt for a call from THAT app — no prices, plans or payment.
   A rule of the platform, never page text; the owner approves it with the other app texts (docs/app/OWNER-APPROVAL-AR.md) */
export const APP_NO_PRICES = Object.freeze({
  janna: "قاعدة تطبيق الموبايل: الزائر بيكلمك من تطبيق المنصة على الموبايل. ماتذكريش أي أسعار أو مبالغ أو باقات مدفوعة أو طريقة دفع أو روابط دفع، وماتطلبيش منه يدفع أو يشترك. لو سأل عن الأسعار أو الاشتراك أو الدفع، قوليله بلطف إن التفاصيل دي مش متاحة جوه التطبيق، وكمّلي معاه في أي حاجة تانية.",
  bassem: "قاعدة تطبيق الموبايل: العضو بيكلمك من تطبيق المنصة على الموبايل. ماتذكرش أي أسعار أو مبالغ أو باقات مدفوعة أو تجديد أو ترقية أو طريقة دفع أو روابط دفع، وماتطلبش منه يدفع أو يجدّد. لو سأل عن الأسعار أو التجديد أو الدفع، قوله بلطف إن التفاصيل دي مش متاحة جوه التطبيق، وكمّل معاه في شغله.",
});
export const CONSENT_MSG = "وافق على رسالة المكالمة مع الذكاء الاصطناعي الأول / please agree to the AI-call notice first";
export const MAX_SESSION_SEC = 7200, TOKEN_TTL_SEC = 600, ANAM_TIMEOUT_MS = 10000;   /* owner 2026-11-18: Anam Growth plan has no session cap — 2 h per call, the page continues past it */
/* member context — the page gives up on the whole request after 15 s (data/janna-live.js sessToken), so ANAM_BUDGET_MS counts from the
   START of the request (the D1 checks included). The persona read (≤ PERSONA_TIMEOUT_MS) runs while the day is counted; the enriched
   request gets what is left minus RETRY_MIN_MS (at most ANAM_TIMEOUT_MS, and it is tried only when that is ≥ RETRY_MIN_MS), so a refusal
   always leaves room for the plain retry, which gets what is left (at least RETRY_MIN_MS) */
export const PERSONA_TIMEOUT_MS = 3000, ANAM_BUDGET_MS = 13000, RETRY_MIN_MS = 2000;
const off = v => /^(0|off|false|no)$/i.test(String(v == null ? "" : v).trim());
/* the Worker variable can switch the member context off for every call; the page's member_context: false only for its own call */
export const memberContextOn = (env, body) => !off(env && env.BASSEM_MEMBER_CONTEXT) && !off(body && body.member_context);
const STAFF_ROLES = ["owner", "admin", "support"];          // Control Center roles that may open Bassem's live call
const SITE_ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const on = v => /^(1|on|true|yes)$/i.test(String(v == null ? "" : v));
const num = (v, d, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
export const perHour = env => Math.max(1, num(env && env.JANNA_IP_SESSIONS_PER_HOUR, 6, 1000));
export const dailyCap = env => num(env && env.JANNA_DAILY_SESSIONS, 120, 100000);

/* own headers: same-origin use, so no "Access-Control-Allow-Origin: *" on a token endpoint — an allowed Origin is reflected */
const HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
const out = (o, status, cors, hdr) => new Response(JSON.stringify(o), { status, headers: { ...HDR, ...(cors ? { "Access-Control-Allow-Origin": cors, ...(hdr ? { "Access-Control-Expose-Headers": "Server-Timing" } : {}) } : {}), ...(hdr || {}) } });
const fail = (status, code, cors, extra, hdr) => out({ error: code, code, ...(extra || {}) }, status, cors, hdr);
/* owner 2026-11-19 «باسم بياخد وقت» (the call screen stayed on «بنوصّلك بباسم…»): where the token request spent its time, as a Server-Timing
   header the page reads (data/janna-live.js JANNA_LIVE.timing()) and the browser's network panel shows — milliseconds only, never data:
   checks = origin / key / limits / sign-in, ctx = the member's (or visitor's) context from D1, persona = the saved persona's read (it runs
   beside ctx for a member Bassem greets by name), wait = how long the token request still waited for that read after ctx, token = the
   Anam token request(s), total = the whole request. boot (speed 2026-11-20) = the Control Center boot before it (index.js: plans matrix,
   mail config, service keys, feature switches — memo ≤ 60 s per isolate), which `total` does not include */
export function serverTiming(t) {
  const ms = v => Math.max(0, Math.round(Number(v) || 0));
  return ["boot", "checks", "ctx", "persona", "wait", "token", "total"].filter(k => t && t[k] != null).map(k => k + ";dur=" + ms(t[k])).join(", ");
}

/* the page's origin: the Origin header, else the Referer's origin ("" when neither is usable) */
export function originOf(req) {
  const o = req.headers.get("Origin");
  if (o) return o;
  const r = req.headers.get("Referer");
  if (!r) return "";
  try { return new URL(r).origin; } catch (e) { return ""; }
}
export function originOk(env, o) {
  if (!o || o === "null") return false;
  let own = ""; try { own = new URL(site(env)).origin; } catch (e) { /* SITE_URL is checked by site() */ }
  return SITE_ORIGINS.includes(o) || o === own || (on(env && env.JANNA_DEV_ORIGINS) && DEV_ORIGIN.test(o));
}
/* ANAM_API_KEY (wrangler secret), else the key the owner saved in the Control Center (sealed slot, migrations/0006): first as ccBoot already
   unsealed it for this request (service-keys.js memo — no second D1 read + decrypt, speed 2026-11-20), else read now */
async function anamKey(env) {
  if (env.ANAM_API_KEY) return String(env.ANAM_API_KEY);
  const k = svc(env).anam_key; if (k) return k;
  if (!env.DB) return "";
  try { return (await getSecret(env, "anam.api_key")) || ""; } catch (e) { return ""; } // no cc_secrets table / no CONFIG_SECRET yet
}
async function isStaff(env, m) {
  if (isAdmin(env, m)) return true;
  try { // Control Center staff (migrations/0006); a database without the table has no staff there
    const r = await env.DB.prepare("SELECT role FROM cc_staff WHERE member_id = ? AND disabled_at = ''").bind(m.id).first();
    return !!(r && STAFF_ROLES.includes(r.role));
  } catch (e) { return false; }
}
/* Bassem: the plan is checked HERE on the server (never trusted from the page); {m} = a member whose plan has Bassem, {m, staff} =
   allowed only as staff, {no: [status, code]} = refused — exported for the photos of his call (src/chat-media.js: the same rule as the call) */
export async function bassemCaller(req, env) {
  const t = bearer(req);
  if (!t) return { no: [401, "login_required"] };
  let m = null;
  if (isV2(t)) { // platform session (e-mail code sign-in)
    m = await authUser(req, env, t);
    if (!m) return { no: [401, "login_required"] };
    if (isLinkSession(m)) return { no: [403, "full_login_required"] }; // an e-mailed login link never opens Bassem (advisor.js, SEC M2)
  } else { // Bassem's own advisor token (activation link): HMAC with ADVISOR_SECRET, then the member's plan as it is NOW
    const v = await verifyToken(env.ADVISOR_SECRET, t);
    m = v ? await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(v.memberId).first() : null;
    if (!m || (m.email && await isBlocked(env, { email: m.email }))) return { no: [401, "login_required"] };
  }
  // the plans matrix decides at call time (a load-time snapshot would ignore the owner's changes in «الباقات»); expiry / suspension via effPlan
  if (planCan(m, "bassem")) return { m };
  if (await isStaff(env, m)) return { m, staff: true };
  return { no: [403, "plan"] };
}
/* the saved persona as Anam returns it (read-only), or null on any failure — the caller then sends today's request */
async function savedPersona(key, id) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), PERSONA_TIMEOUT_MS);
  try {
    const r = await fetch(ANAM_PERSONA_URL + encodeURIComponent(id), { method: "GET", signal: ctl.signal, headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
    if (!r.ok) { console.error("janna session: persona read refused", r.status); return null; }
    const j = await r.json();
    return j && typeof j === "object" ? j : null;
  } catch (e) {
    console.error("janna session: persona read failed", (e && e.name) || "error");
    return null;
  } finally { clearTimeout(tm); }
}
/* ---------- what Bassem knows when a member's call starts (consolidation blocker A) ----------
   block = the member block (bassem-context.js, from his D1 row) + «النهارده: <Cairo date>» + the continuation of THIS call (continue_call)
   + his factory profile (profile.js memberProfile, PROFILE_BLOCK markers) + Bassem's memory of him (memory.js memoryContext, MEMORY_BLOCK
   markers), ≤ BLOCK_MAX characters in all; the memory gets what the rest leaves (≤ CONTEXT_MAX). Everything comes from the server's own
   tables for this member only, never from the page. A member with no name / known title still gets the context (anonymous: neutral first
   sentence, «don't invent a name») when the memory, the profile or the continuation has something; with nothing → null = today's plain
   request, exactly as before. Each part fails soft (a missing 0007 / 0008 table = that part is left out). */
export const CONTINUE_MAX_AGE_MS = 3 * 3600000, CONTINUE_MAX_CHARS = 1500, CONTINUE_TURNS = 24;
/* the last words of THIS member's call `callId` (advisor_memory turns, recorded by the call page while it ran; ≤ 3 h old), cleaned
   (forLLM + resume.js cleanTurn), every turn that reads like an instruction dropped — "" when there is none (review 2026-11-18 #15: the
   text never comes from the token request) */
export async function continuation(env, memberId, callId, nowMs = Date.now()) {
  if (!callIdOk(callId) || !env || !env.DB) return "";
  try {
    const rows = (await env.DB.prepare("SELECT at, text, data_json FROM advisor_memory WHERE member_id = ? AND call_id = ? AND kind = 'turn' ORDER BY id DESC LIMIT ?").bind(memberId, callId, CONTINUE_TURNS).all()).results || [];
    if (!rows.length || !(nowMs - Date.parse(rows[0].at) <= CONTINUE_MAX_AGE_MS)) return "";
    const turns = rows.reverse().map(r => { const member = jparse(r.data_json, {}).role === "user"; return { role: member ? "member" : "bassem", text: forLLM(member ? r.text : stripCues(r.text), 600) }; }) // his own words: no stray cue tag («[صاف]») back into his prompt
      .filter(t => t.text && !instructionLike(t.text, { money: false }));
    return resumeContext({ turns }, { maxChars: CONTINUE_MAX_CHARS, maxItems: 12 });
  } catch (e) { return ""; } // no 0008 table yet: the part starts fresh
}
export async function bassemContext(env, m, lang, b, nowMs = Date.now()) {
  if (!m) return null;
  /* the continuation and the factory profile are independent reads: one D1 round trip instead of two (owner 2026-11-19 «باسم بياخد وقت») */
  const [cont, prof] = await Promise.all([continuation(env, m.id, b && b.continue_call, nowMs), memberProfile(env, m.id)]), o = { continued: !!cont };
  const base = memberContext(m, lang, o) || memberContext(m, lang, { ...o, anonymous: true });
  if (!base) return null;
  const parts = [base.block, "- " + todayLineAr(nowMs) + " (بتوقيت القاهرة)."];
  if (cont) parts.push("", RESUME_BLOCK[0], cont, RESUME_BLOCK[1]);
  if (prof && prof.block) parts.push("", prof.block);
  const room = Math.min(CONTEXT_MAX, BLOCK_MAX - parts.join("\n").length - MEMORY_BLOCK[0].length - MEMORY_BLOCK[1].length - 8);
  const mem = room >= 300 ? await memoryContext(env, m.id, { nowMs, max: room }) : "";
  if (mem) parts.push("", MEMORY_BLOCK[0], mem, MEMORY_BLOCK[1]);
  if (base.anonymous && !mem && !(prof && prof.block) && !cont) return null; // nothing to add for a member Bassem cannot greet by name
  return { ...base, block: fitBlock(parts.join("\n")), memory: !!mem, profile: !!(prof && prof.block) };
}

/* ---------- the daily calls report (calls-report.js, migration 0011) ----------
   Every token's Anam clientLabel carries a random tag of 12 base32 characters: «madeinegyptgate-<agent>-<lang>.<tag>» (grouping by label in
   Anam Lab stops being useful; the list's search by prefix still works). After Anam returns the token, execCtx.waitUntil writes ONE
   call_sessions row {tag, agent, lang, subject, member_id, staff, app, ctx, created_at}: member_id ONLY when this request carried the member's
   own full sign-in (Bearer v2, never an e-mailed link — the visitor.js linkVisitor rule), subject 'v:' + Janna's page visitor id, never an
   e-mail, a phone, an IP or a user agent. A missing table (0011 not applied) or a failed insert writes nothing and never fails or delays
   the token. Anam refusing a request with the tagged label (any 4xx) → the same request once more with the plain label; when that one
   works, this isolate stops tagging for an hour. A call never fails because of the report. */
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export const callTag = () => { let t = ""; for (const b of crypto.getRandomValues(new Uint8Array(12))) t += B32[b & 31]; return t; };
export const TAG_RX = /^[a-z2-7]{12}$/;
let TAG_OFF_UNTIL = 0; // the isolate stopped tagging (Anam refused a tagged label and took the plain one)
export const tagsOff = () => Date.now() < TAG_OFF_UNTIL;
export const forgetTagsOff = () => { TAG_OFF_UNTIL = 0; }; // tests (like flags.js forgetFeatures)
async function recordCall(env, req, row, bassemMember) {
  try {
    if (!(await hasTable(env, "call_sessions"))) return;
    let memberId = bassemMember ? bassemMember.id : "", staff = bassemMember ? (bassemMember.staff ? 1 : 0) : 0;
    if (!bassemMember) { // Janna: the member only from this request's own full sign-in (a bad or missing token is ignored, as for the call itself)
      const t = bearer(req);
      if (t && isV2(t)) { const m = await authUser(req, env, t).catch(() => null); if (m && !isLinkSession(m)) { memberId = m.id; staff = (await isStaff(env, m)) ? 1 : 0; } }
    }
    await env.DB.prepare("INSERT INTO call_sessions (tag, agent, lang, subject, member_id, staff, app, ctx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tag) DO NOTHING")
      .bind(row.tag, row.agent, row.lang, row.subject, memberId, staff, row.app, row.ctx, new Date().toISOString()).run();
  } catch (e) { console.error("janna session: call row", (e && e.message) || "error"); }
}

/* tokens issued today (Cairo day) for the whole site — the same rl table as the other limits, its own key per day. Counting is one statement
   (RETURNING: one D1 round trip, speed 2026-11-20); the refund (delta −1) is unchanged */
async function countDay(env, nowMs, delta) {
  const day = cairoDay(nowMs), k = "jsessday|" + day;
  if (delta > 0) return (await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n").bind(k, new Date(Date.parse(day + "T00:00:00Z") + 2 * 86400000).toISOString()).first("n")) || 0;
  await env.DB.prepare("UPDATE rl SET n = MAX(0, n - 1) WHERE k = ?").bind(k).run();
  return (await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(k).first("n")) || 0;
}

/* opt.bootMs: how long index.js spent in ccBoot before this handler (the Server-Timing «boot»; not part of total / ANAM_BUDGET_MS) */
export async function handleJannaSession(req, env, execCtx, opt) {
  const startMs = Date.now(); // the member-context budget (ANAM_BUDGET_MS) counts from here: key, D1 checks and Anam calls
  const bootMs = opt && Number.isFinite(opt.bootMs) ? opt.bootMs : null;
  env = env || {};
  const o = originOf(req), allowed = originOk(env, o), cors = allowed && req.headers.get("Origin") ? o : "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Vary: "Origin", "Cache-Control": "no-store", ...(cors ? { "Access-Control-Allow-Origin": cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" } : {}) } });
  if (req.method !== "POST") return fail(405, "method", cors);
  if (!allowed) return fail(403, "origin_not_allowed", "");
  const b = await readJson(req, 2048);
  if (b.tooLarge) return fail(413, "too_large", cors);
  if (b.bad) return fail(400, "bad_json", cors);
  const pick = (v, d) => (v == null || v === "" ? d : typeof v === "string" ? v.toLowerCase() : "?"); // strings only
  const agent = pick(b.agent, "janna"), lang = pick(b.lang, "ar");
  if (!Object.prototype.hasOwnProperty.call(PERSONAS, agent)) return fail(400, "bad_agent", cors);
  if (lang !== "ar" && lang !== "en") return fail(400, "bad_lang", cors);
  // «🛠️ المطوّر» (flags.js): the owner switched this persona's live calls off → no new call (the page hides the button too).
  // A page built before the switches (no `ff: 1` in the body: a cached old data/janna-live.js, or a Pages rollback to an older build)
  // treats any code it does not know as «use Anam's own widget», which talks to Anam directly and would ignore the switch — it gets
  // code "daily_cap", the refusal it shows without that fallback («today's live calls are used up»); error stays "feature_off".
  const fk = agent === "bassem" ? "bassem_live" : "janna_live";
  if (!(await featureOn(env, fk))) return fail(503, "feature_off", cors, { feature: fk, message: offMessage(fk), ...(b.ff === 1 || b.ff === true || b.ff === "1" ? {} : { code: "daily_cap" }) });
  // the store rules (app parity plan): consent before the AI call — the app's switch for a request from the app, the website's for any other
  const app = appOf(req), ck = app ? "call_consent_app" : "call_consent_web";
  if (b.consent !== true && (await featureOn(env, ck))) {
    const knows = b.cs === 1 || b.cs === true || b.cs === "1", ff = b.ff === 1 || b.ff === true || b.ff === "1";
    return fail(400, "consent_required", cors, { feature: ck, message: CONSENT_MSG, ...(knows ? {} : { code: ff ? "feature_off" : "daily_cap" }) });
  }
  const key = await anamKey(env);
  if (!key) return fail(503, "anam_not_configured", cors);
  if (!env.DB) return fail(503, "store_off", cors);
  try {
    const nowMs = Date.now(), ih = await ipHash(req, env);
    /* speed 2026-11-20: the block check, the network's hourly limit and (Bassem) the sign-in + plan check are independent reads, so they
       run together; their answers are still taken in today's order (blocked → limit → sign-in), so every refusal stays what it was. A blocked
       network's request now also counts toward its hourly limit, which changes nothing for it. */
    const callerP = agent === "bassem" ? bassemCaller(req, env).then(c => c, e => ({ error: e })) : null;
    const [blocked, underLimit] = await Promise.all([isBlocked(env, { ip_hash: ih }), rateOk(env, "jsess|" + ih, perHour(env), 3600, nowMs)]);
    if (blocked) return fail(403, "blocked", cors);
    if (!underLimit) return fail(429, "rate_limited", cors, { retry_after: 3600 - Math.floor(nowMs / 1000) % 3600 });
    const personaId = PERSONAS[agent][lang], tm = bootMs != null ? { boot: bootMs } : {};
    /* the saved persona's read, timed; never rejects (null on any failure) */
    const readPersona = () => { const t0 = Date.now(); return savedPersona(key, personaId).then(p => { tm.persona = Date.now() - t0; return p; }); };
    let ctx = null, personaP = null, tc = 0, who = null; // Bassem's member context: only from the member's own D1 rows (profile, memory, this call's turns), never from the page
    if (agent === "bassem") {
      const c = await callerP; if (c.error) throw c.error; if (c.no) return fail(c.no[0], c.no[1], cors);
      who = { id: isV2(bearer(req)) ? c.m.id : "", staff: !!c.staff }; // the calls report: a full sign-in only (Bassem's own advisor token is an e-mailed link)
      tm.checks = (tc = Date.now()) - startMs;
      if (!c.staff && memberContextOn(env, b)) {
        /* a member Bassem greets by name always gets the enriched persona (bassemContext never returns null for him): its read starts NOW,
           beside his D1 context, instead of after it (owner 2026-11-19 «باسم بياخد وقت»); anyone else: read only once a context exists */
        if (memberContext(c.m, lang)) personaP = readPersona();
        ctx = await bassemContext(env, c.m, lang, b, nowMs);
      }
    } else { tm.checks = (tc = Date.now()) - startMs; if (visitorContextOn(env, b)) ctx = await jannaSessionContext(env, req, b, lang, nowMs); } // Janna: the visitor's memory + the knowledge bank (null = plain)
    tm.ctx = Date.now() - tc;
    /* review 2026-11-19 #7: the page's visitor id is another member's (or the signed-out member's) → the page starts a new one; nothing to add → plain */
    const rotateVisitor = !!(ctx && ctx.rotate_visitor); if (ctx && agent === "janna" && !ctx.block) ctx = null;
    /* app_buy_<platform> off: the call from THAT app gets the fixed «no prices» rule (the website's and the other app's calls do not). The
       rule goes in front of the context block AS IT IS (already ≤ BLOCK_MAX): fitting the two again would cut the block's end — the last
       memory lines and its closing marker (review F7); the persona's prompt has room for the rule's ~300 characters */
    const noPrices = !!app && !(await featureOn(env, "app_buy_" + app));
    if (noPrices) ctx = { ...(ctx || {}), block: APP_NO_PRICES[agent] + (ctx && ctx.block ? "\n" + ctx.block : ""), app_rules: true, ...(ctx ? {} : { app_only: true }) };
    if (!ctx) personaP = null; else if (!personaP) personaP = readPersona(); // read while the day is counted
    if ((await countDay(env, nowMs, 1)) > dailyCap(env)) { await countDay(env, nowMs, -1); return fail(429, "daily_cap", cors); } // refused ones are not counted
    const base = "madeinegyptgate-" + agent + "-" + lang, tag = tagsOff() ? "" : callTag();
    let tagged = !!tag; // the calls report's tag in the label; dropped for the rest of this request after Anam refused it once
    const plain = { personaConfig: { personaId }, sessionOptions: { showAIAvatarDisclosure: false }, expiresInSeconds: TOKEN_TTL_SEC, maxSessions: 1, clientLabel: tagged ? base + "." + tag : base };
    const send0 = async (body, ms) => {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
      try {
        return await fetch(ANAM_TOKEN_URL, { method: "POST", signal: ctl.signal,
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      } finally { clearTimeout(tm); }
    };
    /* a 4xx with the tagged label → the same request once with the plain label (retryMs(): the time it may take; under RETRY_MIN_MS no retry) */
    const send = async (body, ms, retryMs) => {
      const res = await send0(tagged ? body : { ...body, clientLabel: base }, ms);
      if (!tagged || res.status < 400 || res.status >= 500) return res;
      tagged = false; console.error("janna session: anam refused the tagged label", res.status);
      const ms2 = retryMs ? retryMs() : ms;
      if (!(ms2 >= RETRY_MIN_MS)) return res;
      const res2 = await send0({ ...body, clientLabel: base }, ms2);
      if (res2.ok) TAG_OFF_UNTIL = Date.now() + 3600000;
      return res2;
    };
    const tokenOf = async r => { let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ } return j && typeof j.sessionToken === "string" ? j.sessionToken : ""; };
    const left = () => ANAM_BUDGET_MS - (Date.now() - startMs);
    let r, sessionToken = "", personal = false, pc = null;
    const timing = () => serverTiming({ ...tm, total: Date.now() - startMs }), th = () => ({ "Server-Timing": timing() });
    if (personaP) {
      const tw = Date.now(), p = await personaP;
      tm.wait = Date.now() - tw;
      /* Janna without a returning visitor (the knowledge bank only): her own first sentence from the Lab stays */
      if (p && ctx && !ctx.greeting && !ctx.continued && typeof p.initialMessage === "string" && p.initialMessage.trim()) ctx = { ...ctx, greeting: p.initialMessage.trim() };
      pc = ephemeralFrom(p, ctx, MAX_SESSION_SEC);
      if (p && !pc) console.error("janna session: the saved persona cannot be copied for the member context");
      if (pc && Math.min(ANAM_TIMEOUT_MS, left() - RETRY_MIN_MS) < RETRY_MIN_MS) { console.error("janna session: no time left for the member context"); pc = null; }
    }
    const ts = Date.now();
    try {
      if (pc) { // the enriched request first; any HTTP refusal (or no token) → today's request, once
        r = await send({ ...plain, personaConfig: pc }, Math.min(ANAM_TIMEOUT_MS, left() - RETRY_MIN_MS), () => Math.min(ANAM_TIMEOUT_MS, left() - RETRY_MIN_MS));
        sessionToken = await tokenOf(r);
        if (r.ok && sessionToken) personal = true;
        else { console.error("janna session: anam refused the member context", r.status); sessionToken = ""; }
      }
      if (!personal) { const pms = () => (ctx ? Math.min(ANAM_TIMEOUT_MS, Math.max(RETRY_MIN_MS, left())) : ANAM_TIMEOUT_MS); r = await send(plain, pms(), pms); sessionToken = await tokenOf(r); }
    } catch (e) {
      tm.token = Date.now() - ts;
      await countDay(env, nowMs, -1);
      console.error("janna session: anam unreachable", (e && e.name) || "error");
      return fail(502, "upstream_unreachable", cors, null, th());
    }
    tm.token = Date.now() - ts;
    if (!r.ok || !sessionToken) {
      await countDay(env, nowMs, -1);
      console.error("janna session: anam refused", r.status);
      return fail(502, "upstream", cors, { upstream_status: r.status }, th());
    }
    /* 📎 photos in Janna's call (owner 2026-11-20; src/chat-media.js): her token answer carries the call's photo ticket while «🛠️ المطوّر» →
       chat_photos is on, the Worker has its AI binding and a signing secret. Bound to nothing of the visitor (the page may rotate its visitor
       id after this answer: rotate_visitor) — the ticket's own limits do the work. Bassem's photos go with his sign-in instead. */
    const mt = agent === "janna" && env.AI && typeof env.AI.run === "function" && secretOf(env) && (await featureOn(env, "chat_photos")) ? await mediaTicket(env, "j", MAX_SESSION_SEC + 900) : "";
    /* the calls report's row (0011), after the token and outside the answer's path */
    if (tagged && execCtx && typeof execCtx.waitUntil === "function") {
      const ctxKind = !personal || !ctx || ctx.app_only ? "" : agent === "bassem" ? "member" : ctx.memory ? "visitor" : ctx.knowledge ? "knowledge" : "";
      /* a visitor id the page must replace (rotate_visitor: another member's linked id) is not this caller's: no subject */
      const subject = agent === "janna" && !rotateVisitor && vidOk(b.visitor_id) ? "v:" + b.visitor_id : "";
      try { execCtx.waitUntil(recordCall(env, req, { tag, agent, lang, subject, app: app || "", ctx: ctxKind }, agent === "bassem" ? who || { id: "", staff: false } : null)); } catch (e) { /* never the token's problem */ }
    }
    return out({ sessionToken, agent, lang, expires_in: TOKEN_TTL_SEC, max_session_sec: MAX_SESSION_SEC, ...(rotateVisitor ? { rotate_visitor: true } : {}), ...(mt ? { media_ticket: mt } : {}),
      ...(personal && agent === "bassem" && !ctx.app_only ? { member_context: true, ...(ctx.memory ? { memory: true } : {}), ...(ctx.continued ? { continued: true } : {}) } : {}),
      ...(personal && agent === "janna" && !ctx.app_only ? { visitor_context: true, ...(ctx.memory ? { memory: true } : {}), ...(ctx.knowledge ? { knowledge: true } : {}) } : {}),
      ...(personal && ctx.app_rules ? { app_rules: true } : {}) }, 200, cors, th());
  } catch (e) {
    console.error("janna session error", (e && e.message) || "error");
    return fail(500, "server", cors);
  }
}
