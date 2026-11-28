// node --test for «فرص مناسبة لمصنعك» — the proactive opportunity matching (worker/src/matching-opps.js, migration 0016, switch opp_matching)
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import * as OM from "../src/matching-opps.js";
import { oppsLineAr } from "../src/bassem-context.js";
import { bassemContext } from "../src/janna-session.js";
import { storeJson, forgetFeatures, featureDef, featuresView, loadFeatures, forgetOppStore, FEATURE_KEYS } from "../src/flags.js";
import { templateKeyOf, TEMPLATES } from "../src/email-center.js";
import { issueSession } from "../src/auth.js";
import { items as platformItems } from "../src/digest.js";
import { budgetEnv } from "../src/memory.js";
import { cairoDay, addDays } from "../src/common.js";
import { D1 } from "./helpers.mjs";

const TODAY = cairoDay(Date.now());
const AT = (h = "08:00") => Date.parse(TODAY + "T" + h + ":00Z");     // 10:00 Cairo (UTC+2) — after the 07:00 digest time
const NOW = AT();
const D = n => addDays(TODAY, n);
const ISO = ms => new Date(ms).toISOString();

let mails, realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch; mails = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === "https://api.resend.com/emails") { mails.push(JSON.parse(init.body)); return Response.json({ id: "re_" + mails.length }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

/* migate-intel behind the INTEL binding: answers /api/intel/feed with the given rows, honouring the cursor as the real feed does */
function intelBinding(rows) {
  const seen = [];
  return { seen, fetch: async req => {
    const u = new URL(req.url); seen.push(u);
    assert.equal(u.hostname, "mailpack.binding.invalid"); assert.equal(req.method, "GET");
    if (u.pathname !== "/api/intel/feed") return new Response("not found", { status: 404 });
    const since = u.searchParams.get("since") || "", sid = u.searchParams.get("since_id") || "";
    const out = rows.filter(x => x.first_seen_at > since || (x.first_seen_at === since && x.id > sid)).sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at) || a.id.localeCompare(b.id));
    return Response.json({ items: out.slice(0, +u.searchParams.get("per") || 20), total: out.length, sort: "seen" });
  } };
}
const intelItem = (id, o = {}) => ({ id, kind: "tender_gov", market: "eg", market_name: "مصر", country: null, sector: "التعبئة والتغليف والورق", title: o.title_ar || "توريد", title_ar: "توريد", title_en: "", title_orig: "",
  summary: "", entity: "الهيئة العامة للتأمين الصحي", first_seen_at: ISO(NOW - 3600e3), deadline: D(20), status: "open", url: "https://etenders.gov.eg/notice/" + id, page: "https://madeinegyptgate.com/intel/tender/x-" + id + "/", ...o });

async function envWith({ on = true, intel = null, tables = true, extra = {} } = {}) {
  const DB = new D1();
  if (!tables) DB.db.exec("DROP TABLE IF EXISTS opp_matches; DROP TABLE IF EXISTS opp_cursors;");
  const env = { DB, ADVISOR_SECRET: "adv-secret-opp", AUTH_SECRET: "auth-secret-opp", RESEND_API_KEY: "re_test", ...(intel ? { INTEL: intel } : {}), ...extra };
  if (on !== null) await setSwitches(env, { opp_matching: on });
  forgetOppStore(env);
  return env;
}
async function setSwitches(env, values) {
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(storeJson(values, {}), ISO(Date.now())).run();
  forgetFeatures(env);
}
async function member(env, id, { plan = "partner", sector = "", products = "", profile = null, email = true, prefs = "{}" } = {}) {
  const t = ISO(Date.now());
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, sector, products, email_verified_at, name, prefs_json) VALUES (?, 'مصنع تجربة', ?, ?, 1, ?, ?, ?, ?, ?, 'أحمد', ?)")
    .bind(id, email ? id + "@mig.test" : "", plan, t, t, sector, products, email ? t : "", prefs).run();
  if (profile) await env.DB.prepare("INSERT INTO member_profiles (member_id, profile_json, source, created_at, updated_at) VALUES (?, ?, 'member', ?, ?)").bind(id, JSON.stringify(profile), t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return (await issueSession(env, m, { scope: "full" })).token;
}
const PIPES = { products: ["أنابيب بلاستيك", "عبوات كرتون"], target_markets: ["مصر", "السعودية"], certifications: ["ISO 9001:2015"] };
async function api(env, method, { token, body, query = "" } = {}) {
  const h = {}; if (token) h.Authorization = "Bearer " + token; if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await worker.fetch(new Request("https://madeinegyptgate.com/api/me/opportunities" + query, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data };
}
const rowsOf = async (env, id) => (await env.DB.prepare("SELECT * FROM opp_matches WHERE member_id = ? ORDER BY score DESC").bind(id).all()).results;

describe("the score (deterministic, from the data only)", () => {
  const m = { id: "x", plan: "partner", sector: "التعبئة والتغليف والورق", products: "" };
  const ms = OM.memberSignals(m, PIPES);
  const score = (it, mm = m, s = ms) => OM.matchScore(s, OM.itemSignals(it), it, mm, NOW);
  test("a product named with another form / synonym + the sector + a target market + the certificate held + an open deadline → 100", () => {
    const it = { title: "توريد مواسير بلاستيكية للري", sector: "التعبئة والتغليف والورق", market: "eg", deadline: D(20), summary: "يشترط شهادة الأيزو 9001" };
    const r = score(it);
    assert.equal(r.score, 100);
    assert.deepEqual(r.reasons.map(x => x.code), ["product", "sector", "market", "certs", "deadline"]);
    assert.match(r.reasons[0].ar, /أنابيب بلاستيك/); assert.match(r.reasons[0].en, /asked for/);
    assert.deepEqual(r.missing, []);
  });
  test("an English notice finds the Arabic product (pipes / plastic); a certificate he lacks lowers the score and is listed as missing", () => {
    const it = { title: "Supply of plastic pipes", sector: "", market: "sa", deadline: D(3), summary: "Bidders must hold ISO 9001 and ISO 22000 and HACCP" };
    const r = score(it);
    assert.ok(r && r.score < 100 && r.score >= 40, JSON.stringify(r));
    assert.deepEqual(r.missing.map(x => x.cert), ["iso22000", "haccp"]);
    assert.equal(r.reasons.find(x => x.code === "certs").pts, 3); // 1 of 3 asked
    assert.equal(r.reasons.find(x => x.code === "deadline").pts, 6); // 3 days left
    assert.equal(r.reasons.find(x => x.code === "market").pts, 15); // «السعودية» is one of his targets
  });
  test("never scored: a deadline that passed, a closed item, a market outside the plan, nothing about his factory", () => {
    const base = { title: "توريد أنابيب بلاستيك", sector: "", market: "eg", deadline: D(10) };
    assert.equal(score({ ...base, deadline: D(-1) }), null, "expired");
    assert.equal(score({ ...base, closed: true }), null, "closed");
    assert.equal(score({ ...base, market: "asia:cn" }), null, "Asia is not in the partner plan");
    assert.ok(score({ ...base, market: "asia:cn" }, { ...m, plan: "strategic" }), "the strategic plan has every market");
    assert.equal(score({ ...base, market: "intl" }), null, "the world: only the plan with every market");
    assert.equal(score({ title: "توريد سيارات إسعاف", sector: "السيارات والصناعات المغذية", market: "eg", deadline: D(10) }), null, "nothing in common");
  });
  test("a Premium member's Gulf: only the GCC states he chose", () => {
    const pm = { id: "p", plan: "premium", sector: "", products: "أنابيب بلاستيك", prefs_json: JSON.stringify({ gcc: ["AE", "QA", "KW"] }) };
    const s = OM.memberSignals(pm, null), it = c => ({ title: "توريد أنابيب بلاستيك", market: c, deadline: D(10) });
    assert.equal(OM.matchScore(s, OM.itemSignals(it("sa")), it("sa"), pm, NOW), null);
    assert.ok(OM.matchScore(s, OM.itemSignals(it("ae")), it("ae"), pm, NOW));
  });
  test("no deadline stated: 5 points and a «check it» note; the score stays within 0-100", () => {
    const it = { title: "مشروع مصنع جديد يحتاج عبوات كرتون", sector: "", market: "eg", deadline: "" };
    const r = score(it);
    assert.ok(r.score >= 40 && r.score <= 100);
    assert.equal(r.reasons.find(x => x.code === "deadline"), undefined); assert.equal(r.missing[0].code, "deadline");
  });
  test("target markets and certificates are read from the member's own words", () => {
    assert.deepEqual([...OM.targetCodes(["السعودية", "الخليج", "أفريقيا", "Kenya", "الإمارات وقطر"])].sort(), ["ae", "africa", "gulf", "ke", "qa", "sa"]);
    assert.deepEqual(OM.certsIn("حاصلين على ايزو 9001 وشهادة حلال و HACCP و CE marking"), ["iso9001", "haccp", "halal", "ce"]);
    assert.deepEqual(OM.certsIn("ISO 90012 و Cement CE"), [], "no false matches");
  });
});

describe("the switch, the migration and the registry", () => {
  test("opp_matching is OFF by default, server-side, and locked until 0016", async () => {
    const d = featureDef("opp_matching");
    assert.equal(d.default, false); assert.equal(d.scope, "server"); assert.ok(FEATURE_KEYS.includes("opp_matching"));
    const env = await envWith({ on: null, tables: false });
    const row = (await featuresView(env)).features.find(f => f.key === "opp_matching");
    assert.equal(row.effective, false); assert.ok(row.locked && /0016/.test(JSON.stringify(row.locked)));
    const ok = await envWith({ on: null });
    assert.equal((await featuresView(ok)).features.find(f => f.key === "opp_matching").locked, null);
  });
  test("the alert e-mail has its own registered template (oppm- → opp_matches, list digest)", () => {
    assert.equal(templateKeyOf({ id: "oppm-m1-2026-11-26" }), "opp_matches");
    const t = TEMPLATES.find(x => x.key === "opp_matches"); assert.equal(t.list, "digest"); assert.ok(t.about_ar && t.about_en && t.can_off);
  });
  test("switch off → the cron does nothing; no 0016 → store_off; the API answers 503 feature_off / opp_matches_off", async () => {
    const off = await envWith({ on: false, intel: intelBinding([intelItem("aaaa0000001")]) }), tok = await member(off, "m1", { profile: PIPES });
    assert.deepEqual(await OM.oppCron(off, NOW), { skipped: "feature_off" });
    assert.equal(off.INTEL.seen.length, 0, "migate-intel is not even asked");
    assert.deepEqual([(await api(off, "GET", { token: tok })).status, (await api(off, "GET", { token: tok })).data.code], [503, "feature_off"]);
    const bare = await envWith({ tables: false }), t2 = await member(bare, "m2", { profile: PIPES });
    assert.deepEqual(await OM.oppCron(bare, NOW), { skipped: "store_off" });
    assert.equal((await api(bare, "GET", { token: t2 })).data.code, "opp_matches_off");
    assert.deepEqual(await OM.topUnseen(bare, "m2"), []);
  });
});

describe("the cron: new opportunities → matches (bounded, by cursor)", () => {
  test("Information Center items: scored for Bassem's members only, stored once, the cursor moves on, the source link stays internal", async () => {
    const rows = [
      intelItem("aaaa0000001", { title_ar: "توريد أنابيب بلاستيك للصرف", summary: "مطلوب شهادة ISO 9001", first_seen_at: ISO(NOW - 7200e3) }),
      intelItem("aaaa0000002", { title_ar: "توريد عبوات كرتون مطبوعة", kind: "rfq", first_seen_at: ISO(NOW - 3600e3) }),
      intelItem("aaaa0000003", { title_ar: "توريد أنابيب بلاستيك", deadline: D(-2), first_seen_at: ISO(NOW - 3000e3) }), // expired
      intelItem("aaaa0000004", { title_ar: "أخبار السوق", kind: "news", first_seen_at: ISO(NOW - 2000e3) }),             // news: never
      intelItem("aaaa0000005", { title_ar: "توريد أنابيب بلاستيك", market: "asia:cn", first_seen_at: ISO(NOW - 1000e3) }), // outside the partner plan
    ];
    const env = await envWith({ intel: intelBinding(rows) });
    await member(env, "p1", { profile: PIPES, sector: "التعبئة والتغليف والورق" });
    await member(env, "s1", { plan: "strategic", products: "أنابيب بلاستيك" });
    await member(env, "b1", { plan: "basic", profile: PIPES });           // no Bassem in the plan
    await member(env, "p2", { products: "سيارات" });                       // nothing in common
    const r = await OM.oppCron(env, NOW);
    assert.equal(r.members, 3, "basic is not a Bassem plan");
    assert.equal(r.sources.intel.read, 5);
    const p1 = await rowsOf(env, "p1"), s1 = await rowsOf(env, "s1");
    assert.deepEqual(p1.map(x => x.item_key).sort(), ["intel:aaaa0000001", "intel:aaaa0000002"]);
    assert.deepEqual(s1.map(x => x.item_key).sort(), ["intel:aaaa0000001", "intel:aaaa0000005"], "strategic: China too; no box product");
    assert.deepEqual(await rowsOf(env, "b1"), []); assert.deepEqual(await rowsOf(env, "p2"), []);
    assert.ok(p1.every(x => x.score >= 40 && x.score <= 100 && x.status === "new" && x.source === "intel"));
    assert.equal(JSON.parse(p1[0].item_json).src, "https://etenders.gov.eg/notice/" + p1[0].item_key.slice(6), "kept for the team");
    const cur = await env.DB.prepare("SELECT * FROM opp_cursors WHERE source = 'intel'").first();
    assert.deepEqual([cur.cursor, cur.cursor_id], [rows[4].first_seen_at, "aaaa0000005"]);
    // the second run asks after the cursor and writes nothing again
    const r2 = await OM.oppCron(env, NOW + 60e3);
    const last = env.INTEL.seen[env.INTEL.seen.length - 1];
    assert.deepEqual([last.searchParams.get("since"), last.searchParams.get("since_id"), last.searchParams.get("sort")], [rows[4].first_seen_at, "aaaa0000005", "seen"]);
    assert.equal(r2.sources.intel.read, 0); assert.equal((await rowsOf(env, "p1")).length, 2);
  });
  test("bounded: the write cap stops before an item, and the next run goes on from there", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => intelItem("bbbb000000" + i, { title_ar: "توريد أنابيب بلاستيك رقم " + i, first_seen_at: ISO(NOW - (10 - i) * 60e3) }));
    const env = await envWith({ intel: intelBinding(rows) });
    for (let i = 0; i < 30; i++) await member(env, "m" + i, { products: "أنابيب بلاستيك" });
    const small = budgetEnv(env, 105); // ≈ 63 writes left after the reads and the reserve: two items of 30 members
    const r = await OM.oppCron(small, NOW, { gate: env });
    assert.equal(r.sources.intel.stopped, "write_cap"); assert.equal(r.written, 60); assert.equal(r.sources.intel.read, 2);
    const r2 = await OM.oppCron(budgetEnv(env, 105), NOW, { gate: env });
    assert.equal(r2.written, 60);
    assert.equal((await env.DB.prepare("SELECT COUNT(DISTINCT item_key) AS n FROM opp_matches").first()).n, 4);
  });
  test("no INTEL binding: that source is skipped, the others still run; a stale cursor restarts at the boot window", async () => {
    const env = await envWith();
    await member(env, "p1", { products: "أنابيب" });
    await env.DB.prepare("INSERT INTO opp_cursors (source, cursor, cursor_id, updated_at) VALUES ('platform', '2020-01-01T00:00:00.000Z', '', '')").run();
    const r = await OM.oppCron(env, NOW);
    assert.equal(r.sources.intel.skipped, "no_binding"); assert.ok(r.sources.platform && !r.sources.platform.error);
  });
  test("the platform's own tenders (data.json, new in seen_items — never the baseline): matched by sector, card links to the platform page", async (t) => {
    const it = platformItems().find(x => x.kind === "tender" && x.market === "local" && x.deadline >= D(8) && x.sector);
    if (!it) return t.skip("no open local tender in today's data.json");
    const env = await envWith();
    await member(env, "p1", { sector: it.sector });
    await env.DB.prepare("INSERT INTO seen_items (kind, item_id, first_seen_at, baseline) VALUES (?, ?, ?, 0), ('tender', 'not-in-data', ?, 0)").bind(it.kind, it.id, ISO(NOW - 3600e3), ISO(NOW - 3500e3)).run();
    const other = platformItems().find(x => x.kind === "tender" && x.id !== it.id && x.sector === it.sector);
    if (other) await env.DB.prepare("INSERT INTO seen_items (kind, item_id, first_seen_at, baseline) VALUES (?, ?, ?, 1)").bind(other.kind, other.id, ISO(NOW - 3400e3)).run();
    await OM.oppCron(env, NOW);
    const rows = await rowsOf(env, "p1");
    assert.deepEqual(rows.map(r => r.item_key), ["platform:tender:" + it.id], "the baseline item is never matched");
    const card = JSON.parse(rows[0].item_json);
    assert.ok(card.link.startsWith("https://madeinegyptgate.com/")); assert.equal(card.notice, undefined, "no source as the official link");
    assert.equal(JSON.parse(rows[0].reasons)[0].code, "sector");
  });
  test("«فرص السوق» web leads: as published (no source), only while web_leads_public is on; a lead the team hides disappears from the list", async () => {
    const env = await envWith();
    const tok = await member(env, "p1", { profile: PIPES });
    const t = ISO(NOW - 3600e3);
    /* the auto-publish gate (web-public.js, owner 2026-11-28): an RFQ is published only from an official source page with a closing date ahead */
    const due = new Date(Date.parse(TODAY) + 20 * 864e5).toISOString().slice(0, 10);
    const ins = (title, status = "new") => env.DB.prepare("INSERT INTO web_leads (url_hash, url, title, site, snippet, type, market, first_seen, last_seen, status) VALUES (?, ?, ?, 'buyer.gov.eg', ?, 'rfq', 'eg', ?, ?, ?)").bind("h" + title.length + status, "https://buyer.gov.eg/rfq/" + title.length, title, "نحتاج كمية كبيرة، آخر موعد لتلقي العروض " + due, t, t, status).run();
    await ins("طلب عرض سعر أنابيب بلاستيك قطر 4 بوصة"); await ins("طلب عرض سعر أنابيب بلاستيك مرفوض", "rejected");
    await setSwitches(env, { opp_matching: true, web_leads_public: false });
    let r = await OM.oppCron(env, NOW);
    assert.equal(r.sources.web.skipped, "off"); assert.deepEqual(await rowsOf(env, "p1"), []);
    await setSwitches(env, { opp_matching: true });
    r = await OM.oppCron(env, NOW);
    const rows = await rowsOf(env, "p1");
    assert.equal(rows.length, 1, "the rejected lead is not published, so never matched"); assert.equal(rows[0].source, "web");
    const g = await api(env, "GET", { token: tok });
    assert.equal(g.data.items.length, 1); assert.ok(!JSON.stringify(g.data).includes("buyer.gov.eg"), "no source, no link out");
    await env.DB.prepare("UPDATE web_leads SET status = 'rejected', reason = 'hidden'").run();
    assert.equal((await api(env, "GET", { token: tok })).data.items.length, 0);
  });
});

describe("GET|POST /api/me/opportunities — his own rows only", () => {
  async function seeded() {
    const env = await envWith({ intel: intelBinding([
      intelItem("cccc0000001", { title_ar: "توريد أنابيب بلاستيك", title_en: "Supply of plastic pipes", first_seen_at: ISO(NOW - 7200e3) }),
      intelItem("cccc0000002", { title_ar: "توريد عبوات كرتون", kind: "project", deadline: null, first_seen_at: ISO(NOW - 3600e3) }),
    ]) });
    const a = await member(env, "pa", { profile: PIPES }), b = await member(env, "pb", { profile: PIPES }), basic = await member(env, "bb", { plan: "basic", profile: PIPES });
    await OM.oppCron(env, NOW);
    return { env, a, b, basic };
  }
  test("401 without a sign-in, 403 plan without Bassem; the list: score order, both languages, reasons, the official notice of a tender only, never src", async () => {
    const { env, a, basic } = await seeded();
    assert.equal((await api(env, "GET")).status, 401);
    assert.deepEqual([(await api(env, "GET", { token: basic })).status, (await api(env, "GET", { token: basic })).data.code], [403, "plan"]);
    const r = await api(env, "GET", { token: a });
    assert.equal(r.status, 200); assert.equal(r.data.alert_min, 70);
    const [t, p] = r.data.items;
    assert.ok(t.score >= p.score); assert.equal(t.kind, "tender"); assert.equal(t.kind_label, "مناقصة");
    assert.equal(t.notice_link, "https://etenders.gov.eg/notice/cccc0000001"); assert.equal(p.notice_link, undefined, "a project has no notice link");
    assert.equal(t.link, "https://madeinegyptgate.com/intel/tender/x-cccc0000001/");
    assert.ok(t.reasons.length && t.reasons.every(x => x.text && /[؀-ۿ]/.test(x.text)));
    assert.ok(!("src" in t) && !JSON.stringify(r.data).includes('"src"'));
    assert.deepEqual(r.data.counts, { new: 2, seen: 0, saved: 0, dismissed: 0 });
    const en = await api(env, "GET", { token: a, query: "?lang=en" });
    assert.equal(en.data.items[0].title, "Supply of plastic pipes"); assert.equal(en.data.items[0].kind_label, "Tender"); assert.ok(en.data.items[0].reasons.every(x => !/[؀-ۿ]{3}/.test(x.text.replace(/“[^”]*”|\([^)]*\)/g, ""))));
  });
  test("POST seen / saved / dismissed changes only his own rows; «seen» never undoes a choice; bad input refused", async () => {
    const { env, a, b } = await seeded();
    const k1 = "intel:cccc0000001", k2 = "intel:cccc0000002";
    assert.equal((await api(env, "POST", { token: a, body: { key: k1, status: "saved" } })).data.changed, 1);
    assert.equal((await api(env, "POST", { token: a, body: { keys: [k1, k2], status: "seen" } })).data.changed, 1, "the saved one stays saved");
    assert.equal((await api(env, "POST", { token: a, body: { key: k2, status: "dismissed" } })).data.changed, 1);
    const st = Object.fromEntries((await rowsOf(env, "pa")).map(r => [r.item_key, r.status]));
    assert.deepEqual(st, { [k1]: "saved", [k2]: "dismissed" });
    assert.deepEqual(Object.values(Object.fromEntries((await rowsOf(env, "pb")).map(r => [r.item_key, r.status]))), ["new", "new"], "member B untouched");
    const g = await api(env, "GET", { token: a });
    assert.deepEqual(g.data.items.map(x => x.key), [k1], "dismissed is not active"); assert.deepEqual(g.data.counts, { new: 0, seen: 0, saved: 1, dismissed: 1 });
    assert.equal((await api(env, "GET", { token: a, query: "?status=dismissed" })).data.items[0].key, k2);
    for (const body of [{ key: k1, status: "deleted" }, { key: "web:abc", status: "seen" }, { keys: [], status: "seen" }, { key: "x".repeat(300), status: "seen" }])
      assert.equal((await api(env, "POST", { token: a, body })).status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await api(env, "GET", { token: a, query: "?status=all" })).status, 400);
  });
  test("a stored match whose deadline has passed is never listed as active (saved ones stay, marked expired)", async () => {
    const { env, a } = await seeded();
    await env.DB.prepare("UPDATE opp_matches SET deadline = ? WHERE item_key = 'intel:cccc0000001'").bind(D(-1)).run();
    assert.deepEqual((await api(env, "GET", { token: a })).data.items.map(x => x.key), ["intel:cccc0000002"]);
    await api(env, "POST", { token: a, body: { key: "intel:cccc0000001", status: "saved" } });
    const s = await api(env, "GET", { token: a, query: "?status=saved" });
    assert.equal(s.data.items[0].expired, true);
  });
});

describe("the daily alert «فرص جديدة مناسبة لمصنعك» and Bassem's line", () => {
  async function many(n, extra = {}) {
    const rows = Array.from({ length: n }, (_, i) => intelItem("dddd000000" + i, { title_ar: "توريد أنابيب بلاستيك دفعة " + (i + 1), summary: "شهادة ISO 9001", first_seen_at: ISO(NOW - (20 - i) * 60e3) }));
    const env = await envWith({ intel: intelBinding(rows), extra });
    await member(env, "pa", { profile: PIPES, sector: "التعبئة والتغليف والورق" });
    await OM.oppCron(env, NOW);
    return env;
  }
  test("from the digest time: ≤ 5 a day, ≥ 70 only, one notification + one e-mail (template opp_matches, no source), never the same item twice", async () => {
    const env = await many(7);
    assert.equal((await OM.oppAlerts(env, AT("04:00"))).skipped, "before_digest_time");
    await env.DB.prepare("UPDATE opp_matches SET score = 55 WHERE item_key = 'intel:dddd0000006'").run();
    const r = await OM.oppAlerts(env, NOW);
    assert.deepEqual([r.members, r.alerted, r.mailed], [1, 5, 1]);
    assert.equal(mails.length, 1);
    const m = mails[0], txt = m.text || "";
    assert.match(m.subject, /فرص جديدة مناسبة لمصنعك \(5\)/); assert.equal(m.to[0] || m.to, "pa@mig.test");
    assert.match(txt, /درجة المطابقة \d+\/100/); assert.match(txt, /match \d+\/100/); assert.match(txt, /الإعلان الرسمي: https:\/\/etenders\.gov\.eg/);
    assert.ok(!/dddd0000006/.test(txt), "under the threshold");
    const n = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = 'pa' AND kind = 'opp_match'").all();
    assert.equal(n.results.length, 1); assert.ok(n.results[0].title && n.results[0].title_en);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM opp_matches WHERE alerted_at != ''").first()).n, 5);
    // the same day: nothing more; the next day: the one left above the threshold
    assert.equal((await OM.oppAlerts(env, NOW + 3600e3)).members, 0); assert.equal(mails.length, 1);
    const r2 = await OM.oppAlerts(env, NOW + 86400e3);
    assert.equal(r2.alerted, 1); assert.equal(mails.length, 2);
  });
  test("nothing sent while daily_digest is off, when he turned the digest e-mails off (in-app only) or paused Bassem", async () => {
    const env = await many(2);
    await setSwitches(env, { opp_matching: true, daily_digest: false });
    assert.equal((await OM.oppAlerts(env, NOW)).skipped, "daily_digest_off");
    await setSwitches(env, { opp_matching: true });
    await env.DB.prepare("UPDATE members SET prefs_json = ? WHERE id = 'pa'").bind(JSON.stringify({ email_digest: false })).run();
    const r = await OM.oppAlerts(env, NOW);
    assert.deepEqual([r.alerted, r.mailed, mails.length], [2, 0, 0]);
    const env2 = await many(2);
    await env2.DB.prepare("UPDATE members SET prefs_json = ? WHERE id = 'pa'").bind(JSON.stringify({ pause: true })).run();
    const r2 = await OM.oppAlerts(env2, NOW);
    assert.deepEqual([r2.members, r2.alerted, mails.length], [1, 0, 0]);
  });
  test("Bassem: the top 3 unseen matches as one short line — no link, no source, nothing when the switch is off", async () => {
    const env = await many(5);
    forgetFeatures(env);
    assert.deepEqual(await OM.topUnseen(env, "pa", 3, NOW), [], "the memo is not loaded yet = OFF (no extra read on the session path)");
    await loadFeatures(env, { fresh: true });
    const top = await OM.topUnseen(env, "pa", 3, NOW);
    assert.equal(top.length, 3);
    const line = oppsLineAr(top);
    assert.match(line, /فرص جديدة مناسبة لمصنعه/); assert.match(line, /١\) مناقصة: توريد أنابيب بلاستيك/); assert.ok(!/https?:|etenders|www\./.test(line));
    assert.equal(oppsLineAr([]), "");
    await env.DB.prepare("UPDATE opp_matches SET status = 'seen'").run();
    assert.deepEqual(await OM.topUnseen(env, "pa", 3, NOW), []);
    await env.DB.prepare("UPDATE opp_matches SET status = 'new'").run();
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = 'pa'").first();
    const ctx = await bassemContext(env, { ...m, title: "مهندس" }, "ar", {}, NOW);
    assert.ok(ctx.opps && ctx.block.includes("فرص جديدة مناسبة لمصنعه")); assert.ok(!/etenders/.test(ctx.block));
    // another member's block never carries them
    await member(env, "pz", { products: "سيارات" });
    const mz = await env.DB.prepare("SELECT * FROM members WHERE id = 'pz'").first();
    const cz = await bassemContext(env, { ...mz, title: "مهندس" }, "ar", {}, NOW);
    assert.ok(!cz.opps && !cz.block.includes("فرص جديدة مناسبة"));
  });
  test("account deletion takes his matches (eraseStmts)", async () => {
    const env = await many(1);
    const st = await OM.eraseStmts(env, "pa");
    await env.DB.batch(st);
    assert.deepEqual(await rowsOf(env, "pa"), []);
  });
});
