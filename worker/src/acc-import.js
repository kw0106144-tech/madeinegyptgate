/* «استيراد من النظام القديم» — owner-only import of the old PHP system's data (ACC-CONTRACT §1.5, §3.1.14).
   The browser signs in to the OLD API itself (same origin, through the transparent proxy), pages through a=admin_list and posts batches
   of ≤ 50 rows here. Every batch is an idempotent upsert keyed by e-mail / legacy id / company, with a dry-run preview first:
   create · update · unchanged (same old row as last time) · conflict (changed locally since the last import, overwrite off) · skip · error.
   Secrets are dropped (client AND server), nothing is e-mailed, nothing is routed (setPlan without rematch), public content lands as
   DRAFTS unless «انشر» is ticked, old contacts stay admin-only (cc_legacy_companies / cc_legacy_messages). One audit row per applied batch. */
import DATA from "./data.json";
import { line, str, now, hex, sha256, isEmail, emailKey, cairoDay, canonPlan, jparse } from "./common.js";
import { findByEmail } from "./auth.js";
import { e164 } from "./whatsapp.js";
import { norm } from "./text.js";
import { fail, body, all, first, needTables, batch, jget, txt, txt1, isHttps, dateOk, bestDirMatch, dirRow, rid, audit, auditDone } from "./acc-base.js";
import { setPlan, metaUpsert, metaOf } from "./acc-members.js";
import { legacyPlanRule, cleanProfile } from "./acc-legacy.js";
import { savePlans, plansData, bootPlans } from "./acc-plans.js";

const KINDS = ["tender", "news", "video", "award", "project", "procurement", "event", "banner"];
const ENTITIES = new Set(["users", "members", "products", "messages", "rfqs", "settings", "plans", "pay", "mail", ...KINDS.map(k => "items:" + k)]);
const CLIENT = new Set(["seo", "keywords", "redirects"]);
const FORBID = /pass|secret|token|api_?key|smtp_pass/i;
export function stripSecrets(row) {
  const out = {}, dropped = [];
  for (const [k, v] of Object.entries(row && typeof row === "object" && !Array.isArray(row) ? row : {})) {
    if (FORBID.test(k)) { dropped.push(k); continue; }
    if (k === "data" && v && typeof v === "object" && !Array.isArray(v)) { const d = {}; for (const [k2, v2] of Object.entries(v)) { if (FORBID.test(k2)) dropped.push("data." + k2); else d[k2] = v2; } out[k] = d; }
    else out[k] = v;
  }
  return { row: out, dropped };
}
const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
export const rowHash = async r => (await sha256(JSON.stringify(sortKeys(r)))).slice(0, 32);
const S = v => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const day10 = v => { const s = S(v).slice(0, 10); return dateOk(s) ? s : ""; };
const projHash = async (m, meta) => (await sha256(JSON.stringify([m.company || "", m.name || "", m.phone || "", canonPlan(m.plan), m.plan_expires || "", (meta && meta.status) || "active", (meta && meta.requested_plan) || ""]))).slice(0, 16);
const SECRETS_NOTE = "المفاتيح والباسوردات مابتتنقلش — لازم تتدخل من جديد في الإعدادات / keys and passwords are never imported — re-enter them";
async function mapGet(env, ent, lid) { const r = await first(env, "SELECT raw_json FROM cc_legacy_rows WHERE entity = ? AND legacy_id = ?", ent, lid); return r ? jget(r.raw_json, null) : null; }
const mapPut = (env, ent, lid, o, runId) => env.DB.prepare("INSERT INTO cc_legacy_rows (entity, legacy_id, raw_json, run_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(entity, legacy_id) DO UPDATE SET raw_json = excluded.raw_json, run_id = excluded.run_id").bind(ent, lid, JSON.stringify(o).slice(0, 20000), runId, now()).run();

/* ---------- users → members + cc_member_meta ---------- */
async function impUser(env, I, raw) {
  const { row, dropped } = stripSecrets(raw);
  const email = line(row.email, 254).toLowerCase(); if (!isEmail(email)) return { action: "error", code: "invalid_email", key: line(row.email, 80) };
  const lid = line(S(row.id), 40), h1 = await rowHash(row), key = email;
  let m = await findByEmail(env, email);
  const meta = m ? await metaOf(env, m.id) : null, [oh1, oh2] = String((meta && meta.imported_hash) || "").split(".");
  if (m && oh1 === h1) return { action: "unchanged", key, target_id: m.id };
  if (lid) { const other = await first(env, "SELECT member_id FROM cc_member_meta WHERE legacy_id = ?", lid); if (other && (!m || other.member_id !== m.id)) return { action: "conflict", key, code: "legacy_id_taken", target_id: other.member_id, warnings: ["رقم العضو القديم ده مربوط بحساب تاني / this old id is linked to another account"] }; }
  if (m && oh2 && oh2 !== (await projHash(m, meta)) && !I.opts.overwrite) return { action: "conflict", key, target_id: m.id, warnings: ["العضو اتعدّل في النظام الجديد بعد آخر استيراد — اختار «استبدل التعديلات» لو عايز تكتب فوقه / changed here since the last import"] };
  const fill = {}, company = line(row.company, 160), name = line(row.manager, 120), phone = e164(S(row.tel));
  const want = (k, v) => { if (v && (!m || !m[k] || (I.opts.overwrite && m[k] !== v))) fill[k] = v; };
  want("company", company); want("name", name); want("phone", phone);
  if (m && m.factory_ref) delete fill.company; // the company name is locked to the linked listing
  const rule = legacyPlanRule(m, meta, { plan: row.plan, status: row.status, plan_until: row.plan_until });
  const diff = {}; for (const [k, v] of Object.entries(fill)) diff[k] = [m ? m[k] || "" : "", v];
  if (rule.plan) diff.plan = [m ? `${m.plan}${m.plan_expires ? " ≤ " + m.plan_expires.slice(0, 10) : ""}` : "visitor", `${rule.plan.plan}${rule.plan.expires ? " ≤ " + rule.plan.expires.slice(0, 10) : ""}`];
  if (rule.pending) diff.status = [(meta && meta.status) || "active", "pending → " + rule.pending];
  const warnings = [...(dropped.length ? [`اتشالت حقول سرية / secret fields dropped: ${dropped.join(", ")}`] : []), ...(S(row.tel) && !phone ? ["رقم الموبايل مش صالح — محفوظ في البيانات القديمة بس / invalid phone kept in the legacy data only"] : [])];
  const action = m ? "update" : "create";
  if (I.dry) return { action, key, target_id: m ? m.id : undefined, diff, warnings };
  const t = now();
  if (!m) { const id = "u" + hex(8); await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, name, phone) VALUES (?, ?, ?, 'visitor', 1, ?, ?, ?, ?)").bind(id, fill.company || "", email, t, t, fill.name || "", fill.phone || "").run(); m = await first(env, "SELECT * FROM members WHERE id = ?", id); }
  else { const cols = Object.keys(fill); if (cols.length) await env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => fill[c]), t, m.id).run(); }
  if (rule.plan) await setPlan(env, { memberId: m.id, plan: rule.plan.plan, expires: rule.plan.expires, by: I.actor, reason: "import", rematch: false, audit: false });
  const prof = typeof row.data === "string" ? jget(row.data, {}) : row.data;
  await metaUpsert(env, m.id, { ...rule.legacy, ...(lid ? { legacy_id: lid } : {}), legacy_last_login: line(S(row.last_login), 40), ...(prof && typeof prof === "object" ? { legacy_profile_json: JSON.stringify(cleanProfile(prof)) } : {}),
    ...(rule.pending ? { status: "pending", requested_plan: rule.pending } : {}), ...(meta && meta.source ? {} : { source: "import" }) }, t).run();
  const fm = await first(env, "SELECT * FROM members WHERE id = ?", m.id), fmeta = await metaOf(env, m.id);
  await env.DB.prepare("UPDATE cc_member_meta SET imported_hash = ? WHERE member_id = ?").bind(h1 + "." + (await projHash(fm, fmeta)), m.id).run();
  return { action, key, target_id: m.id, diff, warnings };
}
/* ---------- members («الشركات») → cc_legacy_companies (admin-only contacts) ---------- */
async function impCompany(env, I, raw) {
  const { row } = stripSecrets(raw), company = line(row.company, 200);
  if (!company) return { action: "error", code: "company_required" };
  const lid = line(S(row.id), 40), email = line(row.email, 254).toLowerCase(), ek = isEmail(email) ? emailKey(email) : "", key = lid ? "L" + lid : norm(company) + "|" + ek;
  const ex = lid ? await first(env, "SELECT * FROM cc_legacy_companies WHERE legacy_id = ?", lid) : await first(env, "SELECT * FROM cc_legacy_companies WHERE legacy_id = '' AND company_key = ? AND email_key = ?", norm(company), ek);
  const h1 = await rowHash(row);
  if (ex && ex.imported_hash === h1) return { action: "unchanged", key, target_id: String(ex.id) };
  const sug = bestDirMatch(company), st = S(row.status).toLowerCase();
  const rec = { legacy_id: lid, company, company_key: norm(company), manager: line(row.manager, 120), country: line(row.country, 40), phones: line(row.phones, 300), email: ek ? email : "", email_key: ek, web: line(row.web, 300),
    address: line(row.address, 300), activity: str(S(row.activity), 2000), status: ["registered", "lead"].includes(st) ? st : line(st, 20), suggested_ref: sug.ref };
  const diff = {}; for (const k of ["company", "manager", "country", "phones", "email", "web", "address", "activity", "status"]) if (!ex || ex[k] !== rec[k]) diff[k] = [ex ? ex[k] : "", rec[k]];
  const warnings = sug.ref ? [`اقتراح ربط بالدليل / suggested listing: ${(dirRow(sug.ref) || [""])[0]} (${sug.score})`] : [];
  if (I.dry) return { action: ex ? "update" : "create", key, target_id: ex ? String(ex.id) : undefined, diff, warnings };
  const t = now(), raw_json = JSON.stringify(row).slice(0, 8000);
  if (ex) await env.DB.prepare("UPDATE cc_legacy_companies SET company = ?, company_key = ?, manager = ?, country = ?, phones = ?, email = ?, email_key = ?, web = ?, address = ?, activity = ?, status = ?, suggested_ref = ?, raw_json = ?, imported_hash = ?, run_id = ?, updated_at = ? WHERE id = ?")
    .bind(rec.company, rec.company_key, rec.manager, rec.country, rec.phones, rec.email, rec.email_key, rec.web, rec.address, rec.activity, rec.status, rec.suggested_ref, raw_json, h1, I.run.id, t, ex.id).run();
  else await env.DB.prepare("INSERT INTO cc_legacy_companies (legacy_id, company, company_key, manager, country, phones, email, email_key, web, address, activity, status, suggested_ref, raw_json, imported_hash, run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(rec.legacy_id, rec.company, rec.company_key, rec.manager, rec.country, rec.phones, rec.email, rec.email_key, rec.web, rec.address, rec.activity, rec.status, rec.suggested_ref, raw_json, h1, I.run.id, t, t).run();
  const id = ex ? ex.id : (await first(env, "SELECT id FROM cc_legacy_companies WHERE run_id = ? AND company_key = ? ORDER BY id DESC LIMIT 1", I.run.id, rec.company_key) || {}).id;
  return { action: ex ? "update" : "create", key, target_id: String(id || ""), diff, warnings };
}
/* ---------- messages → cc_legacy_messages ---------- */
async function impMessage(env, I, raw) {
  const { row } = stripSecrets(raw), lid = line(S(row.id), 40);
  if (!lid) return { action: "error", code: "id_required" };
  const ex = await first(env, "SELECT * FROM cc_legacy_messages WHERE legacy_id = ?", lid), h1 = await rowHash(row), key = "L" + lid;
  if (ex && ex.imported_hash === h1) return { action: "unchanged", key, target_id: String(ex.id) };
  if (ex && ex.updated_by && !I.opts.overwrite) return { action: "conflict", key, target_id: String(ex.id), warnings: ["الرسالة اتعدّلت هنا (الحالة) بعد آخر استيراد / its status was changed here"] };
  const email = line(row.email, 254).toLowerCase(), st = ["new", "read", "done"].includes(S(row.status)) ? S(row.status) : "new";
  const rec = { name: line(row.name, 120), phone: line(row.phone, 40), email: isEmail(email) ? email : "", email_key: isEmail(email) ? emailKey(email) : "", kind: line(row.kind, 40), subject: line(row.subject, 300), body: str(S(row.body), 8000), status: st, legacy_at: line(S(row.created_at), 40) };
  if (I.dry) return { action: ex ? "update" : "create", key, target_id: ex ? String(ex.id) : undefined };
  const t = now();
  if (ex) await env.DB.prepare("UPDATE cc_legacy_messages SET name = ?, phone = ?, email = ?, email_key = ?, kind = ?, subject = ?, body = ?, status = ?, legacy_at = ?, imported_hash = ?, run_id = ?, updated_at = ? WHERE id = ?").bind(rec.name, rec.phone, rec.email, rec.email_key, rec.kind, rec.subject, rec.body, rec.status, rec.legacy_at, h1, I.run.id, t, ex.id).run();
  else await env.DB.prepare("INSERT INTO cc_legacy_messages (legacy_id, name, phone, email, email_key, kind, subject, body, status, legacy_at, imported_hash, run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(lid, rec.name, rec.phone, rec.email, rec.email_key, rec.kind, rec.subject, rec.body, rec.status, rec.legacy_at, h1, I.run.id, t, t).run();
  return { action: ex ? "update" : "create", key, target_id: String(ex ? ex.id : ((await first(env, "SELECT id FROM cc_legacy_messages WHERE legacy_id = ?", lid)) || {}).id || "") };
}
/* ---------- public content → CC.content as drafts (products, rfqs, items) ---------- */
const CAT_RX = [["food", /غذائ|اغذي|أغذي|food|بهارات|ألبان|البان/i], ["build", /بناء|build|construct|اسمنت|أسمنت|سيراميك/i], ["plastic", /بلاست|plastic/i], ["elec", /كهرب|elect|كابل/i], ["glass", /زجاج|glass/i], ["metal", /معادن|معدن|حديد|metal|steel|ألومنيوم|الومنيوم/i], ["petro", /بترو|كيماو|petro|chem/i], ["med", /طب|دواء|ادوي|أدوي|med|pharma/i], ["furn", /اثاث|أثاث|موبيليا|furn/i], ["cosm", /تجميل|منظف|cosm/i]];
const catOf = c => { const s = S(c).trim(); if (/^(food|build|plastic|elec|glass|metal|petro|med|furn|cosm|other)$/.test(s)) return s; const hit = CAT_RX.find(([, rx]) => rx.test(s)); return hit ? hit[0] : "other"; };
const ytId = u => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/.exec(S(u)); return m ? m[1] : ""; };
const hostName = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
function itemFields(kind, row) {
  const title = txt1(row.title, 300), link = isHttps(S(row.link)) ? S(row.link) : "", body = txt(row.body, 2000), date = day10(row.created_at);
  if (kind === "tender") return { coll: "tend", idPrefix: true, fields: { title, ...(link ? { source_url: link } : {}) } };
  if (kind === "news" || kind === "procurement") return { coll: "news", fields: { title_ar: title, summary_ar: txt(row.body, 1200), url: link, source_name: hostName(link), date, category_ar: kind === "procurement" ? "أخبار المشتريات" : "", ...(S(row.img) ? { legacy_img: line(row.img, 500) } : {}) } };
  if (kind === "video") { const id = ytId(link); return { coll: "video", id, fields: { title_ar: title } }; }
  if (kind === "award") return { coll: "award", fields: { title_ar: title, winner_ar: "", source_url: link, date } };
  if (kind === "project") return { coll: "proj", idPrefix: true, fields: { name: title, ...(link ? { source_url: link } : {}) } };
  if (kind === "event") return { coll: "event", fields: { name_ar: title, about_ar: body, url: link, source_url: link } };
  if (kind === "banner") return { coll: "banner", fields: { title_ar: title, link: S(row.link).startsWith("/") || link ? line(row.link, 500) : "", img: "", place: "home" } };
  return null;
}
async function impContent(env, I, raw, ent) {
  const { row } = stripSecrets(raw), lid = line(S(row.id), 40);
  if (!lid) return { action: "error", code: "id_required" };
  const key = "L" + lid, mapEnt = "map:" + ent, mp = await mapGet(env, mapEnt, lid), h1 = await rowHash(row);
  if (mp && mp.h === h1) return { action: "unchanged", key, target_id: mp.id };
  let spec, publishable = S(row.status || "active") === "active", priv;
  if (ent === "products") {
    const name = txt1(row.name, 120); if (!name) return { action: "error", code: "name_required", key };
    if (!mp) { const n = norm(name), c = norm(S(row.company)); if ((DATA.p || []).some(p => norm(p[0]) === n && (!c || norm(p[1]).includes(c)))) return { action: "skip", key, warnings: ["موجود في الدليل / already in the directory data"] }; }
    spec = { coll: "prod", fields: { name, description: txt(row.descr, 600), category: catOf(row.category), price: txt1(row.price, 40), ...(S(row.img) ? { legacy_img: line(row.img, 500) } : {}), legacy_company: txt1(row.company, 160) } };
    publishable = false; // the old image URL must be re-uploaded before a product is published
  } else if (ent === "rfqs") {
    const title = txt1(row.product, 300); if (!title) return { action: "error", code: "product_required", key };
    const deadline = day10(row.deadline), gov = /^[A-Z]{3}$/.test(S(row.gov)) ? S(row.gov) : "";
    spec = { coll: "rfq", idPrefix: true, fields: { title, details: txt(row.details, 2000), qty: [txt1(row.qty, 30), txt1(row.unit, 20)].filter(Boolean).join(" "), delivery: txt1(row.city, 120), deadline, gov, sector: txt1(row.sector, 120), date: day10(row.created_at) || cairoDay() } };
    priv = { client: line(row.client, 160), phone: line(row.phone, 40), email: line(row.email, 254), channel: line(row.channel, 60), legacy_id: lid };
    publishable = publishable && (!deadline || deadline >= cairoDay());
  } else {
    spec = itemFields(ent.slice(6), row); if (!spec) return { action: "error", code: "invalid_entity", key };
    if (spec.coll === "video" && !spec.id) return { action: "error", code: "invalid_youtube_url", key };
  }
  if (mp && !I.opts.overwrite) { const c = await first(env, "SELECT rev FROM cc_content WHERE id = ?", mp.id); if (c && Number(c.rev) > Number(mp.rev || 0)) return { action: "conflict", key, target_id: mp.id, warnings: ["اتعدّل هنا بعد آخر استيراد / changed here since the last import"] }; }
  const publish = !!(I.opts.publish && publishable);
  const warnings = ent === "products" && S(row.img) ? ["الصورة القديمة لازم تترفع تاني قبل النشر / re-upload the image before publishing"] : [];
  if (I.dry) return { action: mp ? "update" : "create", key, target_id: mp ? mp.id : undefined, warnings, diff: { publish: [false, publish] } };
  const content = I.CC && I.CC.content;
  if (!content || typeof content.upsert !== "function") return { action: "error", code: "content_off", key };
  const id = mp ? mp.id : spec.id || (spec.idPrefix ? "L" + lid : undefined);
  let r;
  try { r = await content.upsert(env, { coll: spec.coll, kind: "add", ...(id ? { id } : {}), fields: spec.fields, ...(priv ? { private: priv } : {}), source: "import", publish, by: I.by }); }
  catch (e) { return { action: "error", key, code: (e && e.code) || "content_error", ...(e && e.errors ? { warnings: e.errors.map(x => `${x.field}: ${x.msg}`) } : {}) }; }
  const cid = (r && r.item && r.item.id) || id || "";
  if (!publishable && S(row.status) && S(row.status) !== "active" && cid && typeof content.setHidden === "function") { try { await content.setHidden(env, { coll: spec.coll, id: cid, hidden: true, publish: false, by: I.by }); } catch (e) { warnings.push("couldn't hide: " + ((e && e.code) || "error")); } }
  const rev = cid ? ((await first(env, "SELECT rev FROM cc_content WHERE id = ?", cid)) || {}).rev || 0 : 0;
  await mapPut(env, mapEnt, lid, { id: cid, h: h1, rev }, I.run.id);
  return { action: mp ? "update" : "create", key, target_id: cid, warnings };
}
/* ---------- settings / plans / pay / mail ---------- */
async function putSetting(env, k, scope, v, by) {
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at WHERE cc_settings.scope = excluded.scope").bind(k, scope, v, by, now()).run();
}
async function impSetting(env, I, raw) {
  const { row } = stripSecrets(raw), k0 = line(S(row.k), 60).replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!k0) return { action: "error", code: "key_required" };
  const k = "legacy." + k0, v = txt(row.v, 2000), cur = await first(env, "SELECT v FROM cc_settings WHERE k = ?", k);
  const pub = [];
  if (I.opts.apply_settings) {
    const raw1 = S(row.v).trim();
    if (k0 === "contact_email" && isEmail(raw1.toLowerCase())) pub.push(["contact_email", raw1.toLowerCase()]);
    if (k0 === "whatsapp") { const p = e164(raw1); if (p) pub.push(["whatsapp_display", txt1(raw1, 40)], ["whatsapp_number", p.slice(1)]); }
    if (k0 === "phone") { const d = raw1.replace(/[^\d+]/g, ""); if (/^\+?\d{6,15}$/.test(d)) pub.push(["hotline_display", txt1(raw1, 40)], ["hotline_tel", d.startsWith("+") ? d : d.startsWith("0") ? "+20" + d.slice(1) : d]); }
  }
  if (cur && cur.v === v && !pub.length) return { action: "unchanged", key: k };
  if (I.dry) return { action: cur ? "update" : "create", key: k, diff: { [k]: [cur ? cur.v : "", v], ...Object.fromEntries(pub.map(([pk, pv]) => [pk, ["", pv]])) } };
  await putSetting(env, k, "custom", v, I.by);
  for (const [pk, pv] of pub) await putSetting(env, pk, "public", pv, I.by);
  if (pub.length) I.publish = true;
  return { action: cur ? "update" : "create", key: k };
}
const OLD_KNOWN = { products: "products", video: "video", social: "social", featured: "featured" }, OLD_ARCHIVE = new Set(["tenders", "contacts"]), OLD_BOOL = new Set(["video", "social", "featured", "tenders", "contacts"]);
async function impPlans(env, I, raw) {
  const { row } = stripSecrets(raw), keys = row.keys && typeof row.keys === "object" ? row.keys : {}, perms = row.perms && typeof row.perms === "object" ? row.perms : {};
  const cur = await plansData(env), have = new Map(cur.keys.map(k => [k.k, k])), newKeys = [], plans = {}, warnings = [];
  for (const [k0, label] of Object.entries(keys)) {
    const ok = line(k0, 40);
    if (OLD_ARCHIVE.has(ok)) { warnings.push(`«${txt1(label, 60)}» اتحفظ بس (قرار المالك: ${ok === "tenders" ? "المناقصات من الباقة الأساسية وطالع" : "بيانات التواصل مابتظهرش"}) / archived only`); continue; }
    let nk = OLD_KNOWN[ok];
    const vals = Object.values(perms).map(p => p && p[ok]).filter(v => v != null), isBool = OLD_BOOL.has(ok) || vals.every(v => v === 0 || v === 1 || v === true || v === false || v === "0" || v === "1");
    if (!nk) { nk = ("legacy_" + ok.toLowerCase().replace(/[^a-z0-9_]/g, "_")).slice(0, 31); if (!have.has(nk) || !have.get(nk).builtin) newKeys.push({ k: nk, type: isBool ? "bool" : "number", label_ar: txt1(label, 80) || ok, label_en: ok, grp: "legacy" }); warnings.push(`«${txt1(label, 60)}» صف جديد «محفوظ — مش مطبّق» / new row, stored but not enforced`); }
    for (const p of ["profile", "basic", "premium", "partner", "strategic"]) {
      const v = perms[p] && perms[p][ok]; if (v == null) continue;
      const type = have.has(nk) ? have.get(nk).type : isBool ? "bool" : "number";
      (plans[p] = plans[p] || { caps: {} }).caps[nk] = type === "bool" ? (v === true || v === 1 || v === "1" ? 1 : 0) : Math.trunc(Number(v)) || 0;
    }
  }
  if (I.opts.keep_limits) for (const p of Object.keys(plans)) delete plans[p].caps.products;
  const res = await savePlans(env, I.ctx, I.adm, { plans, keys: newKeys }, { dry: true });
  const diff = { ...res.body.before && Object.keys(res.body.after || {}).length ? { matrix: [res.body.before, res.body.after] } : {} };
  if (!Object.keys(res.body.after || {}).length) return { action: "unchanged", key: "plans", warnings };
  if (I.dry) return { action: "update", key: "plans", diff, warnings };
  await mapPut(env, "plans", "plans_get", row, I.run.id);
  await savePlans(env, I.ctx, I.adm, { plans, keys: newKeys }, { reason: "import" });
  return { action: "update", key: "plans", diff, warnings };
}
const PAY_IMPL = ["ngenius", "paymob", "paytabs", "manual"];
async function impPay(env, I, raw) {
  const { row, dropped } = stripSecrets(raw), c = row.cfg && typeof row.cfg === "object" ? row.cfg : row, warnings = [SECRETS_NOTE];
  const provider = PAY_IMPL.includes(S(c.provider)) ? S(c.provider) : "";
  if (S(c.provider) && !provider) warnings.push(`البوابة «${txt1(c.provider, 40)}» مش متاحة في النظام الجديد / gateway not supported`);
  const set = { "pay.enabled": "0", "pay.provider": provider, "pay.mode": S(c.mode) === "live" ? "live" : "test", "pay.currency": "EGP" };
  if (provider === "ngenius" && S(c.outlet_id)) set["pay.ngenius.outlet_id"] = line(c.outlet_id, 80);
  if (provider === "paytabs" && /^\d{1,12}$/.test(S(c.merchant_id).trim())) set["pay.paytabs.profile_id"] = S(c.merchant_id).trim();
  for (const [k, f] of [["pay.success_url", "success_url"], ["pay.fail_url", "fail_url"]]) if (isHttps(S(c[f]))) set[k] = S(c[f]);
  if (S(c.notes)) set["pay.notes"] = txt(c.notes, 500);
  if (dropped.length) warnings.push(`اتشالت / dropped: ${dropped.join(", ")}`);
  if (I.dry) return { action: "update", key: "pay", diff: Object.fromEntries(Object.entries(set).map(([k, v]) => [k, ["", v]])), warnings };
  for (const [k, v] of Object.entries(set)) await putSetting(env, k, "pay", v, I.by);
  return { action: "update", key: "pay", warnings };
}
async function impMail(env, I, raw) {
  const { row } = stripSecrets(raw), c = row.cfg && typeof row.cfg === "object" ? row.cfg : row, warnings = [SECRETS_NOTE];
  const provider = S(c.provider) === "brevo" ? "brevo" : "resend";
  if (S(c.provider) && S(c.provider) !== "brevo") warnings.push("SMTP مايشتغلش على Cloudflare — اتحوّل لـ Resend ومقفول لحد ما المفتاح يتدخل / SMTP → Resend, switched off until a key is entered");
  const set = { "mail.enabled": "0", "mail.provider": provider }, from = line(c.from_email, 254).toLowerCase();
  if (from) { if (isEmail(from) && from.endsWith("@madeinegyptgate.com")) set["mail.from_email"] = from; else warnings.push("البريد المرسِل لازم يكون على madeinegyptgate.com — اتساب الافتراضي / the sender must be on madeinegyptgate.com"); }
  if (S(c.from_name)) set["mail.from_name"] = txt1(c.from_name, 80);
  const rt = line(c.reply_to, 254).toLowerCase(); if (rt && isEmail(rt)) set["mail.reply_to"] = rt;
  if (I.dry) return { action: "update", key: "mail", diff: Object.fromEntries(Object.entries(set).map(([k, v]) => [k, ["", v]])), warnings };
  for (const [k, v] of Object.entries(set)) await putSetting(env, k, "mail", v, I.by);
  try { if (I.CC && I.CC.email && typeof I.CC.email.forgetMailCache === "function") I.CC.email.forgetMailCache(env); } catch (e) { /* memo expires in 60 s */ }
  return { action: "update", key: "mail", warnings };
}

/* ---------- runs ---------- */
const runOut = r => r && { id: r.id, started_by: r.started_by, started_at: r.started_at, finished_at: r.finished_at, status: r.status, options: jget(r.options_json, {}), counts: jget(r.counts_json, {}), report: jget(r.report_json, []), note: r.note };
export async function startRun(req, env, ctx, adm) {
  const b = await body(req);
  await needTables(env, "cc_import_runs", "cc_audit");
  const o = b.options && typeof b.options === "object" ? b.options : {}, options = { overwrite: !!o.overwrite, publish: !!o.publish, redirects: o.redirects !== false, apply_settings: !!o.apply_settings, keep_limits: !!o.keep_limits };
  const id = rid(12), t = now();
  await batch(env, [env.DB.prepare("INSERT INTO cc_import_runs (id, started_by, started_at, status, options_json, note) VALUES (?, ?, ?, 'open', ?, ?)").bind(id, adm.actor.actor_email || adm.actor.actor_id, t, JSON.stringify(options), line(b.note || "", 300)),
    adm.auditStmt("import.start", "import_run", id, null, options, "import run started")]);
  return { status: 201, body: { run: { id, started_at: t, options } } };
}
export async function listRuns(env) { return { items: (await all(env, "SELECT * FROM cc_import_runs ORDER BY started_at DESC LIMIT 50")).map(r => ({ ...runOut(r), report: undefined })) }; }
export async function getRun(env, id) { const r = await first(env, "SELECT * FROM cc_import_runs WHERE id = ?", id); if (!r) fail(404, "not_found", "run not found"); return { run: runOut(r) }; }
export async function runBatch(req, env, ctx, adm, id) {
  const b = await body(req, 512 * 1024);
  await needTables(env, "cc_import_runs", "cc_audit", "cc_member_meta", "cc_legacy_companies", "cc_legacy_messages", "cc_legacy_rows", "cc_settings");
  const run = await first(env, "SELECT * FROM cc_import_runs WHERE id = ?", id); if (!run) fail(404, "not_found", "run not found");
  if (run.status !== "open") fail(409, "state", "this import run is finished — start a new one", { status: run.status });
  const entity = line(b.entity, 40), opts = jget(run.options_json, {}), dry = b.dry_run !== false;
  const counts = { create: 0, update: 0, unchanged: 0, conflict: 0, skip: 0, error: 0 }, results = [];
  if (CLIENT.has(entity)) {
    if (Array.isArray(b.rows) && entity === "keywords" && !dry) for (const r0 of b.rows.slice(0, 50)) { const { row } = stripSecrets(r0), kw = line(S(row.kw), 160); if (kw) await mapPut(env, "keywords", (kw + "|" + line(S(row.page), 200)).slice(0, 300), { note: txt1(row.note, 300), rank: txt1(row.rank, 20), page: line(S(row.page), 200) }, run.id); }
    const cr = b.client_result && typeof b.client_result === "object" ? b.client_result : {};
    for (const k of Object.keys(counts)) if (Number.isFinite(+cr[k])) counts[k] = +cr[k];
    await appendReport(env, run, { entity, dry_run: dry, client: true, counts, errors: Array.isArray(cr.errors) ? cr.errors.slice(0, 50) : [] }, !dry);
    if (!dry) await audit(env, { ...adm.actor, action: "import.apply", target_type: "import_run", target_id: run.id, summary: `import ${entity} (SEO API)`, after: { entity, counts }, ip_hash: adm.ipHash, req_id: adm.reqId });
    return { body: { entity, dry_run: dry, results: [], counts } };
  }
  if (!ENTITIES.has(entity)) fail(400, "invalid_entity", "unknown entity", { entities: [...ENTITIES, ...CLIENT] });
  if (!Array.isArray(b.rows)) fail(400, "rows_required", "rows: a list of ≤ 50 old rows");
  if (b.rows.length > 50) fail(413, "too_many_rows", "≤ 50 rows per batch", { max: 50 });
  const aid = dry ? 0 : await audit(env, { ...adm.actor, action: "import.apply", target_type: "import_run", target_id: run.id, summary: `import ${entity}: ${b.rows.length} row(s)`, after: { entity, rows: b.rows.length, status: "running" }, ip_hash: adm.ipHash, req_id: adm.reqId });
  const I = { run, opts, dry, adm, ctx, CC: adm.CC, actor: adm.actor, by: adm.actor.actor_email || adm.actor.actor_id, publish: false };
  const fn = entity === "users" ? impUser : entity === "members" ? impCompany : entity === "messages" ? impMessage : entity === "settings" ? impSetting : entity === "plans" ? impPlans : entity === "pay" ? impPay : entity === "mail" ? impMail : (e2, i2, r2) => impContent(e2, i2, r2, entity);
  for (let i = 0; i < b.rows.length; i++) {
    let r;
    try { r = await fn(env, I, b.rows[i]); } catch (e) { r = { action: "error", code: (e && e.code) || "error", ...(e && e.message && e.status ? { warnings: [line(e.message, 200)] } : {}) }; if (!(e && e.status)) console.error("import row", entity, e && e.message); }
    counts[r.action] = (counts[r.action] || 0) + 1; results.push({ i, ...r });
  }
  if (!dry && I.publish && adm.CC && adm.CC.content && typeof adm.CC.content.publishOverlay === "function") { try { await adm.CC.content.publishOverlay(env, { by: I.by, reason: "import settings" }); } catch (e) { console.error("import publish", e && e.message); } }
  if (!dry && entity === "plans") await bootPlans(env, { force: true });
  await appendReport(env, run, { entity, dry_run: dry, counts, errors: results.filter(r => r.action === "error" || r.action === "conflict").slice(0, 50).map(r => ({ i: r.i, key: r.key, action: r.action, code: r.code || "" })) }, !dry);
  if (aid) await auditDone(env, aid, { after: { entity, rows: b.rows.length, counts } });
  return { body: { entity, dry_run: dry, results, counts } };
}
async function appendReport(env, run, entry, countIt) {
  const fresh = await first(env, "SELECT report_json, counts_json FROM cc_import_runs WHERE id = ?", run.id) || run;
  const report = jget(fresh.report_json, []); report.push({ at: now(), ...entry }); while (report.length > 500) report.shift();
  const counts = jget(fresh.counts_json, {});
  if (countIt) { const c = counts[entry.entity] || {}; for (const [k, v] of Object.entries(entry.counts)) c[k] = (c[k] || 0) + v; counts[entry.entity] = c; }
  await env.DB.prepare("UPDATE cc_import_runs SET report_json = ?, counts_json = ? WHERE id = ?").bind(JSON.stringify(report), JSON.stringify(counts), run.id).run();
}
export async function finishRun(req, env, ctx, adm, id) {
  await needTables(env, "cc_import_runs", "cc_audit");
  const run = await first(env, "SELECT * FROM cc_import_runs WHERE id = ?", id); if (!run) fail(404, "not_found", "run not found");
  if (run.status !== "open") fail(409, "state", "already finished", { status: run.status });
  const report = jget(run.report_json, []), applied = report.filter(r => !r.dry_run);
  const errs = applied.reduce((n, r) => n + (r.counts.error || 0), 0), ok = applied.reduce((n, r) => n + (r.counts.create || 0) + (r.counts.update || 0) + (r.counts.unchanged || 0) + (r.counts.skip || 0), 0);
  const status = !applied.length ? "dry" : errs && !ok ? "failed" : errs ? "partial" : "applied", t = now();
  await batch(env, [env.DB.prepare("UPDATE cc_import_runs SET status = ?, finished_at = ? WHERE id = ?").bind(status, t, run.id), adm.auditStmt("import.finish", "import_run", run.id, { status: "open" }, { status, counts: jget(run.counts_json, {}) }, `import run ${status}`)]);
  return { body: { run: runOut(await first(env, "SELECT * FROM cc_import_runs WHERE id = ?", run.id)) } };
}
export { jparse, str };
