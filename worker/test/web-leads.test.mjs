// node --test for «🌐 فرص من الإنترنت» on the data desk (src/web-leads.js, src/acc-team.js; migration 0012_web_leads.sql): the leads store
// (insert, repeat, type upgrade, fail-soft without the table, no phone / e-mail stored), GET /api/team/desk/leads (roles, filters, counts,
// paging), PUT /api/team/desk/leads/:id (accept / reject / reopen, one cc_audit row in the same batch), POST /api/team/desk/content {lead_id}
// (the lead linked, best effort). Everything through the real index.js. Run: cd worker && npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { recordLeads, rejectedOf, leadHash, productKey, listLeads, TYPE_NAMES, REASONS } from "../src/web-leads.js";
import { forgetLeadsStore } from "../src/flags.js";

const SITE = "https://madeinegyptgate.com", L = "/api/team/desk/leads";
const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", TEAM_EMAIL: "team@madeinegyptgate.com",
  ADMIN_EMAILS: "owner@mig.test", PLATFORM_KEY: "pk-test-123", CONFIG_SECRET: "test-config-secret-0123456789abcdef-xyz", ...(extra || {}) });
async function member(env, id, email, { staff = "", role = "user" } = {}) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at) VALUES (?, 'Co', ?, 'visitor', 1, ?, ?, ?, ?)").bind(id, email, t, t, role, t).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
function mkCtx() { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
async function api(env, method, path, { token, body, headers = {} } = {}) {
  const h = { "CF-Connecting-IP": "10.1.0.8", "User-Agent": "Mozilla/5.0 test", Origin: SITE, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const row = (type, url, title, extra = {}) => ({ type, url, title, snippet: "snippet " + title, date: "2026-11-18", official: false, aggregator: false, query: "q " + title, lang: "ar", ...extra });
const NOW = Date.UTC(2026, 10, 20, 10);
async function seed(env) {
  await recordLeads(env, [row("tender", "https://tenders.etimad.sa/T/1", "مناقصة توريد درافيل", { official: true }), row("rfq", "https://www.tradekey.com/buyoffer/rollers-1.html", "Buy rubber rollers"),
    row("buyer", "https://www.qenapaper.com/", "Qena Paper"), row("other", "https://shop.example.com/", "a shop"), row("news", "https://www.youm7.com/x", "خبر")],
    { persona: "janna", via: "hunt", product: "سلندرات درافيل", market: "eg", governorate: "الجيزة", nowMs: NOW });
  await recordLeads(env, [row("project", "https://www.almalnews.com/p", "مصنع ورق جديد"), row("news", "https://www.reuters.com/n", "news from a search")], { persona: "bassem", via: "search", market: "sa", nowMs: NOW + 1000 });
}

describe("web leads: the store", () => {
  test("opportunities only (never other; news from hunts only); a repeat bumps seen_count at most once an hour, keeps title / status, adds the persona, upgrades the type; never a phone or an e-mail", async () => {
    const env = env0();
    await seed(env);
    let rows = (await env.DB.prepare("SELECT * FROM web_leads ORDER BY id").all()).results;
    assert.deepEqual(rows.map(r => [r.type, r.persona, r.via]), [["tender", "janna", "hunt"], ["rfq", "janna", "hunt"], ["buyer", "janna", "hunt"], ["news", "janna", "hunt"], ["project", "bassem", "search"]]);
    assert.deepEqual([rows[0].official, rows[0].product, rows[0].product_key, rows[0].market, rows[0].governorate, rows[0].site, rows[0].seen_count, rows[0].status], [1, "سلندرات درافيل", productKey("سلندرات درافيل"), "eg", "الجيزة", "tenders.etimad.sa", 1, "new"]);
    assert.equal(rows[0].url_hash, await leadHash("http://www.tenders.etimad.sa/T/1/"), "one canonical link (nit 4)");
    await env.DB.prepare("UPDATE web_leads SET status = 'rejected', reason = 'old' WHERE id = ?").bind(rows[0].id).run();
    await recordLeads(env, [row("tender", "https://tenders.etimad.sa/T/1", "a NEW title"), row("rfq", "https://www.qenapaper.com/", "now an rfq?")], { persona: "bassem", via: "hunt", nowMs: NOW + 600000 });
    rows = (await env.DB.prepare("SELECT * FROM web_leads ORDER BY id").all()).results;
    assert.deepEqual([rows[0].seen_count, rows[0].title, rows[0].status, rows[0].personas], [1, "مناقصة توريد درافيل", "rejected", " janna bassem "], "10 minutes later: no new sighting, the title and the rejection stay");
    assert.equal(rows[2].type, "rfq", "a better type upgrades buyer → rfq");
    await recordLeads(env, [row("tender", "https://tenders.etimad.sa/T/1", "x")], { persona: "bassem", via: "hunt", nowMs: NOW + 2 * 3600000 });
    assert.equal(Number(await env.DB.prepare("SELECT seen_count FROM web_leads WHERE id = ?").bind(rows[0].id).first("seen_count")), 2, "two hours later: one more sighting");
    await recordLeads(env, [row("rfq", "https://contact.example.com/a", "اتصل 01012345678 أو sales@a-example.com", { snippet: "واتساب +20 100 123 4567 — mail info@a-example.com" })], { persona: "janna", via: "hunt", nowMs: NOW });
    const c = await env.DB.prepare("SELECT title, snippet FROM web_leads WHERE url = 'https://contact.example.com/a'").first();
    assert.ok(!/01012345678|1234567|@a-example/.test(JSON.stringify(c)) && /محجوب/.test(c.title + c.snippet), JSON.stringify(c));
  });
  test("a link seen every 40 minutes gains one sighting per clock hour, and last_seen follows every sighting", async () => {
    const env = env0(), u = "https://tenders.etimad.sa/T/40";
    for (const m of [0, 40, 80, 120, 130]) await recordLeads(env, [row("tender", u, "t")], { persona: "janna", via: "hunt", nowMs: NOW + m * 60000 });
    const r = await env.DB.prepare("SELECT seen_count, last_seen FROM web_leads WHERE url = ?").bind(u).first();
    assert.deepEqual([Number(r.seen_count), r.last_seen], [3, new Date(NOW + 130 * 60000).toISOString()], "10:00, 11:20 and 12:00 count; 10:40 and 12:10 do not");
    await recordLeads(env, [row("tender", u, "t")], { persona: "bassem", via: "hunt", nowMs: NOW + 30 * 60000 }); // a late write of an older sighting
    const r2 = await env.DB.prepare("SELECT seen_count, last_seen FROM web_leads WHERE url = ?").bind(u).first();
    assert.deepEqual([Number(r2.seen_count), r2.last_seen], [3, r.last_seen]);
  });
  test("fail-soft: without the table nothing is written and nothing throws; the switch web_leads off writes nothing", async () => {
    const env = env0(); env.DB.db.exec("DROP TABLE web_leads"); forgetLeadsStore(env);
    assert.equal(await recordLeads(env, [row("tender", "https://a.example/1", "t")], { persona: "janna", via: "hunt" }), 0);
    assert.equal((await rejectedOf(env, [await leadHash("https://a.example/1")], "")).size, 0);
    const l = await listLeads(env, new URL(SITE + L));
    assert.deepEqual([l.off, l.items.length, l.hint], [true, 0, "apply migrations/0012_web_leads.sql"]);
    const env2 = env0();
    await env2.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?)").bind(JSON.stringify({ v: 1, values: { web_leads: false } }), new Date().toISOString()).run();
    assert.equal(await recordLeads(env2, [row("tender", "https://a.example/1", "t")], { persona: "janna", via: "hunt" }), 0);
    assert.equal(Number(await env2.DB.prepare("SELECT COUNT(*) AS n FROM web_leads").first("n")), 0);
  });
  test("rejectedOf: product-independent reasons for every product, «مش عن المنتج» and no reason for the same product only (S5)", async () => {
    const env = env0();
    await recordLeads(env, ["1", "2", "3", "4"].map(n => row("tender", "https://a.example/" + n, "t" + n)), { persona: "janna", via: "hunt", product: "سلندرات درافيل" });
    await env.DB.prepare("UPDATE web_leads SET status = 'rejected', reason = CASE url WHEN 'https://a.example/1' THEN 'off_topic' WHEN 'https://a.example/2' THEN 'duplicate' WHEN 'https://a.example/3' THEN '' ELSE reason END WHERE url IN ('https://a.example/1', 'https://a.example/2', 'https://a.example/3')").run();
    const hs = await Promise.all(["1", "2", "3", "4"].map(n => leadHash("https://a.example/" + n)));
    assert.deepEqual([...(await rejectedOf(env, hs, productKey("درافيل سلندرات")))].sort(), [hs[0], hs[1], hs[2]].sort(), "the same product, any word order");
    assert.deepEqual([...(await rejectedOf(env, hs, productKey("اسطوانات اكسجين")))], [hs[1]], "another product: only the duplicate");
  });
});

describe("web leads: the data desk API", () => {
  test("GET: roles data / admin / owner (seo 403, signed out 401, X-Platform-Key 403); default = new, newest first; filters, counts, by_type, paging; no table → off", async () => {
    const env = env0(); await seed(env);
    const dk = await member(env, "u-data", "data@mig.test", { staff: "data" }), ad = await member(env, "u-adm", "adm@mig.test", { staff: "admin", role: "admin" }), ow = await member(env, "u-owner", "owner@mig.test");
    const seo = await member(env, "u-seo", "seo@mig.test", { staff: "seo" }), plain = await member(env, "u-x", "x@mig.test");
    let r = await api(env, "GET", L, { token: dk.token });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.total, r.data.counts, r.data.status], [5, { new: 5, accepted: 0, rejected: 0 }, "new"]);
    assert.deepEqual(r.data.items.map(i => i.type), ["project", "news", "buyer", "rfq", "tender"], "newest last_seen first, then the newest row");
    const t = r.data.items.find(i => i.type === "tender");
    assert.deepEqual([t.type_ar, t.type_en, t.status_ar, t.official, t.personas, t.site], ["مناقصة", "Tender", "جديدة", true, ["janna"], "tenders.etimad.sa"]);
    assert.deepEqual(r.data.by_type, { tender: 1, rfq: 1, buyer: 1, news: 1, project: 1 });
    for (const tok of [ad.token, ow.token]) assert.equal((await api(env, "GET", L, { token: tok })).status, 200);
    assert.equal((await api(env, "GET", L, { token: seo.token })).status, 403);
    assert.equal((await api(env, "GET", L, { token: plain.token })).status, 403);
    assert.equal((await api(env, "GET", L)).status, 401);
    assert.equal((await api(env, "GET", L, { headers: { "X-Platform-Key": "pk-test-123" } })).status, 403);
    r = await api(env, "GET", L + "?type=tender&market=eg", { token: dk.token }); assert.deepEqual(r.data.items.map(i => i.site), ["tenders.etimad.sa"]);
    r = await api(env, "GET", L + "?q=" + encodeURIComponent("qenapaper"), { token: dk.token }); assert.deepEqual(r.data.items.map(i => i.type), ["buyer"]);
    r = await api(env, "GET", L + "?limit=2&page=1", { token: dk.token }); assert.deepEqual([r.data.items.length, r.data.page, r.data.limit, r.data.total], [2, 1, 2, 5]);
    r = await api(env, "GET", L + "?status=all&sort=seen", { token: dk.token }); assert.equal(r.data.total, 5);
    env.DB.db.exec("DROP TABLE web_leads"); forgetLeadsStore(env);
    r = await api(env, "GET", L, { token: dk.token });
    assert.deepEqual([r.status, r.data.off, r.data.items], [200, true, []]);
    const p = await api(env, "PUT", L + "/1", { token: dk.token, body: { status: "accepted" } });
    assert.deepEqual([p.status, p.data.code], [503, "leads_off"]);
  });
  test("PUT: accept / reject (with a reason) / reopen → one cc_audit row each in the same batch (no snippet, no note text); invalid status 400, unknown reason 400, unknown id 404, unknown content 400", async () => {
    const env = env0(); await seed(env);
    const dk = await member(env, "u-data", "data@mig.test", { staff: "data" });
    const items = (await api(env, "GET", L, { token: dk.token })).data.items, id = items.find(i => i.type === "tender").id;
    let r = await api(env, "PUT", L + "/" + id, { token: dk.token, body: { status: "rejected", reason: "off_topic", note: "مش درافيل — اسطوانات غاز 01012345678" } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.item.status, r.data.item.reason, r.data.item.reason_ar, r.data.item.reviewed_by], ["rejected", "off_topic", REASONS.off_topic[0], "u-data"]);
    assert.ok(!r.data.item.note.includes("01012345678"), "the note is masked too");
    r = await api(env, "PUT", L + "/" + id, { token: dk.token, body: { status: "new" } });
    assert.deepEqual([r.data.item.status, r.data.item.reason, r.data.item.note.length > 0], ["new", "", true], "reopened; the note stays");
    r = await api(env, "PUT", L + "/" + id, { token: dk.token, body: { status: "accepted" } });
    assert.equal(r.data.item.status, "accepted");
    const aud = (await env.DB.prepare("SELECT action, target_type, target_id, actor_email, before_json, after_json, summary FROM cc_audit WHERE target_type = 'web_lead' ORDER BY id").all()).results;
    assert.deepEqual(aud.map(a => a.action), ["leads.reject", "leads.reopen", "leads.accept"]);
    assert.deepEqual([aud[0].target_id, aud[0].actor_email, JSON.parse(aud[0].after_json).note_len > 0, JSON.parse(aud[0].before_json).status], [String(id), "data@mig.test", true, "new"]);
    assert.match(aud[0].summary, /فرصة من الإنترنت #\d+ \(tenders\.etimad\.sa، مناقصة\): مرفوضة — مش عن المنتج/);
    assert.ok(!JSON.stringify(aud).includes("snippet") && !JSON.stringify(aud).includes("اسطوانات غاز"), "never the snippet or the note's text");
    for (const [b, code] of [[{ status: "done" }, "invalid_status"], [{ status: "rejected", reason: "ugly" }, "invalid_reason"], [{ status: "accepted", content_id: "nope-123" }, "invalid_content"]]) {
      const x = await api(env, "PUT", L + "/" + id, { token: dk.token, body: b });
      assert.deepEqual([x.status, x.data.code], [400, code], JSON.stringify(b));
    }
    assert.equal((await api(env, "PUT", L + "/999999", { token: dk.token, body: { status: "accepted" } })).status, 404);
    assert.equal((await api(env, "GET", L + "/" + id, { token: dk.token })).status, 405);
    const seo = await member(env, "u-seo", "seo@mig.test", { staff: "seo" });
    assert.equal((await api(env, "PUT", L + "/" + id, { token: seo.token, body: { status: "rejected" } })).status, 403);
    /* a failing audit insert = nothing changed */
    env.DB.db.exec("CREATE TRIGGER no_audit BEFORE INSERT ON cc_audit WHEN NEW.target_type = 'web_lead' BEGIN SELECT RAISE(ABORT, 'cc_audit is read-only'); END");
    const f = await api(env, "PUT", L + "/" + id, { token: dk.token, body: { status: "rejected", reason: "old" } });
    assert.deepEqual([f.status, f.data.code], [500, "audit_failed"]);
    assert.equal(await env.DB.prepare("SELECT status FROM web_leads WHERE id = ?").bind(id).first("status"), "accepted");
  });
  test("POST /api/team/desk/content {lead_id}: the content is made and the lead linked (accepted + content_id, audited leads.convert); a lead that cannot be linked never undoes the content", async () => {
    const env = env0(); await seed(env);
    const dk = await member(env, "u-data", "data@mig.test", { staff: "data" });
    const lead = (await api(env, "GET", L, { token: dk.token })).data.items.find(i => i.type === "tender");
    const r = await api(env, "POST", "/api/team/desk/content", { token: dk.token, body: { collection: "tenders", item: { title: "مناقصة توريد درافيل", type: "مناقصة عامة", entity: "جهة" }, lead_id: lead.id } });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.lead_linked, true);
    const l = await env.DB.prepare("SELECT status, content_id, reviewed_by FROM web_leads WHERE id = ?").bind(lead.id).first();
    assert.deepEqual([l.status, l.content_id, l.reviewed_by], ["accepted", r.data.id, "u-data"]);
    assert.equal(Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_audit WHERE action = 'leads.convert'").first("n")), 1);
    const x = await api(env, "POST", "/api/team/desk/content", { token: dk.token, body: { collection: "tenders", item: { title: "مناقصة تانية", type: "مناقصة عامة", entity: "جهة" }, lead_id: 987654 } });
    assert.deepEqual([x.status, x.data.lead_linked], [201, false]);
    const y = await api(env, "POST", "/api/team/desk/content", { token: dk.token, body: { collection: "tenders", item: { title: "مناقصة تالتة", type: "مناقصة عامة", entity: "جهة" } } });
    assert.ok(y.status === 201 && !("lead_linked" in y.data), "without lead_id: as before");
  });
});

describe("web leads: the migration and the schema", () => {
  test("0012 only creates (IF NOT EXISTS), has no CHECK on type (review S14) and the same table as schema.sql; re-running it is harmless", () => {
    const m = readFileSync(new URL("../migrations/0012_web_leads.sql", import.meta.url), "utf8"), schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
    const sql = m.split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
    assert.ok(!/\b(DROP|DELETE|UPDATE|ALTER|REPLACE)\b/i.test(sql));
    assert.equal((sql.match(/CREATE (TABLE|INDEX) IF NOT EXISTS/g) || []).length, (sql.match(/CREATE /g) || []).length);
    assert.ok(!/type\s+TEXT[^\n]*CHECK/i.test(sql) && /status\s+TEXT[^\n]*CHECK/i.test(sql));
    assert.ok(schema.includes(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS web_leads")).trim()), "appended verbatim to schema.sql");
    assert.match(m, /d1-migrate → Run workflow: migration = 0012_web_leads\.sql, confirm = migate-db/);
    const env = env0(); env.DB.db.exec(sql); env.DB.db.exec(sql);
    assert.deepEqual(Object.keys(TYPE_NAMES), ["tender", "rfq", "buyer", "buyer_list", "project", "news", "other"]);
  });
});
