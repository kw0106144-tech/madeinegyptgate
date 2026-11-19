// node --test for the e-mail center (worker/src/email-center.js, ACC-CONTRACT §6 / §11.4) — run alone:
//   cd worker && node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/email-center.test.mjs
// No network: globalThis.fetch is replaced per test and any unexpected URL fails the test. Nothing is ever sent for real.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import * as EC from "../src/email-center.js";
import { putSecret } from "../src/crypto.js";
import { EMAIL_LISTS as COMMON_LISTS, BRAND } from "../src/common.js";
import { sendEmail as advisorSendEmail } from "../src/advisor.js";
import { buyerUpdate, teamReply, asInq } from "../src/inquiries.js";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";

/* migration 0006 (acc-core writes it verbatim from the contract; until it exists the test reads the same SQL from the contract) */
const MIG_URL = new URL("../migrations/0006_admin_center.sql", import.meta.url);
const MIG = existsSync(MIG_URL) ? readFileSync(MIG_URL, "utf8") : (() => {
  const c = readFileSync(new URL("../../docs/janna/ACC-CONTRACT.md", import.meta.url), "utf8"), i = c.indexOf("## 2. D1 migration"), s = c.indexOf("```sql", i), e = c.indexOf("```", s + 6);
  return c.slice(s + 6, e);
})();
const CONFIG_SECRET = "cfg-secret-for-tests-0123456789-abcdefgh";
function mkEnv(extra = {}, { tables = true } = {}) {
  const d = new D1();
  if (tables) { d.db.exec(MIG); d.db.exec(MIG); } // idempotent: applied twice on purpose
  else for (const { name } of d.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc!_%' ESCAPE '!'").all()) d.db.exec(`DROP TABLE "${name}"`); // also after schema.sql carries 0006 (P-W8)
  return { DB: d, AUTH_SECRET: "auth-secret-test", CONFIG_SECRET, ...extra };
}
const rows = (env, sql, ...a) => env.DB.db.prepare(sql).all(...a).map(r => ({ ...r }));
const setMail = (env, kv) => { for (const [k, v] of Object.entries(kv)) env.DB.db.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'mail', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v, new Date().toISOString()); EC.forgetMailCache(env); };

/* ---- fetch fake: every call recorded; unknown URL = failure ---- */
let calls, handler, realFetch;
beforeEach(() => {
  calls = []; handler = null; realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); calls.push({ url: u, init });
    if (handler) { const r = await handler(u, init); if (r) return r; }
    throw new Error("unexpected fetch " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const resendOk = u => (u === "https://api.resend.com/emails" ? Response.json({ id: "re_" + calls.length }) : null);
const brevoOk = u => (u === "https://api.brevo.com/v3/smtp/email" ? new Response(JSON.stringify({ messageId: "<b" + calls.length + "@smtp-relay.brevo.com>" }), { status: 201 }) : null);

/* ---- frozen copies of today's request code (2026-11-18, before the e-mail center) — the byte-for-byte reference ---- */
const astr = (v, max) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "").replace(/\u0000/g, "").trim().slice(0, max);
const fmtFrom0 = f => { const n = String((f && f.name) || "").replace(/["\\\r\n]/g, "").trim(); return n ? `${/[()<>\[\]:;@\\,."]/.test(n) ? `"${n}"` : n} <${f.email}>` : f.email; };
async function legacySendEmail(env, msg) { // advisor.js sendEmail()
  const cc = msg.cc && msg.cc.length ? msg.cc : undefined;
  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(msg.id ? { "Idempotency-Key": msg.id } : {}) },
        body: JSON.stringify({ from: fmtFrom0(msg.from), to: msg.to, cc, reply_to: msg.replyTo || undefined, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers || undefined }),
      });
      let j = {}; try { j = await r.json(); } catch (e) { /* empty body */ }
      if (!r.ok) return { sent: false, provider: "resend", error: `resend ${r.status}: ${astr(j.message || j.name || r.statusText, 200)}` };
      return { sent: true, provider: "resend", id: astr(j.id, 100) };
    } catch (e) { return { sent: false, provider: "resend", error: "resend: " + astr(e && e.message, 200) }; }
  }
  if (env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function") {
    try {
      const res = await env.SEND_EMAIL.send({ from: msg.from, to: msg.to, ...(cc ? { cc } : {}), ...(msg.replyTo ? { replyTo: msg.replyTo } : {}), subject: msg.subject, text: msg.text, html: msg.html, ...(msg.headers ? { headers: msg.headers } : {}) });
      return { sent: true, provider: "cloudflare", id: astr(res && res.messageId, 200) };
    } catch (e) { return { sent: false, provider: "cloudflare", error: "cloudflare: " + astr(((e && e.code) ? e.code + " " : "") + (e && e.message), 200) }; }
  }
  return { sent: false, provider: "", error: "email not configured" };
}
const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
async function legacyMeetingsAttach(env, msg) { // meetings.js mail(): the Resend-with-attachments request
  const atts = (msg.attachments || []).filter(a => a && a.filename);
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(msg.id ? { "Idempotency-Key": msg.id } : {}) },
    body: JSON.stringify({ from: fmtFrom0(msg.from), to: msg.to, reply_to: msg.replyTo || undefined, subject: msg.subject, text: msg.text, html: msg.html,
      attachments: atts.map(a => ({ filename: a.filename, content: b64(new TextEncoder().encode(a.content)), content_type: a.type })) }),
  });
}
const req0 = c => ({ url: c.url, method: c.init.method, headers: JSON.stringify(c.init.headers), body: c.init.body });

/* ---- a fake `adm` (acc.js router) ---- */
const PERMS = { owner: ["email.read", "email.templates", "email.test", "email.config"], admin: ["email.read", "email.templates", "email.test"], editor: [], support: [], platform: ["email.read", "email.templates", "email.test"] };
function mkAdm(role = "owner", { auditFails = false, email } = {}) {
  const audits = [];
  return { member: { id: "m-" + role, email: email || role + "@mig.test" }, role, perms: PERMS[role], can: p => PERMS[role].includes(p), lang: "ar", audits,
    audit: async (action, type, id, before, after, summary) => { if (auditFails) throw new Error("audit insert failed"); audits.push({ action, type, id, before, after, summary }); } };
}
async function cc(env, adm, method, path, body, headers = {}) {
  const res = await EC.handleEmailAdmin(new Request("https://madeinegyptgate.com/api/admin/cc/email" + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, {}, adm);
  let data = null; try { data = await res.clone().json(); } catch (e) { /* no body */ }
  return { status: res.status, data, res };
}
const MSG = { id: "code-1a2b3c4d", from: { email: "noreply@madeinegyptgate.com", name: "منصة صنع في مصر" }, to: ["ahmed@example.com"], replyTo: "noreply@madeinegyptgate.com", subject: "كود الدخول: 123456", text: "كود الدخول لمنصة صنع في مصر:\n\n123456", html: "<div>123456</div>" };

describe("migration 0006 and fail-open (no Control Center tables)", () => {
  test("0006 applies twice; e-mail tables and mail seeds exist", () => {
    const env = mkEnv();
    for (const t of ["cc_mail_templates", "cc_mail_log", "cc_settings", "cc_secrets"]) assert.equal(rows(env, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", t).length, 1, t);
    const s = Object.fromEntries(rows(env, "SELECT k, v FROM cc_settings WHERE scope = 'mail'").map(r => [r.k, r.v]));
    assert.deepEqual(s, { "mail.enabled": "0", "mail.provider": "resend", "mail.from_email": "noreply@madeinegyptgate.com", "mail.from_name": "منصة صنع في مصر", "mail.reply_to": "info@madeinegyptgate.com" });
  });
  test("schema.sql only: deliver = today's request, no log, prepareMail returns the same object, admin reads defaults, writes 503 store_off", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }, { tables: false });
    handler = resendOk;
    assert.equal(await EC.loadMailConfig(env), null);
    assert.equal(EC.mailReady(env), true);
    const r = await EC.deliver(env, MSG); await legacySendEmail(env, MSG);
    assert.deepEqual(r, { sent: true, provider: "resend", id: "re_1" });
    assert.deepEqual(req0(calls[0]), req0(calls[1]));
    const m = { id: "rcpt-x", to: "b@b.test", subject: "s", ar: "a", en: "e" };
    assert.equal(await EC.prepareMail(env, m), m);
    const adm = mkAdm("owner");
    const g = await cc(env, adm, "GET", "/config");
    assert.equal(g.status, 200); assert.equal(g.data.store, false); assert.equal(g.data.from_email, "noreply@madeinegyptgate.com"); assert.equal(g.data.effective.provider, "resend");
    assert.equal((await cc(env, adm, "PUT", "/config", { enabled: 1 })).data.code, "store_off");
    assert.equal((await cc(env, adm, "PUT", "/templates/factory_reminder", { enabled: false })).data.code, "store_off");
    assert.deepEqual((await cc(env, adm, "GET", "/log")).data.items, []);
    assert.equal((await cc(env, adm, "GET", "/templates")).status, 200);
    assert.deepEqual(await EC.emailCron(env), { purged: 0, error: "store_off" });
  });
  test("no DB at all: deliver still sends, never throws", async () => {
    handler = resendOk;
    assert.equal((await EC.deliver({ RESEND_API_KEY: "re_x" }, MSG)).sent, true);
    assert.deepEqual(await EC.deliver({}, MSG), { sent: false, provider: "", error: "email not configured" });
  });
});

describe("deliver(): byte-identical to today's requests (seeded config = enabled 0)", () => {
  test("Resend without attachments — identical to the frozen advisor.js request and to advisor.js sendEmail()", async () => {
    // three separate databases: after the P-W3 hook advisor.js sendEmail() IS deliver(), and one DB would dedupe the repeated id
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }), envB = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }), envC = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" });
    handler = resendOk;
    const variants = [MSG, { ...MSG, id: undefined, replyTo: undefined }, { ...MSG, id: "deal-x", cc: ["c@x.test"], headers: { "List-Unsubscribe": "<https://madeinegyptgate.com/api/unsub?e=x&l=digest&s=y>" } }, { ...MSG, id: "nt-1", from: { email: "noreply@madeinegyptgate.com", name: "Delta, Cables" }, cc: [] }];
    for (const m of variants) {
      calls.length = 0;
      await EC.deliver(env, m); await legacySendEmail(envB, m); await advisorSendEmail(envC, m);
      assert.equal(calls.length, 3);
      assert.deepEqual(req0(calls[0]), req0(calls[1]), "frozen reference");
      assert.deepEqual(req0(calls[0]), req0(calls[2]), "advisor.js sendEmail");
    }
  });
  test("Resend with attachments — identical to the frozen meetings.js request", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" });
    handler = resendOk;
    const m = { id: "mc-abc", from: { email: "noreply@madeinegyptgate.com", name: "جنة — منصة صنع في مصر" }, to: ["mona@example.com"], replyTo: "team@madeinegyptgate.com", subject: "تأكيد اجتماعك مع جنة — منصة صنع في مصر", text: "أهلاً", html: "<div>أهلاً</div>",
      attachments: [{ filename: "meeting.ics", content: "BEGIN:VCALENDAR\r\nSUMMARY:اجتماع\r\nEND:VCALENDAR\r\n", type: "text/calendar; charset=utf-8; method=REQUEST" }] };
    const r = await EC.deliver(env, m); await legacyMeetingsAttach(env, m);
    assert.equal(r.sent, true);
    assert.deepEqual(req0(calls[0]), req0(calls[1]));
    assert.equal(EC.attachOk(env), true);
  });
  test("SEND_EMAIL binding: the same call object, provider 'cloudflare', same error text", async () => {
    const got = [], env = mkEnv({ SEND_EMAIL: { async send(x) { got.push(x); return { messageId: "cf-" + got.length }; } } });
    for (const m of [MSG, { ...MSG, cc: ["c@x.test"], replyTo: undefined, headers: { "X-A": "1" } }]) {
      const a = await EC.deliver(env, { ...m, id: undefined }), b = await legacySendEmail(env, { ...m, id: undefined });
      assert.deepEqual(got.at(-2), got.at(-1)); assert.equal(a.provider, "cloudflare"); assert.equal(b.provider, "cloudflare");
    }
    // attachments on the binding path (attachOk() said no): the text ones are inlined like meetings.js does, nothing is lost silently
    await EC.deliver(env, { ...MSG, id: "ms-1", attachments: [{ filename: "transcript.txt", content: "Mona: أهلاً", type: "text/plain", inline: true }, { filename: "meeting.ics", content: "BEGIN:VCALENDAR", type: "text/calendar" }] });
    assert.ok(got.at(-1).text.endsWith("\n\n———— transcript.txt ————\nMona: أهلاً")); assert.ok(got.at(-1).html.includes("transcript.txt")); assert.ok(!("attachments" in got.at(-1)));
    const bad = mkEnv({ SEND_EMAIL: { async send() { const e = new Error("sender not allowed"); e.code = "E_SENDER"; throw e; } } });
    assert.deepEqual(await EC.deliver(bad, MSG), await legacySendEmail(bad, MSG));
    assert.equal(EC.attachOk(env), false);
  });
  test("provider error / network error → the same result shape as today", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_k_1234567890" });
    handler = u => (u.endsWith("/emails") ? Response.json({ name: "validation_error", message: "Invalid `to` field" }, { status: 422 }) : null);
    assert.deepEqual(await EC.deliver(env, { ...MSG, id: "x-1" }), await legacySendEmail(env, { ...MSG, id: "x-1" }));
    handler = () => { throw new Error("socket hang up"); };
    assert.deepEqual(await EC.deliver(env, { ...MSG, id: "x-2" }), { sent: false, provider: "resend", error: "resend: socket hang up" });
    const log = rows(env, "SELECT status, error FROM cc_mail_log ORDER BY id");
    assert.deepEqual(log.map(r => r.status), ["failed", "failed"]);
    assert.match(log[0].error, /^resend 422: Invalid `to` field$/);
  });
});

describe("provider order, Brevo, sender settings", () => {
  const putKey = (env, slot, v) => putSecret(env, slot, v, "owner@mig.test");
  test("(a) Control Center config → (b) RESEND_API_KEY → (c) binding → (d) email not configured", async () => {
    handler = u => resendOk(u) || brevoOk(u);
    const bind = { async send() { return { messageId: "cf-1" }; } };
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key", BREVO_API_KEY: "xkeysib-worker-brevo-0123456789", SEND_EMAIL: bind });
    // enabled 0 (seed) → the Worker's own setup
    assert.equal((await EC.deliver(env, { ...MSG, id: "o-1" })).provider, "resend");
    assert.equal(calls.at(-1).init.headers.Authorization, "Bearer re_worker_secret_key");
    // enabled + resend + a Control Center key → that key wins over the Worker secret
    await putKey(env, "mail.resend.api_key", "re_control_center_key_9876"); setMail(env, { "mail.enabled": "1" });
    assert.equal((await EC.loadMailConfig(env)).source, "control_center");
    assert.equal((await EC.deliver(env, { ...MSG, id: "o-2" })).provider, "resend");
    assert.equal(calls.at(-1).init.headers.Authorization, "Bearer re_control_center_key_9876");
    // enabled + brevo, key from the Worker secret BREVO_API_KEY
    setMail(env, { "mail.provider": "brevo" });
    const c = await EC.loadMailConfig(env); assert.equal(c.ready, true); assert.equal(c.source, "worker_secret");
    assert.equal((await EC.deliver(env, { ...MSG, id: "o-3" })).provider, "brevo");
    assert.equal(calls.at(-1).init.headers["api-key"], "xkeysib-worker-brevo-0123456789");
    // brevo without any key → not ready → RESEND_API_KEY
    const env2 = mkEnv({ RESEND_API_KEY: "re_worker_secret_key", SEND_EMAIL: bind }); setMail(env2, { "mail.enabled": "1", "mail.provider": "brevo" });
    assert.equal((await EC.deliver(env2, { ...MSG, id: "o-4" })).provider, "resend");
    // only the binding
    const env3 = mkEnv({ SEND_EMAIL: bind });
    assert.equal((await EC.deliver(env3, { ...MSG, id: "o-5" })).provider, "cloudflare");
    // nothing
    const env4 = mkEnv();
    assert.deepEqual(await EC.deliver(env4, { ...MSG, id: "o-6" }), { sent: false, provider: "", error: "email not configured" });
    assert.equal(rows(env4, "SELECT status, error FROM cc_mail_log")[0].error, "email not configured");
  });
  test("mailReady() / attachOk() truth table", async () => {
    const bind = { SEND_EMAIL: { send() {} } };
    assert.deepEqual([EC.mailReady({}), EC.attachOk({})], [false, false]);
    assert.deepEqual([EC.mailReady({ RESEND_API_KEY: "re_x" }), EC.attachOk({ RESEND_API_KEY: "re_x" })], [true, true]);
    assert.deepEqual([EC.mailReady(bind), EC.attachOk(bind)], [true, false]);
    assert.deepEqual([EC.mailReady({ SEND_EMAIL: {} }), EC.attachOk({ SEND_EMAIL: {} })], [false, false]);
    const env = mkEnv({ ...bind }); await putKey(env, "mail.brevo.api_key", "xkeysib-cc-brevo-key-0123456789"); setMail(env, { "mail.enabled": "1", "mail.provider": "brevo" });
    assert.deepEqual([EC.mailReady(env), EC.attachOk(env)], [true, false], "sync: memo not loaded yet → binding");
    await EC.loadMailConfig(env); // acc.js ccBoot does this at the start of every fetch / scheduled / email
    assert.deepEqual([EC.mailReady(env), EC.attachOk(env)], [true, true]);
    const only = mkEnv(); await putKey(only, "mail.resend.api_key", "re_only_cc_key_0123456"); setMail(only, { "mail.enabled": "1" }); await EC.loadMailConfig(only);
    assert.deepEqual([EC.mailReady(only), EC.attachOk(only)], [true, true], "a key saved only in the Control Center");
    setMail(only, { "mail.enabled": "0" }); await EC.loadMailConfig(only);
    assert.deepEqual([EC.mailReady(only), EC.attachOk(only)], [false, false]);
  });
  test("Brevo request body; no idempotency key; non-ASCII header values dropped", async () => {
    handler = brevoOk;
    const env = mkEnv(); await putKey(env, "mail.brevo.api_key", "xkeysib-cc-brevo-key-0123456789"); setMail(env, { "mail.enabled": "1", "mail.provider": "brevo" });
    const r = await EC.deliver(env, { ...MSG, id: "upd-abc-reply-1", cc: ["c@x.test"], replyTo: "team@madeinegyptgate.com", headers: { "List-Unsubscribe": "<https://madeinegyptgate.com/api/unsub?e=a&l=updates&s=b>", "X-Bad": "عربي" },
      attachments: [{ filename: "t.txt", content: "مرحبا", type: "text/plain" }] });
    assert.deepEqual(r, { sent: true, provider: "brevo", id: "<b1@smtp-relay.brevo.com>" });
    const c = calls[0], b = JSON.parse(c.init.body);
    assert.equal(c.url, "https://api.brevo.com/v3/smtp/email");
    assert.deepEqual(c.init.headers, { "api-key": "xkeysib-cc-brevo-key-0123456789", "Content-Type": "application/json", Accept: "application/json" });
    assert.deepEqual(b.sender, { name: "منصة صنع في مصر", email: "noreply@madeinegyptgate.com" });
    assert.deepEqual(b.to, [{ email: "ahmed@example.com" }]); assert.deepEqual(b.cc, [{ email: "c@x.test" }]); assert.deepEqual(b.replyTo, { email: "team@madeinegyptgate.com" });
    assert.equal(b.subject, MSG.subject); assert.equal(b.htmlContent, MSG.html); assert.equal(b.textContent, MSG.text);
    assert.deepEqual(b.headers, { "List-Unsubscribe": "<https://madeinegyptgate.com/api/unsub?e=a&l=updates&s=b>" });
    assert.deepEqual(b.attachment, [{ name: "t.txt", content: Buffer.from("مرحبا").toString("base64") }]);
    assert.ok(!JSON.stringify(b).includes("dempotency"));
    assert.equal(rows(env, "SELECT list FROM cc_mail_log")[0].list, "updates", "list from the List-Unsubscribe header");
    handler = u => (u.endsWith("/smtp/email") ? Response.json({ code: "unauthorized", message: "Key not found" }, { status: 401 }) : null);
    assert.deepEqual(await EC.deliver(env, { ...MSG, id: "b-2" }), { sent: false, provider: "brevo", error: "brevo 401: Key not found" });
  });
  test("sender (enabled): from_email, generic name → from_name, specific names kept, default Reply-To, caller's Reply-To wins, deal e-mails untouched", async () => {
    handler = resendOk;
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>" });
    setMail(env, { "mail.enabled": "1", "mail.from_email": "hello@madeinegyptgate.com", "mail.from_name": "Made in Egypt Gate", "mail.reply_to": "info@madeinegyptgate.com" });
    const send = async m => { await EC.deliver(env, m); return JSON.parse(calls.at(-1).init.body); };
    let b = await send({ ...MSG, id: "s-1", replyTo: undefined });
    assert.equal(b.from, "Made in Egypt Gate <hello@madeinegyptgate.com>"); assert.equal(b.reply_to, "info@madeinegyptgate.com");
    b = await send({ ...MSG, id: "s-2", from: { email: "noreply@madeinegyptgate.com", name: "جنة — منصة صنع في مصر" }, replyTo: "team@madeinegyptgate.com" });
    assert.equal(b.from, "جنة — منصة صنع في مصر <hello@madeinegyptgate.com>"); assert.equal(b.reply_to, "team@madeinegyptgate.com");
    const deal = { id: "a1b2c3d4e5f6a1b2c3d4e5f6", from: { email: "noreply@madeinegyptgate.com", name: "Delta Cables via Made in Egypt Gate" }, to: ["buyer@authority.example"], cc: ["owner@delta.test"], replyTo: "owner@delta.test", subject: "Offer", text: "x", html: "<p>x</p>", headers: { "X-MIG-Deal": "d1" } };
    await EC.deliver(env, deal); await legacySendEmail(env, deal);
    assert.deepEqual(req0(calls.at(-2)), req0(calls.at(-1)), "a member-authored deal e-mail is never altered");
    assert.equal(rows(env, "SELECT template FROM cc_mail_log WHERE msg_id = ?", deal.id)[0].template, "deal_email");
  });
});

describe("dedupe and the delivery log", () => {
  test("the same id within 24 h → one send; a failed attempt does not block the retry", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" });
    handler = resendOk;
    const a = await EC.deliver(env, MSG), b = await EC.deliver(env, MSG);
    assert.equal(calls.length, 1); assert.deepEqual(b, { sent: true, provider: "resend", id: a.id, dedup: true });
    env.DB.db.prepare("UPDATE cc_mail_log SET at = ?").run(new Date(Date.now() - 25 * 3600e3).toISOString());
    await EC.deliver(env, MSG); assert.equal(calls.length, 2, "older than 24 h → sent again");
    handler = u => (u.endsWith("/emails") ? Response.json({ message: "down" }, { status: 500 }) : null);
    await EC.deliver(env, { ...MSG, id: "route-9-0" });
    handler = resendOk;
    assert.equal((await EC.deliver(env, { ...MSG, id: "route-9-0" })).sent, true); assert.equal(calls.length, 4);
  });
  test("one row per attempt: hashed + masked recipient, codes masked, no body, nothing of the address in clear", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" });
    handler = resendOk;
    await EC.deliver(env, { ...MSG, to: ["Ahmed.Ali@Example.com"], cc: ["x@y.test"] });
    const [r] = rows(env, "SELECT * FROM cc_mail_log");
    assert.equal(r.template, "auth_code"); assert.equal(r.status, "sent"); assert.equal(r.provider, "resend"); assert.equal(r.provider_id, "re_1"); assert.equal(r.msg_id, MSG.id);
    assert.equal(r.to_masked, "a•••@example.com +1"); assert.equal(r.subject, "كود الدخول: ••••••"); assert.equal(r.to_hash.length, 32);
    const all = JSON.stringify(r);
    for (const s of ["123456", "ahmed.ali", "Ahmed.Ali", "كود الدخول لمنصة"]) assert.ok(!all.includes(s), s);
    assert.equal(EC.maskSubject("فاتورة INV-2026-000123 كود 654321"), "فاتورة INV-2026-000123 كود ••••••");
  });
  test("log endpoint: filters (template, status, exact address, dates), cursor paging; stats; emailCron 180 days", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }), adm = mkAdm("admin");
    handler = resendOk;
    for (let i = 0; i < 5; i++) await EC.deliver(env, { ...MSG, id: "code-" + i, to: [i % 2 ? "odd@x.test" : "even@x.test"] });
    await EC.deliver(env, { ...MSG, id: "rcpt-1", subject: "تم الاستلام", to: ["buyer@b.test"] });
    let l = await cc(env, adm, "GET", "/log?template=auth_code&limit=2");
    assert.equal(l.status, 200); assert.equal(l.data.items.length, 2); assert.ok(l.data.next_before);
    l = await cc(env, adm, "GET", `/log?template=auth_code&limit=2&before=${l.data.next_before}`); assert.equal(l.data.items.length, 2);
    assert.equal((await cc(env, adm, "GET", "/log?to=ODD@x.test")).data.items.length, 2);
    assert.equal((await cc(env, adm, "GET", "/log?to=odd")).data.code, "invalid_to");
    assert.equal((await cc(env, adm, "GET", "/log?status=failed")).data.items.length, 0);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal((await cc(env, adm, "GET", `/log?from=2020-01-01&to_date=2099-01-01`)).data.items.length, 6);
    assert.equal((await cc(env, adm, "GET", `/log?from=2099-01-01`)).data.items.length, 0);
    assert.equal((await cc(env, adm, "GET", "/log?from=yesterday")).data.code, "invalid_from");
    const it = (await cc(env, adm, "GET", "/log?limit=1")).data.items[0];
    assert.deepEqual(Object.keys(it).sort(), ["at", "error", "id", "list", "ms", "provider", "provider_id", "status", "subject", "template", "to_masked"]);
    const st = (await cc(env, adm, "GET", "/stats?days=30")).data;
    assert.deepEqual(st.total, { sent: 6, failed: 0, skipped: 0 }); assert.equal(st.by_day.length, 1); assert.ok(st.by_day[0].day.startsWith(today.slice(0, 7)));
    assert.deepEqual(st.by_template.map(x => [x.template, x.sent]), [["auth_code", 5], ["inquiry_receipt", 1]]);
    assert.deepEqual(st.by_provider, [{ provider: "resend", sent: 6, failed: 0 }]);
    env.DB.db.prepare("UPDATE cc_mail_log SET at = ? WHERE msg_id IN ('code-0', 'code-1')").run(new Date(Date.now() - 181 * 86400e3).toISOString());
    assert.deepEqual(await EC.emailCron(env), { purged: 2 });
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM cc_mail_log")[0].n, 4);
  });
});

describe("template registry", () => {
  test("templateKeyOf() for every prefix, the deal header and explicit tpl", () => {
    for (const t of EC.TEMPLATES) for (const p of t.prefixes) assert.equal(EC.templateKeyOf({ id: p + "x1" }), t.key, p);
    assert.equal(EC.templateKeyOf({ id: "a1b2c3d4e5f6", headers: { "X-MIG-Deal": "d" } }), "deal_email");
    assert.equal(EC.templateKeyOf({ id: "code-1", headers: new Headers({ "X-MIG-Deal": "d" }) }), "deal_email");
    assert.equal(EC.templateKeyOf({ id: "zzz-1", tpl: "payment_link" }), "payment_link");
    assert.equal(EC.templateKeyOf({ id: "code-1", tpl: "nope" }), "auth_code");
    assert.equal(EC.templateKeyOf({ id: "zzz" }), "other"); assert.equal(EC.templateKeyOf(null), "other");
    const all = EC.TEMPLATES.flatMap(t => t.prefixes); assert.equal(new Set(all).size, all.length, "prefixes are unique");
  });
  test("completeness: every e-mail id literal in worker/src/*.js has a registry row", () => {
    const dir = new URL("../src/", import.meta.url), found = [];
    for (const f of readdirSync(dir).filter(f => f.endsWith(".js"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/\b(?:mail|sendEmail|deliver)\(\s*env\s*,\s*\{\s*id:\s*(["'`])((?:(?!\1)[^$\\])*)/g)) {
        const head = m[2], rest = src.slice(m.index, m.index + 600), call = rest.slice(0, (rest.indexOf("})") + 1) || 600);
        const ok = EC.templateKeyOf({ id: head + "zz" }) !== "other" || (!head.includes("-") && EC.TEMPLATES.some(t => t.prefixes.some(p => p.startsWith(head)))) || /\btpl\s*:|\.\.\./.test(call);
        found.push([f, head]);
        assert.ok(ok, `${f}: e-mail id "${head}…" has no row in the e-mail center registry (TEMPLATES)`);
      }
    }
    // the scan really sees today's e-mails (so it cannot pass by finding nothing)
    const heads = new Set(found.map(x => x[1]));
    for (const h of ["code-", "rcpt-", "route-", "upd-", "bmsg-", "remind-", "team-", "teamneed-", "teamreply-", "wa-on-", "digest-", "dl-", "wamood-", "bm-", "bc-", "mc-", "mx-", "ms-", "mr", "l-", "nt-", "n-"]) assert.ok(heads.has(h), "scan found " + h);
    assert.ok(new Set(found.map(x => x[0])).size >= 7);
  });
  test("lists are exactly common.js EMAIL_LISTS; the generic sender name is BRAND.name", () => {
    assert.deepEqual([...EC.EMAIL_LISTS], [...COMMON_LISTS]);
    for (const t of EC.TEMPLATES) if (t.list) assert.ok(COMMON_LISTS.includes(t.list), t.key);
    assert.equal(EC.MAIL_DEFAULTS.from_name, BRAND.name);
  });
  test("every ★ template renders AR + EN without leftover placeholders; must-vars are in the defaults; declared vars only", async () => {
    const env = mkEnv();
    for (const t of EC.TEMPLATES.filter(x => x.via === "render")) {
      const vars = Object.fromEntries(t.vars.map(n => [n, "V_" + n]));
      for (const lang of ["ar", "en"]) {
        const r = await EC.renderTemplate(env, t.key, { lang, vars });
        assert.equal(r.tpl, t.key); assert.equal(r.__rendered, t.key); assert.ok(r.ar && r.en && r.subject, t.key);
        for (const s of [r.subject, r.ar, r.en]) assert.ok(!/\{\{|\}\}/.test(s), t.key + ": " + s);
        assert.ok(r.subject.includes(" / "), "bilingual subject " + t.key);
        assert.ok(lang === "ar" ? /[؀-ۿ]/.test(r.subject.split(" / ")[0]) : !/[؀-ۿ]/.test(r.subject.split(" / ")[0]), t.key);
      }
      for (const n of t.must) assert.ok(t.body_ar.includes("{{" + n + "}}") && t.body_en.includes("{{" + n + "}}"), t.key + " must " + n);
      for (const s of [t.subject_ar, t.subject_en, t.body_ar, t.body_en]) for (const m of s.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(t.vars.includes(m[1]), t.key + " " + m[1]);
    }
    await assert.rejects(() => EC.renderTemplate(env, "auth_code", {}), /unknown template/);
  });
  test("invoice_issued: honest gateway text by default, the pay link only when ready, manual instructions with the invoice number", async () => {
    const env = mkEnv(), base = { invoice_no: "INV-2026-000001", plan_name: { ar: "الباقة الأساسية", en: "Basic plan" }, total: "11,400", pay_url: "https://madeinegyptgate.com/pay.html#inv=tok", company: "شركة النيل" };
    let r = await EC.renderTemplate(env, "invoice_issued", { vars: base });
    assert.match(r.ar, /بوابة الدفع الإلكتروني لسه بتتجهّز/); assert.ok(!r.ar.includes("pay.html")); assert.match(r.ar, /11,400 جنيه/); assert.match(r.en, /11,400 EGP/); assert.match(r.en, /Basic plan/);
    r = await EC.renderTemplate(env, "invoice_issued", { lang: "en", vars: { ...base, pay_ready: true, manual_ar: "تحويل على حساب البنك", manual_en: "Bank transfer" } });
    assert.match(r.ar, /ادفع أونلاين من صفحة الدفع الآمنة: https:\/\/madeinegyptgate\.com\/pay\.html#inv=tok/);
    assert.match(r.ar, /تحويل على حساب البنك\nاكتب رقم الفاتورة INV-2026-000001 في بيان التحويل\./); assert.match(r.en, /Bank transfer\nWrite the invoice number INV-2026-000001/);
    assert.ok(r.subject.startsWith("Subscription invoice INV-2026-000001 / "));
    r = await EC.renderTemplate(env, "invoice_issued", { vars: { ...base, company: "{{pay_url}}\u0007" } });
    assert.ok(r.ar.includes("دي فاتورة اشتراك {{pay_url}} في"), "a value is never re-scanned for variables"); assert.ok(!r.ar.includes("\u0007"));
  });
});

describe("prepareMail() — the common.js mail() hook", () => {
  const RCPT = { id: "rcpt-abc", to: "buyer@b.test", lang: "ar", subject: "تم الاستلام: طلب عرض سعر MIG-26-ABC234", ar: "أهلاً أحمد،\nاستلمنا طلب عرض سعر رقم MIG-26-ABC234.", en: "Hello Ahmed,\nWe received your request for quotation MIG-26-ABC234.", why: "x" };
  test("no override → the very same object", async () => {
    const env = mkEnv();
    assert.equal(await EC.prepareMail(env, RCPT), RCPT);
    assert.equal(await EC.prepareMail(env, null), null);
  });
  test("subject / intro / outro overrides with derived vars (AR + EN, per language)", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    const p = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { subject_ar: "{{subject}} ✓", subject_en: "[{{ref}}] {{kind}}", intro_ar: "أهلاً بيك في منصة صنع في مصر ({{kind}})", outro_en: "Questions? {{ref}}" });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const out = await EC.prepareMail(env, RCPT);
    assert.notEqual(out, RCPT); assert.equal(RCPT.subject, "تم الاستلام: طلب عرض سعر MIG-26-ABC234", "input not mutated");
    assert.equal(out.subject, "تم الاستلام: طلب عرض سعر MIG-26-ABC234 ✓ / [MIG-26-ABC234] Request for quotation");
    assert.equal(out.ar, "أهلاً بيك في منصة صنع في مصر (طلب عرض سعر)\n\n" + RCPT.ar); assert.equal(out.en, RCPT.en + "\n\nQuestions? MIG-26-ABC234");
    const en = await EC.prepareMail(env, { ...RCPT, lang: "en", subject: "Received: Request for quotation MIG-26-ABC234" });
    assert.equal(en.subject, "[MIG-26-ABC234] Request for quotation / Received: Request for quotation MIG-26-ABC234 ✓");
    assert.equal(p.data.item.overrides.subject_en, "[{{ref}}] {{kind}}");
    assert.equal(adm.audits.at(-1).action, "email.template"); assert.equal(adm.audits.at(-1).id, "inquiry_receipt");
  });
  test("an optional template switched off → __skip (one 'skipped' log row); required ones cannot be switched off", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    assert.equal((await cc(env, adm, "PUT", "/templates/follow_digest", { enabled: false })).status, 200);
    const m = { id: "digest-m1-2026-11-18", to: "f@x.test", list: "digest", subject: "جديد متابعاتك اليوم (3) / Your follows today", ar: "a", en: "e" };
    const out = await EC.prepareMail(env, m); assert.equal(out.__skip, "template_off");
    await EC.prepareMail(env, m);
    const log = rows(env, "SELECT template, status, error, list FROM cc_mail_log");
    assert.deepEqual(log, [{ template: "follow_digest", status: "skipped", error: "template_off", list: "digest" }]);
    for (const k of ["auth_code", "inquiry_to_factory", "team_needs_alert", "invoice_issued", "meeting_summary"]) {
      const r = await cc(env, adm, "PUT", "/templates/" + k, { enabled: false });
      assert.equal(r.status, 400, k); assert.equal(r.data.code, "required_template");
    }
    assert.equal((await cc(env, adm, "PUT", "/templates/follow_digest", { enabled: true })).data.item.enabled, true);
    assert.equal((await EC.prepareMail(env, m)), m);
  });
  test("validation: unknown var 422, body only for ★ templates, ★ body must keep its link, contacts of markup neutralised", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    let r = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { subject_ar: "{{subject}} {{plan_name}} {{ bad name }}" });
    assert.equal(r.status, 422); assert.equal(r.data.code, "unknown_var"); assert.deepEqual(r.data.vars.sort(), [" bad name ", "plan_name"]);
    r = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { body_ar: "نص كامل" }); assert.equal(r.data.code, "body_not_editable");
    r = await cc(env, adm, "PUT", "/templates/payment_link", { body_ar: "ادفع {{invoice_no}}" }); assert.equal(r.status, 422); assert.equal(r.data.code, "missing_var"); assert.deepEqual(r.data.vars, ["pay_url"]);
    r = await cc(env, adm, "PUT", "/templates/deal_email", { subject_ar: "x" }); assert.equal(r.data.code, "not_editable");
    r = await cc(env, adm, "PUT", "/templates/other", { subject_ar: "x" }); assert.equal(r.data.code, "not_editable");
    r = await cc(env, adm, "PUT", "/templates/nope", { subject_ar: "x" }); assert.equal(r.status, 404);
    r = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { intro_ar: 5 }); assert.equal(r.status, 422); assert.equal(r.data.errors[0].field, "intro_ar");
    r = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { subject_ar: "x".repeat(201) }); assert.equal(r.status, 422);
    r = await cc(env, adm, "PUT", "/templates/inquiry_receipt", { intro_ar: `<img src=x onerror=alert(1)>"><script>alert('x')</script>\`\u0000`, subject_ar: "سطر\r\nBcc: evil@x.test" });
    assert.equal(r.status, 200);
    const o = rows(env, "SELECT intro_ar, subject_ar FROM cc_mail_templates WHERE key = 'inquiry_receipt'")[0];
    assert.ok(!/[<>"'`\u0000]/.test(o.intro_ar), o.intro_ar); assert.ok(!/[\r\n]/.test(o.subject_ar));
    const pv = await cc(env, adm, "POST", "/preview", { key: "inquiry_receipt", lang: "ar" });
    assert.ok(!/<script|<img|onerror=alert\(1\)>/.test(pv.data.html));
  });
  test("★ templates: renderTemplate applies overrides once (prepareMail leaves them alone); switched off → __skip", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    assert.equal((await cc(env, adm, "PUT", "/templates/product_rejected", { subject_ar: "منتجك «{{product}}» محتاج تعديل", intro_ar: "أهلاً،", body_en: "Not approved: {{product}} — {{reason}} — {{url}}" })).status, 200);
    const r = await EC.renderTemplate(env, "product_rejected", { lang: "ar", vars: { product: "براميل 200 لتر", reason: "الصورة مش واضحة", url: "https://madeinegyptgate.com/dashboard.html#products" } });
    assert.equal(r.subject, "منتجك «براميل 200 لتر» محتاج تعديل / Your product was not approved: براميل 200 لتر");
    assert.ok(r.ar.startsWith("أهلاً،\n\nماتوافقش على منتجك «براميل 200 لتر» — السبب: الصورة مش واضحة."));
    assert.equal(r.en, "Not approved: براميل 200 لتر — الصورة مش واضحة — https://madeinegyptgate.com/dashboard.html#products");
    assert.equal(r.list, "updates");
    const m = { id: "prod-no-p1", to: "f@x.test", ...r };
    assert.equal(await EC.prepareMail(env, m), m, "already rendered");
    assert.equal((await cc(env, adm, "PUT", "/templates/product_rejected", { enabled: false })).status, 200);
    const r2 = await EC.renderTemplate(env, "product_rejected", { vars: { product: "x", reason: "y", url: "z" } });
    assert.equal(r2.enabled, false);
    assert.equal((await EC.prepareMail(env, { id: "prod-no-p2", to: "f@x.test", ...r2 })).__skip, "template_off");
  });
});

describe("advisor.js / meetings.js e-mails (composed outside mail()): overrides applied in deliver()", () => {
  test("subject + intro on a meeting confirmation (text and html); a reminder switched off is skipped; deal e-mails cannot be edited", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }), adm = mkAdm("admin");
    handler = resendOk;
    assert.equal((await cc(env, adm, "PUT", "/templates/meeting_confirmation", { subject_ar: "{{subject}} ✅", intro_ar: "أهلاً بيك! تفاصيل: https://madeinegyptgate.com/meeting.html", intro_en: "Welcome <b>!</b>" })).status, 200);
    const m = { id: "mc-1", from: { email: "noreply@madeinegyptgate.com", name: "جنة — منصة صنع في مصر" }, to: ["mona@example.com"], subject: "تأكيد اجتماعك مع جنة — منصة صنع في مصر", text: "النص", html: "<div>النص</div>" };
    await EC.deliver(env, m);
    const b = JSON.parse(calls[0].init.body);
    assert.equal(b.subject, "تأكيد اجتماعك مع جنة — منصة صنع في مصر ✅");
    assert.equal(b.text, "أهلاً بيك! تفاصيل: https://madeinegyptgate.com/meeting.html\n\nWelcome ‹b›!‹/b›\n\nالنص");
    assert.ok(b.html.endsWith("<div>النص</div>")); assert.ok(b.html.includes('<a href="https://madeinegyptgate.com/meeting.html">')); assert.ok(!b.html.includes("<b>"));
    assert.equal((await cc(env, adm, "PUT", "/templates/meeting_reminder", { enabled: false })).status, 200);
    const r = await EC.deliver(env, { ...m, id: "mr24h-1", subject: "تذكير: اجتماعك مع جنة" });
    assert.deepEqual(r, { sent: false, provider: "", skipped: "template_off", error: "template_off" }); assert.equal(calls.length, 1);
    assert.equal(rows(env, "SELECT status FROM cc_mail_log WHERE msg_id = 'mr24h-1'")[0].status, "skipped");
    assert.equal((await cc(env, adm, "PUT", "/templates/meeting_summary", { enabled: false })).data.code, "required_template");
  });
});

describe("admin API: permissions, audit, config, secrets, preview, test send, status", () => {
  test("permissions: editor/support see nothing; admin reads + templates + test, not the config (owner only)", async () => {
    const env = mkEnv();
    for (const role of ["editor", "support"]) for (const [M, p] of [["GET", "/config"], ["GET", "/templates"], ["GET", "/log"], ["GET", "/status"], ["POST", "/preview"]]) {
      const r = await cc(env, mkAdm(role), M, p, M === "POST" ? { key: "auth_code" } : undefined);
      assert.equal(r.status, 403, role + p); assert.deepEqual([r.data.code, r.data.need], ["forbidden", "email.read"]);
    }
    const admin = mkAdm("admin");
    assert.deepEqual([(await cc(env, admin, "PUT", "/config", { enabled: 1 })).data.code, (await cc(env, admin, "POST", "/status/check")).data.code], ["owner_only", "owner_only"]);
    assert.equal((await cc(env, mkAdm("platform"), "PUT", "/config", { enabled: 1 })).data.code, "owner_only");
    assert.equal((await cc(env, admin, "GET", "/config")).status, 200);
    assert.equal((await cc(env, mkAdm("support"), "PUT", "/templates/auth_code", { intro_ar: "x" })).data.need, "email.templates");
    assert.equal((await cc(env, mkAdm("support"), "POST", "/test", {})).data.need, "email.test");
    assert.equal((await EC.handleEmailAdmin(new Request("https://madeinegyptgate.com/api/admin/cc/email/config"), env, {}, null)).status, 401);
    assert.equal((await cc(env, admin, "DELETE", "/config")).status, 405); assert.equal((await cc(env, admin, "GET", "/nope")).status, 404);
  });
  test("audit is written BEFORE every change: when it fails nothing changes (500 audit_failed)", async () => {
    const env = mkEnv(), bad = mkAdm("owner", { auditFails: true });
    let r = await cc(env, bad, "PUT", "/config", { enabled: 1, from_name: "X" }); assert.deepEqual([r.status, r.data.code], [500, "audit_failed"]);
    assert.equal(rows(env, "SELECT v FROM cc_settings WHERE k = 'mail.enabled'")[0].v, "0");
    r = await cc(env, bad, "PUT", "/config", { api_key: "re_new_key_0123456789" }); assert.equal(r.data.code, "audit_failed");
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM cc_secrets")[0].n, 0);
    r = await cc(env, bad, "PUT", "/templates/factory_reminder", { enabled: false }); assert.equal(r.data.code, "audit_failed");
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM cc_mail_templates")[0].n, 0);
    r = await cc(env, bad, "POST", "/test", { to: "owner@mig.test" }); assert.equal(r.data.code, "audit_failed"); assert.equal(calls.length, 0);
  });
  test("PUT config: live payload, validation, encrypted key never returned, key precedence, clear_key", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key_abcd" }), owner = mkAdm("owner");
    const bad = async (body, code) => { const r = await cc(env, owner, "PUT", "/config", body); assert.equal(r.data.code, code, JSON.stringify(body)); };
    await bad({ provider: "smtp" }, "smtp_unsupported"); await bad({ provider: "brevo", smtp_host: "srv2142320.hstgr.cloud", smtp_pass: "p" }, "smtp_unsupported");
    await bad({ provider: "mailgun" }, "invalid_provider"); await bad({ from_email: "noreply@gmail.com" }, "invalid_from"); await bad({ from_email: "noreply@madeinegyptgate.com.evil.com" }, "invalid_from");
    await bad({ reply_to: "not-an-address" }, "invalid_reply_to"); await bad({ api_key: "xkeysib-abc0123456789" }, "invalid_key"); await bad({ provider: "brevo", api_key: "xsmtpsib-abcdef0123456789" }, "invalid_key");
    await bad({ api_key: "re_ with space" }, "invalid_key"); await bad("{bad", "bad_json");
    assert.equal((await cc(mkEnv({ CONFIG_SECRET: "" }), owner, "PUT", "/config", { api_key: "re_valid_key_0123456789" })).data.code, "config_secret_missing");
    assert.equal(owner.audits.length, 0, "nothing audited for refused requests");
    // the live form's empty smtp_* values and "" api_key are harmless
    let r = await cc(env, owner, "PUT", "/config", { enabled: 1, provider: "resend", smtp_host: "", smtp_port: "", from_email: "NoReply@MadeInEgyptGate.com", from_name: 'منصة "صنع" في مصر <x>', reply_to: "info@madeinegyptgate.com", api_key: "" });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.ready, true); assert.equal(r.data.config.key.source, "worker_secret"); assert.equal(r.data.config.from_name, "منصة ”صنع” في مصر ‹x›");
    assert.equal(owner.audits.at(-1).action, "email.config"); assert.deepEqual(owner.audits.at(-1).after, { enabled: "1", from_name: r.data.config.from_name });
    const KEY = "re_control_center_secret_key_XYZ9";
    r = await cc(env, owner, "PUT", "/config", { api_key: KEY });
    assert.equal(r.status, 200); assert.equal(r.data.config.key.source, "control_center"); assert.equal(r.data.config.key.tail, "XYZ9"); assert.equal(r.data.config.keys.resend.worker_secret, true);
    assert.equal(owner.audits.at(-1).action, "email.key"); assert.deepEqual(owner.audits.at(-1).after, { set: true, tail: "XYZ9" });
    const sealed = rows(env, "SELECT sealed, tail FROM cc_secrets WHERE name = 'mail.resend.api_key'")[0];
    assert.ok(sealed.sealed.startsWith("v1.") && !sealed.sealed.includes(KEY));
    for (const p of ["/config", "/status", "/templates"]) assert.ok(!JSON.stringify((await cc(env, owner, "GET", p)).data).includes(KEY), p);
    assert.ok(!JSON.stringify(owner.audits).includes(KEY));
    handler = resendOk; await EC.deliver(env, { ...MSG, id: "k-1" }); assert.equal(calls.at(-1).init.headers.Authorization, "Bearer " + KEY);
    // another CONFIG_SECRET → unreadable → the UI asks to re-enter it; the Worker secret keeps mail flowing
    const other = { ...env, CONFIG_SECRET: "another-config-secret-0123456789-abcdef" };
    const g = (await cc(other, owner, "GET", "/config")).data;
    assert.equal(g.keys.resend.readable, false); assert.equal(g.key.source, "worker_secret"); assert.equal(g.key.stored_unreadable, true);
    r = await cc(env, owner, "PUT", "/config", { clear_key: true }); assert.equal(r.data.config.key.source, "worker_secret");
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM cc_secrets")[0].n, 0);
    r = await cc(env, owner, "PUT", "/config", { enabled: 1 }); assert.equal(r.data.unchanged, true);
  });
  test("GET templates: every registry row with overrides, defaults (★ only) and 30-day counts", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key" }), adm = mkAdm("admin");
    handler = resendOk; await EC.deliver(env, MSG);
    const r = (await cc(env, adm, "GET", "/templates")).data;
    assert.equal(r.items.length, EC.TEMPLATES.length);
    const a = r.items.find(x => x.key === "auth_code"), inv = r.items.find(x => x.key === "invoice_issued");
    assert.deepEqual([a.sent_30d, a.failed_30d, a.required, a.can_off, a.body_editable, a.defaults], [1, 0, true, false, false, null]);
    assert.equal(inv.defaults.subject_ar, "فاتورة اشتراك {{plan_name}} رقم {{invoice_no}}"); assert.equal(inv.body_editable, true);
    for (const k of ["key", "name_ar", "name_en", "group", "list", "required", "vars", "body_editable", "enabled", "overrides", "sent_30d", "failed_30d"]) assert.ok(k in a, k);
    assert.ok(r.groups.billing);
    assert.equal((await cc(env, adm, "GET", "/templates/invoice_issued")).data.item.key, "invoice_issued");
    assert.equal((await cc(env, adm, "PUT", "/templates/invoice_issued", { intro_ar: "مقدمة" })).status, 200);
    const d = await cc(env, adm, "DELETE", "/templates/invoice_issued"); assert.equal(d.status, 200); assert.deepEqual(d.data.item.overrides, {});
    assert.equal(adm.audits.at(-1).after, null);
  });
  test("preview: ‹var› placeholders (no invented data), unsaved draft overrides, the platform footer", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    let p = (await cc(env, adm, "POST", "/preview", { key: "invoice_issued", lang: "ar" })).data;
    assert.equal(p.subject, "فاتورة اشتراك ‹plan_name› رقم ‹invoice_no› / Subscription invoice ‹invoice_no›");
    assert.ok(p.text.includes("الإجمالي ‹total› ‹currency›")); assert.ok(p.text.includes("‹gateway_text›")); assert.ok(p.text.includes("قانون حماية البيانات الشخصية المصري 151/2020"));
    assert.ok(p.html.startsWith('<div dir="auto"')); assert.ok(p.html.includes('<div dir="rtl">'));
    p = (await cc(env, adm, "POST", "/preview", { key: "auth_code", lang: "en", overrides: { subject_en: "{{subject}} — MIG", intro_en: "Hi!" } })).data;
    assert.equal(p.subject, "Your sign-in code: ‹code› — MIG"); assert.ok(p.en.startsWith("Hi!\n\n‹message body written by the platform")); assert.ok(p.html.includes('<div dir="ltr">'));
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM cc_mail_templates")[0].n, 0, "a preview saves nothing");
    p = (await cc(env, adm, "POST", "/preview", { key: "renewal_reminder", lang: "ar" })).data; assert.ok(p.text.includes("Unsubscribe: ‹unsubscribe_url›"));
    p = (await cc(env, adm, "POST", "/preview", { key: "meeting_cancelled", lang: "ar" })).data; assert.ok(!p.text.includes("151/2020"), "advisor / meetings e-mails have no mail() footer");
    assert.equal((await cc(env, adm, "POST", "/preview", { key: "auth_code", overrides: { subject_ar: "{{x}}" } })).data.code, "unknown_var");
    assert.equal((await cc(env, adm, "POST", "/preview", { key: "zzz" })).status, 404);
  });
  test("test send: «[اختبار] / [Test]», only to the admin's own / the platform's mailboxes, 10 per hour, logged as test_email", async () => {
    const env = mkEnv({ RESEND_API_KEY: "re_worker_secret_key", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@gmail.com" }), adm = mkAdm("admin", { email: "Admin.User@gmail.com" });
    handler = resendOk;
    let r = await cc(env, adm, "POST", "/test", {});
    assert.deepEqual([r.status, r.data.ok, r.data.sent, r.data.provider], [200, true, true, "resend"]);
    let b = JSON.parse(calls[0].init.body);
    assert.deepEqual(b.to, ["admin.user@gmail.com"]); assert.equal(b.subject, "[اختبار] / [Test] رسالة تجريبية من لوحة الإدارة / Test message from the admin panel");
    assert.match(b.text, /الإرسال شغال ✓/); assert.match(calls[0].init.headers["Idempotency-Key"], /^test-[2-9a-z]{12}$/);
    r = await cc(env, adm, "POST", "/test", { to: "boss@gmail.com", template: "payment_received", lang: "en" }); assert.equal(r.data.sent, true);
    b = JSON.parse(calls[1].init.body); assert.ok(b.subject.startsWith("[اختبار] / [Test] Payment received — invoice ‹invoice_no›")); assert.match(b.text, /‹plan_until›/);
    for (const to of ["team@madeinegyptgate.com", "info@madeinegyptgate.com"]) assert.equal((await cc(env, adm, "POST", "/test", { to })).status, 200, to);
    r = await cc(env, adm, "POST", "/test", { to: "stranger@example.com" }); assert.deepEqual([r.status, r.data.code], [403, "test_recipient"]);
    assert.equal((await cc(env, adm, "POST", "/test", { to: "x" })).data.code, "invalid_to");
    assert.equal((await cc(env, adm, "POST", "/test", { template: "deal_email" })).data.code, "invalid_template");
    env.DB.db.prepare("INSERT INTO members (id, email, plan, created_at, updated_at) VALUES ('st1', 'editor@outlook.com', 'visitor', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
    env.DB.db.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES ('st1', 'editor', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
    assert.equal((await cc(env, adm, "POST", "/test", { to: "editor@outlook.com" })).status, 200, "active staff");
    for (let i = 0; i < 5; i++) await cc(env, adm, "POST", "/test", {});
    r = await cc(env, adm, "POST", "/test", {}); assert.deepEqual([r.status, r.data.code], [429, "rate_limited"]);
    assert.equal(calls.length, 10);
    const tl = rows(env, "SELECT DISTINCT template FROM cc_mail_log"); assert.deepEqual(tl, [{ template: "test_email" }]);
    assert.equal(adm.audits.filter(a => a.action === "email.test").length, 10);
  });
  test("status + check: read-only GET calls (Resend sending-only key → ok; domain verified; Brevo account); never a POST", async () => {
    const owner = mkAdm("owner");
    let env = mkEnv({ RESEND_API_KEY: "re_sending_only_key_0123" });
    handler = u => (u === "https://api.resend.com/domains" ? Response.json({ statusCode: 401, name: "restricted_api_key", message: "This API key is restricted to only send emails" }, { status: 401 }) : null);
    let r = await cc(env, owner, "POST", "/status/check");
    assert.deepEqual([r.data.ok, r.data.detail, r.data.provider], [true, "key works for sending only", "resend"]);
    assert.equal(calls[0].init.method, "GET"); assert.equal(calls[0].init.headers.Authorization, "Bearer re_sending_only_key_0123");
    const s = (await cc(env, owner, "GET", "/status")).data;
    assert.deepEqual([s.provider, s.key_source, s.domain, s.last_check.ok, s.last_check.detail], ["resend", "worker_secret", "madeinegyptgate.com", true, "key works for sending only"]);
    handler = u => (u === "https://api.resend.com/domains" ? Response.json({ object: "list", data: [{ id: "a1c7", name: "madeinegyptgate.com", status: "verified" }] }) : null);
    assert.equal((await cc(env, owner, "POST", "/status/check")).data.detail, "domain madeinegyptgate.com: verified");
    handler = u => (u === "https://api.resend.com/domains" ? Response.json({ name: "invalid_api_key", message: "API key is invalid" }, { status: 403 }) : null);
    assert.equal((await cc(env, owner, "POST", "/status/check")).data.ok, false);
    env = mkEnv({ BREVO_API_KEY: "xkeysib-brevo-worker-0123456789" }); setMail(env, { "mail.enabled": "1", "mail.provider": "brevo" });
    handler = u => (u === "https://api.brevo.com/v3/account" ? Response.json({ email: "x", companyName: "y" }) : null);
    r = await cc(env, owner, "POST", "/status/check"); assert.deepEqual([r.data.ok, r.data.provider], [true, "brevo"]);
    assert.equal(calls.at(-1).init.headers["api-key"], "xkeysib-brevo-worker-0123456789");
    const n = calls.length; r = await cc(mkEnv(), owner, "POST", "/status/check"); assert.deepEqual([r.data.ok, r.data.detail, calls.length], [false, "no key configured", n]);
    assert.ok(calls.every(c => c.init.method === "GET")); assert.ok(owner.audits.every(a => a.action === "email.status_check"));
  });
  test("CORS: echo only the site origins / CC_ORIGINS; preflight; no-store + nosniff", async () => {
    const env = mkEnv({ CC_ORIGINS: "http://localhost:8780" }), adm = mkAdm("admin");
    for (const [o, want] of [["https://madeinegyptgate.com", "https://madeinegyptgate.com"], ["https://www.madeinegyptgate.com", "https://www.madeinegyptgate.com"], ["http://localhost:8780", "http://localhost:8780"], ["https://evil.example", null], ["null", null]]) {
      const r = await cc(env, adm, "GET", "/status", undefined, { Origin: o });
      assert.equal(r.res.headers.get("Access-Control-Allow-Origin"), want, o);
      assert.equal(r.res.headers.get("Cache-Control"), "no-store"); assert.equal(r.res.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(r.res.headers.get("Vary"), "Origin");
    }
    const p = await EC.handleEmailAdmin(new Request("https://madeinegyptgate.com/api/admin/cc/email/config", { method: "OPTIONS", headers: { Origin: "https://madeinegyptgate.com" } }), env, {}, null);
    assert.equal(p.status, 204); assert.match(p.headers.get("Access-Control-Allow-Methods"), /PUT/);
  });
});

describe("the code's real e-mails (real flows, mocked Resend): every id maps to its template, vars derive from the real subjects", () => {
  test("auth code, routed RFQ (route + receipt + team copy), no-match request (team alert), buyer update, team reply", async () => {
    const env = mkEnv({ ADVISOR_SECRET: "adv-secret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", INBOUND_REPLY_ENABLED: "0" });
    const sent = [];
    handler = (u, init) => { if (u !== "https://api.resend.com/emails") return null; const b = JSON.parse(init.body); sent.push({ id: init.headers["Idempotency-Key"], subject: b.subject, text: b.text, to: b.to[0] }); return Response.json({ id: "re_" + sent.length }); };
    const api = async (method, path, { body, token } = {}) => {
      const p = [], ctx = { waitUntil(x) { p.push(x); } };
      const res = await worker.fetch(new Request("https://madeinegyptgate.com" + path, { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0.9", "User-Agent": "Mozilla/5.0 test", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
      while (p.length) await p.shift();
      let data = null; try { data = await res.clone().json(); } catch (e) { /* html */ } return { status: res.status, data };
    };
    assert.equal((await api("POST", "/api/auth/request", { body: { email: "boss@mig.test" } })).status, 200);
    const code = sent.at(-1).text.match(/\b(\d{6})\b/)[1];
    const admin = (await api("POST", "/api/auth/verify", { body: { email: "boss@mig.test", code } })).data;
    assert.ok(admin && admin.token);
    assert.equal((await api("POST", "/api/admin/members", { token: admin.token, body: { email: "plast@f.test", plan: "basic", company: "Plast Co", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك، جراكن", governorate: "القاهرة" } })).status, 200);
    const rfq = await api("POST", "/api/inquiries", { body: { kind: "rfq", name: "Ahmed Buyer", email: "buyer@buyer.test", phone: "01001234567", company: "Buyer Co", message: "مطلوب براميل بلاستيك 200 لتر", payload: { product: "براميل بلاستيك", quantity: "500", governorate: "CAI" }, source: "form" } });
    assert.equal(rfq.data.status, "routed");
    const nomatch = await api("POST", "/api/inquiries", { body: { kind: "rfq", name: "Mona", email: "mona@buyer.test", phone: "01001234568", company: "M Co", message: "نحتاج رخام جلالة 300 متر", payload: { product: "رخام جلالة", sector: "الرخام والجرانيت", quantity: "300 متر", governorate: "CAI" }, source: "form" } });
    assert.equal(nomatch.data.status, "in_progress");
    const row = env.DB.db.prepare("SELECT * FROM inquiries WHERE ref = ?").get(rfq.data.ref);
    await buyerUpdate(env, asInq({ ...row }), "reply", { from: "Plast Co", body: "متاح، السعر 350 جنيه" });
    await teamReply(env, { ...env.DB.db.prepare("SELECT * FROM inquiries WHERE ref = ?").get(nomatch.data.ref) }, { body: "بنتواصل مع مصانع الرخام وهنرد عليك", channel: "email" });
    const keys = sent.map(s => EC.templateKeyOf({ id: s.id }));
    assert.ok(!keys.includes("other"), JSON.stringify(sent.map(s => s.id)));
    for (const k of ["auth_code", "inquiry_to_factory", "inquiry_receipt", "team_inquiry_notice", "team_needs_alert", "inquiry_update", "team_reply"]) assert.ok(keys.includes(k), k);
    // vars derived from the real subjects / ids (what an admin's {{ref}} {{kind}} {{about}} {{what}} {{status}} turn into)
    const adm = mkAdm("admin");
    const SUBJ = { inquiry_receipt: "{{ref}}|{{kind}}", inquiry_to_factory: "{{ref}}|{{about}}", team_inquiry_notice: "{{ref}}|{{kind}}|{{status}}", team_needs_alert: "{{ref}}|{{kind}}", inquiry_update: "{{ref}}|{{what}}", team_reply: "{{ref}}" };
    for (const [k, s] of Object.entries(SUBJ)) assert.equal((await cc(env, adm, "PUT", "/templates/" + k, { subject_ar: s })).status, 200, k);
    const got = {};
    for (const s of sent) { const k = EC.templateKeyOf({ id: s.id }); if (!SUBJ[k] || got[k]) continue; got[k] = (await EC.prepareMail(env, { id: s.id, to: s.to, lang: "ar", subject: s.subject, ar: s.text, en: s.text })).subject; }
    const R = rfq.data.ref, N = nomatch.data.ref;
    assert.equal(got.inquiry_receipt, `${R}|طلب عرض سعر`);
    assert.match(got.inquiry_to_factory, new RegExp(`^${R}\\|براميل بلاستيك`));
    assert.equal(got.team_inquiry_notice, `${R}|طلب عرض سعر|routed`);
    assert.equal(got.team_needs_alert, `${N}|طلب عرض سعر`);
    assert.equal(got.inquiry_update, `${R}|رد جديد`);
    assert.equal(got.team_reply, N);
  });
});
