// node --test for the start of a live call (owner 2026-11-19: «باسم بياخد وقت» — the call screen stayed on «بنوصّلك بباسم…»):
// POST /api/janna/session reads the saved persona BESIDE the member's D1 context (not after it), Bassem's memory block reads its seven
// tables together, the continuation and the factory profile are read together, and the answer says where the time went (Server-Timing,
// milliseconds only). Anam is never called: fetch is mocked (persona read + token endpoint only). Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { ANAM_TOKEN_URL, ANAM_PERSONA_URL, serverTiming, bassemContext } from "../src/janna-session.js";
import { memoryContext } from "../src/memory.js";
import { issueSession } from "../src/auth.js";
import { D1 } from "./helpers.mjs";

const SITE = "https://madeinegyptgate.com";
const KEY = "anam-test-key-5b0c7e2d91"; // fake: never a real key
const BASSEM = "19ef9078-5252-42a4-bbdf-9a3c4a38a4be", JANNA = "5f06d835-22cc-4460-b412-84cefa9e565b";
const NOW = new Date().toISOString();
const T1 = "069b8454-72b5-422d-9c30-06a815cee87f";
const persona = id => ({ id, name: "باسم · Bassem", avatar: { id: "78696fe3-047a-4aca-95cf-04d5bedef9e1" }, avatarModel: "cara-4-latest", voice: { id: "abe9e502-2b89-4ce0-9166-86f61ad7a765" },
  voiceSpeed: null, llmId: "058aba1a-b097-4beb-abc8-51c74835f5e8", brain: { systemPrompt: "اسمك «باسم».\n" }, languageCode: "ar", enableAudioPassthrough: false, skipGreeting: false,
  uninterruptibleGreeting: false, initialMessage: "أهلاً بيك يا فندم", zeroDataRetention: false, maxSessionLengthSeconds: null, directorNotes: { presetStyle: "warm" },
  voiceDetectionOptions: { sttProvider: "anam", endOfSpeechSensitivity: 0.45 }, toolIds: [T1], tools: [{ type: "client", name: "janna_follow", _toolId: T1 }] });

let calls, realFetch, onPersona;
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
function mockAnam({ persona: p, token } = {}) {
  calls = [];
  onPersona = p || (u => okJson(persona(u.endsWith(BASSEM) ? BASSEM : JANNA)));
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), c = { url: u, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null };
    calls.push(c);
    if (u.startsWith(ANAM_PERSONA_URL) && c.method === "GET") return onPersona(u, init);
    if (u === ANAM_TOKEN_URL && c.method === "POST") return token ? token(c) : okJson({ sessionToken: "tok-" + calls.length });
    throw new Error("unexpected fetch " + c.method + " " + u);
  };
}
beforeEach(() => { realFetch = globalThis.fetch; mockAnam(); });
afterEach(() => { globalThis.fetch = realFetch; });
const env0 = extra => ({ DB: new D1(), ANAM_API_KEY: KEY, ADVISOR_SECRET: "adv-secret-for-tests", ...(extra || {}) });
let ipN = 1;
async function call(env, body, token) {
  const h = { "CF-Connecting-IP": "198.51.100." + (ipN++ % 250), Origin: SITE, "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const res = await worker.fetch(new Request(SITE + "/api/janna/session", { method: "POST", headers: h, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { /* empty */ }
  return { status: res.status, data, text, headers: res.headers };
}
const DR = { id: "ua825acd9b77fbf7d", email: "dr.member@co.test", plan: "strategic", name: "محمد الحسيني", title: "دكتور", company: "مجموعة الحسيني – ELhouseni Group", sector: "الصناعات التكنولوجية (Technology industries)", plan_expires: "2099-01-01T00:00:00.000Z" };
async function member(env, f) {
  const m = { role: "user", verified: 1, name: "", title: "", company: "", sector: "", phone: "", plan_expires: "", ...f };
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at, name, title, phone, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(m.id, m.company, m.email, m.plan, m.verified, NOW, NOW, m.role, m.plan_expires, NOW, m.name, m.title, m.phone, m.sector).run();
  const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first();
  return { row, token: (await issueSession(env, row, { scope: "full" })).token };
}
/* a D1 whose reads answer one macrotask later (a real D1 is a network round trip) and that records how many are in flight at once;
   onRead(sql) runs when a read STARTS */
function slowDb(env, onRead) {
  const prep = env.DB.prepare.bind(env.DB), st = { inFlight: 0, max: 0, reads: [] };
  const later = v => new Promise(res => setImmediate(() => res(v)));
  const read = async (sql, f) => { st.inFlight++; st.max = Math.max(st.max, st.inFlight); st.reads.push(sql); if (onRead) onRead(sql); try { return await later(await f()); } finally { st.inFlight--; } };
  /* only all() / first() are slowed; bind() keeps the wrapper; everything else (run, the batch internals) is the real statement's */
  const wrap = (b, sql) => new Proxy(b, { get(t, k) {
    if (k === "bind") return (...a) => wrap(t.bind(...a), sql);
    if (k === "all") return () => read(sql, () => t.all());
    if (k === "first") return col => read(sql, () => t.first(col));
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
  } });
  env.DB.prepare = sql => wrap(prep(sql), sql);
  return st;
}
const TIMING = /^[a-z]+;dur=\d+(, [a-z]+;dur=\d+)*$/;
const names = h => String(h || "").split(", ").map(p => p.split(";")[0]);

describe("session start: the saved persona is read beside the member's context, not after it", () => {
  test("a member Bassem greets by name: the persona GET is already on its way when his memory is read; the token is still the enriched one", async () => {
    const env = env0();
    const { token } = await member(env, DR);
    let personaFirst = null;
    slowDb(env, sql => { if (personaFirst === null && /FROM advisor_memory/.test(sql)) personaFirst = calls.some(c => c.method === "GET" && c.url === ANAM_PERSONA_URL + BASSEM); });
    const r = await call(env, { agent: "bassem", lang: "ar" }, token);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.member_context, true);
    assert.equal(personaFirst, true, "the persona read started before Bassem's memory was read (it used to wait for the whole context)");
    assert.deepEqual(calls.map(c => c.method + " " + c.url), ["GET " + ANAM_PERSONA_URL + BASSEM, "POST " + ANAM_TOKEN_URL], "one read, one token — no extra call");
    assert.ok(calls[1].body.personaConfig.systemPrompt.includes("دكتور محمد"), "the ephemeral copy still carries his context");
  });
  test("a member without a known title and with nothing remembered: the persona is still not read at all (today's plain request)", async () => {
    const env = env0();
    const { token } = await member(env, { ...DR, id: "m-notitle", email: "nt@co.test", title: "يا نصاب" });
    const r = await call(env, { agent: "bassem" }, token);
    assert.deepEqual([r.status, r.data.member_context], [200, undefined], r.text);
    assert.deepEqual(calls.map(c => c.method + " " + c.url), ["POST " + ANAM_TOKEN_URL]);
  });
  test("the member context switched off (BASSEM_MEMBER_CONTEXT=0): no persona read, as before", async () => {
    const env = env0({ BASSEM_MEMBER_CONTEXT: "0" });
    const { token } = await member(env, DR);
    const r = await call(env, { agent: "bassem" }, token);
    assert.deepEqual([r.status, r.data.member_context], [200, undefined], r.text);
    assert.deepEqual(calls.map(c => c.method + " " + c.url), ["POST " + ANAM_TOKEN_URL]);
  });
  test("a failed early read still falls back to today's request (never rejects, never blocks)", async () => {
    const env = env0();
    const { token } = await member(env, DR);
    mockAnam({ persona: () => okJson({ error: "no" }, 500) });
    const realErr = console.error; console.error = () => {};
    try {
      const r = await call(env, { agent: "bassem" }, token);
      assert.deepEqual([r.status, r.data.member_context], [200, undefined], r.text);
      assert.deepEqual(calls.filter(c => c.url === ANAM_TOKEN_URL).map(c => c.body.personaConfig), [{ personaId: BASSEM }]);
    } finally { console.error = realErr; }
  });
});

describe("session start: Bassem's context reads run together", () => {
  test("the memory block's seven reads (tasks, brief, summaries, searches, facts, deals, follows) are in flight at the same time", async () => {
    const env = env0();
    const { row } = await member(env, DR);
    const st = slowDb(env);
    const text = await memoryContext(env, row.id, {});
    assert.equal(typeof text, "string");
    assert.equal(st.reads.length, 7, st.reads.join("\n"));
    assert.equal(st.max, 7, "one round trip for all seven, not seven one after the other");
  });
  test("the continuation and the factory profile are read together; the block is the same as before", async () => {
    const env = env0();
    const { row } = await member(env, DR);
    const st = slowDb(env);
    const ctx = await bassemContext(env, row, "ar", { continue_call: "call-abcdef0123" });
    assert.ok(ctx && ctx.block.includes("دكتور محمد") && ctx.block.includes("النهارده:"), ctx && ctx.block);
    const first2 = st.reads.slice(0, 2).join(" | ");
    assert.ok(/advisor_memory/.test(first2) && /member_profiles/.test(first2), first2);
    assert.ok(st.max >= 2, "continuation + profile overlap");
  });
  test("no member → no context (and no read)", async () => {
    const env = env0();
    const st = slowDb(env);
    assert.equal(await bassemContext(env, null, "ar", {}), null);
    assert.equal(st.reads.length, 0);
  });
});

describe("session start: Server-Timing says where the wait went (milliseconds only)", () => {
  test("serverTiming: fixed order, whole milliseconds, missing parts left out, never negative", () => {
    assert.equal(serverTiming({ total: 1070.6, token: 650.2, checks: 40, ctx: 210, persona: 380, wait: 170 }), "checks;dur=40, ctx;dur=210, persona;dur=380, wait;dur=170, token;dur=650, total;dur=1071");
    assert.equal(serverTiming({ checks: 3, ctx: 0, token: 12, total: 15 }), "checks;dur=3, ctx;dur=0, token;dur=12, total;dur=15");
    assert.equal(serverTiming({ token: -5, total: "x" }), "token;dur=0, total;dur=0");
    assert.equal(serverTiming({ total: 20, boot: 7.4, checks: 2 }), "boot;dur=7, checks;dur=2, total;dur=20", "boot (the Control Center boot before the handler) comes first");
    assert.equal(serverTiming(null), "");
  });
  test("Bassem's enriched token: boot, checks, ctx, persona, wait, token, total — and the page may read it (exposed with CORS)", async () => {
    const env = env0();
    const { token } = await member(env, DR);
    const r = await call(env, { agent: "bassem", lang: "ar" }, token);
    assert.equal(r.status, 200, r.text);
    const h = r.headers.get("Server-Timing");
    assert.match(h, TIMING);
    assert.deepEqual(names(h), ["boot", "checks", "ctx", "persona", "wait", "token", "total"]);
    assert.equal(r.headers.get("Access-Control-Expose-Headers"), "Server-Timing");
    for (const s of [DR.name, DR.email, DR.company, KEY, "tok-"]) assert.ok(!h.includes(s), "nothing but durations: " + s);
  });
  test("Janna's plain token: boot, checks, ctx, token, total (no persona read); a refusal from Anam (502) carries it too", async () => {
    const env = env0({ JANNA_VISITOR_CONTEXT: "0" });
    const r = await call(env, { agent: "janna", lang: "ar" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(names(r.headers.get("Server-Timing")), ["boot", "checks", "ctx", "token", "total"]);
    mockAnam({ token: () => okJson({ error: "bad" }, 500) });
    const realErr = console.error; console.error = () => {};
    try {
      const f = await call(env, { agent: "janna", lang: "ar" });
      assert.deepEqual([f.status, f.data.error], [502, "upstream"]);
      assert.match(f.headers.get("Server-Timing"), TIMING);
      assert.ok(names(f.headers.get("Server-Timing")).includes("token"));
    } finally { console.error = realErr; }
  });
  test("refusals before Anam (login, plan, limits) carry no timing header", async () => {
    const env = env0();
    const r = await call(env, { agent: "bassem" });
    assert.deepEqual([r.status, r.data.error], [401, "login_required"]);
    assert.equal(r.headers.get("Server-Timing"), null);
  });
});
