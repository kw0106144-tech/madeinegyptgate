/* «طلب حذف الحساب» — account deletion REQUESTS (app parity plan 2026-11-20, item account-delete-request: Apple 5.1.1(v) and Google
   Play need a way to ask for the deletion of the account from inside the app, and Play a web link: /delete-account/). Migration 0010
   (cc_delete_requests). A request DELETES NOTHING: the owner runs the existing audited deletion (Control Center «الأعضاء والاشتراكات»
   → the member → حذف: acc-members.js deleteMember, which erases Bassem's / Janna's memory of him too) or the memory erasure
   (acc-memory.js eraseMemory, for a visitor id), within 30 days (the privacy text's own deadline), then closes the request here.
   Member (switch account_delete, «🛠️ المطوّر» → «المزايا», default OFF; the texts wait for the owner's approval):
     GET  /api/me/delete-request   → {request: {id, status, created_at, decided_at} | null, days: 30}
     POST /api/me/delete-request   {lang?} → 201 {request, created: true} | 200 {request, existing: true} (one pending request per account)
     Full e-mail-code sign-in only (Bearer v2): an e-mailed link session or an old-password bridge session → 403 full_login_required.
     5 requests a day per account, one audited row member.delete_request, the team alerted by e-mail (team_needs_alert).
   Visitor (switch visitor_erase_request, default OFF — an exception to «Janna's memory is permanent», the owner's own decision):
     POST /api/janna/memory/erase-request  {visitor_id}  → 201 / 200 {request} — Janna's random visitor id only (no e-mail, no phone,
     nothing that links it to anyone). An id linked to a member account → 409 visitor_linked (that memory is the member's: he signs in and
     asks for his account's deletion). Same-site Origin only, 3 a day per network, one audited row visitor.erase_request.
   Without the table (0010 not applied yet) → 503 delete_off; switch off → 503 feature_off. Nothing here ever deletes anything.
   Control Center (acc.js /api/admin/cc/delete-requests*, permission members.delete = the owner): the queue, and closing a request
   (done / rejected + a note), audited delete_request.close. */
import { line, now, iso, hex, rateOk, ipHash, isBlocked, mail, adminEmails, site } from "./common.js";
import { authUser, isLinkSession } from "./auth.js";
import { featureOn, offMessage, deleteStoreOn } from "./flags.js";
import { appOf } from "./app-ua.js";
import { originOf, originOk } from "./janna-session.js";
import { ccJson, ccErr, ccPreflight, fail, body as readBody, all, first, batch, auditStmt, errOf } from "./acc-base.js";

export const DELETE_DAYS = 30;
const VID_RX = /^[0-9a-f]{32}$/;
const sourceOf = req => { const a = appOf(req); return a ? "app-" + a : "web"; };
const out = r => r ? { id: r.id, kind: r.kind, status: r.status, created_at: r.created_at, decided_at: r.decided_at || "" } : null;
const pendingFor = (env, col, v) => first(env, `SELECT * FROM cc_delete_requests WHERE kind = ? AND ${col} = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, col === "member_id" ? "member" : "visitor", v);
/* the team hears of a new request at once (the owner has 30 days; the queue is «طلبات حذف الحساب») — best effort, never blocks */
async function alertTeam(env, r) {
  try {
    const url = site(env) + "admin/#delreq";
    let i = 0;
    for (const to of adminEmails(env)) {
      await mail(env, { id: `teamneed-delreq-${r.id}-${i++}`, tpl: "team_needs_alert", to, lang: "ar",
        subject: r.kind === "member" ? `[مطلوب رد الإدارة] طلب حذف حساب ${r.id} / [Action needed] account deletion request` : `[مطلوب رد الإدارة] طلب مسح كلام زائر مع جنة ${r.id} / [Action needed] visitor erasure request`,
        ar: `وصل طلب ${r.kind === "member" ? "حذف حساب عضو" : "مسح كلام زائر مع جنة"} (${r.id}). الطلب نفسه مامسحش أي حاجة: افتح «طلبات حذف الحساب» في لوحة التحكم ونفّذ الحذف المسجّل خلال ${DELETE_DAYS} يوم، وبعدين علّم الطلب «تم».\n${url}`,
        en: `A ${r.kind === "member" ? "member account deletion" : "visitor erasure (Janna conversations)"} request arrived (${r.id}). The request itself deleted nothing: open «Account deletion requests» in the Control Center, run the audited deletion within ${DELETE_DAYS} days, then mark the request done.\n${url}` });
    }
  } catch (e) { console.warn("delete request alert", (e && e.message) || "error"); }
}

/* ---------- the member: /api/me/delete-request ---------- */
export async function handleMeDeleteRequest(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  try {
    if (req.method !== "GET" && req.method !== "POST") return ccErr(req, env, 405, "method", "method not allowed");
    if (!env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    if (!(await featureOn(env, "account_delete"))) return ccErr(req, env, 503, "feature_off", offMessage("account_delete"), { feature: "account_delete" });
    if (!(await deleteStoreOn(env))) return ccErr(req, env, 503, "delete_off", "طلبات حذف الحساب لسه مش متاحة / account deletion requests are not available yet");
    const m = await authUser(req, env);
    if (!m) return ccErr(req, env, 401, "unauthorized", "sign in required");
    // a full e-mail-code sign-in only: an e-mailed login link (or an old-password bridge session) never asks for the account's deletion
    if (isLinkSession(m)) return ccErr(req, env, 403, "full_login_required", "سجّل دخولك بكود على الإيميل الأول / sign in with an e-mail code first", { login: "code" });
    if (req.method === "GET") return ccJson(req, env, { request: out(await pendingFor(env, "member_id", m.id) || await first(env, "SELECT * FROM cc_delete_requests WHERE kind = 'member' AND member_id = ? ORDER BY created_at DESC LIMIT 1", m.id)), days: DELETE_DAYS });
    const b = await readBody(req, 2048), lang = b.lang === "en" ? "en" : "ar";
    const open = await pendingFor(env, "member_id", m.id);
    if (open) return ccJson(req, env, { request: out(open), existing: true, days: DELETE_DAYS });
    if (!(await rateOk(env, "delreq|" + m.id, 5, 86400))) return ccErr(req, env, 429, "rate_limited", "too many requests today — try again tomorrow");
    const id = "dr-" + hex(5), t = now(), ih = await ipHash(req, env);
    const ins = env.DB.prepare("INSERT INTO cc_delete_requests (id, kind, member_id, status, lang, source, created_at) VALUES (?, 'member', ?, 'pending', ?, ?, ?) ON CONFLICT DO NOTHING").bind(id, m.id, lang, sourceOf(req), t);
    const aud = auditStmt(env, { actor_id: m.id, actor_email: m.email || "", actor_role: "member", action: "member.delete_request", target_type: "member", target_id: m.id,
      after: { request: id, source: sourceOf(req) }, summary: `account deletion requested (${id}) — nothing deleted yet`, ip_hash: ih });
    await batch(env, [ins, aud]);
    const row = await first(env, "SELECT * FROM cc_delete_requests WHERE id = ?", id);
    if (!row) return ccJson(req, env, { request: out(await pendingFor(env, "member_id", m.id)), existing: true, days: DELETE_DAYS }); // a second tab won the race
    ctx.waitUntil(alertTeam(env, row));
    return ccJson(req, env, { request: out(row), created: true, days: DELETE_DAYS }, 201);
  } catch (e) {
    if (e && e.status) return errOf(req, env, e);
    console.error("delete request error", (e && e.message) || "error");
    return ccErr(req, env, 500, "server", "server error");
  }
}

/* ---------- a visitor: POST /api/janna/memory/erase-request {visitor_id} ---------- */
const VHDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
const vjson = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { ...VHDR, ...(cors ? { "Access-Control-Allow-Origin": cors } : {}) } });
const vfail = (status, code, cors, extra) => vjson({ error: code, code, ...(extra || {}) }, status, cors);
export async function handleVisitorEraseRequest(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  const o = originOf(req), allowed = originOk(env, o), cors = allowed && req.headers.get("Origin") ? o : "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Vary: "Origin", "Cache-Control": "no-store", ...(cors ? { "Access-Control-Allow-Origin": cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } : {}) } });
  if (req.method !== "POST") return vfail(405, "method", cors);
  if (!allowed) return vfail(403, "origin_not_allowed", "");
  try {
    if (!env.DB) return vfail(503, "store_off", cors);
    if (!(await featureOn(env, "visitor_erase_request"))) return vfail(503, "feature_off", cors, { feature: "visitor_erase_request", message: offMessage("visitor_erase_request") });
    if (!(await deleteStoreOn(env))) return vfail(503, "delete_off", cors);
    let b = {}; try { const tx = await req.text(); if (tx.length > 1024) return vfail(413, "too_large", cors); b = tx ? JSON.parse(tx) : {}; } catch (e) { return vfail(400, "bad_json", cors); }
    const vid = typeof b.visitor_id === "string" ? b.visitor_id.toLowerCase() : "", lang = b.lang === "en" ? "en" : "ar";
    if (!VID_RX.test(vid)) return vfail(400, "invalid", cors, { field: "visitor_id", why: "[0-9a-f]{32}" });
    const ih = await ipHash(req, env);
    if (await isBlocked(env, { ip_hash: ih })) return vfail(403, "blocked", cors);
    // an id linked to a member is HIS memory (CLAUDE.md 2.5): he signs in and asks for his account's deletion instead
    let linked = false;
    try { const r = await env.DB.prepare("SELECT member_id FROM janna_visitors WHERE visitor_id = ?").bind(vid).first(); linked = !!(r && r.member_id); } catch (e) { linked = false; }
    if (linked) return vfail(409, "visitor_linked", cors, { message: "الكلام ده مربوط بحساب عضو — ادخل بحسابك واطلب حذف الحساب / these conversations belong to a member account — sign in and request the account's deletion" });
    const open = await pendingFor(env, "visitor_id", vid);
    if (open) return vjson({ ok: true, request: out(open), existing: true, days: DELETE_DAYS }, 200, cors);
    if (!(await rateOk(env, "delvis|" + ih, 3, 86400))) return vfail(429, "rate_limited", cors);
    const id = "dr-" + hex(5), t = now();
    await batch(env, [
      env.DB.prepare("INSERT INTO cc_delete_requests (id, kind, visitor_id, status, lang, source, created_at) VALUES (?, 'visitor', ?, 'pending', ?, ?, ?) ON CONFLICT DO NOTHING").bind(id, vid, lang, sourceOf(req), t),
      auditStmt(env, { actor_id: "visitor", actor_role: "visitor", action: "visitor.erase_request", target_type: "visitor", target_id: vid, after: { request: id, source: sourceOf(req) },
        summary: `a visitor asked to erase their Janna conversations (${id}) — nothing erased yet`, ip_hash: ih }),
    ]);
    const row = await first(env, "SELECT * FROM cc_delete_requests WHERE id = ?", id);
    if (!row) return vjson({ ok: true, request: out(await pendingFor(env, "visitor_id", vid)), existing: true, days: DELETE_DAYS }, 200, cors);
    ctx.waitUntil(alertTeam(env, row));
    return vjson({ ok: true, request: out(row), created: true, days: DELETE_DAYS }, 201, cors);
  } catch (e) {
    console.error("visitor erase request error", (e && e.message) || "error");
    return vfail(500, "server", cors);
  }
}

/* ---------- Control Center (acc.js routes, permission members.delete = the owner) ---------- */
const STATUSES = ["pending", "done", "rejected"];
export async function listDeleteRequests(env, url) {
  if (!(await deleteStoreOn(env))) return { items: [], available: false, days: DELETE_DAYS };
  const st = line(url.searchParams.get("status"), 20), where = [], args = [];
  if (STATUSES.includes(st)) { where.push("r.status = ?"); args.push(st); }
  const rows = await all(env, `SELECT r.*, m.email AS m_email, m.company AS m_company, m.name AS m_name, m.plan AS m_plan FROM cc_delete_requests r LEFT JOIN members m ON m.id = r.member_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`, ...args);
  const nowMs = Date.now();
  return { available: true, days: DELETE_DAYS, items: rows.map(r => ({ id: r.id, kind: r.kind, status: r.status, source: r.source, lang: r.lang, created_at: r.created_at, decided_at: r.decided_at, decided_by: r.decided_by, note: r.note,
    due_at: iso(Date.parse(r.created_at) + DELETE_DAYS * 86400000), overdue: r.status === "pending" && Date.parse(r.created_at) + DELETE_DAYS * 86400000 < nowMs,
    ...(r.kind === "member" ? { member: { id: r.member_id, email: r.m_email || "", company: r.m_company || "", name: r.m_name || "", plan: r.m_plan || "", deleted: !r.m_email || /@invalid$/.test(String(r.m_email)) } } : { visitor_id: r.visitor_id }) })) };
}
/* POST /delete-requests/:id {status: "done" | "rejected", note?} — closes it (the deletion itself is the separate audited action) */
export async function closeDeleteRequest(req, env, ctx, adm, id) {
  const b = await readBody(req, 4096), status = line(b.status, 20), note = line(b.note, 500);
  if (status !== "done" && status !== "rejected") fail(422, "validation", "status: done | rejected", { errors: [{ field: "status", msg: "done | rejected", code: "invalid" }] });
  if (status === "rejected" && note.length < 5) fail(422, "validation", "اكتب سبب الرفض (بيتحفظ في السجل) / write why it is rejected (kept in the log)", { errors: [{ field: "note", msg: "≥ 5", code: "required" }] });
  if (!(await deleteStoreOn(env))) fail(503, "delete_off", "migration 0010 is not applied");
  const r = await first(env, "SELECT * FROM cc_delete_requests WHERE id = ?", id);
  if (!r) fail(404, "not_found", "request not found");
  if (r.status !== "pending") fail(409, "state", "this request is already closed", { status: r.status });
  const t = now(), by = line((adm.actor && (adm.actor.actor_email || adm.actor.actor_id)) || "owner", 254);
  await batch(env, [
    env.DB.prepare("UPDATE cc_delete_requests SET status = ?, decided_at = ?, decided_by = ?, note = ? WHERE id = ? AND status = 'pending'").bind(status, t, by, note, id),
    auditStmt(env, { ...adm.actor, action: "delete_request.close", target_type: r.kind, target_id: r.kind === "member" ? r.member_id : r.visitor_id, before: { status: "pending" },
      after: { request: id, status, ...(note ? { note } : {}) }, summary: `deletion request ${id} → ${status}`, ip_hash: adm.ipHash, req_id: adm.reqId }),
  ]);
  const row = await first(env, "SELECT * FROM cc_delete_requests WHERE id = ?", id);
  return { ok: true, request: { ...out(row), note: row.note, decided_by: row.decided_by } };
}
