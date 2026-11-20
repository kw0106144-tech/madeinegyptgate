// node --test: «ابعتلي» end to end — POST /api/advisor/notify with items (worker/src/advisor.js notifyMember + src/notify-items.js).
// migate-intel is a stub on env.INTEL (the service binding): {file:false} → the card JSON, {file:true} → the RAW file with its facts in
// X-Mailpack (worker-intel/src/api.js mailFileResponse; test/notify-contract.test.mjs runs the real one). Resend, Brevo, respond.io and the
// Pages production URL are mocked fetches, and any other URL fails the test (this Worker never fetches a third-party document). Nothing is
// ever sent for real.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { D1, waSwitchOn } from "./helpers.mjs";
import { loadMailConfig, forgetMailCache } from "../src/email-center.js";
import { forgetFeatures } from "../src/flags.js";
import { fileSlot } from "../src/notify-items.js";

const SITE = "https://madeinegyptgate.com";
const DOC_URL = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW%2001234%20RFQ%20advert.pdf";
const PDF = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"), PDF_B64 = PDF.toString("base64");
const PDF_T = "application/pdf", DOCX_T = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAIL_FROM = "منصة صنع في مصر <noreply@madeinegyptgate.com>";
let mail, wa, pages, other, realFetch, resendStatus;
function mockFetch() {
  mail = []; wa = []; pages = []; other = []; resendStatus = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === "https://api.resend.com/emails") {
      const b = JSON.parse(init.body), st = resendStatus.length ? resendStatus.shift() : 200;
      mail.push({ via: "resend", body: b, raw: init.body, key: init.headers["Idempotency-Key"] });
      return st === 200 ? Response.json({ id: "re_" + mail.length }) : Response.json({ name: "validation_error", message: "Attachment refused" }, { status: st });
    }
    if (u === "https://api.brevo.com/v3/smtp/email") { mail.push({ via: "brevo", body: JSON.parse(init.body) }); return new Response(JSON.stringify({ messageId: "<b" + mail.length + "@brevo>" }), { status: 201 }); }
    if (u.startsWith("https://api.respond.io/")) { wa.push({ url: u, body: init.body ? JSON.parse(init.body) : null }); return Response.json({ messageId: 1000 + wa.length }); }
    if (u.startsWith("https://madeinegyptgate.pages.dev/")) { pages.push({ url: u, method: init.method }); const h = pageAnswer(u); if (h instanceof Error) throw h; return h; }
    other.push(u);
    throw new Error("unexpected fetch " + u);
  };
}
let pageAnswer = () => new Response(null, { status: 200 });
beforeEach(() => { realFetch = globalThis.fetch; pageAnswer = () => new Response(null, { status: 200 }); mockFetch(); });
afterEach(() => { globalThis.fetch = realFetch; });

/* migate-intel behind the binding: answers by path and by {file}; every request logged with its hostname */
const CARD = { kind: "rfq", kind_label: "طلب عرض أسعار", kind_label_en: "Request for quotation", market: "africa:za", title: "توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم)", title_en: null,
  title_orig: "Supply and delivery of water treatment chemicals (aluminium sulphate)", title_is_original: false, entity: "Rand Water", country: "South Africa", market_name: "جنوب أفريقيا", market_name_en: "South Africa",
  sector: null, sector_en: null, published: "2026-11-10", deadline: "2026-11-24", status: "open", value: 1250000, currency: "ZAR", currency_ar: "راند", summary: "طلب عرض أسعار من Rand Water لتوريد كيماويات معالجة المياه.",
  summary_en: null, summary_original: "Ref RW 01234 RFQ", source_name: "جنوب أفريقيا — بوابة المناقصات الحكومية", source_name_en: "South Africa — National Treasury eTenders OCDS API" };
const links = (id, over = {}) => ({ page: SITE + "/intel/rfq/" + id + "/", page_en: SITE + "/intel/en/rfq/" + id + "/", source: DOC_URL, doc: null, ...(over.links || {}) });
/* round 1: the card ({file:false}); reason "kind" / "source_opt_out" / "not_requested" as migate-intel says it */
const cardJson = (id, over = {}) => ({ ok: true, id: over.primary || id, requested: id, card: { ...CARD, ...(over.card || {}) }, links: links(over.primary || id, over), file: null, reason: over.reason1 || "not_requested" });
/* round 2: the raw file + X-Mailpack, or JSON with the reason (over.file === null) */
function fileAnswer(id, b, over = {}) {
  if (over.file === null) return Response.json({ ...cardJson(id, over), links: { ...links(id, over), doc: over.doc !== undefined ? over.doc : DOC_URL }, reason: over.reason || "page_only", ...(over.reason_size ? { reason_size: over.reason_size } : {}) });
  const f = { name: "RW 01234 RFQ advert.pdf", type: PDF_T, bytes: PDF, from: "official", ...(over.file || {}) };
  const meta = { ok: true, id, requested: id, file: { name: f.name, type: f.type, size: f.size !== undefined ? f.size : f.bytes.length, from: f.from, ...(f.label ? { label: f.label } : {}) }, doc: f.doc !== undefined ? f.doc : DOC_URL, ...(f.skipped ? { skipped: f.skipped } : {}) };
  return new Response(f.bytes, { headers: { "Content-Type": f.ctype || f.type, "X-Mailpack": JSON.stringify(meta), "Cache-Control": "no-store" } });
}
const pub = (id, lang) => ({ id, kind: "rfq", kind_label: lang === "en" ? "Request for quotation" : "طلب عرض أسعار", tag: null, market: "africa:za", market_name: lang === "en" ? "South Africa" : "جنوب أفريقيا", country: "South Africa", sector: null,
  title: lang === "en" ? "Supply and delivery of water treatment chemicals" : "توريد كيماويات معالجة المياه", title_orig: "Supply and delivery of water treatment chemicals", title_ar: "توريد كيماويات معالجة المياه", title_en: null, title_is_original: lang === "en",
  summary: lang === "en" ? null : "طلب عرض أسعار من Rand Water، للاستفسار buyer@randwater.example أو +27 11 682 0000", entity: "Rand Water", published_at: "2026-11-10T00:00:00.000Z", first_seen_at: "2026-11-10T08:00:00.000Z",
  deadline: "2026-11-24T00:00:00.000Z", value: 1250000, currency: "ZAR", status: "open", relevance: 70, url: DOC_URL, page: SITE + "/intel/rfq/supply-x-" + id + "/", source: { id: "za", name: lang === "en" ? "South Africa — eTenders" : "جنوب أفريقيا — بوابة المناقصات" } });
function intelStub(opts = {}) {
  const log = [];
  const fetch = async req => {
    const u = new URL(req.url), body = req.method === "POST" ? await req.json() : null;
    log.push({ host: u.hostname, path: u.pathname, search: u.search, method: req.method, body, headers: Object.fromEntries(req.headers) });
    if (u.pathname === "/api/intel/mailpack") {
      const over = (opts.over || {})[body.id] || {};
      if (body.file === false) { if (opts.card) { const r = await opts.card(body); if (r) return r; } return Response.json(cardJson(body.id, over)); }
      if (opts.file) { const r = await opts.file(body); if (r) return r; }
      return fileAnswer(body.id, body, over);
    }
    const m = /^\/api\/intel\/item\/([0-9a-z]{11})$/.exec(u.pathname);
    if (m) { if (opts.item) { const r = await opts.item(m[1], u.searchParams.get("lang")); if (r) return r; } return Response.json(pub(m[1], u.searchParams.get("lang"))); }
    return Response.json({ error: "not found" }, { status: 404 });
  };
  const packs = () => log.filter(x => x.path === "/api/intel/mailpack");
  return { log, binding: { fetch }, packs, cards: () => packs().filter(x => x.body.file === false), files: () => packs().filter(x => x.body.file !== false) };
}

const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM, TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "boss@mig.test", ...(extra || {}) });
function mkCtx() { const p = []; return { p, n: 0, waitUntil(x) { this.n++; p.push(x); }, async done() { await Promise.all(p); p.length = 0; } }; }
async function api(env, method, path, { body, token, ctx = mkCtx() } = {}) {
  const h = { "CF-Connecting-IP": "10.0.0.1", "User-Agent": "Mozilla/5.0 test" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  let data = null; try { data = await res.clone().json(); } catch (e) { /* empty */ }
  return { status: res.status, data };
}
const codeOf = email => { const m = [...mail].reverse().find(s => s.body.to[0] === email && /code|كود/.test(s.body.subject)); return m && m.body.text.match(/\b(\d{6})\b/)[1]; };
async function signIn(env, email) {
  assert.equal((await api(env, "POST", "/api/auth/request", { body: { email } })).status, 200);
  const r = await api(env, "POST", "/api/auth/verify", { body: { email, code: codeOf(email) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}
async function partner(env, { wa = false, email = "core@f.test", phone = "01001112223" } = {}) {
  const admin = await signIn(env, "boss@mig.test");
  const r = await api(env, "POST", "/api/admin/members", { token: admin, body: { email, plan: "partner", company: "Delta Cables", phone, name: "أحمد" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (wa) await env.DB.prepare("UPDATE members SET prefs_json = ?, wa_last_in_at = ? WHERE email = ?").bind(JSON.stringify({ wa_optin: true }), wa === "window" ? new Date().toISOString() : "", email).run();
  const tok = await signIn(env, email);
  mail.length = 0;
  return tok;
}
const notify = (env, token, body, ctx) => api(env, "POST", "/api/advisor/notify", { token, body, ctx });
const lastMail = () => mail[mail.length - 1].body;
const events = async env => ((await env.DB.prepare("SELECT data FROM events WHERE type = 'notify' ORDER BY id").all()).results || []).map(r => JSON.parse(r.data));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

describe("no items (or only refs that are not ids): today's request byte for byte, no intel or Pages call", () => {
  test("the Resend body equals the frozen copy of today's note (advisor.js before «ابعتلي» with opportunities)", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    const message = "فرصة جديدة <b>x</b> & https://madeinegyptgate.com/intel/";
    /* frozen 2026-11-19: advisor.js notifyMember + toHtml */
    const text = message + "\n\n—\n" + "https://madeinegyptgate.com/advisor.html";
    const frozen = JSON.stringify({ from: "باسم — منصة صنع في مصر <noreply@madeinegyptgate.com>", to: ["core@f.test"], subject: "رسالة من باسم / A note from Bassem", text,
      html: `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.7;color:#222">${esc(text).replace(/\r?\n/g, "<br>")}</div>` });
    for (const items of [undefined, [], ["https://evil.example/x.pdf", { id: "rw0000000a1" }, { ref: "https://evil.example/x.pdf", title: "x" }, 5, "intel:SHORT", "intel:../etc", "item: x"], "rw0000000a1"]) {
      mail.length = 0;
      const r = await notify(env, t, { message, channel: "email", ...(items !== undefined ? { items } : {}), to: "evil@attacker.test" });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual(r.data, { ok: true, sent: { email: true, whatsapp: false }, pending: { whatsapp: false } }, "today's reply: " + JSON.stringify(items));
      assert.equal(mail.length, 1); assert.equal(mail[0].raw, frozen, "byte-identical: " + JSON.stringify(items));
      assert.match(mail[0].key, /^nt-[0-9a-f]{16}$/);
    }
    assert.equal(st.log.length, 0, "no intel call"); assert.equal(pages.length, 0, "no Pages call"); assert.deepEqual(other, []);
    assert.deepEqual((await events(env)).at(-1), { channel: "email", sent: { email: true, whatsapp: false }, pending: { whatsapp: false } });
  });
});

describe("an Information Center item on Resend", () => {
  test("the card, then the file, through the binding (binding-only hostname, no secret); the cards, both links and the official file in the e-mail; the reply and the event", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    const r = await notify(env, t, { message: "دي المناقصة اللي اتكلمنا عليها", channel: "email", items: ["intel:rw0000000a1"], to: "evil@attacker.test" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const p = st.packs();
    assert.deepEqual(p.map(x => [x.host, x.method, x.body]), [["mailpack.binding.invalid", "POST", { id: "rw0000000a1", file: false }],
      ["mailpack.binding.invalid", "POST", { id: "rw0000000a1", file: true, max_bytes: 8000000, budget_ms: 20000 }]]);
    assert.ok(!p.some(x => Object.keys(x.headers).some(h => /key|secret|auth/i.test(h))), "no secret travels");
    assert.equal(mail.length, 1);
    const b = lastMail();
    assert.deepEqual(b.to, ["core@f.test"], "body.to is ignored");
    assert.equal(b.subject, "باسم: تفاصيل «توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم)» / Bassem: details of “Supply and delivery of water treatment chemicals…”", "titles ≤ 60 characters");
    for (const s of ["رسالة باسم:\nدي المناقصة اللي اتكلمنا عليها", "الجهة: Rand Water", "24 نوفمبر 2026", "1,250,000 راند (ZAR)", "صفحتها على المنصة: https://madeinegyptgate.com/intel/rfq/rw0000000a1/", "الرابط الرسمي: " + DOC_URL,
      "📎 الملف الرسمي مرفق في الإيميل ده: RW 01234 RFQ advert.pdf", "📎 The official file is attached to this e-mail: RW 01234 RFQ advert.pdf", "وصلك الإيميل ده من باسم خلال مكالمتكم على منصة صنع في مصر."]) assert.ok(b.text.includes(s), s);
    assert.ok(b.html.includes('href="https://madeinegyptgate.com/intel/rfq/rw0000000a1/"') && b.html.includes('href="' + esc(DOC_URL) + '"'));
    assert.deepEqual(b.attachments, [{ filename: "RW 01234 RFQ advert.pdf", content: PDF_B64, content_type: "application/pdf" }]);
    assert.equal(b.from, "باسم — منصة صنع في مصر <noreply@madeinegyptgate.com>");
    assert.deepEqual([r.data.ok, r.data.sent, r.data.attached], [true, { email: true, whatsapp: false }, 1]);
    assert.deepEqual(r.data.items, [{ ref: "intel:rw0000000a1", found: true, id: "rw0000000a1", title: "توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم)", page: SITE + "/intel/rfq/rw0000000a1/", official: DOC_URL, file: { attached: true, name: "RW 01234 RFQ advert.pdf", size: PDF.length } }]);
    const ev = await events(env);
    assert.equal(ev.length, 1, "one events row: reserved before the work, completed after it");
    assert.deepEqual(ev[0], { channel: "email", sent: { email: true, whatsapp: false }, pending: { whatsapp: false }, items: ["intel:rw0000000a1"], files: 1, why: { "intel:rw0000000a1": "attached" } });
    assert.ok(!JSON.stringify(ev).includes("اتكلمنا"), "the message is never stored");
    assert.deepEqual(other, []); assert.equal(pages.length, 0);
    const log = (await env.DB.prepare("SELECT template, status FROM cc_mail_log WHERE template = 'bassem_note'").all()).results;
    assert.deepEqual(log.map(x => [x.template, x.status]), [["bassem_note", "sent"]]);
  });
});

describe("degradation, said honestly", () => {
  test("sizes (review SEC-2 / R5): the cards first, then the files ONE AFTER ANOTHER, each sized by what the e-mail has left — Resend 8 MB in all, Brevo 4 MB a file (≤ 8 MB)", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    const ids = ["rw0000000a1", "rw0000000a2", "rw0000000a3"];
    const r = await notify(env, t, { message: "x", channel: "email", items: ids.map(i => "intel:" + i) });
    assert.deepEqual(st.packs().map(p => [p.body.id, p.body.file]), [...ids.map(i => [i, false]), ...ids.map(i => [i, true])], "3 cards, then 3 files in order");
    assert.deepEqual(st.files().map(p => p.body.max_bytes), [8000000, 8000000 - PDF.length, 8000000 - 2 * PDF.length]);
    assert.equal(r.data.attached, 3);
    assert.deepEqual(lastMail().attachments.map(a => a.filename), ["RW 01234 RFQ advert.pdf", "RW 01234 RFQ advert-2.pdf", "RW 01234 RFQ advert-3.pdf"], "unique names");
    /* a big first file leaves the next one what is left; under 100 KB left → «total_too_large» without asking */
    const big = Buffer.concat([PDF, Buffer.alloc(7950000, 0x20)]);
    const st2 = intelStub({ over: { rw0000000a1: { file: { bytes: big } } } }), env2 = env0({ INTEL: st2.binding }), t2 = await partner(env2);
    const r2 = await notify(env2, t2, { message: "x", channel: "email", items: ["intel:rw0000000a1", "intel:rw0000000a2"] });
    assert.deepEqual(st2.files().map(p => p.body.id), ["rw0000000a1"], "the second file is never asked for");
    assert.deepEqual(r2.data.items.map(x => x.file.attached ? "attached" : x.file.reason), ["attached", "total_too_large"]);
    /* signed in through Resend, then the owner switches «البريد» to Brevo (its key: the Worker secret BREVO_API_KEY) */
    const st3 = intelStub(), env3 = env0({ INTEL: st3.binding, BREVO_API_KEY: "xkeysib-test-0123456789" });
    const t3 = await partner(env3);
    for (const [k, v] of [["mail.enabled", "1"], ["mail.provider", "brevo"]]) await env3.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'mail', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v, new Date().toISOString()).run();
    forgetMailCache(env3); await loadMailConfig(env3, { fresh: true });
    const r3 = await notify(env3, t3, { message: "x", channel: "email", items: ["intel:rw0000000a1", "intel:rw0000000a2"] });
    assert.deepEqual(st3.files().map(p => p.body.max_bytes), [4000000, 4000000]);
    assert.equal(r3.data.attached, 2); assert.equal(mail.at(-1).via, "brevo"); assert.deepEqual(mail.at(-1).body.attachment.map(a => a.content), [PDF_B64, PDF_B64]);
  });
  test("review R5: a news item or a duplicate never takes a file's room or a slot of the day; migate-intel never downloads one file twice", async () => {
    const st = intelStub({ over: { nw0000000c3: { card: { kind: "news", kind_label: "خبر" }, reason1: "kind" }, rw0000000d9: { primary: "rw0000000a1" } } });
    const env = env0({ INTEL: st.binding }), t = await partner(env);
    const id = await env.DB.prepare("SELECT id FROM members WHERE email = 'core@f.test'").first("id");
    await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'notify', ?, ?)").bind(id, JSON.stringify({ files: 9 }), new Date().toISOString()).run();
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:nw0000000c3", "intel:rw0000000a1", "intel:rw0000000d9"] });
    assert.deepEqual(st.files().map(p => [p.body.id, p.body.max_bytes]), [["rw0000000a1", 8000000]], "the RFQ gets the whole e-mail's room and the 10th file of the day; its duplicate is folded, never fetched");
    assert.deepEqual(r.data.items.map(x => [x.ref, x.file.attached ? "attached" : x.file.reason]), [["intel:nw0000000c3", "kind"], ["intel:rw0000000a1", "attached"]]);
    assert.doesNotMatch(lastMail().text, /وصلت لحد 10 ملفات/);
    assert.equal((await events(env)).at(-1).files, 1);
  });
  test("the SEND_EMAIL binding cannot attach: cards only (no file asked), the e-mail says why (no_attach_provider), attached 0", async () => {
    const got = [], st = intelStub(), env = env0({ INTEL: st.binding });
    const t = await partner(env);
    delete env.RESEND_API_KEY; env.SEND_EMAIL = { async send(x) { got.push(x); return { messageId: "cf-1" }; } };
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual(st.packs().map(p => p.body), [{ id: "rw0000000a1", file: false }]);
    assert.equal(got.length, 1); assert.ok(got[0].text.includes("الملف الرسمي مش مرفق: نظام الإيميل اللي شغالين بيه دلوقتي مابيقدرش يرفق ملفات"), got[0].text);
    assert.deepEqual([r.data.attached, r.data.items[0].file.reason], [0, "no_attach_provider"]);
  });
  test("no binding: no call at all, the short link and «unavailable»; a failed card → the public item (card + links, contacts out, «pack_off», no file asked); both failing → «unavailable»", async () => {
    let env = env0(), t = await partner(env);
    let r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual([r.data.items[0].found, r.data.items[0].reason], [false, "unavailable"]);
    assert.ok(lastMail().text.includes("1) ماقدرتش أوصل لمركز المعلومات دلوقتي علشان أجيب تفاصيل الفرصة دي — جرّب صفحتها بعد شوية: https://madeinegyptgate.com/intel/tenders/rw0000000a1/"));
    assert.equal(lastMail().subject, "رسالة من باسم / A note from Bassem"); assert.deepEqual(other, []);
    for (const fail of [() => Response.json({ error: "unauthorized" }, { status: 401 }), () => Response.json({ error: "x" }, { status: 503 }), () => { throw new Error("socket hang up"); }, () => Response.json({ error: "not found" }, { status: 404 }), () => new Response("<html>", { status: 200 })]) {
      const st = intelStub({ card: fail }); env = env0({ INTEL: st.binding }); t = await partner(env);
      r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
      assert.deepEqual(st.log.map(x => x.path + x.search), ["/api/intel/mailpack", "/api/intel/item/rw0000000a1?lang=ar", "/api/intel/item/rw0000000a1?lang=en"]);
      assert.ok(st.log.every(x => x.host === "mailpack.binding.invalid"));
      const it = r.data.items[0], text = lastMail().text;
      assert.deepEqual([it.found, it.file.reason, r.data.attached], [true, "pack_off", 0]);
      assert.ok(text.includes("1) توريد كيماويات معالجة المياه") && text.includes("الجهة: Rand Water") && text.includes("صفحتها على المنصة: https://madeinegyptgate.com/intel/rfq/rw0000000a1/"), text);
      assert.ok(text.includes("الملف الرسمي مش مرفق: جلب الملفات من مركز المعلومات مش شغال دلوقتي."));
      assert.doesNotMatch(text, /@randwater|682 0000|\+27/, "the public summary goes through stripPII");
    }
    const st = intelStub({ card: () => Response.json({}, { status: 503 }), item: () => Response.json({}, { status: 503 }) }); env = env0({ INTEL: st.binding }); t = await partner(env);
    r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual([r.data.items[0].found, r.data.items[0].reason], [false, "unavailable"]);
  });
  test("the item itself is gone (404 / 410 {found:false}) → «not_found», no card; a file that is not what it claims → «unsupported», never attached; the file answer failing → its reason", async () => {
    for (const status of [404, 410]) {
      const st = intelStub({ card: () => Response.json({ ok: false, found: false, ...(status === 410 ? { gone: true } : {}) }, { status }) }), env = env0({ INTEL: st.binding }), t = await partner(env);
      const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
      assert.deepEqual([r.data.items[0].found, r.data.items[0].reason], [false, "not_found"]); assert.equal(st.log.length, 1, "no fallback for a gone item");
      assert.ok(lastMail().text.includes("1) الفرصة دي اتشالت من مركز المعلومات أو خلصت مدتها، فمافيش تفاصيل أبعتهالك"));
    }
    const html = Buffer.from("<html><body>login</body></html>");
    for (const file of [{ bytes: html }, { size: PDF.length + 1 }, { type: DOCX_T }, { ctype: DOCX_T, type: DOCX_T }, { bytes: Buffer.from("%PDF") }]) {
      const st = intelStub({ over: { rw0000000a1: { file } } }), env = env0({ INTEL: st.binding }), t = await partner(env);
      const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
      assert.deepEqual([r.data.items[0].file.reason, r.data.attached, lastMail().attachments], ["unsupported", 0, undefined], JSON.stringify(file).slice(0, 80));
    }
    for (const [ans, why] of [[() => Response.json({ error: "x" }, { status: 503 }), "pack_off"], [() => { throw new Error("reset"); }, "pack_off"], [() => new Response("x".repeat(300000), { headers: { "Content-Type": "application/json" } }), "pack_off"]]) {
      const st = intelStub({ file: ans }), env = env0({ INTEL: st.binding }), t = await partner(env);
      const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
      assert.deepEqual([r.data.items[0].found, r.data.items[0].file.reason], [true, why]);
    }
  });
  test("review R1: the Tender Notice came, the Tender Document did not (too large) — the e-mail names both, with the document's own link; the reply tells Bassem the same", async () => {
    const H1 = "https://tenders.go.ke/storage/Documents/1794975769031-tender-document.pdf", H2 = "https://tenders.go.ke/storage/Documents/1794975769031-tender-notice.pdf";
    const st = intelStub({ over: { ke000313416: { file: { name: "1794975769031-tender-notice.pdf", from: "hint", label: "Tender Notice", doc: H2, skipped: { label: "Tender Document", flag: "too_large", size: 9400000, url: H1 } } } } });
    const env = env0({ INTEL: st.binding }), t = await partner(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:ke000313416"] });
    const text = lastMail().text;
    for (const s of ["📎 مرفق في الإيميل ده: إعلان المناقصة (Tender Notice) — 1794975769031-tender-notice.pdf (0.1 ميجا)", "كراسة الشروط (Tender Document) مااترفقتش: الملف كبير (9.4 ميجا) على الإيميل. تقدر تحمّلها من هنا: " + H1,
      "📎 Attached to this e-mail: the Tender Notice — 1794975769031-tender-notice.pdf (0.1 MB)", "The Tender Document was not attached: the file is too large for e-mail (9.4 MB). You can download it here: " + H1]) assert.ok(text.includes(s), s);
    assert.doesNotMatch(text, /📎 الملف الرسمي مرفق/, "the notice is never called «the official file» when the document did not come");
    assert.ok(lastMail().html.includes('href="' + H1 + '"'));
    assert.deepEqual(r.data.items[0].file, { attached: true, name: "1794975769031-tender-notice.pdf", size: PDF.length, label: { ar: "إعلان المناقصة (Tender Notice)", en: "Tender Notice" },
      skipped: { label: { ar: "كراسة الشروط (Tender Document)", en: "Tender Document" }, reason: "too_large", why: { ar: "الملف كبير (9.4 ميجا) على الإيميل", en: "the file is too large for e-mail (9.4 MB)" } } });
  });
  test("review R6: the official link itself answers 404 — said so, its button and URL marked «not opening now», never «open it from the official link»", async () => {
    const st = intelStub({ over: { pj0000000e5: { card: { kind: "project", kind_label: "مشروع", entity: "" }, file: null, reason: "gone", doc: DOC_URL } } }), env = env0({ INTEL: st.binding }), t = await partner(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:pj0000000e5"] });
    const b = lastMail();
    assert.ok(b.text.includes("الملف الرسمي مش مرفق: الرابط الرسمي نفسه مبقاش شغال على موقع الجهة (اتشال أو اتنقل).") && b.text.includes("الرابط الرسمي: " + DOC_URL + " (مابيفتحش دلوقتي)"));
    assert.ok(b.text.includes("The official file is not attached: the official link itself no longer works on the buyer's site (removed or moved).") && b.text.includes("Official link: " + DOC_URL + " (not opening now)"));
    assert.doesNotMatch(b.text, /تقدر تفتحه من الرابط الرسمي|open it from the official link/);
    assert.match(b.html, /الرابط الرسمي ↗ \(مابيفتحش دلوقتي\)<\/a>/);
    assert.ok(b.text.includes("صاحب المشروع: مش منشور في المصدر") && b.text.includes("Project owner: not published at the source"), "review R10: a project has an owner, not a buyer");
    assert.equal(r.data.items[0].file.why.en, "the official link itself no longer works on the buyer's site");
  });
});

describe("platform tenders, provider refusal", () => {
  test("item:eg-tnd-003 (the real items.json): the record's card, its /tender-item/ page checked on the Pages URL, the official notice link, «platform_listing»", async () => {
    const env = env0({ INTEL: intelStub().binding }), t = await partner(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["item:eg-tnd-003"] });
    assert.deepEqual(pages, [{ url: "https://madeinegyptgate.pages.dev/tender-item/eg-tnd-003/", method: "HEAD" }]);
    const text = lastMail().text;
    for (const s of ["1) تصنيع وتوريد وتركيب منشآت معدنية لصوامع (شون) قمح مغطاة", "رقم المناقصة: 6/2026/2027", "الجهة: شركة مطاحن مصر العليا", "المكان: الأقصر (طيبة الجديدة)", "آخر ميعاد للتقديم: 8 ديسمبر 2026",
      "التأمين الابتدائي: 1,000,000 جنيه · ثمن الكراسة: 7,000 جنيه", "صفحتها على المنصة: https://madeinegyptgate.com/tender-item/eg-tnd-003/", "رابط الإعلان الرسمي (meobserver.news): https://meobserver.news/tenders/2026/11/16/tender-no-2147-upper-egypt-flour-mills/",
      "الملف الرسمي مش مرفق: ده إعلان من بيانات المنصة نفسها", "Buyer: Upper Egypt Flour Mills", "Its page on the platform: https://madeinegyptgate.com/tender-item/eg-tnd-003/?lang=en"]) assert.ok(text.includes(s), s);
    assert.deepEqual([r.data.items[0].file.reason, r.data.attached], ["platform_listing", 0]);
  });
  test("review F2: an international tender whose id has spaces («intl-558/2026/BTB (BE2630001388)») gets its card and its /tender-item/ page", async () => {
    const env = env0({ INTEL: intelStub().binding }), t = await partner(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["item:intl-558/2026/BTB (BE2630001388)"] });
    assert.deepEqual([r.data.items.length, r.data.items[0].found, r.data.items[0].id, r.data.items[0].page], [1, true, "intl-558/2026/BTB (BE2630001388)", SITE + "/tender-item/558-2026-btb-be2630001388/"]);
    assert.ok(lastMail().text.includes("صفحتها على المنصة: https://madeinegyptgate.com/tender-item/558-2026-btb-be2630001388/"), lastMail().text.slice(0, 600));
    assert.notEqual(lastMail().subject, "رسالة من باسم / A note from Bassem");
    assert.deepEqual(pages.map(p => p.url), ["https://madeinegyptgate.pages.dev/tender-item/558-2026-btb-be2630001388/"]);
  });
  test("review R4 / F3: a tender page's own list key (OFF:6/2026/2027, 3 tenders) — with the page's title it is that tender; without, it is said shared with the number and the titles; beside the same tender's own id it is said once", async () => {
    const T3 = "تصنيع وتوريد وتركيب منشآت معدنية لصوامع (شون) قمح مغطاة بسعة إجمالية 60 ألف طن بمدينة طيبة الجديدة";
    const env = env0({ INTEL: intelStub().binding }), t = await partner(env);
    let r = await notify(env, t, { message: "x", channel: "email", items: [{ ref: "item:OFF:6/2026/2027", title: T3 }] });
    assert.deepEqual([r.data.items[0].found, r.data.items[0].id], [true, "eg-tnd-003"]);
    r = await notify(env, t, { message: "x", channel: "email", items: [{ ref: "item:OFF:6/2026/2027", title: "عنوان مالوش علاقة خالص" }] });
    assert.deepEqual([r.data.items[0].found, r.data.items[0].reason], [false, "ambiguous"], "a title that matches none of them never picks one");
    assert.match(lastMail().text, /1\) الرقم 6\/2026\/2027 مشترك بين 3 مناقصات في بيانات المنصة \(«تصنيع وتوريد وتركيب منشآت معدنية[^»]*»، «توريد محولات أوتوماتيكية لتنظيم الجهد \(AVR\)»، «توريد وصلات ألومنيوم معزولة»\)، فماحطّيتش تفاصيل أي واحدة علشان ماغلطش/);
    assert.match(lastMail().text, /1\) the number 6\/2026\/2027 is shared by 3 tenders in the platform's data/);
    r = await notify(env, t, { message: "x", channel: "email", items: ["item:eg-tnd-003", "item:OFF:6/2026/2027"] });
    assert.deepEqual(r.data.items.map(x => [x.ref, x.found]), [["item:eg-tnd-003", true]], "the shared key of the tender already in the e-mail is not said again");
    assert.doesNotMatch(lastMail().text, /مشترك بين/);
    /* a title never searches all the tenders: an unknown key stays unknown */
    r = await notify(env, t, { message: "x", channel: "email", items: [{ ref: "item:no-such-key", title: T3 }] });
    assert.deepEqual([r.data.items[0].found, r.data.items[0].reason], [false, "not_found"]);
  });
  test("the page check: 404 → «مش متاحة دلوقتي» instead of the link; a redirect elsewhere too; an error or a 405 keeps the link; a shared number → «ambiguous»", async () => {
    for (const [ans, kept] of [[() => new Response(null, { status: 404 }), false], [() => new Response(null, { status: 301, headers: { location: "/tenders/" } }), false], [() => new Response(null, { status: 308, headers: { location: "/tender-item/eg-tnd-003" } }), true],
      [() => new Error("network"), true], [() => new Response(null, { status: 405 }), true]]) {
      pageAnswer = ans;
      const env = env0({ INTEL: intelStub().binding }), t = await partner(env);
      const r = await notify(env, t, { message: "x", channel: "email", items: ["item:eg-tnd-003"] });
      const text = lastMail().text;
      assert.equal(text.includes("صفحتها على المنصة: https://madeinegyptgate.com/tender-item/eg-tnd-003/"), kept, String(ans));
      assert.equal(text.includes("صفحتها على المنصة مش متاحة دلوقتي"), !kept);
      assert.equal(r.data.items[0].page, kept ? SITE + "/tender-item/eg-tnd-003/" : null);
    }
    const env = env0({ INTEL: intelStub().binding }), t = await partner(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["item:OFF:1", "item:no-such-tender"] });
    assert.deepEqual(r.data.items.map(x => [x.found, x.reason]), [[false, "ambiguous"], [false, "not_found"]]);
    assert.match(lastMail().text, /1\) الرقم \S+ مشترك بين 5 مناقصات في بيانات المنصة/); assert.ok(lastMail().text.includes("2) الفرصة دي مش موجودة في بيانات المنصة دلوقتي"));
  });
  test("Resend refuses the attachment (422): the same e-mail again without it under a new nt- id, saying so; attached 0; two log rows", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    resendStatus = [422, 200];
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.equal(mail.length, 2);
    assert.equal(mail[0].body.attachments.length, 1); assert.equal(mail[1].body.attachments, undefined);
    assert.notEqual(mail[0].key, mail[1].key); assert.match(mail[1].key, /^nt-[0-9a-f]{16}$/);
    assert.ok(mail[1].body.text.includes("الملف الرسمي مش مرفق: مزوّد الإيميل رفض الملف المرفق، فبعتنالك الإيميل من غيره."));
    assert.deepEqual([r.data.sent.email, r.data.attached, r.data.items[0].file.reason], [true, 0, "provider_refused"]);
    assert.deepEqual((await env.DB.prepare("SELECT status, error FROM cc_mail_log WHERE template = 'bassem_note' ORDER BY id").all()).results.map(x => [x.status, x.error]), [["failed", "resend 422: Attachment refused"], ["sent", ""]]);
    assert.equal((await events(env)).at(-1).files, 0);
  });
});

describe("WhatsApp, limits and switches", () => {
  test("channel whatsapp inside the 24 h window: cards only (no file asked); the text has the page and official links, ≤ 2000 characters, no e-mail line", async () => {
    const st = intelStub(), env = await waSwitchOn(env0({ INTEL: st.binding, RESPONDIO_TOKEN: "tok" })), t = await partner(env, { wa: "window" });
    const r = await notify(env, t, { message: "دي الفرصة", channel: "whatsapp", items: ["intel:rw0000000a1", "item:eg-tnd-003"] });
    assert.deepEqual(st.packs().map(p => p.body), [{ id: "rw0000000a1", file: false }]);
    assert.equal(mail.length, 0);
    const txt = wa.at(-1).body.message.text;
    assert.equal(wa.at(-1).body.message.type, "text"); assert.ok(txt.length <= 2000);
    assert.ok(txt.startsWith("دي الفرصة\n\n📌 من بيانات المنصة · From the platform's data:\n1) توريد وتسليم كيماويات"), txt);
    for (const s of ["صفحتها · Page: https://madeinegyptgate.com/intel/rfq/rw0000000a1/", "الرسمي · Official: " + DOC_URL, "2) تصنيع وتوريد", "صفحتها · Page: https://madeinegyptgate.com/tender-item/eg-tnd-003/"]) assert.ok(txt.includes(s), s);
    assert.doesNotMatch(txt, /📧/);
    assert.deepEqual([r.data.sent, r.data.items[0].file.reason], [{ email: false, whatsapp: true }, "whatsapp_only"]);
  });
  test("channel both with files attached: the WhatsApp text says how many official files are in the e-mail; outside the window the template goes and the text waits, delivered whole on the member's reply", async () => {
    const st = intelStub(), env = await waSwitchOn(env0({ INTEL: st.binding, RESPONDIO_TOKEN: "tok", WA_WEBHOOK_SECRET: "hook" })), t = await partner(env, { wa: "window" });
    let r = await notify(env, t, { message: "دي الفرصة", channel: "both", items: ["intel:rw0000000a1"] });
    assert.equal(r.data.attached, 1);
    assert.match(wa.at(-1).body.message.text, /📧 التفاصيل كاملة في إيميلك · Full details are in your e-mail — والملف الرسمي مرفق هناك · the official file is attached there$/);
    r = await notify(env, t, { message: "دي الفرص", channel: "both", items: ["intel:rw0000000a1", "intel:rw0000000a2"] });
    assert.equal(r.data.attached, 2);
    assert.match(wa.at(-1).body.message.text, /— والملفين الرسميين مرفقين هناك · the 2 official files are attached there$/, "review R11");
    await env.DB.prepare("UPDATE members SET wa_last_in_at = '' WHERE email = 'core@f.test'").run();
    r = await notify(env, t, { message: "فرصة تانية", channel: "both", items: ["intel:rw0000000a1"] });
    assert.deepEqual([r.data.sent.whatsapp, r.data.pending.whatsapp], [false, true]);
    assert.equal(wa.at(-1).body.message.type, "whatsapp_template");
    const queued = await env.DB.prepare("SELECT text FROM wa_messages WHERE status = 'queued'").first("text");
    assert.ok(queued.startsWith("فرصة تانية\n\n📌") && queued.includes("الرسمي · Official: " + DOC_URL) && queued.length <= 2000);
    const n0 = wa.length;
    await api(env, "POST", "/api/wa/inbound?secret=hook", { body: { contact: { phone: "+201001112223" }, message: { traffic: "incoming", message: { type: "text", text: "تمام" } } } });
    assert.ok(wa.slice(n0).some(w => w.body.message.type === "text" && w.body.message.text === queued), "delivered whole on his reply");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM wa_messages WHERE status = 'queued'").first("n"), 0);
  });
  test("10 files in the rolling 24 h → no file asked, «daily_files»; 20 notifies → 429; the job is kept alive with ctx.waitUntil", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    const id = await env.DB.prepare("SELECT id FROM members WHERE email = 'core@f.test'").first("id"), at = new Date().toISOString();
    for (const f of [4, 6]) await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'notify', ?, ?)").bind(id, JSON.stringify({ files: f }), at).run();
    let r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual(st.packs().map(p => p.body), [{ id: "rw0000000a1", file: false }]);
    assert.equal(r.data.items[0].file.reason, "daily_files"); assert.ok(lastMail().text.includes("الملف الرسمي مش مرفق: وصلت لحد 10 ملفات مرفقة في اليوم"));
    const old = new Date(Date.now() - 25 * 3600e3).toISOString();
    await env.DB.prepare("UPDATE events SET at = ? WHERE type = 'notify'").bind(old).run();
    const c0 = mkCtx(), c1 = mkCtx();
    await notify(env, t, { message: "x", channel: "email" }, c0);
    r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] }, c1);
    assert.equal(r.data.attached, 1, "the files of yesterday no longer count");
    assert.equal(c1.n, c0.n + 1, "one more waitUntil: the job");
    for (let i = 0; i < 18; i++) await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'notify', '{}', ?)").bind(id, new Date().toISOString()).run();
    const lim = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual([lim.status, lim.data.code], [429, "rate_limited"]);
  });
  test("review SEC-1: 30 notifies at once for one member — the caps hold (one statement reserves the notify and its files before the slow work): one job runs, the rest 429 notify_busy; then ≤ 10 files and ≤ 20 notifies a day", async () => {
    let held = null;
    const gate = new Promise(res => { held = res; });
    const st = intelStub({ file: async () => { await gate; return null; } }), env = env0({ INTEL: st.binding }), t = await partner(env);
    const ids = i => [0, 1, 2].map(k => "intel:" + ("r" + i + "x" + k + "0000000000").slice(0, 11));
    /* the first job waits inside its file download until the 29 others have their answer (a safety release after 3 s) */
    let refused = 0; const safety = setTimeout(() => held(), 3000);
    const out = await Promise.all(Array.from({ length: 30 }, (_, i) => notify(env, t, { message: "m" + i, channel: "email", items: ids(i) }).then(r => { if (r.status === 429 && ++refused === 29) held(); return r; })));
    clearTimeout(safety);
    assert.deepEqual([out.filter(x => x.status === 200).length, out.filter(x => x.status === 429 && x.data.code === "notify_busy").length], [1, 29]);
    assert.equal(out.find(x => x.status === 429).data.retry_after, 5);
    assert.deepEqual([mail.length, mail[0].body.attachments.length], [1, 3]);
    let ev = await events(env);
    assert.deepEqual([ev.length, ev[0].files, ev.some(e => e.state === "running")], [1, 3, false], "the reserved row got its outcome");
    /* one after another: 3 + 3 + 3 + 1 files, then none («daily_files»), never more than 10 */
    for (let i = 0; i < 4; i++) await notify(env, t, { message: "n" + i, channel: "email", items: ids(40 + i) });
    ev = await events(env);
    assert.deepEqual(ev.map(e => e.files), [3, 3, 3, 1, 0]);
    assert.equal(mail.reduce((n, m) => n + (m.body.attachments ? m.body.attachments.length : 0), 0), 10);
    assert.match(lastMail().text, /وصلت لحد 10 ملفات مرفقة في اليوم/);
    /* a job that never finished (a crashed isolate) blocks only for a minute; a note without opportunities is never held */
    const id = await env.DB.prepare("SELECT id FROM members WHERE email = 'core@f.test'").first("id");
    await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'notify', ?, ?)").bind(id, JSON.stringify({ state: "running", files: 0 }), new Date().toISOString()).run();
    assert.equal((await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] })).data.code, "notify_busy");
    assert.equal((await notify(env, t, { message: "x", channel: "email" })).status, 200);
    await env.DB.prepare("UPDATE events SET at = ? WHERE data LIKE '%running%'").bind(new Date(Date.now() - 61000).toISOString()).run();
    assert.equal((await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] })).status, 200);
    for (let i = (await events(env)).length; i < 20; i++) await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'notify', '{}', ?)").bind(id, new Date().toISOString()).run();
    const lim = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    assert.deepEqual([lim.status, lim.data.code], [429, "rate_limited"]);
  });
  test("review SEC-2: one notify with files at a time in an isolate — another member's at the same moment goes with links and «files_busy»; the slot is free again after the e-mail", async () => {
    let held = null, entered = null;
    const inside = new Promise(res => { entered = res; }), gate = new Promise(res => { held = res; });
    const st = intelStub({ file: async b => { if (b.id === "rw0000000a1") { entered(); await gate; } return null; } }), env = env0({ INTEL: st.binding });
    const ta = await partner(env), tb = await partner(env, { email: "two@f.test", phone: "01001112224" });
    const a = notify(env, ta, { message: "a", channel: "email", items: ["intel:rw0000000a1"] });
    await inside;
    const b = await notify(env, tb, { message: "b", channel: "email", items: ["intel:rw0000000b1"] });
    assert.deepEqual([b.status, b.data.items[0].file.reason, b.data.attached], [200, "files_busy", 0]);
    assert.ok(mail.at(-1).body.text.includes("المنصة بتجهّز ملفات إيميل تاني في نفس اللحظة"));
    held();
    const ra = await a;
    assert.equal(ra.data.attached, 1);
    const again = fileSlot();
    assert.equal(typeof again, "function", "the slot was released"); again();
  });
  test("intel_pages switched off («🛠️ المطوّر»): no /intel/ link anywhere, the official link stays; a member without a plan never reaches it", async () => {
    const st = intelStub(), env = env0({ INTEL: st.binding }), t = await partner(env);
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify({ v: 1, values: { intel_pages: false }, changed: {} }), new Date().toISOString()).run();
    forgetFeatures(env);
    const r = await notify(env, t, { message: "x", channel: "email", items: ["intel:rw0000000a1"] });
    const b = lastMail();
    assert.doesNotMatch(b.text + b.html, /madeinegyptgate\.com\/intel\//); assert.ok(b.text.includes("الرابط الرسمي: " + DOC_URL));
    assert.equal(r.data.items[0].page, null);
    const basic = env0({ INTEL: st.binding }), admin = await signIn(basic, "boss@mig.test");
    await api(basic, "POST", "/api/admin/members", { token: admin, body: { email: "basic@f.test", plan: "basic", company: "B" } });
    const tb = await signIn(basic, "basic@f.test"), n0 = st.log.length;
    assert.equal((await notify(basic, tb, { message: "x", items: ["intel:rw0000000a1"] })).status, 403); assert.equal(st.log.length, n0);
  });
});
