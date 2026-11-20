# «calls» round — Anam changes (APPLIED on 2026-11-20)

**Status: APPLIED on 2026-11-20 (08:27–08:37 UTC).** The writes went in this order: Janna AR; Janna EN (her prompt and
`voiceDetectionOptions` in one write); Bassem; then the `bassem_save_profile` tool update. Each used the `fields` of `updates.json`, with
no 409. The new `updatedAt` values, the sha256s, the checks and the rollback (the previous texts at commit `78959c9`) are in
`anam/live/README.md`, which now holds these texts as the live copies. The «PREPARED, NOT APPLIED» lines further down and in
`updates.json` describe the state before the writes. Every Anam write needs the owner's OK (CLAUDE.md 1.1, `anam/APPLY.md`). The owner's
requests behind this round (2026-11-20): «جنة او باسم يتكلموا اي لغه في العالم بناءا علي الشخص اللي بيكلمهم»,
«لما بكلم جنة او باسم مش بيسكتوا بيفضلوا يتكلموا وده مش صح», «زود سرعه استجابه باسم وجنه».

One `anam_persona_update` per persona carries every prompt edit of the three verified plans (LANGUAGE `prompt_changes`, BARGE-IN
`PROMPT-1..4`, SPEED change 4 «speak first»), because the writes share each persona's `expectedUpdatedAt` and only the first would
succeed. Plus one tool update (`bassem_save_profile`, SPEED T6) and Janna EN's `voiceDetectionOptions` (`sttProvider` `anam`).

## What is in this folder

| File | What it holds |
|---|---|
| `updates.json` | The exact write field sets (`fields`), each with its rollback, the size notes, the apply order and how to send. **The file to apply from.** |
| `janna-ar.new.md`, `janna-en.new.md`, `bassem.new.md` | The three new system prompts, byte for byte (no front matter; `.md` like `anam/live/`). The same texts are inside `updates.json`. |
| `janna-ar.no-prompt4.new.md`, `janna-en.no-prompt4.new.md` | The same build without BARGE-IN PROMPT-4 (optional in its plan: «detail across short turns»). Send one of these instead if the owner says no to it. |
| `bassem.nocuts.new.md` | Bassem without the six size cuts (for comparison; 9,541 tokens o200k). |
| `*.diff` | Live → new, per persona. |
| `SHA256SUMS` | The sha256 of every prompt file above (`sha256sum -c SHA256SUMS` from this folder). |
| `build-summary.json` | What `build.py` applied, where, and the sizes. |
| `inputs/pairs.json` | Every find/replace pair, exported from the three plans (never retyped), with the review corrections of 2026-11-20 (`review_fixes`). |
| `inputs/bassem_save_profile.description.txt` | The tool's live description, read 2026-11-20 (`updatedAt` `2026-11-19T15:02:22.378Z`). |
| `build.py`, `make_updates.py` | Rebuild everything above from the repository alone (`anam/live/` + `inputs/`); they write only into this folder. |

Sizes as built on 2026-11-20 (o200k tokens; `build-summary.json` and `updates.json` carry the figures of the last build): Janna AR 6,599 → 7,559 · Janna EN 4,837 → 5,644 · Bassem 8,684 → 9,187 (with the six cuts B5, B6c, B7a, B4, B9,
B7c). With `anam/bassem-notify` on top of Bassem: 9,325; with the further cut B7b: 9,236 — never B8 (it drops «وماتقولهوش كنصيحة»).

Rebuild (from the repository root; `python3 -m pip install tiktoken` once):

```bash
python3 -I anam/calls/build.py --trims B5,B6c,B7a,B4,B9,B7c && python3 -I anam/calls/make_updates.py
(cd anam/calls && sha256sum -c SHA256SUMS)
```

`build.py` stops (exit 1) when a live copy's sha256 is not the one in its `LIVE` table or when any find no longer occurs exactly once.

## Apply order

1. **Before the 🌐 code ships** (deploy-site with `data/janna-live.js` of this round): the three persona writes — Janna EN's
   `systemPrompt` and `voiceDetectionOptions` in ONE write — and the `bassem_save_profile` update. The page's `LANGUAGE:` lines need the
   prompts' «# لغة الكلام» / `# LANGUAGE` sections, and on the English pages every Arabic choice is refused until Janna EN has
   `sttProvider` `anam`. (The Worker and intel changes of this round need no Anam write.)
2. **Bassem's prompt and the tool update together, in this order:** Bassem's `anam_persona_update`, then at once the tool's
   `anam_tool_update`. B3 («وفي نفس الخطوة دوّر بيه») contradicts the live tool text «before searching… Then search with it». On a 409 for
   the tool: `anam_tool_get`, apply the two `t6` pairs of `inputs/pairs.json` to its live description and retry. If the tool update cannot
   be written, roll Bassem back to `anam/live/bassem.systemPrompt.md`.
3. **After each write**, in one commit: replace the persona's `anam/live/*.systemPrompt.md` with the new live text and update its row in
   `anam/live/README.md`; for Janna EN also her `voiceDetectionOptions` row there and `anam/APPLY.md` §6 (they still describe today's
   state: no `sttProvider`).

## Checks before each write

- `anam_persona_get`: its `updatedAt` must be the `expectedUpdatedAt` in `updates.json`. Janna AR / EN: if not, save the new live prompt
  as `anam/live/<persona>.systemPrompt.md`, update `LIVE` in `build.py` and rebuild.
- **Bassem:** the API cuts his prompt in a read (10,965 of 24,736 characters), and the Worker's price sync
  (`worker/src/acc-plans.js` `personaSync`, retried hourly) can rewrite his price section by itself. If his `updatedAt` is not
  `2026-11-19T22:36:03.393Z`, stop: take the full live text outside the cut read (the Anam Lab; or, when only the price sync wrote,
  `anam/live/bassem.systemPrompt.md` with its price section replaced by the sync's «after», checked against the `after.sha` of its
  «سجل العمليات» entry), save it in `anam/live/`, update `LIVE` in `build.py` and rebuild.
- Send `fields` exactly; nothing else (no `toolIds`, `languageCode`, LLM, voice or avatar).

## Guards after the writes (no write)

- **BARGE-IN ANAM-1:** after this round, Janna EN's expected `voiceDetectionOptions` are `{sttProvider "anam", 0.45, 1, 30, 180}`. Never
  "restore" the old row without `sttProvider`: it silently breaks the 🌐 switch to Arabic on the English pages. Janna AR and Bassem: as
  before.
- **BARGE-IN ANAM-2:** every tool keeps `disableInterruptions` false.

## Not in this round

SPEED change 3 (llm-ab: needs the owner on a call); SPEED changes 6 and 7 (only after change 5 is live) — except the six size trims above,
which the speed plan allows on their own to make room.

## Rollback

Each entry of `updates.json` carries its `rollback`: the persona's `anam/live/` text with `expectedUpdatedAt` = the `updatedAt` the write
returned; Janna EN's `voiceDetectionOptions` back to the Default provider; the tool's description as read on 2026-11-20.
