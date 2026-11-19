/* migate-intel — the site shell of the /intel/ pages, loaded from the site itself.
   The baked src/shell.js goes stale after every site build (asset names are content-hashed: assets/seo-<hash>.js/.css,
   data/janna-welcome.js?v=<hash>), and a stale shell asks for files the site no longer has (bug sweep 2026-11-19, groups 1/27).
   So the shell is cut (shell-extract.js, the rules of tools/make-shell.mjs) from the site's current /tenders/ (AR) or
   /en/tenders/ (EN) page, kept per isolate in memory and per data centre in the Cache API for SHELL_TTL_S (1 hour): a site build
   reaches the /intel/ pages within the hour, with no Worker deploy. Any error, a page that does not look like the site, or more
   than SHELL_TIMEOUT_MS (1.5 s) → the baked SHELL for this request (and for 60 s, so a failing site is not asked on every
   request); a broken or half-loaded shell is never used. */
import { SHELL } from "./shell.js";
import { SITE } from "./util.js";
import { extractShell, looksLikeSite } from "./shell-extract.js";

export const SHELL_TTL_S = 3600, SHELL_TIMEOUT_MS = 1500, SHELL_RETRY_MS = 60000;
export const SHELL_PATH = { ar: "/tenders/", en: "/en/tenders/" };
/* the Cache API key: under this Worker's /intel/ route, on a path the router never serves (index.js answers /intel/__* with 404
   before any cache lookup, so a visitor can never read it back) */
export const shellCacheKey = (origin, lang) => `${SITE}/intel/__shell/${lang}?origin=${encodeURIComponent(origin)}`;

const mem = new Map(), inflight = new Map();
export function _resetShellMemory() { mem.clear(); inflight.clear(); }

async function fromSite(lang, origin, fetchFn, signal) {
  /* fetchFn is called unbound: the Workers runtime throws "Illegal invocation" when fetch is invoked as a method of another object */
  const r = await fetchFn(origin + SHELL_PATH[lang], { headers: { Accept: "text/html", "User-Agent": "migate-intel-shell/1.0 (+" + SITE + "/intel/)" }, redirect: "follow", signal });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !/text\/html/i.test(type)) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} throw new Error("site page " + SHELL_PATH[lang] + ": HTTP " + r.status + " " + type.split(";")[0]); }
  const sh = extractShell(await r.text(), lang);
  if (!looksLikeSite(sh)) throw new Error("site page " + SHELL_PATH[lang] + " does not look like the site");
  return sh;
}

/* → { shell, from: "memory" | "cache" | "site" | "baked", error? }. o: { origin, fetch, cache (a Cache: match/put), waitUntil,
   now, timeoutMs } — every dependency injectable (node --test has no Cache API) */
export async function loadShell(lang, o = {}) {
  lang = lang === "en" ? "en" : "ar";
  const origin = String(o.origin || SITE).replace(/\/+$/, ""), key = origin + "|" + lang;
  const now = o.now || Date.now(), m = mem.get(key);
  if (m && m.exp > now) return m.baked ? { shell: SHELL[lang], from: "baked", error: m.error } : { shell: m.shell, from: "memory" };
  if (inflight.has(key)) return inflight.get(key);
  const timeoutMs = Math.min(+o.timeoutMs || SHELL_TIMEOUT_MS, SHELL_TIMEOUT_MS);
  const p = (async () => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error("shell: no answer within " + timeoutMs + " ms")); }, timeoutMs); });
    const work = (async () => {
      const cache = o.cache || null, req = cache ? new Request(shellCacheKey(origin, lang)) : null;
      if (cache) {
        const hit = await cache.match(req).catch(() => null);
        if (hit) { const c = await hit.json().catch(() => null); if (c && looksLikeSite(c) && now - Date.parse(c.fetched_at || 0) < SHELL_TTL_S * 1000) return { shell: c, from: "cache", at: Date.parse(c.fetched_at) }; }
      }
      const sh = await fromSite(lang, origin, o.fetch || fetch, ctl ? ctl.signal : undefined);
      const rec = { ...sh, fetched_at: new Date(now).toISOString() };
      if (cache) {
        const put = cache.put(req, new Response(JSON.stringify(rec), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=" + SHELL_TTL_S } })).catch(() => {});
        if (o.waitUntil) o.waitUntil(put); else await put;
      }
      return { shell: rec, from: "site", at: now };
    })();
    work.catch(() => {}); // a late failure after the timeout (the aborted fetch) is not an unhandled rejection
    try {
      const got = await Promise.race([work, timeout]);
      mem.set(key, { shell: got.shell, exp: got.at + SHELL_TTL_S * 1000 });
      return { shell: got.shell, from: got.from };
    } catch (e) {
      const error = String(e && e.message || e).slice(0, 160);
      mem.set(key, { baked: true, error, exp: now + SHELL_RETRY_MS });
      return { shell: SHELL[lang], from: "baked", error };
    } finally { clearTimeout(timer); inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/* the Worker's entry: env.SHELL_ORIGIN (default the site) is where the shell is read from (a preview or a local stage in tests);
   env.SHELL_RUNTIME = "0" keeps the baked shell only */
export function siteShell(lang, env = {}, ctx = {}) {
  if (String(env.SHELL_RUNTIME || "") === "0") return Promise.resolve({ shell: SHELL[lang === "en" ? "en" : "ar"], from: "baked", error: "SHELL_RUNTIME=0" });
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  return loadShell(lang, { origin: env.SHELL_ORIGIN || SITE, cache, waitUntil: ctx && typeof ctx.waitUntil === "function" ? x => ctx.waitUntil(x) : null });
}
