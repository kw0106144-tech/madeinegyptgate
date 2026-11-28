# What is live in Anam now

Each `*.systemPrompt.md` here is a persona's system prompt **exactly as it is live** in Anam: byte for byte, with no front matter.
`bassem_save_profile.description.md` is that tool's live `description`, byte for byte (no final newline). They are stored as `.md` so
that a commit here does not start a site deploy. They are also the rollback copies for the next change: to undo a write, send the
previous text back (the version of the file before that write, in git history).

`janna_lookup.tool.json` holds the `description` and `config` sent to Janna's `janna_lookup` tool, exactly as sent. A read shows its
`section` enum masked (••••). Unlike the `.md` files, this file starts a site deploy when it reaches `main`: `anam/**` is not in the
`paths-ignore` of `deploy-site.yml`.

| File | Persona / tool | `updatedAt` (live since) | sha256 | Characters |
|---|---|---|---|---|
| `janna-ar.systemPrompt.md` | Janna AR `5f06d835-22cc-4460-b412-84cefa9e565b` | `2026-11-28T12:07:00.199Z` | `d5f449441b06c76a9dbdd87e5bb08ebaad5067803b4ea83487779ae10a17d2d6` | 30,331 (a read says 30,332: 🌐 counts 2) |
| `janna-en.systemPrompt.md` | Janna EN `e5101653-65b4-44a6-85e5-ec2e78f82685` | `2026-11-28T14:47:48.021Z` | `7423caf6cc8f9144f1191445865d958d652cfa8fd408fe2915cbaa1e96f8ded7` | 35,954 (a read says 35,955) |
| `bassem.systemPrompt.md` | Bassem `19ef9078-5252-42a4-bbdf-9a3c4a38a4be` | `2026-11-28T14:42:26.608Z` | `6544178b46829ba9c33d13e6bec350d250ad77eff267604073f8e8e24e87ea0a` | 35,228 (the API says 35,229) |
| `bassem_save_profile.description.md` | tool `bassem_save_profile` `4c3b35f3-0590-44d7-85d1-321eeb21c79e` | `2026-11-20T08:37:02.665Z` | `41eaa3ade439de9372710286ac29e0594d4f884b1ac0478777e5a068b829c55a` | 894 |
| `bassem-notify-send.tools.md` | tools `bassem_notify_member` `325b182c-e5e0-42d0-a130-658919faf12f` and `bassem_send_email` `a00e4d99-df41-4a43-8c66-39bdfa3d2495` | `2026-11-21T22:06:40.549Z` / `2026-11-21T22:06:43.489Z` | (the bodies are in the file) | |
| `janna_lookup.tool.json` | tool `janna_lookup` `29fd5087-5eff-4919-afb2-3d01b8cc70de` (Janna AR and Janna EN) and `platform_item` `6ccedda8` | `2026-11-28T09:27:54.863Z` / `2026-11-28T09:27:59.484Z` | `9d52be6431fcf1dcd9ecd39b301e4758b20553adba47a7956de9a8aac7f0f0b5` (the file) | description 909 |

## Round 6 — one daily e-mail, buyers and news auto-published, the 11th District (owner 2026-11-28), applied on 2026-11-28

The owner, 2026-11-28: merge the partner e-mails into one, publish buyers and news that have an official source, the approved English, and
«شيل اي حاجه قديمه احنا عدلناها»; the Anam writes were approved by the owner in advance. `systemPrompt` only: every other field (LLM, voice,
avatar, `toolIds`, `languageCode`, greeting, director notes, voice detection) was left as it was. Each persona was read first: its live
`updatedAt` was the one in Round 5 and its live text (total length and visible start) was the file here. Janna AR was not changed.

| UTC | Write | Changed | `updatedAt` before → after | Length the API returned |
|---|---|---|---|---|
| 14:42:26 | Bassem, `anam_persona_update` (`systemPrompt`) | the three daily-report lines + the auto-publish line (below) | `2026-11-28T12:31:30.922Z` → `2026-11-28T14:42:26.608Z` | 35,229 = the file (35,228) + 1 for 🌐 |
| 14:47:48 | Janna EN, `systemPrompt` | the office address + the auto-publish line (below) | `2026-11-28T12:28:48.465Z` → `2026-11-28T14:47:48.021Z` | 35,955 = the file (35,954) + 1 |

Bassem:
- «- التقرير اليومي: كل يوم الساعة 10 الصبح المنصة بتبعتله على إيميله تقرير بالفرص الجديدة …» → «… بتبعتله على إيميله إيميل واحد: في أوله رسالة
  صباح الخير بتاعتك، وبعدها تقرير بالفرص الجديدة …» (the rest of the line as it was).
- «- كل يوم الصبح بتبعتله «صباح الخير»: …» → «- كل يوم الصبح بتبعتله «صباح الخير» في أول تقرير الساعة 10 على الإيميل: …».
- The first-meeting question «تحب أبعتلك صباح الخير والجديد الساعة كام؟ وغالباً بتبقى فاضي إمتى علشان أكلمك ونشتغل سوا؟» → «تحب أكلمك على
  الواتساب الساعة كام لما يشتغل؟ وغالباً بتبقى فاضي إمتى علشان أكلمك ونشتغل سوا؟» (the rest of the line as it was).
- After «… قوله إنها بقت على المنصة، من غير لينك ولا مصدر؛» (the `on_platform` clause of «الصدق مش علامة»): «والمشترين والأخبار اللي من مصدر
  رسمي بتتنشر على المنصة تلقائي كمان، والزوار بيشوفوا منها لمحة بس والتفاصيل للأعضاء؛».

Janna EN:
- "… Culture and Science Area, District 11, 6th of October City …" → "… Culture and Science Area, 11th District, 6th of October City …" (as
  `ADDRESS_EN` in `seo.part.py`).
- After "… its details are for subscribed members, no link and no source;" (the `on_platform` clause of "Honesty, not a label"): "buyers
  and news from an official source are published on the platform automatically too, and a visitor gets only a teaser: a buyer as "a
  company that could become your customer" with its sector (its name is for members), a news item by its title;".

A read is trimmed, so the check is the total length and the visible start; the text sent was the file in each case (compared byte for
byte with the request).

**Rollback of this round.** Send back these two files at the commit before this round (`git show dc46cac:anam/live/<file>`, their sha256
were Janna EN `6055c9ff…` and Bassem `713693ad…`), `systemPrompt` only, with the `updatedAt` in the table above.

## Round 5 — no "not a government body" line (owner 2026-11-28), applied on 2026-11-28

The owner, word for word: «المنصه رسميه امسح كلمه مش جهه حكوميه متجودش من عندك» and «شيلها من كل الأماكن في التلات منصات»; the Anam write
was approved by the owner. One clause was removed from each prompt and nothing was added; every other field (LLM, voice, avatar, `toolIds`,
`languageCode`, greeting, director notes, voice detection) was left as it was. Each persona was read first, and its `updatedAt` was the one
in Round 4.

| UTC | Write | Removed | `updatedAt` before → after | Length the API returned |
|---|---|---|---|---|
| 12:04:31 | Janna AR, `anam_persona_update` (`systemPrompt`) | «ومش جهة حكومية» | `2026-11-28T09:31:51.917Z` → `2026-11-28T12:04:31.111Z` | 30,303: wrong, the line «A result that truly matches:» of the examples had been left out of the text sent |
| 12:07:00 | Janna AR again, the file exactly | the same | `2026-11-28T12:04:31.111Z` → `2026-11-28T12:07:00.199Z` | 30,332 = the file (30,331) + 1 for 🌐 |
| 12:28:48 | Janna EN, `systemPrompt` | "and is not a government body" | `2026-11-28T09:33:30.156Z` → `2026-11-28T12:28:48.465Z` | 35,706 = the file + 1 |
| 12:31:30 | Bassem, `systemPrompt` | «مش جهة حكومية و» | `2026-11-28T09:36:30.739Z` → `2026-11-28T12:31:30.922Z` | 35,023 = the file + 1 |

For about two and a half minutes (12:04:31 to 12:07:00) Janna AR's live prompt lacked that one example line; the second write restored it.
A read is trimmed, so the check is the total length and the visible start; the text sent was the file in each case.

The owner's two follow-ups of the same day (no «not a contracting / procurement body», no «not a party to …») needed no further prompt
change: the live prompts had no such line. Kept, because they are not about what kind of body the platform is: «جهة مؤسسية مش وسيط تجاري» /
"an institution, not a commercial broker", «مش منصة إعلانات ولا أخبار», and «مابتضمنش ترسية».

**Rollback of this round.** Send back these files at the commit before this round (`git show 8e26392:anam/live/<file>`, sha256 in the table of
Round 4), `systemPrompt` only, with the `updatedAt` in the table above.

Knowledge: the Janna folder «Made in Egypt Gate — Janna knowledge» (`b8113c0c…`) still holds 0 documents, so no uploaded document had the
phrase. The repository's sources for it (`docs/janna/kb/`, `docs/janna/kb-upload/`) were cleaned in the same PR.

## Round 4 — the assistants round (identity, titles for visitors, always search outside, auto-publish, registration help), applied on 2026-11-28

The owner decided it on 2026-11-28 and approved the Anam changes of the task in advance (brief «the six assistants»). Backups of what was live
before, byte for byte with the tool lists: `docs/janna/anam-backup-2026-11-28.md` (Janna AR + EN) and `docs/bassem/anam-backup-2026-11-28.md`.
The prompts were built from the previous copies here (their `updatedAt` had not moved since round 3) by
`anam/rounds/2026-11-28-assistants/build_prompts.py` (each replacement exactly once); the tool writes are in `tools.applied.json` there.

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 09:27:09 | `janna_register_help` `fc179425-c14c-4325-a152-6228de0a64a3`, `anam_tool_create` (SERVER_WEBHOOK → `/api/janna/register-help`) | the whole body | — → created |
| 09:27:10 | `bassem_register_help` `35049741-22a6-426f-a201-e9f368b04501`, `anam_tool_create` (→ `/api/advisor/register-help`) | the whole body | — → created |
| 09:27:54 | `janna_lookup` `29fd5087` (Janna), `anam_tool_update` | `description` | `2026-11-23T00:03:51.609Z` → `2026-11-28T09:27:54.863Z` |
| 09:27:59 | `platform_item` `6ccedda8` (all three), `anam_tool_update` | `description` | `2026-11-20T13:19:41.946Z` → `2026-11-28T09:27:59.484Z` |
| 09:31:51 | Janna AR, `anam_persona_update` | `systemPrompt`, `toolIds` (17 → 18: + `janna_register_help`) | `2026-11-21T22:23:03.777Z` → `2026-11-28T09:31:51.917Z` |
| 09:33:30 | Janna EN, `anam_persona_update` | `systemPrompt`, `toolIds` (17 → 18) | `2026-11-21T22:24:43.882Z` → `2026-11-28T09:33:30.156Z` |
| 09:36:30 | Bassem, `anam_persona_update` | `systemPrompt`, `toolIds` (25 → 26: + `bassem_register_help`) | `2026-11-21T22:27:48.673Z` → `2026-11-28T09:36:30.739Z` |

(The two `createdAt` stamps the API returned read 02:27 UTC; the later writes read 09:27–09:36; they were seconds apart in this session.)

- **What changed in the prompts.** (1) The old platform definition («عمرها ٨ سنين، أول منصة وطنية…» / "8 years old…", and «تشغّلها الجمعية…» in
  «إزاي تقنعي» / HOW TO PERSUADE / Bassem's «# حقائق») is replaced by the owner's approved identity sentence (2026-11-27), the owner / operator lines of
  2026-11-19 word for word (Arabic; English as in the site's footer), the office address, the phone 02 38346757 and the working hours (Sunday to
  Thursday, 8 to 4). Janna EN says the English translation the site uses (approved by the owner on 2026-11-28) and the Arabic sentence. (2) Janna: titles only
  for a visitor (title, sector, place, closing date); `members_only` / `locked` results: the details are for members, the plan of `need`, the
  registration offered with `janna_navigate`, never `register_url` read aloud. Bassem: members get the full details; `members_only` = a market
  outside his plan; the daily 10:00 report with its PDF when he asks. (3) Never «مفيش» / «مش لاقية» / "not found": when the platform returns nothing,
  search outside in the same reply and answer like a search assistant; the «not found» numbers question now goes to the web search or the team
  (a task); the tag guides and cue examples no longer model a «nothing found» answer. (4) `on_platform` results (the hunt / search text says «اتضافت
  على المنصة في «فرص السوق»») may be said to be on the platform now, details for members, never a link or a source. (5) The «wanted to register but
  couldn't» tool lines of `docs/janna/REGISTER-HELP-TOOL.md`.
- **Untouched.** Voice, LLM, avatar, director notes, `voiceDetectionOptions`, greetings; the language, barge-in, noise, memory, tour, meeting and
  price sections; the emotion tags and # STYLE CUES except the one cue example per persona that modelled «nothing found» (tags unchanged). The
  plans price sync (`worker/src/acc-plans.js` `rewritePrompt`), run offline on the old and the new texts, finds its blocks and changes nothing.
  The four web tools' descriptions are unchanged (near the 1,024-character limit; the prompts and the tools' own `text` carry the new rules).
- **Checked.** `anam_session_list active=true` was empty before the writes. Every update carried `expectedUpdatedAt` and got no 409. Each reply's
  trimmed total equals the file here + 1 (🌐), its visible part is the start of the file, and `toolIds` are the lists above.
- **Rollback.** Prompts: these files at `08d0fdd` (= the backups), `systemPrompt` + the old `toolIds` of the backup, with `expectedUpdatedAt` = the new
  `updatedAt` above. Tools: `before` in `anam/rounds/2026-11-28-assistants/tools.applied.json`; the two new tools can stay (unattached they do nothing).

## Round 3 (hunt + search, «no source», no bare «مفيش»), applied on 2026-11-21

The owner asked for it and approved it for Anam (his rules: «ميكتبش مصدر اي معلومه»، «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما
يقولوا المعلومه وخلاص»، short replies, and the answer to «جاية منين؟»: «ده اللي عندي عنها، والشروط والمواعيد النهائية عند الجهة نفسها»). The four
search tools (`janna_web_search` `d3f439d5`, `janna_web_hunt` `2248338e`, `bassem_web_search` `ba72bdcb`, `bassem_web_hunt` `7175f080`) were already
attached with their «no source» descriptions. Only `systemPrompt` was sent; tools, `toolIds`, LLM, voice, avatar, director notes and
`voiceDetectionOptions` were not touched.

| UTC | Write | `updatedAt` before → after | Characters (UTF-16 units in a read) |
|---|---|---|---|
| 22:23:03 | Janna AR | `2026-11-20T23:07:40.507Z` → `2026-11-21T22:23:03.777Z` | 26,336 → 28,073 (28,074) |
| 22:24:43 | Janna EN | `2026-11-20T23:07:41.044Z` → `2026-11-21T22:24:43.882Z` | 30,787 → 32,691 (32,692) |
| 22:27:48 | Bassem | `2026-11-21T22:09:50.514Z` → `2026-11-21T22:27:48.673Z` | 32,051 → 33,239 (33,240) |

- **The text before.** The Jannas' `updatedAt` had moved to 2026-11-20 23:07:40/41 UTC with a `toolIds` change only (the owner's «🔗 وصّل البحث»
  attached the two web tools: 17 tool ids each). Their prompts were unchanged: Janna AR's read (now trimmed too) showed a total of 26,337 units and a
  visible 18,930 units identical to the start of the previous file; Janna EN 30,788 and 18,964 identical. Bassem: `updatedAt` 22:09:50.514Z, total
  32,052, visible 4,499 identical.
- **What changed.** The design of `scratchpad/round3/prompts` (built on the texts of `58e98a7`), applied with its own `apply_patch.py` checks
  (each `old` exactly once, nothing in a protected span, the text around byte-identical, the price sync finds its block unchanged, no square
  bracket added, the owner / operator / registration / price / contact strings counted the same, every source-like word audited):
  - **Janna AR / EN** (8 replacements each, as designed: JA/JE-LEN, -TOUR, -PLAN, -FIT, -CUST, -NONE, -HUNT, -WHAT): shorter replies; seller's
    customers as ONE `janna_lookup section=customers`; `janna_web_hunt` in the same step; no bare «مفيش» (hunt or search results, what the platform
    has, then a task and a next step); the new «الصيد والبحث» / HUNT AND SEARCH section (no site, link, «حسب», «من الإنترنت / من برّه المنصة /
    من مصادر عامة / محتاجة تتأكد»; honesty: not the platform's, not verified, not a member, no added counts, no contacts, a deadline or «مفتوحة»
    only from the result); Bassem «يكلمك ويديك ملخص» (no WhatsApp promise in the tour). Two changes on top of the design: the «جاية منين؟» answer
    is the owner's sentence word for word (Janna EN: its meaning in English plus the Arabic sentence), and the expert line no longer says «هتتأكد
    منه من المصدر الرسمي» / "confirm it from the official source": an exact figure is looked up with `janna_web_search`, never guessed (JA/JE-EXPERT).
  - **Bassem** (16 replacements), rebuilt on the live text of 22:09:50 (BQ + NS): BA-R5, BA-FIRST, BA-CUST, BA-NONE, BA-NOTIFY, BA-SCREEN,
    BA-INTEL-SRC, BA-INTEL-EMPTY, BA-PORTAL, BA-ITEM, BA-WA, BA-HONEST unchanged; BA-DOC with its `old` rebuilt («صفحة الإعلان نفسها», NS);
    BA-WEB replaces the whole NS section «# البحث عن معلومة أو فرصة مش في المنصة …» (all of its lines are in the new «# الصيد والبحث»);
    BA-R8 not applied (BQ-R8 is live in its place). Added: the «جاية منين؟» answer = the owner's sentence; BA-NONAME («ثواني، بفتحلك المناقصة…»
    without «يا دكتور محمد», like BQ-R9); BA-EXPERT (as above, with `bassem_web_search`).
  - Untouched: the emotion tags and # STYLE CUES, the owner / operator lines, the facts and price blocks (the Worker's price sync, run offline on old
    and new, finds the same section), the language, barge-in, noise and memory sections.
- **Checked.** `anam_session_list active=true` was empty right before each write. Each write carried `expectedUpdatedAt` and got no 409. The text
  sent, taken from this session's record of each call, is byte-identical to the new file (sha256 in the table at the top). Each reply shows the new
  `updatedAt`, a trim total equal to the file (characters + 1 for 🌐) and a visible part identical to the start of the file (18,922 / 18,924 /
  4,495 units); LLM, `languageCode`, director notes, `voiceDetectionOptions` and `toolIds` (17 / 17 / 25) are unchanged.
- **Seen, not changed here.** The descriptions of `janna_web_search` and `bassem_web_search` still give the older answer to «جاية منين؟» («دي من متابعة
  فريق المنصة للسوق، وقبل ما تقدّم اتأكد من الجهة نفسها»); the prompts now give the owner's sentence, so the two tool texts should follow in a tool
  round. Left as designed (protected or judged allowed): «من مصادر عامة رسمية» in the directory facts line, «فرص دولية من مصادر رسمية», Bassem's
  «إحنا بنغطي المصادر الرسمية الكبيرة» and the # STYLE CUES example «… في المصادر الرسمية …».
- **Rollback.** Send the previous text, `systemPrompt` only, with `expectedUpdatedAt` = the `updatedAt` above (or whatever is live then):
  Janna AR and Janna EN = these files at `4790a5d` (sha256 `58ca004e…f8ac8a`, `59715d3e…29a5fa`, `git show 4790a5d:anam/live/janna-ar.systemPrompt.md`);
  Bassem = this file at `4790a5d` (sha256 `98ac9016…a047`). The web tools can stay attached: the older prompts do not name `*_web_hunt` and the
  tool descriptions say «no source» by themselves.

## The call-quality + «no source» round for Bassem, applied on 2026-11-21

The owner approved it on 2026-11-21 («اه»، «ايوه بس متاخدش وقت»), after main `36f4b43` (fix/bassem-call-quality, fix/no-sources, «فرص السوق») was
deployed. Round 3 (`scratchpad/round3`, BA-*) is **not** in it: it waits for the search tools.

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 22:06:40 | `bassem_notify_member` `325b182c`, `anam_tool_update` | `description`, `config` (`awaitResult` true, `toolTimeoutSeconds` **5**, the same parameters) | `2026-11-20T08:27:35.164Z` → `2026-11-21T22:06:40.549Z` |
| 22:06:43 | `bassem_send_email` `a00e4d99`, `anam_tool_update` | `config` (the same 25 s and parameters; `to` accepts `me`) | `2026-11-19T22:06:35.548Z` → `2026-11-21T22:06:43.489Z` |
| 22:09:50 | Bassem, `anam_persona_update` | `systemPrompt` only | `2026-11-20T23:07:39.928Z` → `2026-11-21T22:09:50.514Z` |

- **The live text before.** Bassem's `updatedAt` was `2026-11-20T23:07:39.928Z`, not the 12:58 one of this README. That write sent `toolIds` only: the
  owner's «🔗 وصّل البحث» (`worker/src/acc-wsconnect.js`, one PUT `{toolIds, expectedUpdatedAt}`) created `bassem_web_hunt` `7175f080` at
  23:07:38.449 and attached it to Bassem 1.5 s later (25 tool ids since). The prompt itself was unchanged: the read's trim total was 30,616 UTF-16 units
  (= this file's 30,615 characters + 🌐), its visible 4,877 units ended exactly where this file's first 4,877 units end, and the price sync, run offline on
  this file with the live plans matrix of `/data/overlay.js` (4,000 / 10,000 / 25,000 / 50,000 / 100,000, VAT 14 %), changes nothing. So the text the
  changes were applied to is the previous copy here, sha256 `ffe1d268…98ae`.
- **What changed** (one Python script, each `old` checked to occur exactly once in the live text and once at its turn; 30,615 → 32,051 characters):
  - the nine call-quality lines of `anam-changes.json` (fix/bassem-call-quality, call `f75d15f4`): BQ-R8 (`old_live`), BQ-R8-MAIL, BQ-R1, BQ-R9, BQ-NAME,
    BQ-MAIL, BQ-NOTIFY, BQ-SELF, BQ-LANG;
  - NS1-NS5 of `anam/rounds/2026-11-21-no-sources/replacements.json` (NS6, Janna EN, not applied);
  - HONEST-ATTR, a new bullet right after the first one of «# الأمانة»: «ماتنسبش لحد صفة أو منصب أو معلومة عنه (زي «رئيس مجلس إدارة») غير لو هو قالها
    أو موجودة في بيانات العضو اللي وصلتك أول المكالمة.»
  - Untouched: the emotion tags and «# STYLE CUES», the owner / operator line, the plan prices (the sync still parses the price block and finds nothing to
    change).
- **Checked.** `anam_session_list active=true` was empty before the tool writes and right before the persona write. The write carried
  `expectedUpdatedAt` and got no 409. The reply and a fresh read show `updatedAt` `2026-11-21T22:09:50.514Z`, a trim total of 32,052 UTF-16 units (=
  32,051 characters + 1 for 🌐) and a visible part of 4,499 units identical to the start of this file; `toolIds` (25), LLM, voice, avatar, director notes,
  `voiceDetectionOptions` and the greeting are unchanged. A read is trimmed, so the full sha256 cannot be checked from Anam: the text sent was this file.
- **Seen on the way, not written by this round.** At 22:07:58 UTC (between the tool writes and the persona write) `bassem_web_search` `ba72bdcb` and
  `bassem_web_hunt` `7175f080` got their «no source» descriptions (the owner's «🔗 وصّل البحث» again, or another session); the persona was not touched by it.
- **Rollback.** Prompt: this file at `36f4b43` (sha256 `ffe1d268…98ae`, `git show 36f4b43:anam/live/bassem.systemPrompt.md`), `systemPrompt` only, with
  `expectedUpdatedAt` = `2026-11-21T22:09:50.514Z` or whatever is live then. Tools: the «Before» blocks of `bassem-notify-send.tools.md`; roll the notify
  tool back together with the prompt (BQ-NOTIFY tells Bassem a result comes back).

## The «calls» round, applied on 2026-11-20

The owner asked for it on 2026-11-20: «جنة او باسم يتكلموا اي لغه في العالم بناءا علي الشخص اللي بيكلمهم»,
«لما بكلم جنة او باسم مش بيسكتوا بيفضلوا يتكلموا وده مش صح», «زود سرعه استجابه باسم وجنه». The writes came from
`anam/calls/updates.json`; the three prompts are `anam/calls/*.new.md` (the PROMPT-4 version for both Jannas, the six size cuts for Bassem).

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 08:27 | Janna AR, `anam_persona_update` | `systemPrompt` | `2026-11-19T20:06:09.022Z` → `2026-11-20T08:27:33.716Z` |
| 08:29 | Janna EN, `anam_persona_update` | `systemPrompt` + `voiceDetectionOptions` (`sttProvider` `anam`, her four numbers as they were) | `2026-11-19T20:07:36.925Z` → `2026-11-20T08:29:54.663Z` |
| 08:36 | Bassem, `anam_persona_update` | `systemPrompt` | `2026-11-19T22:36:03.393Z` → `2026-11-20T08:36:23.642Z` |
| 08:37 | `bassem_save_profile`, `anam_tool_update` (right after Bassem: SPEED T6 goes with his B3) | `description` | `2026-11-19T15:02:22.378Z` → `2026-11-20T08:37:02.665Z` |

How each write was checked:

- **Before.** Each persona was read just before its write, and its `updatedAt` was the one in `updates.json`. The Jannas' texts had the
  sha256 of the previous copies here. For Bassem, the read showed 24,736 characters in all and a visible part byte-identical to the start
  of the previous copy. The tool's description had the expected sha256 (`563cdd73…`), and its `disableInterruptions` was false.
- **The write.** Each write carried `expectedUpdatedAt`, and no write got a 409. No other field was sent: no `toolIds`, `languageCode`, LLM,
  voice or avatar.
- **After.** The reply and a fresh read matched the new file: the sha256 for the Jannas; for Bassem, the visible part and the total
  length. The text sent for Bassem was also checked byte for byte. LLM, voice, avatar, `toolIds`, `languageCode`, the greeting and the
  director notes are unchanged on all three. The tool's config (`awaitResult` true, 16 s, parameters) and `disableInterruptions` (false)
  are unchanged.

**Rollback of this round.** The previous texts are these files at the commit before this round's `anam/live` commit
(`78959c90b57d29d16df7032fc066db18c1bc0600` on `feat/calls-anam`); for example: `git show 78959c9:anam/live/janna-ar.systemPrompt.md`.

| What | Previous sha256 | How to send it back |
|---|---|---|
| Janna AR | `e27aaddaf72dc9eb7db291b3c36e2e24c588721966aab09442491c7a404f19ab` | `systemPrompt` = that text, `expectedUpdatedAt` = her `updatedAt` in the table above |
| Janna EN | `ec6f60564cae740043b7853145bc40ac067e2fc2288aecadb059c4fffa100a5a` | the same |
| Bassem | `85c27cbe0bf80d96b0213a47e12046248fb845bc209be45dde664f6cde329032` | the same, and roll back the tool with him (below) |
| `bassem_save_profile` | `563cdd73a405d05934177753d87aae032818274962dcd97596c0ff7378525367` | `description` = `anam/calls/inputs/bassem_save_profile.description.txt` (also `updates.json` `tool_updates[0].rollback`) |

Janna EN's `sttProvider` has its own rollback, in the next section. Two things to know before any rollback:

- While the page's 🌐 code is live, the old prompts have no `LANGUAGE:` section. To turn the language switch off without a deploy, use
  the Control Center flag `call_languages`.
- Rolling back Janna EN's `sttProvider` makes the English pages refuse an Arabic choice again.

## The «ابعتلي» lines (`anam/bassem-notify`), applied on 2026-11-20

The owner reported on 2026-11-19 that Bassem's «ابعتلي» e-mail came «بدون اي بيانات ولا اي مرفقات ولا حتي لينك شغال». The tool half of
that fix was already live: `bassem_notify_member` (`325b182c-e5e0-42d0-a130-658919faf12f`) has had the `ids` parameter of
`anam/bassem-notify/tools.update.json` since `2026-11-20T08:27:35.164Z`. A read right after this write (08:58 UTC) matched that body
exactly: `awaitResult` false, CLIENT, `disableInterruptions` false. This write added the prompt half.

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 08:57 | Bassem, `anam_persona_update` | `systemPrompt` | `2026-11-20T08:36:23.642Z` → `2026-11-20T08:57:54.635Z` |

- **What changed.** The three replacements of `anam/bassem-notify/prompt-changes.json`, applied unchanged with
  `anam/bassem-email/apply_prompt.py` to the «calls» text (sha256 `6fc8ae24…3ac8`). Each `current` string occurred exactly once, now on
  lines 24, 88 and 108, so none needed adapting:
  - Line 88: he says he is sending it («قوله إنك بتبعتهوله», no longer «بعته»). He promises nothing about details, links or files and
    says only the real outcome once he knows it.
  - Line 24: the list after a search fills `ids` (at most 3).
  - Line 108: «ابعتلي» about this call's results fills `ids`; an opportunity from an earlier call is fetched again first.

  Only these three lines differ from the «calls» text: 26,043 → 26,459 characters.
- **Before.** The read showed `updatedAt` `2026-11-20T08:36:23.642Z` and a trim total of 26,044 units. Its visible 10,047 characters were
  byte-identical to the start of the previous copy.
- **The write.** It carried `expectedUpdatedAt` and got no 409. Only `systemPrompt` was sent. That text, taken from this session's own
  record of the call, is byte-identical to the new file (sha256 `fadcad2a…2b15`).
- **After.** The reply and a fresh read both showed:
  - `updatedAt` `2026-11-20T08:57:54.635Z`;
  - a trim total of 26,460 units (26,459 characters + 1 for 🌐);
  - a visible part of 10,048 units (10,047 characters), byte-identical to the start of the new file.

  No other field of the persona changed: name, LLM, voice, avatar, `toolIds` and the tool definitions, `languageCode`, the greeting,
  director notes, `voiceDetectionOptions` and the widget.

**Rollback of this write.** Send the previous text: this file at `3d80740` on `feat/calls`, sha256
`6fc8ae24ef69195d9ba3db11af8820219affbedd6dee8a69071c5651fbda3ac8`, 26,043 characters
(`git show 3d80740:anam/live/bassem.systemPrompt.md`). Use `expectedUpdatedAt` = `2026-11-20T08:57:54.635Z`, or whatever is live by then.
The tool can stay as it is: the page and the Worker accept a note without `ids`.

Rolling back the «calls» round for Bassem (to `85c27cbe…`) removes these lines too. That older text is the one `prompt-changes.json` was
first built against, so the three lines can be put back on top of it.

## The expressions + usefulness round, applied on 2026-11-20

The owner asked for both on 2026-11-20:

- «تعابير وشها عايزه تتظبط مع سياق الكلام»: Janna's face must follow what she says.
- «خليها تفيد العملاء صح»: Janna and Bassem must be really useful to factories like Al-Atlal.

Two rounds were designed and reviewed adversarially, then combined into one text per persona:

- **Expressions.** An emotion-tag guide of five tags, plus the director notes.
- **Usefulness.** A seller's buyers and customers, honest pivots when nothing is found, and no promise without a tool call.

On top of them, Janna's `janna_lookup` description changed. The design material is in `anam/rounds/2026-11-20-expressions-useful/`; its
README says what was left out of those copies and why.

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 12:27 | Janna AR, `anam_persona_update` | `systemPrompt` + `directorNotes` `{"presetStyle":"warm","expressivity":0.5}` | `2026-11-20T09:30:52.047Z` → `2026-11-20T12:27:47.252Z` |
| 12:32 | Janna EN, `anam_persona_update` | the same two fields | `2026-11-20T09:30:55.090Z` → `2026-11-20T12:32:29.328Z` |
| 12:47 | Bassem, `anam_persona_update` | the same two fields | `2026-11-20T09:30:58.146Z` → `2026-11-20T12:47:51.016Z` |
| 12:49 | `janna_lookup` `29fd5087`, `anam_tool_update` | `name` (unchanged), `description`, `config`, `disableInterruptions` false | `2026-11-18T09:51:13.805Z` → `2026-11-20T12:49:00.983Z` |

About the `config` sent to the tool: it has the same `url` and `method`, the 3 properties `query`, `section` and `governorate`, and the
`section` enum in clear (7 values). It does **not** have `page`, `limit` or `market`: the round's README says why.

**The `updatedAt` values before this round** are those of the 09:30 UTC writes, which set `avatarModel` to `cara-4.1-express` on all
three. Those writes are not in the tables above. The reads before this round showed:

- `cara-4.1-express` on all three;
- director notes `warm` 0.7 / 0.7 / 0.55;
- prompts byte-identical to the copies here.

How each write was checked:

- **Calls in progress.** `anam_session_list active=true` was run right before each write and found no call of these personas; before
  Bassem's write that took a wait, described below. Two calls still overlapped writes. Each started after the check that came before
  the write, and both were ephemeral copies. An ephemeral session carries its own copy of the config.
  - `ef38d12b`, Janna AR, 12:29:39–12:38:26 UTC. It started after the Janna AR write, so it ran on her new text. It was active during
    the Janna EN write, which is another persona. Bassem's write waited for it: it was seen at 12:33:37 and checked about every minute
    until it ended. The write was sent after the check at 12:38:32, about 5 minutes later.
  - `5ec5ba4b`, Bassem, 12:42:28–12:49:36 UTC. It started after that check, so it was active when his write landed at 12:47:51; it
    ran on his previous text. It ended 1 min 45 s after that write, with `CLOSED_BY_ENGINE`. That status also covers a normal hang-up,
    so the records cannot tell whether the write played a part. It was still active when the tool was written; Bassem does not use
    `29fd5087`, he has his own lookup tool `b23b3762`.

  Before the Janna AR write, the check ran at 11:54 UTC. Her long text took until 12:27 to send, and no call ran in between.
- **Before.** Each persona was read just before its write, and its `updatedAt` was the expected one.
  - The Jannas' prompts had the sha256 of the previous copies here (`34453d59…`, `f2cbd0c3…`), computed from this session's own record
    of the reads.
  - Bassem's read showed a trim total of 26,460 units. Its visible part (10,045 units) was byte-identical to the start of the previous
    copy.
  - The tool's read showed `updatedAt` `2026-11-18T09:51:13.805Z`, no headers, the same URL and method, 3 properties and `usageCount` 2.
- **The write.** Each write carried `expectedUpdatedAt`, and none got a 409.
  - Only `systemPrompt` and `directorNotes` were sent: no `dynamicDirectorNotes`, `toolIds`, voice, avatar or LLM.
  - The text sent, taken from this session's own record of each call, is byte-identical to the new file (sha256 in the table at the
    top).
  - The tool got exactly `anam/rounds/2026-11-20-expressions-useful/tool-update.json`.
- **After.** The reply and a fresh read were checked:
  - **Janna AR:** the whole prompt came back, with the file's sha256.
  - **Janna EN:** her read is now trimmed: 24,366 of 30,788 UTF-16 units are shown. The total equals the file's 30,788 units (30,787
    characters + 1 for 🌐), and the visible part is byte-identical to the start of the file.
  - **Bassem:** a trim total of 30,616 units (30,615 + 1), equal to the file. The visible part (10,022 units) is byte-identical to the
    start of the file.
  - Director notes are `{"presetStyle":"warm","expressivity":0.5}` on all three.
  - Every other field is unchanged on all three, compared field by field across the read before, the reply and the read after: name,
    description, avatar and avatar model, voice, LLM, `languageCode`, the greeting, `toolIds` and the tool definitions,
    `voiceDetectionOptions`, `dynamicDirectorNotes` (true), the widget, `skipGreeting`, `uninterruptibleGreeting`,
    `enableAudioPassthrough`, `zeroDataRetention`, `maxSessionLengthSeconds` and the share links.
  - The tool: the reply and a fresh read show the new description and config, with the `section` enum masked (7 values), the properties
    `query`, `section` and `governorate` only, `awaitResponse` true, `disableInterruptions` false and `usageCount` 2.
- **Afterwards.** An `anam_session_search` for «[» over the calls since 12:27 UTC found no persona message with a bracket. The design's
  own test gate was not run: an owner's test call on desktop Chrome with the `DIRECTOR_NOTE_CUE_APPLIED` cue log, which the design had
  planned between the Janna AR write and the other two (the round's README).

**Rollback of this round.**

- **The prompts.** The previous texts are these files at `639f2d5`, for example
  `git show 639f2d5:anam/live/janna-ar.systemPrompt.md`. Their sha256 values are `34453d59…eb327f1`, `f2cbd0c3…2da680` and
  `fadcad2a…802b15`. Send each one with:
  - `directorNotes` `{"presetStyle":"warm","expressivity":0.7}` for Janna AR and Janna EN;
  - `directorNotes` `{"presetStyle":"warm","expressivity":0.55}` for Bassem;
  - `expectedUpdatedAt` = its `updatedAt` in the table above, or whatever is live by then.
- **The tool.** `anam/rounds/2026-11-20-expressions-useful/tool-rollback.json` holds its previous `description` and the 3-property
  `config`. In it, `governorate` goes back to «Optional Egyptian governorate or industrial city in Arabic, e.g. الشرقية or العاشر من
  رمضان». Its `section` enum is •••• there, which keeps the stored values when sent back. Use `expectedUpdatedAt`
  `2026-11-20T12:49:00.983Z`, or whatever is live by then.

  Roll the tool back together with the two Jannas: its new description repeats their new search rules.
- **The older rollbacks.** The «calls» and «ابعتلي» rollbacks above send texts without this round, so they remove it as well.

## Janna AR and Janna EN

Both were read again on 2026-11-20 right after their writes (`anam_persona_get`).

- The API returned Janna AR's prompt whole until round 3; since 2026-11-21 it trims hers too (28,074 units; 18,922 shown after the write).
- Since the expressions + usefulness round, Janna EN's read is trimmed: 24,366 of 30,788 units are shown. The notice counts UTF-16
  units, so 30,788 is the file's 30,787 characters + 1 for 🌐. For her, as for Bassem, the sha256 cannot be checked from a read.

Their other settings, from the same reads (none of them is in these files):

| | Janna AR | Janna EN |
|---|---|---|
| `languageCode` | `ar` | `en` |
| `voiceDetectionOptions` | `sttProvider` `anam`, 0.45 / 1 / 30 / 180 | `sttProvider` `anam`, 0.45 / 1 / 30 / 180 (since 2026-11-20 08:29 UTC; before it: no `sttProvider`, the platform default) |
| `toolIds` | 15 | 15 (the same) |
| `avatarModel` | `cara-4.1-express` (since 2026-11-20 09:30 UTC) | the same |
| `directorNotes` | `warm`, expressivity 0.5 (since 12:27 UTC; before it: 0.7) | `warm`, 0.5 (since 12:32 UTC; before it: 0.7) |
| `dynamicDirectorNotes` | true | true |

The four numbers are `endOfSpeechSensitivity` / `speechEnhancementLevel` / `silenceBeforeSkipTurnSeconds` /
`silenceBeforeSessionEndSeconds`. For all three personas, `uninterruptibleGreeting`, `skipGreeting` and `enableAudioPassthrough` are false.

**Guard (BARGE-IN ANAM-1):** Janna EN's expected `voiceDetectionOptions` are now `{sttProvider "anam", 0.45, 1, 30, 180}`. Never "restore"
her without `sttProvider`: it silently breaks the 🌐 switch to Arabic on the English pages. To roll this one setting back (an owner's
decision), there are three ways:

- In the Lab: Advanced → Voice Detection → STT Provider → Default.
- By API: `voiceDetectionOptions` `null`, then the four numbers again.
- One write with `sttProvider` `cartesia_ink_2`, which is what Default resolves to for English.

`anam/personas/janna-ar.systemPrompt.new.txt` and `janna-en.systemPrompt.new.txt` are older proposals, committed before the 2026-11-19
writes, and are **not** what is live.

## Bassem

**Since 2026-11-21 22:27 UTC** his prompt is the expressions + usefulness text plus the call-quality + «no source» round and round 3 (sections above). His director notes are `warm` 0.5
(before them: 0.55), and his avatar model has been `cara-4.1-express` since 09:30 UTC.

That text is built on his text of 08:57–12:47 UTC (sha256 `fadcad2a…`). That one is `anam/calls/bassem.new.md` of the «calls» round
(live 08:36–08:57 UTC, sha256 `6fc8ae24…`), plus the three «ابعتلي» lines of `anam/bassem-notify/prompt-changes.json` (section above). The «calls» text is the previous live text
(sha256 `85c27cbe…`, `updatedAt` `2026-11-19T22:36:03.393Z`) plus these changes:

- LANGUAGE B1–B5.
- BARGE-IN P1a–c.
- SPEED B0, B0b and B3.
- Six size cuts: B5, B6c, B7a, B4, B9 and B7c.

B3 («وفي نفس الخطوة دوّر بيه») ships with the new `bassem_save_profile` description (SPEED T6). The two always go together, in a rollback
too. `anam/bassem-notify/prompt-changes.json` is applied on top of it since 08:57 UTC (three lines; section above).

**His length in a read.** The API trims Bassem's prompt in a read. Its trim notice counts UTF-16 units, so it shows **30,616**: the file's
30,615 characters plus one, because 🌐 takes two units. For the text of 08:57–12:47 UTC it showed 26,460 (26,459 characters). The
2026-11-19 text had no such character, so its 24,736 matched both ways.

- After the «calls» write (08:36), the reply showed 10,068 units (10,067 characters) and a fresh read showed 10,048.
- After the «ابعتلي» write (08:57), the reply and a fresh read both showed 10,048 units (10,047 characters).
- After the expressions + usefulness write (12:47), the reply and a fresh read both showed 10,022 units (10,021 characters).

Every visible part was byte-identical to the start of the file live at that time.

### The text before (2026-11-19 → 2026-11-20 08:36 UTC), now in git history

That text was applied on 2026-11-19 with one `anam_persona_update` (systemPrompt only; toolIds, LLM, voice and avatar unchanged). It
started from the prompt live before that write (`updatedAt` `2026-11-19T15:46:58.139Z`, sha256 `f9f1dd62…a966`, 18,188 characters).
Four changes were added to it:

1. The speed rules (rule 9): say a short line first, then call every tool you need at once. Also: no recall before a new search, and a more patient mic-noise and odd-sentence handling.
2. The e-mail changes (rules 1, 2 and 8, and the «الإيميلات» section):
   - Bassem reads a 2–3 sentence summary aloud.
   - He sends the e-mail from the platform (`bassem_send_email`).
   - The recipient comes from the tools or is dictated by the member.
   - The signature is the full name.
   - The language is the buyer's.
3. Information Center items and documents: `bassem_intel` `action="item"` / `action="doc"`.
4. The «البحث في الإنترنت (bassem_web_search)» section.

The tool itself is attached to the persona by «🔗 وصّل البحث بباسم» on the keys page.

`anam/personas/bassem.systemPrompt.new.txt` is an older proposal (sha256 `56f43623…`) and is **not** what is live. It has two older lines: the RFQ line and the «منصات صنع في» line. The live prompt keeps the corrected wording of both, including «الدخول الموحّد بين المنصات لسه مش متاح».

## Before the next prompt change

Read the persona first (`anam_persona_get`) and compare its prompt's sha256 with the one above. Then build the change on the text that is
really live, not on an older file in this repository. Send it with `expectedUpdatedAt` set to the `updatedAt` you read.

The API trims Bassem's and Janna EN's prompts, so their sha256 cannot be checked from a read. For them, check three things against the
file:

- the `updatedAt`;
- the total in the trim notice, which counts UTF-16 units: today 33,240 for Bassem's 33,239 characters, 32,692 for Janna EN's 32,691 and 28,074 for Janna AR's 28,073 (all since round 3, 2026-11-21; Janna AR's read is trimmed now too);
- the part that is shown.

The Worker's price sync (`worker/src/acc-plans.js` `personaSync`, after a plans change, retried hourly) can rewrite each persona's price
section by itself. If Bassem's or Janna EN's `updatedAt` is not the one above, take the full text from the Lab or from the sync's
«after»; never take it from a read.

The sync changes only the tokens inside each persona's anchored price block. Since the expressions + usefulness round, some plan rules also
appear outside that block, so a change to the plans must update these by hand:

- Janna AR: «(من الأساسية وطالع)» (the customers bullet and the platform-value bullet) and «(من الأساسية وطالع، والمميزة الأول)»
  (the nothing-found bullet).
- Janna EN: "(Basic and up)" (twice) and "(Basic and up, Premium first)".
- Bassem: «بتوصله تلقائي وبأولوية».

`anam/calls/build.py` checks the live copies against its `LIVE` table, so since this commit it stops by design: `anam/live` now holds the
round's output. Rebuild that round only from the copies at `78959c9`.

After a write, replace the file with the new live text and update its row above.

## Bassem's LLM, switched on 2026-11-20 (owner: «باسم بياخد وقت كبير في الرد علي اي سؤال سرها رد فعله», then «تمام»)

| UTC | Write | Fields sent | `updatedAt` before → after |
|---|---|---|---|
| 12:58:55 | Bassem, `anam_persona_update` | `llmId` only: GPT 6 Luna `661ce597-279d-46a3-bfd9-19d2d8bac757` → Google Gemini 3.5 Flash Lite `058aba1a-b097-4beb-abc8-51c74835f5e8` (Anam global, reasoning minimal) | `2026-11-20T12:47:51.016Z` → `2026-11-20T12:58:55.267Z` |

- **Why.** The owner's test call `5ec5ba4b` (12:42-12:49 UTC, before this switch): first audio 6.2 s on average, of which the LLM's time
  to first output was 5.5 s (worst turn 17.7 s); transcription and TTS took about 0.2 s each.
- **Checked.** The reply shows the new `llmId`, the prompt total of 30,616 UTF-16 units (unchanged), directorNotes warm 0.5, avatarModel
  cara-4.1-express, the same voice and toolIds. Bassem's calls copy `llmId` from the saved persona (worker/src/bassem-context.js), so the
  next call uses it; a call already running keeps its own copy.
- **Rollback.** `llmId` = `661ce597-279d-46a3-bfd9-19d2d8bac757`. Second choice if the dialect or tool calls get worse: GPT 4.1
  `b4f89001-9638-4879-a9c3-02cc9f9f2004` (no reasoning). Janna AR / EN stay on GPT 6 Luna until the owner has compared.

## Lookup tools: new sections, applied on 2026-11-20 13:19 UTC (worker 4dfb634 live first)

| UTC | Tool | What changed | `updatedAt` before → after |
|---|---|---|---|
| 13:19:35 | janna_lookup (Janna AR + EN) `29fd5087` | section enum + customers, projects, events, news, awards; description: a seller's customers via section=customers | `2026-11-20T12:49:00.983Z` → `2026-11-20T13:19:35.847Z` |
| 13:19:38 | janna_lookup (Bassem) `b23b3762` | the same 5 sections; page / limit / market kept | `2026-11-19T15:03:01.121Z` → `2026-11-20T13:19:38.615Z` |
| 13:19:41 | platform_item (shared) `6ccedda8` | section enum + news, events (description unchanged) | `2026-11-19T20:08:02.049Z` → `2026-11-20T13:19:41.946Z` |

The persona prompts still describe the customer search as «janna_lookup بـ section factories بكلمة واحدة لكل صناعة»; that still works, and the
next prompt round moves them to section=customers. Details and rollback: `janna_lookup.tool.json`.

