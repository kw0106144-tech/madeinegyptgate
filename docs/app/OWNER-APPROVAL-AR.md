# نصوص التطبيق اللي محتاجة موافقة حضرتك — App texts that need the owner's approval

> **مسودات.** كل نص هنا مكتوب في الكود بالظبط زي ما هو تحت، بس **مخفي ورا مفتاح مقفول** في «🛠️ المطوّر ← المزايا». مفيش حاجة منهم
> بتظهر لأي حد لحد ما حضرتك توافق على الكلام حرف بحرف وبعدين تشغّل المفتاح. أي تعديل في الكلام = تعديل صغير في الكود قبل التشغيل
> (CLAUDE.md 2.7). المركز القانوني نفسه **ماتغيّرش** — الإضافات المقترحة لسياسة الخصوصية مكتوبة هنا بس (القسم 4).
>
> **Drafts.** Every text below is in the code exactly as written, but **hidden behind a switch that ships OFF** in «🛠️ Developer →
> Features». None of them shows to anyone until the owner approves the words verbatim and then turns the switch on. A change of wording
> = a small code change before switching on (CLAUDE.md 2.7). The legal center itself is **not edited** — the proposed privacy-policy
> additions are only here (section 4).

مصدر الخطة: خطة التطابق بين التطبيق والموقع (2026-11-20). كل المفاتيح الجديدة افتراضياً بتخلّي التطبيق **زي الموقع بالظبط**:

| المفتاح | الافتراضي | لما يتشغّل / يتقفل |
|---|---|---|
| `app_buy_ios` — «الأسعار والدفع جوه تطبيق الآيفون» | **شغّال** (زي الموقع) | لو اتقفل: الأسعار والباقات و«ادفع الآن» والتجديد والترقية بيختفوا جوه تطبيق الآيفون بس (قسم 5) |
| `app_buy_android` — «الأسعار والدفع جوه تطبيق الأندرويد» | **شغّال** | نفس اللي فوق لتطبيق الأندرويد |
| `account_delete` — «طلب حذف الحساب» | مقفول (مقفول كمان لحد ما ملف قاعدة البيانات 0010 يتشغّل) | زرار في لوحة العضو + صفحة `/delete-account/` (قسم 1) |
| `visitor_erase_request` — «طلب مسح كلام الزائر مع جنة» | مقفول (ومستني 0010) | استثناء من «ذاكرة جنة دايمة» — قرارك (قسم 1-هـ) |
| `store_review_signin` — «دخول مراجعي المتاجر» | مقفول (ومقفول لحد ما تحط الإيميل والكود) | دخول مراجع App Store / Google Play (قسم 2) |
| `call_consent_app` — «موافقة قبل مكالمة الذكاء الاصطناعي — جوه التطبيق» | مقفول | رسالة الموافقة قبل أول مكالمة جوه التطبيق (قسم 3) |
| `call_consent_web` — «… على الموقع» | مقفول | نفس الرسالة على الموقع في المتصفح |
| `app_janna_autovoice` — «جنة بتتكلم لوحدها أول ما التطبيق يفتح» | مقفول (زي المتصفحات) | لو اتشغّل: جنة بتتكلم بصوت عالي لوحدها مع كل فتحة للتطبيق |

---

## 1. حذف الحساب — Account deletion (`account_delete`, `visitor_erase_request`)

**ليه:** أبل (5.1.1(v)) وجوجل بلاي بيشترطوا طريقة لطلب حذف الحساب من جوه التطبيق، وجوجل بيطلب كمان رابط على الموقع
(`https://madeinegyptgate.com/delete-account/`). **الطلب نفسه مابيمسحش أي حاجة:** بيوصل لحضرتك في لوحة التحكم ←
«العملاء والاشتراكات» ← «طلبات حذف الحساب»، وإيميل تنبيه بيوصل لإيميلات الإدارة، وحضرتك بتنفّذ الحذف المسجّل اللي موجود بالفعل
(صفحة العضو ← حذف، وده بيمسح ذاكرة باسم وجنة عنه كمان) خلال 30 يوم، وبعدين تعلّم الطلب «✓ تم الحذف».

**قبل التشغيل:** (1) الموافقة على النصوص دي؛ (2) تشغيل ملف قاعدة البيانات `0010_delete_requests.sql` من GitHub ← Actions ←
`d1-migrate` (المفتاح بيفضل مقفول لحد ما الملف يتشغّل).

### 1-أ. صفحة `/delete-account/` — المفتاح مقفول (ده اللي ظاهر دلوقتي — نفس كلام سياسة الخصوصية الحالي)
- AR: «إزاي تطلب حذف حسابك» — «لطلب حذف حسابك وبياناتك ابعتلنا من بريد الحساب على info@madeinegyptgate.com، زي ما سياسة الخصوصية بتقول.»
- EN: "How to ask for the deletion of your account" — "To ask for the deletion of your account and its data, write to us from the account's e-mail at info@madeinegyptgate.com, as our privacy policy says."

### 1-ب. صفحة `/delete-account/` — المفتاح شغّال (`data/delete-account.js`)
| فين | عربي | English |
|---|---|---|
| العنوان | حذف حساب العضو | Delete a member account |
| النقطة 1 | الطلب بيوصل لفريق المنصة، وحذف الحساب وبياناته بيتنفّذ خلال 30 يوم. | The request reaches the platform team, and the account and its data are deleted within 30 days. |
| النقطة 2 | بيتحذف: بيانات حسابك وشركتك ومنتجاتك ومتابعاتك وإشعاراتك، وذاكرة باسم وجنة عنك. | Deleted: your account and company data, your products, follows and notifications, and Bassem's and Janna's memory of you. |
| النقطة 3 | بيفضل محفوظ اللي القانون بيطلبه بس، زي الفواتير الضريبية. | Kept: only what the law requires, such as tax invoices. |
| مش داخل | علشان تطلب حذف حسابك، ادخل بحسابك الأول (كود من 6 أرقام على إيميلك). — زرار «🔑 ادخل بحسابك» | To ask for your account's deletion, sign in first (a 6-digit code to your e-mail). — "🔑 Sign in" |
| الزرار | 🗑 طلب حذف الحساب | 🗑 Request account deletion |
| التأكيد التاني | متأكد إنك عايز تحذف حسابك؟ — بعد ما الفريق ينفّذ الحذف مش هتقدر ترجّع الحساب ولا بياناته. لو عندك باقة سارية، الحذف بينهيها. — «أيوه، احذف حسابي» / «لا، رجوع» | Are you sure you want your account deleted? — Once the team runs the deletion, the account and its data cannot be restored. A plan in force ends with it. — "Yes, delete my account" / "No, go back" |
| بعد الطلب | طلب حذف حسابك اتسجّل برقم ‹dr-…› يوم ‹التاريخ›، والحذف بيتنفّذ خلال 30 يوم. | Your account deletion request is recorded as ‹dr-…› on ‹date›; the deletion is carried out within 30 days. |
| بعد التنفيذ | طلب حذف الحساب رقم ‹dr-…› اتنفّذ يوم ‹التاريخ›. | Deletion request ‹dr-…› was carried out on ‹date›. |
| لو اترفض | طلب حذف الحساب رقم ‹dr-…› اتقفل من غير حذف — لو عندك سؤال ابعتلنا على info@madeinegyptgate.com. — «🗑 اطلب تاني» | Deletion request ‹dr-…› was closed without a deletion — write to us at info@madeinegyptgate.com with any question. — "🗑 Ask again" |
| دخل برابط إيميل | دخلت برابط من الإيميل — ادخل بكود على الإيميل الأول علشان تطلب حذف الحساب. | You came in through an e-mail link — sign in with an e-mail code first to ask for the account's deletion. |

### 1-ج. لوحة العضو ← «باقتي / الإعدادات» (`dash.part.html` delCard)
- AR: «🗑 طلب حذف الحساب» — «تقدر تطلب حذف حسابك وبياناته؛ الحذف بيتنفّذ خلال 30 يوم، وبيفضل محفوظ اللي القانون بيطلبه بس (زي الفواتير الضريبية).» — زرار «🗑 طلب حذف الحساب» ← `/delete-account/`
- EN: "🗑 Request account deletion" — "You can ask for your account and its data to be deleted; the deletion is carried out within 30 days, and only what the law requires (such as tax invoices) is kept."

### 1-د. إيميل التنبيه لحضرتك (قالب «طلب محتاج رد الإدارة»)
- AR: «وصل طلب حذف حساب عضو (dr-…). الطلب نفسه مامسحش أي حاجة: افتح «طلبات حذف الحساب» في لوحة التحكم ونفّذ الحذف المسجّل خلال 30 يوم، وبعدين علّم الطلب «تم».»
- EN: "A member account deletion request arrived (dr-…). The request itself deleted nothing: open «Account deletion requests» in the Control Center, run the audited deletion within 30 days, then mark the request done."

### 1-هـ. طلب الزائر «امسح كلامي مع جنة» (`visitor_erase_request` — **استثناء** من قاعدة «ذاكرة جنة دايمة»: قرار حضرتك)
بيسجّل الرقم العشوائي للزائر بس (مفيش إيميل ولا رقم). رقم مربوط بحساب عضو → «ادخل بحسابك واطلب حذف الحساب». المسح نفسه
حضرتك بتعمله من «طلبات حذف الحساب» ← «امسح ذاكرة الزائر» (المسح المسجّل الموجود، بكتابة رقم الزائر للتأكيد).
- AR: «كلامك مع جنة على الجهاز ده» — «جنة بتفتكر كلامها مع زوار الموقع برقم عشوائي محفوظ على الجهاز (مش باسمك ولا رقمك). تقدر تطلب مسح كلامك معاها.» — «🧹 امسح كلامي مع جنة» — بعد الطلب: «طلبك اتسجّل برقم ‹dr-…›، والمسح بيتنفّذ خلال 30 يوم.» — لو مفيش: «مفيش كلام محفوظ مع جنة على الجهاز ده.»
- EN: "Your conversations with Janna on this device" — "Janna remembers her conversations with visitors by a random number kept on the device (not your name or number). You can ask for your conversations with her to be erased." — "🧹 Erase my conversations with Janna" — "Your request is recorded as ‹dr-…›; the erasure is carried out within 30 days." — "There are no saved conversations with Janna on this device."

---

## 2. دخول مراجعي المتاجر — Reviewer sign-in (`store_review_signin`)

**ليه:** أبل (2.1(a)) وجوجل بلاي («App access») لازم يدخلوا بحساب عضو. الدخول عندنا كود على الإيميل بس. **الحل:** إيميل واحد
(صندوق بريد بتاع الفريق، مثلاً `review@madeinegyptgate.com`) وكود ثابت من 6 أرقام حضرتك بتكتبه في «🛠️ المطوّر ← المزايا ← دخول مراجعي
المتاجر — الإيميل والكود»، صالحين 30 يوم بالكتير. الكود بيتحفظ متشفّر (HMAC بـ CONFIG_SECRET) ومش بيظهر تاني. كل دخول بيتسجّل في
السجل (`review.signin`). أي إيميل تاني أو كود غلط أو المفتاح مقفول أو المدة خلصت = الدخول العادي بالظبط.

**خطوات:** (1) اعمل عضو بالإيميل ده من «الأعضاء والاشتراكات» وفعّل عليه باقة حقيقية وقت المراجعة (مفيش بيانات تجريبية)؛ (2) احفظ
الإيميل والكود والمدة؛ (3) شغّل المفتاح؛ (4) حط النص اللي تحت في App Store Connect ← App Review Information ← Notes، وفي Google
Play Console ← App content ← App access؛ (5) بعد الموافقة: اقفل المفتاح و«🗑 شيلهم».

نص الملاحظة للمراجع (مسودة):
- EN (للمتاجر): "Sign-in: tap «دخول» / “Sign in”, enter the e-mail ‹review address›, tap “Send me a sign-in code”, then enter the code ‹6 digits›. The platform signs in with a one-time code sent by e-mail; for the review period this one address accepts the fixed code above. Live video calls with Janna / Bassem need the microphone permission."
- AR: «الدخول: اضغط «دخول»، اكتب الإيميل ‹إيميل المراجعة›، اضغط «ابعتلي كود الدخول»، وبعدين اكتب الكود ‹6 أرقام›. الدخول على المنصة بكود لمرة واحدة بيوصل على الإيميل؛ وفي فترة المراجعة الإيميل ده بس بيقبل الكود الثابت ده. مكالمات الفيديو المباشرة مع جنة وباسم محتاجة إذن الميكروفون.»

---

## 3. رسالة الموافقة قبل مكالمة الذكاء الاصطناعي — AI-call consent card (`call_consent_app`, `call_consent_web`)

**ليه:** أبل (5.1.2(i)) بتطلب إن التطبيق يقول إن فيه طرف تالت ذكاء اصطناعي ويطلب إذن صريح قبل ما يبعتله بيانات، وقانون حماية
البيانات 151 لسنة 2020 في نفس الاتجاه. الرسالة بتظهر مرة واحدة على كل جهاز قبل أول مكالمة (`data/janna-live.js` aiCard)،
والسيرفر بيرفض أي مكالمة من غير الموافقة لما المفتاح يكون شغّال.

| فين | عربي | English |
|---|---|---|
| العنوان | قبل المكالمة | Before the call |
| النص (جنة) | المكالمة دي مع مساعد بالذكاء الاصطناعي: صوتك وكلامك بيتبعتوا لمزوّد المحادثة المرئية (Anam) علشان يتحوّل لرد، والمنصة بتحتفظ بملخص كلامكم علشان جنة تكمّل معاك. | This call is with an AI assistant: your voice and words are sent to the video-chat provider (Anam) to be turned into a reply, and the platform keeps a summary of your conversation so Janna can carry on with you. |
| النص (باسم) | … علشان باسم يكمّل معاك. | … so Bassem can carry on with you. |
| الرابط | سياسة الخصوصية (→ /legal/#privacy) | Privacy policy |
| الأزرار | موافق، ابدأ · لا، شكراً | OK, start · No, thanks |
| بعد «لا، شكراً» | تمام — تقدر تكلّم ‹جنة/باسم› كتابة من غير مكالمة. | OK — you can still write to ‹Janna/Bassem› without a call. |

مع الموافقة: يتحدّث كمان نص إذن الميكروفون في الآيفون (`NSMicrophoneUsageDescription`) علشان يذكر مزوّد الذكاء الاصطناعي. ده النص اللي
الآيفون بيعرضه في رسالة إذن الميكروفون قبل أول مكالمة (بالفصحى زي باقي نصوص الأذونات)، ومحتاج موافقة حضرتك برضه — ومحتاج **تحديث
للتطبيق** (مش بيتغيّر من لوحة التحكم):

| فين | عربي | English |
|---|---|---|
| رسالة إذن الميكروفون في الآيفون (`app/tools/ios_project.py` PURPOSE ← `Info.plist` + `ar.lproj` / `en.lproj` `InfoPlist.strings`) | يُستخدم الميكروفون فقط عندما تبدأ مكالمة مباشرة مع جنة أو باسم، مساعدَي المنصة بالذكاء الاصطناعي؛ ويُرسَل صوتك أثناء المكالمة إلى مزوّد المحادثة المرئية (Anam) ليُعالَج ويُرَد عليك. | The microphone is used only when you start a live call with Janna or Bassem, the platform's AI assistants; during the call your voice is sent to the video-conversation provider (Anam) to be processed and answered. |
| النص الحالي (لحد الموافقة) | يُستخدم الميكروفون فقط عندما تبدأ مكالمة مباشرة مع جنة أو باسم، مساعدَي المنصة، ليسمعا صوتك. | The microphone is used only when you start a live call with Janna or Bassem, the platform's assistants, so they can hear you. |

بعد الموافقة: يتعدّل نص `NSMicrophoneUsageDescription` في `PURPOSE` (العربي والإنجليزي) في `app/tools/ios_project.py`، ويتشغّل
`python3 app/tools/ios_project.py`، وتتعمل commit للسكربت وللـ 3 ملفات اللي بيكتبها (`Info.plist` والـ `InfoPlist.strings` العربي والإنجليزي)، وبعدين نسخة جديدة من تطبيق الآيفون.

---

## 4. إضافات مقترحة لسياسة الخصوصية — Privacy-policy additions (المركز القانوني **ماتعدّلش**)

**ليه:** صفحة الخصوصية اللي التطبيقات بتربط بيها (`/legal/#privacy`) لازم تذكر (أبل 5.1.1(i)): التطبيقات، صوت المكالمات ومعالجته
عند Anam برة مصر، الذاكرة الدايمة للمكالمات، رقم الزائر، طلب الحذف. **حالياً** القسم 3 بيقول إن البيانات مابتتنقلش برة مصر إلا وفق
القانون، والقسم 5 بيقول إنها بتتمسح بعد المدة اللازمة — ودول محتاجين صياغة حضرتك (أو محامي). المقترح (يُضاف لقسم «الخصوصية» في
`legal.part.py` بعد موافقتك):

**AR (مقترح):**
1. «تطبيقات المنصة: تطبيق «صنع في مصر» على أندرويد وآيفون بيعرض صفحات المنصة نفسها، وبينطبق عليه كل ما في السياسة دي.»
2. «المكالمات المباشرة مع المساعدين بالذكاء الاصطناعي (جنة وباسم): صوتك وكلامك أثناء المكالمة بيتبعتوا لمزوّد خدمة المحادثة المرئية (Anam) علشان يتحوّلوا لرد، وده ممكن يتم على خوادم برة جمهورية مصر العربية، وبموافقتك قبل أول مكالمة.»
3. «ذاكرة المساعدين: المنصة بتحتفظ بملخص مكالماتك مع باسم (لعضو الباقة) ومع جنة (لزائر الموقع، برقم عشوائي محفوظ على جهازك ومش مربوط باسمك إلا لو دخلت بحسابك) علشان يكمّلوا معاك، ومابتتمسحش إلا بطلب منك.»
4. «حذف الحساب: تقدر تطلب حذف حسابك وبياناته من لوحتك أو من صفحة «حذف الحساب»، والحذف بيتنفّذ خلال 30 يوم، مع الاحتفاظ باللي القانون بيطلبه بس (زي الفواتير الضريبية).»
5. «مفيش تتبّع إعلاني جوه تطبيق الآيفون.»

**EN (proposed):**
1. "The platform's apps: the «Made in Egypt» app for Android and iPhone shows the platform's own pages, and everything in this policy applies to it."
2. "Live calls with the AI assistants (Janna and Bassem): your voice and words during the call are sent to the video-chat provider (Anam) to be turned into a reply; this may take place on servers outside the Arab Republic of Egypt, and only with your consent before the first call."
3. "The assistants' memory: the platform keeps a summary of your calls with Bassem (for a plan member) and with Janna (for a site visitor, by a random number kept on your device and linked to your name only if you sign in) so they can carry on with you; it is erased only at your request."
4. "Account deletion: you can ask for your account and its data to be deleted from your dashboard or the «Delete your account» page; the deletion is carried out within 30 days, keeping only what the law requires (such as tax invoices)."
5. "No advertising tracking runs inside the iPhone app."

**نماذج المتاجر (App Privacy / Data safety)** — تتملّى من نفس القائمة: بيانات التواصل (الإيميل، الموبايل)، محتوى المستخدم (صوت
المكالمة، الرسائل وطلبات الأسعار، الصور المرفوعة)، المعرّفات (رقم العضو، رقم الزائر العشوائي)، بيانات الاستخدام، المشتريات
(الفواتير). كله مشفّر أثناء النقل. طريقة الحذف: `/delete-account/`. (`app/store/README.md` كان بيقول إن الصوت «while the call lasts» بس — اتصحّح: ملخص الكلام
بيتحفظ.)

---

## 5. لما «الأسعار والدفع جوه التطبيق» يتقفل — When buying is switched off inside an app (`app_buy_ios` / `app_buy_android`)

**ليه:** أبل (3.1.1 / 3.1.1(a)) وسياسة الدفع في جوجل بلاي ممكن يرفضوا تطبيق فيه أسعار ودفع برة نظام الدفع بتاعهم. المفتاحين
**شغّالين** = التطبيق زي الموقع بالظبط؛ لو حضرتك قفلتهم وقت المراجعة: الأسعار والباقات و«ادفع الآن» والتجديد والترقية بيختفوا
جوه التطبيق ده بس (الموقع والتطبيق التاني زي ما هم)، والتسجيل بيفضل شغّال من غير اختيار باقة (الفريق بيتابع الباقة مع العضو، ومفيش
فاتورة بتطلع لوحدها)، والسيرفر بيرفض أي دفع جاي من التطبيق ده. النصوص اللي بتظهر في الوضع ده:

| فين | عربي | English |
|---|---|---|
| صفحة الفاتورة `/pay/` جوه التطبيق | الدفع مش متاح جوه التطبيق. | Payment is not available inside the app. |
| رد السيرفر على طلب الدفع | الدفع مش متاح جوه التطبيق | payment is not available inside the app |
| رد طلب التسجيل من غير باقة | طلب الاشتراك اتسجّل. تقدر تدخل دلوقتي بكود على الإيميل وتكمّل بيانات شركتك، وفريق المنصة هيتابع معاك الباقة المناسبة لحسابك. | Your application is recorded. You can sign in now with an e-mail code and complete your company data; the platform team will follow up with you on the right plan for your account. |
| شات جنة لو حد سأل عن الأسعار | تفاصيل أسعار الباقات مش متاحة جوه التطبيق. عندنا 5 باقات سنوية: … | Plan prices are not available inside the app. We have 5 yearly plans: … |
| القائمة | «الباقات والتسجيل» ← «التسجيل» | "Plans & Registration" → "Registration" |
| مكتب باسم (مدة الخدمة خلصت) | مدة خدمتي السنوية معاك خلصت، فملخص الفرص اليومي والمكالمات وقفوا — وصفقاتك القديمة لسه موجودة هنا. | My one-year service period with you has ended, so the daily brief and video calls have stopped — your earlier deals are still here. |

وقاعدة ثابتة بتتضاف لتعليمات جنة/باسم في المكالمة اللي جاية من التطبيق ده بس (`worker/src/janna-session.js` APP_NO_PRICES):
- جنة: «قاعدة تطبيق الموبايل: الزائر بيكلمك من تطبيق المنصة على الموبايل. ماتذكريش أي أسعار أو مبالغ أو باقات مدفوعة أو طريقة دفع أو روابط دفع، وماتطلبيش منه يدفع أو يشترك. لو سأل عن الأسعار أو الاشتراك أو الدفع، قوليله بلطف إن التفاصيل دي مش متاحة جوه التطبيق، وكمّلي معاه في أي حاجة تانية.»
- باسم: «قاعدة تطبيق الموبايل: العضو بيكلمك من تطبيق المنصة على الموبايل. ماتذكرش أي أسعار أو مبالغ أو باقات مدفوعة أو تجديد أو ترقية أو طريقة دفع أو روابط دفع، وماتطلبش منه يدفع أو يجدّد. لو سأل عن الأسعار أو التجديد أو الدفع، قوله بلطف إن التفاصيل دي مش متاحة جوه التطبيق، وكمّل معاه في شغله.»
- (لو برومبت الشخصية مايتنسخش — مثلاً سرعة صوت محددة في Anam Lab — المكالمة بتبدأ عادي من غير القاعدة؛ التعديل الدايم لبرومبت
  جنة وباسم في Anam قرار حضرتك عن طريق `anam/`.)

---

## 6. «دخول فريق المنصة» جوه التطبيق — The team's entry inside the app

التطبيق مافيهوش شريط عنوان، فالفريق مايقدرش يكتب `/admin/`. جوه التطبيق بس (مش في المتصفح) بيظهر رابط صغير «دخول فريق المنصة» /
"Platform team sign-in" في آخر كل صفحة (جنب «لوحة الإدارة») وتحت كارت الدخول في `/login/`. بيفتح `/login/?team=1`: عضو الفريق
الداخل بالفعل بيروح على طول للوحته (المالك/الأدمن/المحرّر/الدعم ← `/admin/`، فريق SEO ← `/seo-team/`، فريق الداتا ← `/data-desk/`)،
وحساب مش من الفريق بيظهرله: «الحساب ده مش من حسابات فريق المنصة. لو إنت من الفريق، ادخل بإيميل الفريق بتاعك.» / "This account is not
a platform team account. If you are on the team, sign in with your team e-mail." والروابط بين اللوحات اللي بتفتح في تاب جديدة في
المتصفح، بتفتح في نفس الشاشة جوه التطبيق (والرجوع بيرجّع).

---

## 7. الإشعارات (Push) — اللي محتاجينه بس (مقفولة)

أبل (4.2) ممكن تعتبر التطبيق «موقع متغلّف» من غير مزايا خاصة بيه؛ الإشعارات من أقوى الحلول. **مش متشغّلة**، واللي محتاجينه:
1. من حضرتك: مشروع Firebase (لأندرويد: ملف `google-services.json`) ومفتاح APNs من حساب Apple Developer (Key ID + Team ID + ملف .p8).
2. من مطوّر (في PR منفصل): عائلة API جديدة `/api/push/*` (سطرين routes في `worker/wrangler.toml` لكل دومين + سطر في `worker/src/index.js`)،
   ملف قاعدة بيانات إضافي `0011_push_tokens.sql` (بيتشغّل بـ d1-migrate)، مُرسِل FCM HTTP v1 ومُرسِل APNs (أسرار Worker بتحطها
   حضرتك: `FCM_SERVICE_ACCOUNT`، `APNS_KEY`، `APNS_KEY_ID`، `APNS_TEAM_ID`)، `aps-environment` في إعدادات مشروع الآيفون، و
   `google-services.json` كسر في GitHub لـ `app-android.yml`.
3. في الموقع (جوه التطبيق بس، بعد الدخول): سؤال «تنبيهات الطلبات الجديدة» بنص توافق عليه، وزرار «🔔» عند باسم، وتذكيرات باسم
   والطلبات الجديدة ومواعيد الاجتماعات بالإشعارات.
4. وصف المتجر يتكتب عن مزايا التطبيق نفسه (مكالمات فيديو بالذكاء الاصطناعي، إشعارات، روابط بتفتح التطبيق).
