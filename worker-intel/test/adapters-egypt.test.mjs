/* src/adapters/egypt.js against real pages saved on 2026-11-18 with the bot UA (test/fixtures/egypt/*.gz): the SCZONE
   tenders page, IDA news pages 1–2 and one notice page, the EEAA notifications table and three notice pages, and what the
   three hosts answer for /robots.txt. Redacted before saving, keeping the shape so the parsers see the real structure: the
   authority phone lines on the SCZONE page (→ «0000000/062-01000000000»), e-mail addresses (→ info@example.invalid),
   ASP.NET anti-forgery tokens and WordPress script nonces. Every record goes through the real engine.normalise().
   Run alone: node --test test/adapters-egypt.test.mjs */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { ADAPTERS, SEED_PATCHES, clean, dmyDate, isoDay, arDate, arProcedure, procGroup, parseIdaDetail, parseEeaaDetail } from "../src/adapters/egypt.js";
import { normalise, parseRobots, robotsAllows, DedupeIndex, LIMITS, storeItems, fillTemplate } from "../src/engine.js";
import { ShimRewriter } from "../src/htmlshim.js";
import { parseDate, cairoDay, KINDS, titleSimilarity, canonicalUrl } from "../src/util.js";
import { MARKETS } from "../src/markets.js";
import { makeD1 } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url)), FXD = join(here, "fixtures", "egypt");
const FX = n => (n.endsWith(".gz") ? gunzipSync(readFileSync(join(FXD, n))).toString("utf8") : readFileSync(join(FXD, n), "utf8"));
const seeds = JSON.parse(readFileSync(join(here, "..", "seeds", "sources.json"), "utf8"));
const NOW = Date.parse("2026-11-18T10:00:00Z");   // the day the fixtures were fetched
const IDS = ["sczone-tenders", "ida-news", "eeaa-notifications"];
const PAGES = { "sczone-tenders": ["sczone-tenders.html.gz"], "ida-news": ["ida-news-p1.html.gz", "ida-news-p2.html.gz"], "eeaa-notifications": ["eeaa-notification-index.html.gz"] };
/* the seed row as engine.fetchSource hands it to a parser once SEED_PATCHES is merged: endpoint templated for page N */
const SRC = (id, page = 1) => {
  const base = seeds.find(s => s.id === id) || { id }, p = SEED_PATCHES[id];
  return { ...base, ...p, id, endpoint: fillTemplate(p.endpoint.replace(/\{\{page\}\}/g, String(page)), NOW), mapping: { ...p.mapping } };
};
const cache = {};
async function records(id) {
  if (!cache[id]) {
    let all = [];
    for (const [i, f] of PAGES[id].entries()) all = all.concat(await ADAPTERS[id].parse(FX(f), SRC(id, i + 1), ShimRewriter));
    cache[id] = all;
  }
  return cache[id];
}
const byId = async (id, ext) => (await records(id)).find(r => r.ext_id === ext);
const item = (id, r) => normalise(r, SRC(id), NOW);
/* runCycle's post-normalise filters (max age, closed tenders, per-source cap): what the engine would store at NOW */
function engineKeep(id, recs) {
  const src = SRC(id), mp = src.mapping, today = cairoDay(NOW);
  const maxAge = (mp.max_age_days || (src.kind === "news" || src.kind === "project_news" ? 21 : 120)) * 864e5;
  return recs.map(r => normalise(r, src, NOW)).filter(Boolean)
    .filter(it => (it.deadline && it.deadline >= today) || !it.published_at || NOW - Date.parse(it.published_at) <= maxAge)
    .filter(it => !(it.status === "closed" && mp.skip_closed !== false)).slice(0, LIMITS.maxItemsPerSource);
}
const KEYS = ["ext_id", "title", "url", "published", "deadline", "entity", "country", "summary", "value", "currency", "notice_type", "proc_group", "proc_method", "kind_hint"].sort();
/* contact data in any form, and the placeholders the fixtures carry where the real numbers / addresses / tokens were */
const CONTACT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0?1[0125]\d{8}\b|\b0\d{1,2}[\s./-]?\d{7}\b|\b\d{7}\s*\/\s*0\d{1,2}\b|(?<!\d)[23]\d{13}(?!\d)/;
const PLACEHOLDER = /0000000|01000000000|example\.invalid|REDACTED/;
const SPEAKER = /(?:^|[\s.،])(?:د|م)\s*\.\s*(?:ناهد|خالد)/;

test("registry and seed patches: three sources, engine-compatible fetch hints, kinds and markets the engine knows", () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(SEED_PATCHES).sort(), [...IDS].sort());
  for (const id of IDS) {
    const a = ADAPTERS[id], p = SEED_PATCHES[id];
    assert.ok(seeds.some(s => s.id === id), id + " exists in seeds/sources.json");
    assert.equal(typeof a.parse, "function");
    assert.ok(KINDS.includes(p.kind) && MARKETS[p.market], id + " kind / market");
    assert.equal(p.market, "eg"); assert.equal(p.lang, "ar", id + ": Arabic pages");
    assert.equal(p.parser, "adapter"); assert.equal(p.mapping.adapter, "egypt"); assert.ok(["A", "B", "C"].includes(p.schedule));
    assert.equal(a.fetch.pages, p.mapping.pages, id + ": fetch.pages = mapping.pages");
    assert.ok(p.mapping.pages >= 1 && p.mapping.pages <= 5, "engine caps pages at 5");
    if (p.mapping.pages > 1) assert.match(p.endpoint, /\{\{page0?\}\}/, id + " paginates through {{page}}");
    assert.ok(a.fetch.timeout_ms >= 25000 && a.fetch.retries >= 1, id + ": generous timeout and retries for slow hosts");
    if (p.enabled) assert.equal(p.disabled_reason, null); else assert.ok(p.disabled_reason && p.disabled_reason.length > 30);
    assert.equal(p.mapping.kind_map.field, "kind_hint");
    for (const k of [...Object.values(p.mapping.kind_map.map), p.mapping.kind_map.default]) assert.ok(KINDS.includes(k), id + " kind_map → " + k);
    if (a.detail) { assert.equal(typeof a.detail.parse, "function"); assert.ok(a.detail.max >= 1 && a.detail.max <= 5); assert.ok(a.detail.kinds.every(k => k in p.mapping.kind_map.map)); }
  }
  assert.equal(SEED_PATCHES["ida-news"].endpoint, "https://www.ida.gov.eg/ar/news?page={{page}}");
});

test("robots.txt of the three hosts (as the engine parses it) allows the list and notice paths", () => {
  const sc = FX("robots-sczone.eg.txt");
  assert.ok(!/\n/.test(sc.trim()), "SCZONE's robots.txt is one line without line breaks");
  const scR = parseRobots(sc);
  assert.deepEqual(scR.rules, [], "no group for «*» survives the missing line breaks: the engine reads no rule");
  assert.ok(robotsAllows(scR, "/tenders/"));
  const ida = parseRobots(FX("robots-www.ida.gov.eg.txt"));
  assert.ok(robotsAllows(ida, "/ar/news?page=1") && robotsAllows(ida, "/ar/news?page=2") && robotsAllows(ida, "/ar/news/337"));
  assert.equal(robotsAllows(ida, "/admin/login"), false);
  assert.equal(ida.delay, null);
  // EEAA: /robots.txt → 302 → /Home/error, an HTML page (fetch follows redirects): no rule, so everything is allowed
  const ee = parseRobots(FX("robots-www.eeaa.gov.eg-302-home-error.html.gz"));
  assert.deepEqual(ee.rules, []);
  assert.ok(robotsAllows(ee, "/Notification/Index") && robotsAllows(ee, "/Notification/67/Details"));
});

test("every adapter: real fixture → ≥ 1 item with title, official https link and a date, accepted by normalise()", async () => {
  for (const id of IDS) {
    const recs = await records(id);
    assert.ok(recs.length >= 1, id + ": records");
    for (const r of recs) {
      assert.deepEqual(Object.keys(r).sort(), KEYS, id + ": record shape");
      for (const [k, v] of Object.entries(r)) assert.equal(typeof v, "string", id + "." + k + " is a string");
      assert.ok(r.title.length >= 10, id + ": title " + r.title);
      assert.match(r.url, /^https:\/\/[^\s]+$/, id + ": official https link");
      assert.ok(parseDate(r.published) || parseDate(r.deadline), id + ": a date — " + r.title);
      assert.ok(r.summary.length <= 200, id + ": excerpt ≤ 200 characters");
      assert.equal(r.value, "", id + ": no list publishes a contract value"); assert.equal(r.currency, "");
      const it = item(id, r);
      assert.ok(it, id + ": normalise() accepts " + r.ext_id);
      assert.ok(KINDS.includes(it.kind) && it.market === "eg" && it.lang === "ar");
      assert.ok(!it.summary_orig || it.summary_orig.length <= 200);
    }
    assert.equal(new Set(recs.map(r => r.ext_id)).size, recs.length, id + ": distinct external ids");
    assert.equal(new Set(recs.map(r => canonicalUrl(r.url))).size, recs.length, id + ": distinct canonical links (URL dedupe must not fold notices)");
    assert.ok(engineKeep(id, recs).length >= 1, id + ": the engine keeps at least one current item on 2026-11-18");
  }
});

test("SCZONE: title, deadline, booklet fee, bid bond and PDF booklet link from the Arabic text", async () => {
  const recs = await records("sczone-tenders");
  assert.equal(recs.length, 38);
  const a = recs[0];
  assert.equal(a.ext_id, "auction-3-2026-2027");
  assert.match(a.title, /^المزايدة العلنية العامة رقم \(3\) لسنه 2026\/2027 بشأن بيع إطارات السيارات الخردة/);
  assert.equal(a.published, "2026-10-30"); assert.equal(a.deadline, "2026-11-23");
  assert.equal(decodeURI(a.url), "https://sczone.eg/uplibrary/كراسة-الشروط-1.pdf");
  assert.equal(a.summary, "قيمة كراسة الشروط: 1,000 جنيه · التأمين المؤقت: 9,000 جنيه · آخر موعد لشراء الكراسة: 22/11/2026 · جلسة المزايدة: 23/11/2026");
  const it = item("sczone-tenders", a);
  assert.deepEqual([it.kind, it.status, it.deadline, it.value], ["tender_semi", "closing_soon", "2026-11-23", null]);
  assert.equal(it.entity, "الهيئة العامة للمنطقة الاقتصادية لقناة السويس");
  assert.ok(recs.every(r => /^https:\/\/sczone\.eg\/uplibrary\//.test(r.url)), "each notice links its own conditions booklet");
  assert.ok(recs.every(r => !/ـ/.test(r.title.replace(/بـ /g, ""))), "kashida removed from titles");
  const fire = await byId("sczone-tenders", "practice-7-2025-2026");
  assert.match(fire.title, /^الممارسة العامة رقم \(7\) لسنة 2025 \/ 2026 م بشأن عملية توريد عدد 2 سيارة إطفاء/, "reversed brackets «) 7 (» fixed");
  assert.equal(fire.published, "2025-09-08", "«8-09-2025» (one-digit day)");
  assert.equal(fire.proc_group, "GO");
  const pipe = await byId("sczone-tenders", "tender-8-2025-2026");
  assert.match(pipe.summary, /التأمين الابتدائي: 22,500,000 جنيه/); assert.equal(pipe.deadline, "2026-02-03"); assert.equal(pipe.proc_group, "CW");
  assert.match((await byId("sczone-tenders", "tender-13-2025-2026")).summary, /جلسة فض المظاريف: 01\/06\/2026/, "«يوم الأثنين» (hamza) is a weekday");
  assert.match((await byId("sczone-tenders", "auction-5-2025-2026")).summary, /جلسة المزايدة: 22\/04\/2026/, "«الموافق22/04/2026م» without a space");
  const ppp = recs.find(r => r.kind_hint === "award");
  assert.match(ppp.title, /^مشروع محطة تحلية مياه البحر/);
  assert.equal(ppp.entity, "شركة المنطقة الاقتصادية للاستثمار"); assert.equal(ppp.deadline, "");
  assert.match(ppp.summary, /^الشركات\/التحالفات المذكورة أدناه التي تأهلت في مرحلة التأهيل المسبق/);
  assert.equal(item("sczone-tenders", ppp).kind, "project_news");
  const kinds = recs.reduce((m, r) => ((m[r.kind_hint] = (m[r.kind_hint] || 0) + 1), m), {});
  assert.deepEqual(kinds, { auction: 8, tender: 29, award: 1 });
  const kept = engineKeep("sczone-tenders", recs);
  assert.deepEqual(kept.map(i => i.ext_id), ["auction-3-2026-2027"], "closed notices are skipped by the engine; one is still open");
});

test("IDA: own tenders and auctions, land / unit / licence offerings, results, news; site-cut titles end with «…»", async () => {
  const recs = await records("ida-news");
  assert.equal(recs.length, 18);
  const hint = Object.fromEntries(recs.map(r => [r.ext_id, r.kind_hint]));
  assert.deepEqual(hint, {
    339: "news", 338: "project", 337: "tender", 336: "tender", 335: "tender", 334: "tender", 333: "award", 332: "auction", 331: "news",
    330: "news", 329: "tender", 328: "project", 327: "auction", 326: "project", 325: "news", 324: "news", 323: "news", 322: "project",
  });
  const t = await byId("ida-news", "337");
  assert.deepEqual([t.title, t.url, t.published, t.deadline, t.entity, t.notice_type], ["التنمية الصناعية تعلن عن طرح المناقصة العامة رقم (11) للعام المالي 2026/2027",
    "https://www.ida.gov.eg/ar/news/337", "2026-10-13", "", "الهيئة العامة للتنمية الصناعية", "مناقصة عامة"]);
  const ti = item("ida-news", t);
  assert.deepEqual([ti.kind, ti.status, ti.market], ["tender_gov", "info", "eg"], "no deadline on the list → honest status «info»");
  const units = await byId("ida-news", "338");
  assert.match(units.title, /طرح 400 وحدة صناعية جاهزة للتسليم الفوري بـ 11 مجمعاً/, "«بـ 11» keeps its kashida");
  assert.equal(item("ida-news", units).kind, "project");
  assert.equal(item("ida-news", await byId("ida-news", "333")).kind, "project_news");
  assert.equal(item("ida-news", await byId("ida-news", "328")).kind, "project", "«سحب كراسات الشروط» is buying booklets, not a land-withdrawal campaign");
  assert.equal(item("ida-news", await byId("ida-news", "325")).kind, "news", "«حملات سحب الأراضي» is a campaign");
  const shops = await byId("ida-news", "322");
  assert.equal(shops.entity, "شركة القاهرة للاستثمار والتطوير العمراني والصناعي");
  const cut = await byId("ida-news", "330");
  assert.match(cut.title, /وتستعرض…$/); assert.ok(!/\.\.\./.test(cut.title));
  for (const r of recs) {
    assert.ok(!SPEAKER.test(r.summary), "quoted officials' attribution removed: " + r.summary);
    if (r.kind_hint === "news") assert.equal(item("ida-news", r).entity, null);
  }
  assert.equal((await byId("ida-news", "339")).summary, "استكمالًا لحزمة التيسيرات المقدمة من وزارة الصناعة مؤخرًا التيسيرات الأخيرة…");
  const kept = engineKeep("ida-news", recs);
  assert.deepEqual(kept.map(i => i.ext_id).sort(), ["334", "335", "336", "337", "338", "339"], "max_age_days 45 on 2026-11-18");
});

test("EEAA: EOIs, bids, RFQs, a carbon-credit sale and market-engagement sessions; job / training / staff notices skipped", async () => {
  const recs = await records("eeaa-notifications");
  assert.equal(recs.length, 53, "60 rows minus 7 job, training and staff notices");
  for (const skipped of ["60", "55", "51", "47", "5", "3", "2"]) assert.equal(await byId("eeaa-notifications", skipped), undefined, "#" + skipped + " skipped");
  const k = async ext => { const r = await byId("eeaa-notifications", ext); return [r.kind_hint, item("eeaa-notifications", r).kind, r.proc_group]; };
  assert.deepEqual(await k("66"), ["eoi", "tender_gov", "CS"]);
  assert.deepEqual(await k("67"), ["tender", "tender_gov", "CW"]);
  assert.deepEqual(await k("57"), ["rfq", "rfq", "GO"]);
  assert.deepEqual(await k("65"), ["auction", "tender_gov", ""]);
  assert.deepEqual(await k("68"), ["project", "project", ""]);
  assert.deepEqual(await k("43"), ["project", "project", ""], "«جلسة للمشاركة السوقية المبكرة»");
  assert.deepEqual(await k("62"), ["project", "project", ""], "grants");
  assert.deepEqual(await k("26"), ["tender", "tender_gov", "CW"], "«إشعار شراء محدد لأعمال المقاولات» is works, not a purchase");
  assert.deepEqual(await k("56"), ["eoi", "tender_gov", "CS"], "an EOI to deliver training is kept");
  const r68 = await byId("eeaa-notifications", "68");
  assert.deepEqual([r68.url, r68.published, r68.deadline, r68.entity], ["https://www.eeaa.gov.eg/Notification/68/Details", "2026-11-10", "", "جهاز شئون البيئة"]);
  assert.equal(r68.summary, "عن الجلسة: الموضوع: اجتماع التفاعل مع السوق — مشروع المرافق الخارجية بالعاشر من رمضان · التاريخ والوقت: 10 نوفمبر 2026 الساعة 12:00 (بتوقيت القاهرة) · الشكل: عبر الإنترنت (Zoom)");
  assert.equal((await byId("eeaa-notifications", "43")).summary, "التاريخ: 24 يونيو 2025 الساعة 10:00 صباحا - القاهرة", "Arabic-Indic digits → ASCII");
  assert.equal((await byId("eeaa-notifications", "29")).entity, "صندوق المناخ الأخضر");
  assert.match((await byId("eeaa-notifications", "40")).title, /بشان مستشار هندسي…$/, "a complete word before the site's «...» is kept");
  const kept = engineKeep("eeaa-notifications", recs);
  assert.deepEqual(kept.map(i => i.ext_id).sort(), ["64", "65", "66", "67", "68"], "max_age_days 60 on 2026-11-18");
});

test("notice pages (optional detail hook): IDA subject, EEAA closing date equal to the World Bank deadline", async () => {
  const idaHtml = FX("ida-news-337-detail.html.gz"), t = await byId("ida-news", "337");
  const d = parseIdaDetail(idaHtml, t);
  assert.equal(d.title, undefined, "the list title was complete: not replaced");
  assert.equal(d.summary, "بشأن التعاقد مع احدى الشركات المتخصصة وذلك لتقديم خدمة التأمين على عدد 48 سيارة مملوكة للهيئة بنظام المظروفين فني ومالي \"مغلقين\".");
  assert.equal(parseIdaDetail(idaHtml, { title: "التنمية الصناعية تعلن عن طرح…" }).title, "التنمية الصناعية تعلن عن طرح المناقصة العامة رقم (11) للعام المالي 2026/2027");
  // World Bank procnotices for the same notices: EOI «guidelines for healthcare waste management» deadline 2026-11-05,
  // IFB «Calibration Equipment for Black Carbon Monitors» deadline 2026-05-18 (checked on 2026-11-18)
  const ee = async (n, file) => { const r = await byId("eeaa-notifications", n); return parseEeaaDetail(FX(file), r); };
  assert.deepEqual(await ee("64", "eeaa-notification-64-detail.html.gz"), { deadline: "2026-11-05" });
  assert.deepEqual(await ee("57", "eeaa-notification-57-detail.html.gz"), { deadline: "2026-05-18" });
  assert.deepEqual(await ee("67", "eeaa-notification-67-detail.html.gz"), { deadline: "2026-11-30" });
  assert.deepEqual(parseEeaaDetail(FX("eeaa-notification-67-detail.html.gz"), { kind_hint: "project" }), {}, "an end date is a deadline for procurement notices only");
  const merged = { ...(await byId("eeaa-notifications", "67")), ...(await ee("67", "eeaa-notification-67-detail.html.gz")) };
  const it = item("eeaa-notifications", merged);
  assert.deepEqual([it.deadline, it.status], ["2026-11-30", "open"]);
  assert.equal(ADAPTERS["sczone-tenders"].detail, undefined, "SCZONE shows everything on its list");
});

test("personal data: phones, e-mails, national IDs, contact persons and quoted officials' names never reach a record", async () => {
  const sc = FX("sczone-tenders.html.gz");
  assert.ok((sc.match(/الاتصال برقم تليفون/g) || []).length >= 30, "the SCZONE fixture keeps the phone lines (redacted digits)");
  assert.ok(/info@example\.invalid/.test(FX("ida-news-p1.html.gz")), "the IDA fixture keeps the footer e-mail (redacted)");
  for (const id of IDS) for (const r of await records(id)) for (const f of ["title", "summary", "entity"]) {
    assert.doesNotMatch(r[f], CONTACT, `${id} ${r.ext_id}.${f}: ${r[f]}`);
    assert.doesNotMatch(r[f], PLACEHOLDER, `${id} ${r.ext_id}.${f}`);
  }
  // contact data injected into the real pages is removed too
  const scInj = sc.replace("تقدم العروض بمقر الهيئة بالعاصمة الجديدة في موعد غايته 23/11/2026م.", "تقدم العروض بمقر الهيئة بالعاصمة الجديدة في موعد غايته 23/11/2026م. للاستفسار: السيد/ أحمد محمد علي ت: 01012345678 أو tenders.officer@sczone.eg");
  const s0 = (await ADAPTERS["sczone-tenders"].parse(scInj, SRC("sczone-tenders")))[0];
  assert.equal(s0.deadline, "2026-11-23"); assert.doesNotMatch(JSON.stringify(s0), /أحمد|01012345678|@/);
  const idaInj = FX("ida-news-p1.html.gz").replace("استكمالًا لحزمة التيسيرات", "للتواصل مع المهندس سامي فؤاد كامل على 0225789634 أو الرقم القومي 29801011234567. استكمالًا لحزمة التيسيرات");
  const i0 = (await ADAPTERS["ida-news"].parse(idaInj, SRC("ida-news")))[0];
  assert.doesNotMatch(JSON.stringify(i0), /سامي|0225789634|29801011234567/); assert.match(i0.summary, /استكمالًا لحزمة التيسيرات/);
  const eeInj = FX("eeaa-notification-index.html.gz").replace("عن الجلسة:", "للاستفسار يرجى التواصل مع د. منى حسن على الهاتف +20 2 2525 6452 أو m.hassan@eeaa.gov.eg\nعن الجلسة:");
  const e0 = (await ADAPTERS["eeaa-notifications"].parse(eeInj, SRC("eeaa-notifications")))[0];
  assert.doesNotMatch(JSON.stringify(e0), /منى|2525|@/); assert.match(e0.summary, /^عن الجلسة: الموضوع/);
  // the cleaner on its own
  assert.equal(clean("للاستفسار: السيد/ أحمد محمد علي ت: 01012345678"), "");
  assert.equal(clean("د. ناهد يوسف: فتح باب التقديم إلكترونياً"), "فتح باب التقديم إلكترونياً");
  assert.equal(clean("Contact: Mr. John Smith, tel +20 2 2345 6789"), "");
  assert.equal(clean("الرقم القومي: 29801011234567 والتأمين 22,500,000 جنيه"), "والتأمين 22,500,000 جنيه", "amounts survive");
  assert.equal(clean("الاتصال برقم تليفون (3590004/062-01033448320)."), "الاتصال برقم.");
});

test("Arabic dates → ISO days; procedure, number and fiscal year from Arabic titles", () => {
  assert.equal(dmyDate("في موعد غايته 23/11/2026م."), "2026-11-23");
  assert.equal(dmyDate("٢٢/١١/٢٠٢٦"), "2026-11-22");
  assert.equal(dmyDate("8-09-2025"), "2025-09-08");
  assert.equal(dmyDate("31/02/2026"), "", "impossible day");
  assert.equal(dmyDate("لسنة 2025/2026"), "", "a fiscal year is not a date");
  assert.equal(isoDay(" 2026-11-10 "), "2026-11-10");
  assert.equal(arDate("10 نوفمبر 2026 الساعة 12:00"), "2026-11-10");
  assert.equal(arDate("٢٤ يونيو ٢٠٢٥"), "2025-06-24");
  assert.equal(arDate("الأربعاء الموافق 9 سبتمبر"), "", "no year → no date (never guessed)");
  assert.deepEqual(arProcedure("الممارسة العامة رقم ) 7 ( لسنة 2025 / 2026 م بشأن عملية توريد"), { family: "practice", label: "ممارسة عامة", no: "7", fy: "2025/2026" });
  assert.deepEqual(arProcedure("التنمية الصناعية تعلن عن طرح المزايدة العلنية رقم 2 للعام المالي 2026-2027"), { family: "auction", label: "مزايدة علنية", no: "2", fy: "2026/2027" });
  assert.deepEqual(arProcedure("المناقصة العامة رقم (1) لسنة 2027/2026 بشأن"), { family: "tender", label: "مناقصة عامة", no: "1", fy: "2026/2027" }, "reversed years");
  assert.equal(arProcedure("ملتقى توظيفي بمحافظة الفيوم"), null);
  assert.equal(procGroup("طلب إبداء اهتمام لتقديم خدمات استشارية"), "CS");
  assert.equal(procGroup("توريد وتركيب عدد (2) ميزان ديجيتال"), "GO");
  assert.equal(procGroup("إعلان طلب إشعار شراء محدد لأعمال المقاولات - انشاء محطتين"), "CW");
  assert.equal(procGroup("التعاقد مع شركة متخصصة للقيام بأعمال النظافة"), "NC");
});

test("a changed layout or a bot-challenge page is an explicit error; an empty later page ends the paging", async () => {
  await assert.rejects(ADAPTERS["sczone-tenders"].parse("<html><body><p>Maintenance</p></body></html>", SRC("sczone-tenders")), /SCZONE layout changed/);
  await assert.rejects(ADAPTERS["ida-news"].parse("<html><body>Not found</body></html>", SRC("ida-news")), /IDA layout changed/);
  await assert.rejects(ADAPTERS["eeaa-notifications"].parse("<html><body><table id=\"other\"></table></body></html>", SRC("eeaa-notifications")), /EEAA layout changed/);
  const cf = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>";
  for (const id of IDS) await assert.rejects(ADAPTERS[id].parse(cf, SRC(id)), /bot-challenge/);
  const p1 = FX("ida-news-p1.html.gz"), empty = p1.slice(0, p1.indexOf("<div class=\"entry col-")) + p1.slice(p1.indexOf("<!-- #posts end -->"));
  assert.ok(/id="posts"/.test(empty));
  assert.deepEqual(await ADAPTERS["ida-news"].parse(empty, SRC("ida-news", 3)), [], "a page past the last one → [] (engine stops paging)");
  const ee = FX("eeaa-notification-index.html.gz"), noRows = ee.replace(/(<table id="tblList"[^>]*>)[\s\S]*?(<\/table>)/, "$1<tbody></tbody>$2");
  assert.deepEqual(await ADAPTERS["eeaa-notifications"].parse(noRows, SRC("eeaa-notifications")), []);
});

test("same-source look-alike titles: IDA tenders no. 9–11 are distinct notices — never folded by title dedupe", async () => {
  const [t11, t10, t9] = await Promise.all(["337", "336", "335"].map(n => byId("ida-news", n)));
  assert.ok(titleSimilarity(t11.title, t10.title) >= 0.8 && titleSimilarity(t11.title, t9.title) >= 0.8, "distinct tenders, near-identical titles");
  const [i11, i10] = [item("ida-news", t11), item("ida-news", t10)];
  assert.notEqual(i11.id, i10.id); assert.notEqual(i11.url_norm, i10.url_norm);
  assert.equal(new DedupeIndex([{ ...i11, official: 2 }]).find(i10), null, "engine rule: same source + different id → a different notice");
  const n11 = { ...i11, kind: "news" }, n10 = { ...i10, kind: "news" };
  assert.equal(new DedupeIndex([n11]).find(n10).id, i11.id, "same-source news may still fold (a re-posted story)…");
  assert.equal(new DedupeIndex([n11], { noTitle: ["ida-news"] }).find(n10), null, "…unless the source says title_dedupe:false");
  assert.equal(new DedupeIndex([{ ...i11, source_id: "other-portal", official: 3 }]).find(i10).id, i11.id, "the same notice from ANOTHER source still folds");
  assert.equal(SEED_PATCHES["ida-news"].mapping.title_dedupe, false);
  assert.equal(SEED_PATCHES["sczone-tenders"].mapping.title_dedupe, false, "SCZONE re-tenders: same subject, near-identical titles");
  const fire = [await byId("sczone-tenders", "practice-11-2025-2026"), await byId("sczone-tenders", "practice-7-2025-2026")];
  assert.ok(titleSimilarity(fire[0].title, fire[1].title) >= 0.8);
});

test("engine store: normalised items of the three sources land in D1 and a re-run only updates", async () => {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql")), nowIso = new Date(NOW).toISOString();
  for (const id of IDS) {
    const s = SRC(id);
    await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping,enabled,schedule,official) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, s.name, s.name_ar, s.kind, s.market, s.parser, SEED_PATCHES[id].endpoint, JSON.stringify(s.mapping), 1, s.schedule, s.official).run();
  }
  const want = {};
  for (const id of IDS) {
    const items = engineKeep(id, await records(id));
    want[id] = items.length;
    const w = await storeItems({ DB }, { ...SRC(id) }, items, new DedupeIndex([]), nowIso);
    assert.equal(w.new, items.length, id + ": stored");
  }
  for (const id of IDS) {
    const rows = (await DB.prepare("SELECT * FROM intel_items WHERE source_id=?").bind(id).all()).results;
    assert.equal(rows.length, want[id]);
    for (const r of rows) { assert.match(r.url, /^https:\/\//); assert.ok(r.title_orig && (r.published_at || r.deadline)); assert.ok(!r.summary_orig || r.summary_orig.length <= 200); }
  }
  const sc = await DB.prepare("SELECT kind, status, deadline, entity FROM intel_items WHERE source_id='sczone-tenders'").first();
  assert.deepEqual(sc, { kind: "tender_semi", status: "closing_soon", deadline: "2026-11-23", entity: "الهيئة العامة للمنطقة الاقتصادية لقناة السويس" });
  const again = await storeItems({ DB }, SRC("eeaa-notifications"), engineKeep("eeaa-notifications", await records("eeaa-notifications")), new DedupeIndex([]), nowIso);
  assert.deepEqual([again.new, again.updated], [0, want["eeaa-notifications"]], "stable ids: a re-run updates, never duplicates");
});
