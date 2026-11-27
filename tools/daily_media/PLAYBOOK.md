# «التحديث اليومي» — the daily content update of madeinegyptgate.com

Every day a scheduled Claude session adds the NEW real items of the last days and pushes them to `main` itself
(owner's explicit decision, 2026-11-27: «انشر مصر مباشرة من غير موافقة» — publish the daily update directly, without a pull request;
it covers ONLY this daily data update, after the checks below). `deploy-site` publishes the site; the data files below are also in
`deploy-worker`'s paths, so Janna's index is rebuilt too. Read the repository's `CLAUDE.md` first: its rules win over anything here.

| Kind | File the merge script writes | Shown on |
|---|---|---|
| Industry news | `data/real.js` → `REAL.news` | `/news/` (+ `/en/news/`), home page, Janna / Bassem search |
| Procurement news (contract awards) | `data/real.js` → `REAL.awards` (and news items with category «مشتريات») | `/awards/`, `/news/` |
| Project news (new projects with their latest news) | `data/projects.js` → `MIG.PROJECTS_REAL` | `/projects/`, project news |
| Exhibitions & events in Egypt | `data/real.js` → `REAL.events` | `/events/` |
| Videos | `data/videos.js` → `MIGVIDS` (+ `img/yt/<id>.jpg`) | `/videos/` |

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
6. Never touch anything else: no legal text, prices, plans, personas, workflows or code; never production data (CLAUDE.md 0).

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
   - **awards** (up to 8): contract awards in Egypt (who won, who awarded, value in EGP million or USD million when published), last 7 days.
   - **projects** (up to 6): newly announced or newly awarded Egyptian projects, last 7 days, each with one news line.
   - **events** (up to 5): industrial exhibitions / conferences in Egypt whose next edition's dates are now published on the
     official site or venue calendar (EIEC, Egypt International Exhibition Center; Cairo International Convention Centre).
   - **videos** (up to 8): YouTube videos from official / reputable channels about Egyptian industry, last 14 days. Verify each with
     `curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"` (must be 200).
4. Write the verified items as JSON arrays in a NEW scratch directory (outside the repo), file names and fields exactly:
   - `new-news.json`: `title_ar, summary_ar, title_en, summary_en, source_name (as written in the data, e.g. «Daily News Egypt»,
     «أموال الغد», «الأهرام», «اليوم السابع», «المصري اليوم»), date (YYYY-MM-DD), category_ar (صناعة|استثمار|تعميق التصنيع
     المحلي|صادرات|تقنية|معارض|طاقة|مشتريات), region_code (a governorate code of data/regions.js, e.g. CAI GIZ ALX SUZ, or "" for
     national), url, image_source_url`
   - `new-awards.json`: `title_ar, title_en, winner_ar, winner_en, awarding_entity_ar, awarding_entity_en, value_egp_million,
     value_usd_million (numbers or null), region_code, city (Arabic), date, source_url`
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
   with a message like «Daily update: N news, N awards, N projects, N events, N videos» and `git push origin main`. Only `data/` and
   `img/yt/` may be in that commit; anything else goes through a pull request as CLAUDE.md says.
8. The English check, before the push: in the build of step 6 open `<dir>/site/news/index.html` and `<dir>/site/en/news/index.html`
   (Playwright or `python3 -m http.server`): the newest item is there and the English page shows no Arabic line except the language
   button. A line in Arabic → add the missing dictionary pair (`data/i18n-en.js`, load / dump the JSON after `window.I18N_EN=`) and
   rebuild. After the push, wait for the `deploy-site` and `deploy-worker` runs of the commit
   (`gh api "repos/kw0106144-tech/madeinegyptgate/actions/runs?head_sha=<sha>"`) and open https://madeinegyptgate.com/news/ and
   https://madeinegyptgate.com/en/news/. A failed run → read its log, fix with a new commit (or `git revert`), never deploy by hand.
9. Final report: the commit, what was added (counts + titles) and what was dropped.
