/* Member self-service for the customer dashboard (dashboard.html «منتجاتي», «ملف الشركة», «باقتي» invoices, the status line) and the
   registration pre-fill — ACC-CONTRACT §1.7, §3.1.15, §8.4. Signed-in member (Bearer v2) only; link sessions — and old-password bridge
   sessions, which have the same scope (auth.js "lg…", review F8) — may read but not write; /recognize needs an e-mail-code session.
   /gcc: the member's GCC states (Premium = Egypt + the states it picks): GET {gcc, allowed}; POST {gcc} only while none is chosen yet —
   afterwards 409 gcc_locked (the platform team changes them, DESIGN Q2).
   Contacts never reach public text. */
import { line, now, iso, hex, isEmail, emailKey, sameMailbox, canonPlan, PLAN_LV, effPlan, PLAN_NAME, rateOk, site, jparse, GCC, gccOf, normGcc } from "./common.js";
import { authUser, isLinkSession } from "./auth.js";
import { ccJson, ccErr, ccPreflight, fail, body, all, first, countOf, allIn, needTables, batch, auditStmt, auditStmtIf, actorOf, jget, txt, txt1, isHttps, hasContact, CONTACT_MSG, validator,
  refExists, DIR_REF_RX, factoryNames, sessionVia, errOf, rid } from "./acc-base.js";
import { planCanX, planLimitX, capsOf, setting, plansData } from "./acc-plans.js";
import { metaOf, setGcc, gccError } from "./acc-members.js";
import { mediaUrls, listingOf } from "./acc-orders.js";
import { GOV_CODES } from "./common.js";
import { appBuyOff, APP_BUY_OFF_MSG } from "./app-ua.js"; // «🛠️ المطوّر» app_buy_<platform> off: no new invoice from that app

const BASE_CATS = ["food", "build", "plastic", "elec", "glass", "metal", "petro", "med", "furn", "cosm", "other"];
async function catKeys(env) {
  const extra = jget(await setting(env, "cats", "{}"), {}), out = new Set(BASE_CATS);
  for (const [k, v] of Object.entries(extra || {})) { if (/^[a-z][a-z0-9_-]{0,30}$/.test(k)) { if (v && v.hidden) out.delete(k); else out.add(k); } }
  return out;
}
const payUrl = (env, token) => site(env) + "pay.html#inv=" + token;
async function openInvoice(env, m) {
  return first(env, "SELECT no, total_minor, currency, pay_token, plan FROM cc_invoices WHERE status = 'open' AND test = 0 AND (member_id = ? OR (member_id = '' AND email_key = ?)) ORDER BY issued_at DESC LIMIT 1", m.id, emailKey(m.email || ""));
}

/* ---------- GET /api/me/account ---------- */
async function account(env, m, via, CC) {
  let inv = null;
  if (CC && CC.payments && typeof CC.payments.memberOpenInvoice === "function") { const o = await CC.payments.memberOpenInvoice(env, m); inv = o ? { no: o.no, total_minor: o.total_minor, currency: o.currency, plan: o.plan, pay_url: o.pay_url } : null; }
  else { const o = await openInvoice(env, m); inv = o ? { no: o.no, total_minor: o.total_minor, currency: o.currency, plan: o.plan, pay_url: payUrl(env, o.pay_token) } : null; }
  const meta = (await metaOf(env, m.id)) || {}, plan = effPlan(m); // read after the payments link step (it may set status pending)
  const used = (await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_products WHERE member_id = ? AND state NOT IN ('deleted', 'rejected')", m.id)) || 0;
  const names = m.factory_ref ? await factoryNames(env, [m.factory_ref]) : new Map();
  return { status: meta.status || "active", plan, plan_name: PLAN_NAME[plan], plan_expires: m.plan_expires || "", requested_plan: meta.requested_plan || "",
    open_invoice: inv ? { no: inv.no, total_minor: inv.total_minor, currency: inv.currency || "EGP", plan: inv.plan, pay_url: inv.pay_url } : null,
    caps: plan === "visitor" ? capsOf("visitor") : capsOf(plan), limits: { products: planLimitX(m, "products"), images_per_product: planLimitX(m, "images_per_product"), used_products: used },
    linked: m.factory_ref ? { factory_ref: m.factory_ref, name: names.get(m.factory_ref) || "" } : null, legacy_session: via === "legacy" };
}

/* ---------- «منتجاتي» ---------- */
async function productItem(env, r) {
  const f = jget(r.draft_json, {}), live = jget(r.live_json || "", null);
  return { id: r.id, state: r.state, fields: f, live, reject_reason: r.reject_reason || "", submitted_at: r.submitted_at || "", updated_at: r.updated_at, images: await mediaUrls(env, Array.isArray(f.images) ? f.images : []) };
}
/* every member write to «منتجاتي» (create, edit, submit, hide, delete) shares ONE budget: 60 per hour per member (review F7) */
async function writeOk(env, m) { if (!(await rateOk(env, "meprod|" + m.id, 60, 3600))) fail(429, "rate_limited", "تعديلات كتير — جرّب بعد شوية / too many changes, try again later", { retry_s: 3600 }); }
/* the plan's product cap as part of the write itself (review F4): the counted rows are evaluated INSIDE the statement, so parallel
   requests cannot all pass a check made before them */
const COUNTED = "(SELECT COUNT(*) FROM cc_member_products WHERE member_id = ? AND state NOT IN ('deleted', 'rejected'))";
async function productQuota(env, m) {
  const limit = planLimitX(m, "products"), used = (await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_products WHERE member_id = ? AND state NOT IN ('deleted', 'rejected')", m.id)) || 0;
  const need = limit === 0 ? "plan" : !m.factory_ref ? "link" : null;
  return { limit, used, need, can_add: !need && (limit === -1 || used < limit) };
}
async function listProducts(env, m) {
  const rows = await all(env, "SELECT * FROM cc_member_products WHERE member_id = ? AND state != 'deleted' ORDER BY created_at DESC LIMIT 1000", m.id);
  const items = []; for (const r of rows) items.push(await productItem(env, r));
  return { items, ...(await productQuota(env, m)) };
}
async function productFields(env, m, raw, v, partial) {
  const out = {}, cats = await catKeys(env);
  const S = (k, max, multi) => { if (!(k in raw)) return; const val = multi ? txt(raw[k], max + 1) : txt1(raw[k], max + 1); if (val.length > max) v.err(k, `أطول من ${max} حرف / longer than ${max}`); else if (hasContact(val, env)) v.err(k, CONTACT_MSG, "invalid_contact"); else out[k] = val; };
  S("name", 120); S("name_en", 120); S("description", 600, true); S("description_en", 600, true); S("price", 40);
  if ("category" in raw) { const c = line(raw.category, 40); if (!cats.has(c)) v.err("category", "اختار تصنيف من تصنيفات السوق / choose a marketplace category"); else out.category = c; }
  if (!partial) { if (!out.name) v.err("name", "اسم المنتج مطلوب / product name required"); if (!out.category && !v.errors.some(e => e.field === "category")) v.err("category", "التصنيف مطلوب / category required"); }
  return out;
}
async function productImages(env, m, ids, v) {
  if (ids == null) return undefined;
  if (!Array.isArray(ids)) { v.err("images", "list of image ids"); return undefined; }
  const lim = planLimitX(m, "images_per_product"), max = lim === -1 ? 10 : Math.max(0, lim), list = [...new Set(ids.map(x => line(x, 40)).filter(Boolean))];
  if (list.length > max) { v.err("images", `الباقة بتسمح بـ ${max} صورة للمنتج / your plan allows ${max} image(s) per product`, "too_many_images"); return undefined; }
  const rows = await allIn(env, ph => `SELECT id, owner_id, status FROM cc_media WHERE owner_type = 'member' AND id IN (${ph})`, list);
  const ok = new Set(rows.filter(r => r.owner_id === m.id && (r.status === "pending" || r.status === "public")).map(r => r.id));
  for (const id of list) if (!ok.has(id)) { v.err("images", "صورة مش موجودة أو مش بتاعتك / unknown image", "invalid_image"); return undefined; }
  return list;
}
async function createProduct(req, env, m) {
  const b = await body(req);
  await needTables(env, "cc_member_products", "cc_audit");
  const q = await productQuota(env, m);
  if (q.limit === 0) fail(403, "plan", "باقتك مافيهاش منتجات في السوق / your plan has no marketplace products", { need: "plan" });
  if (!m.factory_ref) fail(409, "link_required", "اربط حسابك بملف شركتك الأول من «ملف الشركة» / link your account to your company profile first");
  if (q.limit !== -1 && q.used >= q.limit) fail(429, "limit", "وصلت لحد المنتجات في باقتك / product limit of your plan reached", { limit: q.limit, used: q.used });
  await writeOk(env, m);
  const v = validator(), f = await productFields(env, m, b.fields && typeof b.fields === "object" ? b.fields : {}, v, false), imgs = await productImages(env, m, b.images || [], v);
  v.done();
  const id = "p-" + rid(8), t = now(), state = b.submit ? "pending" : "draft", vals = [id, m.id, m.factory_ref, state, JSON.stringify({ ...f, images: imgs || [] }), b.submit ? t : "", t, t];
  const ins = q.limit === -1 ? env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...vals)
    : env.DB.prepare(`INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, submitted_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${COUNTED} < ?`).bind(...vals, m.id, q.limit);
  await batch(env, [ins, auditStmtIf(env, { ...actorOf(m), actor_role: "member", action: "member.product_create", target_type: "member_product", target_id: id, after: { state, name: f.name }, summary: `product ${f.name} (${state})` }, "EXISTS (SELECT 1 FROM cc_member_products WHERE id = ?)", [id])]);
  const row = await first(env, "SELECT * FROM cc_member_products WHERE id = ?", id);
  if (!row) { const q2 = await productQuota(env, m); fail(429, "limit", "وصلت لحد المنتجات في باقتك / product limit of your plan reached", { limit: q2.limit, used: q2.used }); }
  return { status: 201, body: { item: await productItem(env, row) } };
}
async function ownProduct(env, m, id) { const r = await first(env, "SELECT * FROM cc_member_products WHERE id = ? AND member_id = ?", line(id, 20), m.id); if (!r || r.state === "deleted") fail(404, "not_found", "product not found"); return r; }
async function patchProduct(req, env, m, id) {
  const b = await body(req);
  const r = await ownProduct(env, m, id), v = validator();
  const f = await productFields(env, m, b.fields && typeof b.fields === "object" ? b.fields : {}, v, true), imgs = await productImages(env, m, b.images, v);
  v.done();
  const limit = planLimitX(m, "products");
  if (limit === 0) fail(403, "plan", "your plan has no marketplace products", { need: "plan" });
  const draft = { ...jget(r.draft_json, {}), ...f, ...(imgs ? { images: imgs } : {}) };
  if (!draft.name || !draft.category) fail(422, "invalid", "name and category are required", { errors: [{ field: draft.name ? "category" : "name", msg: "required" }] });
  const state = b.submit === true ? "pending" : b.submit === false ? "draft" : r.state === "pending" ? "pending" : r.state === "draft" ? "draft" : "draft";
  // a rejected product is outside the cap: editing it brings it back (draft / pending) only while the cap has room (review F4 / R6)
  const reenter = r.state === "rejected" && limit !== -1;
  if (reenter) { const q = await productQuota(env, m); if (q.used >= q.limit) fail(429, "limit", "وصلت لحد المنتجات في باقتك — امسح منتج أو رقّي باقتك / product limit of your plan reached", { limit: q.limit, used: q.used }); }
  await writeOk(env, m);
  const t = now();
  await batch(env, [env.DB.prepare(`UPDATE cc_member_products SET draft_json = ?, state = ?, submitted_at = CASE WHEN ? = 'pending' THEN ? ELSE submitted_at END, updated_at = ? WHERE id = ?${reenter ? ` AND ${COUNTED} < ?` : ""}`).bind(JSON.stringify(draft), state, state, t, t, r.id, ...(reenter ? [m.id, limit] : [])),
    auditStmtIf(env, { ...actorOf(m), actor_role: "member", action: "member.product_update", target_type: "member_product", target_id: r.id, before: { state: r.state }, after: { state }, summary: `product ${draft.name} → ${state}` }, "EXISTS (SELECT 1 FROM cc_member_products WHERE id = ? AND state = ? AND updated_at = ?)", [r.id, state, t])]);
  const row = await first(env, "SELECT * FROM cc_member_products WHERE id = ?", r.id);
  if (reenter && row.state === "rejected") { const q = await productQuota(env, m); fail(429, "limit", "وصلت لحد المنتجات في باقتك / product limit of your plan reached", { limit: q.limit, used: q.used }); }
  return { body: { item: await productItem(env, row) } };
}
async function submitProduct(env, m, id) {
  const r = await ownProduct(env, m, id), d = jget(r.draft_json, {});
  if (!["draft", "rejected", "approved", "hidden"].includes(r.state)) fail(409, "state", "already waiting for review", { state: r.state });
  if (!d.name || !d.category) fail(422, "invalid", "complete the product first", { errors: [{ field: d.name ? "category" : "name", msg: "required" }] });
  const limit = planLimitX(m, "products");
  if (limit === 0) fail(403, "plan", "your plan has no marketplace products", { need: "plan" });
  const reenter = r.state === "rejected" && limit !== -1;
  if (reenter) { const q = await productQuota(env, m); if (q.used >= q.limit) fail(429, "limit", "product limit of your plan reached", { limit: q.limit, used: q.used }); }
  await writeOk(env, m);
  const t = now();
  await batch(env, [env.DB.prepare(`UPDATE cc_member_products SET state = 'pending', submitted_at = ?, updated_at = ? WHERE id = ? AND state = ?${reenter ? ` AND ${COUNTED} < ?` : ""}`).bind(t, t, r.id, r.state, ...(reenter ? [m.id, limit] : [])),
    auditStmtIf(env, { ...actorOf(m), actor_role: "member", action: "member.product_submit", target_type: "member_product", target_id: r.id, before: { state: r.state }, after: { state: "pending" }, summary: `product ${d.name} submitted` }, "EXISTS (SELECT 1 FROM cc_member_products WHERE id = ? AND state = 'pending' AND submitted_at = ?)", [r.id, t])]);
  const row = await first(env, "SELECT * FROM cc_member_products WHERE id = ?", r.id);
  if (row.state !== "pending") { if (reenter) { const q = await productQuota(env, m); fail(429, "limit", "product limit of your plan reached", { limit: q.limit, used: q.used }); } fail(409, "state", "the product changed in the meantime — reload", { state: row.state }); }
  return { body: { item: await productItem(env, row) } };
}
/* removal needs no approval: a published product's change is saved at once and published through the overlay — right away within the
   member publish budget, else with the next content cron run (≤ 15 min): CC.content.memberPublish coalesces them (review F7) */
async function hideOrDelete(env, m, id, CC, mode, hidden) {
  const r = await ownProduct(env, m, id), live = !!r.live_json, t = now(), by = "member:" + m.id;
  await writeOk(env, m);
  let pub = null;
  if (live && (mode === "delete" || hidden !== undefined)) {
    if (!CC || !CC.content || typeof CC.content.setHidden !== "function") fail(503, "content_off", "the content module is not available");
    const want = mode === "delete" ? true : !!hidden, coalesce = typeof CC.content.memberPublish === "function";
    await CC.content.setHidden(env, { coll: "prod", id: r.id, hidden: want, publish: !coalesce, by });
    if (coalesce) pub = await CC.content.memberPublish(env, { memberId: m.id, CC });
  }
  const state = mode === "delete" ? "deleted" : hidden ? "hidden" : live ? "approved" : "draft";
  await batch(env, [env.DB.prepare("UPDATE cc_member_products SET state = ?, updated_at = ? WHERE id = ?").bind(state, t, r.id),
    auditStmt(env, { ...actorOf(m), actor_role: "member", action: mode === "delete" ? "member.product_delete" : "member.product_hide", target_type: "member_product", target_id: r.id, before: { state: r.state }, after: { state }, summary: `product ${r.id} → ${state}` })]);
  const shown = pub ? { published: !!pub.published || !pub.pending, ...(pub.deferred ? { publish_eta_s: 900 } : {}) } : {};
  return mode === "delete" ? { body: { ok: true, ...shown } } : { body: { item: await productItem(env, await first(env, "SELECT * FROM cc_member_products WHERE id = ?", r.id)), ...shown } };
}

/* ---------- «ملف الشركة» ---------- */
const TYPES = ["مصنع", "شركة ومورد", "شركة"];
export function allowedFields(m) { if (!planCanX(m, "listing")) return []; return ["name", "sector", "location", "type", "gov", "description", "products", "website", "logo", ...(planCanX(m, "video") ? ["video"] : []), ...(planCanX(m, "social") ? ["social"] : [])]; }
async function companyFields(env, m, raw, v, allowed) {
  const out = {};
  for (const k of Object.keys(raw)) if (!allowed.includes(k)) v.err(k, "الحقل ده مش متاح في باقتك / this field is not available on your plan", "plan_field");
  const S = (k, max, multi) => { if (!(k in raw) || !allowed.includes(k)) return; const val = multi ? txt(raw[k], max + 1) : txt1(raw[k], max + 1); if (val.length > max) v.err(k, `أطول من ${max} حرف / longer than ${max}`); else if (hasContact(val, env)) v.err(k, CONTACT_MSG, "invalid_contact"); else out[k] = val; };
  S("name", 160); S("sector", 80); S("location", 160); S("description", 2000, true);
  if ("type" in raw && allowed.includes("type")) { const t = txt1(raw.type, 20); if (!TYPES.includes(t)) v.err("type", "مصنع أو شركة ومورد / factory or company & supplier"); else out.type = t; }
  if ("gov" in raw && allowed.includes("gov")) { const g = line(raw.gov, 3).toUpperCase(); if (!GOV_CODES[g]) v.err("gov", "كود المحافظة / governorate code"); else out.gov = g; }
  if ("products" in raw && allowed.includes("products")) {
    const list = (Array.isArray(raw.products) ? raw.products : String(raw.products || "").split(/[،,\n]+/)).map(x => txt1(x, 81)).filter(Boolean);
    if (list.length > 30 || list.some(x => x.length > 80)) v.err("products", "≤ 30 منتج، كل واحد ≤ 80 حرف / ≤ 30 products of ≤ 80 characters");
    else if (list.some(x => hasContact(x, env))) v.err("products", CONTACT_MSG, "invalid_contact"); else out.products = list;
  }
  if ("website" in raw && allowed.includes("website")) { const w = line(raw.website, 500); if (w && !isHttps(w)) v.err("website", "رابط https / an https link"); else out.website = w; }
  if ("logo" in raw && allowed.includes("logo")) { const id = line(raw.logo, 40); if (id) { const r = await first(env, "SELECT id FROM cc_media WHERE id = ? AND owner_type = 'member' AND owner_id = ? AND status IN ('pending', 'public')", id, m.id); if (!r) v.err("logo", "صورة مش موجودة / unknown image", "invalid_image"); else out.logo = id; } else out.logo = ""; }
  if ("video" in raw && allowed.includes("video")) { const u = line(raw.video, 300); if (u && !(isHttps(u) && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(u))) v.err("video", "رابط يوتيوب / a YouTube link"); else out.video = u; }
  if ("social" in raw && allowed.includes("social")) { const s = raw.social && typeof raw.social === "object" ? raw.social : {}, o = {};
    for (const k of ["facebook", "x", "instagram", "linkedin", "youtube"]) if (s[k]) { const u = line(s[k], 300); if (!isHttps(u)) v.err("social." + k, "رابط https / an https link"); else o[k] = u; }
    out.social = o; }
  return out;
}
async function getCompany(env, m) {
  const listing = m.factory_ref ? await listingOf(env, m.factory_ref) : null;
  const requests = (await all(env, "SELECT id, kind, state, fields_json, reject_reason, factory_ref, created_at, updated_at FROM cc_company_requests WHERE member_id = ? ORDER BY created_at DESC LIMIT 50", m.id)).map(r => ({ id: r.id, kind: r.kind, state: r.state, factory_ref: r.factory_ref, fields: jget(r.fields_json, {}), reject_reason: r.reject_reason, created_at: r.created_at, updated_at: r.updated_at }));
  let hint = null;
  const leg = m.email ? (await all(env, "SELECT company, activity, web, email FROM cc_legacy_companies WHERE email_key = ? LIMIT 5", emailKey(m.email))).find(r => sameMailbox(r.email, m.email)) : null;
  if (leg) hint = { company: leg.company || "", activity: leg.activity || "", web: leg.web || "" };
  else { const p = jget(((await metaOf(env, m.id)) || {}).legacy_profile_json || "{}", {}); if (p && (p.act || p.web)) hint = { company: m.company || "", activity: p.act || "", web: p.web || "" }; }
  return { linked: !!m.factory_ref, listing, requests, allowed: allowedFields(m), legacy_hint: hint };
}
async function postCompany(req, env, m) {
  const b = await body(req);
  await needTables(env, "cc_company_requests", "cc_audit");
  const allowed = allowedFields(m);
  if (!allowed.length) fail(403, "plan", "ملف الشركة متاح من باقة «تسجيل بيانات الشركة» وطالع / the company profile needs a plan", { need: "profile" });
  const kind = line(b.kind, 10); if (!["edit", "claim", "create"].includes(kind)) fail(400, "invalid_kind", "kind must be edit, claim or create");
  if (await first(env, "SELECT id FROM cc_company_requests WHERE member_id = ? AND state = 'pending'", m.id)) fail(409, "open_request", "عندك طلب لسه بيتراجع — استنى رده أو اسحبه / you already have a request waiting for review");
  if (!(await rateOk(env, "mecomp|" + m.id, 20, 3600))) fail(429, "rate_limited", "too many requests, try again later");
  let ref = "";
  if (kind === "edit") { if (!m.factory_ref) fail(409, "link_required", "اربط حسابك بملف شركتك الأول / link your company profile first"); ref = m.factory_ref; }
  else {
    if (m.factory_ref) fail(409, "already_linked", "حسابك مربوط بملف شركة بالفعل / your account is already linked to a profile");
    if (kind === "claim") {
      ref = line(b.factory_ref, 60);
      if (!DIR_REF_RX.test(ref) || !(await refExists(env, ref))) fail(422, "invalid_factory_ref", "الملف ده مش موجود في الدليل / no such directory profile", { errors: [{ field: "factory_ref", msg: "unknown" }] });
      if (await first(env, "SELECT id FROM members WHERE factory_ref = ? AND id != ?", ref, m.id)) fail(409, "claimed", "الملف ده مربوط بحساب تاني — كلّمنا / this profile is linked to another account — contact us");
    }
  }
  const v = validator(), f = await companyFields(env, m, b.fields && typeof b.fields === "object" ? b.fields : {}, v, allowed);
  if (kind === "create") for (const k of ["name", "sector", "type", "gov"]) if (!f[k] && !v.errors.some(e => e.field === k)) v.err(k, "مطلوب / required");
  if (kind === "edit" && !Object.keys(f).length && !v.errors.length) v.err("fields", "مفيش تعديل / nothing to change");
  v.done();
  const id = "cr-" + rid(10), t = now();
  // ONE pending request per member, checked inside the insert itself (review F4: parallel requests cannot both pass the check above)
  await batch(env, [env.DB.prepare("INSERT INTO cc_company_requests (id, member_id, kind, factory_ref, fields_json, state, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 'pending', ?, ? WHERE NOT EXISTS (SELECT 1 FROM cc_company_requests WHERE member_id = ? AND state = 'pending')").bind(id, m.id, kind, ref, JSON.stringify(f), t, t, m.id),
    auditStmtIf(env, { ...actorOf(m), actor_role: "member", action: "member.company_request", target_type: "company_request", target_id: id, after: { kind, factory_ref: ref, fields: Object.keys(f) }, summary: `company ${kind}${ref ? " " + ref : ""}` }, "EXISTS (SELECT 1 FROM cc_company_requests WHERE id = ?)", [id])]);
  if (!(await first(env, "SELECT id FROM cc_company_requests WHERE id = ?", id))) fail(409, "open_request", "عندك طلب لسه بيتراجع — استنى رده أو اسحبه / you already have a request waiting for review");
  return { status: 201, body: { request: { id, kind, state: "pending", factory_ref: ref, fields: f, reject_reason: "", created_at: t } } };
}
async function withdrawRequest(env, m, id) {
  const r = await first(env, "SELECT * FROM cc_company_requests WHERE id = ? AND member_id = ?", line(id, 20), m.id);
  if (!r) fail(404, "not_found", "request not found");
  if (r.state !== "pending") fail(409, "state", "only a pending request can be withdrawn", { state: r.state });
  await batch(env, [env.DB.prepare("UPDATE cc_company_requests SET state = 'withdrawn', updated_at = ? WHERE id = ?").bind(now(), r.id),
    auditStmt(env, { ...actorOf(m), actor_role: "member", action: "member.company_withdraw", target_type: "company_request", target_id: r.id, before: { state: "pending" }, after: { state: "withdrawn" }, summary: "request withdrawn" })]);
  return { body: { ok: true } };
}

/* ---------- invoices («باقتي») ---------- */
async function myInvoices(env, m, CC) {
  if (CC && CC.payments && typeof CC.payments.memberInvoices === "function") { const r = await CC.payments.memberInvoices(env, m); return Array.isArray(r) ? { items: r } : r; }
  const rows = await all(env, "SELECT no, status, plan, plan_name, total_minor, currency, issued_at, paid_at, pay_token FROM cc_invoices WHERE test = 0 AND (member_id = ? OR (member_id = '' AND email_key = ?)) ORDER BY issued_at DESC LIMIT 100", m.id, emailKey(m.email || ""));
  return { items: rows.map(r => ({ no: r.no, status: r.status, plan: r.plan, plan_name: r.plan_name, total_minor: r.total_minor, currency: r.currency, issued_at: r.issued_at, paid_at: r.paid_at, pay_url: r.status === "open" ? payUrl(env, r.pay_token) : "" })) };
}
async function newInvoice(req, env, m, CC) {
  const b = await body(req), plan = canonPlan(b.plan);
  if (CC && CC.payments && typeof CC.payments.createMemberInvoice === "function") { // payments owns the checks (sellable, ≥ current, suspended, open invoice, 5/day)
    const r = await CC.payments.createMemberInvoice(env, m, line(b.plan, 20), CC, { replace: b.replace === true, gcc: b.gcc }); // gcc: the Premium states (an upgrade into Premium needs them)
    return { status: 201, body: { invoice: r && r.invoice ? r.invoice : r, ...(r && r.quote ? { quote: r.quote } : {}), ...(r && r.replaced ? { replaced: r.replaced } : {}),
      ...(r && r.gcc ? { gcc: r.gcc } : {}), ...(r && r.gcc_next ? { gcc_next: r.gcc_next } : {}) } }; // gcc = applied now (not chosen yet) · gcc_next = waits for this invoice
  }
  const d = await plansData(env), p = d.plans[plan];
  if (plan === "visitor" || !p || !p.sellable) fail(422, "invalid_plan", "اختار باقة متاحة / choose a plan that is on sale", { errors: [{ field: "plan", msg: "not on sale" }] });
  if (PLAN_LV[plan] < PLAN_LV[effPlan(m)]) fail(422, "invalid_plan", "الباقة لازم تكون نفس باقتك أو أعلى / choose your plan or a higher one", { errors: [{ field: "plan", msg: "lower than the current plan" }] });
  const open = await openInvoice(env, m);
  if (open) fail(409, "open_invoice", "عندك فاتورة مفتوحة / you already have an open invoice", { invoice: { no: open.no, total_minor: open.total_minor, pay_url: payUrl(env, open.pay_token) } });
  if (!CC || !CC.payments || typeof CC.payments.createMemberInvoice !== "function") fail(503, "pay_off", "بوابة الدفع لسه بتتجهّز / the payment module is not available yet");
  if (!(await rateOk(env, "meinv|" + m.id, 5, 86400))) fail(429, "rate_limited", "5 invoices per day", { limit: 5 });
  const r = await CC.payments.createMemberInvoice(env, m, plan, CC);
  const inv = r && r.invoice ? r.invoice : r;
  return { status: 201, body: { invoice: { no: inv && inv.no, total_minor: inv && inv.total_minor, pay_url: inv && (inv.pay_url || (inv.pay_token ? payUrl(env, inv.pay_token) : "")) } } };
}

/* ---------- GET / POST /api/me/gcc — the GCC states of a Premium member («باقتي», the dashboard prompt) ---------- */
const gccView = m => ({ gcc: gccOf(m), allowed: GCC });
async function postMyGcc(req, env, m) {
  const b = await body(req), g0 = gccOf(m);
  if (!g0.pick) fail(409, "gcc_locked", g0.all ? "باقتك بتغطي كل دول الخليج الست / your plan covers all 6 Gulf states" : "باقتك مافيهاش اختيار دول خليجية / your plan has no Gulf-state choice", { reason: "no_pick", gcc: g0 });
  if (!g0.pending) fail(409, "gcc_locked", "دولك متسجّلة بالفعل — لتغييرها كلّم فريق المنصة / your Gulf states are already set — contact the platform team", { reason: "chosen", gcc: g0 });
  if (!(await rateOk(env, "megcc|" + m.id, 10, 86400))) fail(429, "rate_limited", "محاولات كتير النهارده — جرّب بكرة / too many attempts today — try again tomorrow", { limit: 10 });
  const g = normGcc(b.gcc);
  if (g.length !== g0.pick) gccError(g0.pick, "member");
  const r = await setGcc(env, m.id, g, { src: "member", by: { actor_id: m.id, actor_email: m.email || "", actor_role: "member" } });
  return { body: { ok: true, ...gccView(r.member), rematched: r.rematched } };
}

/* ---------- GET /api/me/recognize (register.html pre-fill; e-mail-code sessions only) ---------- */
async function recognize(env, m, via) {
  if (via === "legacy" || !m.email_verified_at) fail(403, "use_email_code", "ادخل بكود على الإيميل الأول / sign in with an e-mail code first");
  const leg = (await all(env, "SELECT * FROM cc_legacy_companies WHERE email_key = ? ORDER BY updated_at DESC LIMIT 10", emailKey(m.email))).find(r => sameMailbox(r.email, m.email));
  if (leg) return { known: true, company: { company: leg.company || "", manager: leg.manager || "", phone: String(leg.phones || "").split(/\s*\|\s*/)[0] || "", address: leg.address || "", web: leg.web || "", activity: leg.activity || "", country: leg.country || "" } };
  const p = jget(((await metaOf(env, m.id)) || {}).legacy_profile_json || "{}", {});
  if (p && Object.keys(p).length) return { known: true, company: { company: m.company || "", manager: m.name || "", phone: m.phone || "", address: p.addr || "", web: p.web || "", activity: p.act || "", country: "" } };
  return { known: false, company: null };
}

/* ---------- router: /api/me/{account,products,company,media,invoices,recognize}[/*] ---------- */
export async function handleMeCC(req, env, ctx, CC) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/me/, "").replace(/\/+$/, "") || "/", M = req.method;
  try {
    if (!env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    const m = await authUser(req, env);
    if (!m) return ccErr(req, env, 401, "unauthorized", "sign in required");
    const via = await sessionVia(env, m);
    if (M !== "GET" && isLinkSession(m)) return ccErr(req, env, 403, "full_login_required", "signed in by an e-mail link: sign in with an e-mail code to do this", { login: "code" });
    const send = r => ccJson(req, env, r.body !== undefined ? r.body : r, r.status || 200);
    let x;
    if (path === "/account") return M === "GET" ? ccJson(req, env, await account(env, m, via, CC)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/recognize") return M === "GET" ? ccJson(req, env, await recognize(env, m, via)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/products") return M === "GET" ? ccJson(req, env, await listProducts(env, m)) : M === "POST" ? send(await createProduct(req, env, m)) : ccErr(req, env, 405, "method", "method not allowed");
    if ((x = path.match(/^\/products\/(p-[a-z0-9]{8})$/))) return M === "PATCH" ? send(await patchProduct(req, env, m, x[1])) : M === "DELETE" ? send(await hideOrDelete(env, m, x[1], CC, "delete")) : ccErr(req, env, 405, "method", "method not allowed");
    if ((x = path.match(/^\/products\/(p-[a-z0-9]{8})\/submit$/))) return M === "POST" ? send(await submitProduct(env, m, x[1])) : ccErr(req, env, 405, "method", "method not allowed");
    if ((x = path.match(/^\/products\/(p-[a-z0-9]{8})\/hide$/))) { if (M !== "POST") return ccErr(req, env, 405, "method", "method not allowed"); const b = await body(req); return send(await hideOrDelete(env, m, x[1], CC, "hide", b.hidden !== false)); }
    if (path === "/media") {
      if (M !== "POST") return ccErr(req, env, 405, "method", "method not allowed");
      if (!planCanX(m, "listing") && planLimitX(m, "products") === 0) return ccErr(req, env, 403, "plan", "رفع الصور متاح للباقات اللي فيها ملف شركة أو منتجات / uploads need a plan with a listing or products", { need: "plan" });
      // the 10 uploads / hour / member limit is applied by content.js handleMemberMedia (same key "memedia|<id>") — not counted twice here
      if (!CC || !CC.content || typeof CC.content.handleMemberMedia !== "function") return ccErr(req, env, 503, "media_off", "رفع الصور محتاج تفعيل R2 / uploads are not available yet");
      return CC.content.handleMemberMedia(req, env, ctx, m);
    }
    if (path === "/company") return M === "GET" ? ccJson(req, env, await getCompany(env, m)) : M === "POST" ? send(await postCompany(req, env, m)) : ccErr(req, env, 405, "method", "method not allowed");
    if ((x = path.match(/^\/company\/requests\/(cr-[a-z0-9]{10})$/))) return M === "DELETE" ? send(await withdrawRequest(env, m, x[1])) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/invoices" && M === "POST" && await appBuyOff(env, req)) return ccErr(req, env, 403, "app_buy_off", APP_BUY_OFF_MSG); // store rules: buying off inside that app
    if (path === "/invoices") return M === "GET" ? ccJson(req, env, await myInvoices(env, m, CC)) : M === "POST" ? send(await newInvoice(req, env, m, CC)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/gcc") return M === "GET" ? ccJson(req, env, gccView(m)) : M === "POST" ? send(await postMyGcc(req, env, m)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/invoices/quote") { // «باقتي»: the amount and the resulting end date before the invoice is issued (Terms §5, review PAY-H1)
      if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed");
      if (!CC || !CC.payments || typeof CC.payments.memberQuote !== "function") return ccErr(req, env, 503, "pay_off", "the payment module is not available yet");
      return ccJson(req, env, await CC.payments.memberQuote(env, m, line(url.searchParams.get("plan"), 20)));
    }
    return ccErr(req, env, 404, "not_found", "not found");
  } catch (e) {
    if (e && e.status) return errOf(req, env, e);
    console.error("me-cc error", e && e.stack || e);
    return ccErr(req, env, 500, "server", "server error");
  }
}
export { jparse, iso, hex, isEmail };
