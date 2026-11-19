// Payments (ACC-CONTRACT §3.3, §5, §11.3): crypto.js secret store, invoices, the three provider adapters with mocked HTTP, webhooks /
// returns (verification + idempotency), readiness, the cron, admin actions, member self-service, and "no 0006 tables" fail-open.
// Run alone: node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/payments.test.mjs
// No network: globalThis.fetch is replaced per test and any unexpected URL fails the test. Cross-area calls use a fake CC (§0.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { D1 } from "./helpers.mjs";
import * as PAY from "../src/payments.js";
import * as CRYPTO from "../src/crypto.js";
import { handleInquiries } from "../src/inquiries.js";
import { cairoToUtc } from "../src/meetings.js";
import { cairoDay } from "../src/common.js";

/* migration 0006 (acc-core writes it verbatim from the contract; before it exists the contract's §2 block is used) */
const MIG_URL = new URL("../migrations/0006_admin_center.sql", import.meta.url);
const MIG = existsSync(MIG_URL) ? readFileSync(MIG_URL, "utf8")
  : /## 2\. D1 migration[\s\S]*?```sql\n([\s\S]*?)```/.exec(readFileSync(new URL("../../docs/janna/ACC-CONTRACT.md", import.meta.url), "utf8"))[1];
const SITE = "https://madeinegyptgate.com";
const OWNER = "owner@madeinegyptgate.com";
const SECRETS = { cfg: "c".repeat(40), auth: "a".repeat(40) };
function mkEnv(extra = {}, { tables = true } = {}) {
  const d = new D1();
  if (tables) { d.db.exec(MIG); d.db.exec(MIG); } // idempotent: twice
  else for (const { name } of d.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc!_%' ESCAPE '!'").all()) d.db.exec(`DROP TABLE "${name}"`); // schema.sql carries 0006 since P-W8
  return { DB: d, AUTH_SECRET: SECRETS.auth, CONFIG_SECRET: SECRETS.cfg, RESEND_API_KEY: "re_test_key_123456", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: OWNER, ...extra };
}
const ctx = { waitUntil: p => { ctx.jobs.push(Promise.resolve(p).catch(() => {})); }, jobs: [] };
const drain = async () => { while (ctx.jobs.length) await ctx.jobs.shift(); };
const jres = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
/* fetch mock: handlers return a Response or null; anything unmatched is recorded and throws */
function mockFetch(...handlers) {
  const orig = globalThis.fetch, calls = [], unexpected = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url, method = String(init.method || (input && input.method) || "GET").toUpperCase();
    const headers = new Headers(init.headers || (typeof input === "object" && input.headers) || {}), body = init.body == null ? "" : typeof init.body === "string" ? init.body : String(init.body);
    let json = null; try { json = body ? JSON.parse(body) : null; } catch (e) { json = null; }
    const c = { url, method, headers, body, json }; calls.push(c);
    for (const h of handlers) { const r = await h(c); if (r) return r; }
    unexpected.push(method + " " + url);
    throw new Error("unexpected fetch " + method + " " + url);
  };
  return { calls, unexpected, restore() { globalThis.fetch = orig; } };
}
const resend = mails => c => (c.url === "https://api.resend.com/emails" ? (mails.push({ id: c.headers.get("Idempotency-Key") || "", to: c.json.to, subject: c.json.subject, text: c.json.text, html: c.json.html }), jres({ id: "re_" + mails.length })) : null);
const rq = (path, { method = "GET", body, headers = {} } = {}) => new Request(SITE + path, { method,
  headers: { ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}), "CF-Connecting-IP": "203.0.113.7", "User-Agent": "test", ...headers },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
async function out(res) { const t = await res.text(); let d = null; try { d = JSON.parse(t); } catch (e) { d = null; } return { status: res.status, data: d, text: t, headers: res.headers }; }
const admin = async (env, adm, path, opts) => out(await PAY.handlePayAdmin(rq("/api/admin/cc/pay" + path, opts), env, ctx, adm));
const pub = async (env, CC, path, opts) => out(await PAY.handlePay(rq("/api/pay" + path, opts), env, ctx, CC));
const NOW = () => new Date().toISOString();
let seq = 0;
async function mkMember(env, { email, plan = "visitor", expires = "", verified = 1, ev = "2026-01-01T00:00:00.000Z", company = "شركة الاختبار للصناعات", name = "أحمد علي", phone = "01001234567" } = {}) {
  const id = "u" + String(++seq).padStart(8, "0"), t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, plan_expires, email_verified_at, name, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, company, email, plan, verified, t, t, expires, ev, name, phone).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
/* the §0.5 matrix for the payment permissions */
const PERMS = { owner: ["pay.read", "pay.invoice", "pay.mark_paid", "pay.config"], admin: ["pay.read", "pay.invoice", "pay.mark_paid"], platform: ["pay.read", "pay.invoice", "pay.mark_paid"], support: ["pay.read"], editor: [] };
function mkAdm(env, role, member, CC, { failAudit = false } = {}) {
  const audits = [];
  return { member, role, perms: PERMS[role], can: p => PERMS[role].includes(p), CC, audits,
    async audit(action, type, id, before, after, summary) {
      if (failAudit) throw new Error("audit table gone");
      audits.push({ action, type, id, before, after, summary });
      await env.DB.prepare("INSERT INTO cc_audit (at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(NOW(), member ? member.id : "platform", member ? member.email : "", role, action, type, String(id), summary || "", JSON.stringify(before ?? null), JSON.stringify(after ?? null)).run();
      return audits.length;
    } };
}
/* fake CC: setPlan emulates acc's write (plan, expiry, verified, activated_at) and counts calls */
function fakeCC({ failSetPlan = 0 } = {}) {
  const calls = { setPlan: [], publish: [] }; let fails = failSetPlan;
  return { calls,
    acc: { async setPlan(e, o) { calls.setPlan.push(o); if (fails-- > 0) throw new Error("transient"); const t = NOW();
      await e.DB.prepare("UPDATE members SET plan = ?, plan_expires = ?, verified = 1, activated_at = CASE WHEN activated_at = '' THEN ? ELSE activated_at END, updated_at = ? WHERE id = ?").bind(o.plan, o.expires || "", t, t, o.memberId).run();
      return { member: await e.DB.prepare("SELECT * FROM members WHERE id = ?").bind(o.memberId).first(), rematched: 0 }; } },
    content: { async publishOverlay(e, o) { calls.publish.push(o); return { v: 1763460000000 + calls.publish.length }; } } };
}
const PM = { secret: "egy_sk_live_a1b2c3d4e5f6a7b8c9d0e1f2", pub: "egy_pk_live_Qw3rTy7uIoP9aSdF", hmac: "7F2D9E1B6C3A8F0E4D5C6B7A8F9E0D1C", ids: "4567, 8910" };
const NG = { key: "OGQ5YjI0ZTQtMjE5OS00ZmY3LWI2N2EtMmJiNzA3ZTdlNzg3OmFiY2RlZjEyMw==", outlet: "5edab6d7-5946-43f4-b8c7-06b29c272bdd", hook: "mig-hook-value-0123456789" };
const PT = { key: "SJJN9M6R2B-JHBZ6TL2NW-TKHBRBKZ2M", profile: "123456" };
async function configure(env, CC, provider, mode = "live", extra = {}) {
  const owner = await ownerOf(env, CC);
  const body = provider === "paymob" ? { enabled: 1, provider, mode, integration_ids: PM.ids, public_key: mode === "live" ? PM.pub : PM.pub.replace("_live_", "_test_"), api_key: mode === "live" ? PM.secret : PM.secret.replace("_live_", "_test_"), webhook_secret: PM.hmac }
    : provider === "ngenius" ? { enabled: 1, provider, mode, outlet_id: NG.outlet, api_key: NG.key, webhook_secret: NG.hook }
    : provider === "paytabs" ? { enabled: 1, provider, mode, profile_id: PT.profile, api_key: PT.key } : { enabled: 1, provider, mode, manual_ar: "حوّل على بنك مصر — حساب رقم 123", manual_en: "Transfer to Banque Misr — account 123" };
  const r = await admin(env, owner, "/config", { method: "PUT", body: { ...body, ...extra } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const OWN = new WeakMap();
async function ownerOf(env, CC) { if (!OWN.has(env)) OWN.set(env, mkAdm(env, "owner", await mkMember(env, { email: OWNER, company: "منصة صنع في مصر" }), CC)); return OWN.get(env); }
async function inv(env, CC, { email = "buyer@example.com", plan = "basic", member = null, test = false, source = "member" } = {}) {
  const r = await PAY.issueInvoice(env, { member_id: member ? member.id : "", email: member ? member.email : email, company: "مصنع النور للبلاستيك", plan, source: test ? "test" : source, by: "test", send: false, test }, CC);
  return r.invoice;
}
const tokenOf = i => i.pay_token;
async function checkoutOk(env, CC, i) { const r = await pub(env, CC, "/checkout", { method: "POST", body: { t: tokenOf(i) } }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; }
const lastPayment = (env, invId) => env.DB.prepare("SELECT * FROM cc_payments WHERE invoice_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(invId).first();
const getInv = (env, id) => env.DB.prepare("SELECT * FROM cc_invoices WHERE id = ?").bind(id).first();
function paymobObj(i, pay, over = {}) {
  return { id: 555001, pending: false, amount_cents: i.total_minor, success: true, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false, is_refunded: false, is_3d_secure: true,
    integration_id: 4567, has_parent_transaction: false, error_occured: false, currency: "EGP", created_at: "2026-11-18T12:00:00.000000", owner: 302,
    order: { id: Number(pay.provider_order), merchant_order_id: i.no + "-" + pay.id.slice(0, 8) }, source_data: { pan: "2346", type: "card", sub_type: "MasterCard" }, ...over };
}
/* independent HMAC (node:crypto) over the documented 20-field order */
const pmMac = (o, key = PM.hmac) => createHmac("sha512", key).update([o.amount_cents, o.created_at, o.currency, o.error_occured, o.has_parent_transaction, o.id, o.integration_id, o.is_3d_secure, o.is_auth, o.is_capture,
  o.is_refunded, o.is_standalone_payment, o.is_voided, o.order.id, o.owner, o.pending, o.source_data.pan, o.source_data.sub_type, o.source_data.type, o.success].map(v => (v == null ? "" : String(v))).join("")).digest("hex");
const paymobIntent = c => (c.url === "https://accept.paymob.com/v1/intention/" && c.method === "POST" ? jres({ id: "pi_live_7788", client_secret: "egy_csk_live_abc123", intention_order_id: 987654, status: "intended" }, 201) : null);
const ngToken = c => (c.url === "https://api-gateway.ngenius-payments.com/identity/auth/access-token" && c.method === "POST" ? jres({ access_token: "ng-access-token", expires_in: 300 }) : null);
const ngOrder = c => (c.url === `https://api-gateway.ngenius-payments.com/transactions/outlets/${NG.outlet}/orders` && c.method === "POST" ? jres({ reference: "3f5f6a7b-1111-2222-3333-444455556666", _links: { payment: { href: "https://paypage.ngenius-payments.com/?code=b2c3" } }, _embedded: { payment: [{ state: "STARTED" }] } }, 201) : null);
const ngStatus = (i, state = "PURCHASED", over = {}) => c => (c.method === "GET" && c.url === `https://api-gateway.ngenius-payments.com/transactions/outlets/${NG.outlet}/orders/3f5f6a7b-1111-2222-3333-444455556666`
  ? jres({ reference: "3f5f6a7b-1111-2222-3333-444455556666", merchantOrderReference: i.no, amount: { currencyCode: "EGP", value: i.total_minor }, _embedded: { payment: [{ _id: "urn:payment:abc", state }] }, ...over }) : null);
const ptRequest = c => (c.url === "https://secure-egypt.paytabs.com/payment/request" && c.method === "POST" ? jres({ tran_ref: "TST2232001234567", redirect_url: "https://secure-egypt.paytabs.com/payment/page/599B5A1B82DC" }) : null);
const ptQuery = (i, rs = "A", over = {}) => c => (c.url === "https://secure-egypt.paytabs.com/payment/query" && c.method === "POST" && c.json && c.json.tran_ref === "TST2232001234567"
  ? jres({ tran_ref: "TST2232001234567", cart_id: i.no + "-x", cart_currency: "EGP", cart_amount: (i.total_minor / 100).toFixed(2), payment_result: { response_status: rs, response_message: rs === "A" ? "Authorised" : "Declined" }, ...over }) : null);
/* PHP http_build_query + hash_hmac, written independently for the PayTabs return form */
const php = s => encodeURIComponent(s).replace(/[!'()*~]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, "+");
const ptSig = (fields, key = PT.key) => createHmac("sha256", key).update(Object.keys(fields).filter(k => fields[k] !== "").sort().map(k => php(k) + "=" + php(fields[k])).join("&")).digest("hex");
const logs = [];
for (const k of ["log", "warn", "error", "info"]) { const o = console[k]; console[k] = (...a) => { logs.push(a.map(String).join(" ")); if (process.env.PAY_TEST_VERBOSE) o(...a); }; }

/* =============================================================== 1. crypto.js =============================================================== */
test("crypto: seal/unseal round trip, AAD binds the slot, tampering and another CONFIG_SECRET fail, missing secret throws", async () => {
  const env = mkEnv();
  const s = await CRYPTO.seal(env, "pay.paymob.secret_key", PM.secret);
  assert.match(s, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.equal(await CRYPTO.unseal(env, "pay.paymob.secret_key", s), PM.secret);
  assert.equal(await CRYPTO.unseal(env, "pay.paymob.hmac_secret", s), null, "AAD = slot name");
  // tamper with a real byte (the middle one): swapping the last base64 characters can change only padding bits that atob()
  // drops, so AES-GCM would (rightly) accept the value in ~0.5 % of runs and the test would fail at random
  const p = s.split("."), ctb = Buffer.from(p[2], "base64url"); ctb[ctb.length >> 1] ^= 0x01;
  const flip = ctb.toString("base64url");
  assert.notEqual(flip, p[2]);
  assert.equal(await CRYPTO.unseal(env, "pay.paymob.secret_key", [p[0], p[1], flip].join(".")), null, "tampered");
  assert.equal(await CRYPTO.unseal({ ...env, CONFIG_SECRET: "d".repeat(40) }, "pay.paymob.secret_key", s), null, "other CONFIG_SECRET");
  assert.equal(await CRYPTO.unseal(env, "x", "garbage"), null);
  await assert.rejects(CRYPTO.seal({ DB: env.DB, CONFIG_SECRET: "short" }, "x", "y"), e => e.code === "config_secret_missing");
  assert.equal(CRYPTO.maskTail(PM.secret), PM.secret.slice(-4)); assert.equal(CRYPTO.maskTail("12345678"), "");
  const put = await CRYPTO.putSecret(env, "pay.paytabs.server_key", PT.key, "owner");
  assert.deepEqual([put.set, put.tail], [true, PT.key.slice(-4)]);
  assert.equal(await CRYPTO.getSecret(env, "pay.paytabs.server_key"), PT.key);
  const row = await env.DB.prepare("SELECT * FROM cc_secrets WHERE name = 'pay.paytabs.server_key'").first();
  assert.ok(!row.sealed.includes(PT.key) && row.tail === PT.key.slice(-4));
  const info = await CRYPTO.secretInfo(env, ["pay.paytabs.server_key", "pay.ngenius.api_key"]);
  assert.equal(info["pay.paytabs.server_key"].readable, true); assert.equal(info["pay.ngenius.api_key"].set, false);
  assert.equal((await CRYPTO.secretInfo({ ...env, CONFIG_SECRET: "e".repeat(40) }, ["pay.paytabs.server_key"]))["pay.paytabs.server_key"].readable, false);
  assert.equal(await CRYPTO.getSecret({ ...env, CONFIG_SECRET: "e".repeat(40) }, "pay.paytabs.server_key"), null, "unreadable → null");
  await CRYPTO.putSecret(env, "pay.paytabs.server_key", "", "owner");
  assert.equal(await CRYPTO.getSecret(env, "pay.paytabs.server_key"), "");
});

/* =============================================================== 2. config =============================================================== */
test("config: GET never returns a secret; PUT validates, encrypts, keeps blank keys, owner-only, audits, republishes the overlay", async () => {
  const env = mkEnv(), CC = fakeCC(), m = mockFetch();
  try {
    const owner = await ownerOf(env, CC);
    let r = await admin(env, owner, "/config");
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.enabled, r.data.provider, r.data.mode, r.data.currency, r.data.ready], [false, "", "test", "EGP", false]);
    assert.deepEqual(r.data.providers.map(p => p.key), ["ngenius", "paymob", "paytabs", "manual"], "only implemented gateways");
    assert.equal(r.data.webhooks.paymob, SITE + "/api/pay/webhook/paymob"); assert.equal(r.data.webhooks.ngenius_header, "X-MIG-Webhook");
    // not allowed
    assert.equal((await admin(env, owner, "/config", { method: "PUT", body: { provider: "moyasar" } })).data.code, "invalid_provider");
    assert.equal((await admin(env, mkAdm(env, "admin", owner.member, CC), "/config", { method: "PUT", body: { provider: "manual" } })).data.code, "owner_only");
    assert.equal((await admin(env, mkAdm(env, "editor", owner.member, CC), "/config")).data.code, "forbidden");
    r = await admin(env, owner, "/config", { method: "PUT", body: { provider: "paymob", mode: "live", public_key: "pk_wrong", host: "evil.example.com", success_url: "https://evil.example.com/x", integration_ids: "12,abc" } });
    assert.equal(r.status, 422); assert.deepEqual(r.data.errors.map(e => e.field).sort(), ["host", "integration_ids", "public_key", "success_url"]);
    assert.equal((await admin(env, owner, "/config", { method: "PUT", body: { provider: "paytabs", card_number: "4111111111111111" } })).data.code, "card_data_refused");
    // a key without CONFIG_SECRET → 503, nothing stored
    r = await admin({ ...env, CONFIG_SECRET: "" }, owner, "/config", { method: "PUT", body: { provider: "paymob", api_key: PM.secret } });
    assert.equal(r.status, 503); assert.equal(r.data.code, "config_secret_missing");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_secrets").first("n"), 0);
    // full Paymob config
    const saved = await configure(env, CC, "paymob");
    assert.deepEqual([saved.ok, saved.ready, saved.missing.length], [true, true, 0]);
    assert.equal(CC.calls.publish.length, 1, "overlay republished"); assert.ok(CC.calls.publish[0].CC === CC, "with CC so the overlay sees payReady");
    r = await admin(env, owner, "/config");
    const json = JSON.stringify(r.data);
    for (const s of [PM.secret, PM.hmac]) assert.ok(!json.includes(s), "secret never returned");
    assert.deepEqual(Object.keys(r.data.secrets["pay.paymob.secret_key"]).sort(), ["readable", "set", "set_at", "tail"]);
    assert.deepEqual([r.data.secrets["pay.paymob.secret_key"].tail, r.data.secrets["pay.paymob.secret_key"].readable], [PM.secret.slice(-4), true]);
    assert.equal(r.data.fields.integration_ids, "4567,8910"); assert.equal(r.data.fields.merchant_id, "4567,8910", "live form's Merchant box = Paymob integration IDs");
    // blank key = keep; mode/key mismatch → not ready
    r = await admin(env, owner, "/config", { method: "PUT", body: { mode: "test", api_key: "", webhook_secret: "" } });
    assert.equal(r.data.ready, false); assert.ok(r.data.missing.includes("key_mode_mismatch") && r.data.missing.includes("mode_live"));
    assert.equal(await CRYPTO.getSecret(env, "pay.paymob.secret_key"), PM.secret, "kept");
    // audit: secrets never in the row
    const a = await env.DB.prepare("SELECT * FROM cc_audit WHERE action = 'pay.config' ORDER BY id").all();
    assert.ok(a.results.length >= 2);
    for (const row of a.results) for (const s of [PM.secret, PM.hmac]) assert.ok(!row.after_json.includes(s) && !row.before_json.includes(s));
    assert.match(a.results[0].after_json, /changed_slots/);
    // unreadable after a CONFIG_SECRET change → asks to re-enter
    r = await admin({ ...env, CONFIG_SECRET: "z".repeat(40) }, owner, "/config");
    assert.equal(r.data.secrets["pay.paymob.secret_key"].readable, false);
    // switching provider keeps the other provider's fields
    await admin(env, owner, "/config", { method: "PUT", body: { provider: "ngenius", outlet_id: NG.outlet, mode: "live" } });
    r = await admin(env, owner, "/config");
    assert.equal(r.data.provider_fields.paymob.integration_ids, "4567,8910");
    assert.ok(r.data.missing.includes("api_key"));
    // audit failure → nothing changes
    const before = await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'pay.provider'").first("v");
    r = await admin(env, mkAdm(env, "owner", owner.member, CC, { failAudit: true }), "/config", { method: "PUT", body: { provider: "paytabs" } });
    assert.equal(r.status, 500); assert.equal(r.data.code, "audit_failed");
    assert.equal(await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'pay.provider'").first("v"), before);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 3. invoices & signup =============================================================== */
test("signup → automatic invoice INV-<yyyy>-<6>, VAT 14 % in piasters, idempotent, linked by mailbox, e-mail + timeline; no price → no invoice + note", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails));
  try {
    const member = await mkMember(env, { email: "factory@example.com" });
    const req = new Request(SITE + "/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.9" },
      body: JSON.stringify({ kind: "signup", target_type: "plan", target_id: "basic", target_name: "الباقة الأساسية", name: "أحمد علي", company: "مصنع النور", email: "Factory@Example.com", phone: "01001234567", message: "بلاستيك",
        payload: { plan: "basic", company: "مصنع النور <script>", manager: "أحمد" } }) });
    const res = await handleInquiries(req, env, ctx); await drain();
    assert.equal(res.status, 201); const { ref } = await res.json();
    const a = await PAY.onInquiryCreated(env, ref, CC);
    const year = cairoDay().slice(0, 4);
    assert.match(a.invoice.no, new RegExp(`^INV-${year}-\\d{6}$`));
    assert.deepEqual([a.invoice.net_minor, a.invoice.vat_bp, a.invoice.vat_minor, a.invoice.total_minor, a.invoice.currency, a.invoice.status, a.invoice.source, a.invoice.period_days], [1000000, 1400, 140000, 1140000, "EGP", "open", "signup", 365]);
    // review F6: an anonymous form with an existing member's address binds nothing and changes no status …
    assert.equal(a.invoice.member_id, "", "not bound without proof of the mailbox");
    assert.equal(a.invoice.company, "مصنع النور ‹script›", "neutralised");
    assert.match(a.invoice.pay_token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(await env.DB.prepare("SELECT * FROM cc_member_meta WHERE member_id = ?").bind(member.id).first(), null, "no pending flip by an anonymous form");
    // … the account holder's own sign-in (a confirmed mailbox) attaches it (linkLoose) and the account becomes pending
    assert.equal((await PAY.memberInvoices(env, member)).items[0].no, a.invoice.no);
    assert.equal(await env.DB.prepare("SELECT member_id FROM cc_invoices WHERE no = ?").bind(a.invoice.no).first("member_id"), member.id, "linked after the mailbox was proven");
    const meta = await env.DB.prepare("SELECT * FROM cc_member_meta WHERE member_id = ?").bind(member.id).first();
    assert.deepEqual([meta.status, meta.requested_plan], ["pending", "basic"]);
    const im = mails.filter(x => x.id.startsWith("inv-"));
    assert.equal(im.length, 1); assert.match(im[0].subject, /INV-/); assert.match(im[0].text, /11,400/); assert.match(im[0].text, /بوابة الدفع الإلكتروني لسه بتتجهّز/, "honest while not ready");
    const ev = await env.DB.prepare("SELECT * FROM inquiry_events WHERE type = 'invoice'").all();
    assert.equal(ev.results.length, 1); assert.equal(ev.results[0].buyer_visible, 1); assert.match(ev.results[0].body, new RegExp(a.invoice.no));
    // twice → one invoice, no second mail
    const b = await PAY.onInquiryCreated(env, ref, CC);
    assert.equal(b.skipped, "done");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices").first("n"), 1);
    assert.equal(mails.filter(x => x.id.startsWith("inv-")).length, 1);
    // a parallel duplicate (no timeline marker yet) is still one invoice: unique inquiry_ref, counter rolled back
    await env.DB.prepare("DELETE FROM inquiry_events WHERE type = 'invoice'").run();
    const c = await PAY.issueInvoice(env, { email: "factory@example.com", plan: "basic", source: "signup", inquiry_ref: ref, by: "system" }, CC);
    assert.equal(c.existed, true); assert.equal(c.invoice.no, a.invoice.no);
    assert.equal(await env.DB.prepare("SELECT n FROM cc_counters WHERE k = ?").bind("inv:" + year).first("n"), 1, "gap-free");
    // a plan without a price → no invoice + an internal note
    await env.DB.prepare("UPDATE cc_plans SET price_egp = 0 WHERE plan = 'premium'").run();
    const req2 = new Request(SITE + "/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.10" },
      body: JSON.stringify({ kind: "signup", target_type: "plan", target_id: "premium", name: "منى حسن", company: "شركة الأمل", email: "amal@example.org", message: "x", payload: { plan: "premium", gcc: ["SA", "AE", "QA"] } }) });
    const r2 = await handleInquiries(req2, env, ctx); await drain();
    const s2 = await PAY.onInquiryCreated(env, (await r2.json()).ref, CC);
    assert.equal(s2.skipped, "no_price");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices").first("n"), 1);
    const note = await env.DB.prepare("SELECT * FROM inquiry_events WHERE type = 'invoice' AND buyer_visible = 0").first();
    assert.match(note.body, /مالهاش سعر/);
    // test invoices: own series, never in the INV numbering
    const t1 = await inv(env, CC, { test: true });
    assert.match(t1.no, new RegExp(`^TEST-${year}-000001$`));
    const n2 = await inv(env, CC, { email: "x2@example.com" });
    assert.match(n2.no, new RegExp(`^INV-${year}-000002$`));
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 4. adapters =============================================================== */
test("Paymob: Intention API request exactly as §5.2, Unified Checkout redirect, one attempt row, HMAC callback → paid once, setPlan once", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    await configure(env, CC, "paymob");
    const buyer = await mkMember(env, { email: "buyer@example.com", plan: "visitor" });
    const i = await inv(env, CC, { member: buyer });
    const co = await checkoutOk(env, CC, i);
    assert.equal(co.redirect_url, "https://accept.paymob.com/unifiedcheckout/?publicKey=" + encodeURIComponent(PM.pub) + "&clientSecret=" + encodeURIComponent("egy_csk_live_abc123"));
    const call = m.calls.find(c => c.url === "https://accept.paymob.com/v1/intention/");
    assert.equal(call.headers.get("Authorization"), "Token " + PM.secret);
    assert.equal(call.headers.get("Content-Type"), "application/json");
    const b = call.json;
    assert.deepEqual([b.amount, b.currency, b.payment_methods], [1140000, "EGP", [4567, 8910]]);
    assert.deepEqual(b.items, [{ name: i.plan_name, amount: 1140000, description: i.no, quantity: 1 }]);
    assert.ok(b.special_reference.startsWith(i.no + "-"));
    assert.equal(b.notification_url, SITE + "/api/pay/webhook/paymob");
    assert.equal(b.redirection_url, SITE + "/api/pay/return/paymob?t=" + i.pay_token);
    assert.deepEqual([b.billing_data.email, b.billing_data.phone_number, b.billing_data.country, b.billing_data.first_name, b.billing_data.city], ["buyer@example.com", "+201001234567", "EG", "أحمد", "NA"]);
    const pay = await lastPayment(env, i.id);
    assert.deepEqual([pay.provider, pay.mode, pay.status, pay.provider_ref, pay.provider_order, pay.amount_minor], ["paymob", "live", "redirected", "pi_live_7788", "987654", 1140000]);
    // a wrong HMAC → 401, nothing changes
    const obj = paymobObj(i, pay);
    let r = await pub(env, CC, "/webhook/paymob?hmac=" + "0".repeat(128), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal(r.status, 401); assert.equal((await getInv(env, i.id)).status, "open");
    assert.equal(CC.calls.setPlan.length, 0);
    // valid → paid
    r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal(r.status, 200); assert.deepEqual(r.data, { ok: true });
    const paid = await getInv(env, i.id);
    assert.deepEqual([paid.status, paid.paid_via, paid.provider, paid.provider_ref], ["paid", "webhook", "paymob", "pi_live_7788"]);
    assert.equal((await lastPayment(env, i.id)).status, "paid");
    assert.equal(CC.calls.setPlan.length, 1);
    const sp = CC.calls.setPlan[0];
    assert.deepEqual([sp.memberId, sp.plan, sp.reason, sp.invoiceNo, sp.by.actor_id], [buyer.id, "basic", "payment", i.no, "provider:paymob"]);
    const days = (Date.parse(sp.expires) - Date.now()) / 86400000;
    assert.ok(days > 364 && days < 366.1, "≈ +365 days, end of the Cairo day");
    assert.equal(cairoDay(Date.parse(sp.expires)), cairoDay(Date.now() + 365 * 86400000));
    assert.equal(mails.filter(x => x.id === "paid-" + i.id).length, 1, "receipt once");
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'payment'").bind(buyer.id).first("n")), 1, "bell");
    assert.match((await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = ?").bind("activate:" + i.id).first("result")), /^activated:/);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_audit WHERE action = 'pay.paid' AND target_id = ?").bind(i.id).first("x"));
    // the same callback again, and the browser return with the same fields → no second activation
    r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal(r.status, 200);
    const q = new URLSearchParams({ t: i.pay_token, amount_cents: String(obj.amount_cents), created_at: obj.created_at, currency: "EGP", error_occured: "false", has_parent_transaction: "false", id: String(obj.id), integration_id: "4567",
      is_3d_secure: "true", is_auth: "false", is_capture: "false", is_refunded: "false", is_standalone_payment: "true", is_voided: "false", order: String(obj.order.id), owner: "302", pending: "false",
      "source_data.pan": "2346", "source_data.sub_type": "MasterCard", "source_data.type": "card", success: "true", merchant_order_id: obj.order.merchant_order_id });
    q.set("hmac", pmMac(obj));
    const ret = await PAY.handlePay(rq("/api/pay/return/paymob?" + q.toString()), env, ctx, CC);
    assert.equal(ret.status, 303); assert.equal(ret.headers.get("Location"), SITE + "/pay.html#inv=" + i.pay_token + "&r=1");
    assert.equal(CC.calls.setPlan.length, 1, "ONE activation");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_pay_events WHERE provider = 'paymob' AND event_key = ?").bind("paymob:555001:paid").first("n"), 1);
    assert.equal(mails.filter(x => x.id === "paid-" + i.id).length, 1);
    // public view after payment
    r = await pub(env, CC, "/invoice?t=" + i.pay_token);
    assert.deepEqual([r.data.invoice.status, r.data.activation.status, r.data.gateway.ready], ["paid", "done", false]);
    assert.equal(r.data.activation.plan_until, cairoDay(Date.parse(sp.expires)));
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("Paymob: browser return alone activates (webhook late); amount / currency mismatch → rejected, no activation, team told; failed → e-mail once", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    await configure(env, CC, "paymob");
    const i = await inv(env, CC, { email: "late@example.com" });
    await checkoutOk(env, CC, i);
    const pay = await lastPayment(env, i.id), obj = paymobObj(i, pay, { id: 777 });
    const flat = { amount_cents: String(obj.amount_cents), created_at: obj.created_at, currency: "EGP", error_occured: "false", has_parent_transaction: "false", id: "777", integration_id: "4567", is_3d_secure: "true", is_auth: "false", is_capture: "false",
      is_refunded: "false", is_standalone_payment: "true", is_voided: "false", order: String(obj.order.id), owner: "302", pending: "false", "source_data.pan": "2346", "source_data.sub_type": "MasterCard", "source_data.type": "card", success: "true" };
    // forged return (wrong hmac) does nothing
    let q = new URLSearchParams({ t: i.pay_token, ...flat, hmac: "ab".repeat(64) });
    await PAY.handlePay(rq("/api/pay/return/paymob?" + q), env, ctx, CC);
    assert.equal((await getInv(env, i.id)).status, "open");
    q = new URLSearchParams({ t: i.pay_token, ...flat, hmac: pmMac(obj) });
    await PAY.handlePay(rq("/api/pay/return/paymob?" + q), env, ctx, CC);
    const p = await getInv(env, i.id);
    assert.deepEqual([p.status, p.paid_via], ["paid", "return"]);
    assert.equal(CC.calls.setPlan.length, 1);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM members WHERE lower(email) = 'late@example.com' AND verified = 1 AND email_verified_at = ''").first("x"), "member created by mailbox at payment");
    // mismatch
    const j = await inv(env, CC, { email: "cheat@example.com" });
    await checkoutOk(env, CC, j);
    const pj = await lastPayment(env, j.id), o2 = paymobObj(j, pj, { id: 888, amount_cents: 100 });
    let r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(o2), { method: "POST", body: { type: "TRANSACTION", obj: o2 } });
    assert.equal(r.status, 200);
    assert.equal((await getInv(env, j.id)).status, "open"); assert.equal(CC.calls.setPlan.length, 1);
    assert.equal(await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = 'paymob:888:paid'").first("result"), "rejected:amount");
    assert.ok(mails.some(x => x.id.startsWith("teamneed-pay-" + j.id + "-amount")), "team alert");
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_audit WHERE action = 'pay.mismatch'").first("x"));
    const o3 = paymobObj(j, pj, { id: 889, currency: "USD" });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(o3), { method: "POST", body: { type: "TRANSACTION", obj: o3 } });
    assert.equal(await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = 'paymob:889:paid'").first("result"), "rejected:amount");
    // declined → failed, one e-mail, invoice open
    const o4 = paymobObj(j, pj, { id: 890, success: false });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(o4), { method: "POST", body: { type: "TRANSACTION", obj: o4 } });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(o4), { method: "POST", body: { type: "TRANSACTION", obj: o4 } });
    assert.equal((await lastPayment(env, j.id)).status, "failed");
    assert.equal(mails.filter(x => x.id.startsWith("payfail-" + j.id)).length, 1);
    r = await pub(env, CC, "/invoice?t=" + j.pay_token);
    assert.equal(r.data.last_attempt.status, "failed");
    // TOKEN callbacks and unknown orders: 200, nothing
    assert.equal((await pub(env, CC, "/webhook/paymob?hmac=x", { method: "POST", body: { type: "TOKEN", obj: { token: "t" } } })).status, 200);
    const o5 = paymobObj(j, { provider_order: "111", id: "zzzzzzzzzzzzzzzz" }, { id: 891 });
    assert.equal((await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(o5), { method: "POST", body: { type: "TRANSACTION", obj: o5 } })).status, 200);
    assert.equal((await pub(env, CC, "/webhook/paymob", { method: "POST", body: "{not json" })).status, 400);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("N-Genius: token + PURCHASE order exactly as §5.2; state ONLY from the server-side re-query; header check; return + cancel", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [];
  let state = "STARTED";
  const i0 = { no: "", total_minor: 0 };
  const m = mockFetch(resend(mails), ngToken, ngOrder, c => ngStatus(i0, state)(c));
  try {
    await configure(env, CC, "ngenius");
    const i = await inv(env, CC, { email: "ng@example.com" }); Object.assign(i0, i);
    const co = await checkoutOk(env, CC, i);
    assert.equal(co.redirect_url, "https://paypage.ngenius-payments.com/?code=b2c3");
    const tok = m.calls.find(c => c.url.endsWith("/identity/auth/access-token"));
    assert.equal(tok.headers.get("Authorization"), "Basic " + NG.key);
    assert.equal(tok.headers.get("Content-Type"), "application/vnd.ni-identity.v1+json"); assert.equal(tok.headers.get("Accept"), "application/vnd.ni-identity.v1+json");
    const ord = m.calls.find(c => c.url.endsWith("/orders") && c.method === "POST");
    assert.equal(ord.headers.get("Authorization"), "Bearer ng-access-token");
    assert.equal(ord.headers.get("Content-Type"), "application/vnd.ni-payment.v2+json"); assert.equal(ord.headers.get("Accept"), "application/vnd.ni-payment.v2+json");
    assert.deepEqual(ord.json, { action: "PURCHASE", amount: { currencyCode: "EGP", value: 1140000 }, emailAddress: "ng@example.com", merchantOrderReference: i.no, language: "ar",
      merchantAttributes: { redirectUrl: SITE + "/api/pay/return/ngenius?t=" + i.pay_token, cancelUrl: SITE + "/api/pay/return/ngenius?t=" + i.pay_token + "&c=1", skipConfirmationPage: true } });
    const pay = await lastPayment(env, i.id);
    assert.equal(pay.provider_ref, "3f5f6a7b-1111-2222-3333-444455556666");
    // webhook with the wrong header value → 401
    const hook = { eventName: "PURCHASED", order: { reference: pay.provider_ref, _embedded: { payment: [{ state: "PURCHASED" }] } } };
    let r = await pub(env, CC, "/webhook/ngenius", { method: "POST", body: hook, headers: { "X-MIG-Webhook": "wrong-value-wrong-value" } });
    assert.equal(r.status, 401);
    // the payload says PURCHASED but the re-query says STARTED → pending, no activation
    r = await pub(env, CC, "/webhook/ngenius", { method: "POST", body: hook, headers: { "X-MIG-Webhook": NG.hook } });
    assert.equal(r.status, 200); assert.equal((await getInv(env, i.id)).status, "open"); assert.equal((await lastPayment(env, i.id)).status, "pending");
    assert.equal(CC.calls.setPlan.length, 0);
    assert.equal(m.calls.filter(c => c.url.endsWith("/identity/auth/access-token")).length, 1, "token cached per isolate");
    // the browser return → re-query → PURCHASED → paid (a provider that naively appends "?ref=" to our "?t=" URL is understood)
    state = "PURCHASED";
    const ret = await PAY.handlePay(rq("/api/pay/return/ngenius?t=" + i.pay_token + "?ref=" + pay.provider_ref), env, ctx, CC);
    assert.equal(ret.headers.get("Location"), SITE + "/pay.html#inv=" + i.pay_token + "&r=1");
    assert.equal(ret.status, 303);
    assert.deepEqual([(await getInv(env, i.id)).status, (await getInv(env, i.id)).paid_via], ["paid", "return"]);
    assert.equal(CC.calls.setPlan.length, 1);
    // the webhook after it → duplicate, still one activation
    await pub(env, CC, "/webhook/ngenius", { method: "POST", body: hook, headers: { "X-MIG-Webhook": NG.hook } });
    assert.equal(CC.calls.setPlan.length, 1);
    // unknown order reference: no outbound call at all
    const n = m.calls.length;
    assert.equal((await pub(env, CC, "/webhook/ngenius", { method: "POST", body: { order: { reference: "00000000-0000-0000-0000-000000000000" } }, headers: { "X-MIG-Webhook": NG.hook } })).status, 200);
    assert.equal(m.calls.length, n);
    // cancel on the hosted page
    state = "STARTED";
    const j = await inv(env, CC, { email: "ng2@example.com" }); Object.assign(i0, j);
    await checkoutOk(env, CC, j);
    await PAY.handlePay(rq("/api/pay/return/ngenius?t=" + j.pay_token + "&c=1"), env, ctx, CC);
    assert.equal((await lastPayment(env, j.id)).status, "cancelled");
    assert.equal((await getInv(env, j.id)).status, "open");
    // amount mismatch in the query
    const k = await inv(env, CC, { email: "ng3@example.com" }); Object.assign(i0, k, { total_minor: 5 });
    state = "PURCHASED";
    await checkoutOk(env, CC, k);
    await PAY.handlePay(rq("/api/pay/return/ngenius?t=" + k.pay_token), env, ctx, CC);
    assert.equal((await getInv(env, k.id)).status, "open");
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("PayTabs: payment/request exactly as §5.2; callback Signature over the raw body; return-form signature; query is authoritative", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [];
  let rs = "A"; const cur = { i: null };
  const m = mockFetch(resend(mails), ptRequest, c => (cur.i ? ptQuery(cur.i, rs)(c) : null));
  try {
    await configure(env, CC, "paytabs");
    const i = await inv(env, CC, { email: "pt@example.com" }); cur.i = i;
    const co = await checkoutOk(env, CC, i);
    assert.equal(co.redirect_url, "https://secure-egypt.paytabs.com/payment/page/599B5A1B82DC");
    const call = m.calls.find(c => c.url === "https://secure-egypt.paytabs.com/payment/request");
    assert.equal(call.headers.get("authorization"), PT.key);
    const b = call.json;
    assert.deepEqual([b.profile_id, b.tran_type, b.tran_class, b.cart_currency, b.cart_amount, b.paypage_lang, b.hide_shipping], [123456, "sale", "ecom", "EGP", 11400, "ar", true]);
    assert.ok(b.cart_id.startsWith(i.no + "-"));
    assert.equal(b.callback, SITE + "/api/pay/webhook/paytabs"); assert.equal(b.return, SITE + "/api/pay/return/paytabs?t=" + i.pay_token);
    assert.deepEqual([b.customer_details.email, b.customer_details.country, b.customer_details.zip], ["pt@example.com", "EG", "00000"]);
    // IPN: bad signature → 401; good → query → paid
    const raw = JSON.stringify({ tran_ref: "TST2232001234567", cart_id: b.cart_id, payment_result: { response_status: "A" } });
    let r = await pub(env, CC, "/webhook/paytabs", { method: "POST", body: raw, headers: { "Content-Type": "application/json", Signature: "deadbeef" } });
    assert.equal(r.status, 401); assert.equal((await getInv(env, i.id)).status, "open");
    rs = "D"; // the IPN says A, the query says declined → failed
    r = await pub(env, CC, "/webhook/paytabs", { method: "POST", body: raw, headers: { "Content-Type": "application/json", Signature: createHmac("sha256", PT.key).update(raw).digest("hex") } });
    assert.equal(r.status, 200); assert.equal((await getInv(env, i.id)).status, "open"); assert.equal((await lastPayment(env, i.id)).status, "failed");
    // the browser return form (POST) with a valid signature → query → A → paid
    rs = "A";
    const form = { tranRef: "TST2232001234567", respStatus: "A", respCode: "G96376", respMessage: "Authorised", cartId: b.cart_id, customerEmail: "pt@example.com", acquirerRRN: "", acquirerMessage: "", token: "" };
    const bad = new URLSearchParams({ ...form, signature: "00" }).toString();
    await PAY.handlePay(rq("/api/pay/return/paytabs?t=" + i.pay_token, { method: "POST", body: bad, headers: { "Content-Type": "application/x-www-form-urlencoded" } }), env, ctx, CC);
    assert.equal((await getInv(env, i.id)).status, "open", "forged return does nothing");
    const good = new URLSearchParams({ ...form, signature: ptSig(form) }).toString();
    const ret = await PAY.handlePay(rq("/api/pay/return/paytabs?t=" + i.pay_token, { method: "POST", body: good, headers: { "Content-Type": "application/x-www-form-urlencoded" } }), env, ctx, CC);
    assert.equal(ret.status, 303);
    assert.deepEqual([(await getInv(env, i.id)).status, (await getInv(env, i.id)).paid_via], ["paid", "return"]);
    assert.equal(CC.calls.setPlan.length, 1);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("manual transfer: instructions on the public page, no checkout, admin records it (typed confirm, reference) → activation + receipt", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails));
  try {
    const saved = await configure(env, CC, "manual", "live", { manual_ar: "حوّل على بنك مصر <b>IBAN</b> EG12", manual_en: "Banque Misr IBAN EG12" });
    assert.deepEqual([saved.ready, saved.manual, saved.state], [false, true, "manual"]);
    const member = await mkMember(env, { email: "manual@example.com", plan: "basic", expires: new Date(Date.now() + 10 * 86400000).toISOString() });
    const i = await inv(env, CC, { member });
    let r = await pub(env, CC, "/invoice?t=" + i.pay_token);
    assert.deepEqual([r.data.gateway.ready, r.data.manual.enabled], [false, true]);
    assert.equal(r.data.manual.ar, "حوّل على بنك مصر ‹b›IBAN‹/b› EG12", "neutralised public text");
    assert.equal(r.data.email_masked, "m•••@example.com");
    r = await pub(env, CC, "/checkout", { method: "POST", body: { t: i.pay_token } });
    assert.deepEqual([r.status, r.data.code, r.data.manual], [503, "gateway_not_ready", true]);
    const owner = await ownerOf(env, CC), support = mkAdm(env, "support", owner.member, CC), adm = mkAdm(env, "admin", owner.member, CC);
    r = await admin(env, support, "/invoices/" + i.no + "/mark-paid", { method: "POST", body: { manual_ref: "FT123", confirm: i.no } });
    assert.deepEqual([r.status, r.data.need], [403, "pay.mark_paid"]);
    r = await admin(env, adm, "/invoices/" + i.no + "/mark-paid", { method: "POST", body: { manual_ref: "FT123", confirm: "INV-wrong" } });
    assert.equal(r.data.code, "confirm_mismatch");
    r = await admin(env, adm, "/invoices/" + i.no + "/mark-paid", { method: "POST", body: { manual_ref: "", confirm: i.no } });
    assert.equal(r.status, 422);
    r = await admin(env, adm, "/invoices/" + i.no + "/mark-paid", { method: "POST", body: { manual_ref: "InstaPay 99881", paid_on: cairoDay(), note: "وصل", confirm: i.no } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.activation.activated, true);
    const p = await getInv(env, i.id);
    assert.deepEqual([p.status, p.paid_via, p.provider, p.manual_ref], ["paid", "manual", "manual", "InstaPay 99881"]);
    // same plan in force with 10 days left → extended from the current expiry
    const sp = CC.calls.setPlan[0];
    assert.equal(cairoDay(Date.parse(sp.expires)), cairoDay(Date.parse(member.plan_expires) + 365 * 86400000));
    assert.equal(sp.by.actor_id, owner.member.id);
    assert.equal(mails.filter(x => x.id === "paid-" + i.id).length, 1);
    assert.ok(adm.audits.some(a => a.action === "pay.mark_paid"));
    assert.equal(await env.DB.prepare("SELECT status FROM cc_payments WHERE invoice_id = ? AND provider = 'manual'").bind(i.id).first("status"), "paid");
    r = await admin(env, adm, "/invoices/" + i.no + "/mark-paid", { method: "POST", body: { manual_ref: "again", confirm: i.no } });
    assert.equal(r.data.code, "state");
    // refund recorded (no API call, plan unchanged)
    r = await admin(env, adm, "/invoices/" + i.no + "/refund", { method: "POST", body: { reason: "طلب العميل", reference: "RF-1", confirm: i.no } });
    assert.deepEqual([r.status, r.data.plan_changed], [200, false]);
    assert.equal((await getInv(env, i.id)).status, "refunded");
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 5. readiness, sandbox, limits, card data =============================================================== */
test("readiness: Sandbox is never public; only the owner's test invoice pays in Sandbox and never activates; limits; no card fields", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    await configure(env, CC, "paymob", "test");
    assert.deepEqual(await PAY.payReady(env, { fresh: true }), { ready: false, provider: "", manual: false });
    const i = await inv(env, CC, { email: "real@example.com" });
    let r = await pub(env, CC, "/invoice?t=" + i.pay_token);
    assert.equal(r.data.gateway.ready, false, "test mode is never public");
    assert.equal((await pub(env, CC, "/checkout", { method: "POST", body: { t: i.pay_token } })).data.code, "gateway_not_ready");
    const owner = await ownerOf(env, CC);
    r = await admin(env, mkAdm(env, "admin", owner.member, CC), "/test-invoice", { method: "POST", body: { plan: "basic" } });
    assert.equal(r.data.code, "owner_only");
    r = await admin(env, owner, "/test-invoice", { method: "POST", body: { plan: "basic" } });
    assert.equal(r.status, 201); const t = r.data.invoice;
    assert.deepEqual([t.test, t.email, t.source], [true, OWNER, "test"]);
    const ti = await getInv(env, t.id);
    r = await pub(env, CC, "/invoice?t=" + ti.pay_token);
    assert.deepEqual([r.data.gateway.ready, r.data.gateway.provider_label, r.data.invoice.test], [true, "Paymob — Sandbox", true]);
    await checkoutOk(env, CC, ti);
    const pay = await lastPayment(env, ti.id);
    assert.equal(pay.mode, "test");
    const obj = paymobObj(ti, pay, { id: 4242 });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal((await getInv(env, ti.id)).status, "paid");
    assert.equal(CC.calls.setPlan.length, 0, "a test invoice never activates a plan");
    r = await admin(env, owner, "/config");
    assert.equal(r.data.sandbox_verified.paymob, true, "«لم يُجرَّب بمفاتيح حقيقية بعد» goes away");
    // live mode: the test invoice can no longer be paid
    await admin(env, owner, "/config", { method: "PUT", body: { mode: "live", api_key: PM.secret, public_key: PM.pub } });
    const t2 = (await admin(env, owner, "/test-invoice", { method: "POST", body: { plan: "premium" } })).data.invoice;
    assert.equal((await pub(env, CC, "/checkout", { method: "POST", body: { t: (await getInv(env, t2.id)).pay_token } })).data.code, "gateway_not_ready");
    assert.deepEqual(await PAY.payReady(env, { fresh: true }), { ready: true, provider: "paymob", manual: false });
    // card fields → 400, nothing stored
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_payments").first("n");
    r = await pub(env, CC, "/checkout", { method: "POST", body: { t: i.pay_token, card_number: "4111111111111111", cvv: "123" } });
    assert.deepEqual([r.status, r.data.code], [400, "card_data_refused"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_payments").first("n"), n);
    assert.equal((await admin(env, owner, "/invoices", { method: "POST", body: { email: "a@example.com", plan: "basic", cvc: "1" } })).data.code, "card_data_refused");
    // checkout: 10 per hour per invoice
    for (let k = 0; k < 10; k++) assert.equal((await pub(env, CC, "/checkout", { method: "POST", body: { t: i.pay_token } })).status, 200);
    r = await pub(env, CC, "/checkout", { method: "POST", body: { t: i.pay_token } });
    assert.deepEqual([r.status, r.data.code], [429, "rate_limited"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_payments WHERE invoice_id = ? AND status = 'redirected'").bind(i.id).first("n"), 1, "older attempts cancelled");
    // unknown token
    assert.equal((await pub(env, CC, "/invoice?t=" + "A".repeat(32))).status, 404);
    assert.equal((await pub(env, CC, "/invoice?t=short")).status, 404);
    // CORS echo: site origin only
    let pre = await PAY.handlePay(rq("/api/pay/checkout", { method: "OPTIONS", headers: { Origin: SITE } }), env, ctx, CC);
    assert.equal(pre.headers.get("Access-Control-Allow-Origin"), SITE);
    pre = await PAY.handlePay(rq("/api/pay/checkout", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env, ctx, CC);
    assert.equal(pre.headers.get("Access-Control-Allow-Origin"), null);
    r = await pub(env, CC, "/health");
    assert.deepEqual(r.data, { ok: true, ready: true, provider: "paymob", mode: "live", manual: false });
    assert.equal(r.headers.get("Cache-Control"), "no-store"); assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 6. cron =============================================================== */
test("cron: payment links once when the gateway goes live; pending payments re-queried after 10 min; 48 h → expired; signup backstop", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [];
  let state = "PURCHASED"; const cur = { no: "", total_minor: 0 };
  const m = mockFetch(resend(mails), ngToken, ngOrder, c => ngStatus(cur, state)(c));
  try {
    const i = await inv(env, CC, { email: "early@example.com" });
    await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(mails.filter(x => x.id.startsWith("paylink-")).length, 0, "not ready → nothing");
    await configure(env, CC, "ngenius");
    await PAY.paymentsCron(env, Date.now(), CC);
    await PAY.paymentsCron(env, Date.now(), CC);
    const links = mails.filter(x => x.id === "paylink-" + i.id);
    assert.equal(links.length, 1, "once"); assert.match(links[0].text, /pay\.html#inv=/);
    assert.notEqual((await getInv(env, i.id)).link_mail_at, "");
    // re-query: a redirected payment older than 10 min
    Object.assign(cur, i);
    await checkoutOk(env, CC, i);
    const p = await lastPayment(env, i.id);
    await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal((await getInv(env, i.id)).status, "open", "younger than 10 min: not yet");
    await env.DB.prepare("UPDATE cc_payments SET updated_at = ?, created_at = ? WHERE id = ?").bind(new Date(Date.now() - 11 * 60000).toISOString(), new Date(Date.now() - 11 * 60000).toISOString(), p.id).run();
    const out = await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(out.requery.paid, 1);
    assert.deepEqual([(await getInv(env, i.id)).status, (await getInv(env, i.id)).paid_via], ["paid", "query"]);
    assert.equal(CC.calls.setPlan.length, 1);
    // 48 h → expired
    const j = await inv(env, CC, { email: "slow@example.com" }); Object.assign(cur, j); state = "STARTED";
    await checkoutOk(env, CC, j);
    await env.DB.prepare("UPDATE cc_payments SET created_at = ?, updated_at = ? WHERE invoice_id = ?").bind(new Date(Date.now() - 49 * 3600000).toISOString(), new Date(Date.now() - 49 * 3600000).toISOString(), j.id).run();
    await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal((await lastPayment(env, j.id)).status, "expired");
    // signup backstop: a signup whose immediate call was lost
    const req = new Request(SITE + "/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.33" },
      body: JSON.stringify({ kind: "signup", target_type: "plan", target_id: "profile", name: "سامي كمال", company: "ورشة سامي", email: "sami@example.net", message: "x", payload: { plan: "profile" } }) });
    const res = await handleInquiries(req, env, ctx); await drain();
    const { ref } = await res.json();
    await env.DB.prepare("UPDATE inquiries SET created_at = ? WHERE ref = ?").bind(new Date(Date.now() - 5 * 60000).toISOString(), ref).run();
    const o2 = await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(o2.signups.issued, 1);
    const si = await env.DB.prepare("SELECT * FROM cc_invoices WHERE inquiry_ref = ?").bind(ref).first();
    assert.deepEqual([si.plan, si.total_minor, si.source], ["profile", 456000, "signup"]);
    assert.equal((await PAY.paymentsCron(env, Date.now(), CC)).signups.checked, 0);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("cron: renewal invoice + reminder at 30 days and a reminder at 7 days, each exactly once; never for test invoices", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails));
  try {
    const day0 = cairoDay(Date.now() + 86400000), t0 = cairoToUtc(day0, "10:00"); // a fixed 10:00 Cairo clock
    const member = await mkMember(env, { email: "renew@example.com", plan: "premium", expires: new Date(t0 + 25 * 86400000).toISOString() });
    const early = await PAY.paymentsCron(env, cairoToUtc(day0, "06:00"), CC);
    assert.equal(early.renewals.skipped, "time");
    let o = await PAY.paymentsCron(env, t0, CC);
    assert.deepEqual([o.renewals.issued, o.renewals.reminded], [1, 1]);
    const ri = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ? AND source = 'renewal'").bind(member.id).first();
    assert.deepEqual([ri.plan, ri.total_minor, ri.status, ri.due_at], ["premium", 2850000, "open", member.plan_expires]);
    assert.equal(mails.filter(x => x.id === `renew-${ri.id}-30`).length, 1);
    assert.match(mails.find(x => x.id === `renew-${ri.id}-30`).text, /فاضل 25 يوم/);
    assert.equal((await PAY.paymentsCron(env, t0 + 3600000, CC)).renewals.skipped, "done_today");
    o = await PAY.paymentsCron(env, t0 + 86400000, CC);
    assert.deepEqual([o.renewals.issued, o.renewals.reminded], [0, 0]);
    o = await PAY.paymentsCron(env, t0 + 19 * 86400000, CC); // 6 days left
    assert.deepEqual([o.renewals.issued, o.renewals.reminded], [0, 1]);
    assert.equal(mails.filter(x => x.id === `renew-${ri.id}-7`).length, 1);
    o = await PAY.paymentsCron(env, t0 + 20 * 86400000, CC);
    assert.equal(o.renewals.reminded, 0, "exactly once");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices WHERE member_id = ?").bind(member.id).first("n"), 1);
    // the owner's test invoice never creates renewals; a plan without a price never invoices
    await env.DB.prepare("UPDATE cc_plans SET sellable = 0 WHERE plan = 'basic'").run();
    await mkMember(env, { email: "basic@example.com", plan: "basic", expires: new Date(t0 + 40 * 86400000 + 5 * 86400000).toISOString() });
    const b2 = await mkMember(env, { email: "basic2@example.com", plan: "basic", expires: new Date(t0 + 21 * 86400000 + 5 * 86400000).toISOString() });
    o = await PAY.paymentsCron(env, t0 + 21 * 86400000, CC);
    assert.equal(o.renewals.issued, 0);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices WHERE member_id = ?").bind(b2.id).first("n"), 0);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("activation ledger: a failed setPlan is retried by the cron (same absolute expiry, receipt once); a crash before the ledger row is recovered", async () => {
  const env = mkEnv(), CC = fakeCC({ failSetPlan: 1 }), mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    await configure(env, CC, "paymob");
    const i = await inv(env, CC, { email: "retry@example.com" });
    await checkoutOk(env, CC, i);
    const pay = await lastPayment(env, i.id), obj = paymobObj(i, pay, { id: 9001 });
    const r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal(r.status, 200);
    assert.equal((await getInv(env, i.id)).status, "paid", "the payment stands");
    const l1 = await env.DB.prepare("SELECT * FROM cc_pay_events WHERE event_key = ?").bind("activate:" + i.id).first();
    assert.match(l1.result, /^activating:/);
    assert.equal(mails.filter(x => x.id === "paid-" + i.id).length, 0);
    await PAY.paymentsCron(env, Date.now(), CC); // younger than 2 min: untouched
    assert.equal(CC.calls.setPlan.length, 1);
    const out = await PAY.paymentsCron(env, Date.now() + 3 * 60000, CC);
    assert.equal(out.activations.retried, 1);
    assert.equal(CC.calls.setPlan.length, 2);
    assert.equal(CC.calls.setPlan[1].expires, CC.calls.setPlan[0].expires, "absolute expiry: a retry never extends twice");
    assert.equal((await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = ?").bind("activate:" + i.id).first("result")), "activated:" + CC.calls.setPlan[0].expires);
    assert.equal(mails.filter(x => x.id === "paid-" + i.id).length, 1);
    await PAY.paymentsCron(env, Date.now() + 6 * 60000, CC);
    assert.equal(CC.calls.setPlan.length, 2);
    // crash between "paid" and the ledger row
    const j = await inv(env, CC, { email: "crash@example.com" });
    await env.DB.prepare("UPDATE cc_invoices SET status = 'paid', paid_at = ?, paid_via = 'webhook', provider = 'paymob', updated_at = ? WHERE id = ?").bind(NOW(), new Date(Date.now() - 5 * 60000).toISOString(), j.id).run();
    const o2 = await PAY.paymentsCron(env, Date.now(), CC);
    assert.equal(o2.activations.started, 1);
    assert.equal(CC.calls.setPlan.length, 3); assert.equal(CC.calls.setPlan[2].plan, "basic");
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 7. admin console =============================================================== */
test("admin: issue (409 open_invoice), list/filter/search, detail, resend, void (in-progress guard), CSV (BOM + formula guard), permissions", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    const owner = await ownerOf(env, CC), adm = mkAdm(env, "admin", owner.member, CC), support = mkAdm(env, "support", owner.member, CC);
    const member = await mkMember(env, { email: "=cmd@example.com", company: "=HYPERLINK(\"x\")" });
    let r = await admin(env, support, "/invoices", { method: "POST", body: { member_id: member.id, plan: "basic" } });
    assert.deepEqual([r.status, r.data.need], [403, "pay.invoice"]);
    r = await admin(env, adm, "/invoices", { method: "POST", body: { member_id: member.id, plan: "basic", send: true, notes: "عرض خاص" } });
    assert.equal(r.status, 201); const a = r.data.invoice;
    assert.deepEqual([a.source, a.member_id, a.status, a.total_minor], ["admin", member.id, "open", 1140000]);
    assert.ok(a.pay_url.startsWith(SITE + "/pay.html#inv="));
    assert.equal(mails.filter(x => x.id === `inv-${a.id}-issued`).length, 1, JSON.stringify(mails.map(x => [x.id, x.to])));
    assert.ok(adm.audits.some(x => x.action === "pay.invoice" && x.id === a.id), "audited first, with the invoice id");
    r = await admin(env, adm, "/invoices", { method: "POST", body: { member_id: member.id, plan: "premium" } });
    assert.deepEqual([r.status, r.data.code, r.data.invoice.no], [409, "open_invoice", a.no]);
    await inv(env, CC, { email: "other@example.com", plan: "partner" });
    r = await admin(env, support, "/invoices?status=open&q=other");
    assert.deepEqual([r.status, r.data.total, r.data.items[0].plan], [200, 1, "partner"]);
    r = await admin(env, support, "/invoices?source=admin");
    assert.equal(r.data.total, 1);
    assert.equal((await admin(env, support, "/invoices?status=bogus")).data.code, "invalid_status");
    r = await admin(env, support, "/invoices/" + a.no);
    assert.deepEqual([r.data.invoice.no, r.data.member.id, r.data.payments.length], [a.no, member.id, 0]);
    assert.equal((await admin(env, support, "/invoices/INV-1999-000001")).status, 404);
    // resend: e-mail with a fresh id (no 24 h dedupe)
    r = await admin(env, adm, "/invoices/" + a.no + "/resend", { method: "POST" });
    assert.deepEqual([r.data.ok, r.data.sent, r.data.template], [true, true, "invoice_issued"]);
    // void: refused while a payment is in progress
    await configure(env, CC, "paymob");
    await checkoutOk(env, CC, await getInv(env, a.id));
    r = await admin(env, adm, "/invoices/" + a.no + "/void", { method: "POST", body: { reason: "x" } });
    assert.equal(r.status, 422);
    r = await admin(env, adm, "/invoices/" + a.no + "/void", { method: "POST", body: { reason: "خطأ في الباقة" } });
    assert.equal(r.data.code, "payment_in_progress");
    r = await admin(env, adm, "/invoices/" + a.no + "/void", { method: "POST", body: { reason: "خطأ في الباقة", force: true } });
    assert.equal(r.status, 200);
    assert.equal((await getInv(env, a.id)).status, "void"); assert.equal((await lastPayment(env, a.id)).status, "cancelled");
    assert.equal((await pub(env, CC, "/checkout", { method: "POST", body: { t: (await getInv(env, a.id)).pay_token } })).data.code, "state");
    // a verified payment for the void invoice: never lost — flagged for the team
    const pay = await lastPayment(env, a.id), obj = paymobObj(await getInv(env, a.id), pay, { id: 3131 });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    assert.equal(await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = 'paymob:3131:paid'").first("result"), "paid_not_open:void");
    assert.ok(mails.some(x => x.id.startsWith(`teamneed-pay-${a.id}-orphan`)));
    // CSV: support may read but not export; admin gets BOM + quoted cells + formula guard
    assert.equal((await admin(env, support, "/invoices.csv")).status, 403);
    const csvOf = async path => { const res = await PAY.handlePayAdmin(rq("/api/admin/cc/pay" + path), env, ctx, adm), b = new Uint8Array(await res.arrayBuffer()); return { res, bom: [b[0], b[1], b[2]], text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(b) }; };
    let c = await csvOf("/invoices.csv"); // Response.text() would drop the BOM: check the raw bytes
    assert.equal(c.res.status, 200); assert.match(c.res.headers.get("Content-Type"), /^text\/csv/); assert.match(c.res.headers.get("Content-Disposition"), /^attachment; filename="invoices-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.deepEqual(c.bom, [0xef, 0xbb, 0xbf]);
    assert.ok(c.text.startsWith("﻿\"no\",\"status\",\"source\""));
    assert.ok(c.text.includes("\"'=cmd@example.com\""), "formula guard");
    assert.ok(!c.text.includes("\r\n") && c.text.endsWith("\n"));
    c = await csvOf("/payments.csv");
    assert.ok(c.text.startsWith("﻿\"id\",\"invoice_no\""));
    r = await admin(env, support, "/payments?provider=paymob");
    assert.ok(r.data.total >= 1);
    assert.equal((await admin(env, adm, "/nope")).status, 404);
    assert.equal((await admin(env, adm, "/config", { method: "DELETE" })).status, 405);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 8. member self-service =============================================================== */
test("member: loose signup invoices link once the mailbox is proven; renew/upgrade invoice; 409 open_invoice; lower plan refused; 5/day", async () => {
  const env = mkEnv(), CC = fakeCC(), mails = [], m = mockFetch(resend(mails));
  try {
    const loose = await PAY.issueInvoice(env, { email: "new.member@gmail.com", plan: "basic", source: "signup", by: "system" }, CC);
    const unproven = await mkMember(env, { email: "newmember@gmail.com", ev: "" });
    assert.deepEqual((await PAY.memberInvoices(env, unproven)).items, [], "no link without a proven mailbox");
    const mem = await mkMember(env, { email: "newmember@gmail.com", ev: NOW() }); // Gmail dots: the same mailbox
    const list = await PAY.memberInvoices(env, mem);
    assert.equal(list.items.length, 1); assert.equal(list.items[0].no, loose.invoice.no); assert.ok(list.items[0].pay_url.includes("#inv="));
    assert.equal((await env.DB.prepare("SELECT status FROM cc_member_meta WHERE member_id = ?").bind(mem.id).first("status")), "pending");
    assert.equal((await PAY.memberOpenInvoice(env, mem)).no, loose.invoice.no);
    await assert.rejects(PAY.createMemberInvoice(env, mem, "premium", CC), e => e.status === 409 && e.code === "open_invoice" && e.extra.invoice.no === loose.invoice.no);
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE id = ?").bind(loose.invoice.id).run();
    const prem = await mkMember(env, { email: "prem@example.com", plan: "premium", expires: new Date(Date.now() + 90 * 86400000).toISOString() });
    await assert.rejects(PAY.createMemberInvoice(env, prem, "basic", CC), e => e.code === "plan_lower");
    await assert.rejects(PAY.createMemberInvoice(env, prem, "visitor", CC), e => e.code === "invalid_plan");
    const ren = await PAY.createMemberInvoice(env, prem, "premium", CC);
    assert.equal((await env.DB.prepare("SELECT source FROM cc_invoices WHERE no = ?").bind(ren.invoice.no).first("source")), "renewal");
    const up = await PAY.createMemberInvoice(env, mem, "partner", CC);
    assert.equal((await env.DB.prepare("SELECT source FROM cc_invoices WHERE no = ?").bind(up.invoice.no).first("source")), "member");
    for (let k = 0; k < 4; k++) { await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE member_id = ?").bind(prem.id).run(); await PAY.createMemberInvoice(env, prem, "premium", CC); }
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE member_id = ?").bind(prem.id).run();
    await assert.rejects(PAY.createMemberInvoice(env, prem, "premium", CC), e => e.status === 429);
    // a higher plan in force is never lowered by paying a lower invoice: the team decides
    const owner = await ownerOf(env, CC), adm = mkAdm(env, "admin", owner.member, CC);
    const strat = await mkMember(env, { email: "strat@example.com", plan: "strategic", expires: new Date(Date.now() + 200 * 86400000).toISOString() });
    const low = (await admin(env, adm, "/invoices", { method: "POST", body: { member_id: strat.id, plan: "basic" } })).data.invoice;
    const r = await admin(env, adm, "/invoices/" + low.no + "/mark-paid", { method: "POST", body: { manual_ref: "FT9", confirm: low.no } });
    assert.equal(r.data.activation.skipped, "higher");
    assert.equal(CC.calls.setPlan.length, 0);
    assert.ok(mails.some(x => x.id.startsWith(`teamneed-pay-${low.id}-higher`)));
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 9. fail open without migration 0006 =============================================================== */
test("without the 0006 tables: honest defaults, empty lists, 503 store_off for writes, webhooks 200, signups skipped, never throws", async () => {
  const env = mkEnv({}, { tables: false }), CC = fakeCC(), m = mockFetch();
  try {
    const owner = mkAdm(env, "owner", { id: "u1", email: OWNER }, CC);
    let r = await admin(env, owner, "/config");
    assert.deepEqual([r.status, r.data.store, r.data.ready, r.data.provider], [200, false, false, ""]);
    r = await admin(env, owner, "/invoices");
    assert.deepEqual([r.status, r.data.items, r.data.total], [200, [], 0]);
    r = await admin(env, owner, "/config", { method: "PUT", body: { provider: "manual" } });
    assert.deepEqual([r.status, r.data.code], [503, "store_off"]);
    assert.deepEqual(await PAY.payReady(env, { fresh: true }), { ready: false, provider: "", manual: false });
    assert.equal((await pub(env, CC, "/invoice?t=" + "B".repeat(32))).status, 404);
    assert.equal((await pub(env, CC, "/webhook/paymob?hmac=x", { method: "POST", body: { type: "TRANSACTION", obj: { id: 1 } } })).status, 200);
    assert.equal((await PAY.handlePay(rq("/api/pay/return/paytabs?t=" + "B".repeat(32), { method: "POST", body: "a=b", headers: { "Content-Type": "application/x-www-form-urlencoded" } }), env, ctx, CC)).status, 303);
    assert.deepEqual(await PAY.onInquiryCreated(env, "MIG-26-ABCDEF", CC), { skipped: "not_signup" });
    assert.deepEqual(await PAY.paymentsCron(env, Date.now(), CC), { skipped: "store_off" });
    assert.deepEqual(await PAY.memberInvoices(env, { id: "u1", email: OWNER }), { items: [] });
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

/* =============================================================== 10. integration with the real acc-core / e-mail center (when present) =============================================================== */
test("integration: real acc-members setPlan + real email-center renderTemplate (skipped when those modules are absent)", async t => {
  let ACCM = null, MAILC = null;
  try { ACCM = await import("../src/acc-members.js"); MAILC = await import("../src/email-center.js"); } catch (e) { t.skip("acc-members.js / email-center.js not loadable yet: " + e.message); return; }
  if (typeof ACCM.setPlan !== "function" || typeof MAILC.renderTemplate !== "function") { t.skip("setPlan / renderTemplate not exported"); return; }
  const env = mkEnv(), CC = { acc: { setPlan: ACCM.setPlan }, email: MAILC, content: fakeCC().content }, mails = [], m = mockFetch(resend(mails), paymobIntent);
  try {
    await configure(env, CC, "paymob");
    const member = await mkMember(env, { email: "real.flow@example.com" });
    const i = (await PAY.issueInvoice(env, { member_id: member.id, email: member.email, company: member.company, plan: "partner", source: "admin", by: "test", send: true }, CC)).invoice;
    const im = mails.find(x => x.id === `inv-${i.id}-issued`);
    assert.ok(im, "invoice e-mail through renderTemplate"); assert.match(im.text, /ادفع أونلاين من صفحة الدفع الآمنة/); assert.match(im.text, /Pay online on the secure payment page/);
    assert.match(im.text, /57,000/);
    await checkoutOk(env, CC, i);
    const pay = await lastPayment(env, i.id), obj = paymobObj(i, pay, { id: 6060 });
    await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(obj), { method: "POST", body: { type: "TRANSACTION", obj } });
    const fresh = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(member.id).first();
    assert.deepEqual([fresh.plan, fresh.verified], ["partner", 1]); assert.notEqual(fresh.activated_at, "");
    assert.equal(cairoDay(Date.parse(fresh.plan_expires)), cairoDay(Date.now() + 365 * 86400000));
    assert.equal((await env.DB.prepare("SELECT status FROM cc_member_meta WHERE member_id = ?").bind(member.id).first("status")), "active");
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_audit WHERE action = 'member.plan' AND target_id = ?").bind(member.id).first("x"), "acc's own audit row");
    const rcpt = mails.find(x => x.id === "paid-" + i.id);
    assert.ok(rcpt); assert.match(rcpt.text, /اتفعّلت/);
    assert.deepEqual(m.unexpected, []);
  } finally { m.restore(); }
});

test("Paymob binding (review L3): only the HMAC-covered order.id binds a callback — the unsigned merchant_order_id never picks the attempt; no intention_order_id → no checkout", async () => {
  const env = mkEnv(), CC = fakeCC(), m = mockFetch(resend([]), paymobIntent);
  try {
    await configure(env, CC, "paymob");
    const buyer = await mkMember(env, { email: "l3@example.com" });
    const i = await inv(env, CC, { member: buyer });
    await checkoutOk(env, CC, i);
    const pay = await lastPayment(env, i.id);
    // a correctly signed transaction of ANOTHER order whose (unsigned) merchant_order_id names this invoice and attempt
    const other = paymobObj(i, pay, { id: 777001, order: { id: 111222, merchant_order_id: i.no + "-" + pay.id.slice(0, 8) } });
    let r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(other), { method: "POST", body: { type: "TRANSACTION", obj: other } });
    assert.equal(r.status, 200);
    assert.equal((await getInv(env, i.id)).status, "open"); assert.equal(CC.calls.setPlan.length, 0);
    assert.equal(await env.DB.prepare("SELECT result FROM cc_pay_events WHERE event_key = ?").bind("unknown:paymob:777001:paid").first("result"), "ignored:unknown");
    // the genuine transaction (order.id = the stored intention order) binds; an altered merchant_order_id is noted, never decisive
    const own = paymobObj(i, pay, { order: { id: Number(pay.provider_order), merchant_order_id: "TAMPERED" } });
    r = await pub(env, CC, "/webhook/paymob?hmac=" + pmMac(own), { method: "POST", body: { type: "TRANSACTION", obj: own } });
    assert.equal(r.status, 200);
    assert.equal((await getInv(env, i.id)).status, "paid"); assert.equal(CC.calls.setPlan.length, 1);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM cc_audit WHERE action = 'pay.mismatch' AND target_id = ?").bind(i.id).first("x"));
  } finally { m.restore(); }
  // an Intention answer without intention_order_id could never be bound: no checkout
  const env2 = mkEnv(), CC2 = fakeCC(), m2 = mockFetch(resend([]), c => (c.url === "https://accept.paymob.com/v1/intention/" ? jres({ id: "pi_x", client_secret: "egy_csk_live_x", status: "intended" }, 201) : null));
  try {
    await configure(env2, CC2, "paymob");
    const i2 = await inv(env2, CC2, { email: "l3b@example.com" });
    const r2 = await pub(env2, CC2, "/checkout", { method: "POST", body: { t: i2.pay_token } });
    assert.deepEqual([r2.status, r2.data.code], [502, "provider_error"]);
    assert.equal((await lastPayment(env2, i2.id)).status, "failed");
  } finally { m2.restore(); }
});

test("no secret, card data or address of a payer in console output", () => {
  const all = logs.join("\n");
  for (const s of [PM.secret, PM.hmac, NG.key, NG.hook, PT.key, SECRETS.cfg, "4111111111111111", "buyer@example.com", "manual@example.com"]) assert.ok(!all.includes(s), "leaked: " + s.slice(0, 6));
});
