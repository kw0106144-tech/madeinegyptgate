/* Control Center — members (accounts & subscriptions), setPlan (admin.js setMember semantics), customers (buyers, computed from
   inquiries), staff (admins & roles) and the Bassem monitor. ACC-CONTRACT §3.1.3, §3.1.4, §3.1.11, §8.1–§8.2. */
import { line, str, now, iso, hex, isEmail, canonPlan, PLAN_LV, effPlan, userOut, prefsOut, cairoDay, resubscribe, membersByMailbox, sameMailbox, hmac, secretOf, jparse, rateOk, site,
  GCC, gccPick, normGcc, gccNextOf } from "./common.js";
import { rematchForMember, inquiryListItem } from "./inquiries.js";
import { e164 } from "./whatsapp.js";
import { cairoToUtc } from "./meetings.js";
import { fail, HttpErr, body, paging, likeOf, all, first, countOf, allIn, hasTable, needTables, batch, auditStmt, actorOf, changed, csvText, csvRes, jget, dateOk, maskEmail,
  isBootstrap, adminList, MEMBER_ROLE, ROLES, ADMIN_GRANTS, TEAM_ROLES, factoryNames, refExists, DIR_REF_RX, sendTpl, loginUrl, validator, dayStartIso, dayAfterIso } from "./acc-base.js";
import { planCanX, plansWithX } from "./acc-plans.js";
import { kbEraseStmts } from "./knowledge.js";                                // 0009: the legal erasure of «بنك المعلومات» entries (review 2026-11-19 #11)

const PLANS = ["visitor", "profile", "basic", "premium", "partner", "strategic"];
const STATUSES = ["active", "pending", "suspended"];
const META_COLS = new Set(["status", "requested_plan", "suspended_plan", "suspended_expires", "source", "legacy_id", "legacy_status", "legacy_plan", "legacy_plan_until", "legacy_last_login", "legacy_profile_json", "legacy_login_off", "imported_hash", "tags", "notes"]);
/* INSERT … ON CONFLICT upsert of cc_member_meta (whitelisted columns only) */
export function metaUpsert(env, memberId, fields, t = now()) {
  const cols = Object.keys(fields).filter(c => META_COLS.has(c));
  if (!cols.length) return env.DB.prepare("INSERT INTO cc_member_meta (member_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET updated_at = excluded.updated_at").bind(memberId, t, t);
  return env.DB.prepare(`INSERT INTO cc_member_meta (member_id, ${cols.join(", ")}, created_at, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?) ON CONFLICT(member_id) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(", ")}, updated_at = excluded.updated_at`)
    .bind(memberId, ...cols.map(c => fields[c]), t, t);
}
export const metaOf = (env, id) => first(env, "SELECT * FROM cc_member_meta WHERE member_id = ?", id);
const memberById = (env, id) => env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(String(id || "")).first();
/* review F2: «only the owner can change an owner or an admin» holds for the ACCOUNT, not only for its staff row — a bootstrap owner
   (ADMIN_EMAILS, also before the mailbox is confirmed), an owner / admin cc_staff row (also a disabled one) or the legacy flag
   members.role = 'admin'. → the protected role, or "" */
export async function protectedRole(env, m) {
  if (!m) return "";
  if (isBootstrap(env, { ...m, email_verified_at: m.email_verified_at || "x" })) return "owner";
  const s = await first(env, "SELECT role FROM cc_staff WHERE member_id = ?", m.id);
  if (s && (s.role === "owner" || s.role === "admin")) return s.role;
  return m.role === "admin" ? "admin" : "";
}
/* plan / status / extend / invite / sessions / profile changes on an owner's or an admin's account: the owner only */
async function guardTarget(env, adm, m) {
  if (adm && adm.role === "owner") return;
  const r = await protectedRole(env, m);
  if (r) fail(403, "owner_only", "ده حساب مالك أو مدير — التعديل عليه للمالك بس / this is an owner's or an admin's account: only the owner can change it", { need: "owner", target_role: r });
}
/* admin form date "YYYY-MM-DD" → the Cairo end of that day (ISO); "" → no expiry */
export function untilIso(d) {
  const s = line(d, 40); if (!s) return "";
  if (dateOk(s)) { const ms = cairoToUtc(s, "23:59"); return ms == null ? null : new Date(ms).toISOString(); }
  const ms = Date.parse(s); return isNaN(ms) ? null : new Date(ms).toISOString();
}
const cairoDate = isoStr => (isoStr && !isNaN(Date.parse(isoStr)) ? cairoDay(Date.parse(isoStr)) : "");

/* ---------- setPlan — the ONLY way a plan changes (panel, payments, import, legacy bridge); admin.js setMember() semantics ----------
   canonPlan · verified = 1 · activated_at = now when the new plan is basic+ and the member was below basic / had no activated_at / had
   no plan in force · plan_expires ISO or '' (undefined = unchanged) · events member_set · cc_member_meta active · cc_audit (atomic) ·
   rematchForMember when the plan in force is ≥ basic (rematch:false for the import: it never routes).
   gcc (optional): the member's GCC states (members.prefs_json.gcc, gcc_src, gcc_at) in the same batch — never clears a stored list; a plan
   whose members pick none keeps the stored list unused (history). The states that were waiting for an invoice (prefs_json.gcc_next,
   payments.js) are dropped when that invoice (`invoiceNo`) is activated — applied by the caller through `gcc`, or not (a choice already in
   force) — and whenever other states are applied here. */
export async function setPlan(env, { memberId, plan, expires, by, reason = "", invoiceNo = "", rematch = true, audit = true, ip_hash = "", req_id = "", gcc, gcc_src = "admin" } = {}) {
  await needTables(env, "cc_member_meta", "cc_audit");
  const m = await memberById(env, memberId);
  if (!m) throw new HttpErr(404, "not_found", "member not found");
  const p = canonPlan(plan), t = now(), meta = await metaOf(env, m.id);
  const prefs = rawPrefs(m), g0 = normGcc(prefs.gcc), g1 = gcc == null ? [] : normGcc(gcc), gccNew = g1.length && g1.join() !== g0.join();
  const nx = gccNextOf(m), dropNext = !!(nx && ((invoiceNo && nx.inv === invoiceNo) || gccNew)); // that invoice is paid, or other states apply now
  const set = { plan: p, verified: 1 };
  if (PLAN_LV[p] >= PLAN_LV.basic && (PLAN_LV[canonPlan(m.plan)] < PLAN_LV.basic || !m.activated_at || effPlan(m) === "visitor")) set.activated_at = t;
  if (expires !== undefined) set.plan_expires = expires && !isNaN(Date.parse(expires)) ? new Date(Date.parse(expires)).toISOString() : "";
  const wasSuspended = !!(meta && meta.status === "suspended");
  if (wasSuspended) set.inbox_paused = 0;
  const cols = Object.keys(set), act = actorOf(by);
  const before = { plan: m.plan, plan_expires: m.plan_expires, status: (meta && meta.status) || "active", requested_plan: (meta && meta.requested_plan) || "", gcc: g0 };
  const after = { plan: p, plan_expires: set.plan_expires !== undefined ? set.plan_expires : m.plan_expires, status: "active", requested_plan: "", gcc: gccNew ? g1 : g0 };
  const d = changed(before, after);
  if (gccNew || dropNext) {
    const np = gccNew ? { ...prefs, gcc: g1, gcc_src: GCC_SRC.includes(gcc_src) ? gcc_src : "admin", gcc_at: t } : { ...prefs };
    if (dropNext) delete np.gcc_next;
    set.prefs_json = JSON.stringify(np); cols.push("prefs_json");
  }
  const stmts = [
    env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => set[c]), t, m.id),
    env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'member_set', ?, ?)").bind(m.id, JSON.stringify({ by: act.actor_email || act.actor_id, fields: cols, plan: p, reason, ...(invoiceNo ? { invoice: invoiceNo } : {}), ...(gccNew ? { gcc: g1 } : {}) }), t),
    metaUpsert(env, m.id, { status: "active", requested_plan: "", suspended_plan: "", suspended_expires: "" }, t),
  ];
  if (audit) stmts.push(auditStmt(env, { ...act, action: "member.plan", target_type: "member", target_id: m.id, before: d.before, after: d.after, ip_hash, req_id,
    summary: `${m.email}: ${before.plan} → ${p}${reason ? " (" + reason + ")" : ""}${invoiceNo ? " " + invoiceNo : ""}${gccNew ? " · " + g1.join(",") : ""}` }));
  await batch(env, stmts);
  if (wasSuspended && m.email) await resubscribe(env, m.email, "incoming");
  const fresh = await memberById(env, m.id);
  let rematched = 0;
  if (rematch && PLAN_LV[effPlan(fresh)] >= PLAN_LV.basic) { try { rematched = (await rematchForMember(env, m.id)).sent || 0; } catch (e) { console.error("rematch", e && e.message); } }
  return { member: fresh, rematched };
}

/* ---------- the member's GCC states (Premium: Egypt + the states it picks; DESIGN §2) ---------- */
const GCC_SRC = ["signup", "member", "admin", "desk", "janna"];
const rawPrefs = m => { const p = jparse((m && m.prefs_json) || "{}", {}); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; };
/* how many states a member must pick for `plan` — its gcc_pick, or (a member not on such a plan yet: a choice kept for later) Premium's */
export const pickFor = plan => gccPick(canonPlan(plan)) || gccPick("premium") || 3;
export const gccError = (pick, who = "member") => fail(422, "gcc_required", who === "member" ? `اختار ${pick} دول خليجية بالظبط / pick exactly ${pick} Gulf states` : `اختار ${pick} دول خليجية للعضو / pick ${pick} Gulf states for this member`,
  { pick, allowed: GCC, errors: [{ field: "gcc", msg: `${pick} of ${GCC.join(", ")}`, code: "gcc_required" }] });
/* setGcc — read-modify-write of members.prefs_json {gcc, gcc_src, gcc_at}; audited member.gcc (before/after); then the open requests the
   member now covers reach it (rematchForMember). codes must already hold the right number (the callers check it). */
export async function setGcc(env, memberId, codes, { src = "admin", by, ip_hash = "", req_id = "", rematch = true } = {}) {
  await needTables(env, "cc_audit");
  const m = await memberById(env, memberId);
  if (!m) throw new HttpErr(404, "not_found", "member not found");
  const g = normGcc(codes);
  if (!g.length) throw new HttpErr(422, "gcc_required", "pick the Gulf states", { allowed: GCC });
  const prefs = rawPrefs(m), before = normGcc(prefs.gcc), t = now(), act = actorOf(by), s = GCC_SRC.includes(src) ? src : "admin";
  const { gcc_next, ...keep } = prefs; // states chosen now replace any that were waiting for an unpaid invoice
  await batch(env, [
    env.DB.prepare("UPDATE members SET prefs_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ ...keep, gcc: g, gcc_src: s, gcc_at: t }), t, m.id),
    auditStmt(env, { ...act, action: "member.gcc", target_type: "member", target_id: m.id, before: { gcc: before }, after: { gcc: g, src: s }, ip_hash, req_id,
      summary: `${m.email}: Gulf states ${before.join(",") || "—"} → ${g.join(",")} (${s})` }),
  ]);
  const fresh = await memberById(env, m.id);
  let rematched = 0;
  if (rematch && PLAN_LV[effPlan(fresh)] >= PLAN_LV.basic) { try { rematched = (await rematchForMember(env, m.id)).sent || 0; } catch (e) { console.error("rematch", e && e.message); } }
  return { member: fresh, gcc: g, rematched };
}

/* ---------- MemberRow ---------- */
async function rowsOf(env, rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const metas = new Map((await allIn(env, ph => `SELECT * FROM cc_member_meta WHERE member_id IN (${ph})`, ids)).map(r => [r.member_id, r]));
  const staff = new Map((await allIn(env, ph => `SELECT member_id, role FROM cc_staff WHERE disabled_at = '' AND member_id IN (${ph})`, ids)).map(r => [r.member_id, r.role]));
  const inv = new Map();
  for (const r of await allIn(env, ph => `SELECT member_id, no, total_minor, issued_at FROM cc_invoices WHERE status = 'open' AND test = 0 AND member_id IN (${ph}) ORDER BY issued_at DESC`, ids)) if (!inv.has(r.member_id)) inv.set(r.member_id, { no: r.no, total_minor: r.total_minor });
  const names = await factoryNames(env, rows.map(r => r.factory_ref));
  return rows.map(m => ({ env, m, meta: metas.get(m.id), staff: staff.get(m.id), inv: inv.get(m.id), fname: names.get(m.factory_ref) || "" }));
}
function memberRow({ env, m, meta, staff, inv, fname }) {
  const u = userOut(env, m);
  // gcc (userOut) = what the plan in force covers; gcc_stored = the saved choice (also unused / history); gcc_next = the states chosen with
  // an unpaid invoice (they apply when that invoice is paid)
  const pr = rawPrefs(m), stored = normGcc(pr.gcc), nx = gccNextOf(m);
  return { ...u, gcc_stored: stored, gcc_src: stored.length ? line(pr.gcc_src || "", 20) : "", gcc_at: stored.length ? line(pr.gcc_at || "", 40) : "", gcc_next: nx,
    name: m.name || "", phone: m.phone || "", plan_set: canonPlan(m.plan), plan_until: cairoDate(m.plan_expires), status: (meta && meta.status) || "active",
    requested_plan: (meta && meta.requested_plan) || "", suspended_plan: (meta && meta.suspended_plan) || "", last_seen_at: m.last_seen_at || "", verified: !!m.verified,
    email_verified: !!m.email_verified_at, factory_ref: m.factory_ref || "", factory_name: fname, role: isBootstrap(env, m) ? "owner" : staff || (m.role === "admin" ? "admin" : ""),
    open_invoice: inv || null, source: (meta && meta.source) || "", legacy_id: (meta && meta.legacy_id) || "", tags: (meta && meta.tags) || "", updated_at: m.updated_at || "" };
}
export async function memberRows(env, rows) { return (await rowsOf(env, rows)).map(memberRow); }
export async function memberRowOf(env, id) { const m = await memberById(env, id); return m ? (await memberRows(env, [m]))[0] : null; }

/* ---------- GET /members (+ .csv) ---------- */
async function memberQuery(env, url) {
  const q = line(url.searchParams.get("q"), 100), plan = line(url.searchParams.get("plan"), 120), status = line(url.searchParams.get("status"), 20);
  const where = ["m.email NOT LIKE 'deleted+%@invalid'"], args = [], t = now();
  if (plan) {
    const ps = [...new Set(plan.split(",").map(x => x.trim().toLowerCase()).filter(Boolean).map(x => (x === "none" ? "visitor" : canonPlan(x))))];
    where.push(`m.plan IN (${ps.map(() => "?").join(", ")})`); args.push(...ps);
  }
  const meta = await hasTable(env, "cc_member_meta");
  if (status) {
    if (!STATUSES.includes(status)) fail(400, "invalid_status", "status must be active, pending or suspended");
    if (meta) { where.push("COALESCE(mm.status, 'active') = ?"); args.push(status); } else if (status !== "active") where.push("0");
  }
  if (url.searchParams.get("expired") === "1") { where.push("m.plan != 'visitor' AND m.plan_expires != '' AND m.plan_expires < ?"); args.push(t); }
  if (url.searchParams.get("soon") === "1") { where.push("m.plan != 'visitor' AND m.plan_expires != '' AND m.plan_expires >= ? AND m.plan_expires <= ?"); args.push(t, iso(Date.now() + 30 * 86400000)); }
  if (q) { const l = likeOf(q); where.push("(m.email LIKE ? OR m.company LIKE ? OR m.name LIKE ? OR m.phone LIKE ? OR m.id = ?)"); args.push(l, l, l, l, q); }
  return { from: `FROM members m ${meta ? "LEFT JOIN cc_member_meta mm ON mm.member_id = m.id" : ""} WHERE ${where.join(" AND ")}`, args };
}
export async function listMembers(env, url) {
  const { page, limit, offset } = paging(url), { from, args } = await memberQuery(env, url);
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...args).first("n")) || 0;
  const { results } = await env.DB.prepare(`SELECT m.* ${from} ORDER BY m.created_at DESC, m.id LIMIT ? OFFSET ?`).bind(...args, limit, offset).all();
  return { items: await memberRows(env, results || []), total, page, limit };
}
const MEMBER_CSV = ["id", "email", "company", "name", "title", "phone", "sector", "governorate", "products", "plan", "plan_set", "plan_expires", "plan_until", "status", "requested_plan", "suspended_plan",
  "gcc", "gcc_pending", "activated_at", "verified", "email_verified", "factory_ref", "factory_name", "inbox_paused", "role", "open_invoice_no", "open_invoice_total_minor", "source", "legacy_id", "tags", "last_seen_at", "created_at"];
export async function membersCsv(env, url) {
  const { from, args } = await memberQuery(env, url);
  const { results } = await env.DB.prepare(`SELECT m.* ${from} ORDER BY m.created_at DESC LIMIT 5000`).bind(...args).all();
  return csvText(MEMBER_CSV, (await memberRows(env, results || [])).map(r => ({ ...r, gcc: r.gcc.all ? "ALL" : r.gcc.chosen.join("|"), gcc_pending: r.gcc.pending ? 1 : 0,
    open_invoice_no: r.open_invoice ? r.open_invoice.no : "", open_invoice_total_minor: r.open_invoice ? r.open_invoice.total_minor : "" })));
}

/* ---------- GET /members/:id ---------- */
export async function memberDetail(env, id, adm) {
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  const row = (await memberRows(env, [m]))[0], meta = (await metaOf(env, m.id)) || null;
  const invoices = await all(env, "SELECT no, status, plan, plan_name, total_minor, currency, source, issued_at, paid_at, test FROM cc_invoices WHERE member_id = ? ORDER BY issued_at DESC LIMIT 50", m.id);
  const routedN = (await countOf(env, "SELECT COUNT(*) AS n FROM inquiry_routes WHERE member_id = ?", m.id)) || 0;
  const last = await all(env, "SELECT i.ref, r.status, r.created_at FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id WHERE r.member_id = ? ORDER BY r.created_at DESC LIMIT 5", m.id);
  const follows = (await countOf(env, "SELECT COUNT(*) AS n FROM follows WHERE user_id = ?", m.id)) || 0;
  const sessions = (await countOf(env, "SELECT COUNT(*) AS n FROM auth_sessions WHERE member_id = ? AND revoked_at = '' AND expires_at > ?", m.id, now())) || 0;
  const auditRows = (await all(env, "SELECT * FROM cc_audit WHERE target_type = 'member' AND target_id = ? ORDER BY id DESC LIMIT 20", m.id)).map(auditOut);
  const bassemOn = planCanX(m, "bassem");
  const metaOut = meta ? { ...meta, legacy_profile_json: undefined } : null;
  return { member: row, meta: metaOut, invoices, routed: { count: routedN, last }, follows, bassem: bassemOn ? prefsOut(m) : null, sessions, audit: auditRows, legacy_profile: jget((meta && meta.legacy_profile_json) || "{}", {}) };
}
export const auditOut = r => ({ ...r, before: jget(r.before_json, null), after: jget(r.after_json, null), before_json: undefined, after_json: undefined });

/* ---------- POST /members, PATCH /members/:id ---------- */
const PROFILE_FIELDS = [["company", 160], ["name", 120], ["title", 40], ["sector", 160], ["governorate", 60]];
function profileSet(b, v) {
  const set = {};
  for (const [k, n] of PROFILE_FIELDS) if (k in b) set[k] = line(b[k], n);
  if ("products" in b) set.products = str(b.products, 1000).replace(/\s+/g, " ");
  if ("phone" in b) { const p = b.phone ? e164(b.phone) : ""; if (b.phone && !p) v.err("phone", "رقم الموبايل مش صحيح / invalid phone number", "invalid_phone"); else set.phone = p; }
  if ("inbox_paused" in b) set.inbox_paused = b.inbox_paused ? 1 : 0;
  return set;
}
async function checkRef(env, ref, v) {
  if (!ref) return "";
  if (!DIR_REF_RX.test(ref) || !(await refExists(env, ref))) { v.err("factory_ref", "الملف ده مش موجود في الدليل / no such directory profile", "invalid_factory_ref"); return null; }
  return ref;
}
export async function createMember(req, env, ctx, adm) {
  const b = await body(req);
  await needTables(env, "cc_member_meta", "cc_audit");
  const email = line(b.email, 254).toLowerCase(), v = validator();
  if (!isEmail(email)) fail(400, "invalid_email", "a valid e-mail is required");
  const dup = await membersByMailbox(env, email, "id");
  if (dup.length) fail(409, "exists", "an account with this mailbox already exists", { id: dup[0].id });
  if (adm.role !== "owner" && adminList(env).includes(email)) fail(403, "owner_only", "this address is an owner from the Worker settings (ADMIN_EMAILS)", { need: "owner" });
  const set = profileSet(b, v);
  if ("factory_ref" in b && line(b.factory_ref, 60)) { if (!adm.can("directory.link")) fail(403, "forbidden", "linking a directory profile needs directory.link", { need: "directory.link" }); set.factory_ref = await checkRef(env, line(b.factory_ref, 60), v); }
  const plan = "plan" in b ? String(b.plan || "").trim().toLowerCase() : "";
  if (plan && canonPlan(plan) === "visitor" && !/^(visitor|none)$/.test(plan)) v.err("plan", "باقة غير معروفة / unknown plan", "invalid_plan");
  const until = "plan_until" in b ? untilIso(b.plan_until) : undefined;
  if (until === null) v.err("plan_until", "التاريخ لازم يكون YYYY-MM-DD / date must be YYYY-MM-DD", "invalid_date");
  const status = "status" in b ? line(b.status, 20) : "active";
  if (!STATUSES.includes(status)) v.err("status", "حالة غير معروفة / unknown status", "invalid_status");
  const notes = str(b.notes || "", 2001); if (notes.length > 2000) v.err("notes", "الملاحظات أطول من 2000 حرف / notes too long");
  const pick = plan ? gccPick(canonPlan(plan)) : 0, gcc = pick ? normGcc(b.gcc) : [];
  if (pick && gcc.length !== pick) v.err("gcc", `اختار ${pick} دول خليجية للعضو / pick ${pick} Gulf states for this member`, "gcc_required");
  v.done();
  if (plan && canonPlan(plan) !== "visitor" && !adm.can("members.plan")) fail(403, "forbidden", "setting a plan needs members.plan", { need: "members.plan" });
  const id = "u" + hex(8), t = now(), row = { id, company: "", email, plan: "visitor", verified: 1, created_at: t, updated_at: t, ...set }, cols = Object.keys(row);
  await batch(env, [
    env.DB.prepare(`INSERT INTO members (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map(c => row[c])),
    metaUpsert(env, id, { source: "admin", notes }, t),
    adm.auditStmt("member.create", "member", id, null, { email, ...set, plan: plan || "visitor", status }, `${email} created`),
  ]);
  if (plan && canonPlan(plan) !== "visitor") await setPlan(env, { memberId: id, plan, expires: until, by: adm.actor, reason: "admin", ip_hash: adm.ipHash, req_id: adm.reqId, ...(pick ? { gcc, gcc_src: "admin" } : {}) });
  if (status !== "active") await applyStatus(env, adm, id, status);
  let invite = null;
  if (b.invite) invite = await sendInvite(env, adm, id, b.lang);
  return { status: 201, body: { member: await memberRowOf(env, id), ...(invite ? { invite } : {}) } };
}
export async function patchMember(req, env, ctx, adm, id) {
  const b = await body(req);
  await needTables(env, "cc_member_meta", "cc_audit");
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  const CONTACT = new Set(["name", "title", "phone", "company"]);
  for (const k of ["plan", "plan_until", "status", "plan_expires", "role"]) if (k in b) fail(400, "use_plan_endpoint", `${k} changes through /plan or /status`, { field: k });
  const keys = Object.keys(b);
  if (!adm.can("members.write") && keys.some(k => !CONTACT.has(k))) fail(403, "forbidden", "needs members.write", { need: "members.write" });
  if (!adm.can("members.write") && !adm.can("members.contact")) fail(403, "forbidden", "needs members.contact", { need: "members.contact" });
  const v = validator(), set = profileSet(b, v), metaSet = {};
  if ("email" in b) {
    const e = line(b.email, 254).toLowerCase();
    if (e !== String(m.email || "").toLowerCase()) {
      if (adm.role !== "owner") fail(403, "owner_only", "only the owner can change an account e-mail", { need: "owner" });
      if (!isEmail(e)) v.err("email", "إيميل غير صحيح / invalid e-mail", "invalid_email");
      else { const other = (await membersByMailbox(env, e, "id")).filter(x => x.id !== m.id); if (other.length) fail(409, "exists", "another account has this mailbox", { id: other[0].id }); set.email = e; set.email_verified_at = ""; }
    }
  }
  if ("factory_ref" in b) { if (!adm.can("directory.link")) fail(403, "forbidden", "linking a directory profile needs directory.link", { need: "directory.link" }); const r = line(b.factory_ref, 60); set.factory_ref = r ? await checkRef(env, r, v) : ""; }
  if ("notes" in b) { const n = str(b.notes || "", 2001); if (n.length > 2000) v.err("notes", "الملاحظات أطول من 2000 حرف / notes too long"); else metaSet.notes = n; }
  if ("tags" in b) metaSet.tags = line(b.tags, 200);
  v.done();
  const before = {}; for (const k of Object.keys(set)) before[k] = m[k];
  const meta = (await metaOf(env, m.id)) || {}; for (const k of Object.keys(metaSet)) before[k] = meta[k] || "";
  const d = changed(before, { ...set, ...metaSet });
  if (!d.keys.length) return { body: { member: await memberRowOf(env, m.id), changed: [] } };
  const t = now(), cols = Object.keys(set).filter(c => d.keys.includes(c));
  const stmts = [];
  if (cols.length) stmts.push(env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => set[c]), t, m.id));
  if (Object.keys(metaSet).some(k => d.keys.includes(k))) stmts.push(metaUpsert(env, m.id, metaSet, t));
  stmts.push(adm.auditStmt("member.update", "member", m.id, d.before, d.after, `${m.email}: ${d.keys.join(", ")}`));
  await batch(env, stmts);
  if (set.inbox_paused === 0 && d.keys.includes("inbox_paused") && m.email) await resubscribe(env, set.email || m.email, "incoming");
  const fresh = await memberById(env, m.id);
  let rematched = 0;
  if (PLAN_LV[effPlan(fresh)] >= PLAN_LV.basic && d.keys.some(k => ["sector", "products", "inbox_paused"].includes(k))) { try { rematched = (await rematchForMember(env, m.id)).sent || 0; } catch (e) { /* the change is saved */ } }
  return { body: { member: await memberRowOf(env, m.id), changed: d.keys, rematched } };
}

/* ---------- plan / status / extend / invite / sessions / delete ---------- */
export async function postPlan(req, env, ctx, adm, id) {
  const b = await body(req);
  const raw = String(b.plan == null ? "" : b.plan).trim().toLowerCase(), p = canonPlan(raw);
  if (raw && raw !== "none" && p === "visitor" && raw !== "visitor") fail(400, "invalid_plan", "unknown plan", { plans: PLANS });
  let expires;
  if ("plan_until" in b) { expires = untilIso(b.plan_until); if (expires === null) fail(400, "invalid_date", "plan_until must be YYYY-MM-DD"); }
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  // a plan whose members pick GCC states (Premium): the states sent, else the stored choice — exactly `pick` of them (422 gcc_required).
  // A member already ON that plan (a new end date, a renewal by the team) who has not chosen yet stays «not chosen yet» (all six for now,
  // the prompt keeps asking him) when no states are sent — review: editing today's Premium members must never force a choice on them.
  const pick = gccPick(p), sent = b.gcc != null && (Array.isArray(b.gcc) ? b.gcc.length > 0 : String(b.gcc).trim() !== "");
  const gcc = pick ? (sent ? normGcc(b.gcc) : normGcc(rawPrefs(m).gcc)) : [];
  const keepPending = pick > 0 && !sent && canonPlan(m.plan) === p;
  if (pick && gcc.length !== pick && !keepPending) gccError(pick, "admin");
  const r = await setPlan(env, { memberId: m.id, plan: p, expires, by: adm.actor, reason: "admin", ip_hash: adm.ipHash, req_id: adm.reqId, ...(pick && gcc.length === pick ? { gcc, gcc_src: "admin" } : {}) });
  return { body: { member: await memberRowOf(env, m.id), rematched: r.rematched } };
}
/* POST /members/:id/gcc {gcc} (members.plan): the team sets the member's GCC states at any time (audited member.gcc) — exactly the pick of
   the plan in force, or Premium's when the member is not on such a plan yet (kept for later) */
export async function postGcc(req, env, ctx, adm, id) {
  const b = await body(req);
  await needTables(env, "cc_audit");
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  const pick = pickFor(effPlan(m)), gcc = normGcc(b.gcc);
  if (gcc.length !== pick) gccError(pick, "admin");
  const r = await setGcc(env, m.id, gcc, { src: "admin", by: adm.actor, ip_hash: adm.ipHash, req_id: adm.reqId });
  return { body: { member: await memberRowOf(env, m.id), rematched: r.rematched } };
}
/* pending = meta only · suspended = plan held aside (members.plan visitor, inbox paused; sessions stay: they may still sign in and pay)
   · active from suspended = the held plan back when still unexpired, inbox on again */
async function applyStatus(env, adm, id, status) {
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  const meta = (await metaOf(env, m.id)) || {}, cur = meta.status || "active", t = now();
  if (cur === status) fail(409, "state", `the account is already ${status}`, { status });
  const stmts = [], before = { status: cur, plan: m.plan, plan_expires: m.plan_expires, inbox_paused: m.inbox_paused }, after = { status };
  let rematch = false, resub = false;
  if (status === "suspended") {
    stmts.push(metaUpsert(env, m.id, { status, suspended_plan: canonPlan(m.plan), suspended_expires: m.plan_expires || "" }, t));
    stmts.push(env.DB.prepare("UPDATE members SET plan = 'visitor', plan_expires = '', inbox_paused = 1, updated_at = ? WHERE id = ?").bind(t, m.id));
    Object.assign(after, { plan: "visitor", plan_expires: "", inbox_paused: 1 });
  } else if (status === "pending") {
    stmts.push(metaUpsert(env, m.id, { status }, t));
  } else if (cur === "suspended") {
    const held = canonPlan(meta.suspended_plan || "visitor"), exp = meta.suspended_expires || "", alive = !exp || exp > t;
    stmts.push(metaUpsert(env, m.id, { status: "active", suspended_plan: "", suspended_expires: "" }, t));
    stmts.push(env.DB.prepare("UPDATE members SET plan = ?, plan_expires = ?, inbox_paused = 0, updated_at = ? WHERE id = ?").bind(alive ? held : "visitor", alive ? exp : "", t, m.id));
    Object.assign(after, { plan: alive ? held : "visitor", plan_expires: alive ? exp : "", inbox_paused: 0 });
    rematch = alive && PLAN_LV[held] >= PLAN_LV.basic; resub = true;
  } else stmts.push(metaUpsert(env, m.id, { status: "active" }, t));
  const d = changed(before, after);
  stmts.push(adm.auditStmt("member.status", "member", m.id, d.before, d.after, `${m.email}: ${cur} → ${status}`));
  await batch(env, stmts);
  if (resub && m.email) await resubscribe(env, m.email, "incoming");
  if (rematch) { try { await rematchForMember(env, m.id); } catch (e) { /* saved */ } }
}
export async function postStatus(req, env, ctx, adm, id) {
  const b = await body(req), status = line(b.status, 20);
  if (!STATUSES.includes(status)) fail(400, "invalid_status", "status must be active, pending or suspended");
  await needTables(env, "cc_member_meta", "cc_audit");
  await applyStatus(env, adm, id, status);
  return { body: { member: await memberRowOf(env, id) } };
}
export async function postExtend(req, env, ctx, adm, id) {
  const b = await body(req), days = parseInt(b.days, 10);
  if (!Number.isInteger(days) || days < 1 || days > 1095) fail(400, "invalid_days", "days must be 1..1095");
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  const meta = (await metaOf(env, m.id)) || {};
  if (meta.status === "suspended") fail(409, "state", "the account is suspended — reactivate it first");
  if (canonPlan(m.plan) === "visitor") fail(409, "state", "no plan to extend — choose a plan first");
  if (!m.plan_expires) fail(409, "state", "this plan has no expiry date");
  const base = Math.max(Date.now(), Date.parse(m.plan_expires) || 0);
  const r = await setPlan(env, { memberId: m.id, plan: m.plan, expires: iso(base + days * 86400000), by: adm.actor, reason: `extend +${days}d`, ip_hash: adm.ipHash, req_id: adm.reqId });
  return { body: { member: await memberRowOf(env, m.id), rematched: r.rematched } };
}
async function sendInvite(env, adm, id, lang) {
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  if (!m.email || !isEmail(m.email) || /@invalid$/.test(m.email)) fail(409, "state", "this account has no e-mail");
  if (!(await rateOk(env, "ccinv|" + m.id, 3, 86400))) fail(429, "rate_limited", "3 invitations per day per member", { limit: 3 });
  const id1 = await adm.audit("member.invite", "member", m.id, null, { to: maskEmail(m.email) }, `invite ${maskEmail(m.email)}`);
  const r = await sendTpl(env, adm.CC, "member_invite", m.email, { name: m.name || m.company || "", company: m.company || m.email, login_url: loginUrl(env) }, { lang: lang === "en" ? "en" : "ar", idTail: m.id + "-" + hex(3) });
  if (!r.sent) await adm.auditDone(id1, { summary: `invite ${maskEmail(m.email)} — not sent: ${line(r.error || r.skipped || "", 80)}` });
  return { ok: true, sent: !!r.sent, ...(r.sent ? {} : { error: r.error || r.skipped || "not sent" }) };
}
export async function postInvite(req, env, ctx, adm, id) { const b = await body(req); return { body: await sendInvite(env, adm, id, line(b.lang, 5)) }; }
export async function revokeSessions(req, env, ctx, adm, id) {
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  await guardTarget(env, adm, m);
  const n = (await countOf(env, "SELECT COUNT(*) AS n FROM auth_sessions WHERE member_id = ? AND revoked_at = ''", m.id)) || 0;
  await batch(env, [env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at = ''").bind(now(), m.id), adm.auditStmt("member.sessions_revoke", "member", m.id, { sessions: n }, { sessions: 0 }, `${m.email}: ${n} session(s) ended`)]);
  return { body: { ok: true, revoked: n } };
}
/* DELETE = anonymise (owner only: members.delete is OWNER_ONLY; one account per call — never bulk, never automatic): the account row
   stays for references; buyer requests keep their own data.
   Bassem's memory of the member (advisor_memory, migration 0008) and the factory profile he recorded (member_profiles, 0007) are erased
   WITH the account — the only path left that deletes them (owner's memory policy 2026-11-18: no member-facing «امسح ذاكرتي», no
   age-based pruning; memory only grows). When there is any to erase, the owner must state the legal basis — a formal data-subject
   request under the Egyptian personal data protection law 151/2020 — in body.reason (≥ 10 characters); the reason and the counts go
   into the audit row. Both tables are checked first: 0007 / 0008 may not be applied yet, and a missing table fails the whole batch.
   0009: the same erasure takes his tasks (memory_tasks), «ملخص العميل» (memory_briefs) and Janna's memory of every visitor id linked to
   his account (advisor_memory 'v:<id>' rows + janna_visitors) — each table only when it exists. 0011: and his rows of the daily calls report
   (call_sessions, call_reviews). (The memory alone, without the account: the owner's POST /api/admin/cc/memory/erase, acc-memory.js.) */
export const ERASE_REASON_MIN = 10;
export async function deleteMember(req, env, ctx, adm, id) {
  const b = await body(req);
  const m = await memberById(env, id); if (!m) fail(404, "not_found", "member not found");
  if (!b.confirm || String(b.confirm).trim().toLowerCase() !== String(m.email).toLowerCase()) fail(400, "confirm_required", "type the account e-mail to confirm");
  if (isBootstrap(env, { ...m, email_verified_at: m.email_verified_at || "x" }) || (await first(env, "SELECT 1 AS x FROM cc_staff WHERE member_id = ?", m.id)) || m.role === "admin") fail(409, "state", "remove this account from «الإدارة والصلاحيات» first");
  await needTables(env, "cc_member_meta", "cc_audit");
  const t = now();
  const profiles = await hasTable(env, "member_profiles"), mem = await hasTable(env, "advisor_memory");
  const tsk = await hasTable(env, "memory_tasks"), brf = await hasTable(env, "memory_briefs"), jv = await hasTable(env, "janna_visitors");
  const vids = jv ? (await all(env, "SELECT visitor_id FROM janna_visitors WHERE member_id = ? LIMIT 50", m.id)).map(r => r.visitor_id) : [];
  const subj = [m.id, ...vids.map(v => "v:" + v)], ph = subj.map(() => "?").join(", ");
  const memRows = mem ? (await countOf(env, `SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id IN (${ph})`, ...subj)) || 0 : 0;
  const taskRows = tsk ? (await countOf(env, `SELECT COUNT(*) AS n FROM memory_tasks WHERE subject IN (${ph})`, ...subj)) || 0 : 0;
  const profile = profiles ? !!(await first(env, "SELECT 1 AS x FROM member_profiles WHERE member_id = ?", m.id)) : false;
  /* review 2026-11-19 #11: «بنك المعلومات» too — his keyed asker hash (and his linked visitor ids') leaves the asker lists, and an entry
     only he asked goes (knowledge.js kbEraseStmts, the same step as the API erasure acc-memory.js) */
  const kb = await kbEraseStmts(env, subj);
  const cs = await hasTable(env, "call_sessions"), cr = await hasTable(env, "call_reviews"); // 0011: the calls report's rows of him
  const callRows = (cs ? (await countOf(env, `SELECT COUNT(*) AS n FROM call_sessions WHERE member_id = ? OR subject IN (${ph})`, m.id, ...subj)) || 0 : 0)
    + (cr ? (await countOf(env, `SELECT COUNT(*) AS n FROM call_reviews WHERE subject IN (${ph})`, ...subj)) || 0 : 0);
  const reason = line(b.reason, 300), erase = memRows > 0 || profile || taskRows > 0 || vids.length > 0 || kb.stmts.length > 0 || callRows > 0;
  if (erase && Array.from(reason).length < ERASE_REASON_MIN) fail(400, "reason_required", "حذف الحساب ده هيمسح ذاكرة باسم معاه: اكتب السبب القانوني (طلب رسمي من صاحب البيانات بموجب قانون حماية البيانات الشخصية 151 لسنة 2020) / deleting this account erases Bassem's memory of it: state the legal basis (a formal data-subject request, Egyptian PDPL 151/2020)", { memory_rows: memRows, factory_profile: profile, tasks: taskRows, janna_visitors: vids.length, min: ERASE_REASON_MIN });
  await batch(env, [
    env.DB.prepare("UPDATE members SET email = ?, name = '', title = '', phone = '', company = '', products = '', sector = '', governorate = '', plan = 'visitor', plan_expires = '', factory_ref = '', prefs_json = '{}', inbox_paused = 1, email_verified_at = '', role = 'user', updated_at = ? WHERE id = ?").bind(`deleted+${m.id}@invalid`, t, m.id),
    env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at = ''").bind(t, m.id),
    env.DB.prepare("DELETE FROM follows WHERE user_id = ?").bind(m.id),
    env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(m.id),
    ...(profiles ? [env.DB.prepare("DELETE FROM member_profiles WHERE member_id = ?").bind(m.id)] : []),        // holo4: the factory profile
    ...(mem ? [env.DB.prepare(`DELETE FROM advisor_memory WHERE member_id IN (${ph})`).bind(...subj)] : []),   // holo6: Bassem's memory (+ 0009: Janna's of his visitor ids)
    ...(tsk ? [env.DB.prepare(`DELETE FROM memory_tasks WHERE subject IN (${ph})`).bind(...subj)] : []),       // 0009: his tasks
    ...(brf ? [env.DB.prepare(`DELETE FROM memory_briefs WHERE subject IN (${ph})`).bind(...subj)] : []),      // 0009: «ملخص العميل»
    ...(vids.length ? [env.DB.prepare(`DELETE FROM janna_visitors WHERE member_id = ?`).bind(m.id)] : []),     // 0009: his visitor ids
    ...kb.stmts,                                                                                                  // 0009: his asker hash / his own entries in «بنك المعلومات»
    ...(cs ? [env.DB.prepare(`DELETE FROM call_sessions WHERE member_id = ? OR subject IN (${ph})`).bind(m.id, ...subj)] : []), // 0011: the calls report
    ...(cr ? [env.DB.prepare(`DELETE FROM call_reviews WHERE subject IN (${ph})`).bind(...subj)] : []),
    metaUpsert(env, m.id, { notes: "deleted " + t, legacy_profile_json: "{}", tags: "", status: "active", requested_plan: "", suspended_plan: "", suspended_expires: "" }, t),
    adm.auditStmt("member.delete", "member", m.id, { email: maskEmail(m.email), plan: m.plan, company: m.company ? "(set)" : "", ...(erase ? { bassem_memory_rows: memRows, factory_profile: profile, tasks: taskRows, janna_visitors: vids.length } : {}) },
      { email: `deleted+${m.id}@invalid`, ...(reason ? { reason } : {}), ...(kb.stmts.length ? { knowledge_askers: kb.askers, knowledge_removed: kb.removed } : {}), ...(callRows ? { call_rows: callRows } : {}) }, `anonymised ${maskEmail(m.email)}` + (erase ? ` · Bassem memory erased (${memRows} rows${profile ? " + factory profile" : ""}${taskRows ? " + " + taskRows + " tasks" : ""}${vids.length ? " + Janna visitor memory (" + vids.length + ")" : ""}${kb.stmts.length ? " + knowledge bank (" + kb.askers + " asker lists, " + kb.removed + " entries)" : ""}) · legal request: ${reason}` : "")),
  ]);
  return { body: { ok: true } };
}

/* ---------- customers (buyers) = inquiries grouped by email_key (§8.1) ---------- */
const CID = new WeakMap(); // env.DB → {at, map: cid → email_key}
export const cidOf = async (env, key) => (await hmac(secretOf(env) || "mig", "cid|" + key)).slice(0, 16);
async function cidLookup(env, cid) {
  let c = CID.get(env.DB);
  for (let pass = 0; pass < 2; pass++) {
    if (c && c.map.has(cid)) return c.map.get(cid);
    if (c && pass === 0 && Date.now() - c.at < 5000) break;
    const map = new Map();
    for (const r of await all(env, "SELECT DISTINCT email_key FROM inquiries WHERE email_key != '' LIMIT 50000")) map.set(await cidOf(env, r.email_key), r.email_key);
    c = { at: Date.now(), map }; CID.set(env.DB, c);
  }
  return c && c.map.get(cid) || "";
}
async function customerGroups(env, url) {
  const where = ["email_key != ''"], args = [];
  const kind = line(url.searchParams.get("kind"), 30), from = line(url.searchParams.get("from"), 10), to = line(url.searchParams.get("to"), 10), q = line(url.searchParams.get("q"), 100);
  if (kind) { where.push("email_key IN (SELECT email_key FROM inquiries WHERE kind = ?)"); args.push(kind); }
  if (from && dateOk(from)) { where.push("created_at >= ?"); args.push(dayStartIso(from)); }
  if (to && dateOk(to)) { where.push("created_at < ?"); args.push(dayAfterIso(to)); }
  if (q) { const l = likeOf(q); where.push("email_key IN (SELECT email_key FROM inquiries WHERE email LIKE ? OR name LIKE ? OR company LIKE ? OR phone LIKE ?)"); args.push(l, l, l, l); }
  const groups = await all(env, `SELECT email_key, MIN(created_at) AS first_at, MAX(created_at) AS last_at, COUNT(*) AS total, SUM(CASE WHEN status NOT IN ('closed', 'blocked', 'recorded') THEN 1 ELSE 0 END) AS open
    FROM inquiries WHERE ${where.join(" AND ")} GROUP BY email_key ORDER BY last_at DESC LIMIT 5000`, ...args);
  return groups;
}
/* members by mailbox for many addresses at once (exact lower-case address, plus the Gmail spellings) */
async function membersFor(env, emails) {
  const out = new Map(), lower = [...new Set(emails.map(e => String(e || "").toLowerCase()).filter(Boolean))];
  const exact = await allIn(env, ph => `SELECT id, email, plan, plan_expires FROM members WHERE lower(email) IN (${ph})`, lower);
  for (const m of exact) out.set(String(m.email).toLowerCase(), m);
  if (lower.some(e => /@(gmail|googlemail)\.com$/.test(e))) {
    const gm = await all(env, "SELECT id, email, plan, plan_expires FROM members WHERE lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com' LIMIT 5000");
    for (const e of lower) if (!out.has(e) && /@(gmail|googlemail)\.com$/.test(e)) { const m = gm.find(x => sameMailbox(x.email, e)); if (m) out.set(e, m); }
  }
  return out;
}
async function customerItems(env, groups) {
  if (!groups.length) return [];
  const keys = groups.map(g => g.email_key);
  const latest = new Map();
  for (const r of await allIn(env, ph => `SELECT email_key, email, name, company, phone, created_at FROM inquiries WHERE email_key IN (${ph}) ORDER BY created_at DESC`, keys)) if (!latest.has(r.email_key)) latest.set(r.email_key, r);
  const kinds = new Map();
  for (const r of await allIn(env, ph => `SELECT email_key, kind, COUNT(*) AS n FROM inquiries WHERE email_key IN (${ph}) GROUP BY email_key, kind`, keys)) { if (!kinds.has(r.email_key)) kinds.set(r.email_key, {}); kinds.get(r.email_key)[r.kind] = r.n; }
  const blocked = new Set((await allIn(env, ph => `SELECT value FROM blocks WHERE kind = 'email' AND value IN (${ph})`, keys)).map(r => r.value));
  const notes = new Map((await allIn(env, ph => `SELECT * FROM cc_customer_notes WHERE email_key IN (${ph})`, keys)).map(r => [r.email_key, r]));
  const mem = await membersFor(env, [...latest.values()].map(l => l.email));
  const out = [];
  for (const g of groups) {
    const l = latest.get(g.email_key) || {}, m = mem.get(String(l.email || "").toLowerCase()), n = notes.get(g.email_key);
    out.push({ cid: await cidOf(env, g.email_key), email: l.email || "", name: l.name || "", company: l.company || "", phone: l.phone || "", first_at: g.first_at, last_at: g.last_at, total: g.total, kinds: kinds.get(g.email_key) || {},
      open: g.open || 0, member: m ? { id: m.id, plan: effPlan(m) } : null, blocked: blocked.has(g.email_key), note: n ? n.note : "", tags: n ? n.tags : "" });
  }
  return out;
}
export async function listCustomers(env, url) {
  const { page, limit, offset } = paging(url);
  let groups = await customerGroups(env, url);
  const ha = url.searchParams.get("has_account");
  if (ha === "0" || ha === "1") {
    const latest = new Map();
    for (const r of await allIn(env, ph => `SELECT email_key, email FROM inquiries WHERE email_key IN (${ph}) ORDER BY created_at DESC`, groups.map(g => g.email_key))) if (!latest.has(r.email_key)) latest.set(r.email_key, r.email);
    const mem = await membersFor(env, [...latest.values()]);
    groups = groups.filter(g => !!mem.get(String(latest.get(g.email_key) || "").toLowerCase()) === (ha === "1"));
  }
  return { items: await customerItems(env, groups.slice(offset, offset + limit)), total: groups.length, page, limit };
}
const CUSTOMER_CSV = ["cid", "email", "name", "company", "phone", "first_at", "last_at", "total", "kinds", "open", "member_id", "member_plan", "blocked", "note", "tags"];
export async function customersCsv(env, url) {
  const items = await customerItems(env, (await customerGroups(env, url)).slice(0, 5000));
  return csvText(CUSTOMER_CSV, items.map(c => ({ ...c, kinds: Object.entries(c.kinds).map(([k, n]) => k + ":" + n).join(" "), member_id: c.member ? c.member.id : "", member_plan: c.member ? c.member.plan : "" })));
}
export async function customerDetail(env, cid) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(cid)) fail(404, "not_found", "customer not found");
  const key = await cidLookup(env, cid); if (!key) fail(404, "not_found", "customer not found");
  const groups = await all(env, `SELECT email_key, MIN(created_at) AS first_at, MAX(created_at) AS last_at, COUNT(*) AS total, SUM(CASE WHEN status NOT IN ('closed', 'blocked', 'recorded') THEN 1 ELSE 0 END) AS open FROM inquiries WHERE email_key = ? GROUP BY email_key`, key);
  const [customer] = await customerItems(env, groups);
  const inquiries = (await all(env, "SELECT * FROM inquiries WHERE email_key = ? ORDER BY created_at DESC LIMIT 200", key)).map(r => ({ ...inquiryListItem(r), id: r.id, source: r.source, routed_count: r.routed_count }));
  const legacy = await all(env, "SELECT id, legacy_id, name, kind, subject, body, status, legacy_at FROM cc_legacy_messages WHERE email_key = ? ORDER BY legacy_at DESC LIMIT 100", key);
  return { customer, inquiries, legacy_messages: legacy };
}
export async function putCustomerNote(req, env, ctx, adm, cid) {
  const b = await body(req);
  await needTables(env, "cc_customer_notes", "cc_audit");
  const key = /^[A-Za-z0-9_-]{16}$/.test(cid) ? await cidLookup(env, cid) : ""; if (!key) fail(404, "not_found", "customer not found");
  const note = str(b.note || "", 2001), tags = line(b.tags || "", 201);
  if (note.length > 2000) fail(422, "invalid", "note too long", { errors: [{ field: "note", msg: "≤ 2000" }] });
  if (tags.length > 200) fail(422, "invalid", "tags too long", { errors: [{ field: "tags", msg: "≤ 200" }] });
  const old = await first(env, "SELECT note, tags FROM cc_customer_notes WHERE email_key = ?", key) || { note: "", tags: "" };
  const d = changed(old, { note, tags }), t = now();
  await batch(env, [env.DB.prepare("INSERT INTO cc_customer_notes (email_key, note, tags, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email_key) DO UPDATE SET note = excluded.note, tags = excluded.tags, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(key, note, tags, adm.actor.actor_email || adm.actor.actor_id, t), adm.auditStmt("customer.note", "customer", cid, d.before, d.after, "customer note")]);
  return { body: { ok: true } };
}

/* ---------- staff (admins & roles, §3.1.11) ---------- */
async function staffItem(env, memberId) {
  const r = await first(env, "SELECT s.*, m.email, m.name, m.last_seen_at FROM cc_staff s LEFT JOIN members m ON m.id = s.member_id WHERE s.member_id = ?", memberId);
  return r ? { member_id: r.member_id, email: r.email || "", name: r.name || "", role: r.role, added_by: r.added_by, added_at: r.added_at, disabled_at: r.disabled_at, last_seen_at: r.last_seen_at || "", bootstrap: false } : null;
}
export async function listStaff(env) {
  const items = [], seen = new Set();
  for (const e of adminList(env)) {
    const m = (await membersByMailbox(env, e)).find(x => x.email_verified_at) || null;
    items.push({ member_id: m ? m.id : "", email: e, name: m ? m.name || "" : "", role: "owner", added_by: "ADMIN_EMAILS", added_at: "", disabled_at: "", last_seen_at: m ? m.last_seen_at || "" : "", bootstrap: true, signed_in: !!m });
    if (m) seen.add(m.id);
  }
  for (const r of await all(env, "SELECT s.*, m.email, m.name, m.last_seen_at FROM cc_staff s LEFT JOIN members m ON m.id = s.member_id ORDER BY s.added_at")) {
    if (seen.has(r.member_id)) continue; seen.add(r.member_id);
    items.push({ member_id: r.member_id, email: r.email || "", name: r.name || "", role: r.role, added_by: r.added_by, added_at: r.added_at, disabled_at: r.disabled_at, last_seen_at: r.last_seen_at || "", bootstrap: false });
  }
  for (const m of await all(env, "SELECT id, email, name, last_seen_at, updated_at FROM members WHERE role = 'admin' LIMIT 100")) {
    if (seen.has(m.id)) continue;
    items.push({ member_id: m.id, email: m.email, name: m.name || "", role: "admin", added_by: "members.role", added_at: m.updated_at || "", disabled_at: "", last_seen_at: m.last_seen_at || "", bootstrap: false, legacy_flag: true });
  }
  return { items };
}
async function activeOwners(env) {
  let n = 0;
  for (const e of adminList(env)) if ((await membersByMailbox(env, e)).some(x => x.email_verified_at)) n++;
  return n + ((await countOf(env, "SELECT COUNT(*) AS n FROM cc_staff WHERE role = 'owner' AND disabled_at = ''")) || 0);
}
const roleLabel = r => ({ owner: "مالك / owner", admin: "مدير / admin", editor: "محرر / editor", support: "دعم / support", seo: "فريق الـ SEO / SEO team", data: "فريق الداتا — مكتب الاستقبال / data & front-desk team" }[r] || r);
export async function addStaff(req, env, ctx, adm) {
  const b = await body(req);
  await needTables(env, "cc_staff", "cc_audit");
  const email = line(b.email, 254).toLowerCase(), role = line(b.role, 20);
  if (!isEmail(email)) fail(400, "invalid_email", "a valid e-mail is required");
  if (!ROLES.includes(role)) fail(400, "invalid_role", "role must be one of " + ROLES.join(", "), { roles: ROLES });
  if (adm.role !== "owner" && !ADMIN_GRANTS.includes(role)) fail(403, "owner_only", "only the owner can grant owner or admin", { need: "owner" });
  if (adminList(env).includes(email)) fail(409, "exists", "this address is an owner from the Worker settings (ADMIN_EMAILS)");
  let m = (await membersByMailbox(env, email)).sort((a, c) => (c.email_verified_at ? 1 : 0) - (a.email_verified_at ? 1 : 0) || (c.verified || 0) - (a.verified || 0))[0];
  const t = now(), stmts = [];
  let created = false;
  if (!m) { const id = "u" + hex(8); created = true; m = { id, email, role: "user" }; stmts.push(env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at) VALUES (?, '', ?, 'visitor', 1, ?, ?)").bind(id, email, t, t)); }
  const ex = created ? null : await first(env, "SELECT * FROM cc_staff WHERE member_id = ?", m.id);
  if (ex && !ex.disabled_at) fail(409, "exists", "this person is already in the team", { member_id: m.id, role: ex.role });
  if (ex && adm.role !== "owner" && !ADMIN_GRANTS.includes(ex.role)) fail(403, "owner_only", "only the owner can change an owner or admin", { need: "owner" });
  // an account listed as admin only through members.role (a legacy-flag admin in «الإدارة والصلاحيات») is an admin too: re-adding it with a
  // lower role would demote it (and overwrite members.role) — the owner only (review F2)
  if (!created && adm.role !== "owner" && (await protectedRole(env, m))) fail(403, "owner_only", "only the owner can change an owner or admin", { need: "owner" });
  stmts.push(env.DB.prepare("INSERT INTO cc_staff (member_id, role, note, added_by, added_at, updated_at, disabled_at) VALUES (?, ?, ?, ?, ?, ?, '') ON CONFLICT(member_id) DO UPDATE SET role = excluded.role, added_by = excluded.added_by, updated_at = excluded.updated_at, disabled_at = ''")
    .bind(m.id, role, line(b.note || "", 200), adm.actor.actor_email || adm.actor.actor_id, t, t));
  stmts.push(env.DB.prepare("UPDATE members SET role = ?, updated_at = ? WHERE id = ?").bind(MEMBER_ROLE[role], t, m.id));
  stmts.push(adm.auditStmt("staff.add", "member", m.id, ex ? { role: ex.role, disabled_at: ex.disabled_at } : null, { email, role }, `${email} → ${role}`));
  await batch(env, stmts);
  const mailR = await sendTpl(env, adm.CC, "staff_added", email, { role: roleLabel(role), login_url: TEAM_ROLES[role] ? site(env) + TEAM_ROLES[role] : loginUrl(env) }, { lang: "ar", idTail: m.id + "-" + hex(3) });
  return { status: 201, body: { item: await staffItem(env, m.id), mail: { sent: !!mailR.sent } } };
}
async function staffTarget(env, adm, memberId) {
  const m = await memberById(env, memberId); if (!m) fail(404, "not_found", "member not found");
  if (isBootstrap(env, { ...m, email_verified_at: m.email_verified_at || "x" })) fail(403, "forbidden", "an owner from the Worker settings (ADMIN_EMAILS) cannot be changed here");
  const s = await first(env, "SELECT * FROM cc_staff WHERE member_id = ?", m.id);
  const role = s ? s.role : m.role === "admin" ? "admin" : "";
  if (!role) fail(404, "not_found", "this account is not in the team");
  if (adm.role !== "owner" && !ADMIN_GRANTS.includes(role)) fail(403, "owner_only", "only the owner can change an owner or admin", { need: "owner" });
  return { m, s, role };
}
export async function patchStaff(req, env, ctx, adm, memberId) {
  const b = await body(req);
  await needTables(env, "cc_staff", "cc_audit");
  const { m, s, role } = await staffTarget(env, adm, memberId);
  const newRole = "role" in b ? line(b.role, 20) : role, disable = "disabled" in b ? !!b.disabled : !!(s && s.disabled_at);
  if (!ROLES.includes(newRole)) fail(400, "invalid_role", "role must be one of " + ROLES.join(", "), { roles: ROLES });
  if (adm.role !== "owner" && !ADMIN_GRANTS.includes(newRole)) fail(403, "owner_only", "only the owner can grant owner or admin", { need: "owner" });
  if (role === "owner" && s && !s.disabled_at && (newRole !== "owner" || disable) && (await activeOwners(env)) <= 1) fail(409, "state", "the last owner cannot be removed or demoted");
  const t = now(), d = changed({ role, disabled: !!(s && s.disabled_at) }, { role: newRole, disabled: disable });
  if (!d.keys.length) return { body: { item: await staffItem(env, m.id) } };
  await batch(env, [
    env.DB.prepare("INSERT INTO cc_staff (member_id, role, note, added_by, added_at, updated_at, disabled_at) VALUES (?, ?, '', ?, ?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at, disabled_at = excluded.disabled_at")
      .bind(m.id, newRole, adm.actor.actor_email || adm.actor.actor_id, t, t, disable ? t : ""),
    env.DB.prepare("UPDATE members SET role = ?, updated_at = ? WHERE id = ?").bind(disable ? "user" : MEMBER_ROLE[newRole], t, m.id),
    adm.auditStmt("staff.update", "member", m.id, d.before, d.after, `${m.email}: ${d.keys.map(k => k + " " + JSON.stringify(d.before[k]) + "→" + JSON.stringify(d.after[k])).join(", ")}`),
  ]);
  return { body: { item: await staffItem(env, m.id) } };
}
export async function deleteStaff(req, env, ctx, adm, memberId) {
  await needTables(env, "cc_staff", "cc_audit");
  const { m, s, role } = await staffTarget(env, adm, memberId);
  if (role === "owner" && s && !s.disabled_at && (await activeOwners(env)) <= 1) fail(409, "state", "the last owner cannot be removed");
  await batch(env, [env.DB.prepare("DELETE FROM cc_staff WHERE member_id = ?").bind(m.id), env.DB.prepare("UPDATE members SET role = 'user', updated_at = ? WHERE id = ?").bind(now(), m.id),
    adm.auditStmt("staff.remove", "member", m.id, { role }, { role: "" }, `${m.email} removed from the team`)]);
  return { body: { ok: true } };
}

/* ---------- Bassem monitor (read-only) ---------- */
/* Bassem's days left = Cairo days until the plan's end (plan_expires = the paid period, so it follows duration_days and every renewal or
   extension); a plan without an end date → null («بدون تاريخ انتهاء»). Never "365 − days since activation" (wrong after a renewal). */
export function bassemDaysLeft(m, nowMs = Date.now()) {
  const e = Date.parse((m && m.plan_expires) || "");
  if (isNaN(e)) return null;
  return Math.max(0, Math.round((Date.parse(cairoDay(e) + "T00:00:00Z") - Date.parse(cairoDay(nowMs) + "T00:00:00Z")) / 86400000));
}
export async function bassemList(env) {
  const plans = plansWithX("bassem");
  if (!plans.length) return { items: [] };
  const t = now(), since = iso(Date.now() - 30 * 86400000);
  const rows = await all(env, `SELECT * FROM members WHERE plan IN (${plans.map(() => "?").join(", ")}) AND (plan_expires = '' OR plan_expires > ?) ORDER BY activated_at DESC LIMIT 500`, ...plans, t);
  const ids = rows.map(r => r.id);
  const deals = new Map((await allIn(env, ph => `SELECT member_id, COUNT(*) AS n FROM deals WHERE stage NOT IN ('won', 'lost') AND member_id IN (${ph}) GROUP BY member_id`, ids)).map(r => [r.member_id, r.n]));
  const moods = new Map((await allIn(env, ph => `SELECT member_id, COUNT(*) AS n FROM wa_messages WHERE member_id IN (${ph}) AND flag = 'mood' AND created_at > ? GROUP BY member_id`, ids, since)).map(r => [r.member_id, r.n]));
  return { items: rows.map(m => { const p = prefsOut(m);
    return { member_id: m.id, company: m.company || "", name: m.name || "", title: m.title || "", plan: effPlan(m), activated_at: m.activated_at || "", plan_expires: m.plan_expires || "", days_left: bassemDaysLeft(m),
      wa_optin: !!p.wa_optin, wa_verified: !!m.wa_verified_at, morning_time: p.morning_time || "", session_time: p.session_time || "", days: p.days, pause: !!p.pause, morning_sent_day: m.morning_sent_day || "", call_sent_day: m.call_sent_day || "",
      deals_open: deals.get(m.id) || 0, last_seen_at: m.last_seen_at || "", mood_flags_30d: moods.get(m.id) || 0 }; }) };
}
export { jparse };
