/* «bigtables» adapters (src/adapters/bigtables.js) against real pages saved on 2026-11-18 with the bot UA
   (test/fixtures/bigtables/*.gz: EBRD ECEPP 3.9 MB, AIIB ppo-data-all.js, PPRA EPMS page 1, Esnaad dashboard page 1).
   Run alone: node --test test/adapters-bigtables.test.mjs */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { ADAPTERS, clean, mdyDate, dmyDate, ukStampIso, ukStampDay, jsUnescape, ebrdMeta, marketKey } from "../src/adapters/bigtables.js";
import { normalise, parseRobots, robotsAllows, LIMITS } from "../src/engine.js";
import { ShimRewriter } from "../src/htmlshim.js";
import { parseDate, canonicalUrl, cairoDay, KINDS } from "../src/util.js";
import { MARKETS } from "../src/markets.js";

const here = dirname(fileURLToPath(import.meta.url));
const FX = n => gunzipSync(readFileSync(join(here, "fixtures", "bigtables", n))).toString("utf8");
const TXT = n => readFileSync(join(here, "fixtures", "bigtables", n), "utf8");
const NOW = Date.parse("2026-11-18T10:00:00Z"); // the day the fixtures were fetched
const KIND_MAP = { field: "kind_hint", map: { semi: "tender_semi", rfq: "rfq", project: "project", award: "project_news" } };
/* the seed rows returned in this batch's seed_patch (kept in sync by hand) */
const SEED = {
  "ebrd-ecepp": { id: "ebrd-ecepp", kind: "tender_gov", market: "intl", lang: "en", parser: "adapter", endpoint: "https://ecepp.ebrd.com/delta/noticeSearchResults.html", mapping: { adapter: "bigtables", market_from: "market_key", kind_map: KIND_MAP, max_age_days: 60 } },
  aiib_project_procurement: { id: "aiib_project_procurement", kind: "tender_gov", market: "intl", lang: "en", parser: "adapter", endpoint: "https://www.aiib.org/en/opportunities/business/project-procurement/_common/ppo-data-all.js", mapping: { adapter: "bigtables", market_from: "market_key", kind_map: KIND_MAP } },
  pk_ppra_epms: { id: "pk_ppra_epms", kind: "tender_gov", market: "asia:pk", lang: "en", parser: "adapter", endpoint: "https://epms.ppra.gov.pk/public/tenders/active-tenders?page={{page}}", mapping: { adapter: "bigtables", pages: 3, kind_map: KIND_MAP } },
  "om-esnaad-public-dash": { id: "om-esnaad-public-dash", kind: "tender_gov", market: "om", lang: "ar", parser: "adapter", endpoint: "https://etendering.tenderboard.gov.om/product/publicDash?viewFlag=NewTenders&pageNo={{page}}", mapping: { adapter: "bigtables", pages: 2, kind_map: KIND_MAP } },
};
const FIX = { "ebrd-ecepp": "ebrd-ecepp-noticeSearchResults.html.gz", aiib_project_procurement: "aiib-ppo-data-all.js.gz", pk_ppra_epms: "ppra-epms-active-p1.html.gz", "om-esnaad-public-dash": "esnaad-newtenders-p1.html.gz" };
/* the source object as engine.fetchSource hands it to a parser for page N (endpoint templated, mapping parsed) */
const srcFor = (id, page = 1, extra = {}) => ({ ...SEED[id], endpoint: SEED[id].endpoint.replace(/\{\{page\}\}/g, String(page)), mapping: { ...SEED[id].mapping, ...extra } });
const parse = (id, text, extra = {}, page = 1) => ADAPTERS[id].parse(text, srcFor(id, page, extra), ShimRewriter);
const cache = {};
const records = async id => (cache[id] ||= await parse(id, FX(FIX[id])));
/* runCycle's post-normalise filters (max age, closed, per-source cap) — what the engine would store at NOW */
function engineKeep(id, recs) {
  const src = SEED[id], mp = src.mapping, today = cairoDay(NOW);
  const maxAge = (mp.max_age_days || (src.kind === "news" || src.kind === "project_news" ? 21 : 120)) * 864e5;
  return recs.map(r => normalise(r, src, NOW)).filter(Boolean)
    .filter(it => (it.deadline && it.deadline >= today) || !it.published_at || NOW - Date.parse(it.published_at) <= maxAge)
    .filter(it => it.status !== "closed").slice(0, LIMITS.maxItemsPerSource);
}
const CONTACT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0?1[0125]\d{8}\b|\b03\d{9}\b/;
function common(id, recs) {
  assert.ok(recs.length >= 1, id + ": at least one record");
  for (const r of recs) {
    assert.ok(r.title && r.title.length >= 5, id + ": title");
    assert.match(r.url, /^https:\/\/[^\s]+$/, id + ": official https link");
    assert.ok(parseDate(r.published) || parseDate(r.deadline), id + ": a date (published or deadline) — " + r.title);
    assert.ok(r.ext_id, id + ": external id");
    for (const f of ["title", "summary", "entity"]) assert.ok(!CONTACT.test(r[f] || ""), `${id}: contact data in ${f}: ${r[f]}`);
    assert.ok(String(r.summary || "").length <= 200, id + ": excerpt ≤ 200 characters");
    const it = normalise(r, SEED[id], NOW);
    assert.ok(it, id + ": normalise() accepts the record");
    assert.ok(KINDS.includes(it.kind) && MARKETS[it.market], `${id}: kind ${it.kind} / market ${it.market}`);
    assert.ok(!it.summary_orig || it.summary_orig.length <= 200);
  }
  assert.equal(new Set(recs.map(r => canonicalUrl(r.url))).size, recs.length, id + ": distinct canonical links (URL dedupe must not merge notices)");
  assert.equal(new Set(recs.map(r => r.ext_id)).size, recs.length, id + ": distinct external ids");
}

test("registry: one adapter per source, the duplicate EBRD seed is not registered, paging within engine limits", () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), ["aiib_project_procurement", "ebrd-ecepp", "om-esnaad-public-dash", "pk_ppra_epms"]);
  assert.equal(ADAPTERS.ebrd_ecepp, undefined);
  for (const a of Object.values(ADAPTERS)) { assert.equal(typeof a.parse, "function"); if (a.fetch) assert.ok(a.fetch.pages >= 1 && a.fetch.pages <= 5); }
  assert.equal(ADAPTERS.pk_ppra_epms.fetch.pages, SEED.pk_ppra_epms.mapping.pages);
  assert.equal(ADAPTERS["om-esnaad-public-dash"].fetch.pages, SEED["om-esnaad-public-dash"].mapping.pages);
});

test("helpers: dates in every source format, UK time (GMT/BST), JS escapes, market keys", () => {
  assert.deepEqual(["Nov 18, 2026", "Sep 15,2026", "April 30, 2026", "Aug. 28, 2026", "Nov 3 , 2026", "N/A", ""].map(mdyDate), ["2026-11-18", "2026-09-15", "2026-04-30", "2026-08-28", "2026-11-03", "", ""]);
  assert.deepEqual(["13-12-2026", "Bid Closing Date:01-02-2027", "31-02-2026"].map(dmyDate), ["2026-12-13", "2027-02-01", ""]);
  assert.equal(ukStampIso("202611180907"), "2026-11-18T09:07:00.000Z"); // GMT
  assert.equal(ukStampIso("202607081013"), "2026-07-08T09:13:00.000Z"); // BST
  assert.equal(ukStampIso("202603290230"), "2026-03-29T01:30:00.000Z"); // BST starts 29 Mar 2026
  assert.equal(ukStampIso("202610250230"), "2026-10-25T02:30:00.000Z"); // GMT again from 25 Oct 2026
  assert.equal(ukStampDay("202612281000"), "2026-12-28"); assert.equal(ukStampIso("bad"), "");
  assert.equal(jsUnescape('Consortium \\"MJN\\" \\u00e9\\x41\\n'), 'Consortium "MJN" éA\n');
  assert.equal(marketKey("Romania"), "ROU"); assert.equal(marketKey("Egypt"), "Egypt"); assert.equal(marketKey("Lao PDR"), "LAO");
  const md = ebrdMeta("[Kyrgyz Water Resilience Framework - Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur, 52283, Kyrgyz Republic, 6.4 RETENDER-Rehabilitation, 48003978, Works, Open Tender Single Stage, Water Utilities of Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur, Municipal and Environmental Infrastructure, Invitation For Tenders Single]");
  assert.deepEqual(md, { project: "Kyrgyz Water Resilience Framework - Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur", project_no: "52283", category: "Works", method: "Open Tender Single Stage", client: "Water Utilities of Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur", sector: "Municipal and Environmental Infrastructure" });
  assert.equal(ebrdMeta("[RLF - Rivne Regional Water and Wastewater, 55745, Ukraine, Goods,Works,Consultancy, Rivneoblvodokanal CE, Municipal and Environmental Infrastructure, General Procurement Notice]").client, "Rivneoblvodokanal CE");
  assert.deepEqual(ebrdMeta("[]"), {});
});

test("robots.txt fetched on 2026-11-18 allows the endpoints (PPRA and Esnaad answer 404 = no rules)", () => {
  assert.equal(robotsAllows(parseRobots(TXT("robots-ecepp.ebrd.com.txt")), "/delta/noticeSearchResults.html"), true);
  const aiib = parseRobots(TXT("robots-www.aiib.org.txt"));
  assert.equal(robotsAllows(aiib, "/en/opportunities/business/project-procurement/_common/ppo-data-all.js"), true);
  assert.equal(robotsAllows(aiib, "/en/search.jsp"), false, "the file's own rules still apply");
  assert.equal(parseRobots(TXT("robots-www.aiib.org.txt")).delay, null);
});

test("EBRD ECEPP: 3.9 MB table read row by row → open tenders, recent GPNs and awards; client, UK time, country → market", async () => {
  const html = FX(FIX["ebrd-ecepp"]);
  assert.ok(html.length > 3_500_000 && (html.match(/<tr>/g) || []).length > 4000);
  const t0 = performance.now(); const recs = await parse("ebrd-ecepp", html); const ms = performance.now() - t0;
  assert.ok(ms < 3000, "parse took " + Math.round(ms) + " ms");
  common("ebrd-ecepp", recs);
  const by = recs.reduce((a, r) => ((a[r.kind_hint] = (a[r.kind_hint] || 0) + 1), a), {});
  assert.equal(by.tender, 42, "every notice the page marks Open"); assert.ok(by.project >= 1 && by.award >= 1);
  assert.ok(recs.length <= LIMITS.maxItemsPerSource, "the page's 4,146 rows are cut to what matters");
  assert.ok(!recs.some(r => /addendum|shortlist|prequalified participants/i.test(r.notice_type)));
  const k = recs.find(r => r.ext_id === "48004099");
  assert.deepEqual([k.title, k.url, k.published, k.deadline, k.entity, k.country, k.proc_group, k.kind_hint], ["Kyrgyz Republic: 6.4 RETENDER-Rehabilitation and Extension of Water Supply Systems in Batken Region, Aidarken City", "https://ecepp.ebrd.com/delta/viewNotice.html?displayNoticeId=48004099", "2026-11-16T06:04:00.000Z", "2026-12-28", "Water Utilities of Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur", "Kyrgyz Republic", "CW", "tender"]);
  assert.match(k.summary, /^Invitation For Tenders Single · Works · Open Tender Single Stage · Municipal and Environmental Infrastructure · Project: Kyrgyz Water Resilience Framework/);
  const it = normalise(k, SEED["ebrd-ecepp"], NOW);
  assert.deepEqual([it.kind, it.market, it.status, it.deadline, it.entity], ["tender_gov", "asia:kg", "open", "2026-12-28", "Water Utilities of Kadamzhai, Aidarken, Kok-Jangak and Tash-Komur"]);
  const aw = recs.find(r => r.kind_hint === "award"), gpn = recs.find(r => r.kind_hint === "project");
  assert.equal(normalise(aw, SEED["ebrd-ecepp"], NOW).kind, "project_news"); assert.match(aw.title, / – Contract Award Notice$/); assert.equal(aw.deadline, "");
  assert.equal(normalise(gpn, SEED["ebrd-ecepp"], NOW).kind, "project");
  const bg = recs.find(r => r.country === "Bulgaria"); assert.equal(normalise(bg, SEED["ebrd-ecepp"], NOW).market, "eu");
  const tn = recs.find(r => r.country === "Tunisia"); assert.equal(normalise(tn, SEED["ebrd-ecepp"], NOW).market, "tn");
  // Egypt rows → market "eg" (Egypt's newest notice is from July, so read with wider windows)
  const wide = await parse("ebrd-ecepp", html, { award_days: 730, project_days: 730 });
  const eg = wide.filter(r => r.country === "Egypt");
  assert.ok(eg.length >= 10); assert.ok(eg.every(r => normalise(r, SEED["ebrd-ecepp"], NOW).market === "eg"));
  const sub = wide.find(r => r.ext_id === "44489271");
  assert.deepEqual([sub.title, sub.published, sub.entity], ["Egypt: Construction of new 500 kV Cairo substation – Contract Award Notice", "2026-07-08T09:13:00.000Z", "EGYPTIAN ELECTRICITY TRANSMISSION COMPANY"]);
  assert.ok(engineKeep("ebrd-ecepp", recs).length >= 40);
  // the windows count back from the page's newest row, never from the clock: same input → same output
  assert.deepEqual((await parse("ebrd-ecepp", html)).map(r => r.ext_id), recs.map(r => r.ext_id));
});

test("AIIB: static JS data read as data (never evaluated); open notices only; contractor names never read", async () => {
  const js = FX(FIX.aiib_project_procurement), recs = await records("aiib_project_procurement");
  common("aiib_project_procurement", recs);
  assert.ok(!recs.some(r => /award|procurement plan|addend|corrigend|extension|cancel/i.test(r.notice_type)));
  const bd = recs.find(r => r.url === "https://www.aiib.org/en/opportunities/business/project-procurement/_download/Bangladesh/REOI.pdf");
  assert.deepEqual([bd.title, bd.published, bd.deadline, bd.proc_group, bd.entity], ["Bangladesh: Construction of Dual Gauge Railway Line from Bogra to Sirajganj – Request for Expressions of Interest", "2026-11-17", "2026-11-30", "CS", ""]);
  const it = normalise(bd, SEED.aiib_project_procurement, NOW);
  assert.deepEqual([it.kind, it.market, it.status], ["tender_gov", "asia:bd", "open"]);
  const gpn = recs.find(r => r.kind_hint === "project"); assert.equal(normalise(gpn, SEED.aiib_project_procurement, NOW).kind, "project"); assert.equal(gpn.deadline, "");
  // seven lots of one project share a title on AIIB: each gets its document name
  const tcdd = recs.filter(r => /TCDD Railway Maintenance Modernization Project/.test(r.title));
  assert.equal(tcdd.length, 7); assert.equal(new Set(tcdd.map(r => r.title)).size, 7); assert.ok(tcdd.some(r => r.title.endsWith("(SPN-TCDD.DMB-1)")));
  // natural persons (individual consultants) in `cr` never reach a record, even with the widest windows
  const other = [...js.matchAll(/\b(?:pj|ds|mb|tp|st):"((?:[^"\\]|\\.)*)"/g)].map(m => jsUnescape(m[1])).join("\n");
  const names = [...new Set([...js.matchAll(/\bcr:"((?:[^"\\]|\\.)+)"/g)].map(m => jsUnescape(m[1]).trim()))].filter(n => n.length >= 6 && !/^n\/?a/i.test(n) && !other.includes(n));
  assert.ok(names.includes("Tuan Anh Le") && names.length > 100);
  const blob = JSON.stringify(await parse("aiib_project_procurement", js, { undated_days: 9999, project_days: 9999 }));
  for (const n of names) assert.ok(!blob.includes(n), "contractor name leaked: " + n);
  // format change → explicit, alert-friendly error
  await assert.rejects(parse("aiib_project_procurement", "window.ppo = [];"), /AIIB data file format changed/);
  await assert.rejects(parse("aiib_project_procurement", 'var ppoData = [{id:1,cd:2,tp:3,dc:4},{"id":5}];'), /AIIB data file format changed/);
  // escaped quotes decoded, trailing code never executed, Egypt → eg
  const r = await parse("aiib_project_procurement", 'var ppoData = [{id:"Nov 18, 2026",cd:"Dec 30, 2026",mb:"Egypt",pj:"Test \\"quoted\\" project\\n",ds:"",cr:"Mr. X",sd:"",pc:"",st:"Water",ct:"Notices",tp:"Specific Procurement Notice",dc:"/x/a.pdf"}]; globalThis.__aiibPwned = 1;');
  assert.equal(r[0].title, 'Egypt: Test "quoted" project – Specific Procurement Notice'); assert.equal(globalThis.__aiibPwned, undefined);
  assert.equal(normalise(r[0], SEED.aiib_project_procurement, NOW).market, "eg"); assert.ok(!JSON.stringify(r).includes("Mr. X"));
  assert.ok(engineKeep("aiib_project_procurement", recs).length >= 10);
});

test("Pakistan PPRA EPMS: main + detail rows; International or Goods kept; companies → semi-government; paging ends quietly", async () => {
  const html = FX(FIX.pk_ppra_epms), recs = await records("pk_ppra_epms");
  common("pk_ppra_epms", recs);
  const v = recs.find(r => r.ext_id === "TS0000018392E");
  assert.deepEqual([v.title, v.url, v.published, v.deadline, v.entity, v.proc_group, v.kind_hint], ['Gas Service Valves 3/4" (Without Tail Piece) 180,000 Nos.', "https://epms.ppra.gov.pk/public/tenders/tender-details/TS0000018392E", "2026-11-18", "2026-12-24", "Sui Northern Gas Pipelines Limited (SNGPL)", "GO", "semi"]);
  assert.equal(v.summary, "Goods · International tender · Ref. SND-2624/26 · Islamabad");
  const it = normalise(v, SEED.pk_ppra_epms, NOW); assert.deepEqual([it.kind, it.market, it.status], ["tender_semi", "asia:pk", "open"]);
  assert.equal(recs.find(r => r.ext_id === "TS0000018419E").title, "Tender Notice No. 03/2026 – Tender for supply of MS Deformed Bars, Ordinary…");
  assert.equal(normalise(recs.find(r => r.ext_id === "TS0000018419E"), SEED.pk_ppra_epms, NOW).kind, "tender_gov");
  assert.ok(recs.every(r => / International tender/.test(r.summary) || r.proc_group === "GO"), "local works/services are dropped");
  const all = await parse("pk_ppra_epms", html, { keep_all: true });
  assert.ok(all.length >= 45 && recs.length < all.length); assert.ok(!all.some(r => /open auction/i.test(r.title)), "disposals are not procurement");
  const twins = recs.filter(r => /^TRAINING EQUIPMENT \(/.test(r.title)); assert.equal(twins.length, 2); assert.notEqual(twins[0].title, twins[1].title);
  assert.deepEqual(await parse("pk_ppra_epms", "<html><body><p>Showing 0 of 0 tenders</p></body></html>", {}, 2), []);
  assert.deepEqual(await parse("pk_ppra_epms", "<html><body>maintenance</body></html>", {}, 3), [], "a broken later page must not discard pages already read");
  await assert.rejects(parse("pk_ppra_epms", "<html><body>maintenance</body></html>"), /PPRA EPMS layout changed/);
  assert.ok(engineKeep("pk_ppra_epms", recs).length >= 30);
});

test("Oman Esnaad dashboard: getNit id, tooltip title, closing date, distinct dashboard links, SOE → semi-government", async () => {
  const html = FX(FIX["om-esnaad-public-dash"]), recs = await records("om-esnaad-public-dash");
  common("om-esnaad-public-dash", recs);
  const a = recs.find(r => r.ext_id === "101892");
  assert.deepEqual([a.title, a.entity, a.deadline, a.published, a.url], ["تقديم خدمات عقد الصيانة السنوية والدعم الفني لنظام أوراكل لتخطيط موارد المؤسسة", "هيئة تنظيم الخدمات العامة", "2026-12-13", "", "https://etendering.tenderboard.gov.om/product/publicDash?viewFlag=NewTenders&tenderNo=101892"]);
  assert.equal(a.summary, "رقم المناقصة: 2026/57/ه ت خ ع/ م ر -37 · خدمات تقنية المعلومات · عامة (Local) · آخر موعد لشراء وثائق المناقصة: 25-11-2026");
  const it = normalise(a, SEED["om-esnaad-public-dash"], NOW);
  assert.deepEqual([it.kind, it.market, it.status, it.published_at, it.lang], ["tender_gov", "om", "open", null, "ar"]);
  const b = recs.find(r => r.ext_id === "99810");
  assert.equal(b.title, "أعمال تعديلات بمجمع البريمي الصحي بمحافظة البريمي", "the tooltip (tender name) wins over the description"); assert.match(b.summary, /صيانة مجمع البريمي الصحي وانشاء غرفة للنفايات$/);
  assert.match(recs.find(r => r.ext_id === "101865").title, /"تجاوب"$/, "entities decoded");
  const soe = recs.find(r => r.ext_id === "101847");
  assert.equal(soe.entity, "شركة تنمية نخيل عمان"); assert.equal(normalise(soe, SEED["om-esnaad-public-dash"], NOW).kind, "tender_semi");
  assert.equal(recs.length, 48, "50 rows minus 2 direct-assignment rows"); assert.equal((await parse("om-esnaad-public-dash", html, { keep_all: true })).length, 50);
  assert.ok(recs.every(r => r.url.startsWith("https://etendering.tenderboard.gov.om/product/publicDash?viewFlag=NewTenders&tenderNo=")));
  assert.deepEqual(await parse("om-esnaad-public-dash", "<html><body>no rows</body></html>", {}, 2), []);
  await assert.rejects(parse("om-esnaad-public-dash", "<html><body>Access denied</body></html>"), /Esnaad dashboard layout changed/);
  assert.ok(engineKeep("om-esnaad-public-dash", recs).length >= 30);
});

test("personal data: contacts injected into real rows never reach title, summary or entity", async () => {
  const EN = " — Contact: Mr. Ahmed Ali, ahmed.ali@example.org, Tel: +92 51 9201234, mobile 03001234567, CNIC 35202-1234567-1";
  const AR = " للتواصل: السيد أحمد علي هاتف 24402244 بريد ahmed@example.om";
  const leak = r => /Ahmed|أحمد|@|9201234|03001234567|35202|24402244/.test([r.title, r.summary, r.entity].join(" "));
  const ebrd = FX(FIX["ebrd-ecepp"]).replace('displayNoticeId=48004099">Kyrgyz Republic: 6.4 RETENDER', 'displayNoticeId=48004099">Kyrgyz Republic: 6.4 RETENDER' + EN.replace(/,/g, ""));
  const e = (await parse("ebrd-ecepp", ebrd)).find(r => r.ext_id === "48004099");
  assert.ok(e && !leak(e), JSON.stringify(e)); assert.match(e.title, /^Kyrgyz Republic: 6\.4 RETENDER/);
  const aiib = FX(FIX.aiib_project_procurement).replace('pj:"Construction of Dual Gauge Railway Line from Bogra to Sirajganj",ds:""', `pj:"Construction of Dual Gauge Railway Line from Bogra to Sirajganj",ds:"Consultancy${EN}"`);
  const ai = (await parse("aiib_project_procurement", aiib)).find(r => r.ext_id.endsWith("/Bangladesh/REOI.pdf"));
  assert.ok(ai && !leak(ai), JSON.stringify(ai));
  const pk = FX(FIX.pk_ppra_epms).replace("<strong>Gas Service Valves 3/4\" (Without Tail Piece)</strong>", "<strong>Gas Service Valves 3/4\" (Without Tail Piece)" + EN + "</strong>").replace("Sui Northern Gas Pipelines Limited (SNGPL)</strong>", "Sui Northern Gas Pipelines Limited (SNGPL) " + EN + "</strong>");
  const p = (await parse("pk_ppra_epms", pk)).find(r => r.ext_id === "TS0000018392E");
  assert.ok(p && !leak(p), JSON.stringify(p));
  const om = FX(FIX["om-esnaad-public-dash"]).replace("Tip('تقديم خدمات عقد الصيانة السنوية", "Tip('تقديم خدمات عقد الصيانة السنوية" + AR).replace('<td >هيئة تنظيم الخدمات العامة</td>', `<td >هيئة تنظيم الخدمات العامة${AR}</td>`);
  const o = (await parse("om-esnaad-public-dash", om)).find(r => r.ext_id === "101892");
  assert.ok(o && !leak(o), JSON.stringify(o)); assert.equal(o.entity, "هيئة تنظيم الخدمات العامة");
  assert.equal(clean("Supply of telephone sets and fax machines (Lot 2) — Contact Centre Solution"), "Supply of telephone sets and fax machines (Lot 2) — Contact Centre Solution", "ordinary words survive");
});

test("layout changes are explicit errors, not silent empty results", async () => {
  await assert.rejects(parse("ebrd-ecepp", "<html><body><table id='other'><tr><td>x</td></tr></table></body></html>"), /EBRD ECEPP layout changed: table#noticeResultsTable not found/);
  await assert.rejects(parse("ebrd-ecepp", '<table id="noticeResultsTable"><tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td></tr></tbody></table>'), /none of 1 table rows has a viewNotice\.html link/);
});
