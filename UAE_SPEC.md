# UAE conversion spec: «منصة صنع في مصر» (Made in Egypt Gate)

This project is a copy of the Saudi platform (madeinsaudigate) and must become the **UAE** platform with the same features and design system. A first mechanical pass already replaced: platform name, domain, email/phone/address, operator name, currency words (ريال→جنيه, ر.س→ج.م, SAR→AED), VAT 15%→5% in the register flow, colours (Saudi gold accent → UAE red #C09300, greens → UAE green #C8102E / deep #8E0B20), the language-button flag (UAE flag), the assistant name (سند→حسن) and avatar (img/hassan.png), and the logo (img/logo-site.png = red flame + black gear «منصة صنع في مصر / MADE IN EGYPT GATE»).

Your job in each file: remove EVERY remaining Saudi-specific fact, place, entity, number, law, programme, example and phrase, and replace it with the correct UAE equivalent — keeping the HTML/CSS/JS structure, ids, classes and behaviour working exactly as before.

## Identity
- Arabic name: منصة صنع في مصر · English: Made in Egypt Gate · domain madeinegyptgate.com · launched in **2020** (the old site says "Launched in 2020"). Do not use the Saudi date "12 أبريل 2020"; say «منذ عام 2020».
- Umbrella: **اتحاد الصناعات لدول مجلس التعاون الخليجي** (Federation of GCC Industries, fgccci.org) — keep this affiliation exactly as in the Saudi version. No chamber of commerce logos/affiliation claims.
- Official operator (from the official documents, use exactly):
  - Arabic legal name: **الجمعية المصرية للتنمية الصناعية** (short form in running text: «الجمعية المصرية للتنمية الصناعية»)
  - English legal name: **Egyptian Society for Industrial Development**
  - Legal form: شركة ذات مسؤولية محدودة – الشخص الواحد (LLC – Single Owner)
  - Commercial licence No. **—** — issued by دائرة الاقتصاد والسياحة بدبي (Dubai Department of Economy and Tourism), issue date 30/01/2023, valid until 29/01/2027.
  - Commercial register No. **—**.
  - Tax Registration Number (TRN, VAT): **—** — Federal Tax Authority, effective from 01/10/2023.
  - Licensed activities: برمجة الرقائق الإلكترونية · تصميم مواقع الشبكة المعلوماتية · خدمات تطوير وإدارة مواقع التواصل الاجتماعي · خدمات التسويق عبر مواقع التواصل الاجتماعي · إنشاء البنية التحتية لتقنية المعلومات · بوابة إلكترونية (Portal).
  - Registered address: الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية.
  - Phones: 01279188996 (also WhatsApp) and 02 38346757. Email info@madeinegyptgate.com.
  - Payment is ONLINE ONLY (card / Apple Pay / Google Pay via the payment gateway). Do NOT show any bank account, IBAN or bank-transfer option anywhere (registration, invoices, admin, Sultan, legal pages). Remove the Saudi «تحويل بنكي / رفع الإيصال» option and the bank-receipt approval flow wording; In admin «تسجيل عضو يدوي» (HQ walk-in registration) there must be NO payment section at all: remove the payment method, receipt/reference fields and «بانتظار الدفع» status from that form and its list; the member is simply registered (status «نشط» or «بانتظار المراجعة»). Other admin sections (payments/invoices overview) may still show online payments.
  - Do NOT publish the owner's personal name, nationality or ID numbers anywhere.
- Platform is an information/marketplace platform: not a government entity, not a government procurement portal, does not award contracts, does not provide or mediate financing, does not guarantee tender awards.
- Social: Facebook https://www.facebook.com/GCCINDUSTRIALGATE/ · X https://twitter.com/GateGcc · YouTube https://www.youtube.com/channel/UCyimDERlKcySe-zRjvw6xAQ · WhatsApp https://wa.me/201279188996 (others: generic platform root links, as now).
- Partner shown on the old site: COMTECH Steel Industries (شركة كومتك للصناعات المعدنية) — logo img/lg-comtech.png. All Saudi partner names/logos/banners (SICAST, Tahweel, Rawabi, Alessa/CRAFFT, Amiantit, SNAM, CIR, Sulb, Obeikan…) must be removed from UAE pages.

## Geography — 7 emirates (codes used everywhere: data, hashes, filters)
AUH أبوظبي (Abu Dhabi) · DXB دبي (Dubai) · SHJ الشارقة (Sharjah) · AJM عجمان (Ajman) · UAQ أم القيوين (Umm Al Quwain) · RAK رأس الخيمة (Ras Al Khaimah) · FUJ الفجيرة (Fujairah).
Replace «13 منطقة» / «مناطق المملكة الـ13» with «الإمارات السبع». «المنطقة» → «الإمارة» where it means a region. «المدن الصناعية» → «المناطق الصناعية والحرة». Region pages use region.html#AUH etc.
Industrial geography examples: ICAD/مصفح، كيزاد (KEZAD)، خليفة الصناعية، الرويس، جبل علي (JAFZA)، مدينة دبي الصناعية، القوز، دبي الجنوب، واحة دبي للسيليكون، المنطقة الحرة بالحمرية، مطار الشارقة الدولي الحرة (SAIF)، المنطقة الحرة بعجمان، أم القيوين الحرة، راكز (RAKEZ)، منطقة الفجيرة الحرة، ميناء الفجيرة.

## Currency, tax, prices
EGP (جنيه، ج.م). VAT 14%. Packages (same numbers in EGP/year, excluding VAT): تسجيل بيانات فقط 4,000 · الأساسية 10,000 · المميزة 25,000 · الشريك الأساسي 50,000 · الشريك الاستراتيجي 100,000. No free registration.
Registration documents: الرخصة التجارية/الصناعية، شهادة التسجيل الضريبي (TRN)، شهادة القيمة الوطنية المضافة (ICV) إن وجدت، الشعار، ختم وتوقيع الاستمارة. Payment: online only — no bank account or bank transfer shown anywhere.

## National programmes & bodies (replace Saudi ones)
- Vision/strategy: «رؤية السعودية 2030» → «رؤية نحن الإمارات 2031» + «الاستراتيجية الوطنية للصناعة والتكنولوجيا المتقدمة – مشروع 300 مليار» (raise industry's GDP contribution to EGP 300 bn by 2031) + «مئوية الإمارات 2071».
- «المحتوى المحلي / هيئة المحتوى المحلي» → «البرنامج الوطني للقيمة المحلية المضافة (ICV)». «القائمة الإلزامية» → «أفضلية المنتج الوطني في المشتريات / ICV score».
- «برنامج صنع في السعودية» → «اصنع في مصر (Make it in the Emirates)» + علامة «صنع في مصر».
- Industry ministry: وزارة الصناعة والتكنولوجيا المتقدمة (MoIAT). Standards: MoIAT conformity / ECAS / EQM; Abu Dhabi Quality & Conformity Council; Dubai Central Laboratory. Food/drug: وزارة التغير المناخي والبيئة / هيئة أبوظبي للزراعة والسلامة الغذائية / بلدية دبي / مؤسسة الإمارات للدواء.
- Industrial land: كيزاد (مجموعة موانئ أبوظبي)، مدينة دبي الصناعية، جافزا، راكز، …
- Exports & insurance: الاتحاد لائتمان الصادرات (Etihad Credit Insurance), مكتب أبوظبي للصادرات (ADEX), دبي للصناعات والصادرات. Finance (information only): مصرف الإمارات للتنمية.
- Tax/customs: الهيئة الاتحادية للضرائب (FTA)، الهيئة الاتحادية للهوية والجنسية والجمارك وأمن المنافذ، جمارك دبي، جمارك أبوظبي.
- Procurement: «منصة اعتماد» → federal «منصة المشتريات الرقمية – وزارة المالية» + بوابات المشتريات في أبوظبي ودبي (Dubai eSupply) والشركات شبه الحكومية (ADNOC, DEWA, ENEC…). Platform is not a procurement authority.
- Stock market: «تداول/تاسي» → «سوق أبوظبي للأوراق المالية (ADX)» و«سوق دبي المالي (DFM)».
- Labour: وزارة الموارد البشرية والتوطين (MOHRE)، نافس.
- Laws for the legal centre: see data/research legal.json (UAE PDPL Federal Decree-Law 45/2021, cybercrime 34/2021, copyright 38/2021, VAT 8/2017, e-commerce, consumer protection, competition).
- Hijri date in the top bar may stay (used in UAE). Dates otherwise Gregorian.

## Assistant «حسن»
Emirati man, light Emirati dialect for the bot persona (e.g. «مرحبا الساع»، «هلا والله»، «أبشر»، «شو تحتاج؟»، «حياك الله»). Site copy stays Modern Standard Arabic. Greeting: «السلام عليكم ورحمة الله وبركاته … أنا «حسن» مساعدك الذكي من إدارة الدعم بمنصة صنع في مصر». Same 12 service buttons (UAE answers), same WhatsApp hand-off (201279188996).

## Data globals (built separately — read them, don't hand-copy Saudi data)
MIGREG (data/regions.js, 7 emirates), MIGZONES (zones.js), MIGFAC (factories.js), REAL {news, events, market, awards, tenders, tenders_intl} (real.js), MIG.PROJECTS (projects.js), REG (registry.js), MIGOFFERS (offers.js), MIGOLDFAC / MIGOLDP / MIGTEND / MIGRFQ (old UAE site data). Research JSON for facts: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/uae/real/*.json (emirates, cities, zones, factories, events, news, projects, awards, market, tenders, offers, refs, legal). Old UAE platform content: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/uae/live/*_raw.json and the operator's legal texts /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/uae/op/legal_ar.json.

## Rules
- Facts must be real and verifiable; if you need a number you don't have from the research files, use a qualitative sentence instead of inventing it.
- Keep every element id/class/data-attribute and JS function name unchanged unless the spec requires otherwise; keep pages working (no JS errors).
- Keep MSA for site copy. Keep "Made in Egypt Gate" naming consistent.
- International platforms list (intl.html): the Saudi gate (منصة صنع في السعودية – madeinsaudigate.com) replaces the UAE gate entry; keep the other GCC/international gates.
- Saudi-specific sample content (e.g. Obeikan glass factory profile, Saudi stock tickers, Saudi cities, Saudi megaprojects like NEOM/Qiddiya, Saudi chambers, Saudi banks, Saudi laws/decrees, Hijri-only Saudi references, «المملكة» meaning KSA) must not remain. «المملكة» → «الدولة» or «الإمارات» as appropriate.

## Assets
- Saudi-branded / Saudi-company assets that must NOT be used on any UAE page (remove the references; files will be deleted): media/about.mp4 (Saudi intro film – remove the film section/lightbox from the about page entirely, keep the generic background video media/about-bg.mp4), media/ogc-*.mp4 and img/ogc-*.jpg (Obeikan Glass, Saudi), img/ban-*.jpg and img/lg-amiantit.png, lg-rawabi.png, lg-sicast.png, lg-snam.png, lg-tahweel.png, img/l_alessa.png, l_cir.png, l_sulb.png (Saudi partners), img/sanad.jpg, the {{LOGO_OGC}} placeholder.
- Available UAE/generic assets: img/logo-site.png (UAE logo), img/og-cover.jpg (UAE share image), img/about-poster.jpg, img/hassan.png (assistant), img/lg-comtech.png (partner), img/pl-sa.png (Made in Saudi Gate logo for the international platforms list; img/pl-ae.png is the UAE gate logo), img/rg-<CODE>.jpg (7 emirates photos), generic photos img/hero.jpg, hero-poster.jpg, m0–m4.jpg, e0–e4.jpg, cat-*.jpg, p0–p7.jpg, fgcci.svg, media/hero.mp4, media/about-bg.mp4.
- The sample factory profile page (factory.html, built from factory-profile.html + PDET in site.py) must become a REAL UAE factory taken from the research file factories.json (only real public facts; no fabricated numbers — remove KPI numbers you cannot source or label them as examples), using generic images.

## Admin dashboard
The UAE version has NO admin dashboard for now (the owner will add it later). admin.part.py is not executed by site.py; do not link to admin.html anywhere and do not re-add it.
