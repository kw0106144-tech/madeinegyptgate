// node --test for the daily memory update (src/daily.js): once per Cairo day after midnight in the platform cron — a day digest per
// client (advisor_memory kind 'day'), «ملخص العميل» (memory_briefs, ≤ 1,500 characters), resumable bounded batches, the cron tick's D1
// budget (review 2026-11-19 #2), no visitor ↔ member links by claimed / unverified contacts (#5 / #6), and no automatic deletion past
// the caps (#13: only a report). No network.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { platformCron } from "../src/index.js";
import { dailyMemory, pruneCovered, capReport, linkVisitorsDaily, DAY_LIM } from "../src/daily.js";
import { LIM, memoryContext, recall, SAID_AR, memoryCron, TICK, budgetEnv, writeMemory } from "../src/memory.js";
import { contactHash } from "../src/visitor.js";
import { dayStartIso } from "../src/acc-base.js";
import { cairoDay, addDays } from "../src/common.js";
import { D1 } from "./helpers.mjs";

const NOW = new Date().toISOString(), nowMs = Date.now(), D = addDays(cairoDay(nowMs), -1);
const atD = h => new Date(Date.parse(dayStartIso(D)) + h * 3600000).toISOString(); // h hours into yesterday (Cairo)
const env0 = () => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-daily-tests" });
const mem = (env, id, kind, callId, at, text, data, hash, agent = "bassem") => env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash, agent) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)")
  .bind(id, kind, callId, at, text, JSON.stringify(data), hash, agent).run();
async function member(env, id, extra = {}) {
  const m = { email: id + "@member.test", plan: "strategic", company: "مجموعة الاختبار للحديد", sector: "الصناعات المعدنية (Metal industries)", governorate: "الجيزة", prefs_json: JSON.stringify({ session_time: "09:30", morning_time: "08:30" }), phone: "", created_at: NOW, ...extra };
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at, sector, governorate, prefs_json, phone) VALUES (?, ?, ?, ?, 1, ?, ?, 'user', '', ?, ?, ?, ?, ?)")
    .bind(id, m.company, m.email, m.plan, m.created_at, NOW, NOW, m.sector, m.governorate, m.prefs_json, m.phone).run();
}
async function seedMember(env, id) {
  await member(env, id);
  await env.DB.prepare("INSERT INTO member_profiles (member_id, profile_json, source, created_at, updated_at) VALUES (?, ?, 'bassem', ?, ?)").bind(id, JSON.stringify({ products: ["حديد تسليح 12 مم"], capacity: "2000 طن شهرياً", target_markets: ["الخليج"] }), NOW, NOW).run();
  await mem(env, id, "summary", "call-d-0001", atD(10), "ملخص 1", { v: 3, final: true, turns: 40, topics: ["مناقصات", "تصدير"], products: ["حديد"], markets: ["السعودية"], opened: [{ title: "توريد حديد تسليح لمحطة مياه", ref: "T-1" }],
    emails: [{ subject: "x", language: "en", sent: false }], deals: ["صفقة جديدة: توريد حديد تسليح"], follows: ["حديد الصلب في الخليج"], next: ["ميعاد الشغل اليومي 09:30"], tools: [] }, "summary|call-d-0001");
  await mem(env, id, "summary", "call-d-0002", atD(15), "ملخص 2", { v: 3, final: true, turns: 10, topics: ["مناقصات"], products: ["حديد"], markets: ["الصين"], emails: [{ subject: "y", language: "zh", sent: true }], tools: [] }, "summary|call-d-0002");
  await mem(env, id, "search", "call-d-0001", atD(10), "حديد تسليح", { tool: "janna_lookup", query: "حديد تسليح", market: "", count: 4, results: [] }, "search|call-d-0001||s1");
  await mem(env, id, "search", "call-d-0002", atD(15), "steel", { tool: "bassem_intel", query: "steel", market: "cn", count: 2, results: [] }, "search|call-d-0002||s2");
  await mem(env, id, "fact", "", atD(11), "طاقتنا 2000 طن في الشهر", {}, "fact|f1");
  await env.DB.prepare("INSERT INTO deals (id, member_id, ref, title, entity, market, stage, next_action, due_date, created_at, updated_at) VALUES ('dd11dd11dd11dd11', ?, 'T-1', 'توريد حديد تسليح لمحطة مياه', 'وزارة الإسكان', 'local', 'offer', 'إرسال عرض السعر', ?, ?, ?)").bind(id, addDays(D, 6), NOW, NOW).run();
  for (const [t, st, src, created, done] of [["فكرني بعرض أسعار الرخام", "open", "request", atD(10), ""], ["هبعتلك ملخص المستوردين في كينيا", "open", "promise", atD(15), ""], ["ابعتلي الكتالوج على الواتساب", "done", "request", atD(10), atD(12)]])
    await env.DB.prepare("INSERT INTO memory_tasks (subject, agent, kind, title, status, source, due, tkey, created_at, updated_at, done_at, call_id) VALUES (?, 'bassem', 'other', ?, ?, ?, '', ?, ?, ?, ?, 'call-d-0001')").bind(id, t, st, src, "k-" + t.length + src, created, created, done).run();
}
const V = "ab".repeat(16);
async function seedVisitor(env) {
  await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls, stage, interest_json) VALUES (?, ?, ?, 1, 'registering', ?)").bind(V, atD(9), atD(9), JSON.stringify({ products: ["بلاستيك"], markets: ["gulf"], plans: ["premium"], questions: ["الباقة المميزة بكام؟"] })).run();
  await mem(env, "v:" + V, "summary", "jc-d-0001", atD(9), "ملخص زيارة", { v: 3, final: true, turns: 6, topics: ["الباقات"], products: ["بلاستيك"], tools: [{ name: "janna_fill_registration", args: { plan: "premium" }, outcome: "ok" }] }, "summary|jc-d-0001", "janna");
}
const dayRow = (env, id) => env.DB.prepare("SELECT * FROM advisor_memory WHERE member_id = ? AND kind = 'day'").bind(id).first();
const brief = (env, id, agent = "bassem") => env.DB.prepare("SELECT * FROM memory_briefs WHERE subject = ? AND agent = ?").bind(id, agent).first();

describe("daily memory: the day digest + «ملخص العميل» (once per Cairo day, after midnight)", () => {
  test("every client with activity yesterday gets a day digest and a brief ≤ 1,500 characters; the gate stops a second run; re-built = the same text", async () => {
    const env = env0(); await seedMember(env, "dm1"); await seedVisitor(env);
    assert.deepEqual(await dailyMemory(env, nowMs), { day: D, waiting: "consolidation" }, "the day digests wait for this day's consolidation (review #2)");
    assert.equal((await memoryCron(env, nowMs)).closed, true);
    const r = await dailyMemory(env, nowMs);
    assert.deepEqual([r.day, r.subjects, r.digests, r.briefs, r.left], [D, 2, 2, 2, undefined], JSON.stringify(r));
    const d = await dayRow(env, "dm1"), dd = JSON.parse(d.data_json);
    assert.equal(d.hash, "day|" + D); assert.equal(d.agent, "bassem"); assert.equal(cairoDay(Date.parse(d.at)), D);
    for (const part of ["مكالمتين", "المواضيع: مناقصات، تصدير", "المنتجات: حديد", "الأسواق: السعودية، الصين", "البحث: حديد تسليح 4 نتيجة، steel (الصين) 2 نتيجة", "اتفتح: توريد حديد تسليح لمحطة مياه",
      "إيميلات: مسودة واحدة وواحد اتبعت", "القرارات: صفقة جديدة: توريد حديد تسليح؛ متابعة حديد الصلب في الخليج؛ ميعاد الشغل اليومي 09:30", "قال: طاقتنا 2000 طن في الشهر", "مهام اتفتحت:", "مهام خلصت: ابعتلي الكتالوج على الواتساب"])
      assert.ok(d.text.includes(part), part + " ← " + d.text);
    assert.deepEqual([dd.calls, dd.turns, dd.emails], [2, 50, { drafts: 1, sent: 1 }]);
    const b = await brief(env, "dm1");
    assert.ok(b.text.length <= DAY_LIM.brief && DAY_LIM.brief === 1500, String(b.text.length));
    for (const part of ["ملخص العميل (اتحدّث", "- مين: مجموعة الاختبار للحديد، الصناعات المعدنية، الجيزة؛ باقة الشريك الاستراتيجي", "- بيصنّع: حديد تسليح 12 مم", "(الطاقة: 2000 طن شهرياً)", "- أسواقه: الخليج",
      "- تاريخه معانا: أول مكالمة", "مكالمتين", "- بيتكلم عن: مناقصات", "- صفقات مفتوحة: توريد حديد تسليح لمحطة مياه (عرض سعر، قبل", "- مهام مفتوحة: 1 — فكرني بعرض أسعار الرخام",
      "- آخر وعود منك (مش متأكد إنها اتعملت): هبعتلك ملخص المستوردين في كينيا", "- تفضيلات: ميعاد الشغل اليومي 09:30، رسالة الصبح 08:30، الإيميلات بـ"])
      assert.ok(b.text.includes(part), part + " ← " + b.text);
    assert.ok(!/@|«|»|dm1/.test(b.text), b.text);
    const vb = await brief(env, "v:" + V, "janna");
    assert.ok(/^ملخص الزائر/.test(vb.text) && vb.text.includes("- المرحلة: بدأ يملا فورم التسجيل ولسه ماكمّلش") && vb.text.includes("- سأل عن: الباقة المميزة بكام؟"), vb.text);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cron_runs WHERE job = 'memory-day' AND day = ?").bind(D).first());
    assert.deepEqual(await dailyMemory(env, nowMs), { skipped: "done today" });
    /* idempotent: the same rows give the same texts */
    const t1 = d.text, b1 = b.text;
    env.DB.db.exec("DELETE FROM cron_runs WHERE job = 'memory-day'"); env.DB.db.exec("DELETE FROM rl WHERE k LIKE 'memday|%'");
    await dailyMemory(env, nowMs);
    assert.deepEqual([(await dayRow(env, "dm1")).text, (await brief(env, "dm1")).text], [t1, b1]);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE kind = 'day'").first("n")), 2, "one digest per client per day");
  });
  test("bounded per run: with batch 1 three clients take three ticks, each built once; then the maintenance and the gate", async () => {
    const env = env0();
    for (const id of ["db1", "db2", "db3"]) { await member(env, id); await mem(env, id, "fact", "", atD(12), "بنصدر رخام للخليج " + id, {}, "f-" + id); }
    await memoryCron(env, nowMs);
    const a = await dailyMemory(env, nowMs, { batch: 1 }), b = await dailyMemory(env, nowMs, { batch: 1 }), c = await dailyMemory(env, nowMs, { batch: 1 });
    assert.deepEqual([a.left, b.left, c.left], [2, 1, undefined], JSON.stringify([a, b, c]));
    assert.ok(c.tasks && c.knowledge && c.caps && !c.links && !c.pruned, JSON.stringify(c));
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE kind = 'day'").first("n"), 3);
    assert.deepEqual(await dailyMemory(env, nowMs, { batch: 1 }), { skipped: "done today" });
  });
  test("the next call reads it: open tasks FIRST, then «ملخص العميل», then the calls; recall «امبارح» starts with the day digest", async () => {
    const env = env0(); await seedMember(env, "dm2");
    await memoryCron(env, nowMs); await dailyMemory(env, nowMs);
    const c = await memoryContext(env, "dm2");
    const iT = c.indexOf("مهام مفتوحة ومواعيدها"), iB = c.indexOf("ملخص العميل (بيتحدّث كل يوم):"), iS = c.indexOf("آخر المكالمات:");
    assert.ok(iT > 0 && iB > iT && iS > iB, c);
    assert.ok(c.includes(SAID_AR + ": هبعتلك ملخص المستوردين في كينيا") && c.includes("- بيصنّع: حديد تسليح 12 مم"), c);
    const r = await recall(env, "dm2", { q: "امبارح", nowMs });
    assert.equal(r.hits[0].kind, "day", JSON.stringify(r.hits.map(h => h.kind)));
    assert.match(r.text, /امبارح \(\d+ \S+\)، ملخص اليوم: يوم \d+ \S+: مكالمتين/);
    const pc = await platformCron(env0(), nowMs);
    assert.ok(pc.memory_day && !pc.memory_day.error, JSON.stringify(pc.memory_day));
  });
  test("review #5 / #6: no visitor ↔ member links by e-mail / mobile hashes (a member's mobile is unverified, a visitor's contact only claimed); the brief reads session links only", async () => {
    const env = env0(), v1 = "cd".repeat(16), v2 = "ef".repeat(16), v3 = "12".repeat(16);
    await member(env, "dl1", { email: "new.owner@factory-example.com", phone: "+201001234567" });
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls, email_hash, interest_json) VALUES (?, ?, ?, 1, ?, ?)").bind(v1, NOW, NOW, await contactHash(env, "email", "New.Owner@factory-example.com"), JSON.stringify({ products: ["أسمنت"] })).run();
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls, phone_hash, interest_json) VALUES (?, ?, ?, 1, ?, ?)").bind(v2, NOW, NOW, await contactHash(env, "phone", "01001234567"), JSON.stringify({ products: ["زجاج"] })).run();
    assert.deepEqual(await linkVisitorsDaily(env), { skipped: "session links only" });
    const rows = (await env.DB.prepare("SELECT visitor_id, member_id, link_via FROM janna_visitors ORDER BY visitor_id").all()).results;
    assert.deepEqual(rows.map(x => [x.member_id, x.link_via]), [["", ""], ["", ""]], "nothing linked by a hash match");
    /* a claimed link made by an older Worker (link_via 'phone') never reaches the member's brief; his own signed-in link does */
    await env.DB.prepare("UPDATE janna_visitors SET member_id = 'dl1', link_via = 'phone' WHERE visitor_id = ?").bind(v2).run();
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls, member_id, link_via, interest_json) VALUES (?, ?, ?, 2, 'dl1', 'session', ?)").bind(v3, NOW, NOW, JSON.stringify({ products: ["رخام"] })).run();
    await mem(env, "dl1", "fact", "", atD(12), "بنصدر رخام", {}, "f-dl1");
    await memoryCron(env, nowMs); await dailyMemory(env, nowMs);
    const b = await brief(env, "dl1");
    assert.ok(b && b.text.includes("قبل ما يبقى عضو: اتكلم مع جنة مرتين") && b.text.includes("رخام") && !b.text.includes("زجاج"), b && b.text);
  });
});

describe("daily memory: the cron tick's D1 budget (review 2026-11-19 #2)", () => {
  test("a busy night: every tick stays within TICK.budget memory statements; the consolidation resumes tick after tick and closes its gate only when done; the digests wait for it", async () => {
    const env = env0(), stats = { n: 0 };
    const wrap = st => ({ bind: (...a) => wrap(st.bind(...a)), first: (...a) => { stats.n++; return st.first(...a); }, all: (...a) => { stats.n++; return st.all(...a); }, run: (...a) => { stats.n++; return st.run(...a); }, _st: st });
    const counted = { ...env, DB: { prepare: sql => wrap(env.DB.prepare(sql)), batch: l => { stats.n += l.length; return env.DB.batch(l.map(x => x._st || x)); }, exec: s => env.DB.exec(s), db: env.DB.db } };
    const day = addDays(cairoDay(nowMs), 1), next = Date.parse(dayStartIso(day)) + 5 * 60000; // the ticks: from 00:05 Cairo tomorrow (as in production)
    const t0 = next - 8 * 3600000; // the calls of this evening, none with its final summary (tabs closed)
    for (let i = 0; i < 45; i++) {
      const vid = (i.toString(16).padStart(2, "0")).repeat(16), subj = "v:" + vid;
      await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, lang) VALUES (?, ?, ?, 'ar')").bind(vid, new Date(t0).toISOString(), new Date(t0).toISOString()).run();
      const turns = []; for (let k = 0; k < 24; k++) turns.push({ role: k % 2 ? "persona" : "user", text: k % 2 ? "أكيد، الباقة المميزة بخمسة وعشرين ألف جنيه في السنة." : "الباقة المميزة بكام؟ " + k, seq: k });
      await writeMemory(env, subj, { kind: "turns", call_id: "jc-budget-" + i, turns }, { nowMs: t0 + i * 1000, agent: "janna", lang: "ar" });
    }
    const ticks = [];
    for (let k = 0; k < 20; k++) {
      stats.n = 0;
      const o = await platformCron(counted, next + k * 900000);
      ticks.push({ n: stats.n, memory: o.memory, day: o.memory_day });
      if (o.memory_day && o.memory_day.skipped === "done today") break;
    }
    const rebuilt = ticks.reduce((a, t) => a + ((t.memory && t.memory.rebuilt) || 0), 0);
    assert.equal(rebuilt, 45, JSON.stringify(ticks.map(t => t.memory)));
    assert.ok(ticks[0].memory.left > 0 && !ticks[0].memory.closed, "the first tick stops at its budget / rebuild cap: " + JSON.stringify(ticks[0].memory));
    assert.deepEqual(ticks[0].day, { skipped: "consolidation ran in this tick" });
    for (const t of ticks) assert.ok(t.n <= TICK.budget + 80, "statements in one tick: " + t.n + " " + JSON.stringify(t.memory));
    if (process.env.MEM_BUDGET_LOG) console.log(JSON.stringify(ticks.map(t => ({ n: t.n, memory: t.memory, day: t.day }))));
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cron_runs WHERE job = 'memory-consolidate' AND day = ?").bind(day).first());
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE kind = 'summary'").first("n"), 45);
    /* budgetEnv counts batches statement by statement and stops a job before the budget */
    const be = budgetEnv(env, 5); await be.DB.batch([be.DB.prepare("SELECT 1"), be.DB.prepare("SELECT 2")]); await be.DB.prepare("SELECT 3").first();
    assert.deepEqual([be.DB.used, be.DB.left()], [3, 2]);
  });
});

describe("daily memory: no automatic deletion past the caps (owner's policy; review 2026-11-19 #13)", () => {
  test("caps ≥ 50,000 turns / 10,000 searches; past a cap the client is only REPORTED — every turn, summary, fact and digest stays", async () => {
    assert.ok(LIM.turnsCap >= 50000 && LIM.searchesCap >= 10000);
    const env = env0(), id = "pv1", old = n => new Date(nowMs - n * 86400000).toISOString(), cov = cairoDay(nowMs - 40 * 86400000);
    env.DB.db.exec("BEGIN");
    const ins = env.DB.db.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash) VALUES (?, ?, ?, ?, ?, '', '{}', ?)");
    for (let i = 0; i < 30; i++) ins.run(id, "turn", "c-old", old(40), "قديم ومتلخص " + i, "c" + i);
    for (let i = 0; i < LIM.turnsCap - 20; i++) ins.run(id, "turn", "c-new", NOW, "جديد " + i, "n" + i);
    ins.run(id, "summary", "c-old", old(40), "ملخص", "summary|c-old"); ins.run(id, "fact", "", old(40), "معلومة", "fact|x");
    env.DB.db.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash) VALUES (?, 'day', '', ?, 'يوم', '', ?, ?)").run(id, old(40), JSON.stringify({ day: cov }), "day|" + cov);
    env.DB.db.exec("COMMIT");
    const count = () => env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id = ?").bind(id).first("n");
    const before = await count();
    const r = await capReport(env);
    assert.deepEqual([r.over, r.clients[0].kind, r.clients[0].n, r.clients[0].subject], [1, "turn", LIM.turnsCap + 10, id], JSON.stringify(r));
    const p = await pruneCovered(env, nowMs);
    assert.deepEqual([p.turns, p.searches, p.subjects], [0, 0, 0], "the old name deletes nothing any more");
    assert.equal(await count(), before, "nothing deleted");
    /* the Worker variable may only RAISE the cap */
    const env2 = env0(); env2.MEMORY_TURN_CAP = "10";
    await env2.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash) VALUES ('pv2', 'turn', 'c', ?, 'x', '', '{}', 'h1')").bind(old(40)).run();
    assert.equal((await capReport(env2)).over, 0);
  });
});
