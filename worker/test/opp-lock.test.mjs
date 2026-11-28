// node --test for the members-only opportunities (owner decision 2026-11-28, src/opp-lock.js + tools/opp_split.js):
//  - the build split: the public data files carry the teaser fields only, the locked fields go to items.json L (same keys the page uses)
//  - GET /api/me/opps: visitor 401, a plan without opportunities 403, Basic = Egypt, Premium = + its GCC states + procurement, staff = all
//  - the assistants' tools: /api/janna/lookup and /api/janna/item give a visitor (and a Janna call of a visitor) the teaser + the hint;
//    a signed-in member / his Anam call / a Bassem call gets the details
// No provider is called: fetch is mocked (only Anam's GET /v1/sessions/<id> answers).
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import worker from "../src/index.js";
import ITEMS from "../src/items.json";
import { issueSession } from "../src/auth.js";
import { forgetOppViewers, forgetOppOverlay, OPPS_PER_HOUR, canSee, needPlan, lockResult } from "../src/opp-lock.js";
import { D1 } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const SPLIT = require("../../tools/opp_split.js");
const DATA_DIR = new URL("../../data/", import.meta.url).pathname;
const SITE = "https://madeinegyptgate.com";
const NOW = new Date().toISOString();
const KEY = "anam-test-key-opp-0001"; // fake: never a real key

const env0 = () => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", ANAM_API_KEY: KEY, ADMIN_EMAILS: "boss@mig.test" });
async function member(env, { id, email, plan = "visitor", role = "user", plan_expires = "", prefs = "" }) {
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at) VALUES (?, 'Test Co', ?, ?, 1, ?, ?, ?, ?, ?)")
    .bind(id, email, plan, NOW, NOW, role, plan_expires, NOW).run();
  if (prefs) await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE id = ?").bind(prefs, id).run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}
const tokenFor = async (env, m, scope = "full") => (await issueSession(env, m, { scope })).token;
async function get(env, path, { token, headers = {}, method = "GET", body } = {}) {
  const h = { ...headers }; if (token) h.Authorization = "Bearer " + token; if (body) h["Content-Type"] = "application/json";
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data, headers: res.headers };
}
const LOCKED_RESULT = ["entity", "entity_en", "bid_bond_egp", "booklet_price_egp", "estimated_value", "documents_url", "details", "quantity", "delivery", "winner", "owner", "contractor", "consultant", "value_egp_million", "values_million", "latest_news"];

let realFetch, anamCalls, anamLabel;
beforeEach(() => {
  realFetch = globalThis.fetch; anamCalls = 0; anamLabel = null; forgetOppViewers(); forgetOppOverlay();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://api.anam.ai/v1/sessions/")) throw new Error("unexpected fetch " + u);
    anamCalls++;
    return anamLabel ? new Response(JSON.stringify({ id: u.split("/").pop(), clientLabel: anamLabel }), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("the build split (tools/opp_split.js)", () => {
  const r = SPLIT.splitDir(DATA_DIR);
  test("the public tenders keep the teaser fields only; every locked value is in L.t under the row's key", () => {
    const pub = SPLIT.readJson(r.files["oldtend.js"], "window.MIGTEND="), full = SPLIT.readJson(readFileSync(DATA_DIR + "oldtend.js", "utf8"), "window.MIGTEND=");
    assert.equal(pub.length, full.length);
    const seen = {};
    full.forEach((t, i) => {
      const p = pub[i], k = SPLIT.tendKey(t, seen);
      for (const j of SPLIT.TEND_LOCK) assert.equal(p[j] || "", "", "row " + i + " field " + j + " is public");
      for (const j of [0, 1, 2, 3, 5, 6, 9, 10]) assert.deepEqual(p[j], t[j], "teaser field " + j + " kept");
      if (SPLIT.TEND_LOCK.some(j => t[j])) assert.deepEqual(r.locked.t[k], SPLIT.TEND_LOCK.map(j => (t[j] == null ? "" : t[j])));
    });
  });
  test("RFQs, REAL tenders / awards / international tenders and the projects: no detail field is public", () => {
    const q = SPLIT.readJson(r.files["oldrfq.js"], "window.MIGRFQ=");
    for (const x of q) for (const j of SPLIT.RFQ_LOCK) assert.equal(x[j] || "", "");
    const R = SPLIT.readJson(r.files["real.js"], "window.REAL=");
    for (const t of R.tenders) for (const k of SPLIT.RT_LOCK) assert.equal(t[k], undefined, "REAL.tenders." + k);
    for (const t of R.tenders_intl) for (const k of SPLIT.RI_LOCK) assert.equal(t[k], undefined, "REAL.tenders_intl." + k);
    for (const a of R.awards) assert.deepEqual(Object.keys(a).filter(k => /winner|entity|value|source/.test(k)), []);
    assert.ok(R.news.length > 50 && R.news.every(n => n.category_ar === SPLIT.PROCUREMENT || n.url), "general news stays public with its link");
    const P = SPLIT.readJson(r.files["projects.js"], "MIG.PROJECTS_REAL =");
    for (const p of P) { assert.equal(p[6], null); assert.equal(p[7], ""); assert.equal(p[8], ""); assert.equal(p[9], ""); assert.equal(p[15], ""); assert.ok((p[14] || []).every(u => !u[1])); assert.ok(p[1]); }
    assert.deepEqual(SPLIT.readJson(r.files["projects.js"], "MIG.LEADS_UNVERIFIED ="), []);
  });
  test("no published row carries its own locked text, and the files still parse", () => {
    const seen = {}, full = SPLIT.readJson(readFileSync(DATA_DIR + "oldtend.js", "utf8"), "window.MIGTEND="), pub = SPLIT.readJson(r.files["oldtend.js"], "window.MIGTEND=");
    full.forEach((t, i) => { const row = JSON.stringify(pub[i]); for (const j of [4, 11, 14, 15]) if (t[j] && String(t[j]).length > 6 && !String(t[3]).includes(t[j])) assert.ok(!row.includes(JSON.stringify(t[j]).slice(1, -1)), "row " + i + " field " + j); void seen; });
    const R = SPLIT.readJson(r.files["real.js"], "window.REAL="), RF = SPLIT.readJson(readFileSync(DATA_DIR + "real.js", "utf8"), "window.REAL=");
    RF.awards.forEach((a, i) => { const row = JSON.stringify(R.awards[i]); for (const k of ["winner_ar", "awarding_entity_ar", "source_url"]) if (a[k] && !a.title_ar.includes(a[k])) assert.ok(!row.includes(JSON.stringify(a[k]).slice(1, -1)), "award " + i + " " + k); });
    const PF = SPLIT.readJson(readFileSync(DATA_DIR + "projects.js", "utf8"), "MIG.PROJECTS_REAL ="), P = SPLIT.readJson(r.files["projects.js"], "MIG.PROJECTS_REAL =");
    PF.forEach((p, i) => { const row = JSON.stringify(P[i]); for (const j of [7, 8, 9, 15]) if (p[j] && String(p[j]).length > 6 && !/^لم يُ?علن$/.test(p[j]) && !p[1].includes(p[j])) assert.ok(!row.includes(JSON.stringify(p[j]).slice(1, -1)), "project " + i + " field " + j); });
    for (const t of Object.values(r.files)) assert.doesNotThrow(() => new Function(t));
  });
  test("the repository's full records are untouched (the daily update keeps writing them: merge.py needs no change)", () => {
    const full = readFileSync(DATA_DIR + "oldtend.js", "utf8");
    assert.ok(SPLIT.readJson(full, "window.MIGTEND=").some(t => t[4] && t[11]), "the repo keeps entity + source");
  });
  test("the Worker bundles the same locked map (items.json L)", () => {
    assert.ok(ITEMS.L && Object.keys(ITEMS.L.t).length > 100 && Object.keys(ITEMS.L.p).length > 10);
  });
});

describe("GET /api/me/opps", () => {
  test("no sign-in → 401; a visitor / an expired plan → 403 plan with the plan that includes it", async () => {
    const env = env0();
    assert.equal((await get(env, "/api/me/opps")).status, 401);
    assert.equal((await get(env, "/api/me/opps", { token: "v2.bad.token.x.y" })).status, 401);
    /* («تسجيل بيانات الشركة فقط» follows the Control Center matrix: m_local 0 in production, 1 in the 0006 seed these tests run on) */
    for (const [id, plan, exp] of [["m-v", "visitor", ""], ["m-x", "basic", "2020-01-01T00:00:00.000Z"]]) {
      const m = await member(env, { id, email: id + "@co.test", plan, plan_expires: exp });
      const r = await get(env, "/api/me/opps", { token: await tokenFor(env, m) });
      assert.equal(r.status, 403, plan); assert.equal(r.data.code, "plan"); assert.equal(r.data.need, "basic"); assert.equal(r.data.sets, undefined);
    }
  });
  test("Basic: Egypt's details; no procurement news, no Gulf tender", async () => {
    const env = env0(), m = await member(env, { id: "m-b", email: "b@co.test", plan: "basic" });
    const r = await get(env, "/api/me/opps", { token: await tokenFor(env, m) });
    assert.equal(r.status, 200); assert.equal(r.data.plan, "basic");
    assert.match(r.headers.get("Cache-Control"), /private/);
    assert.deepEqual(r.data.sets.t, ITEMS.L.t); assert.deepEqual(r.data.sets.p, ITEMS.L.p); assert.ok(r.data.sets.ra);
    assert.ok(r.data.withheld.includes("rn"));
    const gulf = Object.entries(ITEMS.L.ri).filter(([, v]) => v._m === "gulf").map(([k]) => k);
    if (gulf.length) for (const k of gulf) assert.equal(r.data.sets.ri[k], undefined);
    for (const v of Object.values(r.data.sets.ri)) { assert.equal(v._m, undefined); assert.equal(v._c, undefined); }
  });
  test("an e-mailed link session reads (nothing changes); ?sets= picks the sets", async () => {
    const env = env0(), m = await member(env, { id: "m-l", email: "l@co.test", plan: "basic" });
    const r = await get(env, "/api/me/opps?sets=q,t", { token: await tokenFor(env, m, "link") });
    assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.data.sets).sort(), ["q", "t"]);
  });
  test("Premium with its 3 GCC states: those states' tenders and procurement news; staff: everything", async () => {
    const env = env0(), m = await member(env, { id: "m-pr", email: "pr@co.test", plan: "premium", prefs: JSON.stringify({ gcc: ["SA", "AE", "QA"] }) });
    const r = await get(env, "/api/me/opps", { token: await tokenFor(env, m) });
    assert.equal(r.status, 200); assert.ok(!r.data.withheld.includes("rn"));
    for (const [k, v] of Object.entries(ITEMS.L.ri)) {
      if (v._m !== "gulf") continue;
      const cc = /السعود/.test(v._c) ? "SA" : /الإمارات|الامارات/.test(v._c) ? "AE" : /قطر/.test(v._c) ? "QA" : "other";
      assert.equal(!!r.data.sets.ri[k], cc !== "other", v._c);
    }
    const a = await member(env, { id: "m-a", email: "boss@mig.test", plan: "visitor" });
    const s = await get(env, "/api/me/opps", { token: await tokenFor(env, a) });
    assert.equal(s.status, 200); assert.equal(s.data.staff, true); assert.equal(Object.keys(s.data.sets.ri).length, Object.keys(ITEMS.L.ri).length);
  });
  test("the published Control Center edits: their locked fields come back for a member (ov), never in the public overlay", async () => {
    const env = env0(), m = await member(env, { id: "m-ov", email: "ov@co.test", plan: "basic" });
    const live = { ref: "TEN-2026-C900", id: "TEN-2026-C900", type: "مناقصة عامة", title: "توريد محولات", entity: "شركة توزيع الكهرباء", source_url: "https://etenders.gov.eg/Tender/9", gov: "CAI" };
    await env.DB.prepare("INSERT INTO cc_content (id, coll, kind, base_key, state, draft_json, live_json, created_at, updated_at) VALUES ('TEN-2026-C900', 'tend', 'add', '', 'published', '{}', ?, ?, ?)").bind(JSON.stringify(live), NOW, NOW).run();
    const r = await get(env, "/api/me/opps?sets=ov", { token: await tokenFor(env, m) });
    assert.deepEqual(r.data.sets.ov.tend.a["TEN-2026-C900"], { entity: "شركة توزيع الكهرباء", source_url: "https://etenders.gov.eg/Tender/9" });
    const v = await member(env, { id: "m-ov2", email: "ov2@co.test", plan: "visitor" });
    assert.equal((await get(env, "/api/me/opps?sets=ov", { token: await tokenFor(env, v) })).status, 403);
  });
  test("rate limited per member", async () => {
    const env = env0(), m = await member(env, { id: "m-rl", email: "rl@co.test", plan: "basic" }), tk = await tokenFor(env, m);
    for (let i = 0; i < OPPS_PER_HOUR; i++) assert.equal((await get(env, "/api/me/opps?sets=q", { token: tk })).status, 200);
    assert.equal((await get(env, "/api/me/opps?sets=q", { token: tk })).status, 429);
  });
});

describe("the plan rules", () => {
  test("canSee / needPlan", () => {
    const basic = { who: "member", markets: ["local"], procurement: false, m: { plan: "basic" } };
    assert.equal(canSee(basic, "tenders", "local"), true); assert.equal(canSee(basic, "tenders", "gulf", "السعودية"), false);
    assert.equal(canSee(basic, "procurement"), false); assert.equal(canSee({ who: "visitor", markets: [] }, "rfqs"), false);
    assert.equal(needPlan("tenders", "local"), "basic"); assert.equal(needPlan("tenders", "gulf"), "premium"); assert.equal(needPlan("tenders", "africa"), "partner"); assert.equal(needPlan("procurement"), "premium");
    const r = lockResult("tenders", { title: "x", entity: "E", bid_bond_egp: 5, documents_url: "https://x", status: "سارية", governorate: "القاهرة" }, { who: "visitor", markets: [] });
    assert.deepEqual(r, { title: "x", status: "سارية", governorate: "القاهرة", locked: true, need: "basic" });
  });
});

describe("the assistants' tools", () => {
  const q = "/api/janna/lookup?section=tenders&query=" + encodeURIComponent("توريد");
  const noLocked = r => { for (const k of LOCKED_RESULT) assert.equal(r[k], undefined, k); };
  test("Janna's lookup for a visitor: titles / status / place only, members_only + the hint and the register link", async () => {
    const env = env0(), r = await get(env, q);
    assert.equal(r.status, 200); assert.ok(r.data.results.length > 0);
    r.data.results.forEach(noLocked); assert.ok(r.data.results.every(x => x.locked && x.title && x.status));
    assert.equal(r.data.members_only, true); assert.match(r.data.hint, /للأعضاء/); assert.match(r.data.register_url, /\/register\/#basic$/);
    assert.match(r.data.text, /للأعضاء/);
    for (const sec of ["rfqs", "awards", "projects"]) {
      const s = await get(env, "/api/janna/lookup?section=" + sec + "&query=" + encodeURIComponent(sec === "rfqs" ? "توريد" : sec === "awards" ? "عقد" : "مشروع"));
      s.data.results.forEach(noLocked);
    }
  });
  test("a signed-in Basic member (the website's own call) gets the details", async () => {
    const env = env0(), m = await member(env, { id: "m-lb", email: "lb@co.test", plan: "basic" });
    const r = await get(env, q, { token: await tokenFor(env, m) });
    assert.equal(r.data.members_only, undefined); assert.ok(r.data.results.some(x => x.entity)); assert.ok(r.data.results.every(x => !x.locked));
  });
  test("Anam's webhook: a Janna call of a visitor → teaser; a Janna call of a Basic member (its calls-report row) → details; a Bassem call → details", async () => {
    const env = env0(), m = await member(env, { id: "m-call", email: "c@co.test", plan: "basic" });
    const sid1 = "11111111-2222-4333-8444-555555555555", sid2 = "21111111-2222-4333-8444-555555555555", sid3 = "31111111-2222-4333-8444-555555555555";
    await env.DB.prepare("INSERT INTO call_sessions (tag, agent, lang, subject, member_id, staff, app, ctx, created_at) VALUES (?, 'janna', 'ar', '', ?, 0, '', 0, ?)").bind("abcdefghijk2", m.id, NOW).run();
    anamLabel = "madeinegyptgate-janna-ar.zzzzzzzzzzzz";
    let r = await get(env, "/api/janna/lookup", { method: "POST", body: { section: "tenders", query: "توريد" }, headers: { "X-Anam-Session-Id": sid1 } });
    assert.equal(r.data.members_only, true); r.data.results.forEach(noLocked);
    anamLabel = "madeinegyptgate-janna-ar.abcdefghijk2";
    r = await get(env, "/api/janna/lookup", { method: "POST", body: { section: "tenders", query: "توريد" }, headers: { "X-Anam-Session-Id": sid2 } });
    assert.equal(r.data.members_only, undefined); assert.ok(r.data.results.some(x => x.entity));
    const n = anamCalls;
    await get(env, "/api/janna/lookup", { method: "POST", body: { section: "tenders", query: "توريد" }, headers: { "X-Anam-Session-Id": sid2 } });
    assert.equal(anamCalls, n, "one Anam read per session (memo)");
    anamLabel = "madeinegyptgate-bassem-ar";
    r = await get(env, "/api/janna/lookup", { method: "POST", body: { section: "awards", query: "عقد" }, headers: { "X-Anam-Session-Id": sid3 } });
    assert.equal(r.data.members_only, undefined);
  });
  test("a forged label is impossible: an unknown session (Anam 404) or a bad id is a visitor", async () => {
    const env = env0();
    let r = await get(env, q, { headers: { "X-Anam-Session-Id": "41111111-2222-4333-8444-555555555555" } });
    assert.equal(r.data.members_only, true);
    r = await get(env, q, { headers: { "X-Anam-Session-Id": "not-a-uuid" } });
    assert.equal(r.data.members_only, true); assert.equal(anamCalls, 1);
  });
  test("platform_item (/api/janna/item): a visitor gets the teaser and the hint, a member the record", async () => {
    const env = env0(), id = ITEMS.t.find(t => t.entity && t.market === "local").id;
    const v = await get(env, "/api/janna/item?section=tenders&id=" + encodeURIComponent(id));
    assert.equal(v.status, 200); assert.equal(v.data.locked, true); noLocked(v.data); assert.match(v.data.text, /للأعضاء/); assert.equal(v.data.need, "basic");
    const m = await member(env, { id: "m-it", email: "it@co.test", plan: "basic" });
    const f = await get(env, "/api/janna/item?section=tenders&id=" + encodeURIComponent(id), { token: await tokenFor(env, m) });
    assert.equal(f.data.locked, undefined); assert.ok(f.data.entity);
    const pj = ITEMS.j.find(p => p.owner);
    const pv = await get(env, "/api/janna/item?section=projects&id=" + encodeURIComponent(pj.id));
    assert.equal(pv.data.owner, undefined); assert.equal(pv.data.locked, true);
    const fac = await get(env, "/api/janna/item?section=events&id=ev1");
    assert.equal(fac.data.locked, undefined, "events stay public");
  });
});
