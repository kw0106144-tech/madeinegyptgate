// node --test for src/notify-items.js (the «ابعتلي» e-mail with the opportunities themselves) — pure parts: the refs, the reasons, the e-mail
// and the WhatsApp text. End to end through POST /api/advisor/notify: test/notify.test.mjs. Nothing is fetched here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRefs, refTitles, enUrl, fileSlot, notifyMail, notifyWa, replyItems, whyMap, dropFiles, WHY, whyOf, NOTIFY_LIM, PACK_HOST, PAGES_ORIGIN, fmtMoney, statusWord, fmtDate } from "../src/notify-items.js";
import { PAGES_ORIGIN as DEV_PAGES_ORIGIN } from "../src/acc-dev.js";

const NOW = Date.parse("2026-11-19T18:00:00Z");
const DOC_URL = "https://www.etenders.gov.za/home/Download?blobName=0f1e2d3c-advert.pdf&downloadedFileName=RW%2001234%20RFQ%20advert.pdf";
const intel = (over = {}) => ({ ref: "intel:rw0000000a1", type: "intel", id: "rw0000000a1", found: true, rt: "توريد كيماويات",
  card: { kind: "rfq", kind_label: "طلب عرض أسعار", kind_label_en: "Request for quotation", market: "africa:za", title: "توريد وتسليم كيماويات معالجة المياه", title_en: "", title_orig: "Supply and delivery of water treatment chemicals",
    title_is_original: false, entity: "Rand Water", country: "South Africa", market_name: "جنوب أفريقيا", market_name_en: "South Africa", sector: "", sector_en: "", published: "2026-11-10", deadline: "2026-11-24", status: "open",
    value: 1250000, currency: "ZAR", currency_ar: "راند", summary: "طلب عرض أسعار من Rand Water.", summary_en: "", summary_original: "Ref RW 01234 RFQ", source_name: "جنوب أفريقيا — بوابة المناقصات الحكومية", source_name_en: "South Africa — eTenders", ...(over.card || {}) },
  links: { page: "https://madeinegyptgate.com/intel/rfq/rw0000000a1/", page_en: "https://madeinegyptgate.com/intel/en/rfq/rw0000000a1/", official: DOC_URL, doc: DOC_URL, ...(over.links || {}) },
  file: over.file || { attached: true, name: "RW 01234 RFQ advert.pdf", type: "application/pdf", size: 482113, b64: "JVBERi0xLjQK", from: "official" } });
const tender = (over = {}) => ({ ref: "item:eg-tnd-003", type: "item", id: "eg-tnd-003", found: true, rt: "صوامع", pageNote: over.pageNote || "",
  card: { kind: "platform_tender", title: "تصنيع وتوريد وتركيب منشآت معدنية لصوامع قمح", title_en: "Metallic structures for wheat bunkers", ref: "6/2026/2027", type: "مناقصة عامة", entity: "شركة مطاحن مصر العليا", entity_en: "Upper Egypt Flour Mills",
    market: "local", country: "مصر", country_en: "", governorate: "الأقصر", city: "طيبة الجديدة - الأقصر", activity: "الحديد والصلب والمعادن", deadline: "2026-12-08", bond: 1000000, bond_note: "", booklet: 7000, value: null, currency: "", source_name: "meobserver.news", ...(over.card || {}) },
  links: { page: "https://madeinegyptgate.com/tender-item/eg-tnd-003/", page_en: "https://madeinegyptgate.com/tender-item/eg-tnd-003/?lang=en", official: "https://meobserver.news/tenders/2026/11/16/tender-no-2147/", doc: null, ...(over.links || {}) },
  file: { attached: false, reason: "platform_listing" } });

describe("refs: only ids, at most 3", () => {
  test("parseRefs keeps 3; drops URLs, path tricks, short ids, objects, numbers and duplicates; takes a comma string", () => {
    assert.deepEqual(parseRefs(["intel:rw0000000a1", "https://evil.example/x.pdf", "intel:../x", "intel:SHORT", { id: "x" }, 5, null, "intel:rw0000000a1", "item:eg-tnd-003", "item:intl-MZ-EDM-554194-GO-RFB", "item:eg-tnd-004"]),
      ["intel:rw0000000a1", "item:eg-tnd-003", "item:intl-MZ-EDM-554194-GO-RFB"]);
    assert.deepEqual(parseRefs("intel:rw0000000a1, item:eg-tnd-003 ,,item:eg-tnd-003"), ["intel:rw0000000a1", "item:eg-tnd-003"]);
    assert.deepEqual(parseRefs(["INTEL:RW0000000A1"]), ["intel:rw0000000a1"], "an intel id in another case");
    for (const bad of ["item:", "item: x", "item:a\nb", "item:a\tb", "item:a" + String.fromCharCode(0x2028) + "b", "item:a\u202eb", "item:a\u200bb", "item:" + "x".repeat(161), "rw0000000a1", "eg-tnd-003", "intel:rw0000000a12", "javascript:alert(1)"]) assert.deepEqual(parseRefs([bad]), [], JSON.stringify(bad));
    /* review F2: platform ids and list keys with spaces are kept (22 international tenders, 7 list keys) — only looked up, never fetched */
    assert.deepEqual(parseRefs(["item:intl-558/2026/BTB (BE2630001388)", "item:OFF:3 لسنة 2026/2027", " item:intl-ET-CE BOA -541070-GO-RFQ "]), ["item:intl-558/2026/BTB (BE2630001388)", "item:OFF:3 لسنة 2026/2027", "item:intl-ET-CE BOA -541070-GO-RFQ"]);
    /* review R4: {ref, title} — the ref counts, the title only for an item: ref of the list (≤ 300 characters); any other object is dropped */
    const v = [{ ref: "item:OFF:6/2026/2027", title: "  تصنيع  وتوريد  " }, { ref: "intel:rw0000000a1", title: "x" }, { id: "x", title: "y" }, { ref: "https://evil.example", title: "z" }, { ref: "item:eg-tnd-003", title: "t".repeat(400) }];
    assert.deepEqual(parseRefs(v), ["item:OFF:6/2026/2027", "intel:rw0000000a1", "item:eg-tnd-003"]);
    assert.deepEqual(refTitles(v, parseRefs(v)), { "item:OFF:6/2026/2027": "تصنيع وتوريد", "item:eg-tnd-003": "t".repeat(300) });
    assert.deepEqual(refTitles(v, ["intel:rw0000000a1"]), {}, "only refs that are kept");
    assert.deepEqual(parseRefs(undefined), []); assert.deepEqual(parseRefs({ 0: "intel:rw0000000a1" }), []); assert.deepEqual(parseRefs(42), []);
    assert.deepEqual(parseRefs([...Array(20).fill("x"), "intel:rw0000000a1"]), [], "at most 20 looked at");
    assert.equal(NOTIFY_LIM.refs, 3);
  });
  test("the copies stay equal: PAGES_ORIGIN (acc-dev.js) and PACK_HOST (worker-intel/src/api.js — the hostname migate-intel answers mailpack on)", () => {
    assert.equal(PAGES_ORIGIN, DEV_PAGES_ORIGIN);
    const intelSrc = readFileSync(new URL("../../worker-intel/src/api.js", import.meta.url), "utf8");
    assert.equal((intelSrc.match(/export const PACK_HOST = "([^"]+)"/) || [])[1], PACK_HOST);
    assert.match(PACK_HOST, /\.invalid$/, "a name that can never resolve (RFC 6761)");
    assert.match(intelSrc, /if \(url\.hostname !== PACK_HOST\) return json\(req, \{ error: "not found" \}, 404\);/);
  });
});

describe("reasons", () => {
  test("every code has a non-empty Arabic and English line; sizes and links are filled in", () => {
    const codes = ["no_attach_provider", "provider_refused", "email_not_sent", "whatsapp_only", "daily_files", "pack_off", "platform_listing", "source_opt_out", "kind", "no_document", "page_only", "login", "forbidden", "robots", "gone", "busy",
      "timeout", "unreachable", "too_large", "total_too_large", "unsupported", "not_https", "unsafe_url", "too_many_redirects", "off_site", "files_busy", "time_up", "not_found", "unavailable", "ambiguous", "page_gone", "page_moved", "other"];
    for (const c of codes) { assert.ok(WHY[c], c); const w = whyOf(c); assert.ok(w.ar.length > 10 && w.en.length > 10, c); assert.match(w.ar, /[؀-ۿ]/, c); assert.doesNotMatch(w.en, /[؀-ۿ]/, c); }
    assert.deepEqual(whyOf("too_large", { size: 12500000 }), { ar: "الملف كبير (12.5 ميجا) على الإيميل", en: "the file is too large for e-mail (12.5 MB)" });
    assert.match(whyOf("not_found", { type: "item" }).ar, /بيانات المنصة/); assert.match(whyOf("not_found", { type: "intel" }).ar, /مركز المعلومات/);
    assert.match(whyOf("unavailable", { link: "https://madeinegyptgate.com/intel/tenders/rw0000000a1/" }).ar, /بعد شوية: https:\/\/madeinegyptgate\.com\/intel\/tenders\/rw0000000a1\/$/);
    /* review R6: no page to try (intel_pages off, no binding) → ask Bassem again, never «try its page» */
    assert.deepEqual(whyOf("unavailable", { link: "" }), { ar: "ماقدرتش أوصل لمركز المعلومات دلوقتي علشان أجيب تفاصيل الفرصة دي — جرّب تطلبها من باسم تاني بعد شوية", en: "I could not reach the Information Center right now to get this opportunity's details — ask Bassem again a bit later" });
    /* review R4: the shared number and the platform's titles of the tenders that share it */
    assert.deepEqual(whyOf("ambiguous", { num: "6/2026/2027", count: 3, titles: ["أ", "ب", "ج"] }), { ar: "الرقم 6/2026/2027 مشترك بين 3 مناقصات في بيانات المنصة («أ»، «ب»، «ج»)، فماحطّيتش تفاصيل أي واحدة علشان ماغلطش",
      en: "the number 6/2026/2027 is shared by 3 tenders in the platform's data («أ», «ب», «ج»), so no details were added to avoid a mistake" });
    assert.match(whyOf("ambiguous", { num: "1", count: 5, titles: ["أ", "ب", "ج"] }).ar, /بين 5 مناقصات .*«ج»، …\)/);
    assert.match(whyOf("ambiguous", { num: "1", count: 2, titles: ["أ", "ب"] }).ar, /بين مناقصتين/);
    assert.deepEqual(whyOf("no-such-code"), whyOf("other"));
    assert.match(WHY.daily_files[0], /10 ملفات/);
  });
  test("helpers: money only from the data, dates, the status on the Cairo day", () => {
    assert.equal(fmtMoney(1250000, "zar", "راند", "ar"), "1,250,000 راند (ZAR)"); assert.equal(fmtMoney(1250000, "ZAR", "", "en"), "1,250,000 ZAR");
    for (const v of [0, null, "", "abc", -5, NaN]) assert.equal(fmtMoney(v, "EGP", "جنيه", "ar"), "");
    assert.deepEqual([fmtDate("2026-11-24", "ar"), fmtDate("2026-11-24T00:00:00Z", "en"), fmtDate("", "ar")], ["24 نوفمبر 2026", "24 Nov 2026", ""]);
    assert.deepEqual([statusWord("2026-11-24", "", "ar", NOW), statusWord("2026-12-30", "", "en", NOW), statusWord("2026-11-01", "open", "ar", NOW), statusWord("", "info", "ar", NOW), statusWord("", "closed", "en", NOW)], ["بتقفل قريب", "open", "منتهية", "", "closed"]);
  });
});

describe("the e-mail", () => {
  test("subject for 0, 1, 2 and 3 cards; refs that found nothing keep today's subject", () => {
    const nf = { ref: "intel:zzzzzzzzzzz", type: "intel", id: "zzzzzzzzzzz", found: false, reason: "not_found" };
    assert.equal(notifyMail({}, "x", [nf], NOW).subject, "رسالة من باسم / A note from Bassem");
    assert.equal(notifyMail({}, "x", [intel()], NOW).subject, "باسم: تفاصيل «توريد وتسليم كيماويات معالجة المياه» / Bassem: details of “Supply and delivery of water treatment chemicals”");
    assert.equal(notifyMail({}, "x", [intel(), tender(), nf], NOW).subject, "باسم: تفاصيل فرصتين / Bassem: details of 2 opportunities");
    assert.equal(notifyMail({}, "x", [intel(), tender(), { ...intel(), ref: "intel:ab000000000", id: "ab000000000" }], NOW).subject, "باسم: تفاصيل 3 فرص / Bassem: details of 3 opportunities");
    const long = intel({ card: { title: "ت".repeat(300), title_orig: "T ".repeat(150) } });
    assert.ok(notifyMail({}, "x", [long], NOW).subject.length <= 200);
  });
  test("text and html: Bassem's note labelled apart, every card label, both links, the file line, the English twin, the footer", () => {
    const m = notifyMail({}, "دي الفرص اللي اتكلمنا فيها.", [intel(), tender()], NOW);
    for (const s of ["رسالة باسم:\nدي الفرص اللي اتكلمنا فيها.", "تفاصيل الفرص من بيانات المنصة (مش من كلام باسم):", "1) توريد وتسليم كيماويات معالجة المياه", "العنوان الأصلي: Supply and delivery of water treatment chemicals",
      "النوع: طلب عرض أسعار", "الجهة: Rand Water", "البلد: جنوب أفريقيا", "آخر ميعاد للتقديم: 24 نوفمبر 2026 (بتقفل قريب)", "القيمة التقديرية: 1,250,000 راند (ZAR)", "المطلوب: طلب عرض أسعار من Rand Water.",
      "المصدر الرسمي: جنوب أفريقيا — بوابة المناقصات الحكومية", "صفحتها على المنصة: https://madeinegyptgate.com/intel/rfq/rw0000000a1/", "الرابط الرسمي: " + DOC_URL,
      "📎 الملف الرسمي مرفق في الإيميل ده: RW 01234 RFQ advert.pdf (0.5 ميجا)", "2) تصنيع وتوريد وتركيب منشآت معدنية لصوامع قمح", "رقم المناقصة: 6/2026/2027", "المكان: الأقصر (طيبة الجديدة)",
      "التأمين الابتدائي: 1,000,000 جنيه · ثمن الكراسة: 7,000 جنيه", "صفحتها على المنصة: https://madeinegyptgate.com/tender-item/eg-tnd-003/", "رابط الإعلان الرسمي (meobserver.news): https://meobserver.news/tenders/2026/11/16/tender-no-2147/",
      "الملف الرسمي مش مرفق: ده إعلان من بيانات المنصة نفسها، والمنصة لسه مابتنزّلش ملفات الإعلانات دي. تقدر تفتحه من الرابط الرسمي.", "التقديم بيكون عند الجهة المعلنة بشروطها؛ المنصة مش بتطرح ولا بترسي المناقصات.",
      "كمّل مع باسم: https://madeinegyptgate.com/advisor/", "بياناتك محمية وفق قانون حماية البيانات الشخصية المصري 151/2020.", "\n\n— English —\n\nBassem's note:\n", "Opportunity details from the platform's data (not Bassem's words):",
      "Type: Request for quotation", "Deadline: 24 Nov 2026 (closing soon)", "Estimated value: 1,250,000 ZAR", "What is requested: From the source text: Ref RW 01234 RFQ", "Its page on the platform: https://madeinegyptgate.com/intel/en/rfq/rw0000000a1/",
      "📎 The official file is attached to this e-mail: RW 01234 RFQ advert.pdf (0.5 MB)", "Buyer: Upper Egypt Flour Mills", "Location: Luxor", "Its page on the platform: https://madeinegyptgate.com/tender-item/eg-tnd-003/?lang=en",
      "Continue with Bassem: https://madeinegyptgate.com/advisor/?lang=en", "Your data is handled under Egypt's PDPL (Law 151/2020)."])
      assert.ok(m.text.includes(s), "text: " + s);
    assert.ok(m.text.indexOf("— English —") > m.text.indexOf("كمّل مع باسم"), "Arabic first");
    assert.doesNotMatch(m.text.slice(m.text.indexOf("— English —")), /طيبة الجديدة|الحديد والصلب/, "the English twin leaves Arabic-only values out");
    assert.match(m.html, /^<div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1\.7;color:#222;max-width:640px;margin:0 auto"><div dir="rtl" lang="ar"/);
    assert.match(m.html, /<hr[^>]*><div dir="ltr" lang="en"/);
    for (const a of ['href="https://madeinegyptgate.com/intel/rfq/rw0000000a1/"', 'href="' + DOC_URL.replace(/&/g, "&amp;") + '"', 'href="https://madeinegyptgate.com/intel/en/rfq/rw0000000a1/"', 'href="https://madeinegyptgate.com/tender-item/eg-tnd-003/"',
      'href="https://madeinegyptgate.com/tender-item/eg-tnd-003/?lang=en"', 'href="https://meobserver.news/tenders/2026/11/16/tender-no-2147/"']) assert.ok(m.html.includes(a), a);
    assert.match(m.html, />افتح صفحتها على المنصة<\/a>/); assert.match(m.html, />الرابط الرسمي ↗<\/a>/); assert.match(m.html, />Open its page on the platform<\/a>/);
    assert.match(m.html, /<div style="font-weight:bold;color:#8E0B20;margin-bottom:6px">رسالة باسم<\/div>/);
    assert.deepEqual(m.attachments, [{ filename: "RW 01234 RFQ advert.pdf", type: "application/pdf", b64: "JVBERi0xLjQK" }]);
  });
  test("hostile values are escaped; a URL in Bassem's message is never a link; a javascript: official link gets no href; only the platform's and the official links are anchors", () => {
    const evil = intel({ card: { title: '<script>alert("x")</script>', entity: "A \"quoted\" & 'single' <b>buyer</b>", summary: "<img src=x onerror=alert(1)>" }, links: { official: "javascript:alert(1)", doc: null }, file: { attached: false, reason: "page_only" } });
    const m = notifyMail({}, 'افتح https://evil.example/phish و <a href="https://evil.example">هنا</a>', [evil], NOW);
    assert.doesNotMatch(m.html, /<script|<img|<b>|onerror=alert\(1\)>/);
    assert.match(m.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/); assert.match(m.html, /A &quot;quoted&quot; &amp; &#39;single&#39; &lt;b&gt;buyer&lt;\/b&gt;/);
    const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map(x => x[1]);
    assert.ok(hrefs.length > 0 && hrefs.every(h => h.startsWith("https://madeinegyptgate.com/")), JSON.stringify(hrefs));
    assert.ok(!hrefs.some(h => /evil|javascript/i.test(h)));
    assert.ok(m.html.includes("افتح https://evil.example/phish و &lt;a href=&quot;https://evil.example&quot;&gt;هنا&lt;/a&gt;"), "the message as text, escaped");
    assert.ok(m.text.includes("الرابط الرسمي: مفيش رابط رسمي محفوظ للفرصة دي") && !/javascript:/i.test(m.text), "an unusable official link is said to be missing, never shown");
  });
  test("intel_pages off (no page link): no /intel/ link at all, the official link stays; the file line points where the file can be had", () => {
    const off = intel({ links: { page: null, page_en: null }, file: { attached: false, reason: "too_large", size: 12500000 } });
    const m = notifyMail({}, "x", [off], NOW);
    assert.doesNotMatch(m.text + m.html, /\/intel\//); assert.ok(m.text.includes("الرابط الرسمي: " + DOC_URL));
    assert.ok(m.text.includes("الملف الرسمي مش مرفق: الملف كبير (12.5 ميجا) على الإيميل. تقدر تفتحه من الرابط الرسمي."), "the doc link equals the official one: said once");
    const doc2 = intel({ links: { doc: "https://www.etenders.gov.za/files/big.pdf" }, file: { attached: false, reason: "login" } });
    assert.ok(notifyMail({}, "x", [doc2], NOW).text.includes("الملف ورا تسجيل دخول على بوابة الجهة، ولازم تسجّل عندهم علشان تحمّله. تقدر تحمّله من هنا: https://www.etenders.gov.za/files/big.pdf"));
    const grp = notifyMail({}, "x", [intel({ card: { market: "africa", market_name: "أفريقيا", market_name_en: "Africa", country: "Kenya" } })], NOW).text;
    assert.ok(grp.includes("البلد: أفريقيا (Kenya)") && grp.includes("Country: Africa (Kenya)"), "a group market names the country");
    const news = intel({ card: { kind: "news", kind_label: "خبر" }, file: { attached: false, reason: "kind" } });
    const n = notifyMail({}, "x", [news], NOW).text;
    assert.doesNotMatch(n, /الملف الرسمي|آخر ميعاد|القيمة التقديرية/, "news: no file, deadline or value line");
    const gone = tender({ links: { page: null, page_en: null }, pageNote: "page_gone" });
    assert.ok(notifyMail({}, "x", [gone], NOW).text.includes("صفحتها على المنصة مش متاحة دلوقتي"));
  });
});

describe("WhatsApp text", () => {
  test("cards with their links, ≤ 2000 characters for 3 long items and a 2000-character message, every URL whole; the e-mail line only when it went", () => {
    const longUrl = "https://www.etenders.gov.za/home/Download?blobName=" + "a".repeat(520) + ".pdf";
    const items = [0, 1, 2].map(i => intel({ card: { title: "مناقصة طويلة جداً ".repeat(20) + i }, links: { page: "https://madeinegyptgate.com/intel/rfq/rw0000000a" + i + "/", official: longUrl } }));
    const msg = ("كلام طويل https://madeinegyptgate.com/advisor/ ").repeat(60).slice(0, 2000);
    const t = notifyWa(msg, items, { emailSent: true, attached: 1, now: NOW });
    assert.ok(t.length <= 2000, String(t.length));
    for (const u of t.match(/https?:\/\/\S+/g) || []) assert.ok(/\/$|\.pdf$/.test(u), "whole URL: " + u);
    assert.match(t, /📌 من بيانات المنصة · From the platform's data:/); assert.match(t, /1\) مناقصة طويلة/);
    assert.match(t, /📧 التفاصيل كاملة في إيميلك · Full details are in your e-mail — والملف الرسمي مرفق هناك · the official file is attached there$/);
    const short = notifyWa("دي الفرصة", [intel()], { emailSent: false, now: NOW });
    assert.ok(short.startsWith("دي الفرصة\n\n📌 من بيانات المنصة · From the platform's data:\n1) توريد وتسليم كيماويات معالجة المياه\nآخر ميعاد · Deadline: 2026-11-24 (بتقفل قريب · closing soon)\nصفحتها · Page: https://madeinegyptgate.com/intel/rfq/rw0000000a1/\nالرسمي · Official: " + DOC_URL));
    assert.doesNotMatch(short, /📧/, "no e-mail line when the e-mail did not go");
    assert.equal(notifyWa("نص فقط", [{ ref: "intel:zzzzzzzzzzz", found: false, reason: "not_found" }], { emailSent: true }), "نص فقط", "no card: the message alone");
    const huge = notifyWa("x", [intel({ links: { official: "https://www.etenders.gov.za/" + "b".repeat(700) } })], { now: NOW });
    assert.match(huge, /الرسمي · Official: \(اللينك في صفحتها على المنصة · link on its platform page\)/);
  });
});

describe("the reply and the event", () => {
  test("replyItems: titles, links, the file or its reason in both languages; whyMap: codes only; dropFiles", () => {
    const items = [intel(), tender(), { ref: "item:OFF:1", type: "item", id: "OFF:1", found: false, reason: "ambiguous" }];
    const r = replyItems(items);
    assert.deepEqual(r[0], { ref: "intel:rw0000000a1", found: true, id: "rw0000000a1", title: "توريد كيماويات", page: "https://madeinegyptgate.com/intel/rfq/rw0000000a1/", official: DOC_URL, file: { attached: true, name: "RW 01234 RFQ advert.pdf", size: 482113 } });
    assert.deepEqual(r[1].file, { attached: false, reason: "platform_listing", why: { ar: WHY.platform_listing[0], en: WHY.platform_listing[1] } });
    assert.deepEqual(r[2], { ref: "item:OFF:1", found: false, reason: "ambiguous", why: { ar: WHY.ambiguous[0], en: WHY.ambiguous[1] } });
    assert.ok(!JSON.stringify(r).includes("JVBERi0x"), "no file bytes in the reply");
    assert.deepEqual(whyMap(items), { "intel:rw0000000a1": "attached", "item:eg-tnd-003": "platform_listing", "item:OFF:1": "ambiguous" });
    dropFiles(items, "provider_refused");
    assert.deepEqual(items[0].file, { attached: false, reason: "provider_refused" });
    assert.equal(notifyMail({}, "x", items, NOW).attachments.length, 0);
  });
});

describe("review fixes in the e-mail and the WhatsApp text", () => {
  test("F4: the English page link keeps a #fragment last (a hash shim); a plain link and a query get ?lang=en / &lang=en; the spelling of the URL is kept", () => {
    assert.equal(enUrl("https://madeinegyptgate.com/opportunity.html#eg-tnd-003"), "https://madeinegyptgate.com/opportunity.html?lang=en#eg-tnd-003");
    assert.equal(enUrl("https://madeinegyptgate.com/tender-item/eg-tnd-003/"), "https://madeinegyptgate.com/tender-item/eg-tnd-003/?lang=en");
    assert.equal(enUrl("https://madeinegyptgate.com/tenders/search/?q=1#OFF%3A1"), "https://madeinegyptgate.com/tenders/search/?q=1&lang=en#OFF%3A1");
    assert.equal(enUrl("https://madeinegyptgate.com/x/?lang=ar"), "https://madeinegyptgate.com/x/?lang=en");
    assert.equal(enUrl("https://madeinegyptgate.com/tender-item/دعوة-لتقديم/"), "https://madeinegyptgate.com/tender-item/دعوة-لتقديم/?lang=en");
    assert.equal(enUrl(null), null); assert.equal(enUrl("javascript:alert(1)"), null);
  });
  test("R1: the file that came (its label) and the one that did not (its label, reason and own link) — never «the official file» for the notice alone", () => {
    const H1 = "https://tenders.go.ke/storage/Documents/1-tender-document.pdf";
    const it = intel({ file: { attached: true, name: "1-tender-notice.pdf", type: "application/pdf", size: 164000, b64: "JVBERi0xLjQK", from: "hint", label: "Tender Notice", skipped: { label: "Tender Document", reason: "too_large", size: 9400000, url: H1 } } });
    const m = notifyMail({}, "x", [it], NOW);
    for (const s of ["📎 مرفق في الإيميل ده: إعلان المناقصة (Tender Notice) — 1-tender-notice.pdf (0.2 ميجا)", "كراسة الشروط (Tender Document) مااترفقتش: الملف كبير (9.4 ميجا) على الإيميل. تقدر تحمّلها من هنا: " + H1,
      "📎 Attached to this e-mail: the Tender Notice — 1-tender-notice.pdf (0.2 MB)", "The Tender Document was not attached: the file is too large for e-mail (9.4 MB). You can download it here: " + H1]) assert.ok(m.text.includes(s), s);
    assert.ok(m.html.includes('<a href="' + H1 + '" dir="ltr"') && m.html.includes('<span dir="ltr">1-tender-notice.pdf</span>'));
    /* a skipped file with no label, and one whose link is gone (no link given) */
    const un = notifyMail({}, "x", [intel({ file: { attached: true, name: "a.pdf", type: "application/pdf", size: 1000, b64: "JVBERi0xLjQK", from: "official", skipped: { reason: "gone", url: H1 } } })], NOW).text;
    assert.ok(un.includes("📎 مرفق في الإيميل ده: a.pdf (0.1 ميجا)") && un.includes("ملف رسمي تاني للفرصة دي مااترفقش: رابط الملف مبقاش موجود على موقع الجهة.\n") && !un.includes(H1));
    /* the main document came: its label in the usual line */
    const main = notifyMail({}, "x", [intel({ file: { attached: true, name: "d.pdf", type: "application/pdf", size: 2400000, b64: "JVBERi0xLjQK", from: "hint", label: "Tender Document" } })], NOW).text;
    assert.ok(main.includes("📎 الملف الرسمي مرفق في الإيميل ده: كراسة الشروط (Tender Document) — d.pdf (2.4 ميجا)") && main.includes("📎 The official file is attached to this e-mail: the Tender Document — d.pdf (2.4 MB)"));
    const rep = replyItems([it])[0].file;
    assert.deepEqual(rep.skipped, { label: { ar: "كراسة الشروط (Tender Document)", en: "Tender Document" }, reason: "too_large", why: { ar: "الملف كبير (9.4 ميجا) على الإيميل", en: "the file is too large for e-mail (9.4 MB)" } });
  });
  test("R6: the official link itself gone — said so, marked «not opening now» in the text, the button, the URL list and WhatsApp", () => {
    const g = intel({ links: { doc: DOC_URL }, file: { attached: false, reason: "gone" } });
    const m = notifyMail({}, "x", [g], NOW);
    assert.ok(m.text.includes("الرابط الرسمي: " + DOC_URL + " (مابيفتحش دلوقتي)") && m.text.includes("الملف الرسمي مش مرفق: الرابط الرسمي نفسه مبقاش شغال على موقع الجهة (اتشال أو اتنقل)."));
    assert.doesNotMatch(m.text, /تقدر تفتحه من الرابط الرسمي/);
    assert.match(m.html, /الرابط الرسمي ↗ \(مابيفتحش دلوقتي\)<\/a>/); assert.match(m.html, /Official link ↗ \(not opening now\)<\/a>/);
    assert.match(notifyWa("x", [g], { now: NOW }), /الرسمي · Official: \S+ \(مابيفتحش دلوقتي · not opening now\)/);
    /* a hint's file gone, the official link fine: «open it from the official link» stays */
    const h = notifyMail({}, "x", [intel({ links: { doc: "https://www.etenders.gov.za/files/old.pdf" }, file: { attached: false, reason: "gone" } })], NOW).text;
    assert.ok(h.includes("الملف الرسمي مش مرفق: رابط الملف مبقاش موجود على موقع الجهة. تقدر تفتحه من الرابط الرسمي.") && !/مابيفتحش/.test(h));
  });
  test("R7: the footer never says the member asked for it (Bassem also sends notes on his own)", () => {
    const t = notifyMail({}, "x", [intel()], NOW).text;
    assert.ok(t.includes("وصلك الإيميل ده من باسم خلال مكالمتكم على منصة صنع في مصر.") && t.includes("Bassem sent you this e-mail during your call on Made in Egypt Gate."));
    assert.doesNotMatch(t, /لأنك طلبته|because you asked/);
  });
  test("R8: an Arabic-only value in the English twin is marked as such (or left out), never passed off as English; the subject says «1 opportunity»", () => {
    const ar = tender({ card: { title: "توريد وتركيب اجهزة حاسب آلى", title_en: "", entity: "شركة كهرباء موزمبيق (EDM)", entity_en: "", bond_note: "تأمين نهائي 5%", market: "intl", country: "موزمبيق", country_en: "", city: "مابوتو", activity: "" } });
    const m = notifyMail({}, "x", [ar], NOW), en = m.text.slice(m.text.indexOf("— English —"));
    assert.equal(m.subject, "باسم: تفاصيل «توريد وتركيب اجهزة حاسب آلى» / Bassem: details of 1 opportunity");
    assert.ok(en.includes("1) توريد وتركيب اجهزة حاسب آلى (title in Arabic only)") && en.includes("Buyer (name in Arabic): شركة كهرباء موزمبيق (EDM)"), en.slice(0, 500));
    assert.doesNotMatch(en, /تأمين نهائي|مابوتو|Country: موزمبيق/);
    assert.match(m.html, /<span dir="rtl" lang="ar">توريد وتركيب اجهزة حاسب آلى<\/span> <span[^>]*>\(title in Arabic only\)<\/span>/);
    const it = intel({ card: { title_orig: "توريد كابلات", title: "توريد كابلات", title_en: "", summary_en: "", summary_original: "مناقصة عامة لتوريد كابلات", source_name_en: "", source_name: "بوابة التعاقدات", entity: "الشركة القابضة" } });
    const e2 = notifyMail({}, "x", [it], NOW).text.split("— English —")[1];
    assert.ok(e2.includes("(title in Arabic only)") && e2.includes("Buyer (name in Arabic): الشركة القابضة") && e2.includes("What is requested: From the source text (in Arabic): مناقصة عامة لتوريد كابلات") && e2.includes("Official source (name in Arabic): بوابة التعاقدات"), e2.slice(0, 700));
    assert.ok(notifyMail({}, "x", [intel()], NOW).subject.endsWith("Bassem: details of “Supply and delivery of water treatment chemicals”"), "a Latin title stays");
  });
  test("R10: news has no buyer row (an organisation only when named); a project has an owner", () => {
    const news = notifyMail({}, "x", [intel({ card: { kind: "news", kind_label: "خبر", entity: "" }, file: { attached: false, reason: "kind" } })], NOW).text;
    assert.doesNotMatch(news, /الجهة:|Buyer:|مش منشورة في المصدر/);
    const named = notifyMail({}, "x", [intel({ card: { kind: "news", kind_label: "خبر", entity: "World Bank" }, file: { attached: false, reason: "kind" } })], NOW).text;
    assert.ok(named.includes("الجهة: World Bank") && named.includes("Organisation: World Bank"));
    const prj = notifyMail({}, "x", [intel({ card: { kind: "project", kind_label: "مشروع", entity: "Ministry of Water" } })], NOW).text;
    assert.ok(prj.includes("صاحب المشروع: Ministry of Water") && prj.includes("Project owner: Ministry of Water") && !/الجهة: Ministry/.test(prj));
  });
  test("R11: the WhatsApp closing line counts the files; the heading counts the entries listed", () => {
    for (const [n, s] of [[1, "والملف الرسمي مرفق هناك · the official file is attached there"], [2, "والملفين الرسميين مرفقين هناك · the 2 official files are attached there"], [3, "والملفات الرسمية مرفقة هناك · the 3 official files are attached there"]])
      assert.ok(notifyWa("x", [intel()], { emailSent: true, attached: n, now: NOW }).endsWith(s), n);
    const nf = { ref: "intel:zzzzzzzzzzz", type: "intel", id: "zzzzzzzzzzz", found: false, reason: "not_found" };
    assert.ok(notifyMail({}, "x", [intel(), nf], NOW).text.includes("تفاصيل الفرص من بيانات المنصة"), "two entries, one card: plural");
    assert.ok(notifyMail({}, "x", [intel()], NOW).text.includes("تفاصيل الفرصة من بيانات المنصة"));
  });
  test("SEC-2: one file slot per isolate — taken, refused while held, free after release or after gateMs", () => {
    const rel = fileSlot(1000);
    assert.equal(typeof rel, "function");
    assert.equal(fileSlot(2000), null, "held");
    rel(); const r2 = fileSlot(3000); assert.equal(typeof r2, "function", "released");
    assert.equal(typeof fileSlot(3000 + NOTIFY_LIM.gateMs), "function", "a slot never released is free after gateMs");
    rel(); r2();
    const r3 = fileSlot(); assert.equal(typeof r3, "function"); r3();
  });
});
