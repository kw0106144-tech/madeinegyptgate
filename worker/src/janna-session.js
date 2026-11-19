/* «جنة لايف» without a third-party mark in the video — short-lived Anam session tokens minted by the Worker, so the site runs the
   live call itself with the Anam JS SDK (data/janna-live.js) instead of the agent widget. A widget session carries Anam's disclosure
   mark; SDK sessions do not (Anam docs, security/ai-avatar-disclosure: showAIAvatarDisclosure defaults to false and is bound to the
   token) — the page shows its OWN AI label on the video instead («جنة · مساعِدة بالذكاء الاصطناعي» / "Janna · AI assistant").

   POST /api/janna/session  {agent: "janna" | "bassem", lang: "ar" | "en"}
     200 {sessionToken, agent, lang, expires_in, max_session_sec}
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
   (GET /v1/personas/{id}, PERSONA_TIMEOUT_MS) and the token is minted for an ephemeral copy of it — same avatar, voice, LLM, tools,
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
   The key is never logged, echoed or sent to the browser; errors log the upstream HTTP status only (never the member's data). */
import { readJson, ipHash, rateOk, isBlocked, planCan, isAdmin, site, cairoDay, jparse } from "./common.js";
import { authUser, bearer, isV2, isLinkSession } from "./auth.js";
import { verifyToken } from "./advisor.js";
import { getSecret } from "./crypto.js";
import { memberContext, ephemeralFrom, todayLineAr, fitBlock, BLOCK_MAX } from "./bassem-context.js";
// consolidation (holo4 profile + holo6 memory + holo5 continuation): what Bassem knows about the member when the call starts
import { memoryContext, MEMORY_BLOCK, CONTEXT_MAX, callIdOk } from "./memory.js";
import { memberProfile } from "./profile.js";
import { resumeContext, RESUME_BLOCK } from "./resume.js";
import { forLLM, instructionLike } from "./text.js";
import { jannaSessionContext, visitorContextOn } from "./visitor.js"; // 0009: Janna's memory of her visitors + «بنك المعلومات»
import { featureOn, offMessage } from "./flags.js"; // «🛠️ المطوّر»: janna_live / bassem_live (owner switches, 503 feature_off)

export const ANAM_TOKEN_URL = "https://api.anam.ai/v1/auth/session-token";
export const ANAM_PERSONA_URL = "https://api.anam.ai/v1/personas/"; // + a persona id from PERSONAS (read-only GET, Bassem's member context)
/* agent + lang → Anam persona (the same ids as data/janna-live.js AGENTS); Bassem advises in Arabic on every page */
export const PERSONAS = Object.freeze({
  janna: Object.freeze({ ar: "5f06d835-22cc-4460-b412-84cefa9e565b", en: "e5101653-65b4-44a6-85e5-ec2e78f82685" }),
  bassem: Object.freeze({ ar: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be", en: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be" }),
});
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
const out = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { ...HDR, ...(cors ? { "Access-Control-Allow-Origin": cors } : {}) } });
const fail = (status, code, cors, extra) => out({ error: code, code, ...(extra || {}) }, status, cors);

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
/* ANAM_API_KEY (wrangler secret), else the key the owner saved in the Control Center (sealed slot, migrations/0006) */
async function anamKey(env) {
  if (env.ANAM_API_KEY) return String(env.ANAM_API_KEY);
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
   allowed only as staff, {no: [status, code]} = refused */
async function bassemCaller(req, env) {
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
    const turns = rows.reverse().map(r => ({ role: jparse(r.data_json, {}).role === "user" ? "member" : "bassem", text: forLLM(r.text, 600) }))
      .filter(t => t.text && !instructionLike(t.text, { money: false }));
    return resumeContext({ turns }, { maxChars: CONTINUE_MAX_CHARS, maxItems: 12 });
  } catch (e) { return ""; } // no 0008 table yet: the part starts fresh
}
export async function bassemContext(env, m, lang, b, nowMs = Date.now()) {
  const cont = await continuation(env, m.id, b && b.continue_call, nowMs), o = { continued: !!cont };
  const base = memberContext(m, lang, o) || memberContext(m, lang, { ...o, anonymous: true });
  if (!base) return null;
  const prof = await memberProfile(env, m.id);
  const parts = [base.block, "- " + todayLineAr(nowMs) + " (بتوقيت القاهرة)."];
  if (cont) parts.push("", RESUME_BLOCK[0], cont, RESUME_BLOCK[1]);
  if (prof && prof.block) parts.push("", prof.block);
  const room = Math.min(CONTEXT_MAX, BLOCK_MAX - parts.join("\n").length - MEMORY_BLOCK[0].length - MEMORY_BLOCK[1].length - 8);
  const mem = room >= 300 ? await memoryContext(env, m.id, { nowMs, max: room }) : "";
  if (mem) parts.push("", MEMORY_BLOCK[0], mem, MEMORY_BLOCK[1]);
  if (base.anonymous && !mem && !(prof && prof.block) && !cont) return null; // nothing to add for a member Bassem cannot greet by name
  return { ...base, block: fitBlock(parts.join("\n")), memory: !!mem, profile: !!(prof && prof.block) };
}

/* tokens issued today (Cairo day) for the whole site — the same rl table as the other limits, its own key per day */
async function countDay(env, nowMs, delta) {
  const day = cairoDay(nowMs), k = "jsessday|" + day;
  if (delta > 0) await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(k, new Date(Date.parse(day + "T00:00:00Z") + 2 * 86400000).toISOString()).run();
  else await env.DB.prepare("UPDATE rl SET n = MAX(0, n - 1) WHERE k = ?").bind(k).run();
  return (await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(k).first("n")) || 0;
}

export async function handleJannaSession(req, env) {
  const startMs = Date.now(); // the member-context budget (ANAM_BUDGET_MS) counts from here: key, D1 checks and Anam calls
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
  const key = await anamKey(env);
  if (!key) return fail(503, "anam_not_configured", cors);
  if (!env.DB) return fail(503, "store_off", cors);
  try {
    const nowMs = Date.now(), ih = await ipHash(req, env);
    if (await isBlocked(env, { ip_hash: ih })) return fail(403, "blocked", cors);
    if (!(await rateOk(env, "jsess|" + ih, perHour(env), 3600, nowMs))) return fail(429, "rate_limited", cors, { retry_after: 3600 - Math.floor(nowMs / 1000) % 3600 });
    let ctx = null; // Bassem's member context: only from the member's own D1 rows (profile, memory, this call's turns), never from the page
    if (agent === "bassem") { const c = await bassemCaller(req, env); if (c.no) return fail(c.no[0], c.no[1], cors); if (!c.staff && memberContextOn(env, b)) ctx = await bassemContext(env, c.m, lang, b, nowMs); }
    else if (visitorContextOn(env, b)) ctx = await jannaSessionContext(env, req, b, lang, nowMs); // Janna: the visitor's memory + the knowledge bank (null = plain)
    /* review 2026-11-19 #7: the page's visitor id is another member's (or the signed-out member's) → the page starts a new one; nothing to add → plain */
    const rotateVisitor = !!(ctx && ctx.rotate_visitor); if (ctx && agent === "janna" && !ctx.block) ctx = null;
    const personaId = PERSONAS[agent][lang];
    const personaP = ctx ? savedPersona(key, personaId) : null; // read while the day is counted; never rejects (null on any failure)
    if ((await countDay(env, nowMs, 1)) > dailyCap(env)) { await countDay(env, nowMs, -1); return fail(429, "daily_cap", cors); } // refused ones are not counted
    const plain = { personaConfig: { personaId }, sessionOptions: { showAIAvatarDisclosure: false }, expiresInSeconds: TOKEN_TTL_SEC, maxSessions: 1, clientLabel: "madeinegyptgate-" + agent + "-" + lang };
    const send = async (body, ms) => {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
      try {
        return await fetch(ANAM_TOKEN_URL, { method: "POST", signal: ctl.signal,
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      } finally { clearTimeout(tm); }
    };
    const tokenOf = async r => { let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ } return j && typeof j.sessionToken === "string" ? j.sessionToken : ""; };
    const left = () => ANAM_BUDGET_MS - (Date.now() - startMs);
    let r, sessionToken = "", personal = false, pc = null;
    if (personaP) {
      const p = await personaP;
      /* Janna without a returning visitor (the knowledge bank only): her own first sentence from the Lab stays */
      if (p && ctx && !ctx.greeting && !ctx.continued && typeof p.initialMessage === "string" && p.initialMessage.trim()) ctx = { ...ctx, greeting: p.initialMessage.trim() };
      pc = ephemeralFrom(p, ctx, MAX_SESSION_SEC);
      if (p && !pc) console.error("janna session: the saved persona cannot be copied for the member context");
      if (pc && Math.min(ANAM_TIMEOUT_MS, left() - RETRY_MIN_MS) < RETRY_MIN_MS) { console.error("janna session: no time left for the member context"); pc = null; }
    }
    try {
      if (pc) { // the enriched request first; any HTTP refusal (or no token) → today's request, once
        r = await send({ ...plain, personaConfig: pc }, Math.min(ANAM_TIMEOUT_MS, left() - RETRY_MIN_MS));
        sessionToken = await tokenOf(r);
        if (r.ok && sessionToken) personal = true;
        else { console.error("janna session: anam refused the member context", r.status); sessionToken = ""; }
      }
      if (!personal) { r = await send(plain, ctx ? Math.min(ANAM_TIMEOUT_MS, Math.max(RETRY_MIN_MS, left())) : ANAM_TIMEOUT_MS); sessionToken = await tokenOf(r); }
    } catch (e) {
      await countDay(env, nowMs, -1);
      console.error("janna session: anam unreachable", (e && e.name) || "error");
      return fail(502, "upstream_unreachable", cors);
    }
    if (!r.ok || !sessionToken) {
      await countDay(env, nowMs, -1);
      console.error("janna session: anam refused", r.status);
      return fail(502, "upstream", cors, { upstream_status: r.status });
    }
    return out({ sessionToken, agent, lang, expires_in: TOKEN_TTL_SEC, max_session_sec: MAX_SESSION_SEC, ...(rotateVisitor ? { rotate_visitor: true } : {}),
      ...(personal && agent === "bassem" ? { member_context: true, ...(ctx.memory ? { memory: true } : {}), ...(ctx.continued ? { continued: true } : {}) } : {}),
      ...(personal && agent === "janna" ? { visitor_context: true, ...(ctx.memory ? { memory: true } : {}), ...(ctx.knowledge ? { knowledge: true } : {}) } : {}) }, 200, cors);
  } catch (e) {
    console.error("janna session error", (e && e.message) || "error");
    return fail(500, "server", cors);
  }
}
