/* migate-intel — JSON API adapters (batch "json"). ADAPTERS[source_id] = { parse(text, src, Rewriter) → raw records that
   engine.normalise() accepts, fetch: { pages, method?, body?, headers, … } }. The engine still does robots.txt, politeness,
   conditional GET, the {{page}} / {{date±N}} templating of the seed endpoint, dedupe and storage.
   Sources: World Bank Projects API v3 (Egypt; Africa + MENA pipeline), World Bank Finances One DS00005 (contract awards),
   one shared OCDS release mapper (South Africa eTenders, UK Find a Tender, UK Contracts Finder), Kenya PPIP, Uganda GPP,
   HCWW (WordPress REST: title + date + link only), France BOAMP (adapter kept, source disabled: robots.txt).
   Owner rules applied here: a record carries only title, entity/buyer, dates, deadline, value, official link and a
   ≤ 200-char excerpt. Contact points, officials (Kenya created_by / team_members / subscribers, Uganda initiated_by) and
   natural-person suppliers are never read into a record; sentences with e-mails / phones are dropped from excerpts.
   A missing field stays "" — nothing is guessed. Pure functions: no fetch, no eval, no DOM. */
import { stripHtml, stripContacts, clip } from "../util.js";

/* ---------- small helpers ---------- */
const J = t => (typeof t === "string" ? JSON.parse(t) : t || {});
const str = v => (v == null ? "" : typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const txt = v => stripHtml(str(v));
/* the calendar day exactly as the source wrote it (a deadline must not move a day through a time-zone shift) */
const dayOf = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v)); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };
/* amounts: 0 and 1 are placeholders in these systems ("value 1 GBP"), not values */
const money = v => { const n = typeof v === "number" ? v : parseFloat(str(v).replace(/,/g, "")); return Number.isFinite(n) && n > 1 ? n : ""; };
/* a publication date later than tomorrow is impossible for something already listed → unknown (""), never "corrected" */
export function pastOrEmpty(v, nowMs = Date.now()) {
  const s = str(v);
  if (!s) return "";
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00Z" : s);
  return !isNaN(t) && t > nowMs + 36 * 3600e3 ? "" : s;
}
const GROUP = { goods: "GO", supplies: "GO", fournitures: "GO", works: "CW", travaux: "CW", "consultant services": "CS", "consultancy services": "CS", consulting: "CS",
  "non-consulting services": "NC", "non consultancy services": "NC", "non-consultancy services": "NC" };
const groupOf = c => GROUP[str(c).toLowerCase()] || "";
const JSON_HEADERS = { Accept: "application/json" };
const clock = src => (src && Number.isFinite(+src.now) && +src.now > 0 ? +src.now : Date.now());

/* personal contacts: a sentence that carries an e-mail or a phone usually carries a person's name too → drop the sentence */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b|\b(?:tel|phone|telephone|mobile|fax|whatsapp)\b\s*[:.]?\s*\+?\d/i;
/* sentence ends (not after "Mr." "Eng." "Tel." …), line breaks, ";" and wide gaps */
const SENTENCE_SPLIT = /\r?\n+|(?<=[.!?;])(?<!\b(?:Mr|Mrs|Ms|Dr|Eng|Prof|No|St|Co|Ltd|Inc|Tel|Fax|Ref|Attn|Ext|Mob)\.)\s+|\s{3,}/;
export function dropContactSentences(raw) {
  return String(raw == null ? "" : raw).split(SENTENCE_SPLIT).map(p => stripHtml(p)).filter(p => p && !EMAIL_RE.test(p) && !PHONE_RE.test(p)).join(" ");
}
const excerpt = raw => clip(stripContacts(dropContactSentences(raw)), 200);
const cleanTitle = raw => clip(stripContacts(stripHtml(str(raw))).replace(/\s+/g, " ").replace(/[\s,;:–—-]+$/, ""), 400);
/* "a · b · c — long text" clipped to 200 after contact stripping */
function summary(parts, tail = "") {
  const head = parts.map(p => str(p)).filter(Boolean).join(" · ");
  const t = tail ? excerpt(tail) : "";
  return clip(stripContacts([head, t].filter(Boolean).join(" — ")), 200);
}
/* "Ministry A,Ministry B, Agency C" → "Ministry A, Ministry B, Agency C" */
const cleanList = v => txt(Array.isArray(v) ? v.join(",") : v).split(/\s*,\s*/).filter(Boolean).join(", ");

/* one raw record in the shape normalise() reads (every key present; missing → "") */
function rec(o) {
  const value = o.value === "" || o.value == null ? "" : o.value;
  return {
    ext_id: str(o.ext_id), title: o.title || "", url: o.url || "", published: o.published || "", deadline: o.deadline || "",
    entity: o.entity || "", country: o.country || "", summary: o.summary || "", value, currency: value === "" ? "" : str(o.currency),
    cpv: Array.isArray(o.cpv) ? o.cpv : [], notice_type: o.notice_type || "", proc_group: o.proc_group || "", proc_method: o.proc_method || "",
    buyer_type: o.buyer_type || "", market_hint: o.market_hint || "", tag: o.tag || "",
  };
}
const withNext = (arr, next) => { Object.defineProperty(arr, "next", { value: next || null, enumerable: false }); return arr; };

/* ---------- World Bank Projects API v3 ---------- */
const WB_PROJECT = id => "https://projects.worldbank.org/en/projects-operations/project-detail/" + encodeURIComponent(id);
const WB_AFRICA_REGION = /^(?:western and central africa|eastern and southern africa|west africa|east africa|southern africa|central africa|africa)\b/i;
/* body.projects is an OBJECT keyed by project id. Pipeline projects carry a PLANNED board date → no publication date;
   active projects carry their approval date. Dropped / closed projects are skipped. mapping.exclude_countries: ISO2 list */
export function parseWbProjects(text, src = {}) {
  const d = J(text), mp = src.mapping || {}, now = clock(src);
  const exclude = new Set((mp.exclude_countries || []).map(c => String(c).toUpperCase()));
  const list = Array.isArray(d.projects) ? d.projects : Object.values(d.projects || {});
  const out = [];
  for (const p of list) {
    if (!p || !p.id || !p.project_name) continue;
    const codes = (Array.isArray(p.countrycode) ? p.countrycode : [p.countrycode]).map(c => str(c).toUpperCase()).filter(Boolean);
    if (codes.some(c => exclude.has(c))) continue;
    const status = str(p.status);
    if (!/^(?:pipeline|active)$/i.test(status)) continue;
    const pipeline = /^pipeline$/i.test(status), board = dayOf(p.boardapprovaldate), country = txt(p.countryshortname);
    const amt = money(p.totalamt);
    out.push(rec({
      ext_id: p.id, title: cleanTitle(p.project_name), url: WB_PROJECT(p.id),
      published: pipeline ? "" : pastOrEmpty(board, now),
      entity: cleanList(p.impagency) || cleanList(p.borrower), country,
      market_hint: WB_AFRICA_REGION.test(country) ? "Africa" : country,
      value: amt, currency: "USD", notice_type: status,
      summary: summary([`World Bank ${status.toLowerCase()} project`, country, board ? (pipeline ? "planned board approval " : "approved ") + board : ""], p.project_abstract),
    }));
  }
  return out;
}

/* ---------- World Bank Finances One DS00005: contract awards in investment project financing ---------- */
const FONE_RECORD = n => "https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json&filter=" + encodeURIComponent(`wb_contract_number='${n}'`);
/* a supplier is shown only when it is clearly a legal person; individual consultants and bare personal names never are */
const LEGAL_SUFFIX = /(?:^|[\s,(])(?:s\.?\s?a\.?(?:\s?e\.?)?|sae|s\.?a\.?r\.?l\.?|sarl|sas|s\.?p\.?a\.?|s\.?r\.?l\.?|ag|kg|gmbh|mbh|b\.?v\.?|n\.?v\.?|a\/s|plc|llc|llp|ltd\.?|limited|inc\.?|corp\.?|co\.?|pty|pvt|jsc|ojsc|cjsc|ooo|kft|sp\.?\s?z\.?\s?o\.?\s?o\.?)(?=$|[\s,.)])/i;
const ORG_WORD = /\b(?:company|companies|corporation|group|holdings?|international|consult\w*|engineer\w*|contractors?|contracting|construction|solutions?|systems?|technolog\w*|trading|traders|services|industr\w*|enterprises?|associates|partners(?:hip)?|firm|agency|authority|institute|university|foundation|bank|scientific|medical|pharma\w*|electric\w*|motors?|software|networks?|laborator\w*|labs?|joint venture|consortium|office|bureau|cent(?:er|re)|establishment|factory|supplies|imports?|exports?|federation|association|council|ministry|commission|organi[sz]ation|trust|fund|for)\b/i;
export function legalEntityName(name) {
  const s = txt(name).replace(/\s+/g, " ").replace(/[\s,;]+$/, "");
  if (!s || /^(?:individual consultants?|null|n\/a)$/i.test(s)) return "";
  return LEGAL_SUFFIX.test(s) || ORG_WORD.test(s) ? s : "";
}
const INDIVIDUAL_HIRE = /^\s*(?:hiring|recruit(?:ment|ing)?|appointment of an? (?:individual|national|international)?\s*(?:consultant|expert|specialist|advis[eo]r|officer|assistant|director|coordinator|manager))\b/i;
function awardSupplier(r) {
  if (/individual/i.test(str(r.procurement_method)) || INDIVIDUAL_HIRE.test(str(r.contract_description))) return "";
  const n = legalEntityName(r.supplier);
  if (!n) return "";
  const c = txt(r.supplier_country);
  return c && !/^null$/i.test(c) ? `${n} (${c})` : n;
}
export function parseWbContractAwards(text, src = {}) {
  const d = J(text), now = clock(src), rows = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
  const by = new Map();                       // a joint venture is one contract listed once per member → one item
  for (const r of rows) {
    const n = str(r && r.wb_contract_number);
    if (!n) continue;
    if (!by.has(n)) by.set(n, { r, sup: [] });
    const s = awardSupplier(r), g = by.get(n);
    if (s && !g.sup.includes(s)) g.sup.push(s);
  }
  const out = [];
  for (const [n, { r, sup }] of by) {
    const desc = cleanTitle(r.contract_description), proj = txt(r.project_name);
    if (!desc) continue;
    const amt = money(r.supplier_contract_amount_usd), country = txt(r.borrower_country);
    out.push(rec({
      ext_id: "DS00005:" + n, title: cleanTitle("Contract award: " + desc + (proj ? " — " + proj : "")), url: FONE_RECORD(n),
      published: pastOrEmpty(str(r.contract_signing_date), now), country, market_hint: country,
      value: amt, currency: "USD", notice_type: "Contract Award", tag: "award",
      proc_group: groupOf(r.procurement_category), proc_method: str(r.procurement_method),
      summary: summary(["Contract award", r.procurement_category, r.procurement_method, r.contract_signing_date && "signed " + str(r.contract_signing_date),
        sup.length ? "supplier: " + sup.join(" + ") : "", r.project_id && "project " + str(r.project_id)]),
    }));
  }
  return out;
}

/* ---------- OCDS 1.1 release packages (shared: South Africa, UK FTS, UK Contracts Finder) ---------- */
const SKIP_STATUS = /^(?:cancelled|unsuccessful|withdrawn|complete|terminated)$/i;
export function ocdsCpv(t = {}) {
  const out = new Set();
  const add = c => { if (c && /cpv/i.test(str(c.scheme)) && /^\d{8}/.test(str(c.id))) out.add(str(c.id).slice(0, 8)); };
  add(t.classification); (t.additionalClassifications || []).forEach(add);
  for (const it of t.items || []) { add(it.classification); (it.additionalClassifications || []).forEach(add); }
  return [...out].slice(0, 10);
}
/* o: { tags?: [...] keep releases with one of these tags, url(r) → official link, title?(r), summary?(r), skip?(r), buyerType?(r), country }.
   One record per ocid (the latest release wins: a tender and its amendments are the same opportunity).
   Never read: parties[].contactPoint / additionalContactPoints, suppliers, tenderers. */
export function mapOcdsReleases(pkg, o = {}, src = {}) {
  const d = J(pkg), now = clock(src), rels = Array.isArray(d.releases) ? d.releases : [];
  const best = new Map();
  for (const r of rels) {
    if (!r || !r.tender) continue;
    const tags = Array.isArray(r.tag) ? r.tag : [r.tag];
    if (o.tags && !tags.some(t => o.tags.includes(t))) continue;
    const key = str(r.ocid) || str(r.id);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || str(r.date) > str(prev.date)) best.set(key, r);
  }
  const out = [];
  for (const [key, r] of best) {
    const t = r.tender || {};
    if (SKIP_STATUS.test(str(t.status)) || (o.skip && o.skip(r))) continue;
    const url = str(o.url ? o.url(r) : "");
    const title = cleanTitle(o.title ? o.title(r) : str(t.title) || str(t.description));
    if (!url || !title) continue;
    const val = t.value || {}, amt = money(val.amount);
    out.push(rec({
      ext_id: key, title, url,
      published: pastOrEmpty(str(t.datePublished) || str(r.date), now),
      deadline: dayOf((t.tenderPeriod || {}).endDate),
      entity: txt((r.buyer || {}).name || (t.procuringEntity || {}).name), country: o.country || "",
      value: amt, currency: str(val.currency), cpv: ocdsCpv(t),
      summary: o.summary ? o.summary(r) : excerpt(t.description),
      proc_method: str(t.procurementMethodDetails), proc_group: groupOf(t.mainProcurementCategory),
      buyer_type: o.buyerType ? o.buyerType(r) : "", notice_type: (Array.isArray(r.tag) ? r.tag : [r.tag]).filter(Boolean).join(","),
    }));
  }
  return withNext(out, d.links && d.links.next);
}
const docUrl = (r, re) => { const x = ((r.tender || {}).documents || []).find(doc => re.test(str(doc && doc.url))); return x ? str(x.url) : ""; };

/* South Africa — tender.title is the reference number, tender.description the real subject; "Participation" releases are
   publications of bidders' names (not invitations); SOEs (Eskom, Transnet, PRASA, water boards, SOC / (Pty) Ltd) → semi */
const ZA_SOE = /\b(?:eskom|transnet|prasa|passenger rail agency|denel|south african airways|post office|rand water|umgeni water|magalies water|amatola water|johannesburg water|city power|airports company|sanral|national roads agency|development bank of southern africa|industrial development corporation|land bank|sentech|broadband infraco|trans-caledon|petrosa|necsa|safcol|armscor|sabc|alexkor|soc ltd|soc limited)\b|\(pty\)|\bsoc\b|\bcompany limited\b|\blimited\s*$/i;
export const OCDS_ZA = {
  country: "South Africa",
  title: r => dropContactSentences(r.tender.description) || str(r.tender.title),
  summary: r => summary([str(r.tender.description) && str(r.tender.title) ? "Ref " + str(r.tender.title) : "", r.tender.procurementMethodDetails, r.tender.mainProcurementCategory]),
  skip: r => /^participation$/i.test(str(r.tender.procurementMethodDetails)),
  url: r => docUrl(r, /^https?:\/\//i) || (r.ocid ? "https://ocds-api.etenders.gov.za/api/OCDSReleases/release/" + encodeURIComponent(r.ocid) : ""),
  buyerType: r => (ZA_SOE.test(txt((r.buyer || {}).name)) ? "semi" : ""),
};
/* UK Find a Tender — without a stages filter (stages=tender drops most Procurement Act 2023 notices); keep tender notices
   and their updates; buyer kind from the official UK_CA_TYPE classification of the buyer party */
const FTS = "https://www.find-tender.service.gov.uk/Notice/";
function ukBuyerType(r) {
  const bid = str((r.buyer || {}).id);
  const p = (r.parties || []).find(x => x && (str(x.id) === bid || (x.roles || []).includes("buyer")));
  const cls = ((p && p.details && p.details.classifications) || []).map(c => str(c.scheme) + ":" + str(c.id));
  if (cls.some(c => /^UK_CA_TYPE:publicUndertaking$/i.test(c) || /^TED_CA_TYPE:PUBLIC_UNDERTAKING$/i.test(c))) return "semi";
  if (cls.some(c => /^UK_CA_TYPE:privateUtility$/i.test(c))) return "private";
  return /(?:,\s*|\s)(?:inc\.?|llc|plc)\s*$/i.test(txt((r.buyer || {}).name)) ? "private" : "";
}
export const OCDS_FTS = {
  country: "United Kingdom", tags: ["tender", "tenderUpdate"],
  url: r => (/^\d{6}-\d{4}$/.test(str(r.id)) ? FTS + str(r.id) : docUrl(r, /find-tender\.service\.gov\.uk\/Notice\/\d{6}-\d{4}$/)),
  buyerType: ukBuyerType,
};
/* UK Contracts Finder — notice link = first 36 chars (UUID) of release.id, as published in tender.documents */
const CF = "https://www.contractsfinder.service.gov.uk/Notice/";
export const OCDS_CF = {
  country: "United Kingdom", tags: ["tender", "tenderAmendment", "tenderUpdate"],
  url: r => docUrl(r, /contractsfinder\.service\.gov\.uk\/Notice\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
    ((m => (m ? CF + m[1] : ""))(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(str(r.id)))),
  buyerType: ukBuyerType,
};

/* ---------- Kenya PPIP (Laravel paginator; sortby=published_at&order=desc&perpage=50) ---------- */
/* the notice's own published files (documents[]) → at most 2 {u, t}: the Tender Document first, then the Tender Notice; only
   https://tenders.go.ke/….pdf|.docx. Read per entry: url, type.description, deleted_at — never created_by / updated_by / deleted_by.
   Opening minutes, evaluation reports, award letters and the rest are not the notice's file and are skipped. */
const KE_DOC_RANK = { "tender document": 0, "tender notice": 1 };
export function keDocs(docs) {
  const out = [], seen = new Set();
  for (const d of Array.isArray(docs) ? docs : []) {
    if (!d || typeof d !== "object" || d.deleted_at || typeof d.url !== "string") continue;
    const t = str(d.type && typeof d.type === "object" ? d.type.description : "");
    const rank = KE_DOC_RANK[t.toLowerCase()];
    if (rank === undefined) continue;
    let u; try { u = new URL(d.url, "https://tenders.go.ke/"); } catch (e) { continue; }
    if (u.protocol !== "https:" || u.hostname !== "tenders.go.ke" || u.username || u.password || u.port || !/\.(?:pdf|docx)$/i.test(u.pathname)) continue;
    u.hash = "";
    const s = u.toString();
    if (seen.has(s)) continue;
    seen.add(s); out.push({ u: s, t, rank });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 2).map(x => ({ u: x.u, t: x.t }));
}
/* Read: id, title, tender_ref, published_at, close_at, pe.name, pe.pe_type_id, procurement_category/method titles, and documents[]
   (url, type.description, deleted_at only: keDocs) as the record's non-enumerable doc_urls — the «ابعتلي» e-mail's official file
   (engine.js storeDocHints → KV dochint:<id>); like withNext it never reaches Object.keys / JSON.stringify of the record.
   NEVER read: created_by (officials' names, e-mails, phones, national ID numbers), updated_by, team_members, subscribers,
   bidders, directors, contracts, pe.email / pe.telephone. pe_type_id 41 = state corporations (KPA, KRA, KEMSA, KNH, NCPB). */
export function parseKePpip(text, src = {}) {
  const d = J(text), now = clock(src), rows = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
  const out = [];
  for (const r of rows) {
    if (!r || !r.id || !r.title || r.published === 0 || r.published === false || r.terminated === 1 || r.terminated === true || r.deleted_at) continue;
    const cat = txt((r.procurement_category || {}).title), meth = txt((r.procurement_method || {}).title);
    if (/disposal/i.test(cat + " " + meth)) continue;       // the government selling assets is not a procurement opportunity
    const pe = r.pe || {};
    out.push(rec({
      ext_id: String(r.id), title: cleanTitle(r.title), url: "https://tenders.go.ke/tenders/" + encodeURIComponent(r.id),
      published: pastOrEmpty(dayOf(r.published_at), now), deadline: dayOf(r.close_at), entity: txt(pe.name), country: "Kenya",
      summary: summary([meth, cat, r.tender_ref && "Ref " + str(r.tender_ref)]),
      proc_method: meth, proc_group: groupOf(cat), buyer_type: Number(pe.pe_type_id) === 41 ? "semi" : "",
    }));
    const kd = keDocs(r.documents);
    if (kd.length) Object.defineProperty(out[out.length - 1], "doc_urls", { value: kd, enumerable: false });
  }
  return out;
}

/* ---------- Uganda GPP (cdn.ppda.go.ug/api/bid-invitations; newest deadline first) ---------- */
/* NEVER read: initiated_by (an official's name), approved_by_id, author_id, bank details, addresses. */
const UG_SOE = /\b(?:corporation|company|uganda airlines|development bank|nssf|national social security fund|posta uganda|new vision)\b|\b(?:ltd|limited)\b/i;
export function parseUgGpp(text, src = {}) {
  const d = J(text), now = clock(src);
  const rows = d && d.data && Array.isArray(d.data.data) ? d.data.data : Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
  const out = [];
  for (const r of rows) {
    if (!r || !r.id || r.cancelled_date || r.deleted_at || (r.is_active && r.is_active !== "Y")) continue;
    const pe = r.procurement_plan_entry || {}, ent = txt((r.pdes || {}).title);
    const meth = txt((r.procurement_method || {}).title), type = txt((pe.procurement_type || {}).title);
    const amt = money(r.estimated_amount), cur = str((r.estimated_amount_currency || {}).abbreviation);
    out.push(rec({
      ext_id: String(r.id), title: cleanTitle(pe.subject_of_procurement || r.description_of_work),
      url: "https://gpp.ppda.go.ug/public/bid-invitations/tender-notice/" + encodeURIComponent(r.id),
      published: pastOrEmpty(dayOf(r.invitation_to_bid_date), now), deadline: dayOf(r.bid_submission_deadline_date),
      entity: ent, country: "Uganda", value: cur ? amt : "", currency: cur,
      summary: summary([meth, type, r.procurement_reference_no && "Ref " + str(r.procurement_reference_no), r.financial_year && "FY " + str(r.financial_year)]),
      proc_method: meth, proc_group: groupOf(type), buyer_type: UG_SOE.test(ent) ? "semi" : "",
    }));
  }
  return out;
}

/* ---------- HCWW — WordPress REST, category 20 «اخبار المناقصات» ---------- */
/* Title + date + link only: the post body is a scanned newspaper ad (image) and is not read or OCR'd.
   «مناقصة عامة: شركة مياه الشرب … بالمنيا» → entity = the text after ":". date_gmt is UTC; date is Cairo local time. */
export function parseHcww(text, src = {}) {
  const d = J(text), now = clock(src), rows = Array.isArray(d) ? d : [];
  const out = [];
  for (const p of rows) {
    const title = cleanTitle(p && p.title && (p.title.rendered ?? p.title)), url = str(p && p.link);
    if (!p || !p.id || !title || !/^https?:\/\//i.test(url)) continue;
    const m = /[:：]\s*(.+)$/.exec(title);
    const gmt = str(p.date_gmt);
    out.push(rec({
      ext_id: String(p.id), title, url, entity: m ? m[1].replace(/[.\s،]+$/, "") : "", country: "Egypt",
      published: pastOrEmpty(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(gmt) ? gmt + "Z" : gmt || str(p.date), now),
    }));
  }
  return out;
}

/* ---------- France BOAMP — Opendatasoft Explore API v2.1 (source disabled: robots.txt Disallow: /api/ for all bots) ---------- */
export function parseBoamp(text, src = {}) {
  const d = J(text), now = clock(src), rows = Array.isArray(d.results) ? d.results : [];
  const out = [];
  for (const r of rows) {
    const id = str(r && r.idweb), title = cleanTitle(r && r.objet);
    const url = /^https?:\/\//i.test(str(r && r.url_avis)) ? str(r.url_avis) : id ? "https://www.boamp.fr/pages/avis/?q=idweb:" + encodeURIComponent(id) : "";
    if (!id || !title || !url) continue;
    const types = (Array.isArray(r.type_marche) ? r.type_marche : [r.type_marche]).map(str).filter(Boolean);
    const desc = (Array.isArray(r.descripteur_libelle) ? r.descripteur_libelle : [r.descripteur_libelle]).map(str).filter(Boolean).slice(0, 4).join(", ");
    out.push(rec({
      ext_id: id, title, url, published: pastOrEmpty(dayOf(r.dateparution), now), deadline: dayOf(r.datelimitereponse), entity: txt(r.nomacheteur), country: "France",
      summary: summary([r.nature_libelle, types.join(" / "), desc]), proc_group: types.includes("FOURNITURES") ? "GO" : types.includes("TRAVAUX") ? "CW" : "",
    }));
  }
  return out;
}

/* ---------- registry ---------- */
const mapWith = (src, extra) => ({ ...src, mapping: { ...extra, ...((src && src.mapping) || {}) } });
export const ADAPTERS = {
  "wb-projects-eg": { parse: async (text, src) => parseWbProjects(text, src), fetch: { pages: 1, headers: JSON_HEADERS } },
  "wb-projects-v3": { parse: async (text, src) => parseWbProjects(text, mapWith(src, { exclude_countries: ["EG"] })), fetch: { pages: 1, headers: JSON_HEADERS } },
  "wb-financesone-contract-awards": { parse: async (text, src) => parseWbContractAwards(text, src), fetch: { pages: 1, headers: JSON_HEADERS } },
  "za-etenders-ocds": { parse: async (text, src) => mapOcdsReleases(text, OCDS_ZA, src), fetch: { pages: 2, headers: JSON_HEADERS } },
  "uk_find_a_tender_ocds": { parse: async (text, src) => mapOcdsReleases(text, OCDS_FTS, src), fetch: { pages: 1, headers: JSON_HEADERS, follow_next: "links.next" } },
  "uk_contracts_finder_ocds": { parse: async (text, src) => mapOcdsReleases(text, OCDS_CF, src), fetch: { pages: 1, headers: JSON_HEADERS, follow_next: "links.next" } },
  "ke-ppip": { parse: async (text, src) => parseKePpip(text, src), fetch: { pages: 2, headers: JSON_HEADERS } },
  "ug-gpp": { parse: async (text, src) => parseUgGpp(text, src), fetch: { pages: 2, headers: JSON_HEADERS } },
  "hcww-tenders": { parse: async (text, src) => parseHcww(text, src), fetch: { pages: 1, headers: JSON_HEADERS } },
  "fr_boamp_api": { parse: async (text, src) => parseBoamp(text, src), fetch: { pages: 1, headers: JSON_HEADERS, retries: 3, backoff_ms: [2000, 6000, 15000] } },
};

/* ---------- recommended seed rows (merge over seeds/sources.json; tests run the fixtures through these mappings) ---------- */
const TENDER_KIND_MAP = { field: "buyer_type", map: { semi: "tender_semi", private: "tender_private" }, default: "tender_gov" };
const JSON_MAP = { adapter: "json", accept: "application/json" };
export const SEED_PATCHES = {
  "wb-projects-eg": {
    name: "World Bank Projects API v3 — Egypt pipeline & active projects", name_ar: "البنك الدولي — مشروعات مصر المرتقبة والجارية",
    kind: "project", market: "eg", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://search.worldbank.org/api/v3/projects?format=json&rows=50&os=0&countrycode_exact=EG&status_exact=Pipeline%5EActive&srt=boardapprovaldate&order=desc&fl=id,project_name,boardapprovaldate,countryshortname,countrycode,regionname,status,totalamt,borrower,impagency,project_abstract",
    mapping: { ...JSON_MAP, pages: 1, market_from: "market_hint", max_age_days: 1900 },
    homepage: "https://projects.worldbank.org/en/projects-operations/projects-list?countrycode_exact=EG",
    terms_note: "World Bank Search API v3, public, no key; Terms of Use for Datasets (CC BY 4.0). robots.txt: 404 (no rules). The v2 projects index is stale (still lists dropped projects as Pipeline) — v3 is used.",
  },
  "wb-projects-v3": {
    name: "World Bank Projects API v3 — Africa & MENA pipeline projects", name_ar: "البنك الدولي — المشروعات المرتقبة في أفريقيا والشرق الأوسط",
    kind: "project", market: "intl", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://search.worldbank.org/api/v3/projects?format=json&rows=100&os=0&status_exact=Pipeline%5EActive&regionname_exact=Eastern%20and%20Southern%20Africa%5EWestern%20and%20Central%20Africa%5EMiddle%20East%2C%20North%20Africa%2C%20Afghanistan%2C%20and%20Pakistan&srt=boardapprovaldate&order=desc&fl=id,project_name,boardapprovaldate,countryshortname,countrycode,regionname,status,totalamt,borrower,impagency,project_abstract",
    mapping: { ...JSON_MAP, pages: 1, market_from: "market_hint", exclude_countries: ["EG"], max_age_days: 400 },
    homepage: "https://projects.worldbank.org/en/projects-operations/projects-home",
    terms_note: "World Bank Search API v3, public, no key; CC BY 4.0. robots.txt: 404. Egypt rows are left to wb-projects-eg. Region names are the 2025+ ones (\"Middle East, North Africa, Afghanistan, and Pakistan\").",
  },
  "wb-financesone-contract-awards": {
    name: "World Bank Finances One — contract awards (DS00005): Egypt and Egyptian suppliers", name_ar: "البنك الدولي — ترسيات العقود في مصر وللموردين المصريين",
    kind: "project_news", market: "intl", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json&top=100&skip=0&filter=(borrower_country_code='EG'%20or%20supplier_country_code='EG')%20and%20contract_signing_date%3E%3D'{{date-180}}'",
    mapping: { ...JSON_MAP, pages: 1, market_from: "market_hint", max_age_days: 200 },
    homepage: "https://financesone.worldbank.org/contract-awards-in-investment-project-financing/DS00005",
    terms_note: "World Bank open data (CC BY 4.0), no key; robots.txt: 404. Awards lag signing by weeks → rolling 180-day window on contract_signing_date. Suppliers are named only when clearly a company; individual consultants and personal names are never stored.",
  },
  "za-etenders-ocds": {
    name: "South Africa — National Treasury eTenders OCDS API", name_ar: "جنوب أفريقيا — بوابة المناقصات الحكومية (الخزانة الوطنية)",
    kind: "tender_gov", market: "africa:za", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://ocds-api.etenders.gov.za/api/OCDSReleases?PageNumber={{page}}&PageSize=100&dateFrom={{date-2}}&dateTo={{date-1}}",
    mapping: { ...JSON_MAP, pages: 2, kind_map: TENDER_KIND_MAP, rfq_methods: ["Request for Quotation"] },
    homepage: "https://www.etenders.gov.za/Home/opportunities?id=1",
    terms_note: "Open Data Commons PDDL 1.0 (public domain); robots.txt: 404. The API answers HTTP 500 when dateTo is today or equals dateFrom, and for PageSize > 100 → window = the two previous days. Link = the official tender advert document.",
  },
  "ke-ppip": {
    name: "Kenya — Public Procurement Information Portal (PPIP) active tenders", name_ar: "كينيا — بوابة معلومات المشتريات العامة (مناقصات سارية)",
    kind: "tender_gov", market: "africa:ke", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://tenders.go.ke/api/active-tenders?sortby=published_at&order=desc&perpage=50&page={{page}}",
    mapping: { ...JSON_MAP, pages: 2, kind_map: TENDER_KIND_MAP, rfq_methods: ["Request for Quotation", "Request for Quotations"] },
    homepage: "https://tenders.go.ke/",
    terms_note: "robots.txt: User-agent: * Disallow: (all allowed). API of the public portal (rate limit 60 req/min per IP); default order is by closing date, so the portal's own sortby/order/perpage parameters are used (newest first). Officials' personal data in created_by / team_members / subscribers is never read; disposals of assets are skipped.",
  },
  "ug-gpp": {
    name: "Uganda — Government Procurement Portal (PPDA) bid invitations", name_ar: "أوغندا — بوابة المشتريات الحكومية (دعوات العطاءات)",
    kind: "tender_gov", market: "africa:ug", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://cdn.ppda.go.ug/api/bid-invitations?page={{page}}",
    mapping: { ...JSON_MAP, pages: 2, kind_map: TENDER_KIND_MAP, rfq_methods: ["Request for Quotations/Proposals (RFQ/P)"] },
    homepage: "https://gpp.ppda.go.ug/public/bid-invitations",
    terms_note: "robots.txt: User-agent: * Disallow: (all allowed). API of the public portal; list is ordered by bid deadline (latest first), so 2 pages cover the open invitations. initiated_by (an official's name) is never read.",
  },
  "uk_find_a_tender_ocds": {
    name: "UK Find a Tender Service — OCDS release packages", name_ar: "المملكة المتحدة — خدمة Find a Tender (مناقصات عامة)",
    kind: "tender_gov", market: "eu", lang: "en", parser: "json", schedule: "A", enabled: 1, disabled_reason: null,
    endpoint: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100&updatedFrom={{date-1}}T00:00:00Z",
    mapping: { ...JSON_MAP, pages: 1, kind_map: TENDER_KIND_MAP },
    homepage: "https://www.find-tender.service.gov.uk/Search",
    terms_note: "Official API, Open Government Licence v3.0; robots.txt: 404. No stages filter: stages=tender returns only the few legacy (PCR 2015) notices — Procurement Act 2023 tender notices are kept by their 'tender'/'tenderUpdate' tag. Newest first, 100 per call, every 2 h. Contact points are never read.",
  },
  "uk_contracts_finder_ocds": {
    name: "UK Contracts Finder — OCDS search", name_ar: "المملكة المتحدة — Contracts Finder (عقود حكومية أصغر)",
    kind: "tender_gov", market: "eu", lang: "en", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom={{date-2}}&publishedTo={{date}}&stages=tender&limit=100",
    mapping: { ...JSON_MAP, pages: 1, kind_map: TENDER_KIND_MAP },
    homepage: "https://www.contractsfinder.service.gov.uk/Search",
    terms_note: "Official API, Open Government Licence v3.0; robots.txt: 404. 'limit' (not 'size'). Link = the notice page published in tender.documents. Contact points are never read.",
  },
  "hcww-tenders": {
    name: "Holding Company for Water & Wastewater (HCWW) — tender news", name_ar: "الشركة القابضة لمياه الشرب والصرف الصحي — أخبار المناقصات",
    kind: "tender_semi", market: "eg", lang: "ar", parser: "json", schedule: "C", enabled: 1, disabled_reason: null,
    endpoint: "https://www.hcww.com.eg/wp-json/wp/v2/posts?categories=20&per_page=20&_fields=id,date,date_gmt,link,title",
    mapping: { ...JSON_MAP, pages: 1, ai_title_only: true, title_dedupe: false },
    homepage: "https://www.hcww.com.eg/أخبار-المناقصات",
    terms_note: "robots.txt allows /wp-json/ (disallows only /wp-content/plugins/, /readme.html, /refer/). Title + date + link only: the ad itself is a scanned image (not OCR'd). Titles repeat per water company, so title-similarity dedupe should be off for this source (title_dedupe: false).",
  },
  "fr_boamp_api": {
    name_ar: "فرنسا — النشرة الرسمية لإعلانات المشتريات العامة (BOAMP)",
    kind: "tender_gov", market: "eu", lang: "fr", parser: "json", schedule: "C", enabled: 0,
    disabled_reason: "robots.txt of boamp-datadila.opendatasoft.com disallows /api/ for all crawlers except Googlebot (re-checked 2026-11-18) — official link only",
    mapping: { ...JSON_MAP, pages: 1 },
    homepage: "https://www.boamp.fr/",
    terms_note: "Licence Ouverte / Etalab 2.0, but robots.txt (identical on www.boamp.fr and boamp-datadila.opendatasoft.com): User-agent: * → Disallow: /api/ (RSS/Atom exports also disallowed). The research note that /api/ is allowed was wrong. Adapter is ready if DILA grants access or the rule changes.",
  },
};
