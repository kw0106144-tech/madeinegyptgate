// Token + role checks for /api/seo/*: byte-identical to the Worker's v2 token (worker/src/auth.js), same session /
// revocation / admin rules (checked side by side with the Worker's own authUser on one D1), and the fallbacks.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { register } from "node:module";
import { signSession, parseV2, resolveCaller, authMode, resetAuthCache, sha256hex, emailKey } from "../_lib/seo-auth.js";
import { D1, seedMember, randomSid, iso } from "./helpers.mjs";

const SECRET = "test-advisor-secret", SID = "0123456789abcdef0123456789abcdef";
const reqWith = (token, headers = {}) => new Request("https://madeinegyptgate.com/api/seo/health", { headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...headers } });
/* the Worker's own auth code, imported read-only (worker/src does `import DATA from "./data.json"` → JSON hooks). When the
   Worker is in the repo but cannot be imported, the parity test FAILS instead of skipping silently. */
const WORKER_AUTH = new URL("../../worker/src/auth.js", import.meta.url), WORKER_HERE = existsSync(WORKER_AUTH);
let worker = null, common = null, workerErr = null;
if (WORKER_HERE) {
  try { register(new URL("./json-hooks.mjs", import.meta.url)); worker = await import(WORKER_AUTH.href); common = await import(new URL("../../worker/src/common.js", import.meta.url).href); }
  catch (e) { worker = null; workerErr = e; }
}

test("token format = worker/src/auth.js signSession (independent HMAC check" + (worker ? " + the Worker's own code)" : "; Worker module not importable here)"), async () => {
  const exp = 1900000000, mine = await signSession(SECRET, "u1a2b3c4", SID, exp);
  const mac = createHmac("sha256", SECRET).update(`v2|u1a2b3c4|${SID}|${exp}`).digest("base64url");
  assert.equal(mine, `v2.${Buffer.from("u1a2b3c4").toString("base64url")}.${SID}.${exp}.${mac}`);
  if (worker) assert.equal(mine, await worker.signSession(SECRET, "u1a2b3c4", SID, exp));
  const ar = await signSession(SECRET, "عضو-١", SID, exp); // non-ASCII member ids round-trip
  assert.equal((await parseV2(SECRET, ar, 1)).memberId, "عضو-١");
});
test("parseV2 rejects tampering, expiry, other secrets and other token kinds", async () => {
  const now = Math.floor(Date.now() / 1000), t = await signSession(SECRET, "u1", SID, now + 60);
  assert.deepEqual(await parseV2(SECRET, t), { memberId: "u1", sid: SID, exp: now + 60 });
  assert.equal(await parseV2("other", t), null);
  assert.equal(await parseV2(SECRET, await signSession(SECRET, "u1", SID, now - 1)), null);
  const p = t.split(".");
  assert.equal(await parseV2(SECRET, [p[0], Buffer.from("admin").toString("base64url"), p[2], p[3], p[4]].join(".")), null);
  assert.equal(await parseV2(SECRET, [p[0], p[1], p[2], String(now + 9999), p[4]].join(".")), null);
  assert.equal(await parseV2(SECRET, [p[0], p[1], "XYZ", p[3], p[4]].join(".")), null);
  assert.equal(await parseV2(SECRET, "v1.dTE.partner." + (now + 60) + ".sig"), null);
  assert.equal(await parseV2(SECRET, t + ".x"), null);
  assert.equal(await parseV2("", t), null);
});

test("D1 mode: session must be live; role admin (members.role or verified ADMIN_EMAILS) or seo", async () => {
  const db = new D1(), env = { ADVISOR_SECRET: SECRET, DB: db, ADMIN_EMAILS: "Boss@Example.test, other@example.test" };
  assert.equal(authMode(env), "d1");
  const admin = await seedMember(db, { id: "uadmin", email: "x@example.test", role: "admin", secret: SECRET });
  const boss = await seedMember(db, { id: "uboss", email: "boss@example.test", secret: SECRET });
  const unverified = await seedMember(db, { id: "uunv", email: "other@example.test", verified: false, secret: SECRET });
  const seo = await seedMember(db, { id: "useo", email: "seo@example.test", role: "seo", secret: SECRET });
  const member = await seedMember(db, { id: "umem", email: "m@example.test", secret: SECRET });
  const revoked = await seedMember(db, { id: "urev", role: "admin", revoked: iso(Date.now()), secret: SECRET });
  const ended = await seedMember(db, { id: "uend", role: "admin", sessionExpiresAt: iso(Date.now() - 1000), secret: SECRET });
  const r = async t => resolveCaller(reqWith(t), env);
  assert.deepEqual(await r(admin), { ok: true, id: "uadmin", email: "x@example.test", role: "admin", via: "d1" });
  assert.equal((await r(boss)).role, "admin");
  assert.equal((await r(unverified)).status, 403, "ADMIN_EMAILS needs a verified email");
  assert.equal((await r(seo)).role, "seo");
  assert.equal((await r(member)).status, 403);
  assert.equal((await r(revoked)).status, 401, "logout (revoked session) ends access at once");
  assert.equal((await r(ended)).status, 401);
  const foreign = await signSession(SECRET, "uadmin", randomSid(), Math.floor(Date.now() / 1000) + 600); // no session row
  assert.equal((await r(foreign)).status, 401);
  // a session row of another member cannot be reused with a forged member id (HMAC) nor a real one (member check)
  const sid = randomSid();
  db.db.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(await sha256hex(sid), "umem", iso(Date.now()), iso(Date.now() + 86400000));
  assert.equal((await r(await signSession(SECRET, "uadmin", sid, Math.floor(Date.now() / 1000) + 600))).status, 401);
  assert.equal((await r("")).status, 401);
  assert.equal((await resolveCaller(reqWith(admin), { ...env, ADVISOR_SECRET: "" })).status, 503);
  db.db.exec("DROP TABLE auth_sessions");
  assert.equal((await r(admin)).status, 503, "store error fails closed");
});
test("AUTH_SECRET wins over ADVISOR_SECRET (same precedence as the Worker's secretOf)", async () => {
  const db = new D1();
  const env = { AUTH_SECRET: "auth-secret", ADVISOR_SECRET: SECRET, DB: db };
  const good = await seedMember(db, { id: "ua", role: "admin", secret: "auth-secret" });
  const old = await seedMember(db, { id: "ub", role: "admin", secret: SECRET });
  assert.equal((await resolveCaller(reqWith(good), env)).ok, true);
  assert.equal((await resolveCaller(reqWith(old), env)).status, 401);
});
test("D1 mode: a member blocked by an admin (blocks table, Worker emailKey) loses access at once", async () => {
  const db = new D1(), env = { ADVISOR_SECRET: SECRET, DB: db };
  const seo = await seedMember(db, { id: "ubs", email: "Contractor+x@Example.test", role: "seo", secret: SECRET });
  const adm = await seedMember(db, { id: "uba", email: "Ops.Team@googlemail.com", role: "admin", secret: SECRET });
  assert.equal((await resolveCaller(reqWith(seo), env)).ok, true);
  assert.equal((await resolveCaller(reqWith(adm), env)).ok, true);
  for (const e of ["contractor@example.test", "opsteam@gmail.com"]) db.db.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('email', ?, 'left', ?)").run(e, iso(Date.now()));
  assert.equal((await resolveCaller(reqWith(seo), env)).status, 401, "+tag and case folded like the Worker");
  assert.equal((await resolveCaller(reqWith(adm), env)).status, 401, "Gmail dots / googlemail folded like the Worker");
  assert.equal(emailKey("  A.B+news@GoogleMail.com "), "ab@gmail.com");
  assert.equal(emailKey("x+y@Example.com"), "x@example.com");
  assert.equal(emailKey("no-at-sign"), "no-at-sign");
});
test("the Worker's own code is importable here (else the parity test below would not run)", { skip: !WORKER_HERE && "worker/ not in this checkout" }, () => {
  assert.ok(worker, "worker/src/auth.js did not import: " + (workerErr && workerErr.message));
});
test("same verdicts as the Worker's authUser + isAdmin on one database (sessions, roles, blocks)", { skip: !worker && "worker/src/auth.js not importable" }, async () => {
  const db = new D1(), env = { ADVISOR_SECRET: SECRET, DB: db, ADMIN_EMAILS: "boss@example.test" };
  const cases = [
    await seedMember(db, { id: "w1", role: "admin", secret: SECRET }),
    await seedMember(db, { id: "w2", email: "boss@example.test", secret: SECRET }),
    await seedMember(db, { id: "w3", secret: SECRET }),
    await seedMember(db, { id: "w4", role: "admin", revoked: iso(Date.now()), secret: SECRET }),
    await seedMember(db, { id: "w5", role: "admin", sessionExpiresAt: iso(Date.now() - 5), secret: SECRET }),
    await seedMember(db, { id: "w6", email: "Blocked.Admin+x@gmail.com", role: "admin", secret: SECRET }),
    await seedMember(db, { id: "w7", email: "BOSS@example.test", secret: SECRET }),
    await seedMember(db, { id: "w8", email: "boss@example.test", verified: false, secret: SECRET }),
    await signSession(SECRET, "w1", randomSid(), Math.floor(Date.now() / 1000) + 99),
    await signSession("wrong", "w1", SID, Math.floor(Date.now() / 1000) + 99),
    "garbage",
  ];
  db.db.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('email', ?, 'test', ?)").run(common.emailKey("blocked.admin@gmail.com"), iso(Date.now()));
  for (const t of cases) {
    const u = await worker.authUser(reqWith(t), env);
    const workerVerdict = !u ? 401 : common.isAdmin(env, u) ? 200 : 403;
    const mine = await resolveCaller(reqWith(t), env);
    assert.equal(mine.ok ? 200 : mine.status, workerVerdict, "token " + String(t).slice(0, 24));
  }
  for (const e of ["A.B+c@GoogleMail.com", " X@Y.example ", "plain", "a+b+c@d.e", "ü@ä.example", "\tTab@x.example\n", "a@b@c.example", "", 42])
    assert.equal(emailKey(e), common.emailKey(e), "emailKey(" + JSON.stringify(e) + ")");
});

test("worker mode: PLATFORM_API service binding → GET /api/me decides (cached 30 s)", async () => {
  resetAuthCache();
  const t = await signSession(SECRET, "u9", SID, Math.floor(Date.now() / 1000) + 600);
  let calls = 0, reply = { status: 200, body: { user: { id: "u9", email: "a@example.test", role: "admin" } } };
  const svc = { async fetch(u, init) { calls++; assert.match(String(u), /\/api\/me$/); assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + t); if (reply.throw) throw new Error("down"); return new Response(JSON.stringify(reply.body), { status: reply.status }); } };
  const env = { ADVISOR_SECRET: SECRET, PLATFORM_API: svc };
  assert.equal(authMode(env), "worker");
  assert.deepEqual(await resolveCaller(reqWith(t), env), { ok: true, id: "u9", email: "a@example.test", role: "admin", via: "worker" });
  await resolveCaller(reqWith(t), env);
  assert.equal(calls, 1);
  resetAuthCache(); reply = { status: 200, body: { user: { id: "u9", role: "member" } } };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 403);
  resetAuthCache(); reply = { status: 200, body: { user: { id: "someone-else", role: "admin" } } };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 401);
  resetAuthCache(); reply = { status: 401, body: { error: "unauthorized" } };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 401);
  resetAuthCache(); reply = { throw: true };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 503);
  resetAuthCache(); reply = { status: 500, body: {} };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 503);
  resetAuthCache();
  const viaOrigin = await resolveCaller(reqWith(t), { ADVISOR_SECRET: SECRET, PLATFORM_API_ORIGIN: "https://janna-lookup.example.workers.dev" }, { fetch: async u => { assert.equal(u, "https://janna-lookup.example.workers.dev/api/me"); return new Response(JSON.stringify({ user: { id: "u9", role: "admin" } })); } });
  assert.equal(viaOrigin.via, "worker");
});
test("allowlist mode, no role source (fail closed), platform key", async () => {
  const t = await signSession(SECRET, "u1a2b3c4", SID, Math.floor(Date.now() / 1000) + 600);
  assert.equal((await resolveCaller(reqWith(t), { ADVISOR_SECRET: SECRET, SEO_ADMIN_IDS: "u0, u1a2b3c4" })).via, "allowlist");
  assert.equal((await resolveCaller(reqWith(t), { ADVISOR_SECRET: SECRET, SEO_ADMIN_IDS: "u0" })).status, 403);
  const none = await resolveCaller(reqWith(t), { ADVISOR_SECRET: SECRET });
  assert.deepEqual([none.status, none.code], [503, "auth_backend_off"]);
  assert.equal((await resolveCaller(reqWith("", { "X-Platform-Key": "pk-123" }), { PLATFORM_KEY: "pk-123" })).platform, true);
  assert.equal((await resolveCaller(reqWith("", { "X-Platform-Key": "pk-12" }), { PLATFORM_KEY: "pk-123" })).status, 401);
  assert.equal((await resolveCaller(reqWith("", { "X-Platform-Key": "" }), { PLATFORM_KEY: "" })).status, 401, "an empty PLATFORM_KEY never matches");
  assert.equal((await resolveCaller(reqWith("", { "X-Platform-Key": "seo-only-key-42" }), { SEO_PLATFORM_KEY: "seo-only-key-42" })).platform, true, "a key for this API only");
  assert.equal((await resolveCaller(reqWith("", { "X-Platform-Key": "seo-only-key-4" }), { SEO_PLATFORM_KEY: "seo-only-key-42", PLATFORM_KEY: "" })).status, 401);
});

/* ---------- Control Center roles (ACC-CONTRACT §0.5, §12.1; X-acc-1 = P-TEAM-5): cc_staff decides, bridge sessions never get a role ---------- */
test("D1 mode + migration 0006: cc_staff seo/editor → seo, owner/admin → admin, data/support → 403, disabled → 403, bridge session → 403 use_email_code", async () => {
  const db = new D1(), env = { ADVISOR_SECRET: SECRET, DB: db };
  assert.equal(db.schema, "worker/schema.sql");
  assert.ok(db.db.prepare("SELECT 1 AS x FROM sqlite_master WHERE name = 'cc_staff'").get(), "worker/schema.sql carries 0006 (P-W8)");
  const t = iso(Date.now());
  const staff = (id, role, disabled = "") => db.db.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at, disabled_at) VALUES (?, ?, 'owner', ?, ?, ?)").run(id, role, t, t, disabled);
  const tok = {};
  for (const [id, role, mrole] of [["cseo", "seo", "seo"], ["cedit", "editor", "seo"], ["cdata", "data", "user"], ["csup", "support", "user"], ["cadm", "admin", "user"], ["cown", "owner", "user"], ["cdis", "seo", "seo"], ["cplain", "", "user"]]) {
    tok[id] = await seedMember(db, { id, email: id + "@example.test", role: mrole, secret: SECRET });
    if (role) staff(id, role, id === "cdis" ? t : "");
  }
  const r = async k => resolveCaller(reqWith(tok[k]), env);
  assert.equal((await r("cseo")).role, "seo");
  assert.equal((await r("cedit")).role, "seo", "editor → the SEO workspace's restricted role");
  assert.deepEqual([(await r("cdata")).status, (await r("cdata")).code], [403, "forbidden"], "the data desk has no SEO access");
  assert.equal((await r("csup")).status, 403);
  assert.equal((await r("cadm")).role, "admin", "a Control Center admin is an SEO admin even with members.role = user");
  assert.equal((await r("cown")).role, "admin");
  assert.equal((await r("cdis")).status, 403, "a disabled staff row ends access although members.role is still seo");
  assert.equal((await r("cplain")).status, 403);
  // a session made by the old-password bridge (cc_session_meta.via = 'legacy') never carries a staff role
  const sid = randomSid();
  const legacy = await seedMember(db, { id: "clegacy", email: "l@example.test", role: "admin", sid, secret: SECRET });
  db.db.prepare("INSERT INTO cc_session_meta (sid_hash, via, created_at) VALUES (?, 'legacy', ?)").run(await sha256hex(sid), t);
  const lg = await resolveCaller(reqWith(legacy), env);
  assert.deepEqual([lg.status, lg.code], [403, "use_email_code"]);
});
test("D1 mode without the 0006 tables: the members.role rule only (fail-safe, as before deploy 2)", async () => {
  const db = new D1(), env = { ADVISOR_SECRET: SECRET, DB: db };
  for (const n of db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc_%'").all().map(x => x.name)) db.db.exec("DROP TABLE " + n);
  const seo = await seedMember(db, { id: "nseo", role: "seo", secret: SECRET }), adm = await seedMember(db, { id: "nadm", role: "admin", secret: SECRET }), mem = await seedMember(db, { id: "nmem", secret: SECRET });
  assert.equal((await resolveCaller(reqWith(seo), env)).role, "seo");
  assert.equal((await resolveCaller(reqWith(adm), env)).role, "admin");
  assert.equal((await resolveCaller(reqWith(mem), env)).status, 403);
});
test("worker mode: /api/me not admin → GET /api/team/whoami decides (seo/editor → seo; data → 403; other member id → 403)", async () => {
  const t = await signSession(SECRET, "w9", SID, Math.floor(Date.now() / 1000) + 600);
  let who = { role: "seo", user: { id: "w9", email: "s@example.test" } }, seen = [];
  const svc = { async fetch(u) { seen.push(new URL(String(u)).pathname); return /\/api\/me$/.test(String(u)) ? new Response(JSON.stringify({ user: { id: "w9", role: "user" } })) : new Response(JSON.stringify(who)); } };
  const env = { ADVISOR_SECRET: SECRET, PLATFORM_API: svc };
  resetAuthCache();
  assert.deepEqual(await resolveCaller(reqWith(t), env), { ok: true, id: "w9", email: "s@example.test", role: "seo", via: "worker" });
  assert.deepEqual(seen, ["/api/me", "/api/team/whoami"]);
  resetAuthCache(); who = { role: "editor", user: { id: "w9" } };
  assert.equal((await resolveCaller(reqWith(t), env)).role, "seo");
  resetAuthCache(); who = { role: "data", user: { id: "w9" } };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 403);
  resetAuthCache(); who = { role: "seo", user: { id: "someone-else" } };
  assert.equal((await resolveCaller(reqWith(t), env)).status, 403);
});
