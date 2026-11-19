/* Owner rule (docs/janna/SEO-SPEC.md §0): factory phone numbers, WhatsApp numbers and e-mail addresses never appear on
   public pages, in JSON-LD, the manifest or the sitemaps — contact goes only through the RFQ form («اطلب عرض سعر»).
   Edge overrides ARE public page text, so /api/seo checks every override field with these helpers before saving.
   Allowed: the platform's own published contacts (the Organization JSON-LD on "/": seo.part.py), plus anything listed in
   env SEO_PUBLIC_CONTACTS (comma-separated phone numbers, e-mail addresses or "@domain").
   Detected: Egyptian mobiles (01x…, +20 1x…, 0020…) and landlines (02 / 03 / 0xx area codes, +20 …) written with
   spaces, dashes, dots, slashes or brackets; any number of 5+ digits right after a phone word (هاتف، تليفون، فاكس،
   الخط الساخن، واتساب، phone, tel, fax, hotline, WhatsApp …); wa.me / WhatsApp send links, tel: / sms: links; e-mail
   addresses including «name [at] domain [dot] com» spellings. Arabic-Indic digits count as digits. */

export const PLATFORM_PHONES = ["+20238346757", "+201279188996"];
export const PLATFORM_EMAIL_DOMAINS = ["madeinegyptgate.com"];

const asciiDigits = s => String(s == null ? "" : s).replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf));
/* national significant number: no "+", "00", country code 20 or trunk 0 */
export function phoneKey(v) {
  let d = asciiDigits(v).replace(/\D/g, "").replace(/^00/, "");
  if (/^20\d{9,10}$/.test(d)) d = d.slice(2);
  return d.replace(/^0+/, "");
}
export function allowList(env) {
  const phones = new Set(PLATFORM_PHONES.map(phoneKey)), domains = new Set(PLATFORM_EMAIL_DOMAINS), emails = new Set();
  for (const raw of String((env && env.SEO_PUBLIC_CONTACTS) || "").split(/[,;\n]+/)) { // phone numbers may contain spaces
    const s = raw.trim().toLowerCase();
    if (!s) continue;
    if (s.startsWith("@")) domains.add(s.slice(1));
    else if (s.includes("@")) emails.add(s);
    else if (phoneKey(s).length >= 5) phones.add(phoneKey(s));
  }
  return { phones, domains, emails };
}

const SEP = "[\\s\\-./()\\u00a0\\u200e\\u200f]*";
const MOBILE_RX = new RegExp(`(?<![\\d+])(?:(?:\\+|00)${SEP}20${SEP}|0)${SEP}1[0125](?:${SEP}\\d){8}(?!\\d)`, "g");
const LAND_RX = new RegExp(`(?<![\\d+])(?:(?:\\+|00)${SEP}20${SEP}\\(?0?|\\(?0)(?:2\\)?(?:${SEP}\\d){8}|3\\)?(?:${SEP}\\d){7}|(?:4[0-8]|5[05-7]|6[2-9]|8[2468]|9[2-7])\\)?(?:${SEP}\\d){7})(?!\\d)`, "g");
const WORD_RX = new RegExp(`(?:الخط الساخن|خط ساخن|رقم الهاتف|رقم التليفون|تليفاكس|تليفون|تلفون|هاتف|فاكس|موبايل|محمول|جوال|واتساب|واتس اب|واتس|اتصل|اتصال|hot\\s?line|telephone|tel|phone|mobile|cell|fax|whats\\s?app|call)\\s*[:：\\-–]?\\s*((?:\\+|00)?\\d(?:${SEP}\\d){4,})`, "gi");
const LINK_RX = /(?:wa\.me\/\+?\d{6,}|whatsapp\.com\/send\/?\?phone=\+?\d{6,}|\b(?:tel|sms|callto):\+?[\d\s\-.()]{5,})/gi;
const EMAIL_RX = /[a-z0-9._%+-]+\s*(?:@|＠|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*([a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\})\s*[a-z0-9-]+)+)/gi;

const emailDomain = d => d.toLowerCase().replace(/\s+/g, "").replace(/[([{]dot[)\]}]/g, ".");
function emailAllowed(m, domain, allow) {
  const dom = emailDomain(domain), addr = m.toLowerCase().replace(/\s+/g, "").replace(/[([{]at[)\]}]|＠/g, "@").replace(/[([{]dot[)\]}]/g, ".");
  return allow.emails.has(addr) || [...allow.domains].some(a => dom === a || dom.endsWith("." + a));
}
/* contact data in a piece of public text → [{kind:"phone"|"email", value}] (allowed contacts are not reported) */
export function findContacts(text, allow = allowList()) {
  const s = asciiDigits(text), out = [], seen = new Set();
  const add = (kind, value) => { const k = kind === "phone" ? "p|" + phoneKey(value) : "e|" + value.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ kind, value: value.trim() }); } };
  for (const rx of [MOBILE_RX, LAND_RX]) for (const m of s.matchAll(rx)) if (!allow.phones.has(phoneKey(m[0]))) add("phone", m[0]);
  for (const m of s.matchAll(WORD_RX)) if (!allow.phones.has(phoneKey(m[1]))) add("phone", m[1]);
  for (const m of s.matchAll(LINK_RX)) if (!allow.phones.has(phoneKey(m[0]))) add("phone", m[0]);
  for (const m of s.matchAll(EMAIL_RX)) if (!emailAllowed(m[0], m[1], allow)) add("email", m[0]);
  return out;
}
const PHONE_KEYS = /^(telephone|faxnumber|phone|mobile|whatsapp)$/i, EMAIL_KEYS = /^email$/i;
/* contact data anywhere in a JSON-LD value → [{kind, value, key}] */
export function findJsonLdContacts(j, allow = allowList()) {
  const out = [];
  const walk = (v, key, depth) => {
    if (depth > 40) return;
    if (typeof v === "number") v = String(v);
    if (typeof v === "string") {
      if (PHONE_KEYS.test(key)) { if (v.trim() && !allow.phones.has(phoneKey(v))) out.push({ kind: "phone", value: v, key }); return; }
      if (EMAIL_KEYS.test(key)) { const e = v.trim().replace(/^mailto:/i, "").toLowerCase(), at = e.lastIndexOf("@"); if (e && !(allow.emails.has(e) || (at > 0 && emailAllowed(e, e.slice(at + 1), allow)))) out.push({ kind: "email", value: v, key }); return; }
      for (const c of findContacts(v, allow)) out.push({ ...c, key });
    } else if (Array.isArray(v)) for (const x of v) walk(x, key, depth + 1);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(j, "", 0);
  return out;
}
export const CONTACT_MSG = "لا يُسمح بأرقام الهاتف أو واتساب أو البريد الإلكتروني في الصفحات العامة؛ التواصل عبر نموذج «اطلب عرض سعر» فقط / phone numbers, WhatsApp numbers and e-mail addresses are not allowed on public pages (contact goes through the RFQ form)";
