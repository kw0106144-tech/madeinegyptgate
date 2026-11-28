// node --test for the team-portal one-click sign-in (src/portal-sso.js + src/portal-map.js and their hooks in auth.js, acc-base.js, acc.js, me.js).
// Run: cd worker && node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/portal-sso.test.mjs
// No network. A throw-away Ed25519 key pair signs the test tokens (env.PORTAL_PUBLIC_KEY_TEST); the real public key is in portal-sso.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { D1 } from "./helpers.mjs";
import * as ACC from "../src/acc.js";
import { handlePortalSso, verifyPortalToken, PORTAL_PUBLIC_KEY } from "../src/portal-sso.js";
import { portalAllowed, portalPerms, PORTAL_PERMS } from "../src/portal-map.js";
import { OWNER_ONLY } from "../src/acc-base.js";
import { handleMe } from "../src/me.js";

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const SITE = "https://madeinegyptgate.com";
const b64u = b => Buffer.from(b).toString("base64url");
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");

const KP = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const PUB = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", KP.publicKey)));
const OTHER = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

function kv() { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; }
function mkEnv() {
  const DB = new D1(); DB.db.exec(MIG);
  return { DB, SEO_KV: kv(), ADVISOR_SECRET: "s3cret-test", ADMIN_EMAILS: "owner@mig.test", PORTAL_PUBLIC_KEY_TEST: PUB, SITE_URL: SITE + "/" };
}
async function mkMember(env, email, o = {}) {
  const id = "u" + hex(8), t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, role) VALUES (?, ?, ?, 'visitor', 1, ?, ?, ?, ?)").bind(id, "Co", email, t, t, t, o.role || "user").run();
  if (o.staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, o.staff, t, t).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
async function tok(claims, key = KP.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const c = { site: "mi_eg", u: "staff@team.test", n: "Staff", p: { tenders: "w", users: "r" }, iat: now, exp: now + 60, jti: hex(16), ...claims };
  const b = b64u(new TextEncoder().encode(JSON.stringify(c)));
  return b + "." + b64u(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(b))));
}
const post = t => new Request(SITE + "/api/auth/portal", { method: "POST", body: new URLSearchParams({ t }), headers: { "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "203.0.113.9" } });
async function signIn(env, t) {
  const r = await handlePortalSso(post(t), env), html = await r.text();
  const m = /localStorage\.setItem\("mig-tok","([^"]+)"\)/.exec(html);
  return { status: r.status, html, token: m ? m[1] : "", headers: r.headers };
}
const cc = (env, path, token, method = "GET", body) => ACC.handleCC(new Request(SITE + "/api/admin/cc" + path, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }, {});
const j = async r => ({ status: r.status, body: await r.json().catch(() => null) });

test("the shipped public key is a 32-byte Ed25519 key", () => { assert.equal(Buffer.from(PORTAL_PUBLIC_KEY, "base64url").length, 32); });

test("a portal session never holds an owner-only permission or a team / system one", () => {
  for (const p of PORTAL_PERMS) assert.ok(!OWNER_ONLY.has(p), p);
  for (const p of ["staff.write", "staff.read", "settings.write", "settings.read", "plans.write", "plans.sync", "keys.manage", "email.config", "import.run", "audit.read", "dev.manage", "pay.config"]) assert.ok(!PORTAL_PERMS.includes(p), p);
  assert.deepEqual(portalPerms({ plans: "w" }), ["plans.read"]);
  assert.deepEqual(portalPerms({ approvals: "r" }), []);
  assert.deepEqual(portalPerms({ nope: "w", users: "x" }), []);
});

test("path rules are fail-closed", () => {
  const s = { tenders: "w", users: "r", publish: "r" };
  assert.equal(portalAllowed("/content/tend", "POST", s), true);
  assert.equal(portalAllowed("/content/news", "GET", s), false);
  assert.equal(portalAllowed("/members/u1", "GET", s), true);
  assert.equal(portalAllowed("/members/u1", "PATCH", s), false);
  assert.equal(portalAllowed("/content/publish", "POST", s), false);
  for (const p of ["/staff", "/settings", "/keys", "/audit", "/import/runs", "/dev/features", "/members.csv", "/plans", "/pay/config", "/knowledge", "/content/overlay-toggle", "/stats", "/badges"]) assert.equal(portalAllowed(p, "GET", s), false, p);
});

test("tokens: signature, site, lifetime", async () => {
  const env = mkEnv();
  assert.ok(await verifyPortalToken(env, await tok({})));
  assert.equal(await verifyPortalToken(env, await tok({}, OTHER.privateKey)), null);
  assert.equal(await verifyPortalToken(env, await tok({ site: "mi_sa" })), null);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyPortalToken(env, await tok({ iat: now - 200, exp: now - 10 })), null);
  assert.equal(await verifyPortalToken(env, await tok({ exp: now + 3600 })), null);
  assert.equal(await verifyPortalToken(env, await tok({ jti: "x" })), null);
  // Flip a character well inside the signature: the last base64url character of a 64-byte signature carries padding
  // bits a decoder may ignore, so changing only the tail made this assertion fail now and then.
  const t = await tok({}), at = t.length - 10, ch = t[at] === "A" ? "B" : "A";
  assert.equal(await verifyPortalToken(env, t.slice(0, at) + ch + t.slice(at + 1)), null);
});

test("staff: one-click session limited to its sections; replay refused; KV gone → no access", async () => {
  const env = mkEnv(), t = await tok({});
  const a = await signIn(env, t);
  assert.equal(a.status, 200); assert.ok(a.token.startsWith("v2."), "token handed to the page");
  assert.match(a.headers.get("Content-Security-Policy"), /script-src 'nonce-/);
  assert.match(a.html, /location\.replace\("\/admin\/"\)/);
  assert.equal((await signIn(env, t)).status, 401, "single use");
  const sid = a.token.split(".")[2]; assert.ok(sid.startsWith("lp"));
  const m = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind("staff@team.test").first();
  assert.equal(m.company, "فريق المنصة"); assert.equal(m.plan, "visitor");

  const w = await j(await cc(env, "/whoami", a.token));
  assert.equal(w.status, 200); assert.equal(w.body.role, "portal");
  assert.deepEqual(w.body.sections, { tenders: "w", users: "r" });
  assert.deepEqual([...w.body.perms].sort(), ["content.read", "content.write", "media.upload", "members.read"].sort());
  for (const p of ["/staff", "/settings", "/keys", "/audit", "/content/news", "/customers", "/orders"]) assert.equal((await cc(env, p, a.token)).status, 403, p);
  assert.equal((await cc(env, "/members/" + m.id, a.token, "PATCH", { name: "x" })).status, 403, "users is view-only");
  assert.notEqual((await cc(env, "/members", a.token)).status, 403, "users view is allowed");

  const audit = await env.DB.prepare("SELECT * FROM cc_audit WHERE action = 'portal.signin'").all();
  assert.equal(audit.results.length, 1); assert.equal(audit.results[0].actor_role, "portal");

  env.SEO_KV.m.clear();
  assert.equal((await cc(env, "/whoami", a.token)).status, 403, "fail-closed without the KV row");
});

test("staff who is also a Control Center admin still gets only the portal sections", async () => {
  const env = mkEnv(); await mkMember(env, "boss@team.test", { staff: "admin", role: "admin" });
  const a = await signIn(env, await tok({ u: "boss@team.test", p: { news: "r" } }));
  const w = await j(await cc(env, "/whoami", a.token));
  assert.equal(w.body.role, "portal"); assert.deepEqual(w.body.perms, ["content.read"]);
  assert.equal((await cc(env, "/staff", a.token)).status, 403);
  const me = await handleMe(new Request(SITE + "/api/me", { headers: { Authorization: "Bearer " + a.token } }), env, {});
  assert.equal((await me.json()).user.staff_role, "", "no team board from a portal session");
});

test("owner: full owner session for the bootstrap owner only", async () => {
  const env = mkEnv();
  assert.equal((await signIn(env, await tok({ u: "owner@portal.test", own: 1, p: {} }))).status, 403, "no owner account yet → refused, nothing created");
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE email = 'owner@portal.test'").first("n"), 0);
  await mkMember(env, "owner@mig.test");
  const a = await signIn(env, await tok({ u: "owner@portal.test", own: 1, p: {} }));
  assert.equal(a.status, 200); assert.match(a.token.split(".")[2], /^[a-f0-9]{32}$/);
  const w = await j(await cc(env, "/whoami", a.token));
  assert.equal(w.body.role, "owner"); assert.equal(w.body.sections, undefined);
  assert.equal((await cc(env, "/staff", a.token)).status, 200);
});

test("staff with no sections, or a blocked address, gets nothing", async () => {
  const env = mkEnv();
  assert.equal((await signIn(env, await tok({ p: {} }))).status, 403);
  assert.equal((await signIn(env, await tok({ p: { bogus: "w" } }))).status, 403);
  assert.equal((await handlePortalSso(new Request(SITE + "/api/auth/portal"), env)).status, 405);
});
