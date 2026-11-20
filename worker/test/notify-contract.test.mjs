// node --test: the two halves of the «ابعتلي» mail pack against EACH OTHER (review F5) — worker/src/notify-items.js resolveNotifyItems with
// env.INTEL = the REAL migate-intel Worker (worker-intel/src/index.js, its D1 on node:sqlite with migrations/0001_init.sql), so a drift
// in field names, link shapes, the file answer (raw body + X-Mailpack) or the reasons fails here even when both suites pass alone. The
// official sites are mocked through globalThis.fetch (migate-intel's own reader); nothing leaves this process. Plus the time limits:
// a binding that never answers costs at most its abort, never the member's whole call.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import intelWorker from "../../worker-intel/src/index.js";
import { makeD1, makeKV } from "../../worker-intel/test/d1.mjs";
import { resolveNotifyItems, notifyMail, replyItems } from "../src/notify-items.js";

const MIG = new URL("../../worker-intel/migrations/0001_init.sql", import.meta.url).pathname;
const DOC_URL = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW%2001234%20RFQ%20advert.pdf";
const RW = { id: "rw0000000a1", source_id: "za", ext_id: "ocds-test-1", kind: "rfq", market: "africa:za", country: "South Africa", sector: 28, title_orig: "Supply and delivery of water treatment chemicals",
  title_ar: "توريد وتسليم كيماويات معالجة المياه", summary_ar: "طلب عرض أسعار من Rand Water", entity: "Rand Water", published_at: "2026-11-10T00:00:00.000Z", deadline: "2026-12-24T00:00:00.000Z", value: 1250000, currency: "ZAR",
  url: DOC_URL, url_norm: "etenders.gov.za/rw", status: "open", relevance: 70, first_seen_at: "2026-11-10T08:00:00.000Z", slug: "supply-x" };
const DUP = { ...RW, id: "rw0000000d9", dup_of: RW.id, url: "https://www.etenders.gov.za/other.pdf", url_norm: "etenders.gov.za/other.pdf" };
const NEWS = { id: "nw0000000c3", source_id: "za", kind: "news", market: "eg", title_orig: "Egypt steel output rises", url: "https://www.etenders.gov.za/news/1", url_norm: "x/news/1", status: "info", relevance: 10, first_seen_at: "2026-11-17T08:00:00.000Z" };
const KE = { id: "ke000313416", source_id: "ke", kind: "tender_gov", market: "africa:ke", country: "Kenya", title_orig: "Supply and Delivery of Assorted Electrical Cables and Accessories", entity: "Kenya Power and Lighting Company",
  url: "https://tenders.go.ke/tenders/313416", url_norm: "tenders.go.ke/tenders/313416", status: "open", relevance: 66, first_seen_at: "2026-11-15T08:00:00.000Z", deadline: "2026-12-03T00:00:00.000Z" };
const OFF_SITE = { ...RW, id: "rw0000000f7", url: "https://www.etenders.gov.za/home/Download?blobName=moved.pdf", url_norm: "etenders.gov.za/moved" };
const H1 = "https://tenders.go.ke/storage/Documents/1794975769031-tender-document.pdf", H2 = "https://tenders.go.ke/storage/Documents/1794975769031-tender-notice.pdf";
function makePdf(pad = 0) {
  const data = deflateSync(Buffer.from("BT (RFQ) Tj ET"));
  return Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length " + data.length + " /Filter /FlateDecode >>\nstream\n"), data, Buffer.from("\nendstream\nendobj\n" + " ".repeat(pad) + "trailer\n<<>>\n%%EOF\n")]);
}
const PDF = makePdf();
async function intelEnv() {
  const DB = makeD1(MIG);
  for (const [id, name, ar] of [["za", "South Africa — eTenders", "جنوب أفريقيا — بوابة المناقصات"], ["ke", "Kenya — PPIP", "كينيا — بوابة المشتريات"]])
    await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES (?,?,?,'tender_gov','africa','json','https://example.org','{}')").bind(id, name, ar).run();
  const cols = ["id", "source_id", "ext_id", "kind", "market", "country", "sector", "title_orig", "title_ar", "summary_ar", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "relevance", "status", "hidden", "dup_of", "slug", "first_seen_at"];
  for (const x of [RW, DUP, NEWS, KE, OFF_SITE]) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => (x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c]))).run();
  const KV = makeKV();
  await KV.put("dochint:" + KE.id, JSON.stringify({ h: [{ u: H1, t: "Tender Document" }, { u: H2, t: "Tender Notice" }] }));
  return { DB, KV };
}
/* the real Worker behind the binding; every request it gets is logged */
function binding(env) {
  const log = [];
  return { log, INTEL: { fetch: req => { log.push({ host: new URL(req.url).hostname, path: new URL(req.url).pathname }); return intelWorker.fetch(req, env, { waitUntil() {}, passThroughOnException() {} }); } } };
}
let fetched, realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch; fetched = [];
  globalThis.fetch = async (u, init = {}) => {
    u = String(u); fetched.push(u);
    if (u.endsWith("/robots.txt")) return new Response("nf", { status: 404 });
    if (u === DOC_URL) return new Response(PDF, { headers: { "content-type": "application/pdf", "content-length": String(PDF.length), "content-disposition": 'attachment; filename="RW 01234 RFQ advert.pdf"' } });
    if (u === H1) return new Response("x", { headers: { "content-type": "application/pdf", "content-length": "9400000" } });
    if (u === H2) return new Response(PDF, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="1794975769031-tender-notice.pdf"' } });
    if (u === OFF_SITE.url) return new Response(null, { status: 302, headers: { location: "https://files.not-the-buyer.com/payload.pdf" } });
    return new Response("not found", { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const O = { channel: "email", mailOk: true, provider: "resend", filesLeft: 10 };

describe("the mail pack contract: notify-items.js ↔ the real migate-intel", () => {
  test("an RFQ, its duplicate and a news item: the file attached (bytes exact), the short /intel/ page, the duplicate folded (one download), the news without a file", async () => {
    const ienv = await intelEnv(), b = binding(ienv);
    const items = await resolveNotifyItems({ INTEL: b.INTEL }, ["intel:rw0000000a1", "intel:rw0000000d9", "intel:nw0000000c3"], O);
    assert.ok(b.log.length >= 4 && b.log.every(x => x.host === "mailpack.binding.invalid" && x.path === "/api/intel/mailpack"), "every call on the binding-only hostname");
    const r = replyItems(items);
    assert.deepEqual(r.map(x => [x.ref, x.found, x.id]), [["intel:rw0000000a1", true, "rw0000000a1"], ["intel:nw0000000c3", true, "nw0000000c3"]]);
    assert.deepEqual(r[0].file, { attached: true, name: "RW 01234 RFQ advert.pdf", size: PDF.length });
    assert.equal(r[0].page, "https://madeinegyptgate.com/intel/rfq/rw0000000a1/"); assert.equal(r[0].official, DOC_URL);
    assert.deepEqual([r[1].file.attached, r[1].file.reason], [false, "kind"]);
    assert.equal(fetched.filter(u => u === DOC_URL).length, 1, "the official file is downloaded once (the duplicate folds into its primary before any download)");
    const m = notifyMail({}, "x", items);
    assert.deepEqual(m.attachments.map(a => [a.filename, a.type]), [["RW 01234 RFQ advert.pdf", "application/pdf"]]);
    assert.deepEqual(Buffer.from(m.attachments[0].b64, "base64"), PDF, "the bytes exactly as the official site served them");
    assert.ok(m.text.includes("صفحتها على المنصة: https://madeinegyptgate.com/intel/rfq/rw0000000a1/") && m.text.includes("الجهة: Rand Water"));
  });
  test("the Kenya hints through the real reader: the Tender Notice attached, the Tender Document (too large) named with its own link — the labels survive the trip", async () => {
    const ienv = await intelEnv(), b = binding(ienv);
    const items = await resolveNotifyItems({ INTEL: b.INTEL }, ["intel:ke000313416"], O);
    const f = replyItems(items)[0].file;
    assert.deepEqual([f.attached, f.name, f.label, f.skipped && f.skipped.label, f.skipped && f.skipped.reason], [true, "1794975769031-tender-notice.pdf", { ar: "إعلان المناقصة (Tender Notice)", en: "Tender Notice" }, { ar: "كراسة الشروط (Tender Document)", en: "Tender Document" }, "too_large"]);
    assert.ok(notifyMail({}, "x", items).text.includes("كراسة الشروط (Tender Document) مااترفقتش: الملف كبير (9.4 ميجا) على الإيميل. تقدر تحمّلها من هنا: " + H1));
    assert.equal(items[0].links.doc, H2);
  });
  test("an official link that redirects to another host: no file, «off_site» said in both languages, the other host never asked", async () => {
    const ienv = await intelEnv(), b = binding(ienv);
    const items = await resolveNotifyItems({ INTEL: b.INTEL }, ["intel:rw0000000f7"], O);
    const f = replyItems(items)[0].file;
    assert.deepEqual([f.attached, f.reason], [false, "off_site"]);
    assert.match(f.why.ar, /موقع تاني غير موقع الجهة الرسمي/); assert.match(f.why.en, /another|other than the buyer's official site/);
    assert.ok(!fetched.some(u => /not-the-buyer/.test(u)), fetched.join(" "));
  });
  test("whatsapp: the cards only — migate-intel is never asked for a file and nothing is downloaded", async () => {
    const ienv = await intelEnv(), b = binding(ienv);
    const items = await resolveNotifyItems({ INTEL: b.INTEL }, ["intel:rw0000000a1"], { ...O, channel: "whatsapp", mailOk: false });
    assert.deepEqual([items[0].found, items[0].file.reason], [true, "whatsapp_only"]);
    assert.deepEqual(fetched, []);
  });
});

describe("time limits (review F5): a binding that never answers costs its abort, nothing more", () => {
  const never = () => new Promise(() => {});
  test("the card never answers → the public item (card + links, «pack_off») within the card's abort", async () => {
    const ienv = await intelEnv(), INTEL = { fetch: req => (new URL(req.url).pathname === "/api/intel/mailpack" ? never() : intelWorker.fetch(req, ienv, { waitUntil() {} })) };
    const t0 = Date.now();
    const items = await resolveNotifyItems({ INTEL }, ["intel:rw0000000a1"], { ...O, lim: { cardMs: 150, itemMs: 1500 } });
    const ms = Date.now() - t0;
    assert.deepEqual([items[0].found, items[0].file.reason], [true, "pack_off"]);
    assert.ok(ms >= 140 && ms < 1500, "took " + ms + " ms");
  });
  test("the file never answers → the card stays, «timeout» (the buyer's site was slow) within budget + slack", async () => {
    const ienv = await intelEnv();
    const INTEL = { fetch: async req => { const c = req.clone(); const body = await c.json().catch(() => ({})); return body.file === true ? never() : intelWorker.fetch(req, ienv, { waitUntil() {} }); } };
    const t0 = Date.now();
    const items = await resolveNotifyItems({ INTEL }, ["intel:rw0000000a1"], { ...O, lim: { budgetMs: 150, minBudgetMs: 50, packSlack: 100, filesMs: 5000, fileMinMs: 50 } });
    const ms = Date.now() - t0;
    assert.deepEqual([items[0].found, items[0].file.attached, items[0].file.reason], [true, false, "timeout"]);
    assert.ok(ms >= 240 && ms < 2000, "took " + ms + " ms");
  });
  test("nothing answers at all → «unavailable» with the short link, within the card's and the item's aborts", async () => {
    const t0 = Date.now();
    const items = await resolveNotifyItems({ INTEL: { fetch: never } }, ["intel:rw0000000a1"], { ...O, lim: { cardMs: 120, itemMs: 120 } });
    const ms = Date.now() - t0;
    assert.deepEqual([items[0].found, items[0].reason, items[0].link], [false, "unavailable", "https://madeinegyptgate.com/intel/tenders/rw0000000a1/"]);
    assert.ok(ms >= 230 && ms < 1500, "took " + ms + " ms");
  });
  test("files one after another inside filesMs: when the time is up, the rest are said «time_up», never asked", async () => {
    const ienv = await intelEnv(); let asked = 0;
    const INTEL = { fetch: async req => { const body = await req.clone().json().catch(() => ({})); if (body.file === true) { asked++; await new Promise(r => setTimeout(r, 300)); } return intelWorker.fetch(req, ienv, { waitUntil() {} }); } };
    const items = await resolveNotifyItems({ INTEL }, ["intel:rw0000000a1", "intel:ke000313416"], { ...O, lim: { filesMs: 350, fileMinMs: 200, minBudgetMs: 50 } });
    assert.equal(asked, 1);
    assert.deepEqual(items.map(x => x.file.attached ? "attached" : x.file.reason), ["attached", "time_up"]);
  });
});
