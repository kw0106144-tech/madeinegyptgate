/* migate-intel — integration of the per-source adapters (src/adapters/*.js) into the engine: registry, seeds, the real
   seeds/sources.sql in D1, fetchSource dispatch + fetch hints, the optional notice-page hook, dedupe across lots,
   tags, disabled sources never fetched, admin force / re-enrich, and the machine-translation note.
   Fixtures are the adapter batches' saved real responses (personal data already replaced by placeholders). */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs"; import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { ADAPTERS, ADAPTER_MODULES, adapterFor, parseBody } from "../src/parsers.js";
import { fetchSource, runCycle, normalise, dueSources, DedupeIndex, applyDetail, LIMITS, DOC_HINT_TTL } from "../src/engine.js";
import { handleApi } from "../src/api.js";
import { itemHtml } from "../src/pages.js";
import { UA, KINDS, itemId } from "../src/util.js";
import { MARKETS } from "../src/markets.js";
import { ShimRewriter } from "../src/htmlshim.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const FXF = p => { const b = readFileSync(join(here, "fixtures", p)); return p.endsWith(".gz") ? gunzipSync(b).toString("utf8") : b.toString("utf8"); };
const seeds = JSON.parse(readFileSync(join(root, "seeds", "sources.json"), "utf8"));
const seed = id => seeds.find(s => s.id === id);
const NOW = Date.parse("2026-11-18T10:00:00Z");   // the day every fixture was fetched
const noGate = async () => {}, noSleep = async () => {};
const READY = ["wb-projects-eg", "wb-projects-v3", "wb-financesone-contract-awards", "za-etenders-ocds", "ke-ppip", "ug-gpp", "uk_find_a_tender_ocds", "uk_contracts_finder_ocds", "hcww-tenders",
  "ebrd-ecepp", "aiib_project_procurement", "pk_ppra_epms", "om-esnaad-public-dash", "isdb-tenders", "gh-ghaneps", "ci-dgmp", "sczone-tenders", "ida-news", "eeaa-notifications"];
const OFF = ["fr_boamp_api", "ebrd_ecepp", "ly-noc-tenders"];
/* list pages per source (in request order) and, past the last one, what an empty later page looks like */
const PAGES = {
  "wb-projects-eg": ["json/wb-projects-v3-eg.json"], "wb-projects-v3": ["json/wb-projects-v3-africa-mena.json"],
  "wb-financesone-contract-awards": ["json/wb-financesone-awards-eg.json"],
  "za-etenders-ocds": ["json/za-etenders-ocds.json", '{"releases":[]}'], "ke-ppip": ["json/ke-ppip-active.json", '{"data":[]}'],
  "ug-gpp": ["json/ug-gpp-bid-invitations.json", '{"data":{"data":[]}}'], "uk_find_a_tender_ocds": ["json/uk-fts-ocds.json"],
  "uk_contracts_finder_ocds": ["json/uk-contracts-finder-ocds.json"], "hcww-tenders": ["json/hcww-tender-posts.json"], "fr_boamp_api": ["json/fr-boamp-records.json"],
  "ebrd-ecepp": ["bigtables/ebrd-ecepp-noticeSearchResults.html.gz"], "aiib_project_procurement": ["bigtables/aiib-ppo-data-all.js.gz"],
  "pk_ppra_epms": ["bigtables/ppra-epms-active-p1.html.gz", "<html><body><p>No tenders</p></body></html>"],
  "om-esnaad-public-dash": ["bigtables/esnaad-newtenders-p1.html.gz", "<html><body><p>No tenders</p></body></html>"],
  "isdb-tenders": ["htmllists/isdb-tenders-p0.html.gz", "htmllists/isdb-tenders-p1.html.gz", "htmllists/isdb-tenders-p2.html.gz", "htmllists/isdb-tenders-p3-empty.html.gz"],
  "gh-ghaneps": ["htmllists/ghaneps-quicksearch-p1.html.gz", "htmllists/ghaneps-quicksearch-p2.html.gz"], "ci-dgmp": ["htmllists/ci-dgmp-appel_offre.html.gz"],
  "ly-noc-tenders": ["htmllists/noc-tenders-p1.html.gz"],
  "sczone-tenders": ["egypt/sczone-tenders.html.gz"], "ida-news": ["egypt/ida-news-p1.html.gz", "egypt/ida-news-p2.html.gz"], "eeaa-notifications": ["egypt/eeaa-notification-index.html.gz"],
};
const body = p => (/^[[{<]/.test(p) ? p : FXF(p));
const DETAIL = { "https://www.ida.gov.eg/ar/news/337": "egypt/ida-news-337-detail.html.gz", "https://www.eeaa.gov.eg/Notification/67/Details": "egypt/eeaa-notification-67-detail.html.gz",
  "https://www.eeaa.gov.eg/Notification/64/Details": "egypt/eeaa-notification-64-detail.html.gz", "https://www.eeaa.gov.eg/Notification/57/Details": "egypt/eeaa-notification-57-detail.html.gz" };
const hostOf = u => new URL(u).host;
/* like the Workers runtime: fetch invoked as a method of another object (o.fetchFn(...)) throws "Illegal invocation" */
const workersStrict = f => function (url, init) { if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation: function called with incorrect `this` reference"); return f(url, init); };
/* a fake network over the fixtures: the n-th list request of a source gets its n-th page; robots.txt answers 404 (no
   rules) unless overridden; notice pages from DETAIL, else 404. Every request is logged with its headers. */
function fakeNet(opts = {}) {
  const log = [], count = {};
  const byHost = {};
  for (const id of Object.keys(PAGES)) { const s = seed(id); if (s) (byHost[hostOf(s.endpoint.replace(/\{\{[^}]+\}\}/g, "1"))] ||= []).push(id); }
  const fn = async (url, init = {}) => {
    url = String(url); log.push({ url, headers: init.headers || {} });
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return opts.robots && opts.robots[u.host] != null ? new Response(opts.robots[u.host]) : new Response("not found", { status: 404 });
    if (DETAIL[url]) return new Response(FXF(DETAIL[url]));
    if (opts.override) { const o = opts.override(url, count); if (o) return o; }
    const ids = byHost[u.host] || [];
    const id = ids.length === 1 ? ids[0] : ids.find(i => url.startsWith(seed(i).endpoint.split("{{")[0]));   // e.g. two World Bank project queries on one host
    if (!id || /\/Notification\/\d+\/Details$|\/ar\/news\/\d+$/.test(u.pathname)) return new Response("not found", { status: 404 });
    const n = (count[id] = (count[id] || 0) + 1), list = PAGES[id];
    return new Response(body(list[Math.min(n, list.length) - 1]), { headers: n === 1 && opts.etag ? { etag: opts.etag } : {} });
  };
  return { fn: workersStrict(fn), log, count };
}
const rowOf = id => { const s = seed(id); return { ...s, mapping: JSON.stringify(s.mapping || {}), enabled: s.enabled === 0 ? 0 : 1 }; };

test("registry: every src/adapters/*.js module is imported, ids are unique, every adapter has a seed and vice versa", async () => {
  const files = readdirSync(join(root, "src", "adapters")).filter(f => f.endsWith(".js")).map(f => f.replace(/\.js$/, "")).sort();
  assert.deepEqual(Object.keys(ADAPTER_MODULES).sort(), files, "parsers.js imports exactly the modules in src/adapters/");
  let n = 0;
  for (const f of files) {
    const mod = await import("../src/adapters/" + f + ".js");
    for (const id of Object.keys(mod.ADAPTERS)) { n++; assert.equal(ADAPTERS[id].parse, mod.ADAPTERS[id].parse, id); assert.equal(ADAPTERS[id].module, f); }
  }
  assert.equal(Object.keys(ADAPTERS).length, n, "no id registered twice");
  assert.equal(adapterFor({ id: "ebrd_ecepp" }), null, "the duplicate EBRD seed has no adapter");
  assert.equal(adapterFor({ id: "toString" }), null, "prototype keys are not adapters");
  for (const id of Object.keys(ADAPTERS)) assert.ok(seed(id), id + " has a seed row");
  assert.deepEqual([...READY, ...OFF.filter(id => ADAPTERS[id])].sort(), Object.keys(ADAPTERS).sort());
});

test("seeds: adapter sources point at their module, valid kinds/markets, ready ones enabled, the three others disabled with a reason", () => {
  const PARSERS = ["rss", "atom", "sitemap", "json", "html", "adapter"];
  for (const s of seeds) {
    assert.ok(PARSERS.includes(s.parser), s.id + ": parser " + s.parser);
    assert.ok(KINDS.includes(s.kind), s.id + ": kind");
    if (s.enabled !== 0) assert.ok(MARKETS[s.market], s.id + ": enabled source with an unknown market " + s.market);
    if (s.parser === "adapter") assert.ok(ADAPTERS[s.id], s.id + ": parser adapter without a registered adapter");
    if (s.mapping && s.mapping.adapter) assert.equal(ADAPTERS[s.id] && ADAPTERS[s.id].module, s.mapping.adapter, s.id + ": mapping.adapter names its module");
  }
  for (const id of READY) {
    const s = seed(id), a = ADAPTERS[id];
    assert.equal(s.enabled, 1, id + " enabled"); assert.equal(s.disabled_reason, null, id);
    assert.ok(!/\{\{(?!page0?\}\}|date[+-]?\d*(?::compact)?\}\})/.test(s.endpoint) && !/YYYY/.test(s.endpoint), id + ": endpoint has only templates the engine fills");
    if (a.fetch && a.fetch.pages) assert.equal(s.mapping.pages || 1, a.fetch.pages, id + ": seed pages = adapter fetch.pages");
    if ((s.mapping.pages || 1) > 1 && !(a.fetch && a.fetch.follow_next)) assert.match(s.endpoint, /\{\{page0?\}\}/, id + ": several pages need a {{page}} endpoint");
  }
  for (const id of OFF) { const s = seed(id); assert.equal(s.enabled, 0, id); assert.ok(String(s.disabled_reason || "").length > 40, id + ": honest reason"); }
  assert.equal(seed("ebrd_ecepp").listed, 0, "the duplicate is not listed twice on /intel/sources/");
  assert.match(seed("fr_boamp_api").disabled_reason, /robots\.txt/); assert.match(seed("ly-noc-tenders").disabled_reason, /Terms of Use/);
});

test("seeds/sources.sql (the file applied to D1) is current with sources.json and is idempotent; a seed never re-enables a source", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql")), sql = readFileSync(join(root, "seeds", "sources.sql"), "utf8");
  assert.ok(!/\b(?:DROP|DELETE|TRUNCATE|ALTER)\b/i.test(sql), "upserts only");
  DB._db.exec(sql);
  const rows = (await DB.prepare("SELECT * FROM intel_sources").all()).results;
  assert.equal(rows.length, seeds.length);
  for (const s of seeds) {
    const r = rows.find(x => x.id === s.id);
    assert.equal(r.endpoint, s.endpoint, s.id); assert.equal(r.parser, s.parser, s.id); assert.equal(r.mapping, JSON.stringify(s.mapping || {}), s.id);
    assert.equal(r.enabled, s.enabled === 0 || s.enabled === false ? 0 : 1, s.id); assert.equal(r.market, s.market, s.id);
  }
  await DB.prepare("UPDATE intel_sources SET enabled=0, disabled_reason='auto-disabled after 10 consecutive failures: x', fail_count=10, last_ok_at='2026-11-17T00:00:00Z' WHERE id='ke-ppip'").run();
  DB._db.exec(sql);                                                    // re-applying keeps runtime state and admin decisions
  const ke = await DB.prepare("SELECT enabled, disabled_reason, fail_count, last_ok_at FROM intel_sources WHERE id='ke-ppip'").first();
  assert.deepEqual(ke, { enabled: 0, disabled_reason: "auto-disabled after 10 consecutive failures: x", fail_count: 10, last_ok_at: "2026-11-17T00:00:00Z" });
});

test("fetchSource dispatches every adapter source to its adapter, with the seed's paging and Accept header and the bot UA", async () => {
  for (const id of [...READY, "fr_boamp_api", "ly-noc-tenders"]) {
    const net = fakeNet(), env = { KV: makeKV() };
    const res = await fetchSource(rowOf(id), env, { fetch: net.fn, now: NOW, gate: noGate, sleep: noSleep, Rewriter: ShimRewriter });
    assert.equal(res.status, "ok", id + ": " + res.error);
    /* the same pages through the adapter directly (the source object the engine builds: endpoint per page, parsed mapping, clock) */
    const s = seed(id), pages = Math.min(s.mapping.pages || (ADAPTERS[id].fetch || {}).pages || 1, 5);
    let direct = [];
    for (let p = 1; p <= pages; p++) {
      const ep = s.endpoint.replace(/\{\{page\}\}/g, String(p)).replace(/\{\{page0\}\}/g, String(p - 1));
      const recs = await parseBody(body(PAGES[id][Math.min(p, PAGES[id].length) - 1]), { ...s, endpoint: ep, now: NOW }, ShimRewriter);
      direct = direct.concat(recs); if (!recs.length) break;
    }
    assert.equal(res.items.length, direct.length, id + ": same records as the adapter itself");
    assert.ok(res.items.length >= 1, id + ": records");
    const lists = net.log.filter(l => !/\/robots\.txt$/.test(l.url) && !DETAIL[l.url] && !/\/Notification\/\d+\/Details$|\/ar\/news\/\d+$/.test(l.url));
    assert.ok(lists.length >= 1 && lists.length <= 5, id + ": pages fetched " + lists.length);
    const accept = s.mapping.accept || ((ADAPTERS[id].fetch || {}).headers || {}).Accept;
    for (const l of lists) {
      assert.equal(l.headers["User-Agent"], UA);
      if (accept) assert.equal(l.headers.Accept, accept, id + ": Accept"); else assert.match(l.headers.Accept, /^application\/rss\+xml, .*text\/html;q=0\.8/, id + ": engine default Accept");
      assert.ok(!/\{\{/.test(l.url), id + ": templated url " + l.url);
    }
    assert.equal(net.log.filter(l => /\/robots\.txt$/.test(l.url)).length, new Set(net.log.map(l => hostOf(l.url))).size, id + ": robots.txt once per host (cached)");
    for (const r of res.items) { const it = normalise(r, { ...s, mapping: s.mapping }, NOW); if (it) assert.ok(KINDS.includes(it.kind) && MARKETS[it.market], id + ": " + it.kind + "/" + it.market); }
  }
  /* page templating as served: IsDB counts from 0, GHANEPS from 1, the date windows are filled */
  const net = fakeNet();
  await fetchSource(rowOf("isdb-tenders"), { KV: makeKV() }, { fetch: net.fn, now: NOW, gate: noGate, Rewriter: ShimRewriter });
  assert.deepEqual(net.log.filter(l => !/robots/.test(l.url)).map(l => new URL(l.url).searchParams.get("page")), ["0", "1", "2", "3"], "IsDB pages 0–3, the empty 4th ends the paging");
  const za = fakeNet();
  await fetchSource(rowOf("za-etenders-ocds"), { KV: makeKV() }, { fetch: za.fn, now: NOW, gate: noGate, Rewriter: ShimRewriter });
  assert.match(za.log.find(l => /OCDSReleases/.test(l.url)).url, /PageNumber=1&PageSize=100&dateFrom=2026-11-16&dateTo=2026-11-17$/);
});

test("fetch is always called unbound — robots.txt, list pages, retries and notice pages (Workers 'Illegal invocation')", async () => {
  const net = fakeNet({ robots: { "www.eeaa.gov.eg": "User-agent: *\nDisallow: /admin/" } });
  const env = { KV: makeKV() };
  for (const id of ["eeaa-notifications", "gh-ghaneps", "ke-ppip"]) {
    const res = await fetchSource(rowOf(id), env, { fetch: net.fn, now: NOW, gate: async () => {}, sleep: noSleep, Rewriter: ShimRewriter });
    assert.equal(res.status, "ok", id + ": " + res.error);
  }
  const rss = { id: "rss-x", kind: "news", market: "eg", parser: "rss", endpoint: "https://feeds.example/rss", mapping: "{}" };
  const feed = workersStrict(async url => /robots/.test(String(url)) ? new Response("", { status: 404 }) : new Response(FXF("rss-alborsaa.xml")));
  assert.equal((await fetchSource(rss, { KV: makeKV() }, { fetch: feed, now: NOW, gate: async () => {} })).status, "ok");
  const saved = globalThis.fetch; globalThis.fetch = feed;
  try { assert.equal((await fetchSource(rss, { KV: makeKV() }, { now: NOW, gate: async () => {} })).status, "ok", "the global fetch too"); } finally { globalThis.fetch = saved; }
});

test("disabled sources are never fetched, even when named in an admin run; unknown ids are reported", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql"));
  DB._db.exec(readFileSync(join(root, "seeds", "sources.sql"), "utf8"));
  const net = fakeNet();
  const st = await runCycle({ DB, KV: makeKV() }, { trigger: "test", sourceIds: [...OFF, "no-such-source"], fetch: net.fn, now: NOW, gate: noGate, sleep: noSleep, enrich: false });
  assert.deepEqual(st.sources.map(e => [e.id, e.status]).sort(), [["ebrd_ecepp", "skipped_disabled"], ["fr_boamp_api", "skipped_disabled"], ["ly-noc-tenders", "skipped_disabled"], ["no-such-source", "unknown_source"]]);
  assert.equal(net.log.length, 0, "no request at all");
});

test("one cycle over all 19 ready sources from the real seed SQL: stored, tagged, lots not folded, notice pages cached; a re-run only updates", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql")), KV = makeKV();
  DB._db.exec(readFileSync(join(root, "seeds", "sources.sql"), "utf8"));
  const net = fakeNet();
  const st = await runCycle({ DB, KV }, { trigger: "test", sourceIds: READY, fetch: net.fn, now: NOW, gate: noGate, sleep: noSleep, enrich: false, Rewriter: ShimRewriter });
  const by = Object.fromEntries(st.sources.map(e => [e.id, e]));
  for (const id of READY) { assert.equal(by[id].status, "ok", id + ": " + by[id].error); assert.ok(by[id].kept >= 1, id + ": kept " + by[id].kept); assert.ok(by[id].kept <= LIMITS.maxItemsPerSource); }
  assert.equal(st.ok, READY.length); assert.equal(st.failed, 0);
  const count = async (w, ...a) => (await DB.prepare("SELECT COUNT(*) AS n FROM intel_items WHERE " + w).bind(...a).first()).n;
  for (const id of READY) assert.equal(await count("source_id=?", id), by[id].new, id + ": stored = new");
  assert.equal(await count("source_id='wb-financesone-contract-awards' AND (tag IS NOT 'award' OR kind!='project_news')"), 0, "awards keep their tag");
  /* same-source lots / numbered tenders / per-company HCWW notices stay separate items */
  for (const id of READY) if (!/news/.test(seed(id).kind)) assert.equal(await count("source_id=? AND dup_of IN (SELECT id FROM intel_items WHERE source_id=?)", id, id), 0, id + ": no item folded into a sibling of the same source");
  const tcdd = (await DB.prepare("SELECT title_orig FROM intel_items WHERE source_id='aiib_project_procurement' AND title_orig LIKE '%TCDD%'").all()).results;
  assert.ok(tcdd.length >= 2, "AIIB TCDD lots: " + tcdd.length);
  /* notice pages: EEAA closing date and IDA's tender subject; at most detail.max per run, through robots.txt */
  assert.deepEqual(by["eeaa-notifications"].detail, { cached: 0, fetched: 2, failed: 2 });
  const e67 = await DB.prepare("SELECT deadline, status FROM intel_items WHERE source_id='eeaa-notifications' AND ext_id='67'").first();
  assert.deepEqual(e67, { deadline: "2026-11-30", status: "open" });
  assert.equal(await count("source_id='eeaa-notifications' AND ext_id='64'"), 0, "EOI #64 closed on 2026-11-05 (from its notice page): not stored");
  const i337 = await DB.prepare("SELECT summary_orig FROM intel_items WHERE source_id='ida-news' AND ext_id='337'").first();
  assert.match(i337.summary_orig, /^بشأن التعاقد مع احدى الشركات المتخصصة/, "IDA tender 11: the subject from its notice page");
  assert.ok(await KV.get("detail:" + itemId("eeaa-notifications", "67"), "json"), "detail cached in KV");
  const detailReqs = net.log.filter(l => /\/Notification\/\d+\/Details$|\/ar\/news\/\d+$/.test(l.url)).length;
  assert.equal(detailReqs, 4 + 3, "EEAA max 4, IDA max 3 notice pages");
  /* second run (list pages only from the cache's point of view): nothing new, the notice-page facts survive */
  const net2 = fakeNet();
  const st2 = await runCycle({ DB, KV }, { trigger: "test", sourceIds: READY, fetch: net2.fn, now: NOW + 3600e3, gate: noGate, sleep: noSleep, enrich: false, Rewriter: ShimRewriter });
  assert.equal(st2.items_new, 0); assert.equal(st2.failed, 0);
  const notice = l => /\/Notification\/\d+\/Details$|\/ar\/news\/\d+$/.test(l.url);
  const first = new Set(net.log.filter(notice).map(l => l.url)), again = net2.log.filter(notice).map(l => l.url);
  assert.ok(again.every(u => !first.has(u)), "cached notice pages are not fetched again: " + again.filter(u => first.has(u)));
  assert.deepEqual(again.sort(), ["https://www.ida.gov.eg/ar/news/334", "https://www.ida.gov.eg/ar/news/335"], "the next uncached ones are (max per run)");
  assert.deepEqual(await DB.prepare("SELECT deadline, status FROM intel_items WHERE source_id='eeaa-notifications' AND ext_id='67'").first(), { deadline: "2026-11-30", status: "open" });
  assert.match((await DB.prepare("SELECT summary_orig FROM intel_items WHERE source_id='ida-news' AND ext_id='337'").first()).summary_orig, /^بشأن التعاقد/);
  const src = await DB.prepare("SELECT fail_count, last_err, items_total FROM intel_sources WHERE id='ebrd-ecepp'").first();
  assert.equal(src.fail_count, 0); assert.equal(src.last_err, null); assert.ok(src.items_total >= 1);
});

test("Kenya PPIP run: the notices' own files are kept as KV hints «dochint:<id>» (60 days) for the stored items only; an unchanged run writes none", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql")), KV = makeKV(), puts = [], put0 = KV.put;
  KV.put = async (k, v, o) => { puts.push({ k, v, o }); return put0(k, v, o); };
  DB._db.exec(readFileSync(join(root, "seeds", "sources.sql"), "utf8"));
  const st = await runCycle({ DB, KV }, { trigger: "test", sourceIds: ["ke-ppip"], fetch: fakeNet().fn, now: NOW, gate: noGate, sleep: noSleep, enrich: false, Rewriter: ShimRewriter });
  const e = st.sources.find(x => x.id === "ke-ppip");
  assert.equal(e.status, "ok", e.error);
  const kept = new Set(((await DB.prepare("SELECT id FROM intel_items WHERE source_id='ke-ppip'").all()).results || []).map(r => r.id));
  const hintPuts = puts.filter(p => p.k.startsWith("dochint:"));
  assert.ok(hintPuts.length >= 5, "hints written: " + hintPuts.length); assert.equal(e.hints, hintPuts.length, "the run log counts them");
  for (const p of hintPuts) {
    const id = p.k.slice("dochint:".length);
    assert.ok(kept.has(id), "a hint only for an item this run stored: " + id);
    assert.deepEqual(p.o, { expirationTtl: DOC_HINT_TTL }); assert.equal(DOC_HINT_TTL, 60 * 86400);
    const v = JSON.parse(p.v);
    assert.deepEqual(Object.keys(v), ["h"]); assert.ok(v.h.length >= 1 && v.h.length <= 2);
    for (const x of v.h) { assert.deepEqual(Object.keys(x).sort(), ["t", "u"]); assert.match(x.u, /^https:\/\/tenders\.go\.ke\/storage\/Documents\//); }
  }
  /* every stored notice whose record lists a Tender Document / Notice has its hint */
  const raw = JSON.parse(FXF("json/ke-ppip-active.json")).data;
  for (const r of raw) {
    const id = itemId("ke-ppip", String(r.id)), has = (r.documents || []).some(d => !d.deleted_at && /^tender (?:document|notice)$/i.test((d.type || {}).description || ""));
    if (kept.has(id) && has) assert.ok(await KV.get("dochint:" + id), "hint for " + r.id);
    if (!kept.has(id)) assert.equal(await KV.get("dochint:" + id), null, "no hint for a notice that was not stored: " + r.id);
  }
  /* the same answer again: nothing new to write */
  const before = puts.length;
  await runCycle({ DB, KV }, { trigger: "test", sourceIds: ["ke-ppip"], fetch: fakeNet().fn, now: NOW + 3600e3, gate: noGate, sleep: noSleep, enrich: false, Rewriter: ShimRewriter });
  assert.equal(puts.slice(before).filter(p => p.k.startsWith("dochint:")).length, 0, "an unchanged hint is not written again");
});

test("fetch hints: retries with backoff on 503/429, a failing later page keeps the pages already read, cursor paging stays on the host", async () => {
  const waits = [];
  let n = 0;
  const flaky = fakeNet({ override: url => (/tenders\.go\.ke\/api/.test(url) && ++n <= 1 ? new Response("slow down", { status: 429 }) : null) });
  const r1 = await fetchSource(rowOf("ke-ppip"), { KV: makeKV() }, { fetch: flaky.fn, now: NOW, gate: noGate, sleep: async ms => waits.push(ms), Rewriter: ShimRewriter });
  assert.equal(r1.status, "ok"); assert.deepEqual(waits, [2000], "one retry after the default 2 s");
  const eg = [];
  let m = 0;
  const slow = fakeNet({ override: url => (/sczone\.eg\/tenders/.test(url) && ++m <= 2 ? new Response("down", { status: 503 }) : null) });
  const r2 = await fetchSource(rowOf("sczone-tenders"), { KV: makeKV() }, { fetch: slow.fn, now: NOW, gate: noGate, sleep: async ms => eg.push(ms), Rewriter: ShimRewriter });
  assert.equal(r2.status, "ok"); assert.deepEqual(eg, [3000, 10000], "egypt adapters: 2 retries, backoff 3 s then 10 s");
  const p2 = fakeNet({ override: url => (/ghaneps.*d-3680175-p=2/.test(url) ? new Response("bad gateway", { status: 502 }) : null) });
  const r3 = await fetchSource(rowOf("gh-ghaneps"), { KV: makeKV() }, { fetch: p2.fn, now: NOW, gate: noGate, sleep: noSleep, Rewriter: ShimRewriter });
  assert.equal(r3.status, "ok"); assert.match(r3.partial, /^page 2: HTTP 502/); assert.ok(r3.items.length >= 10, "page 1 kept");
  const p1 = fakeNet({ override: url => (/ghaneps.*d-3680175-p=1/.test(url) ? new Response("bad gateway", { status: 502 }) : null) });
  assert.equal((await fetchSource(rowOf("gh-ghaneps"), { KV: makeKV() }, { fetch: p1.fn, now: NOW, gate: noGate, sleep: noSleep, Rewriter: ShimRewriter })).status, "error", "page 1 failing fails the source");
  /* UK FTS exposes links.next (cursor); with pages > 1 the engine follows it — and only on the same host */
  const fts = { ...rowOf("uk_find_a_tender_ocds"), mapping: JSON.stringify({ ...seed("uk_find_a_tender_ocds").mapping, pages: 2 }) };
  const pkg = JSON.parse(FXF("json/uk-fts-ocds.json"));
  const seen = [];
  const cur = async (url) => { url = String(url); seen.push(url); if (/robots/.test(url)) return new Response("", { status: 404 }); return new Response(JSON.stringify(seen.length <= 2 ? { ...pkg, links: { next: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?cursor=abc" } } : { releases: [] })); };
  await fetchSource(fts, { KV: makeKV() }, { fetch: cur, now: NOW, gate: noGate, Rewriter: ShimRewriter });
  assert.equal(seen.filter(u => !/robots/.test(u)).pop(), "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?cursor=abc");
  const away = async (url) => { url = String(url); seen.push(url); if (/robots/.test(url)) return new Response("", { status: 404 }); return new Response(JSON.stringify({ ...pkg, links: { next: "https://evil.example/x" } })); };
  seen.length = 0;
  await fetchSource(fts, { KV: makeKV() }, { fetch: away, now: NOW, gate: noGate, Rewriter: ShimRewriter });
  assert.ok(!seen.some(u => /evil\.example/.test(u)), "a cursor to another host is never followed");
});

test("engine rules for adapter records: adapter tag kept, contacts stripped from titles, per-record language, detail merge", () => {
  const src = { id: "x", kind: "tender_gov", market: "intl", lang: "en", mapping: {} };
  const it = normalise({ title: "Supply of pumps — contact j.doe@example.org or +20 100 123 4567", url: "https://x.example/1", tag: "award", lang: "fr" }, src, NOW);
  assert.equal(it.title_orig, "Supply of pumps — contact or"); assert.equal(it.tag, "award"); assert.equal(it.lang, "fr");
  assert.equal(normalise({ title: "Lot 2 (Ref 2026/11)", url: "https://x.example/2", tag: "Bad Tag!" }, src, NOW).title_orig, "Lot 2 (Ref 2026/11)", "titles without contacts are untouched");
  assert.equal(normalise({ title: "Lot 2", url: "https://x.example/2", tag: "Bad Tag!" }, src, NOW).tag, null);
  const rec = { title: "Tender no. 11 …", summary: "snippet", deadline: "", entity: "IDA" };
  assert.deepEqual(applyDetail(rec, { title: "Tender no. 11 for 48 cars", summary: "subject", deadline: "2026-12-01", entity: "Other", x: { a: 1 } }), { title: "Tender no. 11 for 48 cars", summary: "subject", deadline: "2026-12-01", entity: "IDA" });
});

test("dedupe: same-source lots never fold, other sources still do, title_dedupe:false sources are URL-only", () => {
  const a = { id: "a", source_id: "aiib", kind: "tender_gov", url_norm: "aiib.org/1", title_orig: "TCDD Railway Maintenance Modernization Project – Specific Procurement Notice (SPN-TCDD.DMB-1)" };
  const b = { id: "b", source_id: "aiib", kind: "tender_gov", url_norm: "aiib.org/2", title_orig: "TCDD Railway Maintenance Modernization Project – Specific Procurement Notice (SPN-TCDD.DMB-2)" };
  assert.equal(new DedupeIndex([a]).find(b), null);
  assert.equal(new DedupeIndex([a]).find({ ...b, id: "c", source_id: "ebrd" }).id, "a", "the same notice reported by another source folds into the first");
  assert.equal(new DedupeIndex([{ ...a, source_id: "hcww" }], { noTitle: new Set(["hcww"]) }).find({ ...b, id: "c", source_id: "ebrd" }), null, "rows of a title_dedupe:false source are not title-matched");
  assert.equal(new DedupeIndex([a], { noTitle: ["hcww"] }).find({ ...b, id: "d", source_id: "hcww", url_norm: "aiib.org/1" }).id, "a", "URL matching still applies");
});

test("admin run: force runs sources that are not due without shifting the clock; source_ids limited to 25", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql")), KV = makeKV();
  DB._db.exec(readFileSync(join(root, "seeds", "sources.sql"), "utf8"));
  await DB.prepare("UPDATE intel_sources SET enabled=0").run();
  await DB.prepare("UPDATE intel_sources SET enabled=1, last_run_at=? WHERE id='hcww-tenders'").bind(new Date(Date.now() - 3600e3).toISOString()).run();
  const all = (await DB.prepare("SELECT * FROM intel_sources").all()).results;
  assert.equal(dueSources(all, ["C"], Date.now()).length, 0, "ran an hour ago: not due");
  assert.deepEqual(dueSources(all, ["C"], Date.now(), 30, true).map(s => s.id), ["hcww-tenders"], "force: due anyway");
  const net = fakeNet(), saved = globalThis.fetch;
  globalThis.fetch = net.fn;
  try {
    const env = { DB, KV, PLATFORM_KEY: "k".repeat(32) };
    const res = await handleApi(new Request("https://w.dev/api/intel/admin/run", { method: "POST", headers: { "X-Platform-Key": "k".repeat(32) }, body: JSON.stringify({ group: "C", force: true, enrich: false }) }), env, {});
    const st = await res.json();
    assert.equal(st.ok, 1, JSON.stringify(st.sources));
    const s = await DB.prepare("SELECT last_run_at FROM intel_sources WHERE id='hcww-tenders'").first();
    assert.ok(Date.parse(s.last_run_at) <= Date.now() + 1000, "last_run_at is the real time, never in the future: " + s.last_run_at);
  } finally { globalThis.fetch = saved; }
});

test("admin reenrich: a named item (hidden or not) is enriched again under the guards; hidden stays as it was", async () => {
  const DB = makeD1(join(root, "migrations", "0001_init.sql")), KV = makeKV();
  await DB.prepare("INSERT INTO intel_sources (id,name,kind,market,parser,endpoint,mapping) VALUES ('m','Masrawy','news','eg','rss','https://m.example/feed','{}')").run();
  const id = itemId("m", "https://m.example/1"), title = "\"كيما\" تؤكد زيادة سعر الغاز الطبيعي 50% بشكل مؤقت";
  await DB.prepare("INSERT INTO intel_items (id,source_id,kind,market,title_orig,title_ar,title_en,url,status,hidden,ai,first_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, "m", "news", "eg", title, "كيما", "Kima", "https://m.example/1", "info", 1, 1, new Date().toISOString()).run();
  let answer = { title_ar: "كيما تؤكد زيادة سعر الغاز الطبيعي لمصانع الأسمدة 50% بشكل مؤقت", title_en: "Kima confirms a temporary 50% natural gas price increase", summary_ar: "أكدت كيما زيادة سعر الغاز الطبيعي 50% بشكل مؤقت.", summary_en: "Kima confirmed a temporary 50% increase in the natural gas price.", sector: 6, relevance: 55, kind: "news" };
  const AI = { run: async () => ({ response: answer }) };
  const env = { DB, KV, AI, PLATFORM_KEY: "k".repeat(32), AI_DAILY_LIMIT: "400" };
  const call = async b => (await handleApi(new Request("https://w.dev/api/intel/admin/reenrich", { method: "POST", headers: { "X-Platform-Key": "k".repeat(32) }, body: JSON.stringify(b) }), env, {})).json();
  assert.deepEqual(await call({ id: "nope" }), { error: "id or ids required" });
  const r = await call({ id });
  assert.equal(r.calls, 1); assert.equal(r.ok, 1);
  assert.equal(r.items[0].title_ar, answer.title_ar); assert.equal(r.items[0].hidden, 1, "still hidden until an admin unhides it");
  answer = { ...answer, title_ar: "كيما", title_en: "Kima" };
  const r2 = await call({ id });
  assert.equal(r2.items[0].title_ar, null, "a 4-letter title for a 49-character headline is rejected → the original title is shown");
  assert.equal((await KV.get("ai:" + r.day)), "2", "counts against the daily AI cap");
  /* daily cap reached: no model call — the stored AI text is re-checked under today's guards and the item re-queued */
  await DB.prepare("UPDATE intel_items SET title_ar='كيما', title_en='Kima', summary_ar=?, ai=1 WHERE id=?").bind("أكدت كيما زيادة سعر الغاز الطبيعي 50% بشكل مؤقت.", id).run();
  env.AI_DAILY_LIMIT = "2";
  let called = false; env.AI = { run: async () => { called = true; return { response: answer }; } };
  const r3 = await call({ id });
  assert.equal(called, false, "the cap is never exceeded"); assert.equal(r3.skipped, "daily cap reached"); assert.equal(r3.revalidated, 1);
  assert.deepEqual([r3.items[0].title_ar, r3.items[0].title_en, r3.items[0].ai], [null, null, 0], "the 4-letter titles fail today's guard; queued for the next enrichment");
  assert.equal(r3.items[0].summary_ar, "أكدت كيما زيادة سعر الغاز الطبيعي 50% بشكل مؤقت.", "text that passes the guards is kept");
  const unauth = await handleApi(new Request("https://w.dev/api/intel/admin/reenrich", { method: "POST", body: JSON.stringify({ id }) }), env, {});
  assert.equal(unauth.status, 401);
});

test("item page: AI-written title or summary carries the unofficial machine-translation note (IsDB terms); originals do not", () => {
  const base = { id: "0roca6lnp5m", kind: "tender_gov", slug: "x", market: "intl", status: "open", deadline: "2026-12-09", url: "https://www.isdb.org/project-procurement/tenders/2026/spn/x", lang: "en", updated_at: "2026-11-18T10:00:00Z", first_seen_at: "2026-11-18T10:00:00Z" };
  const src = { name: "Islamic Development Bank – Project procurement tenders", name_ar: "البنك الإسلامي للتنمية – مناقصات المشروعات" };
  const ai = itemHtml({ ...base, title_orig: "Construction of Roads at AIH Bagauda Kano", title_ar: "إنشاء طرق في كانو", summary_ar: "مناقصة لإنشاء طرق." }, src, "ar", "madeinegyptgate.com", NOW);
  assert.ok(ai.includes("ترجمة آلية غير رسمية") && ai.includes("وليست ترجمة رسمية من الجهة المصدرة"));
  assert.ok(!ai.includes("البنك الإسلامي للتنمية") && !ai.includes("isdb.org"), "members-only (util.js lockedItem): a tender's page names no source and has no official link");
  assert.ok(ai.includes("التفاصيل للأعضاء — سجّل الآن"));
  assert.ok(itemHtml({ ...base, kind: "news", title_orig: "Construction of Roads at AIH Bagauda Kano", title_ar: "إنشاء طرق في كانو", summary_ar: "خبر." }, src, "ar", "madeinegyptgate.com", NOW).includes("البنك الإسلامي للتنمية"), "a news page cites its source");
  const plain = itemHtml({ ...base, title_orig: "Construction of Roads at AIH Bagauda Kano" }, src, "en", "madeinegyptgate.com", NOW);
  assert.ok(!plain.includes("unofficial machine translation"));
  const en = itemHtml({ ...base, title_orig: "Construction of Roads at AIH Bagauda Kano", title_en: "Roads construction, AIH Bagauda (Kano)" }, src, "en", "madeinegyptgate.com", NOW);
  assert.ok(en.includes("unofficial machine translation"));
});
