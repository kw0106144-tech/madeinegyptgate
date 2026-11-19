/* migate-intel — SEO pages rendered by the Worker inside the site's own shell (src/siteshell.js: cut from the site's current
   /tenders/ page, cached 1 hour; the baked src/shell.js when the site cannot be read):
   /intel/ hub, /intel/{tenders,projects,news,rfq,sources}/, item pages /intel/<seg>/<slug>-<id>/, English under /intel/en/…,
   /intel/sitemap.xml (+ chunks ≤ 5,000 URLs). 410 for hidden/removed items; noindex for items closed > 30 days. */
import { SHELL } from "./shell.js";
import { siteShell } from "./siteshell.js";
import { SITE, KIND_SEG, KIND_LABEL, esc, jsonLd, fmtDay, fmtCairo, cairoDay, addDays, ID_RE, slugify } from "./util.js";
import { sectorName, SECTORS } from "./sectors.js";
import { marketName, flag } from "./markets.js";
import { queryItems } from "./api.js";

const T = {
  hub: ["مركز المعلومات: مناقصات ومشاريع وفرص وأخبار — تحديث يومي تلقائي", "Intelligence centre: tenders, projects, opportunities & news — updated daily"],
  hubIntro: ["كل يوم تسحب المنصة تلقائياً المناقصات الحكومية وشبه الحكومية والخاصة وطلبات عروض الأسعار والمشاريع وأخبار المشاريع والأخبار الاقتصادية من المصادر الرسمية في مصر والدول العربية وأفريقيا والعالم، وتلخّصها بالعربي مع رابط المصدر الرسمي لكل خبر.", "Every day the platform automatically collects government, semi-government and private tenders, RFQs, projects and business news from official sources in Egypt, the Arab world, Africa and beyond, summarised with a link to the official source of every item."],
  tenders: ["المناقصات من المصادر الرسمية", "Tenders from official sources"], projects: ["المشاريع وأخبار المشاريع", "Projects & project news"],
  news: ["الأخبار الاقتصادية والصناعية", "Business & industry news"], rfq: ["طلبات عروض الأسعار", "Requests for quotation"],
  sources: ["مصادر مركز المعلومات", "Intelligence centre sources"], home: ["الرئيسية", "Home"], intel: ["مركز المعلومات", "Intelligence centre"],
  updated: ["آخر تحديث", "Last update"], official: ["المصدر الرسمي", "Official source"], auto: ["تحديث تلقائي يومي", "automatic daily update"],
  srcLbl: ["مصدر رسمي", "Official source"], help: ["اطلب مساعدة المنصة في التقديم", "Ask the platform to help you bid"],
  deadline: ["آخر موعد", "Deadline"], published: ["تاريخ النشر", "Published"], entity: ["الجهة", "Entity"], market: ["السوق", "Market"],
  sector: ["القطاع", "Sector"], value: ["القيمة التقديرية", "Estimated value"], kind: ["النوع", "Type"], none: ["لا توجد عناصر مطابقة حالياً.", "No matching items right now."],
  more: ["عرض الكل", "View all"], tenderNews: ["خبر عن طرح/مناقصة", "News about a tender"], origTitle: ["العنوان الأصلي", "Original title"],
  aiNote: ["العنوان والملخص صياغة وترجمة آلية غير رسمية من نص المصدر، وليست ترجمة رسمية من الجهة المصدرة؛ المرجع هو المصدر الرسمي.", "Title and summary are an unofficial machine translation of the source's text, not an official translation by the issuing body; the official source prevails."],
  excerpt: ["مقتطف من المصدر", "Source excerpt"], gaps: ["مصادر رسمية بدون بوابة بيانات مفتوحة (روابط فقط)", "Official sources without an open data feed (links only)"],
  origLang: ["بلغة المصدر – ما اتترجمش لسه", "Source language – not translated yet"],
  origLangTip: ["العنوان زي ما نشره المصدر الرسمي، والترجمة الآلية بتتعمل تلقائياً", "The title as the official source published it; the machine translation is made automatically"],
};
const t = (k, lang) => T[k][lang === "en" ? 1 : 0];
const ST = { open: ["سارية", "Open", "sx-st-open"], closing_soon: ["تنتهي قريباً", "Closing soon", "sx-st-soon"], closed: ["منتهية", "Closed", "sx-st-closed"] };
function statusBadge(it, lang) {
  const en = lang === "en";
  if (ST[it.status]) return `<span class="sx-st ${ST[it.status][2]}"${it.deadline ? ` data-deadline="${esc(it.deadline)}"` : ""}>${ST[it.status][en ? 1 : 0]}</span>`;
  if (/^tender_|^rfq$/.test(it.kind)) return `<span class="sx-st sx-st-undated">${en ? "No deadline given" : "غير محدد الموعد"}</span>`;
  return "";
}
export const base = lang => (lang === "en" ? "/intel/en/" : "/intel/");
export function itemPath(it, lang) { return base(lang) + (KIND_SEG[it.kind] || "news") + "/" + (it.slug || slugify(it.title_orig)) + "-" + it.id + "/"; }
const AR_LETTERS = /[\u0600-\u06ff]/;
/* the title a page shows: the page-language translation when there is one; otherwise the original — marked as such when it is
   not in the page language (an English or French notice on an Arabic page, an Arabic one on an English page), never a made-up
   translation. → {text, orig: marked?, lang: the original's language} */
export function shownTitle(it, lang) {
  const en = lang === "en", tr = en ? it.title_en : it.title_ar;
  if (tr) return { text: tr, orig: false, lang: en ? "en" : "ar" };
  const t = String(it.title_orig || ""), isAr = AR_LETTERS.test(t);
  const olang = isAr ? "ar" : /^[a-z]{2}$/.test(it.lang || "") && it.lang !== "ar" ? it.lang : "en";
  return { text: t, orig: en ? olang !== "en" : !isAr, lang: olang };
}
const origMark = lang => ` <span class="sx-st sx-st-undated sx-orig" title="${esc(t("origLangTip", lang))}">${t("origLang", lang)}</span>`;

export function renderPage(lang, o, host) {
  const S = o.shell || SHELL[lang === "en" ? "en" : "ar"], en = lang === "en";
  const alt = o.alt || {};
  const head = `<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description || "")}">
<meta name="robots" content="${o.noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}">
<link rel="canonical" href="${SITE}${esc(o.path)}">
${alt.ar ? `<link rel="alternate" hreflang="ar-EG" href="${SITE}${esc(alt.ar)}">` : ""}
${alt.en ? `<link rel="alternate" hreflang="en" href="${SITE}${esc(alt.en)}">` : ""}
${alt.ar ? `<link rel="alternate" hreflang="x-default" href="${SITE}${esc(alt.ar)}">` : ""}
<meta property="og:type" content="${o.ogType || "website"}"><meta property="og:site_name" content="${en ? "Made in Egypt Gate" : "منصة صنع في مصر"}">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description || "")}"><meta property="og:url" content="${SITE}${esc(o.path)}">
<meta property="og:image" content="${SITE}/img/og-cover.jpg"><meta name="twitter:card" content="summary_large_image">
${(o.jsonld || []).map(j => `<script type="application/ld+json">${jsonLd(j)}</script>`).join("\n")}
<link rel="stylesheet" href="/intel/intel.css">`;
  const altUrl = en ? (alt.ar || "/intel/") : (alt.en || "/intel/en/");
  let html = `<!doctype html>\n<html lang="${en ? "en" : "ar"}" dir="${en ? "ltr" : "rtl"}">\n<head>\n${S.head.replace(/<meta charset="utf-8">\n?/, '<meta charset="utf-8">\n' + head + "\n")}\n</head>\n<body>\n${S.header.replace("{{ALT_URL}}", esc(altUrl))}\n<main id="main">${o.main}</main>\n${S.footer}\n</body>\n</html>`;
  if (host && !/(^|\.)madeinegyptgate\.com$/.test(host)) html = html.replace(/(href|src)="\/(assets|img)\//g, `$1="${SITE}/$2/`);
  return html;
}
function crumbs(lang, list) {
  const items = [[t("home", lang), lang === "en" ? "/en/" : "/"], [t("intel", lang), base(lang)], ...list];
  const html = `<nav class="sx-crumbs" aria-label="${lang === "en" ? "Breadcrumb" : "مسار التنقل"}"><ol>${items.map(([n, u], i) => i === items.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${esc(u)}">${esc(n)}</a></li>`).join("")}</ol></nav>`;
  const ld = { "@type": "BreadcrumbList", itemListElement: items.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: SITE + u })) };
  return { html, ld };
}
function li(it, lang, src) {
  const en = lang === "en";
  const meta = [it.entity, flag(it.market) + " " + marketName(it.market, lang), it.deadline ? t("deadline", lang) + " " + fmtDay(it.deadline, lang) : "", src ? (en ? src.name : src.name_ar || src.name) : ""].filter(Boolean).map(esc).join(" · ");
  const st = shownTitle(it, lang);
  return `<li><a href="${esc(itemPath(it, lang))}">${st.orig ? `<span lang="${esc(st.lang)}" dir="auto">${esc(st.text)}</span>` : esc(st.text)}</a>${st.orig ? origMark(lang) : ""} ${statusBadge(it, lang)}${it.tag === "tender_news" ? ` <span class="sx-st sx-st-undated">${t("tenderNews", lang)}</span>` : ""}<span class="m">${meta}</span></li>`;
}
async function lastRun(env) { const r = await env.DB.prepare("SELECT MAX(finished_at) AS t FROM intel_runs").first(); return r && r.t; }
async function srcMap(env) { const r = (await env.DB.prepare("SELECT id, name, name_ar, homepage FROM intel_sources").all()).results || []; return new Map(r.map(s => [s.id, s])); }
function updatedLine(lang, iso) { return iso ? `<p class="note intel-upd">${t("updated", lang)}: <time datetime="${esc(iso)}">${esc(fmtCairo(iso, lang))}</time> — ${t("auto", lang)}</p>` : ""; }

/* same query + matcher as /api/intel/feed and Bassem's tool (api.js queryItems), so a ?q= search agrees everywhere */
async function listItems(env, p, nowMs) {
  const { rows, total, q } = await queryItems(env.DB, p, nowMs);
  return { rows, total, q };
}

/* the hub's sections; «N خلال 24 ساعة» counts the rows of the same query (hidden, dup_of, kind, market, date window: api.js
   queryItems freshSince) first seen in the last 24 hours — part of the section's total, never more (bug sweep 2026-11-19 group 7:
   a count over every row first seen in 24 h included backfilled rows outside the section's window: 847 vs 839) */
export const HUB_SECTIONS = { tenders: { days: 30, sort: "relevance" }, rfq: { days: 30, sort: "relevance" }, projects: { days: 30, sort: "relevance" }, news: { days: 7, sort: "" } };
export async function hubPage(env, lang, host, nowMs = Date.now(), shell) {
  const sm = await srcMap(env), upd = await lastRun(env);
  const since = new Date(nowMs - 864e5).toISOString();
  const fresh = {};
  const sections = [];
  for (const k of ["tenders", "rfq", "projects", "news"]) {
    const { rows, total, fresh: n24 } = await queryItems(env.DB, { kind: k, days: HUB_SECTIONS[k].days, per: 8, sort: HUB_SECTIONS[k].sort }, nowMs, 1000, false, { freshSince: since });
    fresh[k] = rows.length ? n24 || 0 : 0;
    if (!rows.length) continue; // honesty: an empty source shows nothing, never placeholders
    sections.push(`<section class="card2"><h2>${t(k, lang)} <small class="note">(${total})</small></h2><ul class="tlist">${rows.map(r => li(r, lang, sm.get(r.source_id))).join("")}</ul><p><a class="btn btn-line btn-sm" href="${base(lang)}${k}/">${t("more", lang)}</a></p></section>`);
  }
  const c = crumbs(lang, []);
  const chips = ["tenders", "rfq", "projects", "news"].map(k => [k, fresh[k]]).filter(([, n]) => n > 0).map(([k, n]) => `<span>${t(k, lang)}: ${n} ${lang === "en" ? "in 24 h" : "خلال 24 ساعة"}</span>`).join("");
  const path = base(lang);
  const main = `<div class="sx-hero"><div class="wrap">${crumbs(lang, [[t("intel", lang), path]]).html.replace(/<li><a href="\/intel\/(en\/)?">[^<]*<\/a><\/li>/, "")}<h1>${t("hub", lang)}</h1><p class="intro">${t("hubIntro", lang)}</p>${chips ? `<div class="sx-chips">${chips}</div>` : ""}</div></div>
<div class="wrap sx-main">${updatedLine(lang, upd)}${sections.join("\n") || `<p class="note">${t("none", lang)}</p>`}<p class="note"><a href="${base(lang)}sources/">${t("sources", lang)}</a></p></div>`;
  return renderPage(lang, { shell, title: t("hub", lang) + (lang === "en" ? " | Made in Egypt Gate" : " | صنع في مصر"), description: t("hubIntro", lang).slice(0, 160), path, alt: { ar: "/intel/", en: "/intel/en/" }, jsonld: [{ "@context": "https://schema.org", "@type": "CollectionPage", url: SITE + path, name: t("hub", lang), inLanguage: lang === "en" ? "en" : "ar-EG", dateModified: upd || undefined }, { "@context": "https://schema.org", ...c.ld }], main }, host);
}

export async function listPage(env, lang, kindSeg, params, host, nowMs = Date.now(), shell) {
  const sm = await srcMap(env), upd = await lastRun(env);
  const p = { kind: kindSeg, market: params.market || "", sector: params.sector || "", status: params.status || "", page: params.page || 1, per: 30, days: 120, q: params.q || "" };
  const { rows, total, q } = await listItems(env, p, nowMs);
  const path = base(lang) + kindSeg + "/";
  const pages = Math.ceil(total / q.per);
  const qs = n => { const u = new URLSearchParams(); for (const k of ["market", "sector", "status", "q"]) if (params[k]) u.set(k, params[k]); if (n > 1) u.set("page", n); const s = u.toString(); return path + (s ? "?" + s : ""); };
  const pager = pages > 1 ? `<nav class="pager">${Array.from({ length: Math.min(pages, 20) }, (_, i) => i + 1).map(n => n === q.page ? `<span aria-current="page">${n}</span>` : `<a href="${esc(qs(n))}">${n}</a>`).join("")}</nav>` : "";
  const c = crumbs(lang, [[t(kindSeg, lang), path]]);
  const filtered = !!(params.market || params.sector || params.status || params.q);
  const main = `<div class="sx-hero"><div class="wrap">${c.html}<h1>${t(kindSeg, lang)}</h1><p class="intro">${lang === "en" ? `${total} items in the last 120 days from official sources, updated automatically.` : `${total} عنصراً خلال آخر 120 يوماً من المصادر الرسمية، تتحدّث تلقائياً.`}</p></div></div>
<div class="wrap sx-main">${updatedLine(lang, upd)}${rows.length ? `<section class="card2"><ul class="tlist">${rows.map(r => li(r, lang, sm.get(r.source_id))).join("")}</ul>${pager}</section>` : `<p class="note">${t("none", lang)}</p>`}</div>`;
  const altBase = l => base(l) + kindSeg + "/";
  return renderPage(lang, { shell, title: t(kindSeg, lang) + (q.page > 1 ? ` — ${q.page}` : "") + (lang === "en" ? " | Made in Egypt Gate" : " | صنع في مصر"), description: (lang === "en" ? "Daily-updated " : "تحديث يومي: ") + t(kindSeg, lang), path: q.page > 1 && !filtered ? qs(q.page) : path, noindex: filtered, alt: { ar: altBase("ar"), en: altBase("en") }, jsonld: [{ "@context": "https://schema.org", "@type": "CollectionPage", url: SITE + path, name: t(kindSeg, lang), inLanguage: lang === "en" ? "en" : "ar-EG" }, { "@context": "https://schema.org", ...c.ld }], main }, host);
}

export function itemHtml(it, src, lang, host, nowMs = Date.now(), shell) {
  const en = lang === "en", seg = KIND_SEG[it.kind] || "news", path = itemPath(it, lang);
  const st = shownTitle(it, lang), h1 = st.text;
  const summary = (en ? it.summary_en : it.summary_ar);
  const srcName = src ? (en ? src.name : src.name_ar || src.name) : "";
  const closedOld = it.status === "closed" && it.deadline && it.deadline < addDays(cairoDay(nowMs), -30);
  const facts = [
    [t("kind", lang), KIND_LABEL[it.kind] ? KIND_LABEL[it.kind][en ? 1 : 0] : it.kind],
    it.entity ? [t("entity", lang), it.entity] : null,
    [t("market", lang), flag(it.market) + " " + marketName(it.market, lang) + (it.country && !/^(eg)$/.test(it.market) ? " — " + it.country : "")],
    it.sector != null ? [t("sector", lang), sectorName(it.sector, lang)] : null,
    it.published_at ? [t("published", lang), fmtDay(it.published_at.slice(0, 10), lang)] : null,
    it.deadline ? [t("deadline", lang), fmtDay(it.deadline, lang)] : null,
    it.value ? [t("value", lang), Number(it.value).toLocaleString("en-US") + " " + (it.currency || "")] : null,
  ].filter(Boolean);
  const c = crumbs(lang, [[t(seg, lang), base(lang) + seg + "/"], [h1.length > 60 ? h1.slice(0, 57) + "…" : h1, path]]);
  const labelLine = it.tag === "tender_news" ? `${t("tenderNews", lang)} — ${en ? "source" : "المصدر"}: ${esc(srcName)}` : `${t("srcLbl", lang)}: ${esc(srcName)} — ${t("auto", lang)}`;
  const main = `<div class="sx-hero"><div class="wrap">${c.html}<h1>${st.orig ? `<span lang="${esc(st.lang)}" dir="auto">${esc(h1)}</span>` : esc(h1)}</h1><div class="sx-chips"><span>${esc(KIND_LABEL[it.kind] ? KIND_LABEL[it.kind][en ? 1 : 0] : "")}</span><span>${flag(it.market)} ${esc(marketName(it.market, lang))}</span>${statusBadge(it, lang)}${st.orig ? origMark(lang) : ""}</div></div></div>
<div class="wrap sx-main"><div class="sx-grid"><div>
<section class="card2">${summary ? `<p>${esc(summary)}</p>` : it.summary_orig ? `<p class="note">${t("excerpt", lang)}:</p><p>${esc(it.summary_orig)}</p>` : ""}
${h1 !== it.title_orig ? `<p class="note">${t("origTitle", lang)}: <span lang="${esc(it.lang || "")}" dir="auto">${esc(it.title_orig)}</span></p>` : ""}
${summary || h1 !== it.title_orig ? `<p class="note">${t("aiNote", lang)}</p>` : ""}
<dl class="sx-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
<p class="note">${labelLine}</p>
<p><a class="btn btn-gold" href="${esc(it.url)}" rel="nofollow noopener" target="_blank">${t("official", lang)} ↗</a></p></section>
</div><div><section class="card2 cta"><h2>${en ? "Need help?" : "محتاج مساعدة؟"}</h2><p>${en ? "The platform team can help you prepare and submit your offer." : "فريق المنصة يساعدك في تجهيز العرض والتقديم."}</p><a class="btn btn-line" href="${en ? "/contact/#rfq-form" : "/contact/#rfq-form"}">${t("help", lang)}</a></section></div></div>
<p class="note intel-upd">${t("updated", lang)}: <time datetime="${esc(it.updated_at || "")}">${esc(fmtCairo(it.updated_at, lang))}</time></p></div>`;
  const desc = (summary || it.summary_orig || h1).slice(0, 160);
  const ld = seg === "news" ? { "@context": "https://schema.org", "@type": "NewsArticle", headline: h1.slice(0, 110), datePublished: it.published_at || it.first_seen_at, dateModified: it.updated_at || it.first_seen_at, inLanguage: en ? "en" : "ar-EG", mainEntityOfPage: SITE + path, isBasedOn: it.url, description: desc, publisher: { "@type": "Organization", name: "منصة صنع في مصر", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/img/logo-site.png" } }, sourceOrganization: srcName ? { "@type": "Organization", name: srcName } : undefined }
    : { "@context": "https://schema.org", "@type": "WebPage", url: SITE + path, name: h1, inLanguage: en ? "en" : "ar-EG", dateModified: it.updated_at || it.first_seen_at, isBasedOn: it.url, about: { "@type": "Thing", name: it.title_orig, ...(it.entity ? { description: it.entity } : {}) }, ...(it.deadline ? { expires: it.deadline } : {}) };
  /* hidden=2: a news item the relevance rule unlisted (engine.js newsSweep) — its page still answers, out of the index */
  return renderPage(lang, { shell, title: h1.slice(0, 90) + (en ? " | Made in Egypt Gate" : " | صنع في مصر"), description: desc, path, noindex: closedOld || it.hidden === 2, ogType: seg === "news" ? "article" : "website", alt: { ar: itemPath(it, "ar"), en: itemPath(it, "en") }, jsonld: [ld, { "@context": "https://schema.org", ...c.ld }], main }, host);
}

export async function sourcesPage(env, lang, host, shell) {
  const rows = (await env.DB.prepare("SELECT * FROM intel_sources WHERE listed=1 ORDER BY enabled DESC, market, name").all()).results || [];
  const en = lang === "en";
  const on = rows.filter(s => s.enabled), off = rows.filter(s => !s.enabled);
  const tr = s => `<tr><td>${s.homepage ? `<a href="${esc(s.homepage)}" rel="nofollow noopener">${esc(en ? s.name : s.name_ar || s.name)}</a>` : esc(en ? s.name : s.name_ar || s.name)}</td><td>${esc(KIND_LABEL[s.kind] ? KIND_LABEL[s.kind][en ? 1 : 0] : s.kind)}</td><td>${flag(s.market)} ${esc(marketName(s.market, lang))}</td><td>${s.last_ok_at ? esc(fmtCairo(s.last_ok_at, lang)) : "—"}</td><td>${s.items_total || 0}</td><td>${s.fail_count ? (en ? "failing" : "متعثر مؤقتاً") : s.last_ok_at ? (en ? "working" : "يعمل") : (en ? "pending" : "بانتظار أول سحب")}</td></tr>`;
  const c = crumbs(lang, [[t("sources", lang), base(lang) + "sources/"]]);
  const main = `<div class="sx-hero"><div class="wrap">${c.html}<h1>${t("sources", lang)}</h1><p class="intro">${en ? "Every item links to its official source. We only read public listings whose robots.txt and terms allow automated reading, at most once per run, identifying ourselves as MadeInEgyptGate-IntelBot/1.0." : "كل عنصر مربوط بمصدره الرسمي. نقرأ فقط القوائم العامة التي تسمح شروطها وملف robots.txt بالقراءة الآلية، مرة واحدة في كل دورة، ونعرّف أنفسنا باسم MadeInEgyptGate-IntelBot/1.0."}</p></div></div>
<div class="wrap sx-main"><section class="card2"><h2>${en ? "Active sources" : "المصادر المفعّلة"} (${on.length})</h2><div style="overflow-x:auto"><table class="sx-tbl"><thead><tr><th>${en ? "Source" : "المصدر"}</th><th>${t("kind", lang)}</th><th>${t("market", lang)}</th><th>${t("updated", lang)}</th><th>${en ? "Items" : "العناصر"}</th><th>${en ? "Status" : "الحالة"}</th></tr></thead><tbody>${on.map(tr).join("")}</tbody></table></div></section>
${off.length ? `<section class="card2"><h2>${t("gaps", lang)} (${off.length})</h2><ul class="tlist">${off.map(s => `<li>${s.homepage ? `<a href="${esc(s.homepage)}" rel="nofollow noopener">${esc(en ? s.name : s.name_ar || s.name)}</a>` : esc(en ? s.name : s.name_ar || s.name)} <span class="m">${flag(s.market)} ${esc(marketName(s.market, lang))} — ${esc(s.disabled_reason || s.terms_note || "")}</span></li>`).join("")}</ul></section>` : ""}</div>`;
  return renderPage(lang, { shell, title: t("sources", lang) + (en ? " | Made in Egypt Gate" : " | صنع في مصر"), description: en ? "Official sources behind the daily intelligence feed." : "المصادر الرسمية لمركز المعلومات اليومي.", path: base(lang) + "sources/", alt: { ar: "/intel/sources/", en: "/intel/en/sources/" }, jsonld: [{ "@context": "https://schema.org", ...c.ld }], main }, host);
}

export function gonePage(lang, host, status = 410, shell) {
  const en = lang === "en";
  return renderPage(lang, { shell, title: (status === 410 ? (en ? "Item removed" : "تمت إزالة هذا العنصر") : (en ? "Not found" : "غير موجود")), path: base(lang), noindex: true, main: `<div class="sx-hero"><div class="wrap"><h1>${status === 410 ? (en ? "This item was removed" : "تمت إزالة هذا العنصر") : (en ? "Page not found" : "الصفحة غير موجودة")}</h1><p class="intro"><a href="${base(lang)}">${t("intel", lang)}</a></p></div></div>` }, host);
}

export async function sitemap(env, part) {
  const per = 2500; // AR + EN per item → ≤ 5,000 URLs per chunk
  const w = "hidden=0 AND dup_of IS NULL AND NOT (status='closed' AND deadline < ?)";
  const cut = addDays(cairoDay(), -30);
  if (!part) {
    const n = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM intel_items WHERE ${w}`).bind(cut).first()) || {}).n || 0;
    const chunks = Math.max(1, Math.ceil(n / per));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>${SITE}/intel/sitemap-pages.xml</loc></sitemap>\n${Array.from({ length: chunks }, (_, i) => `<sitemap><loc>${SITE}/intel/sitemap-items-${i + 1}.xml</loc></sitemap>`).join("\n")}\n</sitemapindex>`;
  }
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
  const pair = (ar, en, lm) => [ar, en].map(u => `<url><loc>${SITE}${esc(u)}</loc>${lm ? `<lastmod>${lm.slice(0, 10)}</lastmod>` : ""}<xhtml:link rel="alternate" hreflang="ar-EG" href="${SITE}${esc(ar)}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}${esc(en)}"/></url>`).join("\n");
  if (part === "pages") return head + ["", "tenders/", "projects/", "news/", "rfq/", "sources/"].map(s => pair("/intel/" + s, "/intel/en/" + s)).join("\n") + "\n</urlset>";
  const n = parseInt(String(part).replace("items-", ""), 10) || 1;
  const rows = (await env.DB.prepare(`SELECT id, kind, slug, title_orig, updated_at FROM intel_items WHERE ${w} ORDER BY first_seen_at DESC LIMIT ? OFFSET ?`).bind(cut, per, (n - 1) * per).all()).results || [];
  return head + rows.map(r => pair(itemPath(r, "ar"), itemPath(r, "en"), r.updated_at)).join("\n") + "\n</urlset>";
}

export const INTEL_CSS = `.intel-upd{margin:0}.sx-st+.sx-st{margin-inline-start:4px}.intel-live{border:1px solid var(--line,#e5e5e5);border-radius:14px;padding:14px;background:var(--surface,#fff)}`;

/* router for /intel/* */
export async function handlePages(req, env, ctx) {
  const url = new URL(req.url), host = url.hostname;
  let p = url.pathname;
  if (p === "/intel") return Response.redirect(url.origin + "/intel/", 301);
  if (p === "/intel/intel.css") return new Response(INTEL_CSS, { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  const html = (body, status = 200, maxAge = 600) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}`, "X-Robots-Tag": status >= 400 ? "noindex" : "all" } });
  const xml = body => new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  if (p === "/intel/sitemap.xml") return xml(await sitemap(env, null));
  let m = /^\/intel\/sitemap-(pages|items-\d+)\.xml$/.exec(p);
  if (m) return xml(await sitemap(env, m[1]));
  let lang = "ar";
  if (p === "/intel/en" ) return Response.redirect(url.origin + "/intel/en/", 301);
  if (p.startsWith("/intel/en/")) { lang = "en"; p = "/intel/" + p.slice("/intel/en/".length); }
  if (p.startsWith("/intel/__")) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  /* the site's current shell (≤ 1.5 s, cached 1 h), else the baked one — read only when a page is rendered (not for a redirect) */
  const shell = async () => (await siteShell(lang, env, ctx)).shell;
  if (p === "/intel/") return html(await hubPage(env, lang, host, Date.now(), await shell()));
  if (p === "/intel/sources/") return html(await sourcesPage(env, lang, host, await shell()));
  m = /^\/intel\/(tenders|projects|news|rfq)\/$/.exec(p);
  if (m) return html(await listPage(env, lang, m[1], Object.fromEntries(url.searchParams), host, Date.now(), await shell()));
  m = /^\/intel\/(tenders|projects|news|rfq)\/(?:(.*)-)?([0-9a-z]{11})\/?$/.exec(p);
  if (m && ID_RE.test(m[3])) {
    const it = await env.DB.prepare("SELECT * FROM intel_items WHERE id=?").bind(m[3]).first();
    if (!it) { const g = await env.DB.prepare("SELECT id FROM intel_gone WHERE id=?").bind(m[3]).first(); return html(gonePage(lang, host, g ? 410 : 404, await shell()), g ? 410 : 404, 300); }
    if (it.hidden && it.hidden !== 2) return html(gonePage(lang, host, 410, await shell()), 410, 300);
    if (it.dup_of) { const prim = await env.DB.prepare("SELECT * FROM intel_items WHERE id=?").bind(it.dup_of).first(); if (prim && !prim.hidden) return Response.redirect(url.origin + itemPath(prim, lang), 301); }
    const canon = itemPath(it, lang);
    if (decodeURIComponent(url.pathname) !== decodeURI(canon) && url.pathname !== canon) return Response.redirect(url.origin + canon, 301);
    const src = await env.DB.prepare("SELECT id, name, name_ar, homepage FROM intel_sources WHERE id=?").bind(it.source_id).first();
    return html(itemHtml(it, src, lang, host, Date.now(), await shell()));
  }
  if (!p.endsWith("/") && !/\.[a-z0-9]+$/i.test(p)) return Response.redirect(url.origin + url.pathname + "/" + url.search, 301);
  return html(gonePage(lang, host, 404, await shell()), 404, 300);
}
export { SECTORS };
