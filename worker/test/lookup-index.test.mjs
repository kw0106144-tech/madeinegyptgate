// lookup-index 2026-11-20 (the Al-Atlal call, Anam session 8bacbfac: 39 searches, nothing found): janna_lookup searches what the companies
// write about themselves (data.json f[6], worker/build-index.js), as WHOLE words, the results that hold ALL the words first, with the
// AR / EN / FR synonym groups of src/lookup-terms.js and an honest count. Runs on the real src/data.json + src/items.json.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import worker, { search } from "../src/index.js";
import DATA from "../src/data.json";
import ITEMS from "../src/items.json";
import { stem, tokens, norm } from "../src/text.js";
import { concepts, canon, variants, phraseTokens, lookupVersion } from "../src/lookup-terms.js";
import { findItem } from "../src/janna-item.js";

const names = r => r.results.map(x => x.name || x.title || x.product);
const byUrl = new Map(DATA.f.map(f => ["https://madeinegyptgate.com/" + f[5], f]));
/* the stored words of a row of data.json (f[6]: numbers into fv, fw base-36 characters each) */
const words6 = f => { const o = []; for (const part of String(f[6]).split("|")) for (let j = 0; j + DATA.fw <= part.length; j += DATA.fw) o.push(DATA.fv[parseInt(part.slice(j, j + DATA.fw), 36)]); return o; };
const bagOf = x => { const f = byUrl.get(x.url) || DATA.f.find(r => r[0] === x.name); return f ? " " + words6(f).join(" ") + " " : ""; };
/* the result stores one of these words (a word in any of its forms: «والدرافيل», «للدرافيل» …; a phrase token as it is) */
const holds = (x, ...ks) => { const b = bagOf(x); return ks.some(k => (k.includes("_") ? [k] : variants(k)).some(v => b.includes(" " + v + " "))); };
const ROLLER = ["درفيل", "رولر", "roller", "كسوه_سلندر", "كسوه_درفيل", "تكسي_سلندر", "اسطوان_طباع", "سلندر_طباع", "سلندر_مطابع", "درفيل_كاوتش", "درفيل_طحن"];

describe("stem(): the root stays, ة meets ات, broken plurals (lookup-index)", () => {
  test("«ال» that belongs to the word stays; a suffix never leaves fewer than 4 letters", () => {
    assert.equal(stem("ألبان"), "البان"); assert.equal(stem("الألبان"), "البان"); // was «بان», which sits inside «مباني»
    assert.notEqual(stem("أدوية"), stem("أدوات")); assert.equal(stem("الأدوية"), stem("دواء")); // was «ادو», the start of «ادوات»
    assert.equal(stem("ألواح"), stem("لوح")); assert.equal(stem("ألوان"), "الوان");
    assert.notEqual(stem("غازية"), stem("غاز"), "soft drinks are not gas");
    for (const w of ["اكسجين", "صناعات", "مستلزمات", "طباعة", "صيانة", "خامات", "شركات", "عبوات", "حلويات", "عبايات"]) {
      const s = stem(w); assert.ok(s.length >= 4 || s === norm(w), w + " → " + s);
    }
    assert.equal(stem("الأكسجين"), stem("أكسجين"));
    assert.equal(stem("استيلين"), "استيلين", "acetylene is not «استيل» (steel)");
    assert.equal(stem("تابعلي"), "تابعلي", "a final «ي» stays: it is the «لي» of a request");
  });
  test("the singular ة meets the plural ات, and broken plurals meet their singular", () => {
    assert.equal(stem("اسطوانة"), stem("أسطوانات")); assert.equal(stem("الاسطوانات"), stem("أسطوانة"));
    assert.equal(stem("ماكينة"), stem("ماكينات")); assert.equal(stem("طلمبة"), stem("طلمبات"));
    for (const [p, s] of [["أنابيب", "انبوبة"], ["مواسير", "ماسورة"], ["درافيل", "درفيل"], ["براميل", "برميل"], ["غازات", "غاز"], ["محابس", "محبس"], ["أكياس", "كيس"]])
      assert.equal(stem(p), stem(s), p + " = " + s);
    assert.deepEqual(tokens("البلاستيكية"), tokens("بلاستيكيه"));
  });
});

describe("lookup words: forms, phrases, synonyms (src/lookup-terms.js)", () => {
  test("a word also finds its forms with the article and one attached letter — never a name that only looks like one", () => {
    const v = variants(norm("درافيل"));
    for (const w of ["والدرافيل", "للدرافيل", "بالدرافيل", "ودرافيل"]) assert.ok(v.includes(canon(norm(w))), w);
    assert.ok(variants("خشب").includes(canon("وخشب")), "«وخشب» (and wood)");
    assert.ok(!variants("ليد").includes("وليد"), "LED is not the name «وليد»");
    assert.ok(!variants("امل").includes(canon("كامل")));
  });
  test("a phrase of the groups is one stored token, only where its words stand together", () => {
    assert.ok(phraseTokens("تعبئة اسطوانات البوتاجاز للمنازل").includes("اسطوان_بوتاجاز"));
    assert.ok(phraseTokens("وكسوة السلندرات بالمطاط").includes("كسوه_سلندر"));
    assert.deepEqual(phraseTokens("اسطوانات، غاز"), [], "never across a comma");
  });
  test("a list is read as alternatives, a phrase as one concept; generic words are dropped", () => {
    const a = concepts("سلندرات ودرافيل", k => (k === canon("درافيل") ? 30 : 0));
    assert.equal(a.parts, 2); assert.deepEqual(a.concepts.map(c => c.label), ["سلندرات", "درافيل"]);
    const b = concepts("لمبات ليد"); assert.equal(b.parts, 1); assert.equal(b.concepts.length, 2);
    const c = concepts("تعبئة أسطوانة غاز الأكسجين"); assert.deepEqual(c.concepts.map(x => x.label), ["تعبئه", "اسطوانه غاز", "الاكسجين"]);
    assert.equal(concepts("رولات صناعية").concepts.length, 1, "«صناعية» says nothing about what is made");
    assert.ok(concepts("سلندر").concepts[0].amb, "«سلندر» has several meanings");
    const en = concepts("rollers").concepts[0].alts.filter(x => x.tier === 1).map(x => x.key);
    assert.ok(en.includes(canon("درافيل")), "English → Arabic");
  });
  test("data.json f[6] was built with this lookup-terms.js (rebuild: node worker/build-index.js)", () => {
    assert.equal(DATA.lk, lookupVersion());
    assert.ok(DATA.f.every(f => typeof f[6] === "string" && new RegExp("^([0-9a-z]{" + DATA.fw + "})*\\|([0-9a-z]{" + DATA.fw + "})*$").test(f[6])));
    assert.ok(DATA.f.filter(f => f[6].split("|")[1]).length > 2800, "the descriptions are indexed");
    assert.ok(DATA.f.every(f => words6(f).every(Boolean)), "every number is a word of fv");
  });
  test("no contact ever enters the index: no digit run, e-mail or link in the stored words", () => {
    for (const k of DATA.fv) assert.ok(!/\d{4,}|@|https?|www|\.com/.test(k), k);
  });
});

describe("janna_lookup on the real directory (the investigation's queries)", () => {
  test("«أكسجين» in القليوبية: شركة البروي وشركاه and جودكو first (their descriptions say it; 0 results before)", () => {
    const r = search("factories", "أكسجين", "القليوبية");
    assert.ok(r.count_all >= 2);
    const t = names(r).slice(0, 3);
    assert.ok(t.includes("شركة البروي وشركاه") && t.includes("شركة جودكو للصناعات الهندسية والغازات"), t.join(" | "));
    for (const x of r.results) assert.match(x.location, /القليوبية|العبور|شبرا/);
    /* session 28234ed8: «تعبئة أسطوانة غاز الأكسجين» near Shubra El-Kheima — no company holds every word; the two oxygen suppliers lead */
    const s = search("suppliers", "تعبئة أسطوانة غاز الأكسجين", "القليوبية");
    assert.equal(s.count_all, 0); assert.match(s.text, /^مفيش نتيجة في دليل المنصة فيها كل كلمات البحث/);
    assert.deepEqual(names(s).slice(0, 2).sort(), ["شركة البروي وشركاه", "شركة جودكو للصناعات الهندسية والغازات"].sort());
    assert.deepEqual(s.results[0].matched, ["الأكسجين"]); assert.equal(s.results[0].match, "partial");
  });
  test("«سلندرات» / «درافيل» / «تكسية كاوتش» / 'rollers': roller and cylinder companies; «سلندرات» alone says it has several meanings", () => {
    const d = search("factories", "درافيل", "", 10);
    assert.ok(d.count >= 10, String(d.count));
    for (const x of d.results) assert.ok(holds(x, ...ROLLER), x.name);
    const s = search("factories", "سلندرات", "", 10);
    assert.ok(s.count >= 10); for (const x of s.results) assert.ok(holds(x, "سلندر"), x.name);
    assert.ok(s.ambiguous && /أسطوانات غاز/.test(s.ambiguous.meanings) && /درافيل/.test(s.ambiguous.meanings));
    assert.match(s.text, /ليها أكتر من معنى/); assert.match(s.text, /اسألي العميل سؤال واحد/);
    assert.doesNotMatch(d.text, /أكتر من معنى/, "«درافيل» is not ambiguous");
    const both = search("factories", "سلندرات ودرافيل", "", 10); // Al-Atlal turn 5 (0 results before)
    assert.equal(both.count_all, both.count); assert.ok(names(both).includes("شركة رانيوكار مصر لصناعة وتجارة الكاوتشوك"), "rubber covering of printing rollers");
    const k = search("factories", "تكسية كاوتش", "", 10); // Al-Atlal turn 9: rubber covering, not tyre makers
    for (const x of k.results) assert.ok(holds(x, ...ROLLER, "تكسي_كاوتش"), x.name);
    const en = search("factories", "rollers", "", 10);
    assert.equal(en.count, d.count, "English finds the same companies"); assert.ok(names(en).filter(n => names(d).includes(n)).length >= 8);
  });
  test("«اسطوانة» meets «أسطوانات» (0 results before), «انبوبة» meets «أنابيب»", () => {
    const a = search("factories", "اسطوانة", "", 10), b = search("factories", "أسطوانات", "", 10);
    assert.ok(a.count > 10); assert.equal(a.count, b.count); assert.deepEqual(names(a), names(b));
    assert.ok(names(a).includes("شركة جاز مان لتعبئة اسطوانات البوتاجاز"));
    assert.equal(search("factories", "انبوبة").count, search("factories", "أنابيب").count);
  });
  test("whole words only: no «knowLEDge» for LED, no «أدوات» for «أدوية», no «مباني» for «ألبان», no «زيتي» for «زيت»", () => {
    const led = search("factories", "LED", "", 10);
    assert.ok(!names(led).includes("Knowledge Bridge Solutions"));
    for (const x of led.results) assert.ok(holds(x, "ليد", "led"), x.name);
    const ph = search("factories", "أدوية", "", 10);
    assert.ok(ph.count > 50); assert.ok(!names(ph).includes("مصنع المصريه لمعدات صيد الاسماك"), "a fishing-gear maker");
    for (const x of ph.results) assert.equal(x.match, "all");
    const al = search("factories", "ألبان", "", 10);
    for (const n of ["مصنع مان كرو للمباني", "سان جوبان للزجاج مصر"]) assert.ok(!names(al).includes(n), n);
    assert.ok(names(al).includes("Lacto Misr"));
    assert.equal(search("offers", "زيت").count, 0, "«جاكيت … زيتي» is an olive-green jacket");
    assert.equal(search("factories", "air compressors", "", 10).results.filter(x => /Woodek/.test(x.name)).length, 0, "not «chAIR»");
  });
  test("Al-Atlal's customers: «ورق» / «كرتون» in الجيزة return paper and carton companies first", () => {
    for (const [q, k] of [["ورق", "ورق"], ["كرتون", "كرتون"]]) {
      const r = search("factories", q, "الجيزة", 10);
      assert.ok(r.count >= 10, q + " " + r.count);
      for (const x of r.results) { assert.match(x.location, /الجيزة|أكتوبر|اكتوبر|الشيخ زايد|ابو رواش|أبو رواش/, x.name); assert.equal(x.match, "all"); }
      for (const x of r.results.slice(0, 5)) assert.ok(holds(x, k, canon("الورق"), canon("كراتين")) || norm(x.name + " " + x.products).includes(k), q + ": " + x.name);
    }
  });
  test("English and French words find the Arabic data (gas cylinders, valves, CNG, acier)", () => {
    const g = search("factories", "gas cylinders", "", 10);
    assert.ok(g.count >= 10 && names(g).includes("شركة جاز مان لتعبئة اسطوانات البوتاجاز"));
    const v = search("factories", "valves", "", 10); assert.ok(v.count > 20);
    for (const x of v.results) assert.ok(holds(x, ...variants("صمامات"), ...variants("محابس"), ...variants("بلوف"), "valve"), x.name);
    assert.deepEqual(names(search("factories", "CNG")).sort(), ["شركة الغاز الطبيعي للسيارات (كار جاس)", "شركة ماستر جاس"].sort());
    assert.ok(search("factories", "acier").count > 50);
  });
  test("the honest count: how many hold every word, and when the results are only partial", () => {
    const p = search("factories", "مواسير بلاستيك", "", 10);
    assert.ok(p.count_all > 20 && p.count >= p.count_all && p.partial === (p.count > p.count_all));
    assert.match(p.text, new RegExp("عدد النتائج اللي فيها كل كلمات البحث \\(«مواسير بلاستيك»\\) في دليل المنصة: " + p.count_all));
    for (const x of p.results) { assert.equal(x.match, "all"); assert.equal(x.matched, undefined); }
    const l = search("factories", "لمبات ليد");
    assert.equal(l.count_all, 0); assert.equal(l.partial, true);
    assert.match(l.text, /^مفيش نتيجة في دليل المنصة فيها كل كلمات البحث \(«لمبات ليد»\)؛ أقرب النتائج: \d+ نتيجة فيها جزء من الكلمات بس/);
    assert.match(l.text, /قوليها على إنها أقرب نتايج، مش مطابقة/);
    for (const x of l.results) { assert.equal(x.match, "partial"); assert.ok(x.matched.length > 0); }
    /* a word no company holds at all, with a specific one it does («شريط حرف» edge tape + upholstery): the upholstery suppliers, said as partial */
    const u = search("factories", "شريط حرف التنجيد");
    assert.equal(u.count_all, 0); assert.ok(u.count > 0); for (const x of u.results) assert.deepEqual(x.matched, ["التنجيد"]);
    /* the old substring count «اسطوانات غاز» 209 (1 with both words): now every result holds the phrase */
    const c = search("factories", "اسطوانات غاز", "", 10);
    assert.equal(c.count, c.count_all); assert.ok(c.count >= 10 && c.count < 60, String(c.count));
  });
  test("tenders: the category still counts (Taiba first for «حديد»); a phrase with no tender says so; a generic word alone returns nothing", () => {
    const t = search("tenders", "حديد", "", 10, 1, "local");
    assert.equal(t.results[0].id, "eg-tnd-003"); assert.equal(t.count, t.count_all);
    const r = search("tenders", "أسياخ حديد"); // session 685cdbfb: 16 of 17 were undated rows that matched only the category
    assert.equal(r.count_all, 0); assert.ok(r.results.every(x => x.match === "related")); assert.match(r.text, /من نفس المجال بكلمات قريبة/);
    assert.equal(search("tenders", "الأعشاب الطبية").count, 0, "session 216f67f3: no tender is about herbs; «الطبية» alone is not a match");
  });
  test("places are whole words: «قناطر» is not قنا, «السويسرية» is not السويس", () => {
    assert.equal(search("factories", "قناطر").governorate, null);
    assert.equal(search("factories", "مصنع منتجات السويسرية").governorate, null);
    assert.equal(search("factories", "بلاستيك في قنا").governorate, "قنا");
    assert.equal(search("factories", "بلاستيك بالإسكندرية").governorate, "الإسكندرية");
  });
  test("the response shape is the old one plus count_all / partial / ambiguous and each result's match / matched", async () => {
    const r = await (await worker.fetch(new Request("https://madeinegyptgate.com/api/janna/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "factories", query: "سلندرات" }) }), {}, {})).json();
    for (const k of ["section", "query", "count", "count_all", "partial", "ambiguous", "page", "pages", "has_more", "results", "text"]) assert.ok(k in r, k);
    for (const x of r.results) for (const k of ["name", "type", "activity", "location", "products", "id", "open_url", "match"]) assert.ok(k in x, k);
    const g = search("factories", "", "القليوبية"); // no word: every company of the governorate, as before
    assert.equal(g.count, g.count_all); assert.match(g.text, /^عدد النتائج في دليل المنصة: \d+\. أهمها/); assert.equal(g.results[0].match, undefined);
  });
  test("speed: 20 real queries on the full index, each well under 50 ms once the index is built", () => {
    search("factories", "حديد", ""); search("tenders", "حديد", ""); // the first call builds the lists' indexes (once per isolate)
    const Q = [["suppliers", "تعبئة أسطوانة غاز الأكسجين", "القليوبية"], ["factories", "سلندرات ودرافيل"], ["factories", "رولات صناعية"], ["factories", "صيانة الدرافيل"],
      ["factories", "تكسية كاوتش"], ["factories", "اسطوانات غاز"], ["factories", "الغازات الصناعية"], ["factories", "غازات طبية"], ["factories", "لمبات ليد"],
      ["factories", "أكسجين", "القليوبية"], ["factories", "أدوية"], ["factories", "ألبان"], ["factories", "ألواح شمسية"], ["factories", "air compressors"],
      ["factories", "gas cylinders"], ["factories", "عبايات حريمي"], ["factories", "مواسير بلاستيك"], ["factories", "ورق", "الجيزة"], ["tenders", "أسياخ حديد"], ["tenders", "مواد تنظيف"]];
    let worst = 0;
    for (const [s, q, g] of Q) { const t0 = performance.now(); search(s, q, g || "", 10, 1); worst = Math.max(worst, performance.now() - t0); }
    assert.ok(worst < 50, "slowest query " + worst.toFixed(1) + " ms");
  });
});

describe("platform_item for a company: what it makes, and the team's verified mark", () => {
  test("the spoken text carries a short summary of the description (no contacts)", () => {
    const b = findItem("factories", { id: "406" });
    assert.match(b.text, /وحسب نبذته على المنصة: .*الغازات الطبية والصناعية/); assert.ok(b.text.length < 600);
    assert.doesNotMatch(b.text, /\d{7,}|@/);
    const j = findItem("factories", { id: "2886" }); assert.match(j.text, /صمامات اكسجين/);
  });
  test("the 91 companies of data/factories.js are verified («✓ موثّق من فريق المنصة»), as the site badges them", () => {
    const v = Object.entries(ITEMS.f).filter(([, x]) => x[1]);
    assert.ok(v.length >= 91 && v.length < 120, String(v.length));
    const juhayna = findItem("factories", { title: "جهينة للصناعات الغذائية" });
    assert.equal(juhayna.verified, true); assert.match(juhayna.text, /المنشأة موثّقة من فريق المنصة/);
    assert.equal(findItem("factories", { id: "406" }).verified, undefined, "an imported listing is not");
    const l = search("factories", "جهينة"); assert.ok(l.results.some(x => x.verified === true));
  });
});
