/* «🌐 فرص من الإنترنت» — the web leads of the data desk (migration 0012_web_leads.sql, owner switch web_leads; spec 2026-11-20 §5 and its
   review S5 / S8 / S14 / nits 4–5). What Janna's and Bassem's web search / opportunity hunt RETURN from a provider is kept here for the
   data team, so what they find makes the platform's data grow. PUBLISHED AT ONCE since the owner's decision of 2026-11-20 («تظهر علطول»,
   no review gate): src/web-public.js shows every new / accepted opportunity without personal data on «فرص السوق» and in janna_lookup —
   the opportunity itself, NEVER its link, site, snippet or query, which stay here for the team (switches web_leads_public /
   web_leads_lookup). The team hides a wrong one with one press («🙈 إخفاء من المنصة» = rejected, reason hidden, audited leads.hide; a
   hidden link never comes back in a hunt either) and puts it back («↩ رجّعها على المنصة» = accepted, audited leads.restore).
     recordLeads(env, rows, meta)   after an answer (ctx.waitUntil): one atomic upsert per opportunity (tender, rfq, buyer, buyer_list,
                                    project; news only from a hunt; never other); a known link keeps its title / snippet / status (a
                                    rejected lead stays rejected), gains a sighting at most once per clock hour (also when it is seen
                                    every few minutes: the hour of last_seen is compared), a better type (tender > rfq >
                                    project > buyer > buyer_list > news), the other persona. Cached answers are not recorded (review S8)
     rejectedOf(env, hashes, pk)    the links the team rejected — for every product when the reason is old / duplicate / not credible /
                                    an advert, for THIS product only when it was «مش عن المنتج» or had no reason (review S5)
     listLeads / reviewLead / linkLead   the desk (acc-team.js): GET /api/team/desk/leads, PUT /api/team/desk/leads/:id, POST
                                    /api/team/desk/content {lead_id} — roles data / admin / owner, one cc_audit row per decision; every
                                    item says whether it is on the platform now (published, public_why: status | type | personal | empty |
                                    unofficial | no_deadline | closed | duplicate | no_date | old — web-public.js, the auto-publish gate)
   Without the table nothing is written (the answers do not change), GET says off, PUT 503 leads_off. */
import { sha256, line, iso, now } from "./common.js";
import { forLLM, clean } from "./text.js";
import { fail, all, first, auditStmt, batch, paging, likeOf } from "./acc-base.js";
import { featureOn, leadsStoreOn } from "./flags.js";
import { canonUrl, bareHost } from "./web-classify.js";
import { canon, words as lkWords } from "./lookup-terms.js";
import { publicState, forgetPublished } from "./web-public.js"; // «فرص السوق»: what is on the platform now; a decision here is read again at once

export const LEAD_TYPES = Object.freeze(["tender", "rfq", "buyer", "buyer_list", "project", "news", "other"]);
const STORE = new Set(["tender", "rfq", "buyer", "buyer_list", "project", "news"]);
export const TYPE_NAMES = Object.freeze({ tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "RFQ"], buyer: ["عميل محتمل", "Potential buyer"], buyer_list: ["قائمة عملاء محتملين", "List of potential buyers"],
  project: ["مشروع جديد", "New project"], news: ["خبر", "News"], other: ["تاني", "Other"] });
export const STATUS_NAMES = Object.freeze({ new: ["جديدة", "New"], accepted: ["مقبولة", "Accepted"], rejected: ["مرفوضة", "Rejected"] });
export const REASONS = Object.freeze({ off_topic: ["مش عن المنتج", "Not about the product"], old: ["قديمة أو مقفولة", "Old or closed"], duplicate: ["مكررة", "Duplicate"],
  not_credible: ["مش موثوقة", "Not credible"], advert: ["إعلان", "Advert"], hidden: ["مخفية من المنصة", "Hidden from the platform"] });
/* a rejection for every product (a hunt never brings the link back); «مش عن المنتج» / no reason: for the same product only */
const GLOBAL_REASONS = ["old", "duplicate", "not_credible", "advert", "hidden"];
const WHY_NAMES = Object.freeze({ status: ["مرفوضة أو مخفية", "Rejected or hidden"], type: ["مش فرصة واضحة", "Not a clear opportunity"], personal: ["فيها بيانات شخصية", "Holds personal data"],
  empty: ["مفيش عنوان ينفع يتعرض من غير المصدر", "No title that can be shown without its source"],
  /* the auto-publish gate (owner 2026-11-28, web-public.js): official source, a closing date ahead, not one the platform has; for news also
     a publication date inside the news window (buyers: «مش صفحة رسمية» = not the company's own site or a public body's page) */
  unofficial: ["مصدرها مش صفحة رسمية", "Its source is not an official page"], no_deadline: ["مفيش آخر ميعاد مكتوب فيها", "No closing date in it"],
  closed: ["ميعادها خلص أو اتلغت", "Closed or cancelled"], duplicate: ["موجودة على المنصة بالفعل", "Already on the platform"],
  no_date: ["مفيش تاريخ نشر للخبر", "The news item has no publication date"], old: ["الخبر أقدم من شهر", "The news item is older than a month"] });
/* rejected_in: the links one rejectedOf() read covers — a hunt has ≤ 60 candidates; D1 binds ≤ 100 values a statement (90 + 4 + 1) */
export const LEADS_LIMITS = Object.freeze({ per_answer: 12, rejected_in: 90, note: 300 });
const RANK = t => `CASE ${t} WHEN 'tender' THEN 6 WHEN 'rfq' THEN 5 WHEN 'project' THEN 4 WHEN 'buyer' THEN 3 WHEN 'buyer_list' THEN 2 WHEN 'news' THEN 1 ELSE 0 END`;

export const leadsOn = env => leadsStoreOn(env);
export const leadHash = async url => (await sha256("lead|v1|" + canonUrl(url))).slice(0, 32);
/* the product's stored word forms, sorted («سلندرات درافيل» = «درافيل السلندرات») — what a product-scoped rejection is compared with */
export const productKey = s => [...new Set(lkWords(String(s || "").slice(0, 200)).map(canon).filter(w => w && w.length > 1))].sort().join(" ").slice(0, 120);
const who = p => (p === "janna" ? "janna" : p === "bassem" ? "bassem" : "");

const UPSERT = `INSERT INTO web_leads (url_hash, url, title, site, snippet, type, official, aggregator, query, product, product_key, market, governorate, persona, personas, via, lang, date, first_seen, last_seen)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ' ' || ? || ' ', ?, ?, ?, ?, ?)
ON CONFLICT(url_hash) DO UPDATE SET
  seen_count = web_leads.seen_count + (CASE WHEN substr(web_leads.last_seen, 1, 13) < substr(excluded.last_seen, 1, 13) THEN 1 ELSE 0 END),
  last_seen = MAX(web_leads.last_seen, excluded.last_seen),
  personas = CASE WHEN instr(web_leads.personas, ' ' || excluded.persona || ' ') > 0 THEN web_leads.personas ELSE web_leads.personas || excluded.persona || ' ' END,
  date = CASE WHEN web_leads.date = '' THEN excluded.date ELSE web_leads.date END,
  type = CASE WHEN ${RANK("excluded.type")} > ${RANK("web_leads.type")} THEN excluded.type ELSE web_leads.type END,
  official = MAX(web_leads.official, excluded.official)`;
/* rows: [{url, title, snippet, source?, date, type, official, aggregator, query, lang}] (already cleaned by websearch.js cleanResults: masked,
   no personal links); meta: {persona, via: search | hunt, product, market, governorate, nowMs} → how many were written (never throws) */
export async function recordLeads(env, rows, { persona = "", via = "", product = "", market = "", governorate = "", nowMs = Date.now() } = {}) {
  try {
    if (!env || !env.DB || !Array.isArray(rows) || !rows.length) return 0;
    if (!(await leadsOn(env)) || !(await featureOn(env, "web_leads"))) return 0;
    const t = iso(nowMs), pk = productKey(product), p = who(persona), v = via === "hunt" ? "hunt" : via === "research" ? "research" : "search"; // research: kept for the desk, never published (web-public.js)
    const stmts = [];
    for (const r of rows.slice(0, LEADS_LIMITS.per_answer)) {
      if (!r || !STORE.has(r.type) || (r.type === "news" && v === "search")) continue;
      const url = String(r.url || "");
      if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 600) continue;
      let host = ""; try { host = bareHost(new URL(url).hostname); } catch (e) { continue; }
      stmts.push(env.DB.prepare(UPSERT).bind(await leadHash(url), url, forLLM(r.title, 160), host.slice(0, 120), forLLM(r.snippet, 300), r.type, r.official ? 1 : 0, r.aggregator ? 1 : 0,
        forLLM(r.query || "", 200), forLLM(product, 120), pk, line(market || "", 20), line(governorate || "", 40), p, p, v, r.lang === "en" ? "en" : r.lang === "ar" ? "ar" : "", forLLM(r.date || "", 40), t, t));
    }
    if (!stmts.length) return 0;
    await env.DB.batch(stmts);
    return stmts.length;
  } catch (e) { console.error("web-leads: record", (e && e.message) || "error"); return 0; }
}
/* the links the team rejected among these hashes (≤ 90): product-independent reasons for every hunt, «مش عن المنتج» / no reason only
   for the same product (review S5) → Set of hashes (never throws: a failing read filters nothing) */
export async function rejectedOf(env, hashes, pk) {
  try {
    const hs = [...new Set((hashes || []).filter(h => /^[0-9a-f]{32}$/.test(h)))].slice(0, LEADS_LIMITS.rejected_in);
    if (!hs.length || !(await leadsOn(env))) return new Set();
    const rows = await all(env, `SELECT url_hash FROM web_leads WHERE status = 'rejected' AND url_hash IN (${hs.map(() => "?").join(", ")}) AND (reason IN (${GLOBAL_REASONS.map(() => "?").join(", ")}) OR product_key = ?)`,
      ...hs, ...GLOBAL_REASONS, String(pk || ""));
    return new Set(rows.map(r => r.url_hash));
  } catch (e) { return new Set(); }
}

/* ---------- the data desk ---------- */
const listOf = s => String(s || "").trim().split(/\s+/).filter(Boolean);
function itemOf(r) {
  const tn = TYPE_NAMES[r.type] || TYPE_NAMES.other, sn = STATUS_NAMES[r.status] || STATUS_NAMES.new, rn = REASONS[r.reason] || null, ps = publicState(r), wn = WHY_NAMES[ps.why] || null;
  return { id: r.id, url: r.url, title: r.title, site: r.site, snippet: r.snippet, type: r.type, type_ar: tn[0], type_en: tn[1], official: !!r.official, aggregator: !!r.aggregator,
    published: ps.published, public_why: ps.why, public_why_ar: wn ? wn[0] : "", public_why_en: wn ? wn[1] : "",
    query: r.query, product: r.product, market: r.market, governorate: r.governorate, persona: r.persona, personas: listOf(r.personas), via: r.via, lang: r.lang, date: r.date,
    first_seen: r.first_seen, last_seen: r.last_seen, seen_count: r.seen_count, status: r.status, status_ar: sn[0], status_en: sn[1], reason: r.reason || "",
    reason_ar: rn ? rn[0] : "", reason_en: rn ? rn[1] : "", reviewed_by: r.reviewed_by, reviewed_at: r.reviewed_at, note: r.note, content_id: r.content_id };
}
const OFF = Object.freeze({ items: [], total: 0, page: 0, limit: 0, counts: { new: 0, accepted: 0, rejected: 0 }, by_type: {}, off: true, hint: "apply migrations/0012_web_leads.sql" });
/* GET /api/team/desk/leads?status=new|accepted|rejected|all&type=&market=&q=&sort=recent|seen&page=&limit≤100 */
export async function listLeads(env, url) {
  if (!(await leadsOn(env))) return { ...OFF, counts: { ...OFF.counts } };
  const sp = url.searchParams, status = ["new", "accepted", "rejected", "all"].includes(sp.get("status")) ? sp.get("status") : "new";
  const type = LEAD_TYPES.includes(sp.get("type")) ? sp.get("type") : "", market = line(sp.get("market") || "", 20).toLowerCase(), q = line(sp.get("q") || "", 80), sort = sp.get("sort") === "seen" ? "seen" : "recent";
  const { page, limit, offset } = paging(url, 50, 100);
  const w = [], a = [];
  if (status !== "all") { w.push("status = ?"); a.push(status); }
  if (type) { w.push("type = ?"); a.push(type); }
  if (market) { w.push("market = ?"); a.push(market); }
  if (q) { w.push("(title LIKE ? OR site LIKE ? OR product LIKE ? OR query LIKE ?)"); const l = likeOf(q); a.push(l, l, l, l); }
  const where = w.length ? " WHERE " + w.join(" AND ") : "";
  const total = Number(((await first(env, "SELECT COUNT(*) AS n FROM web_leads" + where, ...a)) || {}).n || 0);
  const rows = await all(env, "SELECT * FROM web_leads" + where + (sort === "seen" ? " ORDER BY seen_count DESC, last_seen DESC, id DESC" : " ORDER BY last_seen DESC, id DESC") + " LIMIT ? OFFSET ?", ...a, limit, offset);
  const counts = { new: 0, accepted: 0, rejected: 0 };
  for (const r of await all(env, "SELECT status, COUNT(*) AS n FROM web_leads GROUP BY status")) if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] = Number(r.n) || 0;
  const by_type = {};
  for (const r of await all(env, "SELECT type, COUNT(*) AS n FROM web_leads" + (status !== "all" ? " WHERE status = ?" : "") + " GROUP BY type", ...(status !== "all" ? [status] : []))) by_type[r.type] = Number(r.n) || 0;
  return { items: rows.map(itemOf), total, page, limit, counts, by_type, status, sort };
}
const ACTION = { accepted: "leads.accept", rejected: "leads.reject", new: "leads.reopen" };
/* PUT /api/team/desk/leads/:id {status: accepted|rejected|new, reason?, note?, content_id?} → {ok, item}; the UPDATE and its cc_audit row in
   ONE batch (an audit that cannot be written = nothing changed); the audit never carries the snippet or the note's text. «🙈 إخفاء من المنصة»
   is {status: rejected, reason: hidden} (audited leads.hide), «↩ رجّعها على المنصة» a rejected lead set accepted (leads.restore) */
export async function reviewLead(env, actor, id, b, { ipHash = "", reqId = "" } = {}) {
  if (!(await leadsOn(env))) fail(503, "leads_off", "مكان فرص الإنترنت محتاج تشغيل ملف قاعدة البيانات 0012_web_leads.sql / apply migrations/0012_web_leads.sql");
  b = b && typeof b === "object" ? b : {};
  const status = String(b.status || "");
  if (!Object.prototype.hasOwnProperty.call(ACTION, status)) fail(400, "invalid_status", "الحالة لازم تكون مقبولة أو مرفوضة أو جديدة / status must be accepted, rejected or new", { errors: [{ field: "status", msg: "accepted | rejected | new" }] });
  const reason = status === "rejected" && b.reason ? String(b.reason) : "";
  if (reason && !REASONS[reason]) fail(400, "invalid_reason", "سبب الرفض مش من القايمة / unknown rejection reason", { errors: [{ field: "reason", msg: Object.keys(REASONS).join(" | ") }] });
  const note = b.note == null ? null : clean(String(b.note), LEADS_LIMITS.note);
  const content_id = b.content_id == null || b.content_id === "" ? "" : line(b.content_id, 80);
  const row = await first(env, "SELECT * FROM web_leads WHERE id = ?", id);
  if (!row) fail(404, "not_found", "الفرصة دي مش موجودة / unknown lead");
  if (content_id && !(await first(env, "SELECT id FROM cc_content WHERE id = ?", content_id))) fail(400, "invalid_content", "المحتوى ده مش موجود / unknown content id", { errors: [{ field: "content_id", msg: "cc_content id" }] });
  const t = now(), tn = (TYPE_NAMES[row.type] || TYPE_NAMES.other)[0];
  /* «🙈 إخفاء من المنصة» = rejected + hidden; «↩ رجّعها على المنصة» = a rejected lead accepted — their own audit actions (a rejected lead set
     back to new is a reopen, as before: it is on the platform again too) */
  const hide = status === "rejected" && reason === "hidden", restore = row.status === "rejected" && status === "accepted";
  const action = hide ? "leads.hide" : restore ? "leads.restore" : ACTION[status];
  const said = hide ? "اتخفت من المنصة" : restore ? "رجعت على المنصة (" + STATUS_NAMES[status][0] + ")" : STATUS_NAMES[status][0] + (reason ? " — " + REASONS[reason][0] : "");
  await batch(env, [
    env.DB.prepare("UPDATE web_leads SET status = ?, reason = ?, note = COALESCE(?, note), content_id = CASE WHEN ? = '' THEN content_id ELSE ? END, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
      .bind(status, reason, note, content_id, content_id, String(actor.actor_id || ""), t, row.id),
    auditStmt(env, { ...actor, action, target_type: "web_lead", target_id: String(row.id), before: { status: row.status, reason: row.reason || "" },
      after: { status, reason, note_len: note == null ? undefined : note.length, ...(content_id ? { content_id } : {}) },
      summary: `فرصة من الإنترنت #${row.id} (${row.site}، ${tn}): ${said}`, ip_hash: ipHash, req_id: reqId }),
  ]);
  forgetPublished(); // this isolate's «فرص السوق» and janna_lookup read the table again (the others within their 2 / 10 minutes)
  return { ok: true, item: itemOf(await first(env, "SELECT * FROM web_leads WHERE id = ?", row.id)) };
}
/* after POST /api/team/desk/content {lead_id} made its content (201): the lead becomes accepted + content_id, audited leads.convert — best
   effort: a failed link never undoes the content → true | false */
export async function linkLead(env, actor, leadId, contentId, { ipHash = "" } = {}) {
  try {
    const id = Number(leadId); if (!Number.isInteger(id) || id <= 0 || !contentId || !(await leadsOn(env))) return false;
    const row = await first(env, "SELECT id, site, type, status FROM web_leads WHERE id = ?", id); if (!row) return false;
    const t = now();
    await batch(env, [
      env.DB.prepare("UPDATE web_leads SET status = 'accepted', reason = '', content_id = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").bind(line(contentId, 80), String(actor.actor_id || ""), t, id),
      auditStmt(env, { ...actor, action: "leads.convert", target_type: "web_lead", target_id: String(id), before: { status: row.status }, after: { status: "accepted", content_id: line(contentId, 80) },
        summary: `فرصة من الإنترنت #${id} (${row.site}) اتحوّلت لمحتوى ${line(contentId, 80)}`, ip_hash: ipHash }),
    ]);
    forgetPublished();
    return true;
  } catch (e) { console.error("web-leads: link", (e && e.message) || "error"); return false; }
}
