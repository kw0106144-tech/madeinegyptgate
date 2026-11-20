// node --test for the automatic review of one call (src/calls-review.js — pure rules) on SYNTHETIC conversations (test/calls-fixtures.mjs):
// one shaped like the reviewed call 8bacbfac (invented words, a dummy company), a buyer with an RFQ, noise, the memory join, a meeting
// without recording consent, the transcript / D1-only modes and every phase-1 rule. Nothing real: no transcript, name, phone or e-mail.
// Run: cd worker && npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reviewConversation, memoryJoin, quote, selfDescription, PROMISE_RX, STYLE_TAGS, outcomeKind } from "../src/calls-review.js";
import { turnsFromAnalytics, turnsFromTranscript } from "../src/calls-report.js";
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
