// node --test for «طلب حذف الحساب» (src/delete-requests.js, migration 0010 — app parity plan, item account-delete-request): a member's
// request (full e-mail-code sign-in only), a visitor's request to erase his Janna conversations (his random visitor id only), the owner's
// queue in the Control Center. A REQUEST DELETES NOTHING; the switches account_delete / visitor_erase_request ship OFF (503 feature_off),
// a database without 0010 answers 503 delete_off. Real index.js + schema (helpers.mjs D1); Resend mocked. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { storeJson, forgetFeatures } from "../src/flags.js";

const SITE = "https://madeinegyptgate.com";
const VID = "0123456789abcdef0123456789abcdef", VID2 = "fedcba9876543210fedcba9876543210";
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
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", CONFIG_SECRET: "test-config-secret-0123456789abcdef-xyz", RESEND_API_KEY: "re_test",
  MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "owner@mig.test", ...(extra || {}) });
async function setF(env, values) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(storeJson(values, {}), t).run();
  forgetFeatures(env);
}
async function member(env, id, email, { role = "user", scope = "full" } = {}) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, role, name) VALUES (?, 'Delete Co', ?, 'basic', 1, ?, ?, ?, ?, 'Ahmed')").bind(id, email, t, t, t, role).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m, { scope })).token };
}
async function api(env, method, path, { body, token, origin = SITE, ua = "Mozilla/5.0 test", ip = "198.51.100.30" } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": ua };
  if (origin) h.Origin = origin;
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const jobs = [];
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil(p) { jobs.push(Promise.resolve(p).catch(() => null)); } });
  await Promise.all(jobs);
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const rows = async env => (await env.DB.prepare("SELECT * FROM cc_delete_requests ORDER BY created_at").all()).results;
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;
const P = "/api/me/delete-request", V = "/api/janna/memory/erase-request";

describe("the migration 0010 (purely additive, idempotent) and schema.sql", () => {
  test("only CREATE … IF NOT EXISTS; twice on schema.sql; one pending row per member / visitor", () => {
    const sql = readFileSync(new URL("../migrations/0010_delete_requests.sql", import.meta.url), "utf8");
    const code = sql.split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
    assert.ok(!/\b(DROP|DELETE|UPDATE|ALTER|REPLACE)\b/i.test(code), "nothing destructive");
    assert.ok(readFileSync(new URL("../schema.sql", import.meta.url), "utf8").includes("CREATE TABLE IF NOT EXISTS cc_delete_requests"));
    const env = env0(); env.DB.db.exec(sql); env.DB.db.exec(sql);
    const ins = (id, kind, mid, vid) => env.DB.db.prepare("INSERT INTO cc_delete_requests (id, kind, member_id, visitor_id, created_at) VALUES (?, ?, ?, ?, 'x') ON CONFLICT DO NOTHING").run(id, kind, mid, vid).changes;
    assert.equal(ins("dr-1", "member", "u1", ""), 1); assert.equal(ins("dr-2", "member", "u1", ""), 0, "a second pending request of the same member");
    assert.equal(ins("dr-3", "visitor", "", VID), 1); assert.equal(ins("dr-4", "visitor", "", VID), 0);
    env.DB.db.prepare("UPDATE cc_delete_requests SET status = 'done' WHERE id = 'dr-1'").run();
    assert.equal(ins("dr-5", "member", "u1", ""), 1, "a new request once the first is closed");
  });
});

describe("a member's request: /api/me/delete-request", () => {
  test("switch off (the default) → 503 feature_off, nothing recorded", async () => {
    const env = env0(), m = await member(env, "u-d1", "d1@mig.test");
    const r = await api(env, "POST", P, { token: m.token, body: {} });
    assert.deepEqual([r.status, r.data.code], [503, "feature_off"]);
    assert.equal((await rows(env)).length, 0);
  });
  test("on: signed out 401; an e-mailed link session 403 full_login_required; a full session → one pending row + an audit row + the team alerted", async () => {
    const env = env0(); await setF(env, { account_delete: true });
    assert.equal((await api(env, "POST", P, { body: {} })).status, 401);
    const lk = await member(env, "u-lk", "lk@mig.test", { scope: "link" });
    let r = await api(env, "POST", P, { token: lk.token, body: {} });
    assert.deepEqual([r.status, r.data.code], [403, "full_login_required"]);
    const m = await member(env, "u-d2", "d2@mig.test");
    r = await api(env, "GET", P, { token: m.token });
    assert.deepEqual([r.status, r.data.request, r.data.days], [200, null, 30]);
    r = await api(env, "POST", P, { token: m.token, body: { lang: "en" }, ua: "Mozilla/5.0 (iPhone) Mobile/15E148 MIGApp/1.0 (ios)" });
    assert.equal(r.status, 201, r.text);
    assert.match(r.data.request.id, /^dr-[0-9a-f]{10}$/); assert.deepEqual([r.data.request.status, r.data.request.kind, r.data.created], ["pending", "member", true]);
    const rs = await rows(env); assert.equal(rs.length, 1); assert.deepEqual([rs[0].member_id, rs[0].source, rs[0].lang], ["u-d2", "app-ios", "en"]);
    const a = await audits(env, "member.delete_request"); assert.equal(a.length, 1); assert.deepEqual([a[0].actor_id, a[0].target_id], ["u-d2", "u-d2"]);
    assert.ok(mails.some(x => /dr-/.test(x.subject) && x.to.includes("owner@mig.test")), "the owner hears of it");
    // a repeat answers the same row
    const again = await api(env, "POST", P, { token: m.token, body: {} });
    assert.deepEqual([again.status, again.data.existing, again.data.request.id], [200, true, r.data.request.id]);
    assert.equal((await rows(env)).length, 1);
    r = await api(env, "GET", P, { token: m.token });
    assert.equal(r.data.request.id, again.data.request.id);
    // nothing is deleted by the request
    const still = await env.DB.prepare("SELECT email, company, plan FROM members WHERE id = 'u-d2'").first();
    assert.deepEqual([still.email, still.company, still.plan], ["d2@mig.test", "Delete Co", "basic"]);
  });
  test("a database without 0010 (the switch stored on anyway) → 503 delete_off", async () => {
    const env = env0(); await setF(env, { account_delete: true });
    env.DB.db.exec("DROP TABLE cc_delete_requests"); forgetFeatures(env);
    const m = await member(env, "u-d3", "d3@mig.test");
    const r = await api(env, "POST", P, { token: m.token, body: {} });
    assert.deepEqual([r.status, r.data.code], [503, "delete_off"]);
  });
});

describe("a visitor's request: /api/janna/memory/erase-request", () => {
  test("off → 503; on: same-site only, a valid random id, one pending row per id; an id linked to a member → 409 visitor_linked", async () => {
    const env = env0();
    let r = await api(env, "POST", V, { body: { visitor_id: VID } });
    assert.deepEqual([r.status, r.data.code], [503, "feature_off"]);
    await setF(env, { visitor_erase_request: true });
    assert.equal((await api(env, "POST", V, { body: { visitor_id: VID }, origin: "https://evil.example" })).status, 403);
    assert.equal((await api(env, "POST", V, { body: { visitor_id: "nope" } })).data.code, "invalid");
    r = await api(env, "POST", V, { body: { visitor_id: VID, lang: "ar" } });
    assert.equal(r.status, 201, r.text); assert.equal(r.data.request.kind, "visitor");
    const again = await api(env, "POST", V, { body: { visitor_id: VID } });
    assert.deepEqual([again.status, again.data.request.id], [200, r.data.request.id]);
    assert.equal((await audits(env, "visitor.erase_request")).length, 1);
    const t = new Date().toISOString();
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, member_id, link_via, linked_at, first_at, last_at) VALUES (?, 'u-x', 'session', ?, ?, ?)").bind(VID2, t, t, t).run();
    r = await api(env, "POST", V, { body: { visitor_id: VID2 } });
    assert.deepEqual([r.status, r.data.code], [409, "visitor_linked"]);
    const vrows = (await rows(env)).filter(x => x.kind === "visitor"); assert.equal(vrows.length, 1); assert.equal(vrows[0].visitor_id, VID);
  });
  test("the memory itself is untouched by the request (the owner's audited erasure does that)", async () => {
    const env = env0(); await setF(env, { visitor_erase_request: true });
    const t = new Date().toISOString();
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls) VALUES (?, ?, ?, 3)").bind(VID, t, t).run();
    assert.equal((await api(env, "POST", V, { body: { visitor_id: VID } })).status, 201);
    assert.equal((await env.DB.prepare("SELECT calls FROM janna_visitors WHERE visitor_id = ?").bind(VID).first()).calls, 3);
  });
});

describe("the owner's queue: /api/admin/cc/delete-requests", () => {
  test("owner only; the list shows who asked; closing is audited, once; a rejection needs its reason", async () => {
    const env = env0(); await setF(env, { account_delete: true, visitor_erase_request: true });
    const o = await member(env, "u-owner", "owner@mig.test"), adm = await member(env, "u-adm", "adm@mig.test", { role: "admin" });
    const m = await member(env, "u-d4", "d4@mig.test");
    const req = (await api(env, "POST", P, { token: m.token, body: {} })).data.request;
    await api(env, "POST", V, { body: { visitor_id: VID } });
    assert.equal((await api(env, "GET", "/api/admin/cc/delete-requests", { token: adm.token })).status, 403, "members.delete is the owner's");
    let r = await api(env, "GET", "/api/admin/cc/delete-requests?status=pending", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.items.length, 2);
    const it = r.data.items.find(x => x.kind === "member");
    assert.deepEqual([it.member.email, it.member.company, it.overdue, it.status], ["d4@mig.test", "Delete Co", false, "pending"]);
    assert.ok(r.data.items.find(x => x.kind === "visitor").visitor_id === VID);
    r = await api(env, "POST", "/api/admin/cc/delete-requests/" + req.id, { token: o.token, body: { status: "rejected", note: "x" } });
    assert.equal(r.status, 422);
    r = await api(env, "POST", "/api/admin/cc/delete-requests/" + req.id, { token: o.token, body: { status: "done", note: "deleted from the members list" } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.request.status, "done");
    assert.equal((await api(env, "POST", "/api/admin/cc/delete-requests/" + req.id, { token: o.token, body: { status: "done" } })).status, 409);
    const a = await audits(env, "delete_request.close"); assert.equal(a.length, 1); assert.equal(a[0].target_id, "u-d4");
    r = await api(env, "GET", P, { token: m.token });
    assert.deepEqual([r.data.request.status, !!r.data.request.decided_at], ["done", true]);
  });
});
