/* Automatic matching engine (owner decision 1): which REGISTERED member factories receive an inquiry.
   Eligible: a plan with «incoming» (the Basic plan and up; in force, not expired), verified by the platform, has an email, inbox not
   paused, and the inquiry's market inside the member's plan scope (owner's matrix 2026-11-18: basic = Egypt; premium = + the 3 GCC
   states it chose — none chosen yet = all six — and the other Arab countries; partner = + all six GCC states + Africa; strategic = all).
   A Gulf request is checked by country (inquiryCountry): a GCC state only reaches the members whose plan covers that state; another Arab
   country ("ARAB": Iraq, Jordan, Lebanon, Syria, Yemen, Palestine) reaches every plan with the Gulf market (DESIGN Q1); an unknown Gulf
   country only the plans with all six (or a Premium member who has not chosen yet). North Africa (Libya, Sudan, Morocco, Algeria,
   Tunisia, Mauritania) is Africa. Directory factories that are not members never get the request: only the teaser (title + registration
   link) at their official company e-mail, one per request, with a stop link (teasers.js, owner decision 2026-11-28).
   Score = sector match + product/keyword overlap (Arabic normalisation: alef/ya/ta-marbuta, diacritics, «ال», plurals,
   stop words, common English → Arabic) + same governorate bonus; a member who owns the targeted directory profile always
   matches. Ranking: premium-and-above first («أولوية») — but only when the match itself is relevant (score at least 8 and at least
   half of the best match), so a premium member sharing one weak keyword never pushes out an exact match — then score, then
   earliest activation. Max 10. Governorates may be site codes ("CAI") or names; both compare as names. */
import { tokens, norm, stem } from "./text.js";
import { PLAN_LV, PLAN_SCOPE, effPlan, MARKETS, govName, planCan, plansWith, gulfCountry, gulfCovers } from "./common.js";

export const MAX_ROUTES = 10;
export const ROUTABLE = ["rfq", "contact", "basket"];
/* country text → market, in this order: Egypt · an explicit Africa country (North Africa included, so «وجدة، المغرب» / "Libyan Arab …"
   never look like the Gulf) · a GCC state or another Arab country (gulfCountry) · the generic Gulf words · Asia · Europe. English names must start a
   word ("Romania" is not Oman; "Omani", "Nigerian" still match). */
const COUNTRY_MARKET = [
  ["africa", /افريقيا|أفريقيا|إفريقيا|ليبيا|السودان|المغرب|الجزائر|تونس|موريتانيا|نيجيريا|كينيا|اثيوبيا|إثيوبيا|غانا|تنزانيا|اوغندا|أوغندا|السنغال|موزمبيق|انجولا|أنجولا|الكونغو|الكاميرون|ساحل العاج|رواندا|زامبيا|\b(africa|libya|sudan|morocco|algeria|tunisia|mauritania|nigeria|kenya|ethiopia|ghana|tanzania|uganda|senegal|mozambique|angola|congo|cameroon|ivory|rwanda|zambia)/i],
  ["gulf", /الخليج|\b(gulf|gcc|arab)/i],
  ["asia", /اسيا|آسيا|الصين|الهند|باكستان|بنجلاديش|اندونيسيا|إندونيسيا|ماليزيا|تركيا|\b(asia|china|india|pakistan|bangladesh|indonesia|malaysia|turkey|vietnam|japan|korea)/i],
  ["europe", /اوروبا|أوروبا|المانيا|ألمانيا|فرنسا|ايطاليا|إيطاليا|اسبانيا|إسبانيا|بريطانيا|\b(europe|germany|france|italy|spain|uk\b|britain|netherlands|greece|cyprus)/i],
];
const EGYPT = /مصر|egypt|القاهرة|الجيزة|الاسكندرية|الإسكندرية/i;
/* where the deal is: explicit payload.market, else from the buyer's country; default Egypt (local) */
export function inquiryMarket(p) {
  p = p || {};
  const m = String(p.market || "").toLowerCase();
  if (MARKETS.includes(m)) return m;
  const c = String(p.country || p.buyer_country || "");
  if (!c || EGYPT.test(c)) return "local";
  if (COUNTRY_MARKET[0][1].test(c)) return "africa";
  if (gulfCountry(c)) return "gulf";                       // a GCC state (code or name) or another Arab country
  for (const [mk, rx] of COUNTRY_MARKET.slice(1)) if (rx.test(c)) return mk;
  return "local";
}
/* the country of a Gulf request: a GCC code (SA, AE, KW, QA, BH, OM), "ARAB" (another Arab country) or "" (unknown) */
export const inquiryCountry = p => gulfCountry((p && (p.country || p.buyer_country)) || "");

/* the text that describes what the buyer wants */
export function inquiryText(inq) {
  const p = inq.payload || {};
  const items = Array.isArray(inq.items) ? inq.items : [];
  return [inq.message, inq.sector, p.sector, p.product, p.products, p.title, p.category, p.activity, p.details, p.keywords,
    ...items.map(i => [i && i.name, i && i.category, i && i.product].filter(Boolean).join(" "))].filter(x => typeof x === "string" || typeof x === "number").join(" ");
}
/* words that say nothing about WHAT is made (stemmed forms) — never enough for a match on their own */
export const GENERIC = new Set(["صناع", "صناعه", "صناعي", "صناعيه", "صناعات", "منتج", "مواد", "ماده", "مستلزم", "خام", "خامات", "عام", "عامه", "توريد", "توريدات", "تجار", "تجاره", "خدم", "خدمه", "اعمال", "شرك", "شركه", "مصنع", "مصانع",
  "سعه", "لتر", "كيلو", "جرام", "طن", "متر", "قطعه", "عدد", "حجم", "مقاس", "نوع", "انواع", "جديد", "اصلي", "جوده", "عاليه", "سعر", "كميه", "مختلف", "مختلفه", "هندسي", "هندسيه", "industrial", "industry", "products", "product", "materials", "services", "general", "new", "quality", "size", "liter", "litre"]);
const tok = (s, max) => tokens(s, max).filter(t => !GENERIC.has(t));
const govNorm = g => stem(norm(govName(String(g || "")).replace(/^محافظ[هة]\s*/, "")));
export const PRIO_MIN = 8;

/* score one member against a prepared inquiry {toks:Set, sectorToks:[], gov, market, cc, target_type, target_id} */
export function scoreMember(q, m) {
  const plan = effPlan(m);
  const out = { score: 0, priority: planCan(m, "priority") ? 1 : 0, reason: [] };
  if (!planCan(m, "incoming")) return null;
  if (!(PLAN_SCOPE[plan] || []).includes(q.market)) return null;
  if (q.market === "gulf" && !gulfCovers(m, q.cc)) return null; // Premium: only the GCC states it chose (none chosen yet = all six)
  // the factory the buyer chose on its profile page, when it is a registered member
  if (q.target_id && m.factory_ref && /^(factory|company)$/.test(q.target_type) && String(m.factory_ref) === String(q.target_id)) { out.score += 100; out.reason.push("target"); }
  const mTok = new Set(tok(`${m.sector || ""} ${m.products || ""}`, 200));
  const cTok = new Set(tok(m.company || "", 20));
  let content = 0;
  // sector
  if (q.sectorToks.length && m.sector) {
    if (norm(q.sector) === norm(m.sector)) { content += 12; out.reason.push("sector"); }
    else { const sTok = new Set(tok(m.sector)); const hit = q.sectorToks.filter(t => sTok.has(t)).length; if (hit) { content += 6 + 2 * hit; out.reason.push("sector~"); } }
  }
  // products / keywords
  let kw = 0;
  for (const t of q.toks) {
    if (mTok.has(t)) { kw += 3 + Math.min(t.length, 8) * 0.5; continue; }
    if (t.length >= 4) { for (const x of mTok) if (x.length >= 4 && (x.startsWith(t) || t.startsWith(x))) { kw += 1.5; break; } }
    if (cTok.has(t) && t.length >= 4) kw += 1;
  }
  if (kw) { content += kw; out.reason.push("keywords"); }
  if (content > 0 && q.gov && m.governorate && govNorm(q.gov) === govNorm(m.governorate)) { content += 2; out.reason.push("governorate"); }
  out.score += content;
  if (out.score <= 0) return null;
  out.score = Math.round(out.score * 10) / 10;
  return out;
}

export function prepare(inq) {
  const p = inq.payload || {};
  const sector = String(inq.sector || p.sector || "");
  return { toks: new Set(tok(inquiryText(inq), 120)), sector, sectorToks: tok(sector), gov: String(inq.governorate || p.governorate || ""), market: inq.market || inquiryMarket(p), cc: inquiryCountry(p),
    target_type: String(inq.target_type || ""), target_id: String(inq.target_id || "").replace(/^company\.html#/, "") };
}

/* → [{member, score, priority, reason}] best first, at most `max` */
export function rank(inq, members, { exclude = [], max = MAX_ROUTES, nowIso } = {}) {
  const q = prepare(inq), ex = new Set(exclude), out = [];
  for (const m of members || []) {
    if (!m || ex.has(m.id) || !m.verified || !m.email || m.inbox_paused) continue;
    if (inq.user_id && m.id === inq.user_id) continue;                         // never send a buyer's request to themselves
    if (inq.email && String(m.email).toLowerCase() === String(inq.email).toLowerCase()) continue;
    if (nowIso && m.plan_expires && m.plan_expires < nowIso) continue;
    const s = scoreMember(q, m);
    if (s) out.push({ member: m, score: s.score, priority: s.priority, reason: s.reason.join(",") });
  }
  // priority (premium+) counts only for a relevant match: ≥ PRIO_MIN and ≥ half of the best non-target score
  const top = Math.max(0, ...out.filter(x => x.score < 100).map(x => x.score));
  for (const x of out) if (x.priority && x.score < 100 && x.score < Math.max(PRIO_MIN, top * 0.5)) x.priority = 0;
  out.sort((a, b) => (b.score >= 100) - (a.score >= 100) || b.priority - a.priority || b.score - a.score || String(a.member.activated_at || a.member.created_at).localeCompare(String(b.member.activated_at || b.member.created_at)));
  return out.slice(0, Math.max(0, max));
}

/* members that may receive inquiries (SQL pre-filter; plan expiry + scope are re-checked in rank) */
export async function candidates(env) {
  const inc = plansWith("incoming"); // the plans matrix decides who receives requests (default: basic+)
  const { results } = await env.DB.prepare(`SELECT * FROM members WHERE plan IN (${inc.map(() => "?").join(", ") || "''"}) AND verified = 1 AND email != '' AND inbox_paused = 0 LIMIT 5000`).bind(...inc).all();
  return results || [];
}
