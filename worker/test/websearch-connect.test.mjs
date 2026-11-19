// node --test for «🔗 وصّل البحث بباسم» (src/acc-wsconnect.js, POST /api/admin/cc/keys/websearch/connect): the owner's one press creates /
// updates the Anam tool bassem_web_search with the tool secret and attaches it to Bassem's persona — the secret never passes through a
// person. Everything goes through the real index.js (ccBoot + the Control Center router). No network: Anam's REST API is MOCKED here
// (persona GET / PUT, tools list / create / get / update); any other URL fails the test. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { getSecret, putSecret } from "../src/crypto.js";
import { forgetServiceKeys, webSearchConfig } from "../src/service-keys.js";
import { PERSONAS } from "../src/janna-session.js";
import { WS_TOOL, WS_TOOL_NAME, BASSEM_PERSONA, SECRET_PLACEHOLDER, CONNECT, toolBody, headerSafe, toolIdsOf, pickTool, refusedMsg } from "../src/acc-wsconnect.js";

const SITE = "https://madeinegyptgate.com";
const C = "/api/admin/cc/keys/websearch/connect", K = "/api/admin/cc/keys";
const CFG = "test-config-secret-0123456789abcdef-xyz";        // ≥ 32 characters (fake)
const ANAMK = "anam_test_key_00112233445566778899";            // fake Anam keys
const ANAM_PANEL = "anam_panel_key_99887766554433221100";
const SECRET = "tool-secret-0123456789abcdef";                 // fake X-MIG-Tool values
const SECRET2 = "tool-secret-second-fedcba9876543210";
const TAVILY = "tvly-test-0123456789abcdef0123";               // fake web-search key (shape only)
const ANAM = "https://api.anam.ai/v1/";
const UPSTREAM = "UPSTREAM_TRACE_must_never_be_echoed";         // what a failing mocked Anam answer carries in its body
const fake = n => "aaaaaaaa-0000-4000-8000-" + String(n).padStart(12, "0");
const ORIG = [fake(1), fake(2), fake(3)];                       // the tools Bassem already has (fake ids)
const RACE = fake(77);                                          // a tool someone else attaches while we connect
const EXIST = "cccccccc-0000-4000-8000-000000000001";
const SPEC = JSON.parse(readFileSync(new URL("../../anam/tools.create.json", import.meta.url), "utf8")).tools.find(t => t.key === "bassem_web_search");

let calls, logs, realFetch, realLog, realErr, A, seq;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const stamp = () => new Date(Date.UTC(2026, 10, 19, 16, 0, 0) + (++seq) * 1000).toISOString();
/* how the tools look when Anam lists them: header VALUES masked (the Worker never needs to read them back) */
const view = t => ({ ...t, config: { ...t.config, headers: Object.fromEntries(Object.keys((t.config && t.config.headers) || {}).map(k => [k, "••••"])) } });
const stepOf = (m, p) => p.startsWith("personas/") ? (m === "GET" ? "persona_read" : "persona_update") : p.startsWith("tools?") ? "tools_list" : p === "tools" ? "tool_create" : p.startsWith("tools/") ? (m === "GET" ? "tool_get" : "tool_update") : "?";
function mock() {
  calls = []; seq = 0;
  A = { persona: { id: BASSEM_PERSONA, name: "باسم · Bassem", updatedAt: "2026-11-19T15:46:58.139Z", toolIds: [...ORIG], tools: ORIG.map(id => ({ _toolId: id, name: "t" + id.slice(-1) })), brain: { systemPrompt: "…" } },
    tools: [], fail: {}, personaRace: 0, toolRace: 0, deleteOnPut: false, n: 0 };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = String(init.method || "GET").toUpperCase(), h = init.headers || {};
    calls.push({ url: u, method: m, auth: h.Authorization || h.authorization || "", headers: h, raw: init.body || "", body: init.body ? JSON.parse(init.body) : null });
    if (!u.startsWith(ANAM)) throw new Error("unexpected fetch " + u);
    const path = u.slice(ANAM.length), f = A.fail[stepOf(m, path)], body = init.body ? JSON.parse(init.body) : null;
    if (f === "network") throw new TypeError("fetch failed");
    if (f) return json({ error: UPSTREAM, message: UPSTREAM + " " + (h.Authorization || "") }, f);
    if (path === "personas/" + BASSEM_PERSONA && m === "GET") return A.persona ? json(A.persona) : json({ error: "Not Found" }, 404);
    if (path === "personas/" + BASSEM_PERSONA && m === "PUT") {
      if (!A.persona) return json({ error: "Not Found" }, 404);
      if (A.personaRace > 0) { A.personaRace--; A.persona = { ...A.persona, toolIds: [...A.persona.toolIds, ...(A.persona.toolIds.includes(RACE) ? [] : [RACE])], updatedAt: stamp() }; return json({ error: "changed" }, 409); }
      if (Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt") && body.expectedUpdatedAt !== A.persona.updatedAt) return json({ error: "changed" }, 409);
      A.persona = { ...A.persona, toolIds: [...body.toolIds], updatedAt: stamp() };
      return json(A.persona);
    }
    if (path.startsWith("tools?") && m === "GET") {
      const s = String(new URL(u).searchParams.get("search") || "").replace(/[\s_]+/g, " ").toLowerCase();
      const data = A.tools.filter(t => (t.name + " " + t.description).replace(/[\s_]+/g, " ").toLowerCase().includes(s)).map(view);
      return json({ data, meta: { total: data.length, lastPage: 1, currentPage: 1, perPage: 100, prev: null, next: null } });
    }
    if (path === "tools" && m === "POST") {
      const t0 = stamp(), t = { id: fake(500 + (++A.n)), name: body.name, description: body.description, type: body.type, disableInterruptions: !!body.disableInterruptions, config: body.config, createdAt: t0, updatedAt: t0, usageCount: 0 };
      A.tools.push(t); return json(view(t), 201);
    }
    if (path.startsWith("tools/")) {
      const id = decodeURIComponent(path.slice(6)), t = A.tools.find(x => x.id === id);
      if (!t) return json({ error: "Not Found" }, 404);
      if (m === "GET") return json(view(t));
      if (m === "PUT") {
        if (A.deleteOnPut) { A.tools = A.tools.filter(x => x.id !== id); return json({ error: "Not Found" }, 404); }
        if (A.toolRace > 0) { A.toolRace--; t.updatedAt = stamp(); return json({ error: "changed", code: "TOOL_CHANGED" }, 409); }
        if (Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt") && body.expectedUpdatedAt !== t.updatedAt) return json({ error: "changed", code: "TOOL_CHANGED" }, 409);
        const { expectedUpdatedAt, ...rest } = body; Object.assign(t, rest, { updatedAt: stamp() });
        return json(view(t));
      }
    }
    throw new Error("unexpected Anam call " + m + " " + path);
  };
}
beforeEach(() => {
  realFetch = globalThis.fetch; mock(); logs = [];
  realLog = console.log; realErr = console.error;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); }; console.error = (...a) => { logs.push(a.map(String).join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realErr; });

const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
  ADMIN_EMAILS: "owner@mig.test", PLATFORM_KEY: "pk-test-123", CONFIG_SECRET: CFG, ...(extra || {}) });
async function member(env, id, email, { staff = "", role = "user" } = {}) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at) VALUES (?, 'Co', ?, 'visitor', 1, ?, ?, ?, ?)").bind(id, email, t, t, role, t).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
const owner = env => member(env, "u-owner", "owner@mig.test");
function mkCtx() { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
const SEEN = [];                                               // every answer of every test (checked for secrets at the end)
async function api(env, method, path, { token, body, headers = {} } = {}) {
  const h = { "CF-Connecting-IP": "10.1.0.7", "User-Agent": "Mozilla/5.0 test", Origin: SITE, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  SEEN.push(text);
  return { status: res.status, data, text, headers: res.headers };
}
const press = (env, o) => api(env, "POST", C, { token: o.token, body: {} });
const shape = () => calls.map(c => c.method + " " + c.url.slice(ANAM.length).split("?")[0]);
const writes = () => calls.filter(c => c.method !== "GET");
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;
const state = async env => env.DB.prepare("SELECT v, updated_at FROM cc_settings WHERE k = 'websearch.connect'").first();
const awayFromHourEdge = async () => { const ms = Date.now() % 3600000; if (ms > 3595000) await new Promise(r => setTimeout(r, 3600200 - ms)); };
const noSecrets = (text, ...secrets) => { for (const s of secrets) if (s) assert.ok(!String(text).includes(s), "a secret leaked into: " + String(text).slice(0, 200)); };

describe("websearch connect: the tool definition", () => {
  test("WS_TOOL is anam/tools.create.json's bassem_web_search body; toolBody() changes only the header, written literally; Bassem = janna-session.js", () => {
    assert.ok(SPEC, "anam/tools.create.json has the bassem_web_search entry");
    assert.deepEqual(JSON.parse(JSON.stringify(WS_TOOL)), SPEC.body, "the Worker's copy = the prepared body");
    assert.deepEqual(SPEC.attach_to, ["bassem"]);
    assert.equal(BASSEM_PERSONA, PERSONAS.bassem.ar); assert.equal(BASSEM_PERSONA, PERSONAS.bassem.en);
    assert.equal(WS_TOOL_NAME, "bassem_web_search"); assert.equal(WS_TOOL.config.headers["X-MIG-Tool"], SECRET_PLACEHOLDER);
    assert.ok(Object.isFrozen(WS_TOOL) && Object.isFrozen(WS_TOOL.config.parameters.properties.kind.enum));
    assert.ok(WS_TOOL.description.length <= 1024, "Anam's description limit");
    const b = toolBody(SECRET);
    assert.equal(b.config.headers["X-MIG-Tool"], SECRET);
    assert.ok(!JSON.stringify(b).includes("{{") && !JSON.stringify(b).includes(SECRET_PLACEHOLDER));
    b.config.headers["X-MIG-Tool"] = SECRET_PLACEHOLDER;
    assert.deepEqual(b, SPEC.body, "nothing else differs");
    assert.equal(WS_TOOL.config.headers["X-MIG-Tool"], SECRET_PLACEHOLDER, "the constant is untouched");
  });
  test("helpers: header-safe secrets only; the persona's tool ids (toolIds, else tools[]); the tool to keep; Anam refusals in words", () => {
    for (const ok of [SECRET, "a".repeat(64), "x-Y_z.0123456789~!"]) assert.equal(headerSafe(ok), true, ok);
    for (const bad of ["short", "has a space 0123456789", "tab\t0123456789abcdef", "{{tool_secret}}-0123456789", "abc}}0123456789abcdef", "ünicode-0123456789abcdef", "", null]) assert.equal(headerSafe(bad), false, String(bad));
    assert.deepEqual(toolIdsOf({ toolIds: ORIG, tools: [] }), ORIG);
    assert.deepEqual(toolIdsOf({ tools: [{ _toolId: ORIG[0] }, { id: ORIG[1] }] }), ORIG.slice(0, 2));
    for (const bad of [null, [], {}, { toolIds: [ORIG[0], 7] }, { tools: [{ name: "no id" }] }]) assert.equal(toolIdsOf(bad), null, JSON.stringify(bad));
    const t = (id, createdAt) => ({ id, createdAt });
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [fake(9)], null).id, fake(9), "the one on Bassem first");
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [], fake(9)).id, fake(9), "then the one this button wrote");
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [], null).id, fake(8), "then the oldest");
    assert.equal(pickTool([], [], null), null);
    assert.match(refusedMsg(403, "tool_create")[0], /Tools/); assert.match(refusedMsg(403, "persona_update")[1], /Personas.*403/);
    assert.match(refusedMsg(401, "persona_read")[1], /401/); assert.match(refusedMsg(503, "tools_list")[0], /503/);
  });
});

describe("websearch connect: create, update, attach (mocked Anam)", () => {
  test("create: GET persona → GET tools → POST /v1/tools (header = the secret, literally) → PUT persona with EVERY id + the new one; a second press makes no write", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET, WEBSEARCH_KEY: TAVILY }), o = await owner(env);
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    const d = r.data;
    assert.deepEqual([d.ok, d.created, d.updated, d.unchanged, d.attached, d.already_attached, d.header_source, d.tool_name, d.persona_id, d.duplicates],
      [true, true, false, false, true, false, "env", "bassem_web_search", BASSEM_PERSONA, 0]);
    assert.deepEqual([d.websearch_ready, d.websearch_missing, d.websearch_reason, d.feature_on], [true, [], "ready", true]);
    assert.equal(d.tool_id, A.tools[0].id);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "POST tools", "PUT personas/" + BASSEM_PERSONA]);
    assert.ok(calls.every(c => c.auth === "Bearer " + ANAMK), "the key the Worker already uses (ANAM_API_KEY)");
    assert.equal(new URL(calls[1].url).searchParams.get("search"), "bassem_web_search");
    const post = calls[2];
    assert.equal(post.body.config.headers["X-MIG-Tool"], SECRET, "the secret, literally");
    assert.ok(!post.raw.includes("{{") && !post.raw.includes(SECRET_PLACEHOLDER));
    assert.deepEqual({ ...post.body, config: { ...post.body.config, headers: { "X-MIG-Tool": SECRET_PLACEHOLDER } } }, SPEC.body, "exactly the prepared body");
    const put = calls[3].body;
    assert.deepEqual(Object.keys(put).sort(), ["expectedUpdatedAt", "toolIds"], "no other persona field is sent");
    assert.deepEqual(put.toolIds, [...ORIG, d.tool_id]); assert.equal(put.expectedUpdatedAt, "2026-11-19T15:46:58.139Z");
    assert.deepEqual(A.persona.toolIds, [...ORIG, d.tool_id]);
    const aud = await audits(env, "websearch.connect");
    assert.equal(aud.length, 1); assert.equal(aud[0].target_id, d.tool_id); assert.equal(aud[0].actor_email, "owner@mig.test");
    assert.deepEqual(JSON.parse(aud[0].after_json), { ok: true, tool_id: d.tool_id, done: "created", attached: true, already_attached: false, header_source: "env", duplicates: 0, persona_id: BASSEM_PERSONA, websearch_ready: true });
    // the same press again: reads only, nothing changes in Anam or here
    const before = { persona: JSON.stringify(A.persona), tools: JSON.stringify(A.tools), state: await state(env) };
    calls.length = 0;
    const r2 = await press(env, o);
    assert.equal(r2.status, 200, r2.text);
    assert.deepEqual([r2.data.created, r2.data.updated, r2.data.unchanged, r2.data.attached, r2.data.already_attached, r2.data.tool_id], [false, false, true, true, true, d.tool_id]);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools"], "no write the second time");
    assert.deepEqual([JSON.stringify(A.persona), JSON.stringify(A.tools), await state(env)], [before.persona, before.tools, before.state]);
    const aud2 = await audits(env, "websearch.connect");
    assert.equal(aud2.length, 2); assert.equal(JSON.parse(aud2[1].after_json).done, "unchanged");
  });
  test("update-existing: a tool named bassem_web_search exists → PUT /v1/tools/{id} {body, expectedUpdatedAt} in place (no second tool); a look-alike name is left alone", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    A.tools.push({ id: EXIST, name: "bassem_web_search", type: "SERVER_WEBHOOK", description: "an old text", disableInterruptions: false, config: { url: "https://madeinegyptgate.com/api/advisor/web", method: "POST", headers: { "X-MIG-Tool": "an-old-value-0123456789" } }, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" });
    A.tools.push({ id: fake(600), name: "bassem_web_search_old", type: "SERVER_WEBHOOK", description: "the bassem_web_search draft", config: { url: "https://example.org/x", headers: {} }, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" });
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.created, r.data.updated, r.data.unchanged, r.data.tool_id, r.data.already_attached, r.data.duplicates], [false, true, false, EXIST, false, 0]);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "PUT tools/" + EXIST, "PUT personas/" + BASSEM_PERSONA]);
    const put = calls[2].body;
    assert.equal(put.expectedUpdatedAt, "2026-11-11T00:00:00.000Z");
    const { expectedUpdatedAt, ...sent } = put;
    assert.deepEqual(sent, toolBody(SECRET), "the whole definition (config replaces the stored one)");
    const t = A.tools.find(x => x.id === EXIST);
    assert.deepEqual([t.description, t.config.headers["X-MIG-Tool"], A.tools.length], [WS_TOOL.description, SECRET, 2]);
    assert.equal(A.tools.find(x => x.id === fake(600)).description, "the bassem_web_search draft", "untouched");
    assert.deepEqual(A.persona.toolIds, [...ORIG, EXIST]);
  });
  test("already-attached: the tool is on Bassem → no persona update at all; then nothing is written on the next press", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    A.tools.push({ id: EXIST, name: "bassem_web_search", type: "SERVER_WEBHOOK", description: "x", config: { url: "https://madeinegyptgate.com/api/advisor/web", headers: { "X-MIG-Tool": "••" } }, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" });
    A.persona.toolIds = [ORIG[0], EXIST, ORIG[1]];
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.updated, r.data.attached, r.data.already_attached, r.data.tool_id], [true, true, true, EXIST]);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "PUT tools/" + EXIST], "the header is (re)written once; the persona is not touched");
    assert.deepEqual(A.persona.toolIds, [ORIG[0], EXIST, ORIG[1]]);
    calls.length = 0;
    const r2 = await press(env, o);
    assert.deepEqual([r2.data.unchanged, r2.data.already_attached, writes().length], [true, true, 0]);
  });
  test("the persona changed meanwhile (409) → read again and keep the id someone else added; twice → 409 persona_changed, nothing dropped", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    A.personaRace = 1;
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "POST tools", "PUT personas/" + BASSEM_PERSONA, "GET personas/" + BASSEM_PERSONA, "PUT personas/" + BASSEM_PERSONA]);
    assert.deepEqual(A.persona.toolIds, [...ORIG, RACE, r.data.tool_id], "the id added meanwhile stays");
    const env2 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o2 = await owner(env2);
    mock(); A.personaRace = 2;
    const x = await press(env2, o2);
    assert.deepEqual([x.status, x.data.code, x.data.step, x.data.tool_done], [409, "persona_changed", "persona_update", "created"]);
    assert.ok(x.data.tool_id && x.data.msg_ar && x.data.msg_en);
    assert.ok(A.persona.toolIds.includes(RACE) && ORIG.every(id => A.persona.toolIds.includes(id)));
    // the next press attaches the tool it already wrote (no second tool)
    calls.length = 0;
    const y = await press(env2, o2);
    assert.equal(y.status, 200, y.text);
    assert.deepEqual([y.data.unchanged, y.data.tool_id, A.tools.length], [true, x.data.tool_id, 1]);
    assert.deepEqual(A.persona.toolIds, [...ORIG, RACE, x.data.tool_id]);
  });
  test("duplicates: the copy already on Bassem is kept and the count is reported; a tool deleted meanwhile (PUT 404) → a new one is created", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    const mk = (id, c) => ({ id, name: "bassem_web_search", type: "SERVER_WEBHOOK", description: "d", config: { url: "https://madeinegyptgate.com/api/advisor/web", headers: {} }, createdAt: c, updatedAt: c });
    A.tools.push(mk(fake(700), "2026-11-01T00:00:00.000Z"), mk(fake(701), "2026-11-05T00:00:00.000Z"));
    A.persona.toolIds = [...ORIG, fake(701)];
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.tool_id, r.data.duplicates, r.data.already_attached], [200, fake(701), 1, true]);
    const env2 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o2 = await owner(env2);
    mock(); A.tools.push(mk(EXIST, "2026-11-01T00:00:00.000Z")); A.deleteOnPut = true;
    const x = await press(env2, o2);
    assert.equal(x.status, 200, x.text);
    assert.deepEqual([x.data.created, x.data.updated], [true, false]);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "PUT tools/" + EXIST, "POST tools", "PUT personas/" + BASSEM_PERSONA]);
  });
});

describe("websearch connect: keys, secret, refusals", () => {
  test("no Anam key → 409 anam_key_missing, no Anam call and no secret made; the panel slot anam.api_key is used when there is no Worker secret", async () => {
    const env = env0(), o = await owner(env);
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code], [409, "anam_key_missing"]);
    assert.ok(r.data.msg_ar.includes("مفتاح Anam") && r.data.msg_en.includes("Anam key"));
    assert.equal(calls.length, 0);
    assert.equal(await env.DB.prepare("SELECT name FROM cc_secrets WHERE name = 'bassem.tool_secret'").first(), null, "nothing generated before the key exists");
    assert.equal((await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: ANAM_PANEL } })).status, 200);
    const ok = await press(env, o);
    assert.equal(ok.status, 200, ok.text);
    assert.ok(calls.length >= 4 && calls.every(c => c.auth === "Bearer " + ANAM_PANEL), "the panel key");
    assert.equal(ok.data.header_source, "generated");
  });
  test("secret generation: none anywhere → 32 random bytes (hex) sealed into bassem.tool_secret, no tail; Anam gets it; /api/advisor/web accepts it; a second press reuses it", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.header_source, r.data.websearch_ready, r.data.websearch_missing, r.data.websearch_reason], ["generated", false, ["key", "provider"], "no_key"]);
    const row = await env.DB.prepare("SELECT * FROM cc_secrets WHERE name = 'bassem.tool_secret'").first();
    assert.deepEqual([row.tail, row.set_by], ["", "owner@mig.test"]); assert.match(row.sealed, /^v1\./);
    const secret = await getSecret(env, "bassem.tool_secret");
    assert.match(secret, /^[0-9a-f]{64}$/); assert.ok(!row.sealed.includes(secret));
    assert.equal(calls.find(c => c.method === "POST").body.config.headers["X-MIG-Tool"], secret, "the header = the new secret");
    forgetServiceKeys(env);
    assert.equal((await webSearchConfig(env)).tool_secret, secret);
    const web = await api(env, "POST", "/api/advisor/web", { body: { query: "steel" }, headers: { "X-MIG-Tool": secret } });
    assert.deepEqual([web.status, web.data.error, web.data.reason], [503, "websearch_off", "no_key"], "the secret is accepted (the search itself waits for a key)");
    assert.equal((await api(env, "POST", "/api/advisor/web", { body: { query: "steel" }, headers: { "X-MIG-Tool": "wrong-0123456789abcdef" } })).status, 401);
    const ks = await audits(env, "keys.set");
    assert.equal(ks.length, 1); assert.equal(ks[0].target_id, "bassem.tool_secret"); assert.deepEqual(JSON.parse(ks[0].after_json), { set: true, generated: true });
    assert.match(ks[0].summary, /generated .*value not logged/);
    // the panel shows it as saved, without a tail
    const g = await api(env, "GET", K, { token: o.token });
    assert.deepEqual([g.data.websearch.tool_secret.set, g.data.websearch.tool_secret.tail, g.data.websearch.tool_secret.effective], [true, "", "panel"]);
    calls.length = 0;
    const r2 = await press(env, o);
    assert.deepEqual([r2.status, r2.data.header_source, r2.data.unchanged, writes().length], [200, "panel", true, 0]);
    assert.equal(await getSecret(env, "bassem.tool_secret"), secret, "not generated twice");
    assert.equal((await audits(env, "keys.set")).length, 1);
  });
  test("an unreadable saved secret (CONFIG_SECRET rotated) is replaced by a new one; no CONFIG_SECRET → 503 config_secret_missing before any Anam call", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    await putSecret({ ...env, CONFIG_SECRET: "an-older-config-secret-0123456789abcdef" }, "bassem.tool_secret", SECRET, "someone");
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text); assert.equal(r.data.header_source, "generated");
    const s = await getSecret(env, "bassem.tool_secret");
    assert.match(s, /^[0-9a-f]{64}$/);
    assert.match((await audits(env, "keys.set"))[0].summary, /replaced/);
    const env2 = env0({ ANAM_API_KEY: ANAMK, CONFIG_SECRET: "" }), o2 = await owner(env2);
    calls.length = 0;
    const x = await press(env2, o2);
    assert.deepEqual([x.status, x.data.code, calls.length], [503, "config_secret_missing", 0]);
  });
  test("a secret a header cannot carry (spaces, {{ }}) → 409 tool_secret_invalid, nothing sent", async () => {
    for (const bad of ["has a space 0123456789abc", "{{tool_secret}}0123456789"]) {
      const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: bad }), o = await owner(env);
      calls.length = 0;
      const r = await press(env, o);
      assert.deepEqual([r.status, r.data.code, r.data.source, calls.length], [409, "tool_secret_invalid", "env", 0], bad);
      assert.match(r.data.msg_en, /TOOL_SECRET/);
    }
  });
  test("Anam 401 / 403 / 500 / no answer → clear words per step, its body never passed on; reads fail before anything is written", async () => {
    const ok = rows => rows.map(a => JSON.parse(a.after_json).ok);
    // 401 on the first read: nothing written, not even a new secret
    const env1 = env0({ ANAM_API_KEY: ANAMK }), o1 = await owner(env1);
    A.fail.persona_read = 401;
    let r = await press(env1, o1);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step], [502, "anam_refused", 401, "persona_read"]);
    assert.match(r.data.msg_ar, /401/); assert.match(r.data.msg_en, /refused the key \(401\)/);
    assert.equal(writes().length, 0);
    assert.equal(await env1.DB.prepare("SELECT name FROM cc_secrets WHERE name = 'bassem.tool_secret'").first(), null);
    noSecrets(r.text, UPSTREAM, ANAMK);
    // 500 on the create: the answer says so; the next press (Anam fine again) creates it with the same secret
    mock(); A.fail.tool_create = 500;
    r = await press(env1, o1);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step], [502, "anam_refused", 500, "tool_create"]);
    const s1 = await getSecret(env1, "bassem.tool_secret");
    assert.match(s1, /^[0-9a-f]{64}$/);
    noSecrets(r.text, UPSTREAM, ANAMK, s1);
    mock();
    r = await press(env1, o1);
    assert.deepEqual([r.status, r.data.created, r.data.header_source], [200, true, "panel"]);
    assert.equal(calls.find(c => c.method === "POST").body.config.headers["X-MIG-Tool"], s1);
    const aud1 = await audits(env1, "websearch.connect");
    assert.deepEqual(ok(aud1), [false, false, true]);
    assert.deepEqual(aud1.slice(0, 2).map(a => [JSON.parse(a.after_json).code, JSON.parse(a.after_json).anam_status, JSON.parse(a.after_json).step]), [["anam_refused", 401, "persona_read"], ["anam_refused", 500, "tool_create"]]);
    noSecrets(JSON.stringify(aud1), s1, ANAMK, UPSTREAM);
    // 403 on the persona update (a key without Personas: Write): the tool is created, the answer names the missing permission
    const env2 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o2 = await owner(env2);
    mock(); A.fail.persona_update = 403;
    r = await press(env2, o2);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step, r.data.tool_done], [502, "anam_refused", 403, "persona_update", "created"]);
    assert.ok(r.data.tool_id); assert.match(r.data.msg_en, /Personas/); assert.match(r.data.msg_ar, /Personas/);
    noSecrets(r.text, UPSTREAM, ANAMK, SECRET);
    const aud2 = await audits(env2, "websearch.connect");
    assert.deepEqual(aud2.map(a => [JSON.parse(a.after_json).ok, JSON.parse(a.after_json).anam_status, JSON.parse(a.after_json).tool_id, a.target_id]), [[false, 403, r.data.tool_id, r.data.tool_id]]);
    // 403 on the tool create (a key without Tools: Write)
    mock(); A.fail.tool_create = 403;
    const env3 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o3 = await owner(env3);
    r = await press(env3, o3);
    assert.deepEqual([r.data.code, r.data.anam_status, r.data.step], ["anam_refused", 403, "tool_create"]); assert.match(r.data.msg_en, /Tools/);
    // no answer at all
    mock(); A.fail.tools_list = "network";
    r = await press(env3, o3);
    assert.deepEqual([r.status, r.data.code, r.data.step], [502, "anam_unreachable", "tools_list"]);
    assert.equal(writes().length, 0);
    assert.deepEqual(ok(await audits(env3, "websearch.connect")), [false, false]);
    noSecrets(JSON.stringify(await audits(env3, "websearch.connect")), SECRET, ANAMK, UPSTREAM);
  });
  test("persona missing (404) → 502 persona_not_found and no tool is created", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    A.persona = null;
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code, r.data.step, r.data.anam_status], [502, "persona_not_found", "persona_read", 404]);
    assert.match(r.data.msg_en, /persona/);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA]);
    assert.equal(A.tools.length, 0);
  });
  test("non-owner → 403 owner_only (admin / editor / support / X-Platform-Key), team roles → their page, signed out → 401; nothing reaches Anam", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET });
    for (const role of ["admin", "editor", "support"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role, role: role === "admin" ? "admin" : "user" });
      const r = await api(env, "POST", C, { token: s.token, body: {} });
      assert.deepEqual([r.status, r.data.code, r.data.need], [403, "owner_only", "keys.manage"], role);
    }
    const seo = await member(env, "u-seo", "seo@mig.test", { staff: "seo" });
    const t = await api(env, "POST", C, { token: seo.token, body: {} });
    assert.deepEqual([t.status, t.data.code], [403, "forbidden"]); assert.ok(t.data.team_page);
    assert.deepEqual([(await api(env, "POST", C, { headers: { "X-Platform-Key": "pk-test-123" }, body: {} })).data.code], ["owner_only"]);
    assert.equal((await api(env, "POST", C, { body: {} })).status, 401);
    const o = await owner(env);
    assert.equal((await api(env, "GET", C, { token: o.token })).status, 405, "POST only");
    assert.equal(calls.length, 0);
    assert.equal((await audits(env, "websearch.connect")).length, 0);
  });
  test("10 presses per hour per owner (429 after); one at a time (a running connection → 409 connect_busy)", async () => {
    await awayFromHourEdge();
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    for (let i = 0; i < CONNECT.per_hour; i++) assert.equal((await press(env, o)).status, 200, "press " + (i + 1));
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code, r.data.limit], [429, "rate_limited", 10]);
    assert.equal(A.tools.length, 1, "one tool however often it is pressed");
    const env2 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o2 = await owner(env2);
    await env2.DB.prepare("INSERT INTO cc_locks (k, until, owner) VALUES ('keys:websearch.connect', ?, 'other')").bind(new Date(Date.now() + 60000).toISOString()).run();
    calls.length = 0;
    const b = await press(env2, o2);
    assert.deepEqual([b.status, b.data.code, calls.length], [409, "connect_busy", 0]);
    await env2.DB.prepare("UPDATE cc_locks SET until = ? WHERE k = 'keys:websearch.connect'").bind(new Date(Date.now() - 1000).toISOString()).run();
    assert.equal((await press(env2, o2)).status, 200, "an expired lock does not block");
    assert.equal(await env2.DB.prepare("SELECT k FROM cc_locks WHERE k = 'keys:websearch.connect'").first(), null, "released after the press");
  });
});

describe("websearch connect: the panel view and secrecy", () => {
  test("GET /keys → websearch.connect: not connected → connected; a changed «سر أدوات باسم» → secret_changed until the next press rewrites the header", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    assert.equal((await api(env, "PUT", K + "/bassem.tool_secret", { token: o.token, body: { value: SECRET } })).status, 200);
    let g = await api(env, "GET", K, { token: o.token });
    let c = g.data.websearch.connect;
    assert.deepEqual([c.connected, c.tool_id, c.anam_key, c.secret_changed, c.last, c.endpoint, c.persona_id], [false, "", "env", false, null, C, BASSEM_PERSONA]);
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.header_source], [200, "panel"]);
    assert.equal(calls.find(c => c.method === "POST").body.config.headers["X-MIG-Tool"], SECRET);
    g = await api(env, "GET", K, { token: o.token }); c = g.data.websearch.connect;
    assert.deepEqual([c.connected, c.tool_id, c.secret_changed, c.last.ok, c.last.finished, c.by], [true, r.data.tool_id, false, true, true, "owner@mig.test"]);
    assert.ok(!("secret_fp" in c) && !("body_fp" in c), "no fingerprint leaves the Worker");
    assert.equal((await api(env, "PUT", K + "/bassem.tool_secret", { token: o.token, body: { value: SECRET2 } })).status, 200);
    g = await api(env, "GET", K, { token: o.token });
    assert.equal(g.data.websearch.connect.secret_changed, true);
    calls.length = 0;
    const r2 = await press(env, o);
    assert.deepEqual([r2.status, r2.data.updated, r2.data.already_attached], [200, true, true]);
    assert.deepEqual(shape(), ["GET personas/" + BASSEM_PERSONA, "GET tools", "PUT tools/" + r.data.tool_id]);
    assert.equal(calls[2].body.config.headers["X-MIG-Tool"], SECRET2);
    assert.equal((await api(env, "GET", K, { token: o.token })).data.websearch.connect.secret_changed, false);
    // a failed attempt shows as the last one
    mock(); A.fail.persona_read = 503;
    await press(env, o);
    const last = (await api(env, "GET", K, { token: o.token })).data.websearch.connect.last;
    assert.deepEqual([last.ok, last.code, last.anam_status, last.step], [false, "anam_refused", 503, "persona_read"]);
    // a tool written but refused on the persona (403) is NOT shown as connected; the fixed key's press attaches it (one persona write)
    const env2 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o2 = await owner(env2);
    mock(); A.fail.persona_update = 403;
    assert.equal((await press(env2, o2)).data.anam_status, 403);
    c = (await api(env2, "GET", K, { token: o2.token })).data.websearch.connect;
    assert.deepEqual([c.connected, c.tool_written, !!c.tool_id], [false, true, true]);
    delete A.fail.persona_update; calls.length = 0;
    const fixed = await press(env2, o2);
    assert.deepEqual([fixed.status, fixed.data.unchanged, fixed.data.already_attached], [200, true, false]);
    assert.deepEqual(writes().map(w => w.method + " " + w.url.slice(ANAM.length)), ["PUT personas/" + BASSEM_PERSONA]);
    c = (await api(env2, "GET", K, { token: o2.token })).data.websearch.connect;
    assert.deepEqual([c.connected, c.tool_written], [true, true]);
    const st2 = await state(env2); calls.length = 0;
    assert.equal((await press(env2, o2)).data.already_attached, true);
    assert.deepEqual([writes().length, JSON.stringify(await state(env2))], [0, JSON.stringify(st2)], "then nothing changes");
  });
  test("the tool secret and the Anam key never appear in an answer, the audit log, a setting, a lock, a rate-limit row or a log line — only in Anam's request header", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    const start = SEEN.length;
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    const secret = await getSecret(env, "bassem.tool_secret");
    assert.match(secret, /^[0-9a-f]{64}$/);
    await api(env, "PUT", K + "/bassem.tool_secret", { token: o.token, body: { value: SECRET2 } });
    mock(); A.fail.tool_create = 500;                          // a failing path too (a fresh Anam: the tool has to be created again)
    assert.equal((await press(env, o)).status, 502);
    mock();
    assert.equal((await press(env, o)).status, 200);
    await api(env, "GET", K, { token: o.token });
    await api(env, "GET", "/api/admin/cc/audit", { token: o.token });
    for (const t of SEEN.slice(start)) noSecrets(t, secret, SECRET2, ANAMK);
    for (const tbl of ["cc_audit", "cc_settings", "cc_locks", "rl"]) noSecrets(JSON.stringify((await env.DB.prepare(`SELECT * FROM ${tbl}`).all()).results), secret, SECRET2, ANAMK);
    noSecrets(JSON.stringify((await env.DB.prepare("SELECT name, sealed, tail, set_by FROM cc_secrets").all()).results), secret, SECRET2, ANAMK);
    noSecrets(logs.join("\n"), secret, SECRET2, ANAMK);
    for (const c of calls) { noSecrets(c.url, SECRET2, ANAMK); if (c.method !== "POST" && c.method !== "PUT") noSecrets(c.raw, SECRET2); }
    assert.ok(calls.some(c => c.body && c.body.config && c.body.config.headers["X-MIG-Tool"] === SECRET2), "the header carries it to Anam");
  });
  test("every answer of this file was free of the test secrets and keys", () => {
    for (const t of SEEN) noSecrets(t, SECRET, SECRET2, ANAMK, ANAM_PANEL, UPSTREAM, CFG);
  });
});
