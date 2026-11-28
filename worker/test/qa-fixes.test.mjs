// Regression tests for the Phase A QA findings (journeys / security / honesty audits) — one test per fixed finding.
// Run: cd worker && npm test   (nothing is sent for real: Resend and respond.io are mocked)
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { D1, fakeEmail, waSwitchOn } from "./helpers.mjs";
import { rank } from "../src/matching.js";
import { inquiriesCron, trackUrl } from "../src/inquiries.js";
import { bassemCron } from "../src/whatsapp.js";
import { dailyJobs, items } from "../src/digest.js";
import { cairoToUtc } from "../src/meetings.js";
import { sha256 } from "../src/common.js";
import DATA from "../src/data.json";

const SITE = "https://madeinegyptgate.com";
let sent, wa, turnstile, realFetch;
function mockFetch({ resendFail = false } = {}) {
  sent = []; wa = []; turnstile = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com/")) {
      if (resendFail) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      const b = JSON.parse(init.body);
      sent.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, reply_to: b.reply_to, headers: b.headers || {} });
      return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 });
    }
    if (u.startsWith("https://api.respond.io/")) { wa.push({ url: u, body: init.body ? JSON.parse(init.body) : null }); return new Response(JSON.stringify({ messageId: 1000 + wa.length }), { status: 200 }); }
    if (u.startsWith("https://challenges.cloudflare.com/")) { turnstile.push(JSON.parse(init.body)); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
    throw new Error("unexpected fetch " + u);
  };
}
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", ...(extra || {}) });
function mkCtx() { const p = []; return { p, waitUntil(x) { p.push(x); }, async done() { await Promise.all(p); p.length = 0; } }; }
async function api(env, method, path, { body, token, ip = "10.0.0.1", ua = "Mozilla/5.0 test", headers = {}, form } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": ua, ...headers };
  let payload;
  if (form) { h["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { h["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: payload }), env, ctx);
  await ctx.done();
  const text = await res.clone().text();
  let data = null; try { data = JSON.parse(text); } catch (e) { /* html */ }
  return { status: res.status, data, text, res };
}
const codeOf = email => { const m = [...sent].reverse().find(s => s.to === email && /code|كود/.test(s.subject)); return m && m.text.match(/\b(\d{6})\b/)[1]; };
async function signIn(env, email) {
  assert.equal((await api(env, "POST", "/api/auth/request", { body: { email } })).status, 200);
  const r = await api(env, "POST", "/api/auth/verify", { body: { email, code: codeOf(email) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function member(env, email, plan, profile = {}) {
  const admin = await signIn(env, "boss@mig.test");
  const r = await api(env, "POST", "/api/admin/members", { token: admin.token, body: { email, plan, company: profile.company || "Co " + email, ...profile } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.user;
}
const RFQ = { kind: "rfq", name: "Ahmed Buyer", company: "Buyer Co", email: "buyer@buyer.test", phone: "+20 100 123 4567", message: "محتاجين براميل بلاستيكية سعة 220 لتر", payload: { product: "براميل بلاستيك", sector: "الصناعات البلاستيكية", governorate: "CAI", quantity: "500" } };
const PLAST = { sector: "الصناعات البلاستيكية", products: "براميل بلاستيك، جراكن" };
const respLink = text => (text.match(/https:\/\/madeinegyptgate\.com\/api\/inquiries\/respond\?t=([rb]\.[a-f0-9]{8}\.[a-z0-9]{5,8}\.[\w-]{24})/) || [])[1]; // r|b . route . expiry . sig

beforeEach(() => { realFetch = globalThis.fetch; mockFetch(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("journeys: links, incoming tab contract, quotes, declines", () => {
  test("factory email: signed login link dashboard.html#lt=…&tab=incoming&ref=REF + signed answer link (never dash.html); competitor's name and governorate code never shown", async () => {
    const env = env0();
    await member(env, "own@f.test", "basic", { ...PLAST, factory_ref: "12" });
    await member(env, "other@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: { ...RFQ, target_type: "company", target_id: "12", target_name: "مصنع النيل للبلاستيك" } });
    assert.equal(r.data.routed, 2);
    const own = sent.find(s => s.to === "own@f.test"), other = sent.find(s => s.to === "other@f.test");
    for (const m of [own, other]) {
      assert.ok(!m.text.includes("dash.html"), "no dash.html link");
      assert.match(m.text, new RegExp(`dashboard\\.html#lt=l1\\.[\\w.-]+&tab=incoming&ref=${r.data.ref}`)); // one-time login link (contract)
      assert.ok(respLink(m.text), "signed answer link");
      assert.match(m.text, /القاهرة/); assert.ok(!/: CAI\b/.test(m.text));
    }
    assert.ok(own.subject.includes("مصنع النيل للبلاستيك")); // the factory the buyer chose sees its own name
    assert.ok(!other.subject.includes("مصنع النيل") && !other.text.includes("مصنع النيل"), "a competitor never sees whom the buyer picked");
    assert.match(other.subject, /براميل بلاستيك/);
  });
  test("incoming tab: my_status / payload / routed_at / title; quote → quoted; first quote + 2 revisions, then 429; repeats labelled revised", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const fac = await signIn(env, "plast@f.test");
    const r = await api(env, "POST", "/api/inquiries", { body: { ...RFQ, target_type: "company", target_id: "99", target_name: "Competitor Plast" } });
    let inc = (await api(env, "GET", "/api/me/incoming", { token: fac.token })).data.items[0];
    assert.equal(inc.my_status, "new");
    assert.equal(inc.payload.quantity, "500");
    assert.equal(inc.payload.governorate, "القاهرة");
    assert.equal(inc.payload.product, "براميل بلاستيك");
    assert.match(inc.routed_at, /^\d{4}-/);
    assert.equal(inc.title, "براميل بلاستيك");
    assert.equal(inc.target_name, "براميل بلاستيك"); // not "Competitor Plast"
    assert.ok(!JSON.stringify(inc).includes("Competitor"));
    assert.ok(inc.respond_url.includes("/api/inquiries/respond?t=r."));
    sent.length = 0;
    const q = await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: fac.token, body: { price: "450", currency: "EGP" } });
    assert.deepEqual([q.status, q.data.revised, q.data.quotes_left], [200, false, 2]);
    inc = (await api(env, "GET", "/api/me/incoming", { token: fac.token })).data.items[0];
    assert.deepEqual([inc.my_status, inc.quote.price, inc.quotes_count], ["quoted", "450", 1]);
    const q2 = await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: fac.token, body: { price: "440", currency: "EGP" } });
    assert.equal(q2.data.revised, true);
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /عرض سعر معدّل/.test(s.text)));
    assert.equal((await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: fac.token, body: { price: "430" } })).status, 200);
    const q4 = await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: fac.token, body: { price: "420" } });
    assert.deepEqual([q4.status, q4.data.code], [429, "quote_limit"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes").first("n"), 3);
  });
  test("decline: the reason reaches the buyer (timeline, email); all declined → honest status", async () => {
    const env = env0();
    await member(env, "a@f.test", "basic", PLAST);
    await member(env, "b@f.test", "basic", PLAST);
    const fa = await signIn(env, "a@f.test"), fb = await signIn(env, "b@f.test");
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    sent.length = 0;
    assert.equal((await api(env, "POST", `/api/me/incoming/${r.data.ref}/decline`, { token: fa.token, body: { reason: "مش بنصنع المقاس ده" } })).status, 200);
    const m1 = sent.find(s => s.to === "buyer@buyer.test");
    assert.match(m1.text, /اعتذر/); assert.match(m1.text, /مش بنصنع المقاس ده/);
    const tt = (await trackUrl(env, r.data.ref)).split("~")[1]; // the signed track link (last-4 alone sees no factory's words — SEC H1)
    let t = await api(env, "GET", `/api/inquiries/${r.data.ref}?t=${tt}`);
    assert.equal(t.data.events.at(-1).type, "declined");
    assert.match(t.data.events.at(-1).body, /مش بنصنع المقاس ده/);
    assert.doesNotMatch((await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`)).data.events.at(-1).body, /مش بنصنع/);
    await api(env, "POST", `/api/me/incoming/${r.data.ref}/decline`, { token: fb.token, body: { reason: "" } });
    t = await api(env, "GET", `/api/inquiries/${r.data.ref}?t=${tt}`);
    assert.match(t.data.events.at(-1).body, /كل المصانع/);
  });
  test("signed answer page (no sign-in): quote, message, decline; buyer page relays to that factory only; forged token → 404", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    await member(env, "p2@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const tok = respLink(sent.find(s => s.to === "plast@f.test").text);
    const g = await api(env, "GET", `/api/inquiries/respond?t=${tok}`);
    assert.equal(g.status, 200);
    assert.match(g.res.headers.get("Content-Security-Policy"), /default-src 'none'/);
    assert.ok(g.text.includes(r.data.ref) && g.text.includes("براميل بلاستيك"));
    assert.ok(!g.text.includes("buyer@buyer.test") && !g.text.includes("4567"));
    sent.length = 0;
    const p = await api(env, "POST", `/api/inquiries/respond?t=${tok}`, { form: { action: "quote", price: "455", currency: "EGP", moq: "100", note: "شامل النقل" } });
    assert.equal(p.status, 200); assert.match(p.text, /اتبعت عرضك/);
    const bm = sent.find(s => s.to === "buyer@buyer.test");
    assert.match(bm.text, /455 EGP/);
    assert.match(bm.text, /المنصة عمرها ما بتطلب منك تحويل فلوس/); // payment-safety note on every quote / reply
    const btok = respLink(bm.text);
    assert.match(btok, /^b\./);
    sent.length = 0;
    const bp = await api(env, "POST", `/api/inquiries/respond?t=${btok}`, { form: { message: "ممكن عينة؟" } });
    assert.equal(bp.status, 200);
    assert.deepEqual(sent.map(s => s.to), ["plast@f.test"]);
    assert.equal((await api(env, "GET", `/api/inquiries/respond?t=${tok.slice(0, -2)}xx`)).status, 404);
    const t = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.deepEqual(t.data.events.slice(-2).map(e => e.type), ["quote", "buyer_message"]);
  });
  test("INBOUND_EMAIL off (Email Routing not enabled): Reply-To no-reply, no 'reply to this email', answer links instead", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    const m = sent.find(s => s.to === "plast@f.test");
    assert.equal(m.reply_to, "noreply@madeinegyptgate.com"); // the sender's own no-reply address
    assert.ok(!/اضغط «رد» على الإيميل ده وردك/.test(m.text));
    assert.match(m.text, /ماتردش على الإيميل ده/);
    assert.equal(sent.find(s => s.to === "buyer@buyer.test").reply_to, "noreply@madeinegyptgate.com");
    const h = await api(env, "GET", "/api/inquiries/health");
    assert.deepEqual([h.data.inbound_email, h.data.respond_links, h.data.buyer_whatsapp], [false, true, false]);
  });
  test("provider down: status received with matched/queued counts; receipt says matched, not 'no factory'", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    mockFetch({ resendFail: true });
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.deepEqual([r.data.status, r.data.routed, r.data.matched, r.data.queued], ["received", 0, 1, 1]);
  });
});

describe("security", () => {
  test("forged factory reply: a key-less inq-<ref>@ is rejected even with a routed member's From; strangers do not exhaust a factory's limit", async () => {
    const env = env0({ INBOUND_EMAIL: "1" });
    await member(env, "a@f.test", "basic", PLAST);
    await member(env, "b@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const keyless = `inq-${r.data.ref.toLowerCase()}@reply.madeinegyptgate.com`;
    sent.length = 0;
    const forged = fakeEmail({ from: "bounce@attacker.test", to: keyless, raw: `From: مصنع <b@f.test>\r\nTo: ${keyless}\r\nSubject: Re\r\n\r\nحوّل عربون على IBAN EG00` });
    await worker.email(forged, env, mkCtx());
    assert.equal(forged.rejected, "Unknown recipient");
    assert.equal(sent.length, 0);
    // 60 messages to unknown keys never touch the per-route limit of the real factory
    for (let i = 0; i < 60; i++) { const x = fakeEmail({ from: "x@evil.test", to: `inq-${r.data.ref.toLowerCase()}-${String(i).padStart(8, "0")}@reply.madeinegyptgate.com`, raw: "From: x@evil.test\r\nSubject: s\r\n\r\nspam" }); await worker.email(x, env, mkCtx()); assert.equal(x.rejected, "Unknown recipient"); }
    const route = (await env.DB.prepare("SELECT r.id AS id FROM inquiry_routes r JOIN members m ON m.id = r.member_id WHERE m.email = 'a@f.test'").first()).id;
    const addr = `inq-${r.data.ref.toLowerCase()}-${route}@reply.madeinegyptgate.com`;
    const ok = fakeEmail({ from: "a@f.test", to: addr, raw: `From: a@f.test\r\nTo: ${addr}\r\nSubject: Re\r\n\r\nالسعر 450` });
    await worker.email(ok, env, mkCtx());
    assert.equal(ok.rejected, null);
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /450/.test(s.text)));
  });
  test("no PLATFORM_KEY: /api/advisor/session closed; rows minted in open mode are never adopted by the email-code login (no plan grab, no pre-account hijack)", async () => {
    const env = env0();
    const s = await api(env, "POST", "/api/advisor/session", { body: { member_id: "evil-1", email: "attacker@evil.test", plan: "strategic" } });
    assert.deepEqual([s.status, s.data.code], [503, "platform_off"]);
    const open = env0({ ADVISOR_OPEN_MODE: "1" });
    assert.equal((await api(open, "POST", "/api/advisor/session", { body: { member_id: "evil-1", email: "attacker@evil.test", plan: "strategic" } })).status, 200);
    assert.equal((await api(open, "POST", "/api/advisor/session", { body: { member_id: "hij-1", email: "victim@corp.test", plan: "partner" } })).status, 200);
    const a = await signIn(open, "attacker@evil.test");
    assert.equal(a.user.plan, "visitor");
    assert.notEqual(a.user.id, "evil-1");
    const v = await signIn(open, "victim@corp.test");
    assert.notEqual(v.user.id, "hij-1");
    const h = await api(open, "GET", "/api/auth/health");
    assert.deepEqual([h.data.ok, h.data.advisor_open_mode], [false, true]);
  });
  test("codes are bound to the exact address: a code mailed to x+tag@ never opens x@ (no admin escalation); 15 wrong codes lock the address for the day", async () => {
    const env = env0();
    await signIn(env, "boss@mig.test");
    await api(env, "POST", "/api/auth/request", { body: { email: "boss+x@mig.test" } });
    const code = codeOf("boss+x@mig.test");
    const r = await api(env, "POST", "/api/auth/verify", { body: { email: "boss@mig.test", code } });
    assert.equal(r.status, 401);
    const own = await api(env, "POST", "/api/auth/verify", { body: { email: "boss+x@mig.test", code } });
    assert.equal(own.status, 200);
    assert.equal(own.data.user.role, "visitor"); // a different mailbox, not the admin
    const env2 = env0();
    for (let round = 0; round < 3; round++) {
      await api(env2, "POST", "/api/auth/request", { ip: "10.1.1." + round, body: { email: "t@x.test" } });
      const good = codeOf("t@x.test"), badc = good === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) await api(env2, "POST", "/api/auth/verify", { ip: "10.2." + round + "." + i, body: { email: "t@x.test", code: badc } });
    }
    await api(env2, "POST", "/api/auth/request", { ip: "10.1.1.9", body: { email: "t@x.test" } });
    const l = await api(env2, "POST", "/api/auth/verify", { ip: "10.3.3.3", body: { email: "t@x.test", code: codeOf("t@x.test") } });
    assert.deepEqual([l.status, l.data.code], [429, "locked"]);
  });
  test("Turnstile on: the sign-in dialog MUST send a token (SEC M1); anonymous requests need it too", async () => {
    const env = env0({ TURNSTILE_SECRET: "ts" });
    const no = await api(env, "POST", "/api/auth/request", { body: { email: "n@x.test" } });
    assert.deepEqual([no.status, no.data.code], [403, "verification_required"]);
    assert.equal((await api(env, "POST", "/api/auth/request", { body: { email: "n2@x.test", turnstile: "tok" } })).status, 200);
    assert.equal(turnstile.length, 1); // the token is checked
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.deepEqual([r.status, r.data.code], [403, "verification_required"]);
  });
  test("duplicate check never hands out another requester's ref", async () => {
    const env = env0();
    const a = await api(env, "POST", "/api/inquiries", { ip: "10.4.4.4", body: RFQ });
    const b = await api(env, "POST", "/api/inquiries", { ip: "10.5.5.5", body: RFQ });
    assert.notEqual(b.data.ref, a.data.ref);
    assert.ok(!b.data.duplicate);
    const c = await api(env, "POST", "/api/inquiries", { ip: "10.4.4.4", body: RFQ });
    assert.deepEqual([c.data.ref, c.data.duplicate], [a.data.ref, true]); // a real double click still gets the same ref
  });
  test("company impersonation: links / platform names refused; directory-linked accounts are company-locked and shown by their verified name", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", { ...PLAST, factory_ref: "12" });
    const f = await signIn(env, "plast@f.test");
    const bad1 = await api(env, "PATCH", "/api/me", { token: f.token, body: { company: "منصة صنع في مصر — قسم الحسابات (رسمي) https://mig-billing.example" } });
    assert.equal(bad1.status, 400);
    const v = await signIn(env, "v@x.test");
    assert.equal((await api(env, "PATCH", "/api/me", { token: v.token, body: { company: "Made in Egypt Gate Billing" } })).data.code, "invalid_company");
    assert.equal((await api(env, "PATCH", "/api/me", { token: v.token, body: { company: "pay-now.example.com" } })).data.code, "invalid_company");
    assert.equal((await api(env, "PATCH", "/api/me", { token: f.token, body: { company: "Another Name" } })).data.code, "company_locked");
    assert.equal((await api(env, "PATCH", "/api/me", { token: f.token, body: { company: "Co plast@f.test", name: "أحمد" } })).status, 200); // unchanged company is fine
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    sent.length = 0;
    await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: f.token, body: { price: "1" } });
    const name12 = DATA.f.find(x => x[5] === "company.html#12")[0];
    const bm = sent.find(s => s.to === "buyer@buyer.test");
    assert.ok(bm.text.includes(name12), "the verified directory name is shown");
    assert.ok(!bm.text.includes("Co plast@f.test"), "not the account's own text");
  });
  test("keyword stuffing: at most 20 product terms; premium priority needs a relevant match", async () => {
    const env = env0();
    const v = await signIn(env, "s@x.test");
    const many = Array.from({ length: 22 }, (_, i) => "منتج" + i).join("، ");
    assert.equal((await api(env, "PATCH", "/api/me", { token: v.token, body: { products: many } })).data.code, "invalid_products");
    const M = (id, plan, sector, products) => ({ id, plan, sector, products, governorate: "", verified: 1, email: id + "@f.test", company: "F " + id, inbox_paused: 0, plan_expires: "", created_at: "2026-01-01" });
    const pool = [...Array.from({ length: 10 }, (_, i) => M("p" + i, "premium", "أثاث", "كابلات")), M("cable", "basic", "الكهرباء والكابلات", "كابلات نحاس معزولة، كابلات قوى، أسلاك")];
    const r = rank({ message: "مطلوب كابلات قوى نحاس معزولة 4×16", sector: "الكهرباء والكابلات", payload: { sector: "الكهرباء والكابلات" }, market: "local" }, pool);
    assert.equal(r[0].member.id, "cable");
  });
  test("anonymous requests: links removed before factories see them; company with a link refused; per-factory daily cap", async () => {
    const env = env0({ MAX_ROUTES_PER_MEMBER_DAY: "2" });
    await member(env, "plast@f.test", "basic", PLAST);
    assert.equal((await api(env, "POST", "/api/inquiries", { body: { ...RFQ, company: "Ministry — login: https://gov-eg-portal.example/rfq" } })).data.code, "invalid_company");
    sent.length = 0;
    await api(env, "POST", "/api/inquiries", { body: { ...RFQ, message: "براميل — حمّل المواصفات https://evil.example/specs.zip أو www.evil.example" } });
    const m = sent.find(s => s.to === "plast@f.test");
    assert.ok(!m.text.includes("evil.example"));
    assert.match(m.text, /رابط محذوف/);
    assert.match(m.text, /بريده لسه ماتأكدش/);
    await api(env, "POST", "/api/inquiries", { ip: "10.6.6.6", body: { ...RFQ, email: "b2@b.test", message: "براميل 2" } });
    const third = await api(env, "POST", "/api/inquiries", { ip: "10.7.7.7", body: { ...RFQ, email: "b3@b.test", message: "براميل 3" } });
    assert.equal(third.data.routed, 0); // the factory already got its 2 for today; the request stays open
  });
  test("admin block: the member's sessions end, quotes and routing stop; detail shows real per-channel delivery", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const f = await signIn(env, "plast@f.test"), boss = await signIn(env, "boss@mig.test");
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const d = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: boss.token });
    assert.deepEqual([d.data.routes[0].email_status, d.data.routes[0].wa_status, d.data.routes[0].quote], ["sent", "skipped", null]);
    await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: f.token, body: { price: "9" } });
    const d2 = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: boss.token });
    assert.equal(d2.data.routes[0].quote.price, "9");
    const b = await api(env, "POST", "/api/admin/block", { token: boss.token, body: { email: "plast@f.test", reason: "spam quotes" } });
    assert.equal(b.data.revoked, 1);
    assert.equal((await api(env, "GET", "/api/me", { token: f.token })).status, 401);
    assert.equal((await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: f.token, body: { price: "8" } })).status, 401);
    const n0 = sent.length; // a blocked address silently gets no new code (no oracle)
    assert.equal((await api(env, "POST", "/api/auth/request", { body: { email: "plast@f.test" } })).status, 200);
    assert.equal(sent.length, n0);
    const r2 = await api(env, "POST", "/api/inquiries", { ip: "10.8.8.8", body: { ...RFQ, email: "o@b.test", message: "براميل تاني" } });
    assert.equal(r2.data.routed, 0);
  });
  test("honest metrics: changing the User-Agent does not count again; other sites / scripts are not counted", async () => {
    const env = env0();
    const O = { Origin: "https://madeinegyptgate.com" };
    for (let i = 0; i < 25; i++) await api(env, "POST", "/api/ev", { ua: "Mozilla/5.0 v" + i, headers: O, body: { kind: "company", ref: "12", metric: "view" } });
    await api(env, "POST", "/api/ev", { ip: "10.9.9.9", headers: { Origin: "https://evil.example" }, body: { kind: "company", ref: "12", metric: "view" } });
    await api(env, "POST", "/api/ev", { ip: "10.9.9.8", body: { kind: "company", ref: "12", metric: "view" } }); // no Origin / Referer
    await api(env, "POST", "/api/ev", { ip: "10.9.9.7", headers: { Referer: "https://www.madeinegyptgate.com/company.html#12" }, body: { kind: "lead", ref: "L1", metric: "view" } });
    const n = await env.DB.prepare("SELECT kind, SUM(n) AS n FROM ev_daily GROUP BY kind ORDER BY kind").all();
    assert.deepEqual(n.results.map(x => [x.kind, x.n]), [["company", 1], ["lead", 1]]);
  });
  test("WhatsApp log: the phone is a keyed hash, not sha256 of the number", async () => {
    const env = env0({ RESPONDIO_TOKEN: "tok", WA_WEBHOOK_SECRET: "hook" });
    await api(env, "POST", "/api/wa/inbound?secret=hook", { body: { contact: { phone: "+201009998877" }, message: { traffic: "incoming", message: { type: "text", text: "hi" } } } });
    const h = await env.DB.prepare("SELECT phone_hash FROM wa_messages").first("phone_hash");
    assert.ok(h && h !== (await sha256("wa|+201009998877")).slice(0, 24));
  });
  test("WhatsApp opt-in sends a consent notice with a one-click stop link", async () => {
    const env = env0();
    const u = await signIn(env, "w@x.test");
    await api(env, "PATCH", "/api/me", { token: u.token, body: { phone: "01001112223" } });
    sent.length = 0;
    const p = await api(env, "POST", "/api/me/prefs", { token: u.token, body: { wa_optin: true } });
    assert.equal(p.data.prefs.wa_verified, false);
    const n = sent.find(s => s.to === "w@x.test" && /واتساب|WhatsApp/.test(s.subject));
    const link = n.text.match(/https:\/\/madeinegyptgate\.com(\/api\/unsub\?[^\s]+l=whatsapp[^\s]*)/)[1];
    await api(env, "POST", link);
    assert.equal(JSON.parse((await env.DB.prepare("SELECT prefs_json FROM members WHERE email = 'w@x.test'").first("prefs_json"))).wa_optin, false);
  });
});

describe("honesty: settings that really apply, notifications, follows", () => {
  test("incoming requests: an unsubscribe can be undone (page button, prefs, admin) and requests flow again", async () => {
    const env = env0();
    await member(env, "u@f.test", "basic", PLAST);
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    const unsub = sent.find(s => s.to === "u@f.test" && s.headers["List-Unsubscribe"]).headers["List-Unsubscribe"].slice(1, -1).replace(SITE, "");
    const done = await api(env, "POST", unsub);
    assert.match(done.text, /رجّعها تاني/);
    assert.equal(await env.DB.prepare("SELECT inbox_paused FROM members WHERE email = 'u@f.test'").first("inbox_paused"), 1);
    await api(env, "POST", unsub, { form: { action: "resub" } });
    assert.equal(await env.DB.prepare("SELECT inbox_paused FROM members WHERE email = 'u@f.test'").first("inbox_paused"), 0);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM unsubscribes").first("n"), 0);
    const r2 = await api(env, "POST", "/api/inquiries", { ip: "10.3.3.3", body: { ...RFQ, message: "براميل تانية" } });
    assert.equal(r2.data.routed, 1);
    // the same through the account settings
    await api(env, "POST", unsub);
    const u = await signIn(env, "u@f.test");
    const p = await api(env, "POST", "/api/me/prefs", { token: u.token, body: { incoming: true } });
    assert.equal(p.data.prefs.incoming, true);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM unsubscribes").first("n"), 0);
  });
  test("prefs: day names are understood (sun…sat / Arabic), returned as numbers + names; digest switched back on really mails again", async () => {
    const env = env0();
    const u = await signIn(env, "d@x.test");
    const p = await api(env, "POST", "/api/me/prefs", { token: u.token, body: { days: ["sun", "mon", "tue", "wed", "thu"] } });
    assert.deepEqual([p.data.prefs.days, p.data.prefs.day_names], [[0, 1, 2, 3, 4], ["sun", "mon", "tue", "wed", "thu"]]);
    assert.deepEqual((await api(env, "POST", "/api/me/prefs", { token: u.token, body: { days: ["السبت", "الجمعة"] } })).data.prefs.days, [5, 6]);
    assert.equal((await api(env, "POST", "/api/me/prefs", { token: u.token, body: { days: ["xyz"] } })).status, 400);
    await env.DB.prepare("INSERT INTO unsubscribes (email_key, list, created_at) VALUES ('d@x.test', 'all', 'x')").run();
    await api(env, "POST", "/api/me/prefs", { token: u.token, body: { email_digest: true } });
    const rows = (await env.DB.prepare("SELECT list FROM unsubscribes ORDER BY list").all()).results.map(x => x.list);
    assert.deepEqual(rows, ["bassem", "daily", "incoming", "teaser", "updates"]); // digest back on, the rest of "all" kept (bassem = Bassem's daily e-mail; daily = the 10:00 report; teaser = 2026-11-28)
  });
  test("follows: market / product kinds accepted; page ids (ET003, OT-…) resolve for deadline reminders; links open the item", async () => {
    const env = env0();
    const u = await signIn(env, "f@x.test");
    assert.equal((await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "market", ref_id: "gulf", label: "الخليج" } })).status, 200);
    assert.equal((await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "product", ref_id: "17", label: "منتج" } })).status, 200);
    const it = items().find(x => x.kind === "tender" && x.deadline && x.aliases.some(a => /^ET\d+$/.test(a)));
    const alias = it.aliases[0];
    await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "tender", ref_id: alias, label: it.title, url: "opportunity.html#" + alias.toLowerCase() } });
    const f = await env.DB.prepare("SELECT item_id FROM follows WHERE ref_id = ?").bind(alias).first("item_id");
    assert.equal(f, it.id);
    assert.equal(it.url, "opportunity.html#" + alias.toLowerCase());
    await env.DB.prepare("UPDATE members SET plan = 'profile' WHERE email = 'f@x.test'").run();
    const [y, mo, d] = it.deadline.split("-").map(Number);
    const before = new Date(Date.UTC(y, mo - 1, d) - 7 * 86400e3).toISOString().slice(0, 10);
    const r = await dailyJobs(env, cairoToUtc(before, "07:30"));
    assert.equal(r.reminders, 1);
    const n = await api(env, "GET", "/api/me/notifications?lang=en", { token: u.token });
    assert.match(n.data.items[0].title, /^7 days to the deadline/);
    assert.match(n.data.items[0].title_ar, /باقي 7 أيام/);
    const old = items().find(x => x.kind === "tender" && x.aliases.some(a => a.startsWith("OT-")));
    if (old) assert.equal(old.url, "tenders/search/#" + encodeURIComponent(old.id)); // the interactive list at its clean URL (pages request)
  });
  test("buyer who sent before signing up: requests attached at sign-in, bell gets the replies; factories get a bell too", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const fac = await signIn(env, "plast@f.test");
    const fn = await api(env, "GET", "/api/me/notifications", { token: fac.token });
    assert.equal(fn.data.items[0].kind, "incoming");
    assert.equal(fn.data.items[0].url, "dashboard.html#incoming=" + r.data.ref);
    const b = await signIn(env, "buyer@buyer.test");
    assert.equal((await env.DB.prepare("SELECT user_id FROM inquiries WHERE ref = ?").bind(r.data.ref).first("user_id")), b.user.id);
    await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: fac.token, body: { price: "450" } });
    const bn = await api(env, "GET", "/api/me/notifications?lang=en", { token: b.token });
    assert.equal(bn.data.unread, 1);
    assert.match(bn.data.items[0].title, /New quote/);
    assert.equal((await api(env, "GET", `/api/inquiries/${r.data.ref}`, { token: b.token })).status, 200); // owner without last-4
  });
  test("anonymous interest: no promise of updates; signing in with the same e-mail follows the item", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/inquiries", { body: { kind: "lead_interest", name: "Mona", email: "m@b.test", message: "مهتم", target_type: "lead", target_id: "L7", target_name: "فرصة" } });
    const t = await api(env, "GET", `/api/inquiries/${r.data.ref}?t=${(sent.find(s => s.to === "m@b.test").text.match(/~([\w-]+)/) || [])[1]}`);
    assert.ok(!/هنبلغك تلقائياً/.test(t.data.events.at(-1).body));
    assert.match(t.data.events.at(-1).body, /لو دخلت بحسابك/);
    const u = await signIn(env, "m@b.test");
    const f = await api(env, "GET", "/api/me/follows", { token: u.token });
    assert.deepEqual(f.data.items.map(x => [x.kind, x.ref_id]), [["lead", "L7"]]);
  });
  test("buyer asked for WhatsApp updates but they are not available: the receipt says so (email only)", async () => {
    const env = env0();
    await api(env, "POST", "/api/inquiries", { body: { ...RFQ, consent_wa: true } });
    assert.match(sent.find(s => s.to === "buyer@buyer.test").text, /تحديثات الواتساب لسه مش متاحة/);
  });
  test("no-match receipt links to booking (meeting.html#book), not a dead meeting page", async () => {
    const env = env0();
    await api(env, "POST", "/api/inquiries", { body: { ...RFQ, payload: { product: "رخام", sector: "الرخام" } } });
    assert.match(sent.find(s => s.to === "buyer@buyer.test").text, /meeting\.html#book/);
  });
});

describe("Bassem: honest WhatsApp, call link, session time", () => {
  async function partner(env) {
    await member(env, "core@f.test", "partner", { phone: "01001112223", name: "أحمد", title: "دكتور" });
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE email = 'core@f.test'").bind(JSON.stringify({ wa_optin: true, morning_time: "23:59" })).run();
    return signIn(env, "core@f.test");
  }
  test("notify outside the 24 h window: not 'sent on WhatsApp' — pending, and delivered when the member replies", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "tok", WA_WEBHOOK_SECRET: "hook" }));
    const c = await partner(env);
    const n = await api(env, "POST", "/api/advisor/notify", { token: c.token, body: { message: "فرصة مناقصة صوامع — ادخل شوفها", channel: "whatsapp" } });
    assert.deepEqual([n.data.sent.whatsapp, n.data.pending.whatsapp], [false, true]);
    assert.equal(wa.at(-1).body.message.type, "whatsapp_template");
    const r = await api(env, "POST", "/api/wa/inbound?secret=hook", { body: { contact: { phone: "+201001112223" }, message: { traffic: "incoming", message: { type: "text", text: "تمام" } } } });
    assert.equal(r.data.delivered_queued, 1);
    assert.ok(wa.some(w => w.body.message.type === "text" && /صوامع/.test(w.body.message.text)));
    assert.ok(await env.DB.prepare("SELECT wa_verified_at FROM members WHERE email = 'core@f.test'").first("wa_verified_at"));
  });
  test("call-ready: at the standing session time; one-time sign-in link advisor.html?live=1#login=<code> that really signs in", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "tok", WA_WEBHOOK_SECRET: "hook" }));
    await partner(env);
    await env.DB.prepare("UPDATE members SET prefs_json = ?, wa_last_in_at = ? WHERE email = 'core@f.test'").bind(JSON.stringify({ wa_optin: true, morning_time: "23:59", session_time: "14:00" }), new Date(cairoToUtc("2026-11-20", "13:00")).toISOString()).run();
    assert.equal((await bassemCron(env, cairoToUtc("2026-11-20", "13:50"))).call, 0);
    assert.equal((await bassemCron(env, cairoToUtc("2026-11-20", "14:05"))).call, 1);
    const txt = wa.at(-1).body.message.text;
    const code = (txt.match(/advisor\.html\?live=1#login=([a-f0-9]{48})&live=1/) || [])[1];
    assert.ok(code, txt);
    const l = await api(env, "POST", "/api/advisor/login", { body: { code } });
    assert.equal(l.status, 200);
    assert.equal((await api(env, "POST", "/api/advisor/login", { body: { code } })).status, 401); // single use
    // "مش النهارده" skips the standing time
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE email = 'core@f.test'").bind(JSON.stringify({ wa_optin: true, morning_time: "23:59", session_time: "14:00", call_today_at: "skip:2026-11-21" })).run();
    assert.equal((await bassemCron(env, cairoToUtc("2026-11-21", "14:05"))).call, 0);
  });
});

describe("meetings: no human step", () => {
  test("confirmation carries a signed self-service cancel link; cancelling works; no 'reply to this email' / team promises", async () => {
    const env = env0({ MEETINGS_SECRET: "m-secret" });
    const d = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
    const r = await api(env, "POST", "/api/meetings", { body: { name: "Mona Adel", email: "mona@example.com", date: d, time: "11:30", language: "ar" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const vis = sent.find(s => s.to === "mona@example.com");
    assert.ok(!/رد على الإيميل ده|reply to this email/i.test(vis.text));
    const link = vis.text.match(/https:\/\/madeinegyptgate\.com(\/api\/meetings\/[a-f0-9]{20}\/cancel\?sig=[\w-]+)/)[1];
    assert.equal((await api(env, "GET", link)).status, 200);
    assert.equal(await env.DB.prepare("SELECT status FROM meetings").first("status"), "scheduled"); // GET only asks
    assert.match((await api(env, "POST", link)).text, /اتلغى الاجتماع/);
    assert.equal(await env.DB.prepare("SELECT status FROM meetings").first("status"), "cancelled");
    assert.match((await api(env, "GET", link.replace(/sig=.+$/, "sig=forged"))).text, /رابط غير صالح/);
    const { summarize } = await import("../src/meetings.js");
    const s = summarize({ name: "x" }, [{ r: "user", m: "عايز أسجل في الباقة المميزة" }]);
    assert.ok(!/فريق المنصة|platform team/i.test(s.ar + s.en));
  });
});

describe("cron reminder links", () => {
  test("48 h reminder points at the answer page and the real dashboard", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    await env.DB.prepare("UPDATE inquiry_routes SET sent_at = ?").bind(new Date(Date.now() - 49 * 3600e3).toISOString()).run();
    sent.length = 0;
    assert.equal((await inquiriesCron(env)).reminded, 1);
    const m = sent.find(s => /تذكير/.test(s.subject));
    assert.ok(respLink(m.text) && /dashboard\.html#lt=l1\.[\w.-]+&tab=incoming&ref=MIG-/.test(m.text) && !m.text.includes("dash.html"));
  });
});
