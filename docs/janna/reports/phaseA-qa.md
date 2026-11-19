### journeys
## تقرير QA: رحلات المستخدم كاملة على Worker محلي حقيقي

### الإعداد
- **الـWorker:** `src/index.js` نفسه شغّال على `wrangler dev --local` (4.164.0) على البورت 8797، مع D1 محلي مطبّق عليه `schema.sql` (الملف الكامل للقاعدة الجديدة)، والـcron شغّال.
  - بورت 8787 ماستخدمتهوش عشان ماتصطدمش مع وكيل QA تاني ممكن يكون شغّال عليه.
  - حطّيت wrapper في الـscratchpad بيعترض استدعاءات Resend وrespond.io ويخزّنها، وبيعرض `/__qa/*` للفحص. ولا ملف في المشروع اتعدّل.
- **الموقع:** شغّلته بنفس المصدر (same-origin) على بورت 8880 من `site/` الحالي، وعلى بورت 8881 من نسخة متجمّعة في الـscratchpad فيها سطري الدمج: `mig-api.js` في كل صفحة و`inbox.html`.
- **الوضع الحرفي المطلوب (الموقع على :8780 + `MIG_API_BASE`):** جرّبته كمان، والدخول والمتابعة وطلب عرض السعر اشتغلوا cross-origin.
- **الإيميل الوارد:** اتعمل محاكاة له عن طريق `/cdn-cgi/handler/email`.
- **الأدوات:** Playwright بـ Chromium، 1366 و390px، عربي وإنجليزي.
- **النتيجة:** 117 PASS. بعض الـFAIL في اللوجات كانت أخطاء في سكربتات الاختبار نفسها، واتعادت. اللي تحت مشاكل حقيقية بس، متأكد منها، ومرتبة حسب الخطورة.

---

### مشاكل مؤكدة

**1. [عالي] زرار «قدّم عرض سعر» في كل إيميل يوصل للمصنع مكسور**
- **الملفات:**
  - `worker/src/inquiries.js:194` و`:377-378`
  - `worker/src/digest.js:80,85`
  - `dash.part.html:350` (`fromHash`)
- **خطوات الإعادة:** ابعت طلب عرض سعر من `company.html#13`، وبعدين افتح إيميل المصنع (`j1-mails`).
- **اللي حصل:**
  - الرابط `https://madeinegyptgate.com/dash.html#incoming=MIG-26-…` بيدّي 404، لأن الصفحة اسمها `dashboard.html`.
  - نفس الرابط موجود في تذكير الـ48 ساعة، ونص الواتساب، وإشعار ورابط إيميل ملخص المتابعات (`dash.html#follows`).
  - حتى `dashboard.html#incoming=<ref>` بيفتح «نظرة عامة» مش «طلبات واردة لي».

**2. [عالي] تبويب «طلبات واردة لي» مختلف عن الـAPI**
- **الملفات:** `dash.part.html:252-263` (`incRow`) و`worker/src/me.js` (`respond`، حوالي سطر 196).
- **السبب:** الواجهة بتقرا `x.my_status` و`x.payload.quantity` و`x.routed_at`، والسيرفر بيرجّع `status` و`quantity`/`product` على المستوى الأعلى و`received_at`.
- **خطوات الإعادة:** المصنع f2 يدخل، وبعدين «طلبات واردة لي» ويبعت عرض.
- **اللي حصل:**
  - البند يفضل «جديد» وفورم العرض فاضي ظاهر تاني (`j3-04-incoming-after-quote.png`).
  - الكمية والمنتج مش ظاهرين.
  - عنوان البند هو اسم المصنع المنافس اللي المشتري كان قاصده.
  - السيرفر قَبِل عرض تاني من نفس المصنع: جدول `quotes` فيه صفّين، والمشتري جاله إيميلين «عرض سعر جديد».

**3. [عالي] جنة المحلية (`janna.js`) بتوزّع الطلب على مصانع غلط، وبتقول إن فيه مشكلة بعد إرسال ناجح**
- **السبب:**
  - `pages.part.py:464` ضاف `<option value="">اختر القطاع` في أول `#r-s`. النسخة الاحتياطية بتاعة 00:26 ماكانش فيها الخيار ده.
  - `janna.js` (`setField`) بيختار بالـ`selectedIndex`، فكل قطاع بيتزاح خانة.
- **خطوات الإعادة:** على `contact.html` كمستخدم داخل، شغّل `JANNA.rfq()` وجاوب «البلاستيك والتغليف» للقطاع وكمّل.
- **اللي حصل:**
  - الطلب MIG-26-P2V4GV اتسجّل بقطاع «الصناعات الغذائية»، ووصل لمصنع أغذية (f3).
  - بعد إرسال ناجح (اتبعت لـ3) جنة قالت «فيه حاجة محتاجة تتظبط في الفورم 🙏» وعرضت «أبعته» تاني. السبب إنها بتدوّر على `#rfq-form .okbox2` اللي اتشال (`j6b-01`).
- **ملحوظة:** `janna.js` ملك وكيل تاني. الإصلاح ممكن يبقى من ناحية `pages.part.py`.

**4. [عالي] رابط باسم «أنا جاهز… ونتكلم فيديو» مابيفتحش مكالمة، وغير المسجّل بيتحوّل لصفحة التسجيل**
- **الملفات:**
  - `worker/src/whatsapp.js:205` (و`:157`)
  - `data/janna-live.js:170` (بيقرا `?live=1` من الـquery بس، وبيفتح جنة مش باسم)
  - `site.py` GATES `'advisor'`
- **خطوات الإعادة:** رد على الواتساب بـ«الساعة 3»، وبعدين شغّل الـcron الساعة 15:05.
- **اللي حصل:**
  - النص فيه `advisor.html#live=1` من غير توكن دخول. الـbacklog 13 كان طالب `advisor.html#login=…&live=1`.
  - من موبايل مش داخل: بيروح `register.html#partner`.
  - شريك داخل: مفيش أوفرلاي فيديو خالص (`j11-*`).
  - كمان أي شريك مش داخل بيفتح `advisor.html` من إيميل باسم بيتحوّل للتسجيل، من غير زرار «ادخل بكود» (`j5-01`).

**5. [متوسط-عالي] إلغاء الاشتراك في «الطلبات الواردة» مالوش رجوع**
- **الملفات:**
  - `worker/src/ev.js:47` (النص)
  - `worker/src/inquiries.js:166`
  - `me.js` (PATCH مابيقبلش `inbox_paused`)
  - `admin.js` (`setMember` مابيمسحش `unsubscribes`)
- **اللي حصل:**
  - ضغطة واحدة على رابط الإلغاء (أو One-Click بتاع Gmail) بتوقف وصول الطلبات للعضو المدفوع.
  - الصفحة بتقول «تقدر ترجّعها من إعدادات حسابك»، بس مفيش إعداد زي ده: `PATCH /api/me {inbox_paused:false}` بيرجّع 400.
  - حتى لما الأدمن يعمل un-pause (`inbox_paused=0`)، طلب بلاستيك جديد ماوصلش لـ f2، لأن صف الـ`unsubscribes` فاضل.

**6. [متوسط-عالي] تذكيرات مواعيد المناقصات المتابَعة عمرها ما بتشتغل من الواجهة**
- **السبب:** الـids اللي الواجهة بتخزّنها مش نفس اللي في فهرس الـWorker:
  - `opportunity.html` بيخزّن `ET003` / `IN<n>`. الـ`IN<n>` بيتبني من ترتيب البند في القايمة (`pages.part.py:96` و`data/regions.js:64` `MIGOID`).
  - `oldlists.part.py:96` بيخزّن `OT-<ref>` / `OR-<ref>`.
  - فهرس الـWorker فيه `eg-tnd-003` أو الـref الخام.
- **خطوات الإعادة:** تابع `eg-tnd-003` من صفحته، وبعدين شغّل الـcron يوم 2026-12-01.
- **اللي حصل:** صفر تذكيرات. ونفس المتابعة لما اتعملت بـ`eg-tnd-003` طلّعت التذكير (`j13d.log`).
- **وكمان:** روابط التنبيهات `tenders.html#<ref>` مابتفتحش المناقصة، لأن الصفحة مابتقراش غير هاش المحافظة (`oldlists.part.py:122`).

**7. [متوسط] أيام رسائل الصبح بتضيع والواجهة بتقول «اتحفظت»**
- **الملفات:** `dash.part.html:298` و`:381-382`، و`worker/src/me.js:129`.
- **السبب:** الواجهة بتبعت `"sat"…"fri"` والسيرفر مستني أرقام من 0 لـ6.
- **اللي حصل:**
  - اخترت الأحد–الخميس، فالسيرفر خزّن `days: []` ورسالة الصبح بتتبعت كل يوم.
  - الافتراضي `[0..6]` بيظهر كل الأيام غير متعلّمة، فلازم المستخدم يعلّمها كل مرة.
  - بعد أول حفظ كل الأيام بتظهر متعلّمة (`j5b-*`).

**8. [متوسط] أزرار المتابعة المخصصة ماتتغيّرش لـ«★ بتتابعه»**
- **الملفات:** `data/mig-api.js:282` (`paintFollows`) بيغيّر النص لـ`.mig-fbtn` بس، والأزرار دي مافيهاش الكلاس ده:
  - `company.part.py:68`
  - `winner.part.py`، `registry.part.py`، `projects.part.py`، `radar.part.py`، `oldlists.part.py`، `pages.part.py:164`، `factory-profile.html`
- **اللي حصل:** المتابعة بتتحفظ فعلاً على السيرفر، بس الزرار يفضل «☆ تابع». الضغطة التانية بتلغي المتابعة من غير ما المستخدم ياخد باله (`j2-02`).

**9. [متوسط] شاشة متابعة الأدمن مابتبيّنش التسليم**
- **الملف:** `inbox.part.py:90-91`.
- **السبب:** الشاشة بتقرا `email_status`/`wa_status`/`r.quote`، والـAPI بيرجّع `email_sent`/`wa_sent`، والعروض في مصفوفة `quotes` منفصلة.
- **اللي حصل:** عمودي الإيميل والواتساب «—» دايماً، مع إن D1 فيه `email_sent=1, wa_sent=1` (`j7-02`).

**10. [متوسط] إيميل المصنع بيعرض اسم المصنع المنافس**
- **الملف:** `worker/src/inquiries.js` (`sendRoute`/`summaryLines`، حوالي سطر 196).
- **اللي حصل:**
  - لما المشتري يوجّه الطلب لمصنع A، باقي المصانع بيجيلها عنوان الإيميل «طلب جديد…: <اسم A>» و«الموضوع: <A>»، بدل المنتج. ده بيكشف اختيار المشتري لمنافسيه.
  - المحافظة بتظهر كود «CAI».

**11. [منخفض-متوسط] مشتري بعت من غير حساب وبعدين سجّل بنفس الإيميل مابيجيلوش إشعارات**
- **الملف:** `worker/src/inquiries.js` (`buyerUpdate`: `notify` بيتبعت بـ`inq.user_id` بس).
- **اللي حصل:** الطلب بيظهر في «طلباتي»، بس الجرس مابيجيلوش حاجة على الردود اللي بعدها (0 ← 0).

**12. [منخفض-متوسط] المصانع مابيجيلهاش إشعار جرس**
- **الملف:** `worker/src/inquiries.js` (`sendRoute`).
- **اللي حصل:** مفيش إشعار لما طلب يتوزّع على المصنع أو المشتري يكتبله (f1 وصله 5 طلبات و0 إشعارات)، مع إن تبويب الإشعارات بيقول إنها بتشمل «طلب اتوزّع عليك».

**13. [منخفض] صفحة التتبع الإنجليزي بتعرض نصوص الأحداث بالعربي**
- **الملفات:** `pages.part.py` (بلوك track) و`data/mig-api.js:258`.
- **السبب:** الصفحة مابتبعتش `&lang=en`، مع إن الـAPI بيدعمه (`j1-06`).

**14. [منخفض] مفاتيح خام قدام المستخدم**
- **الملف:** `data/mig-api.js:142,151` (`STATUS`/`EVT`).
- **اللي حصل:**
  - الحالة «recorded» بتظهر كده في التتبع والأدمن (`j8-04`).
  - الحدث «buyer_message» بيظهر كعنوان (`j9-01`).
  - شرايح فلترة الأدمن ماحسبتش recorded: «الكل» 5 ومجموع الشرايح 4.
  - أيقونة `inquiry_*` في الجرس بتطلع «•» (`NIC:366`).

**15. [منخفض] رسالة الاعتذار بتوعد بحاجة مش بتحصل**
- **الملف:** `dash.part.html:365`.
- **اللي حصل:** الرسالة بتقول «بيوصل للمشتري تلقائي»، بس السبب بيتخزّن داخلي (`buyer_visible=0`) ومابيتبعتش.

**16. [منخفض] خيار واتساب للمشتري مالوش أثر**
- **الملف:** `data/mig-forms.js:69`.
- **اللي حصل:** خيار «ابعتولي تحديثات الطلب على واتساب كمان» بيتخزّن `consent_wa` وخلاص. الـbackend عمره ما بيبعت واتساب للمشتري.

**17. [منخفض] باسم بيقول «✅ اتبعتت على الإيميل والواتساب» ورسالة العضو ماوصلتش واتساب**
- **الملف:** `worker/src/advisor.js:524`.
- **اللي حصل:** برّه شباك الـ24 ساعة، الواتساب وصّل قالب «لقيت فرصة مهمة…» العام بس، مش الرسالة اللي العضو طلبها.

**18. [منخفض] «ميعاد الشغل مع باسم» في اللوحة مالوش أثر**
- **الملف:** `worker/src/whatsapp.js` (`bassemCron`).
- **اللي حصل:** الإعداد `session_time` بيتحفظ، بس الـcron مابيستخدموش. رسالة «أنا جاهز» بتتبعت بس على `call_today_at` اللي بييجي من رد الواتساب.

**19. [منخفض] رابط «احجز اجتماع مع جنة» في إيصال «مفيش مصنع مطابق»**
- **الملفات:** `inquiries.js:230` و`meeting.part.py`.
- **اللي حصل:**
  - الرابط بيفتح `meeting.html` بعنوان «مفيش اجتماع في الرابط ده».
  - الصفحة فيها «كلّم فريق المنصة على واتساب»، وده بيوحي إن فيه موظف.

**20. [منخفض] السلة في السوق مالهاش طريق**
- **الملف:** `market.part.html`.
- **اللي حصل:** مفيش ولا زرار «أضف للسلة» (العدد 0) والسلة لسه ظاهرة، فطلب السلة مالوش طريق من الواجهة.

---

### ملاحظات للمدمج (`site.py`)
- **`advisor.html` و`meeting.html` في البيلد الحالي:** مافيهمش `mig-api.js`، فالمستشار في وضع المنصة مابيشتغلش على :8780. السطر الأول اللي طالبه وكيل الواجهة بيصلّح ده، واتأكدت منه على :8881.
- **`GATES['advisor']`:** محتاج يسيب الزائر يوصل لتسجيل الدخول بدل ما يحوّله للتسجيل (البند 4).

---

### اشتغل صح على الـbackend الحقيقي
- **التوزيع:**
  - التوزيع رايح للأعضاء المسجّلين بس (basic فأعلى). اللي على باقة profile واللي باقته منتهية ماجالهمش.
  - premium والمصنع المستهدف رقم 1، والخليج للـpremium فأعلى.
  - العدد اللي المشتري بيتقاله هو العدد الحقيقي في الواجهة والإيصال.
  - «مفيش مطابق» بيتقال بصراحة، وبعدين اتبعت تلقائي لعضو جديد انضم.
- **الإيميلات:** Reply-To لكل route، وبيانات المشتري مخفية عن المصنع، وفيه unsubscribe وهيدر One-Click.
- **حلقة الردود:**
  - رد المصنع بالإيميل وصل للمشتري (إيميل + تتبع + جرس).
  - رسالة المشتري اتبعتت للمصنع المقصود بس، وأي حد غريب بيترفض.
- **التتبع:** شغّال برابط الإيصال، وبالرقم + آخر 4 أرقام، وللمالك من غير أرقام.
- **الحسابات:**
  - الدخول بكود اشتغل، والمتابعة ظهرت على جهاز تاني، والخروج بيلغي الجلسة.
  - العضو basic مع `mig-plan=partner` أو كاش `mig-me` مزوّر بياخد 403 من `/api/advisor`، وباسم مش ظاهر له.
  - الشريك شغّل المستشار وعمل صفقة.
- **جنة لايف وأدوات باسم:** بأحداث Anam مصطنعة، أعلنوا الـref الحقيقي. ولما السيرفر وقع قالوا «مااتبعتش» ومااتسجّلش حاجة.
- **الـcron:**
  - تذكير 48 ساعة مرة واحدة، وإغلاق بعد 30 يوم مع إيميل.
  - ملخص المتابعات مبني على عناصر جديدة فعلاً.
  - قالب `bassem_morning` اتبعت في ميعاد العضو.
- **الإحصائيات:** حقيقية، فيها «منذ» و«بيانات غير كافية».
- **الأدمن:** الحظر شغّال، وغير الأدمن بياخد 403.
- **العرض:** الإيصال الإنجليزي بيبدأ بالإنجليزي، ومفيش سكرول أفقي على 390px.

---

### الملفات
السكربتات واللوجات (`j*.js` / `j*.log`) والـwrapper والـproxy في `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qaj/`، وأهمها:
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qaj/entry.js`
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qaj/wrangler.toml`
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qaj/proxy.js`
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qaj/lib.js`

الصور (69 صورة) في `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/phaseA/qa-journeys/`.

ماعدّلتش أي ملف في المشروع.

### security
## Security and abuse QA report: Phase A (Made in Egypt Gate)

**ملخص بالعربي:** المراجعة اتعملت بتشغيل فعلي: الـ Worker الحقيقي على workerd، وقاعدة بيانات D1 محلية، وChrome عن طريق Playwright. ماعدّلتش أي ملف في المشروع.
- **أخطر مشكلة:** أي مصنع منافس وصله نفس الطلب يقدر يبعت رد مزوّر باسم مصنع تاني على العنوان `inq-<ref>@`. المنصة بتبعته للمشتري على إنه رد رسمي، فالخطر هنا احتيال في تحويل الفلوس.
- **تاني مشكلة:** رابط مصمّم بالشكل `advisor.html#bcmd=…` بيخلّي باسم ينفّذ أوامر لعضو الشريك من غير أي تأكيد. بيبعتله إيميل فيه رسالة المهاجم، وبيفعّل موافقة الواتساب، وبيقفل الملخصات.
- **تالت مشكلة:** لو المنصة اتنشرت من غير `PLATFORM_KEY`، أي حد يقدر يدّي نفسه الباقة الاستراتيجية ويطّلع على صفقات عضو تاني.
- **اللي اتأكدنا إنه شغال صح:** مفيش XSS، والتوكنات، والحماية من الوصول لبيانات حد تاني (IDOR)، وإلغاء الاشتراك، وسر الـ webhook.

**Setup:**
- **Backend:** scripts that call the real handlers with the in-memory D1 adapter from `worker/test`, with Resend and respond.io mocked.
- **End to end:** the real Worker under `wrangler dev --local` (ports 8807 and 8890, now stopped) behind a same-origin proxy. The proxy served a copy of the integration build from `scratchpad/qaj/site-int`, because `site.py` does not yet have the integrator lines or `inbox.html`.

Findings are ranked by severity. Line numbers are in the current files.

### 1. HIGH: forged "factory reply" is relayed to the buyer (inbound mail trusts the From header)
**Owner:** `worker/src/inquiries.js`: `handleInquiryEmail` line 330, `recordFactoryResponse` lines 259–266, `buyerUpdate`.

**How it works:** a key-less address `inq-<ref>@` is matched to a routed member using the From header alone. `auth.verified` is never checked for routes, and `INBOUND_AUTHSERV_ID` is unset by default. The buyer email carries no unverified-sender warning, unlike the advisor's.

**Repro (verified on workerd):**
1. Two basic members A and B both match an RFQ. Each receives the routing email, and the subject contains the ref (`MIG-26-7C2ZBS`).
2. A sends mail to `inq-mig-26-7c2zbs@reply.madeinegyptgate.com` with `From: مصنع الدلتا <B's address>`. The envelope sender is `bounce@attacker-mta.test`.
3. The Worker accepts it and records «رد من مصنع الدلتا للبلاستيك».
4. It then emails the buyer from `advisor@madeinegyptgate.com`: «وصلك رد جديد على طلبك … من مصنع الدلتا للبلاستيك: … حوّل عربون 30% على IBAN … https://pay-delta-plastic.example/invoice».
5. The forged reply also appears on the buyer's track page. The event meta even records `sender_verified:false` and the mismatched envelope, but nothing acts on it.

**Preconditions:** the attacker needs the ref (every routed competitor has it) and B's registered email (not in the directory, but usually a public sales address). The forged domain must not have DMARC rejection enforced; gmail.com is p=none.

**Fix:**
- Factories always have their own `inq-<ref>-<route>@` address, so never accept key-less mail as a factory reply.
- Otherwise require `auth.verified`, and show the advisor's `UNVERIFIED` warning in the buyer email.

### 2. HIGH: a crafted link makes Bassem act with no confirmation (`advisor.html#bcmd=`)
**Owner:** `data/janna-live.js` lines 442–447, which hand off to `bassemTool` (line 344+).

**Repro (verified, real Worker and Chrome, signed-in partner with a normal cached session):**
1. Open `/advisor.html#bcmd={"t":"bassem_notify_member","a":{"message":"…https://mig-renew.example/pay","channel":"both"}}`, URL-encoded.
2. About one second later, with no click, the page sends `POST /api/advisor/notify`. The member receives an email «رسالة من باسم / A note from Bassem» from `advisor@madeinegyptgate.com` carrying the attacker's link. WhatsApp is also sent if the member has opted in.
3. A second link, `{"t":"bassem_set_work_time","a":{"wa_optin":true,"email_digest":false,"morning_time":"03:00","days":[5]}}`, sends `POST /api/me/prefs`. The prefs changed from `wa_optin:false`, `email_digest:true`, 09:00, all days to `wa_optin:true` (with `wa_optin_at` stamped as consent), `email_digest:false`, 03:00, Fridays only.

**Not confirmed:** the same path dispatches `bassem_update_deal`, `bassem_send_email` and `bassem_draft_email`. `update_deal` opened the deal, but no PATCH appeared within 12 seconds while the welcome modal was showing, so those two are code-path only.

**Fix:**
- Never execute commands from the URL. Hand over through sessionStorage under a one-time nonce written by the same tab, and put only the nonce in the hash.
- Require explicit confirmation for any tool with side effects.

### 3. HIGH if deployed without `PLATFORM_KEY`: anyone can mint partner/strategic rows that the email-code login adopts
**Owner:**
- `worker/src/advisor.js`: `session()` lines 329–360.
- `worker/src/auth.js`: `findByEmail` lines 118–123, and health at line 55.

**Repro (verified, environment without `PLATFORM_KEY`):**
1. `POST /api/advisor/session {"member_id":"evil-1","email":"attacker@evil.test","plan":"strategic"}` returns 200 with no authentication.
2. An email-code login as `attacker@evil.test` gets `plan=strategic` with all 5 markets. `/api/me/stats` and `/api/me/incoming` both return 200.
3. **Pre-account hijack:** `POST /api/advisor/session {"member_id":"hij-1","email":"victim@corp.test","plan":"partner"}` creates a row with the victim's email.
4. When the victim signs in by code, `findByEmail` picks the highest-plan row, so the victim's session is bound to `hij-1`.
5. The victim creates a deal ("Victim private tender", notes "our margin 12%"). The attacker's v1 token from step 3 lists it.
6. `/api/auth/health` still reports `ok:true`.

The README calls the key "required before launch", but nothing fails closed.

**Fix:**
- `/session` should return 503 without `PLATFORM_KEY`, like `/activation` does.
- `findByEmail` must not adopt rows with `verified=0` that the email-code flow did not create.
- Health should report not-ok without the key.

### 4. MEDIUM: strangers can block every email reply to a request for 24 hours
**Owner:** `worker/src/inquiries.js` line 316. The `inqin|` counter is consumed before the sender is identified.

**Repro (verified):**
1. Send 40 mails from unknown senders to `inq-<ref>@`. All are rejected as "Unknown recipient".
2. The routed factory's genuine reply to its own `inq-<ref>-<route>@` address is now rejected: "Too many messages to this address today".

**Fix:** count only accepted messages, and add a per-sender limit.

### 5. MEDIUM: unlimited quotes per factory, admin block doesn't stop a member, and the dashboard keeps inviting repeats
**Owner:**
- `worker/src/me.js`: `respond()` lines 173–199.
- `worker/src/admin.js`: `block()` line 75.
- `dash.part.html`: lines 185 and 253.

**Repro (verified):**
- 25 calls to `POST /api/me/incoming/<ref>/quote` were all accepted and sent 25 emails to the buyer. Each carries a free-text note, and links are allowed.
- After `POST /api/admin/block {email}`, the member's existing session can still quote (200).
- The UI reads `my_status` and `payload`, but the API returns `status` and `quantity`. So the empty quote form and the "new" badge stay after a quote (`xss-dash-factory-incoming.png`).

**Fix:**
- One quote per route (update instead of insert), or a small daily cap.
- Make block also cut sessions, quotes and inbound mail.
- Align the field names.

### 6. MEDIUM: anonymous, unverified requests are relayed to up to 10 member factories
**Owner:** `worker/src/inquiries.js`: `create()` from line 92. The company field (line 121) is not link-checked.

**Repro (verified):**
1. Send a request with no sign-in and no Turnstile. Use the email `anyone-unverified@victim-domain.test`.
2. Set the company to "Ministry of Supply — login: https://gov-eg-portal.example/rfq" and put a `specs.zip` link in the message.
3. The response is 201 with `routed=3`. Three platform-branded emails go to factories with «المشتري: … https://gov-eg-portal.example/rfq … حمّل … specs.zip».
4. The receipt goes to the unverified address.

The only brakes are 5 requests per IP per 10 minutes and 10 per address per day.

**Fix:**
- For anonymous senders, require email confirmation before routing.
- Strip or flag non-platform links in company and payload fields.
- Cap routed requests per member per day.

### 7. MEDIUM: Turnstile cannot be switched on, because it breaks every sign-in
**Owner:**
- `data/mig-api.js`: lines 203 and 222 send `{email, lang}` only; line 92 maps any 403 to "not available on your plan".
- `worker/src/auth.js`: line 74.

**Repro (verified):** with `TURNSTILE_SECRET` set, the dialog's request returns 403 `verification_required`, and the dialog shows «الخدمة دي مش متاحة لباقتك الحالية» (`turnstile-login-403.png`). In practice the platform therefore runs with no bot protection on `/api/auth/request` or on anonymous requests (finding 6).

**Fix:** send a token from the dialog (reuse the `human()` from `mig-forms.js`) or exempt `/api/auth/request`, and show a correct message for this error.

### 8. MEDIUM: a member sets the sender name buyers see (impersonation)
**Owner:** `worker/src/me.js`: `patchMe` lines 53 and 57. The name is used by `inquiries.js` line 260.

**Repro (verified):**
1. `PATCH /api/me {"company":"منصة صنع في مصر — قسم الحسابات (رسمي) https://mig-billing.example"}` returns 200.
2. The buyer's next quote email reads «عرض سعر … من منصة صنع في مصر — قسم الحسابات (رسمي) https://mig-billing.example». Only `name` is link-checked.

**Fix:** use the platform-verified company name, read-only for members, and block links in company and title.

### 9. MEDIUM: keyword stuffing harvests every open request and crowds out real matches
**Owner:**
- `worker/src/me.js`: lines 55 and 64.
- `worker/src/inquiries.js`: `rematchForMember` lines 210–222.
- `worker/src/matching.js`: line 93.

**Repro (verified):**
1. A basic member sets its own products to 22 unrelated keywords.
2. It immediately receives all 12 open requests across 8 sectors (buyer company names and messages) plus 12 emails.
3. Separately, 10 premium members sharing one weak keyword (score 5) take all 10 slots on a new cable RFQ. The exact-match basic cable factory gets nothing.

**Fix:**
- Make matching fields admin-verified, or limit how often they change and how many keywords they hold.
- Throttle rematch.
- Require a minimum relevance before premium priority applies.

### 10. MEDIUM: "honest metrics" can be inflated, against the "no fake numbers" rule
**Owner:** `worker/src/ev.js` line 25. The de-dup hash includes the User-Agent; there is no rate limit and no Origin check.

**Repro (verified):**
- 25 `view` events for factory 12 from one IP with 25 User-Agent strings gave `views=25` and `enough=true` in `/api/me/stats`.
- Cross-site requests with `Origin: https://evil.example` and `text/plain` returned 204 and were counted.

**Fix:**
- De-duplicate per IP (or /24) per item per day, ignoring the User-Agent.
- Require a same-site Origin.
- Cap events per IP per day.

### 11. LOW: the session is issued for an address that did not receive the code
**Owner:** `worker/src/auth.js`: `verify()` lines 89–110. Only `emailKey` must match, which strips `+tag` for every domain.

**Repro (verified):**
- A code mailed to `ceo+x@corp.test`, verified as `ceo@corp.test`, gives a session on the existing partner account.
- A code mailed to `boss+x@mig.test`, verified as `boss@mig.test`, gives the **admin** role.

**Fix:** bind the session to `row.email`, the address the code was actually sent to.

### 12. LOW: login code guessing budget
**Owner:** `worker/src/auth.js` line 11.

**Measured:** 5 codes per hour × 5 tries gives 25 real guesses per hour per address. That is about 600 a day, roughly 1.8% success per month against one address such as the admin's. The target receives up to 120 code emails a day.

**Fix:** a daily cap on failed verifications per address, with a lockout.

### 13. LOW: the duplicate check returns another buyer's ref
**Owner:** `worker/src/inquiries.js` line 114. The check runs before rate limits and is not tied to the requester.

**Repro (verified):** resubmitting the same email, kind, target and message from another IP within 10 minutes returns the victim's ref with `duplicate:true`. This makes finding 1 easier.

### 14. LOW: the WhatsApp log stores a reversible phone hash
**Owner:** `worker/src/whatsapp.js` line 59.

**Repro (verified):** a message from `+201009998877`, not a member, was stored as `phone_hash 2210ae6d9417ddf8ad0d03a0`. That equals `sha256("wa|+201009998877")[:24]`, an unkeyed hash. Egyptian mobile numbers can be enumerated in minutes. The message text is stored next to it and exposed through `/api/admin/wa`.

**Fix:** use a keyed HMAC, as `ipHash` does.

### 15. LOW: the admin monitor cannot see delivery failures
**Owner:** `inbox.part.py` line 91 reads `email_status`, `wa_status` and `quote`. `worker/src/admin.js` `show()` returns `email_sent`, `wa_sent`, `error` and `attempts` instead.

**Verified:** the email and WhatsApp columns show "—" for a route whose email was sent (`xss-inbox-admin.png`). This console is the only oversight in a no-human system.

### 16. LOW: WhatsApp opt-in without proof of phone ownership
**Owner:** `worker/src/me.js`: `patchMe` and `setPrefs` (line 117).

The phone number is self-asserted, so WhatsApp messages can reach someone who never consented. Finding 2 also lets a link flip the opt-in.

### Info (not exploited)
- **Token exposure:** tokens, including admin tokens, live in `localStorage`. No page sets a CSP. Third-party scripts load without SRI: the unpkg Anam widget 0.8.0, injected dynamically, and cdnjs qrcodejs. Any XSS or CDN compromise would mean token theft. CORS `*` is acceptable only because auth is bearer-only.
- **Track last-4:** the lock is 10 failures per hour per ref, so the worst case is about 42 days for 10,000 codes. The same lock blocks the real buyer's last-4 lookups for that hour.
- **Unsubscribe flags:** unsubscribe works, but for Gmail addresses with dots or a `+tag` the updates in `ev.js` do not set `inbox_paused` or `email_digest`. Sending is still suppressed through the `unsubscribes` table.
- **Not in this lens:** a valid partner with no cached `mig-me` who opens `advisor.html` is sent to `register.html#partner` by the `site.py` gate before `/api/me` answers.

### Verified OK
- **Tokens:** a tampered signature, a swapped member id, an expired token and a token signed with another secret all return 401. Logout revokes the session.
- **IDOR:** another user cannot mark someone's notifications read or delete their follows. Tracking another user's ref returns 404, and admin endpoints return 403.
- **Stored XSS:** payloads were placed in name, company, message, target name, payload, items, the factory reply, the quote and a follow label. All render as text in `inbox.html` (admin), `track.html` and the dashboard tabs (requests, follows, notifications, incoming).
- **DOM XSS:** a sweep of 51 pages × 11 hash and query payloads (561 loads) found 0 hits and 0 page errors.
- **Email headers:** CRLF is stripped from subjects, and the HTML body is escaped.
- **Unsubscribe:** GET only shows a confirmation, a forged signature is rejected, and one-click POST works. Routing skips the unsubscribed member, and the `List-Unsubscribe` header is present.
- **WhatsApp webhook:** a missing or wrong secret returns 401.
- **PII:** no raw IPs are stored, the directory data and pages contain no factory phone numbers, and incoming items show only the buyer's first name and company.

### Files
Everything is in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/phaseA/qa-security/`:
- **Backend logs:** `be-sec.log`, `be-sec2.log`
- **End-to-end logs (in `e2e/`):** `t-bcmd.log`, `t-spoof.log`, `t-stored.log`, `t-domxss.log`
- **Scripts:** `be-sec.mjs`, `be-sec2.mjs`, and `e2e/*.js`
- **Screenshots:**
  - `mail-spoofed-factory-reply-to-buyer.png`
  - `mail-bcmd-notify-to-member.png`
  - `bcmd-notify.png`
  - `bcmd-prefs.png`
  - `bcmd-update-deal.png`
  - `turnstile-login-403.png`
  - `xss-inbox-admin.png`
  - `xss-track-buyer.png`
  - `xss-dash-factory-incoming.png`
  - `xss-dash-buyer-inquiries.png`
  - `xss-dash-buyer-follows.png`
  - `xss-dash-buyer-notifications.png`

No project files were edited, and my local servers on ports 8807 and 8890 are stopped.

### honesty-ui
## QA report: honesty and UI audit, Phase A (no project files edited)

I found 26 verified problems. Three are severe and on public pages:
- **A fabricated "live" activity feed** on the home page.
- **Hard-coded inflated counts** on the factories page.
- **A broken root page `index.html`**: no doctype, charset or viewport.

The new dashboard and admin screens also misread several backend fields, so they show wrong states. The worst case is the days setting, which says "saved" while the server drops the choice.

**What I ran**
- **Crawl:** 49 built pages plus 21 deep links (`company#0/#x3`, `opportunity#in16`, `project#r015`, `entity#rc8`, and so on), each in AR and EN at 1366 and 390 wide. That is 284 page loads against `:8780`, offline.
- **Results of the crawl:**
  - 0 page errors and 0 console errors. The only failures are the expected `POST /api/ev` 501s from the static server.
  - 0 horizontal scroll, except on the root `index.html`.
  - None of the following anywhere: «(مثال)», card or CVV inputs, `Math.random` refs, RFQ-88412, INV or PO numbers, or 26,808 / 14,820 / 11,988.
- **New UI:** login, bell, account chip, ☆ follow, all 10 dashboard tabs for partner, basic and data-only plans, the track page, and the admin inbox (as admin, as a basic member and signed out). Each in AR and EN at 1366 and 390, online and offline.
  - I tested these against an API mock that copies the backend's real response shapes from `worker/src/me.js`, `inquiries.js`, `admin.js` and `common.js`.
  - `inbox.html` is not in `site/` yet. I built it from a scratch copy of `site.py` with the integrator's two lines added, output to my scratchpad, served on `:8795`. That server is now stopped.

Screenshots are in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/phaseA/qa-honesty-ui/` (`crawl/` has 280 files, `ui/` has the rest). Scripts and the mock are in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/qahu/` (`crawl.js`, `fmock.js`, `ui1.js`, `ui2.js`, `ui3.js`, `last.js`, `fk.js`, `idx.js`, `hero.js`).

---

## Critical

**1. The home hero shows a fabricated live activity feed under «منصة صنع في مصر · مباشر الآن» ("live now").**
- **Owner:** `home2.part.html`. The label is at :619, the initial text at :628, the event list `LOG` at :874, and the timer `setInterval(orbSend,1800)` at :908. There is also a pulsing "live" dot.
- **Repro:** open `home.html` or `/` in AR or EN and watch the box under the orbit graphic. Every 1.8 s it cycles through invented events:
  - «📨 طلب عرض سعر جديد من مقاول في القاهرة»
  - «طلب عرض سعر من سلسلة متاجر في الكويت»
  - «مورد خامات أرسل عرضاً لحبيبات HDPE»
  - «شحنة من ميناء العين السخنة إلى مومباسا في الطريق»
  - «تم تأمين شحنة متجهة إلى جدة»
  - and others.
- **Evidence:** `ui/home-hero-livefeed-m-en.png`, `ui/home-hero-livefeed-d-ar.png`
- **Fix:** delete the `LOG` text swap and the «مباشر الآن» label. The orbit animation itself can stay.

## High

**2. `factories.html` hero shows hard-coded counts: «500+ منتج في السوق» and «200+ طلب توريد مباشر».**
- **Owner:** `pages.part.py:229`
- The real numbers on the site are 176 products on `market.html` and 5 RFQs on `rfqs.html`.
- The "3,000+" next to them is computed from the merged data (floored), but home and about say 2,926.
- **Evidence:** `ui/evidence-factories-hero-stats-ar.png`

**3. The root page `site/index.html` is built without a document skeleton.**
- **Owner:** `site.py` (`page(main=True)` returns early at :251–252; written at :367). This is for the integrator; I did not touch `site.py`.
- It has no `<!doctype>`, `<html dir/lang>`, `<meta charset>` or viewport tag.
- **Effects:**
  - On phones `/` lays out at 980px, so the whole desktop page is shrunk with tiny text (`innerWidth`=980, quirks mode). `home.html` is fine (390).
  - Without a charset header, as on the `:8780` preview, the entire page is mojibake in AR and EN. In EN at 1366 the garbled nav also causes 893px of horizontal scroll, and links become `factories.html#q=Ù†Ø³ÙŠØ¬`.
  - The pending SEO build redirects `/home.html` to `/`, which would make this broken page the only home page.
- **Evidence:** `crawl/ar390_index_html.png` (mojibake), `ui/index-root-prodheader-m-ar.png` (served with `text/html; charset=utf-8`, still 980px wide)

**4. «طلبات واردة لي» (requests routed to me) misreads the backend, so every routed request always looks new.**
- **Owner:** `dash.part.html:185`, :252–253 (contract with `worker/src/me.js` `incoming()` around :157–170)
- The dashboard reads `x.my_status` and `x.payload.*`. The backend sends `status` (`sent|quoted|declined…`), `closed`, and top-level `product/quantity/governorate`, with no `created_at` or `routed_at`.
- **Repro:** sign in as a basic member whose incoming list has one quoted, one declined and one closed item.
  - All 4 items show «جديد» with an open quote form.
  - After sending a quote and reloading, it is still «جديد» with the form.
  - The nav badge always equals the total.
  - Quantity, product and delivery governorate are never shown, and the date slot is empty («طلب عرض سعر · »).
- The backend accepts and forwards repeat quotes (`me.js` `respond` has no already-quoted check), so buyers get duplicate quotes.
- **Evidence:** `ui/dash-incoming-after-quote-partner-d-ar.png`

**5. «الواتساب والإيميل» (WhatsApp and email settings) days: the page says saved while the server drops the choice.**
- **Owner:** `dash.part.html:298`, :381 (contract with `worker/src/me.js` `setPrefs` and `whatsapp.js:184`)
- The page sends `days:["sun","mon",…]`. The backend expects integers 0–6, filters the strings out, stores `days:[]`, and still returns 200.
- **What the user sees:**
  - On first load, with the backend default `[0..6]`, all 7 boxes are unchecked.
  - Choosing Sun–Thu and saving shows «✓ اتحفظت اختياراتك».
  - After reload, all 7 are checked.
  - Bassem's WhatsApp then goes out every day.
- **Evidence:** `ui/dash-prefs-partner-d-ar.png`; the full log is in `ui2_partner.json` (`prefsPosted`, `prefsServer`, `daysAfterReload`).

**6. Automatic factory emails and WhatsApp messages link to `dash.html`, which does not exist (404).**
- **Owner:** `worker/src/inquiries.js:194` (`dash.html#incoming=<ref>` in every routing email and WhatsApp) and :378 (48 h reminder); `worker/src/digest.js:80` (bell notification URL `dash.html#follows`) and :85 (digest email).
- The page is `dashboard.html`. Its hash parser also ignores `incoming=REF`.
- This breaks the factory's main "quote from your dashboard" path and the bell link for digests.

**7. The admin monitor shows "—" for email and WhatsApp delivery to every factory, even when sent.**
- **Owner:** `inbox.part.py:89–91`
- It reads `email_status`/`wa_status`; the backend (`admin.js show()`) returns `email_sent`/`wa_sent`.
- Quotes come back in a separate `quotes[]` and are never shown. Route statuses `failed` and `pending` appear raw.
- **Repro:** as admin, open the detail of a request with `email_sent=1, wa_sent=1`. Every row reads «— | —».
- **Evidence:** `ui/inbox-detail-d-ar.png`

## Medium

**8. Raw internal keys shown to users.**
- **Owner:** `data/mig-api.js` (`STATUS` at :142 lacks `recorded`; `EVT` at :151 lacks `rematched` and `buyer_message`). All of these are real backend values.
- **Where it shows:**
  - The status chip «recorded» on the dashboard, track page and inbox.
  - Timeline titles «• buyer_message» and «• rematched» in AR and EN.
  - Admin-only extras: `send_failed`, payload keys `product/quantity/governorate`, and `company #12`.
- **Evidence:** `ui/track-ok-d-ar.png`, `ui/dash-inquiries-partner-d-en.png`

**9. The English UI shows Arabic server text.**
- **Owners:** `data/mig-api.js:258` (`track()` never sends `lang=en`, which the backend supports); `worker/src/common.js:152` (`notify` stores Arabic-only titles; callers in `inquiries.js` :134 and :250 and in `digest.js`); `pages.part.py:530` (track page).
- **What the user sees:**
  - Track and dashboard timelines in EN show Arabic bodies.
  - The EN bell lists Arabic titles.
  - On the EN track page, the label «آخر 4 أرقام من موبايلك» and its hint are untranslated.
- **Evidence:** `ui/track-timeline-en.png`, `ui/bell-m-en.png`

**10. Illustrative content is labelled rather than removed (owner decision 4).**
- **`factory-profile.html:609` and :640:** `factory.html`'s hero slider shows 4 photos captioned «… – صورة توضيحية», and the lightbox adds «· صورة توضيحية». Separately, Janna calls the page «مثال لملف مصنع»; that is for the `janna.js` owner. Evidence: `crawl/ar1366_factory_html.png`
- **`market.part.html:390`:** a rotating hero slide reads «عروض الجملة على مواد البناء — خصومات على الكميات الكبيرة… (أمثلة توضيحية)».
- **`bourse.part.py:74` (`asof()`):** it still says «الرسم التاريخي توضيحي يصل إلى آخر سعر حقيقي» after the chart was removed, contradicting the note above it. Evidence: `ui/evidence-bourse-asof-ar.png`

**11. An inflated, false CTA on the about page: «انضم إلى أكثر من 3000 منشأة صناعية».**
- **Owner:** `about.part.py:193`
- The same page computes 2,926.
- **Evidence:** `ui/evidence-about-3000-ar.png`

**12. Human-team promises that conflict with decision 5 (no human operator).**
- **`meeting.part.py`:**
  - :65 — «💬 كلّم فريق المنصة على واتساب» / "WhatsApp the platform team"
  - :78 — «تأكد موعدك مع فريق المنصة»
  - Evidence: `ui/evidence-meeting-team-whatsapp-ar.png`
- **`worker/src/meetings.js:475`:** the meeting summary email says «وفريق المنصة هيتابع معاك» / "the platform team will follow up".
- **Manual-review claims:**
  - `factory-profile.html:441` — «وتظهر هنا بعد مراجعة المنصة»
  - `pages.part.py:454` — «شارة "موثّق" بتظهر بعد مراجعة مستندات المنشأة»
- **Not yet built, will ship on integration:** `seo_build.part.py` at :1441, 1564, 1603, 1660, 2242, 2244, 2253 and 2258 says «ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه».

**13. Following an export market fails, and the raw server error is shown.**
- **Owner:** `exportmarket.part.py:62` sets `MIG_CTX` type `"market"`, which is not in `worker/src/me.js:19 FOLLOW_KINDS`.
- **Repro:** signed in, open `export-market.html#gulf` and click «☆ تابع». The toast reads «حصلت مشكلة: invalid kind» and the button does not toggle.
- **Evidence:** `ui/follow-market-kind-ar.png`

**14. The home page labels old-directory listings as members.**
- **Owner:** `home2.part.html:682` (with a pulsing "live" dot) and :744
- «🏭 مصانع مصرية أعضاء في المنصة» and «المصانع والشركات الأعضاء حسب المحافظة · من دليل أعضاء المنصة» describe directory entries that are not registered accounts and never receive routed requests.
- This contradicts the `company.part.py` fix.

## Low

**15.** The quote toast «اتبعت عرضك للمشتري تلقائي» shows even when the server returns `buyer_notified:false`. Owner: `dash.part.html:391`. Evidence: `ui/dash-quote-toast-buyer-not-notified.png`

**16.** Inbox filter chips (owner: `inbox.part.py:53` and `shell()`):
- There is no `recorded` chip, and there is a `quoted` chip the backend never uses.
- Counts come from the filtered list rather than the server's `counts`. With «مستني» active, it shows «الكل 1» and «وصل رد 0».
- Evidence: `ui/inbox-filter-counts.png`

**17.** In EN, 6 plan-card strings stay Arabic on `register.html` and on every gated page (`register.part.py` around :49), for example «حتى 30 منتجاً…» and «💡 وجود رسمي للمنشأة…». The advisor gate shows mixed text: "🔒 To view المستشار الذكي للصفقات."

**18.** For an rfq or basket whose deliveries failed and await retry, the status stays `received`. The form then says «مفيش مصنع مسجّل… ماتبعتش لأي حد», which gives a false reason. Owner: `data/mig-forms.js:98`.

**19.** `worker/src/inquiries.js:144–145` tells anonymous lead and project interest submitters «هنبلغك تلقائياً بأي تحديث», but the auto-follow is created only for signed-in users (:152).

**20.** Follow buttons are styled four different ways: a ☆ pill (`mig-fbtn`), a full-width `btn-line`, «🔔 تابع القطاع» in green, and an icon-only ♡ on `factory.html`.

**21.** Smaller copy and fit issues:
- The EN account menu shows the raw Arabic title «دكتور أحمد سامي», while Bassem says "Dr.". Owner: `mig-api.js` `shortName`.
- The header label «دخول المصانع» is shown for a login that everyone uses. Owner: `site.py` header.
- The track placeholder is "MIG-26-XXXXX" (5 characters), but real refs have 6. Owner: `pages.part.py:529`.
- At 390px, the admin inbox list sits under Bassem's daily greeting sheet and the admin «معاينة الإدارة» pill until both are dismissed. Evidence: `ui/inbox-viewport-list-m-ar.png`

## Checked and working

- **Login dialog:**
  - correct `dir`, focus trap and privacy note
  - auto-submits at 6 digits, and a wrong code gives an honest error
- **Header:** the bell and account chip fit with no overflow at 390 or 1366 in AR or EN.
- **Offline states:** dashboard, track and inbox show «الخدمة دي هتشتغل أول ما المنصة تتربط بالسيرفر», with no fake success.
- **Inbox access:** signed out shows a sign-in prompt; a basic member gets a 403 message.
- **Track page:** the signed link `#REF~t` works, a wrong last-4 shows not-found, and no-match wording is honest.
- **Stats tab:** shows «بيانات غير كافية» with a «منذ» (since) date.
- **Advisor:** visitors see a lock, never the demo.

## Files

- **Owners named above:** `home2.part.html`, `pages.part.py`, `site.py`, `dash.part.html`, `data/mig-api.js`, `inbox.part.py`, `factory-profile.html`, `market.part.html`, `bourse.part.py`, `about.part.py`, `meeting.part.py`, `exportmarket.part.py`, `register.part.py`, `data/mig-forms.js`, `seo_build.part.py`
- **Backend owners:** `worker/src/inquiries.js`, `worker/src/digest.js`, `worker/src/common.js`, `worker/src/me.js`, `worker/src/meetings.js`
- All of these are under `/home/user/madeinegyptgate/`.