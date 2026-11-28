/* E-mail center — Control Center «البريد» (docs/janna/ACC-CONTRACT.md §3.4, §6). The ONE delivery path of every e-mail the Worker sends.
   - Provider order (deliver): (a) Control Center config — mail.enabled = "1" + a key (the encrypted D1 slot mail.<provider>.api_key, which
     takes precedence, else the Worker secret RESEND_API_KEY / BREVO_API_KEY) → Resend or Brevo API; (b) env.RESEND_API_KEY → Resend;
     (c) the SEND_EMAIL binding (Cloudflare Email Service, last fallback); (d) nothing → {sent:false, provider:"", error:"email not configured"}.
     mail.enabled = "0" (the seed) means "Control Center settings off": the Worker sends exactly as before the e-mail center (b → c → d).
     SMTP cannot run on Workers, so it is not offered.
   - Sender (Control Center enabled): from = mail.from_email (on madeinegyptgate.com, default noreply@), the generic display name
     «منصة صنع في مصر» → mail.from_name (specific names such as «جنة — …», «باسم — …», «<company> via Made in Egypt Gate» are kept),
     Reply-To = the caller's value, else mail.reply_to (default info@madeinegyptgate.com). Member-authored deal e-mails are never altered.
   - Template registry (TEMPLATES): every e-mail the Worker sends today (by id prefix) + the new ones (rendered by renderTemplate()).
     Admin overrides (table cc_mail_templates): on/off for optional templates, subject/intro/outro AR/EN, full body for the new templates.
   - Delivery log (cc_mail_log): one row per attempt — hashed + masked recipient, masked subject (sign-in codes ••••••), provider id,
     status, error; never a body. 24 h dedupe by message id. Retention 180 days (emailCron).
   - Outbox (0015 mail_outbox, owner 2026-11-28): every SENT message with its recipient address, template and masked subject, kept 3 days,
     read only by the owner's daily report to the platform's own mailbox (daily-mail.js); msg.company (optional) names the recipient.
   Hooks (integrator, §10.3 P-W2/P-W3/P-W4): common.js mail() → prepareMail(); advisor.js sendEmail() → deliver(); meetings.js → attachOk().
   Imports ONLY ./crypto.js: common.js and advisor.js import this module (importing them back would be a load-time cycle), so the few
   helpers below are local copies. Fail open: without the 0006 tables there are no overrides, no log and no Control Center config.

   Admin API (acc.js router → handleEmailAdmin(req, env, ctx, adm); every write audit-logged BEFORE it is applied):
   GET    /api/admin/cc/email/config                 email.read       provider, sender, key {source, tail, set_at, readable}, ready, effective
   PUT    /api/admin/cc/email/config                 email.config     {enabled, provider, from_email, from_name, reply_to, api_key ("" = keep), clear_key?}
   POST   /api/admin/cc/email/test                   email.test       {to, template?, lang?} → to the admin's own / the platform's mailboxes, 10/hour
   GET    /api/admin/cc/email/templates[/:key]       email.read       registry + overrides + 30-day counts
   PUT    /api/admin/cc/email/templates/:key         email.templates  {enabled?, subject_*, intro_*, outro_*, body_*}
   DELETE /api/admin/cc/email/templates/:key         email.templates  back to the defaults
   POST   /api/admin/cc/email/preview                email.read       {key, lang, overrides?} → {subject, text, html} with ‹var› placeholders
   GET    /api/admin/cc/email/log                    email.read       ?template=&status=&to=<exact address>&from=&to_date=&before=&limit=
   GET    /api/admin/cc/email/stats                  email.read       ?days=30 → per day / template / provider
   GET    /api/admin/cc/email/status                 email.read       effective provider, key source, last check
   POST   /api/admin/cc/email/status/check           email.config     read-only provider call (Resend GET /domains, Brevo GET /v3/account) */
import { getSecret, putSecret, secretInfo, configSecretOk, maskTail } from "./crypto.js";

export const DOMAIN = "madeinegyptgate.com";
const SITE = "https://madeinegyptgate.com/";
const DEFAULT_FROM = "noreply@madeinegyptgate.com";
const BRAND_NAME = "منصة صنع في مصر"; // common.js BRAND.name — the generic display name
export const MAIL_DEFAULTS = Object.freeze({ enabled: false, provider: "resend", from_email: DEFAULT_FROM, from_name: BRAND_NAME, reply_to: "info@madeinegyptgate.com" });
export const PROVIDERS = Object.freeze([
  Object.freeze({ key: "resend", label: "Resend", key_prefix: "re_", env: "RESEND_API_KEY", slot: "mail.resend.api_key" }),
  Object.freeze({ key: "brevo", label: "Brevo API", key_prefix: "xkeysib-", env: "BREVO_API_KEY", slot: "mail.brevo.api_key" }),
]);
const PROV = Object.fromEntries(PROVIDERS.map(p => [p.key, p]));
export const EMAIL_LISTS = Object.freeze(["digest", "updates", "incoming", "bassem", "daily", "teaser"]); // = common.js EMAIL_LISTS (asserted by the tests)
const LIM = { req: 64 * 1024, subject: 200, intro: 2000, body: 6000, name: 80, logSubject: 120, logError: 300, msgId: 200, testPerHour: 10, checkPerHour: 20, logDays: 180, memoMs: 60000, dedupMs: 24 * 3600e3, page: 200 };
const TEXT_FIELDS = ["subject_ar", "subject_en", "intro_ar", "intro_en", "outro_ar", "outro_en", "body_ar", "body_en"];

/* ---------- local copies of small helpers (no import of common.js / advisor.js — see the header) ---------- */
const enc = new TextEncoder();
const nowIso = () => new Date().toISOString();
const iso = ms => new Date(ms).toISOString();
const scalar = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const astr = (v, max) => scalar(v).replace(/\u0000/g, "").trim().slice(0, max);                                    // advisor.js str()
const clean = (v, max) => scalar(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max); // common.js str()
const line = (v, max) => clean(v, max * 2).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
const isEmail = e => typeof e === "string" && e.length <= 254 && EMAIL_RE.test(e);                                     // advisor.js isEmail
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jparse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
const secretOf = env => (env && (env.AUTH_SECRET || env.ADVISOR_SECRET)) || "";
const site = env => { const u = String((env && env.SITE_URL) || SITE); return /^https:\/\/[^\s"<>]+\/$/.test(u) ? u : SITE; };
const b64url = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }; // meetings.js b64
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
const RID = "23456789abcdefghjkmnpqrstuvwxyz";
const rid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => RID[b % RID.length]).join("");
const truthy = v => v === true || v === 1 || v === "1" || v === "true" || v === "on" || v === "yes";
/* ACC-CONTRACT §0.4 neutral(): admin text can never become markup, an attribute break-out or a JS string break-out */
const neutral = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "ˋ").trim();
const neutralText = (s, max) => neutral(String(s == null ? "" : s).replace(/\r\n?/g, "\n")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").slice(0, max).trim();
/* advisor.js parseFrom(): "Display Name <address>" or a bare address; invalid → the default sender */
const DEFAULT_SENDER = Object.freeze({ email: DEFAULT_FROM, name: BRAND_NAME });
function parseFrom(v, fallback = DEFAULT_SENDER) {
  const s = String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, 320);
  const m = s.match(/^"?([^"<>]*?)"?\s*<([^<>\s]+)>$/);
  const email = (m ? m[2] : s).trim().toLowerCase(), name = m ? m[1].replace(/["\\]/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 80) : "";
  return isEmail(email) ? { email, name: name || fallback.name } : { email: fallback.email, name: fallback.name };
}
/* "Name <addr>" for the From header; a name with RFC 5322 specials (, ; : . @ ( ) …) is quoted — verbatim copy of advisor.js fmtFrom */
export const fmtFrom = f => { const n = String((f && f.name) || "").replace(/["\\\r\n]/g, "").trim(); return n ? `${/[()<>\[\]:;@\\,."]/.test(n) ? `"${n}"` : n} <${f.email}>` : f.email; };
/* common.js linkify(): only the platform's own links become clickable */
function linkify(text, env) {
  const own = [site(env), SITE];
  return esc(text).replace(/(https:\/\/[^\s<]+)/g, u => (own.some(o => u.startsWith(esc(o))) ? `<a href="${u}">${u}</a>` : u)).replace(/\r?\n/g, "<br>");
}
const paras = (...xs) => xs.map(x => String(x == null ? "" : x).trim()).filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
const fromOk = e => isEmail(e) && e.slice(e.lastIndexOf("@") + 1) === DOMAIN;
const cleanName = v => line(v, LIM.name).replace(/["<>\\]/g, "").replace(/\s{2,}/g, " ").trim();
const dbOf = env => (env && env.DB && typeof env.DB.prepare === "function" ? env.DB : null);
/* common.js rateOk() (same table `rl`, same fixed windows) */
async function rateOk(env, key, limit, windowSec, nowMs = Date.now()) {
  const win = Math.floor(nowMs / 1000 / windowSec), k = key + "|" + win;
  await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(k, iso((win + 1) * windowSec * 1000)).run();
  const n = await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(k).first("n");
  return (n || 0) <= limit;
}
/* Cairo wall clock (Africa/Cairo, EET/EEST) — for the log's date filters and the per-day stats */
function cairoOffsetMin(ms) {
  const p = {}; for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}
const cairoStartIso = day => { const naive = Date.parse(day + "T00:00:00Z"); return iso(naive - cairoOffsetMin(naive - 2 * 3600e3) * 60000); };
const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- HTTP (ACC-CONTRACT §0.3: credentialed CORS only for the site origins / CC_ORIGINS; own copy, no cross-area import) ---------- */
const SITE_ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
function ccCors(req, env) {
  const o = req.headers.get("Origin") || "", extra = String((env && env.CC_ORIGINS) || "").split(",").map(s => s.trim()).filter(Boolean);
  return o && (SITE_ORIGINS.includes(o) || extra.includes(o)) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "86400" } : {};
}
const ccJson = (req, env, body, status = 200, extra) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env), ...(extra || {}) } });
const ccErr = (req, env, status, code, msg, extra) => ccJson(req, env, { error: msg || code, code, ...(extra || {}) }, status);
const ccPreflight = (req, env) => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
async function readBody(req) {
  const t = await req.text();
  if (t.length > LIM.req) return { tooLarge: true };
  if (!t) return {};
  try { const o = JSON.parse(t); return o && typeof o === "object" && !Array.isArray(o) ? o : { bad: true }; } catch (e) { return { bad: true }; }
}

/* ---------- template registry (§6.1) ----------
   via: "mail"   composed by common.js mail() → prepareMail() applies on/off + subject/intro/outro (vars derived from the message)
        "send"   composed by advisor.js / meetings.js and sent straight through sendEmail() → deliver() applies on/off + subject/intro/outro
        "render" the new templates: renderTemplate() renders defaults + overrides (+ full body) and the caller sends them through mail()
   required: cannot be switched off. can_off: false also for meeting_summary (the meetings cron retries a summary that was not sent).
   prefixes: the message id prefixes of the code (a test greps worker/src/*.js and fails on an id literal without a row).
   must: variables a body override has to keep (the link or number the e-mail exists for). */
const KIND_AR = { contact: "رسالة تواصل", rfq: "طلب عرض سعر", basket: "طلب سلة منتجات", opp_offer: "عرض على فرصة", lead_interest: "اهتمام بفرصة", project_interest: "اهتمام بمشروع", entity_contact: "تواصل مع جهة", signup: "طلب اشتراك", profile_fix: "تصحيح بيانات" }; // inquiries.js
const KIND_EN = { contact: "Message", rfq: "Request for quotation", basket: "Product basket request", opp_offer: "Offer on an opportunity", lead_interest: "Interest in an opportunity", project_interest: "Interest in a project", entity_contact: "Contact an entity", signup: "Membership application", profile_fix: "Data correction" };
const WHAT = { reply: ["رد جديد", "new reply"], quote: ["عرض سعر", "quote"], declined: ["اعتذار مصنع", "a factory declined"], rematched: ["وصل لمصنع جديد", "reached a new factory"], closed: ["اتقفل الطلب", "request closed"], declined_all: ["كل المصانع اعتذرت", "all factories declined"], in_progress: ["جاري معالجة طلبك", "being worked on"] };
export const TEMPLATE_GROUPS = Object.freeze({ auth: ["الدخول والحساب", "Sign-in & account"], requests: ["الطلبات", "Requests"], team: ["إشعارات الفريق", "Team notices"], digest: ["المتابعات والتنبيهات", "Follows & reminders"], bassem: ["باسم والمستشار", "Bassem & the advisor"], meetings: ["اجتماعات جنة", "Janna meetings"], billing: ["الفواتير والدفع", "Invoices & payments"], approvals: ["الموافقات", "Approvals"], system: ["النظام", "System"] });
const T = o => {
  const t = { list: "", required: false, can_off: true, via: "mail", vars: ["subject"], must: [], body_editable: false, overridable: true, prefixes: [], why_ar: "", why_en: "", sample_ar: "", sample_en: "", ...o };
  if (t.required) t.can_off = false;
  if (t.via === "render") { t.body_editable = true; t.prefixes = [...t.prefixes, t.key + "-"]; } // acc.js sendTpl ids are "<key>-<tail>"
  return Object.freeze(t);
};
export const TEMPLATES = Object.freeze([
  // ---- sign-in & account ----
  T({ key: "auth_code", group: "auth", to: "user", required: true, prefixes: ["code-"], name_ar: "كود الدخول", name_en: "Sign-in code",
    about_ar: "الكود (6 أرقام) اللي بيوصل لما حد يدخل بالإيميل — صالح دقايق ولمرة واحدة.", about_en: "The 6-digit code sent when someone signs in with their e-mail (valid a few minutes, single use).",
    sample_ar: "كود الدخول: ‹code›", sample_en: "Your sign-in code: ‹code›" }),
  T({ key: "wa_consent_notice", group: "auth", to: "member", required: true, prefixes: ["wa-on-"], name_ar: "تنبيه تفعيل الواتساب", name_en: "WhatsApp turned on notice",
    about_ar: "رسالة أمان لما رسايل الواتساب تتفعّل أو الرقم يتغيّر، ومعاها رابط إيقاف فوري.", about_en: "Security notice when WhatsApp messages are turned on or the number changes, with a one-click stop link.",
    sample_ar: "تم تفعيل رسائل الواتساب على حسابك / WhatsApp messages turned on", sample_en: "تم تفعيل رسائل الواتساب على حسابك / WhatsApp messages turned on" }),
  T({ key: "advisor_login_link", group: "auth", to: "member", required: true, via: "send", prefixes: ["l-"], name_ar: "رابط دخول المستشار", name_en: "Advisor sign-in link",
    about_ar: "رابط دخول المستشار الذكي للصفقات (تفعيل أو دخول) لأعضاء باقات الشركاء.", about_en: "The AI Deal Advisor activation / sign-in link for partner plans.",
    sample_ar: "رابط الدخول / Your sign-in link — AI Deal Advisor", sample_en: "رابط الدخول / Your sign-in link — AI Deal Advisor" }),
  T({ key: "member_invite", group: "auth", to: "member", via: "render", prefixes: ["invite-"], vars: ["name", "company", "login_url"], must: ["login_url"], name_ar: "دعوة دخول عضو", name_en: "Member invitation",
    about_ar: "بيتبعت لما الأدمن يضغط «ابعت دعوة دخول» لعضو.", about_en: "Sent when an admin clicks «send a sign-in invitation» for a member.",
    subject_ar: "حسابك على منصة صنع في مصر جاهز", subject_en: "Your Made in Egypt Gate account is ready",
    body_ar: "أهلاً {{name}}، حساب {{company}} على منصة صنع في مصر جاهز. ادخل بكود على الإيميل من غير باسورد: {{login_url}}",
    body_en: "Hello {{name}}, the {{company}} account on Made in Egypt Gate is ready. Sign in with a code sent to your e-mail, no password needed: {{login_url}}",
    why_ar: "وصلتك لأن فريق المنصة جهّز حساب لشركتك", why_en: "The platform team set up an account for your company." }),
  T({ key: "legacy_login_notice", group: "auth", to: "member", required: true, via: "render", prefixes: ["legacy-"], vars: ["when", "stop_url"], must: ["stop_url"], name_ar: "تنبيه دخول بالباسورد القديم", name_en: "Old-password sign-in notice",
    about_ar: "تنبيه أمان بعد كل دخول بالباسورد القديم، ومعاه رابط «مش انت؟» اللي بيقفل الطريقة دي فوراً.", about_en: "Security notice after every sign-in with the old password, with a «not you?» link that turns it off at once.",
    subject_ar: "تنبيه أمان: دخول بالباسورد القديم", subject_en: "Security notice: sign-in with your old password",
    body_ar: "حد دخل على حسابك بالباسورد القديم يوم {{when}}. لو مش انت اضغط هنا وهنقفل الدخول بالباسورد القديم فوراً: {{stop_url}}",
    body_en: "Someone signed in to your account with the old password on {{when}}. If it was not you, open this link and we will turn off old-password sign-in at once: {{stop_url}}",
    why_ar: "تنبيه أمان لحسابك", why_en: "A security notice for your account." }),
  T({ key: "staff_added", group: "auth", to: "staff", required: true, via: "render", prefixes: ["staff-"], vars: ["role", "login_url"], must: ["login_url"], name_ar: "إضافة لفريق الإدارة", name_en: "Added to the admin team",
    about_ar: "بيوصل لأي حد يتضاف لفريق لوحة الإدارة.", about_en: "Sent to anyone added to the admin panel team.",
    subject_ar: "اتضافت لفريق إدارة منصة صنع في مصر", subject_en: "You were added to the Made in Egypt Gate admin team",
    body_ar: "اتضافت كـ{{role}} في لوحة إدارة منصة صنع في مصر. ادخل بكود على الإيميل: {{login_url}}",
    body_en: "You were added as {{role}} to the Made in Egypt Gate admin panel. Sign in with a code sent to your e-mail: {{login_url}}",
    why_ar: "وصلتك لأن إدارة المنصة ضافتك للفريق", why_en: "The platform's management added you to the team." }),
  // ---- requests ----
  T({ key: "inquiry_receipt", group: "requests", to: "buyer", required: true, prefixes: ["rcpt-"], vars: ["subject", "ref", "kind"], name_ar: "تأكيد استلام الطلب", name_en: "Request receipt",
    about_ar: "بيوصل للمشتري بعد ما يبعت طلب: رقم الطلب، وصل لكام مصنع، ورابط التتبع.", about_en: "Sent to the buyer after a request: the reference, how many factories it reached and the tracking link.",
    sample_ar: "تم الاستلام: ‹kind› ‹ref›", sample_en: "Received: ‹kind› ‹ref›" }),
  T({ key: "inquiry_to_factory", group: "requests", to: "member", list: "incoming", required: true, prefixes: ["route-"], vars: ["subject", "ref", "about"], name_ar: "طلب جديد للمصنع", name_en: "New request to a factory",
    about_ar: "الطلب اللي بيتبعت تلقائياً للمصنع المسجّل المطابق، ومعاه رابط الرد ولوحة التحكم.", about_en: "The request routed automatically to a matching registered factory, with the answer link and the dashboard link.",
    sample_ar: "طلب جديد من منصة صنع في مصر: ‹about› (‹ref›)", sample_en: "طلب جديد من منصة صنع في مصر: ‹about› (‹ref›)" }),
  /* teasers.js (owner 2026-11-28): a directory factory that is NOT a member, at its OFFICIAL company address only — the title, sector,
     region and closing date of the request + the registration link; never the buyer, a contact, a quantity or a value. One per request
     per address, a daily cap, a stop link (list «teaser»), behind the owner's switch request_teasers */
  T({ key: "request_teaser", group: "requests", to: "third_party", list: "teaser", prefixes: ["teaser-"], vars: ["subject", "ref"], name_ar: "دعوة مصنع غير مسجّل لطلب جديد", name_en: "New-request invitation to an unregistered factory",
    about_ar: "عنوان الطلب والقطاع والمنطقة وآخر موعد بس، ورابط التسجيل بالباقة المناسبة — بيروح لإيميل الشركة الرسمي لمصنع في الدليل مش مسجّل (مرة واحدة لكل طلب، بحد يومي، ومعاه رابط إيقاف).",
    about_en: "Only the request's title, sector, region and closing date, with the registration link for the right plan — to the official company address of a directory factory that is not registered (once per request, daily cap, stop link).",
    sample_ar: "طلب جديد في مجالكم على منصة صنع في مصر: ‹title› / A new request in your field", sample_en: "طلب جديد في مجالكم على منصة صنع في مصر: ‹title› / A new request in your field" }),
  T({ key: "inquiry_update", group: "requests", to: "buyer", list: "updates", required: true, prefixes: ["upd-"], vars: ["subject", "ref", "what"], name_ar: "تحديثات الطلب للمشتري", name_en: "Request updates to the buyer",
    about_ar: "رد أو عرض سعر أو اعتذار أو تغيير حالة على طلب المشتري.", about_en: "A reply, quote, decline or status change on the buyer's request.",
    sample_ar: "رد جديد على طلبك ‹ref›", sample_en: "New reply: ‹ref›" }),
  T({ key: "buyer_message_to_factory", group: "requests", to: "member", list: "incoming", required: true, prefixes: ["bmsg-"], vars: ["subject", "ref"], name_ar: "رسالة المشتري للمصنع", name_en: "Buyer message to a factory",
    about_ar: "رسالة المشتري لمصنع وصله الطلب (العناوين بتفضل مخفية).", about_en: "The buyer's message to a factory that received the request (addresses stay private).",
    sample_ar: "رسالة من المشتري على الطلب ‹ref› / Buyer message", sample_en: "رسالة من المشتري على الطلب ‹ref› / Buyer message" }),
  T({ key: "factory_reminder", group: "requests", to: "member", list: "incoming", prefixes: ["remind-"], vars: ["subject", "ref"], name_ar: "تذكير المصنع بالرد", name_en: "Factory reminder",
    about_ar: "تذكير واحد بس بعد 48 ساعة لو المصنع ماردّش على الطلب.", about_en: "One single reminder after 48 h when a factory has not answered.",
    sample_ar: "تذكير: طلب ‹ref› لسه مستني ردك / Reminder", sample_en: "تذكير: طلب ‹ref› لسه مستني ردك / Reminder" }),
  T({ key: "team_reply", group: "requests", to: "buyer", required: true, prefixes: ["teamreply-"], vars: ["subject", "ref"], name_ar: "رد فريق المنصة على المشتري", name_en: "Team answer to the buyer",
    about_ar: "رد الإدارة على المشتري من زرار «إحنا اللي هنرد».", about_en: "The team's answer to the buyer from the «we will answer» button.",
    sample_ar: "رد على طلبك ‹ref› — منصة صنع في مصر", sample_en: "Answer on your request ‹ref› — Made in Egypt Gate" }),
  // ---- team notices ----
  T({ key: "team_inquiry_notice", group: "team", to: "team", prefixes: ["team-"], vars: ["subject", "ref", "kind", "status"], name_ar: "نسخة متابعة للفريق", name_en: "Monitoring copy to the team",
    about_ar: "نسخة للمتابعة بس لكل طلب جديد — مفيش إجراء مطلوب (TEAM_EMAIL).", about_en: "A monitoring copy of every new request — no action needed (TEAM_EMAIL).",
    sample_ar: "[متابعة] ‹kind› ‹ref› — ‹status› (‹n›)", sample_en: "[متابعة] ‹kind› ‹ref› — ‹status› (‹n›)" }),
  T({ key: "team_needs_alert", group: "team", to: "team", required: true, prefixes: ["teamneed-"], vars: ["subject", "ref", "kind"], name_ar: "طلب محتاج رد الإدارة", name_en: "Request needs the team",
    about_ar: "طلب مفيش له مصنع مسجّل مطابق — فيه المرشّحين ورابط لوحة الإدارة (TEAM_EMAIL + ADMIN_EMAILS).", about_en: "A request with no registered match — candidates and the console link (TEAM_EMAIL + ADMIN_EMAILS).",
    sample_ar: "[مطلوب رد الإدارة] ‹kind› ‹ref›: ‹about› — مفيش مصنع مسجّل مطابق", sample_en: "[مطلوب رد الإدارة] ‹kind› ‹ref›: ‹about› — مفيش مصنع مسجّل مطابق" }),
  T({ key: "team_mood_flag", group: "team", to: "team", prefixes: ["wamood-"], name_ar: "تنبيه مزاج عضو", name_en: "Member mood flag",
    about_ar: "عضو كتب على الواتساب إنه مش في أحسن حال (للمتابعة، الرد التلقائي اتبعت).", about_en: "A member wrote on WhatsApp that they are not well (FYI; the automatic answer went out).",
    sample_ar: "[متابعة] عضو قال إنه مش في أحسن حال / Member mood flag", sample_en: "[متابعة] عضو قال إنه مش في أحسن حال / Member mood flag" }),
  T({ key: "team_meeting_booked", group: "team", to: "team", via: "send", prefixes: ["mt-"], name_ar: "إشعار الفريق: اجتماع جديد", name_en: "Team: meeting booked",
    about_ar: "اجتماع تعريفي جديد اتحجز مع جنة.", about_en: "A new introductory meeting was booked with Janna.", sample_ar: "اجتماع جديد — ‹name›", sample_en: "اجتماع جديد — ‹name›" }),
  T({ key: "team_meeting_summary", group: "team", to: "team", via: "send", prefixes: ["mf-"], name_ar: "إشعار الفريق: ملخص اجتماع", name_en: "Team: meeting summary",
    about_ar: "ملخص اجتماع تعريفي خلص مع جنة.", about_en: "The summary of a finished introductory meeting with Janna.", sample_ar: "ملخص اجتماع — ‹name›", sample_en: "ملخص اجتماع — ‹name›" }),
  // the daily calls report (calls-report.js): built and sent by the Worker itself (via "send"), with the CSV attachment
  T({ key: "team_calls_report", group: "team", to: "team", via: "send", prefixes: ["callrep-"], name_ar: "تقرير مكالمات جنة وباسم اليومي", name_en: "Daily Janna & Bassem calls report",
    about_ar: "كل صباح: مكالمات جنة وباسم في اليوم اللي فات وتقييمها التلقائي — لمستلمي التقرير اللي المالك حددهم بس («🛠️ المطوّر» ← «تقرير المكالمات»؛ الافتراضي إيميلات المنصة). فيه بيانات أشخاص محجوبة.",
    about_en: "Every morning: yesterday's Janna and Bassem calls and their automatic rating — only to the report recipients the owner set («🛠️ Developer» → «Calls report»; default: the platform's own mailboxes). It holds masked personal data.",
    sample_ar: "تقرير مكالمات جنة وباسم — ‹day›: ‹n› مكالمة", sample_en: "Calls report ‹day›: ‹n› calls" }),
  // «حماية الموقع» (guard.js): the hourly summary of copy attempts — counts, types, pages, browsers; no IP, no personal data
  T({ key: "team_site_guard", group: "team", to: "team", via: "send", prefixes: ["guard-"], name_ar: "تنبيه محاولات نسخ الموقع", name_en: "Site guard: copy attempts",
    about_ar: "ملخص كل ساعة (لو فيه محاولات بس): حد جرّب يحفظ الصفحة أو يفتح الكود أو أدوات المطوّر، أو فتح صفحات كتير في دقايق، أو استعمل أداة نسخ — العدد والنوع والصفحات وعدد الزوار، من غير IP. لمستلمي تقرير المكالمات.",
    about_en: "An hourly summary (only when there were attempts): someone tried to save a page, open its source or the developer tools, opened very many pages in minutes or used a copying tool — counts, types, pages and visitors, no IP. To the calls report's recipients.",
    sample_ar: "تنبيه حماية الموقع: ‹n› محاولة نسخ — ‹day› ‹time›", sample_en: "Site guard: ‹n› copy attempts" }),
  /* daily-mail.js + info-alerts.js (owner 2026-11-28): the platform's own mailbox (TEAM_EMAIL) — the only place recipient addresses appear */
  T({ key: "owner_daily_report", group: "team", to: "team", prefixes: ["ownrep-"], name_ar: "تقرير المالك اليومي", name_en: "Owner's daily report",
    about_ar: "كل يوم بعد نص الليل: اللي اتنشر على المنصة في اليوم اللي فات (عدد وعناوين لكل قسم) وكل إيميل المنصة بعته (الشركة والإيميل واتبعتله إيه) — لإيميل المنصة بس.",
    about_en: "Every night after midnight: what was published on the platform the day before (counts and titles per section) and every e-mail the platform sent (company, address, what) — to the platform's own mailbox only.",
    sample_ar: "تقرير المنصة اليومي — ‹day›", sample_en: "تقرير المنصة اليومي — ‹day› / Daily platform report" }),
  T({ key: "team_unsub_alert", group: "team", to: "team", prefixes: ["unsubalert-"], name_ar: "تنبيه: عضو وقّف الإيميلات", name_en: "Alert: a member stopped e-mails",
    about_ar: "فوراً لما عضو يدوس رابط الإيقاف (التقرير اليومي أو أي نوع تاني): الشركة والإيميل والنوع والوقت. الإيقاف بيوقف الإيميلات بس — مفيش حذف حساب ولا بيانات.",
    about_en: "At once when a member uses a stop link (the daily report or another kind): company, address, kind and time. Stopping only stops the e-mails — no account or data is deleted.",
    sample_ar: "[تنبيه] ‹company› وقّف ‹list›", sample_en: "[تنبيه] ‹company› وقّف ‹list› / stopped e-mails" }),
  T({ key: "team_register_help", group: "team", to: "team", required: true, prefixes: ["reghelp-"], name_ar: "تنبيه: حد عايز يسجّل ومعرفش", name_en: "Alert: someone could not register",
    about_ar: "فوراً لما حد يقول لجنة أو باسم إنه كان عايز يسجّل ومقدرش: قال إيه، بيانات التواصل اللي ادّاها، والوقت.",
    about_en: "At once when someone tells Janna or Bassem they wanted to register but could not: what they said, the contact they gave, and the time.",
    sample_ar: "[تنبيه] حد عايز يسجّل ومعرفش — ‹agent›", sample_en: "[تنبيه] حد عايز يسجّل ومعرفش — ‹agent› / could not register" }),
  // ---- follows & reminders ----
  T({ key: "follow_digest", group: "digest", to: "member", list: "digest", prefixes: ["digest-"], name_ar: "ملخص المتابعات اليومي", name_en: "Daily follows digest",
    about_ar: "العناصر الجديدة اللي تطابق متابعات العضو (مرة في اليوم).", about_en: "New items matching the member's follows (once a day).",
    sample_ar: "جديد متابعاتك اليوم (‹n›) / Your follows today", sample_en: "جديد متابعاتك اليوم (‹n›) / Your follows today" }),
  /* daily-mail.js (owner 2026-11-28): 10:00 Cairo, every registered member — the new opportunities / news matching him (within his plan) and
     his own activity; nothing to report → no e-mail. Partner plans get it as Bassem's report with the PDF (partner_daily_report) */
  T({ key: "member_daily_report", group: "digest", to: "member", list: "daily", prefixes: ["mday-"], name_ar: "التقرير اليومي للعضو (10 الصبح)", name_en: "Member's daily report (10:00)",
    about_ar: "الساعة 10 الصبح بتوقيت القاهرة: الفرص والأخبار الجديدة اللي تطابق منتجات العضو وقطاعه ومنطقته (في حدود باقته)، والطلبات اللي وصلته واللي لسه مستنية رده. مفيش جديد = مفيش إيميل.",
    about_en: "10:00 Cairo time: the new opportunities and news matching the member's products, sector and region (within his plan), and the requests he received and those still waiting for his answer. Nothing new = no e-mail.",
    sample_ar: "تقريرك اليومي من منصة صنع في مصر — ‹n› جديد / Your daily report", sample_en: "تقريرك اليومي من منصة صنع في مصر — ‹n› جديد / Your daily report" }),
  T({ key: "deadline_reminder", group: "digest", to: "member", list: "digest", prefixes: ["dl-"], name_ar: "تذكير بآخر موعد", name_en: "Deadline reminder",
    about_ar: "تذكير قبل آخر موعد بـ7 أيام وبيوم لعنصر بيتابعه العضو.", about_en: "A reminder 7 days and 1 day before the deadline of a followed item.",
    sample_ar: "باقي 7 أيام على آخر موعد / 7 days to the deadline: ‹title›", sample_en: "باقي 7 أيام على آخر موعد / 7 days to the deadline: ‹title›" }),
  // ---- Bassem & the advisor ----
  T({ key: "bassem_morning_email", group: "bassem", to: "member", list: "bassem", prefixes: ["bm-"], name_ar: "صباح الخير من باسم (إيميل)", name_en: "Bassem's morning e-mail",
    about_ar: "رسالة باسم اليومية لباقات الشركاء — بالإيميل لحد ما الواتساب يشتغل.", about_en: "Bassem's daily note for partner plans — by e-mail until WhatsApp is live.",
    sample_ar: "صباح الخير يا ‹name› ☀️ — باسم من منصة صنع في مصر / Good morning from Bassem", sample_en: "صباح الخير يا ‹name› ☀️ — باسم من منصة صنع في مصر / Good morning from Bassem" }),
  T({ key: "partner_daily_report", group: "bassem", to: "member", list: "daily", prefixes: ["pday-"], name_ar: "تقرير باسم اليومي (PDF)", name_en: "Bassem's daily report (PDF)",
    about_ar: "لأعضاء باقات الشركاء، الساعة 10 الصبح: التقرير اليومي ومعاه ملف PDF بكل التفاصيل — الفرص، الطلبات المطابقة، الأخبار، ونشاط حسابه.",
    about_en: "For partner plans, at 10:00: the daily report with a PDF holding every detail — opportunities, matching requests, news and the account's activity.",
    sample_ar: "تقرير باسم اليومي — ‹day› / Bassem's daily report", sample_en: "تقرير باسم اليومي — ‹day› / Bassem's daily report" }),
  T({ key: "bassem_call_email", group: "bassem", to: "member", list: "bassem", prefixes: ["bc-"], name_ar: "باسم جاهز للمكالمة (إيميل)", name_en: "Bassem call link e-mail",
    about_ar: "رابط مكالمة الفيديو مع باسم في الميعاد اللي العضو اختاره.", about_en: "The video call link with Bassem at the time the member chose.",
    sample_ar: "أنا جاهز يا ‹name› 👋 — نتكلم فيديو؟ / Bassem is ready for your call", sample_en: "أنا جاهز يا ‹name› 👋 — نتكلم فيديو؟ / Bassem is ready for your call" }),
  T({ key: "bassem_note", group: "bassem", to: "member", via: "send", prefixes: ["nt-"], name_ar: "رسالة من باسم", name_en: "A note from Bassem",
    about_ar: "رسالة باسم للعضو من المستشار (بموافقة العضو).", about_en: "Bassem's note to the member from the advisor (with the member's consent).",
    sample_ar: "رسالة من باسم / A note from Bassem", sample_en: "رسالة من باسم / A note from Bassem" }),
  /* «بحث وكتابة عميقة» (research.js mailJob): the finished document to the signed-in member's OWN address, once per job (id rdoc-<job>);
     no source, no outside link, deadlines as dates only */
  T({ key: "research_doc", group: "bassem", to: "member", via: "send", prefixes: ["rdoc-"], name_ar: "مستند من جنة أو باسم", name_en: "A document from Janna or Bassem",
    about_ar: "المستند اللي العضو طلبه في مكالمته (بحث، خطة تصدير، عرض سعر …) على إيميله هو بس.", about_en: "The document a member asked for in a call (research, an export plan, a quotation …), to his own e-mail only.",
    sample_ar: "مستند: ‹title›", sample_en: "Document: ‹title›" }),
  T({ key: "advisor_reply_notice", group: "bassem", to: "member", via: "send", prefixes: ["n-"], name_ar: "إشعار رد على صفقة", name_en: "Deal reply notice",
    about_ar: "نسخة للعضو لما جهة ترد على إيميل صفقة (لما استقبال الردود يكون شغال).", about_en: "A copy to the member when a party answers a deal e-mail (when inbound replies are on).",
    sample_ar: "رد جديد / New reply: ‹subject›", sample_en: "رد جديد / New reply: ‹subject›" }),
  T({ key: "deal_email", group: "bassem", to: "third_party", required: true, via: "send", overridable: false, vars: [], name_ar: "إيميلات الصفقات (من العضو)", name_en: "Deal e-mails (member-authored)",
    about_ar: "الإيميلات اللي العضو بيبعتها من المستشار للجهات — مابتتغيرش أبداً، بتتسجّل في سجل الإرسال بس.", about_en: "E-mails the member sends to other parties from the advisor — never altered, only logged.",
    sample_ar: "‹subject›", sample_en: "‹subject›" }),
  // ---- Janna meetings ----
  T({ key: "meeting_confirmation", group: "meetings", to: "visitor", required: true, via: "send", prefixes: ["mc-"], name_ar: "تأكيد اجتماع جنة", name_en: "Janna meeting confirmation",
    about_ar: "تأكيد الاجتماع التعريفي مع جنة، ومعاه دعوة التقويم (meeting.ics).", about_en: "Confirmation of the introductory meeting with Janna, with the calendar invitation (meeting.ics).",
    sample_ar: "تأكيد اجتماعك مع جنة — منصة صنع في مصر", sample_en: "Your meeting with Janna — Made in Egypt Gate" }),
  T({ key: "meeting_cancelled", group: "meetings", to: "visitor", required: true, via: "send", prefixes: ["mx-"], name_ar: "إلغاء اجتماع جنة", name_en: "Janna meeting cancelled",
    about_ar: "تأكيد إن الزائر لغى الاجتماع.", about_en: "Confirms that the visitor cancelled the meeting.", sample_ar: "اتلغى اجتماعك مع جنة", sample_en: "Your meeting with Janna is cancelled" }),
  T({ key: "meeting_reminder", group: "meetings", to: "visitor", via: "send", prefixes: ["mr24h-", "mr1h-", "mr24-", "mr1-"], name_ar: "تذكير اجتماع جنة", name_en: "Janna meeting reminder",
    about_ar: "تذكير قبل الاجتماع بيوم وبساعة.", about_en: "Reminders a day and an hour before the meeting.", sample_ar: "تذكير: اجتماعك مع جنة", sample_en: "Reminder: your meeting with Janna" }),
  T({ key: "meeting_summary", group: "meetings", to: "visitor", via: "send", can_off: false, prefixes: ["ms-"], name_ar: "ملخص اجتماع جنة", name_en: "Janna meeting summary",
    about_ar: "ملخص الاجتماع (والتسجيل لو الزائر وافق). مش بيتقفل: نظام الاجتماعات بيعيد محاولة الملخص اللي ماتبعتش.", about_en: "The meeting summary (and the recording when the visitor agreed). Cannot be switched off: the meetings cron retries a summary that was not sent.",
    sample_ar: "ملخص اجتماعك مع جنة — منصة صنع في مصر", sample_en: "Your meeting with Janna — summary" }),
  // ---- invoices & payments (new) ----
  T({ key: "invoice_issued", group: "billing", to: "buyer", required: true, via: "render", prefixes: ["inv-"], vars: ["invoice_no", "plan_name", "total", "currency", "pay_url", "gateway_text", "manual_text", "company", "invoice_details_text"], must: ["total", "gateway_text", "manual_text", "invoice_details_text"],
    name_ar: "فاتورة الاشتراك", name_en: "Subscription invoice", about_ar: "الفاتورة اللي بتتعمل تلقائياً مع طلب الاشتراك أو من الأدمن.", about_en: "The invoice issued automatically with a subscription request, or by an admin.",
    subject_ar: "فاتورة اشتراك {{plan_name}} رقم {{invoice_no}}", subject_en: "Subscription invoice {{invoice_no}}",
    body_ar: "أهلاً،\nدي فاتورة اشتراك {{company}} في {{plan_name}}: الإجمالي {{total}} {{currency}} (شامل ضريبة القيمة المضافة).\n{{gateway_text}}\n{{manual_text}}\n{{invoice_details_text}}",
    body_en: "Hello,\nThis is the subscription invoice of {{company}} for the {{plan_name}}: total {{total}} {{currency}} (VAT included).\n{{gateway_text}}\n{{manual_text}}\n{{invoice_details_text}}",
    why_ar: "وصلتك لأنك طلبت اشتراك على منصة صنع في مصر", why_en: "You asked for a subscription on Made in Egypt Gate." }),
  T({ key: "payment_link", group: "billing", to: "buyer", required: true, via: "render", prefixes: ["paylink-"], vars: ["invoice_no", "plan_name", "total", "pay_url"], must: ["pay_url"],
    name_ar: "رابط الدفع", name_en: "Payment link", about_ar: "بيتبعت مرة واحدة لكل فاتورة مفتوحة أول ما بوابة الدفع تشتغل.", about_en: "Sent once for every open invoice as soon as the payment gateway goes live.",
    subject_ar: "رابط دفع الفاتورة {{invoice_no}}", subject_en: "Payment link for invoice {{invoice_no}}",
    body_ar: "بوابة الدفع اشتغلت ✓ تقدر تدفع فاتورة {{invoice_no}} ({{total}} جنيه) من هنا: {{pay_url}}",
    body_en: "Online payment is live ✓ You can pay invoice {{invoice_no}} ({{total}} EGP) here: {{pay_url}}",
    why_ar: "وصلتك لأن عندك فاتورة مفتوحة على المنصة", why_en: "You have an open invoice on the platform." }),
  T({ key: "payment_received", group: "billing", to: "member", required: true, via: "render", prefixes: ["paid-"], vars: ["invoice_no", "plan_name", "total", "plan_until", "dashboard_url", "invoice_details_text"], must: ["invoice_no", "invoice_details_text"],
    name_ar: "إيصال الدفع", name_en: "Payment receipt", about_ar: "تأكيد الدفع وتفعيل الباقة.", about_en: "Confirms the payment and the plan activation.",
    subject_ar: "استلمنا الدفع — الفاتورة {{invoice_no}}", subject_en: "Payment received — invoice {{invoice_no}}",
    body_ar: "استلمنا دفع الفاتورة {{invoice_no}} ({{total}} جنيه شامل الضريبة) واتفعّلت {{plan_name}} لحد {{plan_until}}. لوحتك: {{dashboard_url}}\n{{invoice_details_text}}",
    body_en: "We received the payment of invoice {{invoice_no}} (EGP {{total}} VAT included); your {{plan_name}} is active until {{plan_until}}. Your dashboard: {{dashboard_url}}\n{{invoice_details_text}}",
    why_ar: "إيصال دفع من منصة صنع في مصر", why_en: "A payment receipt from Made in Egypt Gate." }),
  T({ key: "payment_review", group: "billing", to: "member", required: true, via: "render", prefixes: ["paidrv-"], vars: ["invoice_no", "plan_name", "total", "review_text", "dashboard_url", "invoice_details_text"], must: ["invoice_no", "review_text", "invoice_details_text"],
    name_ar: "إيصال دفع (قيد المراجعة)", name_en: "Payment receipt (under review)", about_ar: "الدفع وصل بس الباقة ماتفعّلتش دلوقتي (عنده باقة أعلى سارية أو الحساب موقوف): بتتفعّل تلقائياً بعدين.", about_en: "The payment arrived but the plan could not start now (a higher plan is in force, or the account is suspended): it starts automatically later.",
    subject_ar: "استلمنا الدفع — الفاتورة {{invoice_no}} (قيد المراجعة)", subject_en: "Payment received — invoice {{invoice_no}} (under review)",
    body_ar: "استلمنا دفع الفاتورة {{invoice_no}} ({{plan_name}}، {{total}} جنيه شامل الضريبة) ✓ {{review_text}} لوحتك: {{dashboard_url}}\n{{invoice_details_text}}",
    body_en: "We received the payment of invoice {{invoice_no}} ({{plan_name}}, EGP {{total}} VAT included) ✓ {{review_text}} Your dashboard: {{dashboard_url}}\n{{invoice_details_text}}",
    why_ar: "إيصال دفع من منصة صنع في مصر", why_en: "A payment receipt from Made in Egypt Gate." }),
  T({ key: "payment_failed", group: "billing", to: "buyer", via: "render", prefixes: ["payfail-"], vars: ["invoice_no", "pay_url"], must: ["pay_url"],
    name_ar: "الدفع ماتمّش", name_en: "Payment not completed", about_ar: "لما محاولة دفع أونلاين ماتنجحش.", about_en: "When an online payment attempt does not go through.",
    subject_ar: "الدفع ماتمّش — الفاتورة {{invoice_no}}", subject_en: "Payment not completed — invoice {{invoice_no}}",
    body_ar: "محاولة دفع الفاتورة {{invoice_no}} ماتمّتش. تقدر تحاول تاني من هنا: {{pay_url}}",
    body_en: "The payment attempt for invoice {{invoice_no}} did not go through. You can try again here: {{pay_url}}",
    why_ar: "وصلتك لأن عندك فاتورة مفتوحة على المنصة", why_en: "You have an open invoice on the platform." }),
  T({ key: "renewal_reminder", group: "billing", to: "member", list: "updates", via: "render", prefixes: ["renew-"], vars: ["plan_name", "plan_until", "days_left", "invoice_no", "pay_url"], must: ["pay_url"],
    name_ar: "تذكير التجديد", name_en: "Renewal reminder", about_ar: "قبل انتهاء الاشتراك بـ30 يوم وبـ7 أيام، ومعاه فاتورة التجديد.", about_en: "30 and 7 days before the subscription ends, with the renewal invoice.",
    subject_ar: "اشتراكك في {{plan_name}} بينتهي يوم {{plan_until}}", subject_en: "Your {{plan_name}} ends on {{plan_until}}",
    body_ar: "اشتراكك في {{plan_name}} بينتهي يوم {{plan_until}} (فاضل {{days_left}} يوم). فاتورة التجديد {{invoice_no}}: {{pay_url}}",
    body_en: "Your subscription to the {{plan_name}} ends on {{plan_until}} ({{days_left}} days left). Renewal invoice {{invoice_no}}: {{pay_url}}",
    why_ar: "تذكير بتجديد اشتراكك", why_en: "A reminder to renew your subscription." }),
  // ---- approvals (new) ----
  T({ key: "product_approved", group: "approvals", to: "member", list: "updates", via: "render", prefixes: ["prod-ok-", "prodok-"], vars: ["product", "url"],
    name_ar: "اتوافق على منتج", name_en: "Product approved", about_ar: "منتج العضو اتوافق عليه واتنشر في السوق.", about_en: "The member's product was approved and published in the marketplace.",
    subject_ar: "اتوافق على منتجك: {{product}}", subject_en: "Your product was approved: {{product}}",
    body_ar: "اتوافق على منتجك «{{product}}» وهيظهر في سوق المنصة خلال دقيقتين تقريباً: {{url}}",
    body_en: "Your product “{{product}}” was approved and appears in the marketplace within about two minutes: {{url}}",
    why_ar: "تحديث على منتج بعته على المنصة", why_en: "An update on a product you submitted." }),
  T({ key: "product_rejected", group: "approvals", to: "member", list: "updates", via: "render", prefixes: ["prod-no-", "prodno-"], vars: ["product", "reason", "url"], must: ["reason"],
    name_ar: "ماتوافقش على منتج", name_en: "Product not approved", about_ar: "منتج العضو ماتوافقش عليه، ومعاه السبب.", about_en: "The member's product was not approved, with the reason.",
    subject_ar: "ماتوافقش على منتجك: {{product}}", subject_en: "Your product was not approved: {{product}}",
    body_ar: "ماتوافقش على منتجك «{{product}}» — السبب: {{reason}}. تقدر تعدّل وتبعت تاني من لوحتك: {{url}}",
    body_en: "Your product “{{product}}” was not approved — reason: {{reason}}. You can edit it and send it again from your dashboard: {{url}}",
    why_ar: "تحديث على منتج بعته على المنصة", why_en: "An update on a product you submitted." }),
  T({ key: "company_approved", group: "approvals", to: "member", list: "updates", via: "render", prefixes: ["comp-ok-", "compok-"], vars: ["company", "url"],
    name_ar: "اتوافق على طلب ملف الشركة", name_en: "Company request approved", about_ar: "طلب تعديل/ربط/إضافة ملف الشركة اتوافق عليه.", about_en: "The company profile edit / claim / create request was approved.",
    subject_ar: "اتوافق على طلب ملف شركتك", subject_en: "Your company profile request was approved",
    body_ar: "اتوافق على طلب ملف الشركة «{{company}}»، والتعديلات هتظهر على الموقع خلال دقيقتين تقريباً: {{url}}",
    body_en: "Your request for the company profile “{{company}}” was approved; the changes appear on the site within about two minutes: {{url}}",
    why_ar: "تحديث على طلب ملف شركتك", why_en: "An update on your company profile request." }),
  T({ key: "company_rejected", group: "approvals", to: "member", list: "updates", via: "render", prefixes: ["comp-no-", "compno-"], vars: ["company", "reason", "url"], must: ["reason"],
    name_ar: "ماتوافقش على طلب ملف الشركة", name_en: "Company request not approved", about_ar: "طلب ملف الشركة ماتوافقش عليه، ومعاه السبب.", about_en: "The company profile request was not approved, with the reason.",
    subject_ar: "ماتوافقش على طلب ملف شركتك", subject_en: "Your company profile request was not approved",
    body_ar: "ماتوافقش على طلب ملف الشركة «{{company}}» — السبب: {{reason}}. تقدر تعدّل وتبعت تاني من لوحتك: {{url}}",
    body_en: "Your request for the company profile “{{company}}” was not approved — reason: {{reason}}. You can edit it and send it again from your dashboard: {{url}}",
    why_ar: "تحديث على طلب ملف شركتك", why_en: "An update on your company profile request." }),
  // ---- system ----
  T({ key: "test_email", group: "system", to: "admin", required: true, via: "render", prefixes: ["test-"], vars: [], name_ar: "رسالة تجريبية", name_en: "Test message",
    about_ar: "الرسالة التجريبية من قسم البريد في لوحة الإدارة.", about_en: "The test message from the e-mail section of the admin panel.",
    subject_ar: "رسالة تجريبية من لوحة الإدارة", subject_en: "Test message from the admin panel",
    body_ar: "رسالة تجريبية من لوحة الإدارة — الإرسال شغال ✓", body_en: "A test message from the admin panel — sending works ✓",
    why_ar: "رسالة تجريبية طلبها أدمن المنصة", why_en: "A test message requested by a platform admin." }),
  T({ key: "other", group: "system", to: "", required: true, via: "send", overridable: false, vars: [], name_ar: "رسائل أخرى", name_en: "Other messages",
    about_ar: "أي رسالة رقمها مش في السجل (لازم تتضاف هنا قبل ما تتبعت).", about_en: "Any message whose id is not in the registry (it should be added here).", sample_ar: "‹subject›", sample_en: "‹subject›" }),
]);
const BY_KEY = Object.fromEntries(TEMPLATES.map(t => [t.key, t]));
const PREFIXES = TEMPLATES.flatMap(t => t.prefixes.map(p => [p, t.key])).sort((a, b) => b[0].length - a[0].length);

/* the template of a message: explicit msg.tpl → deal e-mails (header X-MIG-Deal) → id prefix → "other" */
export function templateKeyOf(msg) {
  if (!msg || typeof msg !== "object") return "other";
  if (typeof msg.tpl === "string" && BY_KEY[msg.tpl]) return msg.tpl;
  const h = msg.headers;
  if (h && typeof h === "object" && (typeof h.get === "function" ? h.get("X-MIG-Deal") : h["X-MIG-Deal"] || h["x-mig-deal"])) return "deal_email";
  const id = scalar(msg.id);
  for (const [p, k] of PREFIXES) if (id.startsWith(p)) return k;
  return "other";
}

/* ---------- configuration (cc_settings scope 'mail' + the encrypted key slots) ---------- */
const CFG = new WeakMap(); // env.DB → {at, base}  (module caches are keyed by env.DB: the tests run many envs in one process)
const OVR = new WeakMap(); // env.DB → {at, map}
const NO_OVR = new Map();
async function loadBase(env) {
  const db = dbOf(env); if (!db) return null;
  let rows;
  try { rows = (await db.prepare("SELECT k, v FROM cc_settings WHERE scope = 'mail'").all()).results || []; } catch (e) { return null; } // no 0006 tables
  if (!rows.length) return null;
  const s = {}; for (const r of rows) s[r.k] = r.v;
  const provider = PROV[s["mail.provider"]] ? s["mail.provider"] : "resend";
  const fe = line(s["mail.from_email"], 254).toLowerCase(), rt = line(s["mail.reply_to"], 254).toLowerCase();
  const base = { enabled: s["mail.enabled"] === "1", provider, from_email: fromOk(fe) ? fe : DEFAULT_FROM, from_name: cleanName(s["mail.from_name"]) || MAIL_DEFAULTS.from_name,
    reply_to: "mail.reply_to" in s ? (isEmail(rt) ? rt : "") : MAIL_DEFAULTS.reply_to, cc_key: "", cc_state: "none", last_check: jparse(s["mail.last_check"] || "null", null) };
  try { const v = await getSecret(env, PROV[provider].slot); if (v) { base.cc_key = v; base.cc_state = "ok"; } else if (v === null) base.cc_state = "unreadable"; }
  catch (e) { base.cc_state = e && e.code === "config_secret_missing" ? "unreadable" : "none"; }
  return base;
}
function resolve(env, base) {
  if (!base) return null;
  const p = PROV[base.provider];
  let key = base.cc_key, source = key ? "control_center" : "none";
  if (!key && env && typeof env[p.env] === "string" && env[p.env]) { key = env[p.env]; source = "worker_secret"; }
  return { ...base, key, source, ready: !!(base.enabled && key) };
}
/* → null (no Control Center mail settings: the 0006 tables are missing) or {ready, enabled, provider, key, source, from_email, from_name,
   reply_to, cc_state, last_check}. Memo per env.DB for 60 s; never throws (acc.js ccBoot calls it on every request / cron / email()). */
export async function loadMailConfig(env, { fresh = false } = {}) {
  const db = dbOf(env); if (!db) return null;
  const hit = CFG.get(db);
  if (!fresh && hit && Date.now() - hit.at < LIM.memoMs) return resolve(env, hit.base);
  let base = null; try { base = await loadBase(env); } catch (e) { base = null; }
  CFG.set(db, { at: Date.now(), base });
  return resolve(env, base);
}
const cfgNow = env => { const db = dbOf(env), hit = db && CFG.get(db); return hit ? resolve(env, hit.base) : null; }; // sync: the last loaded config
function route(env, cfg) {
  if (cfg && cfg.ready) return { provider: cfg.provider, key: cfg.key, source: cfg.source };
  if (env && env.RESEND_API_KEY) return { provider: "resend", key: env.RESEND_API_KEY, source: "worker_secret" };
  if (env && env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function") return { provider: "cloudflare", key: "", source: "binding" };
  return { provider: "", key: "", source: "none" };
}
/* sync — common.js emailOn / advisor.js emailConfigured after the hooks: some way to send exists */
export const mailReady = env => !!(env && ((cfgNow(env) || {}).ready || env.RESEND_API_KEY || (env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function")));
/* sync — the provider deliver() would use supports real attachments (Resend, Brevo); the binding path inlines them (meetings.js) */
export const attachOk = env => { const p = route(env, cfgNow(env)).provider; return p === "resend" || p === "brevo"; };
/* sync — which of the two would carry them ("resend" | "brevo" | ""): the «ابعتلي» e-mail sizes its official files by it (notify-items.js) */
export const attachProvider = env => { const p = route(env, cfgNow(env)).provider; return p === "resend" || p === "brevo" ? p : ""; };
const forget = env => { const db = dbOf(env); if (db) { CFG.delete(db); OVR.delete(db); } };
/* drop this isolate's memo after writing mail.* settings or cc_mail_templates directly (acc.js import of the old mail config) */
export const forgetMailCache = env => forget(env);

async function overrideMap(env) {
  const db = dbOf(env); if (!db) return NO_OVR;
  const hit = OVR.get(db);
  if (hit && Date.now() - hit.at < LIM.memoMs) return hit.map;
  let map = NO_OVR;
  try { const { results } = await db.prepare("SELECT * FROM cc_mail_templates").all(); map = new Map((results || []).map(r => [r.key, r])); } catch (e) { map = NO_OVR; }
  OVR.set(db, { at: Date.now(), map });
  return map;
}

/* ---------- rendering ---------- */
const VAR_RX = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const fill = (s, get) => String(s == null ? "" : s).replace(VAR_RX, (m0, n) => scalar(get(n.toLowerCase())));
function varsIn(s) { const out = new Set(); for (const m of String(s == null ? "" : s).matchAll(/\{\{([^{}]*)\}\}/g)) out.add(/^\s*[A-Za-z][A-Za-z0-9_]*\s*$/.test(m[1]) ? m[1].trim().toLowerCase() : m[1]); return [...out]; }
const tidy = s => String(s).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const langOrder = L => (L === "en" ? ["en", "ar"] : ["ar", "en"]);
/* {name: {ar, en}} — a var may be a string/number, or {ar, en} for language-specific values; control characters are dropped */
function prepVars(t, vars) {
  const v = vars && typeof vars === "object" ? vars : {}, out = {};
  const two = (x, max) => { if (x && typeof x === "object" && !Array.isArray(x)) { const a = clean(x.ar != null ? x.ar : x.en, max), e = clean(x.en != null ? x.en : x.ar, max); return { ar: a, en: e }; } const s = clean(x, max); return { ar: s, en: s }; };
  for (const n of t.vars) if (v[n] != null) out[n] = two(v[n], /_text$/.test(n) ? 3000 : 500);
  if (t.vars.includes("currency") && !out.currency) out.currency = { ar: "جنيه", en: "EGP" }; // the platform invoices in EGP only (§0.3)
  const no = out.invoice_no ? out.invoice_no : { ar: "", en: "" }, pu = out.pay_url ? out.pay_url.ar : "";
  if (t.vars.includes("gateway_text") && !out.gateway_text) {
    const ready = v.pay_ready === true || v.gateway_ready === true || v.ready === true;
    out.gateway_text = ready && pu ? { ar: `ادفع أونلاين من صفحة الدفع الآمنة: ${pu}`, en: `Pay online on the secure payment page: ${pu}` }
      : { ar: "بوابة الدفع الإلكتروني لسه بتتجهّز — أول ما تشتغل هيوصلك رابط الدفع تلقائياً على الإيميل ده، ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.",
        en: "Online payment is still being set up — as soon as it works, the payment link reaches this e-mail automatically, and we will never ask for card details on our pages." };
  }
  if (t.vars.includes("manual_text") && !out.manual_text) {
    const man = v.manual && typeof v.manual === "object" ? v.manual : { ar: typeof v.manual === "string" ? v.manual : "" };
    const mar = clean(v.manual_ar != null ? v.manual_ar : man.ar, 1500), men = clean(v.manual_en != null ? v.manual_en : man.en, 1500) || mar;
    out.manual_text = mar || men ? { ar: `${mar || men}\nاكتب رقم الفاتورة ${no.ar} في بيان التحويل.`, en: `${men}\nWrite the invoice number ${no.en} in the transfer reference.` } : { ar: "", en: "" };
  }
  return out;
}
function renderParts(t, o, L, get) {
  const sub = lg => line(fill((o && o["subject_" + lg]) || t["subject_" + lg], n => get(n, lg)), LIM.subject);
  const body = lg => tidy(paras(fill(o && o["intro_" + lg], n => get(n, lg)), fill((o && t.body_editable && o["body_" + lg]) || t["body_" + lg], n => get(n, lg)), fill(o && o["outro_" + lg], n => get(n, lg))));
  return { subject: line(langOrder(L).map(sub).filter(Boolean).join(" / "), LIM.subject), ar: body("ar"), en: body("en") };
}
/* the new templates (★): defaults + admin overrides, vars filled (escaped later by mail()). The result is spread into common.js mail():
   mail(env, {id: r.id_prefix + <your id>, to, ...r}) — tpl + __rendered tell prepareMail() it is already rendered. */
export async function renderTemplate(env, key, { lang = "ar", vars = {} } = {}) {
  const t = BY_KEY[key];
  if (!t || t.via !== "render") { const e = new Error("unknown template: " + key); e.code = "unknown_template"; throw e; }
  const L = lang === "en" ? "en" : "ar", o = (await overrideMap(env)).get(key) || null, V = prepVars(t, vars);
  const r = renderParts(t, o, L, (n, lg) => (V[n] ? V[n][lg] : ""));
  return { tpl: key, __rendered: key, id_prefix: t.prefixes[0] || "", lang: L, subject: r.subject, ar: r.ar, en: r.en, ...(t.list ? { list: t.list } : {}),
    why: `${t.why_ar} / ${t.why_en}`, enabled: !(o && o.enabled === 0 && t.can_off) };
}

/* vars of a code-composed message (for {{…}} in its overrides), derived from the fixed subject / id formats of the code — per language */
const REF_IN = /\bMIG-\d{2}-[2-9A-HJKMNP-TV-Z]{6}\b/;
const KIND_LABELS = Object.keys(KIND_AR).flatMap(k => [[KIND_AR[k], k], [KIND_EN[k], k]]).sort((a, b) => b[0].length - a[0].length);
function deriveVars(t, m) {
  const subj = line(m.subject, LIM.subject), all = [m.subject, m.ar, m.en, m.text].map(scalar).join("\n"), v = { subject: [subj, subj] };
  if (t.vars.includes("ref")) { const r = (all.match(REF_IN) || [""])[0]; v.ref = [r, r]; }
  if (t.vars.includes("kind")) { let k = ""; for (const src of [subj, all]) { const hit = KIND_LABELS.find(([lab]) => src.includes(lab)); if (hit) { k = hit[1]; break; } } v.kind = k ? [KIND_AR[k], KIND_EN[k]] : ["", ""]; }
  if (t.vars.includes("about")) { const a = (subj.match(/^طلب جديد من منصة صنع في مصر: (.+) \(MIG-[^()]+\)$/) || [])[1] || ""; v.about = [a, a]; }
  if (t.vars.includes("what")) { const w = scalar(m.id).split("-")[2] || ""; v.what = WHAT[w] ? WHAT[w] : [w, w]; }
  if (t.vars.includes("status")) { const s = (subj.match(/ — ([a-z_]+) \(\d+\)$/) || [])[1] || ""; v.status = [s, s]; }
  return v;
}
const getter = (v, L) => n => (v[n] ? v[n][L === "en" ? 1 : 0] : "");
const hasText = o => !!o && TEXT_FIELDS.some(f => o[f]);

/* common.js mail() hook (P-W2): m = the mail() input {id, to, subject, ar, en, lang, list, why, tpl?}. Returns m itself when nothing applies;
   a switched-off optional template → {...m, __skip: "template_off"} (mail() returns {sent:false, skipped}); never throws. */
export async function prepareMail(env, m) {
  try {
    if (!m || typeof m !== "object") return m;
    const key = templateKeyOf(m), t = BY_KEY[key];
    if (!t || !t.overridable) return m;
    const o = (await overrideMap(env)).get(key);
    if (!o) return m;
    if (o.enabled === 0 && t.can_off) {
      const tos = Array.isArray(m.to) ? m.to : [m.to];
      await logRow(env, { msg_id: m.id, template: key, list: m.list, to: tos[0], more: tos.length - 1, subject: m.subject, provider: "", status: "skipped", error: "template_off", ms: 0 }, { once: true });
      return { ...m, __skip: "template_off" };
    }
    // renderTemplate() already applied the overrides; a ★ template composed by hand cannot take them (its vars are not in the message)
    if (m.__rendered === key || t.via === "render" || !hasText(o)) return m;
    const L = m.lang === "en" ? "en" : "ar", v = deriveVars(t, m);
    let out = null;
    const subj = line(langOrder(L).map(lg => (o["subject_" + lg] ? line(fill(o["subject_" + lg], getter(v, lg)), LIM.subject) : "")).filter(Boolean).join(" / "), LIM.subject);
    if (subj) (out = out || { ...m }).subject = subj;
    for (const lg of ["ar", "en"]) {
      const intro = o["intro_" + lg], outro = o["outro_" + lg];
      if ((intro || outro) && typeof m[lg] === "string") (out = out || { ...m })[lg] = paras(fill(intro, getter(v, lg)), m[lg], fill(outro, getter(v, lg)));
    }
    return out || m;
  } catch (e) { return m; }
}
/* the same overrides for messages composed outside mail() (advisor.js, meetings.js): text and html get the intro / outro blocks */
function sendOverrides(env, m, t, o) {
  const subj0 = scalar(m.subject), first = /[\u0600-\u06FF]/.test(subj0) || !subj0 ? "ar" : "en", order = langOrder(first), v = deriveVars(t, m);
  const subject = line(order.map(lg => (o["subject_" + lg] ? line(fill(o["subject_" + lg], getter(v, lg)), LIM.subject) : "")).filter(Boolean).join(" / "), LIM.subject);
  const part = f => order.map(lg => fill(o[f + "_" + lg], getter(v, lg)).trim()).filter(Boolean).join("\n\n");
  const intro = part("intro"), outro = part("outro");
  if (!subject && !intro && !outro) return m;
  const out = { ...m };
  if (subject) out.subject = subject;
  if (intro || outro) {
    const block = s => `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.8;color:#222;margin:12px 0">${linkify(s, env)}</div>`;
    if (typeof m.text === "string") out.text = paras(intro, m.text, outro);
    if (typeof m.html === "string" && m.html) out.html = (intro ? block(intro) : "") + m.html + (outro ? block(outro) : "");
  }
  return out;
}

/* ---------- delivery (advisor.js sendEmail → deliver, P-W3) ---------- */
const attList = msg => (Array.isArray(msg.attachments) ? msg.attachments : []).filter(a => a && a.filename);
/* an attachment's base64: a binary file arrives as {b64} (the «ابعتلي» official file, notify-items.js); a text one as {content} */
const attContent = a => (typeof a.b64 === "string" ? a.b64 : b64(enc.encode(a.content)));
async function viaResend(key, msg) { // byte-for-byte the advisor.js request (+ attachments as in meetings.js) — existing tests compare it
  const cc = msg.cc && msg.cc.length ? msg.cc : undefined, atts = attList(msg);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(msg.id ? { "Idempotency-Key": msg.id } : {}) },
      body: JSON.stringify({ from: fmtFrom(msg.from), to: msg.to, cc, reply_to: msg.replyTo || undefined, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers || undefined,
        attachments: atts.length ? atts.map(a => ({ filename: a.filename, content: attContent(a), content_type: a.type })) : undefined }),
    });
    let j = {}; try { j = (await r.json()) || {}; } catch (e) { /* empty body */ }
    if (!r.ok) return { sent: false, provider: "resend", error: `resend ${r.status}: ${astr(j.message || j.name || r.statusText, 200)}` };
    return { sent: true, provider: "resend", id: astr(j.id, 100) };
  } catch (e) { return { sent: false, provider: "resend", error: "resend: " + astr(e && e.message, 200) }; }
}
/* Brevo transactional API. No idempotency key is sent (Brevo wants a UUID and answers a reused one with an error): the 24 h msg_id dedupe of
   deliver() covers it. Header values must be ASCII (non-ASCII ones are dropped). */
async function viaBrevo(key, msg) {
  const rcpt = a => (Array.isArray(a) ? a : a ? [a] : []).filter(x => typeof x === "string" && x).map(email => ({ email })), atts = attList(msg), f = msg.from || {};
  const hdr = {}; if (msg.headers && typeof msg.headers === "object") for (const [k, v] of Object.entries(msg.headers)) if (/^[A-Za-z0-9-]{1,64}$/.test(k) && /^[\x20-\x7e]{1,900}$/.test(scalar(v))) hdr[k] = scalar(v);
  const body = { sender: { ...(f.name ? { name: line(f.name, 120) } : {}), email: f.email }, to: rcpt(msg.to), ...(msg.cc && msg.cc.length ? { cc: rcpt(msg.cc) } : {}),
    ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}), subject: msg.subject, ...(msg.html ? { htmlContent: msg.html } : {}), ...(msg.text ? { textContent: msg.text } : {}),
    ...(Object.keys(hdr).length ? { headers: hdr } : {}), ...(atts.length ? { attachment: atts.map(a => ({ name: a.filename, content: attContent(a) })) } : {}) };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    let j = {}; try { j = (await r.json()) || {}; } catch (e) { /* empty body */ }
    if (!r.ok) return { sent: false, provider: "brevo", error: `brevo ${r.status}: ${astr(j.message || j.code || r.statusText, 200)}` };
    return { sent: true, provider: "brevo", id: astr(j.messageId || (Array.isArray(j.messageIds) ? j.messageIds[0] : ""), 200) };
  } catch (e) { return { sent: false, provider: "brevo", error: "brevo: " + astr(e && e.message, 200) }; }
}
async function viaBinding(env, msg) { // exactly the existing advisor.js SEND_EMAIL call
  const cc = msg.cc && msg.cc.length ? msg.cc : undefined;
  try {
    const res = await env.SEND_EMAIL.send({ from: msg.from, to: msg.to, ...(cc ? { cc } : {}), ...(msg.replyTo ? { replyTo: msg.replyTo } : {}), subject: msg.subject, text: msg.text, html: msg.html, ...(msg.headers ? { headers: msg.headers } : {}) });
    return { sent: true, provider: "cloudflare", id: astr(res && res.messageId, 200) };
  } catch (e) { return { sent: false, provider: "cloudflare", error: "cloudflare: " + astr(((e && e.code) ? e.code + " " : "") + (e && e.message), 200) }; }
}
const genericNames = env => new Set([BRAND_NAME, parseFrom(env && env.MAIL_FROM).name, ...(env && env.NOTIFY_FROM ? [parseFrom(env.NOTIFY_FROM).name] : [])]);
function applySender(env, m, cfg) {
  const f = m.from && typeof m.from === "object" ? m.from : {}, n = scalar(f.name).trim();
  const from = { email: cfg.from_email, name: !n || genericNames(env).has(n) ? cfg.from_name : f.name };
  const replyTo = m.replyTo || cfg.reply_to || undefined;
  return from.email === f.email && from.name === f.name && replyTo === m.replyTo ? m : { ...m, from, replyTo };
}
const listOf = msg => { if (EMAIL_LISTS.includes(msg.list)) return msg.list; const u = msg.headers && typeof msg.headers === "object" ? scalar(msg.headers["List-Unsubscribe"]) : ""; const l = (u.match(/[?&]l=([a-z]+)/) || [])[1]; return EMAIL_LISTS.includes(l) ? l : ""; };
async function sentBefore(env, id, t0) {
  const db = dbOf(env); if (!db) return null;
  try { return await db.prepare("SELECT provider, provider_id FROM cc_mail_log WHERE msg_id = ? AND status = 'sent' AND at >= ? ORDER BY id DESC LIMIT 1").bind(line(id, LIM.msgId), iso(t0 - LIM.dedupMs)).first(); }
  catch (e) { return null; }
}
/* msg = the sendEmail shape {id, from:{email, name}, to:[…], cc?, replyTo?, subject, text, html, headers?, attachments?:[{filename, content, type,
   inline?} | {filename, type, b64}], requireAttachments?, tpl?, list?} → {sent, provider, id?, error?, skipped?, dedup?}. Never throws.
   requireAttachments: the attachments must really go — on a route that cannot carry them (the SEND_EMAIL binding) nothing is sent and
   the answer is {sent:false, provider, error:"attachments_unsupported"} (the «ابعتلي» e-mail then goes again without them, saying so). */
export async function deliver(env, msg) {
  const t0 = Date.now();
  msg = msg && typeof msg === "object" ? msg : {};
  let cfg = null; try { cfg = await loadMailConfig(env); } catch (e) { cfg = null; }
  const key = templateKeyOf(msg), t = BY_KEY[key];
  const tos = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean), more = Math.max(0, tos.length - 1) + (Array.isArray(msg.cc) ? msg.cc.length : 0);
  if (msg.id) { const d = await sentBefore(env, msg.id, t0); if (d) return { sent: true, provider: d.provider, id: d.provider_id, dedup: true }; }
  let m = msg;
  if (t.via === "send" && t.overridable) {
    const o = (await overrideMap(env)).get(key);
    if (o && o.enabled === 0 && t.can_off) {
      await logRow(env, { msg_id: msg.id, template: key, list: listOf(msg), to: tos[0], more, subject: msg.subject, provider: "", status: "skipped", error: "template_off", ms: 0 }, { once: true });
      return { sent: false, provider: "", skipped: "template_off", error: "template_off" };
    }
    if (hasText(o)) try { m = sendOverrides(env, m, t, o); } catch (e) { m = msg; }
  }
  if (cfg && cfg.enabled && key !== "deal_email") m = applySender(env, m, cfg);
  const r = route(env, cfg);
  if (m.requireAttachments && attList(m).length && r.provider && r.provider !== "resend" && r.provider !== "brevo") {
    await logRow(env, { msg_id: msg.id, template: key, list: listOf(msg), to: tos[0], more, subject: m.subject, provider: r.provider, status: "failed", error: "attachments_unsupported", ms: Date.now() - t0 });
    return { sent: false, provider: r.provider, error: "attachments_unsupported" };
  }
  if (r.provider !== "resend" && r.provider !== "brevo" && attList(m).length) { // no real attachments on this path: inline the text ones (as meetings.js does)
    let text = scalar(m.text), extra = "";
    for (const a of attList(m)) if (a.inline) { const blk = `\n\n———— ${a.filename} ————\n` + scalar(a.content).slice(0, 20000); text += blk; extra += blk; }
    m = { ...m, text, html: scalar(m.html) + (extra ? `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:14px;color:#222">${linkify(extra, env)}</div>` : ""), attachments: undefined };
  }
  let res;
  try { res = r.provider === "resend" ? await viaResend(r.key, m) : r.provider === "brevo" ? await viaBrevo(r.key, m) : r.provider === "cloudflare" ? await viaBinding(env, m) : { sent: false, provider: "", error: "email not configured" }; }
  catch (e) { res = { sent: false, provider: r.provider, error: (r.provider || "email") + ": " + astr(e && e.message, 200) }; }
  await logRow(env, { msg_id: msg.id, template: key, list: listOf(msg), to: tos[0], more, subject: m.subject, provider: res.provider || "", provider_id: res.id || "", status: res.sent ? "sent" : "failed", error: res.sent ? "" : res.error, ms: Date.now() - t0, company: msg.company });
  return res;
}

/* ---------- delivery log (cc_mail_log): no bodies, hashed + masked recipient, masked codes ---------- */
const toHash = async (env, addr) => (await hmac(secretOf(env) || "mig", "mail|" + addr)).slice(0, 32);
export const maskAddr = a => { const s = scalar(a).trim().toLowerCase(), at = s.lastIndexOf("@"); return at > 0 ? s[0] + "•••@" + s.slice(at + 1) : s ? "•••" : ""; };
export const maskSubject = s => line(s, 400).replace(/(?<![\w-])\d{6}(?![\w-])/g, "••••••").slice(0, LIM.logSubject);
const maskErr = s => line(s, 600).replace(/[^\s@<>()"',;:]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (x, d) => x[0] + "•••@" + d).slice(0, LIM.logError);
async function logRow(env, r, { once = false } = {}) {
  const db = dbOf(env); if (!db) return;
  try {
    const id = line(r.msg_id, LIM.msgId), to = line(r.to, 254).toLowerCase();
    if (once && id && await db.prepare("SELECT 1 AS x FROM cc_mail_log WHERE msg_id = ? AND status = ? AND at >= ?").bind(id, r.status, iso(Date.now() - LIM.dedupMs)).first("x")) return;
    await db.prepare("INSERT INTO cc_mail_log (at, msg_id, template, list, to_hash, to_masked, subject, provider, provider_id, status, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(nowIso(), id, line(r.template, 60), line(r.list, 20), to ? await toHash(env, to) : "", (maskAddr(to) + (r.more > 0 ? ` +${r.more}` : "")).slice(0, 120), maskSubject(r.subject),
        line(r.provider, 20), astr(r.provider_id, 200), r.status, maskErr(r.error), Math.max(0, Math.round(r.ms) || 0)).run();
  } catch (e) { /* a missing table never fails a send */ }
  if (r.status === "sent") await outboxRow(env, r);
}
/* 0015 mail_outbox: every e-mail that left, with its address, for the owner's daily report to the platform's own mailbox (daily-mail.js);
   kept OUTBOX_DAYS. The subject is masked as in cc_mail_log; no body. Without the table nothing is written. */
const OUTBOX_DAYS = 3;
async function outboxRow(env, r) {
  const db = dbOf(env), to = line(r.to, 254).toLowerCase(); if (!db || !to) return;
  try {
    const ms = Date.now(), day = iso(ms + cairoOffsetMin(ms) * 60000).slice(0, 10);
    await db.prepare("INSERT INTO mail_outbox (at, day, to_addr, more, company, template, subject) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(iso(ms), day, to, Math.max(0, Math.round(r.more) || 0), cleanName(r.company), line(r.template, 60), maskSubject(r.subject)).run();
  } catch (e) { /* no 0015 table: nothing kept */ }
}
/* cron (acc.js ccCron → CC.email.emailCron): retention 180 days */
export async function emailCron(env, nowMs = Date.now()) {
  const db = dbOf(env); if (!db) return { purged: 0 };
  try { await db.prepare("DELETE FROM mail_outbox WHERE at < ?").bind(iso(nowMs - OUTBOX_DAYS * 86400000)).run(); } catch (e) { /* no 0015 table */ }
  try { const r = await db.prepare("DELETE FROM cc_mail_log WHERE at < ?").bind(iso(nowMs - LIM.logDays * 86400000)).run(); return { purged: (r && r.meta && r.meta.changes) || 0 }; }
  catch (e) { return { purged: 0, error: "store_off" }; }
}

/* ---------- composition for previews and test sends: exactly what common.js mail() builds ---------- */
function composeMail(env, { subject, ar, en, lang, list, why }) {
  const first = lang === "en" ? en : ar, second = lang === "en" ? ar : en;
  let foot = "—\nمنصة صنع في مصر · Made in Egypt Gate · " + site(env);
  if (why) foot += "\n" + why;
  if (list) foot += "\nلإيقاف هذا النوع من الرسائل / Unsubscribe: ‹unsubscribe_url›";
  foot += "\nبياناتك محمية وفق قانون حماية البيانات الشخصية المصري 151/2020 · Your data is handled under Egypt's PDPL (Law 151/2020).";
  const text = `${first}\n\n—\n\n${second}\n\n${foot}`;
  const html = `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.8;color:#222"><div dir="${lang === "en" ? "ltr" : "rtl"}">${linkify(first, env)}</div><hr style="border:none;border-top:1px solid #ddd;margin:20px 0"><div dir="${lang === "en" ? "rtl" : "ltr"}">${linkify(second, env)}</div><div style="color:#777;font-size:12px;margin-top:24px">${linkify(foot, env)}</div></div>`;
  return { subject: line(subject, LIM.subject), text, html };
}
/* ‹var› placeholders everywhere — a preview never shows invented values */
function previewParts(env, t, o, L) {
  const ph = n => "‹" + n + "›";
  if (t.via === "render") return { ...renderParts(t, o, L, n => ph(n)), list: t.list, why: t.why_ar ? `${t.why_ar} / ${t.why_en}` : "" };
  const sample = { ar: t.sample_ar || "‹subject›", en: t.sample_en || t.sample_ar || "‹subject›" };
  const get = lg => n => (n === "subject" ? sample[lg] : ph(n));
  const subj = o ? langOrder(L).map(lg => (o["subject_" + lg] ? line(fill(o["subject_" + lg], get(lg)), LIM.subject) : "")).filter(Boolean).join(" / ") : "";
  const body = lg => paras(o && fill(o["intro_" + lg], get(lg)), lg === "ar" ? `‹نص الرسالة بيكتبه النظام تلقائياً: ${t.about_ar}›` : `‹message body written by the platform: ${t.about_en}›`, o && fill(o["outro_" + lg], get(lg)));
  return { subject: line(subj || sample[L], LIM.subject), ar: body("ar"), en: body("en"), list: t.list, why: "" };
}
async function previewOf(env, t, L, draft) {
  const saved = (await overrideMap(env)).get(t.key) || null, o = draft ? { ...(saved || {}), ...draft } : saved, p = previewParts(env, t, o, L);
  if (t.via === "send") { // composed outside mail(): no platform footer; text + html as advisor.js / meetings.js build them
    const order = langOrder(L), text = order.map(lg => p[lg]).join("\n\n—\n\n");
    return { subject: p.subject, text, html: `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.8;color:#222">${linkify(text, env)}</div>`, ar: p.ar, en: p.en };
  }
  return { ...composeMail(env, { ...p, lang: L }), ar: p.ar, en: p.en };
}

/* ---------- admin API ---------- */
const OWNER_ONLY = new Set(["email.config"]);
function deny(req, env, adm, p) {
  if (adm.can(p)) return null;
  return OWNER_ONLY.has(p) ? ccErr(req, env, 403, "owner_only", "owner only", { need: p }) : ccErr(req, env, 403, "forbidden", "forbidden", { need: p });
}
async function audited(adm, action, type, id, before, after, summary) {
  try { const r = await adm.audit(action, type, id, before, after, summary); return r !== false && !(r && typeof r === "object" && r.ok === false); } catch (e) { return false; }
}
const auditFail = (req, env) => ccErr(req, env, 500, "audit_failed", "the change was not saved because the audit log could not be written");
const actorEmail = adm => line((adm.member && adm.member.email) || "", 254).toLowerCase();
const actorId = adm => line((adm.member && adm.member.id) || adm.role || "platform", 120);
const EFFECT = {
  "resend|control_center": ["الإرسال شغال عن طريق Resend بالمفتاح المحفوظ في لوحة التحكم (مشفّر).", "Sending through Resend with the key saved in the Control Center (encrypted)."],
  "resend|worker_secret": ["الإرسال شغال عن طريق Resend بالمفتاح المحفوظ في إعدادات السيرفر (Worker secret).", "Sending through Resend with the key stored as a Worker secret."],
  "brevo|control_center": ["الإرسال شغال عن طريق Brevo API بالمفتاح المحفوظ في لوحة التحكم (مشفّر).", "Sending through the Brevo API with the key saved in the Control Center (encrypted)."],
  "brevo|worker_secret": ["الإرسال شغال عن طريق Brevo API بالمفتاح المحفوظ في إعدادات السيرفر (Worker secret).", "Sending through the Brevo API with the key stored as a Worker secret."],
  "cloudflare|binding": ["الإرسال شغال عن طريق Cloudflare Email Service (الطريقة الاحتياطية).", "Sending through the Cloudflare Email Service binding (fallback)."],
  "|none": ["مفيش طريقة إرسال متظبطة — مفيش أي إيميل بيخرج (ولا أكواد الدخول).", "No sending method is configured — no e-mail goes out (not even sign-in codes)."],
};
async function configOut(env) {
  const cfg = await loadMailConfig(env, { fresh: true });
  const base = cfg || { ...MAIL_DEFAULTS, cc_state: "none", last_check: null };
  let info = {}; try { info = await secretInfo(env, PROVIDERS.map(p => p.slot)); } catch (e) { info = {}; }
  const keys = {};
  for (const p of PROVIDERS) { const i = info[p.slot] || {}; keys[p.key] = { set: !!i.set, tail: i.tail || "", set_at: i.set_at || "", set_by: i.set_by || "", readable: !!i.readable, worker_secret: !!(env && env[p.env]) }; }
  const sel = keys[base.provider], envKey = env && env[PROV[base.provider].env];
  const key = sel.set && sel.readable ? { source: "control_center", tail: sel.tail, set_at: sel.set_at, readable: true }
    : envKey ? { source: "worker_secret", tail: maskTail(envKey), set_at: "", readable: true, ...(sel.set ? { stored_unreadable: true } : {}) }
    : sel.set ? { source: "control_center", tail: sel.tail, set_at: sel.set_at, readable: false } : { source: "none", tail: "", set_at: "", readable: false };
  const r = route(env, cfg), fx = EFFECT[r.provider + "|" + r.source] || EFFECT["|none"];
  return { enabled: !!base.enabled, provider: base.provider, from_email: base.from_email, from_name: base.from_name, reply_to: base.reply_to, key, keys,
    send_email_binding: !!(env && env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function"), ready: !!(cfg && cfg.ready),
    effective: { provider: r.provider, source: r.source, text_ar: fx[0], text_en: fx[1] }, config_secret: configSecretOk(env), store: !!cfg, domain: DOMAIN,
    providers: PROVIDERS.map(p => ({ key: p.key, label: p.label, key_prefix: p.key_prefix })) };
}
async function mailSettings(env) { // raw rows (throws when the table is missing)
  const { results } = await env.DB.prepare("SELECT k, v FROM cc_settings WHERE scope = 'mail'").all();
  const s = {}; for (const r of results || []) s[r.k] = r.v; return s;
}
const upsertSetting = (env, k, v, by, at) => env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'mail', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET scope = excluded.scope, v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(k, v, by, at);
function keyProblem(provider, k) {
  if (/\s/.test(k) || k.length > 300) return ["invalid_key", "invalid key", {}];
  if (provider === "brevo" && /^xsmtpsib-/.test(k)) return ["invalid_key", "this is a Brevo SMTP key — the Worker needs a Brevo API key (it starts with xkeysib-)", { hint: "smtp_key" }];
  if (provider === "resend" && !/^re_[A-Za-z0-9_-]{8,}$/.test(k)) return ["invalid_key", "a Resend API key starts with re_", { hint: /^xkeysib-/.test(k) ? "wrong_provider" : "format" }];
  if (provider === "brevo" && !/^xkeysib-[A-Za-z0-9-]{8,}$/.test(k)) return ["invalid_key", "a Brevo API key starts with xkeysib-", { hint: /^re_/.test(k) ? "wrong_provider" : "format" }];
  return null;
}
async function putConfig(req, env, adm) {
  const b = await readBody(req);
  if (b.tooLarge) return ccErr(req, env, 413, "too_large", "request too large");
  if (b.bad) return ccErr(req, env, 400, "bad_json", "bad json");
  if (String(b.provider || "").toLowerCase().trim() === "smtp" || Object.keys(b).some(k => /^smtp_/i.test(k) && scalar(b[k]).trim() !== ""))
    return ccErr(req, env, 400, "smtp_unsupported", "SMTP cannot run on Cloudflare Workers — use Resend or the Brevo API");
  let cur; try { cur = await mailSettings(env); } catch (e) { return ccErr(req, env, 503, "store_off", "the Control Center tables are not installed (migration 0006)"); }
  const next = {};
  if ("provider" in b) { const p = String(b.provider || "").toLowerCase().trim(); if (!PROV[p]) return ccErr(req, env, 400, "invalid_provider", "provider must be resend or brevo"); next["mail.provider"] = p; }
  if ("enabled" in b) next["mail.enabled"] = truthy(b.enabled) ? "1" : "0";
  if ("from_email" in b) { const e = line(b.from_email, 254).toLowerCase(); if (e && !fromOk(e)) return ccErr(req, env, 400, "invalid_from", "the sender must be an address on " + DOMAIN); next["mail.from_email"] = e || DEFAULT_FROM; }
  if ("from_name" in b) next["mail.from_name"] = cleanName(neutral(b.from_name)) || MAIL_DEFAULTS.from_name;
  if ("reply_to" in b) { const r = line(b.reply_to, 254).toLowerCase(); if (r && !isEmail(r)) return ccErr(req, env, 400, "invalid_reply_to", "Reply-To must be a valid e-mail address"); next["mail.reply_to"] = r; }
  const provider = next["mail.provider"] || (PROV[cur["mail.provider"]] ? cur["mail.provider"] : "resend"), slot = PROV[provider].slot;
  const apiKey = scalar(b.api_key).trim(), clearKey = truthy(b.clear_key);
  if (apiKey) {
    const bad = keyProblem(provider, apiKey); if (bad) return ccErr(req, env, 400, bad[0], bad[1], bad[2]);
    if (!configSecretOk(env)) return ccErr(req, env, 503, "config_secret_missing", "set the Worker secret CONFIG_SECRET before saving a key");
  }
  const before = {}, after = {};
  for (const [k, v] of Object.entries(next)) if ((k in cur ? cur[k] : null) !== v) { before[k.slice(5)] = k in cur ? cur[k] : null; after[k.slice(5)] = v; }
  const keyOp = apiKey ? "set" : clearKey ? "clear" : "";
  if (Object.keys(after).length && !(await audited(adm, "email.config", "mail", "config", before, after, `إعدادات البريد: ${Object.keys(after).join(", ")}`))) return auditFail(req, env);
  if (keyOp) {
    let old = {}; try { old = (await secretInfo(env, [slot]))[slot] || {}; } catch (e) { old = {}; }
    if (!(await audited(adm, "email.key", "mail", slot, { set: !!old.set, tail: old.tail || "" }, keyOp === "set" ? { set: true, tail: maskTail(apiKey) } : { set: false }, keyOp === "set" ? `مفتاح ${PROV[provider].label} اتحفظ` : `مفتاح ${PROV[provider].label} اتشال`))) return auditFail(req, env);
  }
  const by = actorEmail(adm) || actorId(adm), at = nowIso();
  try { if (Object.keys(after).length) await env.DB.batch(Object.keys(after).map(k => upsertSetting(env, "mail." + k, after[k], by, at))); }
  catch (e) { return ccErr(req, env, 503, "store_off", "could not save the settings"); }
  if (keyOp) {
    try { await putSecret(env, slot, keyOp === "set" ? apiKey : "", by); }
    catch (e) { return e && e.code === "config_secret_missing" ? ccErr(req, env, 503, "config_secret_missing", "set the Worker secret CONFIG_SECRET before saving a key") : ccErr(req, env, 503, "store_off", "could not save the key"); }
  }
  forget(env);
  const out = await configOut(env);
  return ccJson(req, env, { ok: true, ready: out.ready, unchanged: !Object.keys(after).length && !keyOp, config: out });
}
/* a test message goes only to the acting admin, the platform's own mailboxes (TEAM_EMAIL, ADMIN_EMAILS, @madeinegyptgate.com) or active staff */
async function testRecipientOk(env, adm, to) {
  if (to === actorEmail(adm) || to.endsWith("@" + DOMAIN)) return true;
  const own = [env.TEAM_EMAIL, ...String(env.ADMIN_EMAILS || "").split(/[\s,;]+/)].map(x => line(x, 254).toLowerCase()).filter(Boolean);
  if (own.includes(to)) return true;
  try { return !!(await env.DB.prepare("SELECT 1 AS x FROM cc_staff s JOIN members m ON m.id = s.member_id WHERE s.disabled_at = '' AND lower(m.email) = ? LIMIT 1").bind(to).first("x")); }
  catch (e) { return false; }
}
async function testSend(req, env, adm) {
  const b = await readBody(req);
  if (b.tooLarge) return ccErr(req, env, 413, "too_large", "request too large");
  if (b.bad) return ccErr(req, env, 400, "bad_json", "bad json");
  const to = line(b.to, 254).toLowerCase() || actorEmail(adm);
  if (!isEmail(to)) return ccErr(req, env, 400, "invalid_to", "a valid e-mail address is required");
  const key = b.template ? line(b.template, 60) : "test_email", t = BY_KEY[key];
  if (!t || !t.overridable) return ccErr(req, env, 400, "invalid_template", "unknown template");
  if (!(await testRecipientOk(env, adm, to))) return ccErr(req, env, 403, "test_recipient", "test messages go only to your own address or the platform's own mailboxes");
  const L = b.lang === "en" ? "en" : "ar";
  try { if (!(await rateOk(env, "mailtest|" + actorId(adm), LIM.testPerHour, 3600))) return ccErr(req, env, 429, "rate_limited", "too many test messages — try again in an hour", { limit: LIM.testPerHour }); }
  catch (e) { /* no rate table: allowed */ }
  if (!(await audited(adm, "email.test", "email_template", key, null, { to: maskAddr(to), template: key, lang: L }, `رسالة تجريبية (${key}) إلى ${maskAddr(to)}`))) return auditFail(req, env);
  const p = await previewOf(env, t, L, null), cfg = await loadMailConfig(env);
  const s = env.NOTIFY_FROM ? parseFrom(env.NOTIFY_FROM, parseFrom(env.MAIL_FROM)) : parseFrom(env.MAIL_FROM);
  const res = await deliver(env, { id: "test-" + rid(12), tpl: "test_email", from: { email: s.email, name: s.name }, to: [to], replyTo: (cfg && cfg.enabled && cfg.reply_to) || undefined,
    subject: line("[اختبار] / [Test] " + p.subject, LIM.subject), text: p.text, html: p.html });
  return ccJson(req, env, { ok: !!res.sent, sent: !!res.sent, provider: res.provider || "", ...(res.id ? { id: res.id } : {}), ...(res.sent ? {} : { error: res.error || "not sent" }) });
}
async function counts30(env) {
  const out = {};
  try {
    const { results } = await env.DB.prepare("SELECT template, status, COUNT(*) AS n, MAX(at) AS last FROM cc_mail_log WHERE at >= ? GROUP BY template, status").bind(iso(Date.now() - 30 * 86400000)).all();
    for (const r of results || []) { const o = out[r.template] || (out[r.template] = { sent: 0, failed: 0, skipped: 0, last_at: "" }); o[r.status] = r.n; if (r.last > o.last_at) o.last_at = r.last; }
  } catch (e) { /* no log table */ }
  return out;
}
function itemOut(t, o, c) {
  const ov = {}; if (o) { for (const f of TEXT_FIELDS) if (o[f]) ov[f] = o[f]; if (o.enabled === 0) ov.enabled = 0; if (o.updated_at) { ov.updated_at = o.updated_at; ov.updated_by = o.updated_by || ""; } }
  const g = TEMPLATE_GROUPS[t.group] || ["", ""], n = c || {};
  return { key: t.key, name_ar: t.name_ar, name_en: t.name_en, group: t.group, group_ar: g[0], group_en: g[1], to: t.to, list: t.list, required: t.required, can_off: t.can_off,
    overridable: t.overridable, via: t.via, vars: t.vars, must: t.must, body_editable: t.body_editable, enabled: t.can_off ? !(o && o.enabled === 0) : true, overrides: ov,
    defaults: t.via === "render" ? { subject_ar: t.subject_ar, subject_en: t.subject_en, body_ar: t.body_ar, body_en: t.body_en } : null,
    sample: { ar: t.sample_ar || "", en: t.sample_en || "" }, about_ar: t.about_ar, about_en: t.about_en, prefixes: t.prefixes,
    sent_30d: n.sent || 0, failed_30d: n.failed || 0, skipped_30d: n.skipped || 0, last_at: n.last_at || "" };
}
/* {fields} | {error: [status, code, msg, extra]} — the same rules for PUT and for the unsaved editor values of the preview */
function validateOverride(t, b, { partial = true } = {}) {
  if (!t.overridable) return { error: [400, "not_editable", "this template cannot be changed"] };
  const out = {}, unknown = new Set(), errors = [];
  if ("enabled" in b && b.enabled !== undefined) { const on = truthy(b.enabled) || b.enabled === null; if (!on && !t.can_off) return { error: [400, "required_template", "this e-mail cannot be switched off"] }; out.enabled = on ? 1 : 0; }
  const allowed = new Set(t.vars);
  for (const f of TEXT_FIELDS) {
    if (!(f in b) || b[f] === undefined) continue;
    if (b[f] !== null && typeof b[f] !== "string") { errors.push({ field: f, msg: "text expected" }); continue; }
    const raw = b[f] || "", max = f.startsWith("subject") ? LIM.subject : f.startsWith("body") ? LIM.body : LIM.intro;
    if (f.startsWith("body") && raw.trim() && !t.body_editable) return { error: [400, "body_not_editable", "the body of this e-mail is written by the platform; only subject, intro and outro can be changed"] };
    if (raw.length > max) { errors.push({ field: f, msg: `max ${max} characters` }); continue; }
    for (const n of varsIn(raw)) if (!allowed.has(n)) unknown.add(n);
    out[f] = f.startsWith("subject") ? line(neutral(raw), LIM.subject) : neutralText(raw, max);
  }
  if (unknown.size) return { error: [422, "unknown_var", "unknown variable(s): " + [...unknown].join(", "), { vars: [...unknown], allowed: t.vars }] };
  if (errors.length) return { error: [422, "invalid", "invalid fields", { errors }] };
  for (const lg of ["ar", "en"]) { const bf = out["body_" + lg]; if (bf) { const have = new Set(varsIn(bf)), missing = t.must.filter(n => !have.has(n)); if (missing.length) return { error: [422, "missing_var", "the body must keep: " + missing.map(n => "{{" + n + "}}").join(" "), { vars: missing, field: "body_" + lg }] }; } }
  return { fields: out, partial };
}
const tplRow = (env, key, r, by, at) => env.DB.prepare("INSERT INTO cc_mail_templates (key, enabled, subject_ar, subject_en, intro_ar, intro_en, outro_ar, outro_en, body_ar, body_en, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, subject_ar = excluded.subject_ar, subject_en = excluded.subject_en, intro_ar = excluded.intro_ar, intro_en = excluded.intro_en, outro_ar = excluded.outro_ar, outro_en = excluded.outro_en, body_ar = excluded.body_ar, body_en = excluded.body_en, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
  .bind(key, r.enabled, r.subject_ar, r.subject_en, r.intro_ar, r.intro_en, r.outro_ar, r.outro_en, r.body_ar, r.body_en, by, at);
async function putTemplate(req, env, adm, t) {
  const b = await readBody(req);
  if (b.tooLarge) return ccErr(req, env, 413, "too_large", "request too large");
  if (b.bad) return ccErr(req, env, 400, "bad_json", "bad json");
  const v = validateOverride(t, b); if (v.error) return ccErr(req, env, ...v.error);
  let cur; try { cur = await env.DB.prepare("SELECT * FROM cc_mail_templates WHERE key = ?").bind(t.key).first(); } catch (e) { return ccErr(req, env, 503, "store_off", "the Control Center tables are not installed (migration 0006)"); }
  const old = { enabled: cur ? cur.enabled : 1 }; for (const f of TEXT_FIELDS) old[f] = cur ? cur[f] || "" : "";
  const row = { ...old, ...v.fields }, before = {}, after = {};
  for (const k of Object.keys(row)) if (row[k] !== old[k]) { before[k] = old[k]; after[k] = row[k]; }
  if (!Object.keys(after).length) return ccJson(req, env, { ok: true, unchanged: true, item: itemOut(t, cur, (await counts30(env))[t.key]) });
  if (!(await audited(adm, "email.template", "email_template", t.key, before, after, `قالب «${t.name_ar}»: ${Object.keys(after).join(", ")}`))) return auditFail(req, env);
  const by = actorEmail(adm) || actorId(adm), at = nowIso();
  try { if (row.enabled === 1 && !hasText(row)) await env.DB.prepare("DELETE FROM cc_mail_templates WHERE key = ?").bind(t.key).run(); else await tplRow(env, t.key, row, by, at).run(); }
  catch (e) { return ccErr(req, env, 503, "store_off", "could not save the template"); }
  forget(env);
  const fresh = await env.DB.prepare("SELECT * FROM cc_mail_templates WHERE key = ?").bind(t.key).first();
  return ccJson(req, env, { ok: true, item: itemOut(t, fresh, (await counts30(env))[t.key]) });
}
async function resetTemplate(req, env, adm, t) {
  if (!t.overridable) return ccErr(req, env, 400, "not_editable", "this template cannot be changed");
  let cur; try { cur = await env.DB.prepare("SELECT * FROM cc_mail_templates WHERE key = ?").bind(t.key).first(); } catch (e) { return ccErr(req, env, 503, "store_off", "the Control Center tables are not installed (migration 0006)"); }
  if (!cur) return ccJson(req, env, { ok: true, unchanged: true, item: itemOut(t, null, (await counts30(env))[t.key]) });
  const before = { enabled: cur.enabled }; for (const f of TEXT_FIELDS) if (cur[f]) before[f] = cur[f];
  if (!(await audited(adm, "email.template", "email_template", t.key, before, null, `قالب «${t.name_ar}»: رجوع للنص الأصلي`))) return auditFail(req, env);
  try { await env.DB.prepare("DELETE FROM cc_mail_templates WHERE key = ?").bind(t.key).run(); } catch (e) { return ccErr(req, env, 503, "store_off", "could not reset the template"); }
  forget(env);
  return ccJson(req, env, { ok: true, item: itemOut(t, null, (await counts30(env))[t.key]) });
}
async function getLog(req, env, q) {
  const where = [], args = [];
  const tpl = line(q.get("template"), 60), st = line(q.get("status"), 10), to = line(q.get("to"), 254).toLowerCase(), from = line(q.get("from"), 10), toDate = line(q.get("to_date"), 10);
  if (tpl) { where.push("template = ?"); args.push(tpl); }
  if (st) { if (!["sent", "failed", "skipped"].includes(st)) return ccErr(req, env, 400, "invalid_status", "status must be sent, failed or skipped"); where.push("status = ?"); args.push(st); }
  if (to) { if (!isEmail(to)) return ccErr(req, env, 400, "invalid_to", "search needs the exact e-mail address"); where.push("to_hash = ?"); args.push(await toHash(env, to)); }
  if (from) { if (!DAY_RX.test(from)) return ccErr(req, env, 400, "invalid_from", "from must be YYYY-MM-DD"); where.push("at >= ?"); args.push(cairoStartIso(from)); }
  if (toDate) { if (!DAY_RX.test(toDate)) return ccErr(req, env, 400, "invalid_to_date", "to_date must be YYYY-MM-DD"); where.push("at < ?"); args.push(cairoStartIso(addDay(toDate, 1))); }
  const before = parseInt(q.get("before"), 10); if (Number.isFinite(before) && before > 0) { where.push("id < ?"); args.push(before); }
  const limit = Math.max(1, Math.min(LIM.page, parseInt(q.get("limit"), 10) || 50));
  try {
    const { results } = await env.DB.prepare(`SELECT id, at, template, list, to_masked, subject, provider, provider_id, status, error, ms FROM cc_mail_log${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`).bind(...args, limit + 1).all();
    const rows = results || [], items = rows.slice(0, limit);
    return ccJson(req, env, { items, next_before: rows.length > limit ? items[items.length - 1].id : null });
  } catch (e) { return ccJson(req, env, { items: [], next_before: null, store: false }); }
}
async function getStats(req, env, q) {
  const days = Math.max(1, Math.min(LIM.logDays, parseInt(q.get("days"), 10) || 30)), since = iso(Date.now() - days * 86400000), off = cairoOffsetMin(Date.now());
  const out = { days, since, total: { sent: 0, failed: 0, skipped: 0 }, by_day: [], by_template: [], by_provider: [], last_failure: null };
  try {
    const day = (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', at, '${off >= 0 ? "+" : ""}${off} minutes') AS day, status, COUNT(*) AS n FROM cc_mail_log WHERE at >= ? GROUP BY day, status ORDER BY day`).bind(since).all()).results || [];
    const D = {}; for (const r of day) { const o = D[r.day] || (D[r.day] = { day: r.day, sent: 0, failed: 0, skipped: 0 }); o[r.status] = r.n; out.total[r.status] += r.n; }
    out.by_day = Object.values(D);
    const tp = (await env.DB.prepare("SELECT template, status, COUNT(*) AS n FROM cc_mail_log WHERE at >= ? GROUP BY template, status").bind(since).all()).results || [];
    const TP = {}; for (const r of tp) { const o = TP[r.template] || (TP[r.template] = { template: r.template, sent: 0, failed: 0, skipped: 0 }); o[r.status] = r.n; }
    out.by_template = Object.values(TP).sort((a, b) => b.sent + b.failed - (a.sent + a.failed));
    const pv = (await env.DB.prepare("SELECT provider, status, COUNT(*) AS n FROM cc_mail_log WHERE at >= ? AND status != 'skipped' GROUP BY provider, status").bind(since).all()).results || [];
    const PV = {}; for (const r of pv) { const o = PV[r.provider] || (PV[r.provider] = { provider: r.provider, sent: 0, failed: 0 }); o[r.status] = r.n; }
    out.by_provider = Object.values(PV);
    out.last_failure = (await env.DB.prepare("SELECT at, template, provider, error FROM cc_mail_log WHERE status = 'failed' ORDER BY id DESC LIMIT 1").first()) || null;
  } catch (e) { out.store = false; }
  return ccJson(req, env, out);
}
async function statusOut(env) {
  const c = await configOut(env), cfg = await loadMailConfig(env);
  let day = { sent: 0, failed: 0, skipped: 0 };
  try { for (const r of (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM cc_mail_log WHERE at >= ? GROUP BY status").bind(iso(Date.now() - 86400000)).all()).results || []) day[r.status] = r.n; } catch (e) { day = null; }
  return { provider: c.effective.provider, key_source: c.effective.source, domain: DOMAIN, last_check: (cfg && cfg.last_check) || null, configured: { enabled: c.enabled, provider: c.provider, ready: c.ready },
    send_email_binding: c.send_email_binding, effective: c.effective, key: c.key, last_24h: day };
}
async function checkProvider(env, cfg) { // read-only provider calls; never a POST
  const want = cfg && PROV[cfg.provider] && cfg.key ? { provider: cfg.provider, key: cfg.key } : (r => (r.provider === "resend" || r.provider === "brevo" ? { provider: r.provider, key: r.key } : null))(route(env, cfg));
  if (!want) { const r = route(env, cfg); return r.provider === "cloudflare" ? { ok: true, provider: "cloudflare", detail: "SEND_EMAIL binding present (it cannot be checked from here)" } : { ok: false, provider: "", detail: "no key configured" }; }
  const sig = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(10000) } : {};
  try {
    if (want.provider === "resend") {
      if (!/^re_/.test(want.key)) return { ok: false, provider: "resend", detail: "the key does not look like a Resend key (re_…)" };
      const r = await fetch("https://api.resend.com/domains", { method: "GET", headers: { Authorization: `Bearer ${want.key}` }, ...sig });
      let j = {}; try { j = (await r.json()) || {}; } catch (e) { /* empty */ }
      if (r.status === 401 && j.name === "restricted_api_key") return { ok: true, provider: "resend", detail: "key works for sending only" };
      if (!r.ok) return { ok: false, provider: "resend", detail: `resend ${r.status}: ${astr(j.message || j.name || r.statusText, 160)}` };
      const d = (Array.isArray(j.data) ? j.data : []).find(x => x && x.name === DOMAIN);
      return d ? { ok: d.status === "verified", provider: "resend", detail: `domain ${DOMAIN}: ${astr(d.status, 40)}` } : { ok: false, provider: "resend", detail: `domain ${DOMAIN} is not in this Resend account` };
    }
    const r = await fetch("https://api.brevo.com/v3/account", { method: "GET", headers: { "api-key": want.key, Accept: "application/json" }, ...sig });
    let j = {}; try { j = (await r.json()) || {}; } catch (e) { /* empty */ }
    if (!r.ok) return { ok: false, provider: "brevo", detail: `brevo ${r.status}: ${astr(j.message || j.code || r.statusText, 160)}` };
    return { ok: true, provider: "brevo", detail: "Brevo account reachable with this key" };
  } catch (e) { return { ok: false, provider: want.provider, detail: want.provider + ": " + astr(e && e.message, 160) }; }
}
async function statusCheck(req, env, adm) {
  try { if (!(await rateOk(env, "mailcheck|" + actorId(adm), LIM.checkPerHour, 3600))) return ccErr(req, env, 429, "rate_limited", "too many checks — try again later"); } catch (e) { /* no rate table */ }
  if (!(await audited(adm, "email.status_check", "mail", "status", null, null, "فحص مزوّد البريد"))) return auditFail(req, env);
  const cfg = await loadMailConfig(env, { fresh: true }), r = await checkProvider(env, cfg), at = nowIso();
  const last = { at, ok: !!r.ok, provider: r.provider, detail: r.detail };
  try { await upsertSetting(env, "mail.last_check", JSON.stringify(last), actorEmail(adm) || actorId(adm), at).run(); forget(env); } catch (e) { /* no settings table */ }
  return ccJson(req, env, { ok: !!r.ok, detail: r.detail, provider: r.provider, at });
}

/* /api/admin/cc/email/* — adm from acc.js handleCC: {member, role, perms, can(p), audit(action, type, id, before, after, summary), …} */
export async function handleEmailAdmin(req, env, ctx, adm) {
  try {
    if (req.method === "OPTIONS") return ccPreflight(req, env);
    if (!adm || typeof adm.can !== "function" || typeof adm.audit !== "function") return ccErr(req, env, 401, "unauthorized", "sign in first");
    const url = new URL(req.url), sub = (url.pathname.replace(/\/+$/, "").match(/^\/api\/admin\/cc\/email(?:\/(.*))?$/) || [])[1] || "", M = req.method;
    const method = () => ccErr(req, env, 405, "method", "method not allowed");
    if (sub === "config") {
      if (M === "GET") return deny(req, env, adm, "email.read") || ccJson(req, env, await configOut(env));
      if (M === "PUT" || M === "POST") return deny(req, env, adm, "email.config") || putConfig(req, env, adm);
      return method();
    }
    if (sub === "test") return M !== "POST" ? method() : deny(req, env, adm, "email.test") || testSend(req, env, adm);
    if (sub === "templates") {
      if (M !== "GET") return method();
      const d = deny(req, env, adm, "email.read"); if (d) return d;
      const map = await overrideMap(env), c = await counts30(env);
      return ccJson(req, env, { items: TEMPLATES.map(t => itemOut(t, map.get(t.key) || null, c[t.key])), groups: TEMPLATE_GROUPS, lists: EMAIL_LISTS });
    }
    const tm = sub.match(/^templates\/([a-z0-9_]{1,60})$/);
    if (tm) {
      const t = BY_KEY[tm[1]];
      if (!t) return ccErr(req, env, 404, "not_found", "unknown template");
      if (M === "GET") { const d = deny(req, env, adm, "email.read"); if (d) return d; return ccJson(req, env, { item: itemOut(t, (await overrideMap(env)).get(t.key) || null, (await counts30(env))[t.key]) }); }
      if (M === "PUT" || M === "PATCH") return deny(req, env, adm, "email.templates") || putTemplate(req, env, adm, t);
      if (M === "DELETE") return deny(req, env, adm, "email.templates") || resetTemplate(req, env, adm, t);
      return method();
    }
    if (sub === "preview") {
      if (M !== "POST") return method();
      const d = deny(req, env, adm, "email.read"); if (d) return d;
      const b = await readBody(req); if (b.tooLarge) return ccErr(req, env, 413, "too_large", "request too large"); if (b.bad) return ccErr(req, env, 400, "bad_json", "bad json");
      const t = BY_KEY[line(b.key, 60)]; if (!t) return ccErr(req, env, 404, "not_found", "unknown template");
      let draft = null;
      if (b.overrides && typeof b.overrides === "object" && !Array.isArray(b.overrides)) { const v = validateOverride(t, b.overrides); if (v.error) return ccErr(req, env, ...v.error); draft = v.fields; }
      return ccJson(req, env, { key: t.key, lang: b.lang === "en" ? "en" : "ar", ...(await previewOf(env, t, b.lang === "en" ? "en" : "ar", draft)) });
    }
    if (sub === "log") return M !== "GET" ? method() : deny(req, env, adm, "email.read") || getLog(req, env, url.searchParams);
    if (sub === "stats") return M !== "GET" ? method() : deny(req, env, adm, "email.read") || getStats(req, env, url.searchParams);
    if (sub === "status") return M !== "GET" ? method() : deny(req, env, adm, "email.read") || ccJson(req, env, await statusOut(env));
    if (sub === "status/check") return M !== "POST" ? method() : deny(req, env, adm, "email.config") || statusCheck(req, env, adm);
    return ccErr(req, env, 404, "not_found", "not found");
  } catch (e) {
    console.error("email-center admin", e && e.message);
    return ccErr(req, env, 500, "server_error", "something went wrong");
  }
}
