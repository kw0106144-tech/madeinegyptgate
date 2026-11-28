/* Request teasers to directory factories that are NOT members (owner decision 2026-11-28 — CLAUDE.md 2.5 as he changed it).
   When a buyer sends a request (kind rfq / basket, or a contact message to one factory's profile), the REGISTERED members that match get
   the FULL request as before (inquiries.js sendRoute). Directory factories that are not registered, and that have an OFFICIAL company
   e-mail (mail-sends.js officialEmail: a role mailbox on the company's own domain, never a person's address), get a TEASER only:
     the title of the request (links, e-mail addresses, phone numbers, quantities and amounts removed), its sector, its region and its
     closing date — nothing else (no buyer, no contact, no quantity, no value) — and the registration link with the plan that receives
     requests of that market, plus the line that they can answer within one business day once they have an account.
   Who: the request's own target when it is a directory profile (a contact on a factory's page), else the directory candidates of the
   matching engine (candidates.js directoryCandidates: sector + product words, the same as the admins' no-match list), at most
   TEASER_PER_REQUEST (5). Never a profile a member owns (members.factory_ref), never an address of a member account, never the buyer.
   Where the addresses come from (admin-only, never public): directory_contacts (0015, the team adds them with the page of the company's
   site that publishes the address) and the old site's imported companies linked to the profile (cc_legacy_companies.factory_ref), each
   through officialEmail() (with the company's web site when the row has one).
   Rules: one e-mail per request per address (mail_sends teaser|<ref>|<email_key>, claimed before sending), one teaser per address per
   Cairo day, a daily cap for the whole platform (TEASER_DAILY_CAP, default 50; the requests left wait for the next day while they are
   at most 3 days old), the stop link of list «teaser» in every e-mail (List-Unsubscribe header + link, common.js mail(); a stopped
   address is skipped before it uses the cap), the block list. A request is looked at 10 minutes after it arrived (the team can block a
   spam request first) and only while it is open (not closed / blocked). Owner switch request_teasers (default ON); also nothing while
   the owner's «registrations» switch is off (a teaser invites a registration). Without migration 0015: nothing is sent. */
import { mail, line, str, jparse, emailKey, cairoDay, addDays, govName, isBlocked, unsubscribed, site, stripLinks, noReply, sha256 } from "./common.js";
import { directoryCandidates } from "./candidates.js";
import { featureOn } from "./flags.js";
import { storeOn, claim, settle, statusOf, sentOn, exists, officialEmail, planForMarket } from "./mail-sends.js";
import { hasTable, dirRow, factoryNames, fail, batch, body as ccBody, paging, all as ccAll, first as ccFirst } from "./acc-base.js";

export const TEASER_LIM = Object.freeze({ perRequest: 5, dailyCap: 50, inquiriesPerTick: 3, waitMin: 10, maxAgeDays: 3, closeDays: 30, title: 90 });
const capOf = env => Math.max(0, Math.min(1000, parseInt(env && env.TEASER_DAILY_CAP, 10) >= 0 ? parseInt(env.TEASER_DAILY_CAP, 10) : TEASER_LIM.dailyCap));
const perReqOf = env => Math.max(1, Math.min(10, parseInt(env && env.TEASER_PER_REQUEST, 10) || TEASER_LIM.perRequest));
const KIND = { rfq: ["طلب عرض سعر", "Request for quotation"], basket: ["طلب سلة منتجات", "Product basket request"], contact: ["رسالة من مشتري لشركتكم", "A buyer's message to your company"] };
const MARKET = { local: ["مصر", "Egypt"], gulf: ["الخليج والدول العربية", "the Gulf & Arab countries"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
const PLAN = { basic: ["الباقة الأساسية", "the Basic plan"], premium: ["الباقة المميزة", "the Premium plan"], partner: ["باقة الشريك الأساسي", "the Core Partner plan"], strategic: ["باقة الشريك الاستراتيجي", "the Strategic Partner plan"] };
const targeted = inq => inq.kind === "contact" || (/^(factory|company)$/.test(inq.target_type || "") && !!inq.target_id);
const refOf = s => { const m = /#([A-Za-z0-9_.-]{1,60})$/.exec(String(s || "")); return m ? m[1] : String(s || "").replace(/^company\.html#/, "").trim(); };

/* the title a non-member may see: what is asked for, without anything that would identify the buyer or the size of the deal */
export function teaserTitle(env, inq) {
  const p = inq.payload || {}, it = (inq.items || [])[0] || {};
  const raw = inq.kind === "contact" ? (p.product || p.title || "") : (p.product || p.title || p.material || it.name || it.product || "");
  let t = stripLinks(str(raw, 400).replace(/[^\s@<>()"]+@[^\s@<>()"]+\.[a-z]{2,}/gi, " "), env)  // e-mail addresses, then links
    .replace(/\[رابط محذوف \/ link removed\]/g, " ")
    .replace(/(?:^|\s)(?:بسعر|السعر|سعر|اتصل|اتصلوا|كلمني|كلموني|تواصل|واتساب|واتس|موبايل|تليفون|call|whatsapp|price|phone|tel)(?=\s|$|[:،,.])/gi, " ") // contact / price lead words
    .replace(/\+?\d[\d\s().-]{6,}\d/g, " ")                                                       // phone numbers / long numbers
    .replace(/\d[\d.,٫]*\s*(?:مليون|ألف|الف)?\s*(?:جنيه|جنية|ج\.?م|دولار|يورو|ريال|درهم|egp|usd|eur|sar|aed|\$|€)/gi, " ") // amounts
    .replace(/(?:الكمي[ةه]|كمي[ةه]|عدد|quantity|qty)\s*[:：]?\s*\d[\d.,]*\s*\S*/gi, " ")          // «الكمية: 500 …»
    .replace(/\d[\d.,]*\s*(?:طن|اطنان|أطنان|كيلو|كجم|كيلوجرام|قطع[ةه]?|وحد[ةه]|وحدات|عبو[ةه]|كرتون[ةه]?|شيكارة|شكاير|pcs|pieces|units?|tons?|tonnes?|kgs?)(?=\s|$|[،,.])/gi, " ")
    .replace(/\s{2,}/g, " ").replace(/^[\s،,.:\-–—]+|[\s،,:\-–—]+$/g, "").trim();
  t = line(t, TEASER_LIM.title);
  return t || line(inq.sector || p.sector || "", TEASER_LIM.title) || KIND[inq.kind === "basket" ? "basket" : inq.kind === "contact" ? "contact" : "rfq"][0];
}
export function teaserFacts(env, inq, nowMs = Date.now()) {
  const p = inq.payload || {}, mk = MARKET[inq.market] ? inq.market : "local";
  const gov = govName(inq.governorate || p.governorate || ""), govEn = govName(inq.governorate || p.governorate || "", true);
  const created = Date.parse(inq.created_at) || nowMs, close = addDays(cairoDay(created), TEASER_LIM.closeDays);
  const want = /^(\d{4}-\d{2}-\d{2})/.exec(String(p.deadline || "")), today = cairoDay(nowMs);
  const deadline = want && want[1] >= today && want[1] < close ? want[1] : close;
  const sector = line(inq.sector || p.sector || "", 80);
  const plan = planForMarket(mk);
  return { title: teaserTitle(env, inq), sector, region: gov ? [gov + (mk === "local" ? "، مصر" : ""), govEn + (mk === "local" ? ", Egypt" : "")] : MARKET[mk], deadline, plan,
    register_url: `${site(env)}register/#${plan}`, kind: KIND[inq.kind === "basket" ? "basket" : inq.kind === "contact" ? "contact" : "rfq"] };
}
export function teaserMail(env, inq, facts, { company = "" } = {}) {
  const f = facts, P = PLAN[f.plan] || PLAN.basic;
  const rows = [`• ${f.kind[0]}: ${f.title}`, f.sector ? `• القطاع: ${f.sector}` : "", `• المنطقة: ${f.region[0]}`, `• آخر موعد: ${f.deadline}`].filter(Boolean).join("\n");
  const rowsEn = [`• ${f.kind[1]}: ${f.title}`, f.sector ? `• Sector: ${f.sector}` : "", `• Region: ${f.region[1]}`, `• Closing date: ${f.deadline}`].filter(Boolean).join("\n");
  return {
    subject: `طلب جديد في مجالكم على منصة صنع في مصر: ${line(f.title, 70)} / A new request in your field`,
    ar: `السلام عليكم${company ? " " + line(company, 80) : ""}،\nوصل على منصة صنع في مصر طلب جديد في مجال شركتكم:\n\n${rows}\n\nتفاصيل الطلب كاملة وبيانات المشتري بتوصل للمصانع المسجّلة على المنصة بس. سجّلوا شركتكم من هنا (${P[0]}):\n${f.register_url}\nوبعد ما تعملوا حسابكم تقدروا تردّوا على الطلب خلال يوم عمل واحد من لوحة التحكم.`,
    en: `Hello,\nA new request in your company's field arrived on Made in Egypt Gate:\n\n${rowsEn}\n\nThe full request and the buyer's details go only to the factories registered on the platform. Register your company here (${P[1]}):\n${f.register_url}\nOnce your account is created you can answer the request within one business day from your dashboard.`,
    why: "وصلتكم لأن شركتكم موجودة في دليل المنصة، على إيميل الشركة الرسمي المنشور / Sent because your company is listed in the platform's directory, to its published official address.",
  };
}

/* the official address of each directory profile (ref → {email, company}); members' profiles / addresses are left out */
export async function officialAddresses(env, refs) {
  const out = new Map(), R = [...new Set(refs.filter(Boolean))].slice(0, 40);
  if (!R.length) return out;
  const ph = R.map(() => "?").join(", ");
  const rows = async (sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
  if (await hasTable(env, "directory_contacts"))
    for (const r of await rows(`SELECT factory_ref, company, email, source_url FROM directory_contacts WHERE status = 'active' AND factory_ref IN (${ph}) ORDER BY id`, ...R)) {
      const e = officialEmail(r.email, r.source_url); if (e && !out.has(r.factory_ref)) out.set(r.factory_ref, { email: e, company: r.company });
    }
  if (await hasTable(env, "cc_legacy_companies"))
    for (const r of await rows(`SELECT factory_ref, company, email, web FROM cc_legacy_companies WHERE factory_ref IN (${ph}) AND email != '' ORDER BY id`, ...R)) {
      const e = officialEmail(r.email, r.web); if (e && !out.has(r.factory_ref)) out.set(r.factory_ref, { email: e, company: r.company });
    }
  if (!out.size) return out;
  for (const r of await rows(`SELECT factory_ref FROM members WHERE factory_ref IN (${ph})`, ...R)) out.delete(r.factory_ref); // a member's profile: the full request path
  const keys = [...out.values()].map(x => emailKey(x.email));
  const mem = new Set((await rows(`SELECT email FROM members WHERE email != '' AND lower(email) IN (${keys.map(() => "?").join(", ")})`, ...[...out.values()].map(x => x.email))).map(r => emailKey(r.email)));
  for (const [ref, x] of [...out]) if (mem.has(emailKey(x.email))) out.delete(ref);
  return out;
}
/* the directory profiles a request's teaser goes to: its own target, else the matching engine's directory candidates */
export function teaserRefs(env, inq) {
  if (targeted(inq)) return inq.target_type && /^(factory|company)$/.test(inq.target_type) && inq.target_id ? [{ ref: refOf(inq.target_id), name: line(inq.target_name, 160) }] : [];
  return directoryCandidates(env, inq, 12).map(c => ({ ref: refOf(c.profile_url || c.url), name: c.name })).filter(x => x.ref);
}

/* one request → its teasers; returns {sent, skipped, capped} */
export async function teaseInquiry(env, inq, { nowMs = Date.now(), cap = capOf(env) } = {}) {
  const out = { sent: 0, skipped: 0, capped: false };
  const day = cairoDay(nowMs), refs = teaserRefs(env, inq);
  const addr = await officialAddresses(env, refs.map(r => r.ref));
  const facts = teaserFacts(env, inq, nowMs);
  let n = 0;
  for (const r of refs) {
    if (n >= perReqOf(env)) break;
    const a = addr.get(r.ref); if (!a) continue;
    const key = emailKey(a.email);
    if (inq.email_key && key === inq.email_key) continue;                                   // never the buyer
    if (await exists(env, "teaser", inq.ref, a.email)) { n++; continue; }                   // this request reached this address already
    if (await unsubscribed(env, a.email, "teaser") || await isBlocked(env, { email: a.email })) { out.skipped++; continue; }
    try { if (await env.DB.prepare("SELECT 1 AS x FROM mail_sends WHERE kind = 'teaser' AND email_key = ? AND day = ? AND status IN ('sent', 'claimed')").bind(key, day).first("x")) { out.skipped++; continue; } } catch (e) { /* fail soft */ }
    if (await sentOn(env, "teaser", day) >= cap) { out.capped = true; break; }
    const company = line(a.company || r.name, 160);
    if (!(await claim(env, { kind: "teaser", ref: inq.ref, email: a.email, company, factory_ref: r.ref, nowMs }))) continue;
    const m = teaserMail(env, inq, facts, { company });
    const res = await mail(env, { id: `teaser-${inq.ref}-${(await sha256(key)).slice(0, 12)}`, to: a.email, lang: "ar", list: "teaser", replyTo: noReply(env), company, ...m });
    await settle(env, { kind: "teaser", ref: inq.ref, email: a.email }, statusOf(res));
    if (res.sent) out.sent++; else out.skipped++;
    n++;
  }
  return out;
}

/* cron (every 15 minutes, daily-mail.js mailCron): the open requests of the last 3 days that have no teaser run yet */
export async function teasersCron(env, nowMs = Date.now()) {
  const out = { requests: 0, sent: 0, skipped: 0 };
  if (!env || !env.DB) return out;
  if (!(await storeOn(env))) return { ...out, off: "no_0015" };
  if (!(await featureOn(env, "request_teasers"))) return { ...out, off: "feature_off" };
  if (!(await featureOn(env, "registrations"))) return { ...out, off: "registrations_off" };
  const cap = capOf(env), day = cairoDay(nowMs);
  if (!cap) return { ...out, off: "cap_zero" };
  if (await sentOn(env, "teaser", day) >= cap) return { ...out, capped: true };
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries i WHERE i.created_at > ? AND i.created_at < ? AND i.status NOT IN ('closed', 'blocked', 'recorded')
      AND (i.kind IN ('rfq', 'basket') OR (i.kind = 'contact' AND i.target_type IN ('factory', 'company')))
      AND NOT EXISTS (SELECT 1 FROM mail_sends s WHERE s.kind = 'teaser_run' AND s.ref = i.ref) ORDER BY i.created_at LIMIT ?`)
    .bind(new Date(nowMs - TEASER_LIM.maxAgeDays * 86400000).toISOString(), new Date(nowMs - TEASER_LIM.waitMin * 60000).toISOString(), TEASER_LIM.inquiriesPerTick).all();
  for (const row of results || []) {
    const inq = { ...row, payload: jparse(row.payload_json, {}), items: jparse(row.items_json, []) };
    const r = await teaseInquiry(env, inq, { nowMs, cap });
    out.requests++; out.sent += r.sent; out.skipped += r.skipped;
    if (r.capped) { out.capped = true; break; }                                             // the rest of this request waits for tomorrow
    if (await claim(env, { kind: "teaser_run", ref: inq.ref, nowMs })) await settle(env, { kind: "teaser_run", ref: inq.ref }, "sent");
  }
  return out;
}

/* ---------- Control Center: the official addresses of directory profiles (0015 directory_contacts; admin-only) ----------
   GET    /api/admin/cc/outreach/contacts[?q=&ref=&limit=&offset=]   legacy.contacts   the rows (+ the profile's public name)
   POST   /api/admin/cc/outreach/contacts {items:[{factory_ref, email, source_url, company?}] ≤ 200}   directory.write   upsert, audited
          each row: a directory profile that exists, an OFFICIAL address (officialEmail with the source page's site), an https source page
          of the company's own site → {added, updated, refused:[{i, factory_ref, why}]}
   DELETE /api/admin/cc/outreach/contacts/:id                         directory.write   status «off» (never used again), audited */
const CONTACTS_MAX = 200;
export async function listContacts(env, url) {
  if (!(await hasTable(env, "directory_contacts"))) fail(503, "store_off", "apply migrations/0015_mail_reports.sql");
  const { limit, offset, page } = paging(url), where = [], args = [];
  const q = line(url.searchParams.get("q"), 100), ref = line(url.searchParams.get("ref"), 60);
  if (q) { where.push("(company LIKE ? OR email LIKE ? OR factory_ref = ?)"); args.push("%" + q.replace(/[%_]/g, "") + "%", "%" + q.replace(/[%_]/g, "") + "%", q); }
  if (ref) { where.push("factory_ref = ?"); args.push(ref); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = ((await ccFirst(env, `SELECT COUNT(*) AS n FROM directory_contacts ${w}`, ...args)) || {}).n || 0;
  const items = await ccAll(env, `SELECT * FROM directory_contacts ${w} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  const names = await factoryNames(env, items.map(r => r.factory_ref));
  return { items: items.map(r => ({ ...r, factory_name: names.get(r.factory_ref) || "" })), total, page, limit };
}
export async function addContacts(req, env, ctx, adm) {
  if (!(await hasTable(env, "directory_contacts"))) fail(503, "store_off", "apply migrations/0015_mail_reports.sql");
  const b = await ccBody(req), list = Array.isArray(b.items) ? b.items : [];
  if (!list.length || list.length > CONTACTS_MAX) fail(422, "invalid", `items: 1 … ${CONTACTS_MAX}`);
  const refused = [], stmts = [], t = new Date().toISOString(), refs = [];
  let added = 0, updated = 0;
  for (let i = 0; i < list.length; i++) {
    const x = list[i] || {}, ref = line(x.factory_ref, 60), src = line(x.source_url, 500), row = dirRow(ref);
    if (!row) { refused.push({ i, factory_ref: ref, why: "no_such_profile" }); continue; }
    if (!/^https:\/\/[^\s"<>]+$/i.test(src)) { refused.push({ i, factory_ref: ref, why: "source_url_https" }); continue; }
    const e = officialEmail(x.email, src);
    if (!e) { refused.push({ i, factory_ref: ref, why: "not_official" }); continue; } // a role mailbox on the company's own site only
    const ex = await ccFirst(env, "SELECT id FROM directory_contacts WHERE factory_ref = ? AND email_key = ?", ref, emailKey(e));
    if (ex) updated++; else added++;
    refs.push(ref);
    stmts.push(env.DB.prepare("INSERT INTO directory_contacts (factory_ref, company, email, email_key, source_url, status, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT(factory_ref, email_key) DO UPDATE SET company = excluded.company, source_url = excluded.source_url, status = 'active', updated_at = excluded.updated_at")
      .bind(ref, line(x.company || row[0], 160), e, emailKey(e), src, line((adm.member && adm.member.email) || adm.role || "", 254), t, t));
  }
  if (stmts.length) await batch(env, [...stmts, adm.auditStmt("outreach.contacts_add", "directory_contacts", "", null, { refs: refs.slice(0, 50), added, updated }, `${added + updated} official address(es) for teasers`)]);
  return { ok: true, added, updated, refused };
}
export async function offContact(req, env, ctx, adm, id) {
  if (!(await hasTable(env, "directory_contacts"))) fail(503, "store_off", "apply migrations/0015_mail_reports.sql");
  const r = await ccFirst(env, "SELECT * FROM directory_contacts WHERE id = ?", parseInt(id, 10) || 0); if (!r) fail(404, "not_found", "not found");
  await batch(env, [env.DB.prepare("UPDATE directory_contacts SET status = 'off', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), r.id),
    adm.auditStmt("outreach.contacts_off", "directory_contacts", r.id, { status: r.status }, { status: "off" }, `${r.factory_ref}: off`)]);
  return { ok: true };
}
