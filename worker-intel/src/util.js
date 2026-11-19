/* migate-intel — shared helpers (pure, no bindings): ids, URL canonicalisation, text normalisation, trigram similarity,
   personal-contact stripping, dates in Africa/Cairo, slugs, HTML escaping. Used by the Worker and by node --test. */
export const SITE = "https://madeinegyptgate.com";
export const UA = "MadeInEgyptGate-IntelBot/1.0 (+https://madeinegyptgate.com/intel/sources/)";
export const KINDS = ["tender_gov", "tender_semi", "tender_private", "rfq", "project", "project_news", "news"];
export const KIND_GROUPS = {
  tenders: ["tender_gov", "tender_semi", "tender_private"],
  projects: ["project", "project_news"],
  rfq: ["rfq"],
  news: ["news"],
};
/* URL segment for each kind (item pages /intel/<seg>/<slug>-<id>/) */
export const KIND_SEG = { tender_gov: "tenders", tender_semi: "tenders", tender_private: "tenders", rfq: "rfq", project: "projects", project_news: "projects", news: "news" };
export const KIND_LABEL = {
  tender_gov: ["مناقصة حكومية", "Government tender"],
  tender_semi: ["مناقصة شبه حكومية", "Semi-government tender"],
  tender_private: ["مناقصة قطاع خاص", "Private-sector tender"],
  rfq: ["طلب عرض أسعار", "Request for quotation"],
  project: ["مشروع", "Project"],
  project_news: ["أخبار المشاريع", "Project news"],
  news: ["خبر", "News"],
};

/* cyrb53 — fast, stable 53-bit string hash → 11 base-36 chars (ids must never change between runs) */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function itemId(sourceId, extIdOrUrl) {
  return hash53(String(sourceId) + "|" + String(extIdOrUrl)).toString(36).padStart(11, "0");
}
export const ID_RE = /^[0-9a-z]{11}$/;

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|igshid|ref|ref_src|spm|cmpid|ocid|amp|output)$/i;
/* canonical form used for dedupe: host without www, path without trailing slash, sorted non-tracking query, no fragment */
export function canonicalUrl(u) {
  let x;
  try { x = new URL(String(u || "").trim()); } catch (e) { return ""; }
  if (!/^https?:$/.test(x.protocol)) return "";
  const host = x.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  let path = x.pathname.replace(/\/+$/, "") || "/";
  path = path.replace(/\/amp$/i, "");
  const qs = [...x.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort((a, b) => (a[0] + "=" + a[1]).localeCompare(b[0] + "=" + b[1]));
  return host + path + (qs.length ? "?" + qs.map(([k, v]) => k + "=" + v).join("&") : "");
}
export function absUrl(href, base) {
  if (!href) return "";
  try { return new URL(String(href).trim(), base || undefined).toString(); } catch (e) { return ""; }
}

/* ---------- text ---------- */
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", deg: "°",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä", aring: "å", ccedil: "ç", iacute: "í", igrave: "ì", icirc: "î", iuml: "ï", oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö", uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü", ntilde: "ñ", szlig: "ß",
  Eacute: "É", Egrave: "È", Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Ccedil: "Ç", Iacute: "Í", Oacute: "Ó", Otilde: "Õ", Uacute: "Ú", Ntilde: "Ñ", ordm: "º", ordf: "ª", zwnj: "\u200c", zwj: "\u200d", lrm: "", rlm: "" };
export function decodeEntities(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!n || n > 0x10ffff) return "";
      try { return String.fromCodePoint(n); } catch (x) { return ""; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}
export function stripHtml(s) {
  return decodeEntities(String(s == null ? "" : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/h\d>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
}
export function clip(s, n) {
  s = String(s == null ? "" : s).trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:،؛\-–—]+$/, "") + "…";
}
const AR_DIGITS = /[٠-٩۰-۹]/g;
export function asciiDigits(s) { return String(s || "").replace(AR_DIGITS, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(d) : "۰۱۲۳۴۵۶۷۸۹".indexOf(d))); }
/* comparison form: lower-case, no Latin accents / Arabic diacritics, unified alef/ya/ta-marbuta, punctuation → space */
export function normText(s) {
  return asciiDigits(String(s || "")).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
export function trigrams(s) {
  const t = " " + normText(s) + " ", out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (big.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}
export function titleSimilarity(x, y) { return jaccard(trigrams(x), trigrams(y)); }

/* personal contacts are never public: drop e-mail addresses and phone-like numbers from any text we publish */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_LABELED = /(?:\b(?:tel|phone|telephone|fax|mobile|mob|whatsapp|t\.|f\.)\b|هاتف|تليفون|ت:|تلفون|موبايل|محمول|فاكس|واتساب|واتس)\s*[:.]?\s*[+(]?[0-9٠-٩][0-9٠-٩\s().\/-]{5,}[0-9٠-٩]/gi;
const PHONE_INTL = /(?:\+|\b00)[0-9٠-٩][0-9٠-٩\s().-]{7,}[0-9٠-٩]/g;
const PHONE_EG_MOBILE = /\b0?1[0125][0-9]{8}\b/g;
const PHONE_GROUPED = /\b0[0-9]{1,3}[\s-][0-9]{3,4}[\s-][0-9]{3,4}\b/g;
export function stripContacts(s) {
  if (!s) return s;
  return String(s).replace(EMAIL, "").replace(PHONE_LABELED, "").replace(PHONE_INTL, "").replace(PHONE_EG_MOBILE, "").replace(PHONE_GROUPED, "")
    .replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;:،؛])/g, "$1").trim();
}
/* true when a text carries something stripContacts() would remove (non-global copies: no lastIndex state) */
const CONTACT_TESTS = [EMAIL, PHONE_LABELED, PHONE_INTL, PHONE_EG_MOBILE, PHONE_GROUPED].map(re => new RegExp(re.source, re.flags.replace("g", "")));
export function hasContacts(s) { return !!s && CONTACT_TESTS.some(re => re.test(String(s))); }
export function stripUrls(s) { return String(s || "").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/\s{2,}/g, " ").trim(); }

/* ---------- dates (stored as ISO UTC; shown in Africa/Cairo) ---------- */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/* returns ISO string (full instant) or null; accepts RFC 822, ISO 8601, "16-Nov-2026", "2026-12-07+02:00", "07/12/2026" (d/m/y) */
export function parseDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? null : d.toISOString(); }
  let s = asciiDigits(String(v).trim());
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:([+-]\d{2}:?\d{2}|Z))?$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,4})[a-z]*[-\s,]+(\d{4})$/.exec(s);
  if (m && MON[m[2].toLowerCase()]) return new Date(Date.UTC(+m[3], MON[m[2].toLowerCase()] - 1, +m[1])).toISOString();
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return isNaN(d) ? null : d.toISOString(); }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString();
  return null;
}
export function dayOf(iso) { return iso ? String(iso).slice(0, 10) : null; }
export function cairoParts(ms = Date.now()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
export function cairoDay(ms = Date.now()) { return cairoParts(ms).day; }
export function addDays(day, n) { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function fmtDay(day, lang) {
  if (!day) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return "";
  return lang === "en" ? `${+m[3]} ${EN_MONTHS[+m[2] - 1]} ${m[1]}` : `${+m[3]} ${AR_MONTHS[+m[2] - 1]} ${m[1]}`;
}
/* "18 نوفمبر 2026، 13:05 (توقيت القاهرة)" */
export function fmtCairo(iso, lang) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const p = cairoParts(t);
  return lang === "en" ? `${fmtDay(p.day, "en")}, ${p.time} (Cairo time)` : `${fmtDay(p.day, "ar")}، ${p.time} (توقيت القاهرة)`;
}
/* tender status from the deadline — same honest rule as the platform: no deadline → "info" (never "open" by default) */
export function statusFor(kind, deadline, nowMs = Date.now()) {
  if (!/^tender_|^rfq$/.test(kind)) return "info";
  const d = dayOf(deadline);
  if (!d) return "info";
  const today = cairoDay(nowMs);
  if (d < today) return "closed";
  if (d <= addDays(today, 7)) return "closing_soon";
  return "open";
}

/* ---------- slugs & html ---------- */
export function slugify(s, max = 70) {
  let t = String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u064b-\u065f\u0670\u0640]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (t.length > max) { t = t.slice(0, max); const i = t.lastIndexOf("-"); if (i > max * 0.5) t = t.slice(0, i); }
  return t.replace(/-$/, "") || "item";
}
export function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export function jsonLd(obj) { return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
/* SQLite string literal (single quotes doubled) — used only for multi-row upserts where D1's 100-parameter limit bites */
export function sqlLit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/\u0000/g, "").replace(/'/g, "''") + "'";
}
export function timingSafeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  const len = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return diff === 0 && a.length > 0;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
