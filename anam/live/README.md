# What is live in Anam now

`bassem.systemPrompt.md` is Bassem's system prompt **exactly as it is live** in Anam: byte for byte, with no front matter.
It is stored as `.md` so that a commit here does not start a site deploy.

| | |
|---|---|
| Persona | Bassem `19ef9078-5252-42a4-bbdf-9a3c4a38a4be` |
| Applied | 2026-11-19, one `anam_persona_update` (systemPrompt only; toolIds, LLM, voice and avatar unchanged) |
| `updatedAt` after the write | `2026-11-19T22:36:03.393Z` |
| sha256 | `85c27cbe0bf80d96b0213a47e12046248fb845bc209be45dde664f6cde329032` (24,736 characters) |

## How it was built

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

## Before the next prompt change

Read the persona first (`anam_persona_get`) and compare its prompt's sha256 with the one above. Then build the change on the text that is
really live, not on an older file in this repository. Send it with `expectedUpdatedAt` set to the `updatedAt` you read.
