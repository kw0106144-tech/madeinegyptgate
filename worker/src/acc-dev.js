/* «🛠️ المطوّر / Developer» — the owner-only developer panel of the Control Center (owner request 2026-11-19: «لوحة مطوّر علشان مااحتاجكوش:
   أغيّر أي حاجة وأضيف وأشيل مزايا»). Routed by acc.js under /api/admin/cc/dev/* with the permission dev.manage (OWNER_ONLY): admin,
   editor, support and X-Platform-Key → 403 owner_only; the team roles seo / data never reach it; same Bearer session, origin-only CORS,
   write limit (120/min) and audit rules as every Control Center endpoint. The contract: scratchpad API.md / worker/README.md.
     GET  /dev/features            the registry (flags.js) with each row's value, effective state, lock, what it waits for + the policies
     PUT  /dev/features            {features:{key: true|false|null}, reason?} → audited dev.features (one row, changed keys only)
     GET  /dev/deploys?limit=      the last Pages deployments of «madeinegyptgate» + the last versions of janna-lookup / migate-intel
                                   (Cloudflare API, cf-api.js, the token of «مفاتيح الخدمات» → cloudflare.dev_token) — 30 / 10 min
     POST /dev/deploys/rollback    {target, id, confirm:"ارجع", reason?, force?, ack?} → audited dev.rollback — 3 per rolling hour and
                                   10 per rolling day (counted from the owner's dev.rollback rows; a «secrets changed» refusal does not count)
                                   Two steps the owner must confirm AGAIN, checked here (not only in the browser): a build / version OLDER
                                   than the developer panel (409 pre_panel: the panel and its roll-forward disappear, the switches stop) and
                                   Cloudflare's «secrets changed» (409 secrets_changed). Each answer carries a signed `ack` (10 min, bound to
                                   the owner, target and id) that the next request sends back; force:true counts only with an ack of it.
     GET  /dev/health              key pages + APIs status / latency, /api/intel/health, D1 row counts (read-only), worker version — 12 / 10 min
     GET  /dev/audit               the last developer-panel actions (dev.* + the cloudflare.dev_token key actions + review.*: the reviewer's
                                   sign-ins and the end of his sessions)
     GET  /dev/review              «دخول مراجعي المتاجر» (switch store_review_signin): {set, email, until, live, switch_on, active, max_days}
     PUT  /dev/review              {email, code (6 digits, not a trivial one), days 1–30} → stored as an HMAC (review-signin.js), audited dev.review;
                                   never a staff account (422 staff_account) or a customer's (422 not_review_account)
     DELETE /dev/review            the address + code removed, audited dev.review, and the reviewer's sessions ended — the code itself is never
                                   answered
     POST /dev/vision?agent=janna|bassem&lang=ar|en&model=&detail=high|low   «🔎 تجربة قراءة صورة»: ONE test photo (raw JPEG / PNG / WebP,
                                   Content-Length required, ≤ 3 MB, ≤ 2,048 px — the page resizes it like the call does) read by Workers AI
                                   exactly like a photo of a call (src/chat-media.js) → {raw, seen, reason, flags, context, model, ms}. Nothing is
                                   stored; it works while chat_photos is off (the owner tests the model BEFORE switching on — no coding session
                                   can call Workers AI); 20 a Cairo day, counted in the reading budget; audited dev.vision (never the photo or
                                   its text: model, size, kind, reason, flags, ms)
     POST /dev/llm?set=doc|json&model=&lang=ar|en|fr&reasoning=&web=1   «🧪 تجربة موديل نصي»: ONE real document of the fixed test query
                                   (buyers of «كسوة سلندرات، درافيل», industries ورق / طباعة / نسيج, Egypt) on the platform's and the Information
                                   Center's evidence (the web only with web=1: it spends units) → the writer + the checker + the document; nothing
                                   stored; 20 a Cairo day inside the AI ledger; audited dev.llm (numbers and verdicts, never the text)
     GET|PUT /dev/ai               «🧪 الذكاء الاصطناعي»: the writer / fallback models (MODEL_ALLOW only), reasoning, the daily AI ceiling in
                                   neurons, the research caps, mail_if_untold (D11) — cc_settings dev.ai, audited dev.ai
     GET|PUT /dev/calls-report     «تقرير المكالمات اليومي» (calls-report.js): the recipients, time, detail, team tests, empty days, keep days
                                   (PUT audited dev.calls_report, recipients masked) + the last 7 runs + the Anam probe
     POST /dev/calls-report/send   {day} → ≤ 3 per report day, audited calls_report.send · GET /dev/calls-report/preview?day= → ≤ 6 / 10 min,
                                   audited calls_report.preview (it shows personal data)
   Nothing secret is ever answered: the token is read by cf-api.js only; Cloudflare messages are cut and scrubbed. */
import DATA from "./data.json";
import { now, iso, line, rateOk, site, hmac, safeEq, b64url, unb64url, enc, secretOf } from "./common.js";
import { fail, all, first, needTables, batch, body as readBody, txt1, validator, auditStmt, auditStmtIf, dateOk } from "./acc-base.js";
import { reviewView, reviewSave, reviewClear, reviewSwitchedOff } from "./review-signin.js"; // «دخول مراجعي المتاجر» (store_review_signin): the address + code
import { FEATURES, FEATURES_KEY, featureDef, isPolicy, featuresView, parseStore, storeJson, stateOf, forgetFeatures, valueOf, loadFeatures } from "./flags.js";
import * as CF from "./cf-api.js";
import * as VISION from "./chat-media.js";        // «🔎 تجربة قراءة صورة»: the same reading, guard and persona block as a call's photo
import * as CALLS from "./calls-report.js";
import * as RESEARCH from "./research.js";   // «🧪 تجربة موديل نصي» / «🧪 الذكاء الاصطناعي»: the writer of «بحث وكتابة عميقة»
import * as AICALL from "./ai-call.js"; import * as AIBUDGET from "./ai-budget.js"; // «تقرير المكالمات اليومي» — the owner's settings, send and preview; the Anam probe of «صحة الموقع»

export const CONFIRM_WORD = "ارجع";
export const DEV_LIMITS = Object.freeze({ deploys_per_10min: 30, rollbacks_per_hour: 3, rollbacks_per_day: 10, health_per_10min: 12, probe_ms: 6000, ack_ttl_s: 600 });
const byOf = adm => line((adm && adm.actor && (adm.actor.actor_email || adm.actor.actor_id)) || "owner", 254);
const actorKey = adm => line((adm && adm.actor && adm.actor.actor_id) || "owner", 80);
const limited = (msg, retry_s, extra) => fail(429, "rate_limited", msg, { retry_s, ...(extra || {}) });

/* ---------- features ---------- */
export const getFeatures = env => featuresView(env);
export async function putFeatures(req, env, ctx, adm) {
  const b = await readBody(req, 8192);
  if (!b.features || typeof b.features !== "object" || Array.isArray(b.features)) fail(400, "required", "features: {المفتاح: true | false | null} مطلوب / features: {key: true | false | null} is required");
  const keys = Object.keys(b.features), v = validator();
  if (keys.length > 50) v.err("features", "≤ 50 keys", "too_many");
  for (const k of keys.slice(0, 50)) {
    const f = "features." + line(k, 64), x = b.features[k];
    if (isPolicy(k)) v.err(f, "دي قاعدة ثابتة ومش زرار / this is a permanent policy, not a switch", "policy");
    else if (!featureDef(k)) v.err(f, "ميزة مش معروفة / unknown feature", "unknown_feature");
    else if (x !== null && typeof x !== "boolean") v.err(f, "true أو false أو null (يرجع للافتراضي) / true, false or null (back to the default)", "not_boolean");
  }
  v.done();
  const reason = txt1(b.reason, 300);
  await needTables(env, "cc_settings", "cc_audit");
  // the row as stored (any scope: a stray custom row of that name is taken over by this write) — compare-and-swap on its value
  const row = await first(env, "SELECT v, scope FROM cc_settings WHERE k = ?", FEATURES_KEY);
  const cur = row && row.scope === "system" ? parseStore(row.v) : { values: {}, changed: {} };
  const values = { ...cur.values }, changedMeta = { ...cur.changed }, before = {}, after = {}, defaults = [], t = now(), by = byOf(adm);
  for (const k of keys) {
    const d = featureDef(k), want = b.features[k], stored = cur.values[k], was = valueOf({ values: cur.values }, k), next = want === null ? d.default : want;
    if (want !== null && next === was) continue;        // already so (stored, or by its default): nothing is pinned, nothing audited
    if (want === null && stored === undefined) continue; // already on its default
    if (next === true && was === false) { const st = await stateOf(env, d); if (st.locked) fail(409, "feature_locked", `${d.label_ar}: ${st.locked.ar} / ${d.label_en}: ${st.locked.en}`, { feature: k, locked: st.locked }); }
    if (want === null) delete values[k]; else values[k] = want;
    before[k] = was; after[k] = next; if (want === null) defaults.push(k);
    changedMeta[k] = { at: t, by };
  }
  const changed = Object.keys(after);
  if (!changed.length) return { body: { ok: true, unchanged: true, changed: [], ...(await featuresView(env)) } };
  const json = storeJson(values, changedMeta);
  const words = changed.map(k => `${k} ${after[k] ? "on" : "off"}${defaults.includes(k) ? " (default)" : ""}`).join(", ");
  const entry = { ...adm.actor, action: "dev.features", target_type: "features", target_id: changed.length === 1 ? changed[0] : "features", before, after: { ...after, ...(defaults.length ? { _defaults: defaults } : {}), ...(reason ? { _reason: reason } : {}) },
    summary: `features: ${words}${reason ? " — " + reason : ""}`, ip_hash: adm.ipHash, req_id: adm.reqId };
  const write = row
    ? env.DB.prepare("UPDATE cc_settings SET scope = 'system', v = ?, updated_by = ?, updated_at = ? WHERE k = ? AND v = ?").bind(json, by, t, FEATURES_KEY, String(row.v))
    : env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'system', ?, ?, ?) ON CONFLICT(k) DO NOTHING").bind(FEATURES_KEY, json, by, t);
  // the audit row only when this write landed (the same transaction: a failing audit insert = nothing changed)
  await batch(env, [write, auditStmtIf(env, entry, "EXISTS (SELECT 1 FROM cc_settings WHERE k = ? AND v = ? AND updated_at = ?)", [FEATURES_KEY, json, t])]);
  const check = await first(env, "SELECT v FROM cc_settings WHERE k = ?", FEATURES_KEY);
  forgetFeatures(env);
  if (!check || String(check.v) !== json) fail(409, "conflict", "المزايا اتغيّرت في نفس اللحظة من مكان تاني — حدّث الصفحة وجرّب تاني / the features changed at the same moment elsewhere — reload and try again");
  await loadFeatures(env, { fresh: true });
  // «دخول مراجعي المتاجر» switched off: the reviewer's sessions end with it (review-signin.js, audited review.sessions_revoke)
  if (after.store_review_signin === false) await reviewSwitchedOff(env, adm, REVIEW_H);
  return { body: { ok: true, changed, ...(await featuresView(env, { fresh: false })) } };
}

/* ---------- «🔎 تجربة قراءة صورة» — the owner's model test (design phase 1A: before chat_photos goes on) ---------- */
export async function postVision(req, env, ctx, adm, url) {
  if (!VISION.aiOn(env)) fail(503, "ai_off", "الـ Worker لسه مالوش ربط بالذكاء الاصطناعي (AI) — بيتضاف مع النشر الجاي / the Worker has no AI binding yet — it comes with the next deploy");
  const agent = url.searchParams.get("agent") === "bassem" ? "bassem" : "janna", lang = agent === "janna" && url.searchParams.get("lang") === "en" ? "en" : "ar";
  const qm = line(url.searchParams.get("model"), 120), model = qm || VISION.visionModel(env), detail = url.searchParams.get("detail") === "low" ? "low" : "high";
  if (qm && !VISION.PROBE_MODELS.includes(qm)) fail(400, "invalid_model", "الموديلات المتاحة للتجربة: " + VISION.PROBE_MODELS.join(" · ") + " / the models to try: " + VISION.PROBE_MODELS.join(" · "), { models: [...VISION.PROBE_MODELS] });
  await needTables(env, "cc_audit");
  const im = await VISION.readImage(req);
  if (im.err) fail(im.err[0], im.err[1], im.err[2], im.err[3]);
  if (!(await VISION.probeTake(env, Date.now()))) limited("وصلت لحد تجارب قراءة الصور النهارده (" + VISION.LIM.probeDay + ") — جرّب بكرة / today's photo-reading tests are used up (" + VISION.LIM.probeDay + ") — try tomorrow", 3600, { limit: VISION.LIM.probeDay });
  const base = { model, detail, agent, lang, width: im.img.w, height: im.img.h, bytes: im.raw.length };
  const auditId = await adm.audit("dev.vision", "vision", model, null, { ...base, status: "reading" }, `vision probe ${model} (${im.img.w}×${im.img.h})`);
  const t0 = Date.now();
  const r = (await VISION.aiTake(env, Date.now())) ? await VISION.lookImage(env, im.img.bytes, im.mime, { model, detail }) : { model, shape: VISION.shapeOf(model), ms: 0, reason: "ai_cap", reading: null, raw: null };
  const s = r.reading ? VISION.sanitiseSeen(r.reading) : { seen: null, reason: r.reason || "unclear", flags: [] };
  const context = VISION.contextBlock(s.seen, { agent, lang, ref: "P1", reason: s.reason, keepOn: false, prodOn: agent === "bassem" });
  await adm.auditDone(auditId, { after: { ...base, status: "done", kind: s.seen ? s.seen.kind : null, reason: s.reason || null, flags: s.flags, ms: r.ms },
    summary: `vision probe ${model}: ${s.seen ? s.seen.kind : s.reason} (${r.ms} ms)` });
  let raw = ""; try { raw = r.raw == null ? "" : typeof r.raw === "string" ? r.raw : JSON.stringify(r.raw); } catch (e) { raw = ""; }
  return { ok: true, model, shape: r.shape || VISION.shapeOf(model), detail, agent, lang, ms: r.ms, total_ms: Date.now() - t0, raw: raw.slice(0, 6000), error: r.error || "", seen: s.seen, reason: s.reason || null, flags: s.flags,
    context, width: im.img.w, height: im.img.h, bytes: im.raw.length, models: [...VISION.PROBE_MODELS], default_model: VISION.visionModel(env), stored: false };
}

/* ---------- «🧪 تجربة موديل نصي» + «🧪 الذكاء الاصطناعي» — the writer of «بحث وكتابة عميقة» (research.js; design §A.15). No coding session
   can call Workers AI: this test is the only way to judge a model before research_bassem goes on. Nothing is stored except the audit row
   (model, set, language, times, tokens, verdicts — never the text); 20 a Cairo day, inside the AI ledger (feature "test") ---------- */
export const LLM_DAY = 20;
export async function postLlm(req, env, ctx, adm, url) {
  if (!AICALL.aiOn(env)) fail(503, "ai_off", "الـ Worker لسه مالوش ربط بالذكاء الاصطناعي (AI) / the Worker has no AI binding yet");
  const set = url.searchParams.get("set") === "json" ? "json" : "doc", qm = line(url.searchParams.get("model"), 120), lang = ["ar", "en", "fr"].includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "ar";
  const reasoning = ["off", "low", "medium", "high"].includes(url.searchParams.get("reasoning")) ? url.searchParams.get("reasoning") : "";
  if (qm && !AICALL.modelOk(qm)) fail(400, "invalid_model", "الموديلات المتاحة: " + AICALL.MODEL_ALLOW.join(" · ") + " / the models: " + AICALL.MODEL_ALLOW.join(" · "), { models: [...AICALL.MODEL_ALLOW] });
  await needTables(env, "cc_audit");
  if (!(await VISION.dayCount(env, "cmllm", Date.now(), 1) <= LLM_DAY)) { await VISION.dayCount(env, "cmllm", Date.now(), -1); limited("وصلت لحد تجارب الموديل النصي النهارده (" + LLM_DAY + ") — جرّب بكرة / today's text-model tests are used up (" + LLM_DAY + ")", 3600, { limit: LLM_DAY }); }
  const withWeb = url.searchParams.get("web") === "1";
  const auditId = await adm.audit("dev.llm", "llm", qm || "default", null, { set, lang, web: withWeb, status: "running" }, `text model test ${qm || "default"} (${set}, ${lang})`);
  const r = await RESEARCH.testDoc(env, { model: qm, lang, withWeb, reasoning, memberId: "" });
  await adm.auditDone(auditId, { after: { set, lang, web: withWeb, model: r.model, ms_total: r.ms_total, tokens_in: r.tokens_in, tokens_out: r.tokens_out, neurons: r.neurons, calls: r.calls, error: r.error || null, checker: r.checker }, summary: `text model test ${r.model}: ${r.error || "ok"} (${r.ms_total} ms)` });
  return { ok: !r.error, set, ...r, models: [...AICALL.MODEL_ALLOW], query: RESEARCH.TEST_QUERY };
}
export async function getAi(env) { const v = await RESEARCH.aiSettings(env, { fresh: true }); return { settings: v, defaults: RESEARCH.settingsDefaults(env), allow: [...AICALL.MODEL_ALLOW], paid_only: [...AICALL.PAID_ONLY], today: await AIBUDGET.aiToday(env, { day_neurons: v.day_neurons }), usd_per_1000_neurons: 0.011 }; }
export async function putAi(req, env, ctx, adm) {
  const b = await readBody(req, 8192), v = validator();
  if (b.models && typeof b.models === "object") for (const k of Object.keys(b.models)) { if (!["research_bassem", "fallback"].includes(k)) v.err("models." + line(k, 40), "unknown use", "unknown"); else if (!AICALL.modelOk(b.models[k])) v.err("models." + k, "موديل مش في القايمة / not in the list", "invalid_model"); }
  if (b.day_neurons != null && !(Number.isInteger(b.day_neurons) && b.day_neurons >= 0 && b.day_neurons <= 5000000)) v.err("day_neurons", "0 – 5,000,000", "range");
  if (b.reasoning != null && !["off", "low", "medium", "high"].includes(b.reasoning)) v.err("reasoning", "off | low | medium | high", "invalid");
  if (b.mail_if_untold != null && typeof b.mail_if_untold !== "boolean") v.err("mail_if_untold", "true | false", "not_boolean");
  v.done();
  const before = await RESEARCH.aiSettings(env, { fresh: true });
  const next = RESEARCH.parseSettings(env, { ...before, ...b, models: { ...before.models, ...(b.models || {}) }, caps: { ...before.caps, ...(b.caps && typeof b.caps === "object" ? b.caps : {}) } });
  const t = now();
  await batch(env, [env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at, updated_by) VALUES (?, 'system', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET scope = 'system', v = excluded.v, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(RESEARCH.AI_KEY, JSON.stringify(next), t, byOf(adm)),
    adm.auditStmt("dev.ai", "setting", RESEARCH.AI_KEY, before, next, "AI models / caps changed")]);
  RESEARCH.forgetSettings(env);
  return { ok: true, ...(await getAi(env)) };
}

/* ---------- «دخول مراجعي المتاجر» (review-signin.js): the one review address + the owner's code ---------- */
const REVIEW_H = { validator, fail, batch, needTables, auditStmt };
export const getReview = env => reviewView(env);
export async function putReview(req, env, ctx, adm) { const b = await readBody(req, 4096); return reviewSave(env, adm, b, REVIEW_H); }
export const deleteReview = (req, env, ctx, adm) => reviewClear(env, adm, REVIEW_H);

/* ---------- «تقرير المكالمات اليومي» (calls-report.js) ---------- */
export const getCallsReport = env => CALLS.callsReportView(env);
export const putCallsReport = (req, env, ctx, adm) => CALLS.callsReportPut(req, env, ctx, adm);
export const sendCallsReport = (req, env, ctx, adm) => CALLS.callsReportSend(req, env, ctx, adm);
export const previewCallsReport = (req, env, ctx, adm, url) => CALLS.callsReportPreview(req, env, ctx, adm, url);

/* ---------- deploys ---------- */
const tokenOut = tk => ({ set: !!tk.set, source: tk.source, readable: !!tk.readable });
export async function getDeploys(env, adm, url) {
  const limit = Math.min(CF.LIST_MAX, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 10));
  const tk = await CF.devToken(env);
  const base = { account_id: CF.accountOf(env), token: tokenOut(tk), ready: !!tk.token, reason: tk.token ? "" : tk.reason || "no_token", targets: [...CF.TARGETS], confirm_word: CONFIRM_WORD };
  if (!tk.token) return { ...base, pages: null, workers: [], fetched_at: now() };
  if (!(await rateOk(env, "ccdevd|" + actorKey(adm), DEV_LIMITS.deploys_per_10min, 600))) limited("طلبات كتير — استنى دقايق / too many requests — wait a few minutes", 600);
  const [pages, ...workers] = await Promise.all([CF.pagesDeployments(env, tk.token, limit), ...CF.WORKERS.map(s => CF.workerVersions(env, tk.token, s, limit))]);
  // each rollback candidate of the site and of janna-lookup: does it have the developer panel? (`panel` true | false | null)
  await Promise.all([CF.markPanel(env, tk.token, "pages", pages), ...workers.map(w => CF.markPanel(env, tk.token, w.script, w))]);
  return { ...base, pages, workers, fetched_at: now() };
}

/* ---------- the second, server-checked confirmations of a rollback (signed, short-lived, bound to owner + target + id) ---------- */
const ACK_KINDS = Object.freeze(["pre_panel", "secrets"]);
const ACK_TAG = "mig-dev-ack|";
const ackSecret = env => String(secretOf(env) || (env && env.CONFIG_SECRET) || "");
async function ackMake(env, adm, target, id, kinds) {
  const s = ackSecret(env); if (!s) return "";
  const k = [...new Set(kinds)].filter(x => ACK_KINDS.includes(x)).sort();
  const p = b64url(enc.encode(JSON.stringify({ v: 1, a: actorKey(adm), t: target, i: id, k, e: Date.now() + DEV_LIMITS.ack_ttl_s * 1000 })));
  return p + "." + (await hmac(s, ACK_TAG + p));
}
/* → {ok:true, kinds:Set} (no ack: an empty set) | {ok:false} (forged, expired, another owner / target / id) — never throws */
async function ackRead(env, adm, target, id, ack) {
  if (ack == null || ack === "") return { ok: true, kinds: new Set() };
  const s = ackSecret(env), m = typeof ack === "string" ? /^([A-Za-z0-9_-]{16,1200})\.([A-Za-z0-9_-]{40,90})$/.exec(ack) : null;
  if (!s || !m) return { ok: false };
  try {
    if (!safeEq(await hmac(s, ACK_TAG + m[1]), m[2])) return { ok: false };
    const o = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    if (!o || o.v !== 1 || o.a !== actorKey(adm) || o.t !== target || o.i !== id || !(Number(o.e) > Date.now()) || !Array.isArray(o.k)) return { ok: false };
    return { ok: true, kinds: new Set(o.k.filter(x => ACK_KINDS.includes(x))) };
  } catch (e) { return { ok: false }; }
}
/* the rollbacks that count: the owner's dev.rollback rows (written BEFORE each call) of a rolling window — not the ones Cloudflare refused
   as «secrets changed» (nothing changed; the confirmed resend must not be blocked by its own first try) */
const COUNTED = `action = 'dev.rollback' AND actor_id = ? AND at >= ? AND after_json NOT LIKE '%"code":${CF.SECRETS_CHANGED}%'`; // after_json = JSON.stringify (no blanks)
async function rollbackCounts(env, actorId, nowMs) {
  const hourAgo = iso(nowMs - 3600e3), dayAgo = iso(nowMs - 86400e3);
  const ats = (await all(env, `SELECT at FROM cc_audit WHERE ${COUNTED} ORDER BY at`, actorId, dayAgo)).map(r => String(r.at));
  const inHour = ats.filter(a => a >= hourAgo), H = DEV_LIMITS.rollbacks_per_hour, Dy = DEV_LIMITS.rollbacks_per_day;
  let wait = 0; // until the oldest row that keeps the window full drops out of it
  if (inHour.length >= H) wait = Math.max(wait, Date.parse(inHour[inHour.length - H]) + 3600e3 - nowMs);
  if (ats.length >= Dy) wait = Math.max(wait, Date.parse(ats[ats.length - Dy]) + 86400e3 - nowMs);
  return { hour: inHour.length, day: ats.length, full: inHour.length >= H || ats.length >= Dy, retry_s: Math.max(1, Math.ceil(wait / 1000)) };
}
const waitWords = s => { const m = Math.max(1, Math.ceil(s / 60)); return m >= 120 ? [`${Math.round(m / 60)} ساعة`, `${Math.round(m / 60)} h`] : [`${m} دقيقة`, `${m} min`]; };
const rbLimited = c => { const w = waitWords(c.retry_s); limited(`رجوع كتير في وقت قصير — استنى ${w[0]} / too many rollbacks in a short time — wait ${w[1]}`, c.retry_s,
  { limit_hour: DEV_LIMITS.rollbacks_per_hour, limit_day: DEV_LIMITS.rollbacks_per_day, used_hour: c.hour, used_day: c.day }); };
/* the switches the owner set away from their default — what an older build / version (that knows no switches) would stop applying */
async function changedSwitches(env, target) {
  let view = null; try { view = await loadFeatures(env, { fresh: true }); } catch (e) { view = null; }
  return FEATURES.filter(d => (target === "pages" ? d.scope !== "server" : true) && valueOf(view, d.key) !== d.default)
    .map(d => ({ key: d.key, label_ar: d.label_ar, label_en: d.label_en, value: valueOf(view, d.key), scope: d.scope }));
}

export async function postRollback(req, env, ctx, adm) {
  const b = await readBody(req, 4096);
  // the typed word, as a string (an array or an object is never «ارجع»)
  if (typeof b.confirm !== "string" || b.confirm.trim() !== CONFIRM_WORD) fail(400, "confirm_required", `اكتب «${CONFIRM_WORD}» علشان تأكد الرجوع / type «${CONFIRM_WORD}» to confirm the rollback`, { confirm_word: CONFIRM_WORD });
  const target = typeof b.target === "string" ? b.target.trim() : "", id = typeof b.id === "string" ? b.id.trim() : "", v = validator();
  if (!CF.TARGETS.includes(target)) v.err("target", CF.TARGETS.join(" | "), "invalid_target");
  if (!CF.ID_RX.test(id)) v.err("id", "رقم النشرة / النسخة زي ما ظاهر في القائمة / the deployment / version id as listed", "invalid_id");
  if (b.force != null && typeof b.force !== "boolean") v.err("force", "true | false", "invalid_force");
  if (b.ack != null && (typeof b.ack !== "string" || b.ack.length > 1400)) v.err("ack", "the ack of the last answer, as sent", "invalid_ack");
  v.done();
  const reason = txt1(b.reason, 300), by = byOf(adm), k = actorKey(adm);
  await needTables(env, "cc_audit");
  const tk = await CF.devToken(env);
  if (!tk.token) fail(409, tk.reason === "no_token" ? "no_token" : "token_unreadable", tk.reason === "no_token" ? "حط توكن Cloudflare في «مفاتيح الخدمات» الأول / save a Cloudflare token in «Service keys» first"
    : "توكن Cloudflare المحفوظ مش مقروء — دخّله تاني في «مفاتيح الخدمات» / the saved Cloudflare token cannot be read — enter it again in «Service keys»", { slot: CF.CF_SLOT });
  // the second confirmations so far (from the ack of the last 409); a stale / foreign ack → start again
  const ack = await ackRead(env, adm, target, id, b.ack);
  if (!ack.ok) fail(409, "confirm_expired", "التأكيد التاني خلص وقته أو مش لنفس النسخة — ابدأ الرجوع من الأول / the second confirmation expired or is for another version — start the rollback again", { target, id });
  if (b.force === true && !ack.kinds.has("secrets")) fail(409, "ack_required", "الرجوع رغم تغيير الأسرار محتاج تأكيدك التاني على رسالة «الأسرار اتغيّرت» — ابدأ الرجوع من الأول / a rollback despite changed secrets needs your second confirmation of the «secrets changed» answer — start the rollback again", { target, id });
  const force = b.force === true && ack.kinds.has("secrets");
  const c0 = await rollbackCounts(env, k, Date.now());
  if (c0.full) rbLimited(c0);
  // the id must be one of the target's last deployments / versions as Cloudflare lists them NOW, rollback-able and not in force
  const list = target === "pages" ? await CF.pagesDeployments(env, tk.token, CF.LIST_MAX) : await CF.workerVersions(env, tk.token, target, CF.LIST_MAX);
  if (!list.ok) fail(502, "upstream", "Cloudflare مارضيش يرجّع القائمة / Cloudflare did not return the list", { upstream_status: list.error.status, upstream_error: list.error.message });
  const item = list.items.find(x => x.id === id);
  if (!item) fail(404, "not_found", "النسخة دي مش في آخر النشرات / this id is not among the latest deployments", { target });
  if (item.is_current) fail(409, "already_current", "دي النسخة الشغالة دلوقتي / this is the version in production now", { target });
  if (!item.can_rollback) fail(409, "not_production", target === "pages" ? "ينفع نرجع بس لنشرة إنتاج ناجحة / only a successful production deployment can be restored" : "مش قادرين نحدد النسخة الشغالة دلوقتي — حدّث القائمة / the version in force cannot be determined — reload the list", { target });
  // OLDER than the developer panel (or it cannot be told): the panel, its roll-forward and the switches go with it — the owner confirms again
  const panel = await CF.panelAware(env, tk.token, target, item);
  if (panel !== true && !ack.kinds.has("pre_panel")) {
    const next = await ackMake(env, adm, target, id, [...ack.kinds, "pre_panel"]);
    fail(409, "pre_panel", target === "pages"
      ? "نشرة الموقع دي أقدم من لوحة المطوّر: لو رجعت لها، قسم «🛠️ المطوّر» هيختفي من لوحة التحكم، والمزايا اللي غيّرتها مش هتتطبّق على صفحات الموقع، والرجوع للأحدث هيبقى من لوحة Cloudflare. لو متأكد، أكّد تاني / this site deployment predates the developer panel: after it, «🛠️ Developer» is gone from the Control Center, the switches you changed stop applying on the site's pages, and going forward again is done in the Cloudflare dashboard. Confirm again only if you are sure"
      : "النسخة دي من السيرفر أقدم من لوحة المطوّر: لو رجعت لها، لوحة المطوّر هتختفي، وكل المزايا اللي قفلتها هترجع تشتغل، ومش هتقدر تمسح توكن Cloudflare من «مفاتيح الخدمات»، والرجوع للأحدث هيبقى من لوحة Cloudflare. لو متأكد، أكّد تاني / this server version predates the developer panel: after it, the panel is gone, every switch you turned off works again, the Cloudflare token cannot be deleted from «Service keys», and going forward again is done in the Cloudflare dashboard. Confirm again only if you are sure",
      { target, id, panel, ack: next, ack_ttl_s: DEV_LIMITS.ack_ttl_s, changed_features: await changedSwitches(env, target) });
  }
  const previous_id = target === "pages" ? list.current_id : (list.current && list.current.version_id) || "";
  const tid = `${target}:${id}`, what = target === "pages" ? `Pages ${CF.PAGES_PROJECT}` : `Worker ${target}`, prePanel = panel !== true;
  // audit FIRST (a failing insert = nothing is sent), completed with the answer. The insert itself holds the rolling limits (one statement:
  // two requests at the same moment cannot both pass), and its `at` is the clock the window counts with
  const t0 = Date.now(), hourAgo = iso(t0 - 3600e3), dayAgo = iso(t0 - 86400e3);
  const entry = { ...adm.actor, at: iso(t0), action: "dev.rollback", target_type: "deploy", target_id: tid, before: { in_force: previous_id },
    after: { target, id, status: "sending", ...(force ? { force: true } : {}), ...(prePanel ? { pre_panel: true } : {}), ...(reason ? { reason } : {}) },
    summary: `rollback ${what} → ${id}${prePanel ? " (older than the developer panel)" : ""}${reason ? " — " + reason : ""}`, ip_hash: adm.ipHash, req_id: adm.reqId };
  let ins = null;
  try { ins = await auditStmtIf(env, entry, `(SELECT COUNT(*) FROM cc_audit WHERE ${COUNTED}) < ? AND (SELECT COUNT(*) FROM cc_audit WHERE ${COUNTED}) < ?`,
    [k, hourAgo, DEV_LIMITS.rollbacks_per_hour, k, dayAgo, DEV_LIMITS.rollbacks_per_day]).run(); }
  catch (e) { fail(500, "audit_failed", "سجل العمليات مااتكتبش — مفيش حاجة اتغيّرت / the audit log could not be written — nothing was changed"); }
  if (!ins || !ins.meta || ins.meta.changes !== 1) rbLimited(await rollbackCounts(env, k, Date.now()));
  const auditId = ins.meta.last_row_id;
  const msg = `Control Center rollback by ${by}${reason ? ": " + reason : ""}`;
  const r = target === "pages" ? await CF.pagesRollback(env, tk.token, id) : await CF.workerDeploy(env, tk.token, target, id, msg, force);
  await adm.auditDone(auditId, { after: { target, id, status: r.ok ? "ok" : "failed", previous_id, upstream_status: r.status || 0, ...(r.ok ? { result_id: r.result.id } : { error: r.error.message, code: r.error.code }), ...(force ? { force: true } : {}), ...(prePanel ? { pre_panel: true } : {}), ...(reason ? { reason } : {}) },
    summary: `rollback ${what} → ${id}: ${r.ok ? "done" : "failed (" + (r.status || "no answer") + ")"}${prePanel ? " (older than the developer panel)" : ""}${reason ? " — " + reason : ""}` });
  if (!r.ok) {
    if (r.error.code === CF.SECRETS_CHANGED && !force) {
      const next = await ackMake(env, adm, target, id, [...ack.kinds, "secrets"]);
      fail(409, "secrets_changed", "الأسرار دي اتغيّرت من وقت النسخة دي — لو متأكد اكتب «ارجع» تاني ووافق على «رجوع رغم تغيير الأسرار» / these secrets changed since that version — to go ahead anyway, confirm again",
        { target, id, secrets: r.error.secrets || [], force_allowed: !!next, ack: next, ack_ttl_s: DEV_LIMITS.ack_ttl_s });
    }
    fail(502, "upstream", "Cloudflare رفض الرجوع / Cloudflare refused the rollback", { upstream_status: r.status || 0, upstream_error: r.error.message, upstream_code: r.error.code || 0 });
  }
  return { ok: true, target, id, previous_id, result: r.result, ...(prePanel ? { pre_panel: true } : {}),
    note_ar: target === "pages" ? "الموقع رجع للنشرة دي. ممكن ياخد دقيقة لحد ما كل الزوار يشوفوها." : target === "janna-lookup" ? "الـ API رجع للنسخة دي (ومعاها إعداداتها وقتها). أول طلب بعدها ممكن ياخد ثانية." : "مركز المعلومات رجع للنسخة دي (ومعاها إعداداتها وقتها).",
    note_en: target === "pages" ? "The site is back on that deployment. It can take a minute until every visitor sees it." : "The Worker is back on that version (with its settings of that time). The next request may take a second." };
}

/* ---------- health ---------- */
const PAGES = [["/", "الصفحة الرئيسية", "Home page"], ["/en/", "الرئيسية بالإنجليزي", "English home"], ["/market/", "السوق", "Marketplace"], ["/tenders/", "المناقصات", "Tenders"],
  ["/advisor/", "صفحة باسم", "Bassem's page"], ["/login/", "الدخول", "Sign-in"], ["/dashboard/", "لوحة المصنع", "Factory dashboard"], ["/admin/", "لوحة التحكم", "Control Center"]];
const APIS = [["/api/janna/health", "جنة (بحث الدليل)", "Janna (directory lookup)"], ["/api/auth/health", "الدخول بالكود", "E-mail-code sign-in"], ["/api/advisor/health", "باسم", "Bassem"],
  ["/api/meetings/health", "الاجتماعات", "Meetings"], ["/api/inquiries/health", "الطلبات", "Requests"], ["/api/settings", "الإعدادات العامة", "Public settings"], ["/api/plans", "الباقات", "Plans"]];
const INTEL = [["/api/intel/health", "مركز المعلومات (API)", "Intelligence center API"], ["/intel/", "صفحات مركز المعلومات", "Intelligence center pages"]];
export const HEALTH_TABLES = Object.freeze(["members", "auth_sessions", "inquiries", "inquiry_routes", "quotes", "notifications", "meetings", "deals", "member_profiles", "cc_audit", "cc_content",
  "cc_media", "cc_invoices", "cc_payments", "cc_mail_log", "advisor_memory", "janna_visitors", "knowledge_bank", "memory_tasks", "wa_messages"]);
export const PAGES_ORIGIN = "https://madeinegyptgate.pages.dev", INTEL_ORIGIN = "https://migate-intel.daily-spoonbill.workers.dev";
const originOk = s => /^https:\/\/[a-z0-9.-]+[a-z0-9]$/i.test(String(s || "")) ? String(s) : "";
const short = s => String(s == null ? "" : s).replace(/[\u0000-\u001f<>"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
function withTimeout(p, ms) { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "AbortError" })), ms); })]).finally(() => clearTimeout(tm)); }
/* one GET → {ok, status, ms, detail}; json: the body must be JSON without ok:false; html: it must look like a page */
async function probe(doFetch, url, kind) {
  const t0 = Date.now(), ctl = new AbortController();
  try {
    const r = await withTimeout(doFetch(new Request(url, { method: "GET", redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "MIG-ControlCenter-Health/1", Accept: kind === "json" ? "application/json" : "text/html" } })), DEV_LIMITS.probe_ms);
    const ms = Date.now() - t0;
    if (r.status !== 200) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } return { ok: false, status: r.status, ms, detail: "status " + r.status }; }
    const text = await withTimeout(r.text(), DEV_LIMITS.probe_ms);
    if (kind === "json") {
      let j = null; try { j = JSON.parse(text); } catch (e) { j = null; }
      if (!j || typeof j !== "object") return { ok: false, status: 200, ms, detail: "not JSON" };
      if (j.ok === false) return { ok: false, status: 200, ms, detail: "ok: false" + (j.error ? " — " + short(j.error) : "") };
      return { ok: true, status: 200, ms, detail: "" };
    }
    return /<html|<!doctype html/i.test(text.slice(0, 4000)) ? { ok: true, status: 200, ms, detail: "" } : { ok: false, status: 200, ms, detail: "not a page" };
  } catch (e) { ctl.abort(); return { ok: false, status: 0, ms: Date.now() - t0, detail: e && e.name === "AbortError" ? "timeout" : "unreachable" }; }
}
async function tableCounts(env) {
  const out = [];
  for (const name of HEALTH_TABLES) {
    try { const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${name}`).first(); out.push({ name, rows: Number((r && r.n) || 0), ok: true }); }
    catch (e) { out.push({ name, rows: null, ok: false }); } // missing table (or the read failed): red, never an invented 0
  }
  return out;
}
export async function getHealth(req, env, ctx, adm) {
  if (!(await rateOk(env, "ccdevh|" + actorKey(adm), DEV_LIMITS.health_per_10min, 600))) limited("فحوص كتير — استنى دقايق / too many checks — wait a few minutes", 600);
  const t0 = Date.now(), pagesOrigin = originOk(env.DEV_PAGES_ORIGIN) || PAGES_ORIGIN, intelOrigin = originOk(env.INTEL_ORIGIN) || INTEL_ORIGIN;
  const ext = r => fetch(r);
  const intel = env.INTEL && typeof env.INTEL.fetch === "function" ? r => env.INTEL.fetch(r) : ext; // a service binding, when one is configured
  // this Worker's own APIs run IN-PROCESS (index.js CC.self): a Worker cannot reach its own routes through its zone's front door
  const self = adm && adm.CC && adm.CC.self && typeof adm.CC.self.fetch === "function" ? r => adm.CC.self.fetch(r, env, { waitUntil: p => ctx.waitUntil(p), passThroughOnException() {} }) : null;
  const sitePrefix = site(env).replace(/\/$/, "");
  const jobs = [
    ...PAGES.map(([p, ar, en]) => probe(ext, pagesOrigin + p, "html").then(x => ({ id: "page:" + p, group: "page", label_ar: ar, label_en: en, url: pagesOrigin + p, ...x }))),
    ...APIS.map(([p, ar, en]) => (self ? probe(self, sitePrefix + p, "json") : Promise.resolve({ ok: false, status: 0, ms: 0, detail: "not available in this build" })).then(x => ({ id: "api:" + p, group: "api", label_ar: ar, label_en: en, url: sitePrefix + p, ...x }))),
    ...INTEL.map(([p, ar, en]) => probe(intel, intelOrigin + p, p.startsWith("/api/") ? "json" : "html").then(x => ({ id: "intel:" + p, group: "intel", label_ar: ar, label_en: en, url: intelOrigin + p, ...x }))),
  ];
  const d0 = Date.now(); let dbOk = false, dbDetail = "";
  try { dbOk = !!(await env.DB.prepare("SELECT 1 AS x").first()); } catch (e) { dbDetail = "D1 read failed"; }
  const dbCheck = { id: "db:d1", group: "db", label_ar: "قاعدة البيانات D1", label_en: "D1 database", url: "", ok: dbOk, status: dbOk ? 200 : 0, ms: Date.now() - d0, detail: dbDetail };
  const tables = await tableCounts(env);
  /* can the Anam key read sessions (the calls report)? one read-only GET /v1/sessions?perPage=1 */
  const ap = await CALLS.anamProbe(env, { fresh: true });
  const anamCheck = { id: "anam:sessions", group: "anam", label_ar: "Anam: قراءة الجلسات (تقرير المكالمات)", label_en: "Anam: reading sessions (calls report)", url: "", ok: ap.ok, status: ap.status, ms: ap.ms, detail: ap.ok ? "" : ap.detail_ar + " / " + ap.detail_en };
  const vm = env.CF_VERSION_METADATA && typeof env.CF_VERSION_METADATA === "object" ? env.CF_VERSION_METADATA : null;
  const worker = { script: "janna-lookup", version_id: vm ? short(vm.id) : "", version_tag: vm ? short(vm.tag) : "", version_at: vm ? short(vm.timestamp) : "", source: vm ? "binding" : "none", data_v: short(DATA && DATA.v) };
  const verCheck = { id: "worker:version", group: "worker", label_ar: "نسخة الـ Worker", label_en: "Worker version", url: "", ok: true, status: 200, ms: 0,
    detail: vm ? `${worker.version_id}${worker.version_tag ? " (" + worker.version_tag + ")" : ""}` : "مفيش ربط CF_VERSION_METADATA — النسخة ظاهرة في «النشرات» / no CF_VERSION_METADATA binding — see «Deploys»" };
  const checks = [...(await Promise.all(jobs)), dbCheck, verCheck, anamCheck];
  return { ok: checks.every(c => c.ok) && tables.every(t => t.ok), checked_at: now(), ms: Date.now() - t0, checks, tables, worker };
}

/* ---------- audit (the developer panel's own actions) ---------- */
export async function devAudit(env, url) {
  const lim = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50)), before = parseInt(url.searchParams.get("before"), 10);
  const from = line(url.searchParams.get("from"), 10), where = ["(action LIKE 'dev.%' OR action LIKE 'calls_report.%' OR action IN ('review.signin', 'review.sessions_revoke', 'review.sessions_shorten') OR (action IN ('keys.set', 'keys.delete', 'keys.test') AND target_id = ?))"], args = [CF.CF_SLOT];
  if (Number.isInteger(before) && before > 0) { where.push("id < ?"); args.push(before); }
  if (from && dateOk(from)) { where.push("at >= ?"); args.push(from + "T00:00:00.000Z"); }
  const rows = await all(env, `SELECT id, at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json FROM cc_audit WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`, ...args, lim);
  const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const items = rows.map(r => ({ id: r.id, at: r.at, actor_id: r.actor_id, actor_email: r.actor_email, actor_role: r.actor_role, action: r.action, target_type: r.target_type, target_id: r.target_id, summary: r.summary, before: parse(r.before_json), after: parse(r.after_json) }));
  return { items, next_before: items.length === lim ? items[items.length - 1].id : null };
}

/* whoami.features (acc.js): the section is shown to the owner only; a saved Cloudflare token (presence only, never a value) */
export async function devFeatures(env, adm) {
  const dev = !!(adm && adm.can && adm.can("dev.manage"));
  if (!dev) return { dev: false, dev_token: false };
  let saved = false; try { saved = !!(env && env.CF_DEV_TOKEN) || !!(await first(env, "SELECT 1 AS x FROM cc_secrets WHERE name = ?", CF.CF_SLOT)); } catch (e) { saved = false; }
  return { dev: true, dev_token: saved };
}
