AUDIT REPORT: Made in Egypt Gate datasets (read-only; no files edited, no backups made yet)
Profiling scripts are in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/dataclean/ (load.js plus p1–p17.js; load.js runs the data files in a node vm). Today is 2026-11-18.

## 0. Answer to the owner's question
No. None of our data supports 26,808 / 14,820 / 11,988. The biggest member set we have is MIGOLDFAC with 3,000 rows: 1,437 «مصنع» and 1,563 «شركة ومورد». After de-duplication it is about 2,929. The public-source set is 99 more, 5 of which overlap with members. Today the factories page itself computes 3,024 (99 facx plus 2,925 members after its own name dedupe).

## 0b. Constraint that shapes the whole cleaning plan: ids are array positions
- company.html#<i> is the index in MIGOLDFAC. It is used by company.part.py, city.part.py, home2.part.html (NF/PL), pages.part.py mergeOld (oi), sellers.part.py, market.part.html FIDX/FURLI, janna.js:1745, worker/build-index.js and the follow ids (data-follow-id=H).
- MIGOLDFACD is aligned 1:1 by index with MIGOLDFAC (both 3000).
- MIGP2F is aligned 1:1 by index with MIGOLDP (both 193). market.part.html uses product id 1000+i.
- MIGFACX ids are company.html#x<i> over facx's 18 rows followed by MIGFAC minus exact-name dups. Reordering factories.js changes the x-ids.
- So if any row is dropped or merged, rewrite MIGOLDFACD and MIGP2F in the same order, and emit an old→new index map (e.g. window.MIGOLDFAC_MAP). The integrator then makes company.part.py and city.part.py redirect old hashes. The alternative is to keep row positions and add a marker. Either way, no record may be spliced without this.

## 1. oldfac.js: MIGOLDFAC (3000 rows × 11 fields: name, sector, location, type, verified, logoSheet, logoCell, url, desc, products[], govCode)
- **Fill rates:**
  - Fields 0–7 are 100% filled.
  - desc (field 8) is 0% filled; descriptions live in oldfacd.js.
  - products (field 9) is non-empty for 103 rows (135 entries).
  - govCode is filled for 2774 rows. 226 are empty, and in all 226 the location is «جمهورية مصر العربية». These cannot be recovered, because MIGREG.of() gives nothing for them, so mark them «بيانات غير مكتملة: المحافظة».
- **Type:** مصنع 1437, شركة ومورد 1563. Nothing distinguishes contractors.
- **Other fields:** verified is 0 for all 3000. Logos exist for 464 rows (logoSheet 0–4); 2536 have -1.
- **Governorates (raw):** CAI 1315, GIZ 487, ALX 315, empty 226, SHR 222, QLB 188, MNF 56, GHR 40, DKH 33, DMT 21, SUZ 15, PTS 13, ISM 12, BHR 10, FYM 7, AST 6, SHG 6, QNA 4, BNS 4, MNY 4, JSN 4, KFS 4, BBA 3, NSN 2, LXR 1, MTR 1, ASN 1. That is 26 codes; WAD has 0.
  - No location↔code mismatches. Location is only a governorate name in all but about 30 rows (33 distinct values).
- **Sectors:** 162 raw labels. The page's SK() only merges them down to 157, so a real synonym map is needed. Examples of bad labels:
  - «ص.معدنية» (154 rows; abbreviation)
  - «اثاث» / «أثاث ومراتب» / «اثاث منزلى وفندقى ومطاعم (خشبي و معدني )» (stray space before the closing parenthesis)
  - «اكسسوار شاشت تاتش ( موبايل. شاشة سيارة. تابلت» (typo, unclosed parenthesis)
  - «صناعه الدهب», «مقاولات عامة وانشائات», «ادوات منزليه», «حلول رقميه», «خدمات طبيه», «استشارات ماليه», «النفط وغاز»
  - Near-duplicate pairs: «صناعات غذائية» / «المنتجات الغذائية وخاماتها» / «صناعات غذائية – مكرونة ودقيق»; «صناعات بلاستيكية» / «الصناعات البلاستيكية»; «التبريد والتكييف» / «تبريد وتكييف»; «صناعات كيميائية» / «كيماويات» / «خامات كيماوية وغازات»; «أنظمة مكافحة حرائق» / «أنظمة المراقبة ومكافحة الحريق والسرقة» / «صناعة الأمن الصناعي…».
  - Many labels are trade or service categories (insurance, shipping, advertising, consulting, market research), not manufacturing.
- **Duplicates:**
  - Exact normalised name + gov: 52 groups.
  - Looser match (hamza/ة/ى unified, «شركة/مصنع» prefix dropped, punctuation removed) + gov: 66 groups, 71 extra rows. 62 pairs, 3 triples, 1 quad.
  - Examples:
    - #549/#550/#551 «التقدم للصناعات الغذائية» (identical sector and logo)
    - #1926/#1927/#1928/#2925 «شركة قاضيكو للتجارة الدولية ش م م» (4 different sectors; the type differs too)
    - #1009/#1955/#2990 «إتمكو»
    - #727/#730/#1017 «شركة تكنو جروب»
    - #321/#322 «جرين لاين للزجاج»
    - #349/#350 «شركة كيمترا»
    - #114/#442 «آرتكس/أرتكس»
    - #166/#440 «ألدورا/الدورا هاوس»
    - #315/#2975 «للعدد والآلات/والألات»
  - Same name but a different governorate: 14 groups, e.g. #52 SUZ/#750 CAI «دلتا للأنظمة الهندسية» and #161 ALX/#455 PTS «القناة لرباط وأنوار السفن». Keep these as branches and do not merge.
  - «شركة بافاريا مصر فرع …»: 23 branch rows in different governorates, all sharing one description. Keep them, optionally grouped.
  - Only 23 of the 66 groups share a sector, so on merge combine sector labels into a raw field.
  - No duplicate URLs. All URLs are valid https://www.madeinegyptgate.com/factories/… links.
- **Names:**
  - 59 contain tatweel «ـ», mostly used as a separator (« ـ »). Replace that with « – »; do not delete it blindly. An internal one is «شركة ألـ حسن».
  - 2 start with a stray kasra: #63 «ِشركة ألفا ميتال…» and #74 «ِشركة الألومنيوم العربية».
  - 79 names are English-only. Casing problems: «ENKANA PRINTING INKS», «VERA ITALIANA», «MUSHOR», «QEMMAH», «EDGE PRO», «elcosteel», «Egy future», «Hammam industries & Co.», «3M Chemicals group». Keep acronyms such as TSG, STC, G4S, RDI, EDS, MCS, 3M and eSpace as they are.
  - 21 names contain «ش م م». There are no Arabic-Indic digits, double spaces, HTML entities or phone numbers in names.
- **Type vs name:** 794 rows typed «مصنع» have names starting «شركة», and 6 typed «شركة ومورد» start «مصنع». That is informational only; do not reclassify (never invent).
- **products[]:** 5 entries are image filenames: «Cairo_Pac110.jpg», «Cairo_Pac175.JPG», «Cairo_Pac197.JPG», «Cairo_Pac221.JPG», «Cairo_Pac229.JPG». Drop them from display.
- **Personal contacts:** none in any field.

## 2. oldfacd.js: MIGOLDFACD (3000 strings, aligned with MIGOLDFAC)
- None are empty. Average length is 302 characters and the maximum 420, because the importer truncated them: 1507 end with «…», and 1328 have no closing punctuation.
- 918 start with an SEO title prefix «<keyword> | <name> …», e.g. #0 «تشكيل المعادن في السادات | مصنع الرافدون…». Strip the prefix before the first « | » when it is under about 120 characters.
- 5 rows share the placeholder «منشأة صناعية متخصصة في توفير وتوريد المنتجات الصناعية بأعلى مواصفات الجودة.», including «توب باك», «التقدم» ×3 and «سوتكسان». Treat it as an empty description and flag it as incomplete.
- There are 17 duplicate-description groups; most are the duplicate companies above or the Bavaria branches.
- #750 contains a raw «<» («zebra,Bixolon<avery dennison»). It is escaped on render, but clean it to «، ».
- 6 rows have Arabic-Indic digits and 97 have tatweel.
- #2174 contains «(واتس)», but that is a tyre brand, not WhatsApp. There are no phones or emails.
- Rendering: the company page shows the description with esc(), and region.html shows the first 140 characters.

## 3. oldprod.js: MIGOLDP (193 × 6/7: name, desc, cat, sheet, cell, url, [en]) and MIGP2F (193 old-site factory URLs)
- **Fill:**
  - desc is filled for 153 rows, all of the form «من إنتاج X». All 153 producers resolve to MIGOLDFAC, covering 103 distinct members.
  - 40 rows have no producer.
  - English names exist for 5 rows.
  - Images: 9 rows have sheet -1.
- **Categories:** metal 97, other 25, plastic 21, food 20, furn 13, build 5, petro 4, elec 3, cosm 2, med 2, glass 1.
- **Garbage or test rows** (drop them, or flag them so they stop counting):
  - #152 «lkkkkkkk»
  - #180 «لاب توب del2022»
  - #183 «منتج 111»
  - #184 «منتج 66666»
  - #185 «منتج 43434»
  - #182 «منتج الحسينى»
  - #181 «منتج ذكاء اصطناعى»
  - #187 «المنتور برو»
  - #188 «منتج شرق 4»
  - #189 «منتج مصنع شرق»
- **Doubtful rows:** #131 «خمسة جنية ذهب» (no producer), #186 «بطاطا مقلية» (no producer), #127 «CT» (VERA ITALIANA). Mark them incomplete.
  - market.part.html already hides /(.)\1{4,}/ names, but the home counter uses MIGOLDP.length, so 193 is shown.
- **Placeholder titles:** 103 titles are «منتجات <company>» (photo galleries, not product names), with typos:
  - #100 «منتبجات…»
  - #73 and #81 have a leading kasra «ِ منتجات…», and their descriptions say «من إنتاج ِشركة…»
  - #150 «منتجات شركه شركة توب باك…»
  - #161 «منتج شركة…»
  - double spaces in «منتجات  شركة دلتا…» and «…وشركاه ـ  ادارة المشروعات»
- No duplicates or bad URLs. 34 names are Latin-only, e.g. «wheat flour», «Plastic Caps» (casing).
- Honest count: 193 raw, about 180 after dropping the 10–13 test rows. Real distinct named products are fewer, because 103 are company galleries.

## 4. oldtend.js: MIGTEND (438 × 12: ref, type, status, title, entity, govName, sector, booklet, bond, deadline, govCode, url)
- **Fill rates:**
  - booklet and bond are 0/438.
  - deadline, govName and govCode are filled for 61 rows only.
  - 377 rows have no deadline, no governorate and entity «جهة حكومية» (a placeholder).
- **Status is the main problem.** The page (oldlists.part.py stc() and its filter) and janna.js:1931 read the stored status x[2]. Stored values: «سارية» 384, «منتهية» 51, «تنتهي قريباً» 3.
  - All 377 undated rows are labelled «سارية» with no basis.
  - Recomputed from dates against 2026-11-18:
    - open (deadline ≥ today): 9 rows, #377–#385 (#385 closes today)
    - closing within 7 days: 2 rows (#384 2026-11-24, #385 2026-11-18)
    - closed: 52 rows (the 51 plus #386 «توريد إطارات كاوتش», deadline 2026-11-17, now wrongly «تنتهي قريباً»)
    - unknown deadline: 377
  - A new status value such as «غير محدد الموعد» needs oldlists.part.py stc(), its select options and the home «فرصة مفتوحة الآن» counter updated by the integrator.
- **Dates:** all ISO, ranging 2026-01-18 to 2026-12-08.
- **Duplicates:** refs 35914943 ×2 and 35914946 ×2 are exact duplicates (same title); merge them. Refs «OFF:1» and «OFF:», plus «26/2026/2027», are reused by different tenders, so do not dedupe by ref alone.
  - 7 SCZone rows share the generic URL https://sczone.eg/ar. That is valid, but it is not an item URL.
  - The 5 «عملية توريد ادوات نظافة» rows have different refs; keep them all.
- **Types:** «مناقصة عامة» 356, «مناقصة» 64, «ممارسة عامة» 17, «مناقصة محدودة» 1.
- **Sectors:** 44 labels with near-duplicates, e.g. «الإنارة» / «الإنارة والأعمدة المعدنية»; «معدات السلامة والإطفاء» / «معدات الوقاية والسلامة»; «الآلات والمعدات» / «الماكينات والمعدات الصناعية» / «المعدات الصناعية»; «الطباعة والتغليف» / «البلاستيك والورق والتغليف».
- **URLs:** 377 are percent-encoded madeinegyptgate.com URLs (decoding them for display is optional). All are https. There are no contacts. One title contains tatweel.
- The home page hard-codes «806 مناقصة», which matches nothing: we have 438 local rows.

## 5. oldrfq.js: MIGRFQ (35 × 10/11: no, date, title, details, delivery, qty, deadline, gov, url, sector, [en])
- **Fill:** delivery, qty, deadline and gov are 0/35. details 18/35. English 5/35. Dates are ISO, 2026-07-25 to 2026-11-14.
- **Bundle rows:** 30 of 35 are «طلب سعر مجمع: <buyer> (RFQ-2026-xxxx)». Their details are empty (17) or junk such as «اريد عرض سعر», «اريد عرض حلو», «احتاج طلبية ضرورى» and «شركة الكوكوشركة الكوكو…» (RFQ-2026-9422).
  - Buyers named include «شركة البيه» ×11, «Right-website» ×2 and «UNITED NATIONS». These are test or spam entries.
  - The page filter (oldlists.part.py:49) already hides them, so only 5 RFQs are visible, yet the home page shows «35 طلب عرض سعر» twice.
- Only 5 RFQs are real: 34207, 34203, 34052 and 2 more. Their details are truncated mid-word, e.g. «Trellebo», «(Commerc».
- There are no phones or emails; the header says contacts were removed.
- **Sectors:** «المواد والمنتجات الصناعية» 30 (all the bundles); the other sectors have 1–2 each.

## 6. facx.js: MIGFACX (18 own rows plus MIGFAC appended at runtime, minus 10 exact-name dups = 99 in list)
- No missing governorates; every location resolves through MIGREG.of().
- verified and logo are 0/empty for all rows. Websites are filled for 16 of the 18 own rows, as bare domains.
- One own source URL is not https.
- Sector vocabulary differs from MIGFAC: «الأغذية والمشروبات» vs «الصناعات الغذائية والمشروبات»; «الأدوية» vs «الصناعات الدوائية»; «الحديد والصلب» vs «الحديد والصلب والمعادن»; «مواد البناء (الأسمنت)» vs «مواد البناء والأسمنت». This needs the canonical sector map.
- Type: مصنع 9 / شركة 9.
- **Cross-dataset overlap with MIGOLDFAC** (do not double count in totals): «مصر للألومنيوم», «سيناء للمنجنيز», «الإسكندرية للزيوت المعدنية (أموك)», «طنطا للكتان والزيوت», «موبيكا للصناعات المتكاملة».

## 7. factories.js: MIGFAC (91 objects)
- **Fill:** name_ar, name_en, city, region_code, sector_ar, main_products_ar and source_url are 91/91. website is 52/91: 39 null, and all 52 are bare domains without a scheme. Normalise to https:// in data, or rely on the page's existing "https://"+ prefix.
- No duplicate names or websites, and no region↔city mismatches. It covers 25 governorates.
- Sectors use 13 labels.

## 8. registry.js: REG
- **companies (91 × 7):**
  - It is a mirror of MIGFAC, with the same 91 names.
  - Every row has role «تصنيع وتوريد» and field 4 «—» (empty).
  - There is no real contractor or supplier register. The «مقاولون/موردون» counts must come from this (91) or be dropped.
- **agencies (45):** exactly the 45 distinct named entities in MIGTEND. Consistent.
- **awards:** 0 rows. They are filled at runtime from elsewhere, so do not claim awards counts from this file.
- REG also carries helper functions (c, a, money, agSector, agType, awSector). Keep the object shape.

## 9. zones.js: MIGZONES (64)
- **Types:** industrial_area 21, industrial_city 15, free_zone 13, tech_park 7, port_zone 5, investment_zone 3.
- 21 governorates. No bad codes, duplicate ids, duplicate names or coordinates outside Egypt.
- **Fill:** area_km2 53/64, area_text 57/64, website 46/64.
- 12 rows have approx=true, and in these coord_source is prose instead of a URL. That is intentional; do not «fix» it into a URL.
- 6 coordinate collisions between related records, e.g. «ic-sadat-city» and «tp-silicon-waha-sadat». They are plausible because the IDA city points are shared, so mark them approx.
- One row has an extra region_codes array.
- The home page says «64 منطقة صناعية وحرة» (it is set at runtime from length). Wording: only 13 are free zones.

## 10. regions.js: MIGREG (27 governorates)
- No alias collisions.
- MIGREG.of() does not resolve «اسكندرية» (without ال). Add that alias when matching. «الاسكندرية» works.
- Use this file as the canonical gov-code source. It is also the map for normalising «بور سعيد», «6 أكتوبر» and similar spellings.

## 11. offers.js: MIGOFFERS (102)
- **Bad region code:** 3 rows have «DK» instead of DKH: nilestock-womens-wide-leg-sweatpants, nilestock-boys-gabardine-pants and nilestock-men-s-cotton-polo-t-shirt.
- **Legacy clone fields** on all 102 rows: price_sar, price_aed, old_price_*, saudi_made and made_in_uae. All copy the EGP values or made_in_egypt.
  - offers.part.py and seo.js only fall back to them, but made_in_uae=true and saudi_made=true are semantically wrong.
  - Leave them, because generators and fallbacks depend on them, or null the KSA/UAE flags.
- **Dates:** all ISO. valid_to is 30/102 and none has expired. source_checked is 2026-11-17 for all.
- made_in_egypt: true 94, false 8.
- **Fill:** region_codes and lat/lon 75/102. size_unit is missing in 1 row.
- No duplicates, price or discount errors, missing images or non-https source URLs. 12 stores.
- The «contact» regex hits were prices, so there is no personal data. branch_example is a store address, which is fine.

## 12. Personal contact data
None found in any of the owned files. No phone, email or WhatsApp in names, descriptions, products, tenders, RFQs, zones or offers. Nothing needs to move to a non-rendered field. The bundle RFQ titles name buyer companies («شركة البيه» etc.); those are junk, not personal data.

## 13. Hard-coded counts found (for TEXT-FIXES.md; not edited)
- **home2.part.html:**
  - line 622: data-count="26808" «26,808 مصنع وشركة على المنصة»
  - line 635: 193 products (data-k=prod, set from length at runtime, which includes test rows)
  - lines 636 and 748: «35» RFQs; only 5 are real or visible
  - line 748: «806 مناقصة صناعية» (no basis; we have 438) and «15 فرصة مفتوحة» (data-k=open is set at runtime)
  - line 699: «88» factories (data-k=fac is set to MIGFAC.length = 91)
- **about.part.py:**
  - line 145: data-n 14820 and 11988, plus the «46» zones figure (id stZ; the data holds 64)
  - line 205: «+26,000 مصنع وشركة ومورد»
  - line 224: «أكثر من 26 ألف مصنع وشركة ومورد»
- **admin.part.py:138:** «1,156» market products.
- **DEVELOPER-GUIDE.md** and **tools/DEVELOPER-GUIDE.md**, lines 42 and 91: 26,808.
- **docs/janna/kb/:**
  - platform-about.md lines 26, 90, 186 and 201
  - directory-stats.md line 2 («حوالي 26,800»)
  - platform-faq.md line 293
  - platform-services.md line 148
- **docs/janna/kb-upload/:**
  - platform-about.md lines 26, 90 and 186
  - directory-stats.md line 2
- **Other docs/janna files:** REVIEW-NOTES.md lines 4, 18 and 41, SEO-RESEARCH.md and BACKLOG.md are notes; update them only if desired.
- No 26,808/14,820/11,988/26 ألف strings were found in data/*.js, data/i18n-en.js or the i18n JSON files.

## 14. Real counts available now (COUNTS.json candidates)
- **Members (MIGOLDFAC):**
  - 3000 raw: 1437 مصنع, 1563 شركة ومورد
  - about 2929 after merging the 71 loose duplicates
  - 226 with no governorate, 464 with a logo, 0 verified
  - 103 with a product list
- **Public-source factories:** 99 unique (18 facx + 91 MIGFAC, 10 overlapping). 5 also appear among members. The union across directories is about 3,024 as the factories page computes it, about 2,95x after the member dedupe.
- **Suppliers page** (type ≠ مصنع): 1563. **Contractors:** no data.
- **REG:** companies 91 (mirror), agencies 45, awards 0.
- **Products:** 193 raw, about 180 after dropping the 10 junk rows, 153 linked to 103 members.
- **Tenders:** 438 raw, 436 after 2 exact duplicates. By date: 9 open, 2 closing within 7 days, 52 closed, 377 with no date.
- **RFQs:** 35 raw, 5 real.
- **Zones:** 64 (breakdown in section 9).
- **Offers:** 102 (94 made in Egypt, 12 stores).
- **Governorates:** 27.
- Per-governorate and per-sector member counts are in section 1. Recompute them after cleaning.

## 15. Cleaning plan (in order)
1. Back up all 11 files to …/dataclean/orig/.
2. Build the normalisation helpers.
   - The match key unifies أ/إ/آ→ا, ة→ه and ى→ي, removes tatweel and diacritics, collapses spaces, strips the «شركة/مصنع/الشركة/مؤسسة» prefix and removes punctuation.
   - Display text: trim, collapse spaces, remove the leading stray kasra, turn « ـ » into « – », drop other tatweel, convert digits to Latin.
3. Canonical sectors: write a synonym map from the 162 member labels, 26 facx/MIGFAC labels, 44 tender labels and 5 RFQ labels to about 30–35 canonical names. Keep the original label in a raw field (e.g. append it to the row as an extra trailing element, so the shapes and indices stay compatible).
4. Governorates: keep the codes, fix «DK»→DKH, add the «اسكندرية» alias, and flag the 226 «جمهورية مصر العربية» rows as incomplete.
5. Dedupe MIGOLDFAC on loose name + same governorate, keeping the richest row (logo, products, longer non-placeholder description). Merge products, log every merge, rewrite MIGOLDFACD in the same order, and emit the old→new index map (section 0b). Keep different-governorate same-name rows and the Bavaria branches. Dedupe MIGTEND's 2 exact duplicates.
6. Drop or flag junk: the 10 test products (#152, #180–#185, #187–#189), the 5 image-filename product entries, the 30 junk bundle RFQs, and the placeholder description (×5) treated as empty. Log all of it. For MIGOLDP, rewrite MIGP2F in step with any drop.
7. Text fixes: strip the description SEO prefix, fix the product typos («منتبجات», «شركه شركة», «منتج شركة»), correct English casing apart from the acronym whitelist, normalise website domains to https.
8. Tender status: recompute from deadlines against 2026-11-18. Closed if before today; «تنتهي قريباً» if within 7 days; «سارية» otherwise. Undated rows get a new honest value («غير محدد الموعد»); the page code change goes to the integrator. Replace entity «جهة حكومية» with «جهة غير محددة» or keep it and add an incomplete flag.
9. Add an incomplete marker: missing governorate, placeholder or empty description, no producer, or no tender deadline.
10. Write COUNTS.json from the cleaned data, then TEXT-FIXES.md (the section 13 locations with AR and EN replacements), then rebuild and run the Playwright checks (factories, company #0/#549/#x5, tenders, rfqs, market, suppliers, region, city, home, in AR and EN), then REPORT.md.
