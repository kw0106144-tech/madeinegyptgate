// /api/seo/* end to end through handleSeoApi with KV + D1 + ASSETS doubles (A9 / A12 behaviour of the spec).
import test from "node:test";
import assert from "node:assert/strict";
import { handleSeoApi, resetApiMemos, csvParse, toCsv, validateRobotsExtra, validateRedirect, collapseTarget } from "../_lib/seo-api.js";
import { resetEdgeMemos, loadBundle } from "../_lib/seo-edge.js";
import { resetAuthCache } from "../_lib/seo-auth.js";
import { KV, D1, assets, pctx, rq, seedMember } from "./helpers.mjs";

const SECRET = "api-test-secret", AR = "تشكيل-المعادن-في-السادات", AR_PATH = `/factories/${AR}/`;
const page = (title, { intro = true, h1 = true } = {}) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="d"><link rel="canonical" href="https://madeinegyptgate.com/"></head><body>${h1 ? '<h1 data-seo="h1">H</h1>' : "<h1>H</h1>"}${intro ? '<p data-seo="intro">i</p>' : ""}</body></html>`;
const ROWS = [
  { p: "/", l: "ar", t: "home", ti: "منصة صنع في مصر | دليل المصانع المصرية والمناقصات وطلبات الأسعار", d: "دليل المصانع المصرية والمناقصات وطلبات عروض الأسعار في مصر: ابحث حسب القطاع والمحافظة واطلب عرض سعر مجاناً من المصانع المسجلة.", h1: "منصة صنع في مصر", c: "https://madeinegyptgate.com/", r: "index,follow", w: 420, im: 4, ina: 0, s: ["WebSite", "Organization"], a: "/en/", lm: "2026-11-10", k: "A", why: "home" },
  { p: "/factories/", l: "ar", t: "hub", ti: "دليل المصانع المصرية: مصانع وشركات حسب القطاع", d: "دليل المصانع في مصر حسب القطاع والمحافظة مع ملف لكل منشأة ومنتجاتها، واطلب عرض سعر مجاناً من المصانع المسجلة.", h1: "دليل المصانع", c: "https://madeinegyptgate.com/factories/", r: "index,follow", w: 320, im: 2, ina: 1, s: ["CollectionPage"], a: "", lm: "2026-11-17", k: "B", why: "hub" },
  { p: AR_PATH, l: "ar", t: "company", ti: "تشكيل المعادن في السادات – تشكيل معادن في المنوفية | صنع في مصر", d: "قصير", h1: "تشكيل المعادن في السادات", c: "https://madeinegyptgate.com" + encodeURI(AR_PATH), r: "noindex,follow", w: 30, im: 0, ina: 0, s: ["Organization"], a: "", lm: "2026-11-01", k: "", why: "thin" },
  { p: "/about/", l: "ar", t: "page", ti: "عن المنصة", d: "عن منصة صنع في مصر", h1: "عن المنصة", c: "https://madeinegyptgate.com/about/", r: "index,follow", w: 90, im: 0, ina: 0, s: [], a: "", lm: "2026-10-01", k: "", why: "static" },
  { p: "/en/", l: "en", t: "home", ti: "Made in Egypt Gate | Egyptian factories directory, tenders and RFQs", d: "Directory of Egyptian factories, tenders and requests for quotation: search by sector and governorate and request a free quote.", h1: "Made in Egypt Gate", c: "https://madeinegyptgate.com/en/", r: "index,follow", w: 300, im: 1, ina: 0, s: ["WebSite"], a: "/", lm: "2026-11-10", k: "A", why: "home" },
];
const FILES = {
  "/index.html": page("home"), "/factories/index.html": page("factories"), [`${AR_PATH}index.html`]: page("company", { intro: false }),
  "/about/index.html": page("about", { intro: false, h1: false }), "/en/index.html": page("en"), "/404.html": "<!doctype html><title>404</title>",
  "/_seo/pages.json": ROWS,
  "/_seo/redirects.json": { exact: { "/about.html": "/about/", "/old-a/": "/about/", "/factories": "/factories/" }, prefix: [["/tenders/page/", "/tenders/"]], gone_rx: [], gone_prefix_on_404: ["/factories/"] },
  "/_seo/keywords.json": [{ cluster: "B", target_url: "/factories/", target_kw: "دليل المصانع", secondary_kw: ["مصانع مصر"], difficulty: "H" }],
  "/_seo/config.json": { min_hub_members: 5, listing_page_size: 50 },
};

async function setup(extraEnv = {}, kvInit = {}) {
  resetEdgeMemos(); resetApiMemos(); resetAuthCache();
  const db = new D1(), kv = new KV(kvInit);
  const env = { SEO_KV: kv, ASSETS: assets(FILES), DB: db, ADVISOR_SECRET: SECRET, ADMIN_EMAILS: "boss@example.test", PLATFORM_KEY: "pk-test", ...extraEnv };
  const admin = await seedMember(db, { id: "uadmin", email: "admin@example.test", role: "admin", secret: SECRET });
  const seo = await seedMember(db, { id: "useo", email: "seo@example.test", role: "seo", secret: SECRET });
  const member = await seedMember(db, { id: "umem", email: "m@example.test", secret: SECRET });
  const call = async (path, o = {}) => {
    const res = await handleSeoApi(pctx(rq("/api/seo" + path, { token: o.as === undefined ? admin : o.as, ...o }), env));
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    let data = null; try { data = JSON.parse(text); } catch (e) { /* csv */ }
    return { status: res.status, data, text, headers: res.headers };
  };
  return { env, kv, db, admin, seo, member, call };
}
async function withFetch(fn, impl) { const orig = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = orig; } }

test("auth: 401 without token, 403 for a plain member, seo role and admin allowed; same-origin only", async () => {
  const { call, member, seo } = await setup();
  assert.equal((await call("/health", { as: "" })).status, 401);
  assert.equal((await call("/health", { as: member })).status, 403);
  const s = await call("/health", { as: seo });
  assert.equal(s.status, 200);
  assert.equal(s.data.role, "seo");
  const h = await call("/health");
  assert.deepEqual([h.data.ok, h.data.kv, h.data.d1, h.data.auth, h.data.role, h.data.manifest.rows, h.data.build_redirects, h.data.indexnow, h.data.deploy_hook, h.data.gsc], [true, true, true, "d1", "admin", 5, 3, false, false, false]);
  assert.equal(h.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(h.headers.get("Cache-Control"), "no-store");
  assert.equal((await call("/nope")).status, 404);
  assert.equal((await call("/rollback")).status, 405);
  const o = await call("/page", { method: "OPTIONS" });
  assert.equal(o.status, 204);
  assert.equal(o.headers.get("Access-Control-Allow-Origin"), null);
  const noKv = await setup({ SEO_KV: undefined });
  assert.equal((await noKv.call("/health")).status, 503);
});

test("PUT override → bundle (v, prev, meta, log); GET page; validation errors are 400 with the field", async () => {
  const { call, kv } = await setup();
  const r = await call("/page", { method: "PUT", body: { path: "/factories/", title: "دليل المصانع المصرية 2026", description: "وصف جديد للدليل", robots: "noindex, follow", target_kw: "دليل المصانع", secondary_kw: "مصانع مصر | مصانع", note: "test" } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.override, { title: "دليل المصانع المصرية 2026", description: "وصف جديد للدليل", robots: "noindex,follow" });
  const b = kv.json("seo:bundle");
  assert.equal(b.v, r.data.bundle_v);
  assert.deepEqual(b.ov["/factories/"], r.data.override);
  assert.deepEqual([b.meta.ov["/factories/"].target_kw, b.meta.ov["/factories/"].secondary_kw, b.meta.ov["/factories/"].updated_by], ["دليل المصانع", ["مصانع مصر", "مصانع"], "uadmin"]);
  assert.equal(kv.json("seo:bundle:prev").v, 0);
  assert.equal((await loadBundle({ SEO_KV: kv })).v, b.v, "this isolate's middleware memo sees the publish at once");
  const g = await call("/page?path=" + encodeURIComponent("https://madeinegyptgate.com/factories/?x=1"));
  assert.equal(g.data.path, "/factories/");
  assert.equal(g.data.defaults.ti, ROWS[1].ti, "manifest row keys kept");
  assert.equal(g.data.defaults.title, ROWS[1].ti, "plus long keys");
  assert.equal(g.data.effective.title, "دليل المصانع المصرية 2026");
  assert.ok(g.data.issues.includes("noindex") && g.data.issues.includes("overridden"));
  assert.equal(g.data.history.length, 1);
  assert.equal(g.data.history[0].by_email, "admin@example.test");
  const bad = async (body, field, code) => { const x = await call("/page", { method: "PUT", body: { path: "/factories/", ...body } }); assert.equal(x.status, 400, JSON.stringify(body)); assert.equal(x.data.field, field); if (code) assert.equal(x.data.code, code); };
  await bad({ jsonld: "{not json" }, "jsonld", "invalid_jsonld");
  await bad({ jsonld: '{"@type":"Thing"}' }, "jsonld");
  await bad({ title: "x".repeat(121) }, "title");
  await bad({ description: "x".repeat(321) }, "description");
  await bad({ intro: "x".repeat(1201) }, "intro");
  await bad({ robots: "noindex,nofollow,noarchive" }, "robots");
  await bad({ canonical: "https://evil.example/factories/" }, "canonical");
  await bad({ canonical: "https://madeinegyptgate.com/factories/#x" }, "canonical");
  await bad({ og_image: "http://madeinegyptgate.com/a.jpg" }, "og_image");
  await bad({ title: 5 }, "title");
  await bad({ target_kw: "x".repeat(121) }, "target_kw");
  assert.equal((await call("/page", { method: "PUT", body: { path: "/api/seo/x", title: "t" } })).data.field, "path");
  assert.equal((await call("/page", { method: "PUT", body: { path: "/_seo/pages.json", title: "t" } })).status, 400);
  assert.equal((await call("/page", { method: "PUT", body: "{bad", headers: { "Content-Type": "application/json" } })).status, 400);
  const ok = await call("/page", { method: "PUT", body: { path: "/factories/", jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "</script>" }, title: "  عنوان \n مع\t مسافات  " } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.override.title, "عنوان مع مسافات");
  assert.equal(ok.data.override.jsonld, JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", name: "</script>" }));
  assert.equal(ok.data.override.description, undefined, "PUT replaces the whole override");
  assert.equal(ok.data.meta.target_kw, "دليل المصانع", "…but keeps the keyword metadata it did not send");
  const clr = await call("/page", { method: "PUT", body: { path: "/factories/", title: "t", target_kw: "", note: null } });
  assert.deepEqual([clr.data.meta.target_kw, clr.data.meta.note, clr.data.meta.secondary_kw], [undefined, undefined, ["مصانع مصر", "مصانع"]]);
});
test("unknown paths need force (admin only); a redirecting path gets a hint", async () => {
  const { call, seo } = await setup();
  const u = await call("/page", { method: "PUT", body: { path: "/no-such-page/", title: "x" } });
  assert.deepEqual([u.status, u.data.code], [400, "unknown_path"]);
  assert.equal((await call("/page", { method: "PUT", body: { path: "/no-such-page/", title: "x", force: true } })).status, 200);
  assert.equal((await call("/page", { method: "PUT", as: seo, body: { path: "/no-such-page-2/", title: "x", force: true } })).status, 400);
  const red = await call("/page", { method: "PUT", body: { path: "/factories", title: "x" } });
  assert.match(red.data.error, /redirects to \/factories\//);
  assert.equal((await call("/page", { method: "PUT", body: { path: encodeURI(AR_PATH).toLowerCase(), title: "عنوان" } })).data.path, AR_PATH, "Arabic path in lower-case percent-encoding");
});
test("PATCH merges; intro placement flag; empty override deletes; DELETE; platform key limits", async () => {
  const { call, kv } = await setup();
  await call("/page", { method: "PUT", body: { path: "/factories/", title: "T1" } });
  const p = await call("/page", { method: "PATCH", body: { path: "/factories/", description: "D1" } });
  assert.deepEqual(p.data.override, { title: "T1", description: "D1" });
  const p2 = await call("/page", { method: "PATCH", body: { path: "/factories/", title: "" } });
  assert.deepEqual(p2.data.override, { description: "D1" });
  const ix = await call("/page", { method: "PUT", body: { path: AR_PATH, intro: "مقدمة" } });
  assert.equal(ix.data.override.ix, 1, "no intro element but an H1 hook → insert after the H1");
  const inPlace = await call("/page", { method: "PUT", body: { path: "/factories/", intro: "مقدمة" } });
  assert.equal(inPlace.data.override.ix, undefined);
  const warn = await call("/page", { method: "PUT", body: { path: "/about/", intro: "مقدمة", h1: "عنوان" } });
  assert.deepEqual(warn.data.warnings.map(w => w.field).sort(), ["h1", "intro"]);
  const writes = kv.writes;
  const same = await call("/page", { method: "PUT", body: { path: "/about/", intro: "مقدمة", h1: "عنوان" } });
  assert.equal(same.data.changed, false);
  assert.equal(kv.writes, writes, "unchanged save → no KV write");
  const empty = await call("/page", { method: "PUT", body: { path: "/about/" } });
  assert.equal(empty.data.override, null);
  assert.equal(kv.json("seo:bundle").ov["/about/"], undefined);
  const d = await call("/page?path=/factories/", { method: "DELETE" });
  assert.deepEqual([d.data.ok, d.data.removed], [true, true]);
  const w2 = kv.writes;
  assert.equal((await call("/page?path=/factories/", { method: "DELETE" })).data.removed, false);
  assert.equal(kv.writes, w2);
  const pk = { as: "", headers: { "X-Platform-Key": "pk-test" } };
  assert.equal((await call("/page", { method: "PUT", ...pk, body: { path: "/factories/", title: "x" } })).status, 403, "A9: X-Platform-Key on PUT → 403");
  assert.equal((await call("/health", pk)).status, 200);
  const ej = await call("/export.json", pk);
  assert.equal(ej.status, 200);
  assert.ok(ej.data.ov[AR_PATH] && !("meta" in ej.data));
  assert.equal((await call("/export.csv?kind=overrides", pk)).status, 200);
  assert.equal((await call("/pages", pk)).status, 403);
});
test("rollback swaps bundle and prev; nothing to roll back → 409", async () => {
  const { call, kv } = await setup();
  assert.equal((await call("/rollback", { method: "POST" })).status, 409);
  const a = await call("/page", { method: "PUT", body: { path: "/factories/", title: "A" } });
  const b = await call("/page", { method: "PUT", body: { path: "/factories/", title: "B" } });
  const r = await call("/rollback", { method: "POST" });
  assert.equal(r.data.restored, a.data.bundle_v);
  assert.ok(r.data.bundle_v > b.data.bundle_v);
  assert.equal(kv.json("seo:bundle").ov["/factories/"].title, "A");
  assert.equal(kv.json("seo:bundle:prev").ov["/factories/"].title, "B");
  await call("/rollback", { method: "POST" });
  assert.equal(kv.json("seo:bundle").ov["/factories/"].title, "B", "rollback twice = redo");
  const h = await call("/history?kind=rollback");
  assert.equal(h.data.items.length, 2);
});

test("redirects: validation, loops, chain collapse, re-pointing, 410, list + delete", async () => {
  const { call, kv } = await setup();
  const post = body => call("/redirects", { method: "POST", body });
  assert.equal((await post({ from: "/a/", to: "/a" })).data.field, "to", "loop to itself (slash variant)");
  for (const [b, f] of [[{ from: "/", to: "/x/" }, "from"], [{ from: "/api/x", to: "/x/" }, "from"], [{ from: "/x?y=1", to: "/x/" }, "from"], [{ from: "/x/", to: "https://evil.example/" }, "to"], [{ from: "/x/", to: "//evil.example/" }, "to"], [{ from: "/x/", to: "/\\evil.example" }, "to"], [{ from: "/x/", to: "/y/", code: 307 }, "code"], [{ from: "x/", to: "/y/" }, "from"]])
    assert.equal((await post(b)).data.field, f, JSON.stringify(b));
  const r1 = await post({ from: "/b/", to: "https://www.madeinegyptgate.com/about/?ref=1", note: "قديم" });
  assert.deepEqual(r1.data.redirect, { from: "/b/", to: "/about/?ref=1", code: 301 });
  const r2 = await post({ from: "/c/", to: "/b/" });
  assert.equal(r2.data.redirect.to, "/about/?ref=1", "chain collapsed to the final target");
  assert.equal(r2.data.collapsed, true);
  const r3 = await post({ from: "/d/", to: "/old-a/" });
  assert.equal(r3.data.redirect.to, "/about/", "collapsed through the build redirects too");
  const r4 = await post({ from: "/about/", to: "/c/" });
  assert.equal(r4.data.code, "redirect_loop");
  await post({ from: "/e/", to: "/f/" });
  const r5 = await post({ from: "/f/", to: "/factories/" });
  assert.deepEqual(r5.data.repointed, ["/e/"]);
  assert.equal(kv.json("seo:bundle").rd["/e/"].to, "/factories/", "no chain left behind");
  assert.ok(r5.data.warnings.length === 0);
  const r6 = await post({ from: "/g/", to: "/nowhere/" });
  assert.equal(r6.data.warnings[0].field, "to");
  assert.equal((await post({ from: "/gone-page/", code: 410 })).data.redirect.code, 410);
  assert.equal((await post({ from: "/h/", to: "/gone-page/" })).data.code, "target_gone");
  const ar = await post({ from: `/old/${AR}`, to: AR_PATH });
  assert.equal(ar.data.redirect.from, `/old/${AR}`);
  const l = await call("/redirects?q=" + encodeURIComponent("قديم"));
  assert.deepEqual(l.data.admin.map(x => x.from), ["/b/"]);
  assert.equal(l.data.build_count, 3);
  assert.equal((await call("/redirects")).data.admin.length, 8);
  assert.equal((await call("/redirects?from=/b", { method: "DELETE" })).data.removed, true, "slash variant accepted");
  assert.equal(kv.json("seo:bundle").rd["/b/"], undefined);
  assert.equal((await call("/redirects", { method: "DELETE" })).status, 400);
});
test("redirect helpers (pure)", () => {
  assert.deepEqual(validateRedirect({ from: "https://madeinegyptgate.com/x/", to: "/y/" }, "https://madeinegyptgate.com").errors, []);
  assert.equal(validateRedirect({ from: "https://other.example/x/", to: "/y/" }, "https://madeinegyptgate.com").errors[0].field, "from");
  assert.deepEqual(collapseTarget({ "/b/": { to: "/c/", code: 301 } }, null, "/a/", "/b"), { to: "/c/", collapsed: true });
  assert.deepEqual(collapseTarget({ "/b/": { to: "/a/", code: 301 } }, null, "/a/", "/b/"), { loop: true });
});

test("config: verification tokens (pasted meta tag ok), robots extra lines (block-all needs confirm), thresholds", async () => {
  const { call, kv } = await setup();
  const v = await call("/config", { method: "PUT", body: { verify: { google: '<meta name="google-site-verification" content="AbC_123-xyz.987" />', bing: "msvalidate.01=0123456789ABCDEF", yandex: "" } } });
  assert.equal(v.status, 200, v.text);
  assert.deepEqual(kv.json("seo:bundle").cfg.verify, { google: "AbC_123-xyz.987", bing: "0123456789ABCDEF" });
  assert.equal((await call("/config", { method: "PUT", body: { verify: { google: "<script>" } } })).data.field, "verify.google");
  await call("/config", { method: "PUT", body: { verify: { yandex: "yandexToken99" } } });
  assert.deepEqual(kv.json("seo:bundle").cfg.verify, { google: "AbC_123-xyz.987", bing: "0123456789ABCDEF", yandex: "yandexToken99" }, "engines not sent are kept");
  await call("/config", { method: "PUT", body: { verify: { bing: "" } } });
  assert.deepEqual(Object.keys(kv.json("seo:bundle").cfg.verify).sort(), ["google", "yandex"]);
  assert.equal((await call("/config", { method: "PUT", body: { verify: { baidu: "12345678" } } })).status, 400);
  const blk = await call("/config", { method: "PUT", body: { robots_extra: ["User-agent: *", "Disallow: /"] } });
  assert.deepEqual([blk.status, blk.data.code], [400, "confirm_block_all"]);
  assert.equal((await call("/config", { method: "PUT", body: { robots_extra: "User-agent: *\nDisallow: /", confirm_block_all: true } })).status, 200);
  assert.equal((await call("/config", { method: "PUT", body: { robots_extra: ["Disallow: /x/"] } })).status, 400, "rules need a User-agent line");
  assert.equal((await call("/config", { method: "PUT", body: { robots_extra: ["User-agent: *", "Disallow: /x/ # comment"] } })).status, 400);
  const ok = await call("/config", { method: "PUT", body: { robots_extra: ["User-agent: GPTBot", "Allow: /", "", "User-agent: *", "Crawl-delay: 2", "Sitemap: https://madeinegyptgate.com/sitemaps/news.xml"] } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(kv.json("seo:bundle").cfg.robots_extra, ["User-agent: GPTBot", "Allow: /", "", "User-agent: *", "Crawl-delay: 2", "Sitemap: https://madeinegyptgate.com/sitemaps/news.xml"]);
  assert.equal((await call("/config", { method: "PUT", body: { thresholds: { min_hub_members: 0 } } })).status, 400);
  assert.equal((await call("/config", { method: "PUT", body: { thresholds: { min_hub_members: 7, slug_mode: "hash" } } })).status, 200);
  const g = await call("/config");
  assert.deepEqual([g.data.thresholds.min_hub_members, g.data.thresholds.slug_mode, g.data.thresholds.listing_page_size, g.data.verify.google, g.data.indexnow_key_set], [7, "hash", 50, "AbC_123-xyz.987", false]);
  const same = await call("/config", { method: "PUT", body: { thresholds: { min_hub_members: 7 } } });
  assert.equal(same.data.changed, false);
  const pure = validateRobotsExtra(["User-agent: Googlebot", "Disallow: /", "User-agent: *", "Allow: /"]);
  assert.deepEqual([pure.block_all, pure.blocked_agents, pure.errors[0].code], [true, ["googlebot"], "confirm_block_all"], "a whole-site block for ONE engine is still a block-all");
});
test("robots block-all: every form and agent needs confirm_block_all, from an admin; unchanged blocks re-save freely", async () => {
  const { call, kv, seo } = await setup();
  const put = (lines, o = {}) => call("/config", { method: "PUT", body: { robots_extra: lines, ...(o.confirm ? { confirm_block_all: true } : {}) }, ...(o.as ? { as: o.as } : {}) });
  for (const lines of [["User-agent: *", "Disallow: /*"], ["User-agent: Googlebot", "Disallow: /"], ["User-agent: Googlebot", "User-agent: Bingbot", "Disallow: /*"], ["User-agent: *", "Disallow: *"], ["User-agent: *", "Disallow: /*$"], ["User-agent: Yandex", "Disallow: /**"]]) {
    const r = await put(lines);
    assert.deepEqual([r.status, r.data.code], [400, "confirm_block_all"], lines.join(" | "));
  }
  for (const lines of [["User-agent: *", "Disallow: /$"], ["User-agent: *", "Disallow:"], ["User-agent: *", "Disallow: /tmp/"], ["User-agent: GPTBot", "Allow: /"]])
    assert.equal((await put(lines)).status, 200, lines.join(" | ") + " is not a whole-site block");
  const s1 = await put(["User-agent: Googlebot", "Disallow: /"], { as: seo, confirm: true });
  assert.deepEqual([s1.status, s1.data.code], [403, "admin_only"], "the SEO role cannot shut search engines out");
  assert.equal((await put(["User-agent: Googlebot", "Disallow: /"], { as: seo })).data.code, "admin_only");
  const a1 = await put(["User-agent: CCBot", "Disallow: /"], { confirm: true });
  assert.equal(a1.status, 200, a1.text);
  assert.deepEqual((await call("/config")).data.robots_blocked_agents, ["ccbot"]);
  const s2 = await put(["User-agent: CCBot", "Disallow: /", "", "User-agent: *", "Disallow: /tmp/"], { as: seo });
  assert.equal(s2.status, 200, "an admin's existing block stays; the SEO role edits other lines without a confirm");
  assert.deepEqual(kv.json("seo:bundle").cfg.robots_extra, ["User-agent: CCBot", "Disallow: /", "", "User-agent: *", "Disallow: /tmp/"]);
});
test("verification tokens and rollbacks that touch them are admin-only (ownership in Search Console); thresholds keys", async () => {
  const { call, kv, seo } = await setup();
  const sv = await call("/config", { method: "PUT", as: seo, body: { verify: { google: "seoTeamToken123" } } });
  assert.deepEqual([sv.status, sv.data.code], [403, "admin_only"]);
  assert.equal(kv.json("seo:bundle"), null, "nothing saved");
  assert.equal((await call("/config", { method: "PUT", body: { verify: { google: "adminToken12345" } } })).status, 200);
  assert.equal((await call("/config", { method: "PUT", as: seo, body: { verify: { google: "adminToken12345" } } })).status, 200, "re-saving the same token is not a change");
  await call("/page", { method: "PUT", as: seo, body: { path: "/factories/", title: "عنوان من فريق SEO للدليل" } });
  const rb = await call("/rollback", { method: "POST", as: seo });
  assert.equal(rb.status, 200, "this rollback leaves verification as it is");
  await call("/config", { method: "PUT", body: { verify: { google: "adminToken99999" } } });
  const rb2 = await call("/rollback", { method: "POST", as: seo });
  assert.deepEqual([rb2.status, rb2.data.code], [403, "admin_only"], "a rollback that would change verification");
  assert.equal(kv.json("seo:bundle").cfg.verify.google, "adminToken99999");
  assert.equal((await call("/config", { as: seo })).data.can.verify, false);
  for (const k of ["toString", "constructor", "valueOf", "__proto__"]) {
    const r = await call("/config", { method: "PUT", body: JSON.stringify({ thresholds: { [k]: 5 } }), headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 400, k);
  }
});
test("privacy: phones, WhatsApp numbers and e-mails are refused in every public override field (owner rule)", async () => {
  const { call, kv } = await setup();
  const put = body => call("/page", { method: "PUT", body: { path: "/factories/", ...body } });
  for (const [f, v] of [["description", "مصنع في هليوبوليس – القاهرة، 02/ 22 419 416 للتواصل المباشر مع المبيعات"], ["title", "مصنع الحديد 0100 123 4567"], ["intro", "للتواصل: sales [at] factory [dot] com"], ["h1", "واتساب ٠١٠٠١٢٣٤٥٦٧"], ["og_description", "الخط الساخن 19876"], ["keywords", "حديد, info@factory.example"]]) {
    const r = await put({ [f]: v });
    assert.deepEqual([r.status, r.data.field], [400, f], f + ": " + v);
    assert.match(r.data.error, /phone numbers|البريد/);
  }
  const ld = await put({ jsonld: { "@context": "https://schema.org", "@type": "Organization", name: "x", telephone: "+20 100 123 4567" } });
  assert.deepEqual([ld.status, ld.data.field], [400, "jsonld"]);
  const ld2 = await put({ jsonld: { "@context": "https://schema.org", "@type": "Organization", name: "x", sameAs: ["https://wa.me/201001234567"] } });
  assert.equal(ld2.status, 400);
  assert.equal(kv.json("seo:bundle"), null, "nothing saved");
  const own = await call("/page", { method: "PUT", body: { path: "/", description: "منصة صنع في مصر: دليل المصانع المصرية والمناقصات – الخط الساخن 02 38346757 و info@madeinegyptgate.com", jsonld: { "@context": "https://schema.org", "@type": "Organization", name: "منصة صنع في مصر", telephone: "+20238346757", email: "info@madeinegyptgate.com", contactPoint: [{ "@type": "ContactPoint", telephone: "+201279188996", email: "support@madeinegyptgate.com" }] } } });
  assert.equal(own.status, 200, "the platform's own published contacts are allowed: " + own.text);
  const ok = await put({ description: "دليل المصانع المصرية: 3,014 منشأة في 38 قطاعاً و27 محافظة منذ 2004 – ISO 9001:2015، واطلب عرض سعر مجاناً." });
  assert.equal(ok.status, 200, "numbers that are not phones pass: " + ok.text);
  const csv = toCsv(["path", "description"], [["/factories/", "اتصل بنا على 01001234567 لطلب الأسعار والكميات المتاحة لدى المصنع"]]);
  const imp = await call("/import?kind=overrides&dry_run=1", { method: "POST", body: csv });
  assert.deepEqual([imp.data.errors.length, imp.data.errors[0].field, imp.data.errors[0].line], [1, "description", 2]);
  const extra = await setup({ SEO_PUBLIC_CONTACTS: "+20 2 12345678, @partner.example" });
  assert.equal((await extra.call("/page", { method: "PUT", body: { path: "/factories/", description: "للاستفسار: 02 12345678 أو desk@partner.example – منصة صنع في مصر، دليل المصانع المصرية." } })).status, 200, "SEO_PUBLIC_CONTACTS widens the allow-list");
});
test("preview deployments are read-only (they share the production KV); the production alias and custom domain write", async () => {
  const { env, admin } = await setup();
  const at = async (base, method = "PUT", extra = {}) => { const res = await handleSeoApi(pctx(rq("/api/seo/page", { method, base, token: admin, body: method === "GET" ? undefined : { path: "/factories/", title: "عنوان معاينة لدليل المصانع" } }), { ...env, ...extra })); return { status: res.status, data: await res.json() }; };
  const p = await at("https://3f2a1b.madeinegyptgate.pages.dev");
  assert.deepEqual([p.status, p.data.code], [403, "preview_read_only"]);
  assert.equal((await at("https://feature-x.madeinegyptgate.pages.dev")).status, 403);
  assert.equal((await handleSeoApi(pctx(rq("/api/seo/health", { base: "https://3f2a1b.madeinegyptgate.pages.dev", token: admin }), env))).status, 200, "reads work on previews");
  assert.equal((await at("https://madeinegyptgate.pages.dev")).status, 200, "the production alias writes");
  assert.equal((await at("https://3f2a1b.madeinegyptgate.pages.dev", "PUT", { SEO_PREVIEW_WRITES: "1" })).status, 200, "allowed when previews get their own KV");
  const pk = await handleSeoApi(pctx(rq("/api/seo/indexnow", { method: "POST", base: "https://3f2a1b.madeinegyptgate.pages.dev", headers: { "X-Platform-Key": "pk-test" }, body: { urls: ["/"] } }), env));
  assert.equal(pk.status, 403, "no IndexNow pings from previews either");
});
test("redirects INTO a hub work although the build map holds its slash-variant self entry", async () => {
  const { call } = await setup();
  const r = await call("/redirects", { method: "POST", body: { from: "/old-hub/", to: "/factories/" } });
  assert.deepEqual([r.status, r.data.redirect && r.data.redirect.to], [200, "/factories/"], r.text);
  assert.equal((await call("/redirects", { method: "POST", body: { from: "/factories", to: "/factories/" } })).data.field, "to", "the self redirect itself is still refused");
});

test("IndexNow: key, send (URLs / all / since), log, host check, daily cap", async () => {
  const { call, kv, env } = await setup();
  assert.equal((await call("/indexnow", { method: "POST", body: { urls: ["https://madeinegyptgate.com/"] } })).status, 409);
  const k = await call("/indexnow/key", { method: "POST" });
  assert.match(k.data.key, /^[0-9a-f]{32}$/);
  assert.equal(kv.json("seo:bundle").cfg.indexnow_key, k.data.key);
  assert.equal((await call("/config")).data.indexnow_key_url, `https://madeinegyptgate.com/${k.data.key}.txt`);
  const sent = [];
  const fake = async (u, init) => { sent.push({ u: String(u), body: JSON.parse(init.body) }); return new Response("", { status: 202 }); };
  const r = await withFetch(() => call("/indexnow", { method: "POST", body: { urls: ["https://madeinegyptgate.com/factories/", "/about/", "https://madeinegyptgate.com/factories/"] } }), fake);
  assert.deepEqual([r.status, r.data.ok, r.data.sent, r.data.status], [200, true, 2, 202]);
  assert.equal(sent[0].u, "https://api.indexnow.org/indexnow");
  assert.deepEqual(sent[0].body, { host: "madeinegyptgate.com", key: k.data.key, keyLocation: `https://madeinegyptgate.com/${k.data.key}.txt`, urlList: ["https://madeinegyptgate.com/factories/", "https://madeinegyptgate.com/about/"] });
  const bad = await call("/indexnow", { method: "POST", body: { urls: ["https://evil.example/x"] } });
  assert.deepEqual([bad.status, bad.data.code], [400, "url_not_on_host"]);
  const all = await withFetch(() => call("/indexnow", { method: "POST", body: { all: true } }), fake);
  assert.equal(all.data.sent, 4, "all = indexable manifest pages (the thin noindex company is left out)");
  assert.ok(sent[1].body.urlList.includes("https://madeinegyptgate.com/en/"));
  await call("/page", { method: "PUT", body: { path: AR_PATH, title: "عنوان جديد", robots: "index,follow" } });
  const since = await withFetch(() => call("/indexnow", { method: "POST", body: { since: "2026-11-15" } }), fake);
  assert.deepEqual(sent[2].body.urlList, ["https://madeinegyptgate.com" + encodeURI(AR_PATH)], "edited pages + manifest lastmod ≥ since, minus pages already sent in their current state");
  assert.deepEqual([since.data.ok, since.data.skipped], [true, 1], "/factories/ (lastmod 2026-11-17) went out with «all» and has not changed since");
  const again = await withFetch(() => call("/indexnow", { method: "POST", body: { since: "2026-11-15" } }), fake);
  assert.deepEqual([again.status, again.data.code, again.data.skipped], [400, "no_urls", 2], "a same-day repeat sends nothing");
  assert.match(again.data.error, /nothing changed since the last send/);
  const re = await withFetch(() => call("/indexnow", { method: "POST", body: { since: "2026-11-15", resend: true } }), fake);
  assert.equal(re.data.sent, 2, "resend:true ignores the ledger");
  const ping = await withFetch(() => call("/page", { method: "PUT", body: { path: "/about/", title: "عن", ping_indexnow: true } }), fake);
  assert.equal(ping.data.indexnow.ok, true);
  const log = await call("/indexnow/log");
  assert.deepEqual(log.data.items.map(i => i.source), ["page", "since", "since", "all", "urls"]);
  const day = new Date().toISOString().slice(0, 10);
  kv.m.set("seo:indexnow:day:" + day, "20");
  const cap = await withFetch(() => call("/indexnow", { method: "POST", body: { urls: ["/"] } }), fake);
  assert.deepEqual([cap.status, cap.data.code], [429, "daily_limit"]);
  kv.m.set("seo:indexnow:day:" + day, "0");
  const e403 = await withFetch(() => call("/indexnow", { method: "POST", body: { urls: ["/"] } }), async () => new Response("", { status: 403 }));
  assert.deepEqual([e403.data.ok, e403.data.status], [false, 403]);
  assert.match(e403.data.message, /key file/);
  assert.equal(env.INDEXNOW_KEY, undefined);
});

test("CSV: export → re-import dry run = 0 changes (Arabic, BOM, formula guard); atomic errors; redirects", async () => {
  const { call, kv } = await setup();
  await call("/page", { method: "PUT", body: { path: AR_PATH, title: "=HYPERLINK(\"x\") مصنع", description: "وصف، مع \"علامات\" وفواصل, و; سطر", jsonld: '{"@context":"https://schema.org","@type":"Organization","name":"م"}', target_kw: "تشكيل المعادن", secondary_kw: ["معادن", "سادات"] } });
  await call("/page", { method: "PUT", body: { path: "/factories/", robots: "noindex,follow", note: "-مؤقت" } });
  await call("/page", { method: "PUT", body: { path: "/about/", target_kw: "عن المنصة" } });
  const ex = await call("/export.csv?kind=overrides");
  assert.equal(ex.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.match(ex.headers.get("Content-Disposition"), /attachment; filename="seo-overrides-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(ex.text.charCodeAt(0), 0xfeff, "UTF-8 BOM for Excel");
  assert.ok(ex.text.includes("'=HYPERLINK"), "formula guard on export");
  const rows = csvParse(ex.text);
  assert.deepEqual(rows[0], ["path", "title", "description", "keywords", "h1", "intro", "canonical", "robots", "og_title", "og_description", "og_image", "jsonld", "target_kw", "secondary_kw", "note"]);
  assert.equal(rows.length, 4);
  const v0 = kv.json("seo:bundle").v;
  const dry = await call("/import?kind=overrides&dry_run=1", { method: "POST", body: ex.text });
  assert.equal(dry.status, 200, dry.text);
  assert.deepEqual([dry.data.create, dry.data.update, dry.data.unchanged, dry.data.delete, dry.data.errors.length], [0, 0, 3, 0, 0], "A12: export → re-import dry run → 0 changes");
  const real = await call("/import?kind=overrides", { method: "POST", body: ex.text });
  assert.equal(real.data.applied, true);
  assert.equal(kv.json("seo:bundle").v, v0, "nothing changed → no publish");
  const edited = toCsv(rows[0], [
    [AR_PATH, "عنوان جديد", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["/en/", "Made in Egypt Gate – English", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["/factories/", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ]);
  const d2 = await call("/import?kind=overrides&dry_run=1", { method: "POST", body: edited });
  assert.deepEqual([d2.data.create, d2.data.update, d2.data.delete, d2.data.unchanged], [1, 1, 1, 0]);
  const broken = edited.replace("/en/", "/no-such/") + "/factories/,x\r\n";
  const b = await call("/import?kind=overrides", { method: "POST", body: broken });
  assert.equal(b.status, 400);
  assert.deepEqual(b.data.errors.map(e => [e.line, e.field]), [[3, "path"], [5, "path"]]);
  assert.equal(kv.json("seo:bundle").v, v0, "errors → nothing applied");
  const ok = await call("/import?kind=overrides", { method: "POST", body: edited });
  assert.equal(ok.data.applied, true);
  const bb = kv.json("seo:bundle");
  assert.deepEqual(bb.ov[AR_PATH], { title: "عنوان جديد" });
  assert.equal(bb.ov["/factories/"], undefined);
  assert.equal(bb.ov["/en/"].title, "Made in Egypt Gate – English");
  assert.equal(bb.meta.ov["/about/"].target_kw, "عن المنصة", "rows not in the file are left alone");
  const semi = await call("/import?kind=overrides&dry_run=1", { method: "POST", body: "path;title\n/about/;عنوان بفاصلة منقوطة\n" });
  assert.equal(semi.data.update, 1, "semicolon CSV (Excel in some locales)");
  assert.equal((await call("/import?kind=overrides", { method: "POST", body: "title\nx\n" })).data.code, "missing_column");
  assert.equal((await call("/import?kind=pages", { method: "POST", body: "path\n/\n" })).status, 400);
  await call("/redirects", { method: "POST", body: { from: "/r1/", to: "/about/", note: "ملاحظة" } });
  await call("/redirects", { method: "POST", body: { from: "/r2/", code: 410 } });
  const rx = await call("/export.csv?kind=redirects");
  const rdry = await call("/import?kind=redirects&dry_run=1", { method: "POST", body: rx.text });
  assert.deepEqual([rdry.data.create, rdry.data.update, rdry.data.unchanged], [0, 0, 2]);
  const chain = await call("/import?kind=redirects", { method: "POST", body: "from,to,code\n/r3/,/r1/,301\n/r4/,/r4/,301\n" });
  assert.equal(chain.status, 400);
  assert.equal(chain.data.errors[0].field, "to");
  const chain2 = await call("/import?kind=redirects", { method: "POST", body: "from,to,code\n/r3/,/r1/,301\n" });
  assert.equal(chain2.data.applied, true);
  assert.equal(kv.json("seo:bundle").rd["/r3/"].to, "/about/", "imported chains are collapsed");
  const up = await call("/import?kind=redirects", { method: "POST", body: "from,to,code\n/about/,/contact-us/,301\n" });
  assert.deepEqual(up.data.repointed.sort(), ["/r1/", "/r3/"], "existing redirects into an imported source are re-pointed (no 2-hop chains)");
  assert.equal(kv.json("seo:bundle").rd["/r1/"].to, "/contact-us/");
  const big = "path,title\n" + Array.from({ length: 5001 }, (_, i) => `/p${i}/,t`).join("\n");
  assert.equal((await call("/import?kind=overrides&dry_run=1", { method: "POST", body: big })).status, 413);
});

test("manifest rows as seo_build.part.py writes them ({rows}, h1 MULTI, per-page kw)", async () => {
  const { normalizeManifest } = await import("../_lib/seo-api.js");
  const rows = normalizeManifest({ v: 1, built: "2026-11-18", site: "https://madeinegyptgate.com", count: 2, rows: [{ p: "/about/", l: "ar", t: "static", ti: "عن", h1: "MULTI", kw: "منصة صنع في مصر" }, { p: "https://madeinegyptgate.com/factories/?x", t: "hub-factories", h1: "دليل" }, { p: "/about/" }] });
  assert.deepEqual(rows.map(r => [r.path, r.h1, r.h1_count, r.kw]), [["/about/", "", 2, "منصة صنع في مصر"], ["/factories/", "دليل", 1, ""]]);
  assert.equal(normalizeManifest({ "/x/": { ti: "t" } })[0].title, "t");
  assert.equal(normalizeManifest("nope"), null);
});
test("pages list: manifest + overrides + score, filters, pagination, summary, CSV export", async () => {
  const { call } = await setup();
  await call("/page", { method: "PUT", body: { path: "/about/", title: "عن منصة صنع في مصر ودورها في دعم الصناعة المصرية" } });
  const all = await call("/pages");
  assert.equal(all.status, 200);
  assert.equal(all.data.total, 5);
  assert.deepEqual([all.data.summary.pages, all.data.summary.overrides, all.data.summary.noindex, all.data.summary.by_lang.en], [5, 1, 1, 1]);
  assert.deepEqual(all.data.summary.noindex_reasons, { thin: 1 });
  const hub = all.data.items.find(i => i.path === "/factories/");
  assert.equal(hub.target_kw, "دليل المصانع", "cluster keyword from /_seo/keywords.json");
  assert.equal(hub.kw_title, true);
  assert.ok(hub.issues.includes("img_alt"));
  assert.ok(typeof hub.score === "number" && hub.score > 0 && hub.score <= 100);
  assert.equal(hub.ti, ROWS[1].ti);
  assert.equal((await call("/pages?type=company")).data.total, 1);
  assert.equal((await call("/pages?lang=en")).data.total, 1);
  assert.equal((await call("/pages?issue=overridden")).data.items[0].path, "/about/");
  assert.equal((await call("/pages?override=1")).data.total, 1);
  assert.equal((await call("/pages?issue=thin")).data.items[0].path, AR_PATH);
  assert.equal((await call("/pages?q=" + encodeURIComponent("السادات"))).data.total, 1);
  const pg = await call("/pages?limit=2&offset=2&sort=path");
  assert.deepEqual([pg.data.items.length, pg.data.offset, pg.data.limit], [2, 2, 2]);
  const sorted = await call("/pages?sort=score");
  assert.ok(sorted.data.items[0].score <= sorted.data.items[4].score);
  const csv = await call("/export.csv?kind=pages&issue=thin");
  const rows = csvParse(csv.text);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], AR_PATH);
  const one = await call("/page?path=" + encodeURIComponent(AR_PATH));
  assert.equal(one.data.defaults.why, "thin");
  const nomani = await setup({ ASSETS: assets({ "/index.html": page("x") }) });
  assert.equal((await nomani.call("/pages")).data.code, "manifest_unavailable");
});

test("keywords (seeded from the build), Search Console CSV (English + Arabic headers), rebuild, test URL, history, size cap, rate limit", async () => {
  const { call, kv, env } = await setup();
  const k = await call("/keywords");
  assert.deepEqual([k.data.source, k.data.items[0].cluster, k.data.items[0].difficulty], ["build", "B", "H"]);
  const kp = await call("/keywords", { method: "PUT", body: { cluster: "C", target_url: "https://madeinegyptgate.com/tenders/", target_kw: "مناقصات مصر", secondary_kw: "مناقصات اليوم، مناقصات حكومية", difficulty: "high" } });
  assert.deepEqual(kp.data.items.map(i => i.cluster), ["B", "C"]);
  assert.deepEqual(kp.data.items[1].secondary_kw, ["مناقصات اليوم", "مناقصات حكومية"]);
  assert.equal((await call("/keywords")).data.source, "kv");
  assert.equal((await call("/keywords", { method: "PUT", body: { cluster: "bad cluster!" } })).status, 400);
  const g1 = await call("/gsc/import", { method: "POST", body: "\uFEFFTop pages,Clicks,Impressions,CTR,Position\nhttps://madeinegyptgate.com/factories/,12,340,3.53%,8.4\nhttps://madeinegyptgate.com/,5,\"1,200\",0.42%,11\n" });
  assert.deepEqual([g1.data.kind, g1.data.rows], ["pages", 2]);
  const g2 = await call("/gsc/import", { method: "POST", body: "أهم طلبات البحث,النقرات,مرات الظهور,نسبة النقر إلى الظهور,الموضع\nمصانع مصر,٣,١٢٠,٢٫٥%,٧٫٢\n" });
  assert.deepEqual([g2.data.kind, g2.data.rows], ["queries", 1]);
  const g = await call("/gsc?page=" + encodeURIComponent("/factories/"));
  assert.deepEqual([g.data.connected, g.data.source], [false, "csv"]);
  const q = g.data.rows.find(r => r.kind === "query");
  assert.deepEqual([q.clicks, q.impressions, q.ctr, q.position], [3, 120, 0.025, 7.2]);
  const p = g.data.rows.filter(r => r.kind === "page");
  assert.deepEqual(p.map(r => [r.path, r.impressions, r.ctr]), [["/factories/", 340, 0.0353]]);
  assert.equal((await call("/gsc/import", { method: "POST", body: "a,b\n1,2\n" })).data.code, "gsc_format");
  const rb = await call("/rebuild", { method: "POST" });
  assert.deepEqual([rb.status, rb.data.ok, rb.data.reason], [200, false, "deploy_hook_not_configured"]);
  env.PAGES_DEPLOY_HOOK = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/abc";
  let hooked = 0;
  const rb2 = await withFetch(() => call("/rebuild", { method: "POST" }), async (u, init) => { hooked++; assert.equal(init.method, "POST"); return new Response("{}", { status: 200 }); });
  assert.deepEqual([rb2.data.ok, hooked], [true, 1]);
  assert.equal((await call("/rebuild", { method: "POST" })).status, 429, "1 per 10 minutes");
  const chainFetch = async u => { u = String(u); if (u === "http://www.madeinegyptgate.com/about.html") return new Response(null, { status: 301, headers: { Location: "https://madeinegyptgate.com/about.html" } }); if (u === "https://madeinegyptgate.com/about.html") return new Response(null, { status: 301, headers: { Location: "/about/" } }); return new Response("ok", { status: 200 }); };
  const t = await withFetch(() => call("/test?url=" + encodeURIComponent("http://www.madeinegyptgate.com/about.html")), chainFetch);
  assert.deepEqual([t.data.hops, t.data.final_status, t.data.chain.length], [2, 200, 3]);
  assert.match(t.data.warning, /more than one/);
  assert.equal((await call("/test?url=" + encodeURIComponent("https://evil.example/"))).data.code, "not_our_host");
  const h = await call("/history?limit=50");
  assert.deepEqual(h.data.items.map(i => i.kind).sort(), ["gsc_import", "gsc_import", "keywords", "rebuild"]);
  kv.m.set("seo:bundle", JSON.stringify({ v: 1, rd: {}, cfg: {}, meta: {}, ov: { "/big/": { title: "x".repeat(5 * 1024 * 1024) } } }));
  assert.equal((await call("/page", { method: "PUT", body: { path: "/about/", title: "t" } })).data.code, "bundle_too_large");
  kv.m.delete("seo:bundle");
  let last;
  for (let i = 0; i < 121; i++) last = await call("/page?path=/nothing-here/", { method: "DELETE" });
  assert.deepEqual([last.status, last.data.code], [429, "rate_limited"], "120 writes per minute per member");
  assert.equal((await call("/health")).status, 200, "reads are not rate limited");
});
