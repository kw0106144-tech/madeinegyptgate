# DEPLOY 1 — production checklist (read this first)

One Worker (`janna-lookup`, `src/index.js`) serves every platform API on **madeinegyptgate.com and www.madeinegyptgate.com**. The
routes are listed one by one in `wrangler.toml` (`/api/janna/*`, `/api/advisor/*`, `/api/meetings*`, `/api/auth/*`, `/api/me`,
`/api/me/*`, `/api/inquiries*`, `/api/admin/*`, `/api/ev`, `/api/unsub*`, `/api/wa/*`). There is **never a catch-all `/api/*`**:
`/api/seo/*` belongs to the Pages Functions (`functions/api/seo`). `/api/index.php*`, `/panel.html` and `/login.html` stay on the
owner's `mis-egypt` Worker in deploy 1. `test/integ-worker.test.mjs` fails if the route list breaks any of this.

**Secrets** (`npx wrangler secret put <NAME>`, never in `wrangler.toml`):

| Secret | Needed for |
|---|---|
| `ADVISOR_SECRET` | signs every login / session / link (or a separate `AUTH_SECRET`) — required |
| `PLATFORM_KEY` | required: only the platform may open advisor sessions / set plans by key (`tools/set-plan.mjs`) |
| `MEETINGS_SECRET` | Janna meetings (signed meeting / cancel links) — required |
| `RESEND_API_KEY` | ALL e-mail (Resend; sending-only key restricted to madeinegyptgate.com, BACKLOG 32) — required |
| `ANAM_API_KEY` | live Janna / Bassem sessions, meeting transcripts |
| `RESPONDIO_TOKEN` | WhatsApp through respond.io — since deploy 2 the owner may save the token in the Control Center «مفاتيح الخدمات» instead (a Worker secret wins). Real sending needs the panel switch (below, "Service keys"); until then everything goes by e-mail |
| `WA_WEBHOOK_SECRET` | respond.io webhook → `/api/wa/inbound` (header `X-Webhook-Secret`, or `?secret=` when only a URL is possible) |
| `TURNSTILE_SECRET` *(optional)* | Turnstile: once set, `/api/auth/request` and anonymous `/api/inquiries` REQUIRE a token (pages need `window.MIG_TURNSTILE_SITEKEY`) |
| `BRAVE_SEARCH_KEY` *(optional)* or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | web search for the admins' no-match candidate list (without a key: platform directory only; nothing is ever scraped) |
| `JANNA_KEY` *(optional)* | header `X-Janna-Key` on `/api/janna/lookup` (and `/api/janna/item`) |
| `TOOL_SECRET` *(for Bassem's web search)* | the `X-MIG-Tool` header value of the Anam tool `bassem_web_search` (`/api/advisor/web`); random, ≥ 16 characters (`openssl rand -hex 24`). The owner may save it in «مفاتيح الخدمات» → «سر أدوات باسم» instead (a Worker secret wins). Without it the endpoint is off (fail-closed) |
| `WEBSEARCH_KEY` *(optional)* | Bassem's web search provider key (Tavily / Serper / Brave) — or the panel slot «بحث الإنترنت — المفتاح» (a Worker secret wins). Optional vars: `WEBSEARCH_PROVIDER` (tavily \| serper \| brave), `WEBSEARCH_CAP` (calls per Cairo day, default 300, 0 = off) |

**Vars** (in `wrangler.toml`): `SITE_URL="https://madeinegyptgate.com/"`, `MAIL_FROM="منصة صنع في مصر <noreply@madeinegyptgate.com>"` (the one
sender for every e-mail; Janna / Bassem / deal mails only change the display name), `TEAM_EMAIL` and `ADMIN_EMAILS`
`"info@madeinegyptgate.com"`, `RESPONDIO_CHANNEL_ID="580384"`, `WA_DRY_RUN="0"` (deploy 2: the Control Center switch decides, OFF by default; `"1"` = hard kill switch), `INBOUND_REPLY_ENABLED="0"` (Cloudflare Email Routing
stays OFF; the domain's Hostinger MX/SPF/DKIM/DMARC are never touched). Bindings: D1 `DB` → `migate-db`
(`f86e00bb-9739-4985-a149-3dddb45b2b42`), R2 `MEDIA` → `migate-media`. Cron `*/15 * * * *`.

**D1 on the EMPTY database, in this order** (each file applies cleanly and is a no-op when re-run):
```
npx wrangler d1 execute migate-db --remote --file=./schema.sql
npx wrangler d1 execute migate-db --remote --file=./migrations/0004_interactive_platform.sql
npx wrangler d1 execute migate-db --remote --file=./migrations/0005_qa_fixes.sql
```
(`schema.sql` is the complete schema; 0004 / 0005 only hold `CREATE … IF NOT EXISTS` + guarded back-fills. An OLD advisor-only database
first runs `tools/upgrade-pre-0004.sql`; a database that ran the first 0004 runs `tools/upgrade-pre-0005.sql` before 0005; a database that ran
the first 0006 (production since 2026-11-18 19:0x UTC) runs `tools/upgrade-pre-0006r.sql` (cc_invoices.period_end, review PAY-H1). `deploy.sh db`
plans each of them only where the column is really missing.)

Then: `cd /home/user/madeinegyptgate && node worker/build-index.js` (cleaned data: f 2,926 + 94, p 183, t 436, q 5, o 102, z 64),
`npm test`, `npx wrangler deploy --dry-run`, `npx wrangler deploy`. Health: `/api/auth/health` (ok, platform_key, no open mode),
`/api/inquiries/health` (`inbound_email:false`, `respond_links:true`), `/api/advisor/health`, `/api/meetings/health`, `/api/wa/health`.

**What deploy 1 adds (contract with the pages / dashboards):**
- **No registered match** → status `in_progress` («جاري معالجة طلبك» / "We're working on your request", buyer-visible event
  `in_progress`, receipt e-mail with Reply-To `TEAM_EMAIL`) · bell for every admin account (`team_needed`, url `inbox.html#<REF>`) ·
  e-mail to `TEAM_EMAIL` + `ADMIN_EMAILS` with the candidate factories · `GET /api/admin/inquiries/:id` → `needs_team`, `candidates[]`
  `{name, governorate, sector, source:"directory"|"web", url, profile_url, snippet, origin, score}` (admins only; directory = not
  registered, never contacted) · `POST /api/admin/inquiries/:id/candidates/refresh` → `{candidates, web_search, at}` ·
  `POST /api/admin/inquiries/:id/reply {body, body_en?, channel:"email"|"whatsapp"|"both", status?:"in_progress"|"replied"|"closed"}` →
  `{ok, sent:{email, whatsapp}, status, fallback?}` («إحنا اللي هنرد»: buyer-visible event `team_reply`, actor `team`; WhatsApp only with an
  approved buyer template — otherwise the e-mail carries it). List: `items[].needs_team`, `counts.needs_team`, `?status=needs_team`.
  A matching member who joins later still receives it automatically (→ `routed`).
- **Login links** in every routed-request e-mail, the 48 h reminder and buyer messages: `dashboard.html#lt=<t>&tab=incoming&ref=<REF>`
  («رد من هنا») + the no-sign-in answer page `/api/inquiries/respond?t=…` (now expires 60 days after sending).
  `POST /api/auth/link {t}` → `{token, user, expires_at, scope:"link"}`: 7-day link, single use, bound to the member and its address;
  the session lasts **24 h** and is LIMITED (incoming requests, quotes, replies, notifications — `403 full_login_required` on Bassem,
  `PATCH /api/me`, `/api/me/prefs` and the admin console). Admin accounts never get links.
- **Tracking** `GET /api/inquiries/:ref` → also `status_label`, `proof` (`link` | `owner` | `last4`), `redacted`, `events[].actor`
  (`team` | `buyer` | `system` | `factory`). Last-4 digits: counted before the compare, 10 per request per day, 20 per network per
  hour, closed for good after 20 wrong tries, and REDACTED (no quotes / replies / messages / chosen factory) — full details need
  the signed link `?t=` or the owner's session.
- **Bassem by e-mail** until WhatsApp is live: the daily «صباح الخير» (real count of new items, `advisor.html#when=now|noon|evening|skip`
  links + a link to Bassem) and «أنا جاهز… اضغط هنا ونتكلم فيديو» (`advisor.html?live=1#login=<code>&live=1`) — list `bassem`.
- **Security (early review):** IPv6 rate limits per /64, Turnstile mandatory on sign-in when configured, a global hourly budget of
  code e-mails (`AUTH_CODES_PER_HOUR`, default 300), atomic code attempts, a signed-in sender speaks only for its own mailbox
  (another address = anonymous handling), factory reply addresses accept the factory's own mailbox only (when inbound e-mail is on).

# Janna lookup API — Cloudflare Worker

Lets the live assistant «جنة» (Anam persona) **search the platform's real directory and say the results herself**
(factories & companies, products, tenders, RFQs, retail offers, industrial cities). Read-only, public data only — no phone
numbers or personal data, no API keys in the code.

## Endpoints
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/janna/lookup` | `{"section":"factories","query":"بلاستيك العاشر من رمضان","governorate":"","limit":6}` | `{count, results[], text}` |
| GET | `/api/janna/lookup?section=tenders&query=حاسب` | same | same |
| GET | `/api/janna/health` | — | `{ok, data, factories, tenders}` |

`section`: `factories` · `suppliers` · `products` · `market` · `tenders` · `rfqs` · `offers` · `cities`.
Understands Egyptian Arabic and English («plastic manufacturers in 10th of Ramadan»), industrial cities (widens to the
governorate when a city has few hits) and the 27 governorates.

## Deploy (once)
```bash
cd worker
npm install                 # needed once: postal-mime (used by the Deal Advisor's email handler) + wrangler
npx wrangler login          # opens Cloudflare in the browser
npx wrangler deploy
```
- `wrangler.toml` serves it on `madeinegyptgate.com/api/janna/*` (the domain must be on Cloudflare). Without the domain,
  delete the `routes` block and use the `https://janna-lookup.<account>.workers.dev` URL instead.
- Optional protection: `npx wrangler secret put JANNA_KEY` — then callers must send header `X-Janna-Key`
  (add the same header to the Anam tool).
- Check: open `https://madeinegyptgate.com/api/janna/health`.

## Update the data
After the site's `data/*.js` files change:
```bash
node worker/build-index.js && cd worker && npx wrangler deploy
```

## Connect it to Janna (Anam)
The persona gets a **SERVER_WEBHOOK** tool `janna_lookup` → `POST https://madeinegyptgate.com/api/janna/lookup` with the
JSON body `{section, query, governorate}`; its `text` field tells her exactly what to say (real names only).
It is attached to the persona as soon as the Worker is live (ask the developer / Claude to attach it).

## Free-plan note
Cloudflare Workers free plan = 100,000 requests/day for all Workers on the account (the Saudi platform's “Error 1027”
was that limit). Janna's lookups are small, but if several platforms share one account consider Workers Paid ($5/month).

---

# AI Deal Advisor API — `/api/advisor/*` («المستشار الذكي للصفقات»)

Backend of `advisor.html` for **partner / strategic** members: a private deal pipeline per member, emails sent to buyers
from the platform, and buyers' replies routed back into the same deal thread. Same Worker as Janna (`src/advisor.js`,
routed from `src/index.js`, which also exports the `email()` handler). Storage = Cloudflare **D1**.
Until it is configured, `GET /api/advisor/health` answers `{ok:false}` and the website runs the advisor in its demo mode
(browser storage + `mailto:`), so nothing breaks.

## Endpoints
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/advisor/health` | — | `{ok, email, store:"d1"\|"none", auth, mode:"platform"\|"open", login:"activation"\|"self", email_login, sending:"platform"\|"drafts"}` — `ok` is true only when D1 + schema + `ADVISOR_SECRET` are in place |
| POST | `/api/advisor/activation` | header `X-Platform-Key`; `{member_id, company, email, plan, send_email?}` | `{member, activation_url, expires_at, emailed, email_error?}` — marks the member verified, plan from the platform; link `advisor.html#login=<code>` (single use, 7 days) is emailed to the member when a provider is set |
| POST | `/api/advisor/login` | `{code}` (the 48-hex code after `#login=`) | `{token, expires_at, member}`; used / expired code → 401 `{login:"activation"}`, member no longer on partner/strategic → 403 |
| POST | `/api/advisor/login/email` | `{email}` | always `{ok:true}`; emails a new login link only to an active, verified member with that address on file (≤ 3 per hour) |
| POST | `/api/advisor/refresh` | Bearer | `{token, expires_at, member}` (new 30-day token) |
| POST | `/api/advisor/session` | `{member_id, company, email, plan}` (+ header `X-Platform-Key` when `PLATFORM_KEY` is set) | `{token, expires_at, member:{…, markets}}` — server-to-server alternative to activation links; plans `partner`/`strategic` only (others → 403) |
| GET | `/api/advisor/deals` | — | `{deals:[…]}` (newest activity first, with `messages_count`, `last_in_at`) |
| POST | `/api/advisor/deals` | `{opportunity:{ref,title,entity,market,country,source_url,closing_date,kind}, stage?, notes?}` | `201 {deal}` (same meaningful `ref`+`market`+`title`+`source_url` again → `{deal, existing:true}`; empty or trivial refs never dedupe) |
| GET | `/api/advisor/deals/:id` | — | `{deal, events}` |
| PATCH | `/api/advisor/deals/:id` | `{stage?, notes?, next_action?, due_date?, contact_email?, contact_name?, value?}` | `{deal}` |
| DELETE | `/api/advisor/deals/:id` | — | `{ok:true}` |
| GET | `/api/advisor/deals/:id/messages` | — | `{messages:[{id, direction:"out"\|"in", status, from, to, cc, subject, body, at}]}`; `in` messages add `envelope_from, sender_verified, sender_auth` and, when not verified, `sender_warning:{ar,en}` (show it next to the message) |
| POST | `/api/advisor/deals/:id/email` | `{to, subject, body, cc?}` | `{message, sent, error?, deal}` |

Everything except `health` and `session` needs `Authorization: Bearer <token>`; a member only ever sees its own deals
(any other id → 404). Stages: `discover, contact, offer, negotiation, contract, delivery, won, lost`.
`deal` = `{id, ref, title, entity, market, country, source_url, closing_date, kind, opportunity:{…same…}, stage, notes,
next_action, due_date, contact_email, contact_name, value, reply_to, created_at, updated_at}`.
Markets follow the plans in `data/plan.js`: partner → local, gulf, africa; strategic → + asia, europe (others → 403 `market not in plan`).
`opportunity.market` is required (empty → 400). Emailing from a deal whose market is no longer in the member's plan (after
strategic → partner) → 403 `market not in plan`. Non-string JSON values (objects/arrays where text is expected) → 400.

**Email behaviour.** Sent from `MAIL_FROM` (default `advisor@madeinegyptgate.com`) with display name
«<Company> via Made in Egypt Gate», `Reply-To: deal-<id>@reply.madeinegyptgate.com`, the member in Cc, plain text + escaped
HTML and a short bilingual footer saying it was sent via the platform on the member's behalf. A successful send moves a
`discover` deal to `contact`. Without a provider the message is stored as `status:"draft"` and the API answers
`{sent:false, error:"email not configured"}`; a provider error is stored as `status:"failed"` with the error text.
Limits: 30 emails per member per rolling 24 h (`MAX_EMAILS_PER_DAY`), ≤ 5 recipients, subject ≤ 200 chars, body ≤ 20,000
chars, request ≤ 64 KB, 500 deals per member. Subjects are folded to one line (no header injection).
**New recipients:** at most 10 addresses per member per rolling 24 h that the member never emailed before and never got a
verified reply from (`MAX_NEW_RECIPIENTS_PER_DAY`; over it → 429 `new recipient limit reached` with `remaining`); the
member's own address and known correspondents are free, drafts do not count. Every email carries an opt-out / abuse line
(`support@madeinegyptgate.com`) and `List-Unsubscribe: <mailto:deal-<id>@reply…?subject=unsubscribe>`; a reply whose subject is
«unsubscribe» / «stop» / «إلغاء الاشتراك» opts that address out for that member (honoured when the sender is verified, or
when header From and envelope sender are both the address the member emailed) — later sends to it → 403 `recipient opted out`.
Watch bounces and complaints in the provider's dashboard (Resend → Emails / Metrics) and in DMARC reports; suspend a
member who causes them by calling `/activation` (or `tools/activate.mjs`) with plan `basic`.

**Replies.** Mail to `deal-<id>@reply.madeinegyptgate.com` reaches the Worker's `email()` handler (Cloudflare Email
Routing). It is parsed with `postal-mime` (encoded Arabic subjects, base64/quoted-printable, multipart, HTML-only mails),
stored as an `in` message on that deal (unknown addresses are rejected), logged as a `reply_received` event, and a copy
goes to the member: a notification email through the provider (works for any address), or, when no provider is set,
`message.forward()`; Cloudflare forwards only to **verified destination addresses** of the account, so with no provider
the member's address has to be added (and confirmed) under Email Routing → Destination addresses.
- **Sender check.** The `From:` header is written by whoever sends the mail, and the deal address is seen by every recipient,
  so it is not a secret. Each reply stores the SMTP envelope sender (`envelope_from`) next to the header From, and is
  `sender_verified:true` only when the **topmost** `Authentication-Results` / `ARC-Authentication-Results` header comes from a
  trusted receiver (`INBOUND_AUTHSERV_ID`) and says `dmarc=pass` for the From domain. Unverified replies are still stored and
  copied to the member, but marked «غير موثّق / Unverified» (subject of the copy + a warning about payment / bank-detail
  requests), and never become the deal's `contact_email`. `INBOUND_AUTHSERV_ID` is **empty by default** (everything is
  "not checked"): after Email Routing is live, send a test reply, read its raw headers (e.g. temporarily log them), and only
  if the very first authentication header is stamped by Cloudflare (`… mx.cloudflare.net; dkim=… dmarc=…`) set
  `INBOUND_AUTHSERV_ID = "mx.cloudflare.net"` in `wrangler.toml`. Trusting a header the receiver does not add would let a
  sender write their own.
- **Limits.** ≤ 20 replies per deal address and ≤ 200 per member per rolling 24 h (`MAX_INBOUND_PER_DEAL_DAY`; more are
  rejected with a temporary SMTP error text); at most 3 copies to the member per deal per hour (further replies are stored,
  `copied:"throttled"`).
- **Plan ended.** When the member is no longer on partner/strategic, replies are still stored on the deal (visible again if
  the member renews) but nothing is emailed or forwarded (`copied:"plan_inactive"`), matching the token revocation.

## Security model
- **Tokens**: `v1.<member_id>.<plan>.<exp>.<HMAC-SHA256(member_id|plan|exp, ADVISOR_SECRET)>`, valid 30 days, checked on
  every call together with the member's current plan in D1, so a downgrade revokes them at once (see below).
- **`PLATFORM_KEY` (set it before launch).** With it, members get a session only through a one-time **login link** created
  with the key (`/activation`: the admin after confirming payment, `tools/activate.mjs`, or a future payment webhook) or
  re-sent to their own address (`/login/email`), or from a server holding the key (`/session`). Those members are
  *verified*; the plan always comes from the platform, never from the browser. Login codes are 192-bit random, stored only
  as SHA-256, single use, 7 days. Health then says `login:"activation"`, and a 401 carries `{login:"activation"}`, so the
  page can tell the member it is waiting for activation (and offer «send me a login link») instead of dropping silently
  to demo mode.
  Without it the API runs in *open mode* (testing only — health says `mode:"open"`, `sending:"drafts"`): the plan is whatever
  the browser claims, anyone can open a session for a **new** member id, an existing member
  cannot be taken over (409), and **nothing is sent through the email provider** for these unverified members (messages
  stay drafts; the site falls back to `mailto:`), so the Worker cannot be used as an open mail relay.
  `ALLOW_UNVERIFIED_SEND = "1"` lifts that last rule — for a private test only.
- CORS is `*` like Janna (no cookies are used; the bearer token is the only credential). No secrets are in the code.

## Deploy (once)
```bash
cd worker
npm install                                    # postal-mime (runtime) + wrangler (dev)
npx wrangler login

# 1) D1 database + tables
npx wrangler d1 create madeinegyptgate-advisor # copy the database_id it prints
#    → in wrangler.toml uncomment the [[d1_databases]] block and paste the id
npx wrangler d1 execute madeinegyptgate-advisor --remote --file=./schema.sql
#    (a database created from the first schema.sql also needs: --file=./migrations/0002_advisor_security.sql;
#     health reports "schema outdated" until then)

# 2) secrets (each command asks for the value; use long random strings, e.g. `openssl rand -hex 32`)
npx wrangler secret put ADVISOR_SECRET          # signs member tokens (required)
npx wrangler secret put PLATFORM_KEY            # only the platform backend may open sessions (required before launch)
npx wrangler secret put RESEND_API_KEY          # optional: email provider (step 4a)

npx wrangler deploy                             # routes now include madeinegyptgate.com/api/advisor/*
```
Check `https://madeinegyptgate.com/api/advisor/health` → `{"ok":true,"store":"d1",…}`.

### 3) Receiving replies — Email Routing for `reply.madeinegyptgate.com`
1. Cloudflare dashboard → the `madeinegyptgate.com` zone → **Email → Email Routing** → enable it; add the subdomain
   `reply.madeinegyptgate.com` (Email Routing → Settings → *Subdomains*) and let Cloudflare add its MX + SPF records for it.
   This does not touch the mailboxes of the main domain (info@ / support@ keep working).
2. **Routing rules → Catch-all address** of `reply.madeinegyptgate.com` → action **Send to a Worker** → `janna-lookup`.
3. (Only if no sending provider is used) add each member address under *Destination addresses* so `forward()` may reach it.
If another subdomain is preferred, change `REPLY_DOMAIN` in `wrangler.toml` to match.

### 4) Sending — pick one
**a) Resend (recommended).** Create an account, *Domains → Add domain* `madeinegyptgate.com` (or a sending subdomain), add
the DNS records it shows (DKIM `TXT`, SPF `TXT` + `MX` on its bounce subdomain, optional DMARC `TXT _dmarc`) in
Cloudflare DNS, wait for *Verified*, create an API key with *Sending access*, then `npx wrangler secret put RESEND_API_KEY`.
The Worker calls `POST https://api.resend.com/emails` with `Authorization: Bearer <key>`, an `Idempotency-Key`, and the
JSON fields `from, to, cc, reply_to, subject, text, html, headers` (response `{id}`).
**b) Cloudflare Email Service.** Onboard the sending domain under *Email → Email Sending* in the dashboard, uncomment the
`[[send_email]] name = "SEND_EMAIL"` block in `wrangler.toml` and redeploy. The Worker then calls
`env.SEND_EMAIL.send({from:{email,name}, to, cc, replyTo, subject, text, html})` (returns `{messageId}`). The plain
Email Routing binding (without Email Service) can only send to verified addresses, so it is not enough for buyers.
`MAIL_FROM` must be on the verified domain. Keep a single SPF record per host name (merge `include:` entries if the domain
already has one) and add a DMARC record (`v=DMARC1; p=none; rua=mailto:info@madeinegyptgate.com` to start).

### 5) Activate members after payment (no platform server needed)
The website is static, so the Worker itself is the source of truth for who has the advisor. When a payment for
**partner** or **strategic** is confirmed, staff run (from any computer with Node 22, key in the environment only):
```bash
cd worker
PLATFORM_KEY=<the key> node tools/activate.mjs --member <member id/username> --company "<company>" --email <member email> --plan partner
# → "Login link emailed to …" (with a provider), or prints advisor.html#login=<code> to send by email/WhatsApp yourself
PLATFORM_KEY=<the key> node tools/activate.mjs --member <member id> --plan basic   # downgrade / cancellation → revoked at once
```
The member opens the link; `advisor.html` posts the code to `/api/advisor/login`, keeps the token (30 days, renew with
`/api/advisor/refresh`), and later asks for a new link with `/api/advisor/login/email` if needed.

**Alternative — a platform server.** If the platform later gets its own backend, it can call (server-to-server only):
```bash
curl -X POST https://madeinegyptgate.com/api/advisor/session \
  -H "Content-Type: application/json" -H "X-Platform-Key: $PLATFORM_KEY" \
  -d '{"member_id":"<platform member id>","company":"<company name>","email":"<member email>","plan":"partner"}'
# → {"token":"v1.…","expires_at":"…","member":{…}}
```
and hands `token` to the logged-in member's page (e.g. in the dashboard response); `advisor.html` sends it as
`Authorization: Bearer <token>`. On downgrade / cancellation call the same endpoint with the new plan (e.g. `"basic"`):
the answer is 403 and every existing token of that member stops working immediately.

## Tests
```bash
cd worker
npm test                     # node:test — 111 tests (advisor, meetings, platform, qa-fixes), D1 = node:sqlite running the real schema.sql,
                             # mocked Resend / respond.io (nothing is ever sent for real)
node test/integration.mjs    # real workerd + local D1 via `wrangler dev --local` in platform mode: activation link → login,
                             # deal, email draft, inbound reply with envelope sender (skips if wrangler is missing)
```

## References (API shapes checked against the official SDK/type packages, Nov 2026)
- Resend — Send Email API: https://resend.com/docs/api-reference/emails/send-email (fields as used by the official `resend` SDK 6.38: `from, to, cc, bcc, reply_to, subject, text, html, headers`; base URL `https://api.resend.com`; `Idempotency-Key` header)
- Resend — Domains / DNS: https://resend.com/docs/dashboard/domains/introduction
- Cloudflare Email Service — Workers API `send()`: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ (types `EmailMessageBuilder`, `SendEmail`, `EmailSendResult{messageId}` in `@cloudflare/workers-types` 5.20261117)
- Cloudflare Email Routing — Email Workers (`email(message, env, ctx)`, `message.raw`, `forward()`, `setReject()`): https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- Cloudflare Email Routing — subdomains: https://developers.cloudflare.com/email-routing/setup/subdomains/
- Cloudflare D1 — Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- postal-mime (MIME parser recommended for Email Workers): https://github.com/postalsys/postal-mime

# Bassem in the live call — profile, permanent memory, web search, item details (consolidation of holo4 + holo5 + holo6)

All under the existing `/api/advisor/*` and `/api/janna/*` routes (no new route in `wrangler.toml`). D1: `migrations/0007_member_profile.sql`
then `migrations/0008_advisor_memory.sql` (both purely additive; both also appended to `schema.sql`). Until they are applied the endpoints
answer 503 `profile_store_off` / `memory_off` and the call simply starts without that part.

| Method | Path | What |
|---|---|---|
| GET / POST | `/api/advisor/profile` | the member's factory profile Bassem records in the call (`src/profile.js`; staff read-only with `?member_id=`). Bassem's saves (`source:"bassem"`) only ADD — never `replace`, never clear |
| GET / POST | `/api/advisor/memory` | Bassem's memory of the member (`src/memory.js`): POST `search` / `turns` / `summary` (tools with `outcome` ok \| refused \| failed) / `fact`; GET `?q=` recall (keywords + time words امبارح / النهارده / آخر مرة … + «جديد»), `?call_id=` = the call going on; GET `/context`. **No DELETE** (405 `memory_permanent`) |
| POST | `/api/advisor/web` | Bassem's web search (`src/websearch.js`), header `X-MIG-Tool: <TOOL_SECRET>` |
| GET / POST | `/api/janna/item` | one directory item in full + a spoken summary (`src/janna-item.js`, data `src/items.json` from `build-items.js`); POST not found = 200 `found:false` |
| POST | `/api/janna/lookup` | now also `page`, `market` (tenders), each result with `id`, `open_url`, `list_key` and the amounts |
| POST | `/api/janna/session` | Bassem's ephemeral persona now carries «النهارده: <Cairo date>», the profile and the memory (each in data markers, ≤ 5,200 characters); `continue_call` (a chain part) = the call's last words from the memory + no second greeting |

**Start of a live call (owner 2026-11-19 «باسم بياخد وقت»).** For a member Bassem greets by name, `POST /api/janna/session` starts the
saved persona's read (`GET /v1/personas/{id}`) beside his D1 context instead of after it; the continuation + factory profile are read
together, and the memory block's seven reads (`memory.js memoryContext`) run together. Every 200 / 502 answer carries
`Server-Timing: checks;dur=…, ctx;dur=…, persona;dur=…, wait;dur=…, token;dur=…, total;dur=…` (milliseconds only, exposed to the page with
CORS); the page keeps it with its own marks in `JANNA_LIVE.timing()` (data/janna-live.js). Tests: `test/session-speed.test.mjs`.

**Memory policy (owner, 2026-11-18):** Bassem's memory is permanent and only grows — no member-facing deletion, no age-based retention, no
row cap; the daily cron consolidates (a call whose final summary never arrived gets it rebuilt) and never deletes. The only erasure is
the owner deleting a whole member account in the Control Center for a formal legal data-subject request (Egyptian PDPL 151/2020):
`DELETE /api/admin/cc/members/:id` then needs `reason` (≥ 10 characters) whenever a memory or a profile exists; reason and counts go to
`cc_audit`. Staff reads of a member's memory are audited (`bassem.memory_read`).

## Memory upgrades — tasks, the daily update, Janna's memory, «بنك المعلومات» (migration 0009)

D1: `migrations/0009_memory_upgrades.sql` after 0008 (CREATE … IF NOT EXISTS only; also appended to `schema.sql`): `memory_tasks`,
`memory_briefs`, `janna_visitors`, `knowledge_bank`. Until it is applied every part fails soft (the tasks endpoint answers 503 `tasks_off`,
Janna's memory 503 `memory_off`, the daily job `{skipped: "no 0009 tables"}`, the sessions start without those blocks). Still no new route in
`wrangler.toml` (`/api/janna/*`, `/api/advisor/*`, `/api/admin/*`, `/api/team/*` are already routed).

| Method | Path | What |
|---|---|---|
| GET / POST | `/api/advisor/memory/tasks` | Bassem's tasks with the member (`src/tasks.js`): GET `?status=open\|done\|all`; POST `{action: add\|done\|cancel\|reopen\|due, id?, title?, due?}` — the persona's `bassem_tasks` tool (staff GET only, audited) |
| POST | `/api/janna/memory` | Janna's memory of a visitor (`src/visitor.js`): `{visitor_id, kind: turns\|summary\|search\|fact, …}` like Bassem's, `{kind: "contact", email?, phone?}` → keyed hashes only (never a link, never says whether the address is a member's). Site origin only; no sign-in needed — but a visitor id LINKED to a member is read / written only with that member's own full sign-in (else 409 `visitor_linked`, `rotate_visitor: true`); a signed-in write to an unlinked id links it to him; per-network / per-visitor limits; **no DELETE** |
| GET / POST | `/api/janna/memory/tasks` | Janna's tasks with that visitor (`janna_tasks` tool), `visitor_id` in the query / body (same linked-id rule) |
| GET / POST | `/api/janna/knowledge` | «بنك المعلومات» lookup for the personas (`src/knowledge.js`, Anam SERVER_WEBHOOK `knowledge_lookup`, header `X-Janna-Key` when `JANNA_KEY` is set) |
| GET / PUT | `/api/admin/cc/knowledge[/:id]` · `/api/team/desk/knowledge[/:id]` | the questions to answer («محتاجة إجابة» first); the team's answer / approval and question edits / redaction (`{answer?, status?, question?}`; `content.read` / `content.write`; the data desk; one `cc_audit` row each) |
| POST | `/api/admin/cc/memory/erase` | the ONLY memory erasure: the owner (`members.delete`), ONE person (`member_id` \| `visitor_id` \| `visitor_email` \| `visitor_phone` + `visitor_ids` = the ids the owner confirms from the dry run's `matches` — a claimed contact can be shared), `reason` ≥ 10 characters (formal PDPL 151/2020 request), `confirm`, `dry_run`; the bank entries only he asked go too; one `cc_audit` row in the same batch |
| POST | `/api/janna/session` | Janna: body `visitor_id` → an ephemeral copy of Janna with the visitor block («زارنا قبل كده …», open tasks first) and the 10 most asked approved Q&A, «أهلاً بيك تاني …» for a returning visitor; 200 `visitor_context: true` (+ `memory`, `knowledge`). Nothing to add → today's plain request |

- **Tasks** come from the client's requests in the call (due date read from the words: بكرة / الساعة 9:30 / يوم الخميس / 25 نوفمبر …), the
  persona's own promises (labelled «باسم قال (مش متأكد)»), refused / failed tools, drafts not sent, forms not submitted; they close when the
  matching tool succeeds (same call after the request, or later), or in the daily job (deal now exists, follow saved, meeting day over,
  visitor registered). Open tasks + due dates are the FIRST section of the next call's memory block.
- **The daily job** (`src/daily.js`, platform cron, the first ticks after Cairo midnight, for yesterday): a day digest per client
  (`advisor_memory` kind `day`, recall «امبارح» reads it first) and «ملخص العميل» (`memory_briefs`, ≤ 1,500 characters) given to every
  Bassem call; then the tasks' maintenance, the knowledge bank's near-duplicate merge and the caps report. It waits for that day's
  consolidation (`memory.js memoryCron`) to close; both run on ONE counting D1 per tick (`TICK.budget` 450 statements — D1 allows 1,000
  per invocation; review 2026-11-19 #2), resume on the next 15-minute tick, write their day gates only when done, and skip the 07:00
  digests tick. Idempotent, no LLM.
- **Permanent memory caps:** 50,000 raw call turns / 10,000 searches per client (`LIM.turnsCap` / `LIM.searchesCap`; the Worker variables
  `MEMORY_TURN_CAP` / `MEMORY_SEARCH_CAP` can only RAISE them). Past a cap the client is only REPORTED (`daily.js capReport`, in the cron
  log): nothing is ever deleted automatically (owner's policy; review 2026-11-19 #13). The daily row ceiling bounds a runaway client.
- **Janna's visitors:** the page's random `mig-vid` id; contact = HMAC hashes (never the address / number, never a link); linked to the
  member ONLY by his own full sign-in from that browser (`session`, never moved to another member). A linked id is his: nobody else reads
  its memory / tasks or writes to it (409 `visitor_linked`), the session answer says `rotate_visitor`, and the page starts a new id after
  sign-out (review 2026-11-19 #5 / #6 / #7). An unauthenticated visitor's block only ever reads an UNLINKED visitor id. Off switches:
  `JANNA_VISITOR_CONTEXT` = 0 (no block in the session), `JANNA_VISITOR_MEMORY` = 0 (no recording); per call: body `visitor_context: false`.
- **«بنك المعلومات»:** anonymous (no ids, names, companies, e-mails, phones, links; introduction clauses, «يا أحمد», spoken numbers /
  e-mails stripped); a persona only sees entries the TEAM answered / approved (review 2026-11-19 #4: no automatic approval); a reply with a
  payment instruction is never stored as an answer; every text through `forLLM` + `instructionLike` (folded: tatweel, diacritics,
  look-alike letters).

# Platform API — accounts, automatic inquiry routing, follows, notifications, metrics, WhatsApp

Phase A of `docs/janna/INTERACTIVE-PLAN.md`, built on the owner's final decisions: **fully automatic, no human in the
loop**. Every request is matched and delivered by the Worker; every reply/quote is forwarded by the Worker; the admin
pages only *monitor*. Nothing is ever reported as "sent" unless the provider returned an id; no number is invented.

Code: `src/auth.js` (login) · `src/me.js` (account) · `src/inquiries.js` (engine, tracking, inbound email, cron) ·
`src/matching.js` (matching engine) · `src/admin.js` (monitoring) · `src/whatsapp.js` (respond.io) · `src/digest.js`
(daily digests / deadline reminders) · `src/ev.js` (metrics, unsubscribe) · `src/common.js` (plans, email layout) ·
`src/text.js` (Arabic normalisation shared with the Janna lookup). Tables: `schema.sql` (new DB) or
`migrations/0004_interactive_platform.sql` then `migrations/0005_qa_fixes.sql` (existing DB, in that order).

All JSON; errors are `{error, code}`; auth = `Authorization: Bearer <token>` (the page keeps it in localStorage `mig-tok`).

## Endpoints
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/auth/request` | `{email, lang, turnstile?}` | `{ok:true}` (same for any address) · 429 `rate_limited` · 503 `email_off` |
| POST | `/api/auth/verify` | `{email, code}` | `{token, expires_at, user}` · 401 `invalid_code` · 429 `too_many_attempts` |
| POST | `/api/auth/logout` | Bearer | `{ok}` (revokes this session) |
| GET | `/api/auth/health` · `/api/inquiries/health` · `/api/wa/health` | — | `{ok, store:"d1", …}` |
| GET / PATCH | `/api/me` | PATCH `{name,title,company,phone,sector,governorate,products,inbox_paused}` — no links / e-mail addresses / platform names; ≤20 product terms; company locked (409 `company_locked`) once `factory_ref` is set | `{user, unread}` / `{user}` |
| GET | `/api/me/inquiries` | — | `{items}` (requests I sent) |
| GET / POST / DELETE | `/api/me/follows` | `{kind, ref_id, label, url}` (DELETE: body or `?kind=&ref_id=`) | `{items}` / `{ok, items}` / `{ok}` |
| GET | `/api/me/notifications` | `?lang=en` → English `title`/`body` (every item also has `title_ar`, `title_en`) | `{items, unread}` |
| POST | `/api/me/notifications/read` | `{ids:[…]}` or `{all:true}` | `{ok, unread}` |
| POST | `/api/me/prefs` | `{morning_time, session_time, days, call_today_at, pause, wa_optin, email_digest, incoming}` — `days` = 0-6 (0 = Sunday) or names `sun…sat` / Arabic | `{prefs}` (+ `day_names`, `incoming`, `wa_verified`) |
| GET | `/api/me/stats` | basic+ | `{since, metrics:{views, wa_clicks, web_clicks, inquiries}, enough, threshold}` |
| GET | `/api/me/incoming` | basic+ | `{items}` — requests routed to me: `{ref, kind, my_status: new\|replied\|quoted\|declined\|closed, status, title, target_name, routed_at, created_at, payload{product, quantity, governorate, deadline…}, buyer{first_name, company, type, email_confirmed}, message, items, quote, quotes_count, quotes_left, respond_url}` (buyer email/phone never included; another factory's name never shown) |
| POST | `/api/me/incoming/:ref/quote` | `{price, currency, moq, lead_time, validity, note}` | `{ok, buyer_notified, revised, quotes_left}` — forwarded automatically; first quote + 2 revisions, then 429 `quote_limit` |
| POST | `/api/me/incoming/:ref/decline` | `{reason}` | `{ok, buyer_notified}` — the reason reaches the buyer (timeline, bell, email) |
| POST | `/api/me/incoming/:ref/reply` | `{message}` | `{ok, buyer_notified}` — a message to the buyer |
| POST | `/api/inquiries` | `{kind, target_type, target_id, target_name, name, company, email, phone, consent_wa, message, payload, items, source, lang, turnstile?}` | 201 `{ok, ref, status, routed, matched, queued}` (`routed` = delivered; `queued` = matched but delivery being retried) |
| GET / POST | `/api/inquiries/respond?t=<signed>` | the link in every factory / buyer email and factory WhatsApp | HTML page, no sign-in: factory quotes / writes / declines (`t=r.…`), buyer writes to that factory (`t=b.…`) |
| GET | `/api/inquiries/:ref` | `?last4=NNNN` or `?t=<token from track link>` or Bearer owner; `&lang=en` | `{ref, kind, status, target_name, created_at, routed_count, replies_count, events:[{type, body, created_at}]}` |
| POST | `/api/ev` | `{kind, ref, metric: view\|wa_click\|web_click\|inquiry}` (sendBeacon ok) | 204 |
| POST | `/api/advisor/notify` | partner/strategic token; `{message, channel: whatsapp\|email\|both}` | `{ok, sent:{email, whatsapp}, pending:{whatsapp}, errors?}` — `sent.whatsapp` only when the text itself went out (24 h window); outside it a template notification goes out and the text is `pending` until the member replies |
| GET | `/api/admin/inquiries?status=&q=&limit=&before=` | admin | `{items, counts}` |
| GET | `/api/admin/inquiries/:id_or_ref` | admin | `{inquiry, events, routes, quotes}` — each route has `email_status` / `wa_status` (`sent`, `template`, `failed`, `skipped`, `pending`), `quote`, `quotes_count`, `error`, `attempts` |
| POST | `/api/admin/inquiries/:id_or_ref/resend` | admin | `{ok, routed, added}` |
| POST | `/api/admin/block` | admin; `{email}` or `{ip_hash}`, `reason` | `{ok, revoked}` — also ends that member's sessions, pauses its incoming requests; quotes and email replies are refused |
| GET / POST | `/api/admin/members` | admin or `X-Platform-Key`; POST `{email\|id, plan, plan_expires, company, name, title, phone, sector, governorate, products, factory_ref, role}` | `{items}` / `{user, rematched}` |
| GET | `/api/admin/wa?flag=mood` | admin | WhatsApp log (mood flags, stops, time choices) |
| POST | `/api/wa/inbound?secret=WA_WEBHOOK_SECRET` | respond.io "message received" webhook | `{ok, intent}` |
| GET / POST | `/api/unsub?e=&l=&s=` | signed link in every non-login email (GET = confirm page, POST = apply; RFC 8058 one-click; POST `action=resub` turns it back on); `l=whatsapp` = the stop link in the WhatsApp consent notice | HTML |
| GET / POST | `/api/meetings/:id/cancel?sig=` | signed link in every meeting confirmation / reminder | HTML (GET asks, POST cancels) |

Inquiry kinds: `contact | rfq | basket | opp_offer | lead_interest | project_interest | entity_contact | signup | profile_fix`.
Statuses: `received` (delivery being retried) → `routed` (sent to N) / `no_match` (open, waits for matching members) →
`replied` (reply or quote received) → `closed` (auto after 30 days); `recorded` for kinds that are not routed; `blocked`.
Refs look like `MIG-26-7KQ4PX` (6 random characters). The buyer's receipt links to `track.html#<ref>~<t>`; the page calls
`GET /api/inquiries/<ref>?t=<t>` (or asks for the phone's last 4 digits).

## How the automatic routing works (owner decision 1)
- **Who can receive:** only REGISTERED members on basic, premium, partner or strategic, whose plan was set by the platform
  (`verified`), not expired, with an email, and not paused (`inbox_paused`, or "incoming" unsubscribed). Directory
  factories that are not members are never contacted. Factory phones are never shown; buyer email/phone are never sent to
  factories — both sides write through the platform addresses.
- **Matching** (`src/matching.js`): sector + products/keywords of the member vs. the request text, product, sector and
  basket items, with Arabic normalisation (أ/إ/آ→ا, ة→ه, ى→ي, diacritics, «ال», plural/nisba endings, stop words and
  generic words such as «صناعات/منتجات», common English→Arabic); same governorate is a bonus; the member who owns the
  targeted directory profile (`factory_ref`, set by admin) always matches. Geographic scope: the request's market
  (`payload.market` or the buyer's `payload.country`, default Egypt) must be in the member's plan (basic = Egypt;
  premium + Gulf/Arab; partner + Africa; strategic = all). Premium-and-above are ranked first when the match itself is
  relevant (score ≥ 8 and ≥ half of the best match). Max 10 per request. Self-service sector/products changes re-match at
  most once a day (20 open requests max).
- **Delivery:** email from `NOTIFY_FROM`/`MAIL_FROM` with a signed answer link (`/api/inquiries/respond?t=r.…`, no sign-in)
  and `dashboard.html#incoming=<ref>`, plus WhatsApp through respond.io when the member opted in (free text inside the
  24 h window; otherwise the approved template `bassem_update` as a notification and the request text QUEUED until the
  member answers). The buyer is told the true number delivered — the email accepted by the provider or the WhatsApp text
  itself; a template ping alone is not a delivery. Failed sends are retried by the cron (up to 5 times; WhatsApp is never
  pinged twice) and the buyer is told when they go out. A factory gets at most `MAX_ROUTES_PER_MEMBER_DAY` (30) new
  requests a day. The factory sees what is wanted, never whom the buyer picked (another factory's name is only shown to
  that factory). Anonymous buyers (not signed in): links are removed from their text and factories are told the buyer's
  email is not confirmed yet; a company name with a link / e-mail / the platform's name is refused.
- **Replies without Email Routing (default, `INBOUND_EMAIL` unset — owner decision BACKLOG 24/31):** emails carry
  `Reply-To: NOREPLY_EMAIL` and say "use the link"; factories answer, quote (first + 2 revisions) or decline on the signed
  page or in the dashboard; buyers write to one factory on their own signed page. Every reply/quote email to the buyer
  carries a payment-safety note.
- **Replies by email (`INBOUND_EMAIL=1`, only after Email Routing for `REPLY_DOMAIN` is set up):** `Reply-To:
  inq-<ref>-<route>@` (that factory), `inq-<ref>-b<route>@` (the buyer to that factory), `inq-<ref>-<reply_key>@` (the
  buyer). Only these KEYED addresses are accepted; a key-less `inq-<ref>@` is always rejected (a From header can be forged);
  limits count accepted senders only (per address key 30/day, per request 100/day), blocked senders are refused.
- **No match:** the buyer is told so plainly; the request stays open 30 days and is sent automatically when a matching member
  is activated (`POST /api/admin/members`, `/api/advisor/activation`) or a member changes sector/products (`PATCH /api/me`).
- **Replies:** the buyer gets every reply / quote / decline (with its reason) by email, on the tracking page and in the bell
  (also when they sent the request before signing up: requests from the same mailbox are attached at sign-in); status
  becomes `replied`. Factories get a bell notification for each routed request and each buyer message.
- **Cron (every 15 min):** one reminder to a factory that has not answered after 48 h; auto-close after 30 days with a
  final email; once a day after 07:00 Cairo: follow digests and 7-day / 1-day deadline reminders; Bassem's WhatsApp.

## Plans (server truth; owner decision 3)
`visitor` (signed in, no plan) · `profile` ("بيانات الشركة فقط", alias `data`) · `basic` · `premium` · `partner` · `strategic`.
All plans may see tenders, RFQs, awards, project news, opportunities and supplier/contractor data; the difference is the
geographic scope returned in `user.markets`. Server checks: alerts/digests profile+; respond/receive requests and stats
basic+; matching priority premium+; Bassem (`/api/advisor/*`, `/notify`, daily WhatsApp) partner/strategic only — a basic
member's token gets **403 `{code:"plan"}`**. An expired `plan_expires` counts as visitor everywhere.

## Security & privacy
- Login codes: 6 digits, only a keyed SHA-256 stored, bound to the EXACT address they were mailed to (`a+x@` never opens
  `a@`), 10 minutes, single use, 5 wrong attempts burn the code, 15 wrong codes per address per day lock it until the next
  day, ≤5 codes per address per hour and 10 per day, ≤20 per IP per hour, ≤30 verify attempts per IP per 10 min; optional
  Turnstile (`TURNSTILE_SECRET`: checked on `/api/auth/request` when a token is sent, required for anonymous requests).
- Accounts: a sign-in reuses a row only if the platform verified it or an email-code sign-in created it (rows minted through
  the advisor's test-only open mode are never adopted). `/api/advisor/session` fails closed (503) without `PLATFORM_KEY`
  unless `ADVISOR_OPEN_MODE=1` (local testing only; `/api/auth/health` then reports `ok:false`). Blocked addresses: every
  session stops working.
- Tokens: `v2.<member>.<session>.<exp>.<HMAC>` (30 days), session row revoked on logout. Admin = `role=admin` or a
  verified address in `ADMIN_EMAILS`.
- Requests: ≤5 per IP per 10 min, ≤10 per address per day, a double submit from the same network / account returns the same
  ref (never another requester's), blocklist (email/IP hash).
- Metrics (`/api/ev`): counted only from the platform's own pages (Origin / Referer host = the site, `EV_ORIGINS`), once per
  network per day per item (the User-Agent is not part of the key), ≤300 counted events per network per day.
- WhatsApp: the log stores a keyed hash of the phone; switching WhatsApp on (or changing its number) emails a notice with a
  one-click stop link; the first message from the member's own number marks it verified (`prefs.wa_verified`).
  Tracking needs the ref plus the phone's last 4 digits or the signed link; failures are rate-limited and look like "not found".
- PDPL: no raw IPs (keyed hashes only), consent flag for WhatsApp (`consent_wa`, `prefs.wa_optin` needs a phone), every
  non-login email has a working unsubscribe link (`digest`, `updates`, `incoming`, `all`) that can be undone (page button,
  `prefs.incoming` / `prefs.email_digest`, admin), old rate-limit / metric hashes / login codes are purged daily. No card
  fields anywhere (payment later through the N-Genius hosted page). Buyer WhatsApp updates need an approved template
  (`WA_TPL_BUYER_UPDATE`, none yet): until then the receipt says updates come by email (`/api/inquiries/health` →
  `buyer_whatsapp:false`).

## respond.io (WhatsApp)
- Verified read-only on 2026-11-18 with the account token: `GET https://api.respond.io/v2/space/channel` → channel `580384`
  "Whatsapp Business"; `GET /v2/space/channel/580384/template` → `bassem_morning` (body `صباح الخير {{1}}  طمني علي صحة حضرتك`),
  `bassem_call_ready`, `bassem_update`, all `ar_EG`, MARKETING, with `call_permission_request` — **status was still
  "submitted"** (not yet approved by Meta). Template sends fail until they are approved.
- Sending (`sendWA` in `src/whatsapp.js`, the only function that calls respond.io): `POST /v2/contact/phone:+20…/message`
  `{channelId, message:{type:"text", text}}` or `{type:"whatsapp_template", template:{name, languageCode:"ar_EG",
  components:[{type:"body", text, parameters:[{type:"text", text}]}]}}` → `{messageId}`; on 404 it creates the contact
  (`POST /v2/contact/phone:+20…`) and retries once. **TODO-VERIFY** with one real message to the owner's own number before
  launch (shape read from the API reference, never sent during development). Real sending = a token AND `WA_DRY_RUN` not `"1"` AND the Control
  Center switch on (`waLive`); otherwise a dry run is logged (masked number, no text). The one test message goes through `sendOwnerTest`.
- Inbound: respond.io → Workflows/Integrations → Webhook on "message received" →
  `https://madeinegyptgate.com/api/wa/inbound?secret=<WA_WEBHOOK_SECRET>`. Understands «إيقاف»/«ابدأ», time choices
  (دلوقتي / الضهر / بالليل / مش النهارده / «الساعة 3» / 14:30 → `prefs.call_today_at`, today only), «الحمد لله» and
  «متضايق»-type replies (automatic caring answer; a monitoring copy to TEAM_EMAIL and `GET /api/admin/wa?flag=mood`).
  Payload parsing is lenient (TODO-VERIFY against a real webhook body).
- Bassem's daily message: partner/strategic, `prefs.wa_optin`, not paused, at `prefs.morning_time` (default 09:00 Cairo)
  on `prefs.days` (default every day) → `bassem_morning` with {{1}} = title + name (inside an open 24 h window: a text with
  the REAL count of new items in the member's scope, or "nothing new today"). Call time = `prefs.call_today_at` (today),
  else the standing `prefs.session_time` on the member's days ("مش النهارده" skips today) → `bassem_call_ready` (text
  queued) or, inside the window, a text with a one-time sign-in link `advisor.html?live=1#login=<code>&live=1` (single use,
  12 h; `POST /api/advisor/login` exchanges it). Anything sent as a template "ping" (a routed request, a Bassem note, the
  call link) waits in `wa_messages` (status `queued`, 72 h) and goes out automatically when the member answers.

## Data for digests
`node build-index.js` now also writes `i` into `src/data.json`: `[kind, id, date, sector, governorate, title, site url,
deadline, market, entity, source url, aliases]` for tenders (local + international with their market), RFQs, news, events,
awards and retail offers — sourced data only; `data/projects.js` ("SAMPLE DATA") and `data/deals.js` (illustrative) are
excluded. `aliases` are the ids the pages use: `opportunity.html#et003` / `#in4` (MIGOID / realIntl), `OT-<ref>`
(tenders.html), `OR-<ref>` (rfqs.html); the site url of an item opens it (`opportunity.html#<alias>`,
`tenders.html#OT-<ref>`, `rfqs.html#OR-<ref>`). A follow keeps the page's id (`ref_id`) and stores the resolved index id
(`item_id`) for deadline reminders. Follow kinds: factory, company, tender, rfq, project, offer, entity, agency, region,
city, governorate, sector, store, event, news, award, opportunity, lead, radar, search, market, product. "New" means first seen after the first sync (`seen_items`), so rebuild → `build-index.js` →
deploy must run for alerts to fire.

## Deploy additions (once)
```bash
npx wrangler d1 execute <db> --remote --file=./migrations/0004_interactive_platform.sql   # existing DB only
npx wrangler d1 execute <db> --remote --file=./migrations/0005_qa_fixes.sql               # existing DB only (after 0004)
npx wrangler secret put RESPONDIO_TOKEN      # respond.io Developer API token
npx wrangler secret put WA_WEBHOOK_SECRET    # long random string, also in the respond.io webhook URL
# already listed above: ADVISOR_SECRET (signs logins too), RESEND_API_KEY, MEETINGS_SECRET, ANAM_API_KEY, PLATFORM_KEY,
# optional TURNSTILE_SECRET. Vars in wrangler.toml: ADMIN_EMAILS, TEAM_EMAIL, RESPONDIO_CHANNEL_ID, MAIL_FROM (NOTIFY_FROM).
# Email Routing is NOT enabled (owner decision, BACKLOG 24/31): keep INBOUND_REPLY_ENABLED="0" — factories and buyers answer on the
# signed pages / login links. Only if Email Routing for reply.madeinegyptgate.com is set up later: INBOUND_REPLY_ENABLED="1"
# (catch-all → this Worker; the old name INBOUND_EMAIL="1" is still accepted).
# Never set ADVISOR_OPEN_MODE in production.
PLATFORM_KEY=... node tools/set-plan.mjs --email owner@factory.com --plan basic --sector "..." --products "..."
```

# Admin Control Center — deploy 2 (src/acc*.js, src/content.js, src/payments.js, src/email-center.js, src/crypto.js)
Contract: `docs/janna/ACC-CONTRACT.md` (§0–§12). Production order, smoke checks and rollbacks: `deploy/README-DEPLOY.md` §11 «النشر الثاني».
Pages URLs (FRONTEND.md): the Control Center is **/admin/** («لوحة التحكم»), THE sign-in page **/login/** (e-mail code + the old-password card +
staff routing: owner/admin/editor/support → /admin/, seo → /seo-team/, data → /data-desk/), `/pay/`, `/seo-team/`, `/data-desk/`; the owner's
OLD `/panel.html` and `/login.html` stay on mis-egypt (deploy/legacy-live.txt). E-mails link `login/` (acc-base `loginUrl`); `/api/team/whoami`
`team_page` = `admin/` | `seo-team/` | `data-desk/`.
D1: `migrations/0006_admin_center.sql` — purely additive and idempotent (31 `cc_*` tables, seeds = today's values, no `ALTER TABLE`). On the
live database only 0006 is new; an EMPTY database runs `schema.sql → 0004 → 0005 → 0006` (schema.sql also carries 0006 at its end).
`src/index.js` hands one `CC = {acc, content, payments, email}` object to every new handler (no cross-area imports, §0.2); `ccBoot` runs first
in `fetch()`, `email()` and `scheduled()` (plans matrix, mail config, service keys), and `platformCron` runs `CC.acc.ccCron` last (payments, content, e-mail, acc jobs).

## Control Center API (panel.html) — src/acc.js + src/acc-*.js (docs/janna/ACC-CONTRACT.md §3.1, §12)
Every `/api/admin/cc/*` call needs a v2 session from an **e-mail-code** sign-in whose member has a Control Center role — owner (ADMIN_EMAILS with a
verified mailbox, or `cc_staff`), admin, editor, support — or `X-Platform-Key` (= PLATFORM_KEY; admin permissions minus the owner-only ones). The team
roles `seo` (seo-team.html → /api/seo/*) and `data` (data-desk.html → /api/team/desk/*) have no Control Center access. Old-password-bridge sessions and
e-mail-link sessions never get a role. Every write: 120/min per actor, one `cc_audit` row (who, what, before/after; secrets redacted) — if the audit row
cannot be written, nothing changes (500 audit_failed). CORS only for https://madeinegyptgate.com, https://www.madeinegyptgate.com (+ CC_ORIGINS in tests).
* members & subscriptions, customers (from inquiries), orders over inquiries («إحنا اللي هنرد» = teamReply), legacy data, approvals, plans matrix
  (single source of truth: applied in place to PLAN_SCOPE / PLAN_NAME / PLAN_MARKETS / ELIGIBLE and planCan/planLimit), settings, staff, audit, reports,
  Bassem monitor, import from the old PHP system (owner only), persona sync (Anam: only the plans facts of Janna AR/EN and Bassem are rewritten).
* member self-service: /api/me/{account,products,company,media,invoices,recognize}; public JSON: GET /api/plans, GET /api/settings (60 s cache, 60/min);
  page analytics POST /api/ev/pv (aggregated counters only: no raw IP, user agent or referrer is stored; bots and foreign origins ignored).
* old system: /api/index.php* = transparent proxy to LEGACY_ORIGIN (not routed in deploy 2); POST /api/auth/legacy = old-password sign-in checked by the
  old API server-side (never stored), 7-day session marked `legacy`, security e-mail with a «مش انت؟» link (GET|POST /api/auth/legacy/stop).
  Only for accounts from the old system (imported / created by the bridge, mailbox never proven); Turnstile required when TURNSTILE_SECRET is
  set; the session ("lg…") has the scope of an e-mailed login link (read, pay, answer routed requests) — ACC-CONTRACT §13.7.
* team front desk (§12): GET /api/team/whoami, POST /api/team/desk/{inquiry,member,content}, GET /api/team/desk/mine.
* content overlay + media (src/content.js, §3.2/§4): `/api/admin/cc/content/*` and `/api/admin/cc/media*` (through acc's router); the published
  edits are served at `GET /data/overlay.js` (isolate memo 30 s → caches.default → KV `acc:overlay` → D1 `cc_overlay` → `window.MIGOVL_DATA=null;`,
  `max-age=60`, never 5xx) and uploads at `GET /media/u/<yyyy>/<id>.<jpg|png|webp>` (R2 `MEDIA`, prefix `u/`; pending images only with a signed
  1-hour preview link). The Worker writes only the KV keys `acc:*`; the Pages SEO API stays the only writer of `seo:bundle`.
## Secrets (additions)
* `CONFIG_SECRET` — REQUIRED before any gateway / mail / Anam key is saved in the panel (AES-GCM key store, crypto.js; 503 `config_secret_missing`
  otherwise); `openssl rand -base64 32`. Rotating it makes stored keys unreadable (`readable:false`; the panel then asks for them again).
  Optional: `BREVO_API_KEY` (used when the Control Center provider is Brevo and no key is saved in the panel).
* `CF_DEV_TOKEN` — optional: the Cloudflare API token of the developer panel «🛠️ المطوّر» (deploys + rollback). Normally the owner saves it in
  «مفاتيح الخدمات» → slot `cloudflare.dev_token` instead; the Worker secret, if set, wins.
## Routes (deploy 2 additions)
/api/plans*, /api/settings*, /api/pay/*, /api/ev/*, /api/team/*, /data/overlay.js*, /media/u/* on both hosts. /api/index.php* is NOT a route of this
Worker in deploy 2 (the owner's mis-egypt Worker keeps proxying it); handleOldApi is ready for the day it is retired.
`/admin/`, `/login/`, `/pay/`, `/seo-team/`, `/data-desk/` are static Pages files of the new build; `/panel.html`, `/login.html`, `/api/index.php*`,
`/data/auth.js`, `/data/me.js`, `/data/egadm.js` stay on mis-egypt (no route of mis-egypt changes in deploy 2; the old admin-release command was dropped).

## Service keys «مفاتيح الخدمات» + the WhatsApp live switch — src/acc-keys.js, src/service-keys.js (owner decision 2026-11-18)
Owner only (`keys.manage` ∈ OWNER_ONLY: admin / editor / support / X-Platform-Key → 403 `owner_only`; seo / data → 403 team page).
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/cc/keys` | — | `{config_secret, store, slots:{"respondio.token"\|"anam.api_key": {set, tail, set_at, set_by, readable, env, env_name, effective: env\|panel\|none, last_test}, "respondio.channel": {value, env_value, prefill, effective, source}}, wa:{switch, live, dry_run, dry_run_env, reason, token, test_ok_at, test_sent_at, live_at, live_by, own_number, own_display, can_send_test, can_go_live, steps}, payments:{read_only, section:"payments", slots, gateway}\|null, limits}` — never a value |
| PUT | `/api/admin/cc/keys/:slot` | `{value}` ("" deletes) | `{ok, slot, item:{set, tail, set_at, set_by, readable}, wa_reset}` · 503 `config_secret_missing` · 422 `invalid` · 404 `unknown_slot` · 400 `use_payments` / `use_email` |
| DELETE | `/api/admin/cc/keys/:slot` | — | `{ok, slot, item:{set:false}, env_in_force, wa_reset}` |
| POST | `/api/admin/cc/keys/:slot/test` | — | `{ok, status, detail, source, at}` (+ respond.io: `channel, channel_found, token_ok, wa_test_ok_at`) · 409 `not_set` / `unreadable` · 429 (10/hour) |
| POST | `/api/admin/cc/keys/wa-test` | `{mode?: "text"\|"template"}` | `{ok, sent, to:"01062531295", mode, provider_id\|error, next, hint?}` · 409 `not_set` / `dry_run_env` / `token_test_required` · 429 (3/hour, 5/day) |
| POST | `/api/admin/cc/keys/wa-live` | `{on, confirm_delivered}` | `{ok, switch, live, dry_run, dry_run_env, reason}` · 409 `not_set` / `token_test_required` / `test_message_required` / `delivery_confirmation_required` with `need` |
Slots: `respondio.token`, `anam.api_key` (cc_secrets, AES-GCM with `CONFIG_SECRET`, AAD per slot) and `respondio.channel` (a plain setting).
Settings (cc_settings scope `system`, reserved prefixes — never a custom setting): `respondio.channel`, `wa.live` (default off), `wa.test_ok_at`,
`wa.test_sent_at`, `wa.test_msg_id`, `wa.live_at`, `wa.live_by`, `keys.test.<slot>` (last test: at, ok, status, detail, source, by).
Precedence: a Worker secret wins (`RESPONDIO_TOKEN`, `ANAM_API_KEY`), else the panel slot; the channel = the panel value, else
`RESPONDIO_CHANNEL_ID`, else 580384. **Effective WhatsApp** (`whatsapp.js waLive`, also the Meta WA_TOKEN reminders in meetings.js):
token AND `WA_DRY_RUN` not `"1"` (any value but `"0"`/empty is the kill switch) AND the switch on after a passed test — anything missing,
unknown or unreadable (no 0006 tables, CONFIG_SECRET rotated, not loaded yet) → dry run. `/api/wa/health` `dry_run` is that effective value
(+ `switch`, `dry_run_env`, `reason`). Order to go live: save the token → test (`GET /v2/space/channel`, the channel must be listed) →
one test message to the platform's own number (public setting `whatsapp_number`) → the owner confirms it arrived → switch on. A new or
deleted token, or a changed channel, switches it off again. `loadServiceKeys(env)` (ccBoot, memo per `env.DB`, 60 s) feeds the sync
`svc(env)` view; decrypted values never leave that memo. Every real send re-reads the switch from D1 (`waSwitchNow`) right before the
provider call, so «إيقاف» stops all isolates at once. Audit: `keys.set`, `keys.delete`, `keys.test`, `wa.test`, `wa.live` — no values.
Slot `cloudflare.dev_token` («Cloudflare — لوحة المطوّر», the developer panel below): a secret slot WITHOUT a tail; `GET /keys` → `cloudflare:
{token:{set, set_at, set_by, readable, env, env_name:"CF_DEV_TOKEN", effective, testable, last_test}, account_id, pages_project, workers,
permissions_ar, permissions_en}`; its test = token verify + the Pages project + the janna-lookup deployments (GET only) → `checks:{token, pages, workers}`.

## Developer panel «🛠️ المطوّر» — src/acc-dev.js, src/flags.js, src/cf-api.js (owner request 2026-11-19)
The owner changes features, sees / rolls back deploys and checks the platform's health without us. Owner only: permission `dev.manage` ∈
OWNER_ONLY (admin / editor / support / `X-Platform-Key` → 403 `owner_only`, seo / data → 403 team page) — same Bearer session, origin-only CORS,
120 writes/min and audit rules as every Control Center endpoint. `whoami.features.dev` (show the section) and `dev_token` (a token is saved).
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/cc/dev/features` | — | `{features:[{key, label_ar, label_en, desc_ar, desc_en, default, scope, value, overridden, effective, locked, needs, enforced_by, updated_at, updated_by}], policies, updated_at, updated_by, public}` |
| PUT | `/api/admin/cc/dev/features` | `{features:{key: true\|false\|null}, reason?}` | the same + `ok, changed` (`unchanged:true` when nothing differs) · 422 `invalid` (`unknown_feature` / `not_boolean` / `policy`) · 409 `feature_locked` / `conflict` |
| GET | `/api/admin/cc/dev/deploys?limit=` | — | `{account_id, ready, reason, token:{set, source, readable}, pages:{project, ok, error, current_id, items}, workers:[{script, ok, error, current, items}], fetched_at}` — 30 / 10 min; each rollback candidate of Pages / janna-lookup carries `panel` (true · false = older than the panel · null = could not be checked) |
| POST | `/api/admin/cc/dev/deploys/rollback` | `{target: pages\|janna-lookup\|migate-intel, id, confirm:"ارجع", reason?, force?, ack?}` | `{ok, target, id, previous_id, result, pre_panel?, note_ar, note_en}` · 400 `confirm_required` (a string, exactly «ارجع») · 404 `not_found` · 409 `already_current` / `not_production` / `no_token` / `token_unreadable` / `pre_panel` / `secrets_changed` / `ack_required` / `confirm_expired` · 502 `upstream` · 429 `rate_limited` (3 per rolling hour, 10 per rolling day; `retry_s` = the real wait) |
| GET | `/api/admin/cc/dev/health` | — | `{ok, checked_at, ms, checks:[{id, group, label_ar, label_en, url, ok, status, ms, detail}], tables:[{name, rows, ok}], worker}` — 12 / 10 min |
| GET | `/api/admin/cc/dev/audit?limit=&before=` | — | `{items:[{id, at, actor_email, actor_role, action, target_type, target_id, summary, before, after}], next_before}` (dev.* + the `cloudflare.dev_token` key rows) |
**Feature switches** (registry `FEATURES` in src/flags.js — the panel renders it from the API): stored in `cc_settings` k=`features` (scope
`system`, JSON `{v:1, values:{key:bool}, changed:{key:{at,by}}}`, compare-and-swap writes, audit `dev.features` in the same batch; the name and
`dev.*` / `cloudflare.*` are reserved — never a custom setting). A key without a stored value = its default; setting a value equal to the current
one stores nothing. Reader `loadFeatures` (ccBoot, memo per `env.DB`, 30 s; no tables → defaults; a read error → the last good view):
| key | default | scope | enforced |
|---|---|---|---|
| `janna_live` / `bassem_live` | on | both | `POST /api/janna/session` (agent janna / bassem) → 503 `feature_off` (meetings are not affected) |
| `janna_welcome`, `standing_figures`, `intel_pages` | on | client | the site hides the UI (`intel_pages`: links to /intel/ on the site's pages and Bassem's call screen; the /intel/ pages themselves — migate-intel — keep all their links and stay served) |
| `noise_mode_default` | off | client | the site starts live calls in «وضع الدوشة» |
| `registrations` | on | both | `POST /api/auth/verify` for an e-mail without an account → 503 (after the right code, before it is used up); `POST /api/inquiries` kind `signup` → 503 (staff entries still work) |
| `rfq_autoroute` | on | server | no automatic routing (new requests, cron retries, re-match): the request goes to the team (`in_progress`, teamFlow «التوزيع التلقائي مقفول», honest buyer texts); the console's «إعادة الإرسال» still routes |
| `bassem_morning` | on | server | bassemCron skips the morning message («كلّمني الساعة» still works) |
| `daily_digest` | on | server | dailyJobs skips digests + deadline reminders (the item sync and housekeeping run) |
| `whatsapp_send` | on | server | `waLive()` false (reason `feature_off`; `sendWA` re-reads it fresh before every provider call) — LOCKED (cannot be switched on) without a respond.io token / passed token test / with `WA_DRY_RUN=1`; going live stays in «مفاتيح الخدمات» |
| `bassem_web_search` | on | server | `POST /api/advisor/web` → 503 `feature_off` (after the tool-secret check) — LOCKED without a web-search key / tool secret |
Permanent policies (shown, never switches): `visitor_links_signed_in`, `knowledge_team_approved`. Public: `GET /api/settings` →
`features` (scope client / both, effective values) + `features_v`; the overlay does not carry them. The public `feature_off` answer:
`503 {error:"feature_off", code:"feature_off", feature, message}`.
**Deploys**: the Cloudflare API with the owner's token (`cloudflare.dev_token` in «مفاتيح الخدمات», sealed, NO tail kept or shown; `CF_DEV_TOKEN`
wins) — account `88c77c2b7595dd0ce510270175f69143`, Pages project `madeinegyptgate`, Workers `janna-lookup` and `migate-intel` (shapes as used
by wrangler 4.164). Token permissions: Account → Cloudflare Pages: Edit, Workers Scripts: Edit. A rollback re-reads the list (the id must be
one of the last 25, not in force; Pages: a successful production deployment), is audited FIRST (`dev.rollback`, status sending → ok / failed)
and Cloudflare messages are cut and scrubbed of the token. Two steps the owner confirms AGAIN, checked on the server (review 2026-11-19):
(1) a build / version OLDER than the developer panel → 409 `pre_panel` `{panel, changed_features, ack}` before anything is sent: after it
the panel (and its roll-forward) is gone and the switches stop applying — the way forward is then the Cloudflare dashboard. The marker
(src/cf-api.js `panelAware`): a Pages deployment whose own URL serves `/data/flags.js` with `MIGFLAGS`; a janna-lookup version whose
bindings carry the plain-text var `DEV_PANEL` (wrangler.toml — keep it); migate-intel is not concerned; unknown = like older. (2)
Cloudflare's 10220 (secrets changed since that version) → 409 `secrets_changed` `{secrets, ack}`. `ack` = HMAC-signed (secretOf, else
CONFIG_SECRET), 10 minutes, bound to the owner, the target and the id, carrying the steps confirmed so far; `force:true` counts only with an
ack holding the secrets step (else 409 `ack_required`; a stale / foreign ack → 409 `confirm_expired`). The limits are rolling windows counted
from the owner's `dev.rollback` rows (one conditional INSERT, so two requests at once cannot both pass); a 10220 refusal is not counted.
**Health**: key pages on the Pages production URL (`DEV_PAGES_ORIGIN`, default https://madeinegyptgate.pages.dev — a Worker cannot reach its own
zone's front door), this Worker's health / public APIs IN-PROCESS (index.js `CC.self`), `/api/intel/health` + `/intel/` of migate-intel (a
service binding `INTEL` if configured, else `INTEL_ORIGIN`, default its workers.dev URL), D1 `SELECT 1` + `COUNT(*)` of a fixed table list
(read-only; a missing table = `rows:null`, red), the worker version from a `CF_VERSION_METADATA` binding when configured (informative).
wrangler.toml (2026-11-19 review): `[version_metadata] binding = "CF_VERSION_METADATA"` (the health page shows the running version) and
`[vars] DEV_PANEL = "1"` (the panel marker above). Optional, not made: `[[services]] binding = "INTEL", service = "migate-intel"`.
`whatsapp_send` OFF also refuses the owner's test message (`POST /keys/wa-test` → 409 `feature_off`; `wa.can_send_test` false, `wa.feature_off`).
`POST /api/janna/session` with the switch off: 503 `{error:"feature_off", code:"feature_off"}` for pages that send `ff:1` (data/janna-live.js);
older pages (cached, or a Pages rollback) get `code:"daily_cap"`, which they show WITHOUT falling back to Anam's public widget.
Tests: `test/dev-panel.test.mjs` (Cloudflare API, probes and D1 stubbed).

## E-mail center — src/email-center.js (ACC-CONTRACT §6)
Every e-mail goes through `src/email-center.js` (`deliver()`): provider = the Control Center settings when «البريد» is enabled with a key
(the key saved in the panel — AES-GCM with `CONFIG_SECRET`, takes precedence — else `RESEND_API_KEY` / `BREVO_API_KEY`), otherwise
`RESEND_API_KEY` → the `SEND_EMAIL` binding. Sender `noreply@madeinegyptgate.com` «منصة صنع في مصر», Reply-To default
`info@madeinegyptgate.com`. Templates (`TEMPLATES`, keyed by the message id prefix) can be switched off (optional ones) or get
subject/intro/outro overrides; the new templates (invoices, payments, approvals, invites, staff, legacy notice) are fully editable.
`cc_mail_log` keeps one row per attempt (hashed + masked recipient, codes masked, no bodies, 180 days). A new e-mail must use a registered
id prefix or pass `tpl` — `test/email-center.test.mjs` scans `src/*.js` and fails otherwise. SMTP is not possible on Workers. The domain's
DNS (MX/SPF/DKIM/DMARC on Hostinger) is never touched by the Worker. The 0006 seed `mail.enabled = "0"` keeps every e-mail byte-identical to
deploy 1 (RESEND_API_KEY → binding) until the owner opts in from «البريد» — "0" never stops mail (the sign-in codes must always go out).

# Payments — `/api/pay/*` + `/api/admin/cc/pay/*` (src/payments.js, ACC-CONTRACT §5)
Provider-agnostic invoices and checkout: **N-Genius** (Network International), **Paymob** (Accept, Intention API → Unified Checkout),
**PayTabs** (PT2) and **manual** bank transfer / InstaPay. No card data ever touches our pages or API (card fields → 400); the customer
pays on the provider's hosted page. Until a gateway is configured AND in Live mode, every page says «بوابة الدفع لسه بتتجهّز».

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/pay/invoice?t=<pay_token>` | 60/10 min per network | `{invoice{no,status,plan,plan_name,plan_name_en,net_minor,vat_bp,vat_minor,total_minor,currency,company,issued_at,paid_at,test}, gateway{ready,provider_label}, manual{enabled,ar,en}, email_masked, last_attempt, activation, next}` · 404 |
| POST | `/api/pay/checkout` | `{t, lang?}` — 10/hour per invoice | `{redirect_url}` (provider page) · 409 `state` · 503 `gateway_not_ready` · 502 `provider_error` |
| GET/POST | `/api/pay/return/:provider` | provider query / form | always 303 → `pay.html#inv=<t>&r=1` (pay.html polls the invoice) |
| POST | `/api/pay/webhook/:provider` | provider body | 200 `{ok:true}` (also for unknown orders — no oracle) · 401 wrong signature · 400 bad JSON · never 5xx |
| GET | `/api/pay/health` | — | `{ok, ready, provider, mode, manual}` (no secrets) |
| GET/PUT | `/api/admin/cc/pay/config` | pay.read / pay.config (owner) | masked secrets `{set, tail, set_at, readable}` only; `ready`, `missing`, webhook URLs |
| GET/POST | `/api/admin/cc/pay/invoices[.csv]`, `/invoices/:no`, `/invoices/:no/{resend,void,mark-paid,refund}`, `/test-invoice`, `/payments[.csv]` | pay.read · pay.invoice · pay.mark_paid · pay.config | see ACC-CONTRACT §3.3 |

**Invoices:** `INV-<yyyy>-<6 digits>` (Cairo year, gap-free counter in the same D1 transaction); net = plan price × 100 piasters,
VAT `vat_bp` (1400 = 14 %), frozen at issue; owner test invoices are `TEST-<yyyy>-<6 digits>` and never activate a plan. A signup
(`POST /api/inquiries` kind `signup`) gets its invoice at once (index.js wrapper + a cron backstop), e-mailed with the pay link when the
gateway is live, the manual-transfer instructions when they are on, otherwise the honest «لسه بتتجهّز» text.
**Verification:** Paymob = HMAC-SHA512 (`?hmac=`, 20 fields, HMAC secret from Paymob → Settings → Account info); N-Genius = optional
custom header `X-MIG-Webhook` + ALWAYS a server-side `GET …/orders/<ref>`; PayTabs = `Signature` (HMAC-SHA256 of the raw body, server
key) + `POST /payment/query`. Results are idempotent (`cc_pay_events` UNIQUE(provider, event_key)); amount, currency and our reference
must match. **Activation:** open → paid exactly once, then `CC.acc.setPlan` with an absolute expiry (+365 days, extended from the current
expiry for the same plan, a new period for an upgrade; a higher plan in force is never lowered — the team is told) through a ledger row
`activate:<invoice id>` that the cron retries; receipt e-mail `payment_received`, bell, audit `pay.paid`.
**Cron (every 15 min):** activation retries, signup backstop (7 days), re-query of N-Genius / PayTabs payments pending > 10 min (back-off,
expired after 48 h), payment links once when the gateway goes live, renewal invoice + reminder 30 days and a reminder 7 days before expiry.
**Provider set-up (owner, at go-live):** Worker secret `CONFIG_SECRET` first; then in «بوابة الدفع»: Paymob = secret key + public key +
integration IDs + HMAC secret (the notification / redirection URLs travel with every intention); N-Genius = API key + outlet reference
(+ the portal webhook `https://madeinegyptgate.com/api/pay/webhook/ngenius` with custom header `X-MIG-Webhook: <value>`); PayTabs =
profile ID + server key (callback / return travel with every request). Pay one «🧪 فاتورة تجريبية» in Sandbox, then switch to Live.
Tests: `node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/payments.test.mjs`.

# Janna meetings — `/api/meetings/*` («اجتماع تعريفي مع جنة»)

Janna (Anam persona, client tools `janna_start_meeting` / `janna_schedule_meeting`, handled in `data/janna-live.js`) can
hold the introductory meeting **now** inside her live overlay, or **book it** for later on `meeting.html#<id>`.
Code: `src/meetings.js` · tables `meetings` + `meeting_events` in `schema.sql` · tests `test/meetings.test.mjs`.

| Method | Path | Body / query | Answer |
|---|---|---|---|
| GET | `/api/meetings/health` | | `{ok, store, signing, email, anam, media, whatsapp, turnstile, session_cap_min:10}` |
| POST | `/api/meetings` | `{name, email, phone?, company?, activity?, markets?, topic?, language?, date:"YYYY-MM-DD", time:"HH:MM"}` (Egypt time) or `starts_at` ISO **with** offset; optional `recording_consent:true`, `turnstile_token` (required when `TURNSTILE_SECRET` is set) | `{id, url, starts_at, local{date,time}, tz, duration_min, emailed}` — confirmation email (link + `meeting.ics`, organizer «Janna» `meetings@madeinegyptgate.com`, Africa/Cairo, 30 min) + note to `TEAM_EMAIL` |
| POST | `/api/meetings/start` | `{name, email, …, consent:true, session_id?, started_at?, turnstile_token?}` | `{id, status:"live"}` — 400 without `consent:true`, 409 if the session id already belongs to another meeting |
| GET | `/api/meetings/:id` | | public subset only: `{id, kind, first_name, starts_at, status, language, duration_min, tz, local}` |
| GET | `/api/meetings/:id/ics` | | calendar file (no attendee e-mail) |
| POST | `/api/meetings/:id/join` | `{session_id?, consent?}` | `{ok, status:"live", consent}` — scheduled meeting opened on `meeting.html` (15 min before → 90 min after the start). `consent:true` grants, `consent:false` (box unticked) **withdraws** the consent given at booking, absent keeps it; the page shows the `consent` the server answers |
| POST | `/api/meetings/:id/finish` | `{session_id?, ended_at?, agenda_done?[]}` | `{ok, status:"ended", processing, recording}` — idempotent; queues the processing |
| GET | `/api/meetings/:id/recording?exp=&sig=` | | streams `meetings/<id>.mp4` from R2 (Range supported). HMAC-SHA256 with `MEETINGS_SECRET`, valid 30 days |

**Processing** (right after `finish` via `ctx.waitUntil`, then retried by the cron for up to 24 h):
1. `GET https://api.anam.ai/v1/sessions/{id}` — the session must belong to one of Janna's personas (override with
   `ANAM_PERSONA_IDS`) and must have been live when its id was handed to the Worker (`session_at`, server clock: started ≤ 15 min
   before, not ended more than 90 s before; the client's `started_at` is not trusted), otherwise the meeting is marked
   `rejected` and nothing is sent. One session id belongs to one meeting only (unique index; 409 on `/start`, `/join`, `/finish`).
2. Only with recording consent: `GET /v1/sessions/{id}/transcript?offset=&limit=100` (paged; 404 until the session report is
   ready → retry). **Without consent the transcript is never fetched, stored or emailed**: the summary is built from the form
   fields and the agenda ticked in the overlay only, and the email says so.
3. Only with recording consent: `GET /v1/sessions/{id}/recording` → `{recordingUrl}` (presigned, 1 h; 404 until ready, 410 deleted)
   → copied into R2 `meetings/<id>.mp4`. Anam keeps non-ZDR recordings up to 30 days, so the copy is ours.
4. Extractive bilingual summary (visitor's business, markets, plan discussed, questions, agenda covered, next step — only
   what was entered or said; unknown items read «لم يُذكر»). No LLM is called.
5. Email to the visitor: summary + (consent only) signed recording link + `transcript.txt`; copy of the summary to the team.
   **Neither the recording nor the transcript is fetched, stored or emailed without consent.**

**Cron** (`[triggers] crons = ["*/15 * * * *"]`): email reminders 24 h and 1 h before each scheduled meeting (each once;
a meeting booked too late for one is marked `n/a`), WhatsApp reminder via the Cloud API template `meeting_reminder`
(body parameters: first name, date/time in Egypt, meeting link; languages `ar` / `en`) **only** when `WA_TOKEN` +
`WA_PHONE_ID` are set and the visitor gave a phone, `live` meetings without a `finish` after 2 h are closed and processed,
missed meetings (2 h after the start) are marked `missed`, pending processing is retried (backoff 5→60 min, up to 24 h).

**Limits**: 5 bookings per IP and 3 per email per 24 h, at most 3 upcoming meetings per email, 8 instant meetings per IP and
4 per email per 24 h; times must be ≥ 10 min ahead and ≤ 60 days. Email limits count the normalised mailbox (`email_key`:
lower case, `+tag` dropped, Gmail dots folded), so `t+1@x` / `T+2@X` are one address whatever the IP. IPs are stored only
as `SHA-256(MEETINGS_SECRET|IP)`.

**Abuse guards** (the booking endpoint mails any address it is given): names containing a link, domain or e-mail address are
refused (400); the visitor's free text (topic, company, activity…) never appears in the visitor's confirmation email or the
`.ics` (fixed text + first name + our link only); in HTML mail only the platform's own links are clickable and visitor text
sent to the team is defanged (`https[:]//evil[.]example`). Optional **Cloudflare Turnstile**: set the secret
`TURNSTILE_SECRET` and, on the site, `window.MEETINGS_TURNSTILE_SITEKEY` (janna-live.js then renders an interaction-only
widget and sends `turnstile_token` with `POST /api/meetings` and `/start`; 403 `verification required|failed` otherwise).

**Session cap**: on the current Anam plan a live session lasts at most **10 minutes**; the overlay shows the timer and a
«باقي دقيقتين» warning at 8:00. A longer meeting continues in a new session (start Janna again on the same page).

## Deploy (once)
```bash
cd worker
# 1) tables (same D1 as the advisor; safe to re-run)
npx wrangler d1 execute madeinegyptgate-advisor --remote --file=./schema.sql
#    a meetings table created before the security fixes also needs (once):
#    npx wrangler d1 execute madeinegyptgate-advisor --remote --file=./migrations/0003_meetings_security.sql
# 2) R2 bucket for recordings + transcripts → then uncomment the [[r2_buckets]] block (binding MEDIA) in wrangler.toml
npx wrangler r2 bucket create madeinegyptgate-media
#    recommended: auto-delete after 35 days (links are valid 30 days)
npx wrangler r2 bucket lifecycle add madeinegyptgate-media meetings-35d meetings/ --expire-days 35
# 3) secrets
npx wrangler secret put MEETINGS_SECRET   # required: long random string (openssl rand -hex 32)
npx wrangler secret put ANAM_API_KEY      # Anam Lab → API keys (Restricted: Sessions = Read is enough)
npx wrangler secret put RESEND_API_KEY    # or the SEND_EMAIL binding (then attachments are inlined as text)
npx wrangler secret put WA_TOKEN          # optional: WhatsApp Cloud API token (+ var WA_PHONE_ID in wrangler.toml)
npx wrangler secret put TURNSTILE_SECRET  # optional: Turnstile on booking/start (+ window.MEETINGS_TURNSTILE_SITEKEY on the site)
# 4) vars in wrangler.toml: TEAM_EMAIL (default info@madeinegyptgate.com); the sender is MAIL_FROM (MEETINGS_FROM may override
#    the address; its domain must be verified with the email provider), optional WA_PHONE_ID / WA_TEMPLATE / WA_API_VERSION / ANAM_PERSONA_IDS
npx wrangler deploy                       # also registers the cron trigger + the /api/meetings* routes
curl https://madeinegyptgate.com/api/meetings/health
```
Anam Lab: in Janna's personas keep recording + transcripts on (not zero-data-retention), add the client tools
`janna_start_meeting {name, email, phone?, company?, activity?, markets?, language?, recording_consent:boolean}` and
`janna_schedule_meeting {name, email, phone?, company?, date, time, topic?, language?}` (date/time in Egypt time), and tell
Janna to ask for recording consent before starting. WhatsApp: create and get approval for the template `meeting_reminder`
(3 body variables) in Meta Business Manager before setting `WA_TOKEN`.

| Env | Kind | Purpose |
|---|---|---|
| `MEETINGS_SECRET` | secret, required | signs recording links, salts IP hashes |
| `ANAM_API_KEY` | secret | session check, transcript, recording URL |
| `RESEND_API_KEY` | secret | emails with `.ics` / transcript attachments (fallback: `SEND_EMAIL` binding) |
| `TEAM_EMAIL` | var | booking + summary copies (default `info@madeinegyptgate.com`) |
| `MEETINGS_FROM` | var | sender / calendar organizer (default `meetings@madeinegyptgate.com`) |
| `WA_TOKEN`, `WA_PHONE_ID` | secret, var | optional WhatsApp reminders (`WA_TEMPLATE`, `WA_API_VERSION` default `v21.0`) |
| `MEDIA` | R2 binding | recordings + transcripts (`meetings/<id>.*`) |
| `TURNSTILE_SECRET` | secret, optional | Turnstile check on `POST /api/meetings` and `/start` (site key: `window.MEETINGS_TURNSTILE_SITEKEY`) |

Tests: `npm test` runs `test/meetings.test.mjs` (schedule validation, `.ics` content, start/finish with mocked Anam + R2 +
Resend, signed recording link, cron reminder selection, consent and persona checks; security: no transcript without consent,
consent withdrawal on `/join`, links in names refused / topic kept out of the visitor mail + `.ics`, normalised-email limits,
Turnstile, one session per meeting, session time window on the server clock) together with the advisor tests.
References: Anam API — [get session recording](https://anam.ai/docs/api-reference/sessions/get-session-recording),
[get session transcript](https://anam.ai/docs/api-reference/sessions/get-session-transcript),
[get session](https://anam.ai/docs/api-reference/sessions/get-session), [widget events](https://anam.ai/docs/embed/widget/events);
Resend attachments (`attachments[{filename, content(base64), content_type}]`); Cloudflare R2 `get(key, {range: headers})`,
Cron Triggers; WhatsApp Cloud API `POST /{phone-number-id}/messages` with `type:"template"`.
