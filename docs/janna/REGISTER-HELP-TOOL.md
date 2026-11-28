# «register_help» — the assistants' tool for «I wanted to register but couldn't» (owner decision 2026-11-28)

Prepared for the owner / the parent session to apply in Anam. **Nothing here is applied by the code**: the Worker endpoint is live once
`deploy-worker` deploys it, and the detection on the conversation turns works without the tool (`worker/src/info-alerts.js`). Every
Anam write needs the owner's OK (CLAUDE.md 1.1).

## Endpoints (Worker `janna-lookup`, existing route families — no new route)

| Persona | Tool name | URL | Method |
|---|---|---|---|
| Janna (AR + EN) | `janna_register_help` | `https://madeinegyptgate.com/api/janna/register-help` | POST |
| Bassem | `bassem_register_help` | `https://madeinegyptgate.com/api/advisor/register-help` | POST |

Header: `X-Janna-Key: <JANNA_KEY>` when the Worker secret `JANNA_KEY` is set (the same header as `janna_lookup`). The answer is always
HTTP 200 `{ok, alerted, text}`: the persona says `text` (it already says whether the team was told, and never promises a time).

## Tool definition (SERVER_WEBHOOK)

- **Name:** `janna_register_help` (Bassem: `bassem_register_help`)
- **Description (English, for the model):**
  «Call this ONLY when the person says they wanted to register (sign up, subscribe to a plan, create an account, get or use the sign-in
  code, pay for a plan) and could not — an error, a page that does not work, a code that never arrived, a payment that failed. It alerts
  the platform team at once. Ask first (one short question) for an e-mail or mobile number the team can use, unless they already gave one;
  if they do not want to give one, call it anyway. Send their own words in `said`. Call it once per conversation. Never call it for a
  plain question about how to register — answer that yourself.»
- **Body parameters:**
  - `said` (string, required) — what the person said about the problem, in their own words
  - `name` (string, optional) — the name they gave
  - `company` (string, optional) — their company, if they said it
  - `email` (string, optional) — the e-mail they gave for the team to reach them
  - `phone` (string, optional) — the mobile number they gave
  - `page` (string, optional) — the page they were on, if known

## Line for the persona prompts

Janna (Egyptian Arabic, feminine):

> لو حد قالك إنه كان عايز يسجّل أو يشترك في باقة أو يعمل حساب ومعرفش (الصفحة علّقت، الكود موصلش، الدفع ماتمّش)، اسأليه سؤال واحد
> قصير عن إيميل أو رقم موبايل الفريق يكلّمه عليه، وبعدين استخدمي أداة `janna_register_help` مرة واحدة وابعتي فيها كلامه زي ما قاله.
> قولي بعدها الكلام اللي الأداة رجّعته بالظبط، ومتوعديش بميعاد. سؤال «إزاي أسجّل؟» لوحده مش مشكلة: جاوبي عليه بنفسك.

Bassem (Egyptian Arabic, masculine):

> لو العضو أو حد معاه قال إنه كان عايز يسجّل أو يجدد أو يرقّي الباقة ومعرفش (الصفحة علّقت، الكود موصلش، الدفع ماتمّش)، اسأله سؤال
> واحد عن إيميل أو رقم الفريق يكلّمه عليه لو ماقالوش، واستخدم أداة `bassem_register_help` مرة واحدة بكلامه زي ما هو، وقول اللي
> الأداة رجّعته بالظبط ومتوعدش بميعاد.

Janna in English:

> If someone says they wanted to register, subscribe or create an account but could not (an error, the code never came, payment
> failed), ask one short question for an e-mail or mobile number the team can use, then call `janna_register_help` once with their
> own words in `said`, and say exactly what the tool returns — never promise a time.

## What reaches the owner

One e-mail to `TEAM_EMAIL` (info@madeinegyptgate.com), template «تنبيه: حد عايز يسجّل ومعرفش» (`team_register_help`): what they said,
the contact they gave, the persona, the page, the time. One per person per day; at most 40 a day for the platform; 6 tool calls an hour
per network. The same alert is raised without the tool when the person's own words in the call (the stored user turns) or a message
sent through the site's forms say it. Owner switch: «🛠️ المطوّر» → «المزايا» → `info_alerts`.
