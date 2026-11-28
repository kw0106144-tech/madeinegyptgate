// functions/_middleware.js end to end with KV + ASSETS doubles: legacy URLs, redirect precedence and one-hop flattening,
// 404 → prefix 301 / 410, IndexNow key file, robots extras, overrides on Arabic paths, verification metas, ETag/304,
// HEAD, fail-open (spec §2.3, A7, A9).
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../_middleware.js";
import { resetEdgeMemos } from "../_lib/seo-edge.js";
import { KV, assets, pctx, getHTMLRewriter } from "./helpers.mjs";

const { HR, engine } = getHTMLRewriter();
globalThis.HTMLRewriter = HR;
const AR = "تشكيل-المعادن-في-السادات", AR_PATH = `/factories/${AR}/`, ENC = encodeURI(AR_PATH);
const page = (t, extra = "") => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${t}</title><meta name="description" content="وصف ${t}"><meta name="robots" content="index,follow"><meta property="og:title" content="${t}"><meta name="twitter:title" content="${t}"><link rel="canonical" href="https://madeinegyptgate.com/"></head><body><h1 data-seo="h1">${t}</h1>${extra}</body></html>`;
const ROBOTS = "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_seo/\n\nSitemap: https://madeinegyptgate.com/sitemap.xml\n";
const FILES = {
  "/index.html": page("الرئيسية"), "/factories/index.html": page("دليل المصانع", '<p data-seo="intro">مقدمة</p>'), [`${AR_PATH}index.html`]: page("تشكيل المعادن"),
  "/tenders/index.html": page("المناقصات"), "/tenders/page/2/index.html": page("المناقصات – صفحة 2"), "/media-center/index.html": page("المركز الإعلامي"),
  "/about/index.html": page("عن المنصة"), "/contact/index.html": page("اتصل بنا"), "/news/index.html": page("الأخبار"), "/en/index.html": page("Home"), "/en/about/index.html": page("About"),
  "/en/factories/index.html": page("Factories"),
  "/robots.txt": ROBOTS, "/404.html": "<!doctype html><title>404</title><h1>الصفحة غير موجودة</h1>", "/data/app.js": "console.log(1)",
  "/_seo/redirects.json": {
    exact: { "/about.html": "/about/", "/home.html": "/", "/manufacturers": "/factories/", "/manufacturers/": "/factories/", "/products/": "/products/", "/chain/": "/about.html", "/factory.html": "/factories/",
      // exactly what seo_build.part.py emits today: slash-variant self entries next to the redirects INTO those hubs
      "/factories": "/factories/", "/tenders": "/tenders/", "/rfq": "/rfq/", "/products": "/products/", "/factories.html": "/factories/", "/tenders.html": "/tenders/", "/old-promo/": "/old-page/" },
    prefix: [["/tenders/page/", "/tenders/"], ["/media-center/", "/news/"], ["/ar/20", "/news/"], ["/category/", "/factories/"], ["/promo-hub/", "/promo-hub/"]],
    gone_rx: ["^/(ar/)?wp-(json|content|admin|includes)(/|$)", "^/xmlrpc\\.php$", "^/(ar/)?feed/?$"],
    gone_prefix_on_404: ["/factories/", "/industrial_products/", "/tender-item/", "/rfq/"],
  },
  "/_seo/en-paths.json": { "/": "/en/", "/about/": "/en/about/", "/factories/": "/en/factories/" },
};
const KEY = "0123456789abcdef0123456789abcdef";
const BUNDLE = {
  v: 1731900000123, at: "2026-11-18T10:00:00Z", by: "uadmin",
  ov: {
    "/factories/": { title: "</title><script>alert(1)</script> دليل المصانع المصرية", description: "وصف جديد", robots: "noindex,follow", og_title: "OG", intro: "مقدمة جديدة" },
    [AR_PATH]: { title: "تشكيل المعادن – مصنع في السادات", h1: "تشكيل المعادن في السادات", intro: "نبذة", ix: 1 },
    "/": { description: "الصفحة الرئيسية الجديدة" },
  },
  rd: { "/about.html": { to: "/contact/", code: 301 }, "/x-admin/": { to: "/about.html", code: 301 }, "/l1/": { to: "/l2/", code: 301 }, "/l2/": { to: "/l1/", code: 301 }, "/old-page/": { to: "", code: 410 }, "/promo/": { to: "/factories/", code: 302 }, "/out/": { to: "https://evil.example/", code: 301 } },
  cfg: { verify: { google: "googleToken_123", bing: "0123456789ABCDEF" }, robots_extra: ["User-agent: GPTBot", "Allow: /"], indexnow_key: KEY },
};
function setup({ bundle = BUNDLE, files = FILES, env: extra = {} } = {}) {
  resetEdgeMemos();
  const kv = new KV(bundle ? { "seo:bundle": bundle } : {}), A = assets(files);
  const env = { SEO_KV: kv, ASSETS: A, ...extra };
  const get = async (path, { method = "GET", headers = {}, base = "https://madeinegyptgate.com" } = {}) => {
    const c = pctx(new Request(base + path, { method, headers }), env);
    const res = await onRequest(c);
    return { res, status: res.status, loc: res.headers.get("Location"), h: res.headers, text: method === "HEAD" ? "" : await res.text(), c };
  };
  return { env, kv, A, get };
}

test("engine: " + engine, () => assert.ok(globalThis.HTMLRewriter));

test("legacy query URLs: /?p=N and ?lang=en (A7)", async () => {
  const { get } = setup();
  for (const p of ["/?p=196", "/?page_id=12&x=1"]) { const r = await get(p); assert.deepEqual([r.status, r.loc], [301, "https://madeinegyptgate.com/"]); }
  assert.equal((await get("/?lang=en")).loc, "https://madeinegyptgate.com/en/");
  assert.equal((await get("/about/?lang=en&utm=1")).loc, "https://madeinegyptgate.com/en/about/");
  const ct = await get("/contact/?lang=en");
  assert.deepEqual([ct.status, ct.loc], [200, null], "no EN twin → the page itself, ?lang=en kept for data/i18n.js");
  assert.equal((await get("/en/about/?lang=en")).loc, "https://madeinegyptgate.com/en/about/");
  const { get: g2 } = setup({ files: { ...FILES, "/_seo/en-paths.json": undefined } });
  assert.equal((await g2("/about/?lang=en")).loc, "https://madeinegyptgate.com/en/about/", "without en-paths.json the EN page is probed");
  const nw = await g2("/news/?lang=en");
  assert.deepEqual([nw.status, nw.loc], [200, null], "no EN page probed → served with the parameter");
});
test("IndexNow key file (bundle or env) and robots.txt (+ admin lines)", async () => {
  const { get } = setup({ env: { INDEXNOW_KEY: "envkey-0001" } });
  const k = await get(`/${KEY}.txt`);
  assert.deepEqual([k.status, k.text, k.h.get("Content-Type")], [200, KEY, "text/plain; charset=utf-8"]);
  assert.equal((await get("/envkey-0001.txt")).text, "envkey-0001");
  assert.equal((await get("/other-key-123.txt")).status, 404);
  const r = await get("/robots.txt");
  assert.equal(r.text, ROBOTS + "\nUser-agent: GPTBot\nAllow: /\n");
  const { get: g2 } = setup({ bundle: { ...BUNDLE, cfg: {} } });
  const r2 = await g2("/robots.txt");
  assert.equal(r2.text, ROBOTS, "A6: byte-equal to the build file when there are no admin lines");
});
test("redirect precedence: admin > build exact; one hop; loops and foreign hosts never redirect (A7)", async () => {
  const { get } = setup();
  assert.deepEqual([(await get("/about.html")).status, (await get("/about.html")).loc], [301, "https://madeinegyptgate.com/contact/"], "admin table wins over the build map");
  assert.equal((await get("/manufacturers")).loc, "https://madeinegyptgate.com/factories/");
  assert.equal((await get("/manufacturers/")).loc, "https://madeinegyptgate.com/factories/", "slash variant");
  assert.equal((await get("/factory.html?utm_source=wa")).loc, "https://madeinegyptgate.com/factories/?utm_source=wa", "query kept on exact redirects");
  assert.equal((await get("/home.html")).loc, "https://madeinegyptgate.com/");
  assert.equal((await get("/chain/")).loc, "https://madeinegyptgate.com/contact/", "build → build → admin collapsed into one hop");
  assert.equal((await get("/x-admin/")).loc, "https://madeinegyptgate.com/contact/");
  assert.equal((await get("/l1/")).status, 404, "admin loop → no redirect");
  assert.equal((await get("/products/")).status, 404, "self redirect in the build map is ignored");
  assert.equal((await get("/out/")).status, 404, "a redirect to another host is refused at the edge too");
  const g = await get("/old-page/");
  assert.deepEqual([g.status, g.h.get("X-Robots-Tag")], [410, "noindex"]);
  assert.match(g.text, /الصفحة غير موجودة/);
  const p = await get("/promo/");
  assert.deepEqual([p.status, p.h.get("Cache-Control")], [302, "no-store"]);
  assert.equal((await get("/manufacturers")).h.get("Cache-Control"), "public, max-age=3600");
  const head = await get("/about.html", { method: "HEAD" });
  assert.equal(head.status, 301);
});
test("WordPress junk → 410; unknown imported slugs → 410; legacy prefixes → 301 only when the page does not exist", async () => {
  const { get } = setup();
  for (const p of ["/ar/wp-json/wp/v2/products/1", "/wp-content/uploads/a.jpg", "/xmlrpc.php", "/ar/feed/"]) assert.equal((await get(p)).status, 410, p);
  assert.equal((await get("/factories/no-such-slug/")).status, 410, "A7");
  assert.equal((await get("/industrial_products/old/")).status, 410);
  assert.equal((await get("/tenders/page/132/")).loc, "https://madeinegyptgate.com/tenders/", "A7");
  const p2 = await get("/tenders/page/2/");
  assert.equal(p2.status, 200, "generated pagination is served, not redirected");
  assert.equal((await get("/media-center/")).status, 200, "a real page under a legacy prefix is served");
  assert.equal((await get("/media-center/old-item/")).loc, "https://madeinegyptgate.com/news/");
  assert.equal((await get("/ar/2019/05/x/")).loc, "https://madeinegyptgate.com/news/");
  const nf = await get("/random-missing/");
  assert.equal(nf.status, 404, "other 404s stay 404");
  const h = await get("/xmlrpc.php", { method: "HEAD" });
  assert.deepEqual([h.status, h.text], [410, ""]);
});
test("HTML override: title escaped, metas, X-Robots-Tag, X-SEO-Edge, verification metas only on / (A9)", async () => {
  const { get } = setup();
  const r = await get("/factories/");
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; دليل المصانع المصرية</title>"));
  assert.ok(!/<script>alert/.test(r.text));
  assert.ok(r.text.includes('<meta name="description" content="وصف جديد">'));
  assert.ok(r.text.includes('<meta name="robots" content="noindex,follow">'));
  assert.ok(r.text.includes('<meta property="og:title" content="OG">') && r.text.includes('<meta name="twitter:title" content="OG">'));
  assert.ok(r.text.includes('<p data-seo="intro">مقدمة جديدة</p>'));
  assert.deepEqual([r.h.get("X-SEO-Edge"), r.h.get("X-Robots-Tag"), r.h.get("Content-Length")], [String(BUNDLE.v), "noindex,follow", null]);
  assert.match(r.h.get("ETag"), /^W\/"seo-/);
  assert.ok(!r.text.includes("google-site-verification"), "verification metas only on /");
  const home = await get("/");
  const homeHead = home.text.slice(0, home.text.indexOf("</head>"));
  assert.ok(homeHead.includes('<meta name="google-site-verification" content="googleToken_123"><meta name="msvalidate.01" content="0123456789ABCDEF">'));
  assert.ok(homeHead.includes('<meta property="og:description" content="الصفحة الرئيسية الجديدة"><meta name="twitter:description" content="الصفحة الرئيسية الجديدة">'), "social description tags the page lacked are added");
  assert.ok(home.text.includes('<meta name="description" content="الصفحة الرئيسية الجديدة">'));
  const plain = await get("/about/");
  assert.equal(plain.text, FILES["/about/index.html"], "no override → bytes as built");
  assert.equal(plain.h.get("X-SEO-Edge"), String(BUNDLE.v));
  assert.match(plain.h.get("ETag"), /^"[0-9a-f]+"$/, "original ETag kept");
  const js = await get("/data/app.js");
  assert.deepEqual([js.text, js.h.get("X-SEO-Edge")], ["console.log(1)", null]);
});
test("Arabic paths: upper / lower case percent-encoding hit the same override; non-NFC → one 301 to NFC (A10)", async () => {
  const { get } = setup();
  for (const p of [ENC, ENC.toLowerCase().replace(/%[0-9a-f]{2}/g, m => m.toLowerCase())]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.ok(r.text.includes('<h1 data-seo="h1">تشكيل المعادن في السادات</h1><p data-seo="intro">نبذة</p>'), "H1 override + intro inserted after it");
    assert.ok(r.text.includes("<title>تشكيل المعادن – مصنع في السادات</title>"));
  }
  const nfd = "/factories/" + encodeURIComponent("ا" + String.fromCharCode(0x0653) + "بار") + "/";
  const n = await get(nfd);
  assert.deepEqual([n.status, n.loc], [301, "https://madeinegyptgate.com/factories/" + encodeURIComponent(String.fromCharCode(0x0622) + "بار") + "/"]);
});
test("ETag / 304 follow the bundle version; HEAD keeps the edge headers", async () => {
  const { get, kv, env } = setup({ env: { SEO_TTL: "5" } });
  const a = await get("/factories/");
  const tag = a.h.get("ETag");
  const b = await get("/factories/", { headers: { "If-None-Match": tag } });
  assert.deepEqual([b.status, b.h.get("ETag"), b.h.get("X-SEO-Edge")], [304, tag, String(BUNDLE.v)]);
  const orig = await env.ASSETS.fetch("https://madeinegyptgate.com/factories/");
  const c = await get("/factories/", { headers: { "If-None-Match": orig.headers.get("ETag") } });
  assert.equal(c.status, 200, "a browser copy of the un-overridden page is not reused");
  kv.m.set("seo:bundle", JSON.stringify({ ...BUNDLE, v: BUNDLE.v + 1 }));
  resetEdgeMemos();
  const d = await get("/factories/", { headers: { "If-None-Match": tag } });
  assert.equal(d.status, 200, "new bundle → new ETag → full page");
  assert.notEqual(d.h.get("ETag"), tag);
  const plainTag = (await get("/about/")).h.get("ETag");
  assert.equal((await get("/about/", { headers: { "If-None-Match": plainTag } })).status, 304, "untouched pages keep normal revalidation");
  const head = await get("/factories/", { method: "HEAD" });
  assert.deepEqual([head.status, head.h.get("X-SEO-Edge"), head.h.get("X-Robots-Tag")], [200, String(BUNDLE.v + 1), "noindex,follow"]);
});
test("fail-open: no KV binding / KV down / no bundle → pages exactly as built; /api and non-GET pass straight through", async () => {
  for (const env of [{ SEO_KV: undefined }, {}]) {
    const { get, kv } = setup({ env });
    if (!("SEO_KV" in env)) kv.fail = true;
    const r = await get("/factories/");
    assert.deepEqual([r.status, r.text, r.h.get("X-SEO-Edge")], [200, FILES["/factories/index.html"], "0"]);
    assert.equal((await get("/manufacturers")).loc, "https://madeinegyptgate.com/factories/", "build redirects still work");
  }
  const { get: g0 } = setup({ bundle: null });
  assert.equal((await g0("/factories/")).text, FILES["/factories/index.html"]);
  const { get, kv } = setup();
  const before = kv.reads;
  const api = await get("/api/seo/health");
  assert.equal(api.status, 404, "handed to the next handler untouched");
  assert.equal(kv.reads, before, "no KV read for /api/*");
  const post = await get("/factories/", { method: "POST" });
  assert.equal(post.text, FILES["/factories/index.html"]);
  assert.equal(post.h.get("X-SEO-Edge"), null);
  const r = setup();
  const ctx = pctx(new Request("https://madeinegyptgate.com/factories/"), r.env);
  await onRequest(ctx);
  assert.equal(ctx.passThrough, true, "passThroughOnException is armed");
});
test("generator self entries (/factories → /factories/) never break redirects INTO the hubs (A7 /manufacturers, /factory.html)", async () => {
  const { get } = setup();
  for (const p of ["/manufacturers", "/manufacturers/", "/factory.html", "/factories.html"]) {
    const r = await get(p);
    assert.deepEqual([r.status, r.loc], [301, "https://madeinegyptgate.com/factories/"], p);
  }
  assert.equal((await get("/tenders.html")).loc, "https://madeinegyptgate.com/tenders/");
  assert.equal((await get("/factories/")).status, 200);
  const bare = await get("/factories");
  assert.deepEqual([bare.status, bare.loc], [308, "/factories/"], "left to the asset server's own trailing-slash 308");
  assert.equal((await get("/old-promo/")).status, 410, "a chain ending on an admin 410 answers 410 at once (no 301 → 410)");
  assert.equal((await get("/promo-hub/")).status, 404, "a prefix rule pointing at the missing page itself never loops");
});
test("?lang=en: ONE hop through the redirect maps to the EN twin, else the AR page; never off-site (A7, open redirect)", async () => {
  const { get } = setup();
  const L = async p => { const r = await get(p); return [r.status, r.loc]; };
  assert.deepEqual(await L("/factories.html?lang=en"), [301, "https://madeinegyptgate.com/en/factories/"], "the live site's hreflang=en links");
  assert.deepEqual(await L("/manufacturers?lang=en"), [301, "https://madeinegyptgate.com/en/factories/"]);
  assert.deepEqual(await L("/about.html?lang=en"), [301, "https://madeinegyptgate.com/contact/?lang=en"], "admin redirect wins; no EN twin → AR target, language kept");
  assert.deepEqual(await L("/tenders/page/132/?lang=en"), [301, "https://madeinegyptgate.com/tenders/?lang=en"], "legacy prefix, one hop, language kept");
  assert.deepEqual(await L("/tenders/page/2/?lang=en"), [200, null], "a real page without an EN twin is served as it is (the page switches to English itself)");
  assert.deepEqual(await L("/about?lang=en"), [301, "https://madeinegyptgate.com/en/about/"]);
  assert.deepEqual(await L("/contact?lang=en"), [301, "https://madeinegyptgate.com/contact/?lang=en"], "the asset server's 308 is folded in, language kept");
  assert.equal((await get("/ar/wp-json/x?lang=en")).status, 410);
  assert.equal((await get("/factories/no-such-slug/?lang=en")).status, 410, "missing imported slug → 410 at once");
  assert.equal((await get("/old-page/?lang=en")).status, 410);
  for (const p of ["/%2Fevil.example?lang=en", "/%5Cevil.example?lang=en", "/%2fevil.example/x?lang=en", "/%2F%2Fevil.example/%2E%2E?lang=en", "//evil.example/e%CC%81", "/%5C%5Cevil.example/e%CC%81", "/%09/evil.example?lang=en"]) {
    const r = await get(p);
    assert.ok(!r.loc || new URL(r.loc, "https://madeinegyptgate.com/").host === "madeinegyptgate.com", p + " → " + r.loc);
  }
  const ev = await get("/%2Fevil.example?lang=en");
  assert.ok(ev.loc === null || ev.loc.startsWith("https://madeinegyptgate.com/"), "never off-site: " + ev.loc);
  assert.equal((await get("//evil.example/e%CC%81")).loc, "https://madeinegyptgate.com/evil.example/%C3%A9");
});
test("a dropped /en/ page → one 301 to its AR page (else the AR rules: 410 / legacy prefix); real EN pages are served", async () => {
  const { get } = setup();
  assert.equal((await get("/en/about/")).status, 200);
  assert.deepEqual([(await get("/en/contact/")).status, (await get("/en/contact/")).loc], [301, "https://madeinegyptgate.com/contact/?lang=en"]);
  assert.equal((await get("/en" + ENC)).loc, "https://madeinegyptgate.com" + ENC + "?lang=en", "Arabic slug kept percent-encoded");
  assert.equal((await get("/en/factories/no-such-slug/")).status, 410);
  assert.equal((await get("/en/tenders/page/77/")).loc, "https://madeinegyptgate.com/tenders/?lang=en");
  assert.equal((await get("/en/about.html")).loc, "https://madeinegyptgate.com/contact/?lang=en", "AR redirect maps apply");
  assert.equal((await get("/en/nothing-here/")).status, 404);
  const h = await get("/en/contact/", { method: "HEAD" });
  assert.equal(h.status, 301);
});
test("previews: redirects stay on the preview host", async () => {
  const { get } = setup();
  const r = await get("/manufacturers", { base: "https://abc123.madeinegyptgate.pages.dev" });
  assert.equal(r.loc, "https://abc123.madeinegyptgate.pages.dev/factories/");
});

test("deploy 1: Worker API paths and the owner's live admin API are never touched (no redirect, no KV, also with ?lang=en)", async () => {
  const { get, kv } = setup();
  const before = kv.reads;
  for (const p of ["/api/auth/link", "/api/inquiries?ref=MIG-1", "/api/admin/inquiries/7/reply", "/api/me", "/api/janna/lookup?lang=en",
    "/api/index.php?a=me", "/api/index.php?lang=en", "/api/seo/health"]) {
    const r = await get(p);
    assert.equal(r.status, 404, p + " handed to the next handler (Worker route / Function) untouched");
    assert.equal(r.loc, null, p + " never redirected");
    assert.equal(r.h.get("X-SEO-Edge"), null, p + " not rewritten");
  }
  for (const m of ["POST", "PUT", "DELETE"]) assert.equal((await get("/api/admin/inquiries/7/reply", { method: m })).status, 404);
  assert.equal(kv.reads, before, "no KV read for /api/*");
});
test("an Arabic-only page under /en/ (gone_prefix_on_404 lists /en/factories/) → one 301 to the Arabic page, not 410", async () => {
  const files = { ...FILES, "/_seo/redirects.json": { ...FILES["/_seo/redirects.json"], gone_prefix_on_404: [...FILES["/_seo/redirects.json"].gone_prefix_on_404, "/en/factories/"] } };
  const { get } = setup({ files });
  const r = await get("/en" + ENC);
  assert.deepEqual([r.status, r.loc], [301, "https://madeinegyptgate.com" + ENC + "?lang=en"]);
  assert.equal((await get("/en/factories/no-such-slug/")).status, 410, "a slug that exists in neither language is still gone");
});

test("/en/<page>/ without an EN twin: ONE 301 that keeps English — lang=en on an Arabic-only target, else the target's EN twin (QA EN)", async () => {
  const files = { ...FILES, "/market/index.html": page("السوق"), "/project-news/index.html": page("أخبار المشروعات"), "/legal/index.html": page("المركز القانوني") };
  const bundle = { ...BUNDLE, rd: { ...BUNDLE.rd, "/old-news/": { to: "/news/?src=old", code: 301 }, "/old-hub/": { to: "/factories/?lang=en&utm=1", code: 301 },
    "/old-legal/": { to: "/legal/?lang=ar", code: 301 } } };
  const { get } = setup({ files, bundle });
  const S = "https://madeinegyptgate.com";
  const hop = async p => {  // one redirect, then the Location itself must answer 200 (no second hop)
    const a = await get(p);
    const b = a.loc ? await get(a.loc.slice(S.length)) : null;
    return [a.status, a.loc, b && b.status, b && b.loc];
  };
  for (const p of ["market", "project-news", "legal", "contact", "about.html"]) {
    const to = p === "about.html" ? "/contact/" : "/" + p + "/";
    assert.deepEqual(await hop("/en/" + p + (p.endsWith(".html") ? "" : "/")), [301, S + to + "?lang=en", 200, null], "/en/" + p);
  }
  assert.deepEqual(await hop("/en/market"), [301, S + "/market/?lang=en", 200, null], "no trailing slash: same single hop");
  assert.equal((await get("/en/market/?utm_source=wa")).loc, S + "/market/?lang=en", "the request's own query is not carried (as before), lang=en is");
  assert.deepEqual(await hop("/en/old-news/"), [301, S + "/news/?src=old&lang=en", 200, null], "lang=en merged into the target's own query");
  assert.deepEqual(await hop("/en/factories.html"), [301, S + "/en/factories/", 200, null], "a target with an EN twin → the twin itself, not /factories/ + a second 301");
  assert.deepEqual(await hop("/en/manufacturers"), [301, S + "/en/factories/", 200, null]);
  assert.deepEqual(await hop("/en/old-hub/"), [301, S + "/en/factories/?utm=1", 200, null], "to the twin: the target's lang= is dropped (it would cost a hop)");
  assert.equal((await get("/en/old-legal/")).loc, S + "/legal/?lang=ar", "a target that names its language keeps it");
  assert.deepEqual([(await get("/en/tenders/page/77/")).loc, (await get("/en/factories/no-such-slug/")).status], [S + "/tenders/?lang=en", 410]);
  assert.equal((await get("/en/out/")).loc, null, "an off-site admin target is still refused");
  const hd = await get("/en/market/", { method: "HEAD" });
  assert.deepEqual([hd.status, hd.loc], [301, S + "/market/?lang=en"]);
  assert.equal((await get("/en/market/", { base: "https://abc123.madeinegyptgate.pages.dev" })).loc, "https://abc123.madeinegyptgate.pages.dev/market/?lang=en", "previews stay on the preview host");
  assert.equal((await get("/en/about/")).status, 200, "real EN pages are served");
  // the EN map names a twin that is not built: no lang=en (step 1 would send /contact/?lang=en straight back to /en/contact/)
  const { get: g2 } = setup({ files: { ...files, "/_seo/en-paths.json": { ...FILES["/_seo/en-paths.json"], "/contact/": "/en/contact/" } } });
  assert.deepEqual([(await g2("/en/contact/")).loc, (await g2("/contact/")).status], [S + "/contact/", 200], "no redirect loop");
});

test("SEC M5: security headers on every page the Functions serve; assets get nosniff; redirects and /api/* untouched", async () => {
  const CSP = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";
  const sec = h => [h.get("Content-Security-Policy"), h.get("X-Frame-Options"), h.get("X-Content-Type-Options"), h.get("Referrer-Policy")];
  const FULL = [CSP, "SAMEORIGIN", "nosniff", "strict-origin-when-cross-origin"];
  const { get } = setup();
  assert.deepEqual(sec((await get("/about/")).h), FULL, "plain HTML page (no override)");
  const ov = await get("/factories/");
  assert.deepEqual(sec(ov.h), FULL, "rewritten HTML page (override)");
  assert.ok(ov.text.includes("دليل المصانع المصرية"), "the override still applies");
  assert.deepEqual(sec((await get("/")).h), FULL, "home with verification metas");
  assert.deepEqual(sec((await get("/no-such-page/")).h), FULL, "404 page");
  assert.deepEqual(sec((await get("/xmlrpc.php")).h), FULL, "410 page");
  assert.deepEqual(sec((await get("/about/", { method: "HEAD" })).h), FULL, "HEAD");
  const tag = (await get("/factories/")).h.get("ETag");
  const nm = await get("/factories/", { headers: { "If-None-Match": tag } });
  assert.equal(nm.status, 304);
  assert.deepEqual(sec(nm.h), FULL, "304 keeps the headers of the cached page");
  const js = await get("/data/app.js");
  assert.deepEqual(sec(js.h), [null, null, "nosniff", "strict-origin-when-cross-origin"], "a script: nosniff, no page CSP");
  assert.equal(js.text, FILES["/data/app.js"]);
  const rd = await get("/manufacturers");
  assert.equal(rd.status, 301);
  assert.deepEqual(sec(rd.h), [null, null, null, null], "redirects are returned as they are");
  assert.deepEqual(sec((await get("/robots.txt")).h).slice(2), ["nosniff", "strict-origin-when-cross-origin"]);
  for (const p of ["/api/auth/link", "/api/seo/health", "/api/index.php?a=me"]) assert.deepEqual(sec((await get(p)).h), [null, null, null, null], p);
  assert.deepEqual(sec((await get("/about/", { method: "POST" })).h), [null, null, null, null], "non-GET untouched");
});

test("never lose the language: the English kiosk (janna.html) and pages without an /en/ twin keep ?lang=en (QA C)", async () => {
  const files = { ...FILES, "/janna.html": "<!doctype html><html><head><title>Janna kiosk</title></head><body>kiosk</body></html>",
    "/tenders/search/index.html": page("بحث المناقصات") };
  const { get } = setup({ files });
  const j1 = await get("/janna.html?lang=en");
  assert.deepEqual([j1.status, j1.loc], [301, "https://madeinegyptgate.com/janna?lang=en"], "the asset server's /janna.html → /janna, language kept");
  const j2 = await get("/janna?lang=en");
  assert.equal(j2.status, 200, "the kiosk is served with ?lang=en (captions.js / bot.js switch to English from it)");
  assert.ok(j2.text.includes("kiosk"));
  const j3 = await get("/janna.html?lang=en&utm_source=x");
  assert.equal(j3.loc, "https://madeinegyptgate.com/janna?lang=en&utm_source=x", "the whole query is kept");
  const ts = await get("/tenders/search/?lang=en");
  assert.deepEqual([ts.status, ts.loc], [200, null]);
  assert.equal((await get("/factories.html?lang=en")).loc, "https://madeinegyptgate.com/en/factories/", "with an EN twin: the twin, no parameter");
  assert.equal((await get("/en/factories/?lang=en")).loc, "https://madeinegyptgate.com/en/factories/", "an /en/ page drops the redundant parameter");
  for (const p of ["/janna?lang=en", "/contact/?lang=en", "/tenders/search/?lang=en"]) {  // served pages: no redirect loop
    const r = await get(p);
    assert.equal(r.status, 200, p);
  }
});

test("the sign-in page keeps ?next= through the ?lang=en hop (/login/ → /en/login/); other twins still drop the query (FLOW-1)", async () => {
  const files = { ...FILES, "/login/index.html": page("دخول المصانع"), "/en/login/index.html": page("Factory sign-in"),
    "/_seo/en-paths.json": { ...FILES["/_seo/en-paths.json"], "/login/": "/en/login/" } };
  const { get } = setup({ files });
  const S = "https://madeinegyptgate.com";
  assert.deepEqual(await get("/login/?lang=en&next=%2Ffactories%2F").then(r => [r.status, r.loc]), [301, S + "/en/login/?next=%2Ffactories%2F"]);
  assert.equal((await get("/login/?next=%2Ffactories%2F%3Fq%3D1%23top&lang=en")).loc, S + "/en/login/?next=%2Ffactories%2F%3Fq%3D1%23top", "lang= removed wherever it sits");
  assert.equal((await get("/en/login/?lang=en&next=%2Fen%2Fnews%2F")).loc, S + "/en/login/?next=%2Fen%2Fnews%2F", "already English: only the parameter goes");
  assert.equal((await get("/login/?lang=en")).loc, S + "/en/login/", "no other parameter → the plain twin");
  assert.equal((await get("/en/login/?lang=en")).loc, S + "/en/login/");
  const out = await get("/login/?lang=en&next=https%3A%2F%2Fevil.example%2F");
  assert.equal(new URL(out.loc).host, "madeinegyptgate.com", "the Location stays on this site (next is checked by the page: safeNext)");
  for (const p of ["/en/login/?next=%2Ffactories%2F", "/login/?next=%2Ffactories%2F", "/login/?lang=ar&next=%2Ffactories%2F"]) {
    const r = await get(p);
    assert.deepEqual([r.status, r.loc], [200, null], p + " is served as it is");
  }
  assert.equal((await get("/about/?lang=en&utm=1")).loc, S + "/en/about/", "every other English twin: unchanged, the query is dropped");
  assert.equal((await get("/factories.html?lang=en&next=%2Fx%2F")).loc, S + "/en/factories/");
});

test("site-copying programs get 403 on pages; browsers, search engines, SEO tools and this site's own checks are served", async () => {
  const { get } = setup();
  for (const ua of ["Mozilla/4.5 (compatible; HTTrack 3.0x; Windows 98)", "Wget/1.21.3", "python-requests/2.31.0", "Scrapy/2.11 (+https://scrapy.org)", "Go-http-client/1.1", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"]) {
    const r = await get("/", { headers: { "User-Agent": ua } });
    assert.equal(r.status, 403, ua);
    assert.equal(r.h.get("X-Content-Type-Options"), "nosniff", "the 403 carries the security headers too");
  }
  for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "Mozilla/5.0 (compatible; SemrushBot/7~bl)",
      // the AI search / answer crawlers robots.txt names (seo_build.part.py ROBOTS_AGENTS, owner 2026-11-28) are never copiers
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "Claude-SearchBot/1.0", "Claude-User/1.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
      "migate-ci/1.0 (deploy check)", "migate-smoke/2.0 (deploy check)", "migate-intel-shell/1.0 (+https://madeinegyptgate.com/intel/)", "MIGApp/1.0 (android)", ""]) {
    const r = await get("/", { headers: { "User-Agent": ua } });
    assert.equal(r.status, 200, ua || "(no User-Agent)");
  }
  const api = await get("/api/janna/health", { headers: { "User-Agent": "python-requests/2.31.0" } }).catch(() => null);
  assert.ok(!api || api.status !== 403, "/api/* is never touched here (Worker routes)");
});
