# خطة تحويل المنصة لمنصة تفاعلية (من ورك فلو التصميم)

MERGED PLAN: MAKE MADE IN EGYPT GATE AN INTERACTIVE PLATFORM (read-only; no files changed)

Facts I re-checked in the code:
- In worker/wrangler.toml, both `[[d1_databases]]` and `[[r2_buckets]]` are commented out. The cron `*/15` exists.
- worker/schema.sql has 8 tables: members, deals, messages, logins, contacts, events, meetings, meeting_events.
- sessionStorage `mig-rfq-to` is written in company.part.py:71 and winner.part.py:49 and is never read anywhere.

== 0. HOW THE THREE DESIGNS SCORE (1–5 each; for effort, 5 means least effort) ==

| Design | Impact | Feasibility | Honesty | Janna/Bassem fit | Effort | Total |
|---|---|---|---|---|---|---|
| Marketplace-first | 5 | 4 | 5 | 3 | 3 | 20 |
| AI-concierge-first | 4 | 4 | 5 | 5 | 4 | 22 |
| Member-engagement-first | 3.5 | 4 | 5 | 4 | 3 | 19.5 |

Marketplace-first
- The only design that closes the buyer→factory loop before factories have accounts. It does this with an admin inbox plus email-thread replies (`inq-<ref>@reply…`), reusing advisor.js inbound mail.
- Janna is mostly an afterthought in it.

AI-concierge-first
- Strongest principle: every AI action is also a button, both call the same API, and the AI only says "sent" or "saved" after the API returns a real id.
- `window.MIG_CTX` page context is cheap and high-value.
- Weakness: it treats accounts and engagement loops as Phase B.

Member-engagement-first
- Best on retention: one login for all plans, a follows tab («متابعاتي»), notifications, and honest-metric rules (a start date and a minimum count).
- It helps paying members more than anonymous buyers, and its inquiries come late (B2).

Merged backbone
- The inquiry loop and admin inbox come from Marketplace-first.
- From Member-engagement-first: email-code login for everyone, follows, alerts, the notification bell, the honest-stats rules and the onboarding checklist.
- From AI-concierge-first: `MIG_CTX`, the "AI = same API as the button" rule, Janna meetings as the universal fallback, and Bassem's convert-to-deal and daily brief.

== 1. DIAGNOSIS: WHY IT FEELS LIKE A DISPLAY SITE TODAY ==

1. Nothing a visitor does reaches anyone.
   - About 15 "actions" end in a «(مثال)» message, a toast or localStorage: contact, RFQ, market basket, opportunity offer, project/lead interest, entity contact, save/follow, radar alert, and dashboard saves.
   - The only real server flows are Janna meetings, Bassem deals and the Janna lookup.
   - Even those are not live: the Worker is not deployed and D1/R2 are not bound, so `/api/*/health` returns 404.

2. There are no real accounts.
   - Registration, login, plan and Bassem eligibility all live in the browser (`mig-accts`, `mig-auth`, `mig-plan`). Anyone can set `mig-plan=partner`.
   - There is no cross-device identity, so nothing can "remember" a user, notify them or personalise for them.

3. The site shows invented activity in place of real activity, which breaks the owner's rule:
   - track.html says "sent to 7 factories, 3 offers" for any number.
   - The dashboard shows 3,290 visits, 146 WhatsApp clicks, fake POs and fake incoming RFQs.
   - The basket shows a fake PO number.
   - The admin `SUBS` list gives real factory names invented plans; `PAY` and `APPR` are invented too.
   - RFQ numbers come from `Math.random`.
   - Janna says «الطلب اتبعت» when nothing was sent.
   - The home price ticker drifts randomly when it has no data.

4. There is no return loop.
   - No follow, saved search, alert, notification, digest or deadline reminder exists. The cron only handles meetings.
   - Nothing changes for a user between visits, so there is no reason to come back.

5. The AI characters can talk but cannot act on the platform.
   - Janna only reads H1–H3 headings, so she doesn't know which factory or tender is on screen.
   - Her submit tool posts to fake forms.
   - Bassem's pipeline is disconnected from platform inquiries and runs in demo mode.

== 2. THE INTERACTIVE STRUCTURE (core building blocks) ==

1. **Real accounts and auth.** One email-code login for every plan (data/basic/premium/partner/strategic), plus admin and visitor roles.
   - Extend advisor.js's `members`, `logins` and HMAC token; add `/api/me`.
   - The server is the only source of plan truth; localStorage is a cache only.

2. **Inquiries and messaging.** One `/api/inquiries` engine behind every "request quote / contact / interest / offer" button and behind Janna.
   - Every inquiry gets a real ref and a status timeline.
   - Factory replies arrive by email thread and are routed by the platform team. Factory personal numbers are never used.

3. **RFQ → quotes → deal pipeline.** inquiry → routed → forwarded to N factories → reply/quote → closed.
   - Later: structured quotes in the factory inbox.
   - For Core/Strategic members: "convert to deal" into Bassem's existing deals pipeline.

4. **Follow / save / alerts.** A ☆ button on factories, tenders, RFQs, projects, agencies, sectors, governorates and offer stores.
   - The cron sends "new matching item" digests and tender-deadline reminders, computed from real data snapshots only.

5. **Notifications center.** An in-app bell (polling) fed by real events: inquiry status changes, replies, alerts, meeting reminders, Bassem deal replies. The same events go by email now and by respond.io WhatsApp later.

6. **Personalised home and dashboard.** The dashboard overview shows my inquiries, my follows, what is new since my last visit, and an onboarding checklist computed from real account state.
   - Later, a «لك اليوم» feed on the home page that explains "why you see this".

7. **Activity from real events only.** A first-party event beacon (views, WhatsApp/website clicks, inquiries) aggregated daily.
   - Every number shows «منذ <date>» and a minimum threshold, otherwise «لا توجد بيانات بعد».
   - Never a public "X viewing now".

8. **Janna and Bassem as the action layer.** Pages expose `MIG_CTX` (type, id, title).
   - Janna can submit an inquiry, follow, track and book a meeting, using the same APIs as the buttons. She falls back to a Janna meeting or WhatsApp when the API fails.
   - Bassem (Core/Strategic, checked on the server) turns inquiries into deals and sends a cron daily brief.

== 3. PHASE A — BUILD NEXT (about 1–2 weeks of agent work) ==

A0. Deploy and make honest (S; blocks everything else)
- Deployment:
  - Create D1 and R2, uncomment the bindings, apply schema.sql plus migrations 0002/0003.
  - Set ADVISOR_SECRET, PLATFORM_KEY, MEETINGS_SECRET, RESEND_API_KEY and TEAM_EMAIL.
  - Add wrangler routes for the new prefixes (`/api/auth/*`, `/api/me/*`, `/api/inquiries*`, `/api/admin/*`, `/api/ev`).
  - Configure Email Routing for `*@reply.madeinegyptgate.com`.
- Honesty pass:
  - track.html: remove the auto-submit of RFQ-88412 and the fake "7 factories / 3 offers" stage.
  - dash.part.html: remove the fake KPIs (l.275, 319, 327–333), POs, myrfq entries, the INV-2026-10231 invoice and the nav badges.
  - market.part.html:536/548: remove the PO number and the WhatsApp promise.
  - All «(مثال)» confirmations and false toasts (opportunity, project, radar, entity, dashboard alerts) are replaced by the real feature below or by honest "coming soon".
  - Janna: the «الطلب اتبعت» / «✅ اتبعت» lines (janna.js L167, janna-live.js ~L224) are said only after a 2xx response that returns a ref.
  - home2.part.html:850: remove the random price drift.
  - pages.part.py:169: remove the invented "today-6" publish date.
  - register.part.py: remove the card number, expiry and CVV inputs now. The final step becomes "submit application → team contacts you to pay / book a meeting with Janna".
  - Hide the admin SUBS/PAY/APPR lists and the UAE leftovers.
  - Show projects.js (header "Saudi… SAMPLE DATA") with a visible «بيانات توضيحية» label, or hide it, until its sources are verified (owner decision 4).
- Acceptance:
  - The generated site contains no «(مثال)» success message and no hard-coded KPI.
  - track.html never shows a status it did not get from the API.
  - No card or CVV input exists anywhere.
  - All `/api/*/health` endpoints return 200 with `store:"d1"`.

A1. One login for everyone (M)
- Worker:
  - `POST /api/auth/code`, `POST /api/auth/verify`, `GET /api/me`, `POST /api/auth/logout`.
  - Reuse the advisor `logins` and HMAC token code and the Resend sender.
  - D1 migration 0004 extends `members` with: role (visitor|member|admin), plan (none|data|basic|premium|partner|strategic), plan_expires_at, phone, factory_ref, last_seen_at.
  - Plans are set by admin with tools/activate.mjs or an admin endpoint until N-Genius is live.
- Pages:
  - New shared `data/mig-api.js`: login modal, token storage, `/api/me` cache. It reuses existing modal and button styles; no visual redesign.
  - dash.part.html login gate (l.174–200) moves to the server; remove the `egy-demo` backdoor or turn it into a clearly-bannered demo.
  - data/plan.js and data/bassem.js read the plan from `/api/me`.
  - advisor.part.py works in platform mode.
- Acceptance:
  - A login on phone A is recognised on laptop B.
  - Setting `mig-plan=partner` in devtools does not unlock Bassem; `/api/advisor/*` returns 403 for a basic plan.
  - Codes expire and are rate-limited.

A2. Inquiry engine (M)
- Worker:
  - `POST /api/inquiries`, with Turnstile and the IP/email rate limits from meetings.js.
  - The ref is non-guessable, e.g. `MIG-26-7KQ4P`.
  - Kinds: contact, rfq, basket, opp_offer, lead_interest, project_interest, entity_contact, signup, profile_fix.
  - Resend sends a receipt to the buyer (ref plus a track link) and a notice to TEAM_EMAIL.
- Tables:
  - `inquiries`: id, ref, kind, target_type, target_id, target_name, user_id, name, company, email, phone, consent_wa, payload_json, items_json, status, source (form|janna|basket), created_at, updated_at.
  - `inquiry_events`: id, inquiry_id, type (received|routed|forwarded|reply|quote|status|note), actor, body, meta_json, buyer_visible, created_at.
- Pages (each form is pre-filled from `MIG_CTX`):
  - pages.part.py: contact `#msgF` and `#rfq-form` (l.448–449), opportunity offer (l.168).
  - company.part.py:71 and winner.part.py:49: the RFQ carries the target factory; this fixes the dead `mig-rfq-to`.
  - factory-profile.html:679–695: log the inquiry first, then open the platform WhatsApp.
  - market.part.html: the basket sends `items_json`.
  - projects.part.py:67 and leads2.part.py: lead/project interest.
  - registry.part.py:133: entity contact.
  - register.part.py: the application becomes kind=signup.
- Acceptance:
  - Each of these forms creates a D1 row.
  - The buyer receives an email with the ref within 1 minute, and the team receives one too.
  - The UI shows the real ref.
  - The 6th submit from one IP within 10 minutes is rejected.
  - No factory phone number appears in any page or outgoing message.

A3. Real tracking (S)
- `GET /api/inquiries/:ref?last4=<phone last 4>` returns only buyer-visible events. The track.html timeline is rendered from them.
- Logged-in users also get `GET /api/me/inquiries` and a "طلباتي" tab in the dashboard.
- Acceptance:
  - A wrong last4 or an unknown ref returns "not found".
  - A new request shows only "تم الاستلام".
  - The status changes only when an admin or a real reply moves it.

A4. Admin inbox and the email reply loop (M)
- Worker:
  - `/api/admin/inquiries`: list/filter, GET :id, PATCH status, POST :id/forward {factory_email}, POST :id/note. Requires role=admin.
  - The email handler is extended: mail to `inq-<ref>@reply…` is parsed (postal-mime plus DMARC check, as advisor.js does) and stored as a reply/quote event. The buyer is emailed and notified, and the status moves to "وصل رد".
  - Janna meeting leads are also listed in the inbox.
- Pages: a new minimal admin inbox page. The admin.part.py build stays disabled; its fabricated SUBS/PAY/APPR lists are dropped.
- Acceptance:
  - An admin forwards an inquiry to a factory email.
  - The factory's reply appears in the thread, the buyer receives it, and track.html shows "تم إرسال الطلب إلى 1 مصنع" with the real count.
  - Non-admin tokens get 403.

A5. Follow / save and alerts (M)
- Worker:
  - `GET/POST/DELETE /api/me/follows`. Anonymous users are prompted to log in by email code first; nothing is faked.
  - Cron, gated to run once a day (about 07:00 Cairo time):
    - a digest of new items matching follows
    - tender/RFQ deadline reminders 7 days and 1 day before closing, for followed items
- Data: worker/build-index.js is extended so the data.json snapshot includes tenders, RFQs, projects, news, offers and events, each with id, date, sector and governorate.
- Tables:
  - `follows(user_id, kind, ref_id, label, created_at, UNIQUE(user_id, kind, ref_id))`
  - `seen_items(kind, item_id, first_seen_at)`, so "new" means "first appeared in a real rebuild"
- Pages:
  - A ☆ button on: company, factories cards, tenders/rfqs modal (oldlists.part.py), opportunity, project(s), entity/agencies, radar, offers, region/city.
  - A dashboard tab «متابعاتي».
  - A one-time import of `mig-fav`.
- Acceptance:
  - A follow made on one device shows on another.
  - The digest lists only items whose ids were not seen before.
  - Every alert links to the real item and its source.
  - Every email has an unsubscribe link that works.

A6. Notifications bell (S)
- Table: `notifications(id, user_id, kind, title, url, ref, created_at, read_at)`.
- Writers: inquiry events, reply received, follow digest items, deadline reminders, meeting reminders, advisor inbound replies.
- Endpoints: `GET /api/me/notifications`, `POST …/read`. The bell polls on focus and every 60 s.
- Acceptance: the unread count equals the D1 rows; nothing is seeded.

A7. Janna as the action layer (S–M)
- site.py injects `window.MIG_CTX` per page (factory, tender, rfq, project, offer, entity, region; plus id and title). readPage() uses it.
- Janna's tools:
  - `janna_submit_form` posts to `/api/inquiries` and reads back the ref.
  - New tools: `janna_follow`, `janna_track` and `janna_my_updates`; the last one uses real counts only.
  - The local engine calls `/api/janna/lookup` for related records.
  - On any API failure she offers `janna_book_meeting` or the platform WhatsApp, and never claims success.
- Acceptance:
  - With the Worker down, Janna never says "sent".
  - On company.html#N she offers an RFQ addressed to that factory by name.
  - Every Janna action can also be done with a button.

A8. Honest metrics: start collecting now (S)
- `POST /api/ev` records view, wa_click, web_click and inquiry by kind and ref.
- Deduplication uses a daily hash of IP+day+ref; raw IPs are never stored. Bots are filtered.
- Table: `ev_daily(day, kind, ref_id, metric, n)`.
- The dashboard stats tab shows numbers only with «منذ <date>», and «بيانات غير كافية» below the threshold.
- The onboarding checklist replaces the fake «اكتمال 64%» and is computed from: email verified, sector/governorate set, logo, 3 follows, first inquiry, Janna meeting booked.
- Collecting starts on deploy day so that Phase B has real history.

Phase A exit test: run every visitor journey from the audit (buyer RFQ, factory join, basic member, admin) end-to-end on mobile. Each one must end with a real D1 row, a real email and a real ref, or with an honest "not available yet". Extend the worker tests (test/*.mjs) for auth, inquiries, follows, the admin role and inbound email.

== 4. PHASE B AND PHASE C ==

PHASE B (needs N-Genius, respond.io templates and R2 documents)

- **B1. Payments.** N-Genius hosted checkout plus a webhook.
  - The webhook writes `subscriptions(plan, paid_at, expires_at)` and `invoices` and sends a real invoice email.
  - For Core/Strategic it calls `/activation` automatically, so Bassem unlocks with no manual step.
  - Renewal notifications go out 30 and 7 days before expiry.
- **B2. Server registration.** Documents (commercial register, tax card, logo) are uploaded to R2. Review status «قيد المراجعة / مطلوب مستند / موثّق» is delivered as notifications. Janna can fill the wizard by conversation.
- **B3. Claim or correct a profile.** Owners of the 3,000 imported factories claim their profile with R2 proof, and admin approves. Anyone can submit "report an error".
- **B4. Factory inbox and structured quotes.**
  - "طلبات واردة لي" lists inquiries routed to the claimed factory.
  - A `quotes` table holds price, MOQ, lead time, validity and an attachment.
  - The buyer compares quotes; thread messages are polled.
  - The rfqs/tenders modal unlocks "respond / save / remind me" for paid plans.
- **B5. respond.io WhatsApp.** A sender for the approved templates (inquiry received, status changed, reply received, deadline, digest), opt-in per channel through `notif_prefs`. An inbound webhook `/api/wa/inbound` attaches replies to the inquiry thread. This replaces the Meta Cloud API path in meetings.js.
- **B6. Bassem link.**
  - "حوّلها لصفقة" turns an inquiry into a deals row linked by inquiry_id, and Bassem drafts the reply.
  - His daily brief moves to the cron as an email/WhatsApp digest covering deadlines, buyer replies and stalled deals.
  - Still Core/Strategic only.
- **B7. Personalisation.**
  - A «لك اليوم» feed on home and the dashboard, ranked by sector, governorate and follows, with "why you see this" and the source date.
  - Saved searches with filters ("نبّهني بالجديد" on the list pages).
- **B8. Member self-edit.** Members edit their profile and products in D1 through a moderation queue. Published by a D1 read API or the next site.py rebuild.
- **B9. Weekly insights email.** Real numbers only, and not sent below the threshold.

PHASE C (scale and trust)

- **C1. Realtime.** A Durable Object per thread or member (WebSocket) for live chat, new-quote events and a Janna→human handoff. Cloudflare Queues for fan-out and retries. Only when volume justifies it.
- **C2. Matching.** Score inquiries against factory sector, products and governorate. The team approves before anything is sent. The buyer is told the true number of factories contacted.
- **C3. Deal stages and verified reviews.** Both sides confirm PO → delivered → completed. Only then can the buyer leave one moderated review. Nothing is seeded or imported.
- **C4. More interaction.**
  - Compare 2–3 factories or products.
  - Bourse price-threshold watchlist.
  - Event RSVP plus "قابلني في المعرض" booked through Janna meetings.
  - Newsletter and topic follows on media.
  - Moderated comments.

== 5. DECISIONS THE OWNER MUST MAKE (each with a recommended default) ==

1. **How inquiries reach factories.**
   - Default: the platform team relays every inquiry, by forwarding to the factory's official email and keeping the thread under inq-ref@reply. Factory personal phones are never used.
   - Direct delivery is allowed only to verified, claimed members (Phase B).

2. **Login method.**
   - Default: email one-time code for everyone (no passwords). Add WhatsApp OTP through respond.io once templates are approved.

3. **What each plan unlocks.**
   - Default:
     - Visitors: browse, send inquiries, follow by verified email.
     - data-only: alerts and digests.
     - basic and above: respond to RFQs/tenders, receive inquiries, stats.
     - premium: priority listing and quote attachments.
     - Core/Strategic: Bassem and the daily brief.

4. **Demo and sample content.**
   - Default: real accounts never show demo numbers. Keep one demo account only behind a visible «عرض توضيحي» banner.
   - Hide projects.js projects and leads (Saudi sample header) until the sources are verified.
   - deals.js stays labelled «عرض توضيحي».

5. **Who operates the inbox, and how fast.**
   - Default: one named operator, TEAM_EMAIL plus the admin inbox, with a first response within 1 business day.
   - The buyer receipt states this honestly. Without an operator, the inquiry engine must not launch.

== 6. RISKS ==

- **Deployment access.**
  - Problem: Cloudflare account access, secrets and Resend domain setup (SPF/DKIM/DMARC, the reply subdomain and Email Routing) are prerequisites. Without them, nothing in Phase A works.
  - Mitigation: do A0 first and check it with the health endpoints.
- **Operations load.**
  - Problem: a real inquiry engine with no human answering is worse than a brochure.
  - Mitigation: decision 5, admin inbox status SLAs, and Janna meeting fallback.
- **Spam and abuse on open forms and email-code login.**
  - Mitigation: Turnstile, IP/email rate limits (reuse meetings.js), daily send caps (reuse advisor.js), and a blocklist.
- **Personal data and consent** (Egypt PDPL 151/2020).
  - Store phone and email with explicit consent flags. WhatsApp is opt-in only. Every email has a working unsubscribe link. Never store raw IPs. Set a retention policy for inquiries.
- **Payment card fields.** register.html today collects card number and CVV in page inputs. Remove them immediately, even before N-Genius is live.
- **Stale alerts.** Follow alerts depend on the data snapshot, so "new" only appears after site.py rebuild → build-index.js → wrangler deploy. Automate that chain, or alerts go silent or arrive late.
- **Client-side trust.**
  - Problem: localStorage plan and auth can be spoofed.
  - Mitigation: every gated action, Bassem included, is checked on the server. Treat localStorage only as a UI cache.
- **AI overclaiming.**
  - Problem: Janna or Bassem might claim success or invent counts.
  - Mitigation: tools return the API result, and the prompts forbid confirming without a ref. Add tests for the API-down case.
- **Scope creep into realtime, matching or reviews before the basic loop works.**
  - Mitigation: hold to the Phase A exit test before starting B.
- **Migration from browser-only accounts.**
  - Problem: existing `mig-accts` users and their `mig-fav` favourites have to be moved over.
  - Mitigation: a one-time import prompt after the first server login, and no silent data loss.
- **Performance.** i18n-en.js is 7.9 MB, and the new shared mig-api.js must stay small and load lazily so interactivity doesn't slow the Arabic pages.

Key files:
- /home/user/madeinegyptgate/worker/wrangler.toml
- /home/user/madeinegyptgate/worker/schema.sql
- /home/user/madeinegyptgate/worker/src/index.js
- /home/user/madeinegyptgate/worker/src/advisor.js
- /home/user/madeinegyptgate/worker/src/meetings.js
- /home/user/madeinegyptgate/worker/build-index.js
- /home/user/madeinegyptgate/site.py
- /home/user/madeinegyptgate/pages.part.py
- /home/user/madeinegyptgate/company.part.py
- /home/user/madeinegyptgate/winner.part.py
- /home/user/madeinegyptgate/factory-profile.html
- /home/user/madeinegyptgate/market.part.html
- /home/user/madeinegyptgate/projects.part.py
- /home/user/madeinegyptgate/leads2.part.py
- /home/user/madeinegyptgate/registry.part.py
- /home/user/madeinegyptgate/radar.part.py
- /home/user/madeinegyptgate/oldlists.part.py
- /home/user/madeinegyptgate/register.part.py
- /home/user/madeinegyptgate/dash.part.html
- /home/user/madeinegyptgate/home2.part.html
- /home/user/madeinegyptgate/admin.part.py
- /home/user/madeinegyptgate/data/plan.js
- /home/user/madeinegyptgate/data/janna.js
- /home/user/madeinegyptgate/data/janna-live.js
- /home/user/madeinegyptgate/data/bassem.js
- /home/user/madeinegyptgate/advisor.part.py