# SEO for every page: description, keywords, canonical, Open Graph, Twitter, JSON-LD (Organization, WebSite, BreadcrumbList + page type)
import json as _json
SITE = 'https://madeinegyptgate.com/'
OG_IMG = SITE + 'img/og-cover.jpg'
# The platform's identity (owner 2026-11-27, docs/IDENTITY-APPROVED.md): the approved identity sentence, the official address, phone and
# working hours — word for word in Arabic; the English is a faithful translation pending the owner's look. The owner / operator lines
# (CLAUDE.md 2.7) are not here and stay exactly where they are. Used by the JSON-LD below (home, /en/, about, contact: seo_build.part.py
# org_nodes), the about and contact pages, the footer and /llms.txt.
IDENTITY_AR = 'منصة صنع في مصر هي منظومة رقمية متكاملة للصناعة والتوريدات والمشتريات والتصدير، تعمل تحت مظلة الجمعية المصرية للتنمية الصناعية، أُطلقت في عام 2020، وتُعد المنصة الأولى التي تساعد المصانع المصرية في التوسع محلياً وخليجياً وعالمياً، ووصول المنتجات المصرية إلى حصة سوقية متطورة.'
IDENTITY_EN = 'Made in Egypt Gate is an integrated digital ecosystem for industry, supply, procurement and export, operating under the umbrella of the Egypt Industrial Development Association. Launched in 2020, it is the first platform that helps Egyptian factories expand locally, across the Gulf and worldwide, and helps Egyptian products reach a growing, more advanced market share.'
ADDRESS_AR = 'عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة'
ADDRESS_EN = 'Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt'
HOURS_AR = 'من الأحد للخميس، من 8 صباحاً حتى 4 عصراً؛ الجمعة والسبت إجازة.'
HOURS_EN = 'Sunday to Thursday, 8 am to 4 pm; Friday and Saturday closed.'
# a map link built from the address text itself (no coordinates are invented)
MAP_URL = 'https://www.google.com/maps/search/?api=1&query=' + __import__('urllib.parse', fromlist=['quote_plus']).quote_plus(ADDRESS_AR + '، مصر')
_POSTAL_AR = {"@type": "PostalAddress", "streetAddress": "عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11", "addressLocality": "السادس من أكتوبر", "addressRegion": "الجيزة", "addressCountry": "EG"}
_POSTAL_EN = {"@type": "PostalAddress", "streetAddress": "Building 56 (third floor), Culture and Science Area, 11th District", "addressLocality": "6th of October City", "addressRegion": "Giza", "addressCountry": "EG"}
_HOURS_LD = [{"@type": "OpeningHoursSpecification", "dayOfWeek": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], "opens": "08:00", "closes": "16:00"}]
ORG = {
    "@type": "Organization", "@id": SITE + "#org", "sameAs": ["https://x.com/egy_business_eg", "https://www.instagram.com/mnstmsrllmnaqsat/", "https://www.youtube.com/@egyptbusinessgate", "https://www.facebook.com/profile.php?id=61595683961104", "https://www.linkedin.com/in/%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%B5%D8%B1-%D9%84%D9%84%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%88%D8%B1%D8%AF%D9%8A%D9%86-egyptbusinessgate-8a6346450/"], "name": "منصة صنع في مصر", "alternateName": ["Made in Egypt Gate", "صنع في مصر", "Made in Egypt"],
    "legalName": "الجمعية المصرية للتنمية الصناعية", "parentOrganization": {"@type": "NGO", "name": "الجمعية المصرية للتنمية الصناعية", "alternateName": "Egypt Industrial Development Association", "url": "https://eafid.org/", "nonprofitStatus": "Nonprofit", "identifier": {"@type": "PropertyValue", "propertyID": "رقم الإشهار – وزارة التضامن الاجتماعي", "value": "6189 لسنة 2017"}},
    "url": SITE, "logo": SITE + "img/logo-site.png", "image": OG_IMG, "foundingDate": "2020",
    "description": IDENTITY_AR,
    "email": "info@madeinegyptgate.com", "telephone": "+20238346757",
    "contactPoint": [{"@type": "ContactPoint", "contactType": "customer support", "telephone": "+20238346757", "email": "info@madeinegyptgate.com", "areaServed": "EG", "availableLanguage": ["ar", "en"], "hoursAvailable": _HOURS_LD},
                     {"@type": "ContactPoint", "contactType": "customer support", "telephone": "+201279188996", "email": "support@madeinegyptgate.com", "areaServed": "EG", "availableLanguage": ["ar", "en"]}],
    "address": _POSTAL_AR,
    "areaServed": {"@type": "Country", "name": "EG"}
}
# the same organisation on the English pages (/en/): English name first, the address and description in English
ORG_EN = {"name": "Made in Egypt Gate", "alternateName": ["منصة صنع في مصر", "Made in Egypt", "صنع في مصر"], "description": IDENTITY_EN, "address": _POSTAL_EN,
          "parentOrganization": {"@type": "NGO", "name": "Egypt Industrial Development Association", "alternateName": "الجمعية المصرية للتنمية الصناعية", "url": "https://eafid.org/", "nonprofitStatus": "Nonprofit"}}
# the office (Google Business Profile / local results): a ProfessionalService (a LocalBusiness) of the organisation, at the official address
OFFICE = {"@type": "ProfessionalService", "@id": SITE + "#office", "name": "منصة صنع في مصر", "alternateName": "Made in Egypt Gate", "url": SITE, "image": OG_IMG, "logo": SITE + "img/logo-site.png",
          "telephone": "+20238346757", "email": "info@madeinegyptgate.com", "address": _POSTAL_AR, "openingHoursSpecification": _HOURS_LD, "hasMap": MAP_URL,
          "areaServed": {"@type": "Country", "name": "EG"}, "parentOrganization": {"@id": SITE + "#org"}}
OFFICE_EN = {"name": "Made in Egypt Gate", "alternateName": "منصة صنع في مصر", "address": _POSTAL_EN}
WEBSITE = {"@type": "WebSite", "@id": SITE + "#web", "url": SITE, "name": "منصة صنع في مصر", "alternateName": "Made in Egypt Gate", "inLanguage": ["ar-EG", "en"], "publisher": {"@id": SITE + "#org"},
           # the site search: the factory directory's search page reads ?q= (pages.part.py fsParse)
           "potentialAction": {"@type": "SearchAction", "target": {"@type": "EntryPoint", "urlTemplate": SITE + "factories/search/?q={search_term_string}"}, "query-input": "required name=search_term_string"}}
BASE_KW = 'صنع في مصر, منصة صناعية, المصانع المصرية, المنتجات المصرية, B2B مصر'
# key: (description, keywords, schema type, breadcrumb parent [(name, url)], change frequency, priority)
SEO = {
 'home': ('منصة صنع في مصر: المنصة الوطنية الموحدة B2B لربط المصانع والموردين المصريين بالمشترين المحليين والدوليين. سوق إلكتروني للمنتجات المصرية، ومناقصات وطلبات أسعار، ومشاريع وفرص في محافظات مصر الـ27 وخمسة أسواق تصدير.', 'مناقصات مصر, طلبات عروض أسعار, سوق المنتجات المصرية, دليل المصانع المصرية, المنتج المصري, تصدير', 'WebPage', [], 'daily', '1.0'),
 'about': ('من نحن: منصة صنع في مصر، المنصة الوطنية الموحدة B2B المملوكة للجمعية المصرية للتنمية الصناعية وتشغّلها الحسيني جروب وشركاءه لربط المصانع والموردين بالمشترين المحليين والدوليين ودعم التحول الرقمي للقطاع الصناعي.', 'عن المنصة, الجمعية المصرية للتنمية الصناعية, رؤية ورسالة, المنصة الوطنية الموحدة B2B', 'AboutPage', [], 'monthly', '0.7'),
 'market': ('السوق الإلكتروني للمنتجات المصرية: اشترِ بالجملة من مصانع وموردين ومنافذ بيع في محافظات مصر، أو اطلب عرض سعر لكميتك، مع التصدير إلى خمسة أسواق.', 'سوق إلكتروني, منتجات مصرية, المنتج المصري, جملة, موردين, منافذ بيع', 'CollectionPage', [], 'daily', '0.9'),
 'offers': ('آخر عروض منافذ البيع في مدن مصر، مع إبراز المنتجات المصنوعة في مصر: السعر بالجنيه، والمتجر، والفرع، والمدينة، ومدة العرض، ورابط المصدر.', 'عروض مصر, تخفيضات, هايبر ماركت, سلاسل التجزئة, منتجات مصرية', 'CollectionPage', [('السوق', 'market.html')], 'daily', '0.8'),
 'offer': ('تفاصيل العرض: السعر قبل وبعد الخصم بالجنيه المصري، والمتجر والفرع، والمدن التي يتوفر فيها، ومدة العرض ورابط النشرة الرسمية.', 'عرض, سعر, فرع, منتج مصري', 'WebPage', [('آخر العروض', 'offers.html')], 'daily', '0.5'),
 'article': ('خبر من أخبار الصناعة المصرية على منصة صنع في مصر: التفاصيل والتاريخ والمصدر الأصلي وأخبار ذات صلة.', 'أخبار الصناعة المصرية, أخبار المصانع, صنع في مصر, الاستثمار الصناعي', 'NewsArticle', [('المركز الإعلامي', 'media-center.html'), ('الأخبار', 'news.html')], 'daily', '0.6'),
 'company': ('ملف المصنع أو الشركة في دليل منصة صنع في مصر: نبذة عن المنشأة، والقطاع، والمحافظة، والمنتجات والخدمات، ومنشآت مشابهة، وطلب عرض سعر مباشر.', 'ملف مصنع, شركة مصرية, مورد في مصر, منتجات المصنع, طلب عرض سعر', 'Organization', [('دليل المصانع', 'factories.html')], 'weekly', '0.7'),
 'suppliers': ('دليل الموردين في مصر: شركات توريد المواد الخام والمعدات والخدمات الصناعية المسجّلة في منصة صنع في مصر، حسب القطاع والمحافظة، مع ملف لكل مورد.', 'موردين مصر, شركات توريد, مواد خام, معدات صناعية, موردين القاهرة, موردين الإسكندرية, موردين العاشر من رمضان', 'CollectionPage', [('دليل المصانع', 'factories.html')], 'weekly', '0.8'),
 'outlets': ('منافذ بيع المنتج المصري: سلاسل الهايبر ماركت والسوبر ماركت في مصر التي تعرض منتجات المصانع الوطنية، مع أحدث العروض والخصومات على المنتجات المصنوعة في مصر.', 'منافذ البيع, هايبر ماركت مصر, سلاسل التجزئة, عروض المنتجات المصرية, المنتج المصري', 'CollectionPage', [('السوق', 'market.html')], 'daily', '0.7'),
 'factories': ('دليل المصانع في مصر: مصانع وشركات صناعية في محافظات مصر الـ27 مصنّفة حسب القطاع والمحافظة والمنتج، مع ملف تعريفي لكل مصنع.', 'دليل المصانع, مصانع مصر, شركات صناعية, موردين, مصانع العاشر من رمضان, مصانع السادس من أكتوبر, مصانع برج العرب', 'CollectionPage', [], 'weekly', '0.9'),
 'factory': ('ملف المصنع: المنتجات، والقطاع، والموقع، وأسواق التصدير، والصور، وطلب عرض سعر عبر منصة صنع في مصر.', 'ملف مصنع, مصنع مصري, منتجات, طلب عرض سعر', 'Organization', [('المصانع', 'factories.html')], 'monthly', '0.6'),
 'dashboard': ('لوحة المصنع: المناقصات وطلبات عروض الأسعار حسب القطاع والمحافظة، والمشاريع والترسيات وأسواق التصدير.', 'مناقصات, طلبات أسعار, لوحة المصنع', 'WebPage', [], 'daily', '0.8'),
 'opportunity': ('تفاصيل المناقصة أو طلب السعر: الجهة الطارحة، والمحافظة، والقطاع، وتاريخ الطرح والإغلاق، ورابط الإعلان الرسمي.', 'مناقصة, طلب عرض سعر, مشتريات, توريد', 'WebPage', [('طلبات الأسعار', 'dashboard.html#rfq')], 'daily', '0.6'),
 'radar': ('رادار الفرص القطاعي: الفرص محلياً حسب المحافظة وفي الأسواق الخليجية والأفريقية والآسيوية والأوروبية، مع المشاريع والجهات والترسيات والإحصاءات.', 'رادار الفرص, تقرير قطاعي, فرص تصدير, إحصاءات', 'WebPage', [('طلبات الأسعار', 'dashboard.html#rfq')], 'daily', '0.7'),
 'winners': ('الشركات الفائزة ونتائج الترسية المعلنة في مصر: من فاز بكل عقد، وبكم، ولدى أي جهة، مع رابط المصدر.', 'ترسيات, الشركات الفائزة, عقود, نتائج المناقصات', 'CollectionPage', [('طلبات الأسعار', 'dashboard.html#rfq')], 'weekly', '0.7'),
 'agencies': ('الجهات الحكومية والهيئات والشركات العامة الطارحة للمناقصات في مصر حسب القطاع والمحافظة، وترسياتها.', 'جهات حكومية, هيئات عامة, شركات قطاع الأعمال العام, مناقصات, التعاقدات الحكومية', 'CollectionPage', [('طلبات الأسعار', 'dashboard.html#rfq')], 'weekly', '0.6'),
 'entity': ('ملف الجهة أو الشركة: الترسيات والمناقصات المرتبطة بها.', 'ترسية, شركة, جهة حكومية', 'WebPage', [('الشركات الفائزة', 'winners.html')], 'weekly', '0.4'),
 'contractors': ('دليل المقاولين والموردين في مصر حسب المحافظة والتخصص.', 'مقاولين, موردين, مقاولين مصر', 'CollectionPage', [('المشاريع', 'projects.html')], 'weekly', '0.6'),
 'projects': ('مشاريع مصر: المشروعات الحكومية والخاصة في محافظات مصر الـ27، مرحلتها وقيمتها والجهات المنفذة والمواد المطلوبة، مع رابط المصدر.', 'مشاريع مصر, المشروعات القومية, مشروعات البناء, مشروعات البنية التحتية, حزم المواد', 'CollectionPage', [], 'weekly', '0.8'),
 'project': ('تفاصيل المشروع: المالك والمقاول والاستشاري والقيمة والمرحلة وحزم المواد المطلوبة ورابط المصدر.', 'مشروع, حزم المواد, مقاول, استشاري', 'WebPage', [('المشاريع', 'projects.html')], 'weekly', '0.5'),
 'leads': ('طلبات المواد من المقاولين والاستشاريين في مشاريع مصر.', 'طلبات مواد, مقاولين, استشاريين', 'CollectionPage', [('المشاريع', 'projects.html')], 'daily', '0.6'),
 'contractor-leads': ('طلبات المواد من المقاولين: الكمية والمحافظة والمهلة والميزانية لكل طلب.', 'طلبات المقاولين, مواد بناء, توريد', 'CollectionPage', [('المشاريع', 'projects.html')], 'daily', '0.7'),
 'consultant-leads': ('طلبات الاستشاريين لإدراج منتجات المصانع المصرية ضمن قوائم المواد المعتمدة في المشاريع.', 'طلبات الاستشاريين, موافقة المواد, مواصفات, نسبة المكون المحلي', 'CollectionPage', [('المشاريع', 'projects.html')], 'daily', '0.7'),
 'lead': ('تفاصيل طلب المواد: المادة والكمية والمحافظة والمهلة والمشروع المرتبط.', 'طلب مواد, توريد', 'WebPage', [('طلبات المقاولين', 'contractor-leads.html')], 'daily', '0.4'),
 'project-news': ('أخبار المشاريع في مصر: ترسيات، وبدء تنفيذ، ومراحل جديدة، مع رابط كل مشروع.', 'أخبار المشاريع, ترسيات, مشاريع جديدة', 'CollectionPage', [('المشاريع', 'projects.html')], 'daily', '0.6'),
 'region': ('محافظات مصر الـ27: المناقصات وطلبات الأسعار والمنتجات والمصانع والمشاريع والمناطق الصناعية والحرة في كل محافظة.', 'محافظات مصر, القاهرة, الجيزة, الإسكندرية, القليوبية, الشرقية, بورسعيد, السويس, أسيوط, فرص', 'CollectionPage', [], 'daily', '0.8'),
 'map': ('خريطة الفرص في مدن مصر: المناقصات وطلبات الأسعار والمشاريع والمصانع والمناطق الصناعية والحرة في كل مدينة، مع جداول ورسوم بيانية.', 'خريطة الفرص, مدن مصر, المدن الصناعية, إحصاءات', 'WebPage', [('محافظات مصر', 'region.html')], 'daily', '0.7'),
 'cities': ('المناطق الصناعية والمدن الجديدة والمناطق الحرة في مصر حسب المحافظة: العاشر من رمضان، والسادس من أكتوبر، ومدينة السادات، والعبور، وبرج العرب، والمنطقة الاقتصادية لقناة السويس (العين السخنة وشرق بورسعيد)، ومصانع كل منطقة.', 'المناطق الصناعية, المناطق الحرة, العاشر من رمضان, السادس من أكتوبر, مدينة السادات, برج العرب, المنطقة الاقتصادية لقناة السويس', 'CollectionPage', [('محافظات مصر', 'region.html')], 'monthly', '0.7'),
 'export-market': ('أسواق التصدير الخمسة للمصانع المصرية: المحلي والخليجي والأفريقي والآسيوي والأوروبي، بالفرص والمتطلبات والقطاعات.', 'تصدير, المجالس التصديرية, هيئة تنمية الصادرات, الشركة المصرية لضمان الصادرات, أفريقيا, آسيا, أوروبا', 'WebPage', [], 'weekly', '0.7'),
 'intl': ('المنصات الدولية والخليجية لمنظومة «صنع في»: منصات «صنع في» العربية والخليجية والأفريقية والآسيوية والأوروبية وروابطها.', 'منصات صنع في, منصات دولية, المنصات الخليجية', 'CollectionPage', [], 'monthly', '0.5'),
 'register': ('التسجيل والباقات السنوية بالجنيه المصري: اختر الباقة المناسبة لحجم مصنعك وأسواقك، وارفع السجل التجاري والبطاقة الضريبية، وادفع إلكترونياً لتفعيل حسابك وتصلك الفاتورة الإلكترونية.', 'تسجيل مصنع, باقات, اشتراك, الشريك الاستراتيجي, دفع إلكتروني', 'WebPage', [], 'monthly', '0.9'),
 'media-center': ('المركز الإعلامي: أخبار الصناعة المصرية بمصادرها، والمرئيات واللقاءات، وأجندة المعارض والفعاليات.', 'أخبار الصناعة, معارض, فعاليات, مرئيات', 'CollectionPage', [], 'daily', '0.7'),
 'bourse': ('البورصة الصناعية: أسعار إغلاق أسهم الشركات الصناعية المقيدة في البورصة المصرية (EGX) ومؤشرا EGX30 وEGX70، وأسعار السلع الأساسية مثل حديد التسليح والألومنيوم.', 'البورصة المصرية, EGX30, EGX70, أسهم صناعية, حديد عز, السويدي إليكتريك, حديد التسليح', 'WebPage', [], 'daily', '0.6'),
 'deal': ('رحلة الصفقة: من طلب السعر إلى العرض والاتفاق، ودليل جهات التمويل والشحن والتأمين للمصانع (للمعلومات فقط).', 'تمويل صناعي, شحن, تأمين, صفقة توريد', 'WebPage', [], 'monthly', '0.5'),
 'track': ('تتبع حالة طلب عرض السعر برقم الطلب.', 'تتبع الطلب, طلب عرض سعر', 'WebPage', [], 'monthly', '0.3'),
 'contact': ('اتصل بمنصة صنع في مصر: الخط الساخن 02 38346757، والموبايل وواتساب 01279188996، والبريد، والعنوان في مدينة السادس من أكتوبر بالجيزة. أرسل استفسارك أو طلب عرض سعر.', 'اتصل بنا, تواصل, السادس من أكتوبر, الجيزة', 'ContactPage', [], 'yearly', '0.5'),
 'news': ('أخبار الصناعة المصرية والاستثمار والتصدير بمصادرها الأصلية، محدّثة باستمرار.', 'أخبار الصناعة, أخبار المصانع, الاستثمار الصناعي, الصناعة المصرية', 'CollectionPage', [('المركز الإعلامي', 'media-center.html')], 'daily', '0.7'),
 'videos': ('المرئيات واللقاءات الصناعية: مؤتمرات ولقاءات وجولات مرئية في القطاع الصناعي المصري.', 'فيديو صناعي, لقاءات, مؤتمرات', 'CollectionPage', [('المركز الإعلامي', 'media-center.html')], 'weekly', '0.6'),
 'events': ('رزنامة المعارض والفعاليات الصناعية في مصر: التواريخ والأماكن والمنظّمون ومواقع التسجيل.', 'معارض مصر, معارض القاهرة, فعاليات صناعية, رزنامة المعارض', 'CollectionPage', [('المركز الإعلامي', 'media-center.html')], 'weekly', '0.7'),
 'event': ('تفاصيل المعرض: التاريخ والمكان والأجندة والمنظّم والموقع الرسمي، مع الإضافة إلى التقويم.', 'معرض, فعالية, أجندة', 'WebPage', [('المعارض والفعاليات', 'events.html')], 'weekly', '0.5'),
 'admin': ('لوحة إدارة منصة صنع في مصر.', '', 'WebPage', [], 'yearly', '0.1'),
 'useful-links': ('المراجع الرسمية ومواقع تهمك: دليل الجهات الصناعية في مصر وأهمية كل جهة للمصنع: الترخيص الصناعي، والمواصفات والجودة، وتفضيل المنتج المصري، والتصدير، والضرائب والجمارك.', 'وزارة الصناعة, هيئة التنمية الصناعية, الهيئة المصرية العامة للمواصفات والجودة, مصلحة الضرائب المصرية, هيئة تنمية الصادرات, مركز تحديث الصناعة', 'CollectionPage', [], 'monthly', '0.6'),
 'tenders': ('المناقصات في مصر: مناقصات الجهات الحكومية والهيئات والشركات العامة من مصادرها الرسمية، مقسّمة على محافظات مصر، مع الجهة والنشاط وآخر موعد لتقديم العطاءات.', 'مناقصات مصر, مناقصات حكومية, بوابة التعاقدات العامة, هيئة الشراء الموحد, عطاءات', 'CollectionPage', [], 'daily', '0.9'),
 'rfqs': ('طلبات عروض الأسعار (RFQs) من الشركات والمقاولين في مصر: المنتج والكمية ومكان التسليم والموعد النهائي، مقسّمة حسب المحافظة.', 'طلبات عروض الأسعار, RFQ, طلبات توريد, مشتريات الشركات, طلبات شراء', 'CollectionPage', [], 'daily', '0.9'),
 'legal': ('المركز القانوني لمنصة صنع في مصر: الشروط والأحكام، واتفاقية العضوية، وسياسة الخصوصية وحماية البيانات الشخصية وفق القانون المصري، والاسترداد، وإخلاء مسؤولية المناقصات، والشكاوى.', 'الشروط والأحكام, سياسة الخصوصية, حماية البيانات الشخصية, قانون 151 لسنة 2020, سياسة الاسترداد, المركز القانوني', 'WebPage', [], 'yearly', '0.4'),
}
def _crumbs(title, key, parents):
    items = [{"@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE}]
    for i, (n, u) in enumerate(parents):
        items.append({"@type": "ListItem", "position": i + 2, "name": n, "item": SITE + u})
    if key != 'home':
        items.append({"@type": "ListItem", "position": len(items) + 1, "name": title.split(' – ')[0], "item": SITE + key + '.html'})
    return {"@type": "BreadcrumbList", "itemListElement": items}
def seo_head(key, title):
    d = SEO.get(key) or (title, '', 'WebPage', [], 'weekly', '0.5')
    desc, kw, typ, parents = d[0], d[1], d[2], d[3]
    fac = title.split(' – ', 1)[1].strip() if key == 'factory' and ' – ' in title else ''
    if fac and 'صنع في مصر' not in fac:
        desc = 'ملف مصنع %s: المنتجات، والقطاع، والموقع، وأسواق التصدير، والصور، وطلب عرض سعر عبر منصة صنع في مصر.' % fac
        kw = fac + ', ' + kw
    if key in ('admin', 'dashboard'):
        return '<meta name="robots" content="noindex, nofollow">\n'
    url = SITE + ('' if key == 'home' else key + '.html')
    page_obj = {"@type": typ, "@id": url + "#page", "url": url, "name": title, "description": desc, "inLanguage": "ar-EG", "isPartOf": {"@id": SITE + "#web"}}
    if typ == 'Organization':
        page_obj = {"@type": "Organization", "name": fac or title, "url": url, "description": desc, "address": {"@type": "PostalAddress", "addressCountry": "EG"}}
    graph = {"@context": "https://schema.org", "@graph": [ORG, WEBSITE, page_obj, _crumbs(title, key, parents)]}
    t = title.replace('"', '&quot;'); dd = desc.replace('"', '&quot;')
    return ('<meta name="description" content="%s">\n<meta name="keywords" content="%s">\n<meta name="robots" content="index, follow, max-image-preview:large">\n'
            '<link rel="canonical" href="%s">\n<link rel="alternate" hreflang="ar-EG" href="%s">\n<link rel="alternate" hreflang="en" href="%s?lang=en">\n<link rel="alternate" hreflang="x-default" href="%s">\n'
            '<meta name="theme-color" content="#8E0B20">\n<link rel="icon" href="img/logo-site.png">\n<link rel="apple-touch-icon" href="img/logo-site.png">\n<link rel="manifest" href="manifest.webmanifest">\n'
            '<meta property="og:type" content="%s">\n<meta property="og:site_name" content="منصة صنع في مصر">\n<meta property="og:locale" content="ar_EG">\n<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n<meta property="og:url" content="%s">\n<meta property="og:image" content="%s">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            '<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="%s">\n<meta name="twitter:description" content="%s">\n<meta name="twitter:image" content="%s">\n'
            '<script type="application/ld+json">%s</script>\n') % (dd, BASE_KW + (', ' + kw if kw else ''), url, url, url, url, 'website' if key == 'home' else 'article', t, dd, url, OG_IMG, t, dd, OG_IMG, _json.dumps(graph, ensure_ascii=False))
def seo_files(OUT, keys):
    import datetime
    today = datetime.date.today().isoformat()
    urls = ''.join('<url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>\n' % (SITE + ('' if k == 'home' else k + '.html'), today, SEO.get(k, ('', '', '', [], 'weekly', '0.5'))[4], SEO.get(k, ('', '', '', [], 'weekly', '0.5'))[5]) for k in keys if k not in ('dashboard', 'admin'))
    open(OUT + 'sitemap.xml', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    open(OUT + 'robots.txt', 'w', encoding='utf-8').write('User-agent: *\nAllow: /\nDisallow: /dashboard.html\nDisallow: /register.html#form\n\nSitemap: ' + SITE + 'sitemap.xml\n')
    # the app manifests (/manifest.webmanifest + /manifest.en.webmanifest), /sw.js and /offline/ are written by seo_build.part.py emit_pwa()
