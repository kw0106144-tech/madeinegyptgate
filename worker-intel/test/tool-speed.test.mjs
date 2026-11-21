/* Bassem's tool (POST /api/intel/tool, Anam SERVER_WEBHOOK bassem_intel) — speed plan 2026-11-20:
   - a refused POST (rate limit, bad JSON) answers 200 ok:false with a text the model can act on (GET keeps 429 / 400; 401 stays);
   - the rate counter's KV write runs in ctx.waitUntil (not on the answer's path);
   - the sources' names are kept 10 minutes per database (one D1 read less per call), a failed read is not kept;
   - several markets in one call are interleaved by the asked market, so each one is heard in the top 5. */
import test from "node:test"; import assert from "node:assert/strict";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { tool, handleApi, interleaveMarkets, SOURCES_TTL_MS } from "../src/api.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-18T20:45:00Z");
const ago = d => new Date(NOW - d * 864e5).toISOString();
const ahead = d => new Date(NOW + d * 864e5).toISOString().slice(0, 10) + "T00:00:00.000Z";
let n = 0;
const it = o => ({ id: "s" + String(++n).padStart(10, "0"), source_id: "s", kind: "tender_gov", market: "eg", title_orig: "x", url: "https://official.example/s/" + n, relevance: 50, status: "open", deadline: ahead(12), first_seen_at: ago(1), published_at: ago(1), ...o });
async function envWith(items, extra = {}) {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql"));
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES ('s','Official portal','بوابة رسمية','tender_gov','eg','rss','https://official.example','{}')").run();
  const cols = ["id", "source_id", "kind", "market", "title_orig", "entity", "published_at", "deadline", "url", "relevance", "status", "hidden", "first_seen_at"];
  for (const x of items) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c])).run();
  return { DB, ...extra };
}
/* six Gulf steel tenders ranked high, two African ones ranked low */
const GULF = [it({ market: "sa", title_orig: "Supply of steel rebar for housing", relevance: 95 }), it({ market: "ae", title_orig: "Supply of steel beams for a warehouse", relevance: 94 }),
  it({ market: "om", title_orig: "Supply of steel pipes for water network", relevance: 93 }), it({ market: "kw", title_orig: "Supply of steel sheets", relevance: 92 }),
  it({ market: "qa", title_orig: "Supply of galvanized steel structures", relevance: 91 }), it({ market: "gcc", title_orig: "Regional steel framework supply", relevance: 90 })];
const AFRICA = [it({ market: "africa:ke", title_orig: "Supply of steel roofing sheets", relevance: 12 }), it({ market: "africa:ng", title_orig: "Supply of steel bars", relevance: 11 })];
const post = (body, { ip = "203.0.113.20", headers = {} } = {}) => new Request("https://madeinegyptgate.com/api/intel/tool", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const quiet = async fn => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

test("POST over the rate limit → 200 ok:false + flags busy + the text (the webhook hears it); GET → 429; the tool key's 401 stays", async () => {
  const env = await envWith(GULF, { KV: makeKV(), TOOL_RATE_PER_MIN: "2" });
  assert.equal((await handleApi(post({ action: "search", query: "steel" }), env, {})).status, 200);
  assert.equal((await handleApi(post({ action: "search", query: "steel" }), env, {})).status, 200);
  const logs = [], w = console.warn; console.warn = (...a) => logs.push(a.join(" "));
  let third; try { third = await handleApi(post({ action: "search", query: "steel" }), env, {}); } finally { console.warn = w; }
  assert.equal(third.status, 200); const j = await third.json();
  assert.deepEqual([j.ok, j.flags, j.error], [false, ["busy"], "rate limited"]); assert.match(j.text, /جرّب تاني بعد دقيقة/);
  assert.deepEqual(logs, ["tool-soft-error /api/intel/tool rate_limited"], "one line, no body");
  const get = await handleApi(new Request("https://madeinegyptgate.com/api/intel/tool?action=search&query=steel", { headers: { "CF-Connecting-IP": "203.0.113.20" } }), env, {});
  assert.equal(get.status, 429);
  const keyed = await envWith(GULF, { KV: makeKV(), TOOL_KEY: "intel-test-key" });
  assert.equal((await handleApi(post({ action: "search", query: "steel" }), keyed, {})).status, 401);
});

test("POST with a broken body → 200 ok:false + a text that says send it once more, never results", async () => {
  const env = await envWith(GULF, { KV: makeKV() });
  const r = await quiet(() => handleApi(post("{not json"), env, {}));
  assert.equal(r.status, 200); const j = await r.json();
  assert.deepEqual([j.ok, j.flags, j.results], [false, ["bad_request"], undefined]); assert.match(j.text, /مرة واحدة بس/); assert.match(j.text, /مفيش نتايج تتقال من غير بحث/);
});

test("the rate counter's KV write goes to ctx.waitUntil (off the answer's path) and still counts", async () => {
  const env = await envWith(GULF, { KV: makeKV(), TOOL_RATE_PER_MIN: "1" }), pending = [];
  const ctx = { waitUntil: p => pending.push(p) };
  assert.equal((await handleApi(post({ action: "search", query: "steel" }, { ip: "198.51.100.40" }), env, ctx)).status, 200);
  assert.equal(pending.length, 1, "the put was handed to waitUntil");
  await Promise.all(pending);
  assert.deepEqual([...env.KV._m.values()], ["1"]);
  const second = await quiet(() => handleApi(post({ action: "search", query: "steel" }, { ip: "198.51.100.40" }), env, ctx));
  assert.equal((await second.json()).ok, false, "the next call over the limit is refused");
});

test("the sources' names: one D1 read for many calls on the same database (10 minutes); a failed read is not kept", async () => {
  const env = await envWith(GULF), prep = env.DB.prepare;
  let reads = 0, failNext = false;
  env.DB.prepare = sql => { if (/SELECT id, name, name_ar, homepage FROM intel_sources/.test(sql)) { reads++; if (failNext) { failNext = false; throw new Error("D1 hiccup"); } } return prep(sql); };
  const a = await tool(env, { action: "search", query: "steel", market: "gcc" }, NOW);
  const b = await tool(env, { action: "search", query: "steel", market: "sa" }, NOW);
  assert.ok(a.results.length && b.results.length);
  assert.equal(a.results[0].page.startsWith("https://madeinegyptgate.com/intel/"), true);
  assert.equal(reads, 1, "the second call used the kept names");
  assert.equal(SOURCES_TTL_MS, 600000);
  const env2 = await envWith(GULF), prep2 = env2.DB.prepare; let reads2 = 0;
  env2.DB.prepare = sql => { if (/SELECT id, name, name_ar, homepage FROM intel_sources/.test(sql)) { reads2++; if (reads2 === 1) throw new Error("D1 hiccup"); } return prep2(sql); };
  await assert.rejects(() => tool(env2, { action: "search", query: "steel", market: "gcc" }, NOW));
  const ok = await tool(env2, { action: "search", query: "steel", market: "gcc" }, NOW);
  assert.ok(ok.results.length > 0); assert.equal(reads2, 2, "the failure was not kept: read again");
});

test("several markets in one call («gcc,africa»): both are heard in the top 5, each in its own ranking order; one market is unchanged", async () => {
  const env = await envWith([...GULF, ...AFRICA]);
  const gccOnly = await tool(env, { action: "search", query: "steel", market: "gcc" }, NOW), afOnly = await tool(env, { action: "search", query: "steel", market: "africa" }, NOW);
  assert.ok(gccOnly.results.every(r => ["sa", "ae", "om", "kw", "qa", "gcc"].includes(r.market)));
  assert.equal(afOnly.results.length, 2);
  const both = await tool(env, { action: "search", query: "steel", market: "gcc,africa" }, NOW);
  assert.equal(both.results.length, 5); assert.equal(both.count, 8, "the count is every result, as before");
  const mk = both.results.map(r => (r.market.startsWith("africa") ? "africa" : "gcc"));
  assert.deepEqual(mk.slice(0, 4), ["gcc", "africa", "gcc", "africa"], "interleaved: " + mk.join(","));
  assert.deepEqual(both.results.filter(r => r.market.startsWith("africa")).map(r => r.id), afOnly.results.map(r => r.id), "Africa in its own ranking order");
  assert.deepEqual(both.results.filter(r => !r.market.startsWith("africa")).map(r => r.id), gccOnly.results.slice(0, 3).map(r => r.id), "the Gulf in its own ranking order");
  assert.match(both.text, /الخليج وأفريقيا/);
});

test("interleaveMarkets: by the ASKED market (sa / gcc → gcc, africa:ke → africa), one group or none = the list as it was", () => {
  const L = [{ id: 1, market: "sa" }, { id: 2, market: "gcc" }, { id: 3, market: "ae" }, { id: 4, market: "africa:ke" }, { id: 5, market: "africa" }, { id: 6, market: "om" }];
  assert.deepEqual(interleaveMarkets(L, ["gcc", "africa"]).map(r => r.id), [1, 4, 2, 5, 3, 6]);
  assert.deepEqual(interleaveMarkets(L, ["arab", "africa"]).map(r => r.id), [1, 4, 2, 5, 3, 6], "a Gulf country is Arab too");
  const one = [{ id: 1, market: "sa" }, { id: 2, market: "ae" }];
  assert.deepEqual(interleaveMarkets(one, ["gcc", "africa"]).map(r => r.id), [1, 2]);
  assert.deepEqual(interleaveMarkets([], ["gcc", "africa"]), []);
});

/* 2026-11-21: Janna AR's model sent some webhook calls FLAT; Anam then POSTs an EMPTY body. An empty bassem_intel call used to run as a
   «search» with no query (any latest items); now it answers empty_args + a text that has the model send it again ONCE nested. The
   arguments arrive in every other form (util.js toolArgs); garbage stays bad_json. */
test("bassem_intel: an empty body → empty_args + the nested retry text, never results; nested / query-string / form / arguments-text all arrive; garbage stays bad_json", async () => {
  const env = await envWith(GULF, { KV: makeKV() });
  const logs = [], w = console.warn; console.warn = (...a) => logs.push(a.join(" "));
  let e; try { e = await (await handleApi(post(""), env, {})).json(); } finally { console.warn = w; }
  assert.deepEqual([e.ok, e.code, e.results, e.count], [false, "empty_args", undefined, undefined]);
  assert.ok(e.text.includes('{"bodyParams":{"action":"search","query":"steel","days":30}}'), e.text);
  assert.deepEqual(logs, ["tool-soft-error /api/intel/tool empty_args"]);
  const want = { action: "search", query: "steel", market: "gcc", days: 30 };
  const forms = [post(want), post({ bodyParams: want }), post({ arguments: JSON.stringify(want) }),
    new Request("https://madeinegyptgate.com/api/intel/tool?action=search&query=steel&market=gcc&days=30", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.21" }, body: "" }),
    new Request("https://madeinegyptgate.com/api/intel/tool", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "203.0.113.22" }, body: "action=search&query=steel&market=gcc&days=30" })];
  for (const q of forms) { const j = await (await handleApi(q, env, {})).json(); assert.ok(!j.error && j.count === 6, JSON.stringify(j).slice(0, 200)); }
  for (const b of ["[1]", "hello", '"steel"']) { const j = await quiet(async () => (await handleApi(post(b), env, {})).json()); assert.equal(j.error, "bad json", b); }
});
