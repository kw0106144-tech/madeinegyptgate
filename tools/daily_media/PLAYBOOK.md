# «التحديث اليومي» — the daily content update of madeinegyptgate.com

Every day a scheduled Claude session adds the NEW real items of the last days and pushes them to `main` itself
(owner's explicit decision, 2026-11-27: «انشر مصر مباشرة من غير موافقة» — publish the daily update directly, without a pull request;
it covers ONLY this daily data update, after the checks below). `deploy-site` publishes the site; the data files below are also in
`deploy-worker`'s paths, so Janna's index is rebuilt too. Read the repository's `CLAUDE.md` first: its rules win over anything here.

| Kind | File the merge script writes | Shown on |
|---|---|---|
| Industry news | `data/real.js` → `REAL.news` | `/news/` (+ `/en/news/`), home page, Janna / Bassem search |
| Contract awards, public and private (local, Gulf, international) | `data/real.js` → `REAL.awards` (`market`, `kind`) | `/awards/` (+ `/en/awards/`), home awards |
| Government and semi-government tenders, RFQs and procurement requests in Egypt | `data/oldtend.js` → `MIGTEND` + `data/real.js` → `REAL.tenders` | `/tenders/`, `/tender-item/<id>/`, the governorate pages, home «المرصد الصناعي», Janna |
| Gulf and international tenders and RFQs | `data/real.js` → `REAL.tenders_intl` (`market`) | `/tenders/` (international), `/tender-item/<ref>/`, `/export/` |
| Procurement news and requests; project news of the Gulf and abroad | `data/real.js` → `REAL.news` («مشتريات», «مشروعات», `market`) | `/news/`, home |
| Project news (new projects with their latest news) | `data/projects.js` → `MIG.PROJECTS_REAL` | `/projects/`, project news |
| Exhibitions & events in Egypt | `data/real.js` → `REAL.events` | `/events/` |
| Videos | `data/videos.js` → `MIGVIDS` (+ `img/yt/<id>.jpg`) | `/videos/` |
| Market closes (EGX), every day | `data/real.js` → `REAL.market` (section «Market prices» below) | home ticker, `/bourse/` |

## The rules (owner's decisions — never break them)
1. **Only real, verified items** (CLAUDE.md 2.6). Open every article / page yourself (curl or WebFetch) and take the date and every
   number from it. Never invent, never "sample", never guess a date. Can't verify → drop it.
2. Every item keeps its **source URL**. Never a phone number, WhatsApp number or e-mail in any text (CLAUDE.md 2.5).
3. **No duplicates**: the merge script drops a URL or title already in the data; also do not add a second article about a story
   already covered (read the latest items first).
4. Arabic is Modern Standard Arabic; every Arabic text gets a faithful English twin (`*_en` fields), which the script writes into
   `data/i18n-en.js` (numbers become `{n}`). **When the Arabic says مصر / مصري / المصرية, the English must say Egypt / Egyptian**
   (the generator rejects it otherwise and the `/en/` page disappears); the script drops a pair that breaks this and says so.
5. Nothing political or unrelated to industry, trade, energy, construction, procurement and the industrial economy of Egypt.
6. Never touch anything else: no legal text, plan prices, plans, personas, workflows or code; never production data (CLAUDE.md 0).

## Steps
1. `cd` to the repository root (`kw0106144-tech/madeinegyptgate`), `git checkout main && git pull --ff-only origin main`.
2. Read what is there: the newest 30 `REAL.news`, the newest 15 `REAL.awards`, all `MIG.PROJECTS_REAL` names, all `REAL.events`
   (name_en + start_date), all `MIGVIDS` ids. Note today's Cairo date.
3. Research (WebSearch + open each page). Targets per day — fewer is fine, **zero is fine** when nothing new is real:
   - **news** (up to 15): Egyptian manufacturing, industrial investment, Ministry of Industry / IDA / GAFI / SCZone decisions,
     industrial zones and cities, exports, localisation of industry («تعميق التصنيع المحلي»), energy industry, construction
     materials, food manufacturing; published in the last 3 days. Sources: ahram.org.eg, youm7.com, almasryalyoum.com,
     amwalalghad.com, dailynewsegypt.com, egypttoday.com, english.ahram.org.eg, zawya.com, sis.gov.eg, cabinet.gov.eg.
     Procurement / tender news can use category «مشتريات».
   - **procurement, every day** (tenders, RFQs and procurement requests, contract awards, procurement and project news — local,
     Gulf and international): section «Procurement» below, with its sources, targets and fields.
   - **projects** (up to 6): newly announced or newly awarded Egyptian projects, last 7 days, each with one news line.
   - **events** (up to 5): industrial exhibitions / conferences in Egypt whose next edition's dates are now published on the
     official site or venue calendar (EIEC, Egypt International Exhibition Center; Cairo International Convention Centre).
   - **videos** (up to 8): YouTube videos from official / reputable channels about Egyptian industry, last 14 days. Verify each with
     `curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"` (must be 200).
4. Write the verified items as JSON arrays in a NEW scratch directory (outside the repo), file names and fields exactly:
   - `new-news.json`: `title_ar, summary_ar, title_en, summary_en, source_name (as written in the data, e.g. «Daily News Egypt»,
     «أموال الغد», «الأهرام», «اليوم السابع», «المصري اليوم»), date (YYYY-MM-DD), category_ar (صناعة|استثمار|تعميق التصنيع
     المحلي|صادرات|تقنية|معارض|طاقة|مشتريات|مشروعات), region_code (a governorate code of data/regions.js, e.g. CAI GIZ ALX SUZ, or "" for
     national), url, image_source_url`
   - `new-awards.json`, `new-tenders.json`, `new-tenders-intl.json`: section «Procurement» below.
   - `new-projects.json`: `name_ar, name_en, region_code, city, city_en, sector_ar (one of MIG.SECTORS in data/projects.js), stage
     (0 التخطيط … 6, as MIG.STAGES), value_egp_million (number or null), owner_ar/en, contractor_ar/en, consultant_ar/en ("" when not
     published), start, end, update_date, update_ar, update_en, source_url`
   - `new-events.json`: `id (kebab-slug-year), name_ar, name_en, start_date, end_date, city, city_en, region_code, venue, venue_en,
     organizer, sector_ar, sector_en, url, about_ar, about_en, agenda_ar[], agenda_en[], source_url, image_source_url`
   - `new-videos.json`: `id, title_original, title_ar, title_en, channel, date, duration (MM:SS), category_ar (مصانع وجولات|لقاءات
     صناعية|تقارير اقتصادية|مؤتمرات وفعاليات|تقنية وصناعة متقدمة|استثمار وتصدير), governorate, lang (ar|en)`
5. `python3 -I tools/daily_media/merge.py . <scratch dir>` — it prints what it added and what it dropped (and why).
6. Checks (CLAUDE.md 3.2 / 3.3, all must pass):
   `for f in data/real.js data/projects.js data/videos.js data/i18n-en.js; do node --check $f; done`;
   `MIG_BUILD_DIR=<new empty dir>/site MIG_FPROF_MEDIA_REBUILD=0 bash deploy/deploy.sh build` prints `generator validation: 0 problem(s)`;
   `python3 deploy/stage.py stage --site <dir>/site --out <dir>/stage --seo-stats build/seo-stats.json` → `STAGE-REPORT.json` has
   0 errors. Then `git checkout seo/lastmod.json seo/company-media.json` and make sure `git status` shows only `data/` and `img/yt/`.
7. Nothing added → stop, commit nothing. Otherwise, on `main` (fast-forward on `origin/main`): `git add data img/yt && git commit`
   with a message like «Daily update: N news, N awards, N projects, N events, N videos, N tenders, N RFQs» (section «Procurement») and
   `git push origin main`. Only `data/` and
   `img/yt/` may be in that commit; anything else goes through a pull request as CLAUDE.md says.
8. The English check, before the push: in the build of step 6 open `<dir>/site/news/index.html` and `<dir>/site/en/news/index.html`
   (Playwright or `python3 -m http.server`): the newest item is there and the English page shows no Arabic line except the language
   button. A line in Arabic → add the missing dictionary pair (`data/i18n-en.js`, load / dump the JSON after `window.I18N_EN=`) and
   rebuild. After the push, wait for the `deploy-site` and `deploy-worker` runs of the commit
   (`gh api "repos/kw0106144-tech/madeinegyptgate/actions/runs?head_sha=<sha>"`) and open https://madeinegyptgate.com/news/ and
   https://madeinegyptgate.com/en/news/. A failed run → read its log, fix with a new commit (or `git revert`), never deploy by hand.
9. Final report: the commit, what was added (counts + titles) and what was dropped.

## Procurement (every day — owner decision 2026-11-28)
Every daily update covers, every day: **government tenders, semi-government tenders, requests for quotations (RFQs) and
procurement requests (public and private), contract awards (public and private), procurement news and project news**, each for
three markets: **local** (Egypt, the 27 governorates), **Gulf** (all six GCC states: the UAE, Saudi Arabia, Kuwait, Qatar, Oman, Bahrain) and **international** (Africa, Asia, Europe — an Arab country goes to its
continent: Morocco / Sudan → `africa`, Jordan / Iraq → `asia`). Market prices, industry news, videos and events stay as above.

| Category | Local | Gulf | International | Input file → data |
|---|---|---|---|---|
| Government tenders (`kind` gov, `category` tender) | up to 20 | up to 6 | up to 6 | local: `new-tenders.json` → `data/oldtend.js` `MIGTEND` (the tenders list) + its record in `REAL.tenders` (English, dates, source; joined by title); Gulf / intl: `new-tenders-intl.json` → `REAL.tenders_intl` |
| Semi-government tenders (`kind` semi-gov: state-owned / government-linked companies) | up to 10 | up to 4 | up to 4 | same files |
| RFQs and procurement requests (`category` rfq; `kind` gov / semi-gov / private) | up to 15 | up to 5 | up to 5 | same files |
| Contract awards, public and private (`kind`) | up to 8 | up to 4 | up to 4 | `new-awards.json` (`market`) → `REAL.awards` |
| Procurement news and requests (public and private) | up to 5 | up to 3 | up to 3 | `new-news.json`, `category_ar` «مشتريات» (+ `market`, `country_*` abroad) → `REAL.news` |
| Project news | up to 6 (`new-projects.json` → `MIG.PROJECTS_REAL`) | up to 3 | up to 3 | Gulf / intl: `new-news.json`, `category_ar` «مشروعات», `market`, `country_*` |

The targets are ceilings: **up to N new verified items per day, never pad**. Zero is a correct answer for a category on a day when
nothing new and real was published. An item counts only when its own page was **opened that day** and every field below was read
on it (no item from a search snippet, a mirror alone, memory or an older list). A mirror or aggregator may only lead you to the
notice: open the official notice and take the reference number and the dates from it.

**Sources, local (Egypt, the 27 governorates)**
- Government: the government e-procurement portal (etenders.gov.eg, «البوابة الإلكترونية للتعاقدات الحكومية», Law 182/2018:
  notices and award results), the Unified Procurement Authority (upa.gov.eg), and the tender pages of ministries and authorities
  (New Urban Communities Authority, National Authority for Tunnels, Egyptian National Railways, SCZone sczone.eg, the Suez Canal
  Authority, the governorates).
- Semi-government (public-sector companies): the Egyptian Electricity Holding Company and its transmission (EETC) and distribution
  companies, the Holding Company for Water and Wastewater and its affiliates, EGPC / EGAS and the petroleum companies, the holding
  companies of the Ministry of Public Business Sector (milling, metals, chemicals, textiles), the port authorities.
- Private (`kind` private): RFQs / EOIs that companies publish on their own procurement pages.
- Procurement news: Al-Ahram, Amwal Al Ghad, Enterprise, Daily News Egypt, the Cabinet and the ministries' pages, MEED, Zawya.

**Sources, Gulf** (official portals of the GCC states; their national oil, power and water companies)
- Saudi Arabia — Etimad (tenders.etimad.sa, also its award results «نتائج الترسية»), Saudi Aramco, SABIC, Ma'aden, NEOM, SEC, NWC
- UAE — the federal Digital Procurement Platform (procurement.gov.ae), Abu Dhabi ADGPG (ADERP), Dubai eSupply (esupply.dubai.gov.ae), DEWA, ADNOC, EWEC / Etihad WE
- Kuwait — the Central Agency for Public Tenders (capt.gov.kw) and its notices in the official gazette Kuwait Al-Youm, KNPC / KOC / KIPIC tenders
- Qatar — Monaqasat (monaqasat.mof.gov.qa), QatarEnergy, Kahramaa, Ashghal
- Oman — the Tender Board / Esnad (etendering.tenderboard.gov.om), OQ, Nama, Oman LNG
- Bahrain — the Tender Board (tenderboard.gov.bh), Bapco Energies, EWA, Alba

**Sources, international**: World Bank procurement notices (projects.worldbank.org → «Procurement notices», Invitation for Bids /
Request for Bids / Request for Quotations; awards: «Contract award» notices), African Development Bank (afdb.org → «Project-related
procurement» and «Corporate procurement»), UNGM (ungm.org/Public/Notice: UN agencies' tenders and RFQs), UNDP (procurement-notices.undp.org),
UNICEF Supply Division, UNOPS (esourcing.unops.org), EU TED (ted.europa.eu: contract notices and contract award notices; goods of
industrial sectors), Islamic Development Bank (isdb.org project procurement), EBRD (ecepp.ebrd.com), Asian Development Bank (adb.org
tenders / CSRN). Goods, equipment, materials, supply & installation and works that factories and suppliers can bid on; skip pure
consultancy, staffing, cleaning and catering.

**Awards**: the result pages of the same portals (etenders.gov.eg award results, UPA, EETC / EEHC / NUCA announcements; World Bank «Contract award», TED «Contract award notice»), the
awarding entity's or the winner's own announcement, and reputable business press (MEED, Zawya Projects, the national news agencies).
An award names its winner and its awarding entity; the value only when the source publishes it (`value_million` + `currency`).

**Fields** (the merge script refuses an item without its required fields, with a reason):
- `new-tenders.json` (local) and `new-tenders-intl.json` (Gulf, international), one object per notice: `ref` (the notice number),
  `category` (tender|rfq), `kind` (gov|semi-gov|private), `title_ar`, `title_en`, `title_original` (as published), `entity_ar`,
  `entity_en`, `region_code` (a governorate code of `data/regions.js`, required), `procurement_type_en`, `booklet_price_egp` / `bid_bond_egp` (numbers, when published), `description_ar` / `description_en` (optional), `city`, `city_en`, `sector_ar`, `sector_en`, `publish_date`, `closing_date` (YYYY-MM-DD, from the notice),
  `procurement_type` (as published, e.g. «Open tender», «RFQ», «مناقصة عامة»; required for an RFQ), `estimated_value` + `currency`
  (ISO code, only when published — never a guess), `source_url` (https: the official notice or its portal page), `detail_url` (https,
  the notice itself, when it has its own address), `via` (where you found it). Gulf / intl also: `market` (gulf|africa|asia|europe),
  `country_ar`, `country_en`, `source_name` (e.g. «World Bank – Procurement Notices»).
- `new-awards.json`: `market` (local|gulf|africa|asia|europe), `kind` (gov|semi-gov|private: who awarded), `ref` (the tender /
  contract number when published, else ""), `title_ar`, `title_en`, `winner_ar`, `winner_en`, `awarding_entity_ar`,
  `awarding_entity_en`, `sector_ar`, `sector_en`, `region_code` (local: a governorate code of `data/regions.js`) or `country_ar` + `country_en` (Gulf / intl), `city`,
  `city_en`, `date` (the day the award was published), `value_million` + `currency` (when published), `source_url` (https).
- Procurement and project news abroad: `new-news.json` as above, plus `market` and `country_ar` / `country_en`.

**What the script refuses** (and prints with its reason): a missing required field; a source that is not https; a publish date in
the future; a tender / RFQ whose closing date is today or earlier (the pages count it as closed) or before its publish date; a
duplicate (same reference number + entity, same title + entity, same notice / source page — also against everything already in the
data); an e-mail address, a phone number, or a person's name / contact line («المهندس …», «للتواصل», «Mr …», «contact person») in any
text; a Gulf item from a non-GCC country or an international item from a GCC country; an unknown market, kind or category; a
`status` field. **The status is never stored as text**: the pages derive open / closing soon / closed from `closing_date` every day (MIGTEND field 2 is written by the script with that same rule from field 9, the deadline; the pages recompute it on every visit).
**Egypt**: a local tender's `sector_ar` is one of `MIGSECTORS` (`data/regions.js`; the script fills `sector_en` from it). **English rule** (CLAUDE.md 2.2): an Arabic text that says مصر / مصري has an English twin that says Egypt / Egyptian; the script refuses a procurement, news or project item that breaks it (the generator would drop its `/en/` page).

Commit message: «Daily update: N news, N awards (local / Gulf / intl), N projects, N events, N videos, N tenders, N RFQs (local /
Gulf / intl), N market closes»; the merge script prints these counts (`tenders`, `rfqs`, `awards`, `local`, `gulf`, `intl`).

**Counts on the pages**: never type a number. Every count a page shows (home «المرصد الصناعي», the directory, products, tenders,
RFQs, awards, projects, news) is computed from the data at build time (the part files and the generator; `deploy/stage.py` «hand_counts» / «counts_disagree»); the build refuses a number in front of one of those
words that is not computed (or an approved figure on the check's allow-list (`deploy/stage.py` `COUNT_ALLOW`: today only the plan limits)) and the same words with two different numbers
on two pages.

## Market prices (every day): `REAL.market` → home ticker «أسهم الصناعة» and `/bourse/`
Owner decision 2026-11-28: the prices on the site are REAL closes, refreshed every day; the browser never moves a price and never
shows a typed fallback (no `REAL.market` closes → the ticker is hidden; `/bourse/` lists the names without a price). Exchange:
**the Egyptian Exchange (EGX)** — the indices EGX30 and EGX70 EWI and the EGX stocks of `REAL.market`.
1. List the rows: `symbol`, `as_of_date`, `source_url`, `cross_check_url` of every `REAL.market` row in `data/real.js`.
2. Open each row's source page TODAY: stocks — the stockanalysis.com history page of the row
   (`https://stockanalysis.com/quote/egx/<symbol>/history/`: the newest row's date, «Close» and «Change»; «-» = unchanged, when
   the close equals the row below); indices — the TradingView symbol page (`https://www.tradingview.com/symbols/EGX-EGX30/`,
   `…/EGX-EGX70EWI/`); or the exchange's official page (egx.com.eg) when it opens (it usually answers with a bot check). Check each
   stock against a second source opened today (the TradingView quote feed
   `https://scanner.tradingview.com/symbol?symbol=EGX:<symbol>&fields=close,change,time&no_404=true`; EGX30: Yahoo `^CASE30`).
3. Write `market.json` in the scratch directory: `[{"symbol", "close", "change_pct", "as_of_date" (YYYY-MM-DD of that close),
   "source_url" (https, the page you read)}]`, with `cross_check_url` = the second source when it agreed (otherwise the script
   clears the row's old one).
4. Rules: only numbers read on a page opened today. A page that does not open, does not show the number, disagrees with its
   cross-check, or shows a date older than the stored one → leave that symbol out (it stays as it is, with its own date, and the
   ticker shows that date): never estimate, never copy another day. On Fridays, Saturdays and holidays there is no new close: the
   date simply stays the last trading day (re-running is harmless).
5. `python3 -I tools/daily_media/merge.py . <scratch dir>` (with or without `new-*.json`). It updates only `close`, `change_pct`,
   `as_of_date`, `source_url` (and `cross_check_url`) of rows that exist, never adds or removes a row, keeps the names, and refuses
   an unknown symbol, a close that is not a positive number, a change outside −30…30 %, a date in the future or older than the
   stored one, a non-https source. It prints and writes `<scratch dir>/market-report.txt` (OK / DROP / SAME per symbol).
6. `data/real.js` goes into the daily update commit («Daily update: … N market closes (as of YYYY-MM-DD)»), with the checks of
   step 6 above. After the deploy, look at the home ticker and `/bourse/` (and `/en/`, `?lang=en`): the date shown is the new one.
