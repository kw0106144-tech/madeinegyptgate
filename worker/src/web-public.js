/* «فرص السوق» / "Market opportunities": the web leads of the data desk (migration 0012_web_leads.sql, src/web-leads.js) PUBLISHED on the
   platform at once. Owner, 2026-11-20: «أنا مش عايز كلمه مفيش أنا عايزها تدور وتطلع بيان ورد حتي لو المعلومه مش علي المنصه تجيبها او
   يجيبها من المصادر الخارجيه ويضيفها علي المنصه», the web data «تظهر علطول» (no review gate), with three guards agreed with him: no phone
   number or e-mail on a public page, a tender whose deadline passed is never shown as open, the data team removes anything wrong with one
   press. His rule the same day: «ميكتبش مصدر اي معلومه» and «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه وخلاص».
   PUBLISHED = a web_leads row whose status is new or accepted (a lead the team rejected, or hid with «🙈 إخفاء من المنصة» — status rejected,
   reason hidden — never; «↩ رجّعها على المنصة» = accepted again), whose type is an opportunity (tender, rfq, buyer, buyer_list, project,
   news; never other or a future type), and that holds no personal data: a masked e-mail / phone, an address or a number the masks missed,
   an @handle, or (outside news / projects, where the names are public figures') a person after a title — checked here again, whatever the
   capture did.
   WHAT LEAVES THIS MODULE (the public page /market-opportunities/ via GET /api/janna/opportunities, and janna_lookup through src/index.js)
   is the opportunity itself in the platform's words, and nothing about where it came from: its type; a SHORT title (≤ WL.title
   characters: the page title without any site / portal / newspaper / directory name, domain, link, @handle or contact — the parts of a
   title that only name the site are dropped; nothing of the snippet, which stays inside); the entity or company that owns it when the
   title or the snippet names it («تعلن <الجهة> عن طرح …», "<Entity> invites bids", «لصالح …», a part of the title that names a ministry /
   authority / company — never a site's name); the product and the market it was found for; for a tender / RFQ its deadline — read from the
   notice's own words next to «آخر موعد» / «فض المظاريف» / "closing date" / "deadline" … — and its status (open, closing within 7 days,
   closed; no deadline → unknown, NEVER open by default; «ملغاة» / "cancelled" / "expired" → closed) and whether it is official (the word
   «رسمية», never the portal); and the day the platform found it. NEVER the link, the site, the domain, the snippet, the provider query, the
   persona that found it, the team's note or reason.
   Reader: publishedLeads(env, nowMs, {ttl}) — the latest WL.rows rows of each published status (the (status, last_seen) index: ≤ 2 × 300
   rows read) and the owner's switches, in ONE round trip, once per isolate per ttl: 10 minutes for janna_lookup (WL.ttl, as
   src/lookup-members.js; its switch web_leads_lookup is the one of that read), 2 minutes for the public page (WL.page_ttl; its switch
   web_leads_public is asked each time, flags.js memo 30 s); concurrent requests share one read; forgetPublished() after a desk decision
   in the same isolate (other isolates follow within their ttl). Fail-soft: no DB, no table (0012 not applied), a read error → nothing
   published, never an error to the caller. Read only: nothing here writes to D1.
   THE AUTO-PUBLISH GATE (owner 2026-11-28: what the assistants find outside is added to the platform automatically, members-only like the
   rest, ONLY when it is a real opportunity): a tender / RFQ is published only when its source page is OFFICIAL (an official procurement
   portal or a public body's own site: web-classify.js PORTALS / ENTITIES, or a government host) and the notice's own words give a closing
   date that is today or later (not cancelled); a project only from an official source page; none of them when the platform already has
   the same opportunity (useKnown: the titles of the platform's own tenders / RFQs) or another published lead says it (type + title); never
   with personal contact data (above). A published tender / RFQ whose date passes leaves the lists the same day (liveItem). The reason a
   lead is not published is the desk's public_why: unofficial | no_deadline | closed | duplicate (besides status | type | personal | empty).
   THE SAME GATE FOR BUYERS AND NEWS (owner 2026-11-28: «النشر التلقائي للمشترين والأخبار بشرط المصدر الرسمي: اه»): a buyer / a buyer list is
   published only from an OFFICIAL page of that company or body — its own domain (ownSite: no directory, aggregator, B2B marketplace,
   newspaper, social network, reference or hosted page, and the domain's own name is the name the page gives) or a government / public-body
   page (officialSource) —, never a person (PERSON above, or a job title: personRole), never a company the directory already has
   (useKnown: the directory's company names); a news item only from an official source — a government / public body, the company's own
   site (ownSite) or an official news agency (AGENCIES) —, dated inside the platform's news window (NEWS_DAYS: the last month, the window
   the platform's own news searches use, websearch.js freshness "month"; its date is the provider's, read by newsDay) and not one the
   platform has (its news titles) or another published lead says. Their reasons on the desk: unofficial | no_date | old | duplicate |
   personal. No personal contact in any field (title, snippet, product, query). What a VISITOR gets of every published opportunity is its
   teaser (opp-lock.js lockWeb: no entity, no official mark; a buyer without its name, which is who it is): the details are for members. */
import { norm, maskPII, MASK_EMAIL, MASK_PHONE, forLLM, instructionLike, asciiDigits } from "./text.js";
import { bareHost, onHost, portalOf, PORTALS, AGGREGATORS, NEWS, DIRECTORIES, MARKETS_B2B, SOCIAL, REFERENCE } from "./web-classify.js";
import { featureOn, loadFeatures, valueOf, leadsStoreOn } from "./flags.js";
import { cairoDay, addDays, GOV_CODES } from "./common.js";
import { viewerOf, lockWeb } from "./opp-lock.js"; // members-only opportunities (owner 2026-11-28): a tender's / RFQ's / project's owner and official mark for members

export const PUBLIC_TYPES = Object.freeze(["tender", "rfq", "buyer", "buyer_list", "project", "news"]);
export const WL = Object.freeze({ ttl: 10 * 60 * 1000, page_ttl: 2 * 60 * 1000, rows: 300, title: 110, entity: 80, product: 60, per_page: 20, max_page: 50, q: 80 });
const DATED = new Set(["tender", "rfq"]);
const OK_STATUS = ["new", "accepted"];
/* the auto-publish gate (header): an official source page — the classifier's mark, or (not an aggregator) an official portal / a public
   body / a government host */
const GOV_HOST = /(?:^|\.)(?:gov|gouv|gob|govt|go|mil)\.[a-z]{2,3}$|(?:^|\.)(?:gov|mil|int)$/i;
const OFFICIAL_TYPES = new Set(["tender", "rfq", "project"]);
const BUYER_TYPES = new Set(["buyer", "buyer_list"]);
/* the platform's news window: its own news searches ask the provider for the last month (websearch.js freshOf "month") — a web news item
   older than that is not published, and leaves the lists when it gets older */
export const NEWS_DAYS = 31;
/* the official (state) news agencies of the platform's markets: an official source of news */
export const AGENCIES = Object.freeze(["mena.org.eg", "spa.gov.sa", "wam.ae", "kuna.net.kw", "qna.org.qa", "omannews.gov.om", "bna.bh", "petra.gov.jo", "aps.dz", "mapexpress.ma",
  "tap.info.tn", "suna-sd.net", "ina.iq", "aa.com.tr", "xinhuanet.com", "news.cn"]);
/* pages anyone can open on someone else's domain (a blog, a site builder, a profile): never a company's own site */
const HOSTED = Object.freeze(["blogspot.com", "wordpress.com", "medium.com", "wixsite.com", "weebly.com", "sites.google.com", "github.io", "tumblr.com", "substack.com", "jimdofree.com",
  "webnode.page", "godaddysites.com", "business.site", "linkedin.com"]);
export function officialSource(r) {
  if (!r) return false;
  if (Number(r.official)) return true;
  if (Number(r.aggregator)) return false;
  const host = bareHost(r.site || "");
  return !!host && (portalOf(host) === "portal" || portalOf(host) === "entity" || GOV_HOST.test(host));
}
/* the platform's own opportunities (index.js hands in a check on its bundled tenders / RFQs): a web lead that repeats one is not published */
let KNOWN = null;
export function useKnown(fn) { KNOWN = typeof fn === "function" ? fn : null; }
const knownTo = (type, title) => { try { return !!(KNOWN && title && KNOWN(type, title)); } catch (e) { return false; } };

/* ---------------- personal data ---------------- */
const HANDLE = /(?:^|[\s(«"'،,:])@[A-Za-z0-9_.]{2,}/;
const PERSON = /(?:^|[\s(«"'،,:-])(?:ال)?(?:سيد[ةه]?|مهندس[ةه]?|استاذ[ةه]?|أستاذ[ةه]?|دكتور[ةه]?)\s+[ء-ي]{2,}|(?:^|[\s(«"'،,:-])(?:م|أ|ا|د)\s?\/\s?[ء-ي]{2,}|(?:^|[\s(«"',:;-])(?:Mr|Mrs|Ms|Miss|Dr|Eng|Prof)\.?\s+[A-Z][a-z]{2,}/;
/* a text with a contact or a person in it: such a lead is not published at all (the page and the lookup never show part of it) */
export function personalIn(s, { people = true } = {}) {
  const t = String(s == null ? "" : s);
  if (!t.trim()) return false;
  if (t.includes(MASK_EMAIL) || t.includes(MASK_PHONE) || maskPII(t) !== t || HANDLE.test(t)) return true;
  return people && PERSON.test(t);
}

/* ---------------- what names a site (never shown) ---------------- */
/* the hosts that are where an opportunity was READ, not who owns it: their names come out of a title */
export const THIRD = [].concat(PORTALS, AGGREGATORS, NEWS, DIRECTORIES, MARKETS_B2B); // exported for research-check.js (one list, never a second copy)
/* the Arabic / spelled-out names of the sites of those lists that a title carries as a part of its own («… - اليوم السابع») */
export const BRAND = Object.freeze({
  "youm7.com": ["اليوم السابع"], "masrawy.com": ["مصراوي"], "almalnews.com": ["جريدة المال", "المال نيوز"], "alborsaanews.com": ["البورصة نيوز", "جريدة البورصة"],
  "elbalad.news": ["صدى البلد"], "ahram.org.eg": ["بوابة الأهرام", "الأهرام"], "almasryalyoum.com": ["المصري اليوم"], "shorouknews.com": ["بوابة الشروق", "الشروق"],
  "elwatannews.com": ["الوطن"], "akhbarelyom.com": ["بوابة أخبار اليوم", "أخبار اليوم"], "vetogate.com": ["فيتو"], "cairo24.com": ["القاهرة 24"], "dostor.org": ["الدستور"],
  "alarabiya.net": ["العربية نت", "العربية"], "aawsat.com": ["الشرق الأوسط"], "skynewsarabia.com": ["سكاي نيوز عربية"], "cnbcarabia.com": ["سي إن بي سي عربية", "CNBC عربية"],
  "asharqbusiness.com": ["الشرق للأعمال", "اقتصاد الشرق", "الشرق بلومبرغ"], "argaam.com": ["أرقام"], "aleqt.com": ["الاقتصادية"], "amwalalghad.com": ["أموال الغد"],
  "elaosboa.com": ["الأسبوع"], "alwafd.news": ["بوابة الوفد", "الوفد"], "sis.gov.eg": ["الهيئة العامة للاستعلامات"], "enterprise.press": ["Enterprise"], "enterpriseam.com": ["Enterprise"],
  "egypttoday.com": ["Egypt Today"], "dailynewsegypt.com": ["Daily News Egypt"], "egyptindependent.com": ["Egypt Independent"], "arabfinance.com": ["Arab Finance"],
  "gulfnews.com": ["Gulf News"], "khaleejtimes.com": ["Khaleej Times"], "zawya.com": ["Zawya"], "reuters.com": ["Reuters"], "bloomberg.com": ["Bloomberg"], "ft.com": ["Financial Times"],
  "meed.com": ["MEED"], "bigprojectme.com": ["Big Project ME"], "cbnme.com": ["CBNME"], "constructionweekonline.com": ["Construction Week"], "globalconstructionreview.com": ["Global Construction Review"],
  "theafricareport.com": ["The Africa Report"], "economymiddleeast.com": ["Economy Middle East"], "bbc.com": ["BBC"],
  "etimad.sa": ["منصة اعتماد", "اعتماد", "Etimad"], "tenders.etimad.sa": ["منصة اعتماد", "اعتماد", "Etimad"], "etenders.gov.eg": ["بوابة التعاقدات العامة", "التعاقدات الحكومية"],
  "monaqasat.mof.gov.qa": ["Monaqasat"], "ted.europa.eu": ["TED"], "ungm.org": ["UNGM"], "tendersinfo.com": ["Tenders Info", "TendersInfo"], "globaltenders.com": ["Global Tenders"],
  "tendersontime.com": ["Tenders On Time", "TendersOnTime"], "dgmarket.com": ["dgMarket"], "biddetail.com": ["BidDetail"], "tender247.com": ["Tender247"],
  "kompass.com": ["Kompass"], "europages.com": ["Europages"], "europages.co.uk": ["Europages"], "yellowpages.com.eg": ["Yellow Pages", "الصفحات الصفراء"], "dnb.com": ["Dun & Bradstreet", "D&B"],
  "opencorporates.com": ["OpenCorporates"], "zoominfo.com": ["ZoomInfo"], "crunchbase.com": ["Crunchbase"], "alibaba.com": ["Alibaba"], "made-in-china.com": ["Made-in-China"],
  "indiamart.com": ["IndiaMART"], "tradeindia.com": ["TradeIndia"], "tradekey.com": ["TradeKey"], "go4worldbusiness.com": ["go4WorldBusiness"], "ec21.com": ["EC21"],
});
const TLD_SLD = new Set(["com", "net", "org", "gov", "edu", "co", "ac", "or", "ne", "go", "mil", "sch", "nic", "info", "biz", "int", "news", "press", "online", "site"]);
const GENERIC_LABEL = new Set(["www", "www2", "www3", "m", "en", "ar", "fr", "web", "portal", "online", "service", "services", "e", "app", "apps", "my", "site", "home", "main",
  "tender", "tenders", "news", "procurement", "eprocure", "etender", "etenders", "find", "gov", "government", "public", "business", "trade", "market", "markets", "global", "world",
  "egypt", "saudi", "africa", "gulf", "arab", "middle", "east", "industry", "industrial", "company", "group", "media", "press", "daily", "today", "times", "the"]);
/* the words of a host that name the site («tenders.etimad.sa» → etimad; «find-tender.service.gov.uk» → findtender; «youm7.com» → youm7) */
export function siteLabels(host) {
  const parts = bareHost(host).split(".").filter(Boolean);
  if (parts.length > 1) parts.pop();
  const out = [];
  for (const p of parts) {
    if (TLD_SLD.has(p) || GENERIC_LABEL.has(p) || p.length === 2) continue;
    const l = p.replace(/-/g, "");
    if (l.length >= 4 && !out.includes(l)) out.push(l);
  }
  return out;
}
/* a third-party site: a listed portal / aggregator / newspaper / directory / B2B market, a row the capture marked aggregator, or a host whose
   own words read like a tender / trade site («bidsmarket», «tenderlink», «b2bmarket») — its name is cut from the title and never the
   entity (review 2026-11-21: an unlisted aggregator's name came out as the tender's owner) */
const AGGR_LABEL = /bid|tender|rfp|rfq|procur|monaq|munaq|etimad|award|sourcing|b2b|trade|market|directory|yellow|kompass|leads/i;
const isThird = (host, aggr) => !!host && (!!aggr || onHost(host, THIRD) || siteLabels(host).some(l => AGGR_LABEL.test(l)));
const brandsOf = host => { const h = bareHost(host); for (const k of Object.keys(BRAND)) if (h === k || h.endsWith("." + k)) return BRAND[k]; return []; };
const MEDIA = /^(?:بواب[ةه]|جريد[ةه]|صحيف[ةه]|موقع|مجل[ةه]|منص[ةه]|شبك[ةه]|قنا[ةه]|راديو)\s/;
const MEDIA_W = /\b(?:news|times|gazette|journal|daily|tribune|herald|post|online|portal|magazine|tv|press|media)\b/i;
const squash = s => norm(s).replace(/\s+/g, "");
const words = s => (norm(s).match(/[\p{L}\p{N}]+/gu) || []).length;
const letters = s => (String(s || "").match(/[\p{L}]/gu) || []).length;
const DOMAIN_RX = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|gov|edu|info|biz|news|press|io|co|me|tv|int|online|site|store|eg|sa|ae|kw|qa|om|bh|jo|iq|ly|sd|ma|dz|tn|ke|ng|et|za|cn|in|tr|de|it|fr|es|uk|us|ru|eu)(?:\.[a-z]{2})?\b(?:\/\S*)?/gi;
/* does this part of a title only name the site (a third-party host's name, its Arabic name, a newspaper / portal kind of name)? */
function siteish(seg, host, labels, brands, ownerIsEntity) {
  const sq = squash(seg), n = norm(seg);
  if (!sq) return true;
  for (const l of labels) if (sq === l || (sq.includes(l) && sq.length <= l.length + 12)) return !ownerIsEntity;
  for (const b of brands) { const nb = norm(b); if (nb && (n === nb || (n.includes(nb) && n.length <= nb.length + 12))) return true; }
  return words(seg) <= 4 && (MEDIA.test(n + " ") || MEDIA_W.test(seg));
}
/* the parts of a title that are not the opportunity (site sections, crumbs) */
const GENERIC = new Set(["home", "homepage", "home page", "الرئيسيه", "الصفحه الرئيسيه", "tenders", "tender", "tender details", "tender notice", "details", "news", "latest news",
  "procurement", "procurement notices", "procurement notice", "opportunities", "business opportunities", "مناقصات", "المناقصات", "مناقصه", "تفاصيل", "تفاصيل المناقصه", "اخبار",
  "الاخبار", "اخر الاخبار", "عاجل", "عطاءات", "العطاءات", "مشتريات", "المشتريات", "about us", "about", "who we are", "من نحن", "contact us", "contact", "اتصل بنا", "products",
  "منتجاتنا", "our products", "official website", "الموقع الرسمي", "page", "index", "search", "results", "search results", "نتائج البحث", "بحث", "الاقتصاد", "اقتصاد", "economy",
  "business", "business news", "اخبار مصر", "egypt news"].map(norm));
const SEP = /\s*[|｜]\s*|\s+[-–—]\s+|\s+::\s+|\s+[»«›‹]\s+|\s+[·•]\s+/;
/* who owns an opportunity, in a part of a title or a phrase («وزارة …», "… Authority", «شركة …») */
const ENTITY_W = /(?:^|\s)(?:ال)?(?:وزار[ةه]|هيئ[ةه]|شرك[ةه]|مؤسس[ةه]|جامع[ةه]|مستشفي|مستشفى|محافظ[ةه]|مديري[ةه]|بنك|بلدي[ةه]|امان[ةه]|أمان[ةه]|مجلس|جهاز|صندوق|اتحاد|غرف[ةه]|مصنع|مصانع|مجموع[ةه]|ادار[ةه]|إدار[ةه]|مركز|معهد)(?=\s|$)|\b(?:ministry|authority|company|co|corporation|corp|municipality|university|hospital|bank|council|agency|department|directorate|holding|group|industries|ltd|llc|inc|plc|organization|organisation|commission|board|fund|institute|utility|utilities|government|province|governorate|mills|plant|factory|s\.?a\.?e)\b/i;
const clipW = (s, n) => { const a = Array.from(String(s || "").replace(/\s+/g, " ").trim()); if (a.length <= n) return a.join(""); const t = a.slice(0, n - 1).join(""), cut = t.lastIndexOf(" "); return (cut > n * 0.6 ? t.slice(0, cut) : t).replace(/[\s،,:;\-–—]+$/, "") + "…"; };
const tidy = s => String(s || "").replace(DOMAIN_RX, " ").replace(/[\s|｜:;،,\-–—·•»«›‹]+$/g, "").replace(/^[\s|｜:;،,\-–—·•»«›‹]+/g, "").replace(/\s+/g, " ").trim();
/* the latin names of third-party sites as words anywhere in a text (only names that are not ordinary words: GENERIC_LABEL is never cut) */
function cutLabels(s, labels) {
  let t = String(s || "");
  for (const l of labels) t = t.replace(new RegExp("(^|[^a-z0-9])" + l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^a-z0-9])", "gi"), "$1");
  return t;
}

/* an Arabic or Latin name as a pattern that also meets its other spellings (أ / ا / إ / آ, ة / ه, ى / ي, any spaces) */
const nameRx = b => String(b).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[اأإآ]/g, "[اأإآ]").replace(/[ةه]/g, "[ةه]").replace(/[يى]/g, "[يى]").replace(/\s+/g, "\\s*");
/* a site's own name at the start or the end of a headline: the stored title lost its «|» (forLLM), so «… | اليوم السابع» reads «… اليوم السابع» */
function cutBrands(s, brands) {
  let t = String(s || "");
  for (const b of brands) {
    const rx = nameRx(b);
    t = t.replace(new RegExp("^\\s*(?:" + rx + ")(?:\\s*[:\\-–—·•]+\\s*|\\s+)", "i"), "").replace(new RegExp("(?:\\s*[:\\-–—·•]+\\s*|\\s+)(?:" + rx + ")\\s*$", "i"), "");
  }
  return t.trim();
}

/* ---------------- a buyer's / a news item's official source (the gate, header) ---------------- */
/* the words of a host that may be a company's own name («elsewedyelectric.com» → elsewedyelectric; «acme-mills.example» → acme + mills) */
function ownNames(host) {
  const parts = bareHost(host).split(".").filter(Boolean);
  if (parts.length > 1) parts.pop();
  const out = [];
  for (const p of parts) {
    if (TLD_SLD.has(p) || GENERIC_LABEL.has(p) || p.length < 3 || /^\d+$/.test(p)) continue;
    const bits = p.split("-").filter(b => b.length >= 3 && !GENERIC_LABEL.has(b));
    if (bits.length) out.push(bits);
  }
  return out;
}
/* the company's own site: not a third party's (a directory, an aggregator, a B2B marketplace, a newspaper, a tender site — isThird), not a
   social network, a reference site or a page hosted on someone else's domain, and the domain's own name is the name the page itself gives
   (its title, the entity read from it, its snippet): «Acme Paper Mills» on acme-mills.example, never «Acme» on a stranger's domain */
export function ownSite(r) {
  const host = bareHost((r && r.site) || "");
  if (!host || Number(r.aggregator) || isThird(host, false) || onHost(host, SOCIAL) || onHost(host, REFERENCE) || onHost(host, HOSTED)) return false;
  const named = squash([r.title, r.entity, r.snippet].filter(Boolean).join(" "));
  return !!named && ownNames(host).some(bits => named.includes(bits.join("")) || (bits.some(b => b.length >= 4) && bits.every(b => named.includes(b))));
}
/* a buyer / a buyer list: from the company's or the body's own official page — its own site, or a government / public-body page */
export const officialBuyer = r => officialSource(r) || ownSite(r);
/* a news item: a government / public body, the company's own site or an official news agency */
export const officialNews = r => officialSource(r) || onHost(bareHost((r && r.site) || ""), AGENCIES) || ownSite(r);
/* a person's page, not a company's: a job title in its title («مدير المشتريات», "Purchasing Manager", a CV) — never a buyer */
const ROLE_AR = /(?:^| )(?:ال)?(?:مدير|مديره|مسئول|مسؤول|مندوب|محاسب|سيره ذاتيه|السيره الذاتيه)(?= |$)/;
const ROLE_EN = /\b(?:manager|director|ceo|cfo|coo|cto|founder|co-founder|officer|engineer|purchaser|specialist|executive|freelancer|resume|r[ée]sum[ée]|curriculum vitae|cv|my profile)\b/i;
export const personRole = s => ROLE_AR.test(norm(s)) || ROLE_EN.test(String(s || ""));
/* the day a news item was published (YYYY-MM-DD) or "": the provider's date — a date («2026-11-16», «Sun, 16 Nov 2026 …», «Nov 16, 2026»)
   or an age («3 days ago», «منذ 3 أيام») counted back from the day it was found */
const AGE = /(\d+)\s*(minute|min|hour|hr|day|week|month|year|دقيق|ساع|يوم|ايام|أيام|اسبوع|أسبوع|اسابيع|أسابيع|شهر|شهور|اشهر|أشهر|سن)/i;
export function newsDay(date, firstSeen) {
  const s = asciiDigits(String(date || "")).trim().slice(0, 60);
  if (!s) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return valid(+m[1], +m[2], +m[3]);
  const base = Date.parse(String(firstSeen || ""));
  if (!/\d{4}/.test(s) && Number.isFinite(base)) {
    if (/\b(?:yesterday)\b|(?:^| )(?:امس|أمس|امبارح|إمبارح)(?= |$)/i.test(s)) return cairoDay(base - 864e5);
    if (/\b(?:today|just now)\b|(?:^| )(?:النهارده|اليوم)(?= |$)/i.test(s)) return cairoDay(base);
    const a = AGE.exec(s);
    if (a) {
      const n = +a[1], u = a[2].toLowerCase();
      const days = /minute|min|hour|hr|دقيق|ساع/.test(u) ? 0 : /day|يوم|ايام|أيام/.test(u) ? n : /week|اسبوع|أسبوع|اسابيع|أسابيع/.test(u) ? n * 7 : /month|شهر|شهور|اشهر|أشهر/.test(u) ? n * 30 : n * 365;
      return cairoDay(base - days * 864e5);
    }
    return "";
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return cairoDay(t);
  return dateIn(s);
}

/* ---------------- one lead → what may be shown ---------------- */
/* the title in the platform's words: the parts that name the site dropped, the opportunity's own parts kept (the longest first in importance,
   the owner's name when it is a part of its own), no domain / link, ≤ WL.title characters; "" when nothing of it is left */
export function publicTitle(title, host, type, aggr = false) {
  const third = isThird(host, aggr), labels = siteLabels(host), brands = brandsOf(host);
  const ownerIsEntity = !third && (type === "tender" || type === "rfq" || type === "buyer" || type === "buyer_list");
  const raw = tidy(forLLM(title, 300));
  let segs = raw.split(SEP).map(tidy).filter(s => letters(s) >= 2 && !GENERIC.has(norm(s)));
  if (segs.length > 1) segs = segs.filter(s => !siteish(s, host, labels, brands, ownerIsEntity));
  else if (segs.length === 1 && (third || type === "news" || type === "project") && siteish(segs[0], host, labels, brands, false) && words(segs[0]) <= 3) segs = [];
  if (!segs.length) return "";
  /* news / projects: the headline (the longest part) and a part that names a company or a body; tenders / RFQs / buyers: every part left */
  if (type === "news" || type === "project") { const main = segs.reduce((a, b) => (letters(b) > letters(a) ? b : a), segs[0]); segs = segs.filter(s => s === main || ENTITY_W.test(" " + s + " ")); }
  let t = segs.slice(0, 3).join(" — ");
  /* the site's own name inside the headline: a third-party site's always; a news / project page of another site only when its name is no
     ordinary word (a digit or a press word in it: «steelnews», «youm7» — never «paper» of paper.com) */
  if (third) t = cutLabels(cutBrands(t, brands), labels);
  else if (type === "news" || type === "project") t = cutLabels(t, labels.filter(l => /\d|news|times|daily|post|press|tv|mag|gate|online|portal/.test(l)));
  t = tidy(t);
  if (letters(t) < 4) return "";
  return clipW(t, WL.title);
}
/* the entity or company that owns the opportunity, when its own words name it — never a site */
export function entityOf(title, snippet, host, type, aggr = false) {
  const third = isThird(host, aggr), labels = siteLabels(host), brands = brandsOf(host), text = asciiDigits(forLLM(String(title || "") + " . " + String(snippet || ""), 700));
  const cands = [];
  let m = /(?:^|[\s،,.:؛])تعلن\s+(.{3,70}?)\s+عن\s+(?:طرح|اجراء|إجراء|رغبت|حاجت|بدء|فتح|تنظيم|عقد|اعلان|إعلان)/.exec(text); if (m) cands.push(m[1]);
  m = /(?:^|[\s،,.:؛(])(?:لصالح|لحساب)\s+([^،,.:؛()\n|«»]{3,70})/.exec(text); if (m) cands.push(m[1]);
  m = /(?:^|[.:;|]\s*|\s)((?:The\s+)?[A-Z][\w&'’.-]*(?:\s+(?:of|for|and|&|the|de|du|[A-Z][\w&'’.-]*)){1,10})\s+(?:hereby\s+)?(?:invites?|is\s+inviting|seeks|announces|requests)\b/.exec(text); if (m) cands.push(m[1]);
  m = /\bon\s+behalf\s+of\s+(?:the\s+)?([A-Z][^,.;:|()\n]{2,70})/.exec(text); if (m) cands.push(m[1]);
  /* a part of the title that names a ministry / authority / company, or (the site is the owner's own) the site's name as a part of it */
  const segs = tidy(forLLM(title, 300)).split(SEP).map(tidy).filter(s => letters(s) >= 3 && !GENERIC.has(norm(s)));
  if (segs.length > 1) {
    const main = segs.reduce((a, b) => (letters(b) > letters(a) ? b : a), segs[0]);
    for (const s of segs) if (s !== main && ENTITY_W.test(" " + s + " ")) cands.push(s);
    if (!third && (type === "tender" || type === "rfq")) for (const s of segs) if (s !== main && labels.some(l => squash(s).includes(l))) cands.push(s);
  }
  for (const c0 of cands) {
    const c = tidy(cutLabels(c0, third ? labels : []));
    if (letters(c) < 3 || Array.from(c).length > WL.entity + 20 || personalIn(c) || instructionLike(c, { money: false })) continue;
    if (third && siteish(c, host, labels, brands, false)) continue;
    if (brands.some(b => norm(c) === norm(b))) continue;
    return clipW(c, WL.entity);
  }
  return "";
}

/* ---------------- the deadline of a tender / RFQ (its own words) ---------------- */
const MONTHS = (() => {
  const m = new Map();
  const add = (n, list) => list.split(" ").forEach(w => m.set(norm(w.replace(/_/g, " ")), n));
  add(1, "january jan يناير كانون_الثاني جانفي"); add(2, "february feb فبراير شباط فيفري"); add(3, "march mar مارس آذار اذار");
  add(4, "april apr أبريل ابريل إبريل نيسان أفريل افريل"); add(5, "may مايو أيار ايار ماي"); add(6, "june jun يونيو يونيه حزيران جوان");
  add(7, "july jul يوليو يوليه تموز جويلية"); add(8, "august aug أغسطس اغسطس آب اب أوت اوت"); add(9, "september sept sep سبتمبر أيلول ايلول");
  add(10, "october oct أكتوبر اكتوبر تشرين_الأول"); add(11, "november nov نوفمبر تشرين_الثاني"); add(12, "december dec ديسمبر كانون_الأول");
  return m;
})();
const KW = /(?:[اأإآ]خر\s+(?:موعد|ميعاد|يوم|تاريخ)|موعد\s+(?:ال)?تقديم|(?:فض|فتح)\s+(?:ال)?مظاريف|(?:تاريخ|موعد)\s+(?:ال)?(?:[اإ]غلاق|غلق|[اإ]نتهاء)|ينتهي\s+(?:ال)?(?:تقديم|استلام)|(?:حتى|حتي|لغاي[ةه])\s+(?:تاريخ|يوم)|closing\s+(?:date|time|on)|clos(?:es|ing)\s+on|\bcloses\b|\bdeadline\b|due\s+date|bids?\s+(?:are\s+)?due|submission\s+(?:date|deadline)|last\s+date|end\s+date|expiry\s+date|expires\s+on|(?:open|valid)\s+until)/gi;
const CANCELLED = /\b(?:cancel+ed|expired|withdrawn)\b|(?:^|\s)(?:ملغا[ةه]|ملغي[ةه]|تم\s+[اإ]لغاء|[اإ]لغاء\s+(?:ال)?مناقص[ةه]|انتهي\s+موعد\s+(?:ال)?تقديم|انتهى\s+موعد\s+(?:ال)?تقديم|انتهت\s+(?:ال)?مهل[ةه])(?=\s|$)/i;
const valid = (y, mo, d) => { if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return ""; const t = new Date(Date.UTC(y, mo - 1, d)); return t.getUTCMonth() === mo - 1 ? t.toISOString().slice(0, 10) : ""; };
function dateIn(s) {
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return +m[1] >= 1400 && +m[1] < 1500 ? "" : valid(+m[1], +m[2], +m[3]); // a Hijri year (14xx) is not read
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) { let d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000; if (y >= 1400 && y < 1500) return ""; if (mo > 12 && d <= 12) { const x = d; d = mo; mo = x; } return valid(y, mo, d); }
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([\p{L}]+(?:\s[\p{L}]+)?)[,\s]+(\d{4})/u.exec(s);
  if (m) { const mo = MONTHS.get(norm(m[2])) || MONTHS.get(norm(m[2].split(" ")[0])); if (mo) return valid(+m[3], mo, +m[1]); }
  m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s);
  if (m) { const mo = MONTHS.get(norm(m[1])); if (mo) return valid(+m[3], mo, +m[2]); }
  return "";
}
/* the deadline a notice states (YYYY-MM-DD) or "": a date right after its deadline words (the latest when it gives several: the opening of the
   envelopes follows the submission) — a date anywhere else (the publication date, a reference) is never read as one */
export function deadlineOf(text) {
  const t = asciiDigits(String(text || "")).slice(0, 1200);
  let best = "";
  KW.lastIndex = 0;
  for (let m; (m = KW.exec(t));) {
    const d = dateIn(t.slice(m.index + m[0].length, m.index + m[0].length + 60));
    if (d && d > best) best = d;
  }
  return best;
}
/* open | closing (≤ 7 days) | closed | unknown — the platform's honest tender rule (index.js tenderStatus): never open without a deadline */
export function statusOf(deadline, cancelled, nowMs = Date.now()) {
  if (cancelled) return "closed";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ""))) return "unknown";
  const today = cairoDay(nowMs);
  return deadline < today ? "closed" : deadline <= addDays(today, 7) ? "closing" : "open";
}
const GOV_EN = new Map(Object.values(GOV_CODES).map(([ar, en]) => [norm(ar), en]));

/* one row → {pub (the public fields, and only them), hay (the search text), match (index.js: what janna_lookup matches on), cancelled} |
   null when the row is not published (the reason: publicState) */
export function publicOf(r, nowMs = Date.now()) {
  const j = judge(r, nowMs);
  return j.why ? null : j.x;
}
/* → {why: "" | the reason it is not published, x: publicOf's answer when published} */
function judge(r, nowMs = Date.now()) {
  const why = whyNot(r); if (why) return { why, x: null };
  const type = r.type, host = String(r.site || ""), t0 = titleOf(r);
  const aggr = !!Number(r.aggregator);
  const title = publicTitle(t0, host, type, aggr);
  const entity = entityOf(t0, r.snippet, host, type, aggr);
  const product = (() => { const p = tidy(forLLM(r.product || "", 120)); return p && !personalIn(p) && !instructionLike(p, { money: false }) ? clipW(p, WL.product) : ""; })();
  if (!title && !product) return { why: "empty", x: null }; // nothing to say in the platform's words
  const dated = DATED.has(type), text = t0 + " . " + String(r.snippet || "");
  const deadline = dated ? deadlineOf(text) : "", cancelled = dated && CANCELLED.test(norm(text) + " " + text);
  /* the auto-publish gate (header): official source, a closing date ahead, not one the platform has */
  if (OFFICIAL_TYPES.has(type) && !officialSource(r)) return { why: "unofficial", x: null };
  if (dated && (cancelled || (deadline && deadline < cairoDay(nowMs)))) return { why: "closed", x: null };
  if (dated && !deadline) return { why: "no_deadline", x: null };
  if (OFFICIAL_TYPES.has(type) && knownTo(type, title || t0)) return { why: "duplicate", x: null };
  /* buyers and buyer lists: the company's or the body's own official page, never a person, never a company the directory has */
  if (BUYER_TYPES.has(type)) {
    if (!officialBuyer({ ...r, title: t0, entity })) return { why: "unofficial", x: null };
    if (personRole(t0)) return { why: "personal", x: null };
    if ([title, entity, t0].some(t => t && knownTo("buyer", t))) return { why: "duplicate", x: null };
  }
  /* news: an official source, inside the news window, not one the platform has */
  if (type === "news") {
    if (!officialNews({ ...r, title: t0, entity })) return { why: "unofficial", x: null };
    const day = newsDay(r.date, r.first_seen), today = cairoDay(nowMs);
    if (!day || day > addDays(today, 1)) return { why: "no_date", x: null };
    if (day < addDays(today, -NEWS_DAYS)) return { why: "old", x: null };
    if (knownTo("news", title || t0)) return { why: "duplicate", x: null };
  }
  const gov = String(r.governorate || "").slice(0, 40), found = (() => { const t = Date.parse(String(r.first_seen || "")); return Number.isFinite(t) ? cairoDay(t) : String(r.first_seen || "").slice(0, 10); })(); // the Cairo day it was found (a UTC slice is yesterday after 22:00 UTC)
  const pub = { id: Number(r.id) || 0, type, title, ...(entity ? { entity } : {}), ...(product ? { product } : {}), market: String(r.market || "").slice(0, 20),
    ...(gov ? { governorate: gov, ...(GOV_EN.get(norm(gov)) ? { governorate_en: GOV_EN.get(norm(gov)) } : {}) } : {}),
    ...(dated ? { deadline } : {}), ...(officialOf(r) ? { official: true } : {}), found: /^\d{4}-\d{2}-\d{2}$/.test(found) ? found : "" };
  return { why: "", x: { pub, cancelled, hay: norm([title, entity, product, gov].join(" ")), match: [title, entity].join(" "), words: [product, forLLM(r.query || "", 200)].join(" ") } };
}
/* why a row is not on the platform: "" (it is) | "status" (rejected / hidden by the team) | "type" (not an opportunity) | "personal" */
export function whyNot(r) {
  if (!r || !OK_STATUS.includes(String(r.status || ""))) return "status";
  if (!PUBLIC_TYPES.includes(String(r.type || ""))) return "type";
  /* names in news and projects are public figures'; a buyer's request names the buyer. An official notice (a portal / a public body) carries
     its long reference numbers, which the capture masked like phones: there the mask is a number, cut from the title; its snippet (never
     shown) names the body's procurement office, not a person */
  const people = r.type !== "news" && r.type !== "project", official = officialOf(r);
  if (personalIn(titleOf(r), { people })) return "personal";
  if (!official && personalIn(r.snippet, { people: r.type === "rfq" || r.type === "buyer" || r.type === "buyer_list" })) return "personal";
  if (instructionLike(String(r.title || ""), { money: false })) return "personal";
  /* no personal contact in any field (the gate, header): the product and the words it was found with too */
  if (personalIn(r.product, { people: false }) || personalIn(r.query, { people: false })) return "personal";
  return "";
}
const officialOf = r => !!r && DATED.has(String(r.type || "")) && officialSource(r);
/* the stored title as it may be read: an official notice's masked reference numbers cut out */
const MASK_NUM = new RegExp("(?:(?:رقم|No\\.?|Ref\\.?|Number|#)\\s*)?" + MASK_PHONE, "gi");
const titleOf = r => (officialOf(r) ? String(r.title || "").replace(MASK_NUM, " ").replace(/\s+/g, " ").trim() : String(r.title || ""));
/* the desk's view of one row: is it on the platform now, and if not, why (web-leads.js itemOf) */
export function publicState(r, nowMs = Date.now()) {
  const j = judge(r, nowMs);
  return j.why ? { published: false, why: j.why } : { published: true, why: "" };
}
/* would a lead found right now be published (the hunt / search say «اتضافت على المنصة» only then): the same gate on the row recordLeads
   writes — r: {type, title, snippet, url, date, official, aggregator, product, market, query} */
export function wouldPublish(r, nowMs = Date.now()) {
  if (!r || !PUBLIC_TYPES.includes(r.type)) return false;
  let site = ""; try { site = bareHost(new URL(String(r.url || "")).hostname); } catch (e) { return false; }
  return !judge({ id: 0, status: "new", type: r.type, title: forLLM(r.title, 160), snippet: forLLM(r.snippet, 300), site, official: r.official ? 1 : 0, aggregator: r.aggregator ? 1 : 0,
    product: forLLM(r.product || "", 120), query: forLLM(r.query || "", 200), market: r.market || "", governorate: "", date: forLLM(r.date || "", 40), first_seen: new Date(nowMs).toISOString() }, nowMs).why;
}

/* is the platform publishing what the assistants find now: the leads store (0012), its owner switch web_leads, and one of the two places
   that show them (web_leads_public: the page; web_leads_lookup: janna_lookup) — never throws */
export async function publishingOn(env) {
  try {
    if (!env || !env.DB || !(await leadsStoreOn(env)) || !(await featureOn(env, "web_leads"))) return false;
    return (await featureOn(env, "web_leads_public")) || (await featureOn(env, "web_leads_lookup"));
  } catch (e) { return false; }
}
/* the persona's line for n found opportunities the platform adds (members-only like the rest); voice: janna | janna_en | bassem … */
export function platformLine(n, voice) {
  const en = /_en$/.test(String(voice || "")), bassem = /^bassem/.test(String(voice || ""));
  if (en) return n === 1 ? "One of them is added to the platform's «Market opportunities»; its details are for subscribed members." : `${n} of them are added to the platform's «Market opportunities»; their details are for subscribed members.`;
  if (bassem) return n === 1 ? "وواحدة منهم اتضافت على المنصة في «فرص السوق»." : `و${n === 2 ? "اتنين" : n} منهم اتضافوا على المنصة في «فرص السوق».`;
  return n === 1 ? "وواحدة منهم اتضافت على المنصة في «فرص السوق»، وتفاصيلها للأعضاء المشتركين." : `و${n === 2 ? "اتنين" : n} منهم اتضافوا على المنصة في «فرص السوق»، وتفاصيلهم للأعضاء المشتركين.`;
}

/* ---------------- the reader (one read per isolate per ttl) ---------------- */
let MEMO = { at: 0, v: 0, off: true, rows: [], lookup: false }, LOADING = null, VER = 0;
export function resetPublished() { MEMO = { at: 0, v: 0, off: true, rows: [], lookup: false }; LOADING = null; }
/* after a desk decision (hide / restore / reject …) in this isolate: the next reader reads again */
export function forgetPublished() { MEMO = { ...MEMO, at: 0 }; }
/* «بحث وكتابة عميقة» (research.js, via 'research'): kept for the data desk only, never published here — they are steered by a member's own job */
const SQL = "SELECT id, title, snippet, site, type, official, aggregator, query, product, market, governorate, date, first_seen, last_seen, status, via FROM web_leads WHERE status = ? ORDER BY last_seen DESC LIMIT " + WL.rows;
const noTable = e => /no such table/i.test(String((e && e.message) || e));
/* ONE round trip: the owner's switches (flags.js memo, 30 s) and the two indexed reads at once; no 0012 table → off (fail-soft) */
async function load(env, nowMs) {
  const [view, lists] = await Promise.all([loadFeatures(env).catch(() => null),
    Promise.all(OK_STATUS.map(st => env.DB.prepare(SQL).bind(st).all().then(x => (x && x.results) || []))).catch(e => { if (!noTable(e)) throw e; return null; })]);
  const lookup = valueOf(view, "web_leads_lookup");
  if (!lists) return { at: nowMs, v: ++VER, off: true, rows: [], lookup };
  const seen = new Set(), rows = [];
  for (const r of [].concat(...lists).sort((a, b) => String(b.first_seen).localeCompare(String(a.first_seen)) || Number(b.id) - Number(a.id))) {
    if (r.via === "research") continue; // «بحث وكتابة عميقة»: never published (above)
    const x = publicOf(r, nowMs); if (!x) continue;
    const k = x.pub.type + "|" + norm(x.pub.title || x.pub.product); // the same notice on several sites (syndication): once, the first found
    if (seen.has(k)) continue; seen.add(k); rows.push(x);
  }
  return { at: nowMs, v: ++VER, off: false, rows, lookup };
}
/* the published leads of this isolate: read again only when the memo is older than ttl → {at, v, off, rows: [{pub, cancelled, hay, match,
   words}], lookup: the owner's switch web_leads_lookup as it was at that read (janna_lookup follows it within the same 10 minutes)}
   (never throws: a failed read publishes nothing for the same ttl) */
export async function publishedLeads(env, nowMs = Date.now(), { ttl = WL.ttl } = {}) {
  if (!env || !env.DB) return { at: 0, v: 0, off: true, rows: [], lookup: false };
  if (MEMO.at && nowMs - MEMO.at >= 0 && nowMs - MEMO.at < ttl) return MEMO;
  if (LOADING) return LOADING;
  LOADING = load(env, nowMs).then(m => (MEMO = m), e => { console.error("web-public: read", (e && e.message) || "error"); return (MEMO = { at: nowMs, v: ++VER, off: true, rows: [], lookup: false }); })
    .finally(() => { LOADING = null; });
  return LOADING;
}
/* the public fields of one memo row with its status today (open / closing / closed / unknown; "" for the types without a deadline) */
export function publicItem(x, nowMs = Date.now()) {
  const p = x.pub;
  return DATED.has(p.type) ? { ...p, status: statusOf(p.deadline, x.cancelled, nowMs) } : { ...p, status: "" };
}
/* still on the platform today: a tender / RFQ whose closing date passed since the memo was read leaves the lists (the gate, header) */
export const liveItem = it => !!it && !(DATED.has(it.type) && it.status !== "open" && it.status !== "closing");

/* ---------------- GET /api/janna/opportunities (the public page /market-opportunities/) ----------------
   ?type=tender|rfq|buyer|buyer_list|project|news &market=<code> &q=<words> &page=<1…> → 200 {ok, items, total, page, pages, per_page, counts,
   open, markets, updated} — counts = per type with the other filters, open = the open / closing tenders and RFQs among the filtered ones,
   markets = [{code, n}]. Owner switch web_leads_public off, or 0012 not applied → 200 {ok, off: true, reason, items: []}. GET only,
   Cache-Control public 60 s; ≤ 60 requests a minute per address and isolate (memory only: no address is kept). */
const HDR = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
const out = (o, status = 200, extra) => new Response(JSON.stringify(o), { status, headers: { ...HDR, ...(extra || {}) } });
const RATE = { win: 0, map: new Map() }, RATE_N = 60;
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function rateOk(req, nowMs) {
  const w = Math.floor(nowMs / 60000); if (RATE.win !== w) { RATE.win = w; RATE.map.clear(); }
  const k = fnv("wl|" + String(req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "")); const n = (RATE.map.get(k) || 0) + 1;
  if (RATE.map.size < 20000) RATE.map.set(k, n);
  return n <= RATE_N;
}
export const resetRate = () => { RATE.win = 0; RATE.map.clear(); };
const OFF_ANSWER = reason => ({ ok: true, off: true, reason, items: [], total: 0, page: 1, pages: 1, per_page: WL.per_page, counts: {}, open: 0, markets: [] });
export async function handlePublicLeads(req, env, ctx, nowMs = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
  if (req.method !== "GET") return out({ error: "method", code: "method" }, 405, { Allow: "GET" });
  if (!rateOk(req, nowMs)) return out({ error: "طلبات كتير ورا بعض — جرّب تاني بعد دقيقة / too many requests — try again in a minute", code: "rate_limited" }, 429, { "Retry-After": "60", "Cache-Control": "no-store" });
  const cache = { "Cache-Control": "public, max-age=60" };
  if (!(await featureOn(env, "web_leads_public"))) return out(OFF_ANSWER("feature_off"), 200, cache);
  const m = await publishedLeads(env, nowMs, { ttl: WL.page_ttl });
  if (!m || m.off) return out(OFF_ANSWER("not_ready"), 200, cache);
  const sp = new URL(req.url).searchParams;
  const type = PUBLIC_TYPES.includes(sp.get("type")) ? sp.get("type") : "", market = /^[a-z]{2,8}$/.test(String(sp.get("market") || "")) ? sp.get("market") : "";
  const qw = norm(String(sp.get("q") || "").slice(0, WL.q)).split(" ").filter(w => w.length >= 2).slice(0, 6);
  const hit = x => (!market || x.pub.market === market) && (!qw.length || qw.every(w => x.hay.includes(w)));
  const rows = m.rows.filter(x => liveItem(publicItem(x, nowMs))); // a closing date that passed since the read: off the lists (the gate)
  const base = rows.filter(hit), list = base.filter(x => !type || x.pub.type === type);
  const counts = {}; for (const x of base) counts[x.pub.type] = (counts[x.pub.type] || 0) + 1;
  const mk = new Map(); for (const x of rows) if (x.pub.market && (!type || x.pub.type === type)) mk.set(x.pub.market, (mk.get(x.pub.market) || 0) + 1);
  /* members-only (owner 2026-11-28): a visitor gets the opportunities without their entity and official mark (lockWeb); a signed-in member
     whose plan covers Egypt gets them in full — never from the shared cache */
  const acc = req.headers.get("Authorization") ? await viewerOf(req, env, { anam: false }, nowMs) : null, full = acc && acc.who !== "visitor";
  if (full) cache["Cache-Control"] = "private, no-store";
  const items = list.map(x => publicItem(x, nowMs)).map(x => (full ? lockWeb(x, acc) : lockWeb(x, null)));
  /* the closed ones last (the newest first inside each group) — a closed tender is shown as closed, never among the open ones */
  const ordered = items.filter(x => x.status !== "closed").concat(items.filter(x => x.status === "closed"));
  const per = WL.per_page, pages = Math.max(1, Math.ceil(ordered.length / per)), page = Math.min(Math.max(Math.floor(+sp.get("page") || 1), 1), Math.min(pages, WL.max_page));
  return out({ ok: true, items: ordered.slice((page - 1) * per, page * per), total: ordered.length, page, pages, per_page: per, counts,
    open: items.filter(x => x.status === "open" || x.status === "closing").length, markets: [...mk].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n })),
    updated: m.at ? new Date(m.at).toISOString() : "", today: cairoDay(nowMs) }, 200, cache);
}
