/* No-match candidate search (owner decision 19 — admin console ONLY, never shown to buyers; the request itself never reaches them — the
   directory ones may get the teaser of teasers.js at an official company e-mail, owner decision 2026-11-28).
   When no REGISTERED member factory matches a routable request, the platform lists factories that could fulfil it so the
   administrators can arrange it themselves:
   1) the platform directory (worker/src/data.json → f: the imported directory listings and the public-source factories — none
      of them a registered member that receives requests), scored like the matching engine (sector + product keywords, Arabic
      normalisation, same governorate bonus);
   2) the web, ONLY when a search key is configured: BRAVE_SEARCH_KEY (Brave Search API) or GOOGLE_CSE_KEY + GOOGLE_CSE_CX
      (Google Programmable Search). No key → no web search at all (nothing is ever scraped).
   Candidate: {name, governorate, sector, source: "directory" | "web", url, profile_url, snippet, origin, score}
   origin: "directory_listing" (imported platform directory, not a member) | "public_source" (official public source) | web host. */
import DATA from "./data.json";
import { tokens, norm } from "./text.js";
import { inquiryText, GENERIC } from "./matching.js";
import { site, line, govName, SITE } from "./common.js";

export const MAX_DIR = 12, MAX_WEB = 8;
const WEB_TIMEOUT_MS = 6000;
const tok = (s, max) => tokens(s, max).filter(t => !GENERIC.has(t));
/* web titles / snippets → plain text: entities decoded FIRST, then every tag and any stray < > removed (SEC L5) */
const stripTags = s => String(s == null ? "" : s).replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").replace(/[<>]/g, "");

let ROWS = null; // pre-tokenised directory rows (once per isolate)
function rows() {
  if (!ROWS) ROWS = (DATA.f || []).map(f => ({ f, toks: new Set(tok(`${f[2] || ""} ${f[4] || ""} ${f[0] || ""}`, 120)), sector: norm(f[2] || ""), loc: norm(f[3] || "") }));
  return ROWS;
}
/* what the request is about (for the web query and the admin notice) */
export function aboutText(inq) {
  const p = (inq && inq.payload) || {}, it = ((inq && inq.items) || [])[0] || {};
  return line(p.product || p.title || p.material || it.name || it.product || (inq && inq.sector) || p.sector || String((inq && inq.message) || "").slice(0, 80), 100);
}

/* 1) directory candidates, best first */
export function directoryCandidates(env, inq, max = MAX_DIR) {
  const p = (inq && inq.payload) || {};
  const qToks = tok(inquiryText(inq || {}), 120), sector = String((inq && inq.sector) || p.sector || ""), sToks = tok(sector);
  if (!qToks.length && !sToks.length) return [];
  const gov = norm(govName((inq && inq.governorate) || p.governorate || "").replace(/^محافظ[هة]\s*/, ""));
  const base = site(env), out = [];
  for (const r of rows()) {
    let score = 0;
    for (const t of qToks) {
      if (r.toks.has(t)) { score += 3 + Math.min(t.length, 8) * 0.5; continue; }
      if (t.length >= 4) for (const x of r.toks) if (x.length >= 4 && (x.startsWith(t) || t.startsWith(x))) { score += 1.5; break; }
    }
    if (sector && r.sector) { if (norm(sector) === r.sector) score += 12; else { const hit = sToks.filter(t => r.toks.has(t)).length; if (hit) score += 6 + 2 * hit; } }
    if (score < 3) continue; // at least one real keyword / sector hit
    if (gov && r.loc.includes(gov)) score += 2;
    const f = r.f, url = (String(f[5] || "").startsWith("http") ? "" : base) + (f[5] || "");
    out.push({ name: line(f[0], 160), governorate: line(f[3], 120), sector: line(f[2], 160), source: "directory", url, profile_url: url,
      snippet: line(f[4] || f[2] || "", 300), origin: /#x\d+$/.test(f[5] || "") ? "public_source" : "directory_listing", type: line(f[1], 40), score: Math.round(score * 10) / 10 });
  }
  out.sort((a, b) => b.score - a.score || (a.origin === "public_source") - (b.origin === "public_source"));
  return out.slice(0, Math.max(0, max));
}

/* 2) web candidates — only with a configured key */
export const webProvider = env => (env && env.BRAVE_SEARCH_KEY ? "brave" : env && env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX ? "google" : "");
export function webQuery(env, inq) {
  const about = aboutText(inq).replace(/["'<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  if (!about) return "";
  const own = new URL(site(env)).hostname.replace(/^www\./, "");
  return (inq && inq.lang === "en" ? `${about} manufacturer Egypt` : `${about} مصنع مصر`) + ` -site:${own}`;
}
export async function webCandidates(env, inq, max = MAX_WEB) {
  const provider = webProvider(env);
  if (!provider) return { provider: "", items: [], skipped: "no_key" };
  const q = webQuery(env, inq);
  if (!q) return { provider, items: [], skipped: "no_query" };
  let raw = [];
  try {
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(WEB_TIMEOUT_MS) : undefined;
    if (provider === "brave") {
      const r = await fetch("https://api.search.brave.com/res/v1/web/search?" + new URLSearchParams({ q, count: "10", safesearch: "moderate" }), { headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_SEARCH_KEY }, signal });
      if (!r.ok) return { provider, items: [], error: `brave ${r.status}` }; // never echo the key
      const j = await r.json();
      raw = ((j && j.web && j.web.results) || []).map(x => ({ title: x && x.title, url: x && x.url, snippet: x && (x.description || (x.extra_snippets || [])[0]) }));
    } else {
      const r = await fetch("https://www.googleapis.com/customsearch/v1?" + new URLSearchParams({ key: env.GOOGLE_CSE_KEY, cx: env.GOOGLE_CSE_CX, q, num: "10", gl: "eg", hl: env && inq && inq.lang === "en" ? "en" : "ar" }), { headers: { Accept: "application/json" }, signal });
      if (!r.ok) return { provider, items: [], error: `google ${r.status}` };
      const j = await r.json();
      raw = ((j && j.items) || []).map(x => ({ title: x && x.title, url: x && x.link, snippet: x && x.snippet }));
    }
  } catch (e) { return { provider, items: [], error: `${provider}: ${line(e && (e.name === "TimeoutError" ? "timeout" : e.message), 100)}` }; }
  const own = [new URL(site(env)).hostname, new URL(SITE).hostname].map(h => h.replace(/^www\./, ""));
  const seen = new Set(), items = [];
  for (const x of raw) {
    let u; try { u = new URL(String(x.url || "")); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (own.includes(host) || seen.has(host)) continue;
    seen.add(host);
    items.push({ name: line(stripTags(x.title), 160) || host, governorate: "", sector: "", source: "web", url: u.toString().slice(0, 500), profile_url: "", snippet: line(stripTags(x.snippet), 300), origin: host, score: 0 });
    if (items.length >= max) break;
  }
  return { provider, items, query: q };
}

/* both lists → {candidates, web:{provider, error?, skipped?}, at} */
export async function findCandidates(env, inq, nowIso = new Date().toISOString()) {
  const dir = directoryCandidates(env, inq);
  const w = await webCandidates(env, inq);
  return { candidates: [...dir, ...w.items], web: { provider: w.provider, ...(w.error ? { error: w.error } : {}), ...(w.skipped ? { skipped: w.skipped } : {}) }, at: nowIso };
}
