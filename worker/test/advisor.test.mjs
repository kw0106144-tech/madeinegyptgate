// node --test for the AI Deal Advisor API (worker/src/advisor.js) — run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleAdvisor, handleEmail, signToken } from "../src/advisor.js";
import worker from "../src/index.js";
import { D1, call, fakeEmail } from "./helpers.mjs";

const SECRET = "test-secret-123";
const PKEY = "platform-key-xyz";
const H = handleAdvisor;
// open mode (no PLATFORM_KEY) is for local testing only and must be switched on explicitly (fails closed otherwise)
// INBOUND_REPLY_ENABLED=1: these tests cover the reply-by-email loop (deal-<id>@reply…); the launch default (Email Routing off →
// Reply-To = the member's own mailbox) is tested in integ-worker.test.mjs
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: SECRET, ADVISOR_OPEN_MODE: "1", INBOUND_REPLY_ENABLED: "1", ...(extra || {}) });
async function session(env, body, headers) {
  return call(H, env, "/session", { method: "POST", body, headers: headers || (env.PLATFORM_KEY ? { "X-Platform-Key": env.PLATFORM_KEY } : {}) });
}
async function login(env, id, plan = "partner", email = id + "@member.test") {
  const r = await session(env, { member_id: id, company: "Company " + id, email, plan });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}
const OPP = { ref: "INTL-GULF-001", title: "Supply of PVC pipes", entity: "Water Authority", market: "gulf", country: "Saudi Arabia", source_url: "https://example.org/t/1", closing_date: "2026-12-30", kind: "gov" };

describe("health", () => {
  test("no DB binding → store none, ok false; other endpoints 503", async () => {
    const r = await call(H, {}, "/health");
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.ok, r.data.store, r.data.email], [false, "none", false]);
    const d = await call(H, {}, "/deals");
    assert.equal(d.status, 503);
    assert.equal(d.data.error, "store not configured");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  });
  test("DB + secret → ok, store d1; email true when a provider is set", async () => {
    let r = await call(H, env0(), "/health");
    assert.deepEqual([r.data.ok, r.data.store, r.data.email, r.data.mode], [true, "d1", false, "open"]);
    r = await call(H, env0({ RESEND_API_KEY: "re_x", PLATFORM_KEY: PKEY }), "/health");
    assert.deepEqual([r.data.ok, r.data.email, r.data.mode], [true, true, "platform"]);
  });
  test("no PLATFORM_KEY and no ADVISOR_OPEN_MODE → fails closed: /session 503, health says sessions come from activation / the platform login", async () => {
    const env = { DB: new D1(), ADVISOR_SECRET: SECRET };
    const r = await call(H, env, "/session", { method: "POST", body: { member_id: "evil-1", email: "attacker@evil.test", plan: "strategic" } });
    assert.deepEqual([r.status, r.data.code], [503, "platform_off"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first("n"), 0);
    const h = await call(H, env, "/health");
    assert.deepEqual([h.data.mode, h.data.login, h.data.platform_key], ["platform", "activation", false]);
  });
  test("CORS preflight", async () => {
    const res = await H(new Request("https://madeinegyptgate.com/api/advisor/deals", { method: "OPTIONS" }), env0());
    assert.equal(res.status, 204);
    assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  });
});

describe("session", () => {
  test("partner and strategic accepted, basic/premium rejected", async () => {
    const env = env0();
    const a = await session(env, { member_id: "m1", company: "Nile Plast", email: "owner@nileplast.test", plan: "partner" });
    assert.equal(a.status, 200);
    assert.match(a.data.token, /^v1\./);
    assert.deepEqual(a.data.member.markets, ["local", "gulf", "africa"]);
    const s = await session(env, { member_id: "m2", plan: "strategic" });
    assert.equal(s.status, 200);
    assert.equal(s.data.member.markets.length, 5);
    for (const plan of ["basic", "premium", "profile", ""]) {
      const r = await session(env, { member_id: "m3", plan });
      assert.equal(r.status, 403, plan);
      assert.equal(r.data.error, "plan not eligible");
    }
    assert.equal((await session(env, { member_id: "", plan: "partner" })).status, 400);
    assert.equal((await session(env, { member_id: "x", plan: "partner", email: "nope" })).status, 400);
  });
  test("PLATFORM_KEY set → X-Platform-Key required; downgrade revokes tokens", async () => {
    const env = env0({ PLATFORM_KEY: PKEY });
    assert.equal((await session(env, { member_id: "m1", plan: "partner" }, {})).status, 401);
    assert.equal((await session(env, { member_id: "m1", plan: "partner" }, { "X-Platform-Key": "wrong" })).status, 401);
    const tok = await login(env, "m1");
    assert.equal((await call(H, env, "/deals", { token: tok })).status, 200);
    assert.equal((await session(env, { member_id: "m1", plan: "basic" })).status, 403); // platform says: now on basic
    assert.equal((await call(H, env, "/deals", { token: tok })).status, 401);
  });
  test("open mode: an existing member cannot be taken over; renewal with own token works", async () => {
    const env = env0();
    const tok = await login(env, "m1");
    assert.equal((await session(env, { member_id: "m1", plan: "partner" })).status, 409);
    const r = await call(H, env, "/session", { method: "POST", token: tok, body: { member_id: "m1", plan: "strategic", company: "Renewed" } });
    assert.equal(r.status, 200);
    assert.equal(r.data.member.plan, "strategic");
  });
  test("bad / tampered / expired tokens → 401", async () => {
    const env = env0();
    const tok = await login(env, "m1");
    assert.equal((await call(H, env, "/deals")).status, 401);
    assert.equal((await call(H, env, "/deals", { token: tok.slice(0, -2) + "xx" })).status, 401);
    const forged = await signToken("other-secret", "m1", "partner", Math.floor(Date.now() / 1000) + 99);
    assert.equal((await call(H, env, "/deals", { token: forged })).status, 401);
    const expired = await signToken(SECRET, "m1", "partner", Math.floor(Date.now() / 1000) - 5);
    assert.equal((await call(H, env, "/deals", { token: expired })).status, 401);
  });
});

describe("deals", () => {
  test("CRUD + isolation between two members", async () => {
    const env = env0();
    const A = await login(env, "alpha"), B = await login(env, "beta");
    const c = await call(H, env, "/deals", { method: "POST", token: A, body: { opportunity: OPP, notes: "first look" } });
    assert.equal(c.status, 201);
    const deal = c.data.deal;
    assert.match(deal.id, /^[a-f0-9]{16}$/);
    assert.equal(deal.stage, "discover");
    assert.equal(deal.title, OPP.title);
    assert.equal(deal.opportunity.source_url, OPP.source_url);
    assert.equal(deal.reply_to, `deal-${deal.id}@reply.madeinegyptgate.com`);
    // same ref again → existing deal returned, not duplicated
    const again = await call(H, env, "/deals", { method: "POST", token: A, body: { opportunity: OPP } });
    assert.equal(again.data.existing, true);
    assert.equal(again.data.deal.id, deal.id);
    // a different tender that shares the ref (or has a trivial/empty ref) gets its own deal
    const other = await call(H, env, "/deals", { method: "POST", token: A, body: { opportunity: { ...OPP, title: OPP.title + " – lot 2", source_url: OPP.source_url + "#2" } } });
    assert.equal(other.status, 201);
    assert.notEqual(other.data.deal.id, deal.id);
    const t1 = await call(H, env, "/deals", { method: "POST", token: A, body: { opportunity: { ...OPP, ref: "1", title: "Tender one" } } });
    const t2 = await call(H, env, "/deals", { method: "POST", token: A, body: { opportunity: { ...OPP, ref: "1", title: "Tender one" } } });
    assert.equal(t1.status, 201); assert.equal(t2.status, 201); assert.notEqual(t1.data.deal.id, t2.data.deal.id);
    for (const x of [other, t1, t2]) assert.equal((await call(H, env, "/deals/" + x.data.deal.id, { method: "DELETE", token: A })).status, 200);

    assert.equal((await call(H, env, "/deals", { token: A })).data.deals.length, 1);
    assert.equal((await call(H, env, "/deals", { token: B })).data.deals.length, 0);
    assert.equal((await call(H, env, "/deals/" + deal.id, { token: B })).status, 404);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: B, body: { stage: "lost" } })).status, 404);
    assert.equal((await call(H, env, "/deals/" + deal.id + "/messages", { token: B })).status, 404);
    assert.equal((await call(H, env, "/deals/" + deal.id + "/email", { method: "POST", token: B, body: { to: "x@y.com", subject: "s", body: "b" } })).status, 404);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "DELETE", token: B })).status, 404);

    const p = await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: A, body: { stage: "offer", next_action: "Send price list", due_date: "2026-12-01", contact_name: "Procurement", value: "250000 SAR" } });
    assert.equal(p.status, 200);
    assert.deepEqual([p.data.deal.stage, p.data.deal.next_action, p.data.deal.due_date, p.data.deal.value], ["offer", "Send price list", "2026-12-01", "250000 SAR"]);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: A, body: { stage: "maybe" } })).status, 400);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: A, body: { due_date: "tomorrow" } })).status, 400);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: A, body: { contact_email: "bad" } })).status, 400);
    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "PATCH", token: A, body: { member_id: "beta" } })).status, 400);

    const show = await call(H, env, "/deals/" + deal.id, { token: A });
    assert.ok(show.data.events.some(e => e.type === "stage_changed" && e.data.to === "offer"));

    assert.equal((await call(H, env, "/deals/" + deal.id, { method: "DELETE", token: A })).data.ok, true);
    assert.equal((await call(H, env, "/deals", { token: A })).data.deals.length, 0);
  });
  test("plan markets: partner cannot track asia/europe, strategic can; validation", async () => {
    const env = env0();
    const P = await login(env, "p1", "partner"), S = await login(env, "s1", "strategic");
    const asia = { ...OPP, ref: "A-1", market: "asia" };
    const r = await call(H, env, "/deals", { method: "POST", token: P, body: { opportunity: asia } });
    assert.equal(r.status, 403);
    assert.equal(r.data.error, "market not in plan");
    assert.equal((await call(H, env, "/deals", { method: "POST", token: S, body: { opportunity: asia } })).status, 201);
    assert.equal((await call(H, env, "/deals", { method: "POST", token: S, body: { opportunity: { title: "x", market: "mars" } } })).status, 400);
    assert.equal((await call(H, env, "/deals", { method: "POST", token: S, body: { opportunity: {} } })).status, 400);
    assert.equal((await call(H, env, "/deals", { method: "POST", token: S, body: "{oops" })).status, 400);
    const js = await call(H, env, "/deals", { method: "POST", token: S, body: { opportunity: { title: "t", market: "local", source_url: "javascript:alert(1)" } } });
    assert.equal(js.data.deal.source_url, "");
  });
});

describe("email", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  async function newDeal(env, tok) { return (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal; }
  const MAIL = { to: "buyer@authority.example", subject: "Offer for PVC pipes — INTL-GULF-001", body: "Dear team,\nPlease find our offer.\n<script>x</script>" };

  test("no provider → stored as draft, sent:false, error 'email not configured'", async () => {
    const env = env0();
    const tok = await login(env, "m1");
    const d = await newDeal(env, tok);
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL });
    assert.equal(r.status, 200);
    assert.equal(r.data.sent, false);
    assert.equal(r.data.error, "email not configured");
    assert.equal(r.data.message.direction, "out");
    assert.equal(r.data.message.status, "draft");
    const t = await call(H, env, `/deals/${d.id}/messages`, { token: tok });
    assert.equal(t.data.messages.length, 1);
    assert.equal(t.data.messages[0].subject, MAIL.subject);
    assert.equal(r.data.deal.stage, "discover"); // not sent → stage unchanged
    assert.equal(r.data.deal.contact_email, "buyer@authority.example");
  });

  test("Resend: exact request shape, reply-to deal address, member cc'd, stage → contact", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_test_key" });
    const tok = await login(env, "m1", "partner", "owner@nileplast.test");
    const d = await newDeal(env, tok);
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), { status: 200, headers: { "Content-Type": "application/json" } }); };
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { ...MAIL, cc: "partner@nileplast.test" } });
    assert.equal(r.status, 200);
    assert.equal(r.data.sent, true);
    assert.equal(r.data.message.status, "sent");
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.url, "https://api.resend.com/emails");
    assert.equal(c.init.method, "POST");
    assert.equal(c.init.headers.Authorization, "Bearer re_test_key");
    assert.ok(c.init.headers["Idempotency-Key"]);
    assert.equal(c.body.from, "Company m1 via Made in Egypt Gate <noreply@madeinegyptgate.com>");
    assert.deepEqual(c.body.to, ["buyer@authority.example"]);
    assert.deepEqual(c.body.cc, ["partner@nileplast.test", "owner@nileplast.test"]);
    assert.equal(c.body.reply_to, `deal-${d.id}@reply.madeinegyptgate.com`);
    assert.equal(c.body.subject, MAIL.subject);
    assert.match(c.body.text, /Please find our offer/);
    assert.match(c.body.html, /&lt;script&gt;/);           // HTML-escaped
    assert.doesNotMatch(c.body.html, /<script>/);
    assert.equal(r.data.deal.stage, "contact");
  });

  test("Resend error → sent:false, status failed, error kept", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_bad" });
    const tok = await login(env, "m1");
    const d = await newDeal(env, tok);
    globalThis.fetch = async () => new Response(JSON.stringify({ statusCode: 403, name: "validation_error", message: "The domain is not verified." }), { status: 403 });
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL });
    assert.equal(r.data.sent, false);
    assert.equal(r.data.message.status, "failed");
    assert.match(r.data.error, /resend 403: The domain is not verified/);
  });

  test("Cloudflare SEND_EMAIL binding used when no Resend key", async () => {
    const sent = [];
    const env = env0({ PLATFORM_KEY: PKEY, SEND_EMAIL: { async send(m) { sent.push(m); return { messageId: "cf-1" }; } } });
    const tok = await login(env, "m1");
    const d = await newDeal(env, tok);
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL });
    assert.equal(r.data.sent, true);
    assert.deepEqual(sent[0].from, { email: "noreply@madeinegyptgate.com", name: "Company m1 via Made in Egypt Gate" });
    assert.equal(sent[0].replyTo, `deal-${d.id}@reply.madeinegyptgate.com`);
  });

  test("open mode (no PLATFORM_KEY): unverified member is never sent through the provider", async () => {
    const env = env0({ RESEND_API_KEY: "re_x" });
    const tok = await login(env, "m1");
    const d = await newDeal(env, tok);
    globalThis.fetch = async () => { throw new Error("must not be called"); };
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL });
    assert.equal(r.data.sent, false);
    assert.equal(r.data.message.status, "draft");
    assert.match(r.data.error, /not verified/);
  });

  test("validation + daily limit", async () => {
    const env = env0({ MAX_EMAILS_PER_DAY: "2" });
    const tok = await login(env, "m1");
    const d = await newDeal(env, tok);
    const send = b => call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: b });
    assert.equal((await send({ ...MAIL, to: "not-an-email" })).status, 400);
    assert.equal((await send({ ...MAIL, to: "a@b.com\r\nBcc: x@y.com" })).status, 400);
    assert.equal((await send({ ...MAIL, subject: "" })).status, 400);
    assert.equal((await send({ ...MAIL, body: "x".repeat(20001) })).status, 413);
    assert.equal((await send({ ...MAIL, to: ["a@b.com", "c@d.com", "e@f.com", "g@h.com", "i@j.com", "k@l.com"] })).status, 400);
    const injected = await send({ ...MAIL, subject: "Hi\r\nBcc: evil@x.com" });
    assert.equal(injected.data.message.subject, "Hi Bcc: evil@x.com"); // folded to one line, no header injection
    assert.equal((await send(MAIL)).status, 200);
    const third = await send(MAIL);
    assert.equal(third.status, 429);
    assert.equal(third.data.limit, 2);
  });
});

describe("inbound email", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  const b64 = s => Buffer.from(s, "utf8").toString("base64");
  const RAW = to => [
    "From: Procurement Dept <tenders@authority.example>",
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64("رد: عرض أنابيب PVC")}?=`,
    "Message-ID: <abc123@authority.example>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64("شكرًا لعرضكم. برجاء إرسال شهادة المنشأ.\nThank you, please send the certificate of origin."),
    "--b1",
    "Content-Type: text/html; charset=UTF-8",
    "",
    "<p>Thank you</p>",
    "--b1--",
    "",
  ].join("\r\n");

  async function setup(extra) {
    const env = env0(extra);
    const tok = await login(env, "m1", "partner", "owner@nileplast.test");
    const deal = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    return { env, tok, deal };
  }

  test("reply to deal-<id>@reply… is parsed (Arabic, base64, multipart), stored as 'in' and forwarded to the member", async () => {
    const { env, tok, deal } = await setup();
    const msg = fakeEmail({ from: "tenders@authority.example", to: deal.reply_to, raw: RAW(deal.reply_to) });
    await worker.email(msg, env, {}); // through index.js's email() export
    assert.equal(msg.rejected, null);
    const t = await call(H, env, `/deals/${deal.id}/messages`, { token: tok });
    assert.equal(t.data.messages.length, 1);
    const m = t.data.messages[0];
    assert.equal(m.direction, "in");
    assert.equal(m.from, "Procurement Dept <tenders@authority.example>");
    assert.equal(m.subject, "رد: عرض أنابيب PVC");
    assert.match(m.body, /شهادة المنشأ/);
    assert.match(m.body, /certificate of origin/);
    assert.deepEqual(msg.forwarded, [{ rcpt: "owner@nileplast.test", deal: deal.id }]);
    const show = await call(H, env, "/deals/" + deal.id, { token: tok });
    assert.ok(show.data.events.some(e => e.type === "reply_received"));
    // INBOUND_AUTHSERV_ID not set → nothing is trusted: shown with envelope + warning, never becomes the deal contact
    assert.equal(m.sender_verified, false);
    assert.equal(m.envelope_from, "tenders@authority.example");
    assert.ok(m.sender_warning && m.sender_warning.en);
    assert.equal(show.data.deal.contact_email, "");
  });

  test("with a provider and a verified member → notification email instead of forward", async () => {
    const { env, deal } = await setup({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response('{"id":"n1"}', { status: 200 }); };
    const msg = fakeEmail({ from: "tenders@authority.example", to: deal.reply_to, raw: RAW(deal.reply_to) });
    const r = await handleEmail(msg, env, {});
    assert.equal(r.copied, "notified");
    assert.deepEqual(calls[0].to, ["owner@nileplast.test"]);
    assert.match(calls[0].text, /advisor\.html#deal=/);
    assert.equal(msg.forwarded.length, 0);
  });

  test("unknown deal / foreign domain → rejected, nothing stored", async () => {
    const { env } = await setup();
    const a = fakeEmail({ from: "x@y.com", to: "deal-0000000000000000@reply.madeinegyptgate.com", raw: RAW("x") });
    await handleEmail(a, env, {});
    assert.ok(a.rejected);
    const b = fakeEmail({ from: "x@y.com", to: "info@madeinegyptgate.com", raw: RAW("x") });
    await handleEmail(b, env, {});
    assert.ok(b.rejected);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages").first();
    assert.equal(n.n, 0);
  });
});

describe("index.js routing", () => {
  test("/api/advisor/* goes to the advisor, /api/janna/* unchanged, email export present", async () => {
    const a = await worker.fetch(new Request("https://madeinegyptgate.com/api/advisor/health"), {}, {});
    assert.equal((await a.json()).store, "none");
    const j = await worker.fetch(new Request("https://madeinegyptgate.com/api/janna/health"), {}, {});
    const jj = await j.json();
    assert.equal(jj.ok, true);
    assert.ok(jj.factories > 0);
    const l = await worker.fetch(new Request("https://madeinegyptgate.com/api/janna/lookup?section=tenders&query=%D8%AD%D8%A7%D8%B3%D8%A8"), {}, {});
    assert.equal(l.status, 200);
    assert.equal(typeof worker.email, "function");
  });
});

/* ===================== fixes: activation handoff, sender checks, market, input types, recipients, downgrade ===================== */
const okFetch = calls => async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"id":"x1"}', { status: 200 }); };
const codeOf = url => (String(url).match(/#login=([a-f0-9]{48})$/) || [])[1];

describe("fix 1 — activation link handoff (platform mode)", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });
  const ACT = { member_id: "m-100", company: "Delta Cables", email: "owner@deltacables.test", plan: "strategic" };

  test("health tells the page to wait for activation; browser /session is refused with login:'activation'", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    const h = await call(H, env, "/health");
    assert.deepEqual([h.data.ok, h.data.mode, h.data.login, h.data.email_login, h.data.sending], [true, "platform", "activation", true, "platform"]);
    const s = await session(env, { member_id: "x", plan: "strategic" }, {});
    assert.equal(s.status, 401); assert.equal(s.data.login, "activation");
    const d = await call(H, env, "/deals", { token: "nope" });
    assert.equal(d.status, 401); assert.equal(d.data.login, "activation");
    const o = await call(H, env0(), "/health");
    assert.deepEqual([o.data.mode, o.data.login, o.data.sending], ["open", "self", "drafts"]);
  });

  test("activation needs the platform key; link emailed to the member; code → token → real send", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    assert.equal((await call(H, env0(), "/activation", { method: "POST", body: ACT })).status, 503); // no PLATFORM_KEY configured
    assert.equal((await call(H, env, "/activation", { method: "POST", body: ACT })).status, 401);
    assert.equal((await call(H, env, "/activation", { method: "POST", body: ACT, headers: { "X-Platform-Key": "wrong" } })).status, 401);
    assert.equal((await call(H, env, "/activation", { method: "POST", body: { ...ACT, plan: "premium" }, headers: { "X-Platform-Key": PKEY } })).status, 403);
    const calls = []; globalThis.fetch = okFetch(calls);
    const a = await call(H, env, "/activation", { method: "POST", body: ACT, headers: { "X-Platform-Key": PKEY } });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.equal(a.data.emailed, true);
    assert.deepEqual(a.data.member.markets.length, 5);
    const code = codeOf(a.data.activation_url);
    assert.ok(code, a.data.activation_url);
    assert.match(a.data.activation_url, /^https:\/\/madeinegyptgate\.com\/advisor\.html#login=/);
    assert.deepEqual(calls[0].body.to, ["owner@deltacables.test"]);
    assert.ok(calls[0].body.text.includes(a.data.activation_url));
    const row = await env.DB.prepare("SELECT code_hash FROM logins").first();
    assert.notEqual(row.code_hash, code); // only the hash is stored

    assert.equal((await call(H, env, "/login", { method: "POST", body: { code: "f".repeat(48) } })).status, 401);
    const l = await call(H, env, "/login", { method: "POST", body: { code } });
    assert.equal(l.status, 200, JSON.stringify(l.data));
    assert.deepEqual([l.data.member.id, l.data.member.plan, l.data.member.verified], ["m-100", "strategic", true]);
    assert.equal((await call(H, env, "/login", { method: "POST", body: { code } })).status, 401); // single use

    const tok = l.data.token;
    const deal = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    calls.length = 0;
    const e = await call(H, env, `/deals/${deal.id}/email`, { method: "POST", token: tok, body: { to: "buyer@authority.example", subject: "Offer", body: "Hello" } });
    assert.equal(e.data.sent, true, JSON.stringify(e.data));
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.text, /unsubscribe/);
    assert.match(calls[0].body.text, /info@madeinegyptgate\.com/); // the platform mailbox that exists (support@ does not)
    assert.equal(calls[0].body.headers["List-Unsubscribe"], `<mailto:deal-${deal.id}@reply.madeinegyptgate.com?subject=unsubscribe>`);

    const r = await call(H, env, "/refresh", { method: "POST", token: tok });
    assert.equal(r.status, 200); assert.match(r.data.token, /^v1\./);
  });

  test("expired or downgraded links stop working", async () => {
    const env = env0({ PLATFORM_KEY: PKEY });
    const a = await call(H, env, "/activation", { method: "POST", body: ACT, headers: { "X-Platform-Key": PKEY } });
    assert.equal(a.data.emailed, false); assert.equal(a.data.email_error, "email not configured"); // admin sends the link by hand
    const code = codeOf(a.data.activation_url);
    await call(H, env, "/activation", { method: "POST", body: { ...ACT, plan: "basic" }, headers: { "X-Platform-Key": PKEY } });
    assert.equal((await call(H, env, "/login", { method: "POST", body: { code } })).status, 403);
    const b = await call(H, env, "/activation", { method: "POST", body: ACT, headers: { "X-Platform-Key": PKEY } });
    await env.DB.prepare("UPDATE logins SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    assert.equal((await call(H, env, "/login", { method: "POST", body: { code: codeOf(b.data.activation_url) } })).status, 401);
  });

  test("email login link: only to an active verified member's own address, same answer for strangers, 3 per hour", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    const calls = []; globalThis.fetch = okFetch(calls);
    await call(H, env, "/activation", { method: "POST", body: { ...ACT, send_email: false }, headers: { "X-Platform-Key": PKEY } });
    assert.equal(calls.length, 0);
    const stranger = await call(H, env, "/login/email", { method: "POST", body: { email: "someone@else.test" } });
    assert.deepEqual([stranger.status, stranger.data.ok, calls.length], [200, true, 0]);
    for (let i = 0; i < 5; i++) assert.equal((await call(H, env, "/login/email", { method: "POST", body: { email: "OWNER@deltacables.test" } })).data.ok, true);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].body.to, ["owner@deltacables.test"]);
    const l = await call(H, env, "/login", { method: "POST", body: { code: codeOf(calls[0].body.text.match(/https:\S+#login=[a-f0-9]{48}/)[0]) } });
    assert.equal(l.status, 200);
    // open mode members (unverified) never get links
    const envO = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    await envO.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at) VALUES ('u1', 'U', 'u@u.test', 'partner', 0, '', '')").run();
    calls.length = 0;
    await call(H, envO, "/login/email", { method: "POST", body: { email: "u@u.test" } });
    assert.equal(calls.length, 0);
  });
});

describe("fix 2 — inbound sender verification + rate limits", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });
  const SPOOF = (to, extra = []) => [...extra, 'From: "Ministry of Health" <procurement@moh.gov.sa>', `To: ${to}`, "Subject: Award notice - pay fee", "Content-Type: text/plain; charset=UTF-8", "", "Please wire the bid fee to IBAN XX", ""].join("\r\n");
  async function setup(extra) {
    const env = env0({ PLATFORM_KEY: PKEY, ...(extra || {}) });
    const tok = await login(env, "m1", "partner", "owner@nileplast.test");
    const deal = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    return { env, tok, deal };
  }

  test("spoofed From: envelope sender stored and shown, labelled unverified, warning in the member's notification", async () => {
    const { env, tok, deal } = await setup({ RESEND_API_KEY: "re_k" });
    const calls = []; globalThis.fetch = okFetch(calls);
    // a forged Authentication-Results is ignored while INBOUND_AUTHSERV_ID is not configured
    const msg = fakeEmail({ from: "attacker@evil.test", to: deal.reply_to, raw: SPOOF(deal.reply_to, ["Authentication-Results: mx.cloudflare.net; dmarc=pass header.from=moh.gov.sa"]) });
    const r = await handleEmail(msg, env, {});
    assert.deepEqual([r.stored, r.sender_verified, r.copied], [true, false, "notified"]);
    const m = (await call(H, env, `/deals/${deal.id}/messages`, { token: tok })).data.messages[0];
    assert.equal(m.from, "Ministry of Health <procurement@moh.gov.sa>");
    assert.equal(m.envelope_from, "attacker@evil.test");
    assert.equal(m.sender_verified, false);
    assert.equal(m.sender_auth, "not checked");
    assert.match(m.sender_warning.ar, /غير موثّق/);
    assert.match(calls[0].body.subject, /Unverified/);
    assert.match(calls[0].body.text, /Envelope sender[^\n]*attacker@evil\.test/);
    assert.match(calls[0].body.text, /unverified sender/);
    assert.equal((await call(H, env, "/deals/" + deal.id, { token: tok })).data.deal.contact_email, "");
  });

  test("trusted topmost Authentication-Results with DMARC pass for the From domain → verified; anything else is not", async () => {
    const { env, tok, deal } = await setup({ INBOUND_AUTHSERV_ID: "mx.cloudflare.net" });
    const AR = v => "Authentication-Results: " + v;
    const send = async extra => { const msg = fakeEmail({ from: "procurement@moh.gov.sa", to: deal.reply_to, raw: SPOOF(deal.reply_to, extra) }); return handleEmail(msg, env, {}); };
    assert.equal((await send([AR("mx.cloudflare.net; dkim=pass header.d=moh.gov.sa; dmarc=pass (p=REJECT) header.from=moh.gov.sa; spf=pass smtp.mailfrom=moh.gov.sa")])).sender_verified, true);
    // a forged header below the receiver's own (topmost) one does not count
    assert.equal((await send([AR("mx.cloudflare.net; dmarc=fail header.from=moh.gov.sa"), AR("mx.cloudflare.net; dmarc=pass header.from=moh.gov.sa")])).sender_verified, false);
    // untrusted authserv-id, DMARC for another domain, no header at all
    assert.equal((await send([AR("evil.example; dmarc=pass header.from=moh.gov.sa")])).sender_verified, false);
    assert.equal((await send([AR("mx.cloudflare.net; dmarc=pass header.from=evil.test")])).sender_verified, false);
    assert.equal((await send([])).sender_verified, false);
    // ARC variant
    assert.equal((await send(["ARC-Authentication-Results: i=1; mx.cloudflare.net; dmarc=pass header.from=moh.gov.sa"])).sender_verified, true);
    const ms = (await call(H, env, `/deals/${deal.id}/messages`, { token: tok })).data.messages;
    assert.equal(ms[0].sender_auth, "dmarc=pass spf=pass dkim=pass (mx.cloudflare.net)");
    assert.equal((await call(H, env, "/deals/" + deal.id, { token: tok })).data.deal.contact_email, "procurement@moh.gov.sa"); // verified only
  });

  test("per-deal inbound cap rejects floods; member notifications throttled per hour", async () => {
    const { env, deal } = await setup({ RESEND_API_KEY: "re_k", MAX_INBOUND_PER_DEAL_DAY: "6" });
    const calls = []; globalThis.fetch = okFetch(calls);
    const out = [];
    for (let i = 0; i < 7; i++) { const msg = fakeEmail({ from: "x@y.test", to: deal.reply_to, raw: SPOOF(deal.reply_to) }); out.push({ r: await handleEmail(msg, env, {}), rejected: msg.rejected }); }
    assert.deepEqual(out.map(o => o.r.copied || o.r.reason), ["notified", "notified", "notified", "throttled", "throttled", "throttled", "rate limited"]);
    assert.ok(out[6].rejected);
    assert.equal(calls.length, 3);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE direction = 'in'").first();
    assert.equal(n.n, 6);
  });
});

describe("fix 3 — market is required and checked", () => {
  test("partner: empty market → 400 (was 201), asia → 403; email blocked for a deal outside the current plan", async () => {
    const env = env0({ PLATFORM_KEY: PKEY });
    const P = await login(env, "p1", "partner");
    const e = await call(H, env, "/deals", { method: "POST", token: P, body: { opportunity: { ref: "A1", title: "Asia tender", market: "" } } });
    assert.equal(e.status, 400); assert.equal(e.data.error, "opportunity.market required");
    assert.equal((await call(H, env, "/deals", { method: "POST", token: P, body: { opportunity: { ref: "A1", title: "Asia tender" } } })).status, 400);
    assert.equal((await call(H, env, "/deals", { method: "POST", token: P, body: { opportunity: { ref: "A1", title: "Asia tender", market: "asia" } } })).status, 403);
    // strategic tracks an asia deal, then is downgraded to partner → may no longer email from it
    const S = await login(env, "s1", "strategic");
    const d = (await call(H, env, "/deals", { method: "POST", token: S, body: { opportunity: { ...OPP, market: "asia" } } })).data.deal;
    const S2 = await login(env, "s1", "partner");
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: S2, body: { to: "a@b.com", subject: "s", body: "b" } });
    assert.equal(r.status, 403); assert.equal(r.data.error, "market not in plan");
  });
});

describe("fix 4 — non-string values → 400, never 500", () => {
  test("to/cc/subject/body objects", async () => {
    const env = env0();
    const tok = await login(env, "m1");
    const d = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    const send = b => call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: b });
    for (const b of [{ to: [{ toString: 1 }], subject: "s", body: "b" }, { to: { toString: 1 }, subject: "s", body: "b" }, { to: "a@b.com", cc: [{ toString: 1 }], subject: "s", body: "b" }, { to: ["a@b.com", 5], subject: "s", body: "b" }, { to: "a@b.com", subject: { toString: 1 }, body: "b" }, { to: "a@b.com", subject: "s", body: { toString: 1 } }]) {
      const r = await send(b);
      assert.equal(r.status, 400, JSON.stringify(b) + " → " + JSON.stringify(r.data));
    }
    assert.equal((await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { title: { toString: 1 }, ref: [1], market: "gulf" } } })).status, 400);
    assert.equal((await call(H, env, "/deals/" + d.id, { method: "PATCH", token: tok, body: { notes: { toString: 1 }, stage: ["x"] } })).status, 400);
    assert.equal((await session(env, { member_id: { toString: 1 }, plan: "partner" })).status, 400);
  });
});

describe("fix 5 — new-recipient cap and opt-out", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  test("at most MAX_NEW_RECIPIENTS_PER_DAY new external addresses per 24 h; known ones and the member's own address are free", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    const calls = []; globalThis.fetch = okFetch(calls);
    const tok = await login(env, "m1", "partner", "owner@nileplast.test");
    const d = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    const send = (to, cc) => call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { to, cc, subject: "s", body: "b" } });
    const batch = i => [1, 2, 3, 4].map(k => `r${i}-${k}@ext${i}.test`);
    assert.equal((await send(batch(1))).data.sent, true);
    assert.equal((await send(batch(2), "owner@nileplast.test")).data.sent, true); // member's own address is not "new"
    const third = await send(batch(3));
    assert.equal(third.status, 429); assert.equal(third.data.error, "new recipient limit reached");
    assert.deepEqual([third.data.limit, third.data.remaining], [10, 2]);
    assert.equal((await send(batch(1).concat(batch(2)[0]))).data.sent, true);         // already contacted → allowed
    assert.equal((await send(["n1@x.test", "n2@x.test"])).data.sent, true);           // fills the cap exactly (10)
    assert.equal((await send("n3@x.test")).status, 429);
    const distinct = new Set(calls.flatMap(c => [...c.body.to, ...(c.body.cc || [])]));
    distinct.delete("owner@nileplast.test");
    assert.equal(distinct.size, 10);
    // drafts (nothing sent) do not use up the allowance
    const env2 = env0({ MAX_NEW_RECIPIENTS_PER_DAY: "2" });
    const t2 = await login(env2, "m2");
    const d2 = (await call(H, env2, "/deals", { method: "POST", token: t2, body: { opportunity: OPP } })).data.deal;
    for (let i = 0; i < 3; i++) assert.equal((await call(H, env2, `/deals/${d2.id}/email`, { method: "POST", token: t2, body: { to: ["a@a.test", "b@b.test"], subject: "s", body: "b" } })).status, 200);
  });

  test("a recipient who replies 'unsubscribe' cannot be emailed again by that member", async () => {
    const env = env0({ PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_k" });
    const calls = []; globalThis.fetch = okFetch(calls);
    const tok = await login(env, "m1", "partner", "owner@nileplast.test");
    const d = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
    assert.equal((await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { to: "buyer@authority.example", subject: "s", body: "b" } })).data.sent, true);
    // forged opt-out (envelope ≠ From) is not honoured
    const raw = from => [`From: <${from}>`, `To: ${d.reply_to}`, "Subject: unsubscribe", "", "stop", ""].join("\r\n");
    await handleEmail(fakeEmail({ from: "evil@evil.test", to: d.reply_to, raw: raw("buyer@authority.example") }), env, {});
    assert.equal((await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { to: "buyer@authority.example", subject: "s2", body: "b" } })).data.sent, true);
    await handleEmail(fakeEmail({ from: "buyer@authority.example", to: d.reply_to, raw: raw("buyer@authority.example") }), env, {});
    const r = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { to: "buyer@authority.example", subject: "s3", body: "b" } });
    assert.equal(r.status, 403); assert.equal(r.data.error, "recipient opted out");
  });
});

describe("fix 6 — downgraded member: replies kept, nothing emailed or forwarded", () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });
  test("plan basic → stored, copied 'plan_inactive', no provider call, no forward", async () => {
    for (const extra of [{ RESEND_API_KEY: "re_k" }, {}]) {
      const env = env0({ PLATFORM_KEY: PKEY, ...extra });
      const calls = []; globalThis.fetch = okFetch(calls);
      const tok = await login(env, "m1", "partner", "owner@nileplast.test");
      const d = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: OPP } })).data.deal;
      assert.equal((await session(env, { member_id: "m1", plan: "basic" })).status, 403);
      assert.equal((await call(H, env, "/deals", { token: tok })).status, 401);
      const msg = fakeEmail({ from: "b@b.test", to: d.reply_to, raw: ["From: <b@b.test>", `To: ${d.reply_to}`, "Subject: hi", "", "x", ""].join("\r\n") });
      const r = await handleEmail(msg, env, {});
      assert.deepEqual([r.stored, r.copied, calls.length, msg.forwarded.length], [true, "plan_inactive", 0, 0]);
    }
  });
});
