# Usefulness patch, final (after the honesty, conversation and exactness reviews)

Files in this folder: `replacements.json` (the spans; built by `../tools/final_replacements.py`), `apply_patch.py` (builds and verifies),
`janna-ar.new.md`, `janna-en.new.md`, `bassem.new.md` (the texts to send), `*.diff` (line diffs against the live records), `plan.json`
(hashes, lengths, every check), `tool-update.json` / `tool-rollback.json` / `tool-29fd5087.read.json` (janna_lookup 29fd5087),
`local-lookups.md` (the real lookup outputs, main and fix/lookup-index), `final.json`, `owner-summary-ar.md`. The pre-review version is in
`pre-review/`. Nothing was written to Anam, the site, D1, KV or R2, and the repository is unchanged.

## 0. What changed after the reviews

The three reviews found the same three blockers, and the fixes are now in the texts:

1. **The screen.** The list pages filter by the whole phrase, so a multi-word query showed an empty list under a spoken count. Now
   janna_search gets ONE word (the main name or industry, with the same governorate): in the DATA rule (JA10 / JE10), the seller analysis,
   the tour (JA3 / JA9, JE3 / JE9), Bassem's first search and screen rule (B2 / B4) and the tool description. She never says the whole
   count is on the screen.
2. **fix/lookup-index (PR-2) and generic words.** One multi-industry query gives 114 on main but 27 on the branch, and its text opens with
   «مفيش نتيجة … فيها كل كلمات البحث؛ أقرب النتائج». Generic words inflate counts on main («صناعات غذائية» 912). Now there is ONE bare
   industry word per janna_lookup call, with 2–3 calls in the same reply, as the companies' activity writes it, never «صناعات / مواد /
   معدات / منتجات». A count is said only if the top results really are that industry, otherwise the names are said without a count. The
   counts are never added up. Verified on both indexes: Giza «تغليف» 78 / 85, «طباعة» 17 / 30, «بلاستيك» 26 / 51 (main / branch). See
   `local-lookups.md`.
3. **Follows and brackets.** «متابعاتي» is gone from Janna's fallback, because on her calls a follow of a word is refused and she would
   not hear it. Bassem keeps his follow, which works by label. No square brackets remain anywhere: «في محافظة حضرتك كذا مصنع…», and the
   script refuses any `[`.

Every valid «should» and nit was applied. The decisions are in final.json `review_points`, and the rejected parts are listed in §7. Three
further fixes came from re-reading the code while applying the reviews:

- The tour's profile script no longer promises a founding year or «how long it has been operating». `seo_fprof.part.py` and
  `company.part.py` show no founding year, and «بيانات التواصل» was already false.
- Bassem's «ابعتلي» ids take only tenders, RFQs and intel results, never factories.
- Janna's and Bassem's «سلندر» ambiguity rule and the link rule now name «الخانة اللي تحت الفيديو», the box the prompts use elsewhere.

## 1. What went wrong in 8bacbfac (Janna AR, 2026-11-20 09:17–09:31 UTC)

Janna made 39 tool calls, all on HIS product words, so she found his competitors or nothing:

- She offered a rubber factory (turn 9), and he answered that it is his competitor.
- She chained keyword after keyword.
- She asked for a photo and described a paperclip button that does not exist.
- She answered «هتفيدني بإيه؟» with a 47 s generic pitch.
- Twice she said «هجرّب / بدوّر» and called no tool.
- He left saying that the call had not helped him and that he was not registered.

What the data held the whole time (`local-lookups.md`): hundreds of companies in the industries he serves. In Giza alone, on main, 78 in
packaging, 17 in printing and 26 in plastics. There were also the cement plants and the sugar plants he named. And there was honestly
nothing for rollers: 0 RFQs, 0 Egyptian or foreign platform tenders, and the only Information Center hit was a roller-shutter door in
Leeds. For a seller, the opportunity is his BUYERS. No rule told Janna that.

## 2. The changes

### Janna AR (13 replacements, 21,796 → 24,466 code points, +2,670)

| ID | lines | what |
|---|---|---|
| JA1 | 36 | speed rule: no «ثواني» / «بدوّر» / any promise to search or open without the tool in the same reply; «ايوه» to «أدوّرلك…؟» = the call in that reply |
| JA10 | 37 | DATA rule: several names → janna_search with the main one only (the screen matches the whole phrase) |
| JA2 | 40 | Information Center: no market covers Egypt and abroad, called in the same reply as janna_lookup, one Arabic retry as before; the platform's foreign tenders via janna_lookup market, no governorate |
| JA3 | 46 | tour 1: one word for the main customer industry; the profile script without founding year or contacts, the quote button «للمشتري» |
| JA9 + JA4 | 47 | tour 2: the product's 2–3 names, no governorate, the main name on the screen; no tender → one sentence, go on. The quote between them (AR-S) is the expressions round's and is not touched |
| JA5 | 53–54 | the core, 8 bullets. (1) search as soon as he says what he sells, then name / governorate (Egyptian sellers) / capacity, and the platform intro after the first results. (2) buyer vs seller: the seller analysis in one reply, (١) rfqs + tenders with 2–3 names and no governorate, (٢) one industry word per janna_lookup with his governorate + one janna_search, (٣) intel without market, no second round. (3) exporter branch: intel with his market + the export-markets page (EUR.1 and pesticide-residue limits; FDA food-facility registration). (4) how to report customers: counts per industry, never summed or «all on the screen», no contacts or promises, the RFQ and its button are for buyers, «أوصلهم إزاي؟» answered, skip tenders / RFQs that are not his product even when the tool says «أقرب النتائج», same-product makers are competitors. (5) nothing found: one sentence + one or two things that exist (customers, RFQ routing after activation, his profile), no keyword chains. (6) «هتفيدني بإيه؟». (7) ambiguity. (8) links |
| JA6 | 55 | value list after his numbers; opportunities «اللي بتتحدّث كل يوم (من الأساسية وطالع)»; no «فرص شغل مستمرة طول السنة» |
| JA7 | 81 | deleted (duplicate of the DATA screen rule); its meaning kept in JA13 |
| JA11 | 85 | the meeting is offered after his first results |
| JA12 | 106 | «مش متأكد» → his own numbers, opportunities if any |
| JA8 | 109–111 | three tool lines in one, with page |
| JA13 | 114 | janna_navigate: open on the screen any section she talks about |

### Janna EN (13 replacements, 25,357 → 28,581, +3,224)

JE1–JE13 are the twins of JA1–JA13, with these differences:

- JE5's customer words are Arabic. The EN map does not know «printing»: main gives 1 result for it in Giza.
- The ambiguity example is "cylinders".
- The JE2 retry uses the Arabic word, no longer "a broader word".
- JE8 renames bassem_intel "the Information Center".

### Bassem (3 replacements, 26,459 → 28,522, +2,063)

| ID | lines | what |
|---|---|---|
| B1 | 19 | rule 9, as JA1 |
| B2 | 24 (+5 bullets) | the first-call search in one step: tenders + rfqs with no governorate, 2–3 names or his sector, intel, customers with one industry word per call, one word on the screen. ids only of tenders / RFQs / intel results. The former B3 bullets are merged here, for the whole call: customers reported honestly, «أوصلهم إزاي؟» with an intro e-mail to an address the member dictates (rule 2), skip what is not his product, the intel view's first result named in half a sentence when unrelated, nothing found → one sentence + what exists (matching RFQs with priority, a follow), «هتفيدني بإيه؟», ambiguity, links |
| B4 | 100 | all names in one query, tenders and rfqs together in the same step, the main name on the screen; nothing → one sentence |

### janna_lookup 29fd5087 (both Jannas; Bassem's b23b3762 untouched): `tool-update.json`

- **Added** page / limit / market, equal in type, bounds and enum to Bassem's copy (`anam/tools.create.json`). The market enum equals the
  Worker's `MARKETS`, and market.description adds «no governorate with a foreign market».
- **Changed** governorate.description. A city keeps only the rows that name it, so the description now says to give its governorate
  instead. It is not a masked value.
- **Kept** every other field, as the read shows it (`tool-29fd5087.read.json`): url, method, awaitResponse, required, query, section with
  7 masked «••••» values (sent back unchanged: Anam keeps the stored factories … cities), and disableInterruptions false.
- **expectedUpdatedAt** is 2026-11-18T09:51:13.805Z, re-read during this finalisation.
- **Description** (1,010 of 1,024 characters): one industry word per call, counts never added up, 2–3 product names in one query, no
  governorate for tenders / RFQs, janna_search with the main word only.
- **Rollback** = the read.
- **Worker effect, unchanged since the design.** A call with page or market gets the Worker's `paged` (masculine) instruction text. Those
  words are instructions to the model; her own speech stays feminine.

## 3. Budget, protected text, both rounds

| persona | old (cp / UTF-16) | new (cp / UTF-16) | net | sha256 (new) |
|---|---|---|---|---|
| Janna AR | 21,796 / 21,797 | 24,466 / 24,467 | +2,670 | b3249e612946b41ad4d4489de6c48c2aea3cc9a650a37a9922d78bbde9351c7a |
| Janna EN | 25,357 / 25,358 | 28,581 / 28,582 | +3,224 | 464f6a36e64f36e3073a231bf2494543cda53e6ae9e107ebd4292f95c246e79c |
| Bassem | 26,459 / 26,460 | 28,522 / 28,523 | +2,063 | 9ab370aae834445d39161e792cfa56b2228062f6849308d863efcfe4641ff99b |

The growth is about twice the design's budget because the reviews' fixes add rules: per-industry counts, the screen, how to reach
customers, the exporter branch, and the early search.

Room came only from duplicates:

| removed | AR / EN |
|---|---|
| the tour's tender tail (JA4 / JE4) | −114 / −163 |
| the narrate-the-screen sentence (JA7 / JE7) | −132 / −163 |
| the value list (JA6 / JE6) | −70 / −55 |
| three tool lines (JA8) | −85 |

Anam sets no prompt size limit. Its guide warns that latency grows above about 8,000 tokens. The speed round's report (`calls_report`,
PR-1) measures latency per turn, so compare after the write.

`apply_patch.py` checks (results in plan.json):

- every `old` occurs once;
- no overlaps;
- every diff hunk lies inside a replacement;
- the anchored facts blocks are byte-identical, and the Worker's own `rewritePrompt` places its block identically (`price_sync.ok`);
- the protected strings keep their counts: owner and legal lines, 6189, prices, 14 %, contacts, 3,000 / 1,380 / 1,546 / 91, the ban on
  «26 ألف»;
- no bracket was added, no character outside the BMP, the final newline is kept.

**The expressions round.** Its spans (AR-G / C / S, EN-G / C / S, BA-G / C / S) are protected in their old OR new state, read from its
`replacements.json`. `--selftest` builds that round's texts from its current `replacements.json`, applies this patch on top, applies
that round on top of this patch, and finds both orders byte-identical. Its own `apply_patch.py --base <this patch's outputs>` passes its
content checks and gives the same texts.

That round's `replacements.json` was still being revised during this run (its sha256 changed twice). So the combined hashes in plan.json
are a snapshot: rebuild them when both are final with `python3 -I apply_patch.py --live <the texts after the expressions round>` (or
`--selftest`). `worker/src/text.js` is not touched (fix/stray-cue-tags is unaffected).

## 4. The Al-Atlal call replayed under the final rules

Every count below is a real output of the Worker's lookup code (`local-lookups.md`), on main. The fix/lookup-index numbers follow in
brackets. Where his turn only answered something the old Janna said, it is marked «would not come».

**09:18:47, his first words** (left out of this copy: his factory in 6th of October, its rollers, their maintenance and their rubber covering). He is a seller
(rollers), 6 أكتوبر → الجيزة, and «الدرافيل» + «الكاوتشوك» settle the meaning, so there is no clarifying question. One reply:

> «ثواني يا باشمهندس، بدوّرلك على طلبات ومناقصات السلندرات وعلى عملاءك في الجيزة.»
>
> The tools, together (7 calls; Anam allows 10 per turn):
> - rfqs «سلندرات درافيل rollers» → 0 (0)
> - tenders «سلندرات درافيل rollers» → 0. The branch returns 1 «related» oxygen-cylinder tender, which is not said: the skip rule.
> - factories «تغليف» + الجيزة → 78 (85): مصنع النيل للمنتجات البلاستيكية والتغليف، القاهرة لانتاج العبوات (كايروباك)، جولد ستيل …
> - factories «طباعة» + الجيزة → 17 (30): Enkana Printing Inks، مصنع الشرق الأوسط للطباعة والتغليف …
> - factories «بلاستيك» + الجيزة → 26 (51): مصنع بلاستيك كليوباترا، شركة المستقبل لصناعة الأنابيب …
> - janna_search factories «تغليف» + الجيزة. The screen shows the Giza packaging list; its own count can differ from 78, so she does not
>   say all 78 are on it.
> - bassem_intel «rollers» → the Leeds roller-shutter item, which is not said.
>
> «النهارده مفيش طلب سعر ولا مناقصة للسلندرات والدرافيل على المنصة. بس في الجيزة لوحدها فيه ٧٨ مصنع وشركة في مجال التغليف، و١٧ في
> الطباعة، و٢٦ في البلاستيك، ودول عملاءك المحتملين، زي كايروباك ومصنع الشرق الأوسط للطباعة والتغليف؛ ودي مصانع التغليف منهم على
> الشاشة. أدوّرلك على نفس الصناعات في كل مصر؟»

**«تمام».** A yes to «أدوّرلك؟», so the tools go in this reply:

- تغليف → 354 (401)
- طباعة → 73 (162)
- بلاستيك → 193 (343)
- janna_search «تغليف»

> «في كل مصر ٣٥٤ في التغليف و٧٣ في الطباعة و١٩٣ في البلاستيك. حضرتك بتخدموا صناعات تانية غير دي؟»

**He asks for roller maintenance.** A word he asks for: one search.

- rfqs → 0
- tenders → 12 general-maintenance rows on main (the branch: 11 «related» tyre tenders). They are not about rollers, so they are not
  presented.

> «مفيش طلب سعر ولا مناقصة لصيانة الدرافيل؛ اللي طلع صيانة عامة مالهاش علاقة بشغلك. ولما اشتراكك يتفعّل من الأساسية، طلبات الأسعار
> المطابقة لشغلك بتتبعتلك تلقائي. تكتبلي خدماتكم بالظبط علشان ملفكم يتكتب صح؟»

**His «search» and his remark that the rubber factory she offered is his competitor.** Would not come: no material word («كاوتش») is searched, and a same-product maker is never
offered.

**The Facebook link.**

> «اللينك مش بيتفتح معايا يا باشمهندس؛ انسخ كلام البوست والزقه في الخانة اللي تحت الفيديو.»

There is no photo request and no paperclip.

**The pasted post.** It names his customers: paper, carton, sugar, cement, plastics, packaging. The tools:

- factories «أسمنت» + الجيزة → 0 (3)
- factories «سكر» + الجيزة → 1: شركة السكر والصناعات التكاملية المصرية

> «في الجيزة فيه شركة السكر والصناعات التكاملية المصرية، ومصانع الأسمنت مش في الجيزة. أدوّرلك عليها في كل مصر؟»

**«ايوه».** The tools:

- «أسمنت» → 10, all building materials: الشركة العربية للأسمنت، أسمنت سيناء، مصر بني سويف للأسمنت …
- «سكر» → 6, of which 2 are noise («سلك سكرين», «سكر مكة»). The top results are not all sugar, so the names are said without a count.

> «في مصر ١٠ شركات أسمنت زي العربية للأسمنت في السخنة ومصر بني سويف للأسمنت، ومصانع سكر زي الدلتا للسكر والقناة للسكر وسكر أرمنت.
> تحب أقولك ملف الأطلال هيبقى شكله إيه؟»

**09:28:07, «هتفيدني بإيه؟».** Three sentences with his numbers from this call, one question:

> «بأرقامك يا باشمهندس: في الجيزة لوحدها ٧٨ مصنع وشركة في التغليف و١٧ في الطباعة و٢٦ في البلاستيك على المنصة، وفي مصر ١٠ شركات أسمنت
> ومصانع سكر. ملف الأطلال بخدماته بيظهر في الدليل وجوجل، ولما اشتراكك يتفعّل من الأساسية، طلبات الأسعار المطابقة لشغلك بتتبعتلك تلقائي.
> أوريك الباقات على الشاشة؟»

**«ايوة».** janna_navigate register in the same reply, and the prices from her facts.

**His two complaints at the end (she had said she was searching; the call had not helped him).** Would not come: every «بدوّر» above has its tool call in the same
reply, and he had his buyers by name in the first answer.

**If he asks «طب أوصلهم إزاي؟»:**

> «أرقامهم وإيميلاتهم مش منشورة على المنصة، وفي ملف كل شركة موقعها الرسمي لو موجود. وهم اللي بيوصلولك لما تسجّل: من ملفك في الدليل،
> ومن طلبات الأسعار المطابقة لشغلك لما اشتراكك يتفعّل.»

She never points him to the buyers' «اطلب عرض سعر» button.

**Bassem, the same member as a Core Partner.** After «قول اللي عندك», one step:

- tenders + rfqs «سلندرات درافيل rollers» (0, 0)
- bassem_intel «rollers». The screen and hologram show the Leeds item; he says in half a sentence that it is unrelated.
- factories «تغليف» / «طباعة» / «بلاستيك» + الجيزة (78 / 17 / 26)
- janna_search «تغليف» + الجيزة

> «مفيش النهارده مناقصة ولا طلب سعر للسلندرات، واللي ظاهر في مركز المعلومات باب رولر في إنجلترا مالوش علاقة بشغلك. بس في الجيزة ٧٨
> مصنع وشركة في التغليف و١٧ في الطباعة و٢٦ في البلاستيك، منهم كايروباك. أتابعلك السلندرات وأبلّغك أول ما يظهر طلب؟»

On «ماشي»: bassem_tasks add + janna_follow by label («سلندرات»). He says only what the tools answer, and no factory id goes into
bassem_notify_member.

### Two other calls

**fc6c5875, an iron supplier.** His first words were «بدوّر على المصانع اللي تشتري الصلب والحديد، أنا مورد حديد». She searches in that
same reply, all Egypt, before any name question:

- tenders «حديد صلب steel» → 18 (17), first an open one: eg-tnd-003, مطاحن مصر العليا, silo steel structures, deadline 2026-12-08
- rfqs → 0
- factories «ماكينات» → 239
- factories «أثاث» → 52

Her answer carries the open tender with its entity and deadline, plus the customers with their counts and names (e.g. مصنع الملكة لتشكيل
المعادن in 6th of October), and ends «حضرتك في أنهي محافظة؟».

**216f67f3, a herbs exporter to the EU and US.** The exporter branch:

- rfqs / tenders «أعشاب توابل herbs» → 0 / 0
- bassem_intel «herbs» with market eu, and without market for the US. The feed has nothing for 30 days, so she says so in one sentence.
- janna_navigate export-market

She gives the page's key requirements: Europe, EUR.1 and pesticide-residue limits for food; USA, FDA food-facility registration. Then
one question: «عندكم أي شهادة منهم دلوقتي؟».

## 5. What this patch cannot fix, and coordination

**Page follow-ups** (a site deploy, not this patch):

- The list pages, `pages.part.py` render() and `oldlists.part.py` list(), could match any word.
- `lookupDone` could mirror only the main word of a multi-word query.
- `showIntel` (`data/bassem-intel-view.js`) should not title an unrelated first result «باسم لقى».

**Worker follow-ups:**

- A neutral zero-result text instead of «اقترحي كلمات بحث أخرى أو نشر طلب عرض سعر مجاني».
- Drop the factories «التواصل عبر زر اطلب عرض سعر» clause.
- A persona hint for the `paged` wording.

**fix/lookup-index (PR-2).** The final rules work on main and on the branch. One caution remains: if the branch changes single-word
matching again, re-run `final-lk/lk.mjs` on it.

**The expressions round's examples.** These are not this patch's spans, so they are a note for whoever finalises that round:

- AR-C's «[curious] تحب أجرّب بكلمة تانية؟» and EN-C's "Shall I try another word?" model the keyword-chain question that JA5 / JE5 forbid
  for sellers. So does AR-G's «تحب أجرّب؟» example.
- BA-C's «حتى بعد ما جرّبت بكلمة تانية» models the sequential retry that B4 replaces.

A seller-neutral example (e.g. «تحب أوريك عملاءك المحتملين في محافظتك؟» / Bassem «تحب أتابعهولك وأبلّغك أول ما يظهر؟») would remove the
conflict. As it stands, the specific seller rules win.

**anam_changes.md / usefulness_changes.json (U-plan, another workflow).**

- Its writes 3–5 (U4 / U5 / U13) edit the same prompt lines (AR 13, 33, 36, 39, 40, 46, 54, 106; EN the twins; Bassem 14, 16, 19, 121).
  Apply ONE of the two, not both. U13's rule-6 tariff line and its line-121 web-search line are not covered here; they can be rebased on
  these texts.
- Its write 1 (U3) rewrites the same tool 29fd5087. It refuses page / limit for Janna and adds a 'customers' enum value after U2 ships.
  Merge it into one body: if U2 is live, add `customers` to the enum. Because the read masks the values, the full real list (factories,
  suppliers, products, tenders, rfqs, offers, cities, customers) must then be sent in clear. Fold U3's sentence into this description,
  within 1,024 characters.

**The 📎 attachment button (task #73).** When it ships, replace «من غير صورة ولا ملف (مفيش زرار مرفقات)», "there is no attachment
button" and «ومفيش زرار مرفقات توصفه».

**Plan facts outside the anchored blocks** (the price sync never rewrites them). Re-check them when the plans matrix changes:

| persona | where | text |
|---|---|---|
| Janna AR | JA5 bullets 4–5 | «(من الأساسية وطالع)», «(من الأساسية وطالع، والمميزة الأول)» |
| Janna AR | JA6 | «(من الأساسية وطالع)» |
| Janna EN | JE5 | "(Basic and up)", "(Basic and up, Premium first)" |
| Janna EN | JE6 | "(Basic and up)" |
| Bassem | B2 | «بتوصله تلقائي وبأولوية» |

List them in the anam/live/README.md row of this round.

## 6. Applying it (owner's OK first; every Anam write needs it)

1. Read janna_lookup 29fd5087; its updatedAt must still be 2026-11-18T09:51:13.805Z. Merge with U3 if that is applied too (§5). Send
   `tool-update.json`, then read it back.
2. Read the three personas. At this finalisation they were 09:30:52.047Z, 09:30:55.090Z and 09:30:58.146Z, unchanged since the design:
   both Jannas whole and identical to anam/live, Bassem's trim total 26,460. Build the texts with
   `python3 -I apply_patch.py --live <folder of the texts to write on>`, with the expressions round applied first if it goes together.
3. `anam_persona_update` with `systemPrompt` only and `expectedUpdatedAt`. For Bassem, check the trim total and the visible start.
4. Update `anam/live/*.systemPrompt.md`, its README table (with the plan-facts list above) and `anam/APPLY.md` §2. APPLY.md §2 recorded
   the earlier choice of no page / market for Janna; this round reverses it.
5. Rollback: the previous anam/live files and `tool-rollback.json`.

## 7. Review points not applied as written

| point | reason |
|---|---|
| exactness blocker 3 option (a): a `match:"any"` parameter on fix/lookup-index plus this tool | Option (b) was chosen. One industry per call works on both indexes without a Worker change on another branch or a second tool change |
| honesty blockers 1–2 wording for a multi-word customer query («بأسماء الصناعات بس…», «several industries: the main one»), and `review-honesty/tool-description.proposed.txt` | Superseded by one industry per call; the concerns are fixed |
| conversation «should» on tour step 2, the quote «دي مناقصات [منتجه] في مصر» / "These are the [product] tenders in Egypt" | That quote is the expressions round's span (AR-S / EN-S), so it is not touched. The text before it (2–3 names, no governorate, the main name on the screen) and after it (the zero branch) changed |
| conversation «should» on the governorate «for an Egyptian seller only, never for a buyer» | Applied to ASKING only: a buyer who gives his governorate still has it used in his search |
| conversation exporter bullet «market سوقه» for the USA | bassem_intel has no US market code, so the USA is searched without market |
| conversation «should» on «أوصلهم إزاي؟», «المنصة بتوصّله بيهم لما يدوّروا على خدمته» | Rephrased without a promise: buyers reach him after he registers, through his profile and matching RFQs from Basic up |
| the «durable» page fixes (pages.part.py / oldlists.part.py any-word, lookupDone main word, showIntel) and the Worker text fixes | Site and Worker code with their own deploys: listed in §5 as follow-ups, not part of this Anam-only patch |
| exactness nit on B4 «جرّب القسم التاني مرة (tenders ↔ rfqs)» | Applied as both sections in the SAME step. A sequential retry would break the speed rule |
