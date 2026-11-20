// DEPLOY 1 integration (worker owner): no-match flow (in_progress + admins + candidates + «إحنا اللي هنرد»), signed one-time login
// links, Resend sender / Reply-To, Bassem's e-mail fallback, production wrangler.toml routes, migration order, cleaned data index.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker, { tenderStatus, search } from "../src/index.js";
import { D1, waSwitchOn } from "./helpers.mjs";
import { inquiriesCron } from "../src/inquiries.js";
import { bassemCron } from "../src/whatsapp.js";
import { directoryCandidates, webCandidates } from "../src/candidates.js";
import { cairoToUtc } from "../src/meetings.js";
import { handleAdvisor } from "../src/advisor.js";
import DATA from "../src/data.json";

const SITE = "https://madeinegyptgate.com";
const FROM = "منصة صنع في مصر <noreply@madeinegyptgate.com>";
let sent, wa, searches, realFetch;
function mockFetch({ respondStatus = 200, braveStatus = 200 } = {}) {
  sent = []; wa = []; searches = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com/")) {
      const b = JSON.parse(init.body);
      sent.push({ from: b.from, to: b.to[0], subject: b.subject, text: b.text, reply_to: b.reply_to, headers: b.headers || {} });
      return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 });
    }
    if (u.startsWith("https://api.respond.io/")) {
      wa.push({ url: u, body: init.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify(respondStatus === 200 ? { messageId: 1000 + wa.length } : { message: "template not approved" }), { status: respondStatus });
    }
    if (u.startsWith("https://api.search.brave.com/")) {
      searches.push({ url: u, key: init.headers && init.headers["X-Subscription-Token"] });
      if (braveStatus !== 200) return new Response("{}", { status: braveStatus });
      return new Response(JSON.stringify({ web: { results: [
        { title: "<strong>مصنع</strong> رخام الجلالة", url: "https://marble-galala.example.com/ar", description: "تصنيع <strong>رخام</strong> جلالة" },
        { title: "same site again", url: "https://marble-galala.example.com/en", description: "dup host" },
        { title: "our own page", url: "https://madeinegyptgate.com/company.html#1", description: "own domain is dropped" },
        { title: "Stone Co", url: "https://stone.example.org/", description: "Marble & granite" },
      ] } }), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  };
}
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: FROM, TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", INBOUND_REPLY_ENABLED: "0", ...(extra || {}) });
function mkCtx() { const p = []; return { waitUntil(x) { p.push(x); }, async done() { while (p.length) await p.shift(); } }; }
async function api(env, method, path, { body, token, ip = "10.0.0.1" } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0 test" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  let data = null; try { data = await res.clone().json(); } catch (e) { /* html */ }
  return { status: res.status, data, res };
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
const MARBLE = { kind: "rfq", name: "Ahmed Buyer", email: "buyer@buyer.test", phone: "01001234567", company: "Buyer Co", message: "نحتاج رخام جلالة 300 متر", payload: { product: "رخام جلالة", sector: "الرخام والجرانيت", quantity: "300 متر", governorate: "CAI" }, source: "form" };
const PLAST = { sector: "الصناعات البلاستيكية", products: "براميل بلاستيك، جراكن", governorate: "القاهرة" };
const RFQ = { kind: "rfq", name: "Ahmed Buyer", email: "buyer@buyer.test", phone: "01001234567", company: "Buyer Co", message: "مطلوب براميل بلاستيك 200 لتر", payload: { product: "براميل بلاستيك", quantity: "500", governorate: "CAI" }, source: "form" };
const loginLink = text => (text.match(/https:\/\/madeinegyptgate\.com\/dashboard\.html#lt=(l1\.[\w.-]+)&tab=incoming&ref=(MIG-\d{2}-[A-Z0-9]{6})/) || []);

beforeEach(() => { realFetch = globalThis.fetch; mockFetch(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("sender: Resend from MAIL_FROM, sensible Reply-To", () => {
  test("every platform email is from «منصة صنع في مصر <noreply@madeinegyptgate.com>»; route mails Reply-To no-reply with «رد من هنا»", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.equal(r.data.status, "routed");
    assert.ok(sent.length >= 3);
    for (const s of sent) assert.equal(s.from, FROM, s.subject);
    const f = sent.find(s => s.to === "plast@f.test" && s.subject.includes(r.data.ref));
    assert.equal(f.reply_to, "noreply@madeinegyptgate.com");
    assert.match(f.text, /رد من هنا/);
    assert.ok(loginLink(f.text)[1], "signed one-time login link");
    assert.match(f.text, /Answer here/);
  });
  test("INBOUND_REPLY_ENABLED=1 → keyed reply address (the old reply-by-email loop keeps working)", async () => {
    const env = env0({ INBOUND_REPLY_ENABLED: "1" });
    await member(env, "plast@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.match(sent.find(s => s.to === "plast@f.test" && s.subject.includes(r.data.ref)).reply_to, new RegExp(`^inq-${r.data.ref.toLowerCase()}-[a-f0-9]{8}@reply\\.madeinegyptgate\\.com$`));
  });
  test("Bassem deal email without Email Routing: Reply-To = the member's own mailbox, no mailto unsubscribe to a dead address", async () => {
    const env = env0({ PLATFORM_KEY: "pk-test" });
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: "re_1" }), { status: 200 }); };
    const H = (p, o = {}) => handleAdvisor(new Request("https://madeinegyptgate.com/api/advisor" + p, { method: o.method || "GET", headers: { "Content-Type": "application/json", ...(o.token ? { Authorization: "Bearer " + o.token } : {}), ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined }), env, {});
    const a = await (await H("/activation", { method: "POST", headers: { "X-Platform-Key": "pk-test" }, body: { member_id: "m1", company: "Delta Cables", email: "owner@delta.test", plan: "partner", send_email: false } })).json();
    const code = a.activation_url.split("#login=")[1];
    const tok = (await (await H("/login", { method: "POST", body: { code } })).json()).token;
    const d = (await (await H("/deals", { method: "POST", token: tok, body: { opportunity: { ref: "T-1", title: "Cables tender", market: "local" } } })).json()).deal;
    assert.equal(d.reply_to, ""); // no deal-<id>@reply… address while Email Routing is off
    const r = await (await H(`/deals/${d.id}/email`, { method: "POST", token: tok, body: { to: "buyer@authority.example", subject: "Offer", body: "Please find our offer." } })).json();
    assert.equal(r.sent, true);
    const c = calls.at(-1).body;
    assert.equal(c.reply_to, "owner@delta.test");
    assert.equal(c.from, "Delta Cables via Made in Egypt Gate <noreply@madeinegyptgate.com>");
    assert.ok(!c.headers["List-Unsubscribe"]);
    assert.match(c.text, /goes to Delta Cables directly/);
    assert.match(c.text, /team@madeinegyptgate\.com/);
  });
});

describe("no registered match → in_progress, admins notified, candidates, «إحنا اللي هنرد»", () => {
  test("buyer gets «جاري معالجة طلبك» (AR + EN), admins get console bell + email with directory candidates; needs_team in the console", async () => {
    const env = env0();
    const admin = await signIn(env, "boss@mig.test");
    sent.length = 0;
    const r = await api(env, "POST", "/api/inquiries", { body: MARBLE });
    assert.equal(r.status, 201);
    assert.deepEqual([r.data.status, r.data.routed], ["in_progress", 0]);
    // buyer: receipt says it, Reply-To is the team mailbox (more details reach the admins)
    const rc = sent.find(s => s.to === "buyer@buyer.test");
    assert.match(rc.text, /جاري معالجة طلبك/);
    assert.match(rc.text, /We're working on your request/);
    assert.equal(rc.reply_to, "team@madeinegyptgate.com");
    // track page: status + label + buyer-visible event
    const t = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567&lang=en`);
    assert.equal(t.data.status, "in_progress");
    assert.equal(t.data.status_label, "We're working on your request");
    assert.equal(t.data.events.at(-1).type, "in_progress");
    assert.match(t.data.events.at(-1).body, /We're working on your request/);
    // admins: one email per distinct mailbox (TEAM_EMAIL + ADMIN_EMAILS), never to directory factories
    const notices = sent.filter(s => /مطلوب رد الإدارة/.test(s.subject));
    assert.deepEqual(notices.map(s => s.to).sort(), ["boss@mig.test", "team@madeinegyptgate.com"]);
    assert.match(notices[0].text, /company\.html#\d+/);
    assert.match(notices[0].text, /بحث الويب مش مفعّل/);
    assert.ok(sent.every(s => /@(buyer\.test|mig\.test|madeinegyptgate\.com)$/.test(s.to)), "nobody outside the platform was contacted");
    // console bell for the admin account
    const n = await api(env, "GET", "/api/me/notifications", { token: admin.token });
    assert.ok(n.data.items.some(x => x.kind === "team_needed" && x.ref === r.data.ref && x.url === "inbox.html#" + r.data.ref));
    // console list + detail
    const l = await api(env, "GET", "/api/admin/inquiries", { token: admin.token });
    assert.equal(l.data.items[0].needs_team, true);
    assert.equal(l.data.counts.needs_team, 1);
    assert.equal((await api(env, "GET", "/api/admin/inquiries?status=needs_team", { token: admin.token })).data.items.length, 1);
    const d = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: admin.token });
    assert.equal(d.status, 200);
    assert.equal(d.data.needs_team, true);
    assert.ok(d.data.candidates.length > 0 && d.data.candidates.length <= 12);
    for (const c of d.data.candidates) {
      for (const k of ["name", "governorate", "sector", "source", "url", "profile_url", "snippet"]) assert.ok(k in c, k);
      assert.equal(c.source, "directory");
      assert.match(c.url, /^https:\/\/madeinegyptgate\.com\/company\.html#x?\d+$/);
    }
    assert.ok(d.data.candidates.some(c => /رخام/.test(c.name + c.sector)));
    assert.ok(!d.data.events.some(e => e.type === "candidates"), "the candidate list is a field, not timeline noise");
    assert.ok(d.data.events.some(e => e.type === "team_notified" && e.meta.emailed === 2));
    assert.deepEqual(d.data.web_search, { provider: "", skipped: "no_key" });
    assert.equal(searches.length, 0, "no web search without a key");
  });
  test("web search only with a key: Brave results become web candidates (own domain dropped, one per host); errors never leak the key", async () => {
    const env = env0({ BRAVE_SEARCH_KEY: "brv-secret" });
    const admin = await signIn(env, "boss@mig.test");
    const r = await api(env, "POST", "/api/inquiries", { body: MARBLE });
    assert.equal(searches.length, 1);
    assert.equal(searches[0].key, "brv-secret");
    assert.equal(new URL(searches[0].url).searchParams.get("q"), "رخام جلالة مصنع مصر -site:madeinegyptgate.com");
    const d = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: admin.token });
    const web = d.data.candidates.filter(c => c.source === "web");
    assert.deepEqual(web.map(c => c.url), ["https://marble-galala.example.com/ar", "https://stone.example.org/"]);
    assert.equal(web[0].name, "مصنع رخام الجلالة"); // tags stripped
    assert.equal(d.data.web_search.provider, "brave");
    // refresh endpoint
    mockFetch({ braveStatus: 401 });
    const f = await api(env, "POST", `/api/admin/inquiries/${r.data.ref}/candidates/refresh`, { token: admin.token });
    assert.equal(f.status, 200);
    assert.ok(f.data.candidates.length > 0 && f.data.candidates.every(c => c.source === "directory"));
    assert.equal(f.data.web_search.error, "brave 401");
    assert.ok(!JSON.stringify(f.data).includes("brv-secret"));
    assert.equal((await api(env, "POST", `/api/admin/inquiries/${r.data.ref}/candidates/refresh`)).status, 401);
  });
  test("«إحنا اللي هنرد»: reply → buyer email (Reply-To team) + team event on the track page; whatsapp falls back to email; statuses", async () => {
    const env = env0();
    const admin = await signIn(env, "boss@mig.test");
    const buyer = await signIn(env, "buyer@buyer.test");
    const r = await api(env, "POST", "/api/inquiries", { body: { ...MARBLE, consent_wa: true } });
    const ref = r.data.ref;
    assert.equal((await api(env, "POST", `/api/admin/inquiries/${ref}/reply`, { token: admin.token, body: { body: "" } })).data.code, "body_required");
    assert.equal((await api(env, "POST", `/api/admin/inquiries/${ref}/reply`, { token: admin.token, body: { body: "x", status: "routed" } })).data.code, "invalid_status");
    assert.equal((await api(env, "POST", `/api/admin/inquiries/${ref}/reply`, { token: buyer.token, body: { body: "x" } })).status, 403);
    sent.length = 0;
    const a = await api(env, "POST", `/api/admin/inquiries/${ref}/reply`, { token: admin.token, body: { body: "لقينا مصنعين رخام في الجلالة وبنرتب معاهم عرض سعر.", channel: "email", status: "in_progress" } });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.deepEqual([a.data.ok, a.data.sent, a.data.status], [true, { email: true, whatsapp: false }, "in_progress"]);
    const m = sent.find(s => s.to === "buyer@buyer.test");
    assert.equal(m.reply_to, "team@madeinegyptgate.com");
    assert.equal(m.from, FROM);
    assert.match(m.text, /لقينا مصنعين رخام/);
    let t = await api(env, "GET", `/api/inquiries/${ref}`, { token: buyer.token }); // the buyer's own session (last-4 alone is redacted)
    const e = t.data.events.at(-1);
    assert.deepEqual([e.type, e.actor], ["team_reply", "team"]);
    assert.match(e.body, /رد إدارة منصة صنع في مصر/);
    assert.equal(t.data.status, "in_progress");
    let d = await api(env, "GET", `/api/admin/inquiries/${ref}`, { token: admin.token });
    assert.equal(d.data.needs_team, true); // still working on it
    // the buyer's bell
    assert.ok((await api(env, "GET", "/api/me/notifications", { token: buyer.token })).data.items.some(x => x.kind === "inquiry_team_reply"));
    // WhatsApp asked, no approved buyer template → e-mail carries it (owner: everything falls back to email until Meta approves)
    sent.length = 0;
    const w = await api(env, "POST", `/api/admin/inquiries/${ref}/reply`, { token: admin.token, body: { body: "العرض وصل: 950 جنيه للمتر.", channel: "whatsapp" } });
    assert.deepEqual([w.data.sent, w.data.fallback, w.data.status], [{ email: true, whatsapp: false }, "email", "replied"]);
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /950/.test(s.text)));
    d = await api(env, "GET", `/api/admin/inquiries/${ref}`, { token: admin.token });
    assert.equal(d.data.needs_team, false);
    const c = await api(env, "POST", `/api/admin/inquiries/${d.data.inquiry.id}/reply`, { token: admin.token, body: { body: "تم التوريد، شكراً لك.", channel: "both", status: "closed" } });
    assert.deepEqual([c.data.status, c.data.sent.email], ["closed", true]);
    t = await api(env, "GET", `/api/inquiries/${ref}?last4=4567`);
    assert.equal(t.data.status, "closed");
  });
  test("a matching member joins later → the in_progress request goes to it automatically and stops needing the team", async () => {
    const env = env0();
    const admin = await signIn(env, "boss@mig.test");
    const r = await api(env, "POST", "/api/inquiries", { body: MARBLE });
    assert.equal(r.data.status, "in_progress");
    await member(env, "marble@f.test", "basic", { sector: "الرخام والجرانيت", products: "رخام جلالة، جرانيت" });
    const d = await api(env, "GET", `/api/admin/inquiries/${r.data.ref}`, { token: admin.token });
    assert.deepEqual([d.data.inquiry.status, d.data.needs_team, d.data.inquiry.routed_count], ["routed", false, 1]);
  });
  test("every delivery failed for good (cron) → in_progress, buyer told by email, admins notified", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "down" }), { status: 500 });
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.equal(r.data.status, "received");
    await env.DB.prepare("UPDATE inquiry_routes SET attempts = 4").run();
    mockFetch();
    // provider still refuses this one factory's address; force the last attempt to fail
    await env.DB.prepare("UPDATE members SET email = 'not-an-email' WHERE email = 'plast@f.test'").run();
    const out = await inquiriesCron(env);
    assert.equal(out.team, 1);
    const t = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.equal(t.data.status, "in_progress");
    assert.ok(sent.some(s => s.to === "buyer@buyer.test" && /جاري معالجة طلبك/.test(s.text)));
    assert.ok(sent.some(s => s.to === "team@madeinegyptgate.com" && /مطلوب رد الإدارة/.test(s.subject)));
  });
  test("directory candidates are scored, admin-only fields, never registered-only noise; web search needs a key", async () => {
    const c = directoryCandidates({}, { kind: "rfq", message: "", sector: "الرخام والجرانيت", governorate: "", payload: { product: "رخام" }, items: [] });
    assert.ok(c.length > 0);
    assert.ok(c[0].score >= c.at(-1).score);
    assert.deepEqual(await webCandidates({}, { payload: { product: "رخام" } }), { provider: "", items: [], skipped: "no_key" });
    assert.deepEqual(directoryCandidates({}, { kind: "rfq", message: "", payload: {}, items: [] }), []);
  });
});

describe("signed one-time login links (POST /api/auth/link)", () => {
  test("route email link → session (bound to the member, single use); tampered / used / expired / changed address → 401", async () => {
    const env = env0();
    const u = await member(env, "plast@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const mail = sent.find(s => s.to === "plast@f.test" && s.subject.includes(r.data.ref));
    const [, t, ref] = loginLink(mail.text);
    assert.equal(ref, r.data.ref);
    const bad = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    assert.equal((await api(env, "POST", "/api/auth/link", { body: { t: bad } })).data.code, "invalid_link");
    assert.equal((await api(env, "POST", "/api/auth/link", { body: { t: "nonsense" } })).status, 401);
    const ok = await api(env, "POST", "/api/auth/link", { body: { t } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.user.id, u.id);
    assert.equal(ok.data.user.email, "plast@f.test");
    assert.match(ok.data.token, /^v2\./);
    const inc = await api(env, "GET", "/api/me/incoming", { token: ok.data.token });
    assert.equal(inc.data.items[0].ref, r.data.ref); // the dashboard opens «طلبات واردة لي» on that request
    const again = await api(env, "POST", "/api/auth/link", { body: { t } });
    assert.deepEqual([again.status, again.data.code], [401, "used_link"]);
    // a second link (48 h reminder) works once; an expired one does not
    await env.DB.prepare("UPDATE inquiry_routes SET sent_at = ?").bind(new Date(Date.now() - 49 * 3600e3).toISOString()).run();
    sent.length = 0;
    assert.equal((await inquiriesCron(env)).reminded, 1);
    const [, t2, ref2] = loginLink(sent.find(s => /تذكير/.test(s.subject)).text);
    assert.equal(ref2, r.data.ref);
    await env.DB.prepare("UPDATE logins SET expires_at = '2000-01-01T00:00:00.000Z' WHERE purpose = 'inq_link' AND used_at = ''").run();
    assert.equal((await api(env, "POST", "/api/auth/link", { body: { t: t2 } })).data.code, "expired_link");
    // an address change voids links mailed to the old address
    await env.DB.prepare("UPDATE logins SET expires_at = '2999-01-01T00:00:00.000Z' WHERE purpose = 'inq_link' AND used_at = ''").run();
    await env.DB.prepare("UPDATE members SET email = 'new@f.test' WHERE id = ?").bind(u.id).run();
    assert.equal((await api(env, "POST", "/api/auth/link", { body: { t: t2 } })).data.code, "invalid_link");
    // an advisor login cannot consume a dashboard link
    assert.equal((await api(env, "POST", "/api/advisor/login", { body: { code: t2.split(".")[2] } })).status, 400);
  });
  test("buyer message relayed to a factory also carries a login link", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const route = (await env.DB.prepare("SELECT id FROM inquiry_routes").first()).id;
    const { respondUrl } = await import("../src/inquiries.js");
    const b = (await respondUrl(env, "b", route)).replace(SITE, "");
    sent.length = 0;
    const res = await worker.fetch(new Request(SITE + b, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "message=" + encodeURIComponent("ممكن عينة؟") }), env, mkCtx());
    assert.equal(res.status, 200);
    const m = sent.find(s => s.to === "plast@f.test");
    assert.equal(loginLink(m.text)[2], r.data.ref);
    assert.match(m.text, /رد من هنا/);
  });
});

describe("Bassem: WhatsApp when live, otherwise e-mail (once per Cairo day)", () => {
  async function partner(env, prefs, extra = {}) {
    await member(env, "core@f.test", "partner", { name: "أحمد", title: "دكتور", phone: "01001112223", sector: "الكابلات", ...extra });
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE email = 'core@f.test'").bind(JSON.stringify(prefs)).run();
  }
  const at = (d, hm) => cairoToUtc(d, hm);
  const count = n => async () => ({ count: n, top: n ? "مناقصة كابلات الجهد المتوسط" : "" });
  test("WA off (no token / WA_DRY_RUN=1) → one Arabic-first email per day with the REAL count, #when= links and a link to Bassem", async () => {
    for (const extra of [{}, { RESPONDIO_TOKEN: "rt", WA_DRY_RUN: "1" }]) {
      const env = env0(extra);
      await partner(env, { wa_optin: true, morning_time: "09:00" });
      sent.length = 0;
      assert.equal((await bassemCron(env, at("2026-11-20", "08:50"), count(3))).email_morning, 0);
      const r = await bassemCron(env, at("2026-11-20", "09:05"), count(3));
      assert.deepEqual([r.morning, r.email_morning, r.failed], [0, 1, 0]);
      const m = sent.find(s => s.to === "core@f.test");
      assert.equal(m.from, "باسم — منصة صنع في مصر <noreply@madeinegyptgate.com>");
      assert.match(m.subject, /صباح الخير يا دكتور أحمد/);
      assert.match(m.text, /صحتك تمام/);
      assert.match(m.text, /الجديد عندك النهارده: 3 فرص جديدة في نطاق باقتك — أهمها: مناقصة كابلات الجهد المتوسط/);
      assert.match(m.text, /تحب نشتغل سوا إمتى النهارده؟/);
      for (const w of ["now", "noon", "evening", "skip"]) assert.ok(m.text.includes(`https://madeinegyptgate.com/advisor.html#when=${w}`), w);
      assert.ok(m.text.includes("https://madeinegyptgate.com/advisor.html\n") || /افتح باسم: https:\/\/madeinegyptgate\.com\/advisor\.html/.test(m.text));
      assert.ok(m.headers["List-Unsubscribe"]);
      assert.ok(m.text.indexOf("صباح الخير") < m.text.indexOf("Good morning")); // Arabic first
      assert.equal(wa.length, 0, "nothing sent to respond.io in dry run");
      assert.equal((await bassemCron(env, at("2026-11-20", "11:00"), count(3))).email_morning, 0); // once per Cairo day
      assert.equal((await bassemCron(env, at("2026-11-21", "09:10"), count(0))).email_morning, 1);   // next day again
      assert.match(sent.at(-1).text, /النهارده مفيش جديد في قطاعك/); // never an invented number
    }
  });
  test("no phone / no WhatsApp opt-in is not needed for the email; WA on + send OK → WhatsApp only, no email", async () => {
    const env = env0({ RESPONDIO_TOKEN: "rt" });
    await partner(env, { morning_time: "09:00" }, { phone: "" });
    sent.length = 0;
    assert.equal((await bassemCron(env, at("2026-11-20", "09:05"), count(0))).email_morning, 1);
    const env2 = await waSwitchOn(env0({ RESPONDIO_TOKEN: "rt" })); // live = token + WA_DRY_RUN not 1 + the panel switch on
    await partner(env2, { wa_optin: true, morning_time: "09:00" });
    sent.length = 0; wa.length = 0;
    const r = await bassemCron(env2, at("2026-11-20", "09:05"), count(2));
    assert.deepEqual([r.morning, r.email_morning], [1, 0]);
    assert.equal(wa[0].body.message.template.name, "bassem_morning");
    assert.ok(!sent.some(s => s.to === "core@f.test"));
  });
  test("WA on but the template is refused (still 'submitted' at Meta) → the same day's email instead", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: "rt" }));
    await partner(env, { wa_optin: true, morning_time: "09:00" });
    mockFetch({ respondStatus: 400 });
    const r = await bassemCron(env, at("2026-11-20", "09:05"), count(1));
    assert.deepEqual([r.morning, r.email_morning], [0, 1]);
    assert.match(sent.find(s => s.to === "core@f.test").text, /1 فرصة جديدة/);
  });
  test("paused → nothing on any channel; basic members never get Bassem; unsubscribed from the bassem list → no email", async () => {
    const env = env0();
    await partner(env, { wa_optin: true, pause: true, morning_time: "09:00", call_today_at: "2026-11-20T13:00" });
    await member(env, "basic@f.test", "basic", { phone: "01001112224" });
    sent.length = 0;
    const r = await bassemCron(env, at("2026-11-20", "13:05"), count(5));
    assert.deepEqual([r.morning, r.email_morning, r.call, r.email_call], [0, 0, 0, 0]);
    assert.equal(sent.length, 0);
    await env.DB.prepare("UPDATE members SET prefs_json = '{}' WHERE email = 'core@f.test'").run();
    await env.DB.prepare("INSERT INTO unsubscribes (email_key, list, created_at) VALUES ('core@f.test', 'bassem', 'x')").run();
    const r2 = await bassemCron(env, at("2026-11-21", "09:05"), count(5));
    assert.deepEqual([r2.email_morning, r2.failed], [0, 0]);
    assert.equal(sent.length, 0);
  });
  test("call time with WA off → «أنا جاهز… اضغط هنا ونتكلم فيديو» email with the one-time live link", async () => {
    const env = env0();
    await partner(env, { morning_time: "09:00", call_today_at: "2026-11-20T13:00" });
    await bassemCron(env, at("2026-11-20", "09:05"), count(0));
    sent.length = 0;
    assert.equal((await bassemCron(env, at("2026-11-20", "12:45"), count(0))).email_call, 0);
    const r = await bassemCron(env, at("2026-11-20", "13:05"), count(0));
    assert.equal(r.email_call, 1);
    const m = sent.find(s => s.to === "core@f.test");
    assert.match(m.text, /أنا جاهز يا دكتور أحمد 👋 اضغط هنا ونتكلم فيديو/);
    assert.match(m.text, /https:\/\/madeinegyptgate\.com\/advisor\.html\?live=1#login=[a-f0-9]{48}&live=1/);
    assert.equal((await bassemCron(env, at("2026-11-20", "13:30"), count(0))).email_call, 0); // once
  });
});

describe("production wrangler.toml", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const active = toml.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  const patterns = [...active.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map(m => m[1]);
  test("routes: never a bare /api/* (it would shadow the Pages Functions /api/seo/*), never the owner's live PHP panel paths", () => {
    assert.ok(patterns.length >= 20);
    for (const p of patterns) {
      assert.ok(!/\/api\/?\*$/.test(p) && !/\/api\*$/.test(p), "catch-all route: " + p);
      assert.ok(!/^(www\.)?madeinegyptgate\.com\/\*$/.test(p), "site-wide route: " + p);
      assert.ok(!/index\.php|panel\.html|login\.html|\/api\/seo/.test(p), "deploy-1 owner path: " + p);
      assert.match(p, /^(www\.)?madeinegyptgate\.com\/(api\/[a-z]+|data\/overlay\.js\*$|media\/u\/\*$)/); // deploy 2: the overlay file + uploaded images
    }
  });
  test("routes: every prefix the Worker serves, on both hosts, one by one", () => {
    const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    const served = [...new Set([...src.matchAll(/\\\/api\\\/([a-z]+)/g)].map(m => m[1]))];
    // "janna": /api/janna/session (src/janna-session.js) is matched by a pattern; lookup + health keep their endsWith checks
    // deploy 2 (Control Center): index (/api/index.php, served but deliberately NOT routed), pay, plans, settings, team
    assert.deepEqual(served.sort(), ["admin", "advisor", "auth", "ev", "inquiries", "janna", "me", "meetings", "unsub", "wa", "index", "pay", "plans", "settings", "team"].sort());
    const need = ["janna/*", "advisor/*", "meetings*", "auth/*", "me", "me/*", "inquiries*", "admin/*", "ev", "unsub*", "wa/*", "plans*", "settings*", "pay/*", "ev/*", "team/*"];
    for (const host of ["madeinegyptgate.com", "www.madeinegyptgate.com"]) for (const n of need) assert.ok(patterns.includes(`${host}/api/${n}`), `${host}/api/${n}`);
    for (const s of served.filter(x => x !== "index")) assert.ok(need.some(n => n.startsWith(s)), s); // /api/index.php: served by index.js, deliberately NOT routed (mis-egypt keeps it)
    assert.ok(!patterns.some(p => /index\.php/.test(p)), "no /api/index.php route");
    for (const host of ["madeinegyptgate.com", "www.madeinegyptgate.com"]) for (const n of ["data/overlay.js*", "media/u/*"]) assert.ok(patterns.includes(`${host}/${n}`), `${host}/${n}`);
    assert.equal(patterns.length, (need.length + 2) * 2);
  });
  test("bindings, cron, vars; no secrets in the file", () => {
    assert.match(active, /name = "janna-lookup"/);
    assert.match(active, /\[\[d1_databases\]\]\s*\nbinding = "DB"\s*\ndatabase_name = "migate-db"\s*\ndatabase_id = "f86e00bb-9739-4985-a149-3dddb45b2b42"/);
    assert.match(active, /\[\[r2_buckets\]\]\s*\nbinding = "MEDIA"\s*\nbucket_name = "migate-media"/);
    /* «ابعتلي» mail packs + the developer panel's intel probe: the ONE service binding, to migate-intel (no secret: notify-items.js PACK_HOST) */
    assert.deepEqual([...active.matchAll(/\[\[services\]\]\s*\nbinding = "([^"]+)"\s*\nservice = "([^"]+)"/g)].map(m => [m[1], m[2]]), [["INTEL", "migate-intel"]]);
    assert.equal((active.match(/\[\[services\]\]/g) || []).length, 1);
    assert.match(active, /crons = \["\*\/15 \* \* \* \*"\]/);
    const v = k => (active.match(new RegExp(`^${k} = "([^"]*)"`, "m")) || [])[1];
    assert.equal(v("ADMIN_EMAILS"), "info@madeinegyptgate.com");
    assert.equal(v("TEAM_EMAIL"), "info@madeinegyptgate.com");
    assert.equal(v("MAIL_FROM"), FROM);
    assert.equal(v("RESPONDIO_CHANNEL_ID"), "580384");
    assert.equal(v("WA_DRY_RUN"), "0"); // deploy 2: the Control Center switch decides (fail-closed, see the next test); "1" = hard kill switch
    assert.equal(v("SITE_URL"), "https://madeinegyptgate.com/");
    assert.equal(v("INBOUND_REPLY_ENABLED"), "0");
    for (const k of ["ADVISOR_SECRET", "MEETINGS_SECRET", "WA_WEBHOOK_SECRET", "PLATFORM_KEY", "RESEND_API_KEY", "ANAM_API_KEY", "RESPONDIO_TOKEN", "TURNSTILE_SECRET", "ADVISOR_OPEN_MODE"]) assert.ok(!new RegExp(`^${k}\\s*=`, "m").test(active), k);
    assert.ok(!/re_[A-Za-z0-9]{10,}/.test(toml));
  });
  test("WA_DRY_RUN = \"0\" is fail-closed: with a token but without the panel switch nothing reaches respond.io; \"1\" still kills it", async () => {
    const v = k => (active.match(new RegExp(`^${k} = "([^"]*)"`, "m")) || [])[1];
    const { sendWA, waLive } = await import("../src/whatsapp.js");
    mockFetch();
    const env = env0({ RESPONDIO_TOKEN: "rt", WA_DRY_RUN: v("WA_DRY_RUN"), RESPONDIO_CHANNEL_ID: v("RESPONDIO_CHANNEL_ID") });
    let h = await api(env, "GET", "/api/wa/health");
    assert.deepEqual([h.data.whatsapp, h.data.dry_run, h.data.switch, h.data.reason], [true, true, false, "switch_off"]);
    assert.equal((await sendWA(env, "01001112223", { text: "x" })).error, "dry run");
    assert.equal(wa.length, 0, "nothing sent with the production vars and the switch off");
    await waSwitchOn(env);
    h = await api(env, "GET", "/api/wa/health");
    assert.deepEqual([h.data.dry_run, h.data.reason, h.data.channel], [false, "live", 580384]);
    assert.equal((await sendWA(env, "01001112223", { text: "x" })).sent, true);
    assert.equal(wa.length, 1);
    const killed = { ...env, WA_DRY_RUN: "1" };
    assert.equal(waLive(killed), false);
    assert.equal((await sendWA(killed, "01001112223", { text: "x" })).error, "dry run");
    assert.equal(wa.length, 1);
  });
  test("README lists every secret", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const k of ["ADVISOR_SECRET", "MEETINGS_SECRET", "WA_WEBHOOK_SECRET", "PLATFORM_KEY", "RESEND_API_KEY", "ANAM_API_KEY", "RESPONDIO_TOKEN", "TURNSTILE_SECRET", "BRAVE_SEARCH_KEY", "GOOGLE_CSE_KEY", "CONFIG_SECRET", "TOOL_SECRET", "WEBSEARCH_KEY"]) assert.ok(readme.includes(k), k);
  });
});

describe("D1 launch order: schema.sql → 0004 → 0005", () => {
  const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).sort();
  test("applies cleanly on an empty D1, and again (no-ops)", () => {
    const db = new DatabaseSync(":memory:");
    for (let i = 0; i < 2; i++) for (const f of ["schema.sql", "migrations/0004_interactive_platform.sql", "migrations/0005_qa_fixes.sql", "migrations/0006_admin_center.sql"]) db.exec(read(f));
    for (const t of ["members", "logins", "inquiries", "inquiry_events", "inquiry_routes", "quotes", "follows", "notifications", "unsubscribes", "wa_messages", "meetings"]) assert.ok(cols(db, t).length > 2, t);
    assert.ok(!/^\s*ALTER TABLE/m.test(read("migrations/0004_interactive_platform.sql") + read("migrations/0005_qa_fixes.sql") + read("migrations/0006_admin_center.sql")));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc_%'").get().n, 32); // + cc_delete_requests (0010)
  });
  test("an old advisor-only database: tools/upgrade-pre-0004.sql → 0004 → 0005 gives the same tables as schema.sql", () => {
    const full = new DatabaseSync(":memory:"); full.exec(read("schema.sql"));
    const old = new DatabaseSync(":memory:");
    old.exec("CREATE TABLE members (id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);");
    for (const f of ["tools/upgrade-pre-0004.sql", "migrations/0004_interactive_platform.sql", "migrations/0005_qa_fixes.sql", "migrations/0006_admin_center.sql"]) old.exec(read(f));
    for (const t of ["members", "inquiries", "inquiry_routes", "follows", "notifications", "quotes", "wa_messages", "auth_sessions"]) assert.deepEqual(cols(old, t), cols(full, t), t);
  });
});

describe("cleaned directory index (worker/src/data.json)", () => {
  test("real counts: f = 2,926 members + 94 public-source, p 183, t 436, q 5, o 102, z 64; new company indices", () => {
    const mem = DATA.f.filter(f => /company\.html#\d+$/.test(f[5])), pub = DATA.f.filter(f => /company\.html#x\d+$/.test(f[5]));
    assert.deepEqual([mem.length, pub.length, DATA.p.length, DATA.t.length, DATA.q.length, DATA.o.length, DATA.z.length], [2926, 94, 183, 436, 5, 102, 64]);
    assert.equal(Math.max(...mem.map(f => +f[5].split("#")[1])), 2925);
    assert.equal(Math.max(...pub.map(f => +f[5].split("#x")[1])), 93);
    assert.ok(!/26[,.]?808|14[,.]?820|11[,.]?988/.test(JSON.stringify(DATA)));
  });
  test("tender status: the honest 4-value rule, at request time", () => {
    const allowed = new Set(["سارية", "تنتهي قريباً", "منتهية", "غير محدد الموعد"]);
    for (const t of DATA.t) assert.ok(allowed.has(t[2]), t[2]);
    const now = cairoToUtc("2026-11-18", "12:00");
    assert.equal(tenderStatus("", now), "غير محدد الموعد");
    assert.equal(tenderStatus("2026-11-17", now), "منتهية");
    assert.equal(tenderStatus("2026-11-18", now), "تنتهي قريباً");
    assert.equal(tenderStatus("2026-11-25", now), "تنتهي قريباً");
    assert.equal(tenderStatus("2026-11-26", now), "سارية");
    const res = search("tenders", "مناقصة", "", 10);
    for (const r of res.results) assert.equal(r.status, tenderStatus(r.deadline));
  });
});

describe("security review fixes (early-security.md)", () => {
  const trackT = async (env, ref) => (await import("../src/inquiries.js")).trackUrl(env, ref).then(u => u.split("~")[1]);
  test("H1: last-4 tries are counted BEFORE the compare — 10 per request per day, then even the right digits get 404", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/inquiries", { body: MARBLE });
    for (let i = 0; i < 10; i++) assert.equal((await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=${String(1000 + i)}`, { ip: "10.9.0." + i })).status, 404);
    assert.equal((await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`, { ip: "10.9.1.1" })).status, 404);
    assert.equal((await api(env, "GET", `/api/inquiries/${r.data.ref}?t=${await trackT(env, r.data.ref)}`)).status, 200); // the signed link still works
  });
  test("H1: a parallel burst from one IPv6 /64 never finds the digits; after 20 wrong tries last-4 is closed for good", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/inquiries", { body: MARBLE });
    const tries = Array.from({ length: 60 }, (_, i) => (i === 59 ? "4567" : String(2000 + i)));
    const res = await Promise.all(tries.map((d, i) => api(env, "GET", `/api/inquiries/${r.data.ref}?last4=${d}`, { ip: `2001:db8:77:1::${(i + 1).toString(16)}` })));
    assert.ok(res.every(x => x.status !== 200), "no try succeeded");
    const env2 = env0();
    const r2 = await api(env2, "POST", "/api/inquiries", { body: MARBLE });
    await env2.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 20, '2999-01-01T00:00:00.000Z')").bind(`trackl4dead|${r2.data.ref}|${Math.floor(Date.now() / 1000 / (10 * 365 * 86400))}`).run();
    assert.equal((await api(env2, "GET", `/api/inquiries/${r2.data.ref}?last4=4567`)).status, 404);
    assert.equal((await api(env2, "GET", `/api/inquiries/${r2.data.ref}?t=${await trackT(env2, r2.data.ref)}`)).status, 200);
  });
  test("H1: last-4 alone sees no quotes, replies, messages or the chosen factory; the signed link sees them", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", { ...PLAST, factory_ref: "12" });
    const f = await signIn(env, "plast@f.test");
    const r = await api(env, "POST", "/api/inquiries", { body: { ...RFQ, target_type: "company", target_id: "12", target_name: "مصنع النيل للبلاستيك" } });
    assert.equal((await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: f.token, body: { price: "450", currency: "EGP", note: "تسليم أسبوع" } })).status, 200);
    const a = await api(env, "GET", `/api/inquiries/${r.data.ref}?last4=4567`);
    assert.deepEqual([a.status, a.data.proof, a.data.redacted, a.data.target_name], [200, "last4", true, ""]);
    assert.equal(a.data.events.at(-1).type, "quote");
    assert.ok(!JSON.stringify(a.data).includes("450") && !JSON.stringify(a.data).includes("مصنع النيل"));
    const b = await api(env, "GET", `/api/inquiries/${r.data.ref}?t=${await trackT(env, r.data.ref)}`);
    assert.deepEqual([b.data.proof, b.data.redacted, b.data.target_name], ["link", false, "مصنع النيل للبلاستيك"]);
    assert.match(b.data.events.at(-1).body, /450/);
  });
  test("M1: IPv6 addresses count per /64 (20 code e-mails per network per hour); one global hourly budget of code e-mails", async () => {
    const { ipNet } = await import("../src/common.js");
    assert.equal(ipNet("2001:db8:1:2::abcd"), ipNet("2001:0db8:0001:0002:ffff:1:2:3"));
    assert.notEqual(ipNet("2001:db8:1:2::1"), ipNet("2001:db8:1:3::1"));
    assert.equal(ipNet("::ffff:10.1.2.3"), "10.1.2.3");
    const env = env0();
    const st = [];
    for (let i = 0; i < 22; i++) st.push((await api(env, "POST", "/api/auth/request", { ip: `2001:db8:1:2::${(i + 1).toString(16)}`, body: { email: `u${i}@x.test` } })).status);
    assert.deepEqual([st.slice(0, 20).every(s => s === 200), st[20], st[21]], [true, 429, 429]);
    const env2 = env0({ AUTH_CODES_PER_HOUR: "10" });
    const g = [];
    for (let i = 0; i < 11; i++) g.push((await api(env2, "POST", "/api/auth/request", { ip: `10.20.${i}.1`, body: { email: `g${i}@x.test` } })).status);
    assert.deepEqual([g.slice(0, 10).every(s => s === 200), g[10]], [true, 429]);
  });
  test("M2: a login link opens a 24 h LIMITED session — answers requests, but no Bassem, no profile / settings changes", async () => {
    const env = env0({ PLATFORM_KEY: "pk" });
    await member(env, "core@f.test", "partner", PLAST);
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const [, t] = loginLink(sent.find(s => s.to === "core@f.test" && s.subject.includes(r.data.ref)).text);
    const l = await api(env, "POST", "/api/auth/link", { body: { t } });
    assert.equal(l.data.scope, "link");
    const hours = (Date.parse(l.data.expires_at) - Date.now()) / 3600e3;
    assert.ok(hours > 23 && hours <= 24, String(hours));
    const tok = l.data.token;
    assert.equal((await api(env, "GET", "/api/me", { token: tok })).status, 200);
    assert.equal((await api(env, "GET", "/api/me/incoming", { token: tok })).data.items[0].ref, r.data.ref);
    assert.equal((await api(env, "POST", `/api/me/incoming/${r.data.ref}/quote`, { token: tok, body: { price: "100" } })).status, 200);
    for (const [m, p, body] of [["PATCH", "/api/me", { phone: "01009998887" }], ["POST", "/api/me/prefs", { wa_optin: true }], ["PATCH", "/api/me/prefs", { pause: true }]]) {
      const x = await api(env, m, p, { token: tok, body });
      assert.deepEqual([x.status, x.data.code], [403, "full_login_required"], m + " " + p);
    }
    const adv = await api(env, "GET", "/api/advisor/deals", { token: tok });
    assert.deepEqual([adv.status, adv.data.code], [403, "full_login_required"]);
    const full = await signIn(env, "core@f.test"); // an e-mail code gives the normal session
    assert.equal((await api(env, "GET", "/api/advisor/deals", { token: full.token })).status, 200);
    assert.equal((await api(env, "PATCH", "/api/me", { token: full.token, body: { name: "Core" } })).status, 200);
  });
  test("M2: admin accounts never get login links, and a link cannot open an admin session", async () => {
    const env = env0();
    await member(env, "boss@mig.test", "basic", PLAST); // the admin is also a member factory
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    const m = sent.find(s => s.to === "boss@mig.test" && s.subject.includes(r.data.ref));
    assert.ok(!loginLink(m.text)[1], "no #lt= for an admin");
    assert.ok(m.text.includes(`dashboard.html#tab=incoming&ref=${r.data.ref}`));
    const { signLoginLink } = await import("../src/auth.js");
    const boss = await env.DB.prepare("SELECT * FROM members WHERE email = 'boss@mig.test'").first();
    assert.equal(await signLoginLink(env, boss), "");
  });
  test("M3: a signed-in account sending under another address is treated as anonymous (links removed, 'not confirmed', not attached)", async () => {
    const env = env0();
    await member(env, "plast@f.test", "basic", PLAST);
    const att = await signIn(env, "attacker@evil.test");
    sent.length = 0;
    const r = await api(env, "POST", "/api/inquiries", { token: att.token, body: { ...RFQ, email: "ceo@victim.test", message: "مطلوب براميل بلاستيك — التفاصيل https://evil.example/login" } });
    assert.equal(r.status, 201);
    const f = sent.find(s => s.to === "plast@f.test");
    assert.ok(!f.text.includes("evil.example"), "link removed");
    assert.match(f.text, /بريده لسه ماتأكدش/);
    assert.equal((await api(env, "GET", "/api/me/inquiries", { token: att.token })).data.items.length, 0);
    const own = await api(env, "POST", "/api/inquiries", { token: att.token, ip: "10.7.7.7", body: { ...RFQ, email: "attacker@evil.test", message: "براميل بلاستيك تانية" } });
    assert.equal((await api(env, "GET", "/api/me/inquiries", { token: att.token })).data.items.map(x => x.ref)[0], own.data.ref);
  });
  test("L1: parallel wrong codes — at most 5 are ever compared, then the code is burnt", async () => {
    const env = env0();
    assert.equal((await api(env, "POST", "/api/auth/request", { body: { email: "p@x.test" } })).status, 200);
    const code = codeOf("p@x.test"), wrong = code === "000000" ? "111111" : "000000";
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => api(env, "POST", "/api/auth/verify", { ip: "10.30.0." + i, body: { email: "p@x.test", code: wrong } })));
    assert.ok(res.filter(x => x.data.attempts_left !== undefined).length <= 5); // compared; the rest found the code burnt or refused
    assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "p@x.test", code } })).status, 401); // burnt
  });
  test("L2 / L6 / L8: no protocol-relative follow URLs; answer links expire; webhook secret accepted in a header", async () => {
    const env = env0({ WA_WEBHOOK_SECRET: "whs", RESPONDIO_TOKEN: "rt" });
    const u = await signIn(env, "f@x.test");
    await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "search", ref_id: "رخام", label: "رخام", url: "//evil.example/phish" } });
    await api(env, "POST", "/api/me/follows", { token: u.token, body: { kind: "search", ref_id: "جرانيت", label: "جرانيت", url: "/\\evil.example" } });
    assert.ok((await api(env, "GET", "/api/me/follows", { token: u.token })).data.items.every(f => !f.url));
    const { respondUrl } = await import("../src/inquiries.js");
    const old = (await respondUrl(env, "r", "0123abcd", Date.now() - 61 * 86400e3)).replace(SITE, "");
    assert.equal((await worker.fetch(new Request(SITE + old), env, mkCtx())).status, 410);
    const wh = await worker.fetch(new Request(SITE + "/api/wa/inbound", { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": "whs" }, body: JSON.stringify({ contact: { phone: "+201001112223" }, message: { message: { text: "hi" } } }) }), env, mkCtx());
    assert.equal(wh.status, 200);
    assert.equal((await worker.fetch(new Request(SITE + "/api/wa/inbound", { method: "POST", headers: { "X-Webhook-Secret": "nope" }, body: "{}" }), env, mkCtx())).status, 401);
  });
});
