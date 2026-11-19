/* migate-intel — adapters for the «egypt» batch: three official Egyptian sites (Arabic pages) whose lists the declarative
   html mapping (one selector per field) cannot express. ADAPTERS[source_id] = { parse(text, src, Rewriter) → raw records,
   fetch: { pages, headers, timeout_ms, retries, backoff_ms }, detail? } — see SEED_PATCHES for the matching seed rows.
   Records have the shape engine.normalise() reads — {ext_id, title, url, published, deadline, entity, country, summary,
   value, currency, notice_type, proc_group, proc_method} — plus `kind_hint` (tender | auction | eoi | rfq | project |
   award | news), which each seed maps through mapping.kind_map.
   Parsing is a linear string/regex scan (no DOM, never eval), identical in the Worker and under node --test; the Rewriter
   argument is accepted for interface compatibility and not needed. Pages verified on 2026-11-18 with the bot UA.
   Owner rules: a record carries only title, buyer, dates, deadline, official link and a ≤ 200-character factual excerpt.
   Telephone numbers, e-mail addresses, national ID numbers, named contact persons and the «د. فلان:» attribution of
   quoted officials are removed from every text, and contact sentences are never read into an excerpt. A missing field
   stays "" — none of these lists publishes a contract value (SCZONE's booklet price and bid bond are fees: they go into
   the excerpt, never into `value`). Dates are read from Arabic text into ISO days ("23/11/2026م" → "2026-11-23").
   A changed layout or a bot-challenge page throws a short explicit error (→ last_err, fail_count, /api/intel/health)
   instead of silently returning nothing; an empty page after the first just ends the paging.
     sczone-tenders      SCZONE «المناقصات والمزايدات والممارسات»: one WordPress page holding every notice (38 on 2026-11-18)
     ida-news            IDA «أخبار الهيئة»: 9 cards per page (?page=N) — tenders, land / unit / licence offerings, news
     eeaa-notifications  EEAA «التنويهات»: one table (#tblList) of all notices, newest first (60 rows, no paging)
   `detail` (optional, needs engine support): IDA and EEAA notice pages add what their lists lack — IDA the full title and
   the subject of a tender, EEAA the closing date («تاريخ النهاية», equal to the World Bank deadline of the same notice).
   detail.parse(html, rec) returns only the fields it found; the engine would fetch at most detail.max pages per run (new
   records whose kind_hint is in detail.kinds), through robots.txt and the per-host gate, and fill only empty fields. */
import { stripHtml, stripContacts, decodeEntities, absUrl, asciiDigits, clip } from "../util.js";

/* ---------- text ---------- */
const LEFT_ENT = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i;
/* markup → one line of text: entities decoded (once more when a source double-encoded «&amp;nbsp;»), kashida (ـ, purely
   typographic) removed inside words («بشـــأن» → «بشأن») but kept where it joins a letter to a number («بـ 11»),
   whitespace collapsed */
export function txt(s) {
  let t = stripHtml(s == null ? "" : String(s));
  if (LEFT_ENT.test(t)) t = stripHtml(decodeEntities(t));
  return t.replace(/(?<=[\u0621-\u064A])\u0640+(?=[\u0621-\u064A])/g, "").replace(/\u0640+(?=\s|$)/g, "\u0640").replace(/\s+/g, " ").trim();
}
const AR = "\\u0621-\\u064A";
const loose = s => asciiDigits(String(s || "")).replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
const safeDecode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
function attr(tag, name) { const m = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>\"']+))", "i").exec(tag || ""); return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : ""; }

/* ---------- personal data ---------- */
/* phones as these sites write them (util.stripContacts covers e-mails, labelled, international and Egyptian mobile
   numbers): area code + 7 digits «062-3590004», the reversed «3590004/062» of the SCZONE page, and a mobile joined to it */
const PHONE_AREA = /(?<![\d,.])\(?0\d{1,2}\)?[\s./-]?\d{7}(?![\d,.])/g;
const PHONE_SLASH = /(?<![\d,.])\d{7}\s*\/\s*0\d{1,2}(?:\s*-\s*0?1[0125]\d{8})?(?![\d,.])/g;
const NATIONAL_ID = new RegExp(String.raw`(?:الرقم\s+القومي|رقم\s+(?:ال)?بطاق[ةه](?:\s+(?:ال)?شخصي[ةه])?|رقم\s+(?:ال)?هوي[ةه]|national\s+id(?:\s+(?:no\.?|number))?)\s*[:\-]?\s*\d[\d\s-]{8,18}\d|(?<!\d)[23]\d{13}(?!\d)`, "gi");
/* a named person given as a contact («للاستفسار: السيد/ ...», «Contact: Mr. X Y») */
const PERSON = new RegExp([
  String.raw`(?:للتواصل|للاستفسار(?:ات)?|الاستفسار|الاتصال\s+ب|التواصل\s+مع|يرجى\s+التواصل\s+مع)\s*[:\-–]?\s*(?:مع\s+)?(?:السيد[ةه]?|المهندس[ةه]?|الدكتور[ةه]?|الأستاذ[ةه]?|الاستاذ[ةه]?|[دمأ]\s*\.)\s*\/?\s*[${AR}]+(?:\s+[${AR}]+){0,2}`,
  String.raw`\b(?:[Cc]ontact(?:\s+[Pp]erson)?|[Aa]ttn\.?|[Aa]ttention)\s*[:\-–]?\s*(?:Mr|Mrs|Ms|Miss|Dr|Eng|Prof)\.?\s+[A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3}`,
].join("|"), "g");
/* «د. ناهد يوسف:» / «م. خالد هاشم:» — the attribution of a quoted official at the head of a press-release snippet */
const SPEAKER = new RegExp(String.raw`(^|[\s.،؛…])(?:[دمأ]\s*\.|(?:ال)?(?:دكتور|مهندس|أستاذ|استاذ|لواء)[ةه]?|السيد[ةه]?)\s*[${AR}]{2,}(?:\s+[${AR}]{2,}){0,2}\s*:\s*`, "g");
const LEFT_LABEL = /(?:رقم\s+)?(?:تليفون|تلفون|هاتف|فاكس|موبايل|محمول|واتساب|واتس)\s*(?:رقم)?\s*[:.]?\s*(?=$|[,;·،؛)(])|\b(?:tel|phone|fax|mobile|e-?mail)\s*[:.]?\s*(?=$|[,;·،؛)])/gi;
/* brackets left unmatched once a bracketed phone number is removed («تليفون (…)» → «)») */
function balance(t) {
  const ch = [...t], drop = new Set(), open = [];
  ch.forEach((c, i) => { if (c === "(") open.push(i); else if (c === ")") { if (open.length) open.pop(); else drop.add(i); } });
  for (const i of open) drop.add(i);
  return drop.size ? ch.filter((_, i) => !drop.has(i)).join("") : t;
}
/* text we may publish (titles, buyers, excerpts) */
export function clean(s) {
  let t = asciiDigits(txt(s)).replace(/(\s*)\.{3,}/g, "$1…").replace(NATIONAL_ID, " ").replace(PERSON, " ");   // «...» → «…»: stripContacts would glue « ...»
  t = stripContacts(t) || "";
  t = t.replace(PHONE_SLASH, " ").replace(PHONE_AREA, " ").replace(SPEAKER, "$1").replace(LEFT_LABEL, " ");
  return balance(t.replace(/\(\s*[/-]?\s*\)/g, " ")).replace(/\s+([,;:،؛]|\.(?!\.))/g, "$1").replace(/([,;،؛])(?:\s*[,;،؛])+/g, "$1")
    .replace(/\s+/g, " ").replace(/^[\s,;:·–—-]+|[\s,;:·–—-]+$/g, "").trim();
}
/* a sentence / line that is about contacting someone is never part of an excerpt */
const CONTACT_PART = /الاتصال|للاتصال|اتصل|للاستفسار|الاستفسار|للتواصل|التواصل\s+مع|تليفون|تلفون|هاتف|فاكس|موبايل|محمول|واتس|البريد\s+ال[إا]?لكتروني|e-?mail|@|\b(?:tel|phone|fax|mobile|whatsapp)\b/i;
/* a raw snippet → the parts an excerpt may use: lines (a «label:» line is joined to the next one), then sentences — a dot
   after a single letter is an abbreviation («د. ناهد», «ش.م.م»), not a sentence end; contact parts are dropped */
function parts(raw) {
  const lines = [];
  for (const l of String(raw || "").split(/\r?\n/).map(x => txt(x).replace(/^[-–—•*·]+\s*/, "")).filter(Boolean)) {
    if (lines.length && /:$/.test(lines[lines.length - 1])) lines[lines.length - 1] += " " + l; else lines.push(l);
  }
  return lines.flatMap(l => l.split(/(?<=[^\s.]{2}[.!؟?])\s+(?=\S)/)).map(clean).filter(p => p && !CONTACT_PART.test(p));
}
/* the site cut a long text with «...»: a word glued to the dots is cut too and is dropped; end with «…» */
function uncut(s) {
  const m = /^(.*?)(\s*)(?:\.{3,}|…)\s*$/s.exec(s || "");
  if (!m || !m[1].trim()) return s || "";
  const head = m[2] ? m[1].trim() : m[1].replace(/\s+\S{1,12}$/, "");
  return (head.length >= 12 ? head : m[1].trim()).replace(/[\s,،;؛:–—-]+$/, "") + "…";
}
/* excerpt (owner rule: ≤ 200 characters) */
const excerpt = list => clip(list.filter(Boolean).join(" · "), 200);

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, "0");
function ymd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : "";
}
/* «30-10-2026» · «8-09-2025» · «23/11/2026م» · «٢٢/١١/٢٠٢٦» → "2026-10-30" ("" when absent or impossible) */
export function dmyDate(s) { const m = /(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})(?!\d)/.exec(asciiDigits(s || "")); return m ? ymd(m[3], m[2], m[1]) : ""; }
/* «2026-11-10» → "2026-11-10" */
export function isoDay(s) { const m = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(asciiDigits(s || "")); return m ? ymd(m[1], m[2], m[3]) : ""; }
const AR_MONTHS = { "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "إبريل": 4, "مايو": 5, "يونيو": 6, "يونية": 6, "يوليو": 7, "يولية": 7,
  "أغسطس": 8, "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
/* «10 نوفمبر 2026» · «٢٤ يونيو ٢٠٢٥» → "2026-11-10" (a day and month without a year is not a date here: "") */
export function arDate(s) {
  const m = new RegExp(String.raw`(?<!\d)(\d{1,2})\s+([${AR}]+)\s*،?\s*(\d{4})(?!\d)`).exec(asciiDigits(s || ""));
  return m && AR_MONTHS[m[2]] ? ymd(m[3], AR_MONTHS[m[2]], m[1]) : "";
}
const showDay = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

/* ---------- classification ---------- */
/* the procedure named by an Arabic notice title: «المناقصة العامة رقم (3) لسنة 2026/2027 …» →
   { family: tender | practice | auction, label: "مناقصة عامة", no: "3", fy: "2026/2027" } — null when the title names none */
export function arProcedure(title) {
  const t = asciiDigits(txt(title));
  const m = /(?:^|[\s(«"'])(?:ال)?(مناقص|ممارس|مزايد)[ةه](?:\s+(?:ال)?(علني)[ةه])?(?:\s+(?:ال)?(عام|محدود)[ةه])?/.exec(t);
  if (!m) return null;
  const family = { "مناقص": "tender", "ممارس": "practice", "مزايد": "auction" }[m[1]];
  const label = [m[1] + "ة", m[2] && m[2] + "ة", m[3] && m[3] + "ة"].filter(Boolean).join(" ");
  const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
  const no = (/^\s*رقم\s*[()]?\s*(\d{1,3})\s*[()]?/.exec(rest) || [])[1] || "";
  const fy = /(?:لسن[ةه]|(?:لل|ال)?عام\s+(?:ال)?مالي|لعام)\s*\(?\s*(\d{4})\s*م?\s*[/\-–]\s*(\d{4})/.exec(rest);
  const years = fy ? [+fy[1], +fy[2]].sort((a, b) => a - b) : null;
  return { family, label, no, fy: years && years[1] - years[0] === 1 ? years.join("/") : "" };
}
/* procurement group from the subject words (relevance only: GO goods, CW works, CS consulting, NC other services) */
export function procGroup(t) {
  t = txt(t).replace(/[إا]شعار\s+(?:ال)?شراء(?:\s+(?:ال)?محدد)?/g, " ");   // the World Bank «specific procurement notice», not a purchase
  if (/استشار|[إا]بداء\s+(?:ال)?اهتمام|خبير|مكتب\s+استشاري/.test(t)) return "CS";
  if (/نظاف[ةه]|مكافح[ةه]|حراس[ةه]|(?:ال)?تأمين\s+على|خدم[ةه]\s+(?:ال)?تأمين|الرعاي[ةه]\s+(?:ال)?طبي[ةه]|[إا]عاش[ةه]|تشغيل\s+وصيان[ةه]/.test(t)) return "NC";
  if (/توريد|شراء|معدات|أجهز[ةه]|اجهز[ةه]|حافلات|سيارات/.test(t)) return "GO";
  if (/أعمال|اعمال|مقاولات|[إا]نشاء|بناء|تأهيل|[إا]حلال|رفع\s+كفاء[ةه]|صيان[ةه]|تركيب|مد\s+كابلات|تنفيذ\s+(?:ال)?(?:خط|شبك|محط|خزان|مبن|طر|كوبر|خوازيق|قواعد)/.test(t)) return "CW";
  if (/خدمات|مقدم[يى]\s+(?:ال)?خدم/.test(t)) return "NC";
  return "";
}
/* a bot-challenge page served instead of the list (Cloudflare, Incapsula, F5) */
const CHALLENGE = /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare|Request Rejected)|window\._cf_chl_opt|_Incapsula_Resource/i;
function guard(html, name) { if (CHALLENGE.test(html.slice(0, 20000))) throw new Error(name + " answered a bot-challenge page instead of the list (not bypassed)"); }
const rec = o => ({
  ext_id: String(o.ext_id || ""), title: o.title || "", url: o.url || "", published: o.published || "", deadline: o.deadline || "",
  entity: o.entity || "", country: "Egypt", summary: o.summary || "", value: "", currency: "",
  notice_type: o.notice_type || "", proc_group: o.proc_group || "", proc_method: "", kind_hint: o.kind_hint || "news",
});

/* ---------- SCZONE tenders ----------
   https://sczone.eg/tenders/ — WPBakery rows, newest first: h3.consulting-custom-title (title) · text column (deadline
   «في موعد غايته 23/11/2026م», booklet price «قيمة كراسة الشروط: – 1,000 جنية», bid bond «قيمة التأمين المؤقت/الابتدائي»,
   last day to buy the booklet, session date, the authority's phone line) · «كراسة الشروط» button (PDF/DOCX under
   /uplibrary/) · h4 «30-10-2026 تاريخ النشر». Notices have no page of their own, so the booklet is the official link (one
   per notice — the list URL would make the engine's URL dedupe fold every notice into one). ext_id = procedure + number +
   fiscal year («practice-5-2026-2027»), stable when a booklet is re-uploaded. Public tenders and practices → tender,
   public auctions (sale of scrap, use of land / stores) → auction, the PPP prequalification result → award. */
const SC_LIST = "https://sczone.eg/tenders/";
const SC_ENTITY = "الهيئة العامة للمنطقة الاقتصادية لقناة السويس";
const SC_DOC = /\.(?:pdf|docx?|xlsx?|zip|rar)(?:[?#]|$)/i;
const SC_RESULT = /تأهلت|المتأهل|نتائج|نتيج[ةه]|ترسي[ةه]|evaluation[\s_-]+results?/i;
const SC_CANCEL = /^(?:[إا]لغاء|تأجيل\s+[إا]لغاء)/;
const SC_RESULT_CLAUSE = /(?:عن\s+)?(?:ال)?(?:شركات|تحالفات|مكاتب)[^،.]{0,60}?(?:تأهلت|المتأهل)|(?:ال)?نتائج|ترسي[ةه]/;
const MONEY = String.raw`([\d٠-٩][\d٠-٩.,]*)\s*(جني[هة](?:\s+مصري)?|دولار(?:\s+أمريكي)?|يورو)?`;
const DASHES = String.raw`\s*:?\s*[-–—:]*\s*`;
const WEEKDAY = String.raw`(?:يوم\s+)?(?:(?:ال)?(?:سبت|أحد|احد|[إأا]ثنين|اتنين|ثلاثاء|[أا]ربعاء|خميس|جمع[ةه])\s+)?(?:الموافق\s*)?`;
const DMY = String.raw`(\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{4})`;
const SC_FEE = new RegExp(String.raw`قيم[ةه]\s+(?:ال)?كراس[ةه]\s+(?:ال)?شروط(?:\s+والمواصفات)?` + DASHES + MONEY);
const SC_BOND = new RegExp(String.raw`(?:قيم[ةه]\s+)?(?:ال)?تأمين\s+(?:ال)?([إا]بتدائي|مؤقت)` + DASHES + MONEY);
const SC_DEADLINE = new RegExp(String.raw`في\s+موعد\s+(?:غايته|[أا]قصاه)` + DASHES + WEEKDAY + DMY);
const SC_BUY = new RegExp(String.raw`(?:آخر|اخر)\s+موعد\s+لشراء\s+(?:ال)?كراس[ةه]` + DASHES + WEEKDAY + DMY);
const SC_SESSION = new RegExp(String.raw`جلس[ةه]\s+(فض\s+(?:ال)?مظاريف(?:\s+(?:ال)?فني[ةه])?|(?:ال)?مزايد[ةه])` + DASHES + WEEKDAY + DMY);
const currency = c => (!c ? "" : /جني/.test(c) ? "جنيه" : /دولار/.test(c) ? "دولار" : "يورو");
const amount = m => (m ? asciiDigits(m[m.length - 2]) + (currency(m[m.length - 1]) ? " " + currency(m[m.length - 1]) : "") : "");
/* titles as published, minus typography: kashida, reversed brackets «رقم ) 7 (», spaced numbers «( 9 )» */
const scTitle = s => clean(txt(s).replace(/\)\s*(\d{1,3})\s*\(/g, "($1)").replace(/\(\s+(\d{1,3})\s+\)/g, "($1)"));
async function parseSczone(html, src = {}) {
  html = String(html || "");
  guard(html, "SCZONE");
  const list = src.endpoint || SC_LIST;
  const heads = [...html.matchAll(/<h3\b[^>]*\bclass\s*=\s*["'][^"']*\bconsulting-custom-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3\s*>/gi)];
  if (!heads.length) throw new Error("SCZONE layout changed: no h3.consulting-custom-title notice titles on the tenders page");
  const out = [], seen = new Set();
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].index + heads[i][0].length;
    let chunk = html.slice(from, i + 1 < heads.length ? heads[i + 1].index : html.length);
    const h4 = /<h4\b[^>]*\bconsulting-custom-title\b[^>]*>([\s\S]*?)<\/h4\s*>/i.exec(chunk);
    if (h4) chunk = chunk.slice(0, h4.index + h4[0].length);            // the row ends with its publication date
    const title = scTitle(heads[i][1]);
    if (!title || title.length < 8) continue;
    const ctaAt = chunk.search(/<section\b[^>]*\bvc_cta3-container\b|<a\b[^>]*\bvc_btn3\b/i);
    const bodyHtml = chunk.slice(0, ctaAt >= 0 ? ctaAt : h4 ? h4.index : chunk.length);
    const paras = [...bodyHtml.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(m => txt(m[2])).filter(Boolean);
    const body = asciiDigits(paras.join("\n"));
    let doc = "";
    for (const a of chunk.matchAll(/<a\b[^>]*>/gi)) {
      const href = attr(a[0], "href");
      if (href && (SC_DOC.test(href) || /\bvc_btn3\b/.test(attr(a[0], "class")))) { doc = absUrl(href, list); if (/^https?:\/\//i.test(doc)) break; doc = ""; }
    }
    const proc = arProcedure(title);
    const lead = paras.find(p => loose(p) !== loose(title)) || "";
    let kind_hint, notice_type = proc ? proc.label : "";
    if (proc && !SC_RESULT.test(title) && !SC_CANCEL.test(title)) kind_hint = proc.family === "auction" ? "auction" : "tender";
    else if (SC_RESULT.test(title + " " + lead) || SC_CANCEL.test(title)) {
      kind_hint = "award";
      notice_type = SC_CANCEL.test(title) ? "إلغاء" : /التأهيل\s+المسبق/.test(title + " " + lead) ? "نتائج التأهيل المسبق" : "إعلان نتائج";
    } else kind_hint = "project";
    const fee = amount(SC_FEE.exec(body)), bondM = SC_BOND.exec(body), bond = amount(bondM);
    const buy = dmyDate((SC_BUY.exec(body) || [])[1]), sess = SC_SESSION.exec(body);
    const facts = [
      fee && "قيمة كراسة الشروط: " + fee,
      bond && "التأمين " + (/مؤقت/.test(bondM[1]) ? "المؤقت" : "الابتدائي") + ": " + bond,
      buy && "آخر موعد لشراء الكراسة: " + showDay(buy),
      sess && dmyDate(sess[2]) && (/مزايد/.test(sess[1]) ? "جلسة المزايدة" : "جلسة فض المظاريف") + ": " + showDay(dmyDate(sess[2])),
    ];
    /* no fees / dates (a result or a project notice): the factual clause of the lead paragraph, not its legal preamble */
    const at = lead.search(SC_RESULT_CLAUSE);
    const summary = facts.some(Boolean) ? excerpt(facts)
      : at > 0 ? excerpt([clean(lead.slice(at).replace(/^عن\s+/, "")), ...paras.slice(paras.indexOf(lead) + 1).map(clean)])
      : excerpt(parts(lead).slice(0, 2));
    const firm = /^تعلن\s+(شركة\s+[^،,]{3,80}?)(?:\s+ش\s*\.?\s*م\s*\.?\s*م\s*\.?)?\s*[،,]/.exec(paras[0] || "");
    const docPath = doc ? safeDecode(new URL(doc).pathname) : "";
    let ext_id = proc && proc.no && proc.fy ? `${proc.family}-${proc.no}-${proc.fy.replace("/", "-")}` : docPath || loose(title).slice(0, 120);
    if (seen.has(ext_id)) { if (!docPath || seen.has(ext_id + "|" + docPath)) continue; ext_id += "|" + docPath; }   // a reused number: keep both notices
    seen.add(ext_id);
    out.push(rec({
      ext_id, title, url: doc || list + "#" + encodeURIComponent(ext_id),
      published: dmyDate(txt(h4 ? h4[1].replace(/<span\b[\s\S]*?<\/span\s*>/gi, " ") : "")),
      deadline: kind_hint === "award" ? "" : dmyDate((SC_DEADLINE.exec(body) || [])[1]),
      entity: firm ? clean(firm[1]) : SC_ENTITY, summary, notice_type,
      proc_group: kind_hint === "tender" ? procGroup(title) : "", kind_hint,
    }));
  }
  return out;
}

/* ---------- IDA news ----------
   https://www.ida.gov.eg/ar/news?page=N — Laravel news grid #posts, 9 cards per page, newest first: div.entry ·
   .entry-title h2 a[href=/ar/news/{id}] (titles over ~150 characters cut by the site with «...») · .entry-meta li
   «31-10-2026» · .entry-content p (a ~100-character snippet). IDA's own public tenders, practices and auctions → tender /
   auction; offerings of industrial land, ready units, shops or production licences (طرح … أراضٍ / وحدات / محال / رخص)
   → project; results of an offering → award; everything else (visits, campaigns, decrees, job fairs) → news. The list
   gives no deadline (the notice page holds the subject and the booklet link, not a closing date: see parseIdaDetail). */
const IDA_ORIGIN = "https://www.ida.gov.eg";
const IDA_ENTITY = "الهيئة العامة للتنمية الصناعية";
const IDA_RESULT = /نتائج|نتيج[ةه]|ترسي[ةه]|الفائزين/;
/* campaigns that withdraw unused plots are news («سحب الأراضي»), unlike «سحب كراسات الشروط» (buying the booklets) */
const IDA_NOT_OFFER = /سحب\s+(?:ال)?(?:أراض|اراض|وحد|مشروع)|تسترد|يسترد|استرداد|حمل[ةه]|حملات/;
const IDA_OFFER = /طرح|طروح|تلقي\s+(?:ال)?طلبات|فتح\s+باب\s+(?:ال)?(?:تقديم|حجز)/;
const IDA_ASSET = /أرض|أراض|اراض|الأراضي|الاراضي|وحد[ةه]|وحدات|محال|محلات|مخازن|رخص|مجمع/;
async function parseIda(html, src = {}) {
  html = String(html || "");
  guard(html, "IDA");
  if (!/\bid\s*=\s*["']posts["']/i.test(html)) throw new Error("IDA layout changed: no #posts news grid on the page");
  const base = src.endpoint || IDA_ORIGIN + "/ar/news";
  const out = [], seen = new Set();
  const cards = html.split(/<div\b[^>]*\bclass\s*=\s*["']entry(?=[\s"'])[^"']*["'][^>]*>/i).slice(1);
  for (const c of cards) {
    const a = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-title\b[^"']*["'][^>]*>\s*<h\d\b[^>]*>\s*(<a\b[^>]*>)([\s\S]*?)<\/a\s*>/i.exec(c);
    if (!a) continue;
    const url = absUrl(attr(a[1], "href"), base);
    const id = (/\/news\/(\d+)(?:[/?#]|$)/.exec(url) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = uncut(clean(a[2]));
    if (!title) continue;
    const meta = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-meta\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i.exec(c);
    const body = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)(?:<a\b[^>]*\bmore-link\b|<\/div\s*>)/i.exec(c);
    const snippet = body ? body[1].replace(/<\/?p\b[^>]*>/gi, "\n") : "";
    const text = title + " " + txt(snippet);
    const proc = arProcedure(title);
    let kind_hint, notice_type = "";
    if (IDA_RESULT.test(title)) { kind_hint = "award"; notice_type = "إعلان نتائج"; }
    else if (proc) { kind_hint = proc.family === "auction" ? "auction" : "tender"; notice_type = proc.label; }
    else if (!IDA_NOT_OFFER.test(title) && IDA_OFFER.test(text) && IDA_ASSET.test(text)) { kind_hint = "project"; notice_type = "طرح"; }
    else kind_hint = "news";
    const firm = /(?:أعلنت|تعلن)\s+(شركة\s+[^،,.]{3,80}?)\s+عن\s+طرح/.exec(txt(snippet));
    out.push(rec({
      ext_id: id, title, url, published: dmyDate(txt(meta ? meta[1] : "")), deadline: "",
      entity: kind_hint === "news" ? "" : firm ? clean(firm[1]) : IDA_ENTITY,
      summary: excerpt([uncut(parts(snippet).join(" "))]), notice_type,
      proc_group: kind_hint === "tender" ? procGroup(text) : "", kind_hint,
    }));
  }
  return out;
}
/* the notice page /ar/news/{id}: .entry-title h3 (full title), .entry-content p … «Post Single - Content End» */
export function parseIdaDetail(html, r = {}) {
  html = String(html || "");
  const t = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-title\b[^"']*["'][^>]*>\s*<h\d\b[^>]*>([\s\S]*?)<\/h\d\s*>/i.exec(html);
  const b = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)(?:<!--\s*Post Single - Content End|<div\b[^>]*\bclass\s*=\s*["'][^"']*\btagcloud\b)/i.exec(html);
  const out = {};
  const full = t ? clean(t[1]) : "";
  if (full && (!r.title || /…$/.test(r.title))) out.title = full;
  if (b) {
    const paras = [...b[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map(m => txt(m[1])).filter(p => p && !/كراس[ةه]\s+(?:ال)?شروط|للمزيد/.test(p));
    /* «تعلن الهيئة … عن طرح المناقصة العامة رقم (11) … بشأن <subject>» repeats the title: keep the subject */
    if (paras[0] && arProcedure(paras[0])) { const at = paras[0].search(/(?:^|\s)بش[أا]ن\s/); if (at > 0) paras[0] = paras[0].slice(at).trim(); }
    const s = excerpt(parts(paras.join("\n")));
    if (s) out.summary = s;
  }
  return out;
}

/* ---------- EEAA notifications ----------
   https://www.eeaa.gov.eg/Notification/Index — table#tblList, one row per notice, newest first, no paging: td h4 a
   (title, link /Notification/{id}/Details) · span «2026-11-10» (publication) · p (a short note, often empty). Mostly
   World Bank–financed «Greater Cairo Air Pollution Management and Climate Change» notices, also on wb-eg in English:
   requests for expressions of interest → eoi, invitations for bids / requests for proposals → tender, requests for
   quotations → rfq, offers to buy EEAA's carbon certificates → auction, early market-engagement sessions and grant or
   incubator calls → project. Job, secondment, training and staff-fund notices are not business opportunities (and
   concern individuals): skipped. The closing date is only on the notice page (parseEeaaDetail). */
const EEAA_ORIGIN = "https://www.eeaa.gov.eg";
const EEAA_ENTITY = "جهاز شئون البيئة";
const EEAA_RULES = [
  ["eoi", /[إا]بداء\s+(?:ال)?اهتمام|\bEOI\b/i, "طلب إبداء اهتمام"],
  ["rfq", /عروض\s+(?:ال)?[أا]سعار|\bRFQ\b/i, "طلب عروض أسعار"],
  ["auction", /عروض\s+(?:ال)?شراء|مزايد[ةه]|(?:ال)?مزاد/, "دعوة لتلقي عروض شراء"],
  ["tender", /مناقص[ةه]|(?:ال)?عطاءات|طلب\s+(?:تقديم\s+)?(?:ال)?عروض|[إا]شعار\s+(?:طلب\s+)?(?:تقديم\s+)?عروض|[إا]شعار\s+(?:ال)?شراء|\bRF[PB]\b/i, ""],
  ["project", /التفاعل\s+(?:المبكر\s+)?مع\s+السوق|(?:ال|لل)?مشارك[ةه]\s+(?:ال)?سوقي[ةه]|market\s+engagement/i, "جلسة التفاعل المبكر مع السوق"],
  ["skip", /وظيف[ةه]|وظائف|ندب|تعيين|(?:ال|لل)تدريب|الجمعي[ةه]\s+(?:ال)?عمومي[ةه]|صندوق\s+الرعاي[ةه]/, ""],
  ["project", /منح[ةه]|المنح|دعم\s+فني\s+ومالي|حاضن[ةه]|مسرع\s+(?:ال)?[أا]عمال/, "منح ودعم فني"],
];
const EEAA_TENDER_TYPE = t => (/دعو[ةه]\s+لتقديم\s+(?:ال)?عطاءات|طلب\s+(?:ال)?عطاءات/.test(t) ? "دعوة لتقديم العطاءات" : /RFP|عروض\s+فني[ةه]\s+ومالي[ةه]|طلب\s+تقديم\s+(?:ال)?عروض/.test(t) ? "طلب تقديم عروض" : /[إا]شعار\s+(?:ال)?شراء/.test(t) ? "إشعار شراء محدد" : "مناقصة");
const EEAA_BOILER = /^(?:…\s*)?(?:(?:ال)?تفاصيل\s+بال[إا]علان\s+المرفق|للمزيد(?:\s+من\s+(?:ال)?تفاصيل)?|التفاصيل\s+مرفق[ةه]).*$/;
async function parseEeaa(html, src = {}) {
  html = String(html || "");
  guard(html, "EEAA");
  const table = /<table\b[^>]*\bid\s*=\s*["']tblList["'][^>]*>([\s\S]*?)<\/table\s*>/i.exec(html);
  if (!table) throw new Error("EEAA layout changed: table#tblList not found on the notifications page");
  const base = src.endpoint || EEAA_ORIGIN + "/Notification/Index";
  const out = [], seen = new Set();
  for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const a = /<h4\b[^>]*>\s*(<a\b[^>]*>)([\s\S]*?)<\/a\s*>/i.exec(row[1]);
    if (!a) continue;
    const url = absUrl(attr(a[1], "href"), base);
    const id = (/\/Notification\/(\d+)\//i.exec(url) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = uncut(clean(a[2]));
    if (!title) continue;
    const rule = EEAA_RULES.find(([, re]) => re.test(title));
    const kind_hint = rule ? rule[0] : "news";
    if (kind_hint === "skip") continue;
    const date = /<span\b[^>]*>([\s\S]*?)<\/span\s*>/i.exec(row[1]), note = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(row[1]);
    const lines = parts(note ? note[1] : "").map(l => l.replace(/^…\s*/, "")).filter(l => l && !EEAA_BOILER.test(l));
    const other = /^[إا]علان\s+(صندوق\s+[^\s]+\s+[^\s]+(?:\s+[^\s]+)?)\s+عن\s/.exec(title);
    out.push(rec({
      ext_id: id, title, url, published: isoDay(txt(date ? date[1] : "")), deadline: "",
      entity: kind_hint === "news" ? "" : other ? clean(other[1]) : EEAA_ENTITY,
      summary: excerpt([uncut(lines.join(" · "))]), notice_type: kind_hint === "tender" ? EEAA_TENDER_TYPE(title) : rule ? rule[2] : "",
      proc_group: kind_hint === "eoi" ? "CS" : kind_hint === "tender" || kind_hint === "rfq" ? procGroup(title) : "", kind_hint,
    }));
  }
  return out;
}
/* the notice page /Notification/{id}/Details: «تاريخ البداية 2026-10-26 تاريخ النهاية 2026-11-30 النوع …» — the end date
   is the closing date of a procurement notice (checked against the World Bank API: #64 → 2026-11-05, #57 → 2026-05-18) */
const EEAA_PROCUREMENT = ["tender", "eoi", "rfq", "auction"];
export function parseEeaaDetail(html, r = {}) {
  const t = txt(String(html || "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " "));
  const m = /تاريخ\s+البداي[ةه]\s*:?\s*(\d{4}-\d{1,2}-\d{1,2})\s*تاريخ\s+النهاي[ةه]\s*:?\s*(\d{4}-\d{1,2}-\d{1,2})/.exec(asciiDigits(t));
  const out = {};
  if (m && isoDay(m[2]) && (!r.kind_hint || EEAA_PROCUREMENT.includes(r.kind_hint)) && (!r.published || isoDay(m[2]) >= r.published)) out.deadline = isoDay(m[2]);
  return out;
}

/* ---------- registry ---------- */
const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
/* Egyptian government hosts can be slow or flaky from cloud IP ranges (these three answered in 1.1–2.2 s on 2026-11-18) */
const POLITE = { headers: { Accept: HTML_ACCEPT }, timeout_ms: 30000, retries: 2, backoff_ms: [3000, 10000] };
export const ADAPTERS = {
  "sczone-tenders": { parse: parseSczone, fetch: { pages: 1, ...POLITE } },
  "ida-news": { parse: parseIda, fetch: { pages: 2, ...POLITE }, detail: { parse: parseIdaDetail, max: 3, kinds: ["tender", "auction", "project"] } },
  "eeaa-notifications": { parse: parseEeaa, fetch: { pages: 1, ...POLITE }, detail: { parse: parseEeaaDetail, max: 4, kinds: EEAA_PROCUREMENT } },
};

/* ---------- seed rows (merge over seeds/sources.json; the tests run the fixtures through exactly these mappings) ---------- */
const KIND = (map, dflt) => ({ field: "kind_hint", map, default: dflt });
export const SEED_PATCHES = {
  "sczone-tenders": {
    name: "SCZONE — tenders, auctions & practices", name_ar: "الهيئة العامة للمنطقة الاقتصادية لقناة السويس — المناقصات والمزايدات والممارسات",
    kind: "tender_semi", market: "eg", lang: "ar", parser: "adapter", schedule: "C", enabled: 1, disabled_reason: null, official: 2,
    endpoint: "https://sczone.eg/tenders/",
    mapping: { adapter: "egypt", accept: HTML_ACCEPT, pages: 1, title_dedupe: false,
      kind_map: KIND({ tender: "tender_semi", auction: "tender_semi", award: "project_news", project: "project", news: "news" }, "tender_semi") },
    homepage: "https://sczone.eg/tenders/",
    terms_note: "robots.txt is one line without line breaks («User-agent: *Disallow: /wp-admin/Allow: /wp-admin/admin-ajax.php…»): only /wp-admin/ is meant to be disallowed and the engine's parser reads no rule — /tenders/ is allowed either way (checked 2026-11-18). WP REST API needs auth (401) and /feed/ errors, so the HTML page is parsed. Notices have no page of their own: the official link is each notice's conditions booklet (PDF/DOCX in /uplibrary/). Booklet price and bid bond go into the excerpt; the authority's phone numbers are not stored. Re-tenders of the same subject carry near-identical titles (fire engines 0.90, cleaning 0.87, scales 0.80 trigram similarity), so same-source title dedupe stays off (title_dedupe: false).",
  },
  "ida-news": {
    name: "Industrial Development Authority (IDA) — tenders, industrial land & unit offerings, news", name_ar: "الهيئة العامة للتنمية الصناعية — المناقصات وطرح الأراضي والوحدات الصناعية والأخبار",
    kind: "tender_gov", market: "eg", lang: "ar", parser: "adapter", schedule: "C", enabled: 1, disabled_reason: null, official: 2,
    endpoint: "https://www.ida.gov.eg/ar/news?page={{page}}",
    mapping: { adapter: "egypt", accept: HTML_ACCEPT, pages: 2, max_age_days: 45, title_dedupe: false,
      kind_map: KIND({ tender: "tender_gov", auction: "tender_gov", project: "project", award: "project_news", news: "news" }, "news") },
    homepage: "https://www.ida.gov.eg/ar/news",
    terms_note: "robots.txt: User-agent: * / Disallow: /admin/ (news pages allowed; checked 2026-11-18). 9 cards per page (?page=N). Titles over ~150 characters are cut by the site (kept with «…»). Tender cards carry no closing date; the notice page adds the subject and the booklet link. IDA's numbered tenders differ only by their number («المناقصة العامة رقم (10)» / «(11)», trigram similarity 0.91), so same-source title dedupe must stay off (title_dedupe: false).",
  },
  "eeaa-notifications": {
    name: "Egyptian Environmental Affairs Agency (EEAA) — notifications: EOIs, bids, RFQs", name_ar: "جهاز شئون البيئة — التنويهات (طلبات إبداء الاهتمام والمناقصات وطلبات الأسعار)",
    kind: "tender_gov", market: "eg", lang: "ar", parser: "adapter", schedule: "C", enabled: 1, disabled_reason: null, official: 2,
    endpoint: "https://www.eeaa.gov.eg/Notification/Index",
    mapping: { adapter: "egypt", accept: HTML_ACCEPT, pages: 1, max_age_days: 60,
      kind_map: KIND({ tender: "tender_gov", eoi: "tender_gov", rfq: "rfq", auction: "tender_gov", project: "project", award: "project_news", news: "news" }, "tender_gov") },
    homepage: "https://www.eeaa.gov.eg/Notification/Index",
    terms_note: "robots.txt answers 302 → /Home/error, an HTML page with no rules (re-checked 2026-11-18 several times; the research step had seen HTTP 500): the engine reads no rule, i.e. allowed. Public government notices, one table without paging; job, training and staff notices are skipped. The closing date is only on each notice's page («تاريخ النهاية», equal to the World Bank deadline of the same notice). Most notices are World Bank–financed and also reach wb-eg in English.",
  },
};
