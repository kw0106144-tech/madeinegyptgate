/* Inquiry engine (A2/A3/A4) — fully automatic, no human step (owner decisions 1 + 5).
   POST /api/inquiries {kind, target_type, target_id, target_name, name, company, email, phone, consent_wa, message, payload, items,
                        source: form|janna|bassem|basket, lang, turnstile?}  → {ok, ref, status, routed, matched, queued}
                        routed = factories it was really DELIVERED to · matched = registered factories it matched · queued = matched
                        but not delivered yet (provider error → retried automatically by the cron; status stays "received")
                        kind signup: payload.plan (or target_id) + payload.gcc — for a plan whose members pick GCC states (matrix gcc_pick:
                        Premium 3) exactly that many of SA AE KW QA BH OM, else 400 gcc_required {pick, allowed}; stored normalised
                        (payments.js copies it onto the member at activation)
   GET  /api/inquiries/:ref?last4=NNNN | ?t=<signed> | Bearer owner     → {ref, kind, status, target_name, created_at, routed_count,
                        replies_count, events:[{type, body, created_at}]} (buyer-visible events only; &lang=en → English bodies)
   GET  /api/inquiries/health
   GET|POST /api/inquiries/respond?t=<signed>  → a small server-rendered page, no sign-in needed (BACKLOG 24: works without Email
                        Routing): t = r.<route>.<sig> → that factory answers (quote / message / decline); t = b.<route>.<sig> → the
                        buyer writes to that factory. Every email / WhatsApp to a factory or buyer carries its link.
   Flow: received → matching engine (matching.js) picks up to 10 REGISTERED member factories (basic+; premium+ first) →
   email (Resend) + WhatsApp when the member opted in → status "routed" with the TRUE number of factories it was delivered to
   (email accepted by the provider, or the WhatsApp text itself — a template "ping" alone is not a delivery). 0 matches →
   "no_match": the buyer is told honestly, the request stays open 30 days and is sent automatically to matching members who
   join later (rematchForMember). Factory replies / quotes / declines (respond page, dashboard, or email when INBOUND_EMAIL=1)
   are forwarded to the buyer automatically.
   Email replies (INBOUND_EMAIL=1, needs Cloudflare Email Routing for REPLY_DOMAIN): only KEYED addresses are accepted —
   inq-<ref>-<route>@ (that factory), inq-<ref>-b<route>@ (the buyer to that factory), inq-<ref>-<reply_key>@ (the buyer).
   The key is the secret; a key-less inq-<ref>@ is always rejected (a From header can be forged). INBOUND_EMAIL unset/0 →
   emails say "use the link" and carry Reply-To NOREPLY_EMAIL (owner decision: Email Routing stays off, BACKLOG 24).
   Anonymous (not signed-in) buyers: links are removed from their text before it reaches factories, and factories are told the
   buyer's email is not confirmed yet. Cron: one reminder to silent factories after 48 h, retries of failed sends, auto-close
   after 30 days with a final email.
   Factory emails (route, 48 h reminder, buyer message) carry a signed one-time LOGIN link (auth.js dashLoginUrl:
   dashboard.html#lt=<t>&tab=incoming&ref=<REF>, 7 days, single use) — «رد من هنا» — plus the no-sign-in answer page.
   NO REGISTERED MATCH (owner decision 19): status "in_progress" («جاري معالجة طلبك» / "We're working on your request") is set
   automatically, the buyer is told so, and teamFlow() (1) lists candidate factories for the admins only — platform directory
   (non-registered, with source) + the web when BRAVE_SEARCH_KEY / GOOGLE_CSE_KEY+GOOGLE_CSE_CX is set (candidates.js), (2) puts a
   bell notice on every admin account and (3) emails TEAM_EMAIL + ADMIN_EMAILS. The admin console answers the buyer with
   teamReply() («إحنا اللي هنرد»: POST /api/admin/inquiries/:id/reply) → buyer-visible event with actor "team" + email (and
   WhatsApp when an approved buyer template exists; otherwise e-mail). The request still goes automatically to any matching
   member who joins within 30 days. */
import PostalMime from "postal-mime";
import DATA from "./data.json";
import { json, err, preflight, readJson, bodyErr, line, str, now, iso, hex, hmac, safeEq, jparse, isEmail, emailKey, ipHash, rateOk, isBlocked, human, mail, emailOn, team, site, notify, replyDomain, secretOf, effPlan, PLAN_LV, PLAN_NAME, fromAddr, prefsOf, unsubscribed, cairoDay, esc, hasLink, hasEmailAddr, stripLinks, govName, sameMailbox, membersByMailbox, impersonates,
  noReply, adminEmails, isAdmin, inboundOn as inboundOnC, rateCount, planCan, canonPlan, gccPick, normGcc, GCC } from "./common.js";
import { rank, candidates, inquiryMarket, MAX_ROUTES } from "./matching.js";
import { sendToMember, sendWA, waOn } from "./whatsapp.js";
import { authUser, dashLoginUrl } from "./auth.js";
import { findCandidates, aboutText } from "./candidates.js";
import { senderAuth } from "./advisor.js";

export const KINDS = ["contact", "rfq", "basket", "opp_offer", "lead_interest", "project_interest", "entity_contact", "signup", "profile_fix"];
const SOURCES = ["form", "janna", "bassem", "basket"];
/* Control Center requests (ACC-CONTRACT P-W5, §12.3): built inside the Worker by acc.js with req[Symbol.for("mig.cc.internal")] = {actor, source};
   never accepted from a client body, so a public POST can never claim them */
const INTERNAL_SOURCES = ["admin", "desk"];
const LIM = { message: 5000, perIp10min: 5, perEmailDay: 10, trackFailIpHour: 20, trackFailRefHour: 10, trackL4RefDay: 10, trackL4NetHour: 20, trackL4Dead: 20, inboundPerInqDay: 100, inboundPerKeyDay: 30, inboundBody: 8000,
  closeDays: 30, remindHours: 48, retryMax: 5, quotesPerRoute: 3, pageRepliesPerRouteDay: 20, routesPerMemberDay: 30, rematchMax: 20 };
const KIND_AR = { contact: "رسالة تواصل", rfq: "طلب عرض سعر", basket: "طلب سلة منتجات", opp_offer: "عرض على فرصة", lead_interest: "اهتمام بفرصة", project_interest: "اهتمام بمشروع", entity_contact: "تواصل مع جهة", signup: "طلب اشتراك", profile_fix: "تصحيح بيانات" };
const KIND_EN = { contact: "Message", rfq: "Request for quotation", basket: "Product basket request", opp_offer: "Offer on an opportunity", lead_interest: "Interest in an opportunity", project_interest: "Interest in a project", entity_contact: "Contact an entity", signup: "Membership application", profile_fix: "Data correction" };
export const routable = inq => inq.kind === "rfq" || inq.kind === "basket" || (inq.kind === "contact" && /^(factory|company)$/.test(inq.target_type || ""));
/* the admins have to act: no registered member matched (in_progress; no_match = rows from before this flow) */
export const needsTeam = r => !!r && routable(r) && (r.status === "in_progress" || r.status === "no_match");
const IN_PROGRESS = {
  ar: "جاري معالجة طلبك. لا يوجد حالياً مصنع مسجّل على المنصة يطابق طلبك، فاتبلّغت إدارة المنصة تلقائياً وبتدوّر على مصانع تقدر تنفّذه، وأي رد هيوصلك هنا وعلى إيميلك. الطلب كمان هيفضل مفتوح 30 يوم، وأول ما ينضم مصنع مسجّل مطابق هيوصله تلقائياً.",
  en: "We're working on your request. No registered factory on the platform matches it yet, so the platform's administrators were notified automatically and are looking for factories that can fulfil it; any answer reaches you here and by email. The request also stays open for 30 days and goes automatically to any matching registered factory that joins.",
};

/* ---------- helpers ---------- */
const ALPHA = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newRef(nowMs = Date.now()) {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "MIG-" + cairoDay(nowMs).slice(2, 4) + "-" + [...b].map(x => ALPHA[x % ALPHA.length]).join("");
}
export const REF_RX = /^MIG-\d{2}-[2-9A-HJKMNP-TV-Z]{6}$/;
const replyAddr = (env, ref, key) => `inq-${ref.toLowerCase()}-${key}@${replyDomain(env)}`;
/* email replies reach the platform only when Email Routing is set up for REPLY_DOMAIN (INBOUND_REPLY_ENABLED=1; old name
   INBOUND_EMAIL=1). Otherwise every email's Reply-To is the no-reply address and the body says «رد من هنا» with the links. */
export const inboundOn = env => inboundOnC(env);
const replyTo = (env, ref, key) => (inboundOn(env) ? replyAddr(env, ref, key) : noReply(env));
async function trackToken(env, ref) { return (await hmac(secretOf(env) || "mig", "track|" + ref)).slice(0, 24); }
export async function trackUrl(env, ref) { return `${site(env)}track.html#${ref}~${await trackToken(env, ref)}`; }
/* signed answer links: r.<route> = the factory of that route answers; b.<route> = the buyer writes to that factory */
const RESP_DAYS = 60;
const respSig = async (env, kind, routeId, exp) => (await hmac(secretOf(env) || "mig", "inqresp|" + kind + "|" + routeId + "|" + exp)).slice(0, 24);
/* t = <r|b>.<route>.<expiry, unix seconds base 36>.<sig> — valid RESP_DAYS after it was sent (SEC L6) */
export async function respondUrl(env, kind, routeId, nowMs = Date.now()) { const exp = Math.floor(nowMs / 1000 + RESP_DAYS * 86400).toString(36); return `${site(env)}api/inquiries/respond?t=${kind}.${routeId}.${exp}.${await respSig(env, kind, routeId, exp)}`; }
async function parseRespTok(env, t) {
  const m = /^([rb])\.([a-f0-9]{8})\.([a-z0-9]{5,8})\.([\w-]{24})$/.exec(String(t || ""));
  if (!m || !secretOf(env) || !safeEq(m[4], await respSig(env, m[1], m[2], m[3]))) return null;
  if (parseInt(m[3], 36) < Date.now() / 1000) return { expired: true };
  return { kind: m[1], routeId: m[2] };
}
const dashUrl = (env, ref) => `${site(env)}dashboard.html#incoming=${ref}`;
function cleanPayload(p) {
  const out = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return out;
  for (const k of Object.keys(p).slice(0, 30)) {
    if (!/^[A-Za-z_][\w-]{0,40}$/.test(k)) continue;
    const v = p[k];
    if (typeof v === "string") out[k] = str(v, 1000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter(x => typeof x === "string" || typeof x === "number").slice(0, 20).map(x => (typeof x === "string" ? line(x, 200) : x));
  }
  return out;
}
function cleanItems(a) {
  if (!Array.isArray(a)) return [];
  return a.slice(0, 50).filter(x => x && typeof x === "object" && !Array.isArray(x)).map(x => { const o = {}; for (const k of Object.keys(x).slice(0, 10)) { if (!/^[A-Za-z_][\w-]{0,30}$/.test(k)) continue; const v = x[k]; if (typeof v === "string") o[k] = line(v, 200); else if (typeof v === "number") o[k] = v; } return o; });
}
export const asInq = r => ({ ...r, payload: jparse(r.payload_json, {}), items: jparse(r.items_json, []) });
async function ev(env, inqId, type, { body = "", en = "", actor = "system", meta = {}, visible = 0 } = {}) {
  await env.DB.prepare("INSERT INTO inquiry_events (inquiry_id, type, actor, body, meta_json, buyer_visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(inqId, type, line(actor, 120), str(body, 8000), JSON.stringify({ ...meta, ...(en ? { en: str(en, 8000) } : {}) }), visible ? 1 : 0, now()).run();
}
const getInq = (env, ref) => env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(ref).first();
const firstName = n => line(n, 80).split(" ")[0] || "";
const n2 = n => (n === 1 ? "مصنع/شركة واحدة" : n === 2 ? "مصنعين/شركتين" : `${n} مصانع/شركات`);
const nEn = n => `${n} registered factor${n === 1 ? "y" : "ies"}`;
/* anonymous buyer (not signed in = email not confirmed): links are removed before the text reaches factories */
const anon = inq => !inq.user_id;
const bt = (env, inq, s) => (anon(inq) ? stripLinks(s, env) : String(s == null ? "" : s));
/* the name buyers see for a factory: the directory profile the platform linked to the member (admin-set factory_ref), else the
   company name on the account (links / platform-impersonating names are refused in PATCH /api/me) */
let FNAME = null;
function dirName(ref) {
  if (!FNAME) { FNAME = new Map(); for (const f of DATA.f || []) { const m = /company\.html#(.+)$/.exec(f[5] || ""); if (m) FNAME.set(m[1], f[0]); } }
  return FNAME.get(String(ref)) || "";
}
export const factoryName = m => line((m && m.factory_ref && dirName(m.factory_ref)) || (m && (m.company || m.name)) || "", 120) || "مصنع مسجّل";
const isTargetRoute = r => /(^|,)target(,|$)/.test((r && r.reason) || "");
/* what the request is about, for a factory: never another factory's name (the buyer's choice of a competitor stays private) */
const aboutOf = (env, inq, target) => line(bt(env, inq, (target && inq.target_name) || inq.payload.product || inq.payload.title || inq.payload.material || (inq.items[0] && (inq.items[0].name || inq.items[0].product)) || inq.sector || KIND_AR[inq.kind]), 80);
const PAY_KEYS = [["product", "المنتج", "Product"], ["title", "العنوان", "Title"], ["material", "الخامة", "Material"], ["project", "المشروع", "Project"], ["quantity", "الكمية", "Quantity"], ["qty", "الكمية", "Quantity"], ["unit", "الوحدة", "Unit"],
  ["specs", "المواصفات", "Specs"], ["details", "التفاصيل", "Details"], ["delivery", "مكان/موعد التسليم", "Delivery"], ["city", "المدينة", "City"], ["deadline", "مطلوب قبل", "Needed by"], ["budget", "الميزانية", "Budget"]];
/* the request as a factory may see it (no buyer contact details; links removed for anonymous buyers) */
export function factoryView(env, inq, { target = false } = {}) {
  const p = inq.payload || {}, out = {};
  for (const [k] of PAY_KEYS) if (p[k] != null && p[k] !== "") out[k] = line(bt(env, inq, p[k]), 300);
  if (out.qty && !out.quantity) out.quantity = out.qty;
  const gov = govName(inq.governorate || p.governorate);
  return { about: aboutOf(env, inq, target), payload: { ...out, ...(gov ? { governorate: gov, governorate_en: govName(inq.governorate || p.governorate, true) } : {}), ...(p.governorate_name && !gov ? { governorate: line(p.governorate_name, 60) } : {}) },
    message: bt(env, inq, inq.message || ""), items: (inq.items || []).map(it => { const o = {}; for (const k of Object.keys(it)) o[k] = typeof it[k] === "string" ? line(bt(env, inq, it[k]), 200) : it[k]; return o; }),
    buyer: { first_name: firstName(inq.name), company: line(bt(env, inq, inq.company || ""), 160), type: inq.company ? "company" : "individual", email_confirmed: !anon(inq) } };
}
function summaryLines(env, inq, { target = false } = {}) {
  const v = factoryView(env, inq, { target }), L = [];
  if (target && inq.target_name) L.push(`الموضوع / Subject: ${inq.target_name}`);
  for (const [k, ar, en] of PAY_KEYS) { if (k === "qty" && v.payload.quantity) continue; if (v.payload[k]) L.push(`${ar} / ${en}: ${v.payload[k]}`); } // qty is copied into quantity
  if (inq.sector) L.push(`القطاع / Sector: ${inq.sector}`);
  if (v.payload.governorate) L.push(`المحافظة / Governorate: ${v.payload.governorate}${v.payload.governorate_en && v.payload.governorate_en !== v.payload.governorate ? " / " + v.payload.governorate_en : ""}`);
  if (inq.market && inq.market !== "local") L.push(`السوق / Market: ${inq.market}${inq.payload.country ? " (" + line(bt(env, inq, inq.payload.country), 60) + ")" : ""}`);
  v.items.slice(0, 30).forEach((it, i) => L.push(`${i + 1}. ${[it.name || it.product, it.qty || it.quantity ? "× " + (it.qty || it.quantity) : "", it.unit || "", it.maker ? "(" + it.maker + ")" : ""].filter(Boolean).join(" ")}`));
  return L.join("\n");
}
const SAFETY = { ar: "تنبيه أمان: المنصة عمرها ما بتطلب منك تحويل فلوس ومش طرف في أي دفع. قبل أي تحويل اتأكد بنفسك من بيانات الحساب البنكي للمصنع من مصدر رسمي.", en: "Safety: the platform never asks you to transfer money and is not part of any payment. Before paying, confirm the factory's bank details yourself through an official source." };
/* the buyer's account (signed in when sending, or a member with the same confirmed mailbox) — for bell notifications */
async function buyerUserId(env, inq) {
  if (inq.user_id) return inq.user_id;
  const m = (await membersByMailbox(env, inq.email, "id, email_verified_at")).find(x => x.email_verified_at);
  return m ? m.id : "";
}
/* WhatsApp updates to buyers need an approved template for business-initiated messages (WA_TPL_BUYER_UPDATE, none yet) */
export const buyerWaOn = env => !!(waOn(env) && line(env.WA_TPL_BUYER_UPDATE, 64));

/* ---------- HTTP ---------- */
export async function handleInquiries(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/inquiries/, "").replace(/\/+$/, "") || "/";
  try {
    if (path === "/health") return json({ ok: !!(env.DB && emailOn(env) && secretOf(env)), store: env.DB ? "d1" : "none", email: emailOn(env), auth: !!secretOf(env), whatsapp: waOn(env), turnstile: !!env.TURNSTILE_SECRET, routing: "automatic",
      inbound_email: inboundOn(env), buyer_whatsapp: buyerWaOn(env), respond_links: true });
    if (path === "/respond") return await respondPage(req, env, url);
    if (!env.DB) return err(503, "store_off", "store not configured");
    if (!secretOf(env)) return err(503, "auth_off", "auth not configured");
    if (path === "/") return req.method === "POST" ? await create(req, env, ctx) : err(405, "method", "method not allowed");
    const m = path.match(/^\/([A-Za-z0-9-]{6,20})$/);
    if (m) return req.method === "GET" ? await track(req, env, m[1].toUpperCase(), url) : err(405, "method", "method not allowed");
    return err(404, "not_found", "not found");
  } catch (e) {
    console.error("inquiries error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}

async function create(req, env, ctx) {
  const b = await readJson(req); const be = bodyErr(b); if (be) return be;
  const internal = req[Symbol.for("mig.cc.internal")] || null; // a staff entry from the Control Center / front desk (no Turnstile, no IP limits)
  let user = await authUser(req, env);
  // a signed-in account speaks only for ITS OWN mailbox (SEC M3): a request typed under another address is handled exactly like an
  // anonymous one — Turnstile, links removed before factories see it, "e-mail not confirmed", nothing attached to the account
  const typed = line(b.email, 254).toLowerCase();
  if (user && typed && !sameMailbox(typed, user.email)) user = null;
  if (user && !user.email_verified_at) user = null;
  const kind = line(b.kind, 30);
  if (!KINDS.includes(kind)) return err(400, "invalid_kind", "invalid kind", { kinds: KINDS });
  const email = (line(b.email, 254) || (user && user.email) || "").toLowerCase();
  const name = line(b.name, 120) || (user && user.name) || "";
  const phone = line(b.phone, 30) || (user && user.phone) || "";
  const company = line(b.company, 160) || (user && user.company) || "";
  if (!isEmail(email)) return err(400, "invalid_email", "valid email required");
  if (name.length < 2) return err(400, "name_required", "name required");
  if (hasLink(name) || /:\/\/|www\./i.test(name) || hasEmailAddr(name)) return err(400, "invalid_name", "name must not contain links");
  if (company && (hasLink(company) || hasEmailAddr(company) || impersonates(company))) return err(400, "invalid_company", "company must be a plain company name (no links or e-mail addresses)");
  if (phone && !/^\+?[\d\s()-]{6,30}$/.test(phone)) return err(400, "invalid_phone", "invalid phone");
  const message = str(b.message, LIM.message + 1).replace(/\r\n/g, "\n");
  if (message.length > LIM.message) return err(413, "too_long", "message too long", { max: LIM.message });
  const payload = cleanPayload(b.payload), items = cleanItems(b.items);
  if ((kind === "rfq" || kind === "contact") && !message && !payload.product && !payload.title && !items.length) return err(400, "message_required", "message required");
  if (kind === "basket" && !items.length) return err(400, "items_required", "items required");
  if (kind === "signup") { // Premium = Egypt + the GCC states the member picks on the form (matrix gcc_pick): exactly that many, stored normalised
    const pick = gccPick(canonPlan(payload.plan || line(b.target_id, 120)));
    if (pick > 0) {
      const g = normGcc(payload.gcc);
      if (g.length !== pick) return err(400, "gcc_required", `اختار ${pick} دول خليجية بالظبط للباقة دي / pick exactly ${pick} Gulf states for this plan`, { pick, allowed: GCC });
      payload.gcc = g;
    } else delete payload.gcc;
  }
  if (!user && !internal) { const h = await human(req, env, b); if (h) return h; }
  const ih = await ipHash(req, env), key = emailKey(email);
  if (await isBlocked(env, { email, ip_hash: ih })) return err(403, "blocked", "requests from this sender are blocked");
  // idempotent double submit: the SAME requester (same network or same account) + kind + target + text within 10 minutes → the same ref
  const target_type = line(b.target_type, 30).toLowerCase().replace(/[^a-z_]/g, ""), target_id = line(b.target_id, 120), target_name = line(b.target_name, 200);
  const dup = await env.DB.prepare("SELECT ref, status, routed_count FROM inquiries WHERE email_key = ? AND kind = ? AND target_type = ? AND target_id = ? AND message = ? AND created_at > ? AND (ip_hash = ? OR (user_id != '' AND user_id = ?)) LIMIT 1")
    .bind(key, kind, target_type, target_id, message, iso(Date.now() - 600000), ih, user ? user.id : "-").first();
  if (dup) return json({ ok: true, ref: dup.ref, status: dup.status, routed: dup.routed_count, duplicate: true });
  if (!internal && !(await rateOk(env, "inqip|" + ih, LIM.perIp10min, 600))) return err(429, "rate_limited", "too many requests, try again in a few minutes");
  if (!internal && !(await rateOk(env, "inqem|" + key, LIM.perEmailDay, 86400))) return err(429, "rate_limited", "daily limit reached for this email");
  const t = now(), id = hex(8), lang = String(b.lang || "").startsWith("en") ? "en" : "ar";
  let ref = newRef();
  for (let i = 0; i < 3 && await getInq(env, ref); i++) ref = newRef();
  const row = { id, ref, kind, target_type, target_id, target_name, user_id: user ? user.id : "", name, company, email, email_key: key, phone, phone_last4: phone.replace(/\D/g, "").slice(-4),
    consent_wa: b.consent_wa === true || b.consent_wa === 1 || b.consent_wa === "1" ? 1 : 0, message, payload_json: JSON.stringify(payload), items_json: JSON.stringify(items),
    sector: line(payload.sector, 120), governorate: line(payload.governorate, 60), market: inquiryMarket(payload), status: "received", source: internal ? (INTERNAL_SOURCES.includes(internal.source) ? internal.source : "admin") : SOURCES.includes(b.source) ? b.source : "form", lang, ip_hash: ih, reply_key: hex(5), created_at: t, updated_at: t };
  const cols = Object.keys(row);
  await env.DB.prepare(`INSERT INTO inquiries (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map(k => row[k])).run();
  await ev(env, id, "received", { visible: 1, body: `تم استلام ${KIND_AR[kind]} برقم ${ref}.`, en: `${KIND_EN[kind]} received, reference ${ref}.`, ...(internal ? { meta: { by: line(internal.actor, 80), via: internal.source || "admin" } } : {}) });
  let inq = asInq(await getInq(env, ref)), res = { routed: 0, matched: 0, queued: 0 };
  if (routable(inq)) res = await routeInquiry(env, inq);
  else await recordOnly(env, inq, user);
  inq = asInq(await getInq(env, ref));
  // receipt (after routing, so it states the true number) + monitoring copy to the team (no action required)
  const jobs = [sendReceipt(env, inq, res).then(r => r.sent && env.DB.prepare("UPDATE inquiries SET receipt_sent = 1 WHERE id = ?").bind(id).run())];
  // no registered match → the admins act (candidates + console + email); its notice replaces the monitoring copy
  if (res.needs_team) jobs.push(teamFlow(env, id));
  else if (team(env) && env.TEAM_NOTICES !== "0") jobs.push(mail(env, { id: "team-" + id, to: team(env), subject: `[متابعة] ${KIND_AR[kind]} ${ref} — ${inq.status} (${inq.routed_count})`, ar: `للمتابعة فقط — كل الخطوات تلقائية ولا يلزم أي إجراء.\n${KIND_AR[kind]} ${ref}\nالحالة: ${inq.status} · أُرسل إلى: ${inq.routed_count} · مطابق: ${res.matched || 0}\nمن: ${inq.company || "-"} (${firstName(inq.name)})${anon(inq) ? " — بدون تسجيل دخول" : ""}\n${summaryLines(env, inq)}\n\n${line(message, 600)}`, en: `Monitoring copy only — everything is automatic, no action needed. ${ref}: status ${inq.status}, delivered to ${inq.routed_count}, matched ${res.matched || 0}.` }));
  if (user) jobs.push(notify(env, user.id, { kind: "inquiry", title: `تم استلام طلبك ${ref}`, title_en: `Request ${ref} received`, body: inq.status === "routed" ? `اتبعت تلقائياً إلى ${n2(inq.routed_count)}` : inq.status === "in_progress" ? "جاري معالجة طلبك" : "", body_en: inq.status === "routed" ? `Sent automatically to ${nEn(inq.routed_count)}` : inq.status === "in_progress" ? "We're working on your request" : "", url: "track.html#" + ref, ref }));
  ctx.waitUntil(Promise.all(jobs).catch(e => console.error("inquiry mails", e && e.message)));
  return json({ ok: true, ref, status: inq.status, routed: inq.routed_count, matched: res.matched || 0, queued: res.queued || 0 }, 201);
}

/* kinds that are not routed to factories: recorded, honest timeline, auto-follow the item for the logged-in user */
async function recordOnly(env, inq, user) {
  const FOLLOWED = /^(opp_offer|lead_interest|project_interest)$/.test(inq.kind) && inq.target_type && inq.target_id;
  const T = {
    contact: ["رسالتك اتسجّلت. جنة (المساعدة الذكية) بترد فوراً على أغلب الأسئلة من أي صفحة في المنصة، وتقدر تحجز اجتماع تعريفي معاها في أي وقت.", "Your message is recorded. Janna (the AI assistant) answers most questions instantly on any page, and you can book an introductory meeting with her at any time."],
    opp_offer: ["عرضك اتسجّل على الفرصة. بيانات صاحب الفرصة مش متاحة على المنصة، فالتقديم الرسمي بيكون عند الجهة من الإعلان الرسمي.", "Your offer is recorded on this opportunity. The publisher's contact is not available on the platform, so the official submission is made to the entity through its official notice."],
    lead_interest: ["اهتمامك بالفرصة اتسجّل.", "Your interest in the opportunity is recorded."],
    project_interest: ["اهتمامك بالمشروع اتسجّل.", "Your interest in the project is recorded."],
    entity_contact: ["رسالتك اتسجّلت. المنصة ما بتراسلش الجهات الحكومية نيابةً عن حد؛ تقدر تتواصل معاها من بياناتها الرسمية المنشورة في صفحتها.", "Your message is recorded. The platform does not write to public entities on anyone's behalf; use the official contact details published on its page."],
    signup: ["طلب الاشتراك اتسجّل. تقدر تدخل دلوقتي بكود على الإيميل وتكمّل بيانات شركتك. الدفع الإلكتروني الآمن لسه بيتجهّز — أول ما يشتغل هيوصلك رابطه تلقائياً على الإيميل ده، ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.", "Your application is recorded. You can sign in now with an email code and complete your company data. Secure online payment is being set up — once live, its link is emailed to you automatically; we never ask for card details on our pages."],
    profile_fix: ["طلب التصحيح اتسجّل وهيتطبّق في تحديث البيانات الجاي بعد التحقق من المصدر.", "Your correction is recorded and will be applied in the next data update after the source is checked."],
  }[inq.kind] || ["طلبك اتسجّل.", "Your request is recorded."];
  // «you will be notified» only where it is true: a signed-in sender follows the item now; anyone else after signing in
  // with this same e-mail (auth.js attaches their requests and follows the items then)
  const F = !FOLLOWED ? ["", ""] : user ? [" وبقيت متابعه في حسابك، فهتوصلك تحديثاته تلقائياً.", " You now follow it in your account, so its updates reach you automatically."]
    : [" لو دخلت بحسابك بكود على نفس الإيميل ده، هتتابعه تلقائياً وتوصلك تحديثاته.", " Sign in with an email code on this same address and you will follow it automatically and get its updates."];
  await env.DB.prepare("UPDATE inquiries SET status = 'recorded', updated_at = ? WHERE id = ?").bind(now(), inq.id).run();
  await ev(env, inq.id, "status", { visible: 1, body: T[0] + F[0], en: T[1] + F[1] });
  if (user && FOLLOWED)
    await env.DB.prepare("INSERT INTO follows (user_id, kind, ref_id, label, url, created_at) VALUES (?, ?, ?, ?, '', ?) ON CONFLICT(user_id, kind, ref_id) DO NOTHING").bind(user.id, inq.target_type.slice(0, 30), inq.target_id, inq.target_name, now()).run();
}

/* ---------- automatic routing ---------- */
const routesToday = async (env, memberId) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE member_id = ? AND created_at > ?").bind(memberId, iso(Date.now() - 86400000)).first("n")) || 0;
const capOf = env => Math.max(1, Math.min(500, parseInt(env.MAX_ROUTES_PER_MEMBER_DAY, 10) || LIM.routesPerMemberDay));
export async function routeInquiry(env, inq, { only } = {}) {
  if (inq.status === "closed" || inq.status === "blocked") return { routed: inq.routed_count || 0, added: 0, matched: 0, queued: 0 };
  const { results: existing } = await env.DB.prepare("SELECT * FROM inquiry_routes WHERE inquiry_id = ?").bind(inq.id).all();
  const have = existing || [];
  const room = MAX_ROUTES - have.length;
  let picks = [];
  if (room > 0) {
    const pool = only ? [only] : await candidates(env);
    const ranked = rank(inq, pool, { exclude: have.map(r => r.member_id), max: room + 10, nowIso: now() });
    for (const r of ranked) {
      if (picks.length >= room) break;
      if (await unsubscribed(env, r.member.email, "incoming")) continue;
      if (await isBlocked(env, { email: r.member.email })) continue;
      if (await routesToday(env, r.member.id) >= capOf(env)) continue; // per-factory daily cap (anti-flood); the request stays open for others
      picks.push(r);
    }
  }
  const t = now();
  for (const p of picks) await env.DB.prepare("INSERT INTO inquiry_routes (id, inquiry_id, member_id, score, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(inquiry_id, member_id) DO NOTHING").bind(hex(4), inq.id, p.member.id, p.score, p.priority, p.reason, t).run();
  const { results: toSend } = await env.DB.prepare("SELECT r.*, m.email AS m_email FROM inquiry_routes r JOIN members m ON m.id = r.member_id WHERE r.inquiry_id = ? AND r.status IN ('pending', 'failed') AND r.attempts < ?").bind(inq.id, LIM.retryMax).all();
  const before = inq.routed_count || 0;
  await Promise.all((toSend || []).map(async r => { const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first(); if (m) await sendRoute(env, inq, r, m); }));
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE inquiry_id = ? AND (email_sent = 1 OR wa_sent = 1)").bind(inq.id).first("n");
  const failed = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE inquiry_id = ? AND status IN ('pending', 'failed') AND attempts < ?").bind(inq.id, LIM.retryMax).first("n");
  const matched = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE inquiry_id = ?").bind(inq.id).first("n");
  const total = cnt || 0, added = total - before;
  let status = inq.status, needs_team = false;
  if (total > 0 && /^(received|no_match|in_progress)$/.test(status)) status = "routed";
  if (total === 0 && !failed && /^(received|no_match)$/.test(status)) status = "in_progress"; // no registered match → the admins act
  await env.DB.prepare("UPDATE inquiries SET routed_count = ?, status = ?, updated_at = ? WHERE id = ?").bind(total, status, now(), inq.id).run();
  if (added > 0) {
    const first = before === 0;
    await ev(env, inq.id, first ? "routed" : "rematched", { visible: 1, meta: { count: total, added },
      body: first ? `تم إرسال طلبك تلقائياً إلى ${n2(total)} مسجّلة على المنصة تطابق طلبك. الردود والعروض بتوصلك هنا وعلى إيميلك تلقائياً.` : `انضم للمنصة ${n2(added)} يطابق طلبك واتبعتله الطلب تلقائياً (الإجمالي: ${total}).`,
      en: first ? `Your request was sent automatically to ${nEn(total)} matching it. Replies and quotes reach you here and by email automatically.` : `${added} newly registered factor${added === 1 ? "y" : "ies"} matching your request received it automatically (total: ${total}).` });
  } else if (status === "in_progress" && inq.status !== "in_progress") {
    await ev(env, inq.id, "in_progress", { visible: 1, body: IN_PROGRESS.ar, en: IN_PROGRESS.en, meta: { matched: matched || 0 } });
    needs_team = true; // the caller runs teamFlow() (candidates + admin console + admin email)
  } else if (failed && total === before) await ev(env, inq.id, "send_failed", { meta: { pending: failed } });
  return { routed: total, added, matched: matched || 0, queued: failed || 0, needs_team };
}

async function sendRoute(env, inq, r, m) {
  const t = now(), target = isTargetRoute(r), plan = PLAN_NAME[effPlan(m)] || PLAN_NAME.basic;
  const about = aboutOf(env, inq, target), what = summaryLines(env, inq, { target }), v = factoryView(env, inq, { target });
  const respond = await respondUrl(env, "r", r.id), dash = await dashLoginUrl(env, m, inq.ref); // signed one-time login link (7 days)
  const unconfirmed = anon(inq) ? "\n(المشتري بعت من غير تسجيل دخول — بريده لسه ماتأكدش، والروابط اللي في رسالته اتشالت للأمان.)" : "";
  const viaMail = inboundOn(env) ? "\nأو اضغط «رد» على الإيميل ده وردك هيوصل للمشتري تلقائياً." : "\n(ماتردش على الإيميل ده — الرد بيتم من الرابط.)";
  const e = await mail(env, { id: `route-${r.id}-${r.attempts}`, to: m.email, lang: "ar", list: "incoming", replyTo: replyTo(env, inq.ref, r.id),
    subject: `طلب جديد من منصة صنع في مصر: ${about} (${inq.ref})`,
    ar: `أهلاً ${m.name || m.company || ""}،\nوصلك ${KIND_AR[inq.kind]} جديد عن طريق منصة صنع في مصر (${inq.ref}) لأن نشاطك/منتجاتك المسجّلة تطابقه.\n\nالمشتري: ${v.buyer.first_name}${v.buyer.company ? " — " + v.buyer.company : ""}${unconfirmed}\n${what}\n\n${v.message ? "الرسالة:\n" + v.message + "\n\n" : ""}رد من هنا — الرابط بيفتح لوحة التحكم على الطلب ده مباشرةً («طلبات واردة لي») ومعاه فورم عرض السعر، من غير كلمة سر (لمرة واحدة، صالح 7 أيام):\n${dash}\n\nأو رد سريع / عرض سعر (السعر، الحد الأدنى، مدة التوريد، الصلاحية) / اعتذار من غير تسجيل دخول:\n${respond}${viaMail}\nلو مافيش رد خلال 48 ساعة هيوصلك تذكير واحد بس.`,
    en: `Hello ${m.name || m.company || ""},\nYou received a new ${KIND_EN[inq.kind].toLowerCase()} through Made in Egypt Gate (${inq.ref}) because your registered activity/products match it.\n\nBuyer: ${v.buyer.first_name}${v.buyer.company ? " — " + v.buyer.company : ""}${anon(inq) ? " (email not confirmed yet; links removed)" : ""}\n\nAnswer here — this link opens your dashboard on this request ("Incoming requests") with the quote form, no password (single use, valid 7 days):\n${dash}\n\nOr answer, quote or decline without signing in:\n${respond}${inboundOn(env) ? "\nOr just reply to this email." : "\n(Please do not reply to this email — use the links.)"}`,
    why: `وصلتك لأنك عضو في ${plan[0]} على المنصة / You are a ${plan[1]} member.` });
  let w = { sent: false }, waStatus = r.wa_status || "";
  const waWanted = prefsOf(m).wa_optin && m.phone && waOn(env);
  if (waWanted && !/^(sent|template)$/.test(waStatus)) { // a retry never pings the same factory twice on WhatsApp
    w = await sendToMember(env, m, { text: `طلب جديد ${inq.ref} من منصة صنع في مصر يطابق منتجاتك: ${about}\nتفاصيله والرد عليه (من غير تسجيل دخول): ${respond}`, template: "bassem_update", queueText: true });
    waStatus = w.sent ? (w.via === "text" ? "sent" : "template") : "failed";
  } else if (!waWanted) waStatus = "skipped";
  // delivered = the email was accepted by the provider, or the WhatsApp TEXT itself went out (a template ping alone is not the request)
  const waText = waStatus === "sent", ok = !!(e.sent || waText);
  const emailStatus = e.sent ? "sent" : e.skipped ? "skipped" : "failed";
  await env.DB.prepare("UPDATE inquiry_routes SET status = ?, email_sent = ?, wa_sent = ?, email_status = ?, wa_status = ?, attempts = attempts + 1, error = ?, sent_at = CASE WHEN ? THEN ? ELSE sent_at END WHERE id = ?")
    .bind(ok ? "sent" : "failed", e.sent ? 1 : 0, waText ? 1 : 0, emailStatus, waStatus, ok ? "" : line(e.error || w.error || "send failed", 200), ok ? 1 : 0, t, r.id).run();
  if (ok && !r.sent_at) await notify(env, m.id, { kind: "incoming", title: `طلب جديد واردلك: ${about}`, title_en: `New request for you: ${about}`, body: `${KIND_AR[inq.kind]} ${inq.ref}`, body_en: `${KIND_EN[inq.kind]} ${inq.ref}`, url: "dashboard.html#incoming=" + inq.ref, ref: inq.ref });
  return ok;
}

/* a member was activated / changed sector-products: send them the open requests they match (newest first, at most 20) */
export async function rematchForMember(env, memberId) {
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first();
  if (!m || !planCan(m, "incoming") || !m.verified || !m.email || m.inbox_paused) return { sent: 0 };
  if (await isBlocked(env, { email: m.email })) return { sent: 0 };
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries WHERE status IN ('in_progress', 'no_match', 'routed', 'replied') AND routed_count < ? AND created_at > ?
      AND (kind IN ('rfq', 'basket') OR (kind = 'contact' AND target_type IN ('factory', 'company')))
      AND id NOT IN (SELECT inquiry_id FROM inquiry_routes WHERE member_id = ?) ORDER BY created_at DESC LIMIT ?`).bind(MAX_ROUTES, iso(Date.now() - LIM.closeDays * 86400000), m.id, LIM.rematchMax).all();
  let sent = 0;
  for (const row of results || []) {
    const inq = asInq(row);
    const before = inq.routed_count, r = await routeInquiry(env, inq, { only: m });
    if (r.routed > before) { sent++; const fresh = asInq(await getInq(env, inq.ref)); await buyerUpdate(env, fresh, "rematched", { count: r.routed }); }
  }
  return { sent };
}

/* ---------- buyer emails ---------- */
async function sendReceipt(env, inq, res = {}) {
  const track = await trackUrl(env, inq.ref), meet = site(env) + "meeting.html#book";
  let ar, en;
  if (inq.status === "routed") { ar = `اتبعت طلبك تلقائياً إلى ${n2(inq.routed_count)} مسجّلة على المنصة تطابق طلبك.\nالمصانع بترد بنفسها، وأي رد أو عرض سعر بيوصلك على الإيميل ده ويظهر في صفحة التتبع فوراً. لو مصنع ما ردّش خلال 48 ساعة المنصة بتفكّره مرة واحدة تلقائياً، والطلب بيتقفل تلقائياً بعد 30 يوم.`; en = `Your request was sent automatically to ${nEn(inq.routed_count)} matching it.\nFactories answer directly; every reply or quote reaches this inbox and the tracking page right away. A factory that has not answered after 48 h gets one automatic reminder; the request closes automatically after 30 days.`; }
  else if (inq.status === "in_progress") { ar = `${IN_PROGRESS.ar}${team(env) ? "\nلو عندك تفاصيل زيادة (مواصفات، كمية، موعد) رد على الإيميل ده — ردك بيوصل لإدارة المنصة مباشرةً." : ""}\nتقدر كمان تحجز اجتماع تعريفي مع جنة: ${meet}`; en = `${IN_PROGRESS.en}${team(env) ? "\nMore details (specs, quantity, dates)? Reply to this email — it reaches the platform's administrators directly." : ""}\nYou can also book an introductory meeting with Janna: ${meet}`; }
  else if (inq.status === "no_match") { ar = "لا يوجد حالياً مصنع مسجّل على المنصة يطابق طلبك، فما اتبعتش لأي جهة لسه — ومش هنقول غير كده.\nالطلب هيفضل مفتوح 30 يوم، وأول ما ينضم مصنع مطابق هيوصله تلقائياً وهنبلغك على الإيميل ده.\nتقدر كمان توسّع وصف المنتج في طلب جديد، أو تحجز اجتماع تعريفي مع جنة (هي اللي بتحدد الموعد وتبعتلك اللينك): " + meet; en = "No registered factory on the platform matches your request yet, so it has not been sent to anyone.\nIt stays open for 30 days and is sent automatically to matching factories that join; you will be emailed.\nYou can also send a broader description or book a meeting with Janna (she books it and emails you the link): " + meet; }
  else if (inq.status === "received") {
    const n = res.queued || res.matched || 0;
    ar = n ? `طلبك اتسجّل ومطابق لـ${n2(n)} مسجّلة على المنصة، بس الإرسال ليهم ما اكتملش بسبب عطل مؤقت في الإرسال، وبيتعاد تلقائياً خلال ساعة. هنبلغك بالعدد الحقيقي أول ما يتبعت.` : "طلبك اتسجّل، والإرسال للمصانع المطابقة بيتعاد تلقائياً خلال ساعة بسبب عطل مؤقت. هنبلغك بالعدد الحقيقي أول ما يتبعت.";
    en = n ? `Your request is recorded and matches ${nEn(n)}, but delivery did not complete because of a temporary sending problem; it is retried automatically within the hour. You will be told the real number once it is sent.` : "Your request is recorded; delivery to matching factories is retried automatically within the hour because of a temporary sending problem. You will be told the real number once it is sent.";
  }
  else { const e = await env.DB.prepare("SELECT body, meta_json FROM inquiry_events WHERE inquiry_id = ? AND type = 'status' ORDER BY id DESC LIMIT 1").bind(inq.id).first(); ar = e ? e.body : "طلبك اتسجّل."; en = e ? jparse(e.meta_json, {}).en || "" : "Your request is recorded."; }
  const waNote = inq.consent_wa && !buyerWaOn(env) ? ["\n(تحديثات الواتساب لسه مش متاحة — كل التحديثات بتوصلك على الإيميل ده وفي صفحة التتبع.)", "\n(WhatsApp updates are not available yet — every update reaches this email and the tracking page.)"] : ["", ""];
  return mail(env, { id: "rcpt-" + inq.id, to: inq.email, lang: inq.lang,
    subject: inq.lang === "en" ? `Received: ${KIND_EN[inq.kind]} ${inq.ref}` : `تم الاستلام: ${KIND_AR[inq.kind]} ${inq.ref}`, replyTo: inq.status === "in_progress" && team(env) ? team(env) : replyTo(env, inq.ref, inq.reply_key),
    ar: `أهلاً ${firstName(inq.name)}،\nاستلمنا ${KIND_AR[inq.kind]} رقم ${inq.ref}.\n\n${ar}${waNote[0]}\n\nتتبّع الطلب: ${track}\n(كل ده بيتم تلقائياً — المنصة ما فيهاش موظف بيراجع الطلبات يدوياً.)`,
    en: `Hello ${firstName(inq.name)},\nWe received your ${KIND_EN[inq.kind].toLowerCase()} ${inq.ref}.\n\n${en}${waNote[1]}\n\nTrack it: ${track}\n(All of this is automatic — nobody reviews requests by hand.)`,
    why: "وصلتك لأنك أرسلت طلباً على المنصة / You sent a request on the platform." });
}
/* every reply / quote / decline / status change → buyer email (list "updates", unsubscribable) + bell (+ WhatsApp when a
   buyer template is configured and the buyer agreed) */
export async function buyerUpdate(env, inq, what, x = {}) {
  const track = await trackUrl(env, inq.ref), meet = site(env) + "meeting.html#book";
  const from = x.from || "مصنع مسجّل", fromEn = x.from || "a registered factory";
  const M = {
    reply: [`وصلك رد جديد على طلبك ${inq.ref} من ${from}:\n\n${x.body || ""}`, `New reply on your request ${inq.ref} from ${fromEn}:\n\n${x.body || ""}`, `رد جديد على طلبك ${inq.ref}`, `New reply: ${inq.ref}`],
    quote: [`وصلك ${x.revised ? "عرض سعر معدّل" : "عرض سعر"} على طلبك ${inq.ref} من ${from}:\n\n${x.body || ""}`, `${x.revised ? "Revised quote" : "New quote"} on your request ${inq.ref} from ${fromEn}:\n\n${x.body || ""}`, `${x.revised ? "عرض سعر معدّل" : "عرض سعر جديد"} على ${inq.ref}`, `${x.revised ? "Revised quote" : "New quote"}: ${inq.ref}`],
    declined: [`${from} اعتذر عن طلبك ${inq.ref}.${x.body ? "\nالسبب: " + x.body : ""}\nباقي المصانع اللي وصلها الطلب لسه ممكن ترد.`, `${fromEn} declined your request ${inq.ref}.${x.body ? "\nReason: " + x.body : ""}\nThe other factories that received it can still answer.`, `مصنع اعتذر عن ${inq.ref}`, `A factory declined ${inq.ref}`],
    rematched: [`طلبك ${inq.ref} اتبعت تلقائياً لمصنع جديد انضم للمنصة ويطابقه. الإجمالي دلوقتي: ${x.count}.`, `Your request ${inq.ref} was sent automatically to a newly registered matching factory. Total now: ${x.count}.`, `طلبك ${inq.ref} وصل لمصنع جديد`, `${inq.ref} reached a new factory`],
    closed: [`طلبك ${inq.ref} اتقفل تلقائياً بعد 30 يوم. اتبعت إلى ${n2(inq.routed_count || 0)}، ووصلك ${inq.replies_count || 0} رد/عرض. لو لسه محتاج، ابعت طلب جديد في أي وقت.`, `Your request ${inq.ref} was closed automatically after 30 days. It was sent to ${inq.routed_count || 0} factories and received ${inq.replies_count || 0} replies/quotes. Send a new request any time.`, `تم إغلاق الطلب ${inq.ref}`, `Request ${inq.ref} closed`],
    in_progress: [`${IN_PROGRESS.ar}`, `${IN_PROGRESS.en}`, `جاري معالجة طلبك ${inq.ref}`, `We're working on your request ${inq.ref}`],
    declined_all: [`كل المصانع اللي وصلها طلبك ${inq.ref} اعتذرت عنه.${x.body ? "\nآخر سبب: " + x.body : ""}\nالطلب لسه مفتوح وهيتبعت تلقائياً لأي مصنع مطابق ينضم. تقدر كمان تحجز اجتماع مع جنة: ${meet}`, `All factories that received ${inq.ref} declined it.${x.body ? "\nLast reason: " + x.body : ""}\nIt stays open and is sent automatically to matching factories that join. You can also book a meeting with Janna: ${meet}`, `تحديث على طلبك ${inq.ref}`, `Update: ${inq.ref}`],
  }[what];
  if (!M) return;
  const uid = await buyerUserId(env, inq);
  if (uid) await notify(env, uid, { kind: "inquiry_" + what, title: M[2], title_en: M[3], body: line(x.body || M[0], 300), body_en: line(x.body || M[1], 300), url: "track.html#" + inq.ref, ref: inq.ref });
  if (buyerWaOn(env) && inq.consent_wa && inq.phone && /^(reply|quote|declined_all|closed|in_progress)$/.test(what)) // approved buyer template only (business-initiated)
    try { await sendWA(env, inq.phone, { template: line(env.WA_TPL_BUYER_UPDATE, 64), params: [inq.ref], firstName: firstName(inq.name) }); } catch (e) { console.error("buyer wa", e && e.message); }
  // the buyer answers that one factory: a signed link (always) or, with Email Routing on, a reply to this email
  const ans = x.route_id ? await respondUrl(env, "b", x.route_id) : "";
  const safety = /^(reply|quote)$/.test(what) ? [`\n\n${SAFETY.ar}`, `\n\n${SAFETY.en}`] : ["", ""];
  const rt = x.route_id ? replyTo(env, inq.ref, "b" + x.route_id) : what === "in_progress" && team(env) ? team(env) : replyTo(env, inq.ref, inq.reply_key);
  return mail(env, { id: `upd-${inq.id}-${what}-${x.event_id || hex(4)}`, to: inq.email, lang: inq.lang, list: "updates", replyTo: rt, subject: inq.lang === "en" ? M[3] : M[2],
    ar: `${M[0]}${safety[0]}\n\n${ans ? "للرد على المصنع: " + ans + "\n" + (inboundOn(env) ? "(أو اضغط «رد» على الإيميل ده.)\n" : "") : ""}تتبّع الطلب: ${track}`,
    en: `${M[1]}${safety[1]}\n\n${ans ? "To answer the factory: " + ans + "\n" + (inboundOn(env) ? "(or just reply to this email)\n" : "") : ""}Track: ${track}`,
    why: "تحديث تلقائي على طلبك / Automatic update on your request." });
}

/* factory reply or quote → timeline + buyer (shared by the respond page, the dashboard and inbound email) */
export async function recordFactoryResponse(env, inq, route, member, { type, body, meta, revised }) {
  const t = now(), from = factoryName(member);
  await env.DB.prepare("UPDATE inquiry_routes SET status = ?, replied_at = CASE WHEN replied_at = '' THEN ? ELSE replied_at END WHERE id = ?").bind(type === "quote" ? "quoted" : route.status === "quoted" ? "quoted" : "replied", t, route.id).run();
  await env.DB.prepare("UPDATE inquiries SET replies_count = replies_count + 1, status = CASE WHEN status IN ('received', 'routed', 'no_match', 'in_progress') THEN 'replied' ELSE status END, updated_at = ? WHERE id = ?").bind(t, inq.id).run();
  const label = type === "quote" ? (revised ? ["عرض سعر معدّل", "Revised quote"] : ["عرض سعر", "Quote"]) : ["رد", "Reply"];
  await ev(env, inq.id, type, { visible: 1, actor: from, body: `${label[0]} من ${from}:\n${body}`, en: `${label[1]} from ${from}:\n${body}`, meta: { route_id: route.id, member_id: member.id, ...(meta || {}) } });
  const fresh = asInq(await getInq(env, inq.ref));
  return buyerUpdate(env, fresh, type, { from, body, route_id: route.id, revised });
}

/* the actions a factory can take on a request routed to it — one implementation for the dashboard API and the signed page.
   → {ok:true, buyer_notified} or {ok:false, status, code, error} */
export async function factoryAction(env, inq, route, member, action, b) {
  if (inq.status === "closed" || inq.status === "blocked") return { ok: false, status: 409, code: "closed", error: "this request is closed" };
  if (member.email && await isBlocked(env, { email: member.email })) return { ok: false, status: 403, code: "blocked", error: "blocked" };
  if (action === "decline") {
    if (route.status === "quoted" || route.status === "replied") return { ok: false, status: 409, code: "already_answered", error: "already answered" };
    if (route.status === "declined") return { ok: true, already: true };
    const reason = line(b.reason, 300), from = factoryName(member);
    await env.DB.prepare("UPDATE inquiry_routes SET status = 'declined', replied_at = ? WHERE id = ?").bind(now(), route.id).run();
    // the reason reaches the buyer (timeline, bell, email) — the factory is told so where it types it
    await ev(env, inq.id, "declined", { visible: 1, actor: from, body: `${from} اعتذر عن الطلب.${reason ? "\nالسبب: " + reason : ""}`, en: `${from} declined the request.${reason ? "\nReason: " + reason : ""}`, meta: { route_id: route.id, member_id: member.id } });
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE inquiry_id = ? AND status != 'declined' AND (email_sent = 1 OR wa_sent = 1 OR status IN ('replied','quoted'))").bind(inq.id).first("n");
    let r;
    if (!left) {
      await ev(env, inq.id, "status", { visible: 1, body: "كل المصانع اللي وصلها طلبك اعتذرت عنه. الطلب لسه مفتوح وهيتبعت تلقائياً لأي مصنع مطابق ينضم.", en: "All factories that received your request declined it. It stays open and goes automatically to matching factories that join." });
      r = await buyerUpdate(env, inq, "declined_all", { body: reason });
    } else r = await buyerUpdate(env, inq, "declined", { from, body: reason, route_id: route.id });
    return { ok: true, buyer_notified: !!(r && r.sent) };
  }
  if (action === "quote") {
    const q = { price: line(b.price, 60), currency: (line(b.currency, 3) || "EGP").toUpperCase(), moq: line(b.moq, 60), lead_time: line(b.lead_time, 60), validity: line(b.validity, 60), note: str(b.note, 2000) };
    if (!q.price && !q.note) return { ok: false, status: 400, code: "price_required", error: "price or note required" };
    if (!/^[A-Z]{3}$/.test(q.currency)) return { ok: false, status: 400, code: "invalid_currency", error: "currency must be a 3-letter code" };
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes WHERE route_id = ?").bind(route.id).first("n")) || 0;
    if (n >= LIM.quotesPerRoute) return { ok: false, status: 429, code: "quote_limit", error: `at most ${LIM.quotesPerRoute} quotes (the first + ${LIM.quotesPerRoute - 1} revisions) per request`, max: LIM.quotesPerRoute };
    await env.DB.prepare("INSERT INTO quotes (inquiry_id, route_id, member_id, price, currency, moq, lead_time, validity, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(inq.id, route.id, member.id, q.price, q.currency, q.moq, q.lead_time, q.validity, q.note, now()).run();
    const body = [q.price && `السعر / Price: ${q.price} ${q.currency}`, q.moq && `الحد الأدنى للطلب / MOQ: ${q.moq}`, q.lead_time && `مدة التوريد / Lead time: ${q.lead_time}`, q.validity && `صلاحية العرض / Valid: ${q.validity}`, q.note && `ملاحظات / Notes: ${q.note}`].filter(Boolean).join("\n");
    const r = await recordFactoryResponse(env, inq, route, member, { type: "quote", body, meta: { quote: q }, revised: n > 0 });
    return { ok: true, buyer_notified: !!(r && r.sent), revised: n > 0, quotes_left: LIM.quotesPerRoute - n - 1 };
  }
  if (action === "reply") {
    const body = str(b.message || b.body, 4000).trim();
    if (!body) return { ok: false, status: 400, code: "message_required", error: "message required" };
    if (!(await rateOk(env, "inqpage|" + route.id, LIM.pageRepliesPerRouteDay, 86400))) return { ok: false, status: 429, code: "rate_limited", error: "too many messages today" };
    const r = await recordFactoryResponse(env, inq, route, member, { type: "reply", body, meta: { via: "page" } });
    return { ok: true, buyer_notified: !!(r && r.sent) };
  }
  return { ok: false, status: 400, code: "invalid_action", error: "invalid action" };
}

/* buyer → one factory (relayed by the platform; addresses stay private) */
async function relayToFactory(env, inq, route, body, via) {
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(route.member_id).first();
  if (!m) return { sent: false };
  const respond = await respondUrl(env, "r", route.id), b2 = bt(env, inq, body), dash = await dashLoginUrl(env, m, inq.ref);
  const s = await mail(env, { id: `bmsg-${route.id}-${hex(4)}`, to: m.email, list: "incoming", replyTo: replyTo(env, inq.ref, route.id), subject: `رسالة من المشتري على الطلب ${inq.ref} / Buyer message`,
    ar: `المشتري (${firstName(inq.name)}${inq.company ? " — " + bt(env, inq, inq.company) : ""}) كتب على الطلب ${inq.ref}:\n\n${b2}\n\nرد من هنا (لوحة التحكم على الطلب ده، من غير كلمة سر — لمرة واحدة، صالح 7 أيام):\n${dash}\nأو رد سريع من غير تسجيل دخول: ${respond}${inboundOn(env) ? "\n(أو اضغط «رد» على الإيميل ده.)" : "\n(ماتردش على الإيميل ده — الرد بيتم من الرابط.)"}`,
    en: `The buyer wrote on request ${inq.ref}:\n\n${b2}\n\nAnswer here (your dashboard on this request, no password — single use, valid 7 days):\n${dash}\nOr answer without signing in: ${respond}${inboundOn(env) ? "\n(or just reply to this email)" : "\n(Please do not reply to this email — use the links.)"}` });
  await notify(env, m.id, { kind: "incoming_msg", title: `رسالة من المشتري على ${inq.ref}`, title_en: `Buyer message on ${inq.ref}`, body: line(b2, 300), body_en: line(b2, 300), url: "dashboard.html#incoming=" + inq.ref, ref: inq.ref });
  return { sent: !!s.sent, via };
}

/* ---------- signed answer page (no sign-in; works without Email Routing) ---------- */
const PAGE_CSS = "body{font-family:Tahoma,Arial,sans-serif;background:#f6f4ee;color:#1d2b22;margin:0;padding:24px 16px}main{max-width:640px;margin:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 10px 30px -15px rgba(0,0,0,.25)}h1{font-size:1.25rem;margin:0 0 6px}h2{font-size:1.05rem;margin:22px 0 8px}p,li{line-height:1.8}.muted{color:#666;font-size:.9rem}.box{background:#f3f7f4;border-radius:12px;padding:12px 14px;white-space:pre-wrap;line-height:1.8}label{display:block;margin:10px 0 4px;font-weight:700;font-size:.92rem}input,select,textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #cfd8d2;border-radius:10px;font:inherit}textarea{min-height:110px}button{margin-top:12px;background:#0b5d3b;color:#fff;border:0;border-radius:999px;padding:10px 22px;font:inherit;cursor:pointer}button.alt{background:#fff;color:#8a1c1c;border:1px solid #e3b4b4}.ok{background:#e9f7ef;border:1px solid #b9e2c8;border-radius:12px;padding:12px}.er{background:#fff1f1;border:1px solid #f0c2c2;border-radius:12px;padding:12px}.en{direction:ltr;text-align:left;color:#555}details{margin-top:14px}";
const page = (title, body, status = 200) => new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><main>${body}<p class="muted" style="margin-top:22px">منصة صنع في مصر · Made in Egypt Gate — كل الخطوات تلقائية / everything here is automatic.</p></main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
const nl = s => esc(s);
async function respondPage(req, env, url) {
  if (req.method !== "GET" && req.method !== "POST") return err(405, "method", "method not allowed");
  const bad = () => page("رابط غير صالح", "<h1>رابط غير صالح / Invalid link</h1><p>الرابط ده مش صحيح أو اتغيّر. / This link is not valid.</p>", 404);
  if (!env.DB || !secretOf(env)) return page("الخدمة غير متاحة", "<h1>الخدمة مش متاحة دلوقتي / Service unavailable</h1>", 503);
  const tk = await parseRespTok(env, url.searchParams.get("t"));
  if (tk && tk.expired) return page("رابط منتهي", `<h1>الرابط ده انتهت صلاحيته / This link has expired</h1><p>سجّل دخول بكود على الإيميل وافتح «طلبات واردة لي» من لوحة التحكم. / Sign in with an e-mail code and open your dashboard.</p><p><a href="${esc(site(env))}dashboard.html#tab=incoming">${esc(site(env))}dashboard.html</a></p>`, 410);
  if (!tk) return bad();
  const route = await env.DB.prepare("SELECT * FROM inquiry_routes WHERE id = ?").bind(tk.routeId).first();
  const row = route && await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(route.inquiry_id).first();
  const member = route && await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(route.member_id).first();
  if (!route || !row || !member) return bad();
  const inq = asInq(row), closed = inq.status === "closed" || inq.status === "blocked";
  let notice = "";
  if (req.method === "POST") {
    const ct = req.headers.get("Content-Type") || "";
    let b = {};
    try { if (/application\/x-www-form-urlencoded|multipart\/form-data/i.test(ct)) { const fd = await req.formData(); for (const [k, v] of fd.entries()) if (typeof v === "string") b[k] = v.slice(0, 6000); } else { const j = await readJson(req, 16384); if (!j.bad && !j.tooLarge) b = j; } } catch (e) { b = {}; }
    if (tk.kind === "r") {
      if (!planCan(member, "respond")) notice = `<div class="er">الرد على الطلبات متاح من الباقة الأساسية — باقتك الحالية مش بتسمح. / Answering requests needs the Basic plan or higher.</div>`;
      else {
        const r = await factoryAction(env, inq, route, member, String(b.action || ""), b);
        notice = r.ok ? `<div class="ok">✅ ${r.already ? "اتسجّل قبل كده." : b.action === "decline" ? "اتسجّل اعتذارك واتبعت للمشتري تلقائياً." : b.action === "quote" ? "اتبعت عرضك للمشتري تلقائياً." : "اتبعتت رسالتك للمشتري تلقائياً."}${r.ok && !r.already && r.buyer_notified === false ? " (الإيميل للمشتري لسه بيتعاد إرساله — بيظهر في صفحة التتبع بتاعته.)" : ""}<br><span class="en">${r.already ? "Already recorded." : "Sent to the buyer automatically."}</span></div>`
          : `<div class="er">⚠️ ${esc(r.code === "quote_limit" ? `الحد الأقصى ${LIM.quotesPerRoute} عروض للطلب الواحد (العرض الأول + تعديلين).` : r.code === "closed" ? "الطلب ده اتقفل." : r.code === "already_answered" ? "انت رديت على الطلب ده قبل كده." : r.code === "price_required" ? "اكتب السعر." : r.code === "message_required" ? "اكتب رسالتك." : r.code === "rate_limited" ? "رسايل كتير النهارده، جرّب بكرة." : "ماتبعتش: " + r.code)}<br><span class="en">Not sent: ${esc(r.code)}</span></div>`;
      }
    } else {
      const body = str(b.message, 4000).trim();
      if (closed) notice = `<div class="er">الطلب ده اتقفل. / This request is closed.</div>`;
      else if (!body) notice = `<div class="er">اكتب رسالتك. / Write your message.</div>`;
      else if (!(await rateOk(env, "inqbpage|" + route.id, LIM.pageRepliesPerRouteDay, 86400))) notice = `<div class="er">رسايل كتير النهارده، جرّب بكرة. / Too many messages today.</div>`;
      else {
        await ev(env, inq.id, "buyer_message", { visible: 1, actor: "buyer", body: `رسالتك للمصنع:\n${body}`, en: `Your message to the factory:\n${body}`, meta: { to_route: route.id, via: "page" } });
        const s = await relayToFactory(env, inq, route, body, "page");
        notice = `<div class="ok">✅ اتبعتت رسالتك للمصنع تلقائياً${s.sent ? "" : " (الإيميل بيتعاد إرساله، والرسالة وصلت للوحة المصنع)"}.<br><span class="en">Your message was sent to the factory automatically.</span></div>`;
      }
    }
  }
  const fresh = asInq(await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(inq.id).first());
  const rt = await env.DB.prepare("SELECT * FROM inquiry_routes WHERE id = ?").bind(route.id).first();
  const isClosed = fresh.status === "closed" || fresh.status === "blocked";
  if (tk.kind === "r") {
    const v = factoryView(env, fresh, { target: isTargetRoute(rt) });
    const q = await env.DB.prepare("SELECT price, currency, moq, lead_time, validity, created_at FROM quotes WHERE route_id = ? ORDER BY id DESC LIMIT 1").bind(rt.id).first();
    const nq = (await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes WHERE route_id = ?").bind(rt.id).first("n")) || 0;
    const st = rt.status === "quoted" ? "بعت عرضك / quote sent" : rt.status === "replied" ? "رديت / replied" : rt.status === "declined" ? "اعتذرت / declined" : "جديد / new";
    const cur = ["EGP", "USD", "EUR", "SAR", "AED"].map(c => `<option>${c}</option>`).join("");
    const forms = isClosed ? `<p class="er">الطلب ده اتقفل ومبقاش بيقبل ردود. / This request is closed.</p>`
      : `${rt.status !== "declined" && nq < LIM.quotesPerRoute ? `<h2>${nq ? "عرض سعر معدّل" : "ابعت عرض سعر"} <span class="en">/ ${nq ? "Revised quote" : "Send a quote"}</span></h2><form method="post"><input type="hidden" name="action" value="quote">
<label>السعر * / Price *<input name="price" required inputmode="decimal" dir="ltr" maxlength="60"></label><label>العملة / Currency<select name="currency">${cur}</select></label>
<label>أقل كمية للطلب / MOQ<input name="moq" maxlength="60"></label><label>مدة التوريد / Lead time<input name="lead_time" maxlength="60" placeholder="مثلاً: 14 يوم"></label>
<label>العرض ساري لحد / Valid until<input name="validity" maxlength="60" dir="ltr"></label><label>ملاحظة للمشتري / Note<textarea name="note" maxlength="2000"></textarea></label>
<p class="muted">ماتكتبش أرقام تليفونات شخصية — التواصل بيكمل عن طريق المنصة. / No personal phone numbers.</p><button type="submit">📤 ابعت العرض للمشتري / Send</button></form>` : ""}
${rt.status !== "declined" ? `<details><summary>رسالة للمشتري / Message the buyer</summary><form method="post"><input type="hidden" name="action" value="reply"><label>رسالتك / Your message<textarea name="message" required maxlength="4000"></textarea></label><button type="submit">إرسال / Send</button></form></details>` : ""}
${rt.status !== "quoted" && rt.status !== "replied" && rt.status !== "declined" ? `<details><summary>اعتذار عن الطلب / Decline</summary><form method="post"><input type="hidden" name="action" value="decline"><label>السبب (اختياري) — بيوصل للمشتري تلقائياً / Reason (optional) — sent to the buyer<input name="reason" maxlength="300"></label><button class="alt" type="submit">اعتذار / Decline</button></form></details>` : ""}`;
    return page(`${fresh.ref} — الرد على الطلب`, `<h1>${esc(KIND_AR[fresh.kind])} ${esc(fresh.ref)}</h1><p class="muted">${esc(factoryName(member))} · حالتك: ${esc(st)}</p>${notice}
<div class="box">${nl(`المشتري: ${v.buyer.first_name}${v.buyer.company ? " — " + v.buyer.company : ""}${v.buyer.email_confirmed ? "" : " (بريده لسه ماتأكدش)"}\n${summaryLines(env, fresh, { target: isTargetRoute(rt) })}${v.message ? "\n\n" + v.message : ""}`)}</div>
${q ? `<p class="ok">آخر عرض بعته: ${esc(q.price)} ${esc(q.currency)}${q.moq ? " · MOQ " + esc(q.moq) : ""}${q.lead_time ? " · " + esc(q.lead_time) : ""}</p>` : ""}${forms}
<p class="muted">أو من لوحة التحكم: <a href="${esc(dashUrl(env, fresh.ref))}">${esc(dashUrl(env, fresh.ref))}</a></p>`);
  }
  // buyer → this factory
  const last = await env.DB.prepare("SELECT body, created_at FROM inquiry_events WHERE inquiry_id = ? AND type IN ('reply', 'quote', 'declined') AND buyer_visible = 1 AND meta_json LIKE ? ORDER BY id DESC LIMIT 1").bind(fresh.id, `%"route_id":"${rt.id}"%`).first();
  return page(`${fresh.ref} — رسالة للمصنع`, `<h1>طلبك ${esc(fresh.ref)}</h1><p class="muted">مراسلة ${esc(factoryName(member))} من خلال المنصة — عنوانك ورقمك مش بيظهروا للمصنع. / Your contact details stay private.</p>${notice}
${last ? `<h2>آخر رد من المصنع / Latest from the factory</h2><div class="box">${nl(last.body)}</div><p class="muted">${esc(SAFETY.ar)}<br><span class="en">${esc(SAFETY.en)}</span></p>` : ""}
${isClosed ? `<p class="er">الطلب ده اتقفل. / This request is closed.</p>` : `<h2>رسالة للمصنع / Message the factory</h2><form method="post"><label>رسالتك / Your message<textarea name="message" required maxlength="4000"></textarea></label><button type="submit">إرسال / Send</button></form>`}
<p class="muted"><a href="${esc(await trackUrl(env, fresh.ref))}">تتبّع الطلب / Track the request</a></p>`);
}

/* ---------- tracking (A3) ---------- */
async function track(req, env, ref, url) {
  if (!REF_RX.test(ref)) return err(404, "not_found", "not found");
  const ih = await ipHash(req, env); // IPv6 grouped by /64
  if ((await rateCount(env, "trackfail|" + ih, 3600)) >= LIM.trackFailIpHour) return err(429, "rate_limited", "too many attempts");
  const row = await getInq(env, ref);
  const last4 = (url.searchParams.get("last4") || "").replace(/\D/g, ""), tk = url.searchParams.get("t") || "";
  let proof = "";
  if (row && tk && safeEq(tk, await trackToken(env, ref))) proof = "link";                // the signed link from the receipt e-mail
  if (!proof && row) { const u = await authUser(req, env); if (u && (u.id === row.user_id || (u.email_verified_at && sameMailbox(u.email, row.email)))) proof = "owner"; } // the same mailbox, never just the same "+tag"-less key
  if (!proof && last4.length === 4) {
    // SEC H1: every last-4 try is COUNTED BEFORE the compare (atomic increment) — 10 per request per day and 20 per network (IPv6 /64)
    // per hour; after 20 wrong tries in total the last-4 route is closed for that request for good (the signed link / a sign-in still work)
    const dead = row ? (await rateCount(env, "trackl4dead|" + ref, LONG_WINDOW)) >= LIM.trackL4Dead : false;
    const okRef = !dead && (await rateOk(env, "trackl4|" + ref, LIM.trackL4RefDay, 86400));
    const okNet = await rateOk(env, "trackl4net|" + ih, LIM.trackL4NetHour, 3600);
    if (row && okRef && okNet && String(row.phone_last4 || "").length === 4 && safeEq(last4, row.phone_last4)) proof = "last4";
    else if (row && !dead) await rateOk(env, "trackl4dead|" + ref, 1e9, LONG_WINDOW);
  }
  if (!proof) { await rateOk(env, "trackfail|" + ih, 1e9, 3600); return err(404, "not_found", "not found"); } // unknown ref and wrong proof look the same
  const en = (url.searchParams.get("lang") || "").startsWith("en");
  // last-4 alone shows the timeline without other parties' words (quotes, replies, messages, the factory the buyer chose): those need
  // the signed link from the receipt e-mail or a sign-in — every one of them also reached the buyer by e-mail
  const redact = proof === "last4";
  const { results } = await env.DB.prepare("SELECT type, actor, body, meta_json, created_at FROM inquiry_events WHERE inquiry_id = ? AND buyer_visible = 1 ORDER BY id ASC LIMIT 200").bind(row.id).all();
  return json({ ref: row.ref, kind: row.kind, status: row.status, status_label: statusLabel(row.status, en), target_name: redact ? "" : row.target_name, created_at: row.created_at, updated_at: row.updated_at, routed_count: row.routed_count, replies_count: row.replies_count,
    proof, redacted: redact,
    events: (results || []).map(e => ({ type: e.type, actor: e.actor === "team" || e.actor === "buyer" || e.actor === "system" ? e.actor : "factory",
      body: redact && REDACTED.has(e.type) ? (en ? REDACT_NOTE[1] : REDACT_NOTE[0]) : en ? jparse(e.meta_json, {}).en || e.body : e.body, created_at: e.created_at })) });
}
const LONG_WINDOW = 10 * 365 * 86400; // "for good" (an rl window the daily clean-up never reaches)
const REDACTED = new Set(["quote", "reply", "declined", "buyer_message", "team_reply"]);
const REDACT_NOTE = ["التفاصيل وصلتك على الإيميل — افتحها من رابط التتبع اللي في إيميلك أو سجّل دخول بنفس الإيميل.", "The details reached you by e-mail — open them with the tracking link in your e-mail, or sign in with the same address."];
export function inquiryListItem(r) { return { ref: r.ref, kind: r.kind, status: r.status, target_name: r.target_name, created_at: r.created_at, updated_at: r.updated_at, routed_count: r.routed_count, replies_count: r.replies_count }; }

/* ---------- inbound email (INBOUND_EMAIL=1): inq-<ref>-<key>@REPLY_DOMAIN ----------
   key = route id (8 hex) → that factory's reply · "b"+route id → the buyer answering that factory · reply_key (10 hex) → the buyer
   to all factories that replied (else all it was sent to). No key → rejected (only keyed addresses were ever handed out). */
export const isInquiryAddress = (rcpt, env) => new RegExp(`^inq-mig-\\d{2}-[a-z0-9]{6}(-[a-z0-9]{8,10})?@${replyDomain(env).replace(/\./g, "\\.")}$`).test(String(rcpt || "").toLowerCase().trim());
function stripQuoted(t) {
  const out = [];
  for (const l of String(t || "").split(/\r?\n/)) {
    if (/^\s*>/.test(l)) continue;
    if (/^\s*(On .+ wrote:|في .+ كتب:|-{2,}\s*Original Message|From: .+@|من: .+@)/i.test(l)) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export async function handleInquiryEmail(message, env) {
  const rcpt = String(message.to || "").toLowerCase().trim();
  const mm = rcpt.match(/^inq-(mig-\d{2}-[a-z0-9]{6})(?:-([a-z0-9]{8,10}))?@(.+)$/);
  if (!mm || mm[3] !== replyDomain(env)) { message.setReject("Unknown recipient"); return { stored: false, reason: "unknown recipient" }; }
  if (!mm[2]) { message.setReject("Unknown recipient"); return { stored: false, reason: "no key" }; } // a key-less address trusts only the forgeable From header
  if (!env.DB) { message.setReject("Mailbox unavailable"); return { stored: false, reason: "store not configured" }; }
  if (message.rawSize && message.rawSize > 10 * 1024 * 1024) { message.setReject("Message too large"); return { stored: false, reason: "too large" }; }
  const row = await getInq(env, mm[1].toUpperCase());
  if (!row) { message.setReject("Unknown recipient"); return { stored: false, reason: "unknown inquiry" }; }
  if (row.status === "closed" || row.status === "blocked") { message.setReject("This request is closed"); return { stored: false, reason: "closed" }; }
  const inq = asInq(row), key = mm[2];
  const envelope = line(message.from, 254).toLowerCase();
  if (envelope === fromAddr(env).toLowerCase()) return { stored: false, reason: "loop" };
  const { results: routes } = await env.DB.prepare("SELECT r.*, m.email AS m_email FROM inquiry_routes r JOIN members m ON m.id = r.member_id WHERE r.inquiry_id = ?").bind(inq.id).all();
  let route = null, buyer = false, toRoute = null;
  if (/^[a-f0-9]{8}$/.test(key)) route = (routes || []).find(r => r.id === key) || null;
  else if (/^b[a-f0-9]{8}$/.test(key)) { toRoute = (routes || []).find(r => r.id === key.slice(1)) || null; buyer = !!toRoute; }
  else if (key === inq.reply_key) buyer = true;
  if (!route && !buyer) { message.setReject("Unknown recipient"); return { stored: false, reason: "unknown key" }; } // strangers never consume the limits below
  let parsed = {};
  try { parsed = await PostalMime.parse(await new Response(message.raw).arrayBuffer()); } catch (e) { console.error("mime parse", e && e.message); }
  const from = line((parsed.from && parsed.from.address) || message.from, 254).toLowerCase();
  if (from === fromAddr(env).toLowerCase()) return { stored: false, reason: "loop" };
  const auth = senderAuth(parsed.headers, from, env);
  // buyer addresses accept the buyer's own mailbox only (a factory can derive "b"+its own route id, so that one never
  // accepts anyone else; the buyer's general address also takes a DMARC-verified colleague when INBOUND_AUTHSERV_ID is set)
  if (buyer && !sameMailbox(from, inq.email) && (toRoute || !auth.verified)) { message.setReject("Unknown recipient"); return { stored: false, reason: "not the buyer" }; }
  // SEC M4: the route id is not a secret (the buyer sees it) → a factory address takes that factory's own mailbox only, DMARC-verified
  // when INBOUND_AUTHSERV_ID is configured
  if (route && (!sameMailbox(from, route.m_email) || (env.INBOUND_AUTHSERV_ID && !auth.verified))) { message.setReject("Unknown recipient"); return { stored: false, reason: "not the factory" }; }
  if (await isBlocked(env, { email: from })) { message.setReject("Sender blocked"); return { stored: false, reason: "blocked" }; }
  if (route && route.m_email && await isBlocked(env, { email: route.m_email })) { message.setReject("Sender blocked"); return { stored: false, reason: "member blocked" }; }
  // limits count accepted senders only: per address key (one factory / the buyer) and per request
  if (!(await rateOk(env, "inqink|" + inq.id + "|" + key, LIM.inboundPerKeyDay, 86400)) || !(await rateOk(env, "inqin|" + inq.id, LIM.inboundPerInqDay, 86400))) { message.setReject("Too many messages to this address today"); return { stored: false, reason: "rate limited" }; }
  const auto = /auto-(replied|generated)/i.test((message.headers && message.headers.get("auto-submitted")) || "");
  let body = stripQuoted(str(parsed.text || String(parsed.html || "").replace(/<[^>]+>/g, " "), 50000)).slice(0, LIM.inboundBody);
  if (!body) body = "(بدون نص / no text)";
  if (auto) { await ev(env, inq.id, "auto_reply", { meta: { from } }); return { stored: true, auto: true }; } // out-of-office: kept internal only
  if (route) {
    const member = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(route.member_id).first();
    if (!member) { message.setReject("Unknown recipient"); return { stored: false, reason: "member removed" }; }
    const r = await recordFactoryResponse(env, inq, route, member, { type: "reply", body, meta: { from, envelope_from: envelope, sender_verified: auth.verified, sender_auth: auth.summary, via: "email" } });
    return { stored: true, kind: "factory_reply", route_id: route.id, buyer_notified: !!(r && r.sent) };
  }
  // buyer → factory/factories (relayed by the platform; addresses stay private)
  await ev(env, inq.id, "buyer_message", { visible: 1, actor: "buyer", body: `رسالتك للمصنع:\n${body}`, en: `Your message to the factory:\n${body}`, meta: { to_route: toRoute ? toRoute.id : "", via: "email" } });
  let targets = toRoute ? [toRoute] : (routes || []).filter(r => r.status === "replied" || r.status === "quoted");
  if (!toRoute && !targets.length) targets = (routes || []).filter(r => r.status === "sent");
  let sent = 0;
  for (const r of targets.slice(0, MAX_ROUTES)) if ((await relayToFactory(env, inq, r, body, "email")).sent) sent++;
  return { stored: true, kind: "buyer_message", forwarded: sent };
}

/* ---------- no registered match: the administrators act (owner decision 19) ---------- */
const STATUS_LABEL = { received: ["تم الاستلام", "Received"], routed: ["اتبعت للمصانع المطابقة", "Sent to matching factories"], in_progress: ["جاري معالجة طلبك", "We're working on your request"],
  no_match: ["لا يوجد مصنع مطابق بعد", "No matching factory yet"], replied: ["وصلك رد", "Answered"], recorded: ["اتسجّل", "Recorded"], closed: ["اتقفل", "Closed"], blocked: ["موقوف", "Blocked"] };
export const statusLabel = (st, en) => (STATUS_LABEL[st] || ["حالة أخرى", "Other status"])[en ? 1 : 0];
/* admin accounts (console bell): role admin, or a confirmed address listed in ADMIN_EMAILS */
async function adminMembers(env) {
  const list = String(env.ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(isEmail).slice(0, 20);
  const { results } = await env.DB.prepare(`SELECT * FROM members WHERE role = 'admin'${list.length ? ` OR lower(email) IN (${list.map(() => "?").join(", ")})` : ""} LIMIT 50`).bind(...list).all();
  return (results || []).filter(m => isAdmin(env, m));
}
/* the newest candidate list of a request (admin-only event "candidates") */
export async function latestCandidates(env, inqId) {
  const e = await env.DB.prepare("SELECT meta_json, created_at FROM inquiry_events WHERE inquiry_id = ? AND type = 'candidates' ORDER BY id DESC LIMIT 1").bind(inqId).first();
  if (!e) return null;
  const m = jparse(e.meta_json, {});
  return { candidates: Array.isArray(m.candidates) ? m.candidates : [], web: m.web || {}, at: m.at || e.created_at };
}
export async function refreshCandidates(env, inq) {
  const c = await findCandidates(env, inq, now());
  await ev(env, inq.id, "candidates", { meta: c });
  return c;
}
const candLine = x => `• ${x.name}${x.governorate ? " — " + x.governorate : ""}${x.sector ? " · " + x.sector : ""}\n  ${x.url}  (${x.source === "web" ? "بحث ويب / web: " + x.origin : x.origin === "public_source" ? "مصدر عام رسمي — غير مسجّل / official public source, not registered" : "دليل المنصة — غير مسجّل / platform directory, not registered"})`;
/* in_progress → candidates (directory + web when a key is set) · bell for every admin account · email TEAM_EMAIL + ADMIN_EMAILS
   · (buyer:true) the buyer's «جاري معالجة طلبك» email when the receipt already went out with another status */
export async function teamFlow(env, inqId, { buyer = false } = {}) {
  const row = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(inqId).first();
  if (!row || !needsTeam(row)) return { skipped: true };
  const inq = asInq(row), about = line(bt(env, inq, aboutText(inq)), 80) || KIND_AR[inq.kind], consoleUrl = site(env) + "inbox.html#" + inq.ref;
  let c = { candidates: [], web: {} };
  try { c = await refreshCandidates(env, inq); } catch (e) { console.error("candidates", e && e.message); }
  const admins = await adminMembers(env);
  for (const a of admins) await notify(env, a.id, { kind: "team_needed", title: `طلب محتاج رد الإدارة: ${about} (${inq.ref})`, title_en: `Request needs the team: ${about} (${inq.ref})`,
    body: `مفيش مصنع مسجّل مطابق — ${c.candidates.length} مرشّح للمراجعة`, body_en: `No registered match — ${c.candidates.length} candidate(s) to review`, url: "inbox.html#" + inq.ref, ref: inq.ref });
  const web = c.web && c.web.provider ? (c.web.error ? `بحث الويب (${c.web.provider}) ما اشتغلش: ${c.web.error}` : `بحث الويب: ${c.web.provider}`) : "بحث الويب مش مفعّل (مفيش مفتاح بحث) / Web search off (no search key configured)";
  const to = adminEmails(env);
  let emailed = 0;
  for (let i = 0; i < to.length; i++) {
    const r = await mail(env, { id: `teamneed-${inq.id}-${i}`, to: to[i], subject: `[مطلوب رد الإدارة] ${KIND_AR[inq.kind]} ${inq.ref}: ${about} — مفيش مصنع مسجّل مطابق`,
      ar: `طلب جديد ومفيش أي مصنع مسجّل على المنصة يطابقه، فالمشتري وصله تلقائياً «جاري معالجة طلبك».\nالمطلوب: راجع المرشّحين، اتواصل مع المناسب بنفسك، وبعدين رد على المشتري من لوحة الإدارة بزرار «إحنا اللي هنرد» (الرد بيوصله على الإيميل ويظهر في صفحة التتبع).\n\n${KIND_AR[inq.kind]} ${inq.ref}\nمن: ${bt(env, inq, inq.company) || "-"} (${firstName(inq.name)})${anon(inq) ? " — بدون تسجيل دخول" : ""}\n${summaryLines(env, inq)}\n\n${line(bt(env, inq, inq.message), 600)}\n\nالمرشّحون (للإدارة فقط — مش أعضاء، ومحدش منهم اتبعتله حاجة):\n${c.candidates.length ? c.candidates.map(candLine).join("\n") : "لا يوجد مرشّحون في دليل المنصة لهذا الوصف."}\n${web}\n\nلوحة الإدارة: ${consoleUrl}`,
      en: `A new request matches NO registered factory; the buyer was told automatically "We're working on your request". Review the candidates (admins only — none of them is a member and nobody was contacted), arrange it yourself, then answer the buyer from the admin console ("We'll answer" button): ${consoleUrl}` });
    if (r.sent) emailed++;
  }
  await ev(env, inq.id, "team_notified", { meta: { emailed, to: to.length, console: admins.length, candidates: c.candidates.length, web: c.web || {} } });
  if (buyer) await buyerUpdate(env, inq, "in_progress");
  return { emailed, console: admins.length, candidates: c.candidates.length };
}
/* cron / retries: a request that became in_progress after its receipt → the buyer hears «جاري معالجة طلبك» now */
async function noMatchLater(env, row, r) {
  if (!row.receipt_sent) {
    const x = await sendReceipt(env, asInq(await getInq(env, row.ref)), r);
    if (x && x.sent) await env.DB.prepare("UPDATE inquiries SET receipt_sent = 1 WHERE id = ?").bind(row.id).run();
    return teamFlow(env, row.id);
  }
  return teamFlow(env, row.id, { buyer: true });
}
/* «إحنا اللي هنرد» — the administrators answer the buyer from the console (POST /api/admin/inquiries/:id/reply):
   buyer-visible event with actor "team" (track page + bell) + email (Reply-To TEAM_EMAIL) and, for channel whatsapp|both, the
   approved buyer template (WA_TPL_BUYER_UPDATE) when the buyer opted in — none approved yet → the email carries it.
   → {ok, sent:{email, whatsapp}, status, fallback?, errors?} */
export async function teamReply(env, row, { body, body_en, channel, status, by = "" } = {}) {
  const inq = asInq(row), text = str(body, 4001).replace(/\r\n/g, "\n").trim(), textEn = str(body_en, 4000).replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, status: 400, code: "body_required", error: "body required" };
  if (text.length > 4000) return { ok: false, status: 413, code: "too_long", error: "body too long", max: 4000 };
  if (row.status === "blocked") return { ok: false, status: 409, code: "blocked", error: "this request is blocked" };
  const ch = ["email", "whatsapp", "both"].includes(channel) ? channel : "email";
  if (status != null && status !== "" && !["in_progress", "replied", "closed"].includes(status)) return { ok: false, status: 400, code: "invalid_status", error: "status must be in_progress, replied or closed" };
  const st = status || (row.status === "closed" ? "closed" : "replied"), t = now();
  await env.DB.prepare("UPDATE inquiries SET status = ?, replies_count = replies_count + 1, updated_at = ?, closed_at = CASE WHEN ? = 'closed' AND closed_at = '' THEN ? ELSE closed_at END WHERE id = ?").bind(st, t, st, t, row.id).run();
  await ev(env, row.id, "team_reply", { visible: 1, actor: "team", body: `رد إدارة منصة صنع في مصر:\n${text}`, en: `Reply from the Made in Egypt Gate team:\n${textEn || text}`, meta: { by: line(by, 120), channel: ch, status: st } });
  const sent = { email: false, whatsapp: false }, errors = {};
  if (ch !== "email") {
    if (!inq.consent_wa || !inq.phone) errors.whatsapp = "the buyer did not agree to WhatsApp";
    else if (!buyerWaOn(env)) errors.whatsapp = "no approved WhatsApp template for buyers yet";
    else try { const w = await sendWA(env, inq.phone, { template: line(env.WA_TPL_BUYER_UPDATE, 64), params: [inq.ref], firstName: firstName(inq.name) }); sent.whatsapp = !!w.sent; if (!w.sent) errors.whatsapp = w.error || "not sent"; } catch (e) { errors.whatsapp = line(e && e.message, 160); }
  }
  const fallback = ch === "whatsapp" && !sent.whatsapp; // everything that would go by WhatsApp goes by email until it works
  if (ch !== "whatsapp" || fallback) {
    const track = await trackUrl(env, inq.ref), tm = team(env);
    const r = await mail(env, { id: `teamreply-${row.id}-${hex(4)}`, to: inq.email, lang: inq.lang, replyTo: tm || undefined,
      subject: inq.lang === "en" ? `Answer on your request ${inq.ref} — Made in Egypt Gate` : `رد على طلبك ${inq.ref} — منصة صنع في مصر`,
      ar: `أهلاً ${firstName(inq.name)}،\nده رد إدارة منصة صنع في مصر على طلبك ${inq.ref}${row.target_name ? " (" + line(row.target_name, 120) + ")" : ""}:\n\n${text}\n\n${st === "closed" ? "الطلب اتقفل.\n" : st === "in_progress" ? "لسه بنتابع طلبك، وأي جديد هيوصلك هنا وفي صفحة التتبع.\n" : ""}تتبّع الطلب: ${track}${tm ? "\nللرد على الإدارة: رد على الإيميل ده مباشرةً." : ""}\n\n${SAFETY.ar}`,
      en: `Hello ${firstName(inq.name)},\nThis is the Made in Egypt Gate team's answer on your request ${inq.ref}:\n\n${textEn || text}\n\n${st === "closed" ? "The request is now closed.\n" : st === "in_progress" ? "We are still working on it; anything new reaches you here and on the tracking page.\n" : ""}Track it: ${track}${tm ? "\nTo answer the team, just reply to this email." : ""}\n\n${SAFETY.en}`,
      why: "رد على طلب أرسلته على المنصة / An answer to a request you sent on the platform." });
    sent.email = !!r.sent; if (!r.sent) errors.email = r.error || "not sent";
  }
  const uid = await buyerUserId(env, inq);
  if (uid) await notify(env, uid, { kind: "inquiry_team_reply", title: `رد الإدارة على طلبك ${inq.ref}`, title_en: `The team answered ${inq.ref}`, body: line(text, 300), body_en: line(text, 300), url: "track.html#" + inq.ref, ref: inq.ref });
  return { ok: true, sent, status: st, ...(fallback ? { fallback: "email" } : {}), ...(Object.keys(errors).length ? { errors } : {}) };
}

/* ---------- cron (every 15 min): retries, 48 h reminders, 30-day auto-close ---------- */
export async function inquiriesCron(env, nowMs = Date.now()) {
  const out = { retried: 0, reminded: 0, closed: 0 };
  if (!env.DB) return out;
  // 1) deliveries that failed (provider down / not configured yet) — up to 5 attempts
  const { results: fail } = await env.DB.prepare("SELECT DISTINCT r.inquiry_id FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id WHERE r.status IN ('pending', 'failed') AND r.attempts < ? AND i.status NOT IN ('closed', 'blocked') AND r.created_at > ? LIMIT 20").bind(LIM.retryMax, iso(nowMs - 3 * 86400000)).all();
  for (const f of fail || []) {
    const row = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(f.inquiry_id).first();
    if (!row) continue;
    const before = row.routed_count, r = await routeInquiry(env, asInq(row));
    if (r.routed > before) { out.retried++; const fresh = asInq(await getInq(env, row.ref)); if (before === 0 && !row.receipt_sent) await sendReceipt(env, fresh, r).then(x => x.sent && env.DB.prepare("UPDATE inquiries SET receipt_sent = 1 WHERE id = ?").bind(row.id).run()); else if (before === 0) await buyerUpdate(env, fresh, "rematched", { count: r.routed }); }
    else if (r.needs_team) { await noMatchLater(env, row, r); out.team = (out.team || 0) + 1; } // every delivery failed for good → the admins act
  }
  // inquiries whose first routing never ran (e.g. no candidates table yet) stay "received" → route them now
  const { results: rec } = await env.DB.prepare("SELECT * FROM inquiries WHERE status = 'received' AND created_at < ? AND created_at > ? AND (kind IN ('rfq', 'basket') OR (kind = 'contact' AND target_type IN ('factory', 'company'))) LIMIT 10").bind(iso(nowMs - 30 * 60000), iso(nowMs - 3 * 86400000)).all();
  for (const row of rec || []) { const r = await routeInquiry(env, asInq(row)); if (r.needs_team) { await noMatchLater(env, row, r); out.team = (out.team || 0) + 1; } }
  // 2) one reminder to factories that have not answered after 48 h
  const { results: due } = await env.DB.prepare("SELECT r.*, i.ref FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id WHERE r.status = 'sent' AND r.reminded_at = '' AND r.sent_at != '' AND r.sent_at < ? AND i.status NOT IN ('closed', 'blocked') LIMIT 30").bind(iso(nowMs - LIM.remindHours * 3600e3)).all();
  for (const r of due || []) {
    const claim = await env.DB.prepare("UPDATE inquiry_routes SET reminded_at = ? WHERE id = ? AND reminded_at = ''").bind(iso(nowMs), r.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(r.member_id).first();
    const inq = asInq(await getInq(env, r.ref));
    if (!m || !inq) continue;
    const respond = await respondUrl(env, "r", r.id), about = aboutOf(env, inq, isTargetRoute(r)), dash = await dashLoginUrl(env, m, inq.ref, nowMs);
    const s = await mail(env, { id: `remind-${r.id}`, to: m.email, list: "incoming", replyTo: replyTo(env, inq.ref, r.id), subject: `تذكير: طلب ${inq.ref} لسه مستني ردك / Reminder`,
      ar: `تذكير واحد بس: الطلب ${inq.ref} (${about}) لسه مستني ردك.\n${summaryLines(env, inq, { target: isTargetRoute(r) })}\n\nرد من هنا — لوحة التحكم على الطلب ده ومعاه فورم عرض السعر، من غير كلمة سر (لمرة واحدة، صالح 7 أيام):\n${dash}\nأو رد سريع / عرض سعر / اعتذار من غير تسجيل دخول: ${respond}${inboundOn(env) ? "\nأو اضغط «رد» على الإيميل ده." : "\n(ماتردش على الإيميل ده — الرد بيتم من الرابط.)"}`,
      en: `One reminder only: request ${inq.ref} is still waiting for your answer.\nAnswer here — your dashboard on this request with the quote form, no password (single use, valid 7 days): ${dash}\nOr answer, quote or decline without signing in: ${respond}` });
    await ev(env, inq.id, "reminder", { meta: { route_id: r.id, sent: !!s.sent } });
    if (s.sent) out.reminded++;
  }
  // 3) auto-close after 30 days with a final email
  const { results: old } = await env.DB.prepare("SELECT * FROM inquiries WHERE status NOT IN ('closed', 'blocked') AND created_at < ? LIMIT 50").bind(iso(nowMs - LIM.closeDays * 86400000)).all();
  for (const row of old || []) {
    const claim = await env.DB.prepare("UPDATE inquiries SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('closed', 'blocked')").bind(iso(nowMs), iso(nowMs), row.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    await ev(env, row.id, "closed", { visible: 1, body: "اتقفل الطلب تلقائياً بعد 30 يوم.", en: "The request was closed automatically after 30 days." });
    if (routable(row)) await buyerUpdate(env, asInq({ ...row, status: "closed" }), "closed");
    out.closed++;
  }
  return out;
}
