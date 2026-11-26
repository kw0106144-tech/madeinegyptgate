/* «تقرير مكالمات جنة وباسم اليومي» — the daily calls report e-mail (owner, 2026-11-20: «لازم يجيلي علي الايميل تقرير يومي بايه اللي هي
   قالته للناس ومين كلمها وسالوها ايه وبياناتهم ايه وباسم نفس الموضوع عشان ابقي عارف مين بيزورنا وهل هي بترد صح ولا لا»).
   Every morning (platform cron, index.js platformCron → callsReportCron, its own D1 budget) the report of the previous Cairo day goes to the
   recipients the owner set in «🛠️ المطوّر» ← «تقرير المكالمات» (default: the platform's own mailboxes, common.js adminEmails), through the
   e-mail center (template team_calls_report, «البريد» can switch it off). For every live call (Anam) with Janna (AR / EN) and Bassem: who
   talked and what they said about themselves, what they asked, what the persona said and did (tools and their results), the outcome, and
   an automatic verdict (calls-review.js) with what was missed («كان ممكن», from real searches run on the report morning).
   Sources (read only): Anam REST with the Worker's Anam key (service-keys.js anamKey — the key meetings.js reads sessions with): the day's
   session list (perPage 50, ≤ 4 pages; every list row is cut down AT ONCE to its id, label, persona, times, exit status and a device class:
   it carries the whole persona snapshot), then per session of ≥ 20 s that joined GET /v1/sessions/{id} (the tool calls with arguments and
   results) and GET /v1/sessions/{id}/analytics?includeMessages=true (each turn's text, timing, tools); the transcript only while analytics
   answers 404. ≤ 150 GETs per run (the scheduled event runs meetingsCron and platformCron in ONE invocation, index.js scheduled), 4 at a
   time, 8 s each, one retry on 429 / 503. /recording is never fetched. D1 (≤ 40 statements): the call tags of migration 0011
   (call_sessions), members / staff, requests, meetings (+ recording consent), tasks, «بنك المعلومات», Janna's visitors (never the hashes),
   the memory turns (one cc_audit calls_report.memory_read row FIRST), follows, the mail log, WhatsApp out rows, deals, page views.
   Privacy (privacy_spec, CLAUDE.md 2.5): a Janna call shows a member ONLY through that call's own sign-in (call_sessions.member_id); a
   visitor is «زائر ·xxxx» (4 hex characters of an HMAC — the raw visitor id never leaves D1); contacts are masked (detail «masked», the
   default) — «full» is the owner's own audited choice, only when every recipient is on madeinegyptgate.com, and adds the clear e-mail and
   mobile of members and of people who submitted a form or booked a meeting; nothing ever comes from a transcript but ≤ 2 masked quotes
   per side; a session tied to a meeting without recording consent gives counts, the outcome and the booking only. The body never carries
   session ids, tags or rule codes (the CSV attachment does, for the team). Switch: flags.js calls_report (OFF = no report and no Anam read).
   Idempotency: a lock row (rl callrep-lock|D, 10 min), deliver()'s 24 h message dedupe, the gate cron_runs('calls-report', D) + one cc_audit
   row written in ONE batch only after the provider answered with an id; 7 failures → cron_runs('calls-report-failed', D) and the next
   report says so. Without migration 0011 everything works (identities by the other joins, with the note «شغّل 0011»).
   Admin API (acc.js → acc-dev.js, dev.manage = owner only, origin-only CORS, the write limit):
     GET  /api/admin/cc/dev/calls-report          settings, the last 7 runs, the Anam probe, the switch
     PUT  /api/admin/cc/dev/calls-report          {to[], time, detail, tests, empty, keep_days, confirm_external?, confirm_full?} → audited dev.calls_report
     POST /api/admin/cc/dev/calls-report/send     {day} → ≤ 3 per report day, id callrep-<D>-r<n>, audited calls_report.send
     GET  /api/admin/cc/dev/calls-report/preview?day=  → {subject, html, text, counts, warnings} — ≤ 6 per 10 min, audited calls_report.preview */
import DATA from "./data.json";
import { iso, line, cairoDay, cairoHM, addDays, rateOk, secretOf, site, adminEmails, fromAddr, team, isEmail, jparse, hmac, PLAN_NAME, effPlan, govName } from "./common.js";
import { hasTable, dayStartIso, dayAfterIso, maskEmail, auditStmt, fail, body as readBody, batch, dateOk, adminList, rid } from "./acc-base.js";
import { deliver, mailReady, attachOk, loadMailConfig } from "./email-center.js";
import { budgetEnv, budgetLeft } from "./memory.js"; // the cron's own D1 budget (memory.js budgetDB: every statement counts)
import { anamKey } from "./service-keys.js";
import { featureOn, featureDef, stateOf, CALLS_REPORT_KEY } from "./flags.js";
import { clean, norm, maskPII, asciiDigits } from "./text.js";
import { reviewConversation, memoryJoin, quote, words, flatArgs, FLAG_ORDER } from "./calls-review.js";
import { renderReport, ar, bdi, nAr } from "./calls-render.js";
import { RETURN_GREETING } from "./visitor.js";
import { PERSONAS } from "./janna-session.js";
import { guardDayRange, guardTotals, GUARD_SQL } from "./guard.js"; // «حماية الموقع»: the day's copy attempts (one line of the summary)

export { CALLS_REPORT_KEY };
export const CALLS_DEFAULTS = Object.freeze({ time: "08:30", detail: "masked", tests: "summary", empty: "send", keep_days: 180 });
export const CALLS_LIM = Object.freeze({ toMax: 5, timeMin: "05:00", timeMax: "12:00", keepMin: 30, keepMax: 730, sendsPerDay: 3, previewsPer10Min: 6, daysBack: 90,
  anamGets: 150, anamParallel: 4, anamTimeoutMs: 8000, perPage: 50, listPages: 4, transcriptPages: 5, minSessionMs: 20000, failMax: 6, lockMs: 600000, memoryRows: 4000,
  d1Statements: 40, budget: 80, searches: 30, groupGapMs: 180000, greetGapMs: 90000 });
export const DOMAIN = "madeinegyptgate.com";
export const ANAM_API = "https://api.anam.ai/v1";
export const FROM_NAME = "تقارير منصة صنع في مصر";
/* the sentence the owner confirms before «full» contacts go into the e-mail (stored with the setting and in the audit row) */
export const FULL_CONFIRM = Object.freeze({
  ar: "أنا موافق إن تقرير المكالمات يوصل فيه إيميل وموبايل الأعضاء واللي بعتوا طلب أو حجزوا اجتماع كاملين، لمستلمين على madeinegyptgate.com بس.",
  en: "I agree that the calls report carries the full e-mail and mobile of members and of people who submitted a request or booked a meeting, to recipients on madeinegyptgate.com only." });
const internal = e => String(e || "").toLowerCase().endsWith("@" + DOMAIN);
const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeOk = t => typeof t === "string" && TIME_RX.test(t) && t >= CALLS_LIM.timeMin && t <= CALLS_LIM.timeMax;
const keepOk = v => Number.isInteger(v) && (v === 0 || (v >= CALLS_LIM.keepMin && v <= CALLS_LIM.keepMax));
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_RX = /^madeinegyptgate-(janna|bassem)-(ar|en|meeting)(?:\.([a-z2-7]{12}))?$/;
const PERSONA_OF = (() => { const m = {}; m[PERSONAS.janna.ar] = ["janna", "ar"]; m[PERSONAS.janna.en] = ["janna", "en"]; m[PERSONAS.bassem.ar] = ["bassem", "ar"]; return m; })();
const enc = encodeURIComponent;
const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const tenMin = 600000;

/* ---------- settings (cc_settings k = dev.calls_report, scope 'system'; dev.* is reserved for the owner's /dev API — acc-plans.js) ---------- */
export async function readSettings(env) {
  let row = null; try { row = await env.DB.prepare("SELECT v FROM cc_settings WHERE k = ? AND scope = 'system'").bind(CALLS_REPORT_KEY).first(); } catch (e) { row = null; }
  const o = row ? jparse(row.v, {}) : {}, saved = Array.isArray(o.to) ? o.to.map(x => line(x, 254).toLowerCase()).filter(isEmail).slice(0, CALLS_LIM.toMax) : [];
  const to = saved.length ? saved : adminEmails(env);
  return { saved: !!row, to, savedTo: saved, usingDefault: !saved.length, time: timeOk(o.time) ? o.time : CALLS_DEFAULTS.time,
    detail: o.detail === "full" && saved.length && saved.every(internal) ? "full" : "masked", tests: ["summary", "full", "off"].includes(o.tests) ? o.tests : CALLS_DEFAULTS.tests,
    empty: o.empty === "skip" ? "skip" : "send", keep_days: keepOk(o.keep_days) ? o.keep_days : CALLS_DEFAULTS.keep_days, by: line(o.by, 254), at: line(o.at, 40),
    full_confirmed: o.full_confirmed && typeof o.full_confirmed === "object" ? o.full_confirmed : null };
}
const maskList = list => (list || []).map(maskEmail);
/* the default recipients as the footer shows them: the platform's own addresses in full, any other masked */
const shownDefault = list => (list || []).map(a => (internal(a) ? a : maskEmail(a)));

/* ---------- the gate, the lock, the failure counter (rl / cron_runs) ---------- */
async function gateOf(env, day) {
  const r = (await env.DB.prepare("SELECT job FROM cron_runs WHERE day = ? AND job IN ('calls-report', 'calls-report-failed')").bind(day).all()).results || [];
  return { sent: r.some(x => x.job === "calls-report"), failed: r.some(x => x.job === "calls-report-failed") };
}
async function takeLock(env, day, nowMs) {
  const r = await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = rl.n + 1, exp = excluded.exp WHERE rl.exp < ?")
    .bind("callrep-lock|" + day, iso(nowMs + CALLS_LIM.lockMs), iso(nowMs)).run();
  return !!(r && r.meta && r.meta.changes === 1);
}
const dropLock = (env, day) => env.DB.prepare("DELETE FROM rl WHERE k = ?").bind("callrep-lock|" + day).run().catch(() => null);
async function bumpTry(env, day, nowMs) {
  return (await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = rl.n + 1 RETURNING n").bind("callrep-try|" + day, iso(nowMs + 3 * 86400000)).first("n")) || 0;
}
const gateStmt = (env, job, day, nowMs) => env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES (?, ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(job, day, iso(nowMs));
const SYSTEM = { actor_id: "system", actor_email: "", actor_role: "system" };

/* ---------- Anam (read only) ---------- */
/* one GET client per run: ≤ cap GETs (a retry counts too), `parallel` at a time, timeoutMs each (the body included), one retry on 429 / 503
   after min(Retry-After, 5 s); reserve(n) books GETs before a session is read so parallel reads never pass the cap */
export function anamClient(key, { cap = CALLS_LIM.anamGets, parallel = CALLS_LIM.anamParallel, timeoutMs = CALLS_LIM.anamTimeoutMs, sleep } = {}) {
  let used = 0, booked = 0, active = 0; const wait = [];
  const nap = sleep || (t => new Promise(r => setTimeout(r, t)));
  const acquire = () => new Promise(r => { if (active < parallel) { active++; r(); } else wait.push(r); });
  const release = () => { const n = wait.shift(); if (n) n(); else active--; };
  async function once(path) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(ANAM_API + path, { method: "GET", signal: ctl.signal, headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
      let j = null; if (r.status === 200) { try { j = await r.json(); } catch (e) { j = null; } } else { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } }
      return { status: r.status, json: j, retryAfter: parseFloat(r.headers.get("Retry-After")) };
    } catch (e) { return { status: 0, error: e && e.name === "AbortError" ? "timeout" : "unreachable" }; } finally { clearTimeout(tm); }
  }
  async function get(path, { reserved = false } = {}) {
    if (reserved) booked = Math.max(0, booked - 1); else if (used + booked >= cap) return { status: 0, capped: true };
    used++; // counted at once, before waiting for a slot: callers running in parallel (and a booked GET turning into a real one) see it
    await acquire();
    try {
      let r = await once(path);
      if ((r.status === 429 || r.status === 503) && used + booked < cap) { await nap(Math.min(5, Number.isFinite(r.retryAfter) && r.retryAfter >= 0 ? r.retryAfter : 1) * 1000); used++; r = await once(path); }
      return r;
    } finally { release(); }
  }
  return { get, reserve: n => { if (used + booked + n > cap) return false; booked += n; return true; }, unbook: n => { booked = Math.max(0, booked - n); }, used: () => used, left: () => cap - used - booked };
}
/* «صحة الموقع» (acc-dev.js getHealth) and every report run: can the key read sessions? GET /v1/sessions?perPage=1 — never a write */
const PROBE = new WeakMap(); // env.DB → {at, v} (one Anam GET per isolate per minute at most)
export async function anamProbe(env, { fresh = false } = {}) {
  const k = env && env.DB, hit = k && PROBE.get(k);
  if (!fresh && hit && Date.now() - hit.at < 60000) return hit.v;
  const key = await anamKey(env), t0 = Date.now();
  let v;
  if (!key) v = { ok: false, status: 0, ms: 0, code: "no_key", detail_ar: "مفيش مفتاح Anam (لا سر على الـ Worker ولا مفتاح في «مفاتيح الخدمات»)", detail_en: "No Anam key (neither a Worker secret nor a key in «Service keys»)" };
  else {
    const r = await anamClient(key, { cap: 2, parallel: 1, timeoutMs: 6000 }).get("/sessions?perPage=1&page=1");
    const ms0 = Date.now() - t0;
    v = r.status === 200 ? { ok: true, status: 200, ms: ms0, code: "ok", detail_ar: "", detail_en: "" }
      : r.status === 401 || r.status === 403 ? { ok: false, status: r.status, ms: ms0, code: "no_read", detail_ar: "المفتاح مالوش صلاحية قراءة الجلسات — فعّل Sessions: Read للمفتاح في Anam Lab. لحد كده التقرير بيطلع من بيانات المنصة بس.", detail_en: "The key cannot read sessions — enable Sessions: Read on the key in Anam Lab. Until then the report uses the platform's data only." }
      : { ok: false, status: r.status, ms: ms0, code: r.status ? "status" : r.error || "unreachable", detail_ar: r.status ? "Anam رد بـ " + r.status : "Anam مش بيرد", detail_en: r.status ? "Anam answered " + r.status : "Anam did not answer" };
  }
  if (k) PROBE.set(k, { at: Date.now(), v });
  return v;
}

/* a list row → the few fields the report keeps; everything else (the persona snapshot with the prompt and any injected member / visitor /
   memory block, the client metadata, the user agent) is dropped right here. For a Bassem session without a known 0011 tag ONLY his member
   block's title + first name, company, sector and plan are taken (bassem-context.js memberContext). */
export function reduceRow(x, knownTags) {
  if (!x || typeof x !== "object" || !UUID_RX.test(String(x.id || ""))) return null;
  const label = typeof x.clientLabel === "string" ? x.clientLabel : "", m = LABEL_RX.exec(label), pid = String(x.personaId || "").toLowerCase(), po = PERSONA_OF[pid];
  const start = ms(x.startTime), end = ms(x.endTime);
  const row = { id: String(x.id).toLowerCase(), agent: m ? m[1] : po ? po[0] : "", lang: m ? (m[2] === "en" ? "en" : "ar") : po ? po[1] : "ar", tag: m && m[3] ? m[3] : "",
    site: !!m && m[2] !== "meeting", meeting: !!m && m[2] === "meeting", outside: !m && !!po, start, end, len: Number(x.sessionLengthMs) > 0 ? Number(x.sessionLengthMs) : start != null && end != null ? end - start : 0,
    exit: line(x.exitStatus, 40), device: deviceOf(uaOf(x)), block: null };
  const known = row.tag && knownTags && knownTags.get(row.tag);
  if (row.agent === "bassem" && row.site && !(known && known.member_id)) row.block = memberBlock(promptOf(x.personaConfig));
  return row.agent ? row : null; // anything else (avatar-video renders, other labels) is not a call of the site's personas
}
const uaOf = x => { const c = x && x.clientMetadata; if (!c || typeof c !== "object") return ""; for (const k of ["userAgent", "user_agent", "ua"]) if (typeof c[k] === "string") return c[k]; return ""; };
const promptOf = pc => (pc && typeof pc === "object" ? (typeof pc.systemPrompt === "string" ? pc.systemPrompt : pc.brain && typeof pc.brain.systemPrompt === "string" ? pc.brain.systemPrompt : "") : "");
/* the device class only (never the user agent): iPhone / Android / desktop, inside the Google / Facebook / Instagram app, the platform's own app */
export function deviceOf(ua) {
  const u = String(ua || ""), app = /MIGApp\/[\d.]+\s*\((ios|android)\)/i.exec(u);
  return { os: /iPhone|iPad|iPod/i.test(u) ? "iphone" : /Android/i.test(u) ? "android" : u ? "desktop" : "", inapp: /\bGSA\//.test(u) ? "google" : /FBAN|FBAV|FB_IAB/.test(u) ? "facebook" : /Instagram/i.test(u) ? "instagram" : "", app: app ? app[1].toLowerCase() : "" };
}
/* Bassem's member block (bassem-context.js memberContext): «# بيانات العضو في الجلسة دي» … title + first name, company, sector, plan — nothing else */
export function memberBlock(prompt) {
  const p = String(prompt || ""), at = p.indexOf("# بيانات العضو في الجلسة دي");
  if (at < 0) return null;
  const body = p.slice(at, at + 2500), get = rx => { const m = rx.exec(body); return m ? clean(m[1], 80) : ""; };
  const addr = get(/^- لقبه واسمه الأول: ([^.\n،]+)/m), company = get(/^- الشركة: ([^\n]+)/m), sector = get(/^- القطاع: ([^\n]+)/m), plan = get(/^- الباقة: ([^،\n]+)/m);
  const sp = addr.split(" "), title = sp.length > 1 ? sp[0] : "", first = sp.length > 1 ? sp.slice(1).join(" ") : addr;
  return { title, first, company, sector, plan, anonymous: !addr };
}

/* Anam's session detail + analytics → the turns calls-review.js reads; the transcript (≤ 5 pages of 100) only while analytics answers 404.
   A server (webhook) tool's arguments come nested as {bodyParams: {…}}: they are flattened here (calls-review.js flatArgs) */
export function turnsFromAnalytics(an, ses) {
  const byTurn = new Map(), all = Array.isArray(ses && ses.toolCalls) ? ses.toolCalls : [];
  for (const t of all) { const k = Number.isInteger(t.turnIndex) ? t.turnIndex : -1; if (!byTurn.has(k)) byTurn.set(k, []); byTurn.get(k).push({ name: t.toolName || "", status: t.status || "", args: flatArgs(t.arguments), result: t.result, error: t.errorMessage || "", id: t.toolCallId || "" }); }
  return (Array.isArray(an && an.turns) ? an.turns : []).map(t => {
    const tools = [...(byTurn.get(t.turnIndex) || [])];
    for (const x of Array.isArray(t.toolCalls) ? t.toolCalls : []) if (!tools.some(y => y.id && y.id === x.toolCallId)) tools.push({ name: x.toolName || "", status: x.status || "", args: null, result: null, error: x.errorMessage || "", id: x.toolCallId || "" });
    const cid = String(t.correlationId || "");
    return { i: Number.isInteger(t.turnIndex) ? t.turnIndex : 0, user: typeof t.userMessage === "string" ? t.userMessage : "", persona: typeof t.assistantMessage === "string" ? t.assistantMessage : "",
      uStart: ms(t.userSpeechStartTime), uEnd: ms(t.userSpeechEndTime) != null ? ms(t.userSpeechEndTime) : ms(t.userTranscriptionTime), pStart: ms(t.personaStartSpeakingTime), pStop: ms(t.personaStopSpeakingTime),
      firstAudio: typeof t.firstAudioLatencySeconds === "number" ? t.firstAudioLatencySeconds : null, speak: typeof t.speakingDurationSeconds === "number" ? t.speakingDurationSeconds : null,
      interrupted: !!t.wasInterrupted, origin: /^engine::/.test(cid) ? "engine" : /^external::/.test(cid) ? "typed" : "", tools };
  }).sort((a, b) => a.i - b.i);
}
export function turnsFromTranscript(msgs) {
  const out = []; let cur = null, n = 0;
  for (const m of Array.isArray(msgs) ? msgs : []) {
    const text = typeof m.message === "string" && m.message !== "TRANSCRIPTS_DISABLED" ? m.message : "", t = ms(m.timestamp);
    if (m.role === "user") { cur = { i: n++, user: text, persona: "", uStart: t, uEnd: t, pStart: null, pStop: null, firstAudio: null, speak: null, interrupted: false, origin: "", tools: [] }; out.push(cur); }
    else {
      if (!cur || cur.persona) { cur = { i: n++, user: "", persona: "", uStart: null, uEnd: null, pStart: null, pStop: null, firstAudio: null, speak: null, interrupted: false, origin: "", tools: [] }; out.push(cur); }
      cur.persona = text; cur.pStart = t; cur.speak = typeof m.speakingDurationSeconds === "number" ? m.speakingDurationSeconds : null; cur.interrupted = !!m.wasInterrupted;
      if (t != null && cur.speak != null) cur.pStop = t + cur.speak * 1000;
    }
  }
  return out;
}

/* ---------- D1: one fail-soft read (a missing table is noted, never fatal) ---------- */
function d1(env, notes) {
  let used = 0;
  const q = async (key, sql, ...args) => {
    if (used >= CALLS_LIM.d1Statements || budgetLeft(env) < 12) { notes.budget = true; return []; }
    used++;
    try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; }
    catch (e) { if (/no such table/i.test(String((e && e.message) || e))) notes.missing.add(key); else notes.failed.add(key); return []; }
  };
  q.used = () => used;
  return q;
}
const IN = n => Array.from({ length: n }, () => "?").join(", ");
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
/* «زائر ·xxxx»: 4 hex characters of HMAC(secret, 'callrep-vid|' + visitor id) — stable, not reversible, not usable as the id */
async function aliasOf(env, vid) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretOf(env) || "mig"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("callrep-vid|" + vid)));
  return [...sig.slice(0, 2)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/* the e-mail center's keyed recipient hash (email-center.js toHash): Bassem's notes to a member, matched without reading any address */
const mailHash = async (env, addr) => (await hmac(secretOf(env) || "mig", "mail|" + String(addr || "").trim().toLowerCase())).slice(0, 32);
const last2 = p => { const d = String(p || "").replace(/[^0-9٠-٩]/g, ""); return d.length >= 2 ? "…" + ar(d.slice(-2)) : ""; };

/* ---------- the report of one Cairo day ---------- */
const KIND_AR = { contact: ["رسالة تواصل", "message"], rfq: ["طلب عرض سعر", "RFQ"], basket: ["طلب سلة منتجات", "basket request"], opp_offer: ["عرض على فرصة", "offer on an opportunity"], lead_interest: ["اهتمام بفرصة", "interest"],
  project_interest: ["اهتمام بمشروع", "project interest"], entity_contact: ["تواصل مع جهة", "entity contact"], signup: ["طلب اشتراك", "membership application"], profile_fix: ["تصحيح بيانات", "data correction"] };
const INQ_ST = { received: ["اتسجّل", "received"], routed: ["اتبعت للمصانع المطابقة", "routed"], in_progress: ["محتاج تدخّل الفريق", "needs the team"], no_match: ["مفيش مصنع مطابق لسه", "no match yet"],
  replied: ["جاله رد", "answered"], recorded: ["اتسجّل", "recorded"], closed: ["اتقفل", "closed"], blocked: ["اتوقف", "blocked"] };
const DOW_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"], MONTH_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const dayLabelAr = d => { const [y, m, dd] = d.split("-").map(Number); return DOW_AR[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] + " " + ar(dd) + " " + MONTH_AR[m - 1]; };
const cairoTime = t => (Number.isFinite(t) ? cairoHM(t) : "");
const OPEN_ST = new Set(["سارية", "تنتهي قريباً"]);
/* «اتبعت لمصنعين مسجّلين» (report review 2026-11-20 #12: numbers agree with their noun) */
const routedAr = n => (n ? "اتبعت " + nAr(n, "لمصنع واحد مسجّل", "لمصنعين مسجّلين", "مصانع مسجّلة", "مصنع مسجّل").replace(/^([٠-٩]+) /, "لـ $1 ") : "لسه ماتبعتش لأي مصنع");
/* the parts of the platform's data a note names, in the owner's words (#14: no table names in the body — they go to the warnings that
   «المطوّر» shows) */
const DATA_AR = { inquiries: ["الطلبات", "requests"], meetings: ["الاجتماعات", "meetings"], memory_tasks: ["المهام", "tasks"], follows: ["المتابعات", "follows"], cc_mail_log: ["سجل الإيميلات", "the e-mail log"],
  wa_messages: ["رسايل الواتساب", "WhatsApp messages"], deals: ["الصفقات", "deals"], cc_staff: ["فريق المنصة", "the platform team"], members: ["الأعضاء", "members"], janna_visitors: ["زوار جنة", "Janna's visitors"],
  advisor_memory: ["ذاكرة جنة وباسم", "Janna's and Bassem's memory"], cc_pv_day: ["زيارات الموقع", "site visits"], cc_pv_src: ["مصادر الزيارات", "visit sources"], knowledge_bank: ["بنك المعلومات", "the knowledge bank"],
  cron_runs: ["سجل التقارير اللي فاتت", "the earlier reports"], cc_audit: ["سجل العمليات", "the audit log"], call_sessions: ["ربط المكالمات بأصحابها", "the call tags"] };
const dataAr = keys => [...new Set(keys.map(k => (DATA_AR[k] || ["بيانات تانية", "other data"])[0]))].join("، ");
const dataEn = keys => [...new Set(keys.map(k => (DATA_AR[k] || ["بيانات تانية", "other data"])[1]))].join(", ");

/* opts: {day, nowMs, settings, mode: cron | send | preview, actor (audit fields), CC (CC.lookup = index.js search / tenderStatus / places / section)} → {rep, rendered, counts, warnings} */
export async function buildReport(env, { day, nowMs = Date.now(), settings, mode = "cron", actor = SYSTEM, CC, sleep } = {}) {
  const startIso = dayStartIso(day), endIso = dayAfterIso(day), startMs = Date.parse(startIso), endMs = Date.parse(endIso);
  const notes = { missing: new Set(), failed: new Set(), budget: false }, warn = [], Q = d1(env, notes);
  try { await loadMailConfig(env); } catch (e) { /* the e-mail center's memo for this D1 object (the cron's budgeted one is new): attachOk below reads it */ }
  const lookup = (CC && CC.lookup) || {}, places = [...Object.keys(lookup.GOV || {}), ...Object.keys(lookup.CITY_GOV || {})];
  /* 0) 0011: the call tags of the window (+ 10 min before: a token is minted just before its session starts) */
  const has0011 = await hasTable(env, "call_sessions");
  const tagRows = has0011 ? await Q("call_sessions", "SELECT tag, agent, lang, subject, member_id, staff, app, ctx, created_at, session_id FROM call_sessions WHERE created_at >= ? AND created_at < ? LIMIT 2000", iso(startMs - tenMin), endIso) : [];
  const tags = new Map(tagRows.map(r => [r.tag, r]));
  /* 1) Anam */
  const key = await anamKey(env);
  let anam = key ? "ok" : "no_key", listed = [], notRead = 0, listCut = false, gets = 0;
  const A = key ? anamClient(key, { sleep }) : null;
  if (A) {
    const L = await listSessions(A, startIso, endIso, tags);
    if (L.auth) anam = "no_read"; else if (L.error && !L.rows.length) anam = "unreachable";
    /* Anam filters on the creation time; a session that STARTED far outside the day (a clock oddity) is left to its own day */
    listed = L.rows.filter(r => r.start == null || (r.start >= startMs - 300000 && r.start < endMs + 300000)); listCut = L.cut;
  }
  /* 0011: the report fills session_id of the tags it found (≤ 30 a statement, 3 bound values each) */
  const fill = listed.filter(r => r.tag && tags.has(r.tag) && !tags.get(r.tag).session_id);
  for (const c of chunks(fill, 30).slice(0, 4)) {
    if (budgetLeft(env) < 16) break;
    try { await env.DB.prepare(`UPDATE call_sessions SET session_id = CASE tag ${c.map(() => "WHEN ? THEN ?").join(" ")} ELSE session_id END WHERE session_id = '' AND tag IN (${IN(c.length)})`).bind(...c.flatMap(r => [r.tag, r.id]), ...c.map(r => r.tag)).run(); } catch (e) { /* fail-soft */ }
  }
  const anamOk = anam === "ok";
  /* 2) D1: meetings first (their consent decides what may be read of a session) */
  const ids = listed.map(r => r.id);
  const meetings = [...(ids.length ? (await Promise.all(chunks(ids, 80).map(c => Q("meetings", `SELECT id, kind, status, name, email, phone, company, language, consent, starts_at, session_id, created_at FROM meetings WHERE session_id IN (${IN(c.length)})`, ...c)))).flat() : []),
    ...(await Q("meetings", "SELECT id, kind, status, name, email, phone, company, language, consent, starts_at, session_id, created_at FROM meetings WHERE created_at >= ? AND created_at < ? LIMIT 200", startIso, endIso))];
  const meetBySid = new Map(), meetById = new Map(); for (const m of meetings) { meetById.set(m.id, m); if (m.session_id) meetBySid.set(String(m.session_id).toLowerCase(), m); }
  /* 3) the details: the longest sessions first (site sessions before outside ones), within the GET cap */
  const readable = listed.filter(r => !r.meeting && r.len >= CALLS_LIM.minSessionMs && r.exit !== "CLOSED_NEVER_JOINED").sort((a, b) => (a.outside - b.outside) || (b.len - a.len));
  const detail = new Map();
  if (anamOk) {
    let i = 0;
    const worker = async () => {
      while (i < readable.length) {
        const r = readable[i++], mt = meetBySid.get(r.id), counts = !!(mt && !mt.consent), need = counts ? 1 : 2;
        if (!A.reserve(need)) { notRead++; continue; }
        detail.set(r.id, await readSession(A, r, counts));
      }
    };
    await Promise.all(Array.from({ length: CALLS_LIM.anamParallel }, worker));
    gets = A.used();
  }
  /* 4) D1: who, what happened (fail-soft, ≤ 40 statements) */
  const vids = new Set(), memberIds = new Set();
  for (const t of tagRows) { if (/^v:[0-9a-f]{32}$/.test(t.subject)) vids.add(t.subject.slice(2)); if (t.member_id) memberIds.add(t.member_id); }
  const inquiries = await Q("inquiries", "SELECT ref, kind, status, source, user_id, name, company, email, phone, routed_count, payload_json, created_at FROM inquiries WHERE created_at >= ? AND created_at < ? AND (source IN ('janna', 'bassem') OR payload_json LIKE '%\"call_sid\"%') LIMIT 500", startIso, iso(endMs + tenMin));
  const tasks = await Q("memory_tasks", "SELECT subject, agent, kind, status, created_at FROM memory_tasks WHERE created_at >= ? AND created_at < ? LIMIT 1000", startIso, iso(endMs + tenMin));
  const follows = await Q("follows", "SELECT user_id, kind, created_at FROM follows WHERE created_at >= ? AND created_at < ? LIMIT 1000", startIso, iso(endMs + tenMin));
  const mails = await Q("cc_mail_log", "SELECT template, to_hash, status, at FROM cc_mail_log WHERE at >= ? AND at < ? AND (template IN ('bassem_note', 'deal_email') OR template LIKE 'meeting_%') LIMIT 2000", startIso, iso(endMs + tenMin));
  const was = await Q("wa_messages", "SELECT member_id, status, created_at FROM wa_messages WHERE direction = 'out' AND created_at >= ? AND created_at < ? LIMIT 2000", startIso, iso(endMs + tenMin));
  const deals = await Q("deals", "SELECT member_id, created_at, updated_at FROM deals WHERE updated_at >= ? AND updated_at < ? LIMIT 2000", startIso, iso(endMs + tenMin));
  const staffRows = await Q("cc_staff", "SELECT member_id FROM cc_staff WHERE disabled_at = '' LIMIT 500");
  const staffSet = new Set(staffRows.map(r => r.member_id)), admins = new Set(adminList(env));
  /* the memory turns: only when a session still has no identity (or Anam cannot be read) — one cc_audit row FIRST (memory.js: every staff
     read of the memory is logged; Bassem's notice promises it) */
  let memRows = [], memAudit = "none";
  const resolvedTag = r => { const t = r.tag && tags.get(r.tag); return !!(t && (t.member_id || t.subject || Number(t.staff) === 1)); };
  const unresolved = [...detail.entries()].some(([id, d]) => { const r = listed.find(x => x.id === id); return r && r.site && !resolvedTag(r) && !meetBySid.has(id) && !(r.block && !r.block.anonymous) && d && d.mode !== "counts"; });
  if ((unresolved || !anamOk) && (await hasTable(env, "advisor_memory"))) {
    try {
      await auditStmt(env, { ...actor, action: "calls_report.memory_read", target_type: "calls_report", target_id: day, summary: "calls report: memory turns of " + day + " read (" + (anamOk ? "identity join" : "Anam not readable: report from D1") + ")",
        after: { day, mode, rows_max: CALLS_LIM.memoryRows }, ip_hash: actor.ip_hash || "", req_id: actor.req_id || rid(12) }).run();
      memAudit = "ok";
    } catch (e) { memAudit = "failed"; }
    if (memAudit === "ok") memRows = await Q("advisor_memory", "SELECT member_id, kind, call_id, at, text, data_json, agent FROM advisor_memory WHERE kind IN ('turn', 'search') AND at >= ? AND at < ? ORDER BY id LIMIT " + CALLS_LIM.memoryRows, iso(startMs - 60000), iso(endMs + 2 * tenMin));
  }
  const memUser = memRows.filter(r => r.kind === "turn" && jparse(r.data_json, {}).role === "user");
  /* 5) sessions → identities */
  const sess = [];
  for (const r of listed) {
    const d = detail.get(r.id) || null, tag = r.tag ? tags.get(r.tag) : null, mt = meetBySid.get(r.id) || null;
    const who = { kind: "unknown", confidence: "", subject: "", memberId: "", meeting: mt ? mt.id : "", block: null, staff: false, app: tag ? tag.app : "" };
    /* a tag that names nobody (no member, no visitor id, not staff) confirms nothing: never «زائر مش معروف (مؤكد)» */
    if (tag) { who.confidence = tag.member_id || tag.subject || Number(tag.staff) === 1 ? "sure" : ""; who.subject = tag.subject || ""; if (tag.member_id) { who.kind = "member"; who.memberId = tag.member_id; } else if (/^v:/.test(tag.subject)) who.kind = "visitor"; if (Number(tag.staff) === 1) who.staff = true; }
    if (!who.memberId && mt) { who.kind = "meeting"; who.confidence = "sure"; }
    if (who.kind === "unknown" && r.block && !r.block.anonymous) { who.kind = "member"; who.block = r.block; who.confidence = "sure"; }
    else if (who.kind === "unknown" && r.block && r.block.anonymous) { who.kind = "member"; who.block = r.block; who.confidence = "sure"; }
    if (who.kind === "unknown" && d && d.turns && memUser.length) {
      const lo = (r.start || startMs) - 60000, hi = (r.end || r.start || startMs) + tenMin;
      const cand = memUser.filter(x => x.agent === r.agent && Date.parse(x.at) >= lo && Date.parse(x.at) <= hi).map(x => ({ subject: x.member_id, text: x.text }));
      const j = memoryJoin(d.turns.filter(t => t.user).map(t => t.user), cand, t => clean(t, 600));
      if (j) { who.confidence = j.confidence; who.subject = j.subject; if (/^v:[0-9a-f]{32}$/.test(j.subject)) who.kind = "visitor"; else if (r.agent === "bassem") { who.kind = "member"; who.memberId = j.subject; } }
    }
    if (who.kind === "unknown" && r.agent === "bassem" && r.site && !r.block && (d || r.len < CALLS_LIM.minSessionMs)) { who.kind = "staff"; who.confidence = "likely"; who.staff = true; } // «غالباً من الفريق»
    if (/^v:[0-9a-f]{32}$/.test(who.subject)) vids.add(who.subject.slice(2));
    if (who.memberId) memberIds.add(who.memberId);
    sess.push({ r, d, who });
  }
  /* D1-only (Anam not readable): the conversations are the memory turns grouped by (member, call) */
  if (!anamOk) for (const g of memoryCalls(memRows)) {
    sess.push({ r: { id: "", agent: g.agent, lang: "ar", start: g.start, end: g.end, len: Math.max(0, g.end - g.start), site: true, outside: false, meeting: false, device: {}, exit: "" },
      d: { mode: "d1", turns: g.turns, searches: g.searches }, who: { kind: /^v:/.test(g.subject) ? "visitor" : g.agent === "bassem" ? "member" : "unknown", confidence: "likely", subject: g.subject, memberId: /^v:/.test(g.subject) ? "" : g.subject, staff: false, app: "" } });
    if (/^v:[0-9a-f]{32}$/.test(g.subject)) vids.add(g.subject.slice(2)); else if (g.agent === "bassem") memberIds.add(g.subject);
  }
  const members = new Map();
  for (const c of chunks([...memberIds], 80)) for (const m of await Q("members", `SELECT id, name, title, company, email, phone, plan, plan_expires, sector, governorate, role FROM members WHERE id IN (${IN(c.length)})`, ...c)) members.set(m.id, m);
  const visitors = new Map();
  for (const c of chunks([...vids], 80)) for (const v of await Q("janna_visitors", `SELECT visitor_id, member_id, calls, stage, first_at FROM janna_visitors WHERE visitor_id IN (${IN(c.length)})`, ...c)) visitors.set(v.visitor_id, v);
  for (const s of sess) { const m = s.who.memberId && members.get(s.who.memberId); if (m && (admins.has(String(m.email || "").toLowerCase()) || staffSet.has(m.id) || m.role === "admin")) s.who.staff = true; }
  /* 6) conversations: one subject within 3 min = parts of one; no subject: the returning-visitor greeting within 90 s on the same device */
  const convs = groupConversations(sess);
  /* 7) outcomes, review, «كان ممكن» */
  const claimed = new Set(), mailHashes = new Map();
  for (const id of memberIds) { const m = members.get(id); if (m && m.email) mailHashes.set(id, await mailHash(env, m.email)); }
  const overlaps = (c, t) => convs.filter(o => o.agent === c.agent && t >= o.start - 60000 && t <= o.end + 2 * 60000).length;
  let searchesLeft = CALLS_LIM.searches;
  for (const c of convs) {
    const sids = new Set(c.parts.map(p => p.r.id).filter(Boolean)), lo = c.start - 60000, hi = c.end + tenMin, inWin = t => { const x = Date.parse(t); return x >= lo && x <= hi; };
    const o = { inquiries: [], meetings: [], follows: 0, tasks: 0, registration: false, profile: false, emails_sent: 0, emails_failed: 0, wa_sent: 0, deals: 0 };
    for (const q of inquiries) {
      if (claimed.has(q.ref)) continue;
      const sid = String(jparse(q.payload_json, {}).call_sid || "").toLowerCase();
      let conf = "";
      if (sid && sids.has(sid)) conf = "sure";
      else if (!sid && c.memberId && q.user_id === c.memberId && inWin(q.created_at)) conf = "likely";
      else if (!sid && !q.user_id && q.source === c.agent && inWin(q.created_at) && overlaps(c, Date.parse(q.created_at)) === 1) conf = "likely";
      if (conf) { claimed.add(q.ref); o.inquiries.push({ ...q, conf }); }
    }
    for (const m of meetings) if ((m.session_id && sids.has(String(m.session_id).toLowerCase())) || (c.meetingId && m.id === c.meetingId)) { if (!o.meetings.some(x => x.id === m.id)) o.meetings.push(m); }
    if (c.memberId) {
      o.follows = follows.filter(f => f.user_id === c.memberId && inWin(f.created_at)).length;
      const h = mailHashes.get(c.memberId);
      if (h) for (const ml of mails) if (ml.template === "bassem_note" && ml.to_hash === h && inWin(ml.at)) { if (ml.status === "sent") o.emails_sent++; else if (ml.status === "failed") o.emails_failed++; }
      o.wa_sent = was.filter(w => w.member_id === c.memberId && w.status === "sent" && inWin(w.created_at)).length;
      o.deals = deals.filter(x => x.member_id === c.memberId && (inWin(x.created_at) || inWin(x.updated_at))).length;
    }
    const subj = c.memberId || c.subject;
    if (subj) o.tasks = tasks.filter(t => t.subject === subj && t.agent === c.agent && inWin(t.created_at)).length;
    const turns = c.turns, toolDone = n => turns.some(t => (t.tools || []).some(x => String(x.name).toLowerCase() === n && x.status === "completed"));
    o.registration = o.inquiries.some(q => q.kind === "signup") || toolDone("janna_fill_registration");
    o.profile = toolDone("bassem_save_profile");
    const d1Rows = !!(o.inquiries.length || o.meetings.length || o.follows || o.tasks || o.emails_sent || o.wa_sent);
    c.review = c.unread ? { verdict: "not_read", flags: [], na: [], searches: [], zeroQueries: [], productWords: [], ask: "none", tools: 0, turns: 0, outcome: "" }
      : reviewConversation({ agent: c.agent, lang: c.lang, mode: c.mode, short: c.short, startMs: c.start, endMs: c.end, turns, searches: c.searches, outcome: o, d1Rows, places });
    c.outcome = o;
    c.missed = c.kind === "customer" && (c.review.verdict === "not_useful" || c.review.verdict === "partial") && searchesLeft > 0 ? missedLines(c, lookup, nowMs, () => searchesLeft-- > 0) : [];
  }
  /* 8) the report object (identities as the detail setting allows) */
  const full = settings.detail === "full", S = site(env);
  const showMail = e => (e ? (full ? (isEmail(String(e).trim().toLowerCase()) ? String(e).trim().toLowerCase() : "") : maskEmail(e)) : ""), // «full»: the platform's own records, in clear (clean() would mask them)
    showPhone = p => (p ? (full ? asciiDigits(String(p)).replace(/[^\d+]/g, "").slice(0, 16) : last2(p)) : "");
  const outConvs = [];
  for (const c of convs) {
    const w = { kind: c.whoKind, confidence: c.confidence, said: c.review.self || null };
    if (c.whoKind === "member" && c.memberId && members.get(c.memberId)) {
      const m = members.get(c.memberId);
      Object.assign(w, { name: clean(m.name, 60), title: clean(m.title, 20), company: clean(m.company, 80), plan: ((PLAN_NAME[effPlan(m)] || [])[0] || "").replace(/^باقة\s+/, ""), sector: clean(m.sector, 60), gov: govName(m.governorate), email: showMail(m.email), phone: showPhone(m.phone), link: S + "admin/#users/" + enc(m.id) });
    } else if (c.whoKind === "member" && c.block) Object.assign(w, { name: c.block.first, title: c.block.title, company: c.block.company, plan: c.block.plan, sector: c.block.sector });
    else if (c.whoKind === "member") { w.kind = c.agent === "bassem" ? "member" : "visitor"; w.name = ""; w.company = ""; }
    if (c.whoKind === "staff") { const m = c.memberId && members.get(c.memberId); w.first = m ? clean(String(m.name || "").split(" ")[0], 20) : ""; }
    if (c.whoKind === "visitor" && /^v:[0-9a-f]{32}$/.test(c.subject)) {
      w.alias = await aliasOf(env, c.subject.slice(2));
      const v = visitors.get(c.subject.slice(2));
      if (v && !v.member_id) { w.visits = Number(v.calls || 0) || 0; w.stage = v.stage || ""; } // a linked id stays «زائر»: no visits / stage
    }
    if (c.whoKind === "meeting") { const m = meetById.get(c.meetingId); if (m) Object.assign(w, { name: clean(m.name, 60), company: clean(m.company, 80), email: showMail(m.email), phone: showPhone(m.phone) }); }
    if (c.mode === "counts") w.said = null; // without recording consent nothing of what was said
    const outcomes = [];
    for (const q of c.outcome.inquiries) {
      const k = KIND_AR[q.kind] || [q.kind, q.kind], st = INQ_ST[q.status] || [q.status, q.status], conf = q.conf === "sure" ? "مؤكد" : "غالباً";
      const by = [clean(q.name, 60), clean(q.company, 80), showMail(q.email), q.phone ? "موبايل " + bdi(showPhone(q.phone)) : ""].filter(Boolean).map(bdi).join(" · ");
      outcomes.push({ ar: k[0] + " " + bdi(q.ref) + " — " + st[0] + (q.kind !== "signup" ? " — " + routedAr(Number(q.routed_count) || 0) : "") + " (" + conf + ")" + (by ? " — " + by : ""),
        en: k[1] + " " + q.ref + " — " + st[1] + (q.kind !== "signup" ? ", routed to " + (Number(q.routed_count) || 0) : "") + " (" + (q.conf === "sure" ? "confirmed" : "likely") + ")", link: S + "admin/#messages/" + enc(q.ref), ref: q.ref });
    }
    for (const m of c.outcome.meetings) outcomes.push({ ar: "اجتماع " + (m.kind === "instant" ? "فوري" : "متحدد") + (m.starts_at ? " " + ar(cairoDay(Date.parse(m.starts_at))) + " " + ar(cairoTime(Date.parse(m.starts_at))) : "") + (m.consent ? " — بموافقة على التسجيل" : " — من غير موافقة على التسجيل"),
      en: "meeting " + (m.kind || "") + (m.consent ? " (recording consent)" : " (no recording consent)") });
    if (c.outcome.registration && !c.outcome.inquiries.some(q => q.kind === "signup")) outcomes.push({ ar: "فتحت فورم التسجيل", en: "opened the registration form" });
    if (c.outcome.follows) outcomes.push({ ar: "متابعات جديدة: " + ar(c.outcome.follows), en: "new follows: " + c.outcome.follows });
    if (c.outcome.tasks) outcomes.push({ ar: "مهام اتسجّلت: " + ar(c.outcome.tasks), en: "tasks recorded: " + c.outcome.tasks });
    if (c.outcome.profile) outcomes.push({ ar: "ملف المصنع اتحفظ", en: "factory profile saved" });
    if (c.outcome.emails_sent || c.outcome.emails_failed) outcomes.push({ ar: "إيميلات باسم: " + ar(c.outcome.emails_sent) + " اتبعتت" + (c.outcome.emails_failed ? "، " + ar(c.outcome.emails_failed) + " فشلت" : ""), en: "Bassem e-mails: " + c.outcome.emails_sent + " sent" + (c.outcome.emails_failed ? ", " + c.outcome.emails_failed + " failed" : "") });
    if (c.outcome.wa_sent) outcomes.push({ ar: "واتساب: " + nAr(c.outcome.wa_sent, "رسالة واحدة طلعت", "رسالتين طلعوا", "رسايل طلعت", "رسالة طلعت"), en: "WhatsApp: " + c.outcome.wa_sent + " sent" });
    if (c.outcome.deals) outcomes.push({ ar: "صفقات اتفتحت أو اتحدّثت: " + ar(c.outcome.deals), en: "deals opened or updated: " + c.outcome.deals });
    outConvs.push({ agent: c.agent, lang: c.lang, kind: c.kind, startMs: c.start, time: cairoTime(c.start), minutes: Math.round(c.len / 60000), parts: c.parts.length, sessions: c.parts.map(p => p.r.id).filter(Boolean),
      device: c.device, who: w, review: c.review, outcomes, missed: c.missed, notReady: c.notReady, consentless: c.mode === "counts" });
  }
  /* 9) the day's numbers */
  const pvDay = (await Q("cc_pv_day", "SELECT views, uniq, mobile_uniq FROM cc_pv_day WHERE day = ?", day))[0] || null;
  const pvSrc = await Q("cc_pv_src", "SELECT src, n FROM cc_pv_src WHERE day = ? ORDER BY n DESC LIMIT 3", day);
  const [glo, ghi] = guardDayRange(day), gT = await Q("rl", GUARD_SQL.types, glo, ghi), gV = gT.length ? await Q("rl", GUARD_SQL.visitors, glo, ghi) : [];
  const needs = (await Q("knowledge_bank", "SELECT question, asked FROM knowledge_bank WHERE status = 'needs_answer' AND merged_into = 0 AND first_at >= ? AND first_at < ? ORDER BY asked DESC, id DESC LIMIT 5", startIso, endIso)).map(r => ({ question: quote(r.question, 160), asked: Number(r.asked) || 1 }));
  const needTotal = await Q("knowledge_bank", "SELECT COUNT(*) AS n FROM knowledge_bank WHERE status = 'needs_answer' AND merged_into = 0");
  const ts = typeof lookup.tenderStatus === "function" ? lookup.tenderStatus : null;
  const opps = { tenders: ts ? (DATA.t || []).filter(t => OPEN_ST.has(ts(t[7], nowMs))).length : 0, rfqs: (DATA.q || []).length };
  const cust = outConvs.filter(c => c.kind === "customer");
  const verdicts = {}; for (const c of cust) verdicts[c.review.verdict] = (verdicts[c.review.verdict] || 0) + 1;
  const probs = new Map();
  /* every problem counted the same way: the customer calls it happened in (report review 2026-11-20 #12: long replies were counted per reply,
     zero results per search, the rest per call) */
  for (const c of cust) for (const f of c.review.flags || []) { const e = probs.get(f.code) || { code: f.code, n: 0, janna: 0, bassem: 0 }; e.n++; e[c.agent]++; probs.set(f.code, e); }
  const byAgent = {}; for (const c of outConvs.filter(x => x.kind !== "team")) { const k = c.agent === "bassem" ? "bassem" : c.lang === "en" ? "janna_en" : "janna_ar"; byAgent[k] = (byAgent[k] || 0) + 1; }
  const counts = { conversations: outConvs.length, sessions: listed.length, byAgent, customers: cust.length, team: outConvs.filter(c => c.kind === "team").length, outside: outConvs.filter(c => c.kind === "outside").length,
    short: outConvs.filter(c => c.review.verdict === "short").length, minutes: Math.round(outConvs.reduce((n, c) => n + (c.minutes || 0), 0)), verdicts,
    outcomes: { rfqs: cust.flatMap(c => c.outcomes.filter(o => o.ref && !/^طلب اشتراك/.test(o.ar)).map(o => o.ref)), meetings: cust.reduce((n, c) => n + c.outcomes.filter(o => /^اجتماع/.test(o.ar)).length, 0),
      registrations: cust.reduce((n, c) => n + (c.review.outcome === "registration" || c.outcomes.some(o => /^طلب اشتراك|^فتحت فورم التسجيل/.test(o.ar)) ? 1 : 0), 0),
      follows: convs.filter(c => c.kind === "customer").reduce((n, c) => n + (c.outcome.follows || 0), 0), bassem_emails: convs.reduce((n, c) => n + (c.outcome.emails_sent || 0), 0) },
    problems: [...probs.values()].sort((a, b) => b.n - a.n || FLAG_ORDER.indexOf(a.code) - FLAG_ORDER.indexOf(b.code)).slice(0, 3).map(p => ({ code: p.code, n: p.n, agent: p.janna && p.bassem ? "janna" : p.bassem ? "bassem" : "janna" })),
    pv: pvDay ? { views: Number(pvDay.views) || 0, uniq: Number(pvDay.uniq) || 0, mobile: Number(pvDay.mobile_uniq) || 0, sources: pvSrc.map(r => [line(r.src, 40), Number(r.n) || 0]) } : notes.missing.has("cc_pv_day") ? null : { views: 0, uniq: 0, mobile: 0, sources: [] },
    guard: guardTotals(gT, gV[0] && gV[0].v),
    opps, needs: { fresh: needs.length, total: needTotal.length ? Number(needTotal[0].n) || 0 : null }, meetingsTeam: listed.filter(r => r.meeting).length, notRead, gets };
  /* 10) the notes («ملاحظات النظام»: only what degraded) */
  /* the notes say what degraded in the owner's words (report review 2026-11-20 #14): no file, table, workflow or permission names in the
     body — the technical detail goes to `tech`, which joins the warnings «المطوّر» shows (the preview) and the card's setup status */
  const N = [], tech = [], DEV = " — التفاصيل عند «المطوّر» ← «تقرير المكالمات».", DEV_EN = " — the details are in «Developer» → «Calls report».";
  let banner = null;
  if (!anamOk) {
    banner = anam === "no_read" ? { ar: "Anam رفض قراية الجلسات — التقرير ده من بيانات المنصة بس، من غير توقيت ولا أدوات المكالمات. السبب والحل عند «المطوّر» ← «تقرير المكالمات».", en: "Anam refused to list the sessions — this report uses the platform's data only. The cause and the fix are in «Developer» → «Calls report»." }
      : anam === "no_key" ? { ar: "مفيش مفتاح Anam — التقرير ده من بيانات المنصة بس." + DEV, en: "No Anam key — this report uses the platform's data only." + DEV_EN }
      : { ar: "Anam مش متاح دلوقتي — التقرير ده من بيانات المنصة بس.", en: "Anam is not reachable — this report uses the platform's data only." };
    warn.push(banner.en); // the banner heads the e-mail (not repeated in «ملاحظات النظام»)
    if (anam === "no_read") tech.push("Anam answered 401/403 on GET /v1/sessions: give the key Sessions: Read in Anam Lab (or save a key that has it in «Service keys»).");
  }
  if (!has0011) {
    N.push({ ar: "معرفة مين اللي اتكلم في كل مكالمة لسه بالتقريب: تحديث قاعدة البيانات الخاص بالتقرير لسه ماتعملش" + DEV, en: "Who talked in each call is still approximate: the report's database update has not been run yet" + DEV_EN });
    tech.push("Migration 0011_calls_report.sql is not applied: run it from GitHub → Actions → d1-migrate (the backup first, after the Worker code is live). Until then identities come from the other joins.");
  }
  const nr = outConvs.filter(c => c.notReady).length;
  if (nr) N.push({ ar: nAr(nr, "مكالمة واحدة تفاصيلها", "مكالمتين تفاصيلهم", "مكالمات تفاصيلها", "مكالمة تفاصيلها") + " لسه ماوصلتش من Anam: اتراجعت من النص بس.", en: nr + " calls: Anam's details were not ready yet; reviewed from the transcript only." });
  if (notRead) N.push({ ar: nAr(notRead, "مكالمة واحدة مااتقرتش", "مكالمتين مااتقروش", "مكالمات مااتقرتش", "مكالمة مااتقرتش") + " من Anam (الحد " + ar(CALLS_LIM.anamGets) + " قراية في التقرير) — اتعدّت بس.", en: notRead + " calls were not read from Anam (the " + CALLS_LIM.anamGets + "-read cap of a report) — counted only." });
  if (listCut) N.push({ ar: "اليوم ده فيه أكتر من " + ar(CALLS_LIM.perPage * CALLS_LIM.listPages) + " جلسة — الأولانيين بس اتعدّوا.", en: "More than " + CALLS_LIM.perPage * CALLS_LIM.listPages + " sessions that day — only the first ones are counted." });
  if (memAudit === "failed") N.push({ ar: "ذاكرة جنة وباسم مااتقرتش (سجل الاطلاع ماتكتبش).", en: "Janna's and Bassem's memory was not read (the access log could not be written)." });
  const missing = [...notes.missing].filter(k => k !== "call_sessions"), failed = [...notes.failed];
  if (missing.length) { N.push({ ar: "بعض البيانات مش متاحة في التقرير ده: " + dataAr(missing) + DEV, en: "Some data is not in this report: " + dataEn(missing) + DEV_EN }); tech.push("Missing tables: " + missing.join(", ")); }
  if (failed.length) { N.push({ ar: "بعض البيانات ماتقرتش المرة دي: " + dataAr(failed) + DEV, en: "Some data could not be read this time: " + dataEn(failed) + DEV_EN }); tech.push("Read errors on: " + failed.join(", ")); }
  if (notes.budget) N.push({ ar: "بيانات المنصة اتقرت جزئياً (حد القراية في الدورة دي).", en: "The platform's data was read partly (this run's read budget)." });
  const route = attachOk(env);
  if (!route) { N.push({ ar: "طريقة الإرسال الحالية مابتبعتش ملفات مرفقة، فملف التفاصيل مش مرفق المرة دي" + DEV, en: "The current e-mail route sends no attachments, so the details file is not attached this time" + DEV_EN }); tech.push("The e-mail route has no attachments: calls-" + day + ".csv was not attached."); }
  /* the previous report that never went out */
  let failedPrev = null;
  const prev = addDays(day, -1), pg = await Q("cron_runs", "SELECT job FROM cron_runs WHERE day = ? AND job IN ('calls-report', 'calls-report-failed')", prev);
  if (pg.some(x => x.job === "calls-report-failed") && !pg.some(x => x.job === "calls-report")) {
    const a = await Q("cc_audit", "SELECT after_json FROM cc_audit WHERE action = 'calls_report.failed' AND target_id = ? ORDER BY id DESC LIMIT 1", prev);
    failedPrev = { day: prev, reason: line(jparse(a[0] && a[0].after_json, {}).reason || "مش معروف", 160) };
  }
  const rep = { day, dayAr: dayLabelAr(day), settings: { detail: settings.detail, tests: settings.tests }, convs: outConvs, counts, needs, notes: N, banner, failedPrev,
    defaultNote: settings.usingDefault ? { to: shownDefault(settings.to) } : null, links: { dataDesk: S + "data-desk/" }, csv: route };
  const rendered = renderReport(rep);
  if (!route) rendered.csv = "";
  warn.push(...N.map(n => n.en), ...tech);
  return { rep, rendered, counts, warnings: warn, anam, has0011, attach: route };
}

/* the Anam list: ≤ 4 pages of 50 (a 504 → the same rows as two pages of 25); each row reduced at once */
async function listSessions(A, startIso, endIso, knownTags) {
  const rows = [], base = `/sessions?from=${enc(startIso)}&to=${enc(endIso)}`;
  let error = 0, cut = false;
  const take = j => { for (const x of Array.isArray(j && j.data) ? j.data : []) { const r = reduceRow(x, knownTags); if (r && !rows.some(y => y.id === r.id)) rows.push(r); } };
  for (let page = 1; page <= CALLS_LIM.listPages; page++) {
    let r = await A.get(`${base}&perPage=${CALLS_LIM.perPage}&page=${page}`);
    if (r.status === 401 || r.status === 403) return { rows, auth: r.status };
    if (r.status === 504) {
      const half = CALLS_LIM.perPage / 2, a = await A.get(`${base}&perPage=${half}&page=${2 * page - 1}`), b = await A.get(`${base}&perPage=${half}&page=${2 * page}`);
      if (a.status !== 200) { error = a.status || 504; break; }
      take(a.json); if (b.status === 200) take(b.json);
      const meta = (b.status === 200 ? b.json : a.json) || {}, mt = meta.meta || {};
      if (!mt.next || b.status !== 200) break;
      if (page === CALLS_LIM.listPages) cut = true;
      continue;
    }
    if (r.status !== 200 || !r.json) { error = r.status || 0; break; }
    take(r.json);
    const mt = r.json.meta || {};
    if (!mt.next || (mt.lastPage && page >= mt.lastPage)) break;
    if (page === CALLS_LIM.listPages) cut = true;
  }
  return { rows, error, cut };
}
/* one session: the tool calls + the analytics with messages (2 GETs); the transcript only when analytics answers 404; a session of a meeting
   without recording consent: the analytics WITHOUT messages only (counts) */
async function readSession(A, r, countsOnly) {
  const id = enc(r.id);
  if (countsOnly) { const an = await A.get(`/sessions/${id}/analytics`, { reserved: true }); return { mode: "counts", turns: an.status === 200 ? turnsFromAnalytics({ turns: (an.json && an.json.turns || []).map(t => ({ ...t, userMessage: undefined, assistantMessage: undefined })) }, null) : [] }; }
  const [ses, an] = await Promise.all([A.get(`/sessions/${id}`, { reserved: true }), A.get(`/sessions/${id}/analytics?includeMessages=true`, { reserved: true })]);
  if (an.status === 200 && an.json) return { mode: "anam", turns: turnsFromAnalytics(an.json, ses.status === 200 ? ses.json : null) };
  if (an.status === 404) {
    const msgs = []; let off = 0;
    for (let p = 0; p < CALLS_LIM.transcriptPages; p++) {
      const t = await A.get(`/sessions/${id}/transcript?offset=${off}&limit=100`);
      if (t.status !== 200 || !t.json) break;
      if (t.json.transcriptsEnabled === false) return { mode: "counts", turns: [] };
      msgs.push(...(Array.isArray(t.json.messages) ? t.json.messages : []));
      if (t.json.nextOffset == null) break; off = Number(t.json.nextOffset) || 0;
    }
    return { mode: "transcript", turns: turnsFromTranscript(msgs), notReady: true };
  }
  return null; // could not be read: counted only
}
/* D1 only: the memory turns of the window as calls — grouped by (subject, call id), searches from the 'search' rows */
function memoryCalls(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.call_id) continue;
    const k = r.member_id + "|" + r.call_id, g = m.get(k) || { subject: r.member_id, agent: r.agent === "janna" ? "janna" : "bassem", start: Infinity, end: 0, turns: [], searches: [] };
    const t = Date.parse(r.at); if (Number.isFinite(t)) { g.start = Math.min(g.start, t); g.end = Math.max(g.end, t); }
    const d = jparse(r.data_json, {});
    if (r.kind === "turn") { const role = d.role === "user" ? "user" : "persona", seq = Number.isInteger(d.seq) ? d.seq : g.turns.length; g.turns.push({ i: seq, user: role === "user" ? r.text : "", persona: role === "persona" ? r.text : "", tools: [] }); }
    else if (r.kind === "search") g.searches.push({ tool: d.tool || "janna_lookup", query: d.query || "", count: Number.isInteger(d.count) ? d.count : (d.results || []).length, titles: (d.results || []).map(x => x && x.title).filter(Boolean) });
    m.set(k, g);
  }
  return [...m.values()].filter(g => g.turns.length).map(g => ({ ...g, start: Number.isFinite(g.start) ? g.start : 0, turns: g.turns.sort((a, b) => a.i - b.i) }));
}
/* the conversations: the same subject within 3 minutes = parts of one; a session with no subject whose first persona line is the
   returning-visitor greeting joins the earlier conversation of the same agent ending ≤ 90 s before it, on the same device class */
function groupConversations(sess) {
  const greet = [RETURN_GREETING.ar, RETURN_GREETING.en].map(g => norm(g).slice(0, 24));
  const keyOf = s => (s.who.memberId ? "m:" + s.who.memberId : s.who.subject ? s.who.subject : s.who.meeting ? "mt:" + s.who.meeting : s.who.block && !s.who.block.anonymous ? "b:" + norm(s.who.block.title + " " + s.who.block.first + " " + s.who.block.company) : "");
  const devKey = d => [d.os || "", d.inapp || "", d.app || ""].join("|");
  const convs = [];
  for (const s of [...sess].sort((a, b) => (a.r.start || 0) - (b.r.start || 0))) {
    const k = keyOf(s), st = s.r.start || 0, en = s.r.end || st + (s.r.len || 0);
    let c = k ? convs.find(x => x.key === k && x.agent === s.r.agent && st - x.end <= CALLS_LIM.groupGapMs && st >= x.start) : null;
    if (!c && !k && s.d && s.d.turns) {
      const firstP = (s.d.turns.find(t => t.persona) || {}).persona || "";
      if (greet.some(g => g && norm(firstP).startsWith(g))) c = [...convs].reverse().find(x => x.agent === s.r.agent && st - x.end <= CALLS_LIM.greetGapMs && st >= x.start && devKey(x.device) === devKey(s.r.device || {})) || null;
    }
    if (!c) { c = { key: k, agent: s.r.agent, lang: s.r.lang, start: st, end: en, parts: [], device: s.r.device || {}, who: s.who }; convs.push(c); }
    c.parts.push(s); c.end = Math.max(c.end, en);
    if (s.who.kind !== "unknown" && (c.who.kind === "unknown" || (c.who.confidence !== "sure" && s.who.confidence === "sure"))) c.who = s.who;
  }
  for (const c of convs) {
    let off = 0; c.turns = [];
    for (const p of c.parts) { const ts = (p.d && p.d.turns) || []; for (const t of ts) c.turns.push({ ...t, i: t.i + off }); off += ts.length ? Math.max(...ts.map(t => t.i)) + 1 : 0; }
    c.searches = c.parts.flatMap(p => (p.d && p.d.searches) || []);
    const modes = c.parts.map(p => (p.d ? p.d.mode : "")), read = c.parts.filter(p => p.d);
    c.mode = modes.includes("counts") ? "counts" : modes.includes("d1") ? "d1" : read.length && read.every(p => p.d.mode === "transcript") ? "transcript" : "anam";
    c.notReady = c.parts.some(p => p.d && p.d.notReady);
    c.len = c.parts.reduce((n, p) => n + (p.r.len || 0), 0);
    /* short = under 20 s of talk or never joined (counted only); a long session Anam was not read for (the GET cap) is «not read», never «short»;
       a D1-only call (memory turns) is short with fewer than 2 turns */
    c.short = c.mode === "d1" ? c.turns.length < 2 : c.len < CALLS_LIM.minSessionMs || c.parts.every(p => p.r.exit === "CLOSED_NEVER_JOINED");
    c.unread = !c.short && !read.length;
    c.memberId = c.who.memberId || ""; c.subject = c.who.subject || ""; c.meetingId = c.who.meeting || ""; c.block = c.who.block || null; c.confidence = c.who.confidence || "";
    c.whoKind = c.who.staff ? "staff" : c.who.kind === "unknown" ? "visitor" : c.who.kind;
    if (c.whoKind === "visitor" && !/^v:/.test(c.subject)) c.confidence = c.confidence || "";
    c.kind = c.parts.every(p => p.r.outside) ? "outside" : c.who.staff ? "team" : "customer";
  }
  return convs;
}
/* «كان ممكن» — only real results, run on the report morning (index.js search on the bundled data): (a) a seller: open tenders / RFQs for
   his product — never section=customers with his product words: that section takes the industries he SELLS TO, and his own product's
   words count his competitors (index.js customers, U2 — the Al-Atlal call); (b) a buyer: suppliers for his words (top 3 with every word);
   (c) every zero-result search again IN THE SECTION (+ governorate / market) THAT RETURNED NOTHING (report review 2026-11-20 #7: every
   query was run again in the factories only), the section read like the lookup reads it (index.js lookupSection: its aliases, an unknown
   or missing one = the factories) — the platform's own lookup only: the intel centre's and the web's searches are not on the bundled
   data, and a D1-only call does not know the section; ≤ 3 queries, the others counted; (d) a seller never offered a profile; (e) a
   general question left without an answer */
const SECTION_AR = { factories: ["المصانع", "factories"], suppliers: ["الموردين", "suppliers"], products: ["المنتجات", "products"], market: ["السوق", "the market"], tenders: ["المناقصات", "tenders"],
  rfqs: ["طلبات الأسعار", "RFQs"], offers: ["العروض", "offers"], cities: ["المدن الصناعية", "industrial cities"],
  customers: ["العملاء المحتملين", "possible customers"], projects: ["المشروعات", "projects"], events: ["المعارض", "events"], news: ["الأخبار", "news"], awards: ["الترسيات", "awards"] };
export function missedLines(c, lookup, nowMs, budget) {
  const r = c.review, out = [], search = lookup && typeof lookup.search === "function" ? lookup.search : null, she = c.agent === "bassem" ? "" : "ت";
  const run = (sec, q, gov, mkt) => { if (!search || !q || !budget()) return null; try { return search(sec, String(q).slice(0, 120), String(gov || "").slice(0, 60), 10, undefined, mkt || undefined); } catch (e) { return null; } };
  const secOf = lookup && typeof lookup.section === "function" ? k => { try { return String(lookup.section(k) || ""); } catch (e) { return ""; } } : k => String(k || "");
  const words0 = r.productWords && r.productWords.length ? r.productWords : [];
  /* the second preview on the real calls of 2026-11-20: only what was searched is said — a search the budget (or a missing lookup) never
     ran is no «مفيش»; an open tender counts for (a) when it is about his product (U1's match tag, not «related»; before U1 one of the query's
     words in its title: the lookup also returns loose matches, an open tender that shares no word with his product was counted); and what
     (a) said («… ولا طلب سعر لـ «X»») is not searched and said again by (c) (««X» ولسه مفيش في طلبات الأسعار» stood right under it in every
     seller's card) */
  const said = new Set();
  if (r.seller && words0.length) {
    const q = words0[0], t = run("tenders", q), f = run("rfqs", q), qw = words(q);
    const about = x => (x.match ? x.match !== "related" : qw.some(w => words(x.title || x.name || "").some(z => z === w || (w.length >= 4 && z.startsWith(w)))));
    const open = t ? (t.results || []).filter(x => x && OPEN_ST.has(x.status) && about(x)).length : 0, rq = f ? f.count || 0 : 0;
    if (t && f) {
      out.push(open || rq ? { ar: "النهارده الصبح على المنصة لـ «" + bdi(quote(q, 60)) + "»: مناقصات سارية " + ar(open) + "، طلبات أسعار " + ar(rq), en: "This morning for “" + quote(q, 60) + "”: open tenders " + open + ", RFQs " + rq }
        : { ar: "النهارده الصبح مفيش مناقصة سارية ولا طلب سعر لـ «" + bdi(quote(q, 60)) + "» على المنصة", en: "This morning there is no open tender or RFQ for “" + quote(q, 60) + "” on the platform" });
      said.add("tenders|" + quote(q, 80)); said.add("rfqs|" + quote(q, 80));
    }
  }
  if (r.buyer && words0.length) {
    const q = words0[0], sr = run("suppliers", q), qw = words(q);
    const all = sr ? (sr.results || []).filter(x => (x.match ? x.match === "all" : qw.every(w => words(x.name + " " + (x.activity || "") + " " + (x.products || "")).some(z => z === w || z.startsWith(w))))).slice(0, 3) : [];
    if (sr) out.push(all.length ? { ar: "موردين في الدليل فيهم كل كلمات «" + bdi(quote(q, 60)) + "»: " + all.map(x => bdi(quote(x.name, 60))).join("، "), en: "Suppliers in the directory with every word of “" + quote(q, 60) + "”: " + all.length }
      : { ar: "مفيش مورّد في الدليل فيه كل كلمات «" + bdi(quote(q, 60)) + "»", en: "No supplier in the directory has every word of “" + quote(q, 60) + "”" });
  }
  /* (c) one line per query: where it now returns something, and where still nothing */
  const byQ = new Map();
  for (const z of r.zeroSearches || []) {
    if (z.tool !== "janna_lookup" || !z.query || z.memory) continue; // a D1-only call's memory row does not say its section
    const s0 = secOf(z.section), sec = SECTION_AR[s0] ? s0 : "factories"; // the lookup's own rule (index.js lookupSection: an unknown or missing section is the factories)
    if (!z.governorate && !z.market && said.has(sec + "|" + z.query)) continue; // (a) searched it this morning and said it
    const list = byQ.get(z.query) || []; if (!list.some(x => x.sec === sec && x.gov === z.governorate && x.mkt === z.market)) list.push({ sec, gov: z.governorate || "", mkt: z.market || "" });
    byQ.set(z.query, list);
  }
  let shownQ = 0, leftQ = 0;
  for (const [q, list] of byQ) {
    if (shownQ >= 3) { leftQ++; continue; }
    const res = []; for (const x of list.slice(0, 4)) { const sr = run(x.sec, q, x.gov, x.mkt); if (sr) res.push({ ...x, n: Number(sr.count) || 0 }); }
    if (!res.length) continue;
    shownQ++;
    const where = x => SECTION_AR[x.sec][0] + (x.gov ? " (" + bdi(x.gov) + ")" : ""), whereEn = x => SECTION_AR[x.sec][1] + (x.gov ? " (" + x.gov + ")" : "");
    const hit = res.filter(x => x.n > 0), none = res.filter(x => !x.n);
    out.push(hit.length ? { ar: "«" + bdi(q) + "» دلوقتي بيرجّع " + hit.map(x => ar(x.n) + " في " + where(x)).join(" و") + (none.length ? " — ولسه مفيش في " + none.map(where).join(" و") : ""),
      en: "“" + q + "” now returns " + hit.map(x => x.n + " in " + whereEn(x)).join(", ") + (none.length ? " — still nothing in " + none.map(whereEn).join(", ") : "") }
      : { ar: "«" + bdi(q) + "» ولسه مفيش في " + none.map(where).join(" و"), en: "“" + q + "” still returns nothing in " + none.map(whereEn).join(", ") });
  }
  if (leftQ) out.push({ ar: "و" + nAr(leftQ, "كلمة بحث تانية", "كلمتين بحث تانيين", "كلمات بحث تانية", "كلمة بحث تانية") + " رجّع" + (leftQ === 1 ? "ت" : "وا") + " صفر — في الملف المرفق", en: "and " + leftQ + " more zero-result queries — in the attached file" });
  if (r.seller && !r.offeredProfile) out.push({ ar: "ماعرض" + she + "ش عليه ملف بخدماته في الدليل", en: "never offered him a profile of his services" });
  if (r.generalUnanswered) out.push({ ar: "سؤاله محتاج إجابة من الفريق", en: "his question needs an answer from the team" });
  return out;
}

/* ---------- the cron (index.js platformCron after memory_day; skipped in the 07:00 digests tick) ----------
   The switch is read from this invocation's memo (ccBoot warmed it: no D1 read); everything after it runs on its OWN counting D1
   (memory.js budgetEnv(env, 80)) so the scheduled invocation stays far below D1's per-invocation limit with the other jobs. */
export async function callsReportCron(env, nowMs = Date.now(), CC, { sleep } = {}) {
  if (!env || !env.DB) return { skipped: "no store" };
  if (!(await featureOn(env, "calls_report"))) return { skipped: "feature_off" };     // OFF: nothing else at all (no Anam GET, no D1 read)
  if (cairoHM(nowMs) < CALLS_LIM.timeMin) return { skipped: "before_time" };         // the earliest time the owner can choose
  const benv = budgetEnv(env, CALLS_LIM.budget);
  const settings = await readSettings(benv);
  if (cairoHM(nowMs) < settings.time) return { skipped: "before_time" };
  const day = addDays(cairoDay(nowMs), -1), g = await gateOf(benv, day);
  if (g.sent || g.failed) return { skipped: "done", day };
  const st = await stateOf(env, featureDef("calls_report"));                            // no e-mail route / no recipient → locked
  if (st.locked) return { skipped: "locked", code: st.locked.code };
  if (!(await takeLock(benv, day, nowMs))) return { skipped: "locked_by_another_run", day };
  try {
    const g2 = await gateOf(benv, day); // again under the lock: a manual send («-r<n>», never deduped against this id) may have closed the day since the first read
    if (g2.sent || g2.failed) return { skipped: "done", day };
    return await runAndSend(benv, { day, nowMs, settings, mode: "cron", actor: SYSTEM, CC, sleep });
  }
  catch (e) { // a run that breaks counts as a failed try too: never 150 Anam reads every 15 minutes for the rest of the day
    const reason = line(maskPII(String((e && e.message) || e || "error")), 160);
    console.error("calls report: run failed", reason);
    try { return { ...(await failedTry(benv, day, nowMs, reason)), error: reason }; } catch (e2) { return { ran: true, day, sent: false, error: reason }; }
  }
  finally { await dropLock(benv, day); }
}
/* one failed try of the cron: the counter goes up; past failMax the day is closed as failed (cron_runs + cc_audit in one batch) */
async function failedTry(env, day, nowMs, reason) {
  const tries = await bumpTry(env, day, nowMs);
  if (tries > CALLS_LIM.failMax) {
    await batch(env, [gateStmt(env, "calls-report-failed", day, nowMs), auditStmt(env, { ...SYSTEM, action: "calls_report.failed", target_type: "calls_report", target_id: day, summary: "calls report of " + day + " not sent after " + tries + " tries", after: { reason, tries } })]);
    return { ran: true, day, sent: false, failed: true, tries };
  }
  return { ran: true, day, sent: false, tries };
}
/* build → (empty day: skip | send) → deliver → the gate + the audit row in ONE batch only after a provider id (or dedup); a failure leaves the
   gate open and bumps the counter; the 7th failure writes cron_runs('calls-report-failed', D) and the audit row calls_report.failed */
async function runAndSend(env, { day, nowMs, settings, mode, actor, CC, sleep, sendN = 0 }) {
  const b = await buildReport(env, { day, nowMs, settings, mode, actor, CC, sleep });
  const n = b.counts.conversations, masked = maskList(settings.to).join(", ");
  const counts = { conversations: n, customers: b.counts.customers, team: b.counts.team, outside: b.counts.outside, verdicts: b.counts.verdicts, gets: b.counts.gets, not_read: b.counts.notRead };
  if (!n && settings.empty === "skip" && mode === "cron") {
    await batch(env, [gateStmt(env, "calls-report", day, nowMs), auditStmt(env, { ...actor, action: "calls_report.skipped", target_type: "calls_report", target_id: day, summary: "no conversations on " + day + " (empty days: skip)", after: { reason: "empty", counts } })]);
    return { ran: true, day, skipped: "empty" };
  }
  const R = b.rendered, attachments = b.attach && R.csv ? [{ filename: "calls-" + day + ".csv", content: R.csv, type: "text/csv; charset=utf-8" }] : undefined;
  const r = await deliver(env, { id: "callrep-" + day + (sendN ? "-r" + sendN : ""), tpl: "team_calls_report", from: { email: fromAddr(env), name: FROM_NAME }, to: settings.to, replyTo: team(env) || undefined,
    subject: R.subject, text: R.text, html: R.html, attachments });
  const okId = !!(r && r.sent && (r.id || r.dedup));
  if (okId || (r && r.skipped === "template_off")) {
    const action = r.skipped ? "calls_report.skipped" : "calls_report.sent";
    await batch(env, [gateStmt(env, "calls-report", day, nowMs), auditStmt(env, { ...actor, action, target_type: "calls_report", target_id: day,
      summary: r.skipped ? "calls report of " + day + " not sent: the template is switched off in «البريد»" : n + " conversations → " + masked,
      after: { counts, provider: r.provider || "", provider_id: line(r.id || "", 120), ...(r.dedup ? { dedup: true } : {}), ...(r.skipped ? { reason: r.skipped } : {}), cards: R.cards, html_bytes: R.htmlBytes, csv_rows: R.csvRows } })]);
    return { ran: true, day, sent: !r.skipped, skipped: r.skipped || undefined, dedup: !!r.dedup, conversations: n };
  }
  const reason = line(maskPII(String((r && (r.error || r.skipped)) || (r && r.sent ? "no provider id" : "not sent"))), 160);
  if (mode !== "cron") return { ran: true, day, sent: false, reason };
  return failedTry(env, day, nowMs, reason);
}

/* ---------- the owner's API (acc-dev.js; dev.manage = owner only) ---------- */
const actorOf = adm => ({ ...((adm && adm.actor) || SYSTEM), ip_hash: (adm && adm.ipHash) || "", req_id: (adm && adm.reqId) || "" });
async function featureState(env) {
  const d = featureDef("calls_report"), value = await featureOn(env, "calls_report"), st = await stateOf(env, d);
  return { key: "calls_report", value, effective: !!(value && !st.locked), locked: st.locked };
}
function dayOf(v, nowMs) {
  const d = line(v, 10), today = cairoDay(nowMs);
  if (!dateOk(d)) fail(400, "invalid_day", "اليوم لازم يكون YYYY-MM-DD / day must be YYYY-MM-DD", { field: "day" });
  if (d > today || d < addDays(today, -CALLS_LIM.daysBack)) fail(400, "invalid_day", "اليوم لازم يكون من آخر " + CALLS_LIM.daysBack + " يوم / the day must be within the last " + CALLS_LIM.daysBack + " days", { field: "day" });
  return d;
}
export async function callsReportView(env) {
  const s = await readSettings(env), nowMs = Date.now(), from = addDays(cairoDay(nowMs), -7);
  let gates = [], logs = [];
  try { gates = (await env.DB.prepare("SELECT job, day, at FROM cron_runs WHERE job IN ('calls-report', 'calls-report-failed') AND day >= ? ORDER BY day DESC").bind(from).all()).results || []; } catch (e) { gates = []; }
  try { logs = (await env.DB.prepare("SELECT at, msg_id, status, to_masked, provider, error FROM cc_mail_log WHERE template = 'team_calls_report' AND at >= ? ORDER BY id DESC LIMIT 30").bind(dayStartIso(from)).all()).results || []; } catch (e) { logs = []; }
  const runs = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(cairoDay(nowMs), -i), gs = gates.filter(x => x.day === d), ml = logs.filter(x => String(x.msg_id || "").startsWith("callrep-" + d));
    runs.push({ day: d, status: gs.some(x => x.job === "calls-report") ? "done" : gs.some(x => x.job === "calls-report-failed") ? "failed" : "open", at: (gs[0] && gs[0].at) || "",
      mails: ml.slice(0, 4).map(x => ({ at: x.at, status: x.status, to: x.to_masked, provider: x.provider, error: line(x.error, 160), resend: /-r\d$/.test(String(x.msg_id || "")) })) });
  }
  return { settings: { to: s.savedTo, time: s.time, detail: s.detail, tests: s.tests, empty: s.empty, keep_days: s.keep_days, by: s.by, at: s.at, saved: s.saved, full_confirmed: !!s.full_confirmed },
    using_default: s.usingDefault, default_to: shownDefault(adminEmails(env)), recipients: s.usingDefault ? shownDefault(s.to) : s.to, domain: DOMAIN, full_confirm: FULL_CONFIRM,
    limits: { to_max: CALLS_LIM.toMax, time_min: CALLS_LIM.timeMin, time_max: CALLS_LIM.timeMax, keep_min: CALLS_LIM.keepMin, keep_max: CALLS_LIM.keepMax, sends_per_day: CALLS_LIM.sendsPerDay, previews_per_10min: CALLS_LIM.previewsPer10Min, days_back: CALLS_LIM.daysBack },
    feature: await featureState(env), route: { ready: mailReady(env), attachments: attachOk(env) }, anam: await anamProbe(env), runs, yesterday: addDays(cairoDay(nowMs), -1),
    /* for «المطوّر» only (the e-mail says it in plain words): exact caller identities need migration 0011 */
    setup: { exact_ids: await hasTable(env, "call_sessions"), migration: "0011_calls_report.sql", how: "GitHub → Actions → d1-migrate" } };
}
export async function callsReportPut(req, env, ctx, adm) {
  const b = await readBody(req, 8192), cur = await readSettings(env), t = new Date().toISOString(), by = line((adm && adm.actor && (adm.actor.actor_email || adm.actor.actor_id)) || "owner", 254);
  let to = cur.savedTo;
  if (b.use_default === true) to = [];
  else if (b.to !== undefined) {
    const list = (Array.isArray(b.to) ? b.to : String(b.to || "").split(/[\s,;]+/)).map(x => line(x, 254).toLowerCase()).filter(Boolean);
    if (!list.length || list.length > CALLS_LIM.toMax || !list.every(isEmail)) fail(400, "invalid_recipients", "من ١ لـ ٥ إيميلات صحيحة / 1 to 5 valid e-mail addresses", { field: "to", max: CALLS_LIM.toMax });
    to = [...new Set(list)];
  }
  const ext = to.filter(x => !internal(x));
  if (ext.length && b.confirm_external !== true && !(cur.savedTo.length && ext.every(x => cur.savedTo.includes(x)) && b.to === undefined)) fail(400, "external_confirm_required", "فيه إيميل برّه madeinegyptgate.com — أكّد إن التقرير (وفيه بيانات أشخاص) يوصله / an address outside madeinegyptgate.com — confirm that the report (it holds personal data) may go there", { field: "to", external: maskList(ext) });
  const time = b.time === undefined ? cur.time : String(b.time || "");
  if (!timeOk(time)) fail(400, "invalid_time", "الميعاد HH:MM من ٠٥:٠٠ لـ ١٢:٠٠ / time HH:MM between 05:00 and 12:00", { field: "time" });
  const detail = b.detail === undefined ? cur.detail : String(b.detail);
  if (!["masked", "full"].includes(detail)) fail(400, "invalid_detail", "masked أو full", { field: "detail" });
  if (detail === "full") {
    const list = to.length ? to : [];
    if (!list.length || !list.every(internal)) fail(400, "full_internal_only", "البيانات الكاملة بس لمستلمين على madeinegyptgate.com / full contacts only when every recipient is on madeinegyptgate.com", { field: "detail" });
    if (cur.detail !== "full" && b.confirm_full !== true) fail(400, "full_confirm_required", FULL_CONFIRM.ar + " / " + FULL_CONFIRM.en, { field: "confirm_full", sentence: FULL_CONFIRM });
  }
  const tests = b.tests === undefined ? cur.tests : String(b.tests);
  if (!["summary", "full", "off"].includes(tests)) fail(400, "invalid_tests", "summary أو full أو off", { field: "tests" });
  const empty = b.empty === undefined ? cur.empty : String(b.empty);
  if (!["send", "skip"].includes(empty)) fail(400, "invalid_empty", "send أو skip", { field: "empty" });
  const keep = b.keep_days == null ? cur.keep_days : Number(b.keep_days); // an emptied field (null) keeps the current value, never 0 = «keep forever»
  if (!keepOk(keep)) fail(400, "invalid_keep_days", "٠ (احتفظ) أو من ٣٠ لـ ٧٣٠ يوم / 0 (keep) or 30–730 days", { field: "keep_days" });
  const fullConfirmed = detail === "full" ? (cur.detail === "full" && cur.full_confirmed ? cur.full_confirmed : { at: t, by, text_v: 1 }) : null;
  const next = { v: 1, to, time, detail, tests, empty, keep_days: keep, by, at: t, ...(fullConfirmed ? { full_confirmed: fullConfirmed } : {}) };
  const view = o => ({ to: maskList(o.to), time: o.time, detail: o.detail, tests: o.tests, empty: o.empty, keep_days: o.keep_days });
  const before = view({ ...cur, to: cur.savedTo }), after = view(next);
  const keys = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!keys.length) return { ok: true, unchanged: true, ...(await callsReportView(env)) };
  await batch(env, [
    env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'system', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET scope = 'system', v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(CALLS_REPORT_KEY, JSON.stringify(next), by, t),
    adm.auditStmt("dev.calls_report", "calls_report", "settings", Object.fromEntries(keys.map(k => [k, before[k]])), { ...Object.fromEntries(keys.map(k => [k, after[k]])), ...(detail === "full" && cur.detail !== "full" ? { full_confirmed: FULL_CONFIRM.ar } : {}), ...(ext.length ? { external_confirmed: true } : {}) },
      "calls report settings: " + keys.join(", ") + (detail === "full" && cur.detail !== "full" ? " (full contacts confirmed by the owner)" : "")),
  ]);
  return { ok: true, changed: keys, ...(await callsReportView(env)) };
}
export async function callsReportSend(req, env, ctx, adm) {
  const b = await readBody(req, 4096), nowMs = Date.now(), day = dayOf(b.day, nowMs);
  const f = await featureState(env);
  if (!f.value) fail(503, "feature_off", "تقرير المكالمات مقفول من «المزايا» / the calls report is switched off in «Features»", { feature: "calls_report" });
  if (f.locked) fail(409, "feature_locked", f.locked.ar + " / " + f.locked.en, { feature: "calls_report", locked: f.locked });
  const settings = await readSettings(env);
  const n = (await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = rl.n + 1 RETURNING n").bind("callrep-send|" + day, iso(nowMs + 3 * 86400000)).first("n")) || 0;
  if (n > CALLS_LIM.sendsPerDay) fail(429, "rate_limited", "اتبعت ٣ مرات لليوم ده خلاص / sent 3 times for that day already", { max: CALLS_LIM.sendsPerDay });
  if (!(await takeLock(env, day, nowMs))) fail(409, "busy", "التقرير ده بيتعمل دلوقتي — جرّب بعد دقايق / this report is being built right now — try again in a few minutes");
  const auditId = await adm.audit("calls_report.send", "calls_report", day, null, { day, to: maskList(settings.to), resend: n }, "calls report of " + day + " sent by hand to " + maskList(settings.to).join(", ") + " (#" + n + ")");
  try {
    const r = await runAndSend(env, { day, nowMs, settings, mode: "send", actor: actorOf(adm), CC: adm && adm.CC, sendN: n });
    await adm.auditDone(auditId, { after: { day, to: maskList(settings.to), resend: n, sent: !!r.sent, ...(r.reason ? { reason: r.reason } : {}), ...(r.skipped ? { skipped: r.skipped } : {}) } });
    return { ok: !!r.sent, sent: !!r.sent, day, ...(r.reason ? { reason: r.reason } : {}), ...(r.skipped ? { skipped: r.skipped } : {}), resend: n, max: CALLS_LIM.sendsPerDay };
  } finally { await dropLock(env, day); }
}
export async function callsReportPreview(req, env, ctx, adm, url) {
  const nowMs = Date.now(), day = dayOf(url.searchParams.get("day") || addDays(cairoDay(nowMs), -1), nowMs);
  const f = await featureState(env);
  if (!f.value) fail(503, "feature_off", "تقرير المكالمات مقفول من «المزايا» / the calls report is switched off in «Features»", { feature: "calls_report" });
  if (!(await rateOk(env, "callrep-prev|" + line((adm && adm.actor && adm.actor.actor_id) || "owner", 80), CALLS_LIM.previewsPer10Min, 600, nowMs))) fail(429, "rate_limited", "معاينات كتير — استنى دقايق / too many previews — wait a few minutes", { retry_s: 600 });
  await adm.audit("calls_report.preview", "calls_report", day, null, { day }, "calls report preview of " + day + " (personal data shown to the owner)");
  const settings = await readSettings(env);
  const b = await buildReport(env, { day, nowMs, settings, mode: "preview", actor: actorOf(adm), CC: adm && adm.CC });
  return { ok: true, day, subject: b.rendered.subject, html: b.rendered.html, text: b.rendered.text, counts: b.counts, warnings: b.warnings, csv_rows: b.rendered.csvRows, cards: b.rendered.cards, html_bytes: b.rendered.htmlBytes, anam: b.anam, attachment: b.attach };
}
