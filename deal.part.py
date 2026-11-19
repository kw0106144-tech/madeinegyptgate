# -*- coding: utf-8 -*-
PAGES['deal'] = ('خدمات الصفقة – صنع في مصر', 'rfq', COMMON_CSS + '''
.dtabs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.dtabs a { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 6px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--fg); font-weight: 700; font-size: .88rem; text-align: center; transition: all .2s ease; }
.dtabs a span { font-size: 1.4rem; }
.dtabs a.on { background: var(--green); border-color: var(--green); color: #fff; transform: translateY(-3px); box-shadow: 0 12px 24px -14px rgba(0,0,0,.4); }
.inst { display: grid; grid-template-columns: 64px minmax(0, 1fr) 236px; gap: 16px; align-items: start; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; transition: border-color .2s ease, transform .2s ease; }
.inst:hover { border-color: var(--gold); transform: translateX(-3px); }
.inst .lg { width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center; font-size: 1.7rem; background: var(--green-soft); }
.inst h3 { font-size: 1.05rem; font-weight: 800; }
.inst .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.inst .tags .chip { white-space: normal; max-width: 100%; }
.inst dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: .85rem; margin: 8px 0 0; }
.inst dt { color: var(--muted); } .inst dd { margin: 0; }
.inst .side { display: flex; flex-direction: column; gap: 6px; }
.inst .side .btn { width: 100%; white-space: normal; text-align: center; line-height: 1.35; }
.steps4 { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; counter-reset: s; }
.steps4 li { counter-increment: s; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.steps4 li::before { content: counter(s); width: 30px; height: 30px; border-radius: 50%; background: var(--green); color: #fff; display: grid; place-items: center; font-weight: 800; }
.steps4 small { color: var(--muted); }
.inco { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.inco table { width: 100%; min-width: 680px; border-collapse: collapse; font-size: .88rem; }
.inco th { text-align: start; background: var(--sunken); color: var(--muted); font-size: .78rem; padding: 10px 12px; }
.inco td { padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: top; }
.inco td b { font-family: ui-monospace, Menlo, monospace; direction: ltr; unicode-bidi: embed; }
.ftools { display: flex; flex-wrap: wrap; gap: 8px; }
.ftools button { border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 4px 12px; font-weight: 700; font-size: .84rem; cursor: pointer; color: var(--fg); }
.ftools button.on { background: var(--green); border-color: var(--green); color: #fff; }
.warn2 { background: var(--gold-soft); border: 1px dashed var(--gold); border-radius: 12px; padding: 12px 14px; font-size: .86rem; }
@media (max-width: 900px) { .dtabs { grid-template-columns: repeat(3, 1fr); } .inst { grid-template-columns: 52px minmax(0,1fr); } .inst .side { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; } .inst .side .btn { width: auto; flex: 1; } .steps4 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .steps4 { grid-template-columns: 1fr; } }
''', '''
<div id="dhero"></div>
<main class="wrap pbody2" id="top">
  <nav class="dtabs" id="dtabs" aria-label="مراحل الصفقة"></nav>
  <div id="dbody" style="display:flex;flex-direction:column;gap:18px"></div>
</main>
''', '''
var ST = [["rfq", "📨", "طلب سعر"], ["offer", "💬", "عرض سعر"], ["agreement", "🤝", "اتفاق"], ["finance", "🏦", "دليل التمويل"], ["shipping", "🚢", "شحن وتأمين"], ["delivery", "✅", "تسليم"]];
// name, icon, kind, products, pricing, eligibility, apply, site
var FIN = [
 ["جهاز تنمية المشروعات المتوسطة والصغيرة ومتناهية الصغر (MSMEDA)", "🏛️", "gov", ["تمويل المشروعات المتوسطة والصغيرة ومتناهية الصغر", "خدمات غير مالية: التدريب ودراسات الجدوى والتسويق", "حوافز قانون تنمية المشروعات رقم 152 لسنة 2020"], "وفق برامج الجهاز وشروط الجهة الشريكة المنفِّذة", "المشروعات المتوسطة والصغيرة ومتناهية الصغر ورواد الأعمال في محافظات مصر الـ27", ["التواصل مع أقرب مكتب إقليمي للجهاز أو عبر موقعه", "تقديم الطلب مع السجل التجاري والبطاقة الضريبية ودراسة المشروع", "الدراسة والتقييم", "الموافقة والصرف عبر الجهاز أو الجهة الشريكة"], "https://www.msmeda.org.eg/"],
 ["البنك المصري لتنمية الصادرات (EBank)", "🚢", "gov", ["تمويل المصدّرين وعمليات التصدير", "تمويل التجارة الخارجية", "تمويل الشركات الصغيرة والمتوسطة"], "وفق سياسة البنك وأسعار العائد المعلنة", "مصدّرون وشركات صناعية وتجارية مسجّلة في مصر", ["فتح حساب شركات لدى البنك", "تقديم السجل التجاري والبطاقة الضريبية والقوائم المالية", "دراسة ائتمانية", "إصدار الحدود الائتمانية"], "https://www.ebank.com.eg/"],
 ["الشركة المصرية لضمان الصادرات (EGE)", "🛡️", "gov", ["تأمين ائتمان الصادرات ضد مخاطر عدم السداد", "تأمين ائتمان المبيعات المحلية", "تقارير الاستعلام عن المشترين"], "قسط تأمين حسب المشتري وبلده وشروط السداد", "مصدّرون وموردون مصريون يبيعون بالأجل محلياً أو خارجياً", ["التواصل عبر موقع الشركة", "تقديم بيانات المشتري والصفقة", "تقييم المخاطر", "إصدار وثيقة التأمين أو الحد الائتماني"], "https://www.ege-eg.com/"],
 ["البنك الأفريقي للتصدير والاستيراد (Afreximbank)", "🌍", "gov", ["تمويل التجارة الأفريقية البينية", "ضمانات وخطوط ائتمان", "برامج دعم التجارة في إطار منطقة التجارة الحرة القارية الأفريقية"], "وفق سياسة البنك ونوع التمويل", "مصدّرون ومستوردون وبنوك في الدول الأعضاء، ومنها مصر (مقر البنك الرئيسي في القاهرة)", ["الاطلاع على برامج البنك في موقعه", "التقديم مباشرة أو عبر بنك محلي شريك", "الدراسة والتقييم", "الموافقة وإصدار التمويل أو الضمان"], "https://www.afreximbank.com/"],
 ["البنك الأهلي المصري", "🏦", "bank", ["تمويل الشركات والمشروعات الصناعية", "تمويل التجارة واعتمادات مستندية", "خطابات ضمان", "تمويل المشروعات الصغيرة والمتوسطة"], "سعر العائد المرتبط بأسعار البنك المركزي المصري + هامش حسب الملاءة", "شركات مسجّلة بقوائم مالية", ["فتح حساب شركات", "تقديم السجل التجاري والبطاقة الضريبية والقوائم المالية", "دراسة ائتمانية", "إصدار الحدود الائتمانية"], "https://www.nbe.com.eg/"],
 ["بنك مصر", "🏦", "bank", ["تمويل الشركات", "تمويل التجارة الخارجية", "خطابات ضمان", "تمويل المشروعات الصغيرة والمتوسطة"], "سعر العائد المرتبط بأسعار البنك المركزي المصري + هامش حسب الملاءة", "شركات مسجّلة", ["التواصل مع مدير علاقة الشركات", "تقديم المستندات", "الدراسة والموافقة"], "https://www.banquemisr.com/"],
 ["البنك التجاري الدولي (CIB)", "🏦", "bank", ["تمويل الشركات", "تمويل التجارة واعتمادات مستندية", "تمويل رأس المال العامل"], "سعر العائد المرتبط بأسعار البنك المركزي المصري + هامش حسب الملاءة", "شركات مسجّلة", ["التواصل مع مدير العلاقة", "تقديم المستندات", "الدراسة والموافقة"], "https://www.cibeg.com/"],
 ["بنك القاهرة", "🏦", "bank", ["تمويل الشركات", "تمويل المشروعات الصغيرة والمتوسطة", "خطابات ضمان"], "سعر العائد المرتبط بأسعار البنك المركزي المصري + هامش حسب الملاءة", "شركات مسجّلة", ["التواصل مع مدير العلاقة", "تقديم المستندات", "الدراسة والموافقة"], "https://www.bdc.com.eg/"],
 ["بنك فيصل الإسلامي المصري", "🏦", "bank", ["تمويل متوافق مع أحكام الشريعة", "مرابحة سلع ومعدات", "خطابات ضمان"], "هامش ربح حسب الملاءة", "شركات ومنشآت مسجّلة", ["فتح حساب شركات", "تقديم المستندات", "دراسة ائتمانية", "توقيع العقود"], "https://www.faisalbank.com.eg/"]
];
var SHIP = [
 ["هيئة ميناء الإسكندرية (ميناءا الإسكندرية والدخيلة)", "⚓", "موانئ البحر المتوسط", ["حاويات وبضائع عامة وسائبة", "ميناء الدخيلة", "خطوط منتظمة إلى أوروبا وشمال أفريقيا"], "https://www.apa.gov.eg/"],
 ["هيئة ميناء دمياط", "⚓", "موانئ البحر المتوسط", ["محطات حاويات", "بضائع عامة وسائبة", "قرب مدينة دمياط الجديدة الصناعية"], "https://www.dpa.gov.eg/"],
 ["الهيئة العامة للمنطقة الاقتصادية لقناة السويس (SCZone)", "🚢", "موانئ ومناطق صناعية", ["ميناء العين السخنة على البحر الأحمر", "ميناء شرق بورسعيد", "المناطق الصناعية بالعين السخنة وشرق بورسعيد والقنطرة غرب"], "https://sczone.eg/"],
 ["الهيئة القومية لسكك حديد مصر", "🚆", "شحن بالقطارات", ["نقل البضائع بين الموانئ والمحافظات", "ربط الموانئ بالمناطق الصناعية"], "https://www.enr.gov.eg/"],
 ["مصر للطيران للشحن (EGYPTAIR Cargo)", "✈️", "شحن جوي", ["شحن جوي دولي من مطار القاهرة", "شحنات مبردة وحاصلات زراعية"], "https://www.egyptair.com/"],
 ["أرامكس", "📦", "شحن سريع ولوجستيات", ["شحن دولي سريع", "تخليص جمركي", "تخزين"], "https://www.aramex.com/"],
 ["DHL", "📦", "شحن جوي وسريع", ["شحن دولي سريع", "شحن جوي وبحري للشركات"], "https://www.dhl.com/eg-en/home.html"]
];
var INS = [
 ["الشركة المصرية لضمان الصادرات (EGE)", "🏛️", ["تأمين ائتمان الصادرات ضد عدم سداد المشتري", "تأمين ائتمان المبيعات المحلية"], "https://www.ege-eg.com/"],
 ["مصر للتأمين", "🛡️", ["تأمين البضائع المنقولة (بحري/بري/جوي)", "تأمين الممتلكات الصناعية"], "https://www.misrins.com/"],
 ["أليانز مصر", "🛡️", ["تأمين النقل والشحن", "تأمين الممتلكات والمعدات"], "https://www.allianz.com.eg/"],
 ["أكسا مصر", "🛡️", ["تأمين البضائع", "التأمين الهندسي وتأمين الممتلكات"], "https://www.axa-egypt.com/"]
];
var INCO = [["EXW", "تسليم من المصنع", "المشتري يتحمّل كل شيء من باب المصنع", "المشتري"], ["FCA", "التسليم للناقل", "البائع يسلّم البضاعة للناقل المحدد مخلّصة للتصدير", "المشتري"], ["FOB", "التسليم على ظهر السفينة", "البائع يتحمّل حتى تحميل البضاعة على السفينة في ميناء الشحن", "المشتري"], ["CFR", "التكلفة وأجرة الشحن", "البائع يدفع الشحن حتى ميناء الوصول، والمخاطر تنتقل عند التحميل", "المشتري"], ["CIF", "التكلفة والتأمين وأجرة الشحن", "مثل CFR مع تأمين أدنى يدفعه البائع", "البائع (تأمين أدنى)"], ["DAP", "التسليم في المكان المحدد", "البائع يوصل البضاعة إلى مكان المشتري دون تخليص الاستيراد", "البائع"], ["DDP", "التسليم مع دفع الرسوم", "البائع يتحمّل كل شيء حتى مخازن المشتري، بما فيها الرسوم", "البائع"]];
var FK = "";
function finList() {
  var l = FIN.filter(function (f) { return !FK || f[2] === FK; });
  return l.map(function (f, i) { return '<article class="inst cin" style="animation-delay:' + Math.min(i, 8) * 50 + 'ms"><span class="lg">' + f[1] + '</span><div style="min-width:0"><h3>' + f[0] + '</h3><div class="tags"><span class="chip ' + (f[2] === "gov" ? "chip-gold" : "chip-green") + '">' + (f[2] === "gov" ? "جهة حكومية / تنموية" : "مصرف تجاري") + '</span>' + f[3].map(function (p) { return '<span class="chip chip-gray">' + p + '</span>'; }).join("") + '</div><dl><dt>التسعير</dt><dd>' + f[4] + ' <small class="muted">(النسبة الفعلية تُعلن من الجهة)</small></dd><dt>الأهلية</dt><dd>' + f[5] + '</dd><dt>طريقة التقديم</dt><dd>' + f[6].map(function (s, k) { return (k + 1) + ". " + s; }).join(" ← ") + '</dd><dt>التواصل</dt><dd><a href="' + f[7] + '">' + f[7].replace(/^https?:\\/\\/(www\\.)?/, "").replace(/\\/$/, "") + ' ↗</a></dd></dl></div><div class="side"><a class="btn btn-gold" href="' + f[7] + '">التقديم عبر موقع الجهة ↗</a><button class="btn btn-line" type="button" data-copy="' + f[7] + '">نسخ رابط الجهة</button></div></article>'; }).join("");
}
var V = {
 rfq: function () { return '<div class="card2"><h2>📨 كيف ترسل طلب عرض سعر</h2><ol class="steps4"><li><b>حدّد المنتج والكمية</b><small>المواصفات، والكمية، والمحافظة ومدينة التسليم، والموعد.</small></li><li><b>اختر القطاع والمحافظة</b><small>المنصة بتبعت الطلب تلقائياً للمصانع المسجّلة المطابقة (لحد 10) وبتقولك العدد الحقيقي.</small></li><li><b>استقبل العروض</b><small>الردود وعروض الأسعار بتوصلك تلقائياً على بريدك وفي صفحة التتبع.</small></li><li><b>قارن واختر</b><small>قارن السعر والحد الأدنى للطلب ومدة التوريد وصلاحية العرض.</small></li></ol><div class="ftools"><a class="btn btn-gold" href="contact.html#rfq-form">أرسل طلب عرض سعر</a><a class="btn btn-line" href="market.html">ابحث في السوق</a><a class="btn btn-line" href="track.html">تتبع طلبك</a></div></div>'; },
 offer: function () { return '<div class="card2"><h2>💬 كيف يرد المصنع بعرض سعر</h2><ol class="steps4"><li><b>افتح الطلب الوارد</b><small>من لوحة المصنع › طلبات واردة لي.</small></li><li><b>أدخل السعر والمدة</b><small>سعر الوحدة، والحد الأدنى للطلب، ومدة التوريد، وصلاحية العرض.</small></li><li><b>وضّح التفاصيل</b><small>المواصفات والشهادات وشهادة المنشأ في ملاحظات العرض.</small></li><li><b>أرسل وتابع</b><small>العرض بيتبعت للمشتري تلقائياً، وحالة الطلب بتظهر في لوحتك.</small></li></ol><div class="ftools"><a class="btn btn-gold" href="dashboard.html#incoming">الطلبات الواردة لمصنعك</a><a class="btn btn-line" href="rfqs.html">طلبات عروض الأسعار</a></div></div>'; },
 agreement: function () { return '<div class="card2"><h2>🤝 الاتفاق وأمر الشراء</h2><p class="muted">بعد اختيار العرض بيتفق الطرفين مباشرة ويصدر المشتري أمر الشراء، ويُحدَّد شرط التسليم الدولي (Incoterms) الذي يوضح من يتحمل الشحن والتأمين والمخاطر.</p><div class="inco"><table><thead><tr><th>الشرط</th><th>الاسم</th><th>ماذا يعني</th><th>من يتحمّل التأمين</th></tr></thead><tbody>' + INCO.map(function (r) { return '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>'; }).join("") + '</tbody></table></div><div class="ftools"><a class="btn btn-gold" href="#finance">التالي: التمويل ←</a></div><span class="note2">ملخص مبسّط لشروط Incoterms 2020؛ يُرجع للنص الرسمي عند التعاقد.</span></div>'; },
 finance: function () { return '<div class="warn2">ℹ️ <b>هذا دليل استرشادي.</b> منصة صنع في مصر لا تقدّم تمويلاً ولا تتوسط فيه؛ نعرض الجهات التي تموّل المصانع وبياناتها وطريقة التقديم، ويتم التقديم والتعاقد مباشرة مع الجهة. نسب الربح والفائدة تُحدَّد من الجهة حسب ملاءة المنشأة ونوع التمويل.</div><div class="ftools" id="fk"><button class="on" data-k="">الكل (' + FIN.length + ')</button><button data-k="gov">جهات حكومية وتنموية</button><button data-k="bank">مصارف تجارية</button></div><div id="finL" style="display:flex;flex-direction:column;gap:10px">' + finList() + '</div>'; },
 shipping: function () { return '<div class="card2"><h2>🚢 الموانئ وشركات الشحن والخدمات اللوجستية</h2><div style="display:flex;flex-direction:column;gap:10px">' + SHIP.map(function (s, i) { return '<article class="inst cin" style="animation-delay:' + i * 50 + 'ms"><span class="lg">' + s[1] + '</span><div><h3>' + s[0] + '</h3><div class="tags"><span class="chip chip-green">' + s[2] + '</span>' + s[3].map(function (p) { return '<span class="chip chip-gray">' + p + '</span>'; }).join("") + '</div><dl><dt>التواصل</dt><dd><a href="' + s[4] + '">' + s[4].replace(/^https?:\\/\\/(www\\.)?/, "").replace(/\\/$/, "") + ' ↗</a></dd></dl></div><div class="side"><a class="btn btn-gold" href="' + s[4] + '">الموقع الرسمي ↗</a><button class="btn btn-line" type="button" data-copy="' + s[4] + '">نسخ الرابط</button></div></article>'; }).join("") + '</div></div><div class="card2" id="insurance" style="scroll-margin-top:96px"><h2>🛡️ التأمين على الشحنات والائتمان</h2><div style="display:flex;flex-direction:column;gap:10px">' + INS.map(function (s, i) { return '<article class="inst cin" style="animation-delay:' + i * 50 + 'ms"><span class="lg">' + s[1] + '</span><div><h3>' + s[0] + '</h3><div class="tags">' + s[2].map(function (p) { return '<span class="chip chip-gray">' + p + '</span>'; }).join("") + '</div><dl><dt>التواصل</dt><dd><a href="' + s[3] + '">' + s[3].replace(/^https?:\\/\\/(www\\.)?/, "").replace(/\\/$/, "") + ' ↗</a></dd></dl></div><div class="side"><a class="btn btn-gold" href="' + s[3] + '">الموقع الرسمي ↗</a><button class="btn btn-line" type="button" data-copy="' + s[3] + '">نسخ الرابط</button></div></article>'; }).join("") + '</div><span class="note2">دليل مرجعي؛ الأسعار والتغطيات تُطلب من الشركة مباشرة، والمنصة ليست طرفاً في التعاقد.</span></div>'; },
 delivery: function () { return '<div class="card2"><h2>✅ التسليم والسداد</h2><ol class="steps4"><li><b>تأكيد الاستلام</b><small>يؤكد المشتري الاستلام ومطابقة الكمية والمواصفات.</small></li><li><b>الفحص والقبول</b><small>تقرير فحص عند الحاجة، وتوثيق أي ملاحظات.</small></li><li><b>السداد</b><small>حسب شروط أمر الشراء أو الاعتماد المستندي.</small></li><li><b>المتابعة</b><small>حالة طلبك وردود المصانع محفوظة في «طلباتي» وصفحة التتبع.</small></li></ol><div class="ftools"><a class="btn btn-gold" href="track.html">تتبع طلبك</a><a class="btn btn-line" href="contact.html">فتح بلاغ أو نزاع</a></div></div>'; }
};
function show() {
  /* #insurance (the home page's «التأمين») = the shipping & insurance tab, opened at its insurance block */
  var h = (location.hash || "").slice(1), at = h === "insurance" ? h : ""; if (at) h = "shipping"; if (!V[h]) h = "finance";
  var st = ST.filter(function (s) { return s[0] === h; })[0];
  $("#dhero").innerHTML = HERO(h === "finance" ? "m1.jpg" : h === "shipping" ? "hero.jpg" : "m3.jpg", '<a href="home.html#steps">رحلة الصفقة</a> › ' + st[2], st[1] + " " + st[2], h === "finance" ? "دليل استرشادي لجهات تمويل المصانع في مصر: نوع التمويل، والأهلية، وطريقة التقديم، وبيانات التواصل. التقديم يتم مباشرة مع الجهة." : h === "shipping" ? "دليل الموانئ وشركات الشحن والتأمين على الشحنات والائتمان في مصر، وبيانات التواصل معها." : "كل ما تحتاجه في هذه المرحلة من الصفقة.", "");
  $("#dtabs").innerHTML = ST.map(function (s) { return '<a href="#' + s[0] + '"' + (s[0] === h ? ' class="on"' : '') + '><span>' + s[1] + '</span>' + s[2] + '</a>'; }).join("");
  $("#dbody").innerHTML = V[h]();
  var to = at && document.getElementById(at);
  if (to) setTimeout(function () { to.scrollIntoView({ block: "start" }); }, 60); else window.scrollTo(0, 0);
}
document.addEventListener("click", function (e) {
  var k = e.target.closest("#fk button"); if (k) { FK = k.dataset.k; $$("#fk button").forEach(function (x) { x.classList.toggle("on", x === k); }); $("#finL").innerHTML = finList(); return; }
  var c = e.target.closest("[data-copy]"); if (!c) return; var u = c.dataset.copy; try { navigator.clipboard.writeText(u).then(function () { toast("تم نسخ الرابط: " + u); }, function () { toast(u); }); } catch (x) { toast(u); }
});
show(); window.addEventListener("hashchange", show);
''')
HEROS['deal'] = None

en_add([("اختر القطاع والمحافظة", "Choose the sector and governorate"), ("المنصة بتبعت الطلب تلقائياً للمصانع المسجّلة المطابقة (لحد 10) وبتقولك العدد الحقيقي.", "The platform sends the request automatically to the matching registered factories (up to 10) and tells you the true number."),
 ("الردود وعروض الأسعار بتوصلك تلقائياً على بريدك وفي صفحة التتبع.", "Replies and quotes reach you automatically by e-mail and on the tracking page."),
 ("قارن السعر والحد الأدنى للطلب ومدة التوريد وصلاحية العرض.", "Compare the price, minimum order, lead time and validity."),
 ("سعر الوحدة، والحد الأدنى للطلب، ومدة التوريد، وصلاحية العرض.", "Unit price, minimum order, lead time and validity."), ("وضّح التفاصيل", "Add the details"),
 ("المواصفات والشهادات وشهادة المنشأ في ملاحظات العرض.", "Specifications, certificates and certificate of origin in the quote notes."),
 ("العرض بيتبعت للمشتري تلقائياً، وحالة الطلب بتظهر في لوحتك.", "The quote is sent to the buyer automatically, and the request status shows in your dashboard."),
 ("بعد اختيار العرض بيتفق الطرفين مباشرة ويصدر المشتري أمر الشراء، ويُحدَّد شرط التسليم الدولي (Incoterms) الذي يوضح من يتحمل الشحن والتأمين والمخاطر.", "After choosing an offer, the two parties agree directly and the buyer issues the purchase order; the Incoterms rule sets who bears shipping, insurance and risk."),
 ("التسليم والسداد", "Delivery and payment"), ("المتابعة", "Follow-up"), ("حالة طلبك وردود المصانع محفوظة في «طلباتي» وصفحة التتبع.", "Your request status and the factories' replies are kept in “My requests” and on the tracking page."), ("تتبع طلبك", "Track your request")])
