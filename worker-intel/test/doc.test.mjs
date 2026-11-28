/* Bassem's tool, one result: action "item" (all its details) and "doc" (its own official document, src/doc.js).
   Owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي مش لاقي التفاصيل» and «بيقولي مش قادر اقرء الملف ال بي دي اف بتاع المناقصة في جنوب
   افريقيا». Every network read is a mock (no real host is ever called); Workers AI toMarkdown is a stub. */
import test from "node:test"; import assert from "node:assert/strict";
import { deflateSync, deflateRawSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { tool, itemRef, itemText, moneyAr, handleApi } from "../src/api.js";
import { checkUrl, siteOf, requirementsExcerpt, pdfText, docxText, readable, htmlText, docLinks, jsonDocs, cleanDocText, DOC_LIMITS, TOPIC_AR, fetchDoc, safeFileName } from "../src/doc.js";
import { enrichPending, aiBudget } from "../src/enrich.js";
import { itemHtml } from "../src/pages.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-19T18:00:00Z"), DAY = "2026-11-19";
const DOC_URL = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW%2001234%20RFQ%20advert.pdf";
/* an RFQ shaped like the South African eTenders rows (test data, not a real notice) */
const RW = { id: "rw0000000a1", source_id: "za", ext_id: "ocds-test-1", kind: "rfq", market: "africa:za", country: "South Africa", sector: 28, title_orig: "Supply and delivery of water treatment chemicals (aluminium sulphate) for 24 months",
  title_ar: "توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم) لمدة 24 شهراً", summary_ar: "طلب عرض أسعار من Rand Water لتوريد كيماويات معالجة المياه لمدة 24 شهراً، آخر موعد 24 نوفمبر 2026.",
  summary_orig: "Ref RW 01234 RFQ · Request for Quotation · goods", entity: "Rand Water", published_at: "2026-11-10T00:00:00.000Z", deadline: "2026-11-24T00:00:00.000Z", value: 1250000, currency: "ZAR",
  url: DOC_URL, url_norm: "etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW 01234 RFQ advert.pdf", status: "open", relevance: 70, first_seen_at: "2026-11-10T08:00:00.000Z", slug: "supply-and-delivery-of-water-treatment-chemicals" };
const GH = { id: "gh0000000b2", source_id: "gh", kind: "tender_gov", market: "africa:gh", country: "Ghana", title_orig: "Supply of laboratory equipment for the university", entity: "Kwame Nkrumah University of Science and Technology",
  deadline: "2026-12-02T00:00:00.000Z", url: "https://www.ghaneps.gov.gh/epps/cft/prepareViewCfTWS.do?resourceId=999", status: "open", relevance: 60, first_seen_at: "2026-11-17T08:00:00.000Z", published_at: "2026-11-17T00:00:00.000Z" };
async function envWith(items, extra = {}) {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql"));
  for (const [id, name, ar, market] of [["za", "South Africa — National Treasury eTenders OCDS API", "جنوب أفريقيا — بوابة المناقصات الحكومية", "africa:za"], ["gh", "Ghana – GHANEPS", "غانا – منظومة GHANEPS", "africa:gh"]])
    await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES (?,?,?,'tender_gov',?,'json','https://example.org','{}')").bind(id, name, ar, market).run();
  const cols = ["id", "source_id", "ext_id", "kind", "tag", "market", "country", "sector", "title_orig", "title_ar", "title_en", "summary_ar", "summary_en", "summary_orig", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "relevance", "status", "hidden", "dup_of", "slug", "first_seen_at"];
  for (const x of items) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => (x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c]))).run();
  return { DB, KV: makeKV(), AI_DAILY_LIMIT: "400", ...extra };
}

/* ---------- fixtures built here ---------- */
const TENDER_TEXT = [
  "RAND WATER — REQUEST FOR QUOTATION RW 01234",
  "Supply and delivery of water treatment chemicals (aluminium sulphate) for a period of 24 months.",
  "1. SCOPE OF WORK",
  "The supplier shall supply and deliver 1 200 tonnes of liquid aluminium sulphate per year to the Zuikerbosch purification station.",
  "2. ELIGIBILITY CRITERIA",
  "Bidders must be registered on the Central Supplier Database (CSD) and must submit a valid tax compliance status PIN. Minimum B-BBEE level 4.",
  "3. RETURNABLE DOCUMENTS",
  "Bidders must submit the following: completed SBD 1, SBD 4 and SBD 6.1 forms, certified copies of the company registration documents.",
  "4. BID SECURITY",
  "No bid security is required for this quotation. A performance guarantee of 5% will be required from the successful bidder.",
  "5. CLOSING DATE",
  "The closing date for quotations is 24 November 2026 at 11:00. Late quotations will not be accepted.",
  "6. SUBMISSION",
  "Quotations must be submitted electronically on the Rand Water supplier portal or deposited in the tender box at the Rand Water head office.",
  "Enquiries: procurement officer, e-mail buyer@randwater.example, tel. +27 11 682 0000",
];
const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
function makePdf({ lines = TENDER_TEXT, compress = true, image = false, encrypt = false, logo = false } = {}) {
  const content = image ? "q 595 0 0 842 0 0 cm /Im1 Do Q" : "BT /F1 10 Tf 50 800 Td 12 TL " + lines.map(l => "(" + esc(l) + ") Tj T*").join(" ") + " ET";
  const data = compress ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n", "latin1"),
    Buffer.from("4 0 obj\n<< /Length " + data.length + (compress ? " /Filter /FlateDecode" : "") + " >>\nstream\n", "latin1"), data, Buffer.from("\nendstream\nendobj\n", "latin1"),
    Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n", "latin1")];
  if (image || logo) parts.push(Buffer.from("6 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n\xff\xd8\xff\xd9\nendstream\nendobj\n", "latin1"));
  parts.push(Buffer.from((encrypt ? "trailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n" : "trailer\n<< /Root 1 0 R >>\n") + "%%EOF\n", "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}
function makeZip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8"), comp = deflateRawSync(raw), nb = Buffer.from(name, "latin1"), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); centrals.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(centrals.length / 2, 8); e.writeUInt16LE(centrals.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, e]));
}
const DOCX = () => makeZip({ "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    TENDER_TEXT.map(l => '<w:p><w:r><w:t xml:space="preserve">' + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</w:t></w:r></w:p>").join("") + "</w:body></w:document>" });
const NOTICE_HTML = (extra = "") => `<!doctype html><html><head><title>Notice</title></head><body><nav><a href="/">Home</a> <a href="/login">Login</a></nav><main><h1>Supply of laboratory equipment</h1>
<p>Procuring entity: Kwame Nkrumah University of Science and Technology. Lot 1: spectrophotometers (2 units); Lot 2: fume hoods (4 units).</p>
<h2>Eligibility</h2><p>Bidders must hold a valid business registration certificate and a tax clearance certificate.</p>
<h2>Bid security</h2><p>A bid security of GHS 20,000 in the form of a bank guarantee is required.</p>
<h2>Submission</h2><p>Bids must be submitted electronically on GHANEPS not later than 2 December 2026 at 10:00 GMT.</p>${extra}</main><footer>© portal</footer></body></html>`;

/* a mock network: map url → response factory; robots.txt 404 unless given; every request logged */
function net(map, { robots = {} } = {}) {
  const log = [];
  const fn = async (url, init = {}) => {
    url = String(url); log.push({ url, init });
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return robots[u.host] != null ? new Response(robots[u.host], { status: 200 }) : new Response("nf", { status: 404 });
    const h = map[url];
    if (!h) return new Response("not found", { status: 404 });
    return typeof h === "function" ? h(url, init) : h.clone ? h.clone() : h;
  };
  return { fn, log, hits: re => log.filter(x => re.test(x.url) && !/robots\.txt/.test(x.url)) };
}
const pdfRes = (bytes, extra = {}) => () => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(bytes.length), ...extra } });
const aiStub = (data = "# RFQ RW 01234\n\n" + TENDER_TEXT.join("\n\n"), calls = []) => ({ calls, toMarkdown: async (file, opts) => { calls.push({ name: file.name, type: file.blob.type, size: file.blob.size, opts }); return { id: "x", name: file.name, mimeType: file.blob.type, format: "markdown", tokens: 120, data }; } });
const aiUsed = async env => +(await env.KV.get("ai:" + DAY)) || 0;

/* ---------- action "item" ---------- */
test("item: by id, by its Information Center page, by its official link — the real details, spoken without links", async () => {
  const env = await envWith([RW, GH]);
  for (const body of [{ id: RW.id }, { id: "https://madeinegyptgate.com/intel/rfq/" + RW.slug + "-" + RW.id + "/" }, { page: "/intel/en/rfq/x-" + RW.id + "/" }, { url: DOC_URL }]) {
    const r = await tool(env, { action: "item", ...body }, NOW);
    assert.equal(r.found, true, JSON.stringify(body));
    assert.equal(r.id, RW.id);
    assert.equal(r.item.entity, "Rand Water"); assert.equal(r.item.country, "South Africa"); assert.equal(r.item.market_name, "جنوب أفريقيا");
    assert.equal(r.item.deadline, "2026-11-24"); assert.equal(r.item.value, 1250000); assert.equal(r.item.currency, "ZAR"); assert.equal(r.item.official_link, "pdf");
    assert.match(r.item.page, new RegExp("^https://madeinegyptgate\\.com/intel/rfq/.+-" + RW.id + "/$")); assert.equal(r.item.open_url, r.item.page);
    assert.deepEqual(r.results.map(x => x.id), [RW.id], "the screen view opens exactly this item");
  }
  const r = await tool(env, { action: "item", id: RW.id }, NOW);
  assert.match(r.text, /^طلب عرض أسعار «توريد وتسليم كيماويات/);
  assert.match(r.text, /من Rand Water في جنوب أفريقيا/);
  assert.match(r.text, /آخر ميعاد ٢٤ نوفمبر \(سارية\)/);
  assert.match(r.text, /القيمة التقديرية ١,٢٥٠,٠٠٠ راند/);
  assert.match(r.text, /المطلوب: طلب عرض أسعار من Rand Water/);
  assert.doesNotMatch(r.text, /https?:|www\.|etenders/i, "never a link in the spoken text");
  assert.match(r.note, /action=doc/);
  /* missing facts are said as missing, never made up */
  const g = await tool(env, { action: "details", id: GH.id }, NOW);
  assert.match(g.text, /القيمة مش منشورة/); assert.match(g.text, /في غانا/); assert.match(g.text, /مفيش وصف منشور أكتر من العنوان/);
  assert.equal(g.item.official_link, "page");
  /* no source (owner 2026-11-20 «ميكتبش مصدر اي معلومه»): the spoken text and the item name no portal, site or «المصدر»; the buyer stays */
  for (const x of [r, g]) {
    assert.doesNotMatch(x.text, /المصدر|مصدر|المصادر|GHANEPS|منظومة|بوابة|etenders|الرابط الرسمي/i, x.text);
    assert.equal(x.item.source, undefined, "no source's name in the item the persona gets");
    assert.doesNotMatch(x.note, /source:|المصدر/i);
  }
  assert.match(g.text, /^مناقصة حكومية «Supply of laboratory equipment for the university» من Kwame Nkrumah University/, "the buyer is the opportunity itself");
});
test("item: hidden → not found; a duplicate → the notice it duplicates; no id → the closest results to ask about, never a guess", async () => {
  const dup = { ...RW, id: "rw0000000d9", dup_of: RW.id, url: "https://www.etenders.gov.za/other.pdf", url_norm: "etenders.gov.za/other.pdf" };
  const env = await envWith([RW, dup, { ...GH, hidden: 1 }]);
  assert.equal((await tool(env, { action: "item", id: dup.id }, NOW)).id, RW.id);
  const h = await tool(env, { action: "item", id: GH.id }, NOW);
  assert.equal(h.found, false); assert.deepEqual(h.results, []); assert.match(h.text, /مش موجودة في مركز المعلومات/);
  const t = await tool(env, { action: "item", title: "water treatment chemicals" }, NOW);
  assert.equal(t.found, false); assert.deepEqual(t.candidates.map(x => x.id), [RW.id]); assert.match(t.text, /قولّي أنهي واحدة/);
  const none = await tool(env, { action: "item" }, NOW);
  assert.equal(none.found, false); assert.match(none.text, /محتاج الـ id/);
  /* a link that is not one of the items finds nothing (and is never fetched: "item" reads only the database) */
  assert.equal((await tool(env, { action: "item", url: "https://evil.example.net/x.pdf" }, NOW)).found, false);
});
test("search results carry open_url (= its page), country and value: the screen tool can open any of them", async () => {
  const env = await envWith([RW, GH]);
  const r = await tool(env, { action: "search", query: "chemicals", market: "africa", plan: "strategic" }, NOW);
  const x = r.results.find(y => y.id === RW.id);
  assert.ok(x, "found"); assert.equal(x.open_url, x.page); assert.equal(x.country, "South Africa"); assert.equal(x.value, 1250000); assert.equal(x.currency, "ZAR");
  assert.equal(itemRef({ query: x.page }).id, RW.id);
  assert.equal(itemRef({ id: RW.id.toUpperCase() }).id, RW.id, "an id in another letter case");
  assert.deepEqual(itemRef({ url: "https://madeinegyptgate.com/intel/" }), null, "the platform's own pages are never taken as an official link");
  assert.equal(moneyAr(0, "ZAR"), ""); assert.equal(moneyAr(1500.4, "EGP"), "١,٥٠٠ جنيه");
});

/* ---------- action "doc" ---------- */
test("doc: the item's own PDF via Workers AI toMarkdown — one unit of the daily cap, a bounded requirements excerpt, contacts removed, cached", async () => {
  const ai = aiStub(), env = await envWith([RW], { AI: ai });
  const n = net({ [DOC_URL]: pdfRes(makePdf()) });
  const r = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn });
  assert.equal(r.ok, true, JSON.stringify(r.flags));
  assert.equal(r.doc.type, "pdf"); assert.equal(r.doc.via, "ai"); assert.equal(r.doc.lang, "en"); assert.equal(r.doc.pages, 1);
  assert.equal(ai.calls.length, 1); assert.equal(ai.calls[0].type, "application/pdf"); assert.match(ai.calls[0].name, /\.pdf$/);
  assert.equal(ai.calls[0].opts.conversionOptions.pdf.images.convert, false, "no image model runs");
  assert.equal(await aiUsed(env), 1, "charged one unit");
  for (const k of ["scope", "eligibility", "documents", "bid_bond", "deadline", "submission"]) assert.ok(r.sections.found.includes(TOPIC_AR[k]), k);
  assert.deepEqual(r.sections.missing, [TOPIC_AR.briefing]); assert.match(r.text, /ومالقيتش فيه كلام عن: جلسة التعريف أو زيارة الموقع\./);
  assert.ok(r.key_lines.every(l => !/^\d+\.\s+[A-Z ]+$/.test(l)), "a numbered heading alone is not a key line");
  assert.ok(r.excerpt.length <= DOC_LIMITS.excerpt);
  assert.match(r.excerpt, /Central Supplier Database/); assert.match(r.excerpt, /closing date for quotations is 24 November 2026/); assert.match(r.excerpt, /No bid security is required/);
  assert.doesNotMatch(r.excerpt + r.key_lines.join(" "), /@|\+27|682 0000/, "e-mail addresses and phone numbers removed");
  assert.ok(r.key_lines.some(l => /24 November 2026/.test(l)));
  assert.match(r.text, /^قريت مستند PDF الرسمي بتاع «توريد وتسليم كيماويات/); assert.match(r.text, /صفحة واحدة/); assert.match(r.text, /بالإنجليزي/);
  assert.doesNotMatch(r.text, /https?:/);
  assert.equal(n.hits(/etenders/).length, 1, "the item's own link only");
  assert.equal(n.hits(/etenders/)[0].init.redirect, "manual", "redirects are checked one by one");
  /* the same item again: from the cache — no fetch, no new AI unit */
  const again = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn });
  assert.equal(again.ok, true); assert.equal(n.hits(/etenders/).length, 1); assert.equal(await aiUsed(env), 1);
});
test("doc: AI daily cap reached → the local PDF reader (no AI call); the enrichment keeps AI_DOC_RESERVE units for these reads", async () => {
  const ai = aiStub(), env = await envWith([RW], { AI: ai, AI_DAILY_LIMIT: "10", AI_DOC_RESERVE: "3" });
  await env.KV.put("ai:" + DAY, "7");
  const e = await enrichPending(env, { now: NOW, limit: 5 });
  assert.match(e.skipped, /kept for document reads/, "7 of 10 used, 3 kept: the enrichment stops");
  const n = net({ [DOC_URL]: pdfRes(makePdf()) });
  const r = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn, noCache: true });
  assert.equal(r.ok, true); assert.equal(r.doc.via, "ai"); assert.equal(await aiUsed(env), 8, "the reserve is used by the read");
  await env.KV.put("ai:" + DAY, "10");
  const local = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn, noCache: true });
  assert.equal(ai.calls.length, 1, "no AI call over the cap");
  assert.equal(local.ok, true, JSON.stringify(local.flags)); assert.equal(local.doc.via, "local");
  assert.match(local.excerpt, /registered on the Central Supplier Database/); assert.match(local.excerpt, /tender box/);
  assert.equal((await aiBudget(env, NOW)).left, 0);
});
test("doc: local readers — FlateDecode PDF text, DOCX word/document.xml, HTML; a scanned PDF and glyph-number text are not 'read'", async () => {
  const p = await pdfText(makePdf());
  assert.ok(readable(p.text)); assert.match(p.text, /SCOPE OF WORK/); assert.equal(p.pages, 1);
  assert.match((await pdfText(makePdf({ compress: false }))).text, /tax compliance status PIN/);
  const sc = await pdfText(makePdf({ image: true }));
  assert.equal(sc.images, 1); assert.equal(readable(sc.text), false);
  assert.equal((await pdfText(makePdf({ encrypt: true }))).encrypted, true);
  assert.equal(readable("\u0003\u0011\u0007 \ufffd\ufffd ÃÕÄ Ê×Ó ÄÃ ÕÄÊ Ó×Ã ÄÕ Ê×ÓÄ ÃÕÄÊ ×Ó"), false, "CID glyph numbers shown as Latin-1 are not text");
  const d = await docxText(DOCX());
  assert.match(d, /RETURNABLE DOCUMENTS/); assert.match(d, /SBD 1, SBD 4 and SBD 6\.1/);
  const h = htmlText(NOTICE_HTML());
  assert.match(h, /^## Supply of laboratory equipment/); assert.match(h, /bank guarantee/); assert.doesNotMatch(h, /Login|© portal/, "menu and footer dropped");
});
test("doc: the local reader keeps a real text PDF whose bullets / symbol font come out as U+FFFD; «scanned» only for images with no text", async () => {
  /* a real eTenders RFQ read locally had 14 % U+FFFD (bullets, one symbol-font run) beside 48,888 letters of English: it was flagged «scanned» */
  const glyphs = "\x81\x8d\x8f\x90\x9d";
  const lines = TENDER_TEXT.map(l => glyphs.slice(0, 3) + " " + l).concat(Array.from({ length: 6 }, () => glyphs.repeat(12)));
  const p = await pdfText(makePdf({ lines, logo: true }));
  const bad = (p.text.match(/�/g) || []).length;
  assert.ok(bad / p.text.length > 0.15, "the fixture really carries U+FFFD: " + bad + " of " + p.text.length);
  assert.equal(p.images, 1); assert.equal(readable(p.text), true);
  const env = await envWith([RW]);
  const r = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: net({ [DOC_URL]: pdfRes(makePdf({ lines, logo: true })) }).fn });
  assert.equal(r.ok, true, JSON.stringify(r.flags)); assert.equal(r.doc.via, "local");
  assert.match(r.excerpt, /registered on the Central Supplier Database/); assert.doesNotMatch(r.excerpt + r.key_lines.join(" "), /�/, "no replacement characters reach the persona");
  /* a logo beside text the local reader cannot decode (a CID font) is not «a scanned image» */
  const e2 = await envWith([RW]);
  const g = await tool(e2, { action: "doc", id: RW.id }, NOW, { fetch: net({ [DOC_URL]: pdfRes(makePdf({ lines: Array.from({ length: 8 }, () => glyphs.repeat(10)), logo: true })) }).fn });
  assert.deepEqual([g.ok, g.flags], [false, ["unreadable"]]); assert.match(g.text, /مقدرتش أطلع نص مفهوم/);
  /* mostly replacement characters: still not read */
  assert.equal(readable(glyphs.repeat(40) + " the tender shall be submitted by the closing date and the bid security"), false);
});
test("doc: DOCX via the local reader when there is no AI binding; HTML notice read locally (never AI)", async () => {
  const docxUrl = "https://www.etenders.gov.za/home/Download?blobName=a.docx&downloadedFileName=RFQ.docx";
  const env = await envWith([{ ...RW, url: docxUrl, url_norm: "x" }, GH]);
  const n = net({ [docxUrl]: () => new Response(DOCX(), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }), [GH.url]: () => new Response(NOTICE_HTML(), { headers: { "content-type": "text/html; charset=utf-8" } }) });
  const w = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn });
  assert.equal(w.ok, true); assert.equal(w.doc.type, "docx"); assert.equal(w.doc.via, "local"); assert.match(w.text, /^قريت ملف Word الرسمي/);
  const ai = aiStub(); env.AI = ai;
  const g = await tool(env, { action: "doc", id: GH.id }, NOW, { fetch: n.fn });
  assert.equal(g.ok, true); assert.equal(g.doc.type, "html"); assert.equal(ai.calls.length, 0, "HTML is read without AI");
  assert.match(g.excerpt, /bid security of GHS 20,000/); assert.match(g.excerpt, /not later than 2 December 2026/);
  assert.ok(g.sections.found.includes("شروط التأهيل")); assert.match(g.text, /^قريت صفحة الإعلان الرسمي/);
});
test("doc: a thin notice page → its ONE document on the same official site; a document on another site is never followed", async () => {
  const thin = `<html><body><main><h1>Supply of laboratory equipment</h1><p>Tender notice. Download the documents below.</p>
    <p><a href="https://cdn.other-site.example.com/x.pdf">Tender document (mirror)</a> <a href="/epps/cft/downloadNoticeForES.do?resourceId=999&amp;file=notice.pdf">Tender notice PDF</a></p></main></body></html>`;
  const pdfUrl = "https://www.ghaneps.gov.gh/epps/cft/downloadNoticeForES.do?resourceId=999&file=notice.pdf";
  const env = await envWith([GH]);
  const n = net({ [GH.url]: () => new Response(thin, { headers: { "content-type": "text/html" } }), [pdfUrl]: pdfRes(makePdf()) });
  const r = await tool(env, { action: "doc", id: GH.id }, NOW, { fetch: n.fn });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.doc.from, "linked"); assert.equal(r.doc.type, "pdf"); assert.equal(r.doc.url, pdfUrl);
  assert.equal(n.hits(/other-site/).length, 0, "another site's link is never fetched");
  assert.match(r.text, /من صفحة الإعلان الرسمية/);
  assert.deepEqual(docLinks(thin, GH.url).map(l => l.url), [pdfUrl]);
  assert.deepEqual(docLinks('<a href="/epps/cft/downloadNoticeForES.do?resourceId=7">Notice</a> <a href="/epps/home.do">Home</a>', GH.url).map(l => l.url), ["https://www.ghaneps.gov.gh/epps/cft/downloadNoticeForES.do?resourceId=7"]);
  /* the portal's login box beside a real notice is not a sign-in page */
  const withBox = NOTICE_HTML('<aside><form><input name="u"><input type="password" name="p"><button>Login</button></form></aside>');
  const e2 = await envWith([GH]), r2 = await tool(e2, { action: "doc", id: GH.id }, NOW, { fetch: net({ [GH.url]: () => new Response(withBox, { headers: { "content-type": "text/html" } }) }).fn });
  assert.equal(r2.ok, true, JSON.stringify(r2.flags));
  /* an OCDS release (the fallback link of a South African row without a document): its notice document */
  const rel = JSON.stringify({ releases: [{ ocid: "ocds-1", tender: { documents: [{ url: "https://www.etenders.gov.za/home/Download?blobName=b.pdf&downloadedFileName=Advert.pdf", format: "pdf", documentType: "tenderNotice" }, { url: "https://evil.example.org/a.pdf", format: "pdf" }] } }] });
  assert.deepEqual(jsonDocs(rel, "https://ocds-api.etenders.gov.za/api/OCDSReleases/release/ocds-1").map(d => d.url), ["https://www.etenders.gov.za/home/Download?blobName=b.pdf&downloadedFileName=Advert.pdf"]);
  assert.equal(siteOf("ocds-api.etenders.gov.za"), siteOf("www.etenders.gov.za"));
});
test("doc: SSRF — only https public hosts, port 443, no user info, every redirect checked; the model's own URL is never fetched", async () => {
  for (const [u, want] of [["https://127.0.0.1/a.pdf", "unsafe_url"], ["https://0x7f.1/a.pdf", "unsafe_url"], ["https://2130706433/a.pdf", "unsafe_url"], ["https://[::1]/a.pdf", "unsafe_url"],
    ["https://localhost/a.pdf", "unsafe_url"], ["https://files.intranet.corp/a.pdf", "unsafe_url"], ["https://metadata.google.internal/a", "unsafe_url"], ["https://example.org:8443/a.pdf", "unsafe_url"],
    ["https://user:pw@example.org/a.pdf", "unsafe_url"], ["https://madeinegyptgate.com/api/intel/health", "unsafe_url"], ["ftp://example.org/a.pdf", "not_https"], ["file:///etc/passwd", "not_https"]])
    assert.equal(checkUrl(u, { upgrade: true }).error, want, u);
  assert.equal(checkUrl("http://www.etenders.gov.za/a.pdf", { upgrade: true }).url.toString(), "https://www.etenders.gov.za/a.pdf");
  assert.equal(checkUrl("http://www.etenders.gov.za/a.pdf").error, "not_https", "a redirect to http is not followed");
  const bad = { ...RW, id: "rw00000bad1", url: "https://10.0.0.1/admin.pdf", url_norm: "10.0.0.1/admin.pdf" };
  const env = await envWith([bad, { ...RW, url: "http://www.etenders.gov.za/up.pdf", url_norm: "up" }]);
  const n = net({ "https://www.etenders.gov.za/up.pdf": pdfRes(makePdf()) });
  const r1 = await tool(env, { action: "doc", id: bad.id, url: "https://evil.example.net/x.pdf" }, NOW, { fetch: n.fn });
  assert.deepEqual([r1.ok, r1.flags], [false, ["unsafe_url"]]); assert.equal(n.log.length, 0, "nothing fetched at all");
  assert.match(r1.text, /مش لموقع عام آمن/);
  const r2 = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: n.fn });
  assert.equal(r2.ok, true, "an http link is read as https"); assert.ok(n.log.every(x => x.url.startsWith("https://")));
  const r3 = await tool(env, { action: "doc", url: "https://evil.example.net/x.pdf" }, NOW, { fetch: n.fn });
  assert.equal(r3.found, false); assert.equal(n.hits(/evil/).length, 0, "an address the model gives only looks an item up");
  /* redirects: to a private address, to http, to our own zone, too many, to a sign-in page */
  const redir = to => () => new Response(null, { status: 302, headers: { location: to } });
  for (const [to, flag] of [["https://169.254.169.254/latest/meta-data/", "unsafe_url"], ["http://www.etenders.gov.za/a.pdf", "not_https"], ["https://madeinegyptgate.com/x", "unsafe_url"], ["/Account/Login?ReturnUrl=%2Fdoc", "login"]]) {
    const e2 = await envWith([RW]), n2 = net({ [DOC_URL]: redir(to) });
    const r = await tool(e2, { action: "doc", id: RW.id }, NOW, { fetch: n2.fn });
    assert.deepEqual([r.ok, r.flags], [false, [flag]], to);
    assert.equal(n2.log.filter(x => !/robots/.test(x.url)).length, 1, "the redirect target is never requested: " + to);
  }
  const loop = { [DOC_URL]: redir("https://www.etenders.gov.za/r1"), "https://www.etenders.gov.za/r1": redir("/r2"), "https://www.etenders.gov.za/r2": redir("/r3"), "https://www.etenders.gov.za/r3": redir("/r4") };
  const e3 = await envWith([RW]), n3 = net(loop);
  assert.deepEqual((await tool(e3, { action: "doc", id: RW.id }, NOW, { fetch: n3.fn })).flags, ["too_many_redirects"]);
});
test("doc: honest flags — sign-in, forbidden, gone, robots.txt, too large, unsupported, scanned, timeout; the item's facts still given", async () => {
  const cases = [
    [() => new Response("no", { status: 401 }), "login", /ورا تسجيل دخول/],
    [() => new Response("<html><body><form><input name=u><input type=password name=p></form></body></html>", { headers: { "content-type": "text/html" } }), "login", /ورا تسجيل دخول/],
    [() => new Response("no", { status: 403 }), "forbidden", /رفض/],
    [() => new Response("no", { status: 404 }), "gone", /مبقاش موجود/],
    [() => new Response("x", { headers: { "content-type": "application/pdf", "content-length": String(DOC_LIMITS.maxBytes.pdf + 1) } }), "too_large", /كبير قوي/],
    [() => new Response(new Uint8Array(DOC_LIMITS.maxBytes.pdf + 10), { headers: { "content-type": "application/pdf" } }), "too_large", /كبير قوي/],
    [() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }), "unsupported", /مش مستند PDF/],
    [pdfRes(makePdf({ image: true })), "scanned", /سكان/],
  ];
  for (const [res, flag, re] of cases) {
    const env = await envWith([RW], { AI: aiStub("") });
    const r = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: net({ [DOC_URL]: res }).fn });
    assert.deepEqual([r.ok, r.flags[0]], [false, flag], flag);
    assert.match(r.text, re); assert.match(r.text, /الجهة Rand Water، آخر ميعاد ٢٤ نوفمبر/); assert.match(r.note, /NOT read/);
    assert.equal(r.excerpt, undefined, "no excerpt from a document that was not read");
  }
  const env = await envWith([RW]);
  const rb = await tool(env, { action: "doc", id: RW.id }, NOW, { fetch: net({ [DOC_URL]: pdfRes(makePdf()) }, { robots: { "www.etenders.gov.za": "User-agent: *\nDisallow: /home/Download" } }).fn });
  assert.deepEqual(rb.flags, ["robots"]);
  /* a site that never answers: stopped at the request's deadline */
  const keep = setTimeout(() => {}, 5000);
  try {
    const hang = (url, init) => (/robots/.test(url) ? Promise.resolve(new Response("", { status: 404 })) : new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })))));
    const t0 = Date.now(), e2 = await envWith([RW]);
    const r = await tool(e2, { action: "doc", id: RW.id }, NOW, { fetch: hang, fetchMs: 600 });
    assert.deepEqual(r.flags, ["timeout"]); assert.ok(Date.now() - t0 < 3000); assert.match(r.text, /اتأخر في الرد/);
  } finally { clearTimeout(keep); }
});
test("excerpt: the requirement parts in the document's order, every topic once, ≤ 6000 characters, Arabic and French notices too", () => {
  const filler = Array.from({ length: 120 }, (_, i) => "Clause " + (i + 1) + ". General conditions of contract apply to this part of the agreement and to the parties concerned in every respect.").join("\n\n");
  const long = TENDER_TEXT.slice(0, 2).join("\n\n") + "\n\n" + filler + "\n\n" + TENDER_TEXT.slice(2).join("\n\n");
  const ex = requirementsExcerpt(long);
  assert.ok(ex.excerpt.length <= 6000); assert.ok(ex.excerpt.length > 600);
  assert.ok(ex.excerpt.indexOf("RAND WATER") < ex.excerpt.indexOf("Central Supplier") && ex.excerpt.indexOf("Central Supplier") < ex.excerpt.indexOf("closing date"), "document order");
  assert.deepEqual(ex.missing, ["briefing"]);
  const ar = requirementsExcerpt("كراسة الشروط والمواصفات\n\nشروط التأهيل: السجل التجاري والبطاقة الضريبية سارية.\n\nالتأمين الابتدائي 2% من قيمة العطاء بخطاب ضمان.\n\nآخر موعد لتقديم العطاءات 15 ديسمبر 2026 الساعة 12 ظهراً.\n\nتُقدم العطاءات في مظروفين مغلقين.");
  assert.deepEqual(ar.found, ["scope", "eligibility", "documents", "bid_bond", "deadline", "submission"]); assert.equal(ar.lang, "ar");
  const fr = requirementsExcerpt("Objet du marché : fourniture de fer à béton.\n\nPièces à fournir : registre de commerce.\n\nUne garantie de soumission de 2 000 000 FCFA est exigée.\n\nDate limite de dépôt des offres : le 10 décembre 2026 à 10 heures. Visite de site obligatoire.");
  for (const k of ["scope", "documents", "bid_bond", "deadline", "briefing"]) assert.ok(fr.found.includes(k), k); assert.equal(fr.lang, "fr");
  assert.equal(cleanDocText("Page 1 of 3\nreal line\nPage 2 of 3\nHeader\nHeader\nHeader\nHeader\ncall 0100 123 4567 or a@b.co"), "real line\ncall or", "page numbers, repeated headers and contacts dropped");
});
test("handleApi: POST /api/intel/tool {action:'doc'} → JSON; the document reads have their own rate limit", async () => {
  const env = await envWith([RW], { AI: aiStub(), DOC_RATE_PER_MIN: "2" });
  const saved = globalThis.fetch, n = net({ [DOC_URL]: pdfRes(makePdf()) });
  globalThis.fetch = n.fn;
  try {
    const call = body => handleApi(new Request("https://madeinegyptgate.com/api/intel/tool", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" }, body: JSON.stringify(body) }), env, {});
    const r = await call({ action: "doc", id: RW.id });
    assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.ok, true); assert.equal(j.action, "doc");
    assert.equal((await call({ action: "doc", id: RW.id })).status, 200);
    /* speed 2026-11-20: Bassem's webhook (POST) hears the refusal as 200 ok:false + a text it can act on; GET keeps the 429 */
    const third = await call({ action: "doc", id: RW.id });
    assert.equal(third.status, 200); const tj = await third.json();
    assert.deepEqual([tj.ok, tj.action, tj.flags], [false, "doc", ["busy"]]); assert.match(tj.text, /جرّب تاني بعد دقيقة/);
    const get = await handleApi(new Request("https://madeinegyptgate.com/api/intel/tool?action=doc&id=" + RW.id, { headers: { "CF-Connecting-IP": "203.0.113.9" } }), env, {});
    assert.equal(get.status, 429, "GET keeps the status code");
    assert.equal((await call({ action: "item", id: RW.id })).status, 200, "item is not limited by the document budget");
  } finally { globalThis.fetch = saved; }
});
test("the item page keeps the markup Bassem's screen reader uses (data/bassem-live-tools.js intelRead), in both languages", () => {
  const src = { id: "za", name: "South Africa — National Treasury eTenders OCDS API", name_ar: "جنوب أفريقيا — بوابة المناقصات الحكومية" };
  /* members-only (owner 2026-11-28, util.js lockedItem): an RFQ's page is its teaser for everyone — the reader's markup is the same, the
     details are not in it (Bassem reads them through his tool, /api/intel/tool); the full card markup below is a news page's */
  const lockedAr = itemHtml({ ...RW, updated_at: "2026-11-19T10:00:00.000Z" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.match(lockedAr, /<main id="main">/); assert.match(lockedAr, /<div class="sx-chips">[\s\S]*?<span class="sx-st sx-st-open"/);
  assert.match(lockedAr, /التفاصيل للأعضاء — سجّل الآن/); assert.match(lockedAr, /href="\/register\/#basic"/);
  for (const x of ["Rand Water", "etenders.gov.za", "بوابة المناقصات الحكومية", "<dt>الجهة</dt>", "<dt>القيمة التقديرية</dt>"]) assert.ok(!lockedAr.includes(x), x);
  const lockedEn = itemHtml({ ...RW, updated_at: "2026-11-19T10:00:00.000Z" }, src, "en", "madeinegyptgate.com", NOW);
  assert.match(lockedEn, /Details are for members — register/); assert.match(lockedEn, /href="\/register\/\?lang=en#basic"/); assert.ok(!lockedEn.includes("Rand Water"));
  const ar = itemHtml({ ...RW, kind: "news", updated_at: "2026-11-19T10:00:00.000Z" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.match(ar, /<main id="main">/);
  assert.match(ar, /<div class="wrap sx-main">[\s\S]*?<section class="card2"><p>طلب عرض أسعار من Rand Water/, "the summary: the card's first plain paragraph");
  for (const dt of ["الجهة", "السوق", "آخر موعد", "القيمة التقديرية"]) assert.match(ar, new RegExp('<dl class="sx-facts">[\\s\\S]*?<dt>' + dt + "</dt>"), dt);
  assert.match(ar, /<p class="note">مصدر رسمي: /); assert.match(ar, /<a class="btn btn-gold" href="https:\/\/www\.etenders\.gov\.za\//);
  const en = itemHtml({ ...RW, kind: "news", title_en: "Supply of water treatment chemicals", summary_en: "Rand Water requests quotations.", updated_at: "2026-11-19T10:00:00.000Z" }, src, "en", "madeinegyptgate.com", NOW);
  for (const dt of ["Entity", "Market", "Deadline", "Estimated value"]) assert.match(en, new RegExp("<dt>" + dt + "</dt>"), dt);
  assert.match(en, /<p class="note">Official source: /);
  /* no excerpt label before a summary written by the platform; the source's own excerpt is marked as such */
  const orig = itemHtml({ ...RW, kind: "news", summary_ar: null, summary_orig: "Supply and delivery of aluminium sulphate for 24 months.", updated_at: "2026-11-19T10:00:00.000Z" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.match(orig, /<p class="note">مقتطف من المصدر:<\/p><p>Supply and delivery/);
});
test("itemText never invents: no deadline → said; an unknown currency code is kept as written", () => {
  const t = itemText({ ...GH, deadline: null, value: 5000, currency: "XYZ" }, { name: "Ghana – GHANEPS", name_ar: "غانا – منظومة GHANEPS" }, NOW);
  assert.match(t, /ميعاد التقديم مش منشور/); assert.match(t, /القيمة التقديرية ٥,٠٠٠ XYZ/);
  assert.doesNotMatch(t, /المصدر|GHANEPS|منظومة/, "the source is never said (owner 2026-11-20)");
});
test("fetchDoc fileCap («ابعتلي» attachments): a lower cap for PDF / DOCX only; an untyped answer is read up to max(fileCap, the HTML cap); none → as before", async () => {
  const env = { KV: makeKV() }, at = (url, res, fileCap) => fetchDoc(new URL(url), env, { fetchFn: net({ [url]: res }).fn, deadline: Date.now() + 5000, ...(fileCap ? { fileCap } : {}) });
  const U = "https://www.etenders.gov.za/a.pdf", two = new Uint8Array(2_000_000); two.set(Buffer.from("%PDF-1.4\n"));
  const r1 = await at(U, () => new Response(two, { headers: { "content-type": "application/pdf", "content-length": String(two.length) } }), 1_000_000);
  assert.deepEqual([r1.flag, r1.size], ["too_large", 2_000_000], "Content-Length over the file cap");
  const r2 = await at(U, () => new Response(two, { headers: { "content-type": "application/pdf" } }), 1_000_000);
  assert.deepEqual([r2.flag, r2.size > 1_000_000], ["too_large", true], "streamed over the file cap");
  const ok = await at(U, () => new Response(two, { headers: { "content-type": "application/pdf" } }));
  assert.deepEqual([ok.ok, ok.kind, ok.bytes.length], [true, "pdf", 2_000_000], "no fileCap: the 10 MB PDF cap, as before");
  /* octet-stream with no file name: read up to max(fileCap, 3 MB) — a 2 MB HTML page passes (its own cap), a 2 MB PDF does not */
  const V = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c", page = "<!doctype html><html><body>" + "x".repeat(2_000_000) + "</body></html>";
  const h = await at(V, () => new Response(page, { headers: { "content-type": "application/octet-stream" } }), 1_000_000);
  assert.deepEqual([h.ok, h.kind], [true, "html"]);
  const p = await at(V, () => new Response(two, { headers: { "content-type": "application/octet-stream" } }), 1_000_000);
  assert.deepEqual([p.flag, p.size], ["too_large", 2_000_000], "sniffed PDF over the file cap");
  const big = new Uint8Array(DOC_LIMITS.maxBytes.html + 10);
  const q = await at(V, () => new Response(big, { headers: { "content-type": "application/octet-stream" } }), 1_000_000);
  assert.equal(q.flag, "too_large", "an untyped answer is never read past max(fileCap, the HTML cap)");
  /* the attachment's name: the source's own when plain ASCII, the sniffed extension; otherwise document-<id> */
  assert.equal(safeFileName("RW 01234 RFQ advert.pdf", "pdf", "rw0000000a1"), "RW 01234 RFQ advert.pdf");
  assert.equal(safeFileName("tender.PDF", "docx", "x"), "tender.docx", "the extension is what the bytes are");
  for (const bad of ["كراسة الشروط.pdf", "../../etc/passwd", ".hidden.pdf", "a".repeat(81) + ".pdf", "", "a\u0000b.pdf", "x<script>.pdf"])
    assert.equal(safeFileName(bad, "pdf", "rw0000000a1"), "document-rw0000000a1.pdf", JSON.stringify(bad));
});
