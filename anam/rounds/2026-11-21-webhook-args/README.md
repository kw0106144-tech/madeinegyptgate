# Janna's server-webhook tools «bad json» (2026-11-21): the diagnosis and an OPTIONAL Anam change

**Status: PREPARED, NOT APPLIED.** Nothing was written to Anam. Read-only reads on 2026-11-21 (about 22:00–22:20 UTC): `anam_tool_get`
janna_lookup (29fd5087…) and knowledge_lookup (7979fea4…), `anam_session_get` of 88c2befb, 5638390d, a624368d, 0474c0f3, 40727b48,
000a999d, 5400c0bf, 2debf3e0, ffd17125, 5141f266, f75d15f4, `anam_session_list`, the docs (`personas/tools/webhook-tools`, changelog).
Any write below needs the owner's word.

## What happened

- Every working webhook call in these sessions has its arguments nested (`{"bodyParams": {…}}`), while Anam's docs show the request body
  as the flat arguments: so Anam (as far as the sessions show; the docs do not describe it) presents a SERVER_WEBHOOK tool to the model
  with its arguments under `bodyParams` and POSTs **`bodyParams` alone** as the request body (flat JSON). That is why `worker-intel`'s `/api/intel/tool`, which reads the body
  flat, has always worked for Bassem's and Janna's nested `bassem_intel` calls.
- Janna's LLM (661ce597…, `azure_openai`, GPT-4o-mini) sometimes sends a webhook call's arguments **flat** (`{"query":…, "section":…}`),
  the shape of the client tool `janna_search` it calls in the same step. Anam then POSTs **no usable body** — empty, as the answers show:
  `req.json()` failed (so not even `{}`), and the web tools, which read an empty body as `{}`, found no query / product. Whether Anam puts
  flat arguments in the query string could not be seen (the old code answered before reading it); the new reader takes them from there too. Seen on 2026-11-21 in 5 Janna AR sessions (ffd17125 02:03, 2debf3e0 08:36,
  5638390d 12:40, 88c2befb 12:54, 000a999d 17:39), for janna_lookup, knowledge_lookup, janna_web_search and janna_web_hunt;
  bassem_intel calls in the same turns stayed nested. No flat call in the Janna EN session 5400c0bf, in Bassem's (Gemini, `openai`)
  f75d15f4, or in 5141f266 (2026-11-20 19:43). The Anam changelog has no entry on webhook arguments; it is the model's choice per call.
- What the visitor heard: janna_lookup «bad json» (`req.json()` of an empty body), knowledge_lookup bad_json, janna_web_search
  query_required, janna_web_hunt product_required («قولّي اسم المنتج», although the visitor had just said it). In 000a999d and
  2debf3e0 the model sent the call again nested ~3 s later and it worked; in ffd17125 and 88c2befb it never did.

## The fix in the Worker (this branch; no Anam change needed for it)

`worker/src/common.js` `toolArgs` (and its copy `worker-intel/src/util.js`) read the arguments in every form: flat JSON, nested
(`bodyParams` / `queryParams` / `pathParams` / `arguments` / `parameters` / `args` / `input`, an object or its JSON text), the query string
with an empty body, form-encoded, multipart text fields. Used by `/api/janna/lookup`, `/api/janna/knowledge`, `/api/janna/item`,
`/api/janna/web`, `/api/janna/hunt`, `/api/advisor/web`, `/api/advisor/hunt` and `/api/intel/tool`. A POST that carries **no argument at
all** (the case above) answers 200 `code: "empty_args"` with a text telling the model to send the call again ONCE with the arguments inside
`bodyParams`, with that tool's own example, e.g. `{"bodyParams":{"section":"factories","query":"بلاستيك"}}`. Garbage, arrays and JSON
scalars stay `bad_json`; a JSON `{}` keeps each endpoint's own field error; required fields, caps and rate limits are unchanged. So a
flat call now costs one quick retry instead of a failed search.

## OPTIONAL Anam change (owner's OK needed): one line in Janna's two prompts

Purpose: fewer flat calls, so no retry at all. Only the system prompt of Janna AR (persona 5f06d835…) and Janna EN (e5101653…); no tool
or LLM change. Insert as the FIRST bullet under the heading `# البيانات (إنتِ عندك كل بيانات المنصة)` (Janna AR; that heading is in
today's live prompt, read in session 88c2befb), and the English line at the same place in Janna EN's data section:

> - أدوات السيرفر (janna_lookup و platform_item و knowledge_lookup و bassem_intel و janna_web_search و janna_web_hunt) متغيراتها دايماً جوّه bodyParams، زي {"bodyParams":{"section":"factories","query":"بلاستيك"}}؛ أدوات الشاشة (janna_search و janna_navigate والفورمات) متغيراتها على طول من غير bodyParams. لو أداة رجّعت code = empty_args ابعتيها تاني مرة واحدة بالشكل ده.

> - Server tools (janna_lookup, platform_item, knowledge_lookup, bassem_intel, janna_web_search, janna_web_hunt) always take their arguments inside bodyParams, e.g. {"bodyParams":{"section":"factories","query":"plastic"}}; screen tools (janna_search, janna_navigate, the forms) take them directly, without bodyParams. If a tool returns code = empty_args, send it again once in that shape.

How to apply (after the Worker change is live): `anam_persona_get`, check the heading is there and the prompt is the one in
`anam/live/janna-*.systemPrompt.md`, insert the line, `anam_persona_update` with the whole prompt, then record the new live text in
`anam/live/`. Rollback: the previous prompt from `anam/live/`. Check afterwards: `anam_session_get` of the next Janna calls, every
server tool call with `arguments.bodyParams`.

Not proposed: switching Janna's LLM (a bigger change, the owner's call: Bassem's Gemini sent every call nested today, but Janna's voice,
speed and cost were tuned on 661ce597); changing the tools' parameter schemas (the nesting is Anam's, not the schema's).
