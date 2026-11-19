// Regression tests for the deploy-2 findings closed in the final check (after the review-fix round):
//   PAY-M5 (approval re-checks the plan and the cap), PAY-M3 (an unreadable gateway secret answers 503 so the provider retries; an attempt
//   that expires unconfirmed alerts the owners), PAY-M4 (invoice / receipt e-mails carry the tax-invoice details) and the D1 upgrade path
//   for a database that ran the first 0006 (cc_invoices.period_end — production since 2026-11-18).
// Everything goes through the real index.js; no network (Resend is mocked, any other URL fails the test).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker, { CC } from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import * as PAY from "../src/payments.js";
import { now as NOW } from "../src/common.js";

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const SITE = "https://madeinegyptgate.com", OWNER = "owner@mig.test", DAY = 86400000;
let sent, realFetch, realWarn;
beforeEach(() => {
  realFetch = globalThis.fetch; realWarn = console.warn; console.warn = () => {};
  sent = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text }); return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });

function mkEnv(extra = {}) {
  const DB = new D1(); DB.db.exec(MIG);
  return { DB, AUTH_SECRET: "a".repeat(40), CONFIG_SECRET: "c".repeat(40), RESEND_API_KEY: "re_test_key_123456", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
    ADMIN_EMAILS: OWNER, SEO_KV: { async put() {}, async get() { return null; }, async getWithMetadata() { return null; } }, ...extra };
}
let seq = 0;
async function mkMember(env, email, o = {}) {
  const id = "f" + String(++seq).padStart(8, "0"), t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, plan_expires, email_verified_at, role, factory_ref, name, phone) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'user', ?, 'Ahmed', '01001234567')")
    .bind(id, o.company || "Co " + id, email, o.plan || "visitor", t, t, o.expires || "", t, o.factory_ref || "").run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
const tok = async (env, m) => (await issueSession(env, m)).token;
let ipn = 0;
async function api(env, method, path, { token, body, headers = {} } = {}) {
  const h = { "CF-Connecting-IP": "203.0.113." + (1 + (ipn++ % 250)), "User-Agent": "Mozilla/5.0 test", ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const p = [], ctx = { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); } };
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  while (p.length) await p.shift();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const days = n => new Date(Date.now() + n * DAY).toISOString();
const COMPANY_URL = "https://www.madeinegyptgate.com/factories/hydrohex/";
async function pending(env, m, id, live = "") {
  const t = NOW();
  await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, live_json, submitted_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)")
    .bind(id, m.id, m.factory_ref || "12", JSON.stringify({ name: "منتج " + id, category: "food", images: [] }), live, t, t, t).run();
}
const approve = (env, t, id) => api(env, "POST", `/api/admin/cc/approvals/product/${id}/approve`, { token: t, body: { company_url: COMPANY_URL } });

describe("PAY-M5 — approval re-checks the member's plan and product cap", () => {
  test("a new product of an expired plan or past the cap is refused; an edit of a live product and a product within the cap are approved", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const gone = await mkMember(env, "gone@f.test", { plan: "basic", expires: days(-3), factory_ref: "12" });
    await pending(env, gone, "p-aged2222");
    let r = await approve(env, ot, "p-aged2222");
    assert.deepEqual([r.status, r.data && r.data.code], [409, "plan"], r.text);
    assert.equal((await env.DB.prepare("SELECT state FROM cc_member_products WHERE id = 'p-aged2222'").first("state")), "pending", "nothing changed");
    // basic = 30 products: 30 live already → a 31st new product is refused, an edit of a live one is not
    const full = await mkMember(env, "full@f.test", { plan: "basic", expires: days(200), factory_ref: "13" }), t0 = NOW(), L = "abcdefghjkmnpqrstuvwxyz23456789";
    for (let i = 0; i < 30; i++) await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, live_json, created_at, updated_at) VALUES (?, ?, '13', 'approved', '{\"name\":\"a\",\"category\":\"food\"}', '{\"name\":\"a\"}', ?, ?)").bind("p-kkkkkkk" + L[i], full.id, t0, t0).run();
    await pending(env, full, "p-new22222");
    r = await approve(env, ot, "p-new22222");
    assert.deepEqual([r.status, r.data && r.data.code, r.data && r.data.limit], [409, "limit", 30], r.text);
    await env.DB.prepare("UPDATE cc_member_products SET state = 'pending', draft_json = '{\"name\":\"edited\",\"category\":\"food\",\"images\":[]}' WHERE id = 'p-kkkkkkka'").run();
    r = await approve(env, ot, "p-kkkkkkka");
    assert.equal(r.status, 200, "an edit of a live product adds nothing: " + r.text);
    const ok = await mkMember(env, "ok@f.test", { plan: "basic", expires: days(200), factory_ref: "14" });
    await pending(env, ok, "p-yes22222");
    r = await approve(env, ot, "p-yes22222");
    assert.equal(r.status, 200, r.text);
  });
});

describe("PAY-M3 — a payment the server could not confirm is never silently dropped", () => {
  async function paymobConfigured(env) {
    const owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const r = await api(env, "PUT", "/api/admin/cc/pay/config", { token: ot, body: { enabled: 1, provider: "paymob", mode: "live", integration_ids: "4567", public_key: "egy_pk_live_Qw3rTy7uIoP9aSdF", api_key: "egy_sk_live_a1b2c3d4e5f6a7b8c9d0e1f2", webhook_secret: "7F2D9E1B6C3A8F0E4D5C6B7A8F9E0D1C" } });
    assert.equal(r.status, 200, r.text);
    return ot;
  }
  test("a saved but unreadable Paymob HMAC secret (CONFIG_SECRET changed) → 503 so Paymob retries, one owner alert per hour; never 200", async () => {
    const env = mkEnv(); await paymobConfigured(env);
    const rotated = { ...env, CONFIG_SECRET: "d".repeat(40) };
    const hook = () => api(rotated, "POST", "/api/pay/webhook/paymob?hmac=abc", { body: { type: "TRANSACTION", obj: { id: 1, order: { id: 987654 }, success: true, amount_cents: 1140000 } } });
    let r = await hook();
    assert.deepEqual([r.status, r.data && r.data.code], [503, "retry"], r.text);
    r = await hook();
    assert.equal(r.status, 503);
    const alerts = sent.filter(x => x.to === OWNER && /مش مقروء/.test(x.subject));
    assert.equal(alerts.length, 1, "one alert per provider per hour");
    assert.match(alerts[0].text, /بوابة الدفع/);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_pay_events WHERE result = 'rejected:unreadable'").first("x"), "logged");
    // a secret that was never saved stays 200 (nothing to recover) — another gateway with no keys
    r = await api(mkEnv(), "POST", "/api/pay/webhook/paymob?hmac=abc", { body: { type: "TRANSACTION", obj: { id: 1, order: { id: 1 } } } });
    assert.equal(r.status, 200);
  });
  test("an attempt that reached the gateway and expires unconfirmed alerts the owners once (open invoice only)", async () => {
    const env = mkEnv(); await paymobConfigured(env);
    const m = await mkMember(env, "late@f.test");
    const { invoice } = await PAY.issueInvoice(env, { member_id: m.id, email: m.email, company: "مصنع متأخر", plan: "basic", source: "member", by: "test", send: false }, CC);
    const paid = (await PAY.issueInvoice(env, { email: "paid@f.test", company: "مدفوع", plan: "basic", source: "admin", by: "test", send: false }, CC)).invoice;
    const old = new Date(Date.now() - 3 * DAY).toISOString();
    await env.DB.prepare("INSERT INTO cc_payments (id, invoice_id, provider, mode, provider_ref, provider_order, amount_minor, currency, status, created_at, updated_at) VALUES ('pay-lost-0001', ?, 'paymob', 'live', 'pi_live_1', '987654', 1140000, 'EGP', 'redirected', ?, ?)").bind(invoice.id, old, old).run();
    await env.DB.prepare("INSERT INTO cc_payments (id, invoice_id, provider, mode, provider_ref, provider_order, amount_minor, currency, status, created_at, updated_at) VALUES ('pay-paid-0001', ?, 'paymob', 'live', 'pi_live_2', '987655', 1140000, 'EGP', 'redirected', ?, ?)").bind(paid.id, old, old).run();
    await env.DB.prepare("UPDATE cc_invoices SET status = 'paid', paid_at = ? WHERE id = ?").bind(NOW(), paid.id).run();
    await PAY.paymentsCron(env, Date.now(), CC);
    await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(await env.DB.prepare("SELECT status FROM cc_payments WHERE id = 'pay-lost-0001'").first("status"), "expired");
    const alerts = sent.filter(x => x.to === OWNER && /محتاج تدخّل/.test(x.subject));
    assert.equal(alerts.filter(x => x.subject.includes(invoice.no)).length, 1, "one alert for the open invoice");
    assert.ok(!alerts.some(x => x.subject.includes(paid.no)), "no alert for an invoice that is already paid");
    assert.match(alerts.find(x => x.subject.includes(invoice.no)).text, /تسجيل دفع يدوي/);
    // the payment page warns for 48 h after an unconfirmed attempt (data/pay.js reads last_attempt)
    const pub = await api(env, "GET", "/api/pay/invoice?t=" + invoice.pay_token);
    assert.equal(pub.status, 200); assert.equal(pub.data.last_attempt.status, "expired");
  });
});

describe("PAY-M4 — the invoice and the receipt carry the tax-invoice details", () => {
  test("seller (operator + tax / CR numbers from the settings), buyer (+ the signup's tax / CR numbers), net / VAT / total; the receipt adds amount, date, method, reference", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    for (const [k, v] of [["tax_no", "999-888-777"], ["cr_no", "CR-12345"]]) await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'public', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v, NOW()).run();
    await env.DB.prepare("INSERT INTO inquiries (ref, kind, status, email, name, company, phone, message, target_type, target_id, payload_json, created_at, updated_at) VALUES ('MIG-26-ABCDEF', 'signup', 'new', 'vat@factory.test', 'Ahmed', 'مصنع الضريبة', '01001234567', 'x', 'plan', 'basic', ?, ?, ?)")
      .bind(JSON.stringify({ plan: "basic", tax_no: "555-444-333", cr_no: "98765" }), NOW(), NOW()).run().catch(() => null);
    const m = await mkMember(env, "vat@factory.test", { company: "مصنع الضريبة" });
    const { invoice } = await PAY.issueInvoice(env, { member_id: m.id, email: m.email, company: "مصنع الضريبة", plan: "basic", source: "admin", by: "admin", send: true, inquiry_ref: "MIG-26-ABCDEF" }, CC);
    const mail = sent.find(x => x.to === "vat@factory.test" && /فاتورة اشتراك/.test(x.subject));
    assert.ok(mail, "invoice e-mail sent");
    assert.match(mail.text, /الصافي 10,000 جنيه · ضريبة القيمة المضافة 14% = 1,400 جنيه · الإجمالي 11,400 جنيه/);
    assert.match(mail.text, /البائع: [^\n]*رقم التسجيل الضريبي 999-888-777[^\n]*السجل التجاري CR-12345/);
    assert.match(mail.text, /المشتري: مصنع الضريبة — vat@factory\.test/);
    assert.match(mail.text, new RegExp("فاتورة رقم " + invoice.no));
    const r = await api(env, "POST", `/api/admin/cc/pay/invoices/${invoice.no}/mark-paid`, { token: ot, body: { manual_ref: "INSTAPAY-REF-77", confirm: invoice.no } });
    assert.equal(r.status, 200, r.text);
    const rec = sent.find(x => x.to === "vat@factory.test" && /استلمنا الدفع/.test(x.subject));
    assert.ok(rec, "receipt sent");
    assert.match(rec.text, /\(11,400 جنيه شامل الضريبة\)/);
    assert.match(rec.text, /اتدفعت يوم \d{4}-\d{2}-\d{2}/);
    assert.match(rec.text, /المرجع: INSTAPAY-REF-77/);
    assert.match(rec.text, /Net EGP 10,000 · VAT 14% = EGP 1,400 · Total EGP 11,400/);
  });
});

describe("D1 — a database that ran the first 0006 (production) gets cc_invoices.period_end from the planner", () => {
  test("deploy/d1_migrate.py plans exactly the missing ALTER, then verify passes; nothing is planned twice", { skip: spawnSync("python3", ["--version"]).status !== 0 && "python3 missing" }, () => {
    const dir = mkdtempSync(join(tmpdir(), "d1plan-")), repo = new URL("../../", import.meta.url).pathname, py = join(repo, "deploy/d1_migrate.py");
    try {
      // the live shape: every schema.sql table and column except cc_invoices.period_end (the first 0006 had no such column)
      const cols = JSON.parse(spawnSync("python3", ["-c", "import json,sys;sys.path.insert(0,sys.argv[1]);import d1_migrate as d;print(json.dumps(d.schema_columns(sys.argv[2])))", join(repo, "deploy"), join(repo, "worker/schema.sql")], { encoding: "utf8" }).stdout);
      cols.cc_invoices = cols.cc_invoices.filter(c => c !== "period_end");
      writeFileSync(join(dir, "state.json"), JSON.stringify({ tables: cols }));
      const plan = spawnSync("python3", [py, "plan", "--state", join(dir, "state.json"), "--out", join(dir, "plan")], { encoding: "utf8" });
      assert.equal(plan.status, 0, plan.stdout + plan.stderr);
      assert.match(plan.stdout, /add 1 missing column\(s\): cc_invoices\.period_end/);
      assert.match(readFileSync(join(dir, "plan", "01-add-missing-columns.sql"), "utf8"), /ALTER TABLE cc_invoices ADD COLUMN period_end TEXT NOT NULL DEFAULT ''/);
      const v = spawnSync("python3", [py, "verify", "--state", join(dir, "state.json")], { encoding: "utf8" });
      assert.notEqual(v.status, 0, "verify fails before the ALTER");
      cols.cc_invoices.push("period_end"); writeFileSync(join(dir, "state.json"), JSON.stringify({ tables: cols }));
      const again = spawnSync("python3", [py, "plan", "--state", join(dir, "state.json"), "--out", join(dir, "plan2")], { encoding: "utf8" });
      assert.equal(again.status, 0); assert.match(again.stdout, /no missing columns/);
      assert.equal(spawnSync("python3", [py, "verify", "--state", join(dir, "state.json")], { encoding: "utf8" }).status, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
