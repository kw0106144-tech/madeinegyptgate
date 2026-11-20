# migate-intel — integration steps (for the main session)

Worker `migate-intel` is deployed on **https://migate-intel.daily-spoonbill.workers.dev** (no zone routes yet).
Bindings: D1 `migate-intel` (f6d7f706-a088-4033-bf88-0d7ad1da529a), KV `MIGATE_INTEL_KV` (0f13a8cf3dd24a26ae79c3ec3a5ff357,
binding `KV`), Workers AI `AI`, secret `PLATFORM_KEY`. Crons: `0 */2 * * *` (A), `30 */6 * * *` (B), `15 3 * * *` (C + daily jobs).

## 1. Attach the routes (after review)
Uncomment in `worker-intel/wrangler.toml` and `npx wrangler deploy` (or add them in the dashboard):
```
madeinegyptgate.com/api/intel/*        www.madeinegyptgate.com/api/intel/*
madeinegyptgate.com/intel/*            www.madeinegyptgate.com/intel/*
```
English pages live under `/intel/en/…` (not `/en/intel/…`) so no change to the site Worker is needed.

## 2. Site shell + widget (do not hand-edit src/shell.js)
The /intel/ pages take the site's header, footer and `<head>` assets from the site itself at runtime: `src/siteshell.js` reads
`https://madeinegyptgate.com/tenders/` (AR) and `/en/tenders/` (EN), cuts them with `src/shell-extract.js` (the same rules
`tools/make-shell.mjs` uses), and keeps the result 1 hour (per isolate in memory + per data centre in the Cache API). So a site
build that renames its content-hashed assets (`assets/seo-<hash>.js/.css`, `data/janna-welcome.js?v=…`) reaches /intel/ within
the hour with no Worker deploy. On any error, a page that does not look like the site, or no answer within 1.5 s, the page uses
the baked `src/shell.js` (and does not ask the site again for 60 s). `wrangler.toml` sets `global_fetch_strictly_public` so that
this same-zone fetch goes through the front door like a visitor's (without it, it would go to the zone's origin record).
Optional vars: `SHELL_ORIGIN` (read the shell from another origin, e.g. a preview), `SHELL_RUNTIME = "0"` (baked shell only).
`/intel/__*` is internal (the cache keys) and always answers 404.
To refresh the fallback after a site build: `cd worker-intel && node tools/make-shell.mjs [path/to/site] && npm test && npx wrangler deploy`
(optional now; the live pages no longer depend on it).

Copy `worker-intel/site-snippets/intel-live.js` → `site/assets/intel-live.js` and `intel.css` → `site/assets/intel.css`, then add
before `</head>` on the pages below:
```html
<link rel="stylesheet" href="/assets/intel.css"><script src="/assets/intel-live.js" defer></script>
```
Containers (the box stays hidden when the API fails or has nothing — no placeholders):
| page | container |
|---|---|
| `/tenders/` (+ `/en/tenders/`) | `<div data-intel="tenders"></div>` (Egypt only: add `data-market="eg"`) |
| `/projects/` | `<div data-intel="projects"></div>` |
| `/project-news/` | `<div data-intel="projects" data-days="2"></div>` |
| `/news/` | `<div data-intel="news"></div>` |
| `/rfq/` | `<div data-intel="rfq"></div>` (shows only when RFQs exist) |
| opportunity page | `<div data-intel="tenders" data-limit="4"></div>` |
| home | `<div data-intel="tenders" data-limit="5"></div>` and `<div data-intel="news" data-limit="5"></div>` |
Optional attributes: `data-market` (eg, sa, gcc, arab, africa, eu, …), `data-sector` (AR/EN name or 1–38), `data-limit`, `data-days`.

## 3. robots.txt and nav
- `site/robots.txt`: add `Sitemap: https://madeinegyptgate.com/intel/sitemap.xml`
- Main nav (AR): `<a href="/intel/">مركز المعلومات</a>`; (EN): `<a href="/intel/en/">Intelligence</a>` — then re-run make-shell.

## 4. Bassem (Anam SERVER_WEBHOOK tool)
`POST https://madeinegyptgate.com/api/intel/tool` (JSON) body `{action:"search"|"brief", query?, kind?, market?, sector?, days?}` →
`{count, results:[{id, title_ar, entity, market, market_name, country, deadline, value, currency, url, page, open_url, kind}], text}`;
`text` is short Egyptian Arabic, no URLs, digits. `page` = `open_url` = the item's own page on the Information Center (the screen opens it);
`url` = the official link (never read aloud).
One result (owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي مش لاقي التفاصيل» / «مش قادر اقرء الملف ال بي دي اف»):
- `{action:"item", id}` → `{found, id, item:{…every field…}, results:[the item], text, note}`: buyer, country, deadline, status, value or
  «القيمة مش منشورة في المصدر», what is requested (the Arabic summary, else the source's excerpt), source. `id` = the 11-character id,
  its `/intel/…-<id>/` page or its official link; no id + a `title` → `found:false` with up to 3 `candidates`. Hidden items are not found;
  a duplicate answers with its primary.
- `{action:"doc", id}` → `src/doc.js` reads ONLY that item's own stored `url` (+ at most one document that page / OCDS release links to on
  the same official site): https, port 443, public DNS names only (no IP literals, localhost, .local/.internal/…, nor this zone), every
  redirect re-checked (≤ 3; a sign-in page → `login`), robots.txt respected, one 12 s deadline for all its fetches, size caps (PDF 10 MB,
  DOCX 8 MB, HTML 3 MB). PDF / DOCX → Workers AI `env.AI.toMarkdown` (images not converted), 1 unit of `AI_DAILY_LIMIT`; the enrichment
  and the titles pass leave the last `AI_DOC_RESERVE` units (wrangler.toml: 25) for these reads; without AI a local reader (simple-font
  PDF text, DOCX XML; a scanned / CID-font PDF is flagged, never guessed); HTML is read locally. → `{ok, doc:{type, pages, lang, via, from},
  sections:{found, missing}, key_lines, excerpt (≤ 6,000 characters, contacts and links removed), flags, text, note}`; `ok:false` + a flag
  (unreachable, timeout, login, forbidden, robots, gone, busy, too_large, unsupported, not_https, unsafe_url, scanned, unreadable,
  encrypted, empty, no_document) with an honest Arabic `text`. Cached in KV `doc:v1:<id>:<hash of url>` 12 h (a failure 30 min, a timeout 5 min).
  Its own rate limit: `DOC_RATE_PER_MIN` (default 10) per IP.
Rate limit 30/min/IP. Optional: `wrangler secret put TOOL_KEY` and send header `X-Intel-Key` from the Anam tool.
Suggested tool description: «ابحث في مركز معلومات المنصة (مناقصات، طلبات أسعار، مشاريع، أخبار من المصادر الرسمية). استخدم action=brief لملخص آخر 24 ساعة».

## 5. Admin (Control Center, deploy 2)
`POST /api/intel/admin/{hide,unhide}` `{id}` · `/source-enable|source-disable` `{source_id, reason?}` ·
`/run` `{group?|groups?|source_ids?, limit?, stage?: "all"|"enrich"|"titles"|"news"|"daily", enrich?, ai_limit?, force?}` · `/reenrich` `{id|ids}` — header `X-Platform-Key`.
`stage: "titles"` runs only the titles pass (`limit` = AI units); `stage: "news"` re-checks the stored news against the relevance
rule now (it otherwise runs once per rule version, at the first cycle after a deploy). Unhiding an item the rule unlisted
(`hidden=2`) tags it `kept`, and the rule never unlists it again.
`source_ids` runs only enabled sources (disabled ones are reported as `skipped_disabled`, never fetched); `force` runs sources that
are not due yet, on the real clock. `reenrich` re-runs the AI enrichment of named items under the current guards (counts against
`AI_DAILY_LIMIT`; when the cap is reached it re-checks the stored AI text without a model call and re-queues the item); it never
changes `hidden` — unhide separately.
Monitoring: `GET /api/intel/health` (last runs, failing sources, sources with no new item for 2 days, AI budget).

## 6. Sources
Registry: `worker-intel/seeds/sources.json` → `node tools/seed-sql.mjs` → `npx wrangler d1 execute migate-intel --remote --file=seeds/sources.sql`
(idempotent; never re-enables a source an admin or the auto-disable rule switched off). Disabled official portals are listed
on `/intel/sources/` as links with the honest reason (no open feed, terms, bot walls).

## 7. Per-source adapters (src/adapters/*.js)
Sources whose pages the declarative parsers cannot express have an adapter: `ADAPTERS[source_id] = { parse(text, src) → raw records,
fetch?: { pages, headers, timeout_ms, retries, backoff_ms, follow_next }, detail?: { parse(html, rec), max, kinds } }`, merged in
`src/parsers.js` (each module imported statically; `test/integration.test.mjs` fails if a module in the folder is not). A source
with an adapter is always parsed by it, whatever its `parser` value (`"adapter"` or `"json"`). The seed's `mapping.pages` /
`mapping.accept` win over the adapter's hints. A later page that fails keeps the pages already read (`partial` in the run log).
`detail` fetches at most `max` notice pages per run (robots.txt + gate) and caches what it finds in KV for 30 days (EEAA closing
dates, IDA tender subjects). Dedupe never folds two notices of the same source by title (lots, numbered tenders);
`mapping.title_dedupe:false` makes a source URL-only. A new adapter source: add the module, its seed row, then
`node tools/seed-sql.mjs`, apply the SQL, deploy, and `POST /api/intel/admin/source-enable` (a seed never re-enables a source).


## 8. Titles, news relevance, 24-hour counts (bug sweep 2026-11-19)
- **Titles pass** (`src/enrich.js translateTitles`): before the full enrichment, each cycle translates the missing page-language
  titles of the waiting rows the pages show first (alternately by relevance and by date), 9 per model call, under the same guards
  (Arabic letters, minimum length, every number present in the original title, no URLs / contacts). A call is charged 1 unit per
  3 titles against `AI_DAILY_LIMIT`; a cycle gives the titles pass up to `AI_TITLES_SHARE` (default 0.67) of `AI_PER_RUN`. Rows done this way have `ai=3` and
  stay in the full-enrichment queue. Until a row has a translation, the pages show its original title with `lang`/`dir` and the
  label «بلغة المصدر – ما اتترجمش لسه» / "Source language – not translated yet"; the API sets `title_is_original`.
  `/api/intel/health` totals add `ai_titles_only` and `news_unlisted`.
- **News relevance** (`src/terms.js newsRelevant`): a news item from a news source is stored only when its headline names a sector
  product (the search synonym groups) or an industry / trade / investment / economy word, and is not a gold / retail-food price
  list, pilgrimage, sports, entertainment or weather item. Official bodies' own news (IDA, SCZONE) is not filtered;
  `mapping.news_filter: false` turns it off for a source. Already-stored rows: see `newsSweep` (§5).
- **«خلال 24 ساعة»** on /intel/ counts the rows of the section's own query (same hidden / dup / kind / window), first seen in the
  last 24 hours (`queryItems(..., { freshSince })`), so it is never more than the section total.

## 9. «ابعتلي» mail packs — POST /api/intel/mailpack (binding-only, no secret)
When a member tells Bassem «ابعتلي …» about Information Center items, janna-lookup (worker/src/notify-items.js) asks this Worker for each
item's mail pack and builds the e-mail itself: the item's card from the stored data, its page links, its official link and, when it can be
downloaded, the official PDF / DOCX to attach.

**Who can call it.** The endpoint answers only when the request URL's hostname is `mailpack.binding.invalid` (`PACK_HOST`, src/api.js).
Any other hostname gets exactly the 404 of an unknown path, before the rate limiter (no KV write). janna-lookup calls it through its
service binding `INTEL` (`[[services]] binding = "INTEL", service = "migate-intel"` in worker/wrangler.toml) with
`new Request("https://mailpack.binding.invalid/api/intel/mailpack", …)`. Why that is safe without a secret:
- a service binding hands this Worker the Request exactly as the caller built it, URL included; only Workers of this Cloudflare account
  whose own configuration names `migate-intel` in `[[services]]` can do that — the account owner decides that, in reviewed config;
- public traffic reaches this Worker only through its zone routes (`madeinegyptgate.com` / `www.madeinegyptgate.com`) and its
  `workers.dev` name; Cloudflare builds `request.url` from the hostname the request was routed by, so it is always one of those;
- `.invalid` is reserved and never resolves (RFC 6761), and it is no Cloudflare zone, so a request with `Host: mailpack.binding.invalid`
  (or any `X-Forwarded-Host` trick) is never routed to this Worker; headers are not read for this check at all;
- other Workers' `fetch("https://mailpack.binding.invalid/…")` fails at DNS; a Worker of another account cannot bind to this one.
Even so the endpoint takes an item id only (never a URL), returns only public data (contacts and links stripped from summaries) and
public documents of official sites, and is rate-limited.

**Request** `{"id": "<11 chars>", "file": true, "max_bytes": 8000000, "budget_ms": 20000}` — `file` defaults to true; `max_bytes` is
clamped to 100 KB .. 8 MB (janna-lookup sends 8 / 6 / 4 MB for 1 / 2 / 3 files on Resend, 4 MB on Brevo); `budget_ms` to 2 .. 25 s (default
8 s; janna-lookup sends 20 s: a real 2.4 MB Kenya PPIP Tender Document took 12.3 s to its last byte, read from outside Kenya on 2026-11-20).
Unknown keys are ignored.

**200** `{ok, id (the primary when the id is a duplicate), requested, card, links, file, reason, reason_size?}`:
- `card`: kind, kind_label (+ _en), market, title (+ title_en, title_orig, title_is_original), entity, country, market_name (+ _en), sector (+ _en),
  published, deadline, status, value, currency, currency_ar, summary (+ summary_en; contacts and URLs stripped), summary_original, source_name (+ _en);
- `links`: `page` / `page_en` = the short `https://madeinegyptgate.com/intel/<seg>/<id>/` and `/intel/en/…` (the item pages 301 them to the
  canonical URL, any kind segment works), `source` = the stored official link, `doc` = the file attached, or the file that failed;
- `file`: `{name, type: application/pdf | …wordprocessingml.document, size, b64, from: known | hint | official | linked}` or null.
Other answers: 400 `bad id` / `bad json` · 404 `{ok:false, found:false}` · 405 `method` · 410 `{ok:false, found:false, gone:true}` (in
`intel_gone`, or hidden by an admin; an unlisted news item, hidden=2, still answers) · 429 `rate limited`. Every answer is no-store.

**The file** (src/doc.js `itemFile`, no AI, no text extraction): only for tenders, RFQs and projects (news: `reason: "kind"` — the RSS
sources' terms allow headline + snippet + link only); never for a source whose `mapping.attach` is false (`source_opt_out`). Candidates,
each fetched once and only on the official site of the item's stored link (siteOf): the doc cache's known PDF / DOCX (`doc:v1:…`, Bassem's
document reads) → the ingest hints `dochint:<id>` (and of its primary) → the stored link → when that is a notice page / an OCDS release,
its ONE best document (with > 1.5 s left). Every hop through `fetchDoc`: https only, port 443, a public DNS name (no IP literal, no
localhost / .local / .internal / …, not this platform's zone, not workers.dev / pages.dev), ≤ 3 redirects each re-checked, a sign-in page
→ `login`, robots.txt respected (cached 24 h per host), the budget, the size cap (Content-Length first, then while streaming). Only bytes
that ARE a PDF or a DOCX (magic bytes) are returned; the name is the source's own when it is plain ASCII, else `document-<id>.pdf|docx`.
`reason` codes: not_requested, kind, source_opt_out, no_document, page_only, login, forbidden, robots, gone, busy, timeout, unreachable,
too_large (+ reason_size), unsupported, not_https, unsafe_url, too_many_redirects.

**Ingest hints** (src/engine.js `storeDocHints`): an adapter record may carry a non-enumerable `doc_urls` [{u, t}] — today Kenya PPIP
(src/adapters/json.js `keDocs`: documents[] → the Tender Document, then the Tender Notice, https://tenders.go.ke/….pdf|.docx only; reads
url, type.description and deleted_at, never created_by / updated_by). After each successful run of the source, the stored items' hints go
to KV `dochint:<id>` = `{"h":[{"u","t"}]}` (60 days; an unchanged value is not written again). They exist for the items the runs after
this deploy see.

**KV keys**: `dochint:<id>` (above) · `rlp:<CF-Connecting-IP or 0>:<minute>` the limiter (`PACK_RATE_PER_MIN`, default 60; a binding call
has no CF-Connecting-IP: one shared bucket). No D1 change.

**Deploy order**: any. An older janna-lookup never calls it; with an older migate-intel the pack answers the plain 404 and janna-lookup
falls back to `GET /api/intel/item/<id>` through the same binding (card + links, «جلب الملفات من مركز المعلومات مش شغال دلوقتي»).

