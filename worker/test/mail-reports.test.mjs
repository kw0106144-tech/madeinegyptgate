// The owner's 2026-11-28 mail decisions (migration 0015): request teasers to unregistered directory factories (teasers.js), the 10:00
// member / partner (PDF) reports and the owner's daily report (daily-mail.js), the instant alerts to info@ (info-alerts.js).
// Every provider call is mocked (no real e-mail leaves). Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { platformCron } from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { cairoToUtc } from "../src/meetings.js";
import { cairoDay } from "../src/common.js";
import { directoryCandidates } from "../src/candidates.js";
import { officialEmail, planForMarket } from "../src/mail-sends.js";
import { teasersCron, teaserTitle, teaserFacts, teaseInquiry, officialAddresses } from "../src/teasers.js";
import DATA from "../src/data.json";
import { memberReportsCron, ownerReportCron, mailCron } from "../src/daily-mail.js";
import { regTrouble } from "../src/info-alerts.js";
import { items, syncSeen } from "../src/digest.js";
import { storeJson, forgetFeatures } from "../src/flags.js";
import { reportPdf } from "../src/pdf-report.js";

const SITE = "https://madeinegyptgate.com";
let sent, realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch; sent = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com/")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text, headers: b.headers || {}, attachments: b.attachments || [], from: b.from }); return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 }); }
    throw new Error("unexpected fetch " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "noreply@madeinegyptgate.com", TEAM_EMAIL: "info@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", ...(extra || {}) });
function mkCtx() { const p = []; return { waitUntil(x) { p.push(x); }, async done() { await Promise.all(p); } }; }
async function api(env, method, path, { body, headers = {}, raw } = {}) {
  const h = { "CF-Connecting-IP": "10.0.0.9", "User-Agent": "Mozilla/5.0 test", Origin: SITE, ...headers };
  if (body !== undefined && !raw) h["Content-Type"] = "application/json";
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  let data = null; try { data = await res.clone().json(); } catch (e) { /* html */ }
  return { status: res.status, data, res };
}
const now = () => new Date().toISOString();
async function addMember(env, { id, email, plan = "basic", company = "Co " + id, sector = "", products = "", factory_ref = "", governorate = "" }) {
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, sector, products, factory_ref, governorate, email_verified_at, activated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, company, email, plan, now(), now(), sector, products, factory_ref, governorate, now(), now()).run();
}
async function addContact(env, ref, email, src = "https://www.example-factory.com.eg/contact") {
  await env.DB.prepare("INSERT INTO directory_contacts (factory_ref, company, email, email_key, source_url, created_at, updated_at) VALUES (?, 'Directory Co', ?, ?, ?, ?, ?)").bind(ref, email, email, src, now(), now()).run();
}
const RFQ = { kind: "rfq", name: "Ahmed Buyer", company: "Buyer Co", email: "buyer@buyer.test", phone: "+20 100 123 4567", message: "محتاجين براميل بلاستيكية سعة 220 لتر، كلموني على 01001234567",
  payload: { product: "براميل بلاستيك 500 قطعة", sector: "الصناعات البلاستيكية", governorate: "الجيزة", quantity: "500", budget: "250000 جنيه" } };
const later = (min = 15) => Date.now() + min * 60000;
const refsFor = env => directoryCandidates(env, { payload: RFQ.payload, message: RFQ.message, sector: RFQ.payload.sector, items: [] }, 12).map(c => /#(.+)$/.exec(c.profile_url)[1]);
const teasersTo = addr => sent.filter(s => s.to === addr && /^طلب جديد في مجالكم/.test(s.subject));

describe("official company addresses", () => {
  test("role mailboxes on the company's own domain only — never a person, never free mail, the known site's domain", () => {
    assert.equal(officialEmail("Info@Acme-Plast.com.eg"), "info@acme-plast.com.eg");
    assert.equal(officialEmail("sales@acme.com", "https://www.acme.com/contact"), "sales@acme.com");
    assert.equal(officialEmail("ahmed.ali@acme.com"), "", "a person's address");
    assert.equal(officialEmail("info@gmail.com"), "", "free mail");
    assert.equal(officialEmail("info@yahoo.com"), "");
    assert.equal(officialEmail("info@other.com", "https://acme.com/"), "", "not the company's site");
    assert.equal(officialEmail("not an address"), "");
  });
  test("the registration plan of a request's market", () => {
    assert.deepEqual(["local", "gulf", "africa", "asia", "europe"].map(planForMarket), ["basic", "premium", "partner", "strategic", "strategic"]);
  });
});

describe("researched directory rows: their official e-mail (data/facx.js element 10 → data.json oe) is a teaser source", () => {
  const contactTo = ref => ({ ref: "T-" + ref, kind: "contact", target_type: "factory", target_id: "company.html#" + ref, target_name: "", payload: { product: "سبائك حديد" },
    items: [], sector: "", created_at: now(), email_key: "buyer@buyer.test" });
  const withOe = async (patch, fn) => { const keep = { ...(DATA.oe || {}) }; DATA.oe = { ...keep, ...patch }; try { return await fn(); } finally { DATA.oe = keep; } };
  test("the bundled official address of a researched profile gets the teaser (role mailbox on the company's own site, with its source page)", async () => {
    const row = (DATA.f || []).find(f => /company\.html#x\d+$/.test(f[5])), ref = /#(x\d+)$/.exec(row[5])[1];
    await withOe({ [ref]: [["Sales@Acme-Co.com.eg"], "https://www.acme-co.com.eg", "https://www.acme-co.com.eg/contact"] }, async () => {
      const env = env0();
      const a = await officialAddresses(env, [ref]);
      assert.equal(a.get(ref).email, "sales@acme-co.com.eg");
      assert.equal(a.get(ref).company, row[0]);
      const r = await teaseInquiry(env, contactTo(ref));
      assert.equal(r.sent, 1, JSON.stringify(r));
      const [t] = teasersTo("sales@acme-co.com.eg");
      assert.ok(t, "teaser sent"); assert.ok(!/buyer@buyer\.test/.test(t.text));
      assert.equal((await teaseInquiry(env, contactTo(ref))).sent, 0, "once per request");
      await addMember(env, { id: "m9", email: "owner@x.test", factory_ref: ref });           // once the profile is a member's: no teaser
      assert.equal((await officialAddresses(env, [ref])).size, 0);
    });
  });
  test("the same rules: no personal mailbox, no free mail, no address off the company's site, no source page → nothing", async () => {
    const env = env0();
    await withOe({ x900001: [["ahmed.ali@acme-co.com"], "https://acme-co.com", "https://acme-co.com/contact"], x900002: [["info@gmail.com"], "", "https://acme-co.com/contact"],
      x900003: [["info@other-co.com"], "https://acme-co.com", "https://acme-co.com/contact"], x900004: [["info@acme-co.com"], "https://acme-co.com", ""] }, async () => {
      const a = await officialAddresses(env, ["x900001", "x900002", "x900003", "x900004"]);
      assert.equal(a.size, 0, JSON.stringify([...a]));
    });
  });
});

describe("request routing: members get the full request, unregistered factories a teaser only", () => {
  test("member full + one business day; non-member teaser: title / sector / region / date + register link + stop link, nothing else", async () => {
    const env = env0();
    const refs = refsFor(env); assert.ok(refs.length >= 2, "the directory has candidates for the request");
    await addMember(env, { id: "m1", email: "plant@member.test", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك جراكن" });
    await addContact(env, refs[0], "info@example-factory.com.eg");
    const r = await api(env, "POST", "/api/inquiries", { body: RFQ });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const full = sent.find(s => s.to === "plant@member.test" && /^طلب جديد من منصة صنع في مصر/.test(s.subject));
    assert.ok(full, "the member got the full request");
    assert.match(full.text, /خلال يوم عمل واحد/); assert.match(full.text, /within one business day/);
    assert.match(full.text, /Ahmed/, "the full request names the buyer");
    // before 10 minutes: nothing yet (the team can block a spam request first)
    assert.equal((await teasersCron(env, Date.now())).sent, 0);
    const out = await teasersCron(env, later());
    assert.equal(out.sent, 1, JSON.stringify(out));
    const [t] = teasersTo("info@example-factory.com.eg");
    assert.ok(t, "teaser sent");
    for (const bad of ["Ahmed", "Buyer Co", "buyer@buyer.test", "123 4567", "01001234567", "500", "250000", "220"]) assert.ok(!t.text.includes(bad), "teaser must not contain " + bad);
    assert.match(t.text, /براميل بلاستيك/); assert.match(t.text, /الصناعات البلاستيكية/); assert.match(t.text, /الجيزة/);
    assert.match(t.text, /آخر موعد: \d{4}-\d{2}-\d{2}/);
    assert.match(t.text, /https:\/\/madeinegyptgate\.com\/register\/#basic/);
    assert.match(t.text, /خلال يوم عمل واحد/); assert.match(t.text, /within one business day/);
    assert.match(t.headers["List-Unsubscribe"], /api\/unsub\?.*l=teaser/);
    assert.equal(t.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    // the member's address never gets a teaser
    assert.equal(teasersTo("plant@member.test").length, 0);
  });
  test("one e-mail per request per address (dedupe), the stop link works and blocks the next teaser, a member's profile is never teased", async () => {
    const env = env0(), refs = refsFor(env);
    await addContact(env, refs[0], "sales@example-factory.com.eg");
    await addContact(env, refs[1], "info@second-factory.com", "https://second-factory.com/about");
    await addMember(env, { id: "m2", email: "owner@second.test", factory_ref: refs[1] }); // refs[1] is a member's profile
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    await teasersCron(env, later()); await teasersCron(env, later(20));
    assert.equal(teasersTo("sales@example-factory.com.eg").length, 1, "once per request");
    assert.equal(teasersTo("info@second-factory.com").length, 0, "a member's profile: no teaser");
    // the stop link
    const link = /<(https:[^>]+)>/.exec(teasersTo("sales@example-factory.com.eg")[0].headers["List-Unsubscribe"])[1];
    const stop = await api(env, "POST", link.replace(SITE, ""), { body: "", raw: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(stop.status, 200);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM unsubscribes WHERE list = 'teaser'").first("x"));
    await api(env, "POST", "/api/inquiries", { body: { ...RFQ, email: "buyer2@buyer.test", message: "براميل بلاستيك تانية" } });
    await teasersCron(env, later(30));
    assert.equal(teasersTo("sales@example-factory.com.eg").length, 1, "a stopped address never gets another teaser");
  });
  test("daily cap; the owner's switch off → nothing", async () => {
    const env = env0({ TEASER_DAILY_CAP: "1" }), refs = refsFor(env);
    await addContact(env, refs[0], "info@one-factory.com", "https://one-factory.com/");
    await addContact(env, refs[1], "info@two-factory.com", "https://two-factory.com/");
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    const r = await teasersCron(env, later());
    assert.equal(r.sent, 1); assert.ok(r.capped);
    assert.equal(sent.filter(s => /^طلب جديد في مجالكم/.test(s.subject)).length, 1);
    const env2 = env0(), refs2 = refsFor(env2);
    await env2.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?)").bind(storeJson({ request_teasers: false }, {}), now()).run();
    forgetFeatures(env2);
    await addContact(env2, refs2[0], "info@one-factory.com", "https://one-factory.com/");
    await api(env2, "POST", "/api/inquiries", { body: RFQ });
    sent.length = 0;
    assert.equal((await teasersCron(env2, later())).off, "feature_off");
    assert.equal(sent.length, 0);
  });
  test("the teaser title drops amounts, quantities, phones, e-mails and links", () => {
    const env = env0();
    const t = teaserTitle(env, { kind: "rfq", payload: { product: "صاج مجلفن 20 طن بسعر 500000 جنيه اتصل 01001234567 a@b.com https://x.example" }, items: [] });
    assert.equal(t, "صاج مجلفن");
    const f = teaserFacts(env, { kind: "rfq", market: "gulf", payload: {}, items: [], sector: "", created_at: now() });
    assert.equal(f.plan, "premium"); assert.match(f.register_url, /register\/#premium$/);
  });
});

describe("the 10:00 member reports", () => {
  async function setup(extra, market = "local") {
    const env = env0(extra), day = "2026-11-28", list = items();
    const it = list.find(x => x.kind === "tender" && x.market === market && x.sector && x.title);
    await syncSeen(env, list.filter(x => x !== it), cairoToUtc("2026-11-27", "07:00")); // baseline
    await syncSeen(env, list, cairoToUtc(day, "07:00"));                                // the tender appears today
    return { env, day, it };
  }
  test("not before 10:00; at 10:00 a matching member gets the report; nothing to report → no e-mail; once a day", async () => {
    const { env, day, it } = await setup();
    await addMember(env, { id: "a1", email: "match@member.test", sector: it.sector, company: "Match Co" });
    await addMember(env, { id: "a2", email: "nothing@member.test", sector: "قطاع مالوش أي علاقة زززز", products: "ققققق" });
    assert.equal((await memberReportsCron(env, cairoToUtc(day, "09:59"))).waiting, "time");
    const r = await memberReportsCron(env, cairoToUtc(day, "10:00"));
    assert.equal(r.sent, 1, JSON.stringify(r));
    const m = sent.find(s => s.to === "match@member.test");
    assert.ok(m && /تقريرك اليومي/.test(m.subject));
    assert.ok(m.text.includes(it.title.slice(0, 40)), "the matching tender is listed");
    assert.match(m.headers["List-Unsubscribe"], /l=daily/);
    assert.equal(sent.filter(s => s.to === "nothing@member.test").length, 0, "nothing to report → no e-mail");
    await memberReportsCron(env, cairoToUtc(day, "10:15"));
    assert.equal(sent.filter(s => s.to === "match@member.test").length, 1, "once a day");
  });
  test("members-only content follows the plan: an Africa tender is only counted for the Basic plan (no e-mail for a count alone); a partner gets it in Bassem's report with the PDF", async () => {
    const { env, day, it } = await setup(undefined, "africa");
    await addMember(env, { id: "p1", email: "profile@member.test", plan: "basic", sector: it.sector });
    await addMember(env, { id: "p2", email: "partner@member.test", plan: "partner", sector: it.sector, company: "Partner Co" });
    await memberReportsCron(env, cairoToUtc(day, "10:00"));
    assert.equal(sent.filter(s => s.to === "profile@member.test").length, 0, "a locked count alone is no report");
    const p = sent.find(s => s.to === "partner@member.test");
    assert.ok(p && /تقرير باسم اليومي/.test(p.subject), "partner report");
    assert.equal(p.attachments.length, 1);
    assert.equal(p.attachments[0].content_type, "application/pdf");
    assert.ok(Buffer.from(p.attachments[0].content, "base64").subarray(0, 5).toString() === "%PDF-", "a real PDF");
    assert.match(p.text, /PDF/);
    assert.ok(p.text.includes(it.title.slice(0, 30)), "the Africa tender is in the partner's plan");
  });
  test("a member's own activity: requests received and waiting", async () => {
    const { env, day } = await setup();
    await addMember(env, { id: "r1", email: "rfq@member.test", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك" });
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    sent.length = 0;
    await memberReportsCron(env, Date.now() > cairoToUtc(cairoDay(), "10:00") ? Date.now() : cairoToUtc(cairoDay(), "10:00"));
    const m = sent.find(s => s.to === "rfq@member.test");
    assert.ok(m, "report sent");
    assert.match(m.text, /طلبات وصلتك في آخر 24 ساعة: 1/); assert.match(m.text, /طلبات لسه مستنية ردك: 1/);
    void day;
  });
});

describe("the owner's daily report and the alerts to info@", () => {
  test("owner report after 00:30: what was published and every e-mail sent (company, address, what), only to info@", async () => {
    const env = env0();
    await addMember(env, { id: "o1", email: "plant@member.test", company: "Plant Co", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك" });
    await api(env, "POST", "/api/inquiries", { body: RFQ });
    const today = cairoDay();
    const D = new Date(Date.parse(today + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    assert.equal((await ownerReportCron(env, cairoToUtc(D, "00:10"))).waiting, "time");
    sent.length = 0;
    const r = await ownerReportCron(env, cairoToUtc(D, "00:31"));
    assert.equal(r.sent, true, JSON.stringify(r));
    assert.equal(sent.length, 1); const o = sent[0];
    assert.equal(o.to, "info@madeinegyptgate.com");
    assert.match(o.text, /تقرير المنصة اليومي/);
    assert.ok(o.text.includes("plant@member.test") && o.text.includes("Plant Co"), "the member's e-mail with company and address");
    assert.ok(o.text.includes("buyer@buyer.test"), "the receipt to the buyer is listed");
    assert.match(o.text, /طلبات وصلت المنصة: 1/);
    assert.ok(o.attachments.some(a => a.filename === `emails-${today}.csv`));
    await ownerReportCron(env, cairoToUtc(D, "01:00"));
    assert.equal(sent.length, 1, "once");
  });
  test("a member's stop → instant alert (company, e-mail, list); a non-member's stop → none; nothing is deleted", async () => {
    const env = env0();
    await addMember(env, { id: "u1", email: "stop@member.test", company: "Stop Co" });
    const { unsubUrl } = await import("../src/common.js");
    const u = await unsubUrl(env, "stop@member.test", "daily");
    await api(env, "POST", u.replace(SITE, ""), { body: "", raw: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const a = sent.find(s => s.to === "info@madeinegyptgate.com");
    assert.ok(a, "alert sent"); assert.match(a.text, /Stop Co/); assert.match(a.text, /stop@member\.test/); assert.match(a.text, /التقرير اليومي/);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM members WHERE id = 'u1'").first("x"), "the account stays");
    sent.length = 0;
    const v = await unsubUrl(env, "someone@else.test", "teaser");
    await api(env, "POST", v.replace(SITE, ""), { body: "", raw: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(sent.length, 0);
  });
  test("«wanted to register but couldn't»: the tool, the conversation turns, a form message — one alert per speaker per day", async () => {
    const env = env0();
    const r = await api(env, "POST", "/api/janna/register-help", { body: { said: "حاولت أسجل على الباقة الأساسية ومعرفتش، الكود مش بيوصل", name: "Mona", company: "Mona Foods", email: "mona@foods.test", phone: "01011112222" } });
    assert.equal(r.status, 200); assert.equal(r.data.alerted, true); assert.match(r.data.text, /بلّغت فريق المنصة/);
    const a = sent.find(s => s.to === "info@madeinegyptgate.com");
    assert.ok(a); for (const x of ["Mona Foods", "mona@foods.test", "01011112222", "الكود مش بيوصل"]) assert.ok(a.text.includes(x), x);
    const again = await api(env, "POST", "/api/janna/register-help", { body: { said: "تاني", email: "mona@foods.test" } });
    assert.equal(again.data.alerted, false); assert.equal(sent.filter(s => s.to === "info@madeinegyptgate.com").length, 1);
    // the form message
    sent.length = 0;
    await api(env, "POST", "/api/inquiries", { body: { kind: "contact", name: "Sami", email: "sami@x.test", phone: "0122223333", message: "I tried to register but the sign up page does not work" } });
    assert.ok(sent.find(s => s.to === "info@madeinegyptgate.com" && /could not register/.test(s.subject)), "alert from the form");
  });
  test("regTrouble: trouble yes, a plain question no", () => {
    for (const s of ["حاولت أسجل ومعرفتش", "التسجيل مش شغال عندي", "مقدرتش أعمل حساب", "الكود مبيوصلش", "I couldn't register", "the registration page shows an error", "sign up failed"]) assert.ok(regTrouble(s), s);
    for (const s of ["إزاي أسجل؟", "عايز أسجل في الباقة المميزة", "how do I register?", "مناقصات حديد"]) assert.ok(!regTrouble(s), s);
  });
});

describe("the cron and the PDF", () => {
  test("without migration 0015 nothing new is sent", async () => {
    const env = env0();
    env.DB.db.exec("DROP TABLE mail_sends");
    // a fixed hour before 07:00 Cairo: from 07:00 the day's digests run in the same tick and the mail step is skipped (busy), whatever the tables
    const at = Date.parse("2026-11-28T03:00:00Z");
    assert.equal((await mailCron(env, at)).off, "no_0015");
    const out = await platformCron(env, at);
    assert.equal(out.mail && out.mail.off, "no_0015");
  });
  test("the report PDF: pages, Arabic text extractable as Unicode", () => {
    const blocks = [{ text: "تقرير باسم اليومي", size: 15 }]; for (let i = 0; i < 90; i++) blocks.push({ text: "سطر " + i + " Line" });
    const pdf = Buffer.from(reportPdf({ title: "t", blocks }));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.match(pdf.toString("latin1"), /\/Count 2 /);
    assert.match(pdf.toString("latin1"), /beginbfchar/);
  });
});
