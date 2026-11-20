# What is live in Anam now

Each `*.systemPrompt.md` here is a persona's system prompt **exactly as it is live** in Anam: byte for byte, with no front matter.
`bassem_save_profile.description.md` is that tool's live `description`, byte for byte (no final newline). They are stored as `.md` so
that a commit here does not start a site deploy. They are also the rollback copies for the next change: to undo a write, send the
previous text back (the version of the file before that write, in git history).

| File | Persona / tool | `updatedAt` (live since) | sha256 | Characters |
|---|---|---|---|---|
| `janna-ar.systemPrompt.md` | Janna AR `5f06d835-22cc-4460-b412-84cefa9e565b` | `2026-11-20T08:27:33.716Z` | `34453d59217ecdc297b3cc8dfb38ee376220f5f44285293c5bc321198eb327f1` | 21,796 |
| `janna-en.systemPrompt.md` | Janna EN `e5101653-65b4-44a6-85e5-ec2e78f82685` | `2026-11-20T08:29:54.663Z` | `f2cbd0c36fc8891da136099cd92bae98d5370fca8014ff651e85fd482d6da680` | 25,357 |
| `bassem.systemPrompt.md` | Bassem `19ef9078-5252-42a4-bbdf-9a3c4a38a4be` | `2026-11-20T08:57:54.635Z` | `fadcad2a6fec3f8cd6f165e40dcfe0425a7c5e3b46cedcf10e722c9a4f802b15` | 26,459 (the API says 26,460: see Bassem) |
| `bassem_save_profile.description.md` | tool `bassem_save_profile` `4c3b35f3-0590-44d7-85d1-321eeb21c79e` | `2026-11-20T08:37:02.665Z` | `41eaa3ade439de9372710286ac29e0594d4f884b1ac0478777e5a068b829c55a` | 894 |

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

## Janna AR and Janna EN

Both were read again on 2026-11-20 right after their writes (`anam_persona_get`). The API returns both prompts whole, not trimmed.

Their other settings, from the same reads (none of them is in these files):

| | Janna AR | Janna EN |
|---|---|---|
| `languageCode` | `ar` | `en` |
| `voiceDetectionOptions` | `sttProvider` `anam`, 0.45 / 1 / 30 / 180 | `sttProvider` `anam`, 0.45 / 1 / 30 / 180 (since 2026-11-20 08:29 UTC; before it: no `sttProvider`, the platform default) |
| `toolIds` | 15 | 15 (the same) |

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

**Since 2026-11-20 08:57 UTC** his prompt is `anam/calls/bassem.new.md` of the «calls» round (live 08:36–08:57 UTC, sha256 `6fc8ae24…`),
plus the three «ابعتلي» lines of `anam/bassem-notify/prompt-changes.json` (section above). The «calls» text is the previous live text
(sha256 `85c27cbe…`, `updatedAt` `2026-11-19T22:36:03.393Z`) plus these changes:

- LANGUAGE B1–B5.
- BARGE-IN P1a–c.
- SPEED B0, B0b and B3.
- Six size cuts: B5, B6c, B7a, B4, B9 and B7c.

B3 («وفي نفس الخطوة دوّر بيه») ships with the new `bassem_save_profile` description (SPEED T6). The two always go together, in a rollback
too. `anam/bassem-notify/prompt-changes.json` is applied on top of it since 08:57 UTC (three lines; section above).

**His length in a read.** The API trims Bassem's prompt in a read. Its trim notice counts UTF-16 units, so it shows **26,460**: the file's
26,459 characters plus one, because 🌐 takes two units. The 2026-11-19 text had no such character, so its 24,736 matched both ways.

- After the «calls» write (08:36), the reply showed 10,068 units (10,067 characters) and a fresh read showed 10,048.
- After the «ابعتلي» write (08:57), the reply and a fresh read both showed 10,048 units (10,047 characters).

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

The API trims Bassem's prompt, so its sha256 cannot be checked from a read. For him, check three things against the file:

- the `updatedAt`;
- the total in the trim notice, which counts UTF-16 units: today 26,460 for the file's 26,459 characters;
- the part that is shown.

The Worker's price sync (`worker/src/acc-plans.js` `personaSync`, after a plans change, retried hourly) can rewrite his price section by
itself. If his `updatedAt` is not the one above, take his full text from the Lab or from the sync's «after»; never take it from a read.

`anam/calls/build.py` checks the live copies against its `LIVE` table, so since this commit it stops by design: `anam/live` now holds the
round's output. Rebuild that round only from the copies at `78959c9`.

After a write, replace the file with the new live text and update its row above.
