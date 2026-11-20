// node --test for POST /api/advisor/send — Bassem's «ابعت» in the live call (owner 2026-11-19: «كل ما اديله اوردر انه يبعت ايميل بيقولي
// معرفش»): the e-mail goes out FROM THE PLATFORM on the deal of the opportunity it is about (started here for an Information Center notice),
// with every safeguard of the deal room's sending (limits, new recipients, opt-outs, unverified members, Reply-To, footer, unsubscribe,
// events), "sent" only on the provider's id, and nothing created when a check refuses. Resend is mocked: no e-mail leaves the test.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleAdvisor, dealMarket, tldMarket } from "../src/advisor.js";
import worker from "../src/index.js";
import { D1, call } from "./helpers.mjs";

const SECRET = "test-secret-send";
const PKEY = "platform-key-send";
const H = handleAdvisor;
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: SECRET, PLATFORM_KEY: PKEY, RESEND_API_KEY: "re_test_key", ...(extra || {}) });
/* a verified member the way the platform makes one (activation link → one-time code → token) */
async function verified(env, id, plan = "partner", email = id + "@factory.test", company = "Al-Houseni Furniture") {
  const a = await call(H, env, "/activation", { method: "POST", headers: { "X-Platform-Key": PKEY }, body: { member_id: id, company, email, plan, send_email: false } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const l = await call(H, env, "/login", { method: "POST", body: { code: a.data.activation_url.split("#login=")[1] } });
  assert.equal(l.status, 200, JSON.stringify(l.data));
  return l.data.token;
}
let sent, realFetch, fail;
beforeEach(() => {
  realFetch = globalThis.fetch; sent = []; fail = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.resend.com/emails", "the only provider call");
    if (fail) return new Response(JSON.stringify(fail.body), { status: fail.status });
    sent.push({ body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify({ id: "re-" + sent.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

/* the owner's test: the Kenyan school-furniture notice from the Information Center (bassem_intel result, worker-intel toolItem) */
const KE = { ref: "", title: "توريد ١٦ طاولة و٦٤ كرسي لمدرسة Hongwe الخاصة", entity: "NG-CDF Lamu West Constituency", market: "africa:ke", country: "كينيا",
  source_url: "https://tenders.go.ke/tenders/313396", closing_date: "2026-11-25", kind: "tender_gov" };
const MAIL = { to: "procurement@lamuwest.example.ke", subject: "Supply of School Furniture for Hongwe Special School", body: "Dear Sir/Madam,\nWe are an Egyptian furniture factory…\n\nDr. Mohamed El-Houseni\nAl-Houseni Furniture" };
const send = (env, tok, body) => call(H, env, "/send", { method: "POST", token: tok, body });
const dealsOf = async (env, id) => (await env.DB.prepare("SELECT * FROM deals WHERE member_id = ?").bind(id).all()).results;
const eventsOf = async (env, id) => (await env.DB.prepare("SELECT type, data FROM events WHERE member_id = ? AND deal_id != '' ORDER BY id").bind(id).all()).results.map(e => ({ type: e.type, data: JSON.parse(e.data) }));

describe("POST /send — an Information Center opportunity", () => {
  test("first send: the deal is started for the notice (market africa from africa:ke, kind gov), the e-mail goes out from the platform", async () => {
    const env = env0();
    const tok = await verified(env, "m-ke");
    const r = await send(env, tok, { ...MAIL, opportunity: KE, via: "bassem", to_source: "dictated", language: "en" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual([r.data.sent, r.data.deal_created, r.data.message.status], [true, true, "sent"]);
    const d = r.data.deal;
    assert.deepEqual([d.market, d.country, d.kind, d.entity, d.source_url, d.closing_date, d.title], ["africa", "كينيا", "gov", KE.entity, KE.source_url, KE.closing_date, KE.title]);
    assert.equal(d.stage, "contact", "a sent first e-mail moves the deal to «تواصل»");
    assert.equal(d.contact_email, MAIL.to);
    // the same message the deal room sends: one sender, the member in Cc, Reply-To his own mailbox (Email Routing off), the footer
    assert.equal(sent.length, 1);
    const c = sent[0].body;
    assert.equal(c.from, "Al-Houseni Furniture via Made in Egypt Gate <noreply@madeinegyptgate.com>");
    assert.deepEqual([c.to, c.cc, c.reply_to, c.subject], [[MAIL.to], ["m-ke@factory.test"], "m-ke@factory.test", MAIL.subject]);
    assert.equal(c.headers["X-MIG-Deal"], d.id, "a deal e-mail for the e-mail center (template deal_email, never altered)");
    assert.ok(!c.headers["List-Unsubscribe"], "no mailto unsubscribe to a dead reply address while Email Routing is off");
    assert.match(c.text, /Dr\. Mohamed El-Houseni/);
    assert.match(c.text, /To stop emails from this member or to report abuse/);
    // stored on the deal like any deal e-mail, and audited with who asked and where the address came from
    const msgs = (await call(H, env, `/deals/${d.id}/messages`, { token: tok })).data.messages;
    assert.deepEqual(msgs.map(x => [x.direction, x.status, x.to]), [["out", "sent", MAIL.to]]);
    const ev = await eventsOf(env, "m-ke");
    assert.deepEqual(ev.map(e => e.type), ["deal_created", "email_sent", "stage_changed"]);
    assert.deepEqual(ev[0].data, { stage: "discover", ref: "", market: "africa", via: "send", source: "opportunity" });
    assert.deepEqual([ev[1].data.via, ev[1].data.to_source, ev[1].data.to], ["bassem", "dictated", [MAIL.to]]);
    const ct = await env.DB.prepare("SELECT addr, source FROM contacts WHERE member_id = 'm-ke'").all();
    assert.deepEqual(ct.results.map(x => [x.addr, x.source]), [[MAIL.to, "out"]], "a known correspondent from now on");
  });
  test("a second e-mail about the same notice reuses its deal (no duplicate); deal_id works too, only for the member's own deals", async () => {
    const env = env0();
    const tok = await verified(env, "m-ke2"), other = await verified(env, "m-other");
    const a = await send(env, tok, { ...MAIL, opportunity: KE });
    const b = await send(env, tok, { ...MAIL, subject: "Follow-up: Hongwe Special School furniture", opportunity: KE });
    assert.deepEqual([a.data.deal_created, b.data.deal_created, b.data.deal.id], [true, false, a.data.deal.id]);
    assert.equal((await dealsOf(env, "m-ke2")).length, 1);
    const c = await send(env, tok, { ...MAIL, subject: "Third", deal_id: a.data.deal.id });
    assert.deepEqual([c.status, c.data.sent, c.data.deal_created, c.data.deal.id], [200, true, false, a.data.deal.id]);
    assert.equal((await call(H, env, `/deals/${a.data.deal.id}/messages`, { token: tok })).data.messages.length, 3);
    const x = await send(env, other, { ...MAIL, deal_id: a.data.deal.id });
    assert.deepEqual([x.status, x.data.code], [404, "deal_not_found"], "another member's deal is never reachable");
    assert.deepEqual([(await send(env, tok, { ...MAIL, deal_id: "nope" })).data.code], ["deal_not_found"]);
  });
  test("an «intl» notice (no country): the recipient's country domain decides, else the market Bassem passed, else «market_required»", async () => {
    const env = env0();
    const tok = await verified(env, "m-intl", "strategic");
    const wb = { title: "Supply of desks — World Bank project", entity: "World Bank", market: "intl", source_url: "https://worldbank.example/n/1", kind: "tender_gov" };
    const a = await send(env, tok, { ...MAIL, to: "office@moe.example.ug", opportunity: wb });
    assert.deepEqual([a.status, a.data.deal.market], [200, "africa"], JSON.stringify(a.data));
    const b = await send(env, tok, { ...MAIL, to: "office@ministry.example.com", opportunity: { ...wb, title: "Another WB notice" } });
    assert.deepEqual([b.status, b.data.code], [400, "market_required"]);
    const c = await send(env, tok, { ...MAIL, to: "office@ministry.example.com", opportunity: { ...wb, title: "Another WB notice" }, market: "Ghana" });
    assert.deepEqual([c.status, c.data.deal.market], [200, "africa"]);
    assert.equal((await dealsOf(env, "m-intl")).length, 2, "the refused one started no deal");
  });
  /* review 2026-11-20 CW-3: janna_lookup's lean answer gives a platform tender's item page where its list link was — the same deal */
  test("a platform tender: a deal started on its list link is found from its item page (and back); other sites and trivial refs still match exactly", async () => {
    const env = env0();
    const tok = await verified(env, "m-eg");
    const T1 = { ref: "eg-tnd-003", title: "توريد حديد تسليح لمشروع سكني", entity: "هيئة المجتمعات العمرانية", market: "local", country: "مصر", kind: "tender_gov" };
    const LIST = "https://madeinegyptgate.com/tenders/search/#eg-tnd-003", PAGE = "https://madeinegyptgate.com/tender-item/%D8%AA%D9%88%D8%B1%D9%8A%D8%AF-%D8%AD%D8%AF%D9%8A%D8%AF/";
    const a = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, source_url: LIST } } });
    assert.equal(a.status, 201);
    const b = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, source_url: PAGE } } });
    assert.deepEqual([b.status, b.data.existing, b.data.deal.id], [200, true, a.data.deal.id], "the deal room's «start the deal»: no second deal");
    const s = await send(env, tok, { ...MAIL, to: "buy@authority.example.eg", opportunity: { ...T1, source_url: PAGE } });
    assert.deepEqual([s.status, s.data.deal_created, s.data.deal.id], [200, false, a.data.deal.id], "Bassem's «ابعت»: the e-mail goes on the same deal");
    const w = await send(env, tok, { ...MAIL, to: "buy@authority.example.eg", opportunity: { ...T1, source_url: "https://www.madeinegyptgate.com/tenders/search/#eg-tnd-003" } });
    assert.equal(w.data.deal.id, a.data.deal.id, "www. is the platform too");
    const o = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, source_url: "https://etenders.gov.eg/t/eg-tnd-003" } } });
    assert.equal(o.status, 201, "an official link of another site is its own identity, as before");
    const t1 = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, ref: "1", source_url: LIST } } });
    const t2 = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, ref: "1", source_url: PAGE } } });
    assert.deepEqual([t1.status, t2.status], [201, 201], "a trivial ref is never an identity");
    const x = await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ...T1, title: "توريد حديد تسليح — المرحلة الثانية", source_url: PAGE } } });
    assert.equal(x.status, 201, "another title is another tender");
    assert.equal((await dealsOf(env, "m-eg")).length, 5);
  });
});

describe("POST /send — an e-mail with no opportunity behind it", () => {
  test("its own deal (kind direct, titled by the subject), one per recipient; the market from the domain or Bassem's words", async () => {
    const env = env0();
    const tok = await verified(env, "m-dir");
    const a = await send(env, tok, { to: "sales@furniture-uae.ae", subject: "Egyptian school furniture — introduction", body: "Dear team,…" });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.deepEqual([a.data.sent, a.data.deal_created, a.data.deal.kind, a.data.deal.market, a.data.deal.title], [true, true, "direct", "gulf", "Egyptian school furniture — introduction"]);
    const b = await send(env, tok, { to: "sales@furniture-uae.ae", subject: "Our catalogue", body: "As promised…" });
    assert.deepEqual([b.data.deal_created, b.data.deal.id], [false, a.data.deal.id], "the same recipient → the same conversation");
    const c = await send(env, tok, { to: "buyer@globalfurniture.example.com", subject: "Introduction", body: "Hello" });
    assert.deepEqual([c.status, c.data.code], [400, "market_required"], "a .com address alone names no market: Bassem asks where the buyer is");
    const d = await send(env, tok, { to: "buyer@globalfurniture.example.com", subject: "Introduction", body: "Hello", market: "الإمارات" });
    assert.deepEqual([d.status, d.data.deal.market, d.data.deal.kind], [200, "gulf", "direct"]);
  });
});

describe("POST /send — the deal room's safeguards, unchanged, and nothing created on a refusal", () => {
  test("plan markets: a partner cannot start an Asia deal this way (403 market_not_in_plan, no deal, nothing sent); strategic can", async () => {
    const env = env0();
    const P = await verified(env, "m-p", "partner"), S = await verified(env, "m-s", "strategic");
    const cn = { title: "Steel bars for a Chinese contractor", entity: "China Railway", market: "asia:cn", source_url: "https://cn.example/t/9", kind: "tender_private" };
    const r = await send(env, P, { ...MAIL, to: "buy@crc.example.cn", opportunity: cn });
    assert.deepEqual([r.status, r.data.code, r.data.market], [403, "market_not_in_plan", "asia"]);
    assert.deepEqual([(await dealsOf(env, "m-p")).length, sent.length], [0, 0]);
    const s = await send(env, S, { ...MAIL, to: "buy@crc.example.cn", opportunity: cn });
    assert.deepEqual([s.status, s.data.sent, s.data.deal.market, s.data.deal.kind], [200, true, "asia", "pvt"]);
  });
  test("validation first: a bad address, a missing subject or body, too many recipients → refused with a code, no deal", async () => {
    const env = env0();
    const tok = await verified(env, "m-v");
    const bad = [[{ ...MAIL, to: "info at lamuwest dot example dot ke" }, "invalid_to"], [{ ...MAIL, to: "" }, "invalid_to"], [{ ...MAIL, subject: "" }, "subject_required"],
      [{ ...MAIL, body: " " }, "body_required"], [{ ...MAIL, cc: "nope" }, "invalid_cc"], [{ ...MAIL, to: ["a@b.ke", "c@d.ke", "e@f.ke", "g@h.ke", "i@j.ke", "k@l.ke"] }, "too_many_recipients"],
      [{ ...MAIL, body: "x".repeat(20001) }, "body_too_long"]];
    for (const [b, code] of bad) { const r = await send(env, tok, { ...b, opportunity: KE }); assert.equal(r.data.code, code, JSON.stringify(r.data)); }
    assert.equal((await send(env, tok, { ...MAIL, opportunity: { market: "africa:ke" } })).data.code, "opportunity_required");
    assert.equal((await send(env, tok, "{oops")).status, 400);
    const inj = await send(env, tok, { ...MAIL, subject: "Hi\r\nBcc: evil@x.com", opportunity: KE });
    assert.equal(inj.data.message.subject, "Hi Bcc: evil@x.com", "folded to one line: no header injection");
    assert.equal((await dealsOf(env, "m-v")).length, 1, "only the valid send started a deal");
  });
  test("limits: the daily total, the new-recipient cap and opt-outs refuse BEFORE a deal is started", async () => {
    const env = env0({ MAX_EMAILS_PER_DAY: "2", MAX_NEW_RECIPIENTS_PER_DAY: "1" });
    const tok = await verified(env, "m-lim");
    assert.equal((await send(env, tok, { ...MAIL, opportunity: KE })).data.sent, true);
    const fresh = await send(env, tok, { ...MAIL, to: "other@buyer.example.ke", opportunity: { ...KE, title: "Another school", source_url: "https://tenders.go.ke/tenders/1" } });
    assert.deepEqual([fresh.status, fresh.data.code, fresh.data.remaining], [429, "new_recipient_limit", 0]);
    await env.DB.prepare("UPDATE contacts SET opted_out_at = ? WHERE member_id = 'm-lim'").bind(new Date().toISOString()).run();
    const out = await send(env, tok, { ...MAIL, opportunity: { ...KE, title: "Third school", source_url: "https://tenders.go.ke/tenders/2" } });
    assert.deepEqual([out.status, out.data.code, out.data.addresses], [403, "opted_out", [MAIL.to]]);
    await env.DB.prepare("UPDATE contacts SET opted_out_at = '' WHERE member_id = 'm-lim'").run();
    assert.equal((await send(env, tok, { ...MAIL, opportunity: KE })).data.sent, true);
    const day = await send(env, tok, { ...MAIL, opportunity: { ...KE, title: "Fourth school", source_url: "https://tenders.go.ke/tenders/3" } });
    assert.deepEqual([day.status, day.data.code, day.data.limit], [429, "daily_limit", 2]);
    assert.deepEqual([(await dealsOf(env, "m-lim")).length, sent.length], [1, 2], "refusals started no deal and sent nothing");
  });
  test("never «sent» without the provider's id: no provider → a draft on the deal; a provider error → failed; an unverified member → not through the provider", async () => {
    const env = env0({ RESEND_API_KEY: "" });
    const tok = await verified(env, "m-np");
    const r = await send(env, tok, { ...MAIL, opportunity: KE });
    assert.deepEqual([r.status, r.data.sent, r.data.message.status, r.data.error, r.data.deal.stage], [200, false, "draft", "email not configured", "discover"]);
    const envF = env0(); const tf = await verified(envF, "m-f");
    fail = { status: 403, body: { statusCode: 403, name: "validation_error", message: "The domain is not verified." } };
    const f = await send(envF, tf, { ...MAIL, opportunity: KE });
    assert.deepEqual([f.data.sent, f.data.message.status], [false, "failed"]);
    assert.match(f.data.error, /domain is not verified/);
    fail = null;
    // open mode (local testing): an unverified member's e-mail never goes through the provider
    const envO = { DB: new D1(), ADVISOR_SECRET: SECRET, ADVISOR_OPEN_MODE: "1", RESEND_API_KEY: "re_x" };
    const s = await call(H, envO, "/session", { method: "POST", body: { member_id: "m-open", company: "Open Co", email: "o@open.test", plan: "partner" } });
    const u = await send(envO, s.data.token, { ...MAIL, opportunity: KE });
    assert.deepEqual([u.data.sent, u.data.message.status, sent.length], [false, "draft", 0]);
    assert.match(u.data.error, /not verified/);
  });
  test("Email Routing on: Reply-To = the deal address and List-Unsubscribe, as for every deal e-mail", async () => {
    const env = env0({ INBOUND_REPLY_ENABLED: "1" });
    const tok = await verified(env, "m-in");
    const r = await send(env, tok, { ...MAIL, opportunity: KE });
    const c = sent[0].body, id = r.data.deal.id;
    assert.equal(c.reply_to, `deal-${id}@reply.madeinegyptgate.com`);
    assert.equal(c.headers["List-Unsubscribe"], `<mailto:deal-${id}@reply.madeinegyptgate.com?subject=unsubscribe>`);
    assert.equal(r.data.deal.reply_to, `deal-${id}@reply.madeinegyptgate.com`);
  });
  test("the existing deal-room endpoint keeps its answers and now names each refusal with a code", async () => {
    const env = env0({ MAX_EMAILS_PER_DAY: "1" });
    const tok = await verified(env, "m-room");
    const d = (await call(H, env, "/deals", { method: "POST", token: tok, body: { opportunity: { ref: "T-9", title: "Cables", market: "local" } } })).data.deal;
    const bad = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: { ...MAIL, to: "nope" } });
    assert.deepEqual([bad.status, bad.data.error, bad.data.code], [400, "invalid or missing to", "invalid_to"]);
    assert.equal((await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL })).data.sent, true);
    const lim = await call(H, env, `/deals/${d.id}/email`, { method: "POST", token: tok, body: MAIL });
    assert.deepEqual([lim.status, lim.data.error, lim.data.code, lim.data.limit], [429, "daily email limit reached", "daily_limit", 1]);
    assert.equal((await call(H, env, "/send", { token: tok })).status, 405);
  });
});

describe("POST /send through the Worker with the member's own platform sign-in (the call's mig-tok)", () => {
  const SITE = "https://madeinegyptgate.com";
  async function api(env, method, path, { body, token } = {}) {
    const h = { "CF-Connecting-IP": "10.0.0.9", "User-Agent": "Mozilla/5.0 test" };
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (token) h.Authorization = "Bearer " + token;
    const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
    let data = null; try { data = await res.json(); } catch (e) { /* not json */ }
    return { status: res.status, data };
  }
  test("a partner signed in with an e-mail code sends; an e-mailed login-link session and a basic plan cannot", async () => {
    const env = { DB: new D1(), ADVISOR_SECRET: "s3cret", AUTH_SECRET: "auth-s3cret", RESEND_API_KEY: "re_k", ADMIN_EMAILS: "boss@mig.test", INBOUND_REPLY_ENABLED: "0" };
    const t = new Date().toISOString();
    for (const [id, email, plan] of [["p1", "owner@partner.test", "partner"], ["b1", "owner@basic.test", "basic"]])
      await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)").bind(id, "Co " + id, email, plan, t, t, t).run();
    const codeFor = async email => {
      const before = sent.length;
      assert.equal((await api(env, "POST", "/api/auth/request", { body: { email } })).status, 200);
      const m = sent.slice(before).find(s => (s.body.to || [])[0] === email);
      return m.body.text.match(/\b(\d{6})\b/)[1];
    };
    const p = await api(env, "POST", "/api/auth/verify", { body: { email: "owner@partner.test", code: await codeFor("owner@partner.test") } });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const before = sent.length;
    const r = await api(env, "POST", "/api/advisor/send", { token: p.data.token, body: { ...MAIL, opportunity: KE, via: "bassem", to_source: "opportunity" } });
    assert.deepEqual([r.status, r.data.sent, r.data.deal_created, r.data.deal.market], [200, true, true, "africa"], JSON.stringify(r.data));
    assert.deepEqual(sent.slice(before).map(s => s.body.to[0]), [MAIL.to]);
    const b = await api(env, "POST", "/api/auth/verify", { body: { email: "owner@basic.test", code: await codeFor("owner@basic.test") } });
    const nb = await api(env, "POST", "/api/advisor/send", { token: b.data.token, body: { ...MAIL, opportunity: KE } });
    assert.deepEqual([nb.status, nb.data.code], [403, "plan"]);
  });
});

describe("market words → the deal markets of the plans", () => {
  test("worker-intel codes, deal markets, country names (AR / EN) and country domains", () => {
    const cases = [["africa:ke", "africa"], ["asia:cn", "asia"], ["sa", "gulf"], ["ae", "gulf"], ["gcc", "gulf"], ["arab", "gulf"], ["jo", "gulf"], ["eg", "local"], ["local", "local"],
      ["ma", "africa"], ["eu", "europe"], ["de", "europe"], ["intl", ""], ["", ""], ["mars", ""], ["Kenya", "africa"], ["كينيا", "africa"], ["الإمارات", "gulf"], ["The United Kingdom", "europe"],
      ["Saudi Arabia", "gulf"], ["الصين", "asia"], ["مصر", "local"], ["toString", ""], ["__proto__", ""]];
    for (const [v, m] of cases) assert.equal(dealMarket(v), m, v);
    assert.deepEqual(["tenders@lamuwest.example.ke", "info@x.com.eg", "a@b.co.uk", "sales@x.com", "x@y.io", "", "nope"].map(tldMarket), ["africa", "local", "europe", "", "", "", ""]);
  });
});
