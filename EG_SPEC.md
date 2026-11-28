# Egypt conversion spec: «منصة صنع في مصر» (Made in Egypt Gate)

This project is a copy of the UAE platform (madeinuaegate) and must become the **Egypt** platform with the same features and design system. A first mechanical pass already replaced: platform name, domain, email/phone/address, operator name, currency words (درهم→جنيه, د.إ→ج.م, AED→EGP), VAT 5%→14% in the register flow, colours (UAE green → Egyptian red #C8102E as the primary «--green» variable; UAE red accent → Egyptian eagle gold #C09300 as the «--gold» variable, with dark text #1A1204 on gold buttons), the flag icon (Egypt), the assistant name «سلطان»→«حسن» and its image img/hassan.png. Variable/class names like --green/--gold stay as they are.

Your job in each file: remove EVERY remaining UAE-specific (and any leftover Saudi) fact, place, entity, number, law, programme, example and phrase, and replace it with the correct EGYPTIAN equivalent — keeping the HTML/CSS/JS structure, ids, classes and behaviour working exactly as before.

## Identity
- Arabic name: منصة صنع في مصر · English: Made in Egypt Gate · domain madeinegyptgate.com. Tagline from the old site: «المنصة الوطنية الموحدة B2B 🇪🇬» — «المرجع الرقمي الأول لربط المصانع والموردين بالمشترين المحليين والدوليين، ودعم التحول الرقمي للقطاع الصناعي في بيئة موثوقة وشفافة.» Do not state a launch year (unknown); say «منصة صنع في مصر» without «منذ عام …».
- Operator / owner: **الجمعية المصرية للتنمية الصناعية** (English: Egyptian Society for Industrial Development). It operates and manages the platform. Do not invent registration, licence or tax numbers for it (remove the UAE licence/register/TRN numbers; where a field showed them, show only the name and address, or «تُضاف بيانات التسجيل الرسمية عند اعتمادها» only if the layout needs a value).
- There is NO umbrella affiliation with the Federation of GCC Industries in the Egypt version: remove «منصة تابعة لاتحاد الصناعات لدول مجلس التعاون الخليجي», the FGCI logo block in the footer and FGCI from banner strips. (FGCI may still appear only as an external reference/link in useful-links / international platforms.)
- Address: عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة.
- Phones: landline 02 38346757 (hotline, international +20 2 38346757); mobile & WhatsApp 01279188996 (international +20 127 918 8996, wa.me/201279188996). Email info@madeinegyptgate.com (support: support@madeinegyptgate.com).
- Payment is ONLINE ONLY (card / mobile wallet / Fawry / InstaPay-style e-payment via the payment gateway — keep wording generic: «الدفع الإلكتروني عبر بوابة الدفع: البطاقات البنكية والمحافظ الإلكترونية»). No bank account/IBAN or bank-transfer option anywhere.
- Platform is an information/marketplace platform: not a government entity, not a procurement authority, does not award contracts, does not provide or mediate financing, does not guarantee awards.
- Social: use generic links to the platform root (no UAE/GCC accounts): Facebook/X/YouTube/LinkedIn/Instagram pointing to https://www.madeinegyptgate.com until real accounts are provided; WhatsApp https://wa.me/201279188996.
- Partners/banners: the UAE partner banners (Al Ain Farms, GCG, Transem, SICHEM) and COMTECH must be removed. Keep the banner slots with the «مساحة إعلانية محجوزة» placeholder (STRAT and PARTNER sbn lists empty).

## Geography — 27 governorates (codes used everywhere: data, hashes, filters)
CAI القاهرة · GIZ الجيزة · ALX الإسكندرية · QLB القليوبية · SHR الشرقية · DKH الدقهلية · GHR الغربية · MNF المنوفية · BHR البحيرة · KFS كفر الشيخ · DMT دمياط · PTS بورسعيد · ISM الإسماعيلية · SUZ السويس · NSN شمال سيناء · JSN جنوب سيناء · FYM الفيوم · BNS بني سويف · MNY المنيا · AST أسيوط · SHG سوهاج · QNA قنا · LXR الأقصر · ASN أسوان · BBA البحر الأحمر · WAD الوادي الجديد · MTR مطروح.
Replace «الإمارات السبع / 7 إمارات» with «محافظات مصر الـ27» / «27 محافظة»; «الإمارة» → «المحافظة»; «المناطق الصناعية والحرة» stays (Egypt has industrial zones, new cities and free zones). Region pages use region.html#CAI etc.
Industrial geography: العاشر من رمضان، السادس من أكتوبر، مدينة السادات، العبور، بدر، برج العرب، دمياط الجديدة، المنطقة الاقتصادية لقناة السويس (العين السخنة، شرق بورسعيد، القنطرة غرب)، قويسنا، الروبيكي (مدينة الجلود)، شبرا الخيمة، المحلة الكبرى، بني سويف الجديدة، كوم أمبو، الكوثر بسوهاج…

## Currency, tax, prices
EGP (جنيه مصري، ج.م). VAT 14% (Law 67 of 2016). Packages (EGP/year, excluding VAT): تسجيل بيانات فقط 4,000 · الأساسية 10,000 · المميزة 25,000 · الشريك الأساسي 50,000 · الشريك الاستراتيجي 100,000. No free registration.
Registration documents: السجل التجاري، البطاقة الضريبية، الرخصة الصناعية / سجل المصانع لدى هيئة التنمية الصناعية (إن وجد)، شهادة التسجيل في ضريبة القيمة المضافة، الشعار، ختم وتوقيع الاستمارة. Payment online only.

## National programmes & bodies (replace UAE ones)
- Vision: «رؤية مصر 2030» + «الاستراتيجية الوطنية للصناعة / تعميق التصنيع المحلي» + «مبادرة ابدأ» (if needed) + «الصناعة المصرية / صنع في مصر».
- ICV → «تفضيل المنتج المصري في التعاقدات الحكومية (القانون رقم 5 لسنة 2015)» and «نسبة المكون المحلي».
- Industry ministry: «وزارة الصناعة» (Egypt's Ministry of Industry; verify the current 2026 name if you mention it) + «هيئة التنمية الصناعية (IDA)» + «مركز تحديث الصناعة (IMC)» + «اتحاد الصناعات المصرية».
- Standards & control: الهيئة المصرية العامة للمواصفات والجودة (EOS)، الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)، هيئة الدواء المصرية، الهيئة القومية لسلامة الغذاء، المجلس الوطني للاعتماد (EGAC).
- Investment & zones: الهيئة العامة للاستثمار والمناطق الحرة (GAFI)، الهيئة الاقتصادية لقناة السويس (SCZone)، هيئة المجتمعات العمرانية الجديدة.
- Exports: المجالس التصديرية، هيئة تنمية الصادرات، صندوق تنمية الصادرات/برنامج رد أعباء التصدير، الشركة المصرية لضمان الصادرات. Finance (information only): جهاز تنمية المشروعات المتوسطة والصغيرة ومتناهية الصغر.
- Tax/customs: مصلحة الضرائب المصرية (الفاتورة الإلكترونية)، مصلحة الجمارك المصرية (منظومة نافذة، التسجيل المسبق للشحنات ACI).
- Procurement: «منصة المشتريات الرقمية/بوابات أبوظبي/دبي» → «بوابة التعاقدات العامة المصرية (etenders.gov.eg)» + «هيئة الشراء الموحد (UPA)» + الشركات العامة وقطاع البترول والكهرباء. Platform is not a procurement authority.
- Stock market: «ADX/DFM» → «البورصة المصرية (EGX) – مؤشرا EGX30 وEGX70».
- Labour: وزارة العمل، الهيئة القومية للتأمين الاجتماعي.
- Laws for the legal centre (see research legal.json): قانون حماية البيانات الشخصية رقم 151 لسنة 2020، قانون مكافحة جرائم تقنية المعلومات رقم 175 لسنة 2018، قانون حماية المستهلك رقم 181 لسنة 2018، قانون حماية حقوق الملكية الفكرية رقم 82 لسنة 2002، قانون الضريبة على القيمة المضافة رقم 67 لسنة 2016، قانون التوقيع الإلكتروني رقم 15 لسنة 2004، قانون تيسير إجراءات منح تراخيص المنشآت الصناعية رقم 15 لسنة 2017، قانون الاستثمار رقم 72 لسنة 2017، قانون التعاقدات العامة رقم 182 لسنة 2018، قانون حماية المنافسة رقم 3 لسنة 2005، قانون تفضيل المنتجات المصرية رقم 5 لسنة 2015. Governing law & courts: Egyptian law, courts of Giza/Cairo (or the Economic Courts).
- Dates Gregorian; the Hijri date in the top bar may stay.

## Assistant «حسن»
Egyptian young man (img/hassan.png). Persona speaks light, polite Egyptian dialect («أهلاً بيك»، «تحت أمرك»، «إزاي أقدر أساعدك؟»، «تمام»، «حاضر»). Site copy stays Modern Standard Arabic. Greeting: «السلام عليكم ورحمة الله وبركاته… أنا «حسن» مساعدك الذكي من فريق الدعم بمنصة صنع في مصر. إزاي أقدر أساعدك النهارده؟». After each answer offer WhatsApp handoff to 01279188996.

## Data globals (built separately — read them, don't hand-copy UAE data)
MIGREG (data/regions.js, 27 governorates), MIGZONES (zones.js), MIGFAC (factories.js), REAL {news, events, market, awards, tenders, tenders_intl} (real.js), MIG.PROJECTS (projects.js), REG (registry.js), MIGOFFERS (offers.js), MIGOLDFAC / MIGOLDP / MIGTEND / MIGRFQ / MIGSUP (old Egypt site data), MIGVIDS (videos.js). Research JSON for facts: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/eg/real/*.json (governorates, cities, zones, factories, events, news, projects, awards, market, tenders, offers, refs, legal, videos) — some may still be in progress. Old Egypt site scrape: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/eg/live/*.json and the page HTML files in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/eg/*.html (about.html = old «عن المنصة» page with vision/mission/services).

## Rules
- Facts must be real and verifiable; if you need a number you don't have, use a qualitative sentence instead of inventing it.
- Keep every element id/class/data-attribute and JS function name unchanged unless the spec requires otherwise; keep pages working (no JS errors).
- Keep MSA for site copy. Keep "Made in Egypt Gate" naming consistent.
- International platforms list (intl.html): include the UAE gate (منصة صنع في الإمارات – madeinuaegate.ae, logo img/pl-ae.png) and the Saudi gate (منصة صنع في السعودية – madeinsaudigate.com, logo img/pl-sa.png) plus the other existing gates; remove the Egypt gate from the list (we are it).
- UAE-specific sample content (UAE factories/brands as samples, ADX/DFM tickers, emirates, KEZAD/JAFZA, DEWA/ADNOC tenders, AED prices, ICV, Operation 300bn, We the UAE 2031, MoIAT, UAE laws, Dubai addresses, «الدولة» meaning UAE) must not remain. «الدولة» may stay when it means Egypt.

## Assets
- Removed (do not reference): img/ban-*.jpg, img/lg-comtech.png, img/rg-*.jpg (UAE emirate photos), img/cities/*, img/events/*, img/news/*, img/offers/*, img/onews/*, img/prj/*, img/yt/*, img/old/*, img/sultan.png, img/step-land.jpg. New Egypt images will be added under the same folder names by the data builders (img/gov/gv-<CODE>.jpg for governorates, img/cities, img/events, img/news, img/offers, img/yt, img/old for old-site sprites). Pages must read image paths from data (e.g. MIGREG.img(code)), not hard-code UAE files.
- Available: img/logo-site.png (round Egypt logo), img/og-cover.jpg, img/about-poster.jpg, img/hassan.png, img/pl-ae.png, img/pl-sa.png, generic photos img/hero.jpg, hero-poster.jpg, m0–m4.jpg, e0–e4.jpg, p0–p7.jpg, v0–v5.jpg, cat-*.jpg.
- The sample factory profile (factory.html from factory-profile.html + PDET in site.py) must become a REAL Egyptian factory from research factories.json (only real public facts; no fabricated KPI numbers).

## Admin dashboard
No admin dashboard (admin.part.py is not executed; do not link admin.html). The factory dashboard keeps its username/password login gate (demo account efg-demo / Uae@2026 must be changed to egy-demo / Egypt@2026 with the matching SHA-256 hash).
