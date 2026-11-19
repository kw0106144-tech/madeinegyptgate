// Regression tests for the deploy-2 review findings (F1–F10, L3, L4, PAY-H1–H3 and the related R2 / R3 / R6 cases).
// Everything goes through the real index.js (ccBoot + dispatch) and the real Control Center modules (acc, content, payments, email).
// No network: Resend, the old PHP API and respond.io are mocked; any other URL fails the test.
// Run: cd worker && npm test   (or: node --import ./test/json-loader.mjs --test test/review-fixes.test.mjs)
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { CC } from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import * as PAY from "../src/payments.js";
import * as CONTENT from "../src/content.js";
import { cairoDay, now as NOW } from "../src/common.js";
import { cairoToUtc } from "../src/meetings.js";

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const SITE = "https://madeinegyptgate.com", OLD = "https://old.mig.test/egypt", OWNER = "owner@mig.test", DAY = 86400000;
let sent, oldCalls, kvPuts, realFetch, realWarn;
beforeEach(() => {
  realFetch = globalThis.fetch; realWarn = console.warn; console.warn = () => {};
  sent = []; oldCalls = []; kvPuts = 0;
  let lastEmail = "";
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text, id: (init.headers && (init.headers["Idempotency-Key"] || init.headers["idempotency-key"])) || "" }); return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 }); }
    if (url.startsWith(OLD + "/api/index.php")) {
      const a = new URL(url).searchParams.get("a"); oldCalls.push(a);
      if (a === "login") { lastEmail = JSON.parse(init.body).email; return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": "PHPSESSID=s1; path=/" } }); }
      if (a === "me") return new Response(JSON.stringify({ ok: true, user: { id: 77, email: lastEmail, company: "مصنع قديم", plan: "basic", plan_until: "2027-06-30", status: "active" } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });

function mkEnv(extra = {}) {
  const DB = new D1(); DB.db.exec(MIG);
  return { DB, AUTH_SECRET: "a".repeat(40), CONFIG_SECRET: "c".repeat(40), RESEND_API_KEY: "re_test_key_123456", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
    ADMIN_EMAILS: OWNER, SEO_KV: { async put() { kvPuts++; }, async get() { return null; }, async getWithMetadata() { return null; } }, ...extra };
}
let seq = 0;
async function mkMember(env, email, o = {}) {
  const id = "u" + String(++seq).padStart(8, "0"), t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, plan_expires, email_verified_at, role, factory_ref, name, phone) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'Ahmed', '01001234567')")
    .bind(id, o.company || "Co " + id, email, o.plan || "visitor", o.created_at || t, t, o.expires || "", o.unverified ? "" : t, o.role || "user", o.factory_ref || "").run();
  if (o.staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES (?, ?, 'x', 'x')").bind(id, o.staff).run();
  if (o.meta) await env.DB.prepare("INSERT INTO cc_member_meta (member_id, status, suspended_plan, suspended_expires, source, legacy_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, o.meta.status || "active", o.meta.suspended_plan || "", o.meta.suspended_expires || "", o.meta.source || "", o.meta.legacy_id || "", t, t).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
const tok = async (env, m) => (await issueSession(env, m)).token;
const getM = (env, id) => env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
const metaOf = (env, id) => env.DB.prepare("SELECT * FROM cc_member_meta WHERE member_id = ?").bind(id).first();
let ipn = 0;
async function api(env, method, path, { token, body, headers = {}, ip } = {}) {
  const h = { "CF-Connecting-IP": ip || "198.51.100." + (1 + (ipn++ % 250)), "User-Agent": "Mozilla/5.0 test", ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const p = [], ctx = { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); } };
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  while (p.length) await p.shift();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text, headers: res.headers };
}
const days = n => new Date(Date.now() + n * DAY).toISOString();
const GCC3 = ["SA", "AE", "QA"]; // Premium = Egypt + 3 GCC states the member picks (owner, 2026-11-18): a Premium signup / upgrade carries them
const signup = (env, email, plan, o = {}) => api(env, "POST", "/api/inquiries", { token: o.token, body: { kind: "signup", target_type: "plan", target_id: plan, target_name: plan, name: "Ahmed Ali", company: "Co", email, phone: "01001234567", message: "apply " + plan + " " + (o.tag || ""), payload: { plan, company: "Co", terms: true, ...(plan === "premium" ? { gcc: GCC3 } : {}) } } });
const markPaid = (env, token, no) => api(env, "POST", `/api/admin/cc/pay/invoices/${no}/mark-paid`, { token, body: { manual_ref: "INSTAPAY-REF-1", confirm: no } });
const invByNo = (env, no) => env.DB.prepare("SELECT * FROM cc_invoices WHERE no = ?").bind(no).first();
const ledger = (env, id) => env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = ?").bind("activate:" + id).first("result");

/* ======================================================================== F1 */
describe("F1 — the payee text and the WhatsApp test target", () => {
  test("only the owner (pay.config) sets the transfer instructions — /settings refuses an admin, the owner's text stays on /pay/ and in the e-mails; owners are told of every change", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), admin = await mkMember(env, "adm@mig.test", { staff: "admin", role: "admin" });
    const ot = await tok(env, owner), at = await tok(env, admin);
    let r = await api(env, "PUT", "/api/admin/cc/pay/config", { token: ot, body: { provider: "manual", enabled: true, manual_ar: "حوّل على حساب المنصة EG11 بنك مصر", manual_en: "Transfer to EG11 Banque Misr" } });
    assert.equal(r.status, 200, r.text);
    const notices = sent.filter(x => x.to === OWNER && /بيانات التحويل/.test(x.subject));
    assert.equal(notices.length, 1, "the owners are told"); assert.match(notices[0].text, /EG11/);
    r = await api(env, "PUT", "/api/admin/cc/settings", { token: at, body: { public: { manual_pay_ar: "حوّل على InstaPay: attacker.handle" } } });
    assert.deepEqual([r.status, r.data.code, r.data.need], [403, "owner_only", "pay.config"]);
    r = await api(env, "PUT", "/api/admin/cc/settings", { token: at, body: { public: { manual_pay_en: "x", contact_email: "hello@madeinegyptgate.com" } } });
    assert.equal(r.status, 403, "nothing of a mixed request is saved");
    assert.equal(await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'contact_email'").first("v"), "info@madeinegyptgate.com");
    assert.equal((await api(env, "PUT", "/api/admin/cc/settings", { token: at, body: { public: { contact_email: "hello@madeinegyptgate.com" } } })).status, 200, "other settings: admin as before");
    const m = await mkMember(env, "buyer@co.test");
    const { invoice } = await PAY.issueInvoice(env, { member_id: m.id, email: m.email, plan: "basic", source: "admin", by: "t", send: true }, CC);
    const pub = await api(env, "GET", "/api/pay/invoice?t=" + invoice.pay_token);
    assert.match(pub.data.manual.ar, /EG11/); assert.doesNotMatch(JSON.stringify(pub.data), /attacker/);
    assert.ok(sent.some(x => x.to === "buyer@co.test" && /EG11/.test(x.text)) && !sent.some(x => /attacker/.test(x.text)));
    // the owner may still change it from «الإعدادات»: saved, published, and the owners are told
    r = await api(env, "PUT", "/api/admin/cc/settings", { token: ot, body: { public: { manual_pay_ar: "حوّل على حساب المنصة EG22" } } });
    assert.equal(r.status, 200, r.text);
    assert.equal(sent.filter(x => x.to === OWNER && /بيانات التحويل/.test(x.subject)).length, 2);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_audit WHERE action = 'settings.save' AND actor_email = ?").bind(OWNER).first("x"));
  });
  test("the owner's WhatsApp test goes to the platform's own number 01279188996, never to the editable public whatsapp_number", async () => {
    const env = mkEnv({ RESPONDIO_TOKEN: "rio_test_token_4f7a9c2e1b8d6a3f5e0c", WA_DRY_RUN: "0", RESPONDIO_CHANNEL_ID: "580384" }), owner = await mkMember(env, OWNER), admin = await mkMember(env, "adm@mig.test", { staff: "admin", role: "admin" });
    const ot = await tok(env, owner);
    assert.equal((await api(env, "PUT", "/api/admin/cc/settings", { token: await tok(env, admin), body: { public: { whatsapp_number: "201000000001" } } })).status, 200);
    const k = await api(env, "GET", "/api/admin/cc/keys", { token: ot });
    assert.deepEqual([k.data.wa.own_number, k.data.wa.own_display], ["201279188996", "01279188996"]);
    const calls = []; const f0 = globalThis.fetch;
    globalThis.fetch = async (u, init = {}) => {
      const url = String(u.url || u);
      if (url === "https://api.respond.io/v2/space/channel") return new Response(JSON.stringify({ items: [{ id: 580384, name: "WA" }] }), { status: 200 });
      if (url.startsWith("https://api.respond.io/v2/contact/")) { calls.push(url); return new Response(JSON.stringify({ messageId: 1 }), { status: 200 }); }
      return f0(u, init);
    };
    assert.equal((await api(env, "POST", "/api/admin/cc/keys/respondio.token/test", { token: ot, body: {} })).data.ok, true);
    const r = await api(env, "POST", "/api/admin/cc/keys/wa-test", { token: ot, body: {} });
    assert.deepEqual([r.status, r.data.sent, r.data.to], [200, true, "01279188996"]);
    assert.deepEqual(calls, ["https://api.respond.io/v2/contact/phone%3A%2B201279188996/message"]);
  });
});

/* ======================================================================== F2 */
describe("F2 — only the owner changes an owner's or an admin's account", () => {
  test("re-adding a legacy-flag admin with a lower role, and plan / status / sessions / invite / profile on an owner or admin: 403 for an admin; the owner may; plain members unchanged", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), admin = await mkMember(env, "adm@mig.test", { staff: "admin", role: "admin" });
    const flag = await mkMember(env, "other-admin@mig.test", { role: "admin" }), sup = await mkMember(env, "sup@mig.test", { staff: "support", role: "user" }), plain = await mkMember(env, "plain@co.test");
    const ot = await tok(env, owner), at = await tok(env, admin), st = await tok(env, sup), flagT = await tok(env, flag);
    let r = await api(env, "POST", "/api/admin/cc/staff", { token: at, body: { email: "other-admin@mig.test", role: "support" } });
    assert.deepEqual([r.status, r.data.code], [403, "owner_only"]);
    assert.equal((await getM(env, flag.id)).role, "admin"); assert.equal((await api(env, "GET", "/api/admin/cc/whoami", { token: flagT })).data.role, "admin");
    for (const [m, p, b] of [["POST", `/members/${owner.id}/sessions/revoke`, {}], ["POST", `/members/${owner.id}/status`, { status: "suspended" }], ["POST", `/members/${owner.id}/plan`, { plan: "visitor" }],
      ["POST", `/members/${flag.id}/plan`, { plan: "basic" }], ["POST", `/members/${flag.id}/extend`, { days: 30 }], ["POST", `/members/${flag.id}/invite`, {}], ["PATCH", `/members/${flag.id}`, { name: "x" }], ["POST", `/members/${admin.id}/sessions/revoke`, {}]]) {
      r = await api(env, m, "/api/admin/cc" + p, { token: at, body: b });
      assert.deepEqual([r.status, r.data.code], [403, "owner_only"], m + " " + p);
    }
    assert.equal((await api(env, "PATCH", `/api/admin/cc/members/${owner.id}`, { token: st, body: { phone: "01001112222" } })).data.code, "owner_only", "support (members.contact) neither");
    assert.equal((await api(env, "GET", "/api/admin/cc/whoami", { token: ot })).status, 200, "the owner's session survived");
    assert.equal((await metaOf(env, owner.id)), null, "the owner was not suspended");
    assert.equal((await api(env, "POST", "/api/admin/cc/members", { token: at, body: { email: OWNER.replace("owner", "Owner"), plan: "basic" } })).status, 409, "the owner's mailbox exists");
    assert.equal((await api(env, "POST", "/api/admin/cc/members", { token: at, body: { email: "second-owner@mig.test" } }, )).status, 201);
    // no regression: an admin on a plain member, the owner on an admin
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${plain.id}/plan`, { token: at, body: { plan: "basic", plan_until: "2027-01-01" } })).status, 200);
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${plain.id}/sessions/revoke`, { token: at })).status, 200);
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${flag.id}/plan`, { token: ot, body: { plan: "basic" } })).status, 200);
    r = await api(env, "POST", "/api/admin/cc/staff", { token: ot, body: { email: "other-admin@mig.test", role: "support" } });
    assert.equal(r.status, 201, r.text);
    const env2 = mkEnv({ ADMIN_EMAILS: OWNER + ",boss2@mig.test" }), a2 = await mkMember(env2, "adm@mig.test", { staff: "admin", role: "admin" });
    assert.equal((await api(env2, "POST", "/api/admin/cc/members", { token: await tok(env2, a2), body: { email: "boss2@mig.test" } })).data.code, "owner_only", "an owner address from ADMIN_EMAILS: owner only");
  });
});

/* ======================================================================== F4 + R6 */
function slowD1(env) { // D1 round trips take time in production: interleave parallel requests like there
  const prep = env.DB.prepare.bind(env.DB), wait = () => new Promise(r => setTimeout(r, 1 + Math.random() * 3));
  env.DB.prepare = sql => { const wrap = st => ({ bind: (...a) => wrap(st.bind(...a)), first: async c => { await wait(); return st.first(c); }, all: async () => { await wait(); return st.all(); }, run: async () => { await wait(); return st.run(); }, _runSync: () => st._runSync() }); return wrap(prep(sql)); };
  return env;
}
describe("F4 — single-row invariants are part of the write itself", () => {
  test("the plan's product cap holds under parallel creates; PATCH / submit cannot bring rejected products back past the cap (R6)", async () => {
    const env = mkEnv(), m = await mkMember(env, "cap@f.test", { plan: "basic", expires: days(200), factory_ref: "12" }), t = await tok(env, m), t0 = NOW(), L = "abcdefghjkmnpqrstuvwxyz23456789";
    for (let i = 0; i < 29; i++) await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, created_at, updated_at) VALUES (?, ?, '12', 'approved', '{\"name\":\"a\",\"category\":\"food\"}', ?, ?)").bind("p-aaaaaaa" + L[i], m.id, t0, t0).run();
    for (let i = 0; i < 2; i++) await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, created_at, updated_at) VALUES (?, ?, '12', 'rejected', '{\"name\":\"r\",\"category\":\"food\"}', ?, ?)").bind("p-rrrrrrr" + L[i], m.id, t0, t0).run();
    slowD1(env);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => api(env, "POST", "/api/me/products", { token: t, body: { fields: { name: "P" + i, category: "food" } } })));
    const used = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_member_products WHERE member_id = ? AND state NOT IN ('deleted', 'rejected')").bind(m.id).first()).n;
    assert.equal(rs.filter(r => r.status === 201).length, 1); assert.ok(rs.filter(r => r.status !== 201).every(r => r.status === 429 && r.data.code === "limit"));
    assert.equal(await used(), 30);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_audit WHERE action = 'member.product_create'").first("n"), 1, "an audit row only for the row written");
    for (const [path, body, method] of [["/api/me/products/p-rrrrrrra", { fields: { name: "again" }, submit: true }, "PATCH"], ["/api/me/products/p-rrrrrrrb/submit", {}, "POST"], ["/api/me/products/p-rrrrrrra", { fields: { name: "x" } }, "PATCH"]]) {
      const r = await api(env, method, path, { token: t, body });
      assert.deepEqual([r.status, r.data.code], [429, "limit"], method + " " + path);
    }
    assert.equal(await used(), 30);
    await env.DB.prepare("UPDATE cc_member_products SET state = 'deleted' WHERE id = 'p-aaaaaaaa'").run();
    const back = await Promise.all(["p-rrrrrrra", "p-rrrrrrrb"].map(id => api(env, "POST", `/api/me/products/${id}/submit`, { token: t, body: {} })));
    assert.deepEqual(back.map(r => r.status).sort(), [200, 429], "one free slot → one product back");
    assert.equal(await used(), 30);
  });
  test("one pending company request and one open invoice per member, also under parallel requests", async () => {
    const env = mkEnv(), m = await mkMember(env, "par@f.test", { plan: "basic", expires: days(200) }), t = await tok(env, m);
    slowD1(env);
    const cr = await Promise.all(Array.from({ length: 4 }, () => api(env, "POST", "/api/me/company", { token: t, body: { kind: "claim", factory_ref: "12" } })));
    assert.deepEqual(cr.map(r => r.status).sort(), [201, 409, 409, 409]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_company_requests WHERE member_id = ? AND state = 'pending'").bind(m.id).first("n"), 1);
    const iv = await Promise.all(["premium", "partner", "strategic"].map(plan => api(env, "POST", "/api/me/invoices", { token: t, body: { plan, gcc: GCC3 } })));
    assert.deepEqual(iv.map(r => r.status).sort(), [201, 409, 409]);
    const open = (await env.DB.prepare("SELECT no FROM cc_invoices WHERE status = 'open'").all()).results;
    assert.equal(open.length, 1);
    const year = cairoDay().slice(0, 4);
    assert.equal(await env.DB.prepare("SELECT n FROM cc_counters WHERE k = ?").bind("inv:" + year).first("n"), 1, "numbering stays gap-free: refused inserts take no number");
  });
});

/* ======================================================================== F5 */
describe("F5 — one account per directory listing", () => {
  test("a second claim of a linked listing is refused at approval; an edit from an unlinked member is refused", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const a = await mkMember(env, "a@co.test", { plan: "basic", expires: days(200) }), b = await mkMember(env, "b@evil.test", { plan: "basic", expires: days(200) });
    const ra = await api(env, "POST", "/api/me/company", { token: await tok(env, a), body: { kind: "claim", factory_ref: "12" } });
    const rb = await api(env, "POST", "/api/me/company", { token: await tok(env, b), body: { kind: "claim", factory_ref: "12" } });
    assert.deepEqual([ra.status, rb.status], [201, 201]);
    assert.equal((await api(env, "POST", `/api/admin/cc/approvals/company/${ra.data.request.id}/approve`, { token: ot, body: {} })).status, 200);
    const y = await api(env, "POST", `/api/admin/cc/approvals/company/${rb.data.request.id}/approve`, { token: ot, body: {} });
    assert.deepEqual([y.status, y.data.code], [409, "claimed"]);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE factory_ref = '12'").first()).n, 1);
    assert.equal((await env.DB.prepare("SELECT state FROM cc_company_requests WHERE id = ?").bind(rb.data.request.id).first()).state, "pending", "the team rejects it with a reason");
    // edit → the member is unlinked after a dispute → the pending edit can no longer rewrite the listing
    const c = await mkMember(env, "c@co.test", { plan: "basic", expires: days(200), factory_ref: "11" }), ct = await tok(env, c);
    const ed = await api(env, "POST", "/api/me/company", { token: ct, body: { kind: "edit", fields: { description: "نصنع أنابيب" } } });
    assert.equal(ed.status, 201, ed.text);
    assert.equal((await api(env, "PATCH", `/api/admin/cc/members/${c.id}`, { token: ot, body: { factory_ref: "" } })).status, 200);
    const z = await api(env, "POST", `/api/admin/cc/approvals/company/${ed.data.request.id}/approve`, { token: ot, body: { base_key: "/factories/x/" } });
    assert.deepEqual([z.status, z.data.code], [409, "state"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content").first("n"), 0, "nothing published");
  });
});

/* ======================================================================== F6 + R2 + R3 */
describe("F6 — an anonymous signup binds nothing; the member's own choice replaces a system invoice", () => {
  test("anonymous signup with a member's address: unbound, no pending flip; the member's own invoice replaces it (confirm), the renewal cron never reuses another plan's invoice", async () => {
    const env = mkEnv(), v = await mkMember(env, "victim@co.test");
    let r = await signup(env, "victim@co.test", "strategic");
    assert.equal(r.status, 201, r.text);
    const inv = await env.DB.prepare("SELECT * FROM cc_invoices").first();
    assert.deepEqual([inv.member_id, inv.plan, inv.source], ["", "strategic", "signup"]);
    assert.equal(await metaOf(env, v.id), null);
    const vt = await tok(env, v);
    r = await api(env, "POST", "/api/me/invoices", { token: vt, body: { plan: "basic" } });
    assert.deepEqual([r.status, r.data.code, r.data.replaceable, r.data.invoice.no], [409, "open_invoice", true, inv.no]);
    r = await api(env, "POST", "/api/me/invoices", { token: vt, body: { plan: "basic", replace: true } });
    assert.equal(r.status, 201, r.text); assert.equal(r.data.replaced, inv.no);
    assert.equal((await invByNo(env, inv.no)).status, "void");
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices WHERE status = 'open'").first("n")), 1);
    // a signup sent SIGNED IN by the account holder is theirs: bound + pending
    const w = await mkMember(env, "own@co.test");
    r = await signup(env, "own@co.test", "premium", { token: await tok(env, w) });
    const wi = await env.DB.prepare("SELECT * FROM cc_invoices WHERE email = 'own@co.test'").first();
    assert.equal(wi.member_id, w.id); assert.deepEqual([(await metaOf(env, w.id)).status, (await metaOf(env, w.id)).requested_plan], ["pending", "premium"]);
  });
  test("R2: a second signup for another plan does not issue a second payable invoice", async () => {
    const env = mkEnv();
    assert.equal((await signup(env, "apply@factory.test", "basic", { tag: "1" })).status, 201);
    assert.equal((await signup(env, "apply@factory.test", "premium", { tag: "2" })).status, 201);
    const open = (await env.DB.prepare("SELECT plan FROM cc_invoices WHERE status = 'open'").all()).results;
    assert.deepEqual(open.map(x => x.plan), ["basic"]);
    const ev = (await env.DB.prepare("SELECT body, buyer_visible FROM inquiry_events WHERE type = 'invoice' ORDER BY id").all()).results;
    assert.ok(ev.some(e => e.buyer_visible && /فاتورة اشتراك مفتوحة بالفعل/.test(e.body)));
  });
  test("R3 + cron: the renewal cron replaces a signup invoice for another plan, and the member may replace the renewal invoice with an upgrade", async () => {
    const env = mkEnv(), m = await mkMember(env, "renew@co.test", { plan: "basic", expires: days(20) });
    assert.equal((await signup(env, "renew@co.test", "strategic")).status, 201); // someone else's form with this address
    const nowMs = cairoToUtc(cairoDay(), "10:00");
    const cr = await PAY.paymentsCron(env, nowMs, CC);
    assert.equal(cr.renewals.issued, 1);
    const rows = (await env.DB.prepare("SELECT plan, status, source FROM cc_invoices ORDER BY issued_at").all()).results;
    assert.deepEqual(rows.map(x => [x.plan, x.status, x.source]), [["strategic", "void", "signup"], ["basic", "open", "renewal"]]);
    assert.ok(sent.some(x => x.to === "renew@co.test" && /بينتهي/.test(x.subject)), "the reminder carries the basic renewal");
    const t = await tok(env, m);
    let r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", gcc: GCC3 } });
    assert.deepEqual([r.status, r.data.code, r.data.replaceable], [409, "open_invoice", true]);
    r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", replace: true, gcc: GCC3 } });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.data.quote.kind, r.data.quote.prorated], ["upgrade", true]);
  });
});

/* ======================================================================== F7 */
describe("F7 — member hides are coalesced and never rotate the team's rollback history", () => {
  test("toggles: one shared write budget, at most 6 immediate publishes per member per hour, the rest shipped by ONE cron publish; the team's 20 versions survive", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    for (let i = 1; i <= 20; i++) await env.DB.prepare("INSERT INTO cc_overlay (v, at, by, bytes, sha, counts_json, js, note) VALUES (?, ?, 'owner@mig.test', 10, 'x', '{}', ?, 'staff')").bind(i, NOW(), `window.MIGOVL_DATA={"v":${i}};\n`).run();
    const m = await mkMember(env, "prod@f.test", { plan: "basic", expires: days(200), factory_ref: "12" }), t = await tok(env, m);
    const c = await api(env, "POST", "/api/me/products", { token: t, body: { fields: { name: "Pipe", category: "plastic" }, submit: true } });
    assert.equal((await api(env, "POST", `/api/admin/cc/approvals/product/${c.data.item.id}/approve`, { token: ot, body: { company_url: SITE + "/company.html#12" } })).status, 200);
    kvPuts = 0;
    const st = []; for (let i = 0; i < 9; i++) st.push(await api(env, "POST", `/api/me/products/${c.data.item.id}/hide`, { token: t, body: { hidden: i % 2 === 0 } }));
    assert.ok(st.every(r => r.status === 200));
    const memberV = await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay WHERE \"by\" LIKE 'member:%'").first("n");
    assert.ok(memberV <= 6, "member publishes: " + memberV); assert.ok(kvPuts <= 2 * 6);
    assert.equal(st.at(-1).data.published, false); assert.equal(st.at(-1).data.publish_eta_s, 900);
    const row = await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(c.data.item.id).first();
    assert.deepEqual([row.state, row.hidden], ["draft", 1], "saved at once, waiting for the coalesced publish");
    const out = await CONTENT.contentCron(env, Date.now(), CC);
    assert.equal(out.member.published, 1);
    const live = await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(c.data.item.id).first();
    assert.deepEqual([live.state, live.live_hidden], ["published", 1]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay WHERE \"by\" = 'owner@mig.test'").first("n"), 20, "the team's rollback history is intact");
    // the shared budget: 60 writes per hour per member
    for (let i = 0; i < 52; i++) await api(env, "POST", `/api/me/products/${c.data.item.id}/hide`, { token: t, body: { hidden: true } });
    const over = await api(env, "PATCH", `/api/me/products/${c.data.item.id}`, { token: t, body: { fields: { name: "Pipe 2" } } });
    assert.deepEqual([over.status, over.data.code], [429, "rate_limited"]);
  });
});

/* ======================================================================== F8 */
describe("F8 — the old-password bridge is for old-system accounts only, Turnstile is required, the session is link-scoped", () => {
  test("a proven mailbox or a non-imported account → 403 before the old server; an imported account → a limited session", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), owner = await mkMember(env, OWNER);
    await mkMember(env, "sales@factory.test", { plan: "partner", expires: days(300), factory_ref: "12" }); // proved its mailbox
    await mkMember(env, "made-by-admin@factory.test", { plan: "basic", expires: days(300), unverified: true }); // never from the old system
    for (const e of ["sales@factory.test", "Sales@Factory.test", "made-by-admin@factory.test"]) {
      const r = await api(env, "POST", "/api/auth/legacy", { body: { email: e, password: "whatever" } });
      assert.deepEqual([r.status, r.data.code], [403, "use_email_code"], e);
    }
    assert.deepEqual(oldCalls, [], "refused before the old server is contacted");
    const imp = await mkMember(env, "old@factory.test", { plan: "basic", expires: days(200), unverified: true, factory_ref: "11", meta: { source: "import", legacy_id: "77" } });
    const r = await api(env, "POST", "/api/auth/legacy", { body: { email: "old@factory.test", password: "pw" } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.user.id, imp.id); assert.deepEqual([r.data.via, r.data.scope], ["legacy", "link"]);
    assert.match(r.data.token, /^v2\.[^.]+\.lg[a-f0-9]{30}\./);
    const T = r.data.token;
    assert.equal((await api(env, "GET", "/api/me/account", { token: T })).data.legacy_session, true);
    assert.equal((await api(env, "GET", "/api/me/invoices", { token: T })).status, 200, "read + pay");
    for (const [m, p, b] of [["POST", "/api/me/products", { fields: { name: "x", category: "food" } }], ["PATCH", "/api/me", { name: "x" }], ["POST", "/api/me/prefs", { pause: true }], ["POST", "/api/me/company", { kind: "edit", fields: { description: "x" } }], ["POST", "/api/me/invoices", { plan: "premium" }]]) {
      const x = await api(env, m, p, { token: T, body: b });
      assert.deepEqual([x.status, x.data.code], [403, "full_login_required"], m + " " + p);
    }
    assert.equal((await api(env, "GET", "/api/admin/cc/whoami", { token: T })).data.code, "use_email_code");
    assert.equal((await api(env, "GET", "/api/team/whoami", { token: T })).data.code, "use_email_code");
    assert.equal((await api(env, "GET", "/api/me", { token: T })).data.user.staff_role, "");
    // a brand-new address is created by the bridge (source legacy_login) and may use it again; once its mailbox is proven, never again
    const n = await api(env, "POST", "/api/auth/legacy", { body: { email: "new@factory.test", password: "pw" } });
    assert.equal(n.status, 200, n.text);
    const nm = await env.DB.prepare("SELECT * FROM members WHERE email = 'new@factory.test'").first();
    assert.equal((await metaOf(env, nm.id)).source, "legacy_login");
    assert.equal((await api(env, "POST", "/api/auth/legacy", { body: { email: "new@factory.test", password: "pw" } })).status, 200);
    await env.DB.prepare("UPDATE members SET email_verified_at = ? WHERE id = ?").bind(NOW(), nm.id).run();
    assert.equal((await api(env, "POST", "/api/auth/legacy", { body: { email: "new@factory.test", password: "pw" } })).data.code, "use_email_code");
    assert.ok(owner);
  });
  test("Turnstile is required when TURNSTILE_SECRET is set; a suspended old account stays suspended", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD, TURNSTILE_SECRET: "ts-secret" });
    const r = await api(env, "POST", "/api/auth/legacy", { body: { email: "x@old.test", password: "pw" } });
    assert.deepEqual([r.status, r.data.code], [403, "verification_required"]); assert.deepEqual(oldCalls, []);
    const env2 = mkEnv({ LEGACY_ORIGIN: OLD });
    const s = await mkMember(env2, "susp@old.test", { unverified: true, meta: { status: "suspended", suspended_plan: "basic", source: "import", legacy_id: "5" } });
    assert.equal((await api(env2, "POST", "/api/auth/legacy", { body: { email: "susp@old.test", password: "pw" } })).status, 200);
    assert.equal((await getM(env2, s.id)).plan, "visitor"); assert.equal((await metaOf(env2, s.id)).status, "suspended");
  });
});

/* ======================================================================== F9 + F10 + L4 */
describe("F9 / F10 / L4", () => {
  test("F9: the Control Center and /api/me answer only at their own paths", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    for (const p of ["/api/janna/x/api/admin/cc/whoami", "/api/advisor/x/api/admin/cc/keys", "/api/wa/x/api/me/account", "/x/api/pay/health", "/api/x/api/team/whoami"]) {
      const r = await api(env, "GET", p, { token: ot });
      assert.notEqual(r.status, 200, p + " → " + r.text.slice(0, 80)); // another family's own answer (404 / 401 / 503), never the Control Center's
      assert.ok(!(r.data && (r.data.role || r.data.config_secret !== undefined || r.data.plan !== undefined || r.data.ready !== undefined)), p + " → " + r.text.slice(0, 80));
    }
    assert.equal((await api(env, "GET", "/api/admin/cc/whoami", { token: ot })).data.role, "owner");
  });
  test("F10: the editor's statistics carry counts, not new members' addresses or money", async () => {
    const env = mkEnv(), ed = await mkMember(env, "ed@mig.test", { staff: "editor", role: "seo" }), sup = await mkMember(env, "sup@mig.test", { staff: "support" });
    await mkMember(env, "ceo@newfactory.test", { created_at: days(1) });
    const e = await api(env, "GET", "/api/admin/cc/stats", { token: await tok(env, ed) });
    assert.equal(e.status, 200); assert.ok(e.data.recent.length > 0 && e.data.recent.every(x => x.email === ""));
    assert.deepEqual([e.data.unpaid, e.data.revenue_month_minor], [null, null]);
    const s = await api(env, "GET", "/api/admin/cc/stats", { token: await tok(env, sup) });
    assert.equal(s.data.recent[0].email, "ceo@newfactory.test"); assert.deepEqual(s.data.unpaid, { n: 0, total_minor: 0 }); assert.equal(s.data.revenue_month_minor, 0);
  });
  test("L4: every CSV export leaves one audit row (dataset, filters, rows — no data); a failing audit hands out no file", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    await mkMember(env, "m1@co.test"); await mkMember(env, "m2@co.test");
    let r = await api(env, "GET", "/api/admin/cc/members.csv?q=co.test", { token: ot });
    assert.equal(r.status, 200);
    const a = await env.DB.prepare("SELECT * FROM cc_audit WHERE action = 'export.members'").first();
    assert.deepEqual(JSON.parse(a.after_json), { filters: { q: "co.test" }, rows: 2 }); assert.doesNotMatch(a.after_json + a.summary, /m1@co/);
    for (const p of ["/api/admin/cc/pay/invoices.csv", "/api/admin/cc/pay/payments.csv", "/api/admin/cc/orders.csv", "/api/admin/cc/customers.csv", "/api/admin/cc/audit.csv", "/api/admin/cc/reports/members.csv"]) assert.equal((await api(env, "GET", p, { token: ot })).status, 200, p);
    const acts = (await env.DB.prepare("SELECT action FROM cc_audit WHERE action LIKE 'export.%' ORDER BY id").all()).results.map(x => x.action);
    assert.deepEqual(acts, ["export.members", "export.invoices", "export.payments", "export.orders", "export.customers", "export.audit", "export.report-members"]);
    env.DB.db.exec("CREATE TRIGGER no_audit BEFORE INSERT ON cc_audit BEGIN SELECT RAISE(ABORT, 'audit down'); END;");
    r = await api(env, "GET", "/api/admin/cc/members.csv", { token: ot });
    assert.deepEqual([r.status, r.data && r.data.code], [500, "audit_failed"]); assert.doesNotMatch(r.text, /m1@co\.test/);
    r = await api(env, "GET", "/api/admin/cc/pay/invoices.csv", { token: ot });
    assert.equal(r.status, 500);
  });
});

/* ======================================================================== PAY-H1 */
describe("PAY-H1 — upgrades are prorated (Terms §5)", () => {
  test("planQuote: renewal from the current end, upgrade = the price difference for the days left with the end date kept, new period for a visitor", async () => {
    const env = mkEnv(), m = await mkMember(env, "q@f.test", { plan: "basic", expires: new Date(cairoToUtc(cairoDay(Date.now() + 20 * DAY), "23:59")).toISOString() });
    const up = await PAY.planQuote(env, m, "premium");
    assert.deepEqual([up.kind, up.prorated, up.days_left, up.period_days, up.until], ["upgrade", true, 20, 20, m.plan_expires]);
    assert.equal(up.net_minor, Math.round(2500000 * 20 / 365) - Math.round(1000000 * 20 / 365));
    assert.equal(up.total_minor, up.net_minor + Math.round(up.net_minor * 1400 / 10000));
    const rn = await PAY.planQuote(env, m, "basic");
    assert.deepEqual([rn.kind, rn.net_minor, cairoDay(Date.parse(rn.until))], ["renewal", 1000000, cairoDay(Date.parse(m.plan_expires) + 365 * DAY)]);
    const nv = await PAY.planQuote(env, null, "basic");
    assert.deepEqual([nv.kind, nv.net_minor, nv.period_days], ["new", 1000000, 365]);
    await assert.rejects(PAY.planQuote(env, m, "profile"), e => e.code === "plan_lower" && e.extra.available_from === cairoDay(Date.parse(m.plan_expires)));
  });
  test("«باقتي»: quote → invoice → payment: a prepaid renewal and a later upgrade lose no paid day (R4)", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const m = await mkMember(env, "up@f.test", { plan: "basic", expires: days(20) }), t = await tok(env, m);
    let r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "basic" } });
    assert.equal(r.status, 201, r.text);
    assert.equal((await markPaid(env, ot, r.data.invoice.no)).status, 200);
    const renewed = await getM(env, m.id);
    assert.ok(Date.parse(renewed.plan_expires) > Date.now() + 380 * DAY);
    const q = await api(env, "GET", "/api/me/invoices/quote?plan=premium", { token: t });
    assert.equal(q.status, 200, q.text);
    assert.deepEqual([q.data.quote.kind, q.data.quote.prorated, q.data.quote.until, q.data.open_invoice], ["upgrade", true, renewed.plan_expires, null]);
    r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", gcc: GCC3 } });
    assert.equal(r.status, 201);
    assert.equal(r.data.invoice.total_minor, q.data.quote.total_minor, "the quote is what the invoice charges");
    const inv = await invByNo(env, r.data.invoice.no);
    assert.deepEqual([inv.source, inv.period_end, inv.period_days], ["upgrade", renewed.plan_expires, q.data.quote.days_left]);
    assert.ok(inv.total_minor < 2850000 * (q.data.quote.days_left / 365) + 100, "never the full new price");
    assert.equal((await markPaid(env, ot, inv.no)).status, 200);
    const up = await getM(env, m.id);
    assert.deepEqual([up.plan, up.plan_expires], ["premium", renewed.plan_expires], "the paid renewal year is kept");
    assert.deepEqual(JSON.parse(up.prefs_json).gcc, GCC3, "the GCC states chosen with the upgrade are the member's");
    const pub = await api(env, "GET", "/api/pay/invoice?t=" + inv.pay_token);
    assert.equal(pub.data.invoice.period_end, cairoDay(Date.parse(renewed.plan_expires)));
  });
});

/* ======================================================================== PAY-H2 + PAY-H3 */
describe("PAY-H2 / PAY-H3 — a lower plan or a suspended account", () => {
  test("a lower plan is never invoiced while a higher one runs; one paid anyway (admin) is applied by the cron when the higher plan ends, with a receipt each time", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const m = await mkMember(env, "down@f.test", { plan: "premium", expires: days(12) });
    assert.equal((await signup(env, "down@f.test", "basic")).status, 201);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices").first("n"), 0, "no lower-plan invoice from /register/");
    const r = await api(env, "POST", "/api/me/invoices", { token: await tok(env, m), body: { plan: "basic" } });
    assert.deepEqual([r.status, r.data.code, r.data.available_from], [409, "plan_lower", cairoDay(Date.parse(m.plan_expires))]);
    const a = await api(env, "POST", "/api/admin/cc/pay/invoices", { token: ot, body: { member_id: m.id, plan: "basic" } });
    assert.equal(a.status, 201, a.text);
    const p = await markPaid(env, ot, a.data.invoice.no);
    assert.deepEqual([p.status, p.data.activation.skipped], [200, "higher"]);
    const inv = await invByNo(env, a.data.invoice.no);
    assert.equal(await ledger(env, inv.id), "activated:skip_higher");
    assert.ok(sent.some(x => x.to === "down@f.test" && /قيد المراجعة/.test(x.subject)), "the payer gets a receipt with the review wording");
    assert.equal((await api(env, "GET", "/api/pay/invoice?t=" + inv.pay_token)).data.activation.status, "review");
    // still higher: the cron leaves it; the premium plan ends: the cron applies the paid basic period
    assert.equal((await PAY.paymentsCron(env, Date.now(), CC)).activations.applied, 0);
    await env.DB.prepare("UPDATE members SET plan_expires = ? WHERE id = ?").bind(new Date(Date.now() - 60000).toISOString(), m.id).run();
    const c = await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(c.activations.applied, 1);
    const after = await getM(env, m.id);
    assert.equal(after.plan, "basic"); assert.ok(Date.parse(after.plan_expires) > Date.now() + 364 * DAY);
    assert.match(await ledger(env, inv.id), /^activated:20/);
    assert.ok(sent.some(x => x.to === "down@f.test" && /استلمنا الدفع/.test(x.subject) && !/قيد المراجعة/.test(x.subject)));
  });
  test("a suspended account cannot buy its way out: no quote / invoice / signup invoice; a payment that arrives anyway keeps the suspension and is applied after reactivation", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const exp = days(200), m = await mkMember(env, "susp@f.test", { plan: "strategic", expires: exp });
    const { invoice } = await PAY.issueInvoice(env, { member_id: m.id, email: m.email, plan: "strategic", source: "renewal", by: "system", send: false, single: true }, CC); // issued before the suspension
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${m.id}/status`, { token: ot, body: { status: "suspended" } })).status, 200);
    const t = await tok(env, m);
    for (const [meth, p, b] of [["GET", "/api/me/invoices/quote?plan=basic"], ["POST", "/api/me/invoices", { plan: "basic" }], ["POST", "/api/me/invoices", { plan: "partner", replace: true }]]) {
      const r = await api(env, meth, p, { token: t, body: b });
      assert.deepEqual([r.status, r.data.code], [403, "suspended"], meth + " " + p);
    }
    assert.equal((await signup(env, "susp@f.test", "basic")).status, 201);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices").first("n"), 1, "no signup invoice for a suspended account");
    const p = await markPaid(env, ot, invoice.no);
    assert.deepEqual([p.status, p.data.activation.skipped], [200, "suspended"]);
    const mt = await metaOf(env, m.id), mm = await getM(env, m.id);
    assert.deepEqual([mt.status, mt.suspended_plan, mm.plan, mm.inbox_paused], ["suspended", "strategic", "visitor", 1], "the admin's suspension holds");
    assert.equal((await PAY.paymentsCron(env, Date.now(), CC)).activations.applied, 0);
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${m.id}/status`, { token: ot, body: { status: "active" } })).status, 200);
    assert.equal((await PAY.paymentsCron(env, Date.now(), CC)).activations.applied, 1);
    const back = await getM(env, m.id);
    assert.equal(back.plan, "strategic"); assert.ok(Date.parse(back.plan_expires) > Date.parse(exp) + 364 * DAY, "the paid renewal is added after reactivation");
  });
});
