/* «ابعتلي» mail packs (POST /api/intel/mailpack, src/api.js mailPack + src/doc.js itemFile): janna-lookup asks through its service binding
   INTEL for ONE item's card, links and official file. The endpoint answers only on the binding-only hostname (PACK_HOST); every public
   hostname gets the plain 404 of an unknown path. Every network read here is a mock: no real host is ever called. */
import test from "node:test"; import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { handleApi, mailPack, PACK_HOST } from "../src/api.js";
import { handlePages } from "../src/pages.js";
import { _resetShellMemory } from "../src/siteshell.js";
import { DOC_LIMITS } from "../src/doc.js";
import { hash53 } from "../src/util.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DOC_URL = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW%2001234%20RFQ%20advert.pdf";
/* an RFQ shaped like the South African eTenders rows (test data, not a real notice — the same row as doc.test.mjs) */
const RW = { id: "rw0000000a1", source_id: "za", ext_id: "ocds-test-1", kind: "rfq", market: "africa:za", country: "South Africa", sector: 28, title_orig: "Supply and delivery of water treatment chemicals (aluminium sulphate) for 24 months",
  title_ar: "توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم) لمدة 24 شهراً", summary_ar: "طلب عرض أسعار من Rand Water لتوريد كيماويات معالجة المياه، للاستفسار buyer@randwater.example أو +27 11 682 0000.",
  summary_en: "Rand Water requests quotations; enquiries buyer@randwater.example, tel. +27 11 682 0000.", summary_orig: "Ref RW 01234 RFQ · Request for Quotation · goods", entity: "Rand Water", published_at: "2026-11-10T00:00:00.000Z",
  deadline: "2026-11-24T00:00:00.000Z", value: 1250000, currency: "ZAR", url: DOC_URL, url_norm: "etenders.gov.za/rw", status: "open", relevance: 70, first_seen_at: "2026-11-10T08:00:00.000Z", slug: "supply-and-delivery-of-water-treatment-chemicals" };
const GH_URL = "https://www.ghaneps.gov.gh/epps/cft/prepareViewCfTWS.do?resourceId=999";
const GH = { id: "gh0000000b2", source_id: "gh", kind: "tender_gov", market: "africa:gh", country: "Ghana", title_orig: "Supply of laboratory equipment for the university", entity: "Kwame Nkrumah University of Science and Technology",
  deadline: "2026-12-02T00:00:00.000Z", url: GH_URL, url_norm: "ghaneps.gov.gh/999", status: "open", relevance: 60, first_seen_at: "2026-11-17T08:00:00.000Z", published_at: "2026-11-17T00:00:00.000Z" };
const NEWS = { id: "nw0000000c3", source_id: "gh", kind: "news", market: "eg", title_orig: "Egypt steel output rises", url: "https://www.ghaneps.gov.gh/news/1", url_norm: "ghaneps.gov.gh/news/1", status: "info", relevance: 10, first_seen_at: "2026-11-17T08:00:00.000Z" };
const OPT = { id: "op0000000d4", source_id: "bh", kind: "tender_gov", market: "gcc:bh", title_orig: "Supply of cables", url: "https://www.tenderboard.example.bh/t/1.pdf", url_norm: "tenderboard.example.bh/t/1.pdf", status: "open", relevance: 50, first_seen_at: "2026-11-17T08:00:00.000Z" };
const SOURCES = [["za", "South Africa — National Treasury eTenders OCDS API", "جنوب أفريقيا — بوابة المناقصات الحكومية", "africa:za", "{}"], ["gh", "Ghana – GHANEPS", "غانا – منظومة GHANEPS", "africa:gh", "{}"],
  ["bh", "Bahrain Tender Board", "مجلس المناقصات البحريني", "gcc:bh", JSON.stringify({ attach: false })]];
async function envWith(items, extra = {}) {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql"));
  for (const [id, name, ar, market, mapping] of SOURCES)
    await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES (?,?,?,'tender_gov',?,'json','https://example.org',?)").bind(id, name, ar, market, mapping).run();
  const cols = ["id", "source_id", "ext_id", "kind", "tag", "market", "country", "sector", "title_orig", "title_ar", "title_en", "summary_ar", "summary_en", "summary_orig", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "relevance", "status", "hidden", "dup_of", "slug", "first_seen_at"];
  for (const x of items) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => (x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c]))).run();
  return { DB, KV: makeKV(), ...extra };
}
/* a small real PDF (FlateDecode text) */
function makePdf(pad = 0) {
  const data = deflateSync(Buffer.from("BT /F1 10 Tf 50 800 Td (RAND WATER REQUEST FOR QUOTATION RW 01234) Tj ET", "latin1"));
  return new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n<< /Length " + data.length + " /Filter /FlateDecode >>\nstream\n", "latin1"), data,
    Buffer.from("\nendstream\nendobj\n" + " ".repeat(pad) + "trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1")]));
}
/* a mock network: url → response factory; robots.txt 404 unless given; every request logged */
function net(map, { robots = {} } = {}) {
  const log = [];
  const fn = async (url, init = {}) => {
    url = String(url); log.push({ url, init });
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return robots[u.host] != null ? new Response(robots[u.host], { status: 200 }) : new Response("nf", { status: 404 });
    const h = map[url];
    if (!h) return new Response("not found", { status: 404 });
    return typeof h === "function" ? h(url, init) : h;
  };
  return { fn, log, hits: re => log.filter(x => re.test(x.url) && !/robots\.txt/.test(x.url)), pages: () => log.filter(x => !/robots\.txt/.test(x.url)).map(x => x.url) };
}
const pdfRes = (bytes, extra = {}) => () => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(bytes.length), ...extra } });
const html = (body, extra = {}) => () => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
const B = "https://" + PACK_HOST + "/api/intel/mailpack";
const post = (env, body, url = B, headers = {}) => handleApi(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), env, {});

test("binding-only hostname: every public hostname gets the plain 404 of an unknown path (no KV write); the binding hostname is the endpoint", async () => {
  const env = await envWith([RW]);
  assert.equal(PACK_HOST, "mailpack.binding.invalid");
  const unknown = await handleApi(new Request("https://madeinegyptgate.com/api/intel/no-such-path", { method: "POST", body: "{}" }), env, {});
  const plain = [unknown.status, await unknown.json()];
  for (const origin of ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com", "https://migate-intel.daily-spoonbill.workers.dev", "https://MADEINEGYPTGATE.com"]) {
    for (const headers of [{}, { "X-Forwarded-Host": PACK_HOST, "CF-Connecting-IP": "203.0.113.7" }, { Host: PACK_HOST }]) {
      const r = await post(env, { id: RW.id, file: false }, origin + "/api/intel/mailpack", headers);
      assert.deepEqual([r.status, await r.json()], plain, origin + " " + JSON.stringify(headers));
      assert.equal(r.headers.get("Cache-Control"), "no-store");
    }
    const g = await handleApi(new Request(origin + "/api/intel/mailpack/"), env, {});
    assert.deepEqual([g.status, await g.json()], plain, "GET " + origin);
  }
  assert.equal(env.KV._m.size, 0, "public requests never reach the rate limiter: no KV key written");
  const ok = await post(env, { id: RW.id, file: false });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get("Cache-Control"), "no-store");
  const j = await ok.json();
  assert.deepEqual([j.ok, j.id, j.requested, j.file, j.reason], [true, RW.id, RW.id, null, "not_requested"]);
});

test("binding hostname: method, body and id checks; unknown → 404, removed → 410, hidden → 410, unlisted news served, a duplicate → its primary", async () => {
  const dup = { ...RW, id: "rw0000000d9", dup_of: RW.id, url: "https://www.etenders.gov.za/other.pdf", url_norm: "etenders.gov.za/other.pdf" };
  const env = await envWith([RW, dup, { ...GH, hidden: 1 }, { ...NEWS, hidden: 2 }]);
  await env.DB.prepare("INSERT INTO intel_gone (id, gone_at) VALUES ('zz000000001', '2026-01-01T00:00:00Z')").run();
  const g = await handleApi(new Request(B), env, {});
  assert.deepEqual([g.status, await g.json()], [405, { error: "method" }]);
  for (const bad of ["not json", "[1]", "null"]) { const r = await post(env, bad); assert.deepEqual([r.status, await r.json()], [400, { error: "bad json" }], bad); }
  for (const id of ["x", "../etc/passwd", "RW0000000A1X", "https://evil.example/a.pdf", ""]) { const r = await post(env, { id }); assert.deepEqual([r.status, await r.json()], [400, { error: "bad id" }], id); }
  assert.deepEqual(await (await post(env, { id: "aaaaaaaaaaa" })).json(), { ok: false, found: false });
  assert.equal((await post(env, { id: "aaaaaaaaaaa" })).status, 404);
  const gone = await post(env, { id: "zz000000001" });
  assert.deepEqual([gone.status, await gone.json()], [410, { ok: false, found: false, gone: true }]);
  const hid = await post(env, { id: GH.id, file: false });
  assert.deepEqual([hid.status, await hid.json()], [410, { ok: false, found: false, gone: true }]);
  const nw = await post(env, { id: NEWS.id });
  assert.equal(nw.status, 200, "an unlisted news item (hidden=2) still answers, as its page does");
  const d = await (await post(env, { id: dup.id.toUpperCase(), file: false })).json();
  assert.deepEqual([d.id, d.requested], [RW.id, dup.id], "a duplicate answers with its primary");
  assert.equal(d.links.source, DOC_URL);
});

test("rate limit after the hostname check: PACK_RATE_PER_MIN (default 60) per minute, prefix rlp:", async () => {
  const env = await envWith([RW], { PACK_RATE_PER_MIN: "2" });
  assert.equal((await post(env, { id: RW.id, file: false })).status, 200);
  assert.equal((await post(env, { id: RW.id, file: false })).status, 200);
  const third = await post(env, { id: RW.id, file: false });
  assert.deepEqual([third.status, await third.json()], [429, { error: "rate limited" }]);
  assert.ok([...env.KV._m.keys()].every(k => /^rlp:0:\d+$/.test(k)), "one bucket for the binding (no CF-Connecting-IP): " + [...env.KV._m.keys()]);
});

test("the RW row: its official PDF attached (bytes exact, name from Content-Disposition), short /intel/ links that open, both languages of the card, contacts stripped", async () => {
  const env = await envWith([RW]), pdf = makePdf();
  const n = net({ [DOC_URL]: pdfRes(pdf, { "content-disposition": 'attachment; filename="RW 01234 RFQ advert.pdf"' }) });
  const saved = globalThis.fetch; globalThis.fetch = n.fn; _resetShellMemory();
  try {
    const r = await post(env, { id: RW.id, file: true, max_bytes: 8000000, budget_ms: 8000 });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(Object.keys(j).sort(), ["card", "file", "id", "links", "ok", "reason", "requested"]);
    assert.equal(j.reason, null);
    assert.deepEqual([j.file.type, j.file.name, j.file.from, j.file.size], ["application/pdf", "RW 01234 RFQ advert.pdf", "official", pdf.length]);
    assert.deepEqual(new Uint8Array(Buffer.from(j.file.b64, "base64")), pdf, "the bytes exactly as served");
    assert.deepEqual(j.links, { page: "https://madeinegyptgate.com/intel/rfq/rw0000000a1/", page_en: "https://madeinegyptgate.com/intel/en/rfq/rw0000000a1/", source: DOC_URL, doc: DOC_URL });
    const c = j.card;
    assert.deepEqual([c.kind, c.kind_label, c.kind_label_en, c.market, c.entity, c.deadline, c.value, c.currency, c.currency_ar, c.status], ["rfq", "طلب عرض أسعار", "Request for quotation", "africa:za", "Rand Water", "2026-11-24", 1250000, "ZAR", "راند", "open"]);
    assert.deepEqual([c.title, c.title_orig, c.title_is_original, c.market_name, c.market_name_en, c.country], [RW.title_ar, RW.title_orig, false, "جنوب أفريقيا", "South Africa", "South Africa"]);
    assert.deepEqual([c.source_name, c.source_name_en], ["جنوب أفريقيا — بوابة المناقصات الحكومية", "South Africa — National Treasury eTenders OCDS API"]);
    assert.doesNotMatch(c.summary + " " + c.summary_en, /@|\+27|682 0000/, "contacts stripped from both summaries");
    assert.match(c.summary, /^طلب عرض أسعار من Rand Water/);
    assert.equal(n.hits(/etenders/).length, 1, "one GET of the item's own link"); assert.equal(n.hits(/etenders/)[0].init.redirect, "manual");
    /* the short link opens: a 301 to the canonical page, which answers 200 */
    for (const page of [j.links.page, j.links.page_en]) {
      const p1 = await handlePages(new Request(page), env, { waitUntil() {} });
      assert.equal(p1.status, 301, page);
      const canon = p1.headers.get("location");
      assert.match(canon, /^https:\/\/madeinegyptgate\.com\/intel\/(?:en\/)?rfq\/supply-and-delivery-of-water-treatment-chemicals-rw0000000a1\/$/);
      const p2 = await handlePages(new Request(canon), env, { waitUntil() {} });
      assert.equal(p2.status, 200, canon); assert.match(await p2.text(), /Rand Water/);
    }
  } finally { globalThis.fetch = saved; }
});

test("candidates, in order: the doc cache's known file, the ingest hints (same site only; a too-large one → the next), the stored link, one linked document", async () => {
  /* known: what Bassem's document read already found (a scanned PDF counts too) */
  const KNOWN = "https://www.etenders.gov.za/home/Download?blobName=known.pdf";
  let env = await envWith([RW]), pdf = makePdf();
  await env.KV.put("doc:v1:" + RW.id + ":" + hash53(DOC_URL).toString(36), JSON.stringify({ ok: false, flags: ["scanned"], doc: { url: KNOWN, type: "pdf" } }));
  let n = net({ [KNOWN]: pdfRes(pdf), [DOC_URL]: pdfRes(pdf) });
  let b = (await mailPack(env, { id: RW.id }, { fetch: n.fn })).body;
  assert.deepEqual([b.file.from, b.links.doc], ["known", KNOWN]); assert.deepEqual(n.pages(), [KNOWN], "the stored link is not fetched again");
  /* hints (Kenya documents[] at ingest): same official site; a too-large first one → the second */
  const H1 = "https://www.ghaneps.gov.gh/files/tender-document.pdf", H2 = "https://ghaneps.gov.gh/files/tender-notice.pdf", OFF = "https://cdn.other.example/x.pdf";
  env = await envWith([GH]);
  await env.KV.put("dochint:" + GH.id, JSON.stringify({ h: [{ u: OFF, t: "Tender Document" }, { u: H1, t: "Tender Document" }] }));
  n = net({ [H1]: pdfRes(pdf), [GH_URL]: html("<html><body>notice</body></html>") });
  b = (await mailPack(env, { id: GH.id }, { fetch: n.fn })).body;
  assert.deepEqual([b.file.from, b.links.doc], ["hint", H1]); assert.equal(n.hits(/other\.example/).length, 0, "a hint on another site is never fetched");
  env = await envWith([GH]);
  await env.KV.put("dochint:" + GH.id, JSON.stringify({ h: [{ u: H1, t: "Tender Document" }, { u: H2, t: "Tender Notice" }] }));
  n = net({ [H1]: () => new Response("x", { headers: { "content-type": "application/pdf", "content-length": "5000000" } }), [H2]: pdfRes(pdf) });
  b = (await mailPack(env, { id: GH.id, max_bytes: 4000000 }, { fetch: n.fn })).body;
  assert.deepEqual([b.file.from, b.links.doc, b.file.size], ["hint", H2, pdf.length]);
  /* a notice page: its ONE same-site document («linked»); the other site's link is never fetched */
  const PDF2 = "https://www.ghaneps.gov.gh/epps/cft/downloadNoticeForES.do?resourceId=999&file=notice.pdf";
  const thin = `<html><body><main><h1>Supply of laboratory equipment</h1><p>Tender notice.</p><p><a href="https://cdn.other-site.example.com/x.pdf">Tender document (mirror)</a> <a href="/epps/cft/downloadNoticeForES.do?resourceId=999&amp;file=notice.pdf">Tender notice PDF</a></p></main></body></html>`;
  env = await envWith([GH]); n = net({ [GH_URL]: html(thin), [PDF2]: pdfRes(pdf) });
  b = (await mailPack(env, { id: GH.id }, { fetch: n.fn })).body;
  assert.deepEqual([b.file.from, b.links.doc, b.file.type], ["linked", PDF2, "application/pdf"]); assert.equal(n.hits(/other-site/).length, 0);
  /* a page that is only a JavaScript shell: no file on it */
  env = await envWith([GH]); n = net({ [GH_URL]: html('<!doctype html><html><head><title>Portal</title><script src="/app.js"></script></head><body><div id="app"></div></body></html>') });
  b = (await mailPack(env, { id: GH.id }, { fetch: n.fn })).body;
  assert.deepEqual([b.file, b.reason, b.links.doc], [null, "page_only", null]);
  /* a sign-in page with no document link */
  env = await envWith([GH]); n = net({ [GH_URL]: html('<html><head><title>Login</title></head><body><form><input name="u"><input type="password" name="p"></form></body></html>') });
  b = (await mailPack(env, { id: GH.id }, { fetch: n.fn })).body;
  assert.deepEqual([b.reason, b.links.doc], ["login", GH_URL]);
});

test("refusals: a sign-in redirect, 403, robots.txt, Content-Length over the cap (body never read), HTML served as octet-stream, a site that never answers", async () => {
  const flag = async (res, o = {}) => { const env = await envWith([RW]), n = net({ [DOC_URL]: res }, o); return { b: (await mailPack(env, { id: RW.id, ...(o.body || {}) }, { fetch: n.fn })).body, n }; };
  let { b } = await flag(() => new Response(null, { status: 302, headers: { location: "/Account/Login?ReturnUrl=%2Fdoc" } }));
  assert.deepEqual([b.reason, b.links.doc, b.file], ["login", DOC_URL, null], "the file's own link is given, not the sign-in page");
  ({ b } = await flag(() => new Response("no", { status: 403 })));
  assert.deepEqual([b.reason, b.links.doc], ["forbidden", DOC_URL]);
  ({ b } = await flag(pdfRes(makePdf()), { robots: { "www.etenders.gov.za": "User-agent: *\nDisallow: /home/Download" } }));
  assert.deepEqual([b.reason, b.links.doc], ["robots", DOC_URL]);
  /* Content-Length over max_bytes: too_large with its size, the stream is never read */
  let pulled = 0;
  const big = () => new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1000)); } }), { headers: { "content-type": "application/pdf", "content-length": "6000000" } });
  ({ b } = await flag(big, { body: { max_bytes: 4000000 } }));
  assert.deepEqual([b.reason, b.reason_size, b.links.doc], ["too_large", 6000000, DOC_URL]); assert.ok(pulled <= 1, "body not read: " + pulled);
  /* streamed past the cap without a Content-Length */
  ({ b } = await flag(() => new Response(new Uint8Array(150000), { headers: { "content-type": "application/pdf" } }), { body: { max_bytes: 100000 } }));
  assert.deepEqual([b.reason, b.reason_size > 100000], ["too_large", true]);
  /* bytes that are HTML whatever the server says */
  ({ b } = await flag(() => new Response("<!doctype html><html><body><p>Our portal moved.</p></body></html>", { headers: { "content-type": "application/octet-stream" } })));
  assert.deepEqual([b.reason, b.file], ["page_only", null]);
  /* a site that never answers: stopped at the budget (budget_ms 2000 → itemFile 1.5 s) */
  const keep = setTimeout(() => {}, 5000);
  try {
    const hang = (url, init) => (/robots/.test(url) ? Promise.resolve(new Response("", { status: 404 })) : new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })))));
    const env = await envWith([RW]), t0 = Date.now();
    const out = (await mailPack(env, { id: RW.id, budget_ms: 2000 }, { fetch: hang })).body;
    assert.equal(out.reason, "timeout"); assert.ok(Date.now() - t0 < 3000, "took " + (Date.now() - t0) + " ms");
  } finally { clearTimeout(keep); }
});

test("no network call at all: file:false, news (kind), a source whose terms forbid forwarding (mapping.attach:false); the caps are clamped", async () => {
  const env = await envWith([RW, NEWS, OPT]), n = net({});
  const a = (await mailPack(env, { id: RW.id, file: false }, { fetch: n.fn })).body;
  const k = (await mailPack(env, { id: NEWS.id }, { fetch: n.fn })).body;
  const o = (await mailPack(env, { id: OPT.id }, { fetch: n.fn })).body;
  assert.deepEqual([a.reason, k.reason, o.reason], ["not_requested", "kind", "source_opt_out"]);
  assert.equal(n.log.length, 0, "nothing fetched");
  assert.equal(k.links.page, "https://madeinegyptgate.com/intel/news/" + NEWS.id + "/");
  /* max_bytes is clamped to 100 KB .. 8 MB (a bigger request still gets 8 MB at most); DOC_LIMITS keeps PDF 10 MB, DOCX 8 MB */
  const pdf = makePdf(120000), m = net({ [DOC_URL]: pdfRes(pdf) });
  const tiny = (await mailPack(await envWith([RW]), { id: RW.id, max_bytes: 5 }, { fetch: m.fn })).body;
  assert.deepEqual([tiny.reason, tiny.reason_size], ["too_large", pdf.length], "5 bytes asked → 100 KB cap");
  assert.ok(DOC_LIMITS.maxBytes.pdf >= 8e6 && DOC_LIMITS.maxBytes.docx >= 8e6);
});
