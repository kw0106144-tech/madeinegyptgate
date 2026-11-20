// node --test for the Admin Control Center core (worker/src/acc.js + acc-*.js) — ACC-CONTRACT §11.1 and the team addendum §12.4.
// Run: cd worker && node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/acc.test.mjs
// No network: fetch is mocked per test (Resend, the old PHP API, Anam); any other URL fails the test. Other areas are a fake CC.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { D1 } from "./helpers.mjs";
import * as ACC from "../src/acc.js";
import * as BASE from "../src/acc-base.js";
import * as PL from "../src/acc-plans.js";
import * as ST from "../src/acc-stats.js";
import * as C from "../src/common.js";
import * as ADV from "../src/advisor.js";
import { issueSession, signSession } from "../src/auth.js";
import { handleInquiries } from "../src/inquiries.js";
import { handleAdmin } from "../src/admin.js";
import { handleProfile } from "../src/profile.js";
import DATA from "../src/data.json"; // the build index the Worker ships: deploy.sh worker regenerates it (with or without DATA.n)

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const PW5 = readFileSync(new URL("../src/inquiries.js", import.meta.url), "utf8").includes("mig.cc.internal");
const SITE = "https://madeinegyptgate.com";
const OLD = "https://old.mig.test/egypt";
let sent, fetchLog, handlers, realFetch, logs;
function mockFetch() {
  sent = []; fetchLog = []; handlers = [];
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null, url = String(req ? req.url : input), method = (init && init.method) || (req && req.method) || "GET";
    fetchLog.push({ url, method });
    if (url.startsWith("https://api.resend.com/")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text, headers: b.headers || {}, reply_to: b.reply_to }); return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 }); }
    for (const h of handlers) { const r = await h(url, init, req, method); if (r) return r; }
    throw new Error("unexpected fetch " + method + " " + url);
  };
}
beforeEach(() => { realFetch = globalThis.fetch; mockFetch(); logs = []; });
afterEach(() => { globalThis.fetch = realFetch; });

function mkEnv(extra = {}) {
  const DB = new D1(); DB.db.exec(MIG); DB.db.exec(MIG); // idempotent: applied twice
  return { DB, ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "owner@mig.test", CC_ORIGINS: "http://localhost:8780", PLATFORM_KEY: "pk-test-123", ...extra };
}
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
async function mkMember(env, email, o = {}) {
  const id = o.id || "u" + hex(8), t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, role, factory_ref, name, phone, plan_expires, sector, products) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, o.company || "Co " + email, email, o.plan || "visitor", o.verified === false ? 0 : 1, o.created_at || t, t, o.emailVerified === false ? "" : t, o.role || "user", o.factory_ref || "", o.name || "", o.phone || "", o.plan_expires || "", o.sector || "", o.products || "").run();
  if (o.staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, o.staff, t, t).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
const tokenOf = async (env, m) => (await issueSession(env, m)).token;
async function staffTok(env, role, email) { const m = await mkMember(env, email || role + "@mig.test", role === "owner" ? {} : { staff: role, role: BASE.MEMBER_ROLE[role] }); return { m, token: await tokenOf(env, m) }; }
async function ownerTok(env) { const m = await mkMember(env, "owner@mig.test"); return { m, token: await tokenOf(env, m) }; }
function mkCtx() { const p = []; return { p, waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
function fakeCC(env) {
  const log = [];
  const content = {
    async upsert(e, a) { log.push(["upsert", JSON.parse(JSON.stringify(a))]); if (a.fields && a.fields.__fail) throw Object.assign(new Error("bad field"), { status: 422, code: "invalid", errors: [{ field: "x", msg: "bad" }] });
      const id = a.id || (a.coll === "fac" ? "c-" + BASE.rid(8) : a.coll === "prod" ? "p-" + BASE.rid(8) : a.coll + "-" + BASE.rid(6)), t = new Date().toISOString();
      await e.DB.prepare("INSERT INTO cc_content (id, coll, kind, base_key, state, draft_json, live_json, private_json, source, member_id, rev, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET draft_json = excluded.draft_json, live_json = excluded.live_json, state = excluded.state, rev = cc_content.rev + 1, updated_at = excluded.updated_at")
        .bind(id, a.coll, a.kind, a.base_key || "", a.publish ? "published" : "draft", JSON.stringify(a.fields || {}), a.publish ? JSON.stringify(a.fields || {}) : "", JSON.stringify(a.private || {}), a.source || "admin", a.member_id || "", a.by || "", t, a.by || "", t).run();
      return { item: { id, coll: a.coll }, published_v: a.publish ? 1763460000123 : undefined }; },
    async setHidden(e, a) { log.push(["setHidden", a]); return { ok: true }; },
    async mediaPublic(e, ids) { log.push(["mediaPublic", ids]); await e.DB.prepare(`UPDATE cc_media SET status = 'public' WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run(); },
    async publishOverlay(e, a) { log.push(["publishOverlay", a]); return { v: 1763460000999, bytes: 100 }; },
    async handleContentAdmin(req, e, ctx, adm) { log.push(["contentAdmin", adm.role, new URL(req.url).pathname]); return new Response(JSON.stringify({ ok: true, delegated: "content", role: adm.role }), { status: 200, headers: { "Content-Type": "application/json" } }); },
    async handleMemberMedia(req, e, ctx, m) { log.push(["memberMedia", m.id]); return new Response(JSON.stringify({ media: { id: "m1" } }), { status: 201 }); },
  };
  const payments = {
    async handlePayAdmin(req, e, ctx, adm) { log.push(["payAdmin", adm.role]); return new Response(JSON.stringify({ ok: true, delegated: "pay" }), { status: 200 }); },
    async payReady() { return { ready: false, provider: "", manual: false }; },
    async issueInvoice(e, a) { log.push(["issueInvoice", a]); return { invoice: { no: "INV-2026-000001", total_minor: 1140000 } }; },
    async createMemberInvoice(e, m, plan) { log.push(["createMemberInvoice", plan]); return { invoice: { no: "INV-2026-000002", total_minor: 1140000, pay_token: "tok" } }; },
  };
  const email = { async handleEmailAdmin(req, e, ctx, adm) { log.push(["emailAdmin", adm.role]); return new Response(JSON.stringify({ ok: true, delegated: "email" }), { status: 200 }); }, mailReady: () => true };
  return { log, CC: { acc: ACC, content, payments, email } };
}
/* index.js dispatch (§3.0) for the paths these tests use */
async function api(env, CC, method, path, { token, body, headers = {}, ip = "10.0.0.1", ua = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120 test", raw } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": ua, ...headers };
  if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const req = new Request(SITE + path, { method, headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const ctx = mkCtx(), p = new URL(req.url).pathname;
  await ACC.ccBoot(env, CC);
  let res;
  if (/^\/api\/index\.php$/.test(p)) res = await ACC.handleOldApi(req, env, ctx);
  else if (/\/api\/admin\/cc(\/|$)/.test(p)) res = await ACC.handleCC(req, env, ctx, CC);
  else if (/\/api\/me\/(account|products|company|media|invoices|recognize|gcc)(\/|$)/.test(p)) res = await ACC.handleMeCC(req, env, ctx, CC);
  else if (/\/api\/auth\/legacy(\/|$)/.test(p)) res = await ACC.handleLegacyAuth(req, env, ctx, CC);
  else if (/\/api\/team(\/|$)/.test(p)) res = await ACC.handleTeam(req, env, ctx, CC);
  else if (/\/api\/plans\/?$/.test(p) || /\/api\/settings\/?$/.test(p) || /\/api\/ev\/pv\/?$/.test(p)) res = await ACC.handlePublicCC(req, env, ctx, CC);
  else if (/\/api\/inquiries(\/|$)/.test(p)) res = await handleInquiries(req, env, ctx);
  else if (/\/api\/admin(\/|$)/.test(p)) res = await handleAdmin(req, env, ctx);
  else throw new Error("no route " + p);
  await ctx.done();
  let data = null; const text = await res.clone().text(); try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text, res, headers: res.headers };
}
const RFQ = { kind: "rfq", name: "Ahmed Buyer", company: "Buyer Co", email: "buyer@buyer.test", phone: "+20 100 123 4567", message: "محتاجين براميل بلاستيكية سعة 220 لتر", payload: { product: "براميل بلاستيك", sector: "الصناعات البلاستيكية", governorate: "الجيزة", quantity: "500" } };
const auditRows = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results;

/* ===================================================================== 1. migration */
describe("migration 0006", () => {
  test("applies twice on schema.sql: every cc_* table, the seeds, no ALTER TABLE, team roles allowed", async () => {
    const env = mkEnv();
    const t = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc_%'").all()).results.map(r => r.name);
    assert.equal(t.length, 32); // + cc_delete_requests (0010, appended to schema.sql)
    for (const n of ["cc_staff", "cc_session_meta", "cc_audit", "cc_member_meta", "cc_plans", "cc_plan_keys", "cc_settings", "cc_secrets", "cc_content", "cc_overlay", "cc_media", "cc_invoices", "cc_pv_day", "cc_persona_sync", "cc_import_runs", "cc_legacy_companies"]) assert.ok(t.includes(n), n);
    assert.ok(!MIG.split("\n").some(l => /^\s*ALTER TABLE/i.test(l)));
    const plans = (await env.DB.prepare("SELECT * FROM cc_plans ORDER BY sort").all()).results;
    assert.equal(plans.length, 6);
    // the 0006 seed = the code defaults before the owner's matrix of 2026-11-18: profile m_local 1 / alerts 1, no built-in gcc_pick / procurement
    // (code-only keys, merged by plansData / applyPlans; the Control Center PUT of DESIGN §6 brings production in line)
    const SEED_DIFF = { profile: { m_local: 1, alerts: 1 } };
    for (const p of plans) { const d = PL.DEFAULT_PLANS[p.plan]; assert.deepEqual([p.name_ar, p.name_en, p.price_egp, p.duration_days, p.sellable], [d.name_ar, d.name_en, d.price_egp, d.duration_days, d.sellable], p.plan);
      const code = { ...d.caps, ...(SEED_DIFF[p.plan] || {}) }; delete code.gcc_pick; delete code.procurement; assert.deepEqual(JSON.parse(p.caps_json), code, p.plan); }
    assert.deepEqual(plans.map(p => [p.plan, p.price_egp]), [["visitor", 0], ["profile", 4000], ["basic", 10000], ["premium", 25000], ["partner", 50000], ["strategic", 100000]]);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_plan_keys").first()).n, 17);
    const s = Object.fromEntries((await env.DB.prepare("SELECT k, v FROM cc_settings").all()).results.map(r => [r.k, r.v]));
    assert.equal(s.vat_bp, "1400"); assert.equal(s["mail.from_email"], "noreply@madeinegyptgate.com"); assert.equal(s["mail.provider"], "resend"); assert.equal(s["pay.enabled"], "0"); assert.equal(s.whatsapp_number, "201279188996");
    for (const k of Object.keys(PL.PUBLIC_KEYS)) assert.ok(k in s, "seeded " + k);
    const m = await mkMember(env, "x@mig.test", { staff: "seo" }); // the §12 roles pass the CHECK
    await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES ('z1', 'data', 'x', 'x')").run();
    await assert.rejects(env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES ('z2', 'boss', 'x', 'x')").run());
    assert.ok(m);
  });
});

/* ===================================================================== 2. roles */
describe("roles (§0.5, §12.1)", () => {
  test("401 without a token; 403 for a plain member; bootstrap owner needs a verified mailbox; staff, legacy admin flag, platform key", async () => {
    const env = mkEnv(), { CC } = fakeCC(env);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/whoami")).status, 401);
    const plain = await mkMember(env, "plain@mig.test");
    const r1 = await api(env, CC, "GET", "/api/admin/cc/whoami", { token: await tokenOf(env, plain) });
    assert.deepEqual([r1.status, r1.data.code], [403, "forbidden"]);
    const own = await ownerTok(env);
    const r2 = await api(env, CC, "GET", "/api/admin/cc/whoami", { token: own.token });
    assert.equal(r2.status, 200); assert.equal(r2.data.role, "owner"); assert.equal(r2.data.bootstrap_owner, true); assert.ok(r2.data.perms.includes("import.run"));
    assert.equal(typeof r2.data.features.config_secret, "boolean");
    const unv = await mkMember(env, "owner2@mig.test", { emailVerified: false });
    const env2 = { ...env, ADMIN_EMAILS: "owner2@mig.test" };
    assert.equal((await api(env2, CC, "GET", "/api/admin/cc/whoami", { token: await tokenOf(env2, unv) })).status, 403);
    for (const role of ["admin", "editor", "support"]) { const s = await staffTok(env, role); const r = await api(env, CC, "GET", "/api/admin/cc/whoami", { token: s.token }); assert.equal(r.data.role, role); assert.deepEqual(r.data.perms, BASE.ROLE_PERMS[role]); }
    const legacyAdmin = await mkMember(env, "flag@mig.test", { role: "admin" });
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/whoami", { token: await tokenOf(env, legacyAdmin) })).data.role, "admin");
    const pk = await api(env, CC, "GET", "/api/admin/cc/whoami", { headers: { "X-Platform-Key": "pk-test-123" } });
    assert.equal(pk.data.role, "platform"); assert.ok(!pk.data.perms.includes("import.run")); assert.ok(!pk.data.perms.includes("pay.config")); assert.ok(pk.data.perms.includes("members.plan"));
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/whoami", { headers: { "X-Platform-Key": "wrong" } })).status, 401);
  });
  test("a legacy-bridge session never gets a role, even for a staff mailbox; e-mail-link sessions are refused", async () => {
    const env = mkEnv(), { CC } = fakeCC(env);
    const s = await staffTok(env, "admin");
    const sid = hex(16), exp = Math.floor(Date.now() / 1000) + 3600, sh = await C.sha256(sid);
    await env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sh, s.m.id, C.now(), C.iso(exp * 1000)).run();
    await env.DB.prepare("INSERT INTO cc_session_meta (sid_hash, via, created_at) VALUES (?, 'legacy', ?)").bind(sh, C.now()).run();
    const tok = await signSession(C.secretOf(env), s.m.id, sid, exp);
    const r = await api(env, CC, "GET", "/api/admin/cc/whoami", { token: tok });
    assert.deepEqual([r.status, r.data.code], [403, "use_email_code"]);
    const link = (await issueSession(env, s.m, { scope: "link" })).token;
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/whoami", { token: link })).data.code, "full_login_required");
  });
  test("staff: admin cannot grant owner/admin; the last owner stays; members.role follows the role", async () => {
    const env = mkEnv({ ADMIN_EMAILS: "" }), { CC } = fakeCC(env);
    const owner = await staffTok(env, "owner", "boss@mig.test"); // cc_staff owner (no bootstrap)
    await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES (?, 'owner', 'x', 'x')").bind(owner.m.id).run();
    const admin = await staffTok(env, "admin");
    let r = await api(env, CC, "POST", "/api/admin/cc/staff", { token: admin.token, body: { email: "new@mig.test", role: "owner" } });
    assert.deepEqual([r.status, r.data.code], [403, "owner_only"]);
    r = await api(env, CC, "POST", "/api/admin/cc/staff", { token: admin.token, body: { email: "ed@mig.test", role: "editor" } });
    assert.equal(r.status, 201); assert.equal(r.data.item.role, "editor");
    assert.equal((await env.DB.prepare("SELECT role FROM members WHERE email = 'ed@mig.test'").first()).role, "seo");
    assert.ok(sent.some(m => m.to === "ed@mig.test"), "staff_added e-mail");
    for (const [role, mrole] of [["support", "user"], ["seo", "seo"], ["data", "user"], ["admin", "admin"]]) {
      const x = await api(env, CC, "PATCH", "/api/admin/cc/staff/" + r.data.item.member_id, { token: owner.token, body: { role } });
      assert.equal(x.status, 200, JSON.stringify(x.data)); assert.equal((await env.DB.prepare("SELECT role FROM members WHERE email = 'ed@mig.test'").first()).role, mrole, role);
    }
    r = await api(env, CC, "PATCH", "/api/admin/cc/staff/" + owner.m.id, { token: owner.token, body: { role: "admin" } });
    assert.deepEqual([r.status, r.data.code], [409, "state"]);
    r = await api(env, CC, "DELETE", "/api/admin/cc/staff/" + owner.m.id, { token: owner.token });
    assert.deepEqual([r.status, r.data.code], [409, "state"]);
    r = await api(env, CC, "DELETE", "/api/admin/cc/staff/" + owner.m.id, { token: admin.token });
    assert.equal(r.data.code, "owner_only");
    const list = await api(env, CC, "GET", "/api/admin/cc/staff", { token: owner.token });
    assert.ok(list.data.items.some(i => i.email === "ed@mig.test" && i.role === "admin"));
    assert.ok((await auditRows(env, "staff.add")).length === 1 && (await auditRows(env, "staff.update")).length === 4);
  });
  test("bootstrap owners are listed and cannot be changed", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    const l = await api(env, CC, "GET", "/api/admin/cc/staff", { token: own.token });
    assert.ok(l.data.items.some(i => i.bootstrap && i.email === "owner@mig.test"));
    const r = await api(env, CC, "PATCH", "/api/admin/cc/staff/" + own.m.id, { token: own.token, body: { role: "editor" } });
    assert.equal(r.status, 403);
  });
});

/* ===================================================================== 3. permission matrix */
const SAMPLE = { ":id": "zz-no-such" };
function samplePath(rx) {
  let s = rx.source.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\./g, ".").replace(/\(\[A-Za-z0-9_.-\]\{1,64\}\)/g, "zz-no-such").replace(/\(\[a-z\]\+\)/g, "pv").replace(/\\\//g, "/");
  return "/api/admin/cc" + s;
}
describe("permission matrix (§0.5 / §1.4) — every route × every role", () => {
  test("allowed exactly as the matrix; otherwise 403 {code, need}", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env);
    const toks = { owner: (await ownerTok(env)).token };
    for (const r of ["admin", "editor", "support", "seo", "data"]) toks[r] = (await staffTok(env, r)).token;
    const results = [];
    for (const route of ACC.ROUTE_TABLE) {
      const path = samplePath(route.rx), need = Array.isArray(route.perm) ? route.perm : route.perm ? [route.perm] : [];
      for (const role of ["owner", "admin", "editor", "support", "seo", "data"]) {
        const r = await api(env, CC, route.m, path, { token: toks[role], body: route.m === "GET" ? undefined : {} });
        const perms = BASE.ROLE_PERMS[role], team = role === "seo" || role === "data";
        const allowed = !team && (!need.length || need.some(p => perms.includes(p))) && (!route.adminOnly || ["owner", "admin"].includes(role));
        if (allowed) assert.notEqual(r.status, 403, `${role} ${route.m} ${path} → ${r.status} ${r.text}`);
        else { assert.equal(r.status, 403, `${role} ${route.m} ${path} should be 403, got ${r.status}`); if (!team && need.length && !need.some(p => perms.includes(p))) { assert.ok(["forbidden", "owner_only"].includes(r.data.code)); assert.ok(need.includes(r.data.need), r.text); } }
        results.push([role, route.m, path, r.status]);
      }
    }
    assert.ok(ACC.ROUTE_TABLE.length >= 55); assert.equal(results.length, ACC.ROUTE_TABLE.length * 6);
    // delegated areas get the caller's adm (fake CC records the role)
    for (const [p, who] of [["/api/admin/cc/content/fac", "contentAdmin"], ["/api/admin/cc/media", "contentAdmin"], ["/api/admin/cc/pay/config", "payAdmin"], ["/api/admin/cc/email/config", "emailAdmin"]]) {
      const r = await api(env, CC, "GET", p, { token: toks.editor }); assert.equal(r.status, 200); assert.equal(log.filter(x => x[0] === who).pop()[1], "editor");
    }
    const seo = await api(env, CC, "GET", "/api/admin/cc/content/fac", { token: toks.seo });
    assert.equal(seo.status, 403); assert.equal(seo.data.team_page, "seo-team/");
  });
});

/* ===================================================================== 4/5. audit + HTTP */
describe("audit log and HTTP conventions", () => {
  test("a write leaves one audit row with actor + before/after; secret-like keys redacted; failing audit = nothing changed", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    let r = await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { public: { hotline_display: "02 1111 2222" }, custom: [{ k: "smtp_password_note", v: "secret" }] } });
    assert.equal(r.status, 200, r.text);
    const a = (await auditRows(env, "settings.save"))[0];
    assert.equal(a.actor_email, "owner@mig.test"); assert.equal(a.actor_role, "owner");
    assert.deepEqual(JSON.parse(a.before_json).hotline_display, "02 38346757"); assert.equal(JSON.parse(a.after_json).hotline_display, "02 1111 2222");
    assert.equal(JSON.parse(a.after_json).smtp_password_note, "***");
    assert.deepEqual(BASE.redact({ api_key: "x", nested: { server_key: "y", ok: "z" }, long: "a".repeat(3000) }), { api_key: "***", nested: { server_key: "***", ok: "z" }, long: "a".repeat(2000) });
    env.DB.db.exec("DROP TABLE cc_audit");
    r = await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { public: { hotline_display: "02 9999 9999" } } });
    assert.deepEqual([r.status, r.data.code], [500, "audit_failed"]);
    assert.equal((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'hotline_display'").first()).v, "02 1111 2222");
  });
  test("CORS only for the site origins (+CC_ORIGINS), preflight, no-store + nosniff, 64 KB body limit, 121st write → 429", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    const ok = await api(env, CC, "GET", "/api/admin/cc/badges", { token: own.token, headers: { Origin: "https://madeinegyptgate.com" } });
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://madeinegyptgate.com"); assert.equal(ok.headers.get("Cache-Control"), "no-store"); assert.equal(ok.headers.get("X-Content-Type-Options"), "nosniff"); assert.match(ok.headers.get("Vary"), /Origin/);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/badges", { token: own.token, headers: { Origin: "http://localhost:8780" } })).headers.get("Access-Control-Allow-Origin"), "http://localhost:8780");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/badges", { token: own.token, headers: { Origin: "https://evil.example" } })).headers.get("Access-Control-Allow-Origin"), null);
    const pre = await api(env, CC, "OPTIONS", "/api/admin/cc/members", { headers: { Origin: "https://www.madeinegyptgate.com" } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get("Access-Control-Allow-Methods"), /PATCH/); assert.match(pre.headers.get("Access-Control-Allow-Headers"), /X-Platform-Key/);
    assert.equal((await api(env, CC, "OPTIONS", "/api/admin/cc/members", { headers: { Origin: "https://evil.example" } })).headers.get("Access-Control-Allow-Origin"), null);
    const big = await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, raw: JSON.stringify({ custom: [{ k: "x", v: "a".repeat(70000) }] }), headers: { "Content-Type": "application/json" } });
    assert.deepEqual([big.status, big.data.code], [413, "too_large"]);
    let last;
    // the write limit counts per fixed 60 s window (common.js rateOk): never start the 121 writes in the last 3 s of a window (deflake)
    const inWin = Date.now() % 60000; if (inWin > 57000) await new Promise(r => setTimeout(r, 60200 - inWin));
    for (let i = 0; i < 121; i++) last = await api(env, CC, "POST", "/api/admin/cc/members/zz/extend", { token: own.token, body: { days: 1 } });
    assert.deepEqual([last.status, last.data.code], [429, "rate_limited"]);
  });
});

/* ===================================================================== 6. stats + badges */
describe("statistics (live home view)", () => {
  test("empty database → zeros and nulls only; fixtures → their counts; since = first pv day", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    let s = (await api(env, CC, "GET", "/api/admin/cc/stats", { token: own.token })).data;
    for (const k of ["views", "visitors", "mobile", "rfqNew", "msgNew", "msgAll", "soon", "expired", "needsTeam"]) assert.equal(s[k], 0, k);
    assert.deepEqual([s.series, s.top, s.src], [[], [], []]);
    const DN = DATA.n && typeof DATA.n === "object" ? DATA.n : null, nOf = k => (DN && DN[k] != null && Number.isFinite(+DN[k]) ? +DN[k] : null);
    assert.equal(s.news, nOf("news")); assert.equal(s.videos, nOf("videos")); assert.equal(s.companies, DATA.f.length); // build data; no DATA.n → null (never invented)
    assert.deepEqual(s.unpaid, { n: 0, total_minor: 0 }); assert.equal(s.revenue_month_minor, 0); assert.equal(s.since, C.cairoDay());
    const day = C.addDays(C.cairoDay(), -3);
    await env.DB.prepare("INSERT INTO cc_pv_day (day, views, uniq, mobile_uniq) VALUES (?, 40, 10, 4), (?, 10, 5, 1)").bind(day, C.cairoDay()).run();
    await env.DB.prepare("INSERT INTO cc_pv_page (day, path, views, uniq) VALUES (?, '/factories/', 30, 8), (?, '/', 20, 7)").bind(day, day).run();
    await env.DB.prepare("INSERT INTO cc_pv_src (day, src, n) VALUES (?, 'direct', 5), (?, 'google', 9)").bind(day, day).run();
    await mkMember(env, "basic@mig.test", { plan: "basic", plan_expires: C.iso(Date.now() + 10 * 86400000) });
    await mkMember(env, "old@mig.test", { plan: "premium", plan_expires: C.iso(Date.now() - 86400000) });
    await api(env, CC, "POST", "/api/inquiries", { body: RFQ });
    s = (await api(env, CC, "GET", "/api/admin/cc/stats", { token: own.token })).data;
    assert.deepEqual([s.views, s.visitors, s.mobile, s.since], [50, 15, 33, day]);
    assert.deepEqual(s.top[0], { path: "/factories/", c: 30 }); assert.deepEqual(s.src.map(x => x.ref), ["google", "direct"]);
    assert.equal(s.members, 1); assert.equal(s.soon, 1); assert.equal(s.expired, 1); assert.equal(s.rfqNew, 1); assert.equal(s.msgAll, 1);
    assert.ok(s.plans.some(p => p.plan === "basic" && p.c === 1)); assert.ok(s.plans.some(p => p.plan === "none"));
    assert.deepEqual(s.msgKinds, [{ kind: "rfq", c: 1 }]);
    const b = (await api(env, CC, "GET", "/api/admin/cc/badges", { token: own.token })).data;
    assert.deepEqual(Object.keys(b).sort(), ["approvals", "edge", "expSoon", "msgNew", "needsTeam", "rfqNew", "unpaid"]);
    assert.equal(b.expSoon, 1); assert.equal(b.needsTeam, 1); assert.equal(b.msgNew, 1); // no registered match → in_progress
  });
});

/* ===================================================================== 7. members */
describe("members & subscriptions", () => {
  test("list / search / filters / paging + CSV", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    for (let i = 0; i < 7; i++) await mkMember(env, `m${i}@fac.test`, { plan: i % 2 ? "basic" : "visitor", company: "Factory " + i, created_at: C.iso(Date.now() - i * 1000) });
    await mkMember(env, "p1@fac.test", { plan: "partner" }); await mkMember(env, "s1@fac.test", { plan: "strategic", plan_expires: C.iso(Date.now() - 1000) });
    let r = await api(env, CC, "GET", "/api/admin/cc/members?limit=3&page=1", { token: own.token });
    assert.equal(r.data.items.length, 3); assert.equal(r.data.total, 10); assert.equal(r.data.page, 1);
    r = await api(env, CC, "GET", "/api/admin/cc/members?plan=partner,strategic", { token: own.token });
    assert.deepEqual(r.data.items.map(x => x.email).sort(), ["p1@fac.test", "s1@fac.test"]);
    assert.equal(r.data.items.find(x => x.email === "s1@fac.test").plan, "visitor"); // expired: no plan in force
    assert.equal(r.data.items.find(x => x.email === "s1@fac.test").plan_set, "strategic");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/members?expired=1", { token: own.token })).data.total, 1);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/members?q=Factory%203", { token: own.token })).data.items[0].email, "m3@fac.test");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/members?plan=none", { token: own.token })).data.items.every(x => x.plan_set === "visitor"), true);
    const csv = await api(env, CC, "GET", "/api/admin/cc/members.csv", { token: own.token });
    assert.match(csv.headers.get("Content-Type"), /text\/csv/); assert.match(csv.headers.get("Content-Disposition"), /members-\d{4}-\d{2}-\d{2}\.csv/);
    const bytes = new Uint8Array(await csv.res.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); assert.ok(csv.text.startsWith('"id","email"'));
    const sup = await staffTok(env, "support");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/members.csv", { token: sup.token })).status, 403);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/members", { token: sup.token })).status, 200);
  });
  test("setPlan = admin.js semantics; activation routes a waiting request automatically; audit; CSV formula guard", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    const created = await api(env, CC, "POST", "/api/inquiries", { body: RFQ });
    assert.equal(created.data.status, "in_progress");
    const f = await mkMember(env, "plast@fac.test", { company: "مصنع بلاستيك", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك، جراكن" });
    const r = await api(env, CC, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: own.token, body: { plan: "basic", plan_until: "2027-12-31" } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.member.plan, "basic"); assert.ok(r.data.member.activated_at); assert.equal(r.data.member.plan_until, "2027-12-31"); assert.equal(r.data.rematched, 1);
    const inq = await env.DB.prepare("SELECT status, routed_count FROM inquiries WHERE ref = ?").bind(created.data.ref).first();
    assert.deepEqual([inq.status, inq.routed_count], ["routed", 1]);
    assert.ok(sent.some(m => m.to === "plast@fac.test" && m.subject.includes(created.data.ref)));
    const ev = await env.DB.prepare("SELECT data FROM events WHERE member_id = ? AND type = 'member_set'").bind(f.id).first();
    assert.equal(JSON.parse(ev.data).plan, "basic");
    const a = (await auditRows(env, "member.plan"))[0]; assert.equal(JSON.parse(a.after_json).plan, "basic");
    const again = await api(env, CC, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: own.token, body: { plan: "premium", gcc: ["SA", "AE", "QA"] } }); // Premium needs its 3 GCC states
    assert.equal(again.data.member.activated_at, r.data.member.activated_at); // already basic+: activated_at kept
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: own.token, body: { plan: "gold" } })).data.code, "invalid_plan");
    assert.equal(BASE.csvText(["a"], [{ a: "=HYPERLINK(1)" }]), "﻿\"a\"\n\"'=HYPERLINK(1)\"\n");
  });
  test("create (409 same mailbox), patch with contact-only permission, suspend/unsuspend, extend, invite limit, delete owner-only", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env), sup = await staffTok(env, "support"), adm = await staffTok(env, "admin");
    let r = await api(env, CC, "POST", "/api/admin/cc/members", { token: own.token, body: { email: "New@Fac.test", company: "New Fac", phone: "01001234567", plan: "basic", plan_until: "2027-01-31", invite: true } });
    assert.equal(r.status, 201, r.text); const id = r.data.member.id;
    assert.equal(r.data.member.phone, "+201001234567"); assert.equal(r.data.member.plan, "basic"); assert.equal(r.data.invite.sent, true);
    assert.ok(sent.some(m => m.to === "new@fac.test" && /https:\/\/madeinegyptgate\.com\/login\//.test(m.text) && !/login\.html/.test(m.text))); // deploy 2: /login/ (login.html = the old system)
    assert.deepEqual([(r = await api(env, CC, "POST", "/api/admin/cc/members", { token: own.token, body: { email: "new@fac.test" } })).status, r.data.code, r.data.id], [409, "exists", id]);
    assert.equal((await api(env, CC, "PATCH", "/api/admin/cc/members/" + id, { token: sup.token, body: { name: "Mona", phone: "01112223334" } })).status, 200);
    r = await api(env, CC, "PATCH", "/api/admin/cc/members/" + id, { token: sup.token, body: { sector: "x" } });
    assert.deepEqual([r.status, r.data.need], [403, "members.write"]);
    assert.equal((await api(env, CC, "PATCH", "/api/admin/cc/members/" + id, { token: own.token, body: { plan: "strategic" } })).data.code, "use_plan_endpoint");
    const tokM = await tokenOf(env, await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first());
    r = await api(env, CC, "POST", `/api/admin/cc/members/${id}/status`, { token: own.token, body: { status: "suspended" } });
    assert.equal(r.data.member.status, "suspended"); assert.equal(r.data.member.plan_set, "visitor"); assert.equal(r.data.member.inbox_paused, true); assert.equal(r.data.member.suspended_plan, "basic");
    assert.equal((await api(env, CC, "GET", "/api/me/account", { token: tokM })).data.status, "suspended"); // sessions are NOT revoked (§3.1.3)
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/members/${id}/status`, { token: own.token, body: { status: "suspended" } })).data.code, "state");
    r = await api(env, CC, "POST", `/api/admin/cc/members/${id}/status`, { token: own.token, body: { status: "active" } });
    assert.deepEqual([r.data.member.status, r.data.member.plan, r.data.member.inbox_paused], ["active", "basic", false]);
    r = await api(env, CC, "POST", `/api/admin/cc/members/${id}/extend`, { token: own.token, body: { days: 30 } });
    assert.equal(r.data.member.plan_until, C.addDays("2027-01-31", 30));
    for (let i = 0; i < 2; i++) assert.equal((await api(env, CC, "POST", `/api/admin/cc/members/${id}/invite`, { token: adm.token, body: {} })).status, 200);
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/members/${id}/invite`, { token: adm.token, body: {} })).status, 429); // 3/day incl. the one at creation
    r = await api(env, CC, "DELETE", "/api/admin/cc/members/" + id, { token: adm.token, body: { confirm: "new@fac.test" } });
    assert.deepEqual([r.status, r.data.code], [403, "owner_only"]);
    assert.equal((await api(env, CC, "DELETE", "/api/admin/cc/members/" + id, { token: own.token, body: { confirm: "wrong@x.test" } })).data.code, "confirm_required");
    r = await api(env, CC, "DELETE", "/api/admin/cc/members/" + id, { token: own.token, body: { confirm: "new@fac.test" } });
    assert.equal(r.status, 200);
    const gone = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
    assert.equal(gone.email, `deleted+${id}@invalid`); assert.equal(gone.phone, ""); assert.equal(gone.plan, "visitor");
    assert.equal((await api(env, CC, "GET", "/api/me/account", { token: tokM })).status, 401);
    const det = await api(env, CC, "GET", "/api/admin/cc/members/" + id, { token: own.token });
    assert.ok(det.data.audit.length >= 5); assert.ok(det.data.audit.some(x => x.action === "member.delete"));
  });
  test("delete also removes the member's factory profile (member_profiles, migration 0007): staff can no longer read it", async () => {
    const env = mkEnv(); env.DB.db.exec(readFileSync(new URL("../migrations/0007_member_profile.sql", import.meta.url), "utf8"));
    const { CC } = fakeCC(env), own = await ownerTok(env), m = await mkMember(env, "prof@fac.test", { plan: "strategic" }), t = new Date().toISOString();
    const ins = "INSERT INTO member_profiles (member_id, profile_json, source, created_at, updated_at) VALUES (?, ?, 'bassem', ?, ?)";
    await env.DB.prepare(ins).bind(m.id, JSON.stringify({ products: ["حديد تسليح 3 مم"], certifications: ["ISO 9001"], notes: "سري" }), t, t).run();
    await env.DB.prepare(ins).bind("u-other", JSON.stringify({ products: ["براميل"] }), t, t).run();
    const read = () => handleProfile(new Request(SITE + "/api/advisor/profile?member_id=" + m.id, { headers: { Authorization: "Bearer " + own.token } }), env, {}).then(r => r.json());
    assert.deepEqual((await read()).profile.products, ["حديد تسليح 3 مم"]);
    /* owner's memory policy: erasing what Bassem recorded needs the legal basis (formal data-subject request, PDPL 151/2020) */
    const no = await api(env, CC, "DELETE", "/api/admin/cc/members/" + m.id, { token: own.token, body: { confirm: "prof@fac.test" } });
    assert.deepEqual([no.status, no.data && no.data.code, no.data && no.data.factory_profile], [400, "reason_required", true], no.text);
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM member_profiles WHERE member_id = ?").bind(m.id).first(), "refused → nothing erased");
    const reason = "طلب رسمي من صاحب البيانات بالمسح بتاريخ 18 نوفمبر (قانون 151 لسنة 2020)";
    const r = await api(env, CC, "DELETE", "/api/admin/cc/members/" + m.id, { token: own.token, body: { confirm: "prof@fac.test", reason } });
    assert.equal(r.status, 200, r.text);
    assert.equal(await env.DB.prepare("SELECT 1 AS x FROM member_profiles WHERE member_id = ?").bind(m.id).first(), null);
    const au = await env.DB.prepare("SELECT summary, before_json, after_json FROM cc_audit WHERE action = 'member.delete' AND target_id = ?").bind(m.id).first();
    assert.ok(au.summary.includes("legal request: " + reason) && JSON.parse(au.after_json).reason === reason && JSON.parse(au.before_json).factory_profile === true, JSON.stringify(au));
    assert.ok(await env.DB.prepare("SELECT 1 AS x FROM member_profiles WHERE member_id = 'u-other'").first(), "only that member's profile goes");
    assert.deepEqual((await read()).profile, {}, "staff read of the deleted member: nothing left");
  });
});

/* ===================================================================== 8. customers */
describe("customers (buyers)", () => {
  test("computed from inquiries; cid stable; detail; note; contacts for customers.read roles", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    await api(env, CC, "POST", "/api/inquiries", { body: RFQ });
    await api(env, CC, "POST", "/api/inquiries", { body: { ...RFQ, message: "طلب تاني", kind: "contact", payload: {} }, ip: "10.0.0.2" });
    await api(env, CC, "POST", "/api/inquiries", { body: { ...RFQ, email: "other@b.test", name: "Other" }, ip: "10.0.0.3" });
    const l = await api(env, CC, "GET", "/api/admin/cc/customers", { token: own.token });
    assert.equal(l.data.total, 2);
    const c = l.data.items.find(x => x.email === "buyer@buyer.test");
    assert.equal(c.total, 2); assert.deepEqual(c.kinds, { rfq: 1, contact: 1 }); assert.equal(c.member, null); assert.match(c.cid, /^[A-Za-z0-9_-]{16}$/);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers", { token: own.token })).data.items.find(x => x.email === "buyer@buyer.test").cid, c.cid);
    const d = await api(env, CC, "GET", "/api/admin/cc/customers/" + c.cid, { token: own.token });
    assert.equal(d.data.inquiries.length, 2); assert.equal(d.data.customer.email, "buyer@buyer.test");
    assert.equal((await api(env, CC, "PUT", `/api/admin/cc/customers/${c.cid}/note`, { token: own.token, body: { note: "VIP", tags: "repeat" } })).status, 200);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers", { token: own.token })).data.items.find(x => x.cid === c.cid).note, "VIP");
    await mkMember(env, "buyer@buyer.test");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers?has_account=1", { token: own.token })).data.total, 1);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers?kind=contact", { token: own.token })).data.total, 1);
    const sup = await staffTok(env, "support");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers", { token: sup.token })).data.items[0].email.includes("@"), true);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/customers/AAAAAAAAAAAAAAAA", { token: own.token })).status, 404);
  });
});

/* ===================================================================== 9. orders */
describe("orders / sales requests", () => {
  test("filters incl. needs_team; detail = GET /api/admin/inquiries/:ref; team reply; note; close; candidates", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    const a = await api(env, CC, "POST", "/api/inquiries", { body: RFQ });
    await api(env, CC, "POST", "/api/inquiries", { body: { ...RFQ, kind: "signup", message: "اشتراك", payload: { plan: "basic" } }, ip: "10.0.0.9" });
    let l = await api(env, CC, "GET", "/api/admin/cc/orders?status=needs_team", { token: own.token });
    assert.deepEqual([l.data.total, l.data.items[0].ref, l.data.items[0].needs_team], [1, a.data.ref, true]);
    assert.equal(l.data.counts.status.needs_team, 1); assert.deepEqual(l.data.kinds, { rfq: 1, signup: 1 });
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/orders?kind=signup", { token: own.token })).data.total, 1);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/orders?kind=rfq,signup&q=Buyer", { token: own.token })).data.total, 2);
    const mine = await api(env, CC, "GET", "/api/admin/cc/orders/" + a.data.ref, { token: own.token });
    const theirs = await api(env, CC, "GET", "/api/admin/inquiries/" + a.data.ref, { token: own.token });
    assert.deepEqual(Object.keys(mine.data).sort(), Object.keys(theirs.data).sort());
    assert.deepEqual(mine.data.inquiry, theirs.data.inquiry); assert.deepEqual(mine.data.events, theirs.data.events); assert.deepEqual(mine.data.candidates.map(x => x.name), theirs.data.candidates.map(x => x.name));
    const sup = await staffTok(env, "support");
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/orders/" + a.data.ref, { token: sup.token })).status, 200); // support reads it here (not on /api/admin/*)
    assert.equal((await api(env, CC, "GET", "/api/admin/inquiries/" + a.data.ref, { token: sup.token })).status, 403);
    sent.length = 0;
    let r = await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/team-reply`, { token: sup.token, body: { body: "لقينا مصنع مناسب وهنكلمك", channel: "whatsapp", status: "in_progress" } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.fallback, "email"); assert.equal(r.data.status, "in_progress");
    assert.ok(sent.some(m => m.to === "buyer@buyer.test" && m.text.includes("لقينا مصنع مناسب")));
    const ev = await env.DB.prepare("SELECT * FROM inquiry_events WHERE type = 'team_reply'").first(); assert.equal(ev.actor, "team"); assert.equal(ev.buyer_visible, 1);
    assert.equal((await auditRows(env, "order.team_reply")).length, 1);
    const track = await api(env, CC, "GET", `/api/inquiries/${a.data.ref}?last4=4567`);
    assert.ok(track.data.events.some(e => e.type === "team_reply"));
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/team-reply`, { token: sup.token, body: { body: "" } })).data.code, "body_required");
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/note`, { token: sup.token, body: { body: "اتصلت بالعميل" } })).status, 200);
    assert.equal((await env.DB.prepare("SELECT buyer_visible FROM inquiry_events WHERE type = 'note'").first()).buyer_visible, 0);
    const cand = await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/candidates/refresh`, { token: own.token });
    assert.equal(cand.status, 200); assert.equal(cand.data.web_search.provider, ""); assert.ok(cand.data.candidates.every(c => c.source === "directory"));
    sent.length = 0;
    r = await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/close`, { token: own.token, body: {} });
    assert.equal(r.data.status, "closed"); assert.ok(sent.some(m => m.to === "buyer@buyer.test" && m.text.includes("اتقفل الطلب")));
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/orders/${a.data.ref}/close`, { token: own.token, body: {} })).data.code, "state");
    const csv = await api(env, CC, "GET", "/api/admin/cc/orders.csv", { token: own.token });
    assert.ok(csv.text.split("\n")[0].startsWith('"ref","kind","status"')); assert.equal(csv.text.split("\n").length, 4); // header + 2 rows + final newline
  });
  test("legacy contacts on candidates only with legacy.contacts", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env);
    const a = await api(env, CC, "POST", "/api/inquiries", { body: RFQ });
    const top = (await api(env, CC, "GET", `/api/admin/cc/orders/${a.data.ref}/candidates`, { token: own.token })).data.candidates[0];
    assert.ok(top, "a directory candidate");
    const ref = /company\.html#(.+)$/.exec(top.url)[1];
    await env.DB.prepare("INSERT INTO cc_legacy_companies (company, company_key, phones, email, factory_ref, created_at, updated_at) VALUES (?, ?, '01000000001', 'old@fac.test', ?, 'x', 'x')").bind(top.name, "k", ref).run();
    const c1 = (await api(env, CC, "GET", `/api/admin/cc/orders/${a.data.ref}/candidates`, { token: own.token })).data.candidates[0];
    assert.equal(c1.legacy.phones, "01000000001");
  });
});

/* ===================================================================== 10. manual RFQ */
describe("manual RFQ («طلبات عروض المشترين»)", () => {
  test("creates a real routed inquiry through the inquiry engine and publishes only the public fields", async () => {
    const env = mkEnv({ TURNSTILE_SECRET: PW5 ? "ts-secret" : undefined }), { CC, log } = fakeCC(env), sup = await staffTok(env, "support");
    const r = await api(env, CC, "POST", "/api/admin/cc/rfqs", { token: sup.token, body: { client: "شركة النور", phone: "01001112222", channel: "اتصال هاتفي", product: "مواسير PVC", qty: "200", unit: "متر", gov: "GIZ", city: "6 أكتوبر", deadline: "2027-01-15", details: "مواسير 4 بوصة", status: "active", publish: true } });
    assert.equal(r.status, 201, r.text);
    assert.match(r.data.inquiry.ref, /^MIG-\d{2}-/);
    const row = await env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(r.data.inquiry.ref).first();
    assert.equal(row.email, "team@madeinegyptgate.com"); assert.equal(JSON.parse(row.payload_json).via_team, true);
    if (PW5) assert.equal(row.source, "admin");
    const up = log.find(x => x[0] === "upsert")[1];
    assert.equal(up.coll, "rfq"); assert.equal(up.publish, true); assert.equal(up.fields.title, "مواسير PVC"); assert.equal(up.fields.qty, "200 متر");
    assert.ok(!JSON.stringify(up.fields).includes("01001112222") && !JSON.stringify(up.fields).includes("شركة النور"));
    assert.deepEqual([up.private.client, up.private.phone, up.private.inquiry_ref], ["شركة النور", "01001112222", r.data.inquiry.ref]);
    assert.ok(r.data.content.id);
    const au = (await auditRows(env, "order.rfq_manual"))[0]; assert.equal(au.target_id, r.data.inquiry.ref);
    assert.equal((await api(env, CC, "POST", "/api/admin/cc/rfqs", { token: sup.token, body: { client: "x" } })).status, 422);
  });
});

/* ===================================================================== 11/19. self-service + approvals */
async function memberWithPlan(env, email, plan, ref = "5") { const m = await mkMember(env, email, { plan, factory_ref: ref, plan_expires: C.iso(Date.now() + 100 * 86400000) }); return { m, token: await tokenOf(env, m) }; }
async function addMedia(env, m, id = "md" + BASE.rid(8)) { await env.DB.prepare("INSERT INTO cc_media (id, r2_key, owner_type, owner_id, purpose, mime, bytes, width, height, sha256, status, created_at, updated_at) VALUES (?, ?, 'member', ?, 'product', 'image/jpeg', 100, 800, 600, ?, 'pending', 'x', 'x')").bind(id, "u/2026/" + id + ".jpg", m.id, id).run(); return id; }
describe("member self-service and approvals", () => {
  test("«منتجاتي»: plan limit, contacts refused, images per product, edit keeps the live version, approve → content + e-mail, reject", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env), own = await ownerTok(env), ed = await staffTok(env, "editor");
    const vis = await memberWithPlan(env, "vis@fac.test", "profile");
    assert.deepEqual([(await api(env, CC, "POST", "/api/me/products", { token: vis.token, body: { fields: { name: "x", category: "food" } } })).data.code], ["plan"]);
    const nolink = await memberWithPlan(env, "nl@fac.test", "basic", "");
    assert.equal((await api(env, CC, "POST", "/api/me/products", { token: nolink.token, body: { fields: { name: "x", category: "food" } } })).data.code, "link_required");
    const { m, token } = await memberWithPlan(env, "b@fac.test", "basic");
    let r = await api(env, CC, "POST", "/api/me/products", { token, body: { fields: { name: "عسل نحل — كلمنا 01001234567", category: "food" } } });
    assert.deepEqual([r.status, r.data.code], [422, "invalid_contact"]);
    const img1 = await addMedia(env, m), img2 = await addMedia(env, m);
    r = await api(env, CC, "POST", "/api/me/products", { token, body: { fields: { name: "عسل نحل", category: "food" }, images: [img1, img2] } });
    assert.equal(r.data.code, "too_many_images");
    const other = await mkMember(env, "o@fac.test"); const foreign = await addMedia(env, other);
    assert.equal((await api(env, CC, "POST", "/api/me/products", { token, body: { fields: { name: "عسل", category: "food" }, images: [foreign] } })).data.code, "invalid_image");
    r = await api(env, CC, "POST", "/api/me/products", { token, body: { fields: { name: "عسل نحل", category: "food", price: "250 جنيه" }, images: [img1], submit: true } });
    assert.equal(r.status, 201, r.text); const pid = r.data.item.id; assert.equal(r.data.item.state, "pending"); assert.match(r.data.item.images[0].url, /^\/media\/u\/2026\/md[a-z0-9]+\.jpg\?e=\d+&s=[A-Za-z0-9_-]{32}$/);
    const ap = await api(env, CC, "GET", "/api/admin/cc/approvals?type=product", { token: ed.token });
    assert.equal(ap.data.total, 1); assert.equal(ap.data.items[0].member.email, "b@fac.test");
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/approvals/product/${pid}/approve`, { token: ed.token, body: {} })).data.code, "company_url_required");
    sent.length = 0;
    r = await api(env, CC, "POST", `/api/admin/cc/approvals/product/${pid}/approve`, { token: ed.token, body: { company_url: "https://www.madeinegyptgate.com/factories/hydrohex/" } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.content_id, pid);
    const up = log.find(x => x[0] === "upsert")[1];
    assert.deepEqual([up.coll, up.kind, up.id, up.source, up.member_id, up.publish, up.fields.image, up.fields.company_url], ["prod", "add", pid, "member", m.id, true, `/media/u/2026/${img1}.jpg`, "https://www.madeinegyptgate.com/factories/hydrohex/"]);
    assert.deepEqual(log.find(x => x[0] === "mediaPublic")[1], [img1]);
    assert.ok(sent.some(x => x.to === "b@fac.test"), "product_approved e-mail");
    r = await api(env, CC, "PATCH", "/api/me/products/" + pid, { token, body: { fields: { price: "300 جنيه" }, submit: true } });
    assert.equal(r.data.item.state, "pending"); assert.equal(r.data.item.live.price, "250 جنيه"); assert.equal(r.data.item.fields.price, "300 جنيه");
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/approvals/product/${pid}/reject`, { token: ed.token, body: { reason: "x" } })).status, 422);
    r = await api(env, CC, "POST", `/api/admin/cc/approvals/product/${pid}/reject`, { token: ed.token, body: { reason: "السعر لازم يكون واضح" } });
    assert.equal(r.status, 200);
    const pr = await env.DB.prepare("SELECT state, reject_reason FROM cc_member_products WHERE id = ?").bind(pid).first();
    assert.deepEqual([pr.state, pr.reject_reason], ["approved", "السعر لازم يكون واضح"]); // the approved version stays online
    r = await api(env, CC, "DELETE", "/api/me/products/" + pid, { token });
    assert.equal(r.status, 200); assert.deepEqual(log.find(x => x[0] === "setHidden")[1].hidden, true);
    // 30-product limit of the basic plan
    for (let i = 0; i < 30; i++) await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, state, created_at, updated_at) VALUES (?, ?, 'draft', 'x', 'x')").bind("p-" + BASE.rid(8), m.id).run();
    r = await api(env, CC, "POST", "/api/me/products", { token, body: { fields: { name: "منتج 31", category: "food" } } });
    assert.deepEqual([r.status, r.data.code, r.data.limit, r.data.used], [429, "limit", 30, 30]);
    const list = await api(env, CC, "GET", "/api/me/products", { token });
    assert.deepEqual([list.data.limit, list.data.used, list.data.can_add, list.data.need], [30, 30, false, null]);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/approvals?type=company", { token: ed.token })).data.need, "approvals.company");
    void own;
  });
  test("«ملف الشركة»: claim / create / edit, one open request, approvals with e-mail, linking", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env), own = await ownerTok(env);
    const vis = await memberWithPlan(env, "v@fac.test", "visitor", "");
    assert.equal((await api(env, CC, "POST", "/api/me/company", { token: vis.token, body: { kind: "create", fields: {} } })).data.code, "plan");
    const p = await memberWithPlan(env, "p@fac.test", "profile", "");
    let r = await api(env, CC, "POST", "/api/me/company", { token: p.token, body: { kind: "claim", factory_ref: "999999" } });
    assert.equal(r.data.code, "invalid_factory_ref");
    r = await api(env, CC, "POST", "/api/me/company", { token: p.token, body: { kind: "claim", factory_ref: "5" } });
    assert.equal(r.status, 201, r.text);
    assert.equal((await api(env, CC, "POST", "/api/me/company", { token: p.token, body: { kind: "create", fields: { name: "x" } } })).data.code, "open_request");
    const g = await api(env, CC, "GET", "/api/me/company", { token: p.token });
    assert.equal(g.data.requests[0].state, "pending"); assert.ok(g.data.allowed.includes("description")); assert.ok(!g.data.allowed.includes("video"));
    const ap = await api(env, CC, "GET", "/api/admin/cc/approvals?type=company", { token: own.token });
    assert.equal(ap.data.items[0].kind, "claim"); assert.equal(ap.data.items[0].current.name, "Hydrohex");
    r = await api(env, CC, "POST", `/api/admin/cc/approvals/company/${ap.data.items[0].id}/approve`, { token: own.token, body: {} });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.factory_ref, "5");
    const linked = await env.DB.prepare("SELECT factory_ref, company FROM members WHERE id = ?").bind(p.m.id).first();
    assert.deepEqual([linked.factory_ref, linked.company], ["5", "Hydrohex"]);
    r = await api(env, CC, "POST", "/api/me/company", { token: p.token, body: { kind: "edit", fields: { description: "محطات مياه — واتساب 01001234567" } } });
    assert.equal(r.data.code, "invalid_contact");
    r = await api(env, CC, "POST", "/api/me/company", { token: p.token, body: { kind: "edit", fields: { description: "محطات مياه وفلاتر", gov: "QLB", products: "فلاتر، مواسير" } } });
    assert.equal(r.status, 201);
    const id2 = r.data.request.id;
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/approvals/company/${id2}/approve`, { token: own.token, body: {} })).data.code, "base_key_required");
    r = await api(env, CC, "POST", `/api/admin/cc/approvals/company/${id2}/approve`, { token: own.token, body: { base_key: "/factories/hydrohex/" } });
    assert.equal(r.status, 200, r.text);
    const up = log.filter(x => x[0] === "upsert").pop()[1];
    assert.deepEqual([up.coll, up.kind, up.base_key, up.fields.description, up.fields.products], ["fac", "base", "/factories/hydrohex/", "محطات مياه وفلاتر", ["فلاتر", "مواسير"]]);
    const c = await memberWithPlan(env, "c@fac.test", "basic", "");
    r = await api(env, CC, "POST", "/api/me/company", { token: c.token, body: { kind: "create", fields: { name: "مصنع جديد", sector: "الأغذية", type: "مصنع", gov: "CAI" } } });
    assert.equal(r.status, 201, r.text);
    r = await api(env, CC, "POST", `/api/admin/cc/approvals/company/${r.data.request.id}/reject`, { token: own.token, body: { reason: "البيانات ناقصة" } });
    assert.equal(r.status, 200);
    assert.equal((await api(env, CC, "GET", "/api/me/company", { token: c.token })).data.requests[0].reject_reason, "البيانات ناقصة");
    assert.ok(sent.some(x => x.to === "c@fac.test" && x.text.includes("البيانات ناقصة")));
  });
  test("/api/me/account status line data, invoices, recognize (e-mail-code sessions only, same mailbox only)", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env);
    const { m, token } = await memberWithPlan(env, "r@fac.test", "basic");
    await env.DB.prepare("INSERT INTO cc_member_meta (member_id, status, requested_plan, created_at, updated_at) VALUES (?, 'pending', 'premium', 'x', 'x')").bind(m.id).run();
    await env.DB.prepare("INSERT INTO cc_invoices (id, no, member_id, email, email_key, plan, period_days, net_minor, vat_bp, vat_minor, total_minor, status, source, pay_token, issued_at, created_at, updated_at) VALUES ('i1', 'INV-2026-000009', ?, 'r@fac.test', 'r@fac.test', 'premium', 365, 2500000, 1400, 350000, 2850000, 'open', 'signup', 'tok123', 'x', 'x', 'x')").bind(m.id).run();
    const a = (await api(env, CC, "GET", "/api/me/account", { token })).data;
    assert.deepEqual([a.status, a.requested_plan, a.open_invoice.no, a.open_invoice.pay_url, a.limits.products, a.caps.incoming, a.linked.name, a.legacy_session], ["pending", "premium", "INV-2026-000009", SITE + "/pay.html#inv=tok123", 30, 1, "Hydrohex", false]);
    // payments owns the invoice rules (open invoice, ≥ current plan, 5/day): acc delegates and maps its PayError shape
    let r = await api(env, CC, "POST", "/api/me/invoices", { token, body: { plan: "strategic" } });
    assert.equal(r.status, 201); assert.deepEqual(log.find(x => x[0] === "createMemberInvoice")[1], "strategic"); assert.equal(r.data.invoice.no, "INV-2026-000002");
    CC.payments.createMemberInvoice = async () => { throw Object.assign(new Error("open"), { status: 409, code: "open_invoice", extra: { invoice: { no: "INV-2026-000009" } } }); };
    r = await api(env, CC, "POST", "/api/me/invoices", { token, body: { plan: "strategic" } });
    assert.deepEqual([r.status, r.data.code, r.data.invoice.no], [409, "open_invoice", "INV-2026-000009"]);
    const noPay = { ...CC, payments: undefined };
    assert.equal((await api(env, noPay, "POST", "/api/me/invoices", { token, body: { plan: "strategic" } })).data.code, "open_invoice"); // own fallback check
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void'").run();
    assert.equal((await api(env, noPay, "POST", "/api/me/invoices", { token, body: { plan: "profile" } })).data.code, "invalid_plan");
    assert.equal((await api(env, noPay, "POST", "/api/me/invoices", { token, body: { plan: "strategic" } })).data.code, "pay_off");
    assert.equal((await api(env, noPay, "GET", "/api/me/invoices", { token })).data.items[0].no, "INV-2026-000009");
    assert.equal((await api(env, CC, "GET", "/api/me/recognize", { token })).data.known, false);
    await env.DB.prepare("INSERT INTO cc_legacy_companies (company, company_key, manager, phones, email, email_key, web, address, activity, created_at, updated_at) VALUES ('شركة قديمة', 'k', 'أحمد', '0100 | 0122', 'r@fac.test', 'r@fac.test', 'https://old.example', 'القاهرة', 'بلاستيك', 'x', 'x'), ('غيرها', 'k2', 'x', '1', 'z@fac.test', 'z@fac.test', '', '', '', 'x', 'x')").run();
    const rec = (await api(env, CC, "GET", "/api/me/recognize", { token })).data;
    assert.deepEqual([rec.known, rec.company.company, rec.company.manager, rec.company.phone], [true, "شركة قديمة", "أحمد", "0100"]);
    const sid = hex(16), exp = Math.floor(Date.now() / 1000) + 3600, sh = await C.sha256(sid);
    await env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sh, m.id, C.now(), C.iso(exp * 1000)).run();
    await env.DB.prepare("INSERT INTO cc_session_meta (sid_hash, via, created_at) VALUES (?, 'legacy', ?)").bind(sh, C.now()).run();
    const legacyTok = await signSession(C.secretOf(env), m.id, sid, exp);
    assert.equal((await api(env, CC, "GET", "/api/me/recognize", { token: legacyTok })).data.code, "use_email_code");
    assert.equal((await api(env, CC, "GET", "/api/me/account", { token: legacyTok })).data.legacy_session, true);
    assert.equal((await api(env, CC, "GET", "/api/me/account")).status, 401);
  });
});

/* ===================================================================== 12. plans */
describe("plans — single source of truth", () => {
  test("with no rows every capability answer equals today's rule; PUT applies the matrix in place; validation", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env), own = await ownerTok(env);
    const scope = C.PLAN_SCOPE, names = C.PLAN_NAME, markets = ADV.PLAN_MARKETS, premiumScope = C.PLAN_SCOPE.premium, mk = [...C.MARKETS];
    const bare = { DB: new D1() }; bare.DB.db.exec("DROP TABLE IF EXISTS cc_plans"); // no matrix rows (schema.sql may already hold the 0006 seeds after P-W8)
    await PL.bootPlans(bare, { force: true }); // database without cc_plans → the original rules
    const LV = C.PLAN_LV, RULE = { alerts: 2, listing: 1, respond: 2, incoming: 2, stats: 2, priority: 3, featured: 3, procurement: 3, bassem: 4 }; // owner's matrix 2026-11-18: alerts from basic, procurement news from premium
    for (const p of Object.keys(LV)) for (const [cap, lv] of Object.entries(RULE)) assert.equal(PL.planCanX({ plan: p }, cap), p !== "visitor" && LV[p] >= lv, `${p} ${cap}`);
    assert.deepEqual([PL.planLimitX({ plan: "basic" }, "products"), PL.planLimitX({ plan: "strategic" }, "products"), PL.planLimitX({ plan: "profile" }, "products")], [30, -1, 0]);
    let r = await api(env, CC, "PUT", "/api/admin/cc/plans", { token: own.token, body: { plans: { visitor: { price_egp: 1 }, basic: { price_egp: 1.5, duration_days: 10, caps: { products: -2, m_local: 0, listing: 0 } }, premium: { caps: { nope: 1 } } }, vat_bp: 9000 } });
    assert.equal(r.status, 422); const fields = r.data.errors.map(e => e.field);
    for (const f of ["plans.visitor", "plans.basic.price_egp", "plans.basic.duration_days", "plans.basic.caps.products", "plans.premium.caps.nope", "vat_bp", "plans.basic.caps"]) assert.ok(fields.includes(f), f);
    r = await api(env, CC, "PUT", "/api/admin/cc/plans", { token: own.token, body: { plans: { basic: { price_egp: 12000, name_ar: "الأساسية الجديدة", caps: { m_gulf: 1, products: 40 } }, premium: { caps: { bassem: 1 } } }, vat_bp: 1400 } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.published_v, 1763460000999); assert.equal(r.data.persona.queued, true);
    assert.ok(log.some(x => x[0] === "publishOverlay" && x[1].reason === "plans"));
    assert.equal(C.PLAN_SCOPE, scope); assert.equal(C.PLAN_NAME, names); assert.equal(ADV.PLAN_MARKETS, markets); assert.equal(C.PLAN_SCOPE.premium, premiumScope); // same objects, mutated in place
    assert.deepEqual(C.PLAN_SCOPE.basic, ["local", "gulf"]); assert.deepEqual(C.PLAN_NAME.basic, ["الأساسية الجديدة", "Basic plan"]);
    assert.deepEqual(Object.keys(ADV.PLAN_MARKETS).sort(), ["partner", "premium", "strategic"]); assert.deepEqual(ADV.PLAN_MARKETS.premium, ["local", "gulf"]);
    if (Array.isArray(ADV.ELIGIBLE)) assert.deepEqual([...ADV.ELIGIBLE].sort(), ["partner", "premium", "strategic"]);
    assert.deepEqual(C.MARKETS, mk); // the shared "all markets" list is never mutated
    assert.equal(PL.planLimitX({ plan: "basic" }, "products"), 40); assert.equal(PL.planCanX({ plan: "premium" }, "bassem"), true);
    if (typeof C.planCan === "function") assert.equal(C.planCan({ plan: "premium" }, "bassem"), true);
    const pub = await api(env, CC, "GET", "/api/plans");
    assert.equal(pub.headers.get("Cache-Control"), "public, max-age=60");
    assert.deepEqual(pub.data.plans.map(p => [p.key, p.price_egp]), [["profile", 4000], ["basic", 12000], ["premium", 25000], ["partner", 50000], ["strategic", 100000]]);
    assert.equal(pub.data.vat_bp, 1400); assert.ok(!pub.text.includes("secret"));
    const g = await api(env, CC, "GET", "/api/admin/cc/plans", { token: own.token });
    assert.equal(g.data.plans.basic.price_egp, 12000); assert.equal(g.data.persona.last.length, 3);
    assert.equal((await auditRows(env, "plans.save")).length, 1);
    await PL.bootPlans(bare, { force: true }); // back to defaults for the next tests
    assert.deepEqual(C.PLAN_SCOPE.basic, ["local"]); assert.equal(C.PLAN_SCOPE.strategic, C.MARKETS); assert.deepEqual(C.PLAN_NAME.basic, ["الباقة الأساسية", "Basic"]);
    assert.deepEqual(Object.keys(ADV.PLAN_MARKETS).sort(), ["partner", "strategic"]);
  });
  test("matrix rules (owner, 2026-11-18): the code defaults; a sellable plan needs a market OR the listing; gcc_pick 0–5 and only with the Gulf market; built-in rows stay code-owned; a gcc_pick change says who must choose again", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env), put = body => api(env, CC, "PUT", "/api/admin/cc/plans", { token: own.token, body });
    // the code defaults (no matrix rows): profile opens no market and has no alerts; procurement news and the 3-state pick from premium
    const D = PL.DEFAULT_PLANS;
    assert.deepEqual([D.profile.caps.m_local, D.profile.caps.alerts, D.profile.caps.listing, D.basic.caps.procurement, D.premium.caps.procurement, D.premium.caps.gcc_pick, D.partner.caps.gcc_pick, D.strategic.caps.procurement], [0, 0, 1, 0, 1, 3, 0, 1]);
    assert.deepEqual(C.PLAN_SCOPE.profile, []); assert.equal(C.gccPick("premium"), 3); assert.equal(C.gccPick("partner"), 0); assert.equal(C.gccPick("basic"), 0);
    let r = await put({ plans: { profile: { caps: { m_local: 0, listing: 0 } } } });
    assert.equal(r.status, 422); assert.ok(r.data.errors.some(e => e.field === "plans.profile.caps" && /ملف في الدليل/.test(e.msg)));
    r = await put({ plans: { basic: { caps: { gcc_pick: 4 } }, premium: { caps: { gcc_pick: 6 } }, partner: { caps: { gcc_pick: -1 } } } });
    assert.equal(r.status, 422); const f = r.data.errors.map(e => e.field);
    for (const x of ["plans.basic.caps.gcc_pick", "plans.premium.caps.gcc_pick", "plans.partner.caps.gcc_pick"]) assert.ok(f.includes(x), x);
    assert.match(r.data.errors.find(e => e.field === "plans.basic.caps.gcc_pick").msg, /Gulf market/);
    r = await put({ keys: [{ k: "gcc_pick", type: "bool", label_ar: "x", grp: "markets" }] });
    assert.equal(r.status, 422); assert.match(r.data.errors[0].msg, /built-in row/);
    // two Premium members: one chose 3 states, one not yet → gcc_pick 3 → 2: both have to choose (again); the persona texts need a review
    const a = await mkMember(env, "a@prem.test", { plan: "premium" }), b = await mkMember(env, "b@prem.test", { plan: "premium" });
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE id = ?").bind(JSON.stringify({ gcc: ["SA", "AE", "QA"], gcc_src: "admin" }), a.id).run();
    assert.deepEqual(C.gccOf(await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(a.id).first()).chosen, ["SA", "AE", "QA"]);
    r = await put({ plans: { premium: { caps: { gcc_pick: 2 } } } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.warnings.map(w => [w.code, w.plan, w.from, w.to, w.members_pending]), [["gcc_pick", "premium", 3, 2, 2]]);
    assert.ok(r.data.persona.review.some(v => v.plan === "premium" && v.key === "gcc_pick" && v.text_says === 3 && v.matrix === 2), JSON.stringify(r.data.persona.review));
    assert.equal(C.gccPick("premium"), 2);
    assert.deepEqual(C.gccOf(await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(a.id).first()), { pick: 2, all: false, chosen: [], pending: true, covers: C.GCC });
    assert.equal((await api(env, CC, "GET", "/api/plans")).data.plans.find(p => p.key === "premium").gcc_pick, 2);
    await resetMatrix();
    assert.equal(C.gccPick("premium"), 3);
  });
  /* ---------- the anchored persona price sync (DESIGN 2026-11-19 §4) on the LIVE prompts: test/fixtures/personas-2026-11-19 = the three
     system prompts read with anam_persona_get (updatedAt 2026-11-18T23:4x, unchanged at 2026-11-19 10:20Z) + GET /api/plans of that day ---------- */
  const FXD = new URL("./fixtures/personas-2026-11-19/", import.meta.url);
  const FX = Object.fromEntries(["janna_ar", "janna_en", "bassem"].map(k => [k, JSON.parse(readFileSync(new URL(k + ".json", FXD), "utf8"))]));
  const LIVE = JSON.parse(readFileSync(new URL("plans-live.json", FXD), "utf8"));
  const PID = Object.fromEntries(PL.PERSONAS.map(p => [p.kind, p.id])), kindOf = id => PL.PERSONAS.find(p => p.id === id).kind;
  const PUT6 = { plans: { profile: { caps: { m_local: 0, gcc_pick: 0, procurement: 0 } }, basic: { caps: { gcc_pick: 0, procurement: 0 } }, premium: { caps: { gcc_pick: 3, procurement: 1 } }, partner: { caps: { gcc_pick: 0, procurement: 1 } }, strategic: { caps: { gcc_pick: 0, procurement: 1 } } } };
  const diffLines = (a, b) => { const A = a.split("\n"), B = b.split("\n"); assert.equal(A.length, B.length, "same number of lines"); return A.map((l, i) => (l !== B[i] ? [i, l, B[i]] : null)).filter(Boolean); };
  const capsSet = async (env, plan, patch) => { const r = await env.DB.prepare("SELECT caps_json FROM cc_plans WHERE plan = ?").bind(plan).first(); await env.DB.prepare("UPDATE cc_plans SET caps_json = ? WHERE plan = ?").bind(JSON.stringify({ ...JSON.parse(r.caps_json), ...patch }), plan).run(); };
  const resetMatrix = async () => { const bare = { DB: new D1() }; bare.DB.db.exec("DROP TABLE IF EXISTS cc_plans"); await PL.bootPlans(bare, { force: true }); };
  /* an env whose D1 matrix = production's, and an Anam stub serving the fixture prompts (GET → {updatedAt, brain.systemPrompt}; PUT recorded) */
  async function liveEnv({ prompts, put } = {}) {
    const env = mkEnv({ ANAM_API_KEY: "anam-test" }), { CC } = fakeCC(env), own = await ownerTok(env);
    for (const p of LIVE.plans) await env.DB.prepare("UPDATE cc_plans SET caps_json = ?, price_egp = ?, name_ar = ?, name_en = ? WHERE plan = ?").bind(JSON.stringify(p.caps), p.price_egp, p.name_ar, p.name_en, p.key).run();
    const text = Object.fromEntries(Object.entries(FX).map(([k, f]) => [PID[k], (prompts && prompts[k]) || f.systemPrompt])), puts = [];
    handlers.splice(0, handlers.length); // one Anam stub: the newest env of the test answers
    handlers.push(async (url, init, req, method) => {
      const m = /^https:\/\/api\.anam\.ai\/v1\/personas\/([0-9a-f-]+)$/.exec(url); if (!m) return null;
      assert.equal((init.headers || {}).Authorization, "Bearer anam-test");
      if (method === "GET") return new Response(JSON.stringify({ id: m[1], updatedAt: FX[kindOf(m[1])].updatedAt, brain: { systemPrompt: text[m[1]] } }), { status: 200 });
      if (method === "PUT") { const b = JSON.parse(init.body); puts.push({ id: m[1], kind: kindOf(m[1]), body: b }); const r = put && put(kindOf(m[1]), puts.length); if (r) return r; text[m[1]] = b.systemPrompt; return new Response("{}", { status: 200 }); }
      return null;
    });
    return { env, CC, own, puts, text, sync: (dry = true) => api(env, CC, "POST", "/api/admin/cc/plans/persona-sync", { token: own.token, body: { dry_run: dry } }) };
  }
  test("persona sync (1+2): today's D1 matrix → «unchanged» ×3 on the live prompts, nothing written, the one stale fact reported; the Control Center PUT of DESIGN §6 → 200, review [], the automatic sync → «unchanged» ×3", async () => {
    const x = await liveEnv();
    let r = await x.sync(false);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.items.map(i => [i.status, i.found_section, i.changed]), [["unchanged", true, false], ["unchanged", true, false], ["unchanged", true, false]]);
    assert.equal(x.puts.length, 0, "nothing is written");
    for (const i of r.data.items) { assert.deepEqual(i.changes, []); assert.deepEqual(i.review, [{ plan: "profile", key: "m_local", text_says: 0, matrix: 1 }], i.name); }
    // the matrix PUT (worker deployed first: the built-in rows gcc_pick / procurement exist, profile may have no market)
    r = await api(x.env, x.CC, "PUT", "/api/admin/cc/plans", { token: x.own.token, body: PUT6 });
    assert.equal(r.status, 200, r.text); assert.deepEqual(r.data.persona, { queued: true, review: [] }); assert.equal(r.data.warnings, undefined, "gcc_pick 3 = the code default: no member changes state");
    assert.equal(x.puts.length, 0, "the automatic sync after the save wrote nothing");
    const g = await api(x.env, x.CC, "GET", "/api/admin/cc/plans", { token: x.own.token });
    assert.deepEqual(g.data.persona.last.map(l => [l.name, l.status, l.reason, l.review.length]), [["Janna AR", "unchanged", "", 0], ["Janna EN", "unchanged", "", 0], ["Bassem", "unchanged", "", 0]]);
    assert.deepEqual(g.data.keys.filter(k => ["gcc_pick", "procurement", "m_gulf"].includes(k.k)).map(k => [k.k, k.type, k.builtin, k.label_en]), [["m_gulf", "bool", 1, "Gulf markets (the 6 GCC states)"], ["gcc_pick", "number", 1, "Gulf states the member picks (0 = all six)"], ["procurement", "bool", 1, "Procurement news"]]);
    const pub = await api(x.env, x.CC, "GET", "/api/plans"), P = k => pub.data.plans.find(p => p.key === k);
    assert.deepEqual([P("profile").markets, P("premium").gcc_pick, P("premium").caps.procurement, P("basic").caps.procurement, P("partner").gcc_pick], [[], 3, 1, 0, 0]);
    assert.deepEqual(C.PLAN_SCOPE.profile, [], "applied in place: the profile plan opens no market");
    assert.deepEqual((await x.sync(true)).data.items.map(i => i.status), ["unchanged", "unchanged", "unchanged"]);
    await resetMatrix();
  });
  test("persona sync (3): basic 12,000 → the dry «after» says it in words; the real run PUTs {systemPrompt, expectedUpdatedAt} with exactly that one line changed", async () => {
    const x = await liveEnv();
    await x.env.DB.prepare("UPDATE cc_plans SET price_egp = 12000 WHERE plan = 'basic'").run();
    let r = await x.sync(true);
    assert.deepEqual(r.data.items.map(i => i.status), ["dry", "dry", "dry"]); assert.equal(x.puts.length, 0);
    assert.match(r.data.items[0].after, /\n {2}- الأساسية \(المحلية، للمصانع الصغيرة\): اتناشر ألف — مصر بس/);
    assert.match(r.data.items[1].after, /\n- Basic \(local, for small factories\): twelve thousand — Egypt only/);
    assert.match(r.data.items[2].after, /\n {2}- الأساسية \(المحلية، للمصانع الصغيرة\): اتناشر ألف — مصر:/);
    assert.deepEqual(r.data.items.map(i => i.changes), [[{ what: "price", plan: "basic", from: "عشرة آلاف", to: "اتناشر ألف" }], [{ what: "price", plan: "basic", from: "ten thousand", to: "twelve thousand" }], [{ what: "price", plan: "basic", from: "عشرة آلاف", to: "اتناشر ألف" }]]);
    r = await x.sync(false);
    assert.deepEqual(r.data.items.map(i => i.status), ["ok", "ok", "ok"]); assert.equal(x.puts.length, 3);
    for (const p of x.puts) {
      assert.deepEqual(Object.keys(p.body).sort(), ["expectedUpdatedAt", "systemPrompt"]); assert.equal(p.body.expectedUpdatedAt, FX[p.kind].updatedAt);
      const d = diffLines(FX[p.kind].systemPrompt, p.body.systemPrompt), [a, b] = p.kind === "janna_en" ? ["ten thousand", "twelve thousand"] : ["عشرة آلاف", "اتناشر ألف"];
      assert.equal(d.length, 1, p.kind); assert.equal(d[0][2], d[0][1].replace(a, b), p.kind);
    }
    const rows = (await x.env.DB.prepare("SELECT status FROM cc_persona_sync ORDER BY id").all()).results.map(y => y.status);
    assert.deepEqual(rows, ["dry", "dry", "dry", "ok", "ok", "ok"]); assert.equal((await auditRows(x.env, "persona.sync")).length, 6);
    assert.deepEqual((await x.sync(true)).data.items.map(i => i.status), ["unchanged", "unchanged", "unchanged"], "the next run finds its own text");
  });
  test("persona sync (4+5): VAT 15 % → only the header line of each price block; products 100 / 500 → only the lines that state a count (Bassem's premium line states none)", async () => {
    let x = await liveEnv();
    await x.env.DB.prepare("UPDATE cc_settings SET v = '1500' WHERE k = 'vat_bp'").run();
    let r = await x.sync(false);
    assert.deepEqual(r.data.items.map(i => i.status), ["ok", "ok", "ok"]);
    for (const p of x.puts) { const d = diffLines(FX[p.kind].systemPrompt, p.body.systemPrompt); assert.equal(d.length, 1, p.kind); assert.equal(d[0][2], d[0][1].replace("14%", "15%"), p.kind); }
    x = await liveEnv();
    await capsSet(x.env, "premium", { products: 100 }); await capsSet(x.env, "strategic", { products: 500 });
    r = await x.sync(false);
    const by = Object.fromEntries(x.puts.map(p => [p.kind, diffLines(FX[p.kind].systemPrompt, p.body.systemPrompt)]));
    assert.equal(by.janna_ar.length, 2); assert.equal(by.janna_ar[0][2], by.janna_ar[0][1].replace("و80 منتج", "و100 منتج")); assert.equal(by.janna_ar[1][2], by.janna_ar[1][1].replace("منتجات بلا حد", "500 منتج"));
    assert.equal(by.janna_en.length, 2); assert.equal(by.janna_en[0][2], by.janna_en[0][1].replace("; 80 products;", "; 100 products;")); assert.equal(by.janna_en[1][2], by.janna_en[1][1].replace("unlimited products", "500 products"));
    assert.equal(by.bassem.length, 1); assert.equal(by.bassem[0][2], by.bassem[0][1].replace("منتجات بلا حد", "500 منتج"));
    assert.deepEqual(r.data.items[2].changes, [{ what: "products", plan: "strategic", from: "منتجات بلا حد", to: "500" }]);
  });
  test("persona sync (6+7): a rename changes the label in the price block only and reports the old name elsewhere; a market switch is never written — «review»", async () => {
    let x = await liveEnv();
    await x.env.DB.prepare("UPDATE cc_plans SET name_ar = 'الباقة الذهبية', name_en = 'Gold plan' WHERE plan = 'premium'").run();
    let r = await x.sync(true);
    assert.deepEqual(r.data.items.map(i => i.status), ["dry", "dry", "dry"]);
    assert.match(r.data.items[0].after, /\n {2}- الذهبية \(للمصانع المتوسطة\): خمسة وعشرين ألف — /); assert.match(r.data.items[1].after, /\n- Gold \(for medium factories\): twenty-five thousand — /);
    for (const [i, old] of [[0, "المميزة"], [1, "Premium"], [2, "المميزة"]]) {
      const it = r.data.items[i]; assert.deepEqual(it.changes, [{ what: "name", plan: "premium", from: old, to: i === 1 ? "Gold" : "الذهبية" }]);
      const rv = it.review.find(v => v.kind === "name_elsewhere"); assert.ok(rv && rv.plan === "premium" && rv.old === old && rv.count > 0, JSON.stringify(it.review));
    }
    const save = await api(x.env, x.CC, "PUT", "/api/admin/cc/plans", { token: x.own.token, body: { plans: { premium: { name_ar: "الباقة الذهبية 2" } } } });
    assert.ok(save.data.persona.review.some(v => v.kind === "name" && v.plan === "premium" && v.lang === "ar" && v.to === "الذهبية 2"), "the save answer predicts it without calling Anam");
    x = await liveEnv();
    await capsSet(x.env, "premium", { m_africa: 1 });
    r = await x.sync(false);
    assert.deepEqual(r.data.items.map(i => i.status), ["unchanged", "unchanged", "unchanged"]); assert.equal(x.puts.length, 0);
    for (const it of r.data.items) assert.ok(it.review.some(v => v.plan === "premium" && v.key === "m_africa" && v.text_says === 0 && v.matrix === 1), it.name);
    await resetMatrix();
  });
  test("persona sync (8): the gateway goes live → only the payment sentence of the Janna prompts changes (Bassem's facts have none)", async () => {
    const x = await liveEnv();
    x.CC.payments.payReady = async () => ({ ready: true, provider: "paymob", manual: false });
    const r = await x.sync(false);
    assert.deepEqual(r.data.items.map(i => i.status), ["ok", "ok", "unchanged"]);
    for (const p of x.puts) { const d = diffLines(FX[p.kind].systemPrompt, p.body.systemPrompt), P = p.kind === "janna_en" ? PL.PAY_EN : PL.PAY_AR; assert.equal(d.length, 1, p.kind); assert.equal(d[0][2], d[0][1].replace(P[0], P[1])); }
  });
  test("persona sync (9): broken anchors → the reason, nothing written, never retried; a 409 from Anam → failed «conflict», retried by the hourly cron", async () => {
    const ar = FX.janna_ar.systemPrompt, en = FX.janna_en.systemPrompt, bs = FX.bassem.systemPrompt;
    for (const [prompts, want] of [
      [{ janna_ar: ar.replace("# حقائق الباقات والدفع", "# الباقات"), janna_en: en.replace("Annual fees in Egyptian pounds plus 14% VAT; no free registration:", "Annual fees:"), bassem: bs.replace(/\n {2}- الشريك الاستراتيجي[^\n]*/, "") }, ["section_missing", "price_header_missing", "plan_lines_count"]],
      [{ janna_ar: ar.replace("أربعة آلاف — بتعمل", "4.000 — بتعمل"), bassem: bs.replace("- الباقات (سنوية بالجنيه + ضريبة 14%):", "- الباقات:") }, ["plan_line_shape", "", "price_header_missing"]],
    ]) {
      const x = await liveEnv({ prompts });
      await x.env.DB.prepare("UPDATE cc_plans SET price_egp = 12000 WHERE plan = 'basic'").run(); // a real change to write
      const r = await x.sync(false);
      assert.deepEqual(r.data.items.map(i => i.reason), want.map(w => (w === "" ? "" : w)));
      for (const it of r.data.items) if (it.reason) { assert.equal(it.status, "failed"); assert.ok(it.error.startsWith(it.reason + " — "), it.error); assert.equal(it.found_section, false); }
      assert.ok(x.puts.every(p => !want[["janna_ar", "janna_en", "bassem"].indexOf(p.kind)]), "nothing written where the structure is broken");
      await x.env.DB.prepare("UPDATE cc_persona_sync SET at = ?").bind(C.iso(Date.now() - 7200000)).run();
      assert.equal((await PL.personaRetry(x.env, Date.now(), x.CC)).retried, 0, "a structure failure waits for a person");
      const g = await api(x.env, x.CC, "GET", "/api/admin/cc/plans", { token: x.own.token });
      assert.deepEqual(g.data.persona.last.map(l => l.reason), want);
    }
    // 409: someone saved the prompt in Anam between our GET and PUT
    let n409 = 0;
    const x = await liveEnv({ put: kind => (kind === "janna_ar" && n409++ === 0 ? new Response(JSON.stringify({ error: "conflict" }), { status: 409 }) : null) });
    await x.env.DB.prepare("UPDATE cc_plans SET price_egp = 12000 WHERE plan = 'basic'").run();
    let r = await x.sync(false);
    assert.deepEqual(r.data.items.map(i => [i.status, i.reason]), [["failed", "conflict"], ["ok", ""], ["ok", ""]]);
    assert.match(r.data.items[0].error, /^conflict: /);
    await x.env.DB.prepare("UPDATE cc_persona_sync SET at = ?").bind(C.iso(Date.now() - 7200000)).run();
    const re = await PL.personaRetry(x.env, Date.now(), x.CC);
    assert.deepEqual([re.retried, re.ok], [1, 1]);
    assert.equal(x.puts.filter(p => p.kind === "janna_ar").length, 2);
    assert.equal((await x.env.DB.prepare("SELECT status FROM cc_persona_sync WHERE persona_id = ? ORDER BY id DESC LIMIT 1").bind(PID.janna_ar).first()).status, "ok");
    // no key → never retried either
    const y = await liveEnv(); y.env.ANAM_API_KEY = ""; r = await y.sync(false);
    assert.deepEqual(r.data.items.map(i => [i.status, i.reason]), [["failed", "no_key"], ["failed", "no_key"], ["failed", "no_key"]]);
  });
  test("persona sync (10, review R-1): every kind of change synced on its own output again is «unchanged» — no label grows; a name with «:» «—» or brackets is refused; a price that cannot be spoken is never written", async () => {
    const cases = [
      ["price", async x => x.env.DB.prepare("UPDATE cc_plans SET price_egp = 12000 WHERE plan = 'basic'").run()],
      ["vat", async x => x.env.DB.prepare("UPDATE cc_settings SET v = '1500' WHERE k = 'vat_bp'").run()],
      ["products", async x => { await capsSet(x.env, "premium", { products: 100 }); await capsSet(x.env, "strategic", { products: 500 }); }],
      ["rename", async x => x.env.DB.prepare("UPDATE cc_plans SET name_ar = 'الباقة الذهبية', name_en = 'Gold plan' WHERE plan = 'premium'").run()],
      ["rename to a longer name", async x => x.env.DB.prepare("UPDATE cc_plans SET name_ar = 'الباقة المميزة بلس', name_en = 'Premium Plus plan' WHERE plan = 'premium'").run()],
      ["a stored name with brackets (before the rule)", async x => x.env.DB.prepare("UPDATE cc_plans SET name_ar = 'الباقة المميزة (جديدة)', name_en = 'Premium plan (new)' WHERE plan = 'premium'").run()],
      ["a stored name with «:»", async x => x.env.DB.prepare("UPDATE cc_plans SET name_ar = 'الباقة المميزة: الذهبية' WHERE plan = 'premium'").run()],
      ["gateway", async x => { x.CC.payments.payReady = async () => ({ ready: true, provider: "paymob", manual: false }); }],
    ];
    for (const [what, change] of cases) {
      const x = await liveEnv(); await change(x);
      let r = await x.sync(false);
      assert.ok(r.data.items.every(i => ["ok", "unchanged"].includes(i.status)), what + ": " + JSON.stringify(r.data.items.map(i => [i.status, i.reason, i.error])));
      const n = x.puts.length; assert.ok(n > 0, what + ": something to write");
      const model = await PL.personaModel(x.env, x.CC);
      for (const k of ["janna_ar", "janna_en", "bassem"]) {
        const t = x.text[PID[k]], again = PL.rewritePrompt(k, t, model);
        assert.ok(again.found, what + " " + k + ": " + again.reason + " " + (again.where || ""));
        assert.equal(again.text, t, what + " " + k + ": the sync of its own output changes nothing");
        assert.deepEqual(again.changes, [], what + " " + k);
        assert.equal(t.split("\n").length, FX[k].systemPrompt.split("\n").length, what + " " + k + ": same number of lines");
      }
      for (const save of [12000, 10000]) { // two unrelated saves later (the reviewer's probe): nothing grows
        await x.env.DB.prepare("UPDATE cc_plans SET price_egp = ? WHERE plan = 'basic'").bind(save).run();
        r = await x.sync(false);
        assert.ok(r.data.items.every(i => ["ok", "unchanged"].includes(i.status)), what + " save " + save);
      }
      for (const k of ["janna_ar", "janna_en", "bassem"]) assert.equal(PL.rewritePrompt(k, x.text[PID[k]], await PL.personaModel(x.env, x.CC)).changes.length, 0, what + " " + k + " after more saves");
      const ar = x.text[PID.janna_ar].split("\n").find(l => /^ {2}- .*: خمسة وعشرين ألف — /.test(l)) || "";
      const lab = ar.replace(/^ {2}- /, "").split(": ")[0];
      assert.ok(lab && !/\(جديدة\)/.test(lab) && (lab.match(/\(/g) || []).length <= 1, what + ": the premium label holds at most its own qualifier: " + lab);
    }
    // the Control Center refuses the characters that break the price lines (and says why)
    const x = await liveEnv();
    for (const [lang, nm] of [["ar", "الباقة المميزة: الذهبية"], ["ar", "الباقة المميزة (جديدة)"], ["ar", "المميزة — الجديدة"], ["en", "Premium (new)"], ["en", "Premium: gold"]]) {
      const r = await api(x.env, x.CC, "PUT", "/api/admin/cc/plans", { token: x.own.token, body: { plans: { premium: { ["name_" + lang]: nm } } } });
      assert.equal(r.status, 422, nm); assert.equal(r.data.code, "name_chars", nm); assert.equal(r.data.errors[0].field, "plans.premium.name_" + lang);
      assert.match(r.data.errors[0].msg, /جنة وباسم/);
    }
    assert.equal((await api(x.env, x.CC, "PUT", "/api/admin/cc/plans", { token: x.own.token, body: { plans: { premium: { name_ar: "الباقة المميزة - الذهبية" } } } })).status, 200, "a hyphen is fine");
    // a price that cannot be spoken as a price (under 10, here 5): nothing is written, the reason says where
    const y = await liveEnv();
    await y.env.DB.prepare("UPDATE cc_plans SET price_egp = 5 WHERE plan = 'basic'").run();
    const r = await y.sync(false);
    assert.deepEqual(r.data.items.map(i => [i.status, i.reason]), [["failed", "plan_line_shape"], ["failed", "plan_line_shape"], ["failed", "plan_line_shape"]]);
    assert.equal(y.puts.length, 0);
    assert.match(r.data.items[0].error, /basic/);
    await resetMatrix();
  });
});

/* ===================================================================== 13. settings */
describe("settings", () => {
  test("public vs private keys; validation; '-' hides a social link; public JSON has public keys only", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env), ed = await staffTok(env, "editor");
    let r = await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { public: { contact_email: "nope", hotline_tel: "abc", social_x: "http://x.com", vat_bp: "9000", unknown_key: "x" } } });
    assert.equal(r.status, 422); assert.deepEqual(r.data.errors.map(e => e.field).sort(), ["contact_email", "hotline_tel", "social_x", "unknown_key", "vat_bp"]);
    r = await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { public: { social_x: "-", whatsapp_number: "+201001112222", address_en: "6th of October <script>" }, custom: [{ k: "legacy.note", v: "x" }] } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.published_v, 1763460000999);
    assert.equal((await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { custom: [{ k: "pay.provider", v: "x" }] } })).status, 422);
    assert.equal((await api(env, CC, "PUT", "/api/admin/cc/settings", { token: own.token, body: { delete: ["contact_email"] } })).status, 422);
    const pub = await api(env, CC, "GET", "/api/settings");
    assert.equal(pub.data.settings.social_x, "-"); assert.equal(pub.data.settings.address_en, "6th of October ‹script›");
    for (const k of Object.keys(pub.data.settings)) assert.ok(k in PL.PUBLIC_KEYS, k);
    assert.ok(!("mail.from_email" in pub.data.settings) && !("pay.provider" in pub.data.settings) && !("legacy.note" in pub.data.settings));
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/settings", { token: ed.token })).status, 200);
    assert.equal((await api(env, CC, "PUT", "/api/admin/cc/settings", { token: ed.token, body: { public: { tax_no: "1" } } })).data.need, "settings.write");
  });
});

/* ===================================================================== 15. old-password bridge */
function oldApi({ ok = true, me = { ok: true, user: { id: 41, email: "fac@old.test", company: "مصنع قديم", manager: "حسن", tel: "01002223334", plan: "basic", plan_until: "2027-06-30", status: "active", last_login: "2026-10-01 10:00" } }, failHard } = {}) {
  const calls = [];
  handlers.push(async (url, init, req, method) => {
    if (!url.startsWith(OLD + "/api/index.php")) return null;
    const a = new URL(url).searchParams.get("a"); calls.push({ a, cookie: (init.headers || {}).Cookie || "", body: init.body });
    if (failHard === "network") throw new TypeError("network down");
    if (failHard === "5xx") return new Response("err", { status: 502 });
    if (a === "login") return new Response(JSON.stringify(ok ? { ok: true } : { ok: false, error: "wrong" }), { status: ok ? 200 : 401, headers: { "Set-Cookie": "PHPSESSID=abc123; path=/; HttpOnly" } });
    if (a === "me") return new Response(JSON.stringify(me), { status: 200 });
    if (a === "logout") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  return calls;
}
describe("old-password sign-in bridge", () => {
  test("success: login → me → logout; 7-day session marked legacy; plan by the import rule; notice e-mail; password stored nowhere", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), { CC } = fakeCC(env), calls = oldApi();
    const out = [], orig = console.log, origE = console.error; console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
    let r; try { r = await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "Fac@Old.test", password: "Pa55-secret-word", lang: "ar" } }); } finally { console.log = orig; console.error = origE; }
    assert.equal(r.status, 200, r.text); assert.equal(r.data.via, "legacy"); assert.match(r.data.token, /^v2\./);
    assert.deepEqual(calls.map(c => c.a), ["login", "me", "logout"]); assert.equal(calls[1].cookie, "PHPSESSID=abc123");
    const days = (Date.parse(r.data.expires_at) - Date.now()) / 86400000; assert.ok(days > 6.9 && days < 7.1);
    const m = await env.DB.prepare("SELECT * FROM members WHERE email = 'fac@old.test'").first();
    assert.deepEqual([m.plan, m.company, m.name, m.phone, m.verified, m.email_verified_at], ["basic", "مصنع قديم", "حسن", "+201002223334", 1, ""]);
    assert.equal((await env.DB.prepare("SELECT via FROM cc_session_meta").first()).via, "legacy");
    assert.ok(sent.some(x => x.to === "fac@old.test" && /api\/auth\/legacy\/stop\?m=/.test(x.text)));
    for (const t of (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(x => x.name)) {
      const rows = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results); assert.ok(!rows.includes("Pa55-secret-word"), "password in " + t);
    }
    assert.ok(!out.join("\n").includes("Pa55-secret-word"));
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/whoami", { token: r.data.token })).status, 403);
    assert.equal((await api(env, CC, "GET", "/api/me/account", { token: r.data.token })).data.legacy_session, true);
    // «مش انت؟»
    const stop = /(https:\/\/madeinegyptgate\.com\/api\/auth\/legacy\/stop\?m=[^\s]+)/.exec(sent.find(x => x.to === "fac@old.test").text)[1].replace(SITE, "");
    assert.match((await api(env, CC, "GET", stop)).text, /<form method="post">/);
    assert.equal((await api(env, CC, "POST", stop)).status, 200);
    assert.equal((await api(env, CC, "GET", "/api/me/account", { token: r.data.token })).status, 401);
    const before = calls.length;
    assert.equal((await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "fac@old.test", password: "Pa55-secret-word" } })).data.code, "use_email_code");
    assert.equal(calls.length, before); // refused before contacting the old server
    assert.equal((await api(env, CC, "GET", "/api/auth/legacy/stop?m=x&s=bad")).text.includes("رابط غير صالح"), true);
    assert.deepEqual((await api(env, CC, "GET", "/api/auth/legacy/health")).data, { enabled: true });
  });
  test("staff and ADMIN_EMAILS never reach the old server; wrong password → 401 → locked; mismatch 409; network/5xx 503", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), { CC } = fakeCC(env), calls = oldApi({ ok: false });
    await staffTok(env, "support", "staff@old.test");
    for (const e of ["owner@mig.test", "staff@old.test"]) { const r = await api(env, CC, "POST", "/api/auth/legacy", { body: { email: e, password: "x" } }); assert.deepEqual([r.status, r.data.code], [403, "use_email_code"], e); }
    assert.equal(calls.length, 0);
    for (let i = 0; i < 5; i++) assert.equal((await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "w@old.test", password: "bad" }, ip: "10.1.0." + i })).data.code, "invalid_credentials");
    const locked = await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "w@old.test", password: "bad" }, ip: "10.1.1.1" });
    assert.deepEqual([locked.status, locked.data.code], [429, "locked"]);
    handlers.length = 0; oldApi({ me: { ok: true, user: { email: "someone@else.test", plan: "basic", status: "active" } } });
    assert.equal((await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "a@old.test", password: "x" }, ip: "10.2.0.1" })).data.code, "email_mismatch");
    for (const f of ["network", "5xx"]) { handlers.length = 0; oldApi({ failHard: f }); const r = await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "b@old.test", password: "x" }, ip: "10.3.0." + f.length }); assert.deepEqual([r.status, r.data.code], [503, "legacy_off"], f); }
    assert.deepEqual((await api({ ...env, LEGACY_ORIGIN: "off" }, CC, "GET", "/api/auth/legacy/health")).data, { enabled: false });
  });
  test("a pending old account stays pending with the requested plan; a higher plan in force is never lowered", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), { CC } = fakeCC(env);
    oldApi({ me: { ok: true, user: { email: "pend@old.test", plan: "premium", status: "pending" } } });
    assert.equal((await api(env, CC, "POST", "/api/auth/legacy", { body: { email: "pend@old.test", password: "x" } })).status, 200);
    const m = await env.DB.prepare("SELECT m.plan, mm.status, mm.requested_plan FROM members m JOIN cc_member_meta mm ON mm.member_id = m.id WHERE m.email = 'pend@old.test'").first();
    assert.deepEqual([m.plan, m.status, m.requested_plan], ["visitor", "pending", "premium"]);
    const hi = await mkMember(env, "hi@old.test", { plan: "strategic" });
    assert.deepEqual(Object.keys((await import("../src/acc-legacy.js")).legacyPlanRule(hi, null, { plan: "basic", status: "active", plan_until: "" })), ["legacy"]);
  });
});

/* ===================================================================== 16. old API proxy */
describe("old API proxy /api/index.php", () => {
  test("method, query, body and cookies forwarded unchanged; response kept + no-store; off → 503", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), { CC } = fakeCC(env), seen = [];
    handlers.push(async (url, init, req) => { if (!url.startsWith(OLD + "/api/index.php")) return null; seen.push({ url, method: req.method, cookie: req.headers.get("Cookie"), ct: req.headers.get("Content-Type"), body: await req.text() });
      return new Response(JSON.stringify({ ok: true, rows: [1] }), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": "PHPSESSID=z; path=/", "Cache-Control": "max-age=99" } }); });
    const r = await api(env, CC, "POST", "/api/index.php?a=admin_list&x=1", { body: { e: "users", page: 2 }, headers: { Cookie: "PHPSESSID=abc" } });
    assert.equal(r.status, 200); assert.deepEqual(r.data, { ok: true, rows: [1] });
    assert.deepEqual(seen[0], { url: OLD + "/api/index.php?a=admin_list&x=1", method: "POST", cookie: "PHPSESSID=abc", ct: "application/json", body: JSON.stringify({ e: "users", page: 2 }) });
    assert.equal(r.headers.get("Cache-Control"), "no-store"); assert.equal(r.headers.get("Set-Cookie"), "PHPSESSID=z; path=/");
    const g = await api(env, CC, "GET", "/api/index.php?a=me");
    assert.equal(g.status, 200); assert.equal(seen[1].method, "GET"); assert.equal(seen[1].url, OLD + "/api/index.php?a=me");
    const off = await api({ ...env, LEGACY_ORIGIN: "off" }, CC, "GET", "/api/index.php?a=me");
    assert.deepEqual([off.status, off.data], [503, { ok: false, error: "legacy_off" }]);
  });
});

/* ===================================================================== 17. import */
describe("import from the old system (owner only)", () => {
  test("every entity lands where §1.5 says; dry run writes nothing; re-run = unchanged; local edits → conflict; secrets dropped", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env), own = await ownerTok(env), adm = await staffTok(env, "admin");
    assert.equal((await api(env, CC, "POST", "/api/admin/cc/import/runs", { token: adm.token, body: {} })).data.code, "owner_only");
    const run = (await api(env, CC, "POST", "/api/admin/cc/import/runs", { token: own.token, body: { options: { overwrite: false, publish: false } } })).data.run;
    const B = (entity, rows, dry_run) => api(env, CC, "POST", `/api/admin/cc/import/runs/${run.id}/batch`, { token: own.token, body: { entity, rows, dry_run } });
    const users = [{ id: 7, email: "Old.User@Fac.test", company: "مصنع قديم", manager: "سامي", tel: "01003334445", plan: "premium", plan_until: "2027-03-01", status: "active", last_login: "2026-09-09", pass_hash: "$2y$secret", data: { addr: "العاشر", web: "https://old.example", api_key: "k" } },
      { id: 8, email: "pend@fac.test", company: "Pending Co", plan: "basic", status: "pending" }, { id: 9, email: "bad-email" }];
    let r = await B("users", users, true);
    assert.deepEqual(r.data.counts, { create: 2, update: 0, unchanged: 0, conflict: 0, skip: 0, error: 1 });
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE email LIKE '%fac.test'").first()).n, 0); // dry run: nothing written
    assert.ok(r.data.results[0].warnings.some(w => /pass_hash/.test(w)));
    r = await B("users", users, false);
    assert.equal(r.data.counts.create, 2);
    const u = await env.DB.prepare("SELECT m.*, mm.legacy_id, mm.legacy_profile_json, mm.status AS st, mm.requested_plan FROM members m JOIN cc_member_meta mm ON mm.member_id = m.id WHERE m.email = 'old.user@fac.test'").first();
    assert.deepEqual([u.plan, u.company, u.name, u.phone, u.legacy_id, u.verified], ["premium", "مصنع قديم", "سامي", "+201003334445", "7", 1]);
    assert.ok(u.plan_expires.startsWith("2027-03-01")); assert.deepEqual(JSON.parse(u.legacy_profile_json), { addr: "العاشر", web: "https://old.example" });
    const p = await env.DB.prepare("SELECT m.plan, mm.status, mm.requested_plan FROM members m JOIN cc_member_meta mm ON mm.member_id = m.id WHERE m.email = 'pend@fac.test'").first();
    assert.deepEqual([p.plan, p.status, p.requested_plan], ["visitor", "pending", "basic"]);
    assert.ok(!JSON.stringify((await env.DB.prepare("SELECT * FROM cc_member_meta").all()).results).includes("$2y$secret"));
    assert.equal(sent.length, 0); // the import never e-mails
    r = await B("users", users.slice(0, 2), false);
    assert.deepEqual([r.data.counts.unchanged, r.data.counts.create], [2, 0]);
    await env.DB.prepare("UPDATE members SET company = 'تعديل محلي' WHERE email = 'old.user@fac.test'").run();
    r = await B("users", [{ ...users[0], company: "اسم جديد من القديم" }], false);
    assert.equal(r.data.counts.conflict, 1);
    // companies (admin-only contacts) + suggested listing
    r = await B("members", [{ id: 3, company: "Hydrohex", manager: "م. علي", country: "EG", phones: "01001001001 | 0225555555", web: "https://hydrohex.example", address: "القليوبية", activity: "مياه", email: "info@hydrohex.example", status: "registered" }], false);
    const lc = await env.DB.prepare("SELECT * FROM cc_legacy_companies WHERE legacy_id = '3'").first();
    assert.deepEqual([lc.phones, lc.suggested_ref, lc.status], ["01001001001 | 0225555555", "5", "registered"]);
    assert.equal((await B("members", [{ id: 3, company: "Hydrohex", manager: "م. علي", country: "EG", phones: "01001001001 | 0225555555", web: "https://hydrohex.example", address: "القليوبية", activity: "مياه", email: "info@hydrohex.example", status: "registered" }], false)).data.counts.unchanged, 1);
    // messages
    r = await B("messages", [{ id: 51, name: "عميل", phone: "0100", email: "c@x.test", kind: "contact", subject: "سؤال", body: "نص", status: "new", created_at: "2026-08-01 10:00" }], false);
    assert.equal(r.data.counts.create, 1); assert.equal((await env.DB.prepare("SELECT status FROM cc_legacy_messages WHERE legacy_id = '51'").first()).status, "new");
    // public content → CC.content drafts
    r = await B("products", [{ id: 1, name: "فلفل اسود", company: "مصنع البهارات السبعه", category: "food" }, { id: 2, name: "منتج جديد", company: "شركة", category: "مواد غذائية", price: "100", img: "https://old/x.jpg", descr: "وصف" }], false);
    assert.deepEqual([r.data.results[0].action, r.data.results[1].action], ["skip", "create"]);
    const pu = log.filter(x => x[0] === "upsert").pop()[1];
    assert.deepEqual([pu.coll, pu.kind, pu.publish, pu.source, pu.fields.category, pu.fields.legacy_img], ["prod", "add", false, "import", "food", "https://old/x.jpg"]);
    r = await B("rfqs", [{ id: 12, client: "عميل سري", phone: "0109", product: "حديد", qty: "10", unit: "طن", city: "القاهرة", gov: "CAI", status: "active", deadline: "2030-01-01" }], false);
    const ru = log.filter(x => x[0] === "upsert").pop()[1];
    assert.deepEqual([ru.coll, ru.id, ru.fields.qty, ru.private.client, ru.publish], ["rfq", "L12", "10 طن", "عميل سري", false]);
    assert.ok(!JSON.stringify(ru.fields).includes("عميل سري"));
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries").first()).n, 0); // nothing routed
    r = await B("items:news", [{ id: 70, title: "خبر قديم", body: "تفاصيل", link: "https://news.example/a", created_at: "2026-07-01", status: "active" }], false);
    assert.equal(log.filter(x => x[0] === "upsert").pop()[1].fields.source_name, "news.example");
    // settings / plans / pay / mail
    r = await B("settings", [{ k: "whatsapp", v: "01279188996" }, { k: "smtp_pass", v: "x" }], false);
    assert.equal((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'legacy.whatsapp'").first()).v, "01279188996");
    r = await B("plans", [{ keys: { products: "عدد المنتجات", video: "فيديو", tenders: "المناقصات", banners: "بانرات" }, perms: { basic: { products: 25, video: 1, tenders: 1, banners: 2 }, premium: { products: 90 } } }], true);
    assert.equal(r.data.results[0].action, "update");
    r = await B("plans", [{ keys: { products: "عدد المنتجات", video: "فيديو", tenders: "المناقصات", banners: "بانرات" }, perms: { basic: { products: 25, video: 1, tenders: 1, banners: 2 }, premium: { products: 90 } } }], false);
    const caps = JSON.parse((await env.DB.prepare("SELECT caps_json FROM cc_plans WHERE plan = 'basic'").first()).caps_json);
    assert.deepEqual([caps.products, caps.video, caps.legacy_banners], [25, 1, 2]); assert.ok(!("tenders" in caps));
    assert.equal((await env.DB.prepare("SELECT enforced_by FROM cc_plan_keys WHERE k = 'legacy_banners'").first()).enforced_by, "none");
    r = await B("pay", [{ enabled: 1, provider: "moyasar", mode: "live", merchant_id: "m1", api_key: "sk_live_x", has_api_key: 1 }], false);
    assert.ok(r.data.results[0].warnings.some(w => /re-enter/.test(w)));
    assert.equal((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'pay.enabled'").first()).v, "0"); assert.equal((await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'pay.provider'").first()).v, "");
    r = await B("mail", [{ enabled: 1, provider: "smtp", from_email: "noreply@madeinegyptgate.com", from_name: "صنع في مصر", smtp_pass: "x" }], false);
    assert.deepEqual([(await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'mail.provider'").first()).v, (await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'mail.enabled'").first()).v], ["resend", "0"]);
    assert.ok(!JSON.stringify((await env.DB.prepare("SELECT * FROM cc_settings").all()).results).includes("sk_live_x"));
    r = await api(env, CC, "POST", `/api/admin/cc/import/runs/${run.id}/batch`, { token: own.token, body: { entity: "redirects", client_result: { create: 3, error: 1, errors: [{ i: 2 }] }, dry_run: false } });
    assert.equal(r.data.counts.create, 3);
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/import/runs/${run.id}/batch`, { token: own.token, body: { entity: "nope", rows: [] } })).data.code, "invalid_entity");
    const fin = await api(env, CC, "POST", `/api/admin/cc/import/runs/${run.id}/finish`, { token: own.token, body: {} });
    assert.equal(fin.data.run.status, "partial"); assert.ok(fin.data.run.counts.users.create === 2);
    assert.equal((await api(env, CC, "POST", `/api/admin/cc/import/runs/${run.id}/batch`, { token: own.token, body: { entity: "users", rows: [] } })).data.code, "state");
    assert.ok((await auditRows(env, "import.apply")).length >= 10);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/import/runs", { token: own.token })).data.items.length, 1);
    void adm;
  });
});

/* ===================================================================== 18. analytics */
describe("page analytics POST /api/ev/pv", () => {
  test("counts views + one unique per visitor/day (+ per page); bots, foreign origins ignored; no raw IP/UA/referrer stored", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), O = { Origin: SITE };
    const pv = (b, o = {}) => api(env, CC, "POST", "/api/ev/pv", { body: b, headers: { ...O, ...(o.headers || {}) }, ip: o.ip || "41.33.12.7", ua: o.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1" });
    assert.equal((await pv({ p: "/factories/", r: "www.google.com.eg", l: "ar" })).status, 204);
    await pv({ p: "/factories/?q=1#x", r: "madeinegyptgate.com" }); await pv({ p: "/tenders/", r: "" });
    await pv({ p: "/", r: "l.facebook.com" }, { ip: "41.33.12.8", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36" });
    await pv({ p: "/", r: "" }, { ua: "Googlebot/2.1" }); await pv({ p: "/", r: "" }, { ua: "Mozilla/5.0 HeadlessChrome/120" });
    await pv({ p: "/" }, { headers: { Origin: "https://evil.example" } }); await pv({ p: "javascript:alert(1)" }); await pv({ p: "//evil" });
    const d = await env.DB.prepare("SELECT * FROM cc_pv_day").first();
    assert.deepEqual([d.views, d.uniq, d.mobile_uniq], [4, 2, 1]);
    const pages = Object.fromEntries((await env.DB.prepare("SELECT path, views, uniq FROM cc_pv_page").all()).results.map(r => [r.path, [r.views, r.uniq]]));
    assert.deepEqual(pages, { "/factories/": [2, 1], "/tenders/": [1, 1], "/": [1, 1] });
    const src = Object.fromEntries((await env.DB.prepare("SELECT src, n FROM cc_pv_src").all()).results.map(r => [r.src, r.n]));
    assert.deepEqual(src, { google: 1, direct: 1, facebook: 1 });
    const dump = JSON.stringify((await env.DB.prepare("SELECT * FROM cc_pv_seen").all()).results) + JSON.stringify((await env.DB.prepare("SELECT * FROM rl").all()).results);
    for (const leak of ["41.33.12.7", "iPhone", "google.com.eg"]) assert.ok(!dump.includes(leak), leak);
    assert.equal((await api(env, CC, "POST", "/api/ev/pv", { raw: "x".repeat(2000), headers: O })).status, 204);
    assert.equal(ST.srcOf("https://t.co/abc", "madeinegyptgate.com"), "x"); assert.equal(ST.srcOf("wa.me", "madeinegyptgate.com"), "whatsapp"); assert.equal(ST.srcOf("www.madeinegyptgate.com", "madeinegyptgate.com"), null);
    assert.equal(ST.cleanPath("/%D9%85%D8%B5%D9%86%D8%B9/?x"), "/مصنع/");
  });
});

/* ===================================================================== 20. public + 21. cron */
describe("public JSON and cron", () => {
  test("/api/plans and /api/settings: rate limit 60/min per network; CORS echo rule", async () => {
    const env = mkEnv(), { CC } = fakeCC(env);
    const r = await api(env, CC, "GET", "/api/settings", { headers: { Origin: "https://www.madeinegyptgate.com" } });
    assert.equal(r.status, 200); assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://www.madeinegyptgate.com"); assert.equal(r.data.settings.contact_email, "info@madeinegyptgate.com");
    let last; for (let i = 0; i < 60; i++) last = await api(env, CC, "GET", "/api/plans", { ip: "10.9.9.9" });
    assert.equal(last.status, 200);
    assert.equal((await api(env, CC, "GET", "/api/plans", { ip: "10.9.9.9" })).status, 429);
    assert.equal((await api(env, CC, "POST", "/api/plans", { body: {} })).status, 405);
  });
  test("cron purges pv_seen > 2 days, audit > 730 days (once a day), dead bridge-session meta; persona retry only when auto-sync failed", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), now = Date.now();
    await env.DB.prepare("INSERT INTO cc_pv_seen (h, day) VALUES ('old', ?), ('new', ?)").bind(C.addDays(C.cairoDay(now), -5), C.cairoDay(now)).run();
    await env.DB.prepare("INSERT INTO cc_audit (at, action) VALUES (?, 'x.old'), (?, 'x.new')").bind(C.iso(now - 800 * 86400000), C.iso(now)).run();
    await env.DB.prepare("INSERT INTO cc_session_meta (sid_hash, via, created_at) VALUES ('dead', 'legacy', 'x')").run();
    await env.DB.prepare("INSERT INTO cc_persona_sync (persona_id, at, status, error) VALUES ('5f06d835-22cc-4460-b412-84cefa9e565b', ?, 'ok', '')").bind(C.iso(now - 7200000)).run();
    const out = await ACC.ccCron(env, now, CC);
    assert.deepEqual([out.acc.pv_seen, out.acc.audit, out.acc.session_meta, out.acc.persona.retried], [1, 1, 1, 0]);
    assert.equal(out.payments.skipped, "no module");
    assert.equal((await ACC.ccCron(env, now, CC)).acc.audit, undefined); // once a day
    await env.DB.prepare("INSERT INTO cc_persona_sync (persona_id, at, status, error) VALUES ('5f06d835-22cc-4460-b412-84cefa9e565b', ?, 'failed', 'anam PUT 500')").bind(C.iso(now - 7200000)).run();
    const env2 = { ...env, ANAM_API_KEY: "k" };
    handlers.push(async (url, init, req, method) => url.startsWith("https://api.anam.ai/") ? new Response(JSON.stringify({ brain: { systemPrompt: "nothing" } }), { status: 200 }) : null);
    assert.equal((await ACC.accCron(env2, now, CC)).persona.retried, 1);
  });
});

describe("§12 desk → content.js desk API (deskCreate / deskMine / deskQueue / deskReview)", () => {
  test("acc passes the team member, the source and an audit callback; drafts show in «الموافقات»; review needs content.publish", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), data = await staffTok(env, "data"), ed = await staffTok(env, "editor"), sup = await staffTok(env, "support"), calls = [];
    CC.content.deskCreate = async (e, collection, item, o) => { calls.push(["create", collection, item, { by: o.by, source_url: o.source_url, actor_role: o.actor_role }]);
      const aid = await o.audit("desk.content", "content", "TEN-2026-C001", null, { coll: "tend" }, "مكتب الاستقبال — مناقصة"); assert.ok(aid > 0);
      return { ok: true, id: "TEN-2026-C001", ref: "TEN-2026-C001", state: o.source_url ? "published" : "draft", published_v: null, link: "", warnings: [] }; };
    CC.content.deskMine = async (e, by) => { calls.push(["mine", by]); return { items: [{ id: "TEN-2026-C001", ref: "TEN-2026-C001", collection: "tenders", coll: "tend", title: "توريد كابلات", state: "rejected", state_ar: "مرفوض", reject_reason: "المصدر ناقص", link: "" }], total: 1 }; };
    CC.content.deskQueue = async () => ({ items: [{ type: "desk", id: "TEN-2026-C001", collection: "tenders", submitted_at: "2026-11-18T10:00:00.000Z", state: "pending", summary: "مناقصة: توريد كابلات", created_by: "data@mig.test" }], total: 1 });
    CC.content.deskReview = async (e, adm, id, act, b) => { calls.push(["review", id, act, adm.role, b.reason || ""]); return { ok: true, state: act === "approve" ? "published" : "rejected" }; };
    let r = await api(env, CC, "POST", "/api/team/desk/content", { token: data.token, body: { collection: "tenders", item: { title: "توريد كابلات", type: "مناقصة عامة" } } });
    assert.deepEqual([r.status, r.data.state, r.data.id], [201, "draft", "TEN-2026-C001"]);
    assert.deepEqual(calls[0], ["create", "tenders", { title: "توريد كابلات", type: "مناقصة عامة" }, { by: "data@mig.test", source_url: undefined, actor_role: "data" }]);
    assert.equal((await auditRows(env, "desk.content"))[0].actor_email, "data@mig.test");
    const mine = await api(env, CC, "GET", "/api/team/desk/mine", { token: data.token });
    assert.deepEqual([mine.data.items[0].status, mine.data.items[0].reject_reason, mine.data.items[0].title], ["rejected", "المصدر ناقص", "توريد كابلات"]);
    const ap = await api(env, CC, "GET", "/api/admin/cc/approvals?type=desk", { token: ed.token });
    assert.deepEqual([ap.status, ap.data.items[0].type, ap.data.items[0].id], [200, "desk", "TEN-2026-C001"]);
    assert.equal((await api(env, CC, "GET", "/api/admin/cc/approvals?type=desk", { token: sup.token })).status, 403);
    r = await api(env, CC, "POST", "/api/admin/cc/approvals/desk/TEN-2026-C001/reject", { token: ed.token, body: { reason: "المصدر ناقص" } });
    assert.equal(r.status, 200); assert.deepEqual(calls.pop(), ["review", "TEN-2026-C001", "reject", "editor", "المصدر ناقص"]);
    assert.equal((await api(env, CC, "POST", "/api/admin/cc/approvals/desk/TEN-2026-C001/approve", { token: sup.token, body: {} })).data.need, "content.publish");
  });
});

/* ===================================================================== §12 team dashboards */
describe("§12 team roles and the front desk", () => {
  test("role matrix: seo cannot reach /api/team/desk/* or /api/admin/cc/*; data only the desk; both 401 signed out", async () => {
    const env = mkEnv(), { CC } = fakeCC(env);
    const seo = await staffTok(env, "seo"), data = await staffTok(env, "data"), sup = await staffTok(env, "support"), own = await ownerTok(env);
    for (const p of ["/api/team/desk/mine", "/api/team/whoami"]) assert.equal((await api(env, CC, "GET", p)).status, 401);
    assert.equal((await api(env, CC, "POST", "/api/team/desk/inquiry", { body: {} })).status, 401);
    for (const [p, m] of [["/api/team/desk/inquiry", "POST"], ["/api/team/desk/member", "POST"], ["/api/team/desk/content", "POST"], ["/api/team/desk/mine", "GET"]]) {
      for (const t of [seo, sup]) { const r = await api(env, CC, m, p, { token: t.token, body: m === "POST" ? {} : undefined }); assert.deepEqual([r.status, r.data.code], [403, "forbidden"], p); }
      assert.notEqual((await api(env, CC, m, p, { token: data.token, body: m === "POST" ? {} : undefined })).status, 403, p);
      assert.notEqual((await api(env, CC, m, p, { token: own.token, body: m === "POST" ? {} : undefined })).status, 403, p);
    }
    for (const t of [seo, data]) for (const p of ["/api/admin/cc/whoami", "/api/admin/cc/members", "/api/admin/cc/orders", "/api/admin/cc/settings", "/api/admin/cc/pay/config", "/api/admin/cc/email/config", "/api/admin/cc/content/tend"]) {
      const r = await api(env, CC, "GET", p, { token: t.token }); assert.equal(r.status, 403, p); }
    const w = await api(env, CC, "GET", "/api/team/whoami", { token: seo.token });
    assert.deepEqual([w.data.role, w.data.team_page, w.data.desk, w.data.seo], ["seo", "seo-team/", false, true]);
    assert.deepEqual([(await api(env, CC, "GET", "/api/team/whoami", { token: data.token })).data.team_page], ["data-desk/"]);
    assert.equal((await api(env, CC, "GET", "/api/team/desk/mine", { headers: { "X-Platform-Key": "pk-test-123" } })).status, 403);
    // the SEO API's own auth (functions/_lib/seo-auth.js, read-only import): seo → accepted, data → refused
    const { resolveCaller } = await import("../../functions/_lib/seo-auth.js");
    const ask = tok => resolveCaller(new Request(SITE + "/api/seo/pages", { headers: { Authorization: "Bearer " + tok } }), env);
    assert.deepEqual([(await ask(seo.token)).ok, (await ask(seo.token)).role], [true, "seo"]);
    assert.deepEqual([(await ask(data.token)).ok, (await ask(data.token)).status], [false, 403]);
    assert.equal((await ask(own.token)).role, "admin");
  });
  test("desk inquiry = the SAME create + routing path; desk member = pending + request + welcome; desk content publishes only with a source; mine = own entries", async () => {
    const env = mkEnv(), { CC, log } = fakeCC(env), data = await staffTok(env, "data"), data2 = await staffTok(env, "data", "data2@mig.test");
    const f = await mkMember(env, "plast@fac.test", { plan: "basic", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك", plan_expires: C.iso(Date.now() + 86400000 * 300) });
    let r = await api(env, CC, "POST", "/api/team/desk/inquiry", { token: data.token, body: { buyer: { name: "عميل المقر", company: "شركة الأمل", phone: "01005556667", email: "walkin@b.test", governorate: "GIZ" }, product: "براميل بلاستيك", quantity: "300", unit: "قطعة", details: "سعة 220 لتر" } });
    assert.equal(r.status, 201, r.text); assert.equal(r.data.routed, 1); assert.equal(r.data.status, "routed");
    const inq = await env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(r.data.ref).first();
    assert.equal(JSON.parse(inq.payload_json).created_by, "data@mig.test"); if (PW5) assert.equal(inq.source, "desk");
    assert.ok(sent.some(m => m.to === "walkin@b.test"), "receipt to the buyer"); assert.ok(sent.some(m => m.to === "plast@fac.test"), "routed to the registered factory");
    r = await api(env, CC, "POST", "/api/team/desk/inquiry", { token: data.token, body: { buyer: { name: "بدون إيميل", phone: "01007778889" }, product: "زجاج سيكوريت", quantity: "20 م²" } });
    assert.equal(r.status, 201); assert.equal(r.data.receipt_to, "team");
    assert.equal((await api(env, CC, "POST", "/api/team/desk/inquiry", { token: data.token, body: { buyer: { name: "x" } } })).status, 422);
    r = await api(env, CC, "POST", "/api/team/desk/member", { token: data.token, body: { company: "مصنع المقر", contact_name: "منى", email: "desk@fac.test", phone: "01112223334", sector: "الأغذية", governorate: "CAI", requested_plan: "basic" } });
    assert.equal(r.status, 201, r.text); assert.deepEqual([r.data.status, r.data.requested_plan, r.data.welcome_sent, r.data.invoice.no], ["pending", "basic", true, "INV-2026-000001"]);
    const mm = await env.DB.prepare("SELECT m.plan, mm.status, mm.requested_plan, mm.source FROM members m JOIN cc_member_meta mm ON mm.member_id = m.id WHERE m.id = ?").bind(r.data.member_id).first();
    assert.deepEqual([mm.plan, mm.status, mm.requested_plan, mm.source], ["visitor", "pending", "basic", "desk"]); // no plan activation by the desk
    const dup = await api(env, CC, "POST", "/api/team/desk/member", { token: data.token, body: { company: "شركة تانية", contact_name: "يوسف", email: "desk@fac.test", phone: "01112223334", sector: "x", governorate: "CAI", requested_plan: "basic" } });
    assert.deepEqual([dup.status, dup.data.code, dup.data.member.status], [409, "exists", "pending"]); assert.ok(!JSON.stringify(dup.data).includes("01112223334"));
    r = await api(env, CC, "POST", "/api/team/desk/content", { token: data.token, body: { collection: "tenders", item: { title: "توريد كابلات", type: "مناقصة عامة", entity: "جهة" } } });
    assert.deepEqual([r.status, r.data.state], [201, "draft"]);
    r = await api(env, CC, "POST", "/api/team/desk/content", { token: data.token, body: { collection: "projects", item: { name: "مشروع محطة" }, source_url: "https://gov.example/doc.pdf" } });
    assert.deepEqual([r.status, r.data.state], [201, "published"]);
    const ups = log.filter(x => x[0] === "upsert").map(x => x[1]);
    assert.deepEqual([ups[0].coll, ups[0].publish, ups[1].coll, ups[1].publish, ups[1].fields.source_url], ["tend", false, "proj", true, "https://gov.example/doc.pdf"]);
    assert.equal((await api(env, CC, "POST", "/api/team/desk/content", { token: data.token, body: { collection: "news", item: {} } })).data.code, "invalid_collection");
    const mine = await api(env, CC, "GET", "/api/team/desk/mine", { token: data.token });
    assert.equal(mine.data.total, 5); assert.deepEqual(mine.data.items.map(i => i.kind), ["content", "content", "member", "inquiry", "inquiry"]);
    assert.equal(mine.data.items[3].status, "in_progress"); assert.match(mine.data.items[4].link, /track\.html#MIG-/);
    assert.equal((await api(env, CC, "GET", "/api/team/desk/mine?kind=member", { token: data.token })).data.total, 1);
    assert.equal((await api(env, CC, "GET", "/api/team/desk/mine", { token: data2.token })).data.total, 0); // only own entries
    for (const a of ["desk.inquiry", "desk.member", "desk.content"]) assert.ok((await auditRows(env, a)).every(x => x.actor_email === "data@mig.test"), a);
  });
});

/* ===================================================================== Bassem monitor (deploy-2 integration, B8) */
describe("Bassem monitor GET /api/admin/cc/bassem", () => {
  test("days_left follows plan_expires (the paid period, renewals and extensions), never 365 − days since activation", async () => {
    const env = mkEnv(), { CC } = fakeCC(env), own = await ownerTok(env), day = 86400000;
    const old = C.iso(Date.now() - 500 * day); // activated 500 days ago, renewed: the old rule would say 0
    const a = await mkMember(env, "renewed@fac.test", { plan: "partner", plan_expires: C.iso(Date.parse(C.cairoDay() + "T12:00:00Z") + 100 * day) });
    const b = await mkMember(env, "new@fac.test", { plan: "strategic", plan_expires: C.iso(Date.parse(C.cairoDay() + "T12:00:00Z") + 365 * day) });
    const c = await mkMember(env, "noend@fac.test", { plan: "partner" });
    const d = await mkMember(env, "basic@fac.test", { plan: "basic", plan_expires: C.iso(Date.now() + 50 * day) });
    await env.DB.prepare("UPDATE members SET activated_at = ?").bind(old).run();
    const r = await api(env, CC, "GET", "/api/admin/cc/bassem", { token: own.token });
    assert.equal(r.status, 200, r.text);
    const by = Object.fromEntries(r.data.items.map(i => [i.member_id, i]));
    assert.equal(by[a.id].days_left, 100); assert.equal(by[b.id].days_left, 365); assert.equal(by[c.id].days_left, null, "no end date");
    assert.equal(by[a.id].plan_expires, a.plan_expires); assert.ok(!by[d.id], "basic has no Bassem");
    // the end of the Cairo day counts as that day; a plan ending today → 0
    const M = await import("../src/acc-members.js");
    assert.equal(M.bassemDaysLeft({ plan_expires: C.iso(Date.parse(C.cairoDay() + "T21:59:00Z")) }), 0);
    assert.equal(M.bassemDaysLeft({ plan_expires: "" }), null);
  });
});

/* ===================================================================== old-password bridge prerequisites (deploy-2 integration) */
describe("old-password bridge: enabled only when every prerequisite is met", () => {
  test("LEGACY_ORIGIN + session secret + e-mail provider (security notice) + the 0006 tables; otherwise /health false and POST 503", async () => {
    const env = mkEnv({ LEGACY_ORIGIN: OLD }), { CC } = fakeCC(env);
    const h = async e => (await api(e, CC, "GET", "/api/auth/legacy/health")).data.enabled;
    assert.equal(await h(env), true);
    assert.equal(await h({ ...env, LEGACY_ORIGIN: "" }), false, "no LEGACY_ORIGIN");
    assert.equal(await h({ ...env, LEGACY_ORIGIN: "off" }), false);
    assert.equal(await h({ ...env, LEGACY_ORIGIN: "http://insecure.example" }), false, "https only");
    assert.equal(await h({ ...env, ADVISOR_SECRET: "" }), false, "no session secret");
    const noMail = { ...env, RESEND_API_KEY: "" };
    assert.equal(await h(noMail), false, "no e-mail provider → no security notice → no bridge");
    const r = await api(noMail, CC, "POST", "/api/auth/legacy", { body: { email: "x@old.test", password: "secret-pass" } });
    assert.deepEqual([r.status, r.data.code], [503, "legacy_off"]);
    assert.ok(!fetchLog.some(f => f.url.startsWith(OLD)), "the old server is never contacted");
    const bare = mkEnv({ LEGACY_ORIGIN: OLD });
    for (const t of ["cc_session_meta", "cc_member_meta"]) bare.DB.db.exec("DROP TABLE " + t);
    assert.equal(await h(bare), false, "migration 0006 not applied yet");
  });
});
