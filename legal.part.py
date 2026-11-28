# Legal center + official references (useful links)
LEGAL_CSS = COMMON_CSS + '''
/* sentences whose Arabic is split by <b>: the English is given whole (the engine would translate fragment by fragment) */
.en-t { display: none; } html[lang=en] .en-t { display: inline; } html[lang=en] .ar-t { display: none; }
.lg-wrap { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 22px; align-items: start; }
.lg-side { position: sticky; top: 84px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.lg-side input { border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; font: inherit; margin-bottom: 6px; }
.lg-side a { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 10px; color: var(--fg); font-weight: 700; font-size: .92rem; }
.lg-side a:hover { background: var(--green-soft); }
.lg-side a.on { background: var(--green); color: #fff; }
.lg-side a .i { width: 26px; text-align: center; flex: none; }
.lg-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.lg-cards a { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 6px; color: var(--fg); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.lg-cards a:hover { transform: translateY(-3px); border-color: var(--green); box-shadow: 0 12px 24px -18px rgba(0,0,0,.4); }
.lg-cards a b { font-size: .95rem; } .lg-cards a small { color: var(--muted); line-height: 1.6; } .lg-cards a .i { font-size: 1.5rem; }
.lg-doc { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 26px 28px; line-height: 2; }
.lg-doc article { display: none; } .lg-doc article.on { display: block; animation: lgIn .35s ease; }
@keyframes lgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.lg-doc h2 { font-size: 1.35rem; margin: 0 0 4px; color: var(--green-dark, #8E0B20); }
.lg-doc h3 { font-size: 1.02rem; margin: 18px 0 4px; }
.lg-doc p, .lg-doc li { color: var(--fg); font-size: .96rem; }
.lg-doc ol, .lg-doc ul { padding-inline-start: 22px; margin: 6px 0; }
.lg-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--muted); font-size: .84rem; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed var(--line); }
.lg-meta .sp { flex: 1; }
.lg-meta button { border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 4px 12px; font: inherit; font-size: .82rem; cursor: pointer; color: var(--fg); }
.lg-meta button:hover { border-color: var(--green); color: var(--green); }
.lg-note { background: #FBF4DE; border: 1px solid #EADBA8; border-radius: 12px; padding: 12px 14px; font-size: .9rem; margin: 12px 0; }
.lg-laws { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-top: 10px; }
.lg-laws a { border: 1px solid var(--line); border-radius: 12px; padding: 12px; color: var(--fg); display: flex; flex-direction: column; gap: 2px; }
.lg-laws a:hover { border-color: var(--green); } .lg-laws small { color: var(--muted); }
.lg-help { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; background: linear-gradient(90deg, #8E0B20, #C8102E); color: #fff; border-radius: 16px; padding: 18px 20px; }
.lg-help b { font-size: 1.05rem; } .lg-help .btn { background: #fff; color: #8E0B20; }
mark.lgm { background: #FFE58F; padding: 0 2px; border-radius: 3px; }
@media (max-width: 900px) { .lg-wrap { grid-template-columns: 1fr; } .lg-side { position: static; flex-direction: row; overflow-x: auto; padding: 8px; } .lg-side input { display: none; } .lg-side a { white-space: nowrap; flex: none; } .lg-doc { padding: 18px 16px; } }
@media print { .site-hdr, .util, .site-ftr, .lg-side, .lg-cards, .lg-help, .phero, .lg-meta button, .wa-float, .sanad, .sanad-btn, .sanad-tip { display: none !important; } .lg-doc { border: 0; padding: 0; } .lg-doc article { display: block !important; page-break-after: always; } }
'''

LG = [
 ('status', '🏛️', 'الوضع القانوني للمنصة', 'هوية المنصة ومشغّلها الرسمي وحدود دورها.'),
 ('terms', '📜', 'الشروط والأحكام', 'شروط استخدام المنصة وخدماتها لجميع الزوار والأعضاء.'),
 ('membership', '🪪', 'اتفاقية العضوية والباقات', 'الباقات السنوية، والتوثيق، والتجديد، والتزامات العضو.'),
 ('privacy', '🔒', 'سياسة الخصوصية وحماية البيانات', 'كيف نجمع البيانات ونستخدمها ونحميها وفق قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020.'),
 ('refund', '↩️', 'سياسة الإلغاء والاسترداد', 'حالات الإلغاء، ومدد الاسترداد، وطريقة تقديم الطلب.'),
 ('tenders', '📑', 'إخلاء مسؤولية المناقصات والمشتريات', 'مصادر المناقصات، وعدم ضمان الترسية، وحدود مسؤولية المنصة.'),
 ('rfq', '🤝', 'قواعد طلبات الأسعار والصفقات', 'ضوابط نشر الطلبات والعروض والتعامل بين المشترين والمصانع.'),
 ('ip', '©️', 'الملكية الفكرية والمحتوى', 'حقوق المنصة وحقوق الأعضاء في المحتوى والعلامات.'),
 ('cookies', '🍪', 'سياسة ملفات الارتباط', 'أنواع ملفات الارتباط وأغراضها وطريقة التحكم بها.'),
 ('complaints', '⚖️', 'الشكاوى وتسوية النزاعات', 'آلية الشكوى، والمدد، والقانون الواجب التطبيق والاختصاص القضائي.'),
 ('laws', '📚', 'القوانين والتشريعات المرجعية', 'التشريعات المصرية التي تستند إليها سياسات المنصة.'),
]

LG_BODY = {
'status': '''<p><span class="ar-t">منصة <b>صنع في مصر</b> (Made in Egypt Gate – madeinegyptgate.com) هي منظومة رقمية متكاملة للصناعة والتوريدات والمشتريات والتصدير، تعمل تحت مظلة الجمعية المصرية للتنمية الصناعية، أُطلقت في عام 2020، وتُعد المنصة الأولى التي تساعد المصانع المصرية في التوسع محلياً وخليجياً وعالمياً، ووصول المنتجات المصرية إلى حصة سوقية متطورة.</span><span class="en-t" translate="no">The <b>Made in Egypt</b> platform (Made in Egypt Gate – madeinegyptgate.com) is an integrated digital ecosystem for industry, supply, procurement and export, operating under the umbrella of the Egypt Industrial Development Association. Launched in 2020, it is the first platform that helps Egyptian factories expand locally, across the Gulf and worldwide, and helps Egyptian products reach a growing, more advanced market share.</span></p>
<h3>1. المالك والمشغّل</h3><p><span class="ar-t">المنصة مملوكة <b>للجمعية المصرية للتنمية الصناعية</b> (<span dir="ltr">Egypt Industrial Development Association</span>)، وهي جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي، وتشغّلها <b>الحسيني جروب وشركاءه</b> (استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير).</span><span class="en-t" translate="no">The platform is owned by the <b>Egypt Industrial Development Association</b>, a non-profit association registered under No. 6189 of 2017 and operating under the supervision of the Ministry of Social Solidarity, and is operated by <b>ElHouseni Group &amp; Partners</b> (receiving requests, partner registration, customer service and development).</span></p>
<ul><li>المالك: الجمعية المصرية للتنمية الصناعية.</li><li>الصفة القانونية: جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي.</li><li>الموقع الرسمي للجمعية: <a href="https://eafid.org/" target="_blank" rel="noopener">eafid.org</a>.</li><li>العنوان: عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة.</li><li>الخط الساخن: <span dir="ltr">02 38346757</span> · الموبايل وواتساب: <span dir="ltr">01279188996</span></li><li>البريد الرسمي: info@madeinegyptgate.com · الدعم الفني: support@madeinegyptgate.com</li><li>المشغّل: الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير.</li></ul>
<h3>2. طبيعة دور المنصة</h3><ul><li><span class="ar-t">المنصة <b>دليل وسوق إلكتروني ووسيط معلوماتي</b> يعرض المصانع ومنتجاتها، وينشر طلبات الأسعار والفرص والمناقصات من مصادرها.</span><span class="en-t" translate="no">The platform is <b>a directory, an e-marketplace and an information intermediary</b> that showcases factories and their products and publishes price requests, opportunities and tenders from their sources.</span></li><li><span class="ar-t">المنصة لا تطرح مناقصات حكومية بصفتها، ولا تقيّم العطاءات، ولا تختار الفائزين، ولا تُرسي العقود نيابة عن أي جهة، ولا تُعد بديلاً عن بوابة التعاقدات العامة المصرية أو عن الجهات الإدارية المختصة.</span><span class="en-t" translate="no">The platform does not issue government tenders in its own name, does not evaluate bids, does not select winners, does not award contracts on behalf of any entity, and is not a substitute for the Egyptian Public Procurement Portal or the competent administrative authorities.</span></li><li><span class="ar-t">المنصة <b>لا تقدّم تمويلاً ولا تتوسط فيه</b>، وتكتفي بالإحالة إلى الجهات الرسمية المختصة.</span><span class="en-t" translate="no">The platform <b>does not provide or broker financing</b>; it only refers users to the competent official authorities.</span></li><li>رسوم العضوية مقابل خدمات المنصة الرقمية والمعلوماتية وخدمات الظهور ودعم الأعمال، وليست رسوماً لمناقصة أو ترسية أو ترخيص أو تسجيل حكومي، ولا تضمن أي نتيجة تجارية.</li><li>تتم المدفوعات لدى المنصة <b>إلكترونياً فقط</b>: الدفع الإلكتروني عبر بوابة الدفع (البطاقات البنكية والمحافظ الإلكترونية)، ولا تقبل المنصة مدفوعات نقدية أو تحويلات بنكية.</li><li>العلاقة التعاقدية في أي صفقة قائمة بين المشتري والمورّد مباشرة.</li></ul>''',
'terms': '''<p>باستخدامك المنصة فإنك تقرّ بقراءة هذه الشروط وقبولها. إن لم توافق عليها فيُرجى عدم استخدام المنصة.</p>
<h3>1. التعريفات</h3><ul><li><b>المنصة:</b> موقع صنع في مصر (madeinegyptgate.com) وتطبيقاته وخدماته.</li><li><b>المالك:</b> الجمعية المصرية للتنمية الصناعية – الجيزة، جمهورية مصر العربية.</li><li><b>المشغّل:</b> الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير.</li><li><b>العضو:</b> المنشأة المسجّلة في إحدى الباقات المدفوعة.</li><li><b>الزائر:</b> كل من يتصفح المنصة دون عضوية.</li><li><b>المحتوى:</b> النصوص والصور والبيانات والملفات المنشورة على المنصة.</li></ul>
<h3>2. أهلية الاستخدام</h3><p>يجب أن يكون المستخدم منشأة قائمة قانوناً (لها سجل تجاري وبطاقة ضريبية سارية) أو شخصاً مفوّضاً عنها، وأن تكون البيانات المقدَّمة صحيحة ومحدّثة ومصرّحاً بنشرها.</p>
<h3>3. الاستخدام المقبول</h3><ul><li>عدم نشر بيانات مضللة أو منتجات مخالفة للقوانين أو للمواصفات القياسية المصرية المعتمدة.</li><li>عدم جمع بيانات الأعضاء آلياً أو استخدامها في رسائل غير مرغوبة.</li><li>عدم انتحال صفة جهة أو منشأة أخرى.</li><li>عدم محاولة اختراق المنصة أو تعطيلها أو الدخول غير المشروع إليها، وهي أفعال يجرّمها <b>القانون رقم 175 لسنة 2018 في شأن مكافحة جرائم تقنية المعلومات</b>.</li></ul>
<h3>4. الحسابات</h3><p>العضو مسؤول عن سرية بيانات الدخول وعن كل ما يتم عبر حسابه، ويلتزم بإبلاغ المنصة فوراً عند الاشتباه بأي استخدام غير مصرح به.</p>
<h3>5. المصادر الرسمية</h3><p>يظل المستخدم مسؤولاً عن مراجعة متطلبات أي مناقصة أو فرصة ومواعيدها وشروط الأهلية والمواصفات وإجراءات التقديم من مصدرها الرسمي قبل اتخاذ أي إجراء، وعند توفر مصدر رسمي للجهة المتعاقدة تكون مستنداته وتعليماته هي المرجع المعتمد.</p>
<h3>6. حق التعديل والإيقاف</h3><p>يحق للمنصة تعديل الخدمات أو هذه الشروط، وإيقاف أي حساب يخالفها بعد الإشعار، مع حفظ حق العضو في الاعتراض وفق سياسة الشكاوى.</p>
<h3>7. حدود المسؤولية</h3><p>تبذل المنصة العناية المعقولة في التحقق من المنشآت، لكنها لا تضمن جودة المنتجات أو تنفيذ الصفقات أو ترسية أي مناقصة، ولا تتحمّل الأضرار غير المباشرة الناتجة عن التعامل بين الأطراف، وذلك في الحدود التي يجيزها القانون المصري.</p>''',
'membership': '''<h3>1. التسجيل بالباقات</h3><p>لا يوجد تسجيل مجاني في المنصة؛ يتم التسجيل عبر <b>باقات اشتراك سنوية</b> تُحدَّد وفقاً لحجم المصنع وطاقته الإنتاجية: <span data-mig-prices="legal">تسجيل بيانات فقط (4,000 جنيه)، والأساسية (10,000 جنيه)، والمميزة (25,000 جنيه)، والشريك الأساسي (50,000 جنيه)، والشريك الاستراتيجي (100,000 جنيه) سنوياً، والأسعار غير شاملة <b>ضريبة القيمة المضافة (14%)</b></span> وفق القانون رقم 67 لسنة 2016. ويظهر للمشترك قبل إتمام الدفع اسم الباقة ورسومها ومدتها ونطاقها ومقدّم الخدمة.</p>
<h3>2. التوثيق</h3><ul><li>يقدّم العضو <b>السجل التجاري</b>، و<b>البطاقة الضريبية</b>، و<b>الرخصة الصناعية / القيد في سجل المصانع</b> لدى هيئة التنمية الصناعية (إن وجد)، و<b>شهادة التسجيل في ضريبة القيمة المضافة</b>، والشعار، والاستمارة مختومة وموقّعة.</li><li>تُراجَع الطلبات خلال 3 أيام عمل، ويحق للمنصة رفض الطلب أو طلب استكمال المستندات.</li><li>شارة «موثّق» تعني اكتمال المستندات الرسمية، ولا تعني ضمان المنتجات.</li></ul>
<h3>3. التسجيل الإلكتروني والتسجيل في المقر</h3><p>يمكن التسجيل عبر المنصة إلكترونياً أو بالحضور إلى مقر المنصة في مدينة السادس من أكتوبر بمحافظة الجيزة، ويحصل العضو في الحالتين على الحساب والمزايا ذاتها. وتتم مدفوعات المنصة <b>إلكترونياً فقط</b> عبر بوابة الدفع (البطاقات البنكية والمحافظ الإلكترونية).</p>
<h3>4. مدة الاشتراك والتجديد</h3><p>مدة الاشتراك <b>12 شهراً</b> من تاريخ التفعيل ما لم يُنص على غير ذلك في الطلب أو الفاتورة، ويُشعَر العضو قبل انتهائها بثلاثين يوماً. عدم التجديد يُوقف ظهور الملف وتلقي الطلبات دون حذف البيانات لمدة 90 يوماً.</p>
<h3>5. الترقية</h3><p>يجوز الترقية إلى باقة أعلى في أي وقت مع احتساب الفرق نسبياً للمدة المتبقية.</p>
<h3>6. التزامات العضو</h3><ul><li>تحديث بيانات المنتجات والأسعار والطاقة الإنتاجية.</li><li>الرد على طلبات الأسعار بجدية وخلال المدد المحددة.</li><li>الالتزام بالمواصفات القياسية المصرية الصادرة عن <b>الهيئة المصرية العامة للمواصفات والجودة</b>، واشتراطات الترخيص الصناعي لدى <b>هيئة التنمية الصناعية</b>، وقواعد <b>الهيئة العامة للرقابة على الصادرات والواردات</b>، والقوانين ذات العلاقة.</li></ul>
<h3>7. لا ضمان لترسية أو عقد</h3><p>لا يضمن التسجيل أو الاشتراك التأهل لمناقصة أو نجاح التقديم أو الإدراج في قائمة مختصرة أو الحصول على أمر شراء أو عقد، ولا حداً أدنى لعدد الفرص أو قيمتها؛ إذ تبقى القرارات التجارية وقرارات المشتريات لدى المشترين والجهات المتعاقدة المعنية.</p>''',
'privacy': '''<p>تلتزم المنصة بحماية البيانات الشخصية وفق <b>قانون حماية البيانات الشخصية الصادر بالقانون رقم 151 لسنة 2020</b> ولائحته التنفيذية والقوانين ذات العلاقة في جمهورية مصر العربية. والمسؤول عن معالجة البيانات هو مشغّل المنصة: الجمعية المصرية للتنمية الصناعية (مشهرة برقم 6189 لسنة 2017) — السادس من أكتوبر، الجيزة، مصر.</p>
<h3>1. البيانات التي نجمعها</h3><ul><li>بيانات المنشأة: الاسم، السجل التجاري، البطاقة الضريبية ورقم التسجيل في ضريبة القيمة المضافة، الرخصة الصناعية، العنوان والمحافظة، القطاع، المنتجات والشهادات.</li><li>بيانات المفوّض: الاسم، المسمى الوظيفي، البريد، الهاتف المحمول.</li><li>بيانات الاستخدام: الصفحات المزارة، وعمليات البحث، ونوع الجهاز، بشكل إحصائي.</li><li>بيانات الدفع: تُعالَج لدى مزوّد بوابة الدفع مباشرة، ولا تحتفظ المنصة ببيانات البطاقات أو المحافظ.</li></ul>
<h3>2. أغراض المعالجة</h3><ul><li>إنشاء الحساب وتوثيقه وتقديم الخدمات.</li><li>إرسال طلبات الأسعار والفرص المطابقة لقطاع العضو.</li><li>إصدار الفواتير الإلكترونية والوفاء بالالتزامات الضريبية والقانونية.</li><li>تحسين المنصة وقياس أدائها.</li></ul>
<h3>3. الإفصاح</h3><p>لا نبيع البيانات الشخصية. ولا نُفصح عنها إلا للمشترين والموردين ذوي الصلة بالقدر اللازم للخدمة، أو لمقدّمي الخدمات المتعاقد معهم (الاستضافة، الدفع، الاتصالات)، أو للجهات المختصة عند وجود التزام قانوني. ولا تُنقل البيانات إلى خارج جمهورية مصر العربية إلا وفق الضوابط التي يقررها القانون.</p>
<h3>4. حقوق صاحب البيانات</h3><ul><li>الحق في العلم بالبيانات الشخصية الخاصة به والاطلاع عليها والحصول عليها.</li><li>الحق في العدول عن الموافقة المسبقة على المعالجة.</li><li>الحق في تصحيحها أو تعديلها أو تحديثها أو الإضافة إليها أو محوها.</li><li>الحق في تخصيص المعالجة في نطاق محدد، والاعتراض عليها.</li><li>الحق في العلم بأي خرق أو انتهاك لبياناته الشخصية، والتقدّم بشكوى إلى <b>مركز حماية البيانات الشخصية</b>.</li></ul>
<h3>5. الحفظ والأمان</h3><p>تُحفظ البيانات على خوادم آمنة مع التشفير أثناء النقل وضوابط وصول مناسبة، مع العلم أن أي خدمة عبر الإنترنت لا يمكنها ضمان الأمان المطلق. وتُحتفظ البيانات للمدة اللازمة لتقديم الخدمات والوفاء بالالتزامات القانونية ثم تُمسح.</p>
<h3>6. التواصل</h3><p>لممارسة حقوقك راسل: info@madeinegyptgate.com، وقد نطلب تحققاً معقولاً من الهوية قبل معالجة الطلب، وسنرد خلال 30 يوماً.</p>''',
'refund': '''<h3>1. رفض الطلب بعد الدفع</h3><p>إذا رُفض طلب العضوية بعد الدفع لعدم استيفاء المستندات، يُسترد المبلغ كاملاً.</p>
<h3>2. الإلغاء قبل التفعيل</h3><p>يجوز للمشترك تقديم طلب إلغاء خلال <b>يومي عمل (2)</b> من تاريخ الدفع، بشرط ألا تكون خدمات الاشتراك الجوهرية قد فُعّلت أو قُدّمت، ويُسترد المبلغ في هذه الحالة كاملاً.</p>
<h3>3. الإلغاء بعد التفعيل</h3><p>بعد تفعيل العضوية وبدء الخدمات الرقمية المتعاقد عليها (مثل إنشاء ملف المصنع أو الوصول إلى الفرص أو التقارير أو البيانات)، لا يُسترد المبلغ كقاعدة عامة ويستمر الاشتراك حتى نهاية مدته، وذلك دون إخلال بالحقوق المقررة قانوناً، ومنها ما يقرره قانون حماية المستهلك رقم 181 لسنة 2018 متى انطبق.</p>
<h3>4. خدمات الإعلانات والبنرات</h3><p>لا تُسترد قيمة الحملات الإعلانية بعد بدء النشر، ويمكن تأجيلها قبل البدء بـ 48 ساعة.</p>
<h3>5. طريقة الطلب والمدة</h3><p>يُقدَّم طلب الاسترداد من لوحة المصنع أو بالبريد info@madeinegyptgate.com، ويُعاد المبلغ المعتمد إلى <b>وسيلة الدفع الإلكترونية الأصلية</b> (البطاقة البنكية أو المحفظة الإلكترونية) خلال 14 يوم عمل من الموافقة، وقد تختلف مدة ظهوره في الحساب بحسب الجهة المصدرة. ولا تُرد المبالغ نقداً أو بتحويل بنكي. ويُصدر للعضو <b>إشعار دائن إلكتروني</b> عبر منظومة الفاتورة الإلكترونية لمصلحة الضرائب المصرية بالمبلغ المسترد وضريبة القيمة المضافة المرتبطة به.</p>''',
'tenders': '''<h3>1. مصادر المناقصات</h3><p>قد تأتي معلومات المناقصات وطلبات العروض والمشاريع المعروضة في المنصة من <b>المصادر الرسمية المفتوحة</b> (مثل <b>بوابة التعاقدات العامة المصرية</b> etenders.gov.eg، و<b>هيئة الشراء الموحد</b>، ومواقع الجهات الحكومية والهيئات الاقتصادية وشركات قطاع الأعمال العام وشركات قطاعي البترول والكهرباء)، أو من مواقع عامة أخرى على الإنترنت، أو من المشترين وشركاء الأعمال والأعضاء المسجلين، وتُنشر بغرض الإعلام والتنبيه فقط، ويحتفظ فريق المنصة بمصدر كل معلومة.</p>
<h3>2. المرجعية</h3><ul><li>المرجع الوحيد لشروط المنافسة ومواعيدها وكراسة الشروط هو <b>الجهة المالكة للمنافسة</b> ومنصتها الرسمية، وفق قانون التعاقدات التي تبرمها الجهات العامة رقم 182 لسنة 2018 بالنسبة للجهات الخاضعة له.</li><li>يجب على المصنع التحقق من المتطلبات الأصلية والمواعيد وشروط الأهلية والمواصفات من المصدر قبل التقدّم.</li></ul>
<h3>3. حدود المسؤولية</h3><p>المنصة لا علاقة لها بالتأهيل أو التقييم أو الترسية أو العقود، ولا تتحكم في قرارات المشترين أو الجهات المتعاقدة ولا تضمنها، ولا تتحمل مسؤولية أي تعديل أو إلغاء تجريه الجهة المالكة.</p>
<h3>4. لا ضمان للترسية</h3><p>لا يضمن الاشتراك في المنصة التأهل لأي مناقصة أو الفوز بها أو الحصول على أمر شراء أو عقد حكومي أو تجاري، كما أن الإشارة إلى أفضلية المنتج المصري وفق القانون رقم 5 لسنة 2015 للإعلام فقط، وتطبيقها من اختصاص الجهة المتعاقدة.</p>
<h3>5. الشركات الفائزة</h3><p>تُعرض نتائج الترسية كما أعلنتها الجهات رسمياً، ولأي منشأة طلب تصحيح بياناتها عبر قسم الشكاوى.</p>''',
'rfq': '''<h3>1. نشر الطلبات</h3><ul><li>يجب أن يكون الطلب حقيقياً ومحدد المواصفات والكمية ومكان التسليم.</li><li>يحق للمنصة مراجعة الطلب قبل نشره أو إخفاء بيانات التواصل حتى توثيق الطالب.</li><li>الطلبات بتتسجّل من نماذج المنصة أو عن طريق جنة (المساعدة الذكية) بالضوابط نفسها، وبتتوزّع تلقائياً على المصانع المسجّلة المطابقة.</li></ul>
<h3>2. تقديم العروض</h3><ul><li>العرض المقدَّم ملزم لمقدمه خلال مدة صلاحيته المعلنة.</li><li>يُمنع التلاعب بالأسعار أو الاتفاق المسبق بين المتنافسين أو التنسيق في التقدّم للمناقصات بما يخالف <b>قانون حماية المنافسة ومنع الممارسات الاحتكارية رقم 3 لسنة 2005</b>.</li></ul>
<h3>3. التعاقد والتنفيذ</h3><p>التعاقد والدفع والتسليم تتم بين الطرفين مباشرة، ولا تحتفظ المنصة بأموال الصفقات ولا تعمل وسيطاً للدفع بينهما. وننصح بتوثيق الاتفاق كتابياً وفق القانون المدني المصري وقانون التجارة رقم 17 لسنة 1999، ويُعتدّ بالتوقيع الإلكتروني والمحررات الإلكترونية وفق <b>قانون تنظيم التوقيع الإلكتروني رقم 15 لسنة 2004</b>.</p>
<h3>4. التقييمات</h3><p>يحق للطرفين تقييم التجربة بعد التنفيذ، ويُحذف التقييم المسيء أو غير المرتبط بصفقة حقيقية.</p>''',
'ip': '''<h3>1. حقوق المنصة</h3><p>اسم المنصة وشعارها وتصميمها وقواعد بياناتها محمية وفق <b>قانون حماية حقوق الملكية الفكرية رقم 82 لسنة 2002</b> (حقوق المؤلف والحقوق المجاورة والعلامات التجارية)، ويُمنع نسخها أو إعادة نشرها دون إذن كتابي.</p>
<h3>2. محتوى الأعضاء</h3><p>يحتفظ العضو بملكية الصور والشعارات والكتالوجات التي يرفعها، ويضمن أنه يملك حق نشرها، ويمنح المنصة ترخيصاً غير حصري لعرضها والترويج لها داخل المنصة وقنواتها طوال مدة العضوية.</p>
<h3>3. الإبلاغ عن انتهاك</h3><p>لصاحب أي حق الإبلاغ عن محتوى منتهك عبر البريد الرسمي مع ما يثبت الملكية، ويُزال المحتوى المخالف خلال 5 أيام عمل من ثبوت الانتهاك.</p>''',
'cookies': '''<h3>1. ما ملفات الارتباط؟</h3><p>ملفات نصية صغيرة تُحفظ في المتصفح لتذكّر تفضيلاتك وتحسين تجربتك.</p>
<h3>2. الأنواع المستخدمة</h3><ul><li><b>ضرورية:</b> تسجيل الدخول، وتذكّر اللغة، وحجم الخط.</li><li><b>تحليلية:</b> قياس الزيارات بشكل مجمّع لتحسين المحتوى.</li><li><b>تسويقية:</b> لا تُفعّل إلا بموافقتك.</li></ul>
<h3>3. التحكم</h3><p>يمكنك حذف ملفات الارتباط أو تعطيلها من إعدادات المتصفح، مع العلم أن تعطيل الضرورية قد يؤثر في عمل بعض الخدمات. وتُعامل أي بيانات شخصية تُجمع عبرها وفق سياسة الخصوصية وقانون حماية البيانات الشخصية رقم 151 لسنة 2020.</p>''',
'complaints': '''<h3>1. تقديم الشكوى</h3><p>تُقدَّم الشكوى عبر <a href="contact.html">نموذج التواصل</a> أو البريد info@madeinegyptgate.com أو واتساب <span dir="ltr">01279188996</span> أو الخط الساخن <span dir="ltr">02 38346757</span> مع ذكر رقم العضوية أو رقم الطلب والمستندات المؤيدة.</p>
<h3>2. المدد</h3><ul><li>إشعار بالاستلام فوراً برقم متابعة (تلقائي).</li><li>الرد المبدئي خلال 5 أيام عمل.</li><li>القرار النهائي خلال 15 يوم عمل.</li></ul>
<h3>3. النزاعات بين الأعضاء</h3><p>تسعى المنصة للتوفيق الودي بين الأطراف.</p>
<h3>4. القانون الواجب التطبيق</h3><p>تخضع هذه الشروط والسياسات لقوانين <b>جمهورية مصر العربية</b>، ويُحال أي نزاع يتعذر حلّه ودياً إلى <b>محاكم محافظة الجيزة</b> المختصة، أو إلى <b>المحاكم الاقتصادية</b> المختصة فيما يدخل في ولايتها وفق القانون رقم 120 لسنة 2008 بإنشاء المحاكم الاقتصادية.</p>''',
'laws': '''<p>تستند سياسات المنصة إلى التشريعات المصرية التالية، والمرجع في نصوصها الرسمية هو ما نُشر في <b>الجريدة الرسمية</b>، ويمكن الاطلاع على تطبيقاتها عبر المواقع الرسمية للجهات المختصة المرتبطة بكل قانون:</p>
<div class="lg-laws">
<a href="https://pdpc.gov.eg/" rel="noopener" target="_blank"><b>قانون حماية البيانات الشخصية</b><small>القانون رقم 151 لسنة 2020 ولائحته التنفيذية – مركز حماية البيانات الشخصية</small></a>
<a href="https://mcit.gov.eg/" rel="noopener" target="_blank"><b>قانون مكافحة جرائم تقنية المعلومات</b><small>القانون رقم 175 لسنة 2018</small></a>
<a href="https://itida.gov.eg/" rel="noopener" target="_blank"><b>قانون تنظيم التوقيع الإلكتروني</b><small>القانون رقم 15 لسنة 2004 – هيئة تنمية صناعة تكنولوجيا المعلومات</small></a>
<a href="https://cpa.gov.eg/" rel="noopener" target="_blank"><b>قانون حماية المستهلك</b><small>القانون رقم 181 لسنة 2018 – جهاز حماية المستهلك</small></a>
<a href="https://eca.org.eg/" rel="noopener" target="_blank"><b>قانون حماية المنافسة ومنع الممارسات الاحتكارية</b><small>القانون رقم 3 لسنة 2005 وتعديلاته – حظر الاتفاقات الاحتكارية والتواطؤ</small></a>
<a href="https://egypo.gov.eg/" rel="noopener" target="_blank"><b>قانون حماية حقوق الملكية الفكرية</b><small>القانون رقم 82 لسنة 2002 – حقوق المؤلف والعلامات التجارية وبراءات الاختراع</small></a>
<a href="https://eta.gov.eg/" rel="noopener" target="_blank"><b>قانون الضريبة على القيمة المضافة</b><small>القانون رقم 67 لسنة 2016 وتعديلاته – السعر العام 14%</small></a>
<a href="https://eta.gov.eg/" rel="noopener" target="_blank"><b>قانون الإجراءات الضريبية الموحد</b><small>القانون رقم 206 لسنة 2020 – مرجع الفاتورة الإلكترونية</small></a>
<a href="https://ida.gov.eg/" rel="noopener" target="_blank"><b>قانون تيسير إجراءات منح تراخيص المنشآت الصناعية</b><small>القانون رقم 15 لسنة 2017 – مرجع الترخيص الصناعي وسجل المصانع</small></a>
<a href="https://gafi.gov.eg/" rel="noopener" target="_blank"><b>قانون الاستثمار</b><small>القانون رقم 72 لسنة 2017 – الحوافز والمناطق الاستثمارية والحرة</small></a>
<a href="https://etenders.gov.eg/" rel="noopener" target="_blank"><b>قانون التعاقدات التي تبرمها الجهات العامة</b><small>القانون رقم 182 لسنة 2018 – المرجع لتعاقدات الجهات الحكومية</small></a>
<a href="https://ida.gov.eg/" rel="noopener" target="_blank"><b>قانون تفضيل المنتجات المصرية في العقود الحكومية</b><small>القانون رقم 5 لسنة 2015 – أفضلية المنتج المصري ونسبة المكون المحلي</small></a>
<a href="https://www.egypt.gov.eg/" rel="noopener" target="_blank"><b>قانون التجارة</b><small>القانون رقم 17 لسنة 1999 – المرجع العام للالتزامات والعقود التجارية</small></a>
</div>''',
}

def _lg_page():
    cards = ''.join('<a href="#%s" data-lg="%s"><span class="i">%s</span><b>%s</b><small>%s</small></a>' % (k, k, i, t, d) for k, i, t, d in LG)
    side = '<input id="lgQ" type="search" placeholder="ابحث في المركز القانوني…" aria-label="بحث">' + ''.join('<a href="#%s" data-lg="%s"><span class="i">%s</span>%s</a>' % (k, k, i, t) for k, i, t, d in LG)
    arts = ''.join('<article id="%s" data-t="%s"><h2>%s %s</h2><div class="lg-meta"><span>آخر تحديث: 16 نوفمبر 2026</span><span>·</span><span>الإصدار 2.0</span><span class="sp"></span><button type="button" data-copy="%s">🔗 نسخ الرابط</button><button type="button" data-print>🖨️ طباعة / PDF</button></div>%s</article>' % (k, t, i, t, k, LG_BODY[k]) for k, i, t, d in LG)
    return ('''%HERO%
<main class="wrap pbody2" id="top">
<div class="lg-cards">''' + cards + '''</div>
<div class="lg-wrap"><aside class="lg-side" aria-label="أقسام المركز القانوني">''' + side + '''</aside>
<div class="lg-doc" id="lgDoc">''' + arts + '''</div></div>
<div class="lg-help"><div><b>⚖️ لديك استفسار قانوني أو شكوى؟</b><div style="opacity:.85;font-size:.9rem">ابعتها من صفحة التواصل، وهيوصلك رقم متابعة على بريدك فوراً.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="contact.html">ابعت رسالتك</a><a class="btn" href="useful-links.html">📚 المراجع الرسمية</a></div></div>
</main>''')

LG_JS = r'''
var arts = $$("#lgDoc article"), links = $$("[data-lg]");
function show(k) { if (!document.getElementById(k)) k = "status"; arts.forEach(function (a) { a.classList.toggle("on", a.id === k); }); $$(".lg-side a").forEach(function (a) { a.classList.toggle("on", a.dataset.lg === k); }); var t = (document.getElementById(k) || {}).dataset; if (t && t.t) { var tt = t.t + " – المركز القانوني – صنع في مصر"; window.__seoDone = 1; if (window.MIGSEO) MIGSEO(tt); else document.title = tt; } }
links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); history.replaceState(null, "", "#" + a.dataset.lg); show(a.dataset.lg); var d = $("#lgDoc"); if (d) window.scrollTo({ top: d.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); }); });
window.addEventListener("hashchange", function () { show(location.hash.slice(1)); });
show(location.hash.slice(1) || "status");
$("#lgDoc").addEventListener("click", function (e) {
  var c = e.target.closest("[data-copy]"); if (c) { var u = location.href.split("#")[0] + "#" + c.dataset.copy; try { var pr = navigator.clipboard && navigator.clipboard.writeText(u); if (pr && pr.catch) pr.catch(function () {}); } catch (er) {} if (window.toast) toast("تم نسخ الرابط"); }
  if (e.target.closest("[data-print]")) window.print();
});
var q = $("#lgQ"); if (q) q.addEventListener("input", function () { var v = q.value.trim(); $$("mark.lgm").forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); }); arts.forEach(function (a) { a.normalize(); }); if (v.length < 2) return; var hit = null; arts.forEach(function (a) { if (a.textContent.indexOf(v) > -1) { if (!hit) hit = a.id; var w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT), n, L = []; while ((n = w.nextNode())) if (n.nodeValue.indexOf(v) > -1) L.push(n); L.forEach(function (n) { var i = n.nodeValue.indexOf(v), r = n.splitText(i); r.splitText(v.length); var m = document.createElement("mark"); m.className = "lgm"; m.textContent = r.nodeValue; r.replaceWith(m); }); } }); $$(".lg-side a").forEach(function (a) { var art = document.getElementById(a.dataset.lg); a.style.opacity = art && art.textContent.indexOf(v) > -1 ? "1" : ".45"; }); if (hit) show(hit); });
'''
PAGES['legal'] = ('المركز القانوني – صنع في مصر', 'home', LEGAL_CSS, _lg_page(), LG_JS)
HEROS['legal'] = ('m3.jpg', '<a href="about.html">عن المنصة</a> › المركز القانوني', 'المركز القانوني', 'كل ما يخص الإطار القانوني للمنصة: الشروط والأحكام، والعضوية، والخصوصية، والاسترداد، والمناقصات، والشكاوى، والقوانين المرجعية.', '<a class="btn btn-gold" href="#terms" data-lg="terms">📜 الشروط والأحكام</a><a class="btn btn-line" href="#privacy" data-lg="privacy" style="background:#fff">🔒 سياسة الخصوصية</a>')

# ---------- Official references & useful links ----------
REFS = [
 ('gov', '🏛️ الجهات الصناعية الرئيسية', [
  ('وزارة الصناعة', 'mind.gov.eg', 'الوزارة المسؤولة عن السياسات الصناعية في مصر والجهات التابعة لها، وقراراتها الوزارية وخرائط المناطق الصناعية، والاستراتيجية الوطنية للصناعة وتعميق التصنيع المحلي.', 'أساسي لكل مصنع'),
  ('الهيئة العامة للتنمية الصناعية (IDA)', 'ida.gov.eg', 'الترخيص الصناعي وفق القانون رقم 15 لسنة 2017، وقيد المنشآت في سجل المصانع، وطرح الأراضي الصناعية في المحافظات، وحساب نسبة المكون المحلي.', 'الترخيص والأرض'),
  ('منصة مصر الصناعية الرقمية', 'egyptindustrialhub.com', 'المنصة الرسمية التي تطرح عبرها هيئة التنمية الصناعية الأراضي الصناعية والوحدات الجاهزة إلكترونياً وتتلقى الطلبات وتعلن نتائجها.', 'الأراضي والوحدات الجاهزة'),
  ('مركز تحديث الصناعة (IMC)', 'imc-egypt.org', 'برامج الدعم الفني لرفع تنافسية المصانع: تحسين الإنتاجية والجودة والتصدير والتحول الرقمي وكفاءة الطاقة.', 'رفع التنافسية'),
  ('اتحاد الصناعات المصرية', 'fei.org.eg', 'الممثل الرسمي للقطاع الصناعي عبر غرفه الصناعية المتخصصة، وينضم إليه المصنع عبر الغرفة المختصة بنشاطه.', 'الغرف الصناعية'),
  ('الهيئة العامة للاستثمار والمناطق الحرة (GAFI)', 'gafi.gov.eg', 'تأسيس الشركات عبر مراكز خدمات المستثمرين، والحوافز وفق قانون الاستثمار رقم 72 لسنة 2017، والمناطق الحرة والاستثمارية.', 'التأسيس والحوافز'),
  ('الهيئة العامة للمنطقة الاقتصادية لقناة السويس (SCZone)', 'sczone.eg', 'المناطق الصناعية والموانئ في العين السخنة وشرق بورسعيد والقنطرة غرب وشرق الإسماعيلية، مع خدمات الشباك الواحد للمستثمرين.', 'التصنيع للتصدير'),
  ('هيئة المجتمعات العمرانية الجديدة', 'newcities.gov.eg', 'تخطيط المدن الجديدة ومرافقها، ومنها مدن صناعية كبرى مثل العاشر من رمضان والسادس من أكتوبر والعبور وبدر وبرج العرب ودمياط الجديدة.', 'المدن الجديدة'),
 ]),
 ('quality', '✅ المواصفات والجودة والتراخيص', [
  ('الهيئة المصرية العامة للمواصفات والجودة (EOS)', 'eos.org.eg', 'إصدار المواصفات القياسية المصرية، وعلامة الجودة، وشهادات المطابقة وخدمات المعايرة والقياس.', 'المواصفة المصرية'),
  ('الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)', 'goeic.gov.eg', 'فحص الصادرات والواردات ومطابقتها للمواصفات، وسجل المصدّرين والمستوردين، وشهادات المنشأ لاتفاقيات التجارة.', 'التصدير والاستيراد'),
  ('هيئة الدواء المصرية', 'edaegypt.gov.eg', 'تسجيل الأدوية والمستلزمات الطبية ومستحضرات التجميل والرقابة على مصانعها وتداولها.', 'الدواء والمستلزمات الطبية'),
  ('الهيئة القومية لسلامة الغذاء', 'nfsa.gov.eg', 'ترخيص منشآت الأغذية والرقابة على سلامة الغذاء المتداول والمصدّر.', 'الصناعات الغذائية'),
  ('المجلس الوطني للاعتماد (EGAC)', 'egac.gov.eg', 'اعتماد معامل الاختبار والمعايرة وجهات منح الشهادات والتفتيش وفق المواصفات الدولية.', 'الاعتراف بالشهادات'),
  ('جهاز شؤون البيئة', 'eeaa.gov.eg', 'دراسات تقييم الأثر البيئي والموافقات البيئية للمنشآت الصناعية والرقابة على الانبعاثات.', 'الموافقة البيئية'),
  ('الحماية المدنية – وزارة الداخلية', 'moi.gov.eg', 'اشتراطات الوقاية والحماية من الحريق ومعاينات السلامة للمنشآت الصناعية.', 'سلامة المنشأة'),
  ('مكتب براءات الاختراع المصري', 'egypo.gov.eg', 'تسجيل براءات الاختراع ونماذج المنفعة، ضمن منظومة الملكية الفكرية التي يتولاها الجهاز المصري للملكية الفكرية المنشأ بالقانون رقم 163 لسنة 2023.', 'حماية الابتكار'),
 ]),
 ('content', '🇪🇬 المنتج المصري والتعاقدات العامة', [
  ('بوابة التعاقدات العامة المصرية', 'etenders.gov.eg', 'الإعلان عن مناقصات وممارسات الجهات الحكومية وفق قانون التعاقدات العامة رقم 182 لسنة 2018، والاطلاع على كراسات الشروط ونتائج الترسية.', 'المشتريات الحكومية'),
  ('هيئة الشراء الموحد (UPA)', 'upa.gov.eg', 'الشراء الموحد للمستحضرات والمستلزمات الطبية للجهات الحكومية وتأهيل الموردين والمصنّعين.', 'التوريد الطبي'),
  ('تفضيل المنتج المصري – هيئة التنمية الصناعية', 'ida.gov.eg', 'أفضلية المنتج المصري في التعاقدات الحكومية وفق القانون رقم 5 لسنة 2015 بشروط تتعلق بنسبة المكون المحلي وفارق السعر يحددها القانون ولائحته.', 'أفضلية في المشتريات'),
  ('البورصة المصرية (EGX)', 'egx.com.eg', 'سوق الأوراق المالية في مصر ومؤشرا EGX30 وEGX70، ومصدر إفصاحات الشركات الصناعية المقيدة.', 'بيانات السوق'),
  ('رؤية مصر 2030 – وزارة التخطيط', 'mped.gov.eg', 'الإطار الوطني للتنمية المستدامة الذي تندرج تحته خطط تعميق التصنيع المحلي وزيادة الصادرات.', 'التوجهات الوطنية'),
 ]),
 ('trade', '🚢 التصدير والتجارة والجمارك', [
  ('هيئة تنمية الصادرات', 'expoegypt.gov.eg', 'ترويج الصادرات المصرية والبعثات التجارية والمشاركة في المعارض الخارجية وبرامج تنمية الصادرات.', 'دعم التصدير'),
  ('مصلحة الضرائب المصرية', 'eta.gov.eg', 'البطاقة الضريبية والتسجيل في ضريبة القيمة المضافة (14%)، ومنظومتا الفاتورة الإلكترونية والإيصال الإلكتروني.', 'إلزامي للفوترة'),
  ('مصلحة الجمارك المصرية', 'customs.gov.eg', 'الإجراءات الجمركية للاستيراد والتصدير والإفراج عن مستلزمات الإنتاج ونظام السماح المؤقت.', 'الشحن والتخليص'),
  ('منصة نافذة للتجارة الخارجية', 'nafeza.gov.eg', 'المنصة الوطنية الموحدة لإجراءات التجارة الخارجية، ونظام التسجيل المسبق للشحنات (ACI) للواردات.', 'التجارة الخارجية'),
  ('الاتحاد العام للغرف التجارية المصرية', 'fedcoc.org.eg', 'الغرف التجارية في المحافظات، وشهادات المنشأ والتصديق على المستندات التجارية.', 'المستندات التجارية'),
 ]),
 ('business', '🏢 الأعمال والاستثمار والدعم', [
  ('جهاز تنمية المشروعات المتوسطة والصغيرة ومتناهية الصغر', 'msmeda.org.eg', 'برامج الدعم والتدريب والحوافز للمشروعات الصغيرة والمتوسطة وفق القانون رقم 152 لسنة 2020 (جهة مستقلة؛ المنصة لا تقدّم تمويلاً ولا تتوسط فيه).', 'للمصانع الصغيرة والمتوسطة'),
  ('جهاز حماية المنافسة ومنع الممارسات الاحتكارية', 'eca.org.eg', 'تطبيق قانون حماية المنافسة رقم 3 لسنة 2005 ومكافحة الاتفاقات الاحتكارية والتواطؤ في المناقصات.', 'الإطار التنظيمي'),
  ('جهاز حماية المستهلك', 'cpa.gov.eg', 'تطبيق قانون حماية المستهلك رقم 181 لسنة 2018 وتلقي شكاوى المستهلكين.', 'حقوق المستهلك'),
  ('هيئة تنمية صناعة تكنولوجيا المعلومات (ITIDA)', 'itida.gov.eg', 'الجهة المختصة بالتوقيع الإلكتروني وفق القانون رقم 15 لسنة 2004 وترخيص جهات التصديق الإلكتروني اللازمة للفاتورة الإلكترونية.', 'التوقيع الإلكتروني'),
  ('مركز حماية البيانات الشخصية', 'pdpc.gov.eg', 'الجهة الرقابية على تطبيق قانون حماية البيانات الشخصية رقم 151 لسنة 2020 وإصدار التراخيص والتصاريح.', 'حماية البيانات'),
  ('بوابة مصر الرقمية', 'digital.gov.eg', 'الخدمات الحكومية الإلكترونية الموحدة للمواطنين والشركات.', 'خدمات موحدة'),
 ]),
 ('hr', '👷 الموارد البشرية والخدمات', [
  ('وزارة العمل', 'labour.gov.eg', 'تنظيم علاقات العمل وتصاريح عمل الأجانب واشتراطات السلامة والصحة المهنية في المنشآت.', 'شؤون العاملين'),
  ('الهيئة القومية للتأمين الاجتماعي', 'nosi.gov.eg', 'تسجيل المنشأة والعاملين في منظومة التأمينات وفق قانون التأمينات الاجتماعية والمعاشات رقم 148 لسنة 2019.', 'التأمينات'),
  ('جهاز تنظيم مرفق الكهرباء وحماية المستهلك', 'egyptera.org', 'تعريفة الكهرباء للاستخدامات الصناعية وتنظيم سوق الكهرباء ومشروعات الطاقة المتجددة.', 'الطاقة والمرافق'),
  ('الشركة القابضة لكهرباء مصر', 'eehc.gov.eg', 'شركات توزيع الكهرباء في المحافظات وطلبات توصيل التيار للمنشآت الصناعية.', 'توصيل الكهرباء'),
  ('الجهاز المركزي للتعبئة العامة والإحصاء', 'capmas.gov.eg', 'الإحصاءات الرسمية للإنتاج الصناعي والتجارة الخارجية والأسعار لدراسة السوق.', 'دراسات السوق'),
  ('وزارة الاتصالات وتكنولوجيا المعلومات', 'mcit.gov.eg', 'برامج التحول الرقمي والبنية الرقمية الداعمة للشركات والمصانع.', 'التحول الرقمي'),
 ]),
 ('intl', '🌍 جهات عربية وإقليمية ودولية', [
  ('جامعة الدول العربية – منطقة التجارة الحرة العربية الكبرى', 'lasportal.org', 'الإعفاءات الجمركية للمنتجات ذات المنشأ العربي بين الدول الأعضاء في المنطقة.', 'الأسواق العربية'),
  ('المنظمة العربية للتنمية الصناعية والتقييس والتعدين', 'aidsmo.org', 'المواصفات القياسية العربية والدراسات الصناعية والتعدينية على المستوى العربي.', 'بيانات صناعية'),
  ('السوق المشتركة للشرق والجنوب الأفريقي (الكوميسا)', 'comesa.int', 'تكتل تجاري أفريقي تتمتع فيه الصادرات المصرية المستوفية لقواعد المنشأ بمزايا جمركية.', 'الأسواق الأفريقية'),
  ('منطقة التجارة الحرة القارية الأفريقية', 'au-afcfta.org', 'السوق الأفريقية الموحدة وقواعد المنشأ وجداول التخفيضات الجمركية.', 'القارة الأفريقية'),
  ('منظمة التجارة العالمية', 'wto.org', 'قواعد التجارة الدولية والإخطارات الخاصة بالحواجز الفنية والتدابير الصحية في أسواق التصدير.', 'الأسواق الدولية'),
  ('منظمة الأمم المتحدة للتنمية الصناعية (اليونيدو)', 'unido.org', 'برامج التنمية الصناعية المستدامة والدعم الفني ومشروعات الصناعة الخضراء.', 'الدعم الفني'),
 ]),
]

REFS_CSS = COMMON_CSS + '''
.rf-top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.rf-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.rf-tabs button { border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 7px 14px; font: inherit; font-weight: 700; font-size: .88rem; cursor: pointer; color: var(--fg); }
.rf-tabs button.on { background: var(--green); border-color: var(--green); color: #fff; }
.rf-top input { border: 1px solid var(--line); border-radius: 99px; padding: 9px 16px; font: inherit; min-width: 240px; }
.rf-sec h2 { font-size: 1.15rem; margin: 6px 0 12px; }
.rf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
.rf-c { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.rf-c:hover { transform: translateY(-3px); border-color: var(--green); box-shadow: 0 14px 26px -20px rgba(0,0,0,.45); }
.rf-c .h { display: flex; gap: 10px; align-items: center; }
.rf-c .lg { width: 42px; height: 42px; border-radius: 12px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-weight: 900; flex: none; font-size: 1rem; }
.rf-c b { font-size: .97rem; line-height: 1.5; }
.rf-c .d { color: var(--muted); font-size: .76rem; direction: ltr; text-align: right; display: block; overflow-wrap: anywhere; } html[dir="ltr"] .rf-c .d { text-align: left; }
.rf-c p { margin: 0; font-size: .9rem; line-height: 1.8; }
.rf-c p::before { content: "أهميتها لمصنعك: "; color: var(--green); font-weight: 800; }
html[lang=en] .rf-c p::before { content: "Why it matters: "; }
.rf-c .f { display: flex; justify-content: space-between; align-items: center; margin-top: auto; gap: 8px; }
.rf-c .tag { background: #FBF4DE; color: #8C6A00; border-radius: 99px; padding: 2px 10px; font-size: .76rem; font-weight: 700; }
.rf-c .go { font-weight: 800; font-size: .85rem; color: var(--green); }
.rf-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; counter-reset: s; }
.rf-steps div { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; font-size: .9rem; line-height: 1.8; counter-increment: s; display: flex; flex-direction: column; transition: transform .2s ease, box-shadow .2s ease; }
.rf-steps div:hover { transform: translateY(-3px); box-shadow: 0 14px 26px -20px rgba(0,0,0,.45); }
.rf-steps .rf-si { display: block; aspect-ratio: 16/9; max-width: 100%; background-size: cover; background-position: center; }
.rf-steps div p { margin: 0; padding: 12px 14px 14px; }
.rf-steps div::before { content: counter(s); display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--green); color: #fff; font-weight: 900;   position: absolute; top: 10px; inset-inline-start: 10px; box-shadow: 0 0 0 3px #fff; }
.rf-disc { font-size: .84rem; color: var(--muted); background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; padding: 12px 14px; }
'''

def _refs_page():
    tabs = '<button type="button" class="on" data-rf="">الكل</button>' + ''.join('<button type="button" data-rf="%s">%s</button>' % (k, t) for k, t, _ in REFS)
    secs = ''
    for k, t, items in REFS:
        cards = ''.join('<a class="rf-c" href="https://%s/" target="_blank" rel="noopener"><span class="h"><span class="lg" aria-hidden="true" translate="no" data-n="%s">%s</span><span><b>%s</b><span class="d">%s</span></span></span><p>%s</p><span class="f"><span class="tag">%s</span><span class="go">زيارة الموقع ↗</span></span></a>' % (d, n, n.replace('ال', '', 1)[:1], n, d, w, tag) for n, d, w, tag in items)
        secs += '<section class="rf-sec" data-sec="%s"><h2>%s <small class="muted" style="font-size:.8rem">(%d)</small></h2><div class="rf-grid">%s</div></section>' % (k, t, len(items), cards)
    total = sum(len(i) for _, _, i in REFS)
    _SIMG = ['img/m0.jpg', 'img/cat-build.jpg', 'img/e0.jpg', 'img/m1.jpg', 'img/e1.jpg', 'img/m2.jpg', 'img/e2.jpg', 'img/og-cover.jpg']
    steps = ''.join('<div><span class="rf-si" style="background-image:url(%s)"></span><p>%s</p></div>' % (_SIMG[i % len(_SIMG)], s) for i, s in enumerate(['استخراج <b>السجل التجاري</b> و<b>البطاقة الضريبية</b> بعد تأسيس الشركة عبر مراكز خدمات المستثمرين بـ<b>الهيئة العامة للاستثمار والمناطق الحرة</b> أو مكاتب السجل التجاري.', 'الحصول على الأرض أو الوحدة الصناعية الجاهزة من <b>هيئة التنمية الصناعية</b> عبر منصة مصر الصناعية الرقمية، أو في <b>المنطقة الاقتصادية لقناة السويس</b> أو المناطق الحرة والاستثمارية والمدن الجديدة.', 'الترخيص الصناعي (بالإخطار أو بالترخيص المسبق بحسب درجة الخطورة) وفق <b>القانون رقم 15 لسنة 2017</b>، والقيد في <b>سجل المصانع</b> لدى هيئة التنمية الصناعية.', 'الموافقات البيئية من <b>جهاز شؤون البيئة</b> واشتراطات <b>الحماية المدنية</b> للوقاية من الحريق.', 'مطابقة المنتجات للمواصفات القياسية المصرية لدى <b>الهيئة المصرية العامة للمواصفات والجودة (EOS)</b>، والرقابة على الجودة لدى <b>الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)</b>.', 'التسجيل في <b>ضريبة القيمة المضافة</b> والانضمام إلى منظومة <b>الفاتورة الإلكترونية</b> لدى مصلحة الضرائب المصرية.', 'القيد في <b>سجل المصدّرين</b> والانضمام إلى <b>المجلس التصديري</b> المختص للاستفادة من برامج <b>هيئة تنمية الصادرات</b> وبرنامج رد أعباء التصدير.', 'التسجيل في <b>منصة صنع في مصر</b> لتصلك الطلبات الفعلية.']))
    return ('''%HERO%
<main class="wrap pbody2" id="top">
<div class="rf-top"><div class="rf-tabs" id="rfTabs">''' + tabs + '''</div><input id="rfQ" type="search" placeholder="ابحث عن جهة أو خدمة…" aria-label="بحث"></div>
<div id="rfAll">''' + secs + '''</div>
<p class="muted" id="rfEmpty" hidden>لا توجد نتائج مطابقة.</p>
<section class="rf-sec"><h2>🧭 رحلة المصنع مع الجهات الرسمية</h2><div class="rf-steps">''' + steps + '''</div></section>
<div class="rf-disc">ℹ️ الروابط تؤدي إلى المواقع الرسمية للجهات (''' + str(total) + ''' جهة)، وذكرها للإرشاد ولا يعني شراكة مع المنصة. منصة صنع في مصر لا تقدّم تمويلاً. للاطلاع على الإطار القانوني راجع <a href="legal.html">المركز القانوني</a>.</div>
</main>''')

REFS_JS = r'''
var cur = "";
function apply() { var q = ($("#rfQ").value || "").trim(), any = 0; $$(".rf-sec[data-sec]").forEach(function (s) { var n = 0; Array.prototype.forEach.call(s.querySelectorAll(".rf-c"), function (c) { var ok = !q || c.textContent.toLowerCase().indexOf(q.toLowerCase()) > -1; c.style.display = ok ? "" : "none"; if (ok) n++; }); var show = (!cur || s.dataset.sec === cur) && n > 0; s.style.display = show ? "" : "none"; if (show) any++; }); $("#rfEmpty").hidden = !!any; }
$("#rfTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-rf]"); if (!b) return; cur = b.dataset.rf; $$("#rfTabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); history.replaceState(null, "", cur ? "#" + cur : location.pathname); apply(); });
$("#rfQ").addEventListener("input", apply);
function fromHash() { var h = location.hash.slice(1), b = h && document.querySelector('[data-rf="' + h + '"]'); if (b) { b.click(); var t = $("#rfTabs"); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); } }
window.addEventListener("hashchange", fromHash); fromHash();
/* badge letter from the English name in English */
if (window.MIGLANG === "en" && window.MIGTR) $$(".rf-c .lg[data-n]").forEach(function (l) { var t = MIGTR(l.dataset.n).replace(/^the\s+/i, ""); if (!/[\u0600-\u06FF]/.test(t)) l.textContent = t.charAt(0).toUpperCase(); });
'''
PAGES['useful-links'] = ('المراجع الرسمية ومواقع تهمك – صنع في مصر', 'home', REFS_CSS, _refs_page(), REFS_JS)
HEROS['useful-links'] = ('m4.jpg', '<a href="about.html">عن المنصة</a> › المراجع الرسمية ومواقع تهمك', 'المراجع الرسمية ومواقع تهمك', 'دليل الجهات الرسمية المرتبطة بالقطاع الصناعي في جمهورية مصر العربية، مع أهمية كل جهة لمصنعك وما تقدّمه من خدمات، إضافة إلى جهات عربية وإقليمية ودولية مختارة.', '<a class="btn btn-gold" href="#gov" data-jump="gov">🏛️ الجهات الصناعية</a><a class="btn btn-line" style="background:#fff" href="legal.html">⚖️ المركز القانوني</a>')

# tenders disclaimer §1, owner-approved wording 2026-11-20 («دي تمام»): web-found opportunities are published without their source; the team keeps it
en_add([('، ومواقع الجهات الحكومية والهيئات الاقتصادية وشركات قطاع الأعمال العام وشركات قطاعي البترول والكهرباء)، أو من مواقع عامة أخرى على الإنترنت، أو من المشترين وشركاء الأعمال والأعضاء المسجلين، وتُنشر بغرض الإعلام والتنبيه فقط، ويحتفظ فريق المنصة بمصدر كل معلومة', ', and the websites of government bodies, economic authorities, public business sector companies, and petroleum and electricity sector companies), from other public websites, or from buyers, business partners and registered members, and is published for information and notification purposes only; the platform team keeps the source of every item')])
en_add([("المالك: الجمعية المصرية للتنمية الصناعية", "Owner: Egypt Industrial Development Association"), ("المشغّل: الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير", "Operator: ElHouseni Group & Partners — receiving requests, partner registration, customer service and development"),
        ("الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير", "ElHouseni Group & Partners — receiving requests, partner registration, customer service and development"),
        ("1. المالك والمشغّل", "{n} Owner and Operator")])   # owner / operator (owner approval 2026-11-19)
en_add([("تسجيل بيانات فقط (4,000 جنيه)، والأساسية (10,000 جنيه)، والمميزة (25,000 جنيه)، والشريك الأساسي (50,000 جنيه)، والشريك الاستراتيجي (100,000 جنيه) سنوياً، والأسعار غير شاملة", "Data Registration Only (EGP 4,000), Basic (EGP 10,000), Premium (EGP 25,000), Core Partner (EGP 50,000) and Strategic Partner (EGP 100,000) per year; prices exclude"),
        ("تُحدَّد وفقاً لحجم المصنع وطاقته الإنتاجية:", "Set according to the factory's size and production capacity:")])
en_add([("الطلبات بتتسجّل من نماذج المنصة أو عن طريق جنة (المساعدة الذكية) بالضوابط نفسها، وبتتوزّع تلقائياً على المصانع المسجّلة المطابقة.", "Requests are recorded through the platform's forms or through Janna (the AI assistant) under the same rules, and are routed automatically to the matching registered factories."),
 ("إشعار بالاستلام فوراً برقم متابعة (تلقائي).", "Immediate acknowledgement with a tracking number (automatic)."),
 ("ابعتها من صفحة التواصل، وهيوصلك رقم متابعة على بريدك فوراً.", "Send it from the contact page and a tracking number reaches your e-mail immediately."), ("ابعت رسالتك", "Send your message")])
# the approved office address (owner 2026-11-28, docs/IDENTITY-APPROVED.md), same order as the rest of the site
en_add([("العنوان: عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة.", "Address: Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt."), ("العنوان: عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة", "Address: Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt")])
