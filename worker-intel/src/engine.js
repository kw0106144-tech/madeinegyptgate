/* migate-intel — fetch engine: robots.txt (cached 24 h in KV), per-host politeness (≥1 s, or the host's Crawl-delay),
   conditional GET (ETag / Last-Modified), parsing, normalisation, dedupe (canonical URL + title trigrams, 14 days, most
   official source wins), D1 upserts in few statements, source health (fail_count, auto-disable after 10 failures),
   rotation by schedule group, daily jobs (statuses, brief snapshot, prune). A failing source never stops the run. */
import { UA, itemId, canonicalUrl, trigrams, jaccard, normText, stripHtml, stripContacts, hasContacts, clip, parseDate, statusFor, sqlLit, cairoDay, addDays, sleep, slugify, KINDS, asciiDigits } from "./util.js";
import { parseBody, adapterFor } from "./parsers.js";
import { classifySector, ruleRelevance } from "./sectors.js";
import { marketFor } from "./markets.js";
import { enrichPending, translateTitles } from "./enrich.js";
import { newsRelevant, NEWS_RULE_VERSION } from "./terms.js";

export const LIMITS = { maxSourcesPerRun: 30, maxItemsPerSource: 120, maxBodyBytes: 6_000_000, fetchTimeoutMs: 25000, failDisableAt: 10, dedupeDays: 14, retentionDays: 365 };
const GROUP_EVERY_H = { A: 2, B: 6, C: 24 };

/* ---------- robots.txt (RFC 9309) ---------- */
export function parseRobots(txt, agent = "madeinegyptgate-intelbot") {
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "allow" || k === "disallow") cur.rules.push([k === "allow", v]);
    else if (k === "crawl-delay") { const d = parseFloat(v); if (!isNaN(d)) cur.delay = d; }
  }
  const mine = groups.filter(g => g.agents.some(a => a !== "*" && agent.startsWith(a)));
  const pick = mine.length ? mine : groups.filter(g => g.agents.includes("*"));
  return { rules: pick.flatMap(g => g.rules), delay: pick.map(g => g.delay).find(d => d != null) ?? null };
}
function ruleMatch(pattern, path) {
  if (pattern === "") return -1;
  let re = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  if (re.endsWith("\\$")) re = re.slice(0, -2) + "$";
  return new RegExp(re).test(path) ? pattern.length : -1;
}
export function robotsAllows(parsed, pathAndQuery) {
  let best = -1, allow = true;
  for (const [isAllow, pat] of parsed.rules) {
    const L = ruleMatch(pat, pathAndQuery);
    if (L > best || (L === best && L >= 0 && isAllow)) { best = L; allow = isAllow; }
  }
  return best < 0 ? true : allow;
}
/* robots.txt is read up to ROBOTS_MAX bytes (Google's limit, 500 KiB): rules after it are ignored, a huge or endless body is never held */
export const ROBOTS_MAX = 500 * 1024;
async function robotsText(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") return String(await r.text()).slice(0, cap);
  const rd = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    const v = value instanceof Uint8Array ? value : new Uint8Array(value), k = Math.min(v.length, cap - n);
    if (k > 0) { chunks.push(v.subarray(0, k)); n += k; }
    if (n >= cap) { try { await rd.cancel(); } catch (e) {} break; }
  }
  const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder("utf-8").decode(all);
}
const dropBody = async r => { try { if (r && r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} };
/* o.hop (the «ابعتلي» file / document reader, doc.js robotsOk): redirects are followed by hand, at most 5 (RFC 9309), and every target
   must pass o.hop(url) → {url} | {error} (doc.js checkUrl: https, a public host…). A refused target = unreachable (disallow), more than
   5 = unavailable (allow); neither is cached, so the daily runs (which let fetch follow the redirects) never read such an answer */
export async function robotsFor(url, env, fetchFn = fetch, o = {}) {
  const u = new URL(url), key = "robots:" + u.host;
  const kv = env.KV;
  if (kv) { try { const c = await kv.get(key, "json"); if (c) return c; } catch (e) {} }
  let out = null, cache = true;
  const init = () => ({ headers: { "User-Agent": UA }, redirect: o.hop ? "manual" : "follow", signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
  try {
    let at = u.origin + "/robots.txt", r = await fetchFn(at, init()), hops = 0;
    while (o.hop && r.status >= 300 && r.status < 400 && r.status !== 304) {
      const loc = r.headers.get("location"); await dropBody(r);
      if (!loc || ++hops > 5) { out = { status: r.status, rules: [], delay: null }; cache = false; break; }   // too many → unavailable
      let c; try { c = o.hop(new URL(loc, at).toString()); } catch (e) { c = null; }
      if (!c || c.error || !c.url) { out = { status: 0, rules: [[false, "/"]], delay: null, unreachable: true }; cache = false; break; }
      at = c.url.toString(); r = await fetchFn(at, init());
    }
    if (out) { /* decided by a redirect above */ }
    else if (r.status >= 200 && r.status < 300) { const p = parseRobots(await robotsText(r, ROBOTS_MAX)); out = { status: r.status, rules: p.rules, delay: p.delay }; }
    else if (r.status >= 400 && r.status < 500) { await dropBody(r); out = { status: r.status, rules: [], delay: null }; }          // unavailable → allowed
    else { await dropBody(r); out = { status: r.status, rules: [[false, "/"]], delay: null, unreachable: true }; }                  // 5xx → assume disallow
  } catch (e) { out = { status: 0, rules: [[false, "/"]], delay: null, unreachable: true }; }
  if (kv && cache) { try { await kv.put(key, JSON.stringify(out), { expirationTtl: out.unreachable ? 3600 : 86400 }); } catch (e) {} }
  return out;
}

/* ---------- templating for endpoints / POST bodies ---------- */
export function fillTemplate(s, nowMs = Date.now()) {
  if (!s) return s;
  return String(s).replace(/\{\{date([+-]\d+)?(?::([a-z]+))?\}\}/g, (_, off, fmt) => {
    const d = addDays(cairoDay(nowMs), off ? +off : 0);
    return fmt === "compact" ? d.replace(/-/g, "") : d;
  });
}

/* ---------- fetch one source ---------- */
export function mappingOf(src) {
  if (!src || src.mapping == null || src.mapping === "") return {};
  if (typeof src.mapping !== "string") return src.mapping;
  try { return JSON.parse(src.mapping) || {}; } catch (e) { return {}; }
}
const DEFAULT_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5";
/* headers an adapter may add (never the bot's identity, cookies or credentials) */
const ADAPTER_HEADER_OK = /^(?:accept|accept-language|cache-control)$/i;
const adapterHeaders = h => Object.fromEntries(Object.entries(h && typeof h === "object" ? h : {}).filter(([k, v]) => ADAPTER_HEADER_OK.test(k) && typeof v === "string"));
const sameHostUrl = (next, base) => { try { const a = new URL(String(next), base), b = new URL(base); return /^https?:$/.test(a.protocol) && a.host === b.host ? a.toString() : null; } catch (e) { return null; } };
/* one polite request: robots.txt (cached), per-host gate, timeout, retries with backoff on network errors / 5xx / 429 */
async function politeFetch(url, env, o) {
  const u = new URL(url);
  /* the fetch function is always called unbound: the Workers runtime throws "Illegal invocation" when fetch is invoked as
     a method of another object (o.fetchFn(...)) */
  const fetchFn = o.fetchFn;
  // a robots.txt request (once per host per day, else KV) counts for the per-host gate too: ≥ 1 s before the page itself
  const robots = await robotsFor(url, env, o.gate ? async (...a) => { await o.gate(u.host, null); return fetchFn(...a); } : fetchFn);
  if (!robotsAllows(robots, u.pathname + u.search)) return { blocked: robots.unreachable ? "robots.txt unreachable (" + robots.status + ")" : "disallowed by robots.txt" };
  if (o.gate) await o.gate(u.host, robots.delay);
  let r = null, lastErr = "";
  for (let attempt = 0; attempt < o.tries; attempt++) {
    if (attempt > 0) await (o.sleep || sleep)(o.backoff[Math.min(attempt - 1, o.backoff.length - 1)]);
    try {
      r = await fetchFn(url, { method: o.method || "GET", headers: o.headers, body: o.body, redirect: "follow", signal: AbortSignal.timeout ? AbortSignal.timeout(o.timeoutMs) : undefined });
      if ((r.status >= 500 || r.status === 429) && attempt < o.tries - 1) { lastErr = "HTTP " + r.status; try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} r = null; continue; }
      break;
    } catch (e) { lastErr = String(e && e.message || e); r = null; }
  }
  return r ? { r } : { error: "network: " + lastErr };
}
/* request options for a source: the seed's mapping (admin-editable) first, then the adapter's fetch hints */
function fetchPlan(src, mp, ad) {
  const af = (ad && ad.fetch) || {};
  const retries = Number.isFinite(+af.retries) && af.retries !== null && af.retries !== "" ? +af.retries : 1;
  return {
    pages: Math.max(1, Math.min(+mp.pages || +af.pages || 1, 5)),
    tries: 1 + Math.max(0, Math.min(3, Math.floor(retries))),
    backoff: Array.isArray(af.backoff_ms) && af.backoff_ms.length ? af.backoff_ms.map(x => Math.max(0, Math.min(+x || 0, 20000))) : [2000],
    timeoutMs: Math.max(5000, Math.min(+af.timeout_ms || LIMITS.fetchTimeoutMs, 60000)),
    followNext: !!af.follow_next,
    headers: { ...adapterHeaders(af.headers), "User-Agent": UA, Accept: mp.accept || (adapterHeaders(af.headers).Accept || adapterHeaders(af.headers).accept) || DEFAULT_ACCEPT, "Accept-Language": src.lang === "en" ? "en" : "ar,en;q=0.8,fr;q=0.6" },
  };
}
export async function fetchSource(src, env, ctx = {}) {
  const fetchFn = ctx.fetch || fetch, now = ctx.now || Date.now();
  const mp = typeof src.mapping === "string" ? JSON.parse(src.mapping || "{}") : (src.mapping || {});
  const s = { ...src, mapping: mp, now };
  const ad = adapterFor(src), plan = fetchPlan(src, mp, ad);
  const pages = plan.pages;
  let all = [], etag = src.etag, lastMod = src.last_modified, notModified = false, nextUrl = null, partial = null;
  for (let page = 1; page <= pages; page++) {
    const url = nextUrl || fillTemplate(String(src.endpoint).replace(/\{\{page\}\}/g, String(page)).replace(/\{\{page0\}\}/g, String(page - 1)), now);
    nextUrl = null;
    s.endpoint = url;
    const headers = { ...plan.headers };
    if (page === 1 && pages === 1) { if (src.etag) headers["If-None-Match"] = src.etag; if (src.last_modified) headers["If-Modified-Since"] = src.last_modified; }
    let body;
    if (src.method === "POST") { headers["Content-Type"] = "application/json"; body = fillTemplate(String(src.body || "{}").replace(/"\{\{page\}\}"/g, String(page)).replace(/\{\{page\}\}/g, String(page)), now); }
    const res = await politeFetch(url, env, { fetchFn, gate: ctx.gate, sleep: ctx.sleep, headers, body, method: src.method || "GET", tries: plan.tries, backoff: plan.backoff, timeoutMs: plan.timeoutMs });
    /* a later page that fails keeps the pages already read (they are complete records); page 1 failing fails the source */
    const fail = (status, error) => (page > 1 && all.length ? ((partial = "page " + page + ": " + error), "stop") : { status, error, items: [] });
    if (res.blocked) { const f = fail("robots_blocked", res.blocked); if (f === "stop") break; return f; }
    if (res.error) { const f = fail("error", res.error); if (f === "stop") break; return f; }
    const r = res.r;
    if (r.status === 304) { notModified = true; break; }
    if (!r.ok) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} const f = fail("error", "HTTP " + r.status); if (f === "stop") break; return f; }
    if (page === 1) { etag = r.headers.get("etag") || null; lastMod = r.headers.get("last-modified") || null; }
    let text = await r.text();
    if (text.length > LIMITS.maxBodyBytes) text = text.slice(0, LIMITS.maxBodyBytes);
    let recs;
    try { recs = await parseBody(text, s, ctx.Rewriter); } catch (e) { const f = fail("error", "parse: " + String(e && e.message || e).slice(0, 160)); if (f === "stop") break; return f; }
    all = all.concat(recs);
    if (recs.length === 0) break;
    if (plan.followNext && page < pages) { nextUrl = sameHostUrl(recs.next, url); if (!nextUrl) break; } // cursor paging (OCDS links.next)
  }
  if (notModified) return { status: "not_modified", items: [], etag, lastModified: lastMod };
  const out = { status: "ok", items: all, etag, lastModified: lastMod };
  if (partial) out.partial = partial;
  if (ad && ad.detail && typeof ad.detail.parse === "function" && all.length) {
    try { out.detail = await addDetails(all, s, ad.detail, env, { fetchFn, gate: ctx.gate, now, headers: { ...plan.headers }, timeoutMs: plan.timeoutMs }); }
    catch (e) { out.detail = { error: String(e && e.message || e).slice(0, 120) }; }
  }
  return out;
}

/* ---------- optional notice pages (adapter.detail) ----------
   A list may lack what its notice pages show (EEAA's closing date, IDA's full title and tender subject). For records the
   adapter asks for (kind_hint in detail.kinds) that are recent enough to be kept, at most detail.max pages per run are
   fetched — each through robots.txt, the per-host gate and the same timeout — and detail.parse(html, rec) returns only
   the fields it found. The answer is cached in KV per item (30 days; an empty answer too, so a page is not re-read every
   day) and re-applied on every run, so a later list-only run never erases it. A failed page is simply retried next run. */
const DETAIL_TTL = 30 * 86400;
export function applyDetail(rec, got) {
  for (const [k, v] of Object.entries(got || {})) {
    if (v == null || v === "" || typeof v === "object") continue;
    // title / summary: the detail parser returns them only when they beat the list's (a cut title, the tender's subject
    // instead of a snippet repeating the title); every other field only fills what the list left empty
    if (k === "title" || k === "summary" || rec[k] == null || rec[k] === "") rec[k] = v;
  }
  return rec;
}
async function addDetails(recs, s, det, env, o) {
  const kv = env && env.KV, mp = s.mapping || {};
  const kinds = Array.isArray(det.kinds) ? det.kinds : null;
  const maxAge = (mp.max_age_days || (s.kind === "news" || s.kind === "project_news" ? 21 : 120)) * 864e5;
  const st = { cached: 0, fetched: 0, failed: 0 };
  let left = Math.max(0, Math.min(+det.max || 0, 5));
  for (const r of recs) {
    if (!r || !/^https?:\/\//i.test(String(r.url || "")) || (kinds && !kinds.includes(r.kind_hint))) continue;
    const pub = parseDate(r.published);
    if (pub && o.now - Date.parse(pub) > maxAge) continue;           // dropped by the max-age rule anyway
    const key = "detail:" + itemId(s.id, String(r.ext_id || r.url));
    let got = null;
    if (kv) { try { got = await kv.get(key, "json"); } catch (e) { got = null; } }
    if (got) { st.cached++; applyDetail(r, got); continue; }
    if (left <= 0) continue;
    left--;
    const res = await politeFetch(r.url, env, { fetchFn: o.fetchFn, gate: o.gate, headers: o.headers, tries: 1, backoff: [0], timeoutMs: o.timeoutMs });
    if (res.blocked || res.error || !res.r.ok) {
      st.failed++;
      if (res.r) { try { if (res.r.body && res.r.body.cancel) await res.r.body.cancel(); } catch (e) {} if (res.r.status >= 400 && res.r.status < 500 && kv) { try { await kv.put(key, "{}", { expirationTtl: 3 * 86400 }); } catch (e) {} } }
      continue;
    }
    let html = await res.r.text();
    if (html.length > LIMITS.maxBodyBytes) html = html.slice(0, LIMITS.maxBodyBytes);
    try { got = det.parse(html, r) || {}; } catch (e) { st.failed++; continue; }
    st.fetched++;
    applyDetail(r, got);
    if (kv) { try { await kv.put(key, JSON.stringify(got), { expirationTtl: DETAIL_TTL }); } catch (e) {} }
  }
  return st;
}

/* ---------- raw record → item ---------- */
const TENDER_NEWS = /مناقص|ممارس[هة]|مزايد|كراس[هة] الشروط|طرح (?:مناقص|ممارس|كراس)|\brfq\b|\brfps?\s*:|\/rfp\/|\btenders?\b|request for (?:quotation|proposal)s?|\binvitation (?:for|to) (?:bid|tender)|appel d.offres/i;
export function normalise(rec, src, nowMs = Date.now()) {
  const mp = src.mapping || {};
  let title = clip(stripHtml(rec.title || ""), 400);
  if (hasContacts(title)) title = clip(stripContacts(title), 400);            // personal contacts are never public, titles included
  const url = String(rec.url || "").trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  if (mp.filter_re && rec._raw !== undefined && !new RegExp(mp.filter_re, "i").test(rec._raw)) return null;
  if (mp.title_re && !new RegExp(mp.title_re, "i").test(title + " " + (rec.summary || ""))) return null;
  if (mp.skip_re && new RegExp(mp.skip_re, "i").test(title)) return null;
  let kind = src.kind;
  if (mp.kind_map && rec[mp.kind_map.field] !== undefined) kind = mp.kind_map.map[rec[mp.kind_map.field]] || mp.kind_map.default || kind;
  if (mp.rfq_methods && mp.rfq_methods.includes(String(rec.proc_method || "")) && /^tender_/.test(kind)) kind = "rfq";
  let tag = null;
  if ((kind === "news" || kind === "project_news") && TENDER_NEWS.test(title)) { kind = "project_news"; tag = "tender_news"; }
  if (typeof rec.tag === "string" && /^[a-z][a-z_]{1,23}$/.test(rec.tag)) tag = rec.tag;   // an adapter's own label (e.g. "award") wins
  if (!KINDS.includes(kind)) kind = "news";
  /* news media (a source of kind news): a pure news item must be about industry, trade or the economy (terms.js newsRelevant:
     the sector synonym groups + industry / economy words; no gold / retail price lists, pilgrimage, sports, entertainment,
     weather). An official body's own announcements (IDA, SCZONE: tender sources whose kind_map gives "news") are not filtered;
     mapping.news_filter:false turns it off for a source */
  if (kind === "news" && src.kind === "news" && mp.news_filter !== false && !newsRelevant(title).ok) return null;
  const country = rec.country || "";
  const market = (mp.market_from && rec[mp.market_from] ? marketFor(rec[mp.market_from]) : null) || src.market;
  const published = parseDate(rec.published) || null;
  const deadline = parseDate(rec.deadline);
  const summaryOrig = clip(stripContacts(stripHtml(rec.summary || "")), 200);
  const ext = String(rec.ext_id || url);
  const cpv = Array.isArray(rec.cpv) ? rec.cpv : rec.cpv ? String(rec.cpv).split(/[\s,;]+/) : [];
  const sec = classifySector({ title, summary: summaryOrig, cpv });
  const status = statusFor(kind, deadline, nowMs);
  const it = {
    id: itemId(src.id, ext), source_id: src.id, ext_id: ext.slice(0, 300), kind, tag, market, country: country ? String(country).slice(0, 80) : null,
    sector: sec.index >= 0 ? sec.index : null, title_orig: title, summary_orig: summaryOrig || null,
    entity: rec.entity ? clip(stripContacts(stripHtml(rec.entity)), 200) : null,
    published_at: published, deadline: deadline ? deadline.slice(0, 10) : null,
    value: rec.value !== undefined && rec.value !== "" && !isNaN(parseFloat(asciiDigits(rec.value))) && parseFloat(asciiDigits(rec.value)) > 0 ? parseFloat(asciiDigits(rec.value)) : null,
    currency: rec.currency ? String(rec.currency).slice(0, 8).toUpperCase() : null,
    url, url_norm: canonicalUrl(url), lang: (typeof rec.lang === "string" && /^[a-z]{2}$/.test(rec.lang) ? rec.lang : src.lang) || null, status,
    proc_group: rec.proc_group || null, slug: slugify(title),
  };
  it.relevance = ruleRelevance({ ...it, title, summary: summaryOrig, sector: it.sector }, nowMs);
  return it;
}

/* ---------- dedupe index over the last 14 days ----------
   Title similarity folds the same story / notice published by DIFFERENT sources (the most official one stays primary).
   Within one source, two tenders or projects with different external ids are different notices even when their titles
   are near-identical (lots, numbered tenders, re-tenders: IDA no. 9/10/11, AIIB TCDD lots), so they are never folded by
   title; same-source news can still fold (re-posted stories). opts.noTitle: ids of sources whose mapping says
   title_dedupe:false — their items are matched by canonical URL only. */
export class DedupeIndex {
  constructor(rows = [], opts = {}) { this.noTitle = opts.noTitle instanceof Set ? opts.noTitle : new Set(opts.noTitle || []); this.byUrl = new Map(); this.rows = []; this.tri = new Map(); for (const r of rows) this.add(r); }
  add(r) {
    const row = { id: r.id, source_id: r.source_id, kind: r.kind, official: r.official ?? 1, nt: this.noTitle.has(r.source_id), grams: trigrams(r.title_orig || r.title || "") };
    this.rows.push(row);
    if (r.url_norm) this.byUrl.set(r.url_norm, row);
    const idx = this.rows.length - 1;
    for (const g of row.grams) { let l = this.tri.get(g); if (!l) this.tri.set(g, (l = [])); if (l.length < 400) l.push(idx); }
  }
  /* → matching row or null; same-kind family only; threshold 0.8 on trigram Jaccard */
  find(it, threshold = 0.8) {
    const u = it.url_norm && this.byUrl.get(it.url_norm);
    if (u && u.id !== it.id) return u;
    if (this.noTitle.has(it.source_id)) return null;
    const grams = trigrams(it.title_orig);
    if (grams.size < 8) return null;
    const fam = k => (/^tender_|^rfq$/.test(k) ? "t" : k === "news" || k === "project_news" ? "n" : "p");
    const counts = new Map();
    for (const g of grams) { const l = this.tri.get(g); if (!l || l.length >= 400) continue; for (const i of l) counts.set(i, (counts.get(i) || 0) + 1); }
    let best = null, bestJ = 0;
    for (const [i, c] of counts) {
      const row = this.rows[i];
      if (row.id === it.id || row.nt || fam(row.kind) !== fam(it.kind)) continue;
      if (row.source_id === it.source_id && fam(it.kind) !== "n") continue;   // same source, different id → a different notice
      const j = c / (grams.size + row.grams.size - c);
      if (j > bestJ) { bestJ = j; best = row; }
    }
    if (best && bestJ >= threshold) { const exact = jaccard(grams, best.grams); if (exact >= threshold) return best; }
    return null;
  }
}

/* ---------- D1 writes ---------- */
const COLS = ["id", "source_id", "ext_id", "kind", "tag", "market", "country", "sector", "title_orig", "summary_orig", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "lang", "relevance", "status", "dup_of", "slug", "first_seen_at", "updated_at"];
const UPD = ["kind", "tag", "market", "country", "title_orig", "summary_orig", "entity", "published_at", "deadline", "value", "currency", "url", "url_norm", "status", "updated_at"];
export function upsertSql(rows) {
  const vals = rows.map(r => "(" + COLS.map(c => sqlLit(r[c])).join(",") + ")").join(",\n");
  return `INSERT INTO intel_items (${COLS.join(",")}) VALUES\n${vals}\nON CONFLICT(id) DO UPDATE SET ${UPD.map(c => c === "status" ? "status=CASE WHEN intel_items.status='closed' AND excluded.status!='closed' AND excluded.deadline IS NULL THEN intel_items.status ELSE excluded.status END" : c + "=excluded." + c).join(",")},` +
    ` relevance=CASE WHEN intel_items.ai=1 THEN intel_items.relevance ELSE excluded.relevance END, sector=CASE WHEN intel_items.ai=1 THEN intel_items.sector ELSE excluded.sector END`;
}
function chunkBySize(rows, maxBytes = 90000) {
  const out = []; let cur = [], size = 0;
  for (const r of rows) { const s = COLS.reduce((a, c) => a + String(r[c] ?? "").length * 2 + 4, 40); if (cur.length && size + s > maxBytes) { out.push(cur); cur = []; size = 0; } cur.push(r); size += s; }
  if (cur.length) out.push(cur);
  return out;
}
export async function storeItems(env, src, items, dedupe, nowIso) {
  const db = env.DB;
  if (!items.length) return { new: 0, updated: 0, dups: 0 };
  const seen = new Set(), uniq = [];
  for (const it of items) if (!seen.has(it.id)) { seen.add(it.id); uniq.push(it); }
  const existing = new Set();
  for (let i = 0; i < uniq.length; i += 300) {
    const ids = uniq.slice(i, i + 300).map(x => sqlLit(x.id)).join(",");
    const r = await db.prepare(`SELECT id FROM intel_items WHERE id IN (${ids})`).all();
    for (const row of r.results || []) existing.add(row.id);
  }
  let dups = 0;
  const promote = [];
  for (const it of uniq) {
    it.updated_at = nowIso; it.first_seen_at = nowIso;
    if (existing.has(it.id)) continue;
    const d = dedupe.find(it);
    if (d) {
      dups++;
      if ((src.official ?? 1) > (d.official ?? 1)) promote.push([d.id, it.id]); // the new source is more official: it becomes primary
      else it.dup_of = d.id;
    }
    dedupe.add({ ...it, official: src.official ?? 1 });
  }
  const stmts = chunkBySize(uniq).map(rows => db.prepare(upsertSql(rows)));
  for (const [oldId, newId] of promote) stmts.push(db.prepare("UPDATE intel_items SET dup_of=? WHERE id=? OR dup_of=?").bind(newId, oldId, oldId));
  if (stmts.length) await db.batch(stmts);
  return { new: uniq.filter(x => !existing.has(x.id)).length, updated: uniq.filter(x => existing.has(x.id)).length, dups };
}
/* the notice's own files a source lists (an adapter record's non-enumerable doc_urls [{u, t}] — Kenya PPIP documents[], adapters/json.js
   keDocs) → KV «dochint:<item id>» {h:[{u, t}]} for 60 days, only for items this run kept. Read by «ابعتلي» (api.js mailPack → doc.js
   itemFile tries them first, on the item's own official site only). An unchanged value is not written again; never fails a run. */
export const DOC_HINT_TTL = 60 * 86400;
export async function storeDocHints(env, src, raw, items) {
  const kv = env && env.KV;
  if (!kv) return 0;
  const kept = new Set((items || []).map(i => i.id));
  let n = 0;
  for (const r of raw || []) {
    if (!r || !Array.isArray(r.doc_urls) || !r.doc_urls.length) continue;
    const id = itemId(src.id, String(r.ext_id || String(r.url || "").trim()));   // the id normalise() gives the record
    if (!kept.has(id)) continue;
    const h = r.doc_urls.filter(x => x && typeof x.u === "string" && /^https:\/\/[^\s]+$/i.test(x.u) && x.u.length <= 2000).slice(0, 2).map(x => ({ u: x.u, t: String(x.t || "").slice(0, 40) }));
    if (!h.length) continue;
    const v = JSON.stringify({ h });
    try {
      if ((await kv.get("dochint:" + id)) === v) continue;
      await kv.put("dochint:" + id, v, { expirationTtl: DOC_HINT_TTL });
      n++;
    } catch (e) { /* a hint is a nice-to-have: the run goes on */ }
  }
  return n;
}

/* ---------- source selection (rotation) ---------- */
export function dueSources(sources, groups, nowMs = Date.now(), max = LIMITS.maxSourcesPerRun, force = false) {
  const due = sources.filter(s => s.enabled && groups.includes(s.schedule || "B")).filter(s => {
    if (force || !s.last_run_at) return true;
    const h = GROUP_EVERY_H[s.schedule || "B"] || 6;
    return nowMs - Date.parse(s.last_run_at) >= (h * 3600 - 600) * 1000; // 10-min margin: idempotent if a cron fires twice
  });
  due.sort((a, b) => (a.last_run_at ? Date.parse(a.last_run_at) : 0) - (b.last_run_at ? Date.parse(b.last_run_at) : 0) || String(a.id).localeCompare(String(b.id)));
  return due.slice(0, max);
}
export function groupsForCron(cron) {
  if (cron === "0 */2 * * *") return ["A"];
  if (cron === "30 */6 * * *") return ["B"];
  if (cron === "15 3 * * *") return ["C"];
  return ["A", "B", "C"];
}
export function makeGate(minMs = 1000) {
  const last = new Map();
  return async (host, delaySec) => {
    const wait = Math.max(minMs, Math.min((delaySec || 0) * 1000, 60000));
    const t = last.get(host);
    if (t) { const d = Date.now() - t; if (d < wait) await sleep(wait - d); }
    last.set(host, Date.now());
  };
}

/* ---------- one cycle ---------- */
export async function runCycle(env, opts = {}) {
  const db = env.DB, now = opts.now || Date.now(), nowIso = new Date(now).toISOString();
  const groups = opts.groups || ["A", "B", "C"];
  const stats = { started_at: nowIso, trigger: opts.trigger || "cron", groups: groups.join(""), sources: [], ok: 0, failed: 0, not_modified: 0, items_new: 0, items_updated: 0, dups: 0, ai: null };
  const all = (await db.prepare("SELECT * FROM intel_sources").all()).results || [];
  /* named sources run even when not due — but never a disabled one (robots / terms reasons must hold) */
  if (opts.sourceIds) for (const id of opts.sourceIds) { const s = all.find(x => x.id === id); if (!s) stats.sources.push({ id, status: "unknown_source" }); else if (!s.enabled) stats.sources.push({ id, status: "skipped_disabled" }); }
  let batch = opts.sourceIds ? all.filter(s => s.enabled && opts.sourceIds.includes(s.id)) : dueSources(all, groups, now, opts.max || LIMITS.maxSourcesPerRun, !!opts.force);
  const since = new Date(now - LIMITS.dedupeDays * 864e5).toISOString();
  const recent = (await db.prepare("SELECT i.id, i.source_id, i.kind, i.url_norm, i.title_orig, COALESCE(s.official,1) AS official FROM intel_items i LEFT JOIN intel_sources s ON s.id=i.source_id WHERE i.first_seen_at >= ? AND i.dup_of IS NULL ORDER BY i.first_seen_at DESC LIMIT 6000").bind(since).all()).results || [];
  const dedupe = new DedupeIndex(recent, { noTitle: new Set(all.filter(s => mappingOf(s).title_dedupe === false).map(s => s.id)) });
  const gate = opts.gate || makeGate(1000);
  const deadline = Date.now() + (opts.budgetMs || 240000);   // wall clock (opts.now may be a simulated or past time)
  for (const src of batch) {
    if (Date.now() > deadline) { stats.sources.push({ id: src.id, status: "deferred" }); continue; }
    const t0 = Date.now();
    let res;
    try { res = await fetchSource(src, env, { fetch: opts.fetch, now, gate, sleep: opts.sleep, Rewriter: opts.Rewriter }); }
    catch (e) { res = { status: "error", error: String(e && e.message || e).slice(0, 200), items: [] }; }
    const entry = { id: src.id, status: res.status, ms: Date.now() - t0 };
    if (res.partial) entry.partial = res.partial;
    if (res.detail) entry.detail = res.detail;
    try {
      if (res.status === "ok" || res.status === "not_modified") {
        const mp = typeof src.mapping === "string" ? JSON.parse(src.mapping || "{}") : (src.mapping || {});
        const s2 = { ...src, mapping: mp };
        let items = res.items.map(r => normalise(r, s2, now)).filter(Boolean);
        const maxAge = (mp.max_age_days || (src.kind === "news" || src.kind === "project_news" ? 21 : 120)) * 864e5;
        const today = cairoDay(now);
        items = items.filter(it => (it.deadline && it.deadline >= today) || !it.published_at || now - Date.parse(it.published_at) <= maxAge).filter(it => !(it.status === "closed" && mp.skip_closed !== false));
        items = items.slice(0, LIMITS.maxItemsPerSource);
        const w = await storeItems(env, src, items, dedupe, nowIso);
        if (res.status === "ok") { try { const h = await storeDocHints(env, src, res.items, items); if (h) entry.hints = h; } catch (e) { /* hints never fail a run */ } }
        Object.assign(entry, { parsed: res.items.length, kept: items.length, new: w.new, updated: w.updated, dups: w.dups });
        stats.items_new += w.new; stats.items_updated += w.updated; stats.dups += w.dups;
        if (res.status === "ok") stats.ok++; else stats.not_modified++;
        await db.prepare("UPDATE intel_sources SET last_run_at=?, last_ok_at=?, last_err=NULL, fail_count=0, etag=?, last_modified=?, items_total=(SELECT COUNT(*) FROM intel_items WHERE source_id=?), last_item_at=CASE WHEN ?>0 THEN ? ELSE last_item_at END WHERE id=?")
          .bind(nowIso, nowIso, res.etag || src.etag || null, res.lastModified || src.last_modified || null, src.id, w.new, nowIso, src.id).run();
      } else {
        stats.failed++; entry.error = res.error;
        const fc = (src.fail_count || 0) + 1, disable = fc >= LIMITS.failDisableAt;
        await db.prepare("UPDATE intel_sources SET last_run_at=?, last_err=?, fail_count=?, enabled=CASE WHEN ? THEN 0 ELSE enabled END, disabled_reason=CASE WHEN ? THEN ? ELSE disabled_reason END WHERE id=?")
          .bind(nowIso, String(res.error || res.status).slice(0, 300), fc, disable ? 1 : 0, disable ? 1 : 0, "auto-disabled after " + fc + " consecutive failures: " + String(res.error || "").slice(0, 120), src.id).run();
      }
    } catch (e) { entry.error = "store: " + String(e && e.message || e).slice(0, 200); stats.failed++; }
    stats.sources.push(entry);
  }
  /* stored news re-checked against the relevance rule (before the AI passes, so an unlisted item costs no AI call) */
  try { stats.news = await newsSweep(env, now); } catch (e) { stats.news = { error: String(e && e.message || e).slice(0, 200) }; }
  if (opts.enrich !== false && env.AI) {
    /* the run's AI units: up to AI_TITLES_SHARE (default 2/3) for the titles pass (enrich.js translateTitles — the page-language
       titles of the waiting rows, several per call), the rest for the full enrichment; both under the same daily cap */
    const per = Math.max(0, +(opts.aiLimit ?? env.AI_PER_RUN ?? 60) || 0);
    const share = Math.min(1, Math.max(0, Number.isFinite(+env.AI_TITLES_SHARE) && env.AI_TITLES_SHARE !== "" && env.AI_TITLES_SHARE != null ? +env.AI_TITLES_SHARE : 2 / 3));
    try { stats.titles = await translateTitles(env, { units: Math.floor(per * share), now, budgetMs: Math.max(30000, deadline - Date.now() + 60000) }); }
    catch (e) { stats.titles = { error: String(e && e.message || e).slice(0, 200) }; }
    try { stats.ai = await enrichPending(env, { limit: Math.max(0, per - ((stats.titles && stats.titles.units) || 0)), now, budgetMs: Math.max(30000, deadline - Date.now() + 120000) }); }
    catch (e) { stats.ai = { error: String(e && e.message || e).slice(0, 200) }; }
  }
  stats.finished_at = new Date().toISOString();
  try {
    await db.prepare("INSERT INTO intel_runs (started_at, finished_at, trigger, groups, sources_ok, sources_failed, sources_not_modified, items_new, items_updated, dups, ai_calls, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(stats.started_at, stats.finished_at, stats.trigger, stats.groups, stats.ok, stats.failed, stats.not_modified, stats.items_new, stats.items_updated, stats.dups, ((stats.ai && stats.ai.calls) || 0) + ((stats.titles && stats.titles.calls) || 0), JSON.stringify(stats.sources).slice(0, 20000)).run();
  } catch (e) {}
  return stats;
}

/* ---------- stored news vs the relevance rule ----------
   normalise() keeps new off-topic news out; this re-checks what is already stored — the rows from before the rule, or from before a
   change of it — once per rule version (terms.js NEWS_RULE_VERSION, marked in KV; admin run stage "news" forces it): a pure news
   item (kind news, no tag) of a news source, of the last 120 days, that the rule rejects is unlisted — hidden=2: out of every
   list, count, feed, sitemap, Bassem's tool and the AI queue, while its page still answers (noindex) so a known URL keeps working —
   and one the rule accepts again is listed back. An admin's hide (hidden=1) is never touched; an admin's unhide of an unlisted
   item tags it "kept" (api.js), which takes it out of this check. mapping.news_filter:false sources are never unlisted. */
export async function newsSweep(env, nowMs = Date.now(), o = {}) {
  const db = env.DB, kv = env.KV, key = "newssweep:" + NEWS_RULE_VERSION;
  if (!o.force && kv) { try { if (await kv.get(key)) return { rule: NEWS_RULE_VERSION, skipped: "already applied" }; } catch (e) {} }
  const nowIso = new Date(nowMs).toISOString(), since = new Date(nowMs - 120 * 864e5).toISOString();
  const exempt = new Set(((await db.prepare("SELECT id, mapping FROM intel_sources").all()).results || []).filter(s => mappingOf(s).news_filter === false).map(s => s.id));
  const hide = [], show = [];
  let last = "", checked = 0;
  for (;;) {   // keyset pages: a bounded answer per query whatever the table size
    const rows = (await db.prepare("SELECT i.id, i.source_id, i.title_orig, i.hidden FROM intel_items i JOIN intel_sources s ON s.id=i.source_id WHERE i.kind='news' AND s.kind='news' AND i.tag IS NULL AND i.hidden IN (0,2) AND i.first_seen_at >= ? AND i.id > ? ORDER BY i.id LIMIT 2000").bind(since, last).all()).results || [];
    for (const r of rows) {
      const ok = exempt.has(r.source_id) || newsRelevant(r.title_orig).ok;
      if (!ok && r.hidden === 0) hide.push(r.id); else if (ok && r.hidden === 2) show.push(r.id);
    }
    checked += rows.length;
    if (rows.length < 2000) break;
    last = rows[rows.length - 1].id;
  }
  const stmts = [];
  for (const [ids, to, from] of [[hide, 2, 0], [show, 0, 2]])
    for (let k = 0; k < ids.length; k += 90) { const c = ids.slice(k, k + 90); stmts.push(db.prepare(`UPDATE intel_items SET hidden=${to}, updated_at=? WHERE hidden=${from} AND id IN (${c.map(() => "?").join(",")})`).bind(nowIso, ...c)); }
  for (let k = 0; k < stmts.length; k += 50) await db.batch(stmts.slice(k, k + 50));
  if (kv) { try { await kv.put(key, nowIso, { expirationTtl: 180 * 86400 }); } catch (e) {} }
  return { rule: NEWS_RULE_VERSION, checked, unlisted: hide.length, relisted: show.length };
}

/* ---------- daily: statuses, brief snapshot, prune ---------- */
export async function dailyJobs(env, nowMs = Date.now()) {
  const db = env.DB, today = cairoDay(nowMs), soon = addDays(today, 7), nowIso = new Date(nowMs).toISOString();
  const out = {};
  const r1 = await db.batch([
    db.prepare("UPDATE intel_items SET status='closed', updated_at=? WHERE deadline IS NOT NULL AND deadline < ? AND status!='closed'").bind(nowIso, today),
    db.prepare("UPDATE intel_items SET status='closing_soon', updated_at=? WHERE deadline IS NOT NULL AND deadline >= ? AND deadline <= ? AND status='open'").bind(nowIso, today, soon),
  ]);
  out.closed = r1[0].meta && r1[0].meta.changes; out.closing_soon = r1[1].meta && r1[1].meta.changes;
  const cutoff = new Date(nowMs - LIMITS.retentionDays * 864e5).toISOString();
  const gone = await db.batch([
    db.prepare("INSERT OR IGNORE INTO intel_gone (id, gone_at) SELECT id, ? FROM intel_items WHERE first_seen_at < ?").bind(nowIso, cutoff),
    db.prepare("DELETE FROM intel_items WHERE first_seen_at < ?").bind(cutoff),
    db.prepare("DELETE FROM intel_runs WHERE started_at < ?").bind(new Date(nowMs - 60 * 864e5).toISOString()),
  ]);
  out.pruned = gone[1].meta && gone[1].meta.changes;
  if (env.KV) { try { await env.KV.put("sitemap:v", String(nowMs)); } catch (e) {} }
  return out;
}
export { normText };
