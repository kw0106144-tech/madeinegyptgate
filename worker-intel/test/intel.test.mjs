import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { parseRss, parseAtom, parseJson, parseHtml, parseSitemap, detectXml } from "../src/parsers.js";
import { ShimRewriter } from "../src/htmlshim.js";
import { canonicalUrl, itemId, slugify, stripContacts, parseDate, statusFor, titleSimilarity, timingSafeEqual, ID_RE } from "../src/util.js";
import { classifySector, ruleRelevance, SECTORS, sectorIndex } from "../src/sectors.js";
import { parseRobots, robotsAllows, robotsFor, normalise, DedupeIndex, dueSources, groupsForCron, fillTemplate, runCycle, LIMITS, upsertSql } from "../src/engine.js";
import { sanitise, numbersOk, enrichPending, aiBudget } from "../src/enrich.js";
import { buildFeedQuery, feed, tool, toolText, handleApi } from "../src/api.js";
import { itemHtml, itemPath, handlePages, sitemap } from "../src/pages.js";
import { marketFor } from "../src/markets.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url)), FX = n => readFileSync(join(here, "fixtures", n), "utf8");
const seeds = JSON.parse(readFileSync(join(here, "..", "seeds", "sources.json"), "utf8"));
const S = id => { const s = seeds.find(x => x.id === id); return { ...s, mapping: s.mapping || {} }; };
const NOW = Date.parse("2026-11-18T10:00:00Z");

test("sectors are identical to the site's MIGSECTORS", () => {
  const p = join(here, "..", "..", "site", "data", "regions.js");
  if (!existsSync(p)) return;
  const m = /window\.MIGSECTORS\s*=\s*(\[[\s\S]*?\]\]);/.exec(readFileSync(p, "utf8"));
  assert.deepEqual(JSON.parse(m[1]), SECTORS);
});

test("RSS parser (real feeds: Al Borsa, Daily News Egypt, Youm7)", () => {
  assert.equal(detectXml(FX("rss-alborsaa.xml")), "rss");
  const a = parseRss(FX("rss-alborsaa.xml"), S("alborsa"));
  assert.equal(a.length, 20); assert.ok(a.every(i => i.title && /^https:\/\/alborsaanews\.com\//.test(i.url) && parseDate(i.published)));
  const d = parseRss(FX("rss-dne.xml"), S("dne-business")); assert.equal(d.length, 10); assert.ok(!d[0].title.includes("&#"));
  const y = parseRss(FX("rss-youm7.xml"), S("youm7-economy")); assert.ok(y.length >= 3 && y.every(i => /youm7\.com/.test(i.url)));
});
test("Atom parser (real feed)", () => {
  assert.equal(detectXml(FX("atom-alborsaa.xml")), "atom");
  const a = parseAtom(FX("atom-alborsaa.xml"), S("alborsa")); assert.equal(a.length, 20); assert.ok(a.every(i => /^https?:\/\//.test(i.url) && i.title));
});
test("JSON mapper: World Bank procnotices + TED v3 (real responses)", () => {
  const wb = parseJson(FX("wb-eg.json"), S("wb-eg"));
  assert.equal(wb.length, 8);
  assert.match(wb[0].url, /^https:\/\/projects\.worldbank\.org\/en\/projects-operations\/procurement-detail\/OP\d+$/);
  const it = normalise(wb[0], S("wb-eg"), NOW); assert.equal(it.market, "eg"); assert.equal(it.kind, "tender_gov");
  const award = wb.map(r => normalise(r, S("wb-eg"), NOW)).find(i => i && i.kind === "project_news"); assert.ok(award, "Contract Award → project_news");
  const ted = parseJson(FX("ted-supplies.json"), S("ted-eu-supplies"));
  assert.equal(ted.length, 6); assert.ok(ted.every(r => /ted\.europa\.eu\/en\/notice\/-\/detail\/\d+-2026$/.test(r.url) && r.title && Array.isArray(r.cpv)));
  const t0 = normalise(ted[0], S("ted-eu-supplies"), NOW); assert.equal(t0.market, "eu"); assert.ok(t0.sector !== null);
});
test("HTML list parser through the HTMLRewriter API (shim)", async () => {
  const html = `<table><tr class="r"><td><a href="/n/1">Supply of cables &amp; poles</a></td><td class="d">01/12/2026</td></tr><tr class="r"><td><a href="/n/2">توريد أدوية</a></td><td class="d">15/12/2026</td></tr></table>`;
  const src = { endpoint: "https://x.example/list", parser: "html", mapping: { item: "tr.r", fields: { title: { sel: "a" }, url: { sel: "a", attr: "href" }, deadline: { sel: "td.d" } } } };
  const r = await parseHtml(html, src, ShimRewriter);
  assert.deepEqual(r.map(x => [x.title, x.url, x.deadline]), [["Supply of cables & poles", "https://x.example/n/1", "01/12/2026"], ["توريد أدوية", "https://x.example/n/2", "15/12/2026"]]);
  assert.equal(parseDate("01/12/2026").slice(0, 10), "2026-12-01");
});
test("Google-News sitemap parser", () => {
  const x = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>https://a.example/1</loc><news:news><news:publication_date>2026-11-18T08:00:00+03:00</news:publication_date><news:title>خبر</news:title></news:news></url></urlset>`;
  assert.deepEqual(parseSitemap(x).map(i => i.title), ["خبر"]);
});
test("URL canonicalisation, ids, slugs", () => {
  assert.equal(canonicalUrl("https://www.Example.com/a/b/?utm_source=x&b=2&a=1#f"), "example.com/a/b?a=1&b=2");
  assert.equal(itemId("s", "x"), itemId("s", "x")); assert.match(itemId("s", "x"), ID_RE); assert.notEqual(itemId("s", "x"), itemId("t", "x"));
  assert.equal(slugify("Supply of PVC pipes – 6\" (Lot 2)"), "supply-of-pvc-pipes-6-lot-2");
  assert.equal(slugify("توريد أدوية لعام 2026"), "توريد-ادوية-لعام-2026"); // hamza folded: stable ASCII-safe-ish slugs
  const it = { id: "0roca6lnp5m", kind: "tender_gov", slug: "abc", title_orig: "abc" };
  assert.equal(itemPath(it, "ar"), "/intel/tenders/abc-0roca6lnp5m/"); assert.equal(itemPath(it, "en"), "/intel/en/tenders/abc-0roca6lnp5m/");
});
test("personal contacts are stripped", () => {
  const s = stripContacts("Contact Mr X at x.y@gov.eg or +20 2 2345 6789, mobile 01012345678. Value 1,367,499.45 EUR, deadline 2026-12-07");
  assert.ok(!/@|2345|0101/.test(s)); assert.ok(s.includes("1,367,499.45") && s.includes("2026-12-07"));
});
test("dedupe: canonical URL + title trigrams; most official source wins", () => {
  const idx = new DedupeIndex([{ id: "a", source_id: "news1", kind: "news", url_norm: "x.com/1", title_orig: "Egypt signs deal to build new steel plant in Sokhna", official: 1 }]);
  assert.equal(idx.find({ id: "b", kind: "news", url_norm: "x.com/1", title_orig: "zzz" }).id, "a");
  assert.equal(idx.find({ id: "c", kind: "project_news", url_norm: "y.com/2", title_orig: "Egypt signs deal to build new steel plant in Sokhna!" }).id, "a");
  assert.equal(idx.find({ id: "d", kind: "tender_gov", url_norm: "y.com/3", title_orig: "Egypt signs deal to build new steel plant in Sokhna" }), null, "tenders are not merged with news");
  assert.ok(titleSimilarity("توريد كابلات كهربائية لجامعة بني سويف", "توريد كابلات كهربائيه لجامعه بني سويف") > 0.8);
});
test("sector rules (AR/EN/FR + CPV) and relevance", () => {
  assert.equal(SECTORS[classifySector({ title: "توريد كابلات ومهمات كهربائية لاحتياجات الجامعة" }).index][1], "Electrical, Cables & Lighting");
  assert.equal(SECTORS[classifySector({ title: "Supply of pharmaceutical products and vaccines" }).index][1], "Pharmaceuticals & Medical Supplies");
  assert.equal(SECTORS[classifySector({ title: "Fourniture de mobilier scolaire" }).index][1], "Furniture & Wood");
  assert.equal(SECTORS[classifySector({ title: "x", cpv: ["44800000"] }).index][1], "Paints & Inks");
  const eg = ruleRelevance({ kind: "tender_gov", market: "eg", sector: 18, proc_group: "GO" }, NOW), eu = ruleRelevance({ kind: "tender_gov", market: "eu", sector: 34, proc_group: "CS" }, NOW);
  assert.ok(eg > eu && eg <= 100 && eu >= 0);
  assert.equal(sectorIndex("Paints & Inks"), 6); assert.equal(sectorIndex("7"), 6);
});
test("tender status from deadline (honest rule)", () => {
  assert.equal(statusFor("tender_gov", "2026-11-10", NOW), "closed"); assert.equal(statusFor("tender_gov", "2026-11-20", NOW), "closing_soon");
  assert.equal(statusFor("tender_gov", "2027-01-04", NOW), "open"); assert.equal(statusFor("tender_gov", null, NOW), "info"); assert.equal(statusFor("news", "2027-01-04", NOW), "info");
});
test("news headline about a tender is labelled tender_news, never an official tender", () => {
  const it = normalise({ title: "طرح مناقصة لتوريد محولات كهربائية", url: "https://n.example/a" }, { id: "n", kind: "news", market: "eg", mapping: {} }, NOW);
  assert.equal(it.kind, "project_news"); assert.equal(it.tag, "tender_news");
});
test("robots.txt handling (RFC 9309)", async () => {
  const p = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/feed\nCrawl-delay: 10\n\nUser-agent: OtherBot\nDisallow: /");
  assert.equal(robotsAllows(p, "/news"), true); assert.equal(robotsAllows(p, "/private/x"), false); assert.equal(robotsAllows(p, "/private/feed"), true); assert.equal(p.delay, 10);
  assert.equal(robotsAllows(parseRobots("User-agent: MadeInEgyptGate-IntelBot\nDisallow: /\nUser-agent: *\nDisallow:"), "/a"), false);
  const kv = makeKV();
  assert.equal(robotsAllows(await robotsFor("https://a.example/x", { KV: kv }, async () => new Response("", { status: 404 })), "/x"), true);
  assert.equal(robotsAllows(await robotsFor("https://b.example/x", { KV: kv }, async () => new Response("", { status: 503 })), "/x"), false);
  assert.ok(kv._m.has("robots:a.example"));
});
test("cron groups, rotation and batching stay under limits", () => {
  assert.deepEqual(groupsForCron("0 */2 * * *"), ["A"]); assert.deepEqual(groupsForCron("30 */6 * * *"), ["B"]); assert.deepEqual(groupsForCron("15 3 * * *"), ["C"]);
  const src = Array.from({ length: 80 }, (_, i) => ({ id: "s" + i, enabled: 1, schedule: "B", last_run_at: i < 10 ? new Date(NOW - 3600e3).toISOString() : i < 40 ? new Date(NOW - 7 * 3600e3).toISOString() : null }));
  const due = dueSources(src, ["B"], NOW);
  assert.equal(due.length, LIMITS.maxSourcesPerRun); assert.ok(due.every(s => !s.last_run_at), "never-run first"); assert.ok(!due.some(s => +s.id.slice(1) < 10), "recently run sources are skipped (idempotent)");
  assert.equal(fillTemplate("x>={{date-2:compact}}", NOW), "x>=20261116");
  const big = Array.from({ length: 200 }, (_, i) => ({ id: "i" + i, title_orig: "t".repeat(300), summary_orig: "ع".repeat(200) }));
  assert.ok(upsertSql(big.slice(0, 40)).length < 100000);
});
test("AI guards: numbers must exist in the input; daily cap", async () => {
  assert.equal(numbersOk("deadline 4 January 2027, 375 units", "375 computers deadline 2027-01-04"), true);
  assert.equal(numbersOk("value 5 million", "supply of cables"), false);
  const o = sanitise({ title_ar: "توريد كابلات", title_en: "Supply of cables", summary_ar: "قيمة 9 ملايين دولار", summary_en: "Call me at +20 100 123 4567", sector: 19, relevance: 140, kind: "news" }, { kind: "tender_gov", title_orig: "Supply of cables" });
  assert.equal(o.summary_ar, null); assert.ok(!/\+20/.test(o.summary_en || "")); assert.equal(o.relevance, 100); assert.equal(o.kind, null); assert.equal(o.sector, 18);
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql")), KV = makeKV();
  await DB.prepare("INSERT INTO intel_sources (id,name,kind,market,parser,endpoint,mapping) VALUES ('s','S','news','eg','rss','https://x','{}')").run();
  for (let i = 0; i < 5; i++) await DB.prepare("INSERT INTO intel_items (id,source_id,kind,market,title_orig,url,relevance,status,first_seen_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("id" + i, "s", "news", "eg", "خبر رقم " + i + " عن مصنع جديد في مصر", "https://x/" + i, i * 10, "info", new Date(NOW).toISOString()).run();
  let calls = [];
  const AI = { run: async (m, p) => { calls.push(JSON.parse(p.messages[1].content).title); return { response: { title_ar: JSON.parse(p.messages[1].content).title, title_en: "Factory news " + JSON.parse(p.messages[1].content).title.match(/\d/)[0], summary_ar: "خبر عن مصنع جديد في مصر", summary_en: "News about a new factory in Egypt", sector: 23, relevance: 70, kind: "news" }, usage: { prompt_tokens: 700, completion_tokens: 140 } }; } };
  const env = { DB, KV, AI, AI_DAILY_LIMIT: "3", AI_PER_RUN: "10" };
  const r = await enrichPending(env, { now: NOW });
  assert.equal(r.calls, 3); assert.ok(calls[0].includes("4"), "highest relevance first");
  const r2 = await enrichPending(env, { now: NOW }); assert.equal(r2.calls, 0); assert.equal(r2.skipped, "daily cap reached");
  assert.equal((await aiBudget(env, NOW)).left, 0);
});

async function seededEnv() {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql")), KV = makeKV();
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping,enabled,schedule,official) VALUES ('alborsa','Al Borsa','البورصة','news','eg','rss','https://alborsaanews.com/feed','{}',1,'A',1),('wb-eg','World Bank','البنك الدولي','tender_gov','eg','json',?,?,1,'A',3)").bind(S("wb-eg").endpoint, JSON.stringify(S("wb-eg").mapping)).run();
  const fetchFn = async (u) => { u = String(u); if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200 }); if (u.includes("alborsaanews")) return new Response(FX("rss-alborsaa.xml"), { headers: { etag: "W/\"1\"" } }); if (u.includes("worldbank")) return new Response(FX("wb-eg.json")); return new Response("", { status: 404 }); };
  const now = Date.parse("2026-11-18T12:00:00Z");
  const st = await runCycle({ DB, KV }, { trigger: "test", fetch: fetchFn, now, gate: async () => {}, enrich: false });
  return { env: { DB, KV, PLATFORM_KEY: "k".repeat(32) }, st, now };
}
test("one cycle against fixtures: store, dedupe on re-run, source health", async () => {
  const { env, st } = await seededEnv();
  assert.equal(st.ok, 2); assert.ok(st.items_new >= 21);
  /* 20 RSS items, 17 stored: the three daily retail price lists (poultry / meat / eggs, fish, vegetables) are not industry news (terms.js newsRelevant) */
  const src = await env.DB.prepare("SELECT * FROM intel_sources WHERE id='alborsa'").first(); assert.equal(src.etag, "W/\"1\""); assert.equal(src.fail_count, 0); assert.equal(src.items_total, 17);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM intel_items WHERE source_id='alborsa' AND title_orig LIKE 'أسعار %اليوم في مصر%'").first()).n, 0);
  const st2 = await runCycle(env, { trigger: "test", fetch: async u => String(u).endsWith("robots.txt") ? new Response("") : new Response(FX("rss-alborsaa.xml")), now: Date.parse("2026-11-18T15:00:00Z"), gate: async () => {}, enrich: false, sourceIds: ["alborsa"] });
  assert.equal(st2.items_new, 0); assert.equal(st2.items_updated, 17);
  const st3 = await runCycle(env, { trigger: "test", fetch: async u => String(u).endsWith("robots.txt") ? new Response("") : new Response("boom", { status: 500 }), now: Date.parse("2026-11-18T16:00:00Z"), gate: async () => {}, enrich: false, sourceIds: ["alborsa"] });
  assert.equal(st3.failed, 1); assert.equal((await env.DB.prepare("SELECT fail_count FROM intel_sources WHERE id='alborsa'").first()).fail_count, 1);
});
test("API: feed filters, item 410, admin auth, tool webhook text", async () => {
  const { env, now } = await seededEnv();
  const all = await feed(env, { days: 30 }, now); assert.ok(all.total >= 21);
  const t = await feed(env, { kind: "tenders", market: "eg", days: 60 }, now); assert.ok(t.items.every(i => /^tender_|^rfq$/.test(i.kind) && i.market === "eg"));
  const n = await feed(env, { kind: "news", q: "مصر", days: 30 }, now); assert.ok(n.items.every(i => i.kind === "news" || i.kind === "project_news"));
  assert.match(buildFeedQuery({ status: "active" }).where, /status IN/);
  const r = await tool(env, { action: "search", query: "كابلات", days: 3 }, now);
  assert.equal(typeof r.count, "number"); assert.ok(!/https?:\/\//.test(r.text)); assert.ok(Array.isArray(r.results));
  const txt = toolText("search", 12, [{ kind: "tender_gov", title_ar: "توريد كابلات", entity: "جامعة", market_name: "مصر", deadline: "2026-12-01" }], { query: "كابلات", days: 3, nowMs: now });
  assert.match(txt, /١٢ فرصة/); assert.match(txt, /آخر ميعاد ١ ديسمبر/); assert.ok(!/http/.test(txt)); // spoken: Arabic digits, deadline in words (no year in the current year)
  const bad = await handleApi(new Request("https://w.dev/api/intel/admin/hide", { method: "POST", headers: { "X-Platform-Key": "nope" }, body: "{}" }), env, {}); assert.equal(bad.status, 401);
  const one = all.items[0];
  const ok = await handleApi(new Request("https://w.dev/api/intel/admin/hide", { method: "POST", headers: { "X-Platform-Key": "k".repeat(32) }, body: JSON.stringify({ id: one.id }) }), env, {}); assert.equal(ok.status, 200);
  const gone = await handlePages(new Request("https://madeinegyptgate.com" + new URL(one.page).pathname), env, {}); assert.equal(gone.status, 410);
  assert.equal(timingSafeEqual("abc", "abc"), true); assert.equal(timingSafeEqual("abc", "abd"), false); assert.equal(timingSafeEqual("", ""), false);
});
test("SEO pages: canonical, hreflang both ways, valid JSON-LD, noindex for old closed items, sitemap", async () => {
  const { env } = await seededEnv();
  const it = await env.DB.prepare("SELECT * FROM intel_items WHERE kind='news' LIMIT 1").first();
  const html = itemHtml(it, { name: "Al Borsa", name_ar: "البورصة" }, "ar", "madeinegyptgate.com");
  assert.ok(html.includes(`<link rel="canonical" href="https://madeinegyptgate.com${itemPath(it, "ar")}">`));
  assert.ok(html.includes(`hreflang="en" href="https://madeinegyptgate.com${itemPath(it, "en")}"`) && html.includes(`hreflang="ar-EG" href="https://madeinegyptgate.com${itemPath(it, "ar")}"`));
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  assert.ok(lds.some(j => j["@type"] === "NewsArticle" && j.isBasedOn === it.url)); assert.ok(lds.some(j => j["@type"] === "BreadcrumbList"));
  assert.ok(html.includes('rel="nofollow noopener"') && html.includes("/contact/#rfq-form") && html.includes("مصدر رسمي: البورصة"));
  assert.ok(html.includes('content="index,follow'));
  const old = itemHtml({ ...it, kind: "tender_gov", status: "closed", deadline: "2026-09-01" }, null, "en", "madeinegyptgate.com", Date.parse("2026-11-18T12:00:00Z"));
  assert.ok(old.includes('content="noindex,follow"')); assert.ok(/"@type":"WebPage"/.test(old) && old.includes('lang="en"'));
  const idx = await sitemap(env, null); assert.match(idx, /sitemap-items-1\.xml/);
  const ch = await sitemap(env, "items-1"); assert.ok((ch.match(/<url>/g) || []).length <= 5000 && ch.includes("hreflang"));
  const hub = await handlePages(new Request("https://madeinegyptgate.com/intel/"), env, {}); assert.equal(hub.status, 200); assert.match(await hub.text(), /آخر تحديث/);
  const red = await handlePages(new Request("https://madeinegyptgate.com/intel/news/wrong-slug-" + it.id + "/"), env, {}); assert.equal(red.status, 301);
  assert.equal(marketFor("Egypt, Arab Republic of"), "eg"); assert.equal(marketFor("KEN"), "africa:ke"); assert.equal(marketFor("DEU"), "eu");
});
