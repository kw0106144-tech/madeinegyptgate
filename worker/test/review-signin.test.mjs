// node --test for «دخول مراجعي المتاجر» (src/review-signin.js, store_review_signin — app parity plan, item store-review-signin): ONE review
// address with the owner's 6-digit code, only while his switch is on and before his expiry, gets the NORMAL full session of that address's
// member (+ one audit row review.signin); any other address, a wrong code, the switch off or the period over → today's e-mailed-code rules.
// The owner's settings: GET|PUT|DELETE /api/admin/cc/dev/review (owner only, audited dev.review, the code stored only as an HMAC).
// Real index.js + schema (helpers.mjs D1); Resend mocked, any other URL fails. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession, authUser } from "../src/auth.js";
import { forgetFeatures, REVIEW_KEY } from "../src/flags.js";
import { weakCode } from "../src/review-signin.js";

const SITE = "https://madeinegyptgate.com", D = "/api/admin/cc/dev";
const CFG = "test-config-secret-0123456789abcdef-xyz";
const REV = "review@madeinegyptgate.com", CODE = "582901";
let mails, realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch; mails = [];
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input && input.url ? input.url : input);
    if (u === "https://api.resend.com/emails") { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "re_" + mails.length }), { status: 200, headers: { "Content-Type": "application/json" } }); }
    throw new Error("unexpected fetch " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", CONFIG_SECRET: CFG, RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>",
  ADMIN_EMAILS: "owner@mig.test", ...(extra || {}) });
async function member(env, id, email, { plan = "visitor", role = "user", staff = "" } = {}) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, role, plan_expires) VALUES (?, 'Review Co', ?, ?, 1, ?, ?, ?, ?, ?)")
    .bind(id, email, plan, t, t, t, role, plan === "visitor" ? "" : "2027-12-31T00:00:00.000Z").run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
async function api(env, method, path, { body, token, ip = "198.51.100.20" } = {}) {
  const h = { "CF-Connecting-IP": ip, Origin: SITE, "User-Agent": "Mozilla/5.0 test" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;
const verify = (env, email, code, ip) => api(env, "POST", "/api/auth/verify", { body: { email, code }, ip });
async function ready(env) {
  const o = await member(env, "u-owner", "owner@mig.test");
  await member(env, "u-review", REV, { plan: "partner" });
  let r = await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: CODE, days: 14 } });
  assert.equal(r.status, 200, r.text);
  r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } });
  assert.equal(r.status, 200, r.text);
  return o;
}

describe("the owner's settings (/dev/review)", () => {
  test("owner only; the code is checked (6 digits, not a trivial one) and stored as an HMAC, never answered; audited dev.review; ≤ 30 days", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test"), a = await member(env, "u-adm", "adm@mig.test", { role: "admin" });
    let r = await api(env, "GET", D + "/review", { token: o.token });
    assert.equal(r.status, 200); assert.deepEqual([r.data.set, r.data.active, r.data.max_days], [false, false, 30]);
    assert.equal((await api(env, "GET", D + "/review", { token: a.token })).status, 403, "an admin is not the owner");
    for (const [b, field, code] of [[{ email: "x", code: CODE, days: 5 }, "email", "invalid_email"], [{ email: REV, code: "12345", days: 5 }, "code", "invalid_code"],
      [{ email: REV, code: "123456", days: 5 }, "code", "weak_code"], [{ email: REV, code: "777777", days: 5 }, "code", "weak_code"], [{ email: REV, code: CODE, days: 31 }, "days", "invalid_days"], [{ email: REV, code: CODE, days: 0 }, "days", "invalid_days"]]) {
      r = await api(env, "PUT", D + "/review", { token: o.token, body: b });
      assert.equal(r.status, 422, JSON.stringify(b)); assert.deepEqual([r.data.errors[0].field, r.data.errors[0].code], [field, code]);
    }
    r = await api(env, "PUT", D + "/review", { token: o.token, body: { email: " Review@MadeInEgyptGate.com ", code: CODE, days: 14 } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.set, r.data.email, r.data.live, r.data.switch_on, r.data.active], [true, REV, true, false, false]);
    assert.ok(!r.text.includes(CODE), "the code is never answered");
    const row = await env.DB.prepare("SELECT scope, v FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first();
    assert.equal(row.scope, "system"); assert.ok(!row.v.includes(CODE), "only an HMAC is stored");
    const v = JSON.parse(row.v); assert.match(v.code_hash, /^[A-Za-z0-9_-]{40,}$/);
    const days = (Date.parse(v.until) - Date.now()) / 86400000; assert.ok(days > 13.9 && days <= 14, String(days));
    const au = await audits(env, "dev.review"); assert.equal(au.length, 1); assert.ok(!au[0].after_json.includes(CODE)); assert.equal(au[0].actor_role, "owner");
    r = await api(env, "DELETE", D + "/review", { token: o.token });
    assert.deepEqual([r.status, r.data.set], [200, false]);
    assert.equal((await audits(env, "dev.review")).length, 2);
    assert.equal(await env.DB.prepare("SELECT 1 AS x FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first(), null);
  });
  test("the switch is locked until the address + code are saved, and again once they expired", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    let r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } });
    assert.deepEqual([r.status, r.data.code, r.data.locked.code], [409, "feature_locked", "no_review_account"]);
    await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: CODE, days: 3 } });
    r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } });
    assert.equal(r.status, 200, r.text);
    const v = JSON.parse((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first()).v);
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = ?").bind(JSON.stringify({ ...v, until: "2026-01-01T00:00:00.000Z" }), REVIEW_KEY).run(); forgetFeatures(env);
    r = await api(env, "GET", D + "/features", { token: o.token });
    const row = r.data.features.find(f => f.key === "store_review_signin");
    assert.deepEqual([row.value, row.effective, row.locked.code], [true, false, "review_expired"]);
  });
  test("never a staff account: an admin's / a team member's address is refused when saved, and the code never opens one", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    await member(env, "u-sup", "support@mig.test", { staff: "support" });
    for (const email of ["owner@mig.test", "support@mig.test"]) {
      const r = await api(env, "PUT", D + "/review", { token: o.token, body: { email, code: CODE, days: 5 } });
      assert.deepEqual([r.status, r.data.errors[0].code], [422, "staff_account"], email);
    }
    // a member who became staff after the address was saved: the review code no longer opens it
    await member(env, "u-review", REV, { plan: "partner" });
    assert.equal((await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: CODE, days: 5 } })).status, 200);
    assert.equal((await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } })).status, 200);
    const t = new Date().toISOString();
    await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES ('u-review', 'editor', 'test', ?, ?)").bind(t, t).run();
    const r = await verify(env, REV, CODE);
    assert.deepEqual([r.status, r.data.code], [401, "invalid_code"]);
    assert.equal((await audits(env, "review.signin")).length, 0);
  });
  test("weakCode: one digit six times and straight runs (with the 9→0 wrap) are refused", () => {
    for (const c of ["000000", "999999", "123456", "234567", "890123", "987654", "321098", "abcdef", "12345"]) assert.equal(weakCode(c), true, c);
    for (const c of ["582901", "102938", "556677", "135791"]) assert.equal(weakCode(c), false, c);
  });
});

describe("never a customer's account (review F5): the owner's code is no password for a real person's account", () => {
  const save = (env, o, email, days = 5) => api(env, "PUT", D + "/review", { token: o.token, body: { email, code: CODE, days } });
  test("an address with requests, memory, products, invoices or an old-site record is refused (422 not_review_account); a clean one is saved", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test"), t = new Date().toISOString();
    // a request sent from the address while signed out (anonymous): the mailbox's owner's own words
    await env.DB.prepare("INSERT INTO inquiries (id, ref, kind, name, email, email_key, status, created_at, updated_at) VALUES ('q1', 'MIG-26-AAAAAA', 'rfq', 'Mona', 'mona@cust.test', 'mona@cust.test', 'received', ?, ?)").bind(t, t).run();
    let r = await save(env, o, "mona@cust.test");
    assert.deepEqual([r.status, r.data.errors[0].field, r.data.errors[0].code], [422, "email", "not_review_account"], r.text);
    assert.match(r.data.errors[0].msg, /requests sent from this address/);
    await member(env, "u-mem", "memory@cust.test");
    await env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, at, text, hash) VALUES ('u-mem', 'fact', ?, 'capacity 40 t', 'hm1')").bind(t).run();
    r = await save(env, o, "memory@cust.test");
    assert.deepEqual([r.status, r.data.errors[0].code], [422, "not_review_account"]); assert.match(r.data.errors[0].msg, /memory/);
    await member(env, "u-prod", "prod@cust.test");
    await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, created_at, updated_at) VALUES ('p-1', 'u-prod', ?, ?)").bind(t, t).run();
    assert.equal((await save(env, o, "prod@cust.test")).data.errors[0].code, "not_review_account");
    await env.DB.prepare("INSERT INTO cc_legacy_companies (company, email, email_key, created_at, updated_at) VALUES ('Old Co', 'old@cust.test', 'old@cust.test', ?, ?)").bind(t, t).run();
    assert.equal((await save(env, o, "old@cust.test")).data.errors[0].code, "not_review_account", "an old-site company record");
    assert.equal(await env.DB.prepare("SELECT 1 AS x FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first(), null, "nothing saved");
    // an account the owner prepared for the review (a plan, nothing else) is fine
    await member(env, "u-review", REV, { plan: "partner" });
    assert.equal((await save(env, o, REV)).status, 200);
  });
  test("the review account's own activity never locks it: the same address saves again after the review", async () => {
    const env = env0(), o = await ready(env), t = new Date().toISOString();
    const s = await verify(env, REV, CODE);
    assert.equal(s.status, 200, s.text);
    // what the reviewer did with it: a request, Bassem's memory
    await env.DB.prepare("INSERT INTO inquiries (id, ref, kind, user_id, name, email, email_key, status, created_at, updated_at) VALUES ('q2', 'MIG-26-BBBBBB', 'rfq', 'u-review', 'Reviewer', ?, ?, 'received', ?, ?)").bind(REV, REV, t, t).run();
    await env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, at, text, hash) VALUES ('u-review', 'turn', ?, 'hello', 'hm2')").bind(t).run();
    const r = await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: "602913", days: 20 } });
    assert.equal(r.status, 200, r.text);
  });
  test("a review sign-in never adopts the mailbox's earlier anonymous requests (and their follows)", async () => {
    const env = env0(); await ready(env);
    const t = new Date().toISOString();
    await env.DB.prepare("INSERT INTO inquiries (id, ref, kind, target_type, target_id, target_name, name, email, email_key, status, created_at, updated_at) VALUES ('q3', 'MIG-26-CCCCCC', 'opp_offer', 'tender', 't-1', 'A tender', 'Someone', ?, ?, 'recorded', ?, ?)").bind(REV, REV, t, t).run();
    const r = await verify(env, REV, CODE);
    assert.equal(r.status, 200, r.text);
    assert.equal((await env.DB.prepare("SELECT user_id FROM inquiries WHERE id = 'q3'").first()).user_id, "", "not attached to the review account");
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM follows WHERE user_id = 'u-review'").first()).n, 0);
  });
});

describe("time-limited review sessions (review F4)", () => {
  const sessionOf = async (env, token) => authUser(new Request(SITE + "/api/me", { headers: { Authorization: "Bearer " + token } }), env);
  const revokes = async env => (await audits(env, "review.sessions_revoke")).length;
  test("a review session ends with the owner's period at the latest (the token and its row)", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    await member(env, "u-review", REV, { plan: "partner" });
    assert.equal((await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: CODE, days: 3 } })).status, 200);
    assert.equal((await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } })).status, 200);
    const until = JSON.parse((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first()).v).until;
    const r = await verify(env, REV, CODE);
    assert.equal(r.status, 200, r.text);
    assert.ok(Date.parse(r.data.expires_at) <= Date.parse(until), r.data.expires_at + " ≤ " + until);
    assert.ok(Date.parse(r.data.expires_at) > Date.now() + 2.9 * 86400000, "about the 3 days left, not 30");
    const exp = +r.data.token.split(".")[3]; assert.ok(exp * 1000 <= Date.parse(until));
    const row = await env.DB.prepare("SELECT expires_at FROM auth_sessions WHERE member_id = 'u-review' ORDER BY created_at DESC LIMIT 1").first();
    assert.ok(row.expires_at <= until);
    // an e-mailed-code session keeps its 30 days
    const plain = await member(env, "u-plain", "plain@mig.test");
    const p = await env.DB.prepare("SELECT expires_at FROM auth_sessions WHERE member_id = 'u-plain'").first();
    assert.ok(Date.parse(p.expires_at) > Date.now() + 29 * 86400000); assert.ok(plain.token);
  });
  test("switching store_review_signin off ends the reviewer's sessions at once (audited); the owner's own stay", async () => {
    const env = env0(), o = await ready(env);
    const r = await verify(env, REV, CODE);
    assert.ok(await sessionOf(env, r.data.token), "signed in");
    const s = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: false } } });
    assert.equal(s.status, 200, s.text);
    assert.equal(await sessionOf(env, r.data.token), null, "signed out with the switch");
    assert.equal(await revokes(env), 1);
    const a = (await audits(env, "review.sessions_revoke"))[0];
    assert.deepEqual([a.target_type, a.target_id, a.actor_role], ["member", "u-review", "owner"]);
    assert.ok(await sessionOf(env, o.token), "the owner's own session is untouched");
    const audit = await api(env, "GET", D + "/audit", { token: o.token });
    assert.ok(audit.data.items.some(x => x.action === "review.sessions_revoke"), "listed in the developer panel's log");
  });
  test("removing the address + code, or saving another address, ends the old review account's sessions; a shorter period shortens them", async () => {
    let env = env0(), o = await ready(env);
    let r = await verify(env, REV, CODE);
    assert.equal((await api(env, "DELETE", D + "/review", { token: o.token })).status, 200);
    assert.equal(await sessionOf(env, r.data.token), null, "removed → signed out");
    assert.equal(await revokes(env), 1);
    env = env0(); o = await ready(env);
    r = await verify(env, REV, CODE);
    await member(env, "u-review2", "review2@madeinegyptgate.com");
    assert.equal((await api(env, "PUT", D + "/review", { token: o.token, body: { email: "review2@madeinegyptgate.com", code: CODE, days: 10 } })).status, 200);
    assert.equal(await sessionOf(env, r.data.token), null, "another review address → the old account is signed out");
    env = env0(); o = await ready(env); // 14 days
    r = await verify(env, REV, CODE);
    assert.equal((await api(env, "PUT", D + "/review", { token: o.token, body: { email: REV, code: CODE, days: 2 } })).status, 200);
    const until = JSON.parse((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first()).v).until;
    assert.ok(await sessionOf(env, r.data.token), "the same address: still signed in");
    const rows = (await env.DB.prepare("SELECT expires_at FROM auth_sessions WHERE member_id = 'u-review' AND revoked_at = ''").all()).results;
    assert.ok(rows.length && rows.every(x => x.expires_at <= until), "no session outlives the new period");
    assert.equal((await audits(env, "review.sessions_shorten")).length, 1);
  });
});

describe("the review sign-in itself (/api/auth/request + /verify)", () => {
  test("the review address + the owner's code → the NORMAL full session of that member, one audit row; no e-mail is sent for it", async () => {
    const env = env0(); await ready(env);
    let r = await api(env, "POST", "/api/auth/request", { body: { email: REV, lang: "ar" } });
    assert.deepEqual([r.status, r.data.ok], [200, true]);
    assert.equal(mails.length, 0, "the review address gets no code e-mail");
    r = await verify(env, REV, CODE);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.scope, "full"); assert.match(r.data.token, /^v2\./);
    assert.equal(r.data.user.email, REV);
    const m = await authUser(new Request(SITE + "/api/me", { headers: { Authorization: "Bearer " + r.data.token } }), env);
    assert.equal(m.id, "u-review"); assert.equal(m._scope, "full");
    const a = await audits(env, "review.signin");
    assert.equal(a.length, 1); assert.deepEqual([a[0].actor_id, a[0].target_id, a[0].actor_role], ["u-review", "u-review", "review"]);
    assert.ok(!a[0].after_json.includes(CODE));
    const me = await api(env, "GET", "/api/me", { token: r.data.token });
    assert.equal(me.status, 200); assert.equal(me.data.user.email, REV);
  });
  test("a wrong code, another address, the switch off or the period over → today's rules (no session)", async () => {
    const env = env0(), o = await ready(env);
    let r = await verify(env, REV, "582900");
    assert.deepEqual([r.status, r.data.code], [401, "invalid_code"], "a wrong code (no e-mailed code either)");
    await member(env, "u-other", "other@mig.test");
    r = await verify(env, "other@mig.test", CODE, "198.51.100.21");
    assert.deepEqual([r.status, r.data.code], [401, "invalid_code"], "the code of the review address opens no other address");
    let s = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: false } } });
    assert.equal(s.status, 200);
    r = await verify(env, REV, CODE, "198.51.100.22");
    assert.deepEqual([r.status, r.data.code], [401, "invalid_code"], "switch off");
    r = await api(env, "POST", "/api/auth/request", { body: { email: REV, lang: "ar" }, ip: "198.51.100.23" });
    assert.equal(r.status, 200); assert.equal(mails.length, 1, "switch off: the normal code e-mail again");
    s = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } });
    const v = JSON.parse((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = ?").bind(REVIEW_KEY).first()).v);
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = ?").bind(JSON.stringify({ ...v, until: new Date(Date.now() - 1000).toISOString() }), REVIEW_KEY).run(); forgetFeatures(env);
    r = await verify(env, REV, CODE, "198.51.100.24");
    assert.equal(r.status, 401, "the period is over");
    assert.equal((await audits(env, "review.signin")).length, 0);
  });
  test("the e-mailed code of the review address still works while the switch is on (a code that is not the owner's falls through)", async () => {
    const env = env0(), o = await ready(env);
    await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: false } } });
    await api(env, "POST", "/api/auth/request", { body: { email: REV, lang: "ar" } });
    const code = /(\d{6})/.exec(mails[0].text)[1];
    await api(env, "PUT", D + "/features", { token: o.token, body: { features: { store_review_signin: true } } });
    const r = await verify(env, REV, code, "198.51.100.25");
    assert.equal(r.status, 200, r.text); assert.equal(r.data.scope, "full");
    assert.equal((await audits(env, "review.signin")).length, 0, "an e-mailed code is no review sign-in");
  });
  test("every review attempt counts against the address's daily wrong-code limit (15) → 429 locked", async () => {
    const env = env0(); await ready(env);
    let last = null;
    for (let i = 0; i < 16; i++) last = await verify(env, REV, "58290" + (i % 10 === 1 ? 2 : i % 10), "198.51.100." + (40 + Math.floor(i / 10)));
    assert.deepEqual([last.status, last.data.code], [429, "locked"]);
    const r = await verify(env, REV, CODE, "198.51.100.60");
    assert.deepEqual([r.status, r.data.code], [429, "locked"], "even the right code, once the day's limit is spent");
  });
});
