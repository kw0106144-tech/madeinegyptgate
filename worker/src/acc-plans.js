/* Control Center — plans & prices (the single source of truth, ACC-CONTRACT §7), site settings (§3.1.10, §2.2), the Janna/Bassem persona
   sync (§7.5) and the public JSON (GET /api/plans, GET /api/settings, §3.1.16).
   applyPlans(): the matrix reaches the Worker by mutating the shared objects IN PLACE (common.js PLAN_SCOPE / PLAN_NAME, advisor.js
   PLAN_MARKETS / ELIGIBLE) and through common.js setPlanCaps() once the integrator added it (P-W2) — guarded, so acc works before. */
import * as C from "./common.js";
import * as ADV from "./advisor.js";
import { line, now, isEmail, canonPlan, PLAN_LV, effPlan, iso, sha256 } from "./common.js";
import { anamKey } from "./service-keys.js"; // ANAM_API_KEY, else the sealed slot anam.api_key (one rule for the whole Worker)
import { publicFeatures } from "./flags.js";   // «🛠️ المطوّر» feature switches: GET /api/settings → features (scope client | both, effective)
import { body, all, first, fail, needTables, batch, changed, jget, txt, txt1, isHttps, validator, auditStmt, actorOf } from "./acc-base.js";

export const MK = ["local", "gulf", "africa", "asia", "europe"];
const T0 = "2026-11-18T00:00:00.000Z";
/* the built-in matrix rows. They come from THIS code, not from D1 (plansData / applyPlans merge them with the non-built-in D1 rows), so a
   new built-in key needs no migration: gcc_pick and procurement (owner, 2026-11-18) exist only here. Their D1 copies (the 0006 seed) keep
   their values; labels, types and enforced_by are always the code's. */
export const DEFAULT_KEYS = [
  ["products", "number", "عدد المنتجات في السوق", "Products in the marketplace", "limits", "acc,site,janna", 10], ["images_per_product", "number", "صور لكل منتج", "Images per product", "limits", "acc,site", 20],
  ["m_local", "bool", "فرص وبيانات مصر", "Egypt opportunities & data", "markets", "worker,site,janna", 30], ["m_gulf", "bool", "أسواق دول الخليج (مجلس التعاون الست)", "Gulf markets (the 6 GCC states)", "markets", "worker,site,janna", 31],
  ["m_africa", "bool", "أسواق أفريقيا", "African markets", "markets", "worker,site,janna", 32], ["m_asia", "bool", "أسواق آسيا", "Asian markets", "markets", "worker,site,janna", 33],
  ["m_europe", "bool", "أسواق أوروبا", "European markets", "markets", "worker,site,janna", 34],
  ["gcc_pick", "number", "عدد دول الخليج اللي العضو بيختارها (0 = كل دول الخليج الست)", "Gulf states the member picks (0 = all six)", "markets", "worker,site,janna", 35],
  ["alerts", "bool", "تنبيهات وملخصات بالجديد", "Alerts & digests", "features", "worker,site", 40],
  ["listing", "bool", "ملف الشركة في الدليل وتعديله", "Directory listing & edits", "features", "acc,site", 41], ["respond", "bool", "الرد على المناقصات وطلبات الأسعار", "Respond to tenders & RFQs", "features", "site", 42],
  ["incoming", "bool", "استقبال طلبات المشترين المطابقة تلقائياً", "Receive matching buyer requests", "features", "worker,site,janna", 43], ["stats", "bool", "إحصائيات حقيقية للملف", "Real profile statistics", "features", "worker,site", 44],
  ["priority", "bool", "أولوية في توزيع الطلبات", "Priority in request routing", "features", "worker,janna", 45], ["featured", "bool", "أولوية في ترتيب القوائم والبحث", "Priority in listings & search", "features", "site", 46],
  ["bassem", "bool", "المستشار الذكي «باسم»", "AI advisor «Bassem»", "features", "worker,site,janna", 47], ["video", "bool", "فيديو في ملف الشركة", "Video on the company profile", "features", "acc,site", 48],
  ["social", "bool", "روابط السوشيال في ملف الشركة", "Social links on the company profile", "features", "acc,site", 49],
  ["procurement", "bool", "أخبار المشتريات", "Procurement news", "features", "worker,site", 50],
].map(([k, type, label_ar, label_en, grp, enforced_by, sort]) => ({ k, type, label_ar, label_en, grp, enforced_by, sort, builtin: 1, legacy_key: "" }));
const BUILTIN = new Set(DEFAULT_KEYS.map(k => k.k));
/* f = [alerts, listing, respond, incoming, stats, priority, featured, bassem, procurement] · g = gcc_pick */
const cap = (products, img, m, f, g = 0) => ({ products, images_per_product: img, m_local: m[0], m_gulf: m[1], m_africa: m[2], m_asia: m[3], m_europe: m[4], gcc_pick: g, alerts: f[0], listing: f[1], respond: f[2], incoming: f[3], stats: f[4], priority: f[5], featured: f[6], bassem: f[7], video: 0, social: 0, procurement: f[8] || 0 });
/* the code defaults = the owner's matrix of 2026-11-18 (DESIGN §1.1). The 0006 seed in D1 differs only in profile (m_local 1, alerts 1) and
   has no gcc_pick / procurement: D1 values win over these defaults, so production keeps its matrix until the Control Center PUT (§6). */
export const DEFAULT_PLANS = {
  visitor: { sort: 0, name_ar: "زائر", name_en: "Visitor", price_egp: 0, duration_days: 0, sellable: 0, caps: cap(0, 0, [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]) },
  profile: { sort: 1, name_ar: "تسجيل بيانات الشركة فقط", name_en: "Company data only", price_egp: 4000, duration_days: 365, sellable: 1, caps: cap(0, 0, [0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0, 0, 0]) },
  basic: { sort: 2, name_ar: "الباقة الأساسية", name_en: "Basic plan", price_egp: 10000, duration_days: 365, sellable: 1, caps: cap(30, 1, [1, 0, 0, 0, 0], [1, 1, 1, 1, 1, 0, 0, 0, 0]) },
  premium: { sort: 3, name_ar: "الباقة المميزة", name_en: "Premium plan", price_egp: 25000, duration_days: 365, sellable: 1, caps: cap(80, 1, [1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 0, 1], 3) },
  partner: { sort: 4, name_ar: "باقة الشريك الأساسي", name_en: "Core Partner plan", price_egp: 50000, duration_days: 365, sellable: 1, caps: cap(200, 1, [1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1]) },
  strategic: { sort: 5, name_ar: "باقة الشريك الاستراتيجي", name_en: "Strategic Partner plan", price_egp: 100000, duration_days: 365, sellable: 1, caps: cap(-1, 1, [1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1]) },
};
const PLAN_KEYS = Object.keys(DEFAULT_PLANS);
/* the built-in rows (code) ∪ the custom / legacy D1 rows; a D1 copy of a built-in row is ignored (its label/type are the code's) */
export function mergeKeys(rows) {
  const extra = (rows || []).filter(r => r && r.k && !BUILTIN.has(r.k));
  return [...DEFAULT_KEYS, ...extra].sort((a, b) => (+a.sort || 0) - (+b.sort || 0) || String(a.k).localeCompare(String(b.k)));
}
/* a plan's caps: the code default of every built-in key, then what D1 stores (D1 wins) */
const withDefaults = (plan, caps) => ({ ...((DEFAULT_PLANS[plan] && DEFAULT_PLANS[plan].caps) || {}), ...(caps || {}) });

/* ---------- capability answers (common.js planCan/planLimit after P-W2; the same rules here before it) ---------- */
let CUR = null; // {plan: caps} applied by applyPlans (null = the original hard-coded rules)
const CAP_DEFAULT = { alerts: 2, listing: 1, respond: 2, incoming: 2, stats: 2, priority: 3, featured: 3, procurement: 3, bassem: 4 };
const LIMIT_DEFAULT = { products: { profile: 0, basic: 30, premium: 80, partner: 200, strategic: -1 }, images_per_product: { basic: 1, premium: 1, partner: 1, strategic: 1 } };
export function planCanX(m, capName, nowIso) {
  if (typeof C.planCan === "function") return C.planCan(m, capName, nowIso);
  const p = effPlan(m, nowIso || undefined); if (p === "visitor") return false;
  const c = CUR && CUR[p]; if (c && capName in c) return !!c[capName];
  return capName in CAP_DEFAULT ? PLAN_LV[p] >= CAP_DEFAULT[capName] : false;
}
export function planLimitX(m, key, nowIso) {
  if (typeof C.planLimit === "function") return C.planLimit(m, key, nowIso);
  const p = effPlan(m, nowIso || undefined); if (p === "visitor") return 0;
  const c = CUR && CUR[p]; if (c && typeof c[key] === "number") return c[key];
  return (LIMIT_DEFAULT[key] && LIMIT_DEFAULT[key][p]) || 0;
}
export const plansWithX = capName => Object.keys(PLAN_LV).filter(p => p !== "visitor" && planCanX({ plan: p }, capName));
export const capsOf = plan => (CUR && CUR[plan]) || (DEFAULT_PLANS[plan] ? DEFAULT_PLANS[plan].caps : DEFAULT_PLANS.visitor.caps);

/* ---------- applying the matrix to the Worker (§7.3) ---------- */
const ORIG = {
  scopeRef: Object.fromEntries(Object.keys(C.PLAN_SCOPE).map(p => [p, C.PLAN_SCOPE[p]])), scope: Object.fromEntries(Object.keys(C.PLAN_SCOPE).map(p => [p, [...C.PLAN_SCOPE[p]]])),
  name: Object.fromEntries(Object.keys(C.PLAN_NAME).map(p => [p, C.PLAN_NAME[p]])),
  markets: ADV.PLAN_MARKETS ? Object.fromEntries(Object.keys(ADV.PLAN_MARKETS).map(p => [p, ADV.PLAN_MARKETS[p]])) : null,
  marketsCopy: ADV.PLAN_MARKETS ? Object.fromEntries(Object.keys(ADV.PLAN_MARKETS).map(p => [p, [...ADV.PLAN_MARKETS[p]]])) : null,
  eligible: Array.isArray(ADV.ELIGIBLE) ? [...ADV.ELIGIBLE] : null,
};
const SHARED = [C.MARKETS, ADV.MARKETS].filter(Array.isArray); // never mutate the module-wide "all markets" lists
const own = (obj, k) => { if (SHARED.includes(obj[k])) obj[k] = obj[k].slice(); return obj[k]; };
export function normCaps(raw, keys) {
  const out = {}, types = new Map((keys || DEFAULT_KEYS).map(k => [k.k, k.type]));
  for (const [k, v] of Object.entries(raw || {})) {
    const t = types.get(k) || (typeof v === "number" && v !== 0 && v !== 1 ? "number" : "bool");
    out[k] = t === "number" ? (Number.isFinite(+v) ? Math.trunc(+v) : 0) : v ? 1 : 0;
  }
  return out;
}
export function applyPlans(env, rows) {
  const caps = {};
  for (const r of rows || []) { if (canonPlan(r.plan) !== r.plan) continue; caps[r.plan] = withDefaults(r.plan, normCaps(r.caps || jget(r.caps_json, {}))); } // built-in keys missing in D1 → the code default
  if (!Object.keys(caps).length) return resetPlans();
  CUR = caps;
  if (typeof C.setPlanCaps === "function") C.setPlanCaps(caps);
  for (const p of Object.keys(C.PLAN_SCOPE)) {
    // a plan without any market is allowed (profile = the directory listing only, DESIGN §3.3); only the visitor always browses Egypt
    const mk = p === "visitor" ? ["local"] : caps[p] ? MK.filter(k => caps[p]["m_" + k]) : ORIG.scope[p];
    own(C.PLAN_SCOPE, p).splice(0, C.PLAN_SCOPE[p].length, ...mk);
  }
  for (const r of rows || []) if (C.PLAN_NAME[r.plan] && r.name_ar) C.PLAN_NAME[r.plan] = [String(r.name_ar), String(r.name_en || r.name_ar)];
  if (ADV.PLAN_MARKETS) {
    const eligible = PLAN_KEYS.filter(p => p !== "visitor" && caps[p] && caps[p].bassem);
    for (const k of Object.keys(ADV.PLAN_MARKETS)) if (!eligible.includes(k)) delete ADV.PLAN_MARKETS[k];
    for (const p of eligible) { const mk = MK.filter(k => caps[p]["m_" + k]); if (!ADV.PLAN_MARKETS[p]) ADV.PLAN_MARKETS[p] = []; own(ADV.PLAN_MARKETS, p).splice(0, ADV.PLAN_MARKETS[p].length, ...(mk.length ? mk : ["local"])); }
    if (Array.isArray(ADV.ELIGIBLE)) ADV.ELIGIBLE.splice(0, ADV.ELIGIBLE.length, ...eligible);
  }
}
export function resetPlans() {
  CUR = null;
  if (typeof C.setPlanCaps === "function") C.setPlanCaps(null);
  for (const p of Object.keys(ORIG.scopeRef)) { C.PLAN_SCOPE[p] = ORIG.scopeRef[p]; if (!SHARED.includes(ORIG.scopeRef[p])) ORIG.scopeRef[p].splice(0, ORIG.scopeRef[p].length, ...ORIG.scope[p]); }
  for (const p of Object.keys(ORIG.name)) C.PLAN_NAME[p] = ORIG.name[p];
  if (ADV.PLAN_MARKETS && ORIG.markets) {
    for (const k of Object.keys(ADV.PLAN_MARKETS)) if (!(k in ORIG.markets)) delete ADV.PLAN_MARKETS[k];
    for (const p of Object.keys(ORIG.markets)) { ADV.PLAN_MARKETS[p] = ORIG.markets[p]; if (!SHARED.includes(ORIG.markets[p])) ORIG.markets[p].splice(0, ORIG.markets[p].length, ...ORIG.marketsCopy[p]); }
    if (Array.isArray(ADV.ELIGIBLE) && ORIG.eligible) ADV.ELIGIBLE.splice(0, ADV.ELIGIBLE.length, ...ORIG.eligible);
  }
}
/* memo per env.DB, 60 s: ONE D1 read (cc_plans) per isolate per minute; switching databases (tests) re-applies from the memo */
const MEMO = new WeakMap();
let APPLIED = null;
export async function bootPlans(env, { force = false } = {}) {
  if (!env || !env.DB) return;
  let m = MEMO.get(env.DB);
  if (force || !m || Date.now() - m.at > 60000) {
    let rows = [];
    try { const r = await env.DB.prepare("SELECT * FROM cc_plans ORDER BY sort").all(); rows = (r && r.results) || []; } catch (e) { rows = []; }
    m = { at: Date.now(), rows }; MEMO.set(env.DB, m); APPLIED = null;
  }
  if (APPLIED !== m) { if (m.rows.length) applyPlans(env, m.rows); else resetPlans(); APPLIED = m; }
}
export const forgetPlans = env => { if (env && env.DB) MEMO.delete(env.DB); APPLIED = null; };

/* ---------- reading the matrix ---------- */
export async function setting(env, k, d = "") { const r = await first(env, "SELECT v FROM cc_settings WHERE k = ?", k); return r ? String(r.v) : d; }
export async function plansData(env) {
  const keyRows = await all(env, "SELECT * FROM cc_plan_keys ORDER BY sort, k");
  const keys = mergeKeys(keyRows); // built-in rows from the code (labels, types, the new gcc_pick / procurement) + the custom / legacy D1 rows
  const rows = await all(env, "SELECT * FROM cc_plans ORDER BY sort");
  const plans = {};
  for (const p of PLAN_KEYS) { const r = rows.find(x => x.plan === p), d = DEFAULT_PLANS[p];
    plans[p] = r ? { sort: r.sort, name_ar: r.name_ar, name_en: r.name_en, price_egp: r.price_egp, duration_days: r.duration_days, sellable: r.sellable ? 1 : 0, caps: withDefaults(p, normCaps(jget(r.caps_json, {}), keys)), updated_at: r.updated_at, updated_by: r.updated_by } : { ...d, caps: { ...d.caps }, updated_at: T0, updated_by: "" }; }
  const vat = parseInt(await setting(env, "vat_bp", "1400"), 10);
  const updated_at = Object.values(plans).map(p => p.updated_at || "").sort().pop() || T0;
  const pv = await first(env, "SELECT MAX(v) AS v FROM cc_overlay");
  return { keys: keys.map(k => ({ k: k.k, type: k.type, label_ar: k.label_ar, label_en: k.label_en, grp: k.grp, enforced_by: k.enforced_by, sort: k.sort, builtin: k.builtin ? 1 : 0, ...(k.legacy_key ? { legacy_key: k.legacy_key } : {}) })),
    plans, vat_bp: Number.isFinite(vat) ? vat : 1400, currency: "EGP", updated_at, published_v: pv && pv.v != null ? Number(pv.v) : null };
}
export const marketsOf = c => MK.filter(k => c && c["m_" + k]);
/* the GCC states a plan's member picks (1..5, with the Gulf market), else 0 = all six / no Gulf market — the rule of common.js gccPick */
export const pickOf = c => { const v = c ? Number(c.gcc_pick) : 0; return c && c.m_gulf && Number.isInteger(v) && v > 0 && v < 6 ? v : 0; };
export async function getPlans(env) {
  const d = await plansData(env);
  const last = await all(env, "SELECT p.* FROM cc_persona_sync p JOIN (SELECT persona_id, MAX(id) AS id FROM cc_persona_sync GROUP BY persona_id) x ON x.id = p.id");
  const items = jget(await setting(env, LAST_ITEMS, "{}"), {}) || {}; // the last run's changes / review per persona (personaSync)
  return { ...d, plans: Object.fromEntries(Object.entries(d.plans).map(([k, v]) => [k, { sort: v.sort, name_ar: v.name_ar, name_en: v.name_en, price_egp: v.price_egp, duration_days: v.duration_days, sellable: v.sellable, caps: v.caps }])),
    persona: { auto: (await setting(env, "persona.auto_sync", "1")) === "1", last: PERSONAS.map(p => { const r = last.find(x => x.persona_id === p.id), x = r && items[p.id] && items[p.id].at === r.at ? items[p.id] : null;
      return { persona_id: p.id, name: p.name, at: r ? r.at : "", status: r ? r.status : "", error: r ? r.error : "", reason: x ? x.reason || "" : reasonOf(r && r.error), changes: x && Array.isArray(x.changes) ? x.changes : [], review: x && Array.isArray(x.review) ? x.review : [] }; }) } };
}

/* ---------- PUT /plans (plans.write) ---------- */
export async function putPlans(req, env, ctx, adm) { return savePlans(env, ctx, adm, await body(req)); }
/* validation + write shared by PUT /plans and the old-system import (dry: validate and return the diff only) */
export async function savePlans(env, ctx, adm, b, { dry = false, reason = "plans" } = {}) {
  await needTables(env, "cc_plans", "cc_plan_keys", "cc_settings", "cc_audit");
  const cur = await plansData(env), v = validator(), keyMap = new Map(cur.keys.map(k => [k.k, k])), newKeys = [];
  if (b.keys != null) {
    if (!Array.isArray(b.keys) || b.keys.length > 50) v.err("keys", "keys must be a list (≤ 50)");
    else b.keys.forEach((k, i) => {
      const kk = line(k && k.k, 40);
      if (!/^[a-z][a-z0-9_]{1,30}$/.test(kk)) return v.err(`keys[${i}].k`, "المفتاح حروف إنجليزي صغيرة وأرقام و _ / key: a-z, 0-9, _");
      const ex = keyMap.get(kk); if (ex && ex.builtin) return v.err(`keys[${i}].k`, "ده صف أساسي مايتعدلش من هنا / built-in row");
      const type = line(k.type, 10), grp = line(k.grp || "features", 20), la = txt1(k.label_ar, 80), le = txt1(k.label_en, 80) || la;
      if (!["number", "bool"].includes(type)) return v.err(`keys[${i}].type`, "number or bool");
      if (!["limits", "markets", "features", "legacy"].includes(grp)) return v.err(`keys[${i}].grp`, "limits, markets, features or legacy");
      if (!la) return v.err(`keys[${i}].label_ar`, "الاسم بالعربي مطلوب / Arabic label required");
      const row = { k: kk, type, label_ar: la, label_en: le, grp, enforced_by: ex ? ex.enforced_by : "none", sort: ex ? ex.sort : 200 + i, builtin: 0 };
      newKeys.push(row); keyMap.set(kk, row);
    });
  }
  const next = JSON.parse(JSON.stringify(cur.plans)), plansIn = b.plans && typeof b.plans === "object" && !Array.isArray(b.plans) ? b.plans : {};
  for (const [p, x] of Object.entries(plansIn)) {
    if (!next[p]) { v.err(`plans.${p}`, "باقة غير معروفة / unknown plan"); continue; }
    if (!x || typeof x !== "object") { v.err(`plans.${p}`, "object expected"); continue; }
    if (p === "visitor") { if (Object.keys(x).length) v.err("plans.visitor", "باقة الزائر ثابتة / the visitor plan cannot be changed"); continue; }
    const t = next[p];
    // «:», «—» and parentheses would break the price lines the persona sync writes into Janna's and Bassem's prompts (review R-1)
    const NAME_BAD = "اسم الباقة مايكونش فيه «:» ولا «—» ولا أقواس — بيلخبط سطر الأسعار في برومبت جنة وباسم / a plan name cannot contain «:», «—» or parentheses (they break the price lines of the Janna & Bassem prompts)";
    if ("name_ar" in x) { const s = txt1(x.name_ar, 80); if (!s) v.err(`plans.${p}.name_ar`, "الاسم مطلوب / name required"); else if (PLAN_NAME_BAD.test(s)) v.err(`plans.${p}.name_ar`, NAME_BAD, "name_chars"); else t.name_ar = s; }
    if ("name_en" in x) { const s = txt1(x.name_en, 80); if (!s) v.err(`plans.${p}.name_en`, "name required"); else if (PLAN_NAME_BAD.test(s)) v.err(`plans.${p}.name_en`, NAME_BAD, "name_chars"); else t.name_en = s; }
    if ("price_egp" in x) { const n = Number(x.price_egp); if (!Number.isInteger(n) || n < 0 || n > 10000000) v.err(`plans.${p}.price_egp`, "السعر رقم صحيح من 0 لـ 10,000,000 / integer 0–10,000,000"); else t.price_egp = n; }
    if ("duration_days" in x) { const n = Number(x.duration_days); if (!Number.isInteger(n) || n < 30 || n > 1095) v.err(`plans.${p}.duration_days`, "المدة من 30 لـ 1095 يوم / 30–1095 days"); else t.duration_days = n; }
    if ("sellable" in x) { if (![0, 1, true, false].includes(x.sellable)) v.err(`plans.${p}.sellable`, "0 or 1"); else t.sellable = x.sellable ? 1 : 0; }
    if ("caps" in x) {
      if (!x.caps || typeof x.caps !== "object" || Array.isArray(x.caps)) { v.err(`plans.${p}.caps`, "object expected"); continue; }
      for (const [k, val] of Object.entries(x.caps)) {
        const key = keyMap.get(k); if (!key) { v.err(`plans.${p}.caps.${k}`, "صف مش موجود في المصفوفة / unknown matrix row"); continue; }
        if (key.type === "number") { const n = Number(val); if (!Number.isInteger(n) || n < -1 || n > 100000) v.err(`plans.${p}.caps.${k}`, "رقم من -1 لـ 100,000 / integer −1–100,000"); else t.caps[k] = n; }
        else { if (![0, 1, true, false].includes(val)) v.err(`plans.${p}.caps.${k}`, "0 or 1"); else t.caps[k] = val ? 1 : 0; }
      }
    }
  }
  for (const [p, t] of Object.entries(next)) {
    if (p === "visitor") continue;
    // the profile plan opens no market: a sellable plan needs a market OR the directory listing (DESIGN §3.3)
    if (t.sellable && !MK.some(k => t.caps["m_" + k]) && !t.caps.listing) v.err(`plans.${p}.caps`, "كل باقة متاحة للبيع لازم يكون ليها سوق واحد على الأقل أو ملف في الدليل / a sellable plan needs a market or the directory listing");
    const g = t.caps.gcc_pick;
    if (g !== undefined && (!Number.isInteger(g) || g < 0 || g > 5)) v.err(`plans.${p}.caps.gcc_pick`, "عدد دول الخليج من 0 لـ 5 (0 = كل دول الخليج الست) / 0–5 Gulf states (0 = all six)");
    else if (g > 0 && !t.caps.m_gulf) v.err(`plans.${p}.caps.gcc_pick`, "اختيار دول الخليج محتاج «أسواق دول الخليج» في نفس الباقة / picking Gulf states needs the Gulf market in the same plan");
  }
  let vat = cur.vat_bp;
  if ("vat_bp" in b) { const n = Number(b.vat_bp); if (!Number.isInteger(n) || n < 0 || n > 5000) v.err("vat_bp", "الضريبة من 0 لـ 5000 نقطة أساس (14% = 1400) / 0–5000 basis points"); else vat = n; }
  v.done();
  const before = {}, after = {}, t = now(), by = adm.actor.actor_email || adm.actor.actor_id, stmts = [];
  for (const p of PLAN_KEYS) {
    const a = cur.plans[p], n = next[p], strip = x => ({ name_ar: x.name_ar, name_en: x.name_en, price_egp: x.price_egp, duration_days: x.duration_days, sellable: x.sellable, caps: x.caps });
    const d = changed(strip(a), strip(n)); if (!d.keys.length) continue;
    before[p] = d.before; after[p] = d.after;
    stmts.push(env.DB.prepare("INSERT INTO cc_plans (plan, sort, name_ar, name_en, price_egp, duration_days, sellable, caps_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(plan) DO UPDATE SET name_ar = excluded.name_ar, name_en = excluded.name_en, price_egp = excluded.price_egp, duration_days = excluded.duration_days, sellable = excluded.sellable, caps_json = excluded.caps_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(p, n.sort, n.name_ar, n.name_en, n.price_egp, n.duration_days, n.sellable, JSON.stringify(n.caps), by, t));
  }
  for (const k of newKeys) {
    stmts.push(env.DB.prepare("INSERT INTO cc_plan_keys (k, type, label_ar, label_en, grp, enforced_by, sort, builtin) VALUES (?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(k) DO UPDATE SET type = excluded.type, label_ar = excluded.label_ar, label_en = excluded.label_en, grp = excluded.grp WHERE cc_plan_keys.builtin = 0")
      .bind(k.k, k.type, k.label_ar, k.label_en, k.grp, k.enforced_by, k.sort));
    (after.keys = after.keys || []).push(k.k);
  }
  if (vat !== cur.vat_bp) { before.vat_bp = cur.vat_bp; after.vat_bp = vat; stmts.push(env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES ('vat_bp', 'public', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(String(vat), by, t)); }
  // what the hand-written persona texts would no longer describe (markets / features / plan set / names) — predicted without calling Anam
  const review = reviewOf({ vat_bp: vat, plans: PLAN_KEYS.filter(p => p !== "visitor" && next[p].sellable).map(p => ({ key: p, ...next[p] })) });
  if (dry) return { body: { ok: true, dry: true, before, after, changed: stmts.length > 0, persona: { review } } };
  if (!stmts.length) { const d = await plansData(env); return { body: { ok: true, unchanged: true, updated_at: d.updated_at, published_v: d.published_v, persona: { queued: false, review } } }; }
  stmts.push(adm.auditStmt("plans.save", "plans", "matrix", before, after, `${reason === "import" ? "plans imported" : "plans"}: ${Object.keys(after).join(", ")}`));
  await batch(env, stmts);
  forgetPlans(env); await bootPlans(env, { force: true });
  let published_v = null;
  try { if (adm.CC && adm.CC.content && typeof adm.CC.content.publishOverlay === "function") published_v = (await adm.CC.content.publishOverlay(env, { by, reason: "plans", CC: adm.CC })).v; } catch (e) { console.error("overlay publish after plans", e && e.message); }
  let queued = false;
  if ((await setting(env, "persona.auto_sync", "1")) === "1") { queued = true; const job = personaSync(env, { dry_run: false, by: adm.actor, CC: adm.CC }).catch(e => console.error("persona sync", e && e.message)); if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); }
  const warnings = await gccWarnings(env, cur.plans, next, t);
  return { body: { ok: true, updated_at: t, published_v, persona: { queued, review }, ...(warnings.length ? { warnings } : {}) } };
}
/* a changed gcc_pick (e.g. 3 → 2): the members of that plan whose stored choice no longer has exactly `pick` states are «pending» again —
   all six GCC states for now + the prompt to choose (DESIGN §2.9); the save answer says how many */
async function gccWarnings(env, a, n, nowIso) {
  const out = [];
  for (const p of PLAN_KEYS) {
    const from = +(a[p] && a[p].caps.gcc_pick) || 0, to = +(n[p] && n[p].caps.gcc_pick) || 0;
    if (p === "visitor" || from === to) continue;
    const rows = to > 0 ? await all(env, "SELECT prefs_json, plan_expires FROM members WHERE plan = ? LIMIT 5000", p) : [];
    const pending = rows.filter(r => !(r.plan_expires && r.plan_expires < nowIso) && C.normGcc((jget(r.prefs_json, {}) || {}).gcc).length !== to).length;
    out.push({ code: "gcc_pick", plan: p, from, to, members_pending: pending,
      msg_ar: to > 0 ? `«${n[p].name_ar}»: العضو بيختار ${to} من دول الخليج — ${pending} عضو هيبقوا «لسه مااختاروش» (مؤقتاً كل دول الخليج) لحد ما يختاروا.` : `«${n[p].name_ar}»: الباقة بقت بتغطي كل دول الخليج الست.`,
      msg_en: to > 0 ? `«${n[p].name_en}»: members pick ${to} Gulf states — ${pending} member(s) become «not chosen yet» (all Gulf states for now) until they choose.` : `«${n[p].name_en}»: the plan now covers all 6 Gulf states.` });
  }
  return out;
}

/* ---------- public GET /api/plans ---------- */
export async function publicPlans(env) {
  const d = await plansData(env);
  const plans = PLAN_KEYS.filter(p => p !== "visitor" && d.plans[p].sellable).map(p => { const x = d.plans[p];
    return { key: p, sort: x.sort, name_ar: x.name_ar, name_en: x.name_en, price_egp: x.price_egp, duration_days: x.duration_days, sellable: 1, markets: marketsOf(x.caps), products: x.caps.products ?? 0, images_per_product: x.caps.images_per_product ?? 0,
      gcc_pick: pickOf(x.caps), caps: x.caps }; });
  return { v: d.updated_at, currency: "EGP", vat_bp: d.vat_bp, plans };
}

/* ---------- settings (§3.1.10) ---------- */
export const PUBLIC_KEYS = { contact_email: "email", support_email: "email", hotline_display: "text", hotline_tel: "tel", whatsapp_display: "text", whatsapp_number: "tel", address_ar: "text", address_en: "text",
  social_facebook: "social", social_x: "social", social_instagram: "social", social_linkedin: "social", social_youtube: "social", operator_ar: "text", operator_en: "text", operator_reg_ar: "text", operator_reg_en: "text",
  operator_url: "https", tax_no: "text", cr_no: "text", vat_bp: "vat", billing_email: "email", manual_pay_ar: "multi", manual_pay_en: "multi" };
export const SETTING_GROUPS = [
  { id: "contact", keys: ["contact_email", "support_email", "hotline_display", "hotline_tel", "whatsapp_display", "whatsapp_number", "address_ar", "address_en"] },
  { id: "social", keys: ["social_facebook", "social_x", "social_instagram", "social_linkedin", "social_youtube"] },
  { id: "operator", keys: ["operator_ar", "operator_en", "operator_reg_ar", "operator_reg_en", "operator_url", "tax_no", "cr_no", "vat_bp", "billing_email"] },
  { id: "manual_pay", keys: ["manual_pay_ar", "manual_pay_en"] },
];
const SEED_PUBLIC = { contact_email: "info@madeinegyptgate.com", support_email: "support@madeinegyptgate.com", hotline_display: "02 38346757", hotline_tel: "+20238346757", whatsapp_display: "01279188996", whatsapp_number: "201279188996",
  address_ar: "عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة", address_en: "Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt", social_facebook: "https://www.facebook.com/profile.php?id=61595683961104",
  social_x: "https://x.com/egy_business_eg", social_instagram: "https://www.instagram.com/mnstmsrllmnaqsat/", social_linkedin: "https://www.linkedin.com/in/%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%B5%D8%B1-%D9%84%D9%84%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%88%D8%B1%D8%AF%D9%8A%D9%86-egyptbusinessgate-8a6346450/",
  social_youtube: "https://www.youtube.com/@egyptbusinessgate", operator_ar: "الجمعية المصرية للتنمية الصناعية", operator_en: "", operator_reg_ar: "جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي)", operator_reg_en: "",
  operator_url: "https://eafid.org/", tax_no: "", cr_no: "", vat_bp: "1400", billing_email: "", manual_pay_ar: "", manual_pay_en: "" };
export function checkSetting(k, raw, v) {
  const type = PUBLIC_KEYS[k], s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : null;
  if (s === null) { v.err(k, "قيمة نصية مطلوبة / a text value is required"); return undefined; }
  const t = s.trim();
  if (type === "email") { if (t && !isEmail(t.toLowerCase())) v.err(k, "إيميل غير صحيح / invalid e-mail"); return t.toLowerCase(); }
  if (type === "tel") { const d = t.replace(/[\s-]/g, ""); if (d && !/^\+?\d{6,15}$/.test(d)) v.err(k, "أرقام بس مع + اختيارية / digits with an optional +"); return d; }
  if (type === "social") { if (t && t !== "-" && !isHttps(t)) v.err(k, "رابط https أو - للإخفاء / an https link, or - to hide it"); return t; }
  if (type === "https") { if (t && !isHttps(t)) v.err(k, "رابط https / an https link"); return t; }
  if (type === "vat") { const n = Number(t); if (!Number.isInteger(n) || n < 0 || n > 5000) v.err(k, "0–5000 basis points (14% = 1400)"); return String(n); }
  if (type === "multi") { const x = txt(t, 1001); if (x.length > 1000) v.err(k, "≤ 1000"); return x; }
  const x = txt1(t, 501); if (x.length > 500) v.err(k, "≤ 500"); return x;
}
export async function publicSettings(env) {
  const rows = await all(env, "SELECT k, v, updated_at FROM cc_settings WHERE scope = 'public'");
  const settings = { ...SEED_PUBLIC };
  let v = T0;
  for (const r of rows) if (r.k in PUBLIC_KEYS) { settings[r.k] = String(r.v); if (r.updated_at > v) v = r.updated_at; }
  // the site hides the UI of a switched-off feature (scope client | both only; the server rows and every lock / key state stay private)
  let f = { features: null, features_v: "" }; try { f = await publicFeatures(env); } catch (e) { f = { features: null, features_v: "" }; }
  return { v, settings, ...(f.features ? { features: f.features, features_v: f.features_v } : {}) };
}
export async function getSettings(env) {
  const pub = await publicSettings(env);
  const custom = (await all(env, "SELECT k, v, updated_at, updated_by FROM cc_settings WHERE scope = 'custom' ORDER BY k"));
  return { public: pub.settings, custom, groups: SETTING_GROUPS, v: pub.v };
}
/* reserved prefixes: never a "custom" setting (wa.* / respondio.* / anam.* / keys.* = «مفاتيح الخدمات», owner-only through /keys;
   the key "features" and dev.* / cloudflare.* = «🛠️ المطوّر», owner-only through /dev; meetings.* = «📞 اجتماعات باسم» (the daily cap,
   owner-only through /meetings/cap) — an admin must not pre-create them as custom rows) */
const RESERVED = /^(pay|mail|overlay|persona|system|acc|wa|respondio|anam|keys|dev|cloudflare|meetings)\.|^features$/;
/* the bank-transfer / InstaPay instructions tell customers where to send money (/pay/, every invoice e-mail, the public overlay): they are
   «entered by the owner» (ACC-CONTRACT §5) — pay.config, the permission of «بوابة الدفع» — never by settings.write alone (review F1) */
export const PAYEE_KEYS = ["manual_pay_ar", "manual_pay_en"];
export async function putSettings(req, env, ctx, adm) {
  const b = await body(req);
  await needTables(env, "cc_settings", "cc_audit");
  const v = validator(), cur = await getSettings(env), pubSet = {}, customSet = {}, del = [];
  if (b.public != null) {
    if (typeof b.public !== "object" || Array.isArray(b.public)) v.err("public", "object expected");
    else for (const [k, raw] of Object.entries(b.public)) { if (!(k in PUBLIC_KEYS)) { v.err(k, "مفتاح غير معروف / unknown key"); continue; } const val = checkSetting(k, raw, v); if (val !== undefined) pubSet[k] = val; }
  }
  if (PAYEE_KEYS.some(k => k in pubSet) && !(adm && typeof adm.can === "function" && adm.can("pay.config")))
    fail(403, "owner_only", "تعليمات التحويل اليدوي (البنك / إنستاباي) بيكتبها المالك بس من «بوابة الدفع» / only the owner sets the transfer instructions, in «بوابة الدفع»", { need: "pay.config", section: "payments" });
  const customKeys = new Set(cur.custom.map(r => r.k));
  const scopeOf = new Map((await all(env, "SELECT k, scope FROM cc_settings")).map(r => [r.k, r.scope]));
  if (b.custom != null) {
    if (!Array.isArray(b.custom) || b.custom.length > 200) v.err("custom", "a list of {k, v} (≤ 200)");
    else b.custom.forEach((x, i) => {
      const k = line(x && x.k, 64);
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(k)) return v.err(`custom[${i}].k`, "المفتاح حروف إنجليزي وأرقام و _ . - / key: A-Z a-z 0-9 _ . -");
      if (k in PUBLIC_KEYS || RESERVED.test(k) || (scopeOf.has(k) && scopeOf.get(k) !== "custom")) return v.err(`custom[${i}].k`, "المفتاح ده محجوز / reserved key");
      const val = txt(scalar0(x.v), 2001); if (val.length > 2000) return v.err(`custom[${i}].v`, "≤ 2000");
      customSet[k] = val;
    });
  }
  if (b.delete != null) {
    if (!Array.isArray(b.delete)) v.err("delete", "a list of keys");
    else for (const k0 of b.delete) { const k = line(k0, 64); if (!customKeys.has(k)) v.err(k || "delete", "بس الإعدادات الإضافية تتمسح / only custom keys can be deleted"); else del.push(k); }
  }
  v.done();
  const t = now(), by = adm.actor.actor_email || adm.actor.actor_id, stmts = [], before = {}, after = {};
  for (const [k, val] of Object.entries(pubSet)) if (String(cur.public[k]) !== val) { before[k] = cur.public[k]; after[k] = val;
    stmts.push(env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'public', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(k, val, by, t)); }
  const curCustom = new Map(cur.custom.map(r => [r.k, r.v]));
  for (const [k, val] of Object.entries(customSet)) if (curCustom.get(k) !== val) { before[k] = curCustom.has(k) ? curCustom.get(k) : null; after[k] = val;
    stmts.push(env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'custom', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at WHERE cc_settings.scope = 'custom'").bind(k, val, by, t)); }
  for (const k of del) { before[k] = curCustom.get(k); after[k] = null; stmts.push(env.DB.prepare("DELETE FROM cc_settings WHERE k = ? AND scope = 'custom'").bind(k)); }
  if (!stmts.length) return { body: { ok: true, unchanged: true, published_v: null } };
  stmts.push(adm.auditStmt("settings.save", "settings", Object.keys(after).length === 1 ? Object.keys(after)[0] : "settings", before, after, `settings: ${Object.keys(after).join(", ")}`));
  await batch(env, stmts);
  if (PAYEE_KEYS.some(k => k in after) && adm.CC && adm.CC.payments && typeof adm.CC.payments.payeeNotice === "function") await adm.CC.payments.payeeNotice(env, by, before, after, "settings");
  let published_v = null;
  if (Object.keys(pubSet).some(k => k in after)) { try { if (adm.CC && adm.CC.content && typeof adm.CC.content.publishOverlay === "function") published_v = (await adm.CC.content.publishOverlay(env, { by, reason: "settings", CC: adm.CC })).v; } catch (e) { console.error("overlay publish after settings", e && e.message); } }
  return { body: { ok: true, published_v } };
}
const scalar0 = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

/* ---------- Janna & Bassem persona sync (§7.5; DESIGN 2026-11-19 §4) ----------
   The persona texts are written by people. Inside ONE anchored price block per persona the sync swaps only the TOKENS that come from this
   matrix: the VAT %, each plan's price words, each plan's product count (where its line states one), a plan's spoken name (only after a
   rename here) and the payment-gateway sentence. Market and feature switches are never written: a difference between the matrix and the
   facts the texts describe (PROMPT_FACTS) is reported as «review». Anything the sync cannot place → {found:false, reason}, nothing written.
   GET → prompt + updatedAt; PUT {systemPrompt, expectedUpdatedAt} (409 = edited meanwhile → failed, retried by the hourly cron). */
export const PERSONAS = [{ id: "5f06d835-22cc-4460-b412-84cefa9e565b", name: "Janna AR", kind: "janna_ar" }, { id: "e5101653-65b4-44a6-85e5-ec2e78f82685", name: "Janna EN", kind: "janna_en" }, { id: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be", name: "Bassem", kind: "bassem" }];
const ANAM = "https://api.anam.ai/v1/personas/";
/* Egyptian Arabic words for speech (multiples of 1,000 up to 1,000,000), digits otherwise */
const U = ["", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة", "عشرة"], TEEN = { 11: "حداشر", 12: "اتناشر", 13: "تلاتاشر", 14: "أربعتاشر", 15: "خمستاشر", 16: "ستاشر", 17: "سبعتاشر", 18: "تمنتاشر", 19: "تسعتاشر" };
const TENS = { 2: "عشرين", 3: "تلاتين", 4: "أربعين", 5: "خمسين", 6: "ستين", 7: "سبعين", 8: "تمانين", 9: "تسعين" }, HUN = ["", "مية", "ميتين", "تلتمية", "ربعمية", "خمسمية", "ستمية", "سبعمية", "تمنمية", "تسعمية"];
const ar99 = r => (r <= 10 ? U[r] : r < 20 ? TEEN[r] : r % 10 ? `${U[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[r / 10]);
const digits = n => Number(n).toLocaleString("en-US");
export function arWords(n) {
  n = Number(n); if (!Number.isInteger(n) || n <= 0 || n % 1000 || n > 1000000) return digits(n);
  const k = n / 1000; if (k === 1000) return "مليون";
  const h = Math.floor(k / 100), r = k % 100;
  const rest = r === 0 ? "" : r === 1 ? "ألف" : r === 2 ? "ألفين" : r <= 10 ? `${U[r]} آلاف` : `${ar99(r)} ألف`;
  if (!h) return rest;
  if (!r) return `${HUN[h]} ألف`;
  return `${HUN[h]} و${r === 1 ? "واحد ألف" : r === 2 ? "اتنين ألف" : rest}`;
}
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"], TY = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const en999 = k => { const h = Math.floor(k / 100), r = k % 100, rw = r < 20 ? ONES[r] : TY[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : ""); return [h ? ONES[h] + " hundred" : "", rw].filter(Boolean).join(" "); };
export function enWords(n) { n = Number(n); if (!Number.isInteger(n) || n <= 0 || n % 1000 || n > 1000000) return digits(n); const k = n / 1000; return k === 1000 ? "one million" : `${en999(k)} thousand`; }
const pct = bp => { const v = Number(bp) / 100; return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); };
const shortAr = s => String(s || "").replace(/^(ال)?باقة\s+/, "").replace(/^تسجيل\s+/, "").trim();
const shortEn = s => String(s || "").replace(/\s+plan$/i, "").trim();
export const PAY_AR = ["بوابة الدفع لسه بتتجهّز: بعد طلب التسجيل، أول ما تشتغل، لينك الدفع بيوصل تلقائي على إيميل الشركة، والحساب بيتفعّل بعد الدفع.", "الدفع أونلاين من صفحة الدفع الآمنة بعد طلب التسجيل — رابط الدفع بيوصلك على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع."];
export const PAY_EN = ["The gateway is still being set up: after the registration request, once it is live the secure payment link is e-mailed to the company automatically and the account is activated after payment.", "Payment is online, on the secure payment page, after you send the registration — the link reaches the company e-mail and the account is activated automatically after payment."];
const AR_LETTERS = "ء-ي٠-٩";
/* the spoken label each persona uses today for an UNRENAMED plan (the live prompts of 2026-11-18T23:4x) */
export const SPOKEN = {
  ar: { profile: "باقة بيانات الشركة", basic: "الأساسية", premium: "المميزة", partner: "الشريك الأساسي", strategic: "الشريك الاستراتيجي" },
  en: { profile: "Company data", basic: "Basic", premium: "Premium", partner: "Core Partner", strategic: "Strategic Partner" },
};
/* the facts the hand-written plan descriptions describe = the matrix after the Control Center PUT of DESIGN §6 (profile m_local 0 ·
   gcc_pick · procurement). A change of any of these is NOT written into the prompts — it is reported as «needs review». Update this
   constant whenever someone edits the persona texts by hand. */
export const PROMPT_FACTS = {
  v: "2026-11-19 matrix PUT (profile m_local 0 · gcc_pick · procurement)",
  caps: {
    profile: { m_local: 0, m_gulf: 0, m_africa: 0, m_asia: 0, m_europe: 0, gcc_pick: 0, alerts: 0, listing: 1, respond: 0, incoming: 0, stats: 0, priority: 0, featured: 0, bassem: 0, procurement: 0 },
    basic: { m_local: 1, m_gulf: 0, m_africa: 0, m_asia: 0, m_europe: 0, gcc_pick: 0, alerts: 1, listing: 1, respond: 1, incoming: 1, stats: 1, priority: 0, featured: 0, bassem: 0, procurement: 0 },
    premium: { m_local: 1, m_gulf: 1, m_africa: 0, m_asia: 0, m_europe: 0, gcc_pick: 3, alerts: 1, listing: 1, respond: 1, incoming: 1, stats: 1, priority: 1, featured: 1, bassem: 0, procurement: 1 },
    partner: { m_local: 1, m_gulf: 1, m_africa: 1, m_asia: 0, m_europe: 0, gcc_pick: 0, alerts: 1, listing: 1, respond: 1, incoming: 1, stats: 1, priority: 1, featured: 1, bassem: 1, procurement: 1 },
    strategic: { m_local: 1, m_gulf: 1, m_africa: 1, m_asia: 1, m_europe: 1, gcc_pick: 0, alerts: 1, listing: 1, respond: 1, incoming: 1, stats: 1, priority: 1, featured: 1, bassem: 1, procurement: 1 },
  },
};
/* per persona: the section line, the price-block header (group 1 = VAT %), the plan line (1 lead, 2 label, 3 price, 4 the rest), the language */
export const SPECS = {
  janna_ar: { lang: "ar", section: /^# حقائق الباقات والدفع\s*$/, header: /^- الأسعار سنوية بالجنيه \+ ضريبة (\d+(?:\.\d+)?)%، ومفيش تسجيل مجاني:\s*$/, line: /^( {2}- )([^:\n]{2,80}?): ([^—\n]{2,40}?) — (.+)$/, pay: PAY_AR },
  janna_en: { lang: "en", section: /^# PLANS & PAYMENT\s*$/, header: /^Annual fees in Egyptian pounds plus (\d+(?:\.\d+)?)% VAT; no free registration:\s*$/, line: /^(- )([^:\n]{2,80}?): ([^—\n]{2,40}?) — (.+)$/, pay: PAY_EN },
  bassem: { lang: "ar", section: /^# حقائق\s*$/, header: /^- الباقات \(سنوية بالجنيه \+ ضريبة (\d+(?:\.\d+)?)%\):\s*$/, line: /^( {2}- )([^:\n]{2,80}?): ([^—\n]{2,40}?) — (.+)$/, pay: PAY_AR },
};
const PRICE_OK = { ar: new RegExp(`^[${AR_LETTERS}\\d, ]{2,40}$`), en: /^[a-z\d, -]{2,40}$/i };
/* product tokens: «30 منتج» / «منتجات بلا حد» · "30 products" / "unlimited products" */
const PROD = {
  ar: { num: new RegExp(`(^|[^\\d,])(\\d[\\d,]*) منتج(?![${AR_LETTERS}])`), unl: "منتجات بلا حد", fmt: n => `${n} منتج` },
  en: { num: /(^|[^\d,])(\d[\d,]*) products\b/, unl: "unlimited products", fmt: n => `${n} products` },
};
/* a name as the price line can hold it: «:» ends the label, «—» ends the price, a parenthesis starts the qualifier (« (للمصانع المتوسطة)»)
   — savePlans refuses them in new names (PLAN_NAME_BAD); a stored legacy name is cleaned here so the written line always parses again */
export const PLAN_NAME_BAD = /[:\u2014()\r\n]/;
const sayable = s => String(s || "").replace(/[:\u2014\r\n]+/g, " ").replace(/[()]/g, "").replace(/\s{2,}/g, " ").trim();
const spoken = (lang, key, p) => {
  const d = DEFAULT_PLANS[key], nm = lang === "en" ? p.name_en : p.name_ar, d0 = d ? (lang === "en" ? d.name_en : d.name_ar) : "";
  const own = sayable(lang === "en" ? shortEn(nm) : shortAr(nm)), def = SPOKEN[lang][key] || own;
  return !nm || nm === d0 || own.length < 2 ? def : own;
};
const words = (lang, n) => (lang === "en" ? enWords(n) : arWords(n));
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const uniq = a => { const seen = new Set(); return a.filter(x => { const k = JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
/* the facts of one plan the texts describe but the sync never writes → review items {plan, key, text_says, matrix} */
const factsReview = p => { const f = PROMPT_FACTS.caps[p.key] || {}, out = []; for (const k of Object.keys(f)) if (p.caps && k in p.caps && +p.caps[k] !== +f[k]) out.push({ plan: p.key, key: k, text_says: f[k], matrix: +p.caps[k] }); return out; };
/* → {found:true, before, after, text, changes:[{what, plan, from, to}], review:[{plan, key, text_says, matrix} | {plan, kind:"name_elsewhere", old, count}]}
     | {found:false, reason: section_missing | price_header_missing | plan_lines_count | plan_line_shape | guard | unknown_persona, where} */
export function rewritePrompt(kind, prompt, model) {
  const S = SPECS[kind]; if (!S) return { found: false, reason: "unknown_persona", where: String(kind) };
  const L = S.lang, src = String(prompt == null ? "" : prompt), lines = src.split("\n");
  const s0 = lines.findIndex(l => S.section.test(l));
  if (s0 < 0) return { found: false, reason: "section_missing", where: String(S.section.source) };
  let s1 = lines.findIndex((l, i) => i > s0 && /^# /.test(l)); if (s1 < 0) s1 = lines.length;
  const h = lines.findIndex((l, i) => i > s0 && i < s1 && S.header.test(l));
  if (h < 0) return { found: false, reason: "price_header_missing", where: String(S.header.source) };
  const plans = ((model && model.plans) || []).filter(p => p && p.key !== "visitor");
  const rows = []; for (let i = h + 1; i < s1 && S.line.test(lines[i]); i++) rows.push(i);
  if (rows.length !== plans.length) return { found: false, reason: "plan_lines_count", where: `${rows.length} lines under the price header, ${plans.length} sellable plans` };
  const out = [...lines], changes = [], review = [], bad = [];
  // VAT
  const vatNew = pct(model.vat_bp), hm = S.header.exec(lines[h]);
  if (hm[1] !== vatNew) { out[h] = lines[h].replace(`${hm[1]}%`, `${vatNew}%`); changes.push({ what: "vat", from: hm[1] + "%", to: vatNew + "%" }); }
  // the plan lines, in matrix order
  rows.forEach((li, idx) => {
    const p = plans[idx], [, lead, label, price, rest0] = S.line.exec(lines[li]);
    if (!PRICE_OK[L].test(price.trim())) { bad.push(`${p.key}: the price «${price}» is not a spoken number`); return; }
    const name1 = spoken(L, p.key, p), price1 = words(L, p.price_egp), P = PROD[L], n = p.caps ? p.caps.products : undefined;
    // the label = the spoken name + an optional qualifier « (…)». A label that already starts with the new name keeps it as it is — the next
    // save must never add it again (review R-1: «المميزة (جديدة) (جديدة) …»)
    const tail = label.startsWith(name1) ? label.slice(name1.length) : null, own = tail !== null && (tail === "" || tail.startsWith(" ("));
    const cut = own ? name1.length : label.indexOf(" ("), name0 = own ? name1 : cut < 0 ? label : label.slice(0, cut), qual = own ? tail : cut < 0 ? "" : label.slice(cut);
    let rest = rest0;
    if (n !== undefined) {
      const mm = P.num.exec(rest), hasU = rest.includes(P.unl);
      if (mm && n > 0 && mm[2] !== String(n)) rest = rest.replace(P.num, (a, pre) => pre + P.fmt(n));
      else if (mm && n === -1) rest = rest.replace(P.num, (a, pre) => pre + P.unl);
      else if (hasU && n > 0) rest = rest.replace(P.unl, P.fmt(n));
      else if ((mm || hasU) && n === 0) review.push({ plan: p.key, key: "products", text_says: mm ? Number(mm[2].replace(/,/g, "")) : -1, matrix: 0 });
    }
    if (name1 !== name0) { changes.push({ what: "name", plan: p.key, from: name0, to: name1 }); const elsewhere = countOf(src, name0) - countOf(lines[li], name0); if (elsewhere > 0) review.push({ plan: p.key, kind: "name_elsewhere", old: name0, count: elsewhere }); }
    if (price1 !== price.trim()) changes.push({ what: "price", plan: p.key, from: price.trim(), to: price1 });
    if (rest !== rest0) { const m0 = P.num.exec(rest0); changes.push({ what: "products", plan: p.key, from: m0 ? m0[2] : P.unl, to: n === -1 ? P.unl : String(n) }); }
    out[li] = `${lead}${name1}${qual}: ${price1} — ${rest}`;
    // the written line must parse again with the same name and price, or the next sync could never place it (review R-1: a price under 10,
    // a stored name with «:» / «—»): nothing is written, the panel shows plan_line_shape
    const back = S.line.exec(out[li]);
    if (!back || back[2] !== name1 + qual || back[3] !== price1 || !PRICE_OK[L].test(price1)) { bad.push(`${p.key}: the new line «${out[li].slice(0, 120)}» would not parse again (name «${name1}», price «${price1}»)`); return; }
    review.push(...factsReview(p));                       // facts the text describes but the sync never writes
  });
  if (bad.length) return { found: false, reason: "plan_line_shape", where: bad.join("; ") };
  // the gateway state: the payment sentence of the section
  for (let i = s0; i < s1; i++) { const a = out[i], b = model.ready ? a.split(S.pay[0]).join(S.pay[1]) : a.split(S.pay[1]).join(S.pay[0]); if (a !== b) { out[i] = b; changes.push({ what: "payment", to: model.ready ? "ready" : "not_ready" }); } }
  // guard: the same number of lines, nothing outside the section changed
  if (out.length !== lines.length || out.some((l, i) => (i < s0 || i >= s1) && l !== lines[i])) return { found: false, reason: "guard", where: "a change outside the plans section" };
  return { found: true, before: lines.slice(s0, s1).join("\n"), after: out.slice(s0, s1).join("\n"), text: out.join("\n"), changes, review: uniq(review) };
}
/* what a saved matrix would leave for a person to review in the prompts — without calling Anam: the plan set the texts list, the facts they
   describe (PROMPT_FACTS) and a renamed plan (the sync changes its label in the price block only) */
export function reviewOf(model) {
  const plans = ((model && model.plans) || []).filter(p => p && p.key !== "visitor"), out = [];
  const want = Object.keys(PROMPT_FACTS.caps), have = plans.map(p => p.key);
  if (want.join(",") !== have.join(",")) out.push({ kind: "plans", text_says: want, matrix: have });
  for (const p of plans) {
    out.push(...factsReview(p));
    for (const L of ["ar", "en"]) { const s0 = SPOKEN[L][p.key], s = spoken(L, p.key, p); if (s0 && s !== s0) out.push({ plan: p.key, kind: "name", lang: L, from: s0, to: s }); }
  }
  return uniq(out);
}
/* the model the sync reads: sellable plans in order with names, prices and caps, VAT and the gateway state */
export async function personaModel(env, CC) {
  const d = await plansData(env);
  let ready = false; try { if (CC && CC.payments && typeof CC.payments.payReady === "function") ready = !!(await CC.payments.payReady(env)).ready; } catch (e) { ready = false; }
  return { vat_bp: d.vat_bp, ready, v: d.updated_at, plans: PLAN_KEYS.filter(p => p !== "visitor" && d.plans[p].sellable).map(p => ({ key: p, ...d.plans[p] })) };
}
async function anamFetch(url, init) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(tm); }
}
/* the last run's items per persona (changes / review for the panel), in cc_settings (scope system, ≤ 8 KB) — no migration */
const LAST_ITEMS = "persona.last_items";
/* failures the hourly retry never repeats: the prompt's structure (a person has to fix the text) or a missing key */
const STRUCTURE = ["section_missing", "price_header_missing", "plan_lines_count", "plan_line_shape", "guard", "unknown_persona"];
const NO_RETRY = new RegExp(`^(${STRUCTURE.join("|")}|no_key)\\b|مفتاح Anam|no Anam key|section not found|القسم مش موجود`);
export const reasonOf = e => {
  const s = String(e || ""), m = /^([a-z_]+)\b/.exec(s);
  if (!s) return "";
  if (m && (STRUCTURE.includes(m[1]) || m[1] === "no_key" || m[1] === "conflict")) return m[1];
  if (/مفتاح Anam|no Anam key/.test(s)) return "no_key";
  if (/القسم مش موجود|section not found/.test(s)) return "section_missing"; // rows written before the anchored sync
  return "error";
};
async function saveLastItems(env, items, t) {
  try {
    const cur = jget(await setting(env, LAST_ITEMS, "{}"), {}) || {};
    for (const it of items) cur[it.persona_id] = { at: t, status: it.status, reason: it.reason || "", changes: (it.changes || []).slice(0, 20), review: (it.review || []).slice(0, 20) };
    const size = () => C.enc.encode(JSON.stringify(cur)).length;
    if (size() > 8000) for (const k of Object.keys(cur)) cur[k].review = (cur[k].review || []).slice(0, 5);
    if (size() > 8000) for (const k of Object.keys(cur)) { cur[k].changes = (cur[k].changes || []).slice(0, 5); cur[k].review = []; }
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'system', ?, 'persona-sync', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(LAST_ITEMS, JSON.stringify(cur), t).run();
  } catch (e) { console.error("persona last items", e && e.message); }
}
export async function personaSync(env, { dry_run = true, personas, by = "system", CC } = {}) {
  const key = await anamKey(env), model = await personaModel(env, CC), act = actorOf(by), items = [], t = now();
  const list = PERSONAS.filter(p => !Array.isArray(personas) || !personas.length || personas.includes(p.id));
  for (const p of list) {
    const it = { persona_id: p.id, name: p.name, found_section: false, changed: false, before: "", after: "", status: "failed", error: "", reason: "", changes: [], review: [] };
    let beforeSha = "", afterSha = "";
    try {
      if (!key) { it.reason = "no_key"; throw new Error("مفتاح Anam مش متضاف (ANAM_API_KEY) / no Anam key"); }
      const g = await anamFetch(ANAM + p.id, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
      if (!g.ok) throw new Error(`anam GET ${g.status}`);
      const j = await g.json(), prompt = j && j.brain && typeof j.brain.systemPrompt === "string" ? j.brain.systemPrompt : typeof (j && j.systemPrompt) === "string" ? j.systemPrompt : null;
      const updatedAt = j && typeof j.updatedAt === "string" ? j.updatedAt : "";
      if (prompt == null) throw new Error("the persona has no system prompt");
      beforeSha = (await sha256(prompt)).slice(0, 16);
      const r = rewritePrompt(p.kind, prompt, model);
      if (!r.found) { it.reason = r.reason; it.error = line(`${r.reason} — ${r.where || ""}`, 200); it.status = "failed"; }
      else {
        Object.assign(it, { found_section: true, before: r.before, after: r.after, changed: r.text !== prompt, changes: r.changes, review: r.review });
        afterSha = (await sha256(r.text)).slice(0, 16);
        if (!it.changed) it.status = "unchanged";
        else if (dry_run) it.status = "dry";
        else {
          const u = await anamFetch(ANAM + p.id, { method: "PUT", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(updatedAt ? { systemPrompt: r.text, expectedUpdatedAt: updatedAt } : { systemPrompt: r.text }) });
          if (u.status === 409) { it.reason = "conflict"; throw new Error("conflict: the persona changed while syncing"); }
          if (!u.ok) throw new Error(`anam PUT ${u.status}`);
          it.status = "ok";
        }
      }
    } catch (e) { it.status = "failed"; it.error = it.error || line((e && e.message) || "error", 200); if (!it.reason) it.reason = "error"; }
    try {
      await batch(env, [env.DB.prepare("INSERT INTO cc_persona_sync (persona_id, at, by, plans_v, status, before_sha, after_sha, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(p.id, t, act.actor_email || act.actor_id, model.v, it.status, beforeSha, afterSha, it.error),
        auditStmt(env, { ...act, action: "persona.sync", target_type: "persona", target_id: p.id, summary: `${p.name}: ${it.status}${it.error ? " — " + it.error : ""}`, before: { sha: beforeSha }, after: { sha: afterSha, status: it.status, dry_run: !!dry_run, reason: it.reason, changes: it.changes.length, review: it.review.length } })]);
    } catch (e) { console.error("persona sync log", e && e.message); }
    items.push(it);
  }
  await saveLastItems(env, items, t);
  return { items };
}
export async function postPersonaSync(req, env, ctx, adm) {
  const b = await body(req);
  await needTables(env, "cc_persona_sync", "cc_audit");
  const personas = Array.isArray(b.personas) ? b.personas.map(x => line(x, 40)).filter(Boolean) : undefined;
  return { body: await personaSync(env, { dry_run: b.dry_run !== false, personas, by: adm.actor, CC: adm.CC }) };
}
/* cron: one retry per hour when auto-sync is on and the last real attempt of a persona failed for a passing reason (Anam 5xx, a 409
   conflict) — never for the prompt's structure or a missing key */
export async function personaRetry(env, nowMs, CC) {
  if ((await setting(env, "persona.auto_sync", "1")) !== "1") return { skipped: "auto_off" };
  const last = await all(env, "SELECT p.* FROM cc_persona_sync p JOIN (SELECT persona_id, MAX(id) AS id FROM cc_persona_sync WHERE status != 'dry' GROUP BY persona_id) x ON x.id = p.id");
  const due = last.filter(r => r.status === "failed" && !NO_RETRY.test(String(r.error || "")) && r.at < iso(nowMs - 3600000)).map(r => r.persona_id);
  if (!due.length) return { retried: 0 };
  const r = await personaSync(env, { dry_run: false, personas: due, by: "system", CC });
  return { retried: due.length, ok: r.items.filter(i => i.status === "ok" || i.status === "unchanged").length };
}
export { PLAN_KEYS };
