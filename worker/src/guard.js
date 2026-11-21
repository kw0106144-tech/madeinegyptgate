/* «حماية الموقع» — the site guard (owner 2026-11-21: «عايزك تقفل ان اي حد يقدر يسحب ب control s الفرونت او الكود او جنه او باسم ولو حد
   حاول يدخل يجيب احنا بانيين الموقع ازاي كل ده يبقي مقفول ويجيلي نوتيفكشن»).
   The honest limit: whatever a visitor's browser runs (HTML, CSS, browser JS, pictures) can always be saved by someone who wants it — a
   browser has to download it to show it. What is secret never reaches a browser (this Worker's code, the keys, Janna's and Bassem's
   instructions on Anam, member data). data/guard.js makes copying harder (Ctrl/Cmd+S, Ctrl+U, F12 / Ctrl+Shift+I|J|C, right-click and
   drag on pictures and videos, no selection on Janna's / Bassem's figures) and REPORTS the attempts here; this module also finds what a
   browser does not report (many pages from one network in minutes, a headless browser, a site-copying tool) and e-mails the owner a
   summary — at most one e-mail an hour.

   POST /api/ev/guard {t, p} → 204 (sendBeacon; data/guard.js): t = one of CLIENT_TYPES, p = the page's path. Counted only from the
        platform's own pages (Origin, else Referer), never from bots, never from the staff pages, ≤ LIM.perNet a network an hour.
   guardPageView (acc-stats.js pageView, POST /api/ev/pv): "headless" (a headless browser on the site's pages: never counted as a visit)
        and "mass_views" (past LIM.massAfter pages of a network in a day, LIM.massAt pages within 10 minutes — or the day's 300th).
   guardTool (index.js, GET /data/overlay.js, which every page of the site loads): "scraper_ua" — wget, curl, HTTrack, python-requests,
        Scrapy … (a site copier follows the page's scripts; the platform's own build and CI use their own user agents).
   guardCron (index.js platformCron, every 15 minutes): the hour that just ended → ONE e-mail «team_site_guard» (email-center.js) to the
        calls report's recipients (flags.js callsReportTo: the owner's list, else TEAM_EMAIL + ADMIN_EMAILS), else info@madeinegyptgate.com.
   guardRange / guardSummary: the daily calls report's line (calls-report.js).

   Storage — counters in the existing rl table only (no new table, no migration); exp = the end of the hour + 3 days (digest.js purges rl):
     grdip|<net>|<win>            the attempts of one network in an hour (rateN)
     grdh|<H>|t|<type>            attempts per type in the UTC hour H ("2026-11-21T13")
     grdh|<H>|p|<path>            per page (≤ 120 characters)
     grdh|<H>|v|<vis>|<family>    one row per visitor: vis = 12 hex characters of sha256(secret|grd|<Cairo day>|<network hash>|<family>)
                                  (daily, not reversible), family = browser/os/device (common.js uaFamily) — never the user agent
     grdm|<net>|<win>             the pages of one network in 10 minutes, only once it passed LIM.massAfter pages that day
     grdsent|<H> · grdtry|<H>     the e-mail of hour H: sent once · tries
   No raw IP, no user agent, no member id, no visitor id of Janna (mig-vid) is ever stored.
   Switches (flags.js «🛠️ المطوّر» → «المزايا»): site_guard (the site: data/guard.js) and site_guard_alerts (here: OFF → nothing stored,
   no e-mail). Every write costs at most 4 D1 statements, a normal visit none. */
import { err, preflight, line, sha256, secretOf, ipHash, rateN, cairoDay, cairoHM, iso, site, fromAddr, uaFamily, cleanPath } from "./common.js";
import { dayStartIso, dayAfterIso } from "./acc-base.js";
import { featureOn, callsReportTo } from "./flags.js";
import { deliver, mailReady, loadMailConfig } from "./email-center.js";

export const CLIENT_TYPES = Object.freeze(["save", "source", "devtools_key", "devtools_open", "save_image"]);
export const SERVER_TYPES = Object.freeze(["mass_views", "headless", "scraper_ua"]);
export const TYPE_NAMES = Object.freeze({
  save: ["حفظ الصفحة (Ctrl+S)", "Save page (Ctrl+S)"],
  source: ["عرض كود الصفحة (Ctrl+U)", "View source (Ctrl+U)"],
  devtools_key: ["اختصار أدوات المطوّر (F12 / Ctrl+Shift+I)", "Developer tools shortcut (F12 / Ctrl+Shift+I)"],
  devtools_open: ["أدوات المطوّر اتفتحت (كشف تقريبي)", "Developer tools opened (approximate)"],
  save_image: ["كليك يمين على صورة أو فيديو", "Right-click on a picture or video"],
  mass_views: ["صفحات كتير جداً من نفس الشبكة في دقايق", "Very many pages from one network in minutes"],
  headless: ["متصفح آلي (Headless) بيفتح الصفحات", "Automated (headless) browser"],
  scraper_ua: ["أداة نسخ مواقع (wget / curl / HTTrack …)", "Site-copying tool (wget / curl / HTTrack …)"],
});
export const LIM = Object.freeze({ body: 512, perNet: 30, perType: 200, massAfter: 60, massWinS: 600, massAt: 100, dayCap: 300, keepS: 3 * 86400, tries: 3, pages: 10, browsers: 6 });
export const ALERT_FALLBACK = "info@madeinegyptgate.com";
const BOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp\//i; // = ev.js BOT
export const HEADLESS = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|SlimerJS/i;
export const TOOL_UA = /\b(?:wget2?|curl|httrack|winhttrack|python-requests|python-urllib|python-httpx|aiohttp|scrapy|go-http-client|libwww-perl|lwp-trivial|guzzlehttp|okhttp|apache-httpclient|node-fetch|axios|undici|httpie|webcopier|webzip|teleport ?pro|offline ?explorer|sitesucker|webreaper|colly|heritrix|wpull|cyotek|surfoffline)\b/i;
/* the staff pages report nothing (the team opens the developer tools there for its work): the same list as data/guard.js STAFF */
const STAFF = /^\/(?:en\/)?(?:admin|seo-admin|seo-team|data-desk|inbox)(?:[\/.?#]|$)/;
const UPSERT = "INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";

export const hourKey = ms => new Date(Math.floor(ms / 3600000) * 3600000).toISOString().slice(0, 13); // "2026-11-21T13" (UTC)
const keepIso = ms => iso((Math.floor(ms / 3600000) + 1) * 3600000 + LIM.keepS * 1000);
const pathKey = p => String(p || "/").replace(/\|/g, "/").slice(0, 120);
const ownHost = env => { try { return new URL(site(env)).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return "madeinegyptgate.com"; } };
function allowedHost(env, h) {
  h = String(h || "").toLowerCase();
  if (!h) return false;
  const own = ownHost(env), extra = String((env && env.EV_ORIGINS) || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  return h === own || h === "www." + own || extra.includes(h);
}
/* the platform's own pages: Origin, else Referer (= ev.js sourceOk) */
function sourceOk(req, env) {
  const o = req.headers.get("Origin"), r = req.headers.get("Referer");
  try { if (o && o !== "null") return allowedHost(env, new URL(o).hostname); } catch (e) { return false; }
  try { return !!r && allowedHost(env, new URL(r).hostname); } catch (e) { return false; }
}
const refPath = (req, env) => { try { const u = new URL(req.headers.get("Referer") || ""); return allowedHost(env, u.hostname) ? cleanPath(u.pathname) : ""; } catch (e) { return ""; } };

/* one attempt → the counters (≤ 4 statements). Never throws. → {off} | {limited} | {n} (this hour's attempts of that type) */
export async function recordGuard(req, env, { type, path, ua = "", ih = "", nowMs = Date.now() } = {}) {
  try {
    if (!env || !env.DB || !TYPE_NAMES[type]) return { skipped: "invalid" };
    if (!(await featureOn(env, "site_guard_alerts"))) return { off: true };
    ih = ih || (await ipHash(req, env));
    if ((await rateN(env, "grdip|" + ih, 3600, nowMs)) > LIM.perNet) return { limited: true };
    const H = hourKey(nowMs), exp = keepIso(nowMs);
    const n = (await env.DB.prepare(UPSERT).bind("grdh|" + H + "|t|" + type, exp).first("n")) || 0;
    if (n > LIM.perType) return { n };
    const fam = uaFamily(String(ua || "")), vis = (await sha256(`${secretOf(env) || env.MEETINGS_SECRET || "mig"}|grd|${cairoDay(nowMs)}|${ih}|${fam}`)).slice(0, 12);
    await env.DB.batch([env.DB.prepare(UPSERT).bind("grdh|" + H + "|p|" + pathKey(path), exp), env.DB.prepare(UPSERT).bind("grdh|" + H + "|v|" + vis + "|" + fam, exp)]);
    return { n };
  } catch (e) { console.error("guard record", e && e.message); return { error: true }; }
}

/* POST /api/ev/guard — the beacon of data/guard.js */
export async function handleGuardEv(req, env) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return err(405, "method", "method not allowed");
  const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (!env.DB) return done();
  let t = ""; try { t = await req.text(); } catch (e) { return done(); }
  if (t.length > LIM.body) return err(413, "too_large", "too large");
  let b = {}; try { b = JSON.parse(t || "{}"); } catch (e) { return err(400, "bad_json", "bad json"); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return err(400, "bad_json", "bad json");
  const type = line(b.t, 20);
  if (!CLIENT_TYPES.includes(type)) return err(400, "invalid", "invalid event", { types: CLIENT_TYPES });
  const ua = req.headers.get("User-Agent") || "", path = cleanPath(b.p) || "/";
  if (!ua || BOT.test(ua) || !sourceOk(req, env) || STAFF.test(path)) return done(); // accepted, never counted
  await recordGuard(req, env, { type, path, ua });
  return done();
}

/* POST /api/ev/pv (acc-stats.js): {headless} for a bot user agent on the site's own pages; else the network's page number of the day */
export async function guardPageView(req, env, { ua = "", path = "/", ih = "", dayCount = 0, headless = false, nowMs = Date.now() } = {}) {
  try {
    if (!env || !env.DB) return null;
    if (headless) return HEADLESS.test(ua) ? await recordGuard(req, env, { type: "headless", path, ua, nowMs }) : null;
    if (!(dayCount > LIM.massAfter)) return null; // a normal visit: no statement at all
    if (STAFF.test(path) || !(await featureOn(env, "site_guard_alerts"))) return null;
    const m = await rateN(env, "grdm|" + ih, LIM.massWinS, nowMs);
    if (m === LIM.massAt || dayCount === LIM.dayCap + 1) return await recordGuard(req, env, { type: "mass_views", path, ua, ih, nowMs });
    return null;
  } catch (e) { console.error("guard pv", e && e.message); return null; }
}

/* GET /data/overlay.js with the user agent of a site-copying tool (index.js; ctx.waitUntil — the file itself is served as always) */
export async function guardTool(req, env, nowMs = Date.now()) {
  const ua = req.headers.get("User-Agent") || "";
  if (!TOOL_UA.test(ua) || !env || !env.DB) return null;
  return recordGuard(req, env, { type: "scraper_ua", path: refPath(req, env) || new URL(req.url).pathname, ua, nowMs });
}

/* ---------- the summaries ---------- */
/* the rl keys of [fromMs, toMs) — whole UTC hours (Cairo's offset is whole hours, so a Cairo day is 24 or 23/25 of them) */
export const guardRange = (fromMs, toMs) => ["grdh|" + hourKey(fromMs) + "|", "grdh|" + hourKey(toMs) + "|"];
export const guardDayRange = day => guardRange(Date.parse(dayStartIso(day)), Date.parse(dayAfterIso(day)));
/* positions (SQLite substr is 1-based): "grdh|" 1–5, H 6–18, "|t|" 19–21, the value from 22; visitor rows: vis 22–33, "|" 34, family 35– */
const SQL = {
  types: "SELECT substr(k, 22) AS t, SUM(n) AS n FROM rl WHERE k >= ? AND k < ? AND substr(k, 19, 3) = '|t|' GROUP BY substr(k, 22)",
  visitors: "SELECT COUNT(DISTINCT substr(k, 22, 12)) AS v FROM rl WHERE k >= ? AND k < ? AND substr(k, 19, 3) = '|v|'",
  pages: "SELECT substr(k, 22) AS p, SUM(n) AS n FROM rl WHERE k >= ? AND k < ? AND substr(k, 19, 3) = '|p|' GROUP BY substr(k, 22) ORDER BY n DESC, p LIMIT " + LIM.pages,
  browsers: "SELECT substr(k, 35) AS b, COUNT(DISTINCT substr(k, 22, 12)) AS n FROM rl WHERE k >= ? AND k < ? AND substr(k, 19, 3) = '|v|' GROUP BY substr(k, 35) ORDER BY n DESC, b LIMIT " + LIM.browsers,
};
export const GUARD_SQL = SQL;
/* rows of SQL.types (+ the visitors' count) → {n, visitors, types: [[type, n]] in TYPE order} */
export function guardTotals(typeRows, visitors) {
  const by = {}; for (const r of typeRows || []) if (TYPE_NAMES[r.t]) by[r.t] = (by[r.t] || 0) + (Number(r.n) || 0);
  const types = Object.keys(TYPE_NAMES).filter(k => by[k]).map(k => [k, by[k]]);
  return { n: types.reduce((s, x) => s + x[1], 0), visitors: Number(visitors) || 0, types };
}
/* the full summary of [lo, hi) — 4 reads (types first: nothing → no more reads) */
export async function guardSummary(env, lo, hi) {
  const all = async (sql) => ((await env.DB.prepare(sql).bind(lo, hi).all()).results || []);
  const typeRows = await all(SQL.types);
  if (!typeRows.length) return { n: 0, visitors: 0, types: [], pages: [], browsers: [] };
  const v = await all(SQL.visitors), pages = await all(SQL.pages), browsers = await all(SQL.browsers);
  return { ...guardTotals(typeRows, v[0] && v[0].v), pages: pages.map(r => [String(r.p || "/"), Number(r.n) || 0]), browsers: browsers.map(r => [String(r.b || "other"), Number(r.n) || 0]) };
}

/* ---------- the e-mail (no IP, no personal data: cc_mail_log keeps the subject) ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AR_DIG = "٠١٢٣٤٥٦٧٨٩";
const ar = n => String(n).replace(/[0-9]/g, d => AR_DIG[d]);
const BR = { chrome: "كروم", edge: "إيدج", firefox: "فايرفوكس", safari: "سفاري", opera: "أوبرا", samsung: "سامسونج", other: "تاني" };
const OS = { windows: "ويندوز", mac: "ماك", linux: "لينكس", android: "أندرويد", ios: "آيفون/آيباد", other: "تاني" };
const famAr = f => { const [b, o, d] = String(f || "").split("/"); return (BR[b] || BR.other) + " · " + (OS[o] || OS.other) + " · " + (d === "m" ? "موبايل" : "كمبيوتر"); };
const famEn = f => { const [b, o, d] = String(f || "").split("/"); return (b || "other") + " · " + (o || "other") + " · " + (d === "m" ? "mobile" : "desktop"); };
export function renderGuardMail(sum, { fromMs, toMs, env } = {}) {
  const day = cairoDay(fromMs), from = cairoHM(fromMs), to = cairoHM(toMs), admin = site(env) + "admin/";
  const subject = "تنبيه حماية الموقع: " + ar(sum.n) + " محاولة نسخ — " + ar(day) + " " + ar(from) + " / Site guard: " + sum.n + " copy attempts";
  const head = "من " + ar(from) + " لـ " + ar(to) + " بتوقيت القاهرة (" + ar(day) + ") اتسجّل " + ar(sum.n) + " محاولة لنسخ الموقع أو كوده من " + ar(sum.visitors) + " زائر مختلف.";
  const types = sum.types.map(([k, n]) => TYPE_NAMES[k][0] + ": " + ar(n));
  const pages = (sum.pages || []).map(([p, n]) => p + " — " + ar(n));
  const browsers = (sum.browsers || []).map(([b, n]) => famAr(b) + ": " + ar(n));
  const note = ["الموقع بيمنع الاختصارات دي والكليك اليمين على الصور، بس أي حاجة بتشتغل في متصفح الزائر ممكن تتنزل بطرق تانية — اللي سري (كود السيرفر، المفاتيح، تعليمات جنة وباسم، بيانات الأعضاء) مش بيوصل للمتصفح أصلاً.",
    "مفيش IP ولا أي بيانات شخصية: «زائر» هنا بصمة يومية مش بترجع لشخص.",
    "تقفل التنبيه أو الحماية من «🛠️ المطوّر» ← «المزايا»: " + admin];
  const en = ["From " + from + " to " + to + " Cairo time (" + day + "): " + sum.n + " attempts to copy the site or its code, from " + sum.visitors + " different visitors.",
    "By type: " + sum.types.map(([k, n]) => TYPE_NAMES[k][1] + " " + n).join(" · "),
    ...(sum.browsers && sum.browsers.length ? ["Browsers: " + sum.browsers.map(([b, n]) => famEn(b) + " " + n).join(" · ")] : []),
    "No IP address and no personal data are stored. Switch the alert or the guard off in «🛠️ Developer» → «Features»."];
  const text = [head, "", "حسب النوع:", ...types.map(x => "- " + x), ...(pages.length ? ["", "الصفحات:", ...pages.map(x => "- " + x)] : []),
    ...(browsers.length ? ["", "المتصفحات (عدد الزوار):", ...browsers.map(x => "- " + x)] : []), "", ...note, "", "— English —", ...en].join("\n");
  const ul = a => `<ul style="margin:4px 0;padding-inline-start:20px">${a.map(x => `<li style="margin:2px 0">${x}</li>`).join("")}</ul>`;
  const h3 = t => `<h3 style="color:#8E0B20;border-bottom:2px solid #8E0B20;padding-bottom:3px;margin:16px 0 6px">${esc(t)}</h3>`;
  const html = `<div dir="rtl" lang="ar" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.8;color:#1d2b22;max-width:640px">`
    + `<p style="margin:0 0 8px"><b>${esc(head)}</b></p>` + h3("حسب النوع") + ul(types.map(esc))
    + (pages.length ? h3("الصفحات") + ul((sum.pages || []).map(([p, n]) => `<bdi dir="ltr">${esc(p)}</bdi> — ${esc(ar(n))}`)) : "")
    + (browsers.length ? h3("المتصفحات (عدد الزوار)") + ul(browsers.map(esc)) : "")
    + `<div style="background:#f6f4ee;border-radius:8px;padding:8px 12px;margin:14px 0;color:#444">${note.slice(0, 2).map(x => `<p style="margin:4px 0">${esc(x)}</p>`).join("")}`
    + `<p style="margin:4px 0">تقفل التنبيه أو الحماية من <a href="${esc(admin)}">«🛠️ المطوّر» ← «المزايا»</a>.</p></div>`
    + `<div dir="ltr" lang="en" style="color:#555;border-top:1px solid #ddd;padding-top:8px">${en.map(x => `<p style="margin:4px 0">${esc(x)}</p>`).join("")}</div></div>`;
  return { subject, text, html };
}

/* ---------- the cron: the hour that just ended → at most ONE e-mail ---------- */
export async function guardCron(env, nowMs = Date.now()) {
  if (!env || !env.DB) return { skipped: "no store" };
  if (!(await featureOn(env, "site_guard_alerts"))) return { skipped: "feature_off" };
  const fromMs = (Math.floor(nowMs / 3600000) - 1) * 3600000, toMs = fromMs + 3600000, H = hourKey(fromMs), [lo, hi] = guardRange(fromMs, toMs);
  const sum = await guardSummary(env, lo, hi);
  if (!sum.n) return { skipped: "nothing", hour: H };
  try { await loadMailConfig(env); } catch (e) { /* the defaults */ }
  if (!mailReady(env)) return { skipped: "no_route", hour: H, n: sum.n };
  const mark = await env.DB.prepare("INSERT INTO rl (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO NOTHING").bind("grdsent|" + H, keepIso(toMs)).run();
  if (!mark.meta || !mark.meta.changes) return { skipped: "done", hour: H };
  let to = []; try { to = await callsReportTo(env); } catch (e) { to = []; }
  if (!to.length) to = [ALERT_FALLBACK];
  const R = renderGuardMail(sum, { fromMs, toMs, env });
  const r = await deliver(env, { id: "guard-" + H, tpl: "team_site_guard", from: { email: fromAddr(env), name: "منصة صنع في مصر" }, to, subject: R.subject, text: R.text, html: R.html });
  if ((r && r.sent && (r.id || r.dedup)) || (r && r.skipped === "template_off")) return { sent: !(r && r.skipped), skipped: (r && r.skipped) || undefined, hour: H, n: sum.n, visitors: sum.visitors };
  // not sent: the marker goes so a later tick of the next hour tries again (deliver dedupes by id), ≤ LIM.tries times
  const tries = (await env.DB.prepare(UPSERT).bind("grdtry|" + H, keepIso(toMs)).first("n")) || 0;
  if (tries < LIM.tries) await env.DB.prepare("DELETE FROM rl WHERE k = ?").bind("grdsent|" + H).run();
  return { sent: false, hour: H, tries, error: line(String((r && (r.error || r.skipped)) || "not sent"), 120) };
}
