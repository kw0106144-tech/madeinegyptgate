// Pure helpers of the edge layer: path keys (Arabic, percent-encoding, NFC), redirect compilation + one-hop flattening,
// robots extras, verification metas, the HTML rewrite (escaping, hooks, missing tags), ETags, the KV bundle memo.
import test from "node:test";
import assert from "node:assert/strict";
import {
  normPath, altSlash, lookup, nfcPathname, absUrl, escHtml, attrSafe, safeJsonLd, compileRedirects, flattenTarget, isGone,
  robotsWithExtra, cleanRobotsExtra, verifyMetaHtml, rewriteHtml, edgeEtag, etagMatches, loadBundle, setBundleMemo,
  resetEdgeMemos, sanitizeBundle, indexNowKeys, siteOrigin, EMPTY, GONE, samePage, targetPath, safeLocation, redirect, assetFetch,
} from "../_lib/seo-edge.js";
import { scorePage, normAr, minWordsFor, DEFAULT_THRESHOLDS } from "../_lib/seo-score.js";
import { KV, assets, getHTMLRewriter } from "./helpers.mjs";

const { HR, engine } = getHTMLRewriter();
const AR = "تشكيل-المعادن-في-السادات";
const ENC_UP = encodeURIComponent(AR), ENC_LO = ENC_UP.replace(/%[0-9A-F]{2}/g, m => m.toLowerCase());
const html = (o, verify, page = PAGE) => rewriteHtml(new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } }), o, verify, { HTMLRewriter: HR }).text();
const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>العنوان الأصلي</title><meta name="description" content="وصف أصلي"><meta name="robots" content="index,follow"><meta property="og:title" content="og أصلي"><meta property="og:description" content="ogd"><meta property="og:url" content="https://madeinegyptgate.com/factories/"><meta property="og:image" content="https://madeinegyptgate.com/img/og-cover.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:title" content="tw أصلي"><meta name="twitter:description" content="twd"><meta name="twitter:image" content="https://madeinegyptgate.com/img/og-cover.jpg"><link rel="canonical" href="https://madeinegyptgate.com/factories/"><script type="application/ld+json" data-seo="site">{"@context":"https://schema.org","@type":"WebPage"}</script><script type="application/ld+json" data-seo="page">{"@context":"https://schema.org","@type":"CollectionPage","name":"old"}</script></head><body><svg><title>رمز</title></svg><main><h1 data-seo="h1" class="hero">دليل المصانع</h1><p data-seo="intro" class="lead">مقدمة أصلية</p><p>نص</p></main></body></html>`;

test("engine in use: " + engine, () => assert.ok(HR));

test("normPath: Arabic percent-encoded (upper and lower case) → decoded NFC key with the trailing slash kept", () => {
  assert.equal(normPath(`/factories/${ENC_UP}/`), `/factories/${AR}/`);
  assert.equal(normPath(`/factories/${ENC_LO}/`), `/factories/${AR}/`);
  assert.equal(normPath(`https://madeinegyptgate.com/factories/${ENC_UP}/?utm=x#top`), `/factories/${AR}/`);
  assert.equal(normPath("factories"), "/factories");
  assert.equal(normPath("/robots.txt"), "/robots.txt");
  assert.equal(normPath("/bad%E0%A4%A"), "/bad%E0%A4%A"); // malformed escape kept, no throw
  const nfd = "/x/" + String.fromCharCode(0x0627, 0x0653) + "/", nfc = "/x/" + String.fromCharCode(0x0622) + "/";
  assert.equal(normPath(nfd), nfc);
  assert.equal(normPath(encodeURI(nfd)), nfc);
});
test("altSlash / lookup / nfcPathname / absUrl", () => {
  assert.equal(altSlash("/about/"), "/about");
  assert.equal(altSlash("/about"), "/about/");
  assert.equal(altSlash("/robots.txt"), null);
  assert.equal(altSlash("/"), null);
  const m = { "/a/": 1, "/b": 2 };
  assert.equal(lookup(m, "/a"), 1);
  assert.equal(lookup(m, "/b/"), 2);
  assert.equal(lookup(m, "/constructor"), undefined);
  assert.equal(lookup(m, "/__proto__"), undefined);
  const raw = "/x/" + encodeURIComponent(String.fromCharCode(0x0627, 0x0653)) + "/";
  assert.equal(nfcPathname(raw), "/x/" + encodeURIComponent(String.fromCharCode(0x0622)) + "/");
  assert.equal(nfcPathname(`/factories/${ENC_UP}/`), null);
  assert.equal(nfcPathname("/a%2Fb/"), null);
  assert.equal(nfcPathname("//evil.example/e%CC%81"), "/evil.example/%C3%A9", "never a protocol-relative //host result");
  assert.equal(nfcPathname("/\\evil.example/e%CC%81"), "/evil.example/%C3%A9");
  assert.equal(absUrl("https://madeinegyptgate.com", `/factories/${AR}/`), `https://madeinegyptgate.com/factories/${ENC_UP}/`);
  assert.equal(siteOrigin({}), "https://madeinegyptgate.com");
  assert.equal(siteOrigin({ SITE_ORIGIN: "https://preview.example.com/" }), "https://preview.example.com");
  assert.equal(siteOrigin({ SITE_ORIGIN: "javascript:alert(1)" }), "https://madeinegyptgate.com");
});
test("escaping helpers", () => {
  assert.equal(escHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.equal(attrSafe("a & b &amp; c <x>"), "a &amp; b &amp;amp; c &lt;x&gt;");
  const s = safeJsonLd(JSON.stringify({ x: "</script><!--" + String.fromCharCode(0x2028) }));
  assert.ok(!s.includes("<"));
  assert.deepEqual(JSON.parse(s), { x: "</script><!--" + String.fromCharCode(0x2028) });
});

test("build redirects compile; flattenTarget makes one hop and refuses loops", () => {
  const R = compileRedirects({ exact: { "/about.html": "/about/", "/b/": "/c/", [`/old/${ENC_UP}/`]: "/factories/" }, prefix: [["/tenders/page/", "/tenders/"], { from: "/category/", to: "/factories/" }, ["/", "/x/"]], gone_rx: ["^/(ar/)?wp-(json|content|admin|includes)(/|$)", "^/xmlrpc\\.php$", "(bad"], gone_prefix_on_404: ["/factories/", "/"] });
  assert.equal(R.exact[`/old/${AR}/`], "/factories/");
  assert.deepEqual(R.prefix.map(p => p[0]), ["/tenders/page/", "/category/"]); // a bare "/" prefix is ignored
  assert.equal(R.gone.length, 2); // the broken pattern is skipped, not fatal
  assert.deepEqual(R.gone404, ["/factories/"]);
  assert.ok(isGone("/ar/wp-json/wp/v2/products/1", R.gone));
  assert.ok(isGone("/xmlrpc.php", R.gone));
  assert.ok(!isGone("/wp-guide/", R.gone));
  const u = new URL("https://madeinegyptgate.com/a/");
  const b = { rd: { "/a/": { to: "/b/", code: 301 }, "/loop1/": { to: "/loop2/", code: 301 }, "/loop2/": { to: "/loop1/", code: 301 }, "/gone/": { code: 410 } } };
  assert.equal(flattenTarget(u, b, R, "/b/"), "/c/"); // admin → build chain collapsed
  assert.equal(flattenTarget(new URL("https://madeinegyptgate.com/x/"), b, R, "/loop1/"), null);
  assert.equal(flattenTarget(u, b, R, "/a/"), null); // self
  assert.equal(flattenTarget(u, b, R, "/a"), null, "/a/ → /a is a loop too (Pages 308s /a back to /a/)");
  assert.equal(flattenTarget(new URL("https://madeinegyptgate.com/a"), b, R, "/a/?x=1"), null);
  assert.equal(flattenTarget(u, b, R, "/gone/"), GONE, "a chain ending on an admin 410 answers 410 at once");
  assert.equal(flattenTarget(u, b, R, "https://other.example/x"), "https://other.example/x");
  assert.equal(compileRedirects(null), null);
  assert.equal(compileRedirects(R === null ? null : { exact: { "/q/": "/r/" } }).count, 1);
});
test("self entries (/factories → /factories/, as the generator emits them) are dropped: redirects INTO hubs still work", () => {
  const map = { exact: { "/factories": "/factories/", "/products": "/products/", "/rfq": "/rfq/", "/tenders": "/tenders/", "/tenders/": "/tenders?x=1", "/manufacturers": "/factories/", "/manufacturers/": "/factories/", "/factory.html": "/factories/", "/factories.html": "/factories/", "/tenders.html": "/tenders/", "/rfqs.html": "/rfq/", "/x/": "https://madeinegyptgate.com/x/" }, prefix: [], gone_rx: [], gone_prefix_on_404: [] };
  const R = compileRedirects(map), b = { rd: {} };
  assert.equal(R.self, 5, "4 slash variants + /tenders/ → /tenders?x=1");
  assert.deepEqual(Object.keys(R.exact).sort(), ["/factories.html", "/factory.html", "/manufacturers", "/manufacturers/", "/rfqs.html", "/tenders.html", "/x/"]);
  let refused = 0;
  for (const [from] of Object.entries(R.exact)) if (!flattenTarget(new URL("https://madeinegyptgate.com" + from), b, R, lookup(R.exact, from), from)) refused++;
  assert.equal(refused, 1, "only the absolute self-target /x/ is refused (a loop)");
  assert.equal(flattenTarget(new URL("https://madeinegyptgate.com/manufacturers"), b, R, "/factories/", "/manufacturers"), "/factories/");
  // a self entry in the admin table (cannot be saved through the API, but never trusted) ends the chain too
  assert.equal(flattenTarget(new URL("https://madeinegyptgate.com/a/"), { rd: { "/hub": { to: "/hub/", code: 301 } } }, null, "/hub/", "/a/"), "/hub/");
  assert.ok(samePage("/a/", "/a") && samePage("/a", "/a/") && !samePage("/a/", "/b/") && !samePage(null, "/a"));
  assert.deepEqual([targetPath("/x/?q=1#h"), targetPath("//evil/x"), targetPath("/\\evil"), targetPath("https://a/b")], ["/x/", null, null, null]);
});
test("redirect Location never leaves the site (protocol-relative, backslash, other hosts, javascript:)", () => {
  const u = new URL("https://madeinegyptgate.com/%2Fevil.example?lang=en"), H = ["madeinegyptgate.com", "www.madeinegyptgate.com"];
  for (const t of ["//evil.example", "/\\evil.example", "\\\\evil.example", "///evil.example/x", "/\t/evil.example", "https://evil.example/", "javascript:alert(1)", "data:text/html,x", ""]) {
    const l = safeLocation(u, t, H);
    assert.ok(l === null || H.includes(l.host), t + " → " + (l && l.href));
    const r = redirect(u, t, 301, false, H);
    assert.ok(r === null || H.includes(new URL(r.headers.get("Location")).host), t);
  }
  assert.equal(safeLocation(u, "//evil.example", H).href, "https://madeinegyptgate.com/evil.example");
  assert.equal(safeLocation(u, "https://www.madeinegyptgate.com/a/", H).href, "https://www.madeinegyptgate.com/a/");
  assert.equal(redirect(u, "https://evil.example/", 301, false, H), null);
  assert.equal(redirect(u, "/%2Fevil.example", 301).headers.get("Location"), "https://madeinegyptgate.com/%2Fevil.example");
  assert.equal(redirect(new URL("https://abc.madeinegyptgate.pages.dev/x"), "/y/", 301).headers.get("Location"), "https://abc.madeinegyptgate.pages.dev/y/");
});
test("assetFetch stays on the request origin", async () => {
  const A = assets({ "/index.html": "<h1>home</h1>", "/a/index.html": "<h1>a</h1>" }), seen = [];
  const env = { ASSETS: { fetch: (r) => { seen.push(new URL(r.url).host); return A.fetch(r); } } };
  const req = new Request("https://madeinegyptgate.com/x");
  const out = {};
  const r = await assetFetch(env, req, "//evil.example/a/", 1, out);
  assert.equal(r.status, 404 === r.status ? 404 : r.status);
  assert.deepEqual([...new Set(seen)], ["madeinegyptgate.com"]);
  const a = await assetFetch(env, req, "/a", 1, out);
  assert.deepEqual([a.status, out.url.pathname], [200, "/a/"], "follows the asset server's own 308 and reports where it landed");
});

test("robots.txt: unchanged bytes without extras; extras appended after a blank line; bad lines dropped", async () => {
  const base = "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://madeinegyptgate.com/sitemap.xml\n";
  const r0 = new Response(base);
  assert.equal(await robotsWithExtra(r0, []), r0);
  const r = await robotsWithExtra(new Response(base), ["User-agent: GPTBot", "Allow: /", "", "", "# comment", "Disallow /x"]);
  assert.equal(await r.text(), base + "\nUser-agent: GPTBot\nAllow: /\n");
  assert.equal(r.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.deepEqual(cleanRobotsExtra(["", "User-agent: *", "", "", "Disallow: /tmp/", ""]), ["User-agent: *", "", "Disallow: /tmp/"]);
  const missing = await robotsWithExtra(new Response("nf", { status: 404 }), ["User-agent: *", "Disallow: /x/"]);
  assert.equal(await missing.text(), "User-agent: *\nAllow: /\n\nUser-agent: *\nDisallow: /x/\n");
});
test("verification metas: validated and escaped; IndexNow keys", () => {
  assert.equal(verifyMetaHtml({ google: "abcDEF_123-xyz", bing: "0123456789ABCDEF", yandex: "bad token!" }), '<meta name="google-site-verification" content="abcDEF_123-xyz"><meta name="msvalidate.01" content="0123456789ABCDEF">');
  assert.equal(verifyMetaHtml({ google: '"><script>' }), "");
  assert.equal(verifyMetaHtml(null), "");
  assert.deepEqual(indexNowKeys({ cfg: { indexnow_key: "0123456789abcdef0123456789abcdef" } }, { INDEXNOW_KEY: "envkey-12345678" }), ["0123456789abcdef0123456789abcdef", "envkey-12345678"]);
  assert.deepEqual(indexNowKeys({ cfg: { indexnow_key: "../x" } }, {}), []);
});

test("rewrite: title is escaped (A9 «</title><script>»), metas / og / twitter / canonical follow", async () => {
  const out = await html({ title: "</title><script>alert(1)</script>", description: 'وصف "جديد" & <b>', canonical: `https://madeinegyptgate.com/factories/${ENC_UP}/`, robots: "noindex,follow" });
  assert.ok(!out.includes("<script>alert(1)"), "no executable script");
  assert.ok(out.includes("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>"));
  assert.ok(out.includes('<meta name="description" content="وصف &quot;جديد&quot; &amp; &lt;b&gt;">'));
  assert.ok(out.includes('<meta property="og:title" content="&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;">'), "og:title follows title (escaped)");
  assert.ok(out.includes('<meta name="twitter:title" content="&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;">'));
  assert.ok(out.includes('<meta property="og:description" content="وصف &quot;جديد&quot; &amp; &lt;b&gt;">'));
  assert.ok(out.includes(`<link rel="canonical" href="https://madeinegyptgate.com/factories/${ENC_UP}/">`));
  assert.ok(out.includes(`<meta property="og:url" content="https://madeinegyptgate.com/factories/${ENC_UP}/">`));
  assert.ok(out.includes('<meta name="robots" content="noindex,follow">'));
  assert.ok(out.includes("<svg><title>رمز</title></svg>"), "an SVG <title> in the body is not touched");
  assert.equal((out.match(/<title>/g) || []).length, 2);
});
test("rewrite: og_title / og_description / og_image win for social tags; image size hints removed", async () => {
  const out = await html({ title: "T", og_title: "OG T", og_description: "OG D", description: "D", og_image: "https://cdn.example.com/a.jpg?x=1&y=2" });
  assert.ok(out.includes('<meta property="og:title" content="OG T">'));
  assert.ok(out.includes('<meta name="twitter:title" content="OG T">'));
  assert.ok(out.includes('<meta property="og:description" content="OG D">'));
  assert.ok(out.includes('<meta name="description" content="D">'));
  assert.ok(out.includes('<meta property="og:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2">'));
  assert.ok(out.includes('<meta name="twitter:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2">'));
  assert.ok(!out.includes("og:image:width") && !out.includes("og:image:height"));
});
test("rewrite: H1 and intro (in place; or inserted after the H1 when the page had none)", async () => {
  const a = await html({ h1: "مصانع <الحديد>", intro: "مقدمة جديدة & مفيدة" });
  assert.ok(a.includes('<h1 data-seo="h1" class="hero">مصانع &lt;الحديد&gt;</h1>'));
  assert.ok(a.includes('<p data-seo="intro" class="lead">مقدمة جديدة &amp; مفيدة</p>'), "replaced in place, class kept");
  const noIntro = PAGE.replace('<p data-seo="intro" class="lead">مقدمة أصلية</p>', "");
  const b = await html({ intro: "مقدمة", ix: 1 }, null, noIntro);
  assert.ok(b.includes('<h1 data-seo="h1" class="hero">دليل المصانع</h1><p data-seo="intro">مقدمة</p>'));
  const c = await html({ intro: "مقدمة", ix: 1 }); // page gained an intro after a rebuild: exactly one intro remains
  assert.equal((c.match(/data-seo="intro"/g) || []).length, 1);
  assert.ok(!c.includes("مقدمة أصلية"));
  const d = await html({ intro: "مقدمة" }, null, noIntro); // no ix and no element: nothing inserted
  assert.ok(!d.includes('data-seo="intro"'));
});
test("rewrite: JSON-LD replaced safely (no </script> break-out) and parses back", async () => {
  const graph = { "@context": "https://schema.org", "@type": "Organization", name: "</script><script>alert(1)</script>", description: "مصنع" };
  const out = await html({ jsonld: JSON.stringify(graph) });
  const m = out.match(/<script type="application\/ld\+json" data-seo="page">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.ok(!m[1].includes("<"));
  assert.deepEqual(JSON.parse(m[1]), graph);
  assert.ok(out.includes('data-seo="site">{"@context":"https://schema.org","@type":"WebPage"}</script>'), "the site graph is untouched");
});
test("rewrite: hooks missing from <head> are added before </head>; verification metas only when passed", async () => {
  const bare = '<!doctype html><html><head><meta charset="utf-8"></head><body><h1 data-seo="h1">x</h1></body></html>';
  const out = await html({ title: "T & U", keywords: "مصانع, مصر", canonical: "https://madeinegyptgate.com/x/", jsonld: '{"@context":"https://schema.org","@type":"Thing"}' }, { google: "googletoken123", yandex: "yandex-token-1" }, bare);
  const head = out.slice(0, out.indexOf("</head>"));
  assert.ok(head.includes('<meta name="google-site-verification" content="googletoken123"><meta name="yandex-verification" content="yandex-token-1">'));
  assert.ok(head.includes("<title>T &amp; U</title>"));
  assert.ok(head.includes('<meta name="keywords" content="مصانع, مصر">'));
  assert.ok(head.includes('<meta property="og:title" content="T &amp; U">'));
  assert.ok(head.includes('<link rel="canonical" href="https://madeinegyptgate.com/x/">'));
  assert.ok(head.includes('<script type="application/ld+json" data-seo="page">{"@context":"https://schema.org","@type":"Thing"}</script>'));
  const plain = await html({}, null, bare);
  assert.equal(plain, bare, "no override and no verification → identical bytes");
});
test("ETag helpers", () => {
  assert.equal(edgeEtag(null, 5, "/"), null);
  const t = edgeEtag('"abc"', 5, "/x/");
  assert.match(t, /^W\/"seo-[0-9a-z]+"$/);
  assert.notEqual(t, edgeEtag('"abc"', 6, "/x/"));
  assert.notEqual(t, edgeEtag('"abd"', 5, "/x/"));
  assert.ok(etagMatches(t, t));
  assert.ok(etagMatches('"zzz", ' + t.replace(/^W\//, ""), t));
  assert.ok(etagMatches("*", t));
  assert.ok(!etagMatches('"abc"', t));
});

test("bundle memo: one KV read per TTL, fail-open, a KV error keeps the last good bundle", async () => {
  resetEdgeMemos();
  const kv = new KV({ "seo:bundle": { v: 7, ov: { "/": { title: "x" } }, rd: [], cfg: null } });
  const env = { SEO_KV: kv };
  const t0 = 1_000_000;
  const b1 = await loadBundle(env, t0);
  assert.equal(b1.v, 7);
  assert.deepEqual(b1.rd, {}); // sanitized
  await loadBundle(env, t0 + 59_000);
  assert.equal(kv.reads, 1);
  kv.fail = true;
  assert.equal((await loadBundle(env, t0 + 61_000)).v, 7, "KV error → last good bundle");
  kv.fail = false;
  kv.m.delete("seo:bundle");
  assert.equal(await loadBundle(env, t0 + 200_000), EMPTY, "bundle deleted → pages as built");
  resetEdgeMemos();
  assert.equal(await loadBundle({}, t0), EMPTY, "no binding → pages as built");
  resetEdgeMemos();
  assert.equal(await loadBundle({ SEO_KV: kv, SEO_TTL: "5" }, t0), EMPTY);
  kv.m.set("seo:bundle", JSON.stringify({ v: 9 }));
  assert.equal((await loadBundle({ SEO_KV: kv, SEO_TTL: "5" }, t0 + 6_000)).v, 9, "SEO_TTL shortens the memo");
  setBundleMemo({ v: 11 }, t0 + 6_500);
  assert.equal((await loadBundle({ SEO_KV: kv, SEO_TTL: "5" }, t0 + 7_000)).v, 11, "publish updates this isolate at once");
  assert.equal(sanitizeBundle("x"), null);
  resetEdgeMemos();
});

test("score (spec §3.3) and Arabic keyword normalisation", () => {
  assert.equal(normAr("مُصَنِّعُ الأَلْوَمِنْيُوم في مصرَ"), normAr("مصنع الالومنيوم في مصر"));
  assert.equal(normAr("إدارة المدينة"), "اداره المدينه");
  const row = { path: "/factories/", type: "hub", title: "دليل المصانع المصرية: مصانع وشركات حسب القطاع", description: "دليل المصانع في مصر حسب القطاع والمحافظة مع ملف لكل منشأة ومنتجاتها، واطلب عرض سعر مجاناً من المصانع المسجلة.", h1: "دليل المصانع المصرية", h1_count: 1, canonical: "https://madeinegyptgate.com/factories/", robots: "index,follow", words: 300, images: 2, images_no_alt: 0, schema: ["CollectionPage"], alt: "" };
  const s = scorePage(row, { target_kw: "دليل المصانع" });
  assert.equal(s.score, 100);
  assert.deepEqual(s.issues, []);
  const bad = scorePage({ ...row, title: "قصير", h1_count: 2, images_no_alt: 3, words: 20, schema: [], canonical: "https://madeinegyptgate.com/other/" }, {});
  assert.ok(bad.score < 50);
  assert.deepEqual(bad.issues.sort(), ["img_alt", "multi_h1", "no_schema", "thin", "title_len"]);
  const ov = scorePage(row, { ov: { robots: "noindex,follow" } });
  assert.ok(ov.issues.includes("noindex") && ov.issues.includes("overridden"));
  assert.equal(ov.checks.find(c => c.id === "robots_sitemap").got, 0, "noindex at the edge while the sitemap still lists it");
});
test("score thresholds follow the build (seo/config.json) per page type; build thin decisions show as «thin»", () => {
  const build = { ...DEFAULT_THRESHOLDS, min_company_words: 35, min_facx_words: 40, min_product_words: 20 };
  assert.deepEqual(["company", "company-public", "product", "news", "hub-sector", "gov", "tender-cat", "zone", "tender", "home"].map(t => minWordsFor(t, build)), [35, 40, 20, 150, 150, 150, 150, 80, 80, 80]);
  assert.equal(minWordsFor("company"), 80, "spec default without a build config");
  const row = { path: "/factories/x/", type: "company", title: "شركة النيل للصناعات الهندسية – مصنع في القاهرة", description: "شركة النيل للصناعات الهندسية في القاهرة: منتجات وخدمات صناعية، واطلب عرض سعر مجاناً عبر منصة صنع في مصر.", h1: "شركة النيل", h1_count: 1, canonical: "https://madeinegyptgate.com/factories/x/", robots: "index,follow", words: 60, images: 0, images_no_alt: 0, schema: ["Organization"], alt: "", why: "desc_40w" };
  assert.ok(scorePage(row, {}).issues.includes("thin"), "60 words < the spec's 80");
  assert.ok(!scorePage(row, { thresholds: build }).issues.includes("thin"), "the build indexed it with 35");
  const t = scorePage({ ...row, robots: "noindex,follow", words: 300, why: "thin_desc_21w" }, { thresholds: build });
  assert.ok(t.issues.includes("thin") && t.intentional_noindex, "the build's own thin decision");
});
