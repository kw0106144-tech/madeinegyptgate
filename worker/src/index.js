/* Janna lookup API — Cloudflare Worker for madeinegyptgate.com
   Lets the live assistant «جنة» (Anam persona, SERVER_WEBHOOK tool "janna_lookup") search the platform's real public
   directory (factories & companies, products, tenders, RFQs, retail offers, industrial cities) and SAY the results.
   - POST /api/janna/lookup   body {section, query, governorate?, limit?, page?, market?}  → {count, page, pages, has_more, results[], text}
     (lean for the model: leanLookup below; a malformed request still answers 200 with a `text` the model can act on — never a bare 400)
   - GET  /api/janna/lookup?section=&query=&governorate=&page=               (the full shape, for testing / the website)
     each result also carries id (for /api/janna/item), open_url (the item's own page) and, for tenders, the amounts the data has
   - GET|POST /api/janna/item {section, id|ref|title}  → the full public record of ONE item + a spoken summary (src/janna-item.js)
   - GET  /api/janna/health
   - POST /api/janna/timing   the live-call page's start timing beacon → 204 + one log line of numbers (src/live-timing.js)
   The webhook routes, the health check and the timing beacon skip ccBoot (BARE below): they read only the bundled data or their own tables.
   Security: if the secret JANNA_KEY is set (wrangler secret put JANNA_KEY), requests must send header X-Janna-Key with it
   (the Anam tool sends it). No API keys are stored in the code. Data = worker/src/data.json (public directory only; no phones). */
import DATA from "./data.json";
import { handleAdvisor, handleEmail } from "./advisor.js"; // AI Deal Advisor: /api/advisor/* + inbound replies (see README)
import { handleProfile } from "./profile.js"; // /api/advisor/profile — the member's factory profile Bassem records in the call (migration 0007)
import { handleMeetings, meetingsCron } from "./meetings.js"; // Janna-hosted meetings: /api/meetings/* + cron (see README)
import { EN, norm, STOP } from "./text.js"; // shared Arabic/English normalisation (also used by matching.js)
import { concepts as lkConcepts, altForms, canon as lkCanon, words as lkWords, phraseTokens, phraseToken, storedForms } from "./lookup-terms.js"; // the lookup's words, forms and synonyms
// Interactive platform (docs/janna/INTERACTIVE-PLAN.md, Phase A) — see README "Platform API"
import { handleAuth } from "./auth.js";             // /api/auth/*        one email-code login for every plan
import { handleMe } from "./me.js";                 // /api/me*           account, follows, notifications, prefs, stats, incoming
import { handleMeDeleteRequest, handleVisitorEraseRequest } from "./delete-requests.js"; // 0010: «طلب حذف الحساب» (requests only; owner switches)
import { handleInquiries, handleInquiryEmail, isInquiryAddress, inquiriesCron } from "./inquiries.js"; // /api/inquiries* + automatic routing
import { handleAdmin } from "./admin.js";           // /api/admin/*       monitoring console (no human step in any flow)
import { handleEv, handleUnsub } from "./ev.js";    // /api/ev, /api/unsub
import { handleWA, bassemCron } from "./whatsapp.js"; // /api/wa/*        respond.io webhook + Bassem's daily WhatsApp
import { handleJannaSession } from "./janna-session.js"; // /api/janna/session  live-call session tokens (JS SDK: no third-party mark)
import { handleTiming } from "./live-timing.js";       // /api/janna/timing   the call page's start timing beacon (numbers only)
import { handleItem, enrichResult } from "./janna-item.js"; // /api/janna/item  one item in full + the lookup results' ids / open_url / amounts
import { handleMemory, memoryCron, budgetEnv, TICK } from "./memory.js"; // /api/advisor/memory  Bassem's memory (searches, call turns, summaries, facts)
// ---- 0009 memory upgrades: Janna's visitor memory, «بنك المعلومات», the daily memory update ----
import { handleVisitorMemory } from "./visitor.js";   // /api/janna/memory[/tasks]  Janna's memory of her visitors
import { handleKnowledge } from "./knowledge.js";     // /api/janna/knowledge  the personas' knowledge_lookup tool
import { dailyMemory } from "./daily.js";              // day digests + «ملخص العميل» + tasks / knowledge merge / caps report (once per Cairo day)
import { dailyJobs, newCountFor } from "./digest.js";
import { cairoDay, addDays, toolSoftError } from "./common.js";
// ---- Bassem web search (src/websearch.js): POST /api/advisor/web — Anam SERVER_WEBHOOK bassem_web_search (X-MIG-Tool header) ----
import { handleWebSearch } from "./websearch.js";
// Admin Control Center (docs/janna/ACC-CONTRACT.md §0.2): one CC object handed to every new handler (no cross-area imports)
import * as ACC from "./acc.js"; import * as CONTENT from "./content.js"; import * as PAY from "./payments.js"; import * as MAILC from "./email-center.js";
export const CC = { acc: ACC, content: CONTENT, payments: PAY, email: MAILC };   // Control Center (ACC-CONTRACT §0.2)

/* tender status from the deadline at request time — the honest 4-value rule (data/oldtend.js §2): deadline passed → منتهية,
   within 7 days → تنتهي قريباً, later → سارية, no deadline in the data → غير محدد الموعد (never «سارية» by default) */
export function tenderStatus(deadline, nowMs = Date.now()) {
  const d = /^(\d{4}-\d{2}-\d{2})/.exec(String(deadline || ""));
  if (!d) return "غير محدد الموعد";
  const today = cairoDay(nowMs);
  return d[1] < today ? "منتهية" : d[1] <= addDays(today, 7) ? "تنتهي قريباً" : "سارية";
}

const SITE = "https://madeinegyptgate.com/";
const GOV = { القاهرة: "القاهرة", الجيزة: "الجيزة", الإسكندرية: "الإسكندرية", القليوبية: "القليوبية", الشرقية: "الشرقية", الدقهلية: "الدقهلية", الغربية: "الغربية", المنوفية: "المنوفية", البحيرة: "البحيرة", "كفر الشيخ": "كفر الشيخ", دمياط: "دمياط", بورسعيد: "بورسعيد", الإسماعيلية: "الإسماعيلية", السويس: "السويس", "شمال سيناء": "شمال سيناء", "جنوب سيناء": "جنوب سيناء", الفيوم: "الفيوم", "بني سويف": "بني سويف", المنيا: "المنيا", أسيوط: "أسيوط", سوهاج: "سوهاج", قنا: "قنا", الأقصر: "الأقصر", أسوان: "أسوان", "البحر الأحمر": "البحر الأحمر", "الوادي الجديد": "الوادي الجديد", مطروح: "مطروح" };
/* industrial cities → governorate (so «العاشر من رمضان» also matches الشرقية entries that mention the city) */
const CITY_GOV = { "العاشر من رمضان": "الشرقية", "السادس من أكتوبر": "الجيزة", "6 أكتوبر": "الجيزة", "السادات": "المنوفية", "العبور": "القليوبية", "بدر": "القاهرة", "برج العرب": "الإسكندرية", "العين السخنة": "السويس", "15 مايو": "القاهرة", "قويسنا": "المنوفية", "شبرا الخيمة": "القليوبية", "المحلة الكبرى": "الغربية", "دمياط الجديدة": "دمياط", "الصالحية": "الشرقية" };
/* English words of the query → Arabic (text.js EN); «and» / «or» stay: they separate the items of a list («rollers and cylinders») */
function lookupEnglishToArabic(q) {
  let s = " " + String(q || "").toLowerCase() + " ";
  for (const k of Object.keys(EN).sort((a, b) => b.length - a.length)) if (k !== "and") s = s.split(" " + k + " ").join(" " + EN[k] + " ");
  return s.trim();
}
/* a governorate or industrial city named in the (normalised) query, as whole words with its article after one attached و / ب / ل / ف,
   or without it after «في» / «من» / an attached ب / ل («في اسكندرية») (lookup-index 2026-11-20: «قنا» was found inside «قناطر», «السويس»
   inside «السويسرية»; review 2026-11-20: a bare «جيزة» / «بحيرة» is also a word of a name — «جيزة باور إندستري», «أسماك بحيرة ناصر») */
const PLACE_RX = new Map();
function placeIn(nq, name) {
  const n = norm(name); let rx = PLACE_RX.get(n);
  if (!rx) {
    const esc = a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), bare = /^ال/.test(n) && n.length > 5 ? n.slice(2) : "";
    rx = new RegExp("(?:^| )[وبلف]?" + esc(n) + "(?= |$)" + (bare ? "|(?:^| )(?:(?:في|من) |[بل])" + esc(bare) + "(?= |$)" : ""));
    PLACE_RX.set(n, rx);
  }
  return rx.exec(nq);
}
const cutOut = (s, m) => (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
function parse(query, governorate) {
  let q = norm(lookupEnglishToArabic(query)), gov = governorate ? lookupEnglishToArabic(governorate) : "", place = "";
  const ng = norm(gov);
  for (const c of Object.keys(CITY_GOV)) { const m = placeIn(q, c); if (m || placeIn(ng, c)) { place = c; if (m) q = cutOut(q, m); } }
  for (const g of Object.keys(GOV)) { const m = placeIn(q, g); if (m) { gov = gov || g; q = cutOut(q, m); } }
  /* the visitor's own spelling of each word, for the text («تعبئة», not the normalised «تعبئه») */
  const said = new Map(); for (const w of String(query || "").split(/[\s,،؛;/|()«»"'!?؟.:]+/)) { const k = norm(w); if (k && !said.has(k)) said.set(k, w); }
  return { q, gov: gov ? (GOV[gov] || gov) : "", place, said };
}
/* L = a normalised location: in the industrial city, or in the governorate (or one of its industrial cities) */
const GOV_CITIES = new Map(); for (const [c, g] of Object.entries(CITY_GOV)) { if (!GOV_CITIES.has(g)) GOV_CITIES.set(g, []); GOV_CITIES.get(g).push(norm(c)); }
function locOk(L, gov, place) {
  if (place) return L.includes(norm(place));
  if (gov) { const G = norm(gov); return L.includes(G) || (GOV_CITIES.get(gov) || []).some(c => L.includes(c)); }
  return true;
}

/* market codes: the lookup's own + the aliases Bassem's other tools use (bassem_intel: eg / gcc / eu …); an unknown code is SAID
   (no silent fallback to the Egyptian list — review 2026-11-18 #7) */
export const MARKETS = ["local", "gulf", "africa", "asia", "europe", "intl", "all"];
const MARKET_ALIAS = { eg: "local", egy: "local", egypt: "local", egyptian: "local", masr: "local", "مصر": "local", "محلي": "local", gcc: "gulf", khaleej: "gulf", khalij: "gulf", "الخليج": "gulf", "خليج": "gulf",
  eu: "europe", "اوروبا": "europe", "أوروبا": "europe", "افريقيا": "africa", "أفريقيا": "africa", "اسيا": "asia", "آسيا": "asia", international: "intl", foreign: "intl", "دولي": "intl", "دولية": "intl" };
export function marketOf(m) {
  const k = String(m == null ? "" : m).trim().toLowerCase(); if (!k) return { mk: "local", bad: "" };
  if (MARKETS.includes(k)) return { mk: k, bad: "" };
  return MARKET_ALIAS[k] ? { mk: MARKET_ALIAS[k], bad: "" } : { mk: "", bad: k.slice(0, 30) };
}
/* tenders: «حديد» is not «تحديد», and «السكك الحديد(ية)» (railways) is not iron / steel (review 2026-11-18 #10): railway words are cut from
   the title and the entity before they are read */
const RAIL = /(^| )\S*سكك (ال)?حديد\S*/g;
/* ---------- matching (lookup-index 2026-11-20, the Al-Atlal call 8bacbfac; src/lookup-terms.js) ----------
   A query is read as concepts (its words and phrases, each with its alternatives: the word, its true equivalents = tier 1, the same field
   of industry = tier 2) and matched as WHOLE stored words — «led» is not inside «knowledge», «أدوية» not inside «أدوات», «ألبان» not
   inside «مباني». The results that hold ALL the words of the query (or of one item of a list: «سلندرات ودرافيل») come first, then the ones
   that hold part of them, then — only when those are few — the same field. Inside each group the rarer word and the stronger field win
   (IDF × field weight); an activity label only orders companies that match equally (a weak tie-breaker, never a match by itself). Lists
   are indexed once per isolate: the directory from data.json f[6] (worker/build-index.js), the small lists from their own texts. */
const IXS = new Map(), TOK_CACHE = new Map();
/* a text → its stored forms + the group phrases it holds (as the directory index stores them, worker/build-index.js) */
const formsOf = s => { let x = TOK_CACHE.get(s); if (x) return x; x = [...new Set([...lkWords(s).flatMap(storedForms).filter(k => k && k.length >= 2), ...phraseTokens(s)])]; if (TOK_CACHE.size < 40000) TOK_CACHE.set(s, x); return x; };
/* fields(i) → one list of stored forms per field; W = the weight of each field */
function buildIx(n, fields, W) {
  const post = new Map();
  for (let i = 0; i < n; i++) { const fs = fields(i); for (let f = 0; f < fs.length; f++) for (const k of fs[f]) { const a = post.get(k), v = i * 8 + f; if (!a) post.set(k, [v]); else if (a[a.length - 1] !== v) a.push(v); } }
  return { n, post, W, latin: [...post.keys()].filter(k => /^[a-z]/.test(k)).sort() };
}
const ixOf = (name, make) => { let x = IXS.get(name); if (!x) { x = make(); IXS.set(name, x); } return x; };
/* the directory: f[6] = «name + product words|description words» as numbers into fv (fw base-36 characters each, worker/build-index.js);
   an index built before f[6] existed falls back to the name and products; f[2] + fs[f[7]] = the activity labels (tie-breaker only) */
function dirIx() {
  return ixOf("f", () => {
    const F = DATA.f || [], FS = DATA.fs || [], FV = DATA.fv || [], FW = DATA.fw || 3, LC = new Map(), lab = [], loc = [], nm = [];
    const dec = s => { const o = []; for (let j = 0; j + FW <= s.length; j += FW) { const k = FV[parseInt(s.slice(j, j + FW), 36)]; if (k) o.push(k); } return o; };
    const ix = buildIx(F.length, i => {
      const f = F[i], L = (f[2] || "") + " " + (Number.isInteger(f[7]) && f[7] >= 0 ? FS[f[7]] || "" : "");
      let ls = LC.get(L); if (!ls) { ls = new Set(formsOf(L)); LC.set(L, ls); } lab.push(ls); loc.push(norm(f[3])); nm.push(" " + norm(f[0]) + " ");
      if (typeof f[6] !== "string" || !FV.length) return [[], formsOf(f[0] + " " + f[4])];
      const bar = f[6].indexOf("|");
      return [dec(f[6].slice(bar + 1)), dec(f[6].slice(0, bar))];
    }, [2, 3]);
    return Object.assign(ix, { lab, loc, nm });
  });
}
/* how many companies hold a stored form: tells an attached «و» from a word's own first letter (src/lookup-terms.js concepts) */
const dirVocab = k => { const p = dirIx().post.get(k); return p ? p.length : 0; };
const noRail = s => norm(s).replace(RAIL, " ");
/* tenders: title 3, activity 2 (the tender's own category: it counts), entity 0.75 (it only weighs a little) */
const tenderIx = () => ixOf("t", () => buildIx(DATA.t.length, i => { const t = DATA.t[i]; return [formsOf(noRail(t[3])), formsOf(t[6]), formsOf(noRail(t[4]))]; }, [3, 2, 0.75]));
const intlIx = () => ixOf("i", () => { const I = DATA.i || []; return buildIx(I.length, i => { const x = I[i]; return x[0] !== "tender" || x[8] === "local" ? [[], [], []] : [formsOf(noRail(x[5])), formsOf(x[3] + " " + x[4]), formsOf(noRail(x[9]))]; }, [3, 2, 0.75]); });
const productIx = () => ixOf("p", () => buildIx(DATA.p.length, i => { const p = DATA.p[i]; return [formsOf(p[0]), formsOf(p[1] + " " + p[2])]; }, [3, 1]));
const rfqIx = () => ixOf("q", () => buildIx(DATA.q.length, i => { const q = DATA.q[i]; return [formsOf(q[2]), formsOf(q[3] + " " + q[4])]; }, [3, 2]));
const offerIx = () => ixOf("o", () => buildIx(DATA.o.length, i => { const o = DATA.o[i]; return [formsOf(o[0]), formsOf(o[1] + " " + o[2]), formsOf(o[5])]; }, [3, 2, 1]));
const cityIx = () => ixOf("z", () => buildIx(DATA.z.length, i => { const z = DATA.z[i]; return [formsOf(z[0] + " " + z[1]), formsOf(z[5]), formsOf(z[2] + " " + z[3] + " " + z[4])]; }, [3, 2, 1]));
/* the Latin words of an index that start with p (worker-intel's word-start terms: "galvaniz" → galvanized) */
function prefixed(sorted, p) {
  let lo = 0, hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < p) lo = mid + 1; else hi = mid; }
  const out = []; for (let i = lo; i < sorted.length && sorted[i].startsWith(p) && out.length < 200; i++) out.push(sorted[i]);
  return out;
}
/* a concept's alternatives → the stored forms to look up (form → its strength and tier): a word with its article / attached-letter forms,
   a phrase as its one token («اسطوان_غاز»: its words side by side), a Latin word-start term by prefix */
function compile(c) {
  const one = new Map(), pre = [];
  const put = (k, T, tier) => { const x = one.get(k); if (!x || x.T < T) one.set(k, { T, tier }); };
  for (const a of c.alts) {
    const T = a.tier === 1 ? (a.own ? 1 : 0.9) : 0.5;
    if (a.toks.length === 1) {
      for (const k of altForms(a, 0)) put(k, T, a.tier);
      if (a.prefix) pre.push({ p: a.toks[0], T: T * 0.9, tier: a.tier });
    } else put(phraseToken(a.toks), T, a.tier);
  }
  return { one, pre };
}
/* → per concept × row: w = the best field weight × strength, t = the best tier (0 = no match) */
function matchIx(ix, CC) {
  const n = ix.n, w = new Float32Array(CC.length * n), t = new Uint8Array(CC.length * n);
  CC.forEach((cc, c) => {
    const hit = (v, T, tier) => { const i = (v / 8) | 0, x = c * n + i, s = ix.W[v % 8] * T; if (s > w[x]) w[x] = s; if (!t[x] || tier < t[x]) t[x] = tier; };
    for (const [k, a] of cc.one) { const p = ix.post.get(k); if (p) for (const v of p) hit(v, a.T, a.tier); }
    for (const a of cc.pre) for (const k of prefixed(ix.latin, a.p)) { const p = ix.post.get(k); if (p) for (const v of p) hit(v, a.T, a.tier); }
  });
  return { w, t, n };
}
const CLASS = ["all", "partial", "related"];
/* rows (candidate indices, in data order) → [{i, cls, score, matched}] sorted by class, then `first(i)` (open tenders first), then score,
   then data order. Per item of the query (a list item = a part):
   all     = every word of the part, itself or a true equivalent (tier 1);
   partial = the words it holds carry at least half the part's weight (IDF: a rare word weighs more than a common one), or it holds the
             rarest word of the part — «تعبئة أسطوانة غاز الأكسجين»: an oxygen maker without «تعبئة» stays, a packaging firm with only
             «تعبئة» does not; «مواسير بلاستيك»: a pipe maker stays, any plastics firm does not;
   related = the same with the same field's words (tier 2) — kept only when fewer than 3 results are all / partial, at most 20.
   A word no row holds at all is left out of that weighing (the text says no result holds every word), and a partial / related result
   must hold one specific word (held by at most ~5 % of the list: SPECIFIC) — «الأعشاب الطبية» returns no tender that only says «الطبية».
   score = Σ IDF of the words held (the field it is in moves it ±25 %; a same-field word counts a fifth); the activity label adds 15 % of
   a word it holds (a tie-breaker, never a match by itself). */
const RELATED_MAX = 20, SPECIFIC = 3; // ln(1 + 1 / 0.05): a word held by at most ~5 % of the rows
function rankRows(C, M, rows, { lab = null, first = null } = {}) {
  const { w, t, n } = M, nc = C.length;
  const df = C.map(() => 0), idf = C.map((_, c) => { let d1 = 0, d = 0; for (let i = 0; i < n; i++) { const x = t[c * n + i]; if (x === 1) d1++; if (x) d++; } df[c] = d; return Math.log(1 + n / (1 + (d1 || d))); });
  const parts = []; C.forEach((c, j) => { (parts[c.part] = parts[c.part] || []).push(j); });
  const PI = parts.filter(Boolean).map(P => { const Q = P.filter(c => df[c] > 0); return { P, Q, mass: Q.reduce((s, c) => s + idf[c], 0), rare: Q.length ? Q.reduce((b, c) => (idf[c] > idf[b] ? c : b), Q[0]) : -1 }; }).filter(x => x.Q.length);
  const lab1 = C.map(c => c.alts.filter(a => a.tier === 1 && a.toks.length === 1).map(a => a.toks[0]));
  const out = [];
  for (const i of rows) {
    let cls = 3;
    for (const { P, Q, mass, rare } of PI) {
      let m1 = 0, m1s = 0, ms = 0, sp1 = false, sp = false;
      for (const c of Q) { const x = t[c * n + i]; if (x === 1) { m1++; m1s += idf[c]; if (idf[c] >= SPECIFIC) sp1 = true; } if (x) { ms += idf[c]; if (idf[c] >= SPECIFIC) sp = true; } }
      const k = m1 === P.length ? 0 : sp1 && (m1s >= mass / 2 || t[rare * n + i] === 1) ? 1 : sp && (ms >= mass / 2 || t[rare * n + i]) ? 2 : 3;
      if (k < cls) cls = k;
    }
    if (cls > 2) continue;
    let score = 0; const m1 = [], m2 = [];
    for (let c = 0; c < nc; c++) {
      const x = c * n + i; if (!t[x]) continue;
      if (t[x] === 1) { score += idf[c] * (0.5 + w[x] / 6); m1.push(c); } else { score += idf[c] * 0.2; m2.push(c); }
      if (lab && lab1[c].some(k => lab(i).has(k))) score += 0.15 * idf[c];
    }
    out.push({ i, cls, score, matched: cls === 2 ? m1.concat(m2) : m1, f: first ? first(i) : 0 });
  }
  const strong = out.filter(r => r.cls < 2).length;
  out.sort((a, b) => a.cls - b.cls || b.f - a.f || b.score - a.score || a.i - b.i);
  return strong >= 3 ? out.filter(r => r.cls < 2) : out.slice(0, strong + RELATED_MAX);
}
/* the words a result holds (a result that does not hold them all says which), as the visitor said them */
const sayWord = (P, c) => String(c.label).split(" ").map(w => P.said.get(w) || w).join(" ");
function tag(P, C, r, obj) {
  if (!C.length) return obj;
  obj.match = CLASS[r.cls];
  if (r.cls) obj.matched = r.matched.map(c => sayWord(P, C[c]));
  return obj;
}
const isOpen = st => st === "سارية" || st === "تنتهي قريباً";
/* page: 1-based (10 results at most per page); market (tenders only): local (default — the Egyptian list, as before) | gulf | africa |
   asia | europe | intl (all four) | all (Egyptian + international) */
function search(section, query, governorate, limit, page, market) {
  const P = parse(query, governorate), { gov, place } = P;
  const L = Math.min(Math.max(+limit || 6, 1), 10), res = [], M = marketOf(market), mk = M.mk || "local";
  /* the paging / open-one hint only for a caller that pages or picks markets (Bassem's new definition); Janna's tool has neither */
  const paged = (page != null && page !== "") || (market != null && market !== "");
  if (section === "tenders" && M.bad) return { section, query, governorate: gov || null, place: place || null, market: null, market_unknown: M.bad, markets: MARKETS, widened_to: null, count: 0, page: 1, pages: 1, per_page: L, has_more: false, results: [],
    text: `السوق «${M.bad}» مش من أسواق بحث المناقصات على المنصة، فمادورتش. الأسواق المتاحة: local (مصر)، gulf (الخليج)، africa (أفريقيا)، asia (آسيا)، europe (أوروبا)، intl (كل الدولية)، all (مصر والدولية). دوّر تاني بواحد منهم، ومتقولش نتايج من سوق تاني على إنها من السوق ده.` };
  const Q = lkConcepts(P.q, dirVocab), C = Q.concepts, CC = C.map(compile);
  const all = (n, ok) => { const o = []; for (let i = 0; i < n; i++) if (ok(i)) o.push({ i, cls: 0, score: 0, matched: [] }); return o; };
  const ranked = (ix, ok, opt) => (C.length ? rankRows(C, matchIx(ix, CC), Array.from({ length: ix.n }, (_, i) => i).filter(ok), opt) : all(ix.n, ok));
  const company = f => ({ name: f[0], type: f[1], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] });
  let widened = null;
  if (section === "factories" || section === "suppliers" || section === "products" || section === "market") {
    const X = dirIx(), F = DATA.f, prod = section === "products" || section === "market";
    /* a company asked for by its name («الشركة المتحدة المصرية», «شركة العبوات والمستلزمات»: their generic words decide no match):
       a record whose name holds the query's own words, in order, leads its class (review 2026-11-20) */
    const nq = " " + P.q.split(" ").filter(w => w && !STOP.has(w)).join(" ") + " ", byName = nq.trim().indexOf(" ") > 0 ? i => (X.nm[i].includes(nq) ? 1 : 0) : null;
    if (prod) for (const r of ranked(productIx(), () => true)) if (C.length) { const p = DATA.p[r.i]; res.push([r, tag(P, C, r, { product: p[0], maker: p[1], category: p[2], url: SITE + "market.html" })]); }
    const dir = ranked(X, i => locOk(X.loc[i], gov, place), { lab: i => X.lab[i], first: byName });
    for (const r of prod ? dir.filter(r => r.cls < 2) : dir) { if (prod && !C.length) break; const f = F[r.i]; res.push([r, tag(P, C, r, prod ? { name: f[0], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] } : company(f))]); }
    /* a specific industrial city with few hits (all words or part of them: a same-field result does not count — review 2026-11-20,
       «أكياس بلاستيك … العاشر من رمضان»: 3 same-field results there kept the bag makers of الشرقية out): widen to its governorate and say so */
    const strong = () => res.filter(r => r[0].cls < 2).length;
    if (!prod && place && strong() < 3 && CITY_GOV[place]) {
      const g = norm(CITY_GOV[place]), seen = new Set(res.map(r => r[0].i));
      for (const r of ranked(X, i => X.loc[i].includes(g) && !seen.has(i), { lab: i => X.lab[i], first: byName })) res.push([r, tag(P, C, r, company(F[r.i]))]);
      widened = CITY_GOV[place];
      if (strong() >= 3) for (let k = res.length - 1; k >= 0; k--) if (res[k][0].cls === 2) res.splice(k, 1); // same field only when few (rankRows)
      res.sort((a, b) => a[0].cls - b[0].cls); // the city's results first inside each class (the sort is stable)
    }
    if (prod) res.sort((a, b) => a[0].cls - b[0].cls); // products first inside each class (the sort is stable)
  } else if (section === "tenders") {
    if (mk !== "local" && !gov) { const I = DATA.i || [];
      for (const r of ranked(intlIx(), i => I[i][0] === "tender" && I[i][8] !== "local" && (mk === "all" || mk === "intl" || I[i][8] === mk), { first: i => (isOpen(tenderStatus(I[i][7])) ? 1 : 0) })) {
        const x = I[r.i], st = tenderStatus(x[7]); res.push([r, tag(P, C, r, { ref: x[1], type: "مناقصة دولية", status: st, title: x[5], entity: x[9] || "", governorate: x[4] || "", activity: x[3], deadline: x[7] || "", market: x[8], url: SITE + x[6] })]); } }
    if (mk === "local" || mk === "all") { const T = DATA.t, G = norm(gov);
      for (const r of ranked(tenderIx(), i => !gov || norm(T[i][5]).includes(G), { first: i => (isOpen(tenderStatus(T[i][7])) ? 1 : 0) })) {
        const t = T[r.i], st = tenderStatus(t[7]); res.push([r, tag(P, C, r, { ref: t[0], type: t[1], status: st, title: t[3], entity: t[4], governorate: t[5] || "غير محددة", activity: t[6], deadline: t[7] || "", url: SITE + "tenders/search/#" + encodeURIComponent(t[0]) })]); } }
    if (mk === "all") res.sort((a, b) => a[0].cls - b[0].cls || b[0].f - a[0].f || b[0].score - a[0].score); // Egyptian + international in one order
  } else if (section === "rfqs") {
    for (const r of ranked(rfqIx(), () => true)) { const q = DATA.q[r.i]; res.push([r, tag(P, C, r, { ref: q[0], date: q[1], title: q[2], details: q[3], quantity: q[4], url: SITE + "rfq/search/#" + encodeURIComponent(q[0]) })]); }
  } else if (section === "offers") {
    for (const r of ranked(offerIx(), () => true)) { const o = DATA.o[r.i]; res.push([r, tag(P, C, r, { product: o[0], brand: o[1], store: o[2], price_egp: o[3], old_price_egp: o[4], valid_to: o[6], url: SITE + o[7] })]); }
  } else if (section === "cities") {
    const G = norm(gov);
    for (const r of ranked(cityIx(), i => !gov || norm(DATA.z[i][3]).includes(G))) { const z = DATA.z[r.i]; res.push([r, tag(P, C, r, { name: z[0], name_en: z[1], type: z[2], governorate: z[3], city: z[4], sectors: z[5], url: SITE + z[6] })]); }
  }
  const nAll = C.length ? res.filter(r => r[0].cls === 0).length : res.length, nRel = res.filter(r => r[0].cls === 2).length;
  const amb = C.length === 1 && C[0].amb ? { word: sayWord(P, C[0]), note: C[0].amb.note } : null;
  const pages = Math.max(1, Math.ceil(res.length / L)), pg = Math.min(Math.max(Math.floor(+page || 1), 1), 1000), from = (pg - 1) * L;
  const top = res.slice(from, from + L).map(r => enrichResult(section, r[1])), more = Math.max(0, res.length - from - top.length);
  /* the words as the query's list items: «مواسير حديد» أو «بلاستيك» (review 2026-11-20: «مواسير أو حديد أو بلاستيك» read as if every
     word were an alternative) */
  const items = []; C.forEach(c => (items[c.part] = items[c.part] || []).push(sayWord(P, c)));
  const st = { words: items.filter(Boolean).map(x => x.join(" ")).join("» أو «"), all: nAll, rel: nRel, amb, n: C.length };
  return { section, query, governorate: gov || null, place: place || null, market: section === "tenders" ? mk : undefined, widened_to: widened, count: res.length, count_all: nAll, partial: res.length > nAll,
    ...(amb ? { ambiguous: { word: amb.word, meanings: amb.note } } : {}), page: pg, pages, per_page: L, has_more: more > 0, results: top,
    text: (widened ? "نتائج قليلة داخل " + place + " نفسها، فتمت إضافة نتائج من محافظة " + widened + ". " : "") + (pg > pages && res.length ? `دي كانت كل النتائج (${res.length}) في ${pages === 1 ? "صفحة واحدة" : pages + " صفحات"}؛ مفيش صفحة ${pg}.` : summary(section, res.length, top.slice(0, 6), gov || place, paged, query, st)) + (more && paged ? ` وفيه كمان ${more} نتيجة: اطلب page=${pg + 1}، أو هات تفاصيل نتيجة بالـ id بتاعها من platform_item.` : "") };
}
/* a query with letters and not one Arabic letter (acier, Stahl, сталь, 钢铁 — or English the EN map does not know): the platform's data is
   Arabic + English, so a 0-result answer must not read as «none exist» — the model translates the word and searches again (any-language
   plan 2026-11-20). Arabic queries keep today's text byte for byte. */
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const foreignQuery = q => /\p{L}/u.test(String(q || "")) && !ARABIC_LETTER.test(String(q || ""));
/* m = the caller is Bassem (his tool definition sends page / market — holo5 `paged`): the same text in the masculine; Janna keeps hers.
   st = the honest counts of the query's words: all = results that hold every word (of one item of a list), rel = from the same field only */
function summary(section, n, top, where, m, query, st = null) {
  if (!n) return "لا توجد نتائج مطابقة في دليل المنصة لهذا البحث" + (where ? " في " + where : "") + (m ? ". لا تخترع نتائج؛ اقترح كلمات بحث أخرى أو نشر طلب عرض سعر مجاني." : ". لا تخترعي نتائج؛ اقترحي كلمات بحث أخرى أو نشر طلب عرض سعر مجاني.")
    + (!foreignQuery(query) ? "" : m ? " بيانات المنصة بالعربي والإنجليزي: لو الكلمة بلغة تانية ترجمها للعربي (acier = حديد) ودوّر تاني قبل ما تقول مفيش."
      : " بيانات المنصة بالعربي والإنجليزي: لو الكلمة بلغة تانية ترجميها للعربي (acier = حديد) ودوّري تاني قبل ما تقولي مفيش.");
  const has = r => (r.match && r.match !== "all" && r.matched && r.matched.length ? (r.match === "related" ? "؛ من نفس المجال: " : "؛ فيها: ") + r.matched.join(" و") : "");
  const items = top.map(r => r.sectors !== undefined ? `${r.name} (${r.governorate}${r.sectors ? "، قطاعات: " + r.sectors : ""}${has(r)})` : r.name ? `${r.name} (${r.activity || ""}${r.location ? "، " + r.location : ""}${has(r)})` : r.title ? `${r.title} — ${r.entity} — ${r.status}${r.deadline ? "، آخر موعد " + r.deadline : ""}${has(r) ? " (" + has(r).slice(2) + ")" : ""}` : r.product ? `${r.product}${r.store ? " في " + r.store + " بسعر " + r.price_egp + " جنيه" : r.maker ? " — " + r.maker : ""}${has(r) ? " (" + has(r).slice(2) + ")" : ""}` : r.name_en || "");
  const tail = `هذه بيانات حقيقية من المنصة؛ ${m ? "اذكر منها فقط ولا تضيف" : "اذكري منها فقط ولا تضيفي"} بيانات تواصل (التواصل عبر زر «اطلب عرض سعر» في ملف المنشأة).`;
  if (!st || !st.n) return `عدد النتائج في دليل المنصة: ${n}. أهمها: ${items.join("؛ ")}. ${tail}`;
  const part = n - st.all - st.rel;
  const others = (part ? `${part} نتيجة فيها جزء من الكلمات بس` : "") + (part && st.rel ? " و" : "") + (st.rel ? `${st.rel} من نفس المجال بكلمات قريبة (مش نفس الكلمة)` : "");
  const amb = st.amb ? ` تنبيه: كلمة «${st.amb.word}» ليها أكتر من معنى (${st.amb.note})؛ ${m ? "اسأل العميل سؤال واحد يقصد أنهي، وبعدين دوّر" : "اسألي العميل سؤال واحد يقصد أنهي، وبعدين دوّري"} بالكلمة الأدق.` : "";
  if (st.all) return `عدد النتائج اللي فيها كل كلمات البحث («${st.words}») في دليل المنصة: ${st.all}${others ? "، وفيه كمان " + others : ""}. أهمها: ${items.join("؛ ")}.${amb} ${tail}`;
  return `مفيش نتيجة في دليل المنصة فيها كل كلمات البحث («${st.words}»)؛ أقرب النتائج: ${others}. أهمها: ${items.join("؛ ")}. ${m ? "قولها على إنها أقرب نتايج، مش مطابقة" : "قوليها على إنها أقرب نتايج، مش مطابقة"}.${amb} ${tail}`;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Janna-Key" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });

/* POST /api/janna/lookup answers lean for the model (speed 2026-11-20: 1.2–2.0k tokens a result list → −36 … −52 %, and 45 % of it was
   URLs): a result with its own page keeps only open_url, DECODED («/factories/مصنع-…/» instead of %D8%… — easier to copy; the call page
   re-encodes links before they go into an e-mail), and ref / ref_no only when they differ from the id; per_page and empty place /
   widened_to / governorate are left out. `text` is never touched. GET (the site, the tests) keeps the full shape. */
export function leanLookup(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.results)) return o;
  const results = o.results.map(r => {
    if (!r || typeof r !== "object") return r;
    const x = { ...r };
    if (x.open_url) {
      delete x.url; delete x.list_url; delete x.list_key;
      try { x.open_url = decodeURI(x.open_url); } catch (e) { /* a malformed escape: keep it encoded */ }
    }
    if (x.id != null && x.ref_no != null && String(x.ref_no) === String(x.id)) delete x.ref_no;
    if (x.id != null && x.ref != null && String(x.ref) === String(x.id)) delete x.ref;
    return x;
  });
  const y = { ...o, results };
  delete y.per_page;
  for (const k of ["place", "widened_to", "governorate"]) if (y[k] == null) delete y[k];
  return y;
}
/* Anam's webhooks hear only "HTTP error 400" from a refused call and retry blind (8f4d017e turn 74: 32 s): a malformed POST gets 200 with a
   text the model can act on (never results it could repeat); GET keeps the status codes. Each such answer is one log line (toolSoftError). */
const LOOKUP_TEXT = {
  bad_json: "طلب البحث وصل ناقص. ابعت section و query تاني مرة واحدة بس؛ ولو فشل تاني قول إن البحث مش متاح دلوقتي، ومفيش نتايج تتقال من غير بحث.",
  no_query: "مفيش كلمة بحث في الطلب: لازم query فيها المنتج أو النشاط أو اسم الشركة (زي حديد أو بلاستيك). لتفاصيل بند واحد بالـ id أو الرقم استخدم platform_item. لو مش واضح العميل بيدوّر على إيه اسأله الأول.",
};
/* speed 2026-11-20: these read only the bundled data (data.json / items.json) or their own tables, never what ccBoot loads (plans matrix,
   mail config, service keys, feature switches) — a cold isolate saved 1.2–1.4 s of nine D1 reads on every Anam webhook */
const BARE = new Set(["/api/janna/lookup", "/api/janna/item", "/api/janna/knowledge", "/api/janna/health", "/api/janna/timing"]);

const WORKER = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p0 = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    let bootMs = 0; // how long ccBoot took for this request (the session token's Server-Timing «boot»)
    if (!BARE.has(p0)) { const b0 = Date.now(); try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ } bootMs = Date.now() - b0; }
    // Control Center first: the /api/me, /api/auth and /api/admin regexes below would swallow these paths (ACC-CONTRACT §3.0).
    // Every family is anchored at the start of the path (review F9): /api/janna/x/api/admin/cc/… is NOT the Control Center, so a WAF /
    // Access / IP rule written for /api/admin/* or /api/me/* cannot be bypassed through another routed prefix.
    if (/^\/data\/overlay\.js$/.test(url.pathname)) return CC.content.serveOverlay(req, env, ctx);
    if (/^\/media\/u\//.test(url.pathname)) return CC.content.serveMedia(req, env, ctx);
    if (/^\/api\/index\.php$/.test(url.pathname)) return CC.acc.handleOldApi(req, env, ctx);
    if (/^\/api\/admin\/cc(\/|$)/.test(url.pathname)) return CC.acc.handleCC(req, env, ctx, CC);
    if (/^\/api\/me\/(account|products|company|media|invoices|recognize|gcc)(\/|$)/.test(url.pathname)) return CC.acc.handleMeCC(req, env, ctx, CC);
    if (/^\/api\/me\/delete-request\/?$/.test(url.pathname)) return handleMeDeleteRequest(req, env, ctx); // before /api/me (handleMe would 404 it)
    if (/^\/api\/auth\/legacy(\/|$)/.test(url.pathname)) return CC.acc.handleLegacyAuth(req, env, ctx, CC);
    if (/^\/api\/team(\/|$)/.test(url.pathname)) return CC.acc.handleTeam(req, env, ctx, CC); // §12 team dashboards (front desk)
    if (/^\/api\/plans\/?$/.test(url.pathname) || /^\/api\/settings\/?$/.test(url.pathname) || /^\/api\/ev\/pv\/?$/.test(url.pathname)) return CC.acc.handlePublicCC(req, env, ctx, CC); // one regex per family: integ-worker.test.mjs and deploy.sh scan for /api/<family>
    if (/^\/api\/pay(\/|$)/.test(url.pathname)) return CC.payments.handlePay(req, env, ctx, CC);
    if (/^\/api\/advisor\/profile\/?$/.test(url.pathname)) return handleProfile(req, env, ctx); // before the /api/advisor catch-all (holo4, profile.js)
    // ---- Bassem web search (src/websearch.js) — before the /api/advisor family, which would swallow it ----
    if (/^\/api\/advisor\/web\/?$/.test(url.pathname)) return handleWebSearch(req, env, ctx);
    if (/^\/api\/advisor\/memory(\/|$)/.test(url.pathname)) return handleMemory(req, env, ctx); // before the advisor family (memory.js)
    if (/^\/api\/advisor(\/|$)/.test(url.pathname)) return handleAdvisor(req, env, ctx);
    if (/^\/api\/meetings(\/|$)/.test(url.pathname)) return handleMeetings(req, env, ctx);
    if (/^\/api\/auth(\/|$)/.test(url.pathname)) return handleAuth(req, env, ctx);
    if (/^\/api\/me(\/|$)/.test(url.pathname)) return handleMe(req, env, ctx);
    if (/^\/api\/inquiries(\/|$)/.test(url.pathname)) { const res = await handleInquiries(req, env, ctx); if (req.method === "POST" && res.status === 201) { try { const j = await res.clone().json(); if (j && j.ref) ctx.waitUntil(CC.payments.onInquiryCreated(env, j.ref, CC)); } catch (e) { /* ignore */ } } return res; }
    if (/^\/api\/admin(\/|$)/.test(url.pathname)) return handleAdmin(req, env, ctx);
    if (/^\/api\/ev\/?$/.test(url.pathname)) return handleEv(req, env, ctx);
    if (/^\/api\/unsub\/?$/.test(url.pathname)) return handleUnsub(req, env, ctx);
    if (/^\/api\/wa(\/|$)/.test(url.pathname)) return handleWA(req, env, ctx);
    if (/^\/api\/janna\/session\/?$/.test(url.pathname)) return handleJannaSession(req, env, ctx, { bootMs });
    if (/^\/api\/janna\/item\/?$/.test(url.pathname)) return handleItem(req, env, ctx); // holo5, janna-item.js
    if (/^\/api\/janna\/memory\/erase-request\/?$/.test(url.pathname)) return handleVisitorEraseRequest(req, env, ctx); // 0010: a request only (visitor_erase_request)
    if (/^\/api\/janna\/memory(\/|$)/.test(url.pathname)) return handleVisitorMemory(req, env, ctx); // 0009, visitor.js
    if (/^\/api\/janna\/knowledge\/?$/.test(url.pathname)) return handleKnowledge(req, env, ctx); // 0009, knowledge.js
    if (/^\/api\/janna\/timing\/?$/.test(url.pathname)) return handleTiming(req, env, ctx); // live-timing.js (same-origin beacon: no CORS)
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (/^\/api\/janna\/health\/?$/.test(url.pathname)) return json({ ok: true, data: DATA.v, factories: DATA.f.length, products: DATA.p.length, tenders: DATA.t.length, rfqs: DATA.q.length, offers: DATA.o.length, zones: DATA.z.length, items: (DATA.i || []).length });
    if (!/^\/api\/janna\/lookup\/?$/.test(url.pathname)) return json({ error: "not found" }, 404);
    if (env && env.JANNA_KEY && req.headers.get("X-Janna-Key") !== env.JANNA_KEY) return json({ error: "unauthorized" }, 401);
    const post = req.method === "POST";
    let a = Object.fromEntries(url.searchParams);
    if (post) { try { a = Object.assign(a, await req.json()); } catch (e) { toolSoftError("/api/janna/lookup", "bad_json"); return json({ error: "bad json", count: 0, results: [], text: LOOKUP_TEXT.bad_json }, 200); } }
    const section = ["factories", "suppliers", "products", "market", "tenders", "rfqs", "offers", "cities"].includes(a.section) ? a.section : "factories";
    if (!a.query && !a.governorate) { if (post) toolSoftError("/api/janna/lookup", "query_required"); return json({ error: "query required", count: 0, results: [], text: LOOKUP_TEXT.no_query }, post ? 200 : 400); }
    const r = search(section, String(a.query || "").slice(0, 200), String(a.governorate || "").slice(0, 60), a.limit, a.page, a.market);
    return json(post ? leanLookup(r) : r);
  },
  /* Cloudflare Email Routing → replies to deal-<id>@reply.madeinegyptgate.com (AI Deal Advisor) */
  async email(message, env, ctx) {
    try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }
    // inq-<ref>[-<key>]@REPLY_DOMAIN → inquiry thread (factory reply / buyer message); deal-<id>@… → AI Deal Advisor
    if (isInquiryAddress(message.to, env || {})) await handleInquiryEmail(message, env || {}, ctx);
    else await handleEmail(message, env, ctx);
  },
  /* Cron Trigger (wrangler.toml [triggers]): meeting reminders + recording/summary processing retries */
  async scheduled(controller, env, ctx) {
    try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }
    ctx.waitUntil(meetingsCron(env).then(r => console.log("meetings cron", JSON.stringify(r)), e => console.error("meetings cron", e && e.stack || e)));
    ctx.waitUntil(platformCron(env).then(r => console.log("platform cron", JSON.stringify(r)), e => console.error("platform cron", e && e.stack || e)));
  },
};
export default WORKER;
/* «🛠️ المطوّر» health (acc-dev.js): this Worker's own APIs are checked IN-PROCESS — a fetch from a Worker to its own zone skips the Workers
   routes of that zone (no global_fetch_strictly_public flag here), so it could never reach them through the front door */
CC.self = { fetch: (req, env, ctx) => WORKER.fetch(req, env, ctx) };
/* every 15 min: inquiry retries / 48 h reminders / 30-day auto-close; once a day after 07:00 Cairo: digests + deadline
   reminders; Bassem's WhatsApp at each member's own time; once a Cairo day after midnight: the memory consolidation (memory.js) and then
   the daily memory update (daily.js: day digests, «ملخص العميل», tasks, knowledge merge, caps report). Each part is isolated so one
   failure does not stop the others. */
export async function platformCron(env, nowMs = Date.now()) {
  const out = {};
  if (!env || !env.DB) return out;
  /* review 2026-11-19 #2: the two memory jobs share ONE counting D1 with a budget (memory.js TICK.budget statements) so this invocation stays
     far below D1's 1,000 queries even on the busiest night (meetings / inquiries run in the same invocation); the daily update waits for
     the next tick when the consolidation did work in this one */
  const menv = budgetEnv(env, TICK.budget), busy = () => !!(out.daily && out.daily.ran); // the 07:00 digests tick (its item sync is ~800 statements) runs no memory job
  for (const [k, fn] of [["inquiries", () => inquiriesCron(env, nowMs)], ["daily", () => dailyJobs(env, nowMs)], ["bassem", () => bassemCron(env, nowMs, m => newCountFor(env, m, nowMs))], ["cc", () => CC.acc.ccCron(env, nowMs, CC)],
    ["memory", () => (busy() ? { skipped: "daily digests ran in this tick" } : memoryCron(menv, nowMs))],
    ["memory_day", () => (busy() ? { skipped: "daily digests ran in this tick" } : out.memory && out.memory.rebuilt ? { skipped: "consolidation ran in this tick" } : dailyMemory(menv, nowMs))]]) {
    try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e && e.message || e) }; console.error("platform cron " + k, e && e.stack || e); }
  }
  return out;
}
export { search };
