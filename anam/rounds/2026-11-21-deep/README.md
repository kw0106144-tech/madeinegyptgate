# «بحث وكتابة عميقة» — Bassem's Anam tool and prompt lines (PREPARED, NOT APPLIED)

**Status: PREPARED, NOT APPLIED.** Nothing here was sent to Anam. Every Anam write needs the owner's OK (CLAUDE.md 1.1, `anam/APPLY.md`),
and an `anam/live` record after it.

- `tools.create.json` — the ONE new CLIENT tool `bassem_research` (start / status / mail), its description (≤ 1,024 characters, counted),
  its parameters and what must be live before it is created.
- `prompt-lines.md` — the lines to add to Bassem's prompt (AR), in the section «# الصيد والبحث», and the one line that changes there.

## Order (design §A.19, Bassem first)
1. The Worker + the site of `feat/deep-research` deployed (CI); nothing is visible: `research_bassem` is OFF and locked.
2. Migration `0014_research.sql` (owner, `d1-migrate`, backup first).
3. The `[[workflows]]` block of `worker/wrangler.toml` uncommented in its own PR, once the owner confirmed the GitHub secret
   `CLOUDFLARE_API_TOKEN` may create Workflows (D15).
4. «🛠️ المطوّر» → «🧪 تجربة موديل نصي»: real documents read in Arabic and English; pick the models in «🧪 الذكاء الاصطناعي».
5. The owner approves the texts word for word (`docs/app/OWNER-APPROVAL-AR.md` §9).
6. `research_bassem` ON (the page's handler now answers), THEN create `bassem_research`, attach it to Bassem, add the prompt lines; one test call.
7. Rollback: the switch OFF first (the handler answers «off» at once, no call stalls), then detach the tool.
