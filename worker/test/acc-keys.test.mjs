// node --test for «مفاتيح الخدمات» (src/acc-keys.js + src/service-keys.js) and the WhatsApp live switch (src/whatsapp.js waLive).
// Owner decision 2026-11-18: the respond.io token / Anam key are pasted in the Control Center (owner only), stored sealed with CONFIG_SECRET,
// tested server-side, and real WhatsApp sending stays OFF until a passed token test + one delivered message to the platform's own number.
// Everything goes through the real index.js (ccBoot + dispatch). No network: respond.io, Anam and Resend are mocked; any other URL fails.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { getSecret, putSecret } from "../src/crypto.js";
import { sendWA, waLive, waOn, waDryEnv, waSwitch, waDryReason } from "../src/whatsapp.js";
import { loadServiceKeys, forgetServiceKeys, svc, anamKey, respondioChannel } from "../src/service-keys.js";
import { findChannel, cleanKey } from "../src/acc-keys.js";

const SITE = "https://madeinegyptgate.com";
const CFG = "test-config-secret-0123456789abcdef-xyz"; // ≥ 32 characters (fake)
const TOK = "rio_test_token_4f7a9c2e1b8d6a3f5e0c"; // fake respond.io token
const TOK2 = "rio_second_token_9a8b7c6d5e4f3a2b1c";
const ANAM = "anam_test_key_00112233445566778899"; // fake Anam key
let calls, logs, realFetch, realLog, realErr, respond, anamStatus;
const CH_LIST = { items: [{ id: 580384, name: "Whatsapp Business", source: "whatsapp_business" }, { id: 77, name: "Messenger", source: "facebook" }] };
function mock() {
  calls = []; respond = { list: 200, body: CH_LIST, send: 200 }; anamStatus = 200;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), h = init.headers || {};
    calls.push({ url: u, method: init.method || "GET", auth: h.Authorization || h.authorization || "", body: init.body ? JSON.parse(init.body) : null });
    if (u.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ id: "re_" + calls.length }), { status: 200 });
    if (u === "https://api.respond.io/v2/space/channel") return new Response(JSON.stringify(respond.body), { status: respond.list });
    if (u.startsWith("https://api.respond.io/v2/contact/")) return new Response(JSON.stringify(respond.send === 200 ? { messageId: 9000 + calls.length } : { message: "outside window" }), { status: respond.send });
    if (u === "https://api.anam.ai/v1/personas?perPage=1") return new Response(JSON.stringify({ data: [] }), { status: anamStatus });
    throw new Error("unexpected fetch " + u);
  };
}
beforeEach(() => {
  realFetch = globalThis.fetch; mock(); logs = [];
  realLog = console.log; realErr = console.error;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); }; console.error = (...a) => { logs.push(a.map(String).join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realErr; });

const NOW = () => new Date().toISOString();
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
  ADMIN_EMAILS: "owner@mig.test", PLATFORM_KEY: "pk-test-123", CONFIG_SECRET: CFG, WA_DRY_RUN: "0", RESPONDIO_CHANNEL_ID: "580384", ...(extra || {}) });
async function member(env, id, email, { role = "user", staff = "", plan = "visitor", phone = "", prefs = "{}" } = {}) {
  const t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at, phone, prefs_json) VALUES (?, 'Co', ?, ?, 1, ?, ?, ?, ?, ?, ?)").bind(id, email, plan, t, t, role, t, phone, prefs).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
const owner = env => member(env, "u-owner", "owner@mig.test");
function mkCtx() { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
async function api(env, method, path, { token, body, headers = {}, ip = "10.1.0.1" } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0 test", Origin: SITE, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text, headers: res.headers };
}
const K = "/api/admin/cc/keys";
/* the limits count per fixed window (common.js rateOk): never start a limit test in the last 5 s of an hour (deflake) */
const awayFromHourEdge = async () => { const ms = Date.now() % 3600000; if (ms > 3595000) await new Promise(r => setTimeout(r, 3600200 - ms)); };
const respondSends = () => calls.filter(c => c.url.startsWith("https://api.respond.io/v2/contact/"));
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;
/* the full owner flow up to a live switch */
async function goLive(env, o) {
  assert.equal((await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK } })).status, 200);
  assert.equal((await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} })).data.ok, true);
  assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: {} })).data.sent, true);
  const r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: true, confirm_delivered: true } });
  assert.equal(r.status, 200, r.text);
  return r;
}

describe("service keys: access (owner only)", () => {
  test("owner 200; admin / editor / support / X-Platform-Key → 403 owner_only (need keys.manage); seo / data → 403 team page; signed out → 401", async () => {
    const env = env0(), o = await owner(env);
    const r = await api(env, "GET", K, { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(Object.keys(r.data.slots).sort(), ["anam.api_key", "respondio.channel", "respondio.token"]);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
    for (const role of ["admin", "editor", "support"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role, role: role === "admin" ? "admin" : "user" });
      for (const [m, p, b] of [["GET", K], ["PUT", K + "/respondio.token", { value: TOK }], ["POST", K + "/respondio.token/test", {}], ["POST", K + "/wa-test", {}], ["POST", K + "/wa-live", { on: true, confirm_delivered: true }], ["DELETE", K + "/anam.api_key"]]) {
        const x = await api(env, m, p, { token: s.token, body: b });
        assert.deepEqual([x.status, x.data.code, x.data.need], [403, "owner_only", "keys.manage"], `${role} ${m} ${p}`);
      }
    }
    for (const role of ["seo", "data"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role });
      const x = await api(env, "GET", K, { token: s.token });
      assert.deepEqual([x.status, x.data.code], [403, "forbidden"]); assert.ok(x.data.team_page);
    }
    const pk = await api(env, "GET", K, { headers: { "X-Platform-Key": "pk-test-123" } });
    assert.deepEqual([pk.status, pk.data.code], [403, "owner_only"]);
    assert.equal((await api(env, "GET", K)).status, 401);
    // whoami: the owner sees the page, an admin does not; WhatsApp state flags for everyone
    const w = await api(env, "GET", "/api/admin/cc/whoami", { token: o.token });
    assert.deepEqual([w.data.features.keys, w.data.features.wa_live, w.data.features.wa_switch, w.data.features.respondio], [true, false, false, false]);
    assert.ok(w.data.perms.includes("keys.manage"));
    const wa = await api(env, "GET", "/api/admin/cc/whoami", { token: (await member(env, "u-adm2", "adm2@mig.test", { role: "admin" })).token });
    assert.equal(wa.data.features.keys, false); assert.ok(!wa.data.perms.includes("keys.manage"));
    assert.equal(calls.length, 0);
  });
});

describe("service keys: write-only storage", () => {
  test("PUT seals with CONFIG_SECRET (AAD per slot), answers {set, tail} only; GET never returns a value; replace / delete; audit without values", async () => {
    const env = env0(), o = await owner(env);
    const p = await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: "  Bearer " + TOK + "  " } });
    assert.equal(p.status, 200, p.text);
    assert.deepEqual([p.data.item.set, p.data.item.tail, p.data.item.readable, p.data.wa_reset], [true, TOK.slice(-4), true, true]);
    const row = await env.DB.prepare("SELECT * FROM cc_secrets WHERE name = 'respondio.token'").first();
    assert.match(row.sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); assert.ok(!row.sealed.includes(TOK)); assert.equal(row.set_by, "owner@mig.test");
    assert.equal(await getSecret(env, "respondio.token"), TOK, "round trip (a pasted «Bearer » prefix and blanks are dropped)");
    // the sealed value is bound to its slot: moved to another slot it does not open
    await env.DB.prepare("INSERT INTO cc_secrets (name, sealed, tail, set_by, set_at) VALUES ('anam.api_key', ?, '', 'x', ?)").bind(row.sealed, NOW()).run();
    assert.equal(await getSecret(env, "anam.api_key"), null);
    await env.DB.prepare("DELETE FROM cc_secrets WHERE name = 'anam.api_key'").run();
    const g = await api(env, "GET", K, { token: o.token });
    const s = g.data.slots["respondio.token"];
    assert.deepEqual([s.set, s.tail, s.readable, s.env, s.effective], [true, TOK.slice(-4), true, false, "panel"]);
    assert.ok(!g.text.includes(TOK) && !p.text.includes(TOK));
    assert.equal(g.data.slots["anam.api_key"].effective, "none");
    // replace, then delete
    assert.equal((await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK2 } })).status, 200);
    assert.equal(await getSecret(env, "respondio.token"), TOK2);
    const d = await api(env, "DELETE", K + "/respondio.token", { token: o.token });
    assert.deepEqual([d.status, d.data.item.set], [200, false]);
    assert.equal(await getSecret(env, "respondio.token"), "");
    assert.equal((await api(env, "DELETE", K + "/respondio.token", { token: o.token })).data.unchanged, true);
    // "" = delete too
    await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: ANAM } });
    assert.equal((await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: "" } })).data.item.set, false);
    // audit: one row per change, never a value (nor the tail)
    const rows = [...await audits(env, "keys.set"), ...await audits(env, "keys.delete")];
    assert.equal(rows.length, 5);
    for (const a of rows) { assert.equal(a.actor_email, "owner@mig.test"); for (const v of [TOK, TOK2, ANAM, TOK.slice(-4), TOK2.slice(-4)]) assert.ok(!JSON.stringify(a).includes(v), a.action); }
    // the audit list + CSV export carry no value either
    const al = await api(env, "GET", "/api/admin/cc/audit", { token: o.token }), csv = await api(env, "GET", "/api/admin/cc/audit.csv", { token: o.token });
    assert.equal(csv.status, 200);
    for (const t of [al.text, csv.text]) for (const v of [TOK, TOK2, ANAM]) assert.ok(!t.includes(v));
    for (const l of logs) for (const v of [TOK, TOK2, ANAM]) assert.ok(!l.includes(v), "console: " + l);
  });
  test("validation: CONFIG_SECRET missing → 503; bad shape → 422; unknown slot → 404; payment / mail slots → 400 (managed in their own sections)", async () => {
    const env = env0({ CONFIG_SECRET: "" }), o = await owner(env);
    const r = await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK } });
    assert.deepEqual([r.status, r.data.code], [503, "config_secret_missing"]);
    assert.equal((await api(env, "GET", K, { token: o.token })).data.config_secret, false);
    const env2 = env0(), o2 = await owner(env2);
    for (const bad of ["short", "has space inside the token value", "x".repeat(4097), "tab\tinside-the-token-value-xx"]) {
      const x = await api(env2, "PUT", K + "/respondio.token", { token: o2.token, body: { value: bad } });
      assert.deepEqual([x.status, x.data.code], [422, "invalid"], JSON.stringify(bad).slice(0, 30));
    }
    assert.equal((await api(env2, "PUT", K + "/respondio.token", { token: o2.token, body: {} })).data.code, "required");
    assert.deepEqual([(await api(env2, "PUT", K + "/nope.key", { token: o2.token, body: { value: TOK } })).status], [404]);
    const pay = await api(env2, "PUT", K + "/pay.paymob.secret_key", { token: o2.token, body: { value: TOK } });
    assert.deepEqual([pay.status, pay.data.code, pay.data.section], [400, "use_payments", "payments"]);
    assert.equal((await api(env2, "PUT", K + "/mail.resend.api_key", { token: o2.token, body: { value: TOK } })).data.code, "use_email");
    assert.equal((await env2.DB.prepare("SELECT COUNT(*) AS n FROM cc_secrets").first()).n, 0);
    // the channel: digits only; saved → effective + switch reset; "" → back to RESPONDIO_CHANNEL_ID
    assert.equal((await api(env2, "PUT", K + "/respondio.channel", { token: o2.token, body: { value: "58x" } })).status, 422);
    const c = await api(env2, "PUT", K + "/respondio.channel", { token: o2.token, body: { value: "123456" } });
    assert.deepEqual([c.status, c.data.item.effective, c.data.wa_reset], [200, "123456", true]);
    assert.equal(respondioChannel(env2), 123456);
    const g = await api(env2, "GET", K, { token: o2.token });
    assert.deepEqual([g.data.slots["respondio.channel"].value, g.data.slots["respondio.channel"].source, g.data.slots["respondio.channel"].env_value], ["123456", "panel", "580384"]);
    assert.equal((await api(env2, "DELETE", K + "/respondio.channel", { token: o2.token })).data.item.effective, "580384");
    // payment-gateway slots appear READ-ONLY (masked) with the link to «بوابة الدفع»
    await putSecret(env2, "pay.paymob.secret_key", "sk_test_paymob_0123456789", "owner");
    const g2 = await api(env2, "GET", K, { token: o2.token });
    assert.equal(g2.data.payments.read_only, true); assert.equal(g2.data.payments.section, "payments");
    assert.deepEqual([g2.data.payments.slots["pay.paymob.secret_key"].set, g2.data.payments.slots["pay.paymob.secret_key"].tail], [true, "6789"]);
    assert.ok(!g2.text.includes("sk_test_paymob_0123456789"));
  });
  test("«wa.*» / «respondio.*» are reserved: an admin's custom setting cannot switch WhatsApp on, and a non-system row is ignored", async () => {
    const env = env0(), adm = await member(env, "u-a", "a@mig.test", { role: "admin" });
    for (const k of ["wa.live", "wa.test_ok_at", "respondio.channel", "keys.test.x", "anam.api_key"]) {
      const r = await api(env, "PUT", "/api/admin/cc/settings", { token: adm.token, body: { custom: [{ k, v: "1" }] } });
      assert.equal(r.status, 422, k);
    }
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.live', 'custom', '1', ?), ('wa.test_ok_at', 'custom', ?, ?)").bind(NOW(), NOW(), NOW()).run();
    assert.equal((await loadServiceKeys(env, { fresh: true })).wa_live, false);
    assert.equal(waLive({ ...env, RESPONDIO_TOKEN: TOK }), false);
    const pub = await api(env, "GET", "/api/settings");
    assert.ok(!/wa\.live|respondio|keys\.test/.test(pub.text));
  });
});

describe("service keys: provider tests (read-only, mocked)", () => {
  test("respond.io: GET /v2/space/channel with the token the Worker uses; the configured channel must be listed; 401 / not found / rate limit", async () => {
    await awayFromHourEdge();
    const env = env0(), o = await owner(env);
    assert.deepEqual([(await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} })).status], [409]); // nothing set
    await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK } });
    let r = await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.ok, r.data.status, r.data.source, r.data.channel, r.data.channel_found], [true, 200, "panel", "580384", true]);
    assert.match(r.data.detail, /580384/); assert.ok(r.data.wa_test_ok_at);
    assert.deepEqual(calls.map(c => [c.method, c.url, c.auth]), [["GET", "https://api.respond.io/v2/space/channel", "Bearer " + TOK]]);
    assert.ok(!r.text.includes(TOK));
    const g = await api(env, "GET", K, { token: o.token });
    assert.equal(g.data.slots["respondio.token"].last_test.ok, true); assert.ok(g.data.wa.test_ok_at); assert.equal(g.data.wa.can_send_test, true);
    // the token refused
    respond.list = 401; respond.body = { message: "unauthorized" };
    r = await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.status], [false, 401]); assert.ok(!r.text.includes("unauthorized"), "no provider text is echoed");
    // the token works, but the channel is not in that space → not a pass
    respond.list = 200; respond.body = { items: [{ id: 1, name: "Other" }] };
    await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK2 } }); // a new token clears the test state
    assert.equal((await loadServiceKeys(env)).wa_test_ok_at, "");
    r = await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.token_ok, r.data.channel_found, r.data.wa_test_ok_at], [false, true, false, ""]);
    // a Worker secret wins over the panel slot (and is what gets tested)
    respond.body = CH_LIST;
    const envS = { ...env, RESPONDIO_TOKEN: "rio_env_secret_token_abcdef123456" };
    r = await api(envS, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.source], [true, "env"]); assert.equal(calls.at(-1).auth, "Bearer rio_env_secret_token_abcdef123456");
    assert.equal((await api(envS, "GET", K, { token: o.token })).data.slots["respondio.token"].effective, "env");
    // 10 tests per hour per owner
    let last; for (let i = 0; i < 8; i++) last = await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.deepEqual([last.status, last.data.code], [429, "rate_limited"]);
    assert.equal((await audits(env, "keys.test")).length, 10);
    for (const a of await audits(env, "keys.test")) assert.ok(!JSON.stringify(a).includes(TOK) && !JSON.stringify(a).includes(TOK2));
  });
  test("Anam: GET /v1/personas?perPage=1; the panel slot or ANAM_API_KEY (the secret wins); refused key → ok:false; unreadable slot → 409", async () => {
    const env = env0(), o = await owner(env);
    await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: ANAM } });
    let r = await api(env, "POST", K + "/anam.api_key/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.status, r.data.source], [true, 200, "panel"]);
    assert.deepEqual(calls.map(c => [c.method, c.url, c.auth]), [["GET", "https://api.anam.ai/v1/personas?perPage=1", "Bearer " + ANAM]]);
    anamStatus = 401;
    r = await api(env, "POST", K + "/anam.api_key/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.status], [false, 401]);
    anamStatus = 200;
    r = await api({ ...env, ANAM_API_KEY: "anam_env_key_0123456789abcdef" }, "POST", K + "/anam.api_key/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.source, calls.at(-1).auth], [true, "env", "Bearer anam_env_key_0123456789abcdef"]);
    // the panel key reaches the Worker's Anam users (meetings health, janna-session) without a secret
    assert.equal(await anamKey(env), ANAM);
    assert.equal((await api(env, "GET", "/api/meetings/health")).data.anam, true);
    // CONFIG_SECRET changed → the slot is unreadable: status says so, the test refuses
    const rot = { ...env, CONFIG_SECRET: "another-config-secret-0123456789abcdef" };
    forgetServiceKeys(rot);
    const g = await api(rot, "GET", K, { token: o.token });
    assert.deepEqual([g.data.slots["anam.api_key"].set, g.data.slots["anam.api_key"].readable, g.data.slots["anam.api_key"].effective], [true, false, "none"]);
    assert.deepEqual([(await api(rot, "POST", K + "/anam.api_key/test", { token: o.token, body: {} })).data.code], ["unreadable"]);
    assert.equal((await api(env, "POST", K + "/respondio.channel/test", { token: o.token, body: {} })).data.code, "test_the_token");
  });
});

describe("WhatsApp: the test message and the live switch (fail-closed)", () => {
  test("wa-test: only after a passed token test, never with WA_DRY_RUN=1; ONE message to the platform's own number (no typed number)", async () => {
    await awayFromHourEdge();
    const env = env0(), o = await owner(env);
    assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: {} })).data.code, "not_set");
    await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK } });
    assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: {} })).data.code, "token_test_required");
    await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    assert.equal((await api({ ...env, WA_DRY_RUN: "1" }, "POST", K + "/wa-test", { token: o.token, body: {} })).data.code, "dry_run_env");
    const n0 = calls.length;
    const r = await api(env, "POST", K + "/wa-test", { token: o.token, body: { to: "01009998887", phone: "+201009998887" } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.sent, r.data.to, r.data.mode, r.data.next], [true, "01062531295", "text", "confirm_delivery"]);
    const s = respondSends();
    assert.equal(s.length, 1); assert.equal(calls.length, n0 + 1);
    assert.equal(s[0].url, "https://api.respond.io/v2/contact/phone%3A%2B201062531295/message");
    assert.deepEqual([s[0].auth, s[0].body.channelId, s[0].body.message.type], ["Bearer " + TOK, 580384, "text"]);
    assert.ok((await loadServiceKeys(env)).wa_test_sent_at);
    const a = await audits(env, "wa.test");
    assert.equal(a.length, 1); assert.equal(JSON.parse(a[0].after_json).sent, true); assert.ok(!JSON.stringify(a[0]).includes(TOK));
    // the template variant; a refusal is reported with a hint, nothing marked as sent
    respond.send = 400;
    const t = await api(env, "POST", K + "/wa-test", { token: o.token, body: { mode: "template" } });
    assert.deepEqual([t.data.sent, t.data.mode, t.data.next], [false, "template", "retry"]); assert.ok(t.data.hint);
    assert.equal(respondSends().at(-1).body.message.template.name, "bassem_morning");
    // 3 per hour
    respond.send = 200;
    assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: {} })).status, 200);
    assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: {} })).data.code, "rate_limited");
    // the test message never needed the switch, and the switch is still off
    assert.equal(waSwitch(env), false);
  });
  test("wa-live: 409 until token test + test message + the owner's confirmation; then live; a new token or channel switches it off again; off always allowed", async () => {
    const env = env0(), o = await owner(env);
    let r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: true, confirm_delivered: true } });
    assert.deepEqual([r.status, r.data.code, r.data.need], [409, "not_set", ["token", "token_test", "test_message"]]);
    assert.equal((await api(env, "POST", K + "/wa-live", { token: o.token, body: {} })).data.code, "required");
    await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK } });
    await api(env, "POST", K + "/respondio.token/test", { token: o.token, body: {} });
    r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: true, confirm_delivered: true } });
    assert.deepEqual([r.status, r.data.code], [409, "test_message_required"]);
    await api(env, "POST", K + "/wa-test", { token: o.token, body: {} });
    r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: true } });
    assert.deepEqual([r.status, r.data.code, r.data.need], [409, "delivery_confirmation_required", ["delivery_confirmation"]]);
    assert.equal((await api(env, "GET", "/api/wa/health")).data.dry_run, true);
    r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: true, confirm_delivered: true } });
    assert.deepEqual([r.status, r.data.switch, r.data.live, r.data.reason], [200, true, true, "live"]);
    let h = await api(env, "GET", "/api/wa/health");
    assert.deepEqual([h.data.whatsapp, h.data.dry_run, h.data.switch, h.data.reason, h.data.channel], [true, false, true, "live", 580384]);
    // a member message really goes out now (mocked respond.io), with the panel token
    const n0 = respondSends().length;
    assert.equal((await sendWA(env, "01001112223", { template: "bassem_update" })).sent, true);
    assert.equal(respondSends().length, n0 + 1); assert.equal(respondSends().at(-1).auth, "Bearer " + TOK);
    // WA_DRY_RUN=1 stays the hard kill switch
    const kill = { ...env, WA_DRY_RUN: "1" };
    assert.equal((await sendWA(kill, "01001112223", { template: "bassem_update" })).error, "dry run");
    assert.deepEqual([(await api(kill, "GET", "/api/wa/health")).data.dry_run, (await api(kill, "GET", "/api/wa/health")).data.reason], [true, "env_dry_run"]);
    assert.equal(respondSends().length, n0 + 1);
    // a new token → switched off, test state cleared (prove it again)
    const p = await api(env, "PUT", K + "/respondio.token", { token: o.token, body: { value: TOK2 } });
    assert.equal(p.data.wa_reset, true);
    h = await api(env, "GET", "/api/wa/health");
    assert.deepEqual([h.data.dry_run, h.data.switch, h.data.reason], [true, false, "switch_off"]);
    const g = await api(env, "GET", K, { token: o.token });
    assert.deepEqual([g.data.wa.switch, g.data.wa.test_ok_at, g.data.wa.test_sent_at, g.data.wa.can_go_live], [false, "", "", false]);
    // back on, then a channel change switches it off too; turning off needs no condition
    await goLive(env, o);
    assert.equal(waLive(env), true);
    await api(env, "PUT", K + "/respondio.channel", { token: o.token, body: { value: "77" } });
    assert.equal(waLive(env), false);
    await goLive(env, o);
    r = await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: false } });
    assert.deepEqual([r.status, r.data.switch, r.data.live], [200, false, false]);
    assert.equal((await api(env, "POST", K + "/wa-live", { token: o.token, body: { on: false } })).data.unchanged, true);
    const al = await audits(env, "wa.live");
    assert.deepEqual(al.map(a => JSON.parse(a.after_json).on), [true, true, true, false]);
    for (const l of logs) for (const v of [TOK, TOK2]) assert.ok(!l.includes(v), "console: " + l);
  });
});

describe("WhatsApp effective dry run — truth table (src/whatsapp.js waLive)", () => {
  test("token × WA_DRY_RUN × panel switch × test state × store; anything unknown → dry run", async () => {
    const mk = async ({ dry, sw = false, tested = true, tables = true, load = true, token = "env" } = {}) => {
      const env = env0({ CONFIG_SECRET: CFG, WA_DRY_RUN: dry, ...(token === "env" ? { RESPONDIO_TOKEN: TOK } : {}) });
      if (dry === undefined) delete env.WA_DRY_RUN;
      if (!tables) for (const n of (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc_%'").all()).results.map(x => x.name)) env.DB.db.exec("DROP TABLE " + n);
      else {
        const t = NOW();
        if (token === "panel") await putSecret(env, "respondio.token", TOK2, "test");
        await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.live', 'system', ?, ?)").bind(sw ? "1" : "0", t).run();
        if (tested) await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.test_ok_at', 'system', ?, ?)").bind(t, t).run();
      }
      if (load) await loadServiceKeys(env, { fresh: true });
      return env;
    };
    const rows = [
      // [case, options, waOn, waLive, reason]
      ["env 1 + switch on → kill", { dry: "1", sw: true }, true, false, "env_dry_run"],
      ["env 'true' → kill (anything but 0)", { dry: "true", sw: true }, true, false, "env_dry_run"],
      ["env 0 + switch off → dry", { dry: "0", sw: false }, true, false, "switch_off"],
      ["env 0 + switch on → LIVE", { dry: "0", sw: true }, true, true, ""],
      ["env unset + switch on → LIVE (the panel decides)", { dry: undefined, sw: true }, true, true, ""],
      ["switch on without a passed test → dry", { dry: "0", sw: true, tested: false }, true, false, "switch_off"],
      ["no 0006 tables → dry", { dry: "0", sw: true, tables: false }, true, false, "switch_off"],
      ["not loaded yet (before ccBoot) → dry", { dry: "0", sw: true, load: false }, true, false, "switch_off"],
      ["no token anywhere → not configured", { dry: "0", sw: true, token: "none" }, false, false, "no_token"],
      ["panel token + switch on → LIVE", { dry: "0", sw: true, token: "panel" }, true, true, ""],
    ];
    for (const [name, o, on, live, reason] of rows) {
      const env = await mk(o);
      assert.deepEqual([waOn(env), waLive(env), waDryReason(env)], [on, live, reason], name);
      assert.equal(waDryEnv(env), o.dry !== undefined && o.dry !== "0", name);
      const before = respondSends().length, r = await sendWA(env, "01001112223", { text: "x" });
      assert.equal(r.sent, live, name); assert.equal(respondSends().length, before + (live ? 1 : 0), name);
      if (!on) assert.equal(r.error, "whatsapp not configured", name); else if (!live) assert.equal(r.error, "dry run", name);
    }
    // switched off in ANOTHER isolate (this memo still says on): the send re-reads the switch from D1 and stops at once
    const other = await mk({ dry: "0", sw: true });
    assert.equal(waLive(other), true);
    await other.DB.prepare("UPDATE cc_settings SET v = '0' WHERE k = 'wa.live'").run();
    const nB = respondSends().length;
    assert.equal((await sendWA(other, "01001112223", { text: "x" })).error, "dry run"); assert.equal(respondSends().length, nB);
    // the panel token is used only when there is no Worker secret; a rotated CONFIG_SECRET makes it unreadable → not configured
    const p = await mk({ dry: "0", sw: true, token: "panel" });
    await sendWA(p, "01001112223", { text: "x" }); assert.equal(respondSends().at(-1).auth, "Bearer " + TOK2);
    const both = { ...p, RESPONDIO_TOKEN: TOK };
    await sendWA(both, "01001112223", { text: "x" }); assert.equal(respondSends().at(-1).auth, "Bearer " + TOK);
    const rot = { ...p, CONFIG_SECRET: "rotated-config-secret-0123456789abcdefg" };
    forgetServiceKeys(rot); await loadServiceKeys(rot, { fresh: true });
    assert.deepEqual([svc(rot).respondio_state, waOn(rot), waLive(rot)], ["unreadable", false, false]);
    // dry-run log lines carry no number and no text
    for (const l of logs.filter(x => /WA dry run/.test(x))) { assert.ok(!/1001112223|"x"/.test(l), l); assert.match(l, /•••223/); }
  });
  test("the channel: the panel value, else RESPONDIO_CHANNEL_ID, else 580384", async () => {
    const env = env0({ RESPONDIO_CHANNEL_ID: "580384" });
    await loadServiceKeys(env, { fresh: true });
    assert.equal(respondioChannel(env), 580384);
    assert.equal(respondioChannel({ DB: env.DB }), 580384);
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('respondio.channel', 'system', '424242', ?)").bind(NOW()).run();
    await loadServiceKeys(env, { fresh: true });
    assert.equal(respondioChannel(env), 424242);
    assert.equal(respondioChannel({ RESPONDIO_CHANNEL_ID: "12" }), 12);
    assert.equal(findChannel({ data: { channels: [{ id: "424242", name: "<b>WA</b>" }] } }, 424242).name, "bWA/b");
    assert.equal(findChannel([{ id: 1 }], 2), null);
    assert.equal(cleanKey("  Bearer abc "), "abc");
  });
});
