// U18 (2026-11-20): what a call's greeting leaves in the memory. 685cdbfb opened with «سأل عن: مدايق؛ عاملين؛ زيكي؛ جنه» (the greeting and
// the «how are you» exchange became the visitor's topics), and 9948fb37 (17 s, only Janna's greeting) made the next call, 25 s later in
// the same browser, start with «أهلاً بيك تاني». Now: greeting / status words and the persona names are no topics, the visitor's short
// turns before the first tool call are no topics, and a call where the client said nothing (no search, no tool) is no visit — no summary.
// D1 = node:sqlite with the real schema (test/helpers.mjs); Anam is never called.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { buildSummary, consolidateDay, memoryCron } from "../src/memory.js";
import { jannaSessionContext, RETURN_GREETING } from "../src/visitor.js";
import { issueSession } from "../src/auth.js";
import { D1 } from "./helpers.mjs";

const SITE = "https://madeinegyptgate.com";
const GREET = "أهلاً وسهلاً بيك في منصة صنع في مصر! أنا جنة، مسؤولة التسجيل في المنصة. إزي حضرتك؟ وأخبارك إيه النهارده؟";
const vid = c => c.repeat(32).slice(0, 32);
let ipN = 1;
async function vmem(env, body) {
  const res = await worker.fetch(new Request(SITE + "/api/janna/memory", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113." + (ipN++ % 200 + 1), Origin: SITE, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const summaries = (env, subject) => env.DB.prepare("SELECT * FROM advisor_memory WHERE member_id = ? AND kind = 'summary'").bind(subject).all().then(r => r.results);
const ctxFor = (env, v) => jannaSessionContext(env, new Request(SITE + "/api/janna/session", { method: "POST" }), { visitor_id: v }, "ar");

describe("U18: the greeting is no topic", () => {
  test("a greeting, a «how are you», one «حديد» search: the topics hold only the search's words", () => {
    const turns = [
      { role: "persona", text: GREET, seq: 0 },
      { role: "user", text: "أهلاً يا جنة، عاملين إيه؟ زيكي؟", seq: 1 },
      { role: "persona", text: "الحمد لله تمام، إزيك إنت؟", seq: 2 },
      { role: "user", text: "مدايق شوية بس الحمد لله", seq: 3 },
      { role: "user", text: "عايز مصانع حديد", seq: 4 },
      { role: "persona", text: "ثواني بدوّرلك على مصانع الحديد في الدليل.", seq: 5 },
    ];
    const s = buildSummary({ callId: "jc-greet-0001", turns, searches: [{ tool: "janna_lookup", query: "حديد", count: 157, results: [{ title: "الشركة العربية للصناعات الحديدية" }] }],
      tools: [{ name: "janna_lookup", args: { section: "factories", query: "حديد" }, outcome: "ok", s: 5 }], final: true });
    for (const w of ["مدايق", "عاملين", "عامل", "زيكي", "جنه", "جنة", "مسؤولة", "الحمد", "شوية", "اهلا", "أهلاً"]) {
      assert.ok(!s.topics.some(t => t.includes(w)), w + " in " + s.topics.join("، ")); assert.ok(!s.text.includes(w), w + " in " + s.text);
    }
    const searchWords = ["حديد"];
    for (const t of s.topics) assert.ok(searchWords.some(w => t.includes(w)), "a topic that is not the search's: " + t);
    assert.ok(s.products.includes("حديد") || s.topics.some(t => t.includes("حديد")), JSON.stringify(s));
    assert.match(s.text, /البحث: حديد 157 نتيجة/);
  });
  test("a short turn before the first tool call is no topic; the same word in the talk after it is", () => {
    const tools = [{ name: "janna_lookup", args: { section: "factories", query: "زجاج" }, outcome: "ok", s: 2 }];
    const early = buildSummary({ callId: "jc-greet-0002", turns: [{ role: "user", text: "أنا كريم من الصعيد", seq: 1 }, { role: "user", text: "عايز مصانع زجاج", seq: 3 }], searches: [], tools });
    assert.ok(!early.topics.some(t => /صعيد/.test(t)), early.topics.join("، "));
    const later = buildSummary({ callId: "jc-greet-0003", turns: [{ role: "user", text: "أنا كريم من الصعيد", seq: 1 }, { role: "user", text: "المصنع بتاعنا في الصعيد وبنوزع على محافظات الصعيد كلها", seq: 3 }], searches: [], tools });
    assert.ok(later.topics.some(t => /صعيد/.test(t)), later.topics.join("، "));
    /* no tool records their turn number (an older page): nothing is left out */
    const old = buildSummary({ callId: "jc-greet-0004", turns: [{ role: "user", text: "أنا كريم من الصعيد", seq: 1 }], searches: [], tools: [{ name: "janna_lookup", args: { query: "زجاج" } }] });
    assert.ok(old.topics.some(t => /صعيد/.test(t)), old.topics.join("، "));
  });
});

describe("U18: a call where the visitor said nothing is no visit", () => {
  test("only Janna's greeting: no summary, and the next session gets the new-visitor greeting (no «أهلاً بيك تاني»)", async () => {
    const env = { DB: new D1() }, v = vid("9e");
    assert.equal((await vmem(env, { visitor_id: v, kind: "turns", call_id: "jc-9948fb37-0001", turns: [{ role: "persona", text: GREET, seq: 0 }] })).status, 201);
    const s = await vmem(env, { visitor_id: v, kind: "summary", call_id: "jc-9948fb37-0001", final: true, tools: [], lang: "ar" });
    assert.equal(s.status, 201); assert.deepEqual([s.data.summary, s.data.skipped], [null, "no_client_words"]);
    assert.equal((await summaries(env, "v:" + v)).length, 0);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id = ? AND kind = 'turn'").bind("v:" + v).first("n")), 1, "the turns stay stored");
    const ctx = await ctxFor(env, v);
    assert.ok(!ctx || !ctx.greeting, "a new visitor's greeting: " + JSON.stringify(ctx));
    /* the visitor speaks in the next call: that one is a visit, and the call after it is greeted as a return */
    await vmem(env, { visitor_id: v, kind: "turns", call_id: "jc-355f37e9-0002", turns: [{ role: "persona", text: GREET, seq: 0 }, { role: "user", text: "عايز أعرف الباقات بكام", seq: 1 }] });
    const s2 = await vmem(env, { visitor_id: v, kind: "summary", call_id: "jc-355f37e9-0002", final: true, tools: [], lang: "ar" });
    assert.ok(s2.data.summary, JSON.stringify(s2.data));
    assert.equal((await ctxFor(env, v)).greeting, RETURN_GREETING.ar);
  });
  test("a greeting-only call with a tool that ran, or a search, is still remembered", async () => {
    const env = { DB: new D1() }, v = vid("7c");
    await vmem(env, { visitor_id: v, kind: "turns", call_id: "jc-tool-only-0001", turns: [{ role: "persona", text: GREET, seq: 0 }] });
    const s = await vmem(env, { visitor_id: v, kind: "summary", call_id: "jc-tool-only-0001", final: true, tools: [{ name: "janna_navigate", args: { page: "register" }, outcome: "ok", s: 1 }], lang: "ar" });
    assert.ok(s.data.summary); assert.equal((await summaries(env, "v:" + v)).length, 1);
  });
  test("the nightly consolidation builds no summary for it either; Bassem's calls follow the same rule", async () => {
    const env = { DB: new D1() }, v = vid("5d"), t = Date.now() - 3 * 3600000;
    await vmem(env, { visitor_id: v, kind: "turns", call_id: "jc-greet-only-0009", turns: [{ role: "persona", text: GREET, seq: 0 }] });
    await env.DB.prepare("UPDATE advisor_memory SET at = ? WHERE member_id = ?").bind(new Date(t).toISOString(), "v:" + v).run();
    const r = await consolidateDay(env, Date.now());
    assert.equal(r.calls, 0, "a call with no client turn and no search is not even picked: " + JSON.stringify(r)); assert.equal((await summaries(env, "v:" + v)).length, 0);
    /* Bassem: a member's call with only his greeting */
    const NOWI = new Date().toISOString();
    await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at) VALUES ('mg1', 'Test Co', 'mg1@member.test', 'strategic', 1, ?, ?, 'user', '', ?)").bind(NOWI, NOWI, NOWI).run();
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = 'mg1'").first(), token = (await issueSession({ ...env, ADVISOR_SECRET: "adv-secret-u18" }, m, { scope: "full" })).token;
    const benv = { ...env, ADVISOR_SECRET: "adv-secret-u18" };
    const res = await worker.fetch(new Request(SITE + "/api/advisor/memory", { method: "POST", headers: { "CF-Connecting-IP": "198.51.100.77", Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "summary", call_id: "bc-greet-only-0001", final: true, turns: [{ role: "persona", text: "أهلاً يا باشمهندس، أنا باسم.", seq: 0 }] }) }), benv, { waitUntil() {} });
    const j = await res.json();
    assert.equal(res.status, 201, JSON.stringify(j)); assert.equal(j.summary, null); assert.equal((await summaries(env, "mg1")).length, 0);
  });
  test("review: 25 greeting-only calls do not hold the day open — the real call is consolidated in the first tick and the gate closes", async () => {
    const env = { DB: new D1() }, now = Date.now(), at = ms => new Date(ms).toISOString();
    const turn = (mid, call, role, text, seq, ms) => env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, agent, text, terms, data_json, hash) VALUES (?, 'turn', ?, ?, 'janna', ?, '', ?, ?)")
      .bind(mid, call, at(ms), text, JSON.stringify({ role, seq }), "turn|" + call + "|" + seq).run();
    await turn("v:" + vid("a1"), "jc-real-call-0001", "persona", GREET, 0, now - 6 * 3600000);
    await turn("v:" + vid("a1"), "jc-real-call-0001", "user", "عايز مصانع كرتون في الجيزة", 1, now - 6 * 3600000 + 5000);
    for (let k = 0; k < 25; k++) await turn("v:" + String(k).padStart(2, "0").repeat(16), "jc-greet-only-" + String(k).padStart(4, "0"), "persona", GREET, 0, now - 2 * 3600000 - k * 60000);
    const r = await memoryCron(env, now);
    assert.deepEqual([r.calls, r.rebuilt, r.left, r.closed], [1, 1, 0, true], JSON.stringify(r));
    assert.equal((await summaries(env, "v:" + vid("a1"))).length, 1);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM advisor_memory WHERE kind = 'summary'").first("n")), 1, "no summary for the greeting-only calls");
  });
});
