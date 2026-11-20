/* «ابعتلي» with the opportunities themselves (owner 2026-11-19: the e-mail Bassem sent had no data, no attachment and no working link).
   POST /api/advisor/notify {message, channel, items?: ["intel:<11 chars>", "item:<platform tender id>"]} (advisor.js notifyMember): for
   each ref (≤ 3, parseRefs) the e-mail to the member's OWN inbox carries its details from the platform's own data (never Bassem's words,
   never the page's), its page on the platform (a link that answers), its official link and — for an Information Center tender / RFQ /
   project whose source allows it — the official PDF / DOCX ATTACHED when it could be downloaded; otherwise one plain reason line (WHY).
   WhatsApp gets the same cards as text + links (no file: respond.io sends text only).
   - Information Center: migate-intel POST /api/intel/mailpack through the service binding INTEL (worker/wrangler.toml), on the
     binding-only hostname PACK_HOST — migate-intel answers that path on no other hostname, so no secret is needed (worker-intel
     INTEGRATION.md §9). A failed pack → its public item JSON through the same binding (card + links, no file). No binding → no call at
     all (a workers.dev fetch from this Worker is refused by Cloudflare, error 1042): the short link and an honest line.
   - Platform tenders: in-process (janna-item.js findItem over items.json) + a HEAD of its page on the Pages production URL.
   - Files: only what migate-intel downloaded from the item's own official site (its SSRF / robots guards — this Worker never fetches a
     third-party URL); checked again here (base64, %PDF- / PK magic, size, type); sized per provider (NOTIFY_LIM.cap), ≤ filesPerDay a
     member per rolling 24 h (advisor.js counts them from events.data.files).
   No import at module level (advisor.js ↔ common.js cycle; janna-item.js imports common.js): the few dependencies load inside functions. */

/* budgetMs: migate-intel's time for the official file (its itemFile deadline = budget - 0.5 s). A real Kenya PPIP Tender Document (2.4 MB)
   took 12.3 s to its last byte read from outside Kenya (2026-11-20; robots.txt 1.8 s, cached 24 h after): 8 s cut such files off, so 20 s;
   packMs = the pack's own abort, a little after it. The page waits 45 s for the answer (data/janna-live.js notifyGo). */
export const NOTIFY_LIM = Object.freeze({
  refs: 3, packMs: 23000, itemMs: 2500, pageMs: 2500, budgetMs: 20000, filesPerDay: 10, waText: 2000, waUrl: 600, subjectTitle: 60, waTitle: 90,
  cap: Object.freeze({ resend: Object.freeze({ file: 8e6, total: 12e6 }), brevo: Object.freeze({ file: 4e6, total: 8e6 }) }),
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

/* ---------- small helpers (local copies: no import of common.js / advisor.js) ---------- */
const scalar = v => (typeof v === "string" ? v : typeof v === "number" && isFinite(v) ? String(v) : "");
const txt = (v, max = 400) => scalar(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​‎‏‪-‮⁦-⁩﻿]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
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
  source_opt_out: ["شروط موقع الجهة مابتسمحش إننا نبعت ملفاته", "the source's terms do not allow us to forward its files"],
  daily_files: ["وصلت لحد " + NOTIFY_LIM.filesPerDay + " ملفات مرفقة في اليوم", "you reached today's limit of " + NOTIFY_LIM.filesPerDay + " attached files"],
  pack_off: ["جلب الملفات من مركز المعلومات مش شغال دلوقتي", "fetching files from the Information Center is not available right now"],
  platform_listing: ["ده إعلان من بيانات المنصة نفسها، والمنصة لسه مابتنزّلش ملفات الإعلانات دي", "this is a listing from the platform's own data, and the platform does not download these notices' files yet"],
  kind: ["ده خبر، ومالوش ملف رسمي يترفق", "this is a news item; it has no official file to attach"],
  whatsapp_only: ["الواتساب مابيبعتش ملفات؛ الملف بيتبعت على الإيميل بس", "WhatsApp cannot carry files; the file goes by e-mail only"],
  email_not_sent: ["الإيميل نفسه مااتبعتش، فمفيش ملف اترفق", "the e-mail itself was not sent, so no file was attached"],
  not_found: ["الفرصة دي اتشالت من مركز المعلومات أو خلصت مدتها، فمافيش تفاصيل أبعتهالك", "this opportunity was removed from the Information Center or has expired, so there are no details to send"],
  not_found_item: ["الفرصة دي مش موجودة في بيانات المنصة دلوقتي", "this opportunity is no longer in the platform's data"],
  unavailable: ["ماقدرتش أوصل لمركز المعلومات دلوقتي علشان أجيب تفاصيل الفرصة دي — جرّب صفحتها بعد شوية", "I could not reach the Information Center right now to get this opportunity's details — try its page a bit later"],
  ambiguous: ["الرقم ده مشترك بين كذا مناقصة في بيانات المنصة، فماحطّيتش تفاصيل علشان ماغلطش", "this number is shared by several tenders in the platform's data, so no details were added to avoid a mistake"],
  page_gone: ["صفحتها على المنصة مش متاحة دلوقتي", "its page on the platform is not available right now"],
  page_moved: ["صفحتها على المنصة مش متاحة دلوقتي", "its page on the platform is not available right now"],
  other: ["ماقدرتش أجيب الملف الرسمي دلوقتي", "the official file could not be fetched right now"],
});
/* one reason → {ar, en} with what the line needs (a size, a link) */
export function whyOf(code, x = {}) {
  const k = WHY[code] ? code : "other";
  let ar = WHY[k][0], en = WHY[k][1];
  if (k === "too_large" && x.size > 0) { ar = "الملف كبير (" + mb(x.size) + " ميجا) على الإيميل"; en = "the file is too large for e-mail (" + mb(x.size) + " MB)"; }
  if (k === "not_found" && x.type === "item") { ar = WHY.not_found_item[0]; en = WHY.not_found_item[1]; }
  if (k === "unavailable" && x.link) { ar += ": " + x.link; en += ": " + x.link; }
  return { ar, en };
}

/* ---------- refs ---------- */
const REF_ITEM = /^item:[^\s\u0000-\u001f\u007f]{1,160}$/;
/* the opportunities a note is about: an array (or a comma-separated string) of "intel:<11 chars>" / "item:<id>"; anything else — a URL, a
   title, an object — is dropped and never fetched. At most 20 looked at, duplicates once, the first NOTIFY_LIM.refs kept */
export function parseRefs(v) {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = [];
  for (const x of list.slice(0, 20)) {
    if (typeof x !== "string") continue;
    let s = x.trim();
    if (/^intel:/i.test(s)) s = "intel:" + s.slice(6).toLowerCase();
    if (!(/^intel:[0-9a-z]{11}$/.test(s) || REF_ITEM.test(s)) || out.includes(s)) continue;
    out.push(s);
    if (out.length >= NOTIFY_LIM.refs) break;
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

/* ---------- migate-intel through the service binding ---------- */
const race = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "AbortError" })), ms); })]).finally(() => clearTimeout(t)); };
async function readCapped(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") { const t = await r.text(); return t.length > cap ? null : t; }
  const rd = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > cap) { try { await rd.cancel(); } catch (e) { /* ignore */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder("utf-8").decode(all);
}
/* path on migate-intel → {status, j?} (j = the JSON answer); {status:0, off:true} without the binding; never throws */
export async function intelFetch(env, path, init, ms, fileBytes = 0) {
  if (!env || !env.INTEL || typeof env.INTEL.fetch !== "function") return { status: 0, off: true };
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  try {
    return await race((async () => {
      const r = await env.INTEL.fetch(new Request("https://" + PACK_HOST + path, { ...init, redirect: "manual", ...(ctl ? { signal: ctl.signal } : {}) }));
      const cap = Math.ceil(fileBytes * 4 / 3) + 256 * 1024, len = +r.headers.get("content-length") || 0;
      if (len > cap) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } return { status: r.status, error: "too_big" }; }
      const t = await readCapped(r, cap);
      if (t === null) return { status: r.status, error: "too_big" };
      let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
      return { status: r.status, j: j && typeof j === "object" && !Array.isArray(j) ? j : null };
    })(), ms);
  } catch (e) { if (ctl) try { ctl.abort(); } catch (x) { /* ignore */ } return { status: 0, error: e && e.name === "AbortError" ? "timeout" : "unreachable" }; }
}
/* a file migate-intel returned, checked again: base64, %PDF- (in the first 1 KB, like its sniff) or a ZIP (PK\3\4) for DOCX, the type it
   claims, the exact size, ≤ perFile → {type, size, b64, name} | null */
function checkFile(f, perFile, id) {
  if (!f || typeof f !== "object" || typeof f.b64 !== "string" || !f.b64 || f.b64.length % 4) return null;
  const b = f.b64;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b)) return null;
  const size = b.length / 4 * 3 - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);
  if (size < 8 || size !== +f.size || size > perFile) return null;
  let head = ""; try { head = atob(b.slice(0, 1368)); } catch (e) { return null; }
  const type = head.indexOf("%PDF-") >= 0 && head.indexOf("%PDF-") < 1024 ? PDF : head.charCodeAt(0) === 0x50 && head.charCodeAt(1) === 0x4b && head.charCodeAt(2) === 3 && head.charCodeAt(3) === 4 ? DOCX : "";
  if (!type || type !== f.type) return null;
  const ext = type === PDF ? "pdf" : "docx", base = txt(f.name, 120).replace(/\.(?:pdf|docx)$/i, "").trim();
  const name = (base.length <= 80 && /^[A-Za-z0-9 ._()-]+$/.test(base) && /[A-Za-z0-9]/.test(base) && !/^\./.test(base) ? base : "document-" + id) + "." + ext;
  return { type, size, b64: b, name, from: txt(f.from, 20) };
}
const KNOWN = new Set(Object.keys(WHY));
const fileReason = r => (KNOWN.has(r) && r !== "not_found" && r !== "unavailable" && r !== "ambiguous" ? r : "other");
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
  const sum = v => { const s = txt(stripUrls(D.stripPII(scalar(v))), 1200); return s; };
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
/* one Information Center ref: the pack, else the public item JSON, else «unavailable» with its short link */
async function intelItem(env, D, id, o) {
  const ref = "intel:" + id, short = o.pagesOn ? SITE + "intel/tenders/" + id + "/" : "";   // any kind: the item pages 301 to their canonical URL
  const gone = { ref, type: "intel", id, found: false, reason: "not_found" }, unavailable = { ref, type: "intel", id, found: false, reason: "unavailable", link: short };
  if (!env || !env.INTEL || typeof env.INTEL.fetch !== "function") return unavailable;
  const body = o.wantFile ? { id, file: true, max_bytes: o.perFile, budget_ms: NOTIFY_LIM.budgetMs } : { id, file: false };
  const p = await intelFetch(env, "/api/intel/mailpack", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }, NOTIFY_LIM.packMs, o.wantFile ? o.perFile : 0);
  /* 404 / 410 of the item itself ({found:false}) — never the plain 404 of a migate-intel without this endpoint */
  if ((p.status === 404 || p.status === 410) && p.j && p.j.found === false) return gone;
  const j = p.status === 200 ? p.j : null;
  let card = null, links = null, file = null;
  if (j && j.ok === true && j.card && typeof j.card === "object" && j.links && typeof j.links === "object" && ID_RX.test(String(j.id || ""))) {
    card = packCard(j.card);
    const L = j.links;
    links = { page: o.pagesOn && PAGE_RX.test(String(L.page || "")) ? L.page : null, page_en: o.pagesOn && PAGE_RX.test(String(L.page_en || "")) ? L.page_en : null, official: httpUrl(L.source), doc: httpUrl(L.doc) };
    if (!FILE_KINDS.has(card.kind)) file = { attached: false, reason: "kind" };
    else if (!o.wantFile) file = { attached: false, reason: o.reasonNoFile };
    else if (j.file) { const f = checkFile(j.file, o.perFile, String(j.id)); file = f ? { attached: true, ...f } : { attached: false, reason: "unsupported" }; }
    else file = { attached: false, reason: fileReason(String(j.reason || "")), ...(+j.reason_size > 0 ? { size: +j.reason_size } : {}) };
    return { ref, type: "intel", id: String(j.id), found: true, card, links, file };
  }
  /* the pack failed (no answer in time, an error, an older migate-intel): the public item JSON, both languages, through the binding */
  const [a, e] = await Promise.all(["ar", "en"].map(l => intelFetch(env, "/api/intel/item/" + id + "?lang=" + l, { method: "GET", headers: { Accept: "application/json" } }, NOTIFY_LIM.itemMs)));
  if ((a.status === 404 || a.status === 410) && a.j && a.j.error === "gone") return gone;
  if (a.status !== 200 || !a.j || String(a.j.id || "") !== id) return unavailable;
  card = publicCard(D, a.j, e.status === 200 && e.j && String(e.j.id || "") === id ? e.j : null);
  const seg = segOf(card.kind);
  links = { page: o.pagesOn ? SITE + "intel/" + seg + "/" + id + "/" : null, page_en: o.pagesOn ? SITE + "intel/en/" + seg + "/" + id + "/" : null, official: httpUrl(a.j.url), doc: null };
  file = { attached: false, reason: !FILE_KINDS.has(card.kind) ? "kind" : o.wantFile ? "pack_off" : o.reasonNoFile };
  return { ref, type: "intel", id, found: true, card, links, file };
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
/* one platform tender ref (items.json): its record, only when found and not a number several tenders share */
async function tenderItem(env, D, id, now) {
  const ref = "item:" + id;
  let r = null; try { r = D.findItem("tenders", { id }, now); } catch (e) { r = null; }
  if (!r || !r.found) return { ref, type: "item", id, found: false, reason: "not_found" };
  if (r.ambiguous) return { ref, type: "item", id, found: false, reason: "ambiguous" };
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
    links: { page, page_en: page ? page + (page.indexOf("?") < 0 ? "?lang=en" : "&lang=en") : null, official, doc: null },
    file: { attached: false, reason: official ? "platform_listing" : "no_document" } };
}

/* refs → items in ref order (all at once). o = {channel, mailOk, provider: "resend"|"brevo"|"", filesLeft, now}.
   An item: {ref, type: "intel"|"item", id, found: true, card, links: {page, page_en, official, doc}, file: {attached: true, name, type, size,
   b64, from} | {attached: false, reason, size?}, rt (its title for the reply), pageNote?} | {ref, type, id, found: false, reason, link?} */
export async function resolveNotifyItems(env, refs, o = {}) {
  const D = await deps(), now = o.now || Date.now();
  const cap = NOTIFY_LIM.cap[o.provider] || null, nIntel = refs.filter(r => r.startsWith("intel:")).length;
  const noFile = o.channel === "whatsapp" ? "whatsapp_only" : !o.mailOk ? "email_not_sent" : !cap ? "no_attach_provider" : "";
  const slots = noFile ? 0 : Math.min(nIntel, Math.max(0, Math.floor(+o.filesLeft || 0)));
  const perFile = slots ? Math.min(cap.file, Math.floor(cap.total / slots)) : 0;
  let pagesOn = true; try { pagesOn = D.featureSync(env, "intel_pages") !== false; } catch (e) { pagesOn = true; }
  let k = 0;
  const jobs = refs.map(ref => {
    if (ref.startsWith("intel:")) { const i = k++; return intelItem(env, D, ref.slice(6), { wantFile: i < slots, perFile, reasonNoFile: noFile || "daily_files", pagesOn }); }
    return tenderItem(env, D, ref.slice(5), now);
  });
  const got = await Promise.all(jobs.map((p, i) => p.catch(() => ({ ref: refs[i], type: refs[i].startsWith("intel:") ? "intel" : "item", id: refs[i].replace(/^[a-z]+:/, ""), found: false, reason: "unavailable" }))));
  /* one entry per opportunity (a duplicate notice and its primary are one), unique file names, the e-mail's total cap in ref order */
  const out = [], seen = new Set(), names = new Set();
  let total = 0;
  for (const it of got) {
    if (it.found) { const key = it.type + ":" + it.id; if (seen.has(key)) continue; seen.add(key); }
    if (it.found) { const t = scalar(it.card.title); it.rt = D.instructionLike(t) ? "" : D.forLLM(t, 120); }
    const f = it.file;
    if (f && f.attached) {
      if (!cap || total + f.size > cap.total) { it.file = { attached: false, reason: "total_too_large" }; }
      else {
        total += f.size;
        const dot = f.name.lastIndexOf("."), stem = f.name.slice(0, dot), ext = f.name.slice(dot);
        let name = f.name, n = 1; while (names.has(name.toLowerCase())) name = stem + "-" + ++n + ext;
        names.add(name.toLowerCase()); f.name = name;
      }
    }
    out.push(it);
  }
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
/* the card's rows [label, value] in one language (the text and the html share them) */
function cardRows(it, L, env, now) {
  const en = L === "en", c = it.card, rows = [];
  if (it.type === "intel") {
    rows.push([en ? "Type" : "النوع", en ? c.kind_label_en || c.kind_label : c.kind_label]);
    rows.push([en ? "Buyer" : "الجهة", c.entity || (en ? "not published at the source" : "مش منشورة في المصدر")]);
    const place = en ? c.market_name_en || c.country || c.market_name : c.market_name || c.country;
    if (place) rows.push([en ? "Country" : "البلد", place + (c.country && groupMarket(c.market) && c.country !== place ? " (" + c.country + ")" : "")]);
    if (DATED_KINDS.test(c.kind)) {
      const st = statusWord(c.deadline, c.status, L, now);
      rows.push([en ? "Deadline" : "آخر ميعاد للتقديم", c.deadline ? fmtDate(c.deadline, L) + (st ? " (" + st + ")" : "") : en ? "not published at the source" : "مش منشور في المصدر"]);
    }
    if (!isNews(c)) rows.push([en ? "Estimated value" : "القيمة التقديرية", fmtMoney(c.value, c.currency, c.currency_ar, L) || (en ? "not published at the source" : "مش منشورة في المصدر")]);
    const ask = DATED_KINDS.test(c.kind) ? (en ? "What is requested" : "المطلوب") : en ? "Summary" : "الملخص";
    const s = en ? c.summary_en : c.summary;
    rows.push([ask, s || (c.summary_original ? (en ? "From the source text: " : "من نص المصدر: ") + c.summary_original : en ? "The source gives no description beyond the title" : "المصدر مانشرش وصف أكتر من العنوان")]);
    if (c.source_name || c.source_name_en) rows.push([en ? "Official source" : "المصدر الرسمي", en ? c.source_name_en || c.source_name : c.source_name || c.source_name_en]);
  } else {
    if (c.ref) rows.push([en ? "Tender no." : "رقم المناقصة", c.ref]);
    rows.push([en ? "Type" : "النوع", en ? PTYPE_EN[c.type] || c.type || "Tender" : c.type || "مناقصة"]);
    rows.push([en ? "Buyer" : "الجهة", (en ? c.entity_en || c.entity : c.entity) || (en ? "not given in the platform's data" : "مش مذكورة في بيانات المنصة")]);
    if (c.market && c.market !== "local") { const w = [en ? c.country_en || c.country : c.country, en && arOnly(c.city) ? "" : c.city].filter(Boolean).join(" – "); if (w) rows.push([en ? "Country" : "البلد", w]); }
    else if (c.governorate) {
      const g = en ? GOV_EN[c.governorate] || c.governorate : c.governorate, city0 = c.city ? (c.city.includes(c.governorate) ? c.city.split(" - ")[0] : c.city) : "", city = en && arOnly(city0) ? "" : city0;
      rows.push([en ? "Location" : "المكان", g + (city && city !== c.governorate ? " (" + city + ")" : "")]);
    }
    const st = statusWord(c.deadline, "", L, now);
    rows.push([en ? "Deadline" : "آخر ميعاد للتقديم", c.deadline ? fmtDate(c.deadline, L) + (st ? " (" + st + ")" : "") : en ? "not published in the platform's data" : "مش منشور في بيانات المنصة"]);
    const m = [];
    if (c.bond != null) m.push((en ? "Bid bond: " : "التأمين الابتدائي: ") + num(c.bond) + (en ? " EGP" : " جنيه") + (c.bond_note ? " (" + c.bond_note + ")" : ""));
    else if (c.bond_note) m.push((en ? "Bid bond: " : "التأمين: ") + c.bond_note);
    if (c.booklet != null) m.push((en ? "Tender booklet price: " : "ثمن الكراسة: ") + num(c.booklet) + (en ? " EGP" : " جنيه"));
    if (c.value != null) m.push((en ? "Estimated value: " : "القيمة التقديرية: ") + num(c.value) + (c.currency ? " " + c.currency : ""));
    rows.push(["", m.length ? m.join(" · ") : en ? "No amounts are published on the platform for this tender" : "مفيش مبالغ منشورة على المنصة للمناقصة دي"]);   /* its own labels */
    if (c.activity && !(en && arOnly(c.activity))) rows.push([en ? "Activity" : "النشاط", c.activity]);
  }
  return rows;
}
/* Arabic letters and no Latin ones: a value the English twin leaves out (a city, an activity) rather than show it untranslated */
const arOnly = s => /[\u0600-\u06ff]/.test(String(s || "")) && !/[A-Za-z]/.test(String(s || ""));
/* one of OUR lines (a reason, the footer) as HTML: escaped; its URLs kept left-to-right inside the Arabic text, the platform's own ones
   as links (never used for Bassem's message or for the data's values) */
function richLine(env, s) {
  return esc(s).replace(/https?:\/\/[^\s<>"']+/g, u => { const raw = u.replace(/&amp;/g, "&"), own = ownUrl(env, raw.replace(/[.,;:)]+$/, ""));
    return own ? `<a href="${esc(own)}" dir="ltr" style="color:#8E0B20">${esc(own)}</a>` + esc(raw.slice(own.length)) : `<span dir="ltr">${u}</span>`; });
}
const titleOf = (it, L) => (L === "en" ? it.card.title_en || it.card.title_orig || it.card.title : it.card.title);
const pageOf = (it, L) => (L === "en" ? it.links.page_en : it.links.page);
/* the file line, or "" (news has none) */
function fileLine(it, L, html) {
  const en = L === "en", f = it.file || {};
  if (it.type === "intel" && isNews(it.card)) return "";
  if (f.attached) return (en ? "📎 The official file is attached to this e-mail: " : "📎 الملف الرسمي مرفق في الإيميل ده: ") + f.name + " (" + mb(f.size) + (en ? " MB)" : " ميجا)");
  const w = whyOf(f.reason, f)[en ? "en" : "ar"], doc = httpUrl(it.links.doc) && it.links.doc !== it.links.official && f.reason !== "gone" ? it.links.doc : "";
  const then = doc ? (en ? " You can download it here: " : " تقدر تحمّله من هنا: ") + (html ? "\u0000" : doc) : httpUrl(it.links.official) ? (en ? " You can open it from the official link." : " تقدر تفتحه من الرابط الرسمي.") : "";
  return (en ? "The official file is not attached: " : "الملف الرسمي مش مرفق: ") + w + "." + then;
}
const aiShown = (it, L) => it.type === "intel" && (L === "en" ? !!(it.card.title_en || it.card.summary_en) : !!((it.card.title && it.card.title !== it.card.title_orig) || it.card.summary));
function textCard(it, n, L, env, now) {
  const en = L === "en", out = [];
  if (!it.found) return n + ") " + whyOf(it.reason, it)[en ? "en" : "ar"];
  const c = it.card, t = titleOf(it, L), orig = it.type === "intel" ? c.title_orig : "";
  out.push(n + ") " + t + (!en && it.type === "intel" && c.title_is_original ? " (العنوان بلغة المصدر)" : ""));
  if (orig && orig !== t && !(!en && c.title_is_original)) out.push((en ? "Original title: " : "العنوان الأصلي: ") + orig);
  for (const [k, v] of cardRows(it, L, env, now)) out.push(k ? k + ": " + v : v);
  const page = pageOf(it, L);
  if (page) out.push((en ? "Its page on the platform: " : "صفحتها على المنصة: ") + page);
  else if (it.pageNote) out.push(whyOf(it.pageNote)[en ? "en" : "ar"]);
  const off = httpUrl(it.links.official);
  if (it.type === "intel") out.push((en ? "Official link: " : "الرابط الرسمي: ") + (off || (en ? "no official link is stored for this opportunity" : "مفيش رابط رسمي محفوظ للفرصة دي")));
  else out.push(off ? (en ? "Official notice link" : "رابط الإعلان الرسمي") + (c.source_name ? " (" + c.source_name + ")" : "") + ": " + off : en ? "No notice link is stored for this tender in the platform's data" : "مفيش رابط إعلان محفوظ للمناقصة دي في بيانات المنصة");
  const fl = fileLine(it, L, false);
  if (fl) out.push(fl);
  if (aiShown(it, L)) out.push(AI_NOTE[en ? 1 : 0]);
  return out.join("\n");
}
const FOOT = {
  ar: (env) => ["التقديم بيكون عند الجهة المعلنة بشروطها؛ المنصة مش بتطرح ولا بترسي المناقصات.", "وصلك الإيميل ده لأنك طلبته من باسم في مكالمتكم.", "كمّل مع باسم: " + site(env) + "advisor/", "بياناتك محمية وفق قانون حماية البيانات الشخصية المصري 151/2020."],
  en: (env) => ["Bids go to the announcing buyer on its own terms; the platform does not issue or award tenders.", "You get this e-mail because you asked Bassem for it in your call.", "Continue with Bassem: " + site(env) + "advisor/?lang=en", "Your data is handled under Egypt's PDPL (Law 151/2020)."],
};
const RULE = "————————";
function detailsHead(nCards, L) { return L === "en" ? "Opportunity details from the platform's data (not Bassem's words):" : (nCards > 1 ? "تفاصيل الفرص" : "تفاصيل الفرصة") + " من بيانات المنصة (مش من كلام باسم):"; }
/* the HTML of one card (every value escaped; hrefs only from stored data: platform links on the site, the official link http(s)) */
function htmlCard(it, n, L, env, now) {
  const en = L === "en", al = en ? "left" : "right";
  const box = inner => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e3e3e3;border-radius:10px;border-collapse:separate;margin:0 0 14px"><tr><td style="padding:12px 14px;text-align:${al}">${inner}</td></tr></table>`;
  if (!it.found) return box(`<div style="font-weight:bold">${n})</div><div>${richLine(env, whyOf(it.reason, it)[en ? "en" : "ar"])}</div>`);
  const c = it.card, t = titleOf(it, L), orig = it.type === "intel" ? c.title_orig : "";
  let h = `<div style="font-weight:bold;font-size:16px;line-height:1.5">${n}) ${esc(t)}${!en && it.type === "intel" && c.title_is_original ? ' <span style="color:#777;font-weight:normal;font-size:13px">(العنوان بلغة المصدر)</span>' : ""}</div>`;
  if (orig && orig !== t && !(!en && c.title_is_original)) h += `<div style="color:#777;font-size:13px;margin-top:2px" dir="auto">${esc(orig)}</div>`;
  h += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;font-size:14px;line-height:1.6">` +
    cardRows(it, L, env, now).map(([k, v]) => (k ? `<tr><td style="color:#666;padding:2px 0;padding-${en ? "right" : "left"}:12px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0;vertical-align:top" dir="auto">${esc(v)}</td></tr>`
      : `<tr><td colspan="2" style="padding:2px 0;vertical-align:top" dir="auto">${esc(v)}</td></tr>`)).join("") + `</table>`;
  const page = ownUrl(env, pageOf(it, L)), off = httpUrl(it.links.official), btn = `display:inline-block;text-decoration:none;padding:8px 14px;border-radius:8px;margin:0 0 6px;margin-${en ? "right" : "left"}:6px;font-size:14px`;
  const btns = (page ? `<a href="${esc(page)}" style="${btn};background:#8E0B20;color:#ffffff;font-weight:bold">${en ? "Open its page on the platform" : "افتح صفحتها على المنصة"}</a>` : "") +
    (off ? `<a href="${esc(off)}" style="${btn};border:1px solid #8E0B20;color:#8E0B20">${en ? "Official link ↗" : "الرابط الرسمي ↗"}</a>` : "");
  if (btns) h += `<div style="margin:10px 0 4px">${btns}</div>`;
  if (!page && it.pageNote) h += `<div style="font-size:13px;color:#8a5a00">${esc(whyOf(it.pageNote)[en ? "en" : "ar"])}</div>`;
  if (!off) h += `<div style="font-size:13px;color:#666">${esc(it.type === "intel" ? (en ? "No official link is stored for this opportunity." : "مفيش رابط رسمي محفوظ للفرصة دي.") : en ? "No notice link is stored for this tender in the platform's data." : "مفيش رابط إعلان محفوظ للمناقصة دي في بيانات المنصة.")}</div>`;
  const fl = fileLine(it, L, true);
  if (fl) {
    const doc = httpUrl(it.file && !it.file.attached && it.links.doc && it.links.doc !== it.links.official && it.file.reason !== "gone" ? it.links.doc : "");
    const parts = fl.split("\u0000");
    const f = it.file || {}, line0 = f.attached && f.name ? esc(parts[0]).replace(esc(f.name), `<span dir="ltr">${esc(f.name)}</span>`) : esc(parts[0]);
    h += `<div style="font-size:14px;margin-top:6px">${line0}${parts.length > 1 && doc ? `<a href="${esc(doc)}" dir="ltr" style="color:#8E0B20;word-break:break-all">${esc(doc)}</a>` : ""}</div>`;
  }
  const urls = [page, off].filter(Boolean);
  if (urls.length) h += `<div style="color:#888;font-size:12px;margin-top:6px;word-break:break-all;overflow-wrap:anywhere" dir="ltr">${urls.map(esc).join("<br>")}</div>`;
  if (aiShown(it, L)) h += `<div style="color:#888;font-size:12px;margin-top:6px">${esc(AI_NOTE[en ? 1 : 0])}</div>`;
  return box(h);
}
/* items → {subject, text, html, attachments: [{filename, type, b64}]} — Arabic first, then the English twin. Bassem's note is his (labelled
   and kept apart; escaped, never linkified); every card is the platform's data. No card at all → today's subject */
export function notifyMail(env, message, items, now = Date.now()) {
  const list = items || [], cards = list.filter(x => x && x.found), msg = String(message == null ? "" : message);
  const sub = cards.length === 1 ? "باسم: تفاصيل «" + clipTo(cards[0].card.title, NOTIFY_LIM.subjectTitle) + "» / Bassem: details of “" + clipTo(titleOf(cards[0], "en"), NOTIFY_LIM.subjectTitle) + "”"
    : cards.length === 2 ? "باسم: تفاصيل فرصتين / Bassem: details of 2 opportunities" : cards.length >= 3 ? "باسم: تفاصيل " + cards.length + " فرص / Bassem: details of " + cards.length + " opportunities" : "رسالة من باسم / A note from Bassem";
  const half = L => {
    const en = L === "en";
    return [(en ? "Bassem's note:" : "رسالة باسم:") + "\n" + msg, RULE + "\n" + detailsHead(cards.length, L), list.map((it, i) => textCard(it, i + 1, L, env, now)).join("\n\n"), RULE + "\n" + FOOT[L](env).join("\n")].join("\n\n");
  };
  const text = half("ar") + "\n\n— English —\n\n" + half("en");
  const note = L => `<div style="background:#faf5ec;border:1px solid #eadcc4;border-radius:10px;padding:12px 14px;margin:0 0 16px"><div style="font-weight:bold;color:#8E0B20;margin-bottom:6px">${L === "en" ? "Bassem's note" : "رسالة باسم"}</div><div dir="auto">${esc(msg).replace(/\r?\n/g, "<br>")}</div></div>`;
  const hhalf = L => `<div dir="${L === "en" ? "ltr" : "rtl"}" lang="${L}" style="text-align:${L === "en" ? "left" : "right"}">${note(L)}<div style="font-weight:bold;margin:0 0 10px">${esc(detailsHead(cards.length, L))}</div>${list.map((it, i) => htmlCard(it, i + 1, L, env, now)).join("")}<div style="color:#777;font-size:12px;margin-top:18px;border-top:1px solid #e3e3e3;padding-top:10px">${FOOT[L](env).map(x => richLine(env, x)).join("<br>")}</div></div>`;
  const html = `<div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:640px;margin:0 auto">${hhalf("ar")}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">${hhalf("en")}</div>`;
  const attachments = cards.filter(it => it.file && it.file.attached).map(it => ({ filename: it.file.name, type: it.file.type, b64: it.file.b64 }));
  return { subject: sub.slice(0, 200), text, html, attachments };
}

/* ---------- WhatsApp: the same cards as text + links, ≤ 2000 characters (a queued text is stored as str(text, 2000), whatsapp.js) ---------- */
const LONG_URL = "(اللينك في صفحتها على المنصة · link on its platform page)";
export function notifyWa(message, items, o = {}) {
  const msg = String(message == null ? "" : message), cards = (items || []).filter(x => x && x.found);
  if (!cards.length) return msg.slice(0, NOTIFY_LIM.waText);
  const u = s => (s && s.length > NOTIFY_LIM.waUrl ? LONG_URL : s);
  const blocks = cards.map((it, i) => {
    const c = it.card, st = statusWord(c.deadline, c.status || "", "ar", o.now || Date.now()), sten = statusWord(c.deadline, c.status || "", "en", o.now || Date.now());
    const head = [(i + 1) + ") " + clipTo(c.title, NOTIFY_LIM.waTitle)];
    if (c.deadline) head.push("آخر ميعاد · Deadline: " + c.deadline + (st ? " (" + st + " · " + sten + ")" : ""));
    if (it.links.page) head.push("صفحتها · Page: " + u(it.links.page));
    return { head, off: it.links.official ? "الرسمي · Official: " + u(it.links.official) : "" };
  });
  const tail = o.emailSent ? "📧 التفاصيل كاملة في إيميلك · Full details are in your e-mail" + (o.attached > 0 ? " — والملف الرسمي مرفق هناك · the official file is attached there" : "") : "";
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
export function replyItems(items) {
  return (items || []).map(it => {
    if (!it.found) { const w = whyOf(it.reason, it); return { ref: it.ref, found: false, reason: it.reason, why: { ar: w.ar, en: w.en } }; }
    const f = it.file || {}, w = f.attached ? null : whyOf(f.reason, f);
    return { ref: it.ref, found: true, id: it.id, title: it.rt || "", page: it.links.page || null, official: it.links.official || null,
      file: f.attached ? { attached: true, name: f.name, size: f.size } : { attached: false, reason: f.reason, why: { ar: w.ar, en: w.en } } };
  });
}
/* {ref: what happened} for the events row: "attached", a file reason, or why there is no card — codes only, never text */
export function whyMap(items) {
  const out = {};
  for (const it of items || []) out[it.ref] = !it.found ? it.reason : it.file && it.file.attached ? "attached" : (it.file && it.file.reason) || "";
  return out;
}
