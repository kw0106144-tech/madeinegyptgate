// node --test for migration 0009 and the ONLY memory erasure (owner's memory policy 2026-11-18): the owner's audited Control Center
// action for a formal legal data-subject request (POST /api/admin/cc/memory/erase, src/acc-memory.js) and the account deletion's
// cascade (src/acc-members.js deleteMember). No network.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { issueSession } from "../src/auth.js";
import { deleteMember } from "../src/acc-members.js";
import { contactHash } from "../src/visitor.js";
import { askerHash } from "../src/knowledge.js";
import { MEMBER_ROLE, OWNER_ONLY } from "../src/acc-base.js";
import { D1 } from "./helpers.mjs";

const SITE = "https://madeinegyptgate.com", NOW = new Date().toISOString();
const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const MIG = read("migrations/0009_memory_upgrades.sql");
const env0 = () => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-erase-tests", ADMIN_EMAILS: "owner@mig.test" });
async function member(env, id, { email = id + "@member.test", plan = "strategic", staff = "" } = {}) {
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at) VALUES (?, 'Test Co', ?, ?, 1, ?, ?, ?, '', ?)").bind(id, email, plan, NOW, NOW, staff ? MEMBER_ROLE[staff] : "user", NOW).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES (?, ?, ?, ?)").bind(id, staff, NOW, NOW).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m, { scope: "full" })).token };
}
async function erase(env, token, body) {
  const res = await worker.fetch(new Request(SITE + "/api/admin/cc/memory/erase", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.90" }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data };
}
const V1 = "aa".repeat(16), V2 = "bb".repeat(16);
async function seed(env, id) {
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).run();
  for (const [sub, agent, h] of [[id, "bassem", "t1"], [id, "bassem", "f1"], ["v:" + V1, "janna", "t2"], ["v:" + V2, "janna", "t3"]])
    await q("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash, agent) VALUES (?, 'fact', '', ?, 'معلومة', '', '{}', ?, ?)", sub, NOW, h, agent);
  await q("INSERT INTO memory_tasks (subject, agent, kind, title, status, source, tkey, created_at, updated_at) VALUES (?, 'bassem', 'other', 'مهمة', 'open', 'request', 'k1', ?, ?)", id, NOW, NOW);
  await q("INSERT INTO memory_tasks (subject, agent, kind, title, status, source, tkey, created_at, updated_at) VALUES (?, 'janna', 'register', 'يكمّل التسجيل', 'open', 'tool', 'k2', ?, ?)", "v:" + V1, NOW, NOW);
  await q("INSERT INTO memory_briefs (subject, agent, text, day, updated_at) VALUES (?, 'bassem', 'ملخص العميل', '', ?)", id, NOW);
  await q("INSERT INTO janna_visitors (visitor_id, member_id, link_via, first_at, last_at, email_hash) VALUES (?, ?, 'session', ?, ?, ?)", V1, id, NOW, NOW, await contactHash(env, "email", id + "@member.test"));
  await q("INSERT INTO janna_visitors (visitor_id, member_id, first_at, last_at, email_hash) VALUES (?, '', ?, ?, ?)", V2, NOW, NOW, await contactHash(env, "email", "someone@visitor-example.com"));
  await q("INSERT INTO knowledge_bank (qkey, question, intent, terms, answer, status, first_at, last_at, data_json) VALUES ('q1', 'سؤال؟', 'other', '', '', 'needs_answer', ?, ?, ?)", NOW, NOW, JSON.stringify({ seen: [await askerHash(env, id), "zz"] }));
}
const n = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first("n");

describe("migration 0009", () => {
  test("purely additive and idempotent (CREATE … IF NOT EXISTS only), appended to schema.sql, the CHECKs hold", () => {
    const db = new D1().db;
    for (let i = 0; i < 2; i++) db.exec(MIG);
    assert.ok(!/^\s*(ALTER|DROP|UPDATE|DELETE|INSERT|REPLACE)\b/im.test(MIG));
    const stmts = MIG.replace(/--[^\n]*/g, "").split(";").map(x => x.trim()).filter(Boolean);
    assert.equal(stmts.length, 15); assert.ok(stmts.every(x => /^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS /.test(x)), stmts.find(x => !/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS /.test(x)));
    const schema = read("schema.sql");
    assert.ok(schema.includes(MIG.trim()), "appended verbatim"); assert.ok(schema.includes("migrations/0009_memory_upgrades.sql"), "in the launch order");
    const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    assert.deepEqual(cols("memory_tasks"), ["id", "subject", "agent", "kind", "title", "status", "source", "due", "call_id", "ref", "tkey", "created_at", "updated_at", "done_at", "done_by", "data_json"]);
    assert.deepEqual(cols("janna_visitors").slice(0, 6), ["visitor_id", "member_id", "link_via", "linked_at", "email_hash", "phone_hash"]);
    assert.ok(!cols("janna_visitors").some(c => /^(email|phone|name)$/.test(c)), "no e-mail / phone / name column: hashes only");
    assert.ok(!cols("knowledge_bank").some(c => /member|visitor|call/.test(c)), "the knowledge bank never names who asked");
    assert.throws(() => db.prepare("INSERT INTO memory_tasks (subject, title, status, tkey, created_at, updated_at) VALUES ('m', 't', 'deleted', 'k', 'x', 'x')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO knowledge_bank (qkey, question, status, first_at, last_at) VALUES ('k', 'q', 'gone', 'x', 'x')").run(), /CHECK/);
  });
});

describe("the owner's legal erasure: POST /api/admin/cc/memory/erase (members.delete ∈ OWNER_ONLY)", () => {
  test("owner only; a legal reason, ONE person and the confirmation are required; dry run = counts only; then everything of that person goes with one audit row", async () => {
    const env = env0(); await member(env, "me1"); await seed(env, "me1");
    const own = await member(env, "boss", { email: "owner@mig.test", plan: "visitor" }), adm = await member(env, "adm1", { plan: "visitor", staff: "admin" });
    assert.ok(OWNER_ONLY.has("members.delete"));
    const a = await erase(env, adm.token, { member_id: "me1", reason: "طلب رسمي من صاحب البيانات رقم 12", confirm: "me1@member.test" });
    assert.deepEqual([a.status, a.data.code], [403, "owner_only"]);
    assert.equal((await erase(env, own.token, { member_id: "me1", confirm: "me1@member.test" })).data.code, "reason_required");
    assert.equal((await erase(env, own.token, { member_id: "me1", reason: "مسح", confirm: "me1@member.test" })).data.code, "reason_required", "a word is no legal reason");
    assert.equal((await erase(env, own.token, { member_id: "me1", visitor_id: V2, reason: "طلب رسمي من صاحب البيانات رقم 12", confirm: "me1@member.test" })).data.code, "one_subject", "never bulk");
    assert.equal((await erase(env, own.token, { member_id: "me1", reason: "طلب رسمي من صاحب البيانات رقم 12", confirm: "x@y.z" })).data.code, "confirm_required");
    const dry = await erase(env, own.token, { member_id: "me1", reason: "طلب رسمي من صاحب البيانات رقم 12", confirm: "me1@member.test", dry_run: true });
    assert.equal(dry.status, 200, JSON.stringify(dry.data));
    assert.deepEqual(dry.data.counts, { memory_rows: 3, tasks: 2, briefs: 1, visitors: 1, knowledge_askers: 1, knowledge_removed: 0 });
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM cc_audit WHERE action = 'memory.erase'"), 0);
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM advisor_memory"), 4, "a dry run erases nothing");
    const r = await erase(env, own.token, { member_id: "me1", reason: "طلب رسمي من صاحب البيانات رقم 12 (قانون 151 لسنة 2020)", confirm: "ME1@member.test" });
    assert.deepEqual([r.status, r.data.erased.memory_rows, r.data.erased.visitors], [200, 3, 1], JSON.stringify(r.data));
    assert.deepEqual([await n(env, "SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id IN ('me1', 'v:" + V1 + "')"), await n(env, "SELECT COUNT(*) AS n FROM memory_tasks"), await n(env, "SELECT COUNT(*) AS n FROM memory_briefs"),
      await n(env, "SELECT COUNT(*) AS n FROM janna_visitors WHERE visitor_id = ?", V1)], [0, 0, 0, 0]);
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id = ?", "v:" + V2), 1, "another visitor is untouched");
    assert.ok(await env.DB.prepare("SELECT id FROM members WHERE id = 'me1'").first(), "the account itself stays (that is the account deletion)");
    const kb = JSON.parse(await env.DB.prepare("SELECT data_json FROM knowledge_bank WHERE qkey = 'q1'").first("data_json"));
    assert.deepEqual(kb.seen, ["zz"], "his keyed hash left the asker list; the anonymous question stays");
    const au = await env.DB.prepare("SELECT * FROM cc_audit WHERE action = 'memory.erase'").first();
    assert.deepEqual([au.actor_role, au.target_type, au.target_id], ["owner", "member", "me1"]);
    assert.ok(au.summary.includes("legal request: طلب رسمي") && JSON.parse(au.after_json).reason.startsWith("طلب رسمي"), au.summary);
    assert.equal((await erase(env, own.token, { member_id: "me1", reason: "طلب رسمي من صاحب البيانات رقم 12", confirm: "me1@member.test" })).data.code, "nothing_to_erase");
  });
  test("a visitor (no account): by the e-mail he gave Janna (its keyed hash) — only the visitor ids the owner CONFIRMS (review 2026-11-19 #12) — or by the visitor id; the audit never holds the address", async () => {
    const env = env0(); await member(env, "me2"); await seed(env, "me2");
    const own = await member(env, "boss", { email: "owner@mig.test", plan: "visitor" });
    /* a claimed e-mail can be shared (a company address): a second visitor gave the same one */
    const V3 = "cd".repeat(16);
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, member_id, first_at, last_at, email_hash) VALUES (?, '', ?, ?, ?)").bind(V3, NOW, NOW, await contactHash(env, "email", "someone@visitor-example.com")).run();
    await env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, terms, data_json, hash, agent) VALUES (?, 'fact', '', ?, 'معلومة', '', '{}', 'h-v3', 'janna')").bind("v:" + V3, NOW).run();
    const body = { visitor_email: "Someone@visitor-example.com", reason: "طلب رسمي بالمسح من الزائر بالإيميل", confirm: "someone@visitor-example.com" };
    const dry = await erase(env, own.token, { ...body, dry_run: true });
    assert.deepEqual([dry.status, dry.data.matches.map(m => m.visitor_id).sort()], [200, [V2, V3].sort()], JSON.stringify(dry.data));
    const no = await erase(env, own.token, body);
    assert.deepEqual([no.status, no.data.code, no.data.matches.length], [400, "visitor_ids_required", 2], "never «every id with that e-mail»");
    assert.equal((await erase(env, own.token, { ...body, visitor_ids: ["ee".repeat(16)] })).status, 400, "only ids the e-mail leads to");
    const r = await erase(env, own.token, { ...body, visitor_ids: [V2] });
    assert.deepEqual([r.status, r.data.erased.memory_rows, r.data.erased.visitors, r.data.subject.type], [200, 1, 1, "visitor"], JSON.stringify(r.data));
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id = ?", "v:" + V3), 1, "the other visitor who gave the same e-mail keeps his memory");
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM janna_visitors WHERE visitor_id = ?", V2), 0);
    assert.ok(!JSON.stringify((await env.DB.prepare("SELECT * FROM cc_audit WHERE action = 'memory.erase'").all()).results).includes("visitor-example"));
    assert.equal((await erase(env, own.token, { visitor_id: "nothex", reason: "طلب رسمي بالمسح من الزائر", confirm: "nothex" })).status, 400);
    assert.equal((await erase(env, own.token, { visitor_id: "cc".repeat(16), reason: "طلب رسمي بالمسح من الزائر", confirm: "cc".repeat(16) })).status, 404);
  });
});

describe("the account deletion (deleteMember) takes the 0009 memory too", () => {
  const adm = env => ({ actor: { actor_id: "boss", actor_email: "owner@mig.test", actor_role: "owner" },
    auditStmt: (a, tt, id, b, af, sm) => env.DB.prepare("INSERT INTO cc_audit (at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id) VALUES (?, 'boss', 'owner@mig.test', 'owner', ?, ?, ?, ?, ?, '{}', '', 'r')").bind(NOW, a, tt, id, sm, JSON.stringify(b)) });
  const del = (env, id, reason) => deleteMember(new Request(SITE + "/x", { method: "DELETE", body: JSON.stringify({ confirm: id + "@member.test", ...(reason ? { reason } : {}) }), headers: { "Content-Type": "application/json" } }), env, {}, adm(env), id);
  test("tasks only → a legal reason is still required; then tasks, brief, Janna's memory of his linked visitor ids go; the summary names them", async () => {
    const env = env0(); await member(env, "md1"); await seed(env, "md1");
    env.DB.db.exec("DELETE FROM advisor_memory WHERE member_id = 'md1'");
    await assert.rejects(del(env, "md1", ""), e => e.code === "reason_required" && e.extra.tasks === 2 && e.extra.janna_visitors === 1 && e.extra.memory_rows === 1);
    await del(env, "md1", "طلب رسمي من صاحب البيانات بالمسح رقم 9");
    assert.deepEqual([await n(env, "SELECT COUNT(*) AS n FROM memory_tasks"), await n(env, "SELECT COUNT(*) AS n FROM memory_briefs"), await n(env, "SELECT COUNT(*) AS n FROM janna_visitors WHERE member_id = 'md1'"),
      await n(env, "SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id = ?", "v:" + V1)], [0, 0, 0, 0]);
    const s = await env.DB.prepare("SELECT summary FROM cc_audit WHERE action = 'member.delete' AND target_id = 'md1'").first("summary");
    assert.match(s, /Bassem memory erased \(1 rows \+ 2 tasks \+ Janna visitor memory \(1\) \+ knowledge bank \(1 asker lists, 0 entries\)\) · legal request: طلب رسمي/);
    /* review 2026-11-19 #11: his keyed asker hash left «بنك المعلومات» too (the API erasure did, the account deletion did not) */
    assert.deepEqual(JSON.parse(await env.DB.prepare("SELECT data_json FROM knowledge_bank WHERE qkey = 'q1'").first("data_json")).seen, ["zz"]);
  });
  test("review 2026-11-19 #8 / #11: an entry ONLY he asked leaves «بنك المعلومات» with him (account deletion and the API erasure alike); one others asked stays without his hash", async () => {
    const env = env0(); await member(env, "md2"); await seed(env, "md2");
    const h = await askerHash(env, "md2");
    await env.DB.prepare("INSERT INTO knowledge_bank (qkey, question, intent, terms, answer, status, subjects, first_at, last_at, data_json) VALUES ('q2', 'أنا محمد السيد مدير التصدير، ينفع نصدّر؟', 'export', ' نصدر ', '', 'needs_answer', 1, ?, ?, ?)").bind(NOW, NOW, JSON.stringify({ seen: [h] })).run();
    await env.DB.prepare("INSERT INTO knowledge_bank (qkey, question, intent, terms, answer, status, subjects, merged_into, first_at, last_at, data_json) VALUES ('q3', 'ينفع أصدّر؟', 'export', ' اصدر ', '', 'needs_answer', 1, (SELECT id FROM knowledge_bank WHERE qkey = 'q2'), ?, ?, ?)").bind(NOW, NOW, JSON.stringify({ seen: ["yy"] })).run();
    await del(env, "md2", "طلب رسمي من صاحب البيانات بالمسح رقم 10");
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM knowledge_bank WHERE qkey = 'q2'"), 0, "his own entry is gone");
    assert.equal(await n(env, "SELECT COUNT(*) AS n FROM knowledge_bank WHERE qkey = 'q3' AND merged_into = 0"), 1, "an entry merged into it comes back on its own");
    assert.deepEqual(JSON.parse(await env.DB.prepare("SELECT data_json FROM knowledge_bank WHERE qkey = 'q1'").first("data_json")).seen, ["zz"]);
  });
});
