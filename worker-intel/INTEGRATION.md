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
`{count, results:[{title_ar, entity, market, deadline, url, kind}], text}`; `text` is short Egyptian Arabic, no URLs, digits.
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
