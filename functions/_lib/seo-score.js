/* SEO page score 0–100 (docs/janna/SEO-SPEC.md §3.3) — used by the /api/seo/pages list and CSV export.
   The same logic can be copied into data/seo-score.js for the browser. Checks that do not apply to a page (keyword checks
   without a target keyword, keyword/length checks on an intentional noindex page) are left out and the score is scaled
   over the checks that apply, so it always stays 0–100.
   | Title 30–60 chars 15 (61–65 → 8) | Description 70–160 15 | Exactly one H1 10 | Canonical self or intentional override 10 |
   | Robots consistent with the sitemap 10 | JSON-LD present / valid 10 | All images have alt 5 | Words ≥ threshold 10 |
   | Target keyword in title 5 | in H1 5 | Reciprocal hreflang 5 |
   Word thresholds: the spec defaults (detail 80, hub 150) are overridden by what the BUILD used (/_seo/config.json:
   min_company_words, min_facx_words, min_product_words, news_index_min_words …) and then by the admin's cfg.thresholds,
   so the workspace never calls «thin» a page the build indexed on purpose. Pages the build itself set to noindex for
   thin content (why = thin_* / public_desc_*) always carry the «thin» issue. */
import { normPath } from "./seo-edge.js";

export const DEFAULT_THRESHOLDS = Object.freeze({
  min_hub_members: 5, min_tender_cat: 3, min_company_words: 80, min_company_words_with_products: 40,
  news_index_min_words: 150, tender_expired_index_days: 90, listing_page_size: 50, slug_mode: "legacy",
});
export const ISSUES = ["title_len", "desc_len", "no_h1", "multi_h1", "no_schema", "noindex", "img_alt", "thin", "overridden"];

/* Arabic-aware matching: alef forms, ya / alef maqsura, ta marbuta, hamza carriers, diacritics and tatweel removed */
export function normAr(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim();
}
const SURR = /[\uD800-\uDBFF]/g;
/* length in characters (code points), fast path for text without surrogate pairs */
export const clen = s => { s = String(s == null ? "" : s); const m = s.match(SURR); return m ? s.length - m.length : s.length; };
export const isNoindex = r => /noindex/i.test(String(r || ""));
/* hub-like pages (lists) need more words (150) than detail pages (80). Types as seo_build.part.py writes them:
   hub-*, gov (a governorate hub), tender-cat, tender-entity, sitemap-html; older generic names are still understood. */
export const isHubType = t => /^hub|^gov$|^tender-(cat|entity)$|^sitemap|list|categor|directory|^(tenders|news-hub|events|awards|projects|rfqs|products|offers)$/i.test(String(t || ""));
const thn = (v, d) => (Number.isFinite(+v) && v !== "" && v != null ? +v : d);
export function minWordsFor(type, th = DEFAULT_THRESHOLDS) {
  const t = String(type || "");
  if (isHubType(t)) return thn(th.hub_min_words, 150);
  if (t === "company") return thn(th.min_company_words, 80);
  if (t === "company-public" || t === "company-verified") return thn(th.min_facx_words, thn(th.min_company_words, 80));
  if (t === "product") return thn(th.min_product_words, 80);
  if (t === "news") return thn(th.news_index_min_words, 150);
  return thn(th.detail_min_words, 80);
}
export const builtThin = why => /^(thin|public_desc_)/i.test(String(why || ""));

/* the values a crawler sees after the edge override */
export function effective(row, ov) {
  const o = ov || {};
  return {
    title: o.title || row.title || "", description: o.description || row.description || "", h1: o.h1 || row.h1 || "",
    canonical: o.canonical || row.canonical || "", robots: o.robots || row.robots || "index,follow",
  };
}

/* row = normalized manifest row (see seo-api.js normRow); ctx = {ov, target_kw, twin, site, thresholds} */
export function scorePage(row, ctx = {}) {
  const ov = ctx.ov || null, eff = effective(row, ov), site = String(ctx.site || "https://madeinegyptgate.com");
  const noindex = isNoindex(eff.robots), checks = [];
  let got = 0, max = 0;
  const add = (id, pts, ok, partial = 0, applies = true) => { if (!applies) return; const g = ok ? pts : partial; max += pts; got += g; checks.push({ id, pts, got: g }); };
  const tl = clen(eff.title), dl = clen(eff.description);
  add("title_len", 15, tl >= 30 && tl <= 60, tl >= 61 && tl <= 65 ? 8 : 0);
  add("desc_len", 15, dl >= 70 && dl <= 160);
  const h1n = ov && ov.h1 ? Math.max(1, row.h1_count || 0) : (row.h1_count || 0);
  add("one_h1", 10, h1n === 1);
  const cs = String(eff.canonical || ""), base = site.replace(/\/+$/, "");
  const selfCanon = cs.startsWith(base + "/") && !/[?#]/.test(cs) && normPath(cs.slice(base.length)) === row.path;
  add("canonical", 10, selfCanon || !!(ov && ov.canonical));
  add("robots_sitemap", 10, !(ov && ov.robots) || isNoindex(ov.robots) === isNoindex(row.robots));
  add("schema", 10, (Array.isArray(row.schema) && row.schema.length > 0) || !!(ov && ov.jsonld));
  add("img_alt", 5, !(row.images_no_alt > 0));
  const th = { ...DEFAULT_THRESHOLDS, ...(ctx.thresholds || {}) };
  const minWords = minWordsFor(row.type, th);
  add("words", 10, (row.words || 0) >= minWords, 0, !noindex);
  const kw = normAr(ctx.target_kw || "");
  add("kw_title", 5, !!kw && normAr(eff.title).includes(kw), 0, !!kw && !noindex);
  add("kw_h1", 5, !!kw && normAr(eff.h1).includes(kw), 0, !!kw && !noindex);
  add("hreflang", 5, !row.alt || !!(ctx.twin && normPath(ctx.twin.alt || "") === row.path));
  const issues = [];
  if (tl < 30 || tl > 65) issues.push("title_len");
  if (dl < 70 || dl > 160) issues.push("desc_len");
  if (h1n === 0) issues.push("no_h1");
  if (h1n > 1) issues.push("multi_h1");
  if (!((Array.isArray(row.schema) && row.schema.length) || (ov && ov.jsonld))) issues.push("no_schema");
  if (noindex) issues.push("noindex");
  if (row.images_no_alt > 0) issues.push("img_alt");
  if ((row.words || 0) < minWords || builtThin(row.why)) issues.push("thin");
  if (ov) issues.push("overridden");
  return { score: max ? Math.round((got / max) * 100) : 0, issues, checks, eff, noindex, intentional_noindex: noindex && !(ov && ov.robots), kw_title: checks.some(c => c.id === "kw_title" && c.got > 0), kw_h1: checks.some(c => c.id === "kw_h1" && c.got > 0) };
}
