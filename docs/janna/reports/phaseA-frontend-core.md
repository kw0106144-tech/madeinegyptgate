The frontend core is built: shared client, sign-in, header bell and account chip, follow buttons, dashboard, track page, admin monitor, plus plan, Bassem and advisor rewired to the server. Everything passed in Playwright against a mocked API (online and offline, AR/EN, 1366×800 and 390×844) with no page errors. No real backend was exercised: the Worker in `worker/src` does not have these endpoints yet. `python3 site.py` rebuilt fine (rc=0). On the real site at :8780, dashboard and track pages load the client and show the honest offline message; other pages won't have the client until the two site.py lines below are added.

## Lines the integrator must add to `/home/user/madeinegyptgate/site.py`
1. In `page()` (around line 248), right after `<script src="data/plan.js"></script>`:
   ```
   '<script src="data/plan.js"></script><script src="data/mig-api.js"></script>'
   ```
   This puts the client in every page head. Loading it twice is harmless; dashboard and track already load it themselves.
2. Right after the `meeting.part.py` exec line (line 38):
   ```
   exec(open(B + 'inbox.part.py', encoding='utf-8').read())  # inbox.html: admin requests monitor (noindex, not in sitemap)
   ```
   It must come after `seo.part.py`, because it wraps `seo_head`/`seo_files` the same way `meeting.part.py` does.

## What I built
- **`data/mig-api.js`** (new) — `window.MIGAPI` per the fixed contract.
  - **Sign-in:** an accessible 6-digit e-mail code dialog (no passwords, 60 s resend, PDPL privacy note).
  - **Header:** a bell with unread count (polls on focus and every 60 s) and an account chip with menu, injected into `.site-hdr .hdr-acts`. Signed out, the «دخول المصانع» link opens the dialog; on phones a 👤 icon appears instead.
  - **Follow buttons:** ☆ buttons attach under the page h1 when `window.MIG_CTX` is set, or to any `[data-follow-kind][data-follow-id]` element. If signed out, the click asks for sign-in first.
  - **Beacons:** a page view for `MIG_CTX`, and clicks on wa.me or external links; `[data-ev-kind][data-ev-ref]` overrides which item is counted.
  - **Migration:** a one-time prompt after the first server sign-in imports old `mig-fav` items as follows and fills the company name from `mig-accts`.
  - **Honesty:** `inquiry()` resolves only when the server returns a `ref`, and no success message appears without a server answer. With no API, every call rejects with `{code:"offline"}` and the UI shows «الخدمة دي هتشتغل أول ما المنصة تتربط بالسيرفر».
  - **Shared UI:** status chips, the inquiry timeline and date formatting live in `MIGAPI.ui`, used by the dashboard, track and admin pages.
- **`data/plan.js`** — rewritten to your plan rules.
  - Every plan sees tenders, RFQs, awards, projects, opportunities and supplier/contractor data. Scope differs only by geography:
    - data-only and basic: Egypt
    - premium: + Gulf/Arab
    - partner: + Africa
    - strategic: + Asia and Europe
  - Basic and up can respond, receive routed inquiries and see stats; premium gets priority; partner/strategic get Bassem.
  - The plan comes only from the cached `/api/me` answer, and `MIGPLAN.update()` replaces it when the server replies. A gated page redirects if the server's plan is lower.
  - The old `mig-plan` key is ignored, except for a Worker-issued advisor activation session. `MIGPLAN.set()` now does nothing.
  - The «معاينة كـ» plan-preview switcher is shown to admins only. New helpers: `scope()`, `scopeText()`, `scopeLockHTML(market)`, `name()`.
- **`data/bassem.js`**
  - He appears only after `/api/me` confirms partner/strategic, or for a Worker activation session; the `egy-demo` and `mig-accts` paths are gone.
  - He greets by title and first name («دكتور أحمد» / "Dr. Ahmed") and counts the 365 days from `user.activated_at`.
  - Backlog item 12: a once-a-day «إزي حضرتك؟» with the «الحمد لله تمام» / «مش أحسن حاجة النهارده» replies.
  - He reacts to `mig:me` and `mig:logout`. While the plan is unconfirmed, Janna is held back to avoid a flash, but Bassem stays hidden.
- **`advisor.part.py`** — platform mode: it waits for `/api/me`; a server-confirmed partner/strategic plan uses the platform token for `/api/advisor/*`, and any other plan gets the lock box. The activation-link flow is unchanged, and an «ادخل بكود على بريدك» button was added.
- **`dash.part.html`** — fully rewritten; every fabricated KPI, PO, RFQ, invoice, badge, the `egy-demo` backdoor and the password gate are gone, with no demo kept.
  - **Tabs:**
    - نظرة عامة: real counts, plus an onboarding checklist computed from the account
    - طلباتي: with timelines
    - متابعاتي
    - الإشعارات
    - الفرص في نطاقك: the five markets shown ✓ or 🔒
    - طلبات واردة لي (basic and up): quote form (price, currency, MOQ, lead time, validity, note) and decline
    - إحصائياتي (basic and up): «منذ» date, or «بيانات غير كافية»
    - بياناتي: «اللقب» select plus a free-text option
    - الواتساب والإيميل: 09:00 default, days, pause, and a Bassem session time for partner/strategic
    - باقتي: no invoices until N-Genius is live
  - Old hashes such as `#tenders` and `#myrfq` map to the new tabs.
- **Track page** — the block in `pages.part.py` that builds `track.html` (only that block was replaced).
  - It is a ref + last-4 form that renders only what `GET /api/inquiries/:ref?last4=` returns. A signed-in owner can open their request without last-4, and `track.html#REF` pre-fills the number.
  - RFQ-88412, the auto-submit, "7 factories / 3 offers" and the WhatsApp promise are removed.
- **`inbox.part.py`** (new, builds `inbox.html`) — an admin-only monitoring console, Arabic first, noindex and kept out of the sitemap.
  - Status filter chips with counts taken only from the returned list, plus search.
  - Opening a request shows its details, the automatic routing table (factory, plan, e-mail/WhatsApp delivery, quote) and the full timeline, with internal events marked.
  - Actions are resend and block (by e-mail or hashed IP). Nothing on the page needs a person to act.

## Things the backend and other agents need to know
- **Backend:**
  - Unauthenticated `GET /api/me` must answer 401 JSON; the pages use that to tell "connected" from "offline".
  - `GET /api/inquiries/:ref` with the owner's Bearer token should work without last-4.
  - `/api/advisor/*` must accept the platform token.
  - The UI reads these optional fields: incoming items `{my_status, payload{quantity, governorate, deadline}, buyer{type, company, governorate}, items[], quote}`; admin detail `{inquiry, events[buyer_visible, actor], routes[{company, plan, email_status, wa_status, status, score, quote}]}`; list `routed_count`.
- **Other agents:**
  - `register.part.py` calls `MIGPLAN.set(plan)`, which no longer stores anything.
  - The site.py GATES pages (entity, winner, project, radar) now need any plan (level 1). Visitors are still sent to register; data-only and up now get in.
  - Pages should set `window.MIG_CTX`, and dispatch `mig:ctx` after hash routes change it.
  - Janna should submit through `MIGAPI.inquiry()` and follow through `MIGAPI.follow()`.

Test screenshots are in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/phaseA/core/`; the test scripts and API mock are in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/pw/`.

Files are in `/home/user/madeinegyptgate/`:
- data/mig-api.js
- data/plan.js
- data/bassem.js
- advisor.part.py
- dash.part.html
- pages.part.py
- inbox.part.py