// node --test for the speed plan of 2026-11-20 («زود سرعه استجابه باسم وجنه»), Worker side:
//   1 worker-tool-fast   Anam's webhooks (janna_lookup, platform_item, knowledge_lookup), the health check and the timing beacon skip
//                        ccBoot; ccBoot's four loaders and the four sealed slots are read together; rateOk is one statement
//   10 call-start-token  the session token: the block check, the hourly limit and Bassem's sign-in run together (refusals unchanged), the
//                        day is counted in one statement, Server-Timing carries «boot»
//   11 timing beacon     POST /api/janna/timing → 204 + ONE log line of numbers (privacy guard), same origin only
// D1 = node:sqlite with the real schema.sql; nothing is sent anywhere (Anam's token endpoint is mocked). Run: cd worker && npm test
import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { CC } from "../src/index.js";
import { rateOk } from "../src/common.js";
import { loadServiceKeys, forgetServiceKeys } from "../src/service-keys.js";
import { ANAM_TOKEN_URL } from "../src/janna-session.js";
import { handleTiming, timingLine, LOG_PER_MIN, TIMING_MAX_BODY } from "../src/live-timing.js";
import { putSecret } from "../src/crypto.js";
import { ipHash, cairoDay } from "../src/common.js";
import { issueSession } from "../src/auth.js";
import { D1 } from "./helpers.mjs";
import { resetMembers } from "../src/lookup-members.js";

const SITE = "https://madeinegyptgate.com";
const KEY = "anam-test-key-speed-0f3a"; // fake: never a real key
/* every D1 statement prepared on this env, by SQL */
function counted(env) { const prep = env.DB.prepare.bind(env.DB), seen = []; env.DB.prepare = sql => { seen.push(sql); return prep(sql); }; return seen; }
/* reads answer one macrotask later (a real D1 is a round trip) and the number in flight at once is recorded */
function slowDb(env) {
  const prep = env.DB.prepare.bind(env.DB), st = { inFlight: 0, max: 0, reads: [] };
  const later = v => new Promise(res => setImmediate(() => res(v)));
  const read = async (sql, f) => { st.inFlight++; st.max = Math.max(st.max, st.inFlight); st.reads.push(sql); try { return await later(await f()); } finally { st.inFlight--; } };
  const wrap = (b, sql) => new Proxy(b, { get(t, k) {
    if (k === "bind") return (...a) => wrap(t.bind(...a), sql);
    if (k === "all") return () => read(sql, () => t.all());
    if (k === "first") return col => read(sql, () => t.first(col));
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
  } });
  env.DB.prepare = sql => wrap(prep(sql), sql);
  return st;
}
const req = (path, { method = "GET", body, headers = {} } = {}) => new Request(SITE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

describe("1 worker-tool-fast: Anam's webhooks and the health check skip ccBoot", () => {
  test("POST /api/janna/lookup, POST /api/janna/item, GET /api/janna/health: not one D1 statement (they read only the bundled data)", async () => {
    resetMembers(); // this isolate's memo of the members' records (src/lookup-members.js) starts empty
    const env = { DB: new D1() }, seen = counted(env);
    const l = await worker.fetch(req("/api/janna/lookup", { method: "POST", body: { section: "tenders", query: "حديد" } }), env, {});
    assert.equal(l.status, 200); assert.ok((await l.json()).count > 0);
    const i = await worker.fetch(req("/api/janna/item", { method: "POST", body: { section: "tenders", id: "eg-tnd-003" } }), env, {});
    assert.equal((await i.json()).found, true);
    const h = await worker.fetch(req("/api/janna/health"), env, {});
    assert.equal((await h.json()).ok, true);
    assert.deepEqual(seen, [], seen.join("\n"));
    /* U16 (src/lookup-members.js): the directory / product / customers sections read the members' approved records — the two member
       tables only, once per isolate per 10 minutes (never ccBoot's loaders); the next call reads nothing */
    const t = await worker.fetch(req("/api/janna/lookup/", { method: "POST", body: { section: "factories", query: "بلاستيك" } }), env, {});
    assert.equal(t.status, 200, "a trailing slash is the same route");
    assert.equal(seen.length, 2, seen.join("\n")); assert.ok(seen.every(s => /FROM cc_member_products|FROM cc_company_requests/.test(s)), seen.join("\n"));
    const t2 = await worker.fetch(req("/api/janna/lookup", { method: "POST", body: { section: "customers", query: "ورق، بلاستيك" } }), env, {});
    assert.equal(t2.status, 200); assert.equal(seen.length, 2, "the memo answers for 10 minutes: " + seen.join("\n"));
  });
  test("every other route still boots the Control Center (plans matrix, mail config, service keys, feature switches)", async () => {
    const env = { DB: new D1() }, seen = counted(env);
    const r = await worker.fetch(req("/api/settings"), env, {});
    assert.equal(r.status, 200);
    for (const rx of [/FROM cc_plans/, /scope = 'mail'/, /FROM cc_secrets/, /k = \? AND scope = 'system'/]) assert.ok(seen.some(s => rx.test(s)), String(rx));
  });
  test("ccBoot's four loaders run together, and the four sealed slots too: a cold isolate waits ~2 round trips, not 9 in a row", async () => {
    const env = { DB: new D1(), CONFIG_SECRET: "c".repeat(40) };
    for (const [slot, v] of [["anam.api_key", "anam-slot"], ["respondio.token", "rio-slot"]]) await putSecret(env, slot, v, "test");
    forgetServiceKeys(env);
    const st = slowDb(env);
    await CC.acc.ccBoot(env, CC);
    assert.ok(st.reads.length >= 8, st.reads.join("\n"));
    assert.ok(st.max >= 4, "loaders and slots in flight together: " + st.max);
    const v = await loadServiceKeys(env); // the memo the boot filled, values intact
    assert.deepEqual([v.anam_key, v.anam_state, v.respondio_token, v.respondio_state, v.ws_state, v.tool_state], ["anam-slot", "ok", "rio-slot", "ok", "none", "none"]);
  });
  test("a failing loader does not stop the others (each keeps its own default)", async () => {
    const env = { DB: new D1(), CONFIG_SECRET: "c".repeat(40) };
    await putSecret(env, "anam.api_key", "anam-slot-2", "test");
    forgetServiceKeys(env);
    const prep = env.DB.prepare.bind(env.DB);
    env.DB.prepare = sql => { if (/FROM cc_plans/.test(sql)) throw new Error("D1 hiccup"); return prep(sql); };
    await CC.acc.ccBoot(env, CC);
    assert.equal((await loadServiceKeys(env)).anam_key, "anam-slot-2");
  });
  test("rateOk: one statement per call (INSERT … RETURNING), same answers, same window and expiry", async () => {
    const env = { DB: new D1() }, seen = counted(env), now = Date.parse("2026-11-20T10:00:30Z");
    const answers = [];
    for (let i = 0; i < 4; i++) answers.push(await rateOk(env, "t|x", 3, 60, now));
    assert.deepEqual(answers, [true, true, true, false]);
    assert.equal(seen.length, 4); assert.ok(seen.every(s => /RETURNING n$/.test(s)));
    const row = await env.DB.prepare("SELECT * FROM rl WHERE k = ?").bind("t|x|" + Math.floor(now / 60000)).first();
    assert.deepEqual([row.n, row.exp], [4, "2026-11-20T10:01:00.000Z"]);
    assert.equal(await rateOk(env, "t|x", 3, 60, now + 60000), true, "the next window starts again");
  });
});

describe("10 call-start-token: the checks run together; the day is counted in one statement; Server-Timing «boot»", () => {
  let realFetch, calls;
  beforeEach(() => { realFetch = globalThis.fetch; calls = []; globalThis.fetch = async (url, init = {}) => { if (String(url) !== ANAM_TOKEN_URL) throw new Error("unexpected fetch " + url); calls.push(init); return new Response(JSON.stringify({ sessionToken: "tok-" + calls.length }), { status: 200, headers: { "Content-Type": "application/json" } }); }; });
  afterEach(() => { globalThis.fetch = realFetch; });
  const env0 = extra => ({ DB: new D1(), ANAM_API_KEY: KEY, ADVISOR_SECRET: "adv-secret-for-speed-tests", JANNA_VISITOR_CONTEXT: "0", ...(extra || {}) });
  const session = (env, body, { ip = "198.51.100.30", token } = {}) => worker.fetch(new Request(SITE + "/api/janna/session", { method: "POST", headers: { Origin: SITE, "CF-Connecting-IP": ip, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  test("the refusals keep today's order: a blocked network → 403 before the sign-in check; over the hourly limit → 429 before it", async () => {
    const env = env0({ JANNA_IP_SESSIONS_PER_HOUR: "1" }), ip = "198.51.100.31";
    const ih = await ipHash(new Request(SITE, { headers: { "CF-Connecting-IP": ip } }), env);
    await env.DB.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('ip', ?, 'test', ?)").bind(ih, new Date().toISOString()).run();
    const b = await session(env, { agent: "bassem" }, { ip });
    assert.deepEqual([b.status, (await b.json()).error], [403, "blocked"]);
    assert.equal((await session(env, { agent: "bassem" }, { ip: "198.51.100.32" })).status, 401, "first call of a network: the sign-in decides");
    const r = await session(env, { agent: "bassem" }, { ip: "198.51.100.32" });
    assert.deepEqual([r.status, (await r.json()).error], [429, "rate_limited"]);
    assert.equal(calls.length, 0, "Anam never asked");
  });
  test("Bassem's sign-in is read beside the block check and the limit (one round trip, not three)", async () => {
    const env = env0(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at, last_seen_at) VALUES ('m-speed', 'Co', 'speed@co.test', 'strategic', 1, ?, ?, 'user', '2099-01-01T00:00:00.000Z', ?, ?)").bind(now, now, now, now).run();
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = 'm-speed'").first();
    const token = (await issueSession(env, m, { scope: "full" })).token;
    const st = slowDb(env);
    const r = await session(env, { agent: "bassem", member_context: false }, { token });
    assert.equal(r.status, 200, await r.clone().text());
    const iBlock = st.reads.findIndex(s => /FROM blocks/.test(s)), iSess = st.reads.findIndex(s => /FROM auth_sessions/.test(s));
    assert.ok(iBlock >= 0 && iSess >= 0); assert.ok(st.max >= 3, "block check, limit and sign-in in flight together: " + st.max);
  });
  test("the day is counted in one statement (RETURNING); a refusal at the cap still gives the count back", async () => {
    const env = env0({ JANNA_DAILY_SESSIONS: "1" }), seen = counted(env);
    assert.equal((await session(env, { agent: "janna" }, { ip: "198.51.100.33" })).status, 200);
    const day = seen.filter(s => /^INSERT INTO rl .* RETURNING n$/.test(s));
    assert.equal(day.length, 2, "the network limit + the day: one statement each"); assert.ok(!seen.includes("SELECT n FROM rl WHERE k = ?"), "no read-back after counting");
    const capped = await session(env, { agent: "janna" }, { ip: "198.51.100.34" });
    assert.deepEqual([capped.status, (await capped.json()).error], [429, "daily_cap"]);
    assert.equal(await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind("jsessday|" + cairoDay()).first("n"), 1, "the refused one was given back");
  });
  test("Server-Timing starts with «boot» (the Control Center boot before the handler), milliseconds only", async () => {
    const env = env0();
    const r = await session(env, { agent: "janna" }, { ip: "198.51.100.35" });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("Server-Timing"), /^boot;dur=\d+, checks;dur=\d+, ctx;dur=\d+, token;dur=\d+, total;dur=\d+$/);
  });
});

describe("11 POST /api/janna/timing: the call page's start timing — 204 and one line of numbers, nothing else", () => {
  const beacon = (body, { origin = SITE, referer, method = "POST", raw } = {}) => new Request(SITE + "/api/janna/timing", { method,
    headers: { "Content-Type": "text/plain;charset=UTF-8", ...(origin ? { Origin: origin } : {}), ...(referer ? { Referer: referer } : {}), "CF-Connecting-IP": "203.0.113.77", "User-Agent": "Mozilla/5.0 test" },
    body: method === "POST" ? (raw !== undefined ? raw : JSON.stringify(body)) : undefined });
  const GOOD = { persona: "bassem", lang: "ar", token: 812.4, sdk: 640, mic: 905, stream: 1210, connected: 2950, ready: 3300, video: 3420, play: 3500, voice: 4880,
    server: "boot;dur=12, checks;dur=31, ctx;dur=140, persona;dur=388, wait;dur=0, token;dur=560, total;dur=731", relay: 1, region: "eu-west-1", reasoning: [[300, 1450], [280, 990]],
    session_id: "sess-abc", email: "a@b.co", url: "https://madeinegyptgate.com/advisor/?t=secret", note: "free text", ua: "x" };
  let logs;
  beforeEach(() => { logs = mock.method(console, "log", () => {}); });
  afterEach(() => logs.mock.restore());
  const lines = () => logs.mock.calls.map(c => c.arguments.join(" "));
  test("a valid beacon → 204, no body, one line «live-timing {…}» rebuilt from the allowed fields only; no D1", async () => {
    const env = { DB: new D1() }, seen = counted(env);
    const r = await worker.fetch(beacon(GOOD), env, {});
    assert.equal(r.status, 204); assert.equal(await r.text(), ""); assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
    assert.deepEqual(seen, []);
    assert.equal(lines().length, 1);
    const [tag, json] = [lines()[0].slice(0, 12), lines()[0].slice(12)];
    assert.equal(tag, "live-timing ");
    assert.deepEqual(JSON.parse(json), { persona: "bassem", lang: "ar", token: 812, sdk: 640, mic: 905, stream: 1210, connected: 2950, ready: 3300, video: 3420, play: 3500, voice: 4880,
      server: { boot: 12, checks: 31, ctx: 140, persona: 388, wait: 0, token: 560, total: 731 }, relay: 1, region: "eu-west-1", reasoning: [[300, 1450], [280, 990]] });
    for (const s of ["sess-abc", "a@b.co", "secret", "free text", "203.0.113.77", "Mozilla"]) assert.ok(!lines()[0].includes(s), "never logged: " + s);
  });
  test("dropped without a line: another origin, no origin, a broken / oversized body, no mark, an unknown persona; GET 405, OPTIONS 204 without CORS", async () => {
    const env = {};
    for (const r of [beacon(GOOD, { origin: "https://evil.example" }), beacon(GOOD, { origin: "" }), beacon(null, { raw: "{nope" }), beacon(null, { raw: JSON.stringify({ ...GOOD, pad: "x".repeat(TIMING_MAX_BODY) }) }),
      beacon({ persona: "janna", lang: "ar" }), beacon({ ...GOOD, persona: "admin" }), beacon(null, { raw: "[1,2]" }), beacon(null, { raw: "" })]) assert.equal((await worker.fetch(r, env, {})).status, 204);
    assert.deepEqual(lines(), []);
    assert.equal((await worker.fetch(beacon(GOOD, { referer: SITE + "/advisor/", origin: "" }), env, {})).status, 204);
    assert.equal(lines().length, 1, "a same-site Referer is enough when the browser sends no Origin");
    assert.equal((await worker.fetch(beacon(null, { method: "GET" }), env, {})).status, 405);
    const o = await worker.fetch(beacon(null, { method: "OPTIONS" }), env, {});
    assert.deepEqual([o.status, o.headers.get("Access-Control-Allow-Origin")], [204, null]);
  });
  test("the fields: whole ms within 0…10 min, a short region code, relay 0/1, Server-Timing string or object, ≤ 20 reasoning pairs", () => {
    assert.equal(timingLine({ persona: "janna", voice: -1 }), null, "no valid mark");
    assert.equal(timingLine({ persona: "janna", voice: 600001 }), null);
    assert.deepEqual(timingLine({ persona: "janna", lang: "fr", voice: "1500", ready: true, token: null }), { persona: "janna", lang: "ar", voice: 1500 });
    assert.deepEqual(timingLine({ persona: "janna", voice: 1, server: { checks: 3, total: 9, bad: 4 } }).server, { checks: 3, total: 9 });
    assert.equal(timingLine({ persona: "janna", voice: 1, server: "x;dur=1, evil;dur=9" }).server, undefined);
    for (const bad of ["eu west", "<script>", "a".repeat(30), "1.2.3.4", "us-east-1; DROP"]) assert.equal(timingLine({ persona: "janna", voice: 1, region: bad }).region, undefined, bad);
    assert.equal(timingLine({ persona: "janna", voice: 1, relay: 0 }).relay, undefined);
    const many = Array.from({ length: 30 }, (_, i) => [i, i + 1]);
    assert.equal(timingLine({ persona: "janna", voice: 1, reasoning: many }).reasoning.length, 20);
    assert.equal(timingLine({ persona: "janna", voice: 1, reasoning: [[5, 2], ["x", 3], 7] }).reasoning, undefined, "first ≤ last, numbers only");
  });
  /* review 2026-11-20 CW-1: exactly what data/janna-live.js sends (tmBeacon at «voice», tmTurnsSend at the call's end) — one line each */
  test("the call page's own bodies: k start {p, lang, relay, region, ms, srv} and k turns {p, lang, region, turns [[r0, r1, words]], -1 = none}", async () => {
    const start = { k: "start", p: "janna", lang: "en", relay: 0, region: "eu-west-1", ms: { token: 812, sdk: 1020, mic: 1300, stream: 1400, connected: 2900, ready: 3100, video: 3300, play: 3350, voice: 4100 },
      srv: { boot: 9, checks: 30, ctx: 120, persona: 400, wait: 0, token: 900, total: 1500 } };
    const turns = { k: "turns", p: "bassem", lang: "ar", region: "eu-west-1", turns: [[640, 1900, 2300], [-1, -1, 1800], [-1, -1, -1], [700, 300, 900], ["x", 1, 2], [5, 9, 12, 4]] };
    for (const b of [start, turns]) assert.equal((await worker.fetch(beacon(b), {}, {})).status, 204);
    assert.equal(lines().length, 2, "one line per beacon");
    assert.deepEqual(JSON.parse(lines()[0].slice(12)), { persona: "janna", lang: "en", k: "start", token: 812, sdk: 1020, mic: 1300, stream: 1400, connected: 2900, ready: 3100, video: 3300, play: 3350, voice: 4100,
      server: { boot: 9, checks: 30, ctx: 120, persona: 400, wait: 0, token: 900, total: 1500 }, region: "eu-west-1" });
    assert.deepEqual(JSON.parse(lines()[1].slice(12)), { persona: "bassem", lang: "ar", k: "turns", region: "eu-west-1", turns: [[640, 1900, 2300], [-1, -1, 1800]] },
      "a row with no value, a first chunk after the last, a non-number or more than 3 values is dropped");
    assert.equal(timingLine({ k: "turns", p: "janna", turns: [[-1, -1, -1]] }), null, "no mark and no turn: no line");
    assert.equal(timingLine({ k: "turns", p: "janna", turns: Array.from({ length: 30 }, (_, i) => [i, i + 1, i + 2]) }).turns.length, 20);
    assert.equal(timingLine({ k: "start", p: "admin", ms: { voice: 1 } }), null, "persona janna | bassem only");
    assert.equal(timingLine({ k: "other", p: "janna", ms: { voice: 1 } }).k, undefined, "an unknown kind is not logged");
  });
  test("one isolate logs at most LOG_PER_MIN lines a minute (a flood cannot fill the logs)", async () => {
    const t0 = Date.parse("2031-01-01T00:00:10Z");
    for (let i = 0; i < LOG_PER_MIN + 5; i++) assert.equal((await handleTiming(beacon(GOOD), {}, {}, t0 + i)).status, 204);
    assert.equal(lines().length, LOG_PER_MIN);
    await handleTiming(beacon(GOOD), {}, {}, t0 + 60000);
    assert.equal(lines().length, LOG_PER_MIN + 1, "the next minute counts again");
  });
});
