/* migate-intel — adapters for the «bigtables» batch: large official listing pages that the declarative parsers
   (rss/atom/json/html mapping) cannot express. ADAPTERS[source_id] = { parse(text, src, Rewriter) → raw records,
   fetch?: { pages } }. Records have the shape engine.normalise() reads — {ext_id, title, url, published, deadline,
   entity, country, summary, value, currency, notice_type, proc_group, proc_method} — plus two fields the seeds map:
   `kind_hint` (tender | semi | rfq | project | award → mapping.kind_map) and `market_key` (a value markets.marketFor()
   resolves → mapping.market_from). `_raw` (row text) is set only when the seed has mapping.filter_re.
   Parsing is a linear string/regex scan (no DOM, never eval), identical in the Worker and under node --test; rows are
   read one at a time and only kept rows are retained, so the 3.9 MB EBRD page stays cheap. The Rewriter argument is
   accepted for interface compatibility and not needed.
   Owner rules: only what the public list shows (title, buyer, dates, deadline, value, official link, a short factual
   excerpt); e-mails/phones are stripped from every text; contractor/consultant names (often natural persons) are never
   read; a missing field stays empty. A changed layout throws a short explicit error (→ last_err, fail_count,
   /api/intel/health) instead of silently returning nothing; an empty page after page 1 just ends the paging.
     ebrd-ecepp                 EBRD ECEPP noticeSearchResults.html — one table of every notice since 2015 (~4,100 rows)
     aiib_project_procurement   AIIB ppo-data-all.js — `var ppoData=[{…}]` literal read as data (~1,200 records)
     pk_ppra_epms               Pakistan PPRA EPMS active tenders — 50 per page, newest first
     om-esnaad-public-dash      Oman Tender Board, Esnaad public dashboard «المناقصات المطروحة» — 50 per page, newest
                                first; the notice view needs a session, so items link to the public dashboard. */
import { stripHtml, stripContacts, decodeEntities, absUrl, asciiDigits, clip } from "../util.js";

/* ---------- text, dates, small helpers ---------- */
const LEFT_ENT = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i;
/* markup → one-line text; decodes once more when the source double-encoded (EBRD "&amp;amp;") */
export function txt(s) { let t = stripHtml(s == null ? "" : String(s)); if (LEFT_ENT.test(t)) t = decodeEntities(t); return t.replace(/\s+/g, " ").trim(); }
/* text we may publish: util.stripContacts (e-mails, phones) plus, defensively, a named contact person introduced as such
   ("Contact: Mr. X Y", «للتواصل: السيد …») and national ID numbers (Pakistan CNIC, Egyptian 14-digit ID) */
const PERSON = /\b(?:[Cc]ontact(?:\s+[Pp]erson)?|CONTACT(?:\s+PERSON)?|[Ff]ocal\s+[Pp](?:erson|oint)|[Aa]ttn\.?|[Aa]ttention)\s*[:\-–]?\s*(?:[Mm](?:r|rs|s|iss)|[Dd]r|[Ee]ngr?|MR|MRS|MS|DR|ENGR?)\.?\s+[A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3}|(?:للتواصل|للاستفسار(?:ات)?|الاتصال\s+ب|التواصل\s+مع)\s*[:\-–]?\s*(?:مع\s+)?(?:السيد[ةه]?|المهندس[ةه]?|الدكتور[ةه]?|الأستاذ[ةه]?|الاستاذ[ةه]?)\s+[ء-ي]+(?:\s+[ء-ي]+){0,2}/g;
const NATIONAL_ID = /(?:\b(?:CNIC|NICOP|national\s+id(?:entity)?(?:\s+card)?(?:\s+no\.?)?)\s*[:#.]?\s*)?(?:\b\d{5}-\d{7}-\d\b|\b[23]\d{13}\b)/gi;
const LEFT_LABEL = /(?:\b(?:e-?mail|tel(?:ephone)?|phone|mobile|fax|whatsapp)\b|هاتف|تليفون|موبايل|فاكس|واتساب|البريد الإلكتروني|بريد إلكتروني|بريد)\s*[:.]?\s*(?=$|[,;·،؛)])/gi;
export function clean(s) {
  const t = stripContacts(txt(s).replace(NATIONAL_ID, " ")) || ""; // contacts first: a phone keeps its label until removed
  return t.replace(PERSON, " ").replace(LEFT_LABEL, " ").replace(/\s+([,;:،؛])/g, "$1").replace(/([,;،؛])(?:\s*[,;،؛])+/g, "$1")
    .replace(/\s+/g, " ").replace(/^[\s,;:·–—-]+|[\s,;:·–—-]+$/g, "").trim();
}
const pad = n => String(n).padStart(2, "0");
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function ymd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : "";
}
/* "Nov 18, 2026" · "Sep 15,2026" · "April 30, 2026" · "Aug. 28, 2026" · "Nov 3 , 2026" → "2026-11-18" ("" when absent) */
export function mdyDate(s) {
  const m = /([A-Za-z]{3,9})\.?\s*(\d{1,2})\s*,\s*(\d{4})/.exec(asciiDigits(s || ""));
  const mo = m && MON[m[1].slice(0, 3).toLowerCase()];
  return mo ? ymd(m[3], mo, m[2]) : "";
}
/* "13-12-2026" · "18/11/2026" (day first) → "2026-12-13" */
export function dmyDate(s) { const m = /(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/.exec(asciiDigits(s || "")); return m ? ymd(m[3], m[2], m[1]) : ""; }
const dayNo = s => { const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
/* EBRD stamps "yyyymmddhhmm" are UK civil time: GMT, or BST (UTC+1) from the last Sunday of March to the last Sunday
   of October → exact instant; the day part is kept as shown for deadlines */
const lastSunday = (y, m0) => { const d = new Date(Date.UTC(y, m0 + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };
export function ukStampIso(k) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(k || "");
  if (!m || !ymd(m[1], m[2], m[3]) || +m[4] > 23 || +m[5] > 59) return "";
  const y = +m[1], local = Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5]);
  const bst = local >= Date.UTC(y, 2, lastSunday(y, 2), 1) && local < Date.UTC(y, 9, lastSunday(y, 9), 2);
  return new Date(local - (bst ? 3600e3 : 0)).toISOString();
}
export function ukStampDay(k) { const m = /^(\d{4})(\d{2})(\d{2})/.exec(k || ""); return m ? ymd(m[1], m[2], m[3]) : ""; }
/* visible "dd/mm/yyyy HH:MM" → the same stamp (fallback when the hidden sort cells are missing) */
function ukKeyFromText(s) { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(txt(s)); return m && ymd(m[3], m[2], m[1]) ? m[3] + pad(m[2]) + pad(m[1]) + pad(m[4] || 0) + pad(m[5] || 0) : ""; }
const stamp = s => (/(?:^|\D)(\d{12})(?!\d)/.exec(txt(s)) || [])[1] || "";
/* inner HTML of each <td> of one row (none of these tables nests tables in cells) */
function cells(row) { const out = []; for (const m of row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)) out.push(m[1]); return out; }
function attr(tag, name) { const m = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i").exec(tag || ""); return m ? decodeEntities(m[1] ?? m[2]) : ""; }
const opt = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const pageOf = (src, param) => +(new RegExp("[?&]" + param + "=(\\d+)", "i").exec((src && src.endpoint) || "") || [])[1] || 1;
const loose = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const untrunc = s => String(s || "").replace(/(?:\s*(?:\.{2,}|…))+$/, "").trim();
const procGroup = cat => (/goods|supply and install/i.test(cat) ? "GO" : /works/i.test(cat) ? "CW" : /non[- ]?consult/i.test(cat) ? "NC" : /consult/i.test(cat) ? "CS" : /services/i.test(cat) ? "NC" : "");
/* country names markets.marketFor() does not know → a key it does (ISO3); anything else passes through unchanged */
const MARKET_ALIAS = { romania: "ROU", bulgaria: "BGR", croatia: "HRV", lithuania: "LTU", latvia: "LVA", estonia: "EST", slovakia: "SVK", "slovak republic": "SVK", poland: "POL", hungary: "HUN", slovenia: "SVN", "czech republic": "CZE", czechia: "CZE", greece: "GRC", cyprus: "CYP", "lao pdr": "LAO", "republic of india": "IND" };
export function marketKey(country) { const k = String(country || "").trim(); return MARKET_ALIAS[k.toLowerCase()] || k; }
/* the ≤ 200-character factual excerpt (owner rule), built from the list's own fields */
const excerpt = parts => clip(parts.map(clean).filter(Boolean).join(" · "), 200);
const newestFirst = (a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0);
/* distinct notices of one source sometimes carry the same title (AIIB lots "TCDD … – Specific Procurement Notice" ×7,
   PPRA "TRAINING EQUIPMENT (AS A PACKAGE)" ×2): append the source's own distinguishing reference (document name,
   ref. no.) so readers can tell them apart. O(n). Note: engine.DedupeIndex compares titles by trigrams (≥ 0.8) across
   all sources, so long look-alike titles of one source can still be folded there — an engine-side matter. */
function labelTwins(recs, label) {
  const seen = new Map();
  for (const r of recs) { const k = loose(r.title); seen.set(k, (seen.get(k) || 0) + 1); }
  for (const r of recs) if (seen.get(loose(r.title)) > 1) { const l = clean(label(r)); if (l && !loose(r.title).includes(loose(l))) r.title += " (" + l + ")"; }
  return recs;
}

/* ---------- EBRD ECEPP ----------
   cells: 0 <a href="viewNotice.html?displayNoticeId=N">Country: title</a> · 1 notice type · 2 exercise title ·
   3 published "dd/mm/yyyy HH:MM UK Time" · 4 closing date or N/A · 5 state (Open | Closed | Information Only) ·
   6 published day · 7 published stamp · 8 closing stamp · 9 hidden "[project, project no., country, (exercise title,
   exercise id,) category, method, client, sector, notice type]" (commas also occur inside names → anchored parsing).
   Kept: tender notices still open (state Open or closing ≥ the page's newest day), General Procurement Notices of the
   last 60 days (→ project) and Contract Award Notices of the last 30 days (→ project_news); windows count back from the
   newest notice on the page, so a stale page cannot look fresh. Addenda, shortlists, prequalified lists are skipped. */
const EBRD_TENDER = /^(?:invitation for (?:tenders?|bids?|prequalification|pre-qualification|expressions? (?:of )?interest)|request for (?:proposals?|expressions? of interest|bids?|quotations?))/i;
const EBRD_METHOD = /^(?:open tender\b|consultancy (?:single|two) stage\b|consultancy direct\b|consultancy competitive\b|direct contract|limited tender|selective tender|repeat tendering$|simple$|shopping$|request for quotations?$)/i;
const EBRD_CAT = /^(?:(?:goods|works|consultancy|supply and install|non[- ]?consult\w*(?: services)?|services|plant)(?:,|$))+$/i;
export function ebrdMeta(meta) {
  const m = /^\s*\[([\s\S]*)\]\s*$/.exec(txt(meta));
  const parts = m && m[1].trim() ? m[1].split(", ").map(s => s.trim()) : [];
  const n = parts.length;
  if (n < 5) return {};
  let k = -1;
  for (let i = n - 3; i >= 2; i--) if (EBRD_METHOD.test(parts[i]) || EBRD_CAT.test(parts[i])) { k = i; break; }
  const isMethod = k >= 0 && EBRD_METHOD.test(parts[k]);
  const no = parts.findIndex((p, i) => i >= 1 && i < n - 2 && /^(?:\d{1,6}|N\/A)$/i.test(p));
  const sector = parts[n - 2];
  return {
    project: no > 0 ? parts.slice(0, no).join(", ") : "", project_no: no > 0 && /^\d{3,}$/.test(parts[no]) ? parts[no] : "",
    category: k < 0 ? "" : isMethod ? (EBRD_CAT.test(parts[k - 1] || "") ? parts[k - 1] : "") : parts[k],
    method: isMethod ? parts[k] : "", client: k >= 0 ? parts.slice(k + 1, n - 2).join(", ") : "",
    sector: /^[A-Z][\w&,.\- ]{1,60}$/.test(sector) ? sector : "",
  };
}
async function parseEbrd(html, src = {}) {
  html = String(html || "");
  const mp = src.mapping || {}, base = src.endpoint || "https://ecepp.ebrd.com/delta/noticeSearchResults.html";
  const t0 = html.search(/<table\b[^>]*\bid\s*=\s*["']noticeResultsTable["']/i);
  if (t0 < 0) throw new Error("EBRD ECEPP layout changed: table#noticeResultsTable not found");
  let tEnd = html.indexOf("</table>", t0); if (tEnd < 0) tEnd = html.length; // the engine may cut bodies over 6 MB
  const rawWanted = !!mp.filter_re, cand = [];
  let pos = html.indexOf("<tbody", t0), rows = 0, linked = 0, newest = "";
  if (pos < 0 || pos > tEnd) pos = t0;
  while ((pos = html.indexOf("<tr", pos)) >= 0 && pos < tEnd) {
    let end = html.indexOf("</tr>", pos);
    if (end < 0 || end > tEnd) end = tEnd;
    const row = html.slice(pos, end);
    pos = end + 5;
    rows++;
    const c = cells(row);
    if (c.length < 6) continue;
    const a = /<a\b[^>]*\bhref\s*=\s*["']([^"']*displayNoticeId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(c[0]);
    if (!a) continue;
    linked++;
    const pub = stamp(c[7]) || ukKeyFromText(c[3]);
    if (pub > newest) newest = pub;
    const type = txt(c[1]);
    const cls = EBRD_TENDER.test(type) ? "tender" : /^general procurement notice/i.test(type) ? "project" : /^contract award/i.test(type) ? "award" : "";
    if (cls) cand.push({ id: a[2], href: a[1], title: a[3], type, cls, state: txt(c[5]), pub, close: stamp(c[8]) || ukKeyFromText(c[4]), meta: c[9] || "", row: rawWanted ? row : "" });
  }
  if (!linked) throw new Error(`EBRD ECEPP layout changed: none of ${rows} table rows has a viewNotice.html link`);
  const ref = newest.slice(0, 8), refDay = dayNo(ref), projDays = opt(mp.project_days, 60), awardDays = opt(mp.award_days, 30);
  const out = [];
  for (const r of cand) {
    const age = refDay - dayNo(r.pub.slice(0, 8));
    const keep = r.cls === "tender" ? /\bopen\b/i.test(r.state) || (r.close && r.close.slice(0, 8) >= ref) : age <= (r.cls === "project" ? projDays : awardDays);
    if (!keep) continue;
    const title = clean(r.title), md = ebrdMeta(r.meta);
    const country = (/^([^:]{2,60}):/.exec(title) || [])[1] || "";
    const rec = {
      ext_id: r.id, title: r.cls === "tender" ? title : title + " – " + r.type, url: absUrl(decodeEntities(r.href), base),
      published: ukStampIso(r.pub), deadline: r.cls === "tender" ? ukStampDay(r.close) : "",
      entity: clean(md.client), country: country.trim(), market_key: marketKey(country),
      summary: excerpt([r.type, md.category && md.category.replace(/,\s*/g, ", "), md.method, md.sector, md.project && "Project: " + md.project + (md.project_no ? " (" + md.project_no + ")" : "")]),
      notice_type: r.type, proc_group: procGroup(md.category), proc_method: md.method || "", kind_hint: r.cls,
    };
    if (rawWanted) rec._raw = txt(r.row);
    out.push(rec);
  }
  const order = { tender: 0, project: 1, award: 2 };
  return labelTwins(out, r => (/Project: ([^·]+)/.exec(r.summary) || [])[1] || "notice " + r.ext_id).sort((a, b) => order[a.kind_hint] - order[b.kind_hint] || newestFirst(a, b));
}

/* ---------- AIIB project procurement ----------
   `var ppoData = [{id:"Nov 18, 2026" (issue date), cd (closing date), mb (member), pj (project), ds (contract
   description), cr (contractor/consultant — natural persons for individual consultants: never read), sd (signing
   date), pc (contract price), st (sector), ct (category), tp (notice type, free text with variants), dc (document
   path)}, …]` — an unofficial file behind the public list page: string literals are read with a regex (never
   evaluated) and the file is rejected with an explicit error when fewer than half of its objects are readable.
   Kept: procurement notices still open (closing ≥ the file's newest issue date, or no closing date and issued within
   45 days) and general/advance procurement notices of the last 90 days (→ project). Contract awards (named
   individuals), procurement plans, addenda, corrigenda, extensions, cancellations and events are skipped. */
const AIIB_SKIP = /addend|corrigend|extension|amendment|cancel|clarification|award|procurement plan|outreach|conference|roadshow|webinar|bulletin|request for cv|rejection|vendor|minutes|pre-?bid/i;
const AIIB_TENDER = /specific procurement notice|specific project notice|invitation (?:for|to) (?:tenders?|bids?|pre-?qualification)|request (?:for|of) (?:bids?|tenders?|proposals?|quotations?)|tender notice|expressions? of interest|renotice/i;
const AIIB_PROJECT = /general procurement notice|advance (?:procurement|contracting) notice|market engagement/i;
const JS_ESC = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0", "\n": "", "\r": "", "\r\n": "", "\u2028": "", "\u2029": "" };
/* JS string-literal escapes → text (\" \\ \n \xHH \uHHHH \u{H…}); data only, nothing is executed */
export function jsUnescape(s) {
  s = String(s || "");
  if (s.indexOf("\\") < 0) return s;
  return s.replace(/\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g, (_, cp, u, x, ch) => {
    if (cp) { const n = parseInt(cp, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
    if (u) return String.fromCharCode(parseInt(u, 16));
    if (x) return String.fromCharCode(parseInt(x, 16));
    return Object.prototype.hasOwnProperty.call(JS_ESC, ch) ? JS_ESC[ch] : ch;
  });
}
async function parseAiib(js, src = {}) {
  js = String(js || "");
  const mp = src.mapping || {}, base = mp.base || "https://www.aiib.org/";
  const at = js.search(/\bppoData\s*=\s*\[/);
  if (at < 0) throw new Error("AIIB data file format changed: `var ppoData = [` not found");
  const body = js.slice(at), expected = (body.match(/\{\s*"?[A-Za-z_]\w*"?\s*:/g) || []).length;
  const OBJ = /\{\s*((?:"?[A-Za-z_]\w*"?\s*:\s*"(?:[^"\\]|\\.)*"\s*(?:,\s*)?)+)\}/g, PAIR = /"?([A-Za-z_]\w*)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const cand = [];
  let m, readable = 0, newest = NaN;
  while ((m = OBJ.exec(body))) {
    const o = {};
    for (const p of m[1].matchAll(PAIR)) if (p[1] !== "cr" && p[1] !== "sd") o[p[1]] = jsUnescape(p[2]); // contractor + signing date never read
    if (!o.tp || !o.dc || !(o.pj || o.mb)) continue;
    readable++;
    const issued = mdyDate(o.id), d = dayNo(issued);
    if (d > newest || (isNaN(newest) && !isNaN(d))) newest = d;
    const tp = txt(o.tp);
    const cls = AIIB_SKIP.test(tp) ? "" : AIIB_TENDER.test(tp) ? "tender" : AIIB_PROJECT.test(tp) ? "project" : "";
    if (cls) cand.push({ o, tp, cls, issued, closing: mdyDate(o.cd) });
  }
  if (!readable || readable < expected * 0.5) throw new Error(`AIIB data file format changed: ${readable} of ${expected} records readable (expected {id,cd,mb,pj,…,tp,dc} string fields)`);
  const undatedDays = opt(mp.undated_days, 45), projDays = opt(mp.project_days, 90), out = [], seen = new Set();
  for (const r of cand) {
    const age = newest - dayNo(r.issued);
    const keep = r.cls === "tender" ? (r.closing ? dayNo(r.closing) >= newest : age <= undatedDays) : age <= projDays;
    const dc = r.o.dc.trim();
    if (!keep || seen.has(dc)) continue;
    seen.add(dc);
    const mb = /^(?:n\/?a|multi-?country|-+)?$/i.test(txt(r.o.mb)) ? "" : txt(r.o.mb), pj = clean(r.o.pj), ds = clean(r.o.ds), st = txt(r.o.st);
    const price = /\b([A-Z]{3})\s*([\d,]+(?:\.\d+)?)\b/.exec(txt(r.o.pc));
    out.push({
      ext_id: dc, title: clean((mb ? mb + ": " : "") + pj + (ds ? " – " + ds : "") + " – " + r.tp), url: absUrl(dc, base),
      published: r.issued, deadline: r.cls === "tender" ? r.closing : "", entity: "", country: mb, market_key: marketKey(mb),
      summary: excerpt([r.tp, st && !/^n\/?a$/i.test(st) ? "Sector: " + st : "", ds && "Contract: " + ds]),
      value: price ? price[2].replace(/,/g, "") : "", currency: price ? price[1] : "",
      notice_type: r.tp, proc_group: /expressions? of interest/i.test(r.tp) ? "CS" : "", proc_method: "", kind_hint: r.cls,
    });
  }
  /* twin label = the notice's document name, e.g. "SPN-TCDD.DMB-1_EN.pdf" → "SPN-TCDD.DMB-1" */
  const doc = r => { let f = r.ext_id.split("/").pop() || ""; try { f = decodeURIComponent(f); } catch (e) {} return f.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\s]+(?:en|eng|english)$/i, "").replace(/_+/g, " ").trim(); };
  return labelTwins(out, doc).sort((a, b) => (a.kind_hint === b.kind_hint ? newestFirst(a, b) : a.kind_hint === "tender" ? -1 : 1));
}

/* ---------- Pakistan PPRA EPMS (active tenders) ----------
   per tender a main row (Sr · Tender No TS…E · details: title, notes, sector badge, reference · Status · Advertised
   "Nov 18, 2026" · Closing "Dec 28, 2026" + time · actions → /public/tenders/tender-details/TS…E) followed by a detail
   row (Organization: ministry / agency / city · Tender Type · Procurement Category · Sector · Tender Nature).
   Kept (unless mapping.keep_all): International tenders and Goods tenders — the ones Egyptian suppliers can act on;
   cancelled notices and disposals/auctions are skipped. Companies (Ltd/Company/Corporation) → semi-government. */
const PK_GENERIC = /^(?:tenders?|tender notice|notice of tender|notice inviting tenders?|procurement notice|notice|advertisement|invitation (?:for|to) (?:bids?|tenders?)|request for (?:quotations?|proposals?)|(?:tender notice )?no\.?\s*\S+|tender notice no\.?\s*\S+|i\.?\s?t\.?\s?no\.?\s*.*|t\.?\s?e\.?\s?no\.?\s*.*)(?:\s*\([^)]*\))?$/i;
const PK_SOE = /\b(?:limited|ltd|company|corporation|corporaion|plc)\b/i;
const PK_DISPOSAL = /\b(?:open auction|auction of|disposal of|sale of)\b/i;
const pkCell = (h, label) => (new RegExp("data-label\\s*=\\s*[\"']" + label + "[\"'][^>]*>([\\s\\S]*?)</td>", "i").exec(h) || [])[1] || "";
async function parsePpra(html, src = {}) {
  html = String(html || "");
  const mp = src.mapping || {}, base = src.endpoint || "https://epms.ppra.gov.pk/public/tenders/active-tenders", page = pageOf(src, "page");
  const t0 = html.search(/<table\b[^>]*class\s*=\s*["'][^"']*\bcb-rt\b/i);
  const empty = /Showing\s+0\s+of|No\s+(?:active\s+)?tenders?\s+(?:found|available)|No\s+records?\s+found/i.test(html);
  if (t0 < 0) { if (empty || page > 1) return []; throw new Error("PPRA EPMS layout changed: tender table (table.cb-rt) not found"); }
  let tEnd = html.indexOf("</table>", t0); if (tEnd < 0) tEnd = html.length;
  const blocks = html.slice(t0, tEnd).split(/<tr\b[^>]*class\s*=\s*["'][^"']*\bcb-rt-main\b[^"']*["'][^>]*>/i).slice(1);
  if (!blocks.length) { if (empty || page > 1 || !/<tbody\b[^>]*>[\s\S]*<tr\b/i.test(html.slice(t0, tEnd))) return []; throw new Error("PPRA EPMS layout changed: no tender rows (tr.cb-rt-main)"); }
  const out = [];
  for (const b of blocks) {
    const no = txt((/<strong\b[^>]*class\s*=\s*["'][^"']*\bcb-rt-name\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i.exec(b) || [])[1]);
    const det = pkCell(b, "Tender Details");
    const strongTitle = clean((/<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(det) || [])[1]);
    const smalls = [...det.matchAll(/<small\b([^>]*)>([\s\S]*?)<\/small>/gi)].map(x => ({ cls: attr(x[1], "class"), text: clean(x[2]) }));
    const notes = smalls.filter(x => /\bd-block\b/.test(x.cls) && !/\bbadge\b/.test(x.cls)).map(x => x.text).filter(s => s && !/^(?:attached|no|yes|nil|n\/?a|-+)$/i.test(s));
    const ref = (smalls.find(x => /\bbadge\b/.test(x.cls) && /\btext-muted\b/.test(x.cls)) || {}).text || "";
    let title = strongTitle;
    const longer = notes.find(s => !/(?:\.{2,}|…)$/.test(s) && s.length > title.length && s.length <= 300 && loose(s).includes(loose(title)));
    if (longer) title = longer;
    else if (!title || title.length < 25 || PK_GENERIC.test(title)) {
      const add = notes.find(s => untrunc(s).length >= 8 && !loose(title).includes(loose(untrunc(s))));
      if (add) title = (title ? title + " – " : "") + add.replace(/\s*\.{2,}$/, "…");
    }
    if (!title) continue;
    const refShown = ref && !loose(title).includes(loose(ref)) ? ref : "";
    const extra = notes.filter(s => !loose(title).includes(loose(untrunc(s))) && loose(untrunc(s)) !== loose(ref)).map(s => s.replace(/\s*\.{2,}$/, "…"));
    const grid = {};
    for (const g of b.matchAll(/<span\b[^>]*class\s*=\s*["']cb-rt-dl["'][^>]*>([\s\S]*?)<\/span>([\s\S]*?)<\/div>/gi)) grid[txt(g[1]).toLowerCase()] = g[2];
    const org = grid.organization || "";
    const parent = clean((/<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(org) || [])[1]);
    const agency = clean((/<span\b[^>]*class\s*=\s*["'][^"']*\bd-block\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(org) || [])[1]);
    const city = clean((/<small\b[^>]*>([\s\S]*?)<\/small>/i.exec(org) || [])[1]).replace(/\s*-\s*Pakistan$/i, "");
    let entity = parent || agency;
    if (parent && agency && loose(parent) !== loose(agency)) entity = loose(parent).includes(loose(agency)) ? parent : loose(agency).includes(loose(parent)) ? agency : agency + ", " + parent;
    const type = txt(grid["tender type"]), category = txt(grid["procurement category"]), nature = txt(grid["tender nature"]), status = txt(pkCell(b, "Status"));
    if (/cancel/i.test(status) || PK_DISPOSAL.test(title)) continue;
    if (!mp.keep_all && !(/international/i.test(nature) || /^goods$/i.test(category))) continue;
    const href = (/href\s*=\s*["']([^"']*\/tender-details\/[^"']+)["']/i.exec(b) || [])[1];
    out.push({
      ext_id: no || (href || "").split("/").pop(), title, url: href ? absUrl(decodeEntities(href), base) : no ? absUrl("/public/tenders/tender-details/" + encodeURIComponent(no), base) : "",
      published: mdyDate(txt(pkCell(b, "Advertised"))), deadline: mdyDate(txt(pkCell(b, "Closing"))),
      entity, country: "Pakistan", market_key: "Pakistan",
      summary: excerpt([extra.join(" · "), category, nature && nature + " tender", type && !/^tender notice$/i.test(type) ? type : "", refShown && "Ref. " + refShown, city]),
      notice_type: type, proc_group: procGroup(category), proc_method: type, ref,
      kind_hint: /quotation|\brfq\b/i.test(type) ? "rfq" : PK_SOE.test(parent + " " + agency) ? "semi" : "tender",
      ...(mp.filter_re ? { _raw: txt(b) } : {}),
    });
  }
  return labelTwins(out, r => (r.ref ? "Ref. " + r.ref : r.ext_id));
}

/* ---------- Oman Tender Board — Esnaad public dashboard (new tenders) ----------
   cells: 0 serial · 1 tender number (+ hidden input tendDescN = description) · 2 tender name, full text in
   Tip('…') · 3 entity · 4 category [contractor grades] · 5 type [Local | International] · 6 "Sales EndDate:dd-mm-yyyy-
   Bid Closing Date:dd-mm-yyyy" · 7 fee (OMR) · 8 bank guarantee · 9 getNit('<id>'). There is no publication date on
   the list (left empty). The notice view (nitParameterView) answers "Security Page … session" without a session, so
   every item links to the public dashboard; the tenderNo query parameter (ignored by the server, which returns the
   same public list) keeps each item's official link distinct so canonical-URL dedupe does not merge different tenders.
   Direct-assignment rows («الإسناد المباشر», not open to bidders) are skipped unless mapping.keep_all; government
   companies (شركة / ش.م.ع.م / ش.م.م / known SOE names) → semi-government. */
const OM_SOE = /شرك[ةه]|ش\s*\.?\s*م\s*\.?\s*ع\s*\.?\s*[مع]|ش\s*\.?\s*م\s*\.?\s*م|ش\s*ش\s*و|أسياد|حيا للمياه|النماء للدواجن|إذكاء|سنيار|بريد عمان|أبراج لخدمات الطاقة|تنمية أسماك عمان|\b(?:LLC|SAOC|SAOG|company)\b/i;
const OM_DASH = "https://etendering.tenderboard.gov.om/product/publicDash?viewFlag=NewTenders";
async function parseEsnaad(html, src = {}) {
  html = String(html || "");
  const mp = src.mapping || {}, page = pageOf(src, "pageNo");
  const dash = absUrl("/product/publicDash?viewFlag=NewTenders", src.endpoint || OM_DASH) || OM_DASH;
  const out = [];
  let rows = 0;
  for (const ch of html.split(/<tr\b/i)) {
    const nit = /\bgetNit\(\s*['"](\d+)['"]\s*\)/.exec(ch);
    if (!nit) continue;
    rows++;
    const c = cells(ch);
    const tip = /\bTip\(\s*'((?:[^'\\]|\\.)*)'/.exec(ch); // first Tip( is the tender name; "UnTip()" has no word boundary
    const input = /<input\b[^>]*\bid\s*=\s*["']tendDesc\d+["'][^>]*>/i.exec(ch);
    const desc = input ? clean(attr(input[0], "value")) : "";
    const name = tip ? clean(jsUnescape(tip[1])) : "";
    const title = name || desc || clean(untrunc(txt(c[2])));
    if (!title) continue;
    const no = clean((/showTndDesc\([^)]*\)[^>]*>([\s\S]*?)<\/span>/i.exec(ch) || [])[1]);
    const entity = clean(c[3]), category = txt(c[4]).replace(/\s*\[[^\]]*\]\s*$/, ""), type = txt(c[5]).replace(/\s*\[\s*([^\]]*?)\s*\]\s*/, " ($1)").trim();
    if (!mp.keep_all && /الإسناد المباشر/.test(type)) continue;
    const salesEnd = (/Sales\s*End\s*Date\s*:\s*(\d{1,2}-\d{1,2}-\d{4})/i.exec(ch) || [])[1] || "";
    const fee = txt(c[7]);
    out.push({
      ext_id: nit[1], title, url: dash + "&tenderNo=" + nit[1],
      published: "", deadline: dmyDate((/Bid\s*Closing\s*Date\s*:\s*(\d{1,2}-\d{1,2}-\d{4})/i.exec(ch) || [])[1]),
      entity, country: "Oman", market_key: "",
      summary: excerpt([no && "رقم المناقصة: " + no, category, type, salesEnd && "آخر موعد لشراء وثائق المناقصة: " + salesEnd, /^\d+(?:\.\d+)?$/.test(fee) ? "رسوم المناقصة: " + fee + " ر.ع." : "", desc && loose(desc) !== loose(title) ? desc : ""]),
      notice_type: type, proc_group: "", proc_method: "", ref: no, kind_hint: OM_SOE.test(entity) ? "semi" : "tender",
      ...(mp.filter_re ? { _raw: txt(ch) } : {}),
    });
  }
  if (!rows && page === 1 && !/name\s*=\s*['"]hidMax['"]|tender_statusPublic/i.test(html)) throw new Error("Esnaad dashboard layout changed: no tender rows with getNit('…')");
  return labelTwins(out, r => (r.ref ? "رقم " + r.ref : ""));
}

/* ebrd_ecepp is the same page as ebrd-ecepp (duplicate seed): deliberately not registered */
export const ADAPTERS = {
  "ebrd-ecepp": { parse: parseEbrd },
  "aiib_project_procurement": { parse: parseAiib },
  "pk_ppra_epms": { parse: parsePpra, fetch: { pages: 3 } },
  "om-esnaad-public-dash": { parse: parseEsnaad, fetch: { pages: 2 } },
};
