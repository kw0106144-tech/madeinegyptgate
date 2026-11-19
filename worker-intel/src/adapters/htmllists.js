/* migate-intel — adapters for the «htmllists» batch: official HTML tender lists that the declarative html mapping (one
   selector per field) cannot express. ADAPTERS[source_id] = { parse(text, src, Rewriter) → raw records, fetch?: { pages } }.
   Records have the shape engine.normalise() reads — {ext_id, title, url, published, deadline, entity, country, summary,
   value, currency, notice_type, proc_group, proc_method} — plus two fields the seeds map: `kind_hint` (tender | semi |
   rfq | project | award → mapping.kind_map) and `market_key` (a value markets.marketFor() resolves → mapping.market_from).
   `_raw` is set only where a seed's mapping.filter_re needs it (IsDB, below).
   Parsing is a linear string/regex scan (no DOM, never eval), identical in the Worker and under node --test; the
   Rewriter argument is accepted for interface compatibility and not needed. Pages verified on 2026-11-18 with the bot UA.
   Owner rules: only what the public list shows (title, buyer, dates, deadline, official link, a ≤ 200-character factual
   excerpt); e-mails, phones, national ID numbers and named contact persons are stripped from every text; a missing field
   stays empty (no list here shows a value, so value/currency are never set). A changed layout throws a short explicit
   error (→ last_err, fail_count, /api/intel/health) instead of silently returning nothing; an empty page after the first
   just ends the paging (engine.fetchSource stops at the first page that yields no record).
     isdb-tenders    IsDB project procurement «Tenders» (Drupal list, 50 per page, closing date ascending, ?status= ignored)
     gh-ghaneps      Ghana GHANEPS quick search (displaytag table #T01, newest publication first, 50 per page via T01_ps)
     ci-dgmp         Côte d'Ivoire DGMP «Avis d'appels d'offres» (one table of ~1,450 rows, unsorted, no per-notice page)
     ly-noc-tenders  Libya NOC tenders (WordPress table, 10 per page; NOC and its JV operators) */
import { stripHtml, stripContacts, decodeEntities, absUrl, asciiDigits, clip } from "../util.js";

/* ---------- text ---------- */
const LEFT_ENT = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i;
/* markup → one-line text; decodes once more when a source double-encoded ("&amp;#039;") */
export function txt(s) { let t = stripHtml(s == null ? "" : String(s)); if (LEFT_ENT.test(t)) t = decodeEntities(t); return t.replace(/\s+/g, " ").trim(); }
/* text we may publish: util.stripContacts (e-mails, labelled/international/Egyptian phones) plus the national phone
   formats of these markets (Ghana 0XX XXX XXXX, Libya 09X-XXXXXXX, Côte d'Ivoire 07 07 12 34 56), national ID numbers
   (Ghana Card GHA-…, Egyptian 14-digit, labelled IDs: CNI, NIN, الرقم الوطني …) and a named contact person introduced as
   such ("Contact: Mr. X Y", «Personne à contacter : M. X», «للتواصل: السيد …») */
const PHONE_LOCAL = /(?<![\w+/.-])(?:0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|0\d{2}[\s.-]\d{7}|0[1-9](?:[\s.]\d{2}){4})(?![\w/.-]*\d)/g;
const NATIONAL_ID = /(?:\b(?:CNI|NIN|NNI|N[°º]\s*CNI|ID\s*(?:card|no\.?|number)|national\s+id(?:entity)?(?:\s+(?:card|number|no\.?))?|carte\s+nationale\s+d.identit[ée]|pi[èe]ce\s+d.identit[ée])|(?:الرقم\s+الوطني|الرقم\s+القومي|رقم\s+الهوية|رقم\s+البطاقة))\s*[:#.\-]?\s*[A-Z]{0,3}[\s-]?\d[\d\s-]{5,18}\d|\bGHA-\d{9}-\d\b|\b[23]\d{13}\b/gi;
const PERSON = new RegExp([
  String.raw`\b(?:[Cc]ontact(?:\s+[Pp]erson)?|CONTACT(?:\s+PERSON)?|[Ff]ocal\s+[Pp](?:erson|oint)|[Aa]ttn\.?|[Aa]ttention)\s*[:\-–]?\s*(?:[Mm](?:r|rs|s|iss)|[Dd]r|[Ee]ngr?|[Pp]rof|MR|MRS|MS|DR|ENGR?)\.?\s+[A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3}`,
  String.raw`(?:[Pp]ersonne\s+[àa]\s+contacter|[Ii]nterlocuteur|[ÀàAa]\s+l.attention\s+de|[Cc]ontact)\s*[:\-–]?\s*(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Dr|Pr)\.?\s+[A-ZÀ-Ý][\wÀ-ÿ.'’-]*(?:\s+[A-ZÀ-Ý][\wÀ-ÿ.'’-]*){0,3}`,
  String.raw`(?:للتواصل|للاستفسار(?:ات)?|الاتصال\s+ب|التواصل\s+مع)\s*[:\-–]?\s*(?:مع\s+)?(?:السيد[ةه]?|المهندس[ةه]?|الدكتور[ةه]?|الأستاذ[ةه]?|الاستاذ[ةه]?)\s+[ء-ي]+(?:\s+[ء-ي]+){0,2}`,
].join("|"), "g");
const LEFT_LABEL = /(?:\b(?:e-?mail|courriel|tel(?:ephone)?|t[ée]l[ée]phone|phone|mobile|cell|fax|whatsapp)\b|هاتف|تليفون|موبايل|فاكس|واتساب|البريد الإلكتروني|بريد إلكتروني)\s*[:.]?\s*(?=$|[,;·،؛)])/gi;
/* util.stripContacts always re-spaces punctuation; this mirrors that step so a text it removed nothing from is detected */
const utilNorm = x => String(x).replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;:،؛])/g, "$1").trim();
export function clean(s) {
  const t0 = txt(s), noId = t0.replace(NATIONAL_ID, " ");
  const sc = stripContacts(noId) || "";             // contacts first: a phone keeps its label until it is removed
  const t = sc.replace(PHONE_LOCAL, " ").replace(PERSON, " ");
  if (noId === t0 && sc === utilNorm(noId) && t === sc) return t0; // nothing personal found: the official text, unchanged
  return t.replace(LEFT_LABEL, " ").replace(/[\s,;:·–—\/-]+\)/g, ")").replace(/\(\s*[,;:·–—\/-]+\s*/g, "(").replace(/\(\s*\)/g, " ")
    .replace(/\s+([,;:،؛])/g, "$1").replace(/([,;،؛])(?:\s*[,;،؛])+/g, "$1")
    .replace(/\s+/g, " ").replace(/^[\s,;:·–—-]+|[\s,;:·–—-]+$/g, "").trim();
}
const loose = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/* the ≤ 200-character factual excerpt (owner rule), built from the list's own fields */
const excerpt = parts => clip(parts.map(clean).filter(Boolean).join(" · "), 200);
function attr(tag, name) { const m = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>\"']+))", "i").exec(tag || ""); return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : ""; }
/* each <td> of one row: {a: attribute string, h: inner html} (none of these tables nests tables in cells) */
function cells(row) { const out = []; for (const m of String(row).matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)) out.push({ a: m[1], h: m[2] }); return out; }
const headers = table => [...((/<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table) || [])[1] || "").matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => loose(txt(m[1])));
const pageOf = (src, param) => { const m = new RegExp("[?&]" + param.replace(/[-]/g, "\\-") + "=(\\d+)", "i").exec((src && src.endpoint) || ""); return m ? +m[1] : null; };
const opt = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
/* a bot-challenge page served instead of the list (Cloudflare "Just a moment...", "Attention Required!") */
const CHALLENGE = /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare)|window\._cf_chl_opt/i;
function guard(html, name) { if (CHALLENGE.test(html.slice(0, 20000))) throw new Error(name + " answered a bot-challenge page instead of the list (not bypassed)"); }
/* distinct notices of one source sometimes carry the same title (DGMP «Construction et rehabilitation – COMMUNE DE MAN»
   ×6, GHANEPS re-advertised calls): append the source's own distinguishing reference so readers can tell them apart.
   Note: engine.DedupeIndex compares titles by trigrams (≥ 0.8) across all sources, the same source included, so such
   look-alike titles can still be folded there (dup_of) — an engine-side matter, reported with this batch. */
function labelTwins(recs, label) {
  const n = new Map();
  for (const r of recs) { const k = loose(r.title); n.set(k, (n.get(k) || 0) + 1); }
  for (const r of recs) if (n.get(loose(r.title)) > 1) { const l = clean(label(r)); if (l && !loose(r.title).includes(loose(l))) r.title += " (" + l + ")"; }
  return recs;
}

/* ---------- dates ---------- */
function ymd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : "";
}
const MONTHS = { jan: 1, january: 1, janvier: 1, feb: 2, february: 2, fevrier: 2, mar: 3, march: 3, mars: 3, apr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, june: 6, juin: 6, jul: 7, july: 7, juillet: 7, aug: 8, august: 8, aout: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10, nov: 11, november: 11, novembre: 11, dec: 12, december: 12, decembre: 12,
  "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "إبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
const monthNo = w => MONTHS[String(w || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.$/, "")] || MONTHS[String(w || "").trim()] || 0;
/* "24 August 2025" · "3 septembre 2026" · "1er décembre 2026" · "9 ديسمبر 2026" → "2025-08-24" ("" when absent) */
export function dMonthY(s) { const m = /(\d{1,2})(?:er|st|nd|rd|th)?\s+([^\s\d,.]+)\.?,?\s+(\d{4})/u.exec(asciiDigits(s || "")); return m && monthNo(m[2]) ? ymd(m[3], monthNo(m[2]), m[1]) : ""; }
/* "Dec 15, 2026" · "December 1, 2026" · "Sept. 3 2026" → "2026-12-15" */
export function monthDY(s) { const m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/.exec(asciiDigits(s || "")); return m && monthNo(m[1]) ? ymd(m[3], monthNo(m[1]), m[2]) : ""; }
/* "02/12/2026" · "13-12-2026" · "1.2.2027" (day first) → "2026-12-02" */
export function dmyDate(s) { const m = /(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(asciiDigits(s || "")); return m ? ymd(m[3], m[2], m[1]) : ""; }
/* "17/11/2026 15:56:54" at a fixed UTC offset in minutes (Ghana = GMT) → exact instant; day only when no time is shown */
export function dmyTimeIso(s, offsetMin = 0) {
  const m = /(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(asciiDigits(s || ""));
  if (!m || !ymd(m[3], m[2], m[1])) return "";
  if (m[4] == null) return ymd(m[3], m[2], m[1]);
  if (+m[4] > 23 || +m[5] > 59 || +(m[6] || 0) > 59) return ymd(m[3], m[2], m[1]);
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - offsetMin * 60000).toISOString();
}
const isoDay = s => { const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? ymd(m[1], m[2], m[3]) : ""; };
const dayNo = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
const showDay = d => (d ? d.slice(8, 10) + "-" + d.slice(5, 7) + "-" + d.slice(0, 4) : "");

/* country names markets.marketFor() does not know → a key it does (ISO3); anything else passes through unchanged */
const MARKET_ALIAS = { kyrgyz: "KGZ", "kyrgyz republic": "KGZ", "cote d ivoire": "CIV", "ivory coast": "CIV", uae: "ARE", "the gambia": "GMB", gambia: "GMB", turkiye: "TUR", "republic of turkiye": "TUR", "lao pdr": "LAO", "guinea bissau": "GNB", "sierra leone": "SLE", "burkina faso": "BFA" };
export function marketKey(country) { const k = String(country || "").trim(); return MARKET_ALIAS[loose(k)] || k; }

/* ---------- IsDB project procurement «Tenders» ----------
   https://www.isdb.org/project-procurement/tenders?page=0..N (robots.txt allows /project-procurement/). Each notice is a
   div.views-row > article.type-tender[data-nid][lang] with h2 > a (title, link — English under /tenders/, French under
   /fr/appels-doffres/), div.vocabulary-tender-status.slug-<active|closed> («Active/Actif», «Closed/Fermé»),
   div.vocabulary-tender-type.slug-<eoi|gpn|spn|spn-cw|pqn|contract-award|oth>, the country and the closing date as
   text «24 August 2025» (the <time datetime> attribute is broken: "00Z"). There is no publication date on the list.
   The list runs from the oldest closing date up (closed notices of the past ~15 months fill the first page and a half)
   and ignores ?status=, so every page must be read. Because the engine stops paging at the first page that yields no
   record, the seed sets mapping.filter_re = "^status:active\b": the parser then returns every row of a page with
   `_raw` = "status:<active|closed> type:<slug> country:<name>" and engine.normalise() drops the non-active ones. Without
   filter_re it returns only the active rows (safe: never a closed notice, but paging ends at the first all-closed page).
   Pages overlap a little (each page is cached on its own); the engine dedupes by item id. Kept classes: tenders (SPN,
   SPN-CW, PQN, EOI, other) with the closing date as deadline; General Procurement Notices → project and contract awards
   (type Contract Award, or «PUBLICATION DE L'ATTRIBUTION…», «RESULTATS DE L'AVIS…») → project_news, both without a
   deadline (their closing date is when IsDB stops listing them, not a bid deadline; a GPN's is quoted in the excerpt).
   Terms (isdb.org/terms-conditions): a limited extract may be reproduced or translated with IsDB cited as the source and
   translations marked as not official IsDB translations. Entity is not on the list (left empty). */
const ISDB_AWARD = /\b(?:contract\s+award|award\s+of\s+contracts?|notification\s+of\s+award|avis\s+d.attribution|publication\s+de\s+l.attribution|attribution\s+(?:des|du|de\s+la|provisoire|d[ée]finitive))\b|^\s*(?:r[ée]sultats?|results?)\s+(?:de|des|du|d['’]|of)\b|\b(?:r[ée]sultats?\s+(?:de\s+l.avis|de\s+l.appel|des\s+appels|de\s+la\s+pr[ée]qualification|d.[ée]valuation)|results?\s+of\s+(?:the\s+)?(?:pre-?qualification|evaluation|tender|bid))/i;
const ISDB_GPN = /\b(?:general\s+procurement\s+notice|avis\s+g[ée]n[ée]ral\s+de\s+passation|AGPM)\b|-\s*GPN\s*$/i;
const ISDB_TYPE = { eoi: "Expression of Interest", gpn: "General Procurement Notice", spn: "Specific Procurement Notice", "spn-cw": "Specific Procurement Notice (Civil Works)", pqn: "Pre-Qualification", "contract-award": "Contract Award" };
async function parseIsdb(html, src = {}) {
  html = String(html || "");
  guard(html, "IsDB");
  const mp = src.mapping || {}, base = mp.base || "https://www.isdb.org/";
  const at = html.search(/\bdata-index-view\s*=\s*["']tenders_listing["']/i);
  if (at < 0) throw new Error("IsDB layout changed: div[data-index-view=tenders_listing] not found");
  const chunks = html.slice(at).split(/<div\b[^>]*\bclass\s*=\s*["']views-row["'][^>]*>/i).slice(1);
  if (!chunks.length) {
    if (/^[^>]*\bno-results\b/i.test(html.slice(at, at + 300)) || /No results for your specified filters/i.test(html.slice(at, at + 2000))) return [];
    throw new Error("IsDB layout changed: no div.views-row in the tenders listing");
  }
  const keepClosed = !!mp.filter_re, out = [];
  let rows = 0;
  for (let ch of chunks) {
    const e = ch.indexOf("</article>"); if (e >= 0) ch = ch.slice(0, e);
    const art = /<article\b[^>]*>/i.exec(ch);
    if (!art || !/\btype-tender\b/.test(attr(art[0], "class"))) continue;
    const a = /<h2\b[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(ch);
    const href = a ? attr(a[0].slice(a[0].search(/<a\b/i)), "href") : "";
    if (!a || !href) continue;
    rows++;
    const stTag = /<div\b[^>]*\bvocabulary-tender-status\b[^>]*>([\s\S]*?)<\/div>/i.exec(ch);
    const tyTag = /<div\b[^>]*\bvocabulary-tender-type\b[^>]*>([\s\S]*?)<\/div>/i.exec(ch);
    const stSlug = stTag ? ((/\bslug-([\w-]+)/.exec(attr(stTag[0], "class")) || [])[1] || "") : "";
    const active = stSlug ? stSlug === "active" : /^(?:active|actif|نشط|ساري)/i.test(txt(stTag && stTag[1]));
    if (!active && !keepClosed) continue;
    const tySlug = tyTag ? ((/\bslug-([\w-]+)/.exec(attr(tyTag[0], "class")) || [])[1] || "").toLowerCase() : "";
    const tyLabel = tyTag ? txt(tyTag[1]) : "";
    const country = txt((/\bfield--name-field-world-country\b[^>]*>([\s\S]*?)<\/div>/i.exec(ch) || [])[1]);
    const tm = /\bfield--name-field-close-date\b[\s\S]*?(<time\b[^>]*>)([\s\S]*?)<\/time>/i.exec(ch);
    const closeText = tm ? txt(tm[2]) : "", close = tm ? isoDay(attr(tm[1], "datetime")) || dMonthY(closeText) : "";
    const title = clean(a[1]);
    if (!title) continue;
    const cls = tySlug === "contract-award" || ISDB_AWARD.test(title) ? "award" : tySlug === "gpn" || ISDB_GPN.test(title) ? "project" : "tender";
    const typeShown = ISDB_TYPE[tySlug] || (/^(?:other|autre)s?$/i.test(tyLabel) ? "" : tyLabel);
    const rec = {
      ext_id: attr(art[0], "data-nid") || href, title, url: absUrl(href, base),
      published: "", deadline: cls === "tender" ? close : "",
      entity: "", country, market_key: marketKey(country),
      summary: excerpt([typeShown, country, cls === "project" && closeText ? "Closing date " + closeText : ""]),
      notice_type: typeShown, proc_group: tySlug === "eoi" ? "CS" : tySlug === "spn-cw" ? "CW" : "", proc_method: "", kind_hint: cls,
      lang: attr(art[0], "lang") || "",
    };
    if (keepClosed) rec._raw = `status:${active ? "active" : "closed"} type:${tySlug || "-"} country:${loose(country) || "-"}`;
    out.push(rec);
  }
  if (!rows) throw new Error("IsDB layout changed: no article.type-tender with an h2 link");
  return labelTwins(out, r => "IsDB notice " + r.ext_id);
}

/* ---------- Ghana GHANEPS quick search (current calls for tender) ----------
   https://www.ghaneps.gov.gh/epps/quickSearchAction.do?d-3680175-p=N&searchSelect=1&T01_ps=50 — every call for tender
   (4,192 on 2026-11-18), newest publication first; T01_ps is the page size the site's own «Results per page» control sets
   (10/20/50/100), so two pages of 50 cover about three weeks. robots.txt redirects to the home page (no rules). Table
   #T01 columns (mapped by header text): # · Tender Title (link cft/prepareViewCfTWS.do?resourceId=N, a public notice
   page) · Procuring Entity · Info (img title = the notice description) · Bids Submission Deadline «02/12/2026 11:00:00»
   · Procedure · Status · Notice PDF · Publication Date «17/11/2026 15:56:54» (Ghana time = GMT). Kept: rows still in the
   bid-submission phase (status «Bid Submission»); «Awaiting Bid Opening», «Evaluation», awards and cancellations are
   past it. A title shorter than 25 characters («Bridges», «Station Wagon») is completed with the notice description.
   Procedures with quotations → rfq; companies/corporations (state enterprises) → semi-government. */
const GH_OPEN = /\b(?:bids?|tenders?|offers?|proposals?)\s+submission\b|^submission\b|\bclarification\b/i;
const GH_PAST = /\b(?:opening|evaluat|award|cancel|clos|suspend|complet|deserted|terminat)/i;
const GH_SOE = /\b(?:company|corporation|ltd|limited|plc|bank|enterprises?)\b/i;
const GH_RFQ = /\bquotations?\b|\bRFQ\b|\bshopping\b/i;
const GH_CS = /\bconsult|\bquality[\s-]*(?:and[\s-]*)?cost|\bQCBS\b|\bQBS\b|\bEOI\b|expressions?\s+of\s+interest|least[\s-]cost\s+selection|fixed[\s-]budget\s+selection|individual\s+consultant/i;
async function parseGhaneps(html, src = {}) {
  html = String(html || "");
  guard(html, "GHANEPS");
  const base = src.endpoint || "https://www.ghaneps.gov.gh/epps/quickSearchAction.do?searchSelect=1", page = pageOf(src, "d-3680175-p") || 1;
  const t0 = html.search(/<table\b[^>]*\bid\s*=\s*["']T01["']/i);
  const empty = /Nothing found to display|\b0 results in total|No results? (?:were )?found/i.test(html);
  if (t0 < 0) { if (empty || page > 1) return []; throw new Error("GHANEPS layout changed: results table#T01 not found"); }
  let tEnd = html.indexOf("</table>", t0); if (tEnd < 0) tEnd = html.length;
  const table = html.slice(t0, tEnd), H = headers(table), col = re => H.findIndex(h => re.test(h));
  const C = { title: col(/\btitle\b/), entity: col(/\bentity\b/), info: col(/^info\b/), deadline: col(/\bdeadline\b/), procedure: col(/\bprocedure\b/), status: col(/\bstatus\b/), published: col(/\bpublication\b/) };
  if (C.title < 0 || C.deadline < 0 || C.status < 0) throw new Error("GHANEPS layout changed: header columns Tender Title / Bids Submission Deadline / Status not found (got: " + H.join(", ").slice(0, 120) + ")");
  const body = (/<tbody\b[^>]*>([\s\S]*)$/i.exec(table) || [])[1] || "";
  const out = [];
  let rows = 0;
  for (const m of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = cells(m[1]);
    if (c.length <= Math.max(C.title, C.deadline, C.status)) continue;
    const a = /<a\b[^>]*\bhref\s*=\s*["']([^"']*prepareViewCfTWS\.do\?resourceId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(c[C.title].h);
    if (!a) continue;
    rows++;
    const status = txt(c[C.status].h);
    if (!GH_OPEN.test(status) || GH_PAST.test(status)) continue;
    const img = C.info >= 0 ? /<img\b[^>]*>/i.exec(c[C.info].h) : null;
    const desc = img ? clean(attr(img[0], "title")) : "";
    let title = clean(a[3]);
    const descAdds = desc && !loose(title).includes(loose(desc)) && loose(desc) !== loose(title);
    if (descAdds && title.length < 25) title = (title ? title + " – " : "") + clip(desc, 140);
    if (!title) continue;
    const entity = C.entity >= 0 ? clean(c[C.entity].h) : "", procedure = C.procedure >= 0 ? txt(c[C.procedure].h) : "";
    const pubText = C.published >= 0 ? txt(c[C.published].h) : "";
    out.push({
      ext_id: a[2], title, url: absUrl(decodeEntities(a[1]), base),
      published: dmyTimeIso(pubText, 0), deadline: dmyDate(txt(c[C.deadline].h)),
      entity, country: "Ghana", market_key: "Ghana",
      summary: excerpt([descAdds && !title.includes(clip(desc, 140)) ? desc : "", procedure]),
      notice_type: procedure, proc_group: GH_CS.test(procedure) ? "CS" : "", proc_method: procedure,
      kind_hint: GH_RFQ.test(procedure) ? "rfq" : GH_SOE.test(entity) ? "semi" : "tender", pub_shown: pubText,
    });
  }
  if (!rows && !empty && page === 1) throw new Error("GHANEPS layout changed: no rows with a prepareViewCfTWS.do link in table#T01");
  labelTwins(out, r => (r.pub_shown ? "published " + r.pub_shown.replace(/:\d{2}$/, "").replace(/\//g, "-") : "notice " + r.ext_id));
  labelTwins(out, r => "notice " + r.ext_id); // same title and same minute
  for (const r of out) delete r.pub_shown;
  return out;
}

/* ---------- Côte d'Ivoire DGMP «Avis d'appels d'offres» ----------
   https://www.marchespublics.ci/appel_offre (robots.txt: 404, no rules) — one table#example with every notice since 2022
   (~1,456 rows, 1.3 MB): Numéro AO (e.g. AOO26110434150 — the external id) · Type de marché · Objet (since 2026 a
   category: «Construction et rehabilitation», «Route», «Fourniture de véhicule»…) · Autorité Contractante · Date de
   publication · Date limite (dd-mm-yyyy; data-order holds ISO). Rows are not sorted and there is no per-notice page,
   so every item links to the official list; the inert «ao» query parameter (the server ignores it and returns the same
   list, verified) keeps each item's link distinct so canonical-URL dedupe does not merge different notices, and the
   reference is quoted in the excerpt so a reader can find the row with the list's own search box. Kept: notices whose
   closing date is on or after the newest publication date on the page (the engine then drops those already past today),
   newest publication first, so the engine's per-source cap keeps the newest. Titles are built from the list's own
   fields: «Travaux : Construction et rehabilitation – COMMUNE DE GUIGLO». Sociétés d'État → semi-government. */
const CI_SOE = /\bsoci[ée]t[ée]\b|\bport\s+autonome\b|\b(?:SOTRA|SODECI|CIE|PETROCI|SIR|SODEMI|SODEFOR|SODEXAM|SICOGI|SONAPIE|SOGEPIE)\b/i;
const CI_TYPE = { travaux: "Travaux", fourniture: "Fournitures", fournitures: "Fournitures", prestation: "Prestations", prestations: "Prestations", "prestation de services courants": "Prestation de services courants", "prestation intellectuelle": "Prestation intellectuelle", "prestations intellectuelles": "Prestation intellectuelle" };
const ciGroup = t => (/^travaux/.test(t) ? "CW" : /^fourniture/.test(t) ? "GO" : /intellectuel/.test(t) ? "CS" : /^prestation/.test(t) ? "NC" : "");
async function parseDgmp(html, src = {}) {
  html = String(html || "");
  guard(html, "DGMP");
  const mp = src.mapping || {};
  let list = "https://www.marchespublics.ci/appel_offre";
  try { const u = new URL(src.endpoint || list); u.search = ""; u.hash = ""; list = u.toString(); } catch (e) {}
  const t0 = html.search(/<table\b[^>]*\bid\s*=\s*["']example["']/i);
  if (t0 < 0) throw new Error("DGMP layout changed: table#example not found");
  let tEnd = html.indexOf("</table>", t0); if (tEnd < 0) tEnd = html.length; // the engine may cut bodies over 6 MB
  const table = html.slice(t0, tEnd), H = headers(table), col = re => H.findIndex(h => re.test(h));
  const C = { ref: col(/\bnumero\b|\bn\s*o\b|\bref/), type: col(/\btype\b/), objet: col(/\bobjet\b/), entity: col(/\bautorite\b|\bcontractante\b/), published: col(/\bpublication\b/), deadline: col(/\blimite\b|\bcloture\b/) };
  if (C.ref < 0 || C.objet < 0 || C.deadline < 0) throw new Error("DGMP layout changed: header columns Numéro AO / Objet / Date limite not found (got: " + H.join(", ").slice(0, 120) + ")");
  const need = Math.max(...Object.values(C));
  const rows = [];
  let newest = "", seen = 0;
  for (const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = cells(m[1]);
    if (c.length <= need) continue;
    const ref = clean(c[C.ref].h);
    if (!ref) continue;
    seen++;
    const day = cell => cell ? isoDay(attr("<td " + cell.a + ">", "data-order")) || dmyDate(txt(cell.h)) : "";
    const pub = day(c[C.published]), dl = day(c[C.deadline]);
    if (pub > newest) newest = pub;
    rows.push({ ref, c, pub, dl });
  }
  if (!seen) throw new Error("DGMP layout changed: no data rows in table#example");
  const ref0 = newest, undated = opt(mp.undated_days, 30), out = [], ids = new Set();
  for (const r of rows) {
    const keep = r.dl ? r.dl >= ref0 : r.pub && dayNo(ref0) - dayNo(r.pub) <= undated;
    if (!keep || ids.has(r.ref)) continue;
    ids.add(r.ref);
    const typeRaw = C.type >= 0 ? txt(r.c[C.type].h) : "", tk = loose(typeRaw), type = CI_TYPE[tk] || typeRaw;
    const objet = clean(r.c[C.objet].h), entity = C.entity >= 0 ? clean(r.c[C.entity].h) : "";
    const lo = loose(objet), lt = loose(type);
    const lead = !objet ? type : !type || lo === lt || lo.startsWith(lt.slice(0, 6)) || lt.startsWith(lo) ? objet : type + " : " + objet;
    const title = lead ? lead + (entity && !lo.includes(loose(entity)) ? " – " + entity : "") : entity;
    if (!title) continue;
    out.push({
      ext_id: r.ref, title, url: list + "?ao=" + encodeURIComponent(r.ref),
      published: r.pub, deadline: r.dl, entity, country: "Côte d'Ivoire", market_key: "",
      summary: excerpt(["Réf. " + r.ref, type, r.dl ? "date limite " + showDay(r.dl) : ""]),
      notice_type: type, proc_group: ciGroup(tk) || (/^AMI/i.test(r.ref) ? "CS" : ""), proc_method: (/^([A-Z]{2,4})\d/.exec(r.ref) || [])[1] || "",
      kind_hint: CI_SOE.test(entity) ? "semi" : "tender",
    });
  }
  out.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : a.ext_id < b.ext_id ? -1 : 1));
  return labelTwins(out, r => "réf. " + r.ext_id);
}

/* ---------- Libya NOC tenders ----------
   https://noc.ly/en/tenders/ — tenders of the National Oil Corporation and its operators (Mellitah Oil & Gas, Akakus,
   Arabian Gulf Oil Co., Eni North Africa …), 10 per page, newest post first. The page holds the same rows twice (desktop
   table and a mobile copy whose cells start with «Title:» / «Expiry date:»): rows are read once per link. Row
   tr.el-item: td.fs-table-title «Operator …. subject», td.fs-table-text_1 expiry date «Dec 15, 2026» (→ deadline), and
   a.el-link to the notice page. The operator before the ellipsis is the entity; the title keeps operator and subject
   («Mellitah Oil & Gas B.V. Libyan Branch – Invitation for Pre-Qualification – PRQ/JPT/40/26»). No publication date on
   the list. Expired rows stay on the page and are closed by the engine; cancellations are skipped and results/awards →
   project_news. Only page 1 is readable: /en/tenders/page/N/ and the notice pages answer a Cloudflare challenge (403)
   to the bot, which is not bypassed; the WordPress feed answers 403 too. robots.txt allows / (Content-Signal: search=yes,
   ai-train=no, use=reference), but the Terms of Use (noc.ly/en/terms-of-use/) forbid reproducing or republishing any
   part of the site without NOC's prior written consent: the seed stays disabled until NOC consents. */
const NOC_ELLIPSIS = /\s*(?:…|\.{3,})[.…]*\s*/;
const NOC_AWARD = /^\s*(?:(?:announcement|notice|publication)\s+of\s+)?(?:(?:the\s+)?award|results?|winners?|short-?list(?:ed)?)\b|\b(?:awarded\s+to|award\s+of\s+(?:the\s+)?(?:contract|tender)|results?\s+of\s+(?:the\s+)?(?:tender|pre-?qualification|bid|evaluation))\b/i;
const NOC_CANCEL = /\bcancel(?:l?ation|l?ed)?\b/i;
const safeDecode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
async function parseNoc(html, src = {}) {
  html = String(html || "");
  guard(html, "NOC");
  const base = src.endpoint || "https://noc.ly/en/tenders/";
  const out = [], seen = new Set();
  let rows = 0;
  for (const m of html.matchAll(/<tr\b[^>]*\bclass\s*=\s*["'][^"']*\bel-item\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    rows++;
    const r = m[1].replace(/<span\b[^>]*\buk-hidden@m\b[^>]*>[\s\S]*?<\/span>/gi, " ");
    let href = "";
    for (const t of r.matchAll(/<a\b[^>]*>/gi)) { const h = attr(t[0], "href"); if (h && (/\bel-link\b/.test(attr(t[0], "class")) || /\/tenders\/[^/?#]+/.test(h))) { href = h; break; } }
    const url = absUrl(href, base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const c = cells(r);
    const tCell = c.find(x => /\bfs-table-title\b/.test(attr("<td " + x.a + ">", "class"))) || c[1];
    const dCell = c.find(x => /\bfs-table-text_1\b/.test(attr("<td " + x.a + ">", "class"))) || c[2];
    const full = clean(tCell && tCell.h).replace(/^title\s*:\s*/i, "");
    if (!full || NOC_CANCEL.test(full)) continue;
    const parts = full.split(NOC_ELLIPSIS);
    const head = parts.length > 1 ? parts[0].trim() : "", subject = (parts.length > 1 ? parts.slice(1).join(" ") : full).replace(/^subject\s*:\s*/i, "").trim();
    const entity = head && head.length <= 90 ? head : "";
    const title = entity ? entity + " – " + (subject || full) : full.replace(NOC_ELLIPSIS, " – ");
    const slug = (/\/tenders\/([^/?#]+)\/?(?:[?#].*)?$/.exec(url) || [])[1] || url;
    out.push({
      ext_id: safeDecode(slug), title, url,
      published: "", deadline: monthDY(txt(dCell && dCell.h).replace(/^expiry\s+date\s*:\s*/i, "")),
      entity, country: "Libya", market_key: "", summary: "",
      notice_type: "", proc_group: "", proc_method: "", kind_hint: NOC_AWARD.test(subject) ? "award" : "tender",
    });
  }
  if (!rows) throw new Error("NOC layout changed: no tr.el-item rows in the tenders table");
  return labelTwins(out, r => r.ext_id);
}

export const ADAPTERS = {
  "isdb-tenders": { parse: parseIsdb, fetch: { pages: 5 } },
  "gh-ghaneps": { parse: parseGhaneps, fetch: { pages: 2 } },
  "ci-dgmp": { parse: parseDgmp },
  "ly-noc-tenders": { parse: parseNoc },
};
