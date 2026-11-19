### forms
## Forms, honesty pass and AI actions: done and tested

An earlier run of this task stopped at about 00:55 and left most of the work in place. I checked it against the pre-edit snapshot in `scratchpad/bak/` (taken at 00:26), kept what was correct, fixed what was missing and finished the rest. `python3 site.py` builds cleanly.

Tests use Playwright against http://localhost:8780 with a mocked Worker API. I injected `mig-api.js` and stubbed `MIGHOLO` so its calls could be recorded.
- `scratchpad/t2.js` (forms): **46/46 pass**
- `scratchpad/t6.js` (Janna, Bassem and honesty checks): **40/40 pass**, plus 1/1 for the extra Bassem "send e-mail" case
- `scratchpad/t7.js`: **no JS errors on 49 pages, in Arabic and English**
- ES5 syntax check (acorn): `janna-live.js`, `mig-forms.js` and the inline scripts of 23 built pages all pass.

There are 96 screenshots (AR/EN, desktop/mobile) in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/phaseA/forms/`. Test logs are `t2-final.log`, `t6-final.log` and `t7-final.log` in the `phaseA` folder.

### Files changed (all under `/home/user/madeinegyptgate/`)
- **New:** `data/mig-forms.js`. This is the shared `MIGINQ` sender: dialogs, consent, results, the RFQ target, page context and scope helpers.
- **Part files:** `pages.part.py`, `company.part.py`, `winner.part.py`, `registry.part.py`, `projects.part.py`, `leads2.part.py`, `register.part.py`, `oldlists.part.py`, `radar.part.py`, `admin.part.py`, `city.part.py`, `regions.part.py`, `offers.part.py`, `exportmarket.part.py`, `bourse.part.py`, `deal.part.py`, `about.part.py`, `legal.part.py`
- **HTML parts:** `factory-profile.html`, `market.part.html`, `home2.part.html`
- **Data:** `data/janna-live.js`, `data/deals.js`, `data/projects.js`
- **Not touched:** `site.py`, `janna.js`, `holo.js`, `captions.js`, `mig-api.js`, `plan.js`, `bassem.js`, `advisor.part.py`, `dash.part.html`, `inbox.part.py`.

### Every form wired (page → kind)
Every form sends through `MIGINQ.send` → `MIGAPI.inquiry`. The page shows the real ref and a track link only after the server answers. Offline, it says plainly that nothing was sent and offers a Janna meeting.

| Page | Action | Kind / call |
|---|---|---|
| contact.html | `#msgF` message | contact (`pages.part.py:495`) |
| contact.html | `#rfq-form` | rfq (`:502`); the target comes from sessionStorage `mig-rfq-to`, so the dead key is fixed |
| company.html | Request a quote | rfq, addressed to that company (`company.part.py:74`) |
| company.html | Message the company | contact to the company (`:77`) |
| company.html | Report a data correction | profile_fix (`:83`) |
| factory.html | `#rfqForm` | rfq, target factory (`factory-profile.html:692`); the WhatsApp hand-off is gone |
| opportunity.html | `#offer` | opp_offer, basic plan or higher (`pages.part.py:194`) |
| rfqs.html modal | Quote | opp_offer to the RFQ (`oldlists.part.py:110`) |
| market.html | Basket | basket, sends the cart as `items` (`market.part.html:573`) |
| project.html | Register interest | project_interest (`projects.part.py:133`) |
| lead.html | Register interest | lead_interest (`projects.part.py:65`); no leads are published now, so the page shows an empty state |
| winner.html | Offer your products | lead_interest, target company (`winner.part.py:55`) |
| entity.html | Offer your products | entity_contact (`registry.part.py:140`) |
| register.html | Final step | signup (`register.part.py:228`) |
| Many pages | ☆ follow buttons | `MIGAPI.follow` |

**Page context (`MIG_CTX`)** is set on: company, factory, the tender and RFQ modals, opportunity, project, lead, offer, entity, winner, region, city, radar sector and export market.

**Geographic scope gating** applies on opportunity, radar and export-market pages, with an upgrade prompt. Tenders, RFQs, awards, projects and suppliers data is all Egypt, so every plan sees it there.

### Janna and Bassem (`data/janna-live.js`)
- **`janna_submit_form`:** says "sent" only on a `mig:inquiry` event carrying a ref, together with the true routed count (`:265`). It now also covers the last registration step (`:259`). When the API is down, Janna says the request was not sent.
- **`janna_fill_rfq` on a factory or company page:** addresses the request to that factory or company by name.
- **`janna_follow` and `janna_track`:** implemented and tested.
- **Bassem tools (`:344`):** `bassem_open_opportunity`, `bassem_start_deal`, `bassem_draft_email` (never fills a recipient that is not in the deal), `bassem_send_email`, `bassem_update_deal` and `bassem_open_guide` drive advisor.html through its own controls.
  - From another page they hand over via `advisor.html#bcmd=` (`:442`).
- **`bassem_notify_member` and `bassem_set_work_time`:** call `MIGAPI.notify` and `MIGAPI.prefs`. Where `mig-api.js` is not on the page, they fall back to the same API contract directly (`:332`).
- **Hologram:** every tool call also goes to `MIGHOLO.act(tool, args, {who})` (`:195`).
- **Meetings:** unchanged. `janna_book_meeting` now books through `/api/meetings` instead of writing a message for a human team.

### Fakes removed (current file:line)
- **Opportunity page (`pages.part.py`):**
  - the «(مثال)» offer confirmation and fake OF- number: replaced by the opp_offer send, `:194`;
  - the invented publish date "today-6": now "not announced", `:174`;
  - the invented default price and duration: removed;
  - the fake PDF/XLSX/DOCX documents: now one link to the official notice, `:177`;
  - the fake "saved" toast: now a real follow, `:164`;
  - the MSG-* sample opportunity list: never shown, `:99`.
- **Contact page (`pages.part.py`):**
  - the «(مثال)» confirmations, the "representative will call within a business day" promise and the `Math.random` RFQ number: replaced by the real sends at `:495` and `:502`;
  - the sample videos list: emptied, `:396`;
  - the "talk directly to the platform team" WhatsApp label: now neutral, `:448`.
- **Market (`market.part.html`):**
  - the fake PO number, «(مثال)» and WhatsApp promise: real basket send, `:573`;
  - the sample listings with example prices, ratings and stock: removed, `:354`;
  - the fake deals and "most requested" rows: hidden, `:414`;
  - the obsolete "illustrative prices" note: `:280`;
  - the "prices and shipping computed" toast: `:380`;
  - rating, price and verified filters with no data behind them: hidden, `:431`;
  - "replies within 24 h" and "in stock" claims: removed.
- **Home (`home2.part.html`):**
  - the random price drift: removed, `:853`;
  - the hard-coded 26,808, 35 and 806 counters: now computed, `:622`;
  - the simulated "new opportunity detected" feed: removed, `:1007`;
  - the example award rows: `:1171` and `:1201`;
  - the invented "4,000 m² in New Cairo" journey example and the ratings step: `:817`;
  - the sample video fallback: `:1038`;
  - the "consulting" card: now the real Bassem advisor card, `:1222`;
  - 12 dead `dashboard.html#…` links: pointed at real pages.
- **Register (`register.part.py`):**
  - card number, expiry and CVV inputs: removed, `:164`;
  - the fake "paid and activated" screen, `Math.random` invoice number and generated password: replaced by the signup send, `:228`;
  - the signature, stamp and file inputs: now uploaded from the account later, `:150`.
- **Factory profile (`factory-profile.html`):** fake follow toast, `:349`; example markets and photos hidden, `:444`; example opening hours removed; WhatsApp hand-off replaced; "complete profiles rank first" claim, `:523`.
- **Company page (`company.part.py:53`):** directory listings no longer claim "registered member".
- **Projects:**
  - `data/projects.js:16`: the "SAMPLE DATA" header and inferred material leads are hidden;
  - `projects.part.py`: the progress % and "open packages" are gone, `:93` and `:120`.
- **Deals:** `data/deals.js:7` demo deals emptied.
- **Bourse (`bourse.part.py`):** the simulated random-walk price history (sparklines and chart) is removed; only the real last close, its date and its source are shown, `:77`, `:88`, `:114`.
- **Export markets (`exportmarket.part.py`):** typed-in demand figures are now counted from published opportunities, `:57`; the stale "illustrative" note is fixed, `:38`.
- **About (`about.part.py:288`):** 14,820, 11,988, "+26,000" and "more than 26 thousand" are now computed at build time from `oldfac.js`: 1,380 factories, 1,546 companies and suppliers, 2,926 in total.
- **Deal journey (`deal.part.py:75–79`):** claims of POs on the platform, ratings, "seen" receipts, attachments and contract-template toasts are removed.
- **Legal (`legal.part.py`):** "team replies within one business day" and the manual recording by the team are now automatic statements, `:89`, `:100`, `:130`.
- **Admin (`admin.part.py`):** the invented subscriptions, payments and approvals lists are emptied, `:67` and `:73`; every «(مثال)» toast is replaced; the fake "subscribed" status on every 4th factory is gone, `:125`; the UAE leftovers are cleaned. Its build is still disabled in `site.py`.
- **Entity and winner pages:** "you follow its awards automatically" is now said only to signed-in users, when the follow really happens.
- **Radar (`radar.part.py:87`):** the sample-data note is gone, and out-of-scope opportunities are hidden with a count (`:115`).

### Decisions for you
- **Register final message:** I did not use «فريق المنصة هيتواصل معاك لإتمام الدفع». It promises a human, which owner decision (5) rules out. The final screen instead says the secure payment link is e-mailed automatically once N-Genius is live, and offers a Janna meeting. It is a one-string change in `register.part.py` if you want the original wording.
- **Legal complaint deadlines:** `legal.part.py:100` still commits to a first reply within 5 business days and a decision within 15. Those are legal commitments that imply a person, so they need an owner or legal decision.

### Notes for other owners
- **Integrator (`site.py`):**
  - add `data/mig-api.js`, `data/mig-forms.js` and `data/holo.js` to every page. At present `winner.part.py` appends the two clients only to pages built before it, so advisor.html and meeting.html lack them.
  - the plan gates for entity, winner, project and radar send visitors to `register.html#partner`; `#plans` would match those lower-tier features better.
- **`janna.js` owner:**
  - the local engine checks for `#rfq-form .okbox2`, which no longer exists, so it can never confirm a send. It should listen for the window event `mig:inquiry` (`{ok, ref, status, routed, kind}`).
  - its "sent.contact" line promises a team callback, and "sent.rfq" claims factories will see the request even when none matched.
- **`captions.js` owner:** it reads `JANNA_LIVE.persona` as a string, but it is a function, as `holo.js` expects.