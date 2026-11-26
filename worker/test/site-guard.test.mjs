// node --test for «حماية الموقع» (src/guard.js + data/guard.js's beacon): POST /api/ev/guard, the detections on /api/ev/pv and
// /data/overlay.js, the hourly e-mail (at most one an hour, no IP), the switches site_guard / site_guard_alerts and the calls report's line.
// Everything goes through the real index.js where a route is involved. No network: Resend is mocked; any other URL fails.
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { recordGuard, guardPageView, guardCron, guardSummary, guardRange, guardDayRange, renderGuardMail, hourKey, LIM, CLIENT_TYPES, TOOL_UA, HEADLESS, ALERT_FALLBACK } from "../src/guard.js";
import { storeJson, forgetFeatures, FEATURE_KEYS, featureDef, publicFeatures, featuresView } from "../src/flags.js";
import { TEMPLATES, templateKeyOf } from "../src/email-center.js";
import { renderReport } from "../src/calls-render.js";
import { CALLS_REPORT_KEY } from "../src/flags.js";

const SITE = "https://madeinegyptgate.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const IP = "41.33.12.7";
let sent, realFetch, realErr, resendStatus;
beforeEach(() => {
  realFetch = globalThis.fetch; realErr = console.error; sent = []; resendStatus = 200;
  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com/")) { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(resendStatus === 200 ? { id: "re_" + sent.length } : { message: "down" }), { status: resendStatus }); }
    throw new Error("unexpected fetch " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realErr; });

const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>",
  TEAM_EMAIL: "team@madeinegyptgate.com", ADMIN_EMAILS: "owner@mig.test", ...(extra || {}) });
function mkCtx() { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => null)); }, async done() { while (p.length) await Promise.all(p.splice(0)); } }; }
async function hit(env, method, path, { body, headers = {}, ip = IP, ua = CHROME, raw } = {}) {
  const h = { "CF-Connecting-IP": ip, "User-Agent": ua, ...headers };
  if (body !== undefined) h["Content-Type"] = "text/plain;charset=UTF-8"; // what navigator.sendBeacon sends with a Blob of text
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await ctx.done();
  return res;
}
const beacon = (env, b, o = {}) => hit(env, "POST", "/api/ev/guard", { body: b, headers: { Origin: SITE, ...(o.headers || {}) }, ...o });
const rows = async env => (await env.DB.prepare("SELECT k, n FROM rl WHERE k LIKE 'grd%' ORDER BY k").all()).results;
const guardRows = async env => (await rows(env)).filter(r => r.k.startsWith("grdh|"));
const setFeatures = async (env, values) => {
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(storeJson(values, {}), new Date().toISOString()).run();
  forgetFeatures(env);
};
const fakeReq = (ua = CHROME, ip = IP) => new Request(SITE + "/api/ev/pv", { method: "POST", headers: { "CF-Connecting-IP": ip, "User-Agent": ua, Origin: SITE } });

describe("POST /api/ev/guard — the beacon of data/guard.js", () => {
  test("an attempt from the site's own page: counted per type, page and visitor (a daily hash + browser family) — never the IP or the user agent", async () => {
    const env = env0();
    assert.equal((await beacon(env, { t: "save", p: "/factories/?q=x#y" })).status, 204);
    await beacon(env, { t: "devtools_key", p: "/tenders/" });
    await beacon(env, { t: "save", p: "/factories/" }, { ip: "196.200.1.9", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1" });
    const H = hourKey(Date.now()), r = await guardRows(env), by = Object.fromEntries(r.map(x => [x.k, x.n]));
    assert.equal(by["grdh|" + H + "|t|save"], 2);
    assert.equal(by["grdh|" + H + "|t|devtools_key"], 1);
    assert.equal(by["grdh|" + H + "|p|/factories/"], 2);
    const vis = r.filter(x => x.k.includes("|v|"));
    assert.equal(vis.length, 2, "two networks = two visitors");
    assert.ok(vis.every(x => /^grdh\|\d{4}-\d\d-\d\dT\d\d\|v\|[0-9a-f]{12}\|[a-z]+\/[a-z]+\/[md]$/.test(x.k)), JSON.stringify(vis));
    const dump = JSON.stringify(await env.DB.prepare("SELECT * FROM rl").all());
    for (const leak of [IP, "196.200.1.9", "iPhone", "Chrome/131", "Windows NT"]) assert.ok(!dump.includes(leak), leak);
    const sum = await guardSummary(env, ...guardRange(Date.now(), Date.now() + 3600000));
    assert.deepEqual([sum.n, sum.visitors, sum.types], [3, 2, [["save", 2], ["devtools_key", 1]]]);
    assert.deepEqual(sum.pages[0], ["/factories/", 2]);
  });
  test("not counted: another site, no Origin/Referer, bots, the staff pages; invalid → 400; too large → 413", async () => {
    const env = env0();
    assert.equal((await beacon(env, { t: "save", p: "/" }, { headers: { Origin: "https://evil.example" } })).status, 204);
    assert.equal((await hit(env, "POST", "/api/ev/guard", { body: { t: "save", p: "/" } })).status, 204);
    await beacon(env, { t: "save", p: "/" }, { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" });
    await beacon(env, { t: "save", p: "/" }, { ua: "" });
    for (const p of ["/admin/", "/en/seo-team/", "/data-desk/", "/inbox/"]) await beacon(env, { t: "devtools_key", p });
    assert.deepEqual(await guardRows(env), []);
    assert.equal((await beacon(env, { t: "steal", p: "/" })).status, 400);
    assert.equal((await beacon(env, null, { raw: "{bad" })).status, 400);
    assert.equal((await beacon(env, null, { raw: JSON.stringify({ t: "save", p: "/" + "x".repeat(600) }) })).status, 413);
    assert.equal((await hit(env, "GET", "/api/ev/guard")).status, 405);
    assert.equal((await hit(env, "OPTIONS", "/api/ev/guard")).status, 204);
    assert.deepEqual([...CLIENT_TYPES], ["save", "source", "devtools_key", "devtools_open", "save_image"]);
  });
  test("one network counts at most LIM.perNet attempts an hour; one type at most LIM.perType detailed rows an hour", async () => {
    const env = env0(), t = Date.UTC(2026, 10, 21, 10, 5);
    for (let i = 0; i < LIM.perNet + 5; i++) await recordGuard(fakeReq(), env, { type: "save", path: "/p" + i + "/", ua: CHROME, nowMs: t });
    const sum = await guardSummary(env, ...guardRange(t, t + 3600000));
    assert.equal(sum.n, LIM.perNet);
    assert.equal(sum.visitors, 1);
  });
  test("site_guard_alerts OFF: nothing is stored (the beacon still answers 204)", async () => {
    const env = env0();
    await setFeatures(env, { site_guard_alerts: false });
    assert.equal((await beacon(env, { t: "save", p: "/" })).status, 204);
    assert.deepEqual(await rows(env), []);
    assert.deepEqual(await guardCron(env), { skipped: "feature_off" });
  });
});

describe("server detections", () => {
  test("/data/overlay.js with a site-copying tool's user agent → scraper_ua (the page that linked it), the file is still served; a browser → nothing", async () => {
    const env = env0();
    const a = await hit(env, "GET", "/data/overlay.js", { ua: "Wget/1.21.4", headers: { Referer: SITE + "/factories/cairo/" } });
    assert.equal(a.status, 200);
    await hit(env, "GET", "/data/overlay.js", { ua: "Mozilla/5.0 (compatible; HTTrack 3.0x; Windows 98)", ip: "10.9.9.9" });
    await hit(env, "GET", "/data/overlay.js", { ua: CHROME, ip: "10.9.9.8" });
    await hit(env, "GET", "/data/overlay.js", { ua: "migate-deploy/2.0 (daily build)", ip: "10.9.9.7" }); // the platform's own build
    await hit(env, "GET", "/data/overlay.js", { ua: "migate-ci/1.0 (deploy check)", ip: "10.9.9.6" });   // CI
    const sum = await guardSummary(env, ...guardRange(Date.now(), Date.now() + 3600000));
    assert.deepEqual(sum.types, [["scraper_ua", 2]]);
    assert.deepEqual(sum.pages.map(p => p[0]).sort(), ["/data/overlay.js", "/factories/cairo/"]);
    for (const ua of ["curl/8.5.0", "python-requests/2.31", "Scrapy/2.11 (+https://scrapy.org)", "Go-http-client/1.1", "Python-urllib/3.12", "WinHTTrack"]) assert.ok(TOOL_UA.test(ua), ua);
    for (const ua of [CHROME, "migate-deploy/2.0 (daily build)", "migate-ci/1.0 (deploy check)", "migate-smoke-bot/2.0 (deploy check)", "Mozilla/5.0 MIGApp/1.0 (android)"]) assert.ok(!TOOL_UA.test(ua), ua);
  });
  test("/api/ev/pv: a headless browser on the site's pages → headless (never a counted visit); Lighthouse / Googlebot → nothing", async () => {
    const env = env0(), pv = (ua, ip) => hit(env, "POST", "/api/ev/pv", { body: { p: "/factories/", r: "" }, headers: { Origin: SITE }, ua, ip });
    assert.equal((await pv("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36", "10.1.1.1")).status, 204);
    await pv("Mozilla/5.0 Chrome-Lighthouse", "10.1.1.2"); await pv("Googlebot/2.1", "10.1.1.3");
    const sum = await guardSummary(env, ...guardRange(Date.now(), Date.now() + 3600000));
    assert.deepEqual(sum.types, [["headless", 1]]);
    const d = await env.DB.prepare("SELECT views FROM cc_pv_day").first();
    assert.equal(d, null, "not a counted visit");
    assert.ok(HEADLESS.test("HeadlessChrome/120") && !HEADLESS.test("Chrome-Lighthouse"));
  });
  test("mass views: nothing for a normal day (no statement); past LIM.massAfter pages a day, LIM.massAt pages in 10 minutes → ONE mass_views", async () => {
    const env = env0(), t = Date.UTC(2026, 10, 21, 9, 1), base = { ua: CHROME, path: "/factories/", ih: "net-a" };
    for (let i = 1; i <= LIM.massAfter; i++) assert.equal(await guardPageView(fakeReq(), env, { ...base, dayCount: i, nowMs: t }), null);
    assert.deepEqual(await rows(env), [], "no counter for a normal visitor");
    for (let i = 1; i <= LIM.massAt + 20; i++) await guardPageView(fakeReq(), env, { ...base, dayCount: LIM.massAfter + i, nowMs: t + i * 1000 });
    const sum = await guardSummary(env, ...guardRange(t, t + 3600000));
    assert.deepEqual(sum.types, [["mass_views", 1]]);
    // the day's 301st page of a network is reported too (once)
    await guardPageView(fakeReq(), env, { ...base, ih: "net-b", dayCount: LIM.dayCap + 1, nowMs: t });
    assert.deepEqual((await guardSummary(env, ...guardRange(t, t + 3600000))).types, [["mass_views", 2]]);
  });
});

describe("the hourly e-mail (guardCron)", () => {
  test("the hour that ended → ONE e-mail to the report's recipients with counts, types, pages and visitors — no IP; again in that hour → nothing", async () => {
    const env = env0(), t = Date.UTC(2026, 10, 21, 10, 20), later = Date.UTC(2026, 10, 21, 11, 5);
    await recordGuard(fakeReq(), env, { type: "save", path: "/factories/", ua: CHROME, nowMs: t });
    await recordGuard(fakeReq(CHROME, "10.2.2.2"), env, { type: "source", path: "/tenders/", ua: CHROME, nowMs: t });
    await recordGuard(fakeReq(CHROME, "10.2.2.3"), env, { type: "scraper_ua", path: "/data/overlay.js", ua: "Wget/1.21", nowMs: t });
    assert.deepEqual(await guardCron(env, t + 60000), { skipped: "nothing", hour: "2026-11-21T09" }, "the current hour is not summarised before it ends");
    const r = await guardCron(env, later);
    assert.equal(r.sent, true); assert.equal(r.n, 3); assert.equal(r.visitors, 3); assert.equal(r.hour, "2026-11-21T10");
    assert.equal(sent.length, 1);
    const m = sent[0];
    assert.deepEqual([...m.to].sort(), ["owner@mig.test", "team@madeinegyptgate.com"]);
    assert.match(m.subject, /تنبيه حماية الموقع: ٣ محاولة نسخ/);
    assert.match(m.text, /من ١٢:٠٠ لـ ١٣:٠٠ بتوقيت القاهرة/);
    assert.match(m.text, /حفظ الصفحة \(Ctrl\+S\): ١/); assert.match(m.text, /أداة نسخ مواقع/); assert.match(m.text, /\/tenders\//);
    assert.match(m.text, /3 attempts to copy the site or its code, from 3 different visitors/);
    for (const leak of [IP, "10.2.2.2", "Wget/1.21", "Windows NT"]) { assert.ok(!m.text.includes(leak), leak); assert.ok(!m.html.includes(leak), leak); }
    const log = await env.DB.prepare("SELECT template, status, msg_id FROM cc_mail_log").all();
    assert.deepEqual(log.results.map(x => [x.template, x.status, x.msg_id]), [["team_site_guard", "sent", "guard-2026-11-21T10"]]);
    assert.deepEqual(await guardCron(env, later + 15 * 60000), { skipped: "done", hour: "2026-11-21T10" });
    assert.equal(sent.length, 1, "at most one e-mail an hour");
  });
  test("the owner's report recipients are used; without any recipient → info@madeinegyptgate.com; no e-mail route → nothing sent", async () => {
    const env = env0(), t = Date.UTC(2026, 10, 21, 14, 2);
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES (?, 'system', ?, ?)").bind(CALLS_REPORT_KEY, JSON.stringify({ to: ["boss@example.com"] }), new Date().toISOString()).run();
    await recordGuard(fakeReq(), env, { type: "save", path: "/", ua: CHROME, nowMs: t });
    await guardCron(env, t + 3600000);
    assert.deepEqual(sent.pop().to, ["boss@example.com"]);
    const env2 = env0({ TEAM_EMAIL: "", ADMIN_EMAILS: "" });
    await recordGuard(fakeReq(), env2, { type: "save", path: "/", ua: CHROME, nowMs: t });
    await guardCron(env2, t + 3600000);
    assert.deepEqual(sent.pop().to, [ALERT_FALLBACK]);
    const env3 = env0({ RESEND_API_KEY: "" });
    await recordGuard(fakeReq(), env3, { type: "save", path: "/", ua: CHROME, nowMs: t });
    assert.equal((await guardCron(env3, t + 3600000)).skipped, "no_route");
    assert.equal(sent.length, 0);
  });
  test("a failed send is tried again by a later tick (≤ LIM.tries), never twice once it went out", async () => {
    const env = env0(), t = Date.UTC(2026, 10, 21, 16, 30);
    await recordGuard(fakeReq(), env, { type: "devtools_open", path: "/", ua: CHROME, nowMs: t });
    resendStatus = 500;
    const a = await guardCron(env, t + 3600000);
    assert.equal(a.sent, false); assert.equal(a.tries, 1);
    resendStatus = 200;
    const b = await guardCron(env, t + 3600000 + 10 * 60000);
    assert.equal(b.sent, true);
    assert.equal((await guardCron(env, t + 3600000 + 20 * 60000)).skipped, "done");
  });
  test("the mail text: Arabic first, an English twin, the switches named, the browsers in words", () => {
    const sum = { n: 2, visitors: 1, types: [["save_image", 2]], pages: [["/مصنع/", 2]], browsers: [["safari/ios/m", 1]] };
    const R = renderGuardMail(sum, { fromMs: Date.UTC(2026, 10, 21, 8), toMs: Date.UTC(2026, 10, 21, 9), env: {} });
    assert.match(R.text, /كليك يمين على صورة أو فيديو: ٢/); assert.match(R.text, /سفاري · آيفون\/آيباد · موبايل: ١/);
    assert.match(R.text, /«🛠️ المطوّر» ← «المزايا»/); assert.match(R.text, /Right-click on a picture or video 2/);
    assert.match(R.html, /<bdi dir="ltr">\/مصنع\/<\/bdi>/); assert.match(R.html, /href="https:\/\/madeinegyptgate.com\/admin\/"/);
  });
});

describe("registry: switches, template, calls report", () => {
  test("site_guard (client, ON) reaches the site; site_guard_alerts (server, ON) does not; its lock is the e-mail route", async () => {
    const env = env0();
    assert.ok(FEATURE_KEYS.includes("site_guard") && FEATURE_KEYS.includes("site_guard_alerts"));
    assert.equal(featureDef("site_guard").default, true); assert.equal(featureDef("site_guard").scope, "client");
    assert.equal(featureDef("site_guard_alerts").default, true); assert.equal(featureDef("site_guard_alerts").scope, "server");
    const pub = await publicFeatures(env);
    assert.equal(pub.features.site_guard, true); assert.ok(!("site_guard_alerts" in pub.features));
    await setFeatures(env, { site_guard: false });
    assert.equal((await publicFeatures(env)).features.site_guard, false);
    const v = await featuresView(env0({ RESEND_API_KEY: "" }));
    assert.equal(v.features.find(f => f.key === "site_guard_alerts").locked.code, "no_route");
    assert.equal(v.features.find(f => f.key === "site_guard").locked, null);
  });
  test("the e-mail is a registered template (guard- ids); the calls report adds the day's attempts to its visits line", () => {
    const t = TEMPLATES.find(x => x.key === "team_site_guard");
    assert.ok(t && t.prefixes.includes("guard-") && t.group === "team");
    assert.equal(templateKeyOf({ id: "guard-2026-11-21T10" }), "team_site_guard");
    const base = { day: "2026-11-20", dayAr: "٢٠ نوفمبر", convs: [], settings: { tests: "off" }, counts: { conversations: 0, pv: { views: 10, uniq: 4, mobile: 2, sources: [] } } };
    const without = renderReport(base), withG = renderReport({ ...base, counts: { ...base.counts, guard: { n: 5, visitors: 2, types: [["save", 5]] } } });
    assert.ok(!/محاولات نسخ/.test(without.text));
    assert.match(withG.text, /زيارات الموقع: ١٠ مشاهدة.* — محاولات نسخ الموقع: ٥ من زائرين/);
    assert.match(withG.text, /copy attempts: 5 from 2 visitors/);
  });
  test("a Cairo day is its 24 UTC hours (winter: UTC+2)", () => {
    const [lo, hi] = guardDayRange("2026-11-20");
    assert.deepEqual([lo, hi], ["grdh|2026-11-19T22|", "grdh|2026-11-20T22|"]);
  });
  test("no raw IP anywhere in the module; the browser file is ES5-shaped and names the same beacon and staff pages", () => {
    const src = readFileSync(new URL("../src/guard.js", import.meta.url), "utf8");
    assert.ok(!/CF-Connecting-IP/.test(src), "only common.js ipHash reads the address");
    const js = readFileSync(new URL("../../data/guard.js", import.meta.url), "utf8");
    assert.ok(js.includes('"/api/ev/guard"'));
    assert.ok(js.includes("admin|seo-admin|seo-team|data-desk|inbox"));
    assert.ok(!/\b(let|const)\s|=>|`/.test(js), "ES5");
  });
});
