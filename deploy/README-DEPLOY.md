# نشر منصة «صنع في مصر» على Cloudflare

هذا الدليل يشرح نشر الموقع الجديد (Cloudflare Pages + Pages Functions) والـ API (الـ Worker) على الدومين `madeinegyptgate.com`، ثم تحويل الدومين من الموقع القديم إلى الجديد.
كل الأوامر تُشغَّل من جذر المشروع. الأوامر والأسماء التقنية تبقى بالإنجليزية كما هي.

> **قواعد ثابتة:**
> - سجلات DNS لا يغيّرها إلا الأمر `deploy.sh dns` (يشغّله المالك وقت التحويل، القسم 6)، وهو لا يلمس إلا سجلين: الجذر و`www`. سجلات البريد (MX وSPF وDKIM وDMARC و`mail` و`webmail`) لا تُلمس أبدًا.
> - لوحة إدارة المالك الحالية (`panel.html` + `login.html` + `/api/index.php`) تبقى على النظام القديم في النشر الأول **والثاني** (`deploy/legacy-live.txt`). لوحة التحكم الجديدة على `/admin/` وصفحة الدخول الجديدة على `/login/` (القسم 11).
> - كل نشر يبني الموقع من جديد في **مجلد فارغ** (`build/site-fresh`). لا يُنشر أبدًا مجلد فيه بقايا بناء قديم.
> - نسخ المعاينة (preview) لا تأخذ أي بيانات أو أسرار من الإنتاج.

---

## 1. الخلاصة: الأوامر بالترتيب

```bash
pip install pillow                                # مرة واحدة: المولّد يقص صور المنتجات والشعارات به
deploy/deploy.sh doctor                           # فحص للقراءة فقط: الأدوات وتسجيل الدخول والموارد
deploy/deploy.sh localtest                        # بناء نظيف + فحوص + نسخة محلية تتصرف مثل الإنتاج + اختبار الدخان
deploy/deploy.sh project                          # إنشاء مشروع Pages لو غير موجود
deploy/deploy.sh secrets --set ADVISOR_SECRET     # الأسرار (القسم 4) — مرة واحدة لكل اسم
deploy/deploy.sh secrets --set SEO_PLATFORM_KEY
deploy/deploy.sh preview                          # نشر تجريبي (بلا بيانات الإنتاج) + اختبار تلقائي
deploy/deploy.sh production                       # نشر الإنتاج على madeinegyptgate.pages.dev + اختبار
deploy/deploy.sh worker                           # الـ API: قاعدة D1 (schema + 0004 + 0005 + 0006) + نشر الـ Worker + فحص /api/*/health
deploy/deploy.sh domains                          # ربط الدومين و www بمشروع Pages
# جدولة النشر اليومي (القسم 7) — شرط قبل التحويل
# ثم التحويل (القسم 6) — كل خطوة أمر واحد، والموقع القديم يظل ظاهرًا حتى الخطوة الأخيرة:
deploy/deploy.sh dns                              # سجلان فقط: الجذر A 46.202.158.210 و www ← CNAME إلى madeinegyptgate.pages.dev
deploy/deploy.sh domains                          # مرة أخرى حتى يصبح الدومينان active
deploy/deploy.sh www-redirect                     # تحويل www ← الدومين الأساسي (301) + Always Use HTTPS
deploy/deploy.sh cutover                          # التحويل: mis-egypt يحتفظ فقط بلوحة إدارة المالك الحالية، والباقي للموقع الجديد
deploy/smoke-test.sh https://madeinegyptgate.com  # الاختبار النهائي على الدومين الحقيقي
# الرجوع للموقع القديم في ثوانٍ، أمر واحد:
deploy/deploy.sh cutover-rollback
```

> **النشر الأول (deploy 1): لوحة الإدارة الحالية للمالك تبقى كما هي.** الصفحات `panel.html` و`login.html` و`/api/index.php` (PHP على Hostinger) والسكربتات `data/auth.js` و`data/me.js` و`data/egadm.js` يظل يخدمها الـ Worker القديم `mis-egypt` بنفس الشكل والرابط والجلسة والبيانات. القائمة في `deploy/legacy-live.txt`، وهي المصدر الوحيد الذي تقرؤه السكربتات. لوحة التحكم الجديدة (Control Center) تأتي في النشر الثاني.

أوامر `stage` و`localtest` و`preview` و`production` و`release` تبني الموقع بنفسها أولًا (`deploy.sh build`). لا حاجة لتشغيل `python3 site.py` يدويًا قبلها.

---

## 2. ما الذي يُنشر وأين

| الجزء | على Cloudflare | المحتوى | الربط (bindings) |
|---|---|---|---|
| الموقع (إنتاج، الفرع `main`) | مشروع Pages باسم `madeinegyptgate` (رفع مباشر Direct Upload) | البناء النظيف بعد التجهيز + `functions/` (طبقة SEO الطرفية و`/api/seo/*`) | `SEO_KV` → KV ‏`migate-seo` (`b321fb348f3447179c99b4380952e5ac`) · `DB` → D1 ‏`migate-db` · متغيرات `SITE_ORIGIN` و`ADMIN_EMAILS` |
| نسخ المعاينة (أي فرع غير `main`) | نفس المشروع، روابط `*.madeinegyptgate.pages.dev` | نفس الملفات | **لا شيء** من الإنتاج: بلا KV وبلا D1 وبلا أسرار. الصفحات تُعرض كما بُنيت، و`/api/seo` يرد 503 `kv_off` |
| الـ API | Worker باسم `janna-lookup` (من `worker/`) | `/api/janna` `/api/advisor` `/api/meetings` `/api/auth` `/api/me` `/api/inquiries` `/api/admin` `/api/ev` `/api/unsub` `/api/wa` + مهمة cron كل 15 دقيقة | `DB` → D1 ‏`migate-db` (`f86e00bb-9739-4985-a149-3dddb45b2b42`) · `MEDIA` → R2 ‏`migate-media` |
| لوحة إدارة المالك الحالية (deploy 1) | Worker القديم `mis-egypt` (لا يُحذف ولا يُعدَّل) | `panel.html` و`login.html` و`/api/index.php` و`data/auth.js` و`data/me.js` و`data/egadm.js` من Hostinger كما اليوم (`deploy/legacy-live.txt`) | Routes محددة لكل مسار على `madeinegyptgate.com` و`www`، يضيفها `deploy.sh cutover` |

- إعدادات مشروع Pages مكتوبة في `deploy/wrangler-pages.toml` وتُرفع مع كل نشر، فهي المرجع الوحيد للـ bindings والمتغيرات. wrangler يقرأ المستوى الأعلى للإنتاج، وقسم `[env.preview]` لكل فرع آخر. الأسرار وحدها تُضبط بأمر منفصل.
- **لماذا المعاينة معزولة؟** كل نشر معاينة يشغّل كودًا لم يُراجع بعد على رابط عام. لو أخذ KV والـ D1 والأسرار من الإنتاج لاستطاع أن يكتب على بيانات الـ SEO الحية أو يقرأ الأسرار. فحص ما قبل النشر يرفض أي إعداد يعطي المعاينة KV أو D1 الإنتاج.
- مسار `/api/seo/*` يخدمه مشروع Pages وليس الـ Worker. لذلك **ممنوع** إضافة Route عام مثل `madeinegyptgate.com/api/*` للـ Worker، لأن Routes الـ Worker تسبق Pages وستُخفي لوحة الـ SEO. سكربت النشر يرفض هذا الإعداد، ويرفض أيضًا أي Route للـ Worker يغطي مسارًا من `deploy/legacy-live.txt` (مثل `/api/i*` الذي يغطي `/api/index.php`). فحص سريع للقراءة فقط: `deploy/deploy.sh worker-config`.
- طبقة الـ SEO الطرفية (`functions/_middleware.js`) لا تلمس أي طلب `/api/*` ولا أي طلب غير GET/HEAD: تمرره كما هو.
- **رؤوس الأمان (SEC M5):** كل صفحة HTML تمر على الـ Functions تأخذ من الـ middleware الرؤوس `Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'` و`X-Frame-Options: SAMEORIGIN` و`X-Content-Type-Options: nosniff` و`Referrer-Policy: strict-origin-when-cross-origin` (Pages لا يطبّق `_headers` على ردود الـ Functions). الملفات الثابتة خارج الـ Functions (`/data/*` و`/img/*` …) تأخذ نفس القيم من قاعدة `/*` في `_headers` التي يولّدها البناء. القيمة `'self'` وليست `'none'` لأن شاشة جنة المباشرة تعرض الموقع نفسه داخل iframe. لا يوجد `script-src` عمدًا (سكربتات داخلية وأداة Anam من unpkg/jsdelivr).

### الوضع الحالي على Cloudflare (فحص للقراءة فقط بتاريخ 2026-11-18)

| المورد | الحالة |
|---|---|
| KV ‏`migate-seo` | موجود (للإنتاج فقط) |
| D1 ‏`migate-db` | موجود وفارغ (0 جداول) |
| R2 ‏`migate-media` | موجود |
| مشروع Pages ‏`madeinegyptgate` | غير موجود بعد، ويُنشئه `deploy.sh project` |
| Worker ‏`janna-lookup` | غير منشور بعد |
| Worker ‏`mis-egypt` | **يعمل الآن** على Routes ‏`madeinegyptgate.com/*` و`www.madeinegyptgate.com/*`، وهو الذي يعرض الموقع القديم (proxy إلى استضافة Hostinger) ويحوّل روابط ووردبريس القديمة مثل `/factories/<slug>` إلى `company.html#N`. طالما هذان الـ Routes موجودان سيظل الموقع القديم هو الظاهر مهما تغيّر الـ DNS (القسم 6) |
| منطقة الدومين `madeinegyptgate.com` | نشطة على الخطة المجانية. فيها Route‏ان فقط، وكلاهما لـ `mis-egypt`. لا توجد Page Rules ولا Redirect Rules، فكل تحويلات الموقع القديم موجودة داخل كود `mis-egypt` |
| إعدادات الـ zone | «Always Use HTTPS» **مُطفأ**، لأن `mis-egypt` هو الذي يحوّل http إلى https حاليًا، ويجب تفعيله عند التحويل (القسم 6). إعدادات البوتات لا تعيد كتابة robots.txt (managed robots.txt ‏off، Block AI bots ‏off). Email Routing غير مفعّل |

---

## 3. المتطلبات

- Node.js ‏22.12 أو أحدث (wrangler 4، وتفريغ البيانات `tools/dump-data.mjs`، واختبارات الطبقة الطرفية).
- Python ‏3.8 أو أحدث مع **Pillow** (`pip install pillow`). بدون Pillow يتوقف البناء عمدًا، لأن نحو 1,300 صفحة ستفقد صور المنتجات وشعارات الشركات.
- bash وcurl (على ويندوز يُستخدم WSL أو Git Bash).
- wrangler ‏4.164.0، وهو موجود في `worker/package.json`. ثبّته مرة واحدة بـ `cd worker && npm install`، وإلا يستخدم السكربت `npx wrangler@4.164.0` تلقائيًا.
- تسجيل الدخول بإحدى طريقتين:
  - على جهازك: `npx wrangler login`
  - في CI أو cron: متغير `CLOUDFLARE_API_TOKEN`. أمرا `domains` و`rollback` يحتاجان التوكن دائمًا.
- رقم الحساب مضبوط افتراضيًا في السكربت `88c77c2b7595dd0ce510270175f69143`، ويمكن تغييره بـ `CLOUDFLARE_ACCOUNT_ID`.

**صلاحيات التوكن (Custom Token):**

| النطاق | الصلاحية |
|---|---|
| Account | Cloudflare Pages: Edit · Workers Scripts: Edit · D1: Edit · Workers KV Storage: Edit · Workers R2 Storage: Edit · Account Settings: Read |
| Zone ‏`madeinegyptgate.com` | Zone: Read · Workers Routes: Edit (أوامر `worker` و`routes` و`cutover` و`cutover-rollback`) |
| Zone (للأمر `www-redirect` فقط) | Single Redirect: Edit · Zone Settings: Edit |
| توكن منفصل `DNS_API_TOKEN` (للأمرين `dns` و`dns-rollback` فقط) | Zone ‏`madeinegyptgate.com`: DNS: Edit. توكن النشر نفسه لا يحتاج صلاحية DNS |

---

## 4. الأسرار (أسماء فقط، والقيم لا تُكتب في أي ملف)

اعرض الموجود والناقص بالأمر `deploy/deploy.sh secrets`.
لإضافة سر استخدم `deploy/deploy.sh secrets --set NAME`. السكربت يطلب القيمة مرتين بإدخال مخفي، ثم يضعها في **Pages إنتاج** و/أو الـ Worker حسب الاسم. **لا يضعها أبدًا في المعاينة.**
لتوليد قيمة قوية: `openssl rand -hex 32`. احفظ القيمة في مدير كلمات المرور، لأن Cloudflare لا يعرضها مرة أخرى.

| الاسم | Pages إنتاج | Pages معاينة | Worker ‏`janna-lookup` | ملاحظات |
|---|---|---|---|---|
| `ADVISOR_SECRET` | **مطلوب** | — | **مطلوب** | **نفس القيمة** في Pages إنتاج والـ Worker، لأنه يوقّع جلسات الدخول (توكن v2)، ولوحة الـ SEO تقبل بها جلسة أي مدير (role admin أو بريد في `ADMIN_EMAILS`) |
| `SEO_PLATFORM_KEY` | **مطلوب** | — | — | مفتاح **جديد خاص بـ Pages** (قيمة مختلفة عن `PLATFORM_KEY`). تقبله `/api/seo/*` في الهيدر `X-Platform-Key` (health والتصدير وIndexNow)، وتستخدمه أدوات `seo-pull` و`indexnow` واختبار `/api/seo/health` |
| `PLATFORM_KEY` | **ممنوع** | — | **مطلوب** | يبقى على الـ Worker فقط لأنه يفعّل الباقات. السكربت يرفض وضعه في Pages |
| `AUTH_SECRET` | فقط لو موجود على الـ Worker | — | اختياري | **نفس القيمة** لو استُخدم |
| `MEETINGS_SECRET` | — | — | **مطلوب** | اجتماعات جنة وروابط الدخول الموقّعة |
| `RESEND_API_KEY` | — | — | **مطلوب** | مزوّد البريد = **Resend** (قرار المالك). المرسل «منصة صنع في مصر <noreply@madeinegyptgate.com>»، والدومين موثّق عند Resend. سجلات بريد Hostinger (MX/SPF/DKIM/DMARC) لا تُلمس، وEmail Routing لا يُفعّل |
| `ANAM_API_KEY` | — | — | **مطلوب** | فيديو جنة/باسم المباشر وتفريغ الاجتماعات |
| `INDEXNOW_KEY` | اختياري | — | — | مفتاح IndexNow ثابت. يمكن توليده من لوحة الـ SEO بدلًا منه |
| `RESPONDIO_TOKEN`, `WA_WEBHOOK_SECRET` | — | — | اختياري الآن | واتساب عبر respond.io. من النشر الثاني يقدر المالك يحط توكن respond.io من لوحة التحكم «مفاتيح الخدمات» بدل السر ده (لو الاتنين موجودين السر هو اللي بيشتغل). `WA_DRY_RUN = "0"` والإرسال الحقيقي بيقرره زرار «تشغيل إرسال واتساب الحقيقي» في نفس الصفحة، وهو **مقفول** لحد ما ينجح اختبار التوكن وتوصل رسالة تجربة لرقم التجربة 01062531295 (موبايل المالك، قراره 2026-11-19) (القسم 11.4). `WA_DRY_RUN = "1"` = قفل نهائي لأي واتساب. لحد ما يتشغّل، كل ما يُرسل بواتساب يذهب بالبريد |
| `CONFIG_SECRET` | — | — | **مطلوب (النشر الثاني)** | مفتاح تشفير (AES-GCM) لمفاتيح بوابة الدفع والبريد وrespond.io وAnam اللي المالك بيحطها في لوحة التحكم. 32 حرف على الأقل: `openssl rand -hex 32`. **لو اتغيّر، كل المفاتيح المحفوظة في اللوحة بتبقى مش مقروءة** ولازم تتدخّل تاني |
| `BREVO_API_KEY` | — | — | اختياري | بديل لـ Resend من «إعدادات البريد» في لوحة التحكم |
| `TURNSTILE_SECRET` | — | — | اختياري | حماية النماذج من البوتات |
| `BRAVE_SEARCH_KEY` أو `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | — | — | اختياري | بحث على الويب عن مصانع مرشحة للطلبات التي لا يوجد لها عضو مسجّل (يظهر للمديرين فقط مع المصدر). بدونه يكون البحث من دليل المنصة فقط |
| `WA_TOKEN` | — | — | اختياري | تذكيرات واتساب Cloud API (مع المتغير `WA_PHONE_ID`) |
| `JANNA_KEY` | — | — | اختياري، والأفضل تركه | لو ضُبط يجب أن ترسل أداة جنة في Anam الهيدر `X-Janna-Key` |

> أسرار Pages تصل إلى **النشر التالي** فقط. بعد إضافة سر أو تغييره شغّل `deploy.sh production` من جديد. أسرار الـ Worker تعمل فورًا.
> «ابعتلي» بتفاصيل الفرص وملفاتها الرسمية **مالوش سر جديد**: الـ Worker ‏`janna-lookup` بيكلّم `migate-intel` عن طريق ربط خدمة (`[[services]] binding = "INTEL"` في `worker/wrangler.toml`) على اسم مضيف داخلي `mailpack.binding.invalid`، و`migate-intel` مابيردّش على المسار ده من أي اسم تاني (`worker-intel/INTEGRATION.md` §9). لازم `migate-intel` يكون موجود في الحساب قبل نشر `janna-lookup`، وإلا النشر بيفشل.
> المعاينة بلا أسرار عمدًا. لو أردت تجربة لوحة الـ SEO على معاينة، اتبع التعليمات المكتوبة في آخر `deploy/wrangler-pages.toml` (KV منفصل للمعاينة + `deploy.sh secrets --set ADVISOR_SECRET --env preview` بقيمة لا تُستخدم في أي مكان آخر).
> `PAGES_DEPLOY_HOOK` لا ينطبق على مشروع الرفع المباشر، لأن Deploy hooks متاحة فقط للمشاريع المربوطة بـ Git. زر «إعادة بناء الموقع» في لوحة الـ SEO سيعرض أنه غير مُعدّ، وهذا متوقع. التحديث يتم بالنشر اليومي (القسم 7).

---

## 5. النشر الأول خطوة بخطوة

### 5.1 البناء والتجهيز والفحوص

```bash
deploy/deploy.sh stage          # أو: deploy/deploy.sh localtest (نفس الشيء + اختبار محلي، القسم 5.2)
```

**البناء (`deploy.sh build`):**
- يمسح `build/site-fresh` ثم يشغّل `site.py` داخله (`MIG_OUT`). البناء في مجلد فارغ يضمن ألا تبقى صفحات من بناء سابق، مثل `about.html` القديمة أو صفحة سجل حُذف من البيانات.
- يرفض البناء لو وجد فحص المولّد نفسه أي مشكلة (`problem_count` في `build/seo-stats.json`)، أو لو كان Pillow غير مثبت.
- مجلد `site/` المحلي (الذي يعرضه الخادم المحلي) لا يُنشر ولا يُمس.

**التجهيز (`stage`)** ينسخ البناء إلى `build/pages-stage/site`:
- **يحوّل الروابط الرمزية (symlinks) إلى ملفات حقيقية**، وهي `data` و`img` و`media`. أي رابط رمزي يشير إلى خارج المشروع يُرفض. **الرابط المكسور خطأ يوقف النشر**، لأن الصفحات كانت ستُنشر بلا سكربتات أو صور.
- **يستبعد الملفات الزائدة والتجريبية** حسب `deploy/stage-exclude.txt`، ومنها الملفات المخفية، وملفات الترجمة المستخدمة في البناء فقط (3.2MB)، وصفحة العرض التجريبية `factory.html`، و`home.html`.
- ينسخ `functions/` (بدون الاختبارات) و`deploy/wrangler-pages.toml` باسم `wrangler.toml`.

**فحوص ما قبل النشر** (أي خطأ يوقف النشر):

- **حدود Pages:** 20,000 ملف (يمكن تغييره بـ `PAGES_MAX_FILES`)، و25MiB للملف، و`_redirects` حتى 2,000 قاعدة ثابتة و100 ديناميكية، و`_headers` حتى 100 قاعدة، و`_routes.json` حتى 100 قاعدة دون استثناء `/api/*`.
- **الملفات الإلزامية:** `index.html` و`404.html` و`410.html` و`en/index.html` و`robots.txt` و`sitemap.xml` و`_routes.json` و`_headers` و`_redirects` وملفات `_seo/` و`functions/_middleware.js`.
- **إعدادات Pages:** قسم `[env.preview]` موجود ولا يربط KV أو D1 الإنتاج، ولا أسماء تشبه الأسرار داخل `[vars]`.
- **بناء نظيف:** لا ملف `x.html` قديم بجانب `x/index.html`، ولا صفحات أقدم من وقت البناء، ولا صفحة قابلة للفهرسة خارج قائمة البناء (`_seo/pages.json`)، ولا صفوف «static» داخل مجلدات الصفحات المولّدة.
- **كل رابط داخلي يعمل:** كل سكربت وملف CSS وصورة تطلبه أي صفحة موجود في الرفع، وكل رابط `<a>` إلى madeinegyptgate.com يصل إلى صفحة أو تحويل (لا 404 ولا 410)، وروابط canonical وhreflang وog وJSON-LD (`url` و`isBasedOn` و`item` …) تشير إلى صفحات موجودة.
- **التحويلات:** كل قاعدة في `_redirects` لمسار تخدمه الـ Functions موجودة أيضًا في `_seo/redirects.json`. في الإنتاج لا يطبّق Pages ملف `_redirects` على الطلبات التي تمر على الـ Functions، فالطبقة الطرفية هي التي تحوّل.
- **robots.txt:** لا `#` داخل القواعد، ولا حجب للموقع كله عن أي محرك بحث (`Disallow: /` أو `/*`)، وفيه سطر الـ Sitemap.
- **خرائط الموقع:** كل رابط له صفحة موجودة وقابلة للفهرسة ورابطها القانوني يشير إليها نفسها، بلا تكرار ولا `#` أو `?`، وكل `<lastmod>` تاريخ كامل.
- **قواعد الأمانة والخصوصية:**
  - لا يوجد ادعاء «26k / 26,808» في أي صفحة أو ملف.
  - لا أرقام هواتف ولا إيميلات في الصفحات المولّدة وJSON-LD وخرائط الموقع و`_seo/` وملفات CSV. الكاشف يلتقط الموبايل والأرضي بأي فواصل (`02/ 22 419 416`، `(02) 2241 9416`، `0100-123-4567`، `+20 …`)، والأرقام بعد كلمة هاتف (`الخط الساخن 19876`، `تليفاكس:`)، وروابط `tel:` و`wa.me`، والإيميلات المموّهة (`info [at] x [dot] com`)، والأرقام العربية الهندية.
  - المستثنى فقط وسائل تواصل المنصة نفسها. أي إنذار خاطئ بعد مراجعته يُضاف إلى `deploy/privacy-allow.txt`.
  - الشركات الـ 91 في `data/factories.js` (عملاء المنصة، وثّقها فريق المنصة يدويًا — قرار المالك) تحمل «✓ موثّق من فريق المنصة» في الصفحة والوصف وJSON-LD، ولا تحمل أي عبارة «مصادر عامة» أو «غير مسجّل» (`verified_label`). الصفوف البحثية الأخرى في `data/facx.js` (ثلاثة اليوم: إيجيتك للكابلات، السويدي إليكتريك، حديد عز) وحدها تحمل «بيانات من مصادر عامة – غير مسجّل في المنصة». قوائم الأعضاء المستوردة (MIGOLDFAC) لا تحمل أيًّا منهما (`member_label`).
  - لا يوجد `VideoObject`، ولا صفحات مبنية من بيانات تجريبية (leads).
- **اختبارات الطبقة الطرفية:** `cd functions && npm test`، ومنها اختبار التطابق مع `authUser` في الـ Worker (أي اختلاف في منطق الدخول يوقف النشر).
- **wrangler نفسه:** `pages project validate` و`pages functions build`.

التقرير الكامل يُحفظ في `build/pages-stage/STAGE-REPORT.json`. لإعادة الفحص بدون نسخ من جديد: `deploy/deploy.sh check`.

### 5.2 اختبار محلي يتصرف مثل الإنتاج

```bash
deploy/deploy.sh localtest
```

- يبني ويجهّز ويفحص، ثم يصنع نسخة (روابط صلبة hard links، بلا مساحة إضافية) **بدون قواعد `_redirects` للمسارات التي تخدمها الـ Functions**، ثم يشغّل `wrangler pages dev` عليها مع KV وD1 محليين، ثم اختبار الدخان كاملًا، ثم يوقف الخادم.
- لماذا النسخة؟ `wrangler pages dev` العادي يطبّق `_redirects` خلف الـ Functions، والإنتاج لا يفعل ذلك. لو اعتمد تحويل على `_redirects` وحده لنجح محليًا وأعطى 404 في الإنتاج. هذه النسخة تُظهر الخطأ محليًا.

### 5.3 مشروع Pages والأسرار

```bash
deploy/deploy.sh project                         # ينشئ المشروع (فرع الإنتاج main) لو غير موجود
deploy/deploy.sh secrets --set ADVISOR_SECRET    # Pages إنتاج + الـ Worker، بنفس القيمة
deploy/deploy.sh secrets --set SEO_PLATFORM_KEY  # Pages إنتاج فقط، قيمة جديدة
deploy/deploy.sh secrets                         # تأكد أنه لا يوجد «missing required»، وأن المعاينة بلا أسرار
```

لو كان الـ Worker غير منشور بعد، ينشئ wrangler عند حفظ سر مشترك (مثل `ADVISOR_SECRET`) نسخة فارغة من `janna-lookup` بدون أي Route ليحفظ فيها السر. النشر الحقيقي في 5.5 يستبدل الكود ويحتفظ بالأسرار.

### 5.4 المعاينة ثم الإنتاج

```bash
deploy/deploy.sh preview       # نشر على الفرع preview ثم اختبار تلقائي على رابط النشر نفسه
deploy/deploy.sh production    # يطلب كتابة yes، ثم ينشر على main ويختبر رابط النشر نفسه
```

- `release` = معاينة ثم إنتاج بنفس النسخة المجهزة، ويتوقف عند أول فشل.
- رابط المعاينة الثابت هو `https://preview.madeinegyptgate.pages.dev`. Cloudflare يضيف `X-Robots-Tag: noindex` لروابط المعاينة، وهذا طبيعي.
- **في المعاينة** يتوقع الاختبار أن يرد `/api/seo/health` بـ 503 `kv_off`، لأن المعاينة بلا KV. هذا هو العزل المطلوب وليس عطلًا.
- **في الإنتاج** يتأكد الاختبار أن رابط النشر يعرض هذا البناء نفسه (وقت البناء في `/_seo/pages.json`)، وأن `/api/seo/health` يرد 401 على توكن غير صالح (أي أن الـ Function وKV والسر تعمل).
- **اختبار لوحة الـ SEO (A9):** يُجرى على `https://madeinegyptgate.pages.dev/seo-admin/` بعد نشر الإنتاج وقبل التحويل (المعاينة للقراءة فقط).
- **اختبار الروابط العربية (A10):** الاختبار التلقائي يفتح صفحة مصنع برابط عربي بالترميزين، بحروف ست عشرية كبيرة ثم صغيرة. لو فشل فاشحن بـ `slug_mode: "hash"` (يُضبط في `seo/config.json` أو بالمتغير `MIG_SEO_SLUG_MODE=hash`) وأعد النشر.
- **حماية إضافية اختيارية للمعاينة:** من لوحة Pages → Settings → General → «Access policy» يمكن قصر روابط المعاينة على فريق المنصة عبر Cloudflare Access.

### 5.5 الـ Worker (الـ API)

**(أ) الإعدادات:** `worker/wrangler.toml` يملكه صاحب الـ Worker، وفيه ربط D1 ‏`DB` → `migate-db` (`f86e00bb-9739-4985-a149-3dddb45b2b42`) وR2 ‏`MEDIA` → `migate-media`، وRoute لكل بادئة من بادئات الـ API على `madeinegyptgate.com` و`www` واحدًا واحدًا، والمتغيرات (`MAIL_FROM` = «منصة صنع في مصر <noreply@madeinegyptgate.com>»، `WA_DRY_RUN = "1"`، `ADMIN_EMAILS`، `TEAM_EMAIL` …). تحقّق منه قبل النشر:

```bash
deploy/deploy.sh worker-config     # للقراءة فقط
```

يرفض الفحص: ربط D1/R2 خاطئ (ومن النشر الثاني ربط KV ‏`SEO_KV`)، وأي Route عام (`/*` أو `/api/*`) أو يغطي `/api/seo`، وأي Route ليس بادئة API ولا واحدًا من ملفي النشر الثاني (`/data/overlay.js*` و`/media/u/*`)، وأي Route يغطي مسارًا من `deploy/legacy-live.txt`. وينبّه عندما تنقص بادئة يخدمها الـ Worker (`src/index.js`) Route على أحد الدومينين، أو عندما يكون `WA_DRY_RUN = "1"` (قفل نهائي للواتساب — النشر الثاني يطلع بـ `"0"`) أو قيمة غير `"0"`/`"1"`، أو `MAIL_FROM` غير مرسل Resend المتفق عليه، أو `LEGACY_ORIGIN` غير مضبوط.

**(ب) الأسرار:**

```bash
deploy/deploy.sh secrets --set PLATFORM_KEY
deploy/deploy.sh secrets --set MEETINGS_SECRET
deploy/deploy.sh secrets --set RESEND_API_KEY
deploy/deploy.sh secrets --set ANAM_API_KEY
```

**(ج) النشر:**

```bash
deploy/deploy.sh worker
```

الأمر `worker` ينفّذ الآتي بالترتيب:
1. يتحقق من `worker/wrangler.toml` (كما في (أ)).
2. يعيد بناء فهرس جنة `worker/src/data.json` من البيانات المنظفة.
3. قاعدة البيانات (`deploy.sh db`): ترتيب الإطلاق المعتمد **`schema.sql` ثم `migrations/0004` ثم `migrations/0005` ثم `migrations/0006`** (0006 = لوحة التحكم، النشر الثاني — القسم 11). الأداة `deploy/d1_migrate.py` تقرأ الجداول والأعمدة الموجودة فعلًا، ثم:
   - على قاعدة فارغة (حالة `migate-db` اليوم): `schema.sql` ثم 0004 ثم 0005.
   - على قاعدة أقدم: تضيف أولًا الأعمدة الناقصة فقط (من `worker/tools/upgrade-pre-0004.sql` و`upgrade-pre-0005.sql` و`upgrade-pre-0006r.sql` — الأخير لقاعدة اتطبّق عليها أول إصدار من 0006، زي الإنتاج من 18 نوفمبر: العمود `cc_invoices.period_end` بتاع إصلاحات المراجعة)، لأن `ALTER TABLE … ADD COLUMN` يفشل لو العمود موجود.
   - بعدها تتحقق أن كل جدول وكل عمود في `schema.sql` موجود. كل خطوة آمنة للتكرار.
   - **أي migration رقمها بعد 0006 تُرفض** لحد ما تتضاف لـ `ALLOWED_MIGRATIONS` في `deploy/d1_migrate.py`. ومفيش `wrangler d1 migrations apply` أبدًا.
4. ينشر الـ Worker.
5. يفحص `/api/*/health`، ويتأكد أن `/api/me` و`/api/admin/…` و`/api/ev` يرد عليها الـ Worker نفسه.

ملاحظات:
- مسارات الـ Worker محددة (`/api/janna/*` وغيرها)، وهي أدق من Route الموقع القديم `madeinegyptgate.com/*`. لذلك يعمل الـ API على الدومين **فور النشر حتى قبل التحويل**.
- قاعدة أقدم من كل ملفات الترقية (ينقصها عمود لا يضيفه أي ملف) تُرفض برسالة تطلب تطبيق `worker/migrations/0002` و`0003` يدويًا أولًا.
- البريد الوارد غير مطلوب: كل إيميل طلب يُرسل لمصنع فيه رابط دخول موقّع لمرة واحدة يفتح `dashboard.html` على «طلبات واردة لي». لا تفعّل Email Routing على الدومين الرئيسي، لأن ذلك يستبدل سجلات MX ويوقف بريد Hostinger.

### 5.6 ربط الدومين بمشروع Pages

```bash
export CLOUDFLARE_API_TOKEN=…   # توكن بصلاحية Cloudflare Pages: Edit
deploy/deploy.sh domains
```

الأمر يضيف `madeinegyptgate.com` و`www.madeinegyptgate.com` إلى المشروع عبر الـ API. سيظل الدومينان في حالة «Pending» حتى يُوجَّه الـ DNS إلى Pages (القسم 6، الخطوة 1).

---

## 6. التحويل من الموقع القديم (كل خطوة أمر واحد)

**الوضع اليوم:** الـ Worker القديم `mis-egypt` يملك الـ Route‏ين `madeinegyptgate.com/*` و`www.madeinegyptgate.com/*`، فيعرض الدومين كله من Hostinger مهما كان الـ DNS. لوحة إدارة المالك `panel.html` وصفحة `login.html` والـ API ‏`/api/index.php` (PHP) جزء من هذا النظام.

**بعد التحويل (deploy 1):** الموقع الجديد (Pages) والـ API الجديد (`janna-lookup`) يخدمان كل شيء، **إلا** مسارات `deploy/legacy-live.txt` التي يظل `mis-egypt` يخدمها من Hostinger كما اليوم بالضبط:

| المسار (على `madeinegyptgate.com` و`www`) | لماذا يبقى على النظام القديم |
|---|---|
| `/panel.html` | لوحة الإدارة الحالية «لوحة الإدارة – صنع في مصر» (الأعضاء والاشتراكات، الشركات، المنتجات، الطلبات والرسائل، RFQ، SEO، الباقات والصلاحيات، بوابة الدفع، البريد، الإعدادات) |
| `/login.html` | دخول المالك بالإيميل وكلمة المرور (جلسة PHP) |
| `/api/index.php*` | الـ API الخاص باللوحة (PHP على Hostinger) |
| `/data/auth.js` و`/data/me.js` و`/data/egadm.js` | سكربتات تحمّلها صفحات النظام القديم (`egadm.js` مطابق لنسخة الموقع الجديد) |

- الـ Worker `mis-egypt` نفسه **لا يُحذف ولا يُعدَّل أبدًا**. تتغير الـ Routes فقط.
- بعد الدخول من `login.html` تفتح صفحة `dashboard.html`، وهي الآن لوحة العملاء الجديدة (دخول بكود الإيميل). المالك يفتح لوحته مباشرة: **https://madeinegyptgate.com/panel.html** (يُفضّل حفظها في المفضلة). مساحة عمل SEO الجديدة (`/seo-admin/`) فيها رابط مباشر للوحة الحالية ولصندوق الطلبات `inbox.html`.
- البريد (Hostinger) لا يتأثر: لا يُلمس أي سجل بريد.

**قبل البدء — كل هذه الشروط مطلوبة** (أمر `cutover` يفحص أغلبها بنفسه ويرفض لو لم تتحقق):
- `deploy.sh production` نجح، و`deploy/smoke-test.sh --no-worker https://madeinegyptgate.pages.dev` بلا FAIL.
- `deploy.sh worker` نجح (الـ Worker الجديد له Routes على الدومين، منها `/api/auth/*`).
- **النشر اليومي مُجدول (القسم 7).** حالات المناقصات والعروض وتاريخ صفحة المناقصات تُحسب يوم البناء. تحقّق بالأمر `deploy/deploy.sh doctor`: سطر «live production build … h old» يجب أن يكون أقل من 26 ساعة.
- اختر وقتًا هادئًا.

**سجلات الـ DNS (قراءة من Cloudflare بتاريخ 2026-11-18):**

| السجل | القيمة | الإجراء |
|---|---|---|
| `A madeinegyptgate.com` | ‏46.202.158.210 (proxied) | **يتغير** إلى `CNAME → madeinegyptgate.pages.dev` (proxied) |
| `CNAME www` | ‏`madeinegyptgate.com` (proxied) | **يتغير** إلى `CNAME → madeinegyptgate.pages.dev` (proxied) |
| `MX madeinegyptgate.com` | ‏`srv2142320.hstgr.cloud` | لا يُلمس |
| `A mail` و`A webmail` | ‏2.24.62.250 (DNS only) | لا يُلمس |
| TXT على الجذر | ‏SPF و`brevo-code` | لا يُلمس |
| `TXT _dmarc` | ‏DMARC | لا يُلمس |
| مفاتيح DKIM | ‏`brevo1/brevo2._domainkey`، و`mail2026._domainkey`، و`resend._domainkey`، وثلاثة سجلات `…_domainkey → dkim.amazonses.com` | لا يُلمس |
| `CNAME send` و`CNAME rsend` | ‏`*.forge.rmta.net` | لا يُلمس |

**الخطوات بالترتيب** (الموقع القديم يظل ظاهرًا للزوار حتى الخطوة 4):

1. **DNS — سجلان فقط:**
   ```bash
   export DNS_API_TOKEN=…        # توكن منفصل بصلاحية DNS: Edit على الدومين فقط
   deploy/deploy.sh dns
   ```
   - يحفظ أولًا نسخة من **كل** السجلات في `build/deploy-logs/dns-backup-<الوقت>.json`، ثم يعرض الخطة ويطلب كتابة `yes`.
   - لا يغيّر إلا سجلات A/AAAA/CNAME التي اسمها بالضبط `madeinegyptgate.com` أو `www.madeinegyptgate.com`. يستحيل عليه لمس MX أو TXT (SPF/DMARC/brevo-code) أو أي `_domainkey` أو `mail` أو `webmail` أو `send` أو `rsend`.
   - يغيّر نوع السجل في طلب واحد (PUT) بلا فجوة. لو رفض الـ API تغيير النوع يتوقف بلا أي تغيير ويشرح التعديل اليدوي من اللوحة.
   - يرفض لو كان الجذر ليس `A 46.202.158.210` (حالة غير متوقعة) إلا مع `--force`.
   - لا شيء يتغير للزوار هنا، لأن `mis-egypt` ما زال يملك الـ Route‏ين العامين.
   - الرجوع (نادرًا ما يلزم): `deploy/deploy.sh dns-rollback` يعيد السجلين كما في آخر نسخة احتياطية.
2. **انتظر تفعيل الدومينين:** `deploy/deploy.sh domains` حتى يظهر الاثنان `active` (عادةً دقائق). لو بقيا Pending أكثر من 30 دقيقة تأكد أن السجلين CNAME إلى `madeinegyptgate.pages.dev` وProxied، ثم اضغط إعادة التحقق في صفحة الدومين في لوحة Pages.
3. **تحويل www و HTTPS:** `deploy/deploy.sh www-redirect` ينشئ قاعدة Redirect ‏`www.madeinegyptgate.com/*` ← `https://madeinegyptgate.com/…` بكود 301 (المسار والـ query كما هما)، ويفعّل «Always Use HTTPS» (مُطفأ حاليًا). يحتاج صلاحيتي Single Redirect: Edit وZone Settings: Edit؛ أو من اللوحة: Rules → Redirect Rules، وSSL/TLS → Edge Certificates. الـ Worker القديم يقوم بالتحويلين الآن، فلا يتغير شيء للزوار.
4. **التحويل:**
   ```bash
   deploy/deploy.sh cutover
   ```
   - **فحص مسبق** يرفض لو: الدومينان ليسا active، أو `https://madeinegyptgate.pages.dev` لا يعرض البناء الجديد، أو الـ Worker ‏`mis-egypt` غير موجود، أو الـ Worker الجديد بلا Routes على الدومين.
   - يعرض الخطة ثم يطلب `yes`.
   - **أولًا** يضيف 12 Route محددًا لـ `mis-egypt` (المسارات الستة أعلاه × الدومين و`www`). ما زال الـ Route‏ان العامان موجودين، فلا يتغير شيء.
   - يتأكد أن الـ 12 كلها موجودة ومربوطة بـ `mis-egypt`. لو فشل أي منها يتوقف **دون** حذف الـ Route‏ين العامين (الموقع القديم يبقى كما هو).
   - **ثم** يحذف الـ Route‏ين العامين `madeinegyptgate.com/*` و`www.madeinegyptgate.com/*`. في هذه اللحظة يظهر الموقع الجديد للجميع، ولوحة الإدارة الحالية تعمل كما هي.
   - بعد 20 ثانية يشغّل اختبار الدخان على `https://madeinegyptgate.com`. لو فشل يطبع أمر الرجوع.
   - آمن للتكرار. حالة الـ Routes في أي وقت (قراءة فقط): `deploy/deploy.sh routes`.
5. **تنظيف بقايا القواعد القديمة** (SEO-SPEC §4):
   - ابحث في Page Rules وBulk Redirects وRedirect Rules عن أي تحويل لـ `/factories/*` أو `/tender-item/*` أو `/industrial_products/*` أو `/rfq/*` أو `/tenders/` أو `/products/`، واحذفه. تحويلات الموقع القديم المعروفة كانت داخل `mis-egypt` وتتوقف مع حذف الـ Route‏ين العامين.
   - من Security → Bots: اترك «managed robots.txt» و«Block AI bots» مطفأين كما هما الآن، حتى لا يُعاد كتابة robots.txt. اختبار الدخان ينبّه لو اختلف عن نسخة البناء.
   - فعّل Caching → Crawler Hints.
6. **الاختبار النهائي:**
   ```bash
   deploy/smoke-test.sh --max-age 30 https://madeinegyptgate.com
   ```
   يجب ألا تظهر أي FAIL. الاختبار يفحص أيضًا أن `panel.html` و`login.html` و`/api/index.php` و`data/auth.js` و`data/me.js` و`data/egadm.js` ما زال يخدمها النظام القديم (وليس الموقع الجديد)، وأن `dashboard.html` و`inbox.html` و`seo-admin.html` و`track.html` تحوّل بقفزة واحدة إلى صفحاتها (noindex)، ورؤوس الأمان، و`/api/*/health`. لو ظهر `The old site is still answering` فالـ Route‏ان العامان ما زالا موجودين.
7. بعد ذلك: خطوات Search Console وBing وYandex في `docs/janna/SEO-SPEC.md` القسم 4.

**الرجوع (Rollback) خلال ثوانٍ — أمر واحد:**

```bash
deploy/deploy.sh cutover-rollback          # أو بدون أسئلة: deploy/deploy.sh cutover-rollback --yes
```

يعيد الـ Route‏ين العامين `madeinegyptgate.com/*` و`www.madeinegyptgate.com/*` لـ `mis-egypt`، فيعود الموقع القديم فورًا لكل الزوار (الـ Worker يجلب الموقع من Hostinger مباشرة ولا يعتمد على الـ DNS، فيمكن ترك الـ DNS كما هو). الـ Routes المحددة الـ 12 تبقى وهي غير ضارة، وRoutes الـ API الجديد لا تُلمس. يحتاج `CLOUDFLARE_API_TOKEN` بصلاحية Workers Routes: Edit.

بدون السكربت (من أي جهاز، أو من اللوحة: Workers Routes → Add route → النمط → Worker ‏`mis-egypt`):

```bash
Z=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=madeinegyptgate.com" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"][0]["id"])')
for P in 'madeinegyptgate.com/*' 'www.madeinegyptgate.com/*'; do
  curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$Z/workers/routes" --data "{\"pattern\":\"$P\",\"script\":\"mis-egypt\"}"; echo
done
```

---

## 6ب. البديل: الموقع من R2 عبر الـ Worker ‏`migate-site` (بدون Pages)

يُستخدم فقط لو تعذّر رفع Pages: بروكسي الخروج في بيئة النشر يستبدل هيدر Authorization في طلبات api.cloudflare.com، بينما رفع ملفات Pages يحتاج توكن الرفع الخاص بـ Cloudflare.

- **الكود:** `worker-site/` ‏(`src/index.js` و`src/pages.js`). يخدم نفس البناء المجهّز (`build/pages-stage/site`) من الـ bucket ‏`migate-site` بنفس سلوك Pages:
  - الروابط النظيفة و308.
  - `404.html` بكود 404.
  - ETag و304 وRange.
  - `_headers` و`_redirects` و`_routes.json`.
  - `functions/_middleware.js` و`functions/api/seo/[[path]].js` كما هما دون تعديل.
  - تحويل www وhttp إلى `https://madeinegyptgate.com` بكود 301.
- **الـ bindings:** نفس bindings مشروع Pages.
- **الأسرار:**
  - `ADVISOR_SECRET` بنفس قيمته في `janna-lookup`.
  - `SEO_PLATFORM_KEY`.
  - `DEPLOY_TOKEN` وقت الرفع فقط.
- **الحالة (2026-11-18):** منشور على `https://migate-site.daily-spoonbill.workers.dev` بلا أي Route. الرفع متوقف عند ~500 من 8,722 ملفًا بطلب المنسّق.

**إكمال الرفع** (يعيد رفع كل الملفات ولا ضرر من التكرار). المعدّل عبر البروكسي حوالي ملفين في الثانية، أي حوالي 75 دقيقة:

```bash
DEPLOY_TOKEN=… node worker-site/tools/upload.mjs build/pages-stage/site https://migate-site.daily-spoonbill.workers.dev --concurrency 24
cd worker-site && npx wrangler secret delete DEPLOY_TOKEN        # بعد الرفع: نقطة /__deploy/ ترد 404 بدون السر
deploy/smoke-test.sh --no-worker --stage build/pages-stage https://migate-site.daily-spoonbill.workers.dev
```

**التحويل:** أمر واحد. لا يحتاج تغيير DNS لأن سجل الجذر proxied:

```bash
CLOUDFLARE_API_TOKEN=… deploy/cutover-worker.sh
```

يعمل بالترتيب التالي:
1. فحص مسبق: الـ Worker موجود ويخدم البناء كاملًا، و`mis-egypt` موجود، و`janna-lookup` له Routes على الـ API.
2. إضافة الـ 12 Route المحددة لـ `mis-egypt` (`panel.html` و`login.html` و`/api/index.php` …) لو ناقصة.
3. نقل الـ Route‏ين العامين `madeinegyptgate.com/*` و`www.madeinegyptgate.com/*` من `mis-egypt` إلى `migate-site`، كل واحد في طلب واحد. لا يمكن أن يملك Worker‏ان نفس النمط، ولا توجد لحظة بلا Route.

Routes الـ API الخاصة بـ `janna-lookup` تبقى كما هي لأنها أدق.

**الرجوع:** أمر واحد يعيد الـ Route‏ين العامين لـ `mis-egypt`:

```bash
CLOUDFLARE_API_TOKEN=… deploy/rollback-worker.sh
```

---

## 7. التحديث اليومي (شرط قبل التحويل)

حالة كل مناقصة وكل عرض، وتاريخ صفحة المناقصات، تُحسب يوم البناء. الصفحات تعيد فحص المواعيد في المتصفح أيضًا، لكن هذا يغطي الفجوة بين بناءين فقط. لذلك يُبنى الموقع ويُنشر يوميًا.
`deploy.sh production --yes` يبني من جديد في مجلد فارغ، ويفحص، ويشغّل اختبارات الطبقة الطرفية، وينشر، ويختبر. لا حاجة لأي خطوة قبله.

**cron على جهاز فيه المشروع** (الساعة 02:37 UTC، أي حوالي 4:37 أو 5:37 صباحًا بتوقيت القاهرة حسب التوقيت الصيفي):

```cron
37 2 * * * cd /path/to/madeinegyptgate && CLOUDFLARE_API_TOKEN=… deploy/deploy.sh production --yes >> build/cron.log 2>&1
```

**أو GitHub Actions** لو نُقل المشروع إلى GitHub. ضع `CLOUDFLARE_API_TOKEN` و`CLOUDFLARE_ACCOUNT_ID` و`SEO_PLATFORM_KEY` في Secrets المستودع:

```yaml
name: daily-deploy
on: { schedule: [ { cron: "37 2 * * *" } ], workflow_dispatch: {} }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: pip install pillow           # بدونه يتوقف البناء
      - run: cd worker && npm ci          # wrangler 4.164.0
      - run: deploy/deploy.sh production --yes
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          SEO_PLATFORM_KEY: ${{ secrets.SEO_PLATFORM_KEY }}
      # بعد التحويل فقط. قبله يكفي الاختبار الذي يشغّله deploy.sh على رابط النشر
      - run: deploy/smoke-test.sh -q --max-age 30 https://madeinegyptgate.com
```

- `seo/lastmod.json` يتحدث مع كل بناء (تواريخ `<lastmod>` في الخرائط). في GitHub Actions أضف خطوة commit له، أو احفظه كـ artifact، حتى لا تتغير التواريخ بلا سبب.
- مشروع Pages بالرفع المباشر لا يمكن تحويله لاحقًا إلى مشروع مربوط بـ Git. هذا المسار (CI يبني ثم يرفع) يغني عن ذلك.
- بعد كل نشر للإنتاج يمكن تشغيل `tools/indexnow-after-deploy.mjs` لو أضيف (SEO-SPEC 2.6).
- `deploy/smoke-test.sh --max-age 30` يفشل لو كان آخر بناء منشور أقدم من 30 ساعة، أي لو توقف النشر اليومي.

---

## 8. الرجوع لنسخة سابقة

| الحالة | الأمر |
|---|---|
| نشر Pages سيئ | `deploy/deploy.sh deployments` لعرض المعرّفات، ثم `deploy/deploy.sh rollback <id>`. أو من اللوحة: Pages → Deployments → «Rollback to this deployment» |
| Worker سيئ | `cd worker && npx wrangler rollback` (يرجع للإصدار السابق) |
| الموقع الجديد كله | `deploy/deploy.sh cutover-rollback` (أمر واحد: يعيد الـ Route‏ين العامين لـ `mis-egypt`، القسم 6) |
| تعديل SEO خاطئ من اللوحة | زر «استرجاع» في `/seo-admin/` (يبدّل `seo:bundle` مع `seo:bundle:prev`) |

---

## 9. مشاكل شائعة

| الرسالة | السبب والحل |
|---|---|
| `Pillow is missing` | `pip install pillow` ثم أعد الأمر |
| `the build wrote no _seo/pages.json` | `site.py` لم يُدمج فيه المولّد بعد (`seo_build.part.py`). يقوم به المُدمِج |
| `the generator's own validation found problems` | المولّد وجد مشاكل في صفحاته (القائمة تظهر فوق الرسالة، والتفاصيل في `build/seo-stats.json`). تُصلَح في المولّد أو في البيانات |
| `required build files are missing` | البناء ليس البناء الجديد، أو ينقصه ملف مثل `en/index.html` أو `404.html` |
| `stale_flat_pages` / `stale_build_files` / `unlisted_pages` / `static_rows_in_generated_trees` | بقايا بناء قديم في مجلد البناء. لا تستخدم `--site-dir` مع مجلد قديم؛ اترك `deploy.sh` يبني في مجلد فارغ |
| `symlink_broken` / `assets_missing` / `missing_assets` | ملفات `data` أو `img` غير موجودة في البناء (رابط رمزي مكسور بعد نقل المشروع، أو Pillow كان ناقصًا). أعد البناء بـ `deploy.sh build` |
| `broken_links` / `head_links` / `jsonld_links` | صفحة تربط إلى عنوان على الموقع يرد 404 أو 410. الأمثلة في التقرير تذكر الصفحة والرابط |
| `redirect_not_in_edge_map` | قاعدة في `_redirects` غير موجودة في `_seo/redirects.json`؛ في الإنتاج سترد 404. يصلحها المولّد |
| `privacy_pages` / `jsonld_privacy` / `privacy_or_claim_files` | رقم هاتف أو إيميل في صفحة مولّدة أو في JSON-LD أو الخرائط أو CSV. يُصلح في المولّد أو البيانات. لو كان إنذارًا خاطئًا بعد المراجعة (رقم مرجعي يشبه رقم أرضي مثلًا) أضفه إلى `deploy/privacy-allow.txt` |
| `preview_isolation` | `deploy/wrangler-pages.toml` يعطي المعاينة KV أو D1 الإنتاج، أو ليس فيه `[env.preview]` |
| `robots_block_all` | robots.txt يحجب الموقع كله (`Disallow: /` أو `/*`) عن محرك بحث (`*` أو Googlebot أو Bingbot أو Yandex …). تحذير `robots_block_bots` لو كان المحجوب بوتًا آخر (مثل بوتات الذكاء الاصطناعي)، وهذا مقبول لو كان مقصودًا |
| `the OLD site is answering` في اختبار الدخان | الـ Route‏ان العامان لـ `mis-egypt` ما زالا موجودين: `deploy.sh cutover` (القسم 6 خطوة 4) |
| `the owner's live admin path is not answered by the old system` / `served by the NEW site` | ينقص Route محدد لـ `mis-egypt` (لوحة الإدارة الحالية): `deploy.sh routes` ثم `deploy.sh cutover` (يضيف الناقص)، أو `deploy.sh cutover-rollback` |
| `pre-flight failed` عند `cutover` | لم يتغير شيء. السبب مكتوب فوق الرسالة: الدومينان ليسا active (`dns` ثم `domains`)، أو الإنتاج غير منشور، أو الـ Worker الجديد بلا Routes |
| `route conflicts` عند `cutover` | نمط من الأنماط مربوط بـ Worker آخر. صحّحه من Workers Routes ثم أعد الأمر |
| `REFUSE` عند `dns` | الجذر ليس `A 46.202.158.210` كما هو متوقع. افحصه، ثم `--force` لو كنت متأكدًا |
| `security_headers` في البوابة / `security headers missing` في اختبار الدخان | `_headers` بلا قاعدة `/*` لرؤوس الأمان، أو الـ middleware لا يضيفها (SEC M5) |
| `legacy_live_pages` | البناء فيه `panel.html` أو `login.html`؛ في النشر الأول والثاني يخدمهما النظام القديم فقط (لوحة التحكم الجديدة `/admin/`) |
| `/admin/ → … expected the new Control Center` في اختبار الدخان | نشر Pages الحالي ليس بناء النشر الثاني (`panel.part.py`): `deploy.sh production` |
| `/data/overlay.js → 200 but no X-Overlay-V` | النسخة الثابتة من Pages هي اللي بترد: ينقص Route الـ Worker ‏`/data/overlay.js*` — `deploy.sh worker` |
| `config_secret_missing` في لوحة التحكم | `CONFIG_SECRET` غير مضبوط على الـ Worker أو أقصر من 32 حرف: `deploy.sh secrets --set CONFIG_SECRET` |
| `D1 … cannot be brought up to date automatically` | قاعدة أقدم من ملفات الترقية: طبّق `worker/migrations/0002` و`0003` يدويًا ثم أعد `deploy.sh db` |
| `the deployment serves the build of …` | رابط النشر يعرض بناءً آخر (نشر قديم أو كاش). أعد النشر |
| `the live build is … h old` | النشر اليومي متوقف (القسم 7) |
| `301 with a relative Location` | التحويل جاء من ملف `_redirects` وليس من الطبقة الطرفية؛ في الإنتاج لن يعمل. أصل المشكلة في `_seo/redirects.json` |
| `/api/seo/health → 503 kv_off` على الإنتاج | الـ binding ‏`SEO_KV` غير موجود: تأكد أن النشر تم عبر `deploy.sh` (الذي يرفع `wrangler.toml`). **على المعاينة هذا هو المتوقع** |
| `/api/seo/health → 503 auth_off` | `ADVISOR_SECRET` غير مضبوط على Pages إنتاج، أو تمت إضافته بعد آخر نشر. أعد `deploy.sh production`. اختبار الدخان يرسل توكن غير صالح عمدًا: الرد 401 يعني أن كل شيء مضبوط |
| `/api/seo/health → 503 auth_backend_off` | لا يوجد مصدر للأدوار (ربط D1 ‏`DB`). تأكد أن النشر تم عبر `deploy.sh` |
| `/api/<x>/health → 404` | الـ Worker غير منشور، أو التوكن لم يستطع إنشاء الـ Routes (صلاحية Workers Routes على الـ zone) |
| `could not find zone` عند `deploy.sh worker` | التوكن بلا صلاحية على الـ zone. انظر القسم 3 |
| `Pages only supports up to 20,000 files` | الخطة المجانية. خفّض عدد الملفات أو اشترك في خطة مدفوعة واضبط `PAGES_MAX_FILES` |
| تحذير `data_files_review` | ملفات `data/*.js` تُنشر للعموم، وفيها نصوص تشبه أرقامًا أو إيميلات. حاليًا: رقم أرضي وعنوان شركة في `data/oldfacd.js` و`data/i18n-en.js` (السجل 2258)، ومدخلات ميتة من النسخة السعودية في `data/i18n-en.js` (`info@madeinsaudigate.com`، لا تظهر في أي صفحة لكن الملف عام)، ورقم مرجعي يشبه رقمًا أرضيًا في `data/i18n-en.js`، والخط الساخن لمتجر في `data/offers.js`، وعنوان helpdesk حكومي عام ومعرّف داخل رابط في `data/advisor-guides.js`. يُصلحها أصحاب البيانات |

---

## 10. ملفات هذا المجلد

| الملف | الوظيفة |
|---|---|
| `deploy.sh` | الأوامر كلها (`deploy/deploy.sh --help`). السجلات تُحفظ في `build/deploy-logs/` |
| `stage.py` | التجهيز وفحوص ما قبل النشر، ونسخة محاكاة الإنتاج (`emulate`)، وكاشف بيانات التواصل (`contacts`). يعمل بمكتبة Python القياسية فقط |
| `stage-exclude.txt` | قائمة الملفات التي لا تُرفع |
| `wrangler-pages.toml` | إعدادات مشروع Pages: الـ bindings والمتغيرات للإنتاج، وقسم `[env.preview]` المعزول |
| `smoke-test.sh` | اختبار ما بعد النشر بطلبات قراءة فقط عبر curl: الصفحات والملفات التي تحمّلها، والخرائط، وrobots، والروابط القديمة وخريطة التحويلات، وكودا 410 و404، والروابط العربية، ومحاولات التحويل لمواقع أخرى، والـ headers، وعمر البناء، و`/api/*/health` (`deploy/smoke-test.sh --help`) |
| `legacy-urls.txt` | روابط الموقع القديم (من خريطته الحية) التي يجب أن تعمل في الموقع الجديد |
| `legacy-live.txt` | النشر الأول والثاني: مسارات لوحة إدارة المالك القديمة التي يظل `mis-egypt` يخدمها (تقرؤها `deploy.sh` و`stage.py` و`smoke-test.sh`) |
| `d1_migrate.py` | يخطط خطوات قاعدة D1 (`schema.sql` ثم 0004 ثم 0005 ثم 0006، والأعمدة الناقصة لقاعدة أقدم) ويتحقق من النتيجة |
| `privacy-allow.txt` | الإنذارات الخاطئة لكاشف الأرقام والإيميلات بعد مراجعتها |

---

## 11. النشر الثاني — لوحة التحكم (Admin Control Center) وبوابة الدفع وصلاحيات الباقات

### 11.1 إيه اللي بيتنشر
- **الموقع (Pages):** `/admin/` «لوحة التحكم» (أدوار: المالك، المدير، المحرر، الدعم)، `/login/` صفحة الدخول الوحيدة (كود على الإيميل + «حساب قديم؟ ادخل بالباسورد بتاعك» + تحويل فريق العمل للوحته)، `/pay/` دفع الفواتير، `/seo-team/` و`/data-desk/` لوحات الفرق، وتبويبات «منتجاتي» و«ملف الشركة» و«فواتيري» في `/dashboard/`. `/admin.html` بيتحوّل 301 لـ `/admin/`.
- **الـ API (الـ Worker ‏`janna-lookup`):** `/api/admin/cc/*` (لوحة التحكم، ومنها «مفاتيح الخدمات» للمالك فقط)، `/api/me/{account,products,company,media,invoices,recognize}`، `/api/auth/legacy`، `/api/team/*`، `/api/plans`، `/api/settings`، `/api/ev/pv`، `/api/pay/*` (الفواتير والدفع وردود البوابات)، `/data/overlay.js` (التعديلات المنشورة) و`/media/u/*` (الصور المرفوعة). Routes جديدة على الدومينين: `/api/plans*` `/api/settings*` `/api/pay/*` `/api/ev/*` `/api/team/*` `/data/overlay.js*` `/media/u/*`.
- **D1:** ‏`worker/migrations/0006_admin_center.sql` (31 جدول `cc_*`، كلها `CREATE … IF NOT EXISTS` + `INSERT OR IGNORE`، من غير `ALTER`، آمنة للتكرار). **KV:** ربط `SEO_KV` (نفس namespace بتاع Pages، الـ Worker بيكتب مفاتيح `acc:*` بس). **متغيرات:** `LEGACY_ORIGIN`، و`WA_DRY_RUN = "0"`. **سر جديد:** `CONFIG_SECRET`.
- **مابيتغيرش:** `/panel.html` و`/login.html` و`/api/index.php*` و`/data/auth.js` و`/data/me.js` و`/data/egadm.js` بيفضلوا على النظام القديم (`mis-egypt`، ‏`deploy/legacy-live.txt`)، **ولا Route واحد لـ `mis-egypt` بيتغير** (الأمر القديم `admin-release` اتشال). لا DNS ولا MX/SPF/DKIM/DMARC ولا Email Routing.
- **الباقات (المصدر الوحيد = جدول `cc_plans`):** كل الباقات بتشوف المناقصات وطلبات الأسعار والترسيات والمشاريع والفرص؛ الفرق في النطاق الجغرافي والحدود. «الشريك الأساسي» = مصر + الخليج والعربي + أفريقيا، 200 منتج؛ «الشريك الاستراتيجي» = كل الأسواق (آسيا وأوروبا)، منتجات غير محدودة، بانر وتكريم من الجمعية؛ الاتنين بيوصلهم طلبات الشراء المطابقة تلقائياً بأولوية + باسم (المستشار، `/advisor/`) طول مدة الباقة (365 يوم). الأسعار نفس أسعار صفحة التسجيل (4,000 / 10,000 / 25,000 / 50,000 / 100,000 جنيه + 14% ضريبة). الـ Worker بيطبّق الصلاحيات على السيرفر (`planCan` / `planLimit`)، ومايعتمدش على المتصفح.

### 11.2 ترتيب الإطلاق (كل خطوة أمر واحد؛ الموقع والـ API شغالين طول الوقت)
```bash
deploy/deploy.sh doctor                                   # للقراءة فقط
deploy/deploy.sh worker-config                            # للقراءة فقط: لازم «OK … for deploy 2»
# 1) نسخة احتياطية من D1 قبل أي تغيير (قراءة فقط):
(cd worker && npx wrangler d1 export migate-db --remote --output ../build/d1-backup-$(date -u +%Y%m%dT%H%M%SZ).sql)
# 2) سر التشفير (مرة واحدة؛ احفظه في مدير كلمات المرور):
openssl rand -hex 32                                      # القيمة اللي هتتكتب في الخطوة الجاية
deploy/deploy.sh secrets --set CONFIG_SECRET              # على الـ Worker بس (32 حرف على الأقل)
# 3) قاعدة البيانات: 0006 (يعرض الخطة ويسأل قبل التنفيذ)
deploy/deploy.sh db
# 4) الـ Worker: الكود + الـ Routes الجديدة + فحص /api/*/health
deploy/deploy.sh worker
# 5) الموقع: بناء جديد (بيسحب /data/overlay.js الأول) + الفحوص + الإنتاج + اختبار الدخان
deploy/deploy.sh production
# 6) اختبار الدخان الكامل على الدومين (قسم «Admin Control Center» + مسارات النظام القديم)
deploy/deploy.sh smoke https://madeinegyptgate.com
```
- **ممنوع** `wrangler d1 migrations apply`: الـ migrations بتتطبق بـ `deploy.sh db` بس (`deploy/d1_migrate.py` بيقرا الجداول الحية ويطبّق الناقص).
- بعد الخطوة 4 ومن غير ما يتعمل أي حاجة تانية: الواتساب **مابيبعتش** (الزرار مقفول)، والبريد زي ما هو (`mail.enabled = 0` = نفس إعدادات النهارده)، وبوابة الدفع «لسه بتتجهّز» لحد ما المالك يضبطها.
- 7) المالك يدخل من `https://madeinegyptgate.com/login/` بكود على `info@madeinegyptgate.com` (‏`ADMIN_EMAILS` → المالك) فيتحوّل لـ `/admin/`. بعدها: «استيراد من النظام القديم» (مراجعة ثم نشر)، «الباقات والصلاحيات»، «الإدارة والصلاحيات» (إضافة فريق SEO / الداتا)، «بوابة الدفع» (11.3)، «مفاتيح الخدمات» (11.4).

### 11.3 بوابة الدفع (Paymob / N-Genius / PayTabs / تحويل بنكي وInstaPay)
- المفاتيح بتتحط **في اللوحة بس** («بوابة الدفع»، المالك فقط) ومتشفّرة بـ `CONFIG_SECRET` — مش متغيرات بيئة. جرّب «🧪 فاتورة تجريبية» في وضع Sandbox الأول، وبعدها حوّل لـ Live.
- عناوين للبوابات: Paymob بيبعت روابطه مع كل عملية (`https://madeinegyptgate.com/api/pay/webhook/paymob` و`…/api/pay/return/paymob`)؛ N-Genius: Webhook في البورتال `https://madeinegyptgate.com/api/pay/webhook/ngenius` مع هيدر `X-MIG-Webhook: <القيمة من اللوحة>`؛ PayTabs: `…/api/pay/webhook/paytabs` و`…/api/pay/return/paytabs` بيتبعتوا مع كل طلب.
- قاعدة WAF ‏MIG-4 بتمنع `/api/*` من غير User-Agent: لو بوابة بعتت webhook من غير UA، ضيف استثناء للمسار `/api/pay/webhook/*` بس.
- لسه مش متأكد منه قبل مفاتيح حقيقية (ACC-CONTRACT §5.5): ترتيب حقول HMAC في Paymob، عنوان N-Genius في مصر، توقيع صفحة الرجوع في PayTabs. أول دفعة Sandbox بتأكدهم.

### 11.4 الواتساب: من «مفاتيح الخدمات» (المالك فقط)
1. «مفاتيح الخدمات» → توكن respond.io → حفظ (بيتشفّر؛ عمره ما بيرجع يظهر — بيظهر «محفوظ ✓» وآخر 4 حروف بس).
2. «اختبار» → لازم يقول إن القناة 580384 موجودة (طلب قراءة فقط `GET /v2/space/channel`؛ 10 مرات في الساعة).
3. من موبايل 01062531295 (رقم التجربة) ابعت أي رسالة لرقم واتساب المنصة على respond.io (+966 56 907 6768) (بيفتح نافذة الـ 24 ساعة)، وبعدها «إرسال رسالة تجربة» — رسالة واحدة لرقم المنصة بس (ولما Meta توافق على القوالب، اختيار «قالب» بيشتغل من غير النافذة).
4. لو الرسالة وصلت على 01062531295: علّم «الرسالة وصلت» ثم «تشغيل إرسال واتساب الحقيقي». قبل كده الزرار بيرد 409.
5. الإيقاف: «إيقاف» من نفس الصفحة — فوري (كل رسالة حقيقية بتقرا الزرار من قاعدة البيانات قبل ما تتبعت). القفل النهائي: `WA_DRY_RUN = "1"` في `worker/wrangler.toml` ثم `deploy.sh worker`.
- أي تغيير في التوكن أو رقم القناة **بيقفل الزرار تلقائياً** ولازم الاختبار والرسالة من الأول. كل حفظ/مسح/اختبار/رسالة/تشغيل بيتسجّل في «سجل التعديلات» من غير أي قيمة.
- مفتاح Anam: نفس الصفحة («اختبار» = `GET /v1/personas?perPage=1`). لو السر `ANAM_API_KEY` موجود على الـ Worker فهو اللي شغّال، والمفتاح اللي في اللوحة احتياطي.

### 11.5 الرجوع (Rollback)
| الحالة | الأمر |
|---|---|
| نشر Pages سيئ | `deploy/deploy.sh deployments` ثم `deploy/deploy.sh rollback <id>` (بناء النشر الأول يرجع؛ اللوحة القديمة `/panel.html` شغالة في كل الأحوال) |
| Worker سيئ | `cd worker && npx wrangler rollback`. **ملحوظة:** الـ Routes الجديدة بتفضل؛ النسخة القديمة مابتعرفش `/data/overlay.js` و`/media/u/*` — امسح الـ Route‏ين دول من Cloudflare → Workers Routes لحد ما ترجع للنسخة الجديدة، عشان نسخة Pages الثابتة ترد |
| D1 | 0006 إضافي بس: سيب الجداول (مابتأثرش على النسخة القديمة). الاسترجاع الكامل من ملف الخطوة 1 بس لو لازم — **ممنوع DROP على قاعدة الإنتاج** |
| واتساب | «إيقاف» في «مفاتيح الخدمات» (فوري)، أو `WA_DRY_RUN = "1"` + `deploy.sh worker` |
| بوابة الدفع | «بوابة الدفع» → إيقاف البوابة (الفواتير المفتوحة بتفضل؛ صفحة الدفع بترجع تقول «لسه بتتجهّز») |

### 11.6 تحذير `CONFIG_SECRET`
تغييره (rotate) بيخلّي كل المفاتيح المحفوظة في اللوحة (الدفع، البريد، respond.io، Anam) **مش مقروءة** (`readable:false`): الواتساب يقف (مفيش توكن)، وبوابة الدفع «مش جاهزة»، والبريد يرجع لـ `RESEND_API_KEY`. لو لازم يتغير: حط القيمة الجديدة، وبعدها دخّل كل مفتاح تاني من صفحته، واعمل الاختبارات من الأول.
