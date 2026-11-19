/* Edge SEO layer — Cloudflare Pages Functions middleware for every request (docs/janna/SEO-SPEC.md §2.3).
   Reads only Workers KV (binding SEO_KV, key "seo:bundle", per-isolate memo SEO_TTL = 60 s) and the build's static
   helper files via env.ASSETS (/_seo/redirects.json, /_seo/en-paths.json). No auth, no D1.
   Pages does not apply _redirects / _headers to requests that run Functions, so every redirect lives here.
   Order:
     0) /api/* → next (the admin API lives in functions/api/seo/[[path]].js; other /api/* paths are Worker routes)
     1) legacy query URLs: /?p=N, /?page_id=N → 301 /;
        ?lang=en → ONE 301: the path is first resolved through the admin + build redirects (/factories.html → /factories/),
        then to its EN twin (/en/factories/) when the build has one, else to the AR page with the query kept (it switches
        to English itself from ?lang=en); an AR page that exists at this very path is served with the parameter;
        the one hop to the English sign-in page (/login/?lang=en → /en/login/) keeps the rest of the query (?next=)
        non-NFC Arabic paths → one 301 to the NFC form (legacy slugs are written to disk NFC)
     2) /<IndexNow key>.txt (key from the bundle or env INDEXNOW_KEY);  /robots.txt + admin lines
     3) admin redirects (bundle.rd, win over everything; 410 = gone page)
     4) build redirects: exact map → 301;  WordPress junk (gone_rx) → 410
     5) serve the static file (conditional headers dropped when the page will be rewritten)
     6) 404 → legacy prefix redirect (only for paths that do not exist, so /tenders/page/N/ pages keep working),
        imported-entity prefixes (/factories/, /industrial_products/, /tender-item/, /rfq/) → 410,
        /en/<x> that is no longer built → 301 to the AR page /<x> when it exists (else the same rules as /<x>), the visitor's
        English kept in the same hop: the target's EN twin when it has one, else the target with lang=en (/en/market/ →
        /market/?lang=en)
     7) HTML 200 → HTMLRewriter with the page override (+ verification metas on "/"), X-SEO-Edge: <bundle v>,
        X-Robots-Tag when the override sets robots, ETag that changes with every bundle version
     8) every answer that is not a redirect gets the security headers (SEC M5; Pages does not apply _headers to Function
        responses): HTML → CSP frame-ancestors 'self' + object-src 'none' + base-uri 'self', X-Frame-Options SAMEORIGIN,
        nosniff, Referrer-Policy strict-origin-when-cross-origin; other files → nosniff + Referrer-Policy.
        /api/* and non-GET requests are never touched (Worker routes, the /api/seo Function).
   Every redirect is flattened to ONE hop, never loops and never leaves this site (Location is always on the request
   host or the canonical host). Failure → passThroughOnException serves the static page. */
import {
  normPath, nfcPathname, loadBundle, loadRedirects, loadAssetJson, assetFetch, lookup, flattenTarget, redirect, GONE,
  samePage, targetPath, goneResponse, isGone, robotsWithExtra, rewriteHtml, verifyMetaHtml, indexNowKeys, edgeEtag,
  etagMatches, siteOrigin, withSecurityHeaders,
} from "./_lib/seo-edge.js";

const EN_RX = /^\/en(\/|$)/;
/* the English sign-in page (signin.part.py): the ?lang=en hop there keeps the rest of the query — ?next= is where the
   visitor goes after the code; every other English twin is reached without the query, as before */
const KEEP_QUERY_EN_RX = /^\/en\/login\/?$/;
const queryWithoutLang = u => { const q = u.search.slice(1).split("&").filter(x => x && !/^lang=/.test(x)).join("&"); return q ? "?" + q : ""; };
const enProbe = new Map(); // AR path → EN path | "" (per isolate, when /_seo/en-paths.json is not deployed)
/* the EN twin of an AR page (decoded path key) or null */
async function enTwin(env, req, arPath) {
  if (EN_RX.test(arPath)) return null;
  const map = await loadAssetJson(env, req, "/_seo/en-paths.json");
  if (map && typeof map === "object") { const t = lookup(map, arPath); return typeof t === "string" && EN_RX.test(t) ? t : null; }
  if (!enProbe.has(arPath)) {
    let ok = false;
    try { const r = await assetFetch(env, req, "/en" + arPath, 0); ok = !!r && r.status === 200; try { await r?.body?.cancel(); } catch (e) { /* ignore */ } } catch (e) { ok = false; }
    if (enProbe.size > 500) enProbe.clear();
    enProbe.set(arPath, ok ? "/en" + arPath : "");
  }
  return enProbe.get(arPath) || null;
}
/* step 6 for an /en/ URL the build does not have: where its redirect goes, without losing the visitor's English, in ONE hop.
   An Arabic target with an EN twin → the twin (/en/factories.html → /en/factories/, not /factories/ and a second 301);
   an Arabic-only target → lang=en merged into the target's own query (/en/market/ → /market/?lang=en: the page switches to
   English itself, the canonical stays /market/). Off-site and /en/ targets are returned as they are, and so is a target
   whose listed twin is this very missing URL (lang=en would bounce back here through step 1). */
async function keepEnglish(env, req, url, hosts, path, t) {
  let u;
  try { u = new URL(t, url); } catch (e) { return t; }
  if (!hosts.includes(u.host)) return t;
  const p = normPath(u.pathname);
  if (EN_RX.test(p)) return t;
  const tw = await enTwin(env, req, p);
  if (tw) {
    if (samePage(tw, path)) return t;
    const q = u.search.slice(1).split("&").filter(x => x && !/^lang=/.test(x)).join("&");   // a lang= there would cost step 1's hop
    return tw + (q ? "?" + q : "") + u.hash;
  }
  if (!/(^|&)lang=/.test(u.search.slice(1))) u.search = u.search ? u.search + "&lang=en" : "?lang=en";
  return u.toString();
}
/* does a built HTML page answer 200 here? → the URL that answered (after the asset server's own 308s) or null */
async function builtPage(env, req, rawPath) {
  try {
    const out = {}, r = await assetFetch(env, req, rawPath, 1, out);
    const ok = !!r && r.status === 200 && /text\/html/i.test(r.headers.get("Content-Type") || "");
    try { await r?.body?.cancel(); } catch (e) { /* ignore */ }
    return ok && out.url ? out.url.pathname : null;
  } catch (e) { return null; }
}

export async function onRequest(ctx) {
  const req = ctx.request, M = req.method;
  // the Worker's paths and every non-GET request pass straight through, untouched (step 0)
  if ((M !== "GET" && M !== "HEAD") || /^\/api(\/|$)/.test(new URL(req.url).pathname)) {
    try { ctx.passThroughOnException(); } catch (e) { /* not available outside Pages */ }
    return ctx.next();
  }
  return withSecurityHeaders(await edge(ctx));
}

async function edge(ctx) {
  const { request: req } = ctx, env = ctx.env || {};
  try { ctx.passThroughOnException(); } catch (e) { /* not available outside Pages */ }
  const M = req.method;
  const url = new URL(req.url);
  const path = normPath(url.pathname), sp = url.searchParams;
  const site = new URL(siteOrigin(env)).host, hosts = [url.host, site, "www." + site];
  const to = (t, code, keepQuery) => redirect(url, t, code, keepQuery, hosts); // null when t would leave the site

  // 1) legacy query URLs and Unicode normalisation
  if (path === "/" && (sp.has("p") || sp.has("page_id"))) return to("/", 301);
  const b = await loadBundle(env), cfg = b.cfg || {};
  const R = await loadRedirects(env, req);
  /* where a path goes through the admin table + the build's exact map + WordPress junk: {to, code} | {gone} | null */
  const resolve = p => {
    const ar = lookup(b.rd, p);
    if (ar && typeof ar === "object" && !samePage(targetPath(ar.to), p)) {
      if (+ar.code === 410) return { gone: true };
      const t = flattenTarget(url, b, R, ar.to, p);
      if (t === GONE) return { gone: true };
      if (t) return { to: t, code: +ar.code === 302 ? 302 : 301 };
    }
    if (R) {
      const ex = lookup(R.exact, p);
      if (ex) { const t = flattenTarget(url, b, R, ex, p); if (t === GONE) return { gone: true }; if (t) return { to: t, code: 301 }; }
      if (isGone(p, R.gone)) return { gone: true };
    }
    return null;
  };
  /* a path with no built page: legacy prefix → its target; imported-entity prefix → gone; else null */
  const missing = p => {
    if (!R) return null;
    for (const [pre, t] of R.prefix) if (p.startsWith(pre) && !samePage(targetPath(t), p)) {
      const f = flattenTarget(url, b, R, t, p);
      if (f === GONE) return { gone: true };
      if (f) return { to: f, code: 301 };
    }
    return R.gone404.some(pre => p.startsWith(pre)) ? { gone: true } : null;
  };
  const rawPath = nfcPathname(url.pathname) || url.pathname; // percent-encoded as requested, NFC

  if (sp.get("lang") === "en") {
    let r = EN_RX.test(path) ? null : resolve(path);
    if (r && r.gone) return goneResponse(env, req);
    const arPath = r ? normPath(new URL(r.to, url).pathname) : path;
    const en = await enTwin(env, req, arPath);
    const keepQ = p => (KEEP_QUERY_EN_RX.test(normPath(p)) ? queryWithoutLang(url) : "");   // /en/login/: ?next= kept
    if (en) { const red = to(en + keepQ(en), 301); if (red) return red; }   // the English twin: English by its URL, the parameter is dropped
    else if (EN_RX.test(path)) { const red = to(rawPath + keepQ(path), 301); if (red) return red; } // already an /en/ page
    else {
      // no English twin: the visitor's language choice is never lost — the page itself switches to English from ?lang=en
      // (data/i18n.js, the janna.html kiosk, captions.js, bot.js), so every redirect keeps the query, and a page that exists
      // at this very path is served as it is (no redirect at all)
      let target = r && r.to;
      if (!target) {
        const live = await builtPage(env, req, rawPath);
        if (live) target = live === rawPath || live === url.pathname ? null : live;   // the asset server's 308 (/janna.html → /janna) folded in
        else if ((r = missing(path))) { if (r.gone) return goneResponse(env, req); target = r.to; }
      }
      if (target) { const red = to(target, 301, true); if (red) return red; }
    }
  }
  const nfc = nfcPathname(url.pathname);
  if (nfc) { const red = to(nfc + url.search, 301); if (red) return red; }

  // 2) IndexNow key file, robots.txt extras
  if (path.endsWith(".txt") && path.lastIndexOf("/") === 0 && indexNowKeys(b, env).includes(path.slice(1, -4)))
    return new Response(M === "HEAD" ? null : path.slice(1, -4), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  if (path === "/robots.txt") return robotsWithExtra(await ctx.next(), cfg.robots_extra, M);

  // 3) admin redirects, 4) build redirects + WordPress junk
  const hit = resolve(path);
  if (hit) {
    if (hit.gone) return goneResponse(env, req);
    const red = to(hit.to, hit.code, true);
    if (red) return red;
  }

  // 5) serve the static file
  const o = b.ov && Object.prototype.hasOwnProperty.call(b.ov, path) && b.ov[path] && typeof b.ov[path] === "object" ? b.ov[path] : null;
  const verify = path === "/" && verifyMetaHtml(cfg.verify) ? cfg.verify : null;
  const rewrite = !!(o || verify);
  let up = req;
  if (rewrite && (req.headers.has("If-None-Match") || req.headers.has("If-Modified-Since"))) {
    const h = new Headers(req.headers); h.delete("If-None-Match"); h.delete("If-Modified-Since");
    up = new Request(req.url, { method: M, headers: h });
  }
  const res = await ctx.next(up);

  // 6) not found: legacy prefixes → one 301; imported-entity prefixes → 410; a dropped /en/ page → its AR page
  if (res.status === 404) {
    // an English URL the build does not have: its Arabic page first (one 301), only then the /en/ prefix rules
    // (gone_prefix_on_404 lists /en/factories/ … too, which would otherwise answer 410 for an Arabic-only page)
    let r = EN_RX.test(path) ? null : missing(path);
    if (EN_RX.test(path)) {
      const arPath = path.slice(3) || "/", arRaw = rawPath.replace(/^\/en(?=\/|$)/, "") || "/";
      r = resolve(arPath);
      if (!r) { const live = await builtPage(env, req, arRaw); r = live ? { to: live, code: 301 } : missing(arPath); }
      if (!r) r = missing(path);
    }
    if (r) {
      const out = r.gone ? await goneResponse(env, req) : to(EN_RX.test(path) ? await keepEnglish(env, req, url, hosts, path, r.to) : r.to, r.code || 301, false);
      if (out) { try { await res.body?.cancel(); } catch (e) { /* ignore */ } return out; }
    }
  }
  if (res.status !== 200 || !/text\/html/i.test(res.headers.get("Content-Type") || "")) return res;

  // 7) HTML: overrides + verification metas
  const v = String(b.v || 0);
  if (!rewrite) { const out = new Response(res.body, res); out.headers.set("X-SEO-Edge", v); return out; }
  const tag = edgeEtag(res.headers.get("ETag"), b.v, path);
  if (tag && etagMatches(req.headers.get("If-None-Match"), tag)) {
    try { await res.body?.cancel(); } catch (e) { /* ignore */ }
    return new Response(null, { status: 304, headers: { ETag: tag, "X-SEO-Edge": v, "Cache-Control": res.headers.get("Cache-Control") || "public, max-age=0, must-revalidate" } });
  }
  let out;
  if (M === "HEAD") out = new Response(null, res);
  else { const t = rewriteHtml(res, o || {}, verify); out = new Response(t.body, t); }
  out.headers.delete("Content-Length");
  out.headers.delete("Last-Modified");
  if (tag) out.headers.set("ETag", tag); else out.headers.delete("ETag");
  if (o && typeof o.robots === "string" && o.robots) out.headers.set("X-Robots-Tag", o.robots);
  out.headers.set("X-SEO-Edge", v);
  return out;
}
