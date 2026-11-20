# What is live in Anam now

Each `*.systemPrompt.md` here is a persona's system prompt **exactly as it is live** in Anam: byte for byte, with no front matter.
They are stored as `.md` so that a commit here does not start a site deploy. They are also the rollback copies: to undo a prompt
write, send the file's text back as `systemPrompt`.

| File | Persona | `updatedAt` (live since) | sha256 | Characters |
|---|---|---|---|---|
| `janna-ar.systemPrompt.md` | Janna AR `5f06d835-22cc-4460-b412-84cefa9e565b` | `2026-11-19T20:06:09.022Z` | `e27aaddaf72dc9eb7db291b3c36e2e24c588721966aab09442491c7a404f19ab` | 19,130 |
| `janna-en.systemPrompt.md` | Janna EN `e5101653-65b4-44a6-85e5-ec2e78f82685` | `2026-11-19T20:07:36.925Z` | `ec6f60564cae740043b7853145bc40ac067e2fc2288aecadb059c4fffa100a5a` | 21,944 |
| `bassem.systemPrompt.md` | Bassem `19ef9078-5252-42a4-bbdf-9a3c4a38a4be` | `2026-11-19T22:36:03.393Z` | `85c27cbe0bf80d96b0213a47e12046248fb845bc209be45dde664f6cde329032` | 24,736 |

## Janna AR and Janna EN

Both were read on 2026-11-20 with `anam_persona_get` (read-only). The API returned both prompts whole, not trimmed. Each file is
also byte-identical to a copy of the prompt saved at 20:03 on 2026-11-19, just before the 20:06 (AR) and 20:07 (EN) writes.

Their other settings, read at the same time (none of them is in these files):

| | Janna AR | Janna EN |
|---|---|---|
| `languageCode` | `ar` | `en` |
| `voiceDetectionOptions` | `sttProvider` `anam`, 0.45 / 1 / 30 / 180 | no `sttProvider` (the platform default), 0.45 / 1 / 30 / 180 |
| `toolIds` | 15 | 15 (the same) |

The four numbers are `endOfSpeechSensitivity` / `speechEnhancementLevel` / `silenceBeforeSkipTurnSeconds` /
`silenceBeforeSessionEndSeconds`. For all three personas, `uninterruptibleGreeting`, `skipGreeting` and `enableAudioPassthrough` are false.

`anam/personas/janna-ar.systemPrompt.new.txt` and `janna-en.systemPrompt.new.txt` are older proposals, committed before those writes,
and are **not** what is live.

## Bassem: how it was built

Applied 2026-11-19 with one `anam_persona_update` (systemPrompt only; toolIds, LLM, voice and avatar unchanged).

It starts from the prompt that was live before this write (`updatedAt` `2026-11-19T15:46:58.139Z`, sha256 `f9f1dd62…a966`, 18,188 characters).
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

Re-checked on 2026-11-20: the API trims Bassem's prompt (it showed 10,965 of 24,736 characters). The part it showed is byte-identical
to the start of `bassem.systemPrompt.md`, and the length and `updatedAt` match.

## Before the next prompt change

Read the persona first (`anam_persona_get`) and compare its prompt's sha256 with the one above. Then build the change on the text that is
really live, not on an older file in this repository. Send it with `expectedUpdatedAt` set to the `updatedAt` you read.

The API trims Bassem's prompt, so its sha256 cannot be checked from a read. For him, check that the `updatedAt`, the total length in the
trim notice and the part that is shown all match the file.

After a write, replace the file with the new live text and update its row above.
