// The owner's plan matrix of 2026-11-18 in the Worker (DESIGN «Plan-matrix alignment» §2.10, §3): Premium = Egypt + the 3 GCC states the
// member picks; Core Partner / Strategic = all six; procurement news from Premium; the profile plan opens nothing.
// Units (parsers, coverage, matching, digests) + the real index.js (ccBoot + dispatch) and the real Control Center modules for the paths that
// set or check the member's choice: signup, activation, «باقتي» invoices, /api/me/gcc, the Control Center and the data desk.
// No network: Resend is mocked; any other URL fails the test.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { CC } from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import * as PAY from "../src/payments.js";
import * as PL from "../src/acc-plans.js";
import * as C from "../src/common.js";
import { rank, inquiryMarket, inquiryCountry } from "../src/matching.js";
import { inScope, newCountFor, dailyJobs, resolveItem } from "../src/digest.js";
import vm from "node:vm";

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const SITE = "https://madeinegyptgate.com", OWNER = "owner@mig.test", DAY = 86400000, G3 = ["SA", "AE", "QA"];
let sent, realFetch, realWarn;
beforeEach(() => {
  realFetch = globalThis.fetch; realWarn = console.warn; console.warn = () => {};
  sent = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text }); return new Response(JSON.stringify({ id: "re_" + sent.length }), { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });
/* the code defaults (no matrix rows): what a database without cc_plans gets */
const defaults = async () => { const bare = { DB: new D1() }; bare.DB.db.exec("DROP TABLE IF EXISTS cc_plans"); await PL.bootPlans(bare, { force: true }); };

function mkEnv(extra = {}) {
  const DB = new D1(); DB.db.exec(MIG);
  return { DB, AUTH_SECRET: "a".repeat(40), CONFIG_SECRET: "c".repeat(40), RESEND_API_KEY: "re_test_key_123456", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: OWNER, ...extra };
}
let seq = 0;
async function mkMember(env, email, o = {}) {
  const id = "g" + String(++seq).padStart(8, "0"), t = C.now();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, plan_expires, email_verified_at, name, phone, sector, products, prefs_json) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'Ahmed', '01001234567', ?, ?, ?)")
    .bind(id, o.company || "Co " + id, email, o.plan || "visitor", t, t, o.expires || "", t, o.sector || "", o.products || "", JSON.stringify(o.prefs || {})).run();
  if (o.staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_at, updated_at) VALUES (?, ?, 'x', 'x')").bind(id, o.staff).run();
  return getM(env, id);
}
const getM = (env, id) => env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
const prefs = async (env, id) => JSON.parse((await getM(env, id)).prefs_json || "{}");
const tok = async (env, m) => (await issueSession(env, m)).token;
let ipn = 0;
async function api(env, method, path, { token, body, ip } = {}) {
  const h = { "CF-Connecting-IP": ip || "198.51.100." + (1 + (ipn++ % 250)), "User-Agent": "Mozilla/5.0 test" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const p = [], ctx = { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); } };
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  while (p.length) await p.shift();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const signup = (env, email, plan, payload = {}, token) => api(env, "POST", "/api/inquiries", { token, body: { kind: "signup", target_type: "plan", target_id: plan, target_name: plan, name: "Ahmed Ali", company: "Co", email, phone: "01001234567", message: "apply " + plan, payload: { plan, company: "Co", terms: true, ...payload } } });
const markPaid = (env, token, no) => api(env, "POST", `/api/admin/cc/pay/invoices/${no}/mark-paid`, { token, body: { manual_ref: "INSTAPAY-REF-1", confirm: no } });
const auditOf = async (env, action) => (await env.DB.prepare("SELECT * FROM cc_audit WHERE action = ? ORDER BY id").bind(action).all()).results.map(r => ({ ...r, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));

/* ================================================================== parsers and coverage */
describe("GCC codes, the member's coverage", () => {
  test("gccCode / normGcc / gulfCountry: names and codes; «عمّان» (Amman) is never Oman; the UK is not Saudi Arabia", () => {
    assert.deepEqual(["السعودية", "KSA", "عُمان", "سلطنة عمان", "AE", "الإمارات العربية المتحدة", "أبو ظبي", "الدوحة", "Bahrain", "Omani"].map(C.gccCode), ["SA", "SA", "OM", "OM", "AE", "AE", "AE", "QA", "BH", "OM"]);
    assert.deepEqual(["عمّان", "Amman", "عمان - الأردن", "المملكة المتحدة", "Romania", "مصر", ""].map(C.gccCode), ["", "", "", "", "", "", ""]);
    assert.deepEqual(C.normGcc("السعودية والإمارات وقطر"), ["SA", "AE", "QA"]);
    assert.deepEqual(C.normGcc(["QA", "sa", "QA", "x", "OM", "Kuwait"]), ["QA", "SA", "OM", "KW"], "dedupe, order kept, unknown dropped");
    assert.deepEqual(C.normGcc("SA,AE ; BH|KW، OM"), ["SA", "AE", "BH", "KW", "OM"]);
    assert.deepEqual([C.normGcc(null), C.normGcc(""), C.normGcc({})], [[], [], []]);
    assert.deepEqual(["SA", "ARAB", "الأردن", "العراق", "عمّان", "اليمن", "Lebanese", "المغرب", ""].map(C.gulfCountry), ["SA", "ARAB", "ARAB", "ARAB", "ARAB", "ARAB", "ARAB", "", ""]);
  });
  test("gccOf / gulfCovers per plan: profile and basic have no Gulf; premium pending (today's members) = all six; premium chosen = its 3; partner / strategic = all six", async () => {
    await defaults();
    const M = (plan, gcc) => ({ id: "x", plan, plan_expires: "", prefs_json: JSON.stringify(gcc ? { gcc } : {}) });
    assert.deepEqual(C.gccOf(M("profile")), { pick: 0, all: false, chosen: [], pending: false, covers: [] });
    assert.deepEqual(C.gccOf(M("basic", G3)), { pick: 0, all: false, chosen: [], pending: false, covers: [] });
    assert.deepEqual(C.gccOf(M("premium")), { pick: 3, all: false, chosen: [], pending: true, covers: C.GCC });
    assert.deepEqual(C.gccOf(M("premium", ["SA", "AE"])), { pick: 3, all: false, chosen: [], pending: true, covers: C.GCC }, "a wrong count = not chosen");
    assert.deepEqual(C.gccOf(M("premium", ["sa", "AE", "Qatar"])), { pick: 3, all: false, chosen: G3, pending: false, covers: G3 });
    assert.deepEqual(C.gccOf(M("partner", ["SA"])), { pick: 0, all: true, chosen: [], pending: false, covers: C.GCC }, "a stored list is unused on a plan with all six");
    assert.deepEqual(C.gccOf({ ...M("premium", G3), plan_expires: "2001-01-01T00:00:00.000Z" }).covers, [], "expired = visitor");
    const p = M("premium", ["SA", "AE", "KW"]), pend = M("premium"), part = M("partner"), basic = M("basic");
    assert.deepEqual(["SA", "QA", "ARAB", ""].map(cc => C.gulfCovers(p, cc)), [true, false, true, false]);
    assert.deepEqual(["SA", "QA", "ARAB", ""].map(cc => C.gulfCovers(pend, cc)), [true, true, true, true]);
    assert.deepEqual(["SA", "QA", "ARAB", ""].map(cc => C.gulfCovers(part, cc)), [true, true, true, true]);
    assert.deepEqual(["SA", "ARAB", ""].map(cc => C.gulfCovers(basic, cc)), [false, false, false]);
    // userOut: the shape every sign-in / GET /api/me / Control Center row carries; the choice is not a pref
    const u = C.userOut({}, { ...p, email: "p@x.test", created_at: "x" });
    assert.deepEqual(u.gcc, { pick: 3, all: false, chosen: ["SA", "AE", "KW"], pending: false }); assert.deepEqual(u.markets, ["local", "gulf"]);
    assert.ok(!("gcc" in u.prefs) && !("gcc_src" in u.prefs));
    assert.deepEqual(C.userOut({}, { ...M("profile"), email: "f@x.test" }).markets, [], "the profile plan opens no market");
    // capabilities: alerts from basic, procurement news from premium
    assert.deepEqual(["profile", "basic", "premium", "partner"].map(k => [C.planCan({ plan: k }, "alerts"), C.planCan({ plan: k }, "procurement")]), [[false, false], [true, false], [true, true], [true, true]]);
  });
});

/* ================================================================== matching and digests */
describe("country-aware routing and digests", () => {
  const F = (id, plan, gcc, extra = {}) => ({ id, plan, sector: "الصناعات البلاستيكية", products: "براميل بلاستيك", governorate: "", verified: 1, email: id + "@f.test", company: "F " + id, inbox_paused: 0, plan_expires: "", created_at: "2026-01-01", prefs_json: JSON.stringify(gcc ? { gcc } : {}), ...extra });
  test("inquiryMarket / inquiryCountry: North Africa is Africa, other Arab countries stay with the Gulf plans, GCC by state", () => {
    assert.deepEqual(["المغرب", "Libya", "السودان", "تونس", "Algeria", "Mauritania"].map(c => inquiryMarket({ country: c })), ["africa", "africa", "africa", "africa", "africa", "africa"]);
    assert.deepEqual(["الأردن", "قطر", "SA", "ARAB", "الخليج", "Saudi Arabia", "United Arab Emirates"].map(c => inquiryMarket({ country: c })), ["gulf", "gulf", "gulf", "gulf", "gulf", "gulf", "gulf"]);
    assert.deepEqual(["مصر", "", "Romania"].map(c => inquiryMarket({ country: c })), ["local", "local", "local"]);
    assert.equal(inquiryMarket({ market: "gulf", country: "المغرب" }), "gulf", "an explicit market wins");
    assert.deepEqual(["QA", "قطر", "الأردن", "ARAB", "", "المغرب"].map(c => inquiryCountry({ country: c })), ["QA", "QA", "ARAB", "ARAB", "", ""]);
    assert.equal(inquiryCountry({ buyer_country: "Kuwait" }), "KW");
  });
  test("rank(): premium [SA, AE, KW] gets a Saudi request but not a Qatari one; a premium who has not chosen and the partner get both; another Arab country reaches every Gulf plan; an unknown Gulf country only all-six / pending", async () => {
    await defaults();
    const pool = [F("p3", "premium", ["SA", "AE", "KW"]), F("pp", "premium"), F("pa", "partner"), F("bs", "basic")];
    const ids = country => rank({ message: "براميل بلاستيكية", sector: "الصناعات البلاستيكية", market: "gulf", payload: { country } }, pool).map(x => x.member.id).sort();
    assert.deepEqual(ids("SA"), ["pa", "pp", "p3"].sort());
    assert.deepEqual(ids("QA"), ["pa", "pp"].sort());
    assert.deepEqual(ids("الأردن"), ["pa", "pp", "p3"].sort());
    assert.deepEqual(ids(""), ["pa", "pp"].sort());
    // without a country in the payload (platform.test: market only) the not-yet-chosen premium still receives — today's behaviour
    assert.deepEqual(rank({ message: "براميل بلاستيك", market: "gulf" }, [F("pp", "premium")]).map(x => x.member.id), ["pp"]);
    // Egypt is unchanged for everyone with the local market
    assert.deepEqual(rank({ message: "براميل بلاستيك", market: "local" }, pool).map(x => x.member.id).sort(), ["bs", "pa", "pp", "p3"].sort());
  });
  test("digest scope: a Bahrain tender reaches premium [BH, …] and the partner, not premium [SA, AE, KW]; procurement news only from premium; the profile plan gets nothing", async () => {
    await defaults();
    const bh = { kind: "tender", market: "gulf", gov: "البحرين", sector: "الكهرباء والكابلات", title: "x" }, eg = { kind: "tender", market: "local", gov: "القاهرة", sector: "x", title: "y" };
    const proc = { kind: "news", market: "local", gov: "", sector: "أخبار المشتريات", title: "z" }, news = { kind: "news", market: "local", gov: "", sector: "صناعة", title: "w" };
    const p3 = F("p3", "premium", ["SA", "AE", "KW"]), pbh = F("pb", "premium", ["BH", "SA", "AE"]), pp = F("pp", "premium"), pa = F("pa", "partner"), bs = F("bs", "basic"), pr = F("pr", "profile");
    assert.deepEqual([p3, pbh, pp, pa, bs].map(m => inScope(m, bh)), [false, true, true, true, false]);
    assert.deepEqual([bs, p3, pa].map(m => inScope(m, proc)), [false, true, true]);
    assert.deepEqual([bs, p3].map(m => inScope(m, news)), [true, true]);
    assert.deepEqual([pr, bs].map(m => [inScope(m, eg), inScope(m, news)]), [[false, false], [true, true]]);
    assert.deepEqual(inScope(p3, { kind: "tender", market: "gulf", gov: "العراق" }), true, "another Arab country: every Gulf plan (Q1)");
    const env = mkEnv(); assert.deepEqual(await newCountFor(env, p3), { count: 0, top: "" }); // the morning count uses the same scope (no new items here)
  });
});

/* ================================================================== the paths that set or check the choice */
describe("Premium's 3 GCC states end to end", () => {
  test("signup: Premium without exactly 3 states → 400 gcc_required; with 3 → 201, stored normalised; other plans drop them", async () => {
    const env = mkEnv();
    let r = await signup(env, "a@new.test", "premium");
    assert.deepEqual([r.status, r.data.code, r.data.pick, r.data.allowed], [400, "gcc_required", 3, C.GCC]);
    assert.match(r.data.error, /اختار 3 دول خليجية بالظبط/);
    assert.equal((await signup(env, "a@new.test", "premium", { gcc: ["SA", "AE"] })).data.code, "gcc_required");
    assert.equal((await signup(env, "a@new.test", "premium", { gcc: ["SA", "AE", "QA", "KW"] })).data.code, "gcc_required", "exactly 3");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries").first("n"), 0, "nothing stored for a refused signup");
    r = await signup(env, "a@new.test", "premium", { gcc: "السعودية، الإمارات، قطر" });
    assert.equal(r.status, 201, r.text);
    const q = await env.DB.prepare("SELECT payload_json FROM inquiries WHERE ref = ?").bind(r.data.ref).first();
    assert.deepEqual(JSON.parse(q.payload_json).gcc, G3);
    r = await signup(env, "b@new.test", "basic", { gcc: G3 });
    assert.equal(r.status, 201);
    assert.equal(JSON.parse((await env.DB.prepare("SELECT payload_json FROM inquiries WHERE ref = ?").bind(r.data.ref).first()).payload_json).gcc, undefined);
  });
  test("activation: the signup's states become the member's (src signup); an invoice without them activates Premium «pending» + a bell to choose", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    let r = await signup(env, "fac@new.test", "premium", { gcc: ["QA", "OM", "BH"] });
    assert.equal(r.status, 201, r.text);
    const inv = await env.DB.prepare("SELECT * FROM cc_invoices WHERE email = 'fac@new.test'").first();
    assert.equal(inv.plan, "premium");
    assert.equal((await markPaid(env, ot, inv.no)).status, 200);
    const m = await env.DB.prepare("SELECT * FROM members WHERE email = 'fac@new.test'").first(), p = JSON.parse(m.prefs_json);
    assert.deepEqual([m.plan, p.gcc, p.gcc_src], ["premium", ["QA", "OM", "BH"], "signup"]);
    assert.deepEqual(C.gccOf(m), { pick: 3, all: false, chosen: ["QA", "OM", "BH"], pending: false, covers: ["QA", "OM", "BH"] });
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'plan'").bind(m.id).first("n"), 0);
    assert.ok((await auditOf(env, "member.plan")).some(a => a.after && JSON.stringify(a.after.gcc) === JSON.stringify(["QA", "OM", "BH"])));
    // an invoice the team issued (no signup payload): Premium activates, all six for now, and the member is asked to choose
    const old = await mkMember(env, "old@co.test");
    const { invoice } = await PAY.issueInvoice(env, { member_id: old.id, email: old.email, company: old.company, plan: "premium", source: "admin", by: "test" }, CC);
    assert.equal((await markPaid(env, ot, invoice.no)).status, 200);
    const o = await getM(env, old.id);
    assert.deepEqual([o.plan, C.gccOf(o).pending], ["premium", true]);
    const bell = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? AND kind = 'plan'").bind(old.id).first();
    assert.deepEqual([bell.title, bell.url, bell.title_en], ["اختار دولك الخليجية التلاتة", "dashboard.html#plan", "Choose your 3 Gulf states"]);
    assert.match(bell.body, /لحد ما تختار، بتوصلك فرص كل دول الخليج مؤقتاً/);
  });
  test("POST /api/me/gcc: only while not chosen (exactly 3, else 422); then 409 gcc_locked; GET shows the state; plans without a pick → 409; prefs keep the choice", async () => {
    const env = mkEnv(), m = await mkMember(env, "prem@f.test", { plan: "premium", expires: new Date(Date.now() + 200 * DAY).toISOString() }), t = await tok(env, m);
    let r = await api(env, "GET", "/api/me/gcc", { token: t });
    assert.deepEqual([r.status, r.data.gcc.pending, r.data.gcc.pick, r.data.allowed], [200, true, 3, C.GCC]);
    assert.deepEqual((await api(env, "GET", "/api/me", { token: t })).data.user.gcc, { pick: 3, all: false, chosen: [], pending: true });
    r = await api(env, "POST", "/api/me/gcc", { token: t, body: { gcc: ["SA", "AE"] } });
    assert.deepEqual([r.status, r.data.code, r.data.pick], [422, "gcc_required", 3]);
    r = await api(env, "POST", "/api/me/gcc", { token: t, body: { gcc: ["KW", "QA", "BH"] } });
    assert.equal(r.status, 200, r.text); assert.deepEqual([r.data.gcc.chosen, r.data.gcc.pending], [["KW", "QA", "BH"], false]);
    const p = await prefs(env, m.id); assert.deepEqual([p.gcc, p.gcc_src], [["KW", "QA", "BH"], "member"]); assert.ok(p.gcc_at);
    const a = (await auditOf(env, "member.gcc")).pop(); assert.deepEqual([a.before.gcc, a.after.gcc, a.after.src, a.actor_role], [[], ["KW", "QA", "BH"], "member", "member"]);
    r = await api(env, "POST", "/api/me/gcc", { token: t, body: { gcc: G3 } });
    assert.deepEqual([r.status, r.data.code], [409, "gcc_locked"]); assert.match(r.data.error, /كلّم فريق المنصة/);
    // the prefs endpoint never drops (nor writes) the choice
    r = await api(env, "POST", "/api/me/prefs", { token: t, body: { morning_time: "08:30", gcc: ["OM"] } });
    assert.equal(r.status, 200, r.text); assert.equal(r.data.prefs.gcc, undefined);
    assert.deepEqual([(await prefs(env, m.id)).gcc, (await prefs(env, m.id)).morning_time], [["KW", "QA", "BH"], "08:30"]);
    for (const plan of ["basic", "partner"]) {
      const o = await mkMember(env, plan + "@f.test", { plan }), ot = await tok(env, o);
      const x = await api(env, "POST", "/api/me/gcc", { token: ot, body: { gcc: G3 } });
      assert.deepEqual([x.status, x.data.code, x.data.reason], [409, "gcc_locked", "no_pick"], plan);
    }
  });
  test("«باقتي» invoices: an upgrade INTO Premium needs exactly 3 (422 gcc_required), they wait for that invoice (applied when it is paid); a renewal never needs them", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner), m = await mkMember(env, "up@f.test", { plan: "basic", expires: new Date(Date.now() + 100 * DAY).toISOString() }), t = await tok(env, m);
    let r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium" } });
    assert.deepEqual([r.status, r.data.code, r.data.pick], [422, "gcc_required", 3]);
    assert.equal((await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", gcc: ["SA", "AE"] } })).data.code, "gcc_required");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices").first("n"), 0, "nothing issued");
    r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", gcc: ["AE", "KW", "OM"] } });
    assert.equal(r.status, 201, r.text);
    // review M-1: nothing changes before the payment — the Basic plan in force keeps its (empty) states; the choice waits for THIS invoice
    const inv = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ?").bind(m.id).first(), p0 = await prefs(env, m.id);
    assert.deepEqual([p0.gcc, p0.gcc_next && p0.gcc_next.gcc, p0.gcc_next && p0.gcc_next.inv, r.data.gcc_next, r.data.gcc], [undefined, ["AE", "KW", "OM"], inv.no, ["AE", "KW", "OM"], undefined]);
    assert.deepEqual((await api(env, "GET", "/api/me", { token: t })).data.user.gcc, { pick: 0, all: false, chosen: [], pending: false, next: { gcc: ["AE", "KW", "OM"], inv: inv.no } });
    assert.equal((await api(env, "GET", "/api/me/prefs", { token: t })).data.prefs.gcc_next, undefined, "not a pref");
    assert.equal((await markPaid(env, ot, inv.no)).status, 200);
    const p1 = await prefs(env, m.id), m1 = await getM(env, m.id);
    assert.deepEqual([m1.plan, p1.gcc, p1.gcc_src, p1.gcc_next], ["premium", ["AE", "KW", "OM"], "member", undefined], "applied with the paid invoice");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'plan'").bind(m.id).first("n"), 0, "no «choose» bell: they are chosen");
    // partner: no states; a pending Premium renewal without states is not blocked (today's members); with states while pending they are stored
    const pa = await mkMember(env, "pa@f.test", { plan: "basic" });
    assert.equal((await api(env, "POST", "/api/me/invoices", { token: await tok(env, pa), body: { plan: "partner" } })).status, 201);
    const pr = await mkMember(env, "pr@f.test", { plan: "premium", expires: new Date(Date.now() + 20 * DAY).toISOString() }), prt = await tok(env, pr);
    r = await api(env, "POST", "/api/me/invoices", { token: prt, body: { plan: "premium" } });
    assert.equal(r.status, 201, r.text); assert.equal((await env.DB.prepare("SELECT source FROM cc_invoices WHERE member_id = ?").bind(pr.id).first("source")), "renewal");
    assert.equal((await prefs(env, pr.id)).gcc, undefined);
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE member_id = ?").bind(pr.id).run();
    r = await api(env, "POST", "/api/me/invoices", { token: prt, body: { plan: "premium", gcc: ["SA", "QA", "BH"] } });
    assert.equal(r.status, 201, r.text); assert.deepEqual((await prefs(env, pr.id)).gcc, ["SA", "QA", "BH"]);
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE member_id = ?").bind(pr.id).run();
    r = await api(env, "POST", "/api/me/invoices", { token: prt, body: { plan: "premium", gcc: ["OM", "KW", "AE"] } });
    assert.equal(r.status, 201); assert.deepEqual((await prefs(env, pr.id)).gcc, ["SA", "QA", "BH"], "a renewal never changes a stored choice (the team does, Q2)");
  });
  test("Control Center: set-plan / create to Premium need the states (422) unless stored; POST /members/:id/gcc stores them any time (members.plan), audited, rematched; the CSV shows them", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner), sup = await mkMember(env, "sup@mig.test", { staff: "support" }), st = await tok(env, sup);
    const f = await mkMember(env, "plast@fac.test", { sector: "الصناعات البلاستيكية", products: "براميل بلاستيك" });
    let r = await api(env, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2027-12-31" } });
    assert.deepEqual([r.status, r.data.code, r.data.pick], [422, "gcc_required", 3]);
    r = await api(env, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2027-12-31", gcc: ["SA", "AE", "KW"] } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.member.plan, r.data.member.gcc, r.data.member.gcc_src, r.data.member.gcc_stored], ["premium", { pick: 3, all: false, chosen: ["SA", "AE", "KW"], pending: false }, "admin", ["SA", "AE", "KW"]]);
    const pa = (await auditOf(env, "member.plan")).pop(); assert.deepEqual([pa.before.gcc, pa.after.gcc], [[], ["SA", "AE", "KW"]]);
    r = await api(env, "POST", `/api/admin/cc/members/${f.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2028-01-31" } });
    assert.equal(r.status, 200, "the stored choice is enough"); assert.deepEqual((await prefs(env, f.id)).gcc, ["SA", "AE", "KW"]);
    // a Qatari request: not in his states → in_progress; the team switches him to [QA, SA, AE] → it reaches him automatically
    const q = await api(env, "POST", "/api/inquiries", { body: { kind: "rfq", name: "Buyer", company: "Q Co", email: "buyer@q.test", phone: "+974 5555 1234", message: "محتاجين براميل بلاستيك", payload: { product: "براميل بلاستيك", sector: "الصناعات البلاستيكية", market: "gulf", country: "QA", quantity: "500" } } });
    assert.equal(q.data.status, "in_progress", q.text);
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${f.id}/gcc`, { token: st, body: { gcc: ["QA", "SA", "AE"] } })).status, 403, "support has no members.plan");
    assert.equal((await api(env, "POST", `/api/admin/cc/members/${f.id}/gcc`, { token: ot, body: { gcc: ["QA"] } })).data.code, "gcc_required");
    r = await api(env, "POST", `/api/admin/cc/members/${f.id}/gcc`, { token: ot, body: { gcc: ["QA", "SA", "AE"] } });
    assert.equal(r.status, 200, r.text); assert.deepEqual([r.data.member.gcc.chosen, r.data.rematched], [["QA", "SA", "AE"], 1]);
    assert.deepEqual((await env.DB.prepare("SELECT status, routed_count FROM inquiries WHERE ref = ?").bind(q.data.ref).first()), { status: "routed", routed_count: 1 });
    const ga = (await auditOf(env, "member.gcc")).pop(); assert.deepEqual([ga.before.gcc, ga.after.gcc, ga.after.src, ga.actor_email], [["SA", "AE", "KW"], ["QA", "SA", "AE"], "admin", OWNER]);
    // create with a Premium plan
    assert.equal((await api(env, "POST", "/api/admin/cc/members", { token: ot, body: { email: "c@new.test", company: "C", plan: "premium" } })).data.code, "gcc_required");
    r = await api(env, "POST", "/api/admin/cc/members", { token: ot, body: { email: "c@new.test", company: "C", plan: "premium", gcc: "KW,BH,OM" } });
    assert.equal(r.status, 201, r.text); assert.deepEqual(r.data.member.gcc.chosen, ["KW", "BH", "OM"]);
    const pend = await mkMember(env, "pend@f.test", { plan: "premium" });
    const csv = (await api(env, "GET", "/api/admin/cc/members.csv", { token: ot })).text, head = csv.split("\n")[0];
    assert.ok(head.includes('"gcc","gcc_pending"'), head);
    assert.ok(csv.split("\n").some(l => l.includes(f.id) && l.includes('"QA|SA|AE","0"')));
    assert.ok(csv.split("\n").some(l => l.includes(pend.id) && l.includes('"","1"')));
  });
  test("data desk: a Premium client needs 3 states (422), stored on the new member (src desk); the invoice follows as before", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const body = { company: "مصنع الخليج", contact_name: "منى حسن", email: "desk@client.test", phone: "01001234567", sector: "الصناعات الغذائية", governorate: "GIZ", requested_plan: "premium" };
    let r = await api(env, "POST", "/api/team/desk/member", { token: ot, body });
    assert.deepEqual([r.status, r.data.code], [422, "gcc_required"]);
    r = await api(env, "POST", "/api/team/desk/member", { token: ot, body: { ...body, gcc: ["SA", "KW", "OM"] } });
    assert.equal(r.status, 201, r.text); assert.deepEqual(r.data.gcc, ["SA", "KW", "OM"]);
    const p = await prefs(env, r.data.member_id); assert.deepEqual([p.gcc, p.gcc_src], [["SA", "KW", "OM"], "desk"]);
    assert.ok(r.data.invoice && r.data.invoice.no, JSON.stringify(r.data.invoice));
    r = await api(env, "POST", "/api/team/desk/member", { token: ot, body: { ...body, email: "desk2@client.test", requested_plan: "basic", gcc: ["SA"] } });
    assert.equal(r.status, 201, r.text); assert.equal(r.data.gcc, undefined); assert.equal((await prefs(env, r.data.member_id)).gcc, undefined);
  });
});

/* ================================================================== review round (2026-11-19): fixes M-1, M-3, R-3, R-6 */
describe("review fixes: whose states apply, reminders in scope, editing today's Premium members, one parser", () => {
  test("M-1: a «باقتي» choice waits for its own invoice — a cancelled one changes nothing, the registration form he pays for wins; a lapsed Premium re-buying uses the new states", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const m = await mkMember(env, "basic2@f.test", { plan: "basic", expires: new Date(Date.now() + 100 * DAY).toISOString() }), t = await tok(env, m);
    let r = await api(env, "POST", "/api/me/invoices", { token: t, body: { plan: "premium", gcc: ["SA", "AE", "QA"] } });
    assert.equal(r.status, 201, r.text);
    await env.DB.prepare("UPDATE cc_invoices SET status = 'void' WHERE member_id = ?").bind(m.id).run(); // he changed his mind
    assert.equal((await prefs(env, m.id)).gcc, undefined, "an unpaid invoice never sets the states");
    r = await signup(env, "basic2@f.test", "premium", { gcc: ["KW", "BH", "OM"] }, t);
    assert.equal(r.status, 201, r.text);
    const inv = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ? AND status = 'open'").bind(m.id).first();
    assert.ok(inv && inv.inquiry_ref, "the signup issued its invoice");
    assert.equal((await markPaid(env, ot, inv.no)).status, 200);
    let a = await getM(env, m.id), p = JSON.parse(a.prefs_json);
    assert.deepEqual([a.plan, C.gccOf(a).chosen, p.gcc_src, p.gcc_next], ["premium", ["KW", "BH", "OM"], "signup", undefined], "the states of the form he paid for; the stale «باقتي» choice is dropped");
    // a Premium member whose plan ended (stored [SA, AE, QA]) re-buys Premium with other states: the purchase decides
    const lap = await mkMember(env, "lapsed@f.test", { plan: "premium", expires: new Date(Date.now() - 5 * DAY).toISOString(), prefs: { gcc: ["SA", "AE", "QA"], gcc_src: "signup" } }), lt = await tok(env, lap);
    assert.equal((await api(env, "POST", "/api/me/invoices", { token: lt, body: { plan: "premium" } })).data.code, "gcc_required", "a lapsed plan is a new purchase: the states are asked again");
    r = await api(env, "POST", "/api/me/invoices", { token: lt, body: { plan: "premium", gcc: ["OM", "KW", "BH"] } });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual((await prefs(env, lap.id)).gcc, ["SA", "AE", "QA"], "unchanged until paid");
    const li = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ? AND status = 'open'").bind(lap.id).first();
    assert.equal((await markPaid(env, ot, li.no)).status, 200);
    a = await getM(env, lap.id);
    assert.deepEqual([effPlanOf(a), C.gccOf(a).chosen], ["premium", ["OM", "KW", "BH"]]);
  });
  test("M-1: an in-force Premium renewing through /register/ with other states keeps his states (the team changes them, Q2) — and is told so", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const m = await mkMember(env, "renew@f.test", { plan: "premium", expires: new Date(Date.now() + 20 * DAY).toISOString(), prefs: { gcc: ["SA", "AE", "QA"], gcc_src: "signup" } }), t = await tok(env, m);
    const r = await signup(env, "renew@f.test", "premium", { gcc: ["KW", "BH", "OM"] }, t);
    assert.equal(r.status, 201, r.text);
    const inv = await env.DB.prepare("SELECT * FROM cc_invoices WHERE email = 'renew@f.test' AND status = 'open'").first();
    assert.equal((await markPaid(env, ot, inv.no)).status, 200);
    const a = await getM(env, m.id);
    assert.deepEqual(C.gccOf(a).chosen, ["SA", "AE", "QA"]);
    const bell = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? AND kind = 'plan' AND ref = ?").bind(m.id, "gcc-kept:" + inv.no).first();
    assert.ok(bell, "the member is told");
    assert.equal(bell.title, "دولك الخليجية فضلت زي ما هي");
    assert.match(bell.body, /السعودية، الإمارات، قطر/); assert.match(bell.body, /الكويت، البحرين، عُمان/); assert.match(bell.body, /كلّم فريق المنصة/);
    assert.match(bell.body_en, /Saudi Arabia, UAE, Qatar/);
    // the same states again → no such bell
    const m2 = await mkMember(env, "same@f.test", { plan: "premium", expires: new Date(Date.now() + 20 * DAY).toISOString(), prefs: { gcc: ["SA", "AE", "QA"] } }), t2 = await tok(env, m2);
    await signup(env, "same@f.test", "premium", { gcc: ["QA", "SA", "AE"].sort() && ["SA", "AE", "QA"] }, t2);
    const inv2 = await env.DB.prepare("SELECT * FROM cc_invoices WHERE email = 'same@f.test' AND status = 'open'").first();
    assert.equal((await markPaid(env, ot, inv2.no)).status, 200);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'plan'").bind(m2.id).first("n"), 0);
  });
  test("M-3: deadline reminders follow the plan scope — a Bahrain tender only for the partner and premium [BH, …]; an Asian / African item outside the plan never", async () => {
    const until = new Date(Date.UTC(2027, 5, 30)).toISOString();
    const run = async (rows, ref, nowIso) => {
      const env = mkEnv(); await defaults();
      const ms = [];
      for (const [email, plan, pr] of rows) { const m = await mkMember(env, email, { plan, expires: until, prefs: { ...(pr || {}), email_digest: true } }); ms.push(m);
        await env.DB.prepare("INSERT INTO follows (user_id, kind, ref_id, label, url, created_at, item_id) VALUES (?, 'tender', ?, ?, '', ?, '')").bind(m.id, ref, ref, C.now()).run(); }
      await dailyJobs(env, Date.parse(nowIso));
      const out = {};
      for (const m of ms) out[m.email] = (await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'deadline'").bind(m.id).first("n"));
      return out;
    };
    const it = resolveItem("tender", "IN48");
    assert.deepEqual([it && it.gov, it && it.market, it && it.deadline], ["البحرين", "gulf", "2026-12-27"]);
    assert.deepEqual(await run([["p-sa@f.test", "premium", { gcc: ["SA", "AE", "QA"] }], ["b@f.test", "basic"], ["pa@f.test", "partner"], ["p-bh@f.test", "premium", { gcc: ["BH", "SA", "AE"] }], ["p-pend@f.test", "premium"]], "IN48", "2026-12-20T06:00:00.000Z"),
      { "p-sa@f.test": 0, "b@f.test": 0, "pa@f.test": 1, "p-bh@f.test": 1, "p-pend@f.test": 1 });
    assert.deepEqual(await run([["pa2@f.test", "partner"], ["st@f.test", "strategic"]], "IN17", "2026-11-26T06:00:00.000Z"), { "pa2@f.test": 0, "st@f.test": 1 }, "Pakistan (Asia): strategic only");
    assert.deepEqual(await run([["p3@f.test", "premium", { gcc: ["SA", "AE", "QA"] }], ["pa3@f.test", "partner"]], "IN2", "2026-12-08T06:00:00.000Z"), { "p3@f.test": 0, "pa3@f.test": 1 }, "Mozambique (Africa): partner and up");
    // an Egyptian tender still reminds every plan with alerts
    const eg = C.items ? null : null; void eg;
  });
  test("R-3: the Control Center can change the end date of a Premium member who has not chosen yet without forcing a choice; moving INTO Premium still needs the states", async () => {
    const env = mkEnv(), owner = await mkMember(env, OWNER), ot = await tok(env, owner);
    const pp = await mkMember(env, "pp@f.test", { plan: "premium", expires: new Date(Date.now() + 30 * DAY).toISOString() });
    let r = await api(env, "POST", `/api/admin/cc/members/${pp.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2027-12-31" } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.member.plan_until, r.data.member.gcc.pending], ["2027-12-31", true], "still «not chosen yet» (all six, prompted)");
    assert.equal((await prefs(env, pp.id)).gcc, undefined);
    r = await api(env, "POST", `/api/admin/cc/members/${pp.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2027-12-31", gcc: ["SA"] } });
    assert.deepEqual([r.status, r.data.code], [422, "gcc_required"], "states sent must still be exactly 3");
    const b = await mkMember(env, "b@f.test", { plan: "basic", expires: new Date(Date.now() + 30 * DAY).toISOString() });
    r = await api(env, "POST", `/api/admin/cc/members/${b.id}/plan`, { token: ot, body: { plan: "premium", plan_until: "2027-12-31" } });
    assert.deepEqual([r.status, r.data.code], [422, "gcc_required"], "moving into Premium");
    r = await api(env, "PATCH", `/api/admin/cc/members/${pp.id}`, { token: ot, body: { phone: "+201112223334" } });
    assert.equal(r.status, 200, r.text);
  });
  test("R-6: the site's parser (data/plan.js MIGPLAN.gccCode / gccParse) gives the Worker's answers (gccCode / normGcc) on one shared vector", async t => {
    let src; try { src = readFileSync(new URL("../../data/plan.js", import.meta.url), "utf8"); } catch (e) { t.skip("data/plan.js is not next to the worker"); return; }
    const ctx = { window: {}, document: { createElement: () => ({}), head: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } }, addEventListener() {}, querySelector: () => null }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null }, location: { pathname: "/", hash: "" }, CustomEvent: function () {} };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
    const S = ctx.MIGPLAN;
    const V = ["السعودية وأبو ظبي وقطر", "Saudi Arabia, Abu Dhabi, Qatar", "جده، دبي، الكويت", "عمان - الأردن", "عمان، الأردن", "Omani", "Sultanate of Oman", "مسقط", "جده", "جدة", "ابوظبي", "أبوظبي", "Abu Dhabi", "Dhabi",
      "KSA", "UAE", "Amman", "عمّان", "عَمّان", "السعودية والإمارات وقطر", "SA,AE,QA", "sa ae qa", "Oman, Qatar & Bahrain", "المملكة المتحدة", "Romania", "الإمارات العربية المتحدة", "الدوحة", "المنامة", "الشارقة", "الرياض/جدة", "kuwait|oman", "", "  ", "XX", "مصر"];
    for (const v of V) {
      assert.equal(S.gccCode(v), C.gccCode(v), "gccCode " + JSON.stringify(v));
      assert.deepEqual(Array.from(S.gccParse(v)), C.normGcc(v), "gccParse " + JSON.stringify(v));
    }
    assert.deepEqual(Array.from(S.gccParse(["QA", "sa", "QA", "x", "OM", "Kuwait"])), C.normGcc(["QA", "sa", "QA", "x", "OM", "Kuwait"]));
  });
});
const effPlanOf = m => C.effPlan(m);
