# «No source» round: Bassem's prompt lines (PREPARED, NOT APPLIED)

**Status: PREPARED, NOT APPLIED.** Every Anam write needs the owner's OK (CLAUDE.md 1.1, `anam/APPLY.md`). Nothing here was sent to Anam.

The owner's rule (2026-11-20): «ميكتبش مصدر اي معلومه»، وبعدها «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه
وخلاص». The Worker already follows it (branch `fix/no-sources`): the four web tools answer the information itself (no site, no link, no
snippet, no «على الإنترنت», no «لازم نتأكد»), and their descriptions (`anam/tools.create.json` = `worker/src/acc-wsconnect.js`, written to Anam
only by the owner's press of «🔗 وصّل البحث بجنة وباسم») say the same.

Bassem's LIVE prompt still tells him the opposite (`anam/live/bassem.systemPrompt.md`, section «# البحث في الإنترنت»): «قول صراحة إن نتايجه
من مواقع على الإنترنت، مش من بيانات المنصة ولازم نتأكد منها من المصدر» and «قول اسم الموقع بس». A prompt line can outweigh a tool
description, so these lines should change together with the tools.

`replacements.json`: five find / replace pairs on Bassem's live prompt (NS1–NS5, each `current` occurs exactly once in the live copy whose
sha256 is in `base`) and one optional pair on Janna EN (NS6: «from official sources», the phrase the owner already asked to drop on
2026-11-18). Janna AR has no such line. Apply as one `anam_persona_update` per persona with its `expectedUpdatedAt`, after reading the
persona again and checking the `current` strings still occur once; rollback = the live copies in `anam/live/`.
