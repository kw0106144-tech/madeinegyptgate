/* The web hunt's PURE rules (spec 2026-11-20 «جنة وباسم آلات سحب داتا»; review B1, S1–S4, S9, S13, nits 4 / 13 / 20): what a web page
   is for a SELLER — an official tender, a buyer's RFQ, a company that could buy, a list of such companies, a new project that will need
   the product, news — or nothing (a competitor, a job ad, a shop); whether it is about the seller's product at all; and the product's
   names for the search templates. No I/O, no LLM, deterministic. Imported by websearch.js and web-hunt.js only.
   - The words, their stored forms and the synonym groups are the LOOKUP's own (lookup-terms.js, fix/lookup-index): canon(), concepts()
     — EQUIV equivalents are tier 1, the same field tier 2, an ambiguous word («سلندر»: rollers, gas cylinders or hydraulic cylinders)
     carries its AMBIG note — so the hunt and janna_lookup agree on what a product is (review S13: no second synonym list here).
   - Phrases are matched on norm() text with word boundaries (an Arabic word may carry one attached و/ف/ب/ل/ك and the article); the
     product's alternatives by their stored forms (altForms), phrases word by word in a row.
   - Rules, in order (the first that fits wins): a job ad → other · an AWARD (رست / contract award notice; «ترسية» / "awarded" only
     outside an OPEN notice, which says «سيتم الترسية» / "will be awarded" by its closing date) → news, official when it is on a
     portal or an entity site (review S2: before the portal rule) · an official procurement PORTAL → rfq or tender, official · an
     ENTITY site (a public body that also publishes news) with tender / buyer-RFQ words → official · a B2B marketplace: a buy-request
     path → rfq, any other page → other (a product listing) · a COMPETITOR (review B1: before the generic RFQ / tender words): the
     product next to a maker word («مصنع سلندرات», "roller manufacturer") or quote / sales buttons («اطلب عرض سعر», "Request for
     Quotation", «أسعار …») on a page that names the product, with no buyer-side marker (a tender / RFQ number, a closing date, «مطلوب
     توريد», "we are looking for", a buy path, the booklet / bid bond) → other · a tender AGGREGATOR → tender (not official; scored −1:
     usually a paywalled teaser, nit 20) · buyer RFQ words (strong ones, or the quote words WITH a buyer-side marker) → rfq · tender
     words → tender · project words (a new plant, an expansion, groundbreaking) → project · a news site / path → news (review S3: before
     the buyer rule) · a buyers' query: the industry (or, for importers / distributors, the product) on a list page → buyer_list, on one
     company's page → buyer · else other.
   - Relevance (review S1): the product's list items are alternatives («سلندرات، درافيل»); inside one item the synonyms join («سلندرات
     درافيل» = rollers, «سلندرات» resolved by «درافيل»); generic and service words do not count; one requirement → it must be named,
     two → both, three or more → the head and one more. An ambiguous word that nothing resolves (product_en, another word of the item)
     is a QUESTION, not a search. A few false friends of the product's words never count ("roller shutter", "road roller", «رولر كوستر»).
   - Personal links never come back (review S9): personal profiles (LinkedIn other than company pages, Facebook, Instagram, X, TikTok,
     WhatsApp / Telegram links), a link whose path holds an e-mail address or a phone number (dropped), or whose query string does
     (the query string is cut). */
import { norm } from "./text.js";
import { concepts, canon, words as lkWords, altForms, storedForms } from "./lookup-terms.js";

/* ---------------- hosts ---------------- */
export const bareHost = h => String(h || "").toLowerCase().replace(/^www\d{0,2}\./, "").replace(/\.$/, "");
/* exact host or a subdomain, on a dot boundary (nit 13: "evilungm.org" is not ungm.org) */
export const onHost = (host, list) => { const h = bareHost(host); return !!h && list.some(p => h === p || h.endsWith("." + p)); };
/* official procurement portals (every tender_gov / tender_semi / rfq source of worker-intel/seeds/sources.json is a portal or an entity
   site: a test checks the alignment) — pages there are notices */
export const PORTALS = Object.freeze(["etenders.gov.eg", "tenders.etimad.sa", "etimad.sa", "esupply.dubai.gov.ae", "adgpg.gov.ae", "etendering.tenderboard.gov.om", "tenderboard.gov.om",
  "monaqasat.mof.gov.qa", "capt.gov.kw", "tenderboard.gov.bh", "joneps.gov.jo", "tuneps.tn", "marchespublics.gov.ma", "marchespublics.mf.gov.dz", "tenders.go.ke", "etenders.gov.za",
  "ghaneps.gov.gh", "tenders.ppa.gov.gh", "gpp.ppda.go.ug", "egp.ppa.gov.et", "nest.go.tz", "umucyo.gov.rw", "marchespublics.sn", "marchespublics.ci", "bpp.gov.ng",
  "epms.ppra.gov.pk", "eprocure.gov.bd", "eprocure.gov.in", "bidplus.gem.gov.in", "ekapv2.kik.gov.tr", "ekap.kik.gov.tr", "ccgp.gov.cn", "ted.europa.eu",
  "find-tender.service.gov.uk", "contractsfinder.service.gov.uk", "boamp.fr", "contrataciondelsectorpublico.gob.es", "ungm.org", "procurement-notices.undp.org",
  "esourcing.unops.org", "ecepp.ebrd.com", "spse.inaproc.id", "myprocurement.treasury.gov.my", "muasamcong.mpi.gov.vn", "nocopo.bpp.gov.ng"]);
/* public bodies and banks whose sites also publish news: official only with tender / buyer-RFQ words */
export const ENTITIES = Object.freeze(["worldbank.org", "isdb.org", "afdb.org", "unicef.org", "wfp.org", "arabfund.org", "ebrd.com", "aiib.org", "adb.org", "jica.go.jp", "jetro.go.jp",
  "ec.europa.eu", "service.bund.de", "ppda.go.ug", "sczone.eg", "hcww.com.eg", "ida.gov.eg", "eeaa.gov.eg", "eehc.gov.eg", "eetc.net.eg", "moee.gov.eg", "egpc.com.eg",
  "newcities.gov.eg", "mpbs.gov.eg", "nbe.com.eg", "dpa.gov.eg", "fedcoc.org.eg", "apa.gov.eg", "momp.gov.eg", "nppa.gov.eg", "cairochamber.org.eg", "egas.com.eg",
  "upa.gov.eg", "nat.gov.eg", "suezcanal.gov.eg", "nrea.gov.eg", "privatesector.moic.gov.eg", "noc.ly", "dewa.gov.ae", "gafi.gov.eg", "mti.gov.eg", "modon.gov.sa"]);
/* tender aggregators: tender pages, not official, usually a paywalled teaser (nit 20) */
export const AGGREGATORS = Object.freeze(["tendersinfo.com", "globaltenders.com", "tendersontime.com", "biddetail.com", "dgmarket.com", "tenderimpulse.com", "tendersglobal.net", "tender247.com"]);
/* business directories: a company page = one company, a search / category page = a list */
export const DIRECTORIES = Object.freeze(["kompass.com", "europages.com", "europages.co.uk", "yellowpages.com.eg", "dnb.com", "opencorporates.com", "zoominfo.com", "crunchbase.com",
  "egyptyp.com", "dalil.com", "yellowpages-uae.com", "yellowpages.ae", "daleeli.com"]);
/* B2B marketplaces and shops: a product listing is a seller (a competitor); a buy-request path is a buyer's RFQ */
export const MARKETS_B2B = Object.freeze(["alibaba.com", "made-in-china.com", "indiamart.com", "tradeindia.com", "exportersindia.com", "ec21.com", "ecplaza.net", "globalsources.com",
  "tradekey.com", "go4worldbusiness.com", "dhgate.com", "aliexpress.com", "amazon.com", "amazon.eg", "amazon.sa", "amazon.ae", "noon.com", "jumia.com.eg", "olx.com.eg",
  "dubizzle.com.eg", "opensooq.com", "ebay.com", "b2brazil.com", "eworldtrade.com"]);
const BUY_PATH = /(^|\/)(rfq|rfqs|buy-?leads?|buying-?leads?|buyoffers?|buy-?offers?|buy_leads?|buyers?|buy-?requests?|buying-?requests?|purchase-?requests?|sourcing-?requests?|buy-?requirements?)(\/|-|_|\.|$)|\/buy-/i;
/* news sites (the Information Center's news list + regional business press) */
export const NEWS = Object.freeze(["youm7.com", "masrawy.com", "almalnews.com", "alborsaanews.com", "elbalad.news", "dailynewsegypt.com", "egyptindependent.com", "enterpriseam.com",
  "enterprise.press", "arabfinance.com", "amwalalghad.com", "argaam.com", "aleqt.com", "gulfnews.com", "khaleejtimes.com", "zawya.com", "reuters.com", "ahram.org.eg",
  "almasryalyoum.com", "shorouknews.com", "bigprojectme.com", "cbnme.com", "constructionweekonline.com", "meed.com", "globalconstructionreview.com", "egypttoday.com",
  "elwatannews.com", "akhbarelyom.com", "vetogate.com", "cairo24.com", "dostor.org", "alarabiya.net", "aawsat.com", "skynewsarabia.com", "bbc.com", "cnbcarabia.com",
  "asharqbusiness.com", "economymiddleeast.com", "theafricareport.com", "bloomberg.com", "ft.com", "sis.gov.eg", "elaosboa.com", "almalnews.net", "alwafd.news"]);
const NEWS_PATH = /\/(news|article|articles|story|stories|akhbar|press-releases?|blog|details)(\/|$)/i;
/* reference pages: never a lead */
const REFERENCE = Object.freeze(["wikipedia.org", "wikimedia.org", "wiktionary.org", "britannica.com", "youtube.com", "youtu.be", "quora.com", "reddit.com", "scribd.com", "slideshare.net"]);
/* personal profiles and chat links (review S9): never returned, never stored. LinkedIn keeps its company pages */
const SOCIAL = Object.freeze(["facebook.com", "fb.com", "fb.me", "instagram.com", "x.com", "twitter.com", "tiktok.com", "threads.net", "snapchat.com", "wa.me", "whatsapp.com",
  "t.me", "telegram.me", "telegram.org", "vk.com", "pinterest.com", "linktr.ee"]);
export function personalLink(u) {
  const h = bareHost(u && u.hostname), p = String((u && u.pathname) || "").toLowerCase();
  if (onHost(h, ["linkedin.com"])) return !/^\/(company|showcase)\/[^/]+/.test(p);
  return onHost(h, SOCIAL);
}
/* an e-mail address or a phone number in a link → "path" (drop the result) | "query" (cut the query string) | "" (clean). A long product
   or article number is not a phone: only a segment that is a number written like one (a leading +, 00 or 0) counts, or a contact-named
   parameter with 7+ digits */
const URL_EMAIL = /[^\s@/?&=#]{1,64}@[^\s@/?&=#]{1,253}\.[a-z]{2,24}/i;
const PII_KEY = /^(e-?mail|mail|email_?address|phone|phone_?number|mobile|mob|tel|telephone|whatsapp|wa|msisdn|contact_?number|cell|cellphone)$/i;
const PHONE_SEG = /^(?:\+|00|0)\d{8,14}$/;
const dec = s => { try { return decodeURIComponent(s); } catch (e) { return String(s || ""); } };
const digitsOnly = s => String(s || "").replace(/[\s().\-]/g, "");
export function urlPII(u) {
  const path = dec(u.pathname || "");
  if (URL_EMAIL.test(path) || path.split(/[/;]/).some(seg => PHONE_SEG.test(digitsOnly(seg)))) return "path";
  if (URL_EMAIL.test(dec(u.search || "")) || URL_EMAIL.test(dec(u.hash || ""))) return "query";
  for (const [k, v] of u.searchParams || []) {
    const d = digitsOnly(v);
    if ((PII_KEY.test(k) && (/\d{7,}/.test(d.replace(/^\+/, "")) || /@/.test(v))) || PHONE_SEG.test(d)) return "query";
  }
  return "";
}
/* the link as one canonical string (nit 4): https, no www., no trailing slash, the query parameters sorted, no hash — the same page found
   as http / https / www is ONE lead and one result */
export function canonUrl(href) {
  let u; try { u = new URL(String(href || "")); } catch (e) { return ""; }
  const ps = [...u.searchParams.entries()].sort((a, b) => (a[0] + "=" + a[1]).localeCompare(b[0] + "=" + b[1]));
  const q = ps.length ? "?" + ps.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&") : "";
  const path = (u.pathname || "/").replace(/\/+$/, "") || "";
  return "https://" + bareHost(u.hostname) + (u.port && u.port !== "443" && u.port !== "80" ? ":" + u.port : "") + path + q;
}
export const portalOf = host => (onHost(host, PORTALS) ? "portal" : onHost(host, ENTITIES) ? "entity" : onHost(host, AGGREGATORS) ? "aggregator" : "");

/* ---------------- word rules (norm() text; " w " boundaries; an Arabic word may take و/ف/ب/ل/ك + the article) ---------------- */
const AR_PRE = "(?:و|ف|ب|ل|ك)?(?:ال|لل)?";
function wordRx(list) {
  const alts = list.map(p => {
    const w = norm(p.replace(/\*$/, "")), star = /\*$/.test(p);
    if (/^[a-z0-9 ]+$/.test(w)) return w.split(" ").join(" ") + (star ? "[a-z]*" : "");
    return w.split(" ").map((x, i, a) => AR_PRE + x + (star && i === a.length - 1 ? "\\S*" : "")).join(" ");
  });
  return new RegExp("(?:^| )(?:" + alts.join("|") + ")(?= |$)", "u");
}
const JOB = wordRx(["وظائف", "وظيفه", "وظيفه خاليه", "فرص عمل", "فرصه عمل", "توظيف", "راتب", "رواتب", "مطلوب مهندس*", "مطلوب فني*", "مطلوب عمال", "مطلوب عامل", "مطلوب موظف*",
  "مطلوب سائق*", "مطلوب محاسب*", "مطلوب مندوب*", "مطلوب مشرف*", "job", "jobs", "vacancy", "vacancies", "hiring", "careers", "career", "salary", "recruitment", "job opening*", "internship*"]);
/* an AWARD: the strong words always; the weak ones («ترسية», "awarded", "contract award") only on a page that is not an OPEN notice — open
   notices say them too: «وسيتم الترسية على أقل الأسعار» / "will be awarded to the lowest bidder", next to their closing date (review
   2026-11-20: such open tenders were spoken and stored as news). The phrases are written without the article, which wordRx makes
   optional («رست مناقصة» and «رست المناقصة» both match) */
const AWARD = wordRx(["رست مناقصه", "رست ممارسه", "رسو مناقصه", "رسو عطاء", "رسي عطاء", "تمت ترسيه", "تم ترسيه", "فاز بعقد", "فازت بعقد", "فوز بعقد", "تفوز بعقد", "يفوز بعقد",
  "award notice", "contract award notice", "awards contract", "wins contract", "won the contract", "won a contract", "wins a contract", "has been awarded", "was awarded", "were awarded",
  "secures contract", "secured a contract", "bags contract", "notice of award", "intention to award", "contract signed", "signs contract", "signed a contract"]);
const AWARD_WEAK = wordRx(["ترسيه", "ترسيات", "اسناد اعمال", "awarded", "contract award*", "award of contract"]);
const OPEN_NOTICE = wordRx(["سيتم ترسيه", "ستتم ترسيه", "يتم ترسيه", "تتم ترسيه", "تكون ترسيه", "اخر موعد لتقديم", "اخر ميعاد لتقديم", "اخر موعد للتقديم", "اخر ميعاد للتقديم",
  "اخر موعد لاستلام", "موعد فض المظاريف", "كراسه الشروط", "كراسه شروط", "تامين ابتدائي", "will be awarded", "shall be awarded", "to be awarded", "closing date", "closing time",
  "submission deadline", "deadline for submission", "bid due date", "bids due", "bid security", "bid bond", "bidding document*", "invitation to bid", "invitation for bid*", "sealed bids"]);
const isAward = text => AWARD.test(text) || (AWARD_WEAK.test(text) && !OPEN_NOTICE.test(text));
/* a buyer asking for offers (strong: never a seller's button) */
const RFQ_BUY = wordRx(["استدراج عروض", "استدراج العروض", "دعوه لتقديم عروض", "دعوه لتقديم العروض", "مطلوب توريد", "مطلوب موردين", "مطلوب مورد", "نبحث عن موردين", "نبحث عن مورد",
  "نرغب في شراء", "مطلوب شراء", "buying request*", "buying lead*", "buy offer*", "buy lead*", "buy request*", "wanted to buy", "want to buy", "looking for supplier*",
  "looking for a supplier", "seeking supplier*", "sourcing request*", "purchase request*", "purchase requisition*", "we are looking for", "request for price quotation*"]);
/* quote words that are ALSO the button of every seller's page (review B1): an RFQ only with a buyer-side marker or on a portal */
const RFQ_WEAK = wordRx(["طلب عروض اسعار", "طلب عرض اسعار", "طلب عرض سعر", "عروض اسعار", "rfq", "rfqs", "request for quotation*", "request for quote*", "quotation request*"]);
const TENDER = wordRx(["مناقصه", "مناقصات", "ممارسه عامه", "ممارسه محدوده", "ممارسه رقم", "ممارسات", "طرح ممارسه", "ممارسه لتوريد", "ممارسه توريد", "منافسه عامه", "منافسه محدوده",
  "منافسه رقم", "منافسه توريد", "منافسه لتوريد", "طرح منافسه", "منافسات", "كراسه الشروط", "كراسه شروط", "تامين ابتدائي", "فض المظاريف", "فتح المظاريف", "عطاءات", "تقديم العطاء",
  "tender*", "invitation to bid", "invitation for bid*", "itb", "ifb", "call for tender*", "call for bid*", "bid notice", "bidding document*", "procurement notice*", "expression of interest",
  "expressions of interest", "eoi", "request for proposal*", "rfp", "prequalification", "pre qualification", "appel d offres", "appels d offres", "licitacion", "licitación", "ausschreibung*", "ihale"]);
/* what only a buyer writes: a notice number, a closing date, the booklet / bid bond, «مطلوب توريد», "we are looking for" */
const BUYER_MARK = wordRx(["رقم المناقصه", "رقم الممارسه", "رقم المنافسه", "رقم العمليه", "رقم الطلب", "اخر موعد لتقديم", "اخر ميعاد لتقديم", "اخر موعد للتقديم", "اخر ميعاد للتقديم",
  "اخر موعد لاستلام", "موعد فض المظاريف", "تاريخ الغلق", "موعد الغلق", "تاريخ فض المظاريف", "كراسه الشروط", "تامين ابتدائي", "فض المظاريف", "مطلوب توريد", "نبحث عن موردين",
  "نبحث عن مورد", "نرغب في شراء", "rfq no", "rfq number", "tender no", "tender number", "bid no", "bid number", "reference no", "ref no", "closing date", "closing time",
  "submission deadline", "deadline for submission", "bid due date", "bids due", "due date", "bidding document*", "bid security", "bid bond", "we are looking for", "wanted to buy",
  "want to buy", "looking for supplier*", "looking for a supplier", "buying request*", "buy lead*", "buying lead*", "purchase request*"]);
/* sales / quote buttons and price pages (competitor test, only on a page that names the product) */
const SELL = wordRx(["اطلب عرض سعر", "اطلب عرض اسعار", "احصل على عرض سعر", "احصل علي عرض سعر", "احصل على عرض اسعار", "للاستفسار", "اطلب الان", "للبيع", "قائمه الاسعار", "قائمه اسعار",
  "كتالوج", "منتجاتنا", "خدماتنا", "نقدم لكم", "وكيل معتمد", "موزع معتمد", "الوكيل الحصري", "سعر", "اسعار", "بسعر", "باسعار", "request a quote", "get a quote", "get quote",
  "get a free quote", "send inquiry", "send enquiry", "send an inquiry", "get latest price", "contact supplier", "for sale", "price list", "price", "prices", "catalog*", "buy now",
  "add to cart", "shop now", "our products", "our services", "we manufacture", "we supply", "we offer", "we produce", "leading manufacturer*", "leading supplier*", "min order",
  "minimum order", "moq", "fob price", "ex works"]);
/* a maker / seller word next to the product: «مصنع سلندرات», «تصنيع وتوريد السلندرات», "roller manufacturer", "manufacturer of rollers"
   (an importer, a distributor or a «شركة» is not one: they BUY, or say nothing) */
const MAKER = new Set(["مصنع", "مصانع", "تصنيع", "انتاج", "منتج", "منتجي", "منتجين", "مصنعي", "مصنعين", "مورد", "موردين", "موردي", "ورشه", "ورش",
  "manufacturer", "manufacturers", "manufacturing", "maker", "makers", "producer", "producers", "production", "exporter", "exporters", "supplier", "suppliers", "factory", "factories",
  "works", "workshop"].map(w => norm(w)));
const PROJECT = wordRx(["توسعات", "توسعه", "توسعة", "حجر الاساس", "خط انتاج جديد", "خطوط انتاج جديده", "خط انتاج جديده", "انشاء مصنع", "افتتاح مصنع", "مصنع جديد", "مصانع جديده",
  "مجمع صناعي جديد", "مشروع جديد", "مشروعات جديده", "مشاريع جديده", "تنفيذ مشروع", "بتكلفه", "باستثمارات", "استثمارات بقيمه", "new plant", "new factory", "new mill",
  "new facility", "new line", "new production line", "expansion", "expansions", "greenfield", "groundbreaking", "breaks ground", "broke ground", "to build", "construction of",
  "will build", "plans to build", "investment of", "inaugurat*", "commissioning"]);
const NEWS_W = wordRx(["خبر", "اخبار", "عاجل", "breaking news"]);
const LISTY = wordRx(["قائمه", "قايمه", "دليل", "اسماء", "عناوين", "list of", "lists of", "directory", "companies in", "manufacturers in", "suppliers in", "mills in", "plants in",
  "importers in", "distributors in", "dealers in", "wholesalers in", "buyers in", // the titles the importers' query of planHunt finds
  "factories in", "companies list", "producers in"]);
const TOP_N = /(?:^| )(?:top|best|largest|biggest|افضل|اكبر|اهم) \d+(?= |$)/u;
const COMPANY_W = wordRx(["شركه", "مصنع", "مصانع", "مجموعه", "للصناعات", "للصناعه", "ش م م", "company", "co", "ltd", "limited", "inc", "group", "mill", "mills", "plant", "factory",
  "industries", "industrial", "sae", "s a e", "llc", "corp", "corporation", "holding", "gmbh", "plc", "manufacturing"]);
/* false friends of a product's words: a match inside them never counts */
const FALSE_FRIENDS = new RegExp("(?:^| )(?:roller shutters?|roller doors?|roller blinds?|roller coasters?|roller skates?|roller skating|road rollers?|paint rollers?|roller bearings?|roller chains?"
  + "|steam rollers?|high rollers?|roller derby|cylinder heads?|cylinder locks?|رولر كوستر|رولر شتر|ابواب رولر|باب رولر|رولات تواليت|رولات ورق تواليت)(?= |$)", "gu");
export const SERVICE_RX = wordRx(["صيانه", "تكسيه", "كسوه", "تجليخ", "طلاء", "اصلاح", "تصليح", "خدمه", "خدمات", "تركيب", "تاهيل", "اعاده تاهيل", "عمره", "عمرات", "تلبيس", "معالجه",
  "maintenance", "repair*", "coating", "covering", "recovering", "re covering", "grinding", "plating", "refurbish*", "overhaul*", "rehabilitation", "installation", "servicing", "service", "services"]);
const SERVICE_WORDS = new Set(["صيانه", "تكسيه", "كسوه", "تجليخ", "طلاء", "اصلاح", "تصليح", "خدمه", "خدمات", "تركيب", "تاهيل", "عمره", "عمرات", "تلبيس", "معالجه", "maintenance", "repair",
  "repairs", "coating", "covering", "recovering", "grinding", "plating", "refurbishment", "overhaul", "rehabilitation", "installation", "servicing", "service", "services"].map(w => canon(norm(w))));
const ARABIC = /[؀-ۿ]/, LATIN = /^[a-z][a-z0-9 .&'-]*$/;

/* ---------------- the product: requirements, names ---------------- */
/* the stored forms a text word may match (the query side adds the attached letters: altForms) */
const formsOf = w => { const s = new Set([canon(w)]); for (const f of storedForms(w)) s.add(f); return s; };
/* concepts() with a vocabulary that knows the groups' words: an attached «ب» / «و» / «لل» is split off when the rest is a known term
   («بالكاوتش» → كاوتش, «والدرافيل» → درافيل) — the lookup's own rule with the groups as its data (re-entry answers 0) */
let IN_VOCAB = false;
function known(k) {
  if (IN_VOCAB || !k) return 0;
  IN_VOCAB = true;
  try { const c = concepts(k); return c.concepts.length === 1 && c.concepts[0].alts.length > 1 ? 1 : 0; } catch (e) { return 0; } finally { IN_VOCAB = false; }
}
const conceptsOf = s => concepts(String(s || "").slice(0, 200), known);
const tierKeys = (c, tier) => new Set(c.alts.filter(a => a.tier === tier).map(a => a.key));
const isService = c => c.alts.length === 1 && c.alts[0].own && c.alts[0].toks.length === 1 && SERVICE_WORDS.has(c.alts[0].toks[0]);
const overlap = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
/* one requirement = the tier-1 alternatives of one thing the page must name */
function reqOf(c) { return { label: c.label, alts: c.alts.filter(a => a.tier === 1), amb: c.amb || null, latin: !ARABIC.test(c.label) }; }
/* the list items of a text → [[requirement …] …] with the synonyms of one item joined; an ambiguous word joins the word that resolves it */
function partsOf(cs) {
  const byPart = new Map();
  for (const c of cs.concepts) { if (isService(c)) continue; if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
  const parts = [];
  for (const list of byPart.values()) {
    const reqs = [];
    for (const c of list) {
      const t1 = tierKeys(c, 1), t2 = tierKeys(c, 2);
      let joined = false;
      for (const r of reqs) {
        const r1 = new Set(r.alts.map(a => a.key));
        const same = overlap(t1, r1) || (c.amb && overlap(t2, r1)) || (r.amb && r.t2 && overlap(r.t2, t1));
        if (!same) continue;
        if (r.amb && !c.amb) { r.alts = c.alts.filter(a => a.tier === 1); r.amb = null; r.t2 = null; r.label = r.label + " " + c.label; } // «سلندرات» resolved by «درافيل»
        else if (!r.amb && c.amb) { r.label = r.label + " " + c.label; }
        else { const keys = new Set(r.alts.map(a => a.key)); for (const a of c.alts) if (a.tier === 1 && !keys.has(a.key)) r.alts.push(a); r.label = r.label + " " + c.label; }
        joined = true; break;
      }
      if (!joined) { const r = reqOf(c); r.t2 = c.amb ? t2 : null; reqs.push(r); }
    }
    if (reqs.length) parts.push(reqs);
  }
  return parts;
}
/* an ambiguous requirement resolved by the English name (or the other way round): the meaning the other text names */
function resolveWith(parts, other) {
  const flat = other.flat().filter(r => !r.amb);
  for (const reqs of parts) for (const r of reqs) {
    if (!r.amb || !r.t2) continue;
    const hit = flat.find(x => overlap(r.t2, new Set(x.alts.map(a => a.key))) || overlap(new Set(r.alts.map(a => a.key)), new Set(x.alts.map(a => a.key))));
    if (hit) { r.alts = hit.alts.slice(); r.amb = null; r.t2 = null; }
  }
}
const firstRaw = (r, script) => { // the first single-word alternative in that script (Arabic / Latin), as written in the group
  for (const a of r.alts) { const raw = (a.raws || a.toks).join(" "); if (a.toks.length === 1 && (script === "ar" ? ARABIC.test(raw) : LATIN.test(raw)) && !SERVICE_WORDS.has(a.toks[0])) return raw; }
  return "";
};
const phraseRaw = (r, script, also) => { // a phrase alternative in that script that also names `also` («rubber roller» for rubber + rollers)
  for (const a of r.alts) { const raw = (a.raws || a.toks).join(" "); if (a.toks.length > 1 && (script === "ar" ? ARABIC.test(raw) : LATIN.test(raw)) && (!also || a.toks.some(t => also.has(t)))) return raw; }
  return "";
};
const clip = (s, n) => { const a = Array.from(String(s || "").replace(/\s+/g, " ").trim()); return a.length > n ? a.slice(0, n).join("").replace(/\s+\S*$/, "").trim() : a.join(""); };
/* product (+ product_en) → {parts, amb, ar, en, obj, objEn, service}: parts = the alternatives a page may satisfy (the Arabic items, then the
   English ones); amb = the first ambiguous word nothing resolved ({word, note}); ar / en = the product's names for the templates
   (review S13: an English product for an Arab market gets its Arabic name from the same groups, and the other way round); obj / objEn = the
   thing a service is done on («كسوة سلندرات» → درافيل / roller); service = the seller offers a service (review S4) */
export function productNeed(product, productEn = "", { service = false } = {}) {
  const p = String(product || "").trim(), e = String(productEn || "").trim();
  const pc = conceptsOf(p), ec = e ? conceptsOf(e) : { concepts: [] };
  const pp = partsOf(pc), ep = partsOf(ec);
  resolveWith(pp, ep); resolveWith(ep, pp);
  const svc = !!service || SERVICE_RX.test(" " + norm(p) + " ") || SERVICE_RX.test(" " + norm(e) + " ");
  const amb = pp.flat().concat(ep.flat()).find(r => r.amb) || null;
  const head = pp[0] || ep[0] || [];
  const names = script => {
    const out = [];
    const others = new Set(head.slice(1).flatMap(r => r.alts.filter(a => a.toks.length === 1).map(a => a.toks[0])));
    const ph = head.length > 1 ? phraseRaw(head[0], script, others) : "";
    if (ph) return ph;
    for (const r of head) { const x = firstRaw(r, script) || phraseRaw(r, script); if (x && !out.includes(x)) out.push(x); }
    return out.join(" ");
  };
  const ar = ARABIC.test(p) ? clip(p, 60) : ARABIC.test(e) ? clip(e, 60) : clip(names("ar"), 60);
  const en = e && !ARABIC.test(e) ? clip(e, 80) : p && !ARABIC.test(p) ? clip(p, 80) : clip(svc ? phraseSvc(head, "en") || names("en") : names("en"), 80);
  const obj = head[0] ? firstRaw(head[0], "ar") || clip(p, 40) : clip(p, 40);
  const objEn = head[0] ? firstRaw(head[0], "en") : "";
  return { parts: [...pp, ...ep], amb: amb && amb.amb ? { word: amb.label, note: amb.amb.note } : null, ar, en, obj, objEn, service: svc, empty: !pp.length && !ep.length };
}
/* a Latin phrase of the head that names a service ("roller covering") */
function phraseSvc(head, script) {
  for (const r of head) for (const a of r.alts) { const raw = (a.raws || a.toks).join(" "); if (a.toks.length > 1 && (script === "en" ? LATIN.test(raw) : ARABIC.test(raw)) && a.toks.some(t => SERVICE_WORDS.has(t))) return raw; }
  return "";
}
/* industries («ورق، كرتون، سكر», «ورق وكرتون») → one entry each (≤ 3): its requirements (tier-1 names, Arabic + English) and its names */
export function industryNeed(list) {
  const items = (Array.isArray(list) ? list : String(list || "").split(/[,،؛;]+/)).map(s => String(s == null ? "" : s).trim()).filter(Boolean);
  const out = [];
  for (const s of items) for (const reqs of partsOf(conceptsOf(s))) {
    if (out.length >= 3) break;
    const r = reqs[0], label = reqs.map(x => x.label).join(" ");
    out.push({ label: clip(label, 40), reqs, ar: ARABIC.test(label) ? clip(label, 40) : firstRaw(r, "ar") || "", en: !ARABIC.test(label) ? clip(label, 40) : firstRaw(r, "en") || "" });
  }
  return out;
}

/* ---------------- matching a page ---------------- */
/* a text → its words with their stored forms (false friends cut out first) */
export function textOf(s) {
  const t = (" " + norm(s) + " ").replace(FALSE_FRIENDS, " ");
  return lkWords(t).map(w => ({ w, f: formsOf(w) }));
}
const memo = new WeakMap(); // alternative → [Set of forms per word]
const formsAlt = a => { let f = memo.get(a); if (!f) { f = a.toks.map((t, j) => new Set(altForms(a, j))); memo.set(a, f); } return f; };
/* the positions where one alternative stands in the text (a phrase: its words in a row) */
function altAt(a, toks) {
  const F = formsAlt(a), out = [], latinPrefix = a.prefix && a.toks.length === 1 && a.toks[0].length >= 5 ? a.toks[0] : "";
  for (let i = 0; i + F.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < F.length && ok; j++) { const tf = toks[i + j].f; ok = [...tf].some(x => F[j].has(x)) || (j === 0 && latinPrefix && toks[i].w.startsWith(latinPrefix)); }
    if (ok) out.push(i);
  }
  return out;
}
const reqAt = (r, toks) => { const s = new Set(); for (const a of r.alts) for (const i of altAt(a, toks)) s.add(i); return s; };
/* does this text satisfy one of the alternatives (review S1)? → the positions of the head requirement, or null */
export function matchNeed(need, toks) {
  if (!need || !need.parts) return null;
  for (const reqs of need.parts) {
    const hits = reqs.map(r => reqAt(r, toks)), n = reqs.length;
    const head = reqs[0] && reqs[0].latin ? n - 1 : 0;
    if (!hits[head].size) continue;
    const others = hits.filter((h, i) => i !== head && h.size).length;
    if (n === 1 || (n === 2 && others >= 1) || (n >= 3 && others >= 1)) return hits[head];
  }
  return null;
}
export const matchIndustries = (inds, toks) => (inds || []).some(x => x.reqs.some(r => reqAt(r, toks).size));
/* the product right next to a maker word: in Arabic the maker word comes BEFORE it («مصنع سلندرات»; «تصنيع وتوريد السلندرات»: one «و…» word
   between), in English AFTER it ("rubber roller manufacturers") or before it with "of" ("manufacturer of rubber rollers") */
const bareW = w => norm(w).replace(/^(?:و|ف|ب|ل|ك)?(?:ال|لل)?(?=\S{3,})/, "");
const isMaker = t => !!t && (MAKER.has(t.w) || MAKER.has(bareW(t.w)));
function makerNext(pos, toks) {
  for (const i of pos) {
    const latin = /^[a-z]/.test(toks[i].w);
    if (!latin && (isMaker(toks[i - 1]) || (toks[i - 1] && /^و/.test(toks[i - 1].w) && isMaker(toks[i - 2])))) return true;
    if (latin && (isMaker(toks[i + 1]) || isMaker(toks[i + 2]) || (toks[i - 1] && toks[i - 1].w === "of" && isMaker(toks[i - 2])) || (toks[i - 2] && toks[i - 2].w === "of" && isMaker(toks[i - 3])))) return true;
  }
  return false;
}
/* ---------------- one page → its type ----------------
   r = {title, snippet, url}; o = {intent: tenders|rfq|buyers|projects|"" (a plain search), need (productNeed), inds (industryNeed),
   importers: the buyers' query searched the product's importers / distributors}
   → {type: tender|rfq|buyer|buyer_list|project|news|other, official, aggregator, competitor, product: positions matched?} */
const pathWords = u => dec(u.pathname || "").replace(/[-_/+.=&?%]+/g, " ");
export function classify(r, o = {}) {
  let u; try { u = new URL(String((r && r.url) || "")); } catch (e) { return { type: "other", official: false, aggregator: false }; }
  const host = bareHost(u.hostname), path = u.pathname.toLowerCase();
  const text = " " + norm([r.title, r.snippet, pathWords(u)].join(" ")) + " ";
  const kind = portalOf(host), out = (type, x) => ({ type, official: false, aggregator: false, competitor: false, ...(x || {}) });
  const toks = o.need || o.inds ? textOf([r.title, r.snippet, pathWords(u)].join(" ")) : null;
  const prod = toks && o.need ? matchNeed(o.need, toks) : null;
  const b2b = onHost(host, MARKETS_B2B), buyPath = b2b && BUY_PATH.test(path); // a buy-request path counts on a B2B marketplace only («/rfq-form» elsewhere is a seller's quote form)
  const tenderW = TENDER.test(text), rfqBuy = RFQ_BUY.test(text), rfqWeak = RFQ_WEAK.test(text), buyMark = BUYER_MARK.test(text) || buyPath;
  if (onHost(host, REFERENCE)) return out("other");
  if (JOB.test(text) && !tenderW && !rfqBuy) return out("other");
  if (isAward(text)) return out("news", { official: kind === "portal" || kind === "entity" });
  if (kind === "portal") return out(rfqBuy || rfqWeak ? "rfq" : "tender", { official: true });
  if (kind === "entity" && (tenderW || rfqBuy || (rfqWeak && buyMark))) return out(tenderW && !rfqBuy ? "tender" : "rfq", { official: true });
  if (b2b) return out(buyPath || /^sourcing\./.test(host) ? "rfq" : "other", { competitor: !buyPath });
  if (prod && !buyMark && (makerNext(prod, toks) || SELL.test(text) || rfqWeak)) return out("other", { competitor: true });
  if (kind === "aggregator") return out("tender", { aggregator: true });
  if (rfqBuy || (rfqWeak && buyMark)) return out("rfq");
  if (tenderW) return out("tender");
  if (PROJECT.test(text)) return out("project");
  if (onHost(host, NEWS) || NEWS_PATH.test(path) || NEWS_W.test(text)) return out("news");
  if (o.intent === "buyers" && toks) {
    const ind = o.inds && o.inds.length ? matchIndustries(o.inds, toks) : false;
    if (ind || (o.importers && prod)) {
      const dirHost = onHost(host, DIRECTORIES), title = " " + norm(r.title) + " ";
      const dirOne = dirHost && /\/(c|company|companies|profile|business-directory\/company-profiles|firm|en\/profile)\/[^/]+/.test(path) && !/[?&](q|search|keyword)=/.test(u.search);
      const list = (dirHost && !dirOne) || LISTY.test(title) || TOP_N.test(title) || /\/(search|category|categories|list|lists|directory|companies)(\/|$)/.test(path) || /(^| )(مصانع|شركات|مستوردين|مستوردي|موزعين|موزعي) \S+ (في|ف|بمصر|بمحافظه)( |$)/.test(title);
      if (list) return out("buyer_list");
      if (dirOne || COMPANY_W.test(title) || /^\/?(|en|ar|home|index\.html?|about[^/]*|about-us|who-we-are)\/?$/.test(path)) return out("buyer");
    }
  }
  return out("other");
}
/* the product named in the title (for the score: +2 title, +1 snippet) */
export function namedIn(s, need, inds) {
  const toks = textOf(s);
  return !!((need && matchNeed(need, toks)) || (inds && inds.length && matchIndustries(inds, toks)));
}
/* is a classified page about the seller's product (review S1)? tender / rfq / news: the product; buyer / buyer_list / project: an industry
   (or the product, for an importers' query); other: never */
export function relevant(r, c, o = {}) {
  let u = null; try { u = new URL(String(r.url || "")); } catch (e) { u = null; }
  const toks = textOf([r.title, r.snippet, u ? pathWords(u) : ""].join(" "));
  if (c.type === "tender" || c.type === "rfq" || c.type === "news") return !!(o.need && matchNeed(o.need, toks));
  if (c.type === "buyer" || c.type === "buyer_list" || c.type === "project") return (o.inds && o.inds.length && matchIndustries(o.inds, toks)) || (!!o.importers && !!(o.need && matchNeed(o.need, toks)));
  return false;
}
export const TYPES = Object.freeze(["tender", "rfq", "buyer", "buyer_list", "project", "news", "other"]);
