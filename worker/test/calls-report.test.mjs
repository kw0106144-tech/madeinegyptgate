// node --test for the daily calls report (src/calls-report.js): the schedule and its gate, the Anam client (read only), identities, the
// fallbacks, the owner's API (settings / send / preview) and the legal erasure of its rows. Everything runs on the real schema (helpers.mjs
// node:sqlite) with the network fully mocked (test/calls-fixtures.mjs mockNet: Anam's GET endpoints + Resend; any other request — an Anam
// write included — fails the test). All data is SYNTHETIC: no real transcript, name, phone or e-mail.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { platformCron, CC } from "../src/index.js";
import { callsReportCron, buildReport, readSettings, anamClient, reduceRow, memberBlock, deviceOf, CALLS_LIM, CALLS_REPORT_KEY, dayLabelAr } from "../src/calls-report.js";
import { dayStartIso, dayAfterIso } from "../src/acc-base.js";
import { issueSession } from "../src/auth.js";
import { forgetFeatures } from "../src/flags.js";
import { D1 } from "./helpers.mjs";
import { listRow, atlalSession, sid, mockNet, csvOfMail, BUYER_TURNS, analytics, sessionDetail, FAKE_BLOCK, UA_IPHONE_GSA, UA_ANDROID, BASSEM, JANNA_AR } from "./calls-fixtures.mjs";

const SITE = "https://madeinegyptgate.com";
const D = "2026-11-20", D1_ = "2026-11-21";
const AT = Date.parse("2026-11-21T06:45:00Z");          // 08:45 Cairo on the morning after D (EET, UTC+2)
const T_ATLAL = Date.parse("2026-11-20T09:17:53Z"), T_BUYER = Date.parse("2026-11-20T12:00:00Z");
let st, realFetch;
beforeEach(() => { realFetch = globalThis.fetch; st = { rows: [], sessions: {} }; globalThis.fetch = mockNet(st); });
afterEach(() => { globalThis.fetch = realFetch; });
const env0 = extra => ({ DB: new D1(), RESEND_API_KEY: "re_test", ANAM_API_KEY: "anam-test-key-00000000", ADVISOR_SECRET: "adv-secret-for-tests-0123456789", TEAM_EMAIL: "info@madeinegyptgate.com",
  MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", ADMIN_EMAILS: "owner@mig.test", ...(extra || {}) });
const nap = () => Promise.resolve();
const cron = (env, nowMs = AT) => callsReportCron(env, nowMs, CC, { sleep: nap });
const rowsOf = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const audits = (env, action) => rowsOf(env, "SELECT * FROM cc_audit WHERE action = ? ORDER BY id", action);
const gate = async (env, day = D) => (await rowsOf(env, "SELECT job FROM cron_runs WHERE day = ? AND job LIKE 'calls-report%'", day)).map(r => r.job);
const anamCalls = () => st.calls.filter(c => c.url.startsWith("https://api.anam.ai/"));
function addAtlal(n = 1, startMs = T_ATLAL, over = {}) { const id = sid(n), s = atlalSession(id, startMs); st.rows.push(listRow({ id, startMs, lenMs: 13 * 60000, ua: UA_IPHONE_GSA, ...over })); st.sessions[id] = { an: s.an, detail: s.detail }; return id; }
function addBuyer(n = 2, startMs = T_BUYER, over = {}) { const id = sid(n); st.rows.push(listRow({ id, startMs, lenMs: 90000, ...over })); st.sessions[id] = { an: analytics(id, startMs, BUYER_TURNS, { endMs: startMs + 90000 }), detail: sessionDetail(id, startMs, BUYER_TURNS) }; return id; }
const NOW = () => new Date().toISOString();
async function member(env, id, email, { staff = "", role = "user", plan = "visitor", name = "Test", title = "", company = "Test Co", phone = "" } = {}) {
  const t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at, name, title, phone) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)").bind(id, company, email, plan, t, t, role, t, name, title, phone).run();
  if (staff) await env.DB.prepare("INSERT INTO cc_staff (member_id, role, added_by, added_at, updated_at) VALUES (?, ?, 'test', ?, ?)").bind(id, staff, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
async function api(env, method, path, { token, body } = {}) {
  const h = { Origin: SITE, "CF-Connecting-IP": "10.9.0.1", "User-Agent": "Mozilla/5.0 test" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const p = [], ctx = { waitUntil: x => p.push(Promise.resolve(x).catch(() => null)) };
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await Promise.all(p);
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}
const R = "/api/admin/cc/dev/calls-report";
const tagRow = (env, tag, o) => env.DB.prepare("INSERT INTO call_sessions (tag, agent, lang, subject, member_id, staff, app, ctx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
  .bind(tag, o.agent || "janna", o.lang || "ar", o.subject || "", o.member_id || "", o.staff || 0, o.app || "", o.ctx || "", o.at || "2026-11-20T09:17:00.000Z").run();

describe("calls report: the schedule and the gate", () => {
  test("nothing before the time; one e-mail per day; the gate + the audit row only after the provider's id", async () => {
    const env = env0(); addAtlal(); addBuyer();
    assert.deepEqual(await cron(env, Date.parse("2026-11-21T06:00:00Z")), { skipped: "before_time" }, "08:00 Cairo < 08:30");
    assert.equal(st.calls.length, 0, "nothing was read before the time");
    const r = await cron(env);
    assert.deepEqual([r.sent, r.day, r.conversations], [true, D, 2], JSON.stringify(r));
    assert.equal(st.mails.length, 1);
    const m = st.mails[0];
    assert.deepEqual([m.to, m.from.split(" <")[1], m.reply_to], [["info@madeinegyptgate.com", "owner@mig.test"], "noreply@madeinegyptgate.com>", "info@madeinegyptgate.com"], "the default: the platform's own mailboxes (TEAM_EMAIL + ADMIN_EMAILS)");
    assert.ok(m.subject.startsWith("تقرير مكالمات جنة وباسم — الجمعة ٢٠ نوفمبر: ٢ مكالمة") && m.subject.includes("/ Calls report 2026-11-20: 2 calls"), m.subject);
    assert.deepEqual(await gate(env), ["calls-report"]);
    const a = await audits(env, "calls_report.sent");
    assert.deepEqual([a.length, a[0].actor_id, a[0].target_id, JSON.parse(a[0].after_json).provider_id], [1, "system", D, "re_1"]);
    assert.match(a[0].summary, /^2 conversations → i•••@madeinegyptgate\.com, o•••@mig\.test$/);
    const before = st.calls.length;
    assert.deepEqual(await cron(env, AT + 15 * 60000), { skipped: "done", day: D });
    assert.equal(st.calls.length, before, "no second read, no second e-mail");
    const log = await rowsOf(env, "SELECT msg_id, template, status, to_masked, subject FROM cc_mail_log");
    assert.deepEqual([log[0].msg_id, log[0].template, log[0].status, log[0].to_masked], ["callrep-" + D, "team_calls_report", "sent", "i•••@madeinegyptgate.com +1"]);
  });
  test("a provider failure: no gate, the counter goes up; the 7th failure → calls-report-failed + its audit row; the next report says so", async () => {
    const env = env0(); addAtlal();
    st.resend = () => new Response(JSON.stringify({ message: "temporary" }), { status: 500, headers: { "Content-Type": "application/json" } });
    for (let k = 1; k <= 6; k++) {
      const r = await cron(env, AT + k * 60000);
      assert.deepEqual([r.sent, r.tries], [false, k]);
      assert.deepEqual(await gate(env), [], "the gate stays open");
    }
    const r7 = await cron(env, AT + 7 * 60000);
    assert.deepEqual([r7.failed, r7.tries], [true, 7]);
    assert.deepEqual(await gate(env), ["calls-report-failed"]);
    const f = await audits(env, "calls_report.failed");
    assert.equal(f.length, 1); assert.match(JSON.parse(f[0].after_json).reason, /resend 500/);
    assert.deepEqual(await cron(env, AT + 8 * 60000), { skipped: "done", day: D }, "then it stops");
    // the next morning's report starts with the notice
    st.resend = null; st.mails.length = 0;
    const r = await cron(env, AT + 86400000);
    assert.equal(r.sent, true);
    assert.ok(st.mails[0].text.startsWith("! تقرير يوم ٢٠٢٦-١١-٢٠ ماتبعتش"), st.mails[0].text.slice(0, 120));
  });
  test("a run that breaks counts as a failed try (its reason masked): a bug never re-reads Anam every 15 minutes for the whole day", async () => {
    const env = env0(); addAtlal();
    const err = console.error; console.error = () => {};
    try {
      const bad = { ...CC, get lookup() { throw new Error("boom for 01099999912"); } };
      for (let k = 1; k <= 7; k++) {
        const r = await callsReportCron(env, AT + k * 60000, bad, { sleep: nap });
        assert.deepEqual([r.sent, r.tries, r.failed || false], [false, k, k === 7], JSON.stringify(r));
        assert.ok(r.error.includes("boom") && !r.error.includes("01099999912"), r.error);
      }
      assert.equal(anamCalls().length, 0, "it broke before any Anam read");
      assert.deepEqual(await gate(env), ["calls-report-failed"]);
      assert.equal((await audits(env, "calls_report.failed")).length, 1);
      assert.deepEqual(await callsReportCron(env, AT + 9 * 60000, bad, { sleep: nap }), { skipped: "done", day: D });
      assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM rl WHERE k = ?").bind("callrep-lock|" + D).first("n"), 0, "the lock is always dropped");
    } finally { console.error = err; }
  });
  test("dedup:true (deliver already sent that id) closes the gate without a second e-mail", async () => {
    const env = env0(); addAtlal();
    await env.DB.prepare("INSERT INTO cc_mail_log (at, msg_id, template, list, to_hash, to_masked, subject, provider, provider_id, status, error, ms) VALUES (?, ?, 'team_calls_report', '', 'h', 'i•••@madeinegyptgate.com', 's', 'resend', 're_old', 'sent', '', 1)").bind(NOW(), "callrep-" + D).run();
    const r = await cron(env);
    assert.deepEqual([r.sent, r.dedup, st.mails.length], [true, true, 0]);
    assert.deepEqual(await gate(env), ["calls-report"]);
    assert.equal(JSON.parse((await audits(env, "calls_report.sent"))[0].after_json).dedup, true);
  });
  test("the switch OFF → nothing at all: no Anam GET, no e-mail, no gate", async () => {
    const env = env0(); addAtlal();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?)").bind(JSON.stringify({ v: 1, values: { calls_report: false } }), NOW()).run();
    forgetFeatures(env);
    const seen = [], prep = env.DB.prepare.bind(env.DB); env.DB.prepare = sql => { seen.push(sql); return prep(sql); };
    assert.deepEqual(await cron(env), { skipped: "feature_off" });
    assert.deepEqual([st.calls.length, st.mails.length], [0, 0]);
    assert.ok(seen.every(sql => /FROM cc_settings WHERE k = \? AND scope = 'system'/.test(sql)), "only the switch itself was read: " + seen.join(" | "));
    assert.deepEqual(await gate(env), []);
  });
  test("the template switched off in «البريد» → skipped, the gate is written (Anam is read once, never again that day)", async () => {
    const env = env0(); addAtlal();
    await env.DB.prepare("INSERT INTO cc_mail_templates (key, enabled, updated_at) VALUES ('team_calls_report', 0, ?)").bind(NOW()).run();
    const r = await cron(env);
    assert.deepEqual([r.sent, r.skipped, st.mails.length], [false, "template_off", 0]);
    assert.deepEqual(await gate(env), ["calls-report"]);
    assert.equal((await audits(env, "calls_report.skipped")).length, 1);
    const n = anamCalls().length;
    await cron(env, AT + 15 * 60000);
    assert.equal(anamCalls().length, n);
  });
  test("an empty day: a short report (empty = send, the default) or nothing (empty = skip, with the gate)", async () => {
    const env = env0();
    assert.equal((await cron(env)).sent, true);
    assert.ok(st.mails[0].text.includes("مفيش مكالمة عميل") && st.mails[0].subject.includes(": ٠ مكالمة"), st.mails[0].subject);
    const e2 = env0();
    await e2.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'system', ?, ?)").bind(CALLS_REPORT_KEY, JSON.stringify({ v: 1, to: [], empty: "skip" }), NOW()).run();
    st.mails.length = 0;
    assert.deepEqual(await cron(e2), { ran: true, day: D, skipped: "empty" });
    assert.deepEqual([st.mails.length, await gate(e2)], [0, ["calls-report"]]);
  });
  test("the first tick after a deploy (any hour from the time on) sends the day before at once; the owner's later time waits", async () => {
    const env = env0(); addAtlal(1, Date.parse("2026-11-20T10:00:00Z"));
    const r = await cron(env, Date.parse("2026-11-21T12:15:00Z")); // 14:15 Cairo: the deploy happened at noon
    assert.deepEqual([r.sent, r.day], [true, D]);
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'system', ?, ?)").bind(CALLS_REPORT_KEY, JSON.stringify({ v: 1, to: ["owner@madeinegyptgate.com"], time: "10:00" }), NOW()).run();
    assert.deepEqual(await cron(env, Date.parse("2026-11-22T07:30:00Z")), { skipped: "before_time" }, "09:30 Cairo < 10:00");
    assert.equal((await cron(env, Date.parse("2026-11-22T08:05:00Z"))).day, D1_);
    assert.deepEqual(st.mails.at(-1).to, ["owner@madeinegyptgate.com"]);
  });
  test("platformCron runs the job after memory_day, never in the tick where the daily digests ran (the next tick sends it)", async () => {
    const env = env0(); addAtlal();
    const out1 = await platformCron(env, AT); // a fresh database: the day's digests run in this tick → no calls report in it
    assert.ok(out1.daily.ran && /daily digests/.test(out1.calls_report.skipped), JSON.stringify(out1.calls_report));
    assert.equal(st.mails.filter(x => /^تقرير مكالمات/.test(x.subject)).length, 0);
    const out = await platformCron(env, AT + 15 * 60000);
    assert.ok(Object.keys(out).indexOf("calls_report") > Object.keys(out).indexOf("memory_day"));
    assert.ok(!(out.daily && out.daily.ran));
    assert.equal(out.calls_report.sent, true, JSON.stringify(out.calls_report));
    assert.equal(st.mails.filter(x => /^تقرير مكالمات/.test(x.subject)).length, 1);
  });
});

describe("calls report: the day window", () => {
  test("23:50 Cairo belongs to its day, 00:10 to the next one; the Anam list asks for exactly the Cairo day", async () => {
    const env = env0();
    const late = addAtlal(1, Date.parse("2026-11-20T21:50:00Z")), early = addBuyer(2, Date.parse("2026-11-20T22:10:00Z"));
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    assert.deepEqual(b.rep.convs.flatMap(c => c.sessions), [late]);
    const list = new URL(anamCalls()[0].url);
    assert.deepEqual([list.searchParams.get("from"), list.searchParams.get("to"), list.searchParams.get("perPage")], [dayStartIso(D), dayAfterIso(D), "50"]);
    const b2 = await buildReport(env, { day: D1_, nowMs: AT + 86400000, settings: await readSettings(env), CC, sleep: nap });
    assert.deepEqual(b2.rep.convs.flatMap(c => c.sessions), [early]);
  });
  test("over DST the window is 23 h in spring and 25 h in autumn (Africa/Cairo), and the list follows it", async () => {
    for (const [d, h] of [["2026-04-24", 23], ["2026-10-29", 25], ["2026-11-20", 24]]) assert.equal((Date.parse(dayAfterIso(d)) - Date.parse(dayStartIso(d))) / 3600e3, h, d);
    const env = env0();
    await buildReport(env, { day: "2026-10-29", nowMs: Date.parse("2026-10-30T07:00:00Z"), settings: await readSettings(env), CC, sleep: nap });
    const u = new URL(anamCalls()[0].url);
    assert.deepEqual([u.searchParams.get("from"), u.searchParams.get("to")], ["2026-10-28T21:00:00.000Z", "2026-10-29T22:00:00.000Z"]);
  });
});

describe("calls report: reading Anam", () => {
  test("120 sessions: ≤ 150 GETs per run (perPage 50, 2 per session), the longest first, the rest counted with a note", async () => {
    const env = env0();
    for (let k = 0; k < 120; k++) addBuyer(100 + k, T_BUYER + k * 60000, { lenMs: 30000 + k * 1000 });
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const gets = anamCalls();
    assert.ok(gets.length <= CALLS_LIM.anamGets, "GETs: " + gets.length);
    const lists = gets.filter(c => new URL(c.url).pathname === "/v1/sessions");
    assert.deepEqual([lists.length, lists.every(c => new URL(c.url).searchParams.get("perPage") === "50")], [3, true]);
    assert.equal(b.counts.notRead, 120 - Math.floor((CALLS_LIM.anamGets - 3) / 2));
    assert.ok(b.rendered.text.includes(" مكالمة مااتقرتش من Anam"), "the truncation note");
    const read = new Set(gets.map(c => (/sessions\/([0-9a-f-]{36})/.exec(c.url) || [])[1]).filter(Boolean));
    assert.ok(read.has(sid(219)) && !read.has(sid(100)), "the longest sessions were read, the shortest only counted");
    assert.equal(b.rep.convs.length, 120);
    assert.equal(b.rep.convs.filter(c => c.review.verdict === "not_read").length, b.counts.notRead);
  });
  test("analytics 404 → the transcript is read (and the card says so); otherwise the transcript is never read; never the recording", async () => {
    const env = env0(); const a = addAtlal(); const bId = addBuyer();
    st.anStatus = { [bId]: 404 };
    st.sessions[bId].transcript = [{ role: "persona", message: "أهلاً بيك!", timestamp: new Date(T_BUYER).toISOString(), speakingDurationSeconds: 3 },
      { role: "user", message: "أنا محتاج مورد أكياس ورق كرافت", timestamp: new Date(T_BUYER + 15000).toISOString() }, { role: "persona", message: "تمام.", timestamp: new Date(T_BUYER + 18000).toISOString(), speakingDurationSeconds: 1 }];
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const tr = anamCalls().filter(c => /\/transcript/.test(c.url));
    assert.deepEqual(tr.map(c => (/sessions\/([0-9a-f-]{36})/.exec(c.url) || [])[1]), [bId]);
    assert.ok(!anamCalls().some(c => /recording/.test(c.url)));
    const cb = b.rep.convs.find(c => c.sessions.includes(bId)), ca = b.rep.convs.find(c => c.sessions.includes(a));
    assert.deepEqual([cb.notReady, ca.notReady], [true, false]);
    assert.ok(b.rendered.text.includes("تفاصيل Anam لسه ماوصلتش"));
  });
  test("Anam refuses the key (401 / 403) → a D1-only report with the banner (the memory's calls, searches; the timing rules «مش متاح»)", async () => {
    for (const code of [401, 403]) {
      const env = env0();
      st.listStatus = code; st.calls.length = 0;
      const m = await member(env, "m-bassem", "bm@example.com", { plan: "partner", name: "تجربة", title: "مهندس", company: "شركة المثال" });
      const at = "2026-11-20T10:00:0", call = "bc-test-call-0001";
      for (const [k, role, text] of [[1, "user", "عايز مناقصات حديد في كينيا"], [2, "persona", "ثواني بدوّر لك"], [3, "user", "ماشي"]])
        await env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, data_json, hash, agent) VALUES (?, 'turn', ?, ?, ?, ?, ?, 'bassem')").bind(m.m.id, call, at + k + ".000Z", text, JSON.stringify({ role, seq: k }), "turn|" + call + "|s" + k).run();
      await env.DB.prepare("INSERT INTO advisor_memory (member_id, kind, call_id, at, text, data_json, hash, agent) VALUES (?, 'search', ?, ?, ?, ?, ?, 'bassem')").bind(m.m.id, call, at + "5.000Z", "حديد كينيا — لا نتائج", JSON.stringify({ tool: "bassem_intel", query: "حديد كينيا", count: 0, results: [] }), "search|" + call + "||x").run();
      const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
      assert.equal(b.anam, "no_read");
      assert.ok(b.rendered.text.startsWith("! Anam رفض قراية الجلسات"), b.rendered.text.slice(0, 80));
      assert.equal(b.rep.convs.length, 1);
      const c = b.rep.convs[0];
      assert.deepEqual([c.agent, c.who.kind, c.who.name], ["bassem", "member", "تجربة"]);
      assert.ok(c.review.flags.some(f => f.code === "zero_results"));
      assert.ok(c.review.na.includes("promise_no_tool"));
      assert.ok(b.rendered.text.includes("مش متاح من غير Anam"));
      assert.equal((await audits(env, "calls_report.memory_read")).length, 1);
      assert.deepEqual(anamCalls().map(x => new URL(x.url).pathname), ["/v1/sessions"], "one refused list, nothing else");
    }
  });
  test("the client: one retry on 429 after min(Retry-After, 5 s); the cap holds (a retry counts); 4 at a time", async () => {
    let n = 0, live = 0, peak = 0; const waits = [];
    globalThis.fetch = async () => { n++; live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); live--; return n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "30" } }) : new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); };
    const A = anamClient("k", { cap: 9, sleep: ms => { waits.push(ms); return Promise.resolve(); } });
    const r = await A.get("/sessions/x");
    assert.deepEqual([r.status, n, waits], [200, 2, [5000]], "Retry-After 30 s → 5 s");
    await Promise.all(Array.from({ length: 10 }, () => A.get("/sessions/y")));
    assert.ok(n <= 9 && peak <= 4, n + " / " + peak);
    assert.deepEqual(await A.get("/z"), { status: 0, capped: true });
  });
  test("a list row is cut down at once: nothing of the persona snapshot, the client metadata or the user agent stays", () => {
    const x = listRow({ id: sid(5), label: "madeinegyptgate-janna-ar.abcdefghijkl", startMs: T_ATLAL, ua: UA_ANDROID, prompt: FAKE_BLOCK });
    const r = reduceRow(x, new Map());
    assert.deepEqual(Object.keys(r).sort(), ["agent", "block", "device", "end", "exit", "id", "lang", "len", "meeting", "outside", "site", "start", "tag"]);
    assert.deepEqual([r.agent, r.lang, r.tag, r.site, r.device], ["janna", "ar", "abcdefghijkl", true, { os: "android", inapp: "", app: "" }]);
    assert.equal(JSON.stringify(r).includes("MEMORYLINE"), false);
    const b = reduceRow(listRow({ id: sid(6), label: "madeinegyptgate-bassem-ar", startMs: T_ATLAL, prompt: "x\n" + FAKE_BLOCK }), new Map());
    assert.deepEqual(b.block, { title: "مهندس", first: "تامر", company: "شركة المثال للاختبارات", sector: "صناعات تجريبية", plan: "الشريك الأساسي", anonymous: false });
    assert.equal(reduceRow(listRow({ id: sid(7), label: "avatar-video-render", startMs: T_ATLAL }), new Map()), null, "not a call of the site's personas");
    assert.equal(reduceRow(listRow({ id: sid(8), label: null, personaId: JANNA_AR, startMs: T_ATLAL }), new Map()).outside, true, "a share link / widget call");
    assert.deepEqual([deviceOf("x MIGApp/1.0.0 (ios)").app, deviceOf(UA_IPHONE_GSA).inapp, deviceOf("").os], ["ios", "google", ""]);
    assert.equal(memberBlock("no block here"), null);
  });
});

describe("calls report: who talked", () => {
  test("a member only with that call's own sign-in; a signed-out call from a linked visitor id stays «زائر» (no visits, no stage); an unlinked one shows them", async () => {
    const env = env0();
    const owner = await member(env, "m-1", "member.one@example.com", { name: "عضو تجربة", title: "أستاذ", company: "شركة العضو التجريبية", plan: "basic", phone: "01000000077" });
    const vLinked = "a".repeat(32), vFree = "b".repeat(32);
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, member_id, link_via, first_at, last_at, calls, stage) VALUES (?, 'm-1', 'session', ?, ?, 4, 'member'), (?, '', '', ?, ?, 3, 'interested')").bind(vLinked, NOW(), NOW(), vFree, NOW(), NOW()).run();
    addAtlal(1, T_ATLAL, { label: "madeinegyptgate-janna-ar.aaaaaaaaaaaa" }); await tagRow(env, "aaaaaaaaaaaa", { subject: "v:" + vLinked, member_id: "" });            // signed out
    addBuyer(2, T_BUYER, { label: "madeinegyptgate-janna-ar.bbbbbbbbbbbb" }); await tagRow(env, "bbbbbbbbbbbb", { subject: "v:" + vFree });
    addBuyer(3, T_BUYER + 3600e3, { label: "madeinegyptgate-janna-ar.cccccccccccc" }); await tagRow(env, "cccccccccccc", { subject: "v:" + vLinked, member_id: "m-1" }); // his own sign-in
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const by = n => b.rep.convs.find(c => c.sessions.includes(sid(n))).who;
    assert.deepEqual([by(1).kind, by(1).name, by(1).visits, by(1).stage, by(1).confidence], ["visitor", undefined, undefined, undefined, "sure"]);
    assert.match(by(1).alias, /^[0-9a-f]{4}$/);
    assert.deepEqual([by(2).kind, by(2).visits, by(2).stage], ["visitor", 3, "interested"]);
    assert.deepEqual([by(3).kind, by(3).name, by(3).company, by(3).email, by(3).phone, by(3).link], ["member", "عضو تجربة", "شركة العضو التجريبية", "m•••@example.com", "…٧٧", SITE + "/admin/#users/m-1"]);
    const again = await buildReport(env, { day: D, nowMs: AT + 3600e3, settings: await readSettings(env), CC, sleep: nap });
    assert.equal(again.rep.convs.find(c => c.sessions.includes(sid(1))).who.alias, by(1).alias, "the alias of one visitor id is stable");
    assert.notEqual(by(2).alias, by(1).alias, "two visitor ids, two aliases");
    assert.ok(!b.rendered.html.includes(vLinked) && !b.rendered.csv.includes(vLinked) && !b.rendered.html.includes("aaaaaaaaaaaa"), "never the raw visitor id or the tag");
    const fill = await rowsOf(env, "SELECT tag, session_id FROM call_sessions ORDER BY tag");
    assert.deepEqual(fill.map(r => r.session_id), [sid(1), sid(2), sid(3)], "the report fills session_id of the tags it found");
    void owner;
  });
  test("a session of a meeting without recording consent: counts, the outcome and the booking only — no text read, no quote, no «قالت»", async () => {
    const env = env0(); const id = addBuyer();
    await env.DB.prepare("INSERT INTO meetings (id, kind, status, name, email, phone, company, language, consent, starts_at, session_id, created_at, updated_at) VALUES ('mt1', 'instant', 'ended', 'زائر تجريبي', 'guest.person@example.com', '01111111188', 'شركة الضيف', 'ar', 0, ?, ?, ?, ?)").bind(new Date(T_BUYER).toISOString(), id, NOW(), NOW()).run();
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const urls = anamCalls().map(c => c.url).filter(u => u.includes(id));
    assert.deepEqual(urls, ["https://api.anam.ai/v1/sessions/" + id + "/analytics"], "the analytics without messages only (no tool calls, no transcript)");
    const c = b.rep.convs[0];
    assert.deepEqual([c.review.verdict, c.consentless, c.who.kind, c.who.name, c.who.email], ["no_consent", true, "meeting", "زائر تجريبي", "g•••@example.com"]);
    for (const s of ["قالت", "أكياس ورق كرافت", "شركة التجربة لأكياس الورق"]) assert.ok(!b.rendered.html.includes(s) && !b.rendered.text.includes(s), s);
    assert.ok(b.rendered.text.includes("من غير موافقة تسجيل"));
  });
  test("a request made from the call carries its session id → «مؤكد», its ref, status, routed count and Control Center link; masked contacts", async () => {
    const env = env0(); const id = addBuyer();
    await env.DB.prepare("INSERT INTO inquiries (id, ref, kind, name, company, email, phone, payload_json, status, source, routed_count, created_at, updated_at) VALUES ('q1', 'MIG-26-TEST01', 'rfq', 'مشتري تجريبي', 'شركة الشراء', 'buyer.person@example.com', '01222222299', ?, 'routed', 'janna', 2, ?, ?)")
      .bind(JSON.stringify({ product: "أكياس ورق", call_sid: id }), new Date(T_BUYER + 60000).toISOString(), new Date(T_BUYER + 60000).toISOString()).run();
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const c = b.rep.convs[0];
    assert.equal(c.review.verdict, "useful");
    assert.ok(c.outcomes[0].ar.includes("MIG-26-TEST01") && c.outcomes[0].ar.includes("(مؤكد)") && c.outcomes[0].ar.includes("اتبعت لـ ٢ مصنع مسجّل"), c.outcomes[0].ar);
    assert.ok(c.outcomes[0].ar.includes("b•••@example.com") && c.outcomes[0].ar.includes("…٩٩") && !c.outcomes[0].ar.includes("buyer.person"), c.outcomes[0].ar);
    assert.equal(c.outcomes[0].link, SITE + "/admin/#messages/MIG-26-TEST01");
    assert.deepEqual(b.counts.outcomes.rfqs, ["MIG-26-TEST01"]);
  });
  test("list rows whose snapshot holds a member block and memory lines: none of it reaches the e-mail or the CSV (an untagged Bassem session: only title + first name, company, sector, plan)", async () => {
    const env = env0();
    await member(env, "m-2", "member.two@example.com", { name: "صاحب الحساب", company: "شركة الحساب", plan: "partner" });
    addAtlal(1, T_ATLAL, { prompt: "جنة\n" + FAKE_BLOCK });
    addBuyer(2, T_BUYER, { label: "madeinegyptgate-bassem-ar.dddddddddddd", prompt: "باسم\n" + FAKE_BLOCK }); await tagRow(env, "dddddddddddd", { agent: "bassem", member_id: "m-2" });
    addBuyer(3, T_BUYER + 3600e3, { label: "madeinegyptgate-bassem-ar", prompt: "باسم\n" + FAKE_BLOCK });
    const b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const all = b.rendered.html + "\n" + b.rendered.text + "\n" + b.rendered.csv;
    for (const s of ["MEMORYLINE", "SECRETSIGNATURE", "صفقة سرية", "عبد الاختبار", "بداية ذاكرة باسم", "ناديه بيهم", "اتكلمي مصري"]) assert.ok(!all.includes(s), s);
    const tagged = b.rep.convs.find(c => c.sessions.includes(sid(2))).who, untagged = b.rep.convs.find(c => c.sessions.includes(sid(3))).who;
    assert.deepEqual([tagged.name, tagged.company], ["صاحب الحساب", "شركة الحساب"], "the tag names the member: his account, not the snapshot");
    assert.deepEqual([untagged.title, untagged.name, untagged.company, untagged.plan, untagged.sector], ["مهندس", "تامر", "شركة المثال للاختبارات", "الشريك الأساسي", "صناعات تجريبية"]);
  });
  test("staff: an active Control Center role (or call_sessions.staff) → «اختبارات الفريق» (one line by default, cards with tests = full, hidden with off)", async () => {
    const env = env0();
    await member(env, "m-st", "staffer@madeinegyptgate.com", { staff: "support", name: "موظف تجربة" });
    addBuyer(2, T_BUYER, { label: "madeinegyptgate-janna-ar.eeeeeeeeeeee" }); await tagRow(env, "eeeeeeeeeeee", { member_id: "m-st" });
    addAtlal(1, T_ATLAL);
    let b = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    assert.deepEqual(b.rep.convs.map(c => c.kind).sort(), ["customer", "team"]);
    assert.ok(b.rendered.text.includes("== اختبارات الفريق ==") && b.rendered.text.includes("مكالمات الفريق: ١"));
    for (const [tests, cards, shown] of [["full", true, true], ["off", false, false]]) {
      const s = { ...(await readSettings(env)), tests };
      b = await buildReport(env, { day: D, nowMs: AT, settings: s, CC, sleep: nap });
      assert.equal(b.rendered.text.includes("== اختبارات الفريق =="), shown, tests);
      assert.equal((b.rendered.text.match(/^• /gm) || []).length, cards ? 2 : 1, tests + " cards");
    }
  });
});

describe("calls report: the memory read and the 0011 fallback", () => {
  test("the cc_audit row calls_report.memory_read is written BEFORE the memory is read (and no memory read without it)", async () => {
    const env = env0(); addAtlal();
    const seen = [], prep = env.DB.prepare.bind(env.DB); env.DB.prepare = sql => { seen.push(sql); return prep(sql); };
    await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const a = seen.findIndex(s => /^INSERT INTO cc_audit/.test(s)), m = seen.findIndex(s => /FROM advisor_memory WHERE/.test(s)); // (hasTable's `SELECT 1 AS x … LIMIT 1` reads no row's content)
    assert.ok(a >= 0 && m > a, a + " < " + m);
    // the audit cannot be written → the memory is not read, and the report says so
    const e2 = env0(); st.calls.length = 0;
    e2.DB.db.exec("DROP TABLE cc_audit");
    const seen2 = [], p2 = e2.DB.prepare.bind(e2.DB); e2.DB.prepare = sql => { seen2.push(sql); return p2(sql); };
    const b2 = await buildReport(e2, { day: D, nowMs: AT, settings: await readSettings(e2), CC, sleep: nap });
    assert.ok(!seen2.some(s => /FROM advisor_memory WHERE kind IN/.test(s)));
    assert.ok(b2.rendered.text.includes("ذاكرة جنة وباسم مااتقرتش"));
  });
  test("migration 0011 not applied (its tables dropped) → the report still goes out, with the other joins and the note «شغّل 0011»", async () => {
    const env = env0(); addAtlal(1, T_ATLAL, { label: "madeinegyptgate-janna-ar.ffffffffffff" });
    env.DB.db.exec("DROP TABLE call_sessions; DROP TABLE call_reviews");
    const r = await cron(env);
    assert.equal(r.sent, true);
    assert.ok(st.mails[0].text.includes("0011_calls_report.sql لسه ماتشغّلش") && st.mails[0].text.includes("شغّل 0011"));
  });
});

describe("calls report: the owner's API", () => {
  test("owner only: admin / support → 403 owner_only; the owner reads it; the default-recipient note while no address is saved", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test"), adm = await member(env, "u-adm", "adm@mig.test", { role: "admin" }), sup = await member(env, "u-sup", "sup@mig.test", { staff: "support" });
    for (const s of [adm, sup]) for (const [m, p, b] of [["GET", R], ["PUT", R, { time: "09:00" }], ["POST", R + "/send", { day: D }], ["GET", R + "/preview?day=" + D]]) {
      const x = await api(env, m, p, { token: s.token, body: b });
      assert.deepEqual([x.status, x.data.code], [403, "owner_only"], m + " " + p);
    }
    const g = await api(env, "GET", R, { token: o.token });
    assert.equal(g.status, 200, g.text);
    assert.deepEqual([g.data.using_default, g.data.recipients, g.data.settings.time, g.data.settings.detail, g.data.feature.effective, g.data.anam.ok], [true, ["info@madeinegyptgate.com", "o•••@mig.test"], "08:30", "masked", true, true],
      "the default recipients: the platform's own address in clear, any other one masked");
    assert.equal(g.data.runs.length, 7);
    // the e-mail itself carries the note while the default applies
    addAtlal();
    await cron(env);
    assert.ok(st.mails[0].text.includes("المستلم الافتراضي: info@madeinegyptgate.com"), "the default-recipient note: " + st.mails[0].text.slice(-700));
  });
  test("PUT: 1–5 valid addresses; an outside address needs confirm_external; «full» only to madeinegyptgate.com and with the owner's confirmation; audited, masked", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    const put = b => api(env, "PUT", R, { token: o.token, body: b });
    for (const [b, code] of [[{ to: [] }, "invalid_recipients"], [{ to: ["a@b", "x"] }, "invalid_recipients"], [{ to: ["1@madeinegyptgate.com", "2@madeinegyptgate.com", "3@madeinegyptgate.com", "4@madeinegyptgate.com", "5@madeinegyptgate.com", "6@madeinegyptgate.com"] }, "invalid_recipients"],
      [{ to: ["boss@example.net"] }, "external_confirm_required"], [{ to: ["boss@example.net"], confirm_external: true, detail: "full", confirm_full: true }, "full_internal_only"],
      [{ to: ["boss@madeinegyptgate.com"], detail: "full" }, "full_confirm_required"], [{ time: "04:59" }, "invalid_time"], [{ time: "12:01" }, "invalid_time"], [{ keep_days: 10 }, "invalid_keep_days"],
      [{ tests: "all" }, "invalid_tests"], [{ empty: "maybe" }, "invalid_empty"], [{ detail: "raw" }, "invalid_detail"]]) {
      const r = await put(b);
      assert.deepEqual([r.status, r.data.code], [400, code], JSON.stringify(b));
    }
    assert.equal((await audits(env, "dev.calls_report")).length, 0, "nothing saved, nothing audited");
    let r = await put({ to: ["boss@example.net"], confirm_external: true, time: "07:45", keep_days: 0 });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.data.settings.to, r.data.settings.time, r.data.settings.keep_days, r.data.using_default], [["boss@example.net"], "07:45", 0, false]);
    r = await put({ to: ["boss@madeinegyptgate.com"], detail: "full", confirm_full: true });
    assert.deepEqual([r.status, r.data.settings.detail, r.data.settings.full_confirmed], [200, "full", true]);
    const a = await audits(env, "dev.calls_report");
    assert.equal(a.length, 2);
    assert.ok(!a.some(x => /boss@/.test(x.before_json + x.after_json + x.summary)), "the recipients are masked in the audit");
    assert.ok(JSON.parse(a[1].after_json).full_confirmed, "the full-contacts confirmation is in the audit row");
    assert.deepEqual(JSON.parse(a[1].after_json).to, ["b•••@madeinegyptgate.com"]);
    const s = await readSettings(env);
    assert.deepEqual([s.to, s.detail, s.usingDefault], [["boss@madeinegyptgate.com"], "full", false]);
    r = await put({ use_default: true, detail: "masked" });
    assert.deepEqual([r.status, r.data.using_default, r.data.settings.detail], [200, true, "masked"]);
  });
  test("«full» adds the members' clear e-mail and mobile — never anything from a transcript; «masked» (the default) shows a•••@domain", async () => {
    const env = env0();
    await member(env, "m-1", "member.one@example.com", { name: "عضو تجربة", phone: "01000000077" });
    addBuyer(2, T_BUYER, { label: "madeinegyptgate-janna-ar.gggggggggggg" }); await tagRow(env, "gggggggggggg", { member_id: "m-1" });
    st.sessions[sid(2)].an.turns[1].userMessage = "أنا محتاج مورد أكياس ورق كرافت، رقمي 01099999911 وإيميلي spoken.contact@example.org";
    const masked = await buildReport(env, { day: D, nowMs: AT, settings: await readSettings(env), CC, sleep: nap });
    const full = await buildReport(env, { day: D, nowMs: AT, settings: { ...(await readSettings(env)), detail: "full" }, CC, sleep: nap });
    assert.ok(masked.rendered.html.includes("m•••@example.com") && !masked.rendered.html.includes("member.one@"));
    assert.ok(full.rendered.html.includes("member.one@example.com") && full.rendered.html.includes("01000000077"));
    for (const b of [masked, full]) for (const s of ["01099999911", "spoken.contact"]) assert.ok(!b.rendered.html.includes(s) && !b.rendered.csv.includes(s), s);
  });
  test("send: ≤ 3 per report day (callrep-<D>-r1…r3), audited, and it closes the day's gate; preview: nothing sent, ≤ 6 per 10 min, audited; OFF → 503 feature_off", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test"); addAtlal();
    for (let k = 1; k <= 3; k++) {
      const r = await api(env, "POST", R + "/send", { token: o.token, body: { day: D } });
      assert.deepEqual([r.status, r.data.sent, r.data.resend], [200, true, k], r.text);
    }
    assert.deepEqual(st.mails.length, 3);
    assert.deepEqual((await rowsOf(env, "SELECT msg_id FROM cc_mail_log ORDER BY id")).map(x => x.msg_id), ["callrep-" + D + "-r1", "callrep-" + D + "-r2", "callrep-" + D + "-r3"]);
    assert.equal((await api(env, "POST", R + "/send", { token: o.token, body: { day: D } })).status, 429);
    assert.equal((await audits(env, "calls_report.send")).length, 3);
    assert.deepEqual(await gate(env), ["calls-report"], "a manual send closes the cron's gate for that day");
    assert.deepEqual(await cron(env), { skipped: "done", day: D });
    assert.equal((await api(env, "POST", R + "/send", { token: o.token, body: { day: "2026-13-01" } })).data.code, "invalid_day");
    st.mails.length = 0;
    for (let k = 1; k <= 6; k++) {
      const p = await api(env, "GET", R + "/preview?day=" + D, { token: o.token });
      assert.equal(p.status, 200, p.text);
      assert.ok(p.data.html.startsWith('<div dir="rtl"') && p.data.subject.includes("تقرير مكالمات جنة وباسم") && p.data.text.includes("== الخلاصة"));
    }
    assert.equal((await api(env, "GET", R + "/preview?day=" + D, { token: o.token })).status, 429);
    assert.equal(st.mails.length, 0, "a preview sends nothing");
    assert.equal((await audits(env, "calls_report.preview")).length, 6);
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?)").bind(JSON.stringify({ v: 1, values: { calls_report: false } }), NOW()).run();
    forgetFeatures(env);
    const off = await api(env, "POST", R + "/send", { token: o.token, body: { day: D } });
    assert.deepEqual([off.status, off.data.code], [503, "feature_off"]);
  });
  test("the developer panel's log lists the calls report's actions", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    await api(env, "PUT", R, { token: o.token, body: { time: "09:15" } });
    await api(env, "GET", R + "/preview?day=" + D, { token: o.token });
    const a = await api(env, "GET", "/api/admin/cc/dev/audit", { token: o.token });
    assert.deepEqual(a.data.items.map(x => x.action).filter(x => /calls_report/.test(x)).sort(), ["calls_report.preview", "dev.calls_report"]);
  });
});

describe("calls report: the legal erasure takes its rows", () => {
  test("memory erase (a visitor id) and the account deletion (a member) delete call_sessions and call_reviews rows; others stay", async () => {
    const env = env0(), o = await member(env, "u-owner", "owner@mig.test");
    const v = "c".repeat(32);
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, first_at, last_at, calls) VALUES (?, ?, ?, 1)").bind(v, NOW(), NOW()).run();
    await tagRow(env, "hhhhhhhhhhhh", { subject: "v:" + v }); await tagRow(env, "iiiiiiiiiiii", { subject: "v:" + "d".repeat(32) });
    await env.DB.prepare("INSERT INTO call_reviews (session_id, day, agent, subject, created_at) VALUES (?, ?, 'janna', ?, ?), (?, ?, 'janna', 'v:other', ?)").bind(sid(1), D, "v:" + v, NOW(), sid(2), D, NOW()).run();
    const dry = await api(env, "POST", "/api/admin/cc/memory/erase", { token: o.token, body: { visitor_id: v, reason: "طلب رسمي من صاحب البيانات", confirm: v, dry_run: true } });
    assert.deepEqual([dry.status, dry.data.counts.call_sessions, dry.data.counts.call_reviews], [200, 1, 1], dry.text);
    const er = await api(env, "POST", "/api/admin/cc/memory/erase", { token: o.token, body: { visitor_id: v, reason: "طلب رسمي من صاحب البيانات", confirm: v } });
    assert.equal(er.status, 200, er.text);
    assert.deepEqual((await rowsOf(env, "SELECT tag FROM call_sessions")).map(r => r.tag), ["iiiiiiiiiiii"]);
    assert.deepEqual((await rowsOf(env, "SELECT session_id FROM call_reviews")).map(r => r.session_id), [sid(2)]);
    // the account deletion: his own calls (member_id) and his linked visitor ids' rows
    const m = await member(env, "m-del", "gone@example.com");
    const vm = "e".repeat(32);
    await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, member_id, link_via, first_at, last_at) VALUES (?, 'm-del', 'session', ?, ?)").bind(vm, NOW(), NOW()).run();
    await tagRow(env, "jjjjjjjjjjjj", { agent: "bassem", member_id: "m-del" }); await tagRow(env, "kkkkkkkkkkkk", { subject: "v:" + vm });
    await env.DB.prepare("INSERT INTO call_reviews (session_id, day, agent, subject, created_at) VALUES (?, ?, 'bassem', 'm-del', ?)").bind(sid(3), D, NOW()).run();
    const del = await api(env, "DELETE", "/api/admin/cc/members/m-del", { token: o.token, body: { confirm: "gone@example.com", reason: "طلب رسمي بمسح البيانات" } });
    assert.equal(del.status, 200, del.text);
    assert.deepEqual((await rowsOf(env, "SELECT tag FROM call_sessions ORDER BY tag")).map(r => r.tag), ["iiiiiiiiiiii"]);
    assert.deepEqual((await rowsOf(env, "SELECT session_id FROM call_reviews")).map(r => r.session_id), [sid(2)]);
    assert.match(JSON.parse((await audits(env, "member.delete"))[0].after_json).call_rows + "", /^3$/);
    void m;
  });
});

describe("calls report: small helpers", () => {
  test("the Arabic day label and the defaults", async () => {
    assert.equal(dayLabelAr("2026-11-20"), "الجمعة ٢٠ نوفمبر");
    const s = await readSettings(env0());
    assert.deepEqual([s.time, s.detail, s.tests, s.empty, s.keep_days, s.usingDefault, s.to], ["08:30", "masked", "summary", "send", 180, true, ["info@madeinegyptgate.com", "owner@mig.test"]]);
  });
});
