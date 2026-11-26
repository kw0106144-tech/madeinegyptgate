/* «بحث وكتابة عميقة» — Bassem's deep research & writing jobs (owner 2026-11-20 «أنا عايز جنه وباسم يبقوا زي شات جي بي تي كده في البحث
   والتطوير والرد والعمل», his OK «اعمله» 2026-11-21; design part A, phase «لباسم الأول»). Janna's side comes after a good day of Bassem's.
     POST /api/advisor/research              {action: start | status | mail, kind, product?, product_en?, buyer_industries?, question?, market?,
                                             governorate?, details?, ref?, subject?, doc_lang?, label?, call_key, lang?, chain?, use_profile?,
                                             heard?} (arguments also wrapped: bodyParams / arguments) — Bassem's CLIENT tool through his call page
     GET  /api/advisor/research/<id>         the status (state, progress, eta, then title, counts, top, say, block)
     GET  /api/advisor/research/<id>/doc     the customer document, statuses computed NOW (410 gone past retention / hidden)
     POST /api/advisor/research/<id>         {action: alive | told | delete} — the call page's heartbeat, the delivery outcome, «🗑️ امسح»
     POST /api/advisor/research/<id>/mail    the document to the signed-in member's OWN address (Bearer v2 full sign-in only)
   Every request: the site's Origin (originOk), the member's own sign-in (janna-session.js bassemCaller: full sign-in, a plan with Bassem,
   staff allowed), his own jobs only (another member's id = the same 404 as a missing one). Start, in this order: the owner's switch
   research_bassem (503 feature_off) · migration 0014 (503 research_off) · the Workflow binding RESEARCH (503 runner_off) · the AI binding
   (503 ai_off) · the inputs (masked; an instruction-like or contact-only field → 400; buyers without industries / an ambiguous product → 400
   with the question to ask; nothing started) · the same call_key → the same job · one running job per member (429 research_busy) · the caps
   (per call 4, per member a Cairo day 12, Bassem 120 and all research 150 a day → 429 cap_*; the AI day's remainder → 503 ai_cap) ·
   INSERT research_jobs (queued) · env.RESEARCH.create({id, params: {id}, retention}). Every answer carries `ack`, the persona-facing line
   (research-kinds.js VOICE), which never holds the document key, a link or a source.
   The job (runJob, one Workflow instance «migate-research» per job: research-flow.js): load · gather_platform (in-process search() +
   findItem(), injected by index.js useDeps) · gather_intel (the Information Center feed through the INTEL binding, GET only) · gather_web
   (the hunt / one search of websearch.js, only with the switch bassem_web_search and a ready key, inside the research sub-caps) ·
   save_sources (the evidence pack the model sees: no url / site / source / found date — and the INTERNAL source map) · write (ONE model call,
   research-check.js, at most one fallback call; without a model answer the data sections only, or `failed` for the writing kinds) · finish
   (research-render.js) · wait_told + auto_mail (only with the owner's setting mail_if_untold, D11; off by default).
   Stored (0014_research.sql): the masked inputs, the document (deadlines, never a status), the INTERNAL sources + the checker's removals
   (data desk only), cost numbers; blanked by researchCron at expires_at (members +365 days). One log line of numbers per job, never text.
   What never leaves to a customer or the persona: a source, a site, a link out, the date an item was found, an outside page's own title. */
import { line, cairoDay, addDays, iso, hmac, secretOf, sha256, jparse, site, fromAddr, fromName, isEmail, rateOk, ipHash } from "./common.js";
import { maskPII, MASK_EMAIL, MASK_PHONE, forLLM, instructionLike, norm } from "./text.js";
import { originOf, originOk, bassemCaller } from "./janna-session.js";
import { bearer, isV2, authUser, isLinkSession } from "./auth.js";
import { featureOn } from "./flags.js";
import { hasTable } from "./acc-base.js";
import { anonymize } from "./knowledge.js";
import { memberProfile } from "./profile.js";
import { intelFetch } from "./notify-items.js";
import { webSearchConfig } from "./service-keys.js";
import { webSearch, reserveUnits, giveBack, usedToday, parseArgs } from "./websearch.js";
import { runHunt, parseHunt } from "./web-hunt.js";
import { productNeed, bareHost } from "./web-classify.js";
import { recordLeads, leadHash } from "./web-leads.js";
import { siteLabels } from "./web-public.js";
import { deliver } from "./email-center.js";
import { aiOn, aiText, modelOk, MODEL_ALLOW, DEFAULT_MODELS, PAID_ONLY, estimateNeurons } from "./ai-call.js";
import { aiReserve, aiSettle, aiToday, dayLimit } from "./ai-budget.js";
import { KINDS, KIND_KEYS, MARKETS, LOOKUP_MARKET, DOC_LANGS, VOICE, voiceOf, fill, writerSystem, templateText, DOC_SCHEMA } from "./research-kinds.js";
import { check, scrubSources } from "./research-check.js";
import { render, readDoc, topOf, mailOf, statusOf, LIM as RLIM } from "./research-render.js";

export const TABLE = "research_jobs";
export const ID_RX = /^rj[0-9a-z]{20}$/;
export const RUNNING = ["queued", "gathering", "writing", "checking"];
export const CAPS = Object.freeze({ per_call: 4, member_day: 12, bassem_day: 120, all_day: 150, mail_day: 10, web_share: 0.3, web_member_day: 24, stuck_min: 15 });
export const RETENTION = Object.freeze({ member_days: 365, visitor_days: 30, success: "1 day", error: "3 days" });
export const PACK = Object.freeze({ items: 60, chars: 24000, text: 300, snippet: 140, platform: 8, intel: 12, web: 12 });
const AUTO_MAIL = Object.freeze({ sleep: "2 minutes", alive_ms: 90000, max_rounds: 15 });

/* ---------- the deps index.js injects (search, findItem, enrichResult, memberData, DATA): no import cycle ---------- */
let DEPS = { search: null, findItem: null, enrichResult: null, memberData: null, DATA: null };
export function useDeps(d) { DEPS = { ...DEPS, ...(d || {}) }; return DEPS; }

/* ---------- the owner's settings «🛠️ المطوّر» → «🧪 الذكاء الاصطناعي» (cc_settings dev.ai, scope system; 30 s memo) ---------- */
export const AI_KEY = "dev.ai";
const SET_MEMO = new WeakMap();
export function settingsDefaults(env) {
  const v = k => line(env && env[k], 120);
  return { models: { research_bassem: modelOk(v("RESEARCH_MODEL_BASSEM")) ? v("RESEARCH_MODEL_BASSEM") : DEFAULT_MODELS.research_bassem, fallback: modelOk(v("RESEARCH_MODEL_FALLBACK")) ? v("RESEARCH_MODEL_FALLBACK") : DEFAULT_MODELS.fallback },
    reasoning: "medium", day_neurons: dayLimit(env), caps: { ...CAPS }, mail_if_untold: false };
}
export function parseSettings(env, raw) {
  const d = settingsDefaults(env), o = raw && typeof raw === "object" ? raw : {}, out = { ...d, models: { ...d.models }, caps: { ...d.caps } };
  if (o.models && typeof o.models === "object") for (const k of ["research_bassem", "fallback"]) if (modelOk(o.models[k])) out.models[k] = o.models[k];
  if (["off", "low", "medium", "high"].includes(o.reasoning)) out.reasoning = o.reasoning;
  if (Number.isInteger(o.day_neurons) && o.day_neurons >= 0 && o.day_neurons <= 5000000) out.day_neurons = o.day_neurons;
  if (o.caps && typeof o.caps === "object") for (const k of ["per_call", "member_day", "bassem_day", "all_day", "mail_day", "web_member_day"]) { const n = o.caps[k]; if (Number.isInteger(n) && n >= 0 && n <= 1000) out.caps[k] = n; }
  if (o.caps && typeof o.caps.web_share === "number" && o.caps.web_share >= 0 && o.caps.web_share <= 0.5) out.caps.web_share = o.caps.web_share;
  if (typeof o.mail_if_untold === "boolean") out.mail_if_untold = o.mail_if_untold;
  return out;
}
export async function aiSettings(env, { fresh = false } = {}) {
  const db = env && env.DB, hit = db && SET_MEMO.get(db);
  if (!fresh && hit && Date.now() - hit.at < 30000) return hit.v;
  let raw = null;
  if (db) try { const r = await db.prepare("SELECT v FROM cc_settings WHERE k = ? AND scope = 'system'").bind(AI_KEY).first(); raw = r ? jparse(r.v, null) : null; } catch (e) { raw = null; }
  const v = parseSettings(env, raw); if (db) SET_MEMO.set(db, { at: Date.now(), v }); return v;
}
export const forgetSettings = env => { if (env && env.DB) SET_MEMO.delete(env.DB); };

/* ---------- HTTP helpers (same-origin: the allowed Origin is reflected, never «*») ---------- */
const HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
const out = (o, status, cors) => new Response(status === 204 ? null : JSON.stringify(o), { status, headers: { ...HDR, ...(cors ? { "Access-Control-Allow-Origin": cors, "Access-Control-Allow-Credentials": "false" } : {}) } });
const ERR = { feature_off: "البحث الأعمق مقفول / deep research is off", research_off: "مخزن البحث مش متاح لسه / the research store is not available yet", runner_off: "مشغّل البحث مش متاح / the research runner is not available",
  ai_off: "الذكاء الاصطناعي مش متاح / AI is not available", ai_cap: "حد الذكاء الاصطناعي النهارده خلص / today's AI budget is used up", bad_request: "طلب ناقص / bad request", bad_input: "الطلب مينفعش / this request cannot run",
  pii_not_allowed: "من غير أسماء ناس ولا تليفونات ولا إيميلات / no names, phones or e-mails", kind_not_allowed: "نوع مش معروف / unknown kind", industries_required: "ناقص الصناعات اللي بتشتري / the buying industries are missing",
  product_ambiguous: "الكلمة ليها أكتر من معنى / the word has several meanings", research_busy: "فيه بحث شغّال / a search is running", cap_call: "حد المكالمة خلص / the call's limit is reached",
  cap_member: "حد النهارده خلص / today's limit is reached", cap_day: "حد المنصة النهارده خلص / the platform's daily limit is reached", not_found: "مش موجود / not found", gone: "المستند مش متاح / the document is not available",
  origin_not_allowed: "origin not allowed", method: "method not allowed", full_login_required: "ادخل بكود الإيميل / sign in with an e-mail code", not_done: "المستند لسه ماخلصش / the document is not finished",
  server: "خطأ / server error", login_required: "سجّل دخولك / sign in", plan: "باقتك مافيهاش باسم / your plan has no Bassem" };
const fail = (status, code, cors, extra) => out({ error: ERR[code] || code, code, ...(extra || {}) }, status, cors);
const pathOf = req => { const p = new URL(req.url).pathname; return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p; };
async function readBody(req, max = 16384) { try { const t = await req.text(); if (t.length > max) return { tooLarge: true }; return { b: t ? JSON.parse(t) : {} }; } catch (e) { return { bad: true }; } }
/* Anam's arguments arrive flat or wrapped (bodyParams / arguments / parameters / input, an object or its JSON text) */
export function argsOf(b) {
  let a = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  for (const k of ["bodyParams", "arguments", "parameters", "args", "input"]) { let v = a[k]; if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } } if (v && typeof v === "object" && !Array.isArray(v)) { a = { ...a, ...v }; } }
  return a;
}
const rid = () => "rj" + [...crypto.getRandomValues(new Uint8Array(20))].map(b => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
const clip = (s, n) => { const a = Array.from(String(s || "")); return a.length <= n ? a.join("") : a.slice(0, n).join(""); };

/* ---------- the inputs: masked, never echoed unless sayable ---------- */
const TEXT_FIELDS = { product: 120, product_en: 80, question: 300, governorate: 40, details: 4000, subject: 120, buyer: 100, audience: 120, tone: 40 };
/* one text input → {v} | {err}: instruction-like → bad_input; only contact data / a person → pii_not_allowed */
export function cleanInput(raw, max, own) {
  if (raw == null || raw === "") return { v: "" };
  if (typeof raw !== "string" && typeof raw !== "number") return { err: "bad_request" };
  const s = String(raw).normalize("NFKC").slice(0, max * 2);
  if (instructionLike(s, { money: false })) return { err: "bad_input" };
  const masked = maskPII(s);
  const v = own ? forLLM(masked, max) : anonymize(masked).slice(0, max);
  const left = v.split(MASK_EMAIL).join(" ").split(MASK_PHONE).join(" ").replace(/[\s\p{P}]+/gu, " ").trim();
  if (!left && s.trim()) return { err: "pii_not_allowed" };
  return { v: v.split(MASK_EMAIL).join("").split(MASK_PHONE).join("").replace(/\s{2,}/g, " ").trim() };
}
/* the masked params of a start, or {err, ack_key, w} */
export function paramsOf(a, kind) {
  const K = KINDS[kind], p = {};
  for (const k of Object.keys(TEXT_FIELDS)) { const r = cleanInput(a[k], TEXT_FIELDS[k], K.own || k === "details"); if (r.err) return { err: r.err }; if (r.v) p[k] = r.v; }
  const inds = (Array.isArray(a.buyer_industries) ? a.buyer_industries : typeof a.buyer_industries === "string" ? a.buyer_industries.split(/[,،;]+/) : []).slice(0, 3);
  const bi = []; for (const x of inds) { const r = cleanInput(x, 40, false); if (r.err) return { err: r.err }; if (r.v) bi.push(r.v); }
  if (bi.length) p.buyer_industries = bi;
  const mk = String(a.market || "").trim().toLowerCase(); if (mk) p.market = MARKETS[mk] ? mk : "world";
  const dl = String(a.doc_lang || "").trim().toLowerCase().slice(0, 5); p.doc_lang = DOC_LANGS.includes(dl) ? dl : "";
  const ref = String(a.ref || "").trim(); if (ref) { if (/^(?:item:(?:tenders|rfqs|factories|products|projects):[\w.:\-]{1,60}|intel:[A-Za-z0-9_-]{4,64})$/.test(ref)) p.ref = ref; else return { err: "bad_request" }; }
  if (a.use_profile === true || a.use_profile === false) p.use_profile = a.use_profile; else p.use_profile = ["company_profile", "quote", "posts", "emails"].includes(kind);
  const n = parseInt(a.count, 10); if (Number.isFinite(n)) p.count = Math.max(1, Math.min(n, kind === "emails" ? 5 : 6));
  /* what to ask before any job: buyers need the buying industries (else the search would list his competitors) */
  for (const need of K.need) {
    if (need === "buyer_industries" && !(p.buyer_industries && p.buyer_industries.length)) return { err: "industries_required", ack_key: "ask_industries" };
    if (need === "ref|question") { if (!p.ref && !p.question) return { err: "bad_request", ack_key: "ask_input", w: "question" }; continue; }
    if (need !== "buyer_industries" && !p[need] && !(need === "market" && p.market)) return { err: "bad_request", ack_key: "ask_input", w: need };
  }
  if (kind === "buyers" || kind === "export_plan") { const nd = productNeed(p.product || "", p.product_en || ""); if (nd && nd.amb && !(p.buyer_industries && p.buyer_industries.length && kind === "buyers")) return { err: "product_ambiguous", ack_key: "ask_meaning", w: nd.amb.word || p.product }; }
  return { p };
}
const sayable = s => clip(String(s || "").replace(/[\[\]{}<>«»"]/g, " ").replace(/\s+/g, " ").trim(), 60);
function ackOf(voice, key, v = {}) { const V = VOICE[voice] || VOICE.bassem_ar; return clip(fill(V[key] || V.off, v), RLIM.ack); }
const needOf = (kind, voice) => (voice === "bassem_en" ? KINDS[kind].need_en : KINDS[kind].need_ar);

/* ---------- day counters (one row per Cairo day, like chat-media.js dayCount) ---------- */
const UP = "INSERT INTO rl (k, n, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = n + excluded.n RETURNING n";
const dayExp = nowMs => addDays(cairoDay(nowMs), 2) + "T00:00:00.000Z";
async function take(env, keys, nowMs) {
  const got = [];
  for (const [k, lim, code] of keys) {
    const n = Number(await env.DB.prepare(UP).bind(k, 1, dayExp(nowMs)).first("n")) || 0; got.push(k);
    if (n > lim) { await giveKeys(env, got); return code; }
  }
  return "";
}
async function giveKeys(env, keys) { for (const k of keys) { try { await env.DB.prepare("UPDATE rl SET n = MAX(0, n - 1) WHERE k = ?").bind(k).run(); } catch (e) { /* expires */ } } }
const capKeys = (m, chainKey, nowMs, caps) => { const d = cairoDay(nowMs); return [["rsday|" + d, caps.all_day, "cap_day"], ["rsday|bassem|" + d, caps.bassem_day, "cap_day"], ["rsj|m|" + m.id + "|" + d, caps.member_day, "cap_member"], ...(chainKey ? [["rsj|c|" + chainKey + "|" + d, caps.per_call, "cap_call"]] : [])]; };

/* ---------- reading a job (his own only) ---------- */
async function jobOf(env, id, memberId) {
  if (!ID_RX.test(String(id || ""))) return null;
  return env.DB.prepare(`SELECT * FROM ${TABLE} WHERE id = ? AND who = 'bassem' AND member_id = ?`).bind(id, String(memberId)).first();
}
const progressOf = j => { const s = jparse(j.step, {}); return { gather: s.gather || (j.state === "queued" ? "waiting" : "running"), write: s.write || (j.state === "writing" || j.state === "checking" ? "running" : j.state === "done" ? "done" : "waiting") }; };
export function statusShape(j, nowMs = Date.now()) {
  const o = { id: j.id, label: j.label, kind: j.kind, state: j.state, progress: progressOf(j), eta_s: Math.max(0, j.eta_s - Math.round((nowMs - Date.parse(j.created_at)) / 1000)), partial: !!j.partial };
  if (j.state === "done") {
    const doc = jparse(j.doc, null), c = jparse(j.counts, {});
    Object.assign(o, { title: j.title, counts: { buyers: c.buyers || 0, tenders_open: c.tenders_open || 0, rfqs_open: c.rfqs_open || 0, projects: c.projects || 0, opportunities: c.opportunities || 0 },
      top: doc ? topOf(readDoc(doc, { nowMs, hidden: jparse(j.team_hidden, []) }), nowMs) : [], say: j.say, block: j.block, doc_path: "/research/#" + j.id });
    if (j.team_state === "hidden" || !doc) { o.top = []; o.doc_path = ""; }
  }
  if (j.state === "failed") o.error = { code: j.error || "failed" };
  return o;
}
function statusAck(j, voice, nowMs) {
  if (j.state === "done") return clip(j.block || ackOf(voice, "failed"), RLIM.block);
  if (j.state === "failed") return ackOf(voice, KINDS[j.kind] && KINDS[j.kind].own ? "failed_doc" : "failed");
  const V = VOICE[voice] || VOICE.bassem_ar, pr = progressOf(j);
  return clip(fill(V.running, { label: j.label, step: pr.gather === "done" ? V.step_write : V.step_gather, left: Math.max(5, j.eta_s - Math.round((nowMs - Date.parse(j.created_at)) / 1000)) }), RLIM.status);
}

/* ---------- start ---------- */
async function startJob(req, env, ctx, m, a, cors, nowMs) {
  const voice = voiceOf("bassem", a.lang);
  const kind = String(a.kind || "").trim().toLowerCase();
  if (!KIND_KEYS.includes(kind)) return fail(400, "kind_not_allowed", cors, { ack: ackOf(voice, "bad_input") });
  if (!(await featureOn(env, "research_bassem"))) return fail(503, "feature_off", cors, { ack: ackOf(voice, "off") });
  if (!(await hasTable(env, TABLE))) return fail(503, "research_off", cors, { ack: ackOf(voice, "off") });
  if (!(env.RESEARCH && typeof env.RESEARCH.create === "function")) return fail(503, "runner_off", cors, { ack: ackOf(voice, "off") });
  if (!aiOn(env)) return fail(503, "ai_off", cors, { ack: ackOf(voice, "off") });
  const P = paramsOf(a, kind);
  if (P.err) { const code = P.err; return fail(400, code, cors, { ack: ackOf(voice, P.ack_key || (code === "pii_not_allowed" || code === "bad_input" ? "bad_input" : "bad_input"), { w: sayable(P.w), what: sayable(P.w) }) }); }
  const p = P.p, set = await aiSettings(env);
  const secret = secretOf(env);
  const ck = String(a.call_key || "").slice(0, 300), chain = line(a.chain, 80);
  const call_key = ck && secret ? (await hmac(secret, "rs|" + m.id + "|" + ck)).slice(0, 32) : "";
  const chainKey = chain && secret ? (await hmac(secret, "rsc|" + m.id + "|" + chain)).slice(0, 24) : "";
  if (call_key) { const old = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND ticket_key = '' AND call_key = ?`).bind(m.id, call_key).first(); if (old) return out({ ok: true, again: true, ...statusShape(old, nowMs), ack: old.state === "done" ? statusAck(old, voice, nowMs) : ackOf(voice, KINDS[kind].own ? "start_doc" : "start", { need: needOf(kind, voice), p: sayable(p.product || p.subject || p.question || ""), eta: old.eta_s, where: (VOICE[voice] || VOICE.bassem_ar).where, label: old.label }) }, 200, cors); }
  const run = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND state IN ('queued','gathering','writing','checking') ORDER BY created_at DESC LIMIT 1`).bind(m.id).first();
  if (run) return fail(429, "research_busy", cors, { retry_after: 30, ack: ackOf(voice, "busy", { p: sayable(jparse(run.params, {}).product || ""), label: run.label }), running: statusShape(run, nowMs) });
  /* the AI day: refused at the start only when the day's remainder is below one job's estimate (the write step reserves for real) */
  const K = KINDS[kind], estOne = estimateNeurons(set.models.research_bassem, PACK.chars + 6000, K.out);
  const today = await aiToday(env, { nowMs, day_neurons: set.day_neurons });
  if (today.left < estOne || (today.by.research || 0) + estOne > Math.floor(set.day_neurons * 0.4)) return fail(503, "ai_cap", cors, { ack: ackOf(voice, "cap", { when: VOICE[voice].when_day }) });
  const capCode = await take(env, capKeys(m, chainKey, nowMs, set.caps), nowMs);
  if (capCode) return fail(429, capCode, cors, { retry_after: 3600, ack: ackOf(voice, "cap", { when: capCode === "cap_call" ? VOICE[voice].when_call : VOICE[voice].when_day }) });
  const id = rid(), t = iso(nowMs);
  const n = Number(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND created_at >= ?`).bind(m.id, iso(nowMs - 3 * 3600e3)).first("n")) || 0;
  const label = "R" + Math.min(n + 1, 99), lang = p.doc_lang || (voice === "bassem_en" ? "en" : "ar"), eta = K.eta;
  const ins = await env.DB.prepare(`INSERT INTO ${TABLE} (id, who, via, member_id, call_key, label, kind, lang, voice_lang, params, state, step, eta_s, created_at, updated_at, expires_at)
    SELECT ?, 'bassem', 'call', ?, ?, ?, ?, ?, ?, ?, 'queued', '{}', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND state IN ('queued','gathering','writing','checking'))`)
    .bind(id, m.id, call_key, label, kind, lang, voice === "bassem_en" ? "en" : "ar", JSON.stringify({ ...p, heard: heardOf(a.heard) }), eta, t, t, iso(nowMs + RETENTION.member_days * 864e5), m.id).run();
  if (!(ins && ins.meta && ins.meta.changes)) { await giveKeys(env, capKeys(m, chainKey, nowMs, set.caps).map(x => x[0])); return fail(429, "research_busy", cors, { retry_after: 30, ack: ackOf(voice, "busy", { p: sayable(p.product || ""), label: "" }) }); }
  try { await env.RESEARCH.create({ id, params: { id }, retention: { successRetention: RETENTION.success, errorRetention: RETENTION.error } }); }
  catch (e) {
    await env.DB.prepare(`UPDATE ${TABLE} SET state = 'failed', error = 'runner_failed', updated_at = ? WHERE id = ?`).bind(iso(nowMs), id).run();
    await giveKeys(env, capKeys(m, chainKey, nowMs, set.caps).map(x => x[0]));
    console.log("research", JSON.stringify({ id, kind, who: "bassem", state: "failed", error: "runner_failed" }));
    return fail(503, "runner_off", cors, { ack: ackOf(voice, KINDS[kind].own ? "failed_doc" : "failed") });
  }
  const V = VOICE[voice];
  return out({ ok: true, id, label, state: "queued", kind, eta_s: eta, doc_path: "/research/#" + id,
    ack: ackOf(voice, K.own ? "start_doc" : "start", { need: needOf(kind, voice), p: sayable(p.product || p.subject || p.question || ""), eta, where: a.phone ? V.where_phone : V.where, label }) }, 200, cors);
}
/* the call's last user words (a voice quotation's numbers must be in them — research-check.js C3): masked, ≤ 6 × 300 */
const heardOf = h => (Array.isArray(h) ? h.slice(-6).map(x => forLLM(maskPII(String(x || "")), 300)).filter(Boolean) : []);

/* ---------- mail (the member's own address, a v2 full sign-in) ---------- */
export async function mailJob(env, j, nowMs = Date.now(), { auto = false } = {}) {
  if (!j || j.state !== "done" || j.team_state === "hidden" || !j.doc) return { sent: false, reason: j && j.state !== "done" ? "not_done" : "gone" };
  if (j.mail_state === "sent") return { sent: true, again: true };
  const mem = await env.DB.prepare("SELECT id, email, email_verified_at FROM members WHERE id = ?").bind(j.member_id).first();
  if (!mem || !isEmail(mem.email) || /@invalid$/.test(mem.email)) return { sent: false, reason: "no_email" };
  const set = await aiSettings(env);
  const n = Number(await env.DB.prepare(UP).bind("rsmail|m|" + j.member_id + "|" + cairoDay(nowMs), 1, dayExp(nowMs)).first("n")) || 0;
  if (n > set.caps.mail_day) { await giveKeys(env, ["rsmail|m|" + j.member_id + "|" + cairoDay(nowMs)]); return { sent: false, reason: "cap" }; }
  const mail = mailOf(jparse(j.doc, null), { site: site(env), id: j.id, nowMs, persona: "bassem" });
  if (!mail) return { sent: false, reason: "gone" };
  let r = { sent: false };
  try { r = await deliver(env, { id: "rdoc-" + j.id, from: { email: fromAddr(env), name: "باسم — " + fromName(env) }, to: [mem.email], subject: mail.subject, text: mail.text, html: mail.html }); } catch (e) { r = { sent: false, error: "exception" }; }
  await env.DB.prepare(`UPDATE ${TABLE} SET mail_state = ?, mailed_at = ?, updated_at = ? WHERE id = ?`).bind(r.sent ? "sent" : "failed", r.sent ? iso(nowMs) : "", iso(nowMs), j.id).run();
  if (!r.sent) await giveKeys(env, ["rsmail|m|" + j.member_id + "|" + cairoDay(nowMs)]);
  console.log("research mail", JSON.stringify({ id: j.id, sent: !!r.sent, auto }));
  return r.sent ? { sent: true } : { sent: false, reason: r.error === "email not configured" ? "off" : "failed" };
}
async function fullSignIn(req, env) { const t = bearer(req); if (!t || !isV2(t)) return null; const m = await authUser(req, env, t); return m && !isLinkSession(m) ? m : null; }

/* ---------- the handler ---------- */
export async function handleBassemResearch(req, env, ctx, opt) {
  env = env || {};
  const nowMs = opt && Number.isFinite(opt.nowMs) ? opt.nowMs : Date.now(), p = pathOf(req);
  const o = originOf(req), allowed = originOk(env, o), cors = allowed && req.headers.get("Origin") ? o : "";
  try {
    const mm = /^\/api\/advisor\/research(?:\/(rj[0-9a-z]{20})(?:\/(doc|mail))?)?$/.exec(p);
    if (!mm) return fail(404, "not_found", cors);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...(cors ? { "Access-Control-Allow-Origin": cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" } : {}), Vary: "Origin" } });
    if (!allowed) return fail(403, "origin_not_allowed", "");
    if (!env.DB) return fail(503, "research_off", cors);
    const c = await bassemCaller(req, env);
    if (c.no) return fail(c.no[0], c.no[1], cors, { ack: ackOf("bassem_ar", "off") });
    const m = c.m, id = mm[1], sub = mm[2];
    if (!id) {
      if (req.method !== "POST") return fail(405, "method", cors);
      const rb = await readBody(req); if (rb.tooLarge || rb.bad) return fail(400, "bad_request", cors, { ack: ackOf("bassem_ar", "bad_input") });
      const a = argsOf(rb.b), action = String(a.action || "start").toLowerCase(), voice = voiceOf("bassem", a.lang);
      if (action === "start") return await startJob(req, env, ctx, m, a, cors, nowMs);
      if (!(await hasTable(env, TABLE))) return fail(503, "research_off", cors, { ack: ackOf(voice, "off") });
      /* status / mail by label (the latest job of that label in the last 6 hours) or by id */
      let j = null;
      if (ID_RX.test(String(a.id || ""))) j = await jobOf(env, a.id, m.id);
      else if (/^R\d{1,2}$/i.test(String(a.label || ""))) j = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND label = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`).bind(m.id, String(a.label).toUpperCase(), iso(nowMs - 6 * 3600e3)).first();
      else j = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE who = 'bassem' AND member_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`).bind(m.id, iso(nowMs - 6 * 3600e3)).first();
      if (!j) return fail(404, "not_found", cors, { ack: ackOf(voice, "failed") });
      if (action === "status") { j = await unstick(env, j, nowMs); return out({ ...statusShape(j, nowMs), ack: statusAck(j, voice, nowMs) }, 200, cors); }
      if (action === "mail") return await mailAction(req, env, j, voice, cors, nowMs);
      return fail(400, "bad_request", cors, { ack: ackOf(voice, "bad_input") });
    }
    if (!(await hasTable(env, TABLE))) return fail(503, "research_off", cors);
    let j = await jobOf(env, id, m.id);
    if (!j) return fail(404, "not_found", cors);
    if (sub === "doc") {
      if (req.method !== "GET") return fail(405, "method", cors);
      if (j.state !== "done") return out({ ...statusShape(j, nowMs) }, 202, cors);
      const doc = jparse(j.doc, null);
      if (!doc || j.team_state === "hidden") return fail(410, "gone", cors);
      return out({ id: j.id, label: j.label, kind: j.kind, created_at: j.created_at, expires_at: j.expires_at, doc: readDoc(doc, { nowMs, hidden: jparse(j.team_hidden, []) }) }, 200, cors);
    }
    if (sub === "mail") { if (req.method !== "POST") return fail(405, "method", cors); return await mailAction(req, env, j, voiceOf("bassem", j.voice_lang), cors, nowMs); }
    if (req.method === "GET") {
      if (!(await rateOk(env, "rspoll|m|" + m.id, 60, 60, nowMs))) return fail(429, "rate_limited", cors, { retry_after: 10 });
      j = await unstick(env, j, nowMs); return out(statusShape(j, nowMs), 200, cors);
    }
    if (req.method !== "POST") return fail(405, "method", cors);
    const rb = await readBody(req, 2048); const a = rb.b || {};
    const act = String(a.action || "");
    if (act === "alive") { await env.DB.prepare(`UPDATE ${TABLE} SET alive_at = ? WHERE id = ?`).bind(iso(nowMs), j.id).run(); return out(null, 204, cors); }
    if (act === "told") { const v = ["announced", "told", "cut"].includes(a.told) ? a.told : ""; if (v) await env.DB.prepare(`UPDATE ${TABLE} SET told = CASE WHEN told = '' OR (told = 'announced' AND ? = 'told') THEN ? ELSE told END WHERE id = ?`).bind(v, v, j.id).run(); return out(null, 204, cors); }
    if (act === "delete") { await env.DB.prepare(`UPDATE ${TABLE} SET doc = '', params = '{}', say = '', block = '', title = '', updated_at = ? WHERE id = ?`).bind(iso(nowMs), j.id).run(); return out({ ok: true }, 200, cors); }
    return fail(400, "bad_request", cors);
  } catch (e) {
    console.error("research error", (e && e.name) || "error", (e && e.message) || "");
    return fail(500, "server", cors, { ack: ackOf("bassem_ar", "failed") });
  }
}
async function mailAction(req, env, j, voice, cors, nowMs) {
  const V = VOICE[voice] || VOICE.bassem_ar;
  const full = await fullSignIn(req, env);
  if (!full || full.id !== j.member_id) return fail(403, "full_login_required", cors, { sent: false, ack: fill(V.mail_no, { why: V.mail_why.full_login }) });
  const r = await mailJob(env, j, nowMs);
  return out({ ok: true, sent: !!r.sent, ...(r.reason ? { reason: r.reason } : {}), ack: r.sent ? V.mail_sent : fill(V.mail_no, { why: V.mail_why[r.reason] || V.mail_why.failed }) }, 200, cors);
}
/* a job whose instance died: failed (the status call asks the Workflow once it is late) */
async function unstick(env, j, nowMs) {
  if (!RUNNING.includes(j.state)) return j;
  const late = nowMs - Date.parse(j.updated_at) > Math.max(2 * j.eta_s * 1000, 90000);
  if (!late) return j;
  let dead = !env.RESEARCH;
  if (!dead) try { const ins = await env.RESEARCH.get(j.id); const s = await ins.status(); dead = !!(s && /^(errored|terminated|unknown)$/.test(String(s.status || ""))); } catch (e) { dead = true; }
  if (!dead) return j;
  await failJob(env, j.id, "stuck", nowMs);
  return { ...j, state: "failed", error: "stuck" };
}
async function failJob(env, id, code, nowMs = Date.now()) {
  try { await env.DB.prepare(`UPDATE ${TABLE} SET state = 'failed', error = ?, pack = '{}', updated_at = ? WHERE id = ? AND state != 'done'`).bind(line(code, 40) || "failed", iso(nowMs), id).run(); } catch (e) { /* the cron retries */ }
}

/* ======================= the job ======================= */
/* platform search results → the pack's parts: the model's view (whitelisted fields) and the INTERNAL meta (origin, member, badge, page) */
const nn = s => String(s == null ? "" : s);
function platformItem(section, r) {
  if (!r || typeof r !== "object") return null;
  const open = nn(r.open_url || r.url);
  if (section === "factories" || section === "suppliers" || r.section === "factories") {
    const id = nn(r.id), pub = /^x/.test(id) || /company\.html#x/.test(nn(r.url));
    return { v: { kind: "company", name: r.name, activity: r.activity, place: r.location || r.governorate, products: clip(r.products, 220) },
      m: { origin: "platform", type: "company", name: nn(r.name), place: nn(r.location || r.governorate), activity: nn(r.activity), member: !!r.member, verified: !!r.verified && !pub, pub, page: open, ref: "item:factories:" + id } };
  }
  if (section === "tenders") return { v: { kind: "tender", entity: r.entity, title: r.title, place: r.governorate || r.country, activity: r.activity, deadline: /^\d{4}-\d{2}-\d{2}/.test(nn(r.deadline)) ? nn(r.deadline).slice(0, 10) : "", value: r.estimated_value != null ? r.estimated_value + " " + nn(r.currency) : "" },
    m: { origin: "platform", type: "tender", entity: nn(r.entity) === "جهة حكومية" ? "" : nn(r.entity), place: nn(r.governorate === "غير محددة" ? "" : r.governorate || r.country), deadline: nn(r.deadline), page: open, ref: "item:tenders:" + nn(r.id || r.ref) } };
  if (section === "rfqs") return { v: { kind: "rfq", title: r.title, quantity: r.quantity, deadline: /^\d{4}-\d{2}-\d{2}/.test(nn(r.deadline)) ? nn(r.deadline).slice(0, 10) : "", activity: r.activity, place: r.governorate },
    m: { origin: "platform", type: "rfq", place: nn(r.governorate), deadline: nn(r.deadline), page: open, ref: "item:rfqs:" + nn(r.id || r.ref) } };
  if (section === "products") return { v: { kind: "product", name: r.product, products: r.category, name_hint: nn(r.maker).replace(/^من إنتاج\s+/, "") },
    m: { origin: "platform", type: "product", name: nn(r.product), page: open, member: !!r.member, ref: "item:products:" + nn(r.id) } };
  return null;
}
async function platformPart(env, kind, p, nowMs) {
  const S = DEPS.search; if (typeof S !== "function") return { items: [], error: "no_search" };
  const members = typeof DEPS.memberData === "function" ? await DEPS.memberData(env, nowMs, DEPS.DATA ? DEPS.DATA.v : "").catch(() => null) : null;
  const items = [], run = (section, q, gov, lim, market) => { try { const r = S(section, String(q || "").slice(0, 200), gov || "", lim, null, market || null, { members, nowMs }); for (const x of (r && r.results) || []) { const it = platformItem(section, x); if (it) items.push(it); } } catch (e) { /* one section failed: partial */ } };
  const gov = p.governorate || "", mk = p.market ? LOOKUP_MARKET[p.market] || "" : "";
  if (kind === "buyers") {
    /* by the BUYER industries only — never by his own product (that returns his competitors) */
    for (const ind of (p.buyer_industries || []).slice(0, 3)) run("factories", ind, gov, PACK.platform, null);
    run("tenders", p.product, gov, 6, mk && mk !== "local" ? mk : null); run("rfqs", p.product, "", 6, null);
  } else if (kind === "answer") { run("factories", p.question, gov, 4, null); run("tenders", p.question, gov, 4, null); }
  else if (kind === "export_plan") { run("tenders", p.product, "", 8, mk || "intl"); }
  else if (kind === "company_profile" && p.subject && !/^(?:mine|انا|أنا|شركتي|مصنعي|my company)$/i.test(p.subject)) run("factories", p.subject, "", 3, null);
  else if (kind === "summary" && p.ref && typeof DEPS.findItem === "function") {
    const mm = /^item:(tenders|rfqs|factories|products|projects):(.+)$/.exec(p.ref);
    if (mm) { const rec = DEPS.findItem(mm[1], { id: mm[2] }, nowMs); if (rec && rec.found) { const it = platformItem(mm[1], rec); if (it) { it.m.ref_item = true; items.push(it); } } }
  } else if (kind === "summary" && p.question) { run("tenders", p.question, gov, 6, mk || null); run("factories", p.question, gov, 4, null); }
  /* de-duplicate by ref */
  const seen = new Set(); return { items: items.filter(x => (seen.has(x.m.ref) ? false : (seen.add(x.m.ref), true))) };
}
const INTEL_KIND = { tender_gov: "tender", tender_semi: "tender", tender_private: "tender", rfq: "rfq", project: "project", project_news: "project", news: "news" };
async function intelPart(env, kind, p, lang) {
  const q = p.product || p.question || "";
  const ask = async (path) => { const r = await intelFetch(env, path, { method: "GET", headers: { Accept: "application/json" } }, 6000); return r && r.j ? r.j : null; };
  const items = [];
  const add = (x, extra) => {
    const k = INTEL_KIND[x && x.kind]; if (!k || (k === "news" && kind !== "answer")) return;
    const title = lang === "en" ? x.title_en || x.title_ar : x.title_ar || x.title_en; // never title_orig (the source's own words)
    items.push({ v: { kind: k, entity: x.entity || "", title: title || "", country: x.country || x.market_name || "", deadline: /^\d{4}-\d{2}-\d{2}/.test(nn(x.deadline)) ? nn(x.deadline).slice(0, 10) : "", value: x.value != null ? x.value + " " + nn(x.currency) : "" },
      m: { origin: "intel", type: k, entity: nn(x.entity), country: nn(x.country || x.market_name), deadline: nn(x.deadline), cancelled: x.status === "closed", ref: "intel:" + nn(x.id), ...(extra || {}) },
      src: { origin: "intel", id: nn(x.id), url: nn(x.url), source_name: x.source && x.source.name ? nn(x.source.name) : "", page: nn(x.page) }, copy: nn(x.title_orig) });
  };
  if (kind === "summary" && p.ref && /^intel:/.test(p.ref)) { const j = await ask("/api/intel/item/" + encodeURIComponent(p.ref.slice(6))); const x = j && (j.item || j); if (x && x.id) add(x, { ref_item: true }); return { items }; }
  if (!q || !["buyers", "export_plan", "answer", "summary"].includes(kind)) return { items };
  const qs = new URLSearchParams({ q: clip(q, 100), lang: lang === "en" ? "en" : "ar", per: String(PACK.intel), status: "active" });
  if (p.market && p.market !== "world") qs.set("market", p.market);
  if (kind === "buyers") qs.set("kind", "tenders");
  const j = await ask("/api/intel/feed?" + qs.toString());
  for (const x of (j && Array.isArray(j.items) ? j.items : []).slice(0, PACK.intel)) add(x);
  if (kind === "buyers") { qs.set("kind", "rfq"); const j2 = await ask("/api/intel/feed?" + qs.toString()); for (const x of (j2 && Array.isArray(j2.items) ? j2.items : []).slice(0, 6)) add(x); }
  return { items };
}
/* the web part: only with Bassem's web switch and a ready key, inside the research sub-caps (≤ 30 % of the day, 24 a member, and only
   while more than half of the day is left for the live tools); a re-run of the step never reserves twice (keyed by the job id) */
async function webPart(env, kind, p, job, nowMs, set) {
  const K = KINDS[kind];
  if (!K.web || K.own) return { items: [], units: 0 };
  if (!(await featureOn(env, "bassem_web_search"))) return { items: [], units: 0, off: "feature_off" };
  const cfg = await webSearchConfig(env); if (!cfg.ready) return { items: [], units: 0, off: "websearch_off" };
  const once = await env.DB.prepare("INSERT OR IGNORE INTO rl (k, n, exp) VALUES (?, 1, ?)").bind("rsweb|" + job.id, dayExp(nowMs)).run();
  if (!(once && once.meta && once.meta.changes)) return { items: [], units: 0, off: "rerun" };
  if ((await usedToday(env, nowMs)) * 2 >= cfg.cap) return { items: [], units: 0, off: "floor" };
  const d = cairoDay(nowMs), want = K.web;
  const lims = [["wsday|research|" + d, Math.floor(cfg.cap * set.caps.web_share)], ["wsday|research|m|" + job.member_id + "|" + d, set.caps.web_member_day]];
  let granted = want; const after = [];
  for (const [k, lim] of lims) { const n = Number(await env.DB.prepare(UP).bind(k, want, dayExp(nowMs)).first("n")) || 0; after.push(k); granted = Math.min(granted, Math.max(0, want - Math.max(0, n - lim))); }
  const backKeys = after;
  const giveR = async n => { if (n > 0) for (const k of backKeys) { try { await env.DB.prepare("UPDATE rl SET n = MAX(0, n - ?) WHERE k = ?").bind(n, k).run(); } catch (e) { /* expires */ } } };
  if (granted <= 0) { await giveR(want); return { items: [], units: 0, off: "research_cap" }; }
  const waits = [], shim = { waitUntil: pr => { waits.push(Promise.resolve(pr).catch(() => null)); } };
  const items = []; let units = 0;
  try {
    if (K.hunt) {
      const h = parseHunt({ product: p.product, product_en: p.product_en, buyer_industries: p.buyer_industries, market: p.market && p.market !== "world" ? p.market : "", governorate: p.governorate, intents: K.hunt });
      if (!h.error) {
        const r = await runHunt(env, cfg, h, { who: "bassem", voice: "bassem", nowMs, ctx: shim, deadlineMs: 12000, via: "research", withSources: true });
        if (r && r.body) { units = Math.min(granted, r.body.sent || 0); (r.body.results || []).forEach((x, i) => { const s = (r.internal || [])[i] || {}; items.push(webItem(x, s)); }); }
      }
    } else {
      const pa = parseArgs({ query: p.question || p.subject || p.product, market: p.market && p.market !== "world" ? p.market : "" });
      if (!pa.error) {
        const r = await webSearch(env, cfg, pa, nowMs, { persona: "bassem" });
        if (!r.error) { units = r.cached ? 0 : 1; for (const x of (r.results || []).slice(0, 5)) items.push(webItem({ type: "other", title: "", entity: "" }, { url: x.url, site: x.source, date: x.date, title: x.title, snippet: x.snippet, type: "fact" }));
          if (!r.cached) shim.waitUntil(recordLeads(env, r.results.map(x => ({ ...x, type: "other", query: pa.q, lang: pa.lang })), { persona: "bassem", via: "research", nowMs })); }
      }
    }
  } finally { await Promise.allSettled(waits); await giveR(want - units); }
  return { items: items.filter(Boolean), units };
}
/* one web result → the pack's part: the scrubbed title (≤ 140), a scrubbed snippet ≤ 140 in Arabic / English only, its type, entity (the
   notice's own words — hunt sayResult), its own date; the link / site / found date go to the source map only */
const AR_OR_EN = s => /^[\s\p{P}\p{N}\p{Script=Arabic}\p{Script=Latin}]*$/u.test(String(s || ""));
function webItem(x, s) {
  const type = x.type && x.type !== "other" ? x.type : s.type === "fact" ? "fact" : "buyer";
  const host = (() => { try { return bareHost(new URL(s.url).hostname); } catch (e) { return ""; } })();
  const names = [s.site, host, ...siteLabels(host)].filter(Boolean), entity = nn(x.entity);
  const title = scrubSources(nn(x.title || s.title), names, entity), snip = AR_OR_EN(s.snippet) ? scrubSources(clip(nn(s.snippet), 400), names, entity) : "";
  const dl = /^\d{4}-\d{2}-\d{2}/.test(nn(x.deadline)) ? nn(x.deadline).slice(0, 10) : "";
  return { v: { kind: type, entity, title: clip(title, 140), snippet: clip(snip, PACK.snippet), deadline: dl, published: /^\d{4}-\d{2}-\d{2}/.test(nn(x.date)) ? nn(x.date).slice(0, 10) : "" },
    m: { origin: "web", type, entity, country: nn(x.market), deadline: dl },
    src: { origin: "web", type, url: nn(s.url), site: nn(s.site), host, date: nn(x.date || s.date), query: nn(s.query) }, copy: [nn(s.title), nn(s.snippet)].join(" \n ") };
}
async function profilePart(env, kind, p, job) {
  if (!p.use_profile && kind !== "company_profile") return { items: [] };
  const pr = await memberProfile(env, job.member_id).catch(() => null);
  const mem = await env.DB.prepare("SELECT company, products, sector, governorate FROM members WHERE id = ?").bind(job.member_id).first().catch(() => null);
  const items = [];
  if (pr || mem) {
    const P = (pr && pr.profile) || {}, prods = Array.isArray(P.products) ? P.products.slice(-12) : mem && mem.products ? String(mem.products).split(/[،,\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 12) : [];
    const markets = Array.isArray(P.target_markets) ? P.target_markets.slice(-8) : [];
    const text = [mem && mem.company ? "الشركة: " + mem.company : "", mem && mem.sector ? "النشاط: " + mem.sector : "", mem && mem.governorate ? "المكان: " + mem.governorate : "", pr ? pr.text : ""].filter(Boolean).join(" · ");
    items.push({ v: { kind: "fact", about: "member_profile", name: mem && mem.company ? mem.company : "", text: clip(text, 900) }, m: { origin: "profile", type: "fact", about: "member_profile", products: prods, markets }, src: { origin: "profile" } });
  }
  return { items };
}
/* the parts → the evidence pack (E1 …) + meta + the INTERNAL source map; every text passes forLLM, instructionLike (dropped), maskPII */
export function buildPack(parts, p) {
  const evidence = [], meta = {}, sources = [], copies = [], srcNames = new Set();
  let chars = 0;
  const all = [...(parts.profile || []), ...(parts.platform || []), ...(parts.intel || []), ...(parts.web || [])];
  for (const it of all) {
    if (evidence.length >= PACK.items) break;
    const v = {}; let bad = false;
    for (const [k, val] of Object.entries(it.v)) {
      if (val == null || val === "") continue;
      const t = forLLM(maskPII(String(val)), k === "text" ? 900 : k === "products" ? 240 : PACK.text);
      if (!t) continue;
      if (instructionLike(t, { money: it.m.origin === "web" })) { bad = true; break; }
      v[k] = t;
    }
    if (bad) continue;
    const size = JSON.stringify(v).length; if (chars + size > PACK.chars) continue; chars += size;
    const id = "E" + (evidence.length + 1);
    evidence.push({ id, ...v }); meta[id] = it.m;
    if (it.src) { sources.push({ e: id, ...it.src, ...(it.m.ref ? { ref: it.m.ref } : {}), ...(it.m.origin === "platform" ? { page: it.m.page, member: !!it.m.member, verified: !!it.m.verified, pub: !!it.m.pub } : {}) }); for (const x of [it.src.site, it.src.source_name, it.src.host]) if (x) srcNames.add(x); for (const l of siteLabels(it.src.host || "")) srcNames.add(l); }
    else if (it.m.origin === "platform") sources.push({ e: id, origin: "platform", ref: it.m.ref, page: it.m.page, member: !!it.m.member, verified: !!it.m.verified, pub: !!it.m.pub });
    if (it.copy) copies.push(it.copy);
  }
  const input = {};
  for (const k of ["product", "product_en", "question", "details", "subject", "buyer", "audience", "tone"]) if (p[k]) input[k] = p[k];
  if (p.buyer_industries) input.buyer_industries = p.buyer_industries;
  if (p.market) input.market = MARKETS[p.market] ? MARKETS[p.market][1] : p.market;
  if (p.count) input.count = p.count;
  return { pack: { evidence, input }, meta, sources, copies, srcNames: [...srcNames] };
}
/* the write step's work (shared with the owner's test): ≤ 2 model calls, each reserved in the AI ledger first → {checked, model, usage,
   neurons, calls, code} — no model answer → checked null (the caller finishes with the data sections, or fails a writing kind) */
export async function writeDoc(env, built, kind, job, set, { nowMs = Date.now(), feature = "research", keyBase = "" } = {}) {
  const K = KINDS[kind], lang = job.lang || "ar";
  const user = templateText(kind, lang) + "\nEVIDENCE " + JSON.stringify(built.pack.evidence) + "\nCUSTOMER INPUT " + JSON.stringify(built.pack.input);
  const models = [set.models.research_bassem, set.models.fallback].filter((x, i, a) => x && a.indexOf(x) === i);
  if (models.length < 2) models.push(DEFAULT_MODELS.fallback2);
  const tot = { in: 0, out: 0 }; let neurons = 0, calls = 0, best = null, used = "", code = "", note = "";
  const ctxC = { lang, heard: (job.params && job.params.heard) || [], profileText: (built.pack.evidence.find(e => e.about === "member_profile") || {}).text || "", srcNames: built.srcNames, copies: built.copies, hidden: [] };
  for (let i = 0; i < 2; i++) {
    const model = models[Math.min(i, models.length - 1)], maxTokens = K.out, est = estimateNeurons(model, user.length + 3000, maxTokens);
    const rk = (keyBase || job.id) + "|" + (i + 1);
    const rv = await aiReserve(env, feature, est, rk, { nowMs, day_neurons: set.day_neurons });
    if (!rv.ok) { code = code || "ai_cap"; break; }
    calls++;
    const r = await aiText(env, model, { system: writerSystem(lang), user: user + note, schema: DOC_SCHEMA, maxTokens, temperature: K.temp, reasoning: set.reasoning, timeoutMs: 110000, rejectIfBusy: i === 0 && PAID_ONLY.includes(model) });
    tot.in += r.usage.in; tot.out += r.usage.out; neurons += r.neurons || 0;
    await aiSettle(env, feature, rk, r.code === "ai_timeout" ? -1 : r.neurons || 0, { nowMs });
    if (!r.ok) { code = r.code || "ai_error"; continue; }
    const ch = check(r.json, built.pack, kind, ctxC);
    if (!best || ch.stats.kept > best.stats.kept) { best = ch; used = model; }
    if (!ch.retry) break;
    note = "\nA previous draft lost blocks for rules " + Object.keys(ch.stats.by).join(", ") + ". Follow every rule strictly; cite every fact.";
    code = "over_dropped";
  }
  return { checked: best, model: used || models[0], usage: tot, neurons, calls, code: best ? "" : code || "ai_error", raw: null };
}

/* runJob(env, {id}, step) — every side effect inside step.do (the Workflow replays run() after a sleep); never throws */
const SJ = { retries: { limit: 1, delay: "2 seconds", backoff: "constant" }, timeout: "60 seconds" };
const S0 = { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "60 seconds" };
export async function runJob(env, payload, step, { nowMs: fixedNow = 0 } = {}) {
  const id = payload && ID_RX.test(String(payload.id || "")) ? payload.id : "";
  if (!id || !env || !env.DB) return { ok: false };
  const clock = () => fixedNow || Date.now();
  try {
    const first = await step.do("load", S0, async () => { const j = await env.DB.prepare(`SELECT id, kind, state FROM ${TABLE} WHERE id = ?`).bind(id).first(); if (!j || j.state !== "queued") return { go: false }; await env.DB.prepare(`UPDATE ${TABLE} SET state = 'gathering', step = '{"gather":"running"}', pack = '{}', updated_at = ? WHERE id = ? AND state = 'queued'`).bind(iso(clock()), id).run(); return { go: true, kind: j.kind }; });
    if (!first || !first.go) return { ok: true, skipped: true };
    const load = async () => { const j = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).bind(id).first(); if (!j) throw new Error("gone"); return { ...j, params: jparse(j.params, {}) }; };
    const put = (part, v) => env.DB.prepare(`UPDATE ${TABLE} SET pack = json_set(CASE WHEN json_valid(pack) THEN pack ELSE '{}' END, '$.' || ?, json(?)), updated_at = ? WHERE id = ?`).bind(part, JSON.stringify(v), iso(clock()), id).run();
    const set = await aiSettings(env);
    const t0 = clock();
    const g = await Promise.all([
      step.do("gather_platform", SJ, async () => { const j = await load(); const r = await platformPart(env, j.kind, j.params, clock()); const pr = await profilePart(env, j.kind, j.params, j); await put("platform", r.items); await put("profile", pr.items); return { n: r.items.length + pr.items.length }; }),
      step.do("gather_intel", SJ, async () => { const j = await load(); let r = { items: [] }; try { r = await intelPart(env, j.kind, j.params, j.lang); } catch (e) { r = { items: [], error: "intel" }; } await put("intel", r.items); return { n: r.items.length }; }),
      step.do("gather_web", S0, async () => { const j = await load(); let r = { items: [], units: 0 }; try { r = await webPart(env, j.kind, j.params, j, clock(), set); } catch (e) { r = { items: [], units: 0, error: "web" }; } await put("web", r.items); return { n: r.items.length, units: r.units || 0 }; }),
    ]);
    const units = (g[2] && g[2].units) || 0;
    await step.do("save_sources", S0, async () => {
      const j = await load(), parts = jparse(j.pack, {}), built = buildPack(parts, j.params);
      const total = built.pack.evidence.length;
      await env.DB.prepare(`UPDATE ${TABLE} SET pack = ?, sources = ?, web_units = ?, state = 'writing', step = '{"gather":"done","write":"running"}', updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(built), JSON.stringify(built.sources), units, iso(clock()), id).run();
      return { n: total };
    });
    const w = await step.do("write", { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "4 minutes" }, async () => {
      const j = await load(), built = jparse(j.pack, null);
      if (!built || !built.pack) throw new Error("no_pack");
      await env.DB.prepare(`UPDATE ${TABLE} SET state = 'checking', updated_at = ? WHERE id = ?`).bind(iso(clock()), id).run();
      const r = await writeDoc(env, built, j.kind, j, set, { nowMs: clock() });
      await env.DB.prepare(`UPDATE ${TABLE} SET pack = json_set(pack, '$.checked', json(?)), model = ?, tokens_in = ?, tokens_out = ?, neurons = ?, updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(r.checked || null), r.model, r.usage.in, r.usage.out, r.neurons, iso(clock()), id).run();
      return { ok: !!r.checked, calls: r.calls, code: r.code };
    });
    const fin = await step.do("finish", { retries: { limit: 3, delay: "2 seconds", backoff: "constant" }, timeout: "60 seconds" }, async () => {
      const j = await load(), built = jparse(j.pack, null) || {}, K = KINDS[j.kind];
      const checked = built.checked || null;
      if (!checked && K.own) { await env.DB.prepare(`UPDATE ${TABLE} SET state = 'failed', error = ?, pack = '{}', updated_at = ? WHERE id = ?`).bind(w.code || "ai_error", iso(clock()), id).run(); return { state: "failed" }; }
      const r = render(checked, { meta: built.meta || {}, evidence: (built.pack && built.pack.evidence) || [] }, j.kind, { id, label: j.label, lang: j.lang, voice: voiceOf("bassem", j.voice_lang), params: j.params, member: true, nowMs: clock() });
      const partial = !checked || (checked.stats && checked.stats.model_dropped > 0) ? 1 : 0;
      await env.DB.prepare(`UPDATE ${TABLE} SET state = 'done', title = ?, doc = ?, say = ?, block = ?, counts = ?, dropped = ?, partial = ?, pack = '{}', step = '{"gather":"done","write":"done"}', done_at = ?, updated_at = ? WHERE id = ?`)
        .bind(r.doc.title, JSON.stringify(r.doc), r.say, r.block, JSON.stringify(r.counts), JSON.stringify(checked ? checked.dropped : []), partial, iso(clock()), iso(clock()), id).run();
      return { state: "done", dropped: checked ? checked.dropped.length : 0 };
    });
    console.log("research", JSON.stringify({ id, kind: first.kind, who: "bassem", ms: clock() - t0, units, calls: w.calls, dropped_n: fin.dropped || 0, state: fin.state }));
    if (fin.state !== "done" || !set.mail_if_untold) return { ok: true, state: fin.state };
    /* D11 (owner setting, off by default): an unheard result is mailed once the call's heartbeat stopped (≤ 30 minutes) */
    for (let i = 0; i < AUTO_MAIL.max_rounds; i++) {
      await step.sleep("wait_told_" + i, AUTO_MAIL.sleep);
      const alive = await step.do("alive_" + i, S0, async () => { const j = await env.DB.prepare(`SELECT alive_at, told FROM ${TABLE} WHERE id = ?`).bind(id).first(); return { fresh: !!(j && j.alive_at && Date.now() - Date.parse(j.alive_at) < AUTO_MAIL.alive_ms), told: j ? j.told : "x" }; });
      if (alive.told || !alive.fresh) break;
    }
    await step.do("auto_mail", S0, async () => { const j = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).bind(id).first(); if (!j || j.told || j.mail_state) return { sent: false }; const r = await mailJob(env, j, clock(), { auto: true }); return { sent: !!r.sent }; });
    return { ok: true, state: "done" };
  } catch (e) {
    try { await step.do("fail", S0, async () => { await failJob(env, id, String((e && e.message) || "error").slice(0, 40)); return { ok: true }; }); } catch (x) { await failJob(env, id, "error"); }
    console.log("research", JSON.stringify({ id, who: "bassem", state: "failed" }));
    return { ok: false };
  }
}

/* ---------- the cron (platformCron, every 15 minutes): stuck jobs → failed; past expires_at → blanked (bounded) ---------- */
export async function researchCron(env, nowMs = Date.now()) {
  if (!env || !env.DB || !(await hasTable(env, TABLE))) return { skipped: "no table" };
  const outC = { stuck: 0, blanked: 0 };
  const stuck = (await env.DB.prepare(`SELECT id, eta_s, updated_at, state FROM ${TABLE} WHERE state IN ('queued','gathering','writing','checking') AND updated_at < ? LIMIT 20`).bind(iso(nowMs - CAPS.stuck_min * 60000)).all()).results || [];
  for (const j of stuck) { const r = await unstick(env, { ...j, eta_s: 0, updated_at: j.updated_at }, nowMs); if (r.state === "failed") outC.stuck++; }
  const r = await env.DB.prepare(`UPDATE ${TABLE} SET params = '{}', doc = '', say = '', block = '', sources = '[]', dropped = '[]', pack = '{}', title = '', call_key = '', net = '', ticket_key = '', cap_hash = '', team_note = '', updated_at = ?
    WHERE id IN (SELECT id FROM ${TABLE} WHERE expires_at != '' AND expires_at < ? AND (doc != '' OR params != '{}' OR sources != '[]') LIMIT 50)`).bind(iso(nowMs), iso(nowMs)).run();
  outC.blanked = (r && r.meta && r.meta.changes) || 0;
  return outC;
}
/* the owner's legal erasure (acc-members.js deleteMember, acc-memory.js eraseMemory): the statement, only when the table exists (a missing
   table would roll the whole batch back), + the count; the member's running instances are terminated after the batch */
export async function eraseStmts(env, memberId) {
  if (!(await hasTable(env, TABLE))) return { stmts: [], rows: 0, running: [] };
  const rows = Number(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE member_id = ?`).bind(String(memberId)).first("n")) || 0;
  const running = rows ? ((await env.DB.prepare(`SELECT id FROM ${TABLE} WHERE member_id = ? AND state IN ('queued','gathering','writing','checking')`).bind(String(memberId)).all()).results || []).map(x => x.id) : [];
  return { stmts: rows ? [env.DB.prepare(`DELETE FROM ${TABLE} WHERE member_id = ?`).bind(String(memberId))] : [], rows, running };
}
export async function terminateAll(env, ids) { for (const id of ids || []) { try { const ins = await env.RESEARCH.get(id); await ins.terminate(); } catch (e) { /* already ended */ } } }

/* ======================= the data desk «🔎 أبحاث جنة وباسم» (acc-team.js; roles data / admin / owner) ======================= */
const PRIVATE_KINDS = new Set(["quote", "posts", "emails", "translate", "company_profile"]);
export async function deskList(env, url) {
  if (!(await hasTable(env, TABLE))) return { off: true, items: [], total: 0 };
  const q = url.searchParams, where = ["1 = 1"], args = [];
  const st = line(q.get("state"), 20); if (["queued", "gathering", "writing", "checking", "done", "failed"].includes(st)) { where.push("state = ?"); args.push(st); }
  const k = line(q.get("kind"), 20); if (KIND_KEYS.includes(k)) { where.push("kind = ?"); args.push(k); }
  const ts = line(q.get("team_state"), 10); if (["", "ok", "hidden"].includes(ts) && q.has("team_state")) { where.push("team_state = ?"); args.push(ts); }
  const page = Math.min(Math.max(parseInt(q.get("page"), 10) || 1, 1), 200), per = 30;
  const rows = (await env.DB.prepare(`SELECT id, created_at, who, kind, label, title, state, partial, dropped, team_state, web_units, neurons FROM ${TABLE} WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, per, (page - 1) * per).all()).results || [];
  const total = Number(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE ${where.join(" AND ")}`).bind(...args).first("n")) || 0;
  return { items: rows.map(r => ({ id: r.id, created_at: r.created_at, who: r.who, kind: r.kind, label: r.label, title: PRIVATE_KINDS.has(r.kind) ? "" : r.title, state: r.state, partial: !!r.partial, dropped_n: jparse(r.dropped, []).length, team_state: r.team_state, web_units: r.web_units, neurons: r.neurons })), total, page, per };
}
/* role: the caller's role — the data role reads the text of kinds with outside evidence only; private writing kinds: owner / admin (audited) */
export async function deskGet(env, id, role) {
  if (!(await hasTable(env, TABLE)) || !ID_RX.test(String(id || ""))) return null;
  const j = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).bind(id).first(); if (!j) return null;
  const priv = PRIVATE_KINDS.has(j.kind), can = !priv || role === "owner" || role === "admin";
  const doc = jparse(j.doc, null);
  return { private: priv, readable: can, job: { id: j.id, created_at: j.created_at, done_at: j.done_at, who: j.who, kind: j.kind, label: j.label, state: j.state, error: j.error, partial: !!j.partial, team_state: j.team_state, team_note: j.team_note, team_by: j.team_by, team_at: j.team_at, expires_at: j.expires_at, mail_state: j.mail_state },
    doc: can && doc ? readDoc(doc, { hidden: [] }) : null, hidden: jparse(j.team_hidden, []), sources: jparse(j.sources, []), dropped: can ? jparse(j.dropped, []) : [], params: can ? jparse(j.params, {}) : {},
    model: j.model, tokens_in: j.tokens_in, tokens_out: j.tokens_out, neurons: j.neurons, web_units: j.web_units };
}
export async function deskPut(env, id, b, actor) {
  if (!(await hasTable(env, TABLE)) || !ID_RX.test(String(id || ""))) return null;
  const j = await env.DB.prepare(`SELECT id, team_hidden, team_state, team_note FROM ${TABLE} WHERE id = ?`).bind(id).first(); if (!j) return null;
  const H = new Set(jparse(j.team_hidden, [])), E = /^E\d{1,3}$/;
  for (const x of Array.isArray(b.hide_items) ? b.hide_items.slice(0, 60) : []) if (E.test(x)) H.add(x);
  for (const x of Array.isArray(b.unhide_items) ? b.unhide_items.slice(0, 60) : []) H.delete(x);
  const state = b.hide_doc === true ? "hidden" : b.hide_doc === false ? "ok" : j.team_state, note = typeof b.note === "string" ? forLLM(maskPII(b.note), 300) : j.team_note;
  return { before: { hidden: jparse(j.team_hidden, []), team_state: j.team_state }, after: { hidden: [...H], team_state: state }, stmt: env.DB.prepare(`UPDATE ${TABLE} SET team_hidden = ?, team_state = ?, team_note = ?, team_by = ?, team_at = ?, updated_at = ? WHERE id = ?`).bind(JSON.stringify([...H]), state, note, line(actor && actor.actor_email, 254), iso(Date.now()), iso(Date.now()), id) };
}

/* ======================= the owner's test «🧪 تجربة موديل نصي» (acc-dev.js POST /dev/llm): nothing stored ======================= */
export const TEST_QUERY = Object.freeze({ kind: "buyers", product: "كسوة سلندرات، درافيل", product_en: "roller covering", buyer_industries: ["ورق", "طباعة", "نسيج"], market: "eg" });
export async function testDoc(env, { model, lang = "ar", withWeb = false, reasoning, nowMs = Date.now(), memberId = "" } = {}) {
  const set0 = await aiSettings(env), set = { ...set0, models: { ...set0.models, research_bassem: modelOk(model) ? model : set0.models.research_bassem }, reasoning: reasoning || set0.reasoning };
  const P = paramsOf({ ...TEST_QUERY, doc_lang: lang }, TEST_QUERY.kind); const p = P.p;
  const job = { id: "test" + nowMs, member_id: memberId, lang, params: p };
  const t0 = Date.now();
  const platform = await platformPart(env, p && TEST_QUERY.kind, p, nowMs);
  let intel = { items: [] }; try { intel = await intelPart(env, TEST_QUERY.kind, p, lang); } catch (e) { intel = { items: [] }; }
  const web = withWeb ? await webPart(env, TEST_QUERY.kind, p, { ...job, id: "rjtest" + nowMs }, nowMs, set).catch(() => ({ items: [] })) : { items: [] };
  const built = buildPack({ platform: platform.items, intel: intel.items, web: web.items, profile: [] }, p);
  const ms_gather = Date.now() - t0;
  const w = await writeDoc(env, built, TEST_QUERY.kind, job, set, { nowMs, feature: "test", keyBase: "llmtest|" + nowMs });
  const r = w.checked ? render(w.checked, { meta: built.meta }, TEST_QUERY.kind, { id: job.id, label: "R1", lang, voice: "bassem_ar", params: p, member: true, nowMs }) : null;
  return { model: set.models.research_bassem, fallback: set.models.fallback, lang, ms_gather, ms_total: Date.now() - t0, calls: w.calls, tokens_in: w.usage.in, tokens_out: w.usage.out, neurons: w.neurons, error: w.code || "",
    evidence: built.pack.evidence.length, checker: w.checked ? { kept: w.checked.stats.kept, blocks: w.checked.stats.blocks, dropped_by_rule: w.checked.stats.by, json_ok: true, language_ok: !w.checked.stats.lang_bad } : null,
    output: r ? { doc: r.doc, say: r.say, block: r.block } : null, dropped: w.checked ? w.checked.dropped : [], stored: false };
}
export { MODEL_ALLOW, statusOf };
