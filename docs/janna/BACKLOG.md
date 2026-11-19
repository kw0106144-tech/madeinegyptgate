# متطلبات صاحب المنصة اللي لسه هتتركّب في مرحلة الدمج النهائي (جنة + باسم)

1. **الترجمة المكتوبة (Subtitles)** — تم: `data/captions.js` على كل الصفحات والكيوسك (كلام المتصفح + المكالمات اللايف + `MIGCAPTIONS.show` للفيديوهات). الباقي: ربط فيديوهات الترحيب بيها.
2. **«بيفتح المنصة ويعرضله شغله وهو بيتكلم»** — جنة وباسم (اللايف والمحلي) وهم بيتكلموا بيفتحوا الصفحات/العناصر ويعرضوا اللي بيعملوه على الشاشة خطوة بخطوة (شاشة جنة/باسم + تمييز العنصر + شريط «باسم بيعمل دلوقتي: …»).
3. **«أي حاجة بيعملها تتبعت على الإيميل أو الواتساب»** — سجل نشاط لكل محادثة (بحث، فتح صفحة/عنصر، ملء طلب، صفقة، إيميل، اجتماع) وملخص بيتبعت في آخر المحادثة على الإيميل وعلى الواتساب (Cloud API لو متفعّل، وإلا رابط wa.me برسالة جاهزة). للزائر بعد ما يدّي إيميله/رقمه (موافقة)، وللعميل المشترك على بيانات حسابه. نفس الكلام لجنة.
4. **فيديوهات الترحيب بالصوت الحقيقي** — Anam avatar videos: باسم عربي (بيتعمل)، جنة عربي + إنجليزي (بعد ما أفاتارها يجهز). تتحمّل وتتحط في `media/` وتشتغل في شاشة الترحيب (صامتة + ترجمة لحد أول لمسة).
5. **«جنة» و«باسم» بيكلموا الزائر بالصوت أول ما يدخل** (مش قايمة خدمات مكتوبة): الشخصية تتكلم فوراً بالشفايف والترجمة، وأول لمسة يشتغل الصوت، وزرار واحد كبير «اتكلم مع جنة/باسم» يفتح المكالمة اللايف.
6. **وصول كامل لكل حاجة في المنصة** للايف: أدوات Anam إضافية (فتح عنصر بالاسم/المرجع: شركة، مناقصة، طلب، خبر، معرض، عرض، مدينة، محافظة؛ ولباسم: ملخص الفرص، فتح صفقة، تجهيز إيميل) + ربط `janna_lookup` بعد رفع السيرفر.
7. «باسم» للشريك الأساسي والاستراتيجي فقط + ترقية من «جنة» للباقات الأقل.
8. لينكدإن في الفوتر — تم.
9. **«جنة» أكبر شوية وتتحرك بفعالية** — حجم أكبر في المكان الثابت (حوالي 60vh على الكمبيوتر بدل 48vh، ومش بتغطي المحتوى المهم) + حركة حيّة أكتر: ميلة راس خفيفة وهي بتتكلم، تمايل وزن الجسم، إيماءات بالجسم مع الجمل (قدّام/ورا)، دخول بمشية للشاشة، نبضة إضاءة لما تتكلم، وتبص ناحية الفقاعة. نفس الكلام لـ«باسم» بدرجة أهدى (مستشار).
10. **«باسم» عارف العميل ببياناته ويناديه باسمه ولقبه** (أستاذ/دكتور/مهندس/مدام… حسب المسجّل) — ولـ«جنة» لما الزائر يقول اسمه تناديه بيه:
   - التسجيل: إضافة «اللقب» لبيانات مسؤول الحساب (أستاذ، دكتور، مهندس، لواء، مستشار، مدام، آنسة…) + الاسم.
   - المحلي (bassem.js / janna.js): التحية والكلام باسم العميل ولقبه («أهلاً يا دكتور أحمد»)، وجنة تحفظ الاسم أول ما الزائر يقوله وتستخدمه في كل الصفحات.
   - اللايف: Worker endpoint `POST /api/anam/session` يعمل session token بـ ANAM_API_KEY (سري على السيرفر) ببرومبت وتحية مخصصين ببيانات العميل (الاسم، اللقب، الشركة، الباقة، الأيام المتبقية، القطاع، الصفقات المفتوحة)، والصفحة تستخدم Anam JS SDK بدل الويدجت (registerToolCallHandler بنتايج حقيقية، addContext بالصفحة الحالية واللي على الشاشة).
11. **«باسم» هو اللي بيعمل كل حاجة بنفسه** (مش بيشرح ويسيب العميل) — أدوات Anam اتعملت واتربطت بشخصية باسم، والمطلوب في الدمج: handlers في `janna-live.js` (لما `JANNA_LIVE.persona === "bassem"`) بتشغّل صفحة `advisor.html` عن طريق دوالها الموجودة:
   - `bassem_open_opportunity {query, market, kind}` → يفتح advisor.html لو مش مفتوحة، يكتب في `#advQ`، يفتح أنسب فرصة (درج الفرصة + دليل التعاقد).
   - `bassem_start_deal {query, next_action, due_date}` → `startDeal(uid)` ثم patch للخطوة الجاية وميعادها.
   - `bassem_draft_email {deal, to, subject, body, language, purpose}` → `openDeal(id,"mail")` ويملا `#mTo #mSub #mBody #mLang` (ماينفعش إيميل مستلم مش موجود في الفرصة).
   - `bassem_send_email {deal}` → يضغط `#mSend` (بعد موافقة العميل بس).
   - `bassem_update_deal {deal, stage, next_action, due_date, note, reminder_date}` → `setStage` + patchDeal + تذكير.
   - `bassem_open_guide {topic}` → يفتح دليل التعاقد للسوق/الجهة من `ADVISOR_GUIDES`.
   - `bassem_notify_member {message, channel}` → Worker `/api/advisor/notify` (إيميل Resend + واتساب Cloud API أو wa.me).
   - كمان عنده janna_fill_rfq / janna_fill_contact / janna_submit_form / janna_navigate / janna_search.
   - كل أداة: تمييز العنصر على الشاشة + شريط «باسم بيعمل دلوقتي: …» + تسجيل في سجل النشاط. نفس السلوك لـ`bassem.js` المحلي (بدون لايف).
   - Tool IDs: open_opportunity 99561b78، start_deal 3fd11ab3، draft_email 9286b2c5، send_email a00e4d99، update_deal f2b6a430، open_guide 6dd62e5e، notify_member 325b182c.
12. **الترحيب والسؤال عن الحال** — اتعمل في شخصيات Anam الثلاثة: «إزي حضرتك؟ وأخبارك إيه النهارده؟» ← «الحمد لله»: «يا رب دايماً دايماً بخير وسلامة» ← «متضايق»: «ألف سلامة… إحنا معاك، وإن شاء الله نحاول نبسطك ونساعدك». المطلوب في الدمج: نفس الحوار في المحركات المحلية (janna.js / bassem.js) بأزرار سريعة «الحمد لله تمام» / «مش أحسن حاجة النهارده».
13. **«باسم» يبعت صباح الخير كل يوم على الواتساب ويتصل في الميعاد** (طلب صاحب المنصة):
   - Worker cron كل 15 دقيقة: لكل عضو شريك أساسي/استراتيجي نشط وموافق على الواتساب ووصل ميعاد رسالته (افتراضي 09:00 بتوقيت القاهرة، والعضو يغيّره مع باسم بأداة `bassem_set_work_time` id 96ea605d) → رسالة WhatsApp Cloud API (Template «bassem_morning» لازم يتوافق عليه من Meta لأنها رسالة بتبدأ من المنصة):
     «صباح الخير يا {{اللقب والاسم}} ☀️ أنا باسم، مستشارك في منصة صنع في مصر. يا رب تكون بخير وصحتك تمام النهارده. الجديد عندك النهارده: {{عدد}} فرص في {{القطاع/الأسواق}} — أهمها: {{أهم فرصة}}. تحب نشتغل سوا إمتى النهارده؟» + أزرار رد سريع: «دلوقتي» / «الضهر» / «بالليل» / «مش النهارده».
     لو مفيش جديد حقيقي: «النهارده مفيش جديد في قطاعك، بس عندنا متابعة: {{الخطوة الجاية في صفقة}}» — ممنوع أرقام مش حقيقية.
   - Webhook الواتساب: رد العميل (زرار أو كلام) → يتسجّل ميعاد الشغل؛ «إيقاف» → يوقف الرسايل؛ لو كتب إنه تعبان/متضايق → رد إنساني («ألف سلامة عليك… ليه بس؟ إيه اللي مزعلك؟») وإشعار لفريق المنصة.
   - **الاتصال في الميعاد**:
     - المرحلة 1 (جاهزة للتنفيذ): في الميعاد باسم يبعت «أنا جاهز يا دكتور أحمد، اضغط هنا ونتكلم فيديو» → لينك دخول بتوكن (advisor.html#login=…&live=1) يفتح مكالمة فيديو مع باسم الحي ببيانات العميل.
     - المرحلة 2 (اتصال حقيقي بيرن): WhatsApp Business Calling API (اتصال من رقم المنصة للعميل بعد إذنه) + وكيل صوتي بصوت باسم (LiveKit/Pipecat + نفس البرومبت والأدوات) — صوت بس من غير صورة. محتاج: رقم المنصة على WhatsApp Cloud API (أو Coexistence مع تطبيق واتساب بيزنس)، توثيق Meta Business، تفعيل الـCalling، وسيرفر صوت.
     - بديل: Anam meeting invite — باسم يدخل اجتماع Google Meet/Zoom بالفيديو في الميعاد (مدفوع لكل دقيقة).
   - **قرار صاحب المنصة:** رسالة الصبح الساعة 09:00 بتوقيت القاهرة **كل يوم** (زي طلبه الأصلي «كل يوم الصبح»)، وكل عميل يقدر يغيّر الميعاد أو الأيام مع باسم أو يوقفها.
14. **من تقرير ورك فلو باسم + الاجتماعات (خلص، 58/58 تست السيرفر):** باقي للدمج:
   - `memberOut` في worker/src/advisor.js يرجّع `activated_at` (+ عمود في D1) علشان أيام الـ365 تتحسب من يوم الدفع على أي جهاز.
   - تاب جديد بعد دخول برابط التفعيل مافيهوش باسم (mig-auth في sessionStorage).
   - الصفحات الإنجليزي على 1366px بتعمل سكرول أفقي 52px (أزرار الهيدر .hdr-acts / International Platforms) — مشكلة عامة تتصلح.
   - meeting.html فيها سكرول أفقي (6 حالات) — تتصلح.
   - قبل النشر: R2 bucket + فك تعليق [[r2_buckets]] MEDIA، أسرار MEETINGS_SECRET وANAM_API_KEY (وTURNSTILE_SECRET اختياري)، وتشغيل migration 0003_meetings_security.sql.
15. **الواتساب هيتربط عن طريق respond.io** (صاحب المنصة عنده حساب Growth trial لحد 25 نوفمبر 2026) بدل 360dialog/Meta مباشر:
   - Worker يبعت عن طريق respond.io Developer API (Bearer token سري: RESPONDIO_TOKEN في أسرار Cloudflare) — رسايل القوالب bassem_morning / bassem_call_ready / bassem_update + الردود في شات الـ24 ساعة. (اتأكد من شكل الـ endpoints من docs respond.io وقت التنفيذ.)
   - Webhook من respond.io (Integrations ← Webhooks) على رسالة جديدة → Worker `/api/advisor/wa-webhook` (رد الأزرار، «إيقاف»، «متضايق»).
   - القوالب تتقدّم من respond.io (قناة الواتساب ← Templates) أو WhatsApp Manager.
   - لازم الباقة المدفوعة تفضل شغالة بعد التجربة وإلا الربط يقف.
   - **القوالب اللي صاحب المنصة قدّمها فعلاً على respond.io (قناة 580384، ar_EG، Marketing، كلها فيها call_permission_request وفوتر EAFID-SUPPORT):**
     - `bassem_morning`: «صباح الخير {{1}}  طمني علي صحة حضرتك» ({{1}} = اللقب والاسم)
     - `bassem_call_ready`: «حضرتك فاضي اتصل بيك عشان في مناقصة مهمه» (من غير متغيرات)
     - `bassem_update`: «لقيت فرصة مهمة وعاوز اعرضها علي حضرتك» (من غير متغيرات)
     - التدفق: القالب يتبعت الصبح ← العميل يرد ← يتفتح شات 24 ساعة ← باسم يبعت رسالة عادية فيها جديد النهارده الحقيقي وأسأله على ميعاد الشغل/الاتصال. إذن الاتصال من القالب بيسمح بمكالمة واتساب من الرقم.
16. **Cloudflare:** التوكن شغال. الدومين madeinegyptgate.com على Cloudflare (active، Free، zone 394786ba84adf85eca52354fa2ffd7da، account 88c77c2b7595dd0ce510270175f69143). الموقع الحالي A → 46.202.158.210 (Hostinger) proxied؛ الإيميل على Hostinger (MX srv2142320.hstgr.cloud) + Brevo + Amazon SES + Resend (resend._domainkey موجود). **ماتلمسش سجلات الإيميل.** النقل للنسخة الجديدة = Pages project + تحويل الجذر/www بموافقة صاحب المنصة.
17. **خطة المنصة التفاعلية:** docs/janna/INTERACTIVE-PLAN.md (Phase A: A0 نشر + تنضيف البيانات الوهمية وحقول الكارت، A1 حسابات حقيقية بكود إيميل، A2 محرك الطلبات، A3 تتبع حقيقي، A4 صندوق وارد للأدمن ودورة الردود بالإيميل، A5 متابعة/حفظ/تنبيهات، A6 جرس إشعارات، A7 جنة كطبقة تنفيذ، A8 إحصائيات حقيقية).
18. **قرارات صاحب المنصة النهائية للمنصة التفاعلية (اتبنت عليها المرحلة الأولى):**
   - الطلبات بتتوزّع **تلقائي** على المصانع المسجّلة على المنصة (الأساسية وفوق، والمميزة وفوق ليهم أولوية)، وتتبعت بالإيميل والواتساب. أرقام المصانع الشخصية ماتظهرش. المصانع اللي مش مسجّلة ماتتبعتلهاش حاجة.
   - الدخول بكود على الإيميل، وبعدين كود على الواتساب.
   - كل الباقات تشوف المناقصات وطلبات الأسعار والترسيات وأخبار المشاريع والفرص وبيانات الموردين والمقاولين. **الفرق بين الباقات هو النطاق الجغرافي**: بيانات فقط والأساسية = مصر، المميزة + الخليج والعربي، الشريك الأساسي + أفريقيا، الاستراتيجي = كل الأسواق.
   - أي حاجة مش مؤكدة تتشال (مش تتعلّم «توضيحي»).
   - **مفيش عنصر بشري**: كل الردود والتواصل تلقائي، وصندوق الأدمن للمتابعة بس.
19. **(بعد المرحلة الأولى) لو مفيش مصنع مسجّل مناسب للطلب:**
   - إشعار فوري للأدمن (لوحة + إيميل TEAM_EMAIL).
   - بحث تلقائي عن مصانع تقدر تنفّذ: من دليل المنصة (المصانع غير المسجّلة، للأدمن بس) + بحث ويب (لو اتضاف مفتاح بحث)، وقائمة مرشّحين بالمصدر.
   - الأدمن يتواصل مع المصنع بنفسه ويرتّب معاه.
   - العميل يوصله تلقائي «جاري معالجة طلبك».
   - زرار في لوحة الأدمن «إحنا اللي هنرد»: الأدمن يرد على العميل من اللوحة، والرد يوصله إيميل/واتساب ويظهر في التتبع.
20. **SEO:** هدف أعلى ترتيب ممكن (مفيش حد يقدر يضمن رقم 1). ورك فلو بحث (فحص تقني + كلمات بحث مصرية + المنافسين) شغال → بعده بناء:
   - لينكات حقيقية قابلة للفهرسة لكل مصنع/مناقصة/صفحات قطاع×محافظة من بيانات حقيقية.
   - طبقة SEO على الحافة (Pages Function + KV) يعدّلها الأدمن من غير إعادة بناء.
   - مساحة SEO للأدمن: تقييم الصفحات، تعديل العنوان والوصف، معاينة جوجل، التحويلات 301، الإرسال لمحركات البحث (IndexNow).
   - خطوات Google Search Console وBing.
   - **الدخول:** صاحب المنصة أكّد «كود على الإيميل، وبعدين على الواتساب».
21. **من تقرير ورك فلو حضور جنة (خلص):** للدمج:
   - janna-live.js يضيف `JANNA_LIVE.intents=["meeting"]` ودعم `open({intent:"meeting"})` → كارت الاجتماع يرجع لوحده.
   - زرار «جنة لايف» الجانبي اتخبّى بـ CSS في janna.js (الا في dashboard/advisor/meeting).
   - `JANNA._dbg` يتشال قبل النشر.
   - **وش جنة مختلف:** الشخصية على الموقع (صورة البليزر اللبني من صاحب المنصة) ≠ الفيديو الحي (Yasmin — اللي صاحب المنصة اختارها). محتاج قرار: نوحّدهم على مين.
22. **تأكيد صاحب المنصة: «شيل اي رقم مش حقيقي».** قبل النشر: مسح نهائي لكل الصفحات (عربي/إنجليزي) + data/*.js + كلام جنة وباسم والإيميلات: أي رقم أو إحصائية أو نشاط لازم يتحسب من البيانات الحقيقية أو من مصدر مذكور، وإلا يتشال. الأرقام الثابتة في الصفحات (عدادات الرئيسية، «+26 ألف»، أعداد المحافظات/القطاعات) تتحسب من الداتا وقت البناء مش مكتوبة باليد.
23. **Cloudflare جاهز للنشر (اتعمل):** D1 `migate-db` uuid f86e00bb-9739-4985-a149-3dddb45b2b42 (EEUR)، KV `migate-seo` id b321fb348f3447179c99b4380952e5ac، workers subdomain daily-spoonbill.workers.dev. Pages project لسه (يتعمل وقت أول deploy باسم madeinegyptgate). **R2 محتاج تفعيل من الداشبورد** (صاحب المنصة). Email Routing على الزون: التوكن بيرجّع Authentication error → محتاج صلاحية Zone «Email Routing Rules» (أو Zone Settings) لو هنستقبل ردود inq-<ref>@reply.
24. **التوكن بقى Full access** (نفس التوكن b8a42315…). R2 لسه «enable from dashboard» → المنصة تشتغل من غير R2: تسجيلات الاجتماعات لينك Anam (30 يوم) لحد التفعيل. **Email Routing: قرار ماتتفعّلش** (ممكن يكسر MX بتاع Hostinger) → رد المصنع على الطلب يبقى بلينك آمن (magic link موقّع HMAC) لصفحة رد/عرض سعر من غير دخول، والإيميل نفسه Reply-To no-reply. لازم الدمج يطبّق ده بدل inq-<ref>@reply.
25. **شاشة الفيديو الحي أكبر (طلب صاحب المنصة):** في janna-live.js خلي شاشة مكالمة جنة/باسم كبيرة وواضحة: على الكمبيوتر حوالي 70–80% من ارتفاع الشاشة (أو وضع ملء الشاشة بزرار)، والموبايل تقريباً ملء الشاشة؛ وخلفية الأوفرلاي = صورة المكتب `scratchpad/bg/office-final/backdrop-1920.jpg` (تتنسخ لـ img/office-backdrop.jpg). الشاشة الجانبية (شاشة المنصة اللي بيفتحوا فيها) تفضل جنبها أو تحتها من غير ما تصغّر الفيديو.
26. **أفاتار المكتب:** Janna 831f104a-59fe-407e-a3b2-d11bd4f3aa02 (cara-4)، Bassem 42d59f60-ab6b-4561-8291-17da26bd95dd — من صور office-final (صاحب المنصة وافق). بيتحطوا على الشخصيات أول ما يجهزوا؛ لو الجودة وحشة نرجع لياسمين الأصلية 7d2b41a0 / باسم 6a54f79c.
27. **R2 اتفعّل واتعمل bucket `migate-media` (EEUR)** → binding MEDIA في wrangler.toml وقت النشر؛ تسجيلات الاجتماعات تتحفظ فيه.
28. **قرار صاحب المنصة عن الأرقام:** «اتعامل علي الداتا اللي موجود وفلترها ونسقها ونضفها» → رقم 26,808 / 14,820 / 11,988 يتشال من كل مكان (الرئيسية، عن المنصة، i18n، قاعدة المعرفة، برومبت جنة وباسم) ويتحط بداله العدد المحسوب من البيانات (ورك فلو تنضيف البيانات بيطلع COUNTS.json وTEXT-FIXES.md في scratchpad/dataclean/). لازم كمان تحديث قاعدة المعرفة على Anam وبرومبتات الشخصيات بالأرقام الحقيقية.

## 29. Personas updated with the real counts (2026-11-18 02:23 UTC)
- Janna AR (5f06d835), Janna EN (e5101653) and Bassem (19ef9078) prompts now use only real counts: more than 3,000 establishments (about 1,380 factories + 1,546 companies & suppliers, 26 governorates); "never say 26,000".
- They also describe the new automatic flow: matching RFQs go to registered members (basic+, premium first); the «جاري معالجة طلبك» no-match path; geographic scope per plan; the payment gateway "still being set up" wording that register.html uses; e-mail-code sign-in.
- Explicit ban on invented emotion tags ([smile]). Bassem's greeting is limited to «أهلاً / أهلاً بيك / نوّرت».
- New client tools: janna_track (a5eaf125) and janna_follow (3f43d0f1), handled in data/janna-live.js. Janna AR/EN have both; Bassem has janna_follow.
- AFTER the Worker is deployed: attach the existing SERVER_WEBHOOK tool janna_lookup (29fd5087, https://madeinegyptgate.com/api/janna/lookup) to Janna AR/EN, so she can read real directory results aloud. Its section enum is masked in the tool listing, so check it against worker/src/lookup before attaching.
- KB files regenerated from the cleaned data (docs/janna/kb, kb-upload). The Anam knowledge folder b8113c0c is still EMPTY and not attached; uploading needs the owner's OK (upload allowance), and the prompts plus janna_lookup make it optional.

## 30. Cloudflare token lost access to the madeinegyptgate.com zone (checked 02:40 UTC)
- The token (proxy secret "Cloudflare deploy token") verifies as active and still has the account-level resources of 88c77c2b (D1, Pages, subscriptions).
- BUT `/zones` lists only eafid.org (account 518f…), and `zones/394786ba…` returns 9109 Unauthorized; dns_records returns 10000.
- This blocks the deploy: the Worker routes on the zone, the Pages custom domain and the DNS switch.
- Fix (owner, in the dashboard): My Profile → API Tokens → Edit this token → Zone Resources → Include → Specific zone → madeinegyptgate.com (or All zones). Editing keeps the same secret, so nothing has to be re-sent.

## 31. Email sending provider
- The account already pays for **Workers Paid** ($5/month), so Cloudflare Email Sending (beta) is available: arbitrary recipients, 3,000 emails/month included, then $0.35 per 1,000.
- The Worker already supports it through the `SEND_EMAIL` binding (`[[send_email]] name="SEND_EMAIL" remote=true`).
- Onboarding the domain adds only NEW records: cf-bounce MX/SPF, a DKIM selector, and `_dmarc` only if it is missing. The root MX on Hostinger and the existing SPF/DKIM stay untouched. Do NOT enable Email Routing.
- Alternative: Resend. resend._domainkey already exists, so the owner may already have a Resend account; that route needs RESEND_API_KEY as a Worker secret.
- Plan: once zone access is fixed, POST /zones/{zone}/email/sending/subdomains {name:"madeinegyptgate.com"}, check its DNS records (GET …/dns), add them, and add the send_email binding in wrangler.toml.

## 32. E-mail via Resend works (09:01 UTC)
- The owner's Resend account has madeinegyptgate.com **verified**: domain id a1c774e3-dc38-4d3b-90a9-7bdb7625c1d4, eu-west-1, DKIM resend._domainkey plus SPF CNAMEs rsend/send.
- One test e-mail went from «منصة صنع في مصر <noreply@madeinegyptgate.com>» to info@madeinegyptgate.com → **delivered** (id 01a1ede3-bbb6-7ad6-a05e-653d5ffce07a).
- At deploy: create a SENDING-ONLY Resend key restricted to this domain (POST /api-keys {permission:"sending_access", domain_id}) and pipe it straight into `wrangler secret put RESEND_API_KEY`. Never print it.
- The full-access key stays only in the proxy secret.

## 33. The LIVE system (see docs/janna/legacy-live/README.md)
- The mis-egypt Worker proxies the domain to the Hostinger temp domain /egypt plus the PHP API; panel.html is the owner's current admin.
- Decision: rebuild panel.html at the same URL on the new system, add every new section, import the old data with the in-panel tool, and proxy /api/index.php so the old system stays reachable.
- At switch: remove only mis-egypt's two zone routes (keep the script), with a rollback command.

## 34. Firewall installed (owner: «ركب جدار حمايه متكامل … firewall محدث بشكل لحظي») — see docs/janna/SECURITY.md
- Zone hardening: HTTPS + TLS 1.2 + HSTS, managed security headers, Cloudflare Managed Free Ruleset (auto-updated by Cloudflare), 5 custom rules, a rate limit, and the IP list migate_blocklist (2,320 threat-intel entries).
- Worker migate-shield is deployed with cron */15. It waits for the owner's CF_LISTS_TOKEN secret.
- Verified: live site 200, panel.html 200 for normal visitors (challenged from cloud ASNs), wp-login/.env → 403, the PHP API still answers.
- Deploy 2 adds: CSP headers, Worker auto-ban to KV, Turnstile, optional Access.

## 35. OWNER: the 91 MIGFAC companies ARE verified (2026-11-18 ~09:50)
- Owner: «ال ٩١ مصنع موثق دول احنا وثقناهم يدوي اللي هما عملائنا».
- The 91 companies in data/factories.js (MIGFAC: جهينة، إيديتا، دومتي، فرج الله…) were verified manually by the platform team and are its clients. Keep «91 مصنعاً موثّقاً» and the verified badge, and never label them public-source or unregistered.
- The «مصادر عامة» label applies only to the facx.js-own researched rows that are not in MIGFAC. The 2,926 imported members (MIGOLDFAC) have no verified status.
- TODO after deploy 1: update the Janna AR/EN and Bassem prompts (today they say the big factories come from public sources and are not members) → «91 مصنع وشركة موثّقين من فريق المنصة».
- Also tell the deploy-2 ACC builders: companies get a "verified by platform" flag, preset for those 91.

## 36. DEPLOY 1 LIVE (2026-11-18 11:28 UTC)
- Owner approved the temporary upload relay («موافق علي السيرفر الوسيط»). Worker `migate-cfrelay` (workers.dev only, forwards ONLY
  POST /client/v4/pages/assets/{check-missing,upload,upsert-hashes} with a Pages upload JWT; holds no secret). Local patched wrangler copy:
  scratchpad/wrangler-relay (env MIG_ASSETS_RELAY routes only /pages/assets/* through the relay). DELETE the relay after deploy 2.
- Pages production deployments: a23f82df (11:04 build) → d984ecd2 (EN ?lang=en links fix). Smoke 71/71 each.
- Pages secrets set: ADVISOR_SECRET, SEO_PLATFORM_KEY (values from secrets.env, never printed).
- DNS: apex A 46.202.158.210 and www CNAME → proxied CNAME madeinegyptgate.pages.dev (backup build/deploy-logs/dns-backup-20261118T111346Z.json).
  Mail records untouched. Rollback: deploy.sh dns-rollback.
- Redirect rule www → apex 301 now skips /.well-known/ (Pages www validation needed it). Always Use HTTPS on.
- Cutover: 12 mis-egypt routes keep the owner's OLD admin (/panel.html, /login.html, /api/index.php*, /data/{auth,me,egadm}.js on apex+www);
  catch-alls removed. Rollback (instant): deploy/deploy.sh cutover-rollback --yes.
- Live smoke 79 pass / 3 "fail" = WAF working as designed (managed challenge for cloud IPs on admin pages, xmlrpc 403 instead of 410).
- Post-deploy checks: pages.dev crawl AR 985 checks 0 defects, edge 516 checks 0 defects, EN 1 medium (fixed, live). Live browser checks:
  HIGH phone menu not scrollable + medium Janna EN/mobile sheet/EN links → hotfix workflow running.

## 37. Daily intelligence pipeline LIVE (migate-intel)
- Worker migate-intel (D1 migate-intel, KV MIGATE_INTEL_KV, Workers AI, crons 0 */2, 30 */6, 15 3). Routes madeinegyptgate.com/api/intel/* and
  /intel/* (+www). 146 sources registered, 56 enabled (54 OK in first cycle), 1,142 items; 22 more adapters being written (workflow).
- AI cap 400 items/day (llama-3.3-70b fp8-fast) ≈ $0.10–0.35/day (estimate). Admin hide API used once («كيما»).
- Honest gaps (no open feed / bot walls / terms): etenders.gov.eg (resets non-Egyptian IPs), Etimad, Dubai eSupply, Kuwait CAPT, Monaqasat,
  UNGM, AfDB, ADB tenders, India CPPP; Bahrain Tender Board needs written permission; MEED/Zawya paid.
- Bassem: new Anam SERVER_WEBHOOK tool bassem_intel (1aef2a57-a4bd-4663-abd1-46190a995204) → POST /api/intel/tool; prompt section
  «مركز المعلومات اليومي» + 91-verified sentence added (BACKLOG 35 done for Janna AR/EN + Bassem).

## 38. Backups
- R2 bucket migate-backups: migate-src-20261118T1054Z.tar.gz, migate-scratch-20261118T1058Z.tar.gz (verified). wrangler needs
  CLOUDFLARE_API_TOKEN=proxy-injected (placeholder; the proxy injects the real token).
