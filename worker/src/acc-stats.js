/* Control Center — home statistics (the live panel's «الإحصائيات (آخر 30 يوم)», §3.1.2), badges (§3.1.1 / §9.3), reports + CSV (§3.1.11)
   and privacy-preserving page analytics POST /api/ev/pv (§3.1.12): no raw IPs, user agents or referrers are stored — a daily-salted keyed
   hash per visitor (ipHash + coarse browser/os/device family), per page a hash of that, aggregated counters only, bots ignored. */
import DATA from "./data.json";
import { now, iso, sha256, secretOf, ipHash, rateN, cairoDay, addDays, site, effPlan, uaFamily, cleanPath } from "./common.js";
import { guardPageView } from "./guard.js"; // «حماية الموقع»: many pages from one network in minutes, a headless browser (guard.js)
export { uaFamily, cleanPath }; // they moved to common.js (guard.js needs them without importing this file)
import { all, first, countOf, hasTable, csvText, ccCors, ccPreflight, dateOk, dayStartIso, dayAfterIso, ccOrigins } from "./acc-base.js";

const ROUTABLE_SQL = "(kind IN ('rfq', 'basket') OR (kind = 'contact' AND target_type IN ('factory', 'company')))"; // = inquiries.js routable(); needs_team = this + status in_progress | no_match
export const NEEDS_TEAM_SQL = `status IN ('in_progress', 'no_match') AND ${ROUTABLE_SQL}`;
const PAID = "('profile', 'basic', 'premium', 'partner', 'strategic')";

/* base counts from worker/src/data.json (the build's data) — CC.content.contentCounts adds the published edits/adds/hides on top */
export function baseCounts() {
  const n = DATA.n || null, i = DATA.i || [];
  return { tenders: (DATA.t || []).length + i.filter(x => x[0] === "tender" && !/^TEN-/.test(String(x[1] || ""))).length, companies: (DATA.f || []).length, rfqs: (DATA.q || []).length,
    news: n && n.news != null ? n.news : null, videos: n && n.videos != null ? n.videos : null, products: n && n.products != null ? n.products : null,
    offers: (DATA.o || []).length, zones: (DATA.z || []).length, events: n && n.events != null ? n.events : null, awards: n && n.awards != null ? n.awards : null, projects: n && n.projects != null ? n.projects : null };
}
export async function contentCounts(env, CC) {
  if (CC && CC.content && typeof CC.content.contentCounts === "function") { try { const c = await CC.content.contentCounts(env); if (c && typeof c === "object") return c; } catch (e) { console.error("contentCounts", e && e.message); } }
  return baseCounts();
}

/* ---------- badges ---------- */
export async function badges(env) {
  const t = now(), soon = iso(Date.now() + 30 * 86400000);
  const msgNew = await countOf(env, "SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('received', 'in_progress', 'no_match')");
  const legacyNew = await countOf(env, "SELECT COUNT(*) AS n FROM cc_legacy_messages WHERE status = 'new'");
  const prod = await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_products WHERE state = 'pending'"), comp = await countOf(env, "SELECT COUNT(*) AS n FROM cc_company_requests WHERE state = 'pending'");
  return {
    msgNew: (msgNew || 0) + (legacyNew || 0),
    rfqNew: (await countOf(env, "SELECT COUNT(*) AS n FROM inquiries WHERE kind = 'rfq' AND created_at > ?", iso(Date.now() - 7 * 86400000))) || 0,
    needsTeam: (await countOf(env, `SELECT COUNT(*) AS n FROM inquiries WHERE ${NEEDS_TEAM_SQL}`)) || 0,
    approvals: (prod || 0) + (comp || 0),
    unpaid: (await countOf(env, "SELECT COUNT(*) AS n FROM cc_invoices WHERE status = 'open' AND test = 0")) || 0,
    expSoon: (await countOf(env, `SELECT COUNT(*) AS n FROM members WHERE plan IN ${PAID} AND plan_expires != '' AND plan_expires >= ? AND plan_expires <= ?`, t, soon)) || 0,
    edge: (await countOf(env, "SELECT COUNT(*) AS n FROM cc_edge WHERE status IN ('pending', 'failed')")) || 0,
  };
}

/* ---------- home statistics ---------- */
/* adm (the caller, acc.js) decides what personal or financial detail the home statistics carry (review F10): recent[].email only with
   members.read, unpaid / revenue_month_minor only with pay.read — the editor (stats.read without either) gets the counts, not the
   addresses of new sign-ups or the money. No adm → neither (fail-closed). */
export async function stats(env, url, CC, adm) {
  const may = p => !!(adm && typeof adm.can === "function" && adm.can(p)), seeMembers = may("members.read"), seePay = may("pay.read");
  const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get("days"), 10) || 30));
  const today = cairoDay(), from = addDays(today, -(days - 1)), t = now();
  const pv = await hasTable(env, "cc_pv_day");
  const series = pv ? (await all(env, "SELECT day, views AS v, uniq AS u, mobile_uniq FROM cc_pv_day WHERE day >= ? ORDER BY day", from)) : [];
  const sum = series.reduce((a, r) => ({ v: a.v + r.v, u: a.u + r.u, m: a.m + (r.mobile_uniq || 0) }), { v: 0, u: 0, m: 0 });
  const top = pv ? (await all(env, "SELECT path, SUM(views) AS c FROM cc_pv_page WHERE day >= ? GROUP BY path ORDER BY c DESC, path LIMIT 10", from)) : [];
  let src = [];
  if (pv) {
    const rows = await all(env, "SELECT src AS ref, SUM(n) AS c FROM cc_pv_src WHERE day >= ? GROUP BY src ORDER BY c DESC, src", from);
    const direct = rows.find(r => r.ref === "direct"), others = rows.filter(r => r.ref !== "direct");
    src = [...others.slice(0, direct ? 7 : 8), ...(direct ? [direct] : [])];
  }
  const sinceRow = pv ? await first(env, "SELECT MIN(day) AS d FROM cc_pv_day") : null;
  const cc = await contentCounts(env, CC);
  const metaOk = await hasTable(env, "cc_member_meta");
  const planRows = await all(env, "SELECT CASE WHEN plan_expires != '' AND plan_expires < ? THEN 'visitor' ELSE plan END AS p, COUNT(*) AS c FROM members WHERE email NOT LIKE 'deleted+%@invalid' GROUP BY p", t);
  const plans = planRows.map(r => ({ plan: r.p === "visitor" ? "none" : r.p, c: r.c })).sort((a, b) => b.c - a.c);
  const recent = (await all(env, `SELECT m.company, m.email, m.created_at${metaOk ? ", COALESCE(mm.status, 'active') AS status" : ", 'active' AS status"} FROM members m${metaOk ? " LEFT JOIN cc_member_meta mm ON mm.member_id = m.id" : ""} WHERE m.email NOT LIKE 'deleted+%@invalid' ORDER BY m.created_at DESC LIMIT 6`))
    .map(r => ({ company: r.company || "", email: seeMembers ? r.email || "" : "", status: r.status, created_at: r.created_at }));
  const msgKinds = (await all(env, "SELECT kind, COUNT(*) AS c FROM inquiries GROUP BY kind ORDER BY c DESC")).map(r => ({ kind: r.kind, c: r.c }));
  const msgNew = await countOf(env, "SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('received', 'in_progress', 'no_match')"), legNew = await countOf(env, "SELECT COUNT(*) AS n FROM cc_legacy_messages WHERE status = 'new'");
  const msgAll = await countOf(env, "SELECT COUNT(*) AS n FROM inquiries"), legAll = await countOf(env, "SELECT COUNT(*) AS n FROM cc_legacy_messages");
  const prod = await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_products WHERE state = 'pending'"), comp = await countOf(env, "SELECT COUNT(*) AS n FROM cc_company_requests WHERE state = 'pending'");
  const unpaid = seePay ? await first(env, "SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS t FROM cc_invoices WHERE status = 'open' AND test = 0") : null;
  const month = today.slice(0, 7), monthStart = dayStartIso(month + "-01");
  const rev = seePay ? await first(env, "SELECT COALESCE(SUM(total_minor), 0) AS t FROM cc_invoices WHERE status = 'paid' AND test = 0 AND paid_at >= ?", monthStart) : null;
  return {
    days, since: (sinceRow && sinceRow.d) || today, views: sum.v, visitors: sum.u, mobile: sum.u ? Math.round((100 * sum.m) / sum.u) : 0,
    series: series.map(r => ({ day: r.day, v: r.v, u: r.u })), top: top.map(r => ({ path: r.path, c: r.c })), src: src.map(r => ({ ref: r.ref, c: r.c })),
    tenders: cc.tenders ?? null, companies: cc.companies ?? null, rfqs: cc.rfqs ?? null, news: cc.news ?? null, videos: cc.videos ?? null, products: cc.products ?? null,
    members: (await countOf(env, `SELECT COUNT(*) AS n FROM members WHERE plan IN ${PAID} AND (plan_expires = '' OR plan_expires > ?)`, t)) || 0,
    pending: metaOk ? (await countOf(env, "SELECT COUNT(*) AS n FROM cc_member_meta WHERE status = 'pending'")) : null,
    rfqNew: (await countOf(env, "SELECT COUNT(*) AS n FROM inquiries WHERE kind = 'rfq' AND created_at > ?", iso(Date.now() - 7 * 86400000))) || 0,
    msgNew: (msgNew || 0) + (legNew || 0), msgAll: (msgAll || 0) + (legAll || 0),
    soon: (await countOf(env, `SELECT COUNT(*) AS n FROM members WHERE plan IN ${PAID} AND plan_expires != '' AND plan_expires >= ? AND plan_expires <= ?`, t, iso(Date.now() + 30 * 86400000))) || 0,
    expired: (await countOf(env, `SELECT COUNT(*) AS n FROM members WHERE verified = 1 AND plan IN ${PAID} AND plan_expires != '' AND plan_expires < ?`, t)) || 0,
    plans, recent, msgKinds,
    needsTeam: (await countOf(env, `SELECT COUNT(*) AS n FROM inquiries WHERE ${NEEDS_TEAM_SQL}`)) || 0,
    approvals: prod == null && comp == null ? null : (prod || 0) + (comp || 0),
    unpaid: unpaid ? { n: unpaid.n || 0, total_minor: unpaid.t || 0 } : null,
    revenue_month_minor: rev ? rev.t || 0 : null,
  };
}

/* ---------- reports ---------- */
function range(url) {
  const today = cairoDay();
  let to = url.searchParams.get("to") || today, from = url.searchParams.get("from") || addDays(to, -29);
  if (!dateOk(to)) to = today; if (!dateOk(from)) from = addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  return { from, to, fromIso: dayStartIso(from), toIso: dayAfterIso(to) };
}
const byDay = (rows, f) => { const m = new Map(); for (const r of rows) { const d = cairoDay(Date.parse(r[f])); m.set(d, (m.get(d) || 0) + 1); } return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([day, n]) => ({ day, n })); };
export async function reportSummary(env, url) {
  const r = range(url), t = now();
  const inq = await all(env, "SELECT created_at, kind FROM inquiries WHERE created_at >= ? AND created_at < ? LIMIT 100000", r.fromIso, r.toIso);
  const kinds = new Map(); for (const x of inq) kinds.set(x.kind, (kinds.get(x.kind) || 0) + 1);
  const sign = await all(env, "SELECT created_at FROM members WHERE created_at >= ? AND created_at < ? AND email NOT LIKE 'deleted+%@invalid' LIMIT 100000", r.fromIso, r.toIso);
  const paid = await all(env, "SELECT paid_at, total_minor FROM cc_invoices WHERE status = 'paid' AND test = 0 AND paid_at >= ? AND paid_at < ? LIMIT 100000", r.fromIso, r.toIso);
  const months = new Map(); for (const x of paid) { const mo = cairoDay(Date.parse(x.paid_at)).slice(0, 7), c = months.get(mo) || { total_minor: 0, n: 0 }; c.total_minor += x.total_minor || 0; c.n++; months.set(mo, c); }
  const active = await all(env, `SELECT plan, COUNT(*) AS n FROM members WHERE plan IN ${PAID} AND (plan_expires = '' OR plan_expires > ?) GROUP BY plan`, t);
  const pv = await all(env, "SELECT day, views, uniq FROM cc_pv_day WHERE day >= ? AND day <= ? ORDER BY day", r.from, r.to);
  return { from: r.from, to: r.to, inquiries_by_day: byDay(inq, "created_at"), inquiries_by_kind: [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, n })), signups_by_day: byDay(sign, "created_at"),
    revenue_by_month: [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v })), active_by_plan: active.map(x => ({ plan: x.plan, n: x.n })), pv_by_day: pv };
}
export const REPORT_SETS = ["inquiries", "signups", "invoices", "payments", "members", "customers", "pv"];
export const ORDER_CSV = ["ref", "kind", "status", "source", "created_at", "updated_at", "name", "company", "email", "phone", "target_type", "target_id", "target_name", "sector", "governorate", "market", "routed_count", "replies_count", "needs_team", "message", "payload"];
export async function reportCsv(env, url, dataset, helpers) {
  const r = range(url);
  if (dataset === "inquiries") {
    const rows = await all(env, "SELECT * FROM inquiries WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 20000", r.fromIso, r.toIso);
    return csvText(ORDER_CSV, rows.map(helpers.orderCsvRow));
  }
  if (dataset === "signups") {
    const rows = await all(env, "SELECT id, email, company, name, plan, plan_expires, verified, created_at FROM members WHERE created_at >= ? AND created_at < ? AND email NOT LIKE 'deleted+%@invalid' ORDER BY created_at DESC LIMIT 20000", r.fromIso, r.toIso);
    return csvText(["id", "email", "company", "name", "plan", "plan_expires", "verified", "created_at"], rows);
  }
  if (dataset === "invoices") {
    const cols = ["no", "email", "company", "plan", "plan_name", "period_days", "net_minor", "vat_bp", "vat_minor", "total_minor", "currency", "status", "source", "test", "issued_at", "paid_at", "paid_via", "provider", "provider_ref", "manual_ref"];
    return csvText(cols, await all(env, `SELECT ${cols.join(", ")} FROM cc_invoices WHERE issued_at >= ? AND issued_at < ? ORDER BY issued_at DESC LIMIT 20000`, r.fromIso, r.toIso));
  }
  if (dataset === "payments") {
    const cols = ["id", "invoice_id", "provider", "mode", "provider_ref", "amount_minor", "currency", "status", "raw_status", "verified_via", "error", "created_at", "updated_at"];
    return csvText(cols, await all(env, `SELECT ${cols.join(", ")} FROM cc_payments WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 20000`, r.fromIso, r.toIso));
  }
  if (dataset === "members") return helpers.membersCsv(env, new URL("https://x/"));
  if (dataset === "customers") return helpers.customersCsv(env, url);
  if (dataset === "pv") return csvText(["day", "views", "uniq", "mobile_uniq"], await all(env, "SELECT day, views, uniq, mobile_uniq FROM cc_pv_day WHERE day >= ? AND day <= ? ORDER BY day", r.from, r.to));
  return null;
}

/* ---------- POST /api/ev/pv — page analytics ---------- */
const BOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp\//i; // = ev.js BOT
const BOT2 = /HeadlessChrome|Lighthouse|PageSpeed|GTmetrix/i;
const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ""; } };
function pvSourceOk(req, env) {
  const own = hostOf(site(env)).replace(/^www\./, ""), extra = String(env.EV_ORIGINS || "").toLowerCase().split(/[\s,]+/).filter(Boolean), origins = ccOrigins(env);
  const ok = u => { let x; try { x = new URL(u); } catch (e) { return false; } const h = x.hostname.toLowerCase(); return h === own || h === "www." + own || extra.includes(h) || origins.includes(x.origin); };
  const o = req.headers.get("Origin"), r = req.headers.get("Referer");
  if (o && o !== "null") return ok(o);
  return !!r && ok(r);
}
export function srcOf(r, own) {
  let h = typeof r === "string" ? r.trim().toLowerCase() : "";
  if (!h) return "direct";
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(h)) h = hostOf(h);
  h = h.split(/[\/?#:]/)[0].replace(/^www\./, "");
  if (!h) return "direct";
  if (!/^[a-z0-9.-]+$/.test(h)) return "other";
  if (h === own || h.endsWith("." + own)) return null; // internal navigation: no source
  if (/(^|\.)google\.[a-z.]{2,}$/.test(h)) return "google";
  if (/(^|\.)bing\.com$/.test(h)) return "bing";
  if (/(^|\.)yahoo\.com$/.test(h)) return "yahoo";
  if (/(^|\.)duckduckgo\.com$/.test(h)) return "duckduckgo";
  if (/(^|\.)(facebook\.com|fb\.com)$/.test(h)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(h) || h === "t.co") return "x";
  if (/(^|\.)linkedin\.com$/.test(h) || h === "lnkd.in") return "linkedin";
  if (/(^|\.)youtube\.com$/.test(h) || h === "youtu.be") return "youtube";
  if (h === "wa.me" || /(^|\.)whatsapp\.com$/.test(h)) return "whatsapp";
  if (h === "t.me" || /(^|\.)telegram\.(org|me)$/.test(h)) return "telegram";
  return h.slice(0, 60);
}
export async function pageView(req, env) {
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed", code: "method" }), { status: 405, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Allow: "POST", ...ccCors(req, env) } });
  try {
    if (!env.DB) return done();
    let t = ""; try { t = await req.text(); } catch (e) { return done(); }
    if (t.length > 1024) return done();
    let b = {}; try { b = JSON.parse(t || "{}"); } catch (e) { return done(); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return done();
    const ua = req.headers.get("User-Agent") || "";
    if (!ua || BOT.test(ua) || BOT2.test(ua)) {
      // «حماية الموقع» (guard.js): a headless browser that opens the site's own pages (HeadlessChrome, PhantomJS …) is reported, never counted
      if (ua && pvSourceOk(req, env)) { const hp = cleanPath(b.p); if (hp) await guardPageView(req, env, { ua, path: hp, headless: true }); }
      return done();
    }
    if (!pvSourceOk(req, env)) return done();
    const path = cleanPath(b.p); if (!path) return done();
    if (!(await hasTable(env, "cc_pv_day"))) return done();
    const own = hostOf(site(env)).replace(/^www\./, ""), src = srcOf(b.r, own), day = cairoDay(), ih = await ipHash(req, env);
    const nIp = await rateN(env, "pvip|" + ih, 86400);
    // «حماية الموقع»: past a normal day's pages (guard.js MASS.after), one more counter finds very many pages in a few minutes — nothing for anyone else
    await guardPageView(req, env, { ua, path, ih, dayCount: nIp });
    if (nIp > 300) return done(); // ≤ 300 counted views per network per day
    const secret = secretOf(env) || env.MEETINGS_SECRET || "mig";
    const h = (await sha256(`${secret}|pv|${day}|${ih}|${uaFamily(ua)}`)).slice(0, 40), ph = (await sha256(h + "|" + path)).slice(0, 40);
    const v1 = await env.DB.prepare("INSERT INTO cc_pv_seen (h, day) VALUES (?, ?) ON CONFLICT(h) DO NOTHING").bind(h, day).run();
    const p1 = await env.DB.prepare("INSERT INTO cc_pv_seen (h, day) VALUES (?, ?) ON CONFLICT(h) DO NOTHING").bind(ph, day).run();
    const newV = v1.meta && v1.meta.changes === 1 ? 1 : 0, newP = p1.meta && p1.meta.changes === 1 ? 1 : 0, mob = newV && /Mobi|Android|iPhone|iPad/.test(ua) ? 1 : 0;
    const stmts = [
      env.DB.prepare("INSERT INTO cc_pv_day (day, views, uniq, mobile_uniq) VALUES (?, 1, ?, ?) ON CONFLICT(day) DO UPDATE SET views = views + 1, uniq = uniq + excluded.uniq, mobile_uniq = mobile_uniq + excluded.mobile_uniq").bind(day, newV, mob),
      env.DB.prepare("INSERT INTO cc_pv_page (day, path, views, uniq) VALUES (?, ?, 1, ?) ON CONFLICT(day, path) DO UPDATE SET views = views + 1, uniq = uniq + excluded.uniq").bind(day, path, newP),
    ];
    if (src) stmts.push(env.DB.prepare("INSERT INTO cc_pv_src (day, src, n) VALUES (?, ?, 1) ON CONFLICT(day, src) DO UPDATE SET n = n + 1").bind(day, src));
    await env.DB.batch(stmts);
  } catch (e) { console.error("pv", e && e.message); }
  return done();
}
export { effPlan };
