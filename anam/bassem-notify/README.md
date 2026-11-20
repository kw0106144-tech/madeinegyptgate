# Bassem «ابعتلي» with the opportunities — prepared Anam changes (NOT APPLIED)

**Status: PREPARED, NOT APPLIED.** Nothing in this folder was written to Anam. Every Anam write needs the owner's OK (CLAUDE.md 1.1, `anam/APPLY.md`).
**The feature works without these changes**: when Bassem calls `bassem_notify_member` («ابعتلي»), the page picks the opportunities of
the call itself (`data/janna-live.js` `notifyRefs`: the call's own tool results and the shared screen) and sends them as `items` to
`POST /api/advisor/notify`; the platform adds each one's details, links and official file (`worker/src/notify-items.js`). These files only
make that more precise and stop Bassem from saying «بعته» before anything was sent.

| File | What it does |
|---|---|
| `tools.update.json` | One `anam_tool_update` of `bassem_notify_member` (id `325b182c-e5e0-42d0-a130-658919faf12f`): adds the optional string parameter `ids` (the opportunities' ids, comma-separated — an id may contain spaces —, ≤ 3, exactly as the call's tools returned them; an opportunity from an earlier call is fetched again first) and a description that tells Bassem to say only that he is sending it — never to promise details, links or files. **`awaitResult` stays `false`** and the tool stays a CLIENT tool. `rollback_body` = the definition read on 2026-11-20. |
| `prompt-changes.json` | Three line replacements in Bassem's live prompt (`anam/live/bassem.systemPrompt.md`, sha256 `85c27cbe…9032`), in the format of `anam/bassem-email/apply_prompt.py`. `replace[0]` (line 79) stops the early «وقوله إنك بعته»: he says he is sending it and promises nothing about the e-mail's details, links or files (the e-mail carries cards only for the opportunities the page could identify — never for one of an earlier call, nor on WhatsApp alone, nor when the e-mail failed); `replace[1]` (line 17) and `replace[2]` (line 100) ask him to fill `ids` with the id of each opportunity, and to fetch one from an earlier call again before sending. |

## Apply order

1. Deploy first (CI, after the merge): `deploy-intel` (the mailpack endpoint + the Kenya hints), `deploy-worker` (the `items` field, the
   `INTEL` service binding), `deploy-site` (`data/janna-live.js`: `notifyGo`, reads `a.ids`). Any order works; until all three are live
   the e-mail degrades honestly (links only, with the reason).
2. `replace[0]` of `prompt-changes.json` — any time, alone if wanted (it is the one that matters most: no «بعته» before the result). It can go alone only because its wording promises nothing about what the e-mail carries; never apply an older draft of it that says «تفاصيلها ولينكاتها هتكون في الإيميل».
3. `tools.update.json` — after `deploy-site`, so the page reads `ids` (before that the page ignores it; nothing breaks).
4. `replace[1]` and `replace[2]` — only after step 3 (they name the `ids` parameter).

## Checks before applying

- `anam_tool_get 325b182c-e5e0-42d0-a130-658919faf12f`: `updatedAt` must still be `2026-11-17T22:23:46.891Z` (the body sends it as
  `expectedUpdatedAt`; a 409 means it changed: read it again and rebuild the body from what is live).
- `anam_persona_get 19ef9078-5252-42a4-bbdf-9a3c4a38a4be`: `updatedAt` `2026-11-19T22:36:03.393Z`, or else check that each `current`
  string still occurs exactly once — `python3 anam/bassem-email/apply_prompt.py live.txt anam/bassem-notify/prompt-changes.json > new.txt`
  refuses (exit 1, nothing printed) when one does not. Dry run on 2026-11-20 against `anam/live/bassem.systemPrompt.md`:
  «ok: 3 replaced, 0 added (24,736 → 25,152 characters)».
- Then `anam_persona_update` with the new `systemPrompt` and everything else unchanged, and refresh `anam/live/` (README there).

## Rollback

- The tool: send `rollback_body` (same id) — the definition as read on 2026-11-20.
- The prompt: put back the three `current` lines (each `new` → its `current`), or the saved `live.txt`.
