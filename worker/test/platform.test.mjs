// node --test for the interactive platform API: auth, automatic inquiry routing, tracking, follows, notifications, admin,
// inbound email replies, plan enforcement, respond.io sender (mocked fetch) and the cron jobs. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { platformCron } from "../src/index.js";
import { D1, fakeEmail, waSwitchOn } from "./helpers.mjs";
import { rank, inquiryMarket } from "../src/matching.js";
import { tokens, norm } from "../src/text.js";
import { newRef, REF_RX, inquiriesCron } from "../src/inquiries.js";
import { buildSend, sendToMember, interpret, parseTime, bassemCron, inbound } from "../src/whatsapp.js";
import { dailyJobs, items, followMatches } from "../src/digest.js";
import { cairoToUtc } from "../src/meetings.js";

const SITE = "https://madeinegyptgate.com";
let sent, wa, realFetch;
function mockFetch({ resendFail = false, respondStatus = 200 } = {}) {
  sent = []; wa = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com/")) {
      const b = JSON.parse(init.body);
      if (resendFail) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      sent.push({ to: b.to[0], subject: b.subject, text: b.text, reply_to: b.reply_to, headers: b.headers || {} });
      return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 });
    }
    if (u.startsWith("https://api.respond.io/")) {
      wa.push({ url: u, body: init.body ? JSON.parse(init.body) : null, auth: init.headers && init.headers.Authorization });
      return new Response(JSON.stringify(respondStatus === 200 ? { messageId: 1000 + wa.length } : { code: respondStatus, message: "x" }), { status: respondStatus });
    }
    throw new Error("unexpected fetch " + u);
  };
}
// INBOUND_EMAIL=1: Email Routing for reply.madeinegyptgate.com is on (reply-by-email loop); the "links only" mode is tested separately
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "advisor@madeinegyptgate.com", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", INBOUND_EMAIL: "1", ...(extra || {}) });
const ORIGIN = { Origin: "https://madeinegyptgate.com" };
function mkCtx() { const p = []; return { p, waitUntil(x) { p.push(x); }, async done() { await Promise.all(p); p.length = 0; } }; }
async function api(env, method, path, { body, token, ip = "10.0.0.1", ua = "Mozilla/5.0 test", headers = {} } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": ua, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  let data = null; try { data = await res.clone().json(); } catch (e) { /* empty */ }
  return { status: res.status, data, res };
}
const codeOf = email => { const m = [...sent].reverse().find(s => s.to === email && /code|كود/.test(s.subject)); return m && m.text.match(/\b(\d{6})\b/)[1]; };
async function signIn(env, email) {
  assert.equal((await api(env, "POST", "/api/auth/request", { body: { email } })).status, 200);
  const r = await api(env, "POST", "/api/auth/verify", { body: { email, code: codeOf(email) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
/* a registered member factory (plan set by the platform) */
async function member(env, email, plan, profile = {}) {
  const admin = await signIn(env, "boss@mig.test");
  const r = await api(env, "POST", "/api/admin/members", { token: admin.token, body: { email, plan, company: profile.company || "Co " + email, ...profile } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.user;
}
const RFQ = { kind: "rfq", name: "Ahmed Buyer", company: "Buyer Co", email: "buyer@buyer.test", phone: "+20 100 123 4567", message: "محتاجين براميل بلاستيكية سعة 220 لتر", payload: { product: "براميل بلاستيك", sector: "الصناعات البلاستيكية", governorate: "الجيزة", quantity: "500" } };

beforeEach(() => { realFetch = globalThis.fetch; mockFetch(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("auth: email code login", () => {
  test("request → verify → /api/me → logout", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/auth/request", { body: { email: "New@Factory.test", lang: "ar" } });
    assert.deepEqual([r.status, r.data], [200, { ok: true }]);
    const code = codeOf("new@factory.test");
    assert.match(code, /^\d{6}$/);
    const row = await env.DB.prepare("SELECT code_hash FROM auth_codes").first();
    assert.notEqual(row.code_hash, code); // hashed, never stored in clear
    const v = await api(env, "POST", "/api/auth/verify", { body: { email: "new@factory.test", code } });
    assert.equal(v.status, 200);
    assert.match(v.data.token, /^v2\./);
    assert.equal(v.data.user.plan, "visitor");
    assert.equal(v.data.user.role, "visitor");
    const me = await api(env, "GET", "/api/me", { token: v.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, "new@factory.test");
    assert.equal(me.data.unread, 0);
    assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "new@factory.test", code } })).status, 401); // single use
    assert.equal((await api(env, "POST", "/api/auth/logout", { token: v.data.token })).status, 200);
    assert.equal((await api(env, "GET", "/api/me", { token: v.data.token })).status, 401);
  });
  test("5 wrong attempts burn the code; expired codes fail; tampered token 401", async () => {
    const env = env0();
    await api(env, "POST", "/api/auth/request", { body: { email: "a@x.test" } });
    const good = codeOf("a@x.test"), bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "a@x.test", code: bad } })).status, 401);
    assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "a@x.test", code: good } })).status, 401);
    await api(env, "POST", "/api/auth/request", { body: { email: "a@x.test" } });
    await env.DB.prepare("UPDATE auth_codes SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "a@x.test", code: codeOf("a@x.test") } })).status, 401);
    const s = await signIn(env, "b@x.test");
    const p = s.token.split("."); p[4] = p[4].slice(0, -2) + (p[4].endsWith("AA") ? "BB" : "AA");
    assert.equal((await api(env, "GET", "/api/me", { token: p.join(".") })).status, 401);
  });
  test("rate limits per address; same answer for any address; no email provider → honest 503", async () => {
    const env = env0();
    for (let i = 0; i < 5; i++) assert.equal((await api(env, "POST", "/api/auth/request", { body: { email: "r@x.test" } })).status, 200);
    const r = await api(env, "POST", "/api/auth/request", { body: { email: "R+tag@x.test" } });
    assert.equal(r.status, 429);
    assert.equal(r.data.code, "rate_limited");
    assert.equal((await api(env, "POST", "/api/auth/request", { body: { email: "nope" } })).status, 400);
    const off = env0({ RESEND_API_KEY: undefined });
    const o = await api(off, "POST", "/api/auth/request", { body: { email: "q@x.test" } });
    assert.deepEqual([o.status, o.data.code], [503, "email_off"]);
  });
});

describe("matching engine", () => {
  const M = (id, plan, sector, products, gov = "", extra = {}) => ({ id, plan, sector, products, governorate: gov, verified: 1, email: id + "@f.test", company: "F " + id, inbox_paused: 0, plan_expires: "", created_at: "2026-01-0" + (id.length % 9 + 1), ...extra });
  test("Arabic normalisation: alef / ta marbuta / ya / «ال» / plurals", () => {
    assert.deepEqual(tokens("البلاستيكية"), tokens("بلاستيكيه"));
    assert.equal(norm("أسمنت إسكندرية"), "اسمنت اسكندريه");
    assert.ok(tokens("براميل plastic").includes("بلاستيك"));
    assert.ok(!tokens("محتاجين عرض سعر توريد").length);
  });
  test("premium first, max 10, scope, expiry, paused and non-matching excluded", () => {
    const pool = [M("b1", "basic", "الصناعات البلاستيكية", "براميل بلاستيك، جراكن"), M("p1", "premium", "صناعات بلاستيكية", "عبوات"), M("s1", "strategic", "أغذية", "عصائر"),
      M("x1", "basic", "الصناعات البلاستيكية", "براميل", "", { plan_expires: "2001-01-01T00:00:00Z" }), M("x2", "profile", "الصناعات البلاستيكية", "براميل"), M("x3", "basic", "الصناعات البلاستيكية", "براميل", "", { inbox_paused: 1 })];
    const r = rank({ message: "براميل بلاستيكية 220 لتر", payload: { sector: "الصناعات البلاستيكية" }, sector: "الصناعات البلاستيكية", market: "local" }, pool, { nowIso: new Date().toISOString() });
    assert.deepEqual(r.map(x => x.member.id), ["p1", "b1"]);
    assert.equal(r[0].priority, 1);
    const many = Array.from({ length: 14 }, (_, i) => M("m" + i, "basic", "بلاستيك", "براميل"));
    assert.equal(rank({ message: "براميل", market: "local" }, many).length, 10);
    // a Gulf buyer: basic (Egypt only) is out of scope, premium is in
    const g = rank({ message: "براميل بلاستيك", market: inquiryMarket({ country: "السعودية" }) }, pool);
    assert.deepEqual(g.map(x => x.member.id), ["p1"]);
    // the targeted directory profile, when owned by a registered member, always matches
    const t = rank({ message: "سؤال عام", target_type: "company", target_id: "12", market: "local" }, [M("own", "basic", "أثاث", "كراسي", "", { factory_ref: "12" })]);
    assert.equal(t.length, 1);
  });
});

describe("inquiries: automatic routing", () => {
  test("rfq → sent automatically to matching registered members; buyer told the true number; no phones leaked", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", { sector: "الصناعات البلاستيكية", products: "براميل بلاستيك، جراكن", phone: "01001112223" });
    await member(env, "prem@f.test", "premium", { sector: "الصناعات البلاستيكية", products: "براميل" });
    await member(env, "food@f.test", "partner", { sector: "صناعات غذائية", products: "عصائر" });
    await member(env, "free@f.test", "profile", { sector: "الصناعات البلاستيكية", products: "براميل" });
    sent.length = 0;
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.ref, REF_RX);
    assert.equal(r.data.status, "routed");
    assert.equal(r.data.routed, 2);
    const toF = sent.filter(s => s.to === "plast@f.test" || s.to === "prem@f.test");
    assert.equal(toF.length, 2);
    for (const s of toF) { assert.match(s.reply_to, new RegExp(`^inq-${r.data.ref.toLowerCase()}-[a-f0-9]{8}@reply\\.madeinegyptgate\\.com$`)); assert.ok(!s.text.includes("1234567")); assert.ok(!s.text.includes("buyer@buyer.test")); assert.ok(s.headers["List-Unsubscribe"]); }
    assert.ok(!sent.some(s => s.to === "food@f.test" || s.to === "free@f.test"));
    const rcpt = sent.find(s => s.to === "buyer@buyer.test");
    assert.match(rcpt.text, /مصنعين|2 registered/);
    assert.ok(!/موظف واحد|خلال يوم عمل|team will reply/i.test(rcpt.text)); // never promises a human reply
    assert.ok(sent.some(s => s.to === "team@madeinegyptgate.com" && /متابعة/.test(s.subject)));
    // tracking: last4 / signed link / wrong proof
    const ok = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.events.map(e => e.type), ["received", "routed"]);
    assert.match(ok.data.events[1].body, /مصنعين/);
    assert.equal((await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=0000`)).status, 404);
    assert.equal((await api(env, "GET", `/api/inquiries/MIG-26-ZZZZZZ?last4=4567`)).status, 404);
    const link = rcpt.text.match(/track\.html#(MIG-\d\d-[A-Z0-9]+)~([\w-]+)/);
    assert.equal((await api(env, "GET", `/api/inquiries/${link[1]}?t=${link[2]}&lang=en`)).data.events[1].body.includes("sent automatically"), true);
  });
  test("no registered match → in_progress «جاري معالجة طلبك» + the admins act; then a matching member joins → sent automatically and buyer told", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/inquiries", { body: { ...RFQ, message: "نحتاج رخام جلالة", payload: { product: "رخام", sector: "الرخام والجرانيت" } } });
    assert.equal(r.data.status, "in_progress"); // owner decision 19 (was the honest-only "no_match")
    assert.equal(r.data.routed, 0);
    const t = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.match(t.data.events.at(-1).body, /جاري معالجة طلبك/);
    assert.equal(t.data.status_label, "جاري معالجة طلبك");
    assert.match(sent.find(s => s.to === "buyer@buyer.test").text, /جاري معالجة طلبك/);
    assert.ok(sent.some(s => s.to === "team@madeinegyptgate.com" && /مطلوب رد الإدارة/.test(s.subject)));
    sent.length = 0;
    const u = await member(env, "marble@f.test", "basic", { sector: "الرخام والجرانيت", products: "رخام جلالة، جرانيت" });
    assert.ok(sent.some(s => s.to === "marble@f.test" && s.subject.includes(r.data.ref)));
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /مصنع جديد/.test(s.text)));
    const t2 = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.equal(t2.data.status, "routed");
    assert.equal(t2.data.routed_count, 1);
    assert.ok(u.markets.includes("local"));
  });
  test("6th request from one IP within 10 minutes is rejected; refs are random; bad input 400", async () => {
    const env = env0();
    for (let i = 0; i < 5; i++) assert.equal((await api(env, "POST", "/api/inquiries", { body: { ...RFQ, message: "طلب رقم " + i } })).status, 201);
    const r = await api(env, "POST", "/api/inquiries", { body: { ...RFQ, message: "طلب رقم 6" } });
    assert.deepEqual([r.status, r.data.code], [429, "rate_limited"]);
    const refs = new Set(Array.from({ length: 300 }, () => newRef()));
    assert.equal(refs.size, 300);
    for (const x of refs) assert.match(x, REF_RX);
    assert.equal((await api(env, "POST", "/api/inquiries", { ip: "9.9.9.9", body: { ...RFQ, kind: "spam" } })).status, 400);
    assert.equal((await api(env, "POST", "/api/inquiries", { ip: "9.9.9.9", body: { ...RFQ, email: "x" } })).status, 400);
  });
  test("non-routable kinds are recorded honestly (no fake 'sent'); provider down → status received, retried by cron", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/inquiries", { body: { kind: "entity_contact", name: "Mona", email: "m@b.test", message: "سؤال", target_type: "entity", target_id: "e1" } });
    assert.equal(r.data.status, "recorded");
    await member(env, "plast@f.test", "basic", { sector: "الصناعات البلاستيكية", products: "براميل" });
    mockFetch({ resendFail: true });
    const f = await api(env, "POST", "/api/inquiries", { ip: "10.9.9.9", body: RFQ });
    assert.equal(f.data.status, "received");
    assert.equal(f.data.routed, 0);
    mockFetch();
    const c = await inquiriesCron(env);
    assert.equal(c.retried, 1);
    assert.equal((await api(env, "GET", `/api/inquiries/${f.data.ref}?last4=4567`)).data.routed_count, 1);
  });
});

describe("factory replies, quotes, inbound email", () => {
  async function setup() {
    const env = env0();
    await member(env, "plast@f.test", "basic", { sector: "الصناعات البلاستيكية", products: "براميل بلاستيك" });
    const fac = await signIn(env, "plast@f.test");
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const route = sent.find(s => s.to === "plast@f.test" && s.subject.includes(r.data.ref)).reply_to;
    return { env, fac, ref: r.data.ref, route };
  }
  test("email reply from the factory → buyer gets it automatically, status replied", async () => {
    const { env, ref, route } = await setup();
    sent.length = 0;
    // SEC M4: the factory's reply address takes that factory's own mailbox only (the route id is not a secret)
    const stranger = fakeEmail({ from: "sales@plast.test", to: route, raw: `From: Sales <sales@plast.test>\r\nTo: ${route}\r\nSubject: Re: offer\r\n\r\nحوّل على IBAN EG00` });
    await worker.email(stranger, env, mkCtx());
    assert.equal(stranger.rejected, "Unknown recipient");
    const msg = fakeEmail({ from: "plast@f.test", to: route, raw: `From: Sales <plast@f.test>\r\nTo: ${route}\r\nSubject: Re: offer\r\nMessage-ID: <1@plast.test>\r\n\r\nالسعر 450 جنيه للبرميل.\r\n\r\nOn Mon someone wrote:\r\n> quoted text` });
    await worker.email(msg, env, mkCtx());
    assert.equal(msg.rejected, null);
    const b = sent.find(s => s.to === "buyer@buyer.test");
    assert.match(b.text, /450/);
    assert.ok(!b.text.includes("quoted text"));
    assert.match(b.reply_to, /^inq-mig-\d\d-[a-z0-9]{6}-b[a-f0-9]{8}@/);
    const t = await api(env, "GET", `/api/inquiries/${ref}?last4=4567`);
    assert.equal(t.data.status, "replied");
    assert.equal(t.data.events.at(-1).type, "reply");
    // the buyer answers that factory by email → relayed to the factory only
    sent.length = 0;
    const bm = fakeEmail({ from: "buyer@buyer.test", to: b.reply_to, raw: `From: buyer@buyer.test\r\nTo: ${b.reply_to}\r\nSubject: Re\r\n\r\nتمام، ابعت فاتورة مبدئية` });
    await worker.email(bm, env, mkCtx());
    assert.equal(bm.rejected, null);
    assert.deepEqual(sent.map(s => s.to), ["plast@f.test"]);
    // strangers cannot inject into the thread
    const x = fakeEmail({ from: "evil@x.test", to: `inq-${ref.toLowerCase()}@reply.madeinegyptgate.com`, raw: `From: evil@x.test\r\nSubject: hi\r\n\r\nclick here` });
    await worker.email(x, env, mkCtx());
    assert.equal(x.rejected, "Unknown recipient");
  });
  test("dashboard quote → forwarded to the buyer; plan enforcement on incoming", async () => {
    const { env, fac, ref } = await setup();
    const inc = await api(env, "GET", "/api/me/incoming", { token: fac.token });
    assert.equal(inc.status, 200);
    assert.equal(inc.data.items[0].ref, ref);
    assert.equal(inc.data.items[0].buyer.company, "Buyer Co");
    assert.ok(!JSON.stringify(inc.data).includes("buyer@buyer.test"));
    sent.length = 0;
    const q = await api(env, "POST", `/api/me/incoming/${ref}/quote`, { token: fac.token, body: { price: "450", currency: "egp", moq: "100", lead_time: "7 أيام", validity: "15 يوم", note: "شامل النقل" } });
    assert.equal(q.status, 200, JSON.stringify(q.data));
    assert.match(sent.find(s => s.to === "buyer@buyer.test").text, /450 EGP/);
    const t = await api(env, "GET", `/api/inquiries/${ref}?last4=4567`);
    assert.equal(t.data.events.at(-1).type, "quote");
    const visitor = await signIn(env, "v@x.test");
    assert.equal((await api(env, "GET", "/api/me/incoming", { token: visitor.token })).status, 403);
    assert.equal((await api(env, "POST", `/api/me/incoming/${ref}/quote`, { token: visitor.token, body: { price: "1" } })).status, 403);
  });
  test("cron: one 48 h reminder, auto-close after 30 days with a final email", async () => {
    const { env, ref } = await setup();
    await env.DB.prepare("UPDATE inquiry_routes SET sent_at = ?").bind(new Date(Date.now() - 49 * 3600e3).toISOString()).run();
    sent.length = 0;
    assert.equal((await inquiriesCron(env)).reminded, 1);
    assert.equal((await inquiriesCron(env)).reminded, 0);
    assert.ok(sent.some(s => s.to === "plast@f.test" && /تذكير/.test(s.subject)));
    await env.DB.prepare("UPDATE inquiries SET created_at = ?").bind(new Date(Date.now() - 31 * 86400e3).toISOString()).run();
    sent.length = 0;
    assert.equal((await inquiriesCron(env)).closed, 1);
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /اتقفل تلقائياً/.test(s.text)));
    assert.equal((await api(env, "GET", `/api/inquiries/${ref}?last4=4567`)).data.status, "closed");
  });
});

describe("follows, notifications, prefs, stats, ev", () => {
  test("follows CRUD across devices + notifications read", async () => {
    const env = env0();
    const a = await signIn(env, "f@x.test");
    assert.equal((await api(env, "GET", "/api/me/follows")).status, 401);
    assert.equal((await api(env, "POST", "/api/me/follows", { token: a.token, body: { kind: "tender", ref_id: "eg-tnd-003", label: "صوامع", url: "tenders.html#eg-tnd-003" } })).status, 200);
    assert.equal((await api(env, "POST", "/api/me/follows", { token: a.token, body: { kind: "bogus", ref_id: "1" } })).status, 400);
    const b = await signIn(env, "f@x.test"); // second device
    const l = await api(env, "GET", "/api/me/follows", { token: b.token });
    assert.deepEqual(l.data.items.map(i => i.ref_id), ["eg-tnd-003"]);
    assert.equal((await api(env, "DELETE", "/api/me/follows", { token: b.token, body: { kind: "tender", ref_id: "eg-tnd-003" } })).status, 200);
    assert.equal((await api(env, "GET", "/api/me/follows", { token: a.token })).data.items.length, 0);
    await api(env, "POST", "/api/inquiries", { token: a.token, body: { ...RFQ, email: "f@x.test" } }); // a signed-in sender writes from its own mailbox (SEC M3)
    const n = await api(env, "GET", "/api/me/notifications", { token: a.token });
    assert.equal(n.data.unread, 1);
    const rd = await api(env, "POST", "/api/me/notifications/read", { token: a.token, body: { all: true } });
    assert.equal(rd.data.unread, 0);
    assert.equal((await api(env, "GET", "/api/me/inquiries", { token: a.token })).data.items.length, 1);
  });
  test("prefs validation; WhatsApp opt-in needs a phone; PATCH /api/me normalises the phone", async () => {
    const env = env0();
    const a = await signIn(env, "p@x.test");
    assert.equal((await api(env, "POST", "/api/me/prefs", { token: a.token, body: { wa_optin: true } })).data.code, "phone_required");
    assert.equal((await api(env, "PATCH", "/api/me", { token: a.token, body: { phone: "0100 111 2223", name: "أحمد", title: "مهندس" } })).data.user.phone, "+201001112223");
    const p = await api(env, "POST", "/api/me/prefs", { token: a.token, body: { wa_optin: true, morning_time: "08:30", days: [0, 1, 9], email_digest: false } });
    assert.equal(p.status, 200);
    assert.deepEqual([p.data.prefs.wa_optin, p.data.prefs.morning_time, p.data.prefs.days, p.data.prefs.email_digest], [true, "08:30", [0, 1], false]);
    assert.equal((await api(env, "POST", "/api/me/prefs", { token: a.token, body: { morning_time: "25:00" } })).status, 400);
  });
  test("ev: deduplicated per visitor/day, bots ignored, stats honest with threshold and plan check", async () => {
    const env = env0();
    const u = await member(env, "st@f.test", "basic", { factory_ref: "12" });
    for (let i = 0; i < 3; i++) assert.equal((await api(env, "POST", "/api/ev", { headers: ORIGIN, body: { kind: "company", ref: "12", metric: "view" } })).status, 204);
    await api(env, "POST", "/api/ev", { ip: "10.0.0.2", headers: ORIGIN, body: { kind: "company", ref: "12", metric: "view" } });
    await api(env, "POST", "/api/ev", { ip: "10.0.0.3", ua: "Googlebot/2.1", headers: ORIGIN, body: { kind: "company", ref: "12", metric: "view" } });
    assert.equal((await api(env, "POST", "/api/ev", { body: { kind: "company", ref: "12", metric: "hack" } })).status, 400);
    const raw = await env.DB.prepare("SELECT * FROM ev_seen").all();
    assert.ok(raw.results.every(r => !r.h.includes("10.0.0")));
    const s = await signIn(env, "st@f.test");
    const st = await api(env, "GET", "/api/me/stats", { token: s.token });
    assert.equal(st.data.metrics.views, 2);
    assert.equal(st.data.enough, false);
    assert.match(st.data.since, /^\d{4}-\d{2}-\d{2}$/);
    const v = await signIn(env, "vv@x.test");
    assert.equal((await api(env, "GET", "/api/me/stats", { token: v.token })).status, 403);
    assert.equal(u.plan, "basic");
  });
  test("unsubscribe link (GET confirms, POST applies) stops that list", async () => {
    const env = env0();
    await member(env, "u@f.test", "basic", { sector: "الصناعات البلاستيكية", products: "براميل" });
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    const unsub = sent.find(s => s.to === "u@f.test" && s.headers["List-Unsubscribe"]).headers["List-Unsubscribe"].slice(1, -1);
    const path = unsub.replace("https://madeinegyptgate.com", "");
    assert.equal((await api(env, "GET", path)).status, 200);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM unsubscribes").first("n")), 0);
    await api(env, "POST", path);
    assert.equal((await env.DB.prepare("SELECT inbox_paused FROM members WHERE email = 'u@f.test'").first("inbox_paused")), 1);
    sent.length = 0;
    const r2 = await api(env, "POST", "/api/inquiries", { ip: "10.3.3.3", body: { ...RFQ, message: "براميل تانية" } });
    assert.equal(r2.data.status, "in_progress"); // nobody registered receives it now → the admins act
    assert.equal((await api(env, "GET", path.replace(/s=[^&]+/, "s=forged"))).res.status, 200); // page says invalid; nothing changes
  });
});

describe("admin monitoring + plan enforcement", () => {
  test("admin endpoints: 401 / 403 for members / 200 for ADMIN_EMAILS; block stops new requests", async () => {
    const env = env0();
    assert.equal((await api(env, "GET", "/api/admin/inquiries")).status, 401);
    const user = await signIn(env, "someone@x.test");
    assert.equal((await api(env, "GET", "/api/admin/inquiries", { token: user.token })).status, 403);
    const boss = await signIn(env, "boss@mig.test");
    assert.equal(boss.user.role, "admin");
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const l = await api(env, "GET", "/api/admin/inquiries?q=Buyer", { token: boss.token });
    assert.equal(l.status, 200);
    assert.equal(l.data.items[0].ref, r.data.ref);
    const d = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: boss.token });
    assert.ok(d.data.events.length >= 2);
    assert.equal((await api(env, "POST", `/api/admin/inquiries/${r.data.ref}/resend`, { token: boss.token })).status, 200);
    assert.equal((await api(env, "POST", "/api/admin/block", { token: boss.token, body: { email: "buyer@buyer.test", reason: "spam" } })).status, 200);
    const b = await api(env, "POST", "/api/inquiries", { ip: "10.7.7.7", body: { ...RFQ, message: "again" } });
    assert.deepEqual([b.status, b.data.code], [403, "blocked"]);
    assert.equal((await api(env, "POST", "/api/admin/members", { token: user.token, body: { email: "x@y.test", plan: "strategic" } })).status, 403);
  });
  test("Bassem (/api/advisor) with the platform login: 403 for basic, 200 for partner; devtools plan is irrelevant", async () => {
    const env = env0();
    await member(env, "basic@f.test", "basic");
    await member(env, "core@f.test", "partner");
    const b = await signIn(env, "basic@f.test"), c = await signIn(env, "core@f.test");
    const r1 = await api(env, "GET", "/api/advisor/deals", { token: b.token });
    assert.deepEqual([r1.status, r1.data.code], [403, "plan"]);
    assert.equal((await api(env, "GET", "/api/advisor/deals", { token: c.token })).status, 200);
    const n = await api(env, "POST", "/api/advisor/notify", { token: c.token, body: { message: "فرصة جديدة", channel: "both" } });
    assert.equal(n.status, 200);
    assert.deepEqual(n.data.sent, { email: true, whatsapp: false });
    assert.equal((await api(env, "POST", "/api/advisor/notify", { token: b.token, body: { message: "x" } })).status, 403);
    // expired plan → no Bassem
    await env.DB.prepare("UPDATE members SET plan_expires = '2001-01-01T00:00:00.000Z' WHERE email = 'core@f.test'").run();
    assert.equal((await api(env, "GET", "/api/advisor/deals", { token: c.token })).status, 403);
    assert.equal((await api(env, "GET", "/api/me", { token: c.token })).data.user.plan, "visitor");
  });
});

describe("respond.io WhatsApp (mocked — nothing is ever sent for real in tests)", () => {
  test("request shape: template + text, channel 580384, Bearer token", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "tok" }));
    const t = buildSend(env, "01001112223", { template: "bassem_morning", params: ["مهندس أحمد"] });
    assert.equal(t.url, "https://api.respond.io/v2/contact/phone%3A%2B201001112223/message");
    assert.deepEqual(t.body, { channelId: 580384, message: { type: "whatsapp_template", template: { name: "bassem_morning", languageCode: "ar_EG", components: [{ type: "body", text: "صباح الخير {{1}}  طمني علي صحة حضرتك", parameters: [{ type: "text", text: "مهندس أحمد" }] }] } } });
    assert.deepEqual(buildSend(env, "+201001112223", { text: "hi" }).body.message, { type: "text", text: "hi" });
    assert.equal(buildSend(env, "123", { text: "x" }), null);
    const m = { id: "m1", phone: "+201001112223", name: "أحمد", prefs_json: JSON.stringify({ wa_optin: true }), wa_last_in_at: "" };
    const r = await sendToMember(env, m, { text: "نص", template: "bassem_update" });
    assert.deepEqual([r.sent, r.via], [true, "template"]); // outside the 24 h window → template
    assert.equal(wa[0].auth, "Bearer tok");
    const r2 = await sendToMember(env, { ...m, wa_last_in_at: new Date().toISOString() }, { text: "نص", template: "bassem_update" });
    assert.equal(r2.via, "text");
    assert.equal((await sendToMember(env, { ...m, prefs_json: "{}" }, { text: "x", template: "bassem_update" })).error, "not opted in");
    assert.equal((await sendToMember(env0({ RESPONDIO_TOKEN: "tok", WA_DRY_RUN: "1" }), m, { template: "bassem_update" })).sent, false);
    mockFetch({ respondStatus: 400 });
    assert.match((await sendToMember(env, m, { template: "bassem_update" })).error, /respond\.io 400/);
  });
  test("inbound webhook: secret, «إيقاف», time choice, mood flag", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "tok", WA_WEBHOOK_SECRET: "hook" }));
    await member(env, "core@f.test", "partner", { phone: "01001112223", name: "أحمد", title: "مهندس" });
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE email = 'core@f.test'").bind(JSON.stringify({ wa_optin: true })).run();
    const body = text => ({ event_type: "message.received", contact: { id: 5, phone: "+201001112223" }, message: { traffic: "incoming", message: { type: "text", text } } });
    assert.equal((await api(env, "POST", "/api/wa/inbound?secret=bad", { body: body("x") })).status, 401);
    let r = await api(env, "POST", "/api/wa/inbound?secret=hook", { body: body("الضهر") });
    assert.equal(r.data.intent, "time");
    let m = await env.DB.prepare("SELECT * FROM members WHERE email = 'core@f.test'").first();
    assert.match(JSON.parse(m.prefs_json).call_today_at, /T13:00$/);
    assert.ok(m.wa_last_in_at);
    assert.equal(wa.at(-1).body.message.type, "text"); // window open → free-text reply
    r = await api(env, "POST", "/api/wa/inbound?secret=hook", { body: body("والله متضايق النهارده") });
    assert.equal(r.data.intent, "mood_bad");
    assert.ok((await env.DB.prepare("SELECT 1 AS x FROM wa_messages WHERE flag = 'mood'").first("x")));
    assert.ok(sent.some(s => s.to === "team@madeinegyptgate.com" && /متابعة/.test(s.subject)));
    r = await api(env, "POST", "/api/wa/inbound?secret=hook", { body: body("إيقاف") });
    assert.equal(r.data.intent, "stop");
    m = await env.DB.prepare("SELECT * FROM members WHERE email = 'core@f.test'").first();
    assert.equal(JSON.parse(m.prefs_json).pause, true);
    assert.equal(parseTime("الساعة 3"), "15:00");
    assert.equal(interpret("الحمد لله", null).intent, "mood_good");
  });
  test("Bassem cron: morning template once a day at the member's time; call-ready at the chosen time", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "tok" }));
    await member(env, "core@f.test", "strategic", { phone: "01001112223", name: "أحمد", title: "دكتور" });
    await member(env, "basic@f.test", "basic", { phone: "01001112224" });
    await env.DB.prepare("UPDATE members SET prefs_json = ?").bind(JSON.stringify({ wa_optin: true, morning_time: "09:00" })).run();
    const at = (d, hm) => cairoToUtc(d, hm);
    assert.equal((await bassemCron(env, at("2026-11-20", "08:50"))).morning, 0);
    const r = await bassemCron(env, at("2026-11-20", "09:05"));
    assert.equal(r.morning, 1); // only the strategic member (basic has no Bassem)
    assert.equal(wa[0].body.message.template.name, "bassem_morning");
    assert.equal(wa[0].body.message.template.components[0].parameters[0].text, "دكتور أحمد");
    assert.equal((await bassemCron(env, at("2026-11-20", "09:20"))).morning, 0);
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE email = 'core@f.test'").bind(JSON.stringify({ wa_optin: true, call_today_at: "2026-11-20T13:00" })).run();
    assert.equal((await bassemCron(env, at("2026-11-20", "12:45"))).call, 0);
    assert.equal((await bassemCron(env, at("2026-11-20", "13:05"))).call, 1);
    assert.equal(wa.at(-1).body.message.template.name, "bassem_call_ready");
  });
});

describe("daily digest + deadline reminders (real items only)", () => {
  test("baseline items are never 'new'; a newly seen item matching a follow is emailed once; 7-day reminder", async () => {
    const env = env0();
    const all = items();
    const it = all.find(x => x.kind === "tender" && x.sector && x.deadline);
    await member(env, "d@f.test", "profile");
    const u = await signIn(env, "d@f.test");
    await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "sector", ref_id: it.sector, label: it.sector } });
    await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "tender", ref_id: it.id, label: it.title } });
    const day1 = cairoToUtc("2026-11-19", "07:30");
    sent.length = 0;
    let r = await dailyJobs(env, day1);
    assert.equal(r.synced.baseline, true);
    assert.equal(r.digests, 0); // first sync = baseline, nothing is "new"
    assert.equal((await dailyJobs(env, day1 + 3600e3)).ran, false); // once a day
    await env.DB.prepare("UPDATE seen_items SET baseline = 0, first_seen_at = ? WHERE kind = ? AND item_id = ?").bind(new Date(day1 + 20 * 3600e3).toISOString(), it.kind, it.id).run();
    r = await dailyJobs(env, cairoToUtc("2026-11-20", "07:30"));
    assert.equal(r.digests, 1);
    const mailD = sent.find(s => s.to === "d@f.test" && /متابعاتك/.test(s.subject));
    assert.ok(mailD.text.includes(it.title.slice(0, 30)));
    assert.ok(mailD.headers["List-Unsubscribe"]);
    // deadline reminder 7 days before
    const [y, mo, d] = it.deadline.split("-").map(Number);
    const before = new Date(Date.UTC(y, mo - 1, d) - 7 * 86400e3).toISOString().slice(0, 10);
    await env.DB.prepare("DELETE FROM cron_runs").run();
    r = await dailyJobs(env, cairoToUtc(before, "07:30"));
    assert.equal(r.reminders, 1);
    assert.ok(followMatches({ kind: "sector", ref_id: it.sector, label: it.sector }, it));
    // visitors get no alerts (decision 3: data-only and above)
    assert.ok(!items().some(x => /SAMPLE|عينة|توضيحي/.test(x.title)));
  });
  test("platformCron runs every part even without email / WhatsApp configured", async () => {
    const env = env0({ RESEND_API_KEY: undefined });
    const r = await platformCron(env);
    assert.ok(r.inquiries && r.daily && r.bassem);
  });
});
