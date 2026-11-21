/* migate-intel — public JSON API (/api/intel/*), Bassem's Anam SERVER_WEBHOOK (/api/intel/tool) and admin endpoints. */
import { KIND_GROUPS, KINDS, KIND_LABEL, KIND_SEG, SITE, timingSafeEqual, cairoDay, addDays, fmtDay, fmtCairo, ID_RE, normText, sqlLit, clip, stripUrls, dayOf, canonicalUrl, stripContacts, hash53 } from "./util.js";
import { readItemDoc, itemFile, TOPIC_AR } from "./doc.js";
import { sectorIndex, sectorName, SECTORS } from "./sectors.js";
import { marketFilter, marketsFilter, marketName, PLAN_SCOPE } from "./markets.js";
import { itemPath, shownTitle } from "./pages.js";
import { runCycle, dailyJobs, newsSweep, mappingOf } from "./engine.js";
import { enrichPending, translateTitles, aiBudget, sanitise } from "./enrich.js";
import { parseQuery, resolveMarket, resolveMarkets, resolveSector, resolveKind, matchItem, itemHay, accepts, fullMatch, textPatterns, literalLike, HAY_SQL, spokenDay, countAr, OPP_WORDS, NEWS_COUNT, daysAr, arDigits, MARKET_GROUP_NAME } from "./terms.js";

const ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
/* the hostname janna-lookup puts in the Request it sends through its service binding INTEL (worker/src/notify-items.js PACK_HOST):
   «.invalid» never resolves (RFC 6761) and is no Cloudflare zone, so no public request can carry it */
export const PACK_HOST = "mailpack.binding.invalid";
function cors(req) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": o && (ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o)) ? o : ORIGINS[0], "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Platform-Key, X-Intel-Key" };
}
export const json = (req, o, status = 200, maxAge = 0) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store", ...cors(req) } });

/* ---------- feed query (shared by API, pages, tool) ----------
   q is parsed into concepts (terms.js: normalisation, stop-words, AR/EN/FR synonyms); SQL keeps a GLOB/LIKE superset (terms.js
   textPatterns), the matcher in rankRows() decides and ranks. A market name inside q («حديد الصين») is used as the market when none
   is given. A q with no product word but a code or number («RFQ/2026/123», «2026») is matched literally, as before.
   o (internal callers only, never URL parameters): mf = a ready market filter, strictWindow = only the date window (the brief). */
const TENDER_KINDS = "'tender_gov','tender_semi','tender_private','rfq'";
export function buildFeedQuery(p = {}, nowMs = Date.now(), o = {}) {
  const where = ["hidden = 0", "dup_of IS NULL"], args = [];
  const kind = String(p.kind || "").toLowerCase();
  if (kind) {
    const ks = KIND_GROUPS[kind] || (KINDS.includes(kind) ? [kind] : kind.split(",").filter(k => KINDS.includes(k)));
    if (ks.length) where.push("kind IN (" + ks.map(() => "?").join(",") + ")"), args.push(...ks);
    if (kind === "tender_news") { where.push("tag = 'tender_news'"); }
  }
  const qs = String(p.q || "").trim().slice(0, 100);
  const search = qs ? parseQuery(qs) : null;
  const mf = o.mf !== undefined ? o.mf : marketFilter(p.market ? resolveMarket(p.market) || String(p.market).toLowerCase() : search && search.market);
  if (mf) { where.push(mf.sql); args.push(...mf.args); }
  if (p.sector !== undefined && p.sector !== "" && p.sector !== null) { const si = typeof p.sector === "number" ? p.sector : sectorIndex(p.sector); if (si >= 0) { where.push("sector = ?"); args.push(si); } }
  const st = String(p.status || "").toLowerCase();
  if (st === "active") where.push("status IN ('open','closing_soon')");
  else if (["open", "closing_soon", "closed", "info"].includes(st)) { where.push("status = ?"); args.push(st); }
  const days = Math.min(Math.max(parseInt(p.days, 10) || 30, 1), 365);
  /* the window is about publication; a tender / RFQ that is still open stays findable whatever its publication date */
  if (o.strictWindow) { where.push("COALESCE(published_at, first_seen_at) >= ?"); args.push(new Date(nowMs - days * 864e5).toISOString()); }
  else { where.push(`(COALESCE(published_at, first_seen_at) >= ? OR (kind IN (${TENDER_KINDS}) AND status IN ('open','closing_soon') AND (deadline IS NULL OR substr(deadline, 1, 10) >= ?)))`); args.push(new Date(nowMs - days * 864e5).toISOString(), cairoDay(nowMs)); }
  if (search && !search.concepts.length && search.codes.length) {
    for (const w of search.codes) { where.push("(title_orig LIKE ? OR title_ar LIKE ? OR title_en LIKE ? OR entity LIKE ? OR summary_ar LIKE ? OR summary_en LIKE ?)"); const l = literalLike(w); args.push(l, l, l, l, l, l); }
  }
  let w = where.join(" AND ");
  if (search && search.concepts.length) {
    /* the haystack is built once per row (MATERIALIZED), then every pattern is tried on it. The patterns are made by the server from
       normalised letters only (terms.js patternOf, ≤ 50 bytes each) and inlined with sqlLit in a balanced OR tree: D1 allows 100 bound
       parameters and an expression depth of 100 (a flat OR chain of ~70 patterns fails), and json_each would read ~35× more rows */
    const tp = textPatterns(search.concepts);
    const tests = tp.glob.map(x => "h.hay GLOB " + sqlLit(x)).concat(tp.like.map(x => "h.hay LIKE " + sqlLit(x)));
    const tree = l => (l.length === 1 ? l[0] : "(" + tree(l.slice(0, l.length >> 1)) + " OR " + tree(l.slice(l.length >> 1)) + ")");
    if (tests.length) w = `id IN (WITH h AS MATERIALIZED (SELECT id, ${HAY_SQL} AS hay FROM intel_items WHERE ${w}) SELECT id FROM h WHERE ${tree(tests)})`;
  }
  const per = Math.min(Math.max(parseInt(p.per, 10) || 20, 1), 50), page = Math.min(Math.max(parseInt(p.page, 10) || 1, 1), 200);
  const order = p.sort === "relevance" ? "relevance DESC, COALESCE(published_at, first_seen_at) DESC" : p.sort === "deadline" ? "CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline ASC" : "COALESCE(published_at, first_seen_at) DESC, relevance DESC";
  return { where: w, args, per, page, order, days, search: search && search.concepts.length ? search : null, parsed: search };
}
/* ranking: match strength (all query concepts, one of them in a title, first), then kind (tenders/RFQs/projects > project news >
   news), open deadline first, more concepts / terms matched, newer */
const TIER = { tender_gov: 0, tender_semi: 0, tender_private: 0, rfq: 0, project: 0, project_news: 1, news: 2 };
export const tierOf = r => (r.tag === "tender_news" ? Math.min(TIER[r.kind] ?? 2, 1) : TIER[r.kind] ?? 2);
export const isPureNews = r => r.kind === "news" && r.tag !== "tender_news";
function openOf(r, today) { const d = dayOf(r.deadline); return r.status === "closed" || (d && d < today) ? 2 : d ? 0 : 1; }
const RANK_SQL = today => `CASE WHEN kind IN ('tender_gov','tender_semi','tender_private','rfq','project') THEN 0 WHEN kind = 'project_news' OR tag = 'tender_news' THEN 1 ELSE 2 END, CASE WHEN status = 'closed' OR (deadline IS NOT NULL AND substr(deadline, 1, 10) < ${sqlLit(today)}) THEN 2 WHEN deadline IS NOT NULL THEN 0 ELSE 1 END, COALESCE(published_at, first_seen_at) DESC`;
const when = r => r.published_at || r.first_seen_at || "";
export function rankRows(rows, search, o = {}) {
  const today = cairoDay(o.nowMs || Date.now()), concepts = search ? search.concepts : [], n = concepts.length;
  const boost = Array.isArray(o.boostSector) ? o.boostSector : o.boostSector >= 0 ? [o.boostSector] : [];
  const out = [];
  for (const r of rows) {
    const m = n ? matchItem(itemHay(r), concepts) : { coverage: 0, inTitle: 0, hits: 0, hit: [] };
    if (n && !accepts(concepts, m.hit)) continue;
    /* match strength: a whole list part (or the whole query) with a title hit > the same only in summaries > part of it */
    const full = !n ? 0 : fullMatch(concepts, m.hit) ? (m.inTitle ? 0 : 1) : 2;
    out.push({ r, full, tier: tierOf(r), open: openOf(r, today), cov: m.coverage, hits: m.hits + (boost.includes(r.sector) ? 1 : 0), when: when(r) });
  }
  const byDate = (a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0);
  if (o.sort === "deadline") out.sort((a, b) => (a.r.deadline ? 0 : 1) - (b.r.deadline ? 0 : 1) || String(a.r.deadline || "").localeCompare(String(b.r.deadline || "")) || byDate(a, b));
  else if (o.sort === "date") out.sort(byDate);
  else if (n) out.sort((a, b) => a.full - b.full || a.tier - b.tier || a.open - b.open || b.cov - a.cov || b.hits - a.hits || byDate(a, b) || (b.r.relevance || 0) - (a.r.relevance || 0));
  else out.sort((a, b) => a.tier - b.tier || a.open - b.open || b.hits - a.hits || (b.r.relevance || 0) - (a.r.relevance || 0) || byDate(a, b)); /* no words: the platform relevance score */
  return out.map(x => x.r);
}
/* rows + total for a feed / list page; with a text query the matcher filters and ranks (capped candidate set).
   rankAll (Bassem's tool): rank even without a text query, and return the whole ranked candidate list as `ranked`.
   o.freshSince (ISO): also `fresh` = how many of the rows counted in `total` were first seen since then — the same rows, so a
   «خلال 24 ساعة» count is never more than its list's total */
export async function queryItems(db, p, nowMs = Date.now(), cap = 1000, rankAll = false, o = {}) {
  const q = buildFeedQuery(p, nowMs, o);
  const freshStmt = () => db.prepare(`SELECT COUNT(*) AS n FROM intel_items WHERE ${q.where} AND first_seen_at >= ?`).bind(...q.args, o.freshSince);
  const freshOf = res => (o.freshSince ? { fresh: (res && res.results && res.results[0] || {}).n || 0 } : {});
  if (!q.search && rankAll) {
    const [cand, cnt, fr] = await db.batch([
      db.prepare(`SELECT * FROM intel_items WHERE ${q.where} ORDER BY ${RANK_SQL(cairoDay(nowMs))}, relevance DESC LIMIT ${cap | 0}`).bind(...q.args),
      db.prepare(`SELECT COUNT(*) AS n FROM intel_items WHERE ${q.where}`).bind(...q.args),
      ...(o.freshSince ? [freshStmt()] : []),
    ]);
    const ranked = rankRows(cand.results || [], null, { nowMs, boostSector: o.boostSector });
    return { rows: ranked.slice(0, q.per), total: (cnt.results[0] || {}).n || 0, q, ranked, ...freshOf(fr) };
  }
  if (!q.search) {
    const [rows, cnt, fr] = await db.batch([
      db.prepare(`SELECT * FROM intel_items WHERE ${q.where} ORDER BY ${q.order} LIMIT ? OFFSET ?`).bind(...q.args, q.per, (q.page - 1) * q.per),
      db.prepare(`SELECT COUNT(*) AS n FROM intel_items WHERE ${q.where}`).bind(...q.args),
      ...(o.freshSince ? [freshStmt()] : []),
    ]);
    return { rows: rows.results || [], total: (cnt.results[0] || {}).n || 0, q, ...freshOf(fr) };
  }
  const cand = (await db.prepare(`SELECT * FROM intel_items WHERE ${q.where} ORDER BY ${RANK_SQL(cairoDay(nowMs))} LIMIT ${cap | 0}`).bind(...q.args).all()).results || [];
  const sort = p.sort === "deadline" ? "deadline" : p.sort === "date" ? "date" : "match";
  const ranked = rankRows(cand, q.search, { nowMs, sort, boostSector: o.boostSector });
  const out = { rows: ranked.slice((q.page - 1) * q.per, q.page * q.per), total: ranked.length, q, ranked };
  if (o.freshSince) out.fresh = ranked.filter(r => (r.first_seen_at || "") >= o.freshSince).length;
  return out;
}
export function publicItem(r, lang, src) {
  const en = lang === "en";
  return {
    id: r.id, kind: r.kind, kind_label: KIND_LABEL[r.kind] ? KIND_LABEL[r.kind][en ? 1 : 0] : r.kind, tag: r.tag || null,
    market: r.market, market_name: marketName(r.market, lang), country: r.country || null,
    sector: r.sector != null ? sectorName(r.sector, lang) : null,
    title: (en ? r.title_en : r.title_ar) || r.title_orig, title_orig: r.title_orig, title_ar: r.title_ar || null, title_en: r.title_en || null,
    /* true when `title` is the original in another language than asked (no translation yet) — show it marked, never as one */
    title_is_original: shownTitle(r, en ? "en" : "ar").orig,
    summary: (en ? r.summary_en : r.summary_ar) || null, entity: r.entity || null,
    published_at: r.published_at || null, first_seen_at: r.first_seen_at, deadline: r.deadline || null,
    value: r.value ?? null, currency: r.currency || null, status: r.status, relevance: r.relevance,
    url: r.url, page: SITE + itemPath(r, lang), source: src ? { id: src.id, name: en ? src.name : (src.name_ar || src.name) } : { id: r.source_id },
  };
}
/* the sources (id → name, Arabic name, homepage), kept 10 minutes per database (speed 2026-11-20: one D1 read less on Bassem's tool path;
   the sources change daily at most). The promise is shared by concurrent callers and forgotten when the read fails. */
export const SOURCES_TTL_MS = 600000;
const SOURCES = new WeakMap(); // db → {at, p}
function sourcesMap(db, nowMs = Date.now()) {
  const hit = SOURCES.get(db);
  if (hit && nowMs - hit.at >= 0 && nowMs - hit.at < SOURCES_TTL_MS) return hit.p;
  const p = db.prepare("SELECT id, name, name_ar, homepage FROM intel_sources").all().then(r => new Map(((r && r.results) || []).map(s => [s.id, s])));
  SOURCES.set(db, { at: nowMs, p });
  p.catch(() => { const h = SOURCES.get(db); if (h && h.p === p) SOURCES.delete(db); });
  return p;
}
export async function feed(env, p, nowMs = Date.now()) {
  const db = env.DB;
  const [res, upd] = await Promise.all([queryItems(db, p, nowMs), db.prepare("SELECT MAX(finished_at) AS t FROM intel_runs").first()]);
  const sm = await sourcesMap(db);
  return { items: res.rows.map(r => publicItem(r, p.lang, sm.get(r.source_id))), total: res.total, page: res.q.page, per: res.q.per, updated_at: (upd || {}).t || null };
}
export async function brief(env, p = {}, nowMs = Date.now()) {
  const since = new Date(nowMs - 864e5).toISOString(), db = env.DB;
  const extra = [], args = [since];
  if (p.sector) { const si = sectorIndex(p.sector); if (si >= 0) { extra.push("sector = ?"); args.push(si); } }
  const mf = marketFilter(p.market ? resolveMarket(p.market) || String(p.market).toLowerCase() : ""); if (mf) { extra.push(mf.sql); args.push(...mf.args); }
  const w = "hidden = 0 AND dup_of IS NULL AND first_seen_at >= ?" + (extra.length ? " AND " + extra.join(" AND ") : "");
  const [counts, top, run] = await db.batch([
    db.prepare(`SELECT kind, market, COUNT(*) AS n FROM intel_items WHERE ${w} GROUP BY kind, market ORDER BY n DESC`).bind(...args),
    db.prepare(`SELECT * FROM intel_items WHERE ${w} AND status != 'closed' ORDER BY relevance DESC, first_seen_at DESC LIMIT 10`).bind(...args),
    db.prepare("SELECT started_at, finished_at, sources_ok, sources_failed, items_new FROM intel_runs ORDER BY id DESC LIMIT 1"),
  ]);
  const sm = await sourcesMap(db);
  return { since, counts: counts.results || [], top: (top.results || []).map(r => publicItem(r, p.lang, sm.get(r.source_id))), last_run: (run.results || [])[0] || null };
}

/* ---------- Bassem's tool (Anam SERVER_WEBHOOK) ----------
   search: default window 30 days (max 90); query → synonyms (AR/EN/FR); market aliases as in the feed; tenders/RFQs/projects first,
   pure news only when asked for or when nothing else exists; when the asked market has nothing, ONE wider search over the member's
   plan scope when the caller states the plan (partner: Egypt, Gulf, Arab, Africa), otherwise over all markets, and the text says so
   (it never names a plan it was not given); at most 5 results. A query with no product word is not searched as text: a bare
   number / size («3 4 5 مم») gets a request for the product (or the sector's items when a sector is given).
   brief: last 24 hours (as before), same market/sector resolution, opportunities first. */
const KIND_SPOKEN = { tender_gov: "مناقصة حكومية", tender_semi: "مناقصة شبه حكومية", tender_private: "مناقصة قطاع خاص", rfq: "طلب عرض أسعار", project: "مشروع", project_news: "خبر مشروع", news: "خبر" };
const MAX_RESULTS = 5, RES_WORDS = ["نتيجة واحدة", "نتيجتين", "نتايج", "نتيجة"], PROJECT_NEWS = ["خبر مشروع واحد", "خبرين مشاريع", "أخبار مشاريع", "خبر مشروع"];
/* one entry per notice title + buyer + deadline (same-notice lots share all three: speaking it three times helps nobody; two RFQs
   with one title but different deadlines are two RFQs) */
function dedupe(rows) { const seen = new Set(); return rows.filter(r => { const k = normText(r.title_orig).slice(0, 90) + "|" + normText(r.entity || "") + "|" + (dayOf(r.deadline) || ""); if (seen.has(k)) return false; seen.add(k); return true; }); }
/* the plan the caller states («partner» / «strategic»); "" when none is given: then nothing is limited and no plan is named */
export const planOf = v => { const s = String(v || ""); return /strateg|استراتيج|إستراتيج/i.test(s) ? "strategic" : /partner|شريك|شركاء/i.test(s) ? "partner" : ""; };
const marketWord = c => MARKET_GROUP_NAME[c] || marketName(c, "ar") || c;
const join = list => (list.length < 2 ? list[0] || "" : list.slice(0, -1).join("، ") + " و" + list[list.length - 1]);
function scopeWords(plan) { return plan === "partner" ? "أسواق باقتك (مصر والخليج والدول العربية وأفريقيا)" : "كل الأسواق"; }
function itemSpoken(r, nowMs) {
  let s = (KIND_SPOKEN[r.kind] || "فرصة") + " «" + clip(stripUrls(r.title || r.title_ar || ""), 55) + "»";
  if (r.entity) s += " من " + clip(stripUrls(r.entity), 32);
  if (r.market === "intl") s += " على مستوى دولي"; else if (r.market_name) s += " في " + r.market_name;
  if (r.deadline) s += "، آخر ميعاد " + spokenDay(r.deadline, nowMs);
  return s;
}
/* short Egyptian Arabic for the avatar: at most 2 sentences + up to 3 items, no URLs, Arabic digits, deadlines in words («٢ ديسمبر»).
   NO SOURCE (owner 2026-11-20: «ميكتبش مصدر اي معلومه»; «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه وخلاص»; and
   2026-11-18 «شيل كلمة من المصادر الرسمية»): the Information Center is named, never «المصادر الرسمية», a portal, a site or a link */
export function toolText(action, total, results, p = {}) {
  const nowMs = p.nowMs || Date.now(), days = p.days || (action === "brief" ? 1 : 30), win = daysAr(days);
  const about = p.query ? " عن «" + clip(stripUrls(String(p.query)), 40) + "»" : p.sectorName ? " في قطاع «" + p.sectorName + "»" : "";
  /* an open tender is found whatever its publication date: say so where the window is named for what was found */
  const older = p.olderOpen ? " (منها مناقصات أقدم لسه مفتوحة)" : "";
  /* results that match only part of the query are said to be close to it, not about it */
  const found = p.query && p.partial ? " قريبة من «" + clip(stripUrls(String(p.query)), 40) + "»" : about, near = (p.partial ? " قريبة من طلبك" : "") + older;
  const where = p.where ? " في " + p.where : "";
  const items = results.slice(0, 3).map(r => itemSpoken(r, nowMs)).join("؛ ");
  const tail = " التفاصيل على صفحة كل فرصة في مركز المعلومات.";
  let head;
  if (action === "brief") {
    if (!total) return "مفيش حاجة جديدة" + where + " في مركز المعلومات خلال آخر ٢٤ ساعة. ممكن أدوّرلك على منتجك في آخر ٣٠ يوم.";
    head = "ملخص النهارده: فيه " + arDigits(total) + " فرصة وخبر جديد في مركز المعلومات" + where + " في آخر ٢٤ ساعة" + (items ? "، أهمها: " : ".");
  } else if (!total) {
    return "مالقيتش حاجة" + about + where + (p.widenedTo ? " ولا في " + p.widenedTo : "") + " خلال " + win + " في مركز المعلومات. ممكن نجرب كلمة تانية أو مدة أطول، ومش هقول أرقام مش موجودة.";
  } else if (p.widenedTo && p.inMarket) {
    head = "مالقيتش مناقصات ولا طلبات أسعار" + about + where + " خلال " + win + " (فيه بس " + countAr(p.inMarket, PROJECT_NEWS) + ")، فوسّعت البحث على " + p.widenedTo + " ولقيت " + countAr(total - p.inMarket, OPP_WORDS) + near + "، أهمها: ";
  } else if (p.widenedTo) {
    head = p.newsOnly
      ? "مالقيتش حاجة" + about + where + " خلال " + win + "، ووسّعت البحث على " + p.widenedTo + ": مفيش مناقصات ولا مشاريع، بس فيه " + countAr(total, NEWS_COUNT) + "، أهمها: "
      : "مالقيتش فرص" + about + where + " خلال " + win + "، فوسّعت البحث على " + p.widenedTo + " ولقيت " + countAr(total, p.newsAsked ? RES_WORDS : OPP_WORDS) + near + "، أهمها: ";
  } else if (p.newsOnly) {
    head = "مالقيتش مناقصات ولا طلبات أسعار ولا مشاريع" + about + where + " خلال " + win + "، بس فيه " + countAr(total, NEWS_COUNT) + "، أهمها: ";
  } else {
    head = "لقيت " + countAr(total, p.newsAsked ? RES_WORDS : OPP_WORDS) + found + where + " خلال " + win + older + "، أهمها: ";
  }
  return (head + items + (items ? "." : "") + tail).replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}
/* one result as the tool gives it: `page` / `open_url` = its page on the Information Center (the screen opens it), `url` = the official
   link (never read aloud). open_url is the name the screen tool (bassem_open_item url=…) already knows from janna_lookup. */
function toolItem(r, sm) {
  const pi = publicItem(r, "ar", sm && sm.get(r.source_id));
  return { id: r.id, kind: r.kind, kind_label: pi.kind_label, title: pi.title, title_ar: pi.title, entity: r.entity || null, market: r.market, market_name: pi.market_name, country: r.country || null,
    deadline: dayOf(r.deadline), status: r.status, value: r.value ?? null, currency: r.value != null ? r.currency || null : null, url: r.url, page: pi.page, open_url: pi.page };
}
async function toolSearch(db, o, nowMs) {
  const p = { kind: o.kind, q: o.q, days: o.days, sector: o.sector, per: 50 };
  const r = await queryItems(db, p, nowMs, 600, true, { mf: o.mf, boostSector: o.boostSector, strictWindow: !!o.strictWindow });
  return { rows: r.ranked || [], total: r.total };
}

/* ---------- one result: action "item" (all its details, and the screen opens its page) and "doc" (its own official document) ----------
   Owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي مش لاقي التفاصيل» — the results came from here, but nothing could give ONE of them in
   full (platform_item knows only the platform's own Egyptian data, bassem_open_opportunity only the advisor page's cards). The item is
   named by its id (11 characters, exactly as the search returned it), its page on the Information Center (/intel/…/<slug>-<id>/), or its
   official link; a hidden item is not found; a duplicate answers with the notice it duplicates. "doc": doc.js reads ONLY the item's
   own stored official link (and at most one document it links to on the same official site), never an address from the caller. */
const ACTIONS = { search: "search", brief: "brief", item: "item", details: "item", detail: "item", open: "item", get: "item", doc: "doc", document: "doc", pdf: "doc", read: "doc", requirements: "doc" };
const PAGE_ID = /\/intel\/(?:en\/)?(?:tenders|projects|news|rfq)\/(?:[^\/?#\s]*-)?([0-9a-z]{11})(?:[\/?#]|$)/i;
export function itemRef(body = {}) {
  for (const k of ["id", "item_id", "ref", "page", "open_url", "url", "link", "query"]) {
    const v = String(body[k] == null ? "" : body[k]).trim();
    if (!v) continue;
    if (ID_RE.test(v.toLowerCase())) return { id: v.toLowerCase() };
    const m = PAGE_ID.exec(v);
    if (m) return { id: m[1].toLowerCase() };
    if (/^https?:\/\//i.test(v) && !/^https?:\/\/(?:[^\/]*\.)?madeinegyptgate\.com(?:[\/?#]|$)/i.test(v)) return { url: v.slice(0, 2000) };
  }
  return null;
}
async function findItem(db, ref) {
  let r = null;
  if (ref.id) r = await db.prepare("SELECT * FROM intel_items WHERE id=?").bind(ref.id).first();
  else if (ref.url) r = await db.prepare("SELECT * FROM intel_items WHERE url_norm=? OR url=? ORDER BY hidden, CASE WHEN dup_of IS NULL THEN 0 ELSE 1 END LIMIT 1").bind(canonicalUrl(ref.url), ref.url).first();
  if (r && r.dup_of) { const p = await db.prepare("SELECT * FROM intel_items WHERE id=?").bind(r.dup_of).first(); if (p && !p.hidden) r = p; }
  return r && !(r.hidden && r.hidden !== 2) ? r : null;
}
const CUR_AR = { EGP: "جنيه", USD: "دولار", EUR: "يورو", GBP: "جنيه إسترليني", SAR: "ريال سعودي", AED: "درهم إماراتي", QAR: "ريال قطري", KWD: "دينار كويتي", OMR: "ريال عماني", BHD: "دينار بحريني", JOD: "دينار أردني", MAD: "درهم مغربي", TND: "دينار تونسي", DZD: "دينار جزائري", LYD: "دينار ليبي", IQD: "دينار عراقي",
  ZAR: "راند", KES: "شلن كيني", UGX: "شلن أوغندي", TZS: "شلن تنزاني", GHS: "سيدي غاني", NGN: "نايرا", ETB: "بر إثيوبي", XOF: "فرنك أفريقي", XAF: "فرنك أفريقي", RWF: "فرنك رواندي", PKR: "روبية باكستانية", INR: "روبية هندية", CNY: "يوان صيني", TRY: "ليرة تركية" };
export function moneyAr(v, cur) {
  if (v == null || v === "" || !Number.isFinite(+v) || +v <= 0) return "";
  const c = String(cur || "").toUpperCase();
  return arDigits(Math.round(+v).toLocaleString("en-US")) + (c ? " " + (CUR_AR[c] || c) : "");
}
const STATUS_AR = { open: "سارية", closing_soon: "بتقفل قريب", closed: "منتهية" };
const DOC_WORD = { pdf: "مستند PDF", docx: "ملف Word", html: "صفحة الإعلان", text: "نص الإعلان" };
const officialKind = u => (/\.pdf(?:$|[?#&])|=[^&]*\.pdf(?:$|&)/i.test(String(u || "")) ? "pdf" : /\.docx(?:$|[?#&])|=[^&]*\.docx(?:$|&)/i.test(String(u || "")) ? "docx" : "page");
/* where, for speaking: the country's Arabic name; a group market (Africa, Asia, Europe, international) with the source's country */
function placeOf(r, pi) {
  if (r.market === "intl") return "على مستوى دولي" + (r.country ? " (" + clip(r.country, 30) + ")" : "");
  const group = /^(?:africa|asia|eu|gcc)$/.test(r.market);
  return "في " + pi.market_name + (group && r.country ? " (" + clip(r.country, 30) + ")" : "");
}
/* the item in full (mailPack's card too, which keeps its source for the «ابعتلي» e-mail until the owner decides); the persona gets it
   through sayIntel (no source name) */
function itemFull(r, src) {
  const pi = publicItem(r, "ar", src), srcName = src ? src.name_ar || src.name : "";
  return { id: r.id, kind: r.kind, kind_label: pi.kind_label, title: pi.title, title_orig: r.title_orig, entity: r.entity || null, market: r.market, market_name: pi.market_name, country: r.country || null,
    sector: pi.sector, published: dayOf(r.published_at), deadline: dayOf(r.deadline), status: r.status, value: r.value ?? null, currency: r.value != null ? r.currency || null : null,
    summary: r.summary_ar ? stripContacts(stripUrls(r.summary_ar)) : null, summary_original: r.summary_orig ? clip(stripContacts(stripUrls(r.summary_orig)), 600) : null,
    source: srcName || null, page: pi.page, open_url: pi.page, url: r.url, official_link: officialKind(r.url) };
}
/* the item as the persona gets it: everything but the name of its source (owner 2026-11-20) — `url` (its official link, never read aloud)
   stays: the «ابعتلي» / opportunity e-mails attach it (data/janna-live.js harvest), unchanged until the owner decides about them */
export const sayIntel = it => { if (!it || typeof it !== "object") return it; const { source, ...x } = it; void source; return x; };
/* short Egyptian Arabic for the avatar: what, who, where, the deadline, the value, what is requested — never the source (owner 2026-11-20) */
export function itemText(r, src, nowMs = Date.now()) {
  const it = itemFull(r, src);
  let s = (KIND_SPOKEN[r.kind] || "فرصة") + " «" + clip(stripUrls(it.title || ""), 90) + "»" + (it.entity ? " من " + clip(stripUrls(it.entity), 60) : "") + " " + placeOf(r, it);
  const facts = [];
  if (r.deadline) facts.push("آخر ميعاد " + spokenDay(r.deadline, nowMs) + (STATUS_AR[r.status] ? " (" + STATUS_AR[r.status] + ")" : ""));
  else if (/^tender_|^rfq$/.test(r.kind)) facts.push("ميعاد التقديم مش منشور");
  const money = moneyAr(r.value, r.currency);
  facts.push(money ? "القيمة التقديرية " + money : "القيمة مش منشورة");
  s += "، " + facts.join("، ") + ".";
  if (it.summary) s += " المطلوب: " + clip(it.summary, 260) + ".";
  else if (it.summary_original) s += (/news/.test(r.kind) ? " من نص الخبر: " : " من نص الإعلان: ") + clip(it.summary_original, 240) + ".";
  else s += " مفيش وصف منشور أكتر من العنوان.";
  s += " التفاصيل كاملة على صفحتها في مركز المعلومات.";
  return s.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").replace(/\.\./g, ".").trim();
}
const DOC_FLAG = {
  unreachable: "مقدرتش أفتح المستند الرسمي دلوقتي: موقع الجهة مش بيرد",
  timeout: "موقع الجهة اتأخر في الرد، ومقدرتش أجيب المستند في الوقت",
  login: "المستند الرسمي ورا تسجيل دخول على بوابة الجهة، فمقدرتش أقراه؛ لازم حضرتك تسجّل على البوابة دي علشان تحمّله",
  forbidden: "موقع الجهة رفض إننا نقرا المستند آلياً",
  robots: "موقع الجهة مابيسمحش بالقراءة الآلية، فماقريتش المستند",
  gone: "رابط المستند الرسمي مبقاش موجود على موقع الجهة",
  busy: "موقع الجهة عليه ضغط ومارَدّش دلوقتي",
  too_large: "المستند الرسمي كبير قوي عن اللي أقدر أقراه في المكالمة",
  unsupported: "الرابط الرسمي مش مستند PDF أو Word أو صفحة إعلان أقدر أقراها",
  not_https: "رابط المستند مش آمن (مش https)، فمفتحتوش",
  unsafe_url: "رابط المستند مش لموقع عام آمن، فمفتحتوش",
  too_many_redirects: "رابط المستند بيحوّل على صفحات كتير ورا بعض، فوقفت",
  scanned: "المستند صورة متصوّرة (سكان) ومفيهوش نص أقدر أقراه",
  unreadable: "مقدرتش أطلع نص مفهوم من المستند",
  encrypted: "المستند مقفول بكلمة سر",
  empty: "صفحة الإعلان مافيهاش نص أقدر أقراه",
  no_document: "مفيش مستند رسمي مربوط بالفرصة دي غير صفحة الإعلان نفسها",
};
const joinAr = list => (list.length < 2 ? list[0] || "" : list.slice(0, -1).join("، ") + " و" + list[list.length - 1]);
const TRANSIENT = new Set(["unreachable", "timeout", "busy"]);
async function itemTool(env, body, nowMs, action, o = {}) {
  const db = env.DB, ref = itemRef(body);
  const r = ref ? await findItem(db, ref) : null;
  if (!r) {
    /* no id: the closest results to the words given, so the persona can ask which one (never a guess at one of them) */
    const words = clip(String(body.title || (ref ? "" : body.query) || ""), 100);
    let cand = [];
    if (words) { const s = await toolSearch(db, { q: words, days: 90 }, nowMs); cand = dedupe(s.rows).slice(0, 3); }
    const sm = cand.length ? await sourcesMap(db) : null;
    return { action, found: false, count: 0, results: [], candidates: cand.map(x => toolItem(x, sm)),
      text: cand.length ? "مش متأكد أنهي فرصة تقصد. الأقرب لكلامك: " + cand.map(x => "«" + clip(stripUrls(x.title_ar || x.title_orig || ""), 50) + "»" + (x.entity ? " من " + clip(stripUrls(x.entity), 30) : "")).join("؛ ") + ". قولّي أنهي واحدة."
        : ref ? "الفرصة دي مش موجودة في مركز المعلومات (يمكن اتشالت أو الرقم مش مظبوط). دوّر تاني بالبحث وخد الـ id من النتيجة." : "محتاج الـ id بتاع الفرصة زي ما رجع في نتايج البحث علشان أفتحها." };
  }
  const src = await db.prepare("SELECT id, name, name_ar FROM intel_sources WHERE id=?").bind(r.source_id).first();
  const sm = new Map(src ? [[src.id, src]] : []), it = itemFull(r, src), res = [toolItem(r, sm)];
  if (action === "item") {
    return { action, found: true, id: r.id, count: 1, results: res, item: sayIntel(it), text: itemText(r, src, nowMs),
      note: "Say only what `text` and `item` contain (a missing field is not published: say so). In Bassem's calls its page opens on the shared screen by itself. Its own official document (requirements, documents, bid bond): bassem_intel action=doc with this id. Never read links aloud; never name where it was published (no site, portal or source)." };
  }
  /* action "doc": cached per item and link (12 h; a failure 30 min, a timeout / an unreachable site 5 min) */
  const key = docKey(r);
  let d = null;
  if (env.KV && !o.noCache) { try { d = await env.KV.get(key, "json"); } catch (e) { d = null; } }
  if (!d) {
    d = await readItemDoc(env, r, { fetch: o.fetch, now: nowMs, fetchMs: o.fetchMs, convertMs: o.convertMs });
    if (env.KV) { try { await env.KV.put(key, JSON.stringify(d), { expirationTtl: d.ok ? 43200 : TRANSIENT.has(d.flags[0]) ? 300 : 1800 }); } catch (e) {} }
  }
  const head = { action, found: true, id: r.id, count: 1, results: res, item: { id: it.id, kind_label: it.kind_label, title: it.title, entity: it.entity, market_name: it.market_name, country: it.country, deadline: it.deadline, status: it.status, value: it.value, currency: it.currency, page: it.page, url: it.url } };
  const facts = [it.entity ? "الجهة " + clip(stripUrls(it.entity), 60) : "", r.deadline ? "آخر ميعاد " + spokenDay(r.deadline, nowMs) : ""].filter(Boolean).join("، ");
  if (!d.ok) {
    const f = d.flags.find(x => DOC_FLAG[x]) || "unreadable";
    const why = DOC_FLAG[f] + (d.ai_skip === "cap" && (f === "unreadable" || f === "scanned") ? " (وتحويل المستندات بالذكاء الاصطناعي خلص النهارده)" : "");
    return { ...head, ok: false, flags: d.flags, doc: d.doc ? { type: d.doc.type || null, url: d.doc.url || null } : null,
      text: why + "." + (facts ? " اللي عندي من صفحة الفرصة في مركز المعلومات: " + facts + "." : "") + " المستند نفسه موجود على صفحتها في مركز المعلومات.",
      note: "The document was NOT read: say the reason in `text` honestly, then only the facts in `item`. Never guess its requirements, documents, bid bond or dates." };
  }
  const lang = d.doc && d.doc.lang, found = d.found.map(k => TOPIC_AR[k]), missing = d.missing.map(k => TOPIC_AR[k]);
  const pages = d.doc && d.doc.pages > 0 ? d.doc.pages : 0;
  const what = DOC_WORD[d.doc && d.doc.type] || "المستند";
  const text = "قريت " + what + " الرسمي بتاع «" + clip(stripUrls(it.title || ""), 60) + "»" + (pages ? " (" + countAr(pages, ["صفحة واحدة", "صفحتين", "صفحات", "صفحة"]) + ")" : "") + (d.doc && d.doc.from === "linked" ? "، من صفحة الإعلان الرسمية" : "") + ". " +
    (found.length ? "فيه كلام عن: " + joinAr(found) + "." : "مالقيتش فيه كلام واضح عن الشروط أو المستندات المطلوبة.") +
    (found.length && missing.length ? " ومالقيتش فيه كلام عن: " + joinAr(missing) + "." : "") +
    " اللي تحت (excerpt) من نص المستند نفسه" + (lang === "en" ? " بالإنجليزي" : lang === "fr" ? " بالفرنساوي" : "") + ".";
  return { ...head, ok: true, flags: d.flags, doc: { type: d.doc.type, pages: pages || null, lang: lang || null, via: d.doc.via, from: d.doc.from, url: d.doc.url },
    sections: { found, missing }, key_lines: d.key_lines, excerpt: d.excerpt, text,
    note: "excerpt / key_lines = the document's own text" + (lang && lang !== "ar" ? " (" + lang + "): explain it in Egyptian Arabic, never word by word" : "") + ". Say ONLY what they contain: the 2-3 points he asked about (scope, eligibility, documents, bid bond, deadline, submission, briefing). Anything not in them: «مالقيتهاش في المستند». Never add a requirement, figure or date; never read links, e-mail addresses or phone numbers aloud." };
}
/* the doc cache's key (action "doc" above): per item and stored link */
const docKey = r => "doc:v1:" + r.id + ":" + hash53(String(r.url || "")).toString(36);

/* ---------- «ابعتلي»: one item's mail pack for janna-lookup (POST /api/intel/mailpack, binding-only — handleApi) ----------
   b = {id, file?: true, max_bytes?: 8e6 (1e5..8e6), budget_ms?: 8000 (2000..25000; janna-lookup sends ≤ 20000: a 2.4 MB Kenya PPIP file
   took 12 s to download from outside Kenya)} — an id only: no URL, title or address is ever taken. janna-lookup asks twice: first
   {file:false} for every item of a note (the cards: no third-party fetch), then {file:true} for the files, one after another.
   → {status, body, bytes?}: 200 {ok, id (the primary), requested, card (the item's stored facts in both languages, contacts and links out
   of its summaries), links {page, page_en (short /intel/<seg>/<id>/ links the item pages 301 to their canonical URL), source (the stored
   official link), doc (the file attached or the one that failed)}, file {name, type, size, from, label?} | null, skipped?, reason (why no
   file: with file:false "kind" / "source_opt_out" / "not_requested"), reason_size?} + bytes = the file itself, which handleApi sends as
   the raw body (mailFileResponse: never base64 inside JSON — the memory of one copy, not five) · 400 bad id · 404 unknown · 410 removed /
   hidden. A file only for tenders, RFQs and projects (news: the RSS terms allow headline + snippet + link only), never for a source whose
   mapping says attach:false or that is in NO_FILE_SOURCES; doc.js itemFile reads it (no AI, no text). */
const PACK_KINDS = new Set(["tender_gov", "tender_semi", "tender_private", "rfq", "project"]);
/* sources whose terms allow only a limited extract with attribution (IsDB: isdb.org/terms-conditions, seeds/sources.json terms_note):
   their documents are never forwarded, whatever their D1 mapping says (a mapping changes only by a manual seed run). Owner's decision
   pending (spec open question 6): until then, the link only */
export const NO_FILE_SOURCES = new Set(["isdb-tenders", "isdb-egypt-rss"]);
const clampNum = (v, def, lo, hi) => { const n = +v; return Math.min(hi, Math.max(lo, Number.isFinite(n) && n > 0 ? n : def)); };
async function kvJson(env, key) { if (!env.KV) return null; try { return await env.KV.get(key, "json"); } catch (e) { return null; } }
/* the file answer: the bytes as the body, its facts in one header (ASCII JSON: every non-ASCII character escaped) */
const asciiJson = o => JSON.stringify(o).replace(/[^\x20-\x7e]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
export function mailFileResponse(req, out) {
  const b = out.body, meta = { ok: true, id: b.id, requested: b.requested, file: b.file, doc: b.links.doc, ...(b.skipped ? { skipped: b.skipped } : {}) };
  return new Response(out.bytes, { status: 200, headers: { "Content-Type": b.file.type, "Content-Length": String(out.bytes.length), "Cache-Control": "no-store", "X-Mailpack": asciiJson(meta), ...cors(req) } });
}
export async function mailPack(env, b = {}, o = {}) {
  const id = String(b && b.id != null ? b.id : "").trim().toLowerCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: "bad id" } };
  const db = env.DB;
  const row = await db.prepare("SELECT id FROM intel_items WHERE id=?").bind(id).first();
  if (!row) {
    const g = await db.prepare("SELECT id FROM intel_gone WHERE id=?").bind(id).first();
    return g ? { status: 410, body: { ok: false, found: false, gone: true } } : { status: 404, body: { ok: false, found: false } };
  }
  const r = await findItem(db, { id });   // follows dup_of; an item an admin hid is gone
  if (!r) return { status: 410, body: { ok: false, found: false, gone: true } };
  const src = await db.prepare("SELECT id, name, name_ar, mapping FROM intel_sources WHERE id=?").bind(r.source_id).first();
  const it = itemFull(r, src), seg = KIND_SEG[r.kind] || "news", cur = it.currency ? String(it.currency).toUpperCase() : null;
  const card = {
    kind: r.kind, kind_label: it.kind_label, kind_label_en: KIND_LABEL[r.kind] ? KIND_LABEL[r.kind][1] : r.kind, market: r.market,
    title: it.title, title_en: r.title_en || null, title_orig: r.title_orig, title_is_original: shownTitle(r, "ar").orig,
    entity: it.entity, country: it.country, market_name: it.market_name, market_name_en: marketName(r.market, "en"),
    sector: it.sector, sector_en: r.sector != null ? sectorName(r.sector, "en") || null : null,
    published: it.published, deadline: it.deadline, status: r.status,
    value: it.value, currency: cur, currency_ar: cur ? CUR_AR[cur] || null : null,
    summary: it.summary, summary_en: r.summary_en ? stripContacts(stripUrls(r.summary_en)) || null : null, summary_original: it.summary_original,
    source_name: it.source, source_name_en: src ? src.name || null : null,
  };
  const links = { page: SITE + "/intel/" + seg + "/" + r.id + "/", page_en: SITE + "/intel/en/" + seg + "/" + r.id + "/", source: r.url || null, doc: null };
  const out = { ok: true, id: r.id, requested: id, card, links, file: null, reason: null };
  const mp = mappingOf(src), noFile = !PACK_KINDS.has(r.kind) ? "kind" : mp.attach === false || NO_FILE_SOURCES.has(String(r.source_id || "")) ? "source_opt_out" : "";
  if (b.file === false || noFile) { out.reason = noFile || "not_requested"; return { status: 200, body: out }; }
  const maxBytes = clampNum(b.max_bytes, 8e6, 1e5, 8e6), budget = clampNum(b.budget_ms, 8000, 2000, 25000);
  /* what the doc cache already read (a scanned PDF too), then the ingest hints of this id and of its primary (with their labels) */
  const d = await kvJson(env, docKey(r));
  const known = d && d.doc && (d.doc.type === "pdf" || d.doc.type === "docx") && typeof d.doc.url === "string" ? d.doc.url : "";
  const hints = [];
  for (const k of new Set([id, r.id])) {
    const h = await kvJson(env, "dochint:" + k);
    for (const x of (h && Array.isArray(h.h) ? h.h : [])) if (x && typeof x.u === "string" && !hints.some(y => y.u === x.u)) hints.push({ u: x.u, t: typeof x.t === "string" ? x.t.slice(0, 40) : "" });
  }
  const docHosts = Array.isArray(mp.doc_hosts) ? mp.doc_hosts.filter(h => typeof h === "string").slice(0, 5) : [];
  const f = await itemFile(env, r, { known, hints: hints.slice(0, 2), fileCap: maxBytes, fetchMs: budget - 500, fetch: o.fetch, docHosts });
  if (f.ok) {
    out.file = { name: f.name, type: f.type, size: f.size, from: f.from, ...(f.label ? { label: f.label } : {}) }; links.doc = f.url;
    if (f.skipped) out.skipped = f.skipped;
    return { status: 200, body: out, bytes: f.bytes };
  }
  out.reason = f.flag; if (f.size > 0) out.reason_size = f.size; links.doc = f.fileUrl || null;
  return { status: 200, body: out };
}

export async function tool(env, body = {}, nowMs = Date.now(), o = {}) {
  const db = env.DB, action = ACTIONS[String(body.action || "").toLowerCase().trim()] || "search";
  if (action === "item" || action === "doc") return itemTool(env, body, nowMs, action, o);
  const plan = planOf(body.plan || body.member_plan), scope = plan ? PLAN_SCOPE[plan] : null;
  const query = String(body.query || "").slice(0, 100), parsed = parseQuery(query);
  /* no product word: a code / number is matched literally; stop-words alone add no text; a bare size is not a product */
  const generic = !!query.trim() && !parsed.concepts.length, literal = generic && parsed.codes.length > 0;
  const q = generic && !literal ? "" : query, noProduct = generic && !literal && /[0-9٠-٩۰-۹]/.test(query);
  const mk = resolveMarkets(body.market);
  const markets = mk.codes.length ? mk.codes : parsed.market ? [parsed.market] : [];
  const kind = resolveKind(body.kind), newsAsked = kind === "news" || parsed.news;
  const sec = resolveSector(body.sector);
  const concepts = parsed.concepts.length > 0, spokenQ = clip(stripUrls(query), 40);
  /* the sources' names are needed only where the results are built: started now (usually a memo hit), awaited there (speed 2026-11-20) */
  const smP = sourcesMap(db); smP.catch(() => { /* awaited below, where a failure still answers as before */ });
  /* no product words: the sector (if any) filters, as on the site */
  const sector = concepts ? "" : sec >= 0 ? sec : "";
  const askedWhere = markets.length ? join(markets.map(marketWord)) : scopeWords(plan);
  if (action === "brief") {
    const days = 1, mf = markets.length ? marketsFilter(markets) : null;
    const { rows, total } = await toolSearch(db, { kind, q, days, mf, sector, boostSector: sec, strictWindow: true }, nowMs);
    const opp = rows.filter(r => !isPureNews(r)), list = newsAsked || !opp.length ? rows : opp;
    const sm = await smP, results = list.slice(0, MAX_RESULTS).map(r => toolItem(r, sm));
    return { count: total, results, text: toolText("brief", total, results, { where: markets.length ? askedWhere : "", nowMs }) };
  }
  const days = Math.min(Math.max(parseInt(body.days, 10) || 30, 1), 90);
  if (noProduct && sec < 0) return { count: 0, results: [], text: "مش واضح لي اسم المنتج في «" + spokenQ + "». قولّي المنتج نفسه (مثلاً حديد تسليح أو مواسير بلاستيك) وأنا أدوّرلك عليه في مركز المعلومات.", days, market: markets.length ? markets.join(",") : scope ? "plan" : "all", widened: null, ...(plan ? { plan } : {}) };
  const base = { kind, q, days, sector, boostSector: sec };
  const askedMf = markets.length ? marketsFilter(markets) : scope ? marketsFilter(scope) : null;
  const split = rows => { rows = dedupe(rows); const opp = rows.filter(r => !isPureNews(r)); return { all: rows, opp, top: opp.filter(r => tierOf(r) === 0), news: rows.filter(isPureNews) }; };
  const a = split((await toolSearch(db, { ...base, mf: askedMf }, nowMs)).rows);
  let list = newsAsked ? a.all : a.opp.length ? a.opp : a.news, widened = false, newsOnly = !newsAsked && !a.opp.length && a.news.length > 0, inMarket = 0;
  /* one wider search over the plan scope when the asked market has no tender / RFQ / project (news or project news only) */
  if (markets.length && !(newsAsked ? a.all.length : a.top.length)) {
    const b = split((await toolSearch(db, { ...base, mf: scope ? marketsFilter(scope) : null }, nowMs)).rows);
    const ids = new Set(a.all.map(r => r.id));
    if (newsAsked) { if (b.all.length) { list = b.all; widened = true; } else widened = "none"; }
    else if (b.top.length) { const extra = b.top.filter(r => !ids.has(r.id)); list = extra.concat(a.opp); inMarket = extra.length ? a.opp.length : 0; widened = extra.length > 0; newsOnly = false; }
    else if (!a.opp.length && b.opp.length) { list = b.opp; widened = true; newsOnly = false; }
    else if (!a.all.length && b.news.length) { list = b.news; widened = true; newsOnly = true; }
    else if (!a.all.length) widened = "none";
  }
  /* several markets in one call («gcc,africa»): every asked market is heard in the top 5 (interleaveMarkets) */
  if (markets.length > 1 && !newsAsked && widened !== true) list = interleaveMarkets(list, markets);
  const sm = await smP, top = list.slice(0, MAX_RESULTS), results = top.map(r => toolItem(r, sm));
  const partial = !!q && concepts && top.some(r => !fullMatch(parsed.concepts, matchItem(itemHay(r), parsed.concepts).hit));
  const since = new Date(nowMs - days * 864e5).toISOString(), olderOpen = top.slice(0, 3).some(r => (r.published_at || r.first_seen_at || "") < since);
  const unknown = mk.unknown.length && !mk.codes.length ? mk.unknown[0] : "";
  const text = (unknown ? "السوق «" + clip(String(unknown), 30) + "» مش من الأسواق اللي عندي، فدوّرت في " + scopeWords(plan) + ". " : "") +
    (noProduct ? "مش لاقي اسم منتج في «" + spokenQ + "»، فدوّرت في القطاع. " : "") +
    toolText("search", list.length, results, { query: q || "", partial, sectorName: !q && sec >= 0 ? sectorName(sec, "ar") : "", days, olderOpen, where: unknown ? "" : askedWhere, widenedTo: widened ? scopeWords(plan) : "", newsOnly, newsAsked, inMarket, nowMs });
  return { count: list.length, results, text, days, market: markets.length ? markets.join(",") : scope ? "plan" : "all", widened: widened === true ? (scope ? scope.join(",") : "all") : null, ...(plan ? { plan } : {}) };
}
/* several asked markets: the ranked list interleaved by the ASKED market each item belongs to (an item of «sa» counts for «gcc», of
   «africa:ke» for «africa»), so one market's many results cannot fill the top 5 alone; the order inside each market stays the ranking.
   Not for news, and not for a widened search (that list says first what was found outside the asked markets). */
import { GCC, ARAB_CODES } from "./markets.js";
function askedMarketOf(m, asked) {
  m = String(m || "");
  for (const a of asked) {
    if (a === m) return a;
    if (a === "gcc" && GCC.includes(m)) return a;
    if (a === "arab" && (m === "gcc" || ARAB_CODES.includes(m))) return a;
    if ((a === "africa" || a === "asia") && m.startsWith(a + ":")) return a;
  }
  return m;
}
export function interleaveMarkets(list, asked) {
  const by = new Map();
  for (const r of list) { const k = askedMarketOf(r && r.market, asked); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  if (by.size < 2) return list;
  const groups = [...by.values()], mx = Math.max(...groups.map(g => g.length)), out = [];
  for (let i = 0; i < mx; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out;
}
/* per network and minute in KV. The counter write no longer holds the answer (speed 2026-11-20): with ctx it runs in waitUntil — the count
   can lag a call or two, it is a soft limit; without ctx (tests, other callers) it is awaited as before */
async function rateLimited(env, req, perMin = 30, prefix = "rl:", ctx) {
  if (!env.KV) return false;
  const ip = req.headers.get("CF-Connecting-IP") || "0", key = prefix + ip + ":" + Math.floor(Date.now() / 60000);
  try {
    const n = +(await env.KV.get(key)) || 0; if (n >= perMin) return true;
    const put = env.KV.put(key, String(n + 1), { expirationTtl: 120 });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(Promise.resolve(put).catch(() => {})); else await put;
  } catch (e) {}
  return false;
}

/* ---------- admin ---------- */
export function adminOk(env, req) { return !!env.PLATFORM_KEY && timingSafeEqual(req.headers.get("X-Platform-Key") || "", env.PLATFORM_KEY); }
async function admin(env, req, action, ctx) {
  let b = {}; try { b = await req.json(); } catch (e) {}
  const db = env.DB, now = new Date().toISOString();
  if (action === "hide" || action === "unhide") {
    if (!ID_RE.test(String(b.id || ""))) return { error: "id required" };
    /* unhiding a news item the relevance rule unlisted (hidden=2) tags it "kept": the rule (engine.js newsSweep) never unlists it again */
    const r = action === "hide" ? await db.prepare("UPDATE intel_items SET hidden=1, updated_at=? WHERE id=?").bind(now, b.id).run()
      : await db.prepare("UPDATE intel_items SET tag=CASE WHEN hidden=2 AND tag IS NULL THEN 'kept' ELSE tag END, hidden=0, updated_at=? WHERE id=?").bind(now, b.id).run();
    return { ok: true, changed: r.meta && r.meta.changes };
  }
  if (action === "source-enable" || action === "source-disable") {
    if (!b.source_id) return { error: "source_id required" };
    const r = await db.prepare("UPDATE intel_sources SET enabled=?, fail_count=0, disabled_reason=?, updated_at=? WHERE id=?").bind(action === "source-enable" ? 1 : 0, action === "source-enable" ? null : String(b.reason || "disabled by admin").slice(0, 200), now, b.source_id).run();
    return { ok: true, changed: r.meta && r.meta.changes };
  }
  if (action === "run") {
    const stage = b.stage || "all";
    if (stage === "enrich") return await enrichPending(env, { limit: Math.min(+b.limit || 20, 60), budgetMs: 80000 });
    if (stage === "titles") return await translateTitles(env, { units: Math.min(+b.limit || 20, 60), budgetMs: 80000 });
    if (stage === "news") return await newsSweep(env, Date.now(), { force: true });
    if (stage === "daily") return await dailyJobs(env);
    const groups = Array.isArray(b.groups) ? b.groups : b.group ? [b.group] : ["A", "B", "C"];
    const sourceIds = Array.isArray(b.source_ids) ? b.source_ids.map(String).slice(0, 25) : null;
    // force: run sources even if they are not due yet — on the real clock (a shifted clock would store future run times)
    return await runCycle(env, { trigger: "admin", groups, max: Math.min(+b.limit || 6, 25), sourceIds, force: !!b.force, enrich: stage === "all" && b.enrich !== false, aiLimit: Math.min(+b.ai_limit || 10, 40), budgetMs: 70000 });
  }
  /* re-run the AI enrichment of named items (e.g. one enriched before a guard existed); counts against the daily cap.
     The hidden flag is not changed: unhide separately once the new text is checked. */
  if (action === "reenrich") {
    const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(String).filter(x => ID_RE.test(x)).slice(0, 20);
    if (!ids.length) return { error: "id or ids required" };
    const stats = await enrichPending(env, { ids, limit: ids.length, budgetMs: 60000 });
    const sel = () => db.prepare(`SELECT id, hidden, ai, kind, tag, title_orig, title_ar, title_en, summary_orig, summary_ar, summary_en, entity, deadline, value, published_at FROM intel_items WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    let rows = (await sel()).results || [];
    if (stats.skipped) {
      /* no AI call left today: re-check the stored AI text against the current guards (no model call), keep what passes,
         and queue the item (ai=0) for the next normal enrichment */
      for (const r of rows) {
        const o = sanitise({ title_ar: r.title_ar, title_en: r.title_en, summary_ar: r.summary_ar, summary_en: r.summary_en }, r);
        await db.prepare("UPDATE intel_items SET title_ar=?, title_en=?, summary_ar=?, summary_en=?, ai=0, updated_at=? WHERE id=?").bind(o.title_ar, o.title_en, o.summary_ar, o.summary_en, now, r.id).run();
      }
      stats.revalidated = rows.length;
      rows = (await sel()).results || [];
    }
    return { ...stats, items: rows.map(r => ({ id: r.id, hidden: r.hidden, ai: r.ai, title_orig: r.title_orig, title_ar: r.title_ar, title_en: r.title_en, summary_ar: r.summary_ar, summary_en: r.summary_en })) };
  }
  return { error: "unknown action" };
}

export async function handleApi(req, env, ctx) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const p = Object.fromEntries(url.searchParams);
  try {
    if (path === "/api/intel/feed") return json(req, await feed(env, p), 200, 300);
    if (path.startsWith("/api/intel/item/")) {
      const id = path.split("/").pop();
      if (!ID_RE.test(id)) return json(req, { error: "bad id" }, 400);
      const r = await env.DB.prepare("SELECT * FROM intel_items WHERE id=?").bind(id).first();
      if (!r || (r.hidden && r.hidden !== 2)) return json(req, { error: "gone" }, r ? 410 : 404);
      const s = await env.DB.prepare("SELECT id, name, name_ar FROM intel_sources WHERE id=?").bind(r.source_id).first();
      return json(req, publicItem(r, p.lang, s), 200, 300);
    }
    if (path === "/api/intel/brief") return json(req, await brief(env, p), 200, 300);
    if (path === "/api/intel/sources") {
      const r = (await env.DB.prepare("SELECT id, name, name_ar, kind, market, lang, homepage, enabled, listed, disabled_reason, terms_note, last_ok_at, items_total, fail_count, schedule FROM intel_sources WHERE listed=1 ORDER BY enabled DESC, market, name").all()).results || [];
      return json(req, { sources: r.map(s => ({ id: s.id, name: p.lang === "en" ? s.name : (s.name_ar || s.name), kind: s.kind, market: s.market, market_name: marketName(s.market, p.lang), homepage: s.homepage, last_update: s.last_ok_at, items: s.items_total, schedule: s.schedule, status: !s.enabled ? "disabled" : s.fail_count > 0 ? "failing" : s.last_ok_at ? "ok" : "pending", note: !s.enabled ? (s.disabled_reason || s.terms_note || null) : null })) }, 200, 600);
    }
    if (path === "/api/intel/health") {
      const db = env.DB;
      const [runs, failing, stale, counts] = await db.batch([
        db.prepare("SELECT id, started_at, finished_at, trigger, groups, sources_ok, sources_failed, sources_not_modified, items_new, items_updated, dups, ai_calls FROM intel_runs ORDER BY id DESC LIMIT 10"),
        db.prepare("SELECT id, name, fail_count, last_err, last_run_at, enabled FROM intel_sources WHERE fail_count > 0 OR (enabled=0 AND disabled_reason LIKE 'auto-disabled%') ORDER BY fail_count DESC"),
        db.prepare("SELECT id, name, last_item_at, last_ok_at FROM intel_sources WHERE enabled=1 AND last_ok_at IS NOT NULL AND (last_item_at IS NULL OR last_item_at < ?) AND created_at < ?").bind(new Date(Date.now() - 2 * 864e5).toISOString(), new Date(Date.now() - 2 * 864e5).toISOString()),
        db.prepare("SELECT COUNT(*) AS items, SUM(CASE WHEN ai=1 THEN 1 ELSE 0 END) AS ai_done, SUM(CASE WHEN ai=0 THEN 1 ELSE 0 END) AS ai_pending, SUM(CASE WHEN ai=3 THEN 1 ELSE 0 END) AS ai_titles_only, SUM(CASE WHEN hidden=2 THEN 1 ELSE 0 END) AS news_unlisted FROM intel_items"),
      ]);
      return json(req, { ok: true, runs: runs.results, failing_sources: failing.results, stale_sources_2d: stale.results, totals: counts.results[0], ai: await aiBudget(env) });
    }
    /* «ابعتلي» mail packs: ONLY on the binding-only hostname (janna-lookup's service binding INTEL sends its own Request URL; public
       traffic always arrives on madeinegyptgate.com / www / the workers.dev name and gets the plain 404 of an unknown path) —
       INTEGRATION.md §9. The rate limit runs after that check, so outside requests never write to KV. */
    if (path === "/api/intel/mailpack") {
      if (url.hostname !== PACK_HOST) return json(req, { error: "not found" }, 404);
      if (req.method !== "POST") return json(req, { error: "method" }, 405);
      if (await rateLimited(env, req, +(env.PACK_RATE_PER_MIN || 60), "rlp:")) return json(req, { error: "rate limited" }, 429);
      let b; try { b = await req.json(); } catch (e) { return json(req, { error: "bad json" }, 400); }
      if (!b || typeof b !== "object" || Array.isArray(b)) return json(req, { error: "bad json" }, 400);
      const out = await mailPack(env, b);
      return out.bytes ? mailFileResponse(req, out) : json(req, out.body, out.status);
    }
    if (path === "/api/intel/tool") {
      if (req.method !== "POST" && req.method !== "GET") return json(req, { error: "method" }, 405);
      if (env.TOOL_KEY && !timingSafeEqual(req.headers.get("X-Intel-Key") || "", env.TOOL_KEY)) return json(req, { error: "unauthorized" }, 401);
      /* speed 2026-11-20: Bassem's webhook (bassem_intel, POST) gets 200 ok:false + a text it can act on instead of a 400 / 429 — a refused
         call reached the model as a bare "HTTP error" and it retried blind; GET keeps the status codes. One log line each, never the body. */
      const post = req.method === "POST", soft = (status, code, o) => { if (post) console.warn("tool-soft-error", path, code); return json(req, { ok: false, ...o }, post ? 200 : status); };
      if (await rateLimited(env, req, +(env.TOOL_RATE_PER_MIN || 30), "rl:", ctx)) return soft(429, "rate_limited", { error: "rate limited", flags: ["busy"], text: "لحظة واحدة، طلبات كتير ورا بعض. جرّب تاني بعد دقيقة." });
      let b = p; if (post) { try { b = Object.assign({}, p, await req.json()); } catch (e) { return soft(400, "bad_json", { error: "bad json", flags: ["bad_request"], text: "طلب البحث وصل ناقص. ابعته تاني مرة واحدة بس؛ ولو فشل تاني قول إن البحث مش متاح دلوقتي، ومفيش نتايج تتقال من غير بحث." }); } }
      /* reading a document fetches from the official site: its own, smaller budget (DOC_RATE_PER_MIN, default 10 a minute) */
      if (ACTIONS[String(b.action || "").toLowerCase().trim()] === "doc" && await rateLimited(env, req, +(env.DOC_RATE_PER_MIN || 10), "rld:", ctx))
        return soft(429, "doc_rate_limited", { error: "rate limited", action: "doc", flags: ["busy"], text: "لحظة واحدة، طلبات قراءة مستندات كتير ورا بعض. جرّب تاني بعد دقيقة." });
      return json(req, await tool(env, b));
    }
    const m = /^\/api\/intel\/admin\/(hide|unhide|source-enable|source-disable|run|reenrich)$/.exec(path);
    if (m) {
      if (req.method !== "POST") return json(req, { error: "method" }, 405);
      if (!adminOk(env, req)) return json(req, { error: "unauthorized" }, 401);
      return json(req, await admin(env, req, m[1], ctx));
    }
    return json(req, { error: "not found" }, 404);
  } catch (e) {
    console.error("intel api", e && e.stack || e);
    return json(req, { error: "internal error" }, 500);
  }
}
export { SECTORS, cairoDay, addDays, fmtCairo, normText };
