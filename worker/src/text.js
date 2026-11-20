/* Arabic/English text normalisation shared by the Janna lookup (index.js) and the automatic matching engine (matching.js).
   norm(): lower case, no diacritics/tatweel, alef variants → ا, ة → ه, ى → ي, punctuation → space.
   stem(): drops a leading «ال» and common plural/nisba suffixes so «البلاستيكية» ≈ «بلاستيك» (rules: see STEM_* below). */
export const EN = { cairo: "القاهرة", giza: "الجيزة", alexandria: "الإسكندرية", qalyubia: "القليوبية", sharqia: "الشرقية", sharkia: "الشرقية", dakahlia: "الدقهلية", gharbia: "الغربية", menoufia: "المنوفية", monufia: "المنوفية", beheira: "البحيرة", damietta: "دمياط", "port said": "بورسعيد", ismailia: "الإسماعيلية", suez: "السويس", fayoum: "الفيوم", "beni suef": "بني سويف", minya: "المنيا", assiut: "أسيوط", sohag: "سوهاج", qena: "قنا", luxor: "الأقصر", aswan: "أسوان", "10th of ramadan": "العاشر من رمضان", "tenth of ramadan": "العاشر من رمضان", "6th of october": "السادس من أكتوبر", sadat: "السادات", obour: "العبور", sokhna: "العين السخنة",
  plastic: "بلاستيك", plastics: "بلاستيك", steel: "حديد", iron: "حديد", food: "غذائية", foods: "غذائية", textile: "نسيج", textiles: "نسيج", garments: "ملابس", chemicals: "كيماويات", chemical: "كيماويات", paper: "ورق", packaging: "تغليف", furniture: "أثاث", glass: "زجاج", cables: "كابلات", cable: "كابلات", electrical: "كهرباء", pharmaceutical: "أدوية", medicine: "أدوية", ceramics: "سيراميك", marble: "رخام", aluminum: "ألومنيوم", aluminium: "ألومنيوم", copper: "نحاس", dairy: "ألبان", cement: "أسمنت", paint: "دهانات", paints: "دهانات", leather: "جلود", wood: "أخشاب", machinery: "معدات", factory: "", factories: "", manufacturers: "", company: "", companies: "", in: "", the: "", of: "", and: "" };
export const STOP = new Set(["مصنع", "مصانع", "شركه", "شركات", "شركة", "في", "فى", "من", "على", "علي", "عن", "اللي", "انا", "عايز", "عاوز", "محتاج", "محتاجين", "دور", "دوري", "دوريلي", "ابحث", "ابحثي", "منتجات", "منتج", "و", "ال", "مدينه", "مدينة", "محافظه", "محافظة", "المسجله", "المسجلة",
  "طلب", "طلبات", "عرض", "عروض", "سعر", "اسعار", "أسعار", "توريد", "كميه", "كمية", "مطلوب", "نريد", "برجاء", "رجاء", "لو", "سمحت", "ممكن", "بكميه", "بكمية", "او", "أو", "مع", "الى", "إلى", "هذا", "هذه", "التي", "الذي", "كل", "اي", "أي", "جدا", "تم", "لنا", "لدينا", "حضرتك", "شكرا", "السلام", "عليكم", "اهلا", "مرحبا",
  "a", "an", "the", "of", "for", "to", "in", "on", "and", "or", "with", "we", "need", "please", "quote", "quotation", "price", "prices", "supply", "request", "rfq", "pcs", "units", "unit", "ton", "tons", "kg", "per", "is", "are", "be", "our", "you", "your", "hi", "hello", "dear"]);

export function norm(s) {
  return String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
/* stem() rules (lookup-index 2026-11-20, the Al-Atlal call 8bacbfac):
   - a suffix comes off only when 4 letters or more stay («أدوية» was «ادو», which also starts «ادوات»; «غازية» stays apart from «غاز»);
   - «ال» that belongs to the word stays (STEM_KEEP_AL: the KEEP list of worker-intel/src/terms.js + a few; «ألبان» was «بان», «ألواح شمسية»
     was «واح شمس»); otherwise the article comes off as before (a word of 5 letters or more);
   - the singular ة meets the plural ات: one suffix of STEM_SUFFIX at most («اسطوانة» = «أسطوانات» = «اسطوان»); a final «ي» stays (it is
     also the «لي» / «ني» of a request: «تابعلي», «فكرني»);
   - broken plurals and the plurals / adjectives of 3-letter roots map to the stem of their singular (STEM_PLURAL: «أنابيب» = «أنبوبة»,
     «غازات» = «غاز», «درافيل» = «درفيل»); a word mapped to itself is never cut («استيلين» is acetylene, not «استيل» steel).
   Latin words and numbers are left as they are. */
const STEM_KEEP_AL = new Set(["الواح", "البان", "الياف", "العاب", "الوان", "الماس", "المانيا", "الماني", "المان", "اليات", "البسه"]);
const STEM_KEEP_AL_START = ["الكترون", "الومنيوم", "المونيوم", "الومينيوم", "المنيوم", "الوميتال"];
const STEM_SUFFIX = ["يات", "يين", "ات", "ين", "ون", "يه", "ه"];
const stemKeepsAl = w => STEM_KEEP_AL.has(w) || STEM_KEEP_AL_START.some(k => w.startsWith(k));
function stemRules(w) {
  if (!stemKeepsAl(w) && w.length > 4 && w.startsWith("ال")) w = w.slice(2);
  for (const s of STEM_SUFFIX) if (w.length - s.length >= 4 && w.endsWith(s)) return w.slice(0, -s.length);
  return w;
}
/* plural (or adjective) → its singular; normalised here, and the singular goes through the same rules, so both spellings meet */
const STEM_PLURAL = new Map(Object.entries({
  انابيب: "انبوبة", مواسير: "ماسورة", براميل: "برميل", درافيل: "درفيل", صناديق: "صندوق", اكياس: "كيس", زيوت: "زيت", اسمدة: "سماد", ادوية: "دواء",
  اغذية: "غذاء", معادن: "معدن", اجهزة: "جهاز", الات: "آلة", مضخات: "مضخة", محابس: "محبس", بلوف: "بلف", اقمشة: "قماش", خيوط: "خيط", احبار: "حبر",
  اسلاك: "سلك", الواح: "لوح", اسياخ: "سيخ", مكابس: "مكبس", افران: "فرن", فلاتر: "فلتر", كراسي: "كرسي", ابواب: "باب", شبابيك: "شباك", عبوات: "عبوة",
  علب: "علبة", شنط: "شنطة", غازات: "غاز", رولات: "رول", لمبات: "لمبة", مصابيح: "مصباح", تروس: "ترس", سيور: "سير", خراطيم: "خرطوم", مسامير: "مسمار",
  اوعية: "وعاء", اطباق: "طبق", اكواب: "كوب", صحون: "صحن", اعلاف: "علف", اخشاب: "خشب", احجار: "حجر", اعشاب: "عشب", جلود: "جلد", احذية: "حذاء",
  شرائط: "شريط", اشرطة: "شريط", ادوات: "أداة", قوالب: "قالب", خدمات: "خدمة", شركات: "شركة", طبية: "طبي", ورقي: "ورق", ورقية: "ورق", خشبي: "خشب",
  خشبية: "خشب", جلدي: "جلد", جلدية: "جلد", قطني: "قطن", قطنية: "قطن", كاسات: "كاس", بذور: "بذرة", مخازن: "مخزن", ملاعق: "ملعقة", سكاكين: "سكين",
  استيلين: "استيلين", اسيتيلين: "اسيتيلين",
}).map(([p, s]) => [norm(p), norm(s) === norm(p) ? norm(p) : stemRules(norm(s))]));
export function stem(w) {
  w = norm(w); if (!w || /^[a-z0-9]+$/.test(w)) return w;
  const p = STEM_PLURAL.get(w); if (p) return p;
  const a = !stemKeepsAl(w) && w.length > 4 && w.startsWith("ال") ? w.slice(2) : w; // «الأنابيب» → «انابيب» → «انبوب»
  return STEM_PLURAL.get(a) || stemRules(a);
}
export function englishToArabic(q) {
  let s = " " + String(q || "").toLowerCase() + " ";
  for (const k of Object.keys(EN).sort((a, b) => b.length - a.length)) if (EN[k]) s = s.split(" " + k + " ").join(" " + k + " " + EN[k] + " ");
  return s.trim();
}
/* distinct content tokens (stemmed, no stop words, ≥2 chars, no pure numbers) */
export function tokens(s, max = 80) {
  const out = new Set();
  for (const w of norm(englishToArabic(s)).split(" ")) {
    if (!w || w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const t = stem(w);
    if (t && t.length >= 2 && !STOP.has(t)) out.add(t);
    if (out.size >= max) break;
  }
  return [...out];
}

/* ---------- untrusted text: masking + what may reach an LLM (moved here from memory.js so websearch.js shares it) ----------
   clean()  one stored value: NFKC, no control / invisible characters, e-mails / phones masked, one line, ≤ max code points.
   forLLM() clean() + role / «ignore previous» markers, brackets and «» removed (the saved prompt speaks what is inside «»).
   instructionLike()  text that tries to instruct the model or the member (web pages, stored results): such an item is DROPPED. */
const CTRL = /[\x00-\x1f\x7f-\x9f\u{2028}\u{2029}]/gu;
const INVISIBLE = /[\p{Cf}\p{Cn}\p{Co}\p{Cs}\u{34f}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{180b}-\u{180f}\u{2800}\u{3164}\u{fe00}-\u{fe0f}\u{ffa0}]/gu;
const DIG = "0-9\\u{660}-\\u{669}\\u{6f0}-\\u{6f9}";
export const asciiDigits = s => String(s).replace(/[\u{660}-\u{669}]/gu, c => String(c.charCodeAt(0) - 0x660)).replace(/[\u{6f0}-\u{6f9}]/gu, c => String(c.charCodeAt(0) - 0x6f0));
const EMAIL_RX = /[^\s@<>()"'«»,;:]{1,64}@[^\s@<>()"'«»,;:]{1,253}\.[A-Za-z]{2,24}/g;
/* a spoken e-mail: "ahmed dot nour at gmail dot com", "ahmed underscore nour at …", «أحمد آت جيميل دوت كوم» (review 2026-11-19 #8) */
const SP_JOIN = "(?:dot|underscore|dash|hyphen|دوت|نقط[ةه]|اندرسكور|أندرسكور|شرط[ةه])", SP_DOT = "(?:dot|دوت|نقط[ةه])";
const SPOKEN_EMAIL_RX = new RegExp(`(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}._-]{1,40}(?:\\s+${SP_JOIN}\\s+[\\p{L}\\p{N}._-]{1,40}){0,3}\\s+(?:at|آت|أت|ات)\\s+[\\p{L}\\p{N}-]{2,40}\\s+${SP_DOT}\\s+\\p{L}{2,6}(?:\\s+${SP_DOT}\\s+\\p{L}{2,6})?(?![\\p{L}\\p{N}])`, "giu");
/* any-language calls (2026-11-20): spoken addresses in other languages, as SEPARATE patterns — the dot words of other languages are never
   paired with the English "at" + "point" («we can stop at this point in time», «look at that point of view» stay as they are):
   - an at-word no English sentence uses (arobase · arroba · chiocciola · klammeraffe · собака · Urdu ایٹ) with any dot / join word
     («jean point dupont arobase gmail point com», «ventas arroba empresa punto com», «info собака mail точка ru»);
   - the English "at" only with the dot words that are not English words (punto · ponto · punkt · nokta · точка · Urdu ڈاٹ — never "point"):
     «info at firma punkt de»;
   - Chinese, no spaces needed: «info艾特company点com» (艾特 = @, 点 / 點 = dot). */
const X_DOT = "(?:dot|دوت|نقط[ةه]|point|punto|ponto|punkt|nokta|точка|ڈاٹ)", X_JOIN = `(?:${X_DOT}|underscore|dash|hyphen|اندرسكور|أندرسكور|شرط[ةه]|tiret|guion|guión|trattino|bindestrich|дефис)`;
const F_DOT = "(?:punto|ponto|punkt|nokta|точка|ڈاٹ)";
const SPOKEN_EMAIL_X = new RegExp(`(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}._-]{1,40}(?:\\s+${X_JOIN}\\s+[\\p{L}\\p{N}._-]{1,40}){0,3}\\s+(?:arobase|arroba|chiocciola|klammeraffe|собака|ایٹ)\\s+[\\p{L}\\p{N}-]{2,40}\\s+${X_DOT}\\s+\\p{L}{2,6}(?:\\s+${X_DOT}\\s+\\p{L}{2,6})?(?![\\p{L}\\p{N}])`, "giu");
const SPOKEN_EMAIL_F = new RegExp(`(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}._-]{1,40}(?:\\s+${F_DOT}\\s+[\\p{L}\\p{N}._-]{1,40}){0,3}\\s+at\\s+[\\p{L}\\p{N}-]{2,40}\\s+${F_DOT}\\s+\\p{L}{2,6}(?:\\s+${F_DOT}\\s+\\p{L}{2,6})?(?![\\p{L}\\p{N}])`, "giu");
const SPOKEN_EMAIL_ZH = /(?<![A-Za-z0-9._-])[A-Za-z0-9._-]{1,40}\s*艾特\s*[A-Za-z0-9-]{2,40}\s*[点點]\s*[A-Za-z]{2,6}(?:\s*[点點]\s*[A-Za-z]{2,6})?(?![A-Za-z0-9])/g;
/* a phone number said in words: 7+ digit words in a row («صفر واحد صفر صفر واحد اتنين…», «زيرو مية …», "zero one zero …"), digits mixed in;
   + the digit words of French, Spanish, Portuguese, Italian, German and Turkish (any-language calls 2026-11-20) under the same rule */
const NUM_W = "(?:و)?(?:صفر|زيرو|واحد[ةه]?|وحد[ةه]|اتنين|إتنين|اثنين|إثنين|تلات[ةه]|ثلاث[ةه]|اربع[ةه]|أربع[ةه]|خمس[ةه]|ست[ةه]|سبع[ةه]|تمان[يى][ةه]|ثمان[يى][ةه]|تسع[ةه]|مي[ةه]|zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple"
  + "|z[ée]ro|une?|deux|trois|quatre|cinq|sept|huit|neuf|cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|um|uma|dois|duas|três|quatro|sete|oito|nove"
  + "|due|tre|quattro|cinque|sei|sette|otto|null|eins|zwei|drei|vier|f[üu]nf|sechs|sieben|acht|neun|s[ıi]f[ıi]r|bir|iki|[üu][çc]|d[öo]rt|be[şs]|alt[ıi]|yedi|sekiz|dokuz|[0-9٠-٩]{1,4})";
const SPOKEN_PHONE_RX = new RegExp(`(?<![\\p{L}\\p{N}])${NUM_W}(?:[\\s,،.-]+${NUM_W}){6,}(?![\\p{L}\\p{N}])`, "giu");
const DATE_RX = new RegExp(`[${DIG}]{4}[-/.][${DIG}]{1,2}[-/.][${DIG}]{1,2}|[${DIG}]{1,2}[-/.][${DIG}]{1,2}[-/.][${DIG}]{2,4}`, "gu");
const PHONE_RX = new RegExp(`(?:\\+|00)?[${DIG}](?:[\\s.\\-()]?[${DIG}]){7,16}`, "gu");
export const MASK_EMAIL = "إيميل محجوب", MASK_PHONE = "رقم محجوب";
/* e-mail addresses (also "name at domain dot com") and phone numbers (9–15 digits: +/00 prefix, a leading 0, or 10+ digits) → masks;
   dates (2026-12-30, 30/12/2026) and short numbers (3/4/5 مم, 5000 طن, refs like 2026/123456) are kept */
export function maskPII(s) {
  const dates = [];
  let t = String(s).replace(EMAIL_RX, MASK_EMAIL).replace(SPOKEN_EMAIL_RX, MASK_EMAIL)
    .replace(SPOKEN_EMAIL_X, MASK_EMAIL).replace(SPOKEN_EMAIL_F, MASK_EMAIL).replace(SPOKEN_EMAIL_ZH, MASK_EMAIL)
    .replace(DATE_RX, d => "\u0001" + (dates.push(d) - 1) + "\u0001");
  /* digit words: 7 or more in a row, with at least 4 that are words (a run of plain digits is PHONE_RX's) */
  t = t.replace(SPOKEN_PHONE_RX, c => (c.split(/[\s,،.-]+/).filter(w => w && !/^[0-9٠-٩]+$/.test(w)).length >= 4 ? MASK_PHONE : c));
  t = t.replace(PHONE_RX, c => {
    const d = asciiDigits(c).replace(/\D/g, ""), n = d.length, pre = /^(\+|00)/.test(c.trim());
    return n >= 9 && n <= 15 && (pre || d[0] === "0" || n >= 10) ? MASK_PHONE : c;
  });
  return t.replace(/\u0001(\d+)\u0001/g, (m, i) => dates[+i]);
}
/* a query for a third-party provider: e-mail addresses and phone numbers REMOVED (a mask word would itself be searched) */
export const stripPII = s => maskPII(s).split(MASK_EMAIL).join(" ").split(MASK_PHONE).join(" ").replace(/\s+/g, " ").trim();
export function clean(v, max) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  let s = String(v).normalize("NFKC").replace(CTRL, " ").replace(INVISIBLE, "");
  s = maskPII(s).replace(/\s+/g, " ").trim();
  const cp = Array.from(s);
  return cp.length > max ? cp.slice(0, max).join("").trim() : s;
}
const BRACKETS = /[<>[\]{}〈〉《》「」『』【】〔〕〖〗〘〙〚〛⟨⟩⟪⟫⟦⟧⦃⦄⦅⦆«»‹›"`\\|#*~^_=]/g;
const MARKERS = [
  /<\|[^|]{0,40}\|>/g, /\[\/?(?:INST|SYS|SYSTEM)\]/gi, /<\/?(?:s|system|assistant|user)>/gi, /```+/g,
  /\b(?:system|assistant|developer|user|human|ai)\s*:/gi,                        // role markers
  /\bsystem\s*(?:prompt|message|instructions?|override|note|role)\b/gi, /\bSYSTEM\b/g,
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+)*(?:previous|prior|above|earlier|preceding|former|system)\b[^.!?؟\n]*/gi,
  /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|new\s+instructions?|jailbreak|prompt\s+injection|do\s+anything\s+now)\b/gi,
  /(?:تجاهل|تجاهلي|تجاهلوا|اتجاهل|انس|انسى|إنس|إنسى|انسي)\s+(?:كل\s+)?(?:ال)?(?:تعليمات|أوامر|اوامر|قواعد|برومبت|سيستم|اللي\s+فات|ما\s+سبق|السابق[هة]?)[^.!?؟\n]*/g,
  /(?:تعليمات|أوامر|اوامر)\s+(?:جديد[هة]|ال)?(?:نظام|سيستم)?/g, /(?:^|\s)(?:سيستم|النظام)\s*:/g,
];
export function forLLM(v, max = 400) {
  let s = clean(v, max * 2);
  for (const rx of MARKERS) s = s.replace(rx, " ");
  s = s.replace(BRACKETS, " ").replace(/\s+/g, " ").replace(/\s+([.:،,;؛])/g, "$1").replace(/([.:،,;؛])(?:\s*[.:،,;؛])+/g, "$1").replace(/^[\s\-–—,.;:،؛]+/, "").trim();
  const cp = Array.from(s);
  return cp.length > max ? cp.slice(0, Math.max(1, max - 1)).join("").trim() + "…" : s;
}
/* the PERSONA's words without the cue tags the avatar engine did not take (2026-11-20). Anam removes the cue tags it knows ([happy],
   [warm] …) from what it sends; any other cue-like token the LLM writes stays in the text (seen live: «[صاف] معاك حق يا فندم…» at the
   start of a Janna reply) and, from a stored call, would come back into the next call's prompt and teach the model the wrong tag.
   A cue-like token = "[" + 1–24 letters of any script (with their marks), spaces, "-" or "_" + "]", at least one letter; it goes with the
   spaces around it (one space stays between two words, none next to the text's ends, a line break or punctuation). Anything else in
   brackets stays: digits («[1]», «[3D]»), «[a.b]», a link's text «[label](url)», and a token glued to a link or an address
   («…/path[x]», «?q[name]=…»). An all-caps token («[PDF]», «[WARM]») goes too: in the persona's text a bracket token is a direction for
   the tag-capable voice, not words the visitor heard, and the model's wrong tags come in any case. Text without such a token comes back
   unchanged (the same string). The persona's text only — the member's / visitor's words are never passed through it. Browser twin:
   data/janna-live.js cueStrip (worker/test/cue-tags.test.mjs compares the two). Review 2026-11-20: a run holding a role marker
   «[INST]» / «[SYS]» / «[SYSTEM]» stays (instructionLike's first rule drops the text on it), and "glued" is CUE_LOOSE's complement
   ("the last word before the token has no / = ? & # @ : [ ]"), which is linear (the old /[…]\S*$/ backtracked: ~1.6 ms a 600-character turn). */
const CUE_RUN = /(?:[ \t]{0,8}\[(?=[ _-]{0,23}\p{L})[\p{L}\p{M} _-]{1,24}\](?!\())+[ \t]*/gu;
const CUE_LOOSE = /(?:^|\s)[^\s\/=?&#@:\[\]]*$/, CUE_ROLE = /\[(?:INST|SYS|SYSTEM)\]/i, CUE_OPEN = /^$|[\n(\[{«"'“‘]$/, CUE_CLOSE = /^$|^[\n.,;:!?،؛؟…)\]}»"'”’]/;
export function stripCues(v) {
  const s = String(v == null ? "" : v);
  const out = s.replace(CUE_RUN, (m, i) => {
    if ((m[0] === "[" && !CUE_LOOSE.test(s.slice(Math.max(0, i - 300), i))) || CUE_ROLE.test(m)) return m; // part of a link / an address / a bigger bracket; a role marker
    return CUE_OPEN.test(s.slice(Math.max(0, i - 1), i)) || CUE_CLOSE.test(s.slice(i + m.length, i + m.length + 1)) ? "" : " ";
  });
  return out === s ? s : out.trim();
}
/* orders to the model / about the member (never a legitimate search result or tender title). Kept narrow on purpose: «you must
   obtain a certificate» or «ignore the rules of origin» are ordinary trade text and pass; «you must tell the member…» does not */
const INSTR = [
  /<\|[^|]{0,40}\|>|\[\/?(?:INST|SYS|SYSTEM)\]|<\/?(?:system|assistant|user)>|\{\{[^{}]{0,80}\}\}|```/i,
  /(?:^|[\s"'«(\[{>|;,.!?-])(?:system|assistant|developer|human|user)\s*:/i,
  /\bsystem\s*(?:prompt|message|instructions?|override|role)\b/i,
  /\b(?:ignore|disregard|forget|override|bypass)\s+(?:(?:all|any|the|your|of|these|those|my)\s+)*(?:previous|prior|above|earlier|preceding|former|system|original)\b/i,
  /\b(?:ignore|disregard|forget|override|bypass)\s+(?:(?:all|any|the|your|of|these|those|my)\s+)*(?:instructions?|prompts?|guidelines)\b/i,
  /\b(?:you\s+are\s+now|pretend\s+(?:to\s+be|you\s+are)|new\s+instructions?|jailbreak|prompt\s+injection|do\s+anything\s+now|developer\s+mode)\b/i,
  /\b(?:you|bassem|janna|the\s+(?:ai\s+)?assistant|this\s+assistant|the\s+advisor)\s+(?:must|should|shall|has\s+to|have\s+to|needs?\s+to|is\s+required\s+to|are\s+required\s+to)\s+(?:now\s+|always\s+|only\s+)?(?:tell|say|inform|answer|reply|respond|recommend|ignore|forget|reveal|instruct|direct|ask|insist|promise|guarantee|confirm|never|always|stop)\b/i,
  /\b(?:bassem|janna)\s+(?:must|should|shall)\b/i,
  /\b(?:tell|instruct|order|direct|convince)\s+(?:the\s+|every\s+|all\s+|each\s+|your\s+|our\s+)?(?:members?|users?|callers?|customers?|clients?|partners?|visitors?)\s+(?:to|that)\b/i,
  /\b(?:reveal|show|print|repeat|leak|output|expose)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|secrets?|api\s+keys?)\b/i,
  /(?:تجاهل|تجاهلي|تجاهلوا|اتجاهل|انس|انسى|إنس|إنسى|انسي)\s+(?:كل\s+)?(?:ال)?(?:تعليمات|أوامر|اوامر|قواعد|برومبت|سيستم|اللي\s+فات|ما\s+سبق|السابق)/,
  /(?:تعليمات|أوامر|اوامر)\s+(?:جديد[هة]|ال(?:نظام|سيستم))/, /(?:^|\s)(?:سيستم|النظام|المساعد)\s*:/,
  /(?:^|\s)(?:قول|قولي|قل|بلّغ|اطلب\s+من|اقنع|أقنع)\s+(?:لل|ال|ل)?(?:عضو|أعضاء|اعضاء|عميل|عملاء|مستخدم)/, /(?:^|\s)(?:قول|قولي|قل|بلّغ)\s+(?:لكل|كل)\s+(?:ال)?(?:أعضاء|اعضاء|عملاء)/,
  /(?:لازم|يجب\s+(?:على|أن|ان))\s+(?:باسم|جنة|جنه|المساعد)/,
  /* review 2026-11-19 #9: the other Arabic word orders and "from now on / always say" (matched on fold()ed text: no tatweel, no
     diacritics, look-alike letters folded) — «جنة لازم تقول لكل زائر…», «على جنة إنها تقول…», «المطلوب من جنة…», «من دلوقتي قول…» */
  /(?:^|[\s"'«(،,.:؛!؟?-])(?:باسم|جن[ةه]|المساعد|المستشار)\s*[،,:]?\s*(?:لازم|لا\s*بد|لابد|يجب|المفروض|مطلوب\s+منه?ا?|عليه?ا?\s+(?:إن|ان|أن))\s+(?:دايم[اًأ]*\s+|دائم[اًأ]*\s+|من\s+دلوقتي\s+)?(?:ي|ت)(?:قول|بلغ|بلّغ|قنع|وصي|رشح|رشّح|رد|جاوب|ذكر|طلب|نصح|وجه|وجّه|أكد|اكد|حول|حوّل|خلي|خلّي)(?=[\s،,.:؛!؟?]|$)/,
  /(?:^|[\s"'«(،,.:؛!؟?-])(?:على|المطلوب\s+من|مطلوب\s+من)\s+(?:باسم|جن[ةه]|المساعد|المستشار)\s+(?:(?:إن|ان|أن|إنه|انه|إنها|انها)(?=\s)|دايم|دائم|(?:ي|ت)(?:قول|بلغ|قنع|وصي|رشح|رد|جاوب|ذكر|نصح|وجه|أكد|اكد)(?=[\s،,.:؛!؟?]|$))/,
  /(?:^|[\s"'«(،,.:؛!؟?-])(?:من\s+(?:دلوقتي|الآن|الان|النهارده|النهاردة|هنا\s+ورايح)|بعد\s+كده|دايم[اًأ]*|دائم[اًأ]*)\s*[،,]?\s*(?:قول|قولي|قولوا|قل|رد|ردي|جاوب|جاوبي|بلّغ|بلغ)\s+(?:لكل|لأي|لاي|كل|للعملاء|للعميل|للعضو|للأعضاء|للاعضاء|للزائر|للزوار|للناس|للمستخدمين|إن|ان|أن)(?=[\s،,.:؛!؟?]|$)/,
  /\b(?:from\s+now\s+on|henceforth|going\s+forward|starting\s+now)\s*,?\s+(?:(?:you\s+)?(?:must|should|will|shall)\s+)?(?:always\s+|only\s+|never\s+)?(?:say|tell|answer|reply|respond|recommend|claim|state|insist|mention|direct|refer)\b(?!\s+(?:me|us)\b)/i,
  /\b(?:bassem|janna|assistant|advisor|ai)\s*[,:;-]\s*(?:from\s+now\s+on|always|never|only|you\s+(?:must|should|have\s+to))\b/i,
  /\b(?:always|only)\s+(?:say|tell\s+(?:the\s+|every\s+|all\s+|each\s+)?(?:members?|users?|callers?|customers?|clients?|visitors?|people))\s+(?:that|the|to|payment|pay)\b/i,
];
/* payment instructions — for WEB results only (a tender legitimately mentions a deposit / تأمين) */
const MONEY = [
  /\b(?:iban|swift\s*code|bic\s*code|routing\s+number|account\s+(?:number|no\b)|bank\s+account|wire\s+transfer|western\s+union|moneygram|bitcoin|crypto\s*wallet|usdt|wallet\s+address)\b/i,
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/,
  /\b(?:wire|transfer|send|pay|deposit)\s+(?:the\s+|a\s+|an\s+|your\s+|\d[\d,.]*\s*)?(?:money|funds|deposit|payment|amount|fee|advance|down\s*payment|usd|dollars|egp)\b/i,
  /\b(?:pay|send|make)\s+(?:a\s+|the\s+|an\s+)?(?:deposit|advance|down\s*payment|upfront)\b/i,
  /\bdeposit\s+(?:to|into|in)\s+(?:the\s+|our\s+|this\s+)?(?:account|wallet|bank)\b/i,
  /(?:رقم\s+(?:ال)?حساب|حساب\s+بنكي|آيبان|ايبان|أيبان|تحويل\s+بنكي|ويسترن\s+يونيون|بيتكوين|محفظة\s+(?:رقمية|إلكترونية|الكترونية))/,
  /(?:حوّل|حوّلوا|ادفع|إدفع|ادفعوا)\s+(?:ال)?(?:فلوس|مبلغ|عربون|مقدم|دفعة)/,
  /(?:^|\s)حول(?:وا)?\s+(?:ال)?(?:فلوس|مبلغ|عربون|مقدم|دفع[ةه])\s+(?:على|عل|ل|في|الى|إلى|لحساب|لرقم)/, // the same without the shadda (review 2026-11-19 #9)
];
/* review 2026-11-19 #9: look-alike letters (Cyrillic / Greek → Latin, Persian → Arabic) and tatweel are folded before matching («Ignоre»
   with a Cyrillic о, «تجاهـل» with a tatweel); the diacritics are tried with and without (MONEY keeps them: «حوّل» transfer ≠ «حول» about) */
const LOOKALIKE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "к": "k", "м": "m", "т": "t", "в": "b",
  "н": "h", "г": "r", "п": "n", "ԛ": "q", "ԝ": "w", "ɡ": "g", "ɑ": "a", "ı": "i", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
  "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S", "α": "a", "ε": "e", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "ν": "v", "ι": "i", "κ": "k", "χ": "x", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z",
  "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "ی": "ي", "ک": "ك", "ہ": "ه", "ۃ": "ة", "ے": "ي", "ٱ": "ا" };
const LOOK_RX = new RegExp("[" + Object.keys(LOOKALIKE).join("") + "]", "g");
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
/* the text as the filters read it: NFKC, no control / invisible characters, no tatweel, look-alike letters folded (diacritics kept) */
export const fold = s => String(s == null ? "" : s).normalize("NFKC").replace(CTRL, " ").replace(INVISIBLE, "").replace(/\u0640/g, "").replace(LOOK_RX, c => LOOKALIKE[c] || c);
export function instructionLike(s, { money = true } = {}) {
  const t = fold(s), bare = t.replace(DIACRITICS, "");
  return INSTR.some(rx => rx.test(t) || rx.test(bare)) || (money && MONEY.some(rx => rx.test(t)));
}
