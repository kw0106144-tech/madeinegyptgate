/* Team dashboards (ACC-CONTRACT §12): the data / front-desk team (role "data", data-desk.html) enters walk-in client orders, registers
   members by hand and adds tenders / projects / RFQs; owner and admin can do the same. The SEO team (role "seo") has NO access here.
   GET  /api/team/whoami              → {user, role, team_page, perms}        (any staff role; 403 without one)
   POST /api/team/desk/inquiry        → {ok, ref, status, routed}             the SAME create + automatic routing path as POST /api/inquiries
   POST /api/team/desk/member         → 201 {ok, member_id, status}           pending + requested plan; welcome / sign-in e-mail; 409 duplicate;
                                                                               gcc: the GCC states for a Premium request (exactly gcc_pick, 422)
   POST /api/team/desk/content        → 201 {ok, id, state}                   published with a source, else a draft for the admins
   GET  /api/team/desk/mine?kind=&page= → {items, total, page, limit}         only the caller's own entries (from the audit log)
   GET  /api/team/desk/knowledge?status= → {items, total, counts}              0009 «بنك المعلومات» (default «محتاجة إجابة»)
   PUT  /api/team/desk/knowledge/:id {answer?, status?} → {ok, item}           the team's answer / approval (cc_audit row)
   GET  /api/team/desk/leads?status=&type=&market=&q=&sort=&page=&limit= → {items, total, page, limit, counts, by_type}
                                                                               0012 «🌐 فرص من الإنترنت» (web-leads.js; default new; off without 0012)
   PUT  /api/team/desk/leads/:id {status: accepted|rejected|new, reason?, note?, content_id?} → {ok, item}   one cc_audit row (503 leads_off)
   POST /api/team/desk/content {…, lead_id?}  a lead turned into content: the lead is linked (accepted + content_id, audited leads.convert),
                                              best effort — the answer says lead_linked: true | false
   GET  /api/team/desk/research?state=&kind=&page=  → {items, total}                0014 «🔎 أبحاث جنة وباسم» (research.js; off without 0014)
   GET  /api/team/desk/research/:id → {job, doc, sources (INTERNAL), dropped, params, model, tokens, neurons, web_units} — private writing
                                       kinds (quote, posts, e-mails, translations, profiles) readable by owner / admin only, audited research.read
   PUT  /api/team/desk/research/:id {hide_items?, unhide_items?, hide_doc?, note?} → audited research.review (the document re-reads at once)
   Every write: rate limit per team member + one cc_audit row with the team member's e-mail. */
import { line, str, now, hex, isEmail, team, adminEmails, canonPlan, PLAN_LV, effPlan, membersByMailbox, rateOk, ipHash, safeEq, GOV_CODES, cairoDay, gccPick, normGcc } from "./common.js";
import { authUser, isLinkSession } from "./auth.js";
import { trackUrl } from "./inquiries.js";
import { e164 } from "./whatsapp.js";
import { ccJson, ccErr, ccPreflight, fail, body, all, first, allIn, needTables, batch, auditStmt, audit, auditDone, roleOf, sessionVia, ROLE_PERMS, TEAM_ROLES, CC_PAGE, DESK_PERMS, errOf,
  txt, txt1, isHttps, urlOk, hasContact, CONTACT_MSG, validator, dateOk, DIR_REF_RX, refExists, factoryNames, sendTpl, loginUrl, maskEmail, paging } from "./acc-base.js";
import { metaUpsert, metaOf } from "./acc-members.js";
import { internalInquiry } from "./acc-orders.js";
import { plansData } from "./acc-plans.js";
import { listKnowledge, answerKnowledge } from "./knowledge.js"; // 0009: «بنك المعلومات» on the data desk
import { listLeads, reviewLead, linkLead } from "./web-leads.js";
import * as RESEARCH from "./research.js"; // 0014: «🔎 أبحاث جنة وباسم» on the data desk // 0012: «🌐 فرص من الإنترنت» on the data desk

const DESK_ROLES = new Set(["data", "admin", "manager", "owner"]);
const COLL = { tenders: "tend", projects: "proj", rfqs: "rfq" };
const LIMITS = { inquiry: [60, 3600], member: [30, 3600], content: [60, 3600], mine: [600, 3600], leads: [300, 3600] };

async function teamAuth(req, env) {
  const m = await authUser(req, env);
  if (!m) fail(401, "unauthorized", "sign in required");
  const via = await sessionVia(env, m);
  if (via === "legacy") fail(403, "use_email_code", "الحساب ده لازم يدخل بكود على الإيميل / sign in with an e-mail code");
  if (isLinkSession(m)) fail(403, "full_login_required", "sign in with an e-mail code", { login: "code" });
  const role = await roleOf(env, m, via);
  return { m, role, actor: { actor_id: m.id, actor_email: m.email || "", actor_role: role || "" } };
}
const needDesk = a => { if (!a.role || !DESK_ROLES.has(a.role)) fail(403, "forbidden", "مكتب الاستقبال لفريق الداتا والإدارة بس / the front desk is for the data team and the admins", { need: "data", role: a.role || "" }); };
async function limit(env, a, kind) { const [n, w] = LIMITS[kind]; if (!(await rateOk(env, `desk${kind}|${a.m.id}`, n, w))) fail(429, "rate_limited", "محاولات كتير — جرّب بعد شوية / too many entries, try again later", { limit: n, window_s: w }); }

/* ---------- (a) walk-in client order ---------- */
async function deskInquiry(req, env, ctx, a) {
  const b = await body(req), v = validator(), buyer = b.buyer && typeof b.buyer === "object" ? b.buyer : {};
  const name = line(buyer.name, 120), company = line(buyer.company, 160), phone = line(buyer.phone, 30), email = line(buyer.email, 254).toLowerCase(), gov = line(buyer.governorate, 60), btype = line(buyer.type, 20);
  const product = line(b.product, 300), quantity = line(b.quantity, 60), unit = line(b.unit, 20), details = str(b.details || "", 4000), deadline = line(b.deadline, 10), target = line(b.target_company_ref, 60);
  if (name.length < 2) v.err("buyer.name", "اسم العميل مطلوب / client name required");
  if (!phone) v.err("buyer.phone", "رقم الموبايل مطلوب / phone required"); else if (!/^\+?[\d\s()-]{6,30}$/.test(phone)) v.err("buyer.phone", "رقم غير صحيح / invalid phone");
  if (email && !isEmail(email)) v.err("buyer.email", "إيميل غير صحيح / invalid e-mail");
  if (!product) v.err("product", "المنتج مطلوب / product required");
  if (!quantity) v.err("quantity", "الكمية مطلوبة / quantity required");
  if (deadline && !dateOk(deadline)) v.err("deadline", "التاريخ YYYY-MM-DD / date YYYY-MM-DD");
  if (target && (!DIR_REF_RX.test(target) || !(await refExists(env, target)))) v.err("target_company_ref", "الشركة دي مش موجودة في الدليل / unknown directory company");
  v.done();
  await needTables(env, "cc_audit");
  await limit(env, a, "inquiry");
  const to = email || team(env) || adminEmails(env)[0] || a.m.email;
  if (!isEmail(to)) fail(503, "email_off", "no e-mail for the request: set TEAM_EMAIL");
  const govCode = GOV_CODES[gov.toUpperCase()] ? gov.toUpperCase() : gov;
  const tname = target ? (await factoryNames(env, [target])).get(target) || "" : "";
  const aid = await audit(env, { ...a.actor, action: "desk.inquiry", target_type: "inquiry", target_id: "", summary: `walk-in order: ${product}`, after: { product, quantity, buyer: maskEmail(email) || "(no e-mail)", target }, ip_hash: await ipHash(req, env) });
  const r = await internalInquiry(env, ctx, { kind: "rfq", name, company, email: to, phone, message: details || `${product} — ${quantity}${unit ? " " + unit : ""}`,
    ...(target ? { target_type: "factory", target_id: target, target_name: tname } : {}),
    payload: { product, quantity: [quantity, unit].filter(Boolean).join(" "), governorate: govCode, deadline, buyer_type: btype, channel: "walk-in", via_team: !email, created_by: a.m.email || a.m.id }, lang: "ar" }, { actor: a.m.id, source: "desk" });
  if (r.status !== 201 && r.status !== 200) { await auditDone(env, aid, { summary: `walk-in order refused: ${r.body.code || r.status}` }); fail(r.status, r.body.code || "invalid", r.body.error || "the request was refused", r.body); }
  await auditDone(env, aid, { target_id: r.body.ref, after: { ref: r.body.ref, status: r.body.status, routed: r.body.routed } });
  return { status: 201, body: { ok: true, ref: r.body.ref, status: r.body.status, routed: r.body.routed, receipt_to: email ? "buyer" : "team" } };
}

/* ---------- (b) manual member registration ---------- */
async function deskMember(req, env, ctx, a, CC) {
  const b = await body(req), v = validator();
  const company = line(b.company, 160), cname = line(b.contact_name, 120), title = line(b.title, 40), email = line(b.email, 254).toLowerCase(), phone = line(b.phone, 30), sector = line(b.sector, 160), gov = line(b.governorate, 60), products = str(b.products || "", 1000).replace(/\s+/g, " ");
  const plan = canonPlan(b.requested_plan), d = await plansData(env);
  if (company.length < 2) v.err("company", "اسم الشركة مطلوب / company name required");
  if (cname.length < 2) v.err("contact_name", "اسم المسؤول مطلوب / contact name required");
  if (!isEmail(email)) v.err("email", "إيميل صحيح مطلوب / a valid e-mail is required");
  const ph = e164(phone); if (!ph) v.err("phone", "رقم الموبايل مطلوب وصحيح / a valid phone is required");
  if (!sector) v.err("sector", "النشاط مطلوب / sector required");
  if (!gov) v.err("governorate", "المحافظة مطلوبة / governorate required");
  if (plan === "visitor" || !d.plans[plan] || !d.plans[plan].sellable) v.err("requested_plan", "اختار باقة متاحة / choose a plan that is on sale");
  const pick = plan === "visitor" ? 0 : gccPick(plan), gcc = pick ? normGcc(b.gcc) : []; // Premium: the GCC states the client picks (stored on the new member, src desk)
  if (pick && gcc.length !== pick) v.err("gcc", `اختار ${pick} دول خليجية للعميل / pick ${pick} Gulf states for this client`, "gcc_required");
  v.done();
  await needTables(env, "cc_member_meta", "cc_audit");
  const dup = (await membersByMailbox(env, email)).sort((x, y) => (y.verified || 0) - (x.verified || 0))[0];
  if (dup) {
    const meta = (await metaOf(env, dup.id)) || {};
    fail(409, "exists", "الإيميل ده عليه حساب بالفعل / this e-mail already has an account", { member: { member_id: dup.id, company: dup.company || "", status: meta.status || "active", plan: effPlan(dup), requested_plan: meta.requested_plan || "", since: String(dup.created_at || "").slice(0, 10) } });
  }
  await limit(env, a, "member");
  const id = "u" + hex(8), t = now(), govCode = GOV_CODES[gov.toUpperCase()] ? gov.toUpperCase() : gov;
  const prefs = gcc.length ? JSON.stringify({ gcc, gcc_src: "desk", gcc_at: t }) : "{}";
  await batch(env, [
    env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, name, title, phone, sector, governorate, products, prefs_json) VALUES (?, ?, ?, 'visitor', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, company, email, t, t, cname, title, ph, sector, govCode, products, prefs),
    metaUpsert(env, id, { status: "pending", requested_plan: plan, source: "desk", notes: `سجّله ${a.m.email || a.m.id} من مكتب الاستقبال / registered at the front desk` }, t),
    auditStmt(env, { ...a.actor, action: "desk.member", target_type: "member", target_id: id, summary: `front-desk registration ${maskEmail(email)} → ${plan} (pending)${gcc.length ? " · " + gcc.join(",") : ""}`, after: { email: maskEmail(email), company, requested_plan: plan, status: "pending", ...(gcc.length ? { gcc } : {}) }, ip_hash: await ipHash(req, env) }),
  ]);
  const welcome = await sendTpl(env, CC, "member_invite", email, { name: cname, company, login_url: loginUrl(env) }, { idTail: id + "-" + hex(3) });
  let invoice = null;
  try {
    if (CC && CC.payments && typeof CC.payments.issueInvoice === "function") {
      const r = await CC.payments.issueInvoice(env, { member_id: id, email, company, plan, source: "admin", by: a.m.email || a.m.id, send: true }, CC);
      const inv = r && r.invoice ? r.invoice : r; if (inv && inv.no) invoice = { no: inv.no, total_minor: inv.total_minor };
    }
  } catch (e) { invoice = { error: (e && e.code) || "invoice_error" }; }
  return { status: 201, body: { ok: true, member_id: id, status: "pending", requested_plan: plan, ...(gcc.length ? { gcc } : {}), welcome_sent: !!welcome.sent, invoice } };
}

/* ---------- (c–e) tenders / projects / RFQs ---------- */
async function deskContent(req, env, ctx, a, CC) {
  const b = await body(req), coll = COLL[line(b.collection, 20)];
  if (!coll) fail(400, "invalid_collection", "collection must be tenders, projects or rfqs");
  const item = b.item && typeof b.item === "object" && !Array.isArray(b.item) ? b.item : null;
  if (!item) fail(400, "item_required", "item: the fields of the record");
  const src = line(b.source_url || item.source_url || "", 500);
  if (src && !(isHttps(src) || urlOk(src))) fail(422, "invalid_url", "المصدر لازم يكون رابط https / the source must be an https link", { errors: [{ field: "source_url", msg: "https" }] });
  if (!CC || !CC.content || typeof CC.content.upsert !== "function") fail(503, "content_off", "the content module is not available");
  await needTables(env, "cc_audit");
  await limit(env, a, "content");
  const ih = await ipHash(req, env);
  if (typeof CC.content.deskCreate === "function") { // content.js validates, stores (source "desk", created_by), publishes with a source and writes the desk.content audit row through our callback
    const auditFn = (action, type, id, before, after, summary) => audit(env, { ...a.actor, action, target_type: type, target_id: id, before, after, summary, ip_hash: ih });
    const r = await CC.content.deskCreate(env, line(b.collection, 20), item, { by: a.m.email, source_url: b.source_url, document: b.document, audit: auditFn, actor_id: a.m.id, actor_role: a.role, ip_hash: ih, CC });
    const lead = b.lead_id != null && b.lead_id !== "" && r && r.id ? { lead_linked: await linkLead(env, a.actor, b.lead_id, r.id, { ipHash: ih }) } : {};
    return { status: 201, body: { ok: true, id: r.id, state: r.state, ref: r.ref || "", link: r.link || "", published_v: r.published_v || null, ...(r.publish_error ? { publish_error: r.publish_error } : {}), ...(r.warnings && r.warnings.length ? { warnings: r.warnings } : {}), ...lead } };
  }
  const fields = { ...item }; delete fields.source_url;
  let priv;
  if (coll === "rfq") { priv = { ...(src ? { source_url: src } : {}), entered_by: a.m.email || a.m.id }; for (const k of ["client", "phone", "email", "channel"]) if (k in fields) { priv[k] = line(fields[k], 254); delete fields[k]; } }
  else if (src) fields.source_url = src;
  const publish = !!src, by = a.m.email || a.m.id;
  const aid = await audit(env, { ...a.actor, action: "desk.content", target_type: "content", target_id: "", summary: `front desk: ${b.collection} (${publish ? "publish" : "draft"})`, after: { collection: coll, publish }, ip_hash: ih });
  let r;
  try { r = await CC.content.upsert(env, { coll, kind: "add", fields, ...(priv ? { private: priv } : {}), publish, by, source: "admin" }); }
  catch (e) { await auditDone(env, aid, { summary: `front desk ${b.collection} refused: ${(e && e.code) || "error"}` }); if (e && e.status) fail(e.status, e.code || "invalid", e.message || e.code, e.errors ? { errors: e.errors } : undefined); throw e; }
  const id = r && r.item ? r.item.id : "", state = publish ? "published" : "draft";
  await auditDone(env, aid, { target_id: id, after: { collection: coll, id, state, published_v: (r && r.published_v) || null } });
  const lead = b.lead_id != null && b.lead_id !== "" && id ? { lead_linked: await linkLead(env, a.actor, b.lead_id, id, { ipHash: ih }) } : {};
  return { status: 201, body: { ok: true, id, state, published_v: (r && r.published_v) || null, ...lead } };
}

/* ---------- (f) «إدخالاتي» ---------- */
async function deskMine(env, url, a, CC) {
  const cmap = new Map();
  if (CC && CC.content && typeof CC.content.deskMine === "function") { try { const r = await CC.content.deskMine(env, a.m.email, { limit: 500 }); for (const it of (r && r.items) || []) cmap.set(it.id, it); } catch (e) { console.error("deskMine", e && e.message); } }
  const kind = line(url.searchParams.get("kind"), 10), { page, limit: lim, offset } = paging(url, 50, 100);
  const actions = kind === "inquiry" ? ["desk.inquiry"] : kind === "member" ? ["desk.member"] : kind === "content" ? ["desk.content"] : ["desk.inquiry", "desk.member", "desk.content"];
  const ph = actions.map(() => "?").join(", ");
  const total = ((await first(env, `SELECT COUNT(*) AS n FROM cc_audit WHERE actor_id = ? AND action IN (${ph}) AND target_id != ''`, a.m.id, ...actions)) || {}).n || 0;
  const rows = await all(env, `SELECT id, at, action, target_type, target_id, summary FROM cc_audit WHERE actor_id = ? AND action IN (${ph}) AND target_id != '' ORDER BY id DESC LIMIT ? OFFSET ?`, a.m.id, ...actions, lim, offset);
  const inq = new Map((await allIn(env, p => `SELECT ref, kind, status, routed_count, replies_count, created_at FROM inquiries WHERE ref IN (${p})`, rows.filter(r => r.action === "desk.inquiry").map(r => r.target_id))).map(r => [r.ref, r]));
  const mem = new Map((await allIn(env, p => `SELECT id, company, plan, plan_expires, created_at FROM members WHERE id IN (${p})`, rows.filter(r => r.action === "desk.member").map(r => r.target_id))).map(r => [r.id, r]));
  const metas = new Map((await allIn(env, p => `SELECT member_id, status, requested_plan FROM cc_member_meta WHERE member_id IN (${p})`, [...mem.keys()])).map(r => [r.member_id, r]));
  const con = new Map((await allIn(env, p => `SELECT id, coll, state, hidden, deleted, live_json, draft_json FROM cc_content WHERE id IN (${p})`, rows.filter(r => r.action === "desk.content").map(r => r.target_id))).map(r => [r.id, r]));
  const items = [];
  for (const r of rows) {
    if (r.action === "desk.inquiry") { const i = inq.get(r.target_id); items.push({ kind: "inquiry", at: r.at, ref: r.target_id, status: i ? i.status : "unknown", routed: i ? i.routed_count : 0, replies: i ? i.replies_count : 0, summary: r.summary, link: i ? await trackUrl(env, i.ref) : "" }); }
    else if (r.action === "desk.member") { const m = mem.get(r.target_id), mm = metas.get(r.target_id) || {}; items.push({ kind: "member", at: r.at, ref: r.target_id, status: m ? mm.status || "active" : "removed", company: m ? m.company : "", plan: m ? effPlan(m) : "visitor", requested_plan: mm.requested_plan || "", summary: r.summary, link: "" }); }
    else { const d = cmap.get(r.target_id), c = con.get(r.target_id), f = c ? (JSON.parse(c.live_json || "null") || JSON.parse(c.draft_json || "{}")) : {};
      items.push(d ? { kind: "content", at: r.at, ref: d.ref || r.target_id, id: d.id, collection: d.collection || d.coll, status: d.state, status_ar: d.state_ar || "", status_en: d.state_en || "", reject_reason: d.reject_reason || "", title: d.title || "", summary: r.summary, link: d.link || "" }
        : { kind: "content", at: r.at, ref: r.target_id, id: r.target_id, collection: c ? c.coll : "", status: c ? (c.deleted ? "deleted" : c.hidden ? "hidden" : c.state) : "unknown", title: line(f.title || f.name || f.title_ar || "", 160), summary: r.summary, link: "" }); }
  }
  return { items, total, page, limit: lim };
}

export async function handleTeam(req, env, ctx, CC) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/team/, "").replace(/\/+$/, "") || "/", M = req.method;
  try {
    if (!env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    if (req.headers.get("X-Platform-Key") && env.PLATFORM_KEY && safeEq(req.headers.get("X-Platform-Key"), env.PLATFORM_KEY)) return ccErr(req, env, 403, "forbidden", "the team pages need a person, not the platform key");
    const a = await teamAuth(req, env);
    const send = r => ccJson(req, env, r.body, r.status || 200);
    if (path === "/whoami") {
      if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed");
      if (!a.role) return ccErr(req, env, 403, "forbidden", "غير مصرّح لك / not a team member");
      return ccJson(req, env, { user: { id: a.m.id, email: a.m.email, name: a.m.name || "" }, role: a.role, team_page: TEAM_ROLES[a.role] || CC_PAGE, perms: ROLE_PERMS[a.role] || [], desk: DESK_ROLES.has(a.role), seo: ["seo", "editor", "admin", "manager", "owner"].includes(a.role) });
    }
    if (!/^\/desk\//.test(path)) return ccErr(req, env, 404, "not_found", "not found");
    needDesk(a);
    if (path === "/desk/inquiry") return M === "POST" ? send(await deskInquiry(req, env, ctx, a)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/desk/member") return M === "POST" ? send(await deskMember(req, env, ctx, a, CC)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/desk/content") return M === "POST" ? send(await deskContent(req, env, ctx, a, CC)) : ccErr(req, env, 405, "method", "method not allowed");
    if (path === "/desk/mine") { if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "mine"); return ccJson(req, env, await deskMine(env, url, a, CC)); }
    /* 0009 «بنك المعلومات»: the questions Janna / Bassem could not answer («محتاجة إجابة») — list, answer (one cc_audit row each) */
    if (path === "/desk/knowledge") { if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "mine"); return ccJson(req, env, await listKnowledge(env, url)); }
    /* 0012 «🌐 فرص من الإنترنت»: what Janna / Bassem found on the web — list, accept / reject (one cc_audit row each) */
    if (path === "/desk/leads") { if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "leads"); return ccJson(req, env, await listLeads(env, url)); }
    const lm = /^\/desk\/leads\/(\d{1,12})$/.exec(path);
    if (lm) { if (M !== "PUT") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "leads"); return ccJson(req, env, await reviewLead(env, a.actor, Number(lm[1]), await body(req, 8192), { ipHash: await ipHash(req, env), reqId: line(req.headers.get("cf-ray") || "", 40) })); }
    /* 0014 «🔎 أبحاث جنة وباسم»: the deep research jobs — the document as the customer sees it + its INTERNAL sources and the checker's
       removals (research.js); private writing kinds' text only for owner / admin (audited); hide an item / the document (one cc_audit row) */
    if (path === "/desk/research") { if (M !== "GET") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "leads"); return ccJson(req, env, await RESEARCH.deskList(env, url)); }
    const rm = /^\/desk\/research\/(rj[0-9a-z]{20})$/.exec(path);
    if (rm) {
      await limit(env, a, "leads");
      if (M === "GET") {
        const r = await RESEARCH.deskGet(env, rm[1], a.role); if (!r) return ccErr(req, env, 404, "not_found", "not found");
        if (r.private && r.readable) await audit(env, { ...a.actor, action: "research.read", target_type: "research", target_id: rm[1], summary: "read a private research document (" + r.job.kind + ")" });
        return ccJson(req, env, r);
      }
      if (M !== "PUT") return ccErr(req, env, 405, "method", "method not allowed");
      const u = await RESEARCH.deskPut(env, rm[1], await body(req, 8192), a.actor); if (!u) return ccErr(req, env, 404, "not_found", "not found");
      await batch(env, [u.stmt, auditStmt(env, { ...a.actor, action: "research.review", target_type: "research", target_id: rm[1], before: u.before, after: u.after, summary: "research review: " + u.after.team_state + " · hidden " + u.after.hidden.length })]);
      return ccJson(req, env, { ok: true, ...(await RESEARCH.deskGet(env, rm[1], a.role)) });
    }
    const km = /^\/desk\/knowledge\/(\d{1,12})$/.exec(path);
    if (km) { if (M !== "PUT") return ccErr(req, env, 405, "method", "method not allowed"); await limit(env, a, "content"); return ccJson(req, env, await answerKnowledge(env, a.actor, km[1], await body(req), { ipHash: await ipHash(req, env), reqId: line(req.headers.get("cf-ray") || "", 40) })); }
    return ccErr(req, env, 404, "not_found", "not found");
  } catch (e) {
    if (e && e.status) return errOf(req, env, e);
    console.error("team error", e && e.stack || e);
    return ccErr(req, env, 500, "server", "server error");
  }
}
export { DESK_PERMS, txt, txt1, cairoDay, PLAN_LV };
