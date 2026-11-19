The backend is built and wired into `src/index.js`. Requests are now matched to registered member factories and sent to them automatically, and their replies go back to the buyer automatically, with no human step. `npm test` passes 81 of 81: the 58 existing tests plus 23 new ones in `test/platform.test.mjs`. `npx wrangler deploy --dry-run` succeeds (2.84 MB, gzip 302 KB) and nothing was deployed. The existing `node test/integration.mjs` passes on the real Workers runtime. A smoke run of the new endpoints there also worked: health, a request that found no match, tracking by last4, `/api/ev`, a 401 on `/api/me`, and the cron.

The biggest open item is the respond.io send format. I could not confirm it from respond.io's own docs and never sent a real message (details at the end).

I found no leftover edits from the earlier aborted run in `worker/`. I did not touch `site.py`, `janna.js`, `holo.js` or `captions.js`.

## Endpoints (the full contract, plus a few extras)
- **Login:** `POST /api/auth/request`, `/api/auth/verify`, `/api/auth/logout`, and `GET /api/auth/health`.
  - The 6-digit code is stored only as a keyed hash. It expires in 10 minutes, works once, and 5 wrong tries burn it.
  - Limits: 5 codes per address per hour, 20 per IP per hour, 30 verify attempts per IP per 10 minutes. Turnstile is used when `TURNSTILE_SECRET` is set.
  - Tokens look like `v2.<member>.<session>.<exp>.<sig>`, last 30 days, and logout revokes them.
  - A partner/strategic token from this login also works for Bassem (`/api/advisor/*`). A basic token gets **403 `{code:"plan"}`** there.
- **Account (`/api/me`):** GET and PATCH. PATCH accepts name, title, company, phone (stored as +20…), sector, governorate and products.
  - Also: `/api/me/inquiries`, `/api/me/follows` (GET/POST/DELETE), `/api/me/notifications` and `/api/me/notifications/read`, and `/api/me/prefs`.
  - `/api/me/stats` (basic and up) returns `since`, the metrics, `enough` and `threshold` (20).
  - `/api/me/incoming` (basic and up) never includes the buyer's email or phone.
  - `/api/me/incoming/:ref/quote` and `/api/me/incoming/:ref/decline`.
- **Requests:** `POST /api/inquiries` returns 201 `{ok, ref, status, routed}`, where `routed` is the true number of factories it reached.
  - `GET /api/inquiries/:ref` accepts `?last4=`, `?t=` from the signed track link, or the owner's token. Add `&lang=en` for English.
  - Unknown ref and wrong proof both return 404, and failures are rate-limited. Also `GET /api/inquiries/health`.
- **Metrics:** `POST /api/ev` returns 204. It counts one view per visitor per day, ignores bots, and stores only keyed hashes, never raw IPs.
- **Unsubscribe:** `GET`/`POST /api/unsub`. GET shows a confirm page and POST applies it; one-click unsubscribe also works.
- **Bassem:** `POST /api/advisor/notify` (partner/strategic) returns `{ok, sent:{email,whatsapp}}` and only reports a channel as sent when it really was.
- **Admin (monitoring only):** `GET /api/admin/inquiries`, `GET /api/admin/inquiries/:id_or_ref`, `POST .../resend`, `POST /api/admin/block`.
  - Extras: `GET`/`POST /api/admin/members` sets plans and the matching profile; it also accepts `X-Platform-Key`, and `tools/set-plan.mjs` uses it. `GET /api/admin/wa?flag=mood` shows the WhatsApp log.
- **WhatsApp webhook:** `POST /api/wa/inbound?secret=…` and `GET /api/wa/health`.

## How matching and delivery work
- **Who can receive:** only registered members on basic or higher whose plan was set by the platform, not expired, with an email, and not paused or unsubscribed from incoming requests. Directory factories that are not members are never contacted.
- **Scoring:** sector plus product keywords, with Arabic normalisation and a filter for generic words like «صناعات». Same governorate is a bonus.
  - The member who owns the targeted factory profile always matches.
  - The request's market must be inside the member's plan scope: basic is Egypt; premium adds Gulf/Arab; partner adds Africa; strategic is all.
  - Premium and higher are ranked first, up to 10 factories.
- **Delivery:** email with `Reply-To: inq-<ref>-<route>@reply…`, plus WhatsApp if the member opted in. The buyer is told the real count.
- **No match:** the buyer is told honestly and the request stays open for 30 days. It goes out automatically when a matching member is activated or changes their sector or products.
- **Replies:** a factory can reply by email or with the quote form, and the buyer gets it automatically. The buyer's own reply goes to `inq-<ref>-b<route>@`, so it reaches that one factory only.
  - Strangers writing to `inq-<ref>@` are rejected unless they are the buyer or a routed member.
- **Kinds that are not sent to factories** (entity contact, signup, opportunity offers and interests, profile fixes) are saved with an honest status of `recorded`.
- **Cron:**
  - **Every 15 minutes:** retries failed sends up to 5 times, sends one reminder to factories that haven't answered after 48 hours, and closes requests after 30 days with a final email.
  - **Daily after 07:00 Cairo:** follow digests from items that are genuinely new, and deadline reminders 7 days and 1 day before.
  - **Bassem:** sends the WhatsApp at each member's own time (default 09:00 Cairo, every day), then sends the call-ready message at the time the member chose.
- **Receipts** never promise a human reply; they say what happens automatically.

## Tables
`migrations/0004_interactive_platform.sql` is for the existing database; `schema.sql` has everything for a new one.
- `members` gains: name, title, phone, role, plan_expires, activated_at, prefs_json, sector, governorate, products, factory_ref, inbox_paused, email_verified_at, last_seen_at, wa_last_in_at, morning_sent_day, call_sent_day, digest_sent_day.
- New tables: auth_codes, auth_sessions, rl (rate limits), blocks, inquiries, inquiry_events, inquiry_routes, quotes, follows, seen_items, notifications, ev_daily, ev_seen, unsubscribes, wa_messages, cron_runs.

## Other changes
- **Shared code:** new `src/common.js` and `src/text.js`; the lookup's text normalisation moved into `text.js` and the lookup still works.
- **`advisor.js`:**
  - Accepts the new login tokens.
  - Gives a 403 for plans without Bassem and respects plan expiry.
  - Adds `/notify`.
  - Returns `activated_at` from `memberOut` (backlog item 14).
  - Re-runs matching after activation.
- **Inbound email:** the `email()` handler now sends `inq-…` addresses to the request engine and everything else to the advisor.
- **`build-index.js` and `src/data.json`:** rebuilt with a new list of 834 dated items: tenders (including international ones with their market), RFQs, news, events, awards and offers. `projects.js` and `deals.js` are left out because they are sample data. The existing lookup counts are unchanged.
- **`wrangler.toml`:** routes for `/api/auth/*`, `/api/me`, `/api/me/*`, `/api/inquiries*`, `/api/admin/*`, `/api/ev`, `/api/unsub*`, `/api/wa/*`, plus `ADMIN_EMAILS` and `RESPONDIO_CHANNEL_ID`.
- **`README.md`:** new "Platform API" section with endpoints, routing, plans, security, respond.io, and deploy steps for all the secrets and vars.

## For the frontend agents
- **Plan values:** `user.plan` is one of `visitor | profile | basic | premium | partner | strategic` — the same keys as `data/plan.js`, with `data` accepted as `profile`. `user.markets` is the geographic scope and `user.role` is `admin | member | visitor`.
- **Request statuses:** received, routed, no_match, replied, recorded, closed, blocked.
- **Track link:** the receipt email links to `track.html#<REF>~<t>`. The page should call `GET /api/inquiries/<REF>?t=<t>`, or ask for the last 4 digits of the phone.
- **Item ids for follows and `MIG_CTX`:**
  - Tenders: `REAL.tenders[].id` (e.g. `eg-tnd-003`), or the ref for international and old tenders.
  - RFQs: the RFQ number.
  - Events and offers: their `id`.
  - Factory profiles: `factory_ref` / `ev ref` is the `company.html#` hash, e.g. `12` or `x3`.

## Not verified
- **respond.io sending:** I took the request format from a third-party copy of respond.io's API reference: `POST /v2/contact/phone:+20…/message`, sending `channelId` and a text or `whatsapp_template` message in `ar_EG`, and getting back a `messageId`.
  - The "create the contact if missing" call is a guess.
  - It all sits in one function, `sendWA`, marked TODO-VERIFY.
  - No real message was sent. Test once with the owner's own number, or start with `WA_DRY_RUN=1`.
- **respond.io templates:** I confirmed channel 580384 and the three templates with read-only calls, but all three are still **"submitted"**, not approved by Meta. Template sends will fail until they are approved.
- **Inbound webhook payload:** the parser is lenient but not checked against a real respond.io webhook body.
- **Sender verification on factory replies** stays off until `INBOUND_AUTHSERV_ID` is set, same as the advisor today.
- **Not built:**
  - The WhatsApp login code (planned for later).
  - Listing Janna meeting leads in the admin console.
  - The signup kind only records the application and promises that the payment link will be emailed once N-Genius is live.

Files are in /home/user/madeinegyptgate/worker:
- src/auth.js
- src/me.js
- src/inquiries.js
- src/matching.js
- src/admin.js
- src/whatsapp.js
- src/digest.js
- src/ev.js
- src/common.js
- src/text.js
- src/index.js
- src/advisor.js
- schema.sql
- migrations/0004_interactive_platform.sql
- test/platform.test.mjs
- build-index.js
- src/data.json
- wrangler.toml
- README.md
- tools/set-plan.mjs