// node --test for POST /api/janna/session (src/janna-session.js): live-call session tokens for the Anam JS SDK, so the site's video
// carries no third-party mark. Anam is never called: fetch is mocked and only https://api.anam.ai/v1/auth/session-token is allowed.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { handleJannaSession, PERSONAS, ANAM_TOKEN_URL, MAX_SESSION_SEC, TOKEN_TTL_SEC, ANAM_TIMEOUT_MS, originOf, originOk, perHour, dailyCap } from "../src/janna-session.js";
import { issueSession } from "../src/auth.js";
import { signToken } from "../src/advisor.js";
import { putSecret } from "../src/crypto.js";
import { ipHash, cairoDay } from "../src/common.js";
import { D1 } from "./helpers.mjs";
import { forgetPlans, resetPlans } from "../src/acc-plans.js";
import { forgetServiceKeys } from "../src/service-keys.js";

const SITE = "https://madeinegyptgate.com";
const KEY = "anam-test-key-7c1e9d0b42"; // fake: never a real key
const CC_SQL = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const JANNA_AR = "5f06d835-22cc-4460-b412-84cefa9e565b", JANNA_EN = "e5101653-65b4-44a6-85e5-ec2e78f82685", BASSEM = "19ef9078-5252-42a4-bbdf-9a3c4a38a4be";

let calls, realFetch, reply;
/* the mocked Anam API: reply() decides the answer; anything but the token endpoint fails the test */
function mockAnam(fn) {
  calls = []; reply = fn || (() => new Response(JSON.stringify({ sessionToken: "tok-" + (calls.length) }), { status: 200, headers: { "Content-Type": "application/json" } }));
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u !== ANAM_TOKEN_URL) throw new Error("unexpected fetch " + u);
    calls.push({ url: u, method: init.method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
    return reply(init);
  };
}
const env0 = extra => ({ DB: new D1(), ANAM_API_KEY: KEY, ADVISOR_SECRET: "adv-secret-for-tests", ADMIN_EMAILS: "boss@mig.test", ...(extra || {}) });
function rq(body, { origin = SITE, referer, ip = "198.51.100.7", token, method = "POST", path = "/api/janna/session", raw } = {}) {
  const h = { "CF-Connecting-IP": ip };
  if (origin) h.Origin = origin;
  if (referer) h.Referer = referer;
  if (token) h.Authorization = "Bearer " + token;
  const hasBody = method !== "GET" && method !== "OPTIONS" && (raw !== undefined || body !== undefined);
  if (hasBody) h["Content-Type"] = "application/json";
  return new Request(SITE + path, { method, headers: h, body: hasBody ? (raw !== undefined ? raw : JSON.stringify(body)) : undefined });
}
async function call(env, body, opts) {
  const res = await worker.fetch(rq(body, opts), env, { waitUntil() {} });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch (e) { /* empty */ }
  return { status: res.status, data, text, headers: res.headers };
}
const NOW = new Date().toISOString();
async function member(env, { id, email, plan = "visitor", role = "user", verified = 1, plan_expires = "", email_verified_at = NOW }) {
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at) VALUES (?, 'Test Co', ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, plan, verified, NOW, NOW, role, plan_expires, email_verified_at).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
const tokenFor = async (env, m, scope = "full") => (await issueSession(env, m, { scope })).token;
const dayCount = async env => (await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind("jsessday|" + cairoDay()).first("n")) || 0;

beforeEach(() => { realFetch = globalThis.fetch; mockAnam(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("janna session: the Anam request", () => {
  test("Janna AR: one token, the fixed persona, no Anam disclosure mark, one session, the key only in the Authorization header", async () => {
    const env = env0();
    const r = await call(env, { agent: "janna", lang: "ar" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data, { sessionToken: "tok-1", agent: "janna", lang: "ar", expires_in: TOKEN_TTL_SEC, max_session_sec: MAX_SESSION_SEC });
    assert.equal(MAX_SESSION_SEC, 7200);
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.method, "POST");
    assert.equal(c.headers.Authorization, "Bearer " + KEY);
    assert.equal(c.headers["Content-Type"], "application/json");
    assert.ok(c.signal, "the upstream call can time out");
    assert.deepEqual(c.body, { personaConfig: { personaId: JANNA_AR }, sessionOptions: { showAIAvatarDisclosure: false }, expiresInSeconds: TOKEN_TTL_SEC, maxSessions: 1, clientLabel: "madeinegyptgate-janna-ar" });
    assert.ok(TOKEN_TTL_SEC >= 120 && TOKEN_TTL_SEC <= 3600, "Anam accepts 120–3600 s");
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE); // reflected, never "*"
    assert.ok(!r.text.includes(KEY));
    assert.equal(await dayCount(env), 1);
  });
  test("Janna EN uses the English persona; defaults are janna + ar", async () => {
    const env = env0();
    assert.equal((await call(env, { agent: "janna", lang: "en" })).status, 200);
    assert.equal(calls[0].body.personaConfig.personaId, JANNA_EN);
    assert.equal(calls[0].body.clientLabel, "madeinegyptgate-janna-en");
    const d = await call(env, {});
    assert.deepEqual([d.status, d.data.agent, d.data.lang, calls[1].body.personaConfig.personaId], [200, "janna", "ar", JANNA_AR]);
    assert.equal((await call(env, { agent: "JANNA", lang: "EN" })).data.lang, "en"); // case-insensitive
  });
  test("the page can never choose the persona or the session options", async () => {
    const env = env0();
    const r = await call(env, { agent: "janna", lang: "ar", personaId: "11111111-1111-1111-1111-111111111111", persona_id: "x", personaConfig: { personaId: "evil" }, sessionOptions: { showAIAvatarDisclosure: true }, maxSessions: 99 });
    assert.equal(r.status, 200);
    assert.deepEqual(calls[0].body, { personaConfig: { personaId: JANNA_AR }, sessionOptions: { showAIAvatarDisclosure: false }, expiresInSeconds: TOKEN_TTL_SEC, maxSessions: 1, clientLabel: "madeinegyptgate-janna-ar" });
  });
  test("the allow-list holds exactly the three live personas", () => {
    assert.deepEqual(PERSONAS, { janna: { ar: JANNA_AR, en: JANNA_EN }, bassem: { ar: BASSEM, en: BASSEM } });
    assert.ok(Object.isFrozen(PERSONAS) && Object.isFrozen(PERSONAS.janna));
  });
  test("the same persona ids as the page's widget path (data/janna-live.js AGENTS)", () => {
    const page = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
    const line = (page.match(/var AGENTS = \{[^\n]*\};/) || [""])[0];
    assert.ok(line, "AGENTS in data/janna-live.js");
    assert.deepEqual([...new Set(line.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g))].sort(), [JANNA_AR, JANNA_EN, BASSEM].sort());
    assert.ok(line.indexOf(JANNA_EN) < line.indexOf(JANNA_AR), "EN ? English id : Arabic id"); // janna: EN ? "e510…" : "5f06…"
  });
});

describe("janna session: configuration and request checks", () => {
  test("no ANAM_API_KEY → 503 anam_not_configured (the page keeps the widget); nothing is called or counted", async () => {
    const env = env0({ ANAM_API_KEY: "" });
    const r = await call(env, { agent: "janna", lang: "ar" });
    assert.equal(r.status, 503);
    assert.equal(r.data.error, "anam_not_configured");
    assert.equal(calls.length, 0);
    assert.equal(await dayCount(env), 0);
    const nodb = await call({ ANAM_API_KEY: "" }, { agent: "bassem" }); // also without a database
    assert.deepEqual([nodb.status, nodb.data.error], [503, "anam_not_configured"]);
  });
  test("the key saved in the Control Center (sealed slot) works when there is no secret; an unreadable slot is 'not configured'", async () => {
    const env = env0({ ANAM_API_KEY: undefined, CONFIG_SECRET: "c".repeat(40) });
    await env.DB.exec(CC_SQL);
    await putSecret(env, "anam.api_key", "anam-cc-slot-key-5521", "test");
    assert.equal((await call(env, { agent: "janna" })).status, 200);
    assert.equal(calls[0].headers.Authorization, "Bearer anam-cc-slot-key-5521");
    /* the variants below share env.DB: a CONFIG_SECRET changes only with a deploy, i.e. in a NEW isolate, which starts without this
       isolate's 60-s view of the keys (service-keys.js memo) — forget it, as that isolate would */
    forgetServiceKeys(env);
    const noSecret = { ...env, CONFIG_SECRET: undefined }; // slot set, but CONFIG_SECRET missing → cannot be read
    assert.equal((await call(noSecret, { agent: "janna" })).data.error, "anam_not_configured");
    const noTable = env0({ ANAM_API_KEY: undefined, CONFIG_SECRET: "c".repeat(40) }); // a database without migration 0006
    assert.equal((await call(noTable, { agent: "janna" })).data.error, "anam_not_configured");
    const empty = env0({ ANAM_API_KEY: undefined, CONFIG_SECRET: "c".repeat(40) }); // the table, but no key saved there
    await empty.DB.exec(CC_SQL);
    assert.equal((await call(empty, { agent: "janna" })).data.error, "anam_not_configured");
    forgetServiceKeys(env);
    const other = { ...env, CONFIG_SECRET: "d".repeat(40) }; // sealed with another CONFIG_SECRET → unreadable
    assert.equal((await call(other, { agent: "janna" })).data.error, "anam_not_configured");
    assert.equal(calls.length, 1);
  });
  test("speed 2026-11-20: the panel key ccBoot already unsealed for this request is used — no second read of the slot; the Worker secret still wins", async () => {
    const env = env0({ ANAM_API_KEY: undefined, CONFIG_SECRET: "c".repeat(40) });
    await env.DB.exec(CC_SQL);
    await putSecret(env, "anam.api_key", "anam-cc-slot-key-5521", "test");
    forgetServiceKeys(env);
    const prep = env.DB.prepare.bind(env.DB), slotReads = [];
    env.DB.prepare = sql => { const st = prep(sql); if (!/^SELECT sealed FROM cc_secrets WHERE name = \?$/.test(sql)) return st; return { bind: (...a) => { if (a[0] === "anam.api_key") slotReads.push(a[0]); return st.bind(...a); } }; };
    assert.equal((await call(env, { agent: "janna" })).status, 200);
    assert.equal(calls[0].headers.Authorization, "Bearer anam-cc-slot-key-5521");
    assert.equal(slotReads.length, 1, "one read of the slot (ccBoot's), not two");
    assert.equal((await call(env, { agent: "janna" }, { ip: "198.51.100.8" })).status, 200);
    assert.equal(slotReads.length, 1, "a warm isolate reads it no more");
    const both = { ...env, ANAM_API_KEY: KEY };
    assert.equal((await call(both, { agent: "janna" }, { ip: "198.51.100.9" })).status, 200);
    assert.equal(calls[2].headers.Authorization, "Bearer " + KEY, "the Worker secret wins over the panel slot");
  });
  test("no env at all → 503 anam_not_configured", async () => {
    const r = await handleJannaSession(rq({ agent: "janna" }), undefined);
    assert.deepEqual([r.status, (await r.json()).error], [503, "anam_not_configured"]);
  });
  test("a key but no D1 → 503 store_off (the limits need it)", async () => {
    const r = await call({ ANAM_API_KEY: KEY }, { agent: "janna" });
    assert.deepEqual([r.status, r.data.error], [503, "store_off"]);
    assert.equal(calls.length, 0);
  });
  test("method, JSON, agent and lang", async () => {
    const env = env0();
    const g = await call(env, undefined, { method: "GET" });
    assert.deepEqual([g.status, g.data.error], [405, "method"]);
    assert.deepEqual([(await call(env, undefined, { raw: "{nope" })).data.error, (await call(env, undefined, { raw: "[1,2]" })).data.error, (await call(env, undefined, { raw: "null" })).data.error], ["bad_json", "bad_json", "bad_json"]);
    const big = await call(env, undefined, { raw: JSON.stringify({ agent: "janna", pad: "x".repeat(3000) }) });
    assert.deepEqual([big.status, big.data.error], [413, "too_large"]);
    for (const agent of ["sara", "__proto__", "constructor", { a: 1 }, 7]) assert.equal((await call(env, { agent })).data.error, "bad_agent", String(agent));
    for (const lang of ["fr", "ar-EG", "english", ["ar"]]) assert.equal((await call(env, { agent: "janna", lang })).data.error, "bad_lang", String(lang));
    assert.equal(calls.length, 0);
  });
  test("an empty body means janna + ar", async () => {
    const env = env0();
    const r = await call(env, undefined, { raw: "" });
    assert.deepEqual([r.status, r.data.agent, r.data.lang], [200, "janna", "ar"]);
  });
});

describe("janna session: origin", () => {
  test("only the site itself (Origin, else Referer); never Origin: null or another site", async () => {
    const env = env0();
    assert.equal((await call(env, {}, { origin: "https://www.madeinegyptgate.com" })).status, 200);
    const ref = await call(env, {}, { origin: "", referer: "https://www.madeinegyptgate.com/factories/search/?q=x" });
    assert.equal(ref.status, 200);
    assert.equal(ref.headers.get("Access-Control-Allow-Origin"), null); // no Origin header → nothing to reflect
    for (const o of [{ origin: "https://evil.example" }, { origin: "https://madeinegyptgate.com.evil.example" }, { origin: "http://madeinegyptgate.com" }, { origin: "null" }, { origin: "" }, { origin: "", referer: "https://evil.example/page" }, { origin: "", referer: "not a url" }]) {
      const r = await call(env, {}, o);
      assert.deepEqual([r.status, r.data.error], [403, "origin_not_allowed"], JSON.stringify(o));
      assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
    }
    assert.equal(calls.length, 2);
  });
  test("localhost only with JANNA_DEV_ORIGINS=1; SITE_URL's origin (e.g. a staging host) is the site too", async () => {
    assert.equal((await call(env0(), {}, { origin: "http://localhost:8788" })).status, 403);
    const dev = env0({ JANNA_DEV_ORIGINS: "1" });
    for (const o of ["http://localhost:8788", "http://127.0.0.1:5173", "http://localhost"]) assert.equal((await call(dev, {}, { origin: o })).status, 200, o);
    for (const o of ["http://localhost.evil.example", "http://10.0.0.5:8080", "https://localhost:8788"]) assert.equal((await call(dev, {}, { origin: o })).status, 403, o);
    const stg = env0({ SITE_URL: "https://staging.madeinegyptgate.com/" });
    assert.equal((await call(stg, {}, { origin: "https://staging.madeinegyptgate.com" })).status, 200);
    const odd = env0({ SITE_URL: "https://[bad/" }); // passes site()'s pattern but is no URL: the fixed origins still work
    assert.equal((await call(odd, {})).status, 200);
    assert.equal((await call(odd, {}, { origin: "https://[bad" })).status, 403);
    assert.equal(originOk({}, "https://madeinegyptgate.com"), true);
    assert.equal(originOf(new Request(SITE + "/api/janna/session", { headers: { Referer: SITE + "/x/" } })), SITE);
  });
  test("CORS preflight: an allowed origin is reflected, any other gets no CORS headers", async () => {
    const ok = await worker.fetch(rq(undefined, { method: "OPTIONS" }), env0(), {});
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), SITE);
    assert.equal(ok.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assert.match(ok.headers.get("Access-Control-Allow-Headers"), /Authorization/);
    const bad = await worker.fetch(rq(undefined, { method: "OPTIONS", origin: "https://evil.example" }), env0(), {});
    assert.equal(bad.status, 204);
    assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
  });
});

describe("janna session: limits", () => {
  test("per network: JANNA_IP_SESSIONS_PER_HOUR (default 6), IPv6 counted per /64, only hashes stored", async () => {
    const env = env0();
    assert.equal(perHour(env), 6);
    for (let i = 0; i < 6; i++) assert.equal((await call(env, {})).status, 200, "call " + (i + 1));
    const r = await call(env, {});
    assert.deepEqual([r.status, r.data.error], [429, "rate_limited"]);
    assert.ok(r.data.retry_after > 0 && r.data.retry_after <= 3600);
    assert.equal(calls.length, 6);
    assert.equal((await call(env, {}, { ip: "203.0.113.9" })).status, 200); // another network
    const keys = (await env.DB.prepare("SELECT k FROM rl").all()).results.map(x => x.k).join(" ");
    assert.ok(!keys.includes("198.51.100.7") && !keys.includes("203.0.113.9"), "raw IPs are never stored");
    const v6 = env0({ JANNA_IP_SESSIONS_PER_HOUR: "1" });
    assert.equal(perHour(v6), 1);
    assert.equal((await call(v6, {}, { ip: "2001:db8:1:2::1" })).status, 200);
    assert.equal((await call(v6, {}, { ip: "2001:db8:1:2:ffff::9" })).status, 429); // same /64
    assert.equal((await call(v6, {}, { ip: "2001:db8:1:3::1" })).status, 200);
  });
  test("daily cap for the whole site: JANNA_DAILY_SESSIONS (default 120), refusals and upstream failures are not counted, '0' = off", async () => {
    assert.equal(dailyCap({}), 120);
    const env = env0({ JANNA_DAILY_SESSIONS: "2" });
    assert.equal((await call(env, {}, { ip: "192.0.2.1" })).status, 200);
    assert.equal((await call(env, {}, { ip: "192.0.2.2" })).status, 200);
    const r = await call(env, {}, { ip: "192.0.2.3" });
    assert.deepEqual([r.status, r.data.error], [429, "daily_cap"]);
    assert.equal(calls.length, 2);
    assert.equal(await dayCount(env), 2); // the refused one is not counted
    const off = env0({ JANNA_DAILY_SESSIONS: "0" });
    assert.equal(dailyCap(off), 0);
    assert.equal((await call(off, {})).data.error, "daily_cap");
    assert.equal(calls.length, 2);
    const one = env0({ JANNA_DAILY_SESSIONS: "1" });
    mockAnam(() => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const quiet = mock.method(console, "error", () => {});
    try { assert.equal((await call(one, {}, { ip: "192.0.2.4" })).status, 502); } finally { quiet.mock.restore(); }
    assert.equal(await dayCount(one), 0); // failed upstream: given back
    mockAnam();
    assert.equal((await call(one, {}, { ip: "192.0.2.5" })).status, 200);
    assert.equal((await call(one, {}, { ip: "192.0.2.6" })).data.error, "daily_cap");
    assert.equal(dailyCap({ JANNA_DAILY_SESSIONS: "junk" }), 120);
  });
  test("a network blocked by an admin gets 403 blocked", async () => {
    const env = env0(), ip = "198.51.100.66";
    const ih = await ipHash(new Request(SITE, { headers: { "CF-Connecting-IP": ip } }), env);
    await env.DB.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('ip', ?, 'test', ?)").bind(ih, NOW).run();
    const r = await call(env, {}, { ip });
    assert.deepEqual([r.status, r.data.error], [403, "blocked"]);
    assert.equal(calls.length, 0);
  });
});

describe("janna session: Bassem (members' advisor) — partner / strategic or staff only", () => {
  test("no sign-in / a bad token → 401 login_required; nothing is called", async () => {
    const env = env0();
    assert.deepEqual([(await call(env, { agent: "bassem" })).status, (await call(env, { agent: "bassem" })).data.error], [401, "login_required"]);
    assert.equal((await call(env, { agent: "bassem" }, { token: "v2.bad.token.1.2" })).status, 401);
    assert.equal((await call(env, { agent: "bassem" }, { token: "v1.bad.partner.1.2" })).status, 401);
    assert.equal(calls.length, 0);
    assert.equal(await dayCount(env), 0);
  });
  test("partner and strategic members get Bassem's persona (AR and EN pages)", async () => {
    const env = env0();
    const p = await member(env, { id: "m-partner", email: "p@co.test", plan: "partner" });
    const s = await member(env, { id: "m-strat", email: "s@co.test", plan: "strategic" });
    const r1 = await call(env, { agent: "bassem", lang: "ar" }, { token: await tokenFor(env, p) });
    assert.deepEqual([r1.status, r1.data.agent], [200, "bassem"], r1.text);
    const r2 = await call(env, { agent: "bassem", lang: "en" }, { token: await tokenFor(env, s), ip: "203.0.113.20" });
    assert.equal(r2.status, 200);
    assert.deepEqual(calls.map(c => c.body.personaConfig.personaId), [BASSEM, BASSEM]);
    assert.equal(calls[1].body.clientLabel, "madeinegyptgate-bassem-en");
  });
  test("other plans, an expired plan → 403 plan; an e-mailed login link → 403 full_login_required", async () => {
    const env = env0();
    for (const [id, plan, exp] of [["m-v", "visitor", ""], ["m-b", "basic", ""], ["m-pr", "premium", ""], ["m-old", "partner", "2020-01-01T00:00:00.000Z"]]) {
      const m = await member(env, { id, email: id + "@co.test", plan, plan_expires: exp });
      const r = await call(env, { agent: "bassem" }, { token: await tokenFor(env, m) });
      assert.deepEqual([r.status, r.data.error], [403, "plan"], id);
    }
    const p = await member(env, { id: "m-link", email: "link@co.test", plan: "partner" });
    const l = await call(env, { agent: "bassem" }, { token: await tokenFor(env, p, "link") });
    assert.deepEqual([l.status, l.data.error], [403, "full_login_required"]);
    assert.equal(calls.length, 0);
  });
  test("staff: role admin, ADMIN_EMAILS (confirmed address), Control Center owner / admin / support — not seo, data or a disabled role", async () => {
    const env = env0();
    await env.DB.exec(CC_SQL);
    const a = await member(env, { id: "m-admin", email: "ops@co.test", role: "admin" });
    const boss = await member(env, { id: "m-boss", email: "boss@mig.test" });
    const bossUnconfirmed = await member(env, { id: "m-boss2", email: "Boss@mig.test", email_verified_at: "" });
    const sup = await member(env, { id: "m-sup", email: "sup@co.test" }), seo = await member(env, { id: "m-seo", email: "seo@co.test" }), gone = await member(env, { id: "m-gone", email: "gone@co.test" });
    for (const [m, role, dis] of [[sup, "support", ""], [seo, "seo", ""], [gone, "support", NOW]]) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at, disabled_at) VALUES (?, ?, ?, ?, ?)").bind(m.id, role, NOW, NOW, dis).run();
    let ip = 10;
    const go = async m => call(env, { agent: "bassem" }, { token: await tokenFor(env, m), ip: "192.0.2." + ip++ });
    assert.equal((await go(a)).status, 200);
    assert.equal((await go(boss)).status, 200);
    assert.equal((await go(sup)).status, 200);
    assert.equal((await go(bossUnconfirmed)).data.error, "plan");
    assert.equal((await go(seo)).data.error, "plan");
    assert.equal((await go(gone)).data.error, "plan");
    assert.equal(calls.length, 3);
  });
  test("Bassem's own advisor token (activation link): checked against the member's plan NOW; a blocked member is refused", async () => {
    const env = env0();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const p = await member(env, { id: "m-adv", email: "adv@co.test", plan: "partner" });
    assert.equal((await call(env, { agent: "bassem" }, { token: await signToken(env.ADVISOR_SECRET, p.id, "partner", exp) })).status, 200);
    const down = await member(env, { id: "m-down", email: "down@co.test", plan: "basic" }); // token says partner, the plan is basic now
    assert.equal((await call(env, { agent: "bassem" }, { token: await signToken(env.ADVISOR_SECRET, down.id, "partner", exp), ip: "192.0.2.40" })).data.error, "plan");
    assert.equal((await call(env, { agent: "bassem" }, { token: await signToken("another-secret", p.id, "partner", exp), ip: "192.0.2.41" })).status, 401);
    assert.equal((await call(env, { agent: "bassem" }, { token: await signToken(env.ADVISOR_SECRET, "m-missing", "partner", exp), ip: "192.0.2.42" })).status, 401);
    await env.DB.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('email', 'adv@co.test', 'test', ?)").bind(NOW).run();
    assert.equal((await call(env, { agent: "bassem" }, { token: await signToken(env.ADVISOR_SECRET, p.id, "partner", exp), ip: "192.0.2.43" })).status, 401);
    assert.equal(calls.length, 1);
  });
  test("a revoked platform session no longer opens Bassem", async () => {
    const env = env0();
    const p = await member(env, { id: "m-rev", email: "rev@co.test", plan: "strategic" });
    const t = await tokenFor(env, p);
    await env.DB.prepare("UPDATE auth_sessions SET revoked_at = ?").bind(NOW).run();
    assert.equal((await call(env, { agent: "bassem" }, { token: t })).status, 401);
  });
  test("the plans matrix decides at CALL time («الباقات» in the Control Center): premium with bassem = 1 opens Bassem, partner with bassem = 0 does not", async () => {
    const env = env0();
    const caps = async (plan, patch) => {
      const r = await env.DB.prepare("SELECT caps_json FROM cc_plans WHERE plan = ?").bind(plan).first();
      await env.DB.prepare("UPDATE cc_plans SET caps_json = ? WHERE plan = ?").bind(JSON.stringify({ ...JSON.parse(r.caps_json), ...patch }), plan).run();
    };
    await caps("premium", { bassem: 1 }); await caps("partner", { bassem: 0 });
    try {
      const pr = await member(env, { id: "m-prem", email: "prem@co.test", plan: "premium" });
      const pa = await member(env, { id: "m-part", email: "part@co.test", plan: "partner" });
      const st = await member(env, { id: "m-str", email: "str@co.test", plan: "strategic" });
      const a = await call(env, { agent: "bassem" }, { token: await tokenFor(env, pr), ip: "192.0.2.60" });
      assert.deepEqual([a.status, a.data.agent], [200, "bassem"], a.text);
      const b = await call(env, { agent: "bassem" }, { token: await tokenFor(env, pa), ip: "192.0.2.61" });
      assert.deepEqual([b.status, b.data.error], [403, "plan"]);
      assert.equal((await call(env, { agent: "bassem" }, { token: await tokenFor(env, st), ip: "192.0.2.62" })).status, 200, "the untouched strategic row keeps Bassem");
      assert.equal(calls.length, 2, "the refused partner never reached Anam");
      // a later change in the panel is picked up without a redeploy (the matrix memo is per database, 60 s; forced here)
      await caps("partner", { bassem: 1 }); forgetPlans(env);
      assert.equal((await call(env, { agent: "bassem" }, { token: await tokenFor(env, pa), ip: "192.0.2.63" })).status, 200);
      // an expired plan stays refused whatever the matrix says
      const old = await member(env, { id: "m-prem-old", email: "old@co.test", plan: "premium", plan_expires: "2020-01-01T00:00:00.000Z" });
      assert.equal((await call(env, { agent: "bassem" }, { token: await tokenFor(env, old), ip: "192.0.2.64" })).data.error, "plan");
    } finally { resetPlans(); }
  });
  test("Janna never needs (or reads) a sign-in", async () => {
    const env = env0();
    assert.equal((await call(env, { agent: "janna" }, { token: "v2.garbage" })).status, 200);
  });
});

describe("janna session: upstream failures and secrecy", () => {
  test("Anam refuses (401 / 500) or answers without a token → 502 upstream with the status only; the key is never logged or echoed", async () => {
    const logs = [];
    const spies = ["log", "warn", "error", "info"].map(k => mock.method(console, k, (...a) => logs.push(a.map(String).join(" "))));
    try {
      const env = env0();
      mockAnam(() => new Response(JSON.stringify({ error: "Unauthorized: bad key " + KEY }), { status: 401 }));
      const r = await call(env, {});
      assert.deepEqual([r.status, r.data.error, r.data.upstream_status], [502, "upstream", 401]);
      mockAnam(() => new Response("<html>gateway</html>", { status: 503 }));
      assert.deepEqual([(await call(env, {}, { ip: "192.0.2.50" })).data.upstream_status], [503]);
      mockAnam(() => new Response(JSON.stringify({ token: "wrong-field" }), { status: 200 }));
      const nt = await call(env, {}, { ip: "192.0.2.51" });
      assert.deepEqual([nt.status, nt.data.error, nt.data.upstream_status], [502, "upstream", 200]);
      mockAnam(() => { throw new TypeError("network down"); });
      const u = await call(env, {}, { ip: "192.0.2.52" });
      assert.deepEqual([u.status, u.data.error], [502, "upstream_unreachable"]);
      mockAnam(() => { throw "a thrown string"; }); // not an Error: still a clean answer
      assert.equal((await call(env, {}, { ip: "192.0.2.54" })).data.error, "upstream_unreachable");
      assert.equal(await dayCount(env), 0);
      for (const x of [r, u, nt]) assert.ok(!x.text.includes(KEY));
      mockAnam();
      const ok = await call(env, {}, { ip: "192.0.2.53" });
      assert.equal(ok.status, 200);
      assert.ok(!ok.text.includes(KEY));
      assert.ok(logs.length >= 4, "failures are logged");
      assert.ok(logs.every(l => !l.includes(KEY)), "the key never reaches the logs");
      assert.ok(logs.every(l => !l.includes("tok-")), "tokens never reach the logs");
    } finally { spies.forEach(s => s.mock.restore()); }
  });
  test("Anam does not answer → aborted after ANAM_TIMEOUT_MS → 502 upstream_unreachable", async () => {
    const env = env0();
    let started; const startedP = new Promise(r => (started = r));
    globalThis.fetch = (url, init) => new Promise((res, rej) => { started(); init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
    const err = mock.method(console, "error", () => {});
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const p = call(env, {});
      await startedP;
      mock.timers.tick(ANAM_TIMEOUT_MS);
      const r = await p;
      assert.deepEqual([r.status, r.data.error], [502, "upstream_unreachable"]);
      assert.equal(await dayCount(env), 0);
    } finally { mock.timers.reset(); err.mock.restore(); }
  });
  test("a database failure → 500 server (the page falls back to the widget), without details", async () => {
    const env = env0();
    const err = mock.method(console, "error", () => {});
    try {
      env.DB.prepare = () => { throw new Error("D1 down: SELECT secret"); };
      const r = await call(env, {});
      assert.deepEqual([r.status, r.data], [500, { error: "server", code: "server" }]);
      env.DB.prepare = () => { throw null; }; // eslint-disable-line no-throw-literal
      assert.equal((await call(env, {})).status, 500);
    } finally { err.mock.restore(); }
  });
});

describe("janna session: routing in index.js", () => {
  test("/api/janna/session (and with a trailing slash) is this endpoint; lookup and health still work", async () => {
    const env = env0();
    assert.equal((await call(env, {}, { path: "/api/janna/session/" })).status, 200);
    const h = await worker.fetch(new Request(SITE + "/api/janna/health"), env, {});
    assert.equal(h.status, 200);
    const l = await worker.fetch(new Request(SITE + "/api/janna/lookup?section=factories&query=" + encodeURIComponent("بلاستيك")), env, {});
    assert.equal(l.status, 200);
    assert.equal((await worker.fetch(new Request(SITE + "/api/janna/sessions", { method: "POST" }), env, {})).status, 404);
    const direct = await handleJannaSession(rq({ agent: "janna" }), env);
    assert.equal(direct.status, 200);
  });
});
