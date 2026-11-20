// node --test for the automatic review of one call (src/calls-review.js — pure rules) on SYNTHETIC conversations (test/calls-fixtures.mjs):
// one shaped like the reviewed call 8bacbfac (invented words, a dummy company), a buyer with an RFQ, noise, the memory join, a meeting
// without recording consent, the transcript / D1-only modes and every phase-1 rule. Nothing real: no transcript, name, phone or e-mail.
// Run: cd worker && npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reviewConversation, memoryJoin, quote, selfDescription, PROMISE_RX, STYLE_TAGS, outcomeKind, flatArgs, relatedClaim, ownPlace, overLimit } from "../src/calls-review.js";
import { turnsFromAnalytics, turnsFromTranscript, missedLines } from "../src/calls-report.js";
import { clean } from "../src/text.js";
import { atlalSession, sid, analytics, sessionDetail, BUYER_TURNS, ATLAL_LIKE } from "./calls-fixtures.mjs";

const T0 = Date.UTC(2026, 10, 20, 9, 17, 53);
const atlal = () => { const s = atlalSession(sid(1), T0); return { agent: "janna", lang: "ar", mode: "anam", startMs: T0, endMs: s.endMs, turns: turnsFromAnalytics(s.an, s.detail), outcome: {}, places: ["السادس من أكتوبر", "الجيزة"] }; };
const flagOf = (r, code) => r.flags.find(f => f.code === code);
const conv = (turns, over = {}) => { const an = analytics(sid(9), T0, turns, { endMs: T0 + 120000 }); return { agent: "janna", lang: "ar", mode: "anam", startMs: T0, endMs: T0 + 120000, turns: turnsFromAnalytics(an, sessionDetail(sid(9), T0, turns)), outcome: {}, ...over }; };

describe("calls-review: the call shaped like 8bacbfac", () => {
  test("«مافادتش» with every flag the spec names, their turns and seconds", () => {
    const r = reviewConversation(atlal());
    assert.equal(r.verdict, "not_useful");
    assert.deepEqual([r.ask, r.seller, r.buyer], ["demand_search", true, false]);
    assert.deepEqual(flagOf(r, "promise_no_tool").turns, [28, 30]);
    assert.deepEqual(flagOf(r, "nudge_after_promise").turns, [29]);
    assert.deepEqual([flagOf(r, "last_user_unanswered").turns, flagOf(r, "last_user_unanswered").s], [[31], 20]);
    assert.ok(flagOf(r, "dissatisfied") && flagOf(r, "dissatisfied").turns.includes(31));
    assert.ok(flagOf(r, "competitor_offered") && flagOf(r, "competitor_offered").turns.includes(16), "he said «منافس»");
    assert.ok(flagOf(r, "competitor_offered").turns.includes(15), "the competitor found by a search for his own product was offered");
    assert.deepEqual([flagOf(r, "zero_results").n, flagOf(r, "zero_results").turns], [3, [5]]);
    assert.deepEqual([flagOf(r, "bad_tag").turns, flagOf(r, "bad_tag").tags], [[27], ["صاف"]]);
    assert.deepEqual([flagOf(r, "long_turn").turns, flagOf(r, "long_turn").secs], [[5, 6, 9, 27], [42, 31, 33, 47]]);
    assert.deepEqual([flagOf(r, "slow_turn").turns, flagOf(r, "slow_turn").secs], [[5, 28], [7.3, 8.2]]);
    assert.deepEqual(flagOf(r, "off_target").turns, [12], "a tender with not one query word in its title called «مرتبطة»");
    assert.ok(flagOf(r, "no_next_step"), "a business ask with no request, meeting, registration, follow or task");
    assert.deepEqual([r.correct, r.wrong], [false, ["off_target", "competitor_offered"]]);
    assert.deepEqual(r.zeroQueries, ["سلندرات ودرافيل"]);
    assert.equal(r.zeroCounts["سلندرات ودرافيل"], 3);
    assert.equal(r.productWords[0], "سلندرات ودرافيل", "his own product, not his customers' industry");
    assert.ok(!flagOf(r, "unverified_claim") && !flagOf(r, "gulf_words") && !flagOf(r, "link_read") && !flagOf(r, "stt_noise"));
  });
  test("every quote is masked and short; the self-description is labelled data, not a link to anyone", () => {
    const r = reviewConversation(atlal());
    for (const f of r.flags) if (f.q) assert.ok(Array.from(f.q).length <= 140, f.code);
    assert.ok(Array.from(r.askQuote).length <= 140 && r.askQuote.includes("بنصنّع"));
    assert.deepEqual([r.self.title, r.self.first, r.self.company, r.self.place], ["مهندس", "سامح", "مصنع النموذج للدرافيل", "السادس من أكتوبر"]);
    assert.ok(r.self.echo.startsWith("حضرتك بتصنّع وتكسي الدرافيل"), "the persona's own echo («فهمت إن …»)");
  });
  test("R5: only 3 s of silence before the end → not flagged; 8 s or more → flagged", () => {
    for (const [gap, want] of [[3000, false], [8000, true]]) {
      const c = atlal(); const last = c.turns[c.turns.length - 1]; last.uEnd = c.endMs - gap; last.uStart = last.uEnd - 2000;
      assert.equal(!!flagOf(reviewConversation(c), "last_user_unanswered"), want, gap + " ms");
    }
  });
  test("R1: a promise whose tool starts in the next persona turn before the caller speaks is no promise without a tool", () => {
    const turns = [{ i: 0, user: "عايز مصنع بلاستيك", persona: "ثواني بدوّر لك.", t: 10 }, { i: 1, persona: "لقيت مصنع تجريبي للبلاستيك.", t: 14, engine: true, tools: [{ name: "janna_lookup", args: { section: "factories", query: "بلاستيك" }, result: { count: 1, results: [{ name: "مصنع تجريبي للبلاستيك" }] } }] }];
    const r = reviewConversation(conv(turns));
    assert.equal(flagOf(r, "promise_no_tool"), undefined);
    assert.ok(PROMISE_RX.test("ثواني بدور") && PROMISE_RX.test("let me check that") && !PROMISE_RX.test("دورت ولقيت"));
  });
});

describe("calls-review: outcomes and verdicts", () => {
  test("a buyer whose RFQ carries the call's session id → «مفيدة» (a concrete answer + an outcome, no flag)", () => {
    const c = conv(BUYER_TURNS, { outcome: { inquiries: [{ kind: "rfq", ref: "MIG-26-TEST01", conf: "sure" }] }, d1Rows: true });
    const r = reviewConversation(c);
    assert.deepEqual([r.verdict, r.ask, r.buyer, r.concrete, r.outcome], ["useful", "supplier_search", true, true, "rfq"]);
    assert.deepEqual(r.flags.map(f => f.code), []);
    assert.equal(r.correct, true);
  });
  test("the same buyer without any request → «جزئياً» with no_next_step; without the persona naming a result → «مافادتش»", () => {
    assert.deepEqual([reviewConversation(conv(BUYER_TURNS)).verdict, flagOf(reviewConversation(conv(BUYER_TURNS)), "no_next_step") ? 1 : 0], ["partial", 1]);
    const vague = BUYER_TURNS.map(t => (t.i === 2 ? { ...t, persona: "فيه موردين كتير، تحب نشوف؟" } : t));
    assert.equal(reviewConversation(conv(vague)).verdict, "not_useful", "a business ask with no concrete answer and no outcome");
  });
  test("short / no ask / a meeting without recording consent (counts only: no quote, no «قالت», no verdict on what was said)", () => {
    assert.equal(reviewConversation({ short: true }).verdict, "short");
    assert.equal(reviewConversation(conv([{ i: 0, persona: "أهلاً بيك!", t: 1, engine: true }, { i: 1, user: "أهلاً", persona: "إزيك؟", t: 5 }])).verdict, "no_ask");
    const r = reviewConversation({ ...conv(BUYER_TURNS), mode: "counts", outcome: { meetings: [{ id: "m1" }] } });
    assert.deepEqual([r.verdict, r.askQuote, r.personaQuote, r.flags.length, r.outcome], ["no_consent", "", "", 0, "meeting"]);
    assert.equal(r.self, null);
  });
  test("outcomeKind: rfq > meeting > registration > follow > profile > task", () => {
    assert.equal(outcomeKind({ inquiries: [{ kind: "signup" }], meetings: [{}] }), "meeting");
    assert.equal(outcomeKind({ inquiries: [{ kind: "signup" }] }), "registration");
    assert.equal(outcomeKind({ follows: 1, tasks: 2 }), "follow");
    assert.equal(outcomeKind({}), "");
  });
});

describe("calls-review: noise, the other rules, the modes", () => {
  test("R15: a phantom subtitle line is left out of the ask and counted with the persona's «ماسمعتش»", () => {
    const turns = [{ i: 0, persona: "أهلاً بيك!", t: 1, engine: true }, { i: 1, user: "اشتركوا في القناة", persona: "معلش ماسمعتش كويس، ممكن تعيد؟", t: 6 },
      { i: 2, user: "أنا محتاج مورد بلاستيك في العاشر", persona: "هدوّر لك.", t: 20, tools: [{ name: "janna_lookup", args: { section: "suppliers", query: "بلاستيك" }, result: { count: 1, results: [{ name: "شركة تجريبية للبلاستيك" }] } }] }];
    const r = reviewConversation(conv(turns));
    assert.equal(r.noise, 2);
    assert.equal(flagOf(r, "stt_noise").n, 2);
    assert.ok(r.askQuote.includes("مورد بلاستيك") && !r.askQuote.includes("القناة"), r.askQuote);
  });
  test("R7 an unverified «اتبعت» (not when a platform row confirms it, not a conditional); R10–R12, R14, R17", () => {
    const turns = [{ i: 0, user: "عايز أسجل", persona: "تمام، الطلب اتبعت خلاص.", t: 5 }, { i: 1, user: "طيب", persona: "لو اتسجلت هتلاقي ملفك ظاهر.", t: 15 },
      { i: 2, user: "فين أحط الإيميل؟ مش لاقي الخانة", persona: "يا هلا، ادخل على www.example.com وهتلاقيها.", t: 30 },
      { i: 3, user: "تمام", persona: "النتيجة undefined دلوقتي", t: 45, tools: [{ name: "janna_lookup", status: "failed", args: { section: "factories", query: "حديد" }, error: "timeout" }] },
      { i: 4, user: "ممم", persona: "هبعت ده تاني", t: 60, tools: [{ name: "platform_item", args: { section: "factories", id: "12" }, result: { found: false, text: "مش لاقي" } }] }];
    const r = reviewConversation(conv(turns));
    assert.deepEqual(flagOf(r, "unverified_claim").turns, [0], "«لو اتسجلت» is a condition, not a claim");
    assert.deepEqual(flagOf(r, "ui_trouble").turns, [2]);
    assert.deepEqual(flagOf(r, "gulf_words").turns, [2]);
    assert.deepEqual(flagOf(r, "link_read").turns, [2]);
    assert.deepEqual(flagOf(r, "foreign_script").turns, [3]);
    assert.deepEqual(flagOf(r, "tool_failed").turns, [3]);
    assert.deepEqual(flagOf(r, "zero_results").turns, [4], "platform_item found:false");
    assert.equal(flagOf(reviewConversation({ ...conv(turns), d1Rows: true }), "unverified_claim"), undefined, "a platform row confirms it");
  });
  test("transcript only (analytics not ready): no promise / slow / tool rules — they are «مش متاح»", () => {
    const msgs = [{ role: "persona", message: "أهلاً!", timestamp: new Date(T0).toISOString(), speakingDurationSeconds: 2 },
      { role: "user", message: "عايز مصنع رخام", timestamp: new Date(T0 + 10000).toISOString() }, { role: "persona", message: "ثواني بدوّر لك.", timestamp: new Date(T0 + 12000).toISOString(), speakingDurationSeconds: 35 }];
    const r = reviewConversation({ agent: "janna", mode: "transcript", startMs: T0, endMs: T0 + 30000, turns: turnsFromTranscript(msgs), outcome: {} });
    assert.equal(flagOf(r, "promise_no_tool"), undefined);
    assert.ok(r.na.includes("promise_no_tool") && r.na.includes("slow_turn") && r.na.includes("zero_results"));
    assert.deepEqual(flagOf(r, "long_turn").turns, [1], "the transcript has each reply's speaking time");
  });
  test("D1 only (Anam not readable): the memory's searches still give zero results; timing rules are «مش متاح»", () => {
    const r = reviewConversation({ agent: "bassem", mode: "d1", startMs: T0, endMs: T0 + 60000, outcome: {},
      turns: [{ i: 0, user: "عايز مناقصات حديد في كينيا", persona: "", tools: [] }, { i: 1, user: "", persona: "ثواني بدوّر", tools: [] }],
      searches: [{ tool: "bassem_intel", query: "حديد كينيا", count: 0, titles: [] }] });
    assert.ok(flagOf(r, "zero_results"));
    assert.equal(flagOf(r, "promise_no_tool"), undefined);
    assert.ok(r.na.includes("promise_no_tool") && r.na.includes("long_turn") && r.na.includes("last_user_unanswered"));
  });
  test("the 12 style cues are no bad tag; anything else in brackets is", () => {
    assert.equal(STYLE_TAGS.length, 12);
    const turns = [{ i: 0, user: "سلام", persona: "[warm] أهلاً بيك [laughter] [neutral] نوّرت", t: 2 }, { i: 1, user: "إزيك", persona: "[whispers] تمام [صاف]", t: 9 }];
    assert.deepEqual(flagOf(reviewConversation(conv(turns)), "bad_tag").tags, ["whispers", "صاف"]);
  });
});

describe("calls-review: masking and the memory join", () => {
  test("quotes mask written / spoken e-mails and phone numbers and show links as their domain", () => {
    const q = quote("رقمي 01012345678 وإيميلي test.person@example.com وده اللينك https://www.example.org/page?id=7 كمان");
    assert.ok(!/0101234|@example\.com|https?:/.test(q), q);
    assert.ok(q.includes("رقم محجوب") && q.includes("إيميل محجوب") && q.includes("لينك example.org"), q);
    assert.ok(Array.from(quote("ا".repeat(400))).length <= 140);
  });
  test("3 equal caller turns → «غالباً» (likely); one long one → «مش متأكد»; none → nothing; short greetings never count", () => {
    const mine = ["عايز أعرف أسعار الباقات بتاعتكم", "إحنا مصنع بلاستيك في العاشر من رمضان", "محتاج طلبات أسعار لمنتجاتنا", "أيوه", "تمام"];
    const rows = [...mine.slice(0, 3).map(t => ({ subject: "v:" + "b".repeat(32), text: clean(t, 600) })), { subject: "v:" + "c".repeat(32), text: "أيوه" }, { subject: "v:" + "c".repeat(32), text: "تمام" }];
    assert.deepEqual(memoryJoin(mine, rows, t => clean(t, 600)), { subject: "v:" + "b".repeat(32), confidence: "likely" });
    assert.deepEqual(memoryJoin(mine, [{ subject: "m1", text: mine[1] }], t => clean(t, 600)), { subject: "m1", confidence: "unsure" });
    assert.equal(memoryJoin(mine, [{ subject: "m2", text: "أيوه" }, { subject: "m2", text: "تمام" }], t => clean(t, 600)), null, "short words prove nothing");
    assert.equal(memoryJoin(mine, [], t => t), null);
  });
  test("selfDescription: «معاك …», a company after «من», a typed Latin brand, typed links as their domain", () => {
    const s = selfDescription([{ user: "معاك أحمد من شركة الاختبار للصناعات الثقيلة وعايز أعرف" }, { user: "موقعنا https://brand-test.example/about وإحنا Testco Industries" }], ["الجيزة"]);
    assert.deepEqual([s.first, s.company, s.links], ["أحمد", "شركة الاختبار للصناعات الثقيلة", ["brand-test.example"]]);
    const b = selfDescription([{ user: "انا مستفدتش حاجة" }], []);
    assert.equal(b.first, "", "«أنا مستفدتش» is no name");
  });
});

/* review 2026-11-20: false alarms that rated a good call «مافادتش» or said «فيه غلط» (synthetic calls) */
describe("calls-review: no false alarm on a good call", () => {
  const lk = (query, section, names) => ({ name: "janna_lookup", args: { section, query }, result: { count: names.length, results: names.map(n => ({ name: n })) } });
  test("R1: «ثواني» before an answer given at once is no promise without a tool; a bare short stall still is", () => {
    const plan = [{ i: 0, persona: "أهلاً بيك! أنا جنة.", t: 1, engine: true },
      { i: 1, user: "الباقات بتاعتكم بكام؟", persona: "ثواني أقولك: الباقة الأساسية بأربعة آلاف جنيه في السنة، والشريك الأساسي بعشرة آلاف، وكلها زائد الضريبة.", t: 10, speak: 9 },
      { i: 2, user: "تمام متشكر", persona: "العفو، أي خدمة!", t: 30 }];
    const r = reviewConversation(conv(plan));
    assert.deepEqual([r.verdict, r.ask, flagOf(r, "promise_no_tool")], ["useful", "platform_question", undefined]);
    const stall = [{ i: 0, persona: "أهلاً بيك!", t: 1, engine: true }, { i: 1, user: "عايز مصنع رخام", persona: "ثواني يا فندم.", t: 10 }, { i: 2, user: "لسه؟", persona: "معلش، مفيش نتايج دلوقتي.", t: 40 }];
    assert.deepEqual(flagOf(reviewConversation(conv(stall)), "promise_no_tool").turns, [1]);
  });
  test("R5: a goodbye the caller closed the call after is no question left without an answer", () => {
    const bye = [...BUYER_TURNS.slice(0, 4), { i: 4, user: "شكراً يا جنة، مع السلامة", t: 80 }];
    const r = reviewConversation(conv(bye, { outcome: { inquiries: [{ kind: "rfq", ref: "MIG-26-TEST02", conf: "sure" }] }, d1Rows: true }));
    assert.deepEqual([r.verdict, flagOf(r, "last_user_unanswered")], ["useful", undefined]);
    const q = [...BUYER_TURNS.slice(0, 4), { i: 4, user: "طيب والأسعار بتاعتهم كام؟", t: 80 }];
    assert.ok(flagOf(reviewConversation(conv(q, { outcome: { inquiries: [{ kind: "rfq", ref: "MIG-26-TEST03", conf: "sure" }] }, d1Rows: true })), "last_user_unanswered"), "a question still counts");
  });
  test("a company that says what it IS («إحنا شركة مقاولات») and wants to buy is a buyer: no «عرضت على البايع منافسينه»", () => {
    const turns = [{ i: 0, persona: "أهلاً بيك! أنا جنة.", t: 1, engine: true },
      { i: 1, user: "إحنا شركة مقاولات ومحتاجين مورد حديد تسليح", persona: "تمام، هدوّر لك على موردين.", t: 10, tools: [lk("حديد تسليح", "suppliers", ["مصنع التجربة لحديد التسليح"])] },
      { i: 2, user: "ماشي", persona: "لقيت مصنع التجربة لحديد التسليح، تحب أفتحلك ملفه؟", t: 30 }];
    const r = reviewConversation(conv(turns));
    assert.deepEqual([r.seller, r.buyer, r.ask, r.correct, flagOf(r, "competitor_offered")], [false, true, "supplier_search", true, undefined]);
    const seller = [{ i: 0, persona: "أهلاً!", t: 1, engine: true }, { i: 1, user: "إحنا مصنع حديد وعايزين عملاء جداد", persona: "تمام.", t: 10 }];
    assert.deepEqual([reviewConversation(conv(seller)).seller, reviewConversation(conv(seller)).ask], [true, "demand_search"], "a wish to sell keeps him a seller");
  });
  test("R7: a question about registering («هل حضرتك اتسجلت قبل كده؟ لو لأ …») is no claim; a claim in the next sentence still is", () => {
    const ask = [{ i: 0, persona: "أهلاً!", t: 1, engine: true }, { i: 1, user: "عايز أعرف التسجيل بيتعمل إزاي", persona: "هل حضرتك اتسجلت قبل كده؟ لو لأ أقدر أفتحلك صفحة التسجيل دلوقتي", t: 10, speak: 6 }];
    assert.equal(flagOf(reviewConversation(conv(ask)), "unverified_claim"), undefined);
    const both = [{ i: 0, persona: "أهلاً!", t: 1, engine: true }, { i: 1, user: "عايز أسجل", persona: "هل جربت قبل كده؟ تمام، طلبك اتبعت خلاص.", t: 10 }];
    assert.deepEqual(flagOf(reviewConversation(conv(both)), "unverified_claim").turns, [1]);
  });
  test("the place is a whole word: «مطروحة» is no Matrouh, «بدري» no Badr; «بالقاهرة» is Cairo", () => {
    const P = ["القاهرة", "مطروح", "بدر"], pl = u => selfDescription([{ i: 0, user: u }], P).place;
    assert.deepEqual([pl("المناقصة مطروحة من أسبوع"), pl("وصلنا بدري"), pl("مصنعنا بالقاهرة"), pl("إحنا في مطروح")], ["", "", "القاهرة", "مطروح"]);
  });
});

describe("calls-review: a concrete answer names a result", () => {
  const lk = (query, names) => ({ name: "janna_lookup", args: { section: "suppliers", query }, result: { count: names.length, results: names.map(n => ({ name: n })) } });
  const call = (ask, title, said) => conv([{ i: 0, persona: "أهلاً بيك! أنا جنة.", t: 1, engine: true }, { i: 1, user: ask, persona: "تمام، هدوّر لك.", t: 10, tools: [lk("علب كرتون", [title])] },
    { i: 2, user: "تمام", persona: said, t: 25 }, { i: 3, user: "لا متشكر", persona: "العفو!", t: 40 }]);
  test("«شركة الأمل» said word for word and «مصنع النموذج» for «مصنع النموذج للتغليف» are concrete («جزئياً» without a next step, not «مافادتش»)", () => {
    for (const [title, said] of [["شركة الأمل", "لقيت شركة الأمل، تحب أبعتلها طلب؟"], ["مصنع النموذج للتغليف", "لقيت مصنع النموذج، تحب أبعتله طلب؟"]]) {
      const r = reviewConversation(call("أنا محتاج مورد علب كرتون", title, said));
      assert.deepEqual([r.concrete, r.verdict], [true, "partial"], title);
    }
  });
  test("an echo of the caller's own request («مصنع حديد» for «عايز مصنع حديد تسليح») is still no concrete answer", () => {
    const r = reviewConversation(conv([{ i: 0, persona: "أهلاً!", t: 1, engine: true },
      { i: 1, user: "عايز مصنع حديد تسليح", persona: "تمام، بدور على مصنع حديد دلوقتي.", t: 10, tools: [lk("حديد تسليح", ["مصنع حديد تسليح المتحدة"])] },
      { i: 2, user: "ها؟", persona: "فيه نتايج كتير، تحب نشوف؟", t: 25 }]));
    assert.deepEqual([r.concrete, r.verdict], [false, "not_useful"]);
  });
});

/* report review 2026-11-20: the preview of the e-mail on the REAL calls of that day found 14 defects. These cases are SYNTHETIC — invented
   companies, names and products — in the shapes Anam really sends (a webhook tool's arguments nested as {bodyParams}, a client tool's
   flat with no result: calls-fixtures.mjs sessionDetail) and in phrasings like the callers' (Egyptian Arabic, misheard speech, mixed
   scripts). None of them holds a real call's text, name, phone or e-mail. */
describe("calls-review: the real-call preview of 2026-11-20 (synthetic, real-shaped)", () => {
  const plain = t => String(t).replace(/[\uE000\uE001]/g, "");
  const lk = (query, section, names, extra = {}) => ({ name: "janna_lookup", args: { section, query, ...extra }, result: { section, query, count: names.length, results: names.map(n => ({ name: n })), text: names.length ? "x" : "لا توجد نتائج مطابقة في دليل المنصة لهذا البحث." } });
  const echo = (query, section) => ({ name: "janna_search", args: { section, query } }); // the screen echo: a client tool, no result
  const hi = { i: 0, persona: "أهلاً بيك في منصة صنع في مصر! أنا جنة.", t: 1, engine: true };

  test("#1 a webhook tool's arguments arrive nested as {bodyParams}: the query and section are read (zero results, «مش مطابقة», off-target)", () => {
    const turns = [hi, { i: 1, user: "إحنا مصنع بنصنّع بكر بلاستيك للمطابع", persona: "لقيت مناقصة مرتبطة بشغلك في المناقصات.", t: 12,
      tools: [lk("بكر بلاستيك", "rfqs", []), echo("بكر بلاستيك", "rfqs"), lk("بكر بلاستيك", "tenders", ["توريد أبواب صاج لمخزن تجريبي"]), echo("بكر بلاستيك", "tenders")] }];
    const d = sessionDetail(sid(31), T0, turns);
    assert.deepEqual([d.toolCalls[0].toolType, d.toolCalls[0].arguments], ["server", { bodyParams: { section: "rfqs", query: "بكر بلاستيك" } }], "the fixture sends Anam's real shape");
    assert.deepEqual([d.toolCalls[1].toolType, d.toolCalls[1].arguments, d.toolCalls[1].result], ["client", { section: "rfqs", query: "بكر بلاستيك" }, null], "a client tool: flat, no result");
    const c = conv(turns), r = reviewConversation(c);
    assert.deepEqual(c.turns[1].tools[0].args, { section: "rfqs", query: "بكر بلاستيك" }, "turnsFromAnalytics flattens it");
    assert.deepEqual(r.zeroQueries, ["بكر بلاستيك"]);
    assert.deepEqual(r.zeroSearches.map(z => [z.query, z.section, z.tool]), [["بكر بلاستيك", "rfqs", "janna_lookup"]]);
    assert.ok(r.searches.some(x => x.section === "tenders" && x.off), "the tender with none of the query's words is «مش مطابقة»");
    assert.deepEqual(flagOf(r, "off_target").turns, [1]);
    assert.deepEqual([r.searchCount, r.zeroCount], [2, 1], "two lookups; the two screen echoes are no searches");
    const raw = reviewConversation({ agent: "janna", mode: "anam", startMs: T0, endMs: T0 + 60000, outcome: {}, // nested arguments straight into the review
      turns: [{ i: 1, user: "دوري على بكر", persona: "مفيش.", tools: [{ name: "janna_lookup", status: "completed", args: { bodyParams: { query: "بكر", section: "products" } }, result: JSON.stringify({ count: 0, results: [] }) }] }] });
    assert.deepEqual(raw.zeroSearches.map(z => [z.query, z.section]), [["بكر", "products"]]);
    assert.deepEqual(flatArgs({ bodyParams: { query: "x" }, queryParams: { lang: "ar" }, headers: { "X-Key": "k" } }), { query: "x", lang: "ar" }, "headers are never read");
    assert.deepEqual([flatArgs('{"bodyParams":{"query":"y"}}'), flatArgs(null), flatArgs("nope"), flatArgs({ page: "intl" })], [{ query: "y" }, null, null, { page: "intl" }]);
  });

  test("#2 a seller in the words callers use: the factory «هو اللي بيصنع», work «كمصنع», export, «مش عارف أبيع» — not a buyer's «المصنع اللي بيصنع…»", () => {
    const one = u => reviewConversation(conv([hi, { i: 1, user: u, persona: "تمام، فهمت حضرتك.", t: 10 }]));
    for (const u of ["مصنع النموذج للبكر موجودين في العاشر من رمضان، المصنع هو اللي بيصنع البكر بكل المقاسات وبيعمل لها صيانة",
      "أنا عايزك تجيبلي فرص حقيقية ليا كمصنع", "إحنا بنصدّر أعشاب مجففة ومحتاج أوصل منتجاتي للأسواق برّه", "أنا محتاج أوصل للتصدير", "المصنع عندي واقف ومش عارف أبيع ولا أجيب عملا",
      "مصنعنا بيصنّع علب كرتون مطبوعة", "عايزين نسوّق منتجاتنا في الخليج", "شركتنا بتورّد خامات تغليف للمصانع", "عندي مصنع بكر في العاشر"]) {
      const r = one(u);
      assert.deepEqual([r.seller, r.buyer, r.ask], [true, false, "demand_search"], u);
    }
    for (const [u, ask] of [["فين المصنع اللي بيصنع الأكياس دي؟", "none"], ["عايز أسعار منافسة لحديد التسليح", "none"], ["أنا محتاج مورد أكياس ورق", "supplier_search"], ["عندي مصنع ومحتاج مورد خامات بلاستيك", "supplier_search"]]) {
      const r = one(u);
      assert.deepEqual([r.seller, r.ask], [false, ask], u);
    }
  });

  test("#2 «ده مصنع منافس ليا» makes him a seller: the competitor rule runs, and «كان ممكن» has the seller's lines", () => {
    const turns = [hi, { i: 1, user: "أنا بشتغل في البكر", persona: "تمام، بدوّرلك.", t: 10, tools: [lk("بكر", "factories", ["مصنع التجربة للبكر"]), echo("بكر", "factories")] },
      { i: 2, user: "طيب", persona: "لقيت مصنع التجربة للبكر، تحب أوريك تفاصيله؟", t: 25 },
      { i: 3, user: "ده مصنع منافس ليا", persona: "حقك عليّا، خليني أدوّر بطريقة تانية.", t: 40 }];
    const r = reviewConversation(conv(turns));
    assert.deepEqual([r.seller, r.ask, r.askTurn], [true, "demand_search", 3]);
    assert.deepEqual(flagOf(r, "competitor_offered").turns, [2, 3], "offered (named + an offer) and said «منافس»");
    assert.deepEqual(r.wrong, ["competitor_offered"]);
    const seen = [], lines = missedLines({ agent: "janna", review: r }, { search: (sec, q) => { seen.push(sec); return { count: sec === "rfqs" ? 2 : 0, results: sec === "tenders" ? [{ status: "سارية", title: "توريد بكر لمطبعة تجريبية" }] : [] }; } }, T0, () => true).map(l => plain(l.ar));
    assert.ok(lines.includes("النهارده الصبح على المنصة لـ «بكر»: مناقصات سارية ١، طلبات أسعار ٢"), JSON.stringify(lines));
    assert.ok(lines.includes("ماعرضتش عليه ملف بخدماته في الدليل"), "a seller never offered a profile");
    assert.ok(seen.includes("tenders") && seen.includes("rfqs"));
  });

  test("#3 «مش مطابقة …، فمش هاعتبرها فرصة مناسبة» and «بدوّرلك على فرص مناسبة» are no off-target claim (no «فيه غلط»); «لقيت مناقصة مرتبطة بشغلك» still is", () => {
    const call = persona => conv([hi, { i: 1, user: "إحنا مصنع بنصنّع بكر للمطابع وعايزين شغل", persona, t: 10, tools: [lk("بكر مطابع", "tenders", ["صيانة أبواب رولر لمبنى تجريبي"])] }]);
    for (const p of ["لقيت مناقصة عن صيانة أبواب رولر، بس مش مطابقة لمنتج مصنعكم، فمش هاعتبرها فرصة مناسبة.", "ثواني، بدوّرلك على فرص مرتبطة بنشاطك. لقيت مناقصة واحدة بس مش هي اللي محتاجها.",
      "النتيجة اللي ظهرت مش مرتبطة بالبكر ولا مناسبة لمصنعكم.", "The tender I found is not relevant to your rollers."]) {
      const r = reviewConversation(call(p));
      assert.deepEqual([flagOf(r, "off_target"), r.correct], [undefined, true], p);
    }
    assert.deepEqual(flagOf(reviewConversation(call("لقيت مناقصة مرتبطة بشغلك: صيانة أبواب رولر.")), "off_target").turns, [1]);
    assert.ok(relatedClaim("دي ليها علاقة بشغلك") && !relatedClaim("دي مالهاش علاقة بشغلك") && !relatedClaim("مش كلها مرتبطة بشغلك") && !relatedClaim("هدوّرلك على حاجة مناسبة"));
  });

  test("#4 the strongest self-introduction names him: a later «أنا المهندس …» beats a misheard «أنا X من …»; «أنا أنا الدكتور …» beats «معاك المهندس …»", () => {
    const sd = turns => selfDescription(turns, []);
    let s = sd([{ i: 1, user: "انا وابل من حمد لله", persona: "معلش، مش متأكدة إني سمعت حضرتك كويس." }, { i: 2, user: "الحمد لله", persona: "أتشرف بمين؟" },
      { i: 3, user: "أنا المهندس كريم", persona: "أهلاً يا باشمهندس كريم، اتشرفت بحضرتك." }]);
    assert.deepEqual([s.title, s.first], ["مهندس", "كريم"]);
    s = sd([{ i: 1, user: "طيب بصي انا انا الدكتور حسام بس هيكلمك دلوقتي شريكي", persona: "" }, { i: 2, user: "وعايز يفهم المنصة هتفيده بإيه معاك المهندس فريدك", persona: "" },
      { i: 3, user: "لا ده المهندس فريد", persona: "أهلاً يا باشمهندس فريد." }]);
    assert.deepEqual([s.title, s.first], ["دكتور", "حسام"]);
    s = sd([{ i: 1, user: "انا وابل من الصبح بدور", persona: "" }, { i: 2, user: "اسمي منى", persona: "أهلاً يا مدام منى." }]);
    assert.deepEqual([s.title, s.first], ["", "منى"]);
    assert.equal(sd([{ i: 1, user: "انا كريم", persona: "" }]).first, "", "a bare «أنا X» proves nothing");
    assert.equal(sd([{ i: 1, user: "انا كريم", persona: "أهلاً يا أستاذ كريم." }]).first, "كريم", "… unless the persona then addresses him by it");
    assert.equal(sd([{ i: 1, user: "انا المهندس", persona: "" }]).first, "", "a title alone is no name");
  });

  test("#6 the quote budget: the ask and the persona's answer first, then the flags in their order; no slot for a quote not shown; never the same text twice", () => {
    const r = reviewConversation(atlal());
    assert.ok(r.personaQuote.startsWith("فهمت إن حضرتك بتصنّع"), "«جنة قالت» is kept: " + r.personaQuote);
    const all = [r.askQuote, r.personaQuote, ...r.flags.map(f => f.q)].filter(Boolean);
    assert.equal(new Set(all).size, all.length, "no text twice");
    assert.ok(flagOf(r, "dissatisfied").q, "the first flag in the card's order gets its quote");
    assert.equal(flagOf(r, "last_user_unanswered").q, undefined, "the same words are not quoted again");
    assert.ok(flagOf(r, "promise_no_tool").q.startsWith("حاضر، هجرّب"), "a flag keeps its FIRST turn's quote (turn 28)");
    assert.ok(all.length <= 4 && r.flags.every(f => !("qc" in f)), "≤ 2 quotes a side, no candidate left in the result");
  });

  test("#7 «كان ممكن» runs each zero search again where it returned nothing — RFQs, tenders, a governorate, the lookup's default; never the intel centre's or a memory row's; > 3 queries counted", () => {
    const seen = [], lookup = { search: (sec, q, gov) => { seen.push([sec, q, gov]); return { count: sec === "rfqs" ? 2 : 0, results: [] }; } };
    const z = (query, section, extra = {}) => ({ query, section, governorate: "", market: "", tool: "janna_lookup", ...extra });
    const review = { productWords: [], zeroSearches: [z("بكر", "rfqs"), z("بكر", "tenders"), z("علب", "suppliers", { governorate: "الجيزة" }), z("rollers", "", { tool: "bassem_intel" }), z("من الذاكرة", "", { memory: true }),
      z("ورق", ""), z("حبر", "products")] };
    const out = missedLines({ agent: "janna", review }, lookup, T0, () => true).map(l => plain(l.ar));
    assert.deepEqual(seen, [["rfqs", "بكر", ""], ["tenders", "بكر", ""], ["suppliers", "علب", "الجيزة"], ["factories", "ورق", ""]], "the lookup's own default section is the factories");
    assert.deepEqual(out, ["«بكر» دلوقتي بيرجّع ٢ في طلبات الأسعار — ولسه مفيش في المناقصات", "«علب» ولسه مفيش في الموردين (الجيزة)", "«ورق» ولسه مفيش في المصانع", "وكلمة بحث تانية رجّعت صفر — في الملف المرفق"]);
  });

  test("second preview: «كان ممكن» says only what it searched, counts only tenders about his product, and never says the seller's tenders / RFQs twice", () => {
    const z = (query, section) => ({ query, section, governorate: "", market: "", tool: "janna_lookup" });
    const seller = { seller: true, offeredProfile: true, productWords: ["بكر مطابع"], zeroSearches: [z("بكر مطابع", "rfqs"), z("بكر مطابع", "factories"), z("بكر مطابع", "tenders")] };
    const tenders = [{ status: "سارية", title: "توريد أدوية لعام تجريبي" }, { status: "سارية", title: "توريد بكر مطاط لمطبعة تجريبية" }, { status: "منتهية", title: "توريد بكر قديم" },
      { status: "سارية", title: "صيانة أبواب رولر", match: "related" }, { status: "تنتهي قريباً", title: "Supply of printing rollers", match: "partial" }];
    const seen = [], lookup = { search: (sec, q) => { seen.push(sec); return sec === "tenders" ? { count: tenders.length, results: tenders } : { count: 0, results: [] }; } };
    const out = missedLines({ agent: "janna", review: seller }, lookup, T0, () => true).map(l => plain(l.ar));
    assert.deepEqual(out, ["النهارده الصبح على المنصة لـ «بكر مطابع»: مناقصات سارية ٢، طلبات أسعار ٠", "«بكر مطابع» ولسه مفيش في المصانع"],
      "an open tender counts when it is about his product (a query word in its title, or U1's tag not «related»); (c) does not repeat the tenders / RFQs (a) said");
    assert.deepEqual(seen, ["tenders", "rfqs", "customers", "factories"], "and does not search them again");
    let left = 1; // the budget lets one search run: the RFQs were never searched, so nothing is said about them (no «مفيش … ولا طلب سعر»)
    const cut = missedLines({ agent: "janna", review: seller }, { search: () => ({ count: 0, results: [] }) }, T0, () => left-- > 0).map(l => plain(l.ar));
    assert.deepEqual(cut, [], JSON.stringify(cut));
    const none = missedLines({ agent: "janna", review: { buyer: true, productWords: ["علب كرتون"] } }, {}, T0, () => true);
    assert.deepEqual(none, [], "no lookup: no «مفيش مورّد …» either");
    const buyer = missedLines({ agent: "janna", review: { buyer: true, productWords: ["علب كرتون"] } }, { search: () => ({ count: 0, results: [] }) }, T0, () => true).map(l => plain(l.ar));
    assert.deepEqual(buyer, ["مفيش مورّد في الدليل فيه كل كلمات «علب كرتون»"], "a search that ran and found nothing is said");
  });

  test("#8 every search counted, never the screen echoes: 14 lookups (13 empty) + 14 janna_search + 2 knowledge lookups + 1 opened item", () => {
    const tools = [];
    for (let k = 0; k < 14; k++) tools.push(lk("كلمة تجربة " + (k + 1), "factories", k < 13 ? [] : ["مصنع التجربة الأخير"]), echo("كلمة تجربة " + (k + 1), "factories"));
    tools.push({ name: "knowledge_lookup", args: { lang: "ar", query: "الباقات" }, result: { count: 0, results: [], text: "مفيش إجابة متسجلة" } }, { name: "knowledge_lookup", args: { lang: "ar", query: "التسجيل" }, result: { count: 1, results: [{ q: "x" }] } },
      { name: "platform_item", args: { section: "factories", id: "77" }, result: { found: true, title: "مصنع التجربة الأخير", name: "مصنع التجربة الأخير" } });
    const r = reviewConversation(conv([hi, { i: 1, user: "عايز مصنع بلاستيك", persona: "لقيت مصنع التجربة الأخير.", t: 10, tools }]));
    assert.deepEqual([r.searchCount, r.zeroCount, r.itemCount, r.kbCount, r.kbZero, r.tools], [14, 13, 1, 2, 1, 31]);
    assert.deepEqual([flagOf(r, "zero_results").n, r.zeroQueries.length], [13, 13], "nothing capped");
  });

  test("#9 a result named in a sentence that rejects it, or listed as what came up instead after «مالقيتش», is no concrete answer", () => {
    const call = said => conv([hi, { i: 1, user: "أنا محتاج مورد علب كرتون مطبوعة", persona: "تمام، هدوّر لك.", t: 10, tools: [lk("علب كرتون مطبوعة", "suppliers", ["مصنع النموذج للتغليف", "شركة الأمل للورق"])] },
      { i: 2, user: "ها؟", persona: said, t: 25 }, { i: 3, user: "طيب", persona: "تحت أمرك.", t: 40 }]);
    for (const said of ["ظهر مصنع النموذج للتغليف وشركة الأمل للورق، بس النتايج دي مش مطابقة لطلبك.", "مالقيتش مورد علب مطبوعة في الدليل. اللي ظهر مصنع النموذج للتغليف وشركة الأمل للورق.",
      "ظهرت نتيجة مختلفة باسم مصنع النموذج للتغليف."]) {
      const r = reviewConversation(call(said));
      assert.deepEqual([r.concrete, r.verdict], [false, "not_useful"], said);
    }
    const ok = reviewConversation(call("لقيت مصنع النموذج للتغليف وشركة الأمل للورق، تحب أبعتلهم طلب عرض سعر؟"));
    assert.deepEqual([ok.concrete, ok.verdict], [true, "partial"]);
  });

  test("#10 the place is the caller's own («إحنا موجودين في …», «مصنعنا في …»), never the place of what he looks for («شركة البترول في …», «هي موجودة في …»)", () => {
    const P = ["القاهرة", "الإسكندرية", "الجيزة", "القليوبية", "العاشر من رمضان", "6 أكتوبر"];
    for (const [u, want] of [["تمام شركة البترول في الإسكندرية", ""], ["هي موجودة في المنطقة الصناعية في القليوبية", ""], ["عايز مصنع رخام في الجيزة", ""], ["هم موجودين في القليوبية", ""],
      ["إحنا موجودين في الجيزة", "الجيزة"], ["مصنع النموذج للبكر موجودين في العاشر من رمضان", "العاشر من رمضان"], ["أنا من الإسكندرية ومحتاج مورد في القاهرة", "الإسكندرية"], ["وانا مصنعي في 6 أكتوبر", "6 أكتوبر"]])
      assert.equal(ownPlace(u, P), want, u);
    assert.equal(selfDescription([{ i: 1, user: "هي موجودة في القليوبية وعايز رقمهم" }, { i: 2, user: "إحنا موجودين في الجيزة" }], P).place, "الجيزة", "the first OWN place of the call");
  });

  test("#11 seconds over a limit keep the decimals that show it: a 30.041 s reply is «30.04», never «30» under «أكتر من ٣٠ ثانية»", () => {
    assert.deepEqual([overLimit(30.041, 30, 1), overLimit(42.041, 30, 1), overLimit(30.841, 30, 1), overLimit(7.259, 6, 10), overLimit(6.04, 6, 10)], [30.04, 42, 31, 7.3, 6.04]);
    const r = reviewConversation(conv([hi, { i: 1, user: "اشرحيلي الباقات", persona: "شرح طويل عن الباقات وأسعارها وإزاي التسجيل بيتم.", t: 10, speak: 30.041 }]));
    assert.deepEqual(flagOf(r, "long_turn").secs, [30.04]);
  });
});
