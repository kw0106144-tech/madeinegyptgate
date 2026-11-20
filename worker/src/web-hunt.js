/* The opportunity HUNT (owner 2026-11-20: «هو المفروض يبحثوا له على عملاء ويوجدوا له مناقصات ويوجدوا له فرص توريد. ده مصنع بيكلمهم، لو مش
   موجود حتى على المنصه هم يجيبوا له، يعني يجيبوا من بره»; spec «web hunter» + its review): for a SELLER (a factory, supplier or service,
   registered on the platform or not) several web searches at once for NEW public tenders, buyers' RFQs, companies whose industry uses the
   product, and new plants / expansions that will need it — after the platform's own data, which the persona says first.
     POST /api/janna/hunt    Janna (AR + EN, one Anam tool record "janna_web_hunt"), switch janna_web_search, X-MIG-Tool = Janna's secret
     POST /api/advisor/hunt  Bassem ("bassem_web_hunt"), switch bassem_web_search, X-MIG-Tool = Bassem's secret
       body {product (alias query / q): the seller's words, 1–3 names; product_en?: the English trade name; buyer_industries?: ≤ 3
             industries whose plants buy it («ورق، كرتون، سكر»); market?: eg (default) | a country | gulf | arab | africa | asia | europe |
             world; governorate?: an Egyptian governorate; intents?: tenders, rfq, buyers, projects (default all four); service?: the seller
             offers a service (detected from «صيانة / كسوة / تجليخ …» too); lang?: ar | en — the language the persona SPEAKS (both)}
       200  {count, counts: {tender, rfq, buyer, buyer_list, project, news}, results: [{type, title, url, snippet ≤ 140, source, date,
             official?, aggregator?}] grouped by type, text, query, market, queries, sent, cached, partial, origin: "web", note, hint?,
             ambiguous?}
       errors: HTTP 200 soft errors exactly like websearch.js (product_required, product_ambiguous, …); 401 wrong / missing X-MIG-Tool,
             405 wrong method.
   How (deterministic, never an LLM): the query PLAN (planHunt: 3–6 templates by intent and market — Arabic first for Arab markets, English
   first elsewhere; a service swaps «توريد» for «صيانة», review S4) → the 1-hour cache (memory, then KV, read in parallel) → ONE round of
   counter reservations for the misses (websearch.js reserveUnits: the global cap, Janna's share and hour, the bursts; what is not granted
   is given back) → the granted queries in parallel under ONE deadline of HUNT_MS (Brave one at a time — review S10; a slow or refused query
   is skipped: partial) → the same result hygiene as a search (cleanResults) → classify + relevance (web-classify.js: competitors, job ads,
   awards, other meanings of the product's words dropped) → the team's rejections (web-leads.js rejectedOf) → de-duplication, score, ≤ 6
   results (≤ 2 per site, per-type caps, news only fills what is left) → the spoken text (≤ 3 sentences, counts by type, site names from
   the hosts, never a link / contact / «موثّق», always «من الإنترنت … لازم نتأكد منها ومن مواعيدها من المصدر»). After the answer
   (ctx.waitUntil): the cache puts, the leads of the provider answers (web-leads.js), the give-back. One log line of numbers per hunt.
   Cost: 1 cap unit per provider query sent (≤ 6 a hunt; cached queries free). An ambiguous product word («سلندرات» alone) is a question,
   not a search: product_ambiguous costs nothing (with buyer industries the buyers / projects part still runs). */
import DATA from "./data.json";
import { safeEq, cairoDay, GOV_CODES, toolSoftError } from "./common.js";
import { norm, instructionLike, EN as EN_AR } from "./text.js";
import { webSearchConfig } from "./service-keys.js";
import { featureOn } from "./flags.js";
import { WS_HEADER, WS_MAX_BODY, WS_NOTE, WS_MARKETS, voiceOf, isEn, soft, refusal, out, argsOf, queryHygiene, marketOf, runProvider, cleanResults, cacheKey, cacheGet, cachePut,
  reserveUnits, giveBack, sayable, sitesOf, fromAr, fromEn, plain } from "./websearch.js";
import { productNeed, industryNeed, classify, relevant, namedIn, canonUrl, bareHost, SERVICE_RX } from "./web-classify.js";
import { recordLeads, rejectedOf, leadHash, productKey } from "./web-leads.js";

export const HUNT_MS = 4500, HUNT_MAX = 6, HUNT_RESULTS = 6, HUNT_PER_SITE = 2, HUNT_SNIPPET = 140, HUNT_REJECT_MS = 4000;
export const INTENTS = Object.freeze(["tenders", "rfq", "buyers", "projects"]);
const INTENT_ALIAS = { tender: "tenders", tenders: "tenders", rfq: "rfq", rfqs: "rfq", buyer: "buyers", buyers: "buyers", customer: "buyers", customers: "buyers", client: "buyers", clients: "buyers",
  project: "projects", projects: "projects", "مناقصات": "tenders", "مناقصة": "tenders", "مناقصه": "tenders", "طلبات أسعار": "rfq", "طلبات اسعار": "rfq", "طلب عرض سعر": "rfq", "عملاء": "buyers",
  "مشترين": "buyers", "مشاريع": "projects", "مشروعات": "projects" };
const ARAB = new Set(["eg", "sa", "ae", "kw", "qa", "om", "bh", "jo", "iq", "ly", "sd", "ma", "dz", "tn", "gulf", "arab"]);
const GULF_RFQ = new Set(["gulf", "sa", "ae", "kw", "qa", "om", "bh", "jo", "iq"]); // «استدراج عروض» is the Gulf / Levant word
/* provider calls at once (Brave's free tier answers about one request a second — review S10; Tavily / Serper take a whole hunt) */
export const PROVIDER_CONCURRENCY = Object.freeze({ tavily: 6, serper: 6, brave: 1 });
const TYPE_ORDER = ["tender", "rfq", "buyer", "buyer_list", "project", "news"];
const TYPE_CAP = { tender: 3, rfq: 3, buyer: 3, buyer_list: 2, project: 2, news: 2 };
const TYPE_OF_INTENT = { tenders: ["tender"], rfq: ["rfq"], buyers: ["buyer", "buyer_list"], projects: ["project"] };
const ARABIC = /[؀-ۿ]/;
const letters = s => (String(s || "").match(/[\p{L}\p{N}]/gu) || []).length;
const T = (...xs) => xs.filter(x => x != null && String(x).trim()).join(" ").replace(/\s+/g, " ").trim();

/* ---------- arguments ---------- */
const GOVS = Object.values(GOV_CODES); // [ar, en] × 27
function govOf(v) {
  const s = String(v == null ? "" : v).trim().slice(0, 40); if (!s) return null;
  const n = norm(s), en = EN_AR[s.toLowerCase()] ? norm(EN_AR[s.toLowerCase()]) : "";
  const g = GOVS.find(([ar, e]) => norm(ar) === n || norm(ar).replace(/^ال/, "") === n.replace(/^ال/, "") || e.toLowerCase() === s.toLowerCase() || (en && norm(ar) === en));
  return g ? { ar: g[0], en: g[1] } : null;
}
const WORLD = /^(world|intl|international|global|any|all|العالم|دولي|دولية)$/i;
/* the body → the hunt's arguments, or {error} */
export function parseHunt(a) {
  a = a && typeof a === "object" ? a : {};
  const raw = typeof a.product === "string" ? a.product : typeof a.query === "string" ? a.query : typeof a.q === "string" ? a.q : "";
  const h = queryHygiene(raw, 120);
  if (letters(h.q) < 2) return { error: h.hadUrl ? "url_not_allowed" : h.hadPII ? "pii_not_allowed" : h.hadPerson ? "person_not_allowed" : "product_required" };
  if (instructionLike(h.q, { money: false })) return { error: "product_required" }; // nit 14: never echoed
  const pe = typeof a.product_en === "string" ? queryHygiene(a.product_en, 80).q : "";
  const indRaw = typeof a.buyer_industries === "string" ? a.buyer_industries : Array.isArray(a.buyer_industries) ? a.buyer_industries.filter(x => typeof x === "string").join("، ") : "";
  const ind = queryHygiene(indRaw, 120).q;
  const mk = String(a.market == null ? "" : a.market).trim();
  const world = WORLD.test(mk), market = !mk ? WS_MARKETS.eg : world ? null : marketOf(mk);
  const list = Array.isArray(a.intents) ? a.intents : typeof a.intents === "string" ? a.intents.split(/[,،;]+/) : [];
  const intents = [...new Set(list.map(x => INTENT_ALIAS[String(x || "").trim().toLowerCase()] || "").filter(Boolean))];
  const gov = market && market.code === "eg" ? govOf(a.governorate) : null;
  return { product: h.q, product_en: instructionLike(pe, { money: false }) ? "" : pe, industries: instructionLike(ind, { money: false }) ? "" : ind, market, world: !market,
    unknown_market: !!(mk && !market && !world), gov, intents, service: a.service === true || a.service === "true", lang: String(a.lang || "").toLowerCase() === "en" ? "en" : "ar" };
}

/* ---------- the query plan (deterministic; nit 6: per intent T1, T1e, T2, T2e for an Arab market) ----------
   → [{intent, q, text, lang, fresh, vertical, market, kind, prio}] (3–6; fewer only when the templates run out) */
export function planHunt(h, need, inds, nowMs = Date.now()) {
  const Y = cairoDay(nowMs).slice(0, 4), mk = h.market, code = mk ? mk.code : "", arab = !!mk && ARAB.has(code);
  const WA = mk ? mk.ar : "", WE = mk ? mk.en : "", G = code === "eg" && h.gov ? h.gov.ar : "";
  const P = need.ar, PE = need.en, O = need.obj || need.ar, OE = need.objEn || need.en, svc = need.service;
  /* a service (review S4): the service words replace «توريد» — the product's own («كسوة سلندرات»), else «صيانة» */
  const SP = svc && P && !SERVICE_RX.test(" " + norm(P) + " ") ? "صيانة " + P : P, SPE = svc && PE && !SERVICE_RX.test(" " + norm(PE) + " ") ? "maintenance " + PE : PE;
  const U = inds.map(x => x.ar).filter(Boolean), UE = inds.map(x => x.en).filter(Boolean);
  const inW = (where, ...xs) => (where ? T(...xs, "في", where) : T(...xs));
  const ar = {
    tenders: P ? [svc ? T("مناقصة", SP, WA, Y) : T("مناقصة توريد", P, WA, Y),
      code === "eg" ? (svc ? T("ممارسة صيانة", O, Y) : T("ممارسة توريد", P, Y)) : code === "sa" ? (svc ? T("منافسة صيانة", O, WA) : T("منافسة توريد", P, WA)) : (svc ? T("مناقصات صيانة", O, WA) : T("مناقصات", P, WA))] : [],
    rfq: P ? [svc ? T("مطلوب", SP, WA) : T("مطلوب توريد", P, WA), GULF_RFQ.has(code) ? T("استدراج عروض", SP) : T("طلب عروض أسعار", SP)] : [],
    buyers: U.length ? U.map((u, i) => inW(i === 0 && G ? G : WA, "مصانع", u)) : !svc && P ? [T("مستوردين", P, WA), T("موزعين", P, WA)] : [],
    projects: U.length ? [T("مصنع", U[0], "جديد", WA, Y), T("توسعات مصنع", U[0], WA)] : [],
  };
  const en = {
    tenders: PE ? [svc ? T("tender", SPE, WE, Y) : T("tender supply of", PE, WE, Y), svc ? T(OE, "maintenance tender", WE) : T(PE, "tender notice", WE)] : [],
    rfq: PE ? [T("RFQ", SPE, WE), svc ? T("request for quotation", SPE, WE) : T("buying request", PE)] : [],
    buyers: UE.length ? UE.map(u => T(u, "manufacturers", WE)) : !svc && PE ? [T(PE, "importers", WE), T(PE, "distributors", WE)] : [],
    projects: UE.length ? [T("new", UE[0], "plant", WE, Y), T(UE[0], "factory expansion", WE)] : [],
  };
  /* candidates per intent in language order: an Arab market interleaves Arabic and English (buyers: the industries first, then the
     languages — a second industry is worth more than the same one in English); elsewhere English, Arabic only without an English name */
  const order = i => {
    if (arab) return i === "buyers" ? [...ar[i], ...en[i]] : [ar[i][0], en[i][0], ar[i][1], en[i][1]].filter(Boolean);
    return en[i].length ? [...en[i]] : [...ar[i]];
  };
  const want = h.intents && h.intents.length ? h.intents : INTENTS;
  const lists = Object.fromEntries(INTENTS.map(i => [i, want.includes(i) ? order(i) : []]));
  const taken = [], seen = new Set();
  const take = i => { while (lists[i].length) { const q = lists[i].shift(), k = norm(q); if (!q || seen.has(k) || q.length > 200) continue; seen.add(k); taken.push({ intent: i, q }); return true; } return false; };
  for (const i of ["tenders", "rfq", "buyers", "projects"]) if (taken.length < HUNT_MAX) take(i);
  for (let more = true; more && taken.length < HUNT_MAX;) { more = false; for (const i of ["tenders", "buyers", "rfq", "projects"]) { if (taken.length >= HUNT_MAX) break; if (take(i)) more = true; } }
  return taken.map((x, prio) => ({ intent: x.intent, q: x.q, text: x.q, lang: ARABIC.test(x.q) ? "ar" : "en", fresh: x.intent === "projects" ? "year" : x.intent === "buyers" ? "" : "month",
    vertical: x.intent === "projects" ? "news" : "web", market: mk, kind: "h:" + x.intent, prio }));
}

/* ---------- ranking ---------- */
function ageDays(d, nowMs) {
  const s = String(d || "");
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s); if (m) return (nowMs - Date.parse(m[1] + "T12:00:00Z")) / 864e5;
  const r = /(\d+)\s*(minute|hour|day|week|month|year|دقيق|ساع|يوم|أيام|ايام|اسبوع|أسبوع|شهر|سن)/i.exec(s); if (!r) return Infinity;
  const n = +r[1], u = r[2].toLowerCase();
  return /minute|hour|دقيق|ساع/.test(u) ? 0 : /day|يوم|أيام|ايام/.test(u) ? n : /week|اسبوع|أسبوع/.test(u) ? n * 7 : /month|شهر/.test(u) ? n * 30 : n * 365;
}
export function scoreOf(r, c, q, need, inds, nowMs) {
  const age = ageDays(r.date, nowMs);
  return (TYPE_OF_INTENT[q.intent].includes(c.type) ? 3 : 0) + (c.official ? 2 : 0) + (namedIn(r.title, need, inds) ? 2 : namedIn(r.snippet, need, inds) ? 1 : 0)
    + ((c.type === "tender" || c.type === "rfq") && age <= 45 ? 1 : c.type === "project" && age <= 365 ? 1 : 0) - (c.type === "news" ? 1 : 0) - (c.aggregator ? 1 : 0) - (c.type === "buyer_list" ? 1 : 0);
}
/* the Information Center's own items (their source links): never said twice — once as the platform's, once «من الإنترنت» (nit 12) */
let OWN = null;
const ownLinks = () => { if (!OWN) { OWN = new Set(); for (const x of DATA.i || []) if (x && typeof x[10] === "string" && /^https?:/i.test(x[10])) OWN.add(canonUrl(x[10])); } return OWN; };
/* de-duplicate (the same canonical link; the same site + title; the same long title on another site = syndication), then pick ≤ max:
   ≤ 2 per site, per-type caps, round robin by type (tender, rfq, buyer, buyer_list, project), news only fills what is left */
export function pickResults(cands, max = HUNT_RESULTS) {
  const sorted = [...cands].sort((a, b) => b.score - a.score || a.q.prio - b.q.prio || a.rank - b.rank);
  const seenU = new Set(), seenT = new Set(), seenL = new Set(), kept = [];
  for (const x of sorted) {
    const cu = canonUrl(x.r.url), host = bareHost(new URL(x.r.url).hostname), nt = norm(x.r.title), long = Array.from(nt.replace(/\s/g, "")).length >= 25;
    if (!cu || seenU.has(cu) || seenT.has(host + "|" + nt) || (long && seenL.has(nt)) || ownLinks().has(cu)) continue;
    seenU.add(cu); seenT.add(host + "|" + nt); if (long) seenL.add(nt);
    kept.push({ ...x, host });
  }
  const queues = Object.fromEntries(TYPE_ORDER.map(t => [t, kept.filter(x => x.c.type === t)]));
  const out = [], perSite = new Map(), perType = new Map();
  const ok = x => (perSite.get(x.host) || 0) < HUNT_PER_SITE && (perType.get(x.c.type) || 0) < TYPE_CAP[x.c.type];
  const add = x => { out.push(x); perSite.set(x.host, (perSite.get(x.host) || 0) + 1); perType.set(x.c.type, (perType.get(x.c.type) || 0) + 1); };
  for (const pass of [TYPE_ORDER.slice(0, 5), ["news"]]) {
    for (let more = true; more && out.length < max;) {
      more = false;
      for (const t of pass) { if (out.length >= max) break; const q = queues[t]; while (q.length) { const x = q.shift(); if (ok(x)) { add(x); more = true; break; } } }
    }
  }
  return out.sort((a, b) => TYPE_ORDER.indexOf(a.c.type) - TYPE_ORDER.indexOf(b.c.type) || b.score - a.score);
}

/* ---------- the spoken text (≤ 3 sentences, no links; Arabic voices share it, «لقيت / مالقيتش» are the same for Janna and Bassem) ---------- */
const NOUN_AR = { tender: n => (n === 1 ? "مناقصة واحدة" : n === 2 ? "مناقصتين" : n + " مناقصات"), rfq: n => (n === 1 ? "طلب عرض سعر واحد" : n === 2 ? "طلبين عروض أسعار" : n + " طلبات عروض أسعار"),
  buyer: n => (n === 1 ? "شركة واحدة ممكن تبقى عميل" : n === 2 ? "شركتين ممكن يبقوا عملاء" : n + " شركات ممكن تبقى عملاء"),
  buyer_list: n => (n === 1 ? "صفحة واحدة فيها مصانع ممكن تبقى عملاء" : n === 2 ? "صفحتين فيهم مصانع ممكن تبقى عملاء" : n + " صفحات فيها مصانع ممكن تبقى عملاء"),
  project: n => (n === 1 ? "مشروع جديد واحد" : n === 2 ? "مشروعين جداد" : n + " مشاريع جديدة"), news: n => (n === 1 ? "خبر واحد" : n === 2 ? "خبرين" : n + " أخبار") };
const NOUN_EN = { tender: n => (n === 1 ? "1 tender" : n + " tenders"), rfq: n => (n === 1 ? "1 RFQ" : n + " RFQs"),
  buyer: n => (n === 1 ? "1 company that could become a customer" : n + " companies that could become customers"),
  buyer_list: n => (n === 1 ? "1 page listing plants that could become customers" : n + " pages listing plants that could become customers"),
  project: n => (n === 1 ? "1 new project" : n + " new projects"), news: n => (n === 1 ? "1 news item" : n + " news items") };
const NONE_AR = { tenders: "مناقصات", rfq: "طلبات أسعار", buyers: "عملاء جداد", projects: "مشاريع جديدة" }, NONE_EN = { tenders: "tenders", rfq: "RFQs", buyers: "buyers", projects: "projects" };
export const HUNT_DISCLAIMER = "دي معلومات من مواقع على الإنترنت، مش من بيانات المنصة، فلازم نتأكد منها ومن مواعيدها من المصدر.";
export const HUNT_DISCLAIMER_EN = "This comes from websites, not from the platform's data, so it has to be checked — dates too — at the source.";
const joinAr = l => (l.length <= 1 ? l[0] || "" : l.slice(0, -1).join(" و") + " و" + l[l.length - 1]);
const joinEn = (l, w = "and") => (l.length <= 1 ? l[0] || "" : l.slice(0, -1).join(", ") + " " + w + " " + l[l.length - 1]);
export function huntText(picked, h, need, voice, asked) {
  const counts = {}; for (const x of picked) counts[x.c.type] = (counts[x.c.type] || 0) + 1;
  const types = TYPE_ORDER.filter(t => counts[t]), off = picked.filter(x => x.c.official).length, { shown, more } = sitesOf(picked.map(x => x.r));
  const want = (asked && asked.length ? asked : INTENTS);
  if (isEn(voice)) {
    const name = need.en && !ARABIC.test(need.en) ? `“${sayable(need.en, 40)}”` : "your product", where = h.gov ? " in " + h.gov.en : h.market ? " in " + h.market.en : "";
    if (!picked.length) return `I found no new ${joinEn(want.map(i => NONE_EN[i]), "or")} on the web for ${name}${where} right now.`;
    return `I found on the web ${joinEn(types.map(t => NOUN_EN[t](counts[t])))} for ${name}${where}${fromEn(shown, more)}. `
      + (off ? (off === 1 ? "One of them is on an official tender portal. " : off + " of them are on official tender portals. ") : "") + HUNT_DISCLAIMER_EN;
  }
  const name = sayable(h.product, 40) || "منتجك", where = h.gov ? " في " + h.gov.ar : h.market ? " في " + h.market.ar : "";
  if (!picked.length) return `مالقيتش على الإنترنت دلوقتي ${want.map(i => NONE_AR[i]).join(" أو ")} لـ «${name}»${where}.`;
  return `لقيت على الإنترنت ${joinAr(types.map(t => NOUN_AR[t](counts[t])))} لـ «${name}»${where}${shown.length ? "،" + fromAr(shown, more) : ""}. `
    + (off ? (off === 1 ? "واحدة منها على بوابة مناقصات رسمية. " : `منها ${off} على بوابات مناقصات رسمية. `) : "") + HUNT_DISCLAIMER;
}
/* an ambiguous product word: ONE question first (review S1 / S11) */
export function ambiguousText(amb, voice) {
  if (isEn(voice)) return "That product word can mean more than one thing; which one do you mean, so I search for the right thing (the English trade name helps too)?";
  return `كلمة «${sayable(amb.word, 30)}» ليها أكتر من معنى (${amb.note})، قصدك أنهي واحدة علشان أدوّر صح؟`;
}

/* ---------- running it ---------- */
async function pool(items, n, fn) { const q = [...items], run = async () => { while (q.length) await fn(q.shift()); }; await Promise.all(Array.from({ length: Math.max(1, Math.min(n, q.length)) }, run)); }
/* → the answer body, or {error, reason} (a refusal of the counters / the provider / the arguments) */
export async function runHunt(env, cfg, h, { who = "bassem", voice = "bassem", nowMs = Date.now(), ctx = null } = {}) {
  const t0 = Date.now(), deadline = t0 + HUNT_MS, wait = p => { if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else p.catch(() => null); };
  const need = productNeed(h.product, h.product_en, { service: h.service }), inds = industryNeed(h.industries);
  if (need.empty) return { error: "product_required" };
  const hints = [];
  let intents = h.intents.length ? h.intents : [...INTENTS], ambiguous = null;
  if (need.amb) { ambiguous = need.amb; intents = inds.length ? intents.filter(i => i === "buyers" || i === "projects") : []; if (!intents.length) return { error: "product_ambiguous", ambiguous }; }
  const plan = planHunt({ ...h, intents }, need, inds, nowMs);
  if (!plan.length) return { error: "industries_required" }; // a service without industries, asked only for buyers / projects: nothing to search
  if (!need.en) hints.push("call again with product_en (the usual English trade name) to search English and foreign sites too");
  if (!inds.length && (intents.includes("buyers") || intents.includes("projects"))) hints.push("send buyer_industries (1-3 industries whose plants buy or use the product) to find buyers and new projects");
  if (h.unknown_market) hints.push("unknown market: searched without a country");
  /* the cache (all reads at once), then ONE reservation for the misses */
  const keys = await Promise.all(plan.map(q => cacheKey(cfg.provider, q)));
  const hits = await Promise.all(keys.map(k => cacheGet(env, k, nowMs)));
  const misses = plan.map((q, i) => i).filter(i => !hits[i]);
  let res = { granted: 0, back: 0, keys: [], why: "" };
  if (misses.length) { try { res = await reserveUnits(env, cfg, misses.length, who, nowMs); } catch (e) { return { error: "websearch_off", reason: "no_counter" }; } }
  if (misses.length && !res.granted && !hits.some(Boolean)) { await giveBack(env, res); return { error: res.why === "cap" ? "websearch_cap" : "websearch_busy", reason: res.why === "cap" ? "" : res.why }; }
  const send = misses.slice(0, res.granted), answers = plan.map((q, i) => (hits[i] ? { results: hits[i].results, cached: true } : null));
  let skipped = 0;
  await pool(send, PROVIDER_CONCURRENCY[cfg.provider] || 6, async i => {
    if (Date.now() > deadline - 150) { skipped++; return; } // never started: its unit goes back
    const r = await runProvider(cfg.provider, cfg.key, plan[i], { deadline });
    answers[i] = r.error ? { error: r.error, status: r.status } : { results: cleanResults(r.raw, env, 10), cached: false };
  });
  const back = res.back + skipped;
  if (back) wait(giveBack(env, { ...res, back }));
  const freshIdx = plan.map((q, i) => i).filter(i => answers[i] && !answers[i].error && !answers[i].cached);
  const failed = send.filter(i => answers[i] && answers[i].error);
  if (!answers.some(a => a && !a.error)) { if (failed.length) console.error("web-hunt", cfg.provider, "all failed", failed.map(i => answers[i].error).join(",")); return { error: "websearch_failed", reason: failed.length ? answers[failed[0]].error : "skipped" }; }
  for (const i of freshIdx) wait(cachePut(env, keys[i], { results: answers[i].results }, nowMs));
  /* classify, keep what is about the product, rank */
  const cands = [];
  plan.forEach((q, i) => {
    const a = answers[i]; if (!a || a.error) return;
    const importers = q.intent === "buyers" && !inds.length;
    a.results.forEach((r, rank) => {
      const c = classify(r, { intent: q.intent, need, inds, importers });
      if (c.type === "other" || !relevant(r, c, { need, inds, importers })) return;
      if (ambiguous && !(c.type === "buyer" || c.type === "buyer_list" || c.type === "project")) return; // the product's meaning is not known yet
      cands.push({ r, c, q, rank, fresh: !a.cached, score: scoreOf(r, c, q, need, inds, nowMs) });
    });
  });
  /* the team's rejections (one read, only while there is time) */
  let list = cands;
  if (cands.length && Date.now() - t0 < HUNT_REJECT_MS) {
    const hs = await Promise.all(cands.map(x => leadHash(x.r.url)));
    const rej = await rejectedOf(env, hs.slice(0, 40), productKey(h.product));
    if (rej.size) list = cands.filter((x, i) => !rej.has(hs[i]));
  }
  const picked = pickResults(list);
  const partial = misses.length > res.granted || skipped > 0 || failed.length > 0;
  if (partial) hints.push("some searches did not run or answer in time: say only what came back");
  if (ambiguous) hints.push(`ask ONE question first: which meaning of «${ambiguous.word}» — tenders and RFQs wait for the answer`);
  /* the data desk keeps the opportunities of the PROVIDER answers (review S8) */
  const rows = picked.filter(x => x.fresh).map(x => ({ ...x.r, type: x.c.type, official: x.c.official, aggregator: x.c.aggregator, query: x.q.q, lang: x.q.lang }));
  if (rows.length) wait(recordLeads(env, rows, { persona: who, via: "hunt", product: h.product, market: h.market ? h.market.code : "", governorate: h.gov ? h.gov.ar : "", nowMs }));
  console.log("web-hunt", who, "planned", plan.length, "sent", send.length - skipped, "cached", plan.length - misses.length, "kept", picked.length, "ms", Date.now() - t0);
  return { body: answer(picked, h, need, voice, { plan, sent: send.length - skipped, cached: plan.length - misses.length, partial, hints, ambiguous, asked: intents }) };
}
function answer(picked, h, need, voice, m) {
  const counts = {}; for (const x of picked) counts[x.c.type] = (counts[x.c.type] || 0) + 1;
  let text = huntText(picked, h, need, voice, m.asked);
  if (m.ambiguous) text += " " + ambiguousText(m.ambiguous, voice);
  return { count: picked.length, counts,
    results: picked.map(x => ({ type: x.c.type, title: x.r.title, url: x.r.url, snippet: plain(x.r.snippet, HUNT_SNIPPET), source: x.r.source, date: x.r.date, ...(x.c.official ? { official: true } : {}), ...(x.c.aggregator ? { aggregator: true } : {}) })),
    text, query: [h.product, h.market ? h.market.ar : "العالم"].join(" · "), market: h.market ? h.market.code : "world", queries: m.plan.length, sent: m.sent, cached: m.cached, partial: !!m.partial,
    origin: "web", note: WS_NOTE, ...(m.hints.length ? { hint: m.hints.join("; ") } : {}), ...(m.ambiguous ? { ambiguous: m.ambiguous } : {}) };
}

/* ---------- HTTP: POST /api/janna/hunt (Janna) · POST /api/advisor/hunt (Bassem) ---------- */
const WHO = { bassem: { path: "/api/advisor/hunt", feature: "bassem_web_search" }, janna: { path: "/api/janna/hunt", feature: "janna_web_search" } };
async function serveHunt(req, env, ctx, nowMs, who) {
  const W = WHO[who]; let voice = voiceOf(who, "");
  if (req.method !== "POST") return out({ error: "method" }, 405, { Allow: "POST" });
  const cfg = await webSearchConfig(env), secret = who === "janna" ? cfg.janna_secret : cfg.tool_secret;
  if (!secret) return soft(W.path, voice, "websearch_off", 503, { reason: (who === "janna" ? cfg.janna_reason : cfg.reason) || "no_tool_secret" }); // fail-closed
  const got = req.headers.get(WS_HEADER) || "";
  if (!got || !safeEq(got, secret)) return out({ error: "unauthorized" }, 401);
  let b = {};
  try { const t = await req.text(); if (t.length > WS_MAX_BODY) return soft(W.path, voice, "too_large", 413); b = t ? JSON.parse(t) : {}; }
  catch (e) { return soft(W.path, voice, "bad_json", 400); }
  const a = argsOf(b, ["product", "query", "q"]);
  voice = voiceOf(who, a.lang); // the language the persona speaks: Janna's tool sends it, Bassem's may (nit 15)
  if (!(await featureOn(env, W.feature))) return soft(W.path, voice, "feature_off", 503, { feature: W.feature, reason: "feature_off" });
  if (!(who === "janna" ? cfg.janna_ready : cfg.ready)) return soft(W.path, voice, "websearch_off", 503, { reason: who === "janna" ? cfg.janna_reason : cfg.reason });
  const h = parseHunt(a);
  if (h.error) return soft(W.path, voice, h.error, 400);
  const r = await runHunt(env, cfg, h, { who, voice, nowMs, ctx });
  if (r.error === "product_required" || r.error === "industries_required") return soft(W.path, voice, r.error, 400);
  if (r.error === "product_ambiguous") { toolSoftError(W.path, "product_ambiguous"); return out({ error: "product_ambiguous", code: "product_ambiguous", http: 200, ambiguous: r.ambiguous, count: 0, results: [], text: ambiguousText(r.ambiguous, voice), origin: "web", note: WS_NOTE }); }
  const refused = r.error ? refusal(W.path, voice, r, nowMs) : null; if (refused) return refused;
  if (r.error) return soft(W.path, voice, "websearch_failed", 502);
  return out(r.body);
}
async function guarded(req, env, ctx, nowMs, who) {
  try { return await serveHunt(req, env, ctx, nowMs, who); }
  catch (e) { console.error("web-hunt", WHO[who].path, "exception", (e && e.name) || "error", (e && e.message) || ""); return soft(WHO[who].path, voiceOf(who, ""), "websearch_failed", 500); }
}
export const handleBassemHunt = (req, env, ctx, nowMs = Date.now()) => guarded(req, env, ctx, nowMs, "bassem");
export const handleJannaHunt = (req, env, ctx, nowMs = Date.now()) => guarded(req, env, ctx, nowMs, "janna");
