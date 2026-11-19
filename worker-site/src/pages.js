/* Cloudflare Pages semantics for a site stored in R2 (binding SITE): the asset server (pretty URLs, 404.html, ETag /
   If-None-Match, Range), _headers, _redirects and _routes.json — so the deploy-1 build (deploy/stage.py output) behaves on the
   Worker "migate-site" exactly as it would on Pages, with functions/ running unchanged in front of it (src/index.js).

   R2 layout: one object per staged file, key = its path relative to site/ (NFC, "/" separators, no leading slash), with the
   Content-Type in httpMetadata. __site/manifest.json (written last by tools/upload.mjs) lists every key: existence checks are
   answered from memory (no R2 round trip per lookup). Keys under __site/ are never served. */

const CONFIG_TTL = 60000;            // ms an isolate keeps _headers / _redirects / _routes.json / the manifest
const DEFAULT_CC = "public, max-age=0, must-revalidate";   // Pages' default for assets without a _headers rule
let memo = null;                     // { at, routes, headers, redirects, keys }

/* ---------- configuration files ---------- */
async function r2text(env, key) {
  try { const o = await env.SITE.get(key); return o ? await o.text() : null; } catch (e) { return null; }
}
export function parseRoutes(text) {
  try {
    const j = JSON.parse(text || "");
    const rx = list => (Array.isArray(list) ? list : []).filter(p => typeof p === "string").map(globRx);
    return { include: rx(j.include), exclude: rx(j.exclude) };
  } catch (e) { return { include: [globRx("/*")], exclude: [] }; }
}
function esc(s) { return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); }
function globRx(p) { return new RegExp("^" + esc(p).replace(/\*/g, ".*") + "$"); }
/* Pages pattern (splat * and :placeholders) → { rx, names } */
function patternRx(p) {
  const names = [];
  let src = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") { names.push("splat"); src += "(.*)"; continue; }
    if (c === ":" && /[A-Za-z]/.test(p[i + 1] || "")) {
      let j = i + 1; while (j < p.length && /\w/.test(p[j])) j++;
      names.push(p.slice(i + 1, j)); src += "([^/]+)"; i = j - 1; continue;
    }
    src += esc(c);
  }
  return { rx: new RegExp("^" + src + "$"), names };
}
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (/^\s/.test(raw)) {
      if (!cur) continue;
      const line = raw.trim();
      if (line.startsWith("!")) { cur.remove.push(line.slice(1).trim().toLowerCase()); continue; }
      const i = line.indexOf(":");
      if (i > 0) cur.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    } else {
      let p = raw.trim();
      try { if (/^https?:\/\//.test(p)) p = new URL(p).pathname; } catch (e) { /* keep */ }
      cur = { ...patternRx(p), set: [], remove: [] };
      rules.push(cur);
    }
  }
  return rules;
}
export function parseRedirects(text) {
  const statics = new Map(), dynamics = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const [from, to, code] = line.split(/\s+/);
    if (!from || !to) continue;
    const status = code ? +code : 302;
    if (![200, 301, 302, 303, 307, 308].includes(status) || status === 200) continue;   // proxying (200) is not used by this site
    if (from.includes("*") || /:[A-Za-z]/.test(from)) dynamics.push({ ...patternRx(from), to, status });
    else statics.set(from, { to, status });
  }
  return { statics, dynamics };
}
export async function loadSiteConfig(env, now = Date.now()) {
  if (memo && now - memo.at < CONFIG_TTL) return memo;
  const [routes, headers, redirects, manifest] = await Promise.all([
    r2text(env, "_routes.json"), r2text(env, "_headers"), r2text(env, "_redirects"), r2text(env, "__site/manifest.json")]);
  let keys = null;
  try { const m = JSON.parse(manifest || ""); if (Array.isArray(m.keys)) keys = new Set(m.keys); } catch (e) { keys = null; }
  memo = { at: now, routes: parseRoutes(routes), headers: parseHeaders(headers), redirects: parseRedirects(redirects), keys,
           built: (() => { try { return JSON.parse(manifest || "{}").built || ""; } catch (e) { return ""; } })() };
  return memo;
}
export function resetSiteConfig() { memo = null; }

/* ---------- routing ---------- */
export function runsFunctions(cfg, pathname) {
  const r = cfg.routes || { include: [], exclude: [] };
  if (r.exclude.some(x => x.test(pathname))) return false;
  return r.include.some(x => x.test(pathname));
}
/* _redirects for a request that does not run Functions (Pages never applies them to Function requests) → Response | null */
export function applyRedirects(cfg, url) {
  const R = cfg.redirects;
  if (!R) return null;
  let path = url.pathname, hit = R.statics.get(path), to = null, status = 0;
  if (!hit) { try { const d = decodeURIComponent(path); if (d !== path) hit = R.statics.get(d); } catch (e) { /* ignore */ } }
  if (hit) { to = hit.to; status = hit.status; }
  else {
    for (const d of R.dynamics) {
      const m = d.rx.exec(path);
      if (!m) continue;
      to = d.to; status = d.status;
      d.names.forEach((n, i) => { to = to.split(":" + n).join(m[i + 1]); });
      break;
    }
  }
  if (!to) return null;
  const loc = /^https?:\/\//.test(to) ? to : to + (to.includes("?") || !url.search ? "" : url.search);
  return new Response(null, { status, headers: { Location: loc } });
}
/* _headers (all matching rules; a header set by several rules is joined with ", ", as on Pages) */
export function applyHeaders(cfg, res, pathname) {
  const rules = cfg.headers || [];
  const hits = rules.filter(r => r.rx.test(pathname));
  if (!hits.length || !res) return res;
  const out = new Response(res.body, res);
  const seen = new Map();
  for (const r of hits) {
    for (const k of r.remove) out.headers.delete(k);
    for (const [k, v] of r.set) {
      const lk = k.toLowerCase();
      if (seen.has(lk)) out.headers.set(k, seen.get(lk) + ", " + v); else out.headers.set(k, v);
      seen.set(lk, out.headers.get(k));
    }
  }
  return out;
}

/* ---------- the asset server ---------- */
const keyOf = path => path.replace(/^\/+/, "");
async function exists(env, cfg, path) {
  const k = keyOf(path);
  if (!k || k.startsWith("__site/") || k.startsWith("__deploy/")) return false;
  if (cfg.keys) return cfg.keys.has(k);
  try { return !!(await env.SITE.head(k)); } catch (e) { return false; }
}
function encodePath(p) { return p.split("/").map(s => encodeURIComponent(s)).join("/"); }
function redirect308(url, path) {
  return new Response(null, { status: 308, headers: { Location: encodePath(path) + url.search, "Cache-Control": DEFAULT_CC } });
}
async function sendFile(req, env, path, status = 200) {
  const k = keyOf(path);
  const range = status === 200 && req.headers.has("Range");
  const obj = await env.SITE.get(k, { onlyIf: status === 200 ? req.headers : undefined, range: range ? req.headers : undefined });
  if (!obj) return null;
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("ETag", obj.httpEtag);
  if (!h.has("Cache-Control")) h.set("Cache-Control", DEFAULT_CC);
  h.set("Accept-Ranges", "bytes");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!("body" in obj) || obj.body === undefined) return new Response(null, { status: 304, headers: h });   // If-None-Match / If-Modified-Since
  let code = status;
  if (range && obj.range) {
    const off = obj.range.offset || 0, len = obj.range.length != null ? obj.range.length : obj.size - off;
    h.set("Content-Range", `bytes ${off}-${off + len - 1}/${obj.size}`);
    h.set("Content-Length", String(len));
    code = 206;
  } else h.set("Content-Length", String(obj.size));
  return new Response(req.method === "HEAD" ? null : obj.body, { status: code, headers: h });
}
async function notFound(req, env, cfg, path) {
  // the nearest 404.html up the tree, else the top-level one, with status 404 (Pages: never a soft 200)
  const parts = (path || "/").split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const cand = "/" + parts.slice(0, i).join("/") + (i ? "/" : "") + "404.html";
    if (await exists(env, cfg, cand)) { const r = await sendFile(req, env, cand, 404); if (r) return r; }
  }
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
/* Pages pretty URLs: /x/ → x/index.html; /x → x (file) or x.html, or 308 /x/ when only x/index.html exists; /x.html → 308 /x;
   /x/index.html → 308 /x/; /x/ with only x.html → 308 /x */
export async function serveAsset(req, env, cfg) {
  const url = new URL(req.url);
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let path;
  try { path = decodeURIComponent(url.pathname).normalize("NFC"); } catch (e) { return notFound(req, env, cfg, "/"); }
  if (path.includes("\u0000") || /(^|\/)\.\.(\/|$)/.test(path)) return notFound(req, env, cfg, "/");
  const send = async p => (await sendFile(req, env, p)) || notFound(req, env, cfg, path);
  if (path.endsWith("/")) {
    if (await exists(env, cfg, path + "index.html")) return send(path + "index.html");
    if (path.endsWith("/index/")) return redirect308(url, path.slice(0, -"index/".length));
    if (path !== "/" && await exists(env, cfg, path.slice(0, -1) + ".html")) return redirect308(url, path.slice(0, -1));
    return notFound(req, env, cfg, path);
  }
  if (path.endsWith("/index.html")) return redirect308(url, path.slice(0, -"index.html".length));
  if (path.endsWith("/index")) return redirect308(url, path.slice(0, -"index".length));
  if (path.endsWith(".html")) {
    if (await exists(env, cfg, path)) return redirect308(url, path.slice(0, -".html".length) || "/");
    if (await exists(env, cfg, path.slice(0, -".html".length) + "/index.html")) return redirect308(url, path.slice(0, -".html".length) + "/");
    return notFound(req, env, cfg, path);
  }
  if (await exists(env, cfg, path)) return send(path);
  if (await exists(env, cfg, path + ".html")) return send(path + ".html");
  if (await exists(env, cfg, path + "/index.html")) return redirect308(url, path + "/");
  return notFound(req, env, cfg, path);
}
