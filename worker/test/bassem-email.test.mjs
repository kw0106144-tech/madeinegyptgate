// node --test for Bassem's e-mails in the live call (owner 2026-11-19: «كل ما اديله اوردر انه يبعت ايميل بيقولي معرفش» · «بقوله اكتب عنوان
// الايميل بيقولي مش هعرف اكتبه» · «باسم كتب الايميل بس مش بيقراه» · a Swahili e-mail to a Kenyan government buyer signed «Dr. Mohamed»).
// The helpers of data/janna-live.js «e-mails from the call» run in a vm sandbox, sliced from the file itself (no DOM): the dictated-address
// parser (at / آت · dot / دوت · underscore / أندرسكور), where a recipient may come from (the tools' data, his own words — never a guess),
// «he heard / saw it» before a dictated address goes out, the language rules, which opportunity a draft is about, the body of
// POST /api/advisor/send, and the words Bassem is given (never «اتبعت» unless the platform answered sent). Plus the wiring (source checks)
// and the signature line of the member block (worker/src/bassem-context.js).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { memberContext, fullName } from "../src/bassem-context.js";

const LIVE = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
const HOLO = readFileSync(new URL("../../data/holo.js", import.meta.url), "utf8");
const ADV = readFileSync(new URL("../../advisor.part.py", import.meta.url), "utf8");
const A = LIVE.indexOf("  /* @mail-pure-begin"), M = LIVE.indexOf("  /* @mail-pure-end */"), B = LIVE.indexOf("  /* POST /api/advisor/send with the member's platform sign-in");
assert.ok(A > 0 && M > A && B > M, "the helpers block is marked in data/janna-live.js");

/* the block in a sandbox: T / EN as the page has them, a clock, and the few page functions the state helpers call */
function load({ en = false, path = "/", ctx = null, dealAddrs = [], frameDoc = null } = {}) {
  const clock = { t: 1_800_000_000_000 };
  const sb = { EN: en, T: (ar, e) => (en ? e : ar), Date: { now: () => clock.t }, frame: frameDoc ? { contentDocument: frameDoc } : null, CMP: null,
    screenWin: () => ({ location: { pathname: path } }), screenCtx: () => ctx, advDoc: () => (dealAddrs.length ? {} : null), dealMails: () => dealAddrs };
  vm.createContext(sb);
  vm.runInContext(LIVE.slice(A, B), sb);
  sb.clock = clock; sb.tick = ms => { clock.t += ms; };
  return sb;
}
const P = load();

describe("dictated addresses: the spoken words of an e-mail address → the address", () => {
  test("Latin and Egyptian forms, words split by speech-to-text, letters spelled one by one", () => {
    const cases = [
      ["info at lamuwest dot example dot ke", "info@lamuwest.example.ke"],
      ["info at lamu west dot example dot ke", "info@lamuwest.example.ke"],
      ["ابعته على info آت lamuwest دوت example دوت ke لو سمحت", "info@lamuwest.example.ke"],
      ["procurement أندرسكور office at ngcdf دوت example دوت ke", "procurement_office@ngcdf.example.ke"],
      ["john underscore doe at gmail dot com", "john_doe@gmail.com"],
      ["john under score doe at gmail dot com", "john_doe@gmail.com"],
      ["a اندر سكور b at x dot com", "a_b@x.com"],
      ["a شرطة سفلية b at x dot com", "a_b@x.com"],
      ["i n f o at g m a i l dot c o m", "info@gmail.com"],
      ["m dot ali at company dot co dot uk", "m.ali@company.co.uk"],
      ["sales dash team at abc-group dot com dot eg", "sales-team@abc-group.com.eg"],
      ["sales٢٠٢٤ at x dot com", "sales2024@x.com"],
      ["info at x dot كوم", "info@x.com"],
      ["الإيميل INFO@LAMUWEST.EXAMPLE.KE.", "info@lamuwest.example.ke"],
      ["info＠lamuwest.example.ke", "info@lamuwest.example.ke"],
      ["info@lamuwest dot example dot ke", "info@lamuwest.example.ke"],
      ["tenders at lamuwest.example.ke", "tenders@lamuwest.example.ke"],
      ["«info@x.com»", "info@x.com"],
    ];
    for (const [said, addr] of cases) assert.equal(P.spokenMail(said), addr, said);
    assert.deepEqual([...P.spokenMails("info at x dot com و sales at y dot org")], ["info@x.com", "sales@y.org"]);
  });
  test("words that are no address stay no address (nothing is made up)", () => {
    for (const s of ["I am at the office", "نتقابل الساعة 5 ونقطة", "info at x", "at dot", "", "ابعته على الإيميل اللي عندك", "info at x dot c", "@@x.com"])
      assert.equal(P.spokenMail(s), "", s);
  });
  test("letter by letter, as the screen shows it and Bassem can read it back (Arabic and English pages)", () => {
    assert.equal(P.mailSpell("info@x.example.ke"), "i n f o (آت) x (دوت) e x a m p l e (دوت) k e");
    assert.equal(P.mailSpell("a_b-c@x.eg"), "a (أندرسكور) b (داش) c (آت) x (دوت) e g");
    assert.equal(load({ en: true }).mailSpell("a_b@x.eg"), "a (underscore) b (at) x (dot) e g");
  });
  test("Bassem's `to`: an address, a spoken form, words that are not one, or nothing", () => {
    assert.equal(P.toArg("Info@X.com").addr, "info@x.com");
    assert.deepEqual([P.toArg("info at x dot com").addr, P.toArg("info at x dot com").spoken], ["info@x.com", true]);
    assert.equal(P.toArg("mailto:info@x.com").addr, "info@x.com");
    assert.equal(P.toArg("الجهة اللي في الإعلان").bad, "الجهة اللي في الإعلان");
    assert.equal(P.toArg("").addr, undefined);
    for (const ok of ["o'brien@x.ie", "a+b@x.com", "x@sub.example.co.ke"]) assert.equal(P.mailOk(ok), true, ok);
    for (const bad of ["a..b@x.com", ".a@x.com", "a.@x.com", "a@x", "a@x.c", "a b@x.com", "انفو@x.com", "a@-x.com"]) assert.equal(P.mailOk(bad), false, bad);
  });
});

describe("where a recipient may come from — never a guess", () => {
  const KE = { count: 1, results: [{ id: "k7ne0z3p9qa", kind: "tender_gov", title: "توريد ١٦ طاولة و٦٤ كرسي لمدرسة Hongwe الخاصة", title_ar: "توريد ١٦ طاولة و٦٤ كرسي لمدرسة Hongwe الخاصة", entity: "NG-CDF Lamu West Constituency",
    market: "africa:ke", market_name: "كينيا", deadline: "2026-11-25", status: "open", url: "https://tenders.go.ke/tenders/313396", page: "https://madeinegyptgate.com/intel/tenders/hongwe-k7ne0z3p9qa/" }], text: "لقيت مناقصة …" };
  test("a server tool's data: the notice becomes an opportunity, an address in it (a tender document's text) is «data»", () => {
    const S = load({ path: "/intel/tenders/hongwe-k7ne0z3p9qa/" });
    S.harvest({ toolName: "bassem_intel", toolType: "server", result: JSON.stringify(KE) });
    assert.equal(S.OPPC.length, 1);
    assert.deepEqual({ ...S.OPPC[0].o }, { ref: "", title: KE.results[0].title, entity: "NG-CDF Lamu West Constituency", market: "africa:ke", country: "كينيا", source_url: "https://tenders.go.ke/tenders/313396", closing_date: "2026-11-25", kind: "tender_gov" });
    assert.equal(S.mailSource("procurement@lamuwest.example.ke"), "", "not in any data yet");
    // the other team's «doc» action returns the document's text: its addresses belong to the notice on the screen
    S.harvest({ toolName: "bassem_intel", toolType: "server", result: JSON.stringify({ text: "Tender documents …\nEnquiries:\nprocurement@lamuwest.example.ke or Tel …", id: "k7ne0z3p9qa" }) });
    assert.equal(S.mailSource("nprocurement@lamuwest.example.ke"), "", "the JSON text's «\\n» never sticks to the address");
    assert.equal(S.mailSource("procurement@lamuwest.example.ke"), "data");
    assert.deepEqual([...S.oppMails("intel:k7ne0z3p9qa")], ["procurement@lamuwest.example.ke"], "the draft fills it in by itself when it is the notice's only address");
    S.harvest({ toolName: "bassem_web_search", toolType: "server", result: { results: [{ title: "Lamu furniture", url: "https://lamu-furniture.example", snippet: "contact sales@lamu-furniture.co.ke" }] } });
    assert.equal(S.mailSource("sales@lamu-furniture.co.ke"), "data", "any server tool's text: Bassem may use it as `to`");
    assert.deepEqual([...S.oppMails("intel:k7ne0z3p9qa")], ["procurement@lamuwest.example.ke"], "a web result's address never attaches itself to the notice on the screen");
    S.harvest({ toolName: "knowledge_lookup", result: { text: "اكتب لـ support@madeinegyptgate.com" } });
    assert.equal(S.mailSource("support@madeinegyptgate.com"), "", "the platform's own mailboxes are never a buyer");
  });
  test("a client tool's answer is never «data» (ours quote the address he dictated — it must not launder itself)", () => {
    const S = load();
    S.harvest({ toolName: "bassem_draft_email", toolType: "client", result: "المستلم: sales@baosteel.com (هو قاله)" });
    S.harvest({ toolName: "bassem_send_email", result: "اتبعت ✓ من المنصة لـ sales@baosteel.com" });
    assert.equal(S.mailSource("sales@baosteel.com"), "");
  });
  test("his own words: a dictated address is «said» (also when speech-to-text wrote it in Arabic letters); an invented one is nothing", () => {
    const S = load();
    S.heardAdd("u1", "اكتب العنوان: info at lamuwest dot example dot ke");
    assert.equal(S.mailSource("info@lamuwest.example.ke"), "said");
    const R = load();
    R.heardAdd("u1", "ابعته على انفو آت لامو ويست دوت جو دوت كي اي");
    assert.equal(R.mailSource("info@lamuwest.example.ke"), "said", "the words of an address: its letters are then confirmed on the screen");
    const N = load();
    N.heardAdd("u1", "اعمل لنا ايميل ليهم عشان يعرفوا ان مصنع الحسيني عنده الطاولات دي");
    assert.equal(N.mailSource("sales@supplier-example.com"), "", "Bassem's guess is only offered, never filled in");
    assert.equal(load({ dealAddrs: ["buyer@authority.example"] }).mailSource("buyer@authority.example"), "deal");
  });
  test("a dictated address goes out only after he heard / saw it: he spoke AFTER it was shown (the copy of the same words does not count)", () => {
    const S = load();
    S.heardAdd("u1", "ابعته على info at lamuwest dot example dot ke"); S.tick(1500);
    S.TO_PEND = { addr: "info@lamuwest.example.ke", at: S.clock.t, ok: false }; // shown on the screen now
    assert.equal(S.toReady("info@lamuwest.example.ke"), false);
    S.tick(400); S.heardAdd("", "ابعته على info at lamuwest dot example dot ke"); // the history's copy of the same utterance
    assert.equal(S.toReady("info@lamuwest.example.ke"), false, "the same words again are not «he spoke since»");
    S.tick(400); S.heardAdd("u1", " لو سمحت"); // the same utterance still streaming
    assert.equal(S.toReady("info@lamuwest.example.ke"), false);
    S.tick(2000); S.heardAdd("u2", "أيوه صح");
    assert.equal(S.toReady("info@lamuwest.example.ke"), true);
    assert.match(S.confirmWords("info@lamuwest.example.ke"), /حرف حرف \(i n f o \(آت\) l a m u w e s t \(دوت\) e x a m p l e \(دوت\) k e\)/);
    assert.equal(S.toReady("other@x.com"), true, "only the shown address waits");
  });
});

describe("the words Bassem is given after a draft: summary, «تحب أبعته؟», the recipient, the language", () => {
  test("no recipient: ask once «أبعته لمين؟» — never «معرفش», never a guess", () => {
    const w = P.draftWords("cmp", {}, "en", null);
    assert.match(w, /المسودة قدامه على الشاشة بالإنجليزي، ولسه مااتبعتتش/);
    assert.match(w, /اسأله مرة واحدة «أبعته لمين؟»/);
    assert.match(w, /في جملة أو اتنين قصيرين بالمصري \(حوالي ٢٠ كلمة\) الإيميل بيقول إيه/);
    assert.match(w, /وبعدين سؤال واحد بس: «أبعته لمين؟»\./, "review 2026-11-21: one question — the empty To box asks «أبعته لمين؟», not «تحب أبعته؟» as well");
    assert.doesNotMatch(w, /«تحب أبعته؟»/);
    assert.match(w, /ولو قال «ابعتهولي» أو «على إيميلي» \(عايزه لنفسه\): استدعي bassem_send_email وفي to كلمة me/);
    const w2 = P.draftWords("cmp", { addr: "procurement@lamuwest.example.ke", src: "data" }, "en", null);
    assert.match(w2, /وبعدين سؤال واحد بس: «تحب أبعته؟»\./, "a recipient is there: «تحب أبعته؟»");
    assert.doesNotMatch(w2, /«أبعته لمين؟»/);
    assert.doesNotMatch(w + w2, /جملتين أو تلاتة/);
    assert.match(w, /وده مهم لأنه مش بالعربي/);
    assert.match(w, /لو طلب تقراهوله اقراه كله/);
    assert.doesNotMatch(w, /معرفش|مش هعرف/);
  });
  test("the owner's case: a Swahili e-mail to a Kenyan government buyer → the note says English", () => {
    const sw = "Mpendwa Afisa wa Ugavi, Tunaandika kuhusu zabuni ya ugavi wa samani kwa Shule Maalum ya Hongwe. Kampuni yetu ni kiwanda cha samani kutoka Misri na tunaweza kutoa bidhaa hizi kwa ubora. Tafadhali tuambie. Asante.";
    assert.equal(P.mailLang("Ugavi wa Samani kwa Shule Maalum ya Hongwe\n" + sw, "en"), "sw", "Swahili is told apart even when Bassem named en");
    const w = P.draftWords("cmp", { addr: "info@lamuwest.example.ke", src: "said" }, "sw", { market: "africa:ke", country: "كينيا" });
    assert.match(w, /بالسواحيلي/);
    assert.match(w, /الجهة في كينيا والتعامل الرسمي معاها بالإنجليزي؛ لو هو ماطلبش السواحيلي بنفسه، اكتب الإيميل تاني بالإنجليزي/);
    assert.equal(P.mailLang("Dear Sir/Madam,\nWe are an Egyptian furniture factory and would like to offer…", "en"), "en");
    assert.equal(P.mailLang("السادة/ الهيئة العامة\nتحية طيبة وبعد،", "en"), "ar");
    assert.equal(P.mailLang("Madame, Monsieur, nous sommes une usine égyptienne", "fr"), "fr");
  });
  test("the business language of the buyer's market: English by default, French for francophone Africa, Arabic for the Arab countries", () => {
    const L = m => [...P.bizLang(m)];
    assert.deepEqual([L("africa:ke"), L("africa:za"), L("africa:gh"), L("africa:ng"), L("intl"), L("asia:cn"), L("eu"), L("")], [["en"], ["en"], ["en"], ["en"], ["en"], ["en"], ["en"], ["en"]]);
    assert.deepEqual([L("africa:sn"), L("africa:ci"), L("africa:cm"), L("ma"), L("dz")], [["fr"], ["fr"], ["en", "fr"], ["ar", "fr"], ["ar", "fr"]]);
    assert.deepEqual([L("sa"), L("gcc"), L("eg"), L("local"), L("gulf"), L("jo")], [["ar"], ["ar"], ["ar"], ["ar"], ["ar"], ["ar"]]);
    assert.equal(P.draftWords("cmp", {}, "en", { market: "africa:ke", country: "كينيا" }).indexOf("ملاحظة"), -1, "English to Kenya: no note");
    assert.match(P.draftWords("cmp", {}, "en", { market: "africa:sn", country: "السنغال" }), /بالفرنساوي/);
  });
  test("recipient words: from the data, his own (still to be checked letter by letter), an address nobody said, several, unreadable", () => {
    const S = load();
    assert.match(S.toWords({ addr: "procurement@lamuwest.example.ke", src: "data" }), /المستلم: procurement@lamuwest\.example\.ke \(من بيانات الفرصة\)/);
    S.TO_PEND = { addr: "info@lamuwest.example.ke", at: S.clock.t, ok: false };
    assert.match(S.toWords({ addr: "info@lamuwest.example.ke", src: "said" }), /اتكتب على الشاشة حرف حرف: i n f o/);
    assert.match(S.toWords({ offered: "sales@supplier-example.com" }), /مش في بيانات الفرصة ولا هو قاله، فمااتحطش في المستلم: اسأله «أبعته لمين؟»/);
    assert.match(S.toWords({ several: ["a@x.ke", "b@x.ke"] }), /أكتر من عنوان \(a@x\.ke، b@x\.ke\)/);
    assert.match(S.toWords({ bad: "الجهة" }), /اطلب منه يتهجّاه حرف حرف/);
    assert.match(S.NO_TO(), /اسأله مرة واحدة «أبعته لمين؟»/);
    assert.match(load({ en: true }).toWords({}), /Who shall I send it to\?/);
  });
});

describe("which opportunity a draft is about, and the body of POST /api/advisor/send", () => {
  const ke = { k: "intel:k7ne0z3p9qa", o: { ref: "", title: "توريد ١٦ طاولة و٦٤ كرسي لمدرسة Hongwe الخاصة", entity: "NG-CDF Lamu West Constituency", market: "africa:ke", country: "كينيا", source_url: "https://tenders.go.ke/tenders/313396", closing_date: "2026-11-25", kind: "tender_gov" }, alt: "" };
  const gh = { k: "intel:g4h9x0b1c2d", o: { ref: "", title: "Supply of laboratory benches", entity: "Kwame Nkrumah University of Science and Technology", market: "africa:gh", country: "غانا", source_url: "https://ghana.example/t/1", closing_date: "2026-11-27", kind: "tender_gov" }, alt: "" };
  const MAIL = "Supply of School Furniture for Hongwe Special School\nDear NG-CDF Lamu West Constituency,\nWe are an Egyptian furniture factory …";
  test("the e-mail's words pick the notice; the one on the screen needs one shared word, any other two; nothing else is attached", () => {
    assert.equal(P.oppPick([gh, ke], "", MAIL).k, ke.k);
    assert.equal(P.oppPick([gh, ke], ke.k, "Dear Sir, about the Hongwe school …").k, ke.k, "one word + on the screen");
    assert.equal(P.oppPick([gh, ke], "", "Dear Sir, about the Hongwe school …"), null, "one word only and not on the screen");
    assert.equal(P.oppPick([gh, ke], ke.k, "Introduction of our furniture company to UAE buyers"), null, "an unrelated e-mail never lands on the screen's notice");
    assert.equal(P.oppPick([gh, ke], "", "Laboratory benches for Kwame Nkrumah University").k, gh.k);
    assert.equal(P.oppPick([{ ...ke, o: { ...ke.o, entity: "" }, alt: "Supply of 16 tables and 64 chairs to Hongwe Special School" }], "", MAIL).k, ke.k, "the notice's original title (its page's JSON-LD) matches an e-mail in another language");
  });
  test("the send body: the opportunity's fields, where the address came from, who asked", () => {
    const b = P.sendBody({ to: "info@lamuwest.example.ke", subject: "S", body: "B", language: "en", opp: ke.o, via: "bassem", toSrc: "said" });
    assert.deepEqual(JSON.parse(JSON.stringify(b)), { to: "info@lamuwest.example.ke", subject: "S", body: "B", via: "bassem", language: "en", to_source: "dictated",
      opportunity: { title: ke.o.title, entity: ke.o.entity, market: "africa:ke", country: "كينيا", source_url: ke.o.source_url, closing_date: "2026-11-25", kind: "tender_gov" } });
    assert.deepEqual(JSON.parse(JSON.stringify(P.sendBody({ to: "a@b.ae", subject: "S", body: "B", via: "button", toSrc: "typed", market: "الإمارات" }))), { to: "a@b.ae", subject: "S", body: "B", via: "button", to_source: "typed", market: "الإمارات" });
    assert.equal(P.sendBody({ to: "a@b.ae", subject: "S", body: "B", dealId: "0123456789abcdef", opp: ke.o }).opportunity, undefined, "an open deal wins");
    assert.equal(P.sendBody({ to: "a@b.ae", subject: "S", body: "B", toSrc: "data" }).to_source, "opportunity");
  });
});

describe("the platform's answer → the words: «اتبعت» ONLY when it answered sent", () => {
  const sent = { status: 200, j: { sent: true, deal_created: true, deal: { id: "0123456789abcdef", title: "توريد طاولات لمدرسة Hongwe" }, message: { status: "sent" } } };
  test("sent", () => {
    const w = P.sendWords("info@lamuwest.example.ke", sent);
    assert.equal(w.ok, true);
    assert.match(w.bassem, /^اتبعت ✓ من المنصة لـ info@lamuwest\.example\.ke باسم شركته، واتسجّل في صفقة "توريد طاولات لمدرسة Hongwe" اللي اتفتحت دلوقتي علشان الرد يتتابع/);
    assert.match(w.screen, /^✅ اتبعت من المنصة لـ info@lamuwest\.example\.ke — والرد هيتسجّل في صفقة «توريد طاولات لمدرسة Hongwe»/);
    assert.match(load({ en: true }).sendWords("a@b.ke", sent).bassem, /^Sent ✓ from the platform to a@b\.ke/);
  });
  test("every refusal or failure says «مااتبعتش» (or «مش متأكد»), with the next step — never «اتبعت»", () => {
    const cases = [
      [{ status: 200, j: { sent: false, error: "email not configured", message: { status: "draft" }, deal: {} } }, /مااتبعتش: الإرسال من المنصة مش متشغّل دلوقتي، والإيميل اتحفظ مسودة في الصفقة.*من بريدي/],
      [{ status: 200, j: { sent: false, error: "member not verified by the platform", message: {}, deal: {} } }, /حسابه لسه مش متفعّل/],
      [{ status: 200, j: { sent: false, error: "resend 403: The domain is not verified.", message: { status: "failed" }, deal: {} } }, /مزوّد الإيميل ماقبلوش \(resend 403/],
      [{ status: 400, j: { error: "the buyer's market or country is needed", code: "market_required" } }, /اسأله «الجهة دي في أنهي بلد؟» وابعت تاني بالبلد في market/],
      [{ status: 400, j: { error: "invalid or missing to", code: "invalid_to" } }, /اسأله «أبعته لمين؟»/],
      [{ status: 403, j: { error: "market not in plan", code: "market_not_in_plan" } }, /السوق ده مش في باقتك/],
      [{ status: 429, j: { error: "daily email limit reached", code: "daily_limit", limit: 30 } }, /وصلت لحد الإيميلات في اليوم \(30\).*من بريدي/],
      [{ status: 429, j: { error: "new recipient limit reached", code: "new_recipient_limit", limit: 10 } }, /حد العناوين الجديدة في اليوم \(10\)/],
      [{ status: 403, j: { error: "recipient opted out", code: "opted_out" } }, /ماتبعتلوش تاني/],
      [{ status: 403, j: { error: "sign in with an e-mail code to open Bassem", code: "full_login_required" } }, /لازم تسجّل دخولك بكود الإيميل/],
      [{ status: 403, j: { error: "plan not eligible", code: "plan" } }, /باقتك الحالية مافيهاش الإرسال من المنصة/],
      [{ status: 0, j: { code: "offline" } }, /سيرفر المنصة مش متاح/],
      [{ status: 401, j: { error: "unauthorized" } }, /لازم تسجّل الدخول الأول/],
      [{ status: 500, j: { error: "server error" } }, /مااتبعتش: server error/],
    ];
    for (const [r, re] of cases) {
      const w = P.sendWords("info@lamuwest.example.ke", r);
      assert.equal(w.ok, false, JSON.stringify(r));
      assert.match(w.bassem, re, JSON.stringify(r));
      assert.match(w.bassem, /^مااتبعتش: /);
      assert.match(w.screen, /^⚠️ مااتبعتش: /);
      assert.doesNotMatch(w.bassem + w.screen, /اتبعت ✓|✅/);
    }
    const t = P.sendWords("a@b.ke", { status: 0, j: { code: "timeout" } });
    assert.deepEqual([t.ok, t.failed], [false, true]);
    assert.match(t.bassem, /^مش متأكد إنه اتبعت.*ماتبعتوش تاني/);
    assert.equal(P.sendWords("a@b.ke", { status: 200, j: { sent: "yes" } }).ok, false, "only sent === true is «sent»");
  });
});

describe("data/janna-live.js, data/holo.js and advisor.part.py wiring (source checks)", () => {
  const run = LIVE.slice(LIVE.indexOf("function sdkRun("), LIVE.indexOf("function sdkPlay("));
  test("both e-mail tools answer Bassem in the SDK call (registered before the stream starts); the DOM path leaves them to the handlers", () => {
    const reg = run.indexOf('["bassem_draft_email", "bassem_send_email"].forEach'), stream = run.indexOf("streamToVideoElement(");
    assert.ok(reg > 0 && stream > reg, "registered before streamToVideoElement");
    assert.match(run, /registerToolCallHandler\(tn, \{ onStart: function \(pl\) \{ return [^}]*mailTool\(tn, pl && pl\.arguments\)/);
    assert.match(run, /me\.own\[tn\] = 1/);
    assert.match(LIVE, /if \(name === "bassem_draft_email" \|\| name === "bassem_send_email"\) \{ if \(LV && !LV\.closed && LV\.own && LV\.own\[name\]\) return; mailTool\(name, a\); return; \}/);
    assert.match(run, /if \(ev\.role === "user"\) heardAdd\(/, "his words reach the dictation check");
    assert.match(LIVE, /el\.addEventListener\("anam-agent:tool-call-completed", function \(e\) \{ try \{ harvest\(e\.detail \|\| \{\}\); \} catch \(x\) \{\} \}\);/);
  });
  test("the draft sends FROM THE PLATFORM (POST /api/advisor/send); «من بريدي» still opens his mail app; the old «press send yourself» refusal is gone", () => {
    assert.match(LIVE, /"\/advisor\/send"/);
    assert.match(LIVE, /el\.querySelector\("\.jc-send"\)\.onclick = function \(\) \{ cmpSendNow\("button"\); \};/);
    assert.match(LIVE, /el\.querySelector\("\.jc-mail"\)\.onclick = cmpMailto;/);
    assert.doesNotMatch(LIVE, /function cmpAsk|draftWaiting|باسم مش بيبعت حاجة من غير ضغطتك/);
    assert.doesNotMatch(HOLO, /draftWaiting/);
    assert.match(HOLO, /W\.addEventListener\("mig:tool-outcome"[\s\S]{0,500}failTool\(d\.tool/);
    assert.match(LIVE, /var known = dealMails\(d\);/, "the deal room keeps its own addresses");
  });
  test("the deal room tells every outcome of «ابعت» (the call waits for it) and names the new deal kinds", () => {
    const send = ADV.slice(ADV.indexOf("function sendMail(d, o) {"), ADV.indexOf("/* ---------- settings drawer ---------- */"));
    assert.ok((send.match(/mailDone\(\{ deal: d\.id/g) || []).length >= 8, "every exit of sendMail reports");
    assert.match(ADV, /window\.dispatchEvent\(new CustomEvent\("mig:advisor-mail", \{ detail: o \}\)\)/);
    assert.match(ADV, /project: \["مشروع", "Project"\], direct: \["تواصل مباشر", "Direct contact"\]/);
  });
});

describe("verification fixes (review 2026-11-19): ordinary words are no dictation, a send waits for his answer, the call's own sign-ins", () => {
  test("ordinary sentences never make a guessed address «said» (it is only offered); garbled dictations still are", () => {
    const no = [["look at this point", "info@kenya.go.ke"], ["what's the point of writing at all", "sales@anything.com"], ["we met at the meeting point today", "procurement@lamuwest.go.ke"],
      ["write to the procurement office of Lamu West", "procurement@lamuwest.go.ke"], ["I need info about the Kenya tender", "info@kenya.go.ke"],
      ["send it to their sales team at the company, period", "sales@company.com"], ["ده أهم نقطة ات الإيميل", "x@y.com"], ["send it to info at their office dot", "info@kenya.go.ke"]];
    for (const [said, addr] of no) { const S = load(); S.heardAdd("u1", said); assert.equal(S.mailSource(addr), "", said); }
    const yes = [["pro curement at lamu west dot go dot ke", "procurement@lamuwest.go.ke"], ["انفو آت لامو ويست نقطة جو نقطة كي", "info@lamuwest.go.ke"],
      ["ايميله info at lamuwest", "info@lamuwest.go.ke"], ["info uh at lamuwest dot go dot ke", "info@lamuwest.go.ke"], ["info at gmail point com", "info@gmail.com"]];
    for (const [said, addr] of yes) { const S = load(); S.heardAdd("u1", said); assert.equal(S.mailSource(addr), "said", said); }
  });
  test("Bassem's send needs words of his AFTER the draft appeared (a draft + send in one turn is refused with «تحب أبعته؟»)", () => {
    const S = load();
    S.heardAdd("u1", "اكتب إيميل للجهة دي وابعته على طول"); S.tick(2000);
    const shown = S.clock.t; // the draft appears
    assert.equal(S.heardSince(shown), false, "his order came before the draft: the summary and «تحب أبعته؟» first");
    assert.match(S.askFirstWords(), /^لسه مااتبعتش: .*«تحب أبعته؟»/);
    S.tick(3000); S.heardAdd("u2", "ابعته");
    assert.equal(S.heardSince(shown), true);
    const cmp = LIVE.slice(LIVE.indexOf("function cmpSendNow("), LIVE.indexOf("function cmpSendNow(") + 4000), room = LIVE.slice(LIVE.indexOf("function roomSend("), LIVE.indexOf("function roomSend(") + 4000);
    assert.match(cmp, /if \(B && !heardSince\(C\.at\)\) \{[^\n]*askFirstWords\(\)/, "the composer: Bassem's send only (the member's own click is his answer)");
    assert.ok(cmp.indexOf("heardSince(C.at)") < cmp.indexOf("C.busy = true"), "checked before anything is sent");
    assert.match(room, /ROOM_DRAFT && mb\.getAttribute\("data-bassem-draft"\) === ROOM_DRAFT && !heardSince\(ROOM_AT\)/);
    assert.ok(room.indexOf("heardSince(ROOM_AT)") < room.indexOf("b.click()"), "the deal room: checked before its button is pressed");
    assert.match(LIVE, /ROOM_DRAFT = "b" \+ Date\.now\(\)\.toString\(36\); ROOM_AT = Date\.now\(\);/);
  });
  test("the send uses the call's own sign-ins (the advisor token of an activation / WhatsApp link too); another one only after a refused sign-in", () => {
    for (const x of [{ status: 401, j: { error: "unauthorized" } }, { status: 403, j: { code: "plan" } }, { status: 403, j: { code: "full_login_required" } }]) assert.equal(P.signRefused(x), true, JSON.stringify(x));
    for (const x of [{ status: 403, j: { code: "market_not_in_plan" } }, { status: 403, j: { code: "opted_out" } }, { status: 429, j: { code: "daily_limit" } }, { status: 0, j: { code: "timeout" } }, { status: 0, j: { code: "offline" } }, { status: 200, j: { sent: false } }, { status: 200, j: { sent: true } }])
      assert.equal(P.signRefused(x), false, JSON.stringify(x));
    const sp = LIVE.slice(LIVE.indexOf("function sendPost("), LIVE.indexOf("function tellBassem("));
    assert.match(sp, /var tks = BTOK \? \[BTOK\] : bassemAuth\(\);/, "the sign-in the call was opened with, alone: the e-mail goes out as the member of the call");
    assert.match(sp, /i \+ 1 < tks\.length && signRefused\(x\) \? from\(i \+ 1\) : x/);
    assert.match(LIVE, /function bassemAuth\(\) \{[\s\S]{0,200}"mig-tok"[\s\S]{0,200}"mig-adv-token"/);
    const mint = LIVE.slice(LIVE.indexOf("function mint("), LIVE.indexOf("function sdkStart("));
    assert.match(mint, /var tk = c\[i\+\+\];[\s\S]{0,300}sessToken\(agent, tk, extra\)\.then\(function \(j\) \{ BTOK = tk; return j; \}/, "mint remembers the sign-in that opened Bassem's call");
  });
  test("the send scene never shows an internal English note on the Arabic page", () => {
    assert.match(HOLO, /failTool\(d\.tool, EN\(\) \|\| \/\[\\u0600-\\u06ff\]\/\.test\(why\) \? why : ""\)/);
  });
});

describe("the signature of the e-mails: title + FULL name + company from the member block (not «Dr. Mohamed»)", () => {
  const DR = { plan: "strategic", plan_expires: "2099-01-01T00:00:00.000Z", name: "محمد الحسيني", title: "دكتور", company: "مجموعة الحسيني – ELhouseni Group", sector: "الصناعات التكنولوجية (Technology industries)" };
  test("the block carries the signature line with the full name; the greeting stays the first name", () => {
    const c = memberContext(DR, "ar");
    assert.ok(c.block.includes("- لقبه واسمه الأول: دكتور محمد."), c.block);
    assert.ok(c.block.includes("- الإمضاء في أي إيميل بتكتبه له: دكتور محمد الحسيني — مجموعة الحسيني – ELhouseni Group. الاسم بالكامل والشركة زي ما هم هنا بالظبط ومن غير اختصار؛ وفي إيميل مش بالعربي: Dr. والاسم نفسه بالحروف اللاتيني."), c.block);
    assert.ok(!/[«»]/.test(c.block), "no «» in the block");
    const e = memberContext({ ...DR, name: "Mohamed A. El-Houseni" }, "en");
    assert.ok(e.block.includes("الإمضاء في أي إيميل بتكتبه له: دكتور Mohamed A. El-Houseni"), e.block);
    assert.equal(memberContext({ ...DR, name: "" }, "ar"), null, "no name → no block (today's behaviour)");
    assert.ok(!memberContext({ ...DR, name: "", title: "" }, "ar", { anonymous: true }).block.includes("الإمضاء"), "no invented signature for a member without a name");
  });
  test("fullName: honorifics and a leading initial dropped, every other word kept, no contact data", () => {
    const cases = [["محمد الحسيني", "محمد الحسيني"], ["د. محمد أحمد الحسيني", "محمد أحمد الحسيني"], ["م/ أحمد علي", "أحمد علي"], ["A. Ali Hassan", "Ali Hassan"], ["Dr.Ahmed Samir", "Ahmed Samir"],
      ["Mohamed", "Mohamed"], ["دكتور", ""], ["عبد الله محمد 01012345678", "عبد الله محمد"], ["محمد info@x.com الحسيني", "محمد الحسيني"]];
    for (const [n, f] of cases) assert.equal(fullName(n), f, n);
  });
});

describe("«ابعتلي» with the opportunities of the call (notifyRefs, notifyGo, notifyDone — worker/src/notify-items.js does the rest)", () => {
  const OPP = (k, title, entity, ref) => ({ k, o: { title, entity: entity || "", ref: ref || "" }, alt: "" });
  const L = [OPP("intel:rw0000000a1", "Supply and delivery of water treatment chemicals", "Rand Water"), OPP("item:eg-tnd-003", "تصنيع وتوريد وتركيب منشآت معدنية لصوامع قمح", "شركة مطاحن مصر العليا", "6/2026/2027"),
    OPP("intel:gh0000000b2", "Supply of laboratory equipment for the university", "Kwame Nkrumah University")];
  /* the real items.json tenders the review found the old picker mixing up (titles that all start «دعوة لتقديم العطاءات لتوريد», refs ending /2026/2027) */
  const ITEMS = JSON.parse(readFileSync(new URL("../src/items.json", import.meta.url), "utf8"));
  const real = ids => ids.map(id => ITEMS.t.find(t => t.id === id)).map(t => OPP("item:" + t.id, t.title, t.entity || "", String(t.ref || t.id)));
  test("Bassem's ids count only when this call's tools returned them or the screen shows them; never a URL; the others come back as unused (review R2)", () => {
    const r = P.notifyRefs(L, "", "x", "rw0000000a1, eg-tnd-003, zz0000000zz, item:evil", "");
    assert.deepEqual([...r], ["intel:rw0000000a1", "item:eg-tnd-003"]); assert.deepEqual([...r.unused], ["zz0000000zz", "evil"]);
    assert.deepEqual([...P.notifyRefs(L, "", "x", "intel:RW0000000A1", "")], ["intel:rw0000000a1"], "an id in another case");
    assert.deepEqual([...P.notifyRefs(L, "intel:ab0000000cd", "x", "ab0000000cd", "")], ["intel:ab0000000cd"], "the screen's item");
    const n = P.notifyRefs(L, "", "x", "https://evil.example/x.pdf, ab0000000cd", "");
    assert.deepEqual([...n], [], "nothing the call did not show"); assert.deepEqual([...n.unused], ["https://evil.example/x.pdf", "ab0000000cd"]);
    /* an earlier call's id with an Arabic note about nothing on the screen: no ref, the id reported (Bassem fetches it first) */
    const m = P.notifyRefs([], "", "دي المناقصة اللي كلمتك عنها امبارح", "rw0000000a1,eg-tnd-003", "ابعتلي المناقصة بتاعة امبارح");
    assert.deepEqual([[...m], [...m.unused]], [[], ["rw0000000a1", "eg-tnd-003"]]);
  });
  test("review F2: an id with spaces (22 international tenders) is one id — Bassem's ids are split on commas only", () => {
    const I = [OPP("item:intl-558/2026/BTB (BE2630001388)", "Supply of electrical equipment", "Banque de Tunisie"), OPP("item:intl-ET-CE BOA -541070-GO-RFQ", "Procurement of vehicles", "Ethiopian Ministry")];
    assert.deepEqual([...P.notifyRefs(I, "", "x", "intl-558/2026/BTB (BE2630001388), item:intl-ET-CE BOA -541070-GO-RFQ", "")], ["item:intl-558/2026/BTB (BE2630001388)", "item:intl-ET-CE BOA -541070-GO-RFQ"]);
    assert.deepEqual([...P.notifyRefs(I, "", "x", " intl-558/2026/BTB (BE2630001388) ;intl-ET-CE BOA -541070-GO-RFQ", "")].length, 2);
  });
  test("the opportunities named in the note (2+ of their own words), best first; the screen's one with 1 word; never more than 3", () => {
    const note = "ابعتلي تفاصيل مناقصة مطاحن مصر العليا ومناقصة water treatment chemicals";
    assert.deepEqual([...P.notifyRefs(L, "", note, "", "")], ["intel:rw0000000a1", "item:eg-tnd-003"]);
    assert.deepEqual([...P.notifyRefs(L, "intel:gh0000000b2", "the laboratory one", "", "")], ["intel:gh0000000b2"], "one word + the screen's bonus");
    assert.deepEqual([...P.notifyRefs(L, "", "the laboratory one", "", "")], [], "one word alone is not enough");
    /* review F1: five distinctly named items, the note names four of them → the first three by score */
    const many = [OPP("intel:ab00000a100", "Supply of steel pipes", "Lagos Water Board"), OPP("intel:ab00000a200", "Supply of diesel generators", "Kenya Power"), OPP("intel:ab00000a300", "Construction of rural roads", "Ghana Highways Authority"),
      OPP("intel:ab00000a400", "Laboratory reagents", "Ministry of Health Uganda"), OPP("intel:ab00000a500", "School furniture", "Rwanda Education Board")];
    const r = P.notifyRefs(many, "", "steel pipes lagos, diesel generators kenya power, rural roads ghana highways, laboratory reagents uganda", "", "");
    assert.deepEqual([...r], ["intel:ab00000a200", "intel:ab00000a300", "intel:ab00000a100"], "the cap: 3, by score");
  });
  test("review F1: the boilerplate every tender shares and the year fragments of a number name nothing — the real items.json notes pick the one tender named", () => {
    const R = real(["20/2026/2027", "23/2026/2027", "31/2026/2027"]);
    assert.ok(R.every(x => /^دعوة لتقديم العطاءات لتوريد/.test(x.o.title)), "the three real titles share the boilerplate");
    assert.deepEqual([...P.notifyRefs(R, "", "1) دعوة لتقديم العطاءات لتوريد حمض الهيدروكلوريك — آخر ميعاد 30 نوفمبر", "", "")], ["item:31/2026/2027"]);
    assert.deepEqual([...P.notifyRefs(R, "", "ابعتلك تفاصيل المناقصة رقم 23/2026/2027 زي ما اتفقنا", "", "")], ["item:23/2026/2027"]);
    assert.deepEqual([...P.notifyRefs(R, "", "ابعتلك تفاصيل المناقصة رقم ٢٣/٢٠٢٦/٢٠٢٧", "", "")], ["item:23/2026/2027"], "Arabic-Indic digits");
    assert.deepEqual([...P.notifyRefs(R, "", "المناقصة 123/2026/2027 وكمان 2026 و2027", "", "")], [], "a number inside a longer one, or the year alone, names nothing");
    assert.deepEqual([...P.notifyRefs(R, "", "دعوة لتقديم العطاءات لتوريد — آخر ميعاد 2026/2027", "", "")], [], "the shared boilerplate names nothing");
  });
  test("a list of three: a long title quoted in full beside two short ones — all three kept (each well covered by the note), an unrelated item with a coincidental word is not", () => {
    const R = real(["eg-tnd-003", "eg-tnd-045", "eg-tnd-059", "20/2026/2027"]);
    const note = "1) " + R[0].o.title + " — " + R[0].o.entity + "\n2) " + R[1].o.title + "\n3) " + R[2].o.title + " — " + R[2].o.entity;
    assert.deepEqual([...P.notifyRefs(R, "", note, "", "")].sort(), ["item:eg-tnd-003", "item:eg-tnd-045", "item:eg-tnd-059"]);
    assert.deepEqual([...P.notifyRefs(R, "", note + " (والتبريد)", "", "")].sort(), ["item:eg-tnd-003", "item:eg-tnd-045", "item:eg-tnd-059"], "one coincidental word of a fourth tender adds nothing");
  });
  test("a note about nothing named: the screen's opportunity only when the member's own last words asked to send it", () => {
    assert.deepEqual([...P.notifyRefs(L, "intel:gh0000000b2", "ملخص مكالمة النهارده", "", "طيب ابعتلي ده على الإيميل")], ["intel:gh0000000b2"]);
    assert.deepEqual([...P.notifyRefs(L, "intel:gh0000000b2", "ملخص مكالمة النهارده", "", "send it to my e-mail please")], ["intel:gh0000000b2"]);
    assert.deepEqual([...P.notifyRefs(L, "intel:gh0000000b2", "ملخص مكالمة النهارده", "", "تمام شكراً")], []);
    assert.deepEqual([...P.notifyRefs(L, "", "ملخص مكالمة النهارده", "", "ابعتلي")], [], "no screen item: nothing");
  });
  test("review F3 / R4: a tender page's list key beside the same tender from janna_lookup → the tool's own id, the screen's copy out of the list; alone, the list key stays", () => {
    const src = LIVE.slice(LIVE.indexOf("  /* the shared screen's opportunity. A platform tender page"), LIVE.indexOf("  function notifyGo("));
    const T3 = "تصنيع وتوريد وتركيب منشآت معدنية لصوامع (شون) قمح مغطاة بسعة إجمالية 60 ألف طن بمدينة طيبة الجديدة";
    const mk = (oppc, ctx) => { const sb = { OPPC: oppc, mwords: P.mwords, screenOppKey: () => "item:" + ctx.id, screenCtx: () => ctx }; vm.createContext(sb); vm.runInContext(src, sb); return sb; };
    const ctx = { type: "tender", id: "OFF:6/2026/2027", title: T3 };
    let sb = mk([OPP("item:OFF:6/2026/2027", T3, "", "OFF:6/2026/2027"), OPP("item:eg-tnd-003", T3, "شركة مطاحن مصر العليا", "6/2026/2027")], ctx);
    assert.equal(sb.notifyScreenKey(), "item:eg-tnd-003");
    assert.deepEqual(sb.OPPC.map(o => o.k), ["item:eg-tnd-003"], "one entry per tender");
    assert.deepEqual([...P.notifyRefs(sb.OPPC, "item:eg-tnd-003", "مناقصة صوامع القمح في طيبة الجديدة لشركة مطاحن مصر العليا", "", "")], ["item:eg-tnd-003"]);
    sb = mk([OPP("item:OFF:6/2026/2027", T3, "", "OFF:6/2026/2027")], ctx);
    assert.equal(sb.notifyScreenKey(), "item:OFF:6/2026/2027", "no tool result: the list key (the platform picks by the title sent with it)");
    sb = mk([OPP("item:eg-tnd-003", T3, "")], { type: "factory", id: "x", title: T3 });
    assert.equal(sb.notifyScreenKey(), "", "a factory page is no opportunity");
  });
  test("inflWait: «ابعتلي» waits for the server tools still running (≥ 0.6 s, ≤ max), a call older than 8 s no longer counts", async () => {
    const src = LIVE.slice(LIVE.indexOf("  var INFL = {}"), LIVE.indexOf("  /* the call's DOM events → its handlers"));
    const sb = { Promise, setTimeout, Date }; vm.createContext(sb); vm.runInContext(src, sb);
    let t0 = Date.now(); await sb.inflWait(4000); const idle = Date.now() - t0;
    assert.ok(idle >= 590 && idle < 1000, "nothing running: ~0.6 s, " + idle);
    sb.inflMark({ toolName: "bassem_intel", toolCallId: "c1" }, 1); sb.inflMark({ toolName: "janna_navigate", toolCallId: "c2" }, 1);
    setTimeout(() => sb.inflMark({ toolName: "bassem_intel", toolCallId: "c1" }, 0), 900);
    t0 = Date.now(); await sb.inflWait(4000); const busy = Date.now() - t0;
    assert.ok(busy >= 880 && busy < 1400, "until bassem_intel completed (a client tool is not waited for): " + busy);
    sb.inflMark({ toolName: "platform_item" }, 1);
    t0 = Date.now(); await sb.inflWait(700); assert.ok(Date.now() - t0 < 1000, "never past max");
  });
  test("what the member reads and what Bassem is told: «مرفق» only when the platform attached it; the reason when it did not; a timeout is «not sure»", () => {
    const src = LIVE.slice(LIVE.indexOf("  function nFiles("), LIVE.indexOf("  function bassemTool("));
    const said = [], told = [], outs = [];
    const sb = { T: (ar, en) => ar, sayAny: m => said.push(m), done: n => outs.push([n, "ok"]), outcome: (n, s) => outs.push([n, s]), refuse: (n, s, m) => { said.push(m); outs.push([n, s]); }, errMsg: e => String(e.code), tellBassem: t => told.push(t) };
    vm.createContext(sb); vm.runInContext(src, sb);
    const ok = (j, status = 200, unused) => { said.length = told.length = outs.length = 0; sb.notifyDone("bassem_notify_member", { status, j }, unused); return { s: said[0], t: told[0], o: outs[0] }; };
    let r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: { whatsapp: false }, attached: 1, items: [{ ref: "intel:rw0000000a1", found: true, title: "توريد كيماويات", file: { attached: true, name: "a.pdf", size: 1 } }] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل — والملف الرسمي مرفق في الإيميل"); assert.deepEqual(r.o, ["bassem_notify_member", "ok"]);
    assert.match(r.t, /^نتيجة «ابعتلي»: اتبعتت على الإيميل؛ "توريد كيماويات": تفاصيلها ولينكاتها والملف الرسمي اترفق في الإيميل\. قول للعضو اللي حصل ده بس\.$/);
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {}, attached: 2, items: [] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل — والملفين الرسميين مرفقين في الإيميل");
    r = ok({ ok: true, sent: { email: true, whatsapp: true }, pending: {}, attached: 1, items: [] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل والواتساب — والملف الرسمي مرفق في الإيميل", "review R9: never «with it» when WhatsApp went too");
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {}, attached: 0, items: [{ found: true, title: "صوامع", file: { attached: false, reason: "platform_listing", why: { ar: "ده إعلان من بيانات المنصة نفسها", en: "x" } } }] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل — بالتفاصيل واللينكات؛ الملف الرسمي مااترفقش: ده إعلان من بيانات المنصة نفسها"); assert.doesNotMatch(r.s, /مرفق$/);
    assert.match(r.t, /"صوامع": تفاصيلها ولينكاتها، والملف مااترفقش \(ده إعلان من بيانات المنصة نفسها\)/);
    /* review R9: different reasons → no one reason for all; links never reach Bassem; a long title cut at a word */
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {}, attached: 0, items: [{ found: true, title: "توريد وتسليم كيماويات معالجة المياه (كبريتات الألومنيوم) لمدة 24 شهراً", file: { attached: false, reason: "platform_listing", why: { ar: "ده إعلان من بيانات المنصة نفسها", en: "x" } } },
      { found: true, title: "ب", file: { attached: false, reason: "timeout", why: { ar: "موقع الجهة ماردّش في الوقت", en: "y" } } }, { found: false, reason: "unavailable", why: { ar: "ماقدرتش أوصل لمركز المعلومات — جرّب صفحتها بعد شوية: https://madeinegyptgate.com/intel/tenders/rw0000000a1/", en: "z" } }] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل — بالتفاصيل واللينكات؛ الملفات الرسمية مااترفقتش — سبب كل واحد مكتوب في الإيميل");
    assert.doesNotMatch(r.t, /https?:\/\//); assert.ok(r.t.includes('"توريد وتسليم كيماويات معالجة المياه (كبريتات…"'), "cut at a word, never inside one: " + r.t);
    assert.match(r.t, /الفرصة 3: مااتبعتش تفاصيلها \(ماقدرتش أوصل لمركز المعلومات — جرّب صفحتها بعد شوية\)/);
    /* review R9: nothing went → no «its details and links» for any opportunity */
    r = ok({ ok: false, sent: { email: false, whatsapp: false }, pending: { whatsapp: false }, attached: 0, items: [{ found: true, title: "توريد كيماويات", file: { attached: false, reason: "email_not_sent", why: { ar: "الإيميل نفسه مااتبعتش", en: "x" } } }] });
    assert.deepEqual([r.s, r.o], ["⚠️ الرسالة مااتبعتتش على أي قناة.", ["bassem_notify_member", "failed"]]);
    assert.equal(r.t, "نتيجة «ابعتلي»: مااتبعتتش على أي قناة. قول للعضو اللي حصل ده بس.");
    /* review R1: the notice came, the document did not */
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {}, attached: 1, items: [{ found: true, title: "كابلات كينيا", file: { attached: true, name: "n.pdf", size: 1, label: { ar: "إعلان المناقصة (Tender Notice)", en: "Tender Notice" },
      skipped: { label: { ar: "كراسة الشروط (Tender Document)", en: "Tender Document" }, reason: "too_large", why: { ar: "الملف كبير (9.4 ميجا) على الإيميل", en: "the file is too large for e-mail (9.4 MB)" } } } }] });
    assert.equal(r.s, "✅ اتبعتت على الإيميل — وفيه ملف مرفق في الإيميل، وفيه ملفات مااترفقتش — السبب مكتوب في الإيميل");
    assert.match(r.t, /"كابلات كينيا": تفاصيلها ولينكاتها، واترفق إعلان المناقصة \(Tender Notice\) بس — وكراسة الشروط \(Tender Document\) مااترفقش \(الملف كبير \(9\.4 ميجا\) على الإيميل، واللينك بتاعه في الإيميل\)/);
    /* review R2: Bassem's ids from an earlier call */
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {} }, 200, ["rw0000000a1"]);
    assert.equal(r.s, "✅ اتبعتت على الإيميل — من غير تفاصيل فرصة مش من نتايج المكالمة دي");
    assert.match(r.t, /الـ id «rw0000000a1» مش من نتايج المكالمة دي، فالإيميل راح من غير تفاصيلها — لو عايز تبعتها، هاتها الأول بأداتها بالـ id ده \(bassem_intel بـ action item، أو platform_item\) وبعدين ابعت تاني/);
    r = ok({ ok: true, sent: { email: true, whatsapp: false }, pending: {} });
    assert.equal(r.s, "✅ اتبعتت على الإيميل", "no items: today's words");
    r = ok({ code: "timeout" }, 0);
    assert.match(r.s, /^⏳ مش متأكد إنها اتبعتت/); assert.match(r.t, /مش متأكد إنها اتبعتت.*وماتبعتهاش تاني/); assert.deepEqual(r.o, ["bassem_notify_member", "failed"]);
    r = ok({ code: "notify_busy", retry_after: 5 }, 429);
    assert.match(r.s, /^⏳ مااتبعتتش: رسالة قبلها لسه بتتبعت/); assert.match(r.t, /وابعتها تاني بـ bassem_notify_member بعد دقيقة/);
    r = ok({ code: "rate_limited", error: "daily notify limit reached" }, 429);
    assert.equal(r.s, "⚠️ مااتبعتتش: rate_limited"); assert.match(r.t, /مااتبعتتش \(rate_limited\)/);
    assert.ok(told.every(t => !/["«»]\s*[\[{<]/.test(t)));
  });
  test("wiring (source checks): the notify branch → notifyGo → sendPost(body, \"/advisor/notify\", 60000) after inflWait, sent again on notify_busy; the screen's tender with its title; the three inflMark listeners; no MIGAPI.notify left; notifyDone tells Bassem", () => {
    assert.match(LIVE, /if \(name === "bassem_notify_member"\) \{ if \(LV && !LV\.closed && LV\.own && LV\.own\.bassem_notify_member\) return; notifyGo\(name, a\); return; \}/, "Bassem's SDK call: the handler sends (review 2026-11-21)");
    const go = LIVE.slice(LIVE.indexOf("  function notifyGo("), LIVE.indexOf("  function nFiles("));
    assert.ok(go.indexOf("inflWait(4000).then(") > 0 && go.indexOf("inflWait(4000).then(") < go.indexOf("return send(0);"), "inflWait first");
    assert.match(go, /sendPost\(body, "\/advisor\/notify", 60000\)/);
    assert.match(go, /x\.j\.code === "notify_busy"\) \|\| n >= 6 \|\| Date\.now\(\) - t0 > 40000\) return x;/);
    assert.match(go, /notifyRefs\(OPPC, sk, msg, a\.ids, heardTexts\(\)\.slice\(-2\)\.join\(" "\)\)/);
    assert.match(go, /items: refs\.map\(function \(r\) \{ return r === sk && st \? \{ ref: r, title: st \} : r; \}\)/);
    assert.match(go, /notifyDone\(name, x, refs\.unused\)/);
    const wire = LIVE.slice(LIVE.indexOf("  function wire(el) {"), LIVE.indexOf("  function widgetHtml("));
    for (const ev of ['"anam-agent:tool-call-started", function (e) { inflMark(e.detail, 1); }', '"anam-agent:tool-call-completed", function (e) { inflMark(e.detail, 0); }', '"anam-agent:tool-call-failed", function (e) { inflMark(e.detail, 0); }']) assert.ok(wire.includes(ev), ev);
    assert.ok(wire.indexOf("harvest(e.detail || {})") < wire.indexOf("inflMark(e.detail, 0)"), "the results are kept before the tool counts as done");
    assert.doesNotMatch(LIVE, /A\.notify|MIGAPI\.notify/);
    assert.match(LIVE.slice(LIVE.indexOf("  function notifyDone("), LIVE.indexOf("  function notifyWords(")), /tellBassem\(notifyWords\(x, un\)\);/);
    assert.match(LIVE, /function sendPost\(body, path, ms\) \{/);
  });
});

/* review 2026-11-21 — Bassem's call f75d15f4 (owner: «مبيبعتش حاجه»): six drafts, none sent; «ابعتهولي» had no path; «بعت لحضرتك ملخص
   التقرير على الإيميل» was said in the very reply that called bassem_notify_member, before the platform answered */
describe("review 2026-11-21: «ابعتهولي» (to = me), the honest «ابعتلي» answer", () => {
  test("selfTo: the member himself only when the WHOLE value says so — never an address, a name or a sentence", () => {
    for (const s of ["me", "Me.", "to me", "myself", "my email", "my e-mail", "My own e-mail", "ليا", "ليّا", "لي", "لنفسي", "إيميلي", "ايميلي", "على إيميلي", "بريدي", "ابعتهولي", "«ابعتهولي»", "أنا"])
      assert.equal(P.selfTo(s), true, s);
    for (const s of ["", null, "info@x.com", "info at x dot com", "me@x.com", "home", "ليه", "Rand Water", "ابعته لمحمد", "send it to me and to info@x.com", "ابعتهولي على info at x dot com", "إيميل الشركة"])
      assert.equal(P.selfTo(s), false, String(s));
  });
  /* cmpSelf in a sandbox: the composer, the clock of «he spoke since», and a recording sendPost */
  function selfBox({ spoke = true, body = "Dear Procurement Team,\nWe would like the RFQ documents.\nDr. Mohamed", answer = { status: 200, j: { ok: true, sent: { email: true, whatsapp: false } } } } = {}) {
    const S = load(), posts = [], outs = [], said = [];
    S.CMP = { at: S.clock.t, sub: { value: "RFQ Inquiry" }, body: { value: body }, busy: false };
    S.USER_T = spoke ? S.clock.t + 1000 : S.clock.t - 1000;
    S.cmpDraft = () => !!S.CMP; S.cmpSay = (m, bad) => said.push([m, !!bad]); S.doing = () => {}; S.outcome = (t, st, x) => outs.push([t, st, x]);
    S.sendPost = (b, path, ms) => { posts.push({ b, path, ms }); return Promise.resolve(answer); };
    vm.runInContext(LIVE.slice(LIVE.indexOf("  var SELF_MAX = "), LIVE.indexOf("  /* bassem_draft_email / bassem_send_email → a Promise of the text Bassem is given")), S);
    return { S, posts, outs, said };
  }
  test("the draft goes to HIS OWN registered e-mail (POST /advisor/notify, channel email — no address from the page), never to the buyer", async () => {
    const { S, posts, outs } = selfBox();
    const w = await S.cmpSelf("bassem_send_email");
    assert.equal(posts.length, 1); assert.equal(posts[0].path, "/advisor/notify");
    assert.deepEqual(Object.keys(posts[0].b).sort(), ["channel", "message"], "no to / email field: the Worker reads his address from his account");
    assert.equal(posts[0].b.channel, "email"); assert.equal(posts[0].b.message, "RFQ Inquiry\n\nDear Procurement Team,\nWe would like the RFQ documents.\nDr. Mohamed");
    assert.match(w, /اتبعتتله نسخة من الإيميل على إيميله المسجّل في المنصة \(المنصة أكدت\)\. للجهة لسه مااتبعتش حاجة/);
    assert.deepEqual(outs.map(o => o[1]), ["refused"], "the buyer got nothing: no task or deal step closes on a copy");
    assert.match(await S.cmpSelf("bassem_send_email"), /مش هتتبعت مرتين/); assert.equal(posts.length, 1, "the same copy is not sent twice");
  });
  test("refused before he spoke since the draft appeared, for a draft too long to copy (never cut), and said honestly when it did not go", async () => {
    let b = selfBox({ spoke: false });
    assert.match(await b.S.cmpSelf("bassem_send_email"), /^لسه مااتبعتش: هو ماقالش حاجة/); assert.equal(b.posts.length, 0);
    b = selfBox({ body: "x".repeat(2000) });
    assert.match(await b.S.cmpSelf("bassem_send_email"), /^مااتبعتتش النسخة: الإيميل أطول/); assert.equal(b.posts.length, 0);
    b = selfBox({ answer: { status: 200, j: { ok: false, sent: { email: false, whatsapp: false }, errors: { email: "no email" } } } });
    const w = await b.S.cmpSelf("bassem_send_email");
    assert.match(w, /^مااتبعتتش النسخة على إيميله \(no email\)\. قوله كده بصراحة، وماتقولش إنها اتبعتت\./);
    assert.deepEqual(b.outs.map(o => o[1]), ["failed"]);
    b = selfBox({ answer: { status: 0, j: { code: "timeout" } } });
    assert.match(await b.S.cmpSelf("bassem_send_email"), /مش متأكد إنها وصلت/);
  });
  test("wiring: to = me reaches cmpSelf from the composer; a draft in a deal room is refused with words he can act on", () => {
    const f = LIVE.slice(LIVE.indexOf("  function cmpSendFor("), LIVE.indexOf("  function mailTool("));
    assert.match(f, /if \(selfTo\(a\.to\)\) return capped\(cmpSelf\(name\), 23000, LATE_SEND\(\)\);/);
    assert.ok(f.indexOf("selfTo(a.to)") < f.indexOf("toArg(a.to)"), "before the address parser");
    const m = LIVE.slice(LIVE.indexOf("  function mailTool("), LIVE.indexOf("  /* ---------- links in Bassem's messages"));
    assert.match(m, /if \(LAST_DRAFT === "room" && !deal && selfTo\(a\.to\)\) \{\s*outcome\(name, "refused", "a copy to himself goes from the e-mail draft only"\);/);
  });
  test("«ابعتلي»: Bassem's SDK call answers AT ONCE «being sent, not sent» (heard once the tool waits for a result), and sends exactly as before", () => {
    assert.match(LIVE, /c\.registerToolCallHandler\("bassem_notify_member", \{ onStart: function \(pl\) \{[^\n]*return notifyStart\(x \|\| \{\}\); \} \}\); me\.own\.bassem_notify_member = 1;/);
    const st = LIVE.slice(LIVE.indexOf("  function notifyStart("), LIVE.indexOf("  function notifyGo("));
    assert.match(st, /notifyGo\("bassem_notify_member", a\);/);
    assert.match(st, /لسه بيتبعت ومااتأكدش: قوله في جملة قصيرة «ببعتهولك دلوقتي، وهقولك أول ما يوصل» — ماتقولش «بعت» ولا «اتبعت»/);
    assert.doesNotMatch(st, /اتبعت ✓|Sent ✓/);
    const sb = { T: (ar) => ar, calls: [] }; vm.createContext(sb);
    vm.runInContext(st + "\n", sb); sb.notifyGo = (n, a) => sb.calls.push([n, a]);
    assert.match(sb.notifyStart({ message: "ملخص" }), /^لسه بيتبعت ومااتأكدش/); assert.equal(sb.calls.length, 1);
    assert.match(sb.notifyStart({ message: "  " }), /^مااتبعتش: الرسالة فاضية/); assert.equal(sb.calls.length, 2, "notifyGo says the refusal on the screen itself");
  });
});
