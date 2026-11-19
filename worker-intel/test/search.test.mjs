/* search used by Bassem's tool and /api/intel/feed?q= : synonyms (AR/EN/FR), normalisation, market aliases, plan-scope widening,
   ranking, news exclusion, 30-day default — and the owner's exact queries from the 2026-11-18 test call */
import test from "node:test"; import assert from "node:assert/strict";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { tool, feed, toolText } from "../src/api.js";
import { parseQuery, resolveMarket, resolveSector, matchItem, itemHay, norm, canon, textPatterns } from "../src/terms.js";
import { marketFilter } from "../src/markets.js";
import { makeD1 } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-18T20:45:00Z");
const ago = d => new Date(NOW - d * 864e5).toISOString();
const ahead = d => new Date(NOW + d * 864e5).toISOString().slice(0, 10) + "T00:00:00.000Z";
let n = 0;
const it = o => ({ id: "t" + String(++n).padStart(10, "0"), source_id: "s", kind: "tender_gov", market: "eg", title_orig: "x", url: "https://official.example/n/" + n, relevance: 50, status: "info", first_seen_at: ago(1), published_at: ago(1), ...o });
async function envWith(items) {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql"));
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES ('s','Official portal','بوابة رسمية','tender_gov','eg','rss','https://official.example','{}')").run();
  const cols = ["id", "source_id", "kind", "tag", "market", "sector", "title_orig", "title_ar", "title_en", "summary_ar", "summary_en", "summary_orig", "entity", "published_at", "deadline", "url", "relevance", "status", "hidden", "dup_of", "first_seen_at"];
  for (const x of items) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c])).run();
  return { DB };
}
const ids = r => r.results.map(x => x.id);
const open = (d = 12) => ({ status: "open", deadline: ahead(d) });

/* a small world shaped like the real data (most titles English, Egypt mostly news, the Gulf mostly news / project news) */
const W = {
  pkBar: it({ kind: "tender_semi", market: "asia:pk", title_orig: "Mild Steel Bar", entity: "Sui Northern Gas Pipelines", ...open(12) }),
  pkRebar: it({ kind: "tender_gov", market: "asia:pk", title_orig: "Tender for supply of MS Deformed Bars", ...open(40) }),
  keSheets: it({ kind: "tender_gov", market: "africa:ke", title_orig: "Supply and Delivery of Shelter Reconstruction Items (Iron Sheets, Nails)", entity: "Siaya County Government", ...open(6) }),
  ghBuyer: it({ kind: "tender_semi", market: "africa:gh", title_orig: "Satellite remote sensing and field mapping program", entity: "Ghana Integrated Iron and Steel Development Corporation", summary_orig: "The Ghana Integrated Iron and Steel Development Corporation has secured funding for mapping.", ...open(5) }),
  egPrice: it({ kind: "news", market: "eg", title_orig: "استقرار سعر الحديد اليوم في المصانع", title_ar: "استقرار سعر الحديد اليوم في المصانع" }),
  egPrice2: it({ kind: "news", market: "eg", title_orig: "أسعار الحديد والأسمنت اليوم", published_at: ago(2) }),
  saMolan: it({ kind: "project_news", market: "sa", title_orig: "Molan signs MoU with Turkish refrigeration firm", summary_en: "Molan Steel Co. signed a non-binding MoU." }),
  gccMetro: it({ kind: "project_news", market: "gcc", title_orig: "Riyadh Expo Metro Station under construction", summary_orig: "with a 134-metre steel dome" }),
  rail: it({ kind: "project_news", market: "iq", title_orig: "مجموعة تركية تطرح استثمارات في الزراعة والسكك الحديدية" }),
  envWorks: it({ kind: "tender_gov", market: "om", title_orig: "Environment protection works at the landfill", ...open(9) }),
  solidWaste: it({ kind: "tender_gov", market: "eg", title_orig: "جمع ونقل النفايات الصلبة", ...open(9) }),
  hodeidah: it({ kind: "project", market: "ye", title_orig: "تأهيل ميناء الحديدة" }),
  omCement: it({ kind: "tender_gov", market: "om", title_orig: "Supply of Portland cement and ready mix concrete", ...open(20) }),
  arRebar: it({ kind: "rfq", market: "sa", title_orig: "توريد حديد تسليح لمشروع إسكان", ...open(10) }),
  ciFer: it({ kind: "tender_gov", market: "africa:ci", title_orig: "Fourniture de fer à béton et de tôles", ...open(15) }),
  oldSteel: it({ kind: "tender_gov", market: "asia:pk", title_orig: "Supply of steel pipes", published_at: ago(45), first_seen_at: ago(45), ...open(30) }),
  midSteel: it({ kind: "tender_gov", market: "africa:ng", title_orig: "Supply of galvanized steel sheets", published_at: ago(20), first_seen_at: ago(20), ...open(30) }),
  closedSteel: it({ kind: "tender_gov", market: "africa:za", title_orig: "Steel structure for warehouse", status: "closed", deadline: ago(3) }),
  pvc: it({ kind: "tender_gov", market: "eg", title_orig: "توريد مواسير بي في سي ومواسير HDPE", ...open(14) }),
  drugs: it({ kind: "tender_gov", market: "africa:ke", title_orig: "Supply of pharmaceuticals and non-pharmaceuticals", ...open(8) }),
  hiddenSteel: it({ kind: "tender_gov", market: "asia:pk", title_orig: "Steel billets supply", hidden: 1, ...open(9) }),
};
const ALL = Object.values(W);

test("synonyms both ways: Arabic query finds English/French notices, English query finds Arabic ones", async () => {
  const env = await envWith(ALL);
  const ar = await tool(env, { action: "search", query: "حديد", plan: "strategic" }, NOW);
  const arFeed = (await feed(env, { q: "حديد", days: 30, per: 50 }, NOW)).items.map(i => i.id);
  for (const k of ["pkBar", "pkRebar", "keSheets", "arRebar", "ciFer", "midSteel"]) assert.ok(arFeed.includes(W[k].id), k);
  assert.ok(ar.count >= 6); assert.equal(ar.results.length, 5);
  const en = await tool(env, { action: "search", query: "rebar", market: "sa" }, NOW);
  assert.equal(ids(en)[0], W.arRebar.id, "rebar ↔ حديد تسليح (the steel group: the RFQ first)");
  const fr = await tool(env, { action: "search", query: "steel", market: "africa:ci" }, NOW);
  assert.deepEqual(ids(fr), [W.ciFer.id], "steel ↔ fer à béton / tôles");
  const pipes = await tool(env, { action: "search", query: "PVC pipes", market: "eg" }, NOW);
  assert.deepEqual(ids(pipes), [W.pvc.id], "PVC pipes ↔ مواسير بي في سي");
  const drugs = await tool(env, { action: "search", query: "أدوية", market: "africa" }, NOW);
  assert.deepEqual(ids(drugs), [W.drugs.id], "أدوية ↔ pharmaceuticals");
  const cement = await tool(env, { action: "search", query: "اسمنت", market: "gulf" }, NOW);
  assert.deepEqual(ids(cement), [W.omCement.id], "اسمنت ↔ cement (Oman is in the Gulf)");
});

test("no false friends: railway, environment, solid waste, Hodeidah, the buyer's name", async () => {
  const env = await envWith(ALL);
  const r = await tool(env, { action: "search", query: "حديد", plan: "strategic", days: 90 }, NOW);
  const all = (await feed(env, { q: "حديد", days: 90, per: 50 }, NOW)).items.map(i => i.id);
  for (const k of ["rail", "envWorks", "solidWaste", "hodeidah", "ghBuyer"]) { assert.ok(!ids(r).includes(W[k].id), k); assert.ok(!all.includes(W[k].id), "feed " + k); }
  assert.ok(!all.includes(W.hiddenSteel.id), "hidden items never");
  const hay = itemHay({ title_orig: "Environment works", entity: "Ministry of Iron" });
  assert.equal(matchItem(hay, parseQuery("iron").concepts).coverage, 0);
});

test("Arabic normalisation: tashkeel, tatweel, hamza forms, ta marbuta, alef maqsura, proclitics ال/و/ب/لل", () => {
  assert.equal(norm("الحَدِيـــد"), "الحديد");
  assert.equal(norm("أسمنت إسمنت آلات"), "اسمنت اسمنت الات");
  assert.equal(norm("خرسانة مبنى"), "خرسانه مبني");
  for (const w of ["الحديد", "والحديد", "بالحديد", "للحديد", "وحديد", "الحَدِيد"]) assert.deepEqual(parseQuery(w).concepts.map(c => c.key), ["steel"], w);
  assert.equal(canon(norm("ألواح")), "الواح", "ألواح is not «ال» + واح");
  assert.deepEqual(parseQuery("الألواح").concepts.map(c => c.key), ["sheets"]);
  assert.deepEqual(parseQuery("بلاستيك").concepts.map(c => c.key), ["plastics"], "a leading ب that belongs to the word stays");
  assert.deepEqual(parseQuery("عايز مناقصات حديد في الصين لو سمحت").concepts.map(c => c.key), ["steel"], "stop-words dropped");
  assert.equal(parseQuery("عايز مناقصات حديد في الصين").market, "asia:cn", "a country inside the query is the market");
  assert.equal(parseQuery("أخبار الحديد").news, true);
  const hay = itemHay({ title_orig: "توريد الأسمنت البورتلاندي" });
  assert.equal(matchItem(hay, parseQuery("اسمنت").concepts).coverage, 1, "query without hamza finds text with hamza");
  assert.ok(textPatterns(parseQuery("اسمنت").concepts).glob.includes("*[اأإآٱ]سمنت*"), "the SQL pre-filter folds alef forms");
});

test("market aliases resolve exactly like the feed API (gulf/khaleej → gcc incl. items stored as 'gcc')", async () => {
  for (const [v, c] of [["gulf", "gcc"], ["GCC", "gcc"], ["khaleej", "gcc"], ["الخليج", "gcc"], ["Egypt", "eg"], ["مصر", "eg"], ["local", "eg"], ["arab", "arab"], ["Africa", "africa"], ["أفريقيا", "africa"], ["asia", "asia"], ["Europe", "eu"], ["intl", "intl"], ["China", "asia:cn"], ["الصين", "asia:cn"], ["cn", "asia:cn"], ["KEN", "africa:ke"], ["Kenya", "africa:ke"], ["السعودية", "sa"], ["sa", "sa"]]) assert.equal(resolveMarket(v), c, v);
  assert.equal(resolveMarket("Far East"), "");
  assert.match(marketFilter("gcc").sql, /'gcc'/); assert.match(marketFilter("arab").sql, /'gcc'/);
  const env = await envWith(ALL);
  const viaFeed = (await feed(env, { market: "gulf", days: 30, per: 50 }, NOW)).items.map(i => i.market);
  assert.ok(viaFeed.length && viaFeed.every(m => ["sa", "ae", "qa", "kw", "om", "bh", "gcc"].includes(m)) && viaFeed.includes("gcc"));
  const t = await tool(env, { action: "search", query: "cement", market: "khaleej" }, NOW);
  assert.equal(t.market, "gcc"); assert.ok(t.results.every(x => ["om", "sa", "gcc"].includes(x.market)));
  const unknown = await tool(env, { action: "search", query: "cement", market: "Far East" }, NOW);
  assert.match(unknown.text, /مش من الأسواق اللي عندي/);
});

test("ranking: tenders/RFQs/projects before project news before news; open deadline first; more terms; newer", async () => {
  const a = it({ kind: "project_news", market: "eg", title_orig: "Steel plant expansion" });
  const b = it({ kind: "tender_gov", market: "eg", title_orig: "Supply of steel", entity: "Authority B", status: "closed", deadline: ago(2) });
  const c = it({ kind: "tender_gov", market: "eg", title_orig: "Supply of steel", entity: "Authority C", ...open(9) });
  const d = it({ kind: "tender_gov", market: "eg", title_orig: "Supply of steel rebar and galvanized iron wire", ...open(9) });
  const e = it({ kind: "news", market: "eg", title_orig: "Steel prices today" });
  const f = it({ kind: "tender_gov", market: "eg", title_orig: "Supply of steel", entity: "Authority F", ...open(9), published_at: ago(5), first_seen_at: ago(5) });
  const g = it({ kind: "tender_gov", market: "eg", title_orig: "Supply of steel", entity: "Authority C", ...open(9), published_at: ago(6), first_seen_at: ago(6) });
  const env = await envWith([a, b, c, d, e, f, g]);
  const r = await feed(env, { q: "steel", market: "eg", per: 10 }, NOW);
  assert.deepEqual(r.items.map(i => i.id), [d.id, c.id, f.id, g.id, b.id, a.id, e.id]);
  const t = await tool(env, { action: "search", query: "حديد", market: "egypt" }, NOW);
  assert.deepEqual(ids(t), [d.id, c.id, f.id, b.id, a.id], "the tool keeps the same order, drops the pure news and the repeated notice (same title + buyer)");
});

test("news is left out unless asked for or nothing else exists", async () => {
  const env = await envWith([W.egPrice, W.egPrice2, W.solidWaste]);
  const t = await tool(env, { action: "search", query: "حديد", market: "eg" }, NOW);
  assert.equal(t.results.length, 2); assert.ok(t.results.every(x => x.kind === "news"));
  assert.match(t.text, /مالقيتش مناقصات ولا طلبات أسعار ولا مشاريع/);
  const env2 = await envWith([W.egPrice, W.arRebar]);
  const t2 = await tool(env2, { action: "search", query: "حديد", plan: "partner" }, NOW);
  assert.deepEqual(ids(t2), [W.arRebar.id]);
  const t3 = await tool(env2, { action: "search", query: "حديد", kind: "news" }, NOW);
  assert.deepEqual(ids(t3), [W.egPrice.id]);
  const t4 = await tool(env2, { action: "search", query: "أخبار الحديد" }, NOW);
  assert.ok(ids(t4).includes(W.egPrice.id));
});

test("window: 30 days by default, days up to 90, brief stays 24 h", async () => {
  const env = await envWith(ALL);
  const d30 = await tool(env, { action: "search", query: "steel", market: "africa:ng" }, NOW);
  assert.deepEqual(ids(d30), [W.midSteel.id], "20 days old is inside the default window");
  assert.equal(d30.days, 30); assert.match(d30.text, /آخر ٣٠ يوم/);
  const oldNews = it({ kind: "project_news", market: "asia:pk", title_orig: "Steel pipes plant expansion", published_at: ago(45), first_seen_at: ago(45) });
  const env45 = await envWith(ALL.concat([oldNews]));
  const pk = await tool(env45, { action: "search", query: "steel pipes", market: "asia:pk" }, NOW);
  assert.ok(!ids(pk).includes(oldNews.id), "45 days old is outside");
  assert.ok(ids(pk).includes(W.oldSteel.id), "…unless it is a tender that is still open");
  assert.match(pk.text, /^لقيت .* خلال آخر ٣٠ يوم \(منها مناقصات أقدم لسه مفتوحة\)/, "and the text says so where it counts what it found");
  const d90 = await tool(env45, { action: "search", query: "steel pipes", market: "asia:pk", days: 400 }, NOW);
  assert.equal(d90.days, 90); assert.ok(ids(d90).includes(oldNews.id));
  const br = await tool(env, { action: "brief" }, NOW);
  assert.match(br.text, /آخر ٢٤ ساعة/); assert.ok(br.results.every(x => x.kind !== "news" || br.results.every(y => y.kind === "news")));
  assert.ok(!br.results.some(x => x.id === W.midSteel.id), "the brief only has the last 24 hours");
});

test("widening: an empty market → ONE wider search over the plan scope, and the text says where results came from", async () => {
  const env = await envWith(ALL);
  const partner = await tool(env, { action: "search", query: "حديد الصلب", market: "asia:cn", plan: "partner" }, NOW);
  assert.equal(partner.widened, "eg,gcc,arab,africa");
  assert.ok(partner.results.length && partner.results.every(x => /^(eg|sa|ae|qa|kw|om|bh|gcc|iq|ye|africa)/.test(x.market)), "partner scope only");
  assert.match(partner.text, /مالقيتش فرص عن «حديد الصلب» في الصين/); assert.match(partner.text, /فوسّعت البحث على أسواق باقتك/);
  const strategic = await tool(env, { action: "search", query: "حديد الصلب", market: "China", plan: "strategic" }, NOW);
  assert.equal(strategic.widened, "all"); assert.ok(ids(strategic).includes(W.pkBar.id)); assert.match(strategic.text, /كل الأسواق/);
  assert.match(strategic.text, /في باكستان/, "each item names its market");
  const none = await tool(env, { action: "search", query: "سيراميك", market: "asia", plan: "partner" }, NOW);
  assert.equal(none.count, 0); assert.match(none.text, /مالقيتش حاجة عن «سيراميك» في آسيا ولا في أسواق باقتك/);
});

test("the owner's exact calls of 2026-11-18 now return real opportunities in the right markets", async () => {
  const env = await envWith(ALL);
  const asia = await tool(env, { action: "search", query: "حديد الصلب", market: "asia" }, NOW);
  assert.deepEqual(ids(asia), [W.pkBar.id, W.pkRebar.id, W.oldSteel.id], "the 45-day-old steel tender is still open"); assert.equal(asia.widened, null);
  assert.match(asia.text, /^لقيت ٣ فرص عن «حديد الصلب» في آسيا خلال آخر ٣٠ يوم/);
  assert.match(asia.text, /آخر ميعاد ٣٠ نوفمبر/);
  const africa = await tool(env, { action: "search", query: "حديد الصلب", market: "africa" }, NOW);
  assert.deepEqual(ids(africa), [W.ciFer.id, W.midSteel.id, W.keSheets.id, W.closedSteel.id], "open ones first, more matched steel terms first (fer à béton + tôles; galvanized steel sheets; iron sheets); the closed one last");
  assert.ok(africa.results.every(x => x.market.startsWith("africa")));
  const gulf = await tool(env, { action: "search", query: "حديد", market: "gulf", sector: "الصناعات المعدنية" }, NOW);
  assert.equal(resolveSector("الصناعات المعدنية"), 12);
  assert.equal(gulf.market, "gcc");
  assert.ok(!gulf.results.some(x => x.market === "eg" && x.kind === "news"), "no Egyptian price news for a Gulf search");
  assert.equal(gulf.results[0].id, W.arRebar.id, "the Saudi RFQ for rebar comes first");
  for (const x of gulf.results) assert.ok(["sa", "ae", "qa", "kw", "om", "bh", "gcc"].includes(x.market), x.market);
});

test("result shape, at most 5, text short with no URLs; feed ?q= agrees with the tool", async () => {
  const env = await envWith(ALL);
  const t = await tool(env, { action: "search", query: "steel", plan: "strategic" }, NOW);
  assert.ok(t.results.length <= 5 && t.count >= t.results.length);
  for (const r of t.results) {
    for (const k of ["id", "title", "market", "market_name", "kind", "url", "page"]) assert.ok(r[k], k);
    assert.ok("entity" in r && "deadline" in r);
    assert.match(r.page, /^https:\/\/madeinegyptgate\.com\/intel\/(tenders|rfq|projects|news)\/.+-[0-9a-z]{11}\/$/);
    assert.match(r.url, /^https:\/\/official\.example\//);
  }
  assert.ok(!/https?:|www\./.test(t.text)); assert.ok((t.text.match(/؛/g) || []).length <= 2, "≤ 3 items spoken");
  assert.ok(!/\d/.test(t.text.replace(/«[^»]*»/g, "")), "digits outside titles are Arabic");
  const f = await feed(env, { q: "steel", days: 30, per: 50 }, NOW);
  const fNoNews = f.items.filter(i => i.kind !== "news").map(i => i.id);
  assert.deepEqual(fNoNews.slice(0, 5), ids(t), "same matcher, same order");
  assert.equal(typeof f.total, "number"); assert.ok("updated_at" in f && f.page === 1);
  assert.match(toolText("search", 1, [{ kind: "rfq", title: "توريد حديد", market_name: "السعودية", deadline: "2027-01-02" }], { query: "حديد", nowMs: NOW }), /فرصة واحدة.*٢ يناير ٢٠٢٧/);
});

/* ---------- review fixes (2026-11-18 evening) ---------- */
test("plan unknown (the persona never sends one): all markets, «كل الأسواق», no plan named or returned", async () => {
  const env = await envWith(ALL);
  const china = await tool(env, { action: "search", query: "حديد الصلب", market: "China" }, NOW);
  assert.equal(china.widened, "all"); assert.ok(!("plan" in china));
  assert.ok(ids(china).includes(W.pkBar.id) && ids(china).includes(W.pkRebar.id), "the Pakistan steel-bar tenders are in");
  assert.match(china.text, /فوسّعت البحث على كل الأسواق/); assert.ok(!/باقتك/.test(china.text));
  const noMarket = await tool(env, { action: "search", query: "حديد الصلب" }, NOW);
  assert.equal(noMarket.market, "all"); assert.ok(ids(noMarket).includes(W.pkBar.id)); assert.ok(!/باقتك/.test(noMarket.text));
  const unknown = await tool(env, { action: "search", query: "cement", market: "Far East" }, NOW);
  assert.match(unknown.text, /فدوّرت في كل الأسواق/);
  const partner = await tool(env, { action: "search", query: "حديد الصلب", plan: "partner" }, NOW);
  assert.equal(partner.plan, "partner"); assert.ok(!ids(partner).includes(W.pkBar.id), "a stated partner plan still limits");
});

/* real Gulf / Egypt titles with hamza on ya / waw, short words, long lists — the SQL candidates must contain every matcher hit */
const SUPER = [
  it({ kind: "tender_gov", market: "om", title_orig: "توريد مواد غذائية وسلعية لعام2027", ...open(5) }),
  it({ kind: "tender_gov", market: "om", title_orig: "أعمال صيانة المصعد الكهربائي بمبنى الوزارة", ...open(8) }),
  it({ kind: "tender_gov", market: "om", title_orig: "توريد قطع غيار أنظمة الري", ...open(9) }),
  it({ kind: "tender_gov", market: "eg", title_orig: "توريد الأدوية والمستلزمات الطبية", ...open(9) }),
  it({ kind: "tender_gov", market: "eg", title_orig: "توريد مؤن وأغذية للمستشفى", ...open(9) }),
  it({ kind: "rfq", market: "sa", title_orig: "توريد مياه الشرب المعبأة", ...open(9) }),
  it({ kind: "tender_gov", market: "eg", title_orig: "توريد شاي وسكر", ...open(9) }),
  it({ kind: "tender_gov", market: "eg", title_orig: "إنشاء مبنى إداري", ...open(9) }),
  it({ kind: "tender_gov", market: "africa:ke", title_orig: "Supply of electrical cables and medical equipment", ...open(9) }),
  it({ kind: "tender_gov", market: "africa:ci", title_orig: "Fourniture de câbles électriques", ...open(9) }),
  it({ kind: "news", market: "eg", title_orig: "أسعار الطماطم والأرز اليوم" }),
];
test("SQL pre-filter ⊇ matcher (hamza on ya/waw, short words, lists, every concept of a long query)", async () => {
  const env = await envWith(SUPER.concat(ALL)), db = env.DB._db;
  const { buildFeedQuery } = await import("../src/api.js");
  const { accepts } = await import("../src/terms.js");
  const qs = ["مستلزمات طبية", "مواد غذائية", "اغذية", "food", "كهرباء", "electrical", "زراعة", "أدوية", "مياه", "شاي", "مقاولات", "مواد غذائية ومعدات طبية وكابلات", "حديد، اسمنت، كابلات، أدوية، أغذية، زراعة", "câble", "steel"];
  for (const q of qs) {
    const b = buildFeedQuery({ q, days: 30 }, NOW), all = buildFeedQuery({ days: 30 }, NOW);
    assert.ok(b.args.length <= 100, q + ": D1 allows 100 bound parameters, got " + b.args.length);
    const tp = textPatterns(b.search.concepts);
    for (const p of tp.glob.concat(tp.like)) assert.ok(new TextEncoder().encode(p).length <= 50, q + ": D1 allows 50-byte patterns: " + p);
    const cand = new Set(db.prepare(`SELECT id FROM intel_items WHERE ${b.where}`).all(...b.args).map(r => r.id));
    const truth = db.prepare(`SELECT * FROM intel_items WHERE ${all.where}`).all(...all.args).filter(r => accepts(b.search.concepts, matchItem(itemHay(r), b.search.concepts).hit));
    assert.ok(truth.length > 0, q + " finds something");
    for (const r of truth) assert.ok(cand.has(r.id), q + ": the SQL dropped «" + r.title_orig + "»");
  }
  const food = (await tool(env, { action: "search", query: "مواد غذائية", market: "gulf" }, NOW));
  assert.match(food.results[0].title, /مواد غذائية/, "the Oman food tender is found");
  const agri = (await tool(env, { action: "search", query: "زراعة", market: "om" }, NOW));
  assert.ok(agri.results.some(x => /أنظمة الري/.test(x.title)), "«أنظمة الري» is agriculture");
  const lift = (await tool(env, { action: "search", query: "كهرباء", market: "om" }, NOW));
  assert.ok(lift.results.some(x => /الكهربائي/.test(x.title)));
});

test("in-query markets: «قطر» is a diameter, bare «خليج» / «خليج السويس» are places; explicit market args still work", async () => {
  assert.equal(parseQuery("حديد تسليح قطر ١٢ مم").market, ""); assert.equal(parseQuery("مشروعات خليج السويس").market, "");
  assert.equal(parseQuery("Gulf of Suez projects").market, "");
  assert.equal(parseQuery("حديد الخليج").market, "gcc"); assert.equal(parseQuery("مناقصات في الصين").market, "asia:cn");
  assert.equal(resolveMarket("قطر"), "qa"); assert.equal(resolveMarket("خليج"), "gcc");
  const env = await envWith(ALL);
  const t = await tool(env, { action: "search", query: "حديد تسليح قطر ١٢ مم" }, NOW);
  assert.ok(!/في قطر/.test(t.text)); assert.ok(ids(t).includes(W.arRebar.id));
  const f = await feed(env, { q: "حديد قطر 16", days: 90, per: 50 }, NOW);
  assert.ok(f.items.some(i => i.market !== "qa"), "the site search is not narrowed to Qatar");
});

test("lists are OR, a product must be there next to a generic word, a form needs its material; partial answers are «قريبة من»", async () => {
  const schoolBuilding = it({ kind: "tender_gov", market: "sa", title_orig: "بناء مدرسة ابتدائية", ...open(9) });
  const gasLine = it({ kind: "tender_gov", market: "om", title_orig: "Gas pipeline construction contract", ...open(9) });
  const plasticBags = it({ kind: "tender_gov", market: "om", title_orig: "Supply of plastic bags", ...open(9) });
  const env = await envWith(SUPER.concat(ALL, [schoolBuilding, gasLine, plasticBags]));
  const list = await tool(env, { action: "search", query: "مواد غذائية ومعدات طبية وكابلات", plan: "strategic" }, NOW);
  assert.ok(list.count >= 3, "each list item counts on its own"); assert.match(list.text, /^لقيت .* عن «مواد غذائية ومعدات طبية وكابلات»/);
  const steelBuilding = await tool(env, { action: "search", query: "حديد البناء", market: "gulf" }, NOW);
  assert.ok(!ids(steelBuilding).includes(schoolBuilding.id), "«البناء» alone is not steel"); assert.ok(ids(steelBuilding).includes(W.arRebar.id));
  assert.match(steelBuilding.text, /قريبة من «حديد البناء»/, "steel without «البناء» is close, not «عن»");
  const pvc = await tool(env, { action: "search", query: "مواسير بلاستيك", market: "gulf" }, NOW);
  assert.ok(!ids(pvc).includes(gasLine.id) && !ids(pvc).includes(plasticBags.id), "pipes AND plastic");
  const pvcEg = await tool(env, { action: "search", query: "مواسير بلاستيك", market: "eg" }, NOW);
  assert.deepEqual(ids(pvcEg), [W.pvc.id]); assert.match(pvcEg.text, /عن «مواسير بلاستيك»/);
});

test("no product word: codes / numbers are literal in the feed, a bare size asks for the product in the tool", async () => {
  const coded = it({ kind: "rfq", market: "eg", title_orig: "RFQ/2026/123 supply of office chairs", ...open(9) });
  const env = await envWith(ALL.concat([coded]));
  assert.deepEqual((await feed(env, { q: "RFQ/2026/123", days: 30, per: 50 }, NOW)).items.map(i => i.id), [coded.id]);
  assert.equal((await feed(env, { q: "RFQ/2026/999", days: 30, per: 50 }, NOW)).total, 0);
  assert.deepEqual((await feed(env, { q: "2026", days: 30, per: 50 }, NOW)).items.map(i => i.id), [coded.id]);
  const size = await tool(env, { action: "search", query: "3 4 5 مم", market: "gulf" }, NOW);
  assert.equal(size.count, 0); assert.deepEqual(size.results, []); assert.match(size.text, /مش واضح لي اسم المنتج/); assert.ok(!/لقيت/.test(size.text));
  const sized = await tool(env, { action: "search", query: "3 4 5 مم", sector: "الصناعات المعدنية" }, NOW);
  assert.match(sized.text, /مش لاقي اسم منتج/); assert.ok(!/عن «3 4 5 مم»/.test(sized.text));
});

test("the window: an open tender published long ago stays findable; closed old ones and the 24 h brief do not change", async () => {
  const oldOpen = it({ kind: "tender_gov", market: "eu", title_orig: "Supply of steel reinforcement bars", published_at: "2001-02-01T00:00:00.000Z", first_seen_at: ago(5), ...open(20) });
  const oldPast = it({ kind: "tender_gov", market: "eu", title_orig: "Supply of steel beams", published_at: ago(80), first_seen_at: ago(80), status: "open", deadline: ago(3) });
  const env = await envWith(ALL.concat([oldOpen, oldPast]));
  const t = await tool(env, { action: "search", query: "steel", market: "eu" }, NOW);
  assert.deepEqual(ids(t), [oldOpen.id], "open with a future deadline: in; deadline passed: out");
  assert.ok((await feed(env, { q: "steel", market: "eu", days: 30 }, NOW)).items.some(i => i.id === oldOpen.id));
  const br = await tool(env, { action: "brief" }, NOW);
  assert.ok(!br.results.some(x => x.id === oldOpen.id || x.id === W.midSteel.id), "the brief is still the last 24 hours only");
});

test("internal parameters do not leak from the URL; market lists with an attached «و»; repeated notices vs distinct RFQs", async () => {
  const { handleApi } = await import("../src/api.js");
  const { resolveMarkets } = await import("../src/terms.js");
  const env = await envWith(ALL);
  const get = async u => { const r = await handleApi(new Request("https://madeinegyptgate.com" + u), env, {}); return { status: r.status, j: await r.json() }; };
  const a = await get("/api/intel/feed?mf=x&days=30"); assert.equal(a.status, 200);
  const b = await get("/api/intel/feed?market=eg&mf=&days=30"); assert.ok(b.j.items.length && b.j.items.every(i => i.market === "eg"), "?mf= does not drop the market filter");
  assert.deepEqual(resolveMarkets("مصر والخليج").codes, ["eg", "gcc"]); assert.deepEqual(resolveMarkets("السعودية والإمارات").codes, ["sa", "ae"]);
  const t = await tool(env, { action: "search", query: "cement", market: "مصر والخليج" }, NOW);
  assert.ok(!/مش من الأسواق/.test(t.text)); assert.equal(t.market, "eg,gcc");
  const k1 = it({ kind: "rfq", market: "africa:za", title_orig: "Supply of steel pipes and fittings", entity: "KZN Health", ...open(7) });
  const k2 = it({ kind: "rfq", market: "africa:za", title_orig: "Supply of steel pipes and fittings", entity: "KZN Health", ...open(14) });
  const env2 = await envWith([k1, k2]);
  assert.equal((await tool(env2, { action: "search", query: "steel", market: "africa" }, NOW)).count, 2, "two deadlines, two RFQs");
});

test("synonym false friends: chemin de fer, bus bar, car park, Dutch «van», «دقيق» precise, «عدسات», «طوبوغرافي», a company's name", () => {
  const no = (q, title, extra = {}) => assert.equal(matchItem(itemHay({ title_orig: title, ...extra }), parseQuery(q).concepts).coverage, 0, q + " / " + title);
  no("steel", "Travaux de réhabilitation du chemin de fer");
  no("vehicles", "Supply of copper bus bars"); no("vehicles", "Resurfacing of the car park"); no("vehicles", "Gemeente van Amsterdam cleaning services");
  no("مواد غذائية", "تحديد دقيق لمواقع المحطات"); no("عدس", "توريد عدسات طبية"); no("طوب", "أعمال مساحة طوبوغرافية");
  no("steel", "Molan signs MoU with Turkish refrigeration firm", { summary_en: "Molan Steel Co. signed a non-binding MoU." });
  const yes = (q, title) => assert.ok(matchItem(itemHay({ title_orig: title }), parseQuery(q).concepts).coverage > 0, q + " / " + title);
  yes("steel", "Fourniture de fer à béton"); yes("vehicles", "Supply of buses and vans"); yes("مواد غذائية", "توريد دقيق القمح المدعم"); yes("عدس", "توريد العدس والفول"); yes("طوب", "توريد الطوب الأحمر");
  yes("steel", "Supply of steel coils");
});
