# Expressions + usefulness round: Anam changes (APPLIED on 2026-11-20)

**Status: APPLIED on 2026-11-20, 12:27–12:49 UTC.** There was one `anam_persona_update` per persona: Janna AR, then Janna EN, then Bassem.
After them came one `anam_tool_update` for Janna's `janna_lookup`. No write got a 409. The live texts are in `anam/live/`, and the writes, the
checks and the rollback are in `anam/live/README.md` («The expressions + usefulness round, applied on 2026-11-20»). Every Anam write
needs the owner's OK (CLAUDE.md 1.1, `anam/APPLY.md`).

The owner's requests (2026-11-20): «تعابير وشها عايزه تتظبط مع سياق الكلام» and «خليها تفيد العملاء صح».

## The two rounds

Two rounds were designed separately, each reviewed adversarially, and applied together: one combined text per persona, built from the
live texts of `639f2d5`.

1. **Expressions** (`expressions-*`): the face follows the words, for Janna AR, Janna EN and Bassem.
   - Only five cue tags: `[warm]`, `[happy]`, `[curious]`, `[supportive]`, `[concerned]`.
   - One tag at the start of every reply, and a new tag before each sentence where the mood changes. At most 3 per reply; the tag on the
     first sentence after a tool does not count.
   - A situation → tag guide in each persona's own language, with new examples.
   - A `# STYLE CUES` section that replaces any other cue list. Lab's Dynamic director notes stay on (`dynamicDirectorNotes` was not
     sent).
   - Director notes: `warm`, expressivity 0.7 / 0.7 / 0.55 → 0.5 (Anam's default).
2. **Usefulness** (`useful-*`): a seller's opportunities are his BUYERS. In one reply, with all the tools together, the persona looks for:
   - RFQs and tenders for 2–3 names of his product, with no governorate;
   - his potential customers by industry in his governorate, one industry word per call;
   - the Information Center.

   It also adds:
   - an honest one-sentence pivot when nothing matches, to what does exist;
   - no «ثواني» / «بدوّر» or other promise without the tool call in the same reply;
   - no competitor offered as an opportunity, and no request for a photo or an attachment;
   - «هتفيدني بإيه؟» answered with his own numbers;
   - the `janna_lookup` tool description (Janna's tool only).

## Files

| File | What it holds |
|---|---|
| `expressions-replacements.json`, `expressions-apply_patch.py` | The expressions round's find/replace pairs and the script that applies them |
| `expressions-final.json` | Its final design: texts, sizes and hashes per persona, the write order, the test gate, the rejected review points |
| `expressions-fallback-concerned.json` | The prepared fallback if `[concerned]` misbehaves. **Not applied** |
| `expressions-rationale.md` | Why, with Anam's documentation and the review results (call excerpts removed: see Privacy) |
| `useful-replacements.json`, `useful-apply_patch.py`, `useful-final.json` | The same for the usefulness round |
| `useful-rationale.md` | Why, with the Al-Atlal call replayed under the final rules (call excerpts removed) |
| `useful-owner-summary-ar.md` | The owner's summary in Egyptian Arabic (the visitor's name removed) |
| `tool-update.json` | The exact `anam_tool_update` arguments sent to `janna_lookup` (`29fd5087`). `anam/live/janna_lookup.tool.json` is the live record |
| `tool-rollback.json` | The tool's previous description and its 3-property config, for a rollback (see `anam/live/README.md`) |

Hashes: the sha256 values of what is live are the ones in `anam/live/README.md`. The design files carry hashes of their own snapshots,
and `useful-final.json` says so itself: the expressions `replacements.json` was still being revised while it was built. Both rounds'
scripts rebuild the combined texts (`--live <texts>` / `--selftest`).

## Janna's tool did NOT get `page` / `limit` / `market`, on purpose

The design's `useful-final.json` `tool_update` gave the tool `page`, `limit` and `market`, at 1,010 characters, and said to apply it
first. The applied `tool-update.json` (909 characters) keeps Janna's 3 properties: `query`, `section` (the 7 values sent in clear) and
`governorate` (new description). It changes only the descriptions.

The reason: in `worker/src/index.js`, `paged` is true when a call has `page` or `market` (line 119). That flag marks the caller as Bassem,
and the answer comes in his masculine text (line 155), so Janna would talk about herself as a man. Bassem keeps his own lookup tool
(`b23b3762`), which has them.

The tool was written after the three prompts, in the coordinator's order. The design had it first. Between 12:27 and 12:49 UTC, Janna's
new prompt ran with the old tool description.

## Not done in this round

- **The expressions test gate** (`expressions-final.json` `write_order` / `test_gate`). The design put the owner's test call between
  Janna AR and the other two writes: on desktop Chrome, a `DIRECTOR_NOTE_CUE_APPLIED` console event for every spoken reply. In that
  plan, Bassem's write waited if an ephemeral call showed no cue events. The three writes went in one sequence, so that call still has to
  be made.
- **What was checked here.** An `anam_session_search` for «[» over the calls since the Janna AR write found no persona message with a
  bracket. That covered one Janna AR call on the new text, 8.7 min, and one Bassem call that started on his old text.
- **Prompt sizes.** The combined prompts are larger than before. In code points, from the text of `639f2d5`:
  - Janna AR: 21,796 → 26,336;
  - Janna EN: 25,357 → 30,787;
  - Bassem: 26,459 → 30,615.

  Anam's prompting guide warns that performance "tends to drop once a system prompt exceeds 8,000 tokens" (`expressions-rationale.md`).

## Privacy

The two rationale files and the owner summary quoted the owner's test call `8bacbfac`. They held a turn-by-turn table of Janna's lines,
the visitor's own words and his name. In these copies, those passages are replaced by short descriptions, because call transcripts and
visitors' names, phones and e-mails stay out of git. Every other file here is byte-identical to the reviewed design. The only e-mails and
phone numbers left are the platform's own public contacts, which are in the live prompts too.

## Deploy note

`anam/**` is not in `deploy-site.yml`'s `paths-ignore`, which skips only `**.md`, `docs/**`, `worker/**`, `worker-intel/**`, `app/**` and
the other pipelines' files. So the `.json` and `.py` files here, and `anam/live/janna_lookup.tool.json`, start the `deploy-site` workflow
when they reach `main`: a rebuild and redeploy of the site as it is on `main`. Nothing in this folder is part of the site.
