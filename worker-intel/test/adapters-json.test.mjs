/* src/adapters/json.js — real API responses saved on 2026-11-18 with the bot UA (test/fixtures/json/). Arrays are trimmed to a
   representative subset; officials' personal data (Kenya created_by / team_members / subscribers, Uganda initiated_by, OCDS
   contact points and contact sentences, award suppliers) was replaced by obvious placeholders before saving, so the tests
   can prove that none of it reaches a record. fr-boamp-records.json comes from the research step (BOAMP is disabled:
   robots.txt) and keeps only the listing fields. Every record goes through the real engine.normalise(). */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { ADAPTERS, SEED_PATCHES, mapOcdsReleases, OCDS_FTS, parseWbContractAwards, legalEntityName, dropContactSentences, pastOrEmpty, ocdsCpv } from "../src/adapters/json.js";
import { normalise, parseRobots, robotsAllows, fillTemplate, LIMITS } from "../src/engine.js";
import { MARKETS } from "../src/markets.js";
import { KINDS } from "../src/util.js";

const here = dirname(fileURLToPath(import.meta.url)), FXD = join(here, "fixtures", "json");
const FX = n => readFileSync(join(FXD, n), "utf8");
const seeds = JSON.parse(readFileSync(join(here, "..", "seeds", "sources.json"), "utf8"));
const NOW = Date.parse("2026-11-18T12:00:00Z");
const FIXTURE = {
  "wb-projects-eg": "wb-projects-v3-eg.json", "wb-projects-v3": "wb-projects-v3-africa-mena.json", "wb-financesone-contract-awards": "wb-financesone-awards-eg.json",
  "za-etenders-ocds": "za-etenders-ocds.json", "ke-ppip": "ke-ppip-active.json", "ug-gpp": "ug-gpp-bid-invitations.json",
  "uk_find_a_tender_ocds": "uk-fts-ocds.json", "uk_contracts_finder_ocds": "uk-contracts-finder-ocds.json", "hcww-tenders": "hcww-tender-posts.json", "fr_boamp_api": "fr-boamp-records.json",
};
/* the seed row as the engine will see it once SEED_PATCHES is merged into seeds/sources.json (mapping parsed, test clock) */
const SRC = id => { const base = seeds.find(s => s.id === id) || { id }; const p = SEED_PATCHES[id]; return { ...base, ...p, id, mapping: { ...(p.mapping || {}) }, now: NOW }; };
async function run(id, text = FX(FIXTURE[id])) {
  const src = SRC(id), recs = await ADAPTERS[id].parse(text, src, undefined);
  return { src, recs, items: recs.map(r => normalise(r, src, NOW)).filter(Boolean) };
}
const KEYS = ["ext_id", "title", "url", "published", "deadline", "entity", "country", "summary", "value", "currency", "cpv", "notice_type", "proc_group", "proc_method", "buyer_type", "market_hint", "tag"].sort();
/* the placeholders the fixtures carry where personal data was, plus any e-mail address at all */
const PII = /example\.invalid|REDACTED|\+00 0000 000000|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i;
const PERSON_SUPPLIER = /INDIVIDUAL CONSULTANT/;   // the World Bank's own placeholder for a natural-person supplier (case-sensitive: "Individual Consultant Selection" is a method)
/* a date the item can show: publication, deadline, or (World Bank pipeline) the planned board-approval date in the excerpt */
const dated = it => it.published_at || it.deadline || /\b20\d\d-\d\d-\d\d\b/.test(it.summary_orig || "");

test("batch covers exactly the 10 json sources, each with a fixture, a seed patch and fetch hints the engine can honour", () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), Object.keys(FIXTURE).sort());
  assert.deepEqual(Object.keys(SEED_PATCHES).sort(), Object.keys(FIXTURE).sort());
  for (const [id, p] of Object.entries(SEED_PATCHES)) {
    assert.ok(seeds.some(s => s.id === id), id + " exists in seeds/sources.json");
    assert.equal(typeof ADAPTERS[id].parse, "function");
    assert.ok(KINDS.includes(p.kind), id + " kind"); assert.ok(MARKETS[p.market], id + " market code " + p.market);
    assert.equal(p.parser, "json"); assert.ok(["A", "B", "C"].includes(p.schedule));
    assert.equal(ADAPTERS[id].fetch.pages, p.mapping.pages, id + " pages hint = mapping.pages");
    assert.ok(p.mapping.pages >= 1 && p.mapping.pages <= 5, "engine caps pages at 5");
    if (p.mapping.pages > 1) assert.match(p.endpoint || "", /\{\{page0?\}\}/, id + " paginates through {{page}}");
    if (p.enabled) assert.equal(p.disabled_reason, null); else assert.ok(p.disabled_reason && p.disabled_reason.length > 30, id + " has a precise reason");
  }
});

test("every adapter: real fixture → ≥ 1 item with title, official https link and a date, accepted by normalise()", async () => {
  for (const id of Object.keys(ADAPTERS)) {
    const { recs, items } = await run(id);
    assert.ok(recs.length >= 1, id + ": raw records");
    assert.equal(items.length, recs.length, id + ": normalise() accepts every record");
    for (const r of recs) {
      assert.deepEqual(Object.keys(r).sort(), KEYS, id + ": record shape");
      for (const [k, v] of Object.entries(r)) assert.ok(k === "cpv" ? Array.isArray(v) : typeof v === "string" || typeof v === "number", id + "." + k + " is a string/number");
    }
    for (const it of items) { assert.ok(it.title_orig.length > 3, id + " title"); assert.match(it.url, /^https:\/\/[^\s]+$/, id + " url"); assert.ok(KINDS.includes(it.kind)); }
    assert.ok(items.some(dated), id + ": at least one dated item");
    assert.ok(items.every(it => !it.summary_orig || it.summary_orig.length <= 200), id + ": excerpt ≤ 200 chars");
    assert.equal(new Set(items.map(i => i.id)).size, items.length, id + ": stable unique ids");
  }
});

test("personal data never reaches a record (officials, contact points, individual consultants)", async () => {
  for (const id of Object.keys(ADAPTERS)) {
    const { recs } = await run(id);
    assert.doesNotMatch(JSON.stringify(recs), PII, id + ": no placeholder / e-mail in any field");
    assert.doesNotMatch(JSON.stringify(recs), PERSON_SUPPLIER, id + ": no individual-consultant supplier");
  }
  // the fixtures really do carry those structures (redacted), so the assertion above is meaningful
  const ke = JSON.parse(FX(FIXTURE["ke-ppip"]));
  assert.ok(ke.data.some(r => r.created_by && r.created_by.id_number && r.created_by.phone), "Kenya fixture keeps created_by (redacted values)");
  assert.ok(ke.data.some(r => Array.isArray(r.team_members) && r.team_members.length), "Kenya fixture keeps team_members (redacted)");
  assert.ok(JSON.parse(FX(FIXTURE["ug-gpp"])).data.data.every(r => r.initiated_by === "REDACTED PERSON"), "Uganda initiated_by present (redacted)");
  assert.ok(JSON.parse(FX(FIXTURE["uk_find_a_tender_ocds"])).releases.some(r => (r.parties || []).some(p => p.contactPoint)), "FTS contact points present (redacted)");
  assert.ok(FX(FIXTURE["wb-financesone-contract-awards"]).includes("INDIVIDUAL CONSULTANT"), "awards fixture has individual consultants");
});

test("World Bank projects v3: Egypt + Africa/MENA, pipeline vs active dates, official project link, regional → africa", async () => {
  const eg = await run("wb-projects-eg");
  const pipe = eg.recs.find(r => r.ext_id === "P517139"), act = eg.recs.find(r => r.ext_id === "P514501");
  assert.equal(pipe.published, "", "a pipeline project has no publication date (its board date is only planned)");
  assert.match(pipe.summary, /pipeline project · Egypt, Arab Republic of · planned board approval 2026-12-21/);
  assert.equal(act.published, "2026-05-07"); assert.equal(act.value, 1000000000); assert.equal(act.currency, "USD");
  assert.equal(pipe.entity, "Minister of Planning and Economic Development");
  assert.ok(eg.items.every(i => i.market === "eg" && i.kind === "project" && /^https:\/\/projects\.worldbank\.org\/en\/projects-operations\/project-detail\/P\d+$/.test(i.url)));
  const raw = JSON.parse(FX(FIXTURE["wb-projects-v3"]));
  assert.ok(Object.values(raw.projects).some(p => p.countrycode.includes("EG")), "fixture holds an Egypt row");
  const v3 = await run("wb-projects-v3");
  assert.ok(v3.recs.every(r => r.published === "" && /planned board approval 20\d\d-\d\d-\d\d/.test(r.summary)), "pipeline: planned date in the excerpt, not as a publication date");
  assert.ok(!v3.recs.some(r => r.ext_id === "P517139"), "Egypt rows are left to wb-projects-eg");
  assert.ok(v3.items.some(i => i.market === "africa:ke") && v3.items.some(i => i.market === "africa:za"));
  assert.ok(v3.items.some(i => i.market === "africa" && /Africa/.test(i.country)), "regional Western/Eastern Africa projects → market africa");
  const dropped = JSON.stringify({ projects: { P1: { id: "P1", project_name: "Dropped one", status: "Dropped", countrycode: ["KE"] } } });
  assert.equal((await run("wb-projects-v3", dropped)).recs.length, 0, "dropped / closed projects are skipped");
});

test("Finances One DS00005: one award per contract, project_news, unique official record link, companies only", async () => {
  const { recs, items } = await run("wb-financesone-contract-awards");
  const raw = JSON.parse(FX(FIXTURE["wb-financesone-contract-awards"])).data;
  assert.equal(recs.length, new Set(raw.map(r => r.wb_contract_number)).size, "joint-venture rows merged");
  const jv = recs.find(r => r.ext_id === "DS00005:1905032");
  assert.match(jv.summary, /supplier: SAMCRETE EGYPT - ENGINEERS & CONTRACTORS – S\.A\.E \(Egypt, Arab Republic of\) \+ FEERUM S A \(Poland\)/);
  assert.equal(jv.value, 14067838.15); assert.equal(jv.tag, "award"); assert.equal(jv.notice_type, "Contract Award");
  assert.ok(items.every(i => i.kind === "project_news" && i.tag === "award"), "award is project news, keeps the adapter's 'award' tag (never tender_news)");
  assert.ok(items.some(i => i.market === "eg") && items.some(i => i.market === "africa:rw"), "market from the borrower country");
  assert.equal(new Set(items.map(i => i.url_norm)).size, items.length, "per-contract link → URL dedupe cannot merge awards");
  assert.match(jv.url, /^https:\/\/datacatalogapi\.worldbank\.org\/dexapps\/fone\/api\/apiservice\?datasetId=DS00005&resourceId=RS00005&type=json&filter=wb_contract_number%3D'1905032'$/);
  const ics = recs.filter(r => /Individual Consultant Selection/.test(r.proc_method));
  assert.ok(ics.length >= 1 && ics.every(r => !/supplier:/.test(r.summary)), "individual consultants: no supplier at all");
  // a direct-selection hire of a natural person (synthetic name) never shows the supplier
  const person = JSON.stringify({ data: [{ ...raw[0], wb_contract_number: "999", procurement_method: "Direct Selection", contract_description: "Hiring a project Director", supplier: "JOHN QUINCY SMITH" },
    { ...raw[0], wb_contract_number: "998", procurement_method: "Direct Selection", contract_description: "Advisory services phase 6", supplier: "MARIA GARCIA LOPEZ" }] });
  const p = parseWbContractAwards(person, { now: NOW });
  assert.equal(p.length, 2); assert.ok(p.every(r => !/SMITH|GARCIA|supplier:/.test(r.summary)), "natural persons are never named");
  assert.equal(legalEntityName("EGYPT SCIENTIFIC COMPANY."), "EGYPT SCIENTIFIC COMPANY."); assert.equal(legalEntityName("FEERUM S A"), "FEERUM S A");
  assert.equal(legalEntityName("CTS FOR CHEMICALS & TECHNICAL SERVICES"), "CTS FOR CHEMICALS & TECHNICAL SERVICES");
  assert.equal(legalEntityName("INDIVIDUAL CONSULTANT"), ""); assert.equal(legalEntityName("JOHN QUINCY SMITH"), ""); assert.equal(legalEntityName("Sa'id Ahmed"), "");
});

test("OCDS South Africa: subject as title, bidders' lists skipped, RFQ and SOE kinds, advert document as link", async () => {
  const raw = JSON.parse(FX(FIXTURE["za-etenders-ocds"])).releases;
  const { recs, items } = await run("za-etenders-ocds");
  const part = raw.find(r => r.tender.procurementMethodDetails === "Participation");
  assert.ok(part, "fixture holds a 'Participation' release"); assert.ok(!recs.some(r => r.ext_id === part.ocid), "publication of bidders' names is not an opportunity");
  const r0 = recs.find(r => r.ext_id === raw[0].ocid);
  assert.equal(r0.title, raw[0].tender.description.trim().replace(/\s+/g, " ").replace(/[\s,;:–—-]+$/, "")); assert.match(r0.summary, new RegExp("^Ref " + raw[0].tender.title.replace(/[/.]/g, "\\$&")));
  assert.equal(r0.deadline, raw[0].tender.tenderPeriod.endDate.slice(0, 10)); assert.equal(r0.value, "", "amount 0 is not a value");
  assert.ok(items.some(i => i.kind === "rfq"), "Request for Quotation → rfq"); assert.ok(items.some(i => i.kind === "tender_semi"), "SOE buyer → tender_semi");
  assert.ok(items.filter(i => i.kind === "tender_gov").length >= 3);
  assert.ok(recs.every(r => /^https:\/\/www\.etenders\.gov\.za\/home\/Download\?blobName=/.test(r.url) || /^https:\/\/ocds-api\.etenders\.gov\.za\/api\/OCDSReleases\/release\//.test(r.url)));
  assert.ok(items.every(i => i.market === "africa:za" && i.country === "South Africa"));
  assert.match(recs.next, /PageNumber=2/, "links.next exposed for an integrator that follows it");
});

test("OCDS UK Find a Tender: tender + tenderUpdate only, notice link, official buyer classification, CPV", async () => {
  const raw = JSON.parse(FX(FIXTURE["uk_find_a_tender_ocds"])).releases;
  const { recs, items } = await run("uk_find_a_tender_ocds");
  const tagOf = new Map(raw.map(r => [r.ocid, r.tag]));
  assert.ok(raw.some(r => r.tag.includes("award")) && raw.some(r => r.tag.includes("planning")) && raw.some(r => r.tag.includes("tenderCancellation")), "fixture mixes stages");
  assert.ok(recs.every(r => /^tender(Update)?$/.test(r.notice_type) && tagOf.get(r.ext_id).some(t => t === "tender" || t === "tenderUpdate")));
  assert.equal(recs.length, new Set(raw.filter(r => r.tag.some(t => t === "tender" || t === "tenderUpdate")).map(r => r.ocid)).size, "one record per ocid");
  assert.ok(recs.every(r => /^https:\/\/www\.find-tender\.service\.gov\.uk\/Notice\/\d{6}-2026$/.test(r.url)));
  const kir = recs.find(r => r.entity === "The Council of the Borough of Kirklees");
  assert.equal(kir.title, "Framework for the Provision of Electrical Works and Goods"); assert.equal(kir.url, "https://www.find-tender.service.gov.uk/Notice/109207-2026");
  assert.ok(kir.cpv.includes("31681410") && kir.value === 30000000 && kir.currency === "GBP" && kir.deadline === "2027-01-06");
  assert.ok(recs.some(r => r.value === "" && r.currency === ""), "no value → value and currency stay empty");
  assert.ok(items.every(i => i.market === "eu" && /^tender_/.test(i.kind)));
  assert.ok(recs.some(r => r.cpv.length) && recs.some(r => r.summary.length > 50));
  assert.match(recs.next, /cursor=/);
});

test("OCDS UK Contracts Finder: notice UUID link, amendments merged, private buyer kind", async () => {
  const raw = JSON.parse(FX(FIXTURE["uk_contracts_finder_ocds"])).releases;
  const { recs, items } = await run("uk_contracts_finder_ocds");
  assert.equal(recs.length, new Set(raw.map(r => r.ocid)).size);
  for (const r of recs) { const rel = raw.find(x => x.ocid === r.ext_id); assert.equal(r.url, "https://www.contractsfinder.service.gov.uk/Notice/" + rel.id.slice(0, 36)); }
  assert.equal(items.find(i => /Chemonics/.test(i.entity)).kind, "tender_private");
  assert.ok(items.filter(i => i.kind === "tender_gov").length >= 6);
  assert.equal(recs.find(r => /Chemonics/.test(r.entity)).value, "", "a 1 GBP placeholder is not a value");
});

test("shared OCDS mapper: latest release per ocid, cancelled skipped, contact sentences dropped, contact points ignored", () => {
  const pkg = { releases: [
    { ocid: "ocds-x-1", id: "000001-2026", date: "2026-11-10T09:00:00Z", tag: ["tender"], buyer: { id: "b", name: "Test Council" }, parties: [{ id: "b", roles: ["buyer"], contactPoint: { name: "Jane Roe", email: "jane.roe@council.example", telephone: "+44 20 7946 0000" } }],
      tender: { title: "Supply of steel pipes", description: "For queries contact Jane Roe at jane.roe@council.example. Supply of 2 km of steel pipes, DN 300.", status: "active", value: { amount: 1, currency: "GBP" }, tenderPeriod: { endDate: "2026-12-20T12:00:00Z" }, items: [{ additionalClassifications: [{ scheme: "CPV", id: "44163100" }] }] } },
    { ocid: "ocds-x-1", id: "000002-2026", date: "2026-11-12T09:00:00Z", tag: ["tenderUpdate"], buyer: { id: "b", name: "Test Council" },
      tender: { title: "Supply of steel pipes (amended)", description: "Supply of 2 km of steel pipes, DN 300.\nTel: 020 7946 0000 (Mr Roe)", status: "active", value: { amount: 250000, currency: "GBP" }, tenderPeriod: { endDate: "2027-01-10T12:00:00Z" } } },
    { ocid: "ocds-x-2", id: "000003-2026", date: "2026-11-12T10:00:00Z", tag: ["tender"], tender: { title: "Cancelled one", status: "cancelled" } },
    { ocid: "ocds-x-3", id: "000004-2026", date: "2026-11-12T11:00:00Z", tag: ["award"], tender: { title: "An award", status: "complete" } },
  ], links: { next: "https://x.example/next" } };
  const out = mapOcdsReleases(JSON.stringify(pkg), OCDS_FTS, { now: NOW });
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r.title, "Supply of steel pipes (amended)"); assert.equal(r.url, "https://www.find-tender.service.gov.uk/Notice/000002-2026");
  assert.equal(r.deadline, "2027-01-10"); assert.equal(r.value, 250000); assert.equal(r.summary, "Supply of 2 km of steel pipes, DN 300.");
  assert.doesNotMatch(JSON.stringify(out), /Roe|council\.example|7946/); assert.equal(out.next, "https://x.example/next");
  assert.deepEqual(ocdsCpv(pkg.releases[0].tender), ["44163100"]);
  assert.equal(dropContactSentences("Lot 1 pumps.\nTel: +20 2 2345 6789 (Eng. Sami)\nLot 2 valves; e-mail sami@x.example; delivery Cairo."), "Lot 1 pumps. Lot 2 valves; delivery Cairo.");
  assert.equal(pastOrEmpty("2026-12-16", NOW), ""); assert.equal(pastOrEmpty("2026-11-19", NOW), "2026-11-19"); assert.equal(pastOrEmpty("2026-11-17T09:00:00Z", NOW), "2026-11-17T09:00:00Z");
});

test("Kenya PPIP: newest first, disposals skipped, state corporations semi, impossible future dates left empty", async () => {
  const raw = JSON.parse(FX(FIXTURE["ke-ppip"])).data;
  const { recs, items } = await run("ke-ppip");
  assert.ok(raw.some(r => /disposal/i.test(r.procurement_category.title)), "fixture holds a disposal");
  assert.ok(!recs.some(r => /disposal/i.test(r.summary + " " + r.title)), "the state selling assets is not an opportunity");
  assert.equal(recs.length, raw.length - raw.filter(r => /disposal/i.test(r.procurement_category.title + r.procurement_method.title)).length);
  assert.equal(recs.find(r => r.ext_id === "303648").published, "", "published_at 2026-12-16 (later than today) → unknown");
  assert.equal(recs.find(r => r.ext_id === "313416").published, "2026-11-18"); assert.equal(recs.find(r => r.ext_id === "313416").deadline, "2026-11-30");
  assert.ok(items.filter(i => i.kind === "tender_semi").every(i => /Authority|Hospital|Board|Agency|Fund/i.test(i.entity)) && items.some(i => i.kind === "tender_semi"));
  assert.ok(items.every(i => /^https:\/\/tenders\.go\.ke\/tenders\/\d+$/.test(i.url) && i.market === "africa:ke"));
  assert.ok(recs.every(r => r.value === "" && r.currency === ""), "tender fee is not a contract value");
});

test("Uganda GPP: subject as title, estimated value in UGX, RFQ/P → rfq, parastatals semi, closed ones closed", async () => {
  const { recs, items } = await run("ug-gpp");
  const lathe = recs.find(r => r.ext_id === "98737");
  assert.match(lathe.title, /^Supply and installation of heavy-duty lathe machine/); assert.equal(lathe.value, 600000000); assert.equal(lathe.currency, "UGX");
  assert.equal(lathe.deadline, "2026-12-01"); assert.equal(lathe.published, "2026-10-20"); assert.equal(lathe.entity, "National Water & Sewerage Corporation");
  assert.equal(items.find(i => i.ext_id === "98737").kind, "tender_semi");
  assert.ok(items.some(i => i.kind === "rfq")); assert.ok(items.some(i => i.status === "closed") && items.some(i => i.status === "open"));
  assert.ok(items.every(i => /^https:\/\/gpp\.ppda\.go\.ug\/public\/bid-invitations\/tender-notice\/\d+$/.test(i.url)));
});

test("HCWW: title + UTC date + link only, buyer after the colon, Arabic, semi-government", async () => {
  const { recs, items } = await run("hcww-tenders");
  const r = recs.find(x => x.ext_id === "189323");
  assert.equal(r.title, "مناقصة عامة: شركة مياه الشرب والصرف الصحي بالمنيا"); assert.equal(r.entity, "شركة مياه الشرب والصرف الصحي بالمنيا");
  assert.equal(items.find(i => i.ext_id === "189323").published_at, "2026-09-29T11:13:17.000Z", "date_gmt (13:13 Cairo = 11:13 UTC)");
  assert.ok(recs.every(x => x.summary === "" && x.deadline === "" && x.value === ""), "the ad is a scanned image: nothing else is claimed");
  assert.ok(items.every(i => i.kind === "tender_semi" && i.market === "eg" && i.lang === "ar" && i.url.startsWith("https://www.hcww.com.eg/")));
  assert.ok(items.every(i => !/\.$/.test(i.entity || "")));
  assert.equal(SEED_PATCHES["hcww-tenders"].mapping.ai_title_only, true);
});

test("BOAMP stays disabled: robots.txt disallows the API for our bot; the adapter still parses the saved listing", async () => {
  const robots = parseRobots(readFileSync(join(FXD, "robots", "boamp-datadila.opendatasoft.com.txt"), "utf8"));
  const u = new URL(SEED_PATCHES.fr_boamp_api.endpoint || seeds.find(s => s.id === "fr_boamp_api").endpoint);
  assert.equal(u.host, "boamp-datadila.opendatasoft.com"); assert.equal(robotsAllows(robots, u.pathname + u.search), false);
  assert.equal(SEED_PATCHES.fr_boamp_api.enabled, 0); assert.match(SEED_PATCHES.fr_boamp_api.disabled_reason, /robots\.txt/);
  const { recs, items } = await run("fr_boamp_api");
  assert.equal(recs.find(r => r.ext_id === "26-110857").entity.includes("D'ADDUCTION"), true, "HTML entities decoded");
  assert.ok(items.every(i => /^https:\/\/www\.boamp\.fr\/pages\/avis\/\?q=idweb:26-\d+$/.test(i.url) && i.deadline));
});

test("enabled endpoints: allowed by each host's robots.txt (saved 2026-11-18; 404 = no rules) and templated windows", () => {
  const ROBOTS = { "tenders.go.ke": "tenders.go.ke.txt", "cdn.ppda.go.ug": "cdn.ppda.go.ug.txt", "www.hcww.com.eg": "www.hcww.com.eg.txt",
    "search.worldbank.org": null, "datacatalogapi.worldbank.org": null, "ocds-api.etenders.gov.za": null, "www.find-tender.service.gov.uk": null, "www.contractsfinder.service.gov.uk": null };
  const urls = {};
  for (const [id, p] of Object.entries(SEED_PATCHES)) {
    if (!p.enabled) continue;
    const url = fillTemplate(p.endpoint.replace(/\{\{page\}\}/g, "1"), NOW), u = new URL(url);
    assert.ok(u.host in ROBOTS, id + " host checked: " + u.host);
    if (ROBOTS[u.host]) assert.equal(robotsAllows(parseRobots(readFileSync(join(FXD, "robots", ROBOTS[u.host]), "utf8")), u.pathname + u.search), true, id + " allowed by robots.txt");
    assert.ok(!/\{\{|YYYY/.test(url), id + " fully templated"); urls[id] = url;
  }
  assert.match(urls["za-etenders-ocds"], /PageNumber=1&PageSize=100&dateFrom=2026-11-16&dateTo=2026-11-17$/, "SA: window ends yesterday (dateTo=today → HTTP 500)");
  assert.match(urls["uk_find_a_tender_ocds"], /updatedFrom=2026-11-17T00:00:00Z$/); assert.doesNotMatch(urls["uk_find_a_tender_ocds"], /stages=/);
  assert.match(urls["wb-financesone-contract-awards"], /contract_signing_date%3E%3D'2026-05-22'$/);
  assert.match(urls["ke-ppip"], /sortby=published_at&order=desc&perpage=50&page=1$/);
  assert.match(urls["uk_contracts_finder_ocds"], /publishedFrom=2026-11-16&publishedTo=2026-11-18&stages=tender&limit=100$/);
  assert.ok(Object.values(SEED_PATCHES).every(p => !p.mapping.pages || p.mapping.pages * 100 <= LIMITS.maxItemsPerSource * 2));
});
