/* AI Deal Advisor («المستشار الذكي للصفقات») — backend for advisor.html (partner / strategic plans).
   Routed from index.js: every path under /api/advisor/* and the Worker's email() handler.

   GET    /api/advisor/health                  → {ok, email, store, auth, mode, login}
   POST   /api/advisor/session                 {member_id, company, email, plan} → {token, expires_at, member}   (server-to-server)
   POST   /api/advisor/activation              X-Platform-Key; {member_id, company, email, plan, send_email?} → {member, activation_url, expires_at, emailed}
   POST   /api/advisor/login                   {code} (one-time code from an activation / email link) → {token, expires_at, member}
   POST   /api/advisor/login/email             {email} → {ok:true} (emails a fresh login link to an active, verified member)
   POST   /api/advisor/refresh                 Bearer → {token, expires_at, member}
   (Bearer token on everything below; a member only ever sees their own deals)
   GET    /api/advisor/deals                   → {deals}
   POST   /api/advisor/deals                   {opportunity:{ref,title,entity,market,country,source_url,closing_date,kind}, stage?, notes?} → {deal}
   GET    /api/advisor/deals/:id               → {deal, events}
   PATCH  /api/advisor/deals/:id               {stage?, notes?, next_action?, due_date?, contact_email?, contact_name?, value?} → {deal}
   DELETE /api/advisor/deals/:id               → {ok}
   GET    /api/advisor/deals/:id/messages      → {messages}
   POST   /api/advisor/deals/:id/email         {to, subject, body, cc?} → {message, sent, error?}
   POST   /api/advisor/send                    {to, subject, body, cc?, deal_id? | opportunity?:{ref,title,entity,market,country,source_url,
                                                closing_date,kind} | market?, via?, to_source?} → {message, sent, error?, code?, deal, deal_created}
                                                Bassem's «ابعت» in the live call (bassem_send_email) and the call's e-mail draft: the same
                                                checks and limits as /deals/:id/email, on the deal of that opportunity — started here when the
                                                member has none yet (an Information Center notice too, market codes like africa:ke), or the
                                                e-mail's own deal (kind "direct", one per recipient) when it is about no opportunity
   Inbound: mail to deal-<id>@<REPLY_DOMAIN> → stored as an "in" message (with envelope sender + verification label) + copy
   to the member while the member's plan is still eligible.

   Storage = D1 (binding DB, schema.sql). Secrets: ADVISOR_SECRET (token HMAC), PLATFORM_KEY (only the platform backend may
   open sessions), RESEND_API_KEY (or the SEND_EMAIL Cloudflare Email Service binding). No keys live in this file. */
import PostalMime from "postal-mime";
import { authUser, isV2, isLinkSession } from "./auth.js"; // one platform login (email code) also opens the advisor for partner / strategic
import { sendToMember, waOn } from "./whatsapp.js";
import { effPlan } from "./common.js";
import { rematchForMember } from "./inquiries.js";
import { deliver, mailReady, attachProvider, loadMailConfig } from "./email-center.js"; // e-mail center: provider, sender, idempotency, delivery log
import { parseRefs, refTitles, resolveNotifyItems, notifyMail, notifyWa, dropFiles, replyItems, whyMap, NOTIFY_LIM } from "./notify-items.js"; // «ابعتلي» with the opportunities

export const STAGES = ["discover", "contact", "offer", "negotiation", "contract", "delivery", "won", "lost"];
export const MARKETS = ["local", "gulf", "africa", "asia", "europe"];
export const PLAN_MARKETS = { partner: ["local", "gulf", "africa"], strategic: MARKETS }; // same as data/plan.js
export const ELIGIBLE = Object.keys(PLAN_MARKETS); // exported: acc.js applyPlans() mutates it in place (never reassigned)
const TOKEN_DAYS = 30;
const LIM = { request: 64 * 1024, subject: 200, body: 20000, notes: 5000, field: 300, deals: 500, recipients: 5, emailsPerDay: 30, newRecipientsPerDay: 10, inboundBody: 50000, inboundRaw: 10 * 1024 * 1024, inboundPerDealDay: 20, inboundPerMemberDay: 200, notifyPerDealHour: 3, loginDays: 7, loginEmailsPerHour: 3 };
const SUPPORT = "info@madeinegyptgate.com"; // the platform mailbox that exists on Hostinger (support@ does not)
const DEFAULT_FROM = "noreply@madeinegyptgate.com";
const DEFAULT_REPLY_DOMAIN = "reply.madeinegyptgate.com";
const SITE = "https://madeinegyptgate.com/";
const site = env => { const u = String((env && env.SITE_URL) || SITE); return /^https:\/\/[^\s"<>]+\/$/.test(u) ? u : SITE; };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "86400" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
const err = (s, error, extra) => json({ error, ...(extra || {}) }, s);

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const now = () => new Date().toISOString();
// JSON values only: objects/arrays become "" (String({toString:1}) would throw and turn a bad request into a 500)
const scalar = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const str = (v, max = LIM.field) => scalar(v).replace(/\u0000/g, "").trim().slice(0, max);
const line = (v, max = LIM.field) => str(v, max * 2).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max); // single line: no header injection
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
export const isEmail = e => typeof e === "string" && e.length <= 254 && EMAIL_RE.test(e);
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const b64url = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
const replyDomain = env => line((env && env.REPLY_DOMAIN) || DEFAULT_REPLY_DOMAIN, 120).toLowerCase();
/* the ONE sender of the platform (owner decision): MAIL_FROM = «منصة صنع في مصر <noreply@madeinegyptgate.com>» (domain verified
   at Resend). It may be "Display Name <address>" or a bare address; a missing / invalid value falls back to that default. */
export const DEFAULT_SENDER = Object.freeze({ email: DEFAULT_FROM, name: "منصة صنع في مصر" });
export function parseFrom(v, fallback = DEFAULT_SENDER) {
  const s = String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, 320);
  const m = s.match(/^"?([^"<>]*?)"?\s*<([^<>\s]+)>$/);
  const email = (m ? m[2] : s).trim().toLowerCase(), name = m ? m[1].replace(/["\\]/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 80) : "";
  return isEmail(email) ? { email, name: name || fallback.name } : { email: fallback.email, name: fallback.name };
}
export const sender = env => parseFrom(env && env.MAIL_FROM);
const mailFrom = env => sender(env).email;
/* email replies reach the platform only when Cloudflare Email Routing delivers REPLY_DOMAIN to this Worker (owner decision:
   it stays OFF — BACKLOG 24/31). INBOUND_REPLY_ENABLED=1 turns the reply-by-email paths on (INBOUND_EMAIL=1 = old name). */
export const inboundOn = env => /^(1|on|true|yes)$/i.test(String((env && (env.INBOUND_REPLY_ENABLED || env.INBOUND_EMAIL)) || ""));
export const replyAddress = (env, dealId) => `deal-${dealId}@${replyDomain(env)}`;
/* where a recipient's "Reply" goes for a deal email: the deal address when Email Routing is on, else the member's own mailbox */
const dealReplyTo = (env, dealId, member) => (inboundOn(env) || !isEmail(member && member.email) ? replyAddress(env, dealId) : String(member.email).toLowerCase());
const displayName = company => (line(company, 80).replace(/["<>,;:\\()[\]@]/g, "").trim() || "Member") + " via Made in Egypt Gate";
const dailyLimit = env => Math.max(1, Math.min(500, parseInt(env && env.MAX_EMAILS_PER_DAY, 10) || LIM.emailsPerDay));
const isUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch (e) { return false; } };
export function addrList(v) { // "a@x.com, b@y.com" or ["a@x.com"] → {list, bad}; anything that is not a string is "bad"
  const list = [], bad = [];
  if (v != null && typeof v !== "string" && !Array.isArray(v)) return { list, bad: ["(not a string)"] };
  const raw = Array.isArray(v) ? v : String(v == null ? "" : v).split(/[,;]/);
  for (let a of raw) {
    if (typeof a !== "string") { bad.push("(not a string)"); continue; }
    a = a.trim(); const m = a.match(/<([^>]+)>\s*$/); if (m) a = m[1].trim(); if (!a) continue;
    (isEmail(a) ? list : bad).push(isEmail(a) ? a.toLowerCase() : a.slice(0, 100));
  }
  return { list: [...new Set(list)], bad };
}
const domainOf = a => String(a || "").split("@").pop().toLowerCase();
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
const intEnv = (v, def, lo, hi) => { const n = parseInt(v, 10); return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : def)); };
async function readJson(req) {
  const t = await req.text();
  if (t.length > LIM.request) return { tooLarge: true };
  if (!t) return {};
  try { const o = JSON.parse(t); return o && typeof o === "object" && !Array.isArray(o) ? o : { bad: true }; } catch (e) { return { bad: true }; }
}

/* ---------- tokens: v1.<b64url(member_id)>.<plan>.<exp>.<HMAC-SHA256(member_id|plan|exp)> ---------- */
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
export async function signToken(secret, memberId, plan, exp) {
  return ["v1", b64url(enc.encode(memberId)), plan, exp, await hmac(secret, `${memberId}|${plan}|${exp}`)].join(".");
}
export async function verifyToken(secret, token) {
  const p = String(token || "").split(".");
  if (p.length !== 5 || p[0] !== "v1" || !secret) return null;
  let memberId; try { memberId = new TextDecoder().decode(unb64url(p[1])); } catch (e) { return null; }
  const plan = p[2], exp = +p[3];
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  if (!safeEq(await hmac(secret, `${memberId}|${plan}|${exp}`), p[4])) return null;
  return { memberId, plan, exp };
}
export const FORBIDDEN = Symbol("plan not eligible");
export const LINK_ONLY = Symbol("login-link session");
/* exported for profile.js (/api/advisor/profile): the same sign-in rule as every advisor endpoint */
export async function authenticate(req, env) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  if (isV2(m[1])) { // platform session (POST /api/auth/verify): the plan is checked here on the server, never trusted from the page
    const u = await authUser(req, env, m[1]);
    if (!u) return null;
    if (isLinkSession(u)) return LINK_ONLY; // an e-mailed login link never opens Bassem (he sends e-mail as the company) — SEC M2
    return ELIGIBLE.includes(effPlan(u)) ? { ...u, plan: effPlan(u) } : FORBIDDEN;
  }
  const t = await verifyToken(env.ADVISOR_SECRET, m[1]);
  if (!t) return null;
  const member = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(t.memberId).first();
  if (!member || !ELIGIBLE.includes(effPlan(member))) return null; // plan downgraded / expired / member removed → token stops working
  return member;
}

/* ---------- email sending (provider-agnostic) ----------
   msg = {id, from:{email,name}, to:[...], cc:[...], replyTo, subject, text, html}
   1) RESEND_API_KEY → POST https://api.resend.com/emails (Bearer key; body from,to,cc,reply_to,subject,text,html,headers;
      Idempotency-Key header) → {id}
   2) SEND_EMAIL binding (Cloudflare Email Service) → env.SEND_EMAIL.send({from:{email,name}, to, cc, replyTo, subject, text, html}) → {messageId}
   3) none → {sent:false, error:"email not configured"} (caller keeps the message as a draft) */
/* "Name <addr>" for the From header; a name with RFC 5322 specials (, ; : . @ ( ) …) is quoted */
export const fmtFrom = f => { const n = String((f && f.name) || "").replace(/["\\\r\n]/g, "").trim(); return n ? `${/[()<>\[\]:;@\\,."]/.test(n) ? `"${n}"` : n} <${f.email}>` : f.email; };
export async function sendEmail(env, msg) { return deliver(env, msg); } // provider, sender, idempotency and delivery log live in email-center.js
const emailConfigured = env => !!(env && mailReady(env));

const team = env => { const t = line((env && env.TEAM_EMAIL) || "", 254); return isEmail(t) ? t : ""; };
/* optOutTo = "" → opt-out by replying "unsubscribe" (Email Routing on); else a reply reaches the member directly, and opt-outs /
   abuse reports go to the platform mailbox optOutTo (TEAM_EMAIL) */
function footer(company, optOutTo) {
  const c = line(company, 80) || "a member";
  if (optOutTo) return { ar: `أُرسلت هذه الرسالة عبر منصة صنع في مصر (madeinegyptgate.com) نيابةً عن ${c}. للرد اضغط «رد» — ردك بيوصل لـ${c} مباشرةً.`, en: `Sent via Made in Egypt Gate (madeinegyptgate.com) on behalf of ${c}. Just reply — your answer goes to ${c} directly.`,
    optout_ar: `لإيقاف رسائل هذا العضو إليك أو للإبلاغ عن إساءة راسل: ${optOutTo}`, optout_en: `To stop emails from this member or to report abuse, write to: ${optOutTo}` };
  return { ar: `أُرسلت هذه الرسالة عبر منصة صنع في مصر (madeinegyptgate.com) نيابةً عن ${c}. للرد اضغط «رد» مباشرةً.`, en: `Sent via Made in Egypt Gate (madeinegyptgate.com) on behalf of ${c}. Just reply to this email to respond.`,
    optout_ar: `لإيقاف رسائل هذا العضو إليك ردّ بكلمة unsubscribe في عنوان الرسالة. للإبلاغ عن إساءة: ${SUPPORT}`, optout_en: `To stop emails from this member, reply with "unsubscribe" as the subject. To report abuse: ${SUPPORT}` };
}
function toHtml(text, foot) {
  const p = esc(text).replace(/\r?\n/g, "<br>");
  const f = foot ? `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px"><div style="color:#777;font-size:12px" dir="auto">${esc(foot.ar)}<br>${esc(foot.en)}${foot.optout_ar ? "<br>" + esc(foot.optout_ar) + "<br>" + esc(foot.optout_en) : ""}</div>` : "";
  return `<div dir="auto" style="font-family:Arial,Tahoma,sans-serif;font-size:15px;line-height:1.7;color:#222">${p}${f}</div>`;
}
const htmlToText = h => String(h || "").replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

/* ---------- serialisers ---------- */
function dealOut(d, env) {
  if (!d) return null;
  const opportunity = { ref: d.ref, title: d.title, entity: d.entity, market: d.market, country: d.country, source_url: d.source_url, closing_date: d.closing_date, kind: d.kind };
  return { id: d.id, ...opportunity, opportunity, stage: d.stage, notes: d.notes, next_action: d.next_action, due_date: d.due_date, contact_email: d.contact_email, contact_name: d.contact_name, value: d.value, reply_to: inboundOn(env) ? replyAddress(env, d.id) : "", messages_count: d.messages_count ?? undefined, last_message_at: d.last_message_at ?? undefined, last_in_at: d.last_in_at ?? undefined, created_at: d.created_at, updated_at: d.updated_at };
}
const msgOut = m => ({ id: m.id, direction: m.direction, status: m.status, from: m.from_addr, to: m.to_addr, cc: m.cc || "", subject: m.subject, body: m.body, at: m.at, ...(m.error ? { error: m.error } : {}),
  ...(m.direction === "in" ? { envelope_from: m.envelope_from || "", sender_verified: !!m.sender_verified, sender_auth: m.sender_auth || "", ...(m.sender_verified ? {} : { sender_warning: UNVERIFIED }) } : {}) });
const event = (env, dealId, memberId, type, data) => env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES (?, ?, ?, ?, ?)").bind(dealId || "", memberId, type, JSON.stringify(data || {}), now()).run();
const getDeal = (env, id, memberId) => env.DB.prepare("SELECT * FROM deals WHERE id = ? AND member_id = ?").bind(id, memberId).first();

/* ---------- HTTP router ---------- */
export async function handleAdvisor(req, env, ctx) {
  env = env || {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname.replace(/^\/api\/advisor/, "").replace(/\/+$/, "") || "/";
  try {
    if (path === "/health" || path === "/") return await health(env);
    if (!env.DB) return err(503, "store not configured");
    if (!env.ADVISOR_SECRET) return err(503, "auth not configured");
    if (path === "/session") return req.method === "POST" ? await session(req, env) : err(405, "method not allowed");
    if (path === "/activation") return req.method === "POST" ? await activation(req, env) : err(405, "method not allowed");
    if (path === "/login") return req.method === "POST" ? await login(req, env) : err(405, "method not allowed");
    if (path === "/login/email") return req.method === "POST" ? await loginEmail(req, env) : err(405, "method not allowed");

    const member = await authenticate(req, env);
    if (member === FORBIDDEN) return err(403, "plan not eligible", { code: "plan", eligible: ELIGIBLE });
    if (member === LINK_ONLY) return err(403, "sign in with an e-mail code to open Bassem", { code: "full_login_required", login: "code" });
    if (!member) return err(401, "unauthorized", env.PLATFORM_KEY || env.ADVISOR_OPEN_MODE !== "1" ? { login: "activation" } : undefined);
    if (path === "/notify") return req.method === "POST" ? await notifyMember(req, env, member, ctx) : err(405, "method not allowed");
    if (path === "/send") return req.method === "POST" ? await sendFromCall(req, env, member) : err(405, "method not allowed");
    if (path === "/refresh") return req.method === "POST" ? (isV2((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")) ? err(400, "platform sessions are renewed by signing in again", { code: "platform_session" }) : json(await issue(env, member))) : err(405, "method not allowed");
    if (path === "/deals") {
      if (req.method === "GET") return await listDeals(env, member);
      if (req.method === "POST") return await createDeal(req, env, member);
      return err(405, "method not allowed");
    }
    let m;
    if ((m = path.match(/^\/deals\/([a-f0-9]{16})$/))) {
      if (req.method === "GET") return await showDeal(env, member, m[1]);
      if (req.method === "PATCH") return await patchDeal(req, env, member, m[1]);
      if (req.method === "DELETE") return await deleteDeal(env, member, m[1]);
      return err(405, "method not allowed");
    }
    if ((m = path.match(/^\/deals\/([a-f0-9]{16})\/messages$/))) return req.method === "GET" ? await listMessages(env, member, m[1]) : err(405, "method not allowed");
    if ((m = path.match(/^\/deals\/([a-f0-9]{16})\/email$/))) return req.method === "POST" ? await sendDealEmail(req, env, member, m[1]) : err(405, "method not allowed");
    return err(404, "not found");
  } catch (e) {
    console.error("advisor error", e && e.stack || e);
    return err(500, "server error");
  }
}

async function health(env) {
  const store = env.DB ? "d1" : "none";
  let schema = "";
  if (env.DB) {
    try { await env.DB.prepare("SELECT 1 FROM members LIMIT 1").first(); schema = "ok"; } catch (e) { schema = "missing"; }
    if (schema === "ok") try { await env.DB.prepare("SELECT 1 FROM logins LIMIT 1").first(); await env.DB.prepare("SELECT 1 FROM contacts LIMIT 1").first(); await env.DB.prepare("SELECT sender_verified FROM messages LIMIT 1").first(); } catch (e) { schema = "outdated"; }
  }
  const ok = !!(env.DB && schema === "ok" && env.ADVISOR_SECRET);
  // mode "platform": members get a session only through an activation / email login link (or the platform server);
  // the page must not open sessions itself and should tell the member it is waiting for activation.
  // mode "open" (testing only): the page may open its own unverified session; nothing is sent through the provider.
  // "open" only when ADVISOR_OPEN_MODE=1 is set explicitly (local testing): without PLATFORM_KEY the advisor stays closed — sessions
  // come from the platform's email-code login (partner / strategic, checked on the server) or from activation links.
  const open = env.ADVISOR_OPEN_MODE === "1" && !env.PLATFORM_KEY, platform = !!env.PLATFORM_KEY;
  return json({ ok, email: emailConfigured(env), store, auth: !!env.ADVISOR_SECRET, mode: open ? "open" : "platform", login: open ? "self" : "activation", email_login: platform && emailConfigured(env), sending: !open && emailConfigured(env) ? "platform" : "drafts", platform_key: platform,
    ...(open ? { warning: "ADVISOR_OPEN_MODE=1: testing only — anyone can open an unverified advisor session" } : {}),
    ...(schema === "missing" ? { error: "schema missing (run schema.sql)" } : schema === "outdated" ? { error: "schema outdated (run migrations/0002_advisor_security.sql)" } : {}) });
}

const memberOut = m => ({ id: m.id, company: m.company, email: m.email, plan: m.plan, verified: !!m.verified, markets: PLAN_MARKETS[m.plan] || [], activated_at: m.activated_at || "", name: m.name || "", title: m.title || "" });
async function issue(env, member) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  return { token: await signToken(env.ADVISOR_SECRET, member.id, member.plan, exp), expires_at: new Date(exp * 1000).toISOString(), member: memberOut(member) };
}
function platformKeyOk(req, env) { return !!env.PLATFORM_KEY && safeEq(req.headers.get("X-Platform-Key") || "", env.PLATFORM_KEY); }
/* upsert a member as the platform says it is (plan from the platform, never from the browser) */
async function upsertVerified(env, b) {
  const memberId = str(b.member_id, 64), plan = line(b.plan, 20).toLowerCase(), company = line(b.company, 120), email = line(b.email, 254).toLowerCase();
  if (!/^[\w.@:+-]{1,64}$/.test(memberId)) return { error: err(400, "member_id required (1-64 chars: letters, digits, . _ - @ : +)") };
  if (email && !isEmail(email)) return { error: err(400, "invalid email") };
  const existing = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first();
  if (!ELIGIBLE.includes(plan)) {
    // the platform reports a lower plan → revoke: every token and pending login link of that member stops working
    if (existing) await env.DB.prepare("UPDATE members SET plan = ?, updated_at = ? WHERE id = ?").bind(plan || "none", now(), memberId).run();
    return { error: err(403, "plan not eligible", { eligible: ELIGIBLE }) };
  }
  const t = now();
  // activated_at: the day the paid year starts (kept across devices; a renewal / re-activation after a lapse restarts it)
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, activated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET company = excluded.company, email = excluded.email, plan = excluded.plan, verified = 1, updated_at = excluded.updated_at, activated_at = CASE WHEN members.activated_at = '' OR members.plan NOT IN ('partner', 'strategic') THEN excluded.activated_at ELSE members.activated_at END")
    .bind(memberId, company, email, plan, t, t, t).run();
  if (!existing) await event(env, "", memberId, "member_created", { plan, verified: true });
  else if (existing.plan !== plan) await event(env, "", memberId, "plan_changed", { from: existing.plan, to: plan });
  return { member: await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first() };
}
async function newLoginCode(env, memberId, purpose, ttlMs) {
  const code = hex(24), t = Date.now(), expires = new Date(t + (ttlMs || LIM.loginDays * 86400000)).toISOString();
  await env.DB.prepare("INSERT INTO logins (code_hash, member_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256(code), memberId, purpose, new Date(t).toISOString(), expires).run();
  return { code, url: site(env) + "advisor.html#login=" + code, expires_at: expires };
}
async function sendLoginEmail(env, member, link, purpose) {
  const company = line(member.company, 80) || member.id;
  const text = purpose === "activation"
    ? `تم تفعيل «المستشار الذكي للصفقات» لحساب ${company} على منصة صنع في مصر.\nافتح الرابط ده لتسجيل الدخول (يُستخدم مرة واحدة وصالح ${LIM.loginDays} أيام):\n${link.url}\n\nThe AI Deal Advisor is now active for ${company} on Made in Egypt Gate.\nOpen this link to sign in (single use, valid ${LIM.loginDays} days):\n${link.url}\n\n—\nلو مش انت اللي طلبت ده، تجاهل الرسالة أو راسلنا / If this was not you, ignore this email or contact us: ${SUPPORT}`
    : `رابط دخول جديد للمستشار الذكي للصفقات (${company}) — يُستخدم مرة واحدة وصالح ${LIM.loginDays} أيام:\n${link.url}\n\nNew sign-in link for the AI Deal Advisor (${company}) — single use, valid ${LIM.loginDays} days:\n${link.url}\n\n—\nلو مش انت اللي طلبت الرابط، تجاهل الرسالة / If you did not ask for this link, ignore this email. ${SUPPORT}`;
  return sendEmail(env, { id: "l-" + link.code.slice(0, 16), from: { email: mailFrom(env), name: sender(env).name }, to: [member.email], subject: purpose === "activation" ? "تفعيل المستشار الذكي للصفقات / AI Deal Advisor activated" : "رابط الدخول / Your sign-in link — AI Deal Advisor", text, html: toHtml(text) });
}

/* a one-time sign-in link straight into the advisor (single use, short-lived) — Bassem's "I'm ready, let's talk" WhatsApp (BACKLOG 13).
   advisor.html?live=1#login=<code>&live=1 : advisor.part.py exchanges the code (POST /login) and the page opens the live call. */
export async function advisorCallLink(env, memberId, ttlMs = 12 * 3600e3) {
  const link = await newLoginCode(env, memberId, "wa_call", ttlMs);
  return { url: site(env) + "advisor.html?live=1#login=" + link.code + "&live=1", expires_at: link.expires_at };
}

/* POST /activation — called by the platform (admin after confirming payment, a payment webhook, or tools/activate.mjs).
   Creates/updates the verified member and returns a one-time login link; with a sending provider it is emailed to the member. */
async function activation(req, env) {
  if (!env.PLATFORM_KEY) return err(503, "platform mode not configured (set PLATFORM_KEY)");
  if (!platformKeyOk(req, env)) return err(401, "platform key required");
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const r = await upsertVerified(env, b);
  if (r.error) return r.error;
  const link = await newLoginCode(env, r.member.id, "activation");
  await event(env, "", r.member.id, "activation_link", { expires_at: link.expires_at });
  try { await rematchForMember(env, r.member.id); } catch (e) { console.error("rematch after activation", e && e.message); } // open requests it matches go out automatically
  let emailed = false, email_error;
  if (b.send_email !== false && isEmail(r.member.email)) {
    if (emailConfigured(env)) { const s = await sendLoginEmail(env, r.member, link, "activation"); emailed = !!s.sent; if (!s.sent) email_error = s.error; }
    else email_error = "email not configured";
  }
  return json({ member: memberOut(r.member), activation_url: link.url, expires_at: link.expires_at, emailed, ...(email_error ? { email_error } : {}) });
}

/* POST /login {code} — exchanges a one-time code (from #login=<code> in the link) for a member token */
async function login(req, env) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const code = str(b.code, 100);
  if (!/^[a-f0-9]{48}$/.test(code)) return err(400, "code required");
  const h = await sha256(code), t = now();
  const row = await env.DB.prepare("SELECT * FROM logins WHERE code_hash = ?").bind(h).first();
  if (!row || row.used_at || row.expires_at < t || row.purpose === "inq_link") return err(401, "invalid or expired link", { login: "activation" }); // dashboard links (auth.js) are not advisor codes
  const used = await env.DB.prepare("UPDATE logins SET used_at = ? WHERE code_hash = ? AND used_at = ''").bind(t, h).run();
  if (!used.meta || used.meta.changes !== 1) return err(401, "invalid or expired link", { login: "activation" });
  const member = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(row.member_id).first();
  if (!member || !member.verified || !ELIGIBLE.includes(member.plan)) return err(403, "plan not eligible", { eligible: ELIGIBLE });
  await event(env, "", member.id, "login", { purpose: row.purpose });
  return json(await issue(env, member));
}

/* POST /login/email {email} — a member whose session expired asks for a new link; it only ever goes to the member's own
   address on file. Same answer whether or not the address belongs to a member (no account discovery). */
async function loginEmail(req, env) {
  if (!env.PLATFORM_KEY) return err(503, "platform mode not configured");
  if (!emailConfigured(env)) return err(503, "email not configured");
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const email = line(b.email, 254).toLowerCase();
  if (!isEmail(email)) return err(400, "invalid email");
  const { results } = await env.DB.prepare("SELECT * FROM members WHERE email = ? AND verified = 1 LIMIT 5").bind(email).all();
  const since = new Date(Date.now() - 3600000).toISOString();
  for (const m of results || []) {
    if (!ELIGIBLE.includes(m.plan)) continue;
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM logins WHERE member_id = ? AND purpose = 'email_link' AND created_at >= ?").bind(m.id, since).first();
    if (c && c.n >= LIM.loginEmailsPerHour) continue;
    const link = await newLoginCode(env, m.id, "email_link");
    const s = await sendLoginEmail(env, m, link, "email_link");
    await event(env, "", m.id, "login_link_emailed", { sent: !!s.sent });
  }
  return json({ ok: true });
}

async function session(req, env) {
  let verified = false;
  if (env.PLATFORM_KEY) {
    if (!platformKeyOk(req, env)) return err(401, "platform key required", { login: "activation" });
    verified = true;
  } else if (env.ADVISOR_OPEN_MODE !== "1") return err(503, "platform mode not configured (set PLATFORM_KEY)", { code: "platform_off", login: "activation" }); // fail closed
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const memberId = str(b.member_id, 64), plan = line(b.plan, 20).toLowerCase(), company = line(b.company, 120), email = line(b.email, 254).toLowerCase();
  if (!/^[\w.@:+-]{1,64}$/.test(memberId)) return err(400, "member_id required (1-64 chars: letters, digits, . _ - @ : +)");
  if (email && !isEmail(email)) return err(400, "invalid email");
  const existing = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first();
  if (!ELIGIBLE.includes(plan)) {
    // the platform may call /session with the member's new (lower) plan to revoke the advisor: all tokens stop working
    if (verified && existing) await env.DB.prepare("UPDATE members SET plan = ?, updated_at = ? WHERE id = ?").bind(plan || "none", now(), memberId).run();
    return err(403, "plan not eligible", { eligible: ELIGIBLE });
  }
  if (!verified && existing) {
    // open mode (no PLATFORM_KEY): nobody can take over an existing member; only that member can renew with its own token
    const self = await authenticate(req, env);
    if (!self || self.id !== memberId) return err(409, "member exists");
  }
  const t = now(), isVerified = verified || !!(existing && existing.verified) ? 1 : 0;
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET company = excluded.company, email = excluded.email, plan = excluded.plan, verified = excluded.verified, updated_at = excluded.updated_at")
    .bind(memberId, company, email, plan, isVerified, t, t).run();
  if (!existing) await event(env, "", memberId, "member_created", { plan, verified: !!isVerified });
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  return json({ token: await signToken(env.ADVISOR_SECRET, memberId, plan, exp), expires_at: new Date(exp * 1000).toISOString(), member: { id: memberId, company, email, plan, verified: !!isVerified, markets: PLAN_MARKETS[plan] } });
}

async function listDeals(env, member) {
  const { results } = await env.DB.prepare(`SELECT d.*, (SELECT COUNT(*) FROM messages m WHERE m.deal_id = d.id) AS messages_count,
      (SELECT MAX(at) FROM messages m WHERE m.deal_id = d.id) AS last_message_at,
      (SELECT MAX(at) FROM messages m WHERE m.deal_id = d.id AND m.direction = 'in') AS last_in_at
    FROM deals d WHERE d.member_id = ? ORDER BY d.updated_at DESC LIMIT ?`).bind(member.id, LIM.deals).all();
  return json({ deals: (results || []).map(d => dealOut(d, env)) });
}

async function createDeal(req, env, member) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const o = b.opportunity && typeof b.opportunity === "object" ? b.opportunity : {};
  const d = { ref: line(o.ref, 120), title: line(o.title, LIM.field), entity: line(o.entity, LIM.field), market: line(o.market, 20).toLowerCase(), country: line(o.country, 80), source_url: line(o.source_url, 1000), closing_date: line(o.closing_date, 40), kind: line(o.kind, 20).toLowerCase() };
  if (!d.title && !d.ref) return err(400, "opportunity.title or opportunity.ref required");
  // market is required (an empty one used to skip the plan check below)
  if (!MARKETS.includes(d.market)) return err(400, d.market ? "invalid market" : "opportunity.market required", { markets: MARKETS });
  if (!PLAN_MARKETS[member.plan].includes(d.market)) return err(403, "market not in plan", { markets: PLAN_MARKETS[member.plan] });
  if (d.source_url && !isUrl(d.source_url)) d.source_url = "";
  const stage = b.stage == null || b.stage === "" ? "discover" : String(b.stage);
  if (!STAGES.includes(stage)) return err(400, "invalid stage", { stages: STAGES });
  // the same opportunity posted twice returns the existing deal. A ref alone is not an identity: some notices have none or a
  // trivial one ("1", "null"), and different tenders can share it — so dedupe only on a meaningful ref with the same title and source.
  if (d.ref && !/^(\d{1,2}|null|undefined|n\/?a|-+)$/i.test(d.ref)) {
    const dup = (await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND ref = ? AND market = ? AND title = ? AND source_url = ?").bind(member.id, d.ref, d.market, d.title, d.source_url).first())
      || await ownDealOf(env, member, d);
    if (dup) return json({ deal: dealOut(dup, env), existing: true });
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM deals WHERE member_id = ?").bind(member.id).first();
  if (n && n.n >= LIM.deals) return err(429, "deal limit reached", { limit: LIM.deals });
  const id = hex(8), t = now(), notes = str(b.notes, LIM.notes);
  await env.DB.prepare("INSERT INTO deals (id, member_id, ref, title, entity, market, country, source_url, closing_date, kind, stage, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, member.id, d.ref, d.title, d.entity, d.market, d.country, d.source_url, d.closing_date, d.kind, stage, notes, t, t).run();
  await event(env, id, member.id, "deal_created", { stage, ref: d.ref, market: d.market });
  return json({ deal: dealOut(await getDeal(env, id, member.id), env) }, 201);
}

async function showDeal(env, member, id) {
  const d = await getDeal(env, id, member.id);
  if (!d) return err(404, "deal not found");
  const { results } = await env.DB.prepare("SELECT type, data, at FROM events WHERE deal_id = ? AND member_id = ? ORDER BY id DESC LIMIT 50").bind(id, member.id).all();
  return json({ deal: dealOut(d, env), events: (results || []).map(e => { let data = {}; try { data = JSON.parse(e.data); } catch (x) { /* ignore */ } return { type: e.type, data, at: e.at }; }) });
}

const PATCHABLE = { notes: LIM.notes, next_action: 500, due_date: 10, contact_email: 254, contact_name: 120, value: 64, stage: 20 };
async function patchDeal(req, env, member, id) {
  const d = await getDeal(env, id, member.id);
  if (!d) return err(404, "deal not found");
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const set = {};
  for (const k of Object.keys(PATCHABLE)) if (k in b) set[k] = k === "notes" ? str(b[k], PATCHABLE[k]) : line(b[k], PATCHABLE[k]);
  if (!Object.keys(set).length) return err(400, "nothing to update", { fields: Object.keys(PATCHABLE) });
  if ("stage" in set && !STAGES.includes(set.stage)) return err(400, "invalid stage", { stages: STAGES });
  if (set.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(set.due_date)) return err(400, "due_date must be YYYY-MM-DD");
  if (set.contact_email) { set.contact_email = set.contact_email.toLowerCase(); if (!isEmail(set.contact_email)) return err(400, "invalid contact_email"); }
  const cols = Object.keys(set); // fixed whitelist names only
  await env.DB.prepare(`UPDATE deals SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ? AND member_id = ?`).bind(...cols.map(c => set[c]), now(), id, member.id).run();
  if ("stage" in set && set.stage !== d.stage) await event(env, id, member.id, "stage_changed", { from: d.stage, to: set.stage });
  const other = cols.filter(c => c !== "stage");
  if (other.length) await event(env, id, member.id, "deal_updated", { fields: other });
  return json({ deal: dealOut(await getDeal(env, id, member.id), env) });
}

async function deleteDeal(env, member, id) {
  const d = await getDeal(env, id, member.id);
  if (!d) return err(404, "deal not found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM messages WHERE deal_id = ? AND member_id = ?").bind(id, member.id),
    env.DB.prepare("DELETE FROM events WHERE deal_id = ? AND member_id = ?").bind(id, member.id),
    env.DB.prepare("DELETE FROM deals WHERE id = ? AND member_id = ?").bind(id, member.id),
  ]);
  return json({ ok: true });
}

async function listMessages(env, member, id) {
  const d = await getDeal(env, id, member.id);
  if (!d) return err(404, "deal not found");
  const { results } = await env.DB.prepare("SELECT * FROM messages WHERE deal_id = ? AND member_id = ? ORDER BY at ASC, rowid ASC LIMIT 500").bind(id, member.id).all();
  return json({ messages: (results || []).map(msgOut) });
}

/* ---------- a member's e-mail to another party ----------
   Two doors, ONE path: the deal room's «ابعت من المنصة» (POST /deals/:id/email) and Bassem's «ابعت» in the live call / the call's e-mail
   draft (POST /send, which first finds or starts the deal of the opportunity the e-mail is about). The same safeguards on both:
   mailIn() — ≤ 5 recipients, valid addresses, a one-line subject (no header injection), a body; mailRoom() — the member's limits over a
   rolling 24 h (MAX_EMAILS_PER_DAY, opted-out recipients refused, MAX_NEW_RECIPIENTS_PER_DAY for addresses he never wrote to and never
   got a verified reply from, so the shared sender cannot be used for cold mass mailing); mailOut() — an unverified member never goes
   through the provider, the platform's one sender as «<company> via Made in Egypt Gate», the member in Cc, Reply-To the deal address
   (Email Routing on) or his own mailbox, the footer with the opt-out / abuse lines, List-Unsubscribe when replies come back to the
   platform, then the message, the contacts and the events are stored. "sent" only when the provider answered with an id
   (email-center.js deliver). Every refusal carries a `code` the call's page turns into words for the member and for Bassem. */
function mailIn(b) {
  const to = addrList(b.to), cc = addrList(b.cc);
  if (to.bad.length || !to.list.length) return { error: err(400, "invalid or missing to", { code: "invalid_to", ...(to.bad.length ? { invalid: to.bad } : {}) }) };
  if (cc.bad.length) return { error: err(400, "invalid cc", { code: "invalid_cc", invalid: cc.bad }) };
  if (to.list.length + cc.list.length > LIM.recipients) return { error: err(400, "too many recipients", { code: "too_many_recipients", max: LIM.recipients }) };
  const subject = line(b.subject, LIM.subject + 1);
  if (!subject) return { error: err(400, "subject required", { code: "subject_required" }) };
  if (subject.length > LIM.subject) return { error: err(413, "subject too long", { code: "subject_too_long", max: LIM.subject }) };
  const body = scalar(b.body).replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  if (!body.trim()) return { error: err(400, "body required", { code: "body_required" }) };
  if (body.length > LIM.body) return { error: err(413, "body too long", { code: "body_too_long", max: LIM.body }) };
  return { to, cc, subject, body };
}
async function mailRoom(env, member, m) {
  const limit = dailyLimit(env);
  const since = new Date(Date.now() - 86400000).toISOString();
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ? AND direction = 'out' AND at >= ?").bind(member.id, since).first();
  if (c && c.n >= limit) return { error: err(429, "daily email limit reached", { code: "daily_limit", limit }) };
  // recipients: opted-out addresses are refused; addresses this member never wrote to before (and never got a verified reply
  // from) are "new" and capped per rolling 24 h, so the shared sender cannot be used for cold mass mailing
  const ext = [...new Set([...m.to.list, ...m.cc.list])].filter(a => a !== member.email);
  if (ext.length) {
    const { results: known } = await env.DB.prepare(`SELECT addr, opted_out_at FROM contacts WHERE member_id = ? AND addr IN (${ext.map(() => "?").join(", ")})`).bind(member.id, ...ext).all();
    const optedOut = (known || []).filter(k => k.opted_out_at).map(k => k.addr);
    if (optedOut.length) return { error: err(403, "recipient opted out", { code: "opted_out", addresses: optedOut }) };
    const seen = new Set((known || []).map(k => k.addr));
    const fresh = ext.filter(a => !seen.has(a));
    if (fresh.length) {
      const newLimit = intEnv(env.MAX_NEW_RECIPIENTS_PER_DAY, LIM.newRecipientsPerDay, 1, 100);
      const nn = await env.DB.prepare("SELECT COUNT(*) AS n FROM contacts WHERE member_id = ? AND source = 'out' AND first_at >= ?").bind(member.id, since).first();
      const used = (nn && nn.n) || 0;
      if (used + fresh.length > newLimit) return { error: err(429, "new recipient limit reached", { code: "new_recipient_limit", limit: newLimit, remaining: Math.max(0, newLimit - used), new_recipients: fresh }) };
    }
  }
  return { ext };
}
async function mailOut(env, member, d, m, ext, audit) {
  const id = d.id, to = m.to, cc = m.cc, subject = m.subject, body = m.body;
  const msgId = hex(12), fromEmail = mailFrom(env), name = displayName(member.company), foot = footer(member.company, inboundOn(env) ? "" : team(env) || SUPPORT);
  const memberCc = isEmail(member.email) && !to.list.includes(member.email) && !cc.list.includes(member.email) ? [member.email] : [];
  const msg = { id: msgId, from: { email: fromEmail, name }, to: to.list, cc: [...cc.list, ...memberCc], replyTo: dealReplyTo(env, id, member), subject, text: `${body}\n\n—\n${foot.ar}\n${foot.en}\n${foot.optout_ar}\n${foot.optout_en}`, html: toHtml(body, foot),
    headers: { "X-MIG-Deal": id, ...(inboundOn(env) ? { "List-Unsubscribe": `<mailto:${replyAddress(env, id)}?subject=unsubscribe>` } : {}) } };

  let res;
  if (!member.verified && env.ALLOW_UNVERIFIED_SEND !== "1") res = { sent: false, provider: "", error: emailConfigured(env) ? "member not verified by the platform (set PLATFORM_KEY and create the session from the platform backend)" : "email not configured" };
  else res = await sendEmail(env, msg);
  const status = res.sent ? "sent" : (res.provider ? "failed" : "draft");
  const t = now();
  const row = { id: msgId, deal_id: id, member_id: member.id, direction: "out", status, from_addr: `${name} <${fromEmail}>`, to_addr: to.list.join(", "), cc: msg.cc.join(", "), subject, body, provider: res.provider || "", provider_id: res.id || "", error: res.sent ? "" : str(res.error, 300), at: t };
  await env.DB.prepare("INSERT INTO messages (id, deal_id, member_id, direction, status, from_addr, to_addr, cc, subject, body, provider, provider_id, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.deal_id, row.member_id, row.direction, row.status, row.from_addr, row.to_addr, row.cc, row.subject, row.body, row.provider, row.provider_id, row.error, row.at).run();
  if (res.sent && ext.length) await env.DB.batch(ext.map(a => env.DB.prepare("INSERT INTO contacts (member_id, addr, source, first_at) VALUES (?, ?, 'out', ?) ON CONFLICT(member_id, addr) DO NOTHING").bind(member.id, a, t)));
  const upd = { updated_at: t };
  if (res.sent && d.stage === "discover") upd.stage = "contact";
  if (!d.contact_email) upd.contact_email = to.list[0];
  const cols = Object.keys(upd);
  await env.DB.prepare(`UPDATE deals SET ${cols.map(k => k + " = ?").join(", ")} WHERE id = ? AND member_id = ?`).bind(...cols.map(k => upd[k]), id, member.id).run();
  await event(env, id, member.id, res.sent ? "email_sent" : status === "draft" ? "email_draft" : "email_failed", { message_id: msgId, to: to.list, ...(audit || {}), ...(res.sent ? {} : { error: row.error }) });
  if (upd.stage) await event(env, id, member.id, "stage_changed", { from: d.stage, to: upd.stage, auto: true });
  return { message: msgOut(row), sent: !!res.sent, ...(res.sent ? {} : { error: row.error }), deal: dealOut(await getDeal(env, id, member.id), env) };
}
async function sendDealEmail(req, env, member, id) {
  const d = await getDeal(env, id, member.id);
  if (!d) return err(404, "deal not found", { code: "deal_not_found" });
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  if (!PLAN_MARKETS[member.plan].includes(d.market || "local")) return err(403, "market not in plan", { code: "market_not_in_plan", markets: PLAN_MARKETS[member.plan] }); // e.g. after strategic → partner
  const m = mailIn(b);
  if (m.error) return m.error;
  const room = await mailRoom(env, member, m);
  if (room.error) return room.error;
  return json(await mailOut(env, member, d, m, room.ext));
}

/* ---------- the deal an e-mail from the call goes out on (POST /send) ----------
   The call's opportunities are mostly Information Center notices (bassem_intel): worker-intel's market codes (eg · sa ae qa kw om bh … ·
   africa:<cc> · asia:<cc> · gcc · arab · eu · intl) become the deal markets of the plans (local · gulf = «الخليج والدول العربية» ·
   africa · asia · europe); a country name or the recipient's country domain («go.ke») is used when the notice names none («intl»). */
const MK_SET = (...lists) => new Set(lists.join(" ").split(/\s+/).filter(Boolean));
const MK_GULF = MK_SET("gcc arab sa ae qa kw om bh jo iq lb ye ps sy");
const MK_AFRICA = MK_SET("ly sd ma tn dz mr dj so ke ng et gh tz ug rw sn ci za cm ao mz zm mw mg cd ss ml bf ne td bj tg zw na bw er sl lr gn ga cg bi sc mu km cv gm ls sz cf gq gw st");
const MK_ASIA = MK_SET("in pk bd id my vn cn jp tr uz kz ph lk np af mn kg tj az ge am kh la th kr mm ir hk sg tw");
const MK_EUROPE = MK_SET("eu uk gb at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se no is ch li");
const MK_NAME = {
  egypt: "local", "مصر": "local", gulf: "gulf", "الخليج": "gulf", "الدول العربية": "gulf", "أفريقيا": "africa", "افريقيا": "africa", "آسيا": "asia", "اسيا": "asia", "أوروبا": "europe", "اوروبا": "europe",
  "saudi arabia": "gulf", saudi: "gulf", ksa: "gulf", "السعودية": "gulf", "السعوديه": "gulf", uae: "gulf", "united arab emirates": "gulf", "الإمارات": "gulf", "الامارات": "gulf", dubai: "gulf", "دبي": "gulf",
  "abu dhabi": "gulf", "أبوظبي": "gulf", "ابوظبي": "gulf", qatar: "gulf", "قطر": "gulf", kuwait: "gulf", "الكويت": "gulf", oman: "gulf", "عمان": "gulf", "عُمان": "gulf", bahrain: "gulf", "البحرين": "gulf",
  jordan: "gulf", "الأردن": "gulf", "الاردن": "gulf", iraq: "gulf", "العراق": "gulf", lebanon: "gulf", "لبنان": "gulf", yemen: "gulf", "اليمن": "gulf", palestine: "gulf", "فلسطين": "gulf", syria: "gulf", "سوريا": "gulf",
  libya: "africa", "ليبيا": "africa", sudan: "africa", "السودان": "africa", morocco: "africa", "المغرب": "africa", tunisia: "africa", "تونس": "africa", algeria: "africa", "الجزائر": "africa",
  kenya: "africa", "كينيا": "africa", nigeria: "africa", "نيجيريا": "africa", ghana: "africa", "غانا": "africa", "south africa": "africa", "جنوب أفريقيا": "africa", "جنوب افريقيا": "africa",
  ethiopia: "africa", "إثيوبيا": "africa", "اثيوبيا": "africa", tanzania: "africa", "تنزانيا": "africa", uganda: "africa", "أوغندا": "africa", "اوغندا": "africa", senegal: "africa", "السنغال": "africa",
  "cote d'ivoire": "africa", "côte d'ivoire": "africa", "ivory coast": "africa", "كوت ديفوار": "africa", "ساحل العاج": "africa", cameroon: "africa", "الكاميرون": "africa", rwanda: "africa", "رواندا": "africa",
  china: "asia", "الصين": "asia", india: "asia", "الهند": "asia", turkey: "asia", "türkiye": "asia", turkiye: "asia", "تركيا": "asia", pakistan: "asia", "باكستان": "asia", indonesia: "asia", "إندونيسيا": "asia",
  germany: "europe", "ألمانيا": "europe", "المانيا": "europe", france: "europe", "فرنسا": "europe", italy: "europe", "إيطاليا": "europe", "ايطاليا": "europe", spain: "europe", "إسبانيا": "europe", "اسبانيا": "europe",
  "united kingdom": "europe", britain: "europe", england: "europe", "بريطانيا": "europe", "المملكة المتحدة": "europe", netherlands: "europe", "هولندا": "europe", greece: "europe", "اليونان": "europe",
};
export function dealMarket(v) {
  const s = line(v, 60).toLowerCase().replace(/^the\s+/, "").replace(/[\u064b-\u0652\u0640]/g, "");
  if (!s) return "";
  if (MARKETS.includes(s)) return s;
  if (s === "eg" || s === "egy") return "local";
  const g = /^(africa|asia):[a-z]{2}$/.exec(s);
  if (g) return g[1];
  if (MK_GULF.has(s)) return "gulf";
  if (MK_AFRICA.has(s)) return "africa";
  if (MK_ASIA.has(s)) return "asia";
  if (MK_EUROPE.has(s)) return "europe";
  return Object.hasOwn(MK_NAME, s) ? MK_NAME[s] : "";
}
/* the recipient's country domain («tenders@lamuwest.go.ke» → africa, «info@x.com.eg» → local); "" for .com / .org / .io … */
export function tldMarket(addr) {
  const tld = String(addr || "").toLowerCase().split("@").pop().split(".").pop();
  return /^[a-z]{2}$/.test(tld) ? dealMarket(tld) : "";
}
/* worker-intel kinds → the deal kinds the advisor page names (gov / pvt / rfq / project; "direct" = an e-mail with no opportunity) */
const KIND_OF = { tender_gov: "gov", tender_semi: "gov", tender_private: "pvt", rfq: "rfq", project: "project", project_news: "project", news: "project", tender: "gov", order: "pvt" };
const TRIVIAL_REF = /^(\d{1,2}|null|undefined|n\/?a|-+)$/i;
function oppDeal(o) {
  const kind = line(o.kind, 20).toLowerCase();
  const d = { ref: line(o.ref, 120), title: line(o.title, LIM.field), entity: line(o.entity, LIM.field), market: dealMarket(o.market) || dealMarket(o.country), country: line(o.country, 80),
    source_url: line(o.source_url, 1000), closing_date: line(o.closing_date, 40), kind: Object.hasOwn(KIND_OF, kind) ? KIND_OF[kind] : kind };
  if (d.source_url && !isUrl(d.source_url)) d.source_url = "";
  return d;
}
/* review 2026-11-20 CW-3: the platform's OWN link of one item has two forms — the list link …/tenders/search/#<id> (janna_lookup until
   2026-11-20) and the item page …/tender-item/<slug>/ (its lean answer since). A deal started on one form is the same deal on the other:
   the same meaningful ref, market and title, both links on the platform's own site. Official links of other sites still match exactly. */
const OWN_HOSTS = ["madeinegyptgate.com", "www.madeinegyptgate.com"];
function ownUrl(env, u) {
  let h = ""; try { h = new URL(String(u || "")).hostname.toLowerCase(); } catch (e) { return false; }
  if (OWN_HOSTS.includes(h)) return true;
  try { return h === new URL(site(env)).hostname.toLowerCase(); } catch (e) { return false; }
}
async function ownDealOf(env, member, d) {
  if (!d.ref || TRIVIAL_REF.test(d.ref) || !ownUrl(env, d.source_url)) return null;
  const { results } = await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND ref = ? AND market = ? AND title = ? ORDER BY updated_at DESC LIMIT 20").bind(member.id, d.ref, d.market, d.title).all();
  return (results || []).find(x => ownUrl(env, x.source_url)) || null;
}
/* the member's deal for the same opportunity: same title + official link (+ market), else a meaningful ref (the platform's own link in
   either form: ownDealOf), else title + buyer */
async function oppDealOf(env, member, d) {
  if (d.source_url) {
    const x = await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND market = ? AND title = ? AND source_url = ? ORDER BY updated_at DESC LIMIT 1").bind(member.id, d.market, d.title, d.source_url).first();
    if (x) return x;
  }
  if (d.ref && !TRIVIAL_REF.test(d.ref)) {
    const x = await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND ref = ? AND market = ? AND title = ? AND source_url = ? ORDER BY updated_at DESC LIMIT 1").bind(member.id, d.ref, d.market, d.title, d.source_url).first();
    if (x) return x;
    const y = await ownDealOf(env, member, d);
    if (y) return y;
  }
  if (!d.source_url && !d.ref && d.entity) return await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND market = ? AND title = ? AND entity = ? AND source_url = '' ORDER BY updated_at DESC LIMIT 1").bind(member.id, d.market, d.title, d.entity).first();
  return null;
}
/* → {deal (a stored row, or the fields of a deal to start), source} | {error}; nothing is written here */
async function dealToSend(env, member, b, m) {
  if (b.deal_id != null && b.deal_id !== "") {
    const id = line(b.deal_id, 40).toLowerCase(), d = /^[a-f0-9]{16}$/.test(id) ? await getDeal(env, id, member.id) : null;
    return d ? { deal: d, source: "deal" } : { error: err(404, "deal not found", { code: "deal_not_found" }) };
  }
  const o = b.opportunity && typeof b.opportunity === "object" && !Array.isArray(b.opportunity) ? b.opportunity : null;
  const noMarket = () => ({ error: err(400, "the buyer's market or country is needed", { code: "market_required", markets: MARKETS }) });
  if (o) {
    const d = oppDeal(o);
    if (!d.title && !d.ref) return { error: err(400, "opportunity.title or opportunity.ref required", { code: "opportunity_required" }) };
    if (!d.market) d.market = dealMarket(b.market) || tldMarket(m.to.list[0]); // an «intl» notice names no country
    if (!d.market) return noMarket();
    return { deal: (await oppDealOf(env, member, d)) || d, source: "opportunity" };
  }
  // no opportunity behind the e-mail (an introduction to a company): its own deal, titled by its subject — one per recipient
  const market = dealMarket(b.market) || tldMarket(m.to.list[0]);
  if (!market) return noMarket();
  const dup = await env.DB.prepare("SELECT * FROM deals WHERE member_id = ? AND kind = 'direct' AND contact_email = ? ORDER BY updated_at DESC LIMIT 1").bind(member.id, m.to.list[0]).first();
  return { deal: dup || { ref: "", title: line(m.subject, LIM.field), entity: "", market, country: line(b.country, 80), source_url: "", closing_date: "", kind: "direct" }, source: "direct" };
}
/* audit only (never a permission): who asked for the send, and where the page says the recipient came from — the opportunity's data, the
   deal, a tender document, the member's dictation (confirmed on his screen), his own typing, or an address already e-mailed in that call */
const VIA = ["bassem", "button"], TO_SOURCE = ["opportunity", "deal", "document", "dictated", "typed", "repeat"];
/* POST /send — see the header. Order: the message → the deal (found, or the fields of a new one) → the plan's markets → the member's
   sending limits → only then a new deal is stored → the e-mail goes out on it. A refused send therefore starts no deal. */
async function sendFromCall(req, env, member) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const m = mailIn(b);
  if (m.error) return m.error;
  const r = await dealToSend(env, member, b, m);
  if (r.error) return r.error;
  let d = r.deal, created = false;
  if (!PLAN_MARKETS[member.plan].includes(d.market || "local")) return err(403, "market not in plan", { code: "market_not_in_plan", market: d.market, markets: PLAN_MARKETS[member.plan] });
  const room = await mailRoom(env, member, m);
  if (room.error) return room.error;
  if (!d.id) {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM deals WHERE member_id = ?").bind(member.id).first();
    if (n && n.n >= LIM.deals) return err(429, "deal limit reached", { code: "deal_limit", limit: LIM.deals });
    const id = hex(8), t = now();
    await env.DB.prepare("INSERT INTO deals (id, member_id, ref, title, entity, market, country, source_url, closing_date, kind, stage, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discover', '', ?, ?)")
      .bind(id, member.id, d.ref, d.title, d.entity, d.market, d.country, d.source_url, d.closing_date, d.kind, t, t).run();
    await event(env, id, member.id, "deal_created", { stage: "discover", ref: d.ref, market: d.market, via: "send", source: r.source });
    d = await getDeal(env, id, member.id); created = true;
  }
  const audit = { via: VIA.includes(b.via) ? b.via : "bassem", ...(TO_SOURCE.includes(b.to_source) ? { to_source: b.to_source } : {}) };
  return json({ ...(await mailOut(env, member, d, m, room.ext, audit)), deal_created: created });
}

/* POST /notify {message, channel: whatsapp|email|both, items?} — Bassem tells the member something (his own address / number only; body.to
   is never read). WhatsApp: free text inside the 24 h window, otherwise the approved template bassem_update; never a made-up "sent".
   items (optional, ≤ 3 refs "intel:<id>" / "item:<platform tender id>" or {ref, title} — notify-items.js parseRefs; anything else is
   ignored): the e-mail then carries each opportunity's details from the platform's own data, its page on the platform, its official
   link and, when it could be downloaded, its official file attached (≤ NOTIFY_LIM.filesPerDay files a member per rolling 24 h, counted
   from events.data.files); the reply adds {items, attached}. Without a valid ref the request and the e-mail are exactly as before.
   With refs, ONE statement counts the notify and reserves its files BEFORE the slow work (NOTIFY_RESERVE): two requests at once cannot
   both pass the daily caps, and a member has one such notify running at a time (429 notify_busy; the page waits and sends again). */
const NOTIFY_PER_DAY = 20;
const NOTIFY_RESERVE = "INSERT INTO events (deal_id, member_id, type, data, at) SELECT '', ?, 'notify', json_object('state', 'running', 'files', MAX(0, MIN(?, ? - f))), ? " +
  "FROM (SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN json_valid(data) THEN json_extract(data, '$.files') END), 0) AS f FROM events WHERE member_id = ? AND type = 'notify' AND at >= ?) " +
  "WHERE n < ? AND NOT EXISTS (SELECT 1 FROM events WHERE member_id = ? AND type = 'notify' AND at >= ? AND (CASE WHEN json_valid(data) THEN json_extract(data, '$.state') END) = 'running') " +
  "RETURNING id, json_extract(data, '$.files') AS files";
async function notifyMember(req, env, member, ctx) {
  const b = await readJson(req);
  if (b.tooLarge) return err(413, "request too large");
  if (b.bad) return err(400, "bad json");
  const message = scalar(b.message).replace(/\u0000/g, "").trim().slice(0, 2000), channel = ["whatsapp", "email", "both"].includes(b.channel) ? b.channel : "both";
  if (!message) return err(400, "message required", { code: "message_required" });
  const since = new Date(Date.now() - 86400000).toISOString();
  const c = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN json_valid(data) THEN json_extract(data, '$.files') END), 0) AS f FROM events WHERE member_id = ? AND type = 'notify' AND at >= ?").bind(member.id, since).first();
  if (c && c.n >= NOTIFY_PER_DAY) return err(429, "daily notify limit reached", { code: "rate_limited" });
  const refs = parseRefs(b.items);
  if (refs.length) {
    /* the notify and its files, reserved in one statement (D1 runs one write at a time); a job of this member still running (< 60 s) → none */
    const nIntel = refs.filter(r => r.startsWith("intel:")).length, t = now();
    const row = await env.DB.prepare(NOTIFY_RESERVE).bind(member.id, nIntel, NOTIFY_LIM.filesPerDay, t, member.id, since, NOTIFY_PER_DAY, member.id, new Date(Date.now() - 60000).toISOString()).first();
    if (!row) {
      const c2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE member_id = ? AND type = 'notify' AND at >= ?").bind(member.id, since).first();
      return c2 && c2.n >= NOTIFY_PER_DAY ? err(429, "daily notify limit reached", { code: "rate_limited" })
        : err(429, "رسالة «ابعتلي» تانية ليك لسه بتتبعت — جرّب تاني بعد ثواني / another «send to me» of yours is still being sent — try again in a few seconds", { code: "notify_busy", retry_after: 5 });
    }
    const job = notifyItems(env, member, message, channel, refs, { evId: row.id, filesLeft: Math.max(0, +row.files || 0), titles: refTitles(b.items, refs) });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job.then(() => {}, () => {})); // the e-mail still goes if the page closes
    return json(await job);
  }
  const sent = { email: false, whatsapp: false }, errors = {};
  if (channel !== "whatsapp") {
    if (isEmail(member.email) && emailConfigured(env)) { const r = await sendEmail(env, { id: "nt-" + hex(8), from: { email: mailFrom(env), name: "باسم — " + sender(env).name }, to: [member.email], subject: "رسالة من باسم / A note from Bassem", text: message + "\n\n—\n" + site(env) + "advisor.html", html: toHtml(message + "\n\n—\n" + site(env) + "advisor.html") }); sent.email = !!r.sent; if (!r.sent) errors.email = r.error; }
    else errors.email = isEmail(member.email) ? "email not configured" : "no email";
  }
  // WhatsApp: "sent" means the member's own words were delivered (inside the 24 h window). Outside it only the approved
  // template «لقيت فرصة مهمة…» can go out: that is a notification, not this message — the text waits (queued) and is
  // delivered automatically the moment the member replies on WhatsApp (whatsapp.js inbound).
  const pending = { whatsapp: false };
  if (channel !== "email") {
    if (!waOn(env)) errors.whatsapp = "whatsapp not configured";
    else {
      const full = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(member.id).first();
      const r = await sendToMember(env, full, { text: message, template: "bassem_update", queueText: true });
      sent.whatsapp = !!(r.sent && r.via === "text");
      pending.whatsapp = !!(r.sent && r.via === "template" && r.queued);
      if (!sent.whatsapp) errors.whatsapp = pending.whatsapp ? "outside_24h_window: a notification template was sent; the message is delivered when the member replies on WhatsApp" : r.error;
    }
  }
  await event(env, "", member.id, "notify", { channel, sent, pending });
  return json({ ok: sent.email || sent.whatsapp || pending.whatsapp, sent, pending, ...(Object.keys(errors).length ? { errors } : {}) });
}
/* notify with opportunities (notify-items.js): resolve the refs (only when a channel can go), one e-mail with the cards and the files
   (requireAttachments: «مرفق» only for files Resend / Brevo really carried — a route or a provider that refuses them → the same e-mail
   once more without them, saying why), the same cards as WhatsApp text; the reserved events row gets its outcome (refs + reason codes +
   the files really attached; never the message). o = {evId, filesLeft, titles}. → {ok, sent, pending, errors?, items, attached} */
async function notifyItems(env, member, message, channel, refs, o) {
  const sent = { email: false, whatsapp: false }, errors = {}, pending = { whatsapp: false }, gate = {};
  const mailOk = channel !== "whatsapp" && isEmail(member.email) && emailConfigured(env), waWanted = channel !== "email" && waOn(env);
  let items = [], attached = 0;
  const free = () => { if (gate.release) { gate.release(); gate.release = null; } for (const it of items) if (it && it.file && it.file.b64) delete it.file.b64; };
  try {
    if (mailOk || waWanted) {
      try { await loadMailConfig(env); } catch (e) { /* the memo of this request stays */ }
      try { items = await resolveNotifyItems(env, refs, { channel, mailOk, provider: mailOk ? attachProvider(env) : "", filesLeft: o.filesLeft, titles: o.titles, gate }); }
      catch (e) { console.error("notify items", (e && e.message) || e); items = refs.map(ref => ({ ref, type: ref.startsWith("intel:") ? "intel" : "item", id: ref.replace(/^[a-z]+:/, ""), found: false, reason: "unavailable" })); } // the note still goes, saying so
    }
    if (channel !== "whatsapp") {
      if (mailOk) {
        const from = { email: mailFrom(env), name: "باسم — " + sender(env).name };
        let mail = notifyMail(env, message, items);
        let r = await sendEmail(env, { id: "nt-" + hex(8), from, to: [member.email], subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments, requireAttachments: mail.attachments.length > 0 });
        if (!r.sent && mail.attachments.length && (r.error === "attachments_unsupported" || /^(?:resend|brevo) (?:400|413|422)\b/.test(String(r.error || "")))) {
          dropFiles(items, r.error === "attachments_unsupported" ? "no_attach_provider" : "provider_refused");
          mail = notifyMail(env, message, items);
          r = await sendEmail(env, { id: "nt-" + hex(8), from, to: [member.email], subject: mail.subject, text: mail.text, html: mail.html });
        }
        sent.email = !!r.sent;
        if (r.sent) attached = mail.attachments.length;
        else { errors.email = r.error; dropFiles(items, "email_not_sent"); }
        mail = null;
      } else errors.email = isEmail(member.email) ? "email not configured" : "no email";
    }
    free(); // the files are with the provider (or not going): this isolate's file slot is free for the next notify
    if (channel !== "email") {
      if (!waOn(env)) errors.whatsapp = "whatsapp not configured";
      else {
        const full = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(member.id).first();
        const r = await sendToMember(env, full, { text: notifyWa(message, items, { emailSent: sent.email, attached }), template: "bassem_update", queueText: true });
        sent.whatsapp = !!(r.sent && r.via === "text");
        pending.whatsapp = !!(r.sent && r.via === "template" && r.queued);
        if (!sent.whatsapp) errors.whatsapp = pending.whatsapp ? "outside_24h_window: a notification template was sent; the message is delivered when the member replies on WhatsApp" : r.error;
      }
    }
  } finally {
    free();
    /* the reserved row → its outcome (files = what really went; never «running» again, so the member's next notify may start) */
    const data = JSON.stringify({ channel, sent, pending, items: refs, files: attached, why: whyMap(items) });
    try { await env.DB.prepare("UPDATE events SET data = ? WHERE id = ?").bind(data, o.evId).run(); } catch (e) { console.error("notify event", (e && e.message) || e); }
  }
  return { ok: sent.email || sent.whatsapp || pending.whatsapp, sent, pending, ...(Object.keys(errors).length ? { errors } : {}), items: replyItems(items), attached };
}

/* ---------- inbound sender check ----------
   The From header of an inbound mail is written by whoever sends it; the deal address is not secret (every recipient and Cc
   of the member's emails sees it). So a reply is shown as "verified" only when a receiving server we trust reported
   DMARC pass for the From domain. Trusted = INBOUND_AUTHSERV_ID (e.g. "mx.cloudflare.net"), and only the TOPMOST
   Authentication-Results / ARC-Authentication-Results header counts (headers further down may have been written by the
   sender). INBOUND_AUTHSERV_ID is empty by default: set it only after checking a real reply's raw headers show that
   Email Routing stamps such a header at the top for Worker deliveries — otherwise a sender could add one and be trusted.
   Unverified mail is still stored and shown, with the envelope sender and a warning. */
export function senderAuth(headers, fromAddr, env) {
  const trusted = String((env && env.INBOUND_AUTHSERV_ID) || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  const out = { verified: false, dmarc: "", spf: "", dkim: "", by: "", summary: "not checked" };
  if (!trusted.length) return out;
  const list = Array.isArray(headers) ? headers : [];
  const top = list.find(h => h && (h.key === "authentication-results" || h.key === "arc-authentication-results"));
  if (!top) { out.summary = "no authentication results"; return out; }
  let v = String(top.value || "").replace(/\([^()]*\)/g, " ");
  if (top.key === "arc-authentication-results") v = v.replace(/^\s*i\s*=\s*\d+\s*;/i, "");
  const parts = v.split(";").map(x => x.trim());
  const by = (parts[0] || "").split(/\s+/)[0].toLowerCase();
  if (!trusted.includes(by)) { out.summary = "untrusted authentication results"; return out; }
  const get = k => { for (const p of parts.slice(1)) { const m = p.match(new RegExp("^" + k + "\\s*=\\s*([a-z]+)", "i")); if (m) return { r: m[1].toLowerCase(), p }; } return null; };
  const dm = get("dmarc"), sp = get("spf"), dk = get("dkim");
  out.by = by; out.dmarc = dm ? dm.r : "none"; out.spf = sp ? sp.r : "none"; out.dkim = dk ? dk.r : "none";
  const hf = dm && dm.p.match(/header\.from\s*=\s*([^\s;]+)/i);
  out.verified = !!(dm && dm.r === "pass" && hf && hf[1].toLowerCase() === domainOf(fromAddr));
  out.summary = `dmarc=${out.dmarc} spf=${out.spf} dkim=${out.dkim} (${by})`;
  return out;
}
const UNVERIFIED = { ar: "تنبيه: المرسل غير موثّق — اسم وعنوان «من» ممكن يكونوا مزيفين. اتأكد من الجهة بنفسك قبل أي تحويل فلوس أو تغيير بيانات بنكية.", en: "Warning: unverified sender — the From name and address may be forged. Confirm with the buyer yourself before any payment or bank-detail change." };

/* ---------- inbound email: deal-<id>@<REPLY_DOMAIN> (Cloudflare Email Routing → this Worker) ---------- */
export async function handleEmail(message, env, ctx) {
  env = env || {};
  const rcpt = String(message.to || "").toLowerCase().trim();
  const m = rcpt.match(/^deal-([a-f0-9]{16})@(.+)$/);
  if (!m || m[2] !== replyDomain(env)) { message.setReject("Unknown recipient"); return { stored: false, reason: "unknown recipient" }; }
  if (!env.DB) { message.setReject("Mailbox unavailable"); return { stored: false, reason: "store not configured" }; }
  if (message.rawSize && message.rawSize > LIM.inboundRaw) { message.setReject("Message too large"); return { stored: false, reason: "too large" }; }
  const deal = await env.DB.prepare("SELECT * FROM deals WHERE id = ?").bind(m[1]).first();
  if (!deal) { message.setReject("Unknown recipient"); return { stored: false, reason: "unknown deal" }; }
  const member = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(deal.member_id).first();
  const envelope = line(message.from, 254).toLowerCase();
  if (envelope === mailFrom(env).toLowerCase()) return { stored: false, reason: "loop" }; // our own mail bouncing back

  // rate limits: per deal and per member, rolling 24 h (the address is visible to every recipient, so it can be flooded)
  const day = new Date(Date.now() - 86400000).toISOString();
  const perDeal = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE deal_id = ? AND direction = 'in' AND at >= ?").bind(deal.id, day).first();
  const perMember = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ? AND direction = 'in' AND at >= ?").bind(deal.member_id, day).first();
  if ((perDeal && perDeal.n >= intEnv(env.MAX_INBOUND_PER_DEAL_DAY, LIM.inboundPerDealDay, 1, 1000)) || (perMember && perMember.n >= intEnv(env.MAX_INBOUND_PER_MEMBER_DAY, LIM.inboundPerMemberDay, 1, 10000))) {
    message.setReject("Too many messages to this address today, please try again tomorrow");
    return { stored: false, reason: "rate limited" };
  }

  let parsed = {};
  try { parsed = await PostalMime.parse(await new Response(message.raw).arrayBuffer()); } catch (e) { console.error("mime parse", e && e.message); }
  const hdr = k => (message.headers && message.headers.get(k)) || "";
  const fromAddr = line((parsed.from && parsed.from.address) || message.from, 254).toLowerCase();
  if (fromAddr === mailFrom(env).toLowerCase()) return { stored: false, reason: "loop" };
  const fromName = line(parsed.from && parsed.from.name, 120).replace(/[<>]/g, "");
  const auth = senderAuth(parsed.headers, fromAddr, env);
  const subject = line(parsed.subject || hdr("subject"), LIM.subject) || "(no subject)";
  const body = str(parsed.text || htmlToText(parsed.html), LIM.inboundBody);
  const t = now(), id = hex(12);
  await env.DB.prepare("INSERT INTO messages (id, deal_id, member_id, direction, status, from_addr, to_addr, cc, subject, body, provider, provider_id, error, at, envelope_from, sender_verified, sender_auth) VALUES (?, ?, ?, 'in', 'received', ?, ?, '', ?, ?, 'email-routing', ?, '', ?, ?, ?, ?)")
    .bind(id, deal.id, deal.member_id, fromName ? `${fromName} <${fromAddr}>` : fromAddr, rcpt, subject, body, line(parsed.messageId || hdr("message-id"), 300), t, envelope, auth.verified ? 1 : 0, auth.summary).run();
  // only a verified sender may become the deal's contact (next emails go there) or a known correspondent
  if (auth.verified) {
    await env.DB.prepare("UPDATE deals SET updated_at = ?, contact_email = CASE WHEN contact_email = '' THEN ? ELSE contact_email END WHERE id = ?").bind(t, fromAddr, deal.id).run();
    await env.DB.prepare("INSERT INTO contacts (member_id, addr, source, first_at) VALUES (?, ?, 'in', ?) ON CONFLICT(member_id, addr) DO NOTHING").bind(deal.member_id, fromAddr, t).run();
  } else await env.DB.prepare("UPDATE deals SET updated_at = ? WHERE id = ?").bind(t, deal.id).run();
  await event(env, deal.id, deal.member_id, "reply_received", { message_id: id, from: fromAddr, envelope_from: envelope, sender_verified: auth.verified, auto: /auto-(replied|generated)/i.test(hdr("auto-submitted")) });

  // "unsubscribe" reply: the recipient opts out of this member's emails. Honoured for a verified sender, or when header From
  // and envelope agree on an address this member really emailed (a forged opt-out could at worst silence that one address).
  if (/^\s*(re:\s*)?(unsubscribe|stop|إلغاء الاشتراك|الغاء الاشتراك)\s*$/i.test(subject)) {
    const k = await env.DB.prepare("SELECT source FROM contacts WHERE member_id = ? AND addr = ?").bind(deal.member_id, fromAddr).first();
    if (auth.verified || (k && k.source === "out" && envelope === fromAddr)) {
      await env.DB.prepare("INSERT INTO contacts (member_id, addr, source, first_at, opted_out_at) VALUES (?, ?, 'in', ?, ?) ON CONFLICT(member_id, addr) DO UPDATE SET opted_out_at = excluded.opted_out_at").bind(deal.member_id, fromAddr, t, t).run();
      await event(env, deal.id, deal.member_id, "recipient_opted_out", { addr: fromAddr });
    }
  }

  // copy to the member — only while the member's plan still includes the advisor (same rule as the tokens): a downgraded
  // member's replies are kept on the deal but nothing is emailed or forwarded. Per deal at most N copies per hour.
  let copied = "none";
  if (!member || !ELIGIBLE.includes(member.plan)) copied = "plan_inactive";
  else if (isEmail(member.email)) {
    const hour = new Date(Date.now() - 3600000).toISOString();
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE deal_id = ? AND direction = 'in' AND at >= ?").bind(deal.id, hour).first();
    if (recent && recent.n > LIM.notifyPerDealHour) copied = "throttled";
    else if (emailConfigured(env) && (member.verified || env.ALLOW_UNVERIFIED_SEND === "1")) {
      const link = site(env) + "advisor.html#deal=" + deal.id;
      const who = `${fromName ? fromName + " <" + fromAddr + ">" : fromAddr}${envelope && envelope !== fromAddr ? `\nEnvelope sender / المرسل الفعلي: ${envelope}` : ""}`;
      const warn = auth.verified ? "" : `${UNVERIFIED.ar}\n${UNVERIFIED.en}\n\n`;
      const text = `${warn}وصلك رد جديد على صفقة: ${deal.title || deal.ref}\nNew reply on your deal: ${deal.title || deal.ref}\n\nFrom: ${who}\nSender check / التحقق: ${auth.verified ? "verified (DMARC pass) / موثّق" : "unverified / غير موثّق"}\nSubject: ${subject}\n\n${body.slice(0, 8000)}\n\n—\nتابِع الصفقة ورُد من المنصة / Follow up and reply from the platform:\n${link}`;
      const r = await sendEmail(env, { id: "n-" + id, from: { email: mailFrom(env), name: sender(env).name }, to: [member.email], subject: line(`${auth.verified ? "" : "[غير موثّق / Unverified] "}رد جديد / New reply: ${subject}`, LIM.subject), text, html: toHtml(text) });
      copied = r.sent ? "notified" : "failed";
    } else if (message.canBeForwarded !== false && typeof message.forward === "function") {
      try { const h = new Headers(); h.set("X-MIG-Deal", deal.id); h.set("X-MIG-Sender-Verified", auth.verified ? "yes" : "no"); await message.forward(member.email, h); copied = "forwarded"; } catch (e) { copied = "failed"; console.error("forward", e && e.message); }
    }
  }
  return { stored: true, deal_id: deal.id, message_id: id, sender_verified: auth.verified, copied };
}
