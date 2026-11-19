/* Worker "migate-site": madeinegyptgate.com served from R2 (bucket migate-site) with Cloudflare Pages semantics.
   Why not Pages: the deployment environment's egress proxy rewrites the Authorization header of every api.cloudflare.com
   request, and Pages / Workers Static Assets uploads need Cloudflare's own upload JWT there, so they cannot be uploaded from it.
   A normal Worker deploy works, so the site lives in R2 behind this Worker.

   Request flow (same as the Pages project in deploy/wrangler-pages.toml):
     www.madeinegyptgate.com → 301 apex (path + query kept); http → 301 https on the apex
     /__deploy/*  → TEMPORARY upload endpoint, only while the secret DEPLOY_TOKEN exists (404 otherwise)
     _routes.json include/exclude → Functions: functions/_middleware.js, then functions/api/seo/[[path]].js for /api/seo/*,
                                    unchanged (imported), with a Pages-like context; next() of the last one → the asset server
                  otherwise        → _redirects, the asset server, _headers (src/pages.js)
   Bindings / vars as the Pages project: SITE (R2 migate-site), SEO_KV, DB (migate-db), SITE_ORIGIN, ADMIN_EMAILS;
   secrets ADVISOR_SECRET (same value as janna-lookup: the SEO admin checks the platform's login tokens), SEO_PLATFORM_KEY. */
import { onRequest as middleware } from "../../functions/_middleware.js";
import { onRequest as seoApi } from "../../functions/api/seo/[[path]].js";
import { loadSiteConfig, resetSiteConfig, runsFunctions, applyRedirects, applyHeaders, serveAsset } from "./pages.js";

const APEX = "madeinegyptgate.com";

function safeEq(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/* TEMPORARY: PUT /__deploy/upload/<key> (body = the file, Content-Type kept), GET /__deploy/stat (count + bytes in R2).
   Accepted only with X-Deploy-Token = the secret DEPLOY_TOKEN; without that secret the whole /__deploy/ prefix answers 404. */
async function deploy(req, env, url) {
  const tok = env.DEPLOY_TOKEN;
  if (!tok || String(tok).length < 32) return new Response("Not found", { status: 404 });
  if (!safeEq(req.headers.get("X-Deploy-Token") || "", tok)) return json({ error: "forbidden" }, 403);
  const m = /^\/__deploy\/upload\/(.+)$/.exec(url.pathname);
  if (m && req.method === "PUT") {
    let key;
    try { key = decodeURIComponent(m[1]).normalize("NFC"); } catch (e) { return json({ error: "bad key" }, 400); }
    if (key.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(key) || key.length > 1000 || /[\u0000-\u001f]/.test(key)) return json({ error: "bad key" }, 400);
    const obj = await env.SITE.put(key, req.body, { httpMetadata: { contentType: req.headers.get("Content-Type") || "application/octet-stream" } });
    if (key === "__site/manifest.json") resetSiteConfig();
    return json({ ok: true, key, size: obj.size, etag: obj.etag });
  }
  if (url.pathname === "/__deploy/stat" && req.method === "GET") {
    let n = 0, bytes = 0, cursor;
    do {
      const l = await env.SITE.list({ cursor, limit: 1000 });
      for (const o of l.objects) { if (!o.key.startsWith("__site/")) { n++; bytes += o.size; } }
      cursor = l.truncated ? l.cursor : undefined;
    } while (cursor);
    return json({ objects: n, bytes });
  }
  return json({ error: "not found" }, 404);
}

/* the Pages Functions chain: _middleware.js → (for /api/seo and /api/seo/*) [[path]].js → the asset server */
async function functions(request, env, siteEnv, wctx, cfg) {
  const url = new URL(request.url);
  const chain = [{ fn: middleware, params: {}, path: "/" }];
  const m = /^\/api\/seo(?:\/(.*))?$/.exec(url.pathname);
  if (m) chain.push({ fn: seoApi, params: { path: m[1] ? m[1].split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } }) : [] }, path: "/api/seo/[[path]]" });
  let pass = false;
  const data = {};
  const assets = req => serveAsset(req, siteEnv, cfg);   // Pages: neither _redirects nor _headers apply to Function requests
  const run = (i, req) => {
    if (i >= chain.length) return assets(req);
    const { fn, params, path } = chain[i];
    return fn({
      request: req, env, params, data, functionPath: path,
      waitUntil: p => wctx.waitUntil(p),
      passThroughOnException: () => { pass = true; },
      next: (input, init) => run(i + 1, input === undefined ? req : (input instanceof Request && init === undefined ? input : new Request(input, init))),
    });
  };
  try { return await run(0, request); }
  catch (e) {
    console.error("functions error:", (e && e.stack) || e);     // visible in `wrangler tail migate-site`
    if (pass) { try { return await assets(request); } catch (x) { /* fall through */ } }   // Pages' passThroughOnException: the static asset
    return new Response("Internal error", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www." + APEX || (url.protocol === "http:" && url.hostname === APEX))
      return new Response(null, { status: 301, headers: { Location: "https://" + APEX + url.pathname + url.search, "Cache-Control": "public, max-age=3600" } });
    if (url.pathname.startsWith("/__deploy/")) return deploy(request, env, url);
    const cfg = await loadSiteConfig(env);
    // the env the Functions see: the Pages project's bindings plus ASSETS = the asset server of this build
    const fenv = { ...env, ASSETS: { fetch: (input, init) => serveAsset(input instanceof Request && init === undefined ? input : new Request(input, init), env, cfg) } };
    delete fenv.DEPLOY_TOKEN;
    delete fenv.SITE;
    if (runsFunctions(cfg, url.pathname)) return functions(request, fenv, env, ctx, cfg);
    const red = applyRedirects(cfg, url);
    if (red) return red;
    return applyHeaders(cfg, await serveAsset(request, env, cfg), url.pathname);
  },
};
