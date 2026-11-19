/* Logged-in member API (Bearer token from /api/auth/verify). Plans are server truth; the browser only caches them.
   GET   /api/me                          → {user, unread}
   PATCH /api/me {name,title,company,phone,sector,governorate,products,inbox_paused} → {user}
         (sector/products change → automatic re-matching, at most once a day; no links / platform names; the company name is
          locked once the platform linked the account to its directory profile — factory_ref)
   GET   /api/me/inquiries                → {items}                     (requests I sent)
   GET   /api/me/follows                  → {items}
   POST  /api/me/follows {kind, ref_id, label, url}  → {ok, followed, items}  (page ids such as ET003 / IN4 / OT-… / OR-… resolve to the
                                                                          data index id — item_id — for deadline reminders; a sector /
                                                                          search / market … follow may send only its label: it is the ref_id)
   DELETE /api/me/follows {kind, ref_id} (body or query) → {ok}
   GET   /api/me/notifications[?lang=en]  → {items, unread}  (each item: title/body in the asked language + title_ar/title_en)
   POST  /api/me/notifications/read {ids?:[], all?:true} → {ok, unread}
   POST  /api/me/prefs {morning_time, session_time, days, call_today_at, pause, wa_optin, email_digest, incoming} → {prefs}
         days: [0-6] (0 = Sunday) or names ["sun".."sat"] / Arabic day names; the answer has days (numbers) + day_names
   GET   /api/me/stats                    → {since, metrics:{views, wa_clicks, web_clicks, inquiries}, enough}   (basic+)
   GET   /api/me/incoming                 → {items}                     (inquiries routed to me automatically; basic+)
         item: {ref, kind, my_status: new|replied|quoted|declined|closed, status, title, target_name, routed_at, created_at,
                payload{product, quantity, governorate, deadline, …}, buyer{first_name, company, type, email_confirmed},
                message, items, quote, quotes_count, quotes_left, respond_url, closed}
   POST  /api/me/incoming/:ref/quote {price, currency, moq, lead_time, validity, note} → {ok, buyer_notified, revised, quotes_left}
         (forwarded to the buyer automatically; the first quote + 2 revisions per request)
   POST  /api/me/incoming/:ref/decline {reason} → {ok, buyer_notified}   (the reason reaches the buyer automatically) */
import { planCan, plansWith } from "./common.js";
import { json, err, preflight, readJson, bodyErr, line, str, now, jparse, userOut, prefsOf, prefsOut, PREF_DEFAULT, effPlan, PLAN_LV, emailKey, cairoDay, dayIndex, hasLink, hasEmailAddr, impersonates, isGmail, resubscribe, mail, unsubUrl, iso } from "./common.js";
import { authUser, isLinkSession, linkSessionErr } from "./auth.js";
import { inquiryListItem, asInq, rematchForMember, REF_RX, factoryAction, factoryView, factoryName, respondUrl } from "./inquiries.js";
import { e164 } from "./whatsapp.js";
import { resolveItem } from "./digest.js";

export const FOLLOW_KINDS = ["factory", "company", "tender", "rfq", "project", "offer", "entity", "agency", "region", "city", "governorate", "sector", "store", "event", "news", "award", "opportunity", "lead", "radar", "search", "market", "product"];
const MAX_FOLLOWS = 500, EV_MIN = 20, PRODUCT_TERMS = 20, PRODUCTS_MAX = 400;

export async function handleMe(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/me/, "").replace(/\/+$/, "") || "/";
  try {
    if (!env.DB) return err(503, "store_off", "store not configured");
    const me = await authUser(req, env);
    if (!me) return err(401, "unauthorized", "sign in required");
    const M = req.method;
    // a session opened by an e-mailed login link may answer requests, but never change the profile or settings (SEC M2)
    if (isLinkSession(me) && ((path === "/" && M === "PATCH") || (path === "/prefs" && M !== "GET"))) return linkSessionErr();
    if (path === "/") return M === "GET" ? await getMe(env, me) : M === "PATCH" ? await patchMe(req, env, me, ctx) : err(405, "method", "method not allowed");
    if (path === "/inquiries") return M === "GET" ? await myInquiries(env, me) : err(405, "method", "method not allowed");
    if (path === "/follows") return M === "GET" ? json({ items: await follows(env, me) }) : M === "POST" ? await addFollow(req, env, me) : M === "DELETE" ? await delFollow(req, env, me, url) : err(405, "method", "method not allowed");
    if (path === "/notifications") return M === "GET" ? await notifications(env, me, url) : err(405, "method", "method not allowed");
    if (path === "/notifications/read") return M === "POST" ? await readNotifs(req, env, me) : err(405, "method", "method not allowed");
    if (path === "/prefs") return M === "POST" || M === "PATCH" ? await setPrefs(req, env, me) : M === "GET" ? json({ prefs: prefsOut(me) }) : err(405, "method", "method not allowed");
    if (path === "/stats") return M === "GET" ? await stats(env, me) : err(405, "method", "method not allowed");
    if (path === "/incoming") return M === "GET" ? await incoming(env, me) : err(405, "method", "method not allowed");
    let m;
    if ((m = path.match(/^\/incoming\/([A-Za-z0-9-]{6,20})\/(quote|decline|reply)$/))) return M === "POST" ? await respond(req, env, me, m[1].toUpperCase(), m[2]) : err(405, "method", "method not allowed");
    return err(404, "not_found", "not found");
  } catch (e) {
    console.error("me error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}
const unreadOf = async (env, me) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = ''").bind(me.id).first("n")) || 0;
async function getMe(env, me) {
  const user = userOut(env, me);
  /* ACC §12.1: the Control Center staff role for the team boards (seo-team.html, data-desk.html), same order as acc roleOf():
     legacy-password session → none · bootstrap owner (ADMIN_EMAILS + verified) → owner · active cc_staff row → its role · members.role admin → admin.
     "" = no staff role (the boards then show the lock box without calling a team API). Tables missing (before 0006) → the key stays absent. */
  try {
    const via = me._via === "legacy" ? "legacy" : me._sid_hash ? await env.DB.prepare("SELECT via FROM cc_session_meta WHERE sid_hash = ?").bind(me._sid_hash).first("via") : null;
    if (via === "legacy") user.staff_role = "";
    else {
      const boot = !!(me.email && me.email_verified_at && String(env.ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).includes(String(me.email).toLowerCase()));
      const s = boot ? null : await env.DB.prepare("SELECT role FROM cc_staff WHERE member_id = ? AND disabled_at = ''").bind(me.id).first("role");
      user.staff_role = boot ? "owner" : s || (me.role === "admin" ? "admin" : "");
    }
  } catch (e) { /* cc_* tables missing before migration 0006: no staff_role key, the boards ask their own API */ }
  return json({ user, unread: await unreadOf(env, me) });
}

/* incoming requests on/off (also reachable from the unsubscribe page): clears the "incoming" opt-out so mail flows again */
async function setIncoming(env, me, on) {
  await env.DB.prepare("UPDATE members SET inbox_paused = ?, updated_at = ? WHERE id = ?").bind(on ? 0 : 1, now(), me.id).run();
  if (on && me.email) await resubscribe(env, me.email, "incoming");
}
const bad = (s, why) => hasLink(s) || hasEmailAddr(s) || impersonates(s) || /:\/\/|www\./i.test(s) ? why : "";
async function patchMe(req, env, me, ctx) {
  const b = await readJson(req, 16384); const be = bodyErr(b); if (be) return be;
  const F = { name: 120, title: 40, company: 160, phone: 30, sector: 160, governorate: 60, products: PRODUCTS_MAX };
  const set = {};
  for (const k of Object.keys(F)) if (k in b) set[k] = k === "products" ? str(b[k], F[k] + 1).replace(/\s+/g, " ").trim() : line(b[k], F[k]);
  const paused = "inbox_paused" in b ? !!b.inbox_paused : "incoming" in b ? !b.incoming : null;
  if (!Object.keys(set).length && paused === null) return err(400, "nothing", "nothing to update", { fields: [...Object.keys(F), "inbox_paused"] });
  // buyers see these as the sender of quotes and replies: no links, e-mail addresses or names that pose as the platform
  for (const k of ["name", "title", "company", "sector"]) if (k in set && set[k] && set[k] !== (me[k] || "") && bad(set[k], k)) return err(400, "invalid_" + k, k + " must not contain links, e-mail addresses or the platform's name");
  if ("products" in set) {
    if (set.products.length > PRODUCTS_MAX) return err(400, "invalid_products", `products: at most ${PRODUCTS_MAX} characters`, { max: PRODUCTS_MAX });
    if (hasLink(set.products) || hasEmailAddr(set.products)) return err(400, "invalid_products", "products must not contain links or e-mail addresses");
    if (set.products.split(/[,،;؛\n]+/).map(x => x.trim()).filter(Boolean).length > PRODUCT_TERMS) return err(400, "invalid_products", `products: at most ${PRODUCT_TERMS} items, separated by commas`, { max: PRODUCT_TERMS });
  }
  // the platform linked this account to its directory profile → buyers see that verified name; it changes only through the platform
  if ("company" in set && me.factory_ref && set.company !== (me.company || "")) return err(409, "company_locked", "the company name is verified by the platform; ask for a correction (kind profile_fix)");
  if ("phone" in set && set.phone) { const p = e164(set.phone); if (!p) return err(400, "invalid_phone", "invalid phone"); set.phone = p; }
  const phoneChanged = "phone" in set && set.phone !== (me.phone || "");
  if (phoneChanged) set.wa_verified_at = ""; // a new number is not verified until it writes to the platform on WhatsApp
  const cols = Object.keys(set);
  if (cols.length) await env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => set[c]), now(), me.id).run();
  if (paused !== null) await setIncoming(env, me, !paused);
  const fresh = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(me.id).first();
  if (phoneChanged && set.phone && prefsOf(fresh).wa_optin) ctx.waitUntil(waNotice(env, fresh, "phone").catch(e => console.error("wa notice", e && e.message)));
  // a receiving member who changed what they make → open requests they now match are sent to them automatically (once a day)
  const changed = ("sector" in set && set.sector !== (me.sector || "")) || ("products" in set && set.products !== (me.products || ""));
  if (changed && planCan(fresh, "incoming") && (!me.rematch_at || me.rematch_at < iso(Date.now() - 86400000))) {
    await env.DB.prepare("UPDATE members SET rematch_at = ? WHERE id = ?").bind(now(), me.id).run();
    ctx.waitUntil(rematchForMember(env, me.id).catch(e => console.error("rematch", e && e.message)));
  }
  return json({ user: userOut(env, fresh) });
}

/* requests this account sent (or this same confirmed mailbox sent before signing in) */
async function myInquiries(env, me) {
  const e = String(me.email || "").toLowerCase(), ok = !!me.email_verified_at;
  const { results } = isGmail(e) && ok
    ? await env.DB.prepare("SELECT * FROM inquiries WHERE user_id = ? OR (email_key = ? AND (lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com')) ORDER BY created_at DESC LIMIT 200").bind(me.id, emailKey(e)).all()
    : await env.DB.prepare("SELECT * FROM inquiries WHERE user_id = ? OR (lower(email) = ? AND ? != '') ORDER BY created_at DESC LIMIT 200").bind(me.id, e, ok ? "1" : "").all();
  return json({ items: (results || []).map(inquiryListItem) });
}

/* ---------- follows (A5) ---------- */
async function follows(env, me) {
  const { results } = await env.DB.prepare("SELECT kind, ref_id, label, url, created_at, item_id FROM follows WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(me.id, MAX_FOLLOWS).all();
  return results || [];
}
const safeUrl = u => { u = line(u, 500); if (!u) return ""; if (/^[a-z0-9-]+\.html(#[^\s<>"']*)?$/i.test(u) || /^\/(?![\/\\])[^\s<>"']*$/.test(u)) return u; /* never "//host" or "/\\host" (SEC L2) */ try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)madeinegyptgate\.com$/.test(x.hostname) ? x.href : ""; } catch (e) { return ""; } };
/* follows that are a WORD, not an item: a sector, a saved search, a market … — Bassem's janna_follow often has only the label («تابعلي حديد
   الصلب في الصين»), so for these kinds the label itself is the ref_id (digest.js followMatches reads ref_id / label for them); the answer
   says exactly what was saved (`followed`), so the call can tell the member it worked (consolidation blocker D) */
export const LABEL_KINDS = ["sector", "search", "market", "product", "region", "governorate", "city", "entity", "agency", "store", "radar"];
async function addFollow(req, env, me) {
  const b = await readJson(req, 8192); const be = bodyErr(b); if (be) return be;
  const kind = line(b.kind, 30).toLowerCase(), label = line(b.label, 200);
  let ref = line(b.ref_id != null && b.ref_id !== "" ? b.ref_id : b.id, 160);
  if (!FOLLOW_KINDS.includes(kind)) return err(400, "invalid_kind", "invalid kind", { kinds: FOLLOW_KINDS });
  if (!ref && LABEL_KINDS.includes(kind)) ref = line(label, 160);
  if (!ref) return err(400, "ref_required", "ref_id required" + (LABEL_KINDS.includes(kind) ? " (or a label)" : ""), { label_kinds: LABEL_KINDS });
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM follows WHERE user_id = ?").bind(me.id).first("n");
  if (n >= MAX_FOLLOWS) return err(429, "limit", "follow limit reached", { max: MAX_FOLLOWS });
  const it = resolveItem(kind, ref); // the page's own id (kept as ref_id so its ☆ button still recognises it) → the data index id
  await env.DB.prepare("INSERT INTO follows (user_id, kind, ref_id, label, url, created_at, item_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, ref_id) DO UPDATE SET label = excluded.label, url = CASE WHEN excluded.url != '' THEN excluded.url ELSE follows.url END, item_id = CASE WHEN excluded.item_id != '' THEN excluded.item_id ELSE follows.item_id END")
    .bind(me.id, kind, ref, label, safeUrl(b.url), now(), it ? it.id : "").run();
  return json({ ok: true, followed: { kind, ref_id: ref, label }, items: await follows(env, me) });
}
async function delFollow(req, env, me, url) {
  let b = {}; if (req.headers.get("Content-Type")) { b = await readJson(req, 8192); const be = bodyErr(b); if (be) return be; }
  const kind = line(b.kind || url.searchParams.get("kind"), 30).toLowerCase(), ref = line(b.ref_id || url.searchParams.get("ref_id"), 160);
  if (!kind || !ref) return err(400, "ref_required", "kind and ref_id required");
  await env.DB.prepare("DELETE FROM follows WHERE user_id = ? AND kind = ? AND ref_id = ?").bind(me.id, kind, ref).run();
  return json({ ok: true });
}

/* ---------- notifications (A6) ---------- */
async function notifications(env, me, url) {
  const en = String(url.searchParams.get("lang") || "").startsWith("en");
  const { results } = await env.DB.prepare("SELECT id, kind, title, body, url, ref, created_at, read_at, title_en, body_en FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50").bind(me.id).all();
  return json({ items: (results || []).map(n => ({ id: n.id, kind: n.kind, title: en ? n.title_en || n.title : n.title, body: en ? n.body_en || n.body : n.body, url: n.url, ref: n.ref, created_at: n.created_at, read_at: n.read_at, read: !!n.read_at,
    title_ar: n.title, title_en: n.title_en || "", body_ar: n.body, body_en: n.body_en || "" })), unread: await unreadOf(env, me) });
}
async function readNotifs(req, env, me) {
  const b = await readJson(req, 16384); const be = bodyErr(b); if (be) return be;
  const t = now();
  if (b.all === true) await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = ''").bind(t, me.id).run();
  else {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(x => parseInt(x, 10)).filter(Number.isFinite).slice(0, 200);
    if (!ids.length) return err(400, "ids_required", "ids or all:true required");
    await env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = '' AND id IN (${ids.map(() => "?").join(",")})`).bind(t, me.id, ...ids).run();
  }
  return json({ ok: true, unread: await unreadOf(env, me) });
}

/* ---------- prefs (Bassem schedule, WhatsApp opt-in, digest, incoming requests) ---------- */
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/* consent change notice: WhatsApp was switched on (or its number changed) — sent to the member's confirmed e-mail with a
   one-click way to turn it off, so a change they did not make (a crafted link, a shared device) does not go unnoticed */
async function waNotice(env, m, why) {
  if (!m.email) return;
  const off = await unsubUrl(env, m.email, "whatsapp"), tail = String(m.phone || "").slice(-4);
  return mail(env, { id: `wa-on-${m.id}-${Date.now()}`, to: m.email, subject: "تم تفعيل رسائل الواتساب على حسابك / WhatsApp messages turned on",
    ar: `${why === "phone" ? "اتغيّر رقم الواتساب على حسابك في منصة صنع في مصر" : "اتفعّلت رسائل الواتساب من منصة صنع في مصر على حسابك"} — الرقم المنتهي بـ ${tail}.\nلو انت اللي عملت كده مش محتاج تعمل حاجة. لو مش انت، اضغط هنا وهتتوقف فوراً:\n${off}`,
    en: `${why === "phone" ? "The WhatsApp number on your Made in Egypt Gate account was changed" : "WhatsApp messages from Made in Egypt Gate were turned on for your account"} — number ending ${tail}.\nIf this was you, nothing to do. If not, stop them at once: ${off}`,
    why: "رسالة أمان عن إعدادات حسابك / Security notice about your account settings." });
}
async function setPrefs(req, env, me) {
  const b = await readJson(req, 8192); const be = bodyErr(b); if (be) return be;
  const p = prefsOf(me), was = !!p.wa_optin;
  if ("morning_time" in b) { if (!HM.test(String(b.morning_time))) return err(400, "invalid_time", "morning_time must be HH:MM"); p.morning_time = b.morning_time; }
  if ("session_time" in b) { if (b.session_time !== "" && !HM.test(String(b.session_time))) return err(400, "invalid_time", "session_time must be HH:MM or empty"); p.session_time = b.session_time; }
  if ("call_today_at" in b) {
    const v = String(b.call_today_at || "");
    if (v === "") p.call_today_at = "";
    else if (HM.test(v)) p.call_today_at = cairoDay() + "T" + v;
    else if (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)) p.call_today_at = v;
    else return err(400, "invalid_time", "call_today_at must be HH:MM (today, Cairo) or YYYY-MM-DDTHH:MM");
  }
  if ("days" in b) { // numbers 0-6 (0 = Sunday) or day names; unknown entries are ignored, the stored list is never silently emptied
    if (!Array.isArray(b.days)) return err(400, "invalid_days", "days must be an array of 0-6 (0 = Sunday) or day names (sun…sat)");
    const d = [...new Set(b.days.map(dayIndex).filter(x => x >= 0))].sort();
    if (b.days.length && !d.length) return err(400, "invalid_days", "days must be 0-6 (0 = Sunday) or day names (sun…sat)");
    p.days = d;
  }
  for (const k of ["pause", "email_digest"]) if (k in b) { if (typeof b[k] !== "boolean") return err(400, "invalid_" + k, k + " must be boolean"); p[k] = b[k]; }
  if ("wa_optin" in b) {
    if (typeof b.wa_optin !== "boolean") return err(400, "invalid_wa_optin", "wa_optin must be boolean");
    if (b.wa_optin && !e164(me.phone)) return err(400, "phone_required", "add a valid phone number first (PATCH /api/me)");
    p.wa_optin = b.wa_optin; if (b.wa_optin && !was) p.wa_optin_at = now();
  }
  if ("incoming" in b && typeof b.incoming !== "boolean") return err(400, "invalid_incoming", "incoming must be boolean");
  const clean = {}; for (const k of [...Object.keys(PREF_DEFAULT), "wa_optin_at", "gcc", "gcc_src", "gcc_at", "gcc_next"]) if (k in p) clean[k] = p[k]; // the GCC choice (and the one waiting for an invoice) is kept, never written here (/api/me/gcc, /api/me/invoices)
  await env.DB.prepare("UPDATE members SET prefs_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(clean), now(), me.id).run();
  // switching a list back on here must really bring its e-mails back (an earlier unsubscribe link left an opt-out row)
  if (b.email_digest === true && me.email) await resubscribe(env, me.email, "digest");
  if (typeof b.incoming === "boolean") await setIncoming(env, me, b.incoming);
  const fresh = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(me.id).first();
  if (b.wa_optin === true && !was) await waNotice(env, fresh, "optin").catch(e => console.error("wa notice", e && e.message));
  return json({ prefs: prefsOut(fresh) });
}

/* ---------- honest stats (A8): only real events, a start date, and a minimum before numbers mean anything ---------- */
async function stats(env, me) {
  if (!planCan(me, "stats")) return err(403, "plan", "available from the basic plan", { need: plansWith("stats")[0] || "basic" });
  const ref = String(me.factory_ref || "");
  let since = "", views = 0, wa = 0, web = 0;
  if (ref) {
    const { results } = await env.DB.prepare("SELECT metric, SUM(n) AS n, MIN(day) AS d FROM ev_daily WHERE kind IN ('factory', 'company') AND ref_id = ? GROUP BY metric").bind(ref).all();
    for (const r of results || []) { if (r.metric === "view") views = r.n; if (r.metric === "wa_click") wa = r.n; if (r.metric === "web_click") web = r.n; if (!since || r.d < since) since = r.d; }
  }
  const inq = (await env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS d FROM inquiry_routes WHERE member_id = ? AND (email_sent = 1 OR wa_sent = 1)").bind(me.id).first()) || {};
  const inquiries = inq.n || 0;
  if (inq.d && (!since || inq.d.slice(0, 10) < since)) since = inq.d.slice(0, 10);
  if (!since) since = String(me.activated_at || me.created_at || "").slice(0, 10);
  return json({ since, metrics: { views, wa_clicks: wa, web_clicks: web, inquiries }, enough: views + wa + web + inquiries >= EV_MIN, threshold: EV_MIN, profile_linked: !!ref });
}

/* ---------- «طلبات واردة لي» (inquiries routed to me automatically) ---------- */
const QUOTES_PER_ROUTE = 3;
async function incoming(env, me) {
  if (!planCan(me, "incoming")) return err(403, "plan", "receiving requests needs the basic plan or higher", { need: "basic" });
  const { results } = await env.DB.prepare(`SELECT r.id AS route_id, r.status AS route_status, r.reason AS route_reason, r.sent_at, r.replied_at, r.created_at AS routed_created, i.* FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id
     WHERE r.member_id = ? AND (r.email_sent = 1 OR r.wa_sent = 1 OR r.status IN ('replied', 'quoted', 'declined')) ORDER BY r.created_at DESC LIMIT 200`).bind(me.id).all();
  const items = [];
  for (const row of results || []) {
    const q = await env.DB.prepare("SELECT price, currency, moq, lead_time, validity, note, created_at FROM quotes WHERE route_id = ? ORDER BY id DESC LIMIT 1").bind(row.route_id).first();
    const nq = (await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes WHERE route_id = ?").bind(row.route_id).first("n")) || 0;
    const inq = asInq(row), target = /(^|,)target(,|$)/.test(row.route_reason || ""), closed = row.status === "closed" || row.status === "blocked";
    const v = factoryView(env, inq, { target }); // no buyer e-mail / phone, no competitor's name, links removed for anonymous buyers
    const my = row.route_status === "quoted" ? "quoted" : row.route_status === "declined" ? "declined" : row.route_status === "replied" ? "replied" : closed ? "closed" : "new";
    items.push({ ref: row.ref, kind: row.kind, my_status: my, status: row.route_status, inquiry_status: row.status, title: v.about, target_name: target ? row.target_name : v.about,
      routed_at: row.sent_at || row.routed_created, received_at: row.sent_at, created_at: row.created_at, replied_at: row.replied_at,
      buyer: v.buyer, message: v.message, items: v.items, payload: v.payload, product: v.payload.product || v.payload.title || "", quantity: v.payload.quantity || "",
      sector: row.sector, governorate: v.payload.governorate || "", market: row.market,
      quote: q || null, quotes_count: nq, quotes_left: closed ? 0 : Math.max(0, QUOTES_PER_ROUTE - nq), respond_url: closed ? "" : await respondUrl(env, "r", row.route_id), closed });
  }
  return json({ items });
}
async function respond(req, env, me, ref, action) {
  if (!planCan(me, "respond")) return err(403, "plan", "needs the basic plan or higher", { need: "basic" });
  if (!REF_RX.test(ref)) return err(404, "not_found", "not found");
  const b = await readJson(req, 16384); const be = bodyErr(b); if (be) return be;
  const row = await env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(ref).first();
  const route = row && await env.DB.prepare("SELECT * FROM inquiry_routes WHERE inquiry_id = ? AND member_id = ?").bind(row.id, me.id).first();
  if (!row || !route) return err(404, "not_found", "not found");
  const r = await factoryAction(env, asInq(row), route, me, action, b);
  if (!r.ok) return err(r.status || 400, r.code, r.error, r.max ? { max: r.max } : undefined);
  return json({ ok: true, buyer_notified: !!r.buyer_notified, ...(r.already ? { already: true } : {}), ...(action === "quote" ? { revised: !!r.revised, quotes_left: r.quotes_left } : {}), from: factoryName(me) });
}
