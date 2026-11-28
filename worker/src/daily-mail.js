/* The daily e-mails of the owner's 2026-11-28 decisions (migration 0015; every part fails soft without it):
   1) «التقرير اليومي» — 10:00 Cairo time (MEMBER_REPORT_TIME), every REGISTERED member (a plan in force other than visitor, an address the
      platform holds — never a directory profile): the new opportunities (tenders, RFQs, projects, procurement news, awards) and news that
      match his products / sector (members.sector + products + his factory profile's products), ordered with his governorate first, and his
      own activity (requests he received in the last 24 h, requests still waiting for his answer). Members-only content follows his plan
      (digest.js inScope: the market of his plan, the Gulf states he chose, procurement news from Premium — the same rules as the alerts);
      what matches outside his plan is only COUNTED, with the plan that includes it. Nothing to report → no e-mail. List «daily» (stop link
      in each), one per member per Cairo day (mail_sends daily_run|<day>|<member>). Owner switch member_daily_report (default ON).
   2) Partner plans (the plans with «bassem» in the matrix: partner, strategic) get the same report as Bassem's daily report WITH a PDF
      (pdf-report.js) holding every detail: the opportunities with their entity, sector, place, dates and status, the matching requests,
      the news and the day's market counts inside his plan. The PDF goes only on a route that carries attachments (Resend / Brevo); on the
      SEND_EMAIL fallback the e-mail says the details are in his dashboard. Bassem's own morning note (whatsapp.js) is unchanged.
   3) «تقرير المالك اليومي» — from 00:30 Cairo (OWNER_REPORT_TIME) for the day that just ended, to the platform's own mailbox (TEAM_EMAIL =
      info@madeinegyptgate.com): what was published that day (counts and titles per section — the data items that first appeared, the
      projects, the members' approved products and company profiles, the new members, the requests received) and EVERY e-mail the platform
      sent that day (company, address, what — 0015 mail_outbox), with the list as a CSV attachment where attachments go. The only place
      recipient addresses appear. Owner switch owner_daily_report (default ON).
   Cron: platformCron → mailCron every 15 minutes: the request teasers (teasers.js), then the member reports in batches (DM_LIM.batch a
   tick, between 10:00 and 21:00), then the owner's report once. Numbers are counted from the data; nothing is invented. */
import ITEMS from "./items.json";
import { mail, line, iso, jparse, cairoDay, cairoHM, addDays, site, effPlan, planCan, PLAN_NAME, isEmail, isBlocked, unsubscribed, govName } from "./common.js";
import { items as dataItems, newSince, inScope, isProcurement } from "./digest.js";
import { tokens, norm, stem } from "./text.js";
import { GENERIC } from "./matching.js";
import { attachOk, TEMPLATES } from "./email-center.js";
import { reportPdf, toBase64 } from "./pdf-report.js";
import { featureOn } from "./flags.js";
import { storeOn, claim, settle, statusOf, ownerBox, planForMarket } from "./mail-sends.js";
import { hasTable, dayStartIso, dayAfterIso } from "./acc-base.js";
import { teasersCron } from "./teasers.js";

export const DM_LIM = Object.freeze({ time: "10:00", until: "21:00", ownerTime: "00:30", batch: 15, mailOpps: 15, mailNews: 8, pdfOpps: 60, pdfNews: 20, received: 20, titles: 30, outbox: 3000, csvRows: 3000 });
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeOf = (v, d) => (HM.test(String(v || "")) ? String(v) : d);
const tok = s => tokens(s, 200).filter(t => !GENERIC.has(t));
const govKey = g => stem(norm(govName(String(g || "")).replace(/^محافظ[هة]\s*/, "")));
const abs = (env, u) => (/^https?:\/\//.test(String(u || "")) ? String(u) : site(env) + String(u || "").replace(/^\//, ""));
const LABEL = { tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "RFQ"], award: ["ترسية", "Award"], project: ["مشروع", "Project"], procurement: ["أخبار مشتريات", "Procurement news"], news: ["خبر", "News"], event: ["معرض", "Event"], offer: ["عرض", "Offer"] };
const kindOf = it => (it.kind === "news" && isProcurement(it) ? "procurement" : it.kind);
const OPP = new Set(["tender", "rfq", "award", "project", "procurement"]);
const statusAr = (d, today) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(d || "")); if (!m) return ""; return m[1] < today ? "منتهية" : m[1] <= addDays(today, 7) ? "تنتهي قريباً" : "سارية"; };

/* ---------- projects (items.json j) as dated items: first seen tracked in seen_items kind 'project' (its first sync is a baseline) ---------- */
let PROJ = null;
export const projects = () => PROJ || (PROJ = (ITEMS.j || []).filter(p => p && p.id).map(p => ({ kind: "project", id: String(p.id), date: p.news_date || "", sector: p.sector || "", gov: p.gov || "", title: p.name || "", url: p.path || "projects/", deadline: "", market: "local", entity: "" })));
export async function syncProjects(env, nowMs = Date.now()) {
  // only after the digest's own first sync (seen_items holds data items): a project row first would make that sync see no baseline
  const any = await env.DB.prepare("SELECT 1 AS x FROM seen_items WHERE kind != 'project' LIMIT 1").first("x"); if (!any) return { waiting: "digest_baseline" };
  const had = await env.DB.prepare("SELECT 1 AS x FROM seen_items WHERE kind = 'project' LIMIT 1").first("x"), base = had ? 0 : 1, t = iso(nowMs), list = projects();
  for (let i = 0; i < list.length; i += 50) await env.DB.batch(list.slice(i, i + 50).map(p => env.DB.prepare("INSERT INTO seen_items (kind, item_id, first_seen_at, baseline) VALUES ('project', ?, ?, ?) ON CONFLICT(kind, item_id) DO NOTHING").bind(p.id, t, base)));
  return { baseline: !!base };
}
async function newProjects(env, sinceIso) {
  const { results } = await env.DB.prepare("SELECT item_id FROM seen_items WHERE kind = 'project' AND baseline = 0 AND first_seen_at > ? LIMIT 500").bind(sinceIso).all();
  const ids = new Set((results || []).map(r => r.item_id));
  return projects().filter(p => ids.has(p.id));
}

/* ---------- what one member's report holds ---------- */
async function profileWords(env, m) {
  const words = [m.sector || "", m.products || ""];
  try { if (await hasTable(env, "member_profiles")) { const r = await env.DB.prepare("SELECT profile_json FROM member_profiles WHERE member_id = ?").bind(m.id).first(); const p = jparse(r && r.profile_json, {}); if (Array.isArray(p.products)) words.push(p.products.join(" ")); } } catch (e) { /* fail soft */ }
  return new Set(tok(words.join(" ")));
}
export function matchScore(P, it, gov) {
  if (!P.size) return 0;
  let s = 0;
  for (const t of tok(`${it.sector || ""} ${it.title || ""}`)) {
    if (P.has(t)) { s += 2; continue; }
    if (t.length >= 4) for (const x of P) if (x.length >= 4 && (x.startsWith(t) || t.startsWith(x))) { s += 1; break; }
  }
  if (s && gov && it.gov && govKey(gov) === govKey(it.gov)) s += 1;
  return s;
}
const aboutOf = r => { const p = jparse(r.payload_json, {}), it = jparse(r.items_json, [])[0] || {}; return line(p.product || p.title || p.material || it.name || it.product || r.sector || "", 90); };
export async function memberReport(env, m, fresh, nowMs = Date.now()) {
  const now = iso(nowMs), P = await profileWords(env, m), hits = [], locked = new Map();
  for (const it of fresh) {
    const k = kindOf(it); if (!OPP.has(k) && k !== "news") continue;
    const sc = matchScore(P, it, m.governorate); if (!sc) continue;
    if (k === "news" || inScope(m, it, now)) hits.push({ it, k, sc });
    else if (OPP.has(k)) { const need = k === "procurement" ? "premium" : planForMarket(it.market || "local"); locked.set(need, (locked.get(need) || 0) + 1); }
  }
  hits.sort((a, b) => b.sc - a.sc || String(b.it.date || "").localeCompare(String(a.it.date || "")));
  const rows = async (sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
  const received = await rows("SELECT r.created_at, i.ref, i.kind, i.sector, i.payload_json, i.items_json, i.status FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id WHERE r.member_id = ? AND r.created_at > ? AND (r.email_sent = 1 OR r.wa_sent = 1) ORDER BY r.created_at DESC LIMIT ?", m.id, iso(nowMs - 86400000), DM_LIM.received);
  const pending = await rows("SELECT r.created_at, i.ref, i.kind, i.sector, i.payload_json, i.items_json FROM inquiry_routes r JOIN inquiries i ON i.id = r.inquiry_id WHERE r.member_id = ? AND r.status = 'sent' AND i.status NOT IN ('closed', 'blocked') AND r.created_at > ? ORDER BY r.created_at DESC LIMIT 50", m.id, iso(nowMs - 30 * 86400000));
  /* the day's market inside his plan (counts only, platform-wide): the new items of each kind he may see */
  const market = {}; for (const it of fresh) { const k = kindOf(it); if (OPP.has(k) && inScope(m, it, now)) market[k] = (market[k] || 0) + 1; }
  return { opps: hits.filter(h => h.k !== "news"), news: hits.filter(h => h.k === "news"), locked: [...locked.entries()], received, pending, market, empty: !hits.length && !received.length && !pending.length }; // a count of locked items alone is no report
}
const oppLine = (env, h, today) => { const it = h.it, st = statusAr(it.deadline, today);
  return `• [${LABEL[h.k][0]}] ${line(it.title, 200)}${it.entity ? " — " + line(it.entity, 80) : ""}${it.gov && norm(it.gov) !== norm("غير محددة") ? " (" + line(it.gov, 40) + ")" : ""}${it.deadline ? " · آخر موعد " + it.deadline + (st ? " (" + st + ")" : "") : ""}\n  ${abs(env, it.url)}`; };
export function reportText(env, m, R, { day, pdf = false, partner = false } = {}) {
  const today = day, who = m.name ? " يا " + line(m.name, 40) : "", S = site(env), L = [], E = [];
  L.push(`صباح الخير${who}،\nده ${partner ? "تقرير باسم اليومي" : "تقريرك اليومي"} من منصة صنع في مصر ليوم ${day}${m.company ? " — " + line(m.company, 80) : ""}.`);
  if (R.opps.length) { L.push(`فرص جديدة تطابق نشاطك (${R.opps.length}):\n` + R.opps.slice(0, DM_LIM.mailOpps).map(h => oppLine(env, h, today)).join("\n") + (R.opps.length > DM_LIM.mailOpps ? `\n… و${R.opps.length - DM_LIM.mailOpps} كمان${pdf ? " في ملف الـ PDF المرفق" : " على المنصة"}.` : "")); }
  if (R.news.length) L.push(`أخبار في مجالك (${R.news.length}):\n` + R.news.slice(0, DM_LIM.mailNews).map(h => `• ${line(h.it.title, 200)}${h.it.date ? " (" + h.it.date + ")" : ""}\n  ${abs(env, h.it.url)}`).join("\n"));
  for (const [plan, n] of R.locked) L.push(`فيه كمان ${n} ${n === 1 ? "فرصة جديدة" : "فرص جديدة"} في مجالك تفاصيلها للأعضاء في ${PLAN_NAME[plan][0]}: ${S}register/#${plan}`);
  const act = [];
  if (R.received.length) act.push(`• طلبات وصلتك في آخر 24 ساعة: ${R.received.length}\n` + R.received.slice(0, 10).map(r => `  - ${r.ref}${aboutOf(r) ? " — " + aboutOf(r) : ""}`).join("\n"));
  if (R.pending.length) act.push(`• طلبات لسه مستنية ردك: ${R.pending.length} — ردّ عليها من لوحة التحكم («طلبات واردة لي»): ${S}dashboard.html#incoming`);
  if (act.length) L.push("نشاط حسابك:\n" + act.join("\n"));
  if (partner) L.push(pdf ? "التفاصيل كاملة (الفرص بجهاتها ومواعيدها، الطلبات المطابقة، الأخبار، والسوق النهارده في نطاق باقتك) في ملف الـ PDF المرفق." : `التفاصيل كاملة في لوحة التحكم: ${S}dashboard.html`);
  E.push(`Good morning,\nYour daily report from Made in Egypt Gate for ${day}:`);
  E.push([`- New opportunities matching your activity: ${R.opps.length}`, `- News in your field: ${R.news.length}`, ...R.locked.map(([p, n]) => `- ${n} more matching opportunit${n === 1 ? "y" : "ies"} for members of the ${PLAN_NAME[p][1]} plan: ${S}register/#${p}`),
    `- Requests you received in the last 24 hours: ${R.received.length}`, `- Requests still waiting for your answer: ${R.pending.length}${R.pending.length ? " — answer from your dashboard: " + S + "dashboard.html#incoming" : ""}`].join("\n"));
  E.push(pdf ? "Every detail is in the attached PDF. Titles are listed above as published." : "Titles are listed above as published.");
  const n = R.opps.length + R.news.length;
  return { subject: partner ? `تقرير باسم اليومي — ${day} (${n} جديد) / Bassem's daily report` : `تقريرك اليومي من منصة صنع في مصر — ${n} جديد / Your daily report`, ar: L.join("\n\n"), en: E.join("\n\n") };
}
/* the partner's PDF: every detail the report has */
export function reportPdfOf(env, m, R, { day }) {
  const today = day, B = [], h = (text, size = 12.5) => B.push({ text, size, color: "head", gap: 10 }), p = (text, o = {}) => B.push({ text, ...o });
  B.push({ text: `تقرير باسم اليومي — ${line(m.company || m.name || "", 80)} — ${day}`, size: 15, color: "head" });
  p(`Bassem's daily report — Made in Egypt Gate — ${day}`, { size: 9.5, color: "muted" });
  p(`الباقة: ${(PLAN_NAME[effPlan(m)] || PLAN_NAME.partner)[0]}${m.sector ? " · القطاع: " + line(m.sector, 80) : ""}${m.governorate ? " · المحافظة: " + govName(m.governorate) : ""}`, { size: 9.5, color: "muted" });
  B.push({ rule: true });
  h(`الفرص الجديدة اللي تطابق نشاطك (${R.opps.length}) / New matching opportunities`);
  if (!R.opps.length) p("مفيش فرص جديدة تطابق نشاطك النهارده.");
  R.opps.slice(0, DM_LIM.pdfOpps).forEach((x, i) => {
    const it = x.it, st = statusAr(it.deadline, today);
    p(`${i + 1}. [${LABEL[x.k][0]}] ${line(it.title, 400)}`, { size: 11, gap: 6 });
    const d = [it.entity ? "الجهة: " + line(it.entity, 120) : "", it.sector ? "القطاع: " + line(it.sector, 80) : "", it.gov && norm(it.gov) !== norm("غير محددة") ? "المكان: " + line(it.gov, 60) : "", it.market && it.market !== "local" ? "السوق: " + it.market : "",
      it.date ? "تاريخ النشر: " + it.date : "", it.deadline ? "آخر موعد: " + it.deadline + (st ? " (" + st + ")" : "") : ""].filter(Boolean).join(" · ");
    if (d) p(d, { size: 9.5, color: "muted" });
    p(abs(env, it.url), { size: 8.5, color: "muted" });
  });
  if (R.opps.length > DM_LIM.pdfOpps) p(`… و${R.opps.length - DM_LIM.pdfOpps} كمان على المنصة.`);
  for (const [plan, n] of R.locked) p(`فيه كمان ${n} ${n === 1 ? "فرصة" : "فرص"} في مجالك تفاصيلها في ${PLAN_NAME[plan][0]}.`, { color: "muted" });
  h(`الطلبات المطابقة لمصنعك / Matching requests`);
  p(`وصلتك في آخر 24 ساعة: ${R.received.length} · لسه مستنية ردك: ${R.pending.length}`);
  for (const r of R.received.slice(0, 20)) p(`- ${r.ref} — ${aboutOf(r) || LABEL.rfq[0]}${r.sector ? " · " + line(r.sector, 60) : ""} · ${String(r.created_at).slice(0, 10)}`, { size: 10 });
  if (R.pending.length) { p("مستنية ردك:", { gap: 4 }); for (const r of R.pending.slice(0, 20)) p(`- ${r.ref} — ${aboutOf(r) || LABEL.rfq[0]} · من ${String(r.created_at).slice(0, 10)}`, { size: 10 }); p(`ردّ من لوحة التحكم: ${site(env)}dashboard.html#incoming`, { size: 9, color: "muted" }); }
  h(`الأخبار في مجالك (${R.news.length}) / News`);
  if (!R.news.length) p("مفيش أخبار جديدة في مجالك النهارده.");
  for (const x of R.news.slice(0, DM_LIM.pdfNews)) { p(`- ${line(x.it.title, 300)}${x.it.date ? " (" + x.it.date + ")" : ""}`, { size: 10 }); p(abs(env, x.it.url), { size: 8.5, color: "muted" }); }
  h("السوق النهارده في نطاق باقتك / Today's market within your plan");
  const mk = Object.entries(R.market);
  p(mk.length ? mk.map(([k, n]) => `${LABEL[k][0]}: ${n}`).join(" · ") : "مفيش عناصر جديدة على المنصة النهارده في نطاق باقتك.");
  p("الأعداد محسوبة من بيانات المنصة اللي ظهرت في آخر 24 ساعة. / Counts are computed from the platform's data that appeared in the last 24 hours.", { size: 8.5, color: "muted", gap: 8 });
  return reportPdf({ title: `Bassem daily report ${day}`, blocks: B });
}

/* ---------- 1) + 2) the members' reports (batches per tick) ---------- */
export async function memberReportsCron(env, nowMs = Date.now(), { batch = DM_LIM.batch } = {}) {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!(await featureOn(env, "member_daily_report"))) return { ...out, off: "feature_off" };
  const hm = cairoHM(nowMs), day = cairoDay(nowMs);
  if (hm < timeOf(env.MEMBER_REPORT_TIME, DM_LIM.time) || hm > DM_LIM.until) return { ...out, waiting: "time" };
  if (await env.DB.prepare("SELECT 1 AS x FROM cron_runs WHERE job = 'member-report' AND day = ?").bind(day).first("x")) return { ...out, done: true };
  if (await claim(env, { kind: "proj_sync", ref: day, nowMs })) { try { await syncProjects(env, nowMs); } catch (e) { /* fail soft */ } await settle(env, { kind: "proj_sync", ref: day }, "sent"); }
  const since = iso(nowMs - 86400000), fresh = [...(await newSince(env, since, dataItems())), ...(await newProjects(env, since))];
  const { results } = await env.DB.prepare(`SELECT m.* FROM members m WHERE m.plan NOT IN ('visitor', '') AND m.email != '' AND (m.verified = 1 OR m.email_verified_at != '')
      AND NOT EXISTS (SELECT 1 FROM mail_sends s WHERE s.kind = 'daily_run' AND s.ref = ? || '|' || m.id AND (s.status != 'failed' OR s.tries >= 3)) ORDER BY m.id LIMIT ?`).bind(day, batch).all();
  if (!(results || []).length) { await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES ('member-report', ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(day, iso(nowMs)).run(); return { ...out, done: true }; }
  const pdfOk = attachOk(env);
  for (const m of results) {
    if (!(await claim(env, { kind: "daily_run", ref: day + "|" + m.id, nowMs }))) continue;
    let st = "skipped";
    try {
      if (effPlan(m, iso(nowMs)) !== "visitor" && isEmail(String(m.email)) && !(await unsubscribed(env, m.email, "daily")) && !(await isBlocked(env, { email: m.email }))) {
        const R = await memberReport(env, m, fresh, nowMs);
        if (!R.empty) {
          const partner = planCan(m, "bassem", iso(nowMs)), pdf = partner && pdfOk, kind = partner ? "partner_daily" : "member_daily";
          if (await claim(env, { kind, ref: day, email: m.email, company: m.company, nowMs })) {
            const T = reportText(env, m, R, { day, pdf, partner });
            const attachments = pdf ? [{ filename: `bassem-report-${day}.pdf`, type: "application/pdf", b64: toBase64(reportPdfOf(env, m, R, { day })) }] : undefined;
            const res = await mail(env, { id: `${partner ? "pday-" : "mday-"}${m.id}-${day}`, to: m.email, lang: "ar", list: "daily", company: m.company, ...(partner ? { fromName: "باسم من منصة صنع في مصر" } : {}), attachments, ...T,
              why: "وصلتك لأنك عضو مسجّل على منصة صنع في مصر / You are a registered member of Made in Egypt Gate." });
            st = statusOf(res); await settle(env, { kind, ref: day, email: m.email }, st);
          }
        }
      }
    } catch (e) { st = "failed"; console.error("member report", (e && e.message) || "error"); }
    await settle(env, { kind: "daily_run", ref: day + "|" + m.id }, st); // failed → tried again on a later tick (at most 3 times)
    out[st === "sent" ? "sent" : st === "failed" ? "failed" : "skipped"]++;
  }
  return out;
}

/* ---------- 3) the owner's daily report ---------- */
const TPL = Object.fromEntries(TEMPLATES.map(t => [t.key, t]));
const csvCell = v => { const s = String(v == null ? "" : v).replace(/[\r\n]+/g, " "); return /[",]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"' : s; };
export async function ownerReport(env, D) {
  const from = dayStartIso(D), to = dayAfterIso(D), rows = async (sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
  const pub = [];
  /* the data items that first appeared that day (the daily sync of the Worker's bundled data) + the projects */
  const seen = await rows("SELECT kind, item_id FROM seen_items WHERE baseline = 0 AND first_seen_at >= ? AND first_seen_at < ? LIMIT 5000", from, to);
  if (seen.length) {
    const byKey = new Map([...dataItems(), ...projects()].map(it => [it.kind + "|" + it.id, it])), groups = new Map();
    for (const s of seen) { const it = byKey.get(s.kind + "|" + s.item_id); if (!it) continue; const k = kindOf(it) === "tender" && it.market !== "local" ? "tender_intl" : kindOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    const NAME = { ...Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [k, v[0]])), tender: "مناقصات مصر", tender_intl: "مناقصات دولية", rfq: "طلبات عروض أسعار", award: "ترسيات", project: "مشروعات", procurement: "أخبار مشتريات", news: "أخبار", event: "معارض", offer: "عروض" };
    for (const [k, list] of groups) pub.push(`${NAME[k] || k}: ${list.length}\n` + list.slice(0, DM_LIM.titles).map(it => "  - " + line(it.title, 160)).join("\n") + (list.length > DM_LIM.titles ? `\n  … و${list.length - DM_LIM.titles} كمان` : ""));
  }
  const prods = await rows("SELECT live_json, draft_json FROM cc_member_products WHERE state = 'approved' AND reviewed_at >= ? AND reviewed_at < ? LIMIT 200", from, to);
  if (prods.length) pub.push(`منتجات الأعضاء اللي اتوافق عليها: ${prods.length}\n` + prods.slice(0, DM_LIM.titles).map(r => "  - " + line(jparse(r.live_json || r.draft_json, {}).name || "منتج", 120)).join("\n"));
  const comps = await rows("SELECT kind, fields_json FROM cc_company_requests WHERE state = 'approved' AND reviewed_at >= ? AND reviewed_at < ? LIMIT 200", from, to);
  if (comps.length) pub.push(`ملفات شركات اتوافق عليها: ${comps.length}\n` + comps.slice(0, DM_LIM.titles).map(r => { const f = jparse(r.fields_json, {}); return "  - " + line(f.name || f.company || "ملف شركة", 120) + " (" + r.kind + ")"; }).join("\n"));
  const mem = await rows("SELECT company, plan FROM members WHERE created_at >= ? AND created_at < ? AND plan != 'visitor' LIMIT 200", from, to);
  if (mem.length) pub.push(`أعضاء جداد: ${mem.length}\n` + mem.slice(0, DM_LIM.titles).map(r => "  - " + line(r.company || "—", 120) + " (" + ((PLAN_NAME[r.plan] || [r.plan])[0]) + ")").join("\n"));
  const inq = await rows("SELECT ref, kind, status, sector, payload_json, items_json FROM inquiries WHERE created_at >= ? AND created_at < ? ORDER BY created_at LIMIT 300", from, to);
  if (inq.length) pub.push(`طلبات وصلت المنصة: ${inq.length}\n` + inq.slice(0, DM_LIM.titles).map(r => `  - ${r.ref} (${r.kind}، ${r.status})${aboutOf(r) ? " — " + aboutOf(r) : ""}`).join("\n"));
  /* every e-mail that left that day */
  const sent = await rows("SELECT at, to_addr, more, company, template, subject FROM mail_outbox WHERE day = ? ORDER BY id LIMIT ?", D, DM_LIM.outbox);
  const addrs = [...new Set(sent.filter(r => !r.company).map(r => r.to_addr))].slice(0, 500), names = new Map();
  for (let i = 0; i < addrs.length; i += 50) { const part = addrs.slice(i, i + 50); for (const r of await rows(`SELECT email, company FROM members WHERE lower(email) IN (${part.map(() => "?").join(", ")})`, ...part)) if (r.company) names.set(String(r.email).toLowerCase(), r.company); }
  const companyOf = r => r.company || names.get(r.to_addr) || "";
  const byTpl = new Map(); for (const r of sent) byTpl.set(r.template, (byTpl.get(r.template) || 0) + 1);
  const tplName = k => (TPL[k] ? TPL[k].name_ar : k || "أخرى");
  const stops = await rows("SELECT list, COUNT(*) AS n FROM unsubscribes WHERE created_at >= ? AND created_at < ? GROUP BY list", from, to);
  const teasers = await rows("SELECT status, COUNT(*) AS n FROM mail_sends WHERE kind = 'teaser' AND day = ? GROUP BY status", D);
  const ar = [`تقرير المنصة اليومي — ${D} (بتوقيت القاهرة)`,
    "١) اللي اتنشر على المنصة:\n" + (pub.length ? pub.join("\n\n") : "مفيش حاجة جديدة اتنشرت اليوم ده."),
    `٢) الإيميلات اللي المنصة بعتتها: ${sent.length}${sent.length >= DM_LIM.outbox ? "+" : ""}\n` + ([...byTpl.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${tplName(k)}: ${n}`).join("\n") || "  مفيش") +
      (sent.length ? "\n\nالتفاصيل (الوقت · الشركة · الإيميل · اتبعتله إيه):\n" + sent.slice(0, 400).map(r => `  ${String(r.at).slice(11, 16)} UTC · ${companyOf(r) || "—"} · ${r.to_addr}${r.more ? " +" + r.more : ""} · ${tplName(r.template)}: ${r.subject}`).join("\n") + (sent.length > 400 ? `\n  … و${sent.length - 400} كمان في الملف المرفق` : "") : ""),
    teasers.length ? "دعوات الطلبات للمصانع غير المسجّلة: " + teasers.map(t => `${t.status}: ${t.n}`).join("، ") : "",
    stops.length ? "إيقافات الإيميلات: " + stops.map(s => `${s.list}: ${s.n}`).join("، ") : ""].filter(Boolean).join("\n\n");
  const en = `Daily platform report for ${D} (Cairo time): ${pub.length} published section(s), ${sent.length} e-mail(s) sent. Details above in Arabic; the full e-mail list is in the attached CSV where attachments are supported.`;
  const csv = ["at_utc,company,email,more,template,subject", ...sent.slice(0, DM_LIM.csvRows).map(r => [r.at, companyOf(r), r.to_addr, r.more, r.template, r.subject].map(csvCell).join(","))].join("\n");
  return { ar, en, csv, sent: sent.length, published: pub.length };
}
export async function ownerReportCron(env, nowMs = Date.now()) {
  if (!(await featureOn(env, "owner_daily_report"))) return { off: "feature_off" };
  const to = ownerBox(env); if (!to) return { off: "no_mailbox" };
  if (cairoHM(nowMs) < timeOf(env.OWNER_REPORT_TIME, DM_LIM.ownerTime)) return { waiting: "time" };
  const D = addDays(cairoDay(nowMs), -1);
  if (!(await claim(env, { kind: "owner_daily", ref: D, email: to, nowMs }))) return { done: true };
  const R = await ownerReport(env, D);
  const res = await mail(env, { id: `ownrep-${D}`, to, lang: "ar", subject: `تقرير المنصة اليومي — ${D} / Daily platform report`, ar: R.ar, en: R.en,
    ...(attachOk(env) && R.sent ? { attachments: [{ filename: `emails-${D}.csv`, type: "text/csv", content: "﻿" + R.csv }] } : {}), why: "تقرير داخلي لإيميل المنصة بس / Internal report to the platform's own mailbox." });
  await settle(env, { kind: "owner_daily", ref: D, email: to }, statusOf(res));
  return { day: D, sent: !!res.sent, emails: R.sent };
}

/* ---------- the cron (platformCron, every 15 minutes) ---------- */
export async function mailCron(env, nowMs = Date.now()) {
  if (!env || !env.DB) return {};
  if (!(await storeOn(env))) return { off: "no_0015" };
  const out = {};
  for (const [k, fn] of [["teasers", () => teasersCron(env, nowMs)], ["members", () => memberReportsCron(env, nowMs)], ["owner", () => ownerReportCron(env, nowMs)]]) {
    try { out[k] = await fn(); } catch (e) { out[k] = { error: String((e && e.message) || e) }; console.error("mail cron " + k, (e && e.stack) || e); }
  }
  return out;
}
