/* Control Center — orders / sales requests over `inquiries` (§3.1.6, §9), the old system's companies & messages (§3.1.5), the manual RFQ
   (§3.1.9) and member submissions → approvals (§3.1.7, §8.4). The inquiry engine is REUSED through its exports (teamReply, needsTeam,
   latestCandidates, refreshCandidates, handleInquiries…) — nothing here re-implements routing. */
import { line, str, now, iso, hex, isEmail, emailKey, team, adminEmails, site, notify, hmac, secretOf, effPlan, jparse } from "./common.js";
import { handleInquiries, teamReply, needsTeam, asInq, REF_RX, latestCandidates, refreshCandidates, statusLabel } from "./inquiries.js";
import { directoryCandidates } from "./candidates.js";
import { norm } from "./text.js";
import { fail, body, paging, likeOf, all, first, countOf, allIn, needTables, batch, changed, csvText, jget, dateOk, dayStartIso, dayAfterIso, dirRow, factoryNames,
  txt, txt1, hasContact, CONTACT_MSG, validator, sendTpl, dashUrl, isHttps, refExists } from "./acc-base.js";
import { NEEDS_TEAM_SQL, ORDER_CSV } from "./acc-stats.js";
import { planLimitX } from "./acc-plans.js";

const INTERNAL = Symbol.for("mig.cc.internal");
/* the SAME create path as POST /api/inquiries (receipt, automatic routing, no-match team flow); P-W5 marks it internal (no Turnstile/IP limits) */
export async function internalInquiry(env, ctx, payload, { actor, source }) {
  const req = new Request(site(env) + "api/inquiries", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "MIG-control-center/1" }, body: JSON.stringify({ ...payload, source }) });
  req[INTERNAL] = { actor, source };
  const res = await handleInquiries(req, env, ctx);
  let j = null; try { j = await res.json(); } catch (e) { j = null; }
  return { status: res.status, body: j || {} };
}
const findInq = (env, idOrRef) => { const v = String(idOrRef || ""); return REF_RX.test(v.toUpperCase()) ? env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(v.toUpperCase()).first() : /^[a-f0-9]{16}$/.test(v.toLowerCase()) ? env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(v.toLowerCase()).first() : null; };
/* admin.js adminInq(r) (same fields) + needs_team */
export const adminInq = r => ({ id: r.id, ref: r.ref, kind: r.kind, status: r.status, source: r.source, target_type: r.target_type, target_id: r.target_id, target_name: r.target_name, name: r.name, company: r.company, email: r.email, phone: r.phone, consent_wa: !!r.consent_wa,
  message: r.message, payload: jparse(r.payload_json, {}), items: jparse(r.items_json, []), sector: r.sector, governorate: r.governorate, market: r.market, routed_count: r.routed_count, replies_count: r.replies_count, ip_hash: r.ip_hash, user_id: r.user_id, lang: r.lang, created_at: r.created_at, updated_at: r.updated_at, closed_at: r.closed_at,
  needs_team: needsTeam(r) });

/* ---------- GET /orders ---------- */
function orderWhere(url) {
  const where = [], args = [];
  const kind = line(url.searchParams.get("kind"), 200), status = line(url.searchParams.get("status"), 30), source = line(url.searchParams.get("source"), 20), market = line(url.searchParams.get("market"), 20);
  const from = line(url.searchParams.get("from"), 10), to = line(url.searchParams.get("to"), 10), q = line(url.searchParams.get("q"), 100);
  if (kind) { const ks = kind.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12); where.push(`kind IN (${ks.map(() => "?").join(", ")})`); args.push(...ks); }
  if (status === "needs_team" || url.searchParams.get("needs_team") === "1") where.push(NEEDS_TEAM_SQL);
  else if (status) { where.push("status = ?"); args.push(status); }
  if (source) { where.push("source = ?"); args.push(source); }
  if (market) { where.push("market = ?"); args.push(market); }
  if (from && dateOk(from)) { where.push("created_at >= ?"); args.push(dayStartIso(from)); }
  if (to && dateOk(to)) { where.push("created_at < ?"); args.push(dayAfterIso(to)); }
  if (q) { const l = likeOf(q); where.push("(ref LIKE ? OR email LIKE ? OR company LIKE ? OR name LIKE ? OR target_name LIKE ? OR message LIKE ?)"); args.push(l, l, l, l, l, l); }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", args };
}
export async function listOrders(env, url) {
  const { page, limit, offset } = paging(url), w = orderWhere(url);
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries ${w.sql}`).bind(...w.args).first("n")) || 0;
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries ${w.sql} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).bind(...w.args, limit, offset).all();
  const rows = results || [], ids = rows.map(r => r.id);
  const evs = new Map((await allIn(env, ph => `SELECT inquiry_id, MAX(created_at) AS last, SUM(CASE WHEN type = 'team_reply' THEN 1 ELSE 0 END) AS tr FROM inquiry_events WHERE inquiry_id IN (${ph}) GROUP BY inquiry_id`, ids)).map(r => [r.inquiry_id, r]));
  const counts = Object.fromEntries((await all(env, "SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status")).map(c => [c.status, c.n]));
  counts.needs_team = (await countOf(env, `SELECT COUNT(*) AS n FROM inquiries WHERE ${NEEDS_TEAM_SQL}`)) || 0;
  const kinds = Object.fromEntries((await all(env, "SELECT kind, COUNT(*) AS n FROM inquiries GROUP BY kind")).map(c => [c.kind, c.n]));
  return { items: rows.map(r => { const e = evs.get(r.id); return { ...adminInq(r), status_label: statusLabel(r.status), status_label_en: statusLabel(r.status, true), last_event_at: (e && e.last) || r.updated_at, team_replied: !!(e && e.tr) }; }), total, page, limit, counts: { status: counts }, kinds };
}
export const orderCsvRow = r => ({ ref: r.ref, kind: r.kind, status: r.status, source: r.source, created_at: r.created_at, updated_at: r.updated_at, name: r.name, company: r.company, email: r.email, phone: r.phone,
  target_type: r.target_type, target_id: r.target_id, target_name: r.target_name, sector: r.sector, governorate: r.governorate, market: r.market, routed_count: r.routed_count, replies_count: r.replies_count,
  needs_team: needsTeam(r) ? 1 : 0, message: String(r.message || "").slice(0, 1000), payload: r.payload_json || "{}" });
export async function ordersCsv(env, url) {
  const w = orderWhere(url);
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries ${w.sql} ORDER BY created_at DESC LIMIT 20000`).bind(...w.args).all();
  return csvText(ORDER_CSV, (results || []).map(orderCsvRow));
}

/* ---------- GET /orders/:ref — the shape of GET /api/admin/inquiries/:id_or_ref (admin.js show) ---------- */
async function withLegacy(env, cands, adm) {
  if (!adm.can("legacy.contacts") || !cands.length) return cands;
  const refs = cands.map(c => { const m = /company\.html#([^#?]+)$/.exec(c.url || c.profile_url || ""); return m ? m[1] : ""; });
  const byRef = new Map((await allIn(env, ph => `SELECT factory_ref, suggested_ref, phones, email, manager, company FROM cc_legacy_companies WHERE factory_ref IN (${ph})`, refs)).map(r => [r.factory_ref, r]));
  const keys = cands.map(c => norm(c.name)), byKey = new Map((await allIn(env, ph => `SELECT company_key, phones, email, manager, company FROM cc_legacy_companies WHERE company_key IN (${ph})`, keys)).map(r => [r.company_key, r]));
  return cands.map((c, i) => { const l = byRef.get(refs[i]) || byKey.get(keys[i]); return l ? { ...c, legacy: { phones: l.phones || "", email: l.email || "", manager: l.manager || "" } } : c; });
}
export async function orderDetail(env, ref, adm) {
  const r = await findInq(env, ref);
  if (!r) fail(404, "not_found", "request not found");
  const { results: events } = await env.DB.prepare("SELECT id, type, actor, body, meta_json, buyer_visible, created_at FROM inquiry_events WHERE inquiry_id = ? ORDER BY id ASC").bind(r.id).all();
  const { results: routes } = await env.DB.prepare("SELECT r.*, m.company, m.email, m.plan FROM inquiry_routes r LEFT JOIN members m ON m.id = r.member_id WHERE r.inquiry_id = ? ORDER BY r.priority DESC, r.score DESC").bind(r.id).all();
  const { results: quotes } = await env.DB.prepare("SELECT * FROM quotes WHERE inquiry_id = ? ORDER BY id ASC").bind(r.id).all();
  const chan = (sent, st, rt) => (sent ? "sent" : st || (rt.status === "pending" ? "pending" : rt.attempts ? "failed" : ""));
  const out = (routes || []).map(rt => { const qs = (quotes || []).filter(q => q.route_id === rt.id); return { ...rt, email_status: chan(rt.email_sent, rt.email_status, rt), wa_status: rt.wa_sent ? "sent" : rt.wa_status || "skipped", quote: qs.length ? qs[qs.length - 1] : null, quotes_count: qs.length }; });
  const need = needsTeam(r), stored = await latestCandidates(env, r.id);
  const cand = stored || (need ? { candidates: directoryCandidates(env, asInq(r)), web: { provider: "", skipped: "not_run" }, at: "" } : { candidates: [], web: {}, at: "" });
  return { inquiry: adminInq(r), events: (events || []).filter(e => e.type !== "candidates").map(e => ({ ...e, meta: jparse(e.meta_json, {}), meta_json: undefined, buyer_visible: !!e.buyer_visible })),
    routes: out, quotes: quotes || [], needs_team: need, candidates: await withLegacy(env, cand.candidates, adm), candidates_at: cand.at, web_search: cand.web };
}
export async function orderCandidates(env, ref, adm, refresh) {
  const r = await findInq(env, ref); if (!r) fail(404, "not_found", "request not found");
  let c;
  if (refresh) {
    const aid = await adm.audit("order.candidates_refresh", "inquiry", r.ref, null, null, `candidates refresh ${r.ref}`);
    c = await refreshCandidates(env, asInq(r));
    await adm.auditDone(aid, { after: { candidates: c.candidates.length, web: (c.web && c.web.provider) || "" } });
  } else c = (await latestCandidates(env, r.id)) || (needsTeam(r) ? { candidates: directoryCandidates(env, asInq(r)), web: { provider: "", skipped: "not_run" }, at: "" } : { candidates: [], web: {}, at: "" });
  return { candidates: await withLegacy(env, c.candidates || [], adm), web_search: c.web || {}, at: c.at || "", note: "محدش من دول اتبعتله حاجة — التواصل يدوي من الفريق / none of them was contacted — the team arranges it by hand" };
}
/* «إحنا اللي هنرد» — the SAME teamReply() as POST /api/admin/inquiries/:id/reply; audit row written first */
export async function orderTeamReply(req, env, ctx, adm, ref, forced) {
  const b = forced ? {} : await body(req, 16384);
  const r = await findInq(env, ref); if (!r) fail(404, "not_found", "request not found");
  if (r.status === "blocked") fail(409, "blocked", "this request is blocked");
  let text, channel, status;
  if (forced) { const fb = await body(req, 8192); if (r.status === "closed") fail(409, "state", "the request is already closed"); text = str(fb.reason || "", 4001).trim() || "اتقفل الطلب بواسطة فريق المنصة."; channel = "email"; status = "closed"; }
  else { text = str(b.body != null ? b.body : b.message, 4001).trim(); channel = line(b.channel, 10) || "email"; status = b.status == null ? "" : line(b.status, 20); }
  if (!text) fail(400, "body_required", "body required");
  if (text.length > 4000) fail(413, "too_long", "body too long", { max: 4000 });
  if (status && !["in_progress", "replied", "closed"].includes(status)) fail(400, "invalid_status", "status must be in_progress, replied or closed");
  const action = forced ? "order.close" : "order.team_reply";
  const aid = await adm.audit(action, "inquiry", r.ref, { status: r.status }, { status: status || (r.status === "closed" ? "closed" : "replied"), channel }, `${action === "order.close" ? "closed" : "team reply"} ${r.ref}`);
  const out = await teamReply(env, r, { body: text, body_en: forced ? "" : b.body_en, channel, status, by: adm.actor.actor_email || adm.actor.actor_id });
  if (!out.ok) { await adm.auditDone(aid, { summary: `${action} ${r.ref} — refused: ${out.code}` }); fail(out.status || 400, out.code, out.error, out.max ? { max: out.max } : undefined); }
  await adm.auditDone(aid, { after: { status: out.status, sent: out.sent, ...(out.fallback ? { fallback: out.fallback } : {}) } });
  return { body: forced ? { ok: true, status: out.status, sent: out.sent, ...(out.errors ? { errors: out.errors } : {}) } : out };
}
export async function orderNote(req, env, ctx, adm, ref) {
  const b = await body(req, 8192), text = str(b.body != null ? b.body : b.note, 2001).trim();
  if (!text) fail(400, "body_required", "body required");
  if (text.length > 2000) fail(413, "too_long", "note too long", { max: 2000 });
  const r = await findInq(env, ref); if (!r) fail(404, "not_found", "request not found");
  await batch(env, [env.DB.prepare("INSERT INTO inquiry_events (inquiry_id, type, actor, body, meta_json, buyer_visible, created_at) VALUES (?, 'note', ?, ?, '{}', 0, ?)").bind(r.id, line(adm.actor.actor_email || adm.actor.actor_id, 120), text, now()),
    adm.auditStmt("order.note", "inquiry", r.ref, null, { note: text.slice(0, 200) }, `note on ${r.ref}`)]);
  return { body: { ok: true } };
}

/* ---------- legacy (old PHP system) — admin-only views ---------- */
export async function legacyCompanies(env, url) {
  const { page, limit, offset } = paging(url), where = [], args = [];
  const q = line(url.searchParams.get("q"), 100), status = line(url.searchParams.get("status"), 20), linked = url.searchParams.get("linked");
  if (q) { const l = likeOf(q); where.push("(company LIKE ? OR manager LIKE ? OR email LIKE ? OR phones LIKE ? OR web LIKE ?)"); args.push(l, l, l, l, l); }
  if (status) { where.push("status = ?"); args.push(status); }
  if (linked === "1") where.push("factory_ref != ''"); else if (linked === "0") where.push("factory_ref = ''");
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await countOf(env, `SELECT COUNT(*) AS n FROM cc_legacy_companies ${w}`, ...args)) || 0;
  const items = (await all(env, `SELECT * FROM cc_legacy_companies ${w} ORDER BY company LIMIT ? OFFSET ?`, ...args, limit, offset)).map(r => ({ ...r, raw: jget(r.raw_json, {}), raw_json: undefined }));
  const names = await factoryNames(env, items.flatMap(r => [r.factory_ref, r.suggested_ref]));
  return { items: items.map(r => ({ ...r, factory_name: names.get(r.factory_ref) || "", suggested_name: names.get(r.suggested_ref) || "" })), total, page, limit };
}
export async function patchLegacyCompany(req, env, ctx, adm, id) {
  const b = await body(req);
  await needTables(env, "cc_legacy_companies", "cc_audit");
  const r = await first(env, "SELECT * FROM cc_legacy_companies WHERE id = ?", parseInt(id, 10) || 0); if (!r) fail(404, "not_found", "not found");
  const ref = line(b.factory_ref, 60);
  if (ref && !(/^(\d{1,6}|x\d{1,6}|c-[2-9a-hjkmnp-z]{8})$/.test(ref)) ) fail(422, "invalid_factory_ref", "no such directory profile", { errors: [{ field: "factory_ref", msg: "no such directory profile" }] });
  if (ref && !dirRow(ref) && !/^c-/.test(ref)) fail(422, "invalid_factory_ref", "no such directory profile", { errors: [{ field: "factory_ref", msg: "no such directory profile" }] });
  await batch(env, [env.DB.prepare("UPDATE cc_legacy_companies SET factory_ref = ?, updated_at = ? WHERE id = ?").bind(ref, now(), r.id), adm.auditStmt("legacy.company_link", "legacy_company", r.id, { factory_ref: r.factory_ref }, { factory_ref: ref }, `${r.company} → ${ref || "—"}`)]);
  let member = null;
  if (r.email && isEmail(r.email)) { const m = await first(env, "SELECT id, email, factory_ref FROM members WHERE lower(email) = ?", r.email.toLowerCase()); if (m) member = m; }
  return { body: { ok: true, member } };
}
export async function legacyMessages(env, url) {
  const { page, limit, offset } = paging(url), where = [], args = [];
  const q = line(url.searchParams.get("q"), 100), status = line(url.searchParams.get("status"), 10);
  if (status) { where.push("status = ?"); args.push(status); }
  if (q) { const l = likeOf(q); where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR body LIKE ?)"); args.push(l, l, l, l, l); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  return { items: await all(env, `SELECT * FROM cc_legacy_messages ${w} ORDER BY legacy_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset), total: (await countOf(env, `SELECT COUNT(*) AS n FROM cc_legacy_messages ${w}`, ...args)) || 0, page, limit };
}
export async function patchLegacyMessage(req, env, ctx, adm, id) {
  const b = await body(req), st = line(b.status, 10);
  if (!["new", "read", "done"].includes(st)) fail(400, "invalid_status", "status must be new, read or done");
  await needTables(env, "cc_legacy_messages", "cc_audit");
  const r = await first(env, "SELECT * FROM cc_legacy_messages WHERE id = ?", parseInt(id, 10) || 0); if (!r) fail(404, "not_found", "not found");
  await batch(env, [env.DB.prepare("UPDATE cc_legacy_messages SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(st, now(), adm.actor.actor_email || adm.actor.actor_id, r.id), adm.auditStmt("legacy.message_status", "legacy_message", r.id, { status: r.status }, { status: st }, `legacy message ${r.legacy_id}: ${st}`)]);
  return { body: { ok: true } };
}
export async function deleteLegacyMessage(req, env, ctx, adm, id) {
  await needTables(env, "cc_legacy_messages", "cc_audit");
  const r = await first(env, "SELECT * FROM cc_legacy_messages WHERE id = ?", parseInt(id, 10) || 0); if (!r) fail(404, "not_found", "not found");
  await batch(env, [env.DB.prepare("DELETE FROM cc_legacy_messages WHERE id = ?").bind(r.id), adm.auditStmt("legacy.message_delete", "legacy_message", r.id, { legacy_id: r.legacy_id, subject: r.subject, status: r.status }, null, `legacy message ${r.legacy_id} deleted`)]);
  return { body: { ok: true } };
}

/* ---------- POST /rfqs — the live «طلبات عروض المشترين (RFQ)» manual entry (§3.1.9) ---------- */
export async function manualRfq(req, env, ctx, adm) {
  const b = await body(req), v = validator();
  const client = line(b.client, 120), product = line(b.product, 300), email = line(b.email, 254).toLowerCase(), phone = line(b.phone, 30), qty = line(b.qty, 40), unit = line(b.unit, 20);
  const gov = line(b.gov, 3).toUpperCase(), deadline = line(b.deadline, 10), status = line(b.status || "active", 10), details = str(b.details || "", 4000);
  if (client.length < 2) v.err("client", "اسم العميل / الجهة مطلوب / client name required");
  if (!product) v.err("product", "المنتج / الخدمة مطلوبة / product required");
  if (email && !isEmail(email)) v.err("email", "إيميل غير صحيح / invalid e-mail");
  if (phone && !/^\+?[\d\s()-]{6,30}$/.test(phone)) v.err("phone", "رقم غير صحيح / invalid phone");
  if (deadline && !dateOk(deadline)) v.err("deadline", "التاريخ YYYY-MM-DD / date YYYY-MM-DD");
  if (gov && !/^[A-Z]{3}$/.test(gov)) v.err("gov", "كود المحافظة / governorate code");
  if (!["active", "closed"].includes(status)) v.err("status", "active or closed");
  v.done();
  const to = email || team(env) || adminEmails(env)[0] || adm.actor.actor_email;
  if (!isEmail(to)) fail(503, "email_off", "no e-mail for the request: set TEAM_EMAIL");
  const aid = await adm.audit("order.rfq_manual", "inquiry", "", null, { client: client ? "(set)" : "", product, publish: !!b.publish, status }, `manual RFQ: ${product}`);
  const r = await internalInquiry(env, ctx, { kind: "rfq", name: client, email: to, phone, company: "", message: details || product,
    payload: { product, quantity: [qty, unit].filter(Boolean).join(" "), sector: line(b.sector, 120), governorate: gov, city: line(b.city, 120), deadline, channel: line(b.channel, 40), via_team: !email }, lang: "ar" }, { actor: adm.actor.actor_id, source: "admin" });
  if (r.status !== 201 && r.status !== 200) { await adm.auditDone(aid, { summary: `manual RFQ refused: ${r.body.code || r.status}` }); fail(r.status, r.body.code || "invalid", r.body.error || "the request was refused", r.body); }
  let content = null;
  if (b.publish && status === "active") {
    if (!adm.CC || !adm.CC.content || typeof adm.CC.content.upsert !== "function") content = { error: "content module not available" };
    else try {
      const c = await adm.CC.content.upsert(env, { coll: "rfq", kind: "add", fields: { title: product, details: txt(details, 2000), qty: [qty, unit].filter(Boolean).join(" "), delivery: line(b.city, 120), deadline, gov, sector: line(b.sector, 120), date: new Date().toISOString().slice(0, 10) },
        private: { client, phone, email, channel: line(b.channel, 40), inquiry_ref: r.body.ref }, publish: true, by: adm.actor.actor_email || adm.actor.actor_id, source: "admin" });
      content = { id: c && c.item ? c.item.id : "", published_v: c ? c.published_v || (c.item && c.item.published_v) || null : null };
    } catch (e) { content = { error: (e && e.code) || "content_error", errors: e && e.errors }; }
  }
  await adm.auditDone(aid, { target_id: r.body.ref, after: { ref: r.body.ref, status: r.body.status, routed: r.body.routed, content } });
  return { status: 201, body: { inquiry: { ref: r.body.ref, status: r.body.status, routed: r.body.routed }, content } };
}

/* ---------- approvals (member submissions, §8.4) ---------- */
/* image URLs for previews: public → /media/u/…; pending/rejected → the same path + ?e=<unix exp>&s=<HMAC(secret, "media|"+id+"|"+e) first 32> (1 h),
   exactly content.js previewUrl() — serveMedia verifies it; no AUTH_SECRET/ADVISOR_SECRET → no preview link */
export async function mediaUrls(env, ids, { sign = true } = {}) {
  const rows = await allIn(env, ph => `SELECT id, r2_key, width, height, status FROM cc_media WHERE id IN (${ph})`, ids || []);
  const by = new Map(rows.map(r => [r.id, r])), out = [], e = Math.floor(Date.now() / 1000) + 3600, secret = secretOf(env);
  for (const id of ids || []) { const r = by.get(id); if (!r || r.status === "deleted") continue;
    const path = "/media/" + r.r2_key;
    let url = path;
    if (r.status !== "public" && sign) url = secret ? `${path}?e=${e}&s=${(await hmac(secret, "media|" + r.id + "|" + e)).slice(0, 32)}` : "";
    out.push({ id: r.id, url, path, w: r.width, h: r.height, status: r.status }); }
  return out;
}
const memberMini = m => (m ? { id: m.id, email: m.email, company: m.company || "", plan: effPlan(m) } : null);
async function listingOf(env, ref) {
  if (!ref) return null;
  const f = dirRow(ref);
  if (f) return { name: f[0], type: f[1], sector: f[2], location: f[3], products: String(f[4] || "").split(/[،,]\s*/).filter(Boolean), source: /^x/.test(ref) ? "facx" : "fac" };
  if (/^c-/.test(ref)) { const r = await first(env, "SELECT live_json, draft_json FROM cc_content WHERE id = ?", ref); if (r) return { ...(jget(r.live_json || "", null) || jget(r.draft_json, {})), source: "fac_add" }; }
  return null;
}
export async function listApprovals(env, url, adm) {
  const type = line(url.searchParams.get("type"), 10), state = line(url.searchParams.get("state") || "pending", 12), { page, limit, offset } = paging(url);
  if (type && !["product", "company", "desk"].includes(type)) fail(400, "invalid_type", "type must be product, company or desk");
  const content = adm.CC && adm.CC.content, wantD = (!type || type === "desk") && adm.can("content.publish") && !!content && typeof content.deskQueue === "function";
  if (type === "desk" && !adm.can("content.publish")) fail(403, "forbidden", "needs content.publish", { need: "content.publish" });
  const wantP = (!type || type === "product") && adm.can("approvals.products"), wantC = (!type || type === "company") && adm.can("approvals.company");
  if (type === "product" && !adm.can("approvals.products")) fail(403, "forbidden", "needs approvals.products", { need: "approvals.products" });
  if (type === "company" && !adm.can("approvals.company")) fail(403, "forbidden", "needs approvals.company", { need: "approvals.company" });
  const items = [];
  if (wantP) for (const r of await all(env, "SELECT * FROM cc_member_products WHERE state = ? ORDER BY submitted_at, created_at LIMIT 1000", state)) {
    const f = jget(r.draft_json, {}), live = jget(r.live_json || "", null);
    items.push({ type: "product", id: r.id, member_id: r.member_id, factory_ref: r.factory_ref, kind: live ? "edit" : "new", submitted_at: r.submitted_at || r.updated_at, state: r.state, summary: line(f.name || "", 120), fields: f, current: live, images: f.images || [] });
  }
  if (wantC) for (const r of await all(env, "SELECT * FROM cc_company_requests WHERE state = ? ORDER BY created_at LIMIT 1000", state)) {
    const f = jget(r.fields_json, {});
    items.push({ type: "company", id: r.id, member_id: r.member_id, factory_ref: r.factory_ref, kind: r.kind, submitted_at: r.created_at, state: r.state, summary: line(f.name || r.factory_ref || "", 120), fields: f, current: null });
  }
  if (wantD) { const q = await content.deskQueue(env, { state, limit: 500 }); for (const d of (q && q.items) || []) items.push({ ...d, type: "desk" }); } // front-desk drafts (§12.3)
  items.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  const page_ = items.slice(offset, offset + limit);
  const members = new Map((await allIn(env, ph => `SELECT * FROM members WHERE id IN (${ph})`, page_.map(i => i.member_id))).map(m => [m.id, m]));
  const names = await factoryNames(env, page_.map(i => i.factory_ref));
  for (const it of page_) {
    it.member = memberMini(members.get(it.member_id)); it.factory_name = names.get(it.factory_ref) || "";
    if (it.type === "desk") { it.member = null; it.factory_name = ""; }
    else if (it.type === "product") it.images = await mediaUrls(env, it.images);
    else {
      it.current = await listingOf(env, it.factory_ref);
      if (it.fields && it.fields.logo) it.logo = (await mediaUrls(env, [it.fields.logo]))[0] || null;
      if (it.kind === "claim") { const m = members.get(it.member_id); const dom = m && m.email ? m.email.split("@")[1] : "";
        const leg = m && m.email ? await first(env, "SELECT company, factory_ref, suggested_ref FROM cc_legacy_companies WHERE email_key = ? LIMIT 1", emailKey(m.email)) : null;
        it.evidence = { email_domain: dom || "", legacy_match: leg || null, plan: m ? effPlan(m) : "visitor" }; }
    }
    delete it.member_id;
  }
  return { items: page_, total: items.length, page, limit };
}
const needContent = adm => { if (!adm.CC || !adm.CC.content || typeof adm.CC.content.upsert !== "function") fail(503, "content_off", "the content module is not available"); return adm.CC.content; };
const contentErr = e => { if (e && e.status) fail(e.status, e.code || "invalid", e.message || e.error || e.code, e.errors ? { errors: e.errors } : undefined); throw e; };
/* the producer link of a member's products: MIGOLDFAC[ref][7] — known to the panel (it loads the data files), derived here for added "c-…" companies */
async function companyUrlFor(env, ref, given) {
  const g = line(given, 500);
  if (g) { if (!isHttps(g)) fail(422, "invalid_url", "company_url must be an https URL", { errors: [{ field: "company_url", msg: "https URL" }] }); return g; }
  if (/^c-/.test(ref || "")) { const r = await first(env, "SELECT live_json, draft_json FROM cc_content WHERE id = ?", ref); const f = r ? jget(r.live_json || "", null) || jget(r.draft_json, {}) : {}; if (f && f.url) return f.url; }
  fail(422, "company_url_required", "send company_url (the linked company's MIGOLDFAC[ref][7] URL) with the approval", { errors: [{ field: "company_url", msg: "required" }], factory_ref: ref || "" });
}
export async function approveProduct(env, adm, id, b, { audit: doAudit = true } = {}) {
  await needTables(env, "cc_member_products", "cc_audit");
  const row = await first(env, "SELECT * FROM cc_member_products WHERE id = ?", id); if (!row) fail(404, "not_found", "product not found");
  if (row.state !== "pending") fail(409, "state", "only a product waiting for review can be approved", { state: row.state });
  const content = needContent(adm), m = await first(env, "SELECT * FROM members WHERE id = ?", row.member_id);
  /* the plan can have changed since the product was submitted (expired, suspended, downgraded): a NEW product goes live only while the
     member's plan still has room for it (review PAY-M5); an edit of a product that is already live adds nothing to the marketplace */
  if (!row.live_json) {
    if (!m) fail(409, "member_missing", "the member account of this product no longer exists");
    const limit = planLimitX(m, "products");
    if (limit === 0) fail(409, "plan", "باقة العضو دلوقتي مافيهاش منتجات في السوق — ماينفعش نوافق على المنتج / the member's current plan has no marketplace products", { need: "plan" });
    if (limit !== -1) {
      const live = (await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_products WHERE member_id = ? AND id != ? AND live_json != '' AND state NOT IN ('deleted', 'rejected')", row.member_id, row.id)) || 0;
      if (live >= limit) fail(409, "limit", "العضو وصل لحد المنتجات في باقته دلوقتي / the member has reached the product limit of the current plan", { limit, live });
    }
  }
  const corr = b && b.fields && typeof b.fields === "object" ? b.fields : {}, draft = jget(row.draft_json, {}), f = { ...draft };
  for (const k of ["name", "name_en", "category", "description", "description_en", "price"]) if (k in corr) f[k] = k.startsWith("description") ? txt(corr[k], 600) : txt1(corr[k], k === "price" ? 40 : 120);
  if (["name", "name_en", "description", "description_en", "price"].some(k => hasContact(f[k], env))) fail(422, "invalid_contact", CONTACT_MSG, { errors: [{ field: "fields", msg: CONTACT_MSG }] });
  const company_url = await companyUrlFor(env, row.factory_ref, (b && b.company_url) || corr.company_url);
  const imgs = Array.isArray(f.images) ? f.images.slice(0, 10) : [], urls = await mediaUrls(env, imgs, { sign: false });
  const aid = doAudit ? await adm.audit("approval.product.approve", "member_product", row.id, { state: row.state }, { state: "approved", name: f.name }, `approved product ${line(f.name, 80)}`) : 0;
  if (imgs.length && typeof content.mediaPublic === "function") await content.mediaPublic(env, imgs);
  let res; try { res = await content.upsert(env, { coll: "prod", kind: "add", id: row.id, fields: { name: f.name, name_en: f.name_en || "", category: f.category, description: f.description || "", image: urls[0] ? urls[0].path : "", price: f.price || "", company_url }, source: "member", member_id: row.member_id, publish: true, by: adm.actor.actor_email || adm.actor.actor_id }); }
  catch (e) { await adm.auditDone(aid, { summary: `approve ${row.id} failed: ${(e && e.code) || "error"}` }); contentErr(e); }
  const t = now();
  await env.DB.prepare("UPDATE cc_member_products SET state = 'approved', draft_json = ?, live_json = ?, reject_reason = '', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(f), JSON.stringify({ ...f, approved_at: t }), adm.actor.actor_email || adm.actor.actor_id, t, t, row.id).run();
  const published_v = res ? res.published_v || (res.item && res.item.published_v) || null : null;
  await adm.auditDone(aid, { after: { state: "approved", content_id: res && res.item ? res.item.id : row.id, published_v } });
  if (m) { await notify(env, m.id, { kind: "product_approved", title: `اتوافق على منتجك: ${line(f.name, 80)}`, title_en: `Product approved: ${line(f.name, 80)}`, body: "بقى ظاهر في سوق المنصة", body_en: "It is now shown in the marketplace", url: "dashboard.html#products" });
    await sendTpl(env, adm.CC, "product_approved", m.email, { product: line(f.name, 120), reason: "", url: dashUrl(env, "products") }, { idTail: row.id + "-" + hex(3) }); }
  return { ok: true, content_id: res && res.item ? res.item.id : row.id, published_v };
}
export async function rejectProduct(env, adm, id, b) {
  await needTables(env, "cc_member_products", "cc_audit");
  const reason = txt1(b.reason, 501);
  if (reason.length < 3 || reason.length > 500) fail(422, "invalid", "اكتب سبب الرفض (3–500 حرف) / a reason of 3–500 characters is required", { errors: [{ field: "reason", msg: "3–500" }] });
  const row = await first(env, "SELECT * FROM cc_member_products WHERE id = ?", id); if (!row) fail(404, "not_found", "product not found");
  if (row.state !== "pending") fail(409, "state", "only a product waiting for review can be rejected", { state: row.state });
  const live = row.live_json ? "approved" : "rejected", t = now(), f = jget(row.draft_json, {}); // a rejected EDIT keeps the approved version online
  await batch(env, [env.DB.prepare("UPDATE cc_member_products SET state = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(live, reason, adm.actor.actor_email || adm.actor.actor_id, t, t, row.id),
    adm.auditStmt("approval.product.reject", "member_product", row.id, { state: row.state }, { state: live, reason }, `rejected product ${line(f.name, 80)}`)]);
  const m = await first(env, "SELECT * FROM members WHERE id = ?", row.member_id);
  if (m) { await notify(env, m.id, { kind: "product_rejected", title: `ماتوافقش على منتجك: ${line(f.name, 80)}`, title_en: `Product not approved: ${line(f.name, 80)}`, body: reason, body_en: reason, url: "dashboard.html#products" });
    await sendTpl(env, adm.CC, "product_rejected", m.email, { product: line(f.name, 120), reason, url: dashUrl(env, "products") }, { idTail: row.id + "-" + hex(3) }); }
  return { ok: true };
}
export async function bulkApprove(env, adm, b) {
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(x => line(x, 20)))].filter(Boolean) : [];
  if (!ids.length || ids.length > 50) fail(400, "invalid_ids", "1–50 ids");
  const urls = b.company_urls && typeof b.company_urls === "object" ? b.company_urls : {};
  let approved = 0; const failed = [];
  for (const id of ids) {
    try { const row = await first(env, "SELECT factory_ref FROM cc_member_products WHERE id = ?", id); await approveProduct(env, adm, id, { company_url: row ? urls[row.factory_ref] : "" }); approved++; }
    catch (e) { failed.push({ id, code: (e && e.code) || "error" }); }
  }
  return { ok: true, approved, failed };
}
const FAC_FIELDS = ["name", "sector", "location", "type", "gov", "description", "products", "website", "logo"];
const FACX_FIELDS = ["sector", "location", "type", "description", "logo", "website", "products"];
export async function approveCompany(env, adm, id, b) {
  await needTables(env, "cc_company_requests", "cc_audit");
  const row = await first(env, "SELECT * FROM cc_company_requests WHERE id = ?", id); if (!row) fail(404, "not_found", "request not found");
  if (row.state !== "pending") fail(409, "state", "only a pending request can be approved", { state: row.state });
  const m = await first(env, "SELECT * FROM members WHERE id = ?", row.member_id); if (!m) fail(409, "state", "the member account no longer exists");
  const corr = b && b.fields && typeof b.fields === "object" ? b.fields : {}, f = { ...jget(row.fields_json, {}), ...corr };
  for (const k of ["name", "location", "description"]) if (hasContact(f[k], env)) fail(422, "invalid_contact", CONTACT_MSG, { errors: [{ field: k, msg: CONTACT_MSG }] });
  let ref = row.factory_ref, published_v = null, logoPath = "";
  // review F5 — the checks of content.js approveCompany: ONE account per directory listing (every account linked to a listing receives its
  // buyers' requests and quotes under its name, matching.js +100), and an edit only while the member still holds that listing
  if (row.kind === "claim") {
    if (!(await refExists(env, ref))) fail(409, "state", "الملف ده مبقاش موجود في الدليل / the listing no longer exists");
    if (await first(env, "SELECT id FROM members WHERE factory_ref = ? AND id != ? LIMIT 1", ref, m.id)) fail(409, "claimed", "الملف ده مربوط بحساب تاني — ارفض الطلب أو فك الربط الأول / this listing is linked to another account");
    if (m.factory_ref && m.factory_ref !== ref) fail(409, "already_linked", "الحساب ده مربوط بملف تاني / the account is linked to another listing");
  } else if (row.kind === "create") {
    if (m.factory_ref) fail(409, "already_linked", "الحساب ده مربوط بملف بالفعل / the account is already linked to a listing");
  } else if (!ref || m.factory_ref !== ref) fail(409, "state", "الحساب اتفك ربطه أو اتربط بملف تاني من وقت الطلب — ارفض الطلب / the account's listing changed since the request: reject it");
  if (f.logo) { const u = await mediaUrls(env, [f.logo], { sign: false }); logoPath = u[0] ? u[0].path : ""; }
  const aid = await adm.audit("approval.company.approve", "company_request", row.id, { state: row.state }, { state: "approved", kind: row.kind, factory_ref: ref }, `approved company ${row.kind} ${line(f.name || ref, 80)}`);
  const content = row.kind === "claim" ? null : needContent(adm), by = adm.actor.actor_email || adm.actor.actor_id;
  try {
    if (f.logo && content && typeof content.mediaPublic === "function") await content.mediaPublic(env, [f.logo]);
    if (row.kind === "create") {
      const fields = {}; for (const k of FAC_FIELDS) if (f[k] != null && f[k] !== "") fields[k] = k === "logo" ? logoPath : f[k];
      const r = await content.upsert(env, { coll: "fac", kind: "add", fields, publish: true, by, source: "member", member_id: m.id });
      ref = r && r.item ? r.item.id : ""; published_v = r ? r.published_v || null : null;
    } else if (row.kind === "edit") {
      const x = /^x\d+$/.test(ref), add = /^c-/.test(ref), coll = x ? "facx" : "fac", keys = x ? FACX_FIELDS : FAC_FIELDS, fields = {};
      for (const k of keys) if (k in f) fields[k] = k === "logo" ? logoPath : f[k];
      let r;
      if (add) r = await content.upsert(env, { coll: "fac", kind: "add", id: ref, fields, publish: true, by, source: "member", member_id: m.id });
      else {
        const base_key = x ? (dirRow(ref) || [])[0] || "" : line((b && b.base_key) || "", 300);
        if (!base_key) fail(422, "base_key_required", "send base_key (MIGOVL.key(\"fac\", MIGOLDFAC[ref])) with the approval of an edit to a base listing", { errors: [{ field: "base_key", msg: "required" }], factory_ref: ref });
        const ex = await first(env, "SELECT id FROM cc_content WHERE coll = ? AND kind = 'base' AND base_key = ?", coll, base_key);
        r = await content.upsert(env, { coll, kind: "base", base_key, ...(ex ? { id: ex.id } : {}), fields, publish: true, by, source: "member", member_id: m.id, ...(b && b.seo_path ? { seo_path: line(b.seo_path, 300) } : {}) });
      }
      published_v = r ? r.published_v || null : null;
    }
  } catch (e) { await adm.auditDone(aid, { summary: `approve ${row.id} failed: ${(e && e.code) || "error"}` }); contentErr(e); }
  const t = now(), name = line(f.name || (await listingOf(env, ref) || {}).name || m.company || "", 160), stmts = [];
  // the link is written only when no other account holds the listing at that moment (a parallel approval of a second claim loses), and the
  // request is marked approved only when the link holds — one transaction, so the checks above cannot be raced
  if (row.kind === "claim" || row.kind === "create") stmts.push(env.DB.prepare("UPDATE members SET factory_ref = ?, company = CASE WHEN ? != '' THEN ? ELSE company END, updated_at = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM members WHERE factory_ref = ? AND id != ?)").bind(ref, name, name, t, m.id, ref, m.id));
  else if (f.name && name) stmts.push(env.DB.prepare("UPDATE members SET company = ?, updated_at = ? WHERE id = ? AND factory_ref = ?").bind(name, t, m.id, ref));
  stmts.push(env.DB.prepare("UPDATE cc_company_requests SET state = 'approved', fields_json = ?, factory_ref = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND state = 'pending' AND EXISTS (SELECT 1 FROM members WHERE id = ? AND factory_ref = ?)").bind(JSON.stringify(f), ref, by, t, t, row.id, m.id, ref));
  await batch(env, stmts);
  if ((await first(env, "SELECT state FROM cc_company_requests WHERE id = ?", row.id) || {}).state !== "approved") {
    await adm.auditDone(aid, { summary: `approve ${row.id} refused: the listing ${ref} is linked to another account (or the request changed)` });
    fail(409, "claimed", "الملف ده اتربط بحساب تاني في نفس اللحظة — حدّث الصفحة / the listing was linked to another account in the meantime — reload");
  }
  await adm.auditDone(aid, { after: { state: "approved", kind: row.kind, factory_ref: ref, published_v } });
  await notify(env, m.id, { kind: "company_approved", title: "اتوافق على طلب ملف شركتك", title_en: "Your company profile request was approved", body: name, body_en: name, url: "dashboard.html#company" });
  await sendTpl(env, adm.CC, "company_approved", m.email, { company: name, reason: "", url: dashUrl(env, "company") }, { idTail: row.id + "-" + hex(3) });
  return { ok: true, factory_ref: ref, published_v };
}
export async function rejectCompany(env, adm, id, b) {
  await needTables(env, "cc_company_requests", "cc_audit");
  const reason = txt1(b.reason, 501);
  if (reason.length < 3 || reason.length > 500) fail(422, "invalid", "اكتب سبب الرفض (3–500 حرف) / a reason of 3–500 characters is required", { errors: [{ field: "reason", msg: "3–500" }] });
  const row = await first(env, "SELECT * FROM cc_company_requests WHERE id = ?", id); if (!row) fail(404, "not_found", "request not found");
  if (row.state !== "pending") fail(409, "state", "only a pending request can be rejected", { state: row.state });
  const t = now(), f = jget(row.fields_json, {});
  await batch(env, [env.DB.prepare("UPDATE cc_company_requests SET state = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(reason, adm.actor.actor_email || adm.actor.actor_id, t, t, row.id),
    adm.auditStmt("approval.company.reject", "company_request", row.id, { state: row.state }, { state: "rejected", reason }, `rejected company ${row.kind}`)]);
  const m = await first(env, "SELECT * FROM members WHERE id = ?", row.member_id);
  if (m) { const name = line(f.name || (await listingOf(env, row.factory_ref) || {}).name || m.company || "", 160);
    await notify(env, m.id, { kind: "company_rejected", title: "ماتوافقش على طلب ملف شركتك", title_en: "Your company profile request was not approved", body: reason, body_en: reason, url: "dashboard.html#company" });
    await sendTpl(env, adm.CC, "company_rejected", m.email, { company: name, reason, url: dashUrl(env, "company") }, { idTail: row.id + "-" + hex(3) }); }
  return { ok: true };
}
export { changed, iso, listingOf };
