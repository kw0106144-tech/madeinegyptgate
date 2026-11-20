/* «ابعتلي» with the opportunities themselves (owner 2026-11-19: the e-mail Bassem sent had no data, no attachment and no working link).
   POST /api/advisor/notify {message, channel, items?: ["intel:<11 chars>", "item:<platform tender id>" | {ref, title}]} (advisor.js
   notifyMember): for each ref (≤ 3, parseRefs) the e-mail to the member's OWN inbox carries its details from the platform's own data (never
   Bassem's words, never the page's), its page on the platform (a link that answers), its official link and — for an Information Center
   tender / RFQ / project whose source allows it — the official PDF / DOCX ATTACHED when it could be downloaded; otherwise one plain reason
   line (WHY). WhatsApp gets the same cards as text + links (no file: respond.io sends text only).
   - Information Center: migate-intel POST /api/intel/mailpack through the service binding INTEL (worker/wrangler.toml), on the
     binding-only hostname PACK_HOST — migate-intel answers that path on no other hostname, so no secret is needed (worker-intel
     INTEGRATION.md §9). Two rounds: (1) every card at once, {file:false} — migate-intel fetches nothing for it; a failed card → its public
     item JSON through the same binding (card + links, no file); (2) the official files ONE AFTER ANOTHER ({file:true}, the raw bytes as the
     answer's body — never base64 inside JSON), each sized by what the e-mail has left and only for the cards that can have one (a news
     item or a duplicate never takes a file's room or a slot of the day). No binding → no call at all (a workers.dev fetch from this Worker
     is refused by Cloudflare, error 1042): the short link and an honest line.
   - Platform tenders: in-process (janna-item.js findItem over items.json) + a HEAD of its page on the Pages production URL. A number
     several tenders share (a tender page's own list key, OFF:6/2026/2027 ×3) is resolved only by the title the page sent with it, among
     those tenders only; else it is said to be shared — with the number and the tenders' titles.
   - Files: only what migate-intel downloaded from the item's own official site (its SSRF / robots guards — this Worker never fetches a
     third-party URL); checked again here (%PDF- / PK magic, the exact size, the type); ≤ NOTIFY_LIM.cap per provider, ≤ filesPerDay a
     member per rolling 24 h (advisor.js reserves them before the work, from events.data.files); one notify with files at a time in an
     isolate (fileSlot: the memory of one e-mail's files, not two).
   No import at module level (advisor.js ↔ common.js cycle; janna-item.js imports common.js): the few dependencies load inside functions. */

/* budgetMs: migate-intel's time for ONE official file (its itemFile deadline = budget - 0.5 s). A real Kenya PPIP Tender Document (2.4 MB)
   took 12.3 s to its last byte read from outside Kenya (2026-11-20; robots.txt 1.8 s, cached 24 h after), so 20 s; filesMs = all the files
   of one e-mail, one after another (the page waits 60 s for the answer: data/janna-live.js notifyGo); packSlack = the binding call's own
   abort after the budget; cardMs = a card (no third-party fetch). cap: Resend total lowered to 8 MB until a workerd heap measurement shows
   room (review SEC-2) — the first file may take all of it, the next ones what is left. */
export const NOTIFY_LIM = Object.freeze({
  refs: 3, cardMs: 5000, itemMs: 2500, pageMs: 2500, budgetMs: 20000, minBudgetMs: 2000, filesMs: 36000, fileMinMs: 4000, packSlack: 3000, minFile: 1e5,
  filesPerDay: 10, gateMs: 120000, waText: 2000, waUrl: 600, subjectTitle: 60, waTitle: 90,
  cap: Object.freeze({ resend: Object.freeze({ file: 8e6, total: 8e6 }), brevo: Object.freeze({ file: 4e6, total: 8e6 }) }),
});
/* the hostname of every request to migate-intel through the binding (worker-intel/src/api.js PACK_HOST — a test keeps them equal) */
export const PACK_HOST = "mailpack.binding.invalid";
/* the Pages production URL (a copy of acc-dev.js PAGES_ORIGIN — a test keeps them equal; env.DEV_PAGES_ORIGIN overrides both) */
export const PAGES_ORIGIN = "https://madeinegyptgate.pages.dev";
const SITE = "https://madeinegyptgate.com/";
const PDF = "application/pdf", DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_KINDS = new Set(["tender_gov", "tender_semi", "tender_private", "rfq", "project"]);
const DATED_KINDS = /^(?:tender_gov|tender_semi|tender_private|rfq)$/;
const KIND_SEG = { tender_gov: "tenders", tender_semi: "tenders", tender_private: "tenders", rfq: "rfq", project: "projects", project_news: "projects", news: "news" };
const ID_RX = /^[0-9a-z]{11}$/;
const PAGE_RX = /^https:\/\/madeinegyptgate\.com\/intel\/(?:en\/)?(?:tenders|rfq|projects|news)\/[0-9a-z]{11}\/$/;
const JSON_CAP = 256 * 1024;

/* ---------- small helpers (local copies: no import of common.js / advisor.js) ---------- */
const scalar = v => (typeof v === "string" ? v : typeof v === "number" && isFinite(v) ? String(v) : "");
const txt = (v, max = 400) => scalar(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const site = env => { const u = String((env && env.SITE_URL) || SITE); return /^https:\/\/[^\s"<>]+\/$/.test(u) ? u : SITE; };
const originOk = s => (/^https:\/\/[a-z0-9.-]+[a-z0-9]$/i.test(String(s || "")) ? String(s) : "");
const pagesOrigin = env => originOk(env && env.DEV_PAGES_ORIGIN) || PAGES_ORIGIN;
const clipTo = (s, n) => { s = String(s == null ? "" : s).trim(); if (s.length <= n) return s; const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(" "); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:،؛\-–—]+$/, "") + "…"; };
const stripUrls = s => String(s || "").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, " ").replace(/\s{2,}/g, " ").trim();
/* a link we may show / link to: http(s), no spaces, ≤ 2000 characters */
function httpUrl(v) {
  const s = scalar(v).trim();
  if (!s || s.length > 2000 || /[\s<>"']/.test(s)) return null;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? s : null; } catch (e) { return null; }
}
/* a link on the platform itself (the only hrefs besides the stored official link) */
const ownUrl = (env, v) => { const s = httpUrl(v); return s && (s.startsWith(SITE) || s.startsWith(site(env))) ? s : null; };
/* a platform page in English: ?lang=en before any #fragment (a hash shim «opportunity.html#eg-tnd-003» keeps its fragment — review F4);
   the URL keeps its own spelling (an Arabic slug stays readable) */
export function enUrl(page) {
  const s = httpUrl(page); if (!s) return null;
  const i = s.indexOf("#"), base = i < 0 ? s : s.slice(0, i), hash = i < 0 ? "" : s.slice(i);
  return (/[?&]lang=/.test(base) ? base.replace(/([?&]lang=)[^&]*/, "$1en") : base + (base.indexOf("?") < 0 ? "?" : "&") + "lang=en") + hash;
}
const cairoDay = ms => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } };
const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dayOf = v => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(scalar(v)); return m ? m[1] : ""; };
const MON_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(d, lang) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(scalar(d)); return m ? +m[3] + " " + (lang === "en" ? MON_EN : MON_AR)[+m[2] - 1] + " " + m[1] : ""; }
const num = v => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = v => (typeof v === "number" && isFinite(v) && v > 0) || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v) && +v > 0);
/* «1,250,000 راند (ZAR)» / «1,250,000 ZAR» — only what the data has */
export function fmtMoney(v, cur, curAr, lang) {
  if (!money(v)) return "";
  const c = txt(cur, 8).toUpperCase(), n = num(+v);
  return lang === "en" ? n + (c ? " " + c : "") : n + (c ? " " + (curAr ? txt(curAr, 40) + " (" + c + ")" : c) : "");
}
const STATUS = { open: ["سارية", "open"], closing_soon: ["بتقفل قريب", "closing soon"], closed: ["منتهية", "closed"] };
/* the deadline's status on the Cairo day (the platform's honest rule: ≤ 7 days = closing soon); no deadline → the stored status */
export function statusWord(deadline, stored, lang, now = Date.now()) {
  const d = dayOf(deadline), today = cairoDay(now);
  const k = d ? (d < today ? "closed" : d <= addDays(today, 7) ? "closing_soon" : "open") : STATUS[stored] ? stored : "";
  return k ? STATUS[k][lang === "en" ? 1 : 0] : "";
}
const mb = n => Math.max(0.1, Math.round((+n || 0) / 1e5) / 10).toFixed(1);
/* the 27 governorates in English (the platform data writes them in Arabic) */
const GOV_EN = { "القاهرة": "Cairo", "الجيزة": "Giza", "الإسكندرية": "Alexandria", "القليوبية": "Qalyubia", "الشرقية": "Sharqia", "الدقهلية": "Dakahlia", "الغربية": "Gharbia", "المنوفية": "Monufia",
  "البحيرة": "Beheira", "كفر الشيخ": "Kafr El Sheikh", "دمياط": "Damietta", "بورسعيد": "Port Said", "الإسماعيلية": "Ismailia", "السويس": "Suez", "شمال سيناء": "North Sinai", "جنوب سيناء": "South Sinai",
  "الفيوم": "Faiyum", "بني سويف": "Beni Suef", "المنيا": "Minya", "أسيوط": "Assiut", "سوهاج": "Sohag", "قنا": "Qena", "الأقصر": "Luxor", "أسوان": "Aswan", "البحر الأحمر": "Red Sea", "الوادي الجديد": "New Valley", "مطروح": "Matrouh" };
const PTYPE_EN = { "مناقصة عامة": "Public tender", "مناقصة عامة داخلية": "Domestic public tender", "مناقصة محدودة": "Limited tender", "ممارسة عامة": "Public practice (negotiated tender)", "مناقصة": "Tender",
  "جهة حكومية": "Government buyer", "جهة خاصة": "Private buyer" };
/* Arabic letters and no Latin ones: a value the English twin leaves out (a city, an activity) rather than show it untranslated */
const arOnly = s => /[\u0600-\u06ff]/.test(String(s || "")) && !/[A-Za-z]/.test(String(s || ""));
/* mostly Arabic (more Arabic letters than Latin ones: «شركة كهرباء موزمبيق (EDM)»): the English twin marks it as Arabic (review R8) */
const arMostly = s => { const t = String(s || ""), a = (t.match(/[\u0600-\u06ff]/g) || []).length; return a > 0 && a > (t.match(/[A-Za-z]/g) || []).length; };
/* the Arabic plural of «tender» for a count (2 مناقصتين · 3-10 مناقصات · 11+ مناقصة) */
const tendersAr = n => (n === 2 ? "مناقصتين" : n >= 3 && n <= 10 ? n + " مناقصات" : n + " مناقصة");
/* the labels a source gives its files (Kenya PPIP documents[] type, worker-intel adapters/json.js keDocs) → [Arabic, English, feminine] */
const LABELS = { "tender document": ["كراسة الشروط", "Tender Document", true], "tender notice": ["إعلان المناقصة", "Tender Notice", false] };
const LABEL_RX = /^[A-Za-z][A-Za-z0-9 ()\/&.,-]{0,39}$/;
const cleanLabel = v => { const s = txt(v, 40); return LABEL_RX.test(s) ? s : ""; };
/* a file label for one language: «كراسة الشروط (Tender Document)» / «Tender Document»; unknown words: «الملف «X»» / «X»; none → null */
function labelOf(label, L) {
  const s = cleanLabel(label); if (!s) return null;
  const k = LABELS[s.toLowerCase()];
  return L === "en" ? { t: k ? k[1] : s, f: false } : { t: k ? k[0] + " (" + k[1] + ")" : "الملف «" + s + "»", f: !!(k && k[2]) };
}

/* ---------- the reasons, said plainly (AR / EN) ---------- */
const SITE_SLOW = ["موقع الجهة ماردّش في الوقت — جرّب الرابط بعد شوية", "the buyer's site did not answer in time — try the link a bit later"];
const UNSAFE = ["رابط الملف مش آمن نحمّل منه آلياً", "the file's link is not safe to download from automatically"];
export const WHY = Object.freeze({
  no_attach_provider: ["نظام الإيميل اللي شغالين بيه دلوقتي مابيقدرش يرفق ملفات", "our e-mail service cannot attach files right now"],
  provider_refused: ["مزوّد الإيميل رفض الملف المرفق، فبعتنالك الإيميل من غيره", "the e-mail provider refused the attachment, so the e-mail went without it"],
  page_only: ["الرابط الرسمي صفحة إعلان على موقع الجهة، ومالقيتش عليها ملف أقدر أحمّله", "the official link is a notice page on the buyer's site, and I found no file on it that I could download"],
  no_document: ["مفيش رابط رسمي محفوظ للفرصة دي", "no official link is stored for this opportunity"],
  login: ["الملف ورا تسجيل دخول على بوابة الجهة، ولازم تسجّل عندهم علشان تحمّله", "the file is behind a sign-in on the buyer's portal; you need an account there to download it"],
  forbidden: ["موقع الجهة رفض التحميل الآلي", "the buyer's site refused an automatic download"],
  robots: ["موقع الجهة مابيسمحش بالتحميل الآلي، فماحمّلتوش", "the buyer's site does not allow automatic downloads, so I did not download it"],
  gone: ["رابط الملف مبقاش موجود على موقع الجهة", "the file's link no longer exists on the buyer's site"],
  busy: SITE_SLOW, timeout: SITE_SLOW, unreachable: SITE_SLOW,
  too_large: ["الملف أكبر من الحجم اللي ينفع يترفق في الإيميل", "the file is too large for e-mail"],
  total_too_large: ["الإيميل وصل لأقصى حجم مرفقات، فالملف ده على الرابط بس", "this e-mail reached its attachment size limit, so this file is at the link only"],
  unsupported: ["الملف الرسمي مش PDF ولا Word، فمارفقتوش", "the official file is neither a PDF nor a Word document, so it was not attached"],
  not_https: UNSAFE, unsafe_url: UNSAFE, too_many_redirects: UNSAFE,
  off_site: ["الملف بيتحمّل من موقع تاني غير موقع الجهة الرسمي، فماحمّلتوش", "the file is served from a site other than the buyer's official site, so I did not download it"],
  source_opt_out: ["شروط موقع الجهة مابتسمحش إننا نبعت ملفاته", "the source's terms do not allow us to forward its files"],
  daily_files: ["وصلت لحد " + NOTIFY_LIM.filesPerDay + " ملفات مرفقة في اليوم", "you reached today's limit of " + NOTIFY_LIM.filesPerDay + " attached files"],
  files_busy: ["المنصة بتجهّز ملفات إيميل تاني في نفس اللحظة، فالملف ده على الرابط بس — اطلبه تاني بعد دقيقة لو عايزه مرفق", "the platform is preparing another e-mail's files at this very moment, so this file is at the link only — ask again in a minute to have it attached"],
  time_up: ["الوقت المتاح لتحميل الملفات خلص قبل الملف ده", "the time for downloading files ran out before this one"],
  pack_off: ["جلب الملفات من مركز المعلومات مش شغال دلوقتي", "fetching files from the Information Center is not available right now"],
  platform_listing: ["ده إعلان من بيانات المنصة نفسها، والمنصة لسه مابتنزّلش ملفات الإعلانات دي", "this is a listing from the platform's own data, and the platform does not download these notices' files yet"],
  kind: ["ده خبر، ومالوش ملف رسمي يترفق", "this is a news item; it has no official file to attach"],
  whatsapp_only: ["الواتساب مابيبعتش ملفات؛ الملف بيتبعت على الإيميل بس", "WhatsApp cannot carry files; the file goes by e-mail only"],
  email_not_sent: ["الإيميل نفسه مااتبعتش، فمفيش ملف اترفق", "the e-mail itself was not sent, so no file was attached"],
  not_found: ["الفرصة دي اتشالت من مركز المعلومات أو خلصت مدتها، فمافيش تفاصيل أبعتهالك", "this opportunity was removed from the Information Center or has expired, so there are no details to send"],
  not_found_item: ["الفرصة دي مش موجودة في بيانات المنصة دلوقتي", "this opportunity is no longer in the platform's data"],
  unavailable: ["ماقدرتش أوصل لمركز المعلومات دلوقتي علشان أجيب تفاصيل الفرصة دي", "I could not reach the Information Center right now to get this opportunity's details"],
  ambiguous: ["الرقم ده مشترك بين كذا مناقصة في بيانات المنصة، فماحطّيتش تفاصيل علشان ماغلطش", "this number is shared by several tenders in the platform's data, so no details were added to avoid a mistake"],
  page_gone: ["صفحتها على المنصة مش متاحة دلوقتي", "its page on the platform is not available right now"],
  page_moved: ["صفحتها على المنصة مش متاحة دلوقتي", "its page on the platform is not available right now"],
  other: ["ماقدرتش أجيب الملف الرسمي دلوقتي", "the official file could not be fetched right now"],
});
/* one reason → {ar, en} with what the line needs (a size, a link, the shared number and its tenders) */
export function whyOf(code, x = {}) {
  const k = WHY[code] ? code : "other";
  let ar = WHY[k][0], en = WHY[k][1];
  if (k === "too_large" && x.size > 0) { ar = "الملف كبير (" + mb(x.size) + " ميجا) على الإيميل"; en = "the file is too large for e-mail (" + mb(x.size) + " MB)"; }
  if (k === "not_found" && x.type === "item") { ar = WHY.not_found_item[0]; en = WHY.not_found_item[1]; }
  /* review R6: with no page to try, ask Bassem again — never «try its page» without one */
  if (k === "unavailable") { const l = httpUrl(x.link); ar += l ? " — جرّب صفحتها بعد شوية: " + l : " — جرّب تطلبها من باسم تاني بعد شوية"; en += l ? " — try its page a bit later: " + l : " — ask Bassem again a bit later"; }
  /* review R4: the number and the tenders that share it (the platform's own titles) */
  if (k === "ambiguous" && x.num) {
    const n = +x.count > 1 ? +x.count : 0, t = (Array.isArray(x.titles) ? x.titles : []).filter(Boolean).slice(0, 3), list = t.length ? " (" + t.map(s => "«" + s + "»").join("، ") + (n > t.length ? "، …" : "") + ")" : "";
    ar = "الرقم " + x.num + " مشترك بين " + (n ? tendersAr(n) : "كذا مناقصة") + " في بيانات المنصة" + list + "، فماحطّيتش تفاصيل أي واحدة علشان ماغلطش";
    en = "the number " + x.num + " is shared by " + (n ? n + " tenders" : "several tenders") + " in the platform's data" + (t.length ? " (" + t.map(s => "«" + s + "»").join(", ") + (n > t.length ? ", …" : "") + ")" : "") + ", so no details were added to avoid a mistake";
  }
  return { ar, en };
}

/* ---------- refs ---------- */
/* item:<id>: any characters but controls and the General Punctuation block (zero-width, bidi, line / paragraph separators), not starting
   with a space — 22 international tenders have ids with spaces («intl-558/2026/BTB (BE2630001388)», review F2) and a tender page's list
   key may have them («OFF:3 لسنة 2026/2027»). The id is only looked up in-process (janna-item.js findItem); it is never fetched */
const REF_ITEM = /^item:(?!\s)[^\u0000-\u001f\u007f-\u009f\u2000-\u206f\ufeff]{1,160}$/;
const refOf = x => (typeof x === "string" ? x : x && typeof x === "object" && !Array.isArray(x) && typeof x.ref === "string" ? x.ref : null);
function normRef(x) {
  let s = refOf(x); if (s == null) return "";
  s = s.trim();
  if (/^intel:/i.test(s)) s = "intel:" + s.slice(6).toLowerCase();
  return /^intel:[0-9a-z]{11}$/.test(s) || REF_ITEM.test(s) ? s : "";
}
/* the opportunities a note is about: an array (or a comma-separated string) of "intel:<11 chars>" / "item:<id>" — or {ref, title} (a
   tender page's own list key with its title); anything else — a URL, a title alone, another object — is dropped and never fetched. At
   most 20 looked at, duplicates once, the first NOTIFY_LIM.refs kept */
export function parseRefs(v) {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = [];
  for (const x of list.slice(0, 20)) {
    const s = normRef(x);
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= NOTIFY_LIM.refs) break;
  }
  return out;
}
/* {ref: title} for the item: refs sent as {ref, title} (≤ 300 characters): the title only chooses among the tenders that share the
   number (tenderItem), it is never shown */
export function refTitles(v, refs) {
  const out = {};
  for (const x of Array.isArray(v) ? v.slice(0, 20) : []) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const s = normRef(x), t = txt(x.title, 300);
    if (s && s.startsWith("item:") && t && (refs || []).includes(s) && !out[s]) out[s] = t;
  }
  return out;
}

/* ---------- dependencies, loaded once inside the functions ---------- */
let DEPS = null;
function deps() {
  if (!DEPS) DEPS = Promise.all([import("./janna-item.js"), import("./text.js"), import("./flags.js")])
    .then(([item, text, flags]) => ({ findItem: item.findItem, stripPII: text.stripPII, forLLM: text.forLLM, instructionLike: text.instructionLike, featureSync: flags.featureSync }))
    .catch(e => { DEPS = null; throw e; });
  return DEPS;
}

/* ---------- one notify with files at a time in this isolate (review SEC-2) ----------
   An e-mail's files are in memory from their download until the provider took the e-mail (bytes → base64 → the provider's JSON body):
   while one notify holds the slot, another one in the same isolate goes with links only («files_busy»). A slot older than gateMs is free
   again (a job that never ended cannot block the files for good). → release() | null */
let FILE_JOB = 0;
export function fileSlot(now = Date.now()) {
  if (FILE_JOB && now - FILE_JOB < NOTIFY_LIM.gateMs) return null;
  const mine = FILE_JOB = now || 1;
  return () => { if (FILE_JOB === mine) FILE_JOB = 0; };
}

/* ---------- migate-intel through the service binding ---------- */
const bound = env => !!(env && env.INTEL && typeof env.INTEL.fetch === "function");
const race = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "AbortError" })), ms); })]).finally(() => clearTimeout(t)); };
const cancel = async r => { try { if (r && r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } };
async function readBytes(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") { const b = new Uint8Array(await r.arrayBuffer()); return b.length > cap ? null : b; }
  const rd = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    const v = value instanceof Uint8Array ? value : new Uint8Array(value);
    n += v.length;
    if (n > cap) { try { await rd.cancel(); } catch (e) { /* ignore */ } return null; }
    chunks.push(v);
  }
  if (chunks.length === 1) return chunks[0];
  const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return all;
}
/* path on migate-intel → {status, j} (a JSON answer, ≤ 256 KB) | {status, bytes, type, meta} (a file: the raw body ≤ fileBytes, its facts
   from X-Mailpack) | {status:0, off:true} without the binding | {status, error: "timeout" | "unreachable" | "too_big", file?}; never throws */
export async function intelFetch(env, path, init, ms, fileBytes = 0) {
  if (!bound(env)) return { status: 0, off: true };
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  try {
    return await race((async () => {
      const r = await env.INTEL.fetch(new Request("https://" + PACK_HOST + path, { ...init, redirect: "manual", ...(ctl ? { signal: ctl.signal } : {}) }));
      const ct = String(r.headers.get("content-type") || "").toLowerCase().split(";")[0].trim(), len = +r.headers.get("content-length") || 0;
      if (ct === PDF || ct === DOCX) {
        if (!(fileBytes > 0) || len > fileBytes) { await cancel(r); return { status: r.status, error: "too_big", file: true }; }
        const bytes = await readBytes(r, fileBytes);
        if (!bytes) return { status: r.status, error: "too_big", file: true };
        let meta = null; try { meta = JSON.parse(r.headers.get("x-mailpack") || "null"); } catch (e) { meta = null; }
        return { status: r.status, bytes, type: ct, meta: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : null };
      }
      if (len > JSON_CAP) { await cancel(r); return { status: r.status, error: "too_big" }; }
      const b = await readBytes(r, JSON_CAP);
      if (!b) return { status: r.status, error: "too_big" };
      let j = null; try { j = JSON.parse(new TextDecoder("utf-8").decode(b)); } catch (e) { j = null; }
      return { status: r.status, j: j && typeof j === "object" && !Array.isArray(j) ? j : null };
    })(), ms);
  } catch (e) { if (ctl) try { ctl.abort(); } catch (x) { /* ignore */ } return { status: 0, error: e && e.name === "AbortError" ? "timeout" : "unreachable" }; }
}
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
/* base64 in pieces of 24 KB (a multiple of 3: no padding inside): no latin1 copy of the whole file */
function toB64(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 24576) {
    const sub = bytes.subarray(i, i + 24576); let s = "";
    for (let j = 0; j < sub.length; j += 8192) s += String.fromCharCode.apply(null, sub.subarray(j, j + 8192));
    parts.push(btoa(s));
  }
  return parts.join("");
}
const head = (bytes, n) => { let s = ""; const sub = bytes.subarray(0, n); for (let i = 0; i < sub.length; i++) s += String.fromCharCode(sub[i]); return s; };
const KNOWN = new Set(Object.keys(WHY));
const fileReason = r => (KNOWN.has(r) && r !== "not_found" && r !== "unavailable" && r !== "ambiguous" ? r : "other");
/* a file migate-intel returned, checked again: %PDF- (in the first 1 KB, like its sniff) or a ZIP (PK\3\4) for DOCX, the type it claims
   (header and facts), the exact size, ≤ perFile → {type, size, b64, name, from, label?, skipped?} | null */
function checkFile(bytes, type, meta, perFile, id) {
  const f = meta && meta.file && typeof meta.file === "object" ? meta.file : null;
  if (!f || !bytes || bytes.length < 8 || bytes.length !== +f.size || bytes.length > perFile) return null;
  const h = head(bytes, 1024), t = h.indexOf("%PDF-") >= 0 ? PDF : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4 ? DOCX : "";
  if (!t || t !== type || t !== f.type) return null;
  const ext = t === PDF ? "pdf" : "docx", base = txt(f.name, 120).replace(/\.(?:pdf|docx)$/i, "").trim();
  const name = (base.length <= 80 && /^[A-Za-z0-9 ._()-]+$/.test(base) && /[A-Za-z0-9]/.test(base) && !/^\./.test(base) ? base : "document-" + id) + "." + ext;
  const s = meta.skipped && typeof meta.skipped === "object" ? meta.skipped : null, label = cleanLabel(f.label);
  const skipped = s ? { ...(cleanLabel(s.label) ? { label: cleanLabel(s.label) } : {}), reason: fileReason(String(s.flag || "")), ...(+s.size > 0 ? { size: +s.size } : {}), ...(httpUrl(s.url) ? { url: httpUrl(s.url) } : {}) } : null;
  return { type: t, size: bytes.length, b64: toB64(bytes), name, from: txt(f.from, 20), ...(label ? { label } : {}), ...(skipped ? { skipped } : {}) };
}
const segOf = kind => KIND_SEG[kind] || "tenders";
/* the item card from the pack's card (migate-intel's stored data; contacts and links already out of its summaries) */
function packCard(c) {
  return {
    kind: txt(c.kind, 30), kind_label: txt(c.kind_label, 60), kind_label_en: txt(c.kind_label_en, 60), market: txt(c.market, 30),
    title: txt(c.title, 400), title_en: txt(c.title_en, 400), title_orig: txt(c.title_orig, 400), title_is_original: !!c.title_is_original,
    entity: txt(c.entity, 200), country: txt(c.country, 80), market_name: txt(c.market_name, 80), market_name_en: txt(c.market_name_en, 80),
    sector: txt(c.sector, 120), sector_en: txt(c.sector_en, 120), published: dayOf(c.published), deadline: dayOf(c.deadline), status: txt(c.status, 20),
    value: money(c.value) ? +c.value : null, currency: txt(c.currency, 8), currency_ar: txt(c.currency_ar, 40),
    summary: txt(c.summary, 1200), summary_en: txt(c.summary_en, 1200), summary_original: txt(c.summary_original, 700),
    source_name: txt(c.source_name, 160), source_name_en: txt(c.source_name_en, 160),
  };
}
/* the card from the public item JSON (ar + en) when the pack failed: its summaries go through stripPII (publicItem does not strip them) */
function publicCard(D, a, e) {
  const sum = v => txt(stripUrls(D.stripPII(scalar(v))), 1200);
  return {
    kind: txt(a.kind, 30), kind_label: txt(a.kind_label, 60), kind_label_en: e ? txt(e.kind_label, 60) : "", market: txt(a.market, 30),
    title: txt(a.title, 400), title_en: txt(a.title_en, 400), title_orig: txt(a.title_orig, 400), title_is_original: !!a.title_is_original,
    entity: txt(a.entity, 200), country: txt(a.country, 80), market_name: txt(a.market_name, 80), market_name_en: e ? txt(e.market_name, 80) : "",
    sector: txt(a.sector, 120), sector_en: e ? txt(e.sector, 120) : "", published: dayOf(a.published_at), deadline: dayOf(a.deadline), status: txt(a.status, 20),
    value: money(a.value) ? +a.value : null, currency: txt(a.currency, 8), currency_ar: "",
    summary: sum(a.summary), summary_en: e ? sum(e.summary) : "", summary_original: "",
    source_name: txt(a.source && a.source.name, 160), source_name_en: e ? txt(e.source && e.source.name, 160) : "",
  };
}
/* round 1, one Information Center ref: its card ({file:false} — migate-intel fetches nothing), else the public item JSON, else
   «unavailable» with its short link. want = a file may follow (round 2) */
async function intelCard(env, D, id, o) {
  const ref = "intel:" + id, short = o.pagesOn ? SITE + "intel/tenders/" + id + "/" : "";   // any kind: the item pages 301 to their canonical URL
  const gone = { ref, type: "intel", id, found: false, reason: "not_found" }, unavailable = { ref, type: "intel", id, found: false, reason: "unavailable", link: short };
  if (!bound(env)) return unavailable;
  const p = await intelFetch(env, "/api/intel/mailpack", post({ id, file: false }), o.lim.cardMs);
  /* 404 / 410 of the item itself ({found:false}) — never the plain 404 of a migate-intel without this endpoint */
  if ((p.status === 404 || p.status === 410) && p.j && p.j.found === false) return gone;
  const j = p.status === 200 ? p.j : null;
  if (j && j.ok === true && j.card && typeof j.card === "object" && j.links && typeof j.links === "object" && ID_RX.test(String(j.id || ""))) {
    const card = packCard(j.card), L = j.links, why = String(j.reason || "");
    const links = { page: o.pagesOn && PAGE_RX.test(String(L.page || "")) ? L.page : null, page_en: o.pagesOn && PAGE_RX.test(String(L.page_en || "")) ? L.page_en : null, official: httpUrl(L.source), doc: null };
    const file = !FILE_KINDS.has(card.kind) || why === "kind" ? { attached: false, reason: "kind" } : why === "source_opt_out" ? { attached: false, reason: "source_opt_out" }
      : { attached: false, reason: o.noFile || "pending" };
    return { ref, type: "intel", id: String(j.id), found: true, card, links, file, want: file.reason === "pending" };
  }
  /* the card failed (no answer in time, an error, an older migate-intel): the public item JSON, both languages, through the binding */
  const [a, e] = await Promise.all(["ar", "en"].map(l => intelFetch(env, "/api/intel/item/" + id + "?lang=" + l, { method: "GET", headers: { Accept: "application/json" } }, o.lim.itemMs)));
  if ((a.status === 404 || a.status === 410) && a.j && a.j.error === "gone") return gone;
  if (a.status !== 200 || !a.j || String(a.j.id || "") !== id) return unavailable;
  const card = publicCard(D, a.j, e.status === 200 && e.j && String(e.j.id || "") === id ? e.j : null), seg = segOf(card.kind);
  const links = { page: o.pagesOn ? SITE + "intel/" + seg + "/" + id + "/" : null, page_en: o.pagesOn ? SITE + "intel/en/" + seg + "/" + id + "/" : null, official: httpUrl(a.j.url), doc: null };
  return { ref, type: "intel", id, found: true, card, links, file: { attached: false, reason: !FILE_KINDS.has(card.kind) ? "kind" : o.noFile || "pack_off" }, want: false };
}
/* round 2, one official file: {file:true} → the raw file (checked here) | why not → {attached:true, …} | {attached:false, reason, size?}
   + doc (the file's own link: attached, or the one that failed) */
async function intelFile(env, id, maxBytes, budget, lim) {
  const p = await intelFetch(env, "/api/intel/mailpack", post({ id, file: true, max_bytes: maxBytes, budget_ms: budget }), budget + lim.packSlack, maxBytes);
  if (p.bytes) {
    const f = checkFile(p.bytes, p.type, p.meta, maxBytes, id), doc = httpUrl(p.meta && p.meta.doc);
    return f ? { attached: true, ...f, doc } : { attached: false, reason: "unsupported", doc };
  }
  if (p.error === "timeout") return { attached: false, reason: "timeout" };
  const j = p.status === 200 ? p.j : null;
  if (!j || j.ok !== true) return { attached: false, reason: p.error === "too_big" && p.file ? "unsupported" : "pack_off" };
  return { attached: false, reason: fileReason(String(j.reason || "")), ...(+j.reason_size > 0 ? { size: +j.reason_size } : {}), doc: httpUrl(j.links && j.links.doc) };
}
/* HEAD of a platform page on the Pages production URL → "ok" (200, a redirect to the same path, or unchecked: a 405, 5xx, an error) |
   "gone" (404 / 410) | "moved" (a redirect elsewhere) */
export async function probePage(env, url) {
  let u; try { u = new URL(url); } catch (e) { return "ok"; }
  const target = pagesOrigin(env) + u.pathname + u.search, ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  try {
    const r = await race(fetch(target, { method: "HEAD", redirect: "manual", headers: { "User-Agent": "MIG-Notify-PageCheck/1" }, ...(ctl ? { signal: ctl.signal } : {}) }), NOTIFY_LIM.pageMs);
    try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ }
    if (r.status === 404 || r.status === 410) return "gone";
    if (r.status >= 300 && r.status < 400) {
      let p = ""; try { p = new URL(r.headers.get("location") || "", target).pathname; } catch (e) { p = ""; }
      return p && p.replace(/\/+$/, "") === u.pathname.replace(/\/+$/, "") ? "ok" : "moved";
    }
    return "ok";
  } catch (e) { if (ctl) try { ctl.abort(); } catch (x) { /* ignore */ } return "ok"; }
}
/* one platform tender ref (items.json): its record, only when found and not a number several tenders share. title (sent with a tender
   page's own list key): findItem picks among the tenders that share that number by it — never a title search over all the tenders */
async function tenderItem(env, D, id, now, title) {
  const ref = "item:" + id;
  let r = null; try { r = D.findItem("tenders", { id }, now); } catch (e) { r = null; }
  if (!r || !r.found) return { ref, type: "item", id, found: false, reason: "not_found" };
  if (r.ambiguous && title) { let r2 = null; try { r2 = D.findItem("tenders", { id, title }, now); } catch (e) { r2 = null; } if (r2 && r2.found && !r2.ambiguous) r = r2; }
  if (r.ambiguous) {
    const others = Array.isArray(r.others) ? r.others : [];
    return { ref, type: "item", id, found: false, reason: "ambiguous", num: txt(r.ref || id.replace(/^OFF:/i, ""), 60), count: +r.matches > 1 ? +r.matches : others.length + 1,
      titles: [r.title].concat(others.map(x => x && x.title)).map(t => clipTo(txt(t, 200), 70)).filter(Boolean).slice(0, 3),
      shared: [r.id].concat(others.map(x => x && x.id)).map(x => txt(x, 160)).filter(Boolean) };
  }
  let page = ownUrl(env, r.open_url), pageNote = "";
  if (page) { const st = await probePage(env, page); if (st !== "ok") { pageNote = st === "gone" ? "page_gone" : "page_moved"; page = null; } }
  const card = {
    kind: "platform_tender", title: txt(r.title, 400), title_en: txt(r.title_en, 400), ref: txt(r.ref, 120), type: txt(r.type, 80),
    entity: txt(r.entity, 200), entity_en: txt(r.entity_en, 200), market: txt(r.market, 30), country: txt(r.country, 80), country_en: txt(r.country_en, 80),
    governorate: txt(r.governorate, 60), city: txt(r.city, 120), activity: txt(r.activity, 120), deadline: dayOf(r.deadline),
    bond: money(r.bid_bond_egp) ? +r.bid_bond_egp : null, bond_note: txt(r.bid_bond_note, 160), booklet: money(r.booklet_price_egp) ? +r.booklet_price_egp : null,
    value: money(r.estimated_value) ? +r.estimated_value : null, currency: txt(r.currency, 8), source_name: txt(r.source, 160),
  };
  const official = httpUrl(r.documents_url);
  return { ref, type: "item", id: txt(r.id, 160) || id, found: true, card, pageNote,
    links: { page, page_en: enUrl(page), official, doc: null },
    file: { attached: false, reason: official ? "platform_listing" : "no_document" } };
}

/* refs → items in ref order. o = {channel, mailOk, provider: "resend"|"brevo"|"", filesLeft, now, titles?: {ref: title}, gate?: {} (gets
   .release — the caller frees the file slot once the e-mail went), lim?: {cardMs, itemMs, budgetMs, minBudgetMs, filesMs, fileMinMs, packSlack} (tests)}.
   An item: {ref, type: "intel"|"item", id, found: true, card, links: {page, page_en, official, doc}, file: {attached: true, name, type, size,
   b64, from, label?, skipped?} | {attached: false, reason, size?}, rt (its title for the reply), pageNote?} | {ref, type, id, found: false,
   reason, link?, num?, count?, titles?} */
export async function resolveNotifyItems(env, refs, o = {}) {
  const D = await deps(), now = o.now || Date.now(), t0 = Date.now(), lim = { ...NOTIFY_LIM, ...(o.lim || {}) };
  const cap = NOTIFY_LIM.cap[o.provider] || null, titles = o.titles || {};
  const noFile = o.channel === "whatsapp" ? "whatsapp_only" : !o.mailOk ? "email_not_sent" : !cap ? "no_attach_provider" : "";
  let pagesOn = true; try { pagesOn = D.featureSync(env, "intel_pages") !== false; } catch (e) { pagesOn = true; }
  /* 1) every card at once — nothing here downloads a file */
  const got = await Promise.all(refs.map(ref => (ref.startsWith("intel:") ? intelCard(env, D, ref.slice(6), { pagesOn, noFile, lim }) : tenderItem(env, D, ref.slice(5), now, titles[ref]))
    .catch(() => ({ ref, type: ref.startsWith("intel:") ? "intel" : "item", id: ref.replace(/^[a-z]+:/, ""), found: false, reason: "unavailable" }))));
  /* one entry per opportunity (a duplicate notice and its primary are one) */
  const seen = new Set(), one = [];
  for (const it of got) {
    if (it.found) { const key = it.type + ":" + it.id; if (seen.has(key)) continue; seen.add(key); const t = scalar(it.card.title); it.rt = D.instructionLike(t) ? "" : D.forLLM(t, 120); }
    one.push(it);
  }
  /* a shared number whose tender is already one of this note's cards (the screen's list key beside the tool's id) is that tender: said once */
  const out = one.filter(it => !(it.reason === "ambiguous" && (it.shared || []).some(id => seen.has("item:" + id))));
  /* 2) the official files, one after another: each sized by what the e-mail has left, ≤ the member's files left today, ≤ filesMs */
  const want = out.filter(it => it.found && it.want), filesLeft = Math.max(0, Math.floor(+o.filesLeft || 0)), names = new Set();
  let release = null;
  if (want.length && !noFile && filesLeft > 0) { release = fileSlot(); if (!release) for (const it of want) it.file = { attached: false, reason: "files_busy" }; }
  let total = 0, attached = 0;
  try {
    for (const it of want) {
      if (it.file.reason !== "pending") continue;
      if (attached >= filesLeft) { it.file = { attached: false, reason: "daily_files" }; continue; }
      const room = Math.min(cap.file, cap.total - total), left = t0 + lim.filesMs - Date.now();
      if (room < lim.minFile) { it.file = { attached: false, reason: "total_too_large" }; continue; }
      if (left < lim.fileMinMs) { it.file = { attached: false, reason: "time_up" }; continue; }
      const f = await intelFile(env, it.id, room, Math.max(lim.minBudgetMs, Math.min(lim.budgetMs, left - lim.packSlack)), lim);
      if (f.doc) it.links.doc = f.doc;
      delete f.doc;
      if (f.attached) {
        const dot = f.name.lastIndexOf("."), stem = f.name.slice(0, dot), ext = f.name.slice(dot);
        let name = f.name, n = 1; while (names.has(name.toLowerCase())) name = stem + "-" + ++n + ext;
        names.add(name.toLowerCase()); f.name = name; total += f.size; attached++;
        it.file = f;
      } else it.file = f.reason === "too_large" && f.size > 0 && f.size <= cap.file && room < cap.file ? { attached: false, reason: "total_too_large" } : f;
    }
  } finally {
    if (release) { if (o.gate && typeof o.gate === "object") o.gate.release = release; else release(); }
  }
  for (const it of out) { delete it.want; if (it.found && it.file && it.file.reason === "pending") it.file = { attached: false, reason: "other" }; }
  return out;
}
/* every attached file becomes «not attached» with that reason (the e-mail went without them, or did not go) */
export function dropFiles(items, reason) {
  for (const it of items || []) if (it && it.found && it.file && it.file.attached) it.file = { attached: false, reason };
  return items;
}

/* ---------- the e-mail ---------- */
const AI_NOTE = ["(العنوان والملخص صياغة وترجمة آلية غير رسمية من نص المصدر، والمرجع هو المصدر الرسمي.)", "(Title and summary are an unofficial machine wording and translation of the source text; the official source is the reference.)"];
const isNews = c => c.kind === "news" || c.kind === "project_news";
const groupMarket = m => /^(?:africa|asia|eu|gcc|intl|europe|gulf)$/.test(String(m || ""));
/* the official link itself answered 404 / 410 (review R6): it is shown as not opening now, never «open it from the official link» */
const offDead = it => !!(it.found && it.file && it.file.reason === "gone" && it.links.official && (!it.links.doc || it.links.doc === it.links.official));
/* an English label for a value in Arabic (review R8) */
const enLabel = (label, v, what = "in Arabic") => (arMostly(v) ? label + " (" + what + ")" : label);
/* the card's rows [label, value] in one language (the text and the html share them) */
function cardRows(it, L, env, now) {
  const en = L === "en", c = it.card, rows = [];
  if (it.type === "intel") {
    rows.push([en ? "Type" : "النوع", en ? c.kind_label_en || c.kind_label : c.kind_label]);
    /* review R10: news has no buyer (the row only when the source names an organisation); a project has an owner */
    if (isNews(c)) { if (c.entity) rows.push([en ? enLabel("Organisation", c.entity, "name in Arabic") : "الجهة", c.entity]); }
    else if (c.kind === "project") rows.push([en ? enLabel("Project owner", c.entity, "name in Arabic") : "صاحب المشروع", c.entity || (en ? "not published at the source" : "مش منشور في المصدر")]);
    else rows.push([en ? enLabel("Buyer", c.entity, "name in Arabic") : "الجهة", c.entity || (en ? "not published at the source" : "مش منشورة في المصدر")]);
    const place = en ? c.market_name_en || c.country || c.market_name : c.market_name || c.country;
    if (place) rows.push([en ? "Country" : "البلد", place + (c.country && groupMarket(c.market) && c.country !== place ? " (" + c.country + ")" : "")]);
    if (DATED_KINDS.test(c.kind)) {
      const st = statusWord(c.deadline, c.status, L, now);
      rows.push([en ? "Deadline" : "آخر ميعاد للتقديم", c.deadline ? fmtDate(c.deadline, L) + (st ? " (" + st + ")" : "") : en ? "not published at the source" : "مش منشور في المصدر"]);
    }
    if (!isNews(c)) rows.push([en ? "Estimated value" : "القيمة التقديرية", fmtMoney(c.value, c.currency, c.currency_ar, L) || (en ? "not published at the source" : "مش منشورة في المصدر")]);
    const ask = DATED_KINDS.test(c.kind) ? (en ? "What is requested" : "المطلوب") : en ? "Summary" : "الملخص";
    const s = en ? c.summary_en : c.summary;
    rows.push([ask, s || (c.summary_original ? (en ? (arMostly(c.summary_original) ? "From the source text (in Arabic): " : "From the source text: ") : "من نص المصدر: ") + c.summary_original : en ? "The source gives no description beyond the title" : "المصدر مانشرش وصف أكتر من العنوان")]);
    if (c.source_name || c.source_name_en) { const sn = en ? c.source_name_en || c.source_name : c.source_name || c.source_name_en; rows.push([en ? enLabel("Official source", sn, "name in Arabic") : "المصدر الرسمي", sn]); }
  } else {
    if (c.ref) rows.push([en ? "Tender no." : "رقم المناقصة", c.ref]);
    rows.push([en ? "Type" : "النوع", en ? PTYPE_EN[c.type] || (arMostly(c.type) ? "Tender" : c.type) || "Tender" : c.type || "مناقصة"]);
    const buyer = en ? c.entity_en || c.entity : c.entity;
    rows.push([en ? enLabel("Buyer", buyer, "name in Arabic") : "الجهة", buyer || (en ? "not given in the platform's data" : "مش مذكورة في بيانات المنصة")]);
    if (c.market && c.market !== "local") { const w = [en ? c.country_en || (arMostly(c.country) ? "" : c.country) : c.country, en && arMostly(c.city) ? "" : c.city].filter(Boolean).join(" – "); if (w) rows.push([en ? "Country" : "البلد", w]); }
    else if (c.governorate) {
      const g = en ? GOV_EN[c.governorate] || c.governorate : c.governorate, city0 = c.city ? (c.city.includes(c.governorate) ? c.city.split(" - ")[0] : c.city) : "", city = en && arMostly(city0) ? "" : city0;
      rows.push([en ? "Location" : "المكان", g + (city && city !== c.governorate ? " (" + city + ")" : "")]);
    }
    const st = statusWord(c.deadline, "", L, now);
    rows.push([en ? "Deadline" : "آخر ميعاد للتقديم", c.deadline ? fmtDate(c.deadline, L) + (st ? " (" + st + ")" : "") : en ? "not published in the platform's data" : "مش منشور في بيانات المنصة"]);
    const m = [], note = en && arMostly(c.bond_note) ? "" : c.bond_note;
    if (c.bond != null) m.push((en ? "Bid bond: " : "التأمين الابتدائي: ") + num(c.bond) + (en ? " EGP" : " جنيه") + (note ? " (" + note + ")" : ""));
    else if (note) m.push((en ? "Bid bond: " : "التأمين: ") + note);
    if (c.booklet != null) m.push((en ? "Tender booklet price: " : "ثمن الكراسة: ") + num(c.booklet) + (en ? " EGP" : " جنيه"));
    if (c.value != null) m.push((en ? "Estimated value: " : "القيمة التقديرية: ") + num(c.value) + (c.currency ? " " + c.currency : ""));
    rows.push(["", m.length ? m.join(" · ") : en ? "No amounts are published on the platform for this tender" : "مفيش مبالغ منشورة على المنصة للمناقصة دي"]);   /* its own labels */
    if (c.activity && !(en && arMostly(c.activity))) rows.push([en ? "Activity" : "النشاط", c.activity]);
  }
  return rows;
}
/* one of OUR lines (a reason, the footer) as HTML: escaped; its URLs kept left-to-right inside the Arabic text, the platform's own ones
   as links (never used for Bassem's message or for the data's values) */
function richLine(env, s) {
  return esc(s).replace(/https?:\/\/[^\s<>"']+/g, u => { const raw = u.replace(/&amp;/g, "&"), own = ownUrl(env, raw.replace(/[.,;:)]+$/, ""));
    return own ? `<a href="${esc(own)}" dir="ltr" style="color:#8E0B20">${esc(own)}</a>` + esc(raw.slice(own.length)) : `<span dir="ltr">${u}</span>`; });
}
const titleOf = (it, L) => (L === "en" ? it.card.title_en || it.card.title_orig || it.card.title : it.card.title);
/* the English heading of a card whose only title is Arabic: marked, never passed off as English (review R8) */
const AR_TITLE = "(title in Arabic only)";
const pageOf = (it, L) => (L === "en" ? it.links.page_en : it.links.page);
/* the file lines [{t, url?, name?}] (news has none): attached (+ the file of the notice that did not come, review R1) or why not */
function fileLines(it, L) {
  const en = L === "en", f = it.file || {}, out = [];
  if (it.type === "intel" && isNews(it.card)) return out;
  if (f.attached) {
    const lb = labelOf(f.label, L), size = " (" + mb(f.size) + (en ? " MB)" : " ميجا)");
    out.push({ t: (f.skipped ? (en ? "📎 Attached to this e-mail: " : "📎 مرفق في الإيميل ده: ") : en ? "📎 The official file is attached to this e-mail: " : "📎 الملف الرسمي مرفق في الإيميل ده: ") + (lb ? (en ? "the " : "") + lb.t + " — " : "") + f.name + size, name: f.name });
    if (f.skipped) {
      const s = f.skipped, sl = labelOf(s.label, L), w = whyOf(s.reason, s)[en ? "en" : "ar"], url = s.reason !== "gone" ? httpUrl(s.url) : null;
      const lead = sl ? (en ? "The " + sl.t + " was not attached: " : sl.t + (sl.f ? " مااترفقتش: " : " مااترفقش: ")) : en ? "Another official file of this opportunity was not attached: " : "ملف رسمي تاني للفرصة دي مااترفقش: ";
      out.push({ t: lead + w + "." + (url ? (en ? " You can download it here: " : sl && sl.f ? " تقدر تحمّلها من هنا: " : " تقدر تحمّله من هنا: ") : ""), url: url || "" });
    }
    return out;
  }
  if (offDead(it)) { out.push({ t: en ? "The official file is not attached: the official link itself no longer works on the buyer's site (removed or moved)." : "الملف الرسمي مش مرفق: الرابط الرسمي نفسه مبقاش شغال على موقع الجهة (اتشال أو اتنقل)." }); return out; }
  const w = whyOf(f.reason, f)[en ? "en" : "ar"], doc = httpUrl(it.links.doc) && it.links.doc !== it.links.official && f.reason !== "gone" ? it.links.doc : "";
  if (doc) out.push({ t: (en ? "The official file is not attached: " : "الملف الرسمي مش مرفق: ") + w + "." + (en ? " You can download it here: " : " تقدر تحمّله من هنا: "), url: doc });
  else out.push({ t: (en ? "The official file is not attached: " : "الملف الرسمي مش مرفق: ") + w + "." + (httpUrl(it.links.official) ? (en ? " You can open it from the official link." : " تقدر تفتحه من الرابط الرسمي.") : "") });
  return out;
}
const DEAD = [" (مابيفتحش دلوقتي)", " (not opening now)"];
const aiShown = (it, L) => it.type === "intel" && (L === "en" ? !!(it.card.title_en || it.card.summary_en) : !!((it.card.title && it.card.title !== it.card.title_orig) || it.card.summary));
function textCard(it, n, L, env, now) {
  const en = L === "en", out = [];
  if (!it.found) return n + ") " + whyOf(it.reason, it)[en ? "en" : "ar"];
  const c = it.card, t = titleOf(it, L), orig = it.type === "intel" ? c.title_orig : "";
  out.push(n + ") " + t + (!en && it.type === "intel" && c.title_is_original ? " (العنوان بلغة المصدر)" : "") + (en && arMostly(t) ? " " + AR_TITLE : ""));
  if (orig && orig !== t && !(!en && c.title_is_original)) out.push((en ? "Original title: " : "العنوان الأصلي: ") + orig);
  for (const [k, v] of cardRows(it, L, env, now)) out.push(k ? k + ": " + v : v);
  const page = pageOf(it, L);
  if (page) out.push((en ? "Its page on the platform: " : "صفحتها على المنصة: ") + page);
  else if (it.pageNote) out.push(whyOf(it.pageNote)[en ? "en" : "ar"]);
  const off = httpUrl(it.links.official), dead = offDead(it) ? DEAD[en ? 1 : 0] : "";
  if (it.type === "intel") out.push((en ? "Official link: " : "الرابط الرسمي: ") + (off ? off + dead : en ? "no official link is stored for this opportunity" : "مفيش رابط رسمي محفوظ للفرصة دي"));
  else out.push(off ? (en ? "Official notice link" : "رابط الإعلان الرسمي") + (c.source_name ? " (" + c.source_name + ")" : "") + ": " + off : en ? "No notice link is stored for this tender in the platform's data" : "مفيش رابط إعلان محفوظ للمناقصة دي في بيانات المنصة");
  for (const l of fileLines(it, L)) out.push(l.t + (l.url || ""));
  if (aiShown(it, L)) out.push(AI_NOTE[en ? 1 : 0]);
  return out.join("\n");
}
/* review R7: Bassem also sends notes on his own (an end-of-call summary) — the footer never says the member asked for this one */
const FOOT = {
  ar: (env) => ["التقديم بيكون عند الجهة المعلنة بشروطها؛ المنصة مش بتطرح ولا بترسي المناقصات.", "وصلك الإيميل ده من باسم خلال مكالمتكم على منصة صنع في مصر.", "كمّل مع باسم: " + site(env) + "advisor/", "بياناتك محمية وفق قانون حماية البيانات الشخصية المصري 151/2020."],
  en: (env) => ["Bids go to the announcing buyer on its own terms; the platform does not issue or award tenders.", "Bassem sent you this e-mail during your call on Made in Egypt Gate.", "Continue with Bassem: " + site(env) + "advisor/?lang=en", "Your data is handled under Egypt's PDPL (Law 151/2020)."],
};
const RULE = "————————";
/* review R11: the heading counts the entries listed (a ref without a card is one of them too) */
function detailsHead(n, L) { return L === "en" ? "Opportunity details from the platform's data (not Bassem's words):" : (n > 1 ? "تفاصيل الفرص" : "تفاصيل الفرصة") + " من بيانات المنصة (مش من كلام باسم):"; }
/* the HTML of one card (every value escaped; hrefs only from stored data: platform links on the site, the official link http(s)) */
function htmlCard(it, n, L, env, now) {
  const en = L === "en", al = en ? "left" : "right";
  const box = inner => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e3e3e3;border-radius:10px;border-collapse:separate;margin:0 0 14px"><tr><td style="padding:12px 14px;text-align:${al}">${inner}</td></tr></table>`;
  if (!it.found) return box(`<div style="font-weight:bold">${n})</div><div>${richLine(env, whyOf(it.reason, it)[en ? "en" : "ar"])}</div>`);
  const c = it.card, t = titleOf(it, L), orig = it.type === "intel" ? c.title_orig : "", arT = en && arMostly(t);
  let h = `<div style="font-weight:bold;font-size:16px;line-height:1.5">${n}) ${arT ? `<span dir="rtl" lang="ar">${esc(t)}</span> <span style="color:#777;font-weight:normal;font-size:13px">${AR_TITLE}</span>` : esc(t)}${!en && it.type === "intel" && c.title_is_original ? ' <span style="color:#777;font-weight:normal;font-size:13px">(العنوان بلغة المصدر)</span>' : ""}</div>`;
  if (orig && orig !== t && !(!en && c.title_is_original)) h += `<div style="color:#777;font-size:13px;margin-top:2px" dir="auto">${esc(orig)}</div>`;
  h += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;font-size:14px;line-height:1.6">` +
    cardRows(it, L, env, now).map(([k, v]) => (k ? `<tr><td style="color:#666;padding:2px 0;padding-${en ? "right" : "left"}:12px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0;vertical-align:top" dir="auto">${esc(v)}</td></tr>`
      : `<tr><td colspan="2" style="padding:2px 0;vertical-align:top" dir="auto">${esc(v)}</td></tr>`)).join("") + `</table>`;
  const page = ownUrl(env, pageOf(it, L)), off = httpUrl(it.links.official), dead = offDead(it) ? DEAD[en ? 1 : 0] : "", btn = `display:inline-block;text-decoration:none;padding:8px 14px;border-radius:8px;margin:0 0 6px;margin-${en ? "right" : "left"}:6px;font-size:14px`;
  const btns = (page ? `<a href="${esc(page)}" style="${btn};background:#8E0B20;color:#ffffff;font-weight:bold">${en ? "Open its page on the platform" : "افتح صفحتها على المنصة"}</a>` : "") +
    (off ? `<a href="${esc(off)}" style="${btn};border:1px solid #8E0B20;color:#8E0B20">${en ? "Official link ↗" : "الرابط الرسمي ↗"}${esc(dead)}</a>` : "");
  if (btns) h += `<div style="margin:10px 0 4px">${btns}</div>`;
  if (!page && it.pageNote) h += `<div style="font-size:13px;color:#8a5a00">${esc(whyOf(it.pageNote)[en ? "en" : "ar"])}</div>`;
  if (!off) h += `<div style="font-size:13px;color:#666">${esc(it.type === "intel" ? (en ? "No official link is stored for this opportunity." : "مفيش رابط رسمي محفوظ للفرصة دي.") : en ? "No notice link is stored for this tender in the platform's data." : "مفيش رابط إعلان محفوظ للمناقصة دي في بيانات المنصة.")}</div>`;
  for (const l of fileLines(it, L)) {
    const line = l.name ? esc(l.t).replace(esc(l.name), `<span dir="ltr">${esc(l.name)}</span>`) : esc(l.t), u = httpUrl(l.url);
    h += `<div style="font-size:14px;margin-top:6px">${line}${u ? `<a href="${esc(u)}" dir="ltr" style="color:#8E0B20;word-break:break-all">${esc(u)}</a>` : ""}</div>`;
  }
  const urls = [page, off ? off + dead : ""].filter(Boolean);
  if (urls.length) h += `<div style="color:#888;font-size:12px;margin-top:6px;word-break:break-all;overflow-wrap:anywhere" dir="ltr">${urls.map(esc).join("<br>")}</div>`;
  if (aiShown(it, L)) h += `<div style="color:#888;font-size:12px;margin-top:6px">${esc(AI_NOTE[en ? 1 : 0])}</div>`;
  return box(h);
}
/* items → {subject, text, html, attachments: [{filename, type, b64}]} — Arabic first, then the English twin. Bassem's note is his (labelled
   and kept apart; escaped, never linkified); every card is the platform's data. No card at all → today's subject */
export function notifyMail(env, message, items, now = Date.now()) {
  const list = items || [], cards = list.filter(x => x && x.found), msg = String(message == null ? "" : message);
  const t1 = cards.length === 1 ? titleOf(cards[0], "en") : "";
  const sub = cards.length === 1 ? "باسم: تفاصيل «" + clipTo(cards[0].card.title, NOTIFY_LIM.subjectTitle) + "» / " + (arMostly(t1) ? "Bassem: details of 1 opportunity" : "Bassem: details of “" + clipTo(t1, NOTIFY_LIM.subjectTitle) + "”")
    : cards.length === 2 ? "باسم: تفاصيل فرصتين / Bassem: details of 2 opportunities" : cards.length >= 3 ? "باسم: تفاصيل " + cards.length + " فرص / Bassem: details of " + cards.length + " opportunities" : "رسالة من باسم / A note from Bassem";
  const half = L => {
    const en = L === "en";
    return [(en ? "Bassem's note:" : "رسالة باسم:") + "\n" + msg, RULE + "\n" + detailsHead(list.length, L), list.map((it, i) => textCard(it, i + 1, L, env, now)).join("\n\n"), RULE + "\n" + FOOT[L](env).join("\n")].join("\n\n");
  };
  const text = half("ar") + "\n\n— English —\n\n" + half("en");
  const note = L => `<div style="background:#faf5ec;border:1px solid #eadcc4;border-radius:10px;padding:12px 14px;margin:0 0 16px"><div style="font-weight:bold;color:#8E0B20;margin-bottom:6px">${L === "en" ? "Bassem's note" : "رسالة باسم"}</div><div dir="auto">${esc(msg).replace(/\r?\n/g, "<br>")}</div></div>`;
  const hhalf = L => `<div dir="${L === "en" ? "ltr" : "rtl"}" lang="${L}" style="text-align:${L === "en" ? "left" : "right"}">${note(L)}<div style="font-weight:bold;margin:0 0 10px">${esc(detailsHead(list.length, L))}</div>${list.map((it, i) => htmlCard(it, i + 1, L, env, now)).join("")}<div style="color:#777;font-size:12px;margin-top:18px;border-top:1px solid #e3e3e3;padding-top:10px">${FOOT[L](env).map(x => richLine(env, x)).join("<br>")}</div></div>`;
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:640px;margin:0 auto">${hhalf("ar")}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">${hhalf("en")}</div>`;
  const attachments = cards.filter(it => it.file && it.file.attached).map(it => ({ filename: it.file.name, type: it.file.type, b64: it.file.b64 }));
  return { subject: sub.slice(0, 200), text, html, attachments };
}

/* ---------- WhatsApp: the same cards as text + links, ≤ 2000 characters (a queued text is stored as str(text, 2000), whatsapp.js) ---------- */
const LONG_URL = "(اللينك في صفحتها على المنصة · link on its platform page)";
/* review R11: one, two or more files */
const WA_FILES = n => (n === 1 ? "والملف الرسمي مرفق هناك · the official file is attached there" : n === 2 ? "والملفين الرسميين مرفقين هناك · the 2 official files are attached there" : "والملفات الرسمية مرفقة هناك · the " + n + " official files are attached there");
export function notifyWa(message, items, o = {}) {
  const msg = String(message == null ? "" : message), cards = (items || []).filter(x => x && x.found);
  if (!cards.length) return msg.slice(0, NOTIFY_LIM.waText);
  const u = s => (s && s.length > NOTIFY_LIM.waUrl ? LONG_URL : s);
  const blocks = cards.map((it, i) => {
    const c = it.card, st = statusWord(c.deadline, c.status || "", "ar", o.now || Date.now()), sten = statusWord(c.deadline, c.status || "", "en", o.now || Date.now());
    const head = [(i + 1) + ") " + clipTo(c.title, NOTIFY_LIM.waTitle)];
    if (c.deadline) head.push("آخر ميعاد · Deadline: " + c.deadline + (st ? " (" + st + " · " + sten + ")" : ""));
    if (it.links.page) head.push("صفحتها · Page: " + u(it.links.page));
    return { head, off: it.links.official ? "الرسمي · Official: " + u(it.links.official) + (offDead(it) ? " (مابيفتحش دلوقتي · not opening now)" : "") : "" };
  });
  const tail = o.emailSent ? "📧 التفاصيل كاملة في إيميلك · Full details are in your e-mail" + (o.attached > 0 ? " — " + WA_FILES(+o.attached) : "") : "";
  const build = (m, bl) => [m, "📌 من بيانات المنصة · From the platform's data:\n" + bl.map(b => b.head.concat(b.off ? [b.off] : []).join("\n")).join("\n"), tail].filter(Boolean).join("\n\n");
  let bl = blocks.map(b => ({ head: b.head, off: b.off })), out = build(msg, bl);
  if (out.length > NOTIFY_LIM.waText && bl[bl.length - 1].off) { bl[bl.length - 1].off = ""; out = build(msg, bl); }
  while (out.length > NOTIFY_LIM.waText && bl.length > 1) { bl = bl.slice(0, -1); out = build(msg, bl); }
  if (out.length > NOTIFY_LIM.waText) {
    /* the message itself, shortened at a word boundary outside any URL */
    const room = NOTIFY_LIM.waText - (out.length - msg.length) - 1;
    let cut = room > 0 ? msg.slice(0, room) : "";
    const urls = [...msg.matchAll(/https?:\/\/\S+/g)].map(m => [m.index, m.index + m[0].length]);
    const inUrl = i => urls.some(([a, b]) => i > a && i < b);
    let i = cut.length; while (i > 0 && (!/\s/.test(msg[i] || " ") || inUrl(i))) i--;
    cut = msg.slice(0, Math.max(0, i)).replace(/\s+$/, "");
    out = build(cut + "…", bl);
    if (out.length > NOTIFY_LIM.waText) out = build("…", bl).slice(0, NOTIFY_LIM.waText);
  }
  return out;
}

/* ---------- the reply and the event ---------- */
const labelBoth = l => { const a = labelOf(l, "ar"), e = labelOf(l, "en"); return a && e ? { ar: a.t, en: e.t } : null; };
export function replyItems(items) {
  return (items || []).map(it => {
    if (!it.found) { const w = whyOf(it.reason, it); return { ref: it.ref, found: false, reason: it.reason, why: { ar: w.ar, en: w.en } }; }
    const f = it.file || {}, w = f.attached ? null : whyOf(f.reason, f), dead = offDead(it);
    let file;
    if (f.attached) {
      const s = f.skipped, sw = s ? whyOf(s.reason, s) : null, lb = labelBoth(f.label);
      file = { attached: true, name: f.name, size: f.size, ...(lb ? { label: lb } : {}), ...(s ? { skipped: { label: labelBoth(s.label), reason: s.reason, why: { ar: sw.ar, en: sw.en } } } : {}) };
    } else file = { attached: false, reason: f.reason, why: dead ? { ar: "الرابط الرسمي نفسه مبقاش شغال على موقع الجهة", en: "the official link itself no longer works on the buyer's site" } : { ar: w.ar, en: w.en } };
    return { ref: it.ref, found: true, id: it.id, title: it.rt || "", page: it.links.page || null, official: it.links.official || null, file };
  });
}
/* {ref: what happened} for the events row: "attached", a file reason, or why there is no card — codes only, never text */
export function whyMap(items) {
  const out = {};
  for (const it of items || []) out[it.ref] = !it.found ? it.reason : it.file && it.file.attached ? "attached" : (it.file && it.file.reason) || "";
  return out;
}
