/* «htmllists» adapters (src/adapters/htmllists.js) against real pages saved on 2026-11-18 with the bot UA
   (test/fixtures/htmllists/*.gz: IsDB tenders pages 0–3, GHANEPS quick search pages 1–2 at 50 rows, DGMP appel_offre,
   NOC tenders page 1 and the Cloudflare challenge its page 2 answers; robots.txt files as served).
   Run alone: node --test test/adapters-htmllists.test.mjs */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { ADAPTERS, clean, txt, dMonthY, monthDY, dmyDate, dmyTimeIso, marketKey } from "../src/adapters/htmllists.js";
import { normalise, parseRobots, robotsAllows, robotsFor, fillTemplate, LIMITS } from "../src/engine.js";
import { ShimRewriter } from "../src/htmlshim.js";
import { parseDate, canonicalUrl, cairoDay, KINDS, stripContacts } from "../src/util.js";
import { MARKETS, marketFor } from "../src/markets.js";
import { makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FXP = n => join(here, "fixtures", "htmllists", n);
const FX = n => gunzipSync(readFileSync(FXP(n))).toString("utf8");
const TXT = n => readFileSync(FXP(n), "utf8");
const NOW = Date.parse("2026-11-18T10:00:00Z"); // the day the fixtures were fetched
const KIND_MAP = { field: "kind_hint", map: { semi: "tender_semi", rfq: "rfq", project: "project", award: "project_news" } };
const ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
/* the seed rows returned in this batch's seed_patch (kept in sync by hand) */
const SEED = {
  "isdb-tenders": { id: "isdb-tenders", kind: "tender_gov", market: "intl", lang: "en", parser: "adapter", endpoint: "https://www.isdb.org/project-procurement/tenders?page={{page0}}", mapping: { adapter: "htmllists", pages: 5, filter_re: "^status:active\\b", market_from: "market_key", kind_map: KIND_MAP, accept: ACCEPT } },
  "gh-ghaneps": { id: "gh-ghaneps", kind: "tender_gov", market: "africa:gh", lang: "en", parser: "adapter", endpoint: "https://www.ghaneps.gov.gh/epps/quickSearchAction.do?d-3680175-p={{page}}&searchSelect=1&T01_ps=50", mapping: { adapter: "htmllists", pages: 2, kind_map: KIND_MAP, accept: ACCEPT } },
  "ci-dgmp": { id: "ci-dgmp", kind: "tender_gov", market: "africa:ci", lang: "fr", parser: "adapter", endpoint: "https://www.marchespublics.ci/appel_offre", mapping: { adapter: "htmllists", kind_map: KIND_MAP, accept: ACCEPT } },
  "ly-noc-tenders": { id: "ly-noc-tenders", kind: "tender_semi", market: "ly", lang: "en", parser: "adapter", endpoint: "https://noc.ly/en/tenders/", mapping: { adapter: "htmllists", kind_map: KIND_MAP, accept: ACCEPT } },
};
const PAGES = {
  "isdb-tenders": ["isdb-tenders-p0.html.gz", "isdb-tenders-p1.html.gz", "isdb-tenders-p2.html.gz", "isdb-tenders-p3-empty.html.gz"],
  "gh-ghaneps": ["ghaneps-quicksearch-p1.html.gz", "ghaneps-quicksearch-p2.html.gz"],
  "ci-dgmp": ["ci-dgmp-appel_offre.html.gz"],
  "ly-noc-tenders": ["noc-tenders-p1.html.gz"],
};
/* the source object as engine.fetchSource hands it to a parser for page N (endpoint templated, mapping parsed) */
const srcFor = (id, page = 1, extra = {}) => ({ ...SEED[id], endpoint: fillTemplate(SEED[id].endpoint.replace(/\{\{page\}\}/g, String(page)).replace(/\{\{page0\}\}/g, String(page - 1)), NOW), mapping: { ...SEED[id].mapping, ...extra } });
const parse = (id, text, page = 1, extra = {}) => ADAPTERS[id].parse(text, srcFor(id, page, extra), ShimRewriter);
/* engine.fetchSource's paging rule: pages 1..min(mapping.pages, 5), stop at the first page that yields no record */
async function fetchAll(id, extra = {}) {
  const pages = Math.max(1, Math.min(+(SEED[id].mapping.pages) || 1, 5));
  let all = [], fetched = 0;
  for (let p = 1; p <= pages && p <= PAGES[id].length; p++) {
    const recs = await parse(id, FX(PAGES[id][p - 1]), p, extra);
    fetched++; all = all.concat(recs);
    if (recs.length === 0) break;
  }
  return { all, fetched };
}
const cache = {};
const records = async id => (cache[id] ||= (await fetchAll(id)).all);
/* runCycle's post-normalise filters (max age, closed, per-source cap) and storeItems' id dedupe — what the engine
   would store at NOW */
function engineKeep(id, recs) {
  const src = SEED[id], mp = src.mapping, today = cairoDay(NOW);
  const maxAge = (mp.max_age_days || (src.kind === "news" || src.kind === "project_news" ? 21 : 120)) * 864e5;
  const items = recs.map(r => normalise(r, src, NOW)).filter(Boolean)
    .filter(it => (it.deadline && it.deadline >= today) || !it.published_at || NOW - Date.parse(it.published_at) <= maxAge)
    .filter(it => it.status !== "closed").slice(0, LIMITS.maxItemsPerSource);
  const seen = new Set();
  return items.filter(it => !seen.has(it.id) && seen.add(it.id));
}
const CONTACT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b|\b0[1-9](?:\s\d{2}){4}\b|\bGHA-\d{9}-\d\b/;
function common(id, recs) {
  assert.ok(recs.length >= 1, id + ": at least one record");
  assert.ok(recs.some(r => r.title && /^https:\/\//.test(r.url) && (parseDate(r.deadline) || parseDate(r.published))), id + ": ≥ 1 record with title, link and date");
  for (const r of recs) {
    assert.ok(r.title && r.title.length >= 5, id + ": title");
    assert.match(r.url, /^https:\/\/[^\s]+$/, id + ": official https link");
    assert.ok(r.ext_id, id + ": external id");
    for (const f of ["title", "summary", "entity"]) assert.ok(!CONTACT.test(r[f] || ""), `${id}: contact data in ${f}: ${r[f]}`);
    assert.ok(String(r.summary || "").length <= 200, id + ": excerpt ≤ 200 characters");
    assert.equal(r.value, undefined, id + ": no value invented (no list shows one)");
    for (const d of ["deadline", "published"]) if (r[d]) assert.ok(parseDate(r[d]), `${id}: ${d} parses: ${r[d]}`);
    const it = normalise(r, SEED[id], NOW);
    if (r._raw !== undefined && !/^status:active\b/.test(r._raw)) { assert.equal(it, null, id + ": a non-active row is dropped by normalise (filter_re)"); continue; }
    assert.ok(it, id + ": normalise() accepts the record");
    assert.ok(KINDS.includes(it.kind) && MARKETS[it.market], `${id}: kind ${it.kind} / market ${it.market}`);
    assert.ok(!it.summary_orig || it.summary_orig.length <= 200);
  }
  const uniq = [...new Map(recs.map(r => [r.ext_id, r])).values()];
  assert.equal(new Set(uniq.map(r => canonicalUrl(r.url))).size, uniq.length, id + ": distinct canonical links (URL dedupe must not merge notices)");
}

test("registry: one adapter per source, paging within engine limits and equal to the seeds", () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), ["ci-dgmp", "gh-ghaneps", "isdb-tenders", "ly-noc-tenders"]);
  for (const [id, a] of Object.entries(ADAPTERS)) {
    assert.equal(typeof a.parse, "function");
    assert.equal(a.fetch ? a.fetch.pages : 1, SEED[id].mapping.pages || 1, id + ": fetch.pages = seed mapping.pages");
    if (a.fetch) assert.ok(a.fetch.pages >= 1 && a.fetch.pages <= 5);
  }
  assert.equal(srcFor("isdb-tenders", 1).endpoint, "https://www.isdb.org/project-procurement/tenders?page=0");
  assert.equal(srcFor("gh-ghaneps", 2).endpoint, "https://www.ghaneps.gov.gh/epps/quickSearchAction.do?d-3680175-p=2&searchSelect=1&T01_ps=50");
});

test("helpers: dates in every source format (EN/FR/AR months, Ghana time), market keys", () => {
  assert.deepEqual(["24 August 2025", "3 septembre 2026", "1er décembre 2026", "9 ديسمبر 2026", "31 February 2026", ""].map(dMonthY), ["2025-08-24", "2026-09-03", "2026-12-01", "2026-12-09", "", ""]);
  assert.deepEqual(["Dec 15, 2026", "December 1, 2026", "Nov 9, 2026", "Sept. 3 2026", "N/A"].map(monthDY), ["2026-12-15", "2026-12-01", "2026-11-09", "2026-09-03", ""]);
  assert.deepEqual(["02/12/2026 11:00:00", "13-12-2026", "1.2.2027", "31/02/2026"].map(dmyDate), ["2026-12-02", "2026-12-13", "2027-02-01", ""]);
  assert.equal(dmyTimeIso("17/11/2026 15:56:54"), "2026-11-17T15:56:54.000Z"); // Ghana = GMT
  assert.equal(dmyTimeIso("17/11/2026 15:56", 120), "2026-11-17T13:56:00.000Z");
  assert.equal(dmyTimeIso("17/11/2026"), "2026-11-17");
  assert.equal(marketFor(marketKey("Kyrgyz")), "asia:kg"); assert.equal(marketFor(marketKey("Cote D'Ivoire")), "africa:ci");
  assert.equal(marketFor(marketKey("Gambia")), "africa:gm"); assert.equal(marketFor(marketKey("Bahrain")), "bh"); assert.equal(marketKey("Bosnia & Herzegovina"), "Bosnia & Herzegovina");
  assert.equal(txt("Sélection d&amp;#039;un cabinet"), "Sélection d'un cabinet");
});

test("personal data: e-mails, phones (GH/CI/LY/intl), national IDs and named contact persons are stripped; refs, dates, values stay", () => {
  const s = clean("Contact Mr. Kwame Mensah on 024 412 3456 or 0912345678, kwame.mensah@gmail.com, Ghana Card GHA-123456789-0. Ref. AOO26110434150, deadline 02-12-2026, value GHS 1,250,000.00");
  assert.ok(!/Kwame|Mensah|024 412|0912345678|@|GHA-1/.test(s), s);
  assert.ok(s.includes("AOO26110434150") && s.includes("02-12-2026") && s.includes("1,250,000.00"), s);
  const f = clean("Personne à contacter : M. Kouassi Jean, tél. 07 07 12 34 56 / +225 27 20 21 22 23, CNI C 0012 3456 78. Lot 2 – PRQ/JPT/40/26 – 09/2026");
  assert.ok(!/Kouassi|07 07|\+225|0012 3456/.test(f), f); assert.ok(f.includes("PRQ/JPT/40/26") && f.includes("09/2026"), f);
  const a = clean("للتواصل: المهندس أحمد علي هاتف 091-2345678 الرقم الوطني 119900112233 مناقصة رقم 12/2026");
  assert.ok(!/أحمد|091-2345678|119900112233/.test(a), a); assert.ok(a.includes("12/2026"), a);
  assert.equal(clean("Construction of 1No. 6-Unit Classroom Block (Lot 3) – 2026"), "Construction of 1No. 6-Unit Classroom Block (Lot 3) – 2026");
});

test("IsDB: every page read (closed notices first, ?status= ignored), only Active kept, classes, deadlines, markets", async () => {
  const p = [0, 1, 2, 3].map(i => FX(PAGES["isdb-tenders"][i]));
  const p0 = await parse("isdb-tenders", p[0], 1), p1 = await parse("isdb-tenders", p[1], 2), p2 = await parse("isdb-tenders", p[2], 3), p3 = await parse("isdb-tenders", p[3], 4);
  assert.deepEqual([p0.length, p1.length, p2.length, p3.length], [50, 50, 46, 0], "with filter_re every row is returned (status in _raw); the page after the last says «No results»");
  assert.ok(p0.every(r => r._raw.startsWith("status:closed")), "page 0 holds closed notices only");
  assert.equal(p1.filter(r => r._raw.startsWith("status:active")).length, 16);
  /* why the seed needs filter_re: without it the parser returns only active rows, page 0 yields none and the engine
     stops paging there */
  assert.equal((await parse("isdb-tenders", p[0], 1, { filter_re: undefined })).length, 0);
  assert.equal((await parse("isdb-tenders", p[1], 2, { filter_re: undefined })).length, 16);
  assert.equal((await fetchAll("isdb-tenders", { filter_re: undefined })).fetched, 1);
  const run = await fetchAll("isdb-tenders");
  assert.equal(run.fetched, 4, "pages 0–3 read; the empty page 3 ends the paging");
  const recs = run.all;
  common("isdb-tenders", recs);
  const kept = engineKeep("isdb-tenders", recs);
  assert.equal(kept.length, 54, "54 distinct active notices (pages overlap by 8 rows; ids dedupe them)");
  const active = [...new Map(recs.filter(r => r._raw.startsWith("status:active")).map(r => [r.ext_id, r])).values()];
  const by = k => active.filter(r => r.kind_hint === k);
  assert.deepEqual([by("tender").length, by("project").length, by("award").length], [11, 22, 21]);
  assert.ok(by("tender").every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.deadline)) && [...by("project"), ...by("award")].every(r => r.deadline === ""), "deadline only on tender notices");
  assert.ok(by("project").every(r => /Closing date \d{1,2} \w+ \d{4}/.test(r.summary)), "a GPN's listing date is quoted, not stored as a bid deadline");
  const kano = active.find(r => r.ext_id === "4322");
  assert.deepEqual({ t: kano.title, u: kano.url, d: kano.deadline, c: kano.country, s: kano.summary, k: kano.kind_hint }, { t: "Construction of Roads, Drainages, Culverts, Common Infrastructure and Utilities at AIH Bagauda Kano", u: "https://www.isdb.org/project-procurement/tenders/2026/spn/construction-roads-drainages-culverts-common-infrastructure-and-utilities-aih", d: "2026-12-09", c: "Nigeria", s: "Specific Procurement Notice · Nigeria", k: "tender" });
  const fr = active.find(r => r.ext_id === "4329");
  assert.match(fr.url, /^https:\/\/www\.isdb\.org\/project-procurement\/fr\/appels-doffres\/2026\/spn\//); assert.equal(fr.deadline, "2026-12-22"); assert.equal(fr.lang, "fr");
  assert.equal(active.find(r => r.ext_id === "4262").kind_hint, "award", "«RESULTATS DE L'AVIS DE PRÉQUALIFICATION…» is a result, not a call");
  const rbf = (await parse("isdb-tenders", p[1].replace("Construction of Roads, Drainages, Culverts, Common Infrastructure and Utilities at AIH Bagauda Kano</a>", "Results-Based Financing for Rural Roads at AIH Bagauda Kano</a>"), 2)).find(r => r.ext_id === "4322");
  assert.equal(rbf.kind_hint, "tender", "a call whose title starts with «Results-Based …» stays a tender");
  assert.equal(active.find(r => r.ext_id === "4274").kind_hint, "project", "King Faisal Highway (Bahrain) GPN");
  const m = it => kept.find(x => x.ext_id === it).market;
  assert.deepEqual(["4322", "4274", "4339", "4334", "4262"].map(m), ["africa:ng", "bh", "asia:kg", "asia:id", "africa:ci"]);
  const kinds = new Set(kept.map(i => i.kind)); assert.deepEqual([...kinds].sort(), ["project", "project_news", "tender_gov"]);
  assert.ok(kept.every(i => i.status !== "closed"));
});

test("GHANEPS: rows in «Bid Submission» only, public notice links, GMT publication instants, thin titles completed", async () => {
  const p1 = await parse("gh-ghaneps", FX(PAGES["gh-ghaneps"][0]), 1), p2 = await parse("gh-ghaneps", FX(PAGES["gh-ghaneps"][1]), 2);
  assert.equal(p1.length, 50); assert.equal(p2.length, 37, "page 2: 37 of 50 still open (11 «Evaluation», 2 «Awaiting Bid Opening» skipped)");
  const recs = await records("gh-ghaneps");
  common("gh-ghaneps", recs);
  const r0 = recs.find(r => r.ext_id === "4022991");
  assert.deepEqual({ t: r0.title, u: r0.url, e: r0.entity, d: r0.deadline, p: r0.published, s: r0.summary, k: r0.kind_hint }, { t: "Construction of 1No 2-Storey 5No Bedroom MCE’s Bungalow at Afiaman", u: "https://www.ghaneps.gov.gh/epps/cft/prepareViewCfTWS.do?resourceId=4022991", e: "GA NORTH MUNICIPAL ASSEMBLY", d: "2026-12-02", p: "2026-11-17T15:56:54.000Z", s: "National Competitive Tendering", k: "tender" });
  assert.equal(recs.find(r => r.ext_id === "3872995").title, "Station Wagon – SUPPLY AND DELIVERY OF SUV (STATION WAGON)");
  assert.equal(recs.find(r => r.ext_id === "3914789").title, "Bridges – Construction of 3No. Footbridge");
  assert.equal(recs.find(r => r.ext_id === "3872995").kind_hint, "semi", "Ghana Water Company Limited");
  assert.equal(recs.find(r => r.ext_id === "3893752").proc_group, "CS", "Quality-Cost Based Selection with EOI");
  assert.match(recs.find(r => r.ext_id === "4005458").summary, /^Extension of 10No\. portable water .* · National Competitive Tendering$/, "the notice description, when it adds to the title");
  assert.ok(recs.every(r => r.country === "Ghana" && r.published.endsWith("Z")));
  const kept = engineKeep("gh-ghaneps", recs);
  assert.equal(kept.length, 87); assert.ok(kept.every(i => i.market === "africa:gh"));
  assert.deepEqual([...new Set(kept.map(i => i.kind))].sort(), ["tender_gov", "tender_semi"]);
});

test("DGMP: open notices only, newest first, list link kept distinct by reference, titles from the list's own fields", async () => {
  const recs = await records("ci-dgmp");
  assert.equal(recs.length, 241, "closing on/after the newest publication date on the page (2026-11-13)");
  common("ci-dgmp", recs);
  assert.ok(recs.every(r => r.deadline >= "2026-11-13"));
  for (let i = 1; i < recs.length; i++) assert.ok(recs[i - 1].published >= recs[i].published, "newest publication first");
  const g = recs.find(r => r.ext_id === "AOO26110434150");
  assert.deepEqual({ t: g.title, u: g.url, e: g.entity, p: g.published, d: g.deadline, s: g.summary, pg: g.proc_group }, { t: "Travaux : Construction et rehabilitation – COMMUNE DE GUIGLO (réf. AOO26110434150)", u: "https://www.marchespublics.ci/appel_offre?ao=AOO26110434150", e: "COMMUNE DE GUIGLO", p: "2026-11-13", d: "2026-12-18", s: "Réf. AOO26110434150 · Travaux · date limite 18-12-2026", pg: "CW" });
  assert.equal(recs.find(r => r.ext_id === "AOO26061927191").title, "Travaux : Signalisation routière – COMMUNE DE MINIGNAN", "a unique title gets no reference suffix");
  const sotra = recs.find(r => r.ext_id === "AOO26101632482");
  assert.equal(sotra.kind_hint, "semi"); assert.equal(sotra.proc_group, "GO"); assert.match(sotra.title, /^Fourniture de véhicule – SOCIETE DES TRANSPORTS ABIDJANAIS \(SOTRA\)/);
  assert.equal(recs.find(r => r.ext_id === "AMI26110334120").proc_group, "CS");
  assert.ok(!recs.some(r => /^[PFTS] \d+\/20(?:22|23)$/.test(r.ext_id)), "2022–2023 notices are not kept");
  assert.equal(new Set(recs.map(r => new URL(r.url).origin + new URL(r.url).pathname)).size, 1, "every link opens the official list");
  const kept = engineKeep("ci-dgmp", recs);
  assert.equal(kept.length, LIMITS.maxItemsPerSource, "229 still open at NOW; the engine keeps the newest 120");
  assert.ok(kept.every(i => i.market === "africa:ci" && i.lang === "fr"));
});

test("NOC: one record per notice (desktop and mobile copies), operator as entity, expiry as deadline", async () => {
  const html = FX(PAGES["ly-noc-tenders"][0]);
  assert.equal((html.match(/<tr\b[^>]*class="el-item/g) || []).length, 20, "the page holds every row twice");
  const recs = await records("ly-noc-tenders");
  assert.equal(recs.length, 10);
  common("ly-noc-tenders", recs);
  const r0 = recs[0];
  assert.deepEqual({ t: r0.title, u: r0.url, e: r0.entity, d: r0.deadline, x: r0.ext_id }, { t: "Mellitah Oil & Gas B.V. Libyan Branch – Invitation for Pre-Qualification – PRQ/JPT/40/26", u: "https://noc.ly/en/tenders/mellitah-oil-gas-b-v-libyan-branch-invitation-for-pre-qualification-prq-jpt-40-26/", e: "Mellitah Oil & Gas B.V. Libyan Branch", d: "2026-12-15", x: "mellitah-oil-gas-b-v-libyan-branch-invitation-for-pre-qualification-prq-jpt-40-26" });
  const eni = recs.find(r => r.entity === "Eni North Africa B.V. Libyan Branch");
  assert.equal(eni.title, "Eni North Africa B.V. Libyan Branch – 2D & 3D MARINE SEISMIC ACQUISITION SERVICE (Offshore Area O1 of the Sirte Basin)");
  assert.ok(recs.every(r => !/Title:|Expiry date:/.test(r.title)), "mobile-copy labels never leak");
  assert.deepEqual([...new Set(recs.map(r => r.entity))].sort(), ["Akakus Oil Operations Company", "Arabian Gulf Oil Company", "Eni North Africa B.V. Libyan Branch", "Mellitah Oil & Gas B.V.", "Mellitah Oil & Gas B.V. Libyan Branch", "Mellitah Oil & Gas B.V.-Libya"]);
  const kept = engineKeep("ly-noc-tenders", recs);
  assert.equal(kept.length, 7, "3 notices already expired on 2026-11-18 are closed by the engine");
  assert.ok(kept.every(i => i.kind === "tender_semi" && i.market === "ly"));
  await assert.rejects(parse("ly-noc-tenders", FX("noc-page2-cloudflare-challenge-403.html.gz")), /bot-challenge page/);
});

test("personal data in a real row is stripped (fixtures with injected contacts)", async () => {
  const gh = FX(PAGES["gh-ghaneps"][0]).replace("title='Construction of 1No 2-Storey 5No Bedroom MCE’s Bungalow at Afiaman'", "title='Bungalow at Afiaman. Contact Mr. Kofi Boateng on 024 412 3456, kofi.boateng@gmail.com, Ghana Card GHA-123456789-0'").replace("GA NORTH MUNICIPAL ASSEMBLY", "GA NORTH MUNICIPAL ASSEMBLY (Tel: 0302 123 456)");
  const g = (await parse("gh-ghaneps", gh, 1)).find(r => r.ext_id === "4022991");
  assert.ok(!/Kofi|Boateng|024 412|@|GHA-|0302/.test(g.summary + " " + g.entity + " " + g.title), g.summary + " | " + g.entity);
  assert.match(g.summary, /Bungalow at Afiaman/); assert.equal(g.entity, "GA NORTH MUNICIPAL ASSEMBLY");
  const ci = FX("ci-dgmp-appel_offre.html.gz").replace("<td>COMMUNE DE GUIGLO</td>", "<td>COMMUNE DE GUIGLO – contact : M. Koffi Yao 07 07 12 34 56 koffi.yao@yahoo.fr</td>");
  const c = (await parse("ci-dgmp", ci)).find(r => r.ext_id === "AOO26110434150");
  assert.equal(c.entity, "COMMUNE DE GUIGLO"); assert.ok(!/Koffi|07 07|@/.test(c.title), c.title);
  const noc = FX(PAGES["ly-noc-tenders"][0]).replace("Invitation for Pre-Qualification &#8211; PRQ/JPT/40/26", "Invitation for Pre-Qualification &#8211; PRQ/JPT/40/26 (send to tenders.dept@mellitah.ly, +218 21 335 0001)");
  const n = (await parse("ly-noc-tenders", noc))[0];
  assert.equal(n.title, "Mellitah Oil & Gas B.V. Libyan Branch – Invitation for Pre-Qualification – PRQ/JPT/40/26 (send to)");
  const isdb = FX(PAGES["isdb-tenders"][1]).replace("at AIH Bagauda Kano</a>", "at AIH Bagauda Kano – focal person: Dr. Musa Ibrahim, musa.ibrahim@isdb.org, +234 803 123 4567</a>");
  const i = (await parse("isdb-tenders", isdb, 2)).find(r => r.ext_id === "4322");
  assert.equal(i.title, "Construction of Roads, Drainages, Culverts, Common Infrastructure and Utilities at AIH Bagauda Kano");
  assert.equal(stripContacts("x"), "x");
});

test("robots.txt as served: list paths allowed for our UA; GHANEPS robots.txt redirects to HTML (no rules); DGMP 404", async () => {
  const isdb = parseRobots(TXT("robots-www.isdb.org.txt"));
  assert.equal(robotsAllows(isdb, "/project-procurement/tenders?page=0"), true); assert.equal(robotsAllows(isdb, "/node/3356"), false); assert.equal(isdb.delay, null);
  const noc = parseRobots(TXT("robots-noc.ly.txt"));
  assert.equal(robotsAllows(noc, "/en/tenders/"), true); assert.equal(robotsAllows(noc, "/wp-admin/"), false);
  const gh = parseRobots(FX("ghaneps-robots-redirect-home.html.gz"));
  assert.deepEqual(gh.rules, []); assert.equal(robotsAllows(gh, "/epps/quickSearchAction.do?d-3680175-p=1&searchSelect=1&T01_ps=50"), true);
  const ci = await robotsFor("https://www.marchespublics.ci/appel_offre", { KV: makeKV() }, async () => new Response("<h1>404 Page Not Found</h1>", { status: 404 }));
  assert.equal(robotsAllows(ci, "/appel_offre"), true);
});

test("layout changes throw explicit errors; empty pages end the paging", async () => {
  await assert.rejects(parse("isdb-tenders", "<html><body>maintenance</body></html>"), /IsDB layout changed/);
  await assert.rejects(parse("gh-ghaneps", "<html><body><h2>Simple search</h2></body></html>", 1), /GHANEPS layout changed/);
  assert.deepEqual(await parse("gh-ghaneps", "<html><body><p>Nothing found to display.</p></body></html>", 2), []);
  await assert.rejects(parse("ci-dgmp", "<html><table id=\"other\"></table></html>"), /DGMP layout changed/);
  await assert.rejects(parse("ly-noc-tenders", "<html><table><tr><td>x</td></tr></table></html>"), /NOC layout changed/);
  const t = FX("ghaneps-quicksearch-p1.html.gz").replace("<th>Status", "<th>Phase");
  await assert.rejects(parse("gh-ghaneps", t, 1), /header columns/);
});
