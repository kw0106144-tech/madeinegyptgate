// node --test for the calls report's e-mail (src/calls-render.js): the size limits, the cards, the CSV (its formula guard), and a privacy scan
// of a whole report built end to end (src/calls-report.js buildReport) from SYNTHETIC sessions (test/calls-fixtures.mjs; the network is fully
// mocked: Anam's GET endpoints only). Nothing here comes from a real call.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CC } from "../src/index.js";
import { buildReport, readSettings } from "../src/calls-report.js";
import { renderReport, csvOf, subjectOf, RENDER_LIM, CSV_COLS, FLAG } from "../src/calls-render.js";
import { maskPII } from "../src/text.js";
import { D1 } from "./helpers.mjs";
import { listRow, atlalSession, sid, mockNet, BUYER_TURNS, analytics, sessionDetail, UA_IPHONE_GSA, UA_ANDROID } from "./calls-fixtures.mjs";

const D = "2026-11-20", AT = Date.parse("2026-11-21T06:45:00Z"), T_ATLAL = Date.parse("2026-11-20T09:17:53Z"), T_BUYER = Date.parse("2026-11-20T12:00:00Z");
const NOW = () => new Date().toISOString();
const nap = () => Promise.resolve();
let st, realFetch;
beforeEach(() => { realFetch = globalThis.fetch; st = { rows: [], sessions: {} }; globalThis.fetch = mockNet(st); });
afterEach(() => { globalThis.fetch = realFetch; });
const env0 = () => ({ DB: new D1(), RESEND_API_KEY: "re_test", ANAM_API_KEY: "anam-test-key-00000000", ADVISOR_SECRET: "adv-secret-for-tests-0123456789", TEAM_EMAIL: "info@madeinegyptgate.com",
  MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>" });
const bytes = s => new TextEncoder().encode(s).length;
const VISITOR = "f".repeat(32), TAGS = ["kkkkmmmmnnnn", "ppppqqqqrrrr", "sssstttuuuvv"]; // letters no fixture UUID holds

/* a report of one day built end to end: the 8bacbfac-shaped seller call (a visitor, tagged), a buyer call of a member (tagged, his own
   sign-in), a meeting without recording consent, an untagged buyer call — with contacts the platform holds and contacts spoken in the call */
async function dayReport({ detail = "masked" } = {}) {
  const env = env0(), t = NOW();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at, name, title, phone) VALUES ('m-7', 'شركة العضو للتجربة', 'member.seven@example.com', 'basic', 1, ?, ?, 'user', ?, 'عضو سابع', 'أستاذ', '01000000071')").bind(t, t, t).run();
  await env.DB.prepare("INSERT INTO janna_visitors (visitor_id, member_id, link_via, first_at, last_at, calls, stage) VALUES (?, '', '', ?, ?, 2, 'interested')").bind(VISITOR, t, t).run();
  const a = sid(1), s = atlalSession(a, T_ATLAL);
  st.rows.push(listRow({ id: a, label: "madeinegyptgate-janna-ar." + TAGS[0], startMs: T_ATLAL, lenMs: s.endMs - T_ATLAL, ua: UA_IPHONE_GSA })); st.sessions[a] = { an: s.an, detail: s.detail };
  const b = sid(2), turnsB = BUYER_TURNS.map(x => (x.i === 1 ? { ...x, user: "أنا محتاج مورد أكياس ورق كرافت، كلمني على 01099999912 أو spoken.person@example.org" } : x));
  st.rows.push(listRow({ id: b, label: "madeinegyptgate-janna-ar." + TAGS[1], startMs: T_BUYER, lenMs: 90000, ua: UA_ANDROID })); st.sessions[b] = { an: analytics(b, T_BUYER, turnsB, { endMs: T_BUYER + 90000 }), detail: sessionDetail(b, T_BUYER, turnsB) };
  const m = sid(3), tm = T_BUYER + 2 * 3600e3;
  st.rows.push(listRow({ id: m, startMs: tm, lenMs: 120000 })); // a meeting with Janna is a Janna session of the meeting page (meetings.session_id) st.sessions[m] = { an: analytics(m, tm, BUYER_TURNS, { endMs: tm + 120000 }), detail: sessionDetail(m, tm, BUYER_TURNS) };
  await env.DB.prepare("INSERT INTO meetings (id, kind, status, name, email, phone, company, language, consent, starts_at, session_id, created_at, updated_at) VALUES ('mt-9', 'instant', 'ended', 'ضيف تجريبي', 'guest.nine@example.com', '01111111199', 'شركة الضيف', 'ar', 0, ?, ?, ?, ?)").bind(new Date(tm).toISOString(), m, t, t).run();
  const u = sid(4), tu = T_BUYER + 4 * 3600e3;
  st.rows.push(listRow({ id: u, startMs: tu, lenMs: 90000 })); st.sessions[u] = { an: analytics(u, tu, BUYER_TURNS, { endMs: tu + 90000 }), detail: sessionDetail(u, tu, BUYER_TURNS) };
  const ins = (tag, subject, member) => env.DB.prepare("INSERT INTO call_sessions (tag, agent, lang, subject, member_id, staff, app, ctx, created_at) VALUES (?, 'janna', 'ar', ?, ?, 0, '', '', ?)").bind(tag, subject, member, "2026-11-20T09:00:00.000Z").run();
  await ins(TAGS[0], "v:" + VISITOR, ""); await ins(TAGS[1], "v:" + "9".repeat(32), "m-7");
  const settings = { ...(await readSettings(env)), detail };
  return { env, ids: [a, b, m, u], b: await buildReport(env, { day: D, nowMs: AT, settings, CC, sleep: nap }) };
}
const clone = o => JSON.parse(JSON.stringify(o));
/* what a masked report may hold: the platform's own mailbox in clear (footer, default-recipient note) and masked addresses «a•••@domain»
   (maskPII would take those for addresses too) */
const withoutOwn = s => s.replace(/info@madeinegyptgate\.com/g, "").replace(/[^\s"(]•••@[a-z0-9.-]+\.[a-z]{2,}/gi, "");

describe("calls report e-mail: limits", () => {
  test("120 conversations: HTML ≤ 90 KB, ≤ 15 cards (the rest one line each), the CSV holds all 120 rows, the English twin is there", async () => {
    const { b } = await dayReport();
    const base = b.rep.convs.find(c => c.sessions.includes(sid(1)));
    assert.ok(base && base.review.verdict === "not_useful", "the seller call is a card");
    const rep = clone(b.rep);
    rep.convs = Array.from({ length: 120 }, (_, k) => { const c = clone(base); c.sessions = [sid(500 + k)]; c.startMs = T_ATLAL + k * 60000; c.time = "11:" + String(k % 60).padStart(2, "0"); return c; });
    const r = renderReport(rep);
    assert.ok(r.htmlBytes <= RENDER_LIM.htmlBytes && bytes(r.html) === r.htmlBytes, "HTML " + r.htmlBytes + " bytes");
    assert.ok(r.cards <= RENDER_LIM.cards && r.cards > 0, "cards " + r.cards);
    assert.equal((r.text.match(/^• /gm) || []).length, r.cards);
    assert.equal(r.csvRows, 120);
    assert.equal(r.csv.trim().split("\n").length, 121, "header + 120 rows");
    assert.equal(r.cards, RENDER_LIM.cards, "the cards are kept: the one-liners give way first");
    const rest = r.text.split("== باقي المكالمات ==")[1].split("\n==")[0], more = /^و([٠-٩]+) مكالمة تانية — التفاصيل في الملف المرفق$/m.exec(rest);
    const shown = (rest.match(/^- /gm) || []).length, left = more ? Number(more[1].replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))) : 0;
    assert.ok(shown >= 30, "at least 30 one-liners: " + shown);
    assert.equal(shown + left, 120 - r.cards, "every other call is one line, or counted in «و… مكالمة تانية»");
    const en = r.text.split("== Calls ==")[1];
    assert.equal((en.match(/^- /gm) || []).length, r.cards + shown, "the English list shows as many calls as the Arabic part");
    if (left) assert.match(en, new RegExp("… and " + left + " more calls — see the attached file"));
    assert.ok(r.text.includes("== Summary — " + D + " ==") && r.text.includes("== Calls ==") && r.html.includes('dir="ltr"'), "the English twin");
  });
  test("cards that would pass 90 KB become one line each (the loop gives cards back, never the size)", () => {
    const long = "ك".repeat(140);
    const conv = k => ({ agent: "janna", lang: "ar", kind: "customer", startMs: T_BUYER + k, time: "12:00", minutes: 9, parts: 1, sessions: [sid(900 + k)], device: { os: "android" },
      who: { kind: "visitor", alias: "ab12", confidence: "sure" }, outcomes: [], missed: Array.from({ length: 3 }, () => ({ ar: long, en: "x" })),
      review: { verdict: "not_useful", ask: "supplier_search", askQuote: long, personaQuote: long, flags: Object.keys(FLAG).slice(0, 8).map(code => ({ code, turns: [1, 2, 3], q: long })), na: [], searches: [], zeroQueries: [long], productWords: [], tools: 3, turns: 30 } });
    const rep = { day: D, dayAr: "الجمعة ٢٠ نوفمبر", counts: { conversations: 1200, customers: 1200 }, convs: Array.from({ length: 1200 }, (_, k) => conv(k)), settings: { tests: "summary" } };
    const r = renderReport(rep);
    assert.ok(r.htmlBytes <= RENDER_LIM.htmlBytes, "HTML " + r.htmlBytes);
    assert.ok(r.cards < RENDER_LIM.cards, "fewer cards to stay under 90 KB: " + r.cards);
    assert.ok(r.csvCut > 0 && r.text.includes("الملف المرفق اتقصّ"), "the CSV is cut at 300 KB and the report says so");
    assert.ok(bytes(r.csv) <= RENDER_LIM.csvBytes);
  });
});

describe("calls report e-mail: the CSV", () => {
  test("a BOM, the documented columns, every cell quoted; a cell starting with = + - @ gets a ' first (no formula in a spreadsheet)", async () => {
    const { b } = await dayReport();
    const rep = clone(b.rep), c = rep.convs[0];
    c.who = { kind: "member", name: '=HYPERLINK("http://x.test","y")', company: "", confidence: "sure", said: { company: "@SUM(A1)" } };
    c.review.zeroQueries = ["-2+3"]; c.review.zeroCounts = {};
    c.outcomes = [{ ar: "+x", en: "+cmd" }];
    const { text } = csvOf(rep), lines = text.split("\n");
    assert.equal(text.charCodeAt(0), 0xfeff, "a BOM for Excel");
    assert.equal(lines[0].replace(/^﻿/, ""), CSV_COLS.map(k => '"' + k + '"').join(","));
    const row = lines[1];
    for (const bad of ['"=HYPERLINK', '"@SUM', '"-2+3', '"+cmd']) assert.ok(!row.includes(bad), bad);
    for (const ok of [`"'=HYPERLINK(""http://x.test"",""y"")"`, `"'@SUM(A1)"`, `"'-2+3"`, `"'+cmd"`]) assert.ok(row.includes(ok), ok + " in " + row);
    assert.ok(lines.slice(1).filter(Boolean).every(l => /^"/.test(l) && /"$/.test(l)), "every cell quoted");
  });
  test("the CSV carries the session ids and the rule codes; the e-mail body never does", async () => {
    const { b, ids } = await dayReport();
    const body = b.rendered.html + "\n" + b.rendered.text;
    for (const id of ids) assert.ok(!body.includes(id), "no Anam session id in the body: " + id);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(body), "no UUID at all in the body");
    for (const code of Object.keys(FLAG)) assert.ok(!new RegExp("\\b" + code + "\\b").test(body), "no rule code in the body: " + code);
    for (const id of [ids[0], ids[1], ids[3]]) assert.ok(b.rendered.csv.includes(id), "the CSV has " + id);
    assert.match(b.rendered.csv, /zero_results\[\d/);
    assert.match(b.rendered.csv, /promise_no_tool\[/);
  });
});

describe("calls report e-mail: privacy", () => {
  test("a masked report: no clear e-mail or phone (the platform's detector finds none), no visitor id, no tag, no user agent, no transcript contact", async () => {
    const { b } = await dayReport();
    const all = { html: b.rendered.html, text: b.rendered.text, csv: b.rendered.csv, subject: b.rendered.subject };
    for (const [k, v] of Object.entries(all)) {
      const s = withoutOwn(v);
      assert.equal(maskPII(s), s, k + ": maskPII would change something: " + [...s.matchAll(/[^\s]*[@0-9٠-٩]{6,}[^\s]*/g)].slice(0, 5).map(x => x[0]).join(" | "));
      for (const x of [VISITOR, "9".repeat(32), ...TAGS, "Mozilla", "iPhone OS", "GSA/", "Android 14", "01099999912", "spoken.person", "guest.nine@", "01111111199", "member.seven@", "01000000071"]) assert.ok(!v.includes(x), k + " has " + x);
    }
    assert.ok(b.rendered.html.includes("m•••@example.com") && b.rendered.text.includes("موبايل …٧١"), "a member's contact: masked");
    assert.ok(!/[0-9a-f]{32}/.test(b.rendered.html + b.rendered.text + b.rendered.csv), "no 32-hex id anywhere");
    assert.ok(/^تقرير مكالمات جنة وباسم — الجمعة ٢٠ نوفمبر: ٤ مكالمة \(\S+ عملاء، \S+ مفيدة\) \/ Calls report 2026-11-20: 4 calls \(\d+ customers, \d+ useful\)$/.test(b.rendered.subject), b.rendered.subject);
    assert.equal(subjectOf(b.rep), b.rendered.subject);
  });
  test("«full»: the platform's records of the member and of the meeting in clear — still nothing spoken in a call, no visitor id, no user agent", async () => {
    const { b } = await dayReport({ detail: "full" });
    const body = b.rendered.html + "\n" + b.rendered.text;
    for (const x of ["member.seven@example.com", "01000000071"]) assert.ok(body.includes(x), x + " (the member's card)");
    assert.ok(b.rendered.csv.includes("guest.nine@example.com"), "the meeting's booking e-mail (its call is one line in the body, the CSV has the contact)");
    for (const x of ["01099999912", "spoken.person", VISITOR, "Mozilla"]) assert.ok(!(body + b.rendered.csv).includes(x), x);
  });
  test("a meeting without recording consent: its card or line has counts only (no quote of either side)", async () => {
    const { b, ids } = await dayReport();
    const c = b.rep.convs.find(x => x.sessions.includes(ids[2]));
    assert.equal(c.review.verdict, "no_consent");
    const one = renderReport({ ...clone(b.rep), convs: [c] });
    for (const s of ["«", "قالت", "أكياس"]) assert.ok(!one.text.split("== باقي المكالمات ==")[1].split("\n==")[0].includes(s), s);
  });
});
