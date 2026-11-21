/* The daily memory update («ذاكرة محدّثة يومياً» — owner, 2026-11-18 23:50: «اشتغل على إعداداتهم إنهم يبقى عندهم ذاكرة محدّثة يومياً»).
   Runs in the existing platform cron (index.js platformCron, every 15 minutes) and does its work once per Cairo day, from the first
   tick after Cairo midnight, for the day that just ended (D = yesterday). Deterministic (no LLM), idempotent (every row is an upsert by
   a fixed key, rebuilt from the stored rows), bounded per run (DAY_LIM.batch clients per tick; the next tick carries on; the cron_runs
   gate 'memory-day' closes the day only when every client of D is done and the maintenance has run).
   For every member / visitor with activity on D (call turns, summaries, searches, facts, tasks opened or closed):
     1) the DAY DIGEST — advisor_memory kind 'day', hash 'day|<D>' (recall by time reads it: «امبارح» / «الأسبوع اللي فات»): calls, topics,
        products, markets, searches, items opened, e-mails (counts), decisions (deals, follows, the work time, Janna's registration /
        meeting / request), tasks opened and closed that day;
     2) «ملخص العميل» — memory_briefs (subject, agent), ≤ DAY_LIM.brief (1,500) characters: who he is, what he makes, markets, his history
        with the persona, what he talks about, open deals and tasks, the persona's last promises, preferences (Bassem's members: work
        time, morning message, e-mail languages; Janna's visitors: stage and interest). memory.js memoryContext gives it to every call.
   Then, once per day (bounded): the tasks' maintenance (tasks.js maintainTasks), the knowledge bank's near-duplicate merge (knowledge.js)
   and the caps report (capReport: the clients past LIM.turnsCap / LIM.searchesCap are only REPORTED — nothing is deleted).
   Review 2026-11-19:
     #2  budget — the jobs run on the tick's counting D1 (memory.js budgetDB, TICK): clients are processed while the budget lasts, each
         maintenance step runs once (its marker in rl) when it fits, and the day's gate 'memory-day' is written only when all is done;
         the day waits for this day's consolidation (memory.js memoryCron) to be closed first;
     #5  no visitor ↔ member links by the e-mail / mobile hashes any more (a member's mobile is not verified, a visitor's contact is only
         claimed): visitor.js links on the member's own signed-in request only;
     #13 no automatic deletion at all (owner's policy: the only deletion is the owner's audited legal erasure): the old «safety valve»
         that removed raw turns / searches past the caps is gone; capReport() logs who is past them so the owner can decide. */
import { iso, cairoDay, addDays, jparse, prefsOf, effPlan, PLAN_NAME } from "./common.js";
import { hasTable, dayStartIso, dayAfterIso } from "./acc-base.js";
import { forLLM, instructionLike, norm } from "./text.js";
import { LIM, TICK, store, termsOf, marketAr, isItemTool, dayAr, budgetLeft } from "./memory.js";
import { openTasks, maintainTasks } from "./tasks.js";
import { mergeKnowledge } from "./knowledge.js";
import { subjectOf, visitorStats } from "./visitor.js";

export const DAY_LIM = Object.freeze({ batch: 40, subjects: 5000, brief: 1500, dayText: 1200, sums: 60, briefSums: 200, linkMembers: 500, linkDays: 3 });
const llm = (s, n) => { const v = forLLM(s, n); return v && !instructionLike(s, { money: false }) && !instructionLike(v, { money: false }) ? v : ""; };
const cairoOf = at => { const ms = Date.parse(at); return Number.isFinite(ms) ? cairoDay(ms) : ""; };
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(x => x[0]);
const bump = (m, v, w = 1) => { const k = String(v || "").trim(); if (k) m.set(k, (m.get(k) || 0) + w); };
const ar = n => (n === 1 ? "مكالمة واحدة" : n === 2 ? "مكالمتين" : n + " مكالمات");
const PLAN_AR = { profile: "بيانات الشركة", basic: "الأساسية", premium: "المميزة", partner: "الشريك الأساسي", strategic: "الشريك الاستراتيجي" };
const STAGE_AR = { new: "زائر جديد", browsing: "بيتفرّج على المنصة", interested: "سأل عن الباقات والتسجيل", lead: "ساب طلب أو بيانات تواصل أو حدد اجتماع", registering: "بدأ يملا فورم التسجيل ولسه ماكمّلش", member: "اتسجّل عضو على المنصة" };
const DEAL_STAGE = { discover: "استكشاف", contact: "تواصل", offer: "عرض سعر", negotiation: "تفاوض", contract: "تعاقد", delivery: "توريد" };
const LANG_AR = { ar: "العربي", en: "الإنجليزي", fr: "الفرنساوي", zh: "الصيني", es: "الإسباني", de: "الألماني", tr: "التركي", ru: "الروسي", pt: "البرتغالي", it: "الإيطالي" };
/* a due date in a STORED text (the brief is read on later days): absolute, never «بكرة» */
const dueAbs = due => !due ? "" : "يوم " + (dayAr(String(due).slice(0, 10)) || String(due).slice(0, 10)) + (String(due).length > 10 ? " الساعة " + String(due).slice(11, 16) : "");
const fit = (lines, max) => { let out = ""; for (const l of lines) { if (!l) continue; const next = out ? out + "\n" + l : l; if (next.length > max) break; out = next; } return out; };

/* ---------- 1) the day digest of ONE client ---------- */
export async function buildDay(env, subject, agent, D, run, nowMs = Date.now()) {
  const from = dayStartIso(D), to = dayAfterIso(D), q = async (sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
  const sums = (await q("SELECT call_id, at, data_json FROM advisor_memory WHERE member_id = ? AND kind = 'summary' AND at >= ? AND at < ? ORDER BY at LIMIT ?", subject, from, to, DAY_LIM.sums)).filter(r => cairoOf(r.at) === D);
  const srch = (await q("SELECT at, data_json FROM advisor_memory WHERE member_id = ? AND kind = 'search' AND at >= ? AND at < ? ORDER BY at LIMIT 80", subject, from, to)).filter(r => cairoOf(r.at) === D);
  const facts = (await q("SELECT at, text FROM advisor_memory WHERE member_id = ? AND kind = 'fact' AND at >= ? AND at < ? ORDER BY at LIMIT 10", subject, from, to)).filter(r => cairoOf(r.at) === D);
  const turnN = (await q("SELECT COUNT(*) AS n, MAX(at) AS last FROM advisor_memory WHERE member_id = ? AND kind = 'turn' AND at >= ? AND at < ?", subject, from, to))[0] || {};
  const opened = await q("SELECT title, kind, source FROM memory_tasks WHERE subject = ? AND agent = ? AND created_at >= ? AND created_at < ? ORDER BY id LIMIT 20", subject, agent, from, to);
  const closed = await q("SELECT title, kind, status FROM memory_tasks WHERE subject = ? AND agent = ? AND done_at >= ? AND done_at < ? ORDER BY id LIMIT 20", subject, agent, from, to);
  if (!sums.length && !srch.length && !facts.length && !opened.length && !closed.length && !Number(turnN.n || 0)) return null;
  const T = new Map(), P = new Map(), K = new Map(), O = [], dec = [];
  let drafts = 0, sent = 0, turns = 0;
  for (const r of sums) {
    const d = jparse(r.data_json, {}); turns += Number(d.turns || 0);
    (d.topics || []).forEach(x => bump(T, x)); (d.products || []).forEach(x => bump(P, x)); (d.markets || []).forEach(x => bump(K, x));
    for (const o of d.opened || []) if (o && o.title && O.length < 6 && !O.includes(o.title)) O.push(o.title);
    for (const e of d.emails || []) { if (e && e.sent) sent++; else drafts++; }
    for (const x of d.deals || []) if (!dec.includes(x)) dec.push(x);
    for (const x of d.follows || []) { const v = "متابعة " + x; if (!dec.includes(v)) dec.push(v); }
    for (const x of d.next || []) if (/^ميعاد الشغل اليومي/.test(x) && !dec.includes(x)) dec.push(x);
    for (const t of d.tools || []) { // Janna's steps that are decisions
      if (!t || t.outcome === "refused" || t.outcome === "failed") continue;
      const a = t.args || {};
      const v = t.name === "janna_fill_registration" ? "بدأ التسجيل" + (PLAN_AR[a.plan] ? " على باقة " + PLAN_AR[a.plan] : "") : t.name === "janna_schedule_meeting" ? "حدد اجتماع مع جنة" + (a.date ? " يوم " + a.date : "")
        : t.name === "janna_start_meeting" ? "عمل الاجتماع التعريفي مع جنة" : t.name === "janna_submit_form" && t.outcome === "ok" ? (a.form === "contact" ? "بعت رسالة تواصل" : "بعت طلب عرض سعر") : "";
      if (v && !dec.includes(v)) dec.push(v);
    }
  }
  const S = [];
  for (const r of srch) { const d = jparse(r.data_json, {}); if (!d.query || isItemTool(d.tool)) continue; const k = norm(d.query) + "|" + (d.market || ""); if (S.some(x => x.k === k)) continue; S.push({ k, q: d.query, market: d.market || "", n: Number(d.count || 0) }); if (S.length >= 6) break; }
  const calls = new Set(sums.map(r => r.call_id)).size;
  const L = (arr, n) => arr.map(x => llm(x, n)).filter(Boolean);
  const parts = ["يوم " + (dayAr(D, nowMs) || D) + ": " + (calls ? ar(calls) : "من غير مكالمة")];
  const tp = L(top(T, 6), 30); if (tp.length) parts.push("المواضيع: " + tp.join("، "));
  const pr = L(top(P, 6), 30); if (pr.length) parts.push("المنتجات: " + pr.join("، "));
  const mk = L(top(K, 6), 30); if (mk.length) parts.push("الأسواق: " + mk.join("، "));
  const sq = S.map(s => { const qq = llm(s.q, 50); return qq ? qq + (s.market ? " (" + forLLM(marketAr(s.market), 20) + ")" : "") + " " + (s.n ? s.n + " نتيجة" : "بدون نتائج") : ""; }).filter(Boolean);
  if (sq.length) parts.push("البحث: " + sq.join("، "));
  const op = L(O, 60); if (op.length) parts.push("اتفتح: " + op.join("، "));
  if (drafts || sent) parts.push("إيميلات: " + [drafts ? (drafts === 1 ? "مسودة واحدة" : drafts + " مسودات") : "", sent ? (sent === 1 ? "واحد اتبعت" : sent + " اتبعتوا") : ""].filter(Boolean).join(" و"));
  const dc = L(dec, 80).slice(0, 6); if (dc.length) parts.push("القرارات: " + dc.join("؛ "));
  const fx = L(facts.map(f => f.text), 100).slice(0, 3); if (fx.length) parts.push("قال: " + fx.join("؛ "));
  const to_ = L(opened.map(t => t.title), 90).slice(0, 5); if (to_.length) parts.push("مهام اتفتحت: " + to_.join("؛ "));
  const tc = L(closed.map(t => t.title + (t.status === "cancelled" ? " (اتلغت)" : "")), 90).slice(0, 5); if (tc.length) parts.push("مهام خلصت: " + tc.join("؛ "));
  let text = parts.join(". "); if (text.length > DAY_LIM.dayText) text = text.slice(0, DAY_LIM.dayText - 1) + "…";
  const lastAt = [...sums.map(r => r.at), ...srch.map(r => r.at), ...facts.map(r => r.at), turnN.last || ""].filter(x => x && cairoOf(x) === D).sort().pop() || iso(Date.parse(to) - 1000);
  const data = { v: 1, day: D, run, calls, turns: turns || Number(turnN.n || 0), topics: tp, products: pr, markets: mk, searches: S.map(s => ({ q: s.q, market: s.market, n: s.n })), opened: op,
    emails: { drafts, sent }, decisions: dc, tasks_opened: to_, tasks_closed: tc, built_at: iso(nowMs) };
  await store(env, [{ member_id: subject, kind: "day", call_id: "", at: lastAt, agent, text, terms: termsOf(text), data, hash: "day|" + D }]);
  return { text, data };
}

/* ---------- 2) «ملخص العميل» of ONE client (≤ 1,500 characters) ---------- */
export async function refreshBrief(env, subject, agent, D, nowMs = Date.now()) {
  if (!(await hasTable(env, "memory_briefs"))) return null;
  const q = async (sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
  const sums = await q("SELECT at, data_json FROM advisor_memory WHERE member_id = ? AND kind = 'summary' ORDER BY at DESC LIMIT ?", subject, DAY_LIM.briefSums);
  const agg = (await q("SELECT COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last FROM advisor_memory WHERE member_id = ? AND kind = 'summary'", subject))[0] || {};
  const T = new Map(), P = new Map(), K = new Map(), langs = new Map();
  sums.forEach((r, i) => { const d = jparse(r.data_json, {}), w = i < 10 ? 2 : 1; // the newest calls weigh more
    (d.topics || []).forEach(x => bump(T, x, w)); (d.products || []).forEach(x => bump(P, x, w)); (d.markets || []).forEach(x => bump(K, x, w)); (d.emails || []).forEach(e => e && e.language && bump(langs, e.language)); });
  const L = (arr, n, k) => arr.map(x => llm(x, n)).filter(Boolean).slice(0, k);
  const tasks = await openTasks(env, subject, agent, { limit: 12 });
  const promises = tasks.filter(t => t.source === "promise").slice(0, 2), rest = tasks.filter(t => t.source !== "promise");
  const lines = [], data = {};
  const history = agg.n ? (agent === "janna" ? "زيارات" : "تاريخه معانا") + ": أول مكالمة " + (dayAr(cairoOf(agg.first), nowMs) || "") + "، " + ar(Number(agg.n)) + "، آخرها " + (dayAr(cairoOf(agg.last), nowMs) || "") : "";
  if (agent === "janna" || String(subject).startsWith("v:")) {
    const vid = String(subject).slice(2), v = (await q("SELECT * FROM janna_visitors WHERE visitor_id = ?", vid))[0] || {}, it = jparse(v.interest_json, {});
    lines.push("ملخص الزائر (اتحدّث " + (dayAr(D, nowMs) || D) + "):");
    if (history) lines.push("- " + history);
    if (STAGE_AR[v.stage]) lines.push("- المرحلة: " + STAGE_AR[v.stage]);
    const intr = [...L(it.products || [], 30, 4), ...L((it.markets || []).map(m => marketAr(m)), 30, 4), ...(it.plans || []).filter(p => PLAN_AR[p]).slice(0, 2).map(p => "باقة " + PLAN_AR[p])];
    const more = L(top(P, 4), 30).filter(x => !intr.includes(x)); intr.push(...more.slice(0, 2));
    if (intr.length) lines.push("- مهتم بـ: " + intr.join("، "));
    const qs = L(it.questions || [], 110, 3); if (qs.length) lines.push("- سأل عن: " + qs.join("؛ "));
    const tp = L(top(T, 5), 30); if (tp.length) lines.push("- بيتكلم عن: " + tp.join("، "));
    Object.assign(data, { history, stage: v.stage || "new", interest: intr, questions: qs, topics: tp, linked: !!v.member_id });
  } else {
    const m = (await q("SELECT company, sector, governorate, plan, plan_expires, prefs_json FROM members WHERE id = ?", subject))[0];
    const prof = jparse(((await q("SELECT profile_json FROM member_profiles WHERE member_id = ?", subject))[0] || {}).profile_json, {});
    lines.push("ملخص العميل (اتحدّث " + (dayAr(D, nowMs) || D) + "):");
    if (m) { const plan = String((PLAN_NAME[effPlan(m)] || [])[0] || "").replace(/^باقة\s+/, ""); const who = [llm(m.company, 80), llm(String(m.sector || "").replace(/\s*\([^)]*\)\s*$/, ""), 60), llm(m.governorate, 30)].filter(Boolean);
      if (who.length || plan) lines.push("- مين: " + [who.join("، "), plan ? "باقة " + plan : ""].filter(Boolean).join("؛ ")); data.who = who; }
    const makes = L(Array.isArray(prof.products) ? prof.products : [], 60, 5); for (const x of L(top(P, 6), 30)) if (makes.length < 6 && !makes.some(y => norm(y).includes(norm(x)))) makes.push(x);
    if (makes.length) lines.push("- بيصنّع: " + makes.join("، ") + (llm(prof.capacity, 60) ? " (الطاقة: " + llm(prof.capacity, 60) + ")" : ""));
    const mk = L(Array.isArray(prof.target_markets) ? prof.target_markets : [], 30, 6); for (const x of L(top(K, 6), 30)) if (mk.length < 8 && !mk.includes(x)) mk.push(x);
    if (mk.length) lines.push("- أسواقه: " + mk.join("، "));
    if (history) lines.push("- " + history);
    const tp = L(top(T, 5), 30); if (tp.length) lines.push("- بيتكلم عن: " + tp.join("، "));
    const deals = await q("SELECT title, stage, next_action, due_date FROM deals WHERE member_id = ? AND stage NOT IN ('won', 'lost') ORDER BY (CASE WHEN due_date = '' THEN 1 ELSE 0 END), due_date, updated_at DESC LIMIT 3", subject);
    const dl = deals.map(d => { const t = llm(d.title, 60); return t ? t + (DEAL_STAGE[d.stage] ? " (" + DEAL_STAGE[d.stage] + (d.due_date ? "، قبل " + (dayAr(String(d.due_date).slice(0, 10), nowMs) || llm(d.due_date, 12)) : "") + ")" : "") : ""; }).filter(Boolean);
    if (dl.length) lines.push("- صفقات مفتوحة: " + dl.join("؛ "));
    /* before he was a member: what he told Janna (visitors linked to his account) */
    const vs = await q("SELECT visitor_id, first_at, calls, interest_json FROM janna_visitors WHERE member_id = ? AND link_via = 'session' ORDER BY first_at LIMIT 3", subject); // review #5 / #6: his own signed-in links only
    if (vs.length && vs.some(v => v.calls > 0)) { const it = jparse(vs[0].interest_json, {}), n = vs.reduce((a, v) => a + Number(v.calls || 0), 0), intr = L([...(it.products || []), ...(it.markets || []).map(x => marketAr(x))], 30, 4);
      lines.push("- قبل ما يبقى عضو: اتكلم مع جنة " + ar(n).replace("مكالمة", "مرة").replace("مكالمتين", "مرتين").replace("مكالمات", "مرات") + " (أول مرة " + (dayAr(cairoOf(vs[0].first_at), nowMs) || "") + ")" + (intr.length ? "، وكان مهتم بـ " + intr.join("، ") : "")); }
    /* «رسالة الصبح <time>» only, never its channel (owner 2026-11-20: no WhatsApp promise while sending is off): this brief is read on later
       days, so a stored «على الواتساب» would outlive the switch; the call's member block says which channel is true today (bassem-context.js
       WA_LINE, from whatsapp.js waMemberState) */
    const p = prefsOf(m || {}), pf = [p.session_time ? "ميعاد الشغل اليومي " + p.session_time : "", p.morning_time && p.morning_time !== "09:00" ? "رسالة الصبح " + p.morning_time : p.morning_time ? "رسالة الصبح 09:00" : "", top(langs, 3).filter(l => LANG_AR[l]).length ? "الإيميلات بـ" + top(langs, 3).filter(l => LANG_AR[l]).map(l => LANG_AR[l]).join(" و") : ""].filter(Boolean);
    if (pf.length) lines.push("- تفضيلات: " + pf.join("، "));
    Object.assign(data, { makes, markets: mk, history, topics: tp, deals: dl, prefs: pf });
  }
  const tl = rest.slice(0, 3).map(t => { const ti = llm(t.title, 90); return ti ? ti + (t.due ? " (" + dueAbs(t.due) + ")" : "") : ""; }).filter(Boolean);
  if (rest.length) lines.push("- مهام مفتوحة: " + rest.length + (tl.length ? " — " + tl.join("؛ ") : ""));
  const pl = promises.map(t => llm(t.title, 100)).filter(Boolean);
  if (pl.length) lines.push("- آخر وعود منك (" + (agent === "janna" ? "مش متأكدة" : "مش متأكد") + " إنها اتعملت): " + pl.join("؛ "));
  Object.assign(data, { tasks: rest.length, promises: pl });
  if (lines.length <= 1) return null;
  const text = fit(lines, DAY_LIM.brief);
  await env.DB.prepare("INSERT INTO memory_briefs (subject, agent, text, data_json, day, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(subject, agent) DO UPDATE SET text = excluded.text, data_json = excluded.data_json, day = excluded.day, updated_at = excluded.updated_at")
    .bind(subject, agent === "janna" ? "janna" : "bassem", text, JSON.stringify(data), D, iso(nowMs)).run();
  return { text, data };
}

/* ---------- visitor ↔ member links: none here any more (review 2026-11-19 #5 / #6) ----------
   A mobile in members.phone is typed by the member (nobody verifies it) and an e-mail / mobile a visitor gave Janna is only claimed: a
   hash match proves nothing, so linking by them let anyone pull a visitor's Janna history into his own prompt (or push text into a
   member's). visitor.js links a visitor id ONLY on the member's own signed-in request from that browser. Kept so old callers get an answer. */
export async function linkVisitorsDaily() { return { skipped: "session links only" }; }

/* ---------- the caps report (owner's policy: memory is permanent — NOTHING is deleted automatically; review 2026-11-19 #13) ----------
   The clients past LIM.turnsCap raw turns / LIM.searchesCap searches (Worker variables MEMORY_TURN_CAP / MEMORY_SEARCH_CAP can only raise
   them) are only counted and logged for the owner; the per-client daily row ceiling (memory.js LIM.rowsPerDay) already bounds a runaway
   client. Only the owner's audited legal erasure deletes memory (acc-memory.js). */
const capOf = (env, name, min) => Math.max(min, parseInt(env && env[name], 10) || 0); // the Worker variable can only RAISE a cap
export async function capReport(env) {
  const out = { over: 0, clients: [] };
  for (const [kind, cap] of [["turn", capOf(env, "MEMORY_TURN_CAP", LIM.turnsCap)], ["search", capOf(env, "MEMORY_SEARCH_CAP", LIM.searchesCap)]]) {
    const rows = (await env.DB.prepare("SELECT member_id, COUNT(*) AS n FROM advisor_memory WHERE kind = ? GROUP BY member_id HAVING COUNT(*) > ? LIMIT 20").bind(kind, cap).all()).results || [];
    for (const r of rows) { out.over++; out.clients.push({ kind, cap, n: Number(r.n), subject: String(r.member_id).startsWith("v:") ? "v:" + String(r.member_id).slice(2, 10) + "…" : String(r.member_id) }); }
  }
  if (out.over) console.log("memory caps report", JSON.stringify(out));
  return out;
}
/* the old name (it deleted; now it only reports) */
export const pruneCovered = async env => ({ turns: 0, searches: 0, subjects: 0, report: await capReport(env) });

/* ---------- the job ---------- */
const STEPS = ["tasks", "knowledge", "caps"];
export async function dailyMemory(env, nowMs = Date.now(), { batch = DAY_LIM.batch } = {}) {
  if (!env || !env.DB) return { skipped: "no DB" };
  if (!(await hasTable(env, "advisor_memory")) || !(await hasTable(env, "memory_briefs")) || !(await hasTable(env, "memory_tasks"))) return { skipped: "no 0009 tables" };
  const today = cairoDay(nowMs), D = addDays(today, -1), run = today;
  if (await env.DB.prepare("SELECT 1 AS x FROM cron_runs WHERE job = 'memory-day' AND day = ?").bind(D).first()) return { skipped: "done today" };
  /* the day digests read the summaries this day's consolidation rebuilds: wait until it is closed (memory.js memoryCron) */
  if (!(await env.DB.prepare("SELECT 1 AS x FROM cron_runs WHERE job = 'memory-consolidate' AND day = ?").bind(today).first())) return { day: D, waiting: "consolidation" };
  const from = dayStartIso(D), to = dayAfterIso(D), subj = new Map();
  for (const r of (await env.DB.prepare("SELECT member_id AS subject, MAX(agent) AS agent FROM advisor_memory WHERE at >= ? AND at < ? AND kind IN ('turn', 'summary', 'search', 'fact') GROUP BY member_id LIMIT ?").bind(from, to, DAY_LIM.subjects).all()).results || []) subj.set(r.subject, r.agent === "janna" ? "janna" : "bassem");
  for (const r of (await env.DB.prepare("SELECT subject, MAX(agent) AS agent FROM memory_tasks WHERE (created_at >= ? AND created_at < ?) OR (done_at >= ? AND done_at < ?) GROUP BY subject LIMIT ?").bind(from, to, from, to, DAY_LIM.subjects).all()).results || []) if (!subj.has(r.subject)) subj.set(r.subject, r.agent === "janna" ? "janna" : "bassem");
  /* who is done in THIS run (a marker per client in rl, kept 3 days): the job resumes where the last tick stopped */
  const mark = "memday|" + D + "|" + run + "|", markExp = iso(Date.parse(to) + 3 * 86400000);
  const doneSet = new Set(((await env.DB.prepare("SELECT k FROM rl WHERE k >= ? AND k < ?").bind(mark, mark + "\uffff").all()).results || []).map(r => r.k.slice(mark.length)));
  const todo = [...subj.entries()].filter(([s]) => !doneSet.has(s));
  let digests = 0, briefs = 0, n = 0;
  for (const [s, agent] of todo) {
    if (n >= batch || budgetLeft(env) < TICK.client) break; // the next tick carries on (review #2)
    try {
      if (agent === "janna" && s.startsWith("v:")) await visitorStats(env, s.slice(2), { nowMs }); // the visitor's stats, then the brief reads them
      const d = await buildDay(env, s, agent, D, run, nowMs); if (d) digests++;
      if (await refreshBrief(env, s, agent, D, nowMs)) briefs++;
    } catch (e) { console.error("memory day", (e && e.message) || "error"); }
    await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO NOTHING").bind(mark + s, markExp).run(); // done (or failed: never retried in a loop)
    n++;
  }
  if (todo.length > n) return { day: D, digests, briefs, left: todo.length - n };
  /* the maintenance: each step once per day (its marker «memday|D|run|#step»), only when it fits in this tick's budget */
  const out = { day: D, subjects: subj.size, digests, briefs };
  const left = () => budgetLeft(env);
  for (const k of STEPS) {
    if (doneSet.has("#" + k)) continue;
    if (left() < TICK.step) { out.next_tick = k; return out; }
    try {
      if (k === "tasks") {
        /* the cursor: the last follow / deal task ids checked (rl rows «memtask|follow» / «memtask|deal», n = the id, never expire) */
        const cur = {}; for (const r of (await env.DB.prepare("SELECT k, n FROM rl WHERE k IN ('memtask|follow', 'memtask|deal')").all()).results || []) cur[r.k.slice(8)] = Number(r.n) || 0;
        const r = await maintainTasks(env, nowMs, { left: () => left() - 10, after: cur });
        out.tasks = r;
        if (r && r.after) await env.DB.batch(["follow", "deal"].map(x => env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, ?, '9999-12-31T00:00:00.000Z') ON CONFLICT(k) DO UPDATE SET n = excluded.n").bind("memtask|" + x, Number(r.after[x]) || 0)));
      } else if (k === "knowledge") out.knowledge = await mergeKnowledge(env, nowMs, { left: () => left() - 10 });
      else out.caps = await capReport(env);
    } catch (e) { out[k] = { error: String((e && e.message) || e) }; console.error("memory day " + k, (e && e.stack) || e); }
    await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO NOTHING").bind(mark + "#" + k, markExp).run();
  }
  await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES ('memory-day', ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(D, iso(nowMs)).run();
  return out;
}
export { subjectOf };
