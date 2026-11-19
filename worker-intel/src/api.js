/* migate-intel — public JSON API (/api/intel/*), Bassem's Anam SERVER_WEBHOOK (/api/intel/tool) and admin endpoints. */
import { KIND_GROUPS, KINDS, KIND_LABEL, SITE, timingSafeEqual, cairoDay, addDays, fmtDay, fmtCairo, ID_RE, normText, sqlLit, clip, stripUrls, dayOf } from "./util.js";
import { sectorIndex, sectorName, SECTORS } from "./sectors.js";
import { marketFilter, marketsFilter, marketName, PLAN_SCOPE } from "./markets.js";
import { itemPath, shownTitle } from "./pages.js";
import { runCycle, dailyJobs, newsSweep } from "./engine.js";
import { enrichPending, translateTitles, aiBudget, sanitise } from "./enrich.js";
import { parseQuery, resolveMarket, resolveMarkets, resolveSector, resolveKind, matchItem, itemHay, accepts, fullMatch, textPatterns, literalLike, HAY_SQL, spokenDay, countAr, OPP_WORDS, NEWS_COUNT, daysAr, arDigits, MARKET_GROUP_NAME } from "./terms.js";

const ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
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
async function sourcesMap(db) { const r = (await db.prepare("SELECT id, name, name_ar, homepage FROM intel_sources").all()).results || []; return new Map(r.map(s => [s.id, s])); }
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
/* short Egyptian Arabic for the avatar: at most 2 sentences + up to 3 items, no URLs, Arabic digits, deadlines in words («٢ ديسمبر») */
export function toolText(action, total, results, p = {}) {
  const nowMs = p.nowMs || Date.now(), days = p.days || (action === "brief" ? 1 : 30), win = daysAr(days);
  const about = p.query ? " عن «" + clip(stripUrls(String(p.query)), 40) + "»" : p.sectorName ? " في قطاع «" + p.sectorName + "»" : "";
  /* an open tender is found whatever its publication date: say so where the window is named for what was found */
  const older = p.olderOpen ? " (منها مناقصات أقدم لسه مفتوحة)" : "";
  /* results that match only part of the query are said to be close to it, not about it */
  const found = p.query && p.partial ? " قريبة من «" + clip(stripUrls(String(p.query)), 40) + "»" : about, near = (p.partial ? " قريبة من طلبك" : "") + older;
  const where = p.where ? " في " + p.where : "";
  const items = results.slice(0, 3).map(r => itemSpoken(r, nowMs)).join("؛ ");
  const tail = " التفاصيل والرابط الرسمي على صفحة مركز المعلومات.";
  let head;
  if (action === "brief") {
    if (!total) return "مفيش حاجة جديدة" + where + " في المصادر الرسمية خلال آخر ٢٤ ساعة. ممكن أدوّرلك على منتجك في آخر ٣٠ يوم.";
    head = "ملخص النهارده: فيه " + arDigits(total) + " فرصة وخبر جديد من المصادر الرسمية" + where + " في آخر ٢٤ ساعة" + (items ? "، أهمها: " : ".");
  } else if (!total) {
    return "مالقيتش حاجة" + about + where + (p.widenedTo ? " ولا في " + p.widenedTo : "") + " خلال " + win + " في المصادر الرسمية. ممكن نجرب كلمة تانية أو مدة أطول، ومش هقول أرقام مش موجودة.";
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
function toolItem(r, sm) {
  const pi = publicItem(r, "ar", sm && sm.get(r.source_id));
  return { id: r.id, kind: r.kind, kind_label: pi.kind_label, title: pi.title, title_ar: pi.title, entity: r.entity || null, market: r.market, market_name: pi.market_name, deadline: dayOf(r.deadline), status: r.status, url: r.url, page: pi.page };
}
async function toolSearch(db, o, nowMs) {
  const p = { kind: o.kind, q: o.q, days: o.days, sector: o.sector, per: 50 };
  const r = await queryItems(db, p, nowMs, 600, true, { mf: o.mf, boostSector: o.boostSector, strictWindow: !!o.strictWindow });
  return { rows: r.ranked || [], total: r.total };
}
export async function tool(env, body = {}, nowMs = Date.now()) {
  const db = env.DB, action = String(body.action || "").toLowerCase() === "brief" ? "brief" : "search";
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
  const sm = await sourcesMap(db);
  /* no product words: the sector (if any) filters, as on the site */
  const sector = concepts ? "" : sec >= 0 ? sec : "";
  const askedWhere = markets.length ? join(markets.map(marketWord)) : scopeWords(plan);
  if (action === "brief") {
    const days = 1, mf = markets.length ? marketsFilter(markets) : null;
    const { rows, total } = await toolSearch(db, { kind, q, days, mf, sector, boostSector: sec, strictWindow: true }, nowMs);
    const opp = rows.filter(r => !isPureNews(r)), list = newsAsked || !opp.length ? rows : opp;
    const results = list.slice(0, MAX_RESULTS).map(r => toolItem(r, sm));
    return { count: total, results, text: toolText("brief", total, results, { where: markets.length ? askedWhere : "", nowMs }) };
  }
  const days = Math.min(Math.max(parseInt(body.days, 10) || 30, 1), 90);
  if (noProduct && sec < 0) return { count: 0, results: [], text: "مش واضح لي اسم المنتج في «" + spokenQ + "». قولّي المنتج نفسه (مثلاً حديد تسليح أو مواسير بلاستيك) وأنا أدوّرلك عليه في المصادر الرسمية.", days, market: markets.length ? markets.join(",") : scope ? "plan" : "all", widened: null, ...(plan ? { plan } : {}) };
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
  const top = list.slice(0, MAX_RESULTS), results = top.map(r => toolItem(r, sm));
  const partial = !!q && concepts && top.some(r => !fullMatch(parsed.concepts, matchItem(itemHay(r), parsed.concepts).hit));
  const since = new Date(nowMs - days * 864e5).toISOString(), olderOpen = top.slice(0, 3).some(r => (r.published_at || r.first_seen_at || "") < since);
  const unknown = mk.unknown.length && !mk.codes.length ? mk.unknown[0] : "";
  const text = (unknown ? "السوق «" + clip(String(unknown), 30) + "» مش من الأسواق اللي عندي، فدوّرت في " + scopeWords(plan) + ". " : "") +
    (noProduct ? "مش لاقي اسم منتج في «" + spokenQ + "»، فدوّرت في القطاع. " : "") +
    toolText("search", list.length, results, { query: q || "", partial, sectorName: !q && sec >= 0 ? sectorName(sec, "ar") : "", days, olderOpen, where: unknown ? "" : askedWhere, widenedTo: widened ? scopeWords(plan) : "", newsOnly, newsAsked, inMarket, nowMs });
  return { count: list.length, results, text, days, market: markets.length ? markets.join(",") : scope ? "plan" : "all", widened: widened === true ? (scope ? scope.join(",") : "all") : null, ...(plan ? { plan } : {}) };
}
async function rateLimited(env, req, perMin = 30) {
  if (!env.KV) return false;
  const ip = req.headers.get("CF-Connecting-IP") || "0", key = "rl:" + ip + ":" + Math.floor(Date.now() / 60000);
  try { const n = +(await env.KV.get(key)) || 0; if (n >= perMin) return true; await env.KV.put(key, String(n + 1), { expirationTtl: 120 }); } catch (e) {}
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
    if (path === "/api/intel/tool") {
      if (req.method !== "POST" && req.method !== "GET") return json(req, { error: "method" }, 405);
      if (env.TOOL_KEY && !timingSafeEqual(req.headers.get("X-Intel-Key") || "", env.TOOL_KEY)) return json(req, { error: "unauthorized" }, 401);
      if (await rateLimited(env, req, +(env.TOOL_RATE_PER_MIN || 30))) return json(req, { error: "rate limited", text: "لحظة واحدة، طلبات كتير ورا بعض. جرّب تاني بعد دقيقة." }, 429);
      let b = p; if (req.method === "POST") { try { b = Object.assign({}, p, await req.json()); } catch (e) { return json(req, { error: "bad json" }, 400); } }
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
