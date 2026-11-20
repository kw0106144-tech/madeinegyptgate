# Store listings (Google Play + App Store), Arabic and English

Texts in the fastlane layout, so they can be pasted into the consoles now and uploaded with `fastlane supply` / `fastlane deliver`
later (`--metadata_path app/store/fastlane/metadata/android` or `.../ios`). `npm run check` keeps every file within the store limits.

| Store field | Limit | Arabic | English |
|---|---|---|---|
| Google Play title | 30 | `fastlane/metadata/android/ar/title.txt` | `.../android/en-US/title.txt` |
| Google Play short description | 80 | `.../android/ar/short_description.txt` | `.../android/en-US/short_description.txt` |
| Google Play full description | 4000 | `.../android/ar/full_description.txt` | `.../android/en-US/full_description.txt` |
| Google Play "What's new" | 500 | `.../android/ar/changelogs/default.txt` | `.../android/en-US/changelogs/default.txt` |
| App Store name / subtitle | 30 / 30 | `.../ios/ar-SA/name.txt`, `subtitle.txt` | `.../ios/en-US/…` |
| App Store promotional text | 170 | `.../ios/ar-SA/promotional_text.txt` | `.../ios/en-US/…` |
| App Store description | 4000 | `.../ios/ar-SA/description.txt` | `.../ios/en-US/…` |
| App Store keywords | 100 bytes | `.../ios/ar-SA/keywords.txt` | `.../ios/en-US/…` |
| Privacy / support / marketing URL | — | `privacy_url.txt` (`/legal/#privacy`), `support_url.txt` (`/contact/`), `marketing_url.txt` | same with `?lang=en` |

Default language: Arabic (Play: `ar`; App Store: Arabic, with English (U.S.) added).

## Where every statement comes from (only what the site already says)

- "the unified national B2B platform … connects factories and suppliers across Egypt's 27 governorates with local and international
  buyers … digital transformation … trusted, transparent environment": the footer of every page (`seo_build.part.py` `site_footer`)
  and the legal center (`legal.part.py`, status).
- Marketplace, wholesale, request a quote, five export markets: `seo.part.py` (`home`, `market`).
- Factory directory by sector / governorate / product with a profile and a quote request: `seo.part.py` (`factories`, `factory`).
- Tenders and RFQs with the issuing body, governorate, sector, dates and the official announcement link: `seo.part.py` (`opportunity`).
- Projects with stage, value, the parties and materials, with the source link: `seo.part.py` (`projects`).
- Industrial and free zones, retail outlet offers, media center (news, exhibitions, events): the site menu (`site.py` `NAV`, footer).
- Janna "the smart assistant … speaks Egyptian Arabic and English", live video call: `data/janna.js`, `data/janna-live.js`.
- Bassem "the smart deals advisor" for Core Partner / Strategic Partner members: `advisor.part.py`, `data/plan.js`.
- Owner / operator lines: word for word as approved by the owner (CLAUDE.md 2.7), in the footer's order.
- "a directory, an e-marketplace and an information intermediary; not a government body or a contracting authority": `legal.part.py`.
- No counts that change (members, companies, tenders): the listing would go stale; the only numbers are the 27 governorates and the
  five export markets, as the site states them.

## Graphics

| File | Use |
|---|---|
| `graphics/play-icon-512.png` | Google Play app icon (512 × 512) |
| `graphics/play-feature-graphic-1024x500.png` | Google Play feature graphic |
| `graphics/appstore-icon-1024.png` | App Store icon (also inside the Xcode project: `AppIcon-512@2x.png`) |

Made by `app/tools/make_assets.py` from `img/logo-site.png` (about 200 px: upscaled; a larger master makes them sharp).

## Still to prepare (needs the installed app or the owner)

- **Screenshots**: Google Play 2–8 phone screenshots (at least 1080 px on the short side is recommended); App Store iPhone 6.9″
  (1320 × 2868) or 6.5″ (1284 × 2778), and iPad 13″ (2064 × 2752) because the app supports iPad. Take them from the test APK and
  the TestFlight build: home, marketplace, a factory profile, tenders, Janna's live call, Arabic and English.
- **Content rating** questionnaire (both stores): business / reference app, no violence, users can communicate with the platform's team.
- **Google Play Data safety** and **App Store App Privacy**, from the same list as the privacy policy (app/README.md, "Before
  submitting"; the proposed policy text is a draft for the owner in `docs/app/OWNER-APPROVAL-AR.md` section 4): contact info (e-mail,
  phone), user content (the voice of a live call, which goes to Anam for AI processing, possibly outside Egypt; messages and price
  requests; uploaded photos), identifiers (member id, Janna's random visitor id), usage data, purchases (invoices). A **summary of
  every call is kept** as the assistants' memory (Bassem per member, Janna per visitor id) until the person asks for its deletion —
  not only the voice "while the call lasts", as an earlier draft here said. No advertising tracking in the iPhone app (`data/seo.js`).
  Data encrypted in transit. Deletion: «طلب حذف الحساب» in the dashboard and **Delete account URL**
  `https://madeinegyptgate.com/delete-account/` (switch `account_delete`, after migration `0010_delete_requests.sql`).
- **App Store review notes** and **Google Play «App access»**: the sign-in is an e-mailed code, so the owner prepares a review
  account: a member with a real plan activated for the review, its address and a 6-digit code saved in the Control Center
  «🛠️ المطوّر» (card «دخول مراجعي المتاجر — الإيميل والكود», at most 30 days, never a staff account), and the switch
  `store_review_signin` on during the review only, off after the approval. The note for the reviewers (English, with an Arabic twin
  for the owner) is a draft in `docs/app/OWNER-APPROVAL-AR.md` section 2; it also says that Janna's live call needs the microphone.
- **Prices**: the texts here name no plan price and no "register and pay", so they stay true whether the owner keeps the switches
  `app_buy_ios` / `app_buy_android` on (prices and payment like the website) or turns them off for the review (app/README.md).
