/* «بحث وكتابة عميقة» — the honesty checker (design part A §A.9). PURE: no I/O, no clock. Every block of model text passes the rules in
   order; the first rule that hits drops the block and is recorded in `dropped` (internal: the data desk only; masked, ≤ 200 characters):
     C0  the validator (unknown section key, wrong type, over a length)
     C1  an m section block without a valid cite; an a (advice) block with a digit, a name C5 would check, a country / market, a regulator
         word or a superlative (unless the profile / the input says it)
     C2  a cite that is not in the pack, or one the team hid / rejected
     C3  numbersOf(): a number, amount (with its magnitude word), percentage, number word or date that is not in the cited evidence's VALUE
         fields (dates match dates only; ids / refs never count) — the user's own numbers only in his own content kinds; in a voice quotation
         a number must also be in the call's last user words (`heard`), else it becomes «[ ]»
     C5  a company / entity name (a marker + 1–4 words, a «…» quote, ≥ 2 capitalised Latin words, an all-caps token, a name of the
         platform's directory) that no cited item, the input (own kinds) or the member's profile names; a gazetteer is exempt
     C6  a link, a domain (also spelt out), an e-mail, a name of the job's sources or of the shared site lists (THIRD / BRAND of
         web-public.js) — a cited item's own entity is exempt (R5) unless that entity is itself a site's name
     C7  a provenance or caveat phrase (Arabic + English; «حسب الطلب», «حسب المواصفات», «المصدّر» = the exporter stay)
     C8  a membership / verification / presence word («عضو», «على المنصة», «موثّق», «عندنا», "we have", "our members" …) — the renderer adds
         the true badges from data; not in the user's own content kinds
     C9  a status or apply word in a block about a tender / RFQ (the status is computed when the document is read, never written)
     C10 a run of ≥ 8 words copied from an outside title / snippet (or an Information Center item's original title)
     C11 instruction-like text (text.js instructionLike)
     C12 a contact the masks catch (text.js maskPII) or ≥ 9 digits in a row
     C13 (model blocks only) not in the document's language, judged by script
     C14 the platform's plans or prices (not in the user's own content kinds)
     C15 the title / summary failing C3, C5–C8, C11, C12 → the kind's fixed Worker text (headings are always the Worker's own)
   After the blocks: an item line is checked by C3, C5–C12; ≥ 50 % of the model blocks dropped, or the language wrong → `retry` (the job's
   one fallback call, research.js). scrubSources() cleans a text BEFORE the model sees it (the pack); check() never trusts it did. */
import DATA from "./data.json";
import { norm, maskPII, instructionLike, asciiDigits, forLLM } from "./text.js";
import { GOV_CODES } from "./common.js";
import { THIRD, BRAND, siteLabels } from "./web-public.js";
import { KINDS, BLOCK_TYPES, MARKETS } from "./research-kinds.js";

export const LIM = Object.freeze({ title: 120, summary: 600, heading: 80, block: 1200, sections: 10, blocks: 14, lines: 40, line: 160, entity: 100, dropText: 200 });
const ID_RX = /^E\d{1,3}$/;
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (s, rx) => { rx.lastIndex = 0; const r = rx.test(s); rx.lastIndex = 0; return r; };

/* ---------- the shared name lists (one list: web-public.js THIRD + BRAND; never a second copy) ---------- */
const SITE_NAMES = (() => {
  const out = new Set();
  for (const h of THIRD) { for (const l of siteLabels(h)) out.add(l.toLowerCase()); }
  for (const k of Object.keys(BRAND)) for (const n of BRAND[k]) { const v = norm(n); if (v.length >= 3) out.add(v); }
  return [...out];
})();
export const sitesList = () => SITE_NAMES.slice();
/* the platform's directory names (naming a real company wrongly is the worst case — design C5): normalised, ≥ 8 characters */
const DIR_NAMES = (() => { const s = new Set(); for (const f of DATA.f || []) { const n = norm(f && f[0]); if (n.length >= 8 && n.split(" ").length >= 2) s.add(n); } return [...s]; })();

/* ---------- the gazetteer (exempt from C5; in advice a country / market is still a C1 hit) ---------- */
const COUNTRIES = ["مصر", "السعوديه", "المملكه العربيه السعوديه", "الامارات", "الكويت", "قطر", "عمان", "سلطنه عمان", "البحرين", "الاردن", "العراق", "ليبيا", "المغرب", "الجزائر", "تونس", "السودان", "لبنان", "سوريا", "اليمن",
  "كينيا", "نيجيريا", "اثيوبيا", "جنوب افريقيا", "غانا", "تنزانيا", "اوغندا", "الصين", "الهند", "تركيا", "المانيا", "ايطاليا", "فرنسا", "اسبانيا", "بريطانيا", "روسيا", "امريكا", "الولايات المتحده",
  "الخليج", "افريقيا", "اسيا", "اوروبا", "الشرق الاوسط", "الاتحاد الاوروبي", "الدول العربيه", "العالم",
  "egypt", "saudi arabia", "uae", "united arab emirates", "kuwait", "qatar", "oman", "bahrain", "jordan", "iraq", "libya", "morocco", "algeria", "tunisia", "sudan", "lebanon", "kenya", "nigeria",
  "ethiopia", "south africa", "ghana", "china", "india", "turkey", "germany", "italy", "france", "spain", "united kingdom", "uk", "russia", "usa", "united states", "gulf", "africa", "asia",
  "europe", "middle east", "european union", "eu", "gcc", "mena", "world"];
const CITIES = ["القاهره", "الجيزه", "الاسكندريه", "العاشر من رمضان", "السادس من اكتوبر", "السادات", "العبور", "بدر", "برج العرب", "العين السخنه", "دبي", "ابوظبي", "الرياض", "جده", "الدمام", "الدوحه",
  "cairo", "giza", "alexandria", "dubai", "abu dhabi", "riyadh", "jeddah", "dammam", "doha", "muscat", "manama", "amman", "baghdad", "tripoli", "casablanca", "nairobi", "lagos"];
const MONTHS_AR = { يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, اغسطس: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
const MONTHS_EN = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
const STANDARDS = ["iso", "hs", "ce", "fob", "cif", "cfr", "exw", "ddp", "dap", "fca", "incoterms", "b2b", "pdf", "vat", "sme", "rfq", "rfqs", "faq", "ok", "usd", "egp", "eur", "sar", "aed", "kg", "mm", "cm", "km", "gcc", "eu", "uk", "usa", "uae", "mena", "id", "erp", "crm", "seo", "ai"];
const PLATFORM = ["صنع في مصر", "منصه صنع في مصر", "بوابه صنع في مصر", "جنه", "باسم", "made in egypt", "made in egypt gate", "janna", "bassem"];
const GAZ = new Set([...COUNTRIES, ...CITIES, ...Object.keys(MONTHS_AR), ...Object.keys(MONTHS_EN), ...STANDARDS, ...PLATFORM, ...Object.values(GOV_CODES).flatMap(x => [norm(x[0]), norm(x[1])]),
  ...Object.values(MARKETS).flatMap(x => [norm(x[0]), norm(x[1]).replace(/^the /, "")])].map(x => norm(x)));
const gaz = s => { const n = norm(s).replace(/^(?:ال|the )/, ""); return GAZ.has(norm(s)) || GAZ.has(n) || GAZ.has("ال" + n); };
const COUNTRY_RX = new RegExp("(?:^| )(?:" + [...new Set(COUNTRIES.concat(CITIES, Object.values(GOV_CODES).flatMap(x => [norm(x[0]), norm(x[1])])).map(norm))].sort((a, b) => b.length - a.length).map(esc).join("|") + ")(?= |$)");

/* ---------- numbers (C3) ---------- */
const MAG = [["مليار", 1e9], ["مليارات", 1e9], ["billion", 1e9], ["bn", 1e9], ["مليون", 1e6], ["ملايين", 1e6], ["million", 1e6], ["mn", 1e6], ["m", 1e6], ["الف", 1e3], ["آلاف", 1e3], ["الاف", 1e3], ["ألف", 1e3], ["thousand", 1e3], ["k", 1e3]];
const MAG_RX = "(?:\\s*(" + MAG.map(m => esc(m[0])).sort((a, b) => b.length - a.length).join("|") + ")(?![\\p{L}]))?";
const WORDS_N = { تلاته: 3, ثلاثه: 3, تلات: 3, ثلاث: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, تمانيه: 8, ثمانيه: 8, تمن: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10,
  عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90, ميه: 100, مايه: 100, مائه: 100, ميتين: 200, مئتين: 200,
  three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const WMAG = { الف: 1e3, مليون: 1e6, مليار: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };
const pad = n => String(n).padStart(2, "0");
const dateIso = (y, m, d) => (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? y + "-" + pad(m) + "-" + pad(d) : "");
/* → {dates: [iso], nums: [value], pcts: [value], years: [y]} — Arabic-Indic digits folded; standard identifiers are not numbers */
export function numbersOf(s) {
  let t = " " + asciiDigits(String(s == null ? "" : s)).replace(/[٫]/g, ".").replace(/[٬]/g, ",") + " ";
  const out = { dates: [], nums: [], pcts: [], years: [] };
  t = t.replace(/\b(?:ISO|HS|EN|IEC|ASTM|DIN|BS|Incoterms|SASO|GSO)\s*[-:]?\s*\d[\d.\-/]*/gi, " "); // ISO 9001, HS 8471, Incoterms 2020
  t = t.replace(/\bE\d{1,3}\b/g, " "); // an evidence id is never a number
  t = t.replace(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g, (m, y, mo, d) => { const v = dateIso(+y, +mo, +d); if (v) out.dates.push(v); return " "; });
  t = t.replace(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/g, (m, d, mo, y) => { const v = dateIso(+y, +mo, +d); if (v) out.dates.push(v); return " "; });
  /* «10 ديسمبر 2026», "December 10, 2026", "10 Dec 2026" (on the raw text, so the day is never counted again as a number) */
  const mo = w => { const n = norm(w); return MONTHS_AR[n] || MONTHS_EN[n] || 0; };
  t = t.replace(/(\d{1,2})\s+([\p{L}]+)[\s,]+(\d{4})/gu, (m, d, mn, y) => { const k = mo(mn); if (!k) return m; const v = dateIso(+y, k, +d); if (v) out.dates.push(v); return " "; })
    .replace(/([\p{L}]+)\s+(\d{1,2}),?\s+(\d{4})/gu, (m, mn, d, y) => { const k = mo(mn); if (!k) return m; const v = dateIso(+y, k, +d); if (v) out.dates.push(v); return " "; });
  let rest = norm(t);
  /* percentages, then amounts with their magnitude word (on the raw text: «1,500» and «12.5» keep their separators) */
  let raw = t;
  raw = raw.replace(/(\d+(?:[.,]\d+)?)\s*(?:%|٪|في الم[يئ]ة|في المائة|بالمية|percent|per cent)/gi, (m, n) => { out.pcts.push(parseFloat(n.replace(",", "."))); return " "; });
  const NRX = new RegExp("(\\d{1,3}(?:[,،]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)" + MAG_RX, "giu");
  const datesInRaw = [];
  raw.replace(NRX, (m, n, mag) => {
    const v0 = parseFloat(n.replace(/[,،]/g, "")), w = mag ? (MAG.find(x => x[0] === norm(mag) || x[0] === mag.toLowerCase()) || [0, 1])[1] : 1;
    if (!Number.isFinite(v0)) return m;
    datesInRaw.push(1);
    if (!mag && v0 >= 1900 && v0 <= 2100 && Number.isInteger(v0)) out.years.push(v0);
    else out.nums.push(v0 * w);
    return " ";
  });
  /* number words (3 and up; «واحد» / «اتنين» are too common to check), with a magnitude word after them */
  rest = rest.replace(/(\d+)/g, " ");
  const ws = rest.split(" ").filter(Boolean);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i].replace(/^و/, ""), v = WORDS_N[w] || WORDS_N[ws[i]];
    const half = (w === "نص" || w === "نصف") && WMAG[ws[i + 1]];
    if (!v && !half) continue;
    const mg = WMAG[ws[i + 1]] || 1;
    out.nums.push((half ? 0.5 : v) * mg);
    if (mg > 1) i++;
  }
  for (const d of out.dates) out.years.push(+d.slice(0, 4));
  return out;
}
const sameNum = (a, b) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);
/* the allowed set of some texts: every value field's numbers (ids never) */
export function allowedOf(texts) {
  const A = { dates: new Set(), nums: [], pcts: [], years: new Set() };
  for (const s of texts) { const n = numbersOf(s); n.dates.forEach(d => A.dates.add(d)); A.nums.push(...n.nums); A.pcts.push(...n.pcts); n.years.forEach(y => A.years.add(y)); n.dates.forEach(d => A.years.add(+d.slice(0, 4))); }
  return A;
}
/* → the first number of `text` that `A` does not allow, or null */
export function badNumber(text, A) {
  const n = numbersOf(text);
  for (const d of n.dates) if (!A.dates.has(d)) return d;
  for (const y of n.years) if (!A.years.has(y) && !n.dates.some(d => +d.slice(0, 4) === y)) return String(y);
  for (const v of n.nums) if (!A.nums.some(x => sameNum(v, x))) return String(v);
  for (const p of n.pcts) if (!A.pcts.some(x => sameNum(p, x))) return p + "%";
  return null;
}

/* ---------- names (C5) ---------- */
const MARKER_AR = "(?:شرك[ةه]|مصنع|مؤسس[ةه]|مجموع[ةه]|هيئ[ةه]|وزار[ةه]|جهاز|بنك|مجلس|مستشفى|جامع[ةه]|محافظ[ةه])";
const STOP_AFTER = new Set(["من", "في", "على", "علي", "عن", "و", "او", "أو", "ل", "لـ", "اللي", "الذي", "التي", "كبيره", "كبير", "صغيره", "صغير", "جديده", "جديد", "تانيه", "تاني", "اخري", "أخرى", "مختلفه", "متخصصه", "حكوميه", "خاصه", "عامه",
  "بتاعك", "بتاعتك", "منتجك", "مصنعك", "شركتك", "بيعمل", "بيشتغل", "بتشتري", "بتستخدم", "يحتاج", "تحتاج", "زي", "مثل", "كده", "ده", "دي", "هذه", "هذا", "واحد", "واحده", "انتاج", "إنتاج", "صناعي", "صناعيه", "محلي", "محليه"]);
const STOP_PHRASES = [/^مجموعه (?:من|كبيره|واسعه|متنوعه)/, /^جهاز (?:ل|بيعمل|بي)/, /^جهاز \S*(?:لف|قياس|تحكم)/];
const LAT_MARK = /\b([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})\s+(?:Company|Co\.?|Ltd\.?|Group|Authority|Ministry|Inc\.?|LLC|Corporation|Corp\.?|Holding|Industries)\b/g;
/* the candidate names of a text (normalised) */
export function namesIn(s) {
  const t = String(s || ""), out = [];
  const tn = norm(t);
  {
    const rx = new RegExp("(?:^|[\\s«(\"'،,.:؛])[وبلف]?(?:ال)?(" + MARKER_AR + ")\\s+((?:[^\\s،,.:؛()«»\"']+\\s*){1,4})", "gu");
    let m; while ((m = rx.exec(t))) {
      if (STOP_PHRASES.some(sp => sp.test(norm(m[1] + " " + m[2])))) continue; // «مجموعة من المصانع», «جهاز لف»: ordinary words
      const ws = m[2].trim().split(/\s+/); const keep = [];
      for (const w of ws) { const nw = norm(w); if (!nw || STOP_AFTER.has(nw) || /^\d/.test(nw) || (keep.length && /^و\S{3,}/.test(nw))) break; keep.push(w); }
      if (keep.length) out.push(norm(keep.join(" ")));
    }
  }
  t.replace(/«([^»]{2,60})»/g, (m, q) => { out.push(norm(q)); return m; });
  t.replace(LAT_MARK, (m, n) => { out.push(norm(n)); return m; });
  /* ≥ 2 capitalised Latin words (the first word of a sentence does not count), any all-caps token of 2–6 letters */
  t.replace(/(^|[.!?؟:]\s+|\s)((?:[A-Z][a-z]+(?:\s+(?:&\s+)?)){1,5}[A-Z][a-z]+)/g, (m, pre, run) => {
    let ws = run.trim().split(/\s+/).filter(w => w !== "&"); if (/^$|[.!?؟:]\s+$/.test(pre) || pre === "") ws = ws.slice(1);
    if (ws.length >= 2) { const nn = norm(ws.join(" ")); if (!ws.every(w => gaz(w)) && !gaz(nn)) out.push(nn); }
    return m;
  });
  t.replace(/\b([A-Z]{2,6})\b/g, (m, w) => { if (!gaz(w)) out.push(w.toLowerCase()); return m; });
  for (const d of DIR_NAMES) if ((" " + tn + " ").includes(" " + d + " ")) out.push(d);
  return [...new Set(out.filter(x => x && !gaz(x)))];
}
/* a candidate is allowed when the haystack holds it whole, or its first two words (a marker's capture often runs on into the sentence:
   «الهيئة العامة للبترول مفتوحة»), or every one of its words */
const nameOk = (n, hay) => { if (!n) return true; const h = " " + hay + " "; if (h.includes(" " + n + " ") || hay.includes(n)) return true; const all = n.split(" "); if (all.length >= 2 && h.includes(" " + all.slice(0, 2).join(" ") + " ")) return true; const ws = all.filter(w => w.length > 2); return ws.length > 0 && ws.every(w => h.includes(" " + w + " ") || hay.includes(w)); };

/* ---------- C6 / C7 / C8 / C9 / C14 phrase lists ---------- */
const LINK_RX = /(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const DOMAIN_RX = /\b[a-z0-9][a-z0-9-]{1,62}\s*(?:\.|\s+dot\s+|\s+دوت\s+)\s*(?:com|net|org|gov|edu|info|biz|news|io|co|me|tv|int|online|site|store|eg|sa|ae|kw|qa|om|bh|jo|iq|ly|ma|dz|tn|cn|in|tr|de|it|fr|es|uk|us|eu)\b/i;
const DOMAIN_AR = /(?:دوت\s*كوم|دوت\s*نت|دوت\s*أورج|دوت\s*اورج)/;
const PROV_AR = ["من الانترنت", "على الانترنت", "علي الانترنت", "من النت", "على النت", "من مواقع", "من بره المنصه", "من برا المنصه", "من خارج المنصه", "خارج بيانات المنصه", "مصادر خارجيه", "مصادر عامه",
  "مصادر رسميه", "مصادر مطلعه", "مصادر صحفيه", "مصادر اعلاميه", "حسب مصادر", "من مصادر", "متابعه السوق", "حسب موقع", "وفقا لموقع", "وفقا ل موقع", "نقلا عن", "غير موثق", "مش موثق", "غير مؤكد", "مش مؤكد", "مش متحقق",
  "لم يتم التحقق", "لازم نتاكد", "يرجي التحقق", "يرجى التحقق", "مسوده اليه", "بالذكاء الاصطناعي", "منقول من", "من مصدره", "المصدر المنشور", "المصادر الرسميه", "على موقع", "علي موقع", "الموقع الرسمي ل",
  "الموقع الرسمي", "جريده", "صحيفه", "المصدر", "من بيانات المنصه", "من غير مصدر", "بدون مصدر", "من متابعه فريق المنصه", "بحسب موقع", "بحسب ما نشر", "بحسب تقرير", "بحسب تقارير", "بحسب بيانات",
  "طبقا لموقع", "طبقا ل موقع", "طبقا لما نشر", "طبقا لتقرير", "نشرت", "ذكرت", "افادت", "حسب ما نشر", "حسب تقرير", "حسب تقارير"].map(norm);
/* «المصدر» alone is NOT a hit (it is often the exporter — «المصدّر» — without the shadda): only «المصدر:» with a colon, below */
const PROV_AR_SET = PROV_AR.filter(p => p !== "المصدر");
const PROV_EN = /\b(?:from the (?:internet|web)|online sources|outside the platform|external sources|public sources|reportedly|unverified|not verified|please verify|needs? checking|automated draft|ai[- ]generated|source\s*:|reported by|published on|listed on|via (?:the )?(?:website|site|portal|web|internet)|according to (?:the |a |an )?(?:website|site|portal|report|reports|press|media|news|newspaper|sources?|data from)|as reported)\b/i;
const SRC_COLON = /(?:^|\s)(?:ال)?مصدر\s*[:：]/;
const C8_AR = ["عضو", "اعضاء", "أعضاء", "عضويه", "مسجل", "مسجله", "على المنصه", "علي المنصه", "موثق", "موثقه", "معتمد من المنصه", "عندنا", "لدينا", "في دليلنا", "قاعده بياناتنا", "عملاؤنا", "عملائنا",
  "شركاؤنا", "شركائنا", "اعضاؤنا", "أعضاؤنا"].map(norm);
const C8_EN = /\b(?:registered|members?|verified|on the platform|we have|we've got|our (?:members|clients|customers|partners|directory|database)|in our network)\b/i;
const OPEN_AR = ["مفتوح", "مفتوحه", "ساريه", "ساري", "لسه متاح", "لسه متاحه", "متاحه للتقديم", "متاح للتقديم", "قدم", "تقدم", "قدم عرضك", "قدم عرض", "التقديم مفتوح", "باب التقديم", "سارع", "بادر", "ينتهي قريبا", "بتقفل"].map(norm);
const OPEN_EN = /\b(?:open|apply|submit|still accepting|closing soon|bid now|deadline approaching)\b/i;
const TENDER_W = /(?:^| )(?:ال)?(?:مناقص[ةه]|مناقصات|ممارس[ةه]|طلب عرض|طلبات عروض|عطاء|عطاءات)(?= |$)|\b(?:tender|tenders|rfq|rfqs|bid|bids)\b/i;
const C14_RX = /(?:باق[ةه]|اشتراك|الشريك الاساسي|الشريك الاستراتيجي|الباقه)[^.؟!]{0,40}\d|\b(?:plan|subscription|membership)\b[^.?!]{0,40}\d/i;
const REG_AR = ["هيئه", "وزاره", "جمارك", "الجمارك", "شهاده", "شهادات", "تسجيل", "ترخيص", "رخصه", "رسوم", "ضريبه", "ضرائب", "اشتراطات", "مواصفه", "مواصفات قياسيه"].map(norm);
const REG_EN = /\b(?:certificates?|certification|registration|licen[cs]e|dut(?:y|ies)|tariffs?|customs|standards?|regulator|authority|ministry|tax)\b/i;
const SUPER_AR = ["اكبر", "الاكبر", "الاول", "الأول", "الرائد", "الرائده", "الافضل", "رقم 1", "رقم واحد"].map(norm);
const SUPER_EN = /\b(?:leading|largest|biggest|no\.?\s*1|number one|best|top)\b/i;
const wordIn = (nt, w) => { const t = " " + nt + " "; return t.includes(" " + w + " ") || ["و", "ب", "ل", "ك", "ف"].some(p => t.includes(" " + p + w + " ")); };
const anyWord = (nt, list) => list.some(w => wordIn(nt, w));

/* ---------- C13: the script of a text ---------- */
const AR_L = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/gu, LAT_L = /[A-Za-zÀ-ɏ]/g, CJK_L = /[㐀-鿿豈-﫿]/g;
const count = (s, rx) => (String(s).match(rx) || []).length;
export function langOk(text, lang) {
  const a = count(text, AR_L), l = count(text, LAT_L), c = count(text, CJK_L), n = a + l + c;
  if (n < 12) return true; // too short to judge (a name, a number)
  if (lang === "ar" || lang === "ur" || lang === "fa") return a / n >= 0.4; // Latin company names inside Arabic text are common
  if (lang === "zh") return c / n >= 0.4;
  return l / n >= 0.6;
}

/* ---------- C10: copies of outside text ---------- */
const shingles = (s, k = 8) => { const w = norm(s).split(" ").filter(Boolean), out = []; for (let i = 0; i + k <= w.length; i++) out.push(w.slice(i, i + k).join(" ")); return out; };
export function copyIndex(texts) { const set = new Set(), long = []; for (const s of texts || []) { for (const x of shingles(s)) set.add(x); const n = norm(s); if (n.length >= 60) long.push(n); } return { set, long }; }
const copied = (s, ix) => { if (!ix) return false; if (shingles(s).some(x => ix.set.has(x))) return true; const n = norm(s); return ix.long.some(l => n.includes(l)) || (n.length >= 60 && ix.long.some(l => l.includes(n))); };

/* ---------- scrubSources (BEFORE the model): the item's own site / host / brand names, the shared lists, domains, trailing site tails ---------- */
export function scrubSources(text, names = [], keep = "") {
  let t = String(text == null ? "" : text);
  const kn = norm(keep);
  t = t.replace(/(?:https?:\/\/|www\.)\S+/gi, " ").replace(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|gov|edu|info|biz|news|io|co|me|tv|int|online|site|store|eg|sa|ae|kw|qa|om|bh|jo|iq|ly|ma|dz|tn|cn|in|tr|de|it|fr|es|uk|us|eu)(?:\.[a-z]{2})?\b/gi, " ");
  /* a last title segment that is a site's name («… - اليوم السابع», "… | Tenders Info") */
  const segs = t.split(/\s+[-|–—:]\s+|\s*\|\s*/);
  if (segs.length > 1) { const last = norm(segs[segs.length - 1]); if (last && (SITE_NAMES.some(n => last === n || last.includes(n)) || names.some(n => norm(n) && last.includes(norm(n))))) t = segs.slice(0, -1).join(" - "); }
  for (const n of [...names, ...SITE_NAMES]) {
    const nn = norm(n); if (!nn || nn.length < 3 || (kn && kn.includes(nn))) continue;
    if (/^[a-z0-9]+$/.test(nn)) t = t.replace(new RegExp("(^|[^a-z0-9])" + esc(nn) + "(?=$|[^a-z0-9])", "gi"), "$1 ");
    else { const rx = new RegExp(esc(String(n)).replace(/[اأإآ]/g, "[اأإآ]").replace(/[ةه]/g, "[ةه]").replace(/[يى]/g, "[يى]").replace(/\s+/g, "\\s+"), "g"); t = t.replace(rx, " "); }
  }
  return t.replace(/\(\s*\)/g, " ").replace(/\s+([،,.:؛])/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s\-|–—:،,]+|[\s\-|–—:،,]+$/g, "").trim();
}

/* ---------- the rules on one text ---------- */
/* o: {A (allowed numbers), hay (normalised names allowed), srcNames, exempt (normalised entity names, R5), copies, own, lang, model,
   tenderCite, advice, profileHay, inputHay, quoteFix} → {rule} | {ok, text} */
function rules(text, o) {
  let t = String(text || "");
  const nt = norm(t);
  if (o.advice) {
    if (/\d/.test(asciiDigits(t))) return { rule: "C1" };
    if (COUNTRY_RX.test(nt)) return { rule: "C1" };
    if (anyWord(nt, REG_AR) || REG_EN.test(t)) return { rule: "C1" };
    if ((anyWord(nt, SUPER_AR) || SUPER_EN.test(t)) && !(o.profileHay && SUPER_AR.some(w => o.profileHay.includes(w)))) return { rule: "C1" };
    if (namesIn(t).length) return { rule: "C1" };
  }
  if (has(t, LINK_RX) || DOMAIN_RX.test(t) || DOMAIN_AR.test(t)) return { rule: "C6" };
  if (instructionLike(t)) return { rule: "C11" };
  if (maskPII(t) !== t || /\d{9,}/.test(asciiDigits(t).replace(/[\s\-.]/g, ""))) return { rule: "C12" };
  {
    let rest0 = " " + nt + " ";
    for (const e of o.exempt || []) if (e) rest0 = rest0.split(" " + e + " ").join(" ");
    for (const n of [...SITE_NAMES, ...(o.srcNames || [])]) { const nn = norm(n); if (nn && nn.length >= 3 && rest0.includes(" " + nn + " ")) return { rule: "C6" }; if (/^[a-z0-9]{4,}$/.test(nn) && new RegExp("(^|[^a-z0-9])" + esc(nn) + "($|[^a-z0-9])", "i").test(rest0)) return { rule: "C6" }; }
  }
  if (o.A && !o.advice) {
    const bad = badNumber(t, o.A);
    if (bad != null) {
      if (!o.quoteFix) return { rule: "C3" };
      /* a voice quotation: a number the member did not say becomes «[ ]» (the persona may have misheard or invented it) */
      let guard = 0, b = bad;
      while (b != null && guard++ < 30) { const v = String(b), parts = [v, v.replace(/\B(?=(\d{3})+(?!\d))/g, ",")]; let hit = false; for (const p of parts) { const i = asciiDigits(t).indexOf(p); if (i >= 0) { t = t.slice(0, i) + "[ ]" + t.slice(i + p.length); hit = true; break; } } if (!hit) return { rule: "C3" }; b = badNumber(t, o.A); }
    }
  }
  if (!o.advice) for (const n of namesIn(t)) if (!nameOk(n, o.hay)) return { rule: "C5" };
  if (PROV_AR_SET.some(p => (" " + nt + " ").includes(" " + p + " ")) || PROV_EN.test(t) || SRC_COLON.test(t)) return { rule: "C7" };
  if (!o.own && (anyWord(nt, C8_AR) || C8_EN.test(t))) return { rule: "C8" };
  if (!o.own && (o.tenderCite || TENDER_W.test(nt)) && (anyWord(nt, OPEN_AR) || OPEN_EN.test(t))) return { rule: "C9" };
  if (copied(t, o.copies)) return { rule: "C10" };
  if (o.model && o.lang && !langOk(t, o.lang)) return { rule: "C13" };
  if (!o.own && C14_RX.test(nt)) return { rule: "C14" };
  return { ok: true, text: t };
}

const s = (v, max) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]{2,}/g, " ").trim().slice(0, max);
const short = v => forLLM(maskPII(String(v || "")), LIM.dropText);
/* the haystack of names an evidence item allows */
const hayOf = e => norm([e.name, e.entity, e.title, e.name_hint, e.activity, e.products, e.place, e.country, e.text, e.about].filter(Boolean).join(" "));
const valuesOf = e => Object.keys(e).filter(k => k !== "id" && k !== "kind").map(k => (Array.isArray(e[k]) ? e[k].join(" ") : String(e[k] == null ? "" : e[k])));

/* check(draft, pack, kind, ctx) — ctx: {lang, heard: [user words], profileText, srcNames, copies: [outside texts], hidden: [E ids], rejected: [E ids]}
   → {title, summary, sections: [{key, blocks}], item_lines: {E: line}, dropped: [{sec, i, rule, text}], stats, retry} */
export function check(draft, pack, kind, ctx = {}) {
  const K = KINDS[kind], own = !!(K && K.own), lang = ctx.lang || "ar", dropped = [], stats = { blocks: 0, kept: 0, by: {} };
  const E = new Map(((pack && pack.evidence) || []).map(e => [e.id, e]));
  const hidden = new Set([...(ctx.hidden || []), ...(ctx.rejected || [])]);
  const input = (pack && pack.input) || {};
  const inputTexts = Object.keys(input).map(k => (Array.isArray(input[k]) ? input[k].join(" ") : String(input[k] == null ? "" : input[k])));
  const inputHay = norm(inputTexts.join(" ")), profileHay = norm(ctx.profileText || "");
  const copies = copyIndex(ctx.copies || []);
  const exemptAll = [...E.values()].map(e => norm(e.entity || e.name || "")).filter(n => n && !SITE_NAMES.includes(n) && !(ctx.srcNames || []).some(x => norm(x) === n));
  const drop = (sec, i, rule, text) => { dropped.push({ sec, i, rule, text: short(text) }); stats.by[rule] = (stats.by[rule] || 0) + 1; };
  const tplKeys = K ? K.sections.filter(x => x.t !== "w").map(x => x.key) : [];
  const tplType = k => (K ? (K.sections.find(x => x.key === k) || {}).t : "");
  const quoteFix = kind === "quote" && Array.isArray(ctx.heard) && ctx.heard.length > 0;
  const heardA = quoteFix ? allowedOf(ctx.heard) : null;
  /* the allowed numbers of a block: its cited items; in own kinds the input too (a voice quote: input ∩ heard) */
  const allowedFor = cites => {
    const texts = []; for (const c of cites) { const e = E.get(c); if (e) texts.push(...valuesOf(e)); }
    if (own) { if (quoteFix) { const A = allowedOf(texts), I = allowedOf(inputTexts); for (const d of I.dates) if (heardA.dates.has(d)) A.dates.add(d); A.nums.push(...I.nums.filter(v => heardA.nums.some(x => sameNum(v, x)))); A.pcts.push(...I.pcts.filter(v => heardA.pcts.some(x => sameNum(v, x)))); for (const y of I.years) A.years.add(y); return A; } texts.push(...inputTexts); }
    if (ctx.profileText && own) texts.push(ctx.profileText);
    return allowedOf(texts);
  };
  const hayFor = cites => [...cites.map(c => E.get(c)).filter(Boolean).map(hayOf), own ? inputHay : "", profileHay].join(" ");
  const tenderCite = cites => cites.some(c => { const e = E.get(c); return e && (e.kind === "tender" || e.kind === "rfq"); });

  /* C0: the shape */
  const d = draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
  const secs = Array.isArray(d.sections) ? d.sections.slice(0, 40) : [];
  const byKey = new Map();
  secs.forEach((sec, si) => {
    const key = sec && typeof sec.key === "string" ? sec.key.trim() : "";
    const blocks = sec && Array.isArray(sec.blocks) ? sec.blocks : [];
    if (!tplKeys.includes(key) || byKey.has(key) || si >= LIM.sections) { blocks.forEach((b, i) => { stats.blocks++; drop(key || "?", i, "C0", b && b.text); }); return; }
    byKey.set(key, blocks);
  });
  const sections = [];
  let modelBlocks = 0, langBad = 0;
  for (const key of tplKeys) {
    const blocks = byKey.get(key) || [], kept = [], advice = tplType(key) === "a";
    blocks.forEach((b, i) => {
      stats.blocks++; modelBlocks++;
      if (!b || typeof b !== "object" || i >= LIM.blocks || !BLOCK_TYPES.includes(b.type)) { drop(key, i, "C0", b && b.text); return; }
      const text = s(b.text, LIM.block + 1), subject = s(b.subject, 200);
      if (text.length > LIM.block) { drop(key, i, "C0", text); return; }
      const cites = (Array.isArray(b.cites) ? b.cites : []).map(x => String(x || "").trim()).filter(Boolean);
      if (cites.some(c => !ID_RX.test(c) || !E.has(c) || hidden.has(c))) { drop(key, i, "C2", text); return; }
      if (b.type === "item_ref") {
        const ref = String(b.ref || "").trim();
        if (!ID_RX.test(ref) || !E.has(ref)) { drop(key, i, "C2", ref); return; }
        if (hidden.has(ref)) { drop(key, i, "C2", ref); return; }
        if (!kept.some(x => x.type === "item_ref" && x.ref === ref)) kept.push({ type: "item_ref", ref, text: "", cites: [ref] });
        stats.kept++; return;
      }
      if (!text) { drop(key, i, "C0", ""); return; }
      if (!advice && !own && !cites.length) { drop(key, i, "C1", text); return; }
      const o = { A: advice ? null : allowedFor(cites), hay: hayFor(cites), srcNames: ctx.srcNames, exempt: exemptAll, copies, own, lang, model: true, tenderCite: tenderCite(cites), advice, profileHay, inputHay, quoteFix: quoteFix && (key === "items" || key === "terms") };
      const r = rules(text, o);
      if (r.rule) { if (r.rule === "C13") langBad++; drop(key, i, r.rule, text); return; }
      let sub = "";
      if (b.type === "email" && subject) { const rs = rules(subject, { ...o, model: false }); if (rs.ok) sub = rs.text; }
      kept.push({ type: b.type, text: r.text, cites, ...(b.type === "email" ? { subject: sub } : {}) });
      stats.kept++;
    });
    if (kept.length) sections.push({ key, blocks: kept });
  }
  /* C15: the title and the summary */
  const allCites = [...E.keys()].filter(k => !hidden.has(k));
  const tt = s(d.title, LIM.title + 1);
  const titleR = tt && tt.length <= LIM.title ? rules(tt, { A: allowedOf(inputTexts.concat(own ? [] : [])), hay: [inputHay, profileHay, ...[...E.values()].map(hayOf)].join(" "), srcNames: ctx.srcNames, exempt: exemptAll, copies, own, lang, model: true }) : { rule: "C0" };
  const title = titleR.ok ? titleR.text : "";
  if (!titleR.ok && tt) drop("title", 0, titleR.rule, tt);
  let summary = "";
  const sm = d.summary && typeof d.summary === "object" ? d.summary : {}, st = s(sm.text, LIM.summary + 1);
  if (st) {
    const sc = (Array.isArray(sm.cites) ? sm.cites : []).map(x => String(x || "").trim()).filter(Boolean);
    if (st.length > LIM.summary) drop("summary", 0, "C0", st);
    else if (sc.some(c => !ID_RX.test(c) || !E.has(c) || hidden.has(c))) drop("summary", 0, "C2", st);
    else if (!own && !sc.length) drop("summary", 0, "C1", st);
    else { const r = rules(st, { A: allowedFor(sc), hay: hayFor(sc), srcNames: ctx.srcNames, exempt: exemptAll, copies, own, lang, model: true, tenderCite: tenderCite(sc) }); if (r.ok) summary = r.text; else drop("summary", 0, r.rule, st); }
  }
  void allCites;
  /* the item lines: checked against their own item only */
  const item_lines = {};
  (Array.isArray(d.item_lines) ? d.item_lines.slice(0, LIM.lines) : []).forEach((x, i) => {
    const ref = String((x && x.ref) || "").trim(), line = s(x && x.line, LIM.line + 1);
    if (!ID_RX.test(ref) || !E.has(ref) || hidden.has(ref) || !line) return;
    if (line.length > LIM.line) { drop("item_lines", i, "C0", line); return; }
    const e = E.get(ref), r = rules(line, { A: allowedOf(valuesOf(e)), hay: hayOf(e), srcNames: ctx.srcNames, exempt: exemptAll, copies, own: false, lang, model: true, tenderCite: e.kind === "tender" || e.kind === "rfq" });
    if (r.ok) item_lines[ref] = r.text; else drop("item_lines", i, r.rule, line);
  });
  const modelDropped = modelBlocks - sections.reduce((n, x) => n + x.blocks.length, 0);
  const retry = (modelBlocks >= 2 && modelDropped * 2 >= modelBlocks) || (langBad > 0 && langBad * 2 >= modelBlocks);
  const sourcesUsed = (Array.isArray(d.sources_used) ? d.sources_used : []).map(x => String(x || "")).filter(x => ID_RX.test(x) && E.has(x));
  return { title, summary, sections, item_lines, sources_used: [...new Set(sourcesUsed)], dropped, stats: { ...stats, model_blocks: modelBlocks, model_dropped: modelDropped, lang_bad: langBad }, retry };
}
/* one Worker-built string through the customer-facing rules (C6, C7, C11, C12): the property the render test walks (never a source) */
export function workerTextOk(t, srcNames = []) {
  const s = String(t || ""), nt = norm(s), rest = " " + nt + " ";
  if (has(s, LINK_RX) || DOMAIN_RX.test(s) || DOMAIN_AR.test(s)) return false;
  for (const n of [...SITE_NAMES, ...srcNames]) { const nn = norm(n); if (nn && nn.length >= 3 && rest.includes(" " + nn + " ")) return false; }
  if (PROV_AR_SET.some(p => rest.includes(" " + p + " ")) || PROV_EN.test(s) || SRC_COLON.test(s)) return false;
  return !instructionLike(s) && maskPII(s) === s;
}
