/* Janna lookup API — Cloudflare Worker for madeinegyptgate.com
   Lets the live assistant «جنة» (Anam persona, SERVER_WEBHOOK tool "janna_lookup") search the platform's real public
   directory (factories & companies, products, tenders, RFQs, retail offers, industrial cities) and SAY the results.
   - POST /api/janna/lookup   body {section, query, governorate?, limit?, page?, market?}  → {count, page, pages, has_more, results[], text}
     (lean for the model: leanLookup below; a malformed request still answers 200 with a `text` the model can act on — never a bare 400)
     sections (LOOKUP_SECTIONS): the directory, products, tenders, rfqs, offers, cities + customers (a seller's customer industries →
     directory factories, src/lookup-customers.js), projects, events, news, awards; the members' approved products / companies come from D1
     (src/lookup-members.js, ≤ 1 read per isolate per 10 minutes), tagged «عضو على المنصة»; tenders, rfqs, customers, projects and news
     also say the published web opportunities (src/web-public.js, ≤ 1 read per isolate per 10 minutes) AFTER the platform's own results,
     counted apart (extra / extra_count — count stays the platform's), as information only: no source, no site, no link
   - GET  /api/janna/lookup?section=&query=&governorate=&page=               (the full shape, for testing / the website)
     each result also carries id (for /api/janna/item), open_url (the item's own page) and, for tenders, the amounts the data has
   - GET|POST /api/janna/item {section, id|ref|title}  → the full public record of ONE item + a spoken summary (src/janna-item.js)
   - GET  /api/janna/health
   - GET  /api/janna/opportunities?type=&market=&q=&page=  «فرص السوق»: the published web opportunities, never their source (src/web-public.js)
   - POST /api/janna/timing   the live-call page's start timing beacon → 204 + one log line of numbers (src/live-timing.js)
   - POST /api/janna/media/look · /api/janna/media/ticket · /api/advisor/media/look  📎 a photo of Janna's / Bassem's chat, read once by
     Workers AI and never stored → the guarded text block the page gives the persona (src/chat-media.js, switch chat_photos)
   The webhook routes, the health check and the timing beacon skip ccBoot (BARE below): they read only the bundled data or their own tables
   (the lookup: the two member tables, memoised for 10 minutes).
   Security: if the secret JANNA_KEY is set (wrangler secret put JANNA_KEY), requests must send header X-Janna-Key with it
   (the Anam tool sends it). No API keys are stored in the code. Data = worker/src/data.json (public directory only; no phones). */
import DATA from "./data.json";
import ITEMS from "./items.json"; // projects (j) and awards (a) for the lookup's sections of the same name (already bundled for janna-item.js)
import { custTerms } from "./lookup-customers.js"; // section=customers: the seller's customer industries → the platform's activity labels
import { memberData, MEMBER_TAG } from "./lookup-members.js"; // the members' approved products / companies, live from D1 (≤ 1 read / 10 min)
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
import { handleItem, enrichResult, absUrl, eventStatus } from "./janna-item.js"; // /api/janna/item  one item in full + the lookup results' ids / open_url / amounts
import { handleMemory, memoryCron, budgetEnv, TICK } from "./memory.js"; // /api/advisor/memory  Bassem's memory (searches, call turns, summaries, facts)
// ---- 0009 memory upgrades: Janna's visitor memory, «بنك المعلومات», the daily memory update ----
import { handleVisitorMemory } from "./visitor.js";   // /api/janna/memory[/tasks]  Janna's memory of her visitors
import { handleKnowledge } from "./knowledge.js";     // /api/janna/knowledge  the personas' knowledge_lookup tool
import { dailyMemory } from "./daily.js";              // day digests + «ملخص العميل» + tasks / knowledge merge / caps report (once per Cairo day)
import { dailyJobs, newCountFor } from "./digest.js";
import { cairoDay, addDays, toolSoftError } from "./common.js";
// ---- web search (src/websearch.js) + the opportunity hunt (src/web-hunt.js): Bassem POST /api/advisor/web|hunt, Janna POST /api/janna/web|hunt ----
import { handleWebSearch, handleJannaWebSearch, WS_MARKETS } from "./websearch.js";
import { handleJannaHunt, handleBassemHunt } from "./web-hunt.js";
// ---- «فرص السوق» (src/web-public.js): the web leads published on the platform — GET /api/janna/opportunities (the page /market-opportunities/)
//      and, in janna_lookup, after the platform's own results (switches web_leads_public / web_leads_lookup; never a source) ----
import { publishedLeads, publicItem, handlePublicLeads } from "./web-public.js";
// ---- 📎 photos in Janna's and Bassem's chats (src/chat-media.js, switch chat_photos): read once by Workers AI, never stored ----
import * as CHATMEDIA from "./chat-media.js";
// Admin Control Center (docs/janna/ACC-CONTRACT.md §0.2): one CC object handed to every new handler (no cross-area imports)
import * as ACC from "./acc.js"; import * as CONTENT from "./content.js"; import * as PAY from "./payments.js"; import * as MAILC from "./email-center.js";
export const CC = { acc: ACC, content: CONTENT, payments: PAY, email: MAILC, chatMedia: CHATMEDIA };   // Control Center (ACC-CONTRACT §0.2)

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
    /* a row's stored words: [description words, name + product words] (also read again for a member's edit of the row: memberIx) */
    const words = i => { const f = F[i]; if (typeof f[6] !== "string" || !FV.length) return [[], formsOf(f[0] + " " + f[4])]; const bar = f[6].indexOf("|"); return [dec(f[6].slice(bar + 1)), dec(f[6].slice(0, bar))]; };
    const labOf = L => { let ls = LC.get(L); if (!ls) { ls = new Set(formsOf(L)); LC.set(L, ls); } return ls; };
    const ix = buildIx(F.length, i => {
      const f = F[i];
      lab.push(labOf((f[2] || "") + " " + (Number.isInteger(f[7]) && f[7] >= 0 ? FS[f[7]] || "" : ""))); loc.push(norm(f[3])); nm.push(" " + norm(f[0]) + " ");
      return words(i);
    }, [2, 3]);
    return Object.assign(ix, { lab, loc, nm, words, labOf });
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
/* U15: the dated lists already bundled — events and news from data.json i (worker/build-index.js: [kind, id, date, sector, governorate, title,
   page, deadline, market, entity / source, source url]), projects (items.json j) and contract awards (items.json a). A placeholder
   governorate («غير محددة») is no word of a record. */
const NO_GOV = "غير محددة", govOf = g => (g && g !== NO_GOV ? g : "");
const kindIx = (key, kind, fields, W) => ixOf(key, () => { const I = DATA.i || [], rows = []; I.forEach((x, i) => { if (x && x[0] === kind) rows.push(i); }); return Object.assign(buildIx(rows.length, k => fields(I[rows[k]]), W), { rows }); });
const eventIx = () => kindIx("e", "event", x => [formsOf(x[5]), formsOf(x[3]), formsOf(x[9] + " " + govOf(x[4]))], [3, 2, 1]);
const newsIx = () => kindIx("n", "news", x => [formsOf(x[5]), formsOf(x[3]), formsOf(govOf(x[4])), formsOf(x[9])], [3, 2, 1, 0.5]);
const projectIx = () => ixOf("j", () => { const J = ITEMS.j || []; return buildIx(J.length, i => { const p = J[i]; return [formsOf(p.name), formsOf(p.sector + " " + p.stage), formsOf([p.location, p.gov, p.owner, p.contractor, p.consultant].join(" ")), formsOf(p.news)]; }, [3, 2, 1, 1]); });
const awardIx = () => ixOf("a", () => { const A = ITEMS.a || []; return buildIx(A.length, i => { const a = A[i]; return [formsOf(a.title), formsOf(a.winner + " " + a.entity), formsOf(a.gov + " " + a.city)]; }, [3, 1.5, 1]); });
/* ---------- the members' own records (U16, src/lookup-members.js): live from D1, tagged «عضو على المنصة» ----------
   A member's approved company (a new listing, or his approved edit of his own listing) and approved products are indexed beside the
   bundled data, once per version of the D1 memo; the bundled row they replace (the same listing, or the same product once a deploy
   bundled it) is left out, so a record never shows twice. */
let REF_ROW = null; // the hash ref of «company.html#<ref>» → its data.json f row
const refRow = ref => { if (!REF_ROW) { REF_ROW = new Map(); (DATA.f || []).forEach((f, i) => { const m = /#(.+)$/.exec(String(f[5] || "")); if (m && !REF_ROW.has(m[1])) REF_ROW.set(m[1], i); }); } return REF_ROW.get(ref); };
let P_NORM = null, MIX = null;
function memberIx(mem) {
  if (!mem || !mem.v || (!mem.companies.length && !mem.products.length)) return null;
  if (MIX && MIX.v === mem.v) return MIX;
  const X = dirIx(), F = DATA.f, FS = DATA.fs || [], co = [], shadow = new Set(), nameOf = new Map();
  for (const c of mem.companies) {
    const bi = refRow(c.ref), b = bi != null ? F[bi] : null;
    if (!b && c.kind !== "create") continue; // an approved edit of a listing this data does not hold (a later deploy brings it)
    const name = c.name || (b ? b[0] : ""); if (!name) continue;
    const where = c.location ? c.location + (c.gov && !c.location.includes(c.gov) ? "، " + c.gov : "") : b ? b[3] : c.gov;
    const f = [name, c.type || (b ? b[1] : "") || "مصنع", c.activity || (b ? b[2] : ""), where || "", c.products.length ? c.products.join("، ") : b ? b[4] : "", "company.html#" + c.ref];
    const bw = b ? X.words(bi) : [[], []];
    co.push({ f, create: !b, w: [c.description ? formsOf(c.description) : bw[0], [...new Set([...formsOf(name + " " + f[4]), ...bw[1]])]],
      lab: X.labOf(f[2] + " " + (b && Number.isInteger(b[7]) && b[7] >= 0 ? FS[b[7]] || "" : "")) });
    if (bi != null) shadow.add(bi);
    nameOf.set(c.ref, name);
  }
  const dir = Object.assign(buildIx(co.length, i => co[i].w, [2, 3]), { rows: co, shadow, lab: co.map(x => x.lab), loc: co.map(x => norm(x.f[3])), nm: co.map(x => " " + norm(x.f[0]) + " ") });
  if (!P_NORM) P_NORM = (DATA.p || []).map(q => [norm(q[0]), norm(q[1])]);
  const pr = [], pshadow = new Set();
  for (const p of mem.products) {
    const bi = p.ref ? refRow(p.ref) : undefined, maker = nameOf.get(p.ref) || (bi != null ? F[bi][0] : "");
    pr.push({ p, maker, w: [formsOf(p.name + " " + p.name_en), formsOf(maker + " " + p.description)] });
    const nn = norm(p.name), nmk = norm(maker), nd = norm(p.description);
    P_NORM.forEach((q, j) => { if (q[0] === nn && ((nmk && q[1].includes(nmk)) || (nd && q[1] === nd))) pshadow.add(j); });
  }
  const prod = Object.assign(buildIx(pr.length, i => pr[i].w, [3, 1]), { rows: pr, shadow: pshadow });
  return (MIX = { v: mem.v, dir, prod });
}
/* two matches side by side (rows of A, then rows of B): one ranking over the bundled rows and the members' rows */
function catM(A, B, nc) {
  if (!B || !B.n) return A;
  const n = A.n + B.n, w = new Float32Array(nc * n), t = new Uint8Array(nc * n);
  for (let c = 0; c < nc; c++) {
    w.set(A.w.subarray(c * A.n, (c + 1) * A.n), c * n); w.set(B.w.subarray(c * B.n, (c + 1) * B.n), c * n + A.n);
    t.set(A.t.subarray(c * A.n, (c + 1) * A.n), c * n); t.set(B.t.subarray(c * B.n, (c + 1) * B.n), c * n + A.n);
  }
  return { w, t, n };
}
/* the directory as one list: data.json f rows (0 … n-1), then the members' companies (n …) */
function dirView(MX) {
  const X = dirIx(), n = X.n, Y = MX && MX.dir.n ? MX.dir : null;
  return { n, N: n + (Y ? Y.n : 0), member: i => i >= n, create: i => i >= n && Y.rows[i - n].create, hidden: i => !!(Y && i < n && Y.shadow.has(i)),
    row: i => (i < n ? DATA.f[i] : Y.rows[i - n].f), lab: i => (i < n ? X.lab[i] : Y.lab[i - n]), loc: i => (i < n ? X.loc[i] : Y.loc[i - n]), nm: i => (i < n ? X.nm[i] : Y.nm[i - n]),
    match: CC => catM(matchIx(X, CC), Y ? matchIx(Y, CC) : null, CC.length) };
}
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
   must hold one specific word (held by at most ~5 % of the list: SPECIFIC; for a partial result in a list shorter than 60 rows — rfqs,
   events, awards — by at most a fifth of it) — «الأعشاب الطبية» returns no tender that only says «الطبية».
   score = Σ IDF of the words held (the field it is in moves it ±25 %; a same-field word counts a fifth); the activity label adds 15 % of
   a word it holds (a tie-breaker, never a match by itself). */
const RELATED_MAX = 20, SPECIFIC = 3; // ln(1 + 1 / 0.05): a word held by at most ~5 % of the rows
/* adj(i) moves a row's score (tenders: −3 for an undated legacy row with no entity and no governorate — U10) */
function rankRows(C, M, rows, { lab = null, first = null, adj = null } = {}) {
  /* SP: a short list (rfqs 5, events 18, awards 20) has no word held by ≤ 5 % of it — there a word of the query itself held by at most a
     fifth of the list is specific enough for a partial result (a same-field-only result keeps SPECIFIC: none in a short list) */
  const { w, t, n } = M, nc = C.length, SP = n >= 60 ? SPECIFIC : Math.log(1 + n / (1 + Math.ceil(n / 5)));
  const df = C.map(() => 0), idf = C.map((_, c) => { let d1 = 0, d = 0; for (let i = 0; i < n; i++) { const x = t[c * n + i]; if (x === 1) d1++; if (x) d++; } df[c] = d; return Math.log(1 + n / (1 + (d1 || d))); });
  const parts = []; C.forEach((c, j) => { (parts[c.part] = parts[c.part] || []).push(j); });
  const PI = parts.filter(Boolean).map(P => { const Q = P.filter(c => df[c] > 0); return { P, Q, mass: Q.reduce((s, c) => s + idf[c], 0), rare: Q.length ? Q.reduce((b, c) => (idf[c] > idf[b] ? c : b), Q[0]) : -1 }; }).filter(x => x.Q.length);
  const lab1 = C.map(c => c.alts.filter(a => a.tier === 1 && a.toks.length === 1).map(a => a.toks[0]));
  const out = [];
  for (const i of rows) {
    let cls = 3;
    for (const { P, Q, mass, rare } of PI) {
      let m1 = 0, m1s = 0, ms = 0, sp1 = false, sp = false;
      for (const c of Q) { const x = t[c * n + i]; if (x === 1) { m1++; m1s += idf[c]; if (idf[c] >= SP) sp1 = true; } if (x) { ms += idf[c]; if (idf[c] >= SPECIFIC) sp = true; } }
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
    if (adj) score += adj(i);
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
/* U10: a legacy row of the old site's tender list — no deadline («غير محدد الموعد»), the placeholder entity «جهة حكومية» and no governorate
   (375 of the 436 Egyptian tenders): it ranks 3 below an equal match, and the text calls it «قديمة من غير ميعاد» */
const legacyTender = t => !String(t[7] || "").trim() && t[4] === "جهة حكومية" && !govOf(t[5]);
/* the lookup's sections (the route's whitelist; an unknown one is searched as factories, as before) + the names a model may send */
export const LOOKUP_SECTIONS = ["factories", "suppliers", "products", "market", "tenders", "rfqs", "offers", "cities", "customers", "projects", "events", "news", "awards"];
const SECTION_ALIAS = { buyers: "customers", customer: "customers", clients: "customers", project: "projects", event: "events", exhibitions: "events", exhibition: "events", award: "awards", winners: "awards", article: "news" };
export const lookupSection = s => { const k = String(s == null ? "" : s).trim().toLowerCase(); return LOOKUP_SECTIONS.includes(k) ? k : SECTION_ALIAS[k] || "factories"; };
/* the words that only name the section itself («معارض» in the events list, «مشروعات» in the projects list …): left out of the query; a query
   of those words only lists the section (events: the next ones first, news: the newest first) */
const SECTION_WORDS = Object.fromEntries(Object.entries({
  events: "معرض معارض المعرض المعارض معرضين فعاليه فعاليات مؤتمر مؤتمرات ملتقي ملتقى اكسبو expo exhibition exhibitions fair fairs event events show shows trade امتي امتى ميعاد موعد مواعيد",
  news: "خبر اخبار الاخبار جديد جديده اخر آخر النهارده النهارده امبارح دلوقتي الاسبوع news latest today yesterday",
  projects: "مشروع مشروعات مشاريع المشروعات المشاريع project projects",
  awards: "ترسيه ترسيات الترسيه الترسيات عقد عقود فاز فازت كسب كسبت award awards awarded contract contracts winner winners won",
}).map(([k, v]) => [k, new Set(v.split(" ").map(w => lkCanon(norm(w))))]));
const dropSectionWords = (section, q) => { const S = SECTION_WORDS[section]; if (!S) return q; return q.split(" ").filter(w => w && !S.has(lkCanon(w)) && !(/^[وبلف]/.test(w) && w.length > 3 && S.has(lkCanon(w.slice(1))))).join(" "); };
const dayOf = d => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 10) : "");
const dayNum = d => (d ? Date.parse(d + "T12:00:00Z") / 86400000 : 0);
/* page: 1-based (10 results at most per page); market (tenders only): local (default — the Egyptian list, as before) | gulf | africa |
   asia | europe | intl (all four) | all (Egyptian + international). opts.members = the D1 memo of src/lookup-members.js (the route reads it
   for the directory, product and customers sections; without it only the bundled data is searched); opts.nowMs = the clock (tests). */
function search(section, query, governorate, limit, page, market, { members = null, web = null, nowMs = Date.now() } = {}) {
  /* the paging / open-one hint only for a caller that pages or picks markets (Bassem's new definition); Janna's tool has neither */
  const paged = (page != null && page !== "") || (market != null && market !== "");
  const MX = memberIx(members);
  if (section === "customers") return withWeb(section, customers(query, governorate, paged, MX), query, governorate, market, web, paged, nowMs);
  const P = parse(query, governorate), { gov, place } = P;
  const L = Math.min(Math.max(+limit || 6, 1), 10), res = [], M = marketOf(market), mk = M.mk || "local";
  if (section === "tenders" && M.bad) return { section, query, governorate: gov || null, place: place || null, market: null, market_unknown: M.bad, markets: MARKETS, widened_to: null, count: 0, page: 1, pages: 1, per_page: L, has_more: false, results: [],
    text: `السوق «${M.bad}» مش من أسواق بحث المناقصات على المنصة، فمادورتش. الأسواق المتاحة: local (مصر)، gulf (الخليج)، africa (أفريقيا)، asia (آسيا)، europe (أوروبا)، intl (كل الدولية)، all (مصر والدولية). دوّر تاني بواحد منهم، ومتقولش نتايج من سوق تاني على إنها من السوق ده.` };
  const Q = lkConcepts(dropSectionWords(section, P.q), dirVocab), C = Q.concepts, CC = C.map(compile);
  const all = (n, ok) => { const o = []; for (let i = 0; i < n; i++) if (ok(i)) o.push({ i, cls: 0, score: 0, matched: [] }); return o; };
  const ranked = (ix, ok, opt) => (C.length ? rankRows(C, matchIx(ix, CC), Array.from({ length: ix.n }, (_, i) => i).filter(ok), opt) : all(ix.n, ok));
  /* with no word, the rows in `first` order (events: the next first; news: the newest first) */
  const byFirst = (list, first) => (C.length || !first ? list : list.map(r => ({ ...r, f: first(r.i) })).sort((a, b) => b.f - a.f || a.i - b.i));
  const company = f => ({ name: f[0], type: f[1], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] });
  const memberTag = (V, i, o) => (V.member(i) ? Object.assign(o, { member: true, tag: MEMBER_TAG }, V.create(i) ? { create: true } : {}) : o);
  let widened = null;
  if (section === "factories" || section === "suppliers" || section === "products" || section === "market") {
    const V = dirView(MX), prod = section === "products" || section === "market";
    const rankedV = (ok, opt) => { const rows = []; for (let i = 0; i < V.N; i++) if (!V.hidden(i) && ok(i)) rows.push(i); return C.length ? rankRows(C, V.match(CC), rows, opt) : rows.map(i => ({ i, cls: 0, score: 0, matched: [] })); };
    /* a company asked for by its name («الشركة المتحدة المصرية», «شركة العبوات والمستلزمات»: their generic words decide no match):
       a record whose name holds the query's own words, in order, leads its class (review 2026-11-20); then a member's own record */
    const nq = " " + P.q.split(" ").filter(w => w && !STOP.has(w)).join(" ") + " ", named = nq.trim().indexOf(" ") > 0 ? i => (V.nm(i).includes(nq) ? 1 : 0) : () => 0;
    const first = i => named(i) * 2 + (V.member(i) ? 1 : 0);
    if (prod && C.length) {
      const PX = productIx(), Y = MX && MX.prod.n ? MX.prod : null, n = PX.n, rows = [];
      for (let i = 0; i < n + (Y ? Y.n : 0); i++) if (!(Y && i < n && Y.shadow.has(i))) rows.push(i);
      for (const r of rankRows(C, catM(matchIx(PX, CC), Y ? matchIx(Y, CC) : null, CC.length), rows, { first: i => (i >= n ? 1 : 0) })) {
        if (r.i < n) { const p = DATA.p[r.i]; res.push([r, tag(P, C, r, { product: p[0], maker: p[1], category: p[2], url: SITE + "market.html" })]); }
        else { const y = Y.rows[r.i - n]; res.push([r, tag(P, C, r, { product: y.p.name, maker: y.maker ? "من إنتاج " + y.maker : "", category: y.p.category, url: SITE + "market.html", open_url: SITE + "market.html", member: true, tag: MEMBER_TAG })]); }
      }
    }
    const dir = rankedV(i => locOk(V.loc(i), gov, place), { lab: V.lab, first });
    for (const r of prod ? dir.filter(r => r.cls < 2) : dir) { if (prod && !C.length) break; const f = V.row(r.i); res.push([r, memberTag(V, r.i, tag(P, C, r, prod ? { name: f[0], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] } : company(f)))]); }
    /* a specific industrial city with few hits (all words or part of them: a same-field result does not count — review 2026-11-20,
       «أكياس بلاستيك … العاشر من رمضان»: 3 same-field results there kept the bag makers of الشرقية out): widen to its governorate and say so */
    const strong = () => res.filter(r => r[0].cls < 2).length;
    if (!prod && place && strong() < 3 && CITY_GOV[place]) {
      const g = norm(CITY_GOV[place]), seen = new Set(res.map(r => r[0].i));
      for (const r of rankedV(i => V.loc(i).includes(g) && !seen.has(i), { lab: V.lab, first })) res.push([r, memberTag(V, r.i, tag(P, C, r, company(V.row(r.i))))]);
      widened = CITY_GOV[place];
      if (strong() >= 3) for (let k = res.length - 1; k >= 0; k--) if (res[k][0].cls === 2) res.splice(k, 1); // same field only when few (rankRows)
      res.sort((a, b) => a[0].cls - b[0].cls); // the city's results first inside each class (the sort is stable)
    }
    if (prod) res.sort((a, b) => a[0].cls - b[0].cls); // products first inside each class (the sort is stable)
  } else if (section === "tenders") {
    if (mk !== "local" && !gov) { const I = DATA.i || [];
      for (const r of ranked(intlIx(), i => I[i][0] === "tender" && I[i][8] !== "local" && (mk === "all" || mk === "intl" || I[i][8] === mk), { first: i => (isOpen(tenderStatus(I[i][7], nowMs)) ? 1 : 0) })) {
        const x = I[r.i], st = tenderStatus(x[7], nowMs); res.push([r, tag(P, C, r, { ref: x[1], type: "مناقصة دولية", status: st, title: x[5], entity: x[9] || "", governorate: x[4] || "", activity: x[3], deadline: x[7] || "", market: x[8], url: SITE + x[6] })]); } }
    if (mk === "local" || mk === "all") { const T = DATA.t, G = norm(gov);
      for (const r of ranked(tenderIx(), i => !gov || norm(T[i][5]).includes(G), { first: i => (isOpen(tenderStatus(T[i][7], nowMs)) ? 1 : 0), adj: i => (legacyTender(T[i]) ? -3 : 0) })) {
        const t = T[r.i], st = tenderStatus(t[7], nowMs); res.push([r, tag(P, C, r, { ref: t[0], type: t[1], status: st, title: t[3], entity: t[4], governorate: t[5] || "غير محددة", activity: t[6], deadline: t[7] || "", url: SITE + "tenders/search/#" + encodeURIComponent(t[0]), ...(legacyTender(t) ? { legacy: true } : {}) })]); } }
    if (mk === "all") res.sort((a, b) => a[0].cls - b[0].cls || b[0].f - a[0].f || b[0].score - a[0].score); // Egyptian + international in one order
  } else if (section === "rfqs") {
    for (const r of ranked(rfqIx(), () => true)) { const q = DATA.q[r.i]; res.push([r, tag(P, C, r, { ref: q[0], date: q[1], title: q[2], details: q[3], quantity: q[4], url: SITE + "rfq/search/#" + encodeURIComponent(q[0]) })]); }
  } else if (section === "offers") {
    for (const r of ranked(offerIx(), () => true)) { const o = DATA.o[r.i]; res.push([r, tag(P, C, r, { product: o[0], brand: o[1], store: o[2], price_egp: o[3], old_price_egp: o[4], valid_to: o[6], url: SITE + o[7] })]); }
  } else if (section === "cities") {
    const G = norm(gov);
    for (const r of ranked(cityIx(), i => !gov || norm(DATA.z[i][3]).includes(G))) { const z = DATA.z[r.i]; res.push([r, tag(P, C, r, { name: z[0], name_en: z[1], type: z[2], governorate: z[3], city: z[4], sectors: z[5], url: SITE + z[6] })]); }
  } else if (section === "events" || section === "news") {
    /* U15: events = the next ones first (then the past ones, newest first); news = the newest first — inside each class of match */
    const ev = section === "events", X = ev ? eventIx() : newsIx(), I = DATA.i || [], G = norm(gov), today = cairoDay(nowMs);
    const first = k => { const d = dayOf(I[X.rows[k]][2]); return !d ? 0 : ev && eventStatus(d, today) !== "انتهى" ? 2e6 - dayNum(d) : dayNum(d); }; // running / next first
    for (const r of byFirst(ranked(X, k => !gov || norm(govOf(I[X.rows[k]][4])).includes(G), { first }), first)) {
      const x = I[X.rows[r.i]], d = dayOf(x[2]);
      /* owner 2026-11-20 «ميكتبش مصدر اي معلومه»: no source name and no source link reach the persona (the organiser of an event is its own) */
      res.push([r, tag(P, C, r, ev ? { title: x[5], date: d, status: eventStatus(d, today), activity: x[3] || "", governorate: govOf(x[4]) || undefined, host: x[9] || undefined, id: x[1], open_url: absUrl(x[6]) }
        : { title: x[5], date: d, category: x[3] || "", governorate: govOf(x[4]) || undefined, id: x[1], open_url: absUrl(x[6]) })]);
    }
  } else if (section === "projects") {
    const J = ITEMS.j || [], G = norm(gov);
    for (const r of ranked(projectIx(), i => !gov || norm(J[i].gov + " " + J[i].location).includes(G))) { const p = J[r.i];
      res.push([r, tag(P, C, r, { title: p.name, governorate: p.gov || undefined, location: p.location || undefined, activity: p.sector || undefined, stage: p.stage || undefined, owner: p.owner || undefined,
        contractor: p.contractor || undefined, value_egp_million: p.value_mn_egp ?? undefined, id: p.id, open_url: absUrl(p.path) })]); }
  } else if (section === "awards") {
    const A = ITEMS.a || [], G = norm(gov);
    for (const r of byFirst(ranked(awardIx(), i => !gov || norm(A[i].gov + " " + A[i].city).includes(G)), i => dayNum(dayOf(A[i].date)))) { const a = A[r.i];
      res.push([r, tag(P, C, r, { title: a.title, winner: a.winner || undefined, entity: a.entity || undefined, governorate: a.gov || undefined, date: a.date || undefined, id: a.id, open_url: absUrl(a.path) })]); }
  }
  const nAll = C.length ? res.filter(r => r[0].cls === 0).length : res.length, nRel = res.filter(r => r[0].cls === 2).length;
  const amb = C.length === 1 && C[0].amb ? { word: sayWord(P, C[0]), note: C[0].amb.note } : null;
  const pages = Math.max(1, Math.ceil(res.length / L)), pg = Math.min(Math.max(Math.floor(+page || 1), 1), 1000), from = (pg - 1) * L;
  const top = res.slice(from, from + L).map(r => { const o = enrichResult(section, r[1]); if (o.create) { delete o.id; delete o.create; } return o; }), more = Math.max(0, res.length - from - top.length);
  /* the words as the query's list items: «مواسير حديد» أو «بلاستيك» (review 2026-11-20: «مواسير أو حديد أو بلاستيك» read as if every
     word were an alternative) */
  const items = []; C.forEach(c => (items[c.part] = items[c.part] || []).push(sayWord(P, c)));
  const st = { words: items.filter(Boolean).map(x => x.join(" ")).join("» أو «"), all: nAll, rel: nRel, amb, n: C.length,
    ...(section === "tenders" ? { open: res.filter(r => isOpen(r[1].status)).length, q: String(query || "").trim().slice(0, 80) } : {}) };
  return withWeb(section, { section, query, governorate: gov || null, place: place || null, market: section === "tenders" ? mk : undefined, widened_to: widened, count: res.length, count_all: nAll, partial: res.length > nAll,
    ...(amb ? { ambiguous: { word: amb.word, meanings: amb.note } } : {}), page: pg, pages, per_page: L, has_more: more > 0, results: top,
    text: (widened ? "نتائج قليلة داخل " + place + " نفسها، فتمت إضافة نتائج من محافظة " + widened + ". " : "") + (pg > pages && res.length ? `دي كانت كل النتائج (${res.length}) في ${pages === 1 ? "صفحة واحدة" : pages + " صفحات"}؛ مفيش صفحة ${pg}.` : summary(section, res.length, top.slice(0, 6), gov || place, paged, query, st)) + (more && paged ? ` وفيه كمان ${more} نتيجة: اطلب page=${pg + 1}، أو هات تفاصيل نتيجة بالـ id بتاعها من platform_item.` : "") },
    query, governorate, market, web, paged, nowMs);
}

/* ---------- «فرص السوق» in janna_lookup (src/web-public.js; owner switch web_leads_lookup) ----------
   The web opportunities published on the platform, for the sections they belong to, AFTER the platform's own results: matched like the
   platform's lists (the query's concepts, whole stored words, all or part of the words — never «the same field» only), on the title and
   the entity (then the product and the words that found it), for words only (a bare section listing never brings them); a governorate in
   the query keeps only the ones of that governorate, a market (Bassem's tool) only that market's; the open / closing / undated first, the
   closed last; ≤ WEB_MAX said. Counted APART: count / count_all stay the platform's own (the platform's numbers never grow with them) —
   extra_count / extra. The text says them as information only: never a site, a source or a link (none is in them), never as the
   platform's own data or a registered company, a closed one never as open, an undated one never as open. */
const WEB_SECTIONS = { tenders: ["tender"], rfqs: ["rfq"], customers: ["buyer", "buyer_list"], projects: ["project"], news: ["news"] };
export const WEB_MAX = 4;
const WEB_MK = { local: ["eg"], gulf: ["gulf", "sa", "ae", "kw", "qa", "om", "bh"], africa: ["africa", "ma", "dz", "tn", "ly", "sd", "ke", "ng", "et", "za"],
  asia: ["asia", "cn", "in", "tr", "jo", "iq"], europe: ["europe", "de", "it", "fr", "es", "gb", "ru"] };
const WIXS = new Map(); // "<memo version>|<types>" → {rows, ix}
function webIx(web, types) {
  const key = web.v + "|" + types.join(",");
  let x = WIXS.get(key); if (x) return x;
  if (WIXS.size > 8) WIXS.clear();
  const rows = web.rows.filter(r => types.includes(r.pub.type));
  x = { rows, ix: buildIx(rows.length, i => [formsOf(rows[i].match), formsOf(rows[i].words)], [3, 2]) };
  WIXS.set(key, x); return x;
}
const WEB_ST = { open: "مفتوحة", closing: "مفتوحة وبتقفل قريب", closed: "منتهية", unknown: "ميعادها مش معروف" };
const WEB_TYPE = { tender: "مناقصة", rfq: "طلب عرض سعر", buyer: "شركة ممكن تبقى عميل", buyer_list: "قايمة مصانع ممكن تبقى عملاء", project: "مشروع جديد", news: "خبر" };
const webPlace = it => [it.governorate, (WS_MARKETS[it.market] || {}).ar].filter(Boolean).join("، ");
/* one published opportunity as the persona gets it: the opportunity only (no id, no link, no site) */
function webLean(it) {
  const st = it.status ? WEB_ST[it.status] + (it.deadline ? (it.status === "closed" ? "، آخر ميعاد كان " : "، آخر ميعاد ") + it.deadline : "") : undefined;
  return { type: it.type, kind: WEB_TYPE[it.type], title: it.title || [WEB_TYPE[it.type], it.product].filter(Boolean).join(" "), entity: it.entity || undefined, product: it.product || undefined,
    status: st, place: webPlace(it) || undefined, official: it.official || undefined, found: it.found || undefined };
}
function webOf(section, query, governorate, market, web, nowMs) {
  const types = WEB_SECTIONS[section];
  if (!types || !web || web.off || !web.lookup || !Array.isArray(web.rows) || !web.rows.length) return null;
  const P = parse(query, governorate), C = lkConcepts(dropSectionWords(section, P.q), dirVocab).concepts;
  if (!C.length) return null;
  const X = webIx(web, types); if (!X.rows.length) return null;
  const M = marketOf(market), pick = market != null && market !== "" && M.mk ? M.mk : "", G = P.gov ? norm(P.gov) : "";
  const ok = i => { const p = X.rows[i].pub; if (G && !norm(p.governorate || "").includes(G)) return false; if (pick && WEB_MK[pick] && !WEB_MK[pick].includes(p.market)) return false; return !(pick === "intl" && p.market === "eg"); };
  const rows = []; for (let i = 0; i < X.rows.length; i++) if (ok(i)) rows.push(i);
  const items = rankRows(C, matchIx(X.ix, C.map(compile)), rows).filter(r => r.cls < 2).map(r => publicItem(X.rows[r.i], nowMs));
  const ordered = items.filter(x => x.status !== "closed").concat(items.filter(x => x.status === "closed"));
  return { count: ordered.length, items: ordered.slice(0, WEB_MAX).map(webLean) };
}
const WEB_N = { tenders: n => (n === 1 ? "مناقصة واحدة" : n === 2 ? "مناقصتين" : n + (n <= 10 ? " مناقصات" : " مناقصة")), rfqs: n => (n === 1 ? "طلب عرض سعر واحد" : n === 2 ? "طلبين عروض أسعار" : n + (n <= 10 ? " طلبات عروض أسعار" : " طلب عرض سعر")),
  customers: n => (n === 1 ? "جهة واحدة ممكن تبقى عميل" : n === 2 ? "جهتين ممكن يبقوا عملاء" : n + (n <= 10 ? " جهات ممكن تبقى عملاء" : " جهة ممكن تبقى عميل")),
  projects: n => (n === 1 ? "مشروع جديد واحد" : n === 2 ? "مشروعين جداد" : n + (n <= 10 ? " مشاريع جديدة" : " مشروع جديد")), news: n => (n === 1 ? "خبر واحد" : n === 2 ? "خبرين" : n + (n <= 10 ? " أخبار" : " خبر")) };
function webLine(x) { return [x.title, x.entity, x.status, x.place].filter(Boolean).join(" — "); }
/* the text the persona gets for them (m = Bassem: masculine). base = the platform's own count (0: «بس فيه …», else «وكمان فيه …») */
function webText(section, w, m, base) {
  const shown = w.items.length;
  return ` ${base ? "وكمان فيه" : "بس فيه"} ${WEB_N[section](w.count)}${shown < w.count ? ` (أهم ${shown})` : ""}: ${w.items.map(webLine).join("؛ ")}. `
    + (m ? "قولهم كمعلومة وخلاص: ماتقولش إنهم على المنصة ولا إن الشركة عضو أو مسجّلة عندنا، ومفيش اسم موقع ولا مصدر ولا لينك، ولا تعدّهم مع نتايج المنصة؛ اللي «منتهية» خلصت، واللي «ميعادها مش معروف» ماتقولش إنها مفتوحة. ولو العميل سأل جايين منين أو أكيدين قول: «دي من متابعة فريق المنصة للسوق، وقبل ما تقدّم اتأكد من الجهة نفسها»."
      : "قوليهم كمعلومة وخلاص: ماتقوليش إنهم على المنصة ولا إن الشركة عضو أو مسجّلة عندنا، ومفيش اسم موقع ولا مصدر ولا لينك، ولا تعدّيهم مع نتايج المنصة؛ اللي «منتهية» خلصت، واللي «ميعادها مش معروف» ماتقوليش إنها مفتوحة. ولو العميل سأل جايين منين أو أكيدين قولي: «دي من متابعة فريق المنصة للسوق، وقبل ما تقدّم اتأكد من الجهة نفسها».");
}
function withWeb(section, o, query, governorate, market, web, m, nowMs) {
  const w = o && typeof o === "object" ? webOf(section, query, governorate, market, web, nowMs) : null;
  if (!w || !w.count) return o;
  return { ...o, extra_count: w.count, extra: w.items, text: String(o.text || "") + webText(section, w, m, Number(o.count) || 0) };
}

/* ---------- section=customers (U2, src/lookup-customers.js) ----------
   query = the industries the SELLER serves, in his own words; one term per item of his list (، , ؛ ; / or a standalone و / أو / and / or).
   Each term → the platform's activity labels (CUST_MAP); a term no label knows → the companies that write all its words (name, products,
   description). Counted: directory rows of type «مصنع» in the place (a city counts as its governorate: customers are a market); traders
   («شركة ومورد», «شركة») are said apart and never counted. groups = [{industry, terms, factories, others, top: 2 factories}], results =
   at most 6 factories (the groups' first ones), count = distinct factories. The text says data only: directory factories in the industries
   he named, NOT purchase requests, their contacts are not published; no plan promise (the plan facts are the prompts'). */
const CUST_SEP = "qqsepqq", CUST_TERMS = 8, CUST_TOP = 2, CUST_RESULTS = 6;
const isFactoryRow = f => String((f && f[1]) || "").trim() === "مصنع";
const factoriesN = n => (n === 1 ? "مصنع واحد" : n === 2 ? "مصنعين" : n + (n <= 10 ? " مصانع" : " مصنع"));
const tradersN = n => (n === 1 ? "شركة تجارية واحدة أو مورد" : n === 2 ? "شركتين تجاريتين أو موردين" : n + (n <= 10 ? " شركات تجارية وموردين" : " شركة تجارية وموردين"));
function customers(query, governorate, m, MX) {
  const raw = String(query || "").slice(0, 200).replace(/[,،؛;|/]+|\s[-–—]\s/g, " " + CUST_SEP + " ").replace(/(^|\s)(?:و|او|أو|and|or|&)(?=\s|$)/giu, "$1" + CUST_SEP + " ");
  const P = parse(raw, governorate);
  let gov = P.gov, place = P.place, widened = null;
  if (place && CITY_GOV[place]) { widened = place; gov = CITY_GOV[place]; place = ""; } // the city's own governorate (review: never «محافظة القاهرة (اللي فيها العاشر من رمضان)»)
  const V = dirView(MX), sayW = s => String(s).split(" ").map(w => P.said.get(w) || w).join(" ");
  const inPlace = i => !V.hidden(i) && locOk(V.loc(i), gov, place);
  const G = new Map(), unknown = [];
  for (const t of P.q.split(CUST_SEP).map(s => s.trim()).filter(Boolean).flatMap(ch => custTerms(ch.split(" "))).slice(0, CUST_TERMS)) {
    const said = sayW(t.words.join(" "));
    if (t.labels.length) { for (const l of t.labels) { if (!G.has(l)) G.set(l, { industry: l, terms: [], label: l }); const g = G.get(l); if (!g.terms.includes(said)) g.terms.push(said); } continue; }
    if (!t.unknown.length) continue;
    /* review: a kind of customer the directory does not list (hospitals, restaurants, shops: lookup-customers.js CUST_PLACE) is no industry,
       and is not searched as words either: the companies that write «مستشفيات» are the ones that supply them, the seller's competitors */
    const Cq = lkConcepts(t.unknown.join(" "), dirVocab).concepts, CCq = Cq.map(compile), sayQ = Cq.length ? Cq.map(c => sayWord(P, c)).join(" ") : said; // «درافيل», not «ودرافيل»
    if (t.place) { if (!unknown.includes(sayQ)) unknown.push(sayQ); continue; }
    /* no label: the companies that write every word of the term (whole words, src/lookup-terms.js) — anywhere first: none → no such industry */
    const hits = Cq.length ? rankRows(Cq, V.match(CCq), Array.from({ length: V.N }, (_, i) => i).filter(i => !V.hidden(i))).filter(r => r.cls === 0).map(r => r.i) : [];
    if (!hits.length) { if (!unknown.includes(sayQ)) unknown.push(sayQ); continue; }
    const k = "d:" + sayQ; if (!G.has(k)) G.set(k, { industry: sayQ, terms: [sayQ], desc: true, rows: hits.filter(inPlace) });
  }
  const groups = [], counted = new Set(), traders = new Set();
  for (const g of G.values()) {
    const rows = g.desc ? g.rows : []; if (!g.desc) for (let i = 0; i < V.N; i++) if (V.row(i)[2] === g.label && inPlace(i)) rows.push(i);
    const fac = rows.filter(i => isFactoryRow(V.row(i))), oth = rows.length - fac.length;
    /* the first factories: those that write one of the seller's own words for this industry (members first among equals), then data order */
    const Cg = lkConcepts(g.terms.join("، "), dirVocab).concepts, CCg = Cg.map(compile);
    const lead = Cg.length && fac.length ? rankRows(Cg, V.match(CCg), fac, { first: i => (V.member(i) ? 1 : 0) }).filter(r => r.cls < 2).map(r => r.i) : [];
    const order = [...new Set([...lead, ...fac.filter(i => V.member(i)), ...fac])];
    fac.forEach(i => counted.add(i)); rows.forEach(i => { if (!isFactoryRow(V.row(i))) traders.add(i); });
    groups.push({ industry: g.industry, terms: g.terms, ...(g.desc ? { by_words: true } : {}), factories: fac.length, others: oth, order });
  }
  groups.sort((a, b) => b.factories - a.factories);
  const card = i => { const f = V.row(i), o = enrichResult("factories", { name: f[0], type: f[1], activity: f[2], location: f[3], url: SITE + f[5] }); if (V.member(i)) Object.assign(o, { member: true, tag: MEMBER_TAG }); if (V.create(i)) delete o.id; return o; };
  const results = [], shown = new Set();
  for (let k = 0; k < CUST_TOP && results.length < CUST_RESULTS; k++) for (const g of groups) { const i = g.order[k]; if (i == null || shown.has(i) || results.length >= CUST_RESULTS) continue; shown.add(i); results.push(Object.assign(card(i), { industry: g.industry })); }
  const out = groups.map(g => ({ industry: g.industry, terms: g.terms, ...(g.by_words ? { by_words: true } : {}), factories: g.factories, others: g.others,
    top: g.order.slice(0, CUST_TOP).map(i => { const c = card(i); return { name: c.name, place: c.location || "", ...(c.id ? { id: c.id } : {}), open_url: c.open_url || c.url, ...(c.member ? { member: true } : {}) }; }) }));
  const where = gov || place, W = where ? (widened ? "محافظة " + where + " (اللي فيها " + widened + ")" : where) : "كل المحافظات";
  const noIndustry = unknown.length ? ` مالقيتش صناعة اسمها ${unknown.map(u => "«" + u + "»").join(" ولا ")} في دليل المنصة.` : "";
  let text;
  if (!out.length) text = (noIndustry.trim() || "مفيش صناعات واضحة في الطلب.") + (m ? " اسأل العميل بيبيع لأنهي صناعات بالظبط (زي ورق، أسمنت، أغذية، بلاستيك) ودوّر تاني بأسمائها." : " اسألي العميل بيبيع لأنهي صناعات بالظبط (زي ورق، أسمنت، أغذية، بلاستيك) ودوّري تاني بأسمائها.");
  else {
    const line = g => (g.by_words ? "مصانع بتكتب «" + g.industry + "» في نشاطها أو منتجاتها" : g.industry) + ": " + (g.factories ? factoriesN(g.factories) + (g.top.length ? " (منهم " + g.top.map(t => t.name).join(" و") + ")" : "") : "مفيش مصانع في الدليل هنا");
    /* review (the Al-Atlal call again): a group found by its words alone holds the companies that MAKE or SELL that thing — the seller's
       own product («سلندرات ودرافيل») gives his competitors; the persona asks before it says these numbers */
    const byW = out.filter(g => g.by_words && g.factories), caution = !byW.length ? "" : ` تنبيه: ${byW.map(g => "«" + g.industry + "»").join(" و")} مش ${byW.length > 1 ? "أسماء صناعات" : "اسم صناعة"} في الدليل، فدول مصانع بتكتب الكلمة دي في نشاطها أو منتجاتها، يعني غالباً بتصنّعها أو بتورّدها: لو دي منتجات العميل نفسه يبقوا منافسين مش عملاء، ف${m ? "اسأله الأول بيبيعها لأنهي صناعات قبل ما تقول" : "اسأليه الأول بيبيعها لأنهي صناعات قبل ما تقولي"} الأرقام دي.`;
    text = `دي مصانع في دليل المنصة في الصناعات اللي حضرتك قلت إنك بتخدمها في ${W} — مش طلبات شراء، وبيانات تواصلهم مش منشورة: ${out.map(line).join("؛ ")}.`
      + (counted.size ? ` المجموع ${factoriesN(counted.size)}.` : "")
      + (traders.size ? ` وكمان ${tradersN(traders.size)} في نفس الصناعات، مش محسوبين ضمن المصانع.` : "") + noIndustry + caution
      + (m ? " قولها كده بالظبط: أرقام مصانع من دليل المنصة في الصناعات دي، مش عملاء أكيدين ولا طلبات شراء؛ ماتوعدش بالتواصل معاهم، وماتضيفش أسماء أو أرقام أو بيانات تواصل."
        : " قوليها كده بالظبط: أرقام مصانع من دليل المنصة في الصناعات دي، مش عملاء أكيدين ولا طلبات شراء؛ ماتوعديش بالتواصل معاهم، وماتضيفيش أسماء أو أرقام أو بيانات تواصل.");
  }
  return { section: "customers", query, governorate: gov || null, place: place || null, widened_to: widened ? gov : null, ...(widened ? { city: widened } : {}), count: counted.size, count_all: counted.size, partial: false,
    others: traders.size, groups: out, ...(unknown.length ? { unknown } : {}), page: 1, pages: 1, per_page: CUST_RESULTS, has_more: false, results, text };
}
/* a query with letters and not one Arabic letter (acier, Stahl, сталь, 钢铁 — or English the EN map does not know): the platform's data is
   Arabic + English, so a 0-result answer must not read as «none exist» — the model translates the word and searches again (any-language
   plan 2026-11-20). Arabic queries keep today's text byte for byte. */
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const foreignQuery = q => /\p{L}/u.test(String(q || "")) && !ARABIC_LETTER.test(String(q || ""));
/* the lists of the new sections are named for what they are (not «دليل المنصة», the directory) */
const LIST_NAME = { news: "أخبار المنصة", events: "أجندة معارض المنصة", projects: "مشروعات المنصة", awards: "ترسيات المنصة" };
/* a tender's status as it is said (U10): every result says it; an undated legacy row is «قديمة من غير ميعاد» */
function statusSaid(r) {
  if (isOpen(r.status)) return r.status + (r.deadline ? "، آخر موعد " + r.deadline : "");
  if (r.status === "منتهية") return "منتهية" + (r.deadline ? "، آخر موعد كان " + r.deadline : "");
  return r.legacy ? "قديمة من غير ميعاد" : "من غير ميعاد معلن";
}
/* one result as one line of the text */
function itemLine(section, r, has) {
  const h = has(r), hp = h ? " (" + h.slice(2) + ")" : "";
  if (section === "tenders") return `${r.title}${r.entity && !r.legacy ? " — " + r.entity : ""} — ${statusSaid(r)}${hp}`;
  if (section === "events") return `${r.title} — ${r.date || "من غير تاريخ"}${r.status ? " (" + r.status + ")" : ""}${r.governorate ? "، " + r.governorate : ""}${hp}`;
  if (section === "news") return `${r.title}${r.date ? " — " + r.date : ""}${hp}`;
  if (section === "projects") return `${r.title} (${[r.governorate, r.stage].filter(Boolean).join("، ")}${h})`;
  if (section === "awards") return `${r.title}${r.winner && !String(r.title).includes(r.winner) ? " — الفايز " + r.winner : ""}${r.date ? "، " + r.date : ""}${hp}`;
  if (section === "rfqs") return `${r.title}${r.date ? " — " + r.date : ""}${hp}`;
  const mt = r.member ? "، " + MEMBER_TAG : "";
  return r.sectors !== undefined ? `${r.name} (${r.governorate}${r.sectors ? "، قطاعات: " + r.sectors : ""}${h})` : r.name ? `${r.name} (${r.activity || ""}${r.location ? "، " + r.location : ""}${mt}${h})` : r.title ? `${r.title}${hp}`
    : r.product ? `${r.product}${r.store ? " في " + r.store + " بسعر " + r.price_egp + " جنيه" : r.maker ? " — " + r.maker : ""}${r.member ? " (" + MEMBER_TAG + ")" : ""}${hp}` : r.name_en || "";
}
/* the closing line of a text: what the data is and what the persona must not add */
function tailOf(section, m) {
  /* owner 2026-11-20 «ميكتبش مصدر اي معلومه»: the date only — never a newspaper, a site or a link */
  if (section === "news") return `دي أخبار منشورة على المنصة بتاريخها؛ ${m ? "قول التاريخ زي ما هو، ومتقولش اسم جريدة ولا موقع ولا مصدر، ومتضيفش" : "قولي التاريخ زي ما هو، ومتقوليش اسم جريدة ولا موقع ولا مصدر، ومتضيفيش"} أرقام أو أسعار مش مكتوبة في الخبر.`;
  if (section === "events") return `دي معارض من أجندة المنصة بمواعيدها المنشورة؛ ${m ? "قول التاريخ زي ما هو، واللي «بدأ» ممكن يكون لسه شغال، واللي «انتهى» قول إنه خلص" : "قولي التاريخ زي ما هو، واللي «بدأ» ممكن يكون لسه شغال، واللي «انتهى» قولي إنه خلص"}، والتسجيل والتفاصيل عند الجهة المنظمة.`;
  if (section === "projects" || section === "awards") return `دي بيانات منشورة على المنصة؛ ${m ? "اذكر منها فقط ومتضيفش" : "اذكري منها فقط ومتضيفيش"} أرقام أو جهات مش مكتوبة، والتواصل مع الجهات دي مش من خلال المنصة.`;
  return `هذه بيانات حقيقية من المنصة؛ ${m ? "اذكر منها فقط ولا تضيف" : "اذكري منها فقط ولا تضيفي"} بيانات تواصل (التواصل عبر زر «اطلب عرض سعر» في ملف المنشأة).`;
}
/* m = the caller is Bassem (his tool definition sends page / market — holo5 `paged`): the same text in the masculine; Janna keeps hers.
   st = the honest counts of the query's words: all = results that hold every word (of one item of a list), rel = from the same field only;
   tenders: open = the open ones among them (none → the text starts «مفيش مناقصة سارية …», U10) */
function summary(section, n, top, where, m, query, st = null) {
  const LN = LIST_NAME[section] || "دليل المنصة";
  if (!n) return "لا توجد نتائج مطابقة في " + LN + " لهذا البحث" + (where ? " في " + where : "") + (LIST_NAME[section] ? (m ? ". لا تخترع نتائج؛ اقترح كلمات بحث أخرى." : ". لا تخترعي نتائج؛ اقترحي كلمات بحث أخرى.")
    : m ? ". لا تخترع نتائج؛ اقترح كلمات بحث أخرى أو نشر طلب عرض سعر مجاني." : ". لا تخترعي نتائج؛ اقترحي كلمات بحث أخرى أو نشر طلب عرض سعر مجاني.")
    + (!foreignQuery(query) ? "" : m ? " بيانات المنصة بالعربي والإنجليزي: لو الكلمة بلغة تانية ترجمها للعربي (acier = حديد) ودوّر تاني قبل ما تقول مفيش."
      : " بيانات المنصة بالعربي والإنجليزي: لو الكلمة بلغة تانية ترجميها للعربي (acier = حديد) ودوّري تاني قبل ما تقولي مفيش.");
  const has = r => (r.match && r.match !== "all" && r.matched && r.matched.length ? (r.match === "related" ? "؛ من نفس المجال: " : "؛ فيها: ") + r.matched.join(" و") : "");
  const items = top.map(r => itemLine(section, r, has)), tail = tailOf(section, m);
  /* U10: no open tender for the words → said first; the nearest ones follow with their status (old with no deadline / ended) */
  if (section === "tenders" && st && st.open === 0) {
    const q = st.n ? st.words : st.q;
    return `مفيش مناقصة سارية${q ? " في «" + q + "»" : ""}${where ? " في " + where : ""} على المنصة دلوقتي؛ أقرب اللي عندنا: ${items.join("؛ ")}. (${n} نتيجة، ولا واحدة منهم سارية${st.n && st.all < n ? "، و" + (st.all ? st.all + " بس فيها كل كلمات البحث" : "مفيش ولا واحدة فيها كل كلمات البحث") : ""}.) `
      + (m ? "قولها كده: مفيش مناقصة سارية دلوقتي، ودي قديمة أو منتهية." : "قوليها كده: مفيش مناقصة سارية دلوقتي، ودي قديمة أو منتهية.") + (st.amb ? ` تنبيه: كلمة «${st.amb.word}» ليها أكتر من معنى (${st.amb.note}).` : "") + " " + tail;
  }
  const openNote = section === "tenders" && st && st.open ? ` (السارية منهم: ${st.open})` : "";
  if (!st || !st.n) return `عدد النتائج في ${LN}: ${n}${openNote}. أهمها: ${items.join("؛ ")}. ${tail}`;
  const part = n - st.all - st.rel;
  const others = (part ? `${part} نتيجة فيها جزء من الكلمات بس` : "") + (part && st.rel ? " و" : "") + (st.rel ? `${st.rel} من نفس المجال بكلمات قريبة (مش نفس الكلمة)` : "");
  const amb = st.amb ? ` تنبيه: كلمة «${st.amb.word}» ليها أكتر من معنى (${st.amb.note})؛ ${m ? "اسأل العميل سؤال واحد يقصد أنهي، وبعدين دوّر" : "اسألي العميل سؤال واحد يقصد أنهي، وبعدين دوّري"} بالكلمة الأدق.` : "";
  if (st.all) return `عدد النتائج اللي فيها كل كلمات البحث («${st.words}») في ${LN}: ${st.all}${others ? "، وفيه كمان " + others : ""}${openNote}. أهمها: ${items.join("؛ ")}.${amb} ${tail}`;
  return `مفيش نتيجة في ${LN} فيها كل كلمات البحث («${st.words}»)؛ أقرب النتائج: ${others}${openNote}. أهمها: ${items.join("؛ ")}. ${m ? "قولها على إنها أقرب نتايج، مش مطابقة" : "قوليها على إنها أقرب نتايج، مش مطابقة"}.${amb} ${tail}`;
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
  /* section=customers: the groups' first factories carry open_url too (decoded the same way) */
  if (Array.isArray(o.groups)) y.groups = o.groups.map(g => (!g || !Array.isArray(g.top) ? g : { ...g, top: g.top.map(t => { if (!t || !t.open_url) return t; try { return { ...t, open_url: decodeURI(t.open_url) }; } catch (e) { return t; } }) }));
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
const BARE = new Set(["/api/janna/lookup", "/api/janna/item", "/api/janna/knowledge", "/api/janna/health", "/api/janna/timing",
  "/api/janna/web", "/api/janna/hunt", "/api/advisor/web", "/api/advisor/hunt", "/api/janna/opportunities"]); // the web tools and «فرص السوق» load their switches through their own memos

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
    if (/^\/api\/advisor\/hunt\/?$/.test(url.pathname)) return handleBassemHunt(req, env, ctx); // web-hunt.js, before the advisor family
    if (/^\/api\/advisor\/memory(\/|$)/.test(url.pathname)) return handleMemory(req, env, ctx); // before the advisor family (memory.js)
    if (/^\/api\/advisor\/media(\/|$)/.test(url.pathname)) return CHATMEDIA.handleAdvisorMedia(req, env, ctx); // 📎 Bassem's call photos — before the advisor family
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
    if (/^\/api\/janna\/media(\/|$)/.test(url.pathname)) return CHATMEDIA.handleJannaMedia(req, env, ctx); // 📎 photos of Janna's call + the «اكتبلي» bubble (chat-media.js)
    if (/^\/api\/janna\/web\/?$/.test(url.pathname)) return handleJannaWebSearch(req, env, ctx); // websearch.js (X-MIG-Tool: Janna's secret)
    if (/^\/api\/janna\/hunt\/?$/.test(url.pathname)) return handleJannaHunt(req, env, ctx);      // web-hunt.js
    if (/^\/api\/janna\/opportunities\/?$/.test(url.pathname)) return handlePublicLeads(req, env, ctx); // «فرص السوق» (web-public.js): GET, public, never a source
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (/^\/api\/janna\/health\/?$/.test(url.pathname)) return json({ ok: true, data: DATA.v, factories: DATA.f.length, products: DATA.p.length, tenders: DATA.t.length, rfqs: DATA.q.length, offers: DATA.o.length, zones: DATA.z.length, items: (DATA.i || []).length });
    if (!/^\/api\/janna\/lookup\/?$/.test(url.pathname)) return json({ error: "not found" }, 404);
    if (env && env.JANNA_KEY && req.headers.get("X-Janna-Key") !== env.JANNA_KEY) return json({ error: "unauthorized" }, 401);
    const post = req.method === "POST";
    let a = Object.fromEntries(url.searchParams);
    if (post) { try { a = Object.assign(a, await req.json()); } catch (e) { toolSoftError("/api/janna/lookup", "bad_json"); return json({ error: "bad json", count: 0, results: [], text: LOOKUP_TEXT.bad_json }, 200); } }
    const section = lookupSection(a.section); // LOOKUP_SECTIONS (+ customers, projects, events, news, awards — U2 / U15); unknown → factories, as before
    if (!a.query && !a.governorate) { if (post) toolSoftError("/api/janna/lookup", "query_required"); return json({ error: "query required", count: 0, results: [], text: LOOKUP_TEXT.no_query }, post ? 200 : 400); }
    /* U16: the members' approved products / companies (D1, at most one read per isolate per 10 minutes; fail-soft) for the sections that list
       them — only those approved since this bundle was built (data.json v): the older ones are in it already */
    /* the members' records and «فرص السوق» (the published web opportunities of the sections they belong to, with the owner's switch
       web_leads_lookup): each ≤ 1 D1 round trip per isolate per 10 minutes, read side by side; fail-soft */
    const [members, web] = await Promise.all([/^(factories|suppliers|products|market|customers)$/.test(section) ? memberData(env, Date.now(), DATA.v) : null,
      Object.prototype.hasOwnProperty.call(WEB_SECTIONS, section) ? publishedLeads(env, Date.now()) : null]);
    const r = search(section, String(a.query || "").slice(0, 200), String(a.governorate || "").slice(0, 60), a.limit, a.page, a.market, { members, web });
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
