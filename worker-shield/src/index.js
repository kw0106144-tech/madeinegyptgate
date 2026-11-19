/* migate-shield — keeps the Cloudflare IP list "migate_blocklist" (used by the WAF custom rule MIG-1 on
   madeinegyptgate.com) up to date from public threat-intelligence feeds, every 15 minutes, plus temporary
   auto-bans written by the platform Worker to KV (keys "ban:<ip>", value = reason, expirationTtl = ban length).
   No routes: it only runs on its cron. Secret: CF_LISTS_TOKEN (Cloudflare API token, permission
   "Account Filter Lists: Edit" on this account). Until that secret exists it does nothing and says so. */
const CF = "https://api.cloudflare.com/client/v4";
const MAX_ITEMS = 9500; // Free-plan lists hold 10,000 items in total

export const DEFAULT_FEEDS = [
  { id: "spamhaus-drop", url: "https://www.spamhaus.org/drop/drop_v4.json", format: "ndjson-cidr" },
  { id: "abusech-feodo", url: "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt", format: "lines" },
  { id: "et-compromised", url: "https://rules.emergingthreats.net/blockrules/compromised-ips.txt", format: "lines" },
];

/* ---- IPv4 helpers (public unicast only) ---- */
function ipToInt(ip) {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) { if (!/^\d{1,3}$/.test(s)) return null; const v = +s; if (v > 255) return null; n = n * 256 + v; }
  return n >>> 0;
}
const PRIVATE = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]].map(([a, l]) => [ipToInt(a), l]);
function inRange(n, base, len) { const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0; return ((n & mask) >>> 0) === ((base & mask) >>> 0); }
export function normCidr(s) {
  s = String(s || "").trim().split(/[\s;#]/)[0];
  if (!s) return null;
  const m = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/);
  if (!m) return null;
  const len = m[2] === undefined ? 32 : +m[2];
  if (len < 8 || len > 32) return null;
  const n = ipToInt(m[1]);
  if (n === null) return null;
  const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
  const net = (n & mask) >>> 0;
  for (const [b, l] of PRIVATE) if (inRange(net, b, l)) return null;
  const ip = [net >>> 24, (net >>> 16) & 255, (net >>> 8) & 255, net & 255].join(".");
  return len === 32 ? ip : ip + "/" + len;
}
export function parseFeed(text, format) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#" || line[0] === ";") continue;
    if (format === "ndjson-cidr") { try { const o = JSON.parse(line); if (o && o.cidr) out.push(o.cidr); } catch (e) {} continue; }
    out.push(line);
  }
  return out;
}

async function fetchText(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 20000);
  try { const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "migate-shield/1.0 (+https://madeinegyptgate.com)" }, cf: { cacheTtl: 600 } });
    if (!r.ok) throw new Error("HTTP " + r.status); return await r.text(); } finally { clearTimeout(t); }
}

export async function buildItems(env, fetcher) {
  const feeds = env.FEEDS ? JSON.parse(env.FEEDS) : DEFAULT_FEEDS;
  const items = new Map(), stats = {};
  // auto-bans first (they must never be dropped by the cap)
  if (env.BANS && typeof env.BANS.list === "function") {
    let cursor; let n = 0;
    do { const l = await env.BANS.list({ prefix: "ban:", cursor }); for (const k of l.keys) { const c = normCidr(k.name.slice(4)); if (c && !items.has(c)) { items.set(c, "auto-ban"); n++; } } cursor = l.list_complete ? null : l.cursor; } while (cursor);
    stats["auto-ban"] = n;
  }
  for (const f of feeds) {
    try { const txt = await (fetcher || fetchText)(f.url); let n = 0;
      for (const c0 of parseFeed(txt, f.format)) { const c = normCidr(c0); if (c && !items.has(c)) { items.set(c, f.id); n++; } }
      stats[f.id] = n; } catch (e) { stats[f.id] = "error: " + (e && e.message || e); }
  }
  const arr = [...items].slice(0, MAX_ITEMS).map(([ip, comment]) => ({ ip, comment }));
  return { items: arr, stats, dropped: Math.max(0, items.size - MAX_ITEMS) };
}

async function cf(env, path, init) {
  const r = await fetch(CF + path, { ...init, headers: { Authorization: "Bearer " + env.CF_LISTS_TOKEN, "Content-Type": "application/json", ...(init && init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error("cloudflare " + r.status + " " + JSON.stringify(j.errors || j).slice(0, 300));
  return j;
}
async function digest(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }

export async function run(env, fetcher) {
  if (!env.CF_LISTS_TOKEN) { console.log("migate-shield: CF_LISTS_TOKEN secret missing — list not refreshed"); return { ok: false, reason: "no_token" }; }
  if (!env.ACCOUNT_ID || !env.LIST_ID) throw new Error("ACCOUNT_ID / LIST_ID not configured");
  const { items, stats, dropped } = await buildItems(env, fetcher);
  // never wipe the list because every feed failed
  const feedOk = Object.values(stats).some(v => typeof v === "number" && v > 0);
  if (!feedOk || items.length < 50) { console.log("migate-shield: feeds look broken, keeping the current list", JSON.stringify(stats)); return { ok: false, reason: "feeds_broken", stats }; }
  const h = await digest(JSON.stringify(items.map(i => i.ip).sort()));
  if (env.BANS && (await env.BANS.get("shield:last-hash")) === h) return { ok: true, unchanged: true, count: items.length, stats };
  const j = await cf(env, `/accounts/${env.ACCOUNT_ID}/rules/lists/${env.LIST_ID}/items`, { method: "PUT", body: JSON.stringify(items) });
  if (env.BANS) await env.BANS.put("shield:last-hash", h);
  if (env.BANS) await env.BANS.put("shield:last-run", JSON.stringify({ at: new Date().toISOString(), count: items.length, dropped, stats, op: j.result && j.result.operation_id }));
  console.log("migate-shield: list refreshed", items.length, JSON.stringify(stats));
  return { ok: true, count: items.length, stats, operation: j.result && j.result.operation_id };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env).catch(e => console.error("migate-shield error", e && e.message))); },
  async fetch() { return new Response("Not found", { status: 404 }); },
};
