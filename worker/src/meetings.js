/* Janna-hosted introductory meetings («اجتماع تعريفي مع جنة») — routed from index.js: every path under /api/meetings/*
   and the Worker's scheduled() (cron) handler.

   GET  /api/meetings/health                 → {ok, store, email, anam, media, whatsapp, turnstile, signing}
   POST /api/meetings                        {name, email, phone?, company?, activity?, markets?, topic?, language?, date:"YYYY-MM-DD", time:"HH:MM"
                                              (Egypt time, Africa/Cairo) | starts_at:ISO with offset, recording_consent?} → {id, url, starts_at, local, emailed}
                                              schedules a meeting: confirmation email to the visitor (meeting link + .ics invitation) + note to the team
   POST /api/meetings/start                  {name, email, phone?, company?, activity?, markets?, language?, consent:true, session_id?, started_at?} → {id}
                                              an immediate meeting Janna starts inside the live overlay (recording consent required)
   GET  /api/meetings/:id                    → public subset only {id, first_name, starts_at, status, kind, language, duration_min, tz}
   GET  /api/meetings/:id/ics                → the calendar invitation (no attendee e-mail in it)
   POST /api/meetings/:id/join               {session_id?, consent?} → visitor entered a scheduled meeting (meeting.html)
   POST /api/meetings/:id/finish             {session_id?, ended_at?, agenda_done?[]} → marks it ended and queues the processing
   GET  /api/meetings/:id/recording?exp=&sig= → streams the recording from R2 (HMAC-signed link, valid 30 days)
   GET|POST /api/meetings/:id/cancel?sig=    → the visitor cancels a booked meeting themself (signed link in every confirmation /
                                              reminder email; GET shows a confirmation page, POST cancels) — no person involved

   Processing (ctx.waitUntil after finish, retried by the cron every 15 min for up to 24 h): Anam REST
   GET /v1/sessions/{id} (persona + time check), GET /v1/sessions/{id}/transcript, GET /v1/sessions/{id}/recording
   (presigned URL; 404 until ready) → copy into R2 (MEDIA) meetings/<id>.mp4 → extractive bilingual summary → email to the
   visitor and a copy to the team. Transcript + recording are fetched ONLY with recording consent (summary + signed recording
   link + transcript .txt); without it (or after it was withdrawn on /join with consent:false) nothing of the conversation is
   fetched or kept and the summary is built from the form fields + agenda only. The session must be one of Janna's and have
   been live when its id was handed in (server clock), and one session id belongs to one meeting only.
   Abuse guards: names with links are refused, visitor text is never auto-linked and is kept out of the visitor's email and
   .ics, rate limits count the normalised address (lower case, no +tag), optional Turnstile (TURNSTILE_SECRET +
   turnstile_token in the body of POST /api/meetings and /start).
   Cron: reminders 24 h and 1 h before scheduled meetings (email; WhatsApp template "meeting_reminder" when WA_TOKEN +
   WA_PHONE_ID are set AND WhatsApp is switched on — the same rule as respond.io: WA_DRY_RUN not "1" and the Control Center switch
   «تشغيل إرسال واتساب الحقيقي» on), stale live meetings closed, missed meetings marked, pending processing retried.

   Storage: D1 (binding DB, tables meetings + meeting_events in schema.sql), R2 (binding MEDIA, optional).
   Secrets (wrangler secret put): MEETINGS_SECRET (required: signs recording links, salts IP hashes), ANAM_API_KEY (else the key the
   owner saved in the Control Center «مفاتيح الخدمات», sealed slot anam.api_key — src/service-keys.js),
   RESEND_API_KEY (or the SEND_EMAIL binding), WA_TOKEN. Vars: TEAM_EMAIL, MEETINGS_FROM, WA_PHONE_ID, SITE_URL.
   No keys live in this file. */
import { sendEmail, isEmail, esc, parseFrom, sender, fmtFrom } from "./advisor.js";
import { ipNet } from "./common.js";
import { attachOk, mailReady } from "./email-center.js"; // e-mail center: real attachments only where the provider supports them
import { anamKey, svc, waSwitchNow } from "./service-keys.js"; // Anam key (ANAM_API_KEY or the panel slot) + the WhatsApp switch (leaf module)
import { stripCues } from "./text.js";                         // Janna's lines without a stray cue tag («[صاف]») in the transcript she e-mails

export const TZ = "Africa/Cairo";
export const AGENDA = ["intro", "platform", "tour", "plan", "questions", "register"];
const AGENDA_AR = { intro: "التعارف ونشاطك", platform: "المنصة والجهة المشغّلة", tour: "جولة على الشاشة", plan: "الباقة المناسبة ومستشارك باسم", questions: "أسئلتك", register: "التسجيل" };
const AGENDA_EN = { intro: "Introductions & your business", platform: "The platform & its operator", tour: "Screen tour", plan: "The right plan & your advisor Bassem", questions: "Your questions", register: "Registration" };
/* Janna's Anam personas (AR / EN) — a session handed to /finish must belong to one of them (override: ANAM_PERSONA_IDS) */
const PERSONAS = ["5f06d835-22cc-4460-b412-84cefa9e565b", "e5101653-65b4-44a6-85e5-ec2e78f82685"];
const ANAM = "https://api.anam.ai/v1";
const SITE = "https://madeinegyptgate.com/";
const DEFAULT_TEAM = "info@madeinegyptgate.com";
const LIM = { request: 16 * 1024, maxDays: 60, minLeadMin: 10, durationMin: 30, joinEarlyMin: 15, joinLateMin: 90,
  schedPerIpDay: 5, schedPerEmailDay: 3, upcomingPerEmail: 3, startPerIpDay: 8, startPerEmailDay: 4,
  linkDays: 30, procHours: 24, recordingWaitHours: 6, transcriptPages: 10, transcriptChars: 200000, recordingBytes: 500 * 1024 * 1024, cronBatch: 5 };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
const err = (s, error, extra) => json({ error, ...(extra || {}) }, s);

/* ---------- helpers ---------- */
const enc = new TextEncoder();
const scalar = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const str = (v, max) => scalar(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const line = (v, max) => str(v, max * 2).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const iso = ms => new Date(ms).toISOString();
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64url = bytes => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = "[a-f0-9]{20}";
const site = env => { const u = String((env && env.SITE_URL) || SITE); return /^https:\/\/[^\s"<>]+\/$/.test(u) ? u : SITE; };
const team = env => { const t = line((env && env.TEAM_EMAIL) || DEFAULT_TEAM, 254); return isEmail(t) ? t : DEFAULT_TEAM; };
/* the platform's one sender (MAIL_FROM «منصة صنع في مصر <noreply@madeinegyptgate.com>»); MEETINGS_FROM may override the address */
const meetSender = env => (env && env.MEETINGS_FROM ? parseFrom(env.MEETINGS_FROM, sender(env)) : sender(env));
const fromAddr = env => meetSender(env).email;
export const meetingUrl = (env, id) => site(env) + "meeting.html#" + id;
const firstName = n => line(n, 80).split(" ")[0] || "";
/* rate-limit key for an address: lower case, no +tag (and no dots for Gmail) — t+1@x / T+2@X count as one mailbox */
export function emailKey(e) {
  const s = line(e, 254).toLowerCase(), at = s.lastIndexOf("@"); if (at < 1) return s;
  let local = s.slice(0, at).split("+")[0], dom = s.slice(at + 1);
  if (dom === "googlemail.com") dom = "gmail.com";
  if (dom === "gmail.com") local = local.replace(/\./g, "");
  return (local || s.slice(0, at)) + "@" + dom;
}
/* visitor-typed text never becomes a link: names with a URL / domain / e-mail are refused, other fields are defanged */
const LINKY = /:\/\/|\bwww\.|@|\b[a-z0-9-]+\.[a-z]{2,}\b/i;
export const defang = s => String(s == null ? "" : s).replace(/([a-z][a-z0-9+.-]*):\/\//gi, "$1[:]//").replace(/\bwww\./gi, "www[.]").replace(/([a-z0-9-])\.([a-z]{2,})/gi, "$1[.]$2");
const emailOn = env => !!(env && mailReady(env));
const waOn = env => !!(env && env.WA_TOKEN && /^\d{5,20}$/.test(String(env.WA_PHONE_ID || "")));
/* any real WhatsApp obeys the one switch (whatsapp.js waLive): the WA_DRY_RUN kill switch and the Control Center switch (fail-closed) */
const waDryEnv = env => { const v = String(env && env.WA_DRY_RUN != null ? env.WA_DRY_RUN : "").trim(); return v !== "" && v !== "0"; };
const waGo = env => waOn(env) && !waDryEnv(env) && svc(env).wa_live === true;
async function readJson(req) {
  const t = await req.text();
  if (t.length > LIM.request) return { tooLarge: true };
  if (!t) return {};
  try { const o = JSON.parse(t); return o && typeof o === "object" && !Array.isArray(o) ? o : { bad: true }; } catch (e) { return { bad: true }; }
}
const event = (env, id, type, data) => env.DB.prepare("INSERT INTO meeting_events (meeting_id, type, data, at) VALUES (?, ?, ?, ?)").bind(id, type, JSON.stringify(data || {}), iso(Date.now())).run();
const getMeeting = (env, id) => env.DB.prepare("SELECT * FROM meetings WHERE id = ?").bind(id).first();

/* ---------- Egypt time (Africa/Cairo, EET +02 / EEST +03 summer time) ---------- */
function cairoParts(ms) {
  const p = {}; for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
const cairoOffsetMin = ms => { const p = cairoParts(ms); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000); };
/* "2026-12-01", "14:00" (Cairo wall clock) → UTC ms, or null (bad / non-existent time) */
export function cairoToUtc(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "")), t = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
  if (!d || !t) return null;
  const y = +d[1], mo = +d[2], da = +d[3], h = +t[1], mi = +t[2];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  let ms = naive - cairoOffsetMin(naive - 2 * 3600e3) * 60000;
  const off2 = cairoOffsetMin(ms); ms = naive - off2 * 60000;
  const p = cairoParts(ms);
  return p.y === y && p.mo === mo && p.d === da && p.h === h && p.mi === mi ? ms : null;
}
export function cairoLocal(ms) { const p = cairoParts(ms), z = n => String(n).padStart(2, "0"); return { date: `${p.y}-${z(p.mo)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}`, stamp: `${p.y}${z(p.mo)}${z(p.d)}T${z(p.h)}${z(p.mi)}${z(p.s)}` }; }
export function fmtCairo(ms, lang) {
  try { return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + (lang === "en" ? " (Egypt time)" : " (بتوقيت القاهرة)"); }
  catch (e) { const l = cairoLocal(ms); return `${l.date} ${l.time} (Cairo)`; }
}
function startFrom(b) {
  if (b.date || b.time) return cairoToUtc(line(b.date, 10), line(b.time, 5));
  const s = line(b.starts_at, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null; // explicit offset only
  const ms = Date.parse(s); return Number.isFinite(ms) ? ms : null;
}

/* ---------- calendar invitation (.ics, RFC 5545) ---------- */
export const icsText = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(l) { // 75 octets per line, never splitting a UTF-8 character
  const out = []; let cur = "", n = 0;
  for (const ch of l) { const b = enc.encode(ch).length; if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; } cur += ch; n += b; }
  out.push(cur); return out.join("\r\n ");
}
const VTZ = ["BEGIN:VTIMEZONE", "TZID:Africa/Cairo", "X-LIC-LOCATION:Africa/Cairo",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:EET", "DTSTART:20231026T235959", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1TH", "END:STANDARD",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:EEST", "DTSTART:20230428T000000", "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR", "END:DAYLIGHT",
  "END:VTIMEZONE"];
export function buildIcs(m, env, opts = {}) {
  const start = Date.parse(m.starts_at), dur = (m.duration_min || LIM.durationMin) * 60000, url = meetingUrl(env, m.id), en = m.language === "en";
  const utc = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const summary = en ? "Introductory meeting with Janna — Made in Egypt Gate" : "اجتماع تعريفي مع جنة — منصة صنع في مصر";
  // fixed text only: the visitor's free-text topic never goes into the invitation (it would let anyone mail arbitrary text)
  const desc = en ? `Your online introductory meeting with Janna (Made in Egypt Gate).\nJoin here: ${url}\nTime: ${fmtCairo(start, "en")}` : `اجتماعك التعريفي أونلاين مع جنة (منصة صنع في مصر).\nادخل من هنا: ${url}\nالموعد: ${fmtCairo(start, "ar")}`;
  const cn = s => line(s, 80).replace(/["\\;,:]/g, "") || "Guest";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Made in Egypt Gate//Janna meetings//AR", "CALSCALE:GREGORIAN", "METHOD:" + (opts.method || "REQUEST"), ...VTZ,
    "BEGIN:VEVENT", `UID:meeting-${m.id}@madeinegyptgate.com`, "DTSTAMP:" + utc(Date.now()),
    `DTSTART;TZID=${TZ}:${cairoLocal(start).stamp}`, `DTEND;TZID=${TZ}:${cairoLocal(start + dur).stamp}`,
    "SUMMARY:" + icsText(summary), "DESCRIPTION:" + icsText(desc), "LOCATION:" + icsText(url), "URL:" + url,
    `ORGANIZER;CN=Janna:mailto:${fromAddr(env)}`,
    ...(opts.attendee && isEmail(m.email) ? [`ATTENDEE;CN="${cn(m.name)}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${m.email}`] : []),
    "STATUS:CONFIRMED", "SEQUENCE:0", "TRANSP:OPAQUE",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "DESCRIPTION:" + icsText(summary), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"];
  return L.map(fold).join("\r\n") + "\r\n";
}

/* ---------- email (Resend with attachments; otherwise advisor.js sendEmail, attachments inlined as text) ---------- */
/* only the platform's own links (meeting page, .ics, recording, registration) become clickable — never visitor text */
function toHtml(text, env) {
  const own = [site(env), SITE];
  const p = esc(text).replace(/(https:\/\/[^\s<]+)/g, (u) => (own.some(o => u.startsWith(esc(o))) ? `<a href="${u}">${u}</a>` : u)).replace(/\r?\n/g, "<br>");
  return `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.8;color:#222">${p}</div>`;
}
async function mail(env, msg) {
  const atts = (msg.attachments || []).filter(a => a && a.filename);
  if (atts.length && attachOk(env)) return sendEmail(env, { id: msg.id, from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: toHtml(msg.text, env), attachments: atts });
  let text = msg.text;
  for (const a of atts) if (a.inline) text += `\n\n———— ${a.filename} ————\n` + a.content.slice(0, 20000);
  return sendEmail(env, { id: msg.id, from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text, html: toHtml(text, env) });
}
const janna = env => ({ email: fromAddr(env), name: "جنة — " + meetSender(env).name });

/* ---------- WhatsApp Cloud API (optional) ---------- */
export function waNumber(phone) {
  let d = String(phone || "").replace(/[^\d+]/g, "");
  const plus = d.startsWith("+"); d = d.replace(/\+/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (!plus && /^01[0125]\d{8}$/.test(d)) d = "20" + d.slice(1); // Egyptian mobile 01xxxxxxxxx
  return /^[1-9]\d{7,14}$/.test(d) ? d : "";
}
async function sendWhatsApp(env, phone, lang, params) {
  if (!waOn(env)) return { sent: false, error: "whatsapp not configured" };
  if (!waGo(env) || !(await waSwitchNow(env))) return { sent: false, error: "dry run" };
  const to = waNumber(phone); if (!to) return { sent: false, error: "no valid phone" };
  const ver = /^v\d+\.\d+$/.test(String(env.WA_API_VERSION || "")) ? env.WA_API_VERSION : "v21.0";
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${env.WA_PHONE_ID}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: line(env.WA_TEMPLATE || "meeting_reminder", 60), language: { code: lang === "en" ? "en" : "ar" }, components: [{ type: "body", parameters: params.map(t => ({ type: "text", text: line(t, 200) })) }] } }),
    });
    if (!r.ok) return { sent: false, error: "whatsapp " + r.status };
    return { sent: true };
  } catch (e) { return { sent: false, error: "whatsapp: " + line(e && e.message, 100) }; }
}

/* ---------- HTTP router ---------- */
export async function handleMeetings(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/meetings/, "").replace(/\/+$/, "") || "/";
  try {
    if (path === "/health") return json({ ok: !!(env.DB && env.MEETINGS_SECRET), store: env.DB ? "d1" : "none", signing: !!env.MEETINGS_SECRET, email: emailOn(env), anam: !!(await anamKey(env)), media: !!env.MEDIA, whatsapp: waOn(env), turnstile: !!env.TURNSTILE_SECRET, session_cap_min: 10 });
    if (!env.DB) return err(503, "store not configured");
    let m;
    if ((m = path.match(new RegExp(`^/(${ID})$`)))) return req.method === "GET" ? await publicView(env, m[1]) : err(405, "method not allowed");
    if ((m = path.match(new RegExp(`^/(${ID})/ics$`)))) return req.method === "GET" ? await icsFile(env, m[1]) : err(405, "method not allowed");
    if (!env.MEETINGS_SECRET) return err(503, "meetings not configured");
    if (path === "/") return req.method === "POST" ? await schedule(req, env, ctx) : err(405, "method not allowed");
    if (path === "/start") return req.method === "POST" ? await start(req, env) : err(405, "method not allowed");
    if ((m = path.match(new RegExp(`^/(${ID})/join$`)))) return req.method === "POST" ? await join(req, env, m[1]) : err(405, "method not allowed");
    if ((m = path.match(new RegExp(`^/(${ID})/finish$`)))) return req.method === "POST" ? await finish(req, env, ctx, m[1]) : err(405, "method not allowed");
    if ((m = path.match(new RegExp(`^/(${ID})/recording$`)))) return req.method === "GET" || req.method === "HEAD" ? await recording(req, env, m[1], url) : err(405, "method not allowed");
    if ((m = path.match(new RegExp(`^/(${ID})/cancel$`)))) return req.method === "GET" || req.method === "POST" ? await cancelPage(req, env, m[1], url) : err(405, "method not allowed");
    return err(404, "not found");
  } catch (e) {
    console.error("meetings error", e && e.stack || e);
    return err(500, "server error");
  }
}

/* ---------- self-service cancel (owner decision 5: no person handles "please cancel my meeting") ---------- */
export async function cancelUrl(env, id) { return site(env) + `api/meetings/${id}/cancel?sig=${(await hmac(env.MEETINGS_SECRET, "cancel|" + id)).slice(0, 32)}`; }
const bookUrl = env => site(env) + "meeting.html#book";
const htmlPage = (title, body, form) => new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;background:#f6f4ee;color:#1d2b22;margin:0;padding:40px 16px}main{max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px -15px rgba(0,0,0,.25)}button{background:#8a1c1c;color:#fff;border:0;border-radius:999px;padding:10px 22px;font:inherit;cursor:pointer}p[dir=ltr]{color:#555}a{color:#0b5d3b}</style></head><body><main>${body}${form || ""}</main></body></html>`,
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
async function cancelPage(req, env, id, url) {
  const sig = url.searchParams.get("sig") || "";
  if (!safeEq(sig, (await hmac(env.MEETINGS_SECRET, "cancel|" + id)).slice(0, 32))) return htmlPage("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>");
  const m = await getMeeting(env, id);
  if (!m) return htmlPage("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>");
  const when = `${esc(fmtCairo(Date.parse(m.starts_at), "ar"))}<p dir="ltr">${esc(fmtCairo(Date.parse(m.starts_at), "en"))}</p>`;
  const again = `<p>عايز ميعاد تاني؟ احجز من جديد مع جنة: <a href="${esc(bookUrl(env))}">${esc(bookUrl(env))}</a></p><p dir="ltr">Want another time? Book again with Janna.</p>`;
  if (m.status === "cancelled") return htmlPage("اتلغى", `<h2>الاجتماع ده اتلغى قبل كده ✅</h2><p dir="ltr">This meeting is already cancelled.</p>${again}`);
  if (m.status !== "scheduled" || Date.parse(m.starts_at) < Date.now() - 15 * 60000) return htmlPage("مش ممكن", `<h2>الاجتماع ده مش ممكن يتلغى دلوقتي</h2><p dir="ltr">This meeting can no longer be cancelled (${esc(m.status)}).</p>`);
  if (req.method === "GET") return htmlPage("إلغاء الاجتماع", `<h2>إلغاء اجتماعك مع جنة؟</h2><p>${when}</p>`, `<form method="post"><button type="submit">إلغاء الاجتماع / Cancel the meeting</button></form>`);
  const r = await env.DB.prepare("UPDATE meetings SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(iso(Date.now()), id).run();
  if (r.meta && r.meta.changes) {
    await event(env, id, "cancelled", { by: "visitor" });
    await mail(env, { id: "mx-" + id, from: janna(env), to: [m.email], subject: m.language === "en" ? "Your meeting with Janna is cancelled" : "اتلغى اجتماعك مع جنة",
      text: `اتلغى اجتماعك مع جنة اللي كان ${fmtCairo(Date.parse(m.starts_at), "ar")}. لو عايز ميعاد تاني احجز من جديد مع جنة: ${bookUrl(env)}

—

Your meeting with Janna on ${fmtCairo(Date.parse(m.starts_at), "en")} is cancelled. Book another time with Janna: ${bookUrl(env)}` }).catch(e => console.error("cancel mail", e && e.message));
  }
  return htmlPage("اتلغى", `<h2>اتلغى الاجتماع ✅</h2><p dir="ltr">The meeting is cancelled.</p>${again}`);
}

/* visitor fields shared by schedule + start */
function visitor(b) {
  const name = line(b.name, 80), email = line(b.email, 254).toLowerCase(), phone = line(b.phone, 30);
  if (name.length < 2) return { error: err(400, "name required") };
  if (LINKY.test(name)) return { error: err(400, "name must not contain links or addresses") };
  if (!isEmail(email)) return { error: err(400, "valid email required") };
  if (phone && !/^\+?[\d\s()-]{6,30}$/.test(phone)) return { error: err(400, "invalid phone") };
  const markets = Array.isArray(b.markets) ? b.markets.map(x => line(x, 40)).filter(Boolean).slice(0, 8).join("، ") : line(b.markets, 200);
  return { v: { name, email, email_key: emailKey(email), phone, company: line(b.company, 120), activity: line(b.activity, 200), markets, topic: line(b.topic, 300), language: line(b.language, 5).toLowerCase().startsWith("en") ? "en" : "ar" } };
}
/* optional Cloudflare Turnstile on the unauthenticated endpoints (POST /api/meetings, /start): on when TURNSTILE_SECRET is set */
async function human(req, env, b) {
  if (!env.TURNSTILE_SECRET) return null;
  const token = line(b.turnstile_token, 2048);
  if (!token) return err(403, "verification required");
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: req.headers.get("CF-Connecting-IP") || undefined }) });
    const j = await r.json();
    return j && j.success === true ? null : err(403, "verification failed");
  } catch (e) { return err(503, "verification unavailable"); }
}
/* an Anam session can belong to one meeting only */
async function sessionTaken(env, sid, id) {
  return !!(sid && await env.DB.prepare("SELECT id FROM meetings WHERE session_id = ? AND id != ? LIMIT 1").bind(sid, id || "").first("id"));
}
const unique = e => /UNIQUE|constraint/i.test(String(e && e.message || e));
const ipHash = async (req, env) => (await sha256(env.MEETINGS_SECRET + "|" + ipNet(req.headers.get("CF-Connecting-IP") || ""))).slice(0, 32); // IPv6 by /64 (SEC M1)
async function countSince(env, col, val, sinceMs, extra = "") {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM meetings WHERE ${col} = ? AND created_at > ?${extra}`).bind(val, iso(sinceMs)).first("n")) || 0;
}
async function insert(env, row) {
  const cols = Object.keys(row);
  await env.DB.prepare(`INSERT INTO meetings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map(k => row[k])).run();
}

/* POST /api/meetings — schedule */
async function schedule(req, env, ctx) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const { v, error } = visitor(b); if (error) return error;
  const bot = await human(req, env, b); if (bot) return bot;
  const now = Date.now(), ms = startFrom(b);
  if (ms == null) return err(400, "valid date and time required (Egypt time: date YYYY-MM-DD, time HH:MM)");
  if (ms < now + LIM.minLeadMin * 60000) return err(400, "meeting time must be in the future", { min_lead_minutes: LIM.minLeadMin });
  if (ms > now + LIM.maxDays * 86400000) return err(400, "meeting time must be within 60 days", { max_days: LIM.maxDays });
  const ip = await ipHash(req, env), day = now - 86400000;
  if (await countSince(env, "ip_hash", ip, day, " AND kind = 'scheduled'") >= LIM.schedPerIpDay) return err(429, "too many meetings requested, try again tomorrow");
  if (await countSince(env, "email_key", v.email_key, day, " AND kind = 'scheduled'") >= LIM.schedPerEmailDay) return err(429, "too many meetings requested for this email, try again tomorrow");
  const upcoming = await env.DB.prepare("SELECT COUNT(*) AS n FROM meetings WHERE email_key = ? AND status = 'scheduled' AND starts_at > ?").bind(v.email_key, iso(now)).first("n");
  if (upcoming >= LIM.upcomingPerEmail) return err(429, "this email already has upcoming meetings");
  const id = hex(10), t = iso(now), lead = ms - now;
  const row = { id, kind: "scheduled", status: "scheduled", ...v, consent: b.recording_consent === true ? 1 : 0, starts_at: iso(ms), duration_min: LIM.durationMin, ip_hash: ip,
    reminded_24h: lead < 25 * 3600e3 ? "n/a" : "", reminded_1h: lead < 75 * 60000 ? "n/a" : "", created_at: t, updated_at: t };
  await insert(env, row);
  await event(env, id, "scheduled", { starts_at: row.starts_at });
  const cancel = await cancelUrl(env, id); // self-service cancel link (signed)
  const [vis, tm] = await Promise.all([confirmEmail(env, row, cancel), teamEmail(env, row, "scheduled")]);
  await event(env, id, "confirmation_email", { sent: vis.sent, error: vis.error || "", team: tm.sent });
  return json({ id, url: meetingUrl(env, id), starts_at: row.starts_at, local: cairoLocal(ms), tz: TZ, duration_min: LIM.durationMin, emailed: !!vis.sent });
}
function confirmEmail(env, m, cancel) {
  const ms = Date.parse(m.starts_at), url = meetingUrl(env, m.id), ics = site(env) + `api/meetings/${m.id}/ics`, fn = firstName(m.name);
  const ar = `أهلاً ${fn}،\n\nاتحجز اجتماعك التعريفي أونلاين مع جنة من منصة صنع في مصر.\nالموعد: ${fmtCairo(ms, "ar")}\nالمدة: حوالي ${LIM.durationMin} دقيقة\nلينك الاجتماع: ${url}\n\nافتح اللينك قبل الموعد بـ 10 دقايق من الكمبيوتر أو الموبايل، واسمح للمتصفح باستخدام الميكروفون. الجلسة المباشرة مع جنة حدّها 10 دقايق في المرة الواحدة.\nدعوة التقويم مرفقة (meeting.ics)، ولو مش ظاهرة: ${ics}`;
  const en = `Hello ${fn},\n\nYour online introductory meeting with Janna from Made in Egypt Gate is booked.\nTime: ${fmtCairo(ms, "en")}\nDuration: about ${LIM.durationMin} minutes\nMeeting link: ${url}\n\nOpen the link up to 10 minutes before the start, on a computer or phone, and allow the microphone. A live session with Janna is capped at 10 minutes at a time.\nThe calendar invitation is attached (meeting.ics); if it is missing: ${ics}`;
  // self-service: nobody reads replies to cancel or reschedule
  const text = (m.language === "en" ? en + "\n\n—\n\n" + ar : ar + "\n\n—\n\n" + en) + `\n\n—\nلإلغاء الموعد: ${cancel}\nولو عايز ميعاد تاني: ألغي ده واحجز من جديد مع جنة (${bookUrl(env)}).\nTo cancel: ${cancel} — for another time, cancel and book again with Janna.`;
  return mail(env, { id: "mc-" + m.id, from: janna(env), to: [m.email], replyTo: team(env), subject: m.language === "en" ? "Your meeting with Janna — Made in Egypt Gate" : "تأكيد اجتماعك مع جنة — منصة صنع في مصر", text,
    attachments: [{ filename: "meeting.ics", content: buildIcs(m, env, { attendee: true }), type: "text/calendar; charset=utf-8; method=REQUEST" }] });
}
function teamEmail(env, m, kind, extra) {
  const ms = Date.parse(m.starts_at);
  const lines = [`${kind === "scheduled" ? "اجتماع تعريفي جديد محجوز مع جنة" : "انتهى اجتماع تعريفي مع جنة"} / ${kind === "scheduled" ? "New introductory meeting booked" : "Introductory meeting finished"}`, "",
    `الاسم / Name: ${m.name}`, `البريد / Email: ${m.email}`, m.phone ? `الموبايل / Phone: ${m.phone}` : "", m.company ? `الشركة / Company: ${defang(m.company)}` : "", m.activity ? `النشاط / Activity: ${defang(m.activity)}` : "",
    m.markets ? `الأسواق / Markets: ${defang(m.markets)}` : "", m.topic ? `الموضوع / Topic: ${defang(m.topic)}` : "", `الموعد / Time: ${fmtCairo(ms, "ar")} — ${fmtCairo(ms, "en")}`,
    `اللغة / Language: ${m.language}`, `موافقة التسجيل / Recording consent: ${m.consent ? "yes" : "no"}`, `Meeting: ${meetingUrl(env, m.id)}`, extra ? "\n" + extra : ""].filter(Boolean);
  return mail(env, { id: (kind === "scheduled" ? "mt-" : "mf-") + m.id, from: janna(env), to: [team(env)], replyTo: m.email, subject: `${kind === "scheduled" ? "اجتماع جديد" : "ملخص اجتماع"} — ${m.name}${m.company ? " (" + defang(m.company) + ")" : ""}`, text: lines.join("\n"),
    attachments: extra && extra.attachments ? extra.attachments : [] });
}

/* POST /api/meetings/start — immediate meeting inside Janna's live overlay */
async function start(req, env) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  if (b.consent !== true) return err(400, "recording consent required");
  const { v, error } = visitor(b); if (error) return error;
  const sid = line(b.session_id, 40).toLowerCase();
  if (sid && !UUID.test(sid)) return err(400, "invalid session_id");
  const bot = await human(req, env, b); if (bot) return bot;
  if (await sessionTaken(env, sid)) return err(409, "session already used");
  const now = Date.now(), ip = await ipHash(req, env), day = now - 86400000;
  if (await countSince(env, "ip_hash", ip, day, " AND kind = 'instant'") >= LIM.startPerIpDay) return err(429, "too many meetings, try again tomorrow");
  if (await countSince(env, "email_key", v.email_key, day, " AND kind = 'instant'") >= LIM.startPerEmailDay) return err(429, "too many meetings for this email, try again tomorrow");
  const sa = Date.parse(line(b.started_at, 40)), started = Number.isFinite(sa) && Math.abs(sa - now) < 3600e3 ? sa : now;
  const id = hex(10), t = iso(now);
  try { await insert(env, { id, kind: "instant", status: "live", ...v, consent: 1, starts_at: iso(started), started_at: iso(started), duration_min: 10, session_id: sid, session_at: sid ? t : "", ip_hash: ip, reminded_24h: "n/a", reminded_1h: "n/a", created_at: t, updated_at: t }); }
  catch (e) { if (unique(e)) return err(409, "session already used"); throw e; }
  await event(env, id, "started", { session: !!sid });
  return json({ id, status: "live", url: meetingUrl(env, id) });
}

/* GET /api/meetings/:id — public subset only (the id itself is the capability; no email/phone/company) */
async function publicView(env, id) {
  const m = await getMeeting(env, id);
  if (!m) return err(404, "not found");
  return json({ id: m.id, kind: m.kind, first_name: firstName(m.name), starts_at: m.starts_at, status: m.status, language: m.language, duration_min: m.duration_min, tz: TZ, local: cairoLocal(Date.parse(m.starts_at)) });
}
async function icsFile(env, id) {
  const m = await getMeeting(env, id);
  if (!m || m.kind !== "scheduled") return err(404, "not found");
  return new Response(buildIcs(m, env, { method: "PUBLISH" }), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="meeting.ics"', "Cache-Control": "no-store", ...CORS } });
}

/* POST /api/meetings/:id/join — the visitor entered a scheduled meeting (meeting.html) */
async function join(req, env, id) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const m = await getMeeting(env, id);
  if (!m) return err(404, "not found");
  const now = Date.now(), st = Date.parse(m.starts_at);
  if (m.kind !== "scheduled" || !["scheduled", "live"].includes(m.status)) return err(409, "meeting is not open", { status: m.status });
  if (now < st - LIM.joinEarlyMin * 60000) return err(409, "too early", { starts_at: m.starts_at });
  if (now > st + LIM.joinLateMin * 60000) return err(410, "meeting expired");
  const sid = line(b.session_id, 40).toLowerCase();
  if (sid && !UUID.test(sid)) return err(400, "invalid session_id");
  if (sid && !m.session_id && await sessionTaken(env, sid, id)) return err(409, "session already used");
  // the box on meeting.html is the visitor's latest word: ticked → consent, unticked (false) → withdrawn, absent → unchanged
  const consent = b.consent === true ? 1 : b.consent === false ? 0 : m.consent;
  try {
    await env.DB.prepare("UPDATE meetings SET status = 'live', started_at = CASE WHEN started_at = '' THEN ? ELSE started_at END, session_at = CASE WHEN session_id = '' AND ? != '' THEN ? ELSE session_at END, session_id = CASE WHEN session_id = '' THEN ? ELSE session_id END, consent = ?, updated_at = ? WHERE id = ?")
      .bind(iso(now), sid, iso(now), sid, consent, iso(now), id).run();
  } catch (e) { if (unique(e)) return err(409, "session already used"); throw e; }
  await event(env, id, "joined", { session: !!sid, consent: !!consent });
  return json({ ok: true, id, status: "live", consent: !!consent });
}

/* POST /api/meetings/:id/finish */
async function finish(req, env, ctx, id) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const m = await getMeeting(env, id);
  if (!m) return err(404, "not found");
  if (m.status === "ended") return json({ ok: true, id, status: "ended", already: true });
  if (m.status !== "live") return err(409, "meeting is not live", { status: m.status });
  const sid = line(b.session_id, 40).toLowerCase();
  if (sid && !UUID.test(sid)) return err(400, "invalid session_id");
  const session = m.session_id || sid;
  if (!m.session_id && sid && await sessionTaken(env, sid, id)) return err(409, "session already used");
  const agenda = Array.isArray(b.agenda_done) ? [...new Set(b.agenda_done.filter(a => AGENDA.includes(a)))] : [];
  const now = Date.now(), ea = Date.parse(line(b.ended_at, 40)), ended = Number.isFinite(ea) && Math.abs(ea - now) < 3600e3 ? ea : now;
  const proc = session ? "pending" : "none";
  try {
    await env.DB.prepare("UPDATE meetings SET status = 'ended', ended_at = ?, session_at = CASE WHEN session_id = '' AND ? != '' THEN ? ELSE session_at END, session_id = ?, agenda_done = ?, proc_status = ?, proc_next_at = ?, updated_at = ? WHERE id = ? AND status = 'live'")
      .bind(iso(ended), session, iso(now), session, JSON.stringify(agenda), proc, iso(now + 60000), iso(now), id).run();
  } catch (e) { if (unique(e)) return err(409, "session already used"); throw e; }
  await event(env, id, "finished", { agenda, session: !!session });
  if (session) ctx.waitUntil(processMeeting(env, id).catch(e => console.error("meeting processing", e && e.stack || e)));
  return json({ ok: true, id, status: "ended", processing: proc === "pending", recording: !!(m.consent && session) });
}

/* ---------- recording links ---------- */
export async function recordingLink(env, id, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + LIM.linkDays * 86400;
  return site(env) + `api/meetings/${id}/recording?exp=${exp}&sig=${await hmac(env.MEETINGS_SECRET, `rec|${id}|${exp}`)}`;
}
export async function verifyRecordingSig(env, id, exp, sig, nowMs = Date.now()) {
  if (!env.MEETINGS_SECRET || !/^\d{9,11}$/.test(String(exp || "")) || !sig) return false;
  if (+exp < Math.floor(nowMs / 1000) || +exp > Math.floor(nowMs / 1000) + LIM.linkDays * 86400 + 60) return false;
  return safeEq(await hmac(env.MEETINGS_SECRET, `rec|${id}|${exp}`), sig);
}
async function recording(req, env, id, url) {
  if (!(await verifyRecordingSig(env, id, url.searchParams.get("exp"), url.searchParams.get("sig")))) return err(403, "link invalid or expired");
  if (!env.MEDIA) return err(503, "media storage not configured");
  const m = await getMeeting(env, id);
  if (!m || !m.consent || !m.recording_key) return err(404, "recording not available");
  const ranged = req.headers.get("Range");
  const obj = await env.MEDIA.get(m.recording_key, ranged ? { range: req.headers } : undefined);
  if (!obj) return err(404, "recording no longer available");
  const h = new Headers({ "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "video/mp4", "Content-Disposition": `attachment; filename="madeinegyptgate-meeting-${id}.mp4"`, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Robots-Tag": "noindex", ...CORS });
  let status = 200;
  if (ranged && obj.range && typeof obj.range.offset === "number") {
    const len = obj.range.length ?? (obj.size - obj.range.offset);
    h.set("Content-Range", `bytes ${obj.range.offset}-${obj.range.offset + len - 1}/${obj.size}`); h.set("Content-Length", String(len)); status = 206;
  } else if (obj.size != null) h.set("Content-Length", String(obj.size));
  return new Response(req.method === "HEAD" ? null : obj.body, { status, headers: h });
}

/* ---------- processing: Anam transcript + recording → R2 → summary email ---------- */
async function anam(env, path) { // the key: ANAM_API_KEY, else the Control Center's sealed slot anam.api_key (never logged)
  return fetch(ANAM + path, { headers: { Authorization: `Bearer ${await anamKey(env)}`, Accept: "application/json" } });
}
const personas = env => (env.ANAM_PERSONA_IDS ? String(env.ANAM_PERSONA_IDS).split(/[\s,]+/).filter(Boolean) : PERSONAS).map(s => s.toLowerCase());
async function fetchTranscript(env, sid) {
  const msgs = []; let offset = 0;
  for (let i = 0; i < LIM.transcriptPages; i++) {
    const r = await anam(env, `/sessions/${sid}/transcript?offset=${offset}&limit=100`);
    if (r.status === 404 || r.status === 503) return { notReady: true };
    if (r.status === 410) return { gone: true, msgs: [] };
    if (!r.ok) return { error: "transcript " + r.status };
    const j = await r.json();
    if (j.transcriptsEnabled === false) return { msgs: [], disabled: true };
    for (const x of Array.isArray(j.messages) ? j.messages : []) msgs.push({ r: x.role === "user" ? "user" : "persona", m: x.role === "user" ? str(x.message, 4000) : stripCues(str(x.message, 4000)), t: line(x.timestamp, 40) });
    if (j.nextOffset == null) break; offset = +j.nextOffset;
  }
  return { msgs };
}
async function storeRecording(env, m) {
  const r = await anam(env, `/sessions/${m.session_id}/recording`);
  if (r.status === 404 || r.status === 503) return { notReady: true };
  if (r.status === 410) return { gone: true };
  if (!r.ok) return { error: "recording " + r.status };
  const j = await r.json();
  if (!j.recordingUrl || !/^https:\/\//.test(j.recordingUrl)) return { error: "recording url missing" };
  const v = await fetch(j.recordingUrl);
  if (!v.ok || !v.body) return { error: "recording download " + v.status };
  const len = +v.headers.get("content-length") || 0;
  if (len > LIM.recordingBytes) return { error: "recording too large" };
  const key = `meetings/${m.id}.mp4`, meta = { httpMetadata: { contentType: (v.headers.get("content-type") || "video/mp4").split(";")[0] }, customMetadata: { meeting: m.id } };
  let body = v.body;
  if (len && typeof FixedLengthStream === "function") { const fl = new FixedLengthStream(len); v.body.pipeTo(fl.writable); body = fl.readable; } // eslint-disable-line no-undef
  else if (!len) body = await v.arrayBuffer();
  await env.MEDIA.put(key, body, meta);
  return { key };
}

const PLAN_RX = [["strategic", /الاستراتيجي|الإستراتيجي|strategic/i], ["partner", /الشريك الأساسي|الشريك الاساسي|الشركاء الأساسيين|core partner|partner plan/i], ["premium", /المميزة|premium/i], ["basic", /الباقة الأساسية|الباقه الاساسيه|الأساسية|basic plan/i], ["profile", /الملف المجاني|تسجيل بيانات الشركة فقط|free profile/i]];
const PLAN_NAME = { strategic: ["باقة الشريك الاستراتيجي", "Strategic Partner plan"], partner: ["باقة الشريك الأساسي", "Core Partner plan"], premium: ["الباقة المميزة", "Premium plan"], basic: ["الباقة الأساسية", "Basic plan"], profile: ["تسجيل بيانات الشركة فقط", "Company profile only"] };
const MARKET_RX = [["gulf", /الخليج|السعودي|الإمارات|الامارات|الكويت|قطر|عُمان|البحرين|gulf|saudi|uae|emirates|kuwait|qatar|oman|bahrain/i], ["africa", /أفريقيا|افريقيا|إفريقيا|africa/i], ["asia", /آسيا|اسيا|الصين|الهند|asia|china|india/i], ["europe", /أوروبا|اوروبا|europe|eu\b/i], ["local", /السوق المحلي|السوق المصري|محلي|local market/i]];
const MARKET_NAME = { gulf: ["الخليج", "Gulf"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"], local: ["السوق المحلي", "Local market"] };
/* Extractive summary: only what the visitor entered or what was actually said — nothing is invented */
export function summarize(m, msgs) {
  msgs = msgs || [];
  const user = msgs.filter(x => x.r === "user").map(x => x.m), all = msgs.map(x => x.m).join("\n");
  const cut = (s, n) => { s = line(s, n + 40); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
  const business = defang(m.activity ? cut(m.activity, 200) : cut(user.find(u => u.length > 25) || "", 200));
  const markets = MARKET_RX.filter(([, rx]) => rx.test(all + "\n" + (m.markets || ""))).map(([k]) => k);
  let plan = "";
  for (let i = msgs.length - 1; i >= 0 && !plan; i--) for (const [k, rx] of PLAN_RX) if (rx.test(msgs[i].m)) { plan = k; break; }
  const agenda = (() => { try { return JSON.parse(m.agenda_done || "[]"); } catch (e) { return []; } })();
  const questions = user.filter(u => /[?؟]/.test(u)).slice(0, 3).map(u => defang(cut(u, 160)));
  const registered = agenda.includes("register") || /سجّل|سجل|التسجيل|register|sign up/i.test(user.join("\n"));
  // no person follows up (owner decision 5): say what happens automatically
  const next = registered ? ["إكمال التسجيل على المنصة" + (plan ? " (" + PLAN_NAME[plan][0] + ")" : "") + ": ادخل بكود على الإيميل وكمّل بيانات شركتك، والدفع الإلكتروني الآمن أول ما يشتغل بيوصلك رابطه تلقائياً على الإيميل.", "Complete your registration on the platform" + (plan ? " (" + PLAN_NAME[plan][1] + ")" : "") + ": sign in with an email code and complete your company data; the secure payment link is emailed to you automatically once online payment is live."]
    : ["مراجعة الباقات على صفحة التسجيل، ولو عندك أي سؤال جنة بترد فوراً من أي صفحة في المنصة.", "Review the plans on the registration page; Janna answers any question instantly on every page of the platform."];
  const dur = m.started_at && m.ended_at ? Math.max(1, Math.round((Date.parse(m.ended_at) - Date.parse(m.started_at)) / 60000)) : null;
  const none = ["لم يُذكر", "not mentioned"];
  const ar = [`• نشاطك: ${business || none[0]}`, `• الأسواق اللي اتكلمنا عنها: ${markets.length ? markets.map(k => MARKET_NAME[k][0]).join("، ") : none[0]}`, `• الباقة اللي اتناقشت: ${plan ? PLAN_NAME[plan][0] : none[0]}`,
    `• محاور الاجتماع اللي اتغطّت: ${agenda.length ? agenda.map(a => AGENDA_AR[a]).join("، ") : none[0]}`, ...(questions.length ? ["• أسئلتك: " + questions.join(" | ")] : []), `• الخطوة الجاية: ${next[0]}`, ...(dur ? [`• مدة الاجتماع: حوالي ${dur} دقيقة`] : [])].join("\n");
  const en = [`• Your business: ${business || none[1]}`, `• Markets discussed: ${markets.length ? markets.map(k => MARKET_NAME[k][1]).join(", ") : none[1]}`, `• Plan discussed: ${plan ? PLAN_NAME[plan][1] : none[1]}`,
    `• Agenda covered: ${agenda.length ? agenda.map(a => AGENDA_EN[a]).join(", ") : none[1]}`, ...(questions.length ? ["• Your questions: " + questions.join(" | ")] : []), `• Next step: ${next[1]}`, ...(dur ? [`• Duration: about ${dur} min`] : [])].join("\n");
  return { business, markets, plan, questions, agenda, next_step: next, duration_min: dur, ar, en };
}
export function transcriptText(m, msgs) {
  const who = r => (r === "user" ? (firstName(m.name) || "Visitor") : "Janna / جنة");
  const t = s => { const d = Date.parse(s); return Number.isFinite(d) ? cairoLocal(d).time + " " : ""; };
  return "\ufeff" + `Made in Egypt Gate — meeting ${m.id} — ${fmtCairo(Date.parse(m.started_at || m.starts_at), "en")}\n\n` + msgs.map(x => `${t(x.t)}${who(x.r)}: ${x.m}`).join("\n") + "\n";
}

async function retryLater(env, m, error, nowMs) {
  const attempts = (m.proc_attempts || 0) + 1, base = Date.parse(m.ended_at || m.updated_at) || nowMs;
  const expired = nowMs - base > LIM.procHours * 3600e3;
  await env.DB.prepare("UPDATE meetings SET proc_attempts = ?, proc_next_at = ?, proc_error = ?, updated_at = ? WHERE id = ?")
    .bind(attempts, iso(nowMs + Math.min(60, 5 * attempts) * 60000), line(error, 200), iso(nowMs), m.id).run();
  return { pending: true, expired, error };
}
export async function processMeeting(env, id, nowMs = Date.now()) {
  let m = await getMeeting(env, id);
  if (!m || m.proc_status !== "pending") return { skipped: true };
  const age = nowMs - (Date.parse(m.ended_at) || nowMs), giveUp = age > LIM.procHours * 3600e3;
  const hasKey = !!(await anamKey(env));
  if (!hasKey && !giveUp) return retryLater(env, m, "anam not configured", nowMs);
  let msgs = null, notes = [];
  if (hasKey) {
    if (!m.session_checked) { // the session must be Janna's and have been live when it was attached to this meeting
      const r = await anam(env, `/sessions/${m.session_id}`);
      if (r.status === 404 || r.status === 503) { if (!giveUp) return retryLater(env, m, "session not found yet", nowMs); }
      else if (!r.ok) { if (!giveUp) return retryLater(env, m, "session " + r.status, nowMs); }
      else {
        // anchored on the server's own clock (session_at = when the id was handed in; client-supplied started_at is not trusted):
        // a live session lasts ≤ 10 min, so it started at most 15 min before, and had not ended (90 s grace) when it was attached
        const s = await r.json(), st = Date.parse(s.startTime), en = s.endTime ? Date.parse(s.endTime) : null;
        const at = Date.parse(m.session_at) || Date.parse(m.kind === "instant" ? m.created_at : m.started_at) || Date.parse(m.starts_at);
        const lo = at - 15 * 60000, hi = Math.min(at + 5 * 60000, (Date.parse(m.ended_at) || nowMs) + 15 * 60000);
        if (!personas(env).includes(String(s.personaId || "").toLowerCase()) || !(st >= lo && st <= hi) || (en != null && !(en >= at - 90000))) {
          await env.DB.prepare("UPDATE meetings SET proc_status = 'rejected', proc_error = 'session does not belong to this meeting', updated_at = ? WHERE id = ?").bind(iso(nowMs), id).run();
          await event(env, id, "processing_rejected", {});
          return { rejected: true };
        }
        await env.DB.prepare("UPDATE meetings SET session_checked = 1 WHERE id = ?").bind(id).run(); m.session_checked = 1;
      }
    }
    if (m.session_checked && m.consent) { // without recording consent neither the transcript nor the recording is fetched
      if (m.transcript_key && env.MEDIA) { const o = await env.MEDIA.get(m.transcript_key); if (o) try { msgs = JSON.parse(await o.text()); } catch (e) { msgs = null; } }
      else if (m.transcript) try { msgs = JSON.parse(m.transcript); } catch (e) { msgs = null; }
      if (!msgs) {
        const t = await fetchTranscript(env, m.session_id);
        if (t.notReady || t.error) { if (!giveUp) return retryLater(env, m, t.error || "transcript not ready", nowMs); notes.push("transcript"); msgs = []; }
        else {
          msgs = t.msgs; let s = JSON.stringify(msgs); while (s.length > LIM.transcriptChars && msgs.length) { msgs = msgs.slice(0, -1); s = JSON.stringify(msgs); }
          if (env.MEDIA) { const key = `meetings/${id}.transcript.json`; await env.MEDIA.put(key, s, { httpMetadata: { contentType: "application/json" } }); await env.DB.prepare("UPDATE meetings SET transcript_key = ? WHERE id = ?").bind(key, id).run(); }
          else await env.DB.prepare("UPDATE meetings SET transcript = ? WHERE id = ?").bind(s, id).run();
        }
      }
      if (m.consent && env.MEDIA && !m.recording_key) { // never touch the recording without the visitor's consent
        const rec = await storeRecording(env, m);
        if (rec.key) { await env.DB.prepare("UPDATE meetings SET recording_key = ? WHERE id = ?").bind(rec.key, id).run(); m.recording_key = rec.key; await event(env, id, "recording_stored", {}); }
        else if (rec.notReady && age < LIM.recordingWaitHours * 3600e3) return retryLater(env, m, "recording not ready", nowMs);
        else if (rec.error && !rec.notReady && !giveUp && (m.proc_attempts || 0) < 6) return retryLater(env, m, rec.error, nowMs);
        else notes.push("recording");
      } else if (m.consent && !m.recording_key) notes.push("recording");
    } else if (m.consent) notes.push("transcript");
  } else if (m.consent) notes.push("transcript");
  m = await getMeeting(env, id);
  msgs = m.consent ? msgs || [] : []; // consent withdrawn meanwhile → nothing from the conversation is used
  const sum = summarize(m, msgs);
  const link = m.consent && m.recording_key ? await recordingLink(env, id, nowMs) : "";
  const fn = firstName(m.name), en1 = m.language === "en";
  const ar = `أهلاً ${fn}،\n\nشكراً على وقتك في الاجتماع التعريفي مع جنة على منصة صنع في مصر. ده ملخص اللي اتكلمنا فيه:\n\n${sum.ar}\n\n`
    + (link ? `تسجيل الاجتماع (اللينك صالح ${LIM.linkDays} يوم ومخصوص ليك، متشاركوش):\n${link}\n\n` : m.consent ? "تسجيل الفيديو مش متاح للاجتماع ده" + (msgs.length ? "، والنص المكتوب مرفق.\n\n" : ".\n\n") : "الاجتماع ماتسجّلش بناءً على اختيارك، فالملخص ده مبني بس على البيانات اللي كتبتها ومحاور الاجتماع اللي اتعلّم عليها، ومفيش نص للمحادثة اتحفظ عندنا.\n\n")
    + (msgs.length ? "النص الكامل للاجتماع مرفق في ملف transcript.txt.\n" : "") + `صفحة التسجيل في المنصة: ${site(env)}register.html`;
  const en = `Hello ${fn},\n\nThank you for your time in the introductory meeting with Janna on Made in Egypt Gate. Here is a summary:\n\n${sum.en}\n\n`
    + (link ? `Meeting recording (personal link, valid ${LIM.linkDays} days — please do not share it):\n${link}\n\n` : m.consent ? "A video recording is not available for this meeting" + (msgs.length ? "; the written transcript is attached.\n\n" : ".\n\n") : "The meeting was not recorded, as you chose, so this summary is based only on the details you entered and the agenda items ticked; no transcript of the conversation was kept.\n\n")
    + (msgs.length ? "The full transcript is attached as transcript.txt.\n" : "") + `Registration page: ${site(env)}register.html?lang=en`;
  const att = msgs.length ? [{ filename: "transcript.txt", content: transcriptText(m, msgs), type: "text/plain; charset=utf-8", inline: true }] : [];
  const res = await mail(env, { id: "ms-" + id, from: janna(env), to: [m.email], replyTo: team(env), subject: en1 ? "Your meeting with Janna — summary" + (link ? " & recording" : "") : "ملخص اجتماعك مع جنة" + (link ? " وتسجيله" : "") + " — منصة صنع في مصر",
    text: (en1 ? en + "\n\n—\n\n" + ar : ar + "\n\n—\n\n" + en), attachments: att });
  if (!res.sent && !giveUp) return retryLater(env, m, res.error || "email not sent", nowMs);
  await teamEmail(env, m, "finished", "الملخص / Summary:\n" + sum.ar + "\n\n" + sum.en + (notes.length ? "\n(missing: " + notes.join(", ") + ")" : ""));
  await env.DB.prepare("UPDATE meetings SET proc_status = ?, proc_error = ?, summary = ?, transcript = '', emailed_at = ?, updated_at = ? WHERE id = ?")
    .bind(res.sent ? (notes.length ? "partial" : "done") : "failed", res.sent ? notes.join(",") : line(res.error, 200), JSON.stringify({ ar: sum.ar, en: sum.en }), res.sent ? iso(nowMs) : "", iso(nowMs), id).run();
  await event(env, id, "summary_email", { sent: !!res.sent, recording: !!link, missing: notes });
  return { done: !!res.sent, recording: !!link, missing: notes };
}

/* ---------- cron (every 15 min) ---------- */
export async function dueReminders(env, nowMs = Date.now()) {
  const h24 = (await env.DB.prepare("SELECT * FROM meetings WHERE status = 'scheduled' AND reminded_24h = '' AND starts_at <= ? AND starts_at > ? ORDER BY starts_at LIMIT 50").bind(iso(nowMs + 24 * 3600e3), iso(nowMs + 2 * 3600e3)).all()).results;
  const h1 = (await env.DB.prepare("SELECT * FROM meetings WHERE status = 'scheduled' AND reminded_1h = '' AND starts_at <= ? AND starts_at > ? ORDER BY starts_at LIMIT 50").bind(iso(nowMs + 75 * 60000), iso(nowMs)).all()).results;
  return { h24, h1 };
}
async function remind(env, m, which) {
  const ms = Date.parse(m.starts_at), url = meetingUrl(env, m.id), fn = firstName(m.name);
  const ar = which === "24h" ? `أهلاً ${fn}، فكّرتك إن اجتماعك التعريفي مع جنة بكرة: ${fmtCairo(ms, "ar")}.\nلينك الاجتماع: ${url}` : `أهلاً ${fn}، اجتماعك مع جنة كمان ساعة تقريباً: ${fmtCairo(ms, "ar")}.\nادخل من هنا قبل الموعد بـ 10 دقايق: ${url}`;
  const en = which === "24h" ? `Hello ${fn}, a reminder that your introductory meeting with Janna is tomorrow: ${fmtCairo(ms, "en")}.\nMeeting link: ${url}` : `Hello ${fn}, your meeting with Janna starts in about an hour: ${fmtCairo(ms, "en")}.\nJoin up to 10 minutes early: ${url}`;
  const cancel = await cancelUrl(env, m.id);
  const e = await mail(env, { id: `mr${which}-${m.id}`, from: janna(env), to: [m.email], replyTo: team(env), subject: m.language === "en" ? "Reminder: your meeting with Janna" : "تذكير: اجتماعك مع جنة", text: (m.language === "en" ? en + "\n\n—\n\n" + ar : ar + "\n\n—\n\n" + en) + `\n\n—\nلو مش هتقدر تحضر / Can't make it: ${cancel}` });
  const w = m.phone && waOn(env) ? await sendWhatsApp(env, m.phone, m.language, [fn || "-", fmtCairo(ms, m.language), url]) : { sent: false };
  await event(env, m.id, "reminder_" + which, { email: !!e.sent, whatsapp: !!w.sent, error: e.error || w.error || "" });
  return { email: !!e.sent, whatsapp: !!w.sent };
}
export async function meetingsCron(env, nowMs = Date.now()) {
  const out = { reminders24: 0, reminders1: 0, whatsapp: 0, processed: 0, missed: 0, closed: 0 };
  if (!env || !env.DB) return out;
  const { h24, h1 } = await dueReminders(env, nowMs);
  for (const [list, col, which] of [[h24, "reminded_24h", "24h"], [h1, "reminded_1h", "1h"]]) for (const m of list) {
    const claim = await env.DB.prepare(`UPDATE meetings SET ${col} = ? WHERE id = ? AND ${col} = ''`).bind(iso(nowMs), m.id).run(); // claim first: never send twice
    if (!claim.meta || !claim.meta.changes) continue;
    const r = await remind(env, m, which); out[which === "24h" ? "reminders24" : "reminders1"]++; if (r.whatsapp) out.whatsapp++;
  }
  // live meetings whose finish never arrived (tab closed, network) → close them and process what Anam has
  const stale = (await env.DB.prepare("SELECT id, session_id FROM meetings WHERE status = 'live' AND updated_at < ? LIMIT 20").bind(iso(nowMs - 2 * 3600e3)).all()).results;
  for (const s of stale) {
    await env.DB.prepare("UPDATE meetings SET status = 'ended', ended_at = CASE WHEN ended_at = '' THEN ? ELSE ended_at END, proc_status = ?, proc_next_at = ?, updated_at = ? WHERE id = ? AND status = 'live'")
      .bind(iso(nowMs), s.session_id ? "pending" : "none", iso(nowMs), iso(nowMs), s.id).run();
    await event(env, s.id, "auto_closed", {}); out.closed++;
  }
  out.missed = ((await env.DB.prepare("UPDATE meetings SET status = 'missed', updated_at = ? WHERE status = 'scheduled' AND starts_at < ?").bind(iso(nowMs), iso(nowMs - 2 * 3600e3)).run()).meta || {}).changes || 0;
  const pend = (await env.DB.prepare("SELECT id FROM meetings WHERE status = 'ended' AND proc_status = 'pending' AND proc_next_at <= ? ORDER BY proc_next_at LIMIT ?").bind(iso(nowMs), LIM.cronBatch).all()).results;
  for (const p of pend) { try { const r = await processMeeting(env, p.id, nowMs); if (r.done || r.rejected) out.processed++; } catch (e) { console.error("meeting cron processing", p.id, e && e.stack || e); } }
  return out;
}
