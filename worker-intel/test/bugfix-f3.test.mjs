/* Bug sweep 2026-11-19 (round 2, F3): the /intel/ shell loaded from the site at runtime (groups 1/27, durable), the «خلال 24 ساعة»
   counts vs the lists (group 7), page-language titles and the news relevance rule (group 6). */
import test from "node:test"; import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { gunzipSync } from "node:zlib"; import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url"; import { dirname, join } from "node:path"; import { tmpdir } from "node:os";
import { extractShell, looksLikeSite } from "../src/shell-extract.js";
import { loadShell, _resetShellMemory, SHELL_TIMEOUT_MS, SHELL_TTL_S } from "../src/siteshell.js";
import { SHELL } from "../src/shell.js";
import { hubPage, listPage, itemHtml, handlePages, shownTitle } from "../src/pages.js";
import { handleApi, publicItem, feed } from "../src/api.js";
import { translateTitles, enrichPending, titleNeeds, TITLES_PER_CALL } from "../src/enrich.js";
import { normalise, newsSweep, runCycle } from "../src/engine.js";
import { newsRelevant, NEWS_RULE_VERSION } from "../src/terms.js";
import worker from "../src/index.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const gz = p => gunzipSync(readFileSync(join(here, "fixtures", p))).toString("utf8");
const PAGE = { ar: gz("site/v24/tenders/index.html.gz"), en: gz("site/v24/en/tenders/index.html.gz") };
const OLD_TOOL = JSON.parse(readFileSync(join(here, "fixtures", "site", "v24-shell-old-tool.json"), "utf8"));
const NOW = Date.parse("2026-11-19T00:50:00Z");   // when the sweep read the hub
const H = 3600e3, D = 864e5, iso = ms => new Date(ms).toISOString();
const schema = join(root, "migrations", "0001_init.sql");
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
/* like the Workers runtime: fetch invoked as a method of another object throws "Illegal invocation" */
const strict = f => function (url, init) { if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation"); return f(url, init); };
const fakeCache = () => { const m = new Map(); return { match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => { m.set(r.url, await res.text()); }, _m: m }; };
/* a later site build: same page, new content-hashed asset names */
const rebuilt = s => s.replace(/seo-258ca48439\.js/g, "seo-aaaaaaaaaa.js").replace(/seo-938456401b\.css/g, "seo-bbbbbbbbbb.css").replace(/janna-welcome\.js\?v=[0-9a-f]+/g, "janna-welcome.js?v=cccccccc");
const sitePages = (pages = PAGE, log = []) => strict(async url => { log.push(String(url)); const u = new URL(url); return u.pathname === "/tenders/" ? html(pages.ar) : u.pathname === "/en/tenders/" ? html(pages.en) : html("not found", 404); });
const ITEM_COLS = ["id", "source_id", "kind", "tag", "market", "title_orig", "title_ar", "title_en", "summary_orig", "url", "status", "deadline", "published_at", "first_seen_at", "updated_at", "hidden", "dup_of", "relevance", "ai", "lang", "slug"];
async function put(DB, rows) {
  for (const r of rows) {
    const o = { source_id: "src-t", kind: "tender_gov", tag: null, market: "eg", title_ar: null, title_en: null, summary_orig: null, url: "https://x.example/" + r.id, status: "info", deadline: null, published_at: null, hidden: 0, dup_of: null, relevance: 50, ai: 0, lang: "en", slug: "item", ...r };
    o.updated_at = o.updated_at || o.first_seen_at;
    await DB.prepare(`INSERT INTO intel_items (${ITEM_COLS.join(",")}) VALUES (${ITEM_COLS.map(() => "?").join(",")})`).bind(...ITEM_COLS.map(c => o[c] ?? null)).run();
  }
}
async function db0() {
  const DB = makeD1(schema);
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES ('src-t','T','ت','tender_gov','eg','json','https://t.example','{}'),('src-n','N','ن','news','eg','rss','https://n.example','{}'),('src-o','O','و','tender_gov','eg','adapter','https://o.example','{}'),('src-x','X','إكس','news','intl','rss','https://xx.example','{\"news_filter\":false}')").run();
  return DB;
}

test("shell: the runtime loader and tools/make-shell.mjs cut a site page by the rules of the old make-shell (parity)", async () => {
  for (const lang of ["ar", "en"]) {
    const sh = extractShell(PAGE[lang], lang);
    assert.deepEqual(sh, OLD_TOOL[lang], lang + ": src/shell-extract.js = the pre-move tools/make-shell.mjs output on the same page");
    assert.ok(looksLikeSite(sh), lang + ": looks like the site");
  }
  /* the tool itself, on a site folder, through the shared extractor (no second copy of the rules) */
  const src = readFileSync(join(root, "tools", "make-shell.mjs"), "utf8");
  assert.match(src, /from "\.\.\/src\/shell-extract\.js"/); assert.ok(!/function extractShell/.test(src), "the tool has no rules of its own");
  const dir = mkdtempSync(join(tmpdir(), "migate-shell-")), out = join(dir, "shell.js");
  mkdirSync(join(dir, "site", "tenders"), { recursive: true }); mkdirSync(join(dir, "site", "en", "tenders"), { recursive: true });
  writeFileSync(join(dir, "site", "tenders", "index.html"), PAGE.ar); writeFileSync(join(dir, "site", "en", "tenders", "index.html"), PAGE.en);
  execFileSync(process.execPath, [join(root, "tools", "make-shell.mjs"), join(dir, "site"), out], { stdio: "pipe" });
  const baked = (await import(pathToFileURL(out).href)).SHELL;
  _resetShellMemory();
  for (const lang of ["ar", "en"]) {
    const { shell, from } = await loadShell(lang, { origin: "https://site.test", fetch: sitePages(), now: NOW });
    assert.equal(from, "site");
    const { fetched_at, ...runtime } = shell;
    assert.deepEqual(runtime, { head: baked[lang].head, header: baked[lang].header, footer: baked[lang].footer }, lang + ": runtime shell = make-shell output");
    assert.ok(fetched_at);
  }
  assert.throws(() => extractShell("<html><head><title>x</title></head><body><p>parked domain</p></body></html>", "ar"), /no <\/header>|language switch/);
});

test("shell: a new site build reaches /intel/ within the hour (memory, Cache API); error, bad page or no answer within 1.5 s → the baked shell", async () => {
  const NEW = { ar: rebuilt(PAGE.ar), en: rebuilt(PAGE.en) };
  _resetShellMemory();
  const log = [], cache = fakeCache();
  const o = { origin: "https://site.test", fetch: sitePages(NEW, log), cache, now: NOW };
  let r = await loadShell("ar", o);
  assert.equal(r.from, "site"); assert.match(r.shell.head, /seo-bbbbbbbbbb\.css/); assert.match(r.shell.footer, /janna-welcome\.js\?v=cccccccc/); assert.match(r.shell.footer, /seo-aaaaaaaaaa\.js|janna/);
  assert.deepEqual(log, ["https://site.test/tenders/"], "fetched once, called unbound (a strict fetch would throw)");
  r = await loadShell("ar", { ...o, now: NOW + 30 * 60e3 }); assert.equal(r.from, "memory"); assert.equal(log.length, 1);
  _resetShellMemory();   // another isolate in the same data centre
  r = await loadShell("ar", { ...o, now: NOW + 40 * 60e3 }); assert.equal(r.from, "cache"); assert.equal(log.length, 1); assert.match(r.shell.head, /seo-bbbbbbbbbb\.css/);
  _resetShellMemory();
  r = await loadShell("ar", { ...o, now: NOW + SHELL_TTL_S * 1000 + 1000 }); assert.equal(r.from, "site", "after one hour the site is read again"); assert.equal(log.length, 2);
  /* failures: the baked shell, never a broken one */
  const baked = async (fetchFn, what) => { _resetShellMemory(); const t0 = Date.now(); const x = await loadShell("ar", { origin: "https://site.test", fetch: strict(fetchFn), now: NOW }); assert.equal(x.from, "baked", what); assert.equal(x.shell, SHELL.ar, what); assert.ok(x.error, what); return Date.now() - t0; };
  await baked(async () => { throw new TypeError("network down"); }, "network error");
  await baked(async () => html("<html><body>Bad gateway</body></html>", 502), "HTTP 502");
  await baked(async () => new Response("{}", { headers: { "content-type": "application/json" } }), "not HTML");
  await baked(async () => html("<html><head><meta charset=\"utf-8\"><title>Coming soon</title></head><body><header>x</header><footer>y</footer></body></html>"), "a page that is not the site (old hosting, bot wall)");
  const ms = await baked((url, init) => new Promise((_, rej) => { init.signal.addEventListener("abort", () => rej(new Error("aborted"))); }), "no answer");
  assert.ok(ms >= SHELL_TIMEOUT_MS - 50 && ms < SHELL_TIMEOUT_MS + 400, "gave up after " + ms + " ms (limit " + SHELL_TIMEOUT_MS + ")");
  /* a failing site is not asked again on every request (60 s) */
  let n = 0; _resetShellMemory();
  const failing = strict(async () => { n++; throw new Error("down"); });
  await loadShell("en", { origin: "https://site.test", fetch: failing, now: NOW }); await loadShell("en", { origin: "https://site.test", fetch: failing, now: NOW + 30e3 });
  assert.equal(n, 1); await loadShell("en", { origin: "https://site.test", fetch: failing, now: NOW + 61e3 }); assert.equal(n, 2);
  /* concurrent requests on a cold isolate share one fetch */
  _resetShellMemory(); const log2 = [];
  const all = await Promise.all([1, 2, 3, 4].map(() => loadShell("en", { origin: "https://site.test", fetch: sitePages(NEW, log2), now: NOW })));
  assert.equal(log2.length, 1); assert.ok(all.every(x => /seo-bbbbbbbbbb\.css/.test(x.shell.head)));
});

test("shell: /intel/ pages carry the site's current assets; the baked ones when the site cannot be read; /intel/__* is never served", async () => {
  const DB = await db0(), KV = makeKV();
  await put(DB, [{ id: "a0000000001", title_orig: "توريد محولات كهربائية لمحطة مياه", lang: "ar", published_at: iso(Date.now() - 2 * D), first_seen_at: iso(Date.now() - H) }]);
  const env = { DB, KV, SHELL_ORIGIN: "https://site.test" };
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = sitePages({ ar: rebuilt(PAGE.ar), en: rebuilt(PAGE.en) });
    _resetShellMemory();
    for (const path of ["/intel/", "/intel/en/", "/intel/tenders/", "/intel/sources/", "/intel/tenders/item-a0000000001/", "/intel/no-such/"]) {
      const res = await handlePages(new Request("https://madeinegyptgate.com" + path), env, {});
      const body = await res.text();
      assert.ok(body.includes('href="/assets/seo-bbbbbbbbbb.css"') && body.includes("janna-welcome.js?v=cccccccc"), path + ": the site's current assets");
      assert.ok(!body.includes("{{ALT_URL}}"), path + ": language switch filled");
    }
    globalThis.fetch = strict(async () => { throw new Error("site down"); });
    _resetShellMemory();
    const res = await handlePages(new Request("https://madeinegyptgate.com/intel/"), env, {});
    assert.equal(res.status, 200);
    const body = await res.text(), css = (/href="(\/assets\/seo-[0-9a-f]+\.css)"/.exec(SHELL.ar.head) || [])[1];
    assert.ok(css && body.includes(css), "the baked shell's assets"); assert.ok(!body.includes("seo-bbbbbbbbbb"));
  } finally { globalThis.fetch = realFetch; _resetShellMemory(); }
  const internal = await worker.fetch(new Request("https://madeinegyptgate.com/intel/__shell/ar?origin=x"), env, { waitUntil() {} });
  assert.equal(internal.status, 404);
});

test("hub: «خلال 24 ساعة» counts the rows of the same lists (hidden, dup_of, kind, window) — never more than the section totals", async () => {
  const DB = await db0(), env = { DB, KV: makeKV() };
  const fresh = iso(NOW - H), old = iso(NOW - 3 * D);
  await put(DB, [
    { id: "t1", title_orig: "Supply of transformers", published_at: iso(NOW - 5 * D), first_seen_at: fresh },                  // listed, new
    { id: "t2", title_orig: "Supply of cables lot 1", published_at: iso(NOW - 50 * D), first_seen_at: fresh },                 // backfill outside 30 days: not listed
    { id: "t3", title_orig: "Supply of cables lot 2", published_at: iso(NOW - 45 * D), first_seen_at: fresh },                 // the same
    { id: "t4", title_orig: "Road works", published_at: iso(NOW - 3 * D), first_seen_at: old },                               // listed, not new
    { id: "t5", title_orig: "Supply of pumps", published_at: iso(NOW - 60 * D), deadline: "2026-12-20", status: "open", first_seen_at: fresh }, // open: listed whatever its date
    { id: "t6", title_orig: "Supply of transformers (copy)", published_at: iso(NOW - 5 * D), first_seen_at: fresh, dup_of: "t1" },
    { id: "t7", title_orig: "Hidden tender", published_at: iso(NOW - 5 * D), first_seen_at: fresh, hidden: 1 },
    { id: "n1", kind: "news", source_id: "src-n", lang: "ar", title_orig: "ارتفاع صادرات مصر الصناعية", published_at: iso(NOW - 2 * D), first_seen_at: fresh },
    { id: "n2", kind: "news", source_id: "src-n", lang: "ar", title_orig: "مصنع جديد للأسمنت في السويس", published_at: iso(NOW - 10 * D), first_seen_at: fresh }, // outside 7 days
    { id: "n3", kind: "news", source_id: "src-n", lang: "ar", title_orig: "سعر الذهب اليوم", published_at: iso(NOW - 1 * D), first_seen_at: fresh, hidden: 2 },
    { id: "r1", kind: "rfq", title_orig: "RFQ for valves", published_at: iso(NOW - 1 * D), first_seen_at: fresh },
    { id: "p1", kind: "project", title_orig: "Water plant project", published_at: iso(NOW - 40 * D), first_seen_at: fresh },  // outside 30 days
  ]);
  /* what the hub counted before: every row first seen in 24 h, whatever the list window → 4 tenders vs a list of 3 */
  const before = (await DB.prepare("SELECT kind, COUNT(*) AS n FROM intel_items WHERE hidden=0 AND dup_of IS NULL AND first_seen_at >= ? GROUP BY kind").bind(iso(NOW - D)).all()).results;
  assert.equal(before.find(x => x.kind === "tender_gov").n, 4);
  for (const lang of ["ar", "en"]) {
    const page = await hubPage(env, lang, "madeinegyptgate.com", NOW);
    const chips = Object.fromEntries([...page.matchAll(/<span>([^<:]+): (\d+) (?:خلال 24 ساعة|in 24 h)<\/span>/g)].map(m => [m[1], +m[2]]));
    const totals = Object.fromEntries([...page.matchAll(/<h2>([^<]+) <small class="note">\((\d+)\)<\/small><\/h2>/g)].map(m => [m[1], +m[2]]));
    const L = lang === "en" ? { t: "Tenders from official sources", r: "Requests for quotation", n: "Business & industry news", p: "Projects & project news" } : { t: "المناقصات من المصادر الرسمية", r: "طلبات عروض الأسعار", n: "الأخبار الاقتصادية والصناعية", p: "المشاريع وأخبار المشاريع" };
    assert.deepEqual([totals[L.t], chips[L.t]], [3, 2], lang + ": tenders listed t1 t4 t5, new t1 t5");
    assert.deepEqual([totals[L.r], chips[L.r]], [1, 1]); assert.deepEqual([totals[L.n], chips[L.n]], [1, 1], lang + ": news within 7 days, the unlisted one out");
    assert.equal(totals[L.p], undefined); assert.equal(chips[L.p], undefined, "no section, no chip");
    for (const k of Object.keys(chips)) assert.ok(chips[k] <= totals[k], lang + ": " + k + " " + chips[k] + " ≤ " + totals[k]);
  }
});

test("titles pass: the waiting rows the pages show first get page-language titles from the model, several per call, under the guards and the daily cap", async () => {
  const DB = await db0(), KV = makeKV();
  const T = [
    ["e1", "Supply of 40 office chairs for the ministry", "en"], ["e2", "Construction of a 2 km access road", "en"], ["e3", "Supply of medical gases", "en"],
    ["e4", "Rehabilitation of 3 boreholes", "en"], ["e5", "Supply of fire fighting equipment", "en"], ["e6", "Supply of laboratory reagents", "en"],
    ["e7", "Supply and delivery of diesel fuel for plant", "en"], ["f1", "Fourniture de matériel informatique", "fr"], ["a1", "توريد كابلات كهربائية لمحطة مياه الشرب", "ar"],
    ["e8", "Maintenance of 12 elevators", "en"],
  ];
  await put(DB, T.map(([id, t, lang], k) => ({ id, title_orig: t, lang, relevance: 90 - k, published_at: iso(NOW - k * H), first_seen_at: iso(NOW - k * H) })));
  await put(DB, [{ id: "c1", title_orig: "Closed tender", status: "closed", first_seen_at: iso(NOW) }, { id: "x1", title_orig: "Already translated", title_ar: "مترجم مسبقاً بالكامل هنا", title_en: "Already translated", first_seen_at: iso(NOW) }]);
  const AR = { e1: "توريد 40 كرسي مكتب للوزارة", e2: "إنشاء طريق وصول بطول 2 كم", e3: "توريد غازات طبية", e4: "إعادة تأهيل 5 آبار", e5: "Supply of fire fighting equipment", e6: "توريد كواشف معملية", e7: "توريد وتسليم وقود الديزل للمحطة", f1: "توريد أجهزة كمبيوتر", e8: "صيانة 12 مصعد" };
  const EN = { f1: "Supply of computer equipment", a1: "Supply of electrical cables for a drinking water plant" };
  const calls = [];
  const AI = { run: async (model, p) => {
    const req = JSON.parse(p.messages[1].content); calls.push(req);
    assert.ok(Array.isArray(req) && req.length <= TITLES_PER_CALL && /translate the titles/.test(p.messages[0].content));
    const ids = await Promise.all(req.map(async x => (await DB.prepare("SELECT id FROM intel_items WHERE title_orig=?").bind(x.title).first()).id));
    return { response: { items: req.map((x, j) => ({ i: x.i, ...(x.need.includes("ar") ? { title_ar: AR[ids[j]] } : {}), ...(x.need.includes("en") ? { title_en: EN[ids[j]] } : {}) })) } };
  } };
  const env = { DB, KV, AI, AI_DAILY_LIMIT: "10" };
  assert.deepEqual(titleNeeds({ title_orig: "Supply of pumps", lang: "en" }), ["ar"]); assert.deepEqual(titleNeeds({ title_orig: "توريد مضخات", lang: "ar" }), ["en"]);
  assert.deepEqual(titleNeeds({ title_orig: "Fourniture de matériel", lang: "fr" }), ["ar", "en"]);
  const st = await translateTitles(env, { units: 4, now: NOW });
  assert.equal(st.calls, 2); assert.equal(st.units, 4, "9 titles = 3 units, then 1 title = 1 unit"); assert.equal(st.rows, 10);
  assert.equal(await KV.get("ai:" + st.day), "4", "charged against the daily cap");
  assert.ok(!calls.flat().some(x => /Closed tender|Already translated/.test(x.title)), "closed / already translated rows are not sent");
  const row = async id => DB.prepare("SELECT title_ar, title_en, ai FROM intel_items WHERE id=?").bind(id).first();
  assert.deepEqual(await row("e1"), { title_ar: AR.e1, title_en: null, ai: 3 });
  assert.equal((await row("e4")).title_ar, null, "«5 آبار» for «3 boreholes»: a number the title does not have → rejected, the original stays");
  assert.equal((await row("e5")).title_ar, null, "no Arabic letters → rejected");
  assert.deepEqual(await row("f1"), { title_ar: AR.f1, title_en: EN.f1, ai: 3 }); assert.deepEqual(await row("a1"), { title_ar: null, title_en: EN.a1, ai: 3 });
  assert.equal(st.rejected, 2); assert.equal(st.title_ar, 7); assert.equal(st.title_en, 2);
  /* nothing waits any more: no call */
  const st2 = await translateTitles(env, { units: 4, now: NOW }); assert.equal(st2.calls, 0);
  /* the full pass still takes ai=3 rows, and keeps the titles-pass title when its own fails the guards */
  env.AI = { run: async () => ({ response: { title_ar: "كرسي", title_en: "Chairs", summary_ar: "توريد 40 كرسي مكتب للوزارة.", summary_en: "Supply of 40 office chairs.", sector: 31, relevance: 70, kind: "tender_gov" } }) };
  await DB.prepare("UPDATE intel_items SET relevance=99 WHERE id='e1'").run();
  const full = await enrichPending(env, { limit: 1, now: NOW });
  assert.equal(full.calls, 1);
  const e1 = await DB.prepare("SELECT title_ar, summary_ar, ai FROM intel_items WHERE id='e1'").first();
  assert.deepEqual(e1, { title_ar: AR.e1, summary_ar: "توريد 40 كرسي مكتب للوزارة.", ai: 1 }, "a 5-letter title for a 43-character original is rejected; the titles-pass title stays");
  /* the cap is never exceeded: 5 units used, 5 left, 20 asked → at most 5 units */
  await DB.prepare("UPDATE intel_items SET ai=0, title_ar=NULL, title_en=NULL WHERE id LIKE 'e%' OR id='f1'").run();
  env.AI = AI; await KV.put("ai:" + st.day, "8");
  const st3 = await translateTitles(env, { units: 20, now: NOW }); assert.ok(st3.units <= 2 && st3.rows <= 6, JSON.stringify(st3));
  const st4 = await translateTitles(env, { units: 20, now: NOW }); assert.equal(st4.calls, 0); assert.equal(st4.skipped, "daily cap reached");
});

test("titles pass: picks what the pages show first — alternately by relevance (hub) and by date (lists, news)", async () => {
  const DB = await db0(), KV = makeKV();
  await put(DB, Array.from({ length: 30 }, (_, k) => ({ id: "r" + String(k).padStart(2, "0"), title_orig: "Supply of item number " + k, relevance: k, published_at: iso(NOW - k * H), first_seen_at: iso(NOW - k * H) })));
  const sent = [];
  const env = { DB, KV, AI_DAILY_LIMIT: "50", AI: { run: async (m, p) => { const req = JSON.parse(p.messages[1].content); sent.push(...req.map(x => x.title)); return { response: { items: [] } }; } } };
  await translateTitles(env, { units: 2, now: NOW });
  assert.equal(sent.length, 6);
  for (const k of [29, 28, 27]) assert.ok(sent.includes("Supply of item number " + k), "highest relevance " + k);
  for (const k of [0, 1, 2]) assert.ok(sent.includes("Supply of item number " + k), "newest " + k);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM intel_items WHERE ai=3").first()).n, 6, "an empty answer marks the rows tried (the full pass still takes them)");
});

test("pages: a title with no translation yet is shown in its original language and marked; a translation is not marked; never a made-up title", async () => {
  const base = { id: "b0000000001", kind: "tender_gov", slug: "x", market: "africa:ke", status: "open", deadline: "2026-12-02", url: "https://tenders.go.ke/x", updated_at: "2026-11-18T10:00:00Z", first_seen_at: "2026-11-18T10:00:00Z" };
  const src = { name: "Kenya PPIP", name_ar: "بوابة المشتريات العامة في كينيا" };
  const KE = "PROPOSED RENOVATION OF 4 CLASSROOMS AT AC TEGAT PRIMARY SCHOOL";
  const ar = itemHtml({ ...base, title_orig: KE, lang: "en" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.ok(ar.includes(`<h1><span lang="en" dir="auto">${KE}</span></h1>`), "the original, with its language");
  assert.ok(ar.includes("بلغة المصدر – ما اتترجمش لسه"), "marked: not translated yet");
  assert.ok(!ar.includes("ترجمة آلية غير رسمية"), "nothing was machine-translated, so no translation note");
  const done = itemHtml({ ...base, title_orig: KE, lang: "en", title_ar: "تجديد 4 فصول دراسية في مدرسة إيه سي تيجات الابتدائية" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.ok(!done.includes("بلغة المصدر") && done.includes("<h1>تجديد 4 فصول"));
  const enAr = itemHtml({ ...base, market: "eg", title_orig: "توريد كابلات كهربائية لمحطة مياه", lang: "ar" }, src, "en", "madeinegyptgate.com", NOW);
  assert.ok(enAr.includes('<span lang="ar" dir="auto">توريد كابلات') && enAr.includes("Source language – not translated yet"));
  const enEn = itemHtml({ ...base, title_orig: KE, lang: "en" }, src, "en", "madeinegyptgate.com", NOW);
  assert.ok(!enEn.includes("not translated yet"), "an English original on an English page is in the page language");
  const arAr = itemHtml({ ...base, market: "eg", title_orig: "توريد كابلات كهربائية لمحطة مياه", lang: "ar" }, src, "ar", "madeinegyptgate.com", NOW);
  assert.ok(!arAr.includes("بلغة المصدر"));
  assert.deepEqual(shownTitle({ title_orig: "Fourniture de matériel informatique", lang: "fr" }, "en"), { text: "Fourniture de matériel informatique", orig: true, lang: "fr" });
  /* lists and the API say the same */
  const DB = await db0(), env = { DB, KV: makeKV() };
  await put(DB, [{ id: "l1", title_orig: KE, published_at: iso(Date.now() - D), first_seen_at: iso(Date.now() - D) }, { id: "l2", title_orig: "توريد محولات كهربائية", lang: "ar", published_at: iso(Date.now() - D), first_seen_at: iso(Date.now() - D) }]);
  const list = await listPage(env, "ar", "tenders", {}, "madeinegyptgate.com");
  const ul = list.slice(list.indexOf('<ul class="tlist">'), list.indexOf("</ul>", list.indexOf('<ul class="tlist">')));
  const rows = [...ul.matchAll(/<li><a href="[^"]+">([\s\S]*?)<\/a>([\s\S]*?)<span class="m">/g)].map(m => [m[1], /sx-orig/.test(m[2])]);
  assert.deepEqual(rows.map(r => r[1]).sort(), [false, true]);
  assert.ok(rows.find(r => r[1])[0].includes('lang="en"'));
  const f = await feed(env, { kind: "tenders", days: 30 }, Date.now());
  assert.deepEqual(f.items.map(i => [i.id, i.title_is_original]).sort(), [["l1", true], ["l2", false]]);
  assert.equal(publicItem({ title_orig: KE, lang: "en" }, "en").title_is_original, false);
});

test("news relevance: gold and retail price lists, pilgrimage, politics, sports and games out; industry, trade and economy in (live headlines 2026-11-18/19)", () => {
  const OUT = [
    "سعر الذهب اليوم في مصر.. عيار 21 يخسر 60 جنيها مع بداية تعاملات الخميس", "تراجع طفيف في أسعار الذهب وسط قوة الدولار", "Dubai gold prices fall below Dh450 for first time in 2026",
    "السياحة تشارك في البرنامج التدريبي لتأهيل مكاتب شئون الحجاج بالسعودية",
    "تكريم تاريخي لأنور السادات في الكونجرس الأمريكي.. الميدالية الذهبية تقديرا لدوره في صناعة السلام",
    "أسعار الخضروات والفاكهة في سوق العبور اليوم.. ارتفاع الطماطم", "كرتونة البيض بكام؟ أسعار الفراخ والبانيه اليوم الخميس",
    "رئيس وزراء أستراليا يلتقي رئيسة المكسيك على هامش قمة \"أبيك\"", "GTA 6 launch: Gaming phenomenon goes live in New Zealand after 13-year wait",
    "ريال مدريد يرفع راتب جولر 28% إلى 8 ملايين يورو سنوياً", "Congo struggles to tame ebola outbreak six months into response",
  ];
  const IN = [
    "\"كيما\" تؤكد زيادة سعر الغاز الطبيعي 50% بشكل مؤقت", "العربية للأسمنت تُنشئ طاحونة عمودية بطاقة 150 طن/ساعة", "استقرار سعر الحديد اليوم الأربعاء 18 نوفمبر 2026 فى المصانع",
    "حسن علام تطور مشروع نيفيرا غرب القاهرة", "الإحصاء: 7.4% ارتفاعا فى قيمة الصادرات المصرية خلال سبتمبر الماضى", "Egypt’s EGPC, United Energy sign MoU on renewable energy adoption",
    "صندوق النقد يتوصل إلى اتفاق مع مصر لمنحها 2.3 مليار دولار - تفاصيل", "مؤشرات البورصة تنخفض مع ختام تعاملات جلسة اليوم الأربعاء", "Oil prices steady on Thursday",
    "قيود جديدة على صادرات الذهب في غينيا", "شعبة الدواجن تعرض استراتيجية حظر التداول الحي على وزير الزراعة", "44 مليون دولار صفقة توريد كرات المباريات في دوري أبطال أوروبا",
  ];
  for (const t of OUT) assert.equal(newsRelevant(t).ok, false, "out: " + t + " (" + newsRelevant(t).why + ")");
  for (const t of IN) assert.equal(newsRelevant(t).ok, true, "in: " + t + " (" + newsRelevant(t).why + ")");
  /* at ingest: a news source's off-topic item is not stored; an official body's own news, a tender headline and an opted-out source are */
  const news = { id: "src-n", kind: "news", market: "eg", lang: "ar", mapping: {} };
  assert.equal(normalise({ title: OUT[0], url: "https://n.example/1" }, news, NOW), null);
  assert.ok(normalise({ title: IN[0], url: "https://n.example/2" }, news, NOW));
  assert.ok(normalise({ title: "حملات سحب الأراضي غير المستغلة في المناطق الصناعية", url: "https://o.example/1", kind_hint: "news" }, { id: "src-o", kind: "tender_gov", market: "eg", lang: "ar", mapping: { kind_map: { field: "kind_hint", map: { news: "news" } } } }, NOW).kind === "news");
  assert.ok(normalise({ title: OUT[0], url: "https://x.example/1" }, { ...news, mapping: { news_filter: false } }, NOW));
  const rfp = normalise({ title: "RFP: Individual Consultant – End-Term Review of the RAERESA Strategic Plan 2017–2026", url: "https://n.example/3" }, news, NOW);
  assert.deepEqual([rfp.kind, rfp.tag], ["project_news", "tender_news"], "an RFP notice is a tender headline");
  assert.equal(normalise({ title: "Starcodegroup installs ROTOCON RFP 450 flexographic press in Germany", url: "https://n.example/4" }, news, NOW), null, "a machine model «RFP 450» is not a tender (and not industry news by its words)");
});

test("news relevance on stored rows: unlisted (hidden=2) out of lists, feed and sitemap, page still answers (noindex); admin unhide sticks; admin hide untouched", async () => {
  const DB = await db0(), KV = makeKV(), now = Date.now(), env = { DB, KV, PLATFORM_KEY: "k".repeat(32), SHELL_RUNTIME: "0" };
  const f = iso(now - H), p = iso(now - 2 * H);
  await put(DB, [
    { id: "g0000000001", kind: "news", source_id: "src-n", lang: "ar", title_orig: "سعر الذهب اليوم في مصر.. عيار 21 يخسر 60 جنيها", published_at: p, first_seen_at: f },
    { id: "g0000000002", kind: "news", source_id: "src-n", lang: "ar", title_orig: "تكريم تاريخي لأنور السادات في الكونجرس الأمريكي", published_at: p, first_seen_at: f },
    { id: "g0000000003", kind: "news", source_id: "src-n", lang: "ar", title_orig: "ارتفاع صادرات مصر من الأسمدة", published_at: p, first_seen_at: f, hidden: 2 },   // the rule accepts it: listed back
    { id: "g0000000004", kind: "news", source_id: "src-n", lang: "ar", title_orig: "أسعار الذهب في قطر تتراجع", published_at: p, first_seen_at: f, hidden: 1 },     // an admin's hide
    { id: "g0000000005", kind: "news", source_id: "src-x", lang: "en", title_orig: "Gold is funding resistance in Myanmar", published_at: p, first_seen_at: f },     // opted-out source
    { id: "g0000000006", kind: "news", source_id: "src-o", lang: "ar", title_orig: "حملات سحب الأراضي", published_at: p, first_seen_at: f },                         // an official body's news
  ]);
  const st = await newsSweep(env, now);
  assert.equal(st.rule, NEWS_RULE_VERSION); delete st.rule;
  assert.deepEqual(st, { checked: 4, unlisted: 2, relisted: 1 }, "news sources only: the admin-hidden row and the official body's news are not checked");
  const hid = async id => (await DB.prepare("SELECT hidden FROM intel_items WHERE id=?").bind(id).first()).hidden;
  assert.deepEqual(await Promise.all(["g0000000001", "g0000000002", "g0000000003", "g0000000004", "g0000000005", "g0000000006"].map(hid)), [2, 2, 0, 1, 0, 0]);
  const fd = await feed(env, { kind: "news", days: 7 }, now);
  assert.deepEqual(fd.items.map(i => i.id).sort(), ["g0000000003", "g0000000005", "g0000000006"], "the unlisted and the admin-hidden rows are out");
  const page = await handlePages(new Request("https://madeinegyptgate.com/intel/news/item-g0000000001/"), env, {});
  assert.equal(page.status, 200); assert.match(await page.text(), /content="noindex,follow"/);
  assert.equal((await handlePages(new Request("https://madeinegyptgate.com/intel/news/item-g0000000004/"), env, {})).status, 410, "an admin-hidden item is gone");
  const api = await handleApi(new Request("https://w.dev/api/intel/item/g0000000002"), env, {}); assert.equal(api.status, 200);
  const unhide = await handleApi(new Request("https://w.dev/api/intel/admin/unhide", { method: "POST", headers: { "X-Platform-Key": "k".repeat(32) }, body: JSON.stringify({ id: "g0000000002" }) }), env, {});
  assert.equal(unhide.status, 200);
  assert.deepEqual(await DB.prepare("SELECT hidden, tag FROM intel_items WHERE id='g0000000002'").first(), { hidden: 0, tag: "kept" });
  assert.equal((await newsSweep(env, now)).skipped, "already applied", "once per rule version");
  const again = await handleApi(new Request("https://w.dev/api/intel/admin/run", { method: "POST", headers: { "X-Platform-Key": "k".repeat(32) }, body: JSON.stringify({ stage: "news" }) }), env, {});
  assert.equal((await again.json()).unlisted, 0, "forced again: an admin's unhide is never undone by the rule");
  assert.equal(await hid("g0000000004"), 1);
  const sm = await handlePages(new Request("https://madeinegyptgate.com/intel/sitemap-items-1.xml"), env, {});
  assert.ok(!(await sm.text()).includes("g0000000001"), "unlisted items are not in the sitemap");
});

test("cycle: the titles pass first (AI_TITLES_SHARE of the run's units, default 2/3), the full enrichment with the rest — one daily cap", async () => {
  const DB = await db0(), KV = makeKV();
  await put(DB, Array.from({ length: 40 }, (_, k) => ({ id: "c" + String(k).padStart(2, "0"), title_orig: "Supply of spare parts lot " + k, relevance: 40 + k, published_at: iso(NOW - k * H), first_seen_at: iso(NOW - k * H) })));
  let titleCalls = 0, fullCalls = 0;
  const AI = { run: async (m, p) => {
    if (/translate the titles/.test(p.messages[0].content)) { titleCalls++; const req = JSON.parse(p.messages[1].content); return { response: { items: req.map(x => ({ i: x.i, title_ar: "توريد قطع غيار الدفعة " + x.title.match(/\d+$/)[0] })) } }; }
    fullCalls++; const t = JSON.parse(p.messages[1].content).title;
    return { response: { title_ar: "توريد قطع غيار الدفعة " + t.match(/\d+$/)[0], title_en: t, summary_ar: "مناقصة لتوريد قطع غيار.", summary_en: "A tender for spare parts.", sector: 26, relevance: 70, kind: "tender_gov" } };
  } };
  const env = { DB, KV, AI, AI_DAILY_LIMIT: "100", AI_PER_RUN: "9" };
  const st = await runCycle(env, { trigger: "test", sourceIds: [], now: NOW, gate: async () => {} });
  assert.deepEqual([st.titles.units, st.titles.calls, st.titles.rows], [6, 2, 18], "floor(9 × 2/3) = 6 units = 18 titles in 2 calls");
  assert.equal(st.ai.calls, 3, "the full pass gets the other 3 units");
  assert.equal(titleCalls + fullCalls, 5);
  assert.equal(await KV.get("ai:" + st.titles.day), "9", "6 + 3 units charged");
  assert.equal((await DB.prepare("SELECT ai_calls FROM intel_runs ORDER BY id DESC LIMIT 1").first()).ai_calls, 5);
  const by = Object.fromEntries(((await DB.prepare("SELECT ai, COUNT(*) AS n, SUM(title_ar IS NOT NULL) AS ar FROM intel_items GROUP BY ai").all()).results).map(r => [r.ai, [r.n, r.ar]]));
  assert.deepEqual(by, { 0: [22, 0], 1: [3, 3], 3: [15, 15] }, "18 rows got Arabic titles; the full pass then enriched the 3 most relevant of them");
  env.AI_TITLES_SHARE = "0";
  const st2 = await runCycle(env, { trigger: "test", sourceIds: [], now: NOW, gate: async () => {} });
  assert.equal(st2.titles.calls, 0); assert.equal(st2.ai.calls, 9, "share 0: every unit to the full pass");
});
