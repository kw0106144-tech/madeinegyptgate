### technical
TECHNICAL SEO AUDIT: madeinegyptgate.com (local build in /home/user/madeinegyptgate/site, with checks against the live site)

Nobody can promise the #1 spot on any search engine. What can be controlled is listed below, most important first. The biggest problem is structural: almost all of the site's content can't be indexed today.

Raw data is in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seo/lh/
- out/: 28 Lighthouse runs (7 pages × AR/EN × mobile/desktop), served without compression.
- gz/: 6 mobile runs served with gzip, which is closer to production.

== LIGHTHOUSE (mobile, gzip, closer to production) ==
| Page | Perf | FCP | LCP | TBT | Transfer |
|---|---|---|---|---|---|
| Home AR | 49 | 2.7s | 8.4s | 670ms | 13.9MB (11.5MB images, 1.6MB hero.mp4) |
| Home EN | 22 | 7.9s | 17.9s | 1.1s | — |
| company.html#5 AR | 69 | — | 9.3s | — | 1.6MB |
| company.html#5 EN | 49 | — | 19.8s | — | 3.6MB |
| factories AR | 88 | — | 3.3s | — | — |
| tenders AR | 87 | — | 3.5s | — | — |

- **Uncompressed runs, EN mobile:** FCP is about 24s and LCP 44–64s on every page.
- **CLS:**
  - company: 0.41–0.71
  - region: 0.65–0.81 (desktop)
  - factories desktop: 0.48
  - news desktop: 0.39
  - tenders desktop: 0.42
- **Lighthouse "SEO = 100" on every page is misleading.** It only checks basic tags. It cannot see the problems in items 1–4 below.

== RANKED ISSUES ==

**P0-1. Every detail page lives behind a "#" hash URL, so none of it can be indexed.**
- Google drops everything after "#". So company.html#5, company.html#2000 and so on are all one URL: company.html.
- Content that can't be indexed today:
  - 3,000 factory profiles (oldfac) plus 99 more (facx), as company.html#N and #xN.
  - 122 news items (article.html#), 18 events (event.html#), 102 offers (offer.html#).
  - 64 zones (city.html#), 27 governorates (region.html#CAI…), 65 projects (project.html#), 50 leads (lead.html#).
  - Winners and entities (winner.html#, entity.html#), opportunity.html#ET…, export-market.html#.
- Tenders (438 + 61 + 62) and the 35 RFQs have no URL at all. They open in a modal, and the rendered tenders.html and rfqs.html contain 0 item links.
- Code references:
  - The hash is the item id: company.part.py:36 (`H = location.hash…`).
  - The JS sets canonical to the "#" URL, which Google ignores: site.py:181–182 (MIGSEO).
  - The static canonical on every template is bare `company.html` and so on: seo.part.py:90.
- Fix: generate one static, pre-rendered HTML file per item at build time (site.py loop), with clean URLs. For example:
  - /factories/<slug>/ or /company/<id>-<slug>/
  - /tenders/<id>/, /rfq/<id>/, /news/<id>-<slug>/
  - /governorate/cairo/, /zones/<slug>/, /events/<slug>/, /offers/<id>/
  - Each file needs its own `<title>`, description, canonical, hreflang, H1, server-rendered body and JSON-LD.
- Keep the JS behaviour as progressive enhancement on top of that.
- Cloudflare Pages serves static files, so roughly 4.5k files (×2 for EN) is no problem.
- Change every internal `href="company.html#N"` to the new URLs.

**P0-2. The old site's URLs are 301-redirected to hash URLs on the live site, so their ranking value is being thrown away now.**
- Live: www.madeinegyptgate.com/factories/<slug>/ → 301 to the apex domain → 301 to company.html#N.
- That is 2 hops, and the final URL Google sees is just company.html for all 3,000 old URLs. Google will treat this as a mass soft-404.
- Unknown slugs → factories.html, which is also a soft-404.
- The old site claimed 26k factories, but only 3,000 were imported (data/oldfac.js, field [7] holds the old URL). The other ~23k old URLs collapse into factories.html.
- Fix:
  - One-hop 301 from each old URL to its new static page (Cloudflare Pages `_redirects`, or Bulk Redirects for more than 2k rules).
  - Import the rest of the old directory, or return 410 for removed entries.
  - Put Search Console's "indexed pages" export through this mapping.
  - The live deploy has redirect rules (/tenders/ → tenders.html, /products/ → market.html) that are not in this repo. Bring them into version control.

**P0-3. robots.txt blocks the register/pricing page.**
- `Disallow: /register.html#form` (seo.part.py:100, also live). In robots.txt "#" starts a comment, so Google reads this as `Disallow: /register.html`. That blocks the pricing page, which has sitemap priority 0.9.
- Fix: delete the line.
- Also: the live robots.txt (panel.html, login.html, /api/) differs from the one the build generates. Generate one source only.

**P0-4. Template pages in the sitemap are empty, thin, or redirect away.**
- sitemap.xml has 46 URLs and **0 detail URLs**.
- What Googlebot sees when it renders these pages:
  - company.html: H1 "ملف المصنع", 45 characters of text.
  - article.html: "الخبر", 60 characters.
  - event.html: H1 "معرض", 33 characters.
  - offer.html: "العرض غير متاح".
  - city.html: 50 characters.
  - project.html, winner.html, entity.html, radar.html and advisor.html: a JS gate (site.py:239 GATES, :352) sends non-members to register.html#partner, so Googlebot sees the register page.
  - factory.html is a hard-coded demo profile ("إيجيتك للكابلات / Elsewedy") indexed as a real company, and it is linked from the home "members" list.
- Fix:
  - Remove the template URLs from the sitemap.
  - Add noindex to the empty templates.
  - Add noindex to factory.html, or replace it with real data.
  - For gated content, publish a public teaser page (name, entity, region, date, value range) and gate only the details. Never use a JS redirect for crawlers.
  - Generate sitemap index files: factories, tenders, rfqs, news, events, zones, governorates, offers, EN. Each needs a real `<lastmod>` from the data. Today lastmod is the build date on every URL, so Google ignores it.

**P0-5. The English version can't be indexed, and it is very slow.**
- hreflang points to `?lang=en`. That page's canonical is the Arabic URL (seo.part.py:90), so Google ignores the hreflang and drops the EN page.
- The English text is produced in the browser by data/i18n-en.js: 7.7MB raw, 1.75MB brotli on live, 28,398 entries, `cache-control: no-cache`.
- It is loaded with parser-blocking `document.write` (data/i18n.js:10), and the meta description is only partly translated (company#5 EN description stays in the source language). That causes the 18–64s LCP above.
- The language choice is also remembered in localStorage, so an Arabic URL can show English to a returning user.
- Fix:
  - Pre-render EN at build time into /en/... static files.
  - Give each language a self-referencing canonical.
  - Make the ar-EG, en and x-default hreflang tags reciprocal, on every detail page too.
  - Add og:locale:alternate.
  - Stop shipping i18n-en.js to visitors. If it has to stay for dynamic text, split it per page and load it with defer.
  - Let URL language override localStorage.

**P1-6. The page head is broken.**
- For every page except index, `<title>`, the Google Fonts stylesheet and the scripts are written inside `<body>`: site.py:247 builds the head string, and :253–255 places it after `<body>`. Example: company.html has `<title>` at byte 7457, after `<body>` at 5553.
- site/index.html has no doctype, `<html lang>`, `<head>` or charset. It is the `main=True` artifact variant. Lighthouse flags doctype, charset, viewport and html-has-lang. The live "/" is fine, so make sure the deploy never ships this file.
- Fix: put title, meta, fonts and preloads in `<head>`. Make index.html a copy of home.html.
- Also:
  - Remove the stray `<meta name="claude:viewport-fit-sides">`.
  - Remove or debug-gate the public "Page error (please send a screenshot)" overlay script (site.py:248).

**P1-7. Render-blocking JavaScript and page weight.**
- **Sync scripts:** every page loads 14–26 synchronous scripts. The minimum is about 840KB raw:
  - plan, regions, real.js (332KB), factories
  - two chat assistants: bot, bot-en, janna (240KB), janna-live, janna-real, bassem, bassem-real, captions
  - seo.js
- **Company page:** loads oldfac.js 787KB + oldfacd.js 1.6MB + oldprod synchronously just to show one company (site.py:335). Its LCP is held back about 21s on uncompressed mobile.
- **Home page:** 6,305 DOM nodes, 1,243 links (574 of them to factories.html), 57 images (11.5MB), and an autoplay hero.mp4 (1.6MB).
- **Images:** 40 images over 300KB (1600×900 JPEGs of about 390KB in img/gov and img/ind) and no WebP/AVIF. Lighthouse estimates 1.7MB savings from modern formats.
- Fix:
  - Load the chat assistants and seo.js with `defer`, after a user action or when the browser is idle.
  - Once pages are static (P0-1), detail pages need no data files at all.
  - Convert images to AVIF/WebP with srcset, add width/height, use `fetchpriority=high` on the hero image, and lazy-load everything below the fold.
  - Use a poster image instead of hero.mp4 on mobile.
  - Self-host Cairo with only 2–3 weights and preload them.
  - Set `Cache-Control: immutable` on the versioned `?v=` assets with a Cloudflare `_headers` file. Today it is `no-cache`.

**P1-8. CLS from content rendered by JS.**
- The company and region pages ship an empty `<main>` (55 bytes) that JS fills in later. This pushes the footer down: CLS 0.57 on company mobile, 0.81 on region desktop.
- The footer logo (eafid-logo.png) has inline `height:auto`, so it is treated as unsized.
- Fix: server-render the content (P0-1), or reserve its height. Use `aspect-ratio` on images.

**P1-9. Structured data is weak or invalid.**
- Static JSON-LD on company.html says `Organization name="ملف المصنع – صنع في مصر"` for every company (seo.part.py:85–86).
- data/seo.js builds its markup 1.2s after load (data/seo.js:71), so Bing and Yandex never see it. Problems in it:
  - The factories ItemList gives every item the same url `factory.html` (:53).
  - Home and region ItemLists use hash URLs.
  - VideoObject has a fake `uploadDate: "2026-01-01"` and the og-cover image as thumbnail (:61). This is a spam risk; remove it or use real YouTube data.
  - NewsArticle markup is placed on the news list pages.
  - Event markup appears only on the list page, not on event.html.
- Fix: put JSON-LD in each static page:
  - Factory pages: Organization or LocalBusiness with name, address (governorate), logo, sameAs, makesOffer (Product), BreadcrumbList.
  - News: NewsArticle with real dates and image.
  - Events: Event with the venue, dates and organizer.
  - Tenders and RFQs: there is no rich result type, so use Thing/Offer or Demand plus Breadcrumb.
  - List pages: ItemList with unique URLs.
- Also:
  - Change the LinkedIn sameAs from a personal /in/ profile to a /company/ page.
  - The manifest declares a 512×512 icon, but logo-site.png is 210×200.

**P1-10. Internal linking and pagination.**
- Factories shows 24 of 3,099 companies, and the rest load behind a "عرض المزيد" button (pages.part.py:230). Crawlers don't click buttons, so the rest are unreachable. News works the same way.
- The region and zone pages are reachable only through #codes.
- Fix:
  - Use real `<a href>` pagination (/factories/page/2/) or full static listings.
  - Add hub pages for each governorate, industrial zone and sector, such as /factories/10th-of-ramadan/ or /factories/sector/food/. These match high-volume searches like «مصانع العاشر من رمضان».
  - Link related factories, tenders and news to each other.
  - Change the 186 `href="home.html"` links to `/`.
  - Stop linking dashboard.html (noindex and disallowed) from all 49 pages, or use rel=nofollow.

**P2-11. Titles and meta descriptions.**
- Titles are short at 14–40 characters. Home is just «منصة صنع في مصر» (15). Use about 50–60 characters with the keyword first, for example «دليل المصانع المصرية ومناقصات مصر | منصة صنع في مصر».
- Duplicate titles:
  - leads.html and contractor-leads.html have the same title and the same body. Canonicalise one to the other, or 301.
  - home.html and index.html are duplicates.
- Missing SEO dictionary entries (description = title): city, winner, advisor (seo.part.py SEO dict). region#CAI also gets description = title from the JS.
- Some company descriptions are in English on Arabic pages (from oldfacd).
- `og:type=article` is used on collection pages.

**P2-12. The admin SEO workspace has no effect.**
- The admin "SEO يدوي" tab saves titles, descriptions, slugs and redirects to the admin's own browser storage only (admin.part.py:101, 201, 205). Nothing reaches the built pages, sitemap or redirects.
- Its default keywords and checklist are left over from the UAE clone (admin.part.py:67 «مصانع الإمارات», :106 «صفحة لكل إمارة»).
- Fix:
  - Store SEO overrides (per page or item: title, description, slug, noindex, canonical, 301s) in the Worker's D1 database through /api/admin/seo.
  - Have the build read them, or have a Pages Function/Worker apply them at the edge.
  - Emit `_redirects` from the stored 301s.
  - Add Search Console and Bing Webmaster verification and an IndexNow ping on publish. The MIGSEOCFG IDs in data/seo.js are all empty, and they are injected by JS, which Google accepts for verification only through other methods. Put the verification meta tag in the static head.

**P2-13. Content quality.**
- News items are summaries of about 200 characters that link out to external sources such as amwalalghad.com. This is thin, aggregated content.
- Add original analysis or context to each item, or noindex the detail pages until there is real content.

**P2-14. Accessibility (it affects quality signals).**
- color-contrast and heading-order fail on 11 of 28 runs.
- target-size fails on home.
- market.html has no H1.
- Images do have alt text (0 missing).

**P2-15. Minor.**
- Search engines ignore meta keywords (harmless).
- Google has retired the WebSite SearchAction sitelinks search box (harmless).
- FAQPage rich results are now limited to government and health sites.
- 404 handling is fine (real 404 status with noindex).
- www → apex 301 works.
- Remove the duplicate http→https→apex hop.

== IMPLEMENTATION ORDER ==
1. robots.txt fix (P0-3).
2. Static pre-rendered detail and hub pages with clean URLs, plus a sitemap index (P0-1, P0-4, P1-10).
3. One-hop 301 map from the old WordPress URLs (P0-2).
4. Static /en/ pages with correct canonical and hreflang (P0-5).
5. Head fix and deferring JS and images (P1-6, P1-7, P1-8).
6. Per-page JSON-LD (P1-9).
7. Admin SEO overrides stored in D1 and used by the build (P2-12), then Search Console, Bing and IndexNow.

### keywords
KEYWORD & INTENT RESEARCH: madeinegyptgate.com. The full keyword map is in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seo/keyword-map.md. The count scripts are stats.js, stats2.js and stats3.js in the same folder. No project files were changed.

Method: Google autocomplete (gl=eg, hl=ar/en, about 90 seed terms), spot checks of the search results pages (SERPs), and counts over /home/user/madeinegyptgate/data.

## No guarantee of #1
No one can guarantee first place on every search engine. What can be done is to win the long tail first (sector × governorate, industrial cities, single tenders, company names), where the current SERPs are weak (more on that below). Head terms such as «مناقصات مصر», «factories in egypt» and «اسعار حديد» are high difficulty.

## Blocker to fix before any keyword work matters
Every detail and filter view is a client-rendered template reached through `?id=` or `?r=`, and its canonical points to the bare template. For example, all 3,000 company profiles canonicalize to company.html. English pages are `?lang=en`, and sitemap.xml has only 48 URLs.

site.py needs to pre-render static, self-canonical pages:
- one file per entity and per hub, with the H1, list items and JSON-LD in the HTML;
- English under `/en/...` with hreflang pairs;
- a sitemap index split by type, with lastmod dates;
- 301 redirects for the legacy WordPress URLs that are still indexed: /factories/<slug>/ (3,157 references), /tender-item/ (377), /industrial_products/ (193), /rfq/ (35), /tenders/page/N/, /media-center/N, /?p=N.

## Data limits on programmatic pages
- **Members:** 3,000 records in oldfac.js (1,437 factories, 1,563 companies). **The "26k+" claim is not in the data, so it should not appear in titles or meta text.**
- **Governorates:** concentrated in CAI 1315, GIZ 487, ALX 315, SHR 222, QLB 188. Every other governorate has fewer than 60.
- **Cities:** only a few have usable member counts: 10th of Ramadan 49, 6th of October 49, Obour 17, Borg El Arab 15, Sadat 14, Badr 13.
- **Sectors:** more than 70 raw sector labels. Normalized, they come to about 19 canonical sectors.
- **Sector × governorate:** 83 combinations have at least 5 members, 58 have at least 10.
- **Sector × city:** only 2 combinations reach 10 members (chemicals in 10th of Ramadan and in 6th of October).
- **Tenders:** 438 rows, but 377 have no governorate and the entity "جهة حكومية". Tender pages by category work (about 15 categories); tender pages by governorate do not.
- **Products:** 193 products, and each product belongs to only one factory. Single product pages work; product hubs would be thin.
- **Zones:** 64 records with stable ids and unique content, so every zone page can be indexed.
- **Indexing rule:** a programmatic page is indexed only with at least 5 real members (or at least 3 tenders). Otherwise it is noindex,follow.

## Clusters → target URL
Difficulty: L = low, M = medium, H = high.

- **A. Directory head terms** («دليل المصانع المصرية», «factories in egypt», «egyptian manufacturers directory»). Difficulty H/M-H. Target /factories/.
  - AR title: «دليل المصانع المصرية: {N} مصنع وشركة حسب القطاع والمحافظة»
  - EN title: «Egyptian Manufacturers Directory: {N} Factories by Sector & Governorate»
- **B. Sector hubs**, the main commercial opportunity: «مصانع بلاستيك/تعبئة وتغليف/كرتون/كيماويات/حديد/رخام/زجاج/اغذية/ادوية في مصر», «موردين حديد / خامات بلاستيك», «plastic manufacturers in egypt», «packaging companies in egypt», «chemical companies in egypt». Difficulty M: the current results are thin listicles full of phone numbers. Target /factories/{sector}/ (about 19 pages) plus /en/.
  - AR title: «مصانع {قطاع} في مصر ({n} مصنع وشركة) – دليل {السنة}»
  - AR H1: «مصانع وشركات {قطاع} في مصر»
  - AR meta: count, top governorates, products, free RFQ.
  - EN title: «{Sector} Manufacturers in Egypt ({n} Factories & Suppliers)»
- **C. Governorate hubs** («مصانع الاسكندرية/الشرقية/القليوبية/المنوفية/اسيوط», «دليل مصانع …»). Difficulty L-M. Target /governorates/{gov}/, all 27 indexable because each page also carries zones, tenders and projects.
- **D. Sector × governorate** («مصانع بلاستيك في اسكندريه/المنوفية», «مصانع كرتون في الاسكندرية», «مصانع اغذية في دمياط»). Difficulty L. Target /factories/{sector}/{gov}/, about 83 indexable pages under the rule above.
  - AR title: «مصانع {قطاع} في {المحافظة} ({n})»
- **E. Industrial cities and zones**, a high-volume local cluster: «مصانع العاشر من رمضان», «مصانع 6 اكتوبر», «مصانع العبور», «مصانع مدينة السادات», «مدينة بدر الصناعية», «برج العرب المنطقة الصناعية الأولى…», «مصانع قويسنا», «دليل مصانع العين السخنة», «مصانع اثاث دمياط», «factories in 10th of ramadan city», «6th of october industrial zone». Difficulty M. Target /industrial-zones/{zone}/ (64 pages from zones.js).
  - Autocomplete shows strong «دليل مصانع … pdf» demand, so offer a downloadable public listing (no personal phone numbers).
  - Keep sector × city pages noindex for now, even though the demand is real (e.g. «مصانع بلاستيك العاشر من رمضان», «مصانع ادوية في اكتوبر»).
- **F. Zones and free zones, informational** («المناطق الصناعية في مصر (pdf)», «المناطق الحرة في مصر», «industrial zones in egypt», «egypt free zones»). Difficulty M-H, against GAFI/IDA/SCZone and news sites. Target /industrial-zones/ and /free-zones/.
- **G. Tenders**:
  - Head terms («مناقصات مصر/اليوم/الحكومية», «egypt tenders») are difficulty H. Target /tenders/, updated daily. AR title: «مناقصات مصر اليوم {التاريخ}: {n} مناقصة حكومية سارية».
  - Category tails («مناقصات توريد مواد غذائية/كهربائية/سيارات», «مناقصات وزارة الصحة/الكهرباء», «مناقصات مصر للبترول», «مناقصات الهيئة العامة للمنطقة الاقتصادية لقناة السويس») are difficulty M. Target /tenders/{category}/ (about 15) and /tenders/{ref}/ (384 open; keep expired ones marked as ended).
  - Entity pages only for entities with at least 3 tenders (SCZone 7, مصر للبترول 6), after the "جهة حكومية" data is fixed.
  - Evergreen guides under /guides/ for «خطوات التعاقد مع الهيئات الحكومية», «بوابة التعاقدات تسجيل مورد», «ترسية مناقصة / خطاب ترسية».
- **H. Awards** («ترسيات المناقصات», «الشركات الفائزة»). Target /awards/ and /awards/{slug}/ (20 pages).
- **I. RFQ** («طلب عرض سعر», «طلب عرض سعر من شركة», «نموذج», «rfq egypt»). Targets:
  - /rfq/, the conversion page;
  - /guides/request-for-quotation-template/ for the template intent;
  - /rfq/{no}/ for the 35 public RFQs.
  - AR title: «اطلب عرض سعر من المصانع المصرية مجانًا». The copy must match the honest no-match flow ("يصل للمصانع المسجّلة المناسبة، أو يتابعه فريقنا") and must not promise "مئات العروض".
- **J. Export** («تصدير منتجات مصرية», «التصدير من مصر الى السعودية», «egypt exports to africa», «import from egypt», «egyptian exporters directory»). Difficulty M-H. Target /export/{market}/ for the 5 markets. English titles should use "Import from Egypt to {Market}".
- **K. Products**: 193 pages at /products/{slug}/ (301 from /industrial_products/).
  - AR title: «{المنتج} – صنع في مصر من {المصنع} | اطلب عرض سعر»
- **L. Company profiles**: 3,000 pages at /company/{slug}/ (301 from /factories/{old-slug}/), with Organization/LocalBusiness schema.
  - The 896 records with little or no description get noindex, or are enriched to at least 80 words.
- **M. Freshness supporters**: /news/{slug}/ (122), /events/{slug}/ (18), /projects/{slug}/.
  - «اسعار حديد التسليح اليوم» has very high volume and is difficulty H. Build a /prices/rebar-steel/ page only if the bourse data is updated daily with a source.
- **N. Brand**: the bare query «صنع في مصر» is taken by the film and by madeinegypt.com. Defend «منصة صنع في مصر» and «Made in Egypt Gate» instead.

**Do not target:** job queries («وظائف مصانع», «مصانع توزع شغل»), «مصانع للبيع/للإيجار», «مصانع ملابس جملة تليجرام», queries about Saudi/Riyadh.

**Scale:** about 4,000–6,000 indexable URLs from real data, compared with 48 today.

## What the admin SEO panel needs (implied by the map)
- Per-URL override of title, H1, meta, intro text, FAQ, noindex and canonical, with the templates above as defaults.
- A target keyword plus 3–5 secondary keywords per cluster, with a live check of the title and H1 against them.
- A control for the indexing threshold on programmatic pages.
- A 301 manager pre-loaded with the legacy WordPress paths.
- A table that maps the raw WordPress categories to the canonical sectors.
- An import of Search Console queries and positions per URL.

Sources: Google autocomplete (suggestqueries.google.com); SERP spot checks showing yellowpages.com.eg, almaal.org, projectsegy.com, misrconnect.com, madeinegypt.com, panjiva.com, infobelpro.com, tendersontime.com, globaltenders.com, parlmany.com, gate.ahram.org.eg, amwalalghad.com, and indexed legacy pages such as madeinegyptgate.com/tenders/page/132/.

### serp
SERP & COMPETITOR REPORT: madeinegyptgate.com (part: serp)
Searches were run on 2026-11-18 and the live site was probed with curl. No project files were edited.

## 0. Problems on the live site (fix these before any off-page work)
The new static site is already live on Cloudflare (cf-ray header present, 45 URLs in the live sitemap). Google still holds many old WordPress URLs, and the migration is losing their rankings:
- **Old factory URLs:** there are 3,153 of them, in the form `/factories/<arabic-slug>/` (the list is in site/data/oldfac.js). Each one 301-redirects to `company.html#0`. Google ignores the `#`, so all 3,153 collapse onto one URL and get treated as soft-404s, and their link equity is lost.
- **Old product URLs:** `/industrial_products/<slug>/` (193 of them) all redirect to `market.html`.
- **Old tender and RFQ URLs:** `/tender-item/…` (377) and `/rfq/…` (35) appear in oldtend.js and oldrfq.js; check them the same way.
- **Old WordPress URLs that return 404:** `/media-center/262`, `/ar/2024/11/25` and `/ar/wp-json/wp/v2/products/*`. Google has many of the `wp-json` URLs indexed.
- **`/?p=196` and `/?p=23253`:** they return 200 with the homepage, which creates duplicate homepage URLs. Redirect `/?p=*` with a 301, or canonicalise it.
- **Factory profiles all share one canonical:** `factory.html?id=…` declares `<link rel=canonical href="https://madeinegyptgate.com/factory.html">`, and company.html behaves the same way. Of 26k+ factories, almost none can be indexed. This is the main reason directories outrank the site (section 2).

Fix:
- Generate one static, crawlable URL per factory, product, tender, RFQ and governorate×sector page, each with its own canonical. Clean slugs such as `/factory/<slug>/` are best.
- Ship a `_redirects` file (Cloudflare Pages takes up to 2,000 static plus 100 dynamic rules) or a redirect map in the Worker, sending each old slug with a 1:1 301 to its new entity page. The old slugs are already in the old*.js data.
- Return a real 410 or 404 for `wp-json`.
- Split the sitemap with a sitemap index (factories, products, tenders, RFQs, news, governorates) and use real lastmod values. Today every page carries the build date as lastmod.

## 1. Who ranks now, query by query

**«دليل المصانع المصرية», «مصنع بلاستيك في مصر», «مصانع العاشر من رمضان أرقام»**
- Ranking: yellowpages.com.eg (keyword, city and map pages such as `/ar/keyword/plastic-factory` and `/ar/map-condensed-search/Egyptian-Manufacturer-Directory/pNN`), almaal.org, projectsegy.com, small-projects.org, invest.albanknote.com, misrconnect.com, and gate.ahram.org.eg for news.
- Why they rank:
  - Thousands of indexable keyword×city landing pages.
  - Long Arabic listicles titled «دليل أسماء وأرقام مصانع X في Y 2026», with phone/address tables, a freshness year in the title, and FAQ sections.
  - Old domains with many backlinks.
- Gap for us: per-sector × per-city pages with a factory list, which we have the data for but do not expose as URLs.

**"Egyptian factories directory / Egypt manufacturers / furniture manufacturers Damietta"**
- Ranking: madeinegypt.com (dominant), Kompass (country-subdomain clones of `/z/eg/`, 52,893 companies), Panjiva, yellowpages EN, infobelpro, automa.net, big5constructegypt.
- madeinegypt.com is a direct competitor and a name-confusion risk with our brand. It ranks with:
  - category landing pages (`/egyptian-furniture-manufacturers.html`, `/listings/furniture-wood`)
  - one slug URL per supplier (`/supplier/<slug>`)
  - EN, AR and ES versions (`es-sourcing.php`, `ar-listings.php`)
  - "Verified" wording in titles and long sector intro text with statistics (for example EFEC export figures)
- Its numbers contradict each other (10+, 344+, 3,200+ suppliers). We can beat it on data depth and on the trust of being run by an association.

**«مصانع في مصر للتصدير موردين»**
- madeinegyptgate.com already ranks #1 here, with its old `/about` and `/manufacturers` pages. madeinegypt.com `ar-listings` and automa.net follow.
- The `/manufacturers` URL now returns 404, so this ranking is at risk until it gets a 301 to factories.html or an equivalent page.

**«مناقصات مصر اليوم», «مناقصات حكومية»**
- Ranking: news sites (almalnews, alborsaanews, amwalalghad, parlmany tag pages, elwatannews), plus madeinegyptgate.com/ar/2024/11/25, an old WordPress date archive that now returns 404.
- Why they rank: news freshness, Google News inclusion, tag pages refreshed daily.
- The official portal is etenders.gov.eg (the Public Procurement Authority / هيئة الشراء الموحد). There is also gcsbudgeting.digitalegypt.gov.eg for entities based in the New Administrative Capital.
- Paid aggregators: monakasatmasr.com, the bidbook app.
- Opportunity: daily, dated pages per tender, plus governorate and sector hub pages titled «مناقصات [القطاع] في [المحافظة] اليوم».

**"Egypt tenders RFQ"**
- Ranking: developmentaid.org, ungm.org, unhcr.org/eg, globaltenders.com, openopps, aegypten.ahk.de, progigfinder, bidsfactory, allbusiness.africa.
- Why they rank: one page per notice, with structured fields (deadline, buyer, reference) and huge domain authority. Mostly English and international.
- Our edge is Arabic and local, especially private-sector RFQs, which nobody covers well.

**«طلبات عروض أسعار توريد»**
- Almost no Arabic result. The SERP is filled with UN notices in English, which makes this a weakly contested niche we can win with indexable RFQ pages.

**Brand query "madeinegyptgate"**
- We own the results, but Google shows old `?p=`, `wp-json` and `media-center` URLs. There is no independent press coverage.
- The operator, «الجمعية المصرية للتنمية الصناعية», returns no web results under that exact name. Google instead shows other associations with similar names (الجمعية المصرية لدعم الصناعة, الجمعية المصرية للصناعة والتنمية). The entity signal is weak and easily confused.

## 2. Why competitors win: patterns to copy legitimately
1. **One unique URL per entity, plus programmatic hubs** (sector, city, sector×city, product keyword), each with a self-referencing canonical and unique title/H1/description. Yellowpages, Kompass and madeinegypt all do this.
2. **Title formulas with intent words and a year**, for example «دليل مصانع البلاستيك في العاشر من رمضان 2026 | الأسماء والعناوين». Contact details should go through the platform's contact or RFQ form, not personal numbers (consistent with the user's privacy rule).
3. **Content depth on hub pages:** 300–600 words of real sector context with numbers and sources (EFEC, IDA, CAPMAS), a sortable list, an FAQ, and internal links to neighbouring cities and sectors.
4. **Freshness:** tender and RFQ pages with datePosted/validThrough, an «اليوم» hub, and real lastmod values in the sitemap.
5. **Structured data:** Organization/LocalBusiness per factory, ItemList on hubs, BreadcrumbList, FAQPage, NewsArticle, Event, Product. The repo already does part of this, but it currently points at one shared URL.
6. **Authority:** competitors have years of backlinks. This is where the off-page plan in section 3 matters.

## 3. Off-page plan (white-hat only, doable by an association)

**A. Search engine accounts (week 1)**
- **Google Search Console:** use a Domain property, verified by DNS TXT in Cloudflare. Submit the sitemap index. Use the page indexing report to track the 301 migration, and watch Core Web Vitals.
- **Bing Webmaster Tools:** import from GSC, submit the sitemap. Bing data also feeds DuckDuckGo, Yahoo, ChatGPT search and Copilot.
- **Yandex Webmaster:** verify with a meta tag or DNS and set the region to Egypt.
- **Others:** Naver and Seznam are optional and add little value.
- **IndexNow:** in the Cloudflare dashboard, go to Caching → Configuration → Crawler Hints and turn it on (free, one click; it notifies Bing, Yandex, Seznam and Naver). Also have the Worker or build step POST changed URLs to `api.indexnow.org` with a key file at the root, for each new tender, RFQ or factory. Google does not use IndexNow, so rely on the sitemap plus Search Console URL Inspection for priority URLs.
- **Verification tokens in the admin panel:** keep GSC, Bing and Yandex verification tokens as admin-editable fields injected into `<head>`, so the admin can re-verify without a code change.

**B. Entity and brand signals**
- **Google Business Profile** for the association's office (6th of October, District 11, building 56, 3rd floor):
  - Category: "Non-profit organization" or "Business association"; there is no generic "website" category.
  - Name, address and phone (NAP) must match the site exactly: 02 38346757 and info@madeinegyptgate.com.
  - Link the website, post weekly updates (new tenders, events), and add photos.
  - It must not be a virtual office, because Google suspends those.
- **Consistent naming:** the social profiles use different names (x.com/egy_business_eg, youtube @egyptbusinessgate, a LinkedIn *personal* profile titled «منصة مصر للمناقصات والموردين Egypt Business Gate»). Standardise them all to «منصة صنع في مصر | Made in Egypt Gate». Convert LinkedIn to a **Company Page**, because a personal profile in sameAs weakens the entity. Use the same logo and bio everywhere, and keep all of them in Organization.sameAs.
- **Wikidata item** for the association and the platform: founding date, registration number 6189/2017 (Ministry of Social Solidarity), official website, social IDs. This is legitimate and helps Google's Knowledge Graph. Do not create a Wikipedia article ourselves; that is a conflict of interest and will be deleted. Wait for independent press coverage.
- **eafid.org:** the parent association's site must link to madeinegyptgate.com and describe it the same way.

**C. Citations and authority links, ranked by value**
1. **Government and federation directories:**
   - Federation of Egyptian Industries (اتحاد الصناعات المصرية) and its chambers (food, engineering, chemicals, textiles, building materials, wood/furniture).
   - Export councils: EFEC furniture, chemicals, engineering, food, building materials.
   - Export Development Authority (هيئة تنمية الصادرات), IMC (Industrial Modernisation Centre / مركز تحديث الصناعة), IDA (Industrial Development Authority), GAFI (investment authority), MSMEDA (small-enterprise agency).
   - Chambers of commerce: the Federation of Egyptian Chambers of Commerce, and the Cairo, Alexandria and Giza chambers.
   - Approach: offer each body a free sector data page or tender feed in exchange for a "partner platform" or "useful links" listing.
2. **Industrial city investor associations:** 10th of Ramadan, 6th of October, Sadat, Obour, Borg El Arab, SCZone. Many have websites with member links, and city-specific hubs on our site give them a reason to link back.
3. **Bilateral chambers and international programmes:** AHK Egypt (already ranks for tenders), AmCham Egypt, EU-Egypt programmes, UNIDO/ILO Egypt projects, GIZ. They link to local B2B resources.
4. **Business directories (NAP citations):** yellowpages.com.eg, Kompass, Bing Places, Apple Business Connect, Foursquare. Use the same NAP on every one.
5. **Universities and research:** faculties of engineering and commerce, and ECES (Egyptian Center for Economic Studies), which may cite our sector statistics and data reports.

**D. Member factory badges (largest scalable link source)**
- Give each registered factory an embeddable badge «عضو موثّق في منصة صنع في مصر» (SVG plus HTML snippet) in its dashboard. It links to the factory's own profile URL, not the homepage, which also strengthens deep pages.
- Rules:
  - Use a plain `<a>` with descriptive anchor text, and don't force exact-match keyword anchors.
  - Make it optional, and don't require it as a condition of membership. Google treats links required in exchange for a service as link schemes; links should be editorially given.
  - Tie the badge to verification status, so it carries meaning and gets placed more often.
- **Expected result:** if 5–10% of the 3,000 or so active members place it, that is 150–300 relevant Egyptian referring domains.

**E. Digital PR (the strongest lever for "authority")**
- Publish a monthly data report, for example «مؤشر طلبات التوريد في مصر» (RFQ volume by sector and governorate, top tendering entities, award values), drawn from our tenders, RFQs and winners data. Pitch it to Al-Mal News, Al-Borsa, Amwal Al-Ghad, Enterprise, Daily News Egypt, Ahram Gate and Masrawy. These outlets already rank for tender queries, so their links are on-topic.
- Run press releases for MoUs with chambers and export councils, and for event or exhibition partnerships. Our events calendar can support media partnerships with expos such as Big5 Construct Egypt, Furnex and Food Africa, which usually give a logo plus link.
- Pursue Enterprise's 2026 "Made in Egypt" coverage (enterpriseam.com) for an interview or feature.
- Founder op-eds and quotes, credited as «مؤسس منصة صنع في مصر» with a link.

**F. Social and video**
- **YouTube:** short Arabic videos such as «كيف تقدم على مناقصة حكومية», factory tours and sector reports, with links in the descriptions. They can rank in Google video results for «طريقة التسجيل في بوابة التعاقدات».
- **Facebook groups and LinkedIn:** a daily «مناقصات اليوم» post linking to the tender hub. Social links are nofollow but bring crawling and branded search.
- **X and Instagram:** share every new RFQ or tender automatically. Add WhatsApp Channel and Telegram for distribution.

**G. Not allowed**
No bought links or PBNs, no link exchanges at scale, no comment or forum spam, no automatic «ابحث عن مصانع» pages without unique content, no scraped content copied from news sites without added value, and no fake reviews. These risk a Google manual action or SpamBrain demotion for the whole domain.

## 4. Admin SEO workspace (what the admin team needs)
- Per-URL overrides for title, description, H1, canonical, noindex and OG image. Programmatic hubs need templates with variables, for example «مصانع {sector} في {city} {year}».
- Redirect manager: an old → new 301 table that the Worker reads.
- Verification-token fields (GSC, Bing, Yandex) and a "ping IndexNow" button.
- Backlink and citation tracker: target, contact, status, link URL, date.
- Badge adoption list: which members embedded the badge.
- PR calendar.
- KPI panel from the GSC and Bing APIs: clicks, impressions, average position for target queries, and indexed page count.

## 5. Honest expectation
Nobody can guarantee #1 in every search engine. What is realistic:
- **Brand queries and «مصانع مصر للتصدير»:** #1 is achievable quickly once the redirects are fixed.
- **Long-tail queries** (sector×city, specific tenders, Arabic RFQs): top 3 within 3–6 months, given indexable pages and freshness.
- **Head terms** («دليل المصانع», «مناقصات مصر»): 6–12+ months of authority building, competing against yellowpages and news sites.

## 6. Note: one site I could not open
madeinegypt.com could not be fetched from this session because the network allowlist blocks it. Its URL and title patterns above come from search result snippets only.

## Sources
- https://yellowpages.com.eg/ar/keyword/plastic-factory
- https://madeinegypt.com/egyptian-furniture-manufacturers.html
- https://madeinegypt.com/listings/furniture-wood
- https://lb.kompass.com/z/eg/
- https://almaal.org/?p=159281
- https://projectsegy.com/plastic-factories-in-egypt/
- https://invest.albanknote.com/government-contracting-portal
- https://www.ungm.org/Public/Notice/316440
- https://www.developmentaid.org/tenders/view/1743026/rfq-for-development-of-the-hotline-system-and-case-management-system
- https://aegypten.ahk.de/en/services/tenders-in-egypt
- https://madeinegyptgate.com/manufacturers
- https://blog.cloudflare.com/cloudflare-now-supports-indexnow/
- https://blogs.bing.com/webmaster/november-2021/Cloudflare-Supports-IndexNow-via-one-click-Integration
- https://enterpriseam.com/egypt/2026/10/20/a-typology-of-what-made-in-egypt-actually-means/

Relevant files:
- /home/user/madeinegyptgate/seo.part.py: canonical and sitemap logic; line ~78 builds one URL per page key.
- /home/user/madeinegyptgate/site/data/oldfac.js, oldprod.js, oldtend.js, oldrfq.js: old WordPress URLs to use for the 1:1 redirect map.
- /home/user/madeinegyptgate/worker/src/index.js: where a redirect or IndexNow hook would go.