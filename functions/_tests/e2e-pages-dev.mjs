// End-to-end check on the real Workers runtime (workerd) through `wrangler pages dev`: real Pages Functions routing and
// bundling (functions/ copied as is, _tests included), real asset server (pretty URLs, 308s, 404.html, Arabic paths),
// real HTMLRewriter, local KV (SEO_KV) and local D1 (DB = the Worker's schema) — the A7 / A9 / A10 / A12 checks of the spec,
// with NO _redirects file (Pages does not apply it to Functions routes in production), the generator's slash-variant self
// entries in /_seo/redirects.json, one-hop ?lang=en, open-redirect probes, the EN→AR fallback, roles and privacy rules.
//   node functions/_tests/e2e-pages-dev.mjs        (needs wrangler: WRANGLER_BIN=/path/to/wrangler, or npm i -D wrangler)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { signSession, sha256hex } from "../_lib/seo-auth.js";

const here = dirname(fileURLToPath(import.meta.url)), fnDir = join(here, ".."), repo = join(fnDir, "..");
const bin = [process.env.WRANGLER_BIN, join(fnDir, "node_modules/.bin/wrangler"), join(repo, "node_modules/.bin/wrangler"), join(repo, "worker/node_modules/.bin/wrangler")].filter(Boolean).find(p => existsSync(p));
if (!bin) { console.log("SKIP: wrangler not found (set WRANGLER_BIN=/path/to/wrangler or npm i -D wrangler)"); process.exit(0); }

const SECRET = "e2e-secret", AR = "تشكيل-المعادن-في-السادات", AR_PATH = `/factories/${AR}/`;
const work = mkdtempSync(join(tmpdir(), "seo-edge-e2e-")), persist = join(work, ".state"), site = join(work, "site");
const page = (t, extra = "") => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${t}</title><meta name="description" content="وصف ${t}"><meta name="robots" content="index,follow"><meta property="og:title" content="${t}"><meta property="og:description" content="og"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="tw"><link rel="canonical" href="https://madeinegyptgate.com/"><script type="application/ld+json" data-seo="page">{"@context":"https://schema.org","@type":"WebPage","name":"x"}</script></head><body><h1 data-seo="h1">${t}</h1>${extra}</body></html>`;
const FILES = {
  "index.html": page("الرئيسية"), "factories/index.html": page("دليل المصانع", '<p data-seo="intro">مقدمة</p>'), [`factories/${AR}/index.html`]: page("تشكيل المعادن في السادات"),
  "about/index.html": page("عن المنصة"), "contact/index.html": page("اتصل بنا"), "tenders/index.html": page("المناقصات"), "tenders/page/2/index.html": page("المناقصات – صفحة 2"),
  "en/index.html": page("Home"), "en/factories/index.html": page("Factories"), "news/index.html": page("الأخبار"), "404.html": "<!doctype html><html><head><title>404</title></head><body><h1>الصفحة غير موجودة</h1></body></html>",
  "robots.txt": "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_seo/\n\nSitemap: https://madeinegyptgate.com/sitemap.xml\n",
  // exact map as seo_build.part.py emits it today, including the slash-variant self entries next to redirects into those hubs
  "_seo/redirects.json": JSON.stringify({ exact: { "/about.html": "/about/", "/home.html": "/", "/manufacturers": "/factories/", "/manufacturers/": "/factories/", "/factory.html": "/factories/", "/factories.html": "/factories/", "/tenders.html": "/tenders/", "/factories": "/factories/", "/tenders": "/tenders/" }, prefix: [["/tenders/page/", "/tenders/"], ["/ar/20", "/news/"]], gone_rx: ["^/(ar/)?wp-(json|content|admin|includes)(/|$)", "^/xmlrpc\\.php$"], gone_prefix_on_404: ["/factories/", "/industrial_products/", "/tender-item/", "/rfq/"] }),
  "_seo/en-paths.json": JSON.stringify({ "/": "/en/", "/factories/": "/en/factories/" }),
  "_seo/pages.json": JSON.stringify([{ p: "/", t: "home", ti: "الرئيسية", r: "index,follow", lm: "2026-11-10" }, { p: "/factories/", t: "hub", ti: "دليل المصانع", r: "index,follow", lm: "2026-11-17" }, { p: AR_PATH, t: "company", ti: "تشكيل", r: "index,follow" }, { p: "/about/", t: "page", ti: "عن", r: "index,follow" }]),
  "_routes.json": JSON.stringify({ version: 1, include: ["/*"], exclude: ["/data/*", "/img/*", "/media/*", "/fonts/*", "/_seo/*", "/sitemaps/*", "/sitemap.xml", "/manifest.webmanifest", "/favicon.ico"] }),
};
for (const [p, body] of Object.entries(FILES)) { mkdirSync(dirname(join(site, p)), { recursive: true }); writeFileSync(join(site, p), body); }
cpSync(fnDir, join(work, "functions"), { recursive: true, filter: src => !src.includes("node_modules") });

const pings = [];
const inx = createServer((req, res) => { let b = ""; req.on("data", d => (b += d)); req.on("end", () => { pings.push({ url: req.url, body: JSON.parse(b || "{}") }); res.writeHead(202); res.end(); }); });
await new Promise(r => inx.listen(0, "127.0.0.1", r));
const port = 8800 + Math.floor(Math.random() * 150);
writeFileSync(join(work, "wrangler.toml"), `name = "seo-edge-e2e"
pages_build_output_dir = "site"
compatibility_date = "2026-10-01"
[[kv_namespaces]]
binding = "SEO_KV"
id = "e2e-seo-kv"
[[d1_databases]]
binding = "DB"
database_name = "e2e-db"
database_id = "00000000-0000-0000-0000-000000000000"
[vars]
ADVISOR_SECRET = "${SECRET}"
ADMIN_EMAILS = "boss@example.test"
PLATFORM_KEY = "e2e-pkey"
SEO_TTL = "5"
INDEXNOW_ENDPOINT = "http://127.0.0.1:${inx.address().port}/indexnow"
`);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: "", NO_COLOR: "1", CI: "1" };
const schema = existsSync(join(repo, "worker/schema.sql")) ? join(repo, "worker/schema.sql") : null;
const sql = (args) => { const r = spawnSync(bin, ["d1", "execute", "DB", "--local", "--persist-to", persist, ...args], { cwd: work, env, encoding: "utf8" }); if (r.status !== 0) throw new Error("d1: " + r.stdout + r.stderr); };
if (schema) sql(["--file", schema]);
else sql(["--command", "CREATE TABLE members (id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user', email_verified_at TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT 'visitor', created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''); CREATE TABLE auth_sessions (sid_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', last_seen_at TEXT NOT NULL DEFAULT ''); CREATE TABLE rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp TEXT NOT NULL); CREATE TABLE blocks (kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, PRIMARY KEY (kind, value));"]);
const now = new Date().toISOString(), expS = Math.floor(Date.now() / 1000) + 3600, expIso = new Date(expS * 1000).toISOString();
const sidA = "a".repeat(32), sidM = "b".repeat(32), sidS = "c".repeat(32), sidB = "d".repeat(32);
sql(["--command", `INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at) VALUES ('uadmin', '', 'admin@example.test', 'visitor', 0, '${now}', '${now}', 'admin', '${now}'), ('umem', '', 'm@example.test', 'visitor', 0, '${now}', '${now}', 'user', '${now}'), ('useo', '', 'seo@example.test', 'visitor', 0, '${now}', '${now}', 'seo', '${now}'), ('ublk', '', 'Gone.Admin+old@gmail.com', 'visitor', 0, '${now}', '${now}', 'admin', '${now}'); INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES ('${await sha256hex(sidA)}', 'uadmin', '${now}', '${expIso}'), ('${await sha256hex(sidM)}', 'umem', '${now}', '${expIso}'), ('${await sha256hex(sidS)}', 'useo', '${now}', '${expIso}'), ('${await sha256hex(sidB)}', 'ublk', '${now}', '${expIso}');`]);
const ADMIN = await signSession(SECRET, "uadmin", sidA, expS), MEMBER = await signSession(SECRET, "umem", sidM, expS), SEO = await signSession(SECRET, "useo", sidS, expS), BLOCKED = await signSession(SECRET, "ublk", sidB, expS);

const dev = spawn(bin, ["pages", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", persist, "--show-interactive-dev-session=false"], { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; dev.stdout.on("data", d => (log += d)); dev.stderr.on("data", d => (log += d));
const base = `http://127.0.0.1:${port}`;
const stop = code => { dev.kill("SIGTERM"); inx.close(); if (!process.env.KEEP_E2E) rmSync(work, { recursive: true, force: true }); process.exit(code); };
const get = async (path, o = {}) => { const r = await fetch(base + path, { redirect: "manual", ...o }); const text = o.method === "HEAD" ? "" : await r.text(); return { status: r.status, h: r.headers, text, loc: r.headers.get("Location") }; };
const api = async (path, o = {}) => { const h = { ...(o.headers || {}) }; if (o.token !== "") h.Authorization = "Bearer " + (o.token || ADMIN); if (o.body !== undefined) h["Content-Type"] = typeof o.body === "string" ? "text/csv" : "application/json"; const r = await fetch(base + "/api/seo" + path, { method: o.method || "GET", headers: h, body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body) }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { /* csv */ } return { status: r.status, data, text, h: r.headers }; };
const loc = p => base + p;
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log("ok", n, "-", name); };

try {
  for (let i = 0; ; i++) { try { const r = await fetch(base + "/about/"); if (r.status === 200) break; } catch (e) { /* not up yet */ } if (i > 240) throw new Error("wrangler pages dev did not start\n" + log); await new Promise(r => setTimeout(r, 500)); }
  await check("static page served, edge header present, no bundle yet", async () => {
    const r = await get("/factories/");
    assert.equal(r.status, 200);
    assert.match(r.text, /<title>دليل المصانع<\/title>/);
    assert.equal(r.h.get("X-SEO-Edge"), "0");
  });
  await check("auth: 401 without token, 403 for a member, 200 for an admin (D1 sessions)", async () => {
    assert.equal((await api("/health", { token: "" })).status, 401);
    assert.equal((await api("/health", { token: MEMBER })).status, 403);
    const h = await api("/health");
    assert.equal(h.status, 200, h.text);
    assert.deepEqual([h.data.auth, h.data.kv, h.data.manifest && h.data.manifest.rows, h.data.build_redirects], ["d1", true, 4, 9], "the 2 self entries are not counted");
    assert.equal(h.h.get("Access-Control-Allow-Origin"), null);
  });
  let v1;
  await check("A9: PUT title override → live title, X-SEO-Edge = bundle_v, og/twitter follow, escaping", async () => {
    const p = await api("/page", { method: "PUT", body: { path: "/factories/", title: '</title><script>alert(1)</script> مصانع "مصر" & الشرق', description: "وصف & تفاصيل <جديدة>" } });
    assert.equal(p.status, 200, p.text);
    v1 = p.data.bundle_v;
    const r = await get("/factories/");
    assert.equal(r.h.get("X-SEO-Edge"), String(v1));
    assert.ok(r.text.includes('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; مصانع "مصر" &amp; الشرق</title>'), r.text.slice(0, 600));
    assert.ok(!r.text.includes("<script>alert(1)"));
    assert.ok(r.text.includes('<meta property="og:title" content="&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; مصانع &quot;مصر&quot; &amp; الشرق">'), "real lol-html: & escaped once, quotes escaped");
    assert.ok(r.text.includes('<meta name="twitter:title" content="&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; مصانع &quot;مصر&quot; &amp; الشرق">'));
    assert.ok(r.text.includes('<meta name="description" content="وصف &amp; تفاصيل &lt;جديدة&gt;">'));
  });
  await check("A9: robots noindex → meta + X-Robots-Tag; ETag/304 tied to the bundle version", async () => {
    await api("/page", { method: "PATCH", body: { path: "/factories/", robots: "noindex,follow" } });
    const r = await get("/factories/");
    assert.ok(r.text.includes('<meta name="robots" content="noindex,follow">'));
    assert.equal(r.h.get("X-Robots-Tag"), "noindex,follow");
    const tag = r.h.get("ETag");
    assert.match(tag || "", /^W\/"seo-/);
    assert.equal((await get("/factories/", { headers: { "If-None-Match": tag } })).status, 304);
    const head = await get("/factories/", { method: "HEAD" });
    assert.deepEqual([head.status, head.h.get("X-Robots-Tag")], [200, "noindex,follow"]);
  });
  await check("A9: invalid JSON-LD → 400; X-Platform-Key on PUT → 403; JSON-LD override is safe", async () => {
    assert.equal((await api("/page", { method: "PATCH", body: { path: "/factories/", jsonld: "{oops" } })).status, 400);
    assert.equal((await api("/page", { method: "PUT", token: "", headers: { "X-Platform-Key": "e2e-pkey" }, body: { path: "/factories/", title: "x" } })).status, 403);
    assert.equal((await api("/export.json", { token: "", headers: { "X-Platform-Key": "e2e-pkey" } })).status, 200);
    await api("/page", { method: "PATCH", body: { path: "/factories/", jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "</script><b>x" } } });
    const r = await get("/factories/");
    const m = r.text.match(/data-seo="page">([\s\S]*?)<\/script>/);
    assert.equal(JSON.parse(m[1]).name, "</script><b>x");
  });
  await check("A9: DELETE → original title; rollback restores the previous bundle", async () => {
    const d = await api("/page?path=/factories/", { method: "DELETE" });
    assert.equal(d.status, 200);
    assert.match((await get("/factories/")).text, /<title>دليل المصانع<\/title>/);
    const rb = await api("/rollback", { method: "POST" });
    assert.equal(rb.status, 200);
    const r = await get("/factories/");
    assert.equal(r.h.get("X-SEO-Edge"), String(rb.data.bundle_v));
    assert.ok(r.text.includes('<meta name="robots" content="noindex,follow">'), "override is back after rollback");
  });
  await check("A9: verification metas only on /; IndexNow key file; IndexNow POST logged", async () => {
    assert.equal((await api("/config", { method: "PUT", body: { verify: { google: "googleToken_123", yandex: "<meta name=\"yandex-verification\" content=\"y4ndexT0ken\" />" } } })).status, 200);
    const home = await get("/");
    assert.ok(home.text.includes('<meta name="google-site-verification" content="googleToken_123"><meta name="yandex-verification" content="y4ndexT0ken">'));
    assert.ok(!(await get("/about/")).text.includes("google-site-verification"));
    const k = await api("/indexnow/key", { method: "POST" });
    const kf = await get(`/${k.data.key}.txt`);
    assert.deepEqual([kf.status, kf.text], [200, k.data.key]);
    const s = await api("/indexnow", { method: "POST", body: { urls: ["https://madeinegyptgate.com/factories/"] } });
    assert.deepEqual([s.status, s.data.ok, s.data.status], [200, true, 202], s.text);
    assert.deepEqual(pings[0].body, { host: "madeinegyptgate.com", key: k.data.key, keyLocation: `https://madeinegyptgate.com/${k.data.key}.txt`, urlList: ["https://madeinegyptgate.com/factories/"] });
    assert.equal((await api("/indexnow/log")).data.items[0].status, 202);
  });
  await check("A7: redirects (build map, admin table, ?p=, ?lang=en, 410s, legacy prefixes on 404 only)", async () => {
    assert.deepEqual([(await get("/about.html")).status, (await get("/about.html")).loc], [301, loc("/about/")]);
    assert.equal((await get("/?p=196")).loc, loc("/"));
    assert.equal((await get("/manufacturers")).loc, loc("/factories/"));
    assert.equal((await get("/?lang=en")).loc, loc("/en/"));
    assert.equal((await get("/ar/wp-json/wp/v2/products/1")).status, 410);
    const g = await get("/factories/no-such-slug/");
    assert.equal(g.status, 410);
    assert.match(g.text, /الصفحة غير موجودة/);
    assert.equal((await get("/tenders/page/132/")).loc, loc("/tenders/"));
    assert.equal((await get("/tenders/page/2/")).status, 200);
    const add = await api("/redirects", { method: "POST", body: { from: "/old-contact/", to: "/about.html" } });
    assert.equal(add.data.redirect.to, "/about/", "collapsed through the build map at save time");
    assert.equal((await get("/old-contact/")).loc, loc("/about/"));
    assert.equal((await get("/old-contact")).loc, loc("/about/"));
    assert.equal((await api("/redirects", { method: "POST", body: { from: "/loop/", to: "/loop" } })).status, 400);
    assert.equal((await get("/about")).status, 308, "the asset server's own slash redirect is untouched");
  });
  await check("A7 with no _redirects (as in production): the generator's self entries do not break redirects into hubs", async () => {
    for (const p of ["/manufacturers", "/manufacturers/", "/factory.html", "/factories.html"]) { const r = await get(p); assert.deepEqual([r.status, r.loc], [301, loc("/factories/")], p); }
    assert.deepEqual([(await get("/tenders.html")).status, (await get("/tenders.html")).loc], [301, loc("/tenders/")]);
    assert.equal((await get("/factories/")).status, 200);
    const add = await api("/redirects", { method: "POST", body: { from: "/old-hub/", to: "/factories/" } });
    assert.equal(add.status, 200, "admin redirects into a hub are accepted: " + add.text);
    assert.equal((await get("/old-hub/")).loc, loc("/factories/"));
  });
  await check("?lang=en: one hop via the redirect maps to the EN twin; Location never leaves the site; dropped /en/ page → AR", async () => {
    assert.equal((await get("/factories.html?lang=en")).loc, loc("/en/factories/"));
    assert.equal((await get("/about.html?lang=en")).loc, loc("/about/?lang=en"), "no EN twin: the AR page keeps the language (QA C)");
    assert.equal((await get("/factories/no-such-slug/?lang=en")).status, 410);
    for (const p of ["/%2Fevil.example?lang=en", "/%5Cevil.example?lang=en", "/%2fevil.example/x?lang=en", "//evil.example/e%CC%81", "/%2Fevil.example/e%CC%81"]) {
      const r = await get(p);
      assert.ok(!r.loc || new URL(r.loc, base).host === new URL(base).host, p + " → " + r.loc);
    }
    assert.deepEqual([(await get("/en/contact/")).status, (await get("/en/contact/")).loc], [301, loc("/contact/?lang=en")], "Arabic-only target: English kept, one hop");
    assert.equal((await get("/en/factories.html")).loc, loc("/en/factories/"), "a target with an EN twin: the twin itself");
    assert.equal((await get("/en/factories/no-such-slug/")).status, 410);
    assert.equal((await get("/en/factories/")).status, 200);
  });
  await check("roles and privacy: SEO role edits pages but not verification; blocked member → 401; contacts refused", async () => {
    assert.equal((await api("/page", { method: "PATCH", token: SEO, body: { path: "/about/", title: "عن منصة صنع في مصر – فريق SEO" } })).status, 200);
    const v = await api("/config", { method: "PUT", token: SEO, body: { verify: { bing: "0123456789ABCDEF" } } });
    assert.deepEqual([v.status, v.data.code], [403, "admin_only"]);
    const b = await api("/config", { method: "PUT", token: SEO, body: { robots_extra: ["User-agent: Googlebot", "Disallow: /*"], confirm_block_all: true } });
    assert.deepEqual([b.status, b.data.code], [403, "admin_only"]);
    assert.equal((await api("/health", { token: BLOCKED })).status, 200);
    sql(["--command", "INSERT INTO blocks (kind, value, reason, created_at) VALUES ('email', 'goneadmin@gmail.com', 'left', '" + now + "')"]);
    assert.equal((await api("/health", { token: BLOCKED })).status, 401, "blocked in the Worker's blocks table (same emailKey)");
    const c = await api("/page", { method: "PATCH", body: { path: "/about/", description: "للتواصل مع المصنع: 0100 123 4567 أو sales@factory.example – منصة صنع في مصر" } });
    assert.deepEqual([c.status, c.data.field], [400, "description"]);
  });
  await check("A10: Arabic path in upper- and lower-case percent-encoding → 200 with the override H1", async () => {
    const e = await api("/page", { method: "PUT", body: { path: AR_PATH, h1: "تشكيل المعادن – السادات", intro: "نبذة عن المصنع" } });
    assert.equal(e.status, 200, e.text);
    assert.equal(e.data.override.ix, 1);
    const up = encodeURI(AR_PATH), low = up.replace(/%[0-9A-F]{2}/g, m => m.toLowerCase());
    for (const p of [up, low]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.ok(r.text.includes('<h1 data-seo="h1">تشكيل المعادن – السادات</h1><p data-seo="intro">نبذة عن المصنع</p>'), p);
    }
  });
  await check("A12: CSV export → re-import dry run → 0 changes; robots extras appended", async () => {
    const ex = await fetch(base + "/api/seo/export.csv?kind=overrides", { headers: { Authorization: "Bearer " + ADMIN } });
    const bytes = new Uint8Array(await ex.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const dry = await api("/import?kind=overrides&dry_run=1", { method: "POST", body: new TextDecoder().decode(bytes) });
    assert.deepEqual([dry.data.create, dry.data.update, dry.data.errors.length], [0, 0, 0], dry.text);
    assert.ok(dry.data.unchanged >= 2);
    await api("/config", { method: "PUT", body: { robots_extra: ["User-agent: GPTBot", "Allow: /"] } });
    assert.ok((await get("/robots.txt")).text.endsWith("Sitemap: https://madeinegyptgate.com/sitemap.xml\n\nUser-agent: GPTBot\nAllow: /\n"));
  });
  console.log(`\nE2E OK: ${n} checks on workerd (wrangler pages dev)`);
  stop(0);
} catch (e) {
  console.error("E2E FAILED:", e && e.stack || e, "\n--- wrangler log (tail) ---\n" + log.slice(-4000));
  stop(1);
}
