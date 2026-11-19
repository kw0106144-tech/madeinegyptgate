/* Edge SEO layer — shared helpers (docs/janna/SEO-SPEC.md §2.2–2.3).
   Used by functions/_middleware.js (read path: KV bundle → redirects, robots extras, IndexNow key file, HTML rewrite)
   and functions/_lib/seo-api.js (/api/seo/* admin API). No auth and no D1 here.

   KV bundle (binding SEO_KV, key "seo:bundle"; previous version "seo:bundle:prev" for rollback):
   { v, at, by,
     ov:  { "<decoded NFC path, trailing slash for directories, incl. /en/>": {title?, description?, keywords?, h1?, intro?,
            canonical?, robots?, og_title?, og_description?, og_image?, jsonld? (validated, re-serialised JSON), ix? (1 = the
            page had no data-seo="intro" element when the override was saved: insert the intro right after the H1)} },
     rd:  { "<from path>": { to: "/new/path/" | "https://madeinegyptgate.com/…", code: 301|302|410 } },
     cfg: { verify: {google?, bing?, yandex?}, robots_extra: ["User-agent: …", …], indexnow_key?, thresholds? },
     meta: admin-only bookkeeping (who / when / target keywords) — never sent to visitors }
   Fail-open: no binding, no bundle or a KV error → pages are served exactly as built. */

export const SITE_DEFAULT = "https://madeinegyptgate.com";
export const KV_BUNDLE = "seo:bundle", KV_PREV = "seo:bundle:prev";
export const EMPTY = Object.freeze({ v: 0, ov: Object.freeze({}), rd: Object.freeze({}), cfg: Object.freeze({}) });
export const VERIFY_RX = /^[A-Za-z0-9_\-:.]{8,120}$/;
export const INDEXNOW_KEY_RX = /^[A-Za-z0-9-]{8,128}$/;
export const ROBOTS_LINE_RX = /^(User-agent|Allow|Disallow|Crawl-delay|Sitemap):\s?\S*$/i;
export const ROBOTS_VALUES = ["index,follow", "noindex,follow", "noindex,nofollow", "index,follow,max-image-preview:large"];
export const VERIFY_META = Object.freeze({ google: "google-site-verification", bing: "msvalidate.01", yandex: "yandex-verification" });
const own = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

/* production origin (canonical host) — env SITE_ORIGIN, default https://madeinegyptgate.com */
export function siteOrigin(env) {
  const s = String((env && env.SITE_ORIGIN) || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s) ? s.toLowerCase() : SITE_DEFAULT;
}

/* ---------- paths ---------- */
/* path key: (absolute URL → its path) → strip query/hash → decodeURIComponent → NFC → leading "/". Trailing slash kept as is. */
export function normPath(p) {
  let s = String(p == null ? "" : p).trim();
  if (/^https?:\/\//i.test(s)) { try { s = new URL(s).pathname; } catch (e) { return "/"; } }
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  try { s = decodeURIComponent(s); } catch (e) { /* malformed escape: keep the raw text */ }
  s = s.normalize("NFC");
  return s.startsWith("/") ? s : "/" + s;
}
/* "/x/" ↔ "/x" (directories only; "/robots.txt" has no variant) */
export function altSlash(p) {
  if (!p || p === "/") return null;
  if (p.endsWith("/")) return p.slice(0, -1);
  return /\.[A-Za-z0-9]{1,8}$/.test(p.slice(p.lastIndexOf("/") + 1)) ? null : p + "/";
}
export function lookup(map, path) {
  if (!map || typeof map !== "object") return undefined;
  if (own(map, path)) return map[path];
  const a = altSlash(path);
  return a && own(map, a) ? map[a] : undefined;
}
/* "/x/" and "/x" are one page (the asset server 308s one to the other) */
export const samePage = (a, b) => !!a && !!b && (a === b || altSlash(a) === b);
/* path key of a same-site relative redirect target ("/x/?q=1" → "/x/"); null for absolute or protocol-relative targets */
export const targetPath = to => (typeof to === "string" && /^\/(?![/\\])/.test(to) ? normPath(to) : null);
/* raw request pathname whose decoded form is not NFC → the NFC form, re-encoded per segment (else null).
   Leading slashes are collapsed to one, so the result can never read as a protocol-relative "//host/…" URL. */
export function nfcPathname(raw) {
  let changed = false;
  const segs = String(raw).split("/").map(seg => {
    let d; try { d = decodeURIComponent(seg); } catch (e) { return seg; }
    const n = d.normalize("NFC");
    if (n === d) return seg;
    changed = true; return encodeURIComponent(n);
  });
  return changed ? "/" + segs.join("/").replace(/^[/\\]+/, "") : null;
}
/* absolute URL for a path key on the production origin (percent-encoded) */
export function absUrl(site, path) { return new URL(String(path || "/"), site + "/").toString(); }

/* ---------- escaping ---------- */
const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ENT[c]);
/* HTMLRewriter (lol-html) escapes only `"` in setAttribute values, so & < > are escaped here ("&amp;" typed by an admin
   stays literal; no raw "<" in attributes for naive parsers) */
export const attrSafe = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* JSON-LD inside <script>: no "<" at all (no </script>, no <!--) */
const LS = new RegExp(String.fromCharCode(0x2028), "g"), PS = new RegExp(String.fromCharCode(0x2029), "g");
export const safeJsonLd = s => String(s).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");

/* ---------- bundle (KV) with a per-isolate memo ---------- */
export function sanitizeBundle(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  return { ...b, v: Number(b.v) || 0, ov: obj(b.ov), rd: obj(b.rd), cfg: obj(b.cfg) };
}
export function edgeTtlMs(env) { const s = Number(env && env.SEO_TTL); return (s >= 5 && s <= 600 ? s : 60) * 1000; }
let memo = { at: 0, b: null };
/* 1 KV read per isolate per TTL (default 60 s). A KV error keeps the last good bundle; no bundle → EMPTY (pages as built). */
export async function loadBundle(env, now = Date.now()) {
  if (memo.b && now - memo.at < edgeTtlMs(env)) return memo.b;
  let b;
  if (!env || !env.SEO_KV) b = EMPTY;
  else {
    try { b = sanitizeBundle(await env.SEO_KV.get(KV_BUNDLE, { type: "json", cacheTtl: 60 })) || EMPTY; }
    catch (e) { b = memo.b || EMPTY; }
  }
  memo = { at: now, b };
  return b;
}
/* the admin API publishes through the same isolate → its own requests see the new bundle at once */
export function setBundleMemo(b, now = Date.now()) { memo = { at: now, b: sanitizeBundle(b) || EMPTY }; }

/* ---------- static helper files from the build (/_seo/*.json) via env.ASSETS ---------- */
const assetMemo = new Map();
let goneMemo = null;
export function resetEdgeMemos() { memo = { at: 0, b: null }; assetMemo.clear(); goneMemo = null; }
/* GET a deployed static file, following the asset server's own redirects (e.g. /x.html → /x) on the request's host only.
   `path` is a site path (decoded or percent-encoded); out.url receives the URL that answered. */
export async function assetFetch(env, req, path, hops = 2, out) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") return null;
  const origin = new URL(req.url).origin;
  let u = new URL("/" + String(path == null ? "" : path).replace(/^[/\\]+/, ""), origin);
  for (let i = 0; i <= hops; i++) {
    const r = await env.ASSETS.fetch(new Request(u.toString(), { method: "GET", redirect: "manual" }));
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get("Location") : null;
    if (!loc) { if (out) out.url = u; return r; }
    try { await r.body?.cancel(); } catch (e) { /* ignore */ }
    u = new URL(loc, u);
    if (u.origin !== origin) return null;
  }
  return null;
}
/* parsed JSON of a build file, memoised per isolate (deployments are immutable): 10 min, a miss is retried after 60 s */
export async function loadAssetJson(env, req, path, ttl = 600000, now = Date.now()) {
  const m = assetMemo.get(path);
  if (m && now - m.at < (m.v == null ? 60000 : ttl)) return m.v;
  let v = null;
  try { const r = await assetFetch(env, req, path); if (r && r.ok) v = await r.json(); } catch (e) { v = null; }
  assetMemo.set(path, { at: now, v });
  return v;
}

/* /_seo/redirects.json → {exact:{path:to}, prefix:[[p,to]], gone:[RegExp], gone404:[prefix]} (compiled once per object) */
const compiled = new WeakMap();
export function compileRedirects(R) {
  if (!R || typeof R !== "object") return null;
  let c = compiled.get(R);
  if (c) return c;
  const exact = {};
  let self = 0;
  for (const [k, v] of Object.entries(R.exact && typeof R.exact === "object" ? R.exact : {})) {
    if (typeof v !== "string" || !v) continue;
    const key = normPath(k);
    // "/factories" → "/factories/" is the asset server's own trailing-slash 308, not a rule. Kept as a rule it would make
    // the slash-tolerant lookup read "/factories/" as redirecting to itself, and every redirect INTO the hub as a loop.
    if (samePage(targetPath(v), key)) { self++; continue; }
    exact[key] = v;
  }
  const prefix = [];
  for (const x of Array.isArray(R.prefix) ? R.prefix : []) {
    const p = Array.isArray(x) ? x[0] : x && (x.from || x.prefix), to = Array.isArray(x) ? x[1] : x && x.to;
    if (typeof p === "string" && p.length > 1 && typeof to === "string" && to) prefix.push([normPath(p), to]);
  }
  const gone = [];
  for (const s of Array.isArray(R.gone_rx) ? R.gone_rx : []) { try { gone.push(new RegExp(s)); } catch (e) { /* skip a bad pattern */ } }
  const gone404 = (Array.isArray(R.gone_prefix_on_404) ? R.gone_prefix_on_404 : []).filter(s => typeof s === "string" && s.length > 1).map(normPath);
  c = { exact, prefix, gone, gone404, count: Object.keys(exact).length + prefix.length, self };
  compiled.set(R, c);
  return c;
}
export async function loadRedirects(env, req) { return compileRedirects(await loadAssetJson(env, req, "/_seo/redirects.json")); }
export const isGone = (path, rx) => Array.isArray(rx) && rx.some(r => r.test(path));

/* flattenTarget result when the chain ends on a page the admin marked 410: answer 410 at once instead of 301 → 410 */
export const GONE = "\u0000gone";
/* follow admin + build redirects from `to` so every response is ONE hop; null = loop / too long (do not redirect).
   A map entry whose target is the same page as its key (/x → /x/) is no redirect and ends the chain. */
export function flattenTarget(reqUrl, b, R, to, startPath) {
  const seen = new Set([startPath != null ? startPath : normPath(reqUrl.pathname)]);
  let cur = to;
  for (let hop = 0; hop < 6; hop++) {
    if (typeof cur !== "string" || !cur) return null;
    let u; try { u = new URL(cur, reqUrl); } catch (e) { return null; }
    if (u.host !== reqUrl.host) return u.toString();
    const p = normPath(u.pathname), alt = altSlash(p);
    if (seen.has(p) || (alt && seen.has(alt))) return null; // /x and /x/ are the same page (Pages 308s one to the other)
    seen.add(p);
    const a = lookup(b && b.rd, p);
    let next = null;
    if (a && typeof a === "object") { if (+a.code === 410) return GONE; next = a.to; }
    else if (R) next = lookup(R.exact, p) || null;
    if (next && samePage(targetPath(next), p)) next = null;
    if (!next) return cur;
    cur = next;
  }
  return null;
}
/* a Location on this site only. A relative target gets exactly ONE leading "/" (never a protocol-relative "//host" or
   "/\host"); the resolved URL must be http(s) on one of `hosts` (default: the request host). Else null. */
export function safeLocation(reqUrl, to, hosts) {
  let t = String(to == null ? "" : to).trim();
  if (!t) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = "/" + t.replace(/^[/\\]+/, "");
  let u; try { u = new URL(t, reqUrl); } catch (e) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return (hosts && hosts.length ? hosts : [reqUrl.host]).includes(u.host) ? u : null;
}
/* redirect response, or null when the target is not on `hosts` (the caller then serves the request instead) */
export function redirect(reqUrl, to, code = 301, keepQuery = false, hosts) {
  const u = safeLocation(reqUrl, to, hosts);
  if (!u) return null;
  if (keepQuery && !u.search && reqUrl.search) u.search = reqUrl.search;
  const c = [301, 302, 303, 307, 308].includes(+code) ? +code : 301;
  return new Response(null, { status: c, headers: { Location: u.toString(), "Cache-Control": c === 301 || c === 308 ? "public, max-age=3600" : "no-store" } });
}

/* ---------- security headers (SEC M5) ----------
   Pages does not apply _headers to responses that run through Functions, so every page answered here gets them from
   the middleware (static files outside the Functions get the same values from the build's _headers).
   frame-ancestors 'self' (not 'none'): the site frames itself — Janna's / Bassem's live "screen" is a same-origin iframe.
   No script-src on purpose: the pages need inline scripts and the Anam widget (unpkg / jsdelivr). X-Frame-Options
   SAMEORIGIN for old browsers — the same value the zone's managed transform adds, so the two never conflict. */
export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
});
const HTML_ONLY = new Set(["Content-Security-Policy", "X-Frame-Options"]);
/* → the response with the security headers (HTML: all four; anything else: nosniff + Referrer-Policy). Redirects are
   returned as they are (no body to frame or sniff). Never throws: on any problem the response is returned unchanged. */
export function withSecurityHeaders(res) {
  if (!res || !res.headers || (res.status >= 300 && res.status < 400 && res.status !== 304) || res.status === 101) return res;
  try {
    const html = /text\/html/i.test(res.headers.get("Content-Type") || "") || (res.status === 304 && !res.headers.get("Content-Type"));
    const out = new Response(res.status === 304 ? null : res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (html || !HTML_ONLY.has(k)) out.headers.set(k, v);
    return out;
  } catch (e) { return res; }
}

/* 410 Gone + a helpful page: the build's /410.html, else /404.html, else a small bilingual page */
const GONE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>الصفحة غير موجودة – صنع في مصر</title><style>body{font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.8;color:#222;background:#fff}a{color:#8E0B20}</style></head><body><h1>هذه الصفحة لم تعد موجودة</h1><p>ربما نُقلت أو حُذفت من الموقع القديم. جرّب:</p><ul><li><a href="/factories/">دليل المصانع</a></li><li><a href="/tenders/">المناقصات</a></li><li><a href="/rfq/">طلبات عروض الأسعار</a></li><li><a href="/">الصفحة الرئيسية</a></li></ul><p lang="en" dir="ltr">This page no longer exists. Try the <a href="/factories/">factory directory</a>, <a href="/tenders/">tenders</a> or the <a href="/">home page</a>.</p></body></html>`;
export async function goneResponse(env, req, now = Date.now()) {
  if (!goneMemo || now - goneMemo.at > 600000) {
    let html = null;
    for (const p of ["/410.html", "/404.html"]) {
      try {
        const r = await assetFetch(env, req, p);
        if (r && (r.status === 200 || r.status === 404) && /text\/html/i.test(r.headers.get("Content-Type") || "")) { html = await r.text(); break; }
      } catch (e) { /* next */ }
    }
    goneMemo = { at: now, html: html || GONE_HTML };
  }
  return new Response(req.method === "HEAD" ? null : goneMemo.html, { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=3600" } });
}

/* ---------- robots.txt: build file + admin lines (unchanged bytes when there are none) ---------- */
export function cleanRobotsExtra(extra) {
  const out = [];
  for (const l of Array.isArray(extra) ? extra : []) {
    if (typeof l !== "string") continue;
    const s = l.replace(/[\r\n]/g, "").trim();
    if (s && !ROBOTS_LINE_RX.test(s)) continue;
    if (!s && (!out.length || out[out.length - 1] === "")) continue;
    out.push(s);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}
export async function robotsWithExtra(res, extra, method = "GET") {
  const lines = cleanRobotsExtra(extra);
  if (!lines.length) return res;
  let base = res && res.ok ? await res.text() : "User-agent: *\nAllow: /\n";
  if (base && !base.endsWith("\n")) base += "\n";
  const body = base + "\n" + lines.join("\n") + "\n";
  return new Response(method === "HEAD" ? null : body, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

/* ---------- IndexNow key file ---------- */
export function indexNowKeys(b, env) {
  return [b && b.cfg && b.cfg.indexnow_key, env && env.INDEXNOW_KEY].filter(k => typeof k === "string" && INDEXNOW_KEY_RX.test(k));
}

/* ---------- search-console verification metas (home page only) ---------- */
export function verifyMetaHtml(verify) {
  if (!verify || typeof verify !== "object") return "";
  let h = "";
  for (const k of Object.keys(VERIFY_META)) { const t = verify[k]; if (typeof t === "string" && VERIFY_RX.test(t)) h += `<meta name="${VERIFY_META[k]}" content="${escHtml(t)}">`; }
  return h;
}

/* ---------- HTML rewrite (HTMLRewriter / lol-html, streaming) ---------- */
const META_FIELDS = [ // [attribute, name, value from the override]
  ["name", "description", o => o.description],
  ["name", "keywords", o => o.keywords],
  ["name", "robots", o => o.robots],
  ["property", "og:title", o => o.og_title || o.title],
  ["name", "twitter:title", o => o.og_title || o.title],
  ["property", "og:description", o => o.og_description || o.description],
  ["name", "twitter:description", o => o.og_description || o.description],
  ["property", "og:image", o => o.og_image],
  ["name", "twitter:image", o => o.og_image],
  ["property", "og:url", o => o.canonical],
];
const S = v => (typeof v === "string" ? v : "");
/* res = the static page (200 text/html); o = override fields; verify = cfg.verify (pass it only for "/").
   Hooks the build puts on every page (spec §1.2): <title>, the metas above, link[rel=canonical], h1[data-seo=h1],
   [data-seo=intro], script[type=application/ld+json][data-seo=page]. A hook missing from <head> is added before </head>.
   Text goes in as text (escaped by the rewriter); attributes and inserted tags are escaped here. */
export function rewriteHtml(res, o, verify, opt = {}) {
  const HR = opt.HTMLRewriter || globalThis.HTMLRewriter;
  o = o && typeof o === "object" ? o : {};
  const title = S(o.title), canonical = S(o.canonical), h1 = S(o.h1), intro = S(o.intro), jsonld = S(o.jsonld), ix = !!o.ix;
  const metas = META_FIELDS.map(([attr, name, get]) => [attr, name, S(get(o))]).filter(m => m[2]);
  const vh = verifyMetaHtml(verify);
  const seen = new Set();
  let introDone = false;
  const safe = fn => ({ element(e) { try { fn(e); } catch (err) { /* never break the page */ } } });
  let rw = new HR();
  if (title) rw = rw.on("head > title", safe(e => { seen.add("title"); e.setInnerContent(title); }));
  for (const [attr, name, val] of metas) rw = rw.on(`head > meta[${attr}="${name}"]`, safe(e => { seen.add(name); e.setAttribute("content", attrSafe(val)); }));
  if (S(o.og_image)) for (const d of ["og:image:width", "og:image:height"]) rw = rw.on(`head > meta[property="${d}"]`, safe(e => e.remove()));
  if (canonical) rw = rw.on('head > link[rel="canonical"]', safe(e => { seen.add("canonical"); e.setAttribute("href", attrSafe(canonical)); }));
  if (h1 || (intro && ix)) rw = rw.on('h1[data-seo="h1"]', safe(e => {
    if (h1) e.setInnerContent(h1);
    if (intro && ix && !introDone) { introDone = true; e.after(`<p data-seo="intro">${escHtml(intro)}</p>`, { html: true }); }
  }));
  if (intro) rw = rw.on('[data-seo="intro"]', safe(e => { if (introDone) e.remove(); else { introDone = true; e.setInnerContent(intro); } }));
  if (jsonld) rw = rw.on('script[type="application/ld+json"][data-seo="page"]', safe(e => { seen.add("jsonld"); e.setInnerContent(safeJsonLd(jsonld), { html: true }); }));
  const missing = () => {
    let h = vh;
    if (title && !seen.has("title")) h += `<title>${escHtml(title)}</title>`;
    for (const [attr, name, val] of metas) if (!seen.has(name)) h += `<meta ${attr}="${name}" content="${escHtml(val)}">`;
    if (canonical && !seen.has("canonical")) h += `<link rel="canonical" href="${escHtml(canonical)}">`;
    if (jsonld && !seen.has("jsonld")) h += `<script type="application/ld+json" data-seo="page">${safeJsonLd(jsonld)}</script>`;
    return h;
  };
  let headDone = false;
  rw = rw.on("head", safe(e => {
    if (headDone) return;
    headDone = true;
    if (typeof e.onEndTag === "function") e.onEndTag(end => { try { const h = missing(); if (h) end.before(h, { html: true }); } catch (err) { /* keep the page */ } });
    else if (vh) e.append(vh, { html: true });
  }));
  return rw.transform(res);
}

/* weak ETag for a rewritten page: changes with the static file and with every bundle version */
export function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
export const edgeEtag = (etag, v, path) => (etag ? `W/"seo-${fnv1a(String(etag) + "|" + v + "|" + path)}"` : null);
export function etagMatches(header, tag) {
  if (!header || !tag) return false;
  const bare = tag.replace(/^W\//, "");
  return header.split(",").some(t => { t = t.trim(); return t === "*" || t.replace(/^W\//, "") === bare; });
}
