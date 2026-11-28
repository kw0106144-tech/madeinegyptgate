/* «فرص مناسبة لمصنعك» — proactive opportunity matching (owner 2026-11-26: «every new opportunity matched to each member's company profile
   automatically, with a 0-100 score and an alert, so the member finds them ready»; Bassem used to find them only when the member asked).
   Owner switch opp_matching (flags.js, OFF by default, locked until migration 0016). Built for madeinegyptgate.com; the scoring has no
   site-specific rule beyond the plan markets, so the UAE site can reuse it with its own market table.

   WHAT IS MATCHED (never an invented item: only opportunities that arrived through the platform's own pipelines)
     intel     the Information Center (migate-intel) through the INTEL service binding: GET /api/intel/feed?sort=seen&since=…&since_id=…
               (tenders, RFQs, projects; never news). Cursor = (first_seen_at, id) of the last row read.
     platform  the platform's own tenders / RFQs of data.json (digest.js items()), new since the cursor in seen_items (never the
               baseline of the first sync). Cursor = (first_seen_at, kind|id).
     web       the «فرص السوق» web leads (web_leads, 0012) exactly as web-public.js publishes them (publicOf: the platform's words, no
               source, no link), only while web_leads_public is on; a lead the team rejects or hides later disappears from the list.
               Cursor = web_leads.id.
   Bounded work (OPP.perRun items per source and OPP.writes rows per run, the cursor stops before an item that would overflow); a cursor
   older than OPP.bootDays starts again at that age (no pile of stale items after the switch was off). Members: every member whose
   plan includes Bassem (planCan(m, "bassem"), plansWith("bassem") pre-filter, verified = 1) with something to match on.

   THE SCORE (deterministic, 0-100; no model, no randomness — matchScore() below):
     product        45  the member's products (factory profile 0007 + members.products), each through lookup-terms.js concepts(): the word,
                        its forms (text.js norm / stem: «الأنابيب» = «أنبوبة»), its true equivalents (tier 1: «مواسير», "pipes") and the
                        same field (tier 2, half). A product with several words: the share of its words found. The best product counts.
     sector         20  the member's sector = the item's sector (20), a meaningful word shared with it (12), or named in the item (8)
     market         15  GATE: the item's market must be inside the member's plan (PLAN_SCOPE; a Gulf state only when the plan covers it:
                        gulfCovers; a world / "international" item only for the plan with every market). Then 15 when it is one of his
                        target markets (profile), 8 when he has listed none, 4 otherwise
     certifications 10  the certificates the notice names (ISO 9001 / 14001 / 22000 / 45001 / 13485 / 17025, HACCP, Halal, CE marking,
                        GMP, FDA, SASO / SABER, G-Mark, FSSC 22000, BRC, API monogram): none asked → 10; else 10 × held / asked, and
                        each one not in his profile goes into `missing`
     deadline       10  open with 7 days or more (10), 1-6 days (6), today (3), not stated (5). A deadline that passed, or a closed /
                        cancelled item, is NEVER scored: no row, and a stored row whose deadline passed is never listed as active.
   A row is kept only with a product or a sector signal and a score ≥ OPP.storeMin (40). reasons / missing are computed from the data
   (both languages); the source link is stored inside item_json.src for the team and NEVER returned, e-mailed or put in Bassem's block
   (the owner's rule: Bassem never names sources). The card may carry the platform's page and, for a tender / RFQ of the Information
   Center, the official notice link (notice_link).

   API (Bearer = the member's own sign-in; his own rows only — member_id comes from the session, never from the request):
     GET  /api/me/opportunities[?status=active|new|seen|saved|dismissed][&limit≤50][&lang=en]
          → {items: [{key, source, kind, kind_label, title, entity, market, deadline, days_left, expired, score, reasons, missing,
             status, link, notice_link?, created_at}], counts: {new, seen, saved, dismissed}, alert_min}
     POST /api/me/opportunities {key | keys: [≤ 50], status: seen | dismissed | saved} → {ok, changed}
     503 feature_off (switch off) · 503 opp_matches_off (no 0016) · 403 plan (no Bassem in the plan) · 401 unauthorized
   The daily alert (oppAlerts, platform cron, from the digest time DIGEST_TIME): the member's new matches of OPP_ALERT_MIN (default 70) or
   more, never alerted before, at most OPP_ALERT_MAX (default 5) a day, one in-app notification + one e-mail (template opp_matches,
   list «digest»: his email_digest preference and the unsubscribe link apply; nothing while daily_digest is off or he paused Bassem).
   Bassem (janna-session.js bassemContext → bassem-context.js oppsLineAr): the top 3 unseen active matches as one short line. */
import { json, err, preflight, readJson, bodyErr, now, iso, jparse, line, site, mail, notify, cairoDay, cairoHM, addDays, prefsOf, planCan,
  plansWith, effPlan, PLAN_SCOPE, MARKETS, gulfCovers, gulfCountry, normGcc, rateOk } from "./common.js";
import { authUser } from "./auth.js";
import { featureOn, featureSync, offMessage, oppStoreOn, leadsStoreOn } from "./flags.js";
import { concepts, storedForms, words } from "./lookup-terms.js";
import { norm, tokens, asciiDigits, forLLM, instructionLike } from "./text.js";
import { items as platformItems } from "./digest.js";
import { publicOf } from "./web-public.js";
import { intelFetch } from "./notify-items.js";
import { marketOf } from "./websearch.js";
import { splitItems, sanitizeProfile } from "./profile.js";
import { budgetLeft } from "./memory.js"; // the platform cron's counting D1 (index.js: both steps share one budget)

export const OPP = Object.freeze({
  feature: "opp_matching", storeMin: 40, alertMin: 70, alertMax: 5, bootDays: 7, writes: 150, members: 2000, alertMembers: 25, budget: 250,
  perRun: Object.freeze({ intel: 50, platform: 100, web: 50 }), products: 25, list: 20, listMax: 50, keysMax: 50,
  weights: Object.freeze({ product: 45, sector: 20, market: 15, certs: 10, deadline: 10 }),
});
const SOURCES = ["intel", "platform", "web"];
const STATUSES = ["new", "seen", "dismissed", "saved"];
const INTEL_KINDS = { tender_gov: "tender", tender_semi: "tender", tender_private: "tender", rfq: "rfq", project: "project" };
const WEB_KINDS = new Set(["tender", "rfq", "buyer", "buyer_list", "project"]);
export const KIND_NAME = Object.freeze({ tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "RFQ"], project: ["مشروع", "Project"], buyer: ["عميل محتمل", "Potential buyer"], buyer_list: ["قائمة عملاء محتملين", "List of potential buyers"] });
const REGION_NAME = { local: ["مصر", "Egypt"], gulf: ["الخليج والدول العربية", "the Gulf and Arab countries"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"], intl: ["دولي", "International"] };
const GCC_LOW = ["sa", "ae", "kw", "qa", "bh", "om"];
const ARAB_LOW = ["jo", "iq", "ma", "tn", "dz", "ly", "lb", "ye", "ps", "sy", "sd", "dj", "mr", "so"];
const AFRICA_LOW = ["ke", "ng", "et", "za"], ASIA_LOW = ["cn", "in", "tr"], EUROPE_LOW = ["de", "it", "fr", "es", "gb", "uk"];
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = v => { const s = String(v == null ? "" : v).slice(0, 10); return DAY_RX.test(s) ? s : ""; };
const httpUrl = v => { const s = String(v == null ? "" : v).trim(); return /^https?:\/\/[^\s"<>]{3,600}$/i.test(s) ? s : ""; };
const clipW = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; };
const pickLangOf = (v, lang) => { const m = /^(.*?)\s*\(([^()]*)\)$/.exec(String(v || "").trim()); if (!m) return String(v || "").trim(); const ar = /[؀-ۿ]/; return lang === "en" ? (ar.test(m[1]) ? m[2] : m[1]).trim() : (ar.test(m[1]) ? m[1] : m[2]).trim(); };

/* ---------------- markets ----------------
   an item's market code (Information Center: eg, sa, gcc, jo, africa:ke, asia:cn, eu, intl …; web leads: eg, sa, gulf, arab, ke, cn, de, us,
   "" = world; platform: local, gulf, africa, asia, europe) → {plan: the plan market, cc: a GCC code / "ARAB" / "" for a Gulf item,
   tags: what a member's target market may name} */
export function marketOfItem(code, country) {
  const c = String(code == null ? "" : code).trim().toLowerCase();
  if (c === "eg" || c === "local") return { plan: "local", cc: "", tags: ["eg", "local"] };
  if (GCC_LOW.includes(c)) return { plan: "gulf", cc: c.toUpperCase(), tags: [c, "gulf", "arab"] };
  if (c === "gcc" || c === "gulf") { const cc = gulfCountry(country || ""); return { plan: "gulf", cc, tags: cc === "ARAB" ? ["arab"] : cc ? [cc.toLowerCase(), "gulf", "arab"] : ["gulf", "arab"] }; } // digest.js inScope's rule
  if (ARAB_LOW.includes(c) || c === "arab") return { plan: "gulf", cc: "ARAB", tags: c === "arab" ? ["arab"] : [c, "arab"] };
  if (c === "africa" || c.startsWith("africa:") || AFRICA_LOW.includes(c)) { const cc = c.includes(":") ? c.split(":")[1] : c === "africa" ? "" : c; return { plan: "africa", cc: "", tags: cc ? [cc, "africa"] : ["africa"] }; }
  if (c === "asia" || c.startsWith("asia:") || ASIA_LOW.includes(c)) { const cc = c.includes(":") ? c.split(":")[1] : c === "asia" ? "" : c; return { plan: "asia", cc: "", tags: cc ? [cc, "asia"] : ["asia"] }; }
  if (c === "eu" || c === "europe" || EUROPE_LOW.includes(c)) return { plan: "europe", cc: "", tags: c === "eu" || c === "europe" ? ["europe"] : [c, "europe"] };
  return { plan: "intl", cc: "", tags: c && c !== "intl" ? [c] : [] }; // the world, an international body, another country
}
/* is the item's market inside the member's plan? (the Gulf: only the GCC states the plan covers; the world: only the plan with every market) */
export function inPlan(m, mk, nowIso) {
  const scope = PLAN_SCOPE[effPlan(m, nowIso)] || [];
  if (mk.plan === "intl") return MARKETS.every(x => scope.includes(x));
  if (!scope.includes(mk.plan)) return false;
  return mk.plan !== "gulf" || gulfCovers(m, mk.cc, nowIso);
}
/* the member's target markets (profile) → the codes they name: «السعودية» → sa, «الخليج» → gulf, «أفريقيا» → africa, "Kenya" → ke */
export function targetCodes(list) {
  const out = new Set();
  for (const t of list || []) {
    const s = String(t || "").trim(); if (!s) continue;
    const hit = marketOf(s) || marketOf(norm(s)); if (hit) { out.add(hit.code); continue; }
    /* «السعودية والإمارات وقطر», "Saudi Arabia and Kenya": word by word (an attached «و» comes off), then the GCC names inside the text */
    for (const w of s.split(/[\s,،;/]+/)) { const x = marketOf(w) || (/^و./.test(w) && marketOf(w.slice(1))); if (x) out.add(x.code); }
    for (const c of normGcc(s.split(/\s+و|\s+and\s+|\s+/i))) out.add(c.toLowerCase());
  }
  return out;
}

/* ---------------- certificates ---------------- */
const ISO = n => new RegExp("(?:\\biso|[اأإ]يزو)\\s*[-:/]?\\s*" + n + "(?!\\d)", "i");
export const CERTS = Object.freeze([
  ["iso9001", "ISO 9001", ISO("9001")], ["iso14001", "ISO 14001", ISO("14001")], ["iso22000", "ISO 22000", ISO("22000")],
  ["iso45001", "ISO 45001", /(?:(?:\biso|[اأإ]يزو)\s*[-:/]?\s*45001(?!\d)|\bohsas\s*[-:/]?\s*18001)/i], ["iso13485", "ISO 13485", ISO("13485")], ["iso17025", "ISO/IEC 17025", ISO("(?:iec\\s*)?17025")],
  ["haccp", "HACCP", /\bhaccp\b|(?:^|[\s(])(?:ال)?هاسب(?:$|[\s)،,.])/i], ["halal", "Halal", /\bhalal\b|(?:شهاد[ةه]|علام[ةه])\s+(?:ال)?حلال/i],
  ["ce", "CE", /\bce[\s-]*(?:mark|marking|marked|certif\w*)|(?:علام[ةه]|شهاد[ةه])\s*(?:ال)?ce\b/i], ["gmp", "GMP", /\b(?:c?gmp)\b/i], ["fda", "FDA", /\bfda\b/i],
  ["saso", "SASO / SABER", /\bsaso\b|\bsaber\b|ساسو|(?:منص[ةه]\s+)?سابر\b/i], ["gmark", "G-Mark", /\bg[\s-]?mark\b|علام[ةه]\s+(?:المطابق[ةه]\s+)?الخليجي[ةه]/i],
  ["fssc22000", "FSSC 22000", /\bfssc\s*22000\b/i], ["brc", "BRC", /\bbrc(?:gs)?\b/i], ["api", "API monogram", /\bapi\s*(?:monogram|spec\.?\s*\w+|5l|5ct|6d|6a|q1)\b/i],
]);
export function certsIn(text) {
  const t = asciiDigits(String(text || "")), out = [];
  for (const [code, , rx] of CERTS) if (rx.test(t)) out.push(code);
  return out;
}
const certName = code => (CERTS.find(c => c[0] === code) || [code, code])[1];

/* ---------------- the member's side (once per run) ---------------- */
const SECTOR_STOP = new Set(tokens("الصناعات صناعة صناعات صناعية الصناعية منتجات معدات المعدات خدمات الخدمات العامة عامة مواد اجهزة أجهزة الأجهزة توريدات التوريدات industries industry products equipment services general materials supplies"));
const sectorToks = s => tokens(pickLangOf(s, "ar") + " " + pickLangOf(s, "en")).filter(t => t.length >= 3 && !SECTOR_STOP.has(t));
export function memberSignals(m, profile) {
  const p = sanitizeProfile(profile || {});
  const list = [], seen = new Set();
  for (const x of (p.products || []).concat(splitItems(m && m.products ? m.products : ""))) {
    const label = clipW(String(x || ""), 60), k = norm(label); if (!k || seen.has(k)) continue; seen.add(k);
    const c = concepts(label).concepts; if (c.length) list.push({ label, concepts: c });
    if (list.length >= OPP.products) break;
  }
  const sector = String((m && m.sector) || "").trim();
  return { products: list, sector, sectorKey: norm(pickLangOf(sector, "ar")), sectorToks: sectorToks(sector), certs: new Set(certsIn((p.certifications || []).join(" ; "))),
    targets: targetCodes(p.target_markets || []), any: list.length > 0 || !!sector };
}

/* ---------------- the item's side (once per item) ---------------- */
/* every stored form of every word of a text (lookup-terms.js: «والأنابيب» → «انبوب») */
export function wordSet(text) {
  const out = new Set();
  for (const w of words(String(text || "").slice(0, 4000))) for (const f of storedForms(w)) out.add(f);
  return out;
}
export function itemSignals(it) {
  const text = [it.title, it.title_en, it.title_orig, it.summary, it.product].filter(Boolean).join(" . ");
  return { set: wordSet(text), certs: certsIn(text + " " + (it.extra || "")), sectorKey: norm(pickLangOf(it.sector || "", "ar")), sectorToks: sectorToks(it.sector || ""),
    mk: marketOfItem(it.market, it.country), deadline: dayOf(it.deadline) };
}
const altHit = (alt, set) => alt.toks.length > 0 && alt.toks.every(t => set.has(t) || set.has(norm(t)));
function conceptTier(c, set) {
  let best = 0;
  for (const a of c.alts) if (altHit(a, set)) { if (a.tier === 1) return 1; best = 2; }
  return best;
}
/* one product against the item's words → strength 0..1 and the best tier */
export function productStrength(prod, set) {
  let sum = 0, tier = 0;
  for (const c of prod.concepts) { const t = conceptTier(c, set); if (t) { sum += t === 1 ? 1 : 0.5; tier = tier === 1 || t === 1 ? 1 : 2; } }
  return { s: prod.concepts.length ? sum / prod.concepts.length : 0, tier };
}

/* ---------------- the score ----------------
   → null (not a match: expired / closed / outside the plan / nothing in common / under storeMin) or {score, reasons, missing} */
export function matchScore(ms, is, it, m, nowMs = Date.now()) {
  const W = OPP.weights, today = cairoDay(nowMs), nowIso = iso(nowMs);
  if (it.closed) return null;
  if (is.deadline && is.deadline < today) return null;                                 // expired: never scored as active
  if (!inPlan(m, is.mk, nowIso)) return null;                                          // the market must be inside his plan
  const reasons = [], missing = [];
  // product
  let best = { s: 0, tier: 0, label: "" };
  for (const p of ms.products) { const r = productStrength(p, is.set); if (r.s > best.s || (r.s === best.s && r.tier === 1 && best.tier !== 1)) best = { ...r, label: p.label }; }
  const product = Math.round(W.product * best.s);
  if (product > 0) reasons.push(best.tier === 1 && best.s >= 1
    ? { code: "product", pts: product, ar: "منتجك «" + best.label + "» مطلوب فيها", en: "Your product “" + best.label + "” is asked for" }
    : { code: "product", pts: product, ar: "قريبة من منتجك «" + best.label + "»", en: "Close to your product “" + best.label + "”" });
  // sector
  let sector = 0;
  if (ms.sectorKey && is.sectorKey && ms.sectorKey === is.sectorKey) sector = W.sector;
  else if (ms.sectorToks.length && is.sectorToks.some(t => ms.sectorToks.includes(t))) sector = 12;
  else if (ms.sectorToks.length && ms.sectorToks.some(t => is.set.has(t))) sector = 8;
  if (sector) reasons.push({ code: "sector", pts: sector, ar: "في قطاعك (" + clipW(pickLangOf(ms.sector, "ar"), 60) + ")", en: "In your sector (" + clipW(pickLangOf(ms.sector, "en"), 60) + ")" });
  if (!product && !sector) return null;                                                // nothing about his factory in it
  // market (inside the plan already)
  const nm = REGION_NAME[is.mk.plan] || REGION_NAME.intl, targeted = is.mk.tags.some(t => ms.targets.has(t)) || (ms.targets.has("arab") && is.mk.plan === "gulf");
  const market = targeted ? W.market : ms.targets.size ? 4 : 8;
  reasons.push(targeted ? { code: "market", pts: market, ar: "في سوق من الأسواق اللي بتستهدفها (" + nm[0] + ")", en: "In one of your target markets (" + nm[1] + ")" }
    : { code: "market", pts: market, ar: "جوه أسواق باقتك (" + nm[0] + ")", en: "Inside your plan's markets (" + nm[1] + ")" });
  // certificates
  let certs = W.certs;
  if (is.certs.length) {
    const held = is.certs.filter(c => ms.certs.has(c));
    certs = Math.round(W.certs * held.length / is.certs.length);
    if (held.length) reasons.push({ code: "certs", pts: certs, ar: "الشهادات المطلوبة اللي عندك: " + held.map(certName).join("، "), en: "Required certificates you hold: " + held.map(certName).join(", ") });
    for (const c of is.certs) if (!ms.certs.has(c)) missing.push({ code: "cert", cert: c, ar: "مطلوب شهادة " + certName(c) + " ومش ظاهرة في ملف مصنعك", en: "Asks for " + certName(c) + ", which your factory profile does not show" });
  }
  // deadline
  let deadline = 5;
  if (is.deadline) {
    const left = Math.round((Date.parse(is.deadline + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5);
    deadline = left >= 7 ? W.deadline : left >= 1 ? 6 : 3;
    reasons.push({ code: "deadline", pts: deadline, ar: "آخر ميعاد " + is.deadline + (left ? " (باقي " + left + " يوم)" : " (النهارده)"), en: "Deadline " + is.deadline + (left ? " (" + left + " day" + (left === 1 ? "" : "s") + " left)" : " (today)") });
  } else missing.push({ code: "deadline", ar: "آخر ميعاد مش مذكور — اتأكد منه قبل ما تقدّم", en: "No deadline stated — check it before you apply" });
  const score = Math.max(0, Math.min(100, product + sector + market + certs + deadline));
  if (score < OPP.storeMin) return null;
  return { score, reasons, missing };
}

/* ---------------- the sources → one item shape ----------------
   {key, source, kind, title, title_en, entity, sector, market, country, deadline, closed, link, notice, src (INTERNAL), cursor} */
export function fromIntel(x, env) {
  const kind = INTEL_KINDS[x && x.kind]; if (!kind || !x.id) return null;
  const page = httpUrl(x.page), base = site(env);
  return { key: "intel:" + String(x.id).slice(0, 64), source: "intel", kind, title: clipW(x.title_ar || x.title || x.title_orig || "", 200), title_en: clipW(x.title_en || "", 200),
    title_orig: clipW(x.title_orig || "", 200), summary: clipW(x.summary || "", 600), entity: clipW(x.entity || "", 120), sector: x.sector || "", market: x.market || "", country: x.country || "",
    market_ar: clipW(x.market_name || "", 40), deadline: dayOf(x.deadline), closed: x.status === "closed", link: page && page.startsWith(base) ? page : "",
    notice: kind === "tender" || kind === "rfq" ? httpUrl(x.url) : "", src: httpUrl(x.url), cursor: [String(x.first_seen_at || ""), String(x.id)] };
}
export function fromPlatform(it, seenAt, env) {
  if (!it || (it.kind !== "tender" && it.kind !== "rfq")) return null;
  return { key: "platform:" + it.kind + ":" + it.id, source: "platform", kind: it.kind, title: clipW(it.title, 200), title_en: "", entity: clipW(it.entity || "", 120), sector: it.sector || "",
    market: it.market || "local", country: it.gov || "", deadline: dayOf(it.deadline), closed: false, link: it.url ? site(env) + String(it.url).replace(/^\/+/, "") : "", notice: "",
    src: httpUrl(it.src), cursor: [seenAt, it.kind + "|" + it.id] };
}
export function fromWeb(r, env) {
  const p = publicOf(r); if (!p || !WEB_KINDS.has(p.pub.type)) return null;
  const pub = p.pub;
  return { key: "web:" + pub.id, source: "web", kind: pub.type, title: clipW(pub.title || pub.product || "", 200), title_en: "", entity: clipW(pub.entity || "", 120), product: pub.product || "",
    summary: forLLM(r.snippet || "", 300), sector: "", market: pub.market || "", country: "", deadline: dayOf(pub.deadline), closed: !!p.cancelled,
    link: site(env) + "market-opportunities/", notice: "", src: httpUrl(r.url), cursor: [String(r.id), ""] };
}
/* the card as stored (item_json): what the member may see + src for the team only */
const cardOf = (it, is) => ({ kind: it.kind, title: it.title, ...(it.title_en ? { title_en: it.title_en } : {}), ...(it.entity ? { entity: it.entity } : {}),
  market: is.mk.plan, ...(it.market_ar ? { market_ar: it.market_ar } : {}), ...(is.mk.cc && is.mk.cc !== "ARAB" ? { cc: is.mk.cc } : {}), deadline: is.deadline,
  ...(it.link ? { link: it.link } : {}), ...(it.notice ? { notice: it.notice } : {}), ...(it.src ? { src: it.src } : {}) });

/* ---------------- the cron: new items → matches ---------------- */
async function readCursors(env) {
  const rows = (await env.DB.prepare("SELECT source, cursor, cursor_id FROM opp_cursors").all()).results || [];
  return Object.fromEntries(rows.map(r => [r.source, { c: r.cursor || "", id: r.cursor_id || "" }]));
}
const saveCursor = (env, source, c, id, t) => env.DB.prepare("INSERT INTO opp_cursors (source, cursor, cursor_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, cursor_id = excluded.cursor_id, updated_at = excluded.updated_at").bind(source, c, id, t);
export async function eligibleMembers(env, nowMs = Date.now()) {
  const bp = plansWith("bassem"); if (!bp.length) return [];
  const ph = bp.map(() => "?").join(", ");
  let rows;
  try { rows = (await env.DB.prepare(`SELECT m.*, p.profile_json AS _profile FROM members m LEFT JOIN member_profiles p ON p.member_id = m.id WHERE m.plan IN (${ph}) AND m.verified = 1 LIMIT ${OPP.members}`).bind(...bp).all()).results || []; }
  catch (e) { rows = (await env.DB.prepare(`SELECT * FROM members WHERE plan IN (${ph}) AND verified = 1 LIMIT ${OPP.members}`).bind(...bp).all()).results || []; } // no 0007 table: members.products / sector only
  const out = [];
  for (const m of rows) { if (!planCan(m, "bassem", iso(nowMs))) continue; const s = memberSignals(m, jparse(m._profile || "{}", {})); if (s.any) out.push({ m, s }); }
  return out;
}
async function intelBatch(env, cur, nowMs) {
  const qs = new URLSearchParams({ sort: "seen", since: cur.c, kind: "tender_gov,tender_semi,tender_private,rfq,project", days: "365", per: String(OPP.perRun.intel), lang: "ar" });
  if (cur.id) qs.set("since_id", cur.id);
  const r = await intelFetch(env, "/api/intel/feed?" + qs.toString(), { method: "GET", headers: { Accept: "application/json" } }, 8000);
  if (!r || !r.j || !Array.isArray(r.j.items)) return { off: !!(r && r.off), error: r && r.error ? r.error : r && r.off ? "" : "bad_answer", rows: [] };
  /* oldest first; an answer that did not honour the cursor (an older migate-intel) is filtered and sorted here */
  const rows = r.j.items.filter(x => x && (String(x.first_seen_at || "") > cur.c || (String(x.first_seen_at || "") === cur.c && String(x.id) > cur.id)))
    .sort((a, b) => String(a.first_seen_at).localeCompare(String(b.first_seen_at)) || String(a.id).localeCompare(String(b.id)));
  return { rows: rows.map(x => ({ it: fromIntel(x, env), cursor: [String(x.first_seen_at || ""), String(x.id)] })) };
}
let PLAT_IDX = null;
const platIndex = () => PLAT_IDX || (PLAT_IDX = new Map(platformItems().map(it => [it.kind + "|" + it.id, it])));
async function platformBatch(env, cur) {
  const rows = (await env.DB.prepare("SELECT kind, item_id, first_seen_at FROM seen_items WHERE baseline = 0 AND kind IN ('tender', 'rfq') AND (first_seen_at > ? OR (first_seen_at = ? AND kind || '|' || item_id > ?)) ORDER BY first_seen_at, kind, item_id LIMIT ?")
    .bind(cur.c, cur.c, cur.id, OPP.perRun.platform).all()).results || [];
  return { rows: rows.map(r => ({ it: fromPlatform(platIndex().get(r.kind + "|" + r.item_id), r.first_seen_at, env), cursor: [r.first_seen_at, r.kind + "|" + r.item_id] })) };
}
async function webBatch(env, cur, bootIso) {
  const after = /^\d+$/.test(cur.c) ? cur.c : "";
  const sql = "SELECT id, url, title, snippet, site, type, official, aggregator, query, product, market, governorate, first_seen, last_seen, status, via FROM web_leads WHERE "
    + (after ? "id > ?" : "first_seen >= ?") + " ORDER BY id LIMIT ?";
  const rows = (await env.DB.prepare(sql).bind(after ? Number(after) : bootIso, OPP.perRun.web).all()).results || [];
  return { rows: rows.map(r => ({ it: fromWeb(r, env), cursor: [String(r.id), ""] })) };
}
const INSERT = "INSERT INTO opp_matches (member_id, item_key, source, score, reasons, missing, item_json, deadline, status, alerted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '', ?, ?) ON CONFLICT(member_id, item_key) DO NOTHING";

/* one cron step → {sources: {intel: {read, matched}, …}, written} | {skipped}. o.members (tests) replaces the members read. */
export async function oppCron(env, nowMs = Date.now(), o = {}) {
  if (!env || !env.DB) return { skipped: "no_db" };
  const g = o.gate || env; // the switches and the table memos are read on the request's own D1 (index.js passes the unbudgeted env)
  if (!(await featureOn(g, OPP.feature))) return { skipped: "feature_off" };
  if (!(await oppStoreOn(g))) return { skipped: "store_off" };
  const t = iso(nowMs), bootIso = iso(nowMs - OPP.bootDays * 864e5), out = { sources: {}, written: 0 };
  const members = o.members || (await eligibleMembers(env, nowMs));
  out.members = members.length;
  const cursors = await readCursors(env), writes = [], saves = [];
  const cap = Math.max(0, Math.min(OPP.writes, budgetLeft(env) - 40)); // reads + cursors + the alert step after it keep their share
  for (const source of SOURCES) {
    const s = out.sources[source] = { read: 0, matched: 0 };
    let cur = cursors[source] || { c: "", id: "" };
    if (source !== "web" && (!cur.c || cur.c < bootIso)) cur = { c: bootIso, id: "" };   // no pile of stale items after a long pause
    let batch;
    try {
      if (source === "intel") batch = await intelBatch(env, cur, nowMs);
      else if (source === "platform") batch = await platformBatch(env, cur);
      else {
        if (!(await leadsStoreOn(g)) || !(await featureOn(g, "web_leads_public"))) { s.skipped = "off"; continue; }
        batch = await webBatch(env, cur, bootIso);
      }
    } catch (e) { s.error = String((e && e.message) || e).slice(0, 80); continue; }
    if (batch.off) { s.skipped = "no_binding"; continue; }
    if (batch.error) { s.error = batch.error; continue; }
    let last = null;
    for (const { it, cursor } of batch.rows) {
      const rows = [];
      if (it) {
        const is = itemSignals(it), card = JSON.stringify(cardOf(it, is));
        for (const { m, s: ms } of members) {
          const r = matchScore(ms, is, it, m, nowMs); if (!r) continue;
          const st = env.DB.prepare(INSERT).bind(m.id, it.key, source, r.score, JSON.stringify(r.reasons), JSON.stringify(r.missing), card, is.deadline, t, t);
          st.score = r.score; rows.push(st);
        }
      }
      if (writes.length + rows.length > cap && (writes.length || last || !cap)) { s.stopped = "write_cap"; break; } // the next run goes on from here
      if (rows.length > cap) { rows.sort((a, b) => b.score - a.score); rows.length = cap; s.capped = true; } // one item alone: its best members
      writes.push(...rows); s.read++; s.matched += rows.length; last = cursor;
    }
    if (last) saves.push(saveCursor(env, source, last[0], last[1], t));
  }
  for (let i = 0; i < writes.length; i += 50) await env.DB.batch(writes.slice(i, i + 50));
  if (saves.length) await env.DB.batch(saves);
  out.written = writes.length;
  return out;
}

/* ---------------- reading the rows ---------------- */
const daysLeft = (d, today) => (d ? Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5) : null);
const textOf = (o, en) => String((o && (en ? o.en : o.ar)) || "");
/* one stored row → the member's card in his language (never src) */
export function cardOut(r, lang, nowMs = Date.now()) {
  const en = lang === "en", c = jparse(r.item_json, {}), today = cairoDay(nowMs), d = dayOf(r.deadline || c.deadline);
  const kn = KIND_NAME[c.kind] || [c.kind || "", c.kind || ""], mk = REGION_NAME[c.market] || REGION_NAME.intl;
  return { key: r.item_key, source: r.source, kind: c.kind || "", kind_label: kn[en ? 1 : 0], title: (en && c.title_en) || c.title || "", ...(c.entity ? { entity: c.entity } : {}),
    market: en ? mk[1] : c.market_ar || mk[0], deadline: d, days_left: daysLeft(d, today), expired: !!(d && d < today), score: Number(r.score) || 0,
    reasons: jparse(r.reasons, []).map(x => ({ code: x.code, text: textOf(x, en), ...(x.pts ? { pts: x.pts } : {}) })), missing: jparse(r.missing, []).map(x => ({ code: x.code, text: textOf(x, en) })),
    status: r.status, ...(c.link ? { link: c.link } : {}), ...(c.notice ? { notice_link: c.notice } : {}), created_at: r.created_at };
}
/* web leads the data team rejected / hid after the match: never shown (web-public.js: only new / accepted rows are published) */
async function dropHiddenWeb(env, rows) {
  const ids = rows.filter(r => r.source === "web").map(r => Number(String(r.item_key).slice(4))).filter(n => n > 0);
  if (!ids.length) return rows;
  let ok;
  try { ok = new Set(((await env.DB.prepare(`SELECT id FROM web_leads WHERE id IN (${ids.map(() => "?").join(", ")}) AND status IN ('new', 'accepted')`).bind(...ids).all()).results || []).map(r => "web:" + r.id)); }
  catch (e) { ok = new Set(); }
  return rows.filter(r => r.source !== "web" || ok.has(r.item_key));
}
/* active = not dismissed, deadline not passed (or unknown) */
const ACTIVE = "(deadline = '' OR deadline >= ?)";
export async function listFor(env, memberId, { status = "active", limit = OPP.list, lang = "ar", nowMs = Date.now() } = {}) {
  const today = cairoDay(nowMs), n = Math.min(Math.max(parseInt(limit, 10) || OPP.list, 1), OPP.listMax);
  let where = "member_id = ?", args = [memberId];
  if (status === "active") { where += " AND status IN ('new', 'seen', 'saved') AND " + ACTIVE; args.push(today); }
  else if (status === "saved" || status === "dismissed") { where += " AND status = ?"; args.push(status); }
  else { where += " AND status = ? AND " + ACTIVE; args.push(status, today); }
  const rows = (await env.DB.prepare(`SELECT * FROM opp_matches WHERE ${where} ORDER BY score DESC, id DESC LIMIT ?`).bind(...args, n + 10).all()).results || [];
  const shown = (await dropHiddenWeb(env, rows)).slice(0, n);
  const cnt = (await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM opp_matches WHERE member_id = ? AND (status IN ('saved', 'dismissed') OR ${ACTIVE}) GROUP BY status`).bind(memberId, today).all()).results || [];
  const counts = { new: 0, seen: 0, saved: 0, dismissed: 0 }; for (const c of cnt) if (c.status in counts) counts[c.status] = c.n;
  return { items: shown.map(r => cardOut(r, lang, nowMs)), counts };
}

/* ---------------- the member API ---------------- */
export const alertMin = env => { const v = parseInt(env && env.OPP_ALERT_MIN, 10); return v >= OPP.storeMin && v <= 100 ? v : OPP.alertMin; };
export const alertMax = env => { const v = parseInt(env && env.OPP_ALERT_MAX, 10); return v >= 1 && v <= 10 ? v : OPP.alertMax; };
const KEY_RX = /^(?:intel:[0-9a-z]{4,64}|web:\d{1,12}|platform:(?:tender|rfq):[\w.:-]{1,80})$/;
export async function handleMeOpps(req, env, ctx) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  try {
    if (!env.DB) return err(503, "store_off", "store not configured");
    const M = req.method; if (M !== "GET" && M !== "POST") return err(405, "method", "method not allowed");
    const me = await authUser(req, env);
    if (!me) return err(401, "unauthorized", "sign in required");
    if (!planCan(me, "bassem")) return err(403, "plan", "الخدمة دي لباقات الشركاء اللي فيها باسم / This service is for the partner plans with Bassem");
    if (!(await featureOn(env, OPP.feature))) return err(503, "feature_off", offMessage(OPP.feature));
    if (!(await oppStoreOn(env))) return err(503, "opp_matches_off", "المطابقة التلقائية لسه مش متفعّلة (ملف 0016) / opportunity matching is not set up yet (migration 0016)");
    const url = new URL(req.url);
    if (M === "GET") {
      const st = url.searchParams.get("status") || "active";
      if (st !== "active" && !STATUSES.includes(st)) return err(400, "invalid_status", "status: active | new | seen | saved | dismissed");
      const r = await listFor(env, me.id, { status: st, limit: url.searchParams.get("limit"), lang: url.searchParams.get("lang") === "en" ? "en" : "ar" });
      return json({ ...r, alert_min: alertMin(env) });
    }
    const b = await readJson(req, 8 * 1024);
    const be = bodyErr(b); if (be) return be;
    const status = String(b.status || "");
    if (!["seen", "dismissed", "saved"].includes(status)) return err(400, "invalid_status", "status: seen | dismissed | saved");
    const keys = [...new Set((Array.isArray(b.keys) ? b.keys : b.key !== undefined ? [b.key] : []).map(k => String(k == null ? "" : k).trim()))];
    if (!keys.length || keys.length > OPP.keysMax || !keys.every(k => KEY_RX.test(k))) return err(400, "invalid_key", "key (or keys: 1-" + OPP.keysMax + ") of your own opportunities");
    if (!(await rateOk(env, "opps|" + me.id, 120, 600))) return err(429, "rate_limited", "too many changes — try again in a few minutes", { retry_after: 600 });
    /* only his own rows (member_id from the session); «seen» never takes back a «saved» or «dismissed» choice */
    const guard = status === "seen" ? " AND status = 'new'" : "";
    const r = await env.DB.prepare(`UPDATE opp_matches SET status = ?, updated_at = ? WHERE member_id = ? AND item_key IN (${keys.map(() => "?").join(", ")})${guard}`).bind(status, now(), me.id, ...keys).run();
    return json({ ok: true, changed: Number((r && r.meta && r.meta.changes) || 0) });
  } catch (e) {
    console.error("opps error", (e && e.message) || "error");
    return err(500, "server", "server error");
  }
}

/* ---------------- Bassem: the top unseen matches (janna-session.js bassemContext) ----------------
   → [{title, kind, deadline, score}] (≤ n, status new, active, web leads still published) or [] — never a link, a source or an entity's contact */
export async function topUnseen(env, memberId, n = 3, nowMs = Date.now()) {
  try {
    /* the switch from the memo ccBoot loaded for this request (featureSync: no extra read on the session path; before a load = OFF) */
    if (!env || !env.DB || !memberId || !featureSync(env, OPP.feature) || !(await oppStoreOn(env))) return [];
    const rows = (await env.DB.prepare(`SELECT * FROM opp_matches WHERE member_id = ? AND status = 'new' AND ${ACTIVE} ORDER BY score DESC, id DESC LIMIT ?`).bind(String(memberId), cairoDay(nowMs), n + 5).all()).results || [];
    const out = [];
    for (const r of await dropHiddenWeb(env, rows)) {
      const c = jparse(r.item_json, {}), title = forLLM(c.title || "", 120);
      if (!title || instructionLike(title, { money: false })) continue;
      out.push({ title, kind: c.kind || "", deadline: dayOf(r.deadline), score: Number(r.score) || 0 });
      if (out.length >= n) break;
    }
    return out;
  } catch (e) { return []; }
}

/* ---------------- the daily alert ----------------
   From the digest time, each member's new matches ≥ alertMin never alerted before, at most alertMax a day (the rest wait for the next
   day; an expired one is never sent): one notification (kind opp_match, ref oppm:<day>) + one e-mail (template opp_matches). A member
   done today is marked in cron_runs (job «oppm:<member id>», the Cairo day) BEFORE anything is sent, also when nothing is (no plan,
   paused, every row hidden), so he is never read twice that day. ≤ OPP.alertMembers members per run, the rest on the next run. */
const fmtAr = c => "• " + c.title + " — " + c.kind_label + (c.entity ? " — " + c.entity : "") + " (" + c.market + ")" + (c.deadline ? " · آخر موعد " + c.deadline : "")
  + " · درجة المطابقة " + c.score + "/100\n  ليه مناسبة: " + c.reasons.map(x => x.text).join("، ") + (c.missing.length ? "\n  ناقص: " + c.missing.map(x => x.text).join("، ") : "")
  + (c.link ? "\n  " + c.link : "") + (c.notice_link ? "\n  الإعلان الرسمي: " + c.notice_link : "");
const fmtEn = c => "• " + c.title + " — " + c.kind_label + (c.entity ? " — " + c.entity : "") + " (" + c.market + ")" + (c.deadline ? " · deadline " + c.deadline : "")
  + " · match " + c.score + "/100\n  Why: " + c.reasons.map(x => x.text).join("; ") + (c.missing.length ? "\n  Missing: " + c.missing.map(x => x.text).join("; ") : "")
  + (c.link ? "\n  " + c.link : "") + (c.notice_link ? "\n  Official notice: " + c.notice_link : "");
export async function oppAlerts(env, nowMs = Date.now(), o = {}) {
  if (!env || !env.DB) return { skipped: "no_db" };
  if (cairoHM(nowMs) < (env.DIGEST_TIME || "07:00")) return { skipped: "before_digest_time" };
  const g = o.gate || env;
  if (!(await featureOn(g, OPP.feature))) return { skipped: "feature_off" };
  if (!(await featureOn(g, "daily_digest"))) return { skipped: "daily_digest_off" };
  if (!(await oppStoreOn(g))) return { skipped: "store_off" };
  const day = cairoDay(nowMs), min = alertMin(env), max = alertMax(env), ref = "oppm:" + day, out = { members: 0, alerted: 0, mailed: 0 };
  const ids = ((await env.DB.prepare(`SELECT DISTINCT member_id FROM opp_matches WHERE status = 'new' AND alerted_at = '' AND score >= ? AND ${ACTIVE}
    AND 'oppm:' || member_id NOT IN (SELECT job FROM cron_runs WHERE day = ? AND job LIKE 'oppm:%') LIMIT ${OPP.alertMembers}`).bind(min, day, day).all()).results || []).map(r => r.member_id);
  for (const id of ids) {
    if (budgetLeft(env) < 12) { out.stopped = "budget"; break; }                     // the next run goes on
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
    const t = iso(nowMs), p = prefsOf(m);
    const rows = m && planCan(m, "bassem", t) ? (await env.DB.prepare(`SELECT * FROM opp_matches WHERE member_id = ? AND status = 'new' AND alerted_at = '' AND score >= ? AND ${ACTIVE} ORDER BY score DESC, id DESC LIMIT ?`).bind(id, min, day, max + 5).all()).results || [] : [];
    const pick = (await dropHiddenWeb(env, rows)).slice(0, max);
    const claimed = await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES (?, ?, ?) ON CONFLICT(job, day) DO NOTHING").bind("oppm:" + id, day, t).run();
    if (!(claimed && claimed.meta && claimed.meta.changes)) continue;                   // another run took him today
    out.members++;
    if (!pick.length || p.pause) continue;
    const ar = pick.map(r => cardOut(r, "ar", nowMs)), en = pick.map(r => cardOut(r, "en", nowMs));
    await notify(env, id, { kind: "opp_match", title: pick.length === 1 ? "فرصة جديدة مناسبة لمصنعك" : pick.length + " فرص جديدة مناسبة لمصنعك", title_en: pick.length === 1 ? "A new opportunity that fits your factory" : pick.length + " new opportunities that fit your factory",
      body: ar.map(c => line(c.title, 90)).join(" · "), body_en: en.map(c => line(c.title, 90)).join(" · "), url: "dashboard.html", ref });
    await env.DB.batch(pick.map(r => env.DB.prepare("UPDATE opp_matches SET alerted_at = ? WHERE id = ?").bind(t, r.id)));
    out.alerted += pick.length;
    if (m.email && m.email_verified_at && p.email_digest) {
      const r = await mail(env, { id: `oppm-${id}-${day}`, to: m.email, list: "digest", subject: `فرص جديدة مناسبة لمصنعك (${pick.length}) / New opportunities for your factory`,
        ar: `صباح الخير${m.name ? " " + line(m.name, 60) : ""}،\nدي فرص جديدة وصلت المنصة والمطابقة التلقائية لقتها مناسبة لملف مصنعك (الدرجة من 100 محسوبة من منتجاتك وقطاعك وأسواقك وشهاداتك وآخر ميعاد):\n\n${ar.map(fmtAr).join("\n\n")}`,
        en: `Good morning,\nThese new opportunities reached the platform and the automatic matching found them fitting your factory profile (the score out of 100 comes from your products, sector, markets, certificates and the deadline):\n\n${en.map(fmtEn).join("\n\n")}`,
        why: "وصلتك لأن باقتك فيها باسم والمطابقة التلقائية لقت فرص مناسبة لملف مصنعك / You receive this because your plan includes Bassem and the automatic matching found opportunities that fit your factory profile." });
      if (r && r.sent) out.mailed++;
    }
  }
  return out;
}

/* ---------------- account deletion (acc-members.js deleteMember) ---------------- */
export async function eraseStmts(env, memberId) {
  if (!(await oppStoreOn(env))) return [];
  return [env.DB.prepare("DELETE FROM opp_matches WHERE member_id = ?").bind(memberId)];
}
