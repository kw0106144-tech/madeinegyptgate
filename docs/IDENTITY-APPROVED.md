# Approved identity texts — منصة صنع في مصر (Made in Egypt Gate)

Approved by the platform owner on 2026-11-27 («موافق على النصوص التلاتة»). The Arabic is word for word (only the spelling was
corrected: hamzas and taa marbuta). The English lines are **English translation, pending the owner's look**: faithful
translations written for the site and the structured data, not yet read by the owner.

The owner / operator lines approved on 2026-11-19 (CLAUDE.md 2.7) are separate and stay exactly as they are: the identity sentence
replaces only the old platform-definition sentence (the about page's opening paragraph, the footer's platform line, the Organization
`description` in the JSON-LD).

## Identity sentence

Arabic (approved):

> منصة صنع في مصر هي منظومة رقمية متكاملة للصناعة والتوريدات والمشتريات والتصدير، تعمل تحت مظلة الجمعية المصرية للتنمية الصناعية، أُطلقت في عام 2020، وتُعد المنصة الأولى التي تساعد المصانع المصرية في التوسع محلياً وخليجياً وعالمياً، ووصول المنتجات المصرية إلى حصة سوقية متطورة.

English translation, pending the owner's look:

> Made in Egypt Gate is an integrated digital ecosystem for industry, supply, procurement and export, operating under the umbrella of the Egypt Industrial Development Association. Launched in 2020, it is the first platform that helps Egyptian factories expand locally, across the Gulf and worldwide, and helps Egyptian products reach a growing, more advanced market share.

## Official address and phone (for the Google Business Profile and the structured data)

| | Arabic (approved) | English translation, pending the owner's look |
|---|---|---|
| Address | عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة | Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt |
| Phone | 02 38346757 | +20 2 38346757 (E.164: +20238346757) |

No postal code was given, so none is published. The map link is a Google Maps search built from the Arabic address text
(no coordinates were given, so none are published).

## Working hours

| Arabic (approved) | English translation, pending the owner's look |
|---|---|
| من الأحد للخميس، من 8 صباحاً حتى 4 عصراً؛ الجمعة والسبت إجازة. | Sunday to Thursday, 8 am to 4 pm; Friday and Saturday closed. |

Structured data: `OpeningHoursSpecification` Sunday–Thursday 08:00–16:00.

## Where they are used

- `seo.part.py`: `IDENTITY_AR` / `IDENTITY_EN`, `ADDRESS_AR` / `ADDRESS_EN`, `HOURS_AR` / `HOURS_EN`, `MAP_URL` and the JSON-LD
  (`ORG`, `OFFICE` = ProfessionalService, `WEBSITE`), emitted on `/`, `/en/`, `/about/` and `/contact/` (`seo_build.part.py` `org_nodes`).
- The about page's opening paragraph (`about.part.py`), the footer of every page (`seo_build.part.py` `site_footer`), the contact page
  (`pages.part.py`: address, map link, working hours), `/llms.txt` (`seo_assist.part.py`).
- The Control Center seed of the public setting `address_ar` / `address_en` (`worker/src/acc-plans.js` `SEED_PUBLIC`) and the build's
  default (`data/settings-live.js` `SEED`). A value saved earlier in «النظام ← الإعدادات» with the previous wording of the same
  address is ignored by `data/settings-live.js`; any other saved value still wins, as before.
