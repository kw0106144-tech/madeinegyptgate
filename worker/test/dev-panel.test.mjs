// node --test for «🛠️ المطوّر / Developer» — the owner-only developer panel (src/acc-dev.js + src/flags.js + src/cf-api.js), its service-key
// slot «Cloudflare — لوحة المطوّر» (src/acc-keys.js) and the server-side enforcement of the feature switches in the real handlers.
// Everything goes through the real index.js (ccBoot + dispatch) on the real schema (helpers.mjs D1). No network: the Cloudflare API, the
// Pages / intel probes, Resend, Anam, respond.io and Tavily are stubbed; any other URL fails the test.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { platformCron } from "../src/index.js";
import { D1, waSwitchOn } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { sha256, emailKey, secretOf, cairoDay } from "../src/common.js";
import { getSecret } from "../src/crypto.js";
import { OWNER_ONLY, ROLE_PERMS, PERMS } from "../src/acc-base.js";
import { FEATURES, FEATURE_KEYS, POLICIES, featureOn, featureSync, loadFeatures, forgetFeatures, parseStore, storeJson, valueOf } from "../src/flags.js";
import { ACCOUNT_ID, CF_SLOT, PAGES_PROJECT, forgetPanel } from "../src/cf-api.js";
import { readFileSync } from "node:fs";
import { waLive, waDryReason, sendWA, bassemCron } from "../src/whatsapp.js";
import { dailyJobs } from "../src/digest.js";
import { rematchForMember } from "../src/inquiries.js";
import { loadServiceKeys } from "../src/service-keys.js";
import { dayStartIso } from "../src/acc-base.js";

const SITE = "https://madeinegyptgate.com";
const CFG = "test-config-secret-0123456789abcdef-xyz";     // ≥ 32 characters (fake)
const TOKEN = "cfdev_TEST_token_0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c"; // fake Cloudflare token
const RIO = "rio_test_token_4f7a9c2e1b8d6a3f5e0c";            // fake respond.io token
const TOOL = "tool-secret-for-tests-0123456789", TAVILY = "tvly-test-key-0123456789abcdef";
const CF = "https://api.cloudflare.com/client/v4", ACC = `/accounts/${ACCOUNT_ID}`;
const PAGES = "https://madeinegyptgate.pages.dev", INTEL = "https://migate-intel.daily-spoonbill.workers.dev";
const D = "/api/admin/cc/dev", K = "/api/admin/cc/keys";
let calls, logs, realFetch, realLog, realErr, cf, probe;

/* the stubbed Cloudflare API (the shapes wrangler 4.164 reads) + the health probes' hosts */
function cfState() {
  const ver = (id, n, at, msg) => ({ id, number: n, metadata: { created_on: at, source: "wrangler", author_email: "dev@mig.test" }, annotations: { "workers/message": msg, "workers/tag": "" } });
  const pg = (id, at, env, status, branch) => ({ id, short_id: id.slice(0, 8), project_name: PAGES_PROJECT, environment: env, url: `https://${id.slice(0, 8)}.madeinegyptgate.pages.dev`, created_on: at,
    latest_stage: { name: "deploy", status }, deployment_trigger: { type: "ad_hoc", metadata: { branch, commit_hash: "abc123def456", commit_message: "deploy " + id.slice(0, 4) } } });
  return {
    verify: "active", canonical: "pg000003-aaaa-bbbb-cccc-000000000003", fail: {}, secretsChanged: false, echoToken: false,
    prePanel: new Set(), probeDown: new Set(), // ids built BEFORE the developer panel (no /data/flags.js · no DEV_PANEL binding) · ids whose check fails
    pages: [pg("pg000001-aaaa-bbbb-cccc-000000000001", "2026-11-17T10:00:00Z", "production", "success", "main"), pg("pg000003-aaaa-bbbb-cccc-000000000003", "2026-11-19T10:00:00Z", "production", "success", "main"),
      pg("pg000002-aaaa-bbbb-cccc-000000000002", "2026-11-18T10:00:00Z", "production", "failure", "main"), pg("pg000004-aaaa-bbbb-cccc-000000000004", "2026-11-19T11:00:00Z", "preview", "success", "dev")],
    vers: { "janna-lookup": [ver("wv000001-aaaa-bbbb-cccc-000000000001", 41, "2026-11-18T09:00:00Z", "older"), ver("wv000002-aaaa-bbbb-cccc-000000000002", 42, "2026-11-19T09:00:00Z", "current")],
      "migate-intel": [ver("iv000001-aaaa-bbbb-cccc-000000000001", 7, "2026-11-19T08:00:00Z", "intel now"), ver("iv000000-aaaa-bbbb-cccc-000000000000", 6, "2026-11-10T08:00:00Z", "intel old")] },
    deps: { "janna-lookup": [{ id: "dep-jl-2", created_on: "2026-11-19T09:01:00Z", source: "wrangler", author_email: "dev@mig.test", annotations: { "workers/message": "deploy 42" }, versions: [{ version_id: "wv000002-aaaa-bbbb-cccc-000000000002", percentage: 100 }] },
      { id: "dep-jl-1", created_on: "2026-11-18T09:01:00Z", source: "wrangler", versions: [{ version_id: "wv000001-aaaa-bbbb-cccc-000000000001", percentage: 100 }] }],
      "migate-intel": [{ id: "dep-in-1", created_on: "2026-11-19T08:01:00Z", source: "wrangler", versions: [{ version_id: "iv000001-aaaa-bbbb-cccc-000000000001", percentage: 100 }] }] },
    posts: [],
  };
}
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
function cfAnswer(u, init) {
  const url = new URL(u), p = url.pathname.replace(/^\/client\/v4/, ""), m = init.method || "GET";
  const f = Object.keys(cf.fail).find(k => p.endsWith(k));
  if (f) return J({ success: false, errors: [{ code: 7003, message: cf.echoToken ? "bad request for token " + TOKEN : "Could not route to " + p }] }, cf.fail[f]);
  if (cf.refusePost && m === "POST") return J({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403);
  if (p === "/user/tokens/verify") return J({ success: true, result: { id: "t1", status: cf.verify } });
  if (p === `${ACC}/tokens/verify`) return J({ success: true, result: { id: "t1", status: cf.verify } });
  if (p === `${ACC}/pages/projects/${PAGES_PROJECT}` && m === "GET") return J({ success: true, result: { name: PAGES_PROJECT, canonical_deployment: { id: cf.canonical } } });
  if (p === `${ACC}/pages/projects/${PAGES_PROJECT}/deployments` && m === "GET") return J({ success: true, result: cf.pages });
  let x = /^\/accounts\/[a-f0-9]{32}\/pages\/projects\/madeinegyptgate\/deployments\/([^/]+)\/rollback$/.exec(p);
  if (x && m === "POST") { cf.posts.push({ kind: "pages", id: x[1], body: init.body ? JSON.parse(init.body) : null }); cf.canonical = x[1]; return J({ success: true, result: { id: "pg-new-rollback-0001", short_id: "pgnew001", created_on: "2026-11-19T12:00:00Z", url: "https://pgnew001.madeinegyptgate.pages.dev" } }); }
  x = /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/([a-z-]+)\/versions\/([^/]+)$/.exec(p);
  if (x && m === "GET") { // Get Version Detail: the bindings (plain-text vars carry their text; secrets only their names)
    if (cf.probeDown.has(x[2])) return J({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403);
    const b = [{ name: "SITE_URL", type: "plain_text", text: "https://madeinegyptgate.com/" }, { name: "ADVISOR_SECRET", type: "secret_text" }];
    if (!cf.prePanel.has(x[2])) b.push({ name: "DEV_PANEL", type: "plain_text", text: "1" });
    return J({ success: true, result: { id: x[2], number: 1, resources: { bindings: b, script: { etag: "e" }, script_runtime: { compatibility_date: "2026-10-01" } } } });
  }
  x = /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/([a-z-]+)\/(deployments|versions)$/.exec(p);
  if (x && x[2] === "versions" && m === "GET") return J({ success: true, result: { items: cf.vers[x[1]] || [] } });
  if (x && x[2] === "deployments" && m === "GET") return J({ success: true, result: { deployments: cf.deps[x[1]] || [] } });
  if (x && x[2] === "deployments" && m === "POST") {
    const body = JSON.parse(init.body), force = url.searchParams.get("force") === "true";
    if (cf.secretsChanged && !force) return J({ success: false, errors: [{ code: 10220, message: "The following secrets have changed: ADVISOR_SECRET, RESEND_API_KEY [code: 10220]" }] }, 400);
    cf.posts.push({ kind: "worker", script: x[1], force, body });
    return J({ success: true, result: { id: "dep-new-0001", created_on: "2026-11-19T12:00:00Z", versions: body.versions } });
  }
  throw new Error("unexpected Cloudflare call " + m + " " + p);
}
const HTML = "<!doctype html><html lang=\"ar\"><head><title>x</title></head><body>ok</body></html>";
function mock() {
  calls = []; cf = cfState(); probe = { page: 200, intel: { ok: true } };
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null, u = String(req ? req.url : input), method = (init && init.method) || (req && req.method) || "GET";
    const h = req ? Object.fromEntries(req.headers) : init.headers || {};
    calls.push({ url: u, method, auth: h.Authorization || h.authorization || "", body: init.body || null });
    if (u.startsWith("https://api.resend.com/")) return J({ id: "re_" + calls.length });
    if (u.startsWith(CF + "/")) return cfAnswer(u, { ...init, method });
    const dp = /^https:\/\/([a-z0-9]{8})\.madeinegyptgate\.pages\.dev\/data\/flags\.js$/.exec(u); // a Pages deployment's own copy of data/flags.js
    if (dp) {
      const id = (cf.pages.find(d => d.short_id === dp[1]) || {}).id || "";
      if (cf.probeDown.has(id)) return new Response("error", { status: 502, headers: { "Content-Type": "text/plain" } });
      return cf.prePanel.has(id) ? new Response(HTML, { status: 404, headers: { "Content-Type": "text/html" } }) : new Response("(function () { var W = window; W.MIGFLAGS = {}; })();", { status: 200, headers: { "Content-Type": "application/javascript" } });
    }
    if (u.startsWith(PAGES + "/")) return new Response(probe.page === 200 ? HTML : "error", { status: probe.page, headers: { "Content-Type": "text/html" } });
    if (u === INTEL + "/api/intel/health") return J(probe.intel);
    if (u === INTEL + "/intel/") return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    if (u === "https://api.anam.ai/v1/auth/session-token") return J({ sessionToken: "anam-tok-1" });
    if (u.startsWith("https://api.anam.ai/v1/personas/")) return J({}, 404);
    if (u.startsWith("https://api.respond.io/v2/contact/")) return J({ messageId: 9001 });
    if (u === "https://api.tavily.com/search") return J({ results: [] });
    throw new Error("unexpected fetch " + method + " " + u);
  };
}
beforeEach(() => {
  realFetch = globalThis.fetch; mock(); logs = []; forgetPanel();
  realLog = console.log; realErr = console.error;
  console.log = (...a) => { logs.push(a.map(String).join(" ")); }; console.error = (...a) => { logs.push(a.map(String).join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realErr; });

const NOW = () => new Date().toISOString();
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
  ADMIN_EMAILS: "owner@mig.test", PLATFORM_KEY: "pk-test-123", CONFIG_SECRET: CFG, WA_DRY_RUN: "0", RESPONDIO_CHANNEL_ID: "580384", MEETINGS_SECRET: "meet-secret-for-tests", ANAM_API_KEY: "anam-test-key-7c1e9d0b42", ...(extra || {}) });
async function member(env, id, email, { role = "user", staff = "", plan = "visitor", phone = "", prefs = "{}", sector = "", products = "", verified = 1 } = {}) {
  const t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at, phone, prefs_json, sector, products, name) VALUES (?, 'Co', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ahmed')")
    .bind(id, email, plan, verified, t, t, role, t, phone, prefs, sector, products).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
const owner = env => member(env, "u-owner", "owner@mig.test");
function mkCtx() { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
async function api(env, method, path, { token, body, headers = {}, ip = "10.7.0.1" } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": "Mozilla/5.0 test", Origin: SITE, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text, headers: res.headers };
}
const audits = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results.map(r => ({ ...r, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));
const cfCalls = () => calls.filter(c => c.url.startsWith(CF + "/"));
const setFeatures = (env, o, token) => api(env, "PUT", D + "/features", { token, body: { features: o } });
const rowOf = (data, key) => data.features.find(f => f.key === key);

describe("developer panel: access (owner only)", () => {
  test("dev.manage ∈ OWNER_ONLY: owner 200; admin / editor / support / X-Platform-Key → 403 owner_only; seo / data → their team page; signed out → 401", async () => {
    assert.ok(PERMS.includes("dev.manage") && OWNER_ONLY.has("dev.manage"));
    assert.ok(ROLE_PERMS.owner.includes("dev.manage"));
    for (const r of ["admin", "editor", "support", "seo", "data", "platform"]) assert.ok(!ROLE_PERMS[r].includes("dev.manage"), r);
    const env = env0(), o = await owner(env);
    const routes = [["GET", D + "/features"], ["PUT", D + "/features", { features: { janna_live: false } }], ["GET", D + "/deploys"], ["POST", D + "/deploys/rollback", { target: "pages", id: "pg000001-aaaa-bbbb-cccc-000000000001", confirm: "ارجع" }],
      ["GET", D + "/health"], ["GET", D + "/audit"]];
    for (const role of ["admin", "editor", "support"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role, role: role === "admin" ? "admin" : "user" });
      for (const [m, p, b] of routes) {
        const x = await api(env, m, p, { token: s.token, body: b });
        assert.deepEqual([x.status, x.data.code, x.data.need], [403, "owner_only", "dev.manage"], `${role} ${m} ${p}`);
      }
    }
    for (const role of ["seo", "data"]) {
      const s = await member(env, "u-" + role, role + "@mig.test", { staff: role });
      const x = await api(env, "GET", D + "/features", { token: s.token });
      assert.deepEqual([x.status, x.data.code], [403, "forbidden"]); assert.ok(x.data.team_page);
    }
    for (const [m, p, b] of routes) {
      const pk = await api(env, m, p, { headers: { "X-Platform-Key": "pk-test-123" }, body: b });
      assert.deepEqual([pk.status, pk.data.code], [403, "owner_only"], "the platform key never reaches the developer panel: " + p);
      assert.equal((await api(env, m, p, { body: b })).status, 401);
    }
    assert.equal(cf.posts.length, 0, "nothing was rolled back by anyone else");
    assert.equal((await audits(env, "dev.features")).length, 0);
    const g = await api(env, "GET", D + "/features", { token: o.token });
    assert.equal(g.status, 200, g.text);
    assert.equal(g.headers.get("Cache-Control"), "no-store"); assert.equal(g.headers.get("Access-Control-Allow-Origin"), SITE);
    const foreign = await api(env, "GET", D + "/features", { token: o.token, headers: { Origin: "https://evil.example" } });
    assert.equal(foreign.headers.get("Access-Control-Allow-Origin"), null, "no CORS for another origin");
    // whoami: the owner sees the section, an admin does not
    const w = await api(env, "GET", "/api/admin/cc/whoami", { token: o.token });
    assert.deepEqual([w.data.features.dev, w.data.features.dev_token], [true, false]); assert.ok(w.data.perms.includes("dev.manage"));
    const a = await api(env, "GET", "/api/admin/cc/whoami", { token: (await member(env, "u-adm2", "adm2@mig.test", { role: "admin" })).token });
    assert.deepEqual([a.data.features.dev, a.data.features.dev_token], [false, false]); assert.ok(!a.data.perms.includes("dev.manage"));
  });
});

describe("features: the registry, PUT, audit, the public JSON", () => {
  test("GET: every registry row with its default; the locked rows say why; the two privacy rules are policy, not switches", async () => {
    const env = env0(), o = await owner(env);
    const r = await api(env, "GET", D + "/features", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.features.map(f => f.key), [...FEATURE_KEYS]);
    for (const k of ["janna_live", "bassem_live", "janna_welcome", "standing_figures", "noise_mode_default", "intel_pages", "registrations", "rfq_autoroute", "bassem_morning", "daily_digest", "whatsapp_send", "bassem_web_search"]) assert.ok(FEATURE_KEYS.includes(k), k);
    for (const f of r.data.features) {
      assert.ok(f.label_ar && f.label_en && f.desc_ar && f.desc_en, f.key);
      assert.ok(["server", "client", "both"].includes(f.scope), f.key);
      assert.equal(f.value, f.default, f.key); assert.equal(f.overridden, false);
      assert.ok(Array.isArray(f.enforced_by) && f.enforced_by.length, f.key);
    }
    assert.equal(rowOf(r.data, "noise_mode_default").default, false);
    const wa = rowOf(r.data, "whatsapp_send"), ws = rowOf(r.data, "bassem_web_search");
    assert.deepEqual([wa.value, wa.effective, wa.locked.code], [true, false, "no_token"]); assert.ok(wa.locked.ar && wa.locked.en);
    assert.deepEqual([ws.effective, ws.locked.code], [false, "no_key"]);
    assert.deepEqual([rowOf(r.data, "janna_live").effective, rowOf(r.data, "janna_live").locked], [true, null]);
    assert.deepEqual(r.data.policies.map(p => [p.key, p.permanent]), [["visitor_links_signed_in", true], ["knowledge_team_approved", true]]);
    assert.equal(r.data.public.path, "/api/settings");
    assert.ok(!/respondio|rio_|tvly|CONFIG_SECRET/.test(r.text));
  });
  test("PUT: switches → one audited row (changed keys only, the reason); the same again = unchanged; null = back to the default; bad input = 422 and nothing written", async () => {
    const env = env0(), o = await owner(env);
    let r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { janna_live: false, noise_mode_default: true, standing_figures: true }, reason: "صيانة الكاميرا <b>" } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.changed.sort(), ["janna_live", "noise_mode_default"], "standing_figures was already on (its default): nothing to change");
    assert.deepEqual([rowOf(r.data, "janna_live").value, rowOf(r.data, "janna_live").overridden, rowOf(r.data, "janna_live").effective, rowOf(r.data, "janna_live").updated_by], [false, true, false, "owner@mig.test"]);
    const row = await env.DB.prepare("SELECT scope, v, updated_by FROM cc_settings WHERE k = 'features'").first();
    assert.equal(row.scope, "system"); assert.equal(row.updated_by, "owner@mig.test");
    assert.deepEqual(JSON.parse(row.v).values, { janna_live: false, noise_mode_default: true }, "a value equal to the default is not pinned");
    let a = await audits(env, "dev.features");
    assert.equal(a.length, 1);
    assert.deepEqual(a[0].before, { janna_live: true, noise_mode_default: false });
    assert.deepEqual([a[0].after.janna_live, a[0].after.noise_mode_default, a[0].actor_role, a[0].target_type], [false, true, "owner", "features"]);
    assert.ok(a[0].summary.includes("janna_live off") && a[0].summary.includes("صيانة الكاميرا"), a[0].summary);
    assert.ok(!a[0].summary.includes("<b>"), "the reason is neutralised");
    // the same again: nothing changes, no audit row
    r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { janna_live: false } } });
    assert.deepEqual([r.status, r.data.unchanged, r.data.changed], [200, true, []]);
    assert.equal((await audits(env, "dev.features")).length, 1);
    // null = back to the default
    r = await api(env, "PUT", D + "/features", { token: o.token, body: { features: { janna_live: null } } });
    assert.deepEqual([r.status, r.data.changed, rowOf(r.data, "janna_live").value, rowOf(r.data, "janna_live").overridden], [200, ["janna_live"], true, false]);
    a = await audits(env, "dev.features"); assert.equal(a.length, 2); assert.deepEqual(a[1].after._defaults, ["janna_live"]);
    // bad input
    for (const [b, code, field] of [[{ features: { nope: true } }, "unknown_feature", "features.nope"], [{ features: { visitor_links_signed_in: false } }, "policy", "features.visitor_links_signed_in"],
      [{ features: { knowledge_team_approved: true } }, "policy", "features.knowledge_team_approved"], [{ features: { janna_live: "off" } }, "not_boolean", "features.janna_live"], [{ features: { janna_live: 0 } }, "not_boolean", "features.janna_live"]]) {
      const x = await api(env, "PUT", D + "/features", { token: o.token, body: b });
      assert.equal(x.status, 422, JSON.stringify(b)); assert.equal(x.data.errors[0].code, code); assert.equal(x.data.errors[0].field, field);
    }
    for (const b of [{}, { features: [] }, { features: "janna_live" }]) assert.deepEqual([(await api(env, "PUT", D + "/features", { token: o.token, body: b })).data.code], ["required"]);
    assert.equal((await audits(env, "dev.features")).length, 2);
  });
  test("locked rows: whatsapp_send can be switched OFF but not ON before a passed respond.io token test; bassem_web_search waits for its keys", async () => {
    let env = env0(), o = await owner(env);
    assert.equal((await setFeatures(env, { whatsapp_send: false }, o.token)).status, 200, "OFF is always allowed");
    let r = await setFeatures(env, { whatsapp_send: true }, o.token);
    assert.deepEqual([r.status, r.data.code, r.data.feature, r.data.locked.code], [409, "feature_locked", "whatsapp_send", "no_token"]);
    r = await setFeatures(env, { whatsapp_send: null }, o.token);
    assert.equal(r.status, 409, "back to the default (on) is switching it on too");
    // a token, but no passed test → still locked
    env = env0({ RESPONDIO_TOKEN: RIO }); o = await owner(env);
    await setFeatures(env, { whatsapp_send: false }, o.token);
    assert.equal((await setFeatures(env, { whatsapp_send: true }, o.token)).data.locked.code, "token_test_required");
    // the token test passed (wa.test_ok_at), switch still off → unlocked; the row waits for the go-live switch in «مفاتيح الخدمات»
    const t = NOW();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.test_ok_at', 'system', ?, ?)").bind(t, t).run();
    await loadServiceKeys(env, { fresh: true });
    r = await setFeatures(env, { whatsapp_send: true }, o.token);
    assert.equal(r.status, 200, r.text);
    const wa = rowOf(r.data, "whatsapp_send");
    assert.deepEqual([wa.value, wa.locked, wa.needs.code, wa.effective], [true, null, "switch_off", false]);
    await waSwitchOn(env);
    assert.equal(rowOf((await api(env, "GET", D + "/features", { token: o.token })).data, "whatsapp_send").effective, true);
    // WA_DRY_RUN = 1 locks it whatever the panel says
    const e2 = env0({ RESPONDIO_TOKEN: RIO, WA_DRY_RUN: "1" }), o2 = await owner(e2);
    assert.equal(rowOf((await api(e2, "GET", D + "/features", { token: o2.token })).data, "whatsapp_send").locked.code, "dry_run_env");
    // web search: a key + the tool secret → unlocked and effective (Tavily from the key's shape)
    const e3 = env0({ TOOL_SECRET: TOOL, WEBSEARCH_KEY: TAVILY }), o3 = await owner(e3);
    const ws = rowOf((await api(e3, "GET", D + "/features", { token: o3.token })).data, "bassem_web_search");
    assert.deepEqual([ws.locked, ws.needs, ws.effective], [null, null, true]);
    const e4 = env0({ WEBSEARCH_KEY: TAVILY }), o4 = await owner(e4);
    assert.equal(rowOf((await api(e4, "GET", D + "/features", { token: o4.token })).data, "bassem_web_search").locked.code, "no_tool_secret");
  });
  test("public GET /api/settings → features: client / both rows only, effective values, features_v; no server row, no lock or key state", async () => {
    const env = env0(), o = await owner(env);
    let p = await api(env, "GET", "/api/settings");
    assert.equal(p.status, 200);
    const pub = FEATURES.filter(f => f.scope !== "server").map(f => f.key);
    assert.deepEqual(Object.keys(p.data.features).sort(), [...pub].sort());
    assert.deepEqual(p.data.features, Object.fromEntries(pub.map(k => [k, FEATURES.find(f => f.key === k).default])));
    assert.equal(p.data.features_v, "");
    assert.ok(p.data.settings && p.data.settings.contact_email, "the settings stay as they were");
    for (const k of ["rfq_autoroute", "whatsapp_send", "bassem_web_search", "daily_digest", "bassem_morning"]) assert.ok(!p.text.includes(k), k);
    await setFeatures(env, { janna_live: false, intel_pages: false, rfq_autoroute: false }, o.token);
    p = await api(env, "GET", "/api/settings");
    assert.deepEqual([p.data.features.janna_live, p.data.features.intel_pages, p.data.features.bassem_live], [false, false, true]);
    const row = await env.DB.prepare("SELECT updated_at FROM cc_settings WHERE k = 'features'").first();
    assert.equal(p.data.features_v, row.updated_at);
    assert.ok(!p.text.includes("rfq_autoroute") && !p.text.includes("owner@mig.test"), "server rows and who changed it stay private");
    assert.equal(p.headers.get("Cache-Control"), "public, max-age=60");
  });
  test("call_languages (the 🌐 speaking-language button, any-language calls 2026-11-20): a client switch, on by default, public, the owner can switch it off", async () => {
    assert.ok(FEATURE_KEYS.includes("call_languages"));
    assert.equal(FEATURE_KEYS.indexOf("call_languages"), FEATURE_KEYS.indexOf("noise_mode_default") + 1, "next to the other call switch");
    const env = env0(), o = await owner(env);
    const row = rowOf((await api(env, "GET", D + "/features", { token: o.token })).data, "call_languages");
    assert.deepEqual([row.default, row.scope, row.value, row.effective, row.locked], [true, "client", true, true, null]);
    assert.ok(row.label_ar.includes("🌐") && row.label_en.includes("🌐") && row.desc_ar && row.desc_en); assert.deepEqual(row.enforced_by, ["site"]);
    assert.equal((await api(env, "GET", "/api/settings")).data.features.call_languages, true);
    assert.equal((await setFeatures(env, { call_languages: false }, o.token)).status, 200);
    assert.equal((await api(env, "GET", "/api/settings")).data.features.call_languages, false, "the site hides the button and calls hear as before");
    /* the site's own default (data/flags.js, read before /api/settings answers) is on as well */
    const flags = readFileSync(new URL("../../data/flags.js", import.meta.url), "utf8");
    assert.match(flags, /DEF\.call_languages = true;/);
  });
  test("the setting name is reserved: an admin cannot pre-create «features» / dev.* / cloudflare.* as custom settings; a stray custom row is taken over by the owner's write", async () => {
    const env = env0(), o = await owner(env);
    for (const k of ["features", "dev.flags", "cloudflare.dev_token"]) {
      const r = await api(env, "PUT", "/api/admin/cc/settings", { token: o.token, body: { custom: [{ k, v: '{"janna_live":false}' }] } });
      assert.equal(r.status, 422, k);
    }
    // a custom row of that name (created before the name was reserved) never counts, and the owner's write takes it over
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'custom', '{\"janna_live\":false}', ?)").bind(NOW()).run();
    forgetFeatures(env);
    assert.equal(await featureOn(env, "janna_live"), true, "scope custom is ignored");
    const r = await setFeatures(env, { bassem_live: false }, o.token);
    assert.equal(r.status, 200, r.text);
    const row = await env.DB.prepare("SELECT scope, v FROM cc_settings WHERE k = 'features'").first();
    assert.equal(row.scope, "system"); assert.deepEqual(JSON.parse(row.v).values, { bassem_live: false });
  });
  test("flags.js reader: tolerant parsing, the defaults before a load / without tables / on a read error, the last good view on an error", async () => {
    assert.deepEqual(parseStore('{"janna_live":false,"nope":true,"bassem_live":"x"}').values, { janna_live: false });
    assert.deepEqual(parseStore('{"v":1,"values":{"daily_digest":false},"changed":{"daily_digest":{"at":"t","by":"b"}}}'), { values: { daily_digest: false }, changed: { daily_digest: { at: "t", by: "b" } } });
    for (const bad of ["", "null", "[]", "{", "7"]) assert.deepEqual(parseStore(bad), { values: {}, changed: {} });
    assert.deepEqual(parseStore(storeJson({ janna_live: false, x: true }, {})).values, { janna_live: false });
    assert.equal(valueOf({ values: {} }, "noise_mode_default"), false); assert.equal(valueOf({ values: {} }, "unknown"), false);
    const env = env0();
    assert.equal(featureSync(env, "janna_live"), true, "before the first load: the default");
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?)").bind(storeJson({ janna_live: false }, {}), NOW()).run();
    assert.equal(await featureOn(env, "janna_live"), false);
    assert.equal(featureSync(env, "janna_live"), false, "the sync view after a load");
    // a read error keeps the last good view
    const prep = env.DB.prepare.bind(env.DB);
    env.DB.prepare = () => { throw new Error("D1 down"); };
    assert.equal(await featureOn(env, "janna_live", { fresh: true }), false);
    env.DB.prepare = prep;
    // no 0006 tables → the defaults; no database → the defaults
    const bare = { DB: { prepare() { throw new Error("no such table: cc_settings"); } } };
    assert.equal(await featureOn(bare, "janna_live"), true); assert.equal(await featureOn({}, "noise_mode_default"), false);
    assert.equal((await loadFeatures({ DB: { prepare() { throw new Error("D1 down"); } } })).loaded, false);
  });
});

describe("features: enforced in the real handlers", () => {
  test("janna_live / bassem_live off → POST /api/janna/session answers 503 feature_off before any Anam call; the other persona is not touched", async () => {
    const env = env0(), o = await owner(env);
    const sess = (agent, ff = 1) => api(env, "POST", "/api/janna/session", { body: { agent, lang: "ar", ...(ff ? { ff } : {}) } });
    let r = await sess("janna");
    assert.equal(r.status, 200, r.text);
    await setFeatures(env, { janna_live: false }, o.token);
    const before = calls.length;
    r = await sess("janna");
    assert.deepEqual([r.status, r.data.error, r.data.code, r.data.feature], [503, "feature_off", "feature_off", "janna_live"]); assert.ok(r.data.message);
    // a page built before the switches (no ff): code daily_cap — the refusal it shows WITHOUT falling back to Anam's public widget
    r = await sess("janna", 0);
    assert.deepEqual([r.status, r.data.error, r.data.code, r.data.feature], [503, "feature_off", "daily_cap", "janna_live"]);
    assert.equal(calls.filter((c, i) => i >= before && c.url.includes("anam.ai")).length, 0, "no Anam call");
    r = await sess("bassem");
    assert.notEqual(r.data.error, "feature_off", "Bassem's own switch is on");
    await setFeatures(env, { bassem_live: false, janna_live: true }, o.token);
    assert.deepEqual([(await sess("bassem")).data.feature, (await sess("janna")).status], ["bassem_live", 200]);
  });
  test("registrations off → a NEW e-mail gets 503 feature_off after its right code (nothing created, the code still valid); members sign in; signup applications refused", async () => {
    const env = env0(), o = await owner(env);
    const code = async email => { const c = String(100000 + Math.floor(Math.random() * 899999)), t = Date.now();
      await env.DB.prepare("INSERT INTO auth_codes (email_key, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(emailKey(email), email, await sha256(secretOf(env) + "|code|" + email + "|" + c), new Date(t).toISOString(), new Date(t + 600000).toISOString()).run(); return c; };
    await setFeatures(env, { registrations: false }, o.token);
    const c1 = await code("new@buyer.test");
    assert.equal((await api(env, "POST", "/api/auth/verify", { body: { email: "new@buyer.test", code: "000000" } })).status, 401, "a wrong code is still a wrong code");
    let r = await api(env, "POST", "/api/auth/verify", { body: { email: "new@buyer.test", code: c1 } });
    assert.deepEqual([r.status, r.data.error, r.data.feature], [503, "feature_off", "registrations"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE email = 'new@buyer.test'").first("n"), 0);
    assert.equal(await env.DB.prepare("SELECT used_at FROM auth_codes WHERE email = 'new@buyer.test'").first("used_at"), "");
    await member(env, "u-old", "old@fac.test");
    r = await api(env, "POST", "/api/auth/verify", { body: { email: "old@fac.test", code: await code("old@fac.test") } });
    assert.equal(r.status, 200, r.text); assert.ok(r.data.token);
    const signup = { kind: "signup", name: "Mona Factory", company: "Mona Co", email: "mona@fac.test", phone: "01001234567", target_id: "basic", payload: { plan: "basic" } };
    r = await api(env, "POST", "/api/inquiries", { body: signup, ip: "10.9.0.1" });
    assert.deepEqual([r.status, r.data.error, r.data.feature], [503, "feature_off", "registrations"]);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries").first("n"), 0);
    await setFeatures(env, { registrations: true }, o.token);
    r = await api(env, "POST", "/api/auth/verify", { body: { email: "new@buyer.test", code: c1 } });
    assert.equal(r.status, 200, "the same code works once registrations are back: " + r.text);
    assert.equal((await api(env, "POST", "/api/inquiries", { body: signup, ip: "10.9.0.2" })).status, 201);
  });
  test("rfq_autoroute off → a matching RFQ goes to the team (in_progress, no route, honest texts); cron and re-match stay off; back on → it routes", async () => {
    const env = env0(), o = await owner(env);
    const f = await member(env, "u-fac", "plast@fac.test", { plan: "basic", sector: "الصناعات البلاستيكية", products: "براميل بلاستيك" });
    const RFQ = m => ({ kind: "rfq", name: "Ahmed Buyer", company: "Buyer Co", email: "buyer@buyer.test", phone: "+20 100 123 4567", message: m, payload: { product: "براميل بلاستيك", sector: "الصناعات البلاستيكية", governorate: "الجيزة", quantity: "500" } });
    await setFeatures(env, { rfq_autoroute: false }, o.token);
    let r = await api(env, "POST", "/api/inquiries", { body: RFQ("محتاجين براميل بلاستيكية سعة 220 لتر"), ip: "10.9.1.1" });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual([r.data.status, r.data.routed], ["in_progress", 0]);
    const inq = await env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(r.data.ref).first();
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes WHERE inquiry_id = ?").bind(inq.id).first("n"), 0, "nothing sent to the factory");
    const evs = (await env.DB.prepare("SELECT type, body, meta_json FROM inquiry_events WHERE inquiry_id = ? ORDER BY id").bind(inq.id).all()).results;
    const held = evs.find(e => e.type === "in_progress");
    assert.ok(held && JSON.parse(held.meta_json).held === "rfq_autoroute_off" && held.body.includes("فريق المنصة"), JSON.stringify(evs));
    const mails = calls.filter(c => c.url.startsWith("https://api.resend.com/")).map(c => JSON.parse(c.body));
    const teamMail = mails.find(m => /مطلوب رد الإدارة/.test(m.subject));
    assert.ok(teamMail && teamMail.subject.includes("التوزيع التلقائي مقفول"), mails.map(m => m.subject).join(" | "));
    const receipt = mails.find(m => /تم الاستلام/.test(m.subject));
    assert.ok(receipt && !receipt.text.includes("المنصة ما فيهاش موظف") && receipt.text.includes("فريق المنصة"), receipt && receipt.text);
    // the cron's automatic re-delivery and the re-match when a member joins stay off too
    assert.deepEqual(await rematchForMember(env, f.m.id), { sent: 0, skipped: "feature_off" });
    const cron = await platformCron(env, Date.now());
    assert.equal(cron.inquiries.routing, "feature_off", JSON.stringify(cron.inquiries));
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiry_routes").first("n"), 0);
    // back on: the next request is routed automatically
    await setFeatures(env, { rfq_autoroute: true }, o.token);
    r = await api(env, "POST", "/api/inquiries", { body: RFQ("مطلوب 300 برميل بلاستيك أزرق"), ip: "10.9.1.2" });
    assert.deepEqual([r.status, r.data.status, r.data.routed], [201, "routed", 1], r.text);
  });
  test("daily_digest / bassem_morning off → the cron skips them (the item sync and housekeeping still run); back on → they go out", async () => {
    const env = env0(), o = await owner(env);
    const day = cairoDay(), at10 = Date.parse(dayStartIso(day)) + 10 * 3600000;
    await setFeatures(env, { daily_digest: false, bassem_morning: false }, o.token);
    const d = await dailyJobs(env, at10);
    assert.deepEqual([d.ran, d.skipped, d.digests, d.reminders], [true, "feature_off", 0, 0]);
    assert.ok(d.synced != null, "the seen-items sync still ran");
    await member(env, "u-partner", "partner@fac.test", { plan: "partner", phone: "" });
    let b = await bassemCron(env, at10);
    assert.deepEqual([b.morning_skipped, b.email_morning, b.morning], ["feature_off", 0, 0]);
    assert.equal(calls.filter(c => c.url.startsWith("https://api.resend.com/") && JSON.parse(c.body).subject.includes("باسم")).length, 0);
    await setFeatures(env, { bassem_morning: true }, o.token);
    b = await bassemCron(env, at10);
    assert.equal(b.email_morning, 1, JSON.stringify(b)); assert.equal(b.morning_skipped, undefined);
  });
  test("whatsapp_send off → waLive false (reason feature_off) and every send is a dry run; on again → the send goes out", async () => {
    const env = env0({ RESPONDIO_TOKEN: RIO }), o = await owner(env);
    await waSwitchOn(env);
    assert.equal(waLive(env), true);
    await setFeatures(env, { whatsapp_send: false }, o.token);
    assert.deepEqual([waLive(env), waDryReason(env)], [false, "feature_off"]);
    const before = calls.length;
    assert.deepEqual(await sendWA(env, "01001234567", { text: "hello" }), { sent: false, error: "dry run" });
    assert.equal(calls.slice(before).filter(c => c.url.includes("respond.io")).length, 0);
    const keys = await api(env, "GET", K, { token: o.token });
    assert.deepEqual([keys.data.wa.live, keys.data.wa.reason], [false, "feature_off"], "«مفاتيح الخدمات» says why");
    // switched off in another isolate (memo still on here): the fresh read right before the provider call stops it
    await setFeatures(env, { whatsapp_send: true }, o.token);
    assert.equal(waLive(env), true);
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = 'features'").bind(storeJson({ whatsapp_send: false }, {})).run();
    assert.deepEqual(await sendWA(env, "01001234567", { text: "hello" }), { sent: false, error: "dry run" });
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = 'features'").bind(storeJson({}, {})).run();
    forgetFeatures(env); await loadFeatures(env);
    assert.equal((await sendWA(env, "01001234567", { text: "hello" })).sent, true);
  });
  test("bassem_web_search off → POST /api/advisor/web answers 503 feature_off (after the tool secret check) without calling the provider", async () => {
    const env = env0({ TOOL_SECRET: TOOL, WEBSEARCH_KEY: TAVILY }), o = await owner(env);
    const web = h => api(env, "POST", "/api/advisor/web", { body: { query: "مصانع بلاستيك في السعودية" }, headers: h });
    await setFeatures(env, { bassem_web_search: false }, o.token);
    assert.equal((await web({ "X-MIG-Tool": "wrong-secret-xxxxxxxxxxxxxxxx" })).status, 401, "no secret → no answer about the switch");
    const r = await web({ "X-MIG-Tool": TOOL });
    assert.deepEqual([r.status, r.data.error, r.data.feature, r.data.count], [503, "feature_off", "bassem_web_search", 0]); assert.ok(r.data.text);
    assert.equal(calls.filter(c => c.url.includes("tavily")).length, 0);
    await setFeatures(env, { bassem_web_search: true }, o.token);
    assert.notEqual((await web({ "X-MIG-Tool": TOOL })).data.error, "feature_off");
  });
});

describe("«مفاتيح الخدمات» → cloudflare.dev_token (owner only, write-only, no tail)", () => {
  test("PUT seals it (no tail kept or answered); GET /keys shows «متسجّل» only; the test makes read-only Cloudflare calls; DELETE; never a value anywhere", async () => {
    const env = env0(), o = await owner(env);
    let r = await api(env, "PUT", K + "/" + CF_SLOT, { token: o.token, body: { value: "  Bearer " + TOKEN + " " } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.item, { set: true, set_at: r.data.item.set_at, set_by: "owner@mig.test", readable: true });
    assert.ok(!("tail" in r.data.item));
    const row = await env.DB.prepare("SELECT * FROM cc_secrets WHERE name = ?").bind(CF_SLOT).first();
    assert.equal(row.tail, ""); assert.ok(!row.sealed.includes(TOKEN));
    assert.equal(await getSecret(env, CF_SLOT), TOKEN);
    const g = await api(env, "GET", K, { token: o.token });
    assert.deepEqual(Object.keys(g.data.slots).sort(), ["anam.api_key", "respondio.channel", "respondio.token"], "the other blocks stay as they were");
    const c = g.data.cloudflare;
    assert.deepEqual([c.token.set, c.token.readable, c.token.effective, c.token.env_name, c.token.testable, c.account_id], [true, true, "panel", "CF_DEV_TOKEN", true, ACCOUNT_ID]);
    assert.ok(!("tail" in c.token)); assert.ok(c.permissions_ar.includes("Cloudflare Pages") && c.permissions_en.includes("Workers Scripts"));
    assert.equal((await api(env, "GET", "/api/admin/cc/whoami", { token: o.token })).data.features.dev_token, true);
    // the test: verify + Pages project + janna-lookup deployments, all GET, with the saved token
    r = await api(env, "POST", K + "/" + CF_SLOT + "/test", { token: o.token, body: {} });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.ok, r.data.source, r.data.checks], [true, "panel", { token: true, pages: true, workers: true }]);
    assert.ok(cfCalls().length >= 3 && cfCalls().every(x => x.method === "GET" && x.auth === "Bearer " + TOKEN));
    cf.fail = { [`/pages/projects/${PAGES_PROJECT}`]: 403 };
    r = await api(env, "POST", K + "/" + CF_SLOT + "/test", { token: o.token, body: {} });
    assert.deepEqual([r.data.ok, r.data.checks.pages, r.data.checks.workers], [false, false, true]);
    cf.fail = {}; cf.verify = "disabled";
    assert.equal((await api(env, "POST", K + "/" + CF_SLOT + "/test", { token: o.token, body: {} })).data.checks.token, false);
    const t = await audits(env, "keys.test");
    assert.equal(t.length, 3); assert.ok(t.every(x => x.target_id === CF_SLOT));
    // admins never reach it
    const adm = await member(env, "u-adm", "adm@mig.test", { role: "admin" });
    assert.deepEqual([(await api(env, "PUT", K + "/" + CF_SLOT, { token: adm.token, body: { value: TOKEN } })).data.code], ["owner_only"]);
    // delete
    r = await api(env, "DELETE", K + "/" + CF_SLOT, { token: o.token });
    assert.deepEqual([r.status, r.data.item.set], [200, false]);
    assert.equal(await getSecret(env, CF_SLOT), "");
    const all = (await env.DB.prepare("SELECT * FROM cc_audit").all()).results;
    assert.ok(all.length >= 5 && !JSON.stringify(all).includes(TOKEN), "the token is in no audit row");
    assert.ok(!logs.some(l => l.includes(TOKEN)), "nor in any log line");
    // the Worker secret wins
    const e2 = env0({ CF_DEV_TOKEN: TOKEN }), o2 = await owner(e2);
    assert.equal((await api(e2, "GET", K, { token: o2.token })).data.cloudflare.token.effective, "env");
  });
});

describe("deploys: the Cloudflare lists and the one-click rollback", () => {
  const withToken = async extra => { cf = cfState(); const env = env0(extra), o = await owner(env); await api(env, "PUT", K + "/" + CF_SLOT, { token: o.token, body: { value: TOKEN } }); calls.length = 0; return { env, o }; };
  test("no token → ready:false, reason no_token, no Cloudflare call; with the token → Pages (production, newest first, current / can_rollback) + the two Workers", async () => {
    let env = env0(), o = await owner(env);
    let r = await api(env, "GET", D + "/deploys", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.ready, r.data.reason, r.data.pages, r.data.workers, r.data.token.set, r.data.account_id, r.data.confirm_word], [false, "no_token", null, [], false, ACCOUNT_ID, "ارجع"]);
    assert.equal(cfCalls().length, 0);
    ({ env, o } = await withToken());
    r = await api(env, "GET", D + "/deploys?limit=10", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.ready, r.data.token, r.data.pages.ok, r.data.pages.current_id], [true, { set: true, source: "panel", readable: true }, true, "pg000003-aaaa-bbbb-cccc-000000000003"]);
    assert.deepEqual(r.data.pages.items.map(x => [x.short_id, x.environment, x.status, x.is_current, x.can_rollback]), [
      ["pg000004", "preview", "success", false, false], ["pg000003", "production", "success", true, false], ["pg000002", "production", "failure", false, false], ["pg000001", "production", "success", false, true]]);
    assert.deepEqual([r.data.pages.items[1].branch, r.data.pages.items[1].commit_hash, r.data.pages.items[1].url], ["main", "abc123def456", "https://pg000003.madeinegyptgate.pages.dev"]);
    const jl = r.data.workers.find(w => w.script === "janna-lookup"), mi = r.data.workers.find(w => w.script === "migate-intel");
    assert.deepEqual([jl.ok, jl.current.version_id, jl.current.deployment_id, jl.current.message], [true, "wv000002-aaaa-bbbb-cccc-000000000002", "dep-jl-2", "deploy 42"]);
    assert.deepEqual(jl.items.map(x => [x.number, x.is_current, x.can_rollback, x.message]), [[42, true, false, "current"], [41, false, true, "older"]]);
    assert.deepEqual(mi.items.map(x => [x.number, x.is_current]), [[7, true], [6, false]]);
    assert.ok(cfCalls().every(c => c.method === "GET" && c.auth === "Bearer " + TOKEN));
    assert.ok(!r.text.includes(TOKEN));
    // one failing block: its own error (scrubbed of the token), the others still answer
    cf.fail = { "/workers/scripts/migate-intel/versions": 403 }; cf.echoToken = true;
    r = await api(env, "GET", D + "/deploys", { token: o.token });
    const bad = r.data.workers.find(w => w.script === "migate-intel");
    assert.deepEqual([r.status, r.data.pages.ok, bad.ok, bad.error.status], [200, true, false, 403]);
    assert.ok(bad.error.message.includes("•••") && !r.text.includes(TOKEN), bad.error.message);
  });
  test("rollback guards: the typed «ارجع», target / id shape, no token, an id not listed, the version in force, a preview — nothing is sent", async () => {
    let { env, o } = await withToken();
    const rb = b => api(env, "POST", D + "/deploys/rollback", { token: o.token, body: b });
    const OLD = "pg000001-aaaa-bbbb-cccc-000000000001";
    for (const confirm of [undefined, "", "ارجع يا ريس", "rollback", "ار جع", ["ارجع"], { 0: "ارجع" }, 1]) assert.deepEqual([(await rb({ target: "pages", id: OLD, confirm })).data.code], ["confirm_required"], JSON.stringify(confirm));
    assert.equal((await rb({ target: "pages", id: OLD, confirm: " ارجع " })).status, 200, "surrounding blanks are trimmed");
    ({ env, o } = await withToken());
    let r = await rb({ target: "prod", id: OLD, confirm: "ارجع" });
    assert.deepEqual([r.status, r.data.errors[0].code], [422, "invalid_target"]);
    r = await rb({ target: "pages", id: "../../x", confirm: "ارجع" });
    assert.deepEqual([r.status, r.data.errors[0].code], [422, "invalid_id"]);
    assert.equal((await rb({ target: "pages", id: OLD, confirm: "ارجع", force: "yes" })).data.errors[0].code, "invalid_force");
    assert.deepEqual([(await rb({ target: "pages", id: "pg999999-aaaa-bbbb-cccc-999999999999", confirm: "ارجع" })).data.code], ["not_found"]);
    assert.deepEqual([(await rb({ target: "pages", id: "pg000003-aaaa-bbbb-cccc-000000000003", confirm: "ارجع" })).data.code], ["already_current"]);
    assert.deepEqual([(await rb({ target: "pages", id: "pg000004-aaaa-bbbb-cccc-000000000004", confirm: "ارجع" })).data.code], ["not_production"]);
    assert.equal(cf.posts.length, 0);
    const noTok = env0(), o2 = await owner(noTok);
    r = await api(noTok, "POST", D + "/deploys/rollback", { token: o2.token, body: { target: "pages", id: OLD, confirm: "ارجع" } });
    assert.deepEqual([r.status, r.data.code, r.data.slot], [409, "no_token", CF_SLOT]);
    assert.equal((await audits(env, "dev.rollback")).length, 0, "no audit row for a refused rollback");
  });
  test("Pages rollback → POST …/deployments/{id}/rollback, audited (sending → ok, the deployment it replaced)", async () => {
    const { env, o } = await withToken();
    const r = await api(env, "POST", D + "/deploys/rollback", { token: o.token, body: { target: "pages", id: "pg000001-aaaa-bbbb-cccc-000000000001", confirm: "ارجع", reason: "الصفحة الرئيسية باظت" } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.ok, r.data.target, r.data.previous_id, r.data.result.id], [true, "pages", "pg000003-aaaa-bbbb-cccc-000000000003", "pg-new-rollback-0001"]);
    assert.ok(r.data.note_ar && r.data.note_en);
    assert.deepEqual(cf.posts.map(p => [p.kind, p.id]), [["pages", "pg000001-aaaa-bbbb-cccc-000000000001"]]);
    const post = cfCalls().find(c => c.method === "POST");
    assert.equal(post.url, `${CF}${ACC}/pages/projects/${PAGES_PROJECT}/deployments/pg000001-aaaa-bbbb-cccc-000000000001/rollback`);
    assert.equal(post.auth, "Bearer " + TOKEN);
    const a = await audits(env, "dev.rollback");
    assert.equal(a.length, 1);
    assert.deepEqual([a[0].target_type, a[0].target_id, a[0].after.status, a[0].after.previous_id, a[0].after.result_id, a[0].after.reason, a[0].before.in_force], ["deploy", "pages:pg000001-aaaa-bbbb-cccc-000000000001", "ok", "pg000003-aaaa-bbbb-cccc-000000000003", "pg-new-rollback-0001", "الصفحة الرئيسية باظت", "pg000003-aaaa-bbbb-cccc-000000000003"]);
    assert.ok(a[0].summary.includes("done"));
  });
  test("Worker rollback → POST …/scripts/{s}/deployments {strategy, 100 %, message}; secrets changed since → 409 with the names and an ack; force only with that ack", async () => {
    const { env, o } = await withToken();
    cf.secretsChanged = true;
    const body = { target: "janna-lookup", id: "wv000001-aaaa-bbbb-cccc-000000000001", confirm: "ارجع", reason: "bug" };
    const rb = b => api(env, "POST", D + "/deploys/rollback", { token: o.token, body: b });
    // force on the FIRST request (no second confirmation behind it) is refused before anything is sent
    let r = await rb({ ...body, force: true });
    assert.deepEqual([r.status, r.data.code], [409, "ack_required"]);
    r = await rb(body);
    assert.deepEqual([r.status, r.data.code, r.data.secrets, r.data.force_allowed, typeof r.data.ack, r.data.ack_ttl_s], [409, "secrets_changed", ["ADVISOR_SECRET", "RESEND_API_KEY"], true, "string", 600]);
    assert.equal(cf.posts.length, 0);
    const ack = r.data.ack;
    // a forged / altered / foreign ack: «start again», nothing sent
    for (const bad of [ack.slice(0, -2) + (ack.slice(-2) === "AA" ? "BB" : "AA"), "x".repeat(30) + "." + "y".repeat(43), ack.split(".")[0] + "." + ack.split(".")[0].slice(0, 43)]) assert.equal((await rb({ ...body, force: true, ack: bad })).data.code, "confirm_expired");
    assert.equal((await rb({ ...body, id: "wv000002-aaaa-bbbb-cccc-000000000002", force: true, ack })).data.code, "confirm_expired", "bound to the id");
    assert.equal((await rb({ ...body, target: "migate-intel", force: true, ack })).data.code, "confirm_expired", "bound to the target");
    const admin = await member(env, "u-adm2", "adm2@mig.test", { staff: "admin", role: "admin" });
    assert.equal((await api(env, "POST", D + "/deploys/rollback", { token: admin.token, body: { ...body, force: true, ack } })).status, 403, "and to the owner");
    assert.equal((await rb({ ...body, force: true, ack: ["x"] })).data.errors[0].code, "invalid_ack");
    assert.equal(cf.posts.length, 0);
    // expired after 10 minutes
    const realNow = Date.now;
    try { Date.now = () => realNow() + 11 * 60e3; assert.equal((await rb({ ...body, force: true, ack })).data.code, "confirm_expired"); } finally { Date.now = realNow; }
    r = await rb({ ...body, force: true, ack });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.previous_id, r.data.result.id], ["wv000002-aaaa-bbbb-cccc-000000000002", "dep-new-0001"]);
    assert.deepEqual(cf.posts, [{ kind: "worker", script: "janna-lookup", force: true, body: { strategy: "percentage", versions: [{ version_id: "wv000001-aaaa-bbbb-cccc-000000000001", percentage: 100 }], annotations: { "workers/message": "Control Center rollback by owner@mig.test: bug" } } }]);
    const a = await audits(env, "dev.rollback");
    assert.deepEqual(a.map(x => [x.after.status, x.after.code || 0, !!x.after.force]), [["failed", 10220, false], ["ok", 0, true]]);
    assert.ok(!JSON.stringify(a).includes(ack.split(".")[1]), "the ack is not kept in the audit");
    // migate-intel too
    cf.secretsChanged = false;
    r = await api(env, "POST", D + "/deploys/rollback", { token: o.token, body: { target: "migate-intel", id: "iv000000-aaaa-bbbb-cccc-000000000000", confirm: "ارجع" } });
    assert.equal(r.status, 200, r.text); assert.equal(cf.posts[1].script, "migate-intel");
  });
  test("Cloudflare refuses → 502 upstream (recorded in the audit); 3 rollbacks per hour per owner → 429", async () => {
    const { env, o } = await withToken();
    const rb = (id, target = "janna-lookup") => api(env, "POST", D + "/deploys/rollback", { token: o.token, body: { target, id, confirm: "ارجع" } });
    cf.refusePost = true;
    let r = await rb("wv000001-aaaa-bbbb-cccc-000000000001");
    assert.deepEqual([r.status, r.data.code, r.data.upstream_status, r.data.upstream_error, r.data.upstream_code], [502, "upstream", 403, "Authentication error", 10000]);
    const a = await audits(env, "dev.rollback");
    assert.deepEqual([a.length, a[0].after.status, a[0].after.upstream_status, a[0].after.error], [1, "failed", 403, "Authentication error"]);
    assert.ok(a[0].summary.includes("failed"));
    cf.refusePost = false;
    assert.equal((await rb("wv000001-aaaa-bbbb-cccc-000000000001")).status, 200);
    assert.equal((await rb("pg000001-aaaa-bbbb-cccc-000000000001", "pages")).status, 200);
    r = await rb("iv000000-aaaa-bbbb-cccc-000000000000", "migate-intel");
    assert.deepEqual([r.status, r.data.code, r.data.limit_hour, r.data.limit_day], [429, "rate_limited", 3, 10]);
    assert.equal(cf.posts.length, 2, "the refused call and the limited one sent nothing more");
  });
  test("the panel marker: the lists say which candidates predate the developer panel (Pages: no /data/flags.js · janna-lookup: no DEV_PANEL binding); migate-intel is not asked", async () => {
    const { env, o } = await withToken();
    cf.prePanel = new Set(["pg000001-aaaa-bbbb-cccc-000000000001", "wv000001-aaaa-bbbb-cccc-000000000001"]);
    let r = await api(env, "GET", D + "/deploys", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.pages.items.map(x => [x.short_id, x.can_rollback, x.panel]), [["pg000004", false, undefined], ["pg000003", false, undefined], ["pg000002", false, undefined], ["pg000001", true, false]]);
    const jl = r.data.workers.find(w => w.script === "janna-lookup"), mi = r.data.workers.find(w => w.script === "migate-intel");
    assert.deepEqual(jl.items.map(x => [x.number, x.panel]), [[42, undefined], [41, false]]);
    assert.deepEqual(mi.items.map(x => x.panel), [undefined, undefined]);
    assert.equal(cfCalls().filter(c => /\/versions\/iv/.test(c.url)).length, 0, "migate-intel versions are not inspected");
    // a version WITH the marker; the answers are kept (deployments and versions never change)
    forgetPanel(); cf.prePanel = new Set();
    const n0 = calls.length;
    r = await api(env, "GET", D + "/deploys", { token: o.token });
    assert.deepEqual([r.data.pages.items[3].panel, r.data.workers[0].items[1].panel], [true, true]);
    const n1 = calls.length - n0;
    await api(env, "GET", D + "/deploys", { token: o.token });
    assert.ok(calls.length - n0 - n1 < n1, "the marker is not asked again");
    assert.ok(calls.filter(c => c.url.includes(".madeinegyptgate.pages.dev/")).every(c => c.method === "GET" && !c.auth), "the Pages probe is a plain GET without the token");
    // the check cannot be made → null (treated like «older»)
    forgetPanel(); cf.probeDown = new Set(["pg000001-aaaa-bbbb-cccc-000000000001", "wv000001-aaaa-bbbb-cccc-000000000001"]);
    r = await api(env, "GET", D + "/deploys", { token: o.token });
    assert.deepEqual([r.data.pages.items[3].panel, r.data.workers[0].items[1].panel], [null, null]);
    assert.ok(!r.text.includes(TOKEN));
  });
  test("a rollback to a build / version OLDER than the panel → 409 pre_panel (what stops applying + an ack), nothing sent; confirmed again with that ack → done and audited as such", async () => {
    const { env, o } = await withToken();
    cf.prePanel = new Set(["pg000001-aaaa-bbbb-cccc-000000000001", "wv000001-aaaa-bbbb-cccc-000000000001"]);
    await setFeatures(env, { janna_welcome: false, registrations: false, daily_digest: false }, o.token);
    const rb = b => api(env, "POST", D + "/deploys/rollback", { token: o.token, body: b });
    // Pages: the switches the pages would stop applying (client / both), not the server-only ones
    const pg = { target: "pages", id: "pg000001-aaaa-bbbb-cccc-000000000001", confirm: "ارجع" };
    let r = await rb(pg);
    assert.deepEqual([r.status, r.data.code, r.data.panel, typeof r.data.ack], [409, "pre_panel", false, "string"]);
    assert.deepEqual(r.data.changed_features.map(f => [f.key, f.value]), [["janna_welcome", false], ["registrations", false]]);
    assert.ok(/لوحة المطوّر/.test(r.data.error) || /developer panel/.test(r.text));
    assert.equal(cf.posts.length, 0); assert.equal((await audits(env, "dev.rollback")).length, 0, "nothing audited: nothing was sent");
    const pgAck = r.data.ack;
    assert.equal((await rb({ ...pg, id: "pg000002-aaaa-bbbb-cccc-000000000002", ack: pgAck })).data.code, "confirm_expired");
    r = await rb({ ...pg, ack: pgAck });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.pre_panel, cf.posts.map(p => p.id)], [true, ["pg000001-aaaa-bbbb-cccc-000000000001"]]);
    let a = await audits(env, "dev.rollback");
    assert.deepEqual([a.length, a[0].after.status, a[0].after.pre_panel], [1, "ok", true]); assert.ok(a[0].summary.includes("older than the developer panel"));
    // janna-lookup: every changed switch (a server version without them knows none); then «secrets changed» too → its own ack, then force
    cf.secretsChanged = true;
    const jl = { target: "janna-lookup", id: "wv000001-aaaa-bbbb-cccc-000000000001", confirm: "ارجع" };
    r = await rb(jl);
    assert.deepEqual([r.status, r.data.code], [409, "pre_panel"]);
    assert.deepEqual(r.data.changed_features.map(f => f.key), ["janna_welcome", "registrations", "daily_digest"]);
    r = await rb({ ...jl, ack: r.data.ack });
    assert.deepEqual([r.status, r.data.code], [409, "secrets_changed"]);
    assert.equal((await rb({ ...jl, force: true })).data.code, "ack_required", "the pre_panel ack alone is not a force ack");
    r = await rb({ ...jl, force: true, ack: r.data.ack });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.pre_panel, cf.posts[1].force], [true, true]);
    // the check could not be made (null) → the same extra step
    forgetPanel(); cf.probeDown = new Set(["wv000002-aaaa-bbbb-cccc-000000000002"]); cf.secretsChanged = false;
    cf.deps["janna-lookup"].unshift({ id: "dep-jl-3", created_on: "2026-11-19T13:00:00Z", source: "api", versions: [{ version_id: "wv000001-aaaa-bbbb-cccc-000000000001", percentage: 100 }] });
    r = await rb({ ...jl, id: "wv000002-aaaa-bbbb-cccc-000000000002" });
    assert.deepEqual([r.status, r.data.code, r.data.panel], [409, "pre_panel", null]);
    // migate-intel: never asked
    r = await rb({ target: "migate-intel", id: "iv000000-aaaa-bbbb-cccc-000000000000", confirm: "ارجع" });
    assert.equal(r.status, 200, r.text);
  });
  test("the rollback limit is a ROLLING window (3 per 3600 s, 10 per 86 400 s) counted from the audit rows; a «secrets changed» refusal does not count; 429 says how long", async () => {
    const { env, o } = await withToken();
    const rb = (id, target = "pages", extra = {}) => api(env, "POST", D + "/deploys/rollback", { token: o.token, body: { target, id, confirm: "ارجع", ...extra } });
    const realNow = Date.now, T0 = Math.ceil(realNow() / 3600e3) * 3600e3 - 30e3; // 30 s before the next clock hour
    let off = 0;
    Date.now = () => T0 + off;
    try {
      // hh:59:30, :35, :40 — three rollbacks (the Pages target flips between two deployments)
      for (const [o2, id] of [[0, "pg000001-aaaa-bbbb-cccc-000000000001"], [5000, "pg000003-aaaa-bbbb-cccc-000000000003"], [10000, "pg000001-aaaa-bbbb-cccc-000000000001"]]) { off = o2; assert.equal((await rb(id)).status, 200); }
      // (hh+1):00:10 — a new clock hour, but still the same rolling hour → 429, nothing sent, with the real wait
      off = 40000;
      let r = await rb("pg000003-aaaa-bbbb-cccc-000000000003");
      assert.deepEqual([r.status, r.data.code, r.data.limit_hour, r.data.used_hour], [429, "rate_limited", 3, 3]);
      assert.ok(r.data.retry_s > 3500 && r.data.retry_s <= 3560, String(r.data.retry_s));
      assert.equal(cf.posts.length, 3);
      // once the first of the three is an hour old, one more is allowed
      off = 3600e3 + 1000;
      assert.equal((await rb("pg000003-aaaa-bbbb-cccc-000000000003")).status, 200);
      // a «secrets changed» refusal changes nothing and is not counted: the confirmed resend still goes through
      off = 7300e3; cf.secretsChanged = true;
      for (const [o2, id] of [[7300e3, "pg000001-aaaa-bbbb-cccc-000000000001"], [7301e3, "pg000003-aaaa-bbbb-cccc-000000000003"]]) { off = o2; assert.equal((await rb(id)).status, 200); }
      off = 7302e3;
      r = await rb("wv000001-aaaa-bbbb-cccc-000000000001", "janna-lookup");
      assert.equal(r.data.code, "secrets_changed");
      r = await rb("wv000001-aaaa-bbbb-cccc-000000000001", "janna-lookup", { force: true, ack: r.data.ack });
      assert.equal(r.status, 200, "the third counted rollback of this hour: " + r.text);
      assert.equal((await rb("pg000001-aaaa-bbbb-cccc-000000000001")).status, 429);
    } finally { Date.now = realNow; }
    const a = await audits(env, "dev.rollback");
    assert.ok(a.every(x => x.at >= new Date(T0).toISOString() && x.at <= new Date(T0 + 7400e3).toISOString()), "the rows carry the clock the window counts with");
  });
});

describe("«مفاتيح الخدمات» × whatsapp_send OFF", () => {
  test("the developer panel's OFF holds for the owner's test message too: wa-test → 409 feature_off, nothing reaches respond.io, can_send_test false", async () => {
    const env = env0({ RESPONDIO_TOKEN: RIO }), o = await owner(env);
    await waSwitchOn(env);
    let k = await api(env, "GET", K, { token: o.token });
    assert.deepEqual([k.data.wa.can_send_test, k.data.wa.feature_off], [true, false]);
    assert.equal((await api(env, "PUT", D + "/features", { token: o.token, body: { features: { whatsapp_send: false }, reason: "emergency stop" } })).status, 200);
    k = await api(env, "GET", K, { token: o.token });
    assert.deepEqual([k.data.wa.live, k.data.wa.reason, k.data.wa.can_send_test, k.data.wa.feature_off, k.data.wa.switch], [false, "feature_off", false, true, true]);
    const before = calls.length;
    const r = await api(env, "POST", K + "/wa-test", { token: o.token, body: { mode: "text" } });
    assert.deepEqual([r.status, r.data.code, r.data.feature], [409, "feature_off", "whatsapp_send"]);
    assert.equal(calls.slice(before).filter(c => c.url.includes("respond.io")).length, 0);
    assert.equal((await audits(env, "wa.test")).length, 0, "nothing sent, nothing to audit");
    // switched off a moment ago elsewhere (this isolate's memo says on): the fresh read still stops it
    await setFeatures(env, { whatsapp_send: true }, o.token);
    await env.DB.prepare("UPDATE cc_settings SET v = ? WHERE k = 'features'").bind(storeJson({ whatsapp_send: false }, {})).run();
    assert.equal((await api(env, "POST", K + "/wa-test", { token: o.token, body: { mode: "text" } })).data.code, "feature_off");
    assert.equal(calls.slice(before).filter(c => c.url.includes("respond.io")).length, 0);
  });
});

describe("the version marker in wrangler.toml", () => {
  test("DEV_PANEL = \"1\" (a version without it is «older than the panel») and the version-metadata binding of «صحة الموقع»", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
    assert.match(toml, /^DEV_PANEL = "1"/m);
    assert.match(toml, /\[version_metadata\]\s*\nbinding = "CF_VERSION_METADATA"/);
  });
});

describe("health: pages, APIs (in-process), intel, D1 counts, worker version", () => {
  test("all green → ok:true; a page down / intel ok:false → that row red with a short reason; table counts read-only; 12 checks per 10 min", async () => {
    const env = env0({ CF_VERSION_METADATA: { id: "ver-1234", tag: "v99", timestamp: "2026-11-19T09:00:00Z" } }), o = await owner(env);
    let r = await api(env, "GET", D + "/health", { token: o.token });
    assert.equal(r.status, 200, r.text);
    const by = g => r.data.checks.filter(c => c.group === g);
    assert.equal(by("page").length, 8); assert.ok(by("page").every(c => c.ok && c.status === 200 && c.url.startsWith(PAGES + "/")), JSON.stringify(by("page")));
    assert.deepEqual(by("api").map(c => [c.id, c.ok]), [["api:/api/janna/health", true], ["api:/api/auth/health", true], ["api:/api/advisor/health", true], ["api:/api/meetings/health", true], ["api:/api/inquiries/health", true], ["api:/api/settings", true], ["api:/api/plans", true]]);
    assert.ok(!calls.some(c => c.url.startsWith(SITE + "/api/")), "this Worker's APIs ran in-process, never through the network");
    assert.deepEqual(by("intel").map(c => [c.id, c.ok, c.url]), [["intel:/api/intel/health", true, INTEL + "/api/intel/health"], ["intel:/intel/", true, INTEL + "/intel/"]]);
    assert.deepEqual([by("db")[0].ok, by("worker")[0].ok], [true, true]);
    assert.deepEqual(r.data.worker, { script: "janna-lookup", version_id: "ver-1234", version_tag: "v99", version_at: "2026-11-19T09:00:00Z", source: "binding", data_v: r.data.worker.data_v });
    assert.ok(r.data.tables.length >= 15 && r.data.tables.every(t => t.ok && Number.isInteger(t.rows)));
    assert.equal(r.data.tables.find(t => t.name === "members").rows, 1);
    assert.equal(r.data.ok, true, JSON.stringify(r.data.checks.filter(c => !c.ok)));
    assert.ok(calls.filter(c => c.url.startsWith(PAGES) || c.url.startsWith(INTEL)).every(c => c.method === "GET"));
    // a page down and the intel pipeline unhealthy
    probe.page = 503; probe.intel = { ok: false, error: "no runs" };
    r = await api(env, "GET", D + "/health", { token: o.token });
    assert.equal(r.data.ok, false);
    const home = r.data.checks.find(c => c.id === "page:/"), ih = r.data.checks.find(c => c.id === "intel:/api/intel/health");
    assert.deepEqual([home.ok, home.status, home.detail], [false, 503, "status 503"]);
    assert.deepEqual([ih.ok, ih.detail], [false, "ok: false — no runs"]);
    // a missing table is red with rows null (never an invented 0)
    env.DB.db.exec("DROP TABLE IF EXISTS knowledge_bank");
    r = await api(env, "GET", D + "/health", { token: o.token });
    assert.deepEqual(r.data.tables.find(t => t.name === "knowledge_bank"), { name: "knowledge_bank", rows: null, ok: false });
    // without the version binding: informative, not red
    const e2 = env0(), o2 = await owner(e2);
    const h2 = await api(e2, "GET", D + "/health", { token: o2.token });
    assert.deepEqual([h2.data.worker.source, h2.data.checks.find(c => c.id === "worker:version").ok], ["none", true]);
    for (let i = 0; i < 11; i++) await api(e2, "GET", D + "/health", { token: o2.token });
    assert.deepEqual([(await api(e2, "GET", D + "/health", { token: o2.token })).status], [429]);
  });
  test("with the service binding INTEL (worker/wrangler.toml [[services]]) the intel probe goes through it, never through the workers.dev URL", async () => {
    const seen = [], INTEL_B = { async fetch(req) { seen.push([req.method, new URL(req.url).pathname]); return new URL(req.url).pathname === "/api/intel/health" ? J({ ok: true }) : new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } }); } };
    const env = env0({ INTEL: INTEL_B }), o = await owner(env);
    const r = await api(env, "GET", D + "/health", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.checks.filter(c => c.group === "intel").map(c => [c.id, c.ok]), [["intel:/api/intel/health", true], ["intel:/intel/", true]]);
    assert.deepEqual(seen.sort(), [["GET", "/api/intel/health"], ["GET", "/intel/"]]);
    assert.ok(!calls.some(c => c.url.startsWith(INTEL)), "no workers.dev request");
  });
});

describe("the developer panel's own audit", () => {
  test("GET /dev/audit → dev.* rows and the Cloudflare key's rows only, newest first, paged", async () => {
    const env = env0(), o = await owner(env);
    await setFeatures(env, { janna_live: false }, o.token);
    await setFeatures(env, { janna_live: true }, o.token);
    await api(env, "PUT", K + "/" + CF_SLOT, { token: o.token, body: { value: TOKEN } });
    await api(env, "PUT", K + "/anam.api_key", { token: o.token, body: { value: "anam_test_key_00112233445566778899" } }); // not a developer-panel row
    await api(env, "PUT", "/api/admin/cc/settings", { token: o.token, body: { public: { tax_no: "123" } } });           // not one either
    let r = await api(env, "GET", D + "/audit", { token: o.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.items.map(x => [x.action, x.target_id]), [["keys.set", CF_SLOT], ["dev.features", "janna_live"], ["dev.features", "janna_live"]]);
    assert.ok(r.data.items[1].after && r.data.items[1].before, "before / after parsed");
    assert.equal(r.data.next_before, null);
    r = await api(env, "GET", D + "/audit?limit=2", { token: o.token });
    assert.equal(r.data.items.length, 2);
    const next = await api(env, "GET", D + "/audit?limit=2&before=" + r.data.next_before, { token: o.token });
    assert.deepEqual(next.data.items.map(x => x.action), ["dev.features"]);
    assert.ok(!r.text.includes(TOKEN));
  });
});
