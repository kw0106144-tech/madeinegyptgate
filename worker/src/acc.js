/* Admin Control Center API — the backend of panel.html (docs/janna/ACC-CONTRACT.md §0, §3.1; team dashboards §12).
   index.js (integrator, P-W1) builds CC = {acc, content, payments, email} and dispatches, BEFORE its existing lines:
     /api/admin/cc/*           → handleCC        (this router; /content /media → CC.content, /pay → CC.payments, /email → CC.email)
     /api/me/{account,products,company,media,invoices,recognize,gcc}[/*] → handleMeCC   (member self-service, acc-me.js)
     /api/auth/legacy[/*]      → handleLegacyAuth (old-password bridge, acc-legacy.js)
     /api/team/*               → handleTeam       (§12 front desk + whoami, acc-team.js)
     /api/plans /api/settings /api/ev/pv → handlePublicCC
     /api/index.php*           → handleOldApi     (transparent proxy to the old PHP API; built, not routed in deploy 2)
   /api/admin/cc/keys*: «مفاتيح الخدمات» (owner only, acc-keys.js) — respond.io token + channel, Anam key, the WhatsApp live switch;
     POST /keys/websearch/connect = «🔗 وصّل البحث بباسم» (acc-wsconnect.js: creates / updates the Anam tool bassem_web_search, attaches it to Bassem).
   /api/admin/cc/dev/*: «🛠️ المطوّر» (owner only, dev.manage, acc-dev.js) — feature switches (flags.js), deploys + rollback, health, audit.
   /api/admin/cc/meetings*: «📞 اجتماعات باسم» (owner + admin, meetings.bassem; the daily cap: owner only, meetings.cap — bassem-meetings.js)
     — Bassem (Anam) joins a Google Meet / Zoom / Teams call of the platform's team; Anam's list of his invites; cancel.
   ccBoot(env, CC) applies the plans matrix (≤ 1 D1 read per isolate per 60 s), the mail config and the service keys (service-keys.js);
   ccCron(env, nowMs, CC) runs the
   Control Center's cron jobs. Every /api/admin/cc/* request needs a v2 e-mail-code session with a Control Center role (or X-Platform-Key);
   every write is rate-limited (120/min per actor) and audit-logged. */
import { now, iso, cairoDay, ipHash, rateOk, safeEq, line, emailOn, secretOf } from "./common.js";
import { authUser, isLinkSession } from "./auth.js";
import { configSecretOk } from "./crypto.js";
import { ccJson, ccErr, ccPreflight, csvRes, csvText, errOf, HttpErr, fail, all, first, paging, hasTable, body as readBody, audit as auditInsert, auditStmt, auditDone, rid, roleOf, sessionVia, ROLE_PERMS, TEAM_ROLES, OWNER_ONLY, isBootstrap, jget, dateOk, dayStartIso, dayAfterIso } from "./acc-base.js";
import * as MEM from "./acc-members.js";
import * as ORD from "./acc-orders.js";
import * as PL from "./acc-plans.js";
import * as ST from "./acc-stats.js";
import * as IMP from "./acc-import.js";
import { handleOldApi, handleLegacyAuth, bridgeOrigin } from "./acc-legacy.js";
import { handleMeCC } from "./acc-me.js";
import { handleTeam } from "./acc-team.js";
import * as KEYS from "./acc-keys.js";
import { connectWebSearch } from "./acc-wsconnect.js"; // «🔗 وصّل البحث بباسم»: the Anam tool bassem_web_search + Bassem's persona, the secret never leaves the Worker
import { eraseMemory } from "./acc-memory.js";          // 0009: the owner's audited legal memory erasure (PDPL 151/2020)
import { listKnowledge, answerKnowledge } from "./knowledge.js"; // 0009: «بنك المعلومات» — «محتاجة إجابة» for the team
import { loadServiceKeys } from "./service-keys.js";
import { userOut } from "./common.js";
import * as DEV from "./acc-dev.js";                  // «🛠️ المطوّر» — the owner-only developer panel
import { loadFeatures } from "./flags.js";           // the feature switches (≤ 1 D1 read per isolate per 30 s)
import * as BMEET from "./bassem-meetings.js";        // «📞 اجتماعات باسم» — Bassem joins the team's Meet / Zoom / Teams calls (Anam Meetings API)

export { handleOldApi, handleLegacyAuth, handleMeCC, handleTeam };
export { setPlan, setGcc } from "./acc-members.js";
export { applyPlans, planCanX as planCan, planLimitX as planLimit, plansWithX as plansWith, rewritePrompt, personaSync } from "./acc-plans.js";
export { neutral, roleOf, ROLE_PERMS, PERMS, OWNER_ONLY } from "./acc-base.js";
/* audit(env, e) — §0.6 (e = {actor_id, actor_email, actor_role, action, target_type, target_id, summary, before, after, ip_hash, req_id}) */
export const audit = auditInsert;

/* ---------- boot & cron ---------- */
export async function ccBoot(env, CC) {
  try { await PL.bootPlans(env); } catch (e) { /* defaults stay */ }
  try { if (CC && CC.email && typeof CC.email.loadMailConfig === "function") await CC.email.loadMailConfig(env); } catch (e) { /* defaults stay */ }
  try { await loadServiceKeys(env); } catch (e) { /* empty view: no panel keys, WhatsApp switch off (fail-closed) */ }
  try { await loadFeatures(env); } catch (e) { /* the defaults */ }
}
export async function ccCron(env, nowMs = Date.now(), CC) {
  const out = {};
  if (!env || !env.DB) return out;
  const jobs = [
    ["payments", () => CC && CC.payments && typeof CC.payments.paymentsCron === "function" ? CC.payments.paymentsCron(env, nowMs, CC) : { skipped: "no module" }],
    ["content", () => CC && CC.content && typeof CC.content.contentCron === "function" ? CC.content.contentCron(env, nowMs, CC) : { skipped: "no module" }],
    ["email", () => CC && CC.email && typeof CC.email.emailCron === "function" ? CC.email.emailCron(env, nowMs) : { skipped: "no module" }],
    ["acc", () => accCron(env, nowMs, CC)],
  ];
  for (const [k, fn] of jobs) { try { out[k] = await fn(); } catch (e) { out[k] = { error: String((e && e.message) || e) }; console.error("cc cron " + k, e && e.stack || e); } }
  return out;
}
export async function accCron(env, nowMs = Date.now(), CC) {
  const out = {};
  if (!(await hasTable(env, "cc_pv_seen"))) return { skipped: "no 0006 tables" };
  const t = iso(nowMs);
  out.pv_seen = (await env.DB.prepare("DELETE FROM cc_pv_seen WHERE day < ?").bind(cairoDay(nowMs - 2 * 86400000)).run()).meta.changes || 0;
  out.session_meta = (await env.DB.prepare("DELETE FROM cc_session_meta WHERE sid_hash NOT IN (SELECT sid_hash FROM auth_sessions WHERE expires_at > ? AND revoked_at = '')").bind(t).run()).meta.changes || 0;
  const daily = await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES ('acc-purge', ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(cairoDay(nowMs), t).run();
  if (daily.meta && daily.meta.changes) out.audit = (await env.DB.prepare("DELETE FROM cc_audit WHERE at < ?").bind(iso(nowMs - 730 * 86400000)).run()).meta.changes || 0;
  try { out.persona = await PL.personaRetry(env, nowMs, CC); } catch (e) { out.persona = { error: String((e && e.message) || e) }; }
  return out;
}

/* ---------- public JSON: /api/plans, /api/settings, /api/ev/pv ---------- */
export async function handlePublicCC(req, env, ctx, CC) {
  env = env || {};
  const path = new URL(req.url).pathname;
  if (/\/api\/ev\/pv\/?$/.test(path)) return ST.pageView(req, env);
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  if (req.method !== "GET" && req.method !== "HEAD") return ccErr(req, env, 405, "method", "method not allowed");
  try {
    if (env.DB && !(await rateOk(env, "pubcc|" + (await ipHash(req, env)), 60, 60))) return ccErr(req, env, 429, "rate_limited", "too many requests", { retry_s: 60 });
    const body = /\/api\/plans\/?$/.test(path) ? await PL.publicPlans(env) : /\/api\/settings\/?$/.test(path) ? await PL.publicSettings(env) : null;
    if (!body) return ccErr(req, env, 404, "not_found", "not found");
    return ccJson(req, env, body, 200, { "Cache-Control": "public, max-age=60" });
  } catch (e) { console.error("public cc", e && e.message); return ccErr(req, env, 500, "server", "server error"); }
}

/* ---------- /api/admin/cc/* ---------- */
const adminish = adm => ["owner", "admin", "platform"].includes(adm.role);
const R = (m, rx, perm, fn, o = {}) => ({ m, rx, perm, fn, ...o });
const P = s => new RegExp("^" + s.replace(/:id/g, "([A-Za-z0-9_.-]{1,64})") + "$");
async function whoami(env, adm) {
  let pay = false, email = false, anam = !!env.ANAM_API_KEY;
  try { if (adm.CC && adm.CC.payments && typeof adm.CC.payments.payReady === "function") pay = !!(await adm.CC.payments.payReady(env)).ready; } catch (e) { pay = false; }
  try { email = adm.CC && adm.CC.email && typeof adm.CC.email.mailReady === "function" ? !!adm.CC.email.mailReady(env) : emailOn(env); } catch (e) { email = false; }
  if (!anam) { try { anam = !!(await loadServiceKeys(env)).anam_key; } catch (e) { anam = false; } }
  return { user: adm.member ? userOut(env, adm.member) : null, role: adm.role, perms: adm.perms, bootstrap_owner: !!(adm.member && isBootstrap(env, adm.member)), lang_default: "ar", site: "https://madeinegyptgate.com/",
    features: { overlay_kv: !!env.SEO_KV, media_r2: !!env.MEDIA, config_secret: configSecretOk(env), email_ready: email, pay_ready: pay, legacy_origin: !!bridgeOrigin(env), anam, ...KEYS.keyFeatures(env, adm), ...(await DEV.devFeatures(env, adm)) } };
}
async function auditList(env, url, csv) {
  const where = [], args = [];
  const actor = line(url.searchParams.get("actor"), 254), action = line(url.searchParams.get("action"), 60), tt = line(url.searchParams.get("target_type"), 40), tid = line(url.searchParams.get("target_id"), 160);
  const from = line(url.searchParams.get("from"), 10), to = line(url.searchParams.get("to"), 10), before = parseInt(url.searchParams.get("before"), 10);
  if (actor) { where.push("(actor_id = ? OR actor_email = ?)"); args.push(actor, actor.toLowerCase()); }
  if (action) { if (action.includes(".")) { where.push("action = ?"); args.push(action); } else { where.push("action LIKE ?"); args.push(action.replace(/[%_]/g, "") + ".%"); } }
  if (tt) { where.push("target_type = ?"); args.push(tt); }
  if (tid) { where.push("target_id = ?"); args.push(tid); }
  if (from && dateOk(from)) { where.push("at >= ?"); args.push(dayStartIso(from)); }
  if (to && dateOk(to)) { where.push("at < ?"); args.push(dayAfterIso(to)); }
  if (Number.isInteger(before) && before > 0 && !csv) { where.push("id < ?"); args.push(before); }
  const lim = csv ? 20000 : Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50));
  const rows = (await all(env, `SELECT * FROM cc_audit ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`, ...args, lim)).map(MEM.auditOut);
  return csv ? rows : { items: rows, next_before: rows.length === lim ? rows[rows.length - 1].id : null };
}
const ROUTES = [
  R("GET", P("/whoami"), null, (q, e, c, a) => whoami(e, a)),
  R("GET", P("/badges"), "stats.read", (q, e) => ST.badges(e)),
  R("GET", P("/stats"), "stats.read", (q, e, c, a, u) => ST.stats(e, u, a.CC, a)),
  R("GET", P("/members"), "members.read", (q, e, c, a, u) => MEM.listMembers(e, u)),
  R("GET", P("/members\\.csv"), "members.read", async (q, e, c, a, u) => ({ csv: "members", text: await MEM.membersCsv(e, u) }), { adminOnly: true }),
  R("POST", P("/members"), "members.write", (q, e, c, a) => MEM.createMember(q, e, c, a)),
  R("GET", P("/members/:id"), "members.read", (q, e, c, a, u, m) => MEM.memberDetail(e, m[1], a)),
  R("PATCH", P("/members/:id"), ["members.write", "members.contact"], (q, e, c, a, u, m) => MEM.patchMember(q, e, c, a, m[1])),
  R("DELETE", P("/members/:id"), "members.delete", (q, e, c, a, u, m) => MEM.deleteMember(q, e, c, a, m[1])),
  R("POST", P("/members/:id/plan"), "members.plan", (q, e, c, a, u, m) => MEM.postPlan(q, e, c, a, m[1])),
  R("POST", P("/members/:id/gcc"), "members.plan", (q, e, c, a, u, m) => MEM.postGcc(q, e, c, a, m[1])),
  R("POST", P("/members/:id/status"), "members.plan", (q, e, c, a, u, m) => MEM.postStatus(q, e, c, a, m[1])),
  R("POST", P("/members/:id/extend"), "members.plan", (q, e, c, a, u, m) => MEM.postExtend(q, e, c, a, m[1])),
  R("POST", P("/members/:id/invite"), "members.write", (q, e, c, a, u, m) => MEM.postInvite(q, e, c, a, m[1])),
  R("POST", P("/members/:id/sessions/revoke"), "members.plan", (q, e, c, a, u, m) => MEM.revokeSessions(q, e, c, a, m[1])),
  R("GET", P("/customers"), "customers.read", (q, e, c, a, u) => MEM.listCustomers(e, u)),
  R("GET", P("/customers\\.csv"), "customers.read", async (q, e, c, a, u) => ({ csv: "customers", text: await MEM.customersCsv(e, u) }), { adminOnly: true }),
  R("GET", P("/customers/:id"), "customers.read", (q, e, c, a, u, m) => MEM.customerDetail(e, m[1])),
  R("PUT", P("/customers/:id/note"), "customers.write", (q, e, c, a, u, m) => MEM.putCustomerNote(q, e, c, a, m[1])),
  R("GET", P("/legacy/companies"), "legacy.contacts", (q, e, c, a, u) => ORD.legacyCompanies(e, u)),
  R("PATCH", P("/legacy/companies/:id"), "directory.link", (q, e, c, a, u, m) => ORD.patchLegacyCompany(q, e, c, a, m[1])),
  R("GET", P("/legacy/messages"), "orders.read", (q, e, c, a, u) => ORD.legacyMessages(e, u)),
  R("PATCH", P("/legacy/messages/:id"), "orders.note", (q, e, c, a, u, m) => ORD.patchLegacyMessage(q, e, c, a, m[1])),
  R("DELETE", P("/legacy/messages/:id"), "orders.close", (q, e, c, a, u, m) => ORD.deleteLegacyMessage(q, e, c, a, m[1]), { adminOnly: true }),
  R("GET", P("/orders"), "orders.read", (q, e, c, a, u) => ORD.listOrders(e, u)),
  R("GET", P("/orders\\.csv"), "orders.read", async (q, e, c, a, u) => ({ csv: "orders", text: await ORD.ordersCsv(e, u) }), { adminOnly: true }),
  R("GET", P("/orders/:id"), "orders.read", (q, e, c, a, u, m) => ORD.orderDetail(e, m[1], a)),
  R("POST", P("/orders/:id/team-reply"), "orders.reply", (q, e, c, a, u, m) => ORD.orderTeamReply(q, e, c, a, m[1], false)),
  R("POST", P("/orders/:id/note"), "orders.note", (q, e, c, a, u, m) => ORD.orderNote(q, e, c, a, m[1])),
  R("POST", P("/orders/:id/close"), "orders.close", (q, e, c, a, u, m) => ORD.orderTeamReply(q, e, c, a, m[1], true)),
  R("GET", P("/orders/:id/candidates"), "orders.read", (q, e, c, a, u, m) => ORD.orderCandidates(e, m[1], a, false)),
  R("POST", P("/orders/:id/candidates/refresh"), "orders.read", (q, e, c, a, u, m) => ORD.orderCandidates(e, m[1], a, true)),
  R("GET", P("/approvals"), ["approvals.products", "approvals.company", "content.publish"], (q, e, c, a, u) => ORD.listApprovals(e, u, a)),
  R("POST", P("/approvals/desk/:id/approve"), "content.publish", async (q, e, c, a, u, m) => deskReview(e, a, m[1], "approve", await body0(q))),
  R("POST", P("/approvals/desk/:id/reject"), "content.publish", async (q, e, c, a, u, m) => deskReview(e, a, m[1], "reject", await body0(q))),
  R("POST", P("/approvals/product/:id/approve"), "approvals.products", async (q, e, c, a, u, m) => ORD.approveProduct(e, a, m[1], await body0(q))),
  R("POST", P("/approvals/product/:id/reject"), "approvals.products", async (q, e, c, a, u, m) => ORD.rejectProduct(e, a, m[1], await body0(q))),
  R("POST", P("/approvals/company/:id/approve"), "approvals.company", async (q, e, c, a, u, m) => ORD.approveCompany(e, a, m[1], await body0(q))),
  R("POST", P("/approvals/company/:id/reject"), "approvals.company", async (q, e, c, a, u, m) => ORD.rejectCompany(e, a, m[1], await body0(q))),
  R("POST", P("/approvals/products/approve"), "approvals.products", async (q, e, c, a) => ORD.bulkApprove(e, a, await body0(q))),
  R("GET", P("/plans"), "plans.read", (q, e) => PL.getPlans(e)),
  R("PUT", P("/plans"), "plans.write", (q, e, c, a) => PL.putPlans(q, e, c, a)),
  R("POST", P("/plans/persona-sync"), "plans.sync", (q, e, c, a) => PL.postPersonaSync(q, e, c, a)),
  R("POST", P("/rfqs"), "orders.rfq", (q, e, c, a) => ORD.manualRfq(q, e, c, a)),
  R("GET", P("/settings"), "settings.read", (q, e) => PL.getSettings(e)),
  R("PUT", P("/settings"), "settings.write", (q, e, c, a) => PL.putSettings(q, e, c, a)),
  R("GET", P("/staff"), "staff.read", (q, e) => MEM.listStaff(e)),
  R("POST", P("/staff"), "staff.write", (q, e, c, a) => MEM.addStaff(q, e, c, a)),
  R("PATCH", P("/staff/:id"), "staff.write", (q, e, c, a, u, m) => MEM.patchStaff(q, e, c, a, m[1])),
  R("DELETE", P("/staff/:id"), "staff.write", (q, e, c, a, u, m) => MEM.deleteStaff(q, e, c, a, m[1])),
  R("GET", P("/audit"), "audit.read", (q, e, c, a, u) => auditList(e, u, false)),
  R("GET", P("/audit\\.csv"), "audit.export", async (q, e, c, a, u) => ({ csv: "audit", text: csvText(["id", "at", "actor_id", "actor_email", "actor_role", "action", "target_type", "target_id", "summary", "before", "after", "ip_hash", "req_id"], await auditList(e, u, true)) })),
  R("GET", P("/reports/summary"), "reports.read", (q, e, c, a, u) => ST.reportSummary(e, u)),
  R("GET", /^\/reports\/([a-z]+)\.csv$/, "reports.export", async (q, e, c, a, u, m) => { if (!ST.REPORT_SETS.includes(m[1])) fail(404, "not_found", "unknown dataset", { datasets: ST.REPORT_SETS });
    return { csv: "report-" + m[1], text: await ST.reportCsv(e, u, m[1], { orderCsvRow: ORD.orderCsvRow, membersCsv: MEM.membersCsv, customersCsv: MEM.customersCsv }) }; }),
  R("GET", P("/bassem"), "bassem.read", (q, e) => MEM.bassemList(e)),
  // 0009 memory: the ONLY erasure = the owner's (members.delete ∈ OWNER_ONLY) legal data-subject request, one person per call, audited
  R("POST", P("/memory/erase"), "members.delete", (q, e, c, a) => eraseMemory(q, e, c, a)),
  // 0009 «بنك المعلومات»: the questions asked to Janna / Bassem — list («محتاجة إجابة» first), answer / approve / hide (audited)
  R("GET", P("/knowledge"), "content.read", (q, e, c, a, u) => listKnowledge(e, u)),
  R("PUT", P("/knowledge/:id"), "content.write", async (q, e, c, a, u, m) => answerKnowledge(e, a.actor, m[1], await body0(q), { ipHash: a.ipHash, reqId: a.reqId })),
  R("POST", P("/import/runs"), "import.run", (q, e, c, a) => IMP.startRun(q, e, c, a)),
  R("GET", P("/import/runs"), "import.run", (q, e) => IMP.listRuns(e)),
  R("GET", P("/import/runs/:id"), "import.run", (q, e, c, a, u, m) => IMP.getRun(e, m[1])),
  R("POST", P("/import/runs/:id/batch"), "import.run", (q, e, c, a, u, m) => IMP.runBatch(q, e, c, a, m[1])),
  R("POST", P("/import/runs/:id/finish"), "import.run", (q, e, c, a, u, m) => IMP.finishRun(q, e, c, a, m[1])),
  // «مفاتيح الخدمات» (owner only — keys.manage ∈ OWNER_ONLY): status, write-only slots, provider tests, the WhatsApp test message and switch
  R("GET", P("/keys"), "keys.manage", (q, e, c, a) => KEYS.getKeys(e, a)),
  R("POST", P("/keys/wa-test"), "keys.manage", (q, e, c, a) => KEYS.waTest(q, e, c, a)),
  R("POST", P("/keys/wa-live"), "keys.manage", (q, e, c, a) => KEYS.waLiveSwitch(q, e, c, a)),
  R("POST", P("/keys/websearch/connect"), "keys.manage", (q, e, c, a) => connectWebSearch(q, e, c, a)),
  R("POST", P("/keys/:id/test"), "keys.manage", (q, e, c, a, u, m) => KEYS.testKey(q, e, c, a, m[1])),
  R("PUT", P("/keys/:id"), "keys.manage", (q, e, c, a, u, m) => KEYS.putKey(q, e, c, a, m[1])),
  R("DELETE", P("/keys/:id"), "keys.manage", (q, e, c, a, u, m) => KEYS.deleteKey(q, e, c, a, m[1])),
  // «🛠️ المطوّر» (owner only — dev.manage ∈ OWNER_ONLY): feature switches, the Cloudflare deploys + rollback, health, its own audit
  R("GET", P("/dev/features"), "dev.manage", (q, e) => DEV.getFeatures(e)),
  R("PUT", P("/dev/features"), "dev.manage", (q, e, c, a) => DEV.putFeatures(q, e, c, a)),
  R("GET", P("/dev/deploys"), "dev.manage", (q, e, c, a, u) => DEV.getDeploys(e, a, u)),
  R("POST", P("/dev/deploys/rollback"), "dev.manage", (q, e, c, a) => DEV.postRollback(q, e, c, a)),
  R("GET", P("/dev/health"), "dev.manage", (q, e, c, a) => DEV.getHealth(q, e, c, a)),
  R("GET", P("/dev/audit"), "dev.manage", (q, e, c, a, u) => DEV.devAudit(e, u)),
  // «📞 اجتماعات باسم» (meetings.bassem: owner + admin; the cap: meetings.cap ∈ OWNER_ONLY) — every invite uses paid Anam minutes
  R("GET", P("/meetings"), "meetings.bassem", (q, e, c, a, u) => BMEET.listMeetings(q, e, c, a, u)),
  R("POST", P("/meetings"), "meetings.bassem", (q, e, c, a) => BMEET.createMeeting(q, e, c, a)),
  R("PUT", P("/meetings/cap"), "meetings.cap", (q, e, c, a) => BMEET.putCap(q, e, c, a)),
  R("POST", P("/meetings/:id/cancel"), "meetings.bassem", (q, e, c, a, u, m) => BMEET.cancelMeeting(q, e, c, a, m[1])),
];
const body0 = req => readBody(req);
/* data rows of a CSV text (quote-aware: a quoted cell may hold a line break); the header line is not counted */
export function csvRows(text) {
  let n = 0, q = false; const s = String(text || "");
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 34) q = !q; else if (c === 10 && !q) n++; }
  return Math.max(0, n - 1);
}
/* review L4: every bulk export of personal data leaves ONE audit row (who, which dataset, the filters, how many rows — never the data),
   written BEFORE the file is handed out; a failing audit insert means no file (fail-closed like every audited action) */
export async function auditExport(adm, dataset, url, rows) {
  const filters = {}; for (const [k, v] of url.searchParams) if (Object.keys(filters).length < 20) filters[line(k, 40)] = line(v, 200);
  await adm.audit("export." + line(dataset, 40), "export", dataset, null, { filters, rows }, `${dataset}.csv — ${rows} rows`);
}
/* §12.3 desk drafts: approve (corrections + publish; tenders/projects need their source) / reject (reason) — content.js deskReview */
async function deskReview(env, adm, id, act, b) {
  if (!adm.CC || !adm.CC.content || typeof adm.CC.content.deskReview !== "function") fail(503, "content_off", "the content module is not available");
  return adm.CC.content.deskReview(env, adm, id, act, b || {});
}
export const ROUTE_TABLE = ROUTES.map(r => ({ m: r.m, rx: r.rx, perm: r.perm, adminOnly: !!r.adminOnly }));
const denied = (req, env, perm) => ccErr(req, env, 403, OWNER_ONLY.has(perm) ? "owner_only" : "forbidden", OWNER_ONLY.has(perm) ? "للمالك بس / owner only" : "غير مصرّح لك / not allowed", { need: perm });
const delegate = async (req, env, ctx, adm, fn, name) => (typeof fn === "function" ? fn(req, env, ctx, adm) : ccErr(req, env, 503, "module_off", `the ${name} module is not available`));

export async function handleCC(req, env, ctx, CC) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/admin\/cc/, "").replace(/\/+$/, "") || "/", M = req.method;
  try {
    if (!env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    let member = null, role = null;
    const pk = req.headers.get("X-Platform-Key") || "";
    if (pk && env.PLATFORM_KEY && safeEq(pk, env.PLATFORM_KEY)) role = "platform";
    else {
      member = await authUser(req, env);
      if (!member) return ccErr(req, env, 401, "unauthorized", "sign in required");
      const via = await sessionVia(env, member); // an old-password session first: its own answer (it is also link-scoped, auth.js)
      if (via === "legacy") return ccErr(req, env, 403, "use_email_code", "لوحة الإدارة محتاجة دخول بكود على الإيميل / the admin panel needs an e-mail-code sign-in");
      if (isLinkSession(member)) return ccErr(req, env, 403, "full_login_required", "signed in by an e-mail link: sign in with an e-mail code", { login: "code" });
      role = await roleOf(env, member, via);
      if (!role) return ccErr(req, env, 403, "forbidden", "غير مصرّح لك بدخول هذه الصفحة / you may not open this page");
      if (TEAM_ROLES[role]) return ccErr(req, env, 403, "forbidden", "غير مصرّح لك بدخول هذه الصفحة — لوحة فريقك / you may not open this page — use your team page", { team: role, team_page: TEAM_ROLES[role] });
    }
    const perms = ROLE_PERMS[role] || [], set = new Set(perms);
    const actor = member ? { actor_id: member.id, actor_email: member.email || "", actor_role: role } : { actor_id: "platform", actor_email: "", actor_role: "platform" };
    const ih = await ipHash(req, env), reqId = line(req.headers.get("cf-ray") || "", 40) || rid(12), lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
    if (M !== "GET" && M !== "HEAD" && !(await rateOk(env, "ccw|" + actor.actor_id, 120, 60))) return ccErr(req, env, 429, "rate_limited", "too many changes in a minute — wait a little", { retry_s: 60 });
    const adm = { member, role, perms, platform: role === "platform", can: p => set.has(p), actor, ipHash: ih, reqId, lang, CC,
      audit: (action, type, id, before, after, summary) => auditInsert(env, { ...actor, action, target_type: type, target_id: id, before, after, summary, ip_hash: ih, req_id: reqId }),
      auditStmt: (action, type, id, before, after, summary) => auditStmt(env, { ...actor, action, target_type: type, target_id: id, before, after, summary, ip_hash: ih, req_id: reqId }),
      auditDone: (id, patch) => auditDone(env, id, patch) };
    if (/^\/(content|media)(\/|$)/.test(path)) return await delegate(req, env, ctx, adm, CC && CC.content && CC.content.handleContentAdmin, "content");
    if (/^\/pay(\/|$)/.test(path)) return await delegate(req, env, ctx, adm, CC && CC.payments && CC.payments.handlePayAdmin, "payments");
    if (/^\/email(\/|$)/.test(path)) return await delegate(req, env, ctx, adm, CC && CC.email && CC.email.handleEmailAdmin, "e-mail");
    let wrongMethod = false;
    for (const r of ROUTES) {
      const m = r.rx.exec(path); if (!m) continue;
      if (r.m !== M && !(r.m === "GET" && M === "HEAD")) { wrongMethod = true; continue; }
      const need = Array.isArray(r.perm) ? r.perm : r.perm ? [r.perm] : [];
      if (need.length && !need.some(p => adm.can(p))) return denied(req, env, need[0]);
      if (r.adminOnly && !adminish(adm)) return ccErr(req, env, 403, "forbidden", "للمالك والمدير بس / owner and admin only", { need: "admin" });
      const out = await r.fn(req, env, ctx, adm, url, m);
      if (out && out.csv) { await auditExport(adm, out.csv, url, csvRows(out.text)); return csvRes(req, env, out.csv, out.text, cairoDay()); }
      if (out && out.body !== undefined) return ccJson(req, env, out.body, out.status || 200);
      return ccJson(req, env, out);
    }
    return wrongMethod ? ccErr(req, env, 405, "method", "method not allowed") : ccErr(req, env, 404, "not_found", "not found");
  } catch (e) {
    if (e instanceof HttpErr || (e && e.status && e.code)) return errOf(req, env, e);
    console.error("cc error", e && e.stack || e);
    return ccErr(req, env, 500, "server", "server error");
  }
}
export { jget, first, now, secretOf };
