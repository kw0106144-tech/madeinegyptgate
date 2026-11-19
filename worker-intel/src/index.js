/* migate-intel — daily automatic intelligence pipeline for madeinegyptgate.com
   fetch:     /api/intel/* (JSON API, Bassem tool webhook, admin) and /intel/* (SEO pages, sitemap)
   scheduled: "0 *\/2 * * *" group A · "30 *\/6 * * *" group B · "15 3 * * *" group C + daily jobs (statuses, prune) */
import { handleApi } from "./api.js";
import { handlePages } from "./pages.js";
import { runCycle, dailyJobs, groupsForCron } from "./engine.js";

async function cached(req, ctx, build) {
  if (req.method !== "GET" || typeof caches === "undefined") return build();
  const cache = caches.default;
  const hit = await cache.match(req).catch(() => null);
  if (hit) return hit;
  const res = await build();
  if (res.status === 200 && /public/.test(res.headers.get("Cache-Control") || "")) ctx.waitUntil(cache.put(req, res.clone()).catch(() => {}));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    if (p.startsWith("/api/intel/")) {
      if (/^\/api\/intel\/(feed|item\/|brief|sources)/.test(p)) return cached(req, ctx, () => handleApi(req, env, ctx));
      return handleApi(req, env, ctx);
    }
    /* /intel/__*: internal Cache API keys (the site shell, src/siteshell.js) — never answered from the cache to a visitor */
    if (p.startsWith("/intel/__") || p.startsWith("/intel/en/__")) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    if (p === "/intel" || p.startsWith("/intel/")) return cached(req, ctx, () => handlePages(req, env, ctx));
    if (p === "/" && /workers\.dev$/.test(url.hostname)) return Response.redirect(url.origin + "/intel/", 302);
    return new Response("not found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    const groups = groupsForCron(event.cron);
    ctx.waitUntil((async () => {
      try { const s = await runCycle(env, { groups, trigger: "cron " + event.cron, budgetMs: 360000 }); console.log("intel cycle", JSON.stringify({ ...s, sources: undefined, n: s.sources.length })); }
      catch (e) { console.error("intel cycle", e && e.stack || e); }
      if (groups.includes("C")) { try { console.log("intel daily", JSON.stringify(await dailyJobs(env))); } catch (e) { console.error("intel daily", e && e.stack || e); } }
    })());
  },
};
