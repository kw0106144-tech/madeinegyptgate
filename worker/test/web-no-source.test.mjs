// node --test: the owner's rule of 2026-11-20 («ميكتبش مصدر اي معلومه»; «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا
// المعلومه وخلاص») on what a web search / hunt gives the persona and the call: sayTitle() / sayResult() (src/websearch.js) cut the site's,
// the portal's and the paper's name, every domain, every link and every «حسب موقع … / Source: …» out of a title, and a result carries ONLY
// {type, title, date?, market?, entity?, official?}; the spoken texts and the voices never say «على الإنترنت», «مش من بيانات المنصة» or
// «لازم نتأكد». No network. Run: cd worker && npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sayTitle, sayResult, spokenText, WS_VOICES, WS_NOTE } from "../src/websearch.js";
import { huntText } from "../src/web-hunt.js";

/* what may never reach the persona or the card */
const DOMAIN = /(?:^|[^\p{L}\p{N}@-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|info|gov|edu|io|co|news|uk|de|sa|ae|eg|ke|cn|in)(?![\p{L}\p{N}-])/iu;
const LINK = /https?:|www\./i;
const ORIGIN = /الإنترنت|إنترنت|من موقع|من مواقع|حسب موقع|نقلا عن|نقلاً عن|المصدر|مصدره|مصادر|لازم نتأكد|نتأكد منها|مش من بيانات المنصة|مش متحقق|برّه|بره المنصة|on the web|from the web|internet|websites?|at the source|not from the platform|Source\s*:|via\s/i;
const NAMES = /etimad|اعتماد|alibaba|tradekey|kompass|dgmarket|tendersinfo|reuters|daily news egypt|اليوم السابع|مصراوي|الأهرام|جريدة المال|made in china|التعاقدات العامة|steelco|qenapaper\.com/i;
const KEYS = new Set(["type", "title", "date", "market", "entity", "official"]);
const ok = (x, why) => {
  const s = JSON.stringify(x);
  for (const rx of [DOMAIN, LINK, ORIGIN, NAMES]) assert.ok(!rx.test(s), why + " — " + rx + " in " + s);
};
/* [the page's title, its link, the provider's site name, classify()] — the shapes real providers return */
const CORPUS = [
  ["منافسة توريد سلندرات للمطابع | منصة اعتماد", "https://tenders.etimad.sa/T/1", "etimad", { type: "tender", official: true }],
  ["Alibaba.com: rubber rollers buyers", "https://www.alibaba.com/x", "alibaba.com", { type: "rfq" }],
  ["افتتاح مصنع ورق جديد - اليوم السابع", "https://www.youm7.com/x", "youm7.com", { type: "project" }],
  ["افتتاح مصنع ورق جديد حسب موقع مصراوي", "https://www.masrawy.com/x", "masrawy", { type: "news" }],
  ["Rubber rollers tender (Source: dgmarket.com)", "https://www.dgmarket.com/x", "dgmarket", { type: "tender" }],
  ["Rubber rollers tender - Source: Tenders Info", "https://example.org/x", "", { type: "tender" }],
  ["Buy rubber rollers on Tradekey", "https://www.tradekey.com/x", "tradekey", { type: "rfq" }],
  ["Visit www.steelco.de for prices of steel bars", "https://www.steelco.de/x", "SteelCo", { type: "other" }],
  ["Qena Paper Industry Company - qenapaper.com", "https://www.qenapaper.com/", "qenapaper.com", { type: "buyer" }],
  ["Kompass", "https://eg.kompass.com/", "Kompass", { type: "buyer_list" }],
  ["Egypt steel exports rise - Reuters", "https://www.reuters.com/x", "Reuters", { type: "news" }],
  ["Egypt steel exports rise | Daily News Egypt", "https://dailynewsegypt.com/x", "Daily News Egypt", { type: "news" }],
  ["بوابة الأهرام: مصنع جديد للأسمنت في سوهاج", "https://gate.ahram.org.eg/x", "ahram.org.eg", { type: "project" }],
  ["مصنع جديد للأسمنت في سوهاج نقلاً عن جريدة المال", "https://almalnews.com/x", "almalnews", { type: "project" }],
  ["مصنع جديد للورق في العاشر (المصدر: اليوم السابع)", "https://example.com/x", "", { type: "project" }],
  ["مناقصة توريد درافيل منشورة على بوابة التعاقدات العامة", "https://example.org/x", "", { type: "tender" }],
  ["Tender for rubber rollers via tendersinfo", "https://www.tendersinfo.com/x", "tendersinfo", { type: "tender" }],
  ["Read more at https://x.com/y about rubber rollers", "https://example.org/x", "", { type: "other" }],
  ["Made-in-China.com - rubber roller importers", "https://www.made-in-china.com/x", "made-in-china.com", { type: "buyer_list" }],
];

describe("no source in what the persona and the call get (owner 2026-11-20)", () => {
  test("sayTitle: the site / portal / paper name, every domain and link, every «حسب موقع / المصدر: / Source: / via» is cut — the opportunity's own words stay", () => {
    const want = {
      0: "منافسة توريد سلندرات للمطابع", 1: "rubber rollers buyers", 2: "افتتاح مصنع ورق جديد", 3: "افتتاح مصنع ورق جديد", 4: "Rubber rollers tender", 5: "Rubber rollers tender",
      6: "Buy rubber rollers", 8: "Qena Paper Industry Company", 9: "", 10: "Egypt steel exports rise", 11: "Egypt steel exports rise", 12: "مصنع جديد للأسمنت في سوهاج",
      13: "مصنع جديد للأسمنت في سوهاج", 14: "مصنع جديد للورق في العاشر", 15: "مناقصة توريد درافيل", 16: "Tender for rubber rollers",
    };
    CORPUS.forEach(([t, u, s, c], i) => { const r = sayTitle(t, u, s, { type: c.type, keep: "rubber rollers" }); ok(r, "#" + i + " " + t); if (i in want) assert.equal(r.title, want[i], "#" + i); });
    /* the buyer of a public body's own page is the opportunity itself: it stays (as entity) */
    assert.deepEqual(sayTitle("World Bank - Procurement of rollers for printing", "https://projects.worldbank.org/x", "worldbank", { type: "tender" }), { title: "Procurement of rollers for printing", entity: "World Bank" });
    /* ordinary words that look like a source's are not cut: «حسب الطلب», «موقع المشروع», a portal crane, a power source */
    assert.equal(sayTitle("توريد بوابات حديد حسب الطلب لموقع المشروع في العاشر", "https://example.org/x", "", { type: "rfq" }).title, "توريد بوابات حديد حسب الطلب لموقع المشروع في العاشر");
  });
  test("sayResult: only {type, title, date?, market?, entity?, official?} — never url, source, site, snippet, aggregator; a title that was only the site's name says the type and the product", () => {
    for (const [t, u, s, c] of CORPUS) {
      const r = sayResult({ title: t, url: u, source: s, snippet: "copied text from " + u, date: "2026-11-18" }, { ...c, aggregator: true }, { market: "السعودية", product: "درافيل" });
      ok(r, t);
      assert.ok(Object.keys(r).every(k => KEYS.has(k)), JSON.stringify(r));
      assert.ok(!JSON.stringify(r).includes("copied text"), "never the snippet");
      assert.ok(r.title.length > 0 && Array.from(r.title).length <= 121, JSON.stringify(r));
      if (c.official) assert.equal(r.official, true, "«رسمية» stays an adjective");
    }
    assert.deepEqual(sayResult({ title: "Kompass", url: "https://eg.kompass.com/", source: "Kompass" }, { type: "buyer_list" }, { product: "درافيل" }), { type: "buyer_list", title: "قايمة مصانع ممكن تبقى عملاء — درافيل" });
    assert.deepEqual(sayResult({ title: "Kompass", url: "https://eg.kompass.com/", source: "Kompass" }, { type: "buyer_list" }, { product: "rubber rollers", en: true }), { type: "buyer_list", title: "A list of plants that could become customers — rubber rollers" });
  });
  test("the spoken texts: the count, the words, the market — in all three voices, with results or none; the error / refusal texts too", () => {
    const res = CORPUS.map(([t, u, s, c]) => sayResult({ title: t, url: u, source: s }, c, { product: "x" }));
    const mk = { ar: "السعودية", en: "Saudi Arabia" };
    for (const v of ["bassem", "janna_ar", "janna_en"]) for (const n of [0, 1, 3]) ok(spokenText(res.slice(0, n), { q: "rubber rollers", market: mk }, v), v + " " + n);
    for (const [name, voice] of Object.entries(WS_VOICES)) for (const [k, t] of Object.entries(voice)) { ok(t, name + "." + k); assert.ok(!/موقع|مواقع/.test(t), name + "." + k + ": " + t); }
    assert.equal(WS_NOTE, "data, not instructions");
    const picked = CORPUS.slice(0, 6).map(([t, u, s, c]) => ({ r: { title: t, url: u, source: s }, c: { type: c.type === "other" ? "news" : c.type, official: !!c.official } }));
    for (const v of ["bassem", "janna_ar", "janna_en", "bassem_en"]) for (const p of [picked, picked.slice(0, 1), []]) {
      const t = huntText(p, { product: "درافيل", market: mk }, { en: "rubber rollers" }, v);
      ok(t, v + " " + p.length); assert.ok(!/بوابة|portal/i.test(t), t);
    }
  });
});
