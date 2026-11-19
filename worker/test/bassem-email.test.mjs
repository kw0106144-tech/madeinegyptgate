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
    assert.match(w, /في جملتين أو تلاتة بالمصري الإيميل بيقول إيه/);
    assert.match(w, /«تحب أبعته؟»/);
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
