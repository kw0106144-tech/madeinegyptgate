### generator
## تقرير منطقة «generator» (SEO-SPEC §1)

لم يكن هناك أي ملف جزئي من التشغيل السابق، لا في المشروع ولا في `seobuild/`، فكتبت كل شيء من البداية على البيانات المنظّفة. الأعداد كلها محسوبة من البيانات وقت البناء، ولا يوجد أي أثر لرقم 26k. لم أعدّل أي ملف خارج قائمتي.

### الملفات التي أنشأتها
- `/home/user/madeinegyptgate/seo_build.part.py`
  - هذا هو المولّد. كل الكود داخل closure، فتنفيذه بـ exec داخل site.py لا يضيف إلا أسماء الـ API، ولا يكتب فوق أي متغيرات في site.py.
  - الـ API: `build_static_seo(OUT)` و`seo_prepare` و`seo_static_head` و`seo_static_tail` و`seo_rewrite_links` و`seo_footer_block` و`url_for` و`head_html` و`indexable` و`norm_sector` و`gov_of` و`slug_ascii` و`legacy_slug`، ومعها `jsonld_*` و`render_*` و`emit_*` و`MANIFEST`.
  - يشتغل كذلك مستقلاً على أي مجلد، ومنها المجلدات المؤقتة: `python3 seo_build.part.py <out> [--today] [--link-assets]`.
- `/home/user/madeinegyptgate/tools/dump-data.mjs`
  - يقيّم ملفات data/*.js داخل vm بنفس ترتيب الصفحات (facx.js ككود IIFE).
  - تمريرة عربية للبيانات، وتمريرة إنجليزية فقط لجمع I18N_EN.
  - يُعاد تشغيله تلقائياً لو أي ملف بيانات أحدث من `build/data.json` (مدته حوالي 0.6 ثانية).
- `/home/user/madeinegyptgate/seo/`:
  - `config.json`: الحدود وعقد المسارات.
  - `sectors.json`: 38 قطاعاً و231 مرادفاً.
  - `governorates.json`: 27 محافظة.
  - `tender-cats.json`: 17 فئة، زائد فئة «دولية».
  - `keywords.json`: المجموعات من A إلى N.
  - `lastmod.json`: فيه 4,696 مدخلاً.
- `/home/user/madeinegyptgate/build/data.json`: ناتج بناء حجمه 12MB، لا يُرفع إلى المستودع.

### طريقة الدمج
التعليمات الكاملة في `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/generator-INTEGRATION.md`، ومعها:
- الـ diff الجاهز: `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/generator-site.py.diff`
- سكربت يطبّق الترقيع على نسخة من site.py: `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/generator-make_site_patch.py`

جرّبته على نسخة مرقّعة من site.py مع `MIG_OUT=scratch` واشتغل. التغييرات في site.py:
1. في السطر 3: `B = os.path.dirname(os.path.abspath(__file__)) + '/'`.
2. بعد سطر exec الخاص بـ `seo.part.py`، أضف: `exec(open(B + 'seo_build.part.py', encoding='utf-8').read())`.
3. إصلاح `page()`:
   - العنوان والـ meta والخطوط والـ CSS تنتقل إلى داخل `<head>` عبر `seo_static_head(key, title, app=app)`.
   - طبقة رسالة الخطأ تظهر فقط مع `MIG_DEBUG=1`.
   - يُحذف `claude:viewport-fit-sides`.
   - يُضاف `seo_static_tail()` في آخر body.
   - روابط المحاور في الفوتر تُضاف بـ `seo_footer_block()`.
   - `seo_static_head` تضع `<base href="/">` وتصحيحاً صغيراً لـ history، حتى تبقى الروابط النسبية داخل القوالب وداخل ملفات data/*.js (جنة/i18n) صحيحة بعد نقل الصفحات إلى مجلدات.
4. قبل حلقة الصفحات: `seo_prepare(OUT)`. داخل الحلقة:
   - كل صفحة تُكتب في `static_paths` كـ `/x/index.html`.
   - الصفحات التفاعلية التي صار مولّدي يكتب صفحتها الرسمية تُكتب في `app_paths`، مثل `/factories/search/`، وتأخذ noindex,follow وcanonical يشير إلى المحور.
   - تُتخطّى مفاتيح الـ shim وصفحة factory.
   - كل صفحة تمرّ على `seo_rewrite_links()`.
5. في آخر site.py: `SEO_STATS = build_static_seo(OUT)`.

### ما يولّده `build_static_seo`
- صفحة لكل رابط WordPress قديم:
  - 2,926 مصنعاً على `/factories/<slug>/`.
  - 183 منتجاً على `/industrial_products/`.
  - 375 مناقصة على `/tender-item/`.
  - 5 طلبات أسعار على `/rfq/`.
- محاور القطاعات، والقطاع × المحافظة، والمحافظات، والمناطق الصناعية والحرة.
- صفحات المناقصات والفئات والجهات، والترسيات، والأخبار، والمعارض، والمشاريع (من `PROJECTS_REAL` فقط)، والعروض، والتصدير، و`/site-map/`.
- النسخ الإنجليزية تحت `/en/` تُبنى فقط إذا اجتازت بوابة الإنجليزية.
- صفحات الـ shim مثل `company.html` تعمل مع خرائط `/_seo/hash/*.json`.
- خرائط الموقع: فهرس و26 ملفاً فرعياً.
- `robots.txt` و`_headers` و`_routes.json` و`_redirects` و`404.html` و`410.html`.
- ملفات `/_seo/redirects.json` و`/_seo/pages.json` و`/_seo/en-paths.json`.
- قوائم CSV للتحميل، فيها الاسم والقطاع والمدينة والرابط فقط بلا أي وسيلة تواصل.
- صور خلايا الـ sprite مقصوصة كصور مستقلة.

طبّقت أيضاً العقد الذي طلبه وكيل edge:
- حذف `/api/*` من exclude في `_routes.json`.
- إصدار `404.html` و`410.html`.
- نسخ ملفات seo/*.json إلى `/_seo/`.

### نتائج الاختبار
مخرجات التجربة في `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/generator-out/`.

- **الحجم:** البناء يأخذ 16 ثانية.
  - 4,661 صفحة عربية و2,735 صفحة إنجليزية، أي 7,396 صفحة.
  - القابل للفهرسة: 2,786 عربي و2,735 إنجليزي، أي 5,521 رابطاً في خرائط الموقع.
  - في المجلد 8,107 ملفات بحجم 141.7MB، دون الروابط الرمزية.
  - في البناء الكامل مع الأصول وصفحات site.py يصل العدد تقريباً إلى 8,650 ملفاً، أي تحت حد Pages البالغ 20,000.
- **فاحص مستقل** (`generator-check.py`، شغّلته على كل الصفحات الـ 7,396): **صفر أخطاء**. يغطي:
  - head: عنوان واحد، وصف من 70 إلى 170 حرفاً، canonical يشير للصفحة نفسها، h1 واحد عليه data-seo.
  - JSON-LD: الكتلتان تُقرآن كـ JSON سليم.
  - توازن الوسوم، وكل صورة لها alt وwidth وheight.
  - لا رقم 26k، ولا موبايل ولا إيميل في أي صفحة.
  - hreflang متبادل بين النسختين.
  - نسبة العربي في الصفحات الإنجليزية أقل من 5%.
  - خرائط الموقع صالحة، وفيها 93 قيمة lastmod مختلفة.
  - robots.txt.
  - الروابط القديمة الـ 3,489 كلها لها صفحات.
  - لا توجد سلاسل تحويل.
- **وضع الـ hash** (`MIG_SEO_SLUG_MODE=hash`، احتياطي فحص A10): يعمل، و3,000 رابط قديم يتحوّل برابط واحد إلى المسار الجديد.
- **Chromium:**
  - الصفحات ليس فيها أخطاء console ولا تمرير أفقي، على عرض 1280 وعلى 390.
  - الـ shim يعمل: `/company.html#5` يفتح `/factories/hydrohex/`.
  - جنة يُحمَّل فقط بعد الضغط على الزر: صفر طلبات data/*.js قبل الضغط، والصورة الرمزية تظهر.
- **الصفحات الثابتة على النموذج المدمج:** الصفحات المولّدة بلا أخطاء. ما تبقّى على قوالب site.py مذكور في §5 من ملف الدمج:
  - روابط `company.html#N` تُبنى بـ JS في 18 صفحة.
  - شعار الهيدر بلا width وheight.
  - صفحات advisor وbourse بلا h1 في الـ HTML.

### قرارات خالفت فيها المواصفة (التفاصيل في §6 من ملف الدمج)
- **حد كلمات وصف الشركات صار 35/20 بدلاً من 80/40.** القاعدة الحرفية لا تفهرس إلا 29 شركة من 2,926، لأن الأوصاف مقتطفات WordPress مقطوعة. تقدير المواصفة نفسه (~885 صفحة رقيقة) محسوب كـ «أقل من 200 حرف»، وهذا يقارب 35 كلمة. النتيجة 1,944 شركة قابلة للفهرسة. يمكن الرجوع إلى 80/40 من `config.json`.
- **375 مناقصة قديمة بلا موعد ولا جهة:** تأخذ noindex,follow، والصفحة نفسها ترجع 200.
- **ترقيم صفحات المناقصات:** موجود داخل صفحات الفئات، وليس على `/tenders/page/N/`.
- **حالة إدراج الشركات المستوردة:** «مدرجة في دليل المنصة» وليس «عضو مسجّل».
- **محافظة واحدة من 27 أخذت noindex:** الوادي الجديد، لأن فيها عنصراً واحداً فقط.

### edge
## تقرير منطقة edge: الطبقة الطرفية لتحسين محركات البحث (Cloudflare Pages Functions)

اكتمل العمل. لم تكن هناك ملفات جزئية من التشغيل السابق لهذه المنطقة: مجلد functions/ ومجلد seobuild/ كانا فارغين، فبنيت كل شيء من الصفر. لم أعدّل أي ملف خارج /home/user/madeinegyptgate/functions/. كل تغيير مطلوب في ملفات أخرى مكتوب بنصه الحرفي في ملف الدمج.

**نتيجة الاختبارات:**
- 45 من 45 اختبار وحدة نجحت، مرة مع محاكي HTMLRewriter المضمّن ومرة مع محرك lol-html الحقيقي (html-rewriter-wasm).
- 10 من 10 فحوصات end-to-end نجحت على بيئة workerd الحقيقية عبر `wrangler pages dev` 4.164.0، مع KV وD1 محليين ومخطط `worker/schema.sql`.
- أمر `wrangler pages functions build` نجح: الحزمة 140KB، أو 38KB مضغوطة بـ gzip، ولا يدخل فيها كود الاختبارات.

### بندان يمنعان عمل الطبقة إن لم يُطبَّقا
1. **`seo_build.part.py` في دالة `emit_routes()`:** يجب حذف `"/api/*"` من قائمة `exclude`. في ملف `_routes.json` قاعدة الاستثناء تغلب قاعدة التضمين، فبوجودها لن يصل أي طلب `/api/seo/*` إلى الـ Function أبداً. مسارات الـ Worker على النطاق تسبق Pages أصلاً، فحذفها لا يضيف تكلفة.
2. **ملف `site/404.html` غير موجود:** لا يوجد أي جزء يُنتجه حالياً. بدونه تعمل Pages بنمط تطبيق الصفحة الواحدة، فتردّ على كل رابط غير موجود بالصفحة الرئيسية وحالة 200. عندها لا يعمل تحويل الروابط القديمة إلى 410 ولا تحويلات البادئات. نص الصفحة المقترحة جاهز في ملف الدمج.

### الملفات المنشأة
- `/home/user/madeinegyptgate/functions/_middleware.js`: يعمل على كل طلب. يعالج روابط ووردبريس القديمة (`?p=` و`?lang=en`)، ويخدم ملف مفتاح IndexNow من KV أو من متغير البيئة `INDEXNOW_KEY`، ويضيف أسطر المدير إلى `robots.txt`. ويطبّق تحويلات المدير ثم تحويلات البناء بقفزة واحدة دائماً مع الحماية من الحلقات. ويحوّل 404 إلى تحويل بادئة 301 أو إلى 410. ويعيد كتابة HTML بالقيم الجديدة (العنوان والوصف والكلمات المفتاحية والرابط القانوني وrobots وOG وJSON-LD وH1 والمقدمة)، ويضيف الترويستين `X-SEO-Edge` و`X-Robots-Tag` وقيمة ETag مرتبطة بنسخة الحزمة. إن غاب KV أو تعطل تُخدم الصفحات كما بُنيت.
- `/home/user/madeinegyptgate/functions/api/seo/[[path]].js`: نقطة دخول `/api/seo/*`.
- `/home/user/madeinegyptgate/functions/_lib/seo-edge.js`: الدوال المشتركة وإعادة كتابة HTML.
- `/home/user/madeinegyptgate/functions/_lib/seo-api.js`: واجهة الإدارة، وتشمل كل نقاط القسم 2.5 من المواصفة: health، وpages وpage (GET/PUT/PATCH/DELETE)، وrollback، وoverrides، وhistory، والتصدير بصيغتي CSV وJSON، والاستيراد مع dry_run، والتحويلات، وtest، وconfig، ومفتاح IndexNow والإرسال والسجل، وrebuild، والكلمات المفتاحية، واستيراد CSV من Search Console.
- `/home/user/madeinegyptgate/functions/_lib/seo-auth.js`: التحقق من التوكن.
- `/home/user/madeinegyptgate/functions/_lib/seo-score.js`: درجة الصفحة من 0 إلى 100 وفق القسم 3.3، مع توحيد الحروف العربية للمطابقة.
- `/home/user/madeinegyptgate/functions/package.json`: فيه `"type":"module"` و`npm test`، بلا أي اعتماديات.
- الاختبارات في `/home/user/madeinegyptgate/functions/_tests/`: `seo-edge` و`seo-auth` و`seo-api` و`middleware` بصيغة `.test.mjs`، إضافة إلى `helpers.mjs` و`e2e-pages-dev.mjs`.

### المصادقة
- التوكن مطابق بايتاً ببايت لتوكن v2 في `worker/src/auth.js`. المفتاح هو `AUTH_SECRET` إن وُجد وإلا `ADVISOR_SECRET`، بنفس أولوية الـ Worker.
- التوكن لا يحمل الدور، لذلك يُحدَّد الدور من أول مصدر متاح:
  1. ربط D1 باسم `DB` على قاعدة الـ Worker نفسها، وهو المُوصى به. يطبّق نفس فحص الجلسة والإلغاء عند الخروج، ونفس قاعدة `isAdmin`، ويقبل الدور `seo`.
  2. ربط خدمة `PLATFORM_API` يستدعي `/api/me` في الـ Worker.
  3. قائمة `SEO_ADMIN_IDS`، ولا ترى تسجيل الخروج.
- إن لم يُضبط أي مصدر تُرفض الطلبات بـ 503.
- مفتاح `X-Platform-Key` يفتح فقط health وexport* وPOST indexnow.
- اختبار مقارنة على نفس قاعدة D1 أثبت أن الحكم مطابق لدالتي `authUser` و`isAdmin` في الـ Worker.

### بقية خطوات الدمج
التفاصيل الكاملة في الملف: `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/edge-INTEGRATION.md`
- **ملف `wrangler.toml` جديد في جذر المستودع لمشروع Pages:** المحتوى الحرفي في الملف، وفيه:
  - `pages_build_output_dir="site"`
  - ربط KV باسم `SEO_KV` بالمعرّف `b321fb348f3447179c99b4380952e5ac`
  - ربط D1 باسم `DB` بنفس معرّف قاعدة الـ Worker
  - `SITE_ORIGIN` و`ADMIN_EMAILS`

  لم أنشئه لأنه خارج الملفات المسندة إليّ.
- **أسرار Pages** تُضبط بالأمر `npx wrangler pages secret put … --project-name madeinegyptgate`:
  - `ADVISOR_SECRET`: بنفس قيمته في الـ Worker، ومعه `AUTH_SECRET` إن كان الـ Worker يستخدمه.
  - `PLATFORM_KEY`
  - اختيارياً: `PAGES_DEPLOY_HOOK` و`INDEXNOW_KEY`.
- **النشر:** من جذر المستودع بالأمر `npx wrangler pages deploy site --project-name madeinegyptgate`.
- **لا تضيفوا مساراً للـ Worker يغطي `/api/seo/*` أو `/api/*` كله**، فهو سيحجب الـ Function.
- **اختياري:** في `worker/src/admin.js` (السطر 122 تقريباً) يُعدَّل التعبير `^(user|admin)$` إلى `^(user|admin|seo)$` حتى يمكن منح دور SEO.
- **مُوصى به:** نسخ `seo/keywords.json` و`seo/config.json` إلى `site/_seo/`.
- **اختياري:** نص `tools/seo-pull.mjs` جاهز في ملف الدمج. يقرأ `GET /api/seo/export.json` ويطابق مباشرة الصيغة `{ov}` التي يقرؤها `seo_build.part.py` من الملف `build/seo-overrides.json`.
- ملف الدمج يحتوي أيضاً عقد الواجهة الكامل لمن يبني `/seo-admin/`: شكل الطلبات والردود، والفرق بين PUT وPATCH، وطريقة فحص حالة الطبقة الطرفية بترويسة `X-SEO-Edge`.

### توافق مع ما بناه المولّد بالتوازي
- الملف `/_seo/pages.json` بصيغة `{rows}` ومفاتيحه المختصرة، ومعه `h1:"MULTI"` و`kw` لكل صفحة، كلها مدعومة.
- صيغ `redirects.json` و`en-paths.json` و`keywords.json` مدعومة.
- المولّد يتجنب إنشاء صفحات `/tenders/page/N/`، فلا تعارض مع قاعدة البادئة.

### انحرافات مقصودة عن المواصفة
- **التخزين:** واجهة الإدارة Function في Pages تخزّن في KV فقط، فلا حاجة لجداول `seo_*` ولا لملف migration. سجل التغييرات في المفتاح `seo:log`، وتنسيق الحزمة هو تنسيق القسم 2.2 مع حقلين إضافيين `meta` و`ix`.
- **تحويلات البادئة لا تُطبَّق إلا عند 404.** السبب حماية صفحات حقيقية تقع تحت بادئة قديمة.
- **التحويلات بقفزة واحدة دائماً:** تُطوى السلاسل عند الحفظ وعند الخدمة، ويُعتبر `/x` و`/x/` صفحة واحدة.
- **تكلفة المعالج:** نقاط القائمة والتصدير والاستيراد تحلّل الـ manifest كاملاً، أي حوالي 4MB و9 آلاف صف. يستغرق ذلك نحو 55ms للتحليل ونحو 100ms لحساب الدرجات، مع تخزين مؤقت داخل كل isolate. هذا يتجاوز حد 10ms في الخطة المجانية، لذلك تحتاج لوحة الإدارة خطة Workers Paid. طبقة الـ middleware نفسها خفيفة.
- **حدود KV:** كل حفظ يكلف 3 عمليات كتابة، أي نحو 300 حفظ يومياً في الخطة المجانية.
- **سرعة الظهور:** يظهر التعديل فوراً في نفس الـ isolate الذي حفظه، وفي البقية خلال `SEO_TTL` (60 ثانية) مضافاً إليه كاش KV (حتى 60 ثانية).

### تشغيل الاختبارات
- اختبارات الوحدة: `cd /home/user/madeinegyptgate/functions && npm test` (Node 22.12 أو أحدث).
- اختياري بمحرك lol-html الحقيقي: `HTML_REWRITER_WASM=<مسار الحزمة html-rewriter-wasm> npm test`.
- اختبار end-to-end: `WRANGLER_BIN=<مسار wrangler> node functions/_tests/e2e-pages-dev.mjs`. يتوفر wrangler بتشغيل `npm install` داخل `worker/`. نسخة جاهزة مثبتة في `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/edge-tools/node_modules/.bin/wrangler`.


### admin
AREA admin: the SEO workspace from spec §3 is built and tested. It passes 93/93 Playwright checks against the real `/api/seo` code and 19/19 on a plain static host. site.py still needs one exec line, and three bugs in other areas came up during testing (item 4).

**1. Files**
- **`/home/user/madeinegyptgate/seo-admin.part.py`** is the only project file I created; no other project file was touched. No earlier partial version existed.
  - It sets `PAGES['seo-admin']`, which builds `site/seo-admin.html`; the generator's clean copy is `/seo-admin/`.
  - The page is noindex and kept out of the sitemap, using the same `seo_head`/`seo_files` wrapping as meeting/inbox. robots.txt already disallows `/seo-admin/`.
  - It is Arabic-first RTL in the site's style, every string is `T(ar, en)`, and the JS is ES5 (eslint at ES5 level: 0 errors).
- Integration notes: `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/admin-INTEGRATION.md`
- Test tools: `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/admin-tools/` (`run.sh`, `build_admin.py`, `admin-server.mjs`, `admin-test.mjs`, `static-check.mjs`, `make_clean_url.py`)
- Screenshots (desktop and mobile, all tabs, plus `results.json`): `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/admin-shots/`

**2. What the page does**
- **Sign-in:**
  - Uses `window.MIGAPI` (e-mail code) when present; otherwise an open token-paste box. A pasted token goes to sessionStorage unless "remember me" is ticked, then to `mig-tok`.
  - 401 shows the sign-in; 403 shows «هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط»; 503 shows a configuration message.
- **Read-only fallback:** if `/api/seo` is unreachable, the page scores `/_seo/pages.json` in the browser with the same rules as `functions/_lib/seo-score.js`. A banner says it is read-only and every write button is disabled.
- **Tabs:**
  - Overview: counts from the manifest, edge status from `HEAD /` `X-SEO-Edge`, noindex reasons, weakest pages, a CSV of companies needing a description (no contacts), rollback, history.
  - Pages: filters, sort, search, bulk CSV and bulk IndexNow.
  - Page editor:
    - Fields: every override field, with the build default shown and «رجوع للافتراضي».
    - Live checks: character counters, Google SERP preview (desktop/mobile, pixel truncation), social card, and a live score.
    - Target-keyword checks against the title, H1, description and the page's first 100 words (Arabic-normalised).
    - JSON-LD check, including a no-phone/e-mail privacy rule, plus links to Rich Results Test and validator.schema.org.
    - Save, save + IndexNow, delete, and history with «استرجاع».
  - Keywords: clusters from `seo/keywords.json` with coverage, editable.
  - Redirects: add/edit/delete, link test, CSV export and dry-run import.
  - robots & sitemaps: live robots.txt, validated extra lines with a block-all confirmation, sitemap URL counts, rebuild.
  - Verification: Google/Bing/Yandex tokens (a pasted meta tag is accepted), IndexNow key, key-file check, sends, log.
  - Ranking: the fixed honest text, «غير متصل» for both search-console APIs, and a GSC CSV upload joined to pages and keyword clusters.
- **English mode:** Arabic data is edited in `<textarea>` inside `translate="no"`, so `i18n.js` cannot machine-translate it.

**3. How to integrate**
- `site.py` (site-core): add this right after line 38 (the `meeting.part.py` exec). It must come after `pages.part.py` and `seo.part.py`, and must not be added to `GATES`:
  ```python
  exec(open(B + 'seo-admin.part.py', encoding='utf-8').read())  # seo-admin.html → /seo-admin/: SEO workspace (admin/seo role; noindex)
  ```
- Generator: nothing to change; `static_paths`, `noindex_static` and the robots Disallow are already there.
- `data/janna.js` (agents-ui):
  - Line 371: add `"seo-admin": 1, inbox: 1` to `QUIET`.
  - Line 41: `PAGE` is empty, and so treated as "home", on every clean `/x/` URL. Fix:
    ```js
    var PAGE = (location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, "") || "home";
    ```
  - Until then the page sets sessionStorage `janna-stage=1` before `janna.js` runs, so Janna's full-screen stage cannot cover the workspace (tested). Her small corner teaser can still appear.
- Optional: links to the workspace from `inbox.part.py` and the MIGAPI account menu.

**4. Bugs found in other areas (exact fixes in the notes)**
- **HIGH, generator + edge:**
  - Cause: `/_seo/redirects.json` contains `"/factories" → "/factories/"` (also `/products`, `/rfq`, `/tenders`). The edge's slash-variant `lookup()` then treats `/factories/` as redirecting to itself, so `flattenTarget()` and `collapseTarget()` see a loop.
  - Effect: `/manufacturers` returns 404 instead of 301 (fails A7); `/factory.html`, `/tenders.html` and `/rfqs.html` are not redirected; admin redirects to those four hubs are refused with 400 `redirect_loop`. A one-line node repro is in the notes.
  - Fix: the generator drops those four entries, and the edge ignores a match whose target is the same page.
- **MEDIUM, site-core:** `index.html` is still the variant with no `<head>`, so the verification meta tags can never be added on "/" (spec §1.2 already requires a full head). With a proper head, verification works (tested).
- **LOW, edge:** the API scores "thin" pages against an 80-word default, while the build used 35/20 from `seo/config.json`.
- **LOW, edge:** IndexNow "since" works by day, so after a build the same day it sends every page. The page now asks for confirmation and explains this.
- Not checked closely: on mobile, a floating "معاينة الإدارة" widget (probably the plan preview) covers the bottom-left of the page.

**5. Test results**
- **93/93**, zero page or console errors. Run against the real `functions/_middleware.js` and the `/api/seo` handler, with in-memory KV, on a snapshot of the generator output (7,396 manifest rows).
- Covered:
  - Overview count equals manifest rows (A12); filters and sort; search.
  - Save, then the live `<title>` is rewritten and escaped, and `X-SEO-Edge` equals the new version; delete restores the build title.
  - CSV export → dry-run import → 0 changes, for overrides and redirects (A12).
  - Redirect chain collapse and the 1-hop link test; robots extra lines go live and a declined block-all saves nothing; sitemap totals; rebuild message.
  - Verification tags appear on "/"; IndexNow key file and sends logged with 202; GSC CSV in English and Arabic; rollback.
  - Real and mocked 403, mocked 401/503/429/400 and offline.
  - All tabs on mobile with no horizontal scroll; English mode keeps Arabic data verbatim; the clean URL `/seo-admin/` under `<base href="/">`; keyboard access.
- **19/19** on a plain `python -m http.server` with no Functions (1366/390, Arabic and English): read-only audit, and the edge correctly reported as not active.

To re-run: start `node admin-tools/admin-server.mjs 8851 admin-fixture admin-out/site` from the `seobuild` folder, then run `bash admin-tools/run.sh`. I stopped both test servers when I finished.

### deploy
## Deploy area: done. Nothing was created, modified or deployed on Cloudflare (all calls were read-only GET/SELECT). No DNS was touched.

**Summary:** The deploy pipeline is built and passes local end-to-end tests. Before any real deploy, `worker/wrangler.toml` needs the D1/R2 patch and the integrated `site/` build must exist. Before the cutover, the two routes of the old `mis-egypt` Worker on the domain must be removed. The runbook for the owner is in Arabic, as the user asked.

No partial deploy files existed from the interrupted run, so everything was written fresh.

### Files created (only these)
- `/home/user/madeinegyptgate/deploy/deploy.sh` is the single entry point. Commands: `doctor | stage | check | project | secrets [--set NAME] | preview | production | release | db | worker | domains | deployments | rollback ID | smoke URL`.
  - It never edits DNS.
  - production, worker, db, domains and rollback ask for confirmation unless `--yes` is passed.
  - It takes a lock and logs to `build/deploy-logs`.
  - Account-level wrangler commands run from `build/deploy-logs/wrangler-cwd` (which contains an empty `functions/`). That keeps the repo root free of `.wrangler/` and stops wrangler 4.164 from redirecting the project to Workers.
- `/home/user/madeinegyptgate/deploy/stage.py` (Python standard library only) builds `build/pages-stage/{site,functions,wrangler.toml}`:
  - It turns the `data/`, `img/` and `media/` symlinks into real files and skips the `data/data -> ../data` loop. Symlinks pointing outside the repo are refused.
  - It drops junk, the build-only `data/i18n-{old,news,real}.json` (3.2 MB), `factory.html`, `home.html`, and stale files whose URL `_seo/redirects.json` redirects.
  - It then runs the pre-deploy gate:
    - **Pages limits:** fewer than 20,000 files, each file under 25 MiB, `_redirects` ≤ 2,000/100, `_headers` ≤ 100, `_routes.json` ≤ 100 with no `/api/*` exclude.
    - **Required files**, including `404.html` and `functions/_middleware.js`.
    - **robots.txt** and **sitemaps:** every URL exists, is indexable and is self-canonical.
    - **Honesty rules:**
      - No 26k / 26,808 claim.
      - No personal phones or e-mails in sitemaps, JSON-LD, `_seo/pages.json`, CSVs or detail pages.
      - Public-source factory pages carry their label.
      - No VideoObject and no sample or lead pages.
- `/home/user/madeinegyptgate/deploy/stage-exclude.txt`
- `/home/user/madeinegyptgate/deploy/wrangler-pages.toml`: the Pages config, with `SEO_KV`=`b321fb348f3447179c99b4380952e5ac`, D1 `DB`=`migate-db`/`f86e00bb-9739-4985-a149-3dddb45b2b42`, and `SITE_ORIGIN`/`ADMIN_EMAILS`. It is uploaded with every deploy.
- `/home/user/madeinegyptgate/deploy/smoke-test.sh` (bash + curl, read-only) checks:
  - Old-site detector, home, 20 hubs and static pages.
  - robots.txt and sitemaps, compared with the build.
  - N random sitemap URLs.
  - The Arabic URL with upper- and lower-case escapes (A10).
  - Legacy redirects (A7), 410s, soft-404, the hash shim and headers.
  - www/http host redirects.
  - `/api/seo/health`, probed with an invalid token: 401 means the Function, `SEO_KV` and `ADVISOR_SECRET` are live; 503 `auth_off` is a FAIL.
  - `/api/{janna,advisor,meetings,auth,inquiries,wa}/health`.
- `/home/user/madeinegyptgate/deploy/README-DEPLOY.md`: the Arabic runbook. It covers order of steps, secrets by name only, token permissions, the Worker, the exact DNS table, cutover and rollback, daily cron and a GitHub Actions example, and troubleshooting.
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/deploy-INTEGRATION.md` has the full patch instructions, Cloudflare findings and test log.
- `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/deploy-patch_worker_toml.py` is an idempotent patcher for the Worker config.

### Integration (exact)
1. **`worker/wrangler.toml` (required).** Uncomment the two blocks with the real resources:
   - `[[r2_buckets]] binding="MEDIA" bucket_name="migate-media"`
   - `[[d1_databases]] binding="DB" database_name="migate-db" database_id="f86e00bb-9739-4985-a149-3dddb45b2b42"`

   Command: `python3 /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/seobuild/deploy-patch_worker_toml.py /home/user/madeinegyptgate/worker/wrangler.toml`. A dry run on a copy shows `env.DB (migate-db)`, `env.MEDIA (migate-media)`, 302 KiB gzipped.
2. **Worker routes deviate from the task's "routes /api/*".** I kept the 22 specific `/api/<family>` routes. A catch-all `/api/*` would hide `/api/seo/*`, which is a Pages Function (edge §1.5). `deploy.sh` refuses a catch-all route.
3. **Do NOT add a repo-root `wrangler.toml`** (edge §1.4 proposed one). `deploy/wrangler-pages.toml` replaces it. Deploying `site/` directly makes wrangler follow the symlinks and hit the `data/data` loop.
4. **Build contract.** The new `site/` must contain `index.html`, `404.html`, `robots.txt`, a sitemap index, `_routes.json` (no `/api/*` exclude), `_headers`, `_redirects`, `_seo/redirects.json` and `_seo/pages.json`.
   - Optional `site.py` cleanup of stale top-level `*.html` after line 7: the code is in INTEGRATION §1.3.
5. **Add `build/` to `.gitignore`.**
6. **Data owners.** `data/i18n-en.js` contains `info@madeinsaudigate.com` ×10, a Saudi-clone leftover shown on English pages.
7. **Secrets the owner must add (names only):**
   - Pages, production and preview: `ADVISOR_SECRET` and `PLATFORM_KEY` (same values as the Worker). Optional: `AUTH_SECRET`, `INDEXNOW_KEY`.
   - Worker, required: `ADVISOR_SECRET`, `PLATFORM_KEY`, `MEETINGS_SECRET`, `RESEND_API_KEY`.
   - Worker, optional: `AUTH_SECRET`, `ANAM_API_KEY`, `TURNSTILE_SECRET`, `RESPONDIO_TOKEN`, `WA_WEBHOOK_SECRET`, `WA_TOKEN`; `JANNA_KEY` is best left unset.
   - `PAGES_DEPLOY_HOOK` does not apply to Direct Upload projects.
8. **Local verification:**
   ```
   python3 site.py
   deploy/deploy.sh stage
   cd build/pages-stage && npx wrangler@4.164.0 pages dev site --port 8811 --binding ADVISOR_SECRET=x
   deploy/smoke-test.sh --no-worker --stage build/pages-stage http://127.0.0.1:8811
   ```

### Cloudflare findings (read-only)
- **Present:** KV `migate-seo`, D1 `migate-db` (0 tables, confirmed with a SELECT), R2 `migate-media`.
- **Not yet created:** no Pages project; `janna-lookup` is not deployed.
- **Cutover blocker:** the `mis-egypt` Worker holds the catch-all routes `madeinegyptgate.com/*` and `www.madeinegyptgate.com/*`.
  - It proxies the old site from Hostinger and contains all the legacy redirects (`/factories/<slug>` → `company.html#N`, …), plus http→https and www→apex.
  - There are 0 Page Rules and no Redirect Rules.
  - Cutover order (README §6): atomic DNS change → Pages domains Active → www Redirect Rule + turn on Always Use HTTPS (currently OFF) → delete the two `mis-egypt` routes. Rollback is re-adding those routes.
- **DNS:** only two records change. The apex `A 46.202.158.210` and `www` (CNAME to the apex) both become proxied CNAMEs to `madeinegyptgate.pages.dev`. Everything else stays unchanged: MX `srv2142320.hstgr.cloud`, mail/webmail `2.24.62.250`, all DKIM, send/rsend, SPF, brevo-code, `_dmarc`.
- **Zone settings:** bot settings do not rewrite robots.txt. Email Routing is off.

### Test results
- **Stage gate on the merged prototype** (`integ-out` + newest `generator-out` + planted junk): 8,627 files / 204.7 MiB; 26 sitemaps / 5,521 URLs all valid; 0 errors, 2 expected warnings. `wrangler pages project validate` and `pages functions build` (144 KB) both OK.
- **Negative fixture:** all 23 planted problem types were caught.
- **Current `site/`** (the pre-SEO build) is correctly blocked.
- **Local `wrangler pages dev` + smoke test:** 45 passed, 0 failed. A further 600 random sitemap URLs were all clean. A10 Arabic URL passed in both escape cases. A7 redirects, 410s and 404 behaved as specified.
- **Stub-wrangler orchestration** of preview, release and production-without-`--yes`: correct, and the lock is released.
- **`shellcheck`:** clean.
- **`doctor` against the real account (read-only):** reports the state above.
- **Live baseline smoke** against the current old site: 43 FAIL. It detected the old site, **the 26k claim still on the live home page**, the robots.txt `#` rule, no sitemap index, and the API not deployed.

**Not tested:** a real deploy (not allowed), and the final integrated `site/`, which did not exist yet.
