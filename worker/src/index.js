/* Janna lookup API — Cloudflare Worker for madeinegyptgate.com
   Lets the live assistant «جنة» (Anam persona, SERVER_WEBHOOK tool "janna_lookup") search the platform's real public
   directory (factories & companies, products, tenders, RFQs, retail offers, industrial cities) and SAY the results.
   - POST /api/janna/lookup   body {section, query, governorate?, limit?, page?, market?}  → {count, page, pages, has_more, results[], text}
   - GET  /api/janna/lookup?section=&query=&governorate=&page=               (same, for testing / the website)
     each result also carries id (for /api/janna/item), open_url (the item's own page) and, for tenders, the amounts the data has
   - GET|POST /api/janna/item {section, id|ref|title}  → the full public record of ONE item + a spoken summary (src/janna-item.js)
   - GET  /api/janna/health
   Security: if the secret JANNA_KEY is set (wrangler secret put JANNA_KEY), requests must send header X-Janna-Key with it
   (the Anam tool sends it). No API keys are stored in the code. Data = worker/src/data.json (public directory only; no phones). */
import DATA from "./data.json";
import { handleAdvisor, handleEmail } from "./advisor.js"; // AI Deal Advisor: /api/advisor/* + inbound replies (see README)
import { handleProfile } from "./profile.js"; // /api/advisor/profile — the member's factory profile Bassem records in the call (migration 0007)
import { handleMeetings, meetingsCron } from "./meetings.js"; // Janna-hosted meetings: /api/meetings/* + cron (see README)
import { EN, STOP, norm, stem } from "./text.js"; // shared Arabic/English normalisation (also used by matching.js)
// Interactive platform (docs/janna/INTERACTIVE-PLAN.md, Phase A) — see README "Platform API"
import { handleAuth } from "./auth.js";             // /api/auth/*        one email-code login for every plan
import { handleMe } from "./me.js";                 // /api/me*           account, follows, notifications, prefs, stats, incoming
import { handleMeDeleteRequest, handleVisitorEraseRequest } from "./delete-requests.js"; // 0010: «طلب حذف الحساب» (requests only; owner switches)
import { handleInquiries, handleInquiryEmail, isInquiryAddress, inquiriesCron } from "./inquiries.js"; // /api/inquiries* + automatic routing
import { handleAdmin } from "./admin.js";           // /api/admin/*       monitoring console (no human step in any flow)
import { handleEv, handleUnsub } from "./ev.js";    // /api/ev, /api/unsub
import { handleWA, bassemCron } from "./whatsapp.js"; // /api/wa/*        respond.io webhook + Bassem's daily WhatsApp
import { handleJannaSession } from "./janna-session.js"; // /api/janna/session  live-call session tokens (JS SDK: no third-party mark)
import { handleItem, enrichResult } from "./janna-item.js"; // /api/janna/item  one item in full + the lookup results' ids / open_url / amounts
import { handleMemory, memoryCron, budgetEnv, TICK } from "./memory.js"; // /api/advisor/memory  Bassem's memory (searches, call turns, summaries, facts)
// ---- 0009 memory upgrades: Janna's visitor memory, «بنك المعلومات», the daily memory update ----
import { handleVisitorMemory } from "./visitor.js";   // /api/janna/memory[/tasks]  Janna's memory of her visitors
import { handleKnowledge } from "./knowledge.js";     // /api/janna/knowledge  the personas' knowledge_lookup tool
import { dailyMemory } from "./daily.js";              // day digests + «ملخص العميل» + tasks / knowledge merge / caps report (once per Cairo day)
import { dailyJobs, newCountFor } from "./digest.js";
import { cairoDay, addDays } from "./common.js";
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
function lookupEnglishToArabic(q) {
  let s = " " + String(q || "").toLowerCase() + " ";
  for (const k of Object.keys(EN).sort((a, b) => b.length - a.length)) s = s.split(" " + k + " ").join(" " + EN[k] + " ");
  return s.trim();
}
function parse(query, governorate) {
  let q = lookupEnglishToArabic(query), gov = governorate ? lookupEnglishToArabic(governorate) : "";
  let place = "";
  for (const c of Object.keys(CITY_GOV)) if (norm(q).includes(norm(c)) || norm(gov).includes(norm(c))) { place = c; q = norm(q).replace(norm(c), " "); }
  for (const g of Object.keys(GOV)) if (norm(q).includes(norm(g))) { gov = gov || g; q = norm(q).replace(norm(g), " "); }
  const words = norm(q).split(" ").filter(w => w && !STOP.has(w) && w.length > 1).map(stem).filter(Boolean);
  return { words, gov: gov ? (GOV[gov] || gov) : "", place };
}
function score(hay, words) { let s = 0, hit = 0; for (const w of words) { if (hay.includes(w)) { s += w.length; hit++; } } return words.length && hit === 0 ? 0 : s + hit * 3; }
function locOk(loc, gov, place) {
  const L = norm(loc);
  if (place) return L.includes(norm(place)) || (!!CITY_GOV[place] && L.includes(norm(CITY_GOV[place])) && false);
  if (gov) return L.includes(norm(gov)) || Object.entries(CITY_GOV).some(([c, g]) => g === gov && L.includes(norm(c)));
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
/* tenders: the words must be in the title / activity (the entity only weighs a little), as whole words — «حديد» is not «تحديد», and
   «السكك الحديد(ية)» (railways) is not iron / steel (review 2026-11-18 #10) */
const RAIL = /(^| )\S*سكك (ال)?حديد\S*/g;
/* the forms a title word can match a query word by: as written, without the article («ال» / «لل», after one و/ب/ل/ف/ك), without ONE
   attached و/ف/ب/ك/ل when no article follows («وزيوت» → «زيوت», «لصيانة» → «صيانة», «لأتوبيسات» → «أتوبيسات»), and stem()med like the
   query words are (parse() stems them: «ألومنيوم» → «ومنيوم»). Review 2026-11-19 #1: whole words only had dropped these real matches. */
const ART = /^(و|ب|ل|ف|ك)?(ال|لل)/, CLITIC = /^(و|ف|ب|ك|ل)(?=\S{3,})/, WF = new Map(); // WF: token → its forms (the data is static per isolate)
function wforms(t) {
  let f = WF.get(t); if (f) return f;
  const o = new Set([t, t.replace(ART, "")]), p = t.replace(/^\d+(?=\D{2,})/, "").replace(CLITIC, ""); // «2جهاز» → «جهاز»
  o.add(p); o.add(p.replace(ART, ""));
  for (const x of [...o]) o.add(stem(x));
  o.delete(""); f = [...o];
  if (WF.size < 50000) WF.set(t, f);
  return f;
}
function wscore(hay, words) {
  const toks = hay.split(" ").filter(Boolean).map(wforms);
  let s = 0, hit = 0;
  for (const w of words) if (toks.some(fs => fs.some(f => f === w || (w.length >= 3 && f.startsWith(w))))) { s += w.length; hit++; }
  return words.length && hit === 0 ? 0 : s + hit * 3;
}
export function tenderScore(main, entity, words) {
  const s = wscore(norm(main).replace(RAIL, " "), words); if (s || !words.length) return s;
  const e = wscore(norm(entity).replace(RAIL, " "), words); return e ? Math.max(1, Math.round(e / 4)) : 0;
}
/* page: 1-based (10 results at most per page); market (tenders only): local (default — the Egyptian list, as before) | gulf | africa |
   asia | europe | intl (all four) | all (Egyptian + international) */
function search(section, query, governorate, limit, page, market) {
  const { words, gov, place } = parse(query, governorate);
  const L = Math.min(Math.max(+limit || 6, 1), 10), res = [], M = marketOf(market), mk = M.mk || "local";
  /* the paging / open-one hint only for a caller that pages or picks markets (Bassem's new definition); Janna's tool has neither */
  const paged = (page != null && page !== "") || (market != null && market !== "");
  if (section === "tenders" && M.bad) return { section, query, governorate: gov || null, place: place || null, market: null, market_unknown: M.bad, markets: MARKETS, widened_to: null, count: 0, page: 1, pages: 1, per_page: L, has_more: false, results: [],
    text: `السوق «${M.bad}» مش من أسواق بحث المناقصات على المنصة، فمادورتش. الأسواق المتاحة: local (مصر)، gulf (الخليج)، africa (أفريقيا)، asia (آسيا)، europe (أوروبا)، intl (كل الدولية)، all (مصر والدولية). دوّر تاني بواحد منهم، ومتقولش نتايج من سوق تاني على إنها من السوق ده.` };
  if (section === "factories" || section === "suppliers") {
    DATA.f.forEach(f => { if (!locOk(f[3], gov, place)) return; const s = score(norm(f[0] + " " + f[2] + " " + f[4]), words); if (s || !words.length) res.push([s, { name: f[0], type: f[1], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] }]); });
  } else if (section === "products" || section === "market") {
    DATA.p.forEach(p => { const s = score(norm(p.join(" ")), words); if (s) res.push([s, { product: p[0], maker: p[1], category: p[2], url: SITE + "market.html" }]); });
    DATA.f.forEach(f => { if (!locOk(f[3], gov, place)) return; const s = score(norm(f[4]), words); if (s) res.push([s - 1, { name: f[0], activity: f[2], location: f[3], products: f[4], url: SITE + f[5] }]); });
  } else if (section === "tenders") {
    if (mk !== "local" && !gov) (DATA.i || []).forEach(x => { if (x[0] !== "tender" || x[8] === "local" || (mk !== "all" && mk !== "intl" && x[8] !== mk)) return; const s = tenderScore(x[5] + " " + x[3] + " " + x[4], x[9], words), st = tenderStatus(x[7]); if (s || !words.length) res.push([s + (st === "سارية" || st === "تنتهي قريباً" ? 2 : 0), { ref: x[1], type: "مناقصة دولية", status: st, title: x[5], entity: x[9] || "", governorate: x[4] || "", activity: x[3], deadline: x[7] || "", market: x[8], url: SITE + x[6] }]); });
    if (mk === "local" || mk === "all") DATA.t.forEach(t => { if (gov && !norm(t[5]).includes(norm(gov))) return; const s = tenderScore(t[3] + " " + t[6], t[4], words), st = tenderStatus(t[7]); if (s || !words.length) res.push([s + (st === "سارية" || st === "تنتهي قريباً" ? 2 : 0), { ref: t[0], type: t[1], status: st, title: t[3], entity: t[4], governorate: t[5] || "غير محددة", activity: t[6], deadline: t[7] || "", url: SITE + "tenders/search/#" + encodeURIComponent(t[0]) }]); });
  } else if (section === "rfqs") {
    DATA.q.forEach(q => { const s = score(norm(q.join(" ")), words); if (s || !words.length) res.push([s, { ref: q[0], date: q[1], title: q[2], details: q[3], quantity: q[4], url: SITE + "rfq/search/#" + encodeURIComponent(q[0]) }]); });
  } else if (section === "offers") {
    DATA.o.forEach(o => { const s = score(norm(o[0] + " " + o[1] + " " + o[2] + " " + o[5]), words); if (s || !words.length) res.push([s, { product: o[0], brand: o[1], store: o[2], price_egp: o[3], old_price_egp: o[4], valid_to: o[6], url: SITE + o[7] }]); });
  } else if (section === "cities") {
    DATA.z.forEach(z => { if (gov && !norm(z[3]).includes(norm(gov))) return; const s = score(norm(z.join(" ")), words); if (s || !words.length) res.push([s, { name: z[0], name_en: z[1], type: z[2], governorate: z[3], city: z[4], sectors: z[5], url: SITE + z[6] }]); });
  }
  /* a specific industrial city with few hits: widen to its governorate and say so */
  let widened = null;
  if ((section === "factories" || section === "suppliers") && place && res.length < 3 && CITY_GOV[place]) {
    const g = CITY_GOV[place], seen = new Set(res.map(r => r[1].url));
    DATA.f.forEach(f => { if (!norm(f[3]).includes(norm(g))) return; const s = score(norm(f[0] + " " + f[2] + " " + f[4]), words); const u = SITE + f[5]; if ((s || !words.length) && !seen.has(u)) res.push([s - 0.5, { name: f[0], type: f[1], activity: f[2], location: f[3], products: f[4], url: u }]); });
    widened = g;
  }
  res.sort((a, b) => b[0] - a[0]);
  const pages = Math.max(1, Math.ceil(res.length / L)), pg = Math.min(Math.max(Math.floor(+page || 1), 1), 1000), from = (pg - 1) * L;
  const top = res.slice(from, from + L).map(r => enrichResult(section, r[1])), more = Math.max(0, res.length - from - top.length);
  return { section, query, governorate: gov || null, place: place || null, market: section === "tenders" ? mk : undefined, widened_to: widened, count: res.length, page: pg, pages, per_page: L, has_more: more > 0, results: top,
    text: (widened ? "نتائج قليلة داخل " + place + " نفسها، فتمت إضافة نتائج من محافظة " + widened + ". " : "") + (pg > pages && res.length ? `دي كانت كل النتائج (${res.length}) في ${pages === 1 ? "صفحة واحدة" : pages + " صفحات"}؛ مفيش صفحة ${pg}.` : summary(section, res.length, top.slice(0, 6), gov || place, paged)) + (more && paged ? ` وفيه كمان ${more} نتيجة: اطلب page=${pg + 1}، أو هات تفاصيل نتيجة بالـ id بتاعها من platform_item.` : "") };
}
/* m = the caller is Bassem (his tool definition sends page / market — holo5 `paged`): the same text in the masculine; Janna keeps hers */
function summary(section, n, top, where, m) {
  if (!n) return "لا توجد نتائج مطابقة في دليل المنصة لهذا البحث" + (where ? " في " + where : "") + (m ? ". لا تخترع نتائج؛ اقترح كلمات بحث أخرى أو نشر طلب عرض سعر مجاني." : ". لا تخترعي نتائج؛ اقترحي كلمات بحث أخرى أو نشر طلب عرض سعر مجاني.");
  const items = top.map(r => r.sectors !== undefined ? `${r.name} (${r.governorate}${r.sectors ? "، قطاعات: " + r.sectors : ""})` : r.name ? `${r.name} (${r.activity || ""}${r.location ? "، " + r.location : ""})` : r.title ? `${r.title} — ${r.entity} — ${r.status}${r.deadline ? "، آخر موعد " + r.deadline : ""}` : r.product ? `${r.product}${r.store ? " في " + r.store + " بسعر " + r.price_egp + " جنيه" : r.maker ? " — " + r.maker : ""}` : r.name_en || "");
  return `عدد النتائج في دليل المنصة: ${n}. أهمها: ${items.join("؛ ")}. هذه بيانات حقيقية من المنصة؛ ${m ? "اذكر منها فقط ولا تضيف" : "اذكري منها فقط ولا تضيفي"} بيانات تواصل (التواصل عبر زر «اطلب عرض سعر» في ملف المنشأة).`;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Janna-Key" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });

const WORKER = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }
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
    if (/^\/api\/janna\/session\/?$/.test(url.pathname)) return handleJannaSession(req, env, ctx);
    if (/^\/api\/janna\/item\/?$/.test(url.pathname)) return handleItem(req, env, ctx); // holo5, janna-item.js
    if (/^\/api\/janna\/memory\/erase-request\/?$/.test(url.pathname)) return handleVisitorEraseRequest(req, env, ctx); // 0010: a request only (visitor_erase_request)
    if (/^\/api\/janna\/memory(\/|$)/.test(url.pathname)) return handleVisitorMemory(req, env, ctx); // 0009, visitor.js
    if (/^\/api\/janna\/knowledge\/?$/.test(url.pathname)) return handleKnowledge(req, env, ctx); // 0009, knowledge.js
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (/^\/api\/janna\/health\/?$/.test(url.pathname)) return json({ ok: true, data: DATA.v, factories: DATA.f.length, products: DATA.p.length, tenders: DATA.t.length, rfqs: DATA.q.length, offers: DATA.o.length, zones: DATA.z.length, items: (DATA.i || []).length });
    if (!/^\/api\/janna\/lookup\/?$/.test(url.pathname)) return json({ error: "not found" }, 404);
    if (env && env.JANNA_KEY && req.headers.get("X-Janna-Key") !== env.JANNA_KEY) return json({ error: "unauthorized" }, 401);
    let a = Object.fromEntries(url.searchParams);
    if (req.method === "POST") { try { a = Object.assign(a, await req.json()); } catch (e) { return json({ error: "bad json" }, 400); } }
    const section = ["factories", "suppliers", "products", "market", "tenders", "rfqs", "offers", "cities"].includes(a.section) ? a.section : "factories";
    if (!a.query && !a.governorate) return json({ error: "query required" }, 400);
    return json(search(section, String(a.query || "").slice(0, 200), String(a.governorate || "").slice(0, 60), a.limit, a.page, a.market));
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
