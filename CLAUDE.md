# CLAUDE.md — منصة صنع في مصر · Made in Egypt Gate (madeinegyptgate.com)

Operating manual for an AI coding agent (Claude Code) working on this repository. Read all of it before you change anything.
When this file and older notes disagree, the code and this file win. `DEVELOPER-GUIDE.md` (root) and `tools/DEVELOPER-GUIDE.md`
are the first hand-off guides and are out of date (they say there is no admin panel and describe a demo login that no longer
exists). Current runbooks: `deploy/README-DEPLOY.md` (Arabic), `worker/README.md`, `worker-intel/INTEGRATION.md`, `docs/janna/*.md`.
The owner's own guide is `OWNER-GUIDE-AR.md`.

> **`main` is production.** Every commit that lands on `main` is built, checked and deployed to the live site by GitHub Actions
> (section 4). Work on a branch and open a pull request. Commit straight to `main` only when the user explicitly asks for it,
> and only after the checks in 3.7 pass.

---

## 0. The rules on one screen

1. **Browser JavaScript is ES5.** No `let`/`const`, arrow functions, template literals, classes, `async`/`await`, spread,
   destructuring, `?.`, `??`, `for…of`. Server code (`worker/`, `worker-intel/src`, `functions/`) is modern ES modules. Check: 3.5.
2. **Arabic first, an English twin for every visible string** (2.2). An English page that shows Arabic, or a generated page that
   loses its `/en/` twin, is a bug.
3. **No secrets in the repository.** Not in code, `wrangler.toml` `[vars]`, `data/*.js` (they are public files), tests, docs,
   commit messages or CI logs (2.3).
4. **Never touch production data.** No `wrangler d1 execute --remote`, no SQL against `migate-db` or `migate-intel`, no writes to
   KV or R2, no POST/PUT/PATCH/DELETE against the live `/api` (2.4).
5. **Migrations never run automatically.** Only through the manual `d1-migrate` workflow, backup first (2.4, 5.6).
6. **Privacy.** No factory phone, WhatsApp number or e-mail in public output. Janna's visitor memory is linked to a member only
   by that member's own full sign-in. The knowledge bank reaches the personas only when the team approved the entry (2.5).
7. **Data honesty.** No invented numbers, rows, prices, ratings, sources or "sample" content. Counts are computed from the data (2.6).
8. **The owner's legal text** (owner/operator lines, registration numbers, legal center) changes only on the owner's explicit
   instruction (2.7).
9. **Never deploy from a coding session.** No `wrangler deploy`, `wrangler pages deploy`, `wrangler secret …`, `wrangler rollback`,
   `deploy/deploy.sh production|preview|release|worker|db|domains|dns|cutover|rollback|secrets --set`. CI deploys; the owner holds
   the keys. Never change a workflow so that a branch, a tag or a pull request gets `CLOUDFLARE_API_TOKEN` or deploys (no new
   `on:` branches or `pull_request` triggers on the four workflows; `ci_ref_guard` and the `refs/heads/main` token condition stay).
10. **The owner's old system is untouchable.** `/panel.html`, `/login.html`, `/api/index.php*`, `/data/auth.js`, `/data/me.js`,
    `/data/egadm.js` (`deploy/legacy-live.txt`) are answered by the Worker `mis-egypt` from Hostinger. Never build them, route them
    or "fix" them here (2.8).

---

## 1. Architecture map

### 1.1 What runs where

Cloudflare account `88c77c2b7595dd0ce510270175f69143`, zone `madeinegyptgate.com` (apex and `www`).

| Part | On Cloudflare | Source here | Deployed by |
|---|---|---|---|
| Static site, edge SEO layer, `/api/seo/*` | Pages project `madeinegyptgate` (direct upload, production branch `main`). Bindings in `deploy/wrangler-pages.toml`: KV `SEO_KV`, D1 `DB` (read only, for sign-in checks) | `site.py` + part files + `data/` `img/` `media/` `seo/` → build; `functions/` | `deploy-site` |
| Platform API: Janna, Bassem, accounts, inquiries, meetings, WhatsApp, Control Center, payments, `/data/overlay.js`, `/media/u/*` | Worker `janna-lookup`. One route per API family on both hosts (`worker/wrangler.toml`), cron `*/15 * * * *`. D1 `migate-db`, R2 `migate-media`, KV `SEO_KV` (writes `acc:*` keys only), service binding `INTEL` → `migate-intel` («ابعتلي» mail packs, the developer panel's intel probe; no secret) | `worker/` | `deploy-worker` |
| Intel centre `/intel/` + `/api/intel/*` | Worker `migate-intel`: D1 `migate-intel`, KV, Workers AI, crons `0 */2 * * *`, `30 */6 * * *`, `15 3 * * *`. Its zone routes were attached outside `worker-intel/wrangler.toml` (the routes block there is commented out on purpose; leave it) | `worker-intel/` | `deploy-intel` |
| The owner's old admin | Worker `mis-egypt` → Hostinger PHP | not here (read-only copies in `docs/janna/legacy-live/`) | never |
| WAF block list refresher | Worker `migate-shield` (cron, no routes) | `worker-shield/` | not by CI |
| Fallback host from the deploy-1 days | Worker `migate-site` (site in R2, no routes) | `worker-site/`, `deploy/cutover-worker.sh`, `deploy/rollback-worker.sh` | not by CI (emergency only) |
| Live video personas (Janna AR/EN, Bassem) | Anam | `anam/` = prepared changes, **not applied** (`anam/APPLY.md`) | never by CI; every Anam write needs the owner's OK |

Production data: D1 `migate-db` (`f86e00bb-9739-4985-a149-3dddb45b2b42`: members, sessions, inquiries, the `cc_*` Control Center
tables, Bassem/Janna memory, invoices), D1 `migate-intel` (`f6d7f706-a088-4033-bf88-0d7ad1da529a`), R2 `migate-media`, KV `SEO_KV`
(`b321fb348f3447179c99b4380952e5ac`: `seo:bundle` is written only by `/api/seo/*`, `acc:*` only by the Worker).

How a request is served: Worker routes are more specific than the Pages site, so they win. Every `/api/<family>` is listed one by
one; there is **never** a catch-all `/api/*` route, because `/api/seo/*` is a Pages Function (`worker/test/integ-worker.test.mjs`
and `deploy/deploy.sh worker-config` fail on one). `mis-egypt` keeps exactly the six paths of `deploy/legacy-live.txt`. Everything
else is the Pages project, where `functions/_middleware.js` runs first on every request: legacy URL redirects, 410s for WordPress
junk, admin SEO overrides from KV, the `?lang=en` hop, and the security headers (Pages does not apply `_headers` to Function
responses).

### 1.2 Repository map

| Path | What it is |
|---|---|
| `site.py` | The site generator, the entry point of every build |
| `*.part.py`, `home2.part.html`, `market.part.html`, `dash.part.html` | One file per page or section (table in 1.3) |
| `factory-profile.html` | Read by `site.py` (base CSS + the old sample profile). Not a content source |
| `seo_build.part.py` | The static SEO generator (about 520 KB): data pages, hubs, Arabic pages + `/en/` twins, sitemaps, `robots.txt`, `_headers`, `_routes.json`, `_redirects`, `/_seo/*.json`, hash shims, the installable app's files and head tags (1.11), and its own validation |
| `seo_fprof.part.py` / `seo_pprof.part.py` | Rich factory profile pages / product pages (hooks of the SEO build) |
| `seo_app.part.py` | The app download page `/app/` + `/en/app/`, the APK channel `/downloads/android/` and `/.well-known/assetlinks.json` (hook of the SEO build, 5.7) |
| `downloads/android/` | The Android APKs offered on `/app/` + `latest.json`: written by `tools/publish_apk.py`, committed (5.7). Never a debug APK |
| `seo.part.py` | Per-page meta (`SEO` dict: description, keywords, schema type, breadcrumb, change frequency, priority) and the Organization/WebSite JSON-LD |
| `seo/` | `config.json` (clean URLs `static_paths`, `app_paths`, `shim_keys`, `noindex_static`, thresholds, `en` gate), `sectors.json`, `governorates.json`, `keywords.json`, `tender-cats.json`, `company-media.json` (photo index of the profiles), `lastmod.json` (build state, 2.9) |
| `data/` | Everything the browser loads: data files (`window.*` globals) and scripts. Served to the public as they are |
| `img/`, `media/` | Images and videos, served from the tree (`img/fprof/` is generated, 2.9; `img/app/` = the app icons, made by `tools/app_icons.py`, 1.11) |
| `functions/` | Pages Functions: `_middleware.js` (edge SEO layer), `api/seo/[[path]].js` → `_lib/seo-api.js` (SEO admin API), `_lib/seo-auth.js` (read-only port of the Worker's login), `_lib/seo-privacy.js`, `_lib/seo-edge.js`, `_lib/seo-score.js`, `_tests/` |
| `worker/` | Worker `janna-lookup`: `src/` (router `src/index.js`, one module per area), `schema.sql`, `migrations/`, `test/`, `build-index.js`, `build-items.js`, `tools/` |
| `worker-intel/` | Worker `migate-intel`: `src/`, `migrations/0001_init.sql`, `seeds/`, `site-snippets/`, `test/`, `INTEGRATION.md` |
| `worker-shield/`, `worker-site/` | Not deployed by CI (1.1) |
| `deploy/` | `deploy.sh` (manual commands, `deploy/deploy.sh --help`), `stage.py` (staging + the pre-deploy gate), `smoke-test.sh`, `d1_migrate.py`, `wrangler-pages.toml` (Pages config, copied into the stage as `wrangler.toml`), `stage-exclude.txt`, `legacy-live.txt`, `legacy-urls.txt`, `privacy-allow.txt`, `README-DEPLOY.md`; `deploy/ci/` = the CI pipelines and the CI-only stage patches (section 4) |
| `tools/` | `dump-data.mjs` (data files → `build/data.json` for the generator), `i18n_subset.py` (per-page English parts), `company_media.py` + `test_company_media.py`, `partner_logos.py`, `app_icons.py` (the app icons from the logo, 1.11), `publish_apk.py` (puts a signed APK on `/app/`, 5.7). The `gen_*.py`, `rebrand_*.py`, `make_handoff.py`, `import_registry.py`, `rename_persona.py` scripts are one-off history with hard-coded scratch paths: do not run them |
| `docs/janna/` | Specs and contracts (section 8); `kb/` + `kb-upload/` = Janna's Anam knowledge-base files; `reports/` = past work reports |
| `anam/` | Prepared Anam persona and tool changes (not applied) |
| `app/` | The native iOS + Android apps (Capacitor 8): they show the live site (`server.url`), so site changes need no app update. Not part of the site build; `app/README.md`. The site's side of the app (its user agent «MIGApp/<v> (ios\|android)»): 1.12 |
| `.github/workflows/` | CI (section 4) |

### 1.3 The site build

`MIG_BUILD_DIR=<empty dir> bash deploy/deploy.sh build` does three things: (1) a read-only GET of the published Control Center
edits `https://madeinegyptgate.com/data/overlay.js` → `build/overlay.js` (a failed pull keeps the previous file and never stops the
build; `MIG_OVERLAY_PULL=0` skips it); (2) `python3 site.py` with `MIG_OUT=<dir>`; (3) it refuses the build when the generator's
validation (`build/seo-stats.json`, `problem_count`) is not 0. It prints `generator validation: 0 problem(s)` on success.

Inside `site.py`, in this order:
1. `data/`, `img/`, `media/` become symlinks in the output directory (`deploy/stage.py` turns them into real files).
2. The part files are exec'd in the order listed at the top of `site.py`, all into one namespace. Each one registers pages in
   `PAGES` (created in `pages.part.py`): `PAGES['<key>'] = (title_ar, nav_key, css, body_html, js)`, and English pairs with
   `en_add()`. Later parts may modify pages of earlier ones (`media2.part.py` rebuilds `media-center`, `leads2.part.py` builds the
   contractor/consultant lead pages from `leads`), and some wrap generator helpers (`team-seo.part.py` wraps `seo_static_head` /
   `seo_files`), so the order matters.
3. `site.py` assembles `pages` (home from `home2.part.html`, market from `market.part.html`, dashboard from `dash.part.html`, then
   every `PAGES` entry, whose `js` is wrapped in an IIFE that provides `$`, `$$` and `HERO`), adds each page's data scripts, and
   writes every page with `page()` (header from `NAV`, footer, shared scripts, SEO head) at its clean URL: `seo/config.json`
   `static_paths[key]`, default `/<key>/`. Keys in `generated_keys` are hubs made by the SEO build; their interactive version goes to
   `app_paths` (for example `/factories/search/`). Keys in `shim_keys` (`company.html#N` and friends) become tiny redirect shims.
   Links are rewritten to clean URLs (`seo_rewrite_links`). Every `data/<name>.js` reference gets `?v=<md5[:8]>` (`_bust`): never
   write a version by hand.
4. `PAGE_WRITERS` pages write their own files: `signin.part.py` → `/login/` + `/en/login/`, `panel.part.py` → `/admin/`.
5. `janna.html` (the flat hologram kiosk page, `flat_pages` in `seo/config.json`) is written at the end of `site.py`.
6. `build_static_seo(OUT)` (`seo_build.part.py`) writes the generated pages from `build/data.json`, which `tools/dump-data.mjs`
   makes from `data/*.js` plus `build/overlay.js`.

| Source | Page keys (URL from `static_paths`, else `/<key>/`) |
|---|---|
| `home2.part.html` | `home` → `/` |
| `market.part.html` (+ `seo_pprof.part.py` quick view) | `market` |
| `dash.part.html` (+ `data/dash-products.js`, `data/dash-company.js`) | `dashboard` (the member's dashboard, noindex) |
| `pages.part.py` | `contact`, `factories`, `cities`, `media-center`, `intl`, `opportunity`, `track`, `useful-links`; shared helpers (`COMMON_CSS`, `hero()`, `HEROS`, `en_add`, `MIG_SCRIPTS`) |
| `about.part.py` | `about` |
| `register.part.py` | `register` (plans, registration) |
| `oldlists.part.py` | `tenders`, `rfqs` |
| `registry.part.py` | `agencies`, `contractors`, `entity`, `winners` |
| `projects.part.py`, `leads2.part.py` | `projects`, `project`, `leads`, `lead`, `project-news`, contractor/consultant leads |
| `regions.part.py`, `city.part.py`, `map.part.py` | `region`, `city`, `map` |
| `offers.part.py`, `sellers.part.py` | `offers`, `offer`, `outlets`, `suppliers` |
| `media2.part.py`, `article.part.py` | `media-center`, `videos`, `events`, `event`, `article` |
| `company.part.py`, `winner.part.py`, `exportmarket.part.py` | `company`, `winner`, `export-market` |
| `bourse.part.py`, `deal.part.py`, `radar.part.py`, `advisor.part.py` | `bourse`, `deal`, `radar` and `advisor` (both plan-gated: `GATES` in `site.py`) |
| `legal.part.py` | `legal` (the legal center) and the official references list |
| `signin.part.py`, `panel.part.py` | `/login/` (+ `/en/login/`), `/admin/` |
| `pay.part.py`, `meeting.part.py`, `inbox.part.py`, `seo-admin.part.py`, `team-seo.part.py`, `team-data.part.py` | `pay`, `meeting`, `inbox`, `seo-admin`, `seo-team`, `data-desk` (all noindex) |

Generated pages (`seo_build.part.py`): `/factories/<slug>/`, `/industrial_products/<slug>/`, `/tender-item/<slug>/`, `/rfq/<slug>/`,
hubs `/factories/` (+ sector / governorate), `/governorates/<gov>/`, `/industrial-zones/<id>/`, `/free-zones/`, `/products/`,
`/tenders/` (+ category / entity), `/rfq/`, `/awards/`, `/news/`, `/events/`, `/projects/`, `/offers/`, `/export/<market>/`,
`/site-map/`, `/app/` (5.7), each with an `/en/` twin when it passes the English gate (2.2). The main menu of generated pages is `NAV` from `site.py`
too.

### 1.4 Browser data and scripts (`data/`)

| Files | What |
|---|---|
| `i18n.js`, `i18n-en.js` | Language engine (loaded first on every page) and the Arabic → English dictionary (28,264 entries, 7.5 MB, one line) |
| `i18n-old.json`, `i18n-real.json`, `i18n-news.json` | Build-only translation sources (excluded from the upload by `deploy/stage-exclude.txt`) |
| `oldfac.js` (+ `oldfacd.js` descriptions) | `MIGOLDFAC`: the 2,926 member listings imported from the old site |
| `factories.js` | `MIGFAC`: the 91 companies verified by the platform team (the platform's clients) |
| `facx.js` | Researched public-source rows + the merge with `MIGFAC` |
| `oldprod.js`, `oldtend.js`, `oldrfq.js`, `offers.js`, `real.js`, `projects.js`, `registry.js`, `zones.js`, `regions.js`, `videos.js`, `world.js`, `exportmap.js`, `indimg.js` | Products, tenders, RFQs, retail offers, news/events/awards (every item with its source URL), sourced projects, contractors/agencies/awards, industrial zones, the 27 governorates + `MIGSECTORS`, videos, maps, export markets, industrial photos |
| `deals.js` | Intentionally empty (illustrative deals were removed: owner decision) |
| `plan.js`, `plans-live.js` | Plan rules; `plans-live.js` applies the Control Center plans matrix (the single source of truth) over `plan.js` |
| `overlay.js`, `mig-overlay.js`, `settings-live.js` | The static no-op overlay (the Worker serves the live `/data/overlay.js`), the overlay applier, the public settings applier (elements marked `data-mig-setting="<key>"`) |
| `mig-api.js`, `mig-forms.js` | Shared API client (session token `mig-tok`, sign-in dialog) and form helpers |
| `acc.js`, `acc.css` | The Control Center UI (`/admin/`); section files registered with `MIGACC.use`: `acc-dev.js` («🛠️ المطوّر»), `acc-delete.js` («طلبات حذف الحساب», 0010) |
| `flags.js` | The owner's feature switches as the pages see them (`MIGFLAGS`, «🛠️ المطوّر» → «المزايا»); also `MIGFLAGS.app()` / `buyOff()` for the native app (1.12) |
| `delete-account.js` | `/delete-account/` (`delete-account.part.py`): the account / visitor deletion REQUEST (switches `account_delete`, `visitor_erase_request`) |
| `team-seo.js`, `team-data.js`, `team.css` | `/seo-team/` and `/data-desk/` |
| `janna*.js`, `bassem*.js`, `holo.js`, `captions.js`, `bot.js`, `bot-en.js`, `advisor-guides.js` | Janna (visitor assistant), Bassem (advisor of partner plans), holo screens, captions, the scripted bot |
| `link-fix.js` | Rewrites legacy `x.html#…` links to clean URLs in place (no redirect screen) |
| `seo.js` | Analytics loader (IDs empty until the owner sets them) |
| `pwa.js` | The installable app on every page: registers `/sw.js`, the install invitation, the English manifest on app pages in English (1.11) |
| `auth.js`, `me.js`, `egadm.js` | On the live domain these URLs are answered by the OLD system (2.8). `egadm.js` is still used by the map pages; editing it here does not change the live file |

### 1.5 Edge layer (`functions/`)

`functions/_middleware.js` reads only KV `SEO_KV` (`seo:bundle`, per-isolate memo) and the build's `/_seo/redirects.json`,
`/_seo/en-paths.json`. It never touches `/api/*` or non-GET requests. Every redirect is flattened to one hop and never leaves the
site. `/api/seo/*` (`functions/_lib/seo-api.js`) is the SEO admin API used by `/seo-admin/`, `/seo-team/` and the Control Center
«SEO يدوي»: signed-in admin or `seo` role (`functions/_lib/seo-auth.js`, byte-identical to `worker/src/auth.js`; a test checks the
parity), or `X-Platform-Key` for health/export/IndexNow. Previews get no KV, no D1 and no secrets (`[env.preview]` in
`deploy/wrangler-pages.toml`; `stage.py` refuses a config that breaks this).

### 1.6 Platform API Worker (`worker/`)

`src/index.js` is the router (`fetch`, `email`, `scheduled`); `ccBoot` runs first, and the cron runs every 15 minutes.

| Module(s) | Area |
|---|---|
| `auth.js` | E-mail code sign-in (no passwords), v2 session tokens, signed one-time login links |
| `me.js`, `acc-me.js` | The member's account; dashboard self-service (`/api/me/*`) |
| `inquiries.js`, `matching.js`, `candidates.js` | Requests: fully automatic routing to REGISTERED matching members; candidate list for admins only (never contacted) |
| `admin.js` | The monitoring console API (`/inbox/`) |
| `advisor.js`, `profile.js`, `memory.js`, `tasks.js`, `daily.js`, `resume.js`, `bassem-context.js`, `websearch.js` | Bassem (partner/strategic plans): deals, profile, permanent memory, tasks, the daily update, call continuation, web search |
| `janna-session.js`, `janna-item.js`, `visitor.js`, `knowledge.js` | Janna: Anam session tokens, item details, visitor memory, «بنك المعلومات» |
| `meetings.js` | Meetings with Janna |
| `whatsapp.js`, `service-keys.js` | respond.io WhatsApp (real sending only when the owner's switch is on), the service-key reader |
| `digest.js`, `ev.js` | Daily digests and deadline reminders; honest metrics and unsubscribe |
| `acc.js`, `acc-*.js` | Control Center API (`/api/admin/cc/*`), roles and permissions in `acc-base.js` (`ROLES`, `PERMS`, `OWNER_ONLY`, `ROLE_PERMS`), every write audit-logged |
| `content.js` | Content overlay (compiles published edits into `/data/overlay.js`), media uploads (`/media/u/*`), moderation |
| `payments.js` | Invoices and checkout (N-Genius, Paymob, PayTabs, manual), provider webhooks |
| `flags.js`, `acc-dev.js` | The owner's feature switches (registry `FEATURES`, enforced where each feature runs) and the owner-only developer panel API |
| `app-ua.js`, `review-signin.js`, `delete-requests.js` | The native app's rules (1.12): which app a request says it comes from; the store reviewers' sign-in; the deletion requests (0010) |
| `email-center.js` | The one delivery path of every e-mail (Resend first), template registry |
| `crypto.js` | AES-GCM key store (`CONFIG_SECRET`) for keys saved in the Control Center |
| `common.js`, `text.js` | Plans helpers (`planCan` / `planLimit`), HTTP helpers, Arabic normalisation |
| `data.json`, `items.json` | Janna's search index and full item records, generated by `build-index.js` / `build-items.js` (2.9) |

D1 schema: `worker/schema.sql` is the complete schema for a new database (every migration is appended to it);
`worker/migrations/0002…0010` are the changes in order; `worker/tools/upgrade-pre-*.sql` add columns to old databases.
`deploy/d1_migrate.py` (used only by the manual `deploy.sh db`) knows 0004–0006 only (`ALLOWED_MIGRATIONS`).

### 1.7 Intel centre (`worker-intel/`)

Daily pipeline of tenders, RFQs, projects and news from official sources (`src/adapters/`, `seeds/sources.json`), enriched with
Workers AI under a daily cap (`AI_DAILY_LIMIT`), served at `/intel/` (pages take the site's header/footer at runtime,
`src/siteshell.js`) and `/api/intel/*` (including the Bassem tool `/api/intel/tool`). `POST /api/intel/mailpack` (one item's card, links
and official PDF / DOCX for the «ابعتلي» e-mail, `src/notify-items.js` in `worker/`) answers ONLY on the hostname `mailpack.binding.invalid`,
which only `janna-lookup`'s service binding can send: never add a route, a secret or a public caller for it (`worker-intel/INTEGRATION.md`
§9). `site-snippets/intel-live.js` is browser JS (ES5). No npm dependencies and no `package-lock.json`.

### 1.8 Admin Control Center («لوحة التحكم», `/admin/`)

- Page: `panel.part.py` (standalone page, noindex,nofollow) → logic `data/acc.js`, styles `data/acc.css`. Navigation: the `GR` array
  in `data/acc.js` (`[key, Arabic label, English label, badge, permission]`); each section is a `SEC.<key>` function.
- API: `/api/admin/cc/*` in `worker/src/acc.js` + `acc-*.js`, `content.js`, `payments.js`, `email-center.js`. Roles `owner`, `admin`,
  `editor`, `support` (Control Center) and `seo`, `data` (team boards only). Owner-only permissions: `OWNER_ONLY` in
  `worker/src/acc-base.js` (service keys, payment config, e-mail config, member deletion, content on/off switch, import, audit export).
- Live edits without a deploy: published edits are compiled into `/data/overlay.js` (Worker, `max-age=60`); `data/mig-overlay.js`
  applies them before the data files run, `data/plans-live.js` applies the plans matrix, `data/settings-live.js` the public settings.
  Generated SEO pages get the edits at the next site build (the build pulls the overlay first). Contract:
  `docs/janna/ACC-CONTRACT.md`.
- Keys the owner saves in «مفاتيح الخدمات», «بوابة الدفع» and «البريد» are encrypted with `CONFIG_SECRET` and never shown again.
  Precedence (`worker/README.md`, "Service keys" and "E-mail center"): for respond.io, Anam, Bassem's tool secret and the web-search
  key a Worker secret wins over the panel slot; for e-mail the key saved in «البريد» wins once that section is enabled; payment
  gateway keys exist only in the panel.

### 1.9 Janna & Bassem

Janna (`data/janna.js`, `data/janna-real.js`, `data/janna-live.js` + `worker/src/janna-session.js`) greets every visitor; Bassem
(`data/bassem*.js` + `worker/src/advisor.js`, memory modules) serves partner/strategic members for 365 days. Live video runs on
Anam with short-lived session tokens minted by the Worker (`ANAM_API_KEY`). Their memory is permanent: there is no delete endpoint
except the owner's audited legal erasure (`worker/src/acc-memory.js`, Egyptian PDPL 151/2020). Do not add one. Persona prompts and
tools live in Anam, not here; `anam/` holds prepared changes that only the owner may approve.

### 1.10 Not sources of the live site

`home.html`, `index.html`, `market.html`, `factory-dashboard.html`, `factory-profile.src.html`, `home.part.html` (root copies),
`admin.part.py` and `login.part.py` (never exec'd), `arr-en.json`, `EG_SPEC.md`, `UAE_SPEC.md`, `spam-cleanup.md`. Editing them
changes nothing live. The build writes its own `index.html`.

### 1.11 The installable app (PWA)

The live site installs as an app on Android (Chrome: «تثبيت») and on iPhone / iPad (Safari: «شارك ← أضف إلى الشاشة الرئيسية»).
Everything is generated by the site build; nothing runs on a server of its own.

| Piece | Source | What |
|---|---|---|
| `/manifest.webmanifest` (AR) and `/manifest.en.webmanifest` (EN) | `seo_build.part.py` `pwa_manifest` / `emit_pwa` | «منصة صنع في مصر» / "Made in Egypt Gate", short «صنع في مصر» / "Made in Egypt"; `lang` + `dir` per language; `start_url` `/?source=pwa` and `/en/?source=pwa`, `scope` `/`, `id` `/` and `/en/` (two apps), standalone, `theme_color` `#8E0B20` (the header red), white background; icons 192/512 `any` + `maskable` + `monochrome`; shortcuts: factory directory, tenders, the RFQ form (`/contact/#rfq-form`), Janna's live call (`?live=1` on an app page: the Arabic home, the contact page in English) |
| The `<head>` of every page (app pages through `seo_static_head`, generated pages, `/login/` + `/en/login/`) | `pwa_head`, called by `head_html` | the manifest of the page's language, `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable` / `-status-bar-style` (default) / `-title`, `/favicon.ico`, the PNG icons, `apple-touch-icon`, `<script src="/data/pwa.js?v=…" defer>` |
| `/sw.js` | `SW_TPL` in `seo_build.part.py` (ES5) | Pages: network first, the cached `/offline/` only when the network fails; HTML is never stored. This site's static files (`/data/*.js\|css\|json` with `?v=`, pictures under `/img/` and `/assets/`, code under `/assets/` and `/fonts/`): stale-while-revalidate in two capped caches, a stored copy answering at once only while it is fresh by its own `Date` + `max-age` (`/data/` one hour, as `_headers` says: `data/janna.js` loads data files under its own version, so one URL can change at a deploy; an older copy waits for the network and answers only when the network fails). Never touched: other origins (Anam, analytics, Google Fonts), anything but GET, ranges, audio / video, frames, the `NEVER` paths (`/api/`, `/admin/`, `/login/`, `/dashboard/`, `/advisor/`, `/meeting/`, `/inbox/`, `/seo-admin/`, `/seo-team/`, `/data-desk/`, `/pay/`, `/panel.html`, `/downloads/`; also their `/en/`, bare and `.html` forms), `NEVER_FILES` (`/data/overlay.js`, `/app/android.apk` and the old system's files of `deploy/legacy-live.txt`) and every file those pages load (referrer). Caches `mig-pwa-core-<version>`, `mig-pwa-code-…`, `mig-pwa-img-…`: the version follows the template, the rules and the precached files, so an unchanged build leaves phones alone and a changed one replaces the worker and its old caches |
| `/offline/` | `OFFLINE_TPL` | Arabic with an English line (all English when the URL is `/en/…` or the visitor chose English), «حاول مرة أخرى», reloads itself when the connection is back. noindex; not a static page of the manifest (`NOT_PAGES`) |
| `data/pwa.js` | ES5 | registers `/sw.js` after the page has loaded, only on https or localhost, only in the top window (never in Janna's / Bassem's shared screen), never in the native app (user agent contains `MIGApp`); the install invitation (below); on app pages in English it switches the manifest link to the English one |
| `img/app/*` | `tools/app_icons.py` (Pillow, from `img/logo-site.png`; committed, 2.9) | the icons; the build copies `favicon.ico` and `apple-touch-icon.png` to the site root and stops (`pwa:` problems) when one is missing |
| `_headers`, `_routes.json` | `emit_headers`, `emit_routes` | `/sw.js`: `Cache-Control: no-cache`, `Service-Worker-Allowed: /`; the manifests: `application/manifest+json`. These paths are excluded from the Functions, so Pages applies `_headers` to them |

The install invitation: phones and tablets only (desktops keep the browser's own install button), never on the staff and
members' pages (the `NEVER` list, the kiosk), never when the site already runs as the app (`display-mode: standalone`,
`navigator.standalone`), never during a live call (`html.jnl-on`; a call that starts hides it), from the second page of a visit
(or after 25 s on the first one): a slim bar above the header, in the page flow (it never covers Janna's figure or box, the
WhatsApp button or the captions). Android: «📲 نزّل التطبيق» + «تثبيت» (the browser's own dialog, from the held
`beforeinstallprompt`); iPhone Safari: «شارك ← أضف إلى الشاشة الرئيسية» with the share icon. ✕ or a declined dialog → not again for
30 days (`localStorage` `mig-pwa-x`); installed → never (`mig-pwa-in`). In the console, `MIGPWA.state()` says what happened.

Kill switch: `seo/config.json` `"pwa": {"kill": true}` (or `MIG_PWA_KILL=1` at build time) → the build writes a `/sw.js` that deletes
the `mig-pwa-*` caches and unregisters itself, and gives every page's `pwa.js` tag `data-pwa="off"` (nothing registered, an existing
registration removed). It reaches each phone at its next visit; the stage warns `pwa_kill` while it is on. `never` / `never_files`
in the same block only ADD paths (`PWA_DEF` in `seo_build.part.py` is the floor). `deploy/stage.py` `check_pwa` refuses a build whose
worker would handle a private path or store the overlay, or whose manifests name a missing icon or page.

### 1.12 The native app's side on the site (app parity, 2026-11-20)

The apps (`app/`) show the live site; their user agent ends «MIGApp/<v> (ios)» / «(android)». The site behaves EXACTLY like in a browser
there unless an owner switch of «🛠️ المطوّر» → «المزايا» says otherwise (`worker/src/flags.js` FEATURES; texts that ship behind an OFF
switch wait for the owner's word-for-word approval: `docs/app/OWNER-APPROVAL-AR.md`):
- `pwa_head` (every page) marks `<html class="mig-app mig-app-ios|android">` before the first paint; `[data-mig-app-only][hidden]` shows
  only there (the footer's «دخول فريق المنصة» → `/login/?team=1`, the generated pages' «🔗 شارك الصفحة»);
- `app_buy_ios` / `app_buy_android` (ON): OFF hides every `[data-mig-buy]` inside that app only (prices, «ادفع الآن», renew / upgrade:
  register, dashboard, lock boxes, Bassem's desk, `/pay/`), Janna names no price, the Worker refuses checkout / new invoices from that app
  (403 `app_buy_off`) and adds a fixed «no prices» rule to that app's live calls. Mark any new buying UI with `data-mig-buy`;
- `call_consent_app` / `call_consent_web`, `account_delete`, `visitor_erase_request`, `store_review_signin`, `app_janna_autovoice`: OFF;
- app-only behaviour in the browser files, all gated on the user agent: `bassem-tab.js` (the page is OVER the call: «ارجع للمكالمة»
  closes it), `janna-live.js` (the microphone is the app's, 60 s Android wait, the consent card), `mig-api.js` (the sign-in step kept in
  localStorage; board-to-board links open in place), `pay.js` (the gateway in the in-app browser), `pwa.js` (Android share sheet),
  `seo.js` (no ad pixels in the iPhone app), `janna-welcome.js` (no self-start voice). Tests: `worker/test/app-parity*.test.mjs`,
  `review-signin.test.mjs`, `delete-request.test.mjs`, `bassem-tab.test.mjs`, `dev-panel.test.mjs`;
- App Links files (`seo_app.part.py`, from `seo/config.json` `"app"`): `/.well-known/assetlinks.json` (`handle_all_urls` +
  `get_login_creds`) always; `/.well-known/apple-app-site-association` only once `app.ios_team_id` holds the owner's Apple Team ID
  (empty today: no file, because a wrong one is worse than none; a malformed value stops the build). It sends `/api/*`, `/pay*`,
  `/media/*`, `/panel.html` and `/login.html` to the browser and every other path to the app, plus `webcredentials` for the same app.
  The templates in `app/well-known/` and `app/tools/check-app.mjs` follow the same rules (`npm run check` compares them);
- what the apps do natively like a browser tab (a same-site new window opens OVER the page and a live call goes on under it; Back,
  other sites and incoming links during a call; downloads, print, pull to reload, dialogs, restore …) is in `app/` (`app/README.md`
  «What the app does»): it reaches phones only with a new app build (`tools/publish_apk.py` for `/app/`, 5.7, or the stores), never
  with a site deploy. The site code above relies on it: the user agent suffix, `window.opener` / `window.close()` in those windows,
  the `app-settings:` link, and Capacitor's Browser and Share plugins in the app's main page only (never in its page windows).

---

## 2. Golden rules in detail

### 2.1 Browser JS is ES5

Every file in `data/*.js`, `worker-intel/site-snippets/*.js`, and every inline `<script>` the generators write (inside the
`*.part.py` strings, `site.py`, `seo_build.part.py`, `seo_fprof.part.py`, `seo_pprof.part.py`) runs in visitors' browsers and must
parse as ES5. Use `var`, `function`, string concatenation, `Array.prototype.forEach`, and `.indexOf` instead of `.includes`. No new
npm dependency or bundler for the site. On 2026-11-19 all 55 `data/*.js` files, and in the live build the 4,032 distinct inline
scripts of its 7,508 pages and its 250 generated `assets/*.js`, pass. How to check: 3.5.

### 2.2 Arabic first, an English twin for every visible string

Arabic (RTL) is the default; English (LTR) is complete. There are three mechanisms, by where the text lives:

1. **Markup of app pages** (`*.part.py`, `*.part.html`, `site.py`): write the Arabic and register its English in the same part file:
   `en_add([("النص العربي", "The English text"), …])` (defined in `pages.part.py`). Numbers become `{n}` automatically, so
   `"2,926 مصنع"` matches `"{n} factories"`. In English mode `data/i18n.js` translates text nodes and the `alt`, `title`,
   `placeholder`, `aria-label` and meta values from `window.I18N_EN` (`data/i18n-en.js`), and `en_add` pairs are merged into every
   page (`site.py` `_en_js`). `en_add` only ADDS entries; it never overrides an existing dictionary entry.
2. **Text that scripts render** (`data/*.js`, page JS): keep both languages in the code with the local helper
   `T(ar, en)` (`data/acc.js`, `data/team-seo.js`, `data/holo.js` … each defines it; it reads `window.MIGLANG === "en"`). A container
   that a script fills in both languages can carry `translate="no"` so the engine leaves it alone.
3. **Generated pages** (`seo_build.part.py`, `seo_fprof.part.py`, `seo_pprof.part.py`): both languages are rendered at build time.
   The generator's own strings use `X(L, ar, en)` / `T(ar, en)` pairs in its code; data text goes through `tr()`, whose dictionary is
   `data/i18n-en.js` plus the English that the data files add (`REAL_EN`, `*_en` fields), taken from `build/data.json`. **`en_add`
   pairs do not reach generated pages.** An `/en/` twin is written only when `en_gate` passes (no Arabic in title or H1, at least
   95 % of text nodes translated, under 5 % Arabic letters: `seo/config.json` `en`); otherwise there is no English page and
   `/en/<path>` falls back to the Arabic page. A missing dictionary entry therefore removes English pages silently: look at the `why`
   field in `<build>/_seo/pages.json`.

To change an existing translation, edit `data/i18n-en.js` with a script (load the JSON after `window.I18N_EN=`, change the entry,
write it back with `json.dumps(d, ensure_ascii=False, separators=(',', ':'))`, keep the first comment line and the final `;`, then
`node --check data/i18n-en.js`). Never hand-edit it in an editor. Worker texts are bilingual in code too: error strings
`"عربي / English"`, e-mail templates in `worker/src/email-center.js`. Match the register of the surrounding text: the
conversational UI (Janna, Bassem, dashboards, the Control Center) is Egyptian Arabic; most legal and SEO text is Modern Standard Arabic.

### 2.3 Secrets

- Values live only in Cloudflare (Worker and Pages secrets: `wrangler secret put` / the dashboard, done by the owner), in the
  Control Center key store (encrypted with `CONFIG_SECRET`), and in GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`; the app workflows also read the store signing secrets of `app/README.md`). CI never
  sets or changes a Worker or Pages secret; they persist across deploys.
- Names you will meet (values never): Worker `ADVISOR_SECRET`, `AUTH_SECRET`, `PLATFORM_KEY`, `MEETINGS_SECRET`, `RESEND_API_KEY`,
  `ANAM_API_KEY`, `CONFIG_SECRET`, `RESPONDIO_TOKEN`, `WA_WEBHOOK_SECRET`, `TURNSTILE_SECRET`, `TOOL_SECRET`, `WEBSEARCH_KEY`,
  `BRAVE_SEARCH_KEY`, `GOOGLE_CSE_KEY`/`GOOGLE_CSE_CX`, `BREVO_API_KEY`, `JANNA_KEY`; Pages `ADVISOR_SECRET` (same value as the
  Worker), `SEO_PLATFORM_KEY`, `INDEXNOW_KEY`; `migate-intel` `PLATFORM_KEY`, `TOOL_KEY`; `migate-shield` `CF_LISTS_TOKEN`.
  Lists and meaning: `deploy/README-DEPLOY.md` section 4, `worker/README.md`.
- `.gitignore` ignores `build/` and `site/` at every depth, except `worker-intel/test/fixtures/site/` (a saved copy of live pages the
  intel tests read): a new test folder named `site` or `build` needs its own `!` line, or it never reaches GitHub and CI fails.
- `.gitignore` already blocks `.env*`, `.dev.vars`, `*.pem`, `*.key`, `deploy-secrets/`, `*d1-backup*.sql`. Tests use dummy values;
  `[vars]` holds only non-secret settings (`stage.py` refuses secret-like names in the Pages config). If you ever see a real value in
  the tree or the history, stop and tell the user: it must be rotated at its provider, not just deleted.
- `PLATFORM_KEY` never goes to Pages (it activates plans); Pages has its own `SEO_PLATFORM_KEY`. Rotating `CONFIG_SECRET` makes every
  key saved in the Control Center unreadable (`deploy/README-DEPLOY.md` 11.6).

### 2.4 D1: never touch the data, never run migrations automatically

- No `wrangler d1 execute … --remote`, no `--command` against production, no `deploy/deploy.sh db`, and no `deploy/deploy.sh worker`
  (it calls `db`). No `wrangler d1 migrations apply`, ever. Data changes go through the Control Center (audited).
- For experiments use a local D1: tests run the real `worker/schema.sql` on `node:sqlite`; `wrangler d1 execute migate-db --local`
  writes only under `.wrangler/` on your machine.
- A schema change is a new file `worker/migrations/00NN_<name>.sql` (next free number; 0010 is the last today) that is purely
  additive and idempotent: `CREATE TABLE/INDEX … IF NOT EXISTS`, `INSERT OR IGNORE` seeds. No `DROP`, no `DELETE`, no
  `UPDATE` of member data (the `d1-migrate` workflow refuses those unless a person ticks `allow_destructive`). Append the same SQL to
  `worker/schema.sql`. `ALTER TABLE … ADD COLUMN` cannot be made idempotent in SQLite (it fails once the column exists): put it alone
  in its own migration file, so a re-run fails harmlessly and visibly, add the column to the `CREATE TABLE` in `worker/schema.sql`
  for new databases, and say so in the PR. (`worker/tools/upgrade-pre-*.sql` are the older pattern used by the manual `deploy.sh db`.)
- The code must fail soft until the migration is applied, because the Worker deploys before anyone runs the migration: check the
  table with `hasTable(env, name)` (`worker/src/acc-base.js`) and answer `503 <area>_off`, as 0007–0009 do (`profile_store_off`,
  `memory_off`, `tasks_off`).
- The migration is applied only by the manual `d1-migrate` workflow (4.4), which exports a backup first. A backup holds member data:
  never commit it, never attach it to an issue.

### 2.5 Privacy

- Factory phone numbers, WhatsApp numbers and e-mail addresses never appear in generated pages, JSON-LD, sitemaps, `_seo/` files or
  CSV downloads. Contact goes through the platform (RFQ form, the platform's own WhatsApp and e-mails, Janna). `deploy/stage.py`
  refuses a build that has one (`privacy_pages`, `jsonld_privacy`, `privacy_or_claim_files`); `functions/_lib/seo-privacy.js` refuses
  one in an SEO override; the Control Center refuses one in public text (`invalid_contact`). Add to `deploy/privacy-allow.txt` only
  a reviewed false positive (a reference number that looks like a landline), never a real contact.
- **Visitor ↔ member link only by a signed-in session.** `worker/src/visitor.js`: Janna's random visitor id (`mig-vid`) is linked to a
  member only by a request that carries that member's own full sign-in (Bearer v2, not an e-mailed link session), with
  `link_via = 'session'`. A visitor id linked to one member is never moved to another. An e-mail or phone a visitor tells Janna is
  stored only as a keyed hash and never links anything. A linked id's memory is read and written only with that member's sign-in
  (else `409 visitor_linked` + `rotate_visitor`, and `data/janna-live.js` starts a new id; it also rotates after sign-out). Tests:
  `worker/test/janna-memory.test.mjs`. Do not add any other way to link (no matching by e-mail or phone).
- **Knowledge bank only team-approved.** `worker/src/knowledge.js`: entries are anonymised on capture (`anonymize`); the personas
  (`/api/janna/knowledge`, the Janna session's knowledge block) see only entries the TEAM answered or approved
  (`personaOk`: `status === "team"`). There is no automatic approval, however many clients asked. Tests:
  `worker/test/knowledge.test.mjs`. Every stored text that reaches an LLM passes `forLLM` + `instructionLike` (`worker/src/text.js`).
- Directory factories that are not registered members are never contacted (`matching.js`, `candidates.js`). Imported legacy contacts
  are admin-only. No raw IPs are stored (keyed hashes). Memory is never deleted except by the owner's audited erasure.

### 2.6 Data honesty

- Numbers on pages are computed at build time from the data (`site.py` `_fill_counts`, the honest counts in `about.part.py`, the
  generator). Never type a count, price, rating, capacity or date that does not come from the data or from the owner.
- Unverified things are removed, not labelled (owner decision): `data/deals.js` is empty, `MIG.LEADS` is empty, projects and news
  carry their source URL. Never add sample, demo, placeholder or "illustrative" rows, and never present research as membership.
- Labels: the 91 companies of `data/factories.js` carry «✓ موثّق من فريق المنصة»; other researched rows of `data/facx.js` carry
  «بيانات من مصادر عامة – غير مسجّل في المنصة»; imported members (`MIGOLDFAC`) carry neither. The old «26,808 / 26 ألف» directory claim
  is banned everywhere (`stage.py` checks it). No `VideoObject` JSON-LD. No page built from sample leads.
- The Worker reports something as "sent" only when the provider returned an id; Janna and Bassem say only what their tools returned.
- Plan prices and limits come from the Control Center plans matrix (`cc_plans`; seed = today's prices in `data/plan.js`:
  4,000 / 10,000 / 25,000 / 50,000 / 100,000 EGP a year + 14 % VAT). Never write different prices anywhere.

### 2.7 The owner's legal text

- **Owner and operator lines**, approved by the owner on 2026-11-19, appear together and word for word: «المالك: الجمعية المصرية
  للتنمية الصناعية» with «جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي)», and «المشغّل: الحسيني جروب
  وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير»; English «Owner: Egypt Industrial Development Association» /
  «Operator: ElHouseni Group & Partners — receiving requests, partner registration, customer service and development». They live in
  the footer of every page (`seo_build.part.py` `site_footer`), `legal.part.py` (section 1), `about.part.py`, `pages.part.py` (contact)
  and `seo.part.py` (`ORG` JSON-LD). Never drop, reorder or reword one, and change all of them together, in both languages, only when
  the owner asks.
- Registration, tax and invoice-issuer details are live Control Center settings (`operator_*`, `tax_no`, `cr_no`, `vat_bp` in
  `cc_settings`, keys in `worker/src/acc-plans.js` `PUBLIC_KEYS`). Do not hard-code them in pages, and never invent or "complete" a
  registration, tax or licence number, address or phone.
- The legal center (`legal.part.py`: legal status, terms, membership, privacy under Law 151/2020, refund, tenders disclaimer, RFQ
  rules, IP, cookies, complaints, laws) changes only when the owner asks for it and gives or approves the exact Arabic and English
  text. Keep law citations to the real laws already cited. Never promise awards, contracts or a minimum of opportunities (the text
  says the opposite), never present the platform as a procurement authority or a government body, and never claim an affiliation it
  does not have (`site.py` `AFF_FIX` rewrites leftover GCC phrases). The complaint deadlines need the owner's or a lawyer's decision.

### 2.8 Routes and the old system

- The six paths of `deploy/legacy-live.txt` belong to `mis-egypt`. The build never writes `panel.html`, `login.html` or
  `admin.html` (`site.py` pops `panel` and `login`; `stage.py` refuses `legacy_live_pages`), and no Worker route may cover them.
  The new sign-in page is `/login/` and the new Control Center is `/admin/`.
- A new Worker API family needs one route per host in `worker/wrangler.toml` (`madeinegyptgate.com/api/<family>/*` or
  `…/api/<family>*`, like the existing lines, plus the `www.` twin) and a dispatch line in `worker/src/index.js`. Never `/*`,
  `/api/*`, or anything that covers `/api/seo`. Check with `bash deploy/deploy.sh worker-config` (read-only, offline) and
  `cd worker && npm test`.
- Do not uncomment the routes block of `worker-intel/wrangler.toml`; the routes exist on the zone already.

### 2.9 Generated and derived files

Do not hand-edit these; regenerate them:

| File | Made by | Note |
|---|---|---|
| `worker/src/data.json`, `worker/src/items.json` | `node worker/build-index.js`, `node worker/build-items.js` (repo root) | `build-items.js` gives clean URLs only with a built site: `MIG_SITE_DIR=<build dir> node worker/build-items.js` (else it falls back to `company.html#N`-style shim URLs). Both read `build/overlay.js` when present. `deploy-worker` regenerates both (with the live overlay and the live clean-URL maps) before every Worker deploy, so the committed copies only matter for tests |
| `seo/company-media.json`, `img/fprof/` | Every build, unless `MIG_FPROF_MEDIA_REBUILD=0` | CI builds with `MIG_FPROF_MEDIA_REBUILD=0` (reads the committed index). After a data change, build once locally WITHOUT it and commit both together with the data |
| `img/app/*` (the app icons: `icon-192/512`, `maskable-*`, `monochrome-512`, `apple-touch-icon`, `favicon*`, `sc-*` shortcuts) | `python3 tools/app_icons.py` (from `img/logo-site.png`; `--check` says whether they are current) | Committed. Re-run and commit after a logo change. `/favicon.ico`, `/apple-touch-icon.png`, `/sw.js`, `/manifest*.webmanifest` and `/offline/` exist only in build output (`emit_pwa`) |
| `downloads/android/*.apk`, `latest.json` | `python3 tools/publish_apk.py <signed.apk>` (5.7) | Committed. Never by hand: the stage compares `latest.json` with the file and the signer with `/.well-known/assetlinks.json` |
| `seo/lastmod.json` | Every build | Sitemap `<lastmod>` history and the memory of published URLs: an `/en/` page that a later build no longer makes gets its 301 to the Arabic page only if this file remembers it. CI updates a copy and never commits it (every CI build starts from the committed file; the updated copy is the `seo-lastmod` artifact of the run). Commit it in a PR that intentionally changes which pages exist; otherwise `git checkout seo/lastmod.json` after a local build |
| `build/`, `site/`, `assets/i18n/*`, `assets/seo-*` | The build | `build/` and `site/` are git-ignored; `assets/` exists only in build output |

---

## 3. Commands

All commands run from the repository root unless they `cd`.

### 3.1 Tools

- Python 3.8+ (3.12 in CI) with Pillow: `python3 -m pip install pillow`. Without Pillow the build stops on purpose (about 1,300
  pages would lose their photos and logos).
- Node 22 (22.12 or newer): `wrangler@4.164.0` requires it, and the test suites use `node:sqlite`.
- `cd worker && npm ci` once. It installs `postal-mime` and wrangler 4.164.0. **The `functions/` tests need it too**: their auth
  parity test imports `worker/src/auth.js`, which imports `postal-mime`.
- `worker-intel/` has no dependencies and no lockfile: `npm ci` fails there; run `npm test` directly.

### 3.2 Build the site

```bash
mkdir -p /tmp/mig && MIG_BUILD_DIR=/tmp/mig/site MIG_FPROF_MEDIA_REBUILD=0 bash deploy/deploy.sh build
```

About 2 minutes. It must print `generator validation: 0 problem(s)`. Log: `build/deploy-logs/<timestamp>-build.log`; report:
`build/seo-stats.json`; data dump: `build/data.json`. `MIG_BUILD_DIR` must be empty or a previous `deploy.sh build` output (it is
wiped). Environment knobs: `MIG_OVERLAY_PULL=0` (no overlay GET; use it when the network blocks the live site), `MIG_DEBUG=1` (error
overlay on pages), `MIG_SEO_TODAY=YYYY-MM-DD` (build as of a date). The build rewrites `seo/lastmod.json` (2.9).

### 3.3 Stage and the pre-deploy gate

```bash
python3 deploy/stage.py stage --site /tmp/mig/site --out /tmp/mig/stage --seo-stats build/seo-stats.json
python3 -c "import json; r = json.load(open('/tmp/mig/stage/STAGE-REPORT.json')); print(r['status'], len(r['errors']), 'errors', [w['code'] for w in r['warnings']])"
```

The stage resolves the symlinks, drops build-only files, copies `functions/` (without tests) and `deploy/wrangler-pages.toml` as
`wrangler.toml`, then checks: Pages limits (20,000 files, 25 MiB a file, `_redirects` / `_headers` / `_routes.json` rule limits),
required files, preview isolation, a clean build, every local link/script/image/canonical/hreflang/JSON-LD URL resolves, every
`_redirects` rule is also in `_seo/redirects.json`, robots and sitemaps, and the honesty and privacy rules. `errors` must be empty;
today there is one known warning, `data_files_review` (public data files contain a few number-like texts: README-DEPLOY section 9).
Re-check an existing stage: `python3 deploy/stage.py check --out /tmp/mig/stage --seo-stats build/seo-stats.json`.

### 3.4 Tests

```bash
(cd worker && npm ci && npm test)     # 602 tests on 2026-11-19, about 30 s; D1 = node:sqlite with the real schema, Resend/respond.io mocked
(cd functions && npm test)            # 68 tests: edge middleware, /api/seo, auth parity with worker/src/auth.js (needs worker/node_modules)
(cd worker-intel && npm test)         # 104 tests, about 10 s, no install needed
python3 tools/test_company_media.py   # the profile photo index
bash deploy/deploy.sh worker-config   # worker/wrangler.toml: bindings, one route per family, no catch-all, nothing over the old system
```

Heavier, optional: `node worker/test/integration.mjs` (real workerd through `wrangler dev --local`), `node functions/_tests/e2e-pages-dev.mjs`
(real `wrangler pages dev`), `bash deploy/deploy.sh localtest` (build + stage + production emulation + full smoke test on localhost).
Tests never send real e-mail or WhatsApp and never call a provider: mock `fetch`, as the existing tests do.

### 3.5 ES5 check

```bash
npm i --prefix /tmp/es5 acorn@8.14.0 --no-audit --no-fund
for f in data/*.js worker-intel/site-snippets/*.js; do /tmp/es5/node_modules/.bin/acorn --ecma5 --silent "$f" >/dev/null || echo "NOT ES5: $f"; done
```

Inline scripts of a build (run after 3.2):

```bash
cat > /tmp/es5/inline.js <<'JS'
var fs = require('fs'), path = require('path'), acorn = require('acorn'), root = process.argv[2], seen = {}, n = 0, bad = 0;
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!e.isFile() || !/\.html$/.test(e.name)) return;
    var h = fs.readFileSync(p, 'utf8'), rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, m;
    while ((m = rx.exec(h))) {
      if (/\bsrc\s*=/i.test(m[1]) || /type\s*=\s*["']?application\/(ld\+)?json/i.test(m[1]) || seen[m[2]]) continue;
      seen[m[2]] = 1; n++;
      try { acorn.parse(m[2], { ecmaVersion: 5 }); } catch (err) { bad++; console.log('NOT ES5: ' + path.relative(root, p) + ' - ' + err.message); }
    }
  });
})(root);
console.log(n + ' distinct inline scripts, ' + bad + ' not ES5'); process.exit(bad ? 1 : 0);
JS
node /tmp/es5/inline.js /tmp/mig/site
```

Also check the service worker `/tmp/mig/site/sw.js` (made from `SW_TPL` in `seo_build.part.py`) and generated script assets with the same `acorn --ecma5` loop over `/tmp/mig/site/assets` (`find … -name '*.js'`). A file
that is not ES5 is a bug to fix in its source (the part file string or the data file), never by a transpiler.

### 3.6 Look at it locally

`cd /tmp/mig/site && python3 -m http.server 8080` serves the build as static files (clean URLs work; there are no edge redirects
and no `/api`). Add `?lang=en` or use the language button for English; generated English pages are under `/en/`.
`bash deploy/deploy.sh localtest` gives a production-like copy with local KV/D1 (needs wrangler; it builds into
`build/site-fresh`).

### 3.7 Before you open the pull request

1. `cd worker && npm test`, `cd functions && npm test`, `cd worker-intel && npm test` (the ones your change touches, at least).
2. ES5 check (3.5) on every browser file you touched.
3. For any site change: build (3.2) and stage (3.3) with 0 problems and 0 errors, or run the whole CI pipeline without deploying:
   `DRY_RUN=1 CI_WORK_DIR=/tmp/mig-ci-site bash deploy/ci/ci-site.sh` (build, stage, CI patches, edge tests, wrangler validation;
   read-only GETs of the live site; the work dir must be new or made by `deploy/ci`). For Worker changes:
   `DRY_RUN=1 CI_WORK_DIR=/tmp/mig-ci-worker bash deploy/ci/ci-worker.sh` (it rewrites `worker/src/data.json` / `items.json`: do not
   commit those unless intended); intel: `DRY_RUN=1 CI_WORK_DIR=/tmp/mig-ci-intel bash deploy/ci/ci-intel.sh`. Open the pages you
   changed in Arabic AND English, at phone width (390 px) too.
4. `git status`: no `build/`, no secrets, no backup files; `seo/lastmod.json`, `seo/company-media.json`, `img/fprof/` only on purpose.
5. In the PR description: what changed for visitors, which workflows will deploy it, and whether a migration must be run after the
   merge (and which file).

---

## 4. How CI deploys (`.github/workflows/` → `deploy/ci/`)

Each workflow calls one script in `deploy/ci/`; the scripts run the same way on any machine, and `DRY_RUN=1` runs everything except
the deploy. The workflow files are the source of truth for triggers (which pushes start which workflow); the script headers are the
source of truth for the steps. Read both before you change anything related.

| Workflow | Starts on | Script | Deploys |
|---|---|---|---|
| `deploy-site.yml` | push to `main`, every path EXCEPT `worker/**`, `worker-intel/**`, `docs/**`, `**.md` and the other pipelines' own files; or «Run workflow» (optional dry run) | `deploy/ci/ci-site.sh` (+ `ci-overlay.py`, `ci-post-stage.py`, `carry-redirects.txt`) | Pages project `madeinegyptgate` |
| `deploy-worker.yml` | push to `main` touching `worker/**` (not `.md`), the data files Janna's index reads (`data/mig-overlay.js`, `regions.js`, `factories.js`, `facx.js`, `oldfac.js`, `oldfacd.js`, `oldprod.js`, `oldtend.js`, `oldrfq.js`, `offers.js`, `zones.js`, `real.js`, `videos.js`, `projects.js`) or its own CI files; or «Run workflow» | `deploy/ci/ci-worker.sh` (+ `ci-overlay.py`) | Worker `janna-lookup` (code; its secrets, D1, R2 stay as they are) |
| `deploy-intel.yml` | push to `main` touching `worker-intel/**` (not `.md`) or its own CI files; or «Run workflow» | `deploy/ci/ci-intel.sh` | Worker `migate-intel` (code only) |
| `d1-migrate.yml` | manual only («Run workflow» with inputs, 4.4) | `deploy/ci/ci-d1-migrate.sh` | D1 `migate-db`: backup first, then ONE chosen migration file |

So a change to a data file deploys both the site and the Worker; a change to a `.md` file or `docs/` deploys nothing. Each workflow
runs one deploy at a time (`concurrency`, never cancelled: a newer push waits). **There is no daily rebuild yet**: the `schedule:`
block of `deploy-site.yml` (02:37 UTC) is commented out, although `deploy/README-DEPLOY.md` section 7 wants one (tender and offer
statuses and the tenders-hub date are computed on the build day). Until the owner turns it on, a site build happens only on a push
or a manual «Run workflow».

Two more workflows only build the native apps (`app/`) and deploy nothing: `app-android.yml` and `app-ios.yml` (push to `main`
touching `app/**`, or «Run workflow»; no Cloudflare token, only the store signing secrets of `app/README.md`; a newer push cancels
the running build). `deploy-site` ignores `app/**` and their files.

Common to the four workflows of the table: the repository secret `CLOUDFLARE_API_TOKEN` (never printed; without a working token a run does every check and then
fails or exits 3 = "checked, NOT deployed"). Only a run for `refs/heads/main` that is not a dry run gets it (the workflows' `env`
condition), and the scripts refuse any other non-dry run at once (`ci_ref_guard` in `ci-lib.sh`): «Run workflow» on a branch can only
check it. `ci-lib.sh` takes the token out of the environment as soon as it is sourced, so the build, the tests, npm and node never
see it; only `wrangler deploy` / `pages deploy` / `deployments` / `rollback` / `d1 …` (`wr_cf`) and the Cloudflare API calls (`cf_api`,
token on stdin) get it. No file downloaded from the live site is ever executed in CI (4.1 step 2). Account
`88c77c2b7595dd0ce510270175f69143`, wrangler pinned to 4.164.0
(`worker/package-lock.json`), Node 22, Python 3.13 + Pillow 12.3.0 (site), `permissions: contents: read` (CI cannot push). Helpers in
`deploy/ci/ci-lib.sh`. Every run writes a job summary and keeps its logs as a workflow artifact (`site-reports`, `worker-reports`,
`intel-reports`, `d1-migrate-logs`, 14 days); `deploy-site` also keeps the build's updated `seo/lastmod.json` as the artifact
`seo-lastmod` (90 days) so a person can commit it when pages appear or vanish (2.9). «Run workflow» on the three deploy workflows
has a `dry_run` box: everything except the deploy.

### 4.1 `deploy-site` (`deploy/ci/ci-site.sh`)

1. Tools: Python 3 + Pillow, Node 22.12+, wrangler 4.164.0, the token.
2. Build: the published Control Center overlay is pulled (GET `/data/overlay.js`) and reduced to data by `deploy/ci/ci-overlay.py`:
   it must come from the Worker (header `X-Overlay-V`; the static Pages fallback is refused) and its first line must be exactly
   `window.MIGOVL_DATA=<JSON>;`; a new file with the re-serialised JSON is written, so `tools/dump-data.mjs` (Node `vm`, not a sandbox)
   never runs downloaded code. Then `deploy/deploy.sh build` into the work dir with `MIG_FPROF_MEDIA_REBUILD=0` bakes that copy in
   (`_seo/overlay-baked.json` must name the same version); `seo/lastmod.json` is updated in a copy
   (`MIG_SEO_LASTMOD=<work>/lastmod.json`), so the checkout stays exactly as committed. The run stops when the overlay is not usable
   (`CI_ALLOW_NO_OVERLAY=1` overrides). Must print `generator validation: 0 problem(s)`.
3. Stage: `deploy/stage.py stage`; `STAGE-REPORT.json` must have 0 errors.
4. CI patches, `deploy/ci/ci-post-stage.py --stage <stage>` (changes `<stage>/site` only, reads the live site with GET only, safe to
   re-run, report in `<stage>/CI-POST-STAGE.json`):
   1. **Carried redirects**: the 301 rules of `deploy/ci/carry-redirects.txt` (today the 32 `/en/industrial_products/<slug>/` → Arabic
      rules of the live deployment) are appended to `<stage>/site/_redirects` only when the new stage has no page at the source, has the
      page at the target, and has no rule for that source yet. To keep another live rule, add a line there.
   2. **Janna kiosk link fix**: when `janna.html` does not load `link-fix.js`,
      `<script src="/data/link-fix.js?v=<md5[:8] of data/link-fix.js>" defer></script>` goes right before `</body>`, where the live page
      has it. (`site.py` writes `janna.html` without it; adding it there would make this patch a no-op.)
   3. **Live SEO bundles kept**: the `assets/seo-<hash>.css|.js` files that the LIVE pages reference are fetched read-only from
      `https://madeinegyptgate.com/assets/<name>?ci=<time>` (past the edge cache, which can hold different copies of one name per
      location) into the stage when it lacks them, so pages held by browsers and caches keep working.
5. Checks: `functions` tests, `wrangler pages project validate`, the Functions compile.
6. Deploy: `cd <stage> && wrangler pages deploy site --project-name madeinegyptgate --branch main` (the stage holds `site/`,
   `functions/` and `wrangler.toml`).
7. Smoke: `/`, `/market/`, `/factories/`, `/governorates/cairo/`, `/factories/search/`, `/en/` → 200 on the new deployment, the
   deployment serves this build, `deploy/smoke-test.sh` on it, then the same pages on https://madeinegyptgate.com. Key pages failing on
   the new deployment → **automatic rollback** to the deployment that was live before (`CI_AUTO_ROLLBACK=0` turns it off).

A red run before step 6 changes nothing on the site. A manual `deploy/deploy.sh production` does NOT apply the step-4 patches: if CI
is unavailable and a deploy cannot wait, run `deploy/ci/ci-site.sh` itself with the token (a human decision, not yours).

### 4.2 `deploy-worker` (`deploy/ci/ci-worker.sh`)

Tools → `deploy/deploy.sh worker-config` (read-only) → `npm ci` in `worker/` → tests (`worker` and `functions`) → Janna's index: GET of
the live overlay (reduced to data by `ci-overlay.py`, as in 4.1) and the live clean-URL maps (`/_seo/hash/*.json` → `MIG_SITE_DIR`), then `node worker/build-index.js &&
node worker/build-items.js` from the root (refused when a data file failed to load or a list shrank by more than half;
`CI_ALLOW_INDEX_DROP=1` overrides) → `wrangler deploy --dry-run` → `wrangler deploy` in `worker/` → health of `/api/<service>/health`:
`janna`, `advisor`, `meetings`, `auth` or `inquiries` failing → automatic rollback to the version live before. Routes, cron and bindings
come from `worker/wrangler.toml`. It never touches D1; it rewrites `worker/src/data.json` / `items.json` only in the runner's checkout.

### 4.3 `deploy-intel` (`deploy/ci/ci-intel.sh`)

Tools → `npm ci` only if `worker-intel/` has a lockfile (today it has none and needs none) → `npm test` → `wrangler deploy --dry-run` →
`wrangler deploy` in `worker-intel/` (the zone routes are outside its `wrangler.toml` and wrangler leaves them alone) → health:
`/api/intel/health` and `/intel/` → 200, else automatic rollback. The D1 `migate-intel` is never migrated here.

### 4.4 `d1-migrate` (manual, `deploy/ci/ci-d1-migrate.sh`)

Started by a person: Actions → `d1-migrate` → «Run workflow» with `migration` (a plain file name in `worker/migrations/`),
`confirm` (type `migate-db`), `backup_only` (export only) and `allow_destructive` (off). Phases: **check** (offline: the name, the
database from `worker/wrangler.toml`, statement count, destructive statements listed) → **backup** (a D1 Time Travel bookmark of
"now" as the restore point, then `wrangler d1 export migate-db --remote` → `BACKUP.json` with size, sha256, bookmark) → the backup
kept as a 7-day artifact (member data: never download it to a shared place, never commit it) → **apply** (only with `confirm` and
this run's backup; a file with `DROP`, `DELETE`, `UPDATE`, `INSERT OR REPLACE`, `ALTER … DROP|RENAME` is refused unless
`allow_destructive` is set) = `wrangler d1 execute migate-db --remote --file worker/migrations/<file>`. Migrations go in number
order, one per run, after the Worker code that tolerates them is live. A migration is never part of a push. The D1 `migate-intel`
has no workflow: a `worker-intel/migrations/` change needs a developer by hand (backup first).

### 4.5 What CI never does

Change secrets, DNS, zone routes, KV or R2 content, Anam personas or the `mis-egypt` Worker; run migrations on push; deploy
`migate-shield` or `migate-site`; commit to the repository; check ES5 (that is your job, 3.5).

---

## 5. Recipes

### 5.1 Change text on an existing page

1. Find the string: `grep -rn "النص" *.part.py *.part.html site.py seo_build.part.py`. App page markup lives in its part file (1.3);
   footer, menu and hubs of generated pages are in `seo_build.part.py`; meta descriptions in `seo.part.py`.
2. Change the Arabic and its English: an `en_add` pair next to it (app pages), the `X(L, ar, en)` / `T(ar, en)` pair (generator), and
   `data/i18n-en.js` only when an existing dictionary entry must change (2.2).
3. Build + stage (3.2, 3.3), look at the page in both languages. Commit on a branch, open a PR. After the merge `deploy-site` deploys it.

### 5.2 Add a page

1. Create `<name>.part.py` (copy the shape of a small one, `team-seo.part.py` or the `PAGES['track']` block of `pages.part.py`):
   `PAGES['<key>'] = ('العنوان – صنع في مصر', '<nav key>', COMMON_CSS + '''<css>''', '''<html>''', '''<ES5 js>''')`, with
   `%HERO%` + an entry in `HEROS` (`pages.part.py`) for the standard photo header if you want one, and `en_add([...])` for every
   Arabic string of the markup.
2. Exec it from `site.py` next to the related parts (before `seo.part.py`; after `seo_build.part.py` only if it wraps
   `seo_static_head` / `seo_files` like `team-seo.part.py`).
3. Clean URL: add `"<key>": "/<key>/"` to `static_paths` in `seo/config.json` (the default is `/<key>/` anyway). Staff or private
   pages: add the key to `noindex_static`. Meta: an `SEO['<key>']` entry in `seo.part.py` (description, keywords, schema type,
   breadcrumb, change frequency, priority).
4. Menu: add the link to `NAV` in `site.py` (it is the menu of the generated pages too). Its English: an `en_add` pair for app
   pages AND a dictionary entry in `data/i18n-en.js` (or `NAV_EN` in `seo_build.part.py`) for generated pages.
5. Page data: add `<script src="data/<file>.js"></script>` (no version: `_bust` adds `?v=`) to the page's js, like `site.py` does for
   `tenders` / `offers`. Calls to the API go through `window.MIGAPI` (`data/mig-api.js`).
6. Build, stage, ES5 check, both languages, 390 px width. PR → merge → `deploy-site`.

### 5.3 Add a feature (Worker API + page)

1. Server: a new module `worker/src/<area>.js` (ES module; import only what you need from `common.js`, `auth.js`, `text.js`; inside the
   Control Center area, follow `docs/janna/ACC-CONTRACT.md` §0.2 and its `ccJson`/`ccErr` helpers). Sign-in: `authUser()` from
   `auth.js`; plan rights: `planCan` / `planLimit` (`common.js`) on the server, never only in the browser. Rate-limit public endpoints
   (`rateOk`). Errors: `{error: "عربي / English", code: "snake_case"}`. No PII in `console.*`.
2. Route: a dispatch line in `worker/src/index.js` (`fetch`), and, for a NEW `/api/<family>`, both host patterns in `worker/wrangler.toml`
   (2.8). Existing families (`/api/janna/*`, `/api/advisor/*`, `/api/admin/*`, `/api/team/*`, `/api/me/*`) need no new route.
3. Storage: a new migration (5.6) + fail-soft code. A new Control Center permission: `PERMS` / `ROLE_PERMS` in `worker/src/acc-base.js`
   (owner-only ones also in `OWNER_ONLY`).
4. E-mail: through `worker/src/email-center.js` with a registered template id (`test/email-center.test.mjs` fails otherwise).
5. Tests: `worker/test/<area>.test.mjs` with the helpers in `worker/test/helpers.mjs` (real schema on `node:sqlite`, mocked `fetch`).
6. Browser side: ES5, `T(ar, en)`, `window.MIGAPI`. Page or section as in 5.2.
7. PR: say which workflows deploy it (`deploy-worker` + `deploy-site`) and which migration the owner must run after the merge.

### 5.4 Add a Control Center setting (a public site setting)

Example: a new social link `social_tiktok`.
1. `worker/src/acc-plans.js`: add the key to `PUBLIC_KEYS` with its type (`email`, `tel`, `text`, `social`, `https`, `vat`, `multi`;
   validation in `checkSetting`), to its group in `SETTING_GROUPS`, and its current value (or `""`) to `SEED_PUBLIC`.
2. `worker/src/content.js` `settingsBlock()`: the overlay compiles every public `cc_settings` row; link keys are validated by
   `SETTING_URL` and e-mail keys by `SETTING_MAIL`: extend those regexes when the new key is a link or an e-mail.
3. `data/acc.js`: add the field to `SGROUPS` (`[key, Arabic label, English label, input type]`) so the owner sees it in «النظام ←
   الإعدادات».
4. Site: mark the element with `data-mig-setting="<key>"` where the generator writes it: the header util bar in `site.py`
   `header()`, the contact page in `pages.part.py`, the footer in `seo_build.part.py` `site_footer` through `mk()` (markers are
   written on app pages only). Today the footer marks only the address; its e-mails, phones and the social icons (`FTR_SOCIAL`) are
   fixed text, so a new social link means adding it to `FTR_SOCIAL` with a marker. Then teach `data/settings-live.js` the key
   (`SEED` = the value in the build, `TEXT` when its text should change, `href()` when it builds a link; a `social_*` value `-`
   hides the link). Settings reach app pages live (overlay, within about a minute); generated pages at the next site build.
5. No migration: `cc_settings` is key/value and `publicSettings()` falls back to `SEED_PUBLIC`.
6. Tests: extend the `settings` block of `worker/test/acc.test.mjs` (validation + the public `/api/settings` answer). Run
   `cd worker && npm test`, ES5-check the two browser files.
7. After the merge `deploy-worker` and `deploy-site` deploy it; the owner types the value in `/admin/` and saves.

### 5.5 Change directory, tender, news or offer data

Data lives in `data/*.js` (one-line JSON after `window.X =`). Edit with a script that loads and dumps the JSON, keep the header
comment, `node --check` the file. Keep every item's source URL; never add contacts to public fields. Then build locally WITHOUT
`MIG_FPROF_MEDIA_REBUILD=0` once when companies or products changed, and commit `seo/company-media.json` and `img/fprof/` with the
data (2.9). Small live corrections are better done by the owner in the Control Center (overlay) than by a deploy. A push that
changes one of the data files Janna's index reads also redeploys the Worker (`deploy-worker.yml` paths); a NEW data file that the
index should read must be added to `worker/build-index.js` / `build-items.js` and to those paths.

### 5.6 Add a D1 migration

1. `worker/migrations/00NN_<name>.sql` (next number), additive and idempotent (2.4), with a header comment like 0007–0009: what it
   adds, that it is safe to re-run, and the apply line.
2. Append the same SQL to `worker/schema.sql`.
3. Make the code fail soft without it; tests run `schema.sql` (so they cover the new tables).
4. Check the file the way the workflow will (offline, nothing remote): `MIGRATION=00NN_<name>.sql bash deploy/ci/ci-d1-migrate.sh check`.
   It must list no destructive statement.
5. In the PR: "after the merge, run the `d1-migrate` workflow with `00NN_<name>.sql`". Never run it yourself (no `backup` or `apply`
   phase from a session), never add it to a deploy workflow.

### 5.7 Publish the Android app on the site (APK)

No store accounts yet (owner, 2026-11-20): Android installs a signed APK from `/app/`, iPhone installs the site from Safari (the PWA,
1.11). `seo_app.part.py` makes the page (with no APK: «نسخة أندرويد قريباً جداً», no button, no redirect), the 302
`/app/android.apk` → `/downloads/android/<file>` (`_redirects`; the path skips the Functions), the `_headers` of the APKs and
`/.well-known/assetlinks.json` (package + `seo/config.json` `"app"` `android_cert_sha256`: the release key; public values).
1. A release APK signed with that key, versionCode above `downloads/android/latest.json` `code`: the `android-release` artifact of
   `app-android`, or one the owner signs. Never a debug build.
2. `python3 tools/publish_apk.py app-release.apk --sdk "$ANDROID_HOME"` (no SDK: `--version X --code N --i-checked`, after
   `apksigner verify --print-certs` and `aapt2 dump badging` elsewhere). It refuses the debug key, a key the config does not list, a
   debuggable build, over 25 MiB or a versionCode not above the published one; writes
   `downloads/android/madeinegyptgate-<versionName>-<versionCode>.apk` + `latest.json` and keeps the newest 2.
3. Build + stage (3.2, 3.3): the stage's `check_app` refuses an `.apk` outside `downloads/android/`, a `latest.json` whose file, bytes
   or SHA-256 do not match, a file over 25 MiB, a signer `assetlinks.json` does not list, an `assetlinks.json` without the package.
   Commit `downloads/android/` on a branch, PR; `deploy-site` publishes after the merge (the smoke test follows `/app/android.apk`).
   To withdraw it: remove the APKs and `latest.json` the same way.
An update installs over the old app only with the same key and a higher versionCode: a new key strands every installed copy. When
the Google Play app is created, give Play App Signing this same key (or add Play's key to `android_cert_sha256` and accept that site
installs cannot update from Play). No `apple-app-site-association` until the Apple Team ID exists (`app/well-known/README.md`).

---

## 6. Roll back

CI already rolls a deployment back by itself when the new one fails its key pages or health checks (4.1–4.3). Everything else is
done by the owner or a developer with Cloudflare access; a coding session proposes these steps, it does not run them:

| Problem | Do this |
|---|---|
| A bad change in the repository (any kind) | `git revert <sha>` (a merged PR: GitHub's «Revert» button), open a PR, merge: CI deploys the previous state. This is the normal way: it keeps the repository and the live site in agreement |
| The live site is broken right now | Cloudflare dashboard → Workers & Pages → `madeinegyptgate` → Deployments → «Rollback to this deployment» on the last good one (instant). Then fix with a revert, because the next push deploys again. With a token: `deploy/deploy.sh deployments`, `deploy/deploy.sh rollback <id>` |
| The API Worker is broken | Dashboard → Workers & Pages → `janna-lookup` → Deployments → roll back (or `cd worker && npx wrangler rollback`), then revert in git. Note from README-DEPLOY 11.5: an older version may not know newer routes such as `/data/overlay.js` / `/media/u/*` |
| `migate-intel` is broken | Same, Worker `migate-intel` |
| A migration went wrong | Stop. Migrations are additive, so the old code ignores new tables: usually nothing needs undoing. A full restore (the Time Travel bookmark in the run's `BACKUP.json`, or the exported `.sql`) rewinds the WHOLE database and loses every write since; only a developer, with the owner's OK. Never `DROP` on production |
| The app's service worker misbehaves (stale files on phones, something stored that should not be) | `seo/config.json` `"pwa": {"kill": true}` in a PR, merge: `deploy-site` ships the kill worker, which empties its caches and unregisters itself at each phone's next visit (1.11). Set it back to `false` once fixed. Do not just `git revert` the app: a build without `/sw.js` leaves the installed worker running on the phones that have it (a browser keeps its worker when the update check gets a 404); ship the kill switch first |
| A Control Center edit | Undo it in the Control Center (the audit log «سجل العمليات» shows the before/after); SEO overrides: «استرجاع» in `/seo-admin/` |
| WhatsApp misbehaves | «إيقاف» in «مفاتيح الخدمات» (instant); hard stop: `WA_DRY_RUN = "1"` in `worker/wrangler.toml` + a deploy |

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Pillow is missing` | `python3 -m pip install pillow` |
| `the generator's own validation found problems` | The list is printed above the message and in `build/seo-stats.json` `problems`; fix the generator or the data |
| `MIG_BUILD_DIR … is not empty and was not made by 'deploy.sh build'` | Use a new empty directory |
| `could not pull …/data/overlay.js` | Network blocked or the site is down. Locally only a warning (the previous `build/overlay.js`, or none, is baked in); in CI the run stops: re-run it later (`CI_ALLOW_NO_OVERLAY=1` deploys anyway) |
| A CI run ends with exit 3, «checked, NOT deployed» | `CLOUDFLARE_API_TOKEN` missing or rejected: everything passed, nothing was deployed |
| A CI summary says «rolled back to …» | The new deployment failed its key pages or health checks and CI put the previous one back. The site is fine; the commit is not. Read the run's log artifact, fix, push again |
| Stage error `privacy_pages` / `jsonld_privacy` | A phone or e-mail reached public output: remove it at its source. A reviewed false positive only → `deploy/privacy-allow.txt` |
| `broken_links` / `head_links` / `jsonld_links` / `missing_assets` | A page links to something the build does not have; the report names the page and the link |
| `stale_flat_pages` / `unlisted_pages` / `static_rows_in_generated_trees` | Leftovers of an older build: build into an empty directory |
| `redirect_not_in_edge_map` | A `_redirects` rule the edge map lacks (production would 404): fix in the generator |
| `legacy_live_pages` | The build wrote `panel.html` / `login.html`: never do that (2.8) |
| `functions` test «the Worker's own code is importable here» fails with `postal-mime` | Run `cd worker && npm ci` first |
| `npm ci` fails in `worker-intel/` | No lockfile and no dependencies: use `npm test` |
| `wrangler` refuses to start: Node too old | Node 22.12+ |
| An `/en/` page disappeared | It failed `en_gate` (2.2): add the missing dictionary entries; the 301 to Arabic exists only if `seo/lastmod.json` remembered the page (2.9) |
| English page shows Arabic text | Missing `en_add` pair (app page) or dictionary entry; check in the browser with `?lang=en` |
| A Control Center edit is not on a generated page | Expected until the next site build (it pulls `/data/overlay.js` first); app pages show it within a minute |
| `/api/<x>/health` 404 after a deploy | The family has no route on that host in `worker/wrangler.toml` |
| `/api/seo/health` 503 `auth_off` / `kv_off` | Pages secret `ADVISOR_SECRET` missing (owner sets it; it applies from the next deploy) / `SEO_KV` binding missing because the stage did not ship `wrangler.toml` |
| CI fails with 10000 / authentication errors from wrangler | The `CLOUDFLARE_API_TOKEN` secret is missing, expired, or lacks Pages / Workers / D1 edit on the account: the owner replaces it in GitHub → Settings → Secrets and variables → Actions |
| Stage error `pwa` / build problem `pwa: …` | The installable app (1.11): a missing icon → `python3 tools/app_icons.py` and commit `img/app/`; a worker that would handle a private path or store `/data/overlay.js` → `PWA_DEF` / `SW_TPL` in `seo_build.part.py`; a shortcut without a page → `pwa_manifest` |
| `Pages only supports up to 20,000 files` | Free plan limit (today about 10,000 files are uploaded) |

Read-only health checks of the live system: `curl -s https://madeinegyptgate.com/api/janna/health` (same for `advisor`, `auth`,
`inquiries`, `meetings`, `wa`), `https://madeinegyptgate.com/_seo/pages.json` (its `built` time = the live build). The full smoke test
`bash deploy/deploy.sh smoke https://madeinegyptgate.com` is GET/HEAD only except one bot `POST /api/ev/pv` that records nothing;
CI runs it after each site deploy, so run it yourself only when the user asks.

---

## 8. Where to read more

| Topic | File |
|---|---|
| Deploy runbook, secrets, cutover, rollback, deploy 2 (Control Center, payments, WhatsApp) | `deploy/README-DEPLOY.md` |
| Worker APIs, security model, memory policy, service keys, payments, e-mail | `worker/README.md` |
| Control Center contract (roles, API, overlay, payments, plans) | `docs/janna/ACC-CONTRACT.md` |
| SEO layer (static + edge) | `docs/janna/SEO-SPEC.md`, `docs/janna/SEO-RESEARCH.md` |
| Janna & Bassem | `docs/janna/JANNA-BASSEM-MASTER-SPEC.md`, `docs/janna/JANNA-SPEC-EN.md`, `docs/janna/JANNA-PERSONA-AR.md`, `docs/janna/INTERACTIVE-PLAN.md` |
| Firewall and security layers | `docs/janna/SECURITY.md` |
| Owner decisions and open items | `docs/janna/BACKLOG.md`, `docs/janna/REVIEW-NOTES.md` |
| Intel centre | `worker-intel/INTEGRATION.md` |
| WhatsApp templates | `docs/janna/WHATSAPP-TEMPLATES.md` |
