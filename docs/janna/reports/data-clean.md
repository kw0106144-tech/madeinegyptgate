# Data clean-up: Made in Egypt Gate (2026-11-18), results and report

The data clean-up is finished, rebuilt and tested in Arabic and English with zero console errors. The tenders page still shows «384 مناقصة مفتوحة» (only 9 are open), because its page code counts every non-closed row as open. That and the other page-code fixes are in TEXT-FIXES.md for the integrator.

The harness blocked me from writing `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/dataclean/REPORT.md` (subagents may not write report files), so this message is the report. COUNTS.json and TEXT-FIXES.md were written.

## Answer to the owner
No dataset supports 26,808, «14,820 مصنع» or «11,988 شركة». The real counts are:

| What | Count | Detail |
|---|---|---|
| Platform members | **2,926** | 1,380 «مصنع» and 1,546 «شركة ومورد»; 3,000 raw records minus 74 merged duplicate listings |
| Public-source factories and companies | **99** | Not registered; 6 of them are also members |
| Unique establishments in the directory | **3,019** | Wording: «أكثر من 3,000 منشأة صناعية وتجارية في الدليل» / "More than 3,000 industrial and trading companies in the directory" |
| Contractors | **none in data** | The «المقاولات والإنشاءات» sector has 12 members |
| Verified members | **0** | — |

## Resuming after the interruption
- Re-running the earlier `work/clean.js` from the pristine `orig/` reproduced all 9 changed files byte for byte. The 00:52 state is snapshotted in `snap-0052/`.
- `orig/` and `orig-pristine-0056/` were only read.
- The `oldrfq.js` shrink (17,226 → 7,019 bytes) is justified record by record in the RFQ table below. Nothing was restored.

This run then changed 4 files (oldfac, oldfacd, facx, regions):
- Merged members now keep every distinct Arabic description. English shows the translated parts; 11 records are only partly translated.
- I closed a dangling «(» in one name.
- The MOPCO source URL is now https.
- The 38 canonical sectors force their English names, for example "Iron, Steel & Metals".
- `data/regions.js` now supplies English at runtime for the new honest wording (labels such as «غير محدد الموعد» and «منتجاً من أعضاء المنصة»).

## Before → after
| Dataset | Before | After |
|---|---|---|
| Members (`MIGOLDFAC` / `MIGOLDFACD`) | 3,000 | **2,926** (67 groups merged: same normalised name and same governorate; richest record kept) |
| – factories / companies & suppliers | 1,437 / 1,563 | **1,380 / 1,546** |
| – no governorate | 226 | **224**, flagged incomplete, never guessed |
| – with logo / with product list | 464 / 103 | 456 / 102 |
| – sector labels | 162 raw | **37 canonical**; original kept in field 12 |
| Public-source (`MIGFACX`) | 99 | 99 (canonical sectors, https websites) |
| Products (`MIGOLDP` / `MIGP2F`) | 193 | **183** (10 test rows removed); 81 real product names, 102 «منتجات <شركة>» photo galleries |
| Tenders (`MIGTEND`) | 438 | **436** (2 exact duplicates removed) |
| – status | stored: سارية 384, منتهية 51, تنتهي قريباً 3 | **from the deadline: سارية 7, تنتهي قريباً 2, منتهية 52, غير محدد الموعد 375** → **9 open** |
| RFQs (`MIGRFQ`) | 35 | **5** |
| Zones | 64 | 64, unchanged (13 are free zones) |
| Offers | 102 | 102 («DK» → «DKH» on 3 offers) |
| Registry (`REG`) | 91 / 45 / 0 | unchanged (the company list mirrors `MIGFAC`) |
| Factories page / suppliers page / home «dir» counter | 3,024 / 1,563 / 3,000 | **3,005 / 1,546 / 2,926** |

## What changed in the data
Global names and fields 0–10 are unchanged everywhere; new fields are only appended.

**Cleaning applied to all owned files**
- Arabic display text: trimmed, single spaces, Latin digits, stray leading kasra removed, « ـ » turned into « – », spacing around parentheses fixed. 81 member names changed.
- English casing fixed on 12 member names and 12 product names; acronyms left alone.
- Hamza and ة/ى variants are unified only inside the key used to find duplicates, never in displayed text.
- 231 raw sector labels across all datasets map to 38 canonical sectors, published as `MIGSECTORS`.
- Incomplete-data flags, read with `MIGINC.list(flags)` (defined in `data/regions.js`): `MIGOLDFAC[11]` (225 records), `MIGOLDP[7]` (42), `MIGTEND[12]` (375), `MIGRFQ[11]` (5).
- The governorate alias «اسكندرية» is added.

**Members (`oldfac.js`, `oldfacd.js`)**
- New globals: `MIGOLDFAC_MAP` (old index → new), `MIGOLDFAC_URLMAP` (merged listing URL → kept URL), `MIGOLDP_MAP`.
- Kept apart, not merged: 3 generic-name pairs that describe different businesses, same-name branches in other governorates (32 name groups), and the 23 «بافاريا مصر» branches.
- 918 SEO title prefixes stripped from descriptions. English is still found for 2,440 of 2,923 non-empty descriptions (before: 2,499 of 3,000).
- The placeholder description shared by 5 listings was emptied and flagged.
- 5 image file names removed from product lists.

**Products (`oldprod.js`)**
- Typos fixed («منتبجات», «شركه شركة», «منتج شركة»).
- `MIGP2F` rewritten in step with the merges.
- Kept but flagged as doubtful: «CT», «خمسة جنية ذهب», «بطاطا مقلية».

**Personal data:** broad scans found no phone numbers, e-mails or WhatsApp details anywhere, so nothing needed moving.

## Removed records and why
The full list with original content is in `logs/dropped-records.json`. Originals are in `orig/`.

All 30 removed RFQs are «طلب سعر مجمع» cart bundles with no product, quantity, delivery terms or deadline. The page was already hiding them.

| Buyer name | Count | Why removed |
|---|---|---|
| «شركة البيه» | 12 | Test burst 25–31 July; details empty or «اريد عرض سعر» |
| «شركة النجمة الذهبية» | 4 | Test burst; details are only a generic phrase |
| «شركة العالمية» | 4 | Test burst; details are only a generic phrase |
| «شركة الامل» («اريد عرض حلو») | 2 | Test burst |
| «Right-website» | 2 | Test burst, empty |
| «شركة الكوثر» | 1 | Test burst |
| «شركة النجم الاحمر» | 1 | Test burst |
| «Pioneer Technical Co» | 1 | Test burst, empty |
| «شركة الكوكو» | 1 | Garbage: its name repeated 7 times as the details |
| «UNITED NATIONS» (2026-08-24) and «شركة المسوري للتوريد» (2026-11-14) | 2 | Simply empty |

The last two may not be tests. They can be restored from the log, but they would show only a title.

| Other removals | What | Why |
|---|---|---|
| 10 products | #152 «lkkkkkkk», #180 «لاب توب del2022» (listed by a food factory), #181, #182, #183 «منتج 111», #184 «منتج 66666», #185 «منتج 43434», #187, #188, #189 | Consecutive test uploads with placeholder names |
| 2 tenders | Refs 35914943 and 35914946 | Exact duplicates |
| 74 member rows | Merged into the kept record, not deleted | Every old index resolves through `MIGOLDFAC_MAP` |

## Tests
- **Validation script** (`check/validate.js`): all checks pass. It covers row shapes, the old→new map, unique https URLs, all 27 governorate codes, incomplete fields flagged, canonical sectors, tender status matching the date rule, ISO dates, `MIGP2F` links and no contact patterns.
- **Build:** `python3 site.py` succeeded at 01:13, 01:19 and 01:26.
- **Playwright, Arabic and English, 1366px:**
  - Pages: home, about, factories, company #0, #114, #153, #543, #1892, #2314 and #x5, tenders, rfqs, market, suppliers, region CAI and ALX, city ic-10th-of-ramadan and ic-sadat-city.
  - **Zero console or page errors.**
  - Counts and filters work: factories by type, governorate, sector and search («قاضيكو» → 1 merged record); tenders by status and sector; suppliers by sector.
  - English sector names display.
  - No built page contains 26,808, 26,000, 26 ألف, 14,820 or 11,988. Another agent's build-time code computes the about page's 1,380 / 1,546 from this data.

## Open items for the integrator
Exact locations and Arabic/English wording are in TEXT-FIXES.md.

**High:**
1. `oldlists.part.py:64` shows «384 مناقصة مفتوحة» and «46 جهة طارحة»; it should be 9 and 45. On the same page, add `<option>غير محدد الموعد</option>` (line 31) and give that status a grey chip in `stc()` (line 54). `data/janna.js:1952` has the same open-count bug.
2. `pages.part.py:227` on factories.html shows «500+ منتج في السوق» and «200+ طلب توريد مباشر». The real counts are 183 and 5.
3. Regenerate what still uses the old member indices:
   - `worker/src/data.json`: run `node worker/build-index.js`.
   - Janna's knowledge base: copy `dataclean/kb/*.md` (12 files) into `docs/janna/kb/` and `kb-upload/`.
   - Fix the 6 hand-written knowledge-base lines with 14,820 / 11,988 / 26,000, then re-upload to Anam.

**Medium / low:** about «3000» and the zones label, home page fallback numbers 193/88/15, «بيانات غير مكتملة» chips via `MIGINC`, "سارية" → "Open" in English, developer guides and SEO-SPEC numbers, and `admin.part.py` (1,156, a fake «14 مناقصة» activity row, a leftover «إماراتي» column).

**Index change:** member ids are now 0–2925. Any redirect rule or shared `company.html#N` link outside the repo must be rebuilt from `legacy-company-map.json` or `MIGOLDFAC_URLMAP`. The SEO layer should 301 merged listings' URLs to the kept record.

**Generator warning:** `tools/gen_old_eg.py` and `tools/gen_real_eg.py` overwrite these data files. If either is re-run, re-run `work/clean.js` afterwards. It reads `dataclean/orig/`, so archive the `dataclean/` folder: the scratchpad is not durable.

## Files
Everything is in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/dataclean/`:
- COUNTS.json
- TEXT-FIXES.md
- legacy-company-map.json
- kb/
- logs/dropped-records.json, logs/clean-log.json
- work/clean.js (with norm.js, sectors.js, counts.js, kbgen.js, droplog.js)
- check/validate.js
- test/t4.js (results in test/r5.json, screenshots in test/shots/)
- orig/ and orig-pristine-0056/ (pristine originals)

The cleaned data files are in `/home/user/madeinegyptgate/data/`: oldfac.js, oldfacd.js, oldprod.js, oldtend.js, oldrfq.js, facx.js, factories.js, offers.js, regions.js. zones.js and registry.js are unchanged.