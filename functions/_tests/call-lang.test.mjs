// node --test for «any language» in the live call (owner 2026-11-20: «جنة او باسم يتكلموا اي لغه في العالم بناءا علي الشخص اللي بيكلمهم»;
// Egyptian Arabic must not get worse: «اه», «اوكيه», «متضايق», Franco). The pure blocks of the browser files run in a vm sandbox, sliced
// from the files themselves (no DOM): the 🌐 languages (data/janna-live.js @lang-pure), the noise judge for other languages, Bassem's draft
// summary in the member's language, dictated e-mail words in other languages, the captions' direction (data/captions.js) and the scripted
// bubble's Franco / other-language rule (data/janna.js). Plus source checks of the 🌐 wiring. In functions/_tests (not worker/test) so it
// gates deploy-site, the pipeline that ships these files.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const LIVE = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
const CAP = readFileSync(new URL("../../data/captions.js", import.meta.url), "utf8");
const JN = readFileSync(new URL("../../data/janna.js", import.meta.url), "utf8");
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };

/* Anam's own speech-to-text languages (docs personas/voices/multilingual, read 2026-11-20): 57 + the 9 beta ones */
const ANAM = ("en af ar hy az be bs bg ca zh hr cs da nl et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mi mr ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy"
  + " bn yue gu ha ln mt oc tg te").split(" ");

const lang = (() => { const sb = {}; vm.createContext(sb); vm.runInContext(cut(LIVE, "  /* @lang-pure-begin", "  /* @lang-pure-end */"), sb); return sb; })();

describe("🌐 the languages a person may speak (data/janna-live.js @lang-pure)", () => {
  test("exactly Anam's 66 speech-to-text codes, each once, each with its native, Arabic and English name", () => {
    const codes = lang.CALL_LANGS.map(r => r[0]);
    assert.equal(codes.length, 66);
    assert.deepEqual([...codes].sort(), [...ANAM].sort());
    assert.equal(new Set(codes).size, 66, "no duplicates");
    for (const r of lang.CALL_LANGS) { assert.equal(r.length, 4, r[0]); for (const x of r) assert.ok(typeof x === "string" && x.trim().length > 0, r[0]); }
    assert.deepEqual([...lang.CALL_LANGS[0]], ["ar", "العربية", "عربي", "Arabic"]);
    assert.equal(lang.langRow("YUE")[3], "Cantonese");
    assert.equal(lang.langRow("xx"), null);
  });
  test("the LLM's LANGUAGE line: the code, the name, the tools' words stay Arabic or English; Arabic = Egyptian as the rules say", () => {
    const fr = lang.langNote("fr");
    assert.match(fr, /^LANGUAGE: fr \(French\)\./); assert.match(fr, /speak only French/); assert.match(fr, /Arabic or English/);
    assert.doesNotMatch(fr, /greet them again/, "mid-call: no second greeting");
    assert.match(lang.langNote("fr", true), /greet them again in one short sentence in French/);
    assert.match(lang.langNote("ar"), /^LANGUAGE: ar \(Arabic\)\..*Egyptian Arabic exactly as your rules say/);
    assert.match(lang.langNote("nonsense"), /^LANGUAGE: ar /);
  });
  test("typed text suggests a language only for an unmistakable script — never Arabic, Franco, English or any Latin text", () => {
    for (const s of ["اه", "اوكيه", "أنا متضايق شوية", "ابعتلي الإيميل furniture", "ok", "yes please", "Bonjour", "Je cherche des usines de ciment",
      "I need steel factories in Giza", "ana 3ayez masane3 7adid", "Hola, busco fábricas de acero", "", "123", "שלום اه"]) assert.equal(lang.scriptLang(s), "", s);
    assert.equal(lang.scriptLang("我需要钢铁"), "zh");
    assert.equal(lang.scriptLang("鉄鋼が必要です"), "ja", "kana before Han");
    assert.equal(lang.scriptLang("철강이 필요합니다"), "ko");
    assert.equal(lang.scriptLang("אני צריך פלדה"), "he");
    assert.equal(lang.scriptLang("Χρειάζομαι χάλυβα"), "el");
    assert.equal(lang.scriptLang("ฉันต้องการเหล็ก"), "th");
    assert.equal(lang.scriptLang("мне нужна сталь"), "menu");
    assert.equal(lang.scriptLang("मुझे स्टील चाहिए"), "menu");
    assert.equal(lang.scriptLang("я"), "", "one letter is no language");
    assert.equal(lang.scriptLang("please send the 価格 list for steel bars"), "", "a word inside an English sentence");
  });
});

/* the noise judge (data/janna-live.js, sliced as functions/_tests/janna-noise.test.mjs does) */
const nz = (() => { const sb = { window: {} }; vm.createContext(sb); vm.runInContext("var NZ = { his: 0, hv: [] };\n" + cut(LIVE, "  var NZ_STOP", "  function nzNum(") + cut(LIVE, "  function nzNorm(", "  function nzTyped("), sb); return sb; })();

describe("the noise judge: other languages are never noise, and Egyptian Arabic is judged as before", () => {
  test("Egyptian short answers, stop words and names: a real turn", () => {
    for (const w of ["اه", "اوكيه", "ايوه", "تمام", "متضايق", "لا", "ok", "yes", "stop", "استنى", "جنة", "باسم", "بس", "شكرا", "مدى إيه", "ڤيديو", "the", "you"]) assert.equal(nz.nzJudge(w), "", w);
    for (const w of ["ممم", "ام", "uh", "um", "hmm"]) assert.equal(nz.nzJudge(w), "noise", w);
  });
  test("any other language: a real turn, never an offer of noisy-room mode", () => {
    for (const w of ["подождите", "我需要钢铁", "जी हाँ", "oui", "ça va", "sí", "vale", "evet", "hayır", "ja", "non", "nein", "sawa", "はい", "네", "Ναι", "שלום", "attendez", "espera"]) assert.equal(nz.nzJudge(w), "", w);
  });
  test("a stop word of the 🌐 languages wins over the recogniser's own noise phrase", () => {
    assert.equal(nz.nzJudge("thanks for watching"), "noise");
    for (const w of ["thanks for watching attendez", "thanks for watching espera", "thanks for watching warte", "thanks for watching bekle"]) assert.equal(nz.nzJudge(w), "", w);
  });
});

/* the e-mail helpers (the block bassem-email.test.mjs runs; @lang-pure is inside it) */
const A = LIVE.indexOf("  /* @mail-pure-begin"), B = LIVE.indexOf("  /* POST /api/advisor/send with the member's platform sign-in");
function mail(en = false) {
  const sb = { EN: en, T: (ar, e) => (en ? e : ar), frame: null, CMP: null, screenWin: () => ({ location: { pathname: "/" } }), screenCtx: () => null, advDoc: () => null, dealMails: () => [] };
  vm.createContext(sb); vm.runInContext(LIVE.slice(A, B), sb); return sb;
}
const M = mail(), ME = mail(true);

describe("Bassem's draft summary in the language the member speaks (draftWords, langName)", () => {
  test("he speaks Arabic (no 🌐 choice): exactly the words of before", () => {
    for (const [lg, o] of [["en", null], ["sw", { market: "africa:ke", country: "كينيا" }], ["ar", null], ["", null]]) {
      assert.equal(M.draftWords("cmp", {}, lg, o, "ar"), M.draftWords("cmp", {}, lg, o), lg);
      assert.equal(M.draftWords("room", {}, lg, o, undefined), M.draftWords("room", {}, lg, o), lg);
    }
    assert.match(M.draftWords("cmp", {}, "en", null, "ar"), /قوله دلوقتي في جملتين أو تلاتة بالمصري الإيميل بيقول إيه/);
  });
  test("he chose French with 🌐: the summary in French, «not in his language» only when the e-mail is not French", () => {
    const fr = M.draftWords("cmp", {}, "fr", null, "fr");
    assert.match(fr, /بالفرنساوي \(لغته هو\)/); assert.doesNotMatch(fr, /مش بلغته/); assert.doesNotMatch(fr, /بالمصري/);
    const en = M.draftWords("cmp", {}, "en", null, "fr");
    assert.match(en, /مش بلغته/); assert.match(en, /قوله معناه بلغته جملة جملة/);
    assert.match(ME.draftWords("cmp", {}, "en", null, "fr"), /in his language \(French\).*it is not in his language/);
    assert.match(M.draftWords("cmp", {}, "en", null, "ja"), /بالياباني \(لغته هو\)/);
  });
  test("langName: today's 11 names unchanged, every 🌐 language named", () => {
    const old = { ar: "عربي", en: "إنجليزي", fr: "فرنساوي", pt: "برتغالي", zh: "صيني", sw: "سواحيلي", es: "إسباني", de: "ألماني", tr: "تركي", ru: "روسي", it: "إيطالي" };
    for (const k of Object.keys(old)) assert.equal(M.langName(k), old[k], k);
    assert.equal(ME.langName("fr"), "French"); assert.equal(M.langName("ko"), "كوري"); assert.equal(ME.langName("yue"), "Cantonese"); assert.equal(M.langName("xx"), "XX");
  });
});

describe("dictated e-mail addresses in other languages (mailTokens / spokenMail)", () => {
  test("the at / dot / underscore / dash words of other languages", () => {
    const cases = [
      ["info arobase societe point fr", "info@societe.fr"], ["ventas arroba empresa punto com", "ventas@empresa.com"],
      ["info chiocciola azienda punto it", "info@azienda.it"], ["info at firma punkt de", "info@firma.de"], ["kontakt klammeraffe firma punkt de", "kontakt@firma.de"],
      ["info собака company точка ru", "info@company.ru"], ["info艾特company点com", "info@company.com"], ["satis arroba firma nokta com nokta tr", "satis@firma.com.tr"],
      ["jean tiret bas dupont arobase gmail point com", "jean_dupont@gmail.com"], ["ventas guion bajo norte arroba empresa punto com", "ventas_norte@empresa.com"],
      ["info trattino basso vendite chiocciola azienda punto it", "info_vendite@azienda.it"], ["max unterstrich muster at firma punkt de", "max_muster@firma.de"],
      ["sales tiret team arobase abc point fr", "sales-team@abc.fr"],
      ["info at lamuwest dot example dot ke", "info@lamuwest.example.ke"], ["ابعته على info آت lamuwest دوت example دوت ke لو سمحت", "info@lamuwest.example.ke"],
    ];
    for (const [said, addr] of cases) assert.equal(M.spokenMail(said), addr, said);
  });
  test("ordinary words stay no address", () => {
    for (const s of ["le point de vente", "punto de venta", "à ce point là", "下午三点见", "info et societe point fr", "I am at the office"]) assert.equal(M.spokenMail(s), "", s);
  });
  test("review F4: the English «tire» (tyre) stays a word — never the Turkish dash", () => {
    for (const [said, addr] of [["info at egypt tire dot com", "info@egypttire.com"], ["sales at cairo tire dot com dot eg", "sales@cairotire.com.eg"], ["info at alex tire company dot com", "info@alextirecompany.com"]])
      assert.equal(M.spokenMail(said), addr, said);
    assert.equal(M.spokenMail("ventas guion norte arroba empresa punto com"), "ventas-norte@empresa.com", "the other dash words stay");
  });
});

describe("captions in any language (data/captions.js)", () => {
  const sb = { EN: false }; vm.createContext(sb);
  vm.runInContext(cut(CAP, "  function clean(s) {", "  function speakerName()") + cut(CAP, "  function dirOf(s)", "  function render("), sb);
  test("rtl for a right-to-left script (an Arabic caption with Latin words stays rtl), ltr for another letter, the page's for none", () => {
    for (const s of ["أهلاً بيك", "Rand Water لسه مفتوح", "مناقصة 2026", "שלום עולם", "آپ کیسے ہیں", "سلام، چطوری؟"]) assert.equal(sb.dirOf(s), "rtl", s);
    for (const s of ["Bonjour, je cherche de l'acier.", "Hola", "Привет", "你好", "こんにちは", "안녕하세요", "Γεια σας"]) assert.equal(sb.dirOf(s), "ltr", s);
    assert.equal(sb.dirOf("2026 — 15%"), "rtl", "no letter: the Arabic page's");
  });
  test("cue tags in any script are dropped, the words stay", () => {
    assert.equal(sb.clean("[دافئة] أهلاً"), "أهلاً");
    assert.equal(sb.clean("[happy] Bonjour [chaleureuse] !"), "Bonjour !");
    assert.equal(sb.clean("[متفهمة] تمام [supportive]"), "تمام");
  });
  test("the box isolates its content so its dir decides (plaintext ignored dir), the name in its own run", () => {
    assert.match(CAP, /unicode-bidi:isolate\}/); assert.doesNotMatch(CAP, /unicode-bidi:plaintext/);
    assert.match(CAP, /"<b><bdi>" \+ esc\(who\) \+ "<\/bdi>:<\/b>" \+ '<span dir="' \+ d \+ '" style="unicode-bidi:isolate"'/);
  });
});

describe("the scripted «اسأل جنة» bubble (data/janna.js): Franco is Arabic, another language gets the live call", () => {
  const sb = {}; vm.createContext(sb); vm.runInContext(cut(JN, "  var FRANCO_X =", "  function handle("), sb);
  test("Franco Arabic", () => {
    for (const s of ["ana 3ayez masane3 7adid", "3ayez asa3ar el 7adid", "masna3", "ana mesh fahem", "ezayak 3amel eh"]) assert.equal(sb.franco(s), true, s);
    for (const s of ["I need steel factories in Giza", "b2b platform for factories", "price of iphone15", "wire mesh factory", "covid19 rules", "ok", "hello Janna"]) assert.equal(sb.franco(s), false, s);
  });
  test("review F3: sizes, units and grades are English, not Franco; «3ayez», «7adid», «masane3» still are", () => {
    for (const s of ["price of steel per m2", "concrete price per m3", "I need 8mm rebar", "5kg bags of cement", "2x2 steel tubes", "galvanized sheets 0.5mm and 3mm",
      "need 6kw generator", "hello, do you have s3 grade?", "5tons of steel", "3pcs of 10inches pipes", "12kwh meters", "usb3 cables", "ipv6 routers"]) assert.equal(sb.franco(s), false, s);
    for (const s of ["3ayez", "7adid", "masane3", "3andy masna3", "ba2a keda"]) assert.equal(sb.franco(s), true, s);
  });
  test("review F3: an accented brand or loanword inside English is English", () => {
    for (const s of ["Do you have Nestlé suppliers?", "café equipment suppliers", "suppliers for Citroën parts", "Do you have aluminium die casting factories? Nestlé"]) assert.equal(sb.otherLang(s), false, s);
    for (const s of ["Olá, preciso de aço", "¿Dónde está la fábrica de acero?", "Je cherche des usines d'acier en Égypte"]) assert.equal(sb.otherLang(s), true, s);
  });
  test("another language — never English", () => {
    for (const s of ["Bonjour, je cherche de l'acier", "Hola, busco fábricas de acero", "Ich suche Stahl", "我需要钢铁", "мне нужна сталь", "Merhaba, çelik fabrikası arıyorum"]) assert.equal(sb.otherLang(s), true, s);
    for (const s of ["I need steel factories in Giza", "steel pipes cairo", "plastic factories", "what can you do", "die casting factories", "ok", "ana 3ayez masane3 7adid", "مصانع حديد"]) assert.equal(sb.otherLang(s), false, s);
  });
  test("wiring: Franco switches the bubble to Arabic; another language gets one line in both languages and the live call, not spoken", () => {
    const h = cut(JN, "  function handle(", "  function understand(");
    assert.match(h, /if \(fr\) \{ if \(L !== "ar"\) setLang\("ar", true\); \}/);
    assert.match(h, /seg\("جنة المباشرة بتتكلم لغتك — كلّمها فيديو أو اكتبلها بلغتك", "happy"\), seg\("Live Janna speaks your language — call or type to her in it", "happy"\)\], q: q, acts: \[chip\(\["live"\]\)/);
    assert.match(h, /speak: false/);
    assert.match(h, /if \(oth && liveOn\(\) && !langsOff\(\)\)/, "review F5: no «speaks your language» promise while call_languages is off");
    sb.window = { MIGFLAGS: { on: k => (k === "call_languages" ? false : true) } }; assert.equal(sb.langsOff(), true);
    sb.window = { MIGFLAGS: { on: () => true } }; assert.equal(sb.langsOff(), false);
    sb.window = {}; assert.equal(sb.langsOff(), false, "no flags file: on");
  });
});

describe("data/janna-live.js 🌐 wiring (source checks)", () => {
  const body = name => cut(LIVE, "  function " + name + "(", "\n  }\n");
  test("the mid-session update carries languageCode ONLY (sttProvider / sttLanguages cannot change mid-session)", () => {
    assert.match(body("langSend"), /sendDataMessage\(JSON\.stringify\(\{ message_type: "persona_config", data: \{ languageCode: code \} \}\)\)/);
    const all = LIVE.match(/message_type: "persona_config", data: \{[^}]*\}/g) || [];
    assert.ok(all.length >= 2, "the noise guard's own update stays");
    for (const m of all) assert.ok(/data: \{ languageCode: code \}$/.test(m) || /data: \{ voiceDetectionOptions: \{ endOfSpeechSensitivity: want \}$/.test(m), m);
    assert.doesNotMatch(LIVE, /\b(sttProvider|sttLanguages)\s*:/, "never sent from the page");
  });
  test("a call where nobody chose sends nothing: the per-part re-send needs a stored choice that differs from the persona's own", () => {
    const p = body("langPart");
    assert.match(p, /var stored = langStored\(\);\s*if \(stored && stored !== langDef\(\)\) \{ LG\.prev = langDef\(\); langSend\(me, stored, me\.cont \? 0 : 2\); \}/);
    assert.match(body("langStored"), /langRow\(s\) && s !== langDef\(\) \? s : ""/);
    assert.match(body("langDef"), /persona === "janna" && EN \? "en" : "ar"/, "Bassem hears Arabic on both pages");
    assert.match(body("langWire"), /on\("DATA_CHANNEL_OPEN", function \(\) \{ setTimeout\(function \(\) \{ langPart\(me\); \}, 0\); \}\)/);
  });
  test("only the person changes it: langSet is called from the menu, the chip and JANNA_LIVE.lang — never from what was heard or typed", () => {
    const at = [], rx = /langSet\(/g; let m;
    while ((m = rx.exec(LIVE))) {
      const before = LIVE.slice(0, m.index);
      if (/function $/.test(before)) continue;
      const fn = /\n  function (\w+)\(|\n  window\.JANNA_LIVE\.(\w+) = function/g; let f, last = "";
      while ((f = fn.exec(before))) last = f[1] || "JANNA_LIVE." + f[2];
      at.push(last);
    }
    assert.ok(at.length >= 4, at.join());
    for (const w of at) assert.ok(/^(langMenu|langChip|JANNA_LIVE\.lang)$/.test(w), w);
    assert.doesNotMatch(body("langTyped"), /langSet/); assert.doesNotMatch(body("langAskBrowser"), /langSet/);
  });
  test("the owner's switch and the widget turn it off; the LANGUAGE line goes as context, never as his message", () => {
    assert.match(body("langOn"), /!!sdkBox\(\) && !\(F && F\.on && F\.on\("call_languages"\) === false\)/);
    assert.match(LIVE, /addContext\(langNote\(code, note === 2\)\)/);
    assert.doesNotMatch(LIVE, /sendUserMessage\([^)]*(langNote|LANGUAGE)/);
    assert.match(LIVE, /micDrop\(\); langDrop\(\); \/\* the widget captures its own microphone; no 🌐 there \*\//);
  });
  test("applied only by a PERSONA_CONFIG_UPDATE_APPLIED naming languageCode; a SERVER_WARNING within 5 s puts it back", () => {
    assert.match(body("langWire"), /on\("PERSONA_CONFIG_UPDATE_APPLIED", function \(x\) \{ if \(cfHas\(x && x\.changedFields, "languageCode"\)\)/);
    assert.match(body("langWarn"), /if \(!LG\.sentT \|\| LG\.applied \|\| Date\.now\(\) - LG\.sentT > 5000\) return;/);
    assert.match(body("langWarn"), /addContext\("NOTE \(the listening language did NOT change\): switching what you hear to "/, "review CP-3: the refusal is no LANGUAGE: line (the prompts read those as a choice made)");
    assert.doesNotMatch(LIVE, /"LANGUAGE: switching/);
    assert.match(LIVE, /ماقدرتش أغيّر لغة السمع — تقدر تكتب بلغتك في الخانة تحت<\/bdi><br><bdi dir="ltr" lang="en">I could not switch the listening language — you can type in your language in the box below/);
    assert.match(LIVE, /on\("PERSONA_CONFIG_UPDATE_APPLIED", function \(x\) \{ var cf = x && x\.changedFields; if \(!cfAny\(cf\) \|\| cfHas\(cf, "voiceDetectionOptions"\)/, "the noise guard's listener checks changedFields too");
  });
  test("cfHas reads changedFields as an object, a list or a string, in camel or snake case", () => {
    const sb = {}; vm.createContext(sb); vm.runInContext(cut(LIVE, "  function cfHas(", "  /* the person's choice"), sb);
    assert.equal(sb.cfHas({ languageCode: "fr" }, "languageCode"), true);
    assert.equal(sb.cfHas({ language_code: "fr" }, "languageCode"), true);
    assert.equal(sb.cfHas(["languageCode"], "languageCode"), true);
    assert.equal(sb.cfHas("languageCode,voiceDetectionOptions", "languageCode"), true);
    assert.equal(sb.cfHas({ voiceDetectionOptions: { endOfSpeechSensitivity: 0.4 } }, "endOfSpeechSensitivity"), true);
    assert.equal(sb.cfHas({ voiceDetectionOptions: { endOfSpeechSensitivity: 0.4 } }, "languageCode"), false);
    assert.equal(sb.cfHas({}, "languageCode"), false); assert.equal(sb.cfAny({}), false); assert.equal(sb.cfAny({ a: 1 }), true);
  });
  test("suggestions: at most once per browser and language, never on Arabic / Latin text, the browser's ar / en never on the Arabic pages", () => {
    const ask = body("langAsk"), br = body("langAskBrowser");
    assert.match(ask, /localStorage\.getItem\("mig-jnl-langask"\)/); assert.match(ask, /LG\.askUntil = now \+ 20000/);
    assert.match(br, /if \(!langOn\(\) \|\| langStored\(\)\) return;/);
    assert.match(br, /if \(persona === "janna" && EN && p === "ar"\) \{ langAsk\("ar"\); return; \}/);
    assert.match(br, /if \(persona === "bassem" && EN && p === "en"\) \{ langAsk\("en"\); return; \}/);
    assert.match(br, /if \(p !== "ar" && p !== "en" && p !== def\) langAsk\(p\);/);
    assert.match(LIVE, /langTyped\(t\); \/\* 🌐 a script only some languages write in: a suggestion, never a switch \*\//);
  });
  test("review F5: call_languages turned off mid-call puts a call that hears another language back to the persona's own, once", () => {
    const sent = [], ctx = [], sb = { LV: null, LG: { mem: {} }, EN: false, persona: "bassem", window: { MIGFLAGS: { on: () => false } }, sessionStorage: { getItem: () => "", setItem() {}, removeItem() {} }, Date };
    sb.sdkBox = () => ({});
    vm.createContext(sb);
    vm.runInContext(cut(LIVE, "  /* @lang-pure-begin", "  /* @lang-pure-end */") + ["langOn", "langDef", "langStore", "langSend", "langOff"].map(n => body(n) + "\n  }\n").join(""), sb);
    const me = { ready: true, dc: true, closed: false, swapped: false, lang: "fr", client: { sendDataMessage: m => sent.push(JSON.parse(m)), addContext: t => ctx.push(t) } };
    sb.LV = me; sb.langOff(); sb.langOff();
    assert.deepEqual(sent, [{ message_type: "persona_config", data: { languageCode: "ar" } }], "once, bypassing the switch");
    assert.equal(ctx.length, 1); assert.match(ctx[0], /^LANGUAGE: ar \(Arabic\)\. The platform turned the 🌐 language switch off/); assert.match(ctx[0], /Egyptian Arabic exactly as your rules say/);
    assert.equal(me.lang, "ar"); assert.equal(sb.LG.sentT, 0, "no refusal is awaited for the persona's own language");
    const me2 = { ...me, lang: "ar", client: { sendDataMessage: m => sent.push(m) } }; sb.LV = me2; sb.langOff();
    const me3 = { ...me, lang: "fr", ready: false, client: { sendDataMessage: m => sent.push(m) } }; sb.LV = me3; sb.langOff();
    sb.window.MIGFLAGS.on = () => true; const me4 = { ...me, lang: "fr", client: { sendDataMessage: m => sent.push(m) } }; sb.LV = me4; sb.langOff();
    assert.equal(sent.length, 1, "nothing for a call in its own language, a part not ready, or while the switch is on");
    assert.match(LIVE, /window\.addEventListener\("mig:flags", function \(\) \{ try \{ langOff\(\); \} catch \(e\) \{\} try \{ langUi\(\); \} catch \(e\) \{\} \}\);/);
  });
  test("a long call's next part keeps the language; the placeholder invites any language; JANNA_LIVE.lang()", () => {
    assert.match(body("resumeText"), /s \+= "\\nLANGUAGE: " \+ lc \+ " \(" \+ langRow\(lc\)\[3\] \+ "\): continue only in " \+ langRow\(lc\)\[3\] \+ "\."/);
    assert.match(LIVE, /inp\.clientWidth >= 220 \? T\("اكتب رسالتك بأي لغة…", "Type a message in any language…"\) : T\("اكتب بأي لغة…", "Any language…"\)/);
    assert.match(LIVE, /window\.JANNA_LIVE\.lang = function \(code\) \{[^\n]*return \{ current: callLang\(\), def: langDef\(\), stored: langStored\(\), applied: LG\.applied, warn: LG\.warn \}; \};/);
  });
});
