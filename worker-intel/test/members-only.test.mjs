/* Members-only opportunities (owner decision 2026-11-28, src/util.js lockedItem): tenders, RFQs, projects / project news and the news
   about a tender are teasers for every public caller of /intel/ pages and /api/intel/feed | item | brief (title, sector, market /
   country, dates, status + «التفاصيل للأعضاء — سجّل الآن» → /register/#basic); the full fields stay for the service binding (mailpack,
   hostname PACK_HOST) and Bassem's tool (/api/intel/tool, X-Intel-Key = TOOL_KEY). General news stays public. No network is called. */
import test from "node:test"; import assert from "node:assert/strict";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
import { handleApi, publicItem, PACK_HOST } from "../src/api.js";
import { handlePages, itemHtml } from "../src/pages.js";
import { _resetShellMemory } from "../src/siteshell.js";
import { lockedItem } from "../src/util.js";
import { makeD1, makeKV } from "./d1.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date().toISOString(), soon = new Date(Date.now() + 10 * 864e5).toISOString();
const TND = { id: "mo0000000a1", source_id: "eg1", kind: "tender_gov", market: "eg", country: "Egypt", sector: 3, title_orig: "توريد محولات كهرباء لمحطة الرويس", title_ar: "توريد محولات كهرباء لمحطة الرويس",
  summary_ar: "تطرح الشركة القابضة لكهرباء مصر مناقصة لتوريد محولات.", entity: "الشركة القابضة لكهرباء مصر", published_at: NOW, deadline: soon, value: 3500000, currency: "EGP",
  url: "https://etenders.gov.eg/Tender/Details/77", url_norm: "etenders.gov.eg/77", status: "open", relevance: 80, first_seen_at: NOW, slug: "transformers" };
const PRJ = { ...TND, id: "mo0000000b2", kind: "project", title_orig: "مشروع محطة تحلية العلمين", title_ar: "مشروع محطة تحلية العلمين", url: "https://example.gov.eg/p/1", url_norm: "example.gov.eg/p/1", entity: "وزارة الإسكان", slug: "desal" };
const TNEWS = { ...TND, id: "mo0000000c3", kind: "news", tag: "tender_news", title_orig: "طرح مناقصة لتوريد كابلات", title_ar: "طرح مناقصة لتوريد كابلات", url: "https://news.example/t/1", url_norm: "news.example/t/1", slug: "cables" };
const NEWS = { ...TND, id: "mo0000000d4", source_id: "nw1", kind: "news", tag: null, title_orig: "ارتفاع صادرات الصلب", title_ar: "ارتفاع صادرات الصلب", summary_ar: "خبر عام عن الصادرات.", entity: null, value: null, currency: null, url: "https://news.example/n/2", url_norm: "news.example/n/2", deadline: null, status: "info", slug: "steel" };
const SECRET = ["الشركة القابضة لكهرباء مصر", "etenders.gov.eg", "3500000", "3,500,000", "بوابة التعاقدات العامة", "تطرح الشركة القابضة"];
async function envWith(items, extra = {}) {
  const DB = makeD1(join(here, "..", "migrations", "0001_init.sql"));
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES ('eg1','Egypt e-tenders','بوابة التعاقدات العامة','tender_gov','eg','json','https://example.org','{}')").run();
  await DB.prepare("INSERT INTO intel_sources (id,name,name_ar,kind,market,parser,endpoint,mapping) VALUES ('nw1','Business news','أخبار الأعمال','news','eg','json','https://example.org/n','{}')").run();
  const cols = ["id", "source_id", "kind", "tag", "market", "country", "sector", "title_orig", "title_ar", "summary_ar", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "relevance", "status", "hidden", "slug", "first_seen_at"];
  for (const x of items) await DB.prepare(`INSERT INTO intel_items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map(c => (x[c] === undefined ? (c === "hidden" ? 0 : null) : x[c]))).run();
  return { DB, KV: makeKV(), TOOL_KEY: "tool-key-test", ...extra };
}
const api = async (env, path, init = {}, host = "madeinegyptgate.com") => { const r = await handleApi(new Request("https://" + host + path, init), env, { waitUntil() {} }); return { status: r.status, j: await r.json().catch(() => null) }; };
const noSecret = (s, what) => { for (const x of SECRET) assert.ok(!String(s).includes(x), what + " leaks «" + x + "»"); };

test("which kinds are members-only", () => {
  for (const x of [TND, PRJ, TNEWS, { kind: "rfq" }, { kind: "tender_semi" }, { kind: "tender_private" }, { kind: "project_news" }]) assert.equal(lockedItem(x), true, x.kind);
  assert.equal(lockedItem(NEWS), false); assert.equal(lockedItem({ kind: "news" }), false);
});
test("publicItem: the teaser + members_only / register_url; o.full keeps everything (the internal callers)", () => {
  const p = publicItem(TND, "ar", { id: "eg1", name: "Egypt e-tenders", name_ar: "بوابة التعاقدات العامة" });
  assert.deepEqual([p.entity, p.value, p.currency, p.url, p.summary, p.source, p.locked, p.members_only], [null, null, null, null, null, null, true, true]);
  assert.equal(p.register_url, "https://madeinegyptgate.com/register/#basic");
  assert.equal(p.title, TND.title_ar); assert.equal(p.status, "open"); assert.ok(p.deadline && p.published_at && p.market && p.page);
  assert.equal(publicItem(TND, "en").register_url, "https://madeinegyptgate.com/register/?lang=en#basic");
  const f = publicItem(TND, "ar", null, { full: true }); assert.equal(f.entity, TND.entity); assert.equal(f.url, TND.url);
  const n = publicItem(NEWS, "ar"); assert.equal(n.url, NEWS.url); assert.equal(n.locked, undefined, "general news stays public");
});
test("GET /api/intel/feed and /api/intel/item/<id>: no detail of a locked item for anyone", async () => {
  const env = await envWith([TND, PRJ, TNEWS, NEWS]);
  const feed = await api(env, "/api/intel/feed?days=30&per=50");
  assert.equal(feed.status, 200); assert.ok(feed.j.items.length >= 4);
  for (const it of feed.j.items) if (it.id !== NEWS.id) { assert.equal(it.members_only, true, it.id); assert.equal(it.url, null); assert.equal(it.entity, null); }
  noSecret(JSON.stringify(feed.j.items.filter(i => i.id !== NEWS.id)), "feed");
  assert.equal(feed.j.items.find(i => i.id === NEWS.id).url, NEWS.url);
  const one = await api(env, "/api/intel/item/" + TND.id, { headers: { Authorization: "Bearer anything" } });
  assert.equal(one.status, 200); noSecret(JSON.stringify(one.j), "item"); assert.equal(one.j.members_only, true);
  const brief = await api(env, "/api/intel/brief"); noSecret(JSON.stringify(brief.j), "brief");
});
test("Bassem's tool path (TOOL_KEY) and the mail pack binding keep the full record", async () => {
  const env = await envWith([TND]);
  assert.equal((await api(env, "/api/intel/tool?action=item&id=" + TND.id)).status, 401, "no key → refused");
  const t = await api(env, "/api/intel/tool?action=item&id=" + TND.id, { headers: { "X-Intel-Key": "tool-key-test" } });
  assert.equal(t.status, 200); assert.match(JSON.stringify(t.j), /الشركة القابضة لكهرباء مصر/);
  const m = await api(env, "/api/intel/mailpack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: TND.id, file: false }) }, PACK_HOST);
  assert.equal(m.status, 200); assert.equal(m.j.card.entity, TND.entity); assert.equal(m.j.links.source, TND.url);
  assert.equal((await api(env, "/api/intel/mailpack", { method: "POST", body: "{}" })).status, 404, "never on a public hostname");
});
test("/intel/ pages: the item page is the teaser with the members box (AR + EN), no source, no official link, no detail in its JSON-LD", async () => {
  const src = { id: "eg1", name: "Egypt e-tenders", name_ar: "بوابة التعاقدات العامة" };
  for (const lang of ["ar", "en"]) {
    const h = itemHtml({ ...TND, updated_at: NOW }, src, lang, "madeinegyptgate.com");
    noSecret(h, "page " + lang);
    assert.match(h, lang === "en" ? /Details are for members — register/ : /التفاصيل للأعضاء — سجّل الآن/);
    assert.match(h, lang === "en" ? /href="\/register\/\?lang=en#basic"/ : /href="\/register\/#basic"/);
    assert.ok(h.includes(TND.title_ar) || lang === "en");
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).join(" ");
    assert.ok(!/isBasedOn/.test(ld)); noSecret(ld, "json-ld " + lang);
  }
  const n = itemHtml({ ...NEWS, updated_at: NOW }, src, "ar", "madeinegyptgate.com");
  assert.ok(n.includes(NEWS.url) && !n.includes("التفاصيل للأعضاء"), "a general news page keeps its source");
});
test("/intel/ hub and lists: the locked rows show no entity or source", async () => {
  const env = await envWith([TND, PRJ, TNEWS, NEWS]); _resetShellMemory();
  const saved = globalThis.fetch; globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    for (const p of ["/intel/", "/intel/tenders/", "/intel/projects/", "/intel/en/tenders/"]) {
      const r = await handlePages(new Request("https://madeinegyptgate.com" + p), env, { waitUntil() {} });
      assert.equal(r.status, 200, p); noSecret(await r.text(), p);
    }
  } finally { globalThis.fetch = saved; }
});
