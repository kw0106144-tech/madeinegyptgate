/* worker-site: Pages semantics on R2 + the unchanged functions/ chain. In-memory R2; HTMLRewriter from functions/_tests. */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getHTMLRewriter, KV } from "../../functions/_tests/helpers.mjs";
getHTMLRewriter();
const { default: worker } = await import("../src/index.js");
const pages = await import("../src/pages.js");

class R2 {
  constructor() { this.m = new Map(); }
  put(key, body, o = {}) {
    const run = async () => {
      const b = body instanceof Uint8Array ? body : typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(await new Response(body).arrayBuffer());
      const etag = crypto.createHash("md5").update(b).digest("hex");
      this.m.set(key, { b, etag, ct: (o.httpMetadata || {}).contentType || "application/octet-stream" });
      return this.obj(key);
    };
    return run();
  }
  obj(key, withBody, range) {
    const e = this.m.get(key);
    if (!e) return null;
    const o = { key, size: e.b.length, etag: e.etag, httpEtag: `"${e.etag}"`, writeHttpMetadata: h => h.set("Content-Type", e.ct) };
    if (withBody) {
      let b = e.b;
      if (range) { o.range = range; b = e.b.slice(range.offset, range.offset + range.length); }
      o.body = new Response(b).body; o.text = async () => new TextDecoder().decode(e.b);
    }
    return o;
  }
  async head(key) { return this.obj(key, false); }
  async get(key, opt = {}) {
    const e = this.m.get(key);
    if (!e) return null;
    const h = opt.onlyIf;
    if (h && typeof h.get === "function" && h.get("If-None-Match") && h.get("If-None-Match").replace(/"/g, "") === e.etag) return this.obj(key, false);
    let range;
    const rh = opt.range && typeof opt.range.get === "function" ? opt.range.get("Range") : null;
    const m = rh && /bytes=(\d+)-(\d*)/.exec(rh);
    if (m) { const a = +m[1], z = m[2] ? +m[2] : e.b.length - 1; range = { offset: a, length: z - a + 1 }; }
    return this.obj(key, true, range);
  }
  async list({ cursor, limit = 1000 } = {}) {
    const keys = [...this.m.keys()].sort(), start = cursor ? +cursor : 0, page = keys.slice(start, start + limit);
    return { objects: page.map(k => ({ key: k, size: this.m.get(k).b.length })), truncated: start + limit < keys.length, cursor: String(start + limit) };
  }
}
const page = t => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${t}</title><link rel="canonical" href="https://madeinegyptgate.com/"></head><body><h1 data-seo="h1">${t}</h1></body></html>`;
const HTML = "text/html; charset=utf-8";
async function setup() {
  pages.resetSiteConfig();
  const r2 = new R2();
  const files = {
    "index.html": [page("الرئيسية"), HTML], "about/index.html": [page("عن المنصة"), HTML], "janna.html": [page("كشك جنة"), HTML],
    "company.html": [page("تحويل"), HTML], "404.html": ["<!doctype html><title>404</title><h1>الصفحة غير موجودة</h1>", HTML],
    "data/app.js": ["console.log(1)", "application/javascript; charset=utf-8"], "img/a.png": ["PNGDATA0123456789", "image/png"],
    "robots.txt": ["User-agent: *\nAllow: /\n", "text/plain; charset=utf-8"],
    "_routes.json": [JSON.stringify({ version: 1, include: ["/*"], exclude: ["/data/*", "/img/*", "/sitemap.xml"] }), "application/json"],
    "_headers": ["/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: frame-ancestors 'self'\n/data/*\n  Cache-Control: public, max-age=3600, must-revalidate\n/img/*\n  Cache-Control: public, max-age=2592000\n", "text/plain"],
    "_redirects": ["/data/old.js /data/app.js 301\n/img/old/* /img/:splat 301\n", "text/plain"],
    "_seo/redirects.json": [JSON.stringify({ exact: { "/about.html": "/about/", "/home": "/" }, prefix: [], gone_rx: ["^/xmlrpc\\.php$"], gone_prefix_on_404: [] }), "application/json"],
    "_seo/en-paths.json": [JSON.stringify({ "/": "/en/" }), "application/json"], "en/index.html": [page("Home"), HTML],
  };
  for (const [k, [b, ct]] of Object.entries(files)) await r2.put(k, b, { httpMetadata: { contentType: ct } });
  await r2.put("__site/manifest.json", JSON.stringify({ built: "2026-11-18T10:00:00Z", keys: Object.keys(files) }), { httpMetadata: { contentType: "application/json" } });
  const env = { SITE: r2, SEO_KV: new KV({}), SITE_ORIGIN: "https://madeinegyptgate.com", ADMIN_EMAILS: "info@madeinegyptgate.com" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const get = async (p, init = {}, host = "https://migate-site.example.workers.dev") => {
    const res = await worker.fetch(new Request(host + p, init), env, ctx);
    return { res, status: res.status, loc: res.headers.get("Location"), h: res.headers, text: init.method === "HEAD" ? "" : await res.text() };
  };
  return { r2, env, get };
}

test("Pages pretty URLs, 404.html with status 404, content types", async () => {
  const { get } = await setup();
  let r = await get("/");
  assert.equal(r.status, 200); assert.match(r.text, /الرئيسية/); assert.equal(r.h.get("Content-Type"), HTML);
  assert.equal((await get("/about/")).status, 200);
  r = await get("/about");
  assert.deepEqual([r.status, r.loc], [308, "/about/"], "a directory without its slash");
  r = await get("/janna.html");
  assert.deepEqual([r.status, r.loc], [308, "/janna"], "/x.html → /x");
  assert.equal((await get("/janna")).status, 200, "/x → x.html");
  assert.deepEqual([(await get("/about/index.html")).status, (await get("/about/index.html")).loc], [308, "/about/"]);
  assert.deepEqual([(await get("/index.html")).status, (await get("/index.html")).loc], [308, "/"]);
  r = await get("/no-such-page/");
  assert.equal(r.status, 404); assert.match(r.text, /الصفحة غير موجودة/);
  assert.equal((await get("/__site/manifest.json")).status, 404, "internal keys are never served");
  r = await get("/robots.txt");
  assert.equal(r.h.get("Content-Type"), "text/plain; charset=utf-8");
});
test("ETag / If-None-Match → 304, Range → 206, HEAD", async () => {
  const { get } = await setup();
  const a = await get("/img/a.png");
  const tag = a.h.get("ETag");
  assert.ok(tag);
  assert.equal((await get("/img/a.png", { headers: { "If-None-Match": tag } })).status, 304);
  const rg = await get("/img/a.png", { headers: { Range: "bytes=3-6" } });
  assert.deepEqual([rg.status, rg.text, rg.h.get("Content-Range")], [206, "DATA", "bytes 3-6/17"]);
  const hd = await get("/about/", { method: "HEAD" });
  assert.equal(hd.status, 200);
});
test("_routes.json: excluded paths are static (_headers, _redirects); the rest runs functions/ (security headers, edge redirects, 410)", async () => {
  const { get } = await setup();
  let r = await get("/data/app.js");
  assert.equal(r.h.get("Cache-Control"), "public, max-age=3600, must-revalidate", "_headers on a static path");
  assert.equal(r.h.get("X-SEO-Edge"), null, "not through the Functions");
  r = await get("/img/a.png");
  assert.equal(r.h.get("Content-Security-Policy"), "frame-ancestors 'self'");
  assert.deepEqual([(await get("/data/old.js")).status, (await get("/data/old.js")).loc], [301, "/data/app.js"], "_redirects static rule");
  assert.deepEqual([(await get("/img/old/x/y.png")).status, (await get("/img/old/x/y.png")).loc], [301, "/img/x/y.png"], "_redirects splat");
  r = await get("/about/");
  assert.equal(r.h.get("X-SEO-Edge"), "0", "HTML pages run the edge middleware");
  assert.match(r.h.get("Content-Security-Policy") || "", /frame-ancestors 'self'/);
  assert.equal(r.h.get("X-Frame-Options"), "SAMEORIGIN");
  r = await get("/about.html");
  assert.deepEqual([r.status, r.loc], [301, "https://migate-site.example.workers.dev/about/"], "the edge's exact map, on the request host");
  assert.deepEqual([(await get("/home")).status, (await get("/home")).loc], [301, "https://migate-site.example.workers.dev/"]);
  assert.equal((await get("/xmlrpc.php")).status, 410);
  r = await get("/?lang=en");
  assert.deepEqual([r.status, r.loc], [301, "https://migate-site.example.workers.dev/en/"]);
  r = await get("/janna.html?lang=en");
  assert.deepEqual([r.status, r.loc], [301, "https://migate-site.example.workers.dev/janna?lang=en"], "language kept");
  r = await get("/no-such-page/");
  assert.equal(r.status, 404); assert.match(r.h.get("Content-Security-Policy") || "", /frame-ancestors/);
});
test("/api/seo/* runs the [[path]] handler; other /api/* paths are not ours", async () => {
  const { get, env } = await setup();
  let r = await get("/api/seo/health", { headers: { Authorization: "Bearer x.y.z" } });
  assert.equal(r.status, 503, "no ADVISOR_SECRET → auth_off");
  assert.match(r.text, /auth_off|kv_off|"code"/);
  env.ADVISOR_SECRET = "s".repeat(40);
  env.DB = { prepare() { return { bind() { return { first: async () => null }; } }; } };
  r = await get("/api/seo/health", { headers: { Authorization: "Bearer x.y.z" } });
  assert.equal(r.status, 401, "invalid token → 401 JSON");
  assert.match(r.h.get("Content-Type") || "", /json/);
  assert.equal((await get("/api/auth/health")).status, 404, "Worker paths of janna-lookup are not served here");
});
test("www → apex 301 (path + query), http → https; the upload endpoint only with DEPLOY_TOKEN", async () => {
  const { get, env, r2 } = await setup();
  let r = await get("/about/?x=1", {}, "https://www.madeinegyptgate.com");
  assert.deepEqual([r.status, r.loc], [301, "https://madeinegyptgate.com/about/?x=1"]);
  r = await get("/about/", {}, "http://madeinegyptgate.com");
  assert.deepEqual([r.status, r.loc], [301, "https://madeinegyptgate.com/about/"]);
  assert.equal((await get("/__deploy/stat")).status, 404, "no DEPLOY_TOKEN → the endpoint does not exist");
  env.DEPLOY_TOKEN = "t".repeat(64);
  assert.equal((await get("/__deploy/stat", { headers: { "X-Deploy-Token": "wrong" } })).status, 403);
  r = await get("/__deploy/upload/" + encodeURIComponent("factories/مصنع/index.html"), { method: "PUT", body: page("مصنع"), headers: { "X-Deploy-Token": env.DEPLOY_TOKEN, "Content-Type": HTML } });
  assert.equal(r.status, 200);
  assert.ok(r2.m.has("factories/مصنع/index.html"));
  assert.equal(r2.m.get("factories/مصنع/index.html").ct, HTML);
  assert.equal((await get("/__deploy/upload/..%2Fx", { method: "PUT", body: "x", headers: { "X-Deploy-Token": env.DEPLOY_TOKEN } })).status, 400);
  const st = JSON.parse((await get("/__deploy/stat", { headers: { "X-Deploy-Token": env.DEPLOY_TOKEN } })).text);
  assert.equal(st.objects, r2.m.size - 1, "manifest not counted");
  delete env.DEPLOY_TOKEN;
  assert.equal((await get("/__deploy/upload/x", { method: "PUT", body: "x" })).status, 404);
});
