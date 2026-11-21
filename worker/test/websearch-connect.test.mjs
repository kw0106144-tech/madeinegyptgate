// node --test for «🔗 وصّل البحث بجنة وباسم» (src/acc-wsconnect.js, POST /api/admin/cc/keys/websearch/connect): the owner's ONE press creates /
// updates the four Anam web tools (bassem_web_search + bassem_web_hunt on Bassem; janna_web_search + janna_web_hunt — one record each — on
// Janna AR and Janna EN) with their secrets (Bassem's and Janna's: review 2026-11-20 S17) — no secret ever passes through a person.
// Everything goes through the real index.js (ccBoot + the Control Center router). No network: Anam's REST API is MOCKED here (persona GET /
// PUT, tools list / create / get / update, share-links list); any other URL fails the test. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { getSecret, putSecret } from "../src/crypto.js";
import { forgetServiceKeys, webSearchConfig } from "../src/service-keys.js";
import { PERSONAS } from "../src/janna-session.js";
import { sha256 } from "../src/common.js";
import { WS_TOOL, WS_TOOL_NAME, WEB_TOOLS, BASSEM_PERSONA, JANNA_PERSONAS, PERSONA_IDS, SECRET_PLACEHOLDER, JANNA_PLACEHOLDER, CONNECT, toolBody, headerSafe, toolIdsOf, pickTool, refusedMsg, secretFp } from "../src/acc-wsconnect.js";

const SITE = "https://madeinegyptgate.com";
const C = "/api/admin/cc/keys/websearch/connect", K = "/api/admin/cc/keys";
const CFG = "test-config-secret-0123456789abcdef-xyz";        // ≥ 32 characters (fake)
const ANAMK = "anam_test_key_00112233445566778899";            // fake Anam keys
const ANAM_PANEL = "anam_panel_key_99887766554433221100";
const SECRET = "tool-secret-0123456789abcdef";                 // fake X-MIG-Tool values
const SECRET2 = "tool-secret-second-fedcba9876543210";
const JSECRET = "janna-secret-0123456789abcdef";
const TAVILY = "tvly-test-0123456789abcdef0123";               // fake web-search key (shape only)
const ANAM = "https://api.anam.ai/v1/";
const UPSTREAM = "UPSTREAM_TRACE_must_never_be_echoed";         // what a failing mocked Anam answer carries in its body
const fake = n => "aaaaaaaa-0000-4000-8000-" + String(n).padStart(12, "0");
const B = BASSEM_PERSONA, JA = JANNA_PERSONAS.janna_ar, JE = JANNA_PERSONAS.janna_en;
const ORIG = { [B]: [fake(1), fake(2), fake(3)], [JA]: [fake(11), fake(12)], [JE]: [fake(21)] }; // the tools each persona has (fake ids)
const RACE = fake(77);                                          // a tool someone else attaches while we connect
const EXIST = "cccccccc-0000-4000-8000-000000000001";
const SPEC = JSON.parse(readFileSync(new URL("../../anam/tools.create.json", import.meta.url), "utf8")).tools;
const specOf = k => SPEC.find(t => t.key === k);
const KEYOF = Object.fromEntries(Object.entries(PERSONA_IDS).map(([k, id]) => [id, k]));

let calls, logs, realFetch, realLog, realErr, realNow, A, seq;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const stamp = () => new Date(Date.UTC(2026, 10, 20, 16, 0, 0) + (++seq) * 1000).toISOString();
/* how the tools look when Anam lists them: header VALUES masked (the Worker never needs to read them back) */
const view = t => ({ ...t, config: { ...t.config, headers: Object.fromEntries(Object.keys((t.config && t.config.headers) || {}).map(k => [k, "••••"])) } });
const stepOf = (m, p) => p.startsWith("personas/") ? (m === "GET" ? "persona_read" : "persona_update") : p.startsWith("tools?") ? "tools_list" : p === "tools" ? "tool_create" : p.startsWith("tools/") ? (m === "GET" ? "tool_get" : "tool_update") : p.startsWith("share-links") ? "share_links" : "?";
const mkPersona = (id, name) => ({ id, name, updatedAt: "2026-11-19T15:46:58.139Z", toolIds: [...ORIG[id]], tools: ORIG[id].map(x => ({ _toolId: x, name: "t" + x.slice(-2) })), brain: { systemPrompt: "…" } });
function mock() {
  calls = []; seq = 0;
  A = { personas: { [B]: mkPersona(B, "باسم · Bassem"), [JA]: mkPersona(JA, "جنة"), [JE]: mkPersona(JE, "Janna") }, tools: [], fail: {}, personaRace: {}, toolRace: 0, deleteOnPut: false, n: 0, links: [], onCreate: null };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = String(init.method || "GET").toUpperCase(), h = init.headers || {};
    calls.push({ url: u, method: m, auth: h.Authorization || h.authorization || "", headers: h, raw: init.body || "", body: init.body ? JSON.parse(init.body) : null });
    if (!u.startsWith(ANAM)) throw new Error("unexpected fetch " + u);
    const path = u.slice(ANAM.length), step = stepOf(m, path), pid = path.startsWith("personas/") ? path.slice(9) : "";
    const f = A.fail[step + ":" + (KEYOF[pid] || "")] || A.fail[step], body = init.body ? JSON.parse(init.body) : null;
    if (f === "network") throw new TypeError("fetch failed");
    if (f) return json({ error: UPSTREAM, message: UPSTREAM + " " + (h.Authorization || "") }, f);
    if (pid && m === "GET") return A.personas[pid] ? json(A.personas[pid]) : json({ error: "Not Found" }, 404);
    if (pid && m === "PUT") {
      const p = A.personas[pid]; if (!p) return json({ error: "Not Found" }, 404);
      if (A.personaRace[pid] > 0) { A.personaRace[pid]--; A.personas[pid] = { ...p, toolIds: [...p.toolIds, ...(p.toolIds.includes(RACE) ? [] : [RACE])], updatedAt: stamp() }; return json({ error: "changed" }, 409); }
      if (Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt") && body.expectedUpdatedAt !== p.updatedAt) return json({ error: "changed" }, 409);
      A.personas[pid] = { ...p, toolIds: [...body.toolIds], updatedAt: stamp() };
      return json(A.personas[pid]);
    }
    if (path.startsWith("share-links") && m === "GET") return json({ data: A.links, meta: { total: A.links.length, next: null } });
    if (path.startsWith("tools?") && m === "GET") {
      const s = String(new URL(u).searchParams.get("search") || "").replace(/[\s_]+/g, " ").toLowerCase();
      const data = A.tools.filter(t => (t.name + " " + t.description).replace(/[\s_]+/g, " ").toLowerCase().includes(s)).map(view);
      return json({ data, meta: { total: data.length, lastPage: 1, currentPage: 1, perPage: 100, prev: null, next: null } });
    }
    if (path === "tools" && m === "POST") {
      const t0 = stamp(), t = { id: fake(500 + (++A.n)), name: body.name, description: body.description, type: body.type, disableInterruptions: !!body.disableInterruptions, config: body.config, createdAt: t0, updatedAt: t0, usageCount: 0 };
      A.tools.push(t); if (A.onCreate) A.onCreate(t); return json(view(t), 201);
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
  realFetch = globalThis.fetch; realNow = Date.now; mock(); logs = [];
  realLog = console.log; realErr = console.error;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); }; console.error = (...a) => { logs.push(a.map(String).join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; Date.now = realNow; console.log = realLog; console.error = realErr; });

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
const P = id => "personas/" + id;
const shape = () => calls.map(c => c.method + " " + c.url.slice(ANAM.length).split("?")[0]);
const sorted = a => [...a].sort();
const writes = () => calls.filter(c => c.method !== "GET");
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;
const state = async env => env.DB.prepare("SELECT v, updated_at FROM cc_settings WHERE k = 'websearch.connect'").first();
const awayFromHourEdge = async () => { const ms = Date.now() % 3600000; if (ms > 3595000) await new Promise(r => setTimeout(r, 3600200 - ms)); };
const noSecrets = (text, ...secrets) => { for (const s of secrets) if (s) assert.ok(!String(text).includes(s), "a secret leaked into: " + String(text).slice(0, 200)); };
const toolOf = name => A.tools.find(t => t.name === name);
const READS = [...[B, JA, JE].map(id => "GET " + P(id)), "GET tools", "GET tools", "GET tools", "GET tools", "GET share-links"];
const wsEnv = extra => env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET, JANNA_TOOL_SECRET: JSECRET, WEBSEARCH_KEY: TAVILY, ...(extra || {}) });

describe("websearch connect: the four tool definitions", () => {
  test("WEB_TOOLS = anam/tools.create.json (bodies, attach_to); toolBody() changes only the header; Bassem's keep his placeholder, Janna's hers; persona ids = janna-session.js", () => {
    assert.deepEqual(WEB_TOOLS.map(t => t.key), ["bassem_web_search", "bassem_web_hunt", "janna_web_search", "janna_web_hunt"]);
    for (const t of WEB_TOOLS) {
      const s = specOf(t.key);
      assert.ok(s, t.key + " is in anam/tools.create.json");
      assert.deepEqual(JSON.parse(JSON.stringify(t.body)), s.body, t.key + ": the Worker's copy = the prepared body");
      assert.deepEqual(s.attach_to, [...t.personas], t.key);
      assert.equal(t.body.name, t.key); assert.equal(t.body.type, "SERVER_WEBHOOK"); assert.ok(t.body.description.length <= 1024, t.key + " ≤ 1024 characters (Anam)");
      assert.equal(t.body.config.headers["X-MIG-Tool"], t.secret === "janna" ? JANNA_PLACEHOLDER : SECRET_PLACEHOLDER, t.key);
      assert.ok(Object.isFrozen(t.body) && Object.isFrozen(t.body.config.parameters.properties), t.key);
      const b = toolBody(SECRET, t.body);
      assert.equal(b.config.headers["X-MIG-Tool"], SECRET); assert.ok(!JSON.stringify(b).includes("{{") && !JSON.stringify(b).includes("REPLACE_WITH"));
      b.config.headers["X-MIG-Tool"] = t.body.config.headers["X-MIG-Tool"]; assert.deepEqual(b, s.body, "nothing else differs");
    }
    assert.deepEqual(WEB_TOOLS.map(t => t.body.config.url), ["https://madeinegyptgate.com/api/advisor/web", "https://madeinegyptgate.com/api/advisor/hunt", "https://madeinegyptgate.com/api/janna/web", "https://madeinegyptgate.com/api/janna/hunt"]);
    assert.ok(WS_TOOL.description.startsWith("Search the OPEN WEB beyond the platform") && WS_TOOL === WEB_TOOLS[0].body, "bassem_web_search: today's body");
    /* the owner's rule of 2026-11-20 («ميكتبش مصدر اي معلومه»; «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه وخلاص»)
       in every description: the information itself; never a site / link / source, never «from the internet» / «outside the platform» /
       «needs checking»; never «verified by the platform» / «registered on the platform»; asked where from: no source, no lie */
    for (const t of WEB_TOOLS) {
      const d = t.body.description;
      assert.ok(d.length <= 1024, t.key + ": " + d.length + " characters");
      assert.match(d, /Never (?:say|name) a site, portal, newspaper, domain, link or (?:any )?source/, t.key);
      assert.match(d, /from the internet/, t.key); assert.match(d, /outside the platform/, t.key); assert.match(d, /need(?:s)? checking/, t.key);
      assert.match(d, /Never say the platform verified/, t.key); assert.match(d, /(?:registered on|is on) the platform/, t.key);
      assert.match(d, /[Aa]sked where (?:it is )?from|asks where it is from/, t.key); assert.match(d, /name no source/, t.key); assert.match(d, /never lie/, t.key);
      assert.match(d, /Never invent|no contacts/, t.key);
      assert.doesNotMatch(d, /site name|name the site|checked at the source|always say it comes|always from the internet|websites on the internet|not from the platform's data/i, t.key + ": no older wording");
      for (const p of Object.values(t.body.config.parameters.properties)) assert.doesNotMatch(p.description || "", /websites?|on the internet|source/i, t.key + ": a parameter's words");
    }
    assert.deepEqual(specOf("janna_web_hunt").body.config.parameters.required, ["product"]);
    for (const k of ["janna_web_search", "janna_web_hunt", "bassem_web_hunt"]) assert.deepEqual(specOf(k).body.config.parameters.properties.lang.enum, ["ar", "en"], k);
    assert.match(specOf("janna_web_search").body.description, /never search for a person/);
    assert.match(specOf("janna_web_hunt").body.description, /once per product and market/); assert.match(specOf("janna_web_hunt").body.description, /ask ONE question first/);
    assert.equal(BASSEM_PERSONA, PERSONAS.bassem.ar); assert.deepEqual([JANNA_PERSONAS.janna_ar, JANNA_PERSONAS.janna_en], [PERSONAS.janna.ar, PERSONAS.janna.en]);
    assert.equal(toolBody(SECRET).name, WS_TOOL_NAME, "toolBody(secret) = bassem_web_search, as before");
  });
  test("helpers: header-safe secrets only; the persona's tool ids (toolIds, else tools[]); the tool to keep; Anam refusals in words", () => {
    for (const ok of [SECRET, "a".repeat(64), "x-Y_z.0123456789~!"]) assert.equal(headerSafe(ok), true, ok);
    for (const bad of ["short", "has a space 0123456789", "tab\t0123456789abcdef", "{{tool_secret}}-0123456789", "abc}}0123456789abcdef", "ünicode-0123456789abcdef", "", null]) assert.equal(headerSafe(bad), false, String(bad));
    assert.deepEqual(toolIdsOf({ toolIds: ORIG[B], tools: [] }), ORIG[B]);
    assert.deepEqual(toolIdsOf({ tools: [{ _toolId: ORIG[B][0] }, { id: ORIG[B][1] }] }), ORIG[B].slice(0, 2));
    for (const bad of [null, [], {}, { toolIds: [ORIG[B][0], 7] }, { tools: [{ name: "no id" }] }]) assert.equal(toolIdsOf(bad), null, JSON.stringify(bad));
    const t = (id, createdAt) => ({ id, createdAt });
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [fake(9)], null).id, fake(9), "the one on the persona first");
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [], fake(9)).id, fake(9), "then the one this button wrote");
    assert.equal(pickTool([t(fake(9), "2026-01-02"), t(fake(8), "2026-01-01")], [], null).id, fake(8), "then the oldest");
    assert.match(refusedMsg(403, "tool_create")[0], /Tools/); assert.match(refusedMsg(403, "persona_update")[1], /Personas.*403/);
    assert.match(refusedMsg(403, "tool_create", "env")[1], /ANAM_API_KEY Worker secret/);
  });
});

describe("websearch connect: create, update, attach (mocked Anam)", () => {
  test("one press: reads 3 personas + 4 tool lists, creates the 4 tools (each with ITS secret, literally), ONE PUT per persona with every old id + the new ones; a second press writes nothing", async () => {
    const env = wsEnv(), o = await owner(env);
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    const d = r.data;
    assert.deepEqual(d.tools.map(t => [t.key, t.done, t.duplicates]), WEB_TOOLS.map(t => [t.key, "created", 0]));
    assert.deepEqual([d.ok, d.websearch_ready, d.janna_ready, d.header_source, d.feature_on], [true, true, true, { bassem: "env", janna: "env" }, { bassem_web_search: true, janna_web_search: true }]);
    assert.deepEqual([d.cap, d.cap_janna], [300, 120]);
    assert.deepEqual(sorted(shape().slice(0, 7)), sorted(READS.slice(0, 7)), "the reads come first, all of them");
    assert.deepEqual(shape().slice(7), ["POST tools", "POST tools", "POST tools", "POST tools", "PUT " + P(B), "PUT " + P(JA), "PUT " + P(JE), "GET share-links"]);
    assert.ok(calls.every(c => c.auth === "Bearer " + ANAMK));
    const posts = calls.filter(c => c.method === "POST");
    assert.deepEqual(posts.map(c => [c.body.name, c.body.config.headers["X-MIG-Tool"]]), [["bassem_web_search", SECRET], ["bassem_web_hunt", SECRET], ["janna_web_search", JSECRET], ["janna_web_hunt", JSECRET]]);
    for (const c of posts) { assert.ok(!c.raw.includes("{{") && !c.raw.includes("REPLACE_WITH")); const t = WEB_TOOLS.find(w => w.key === c.body.name); assert.deepEqual({ ...c.body, config: { ...c.body.config, headers: t.body.config.headers } }, JSON.parse(JSON.stringify(t.body))); }
    const id = n => toolOf(n).id, puts = calls.filter(c => c.method === "PUT");
    for (const c of puts) assert.deepEqual(Object.keys(c.body).sort(), ["expectedUpdatedAt", "toolIds"], "no other persona field is sent");
    assert.deepEqual(puts.map(c => c.body.toolIds), [[...ORIG[B], id("bassem_web_search"), id("bassem_web_hunt")], [...ORIG[JA], id("janna_web_search"), id("janna_web_hunt")], [...ORIG[JE], id("janna_web_search"), id("janna_web_hunt")]]);
    assert.equal(A.tools.filter(t => t.name === "janna_web_search").length, 1, "ONE record for both Jannas");
    assert.deepEqual(d.personas.janna_en.added, [id("janna_web_search"), id("janna_web_hunt")]);
    assert.deepEqual([d.tool_id, d.created, d.attached, d.already_attached, d.tool_name, d.persona_id], [id("bassem_web_search"), true, true, false, "bassem_web_search", B], "the v1 fields (nit 17)");
    const st = JSON.parse((await state(env)).v);
    assert.deepEqual([st.v, st.connected, st.tool_id, st.attached], [2, { bassem: true, janna: true }, id("bassem_web_search"), true]);
    const aud = await audits(env, "websearch.connect");
    assert.equal(aud.length, 1); assert.equal(aud[0].target_id, "web_tools"); assert.equal(aud[0].actor_email, "owner@mig.test");
    assert.deepEqual(JSON.parse(aud[0].after_json).tools, Object.fromEntries(WEB_TOOLS.map(t => [t.key, "created"])));
    /* the same press again: reads only, nothing changes in Anam or here */
    const before = { p: JSON.stringify(A.personas), t: JSON.stringify(A.tools), s: await state(env) };
    calls.length = 0;
    const r2 = await press(env, o);
    assert.equal(r2.status, 200, r2.text);
    assert.deepEqual(r2.data.tools.map(t => t.done), ["unchanged", "unchanged", "unchanged", "unchanged"]);
    assert.ok(Object.values(r2.data.personas).every(p => p.already && !p.added.length));
    assert.deepEqual(sorted(shape()), sorted(READS), "no write the second time");
    assert.deepEqual([JSON.stringify(A.personas), JSON.stringify(A.tools), await state(env)], [before.p, before.t, before.s]);
  });
  test("an earlier v1 press (bassem_web_search alone) is read and upgraded: that tool stays «unchanged», the three new ones are created, each persona gets ONE write", async () => {
    const env = wsEnv(), o = await owner(env);
    const wsId = EXIST, wsUpd = "2026-11-19T16:00:01.000Z";
    A.tools.push({ id: wsId, name: "bassem_web_search", type: "SERVER_WEBHOOK", description: WS_TOOL.description, config: WS_TOOL.config, createdAt: wsUpd, updatedAt: wsUpd });
    A.personas[B].toolIds = [...ORIG[B], wsId];
    const v1fp = (await sha256("ws-connect|v1|" + B + "|" + JSON.stringify(WS_TOOL))).slice(0, 32), t = new Date().toISOString();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('websearch.connect', 'system', ?, ?)")
      .bind(JSON.stringify({ v: 1, tool_id: wsId, tool_updated_at: wsUpd, body_fp: v1fp, secret_fp: await secretFp(env, SECRET), persona_id: B, header_source: "env", attached: true, at: t, by: "owner@mig.test" }), t).run();
    const g = (await api(env, "GET", K, { token: o.token })).data.websearch.connect;
    assert.deepEqual([g.connected, g.connected_bassem, g.tools[0].personas[0].attached, g.tools[1].written], [true, false, true, false], "v1: Bassem's search is connected, his hunt is not");
    calls.length = 0;
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.tools.map(x => x.done), ["unchanged", "created", "created", "created"]);
    assert.deepEqual(writes().map(w => w.method + " " + (w.method === "POST" ? w.body.name : w.url.slice(ANAM.length))), ["POST bassem_web_hunt", "POST janna_web_search", "POST janna_web_hunt", "PUT " + P(B), "PUT " + P(JA), "PUT " + P(JE)]);
    assert.deepEqual(A.personas[B].toolIds, [...ORIG[B], wsId, toolOf("bassem_web_hunt").id]);
    const st = JSON.parse((await state(env)).v);
    assert.deepEqual([st.v, st.connected, st.tool_id], [2, { bassem: true, janna: true }, wsId]);
  });
  test("update in place: a tool with the name exists → PUT /v1/tools/{id} {body, expectedUpdatedAt}; look-alike names left alone; a tool deleted meanwhile (PUT 404) → created", async () => {
    const env = wsEnv(), o = await owner(env);
    A.tools.push({ id: EXIST, name: "janna_web_hunt", type: "SERVER_WEBHOOK", description: "an old text", disableInterruptions: false, config: { url: "https://madeinegyptgate.com/api/janna/hunt", method: "POST", headers: { "X-MIG-Tool": "an-old-value-0123456789" } }, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" });
    A.tools.push({ id: fake(600), name: "janna_web_hunt_old", type: "SERVER_WEBHOOK", description: "the janna_web_hunt draft", config: { url: "https://example.org/x", headers: {} }, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" });
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.tools.map(x => [x.key, x.done]), [["bassem_web_search", "created"], ["bassem_web_hunt", "created"], ["janna_web_search", "created"], ["janna_web_hunt", "updated"]]);
    const put = calls.find(c => c.method === "PUT" && c.url.endsWith("tools/" + EXIST)).body;
    assert.equal(put.expectedUpdatedAt, "2026-11-11T00:00:00.000Z");
    const { expectedUpdatedAt, ...sent } = put;
    assert.deepEqual(sent, toolBody(JSECRET, WEB_TOOLS[3].body));
    assert.equal(A.tools.find(x => x.id === fake(600)).description, "the janna_web_hunt draft", "untouched");
    assert.ok(A.personas[JE].toolIds.includes(EXIST) && A.personas[JA].toolIds.includes(EXIST));
    const env2 = wsEnv(), o2 = await owner(env2);
    mock(); A.tools.push({ id: EXIST, name: "bassem_web_hunt", type: "SERVER_WEBHOOK", description: "d", config: { url: "x", headers: {} }, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }); A.deleteOnPut = true;
    const x = await press(env2, o2);
    assert.equal(x.status, 200, x.text);
    assert.equal(x.data.tools[1].done, "created");
    assert.deepEqual(writes().slice(0, 3).map(w => w.method + " " + w.url.slice(ANAM.length)), ["POST tools", "PUT tools/" + EXIST, "POST tools"]);
  });
  test("a press after the descriptions changed (owner 2026-11-20): the four tools an earlier press wrote with the older words are PUT in place with today's body, nothing created, no persona write", async () => {
    const env = wsEnv(), o = await owner(env);
    assert.equal((await press(env, o)).status, 200);
    /* what an earlier press left: the same tools and state, but its bodies (and so their fingerprints) had the older descriptions */
    const st = JSON.parse((await state(env)).v);
    for (const t of A.tools) t.description = "Say ONLY what `text` and `results` contain: 2 or 3 by type and site name, never links, always from the internet, not the platform's data, to be checked at the source.";
    for (const k of Object.keys(st.tools)) st.tools[k].body_fp = "0".repeat(32);
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = 'websearch.connect'").bind(JSON.stringify(st)).run();
    const ids = Object.fromEntries(WEB_TOOLS.map(t => [t.key, toolOf(t.key).id]));
    calls.length = 0;
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.tools.map(x => [x.key, x.done]), WEB_TOOLS.map(t => [t.key, "updated"]));
    assert.deepEqual(writes().map(w => w.method + " " + w.url.slice(ANAM.length)), WEB_TOOLS.map(t => "PUT tools/" + ids[t.key]), "the same records, no new tool, no persona write");
    for (const t of WEB_TOOLS) { const a = toolOf(t.key); assert.equal(a.id, ids[t.key]); assert.equal(a.description, t.body.description, t.key + ": today's words"); assert.doesNotMatch(a.description, /site name|checked at the source/); }
    calls.length = 0;
    const r2 = await press(env, o);
    assert.deepEqual(r2.data.tools.map(x => x.done), ["unchanged", "unchanged", "unchanged", "unchanged"], "then nothing until they change again");
    assert.equal(writes().length, 0);
  });
  test("a persona changed meanwhile (409) → read again once, keep the id someone else added; twice → 409 persona_changed + persona + tools_done; the next press finishes", async () => {
    const env = wsEnv(), o = await owner(env);
    A.personaRace[JA] = 1;
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.ok(A.personas[JA].toolIds.includes(RACE) && ORIG[JA].every(x => A.personas[JA].toolIds.includes(x)), "the id added meanwhile stays");
    assert.equal(shape().filter(s => s === "GET " + P(JA)).length, 2, "read again once");
    const env2 = wsEnv(), o2 = await owner(env2);
    mock(); A.personaRace[JE] = 2;
    const x = await press(env2, o2);
    assert.deepEqual([x.status, x.data.code, x.data.step, x.data.persona], [409, "persona_changed", "persona_update", "janna_en"]);
    assert.deepEqual(x.data.tools_done, Object.fromEntries(WEB_TOOLS.map(t => [t.key, "created"])));
    assert.match(x.data.msg_ar, /جنة \(الإنجليزي\)/); assert.match(x.data.msg_en, /Janna's \(English\)/);
    assert.ok(A.personas[JE].toolIds.includes(RACE));
    calls.length = 0;
    const y = await press(env2, o2);
    assert.equal(y.status, 200, y.text);
    assert.deepEqual(y.data.tools.map(t => t.done), ["unchanged", "unchanged", "unchanged", "unchanged"]);
    assert.deepEqual(writes().map(w => w.method + " " + w.url.slice(ANAM.length)), ["PUT " + P(JE)], "only the missing attachment");
    assert.equal(A.tools.length, 4, "no second tool");
  });
  test("Janna EN missing (404) at the read → 502 persona_not_found + persona janna_en, nothing written; deleted between the read and its PUT → the tools are written, the next press attaches", async () => {
    const env = wsEnv(), o = await owner(env);
    delete A.personas[JE];
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code, r.data.step, r.data.persona, r.data.anam_status], [502, "persona_not_found", "persona_read", "janna_en", 404]);
    assert.match(r.data.msg_en, /Janna's \(English\) persona/); assert.deepEqual(r.data.tools_done, {});
    assert.equal(writes().length, 0); assert.equal(A.tools.length, 0);
    mock(); A.fail["persona_update:janna_en"] = 404;
    const x = await press(env, o);
    assert.deepEqual([x.status, x.data.code, x.data.step, x.data.persona], [502, "persona_not_found", "persona_update", "janna_en"]);
    assert.equal(Object.keys(x.data.tools_done).length, 4);
    delete A.fail["persona_update:janna_en"]; calls.length = 0;
    const y = await press(env, o);
    assert.equal(y.status, 200, y.text);
    assert.deepEqual(writes().map(w => w.method + " " + w.url.slice(ANAM.length)), ["PUT " + P(JE)]);
    assert.deepEqual(JSON.parse((await state(env)).v).connected, { bassem: true, janna: true });
  });
  test("duplicates are counted per tool (the copy on the persona is kept); Bassem's enabled share links → a warning (S7); a refused share-links read changes nothing", async () => {
    const env = wsEnv(), o = await owner(env);
    const mk = (id, name, c) => ({ id, name, type: "SERVER_WEBHOOK", description: "d", config: { url: "x", headers: {} }, createdAt: c, updatedAt: c });
    A.tools.push(mk(fake(700), "janna_web_search", "2026-11-01T00:00:00.000Z"), mk(fake(701), "janna_web_search", "2026-11-05T00:00:00.000Z"));
    A.personas[JA].toolIds = [...ORIG[JA], fake(701)];
    A.links = [{ id: fake(900), personaId: B, enabled: true, expiresAt: "2099-01-01T00:00:00.000Z" }, { id: fake(901), personaId: B, enabled: true, expiresAt: null }, { id: fake(902), personaId: B, enabled: false, expiresAt: null }, { id: fake(903), personaId: B, enabled: true, expiresAt: "2020-01-01T00:00:00.000Z" }];
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    const js = r.data.tools.find(t => t.key === "janna_web_search");
    assert.deepEqual([js.tool_id, js.duplicates, js.done], [fake(701), 1, "updated"]);
    assert.deepEqual(r.data.warnings, [{ code: "share_links", persona: "bassem", count: 2 }]);
    mock(); A.fail.share_links = 403;
    const env2 = wsEnv(), o2 = await owner(env2);
    const x = await press(env2, o2);
    assert.deepEqual([x.status, x.data.warnings], [200, []]);
  });
});

describe("websearch connect: keys, secrets, refusals", () => {
  test("no Anam key → 409 anam_key_missing, no Anam call and no secret made; the panel slot anam.api_key is used when there is no Worker secret", async () => {
    const env = env0(), o = await owner(env);
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code], [409, "anam_key_missing"]);
    assert.equal(calls.length, 0);
    assert.equal(await env.DB.prepare("SELECT name FROM cc_secrets WHERE name LIKE '%.tool_secret'").first(), null, "nothing generated before the key exists");
    assert.equal((await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: ANAM_PANEL } })).status, 200);
    const ok = await press(env, o);
    assert.equal(ok.status, 200, ok.text);
    assert.ok(calls.length >= 14 && calls.every(c => c.auth === "Bearer " + ANAM_PANEL), "the panel key");
    assert.deepEqual(ok.data.header_source, { bassem: "generated", janna: "generated" });
  });
  test("two secrets (S17): none anywhere → Bassem's and Janna's are made (32 random bytes each, sealed, no tail, one keys.set row each); each endpoint accepts ONLY its own; a second press reuses them", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.websearch_ready, r.data.websearch_missing, r.data.websearch_reason], [false, ["key", "provider"], "no_key"]);
    const bs = await getSecret(env, "bassem.tool_secret"), js = await getSecret(env, "janna.tool_secret");
    assert.match(bs, /^[0-9a-f]{64}$/); assert.match(js, /^[0-9a-f]{64}$/); assert.notEqual(bs, js);
    for (const n of ["bassem.tool_secret", "janna.tool_secret"]) { const row = await env.DB.prepare("SELECT * FROM cc_secrets WHERE name = ?").bind(n).first(); assert.deepEqual([row.tail, row.set_by], ["", "owner@mig.test"]); }
    assert.deepEqual(calls.filter(c => c.method === "POST").map(c => c.body.config.headers["X-MIG-Tool"]), [bs, bs, js, js]);
    forgetServiceKeys(env);
    const c = await webSearchConfig(env); assert.deepEqual([c.tool_secret, c.janna_secret], [bs, js]);
    const hit = (path, secret) => api(env, "POST", path, { body: { query: "steel", product: "steel" }, headers: { "X-MIG-Tool": secret } });
    assert.deepEqual([(await hit("/api/advisor/web", bs)).data.reason, (await hit("/api/janna/web", js)).data.reason, (await hit("/api/janna/hunt", js)).data.reason], ["no_key", "no_key", "no_key"], "each secret is accepted by its own endpoints (the search waits for a key)");
    for (const [path, wrong] of [["/api/advisor/web", js], ["/api/advisor/hunt", js], ["/api/janna/web", bs], ["/api/janna/hunt", bs]]) assert.equal((await hit(path, wrong)).status, 401, path + " refuses the other persona's secret");
    const ks = await audits(env, "keys.set");
    assert.deepEqual(ks.map(a => a.target_id).sort(), ["bassem.tool_secret", "janna.tool_secret"]);
    assert.ok(ks.every(a => /generated .*value not logged/.test(a.summary)));
    const g = (await api(env, "GET", K, { token: o.token })).data.websearch;
    assert.deepEqual([g.tool_secret.set, g.tool_secret.tail, g.janna_secret.set, g.janna_secret.tail, g.janna_secret.effective], [true, "", true, "", "panel"]);
    calls.length = 0;
    const r2 = await press(env, o);
    assert.deepEqual([r2.status, r2.data.header_source, writes().length], [200, { bassem: "panel", janna: "panel" }, 0]);
    assert.equal((await audits(env, "keys.set")).length, 2, "not generated twice");
  });
  test("an unreadable saved secret is replaced; no CONFIG_SECRET → 503 config_secret_missing before any Anam call; a header-unsafe JANNA_TOOL_SECRET → 409 tool_secret_invalid", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    await putSecret({ ...env, CONFIG_SECRET: "an-older-config-secret-0123456789abcdef" }, "janna.tool_secret", JSECRET, "someone");
    const r = await press(env, o);
    assert.equal(r.status, 200, r.text); assert.deepEqual(r.data.header_source, { bassem: "env", janna: "generated" });
    assert.match((await audits(env, "keys.set"))[0].summary, /janna\.tool_secret: replaced/);
    const env2 = env0({ ANAM_API_KEY: ANAMK, CONFIG_SECRET: "" }), o2 = await owner(env2);
    calls.length = 0;
    assert.deepEqual([(await press(env2, o2)).data.code, calls.length], ["config_secret_missing", 0]);
    const env3 = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET, JANNA_TOOL_SECRET: "has a space 0123456789abc" }), o3 = await owner(env3);
    const x = await press(env3, o3);
    assert.deepEqual([x.status, x.data.code, x.data.slot, x.data.source, calls.length], [409, "tool_secret_invalid", "janna.tool_secret", "env", 0]);
    assert.match(x.data.msg_en, /JANNA_TOOL_SECRET/);
  });
  test("Anam 401 / 403 / 500 / no answer → clear words per step and persona, its body never passed on; reads fail before anything is written", async () => {
    const env1 = env0({ ANAM_API_KEY: ANAMK }), o1 = await owner(env1);
    A.fail["persona_read:janna_ar"] = 401;
    let r = await press(env1, o1);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step, r.data.persona], [502, "anam_refused", 401, "persona_read", "janna_ar"]);
    assert.equal(writes().length, 0);
    assert.equal(await env1.DB.prepare("SELECT name FROM cc_secrets WHERE name LIKE '%.tool_secret'").first(), null, "no secret before the reads passed");
    noSecrets(r.text, UPSTREAM, ANAMK);
    mock(); A.fail.tool_create = 500;
    r = await press(env1, o1);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step, r.data.tool], [502, "anam_refused", 500, "tool_create", "bassem_web_search"]);
    noSecrets(r.text, UPSTREAM, ANAMK, await getSecret(env1, "bassem.tool_secret"), await getSecret(env1, "janna.tool_secret"));
    const env2 = wsEnv(), o2 = await owner(env2);
    mock(); A.fail["persona_update:bassem"] = 403;
    r = await press(env2, o2);
    assert.deepEqual([r.status, r.data.code, r.data.anam_status, r.data.step, r.data.persona], [502, "anam_refused", 403, "persona_update", "bassem"]);
    assert.equal(Object.keys(r.data.tools_done).length, 4); assert.ok(r.data.tool_id); assert.equal(r.data.tool_done, "created");
    assert.match(r.data.msg_en, /ANAM_API_KEY Worker secret/);
    noSecrets(r.text, UPSTREAM, ANAMK, SECRET, JSECRET);
    const aud = await audits(env2, "websearch.connect");
    assert.deepEqual(aud.map(a => [JSON.parse(a.after_json).ok, JSON.parse(a.after_json).persona, JSON.parse(a.after_json).anam_status]), [[false, "bassem", 403]]);
    mock(); A.fail.tools_list = "network";
    const env3 = wsEnv(), o3 = await owner(env3);
    r = await press(env3, o3);
    assert.deepEqual([r.status, r.data.code, r.data.step], [502, "anam_unreachable", "tools_list"]);
    assert.equal(writes().length, 0);
    noSecrets(JSON.stringify(await audits(env3, "websearch.connect")), SECRET, JSECRET, ANAMK, UPSTREAM);
  });
  test("a persona showing more tools than toolIds → 502 anam_shape, nothing written; a press slower than CONNECT.budget_ms stops between steps (504 connect_slow + tools_done) and the next one finishes", async () => {
    const env = wsEnv(), o = await owner(env);
    A.personas[JE].tools = [...A.personas[JE].tools, { type: "client", name: "inline_without_id" }];
    const r = await press(env, o);
    assert.deepEqual([r.status, r.data.code, r.data.step, r.data.persona, writes().length, A.tools.length], [502, "anam_shape", "persona_read", "janna_en", 0, 0]);
    const env2 = wsEnv(), o2 = await owner(env2);
    mock(); let skew = 0; Date.now = () => realNow() + skew;
    A.onCreate = t => { if (t.name === "bassem_web_hunt") skew = CONNECT.budget_ms + 1000; };
    const x = await press(env2, o2);
    Date.now = realNow;
    assert.deepEqual([x.status, x.data.code, x.data.step], [504, "connect_slow", "tool:janna_web_search"]);
    assert.deepEqual(x.data.tools_done, { bassem_web_search: "created", bassem_web_hunt: "created" });
    await env2.DB.prepare("DELETE FROM cc_locks").run(); // the skewed clock wrote a lock far in the future
    calls.length = 0;
    const y = await press(env2, o2);
    assert.equal(y.status, 200, y.text);
    assert.deepEqual(y.data.tools.map(t => t.done), ["unchanged", "unchanged", "created", "created"], "the state saved after each tool: no second write of the first two");
  });
  test("non-owner → 403 owner_only, team roles → their page, signed out → 401; 10 presses per hour; one at a time", async () => {
    await awayFromHourEdge();
    const env = wsEnv();
    for (const role of ["admin", "editor", "support"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role, role: role === "admin" ? "admin" : "user" });
      assert.deepEqual([(await api(env, "POST", C, { token: s.token, body: {} })).data.code], ["owner_only"], role);
    }
    const seo = await member(env, "u-seo", "seo@mig.test", { staff: "seo" });
    assert.equal((await api(env, "POST", C, { token: seo.token, body: {} })).status, 403);
    assert.equal((await api(env, "POST", C, { headers: { "X-Platform-Key": "pk-test-123" }, body: {} })).data.code, "owner_only");
    assert.equal((await api(env, "POST", C, { body: {} })).status, 401);
    assert.equal(calls.length, 0);
    const o = await owner(env);
    for (let i = 0; i < CONNECT.per_hour; i++) assert.equal((await press(env, o)).status, 200, "press " + (i + 1));
    assert.deepEqual([(await press(env, o)).data.code], ["rate_limited"]);
    assert.equal(A.tools.length, 4, "four tools however often it is pressed");
    const env2 = wsEnv(), o2 = await owner(env2);
    await env2.DB.prepare("INSERT INTO cc_locks (k, until, owner) VALUES ('keys:websearch.connect', ?, 'other')").bind(new Date(Date.now() + 60000).toISOString()).run();
    calls.length = 0;
    const b = await press(env2, o2);
    assert.deepEqual([b.status, b.data.code, calls.length], [409, "connect_busy", 0]);
    assert.equal(CONNECT.lock_ms, 150000);
  });
});

describe("websearch connect: the panel view and secrecy", () => {
  test("GET /keys → websearch.connect: the checklist per tool and persona; a changed «سر أدوات جنة» → secret_changed until the next press rewrites Janna's two headers", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK, TOOL_SECRET: SECRET }), o = await owner(env);
    assert.equal((await api(env, "PUT", K + "/janna.tool_secret", { token: o.token, body: { value: JSECRET } })).status, 200);
    let c = (await api(env, "GET", K, { token: o.token })).data.websearch.connect;
    assert.deepEqual([c.connected, c.connected_bassem, c.connected_janna, c.secret_changed, c.last, c.endpoint], [false, false, false, false, null, C]);
    assert.deepEqual(c.tools.map(t => [t.key, t.written, t.personas.map(p => p.key)]), [["bassem_web_search", false, ["bassem"]], ["bassem_web_hunt", false, ["bassem"]], ["janna_web_search", false, ["janna_ar", "janna_en"]], ["janna_web_hunt", false, ["janna_ar", "janna_en"]]]);
    await press(env, o);
    c = (await api(env, "GET", K, { token: o.token })).data.websearch.connect;
    assert.deepEqual([c.connected, c.connected_bassem, c.connected_janna, c.connected_all, c.secret_changed, c.last.ok, c.by], [true, true, true, true, false, true, "owner@mig.test"]);
    assert.ok(c.tools.every(t => t.written && t.personas.every(p => p.attached)));
    assert.ok(!/secret_fp|body_fp/.test(JSON.stringify(c)), "no fingerprint leaves the Worker");
    assert.equal((await api(env, "PUT", K + "/janna.tool_secret", { token: o.token, body: { value: SECRET2 } })).status, 200);
    c = (await api(env, "GET", K, { token: o.token })).data.websearch.connect;
    assert.deepEqual([c.secret_changed, c.tools.map(t => t.secret_changed)], [true, [false, false, true, true]]);
    calls.length = 0;
    const r = await press(env, o);
    assert.deepEqual(r.data.tools.map(t => t.done), ["unchanged", "unchanged", "updated", "updated"]);
    assert.deepEqual(writes().map(w => [w.method, w.body.config.headers["X-MIG-Tool"]]), [["PUT", SECRET2], ["PUT", SECRET2]]);
    assert.equal((await api(env, "GET", K, { token: o.token })).data.websearch.connect.secret_changed, false);
    mock(); A.fail["persona_read:bassem"] = 503;
    await press(env, o);
    const last = (await api(env, "GET", K, { token: o.token })).data.websearch.connect.last;
    assert.deepEqual([last.ok, last.code, last.anam_status, last.step, last.persona], [false, "anam_refused", 503, "persona_read", "bassem"]);
  });
  test("the secrets and the Anam key never appear in an answer, the audit log, a setting, a lock, a rate-limit row or a log line — only in Anam's request headers", async () => {
    const env = env0({ ANAM_API_KEY: ANAMK }), o = await owner(env);
    const start = SEEN.length;
    assert.equal((await press(env, o)).status, 200);
    const bs = await getSecret(env, "bassem.tool_secret"), js = await getSecret(env, "janna.tool_secret");
    await api(env, "PUT", K + "/janna.tool_secret", { token: o.token, body: { value: SECRET2 } });
    mock(); A.fail.tool_create = 500;
    assert.equal((await press(env, o)).status, 502);
    mock();
    assert.equal((await press(env, o)).status, 200);
    await api(env, "GET", K, { token: o.token });
    await api(env, "GET", "/api/admin/cc/audit", { token: o.token });
    for (const t of SEEN.slice(start)) noSecrets(t, bs, js, SECRET2, ANAMK);
    for (const tbl of ["cc_audit", "cc_settings", "cc_locks", "rl"]) noSecrets(JSON.stringify((await env.DB.prepare(`SELECT * FROM ${tbl}`).all()).results), bs, js, SECRET2, ANAMK);
    noSecrets(JSON.stringify((await env.DB.prepare("SELECT name, sealed, tail, set_by FROM cc_secrets").all()).results), bs, js, SECRET2, ANAMK);
    noSecrets(logs.join("\n"), bs, js, SECRET2, ANAMK);
    for (const c of calls) { noSecrets(c.url, bs, js, SECRET2, ANAMK); if (c.method !== "POST" && c.method !== "PUT") noSecrets(c.raw, SECRET2); }
    assert.ok(calls.some(c => c.body && c.body.config && c.body.config.headers["X-MIG-Tool"] === SECRET2), "the header carries Janna's new secret to Anam");
  });
  test("every answer of this file was free of the test secrets and keys", () => {
    for (const t of SEEN) noSecrets(t, SECRET, SECRET2, JSECRET, ANAMK, ANAM_PANEL, UPSTREAM, CFG);
  });
});
