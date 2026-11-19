# SEO build spec (من ورك فلو بحث الـ SEO)

BUILD-READY SEO SPEC: madeinegyptgate.com (منصة صنع في مصر / Made in Egypt Gate)
Repo: /home/user/madeinegyptgate (static generator site.py → site/, Worker in worker/). Hosting: Cloudflare Pages, with the existing Worker on /api/*.
Research inputs: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seo/ (keyword-map.md, lh/, stats*.js). No project files were edited.

================================================================
0. GROUND RULES (they apply to every item below)
================================================================
- Be honest about ranking. Nobody can guarantee #1 on every search engine. The spec maximises everything we control: indexability, relevance, speed, structured data, internal links, freshness and authority signals. Admin UI copy must never promise a rank (exact wording in 3.8).
- Generate pages from real data only.
  - No "26k+" or "26,000" claim anywhere in titles, meta or JSON-LD. The data holds 3,000 members (oldfac) plus 99 public-source factories (facx). Every count is computed at build time.
  - Never generate pages from sample data. MIG.LEADS (50) and the sample parts of projects.js are marked "SAMPLE DATA". Only MIG.PROJECTS_REAL (65) is real.
- Privacy (owner rule). Factory phone numbers, WhatsApp numbers and emails never appear in HTML, JSON-LD, the manifest or sitemaps. Contact goes only through the RFQ / «اطلب عرض سعر» form.
- Public-source factories (facx) must not be made to look like registered members. Label them «بيانات من مصادر عامة – غير مسجّل في المنصة» and give them no memberOf in JSON-LD.
- RFQ copy must match the owner's no-match flow. Required wording: «يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه». Never «مئات العروض».
- Remove spam-risk markup: the fake VideoObject (data/seo.js:61), duplicated/identical ItemList URLs, and FAQPage used as a ranking device.

================================================================
1. STATIC GENERATOR FIX LIST (site.py / seo.part.py / new seo_build.part.py)
================================================================

1.1 Build plumbing
- site.py:3. Replace `B = '/home/user/madeinegyptgate/'` with `B = os.path.dirname(os.path.abspath(__file__)) + '/'`, so the site can build in Pages CI. Drop the hard-coded scratchpad path S, or make it optional.
- New tools/dump-data.mjs. Node evaluates site/data/{oldfac,oldfacd,oldprod,oldtend,oldrfq,facx,zones,real,projects,offers,i18n-en,regions}.js in a vm sandbox and writes build/data.json. This is needed because facx.js is an IIFE and i18n-en.js defines I18N_EN with 28,398 keys. site.py runs it via `subprocess.run(['node', B+'tools/dump-data.mjs', B+'site/data', B+'build/data.json'], check=True)`.
- New seo_build.part.py, exec'd after seo.part.py. Its entry point is `build_static_seo(OUT)`, called at the end of site.py after the pages loop. Functions (all pure, returning strings or dicts):
  - load_data() → D
  - norm_sector(raw) → slug | None
  - gov_of(rec) → code
  - slug_ascii(s)
  - legacy_slug(url) → decoded NFC path segment
  - url_for(kind, rec, lang='ar') → '/…/' with a trailing slash
  - abs_url(path)
  - indexable(kind, rec, ctx) → (bool, reason)
  - head_html(meta) → str. meta = {title, desc, canonical, robots, alt_en, alt_ar, og_type, og_image, jsonld_page, jsonld_crumbs, lang}
  - jsonld_company / jsonld_product / jsonld_tender / jsonld_rfq / jsonld_news / jsonld_event / jsonld_place / jsonld_collection / crumbs(list)
  - render_company / render_sector_hub / render_sector_gov / render_gov / render_zone / render_product / render_tender / render_tender_cat / render_rfq / render_award / render_news / render_event / render_project / render_export / render_listing_page(…, page_n)
  - write_page(path, html)
  - MANIFEST.append(row)
  - emit_sitemaps(OUT), emit_robots(OUT), emit_redirect_maps(OUT), emit_headers(OUT), emit_routes(OUT), emit_manifest(OUT), emit_hash_shims(OUT)
- New config files, committed:
  - seo/sectors.json: canonical sectors, plus a raw→canonical synonym map built from the normalisation already in scratchpad/seo/stats2.js.
  - seo/governorates.json: the 27 codes from site.py:143 / regions.part.py, each with ar, en and slug. The build asserts exactly 27.
  - seo/tender-cats.json
  - seo/keywords.json: clusters A–N from keyword-map.md, with target URL, target keyword, secondaries and difficulty.
  - seo/config.json: thresholds (see 1.4).
  - seo/lastmod.json: persisted, keyed by path, value {hash, lastmod}. If a record's content hash is unchanged, the previous lastmod is kept. This gives real lastmod values instead of the build date.
- Optional baked overrides. If build/seo-overrides.json exists (written by tools/seo-pull.mjs from the Worker export in 2.6), apply it in head_html and the H1/intro, so the static HTML matches the edge layer.

1.2 Head fix (P1-6). This is a prerequisite for everything else.
- In site.py page() (lines 246–255), `<title>`, the meta from seo_head(), FONTS and the `<style>` must all be inside `<head>`. Today `head` is concatenated into the body string.
  - Return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" …><title>…</title>{seo}{fonts}<style>…</style></head><body>…`.
  - EN pages use `lang="en" dir="ltr"`.
- Write index.html as an exact copy of the home page with a full head. Never write the main=True artifact variant to OUT. Remove home.html as a URL (it 301s to /).
- Delete `<meta name="claude:viewport-fit-sides">`. Output the "Page error (please send a screenshot)" overlay only when `os.environ.get('MIG_DEBUG')=='1'`.
- Every indexable page has:
  - exactly one `<title>`, one meta description, one canonical and one meta robots;
  - one `<h1 data-seo="h1">`;
  - one `<script type="application/ld+json" data-seo="page">` for the page graph and one `data-seo="site"` for the Organization/WebSite reference;
  - optionally `<p data-seo="intro">`.
  These data-seo hooks are what the edge rewriter targets (2.3).

1.3 URL architecture: clean, self-canonical, trailing slash, legacy URLs PRESERVED
Key decision: wherever an entity already had a WordPress URL, that URL becomes the new canonical page. Google already ranks those URLs, so keeping them loses nothing. The 3,000 /factories/<slug>/, 193 /industrial_products/<slug>/, 377 /tender-item/<slug>/ and 35 /rfq/<slug>/ URLs simply return 200 again. They don't need 301s, which removes P0-2 for every imported record.
- Files are written as <path>/index.html. Pages serves /x/ directly and 308s /x to /x/. The canonical is always the absolute trailing-slash form, percent-encoded UTF-8 (e.g. https://madeinegyptgate.com/factories/%D8%AA%D8%B4%D9%83…/).
- Legacy slugs are decoded, NFC-normalised, and written to disk as UTF-8 directory names. The build asserts there are no collisions with hub slugs. Hub slugs are ASCII; any ASCII legacy slug that equals a hub slug fails the build.
- Unicode safety switch: seo/config.json "slug_mode": "legacy" (default) | "hash".
  - In "hash" mode, company paths become /factories/c-<7-char base36 sha1(legacy slug)>/ and the 404-fallback map in 2.3 301s the legacy path to it.
  - Acceptance check A10 decides which mode ships.
- AR at root, EN under /en/ with the same path. An EN page is generated only when it passes the EN gate (1.6).

| Type | AR path (EN = /en + path) | Source | Count | Index rule |
|---|---|---|---|---|
| Home | / | | 1 | index |
| Static pages | /about/, /contact/, /register/, /legal/, /useful-links/, /media-center/, /videos/, /bourse/, /intl/, /outlets/, /export/ … (every former x.html) | pages dict | ~45 | index, except dashboard/admin/inbox/seo-admin/meeting/track/janna, which get noindex |
| Directory hub | /factories/ (+ /factories/page/N/, 50 per page) | oldfac+facx | 1+~62 | index |
| Sector hub | /factories/<sector>/ (+ /page/N/) | norm_sector | ~18 | index if ≥5 members |
| Sector × governorate | /factories/<sector>/<gov>/ | | 83 combos ≥5 | index if ≥5 members, else noindex,follow (page still built for UX; not in sitemap) |
| Company (member) | /factories/<legacy-slug>/ | oldfac[7] | 3,000 | index if description ≥80 words, or ≥40 words and ≥3 products; else noindex,follow (~885 thin) |
| Company (public-source) | /factories/<ascii-slug(name_en or source host)>/ | facx | 99 | index if description ≥40 words; labelled non-member |
| Governorate | /governorates/<gov-slug>/ | regions | 27 | index (each carries members, zones, tenders, projects) |
| Industrial zone / city / free zone | /industrial-zones/<zone.id>/ ; hubs /industrial-zones/ and /free-zones/ | zones.js | 64+2 | index |
| Product | /industrial_products/<legacy-slug>/ ; hub /products/ | oldprod | 193+1 | index if description ≥20 words or ≥1 image; manufacturer linked |
| Tender | /tender-item/<legacy-slug>/ ; tenders without a legacy URL: /tender-item/<slug_ascii(ref or id)>/ | oldtend 438, REAL.tenders 61, tenders_intl 62 | ~560 | index while open and for 90 days after the deadline, then noindex,follow. Never 404 |
| Tender hub | /tenders/ (+ /page/N/), «مناقصات اليوم» | | 1 | index, regenerated daily |
| Tender category | /tenders/category/<cat-slug>/ | seo/tender-cats.json maps the 44 raw categories to ~15 | ~15 | index if ≥3 tenders |
| Tender entity | /tenders/entity/<slug>/ | named entities only ("جهة حكومية" excluded) | ~2 now | index if ≥3 tenders |
| RFQ | /rfq/<legacy-slug>/ ; new RFQs /rfq/<no>/ ; hub /rfq/ (former rfqs.html) | oldrfq 35 | 36 | index; no buyer contact data |
| Awards | /awards/ and /awards/<slug_ascii(title)>/ | REAL.awards | 21 | index |
| News | /news/ (+ /page/N/) and /news/<date>-<hash6>/ | REAL.news | 123 | hub index. Items noindex,follow by default: ~200-character aggregated summaries are thin. Index only if body ≥150 words of original text (admin override can flip a page) |
| Events | /events/ and /events/<event.id>/ | REAL.events | 19 | index; still index after the end date, with the status «انتهى» |
| Projects | /projects/ and /projects/<r001…>/ | MIG.PROJECTS_REAL only | 66 | index |
| Leads (sample) | none | MIG.LEADS | 0 | leads.html, contractor-leads.html and consultant-leads.html get noindex until real data exists |
| Retail offers | /offers/ ; /offers/<id>/ | offers.js | 1+102 | hub index; detail noindex,follow (ephemeral) |
| Export markets | /export/<market>/ | exportmap | 5 | index |
| Guides | /guides/<slug>/ | handwritten (phase 3) | n | index |

- Hash shims, for links already shared on WhatsApp and social. company.html, article.html, event.html, offer.html, city.html, region.html, project.html, winner.html, entity.html, lead.html, opportunity.html and export-market.html become tiny pages with `<meta name="robots" content="noindex,follow">` and a canonical to the matching hub. Inline JS reads location.hash, looks it up in /_seo/hash/<type>.json (emitted by build: old hash id → new path) and runs location.replace(newPath). If there is no match, it goes to the hub.
- Replace every internal link:
  - `href="company.html#N"` and similar → url_for(...)
  - the 186 `href="home.html"` → "/"
  - region.html#CAI → /governorates/cairo/
  - city.html#id → /industrial-zones/id/
  - Tenders and RFQs get real `<a href>` links to their pages. The modal can stay as progressive enhancement: the click handler calls preventDefault and opens the modal, and the href remains.
- factory.html (the hard-coded demo profile «إيجيتك/السويدي»): stop generating it. 301 it to /factories/ and remove the home "members" link to it.

1.4 Thresholds (seo/config.json; the admin can override them later through config in 2.5)
{"min_hub_members":5, "min_tender_cat":3, "min_company_words":80, "min_company_words_with_products":40, "news_index_min_words":150, "tender_expired_index_days":90, "listing_page_size":50, "slug_mode":"legacy"}
- Arabic word count: `len(re.findall(r'\S+', text))` after stripping tags. Strip the leading "<slug> | " prefix that oldfacd descriptions carry.

1.5 Page templates. Server-rendered, so the content is fully in the HTML.
- Company page:
  - breadcrumb (visible plus JSON-LD): الرئيسية › دليل المصانع › {sector hub} › {name}
  - H1 {name}
  - facts table: النوع، القطاع→hub، المحافظة→gov hub، المدينة/المنطقة الصناعية→zone when matched by city regex، حالة العضوية (عضو مسجّل / موثّق if verified / «بيانات من مصادر عامة» for facx)
  - description
  - products → product pages
  - CTA «اطلب عرض سعر» → /rfq/new/?to=<path>, with the honest copy from section 0
  - «منشآت مشابهة»: 6 links, same sector, same governorate first
  - links to the sector×governorate hub if indexable
  - «آخر تحديث للبيانات» = lastmod
  - No phone, email, WhatsApp or address line beyond city/governorate.
- Hub pages (sector, sector×gov, gov, zone, tender category):
  - unique intro of 150–400 words built from real numbers: member count, top governorates and sectors, top products, zones, open tenders in the sector, each with its data source
  - sorted list with real `<a>` links (50 per page, /page/N/ pagination with plain links, self-canonical per page, title suffix «– صفحة N»)
  - links to neighbouring hubs
  - a visible FAQ generated from the same numbers (no FAQPage markup by default)
  - optional «تحميل القائمة (CSV)» with name, sector, city and URL only (matches the «دليل مصانع … pdf» demand; no contacts)
- Tender page:
  - fields: ref, type, status, entity, governorate, category→hub, booklet price, bond, deadline, official source link (rel="nofollow noopener")
  - «مناقصات مشابهة سارية»: 5 links
  - expired: banner «انتهى موعد التقديم» plus links to open tenders in the same category
- Default title and meta formulas (AR first; ~50–60 characters; keyword first; the « | صنع في مصر» suffix is dropped if the title would exceed 65):
  - /factories/: «دليل المصانع المصرية: {N} مصنع وشركة حسب القطاع والمحافظة»
  - sector: «مصانع {قطاع} في مصر ({n} مصنع وشركة) – دليل {YYYY}» / EN «{Sector} Manufacturers in Egypt ({n} Factories & Suppliers)»
  - sector×gov: «مصانع {قطاع} في {المحافظة} ({n}) | صنع في مصر»
  - gov: «مصانع وشركات {المحافظة}: دليل {n} مصنع والمناطق الصناعية»
  - zone: «مصانع {المدينة/المنطقة} الصناعية: الدليل والمساحة والقطاعات»
  - company: «{الاسم} – {القطاع} في {المدينة/المحافظة} | صنع في مصر»
  - product: «{المنتج} – صنع في مصر من {المصنع} | اطلب عرض سعر»
  - tenders hub: «مناقصات مصر اليوم {D MMMM YYYY}: {n} مناقصة سارية»
  - tender: «{عنوان مختصر ≤45} – {الجهة} | آخر موعد {date}»
  - rfq hub: «اطلب عرض سعر من المصانع المصرية مجاناً»
  - home: «منصة صنع في مصر | دليل المصانع المصرية والمناقصات وطلبات الأسعار»
  - Meta description: 120–160 characters, with count, place and products, ending with «اطلب عرض سعر مجاناً».
- Fix og:type: website for home and hubs, article only for news; product/company pages use website.
- Fill the missing SEO dict entries (city, winner, advisor). Pages that are actually duplicates: contractor-leads.html gets a canonical to leads (both noindex for now).

1.6 hreflang and English (P0-5)
- EN gate: an /en/ page is generated only when its title, H1 and at least 95% of its main text nodes have an English value. Sources: name_en/title_en fields (zones, events, REAL tenders, offers), then I18N_EN[ar], applied at build time. Also required: `arabic_ratio(main_text) < 0.05`. If the gate fails, there is no EN file and no hreflang.
- AR page with an EN twin:
  - `<link rel="alternate" hreflang="ar-EG" href=AR>`
  - `<link rel="alternate" hreflang="en" href=EN>`
  - `<link rel="alternate" hreflang="x-default" href=AR>`
  The EN page carries the identical set (reciprocal) and canonical = itself. Add og:locale ar_EG / en_US plus og:locale:alternate.
- `?lang=en` URLs: the middleware (2.3) 301s them to /en/<path>/ if that exists, otherwise to the AR path without the parameter.
- Language comes from the URL. localStorage may only show a «English version» banner. It must never swap content on an AR URL. No Accept-Language redirects.
- data/i18n-en.js (7.7MB) is never loaded on static pages. The JS-rendered pages that remain get a per-page split: the build collects the strings each page key uses and writes data/i18n/<key>.en.js (target ≤30KB). It is loaded with `defer` only on /en/ pages. Remove the parser-blocking document.write in data/i18n.js:10.

1.7 Structured data per type (inline JSON-LD in the static HTML; data/seo.js stops injecting JSON-LD and meta)
- Site graph (data-seo="site"):
  - home and /about/: the full ORG (seo.part.py:5) and WEBSITE (drop SearchAction);
  - every other page: {"@type":"WebPage","@id":url+"#webpage","url","name","inLanguage","isPartOf":{"@id":SITE+"#web"},"publisher":{"@id":SITE+"#org"}} plus BreadcrumbList.
- ORG fixes:
  - Replace the LinkedIn /in/ sameAs with the /company/ page once it exists; until then remove it.
  - manifest icon sizes must be real (logo-site.png is 210×200). Add a real 512×512 PNG.
- Company: {"@type":"Organization","@id":url+"#org","name","url":url,"description","logo"(if any),"address":{"@type":"PostalAddress","addressLocality":city,"addressRegion":gov_ar,"addressCountry":"EG"},"knowsAbout":sector_ar,"makesOffer":[{"@type":"Offer","itemOffered":{"@type":"Product","name":p,"url":product_url?}}…≤10],"memberOf":{"@id":SITE+"#org"} (members only),"sameAs":[website] (facx only)}. No telephone or email.
- Product: {"@type":"Product","name","description","image","url","manufacturer":{"@id":company_url+"#org"},"countryOfOrigin":"EG"}. No price, rating or review unless they are real (they aren't).
- Tender / RFQ: {"@type":"Demand","name","description","url","identifier":ref,"validFrom":published?,"validThrough":deadline,"areaServed":{"@type":"AdministrativeArea","name":gov}?,"category":cat_ar} plus BreadcrumbList. No rich result type exists, so this is for understanding only.
- News: NewsArticle {headline ≤110, datePublished, dateModified, image (item image or og-cover 1200×630), author/publisher {"@id":SITE+"#org"}, isBasedOn: source URL, inLanguage}.
- Event: {"@type":"Event","name","startDate","endDate","eventStatus":"https://schema.org/EventScheduled","eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","location":{"@type":"Place","name":venue,"address":{"@type":"PostalAddress","addressLocality","addressCountry":"EG"}},"organizer"(only if not null),"url":page,"sameAs":official url,"image"}.
- Governorate: CollectionPage, about {"@type":"AdministrativeArea","name","containedInPlace":{"@type":"Country","name":"Egypt"}}, plus ItemList.
- Zone: Place {name, geo {latitude, longitude} (skip if approx:true), containedInPlace gov}, plus ItemList.
- Hubs: CollectionPage plus ItemList (≤50 ListItem, each with a unique url).
- Project: WebPage + about {"@type":"Project"? → use "Thing" with name/description}. Awards: WebPage + Breadcrumb.
- FAQPage: off by default. Restricted rich result; visible FAQ text is enough.
- The page graph (data-seo="page") must pass JSON.parse, and the build validates it: required keys per type.

1.8 Internal linking and breadcrumbs (P1-10)
- Every page has a visible breadcrumb matching its BreadcrumbList.
- Footer: links to the top 10 sector hubs, top 10 governorate hubs, /industrial-zones/, /tenders/ and /rfq/.
- Home: cut links from 1,243 to ≤250. Link hubs instead of 574 copies of factories.html.
- Crawlable pagination everywhere ("عرض المزيد" stays as enhancement over /page/N/ links).
- Cross-links:
  - company ↔ sector/gov/zone hubs, products ↔ company;
  - tender ↔ category hub ↔ related sector hub (tender cat→sector mapping in seo/tender-cats.json);
  - zone ↔ governorate;
  - news ↔ companies or sectors named in the title (exact-name match only).
- dashboard.html links: remove them for logged-out HTML, or give them rel="nofollow". Disallow is not needed.
- HTML sitemap page /site-map/ listing all hubs.

1.9 Sitemaps (P0-4)
- /sitemap.xml is a sitemap index of /sitemaps/*.xml, each holding ≤10,000 URLs:
  pages.xml, factories-hubs.xml, factories-1..n.xml, governorates.xml, zones.xml, products.xml, tenders.xml, rfq.xml, awards.xml, news.xml, events.xml, projects.xml, export.xml, en-*.xml (same split under /en/).
- Include only URLs that return 200, are self-canonical, are indexable, and are not overridden to noindex at build time.
- `<lastmod>` comes from seo/lastmod.json, which records content-hash changes, or from real dates (news date, event dates, rfq date, tender deadline or publish change). Omit changefreq and priority, which Google ignores.
- `<loc>` values are percent-encoded. No URL with "#" or "?".
- Delete seo_files()'s current sitemap writer (seo.part.py:98–99).

1.10 robots.txt (P0-3). One source only: emit_robots(); the live file is replaced by it.
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /_seo/
Disallow: /seo-admin/
Disallow: /inbox/
Disallow: /dashboard/

Sitemap: https://madeinegyptgate.com/sitemap.xml
```
- Delete `Disallow: /register.html#form`. "#" is a comment in robots.txt, so the line blocks /register.html.
- Never Disallow a page that carries noindex. Google must be able to crawl it to see the noindex.
- Allow AI or answer-engine crawlers. The owner wants visibility "في كل محركات البحث". The admin can append lines at the edge (2.3).

1.11 Redirect and helper maps emitted by the build. These are read by the middleware, because Pages `_redirects` and `_headers` are not applied to routes served by Functions.
- site/_seo/redirects.json: {"exact": {"/about.html":"/about/", …every old x.html → new dir…, "/home.html":"/", "/index.html":"/", "/factory.html":"/factories/", "/manufacturers":"/factories/", "/manufacturers/":"/factories/", "/products/":"/products/"?, "/tenders.html":"/tenders/", "/rfqs.html":"/rfq/", "/winners.html":"/awards/", "/cities.html":"/industrial-zones/", "/region.html":"/governorates/" …}, "prefix": [["/tenders/page/","/tenders/"],["/media-center/","/news/"],["/ar/20","/news/"],["/category/","/factories/"]], "gone_rx": ["^/(ar/)?wp-(json|content|admin|includes)(/|$)","^/xmlrpc\\.php$","^/(ar/)?feed/?$"], "gone_prefix_on_404": ["/factories/","/industrial_products/","/tender-item/","/rfq/"]}
  - Unknown legacy slugs (the ~23k never imported) get 410 plus a helpful page. They are never 301'd to a hub: mass redirects to a hub are soft-404s. If the owner can export the full old directory, import it instead.
- site/_seo/hash/<type>.json: the hash-shim maps (1.3).
- site/_seo/pages.json: the admin manifest (3.2). One row per generated URL:
  {p:path, l:lang, t:type, ti:title, d:desc, h1, c:canonical, r:robots, w:words, im:imgs, ina:imgs_no_alt, s:[schema types], a:alt_lang_path, lm:lastmod, k:cluster, why:index_reason}
- site/_headers (applies to assets excluded from Functions):
```
/data/*   Cache-Control: public, max-age=31536000, immutable   (only valid because every data/*.js is referenced with ?v=<hash>; build must guarantee this)
/fonts/*  Cache-Control: public, max-age=31536000, immutable
/img/*    Cache-Control: public, max-age=2592000
/_seo/*   X-Robots-Tag: noindex
```
- site/_routes.json:
  {"version":1,"include":["/*"],"exclude":["/api/*","/data/*","/img/*","/media/*","/fonts/*","/_seo/*","/sitemaps/*","/sitemap.xml","/manifest.webmanifest","/favicon.ico"]}
  - /robots.txt stays included, so the edge can append lines and serve the IndexNow key.

1.12 Performance (P1-7, P1-8). Budgets are in A8.
- Static detail and hub pages load no data/*.js except one deferred data/site.js (header, footer, RFQ button, language banner; ≤40KB).
- The chat assistants (bot, bot-en, janna*, bassem*, captions) load only after a click on the assistant button, or on requestIdleCallback after 8s on desktop. Never on mobile before an interaction.
- All remaining scripts get `defer`. No document.write.
- data/seo.js keeps only the analytics loader (MIGSEOCFG), deferred. Verification meta moves to the edge (2.3).
- Images: new tools/img-opt.py (Pillow, plus pillow-avif-plugin if available).
  - Every jpg/png in img/ (40 files >300KB) gets WebP q78 (and AVIF) at widths 480/960/1600.
  - `<picture>` with srcset/sizes, explicit width/height, loading="lazy" below the fold.
  - Hero image: fetchpriority="high" plus `<link rel=preload as=image imagesrcset>`.
  - hero.mp4: preload="none", plus a poster. Autoplay only on ≥1024px when not prefers-reduced-motion and not Save-Data.
- Fonts: self-host Cairo woff2 (arabic+latin subsets, 400/700/800) in /fonts/ with font-display:swap, and preload 1 file. Drop the Google Fonts CSS.
- CLS: server-rendered content removes the empty `<main>` (CLS 0.57–0.81). Add aspect-ratio on cards and images, and real width/height on eafid-logo.png in the footer.
- The company page no longer loads oldfac.js (787KB), oldfacd.js (1.6MB) or oldprod.js.

1.13 Admin SEO tab cleanup
- admin.part.py "seoman" (lines ~100–150) saves to localStorage and uses UAE leftovers («مصانع الإمارات»). Replace both SEO tabs with a link to /seo-admin/.
- data/seo.js MIGSEO runtime title/canonical rewriting (site.py:181–182) must not touch canonical. Remove the canonical setter.

================================================================
2. EDGE SEO OVERRIDES (Cloudflare Pages Functions middleware + Worker admin API)
================================================================

2.1 Architecture and why
- Source of truth: D1 (the existing Worker DB, binding DB) tables seo_*. It keeps history, audit and querying.
- Every admin write compiles one JSON bundle and writes it to Workers KV namespace "madeinegyptgate-seo", key `seo:bundle`. The binding is SEO_KV in both the Worker and the Pages project. The previous bundle is kept as `seo:bundle:prev` for one-click rollback.
- Read path: functions/_middleware.js (Pages) reads only KV, plus static /_seo/*.json via env.ASSETS. It needs no auth and no D1. It costs 1 KV read per isolate per 60s, which stays within the free KV limits. Each publish is 1 KV write; the free tier allows 1,000 writes/day.
- Admin endpoints /api/seo/* live in the Worker (new worker/src/seo.js), not in a Pages Function. Reason: the Worker already has authUser() (v2 token = HMAC with AUTH_SECRET||ADVISOR_SECRET, plus a D1 session lookup, which catches revoked sessions) and isAdmin(). A Pages-side pure HMAC check would miss revocation and roles, and would mean copying the secret into a second project. Worker routes on the zone take precedence over Pages for /api/seo/*.
- Cost note for the owner: with `_routes.json`, every HTML request (users and crawlers) is a Functions invocation. The free plan allows 100k/day; Workers Paid ($5/month) gives 10M/month. If the middleware is ever removed, the overrides still apply after the next build, because the build bakes them in through tools/seo-pull.mjs.

2.2 KV schema (namespace madeinegyptgate-seo)
- `seo:bundle` (JSON, ≤5MB; the Worker refuses to publish above that):
```
{ "v": 1731900000123, "at": "2026-11-18T10:00:00Z", "by": "u1a2b3c4",
  "ov": { "<decoded NFC path with trailing slash, incl. /en/ prefix>": {
           "title"?, "description"?, "keywords"?, "h1"?, "intro"?, "canonical"?, "robots"?,
           "og_title"?, "og_description"?, "og_image"?, "jsonld"? (string, validated JSON) } },
  "rd": { "<from path>": { "to": "/new/path/" | "https://madeinegyptgate.com/…", "code": 301|302|410 } },
  "cfg": { "verify": { "google"?: "<token>", "bing"?: "<token>", "yandex"?: "<token>" },
           "robots_extra": ["User-agent: …", "Disallow: …"],
           "indexnow_key": "<32 hex>" } }
```
- `seo:bundle:prev`: the previous bundle, for rollback.
- Path key normalisation (shared helper in functions/_lib/seo-edge.js, copied into worker/src/seo.js): decodeURIComponent → NFC → ensure a leading "/" → strip the query and hash. Directory pages keep the trailing slash; files (robots.txt, *.xml) don't.

2.3 functions/_middleware.js (new; repo root /home/user/madeinegyptgate/functions/, deployed with `npx wrangler pages deploy site` from the repo root). Pure helpers go in functions/_lib/seo-edge.js so tests can import them.
```js
import { normPath, rewriteHtml, robotsWithExtra, isGone } from "./_lib/seo-edge.js";
const TTL = 60_000; let memo = { at: 0, b: null }; const assetMemo = new Map();
const EMPTY = { v: 0, ov: {}, rd: {}, cfg: {} };
async function bundle(env) {
  if (memo.b && Date.now() - memo.at < TTL) return memo.b;
  let b = null; try { b = await env.SEO_KV.get("seo:bundle", { type: "json", cacheTtl: 60 }); } catch (e) {}
  memo = { at: Date.now(), b: b || memo.b || EMPTY }; return memo.b;
}
async function asset(env, req, path) {           // /_seo/redirects.json etc., memoised per isolate for 10 min
  const m = assetMemo.get(path); if (m && Date.now() - m.at < 600_000) return m.v;
  let v = null; try { const r = await env.ASSETS.fetch(new URL(path, req.url)); if (r.ok) v = await r.json(); } catch (e) {}
  assetMemo.set(path, { at: Date.now(), v }); return v;
}
const go = (url, to, code = 301) => new Response(null, { status: code, headers: { Location: new URL(to, url).toString(), "Cache-Control": "public, max-age=3600" } });
async function gone(env, req) { const r = await env.ASSETS.fetch(new URL("/404.html", req.url));
  return new Response(r.body, { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } }); }

export async function onRequest(ctx) {
  const { request: req, env } = ctx; ctx.passThroughOnException();
  if (req.method !== "GET" && req.method !== "HEAD") return ctx.next();
  const url = new URL(req.url), path = normPath(url.pathname);
  const b = await bundle(env);
  // 1) query legacy: /?p=N (WordPress) and ?lang=en
  if (url.searchParams.has("p") && path === "/") return go(url, "/");
  if (url.searchParams.get("lang") === "en") { const m = await asset(env, req, "/_seo/en-paths.json"); return go(url, m && m[path] ? m[path] : path); }
  // 2) IndexNow key file + robots extras
  if (b.cfg.indexnow_key && path === "/" + b.cfg.indexnow_key + ".txt") return new Response(b.cfg.indexnow_key, { headers: { "Content-Type": "text/plain" } });
  if (path === "/robots.txt") { const r = await ctx.next(); return robotsWithExtra(r, b.cfg.robots_extra); }
  // 3) admin redirects (win over everything), then build redirects, then WordPress junk → 410
  const ar = b.rd[path]; if (ar) return ar.code === 410 ? gone(env, req) : go(url, ar.to, ar.code || 301);
  const R = await asset(env, req, "/_seo/redirects.json");
  if (R) { if (R.exact[path]) return go(url, R.exact[path]);
           for (const [p, to] of R.prefix) if (path.startsWith(p)) return go(url, to);
           if (isGone(path, R.gone_rx)) return gone(env, req); }
  // 4) serve, then legacy-404 → 410, then HTML rewrite
  const res = await ctx.next();
  if (res.status === 404 && R && R.gone_prefix_on_404.some(p => path.startsWith(p))) return gone(env, req);
  if (res.status !== 200 || !(res.headers.get("Content-Type") || "").includes("text/html")) return res;
  const o = b.ov[path], verify = path === "/" ? b.cfg.verify : null;
  const out = (o || verify) ? rewriteHtml(res, o || {}, verify) : new Response(res.body, res);
  out.headers.set("X-SEO-Edge", String(b.v));            // lets the admin UI confirm the edge layer is live
  if (o && o.robots) out.headers.set("X-Robots-Tag", o.robots);
  return out;
}
```
rewriteHtml(res, o, verify) in _lib/seo-edge.js uses HTMLRewriter:
- `title` → e.setInnerContent(o.title). The default html:false escapes the text.
- Set the attribute `content` on meta[name="description"], meta[name="keywords"], meta[name="robots"], meta[property="og:title"], meta[name="twitter:title"] (og_title||title), meta[property="og:description"], meta[name="twitter:description"] (og_description||description), meta[property="og:image"] and meta[name="twitter:image"]. Set `href` on link[rel="canonical"].
- `h1[data-seo="h1"]` → setInnerContent(o.h1). `[data-seo="intro"]` → setInnerContent(o.intro) (plain text).
- `script[type="application/ld+json"][data-seo="page"]` → setInnerContent(o.jsonld.replace(/</g,"\\u003c"), {html:true}).
- `head` → e.append(...) for verification metas, only on "/":
  - `<meta name="google-site-verification" content="…">`
  - `<meta name="msvalidate.01" content="…">`
  - `<meta name="yandex-verification" content="…">`
  Values are re-validated against /^[A-Za-z0-9_\-:.]{8,120}$/ and HTML-escaped.
- Failure safety: any exception → passThroughOnException serves the static page. A missing or empty bundle means the pages are served exactly as built.

Pages project config: a new /home/user/madeinegyptgate/wrangler.toml for Pages. It must not clash with worker/wrangler.toml, which lives in worker/.
```
name = "madeinegyptgate"
pages_build_output_dir = "site"
compatibility_date = "2026-10-01"
[[kv_namespaces]]
binding = "SEO_KV"
id = "<id from: npx wrangler kv namespace create madeinegyptgate-seo>"
```

2.4 Worker additions
- worker/wrangler.toml:
  - add routes { pattern = "madeinegyptgate.com/api/seo/*" } and the www variant;
  - add `[[kv_namespaces]] binding="SEO_KV" id="<same id>"`;
  - add `[vars] SITE_ORIGIN = "https://madeinegyptgate.com"`.
  - Secrets: PAGES_DEPLOY_HOOK (optional; the URL from Pages → Settings → Builds → Deploy hooks, git-connected projects only). The existing PLATFORM_KEY is used for CI pull and push.
- worker/src/index.js: `if (/\/api\/seo(\/|$)/.test(url.pathname)) return handleSeo(req, env, ctx);`, placed before the janna fallback.
- worker/migrations/0005_seo.sql (also append it to schema.sql):
```sql
CREATE TABLE IF NOT EXISTS seo_overrides (path TEXT PRIMARY KEY, fields_json TEXT NOT NULL, target_kw TEXT DEFAULT '', secondary_kw_json TEXT DEFAULT '[]', note TEXT DEFAULT '', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seo_history (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL /*override|redirect|config|import|rollback*/, ref TEXT NOT NULL, before_json TEXT, after_json TEXT, by TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS seo_history_ref ON seo_history(ref, at);
CREATE TABLE IF NOT EXISTS seo_redirects (from_path TEXT PRIMARY KEY, to_url TEXT NOT NULL, code INTEGER NOT NULL DEFAULT 301, note TEXT DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seo_config (k TEXT PRIMARY KEY, v_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seo_keywords (cluster TEXT PRIMARY KEY, target_url TEXT, target_kw TEXT, secondary_kw_json TEXT DEFAULT '[]', difficulty TEXT DEFAULT '', updated_by TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS seo_indexnow_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, by TEXT NOT NULL, count INTEGER NOT NULL, status INTEGER, body TEXT);
CREATE TABLE IF NOT EXISTS seo_gsc_daily (date TEXT, page TEXT, query TEXT, clicks INTEGER, impressions INTEGER, ctr REAL, position REAL, source TEXT /*api|csv*/, PRIMARY KEY (date, page, query));
```
- Auth in handleSeo:
  - `const platform = !!env.PLATFORM_KEY && safeEq(req.headers.get("X-Platform-Key")||"", env.PLATFORM_KEY)`. Platform callers may use only GET /export*, POST /indexnow and GET /health.
  - Otherwise `me = await authUser(req, env)`. If null → 401.
  - Allowed: `isAdmin(env, me) || me.role === "seo"`, else 403. The new "seo" role lets an SEO team member work without full admin. It is granted through the existing POST /api/admin/members {role:"seo"}; extend admin.js to accept "seo".
  - Same-origin only: no `Access-Control-Allow-Origin: *` on /api/seo.
  - Write rate limit: rateOk(env, "seo|"+me.id, 120, 60).
  - Every write adds a seo_history row (by = member id; the UI shows the email).

2.5 /api/seo/* endpoints (JSON; errors use the existing err(code, key, msg) shape)
| Method & path | Body / query | Returns |
|---|---|---|
| GET /api/seo/health | | {ok, d1, kv, bundle_v, bundle_bytes, overrides, redirects, deploy_hook:bool, indexnow:bool, gsc:false} |
| GET /api/seo/pages | ?type=&lang=&q=&issue=(title_len,desc_len,no_h1,multi_h1,no_schema,noindex,img_alt,thin,overridden)&limit≤500&offset= | {total, items:[manifest row + override + score]}. The Worker fetches SITE_ORIGIN+"/_seo/pages.json" (cf.cacheTtl 300), merges overrides from D1 and scores with the 3.3 formula |
| GET /api/seo/page | ?path= | {defaults (manifest row), override, history[≤50]} |
| PUT /api/seo/page | {path, title?, description?, keywords?, h1?, intro?, canonical?, robots?, og_title?, og_description?, og_image?, jsonld?, target_kw?, secondary_kw?[], note?, ping_indexnow?:bool} | {ok, override, bundle_v}. Upsert, then publishBundle(), then optional IndexNow for abs(path) |
| DELETE /api/seo/page | ?path= | {ok, bundle_v}. Reverts to the build defaults |
| POST /api/seo/rollback | {} | {ok, bundle_v}. Swaps seo:bundle and seo:bundle:prev; history row |
| GET /api/seo/overrides | | {items:[{path, fields, target_kw, updated_by, updated_at}]} |
| GET /api/seo/export.csv | ?kind=overrides\|redirects\|pages | text/csv, UTF-8 with BOM so Excel opens Arabic correctly |
| POST /api/seo/import | ?kind=overrides\|redirects&dry_run=1; body text/csv ≤2MB, ≤5,000 rows | {dry_run, create, update, unchanged, errors:[{line, field, msg}]}. A non-dry run applies in one D1 batch and one publish |
| GET /api/seo/redirects | ?q= | {admin:[…], build_count}. build_count comes from /_seo/redirects.json |
| POST /api/seo/redirects | {from, to, code (301\|302\|410), note} | {ok} |
| DELETE /api/seo/redirects | ?from= | {ok} |
| GET /api/seo/test | ?url= (must be on our host) | {chain:[{url,status,location}], final_status, hops}. The Worker fetches with redirect:"manual", max 5 hops |
| GET /api/seo/config | | {verify, robots_extra, indexnow_key_set, thresholds} |
| PUT /api/seo/config | {verify?, robots_extra?, thresholds?, confirm_block_all?} | {ok, bundle_v} |
| POST /api/seo/indexnow/key | {} | {key}. Generates 32 hex, stores it in config and publishes; the key file is then served by the middleware |
| POST /api/seo/indexnow | {urls?:[abs urls ≤10,000], since?: ISO (changed overrides plus the manifest lastmod ≥ since), all?:bool} | {ok, sent, status}. POST https://api.indexnow.org/indexnow {host:"madeinegyptgate.com", key, keyLocation:SITE_ORIGIN+"/"+key+".txt", urlList}. 200/202 = ok, 403 = key not served, 422 = URL not on host, 429 = throttled. Logged in seo_indexnow_log. Max 20 calls/day |
| GET /api/seo/indexnow/log | | {items} |
| POST /api/seo/rebuild | {} | {ok, triggered_at} or {ok:false, reason:"deploy_hook_not_configured"}. POSTs PAGES_DEPLOY_HOOK; 1 per 10 minutes. This is the "sitemap regenerate" trigger: sitemaps, manifest and baked overrides refresh on rebuild |
| GET /api/seo/keywords / PUT /api/seo/keywords | {cluster, target_url, target_kw, secondary_kw[], difficulty} | Seeded from seo/keywords.json on first GET if the table is empty |
| POST /api/seo/gsc/import | text/csv (Search Console Performance → Export → "Pages" or "Queries" CSV) | {rows}. Stored in seo_gsc_daily with source=csv |
| GET /api/seo/gsc | ?page=&query=&from=&to= | {connected:false, source:"csv"\|"none", rows}. API connection is phase 2 (3.8) |

Validation, in validateOverride() in worker/src/seo.js; reject with 400 and a field name:
- path: must start with "/", must not be /api/ or /_seo/, ≤512 characters. It must exist in the manifest unless `force:true` (admin only).
- title, h1, og_title: plain text, control characters stripped, 1–120 characters. The UI warns at >60, but the server allows it.
- description, og_description: 1–320. keywords ≤255. intro ≤1,200 plain text.
- canonical: absolute https://madeinegyptgate.com/… URL with no "#".
- robots ∈ {"index,follow","noindex,follow","noindex,nofollow","index,follow,max-image-preview:large"}.
- og_image: https URL ≤500.
- jsonld: ≤20KB; JSON.parse succeeds; the top level has "@context" containing schema.org; it is stored re-serialised (JSON.stringify), which removes any `</script` risk.
- Redirects:
  - `from` starts with "/", is not "/", and is not /api/;
  - `to` is a same-host path or absolute same-host https URL;
  - reject loops, and reject chains: if `to` is itself a `from`, collapse to its final target;
  - code ∈ {301, 302, 410}.
- robots_extra: each line matches /^(User-agent|Allow|Disallow|Crawl-delay|Sitemap):\s?\S*$/i. A line `Disallow: /` under `User-agent: *` needs confirm_block_all:true.
- publishBundle(env, by): reads all of seo_overrides, seo_redirects and seo_config; builds the bundle; refuses above 5MB; then `await env.SEO_KV.put("seo:bundle:prev", current)` and `put("seo:bundle", next)`. Returns v. KV is eventually consistent, so the UI says «التعديل يظهر خلال دقيقة تقريباً».

2.6 Build ↔ edge sync tools
- tools/seo-pull.mjs: GET /api/seo/export.csv?kind=overrides with X-Platform-Key (env PLATFORM_KEY) → build/seo-overrides.json, which build_static_seo() bakes in. It is skipped silently if the key is absent.
- tools/indexnow-after-deploy.mjs: diffs seo/lastmod.json against the previous commit and POSTs the changed absolute URLs to /api/seo/indexnow with X-Platform-Key. Run it after each production deploy.
- Tests: worker/test/seo.test.mjs (validation, auth 401/403, publish, rollback, CSV round-trip with Arabic) and functions/_lib/seo-edge.test.mjs (normPath on Arabic percent-encoded paths, rewrite escaping, robots extra, redirect precedence).

================================================================
3. ADMIN SEO WORKSPACE: /seo-admin/ (new seo-admin.part.py, PAGES['seo-admin'], noindex; AR first, every string T(ar, en))
================================================================
3.1 Access
- Sign in with the existing email-code flow (data/mig-api.js; token in localStorage "mig-tok").
- On load, call GET /api/seo/health. On 401, show the login. On 403, show «هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط».
- Every action is enforced on the server as well.
- Scripts: data/seo-admin.js (deferred) and data/seo-score.js (the shared scoring function, also copied into the Worker).

3.2 Tabs
1. «نظرة عامة»:
   - Counts by type: indexable, noindex (with reasons), EN pages, overrides, redirects.
   - Average score, top 20 issues, last build time (manifest lm max), bundle version.
   - Edge status: `fetch("/", {method:"HEAD"})`, read X-SEO-Edge, and compare it with bundle_v. Shows «الطبقة الطرفية تعمل – نسخة …» or «غير مفعّلة».
   - Thin companies waiting for descriptions (~885), with a CSV export so the team can contact members to enrich them.
2. «الصفحات»:
   - Virtualised table over /api/seo/pages (~9k rows). Columns: path, type, lang, title (character count coloured), description (count), H1 (0/1/n), words, images without alt, schema types, index state with reason, override badge, score 0–100, target keyword hit (✓/✗).
   - Filters: type, lang, issue, override; search. Bulk select → "export CSV".
3. Page editor drawer (row click):
   - Fields: title, description, keywords (note: «جوجل يتجاهلها؛ Yandex قد يستخدمها»), H1, intro, canonical, robots (select), OG title/description/image, JSON-LD textarea.
   - Each field shows its build default as a placeholder, with a «رجوع للافتراضي» link.
   - Live counters: title green 30–60 and amber 61–65; description green 70–160.
   - Keyword panel: target and secondary keywords (prefilled from the cluster in seo/keywords.json), with checks for the keyword in the title, the H1, the description and the first 100 words of the page (fetched from the page HTML). Arabic normalisation: alef forms, ya/alef maqsura, ta marbuta, diacritics removed.
   - SERP preview, Google desktop and mobile, RTL. Truncation by pixel width with canvas measureText ("20px Arial" title ≤600px desktop / ~2 lines mobile; "14px Arial" description ≤920px desktop / ~3 lines mobile). Breadcrumb-style URL «madeinegyptgate.com › factories › …», favicon, labelled «معاينة تقريبية».
   - Social card preview (OG 1200×630).
   - JSON-LD "تحقق" button (local parse plus required-keys check per type), plus links that open Google Rich Results Test and validator.schema.org with the live URL.
   - Buttons: «حفظ ونشر» (PUT), «حفظ + إبلاغ محركات البحث (IndexNow)», «حذف التعديل», «السجل» (history with diff and «استرجاع»).
4. «الكلمات المفتاحية»:
   - Clusters A–N: target URL, target keyword, secondaries, difficulty (L/M/H), coverage status (does the target URL's title and H1 contain it?). Editable (PUT /keywords).
   - Note: «المنافسة على الكلمات العامة (مناقصات مصر، دليل المصانع) تحتاج 6–12 شهراً؛ الكلمات الطويلة أسرع».
5. «التحويلات»:
   - Build redirect count (read-only), the admin redirects table (add/edit/delete, 301/302/410), and the CSV import/export with dry-run diff.
   - «اختبار رابط» → GET /api/seo/test shows the hop chain and warns when hops > 1.
6. «robots وخرائط الموقع»:
   - The live /robots.txt (fetched), the extra-lines editor (validated, with a warning dialog for block-all), and the sitemap index with URL counts per child (fetched and parsed client-side) and the newest lastmod.
   - «إعادة بناء الموقع» → POST /rebuild, with the honest message when no deploy hook is configured: «التعديلات شغالة فوراً على الطبقة الطرفية؛ خرائط الموقع تتحدث مع النشر القادم».
7. «التحقق ومحركات البحث»:
   - Fields for the Google, Bing and Yandex verification tokens, with help text saying which part of the meta tag to paste. A note recommends a GSC Domain property verified by DNS instead (section 4).
   - IndexNow: «توليد مفتاح», a key status check (fetches /<key>.txt), and send buttons: «الصفحات المعدّلة منذ آخر إرسال» / «رابط محدد» / «كل خريطة الموقع (حتى 10,000)». Plus the send log.
8. «ترتيب البحث» (honest section):
   - Fixed text: «لا نعرض ترتيباً تقديرياً. الترتيب الحقيقي ونقرات البحث تأتي فقط من Google Search Console وBing Webmaster Tools بعد ربطهما. لا أحد يضمن المركز الأول؛ نحن نحسّن كل ما نتحكم فيه».
   - Now: upload the GSC Performance CSV export → per-page and per-query table (clicks, impressions, CTR, average position) joined to the pages table and the keyword clusters.
   - Phase 2 (shown as «غير متصل»): Search Console API with a service-account JSON stored as Worker secret GSC_SA_JSON (the service-account email added as a Restricted user in GSC), a daily cron writing to seo_gsc_daily, and the Bing Webmaster API key (BING_WMT_KEY).
9. (P2) «الروابط والسمعة»: a citations and backlinks tracker (target, type, contact, status, link URL, date), member badge adoption, PR calendar. Needs the D1 table seo_outreach and /api/seo/outreach CRUD. Optional for the first build.

3.3 Score (0–100; data/seo-score.js, identical logic in the Worker)
| Check | Points |
|---|---|
| Title 30–60 characters | 15 (61–65 earns 8) |
| Description 70–160 | 15 |
| Exactly one H1 | 10 |
| Canonical is self, or intentional with an override | 10 |
| Robots state consistent with sitemap membership | 10 |
| JSON-LD parses and has the type's required keys | 10 |
| All images have alt | 5 |
| Words ≥ threshold (detail 80, hub 150) | 10 |
| Target keyword in title | 5 |
| Target keyword in H1 | 5 |
| Reciprocal hreflang when an EN twin exists (else full points) | 5 |
A noindex page is shown with «غير مفهرسة عمداً» and is not penalised for keyword checks.

================================================================
4. SEARCH ENGINE ONBOARDING CHECKLIST (owner and admin; exact steps)
================================================================
Before cutover (Cloudflare dashboard, zone madeinegyptgate.com):
1. Delete the live redirect rules that send /factories/*, /tender-item/*, /industrial_products/*, /rfq/*, /tenders/ and /products/ to company.html#N, tenders.html or market.html. They are not in the repo, so look in Rules → Redirect Rules, Bulk Redirects, Page Rules and Workers Routes. Otherwise they will hide the new pages.
2. Single-hop canonical host: one Redirect Rule `www.madeinegyptgate.com/*` → `https://madeinegyptgate.com/${1}` 301, with Always Use HTTPS ON. Then check that http://www → https://apex is one hop.
3. Security → Bots: make sure no "Block AI bots" or "managed robots.txt" setting rewrites our robots.txt, unless the owner decides to. Verified search bots must not be challenged: check Security → Events for Googlebot or Bingbot challenges.
4. Caching → Configuration → Crawler Hints: ON. This is Cloudflare's built-in IndexNow to Bing, Yandex, Seznam and Naver.

Google Search Console (search.google.com/search-console):
1. Add property → **Domain** → madeinegyptgate.com → choose the DNS provider "Cloudflare" for automatic TXT insertion, or copy the TXT `google-site-verification=…` into Cloudflare DNS (Type TXT, Name @) → Verify.
2. Sitemaps → submit `https://madeinegyptgate.com/sitemap.xml`.
3. URL Inspection → "Request indexing" for: /, /factories/, /tenders/, /rfq/, /industrial-zones/, the top 5 sector hubs and the top 5 governorate hubs. The daily quota is small (~10), so spread it over days.
4. Pages report: watch "Page with redirect", "Not found (404)", "Duplicate without user-selected canonical", "Crawled – currently not indexed". Export weekly and upload the Performance CSV in the workspace (tab 8).
5. Settings → Users: add the SEO team members. Restricted is enough for them.
6. Do NOT use the Change of Address tool (same domain).

Bing Webmaster Tools (bing.com/webmasters):
1. Sign in → "Import from Google Search Console". This verifies the site and imports the sitemaps.
2. Sitemaps: confirm sitemap.xml is listed.
3. Settings → API access → generate an API key. Keep it for phase 2 (BING_WMT_KEY).
4. URL Submission shows IndexNow pings from Crawler Hints and our /api/seo/indexnow.
Bing also feeds DuckDuckGo, Yahoo, Copilot and ChatGPT search.

Yandex Webmaster (webmaster.yandex.com):
1. Add site https://madeinegyptgate.com → verification by meta tag: paste the content value into the workspace field "Yandex" → Save → Check. The DNS TXT option also works.
2. Indexing → Sitemap files → add sitemap.xml.
3. Site information → Regional settings → Egypt.
4. IndexNow is already covered by Crawler Hints and our key.

IndexNow key (our own pings):
1. Workspace → «التحقق ومحركات البحث» → «توليد مفتاح».
2. Open https://madeinegyptgate.com/<key>.txt. It must show the key as plain text.
3. Click «أرسل كل خريطة الموقع» once after cutover. After that, edits ping automatically when chosen, and tools/indexnow-after-deploy.mjs runs after each deploy. Google does not use IndexNow; it relies on sitemaps and Search Console.

Google Business Profile (business.google.com):
1. Add business with the real-world name used on the office signage (e.g. «منصة صنع في مصر – الجمعية المصرية للتنمية الصناعية»). Category «Non-profit organization» or «Association / organization».
2. Address exactly: الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، مدينة السادس من أكتوبر، الجيزة. It must be a staffed office, not a virtual one.
3. Phone 02 38346757, website https://madeinegyptgate.com/, hours.
4. Verify (video or postcard as Google offers).
5. Add logo, photos and a weekly post (new tenders, events).
6. Keep name, address and phone identical on the site, in the JSON-LD ORG, and in Bing Places (import from GBP) and Apple Business Connect.

Entity consistency (same week):
- Rename the social profiles to «منصة صنع في مصر | Made in Egypt Gate».
- Create a LinkedIn **Company Page** and replace the personal /in/ URL in ORG.sameAs.
- eafid.org links to madeinegyptgate.com.
- Optionally a Wikidata item for the association and the platform, with sources. No self-written Wikipedia article.

================================================================
5. ACCEPTANCE CHECKS (tools/seo_check.py runs 1–7 and 9 on site/ and a preview URL; failures block the release)
================================================================
A1 URLs:
- 0 internal `href` matching /(company|article|event|offer|city|region|project|winner|entity|lead|opportunity|export-market)\.html#/ outside the shim pages.
- 0 `href="home.html"`.
- Every manifest path exists as <path>/index.html.
A2 Head (every indexable page):
- `<title>` appears before `</head>`.
- Exactly 1 title, 1 meta description (70–170 characters), 1 meta robots, 1 canonical = its own absolute URL.
- Exactly 1 `h1[data-seo=h1]`, and 1 `script[data-seo=page]` that JSON.parses and has the required keys for its type.
- `<!doctype html>`, `<html lang>`, charset and viewport present, including on index.html.
- No `claude:viewport-fit-sides`. No error-overlay script unless MIG_DEBUG.
A3 Content and honesty:
- Words ≥ the threshold for every indexable page.
- 0 occurrences of /26[\s,.]?(k|000|ألف)/ on any page.
- 0 Egyptian mobile numbers (/\b01[0125]\d{8}\b/) and 0 emails on /factories/, /industrial_products/, /rfq/ and /tender-item/ pages (the platform's own footer contact is whitelisted by selector).
- facx pages contain «بيانات من مصادر عامة».
- No VideoObject. No pages generated from MIG.LEADS or sample projects.
A4 Sitemaps:
- sitemap.xml is a valid sitemapindex. Every child file has ≤10,000 URLs and valid XML.
- No duplicates, no "#", no "?".
- Every loc is indexable in the manifest. Not all lastmod values are equal.
- Total URLs is about 3,500–5,500 AR plus EN (it was 46).
A5 hreflang:
- For every page with an alt, the twin exists and links back. x-default = the AR URL.
- EN pages have lang="en" dir="ltr", a self canonical, and an Arabic character ratio <5% in main.
A6 robots:
- No "#" in rules.
- urllib.robotparser allows Googlebot and Bingbot on 100 random sitemap URLs plus /register/.
- A Sitemap line is present.
- On the live site, /robots.txt is byte-equal to the build output plus the admin extras.
A7 Redirects (preview, then production, using curl -sI without following):
- 100% of oldfac[7], oldprod[5], oldtend[11] and oldrfq[8] URLs return 200 at the same path (slug_mode legacy) or a single 301 to a 200 (hash mode).
- /about.html → 301 /about/ → 200.
- http://www… → one hop to https://madeinegyptgate.com/…
- /?p=196 → 301 /.
- /manufacturers → 301 /factories/.
- /ar/wp-json/wp/v2/products/1 → 410.
- /factories/no-such-slug/ → 410.
- /tenders/page/132/ → 301 /tenders/.
- /?lang=en → 301 /en/.
- No chain longer than 1 hop across the whole redirects.json and admin table.
A8 Performance (Lighthouse mobile, preview, served with Pages compression; median of 3):

| Page | LCP | CLS | TBT |
|---|---|---|---|
| Company page, sector hub, tender page, /governorates/cairo/ | ≤ 2.5s | ≤ 0.1 | ≤ 200ms |
| Home | ≤ 3.0s | ≤ 0.1 | ≤ 300ms |
| /en/ pages | ≤ 3.0s | — | — |

  - Also: SEO = 100, and i18n-en.js is not requested on any static page.
  - Transfer on detail pages ≤ 250KB excluding images.
A9 Edge overrides (preview with KV bound):
- PUT a title override on /factories/ → within 90s `curl -s /factories/` shows the new `<title>`, `X-SEO-Edge` equals the returned bundle_v, and og:title and twitter:title follow.
- Set robots noindex,follow → the meta changes and the `X-Robots-Tag` header is present.
- DELETE → the original title returns.
- A title of `</title><script>alert(1)</script>` is rendered escaped.
- Invalid JSON-LD → 400. No token → 401. A member without admin or seo role → 403. X-Platform-Key on PUT → 403.
- Rollback restores the previous bundle.
- With the KV binding removed, the pages are served unchanged (fail-open).
- The verification metas appear only on "/".
- /<indexnow-key>.txt returns the key. A test IndexNow POST returns 200 or 202 and is logged.
A10 Unicode paths (decides slug_mode):
- On a Pages preview deployment, GET /factories/تشكيل-المعادن-في-السادات/ in both the percent-encoded upper-case and lower-case forms returns 200 with the right H1.
- If not, ship slug_mode "hash" and re-run A7.
A11 Structured data:
- Google Rich Results Test and validator.schema.org on 1 URL per type (company, product, tender, rfq, news, event, zone, governorate, sector hub, home) → 0 errors. Event and NewsArticle are detected as eligible.
- Done manually; record the screenshots in the release notes.
A12 Workspace:
- The /seo-admin/ page count equals the manifest rows. Filters work.
- The SERP preview truncates long Arabic titles.
- CSV export, then re-import with dry_run → 0 changes.
- The rank tab shows «غير متصل» and accepts a GSC CSV.
- /seo-admin/ carries noindex and is disallowed.
A13 Post-launch monitoring (owner, weeks 1–8; not a release gate):
- The GSC Pages report shows indexed pages rising toward the sitemap count.
- "Page with redirect" stays limited to the html→dir and legacy patterns.
- The brand query and «مصانع في مصر للتصدير موردين» keep their #1 position. /manufacturers was 404 and now 301s.

IMPLEMENTATION ORDER for the build workflow:
1. 1.2 head fix and the 1.10 robots fix.
2. 1.1, 1.3–1.5, 1.8, 1.9 and 1.11 (static pages, maps, sitemaps), plus 2.3 middleware redirects only. Before cutover, run checklist §4 items 1–2.
3. 1.12 performance and 1.7 JSON-LD.
4. 1.6 EN static.
5. 2.4–2.6 Worker /api/seo plus KV, and the rewrite part of 2.3.
6. Section 3 workspace.
7. Section 4 onboarding, then A13 monitoring.

Key existing code references:
- /home/user/madeinegyptgate/site.py: lines 3, 143, 181–182, 239–255, 335 and 349–352.
- /home/user/madeinegyptgate/seo.part.py: lines 5–17, 20–66, 74–101.
- /home/user/madeinegyptgate/admin.part.py: lines 48–49, 100–190.
- /home/user/madeinegyptgate/site/data/seo.js
- /home/user/madeinegyptgate/site/data/i18n.js
- /home/user/madeinegyptgate/worker/src/auth.js: authUser, signSession, v2 token.
- /home/user/madeinegyptgate/worker/src/common.js: lines 160–161, isAdmin and ADMIN_EMAILS.
- /home/user/madeinegyptgate/worker/src/admin.js: auth pattern to copy.
- /home/user/madeinegyptgate/worker/src/index.js: line 92, router.
- /home/user/madeinegyptgate/worker/wrangler.toml
- /home/user/madeinegyptgate/inbox.part.py: admin page pattern using MIGAPI.

Data facts used (counted from site/data):
- oldfac: 3,000 members with 3,000 unique legacy slugs, all under /factories/; 885 have descriptions shorter than 200 characters.
- facx: 99. oldprod: 193. oldtend: 438 (44 raw categories). oldrfq: 35. zones: 64.
- REAL: news 122, events 18, awards 20, tenders 61, tenders_intl 62.
- MIG.PROJECTS_REAL: 65 (real). MIG.LEADS: 50 (sample). offers: 102.