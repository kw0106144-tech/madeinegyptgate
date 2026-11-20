# -*- coding: utf-8 -*-
PLANS_CSS = '''
.plans { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: stretch; }
.plan { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 22px 18px; display: flex; flex-direction: column; gap: 10px; transition: transform .25s ease, box-shadow .25s ease; }
.plan:hover { transform: translateY(-6px); box-shadow: 0 22px 40px -24px rgba(0,0,0,.45); }
.plan.pop { border: 2px solid var(--gold); }
.plan.top { background: linear-gradient(180deg, #8E0B20, #4A0510); color: #fff; border-color: var(--gold); }
.plan.top .muted, .plan.top .for { color: rgba(255,255,255,.75) !important; }
.plan .no { font-size: .8rem; font-weight: 800; color: var(--gold-deep); }
.plan.top .no { color: var(--gold); }
.plan .badge2 { position: absolute; top: -13px; inset-inline-start: 50%; transform: translateX(50%); background: var(--gold); color: #1A1204; font-weight: 800; font-size: .76rem; padding: 3px 14px; border-radius: 99px; white-space: nowrap; }
[dir="ltr"] .plan .badge2 { transform: translateX(-50%); }
.plan h3 { font-size: 1.15rem; font-weight: 800; }
.plan .for { font-size: .84rem; color: var(--muted); }
.plan .pr { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.plan .pr b { font-size: 2rem; font-weight: 800; color: var(--green); line-height: 1.1; }
.plan.top .pr b { color: var(--gold); }
.plan .pr span { color: var(--muted); font-size: .8rem; }
.plan .scope { display: flex; flex-wrap: wrap; gap: 5px; }
.plan .scope span { background: var(--sunken); border-radius: 8px; padding: 3px 8px; font-size: .78rem; font-weight: 700; }
.plan.top .scope span { background: rgba(255,255,255,.1); }
.plan ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: .85rem; flex: 1; }
.plan li { display: flex; gap: 8px; align-items: flex-start; line-height: 1.55; }
.plan li::before { content: "✓"; color: var(--green); font-weight: 800; }
.plan.top li::before { color: var(--gold); }
.plan li.x { color: var(--muted); } .plan li.x::before { content: "🔒"; font-size: .75rem; }
.plan li.inh { font-weight: 800; }
.plan .btn { width: 100%; }
.plan .val { font-size: .8rem; border-top: 1px dashed var(--line); padding-top: 8px; color: var(--muted); }
.plan.top .val { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.8); }
.profileonly { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; background: var(--surface); border: 1px dashed var(--line); border-radius: 18px; padding: 18px 20px; margin-top: 14px; }
.profileonly b.p { font-size: 1.6rem; color: var(--green); }
.cmp { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; margin-top: 18px; }
.cmp table { width: 100%; min-width: 820px; border-collapse: collapse; font-size: .86rem; }
.cmp th, .cmp td { padding: 10px 12px; border-top: 1px solid var(--line); text-align: center; }
.cmp th:first-child, .cmp td:first-child { text-align: start; font-weight: 700; }
.cmp thead th { background: var(--sunken); border-top: 0; font-size: .8rem; }
.cmp .y { color: var(--green); font-weight: 800; } .cmp .n { color: var(--muted); }
@media (max-width: 1100px) { .plans { grid-template-columns: 1fr 1fr; } }
@media (max-width: 600px) { .plans { grid-template-columns: 1fr; } }
'''

PLANS_JS = r'''
var PLANS = [
 ["basic", "الباقة الأساسية", "10,000", "للمصانع الصغيرة اللي عايزة تبيع وتستقبل طلبات في السوق المصري", ["🇪🇬 مصر"], "30 منتجاً", "",
  ["ملف تعريفي للشركة في دليل المصانع", "حتى 30 منتجاً في السوق الإلكتروني", "المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في مصر", "الرد على المناقصات وطلبات الأسعار من المنصة", "استقبال طلبات المشترين المطابقة لنشاطك تلقائياً بالإيميل والواتساب", "إحصائيات حقيقية لملفك (مشاهدات ونقرات وطلبات)", "تنبيهات وملخصات بالجديد في قطاعك"],
  ["أخبار المشتريات و3 دول خليجية تختارها — في الباقة المميزة", "كل دول الخليج وأفريقيا والمستشار «باسم» — في باقة الشريك الأساسي", "آسيا وأوروبا وكل أسواق العالم — في باقة الشريك الاستراتيجي"], "وجود رسمي للمنشأة على المنصة وطلبات مشترين بتوصلك تلقائياً."],
 ["premium", "الباقة المميزة", "25,000", "للمصانع المتوسطة اللي عايزة حضور أقوى في مصر و3 دول خليجية تختارها", ["🇪🇬 مصر", "🌍 3 دول خليجية تختارها"], "80 منتجاً", "كل مزايا الباقة الأساسية، بالإضافة إلى:",
  ["حتى 80 منتجاً", "المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في 3 دول خليجية تختارها وقت التسجيل (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)", "أخبار المشتريات", "أولوية في توزيع طلبات المشترين التلقائي", "أولوية في ترتيب نتائج البحث والقوائم", "بانر إعلاني يظهر بالتناوب", "شعار الشركة أسفل صفحات المنتجات"],
  ["باقي دول الخليج وأفريقيا والمستشار «باسم» — في باقة الشريك الأساسي", "آسيا وأوروبا وكل أسواق العالم — في باقة الشريك الاستراتيجي"], "أولوية في الطلبات والظهور في مصر والدول الخليجية اللي اخترتها."],
 ["partner", "باقة الشريك الأساسي", "50,000", "للشركات الكبرى المستعدة للتوسع إقليمياً", ["🇪🇬 مصر", "🌍 كل دول الخليج", "🌍 أفريقيا"], "200 منتج", "كل مزايا الباقة المميزة، بالإضافة إلى:",
  ["حتى 200 منتج", "المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في كل دول الخليج الست وأفريقيا", "مستشارك الذكي للصفقات «باسم» طول السنة: فرص يومية، متابعة الصفقات، وصياغة الإيميلات", "حضور فعاليات المنصة والجمعية المصرية للتنمية الصناعية", "شهادة «شريك أساسي» وشعار الشركة على المنصة", "بانر في الصفحة الرئيسية كشريك", "إدراج في دليل المصدّرين على المنصة"],
  ["فرص آسيا وأوروبا ودول العالم"], "صفة المورد المفضل محلياً وإقليمياً مع مستشار صفقات شخصي."],
 ["strategic", "باقة الشريك الاستراتيجي", "100,000", "للشركات القابضة والمصدّرين الكبار", ["🇪🇬 مصر", "🌍 الخليج", "🌍 أفريقيا", "🌐 آسيا وأوروبا وكل الأسواق"], "منتجات غير محدودة", "كل مزايا الشريك الأساسي، بالإضافة إلى:",
  ["منتجات غير محدودة", "كل الفرص والبيانات في كل الأسواق: آسيا وأوروبا ودول العالم", "مستشارك الذكي للصفقات «باسم» في كل الأسواق", "كل الخدمات الاستشارية من فريق المنصة", "بانر «شريك استراتيجي» في كل صفحات المنصة", "تكريم من الجمعية المصرية للتنمية الصناعية", "دعوات للمعارض والمؤتمرات الصناعية في مصر والخارج", "الصفوف الأولى في البحث والكتالوجات"],
  [], "أعلى مستويات الظهور والثقة المؤسسية، وكل الأسواق."]
];
var PROFILE_ONLY = ["profile", "تسجيل بيانات الشركة فقط", "4,000"];
if (window.MIGPLANS) MIGPLANS.patchCards(PLANS, PROFILE_ONLY);   /* deploy 2: prices, limits and markets of the Control Center plans matrix */
function plansHTML(pick) {
  return PLANS.map(function (p, i) { var top = p[0] === "strategic", pop = p[0] === "partner"; return '<div class="plan cin' + (pop ? " pop" : "") + (top ? " top" : "") + '" style="animation-delay:' + i * 90 + 'ms">' + (pop ? '<span class="badge2">الأكثر طلباً للشركات الكبرى</span>' : top ? '<span class="badge2">الشريك الاستراتيجي للمنصة</span>' : '') + '<span class="no">0' + (i + 1) + '</span><h3>' + p[1] + '</h3><span class="for">' + p[3] + '</span><div class="pr"><b class="num">' + p[2] + '</b><span>جنيه سنوياً · غير شامل ضريبة القيمة المضافة</span></div><div class="scope">' + p[4].map(function (s) { return "<span>" + s + "</span>"; }).join("") + '<span>📦 ' + p[5] + '</span></div><ul>' + (p[6] ? '<li class="inh">' + p[6] + '</li>' : '') + p[7].map(function (f) { return "<li>" + f + "</li>"; }).join("") + p[8].map(function (f) { return '<li class="x">' + f + "</li>"; }).join("") + '</ul><span class="val">💡 ' + p[9] + '</span>' + (pick ? '<button type="button" class="btn ' + (pop || top ? "btn-gold" : "btn-green") + '" data-plan="' + p[0] + '">✍️ سجّل الآن</button>' : '<a class="btn ' + (pop || top ? "btn-gold" : "btn-green") + '" href="register.html#' + p[0] + '">✍️ سجّل الآن</a>') + '</div>'; }).join("");
}
'''

PAGES['register'] = ('التسجيل والباقات – صنع في مصر', 'register', COMMON_CSS + PLANS_CSS + '''
.wiz { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 20px; align-items: start; }
.steps3 { list-style: none; margin: 0; padding: 14px; display: flex; flex-direction: column; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 84px); }
.steps3 li { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 10px; color: var(--muted); font-weight: 700; font-size: .88rem; }
.steps3 li .n { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--sunken); font-size: .8rem; transition: all .3s ease; flex: none; }
.steps3 li.on { color: var(--fg); background: var(--green-soft); } .steps3 li.on .n { background: var(--green); color: #fff; }
.steps3 li.done .n { background: var(--gold); color: #1A1204; }
.pbar3 { height: 6px; border-radius: 99px; background: var(--sunken); overflow: hidden; }
.pbar3 b { display: block; height: 100%; width: 14%; background: linear-gradient(270deg, var(--gold), var(--green)); transition: width .5s cubic-bezier(.2,.8,.2,1); }
.stp { display: none; flex-direction: column; gap: 12px; } .stp.on { display: flex; animation: slideIn .45s cubic-bezier(.2,.8,.2,1); }
@keyframes slideIn { from { opacity: .2; transform: translateX(-30px); } to { opacity: 1; transform: none; } }
.chosen { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 14px; background: var(--green-soft); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: .9rem; }
.chosen a { font-weight: 700; }
.pick { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.pick label { cursor: pointer; position: relative; }
.pick input { position: absolute; opacity: 0; pointer-events: none; }
.pick span { display: flex; flex-direction: column; gap: 3px; height: 100%; border: 2px solid var(--line); border-radius: 14px; padding: 12px; transition: all .2s ease; }
.pick span b { font-size: .9rem; } .pick span em { font-style: normal; font-size: 1.15rem; font-weight: 800; color: var(--green); } .pick span small { color: var(--muted); font-size: .74rem; line-height: 1.5; }
.pick input:checked + span { border-color: var(--green); background: var(--green-soft); transform: translateY(-2px); }
.pick input:focus-visible + span { outline: 2px solid var(--gold); outline-offset: 2px; }
.cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cats label { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; cursor: pointer; font-size: .88rem; }
.sig { border: 1px dashed var(--line); border-radius: 12px; background: var(--surface); width: 100%; height: 140px; touch-action: none; cursor: crosshair; }
.nav3 { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }
.err { color: #B42318; font-size: .82rem; font-weight: 700; }
.sumbox { background: var(--sunken); border-radius: 14px; padding: 14px; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: .9rem; }
.sumbox dt { color: var(--muted); } .sumbox dd { margin: 0; font-weight: 700; text-align: end; font-variant-numeric: tabular-nums; }
.paying { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 30px; }
.spin { width: 54px; height: 54px; border-radius: 50%; border: 5px solid var(--sunken); border-top-color: var(--green); animation: sp 1s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.mails { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mail { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; animation: cin .5s ease both; }
.mail .mh { background: var(--sunken); padding: 10px 14px; font-size: .82rem; display: flex; flex-direction: column; gap: 2px; }
.mail .mb { padding: 14px; font-size: .88rem; display: flex; flex-direction: column; gap: 8px; }
.inv { width: 100%; border-collapse: collapse; font-size: .84rem; }
.inv td { padding: 6px 4px; border-bottom: 1px solid var(--line); } .inv td:last-child { text-align: end; font-variant-numeric: tabular-nums; font-weight: 700; }
.cred { background: var(--green-deep); color: #fff; border-radius: 10px; padding: 10px 12px; font-family: ui-monospace, Menlo, monospace; direction: ltr; text-align: left; font-size: .86rem; }
html[lang=en] .bi-ar { display: none; }
.done-box { text-align: center; align-items: center; padding: 26px 16px; display: flex; flex-direction: column; gap: 10px; }
.done-box .ic { width: 84px; height: 84px; border-radius: 50%; background: var(--green); color: #fff; display: grid; place-items: center; font-size: 2.4rem; animation: pop .6s cubic-bezier(.3,1.6,.6,1); }
@keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
@media (max-width: 1000px) { .pick { grid-template-columns: repeat(3, 1fr); } .cats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) { .wiz { grid-template-columns: minmax(0, 1fr); } .steps3 { position: static; flex-direction: row; overflow-x: auto; } .steps3 li { white-space: nowrap; } .mails { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .pick { grid-template-columns: 1fr 1fr; } .nav3 .btn { white-space: normal; text-align: center; line-height: 1.35; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <section id="plans" style="scroll-margin-top:90px" data-mig-buy>
    <div class="sh" style="margin-bottom:20px;display:flex;flex-direction:column;gap:6px"><span style="color:var(--gold-deep);font-weight:700;font-size:.85rem"><span class="bi-ar">باقات التسجيل السنوي · </span>Annual Registration Packages</span><h2 style="font-size:clamp(1.5rem,3vw,2rem);font-weight:800">اختر الباقة المناسبة لحجم منشأتك وأسواقك</h2><p class="muted" data-mig-gcc-intro>مدة التسجيل عام واحد من تاريخ التفعيل. «تسجيل بيانات الشركة فقط» بيعمل لشركتك بروفايل في الدليل وفي نتائج البحث بس. من الباقة الأساسية وطالع بتشوف المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع: في مصر للأساسية، ومعاها 3 دول خليجية تختارها وأخبار المشتريات للمميزة، وكل دول الخليج وأفريقيا والمستشار «باسم» للشريك الأساسي، وكل أسواق العالم و«باسم» وكل الخدمات الاستشارية للشريك الاستراتيجي. دليل الموردين والمقاولين والشركات مفتوح للكل.</p></div>
    <div class="plans" id="plansGrid"></div>
    <div class="profileonly"><div><span class="no" style="color:var(--gold-deep);font-weight:800;font-size:.8rem">05</span><h3 style="font-size:1.1rem;font-weight:800"><span class="bi-ar">تسجيل بيانات الشركة فقط · </span>Company Profile Only</h3><p class="muted" style="font-size:.88rem">بروفايل للشركة بس: ظهور الشركة في الدليل وفي نتائج البحث (الاسم والشعار ونبذة تعريفية وبيانات التواصل الرسمية). الباقة دي مابتفتحش المناقصات ولا طلبات الأسعار ولا الترسيات ولا أخبار المشاريع ولا أي فرص، ومن غير منتجات ولا استقبال طلبات — للفرص: الباقة الأساسية فأعلى.</p></div><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><b class="p num"><span data-mig-price="profile">4,000</span> <small style="font-size:.85rem" class="muted">جنيه سنوياً</small></b><button class="btn btn-line" type="button" data-plan="profile">✍️ سجّل الآن</button></div></div>
  </section>

  <section class="wiz" id="form" style="scroll-margin-top:90px">
    <div data-mig-off="registrations" hidden></div>
    <ol class="steps3" id="steps3" data-mig-feature="registrations"><li data-s="0" hidden><span class="n">0</span>الباقة</li><li data-s="1"><span class="n">2</span>بيانات الشركة</li><li data-s="2"><span class="n">3</span>النشاط والقطاعات</li><li data-s="3"><span class="n">4</span>المستندات</li><li data-s="4"><span class="n">5</span>مسؤول التسجيل</li><li data-s="5"><span class="n">6</span>مراجعة وإرسال</li><li data-s="6"><span class="n">7</span>استلام الطلب</li></ol>
    <form class="card2" id="regF" novalidate data-mig-feature="registrations">
      <div class="pbar3"><b id="pb3"></b></div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><h2 id="stTitle"><span class="bi-ar">استمارة التسجيل · </span>Registration Form</h2><span class="chip chip-gray num" id="today"></span></div>

      <div class="stp" data-s="0"></div><div class="chosen" id="chosen" data-mig-buy></div>

      <div class="stp" data-s="1">
        <fieldset class="gccf" id="gccF" hidden aria-describedby="gccH gccN"><legend id="gccL"><span class="bi-ar">اختار 3 دول خليجية لباقتك المميزة · </span>Choose 3 Gulf states for your Premium plan *</legend>
          <p class="gcch" id="gccH">الفرص والمناقصات وطلبات الأسعار في الدول دي بتبقى ضمن باقتك. كل دول الخليج الست متاحة في باقة الشريك الأساسي.</p>
          <div class="gccg" id="gccG"></div><p class="gccn num" id="gccN" aria-live="polite"></p><p class="gcch" id="gccRO" role="status" hidden></p><input type="hidden" id="r-gcc">
        </fieldset>
        <div class="fgrid2">
        <label class="f2"><span class="lb"><span class="bi-ar">اسم الشركة · </span>Company Name *</span><input id="r-name" required></label>
        <label class="f2"><span class="lb"><span class="bi-ar">اسم المدير · </span>Manager Name *</span><input id="r-mgr" required></label>
        <label class="f2"><span class="lb"><span class="bi-ar">رقم الهاتف · </span>Tel No. *</span><input id="r-tel" required dir="ltr" inputmode="tel" placeholder="+20 2 XXXX XXXX"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">الرمز البريدي · </span>Postal Code</span><input id="r-pob" dir="ltr" inputmode="numeric"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">المحافظة · </span>Governorate *</span><select id="r-emi" required><option value="">اختر المحافظة</option><option value="CAI">القاهرة · Cairo</option><option value="GIZ">الجيزة · Giza</option><option value="ALX">الإسكندرية · Alexandria</option><option value="QLB">القليوبية · Qalyubia</option><option value="SHR">الشرقية · Sharqia</option><option value="DKH">الدقهلية · Dakahlia</option><option value="GHR">الغربية · Gharbia</option><option value="MNF">المنوفية · Monufia</option><option value="BHR">البحيرة · Beheira</option><option value="KFS">كفر الشيخ · Kafr El Sheikh</option><option value="DMT">دمياط · Damietta</option><option value="PTS">بورسعيد · Port Said</option><option value="ISM">الإسماعيلية · Ismailia</option><option value="SUZ">السويس · Suez</option><option value="NSN">شمال سيناء · North Sinai</option><option value="JSN">جنوب سيناء · South Sinai</option><option value="FYM">الفيوم · Faiyum</option><option value="BNS">بني سويف · Beni Suef</option><option value="MNY">المنيا · Minya</option><option value="AST">أسيوط · Asyut</option><option value="SHG">سوهاج · Sohag</option><option value="QNA">قنا · Qena</option><option value="LXR">الأقصر · Luxor</option><option value="ASN">أسوان · Aswan</option><option value="BBA">البحر الأحمر · Red Sea</option><option value="WAD">الوادي الجديد · New Valley</option><option value="MTR">مطروح · Matrouh</option></select></label>
        <label class="f2"><span class="lb"><span class="bi-ar">العنوان · </span>Address *</span><input id="r-addr" required placeholder="المدينة أو المنطقة الصناعية، الحي، رقم القطعة"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">رقم السجل التجاري · </span>Commercial Register No. *</span><input id="r-cr" required></label>
        <label class="f2"><span class="lb"><span class="bi-ar">رقم الرخصة الصناعية / سجل المصانع · </span>Industrial Licence No.</span><input id="r-lic"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">رقم التسجيل الضريبي (البطاقة الضريبية) · </span>Tax Registration No. *</span><input id="r-vat" required dir="ltr" inputmode="numeric" placeholder="9 أرقام · 123-456-789"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">الموقع الإلكتروني · </span>Website</span><input id="r-web" dir="ltr" placeholder="www.company.com.eg"></label>
        <label class="f2 full"><span class="lb"><span class="bi-ar">البريد الإلكتروني · </span>E-mail * </span><small class="muted">(عليه بيوصلك إيصال الطلب وكود الدخول ورابط الدفع)</small><input id="r-mail" type="email" required dir="ltr" placeholder="info@company.com.eg"></label>
      </div></div>

      <div class="stp" data-s="2">
        <label class="f2"><span class="lb"><span class="bi-ar">النشاط · </span>Activity *</span><input id="r-act" required placeholder="مثال: تصنيع أنابيب ووصلات PVC و HDPE"></label>
        <label class="f2"><span class="lb"><span class="bi-ar">المنتجات · </span>Products *</span><textarea id="r-prod" required placeholder="اكتب أهم المنتجات، كل منتج في سطر"></textarea><small class="muted" id="prodHint"></small></label>
        <div class="f2"><span><span class="bi-ar">القطاعات · </span>Categories *</span><div class="cats" id="cats"></div></div>
      </div>

      <div class="stp" data-s="3"><div class="card2" style="background:var(--sunken)"><h3 style="font-size:1rem;font-weight:800">📎 المستندات المطلوبة لتوثيق المنشأة</h3><ul style="margin:0;padding-inline-start:20px;line-height:2">
        <li>السجل التجاري</li><li>البطاقة الضريبية وشهادة التسجيل في ضريبة القيمة المضافة</li><li>الرخصة الصناعية / سجل المصانع لدى هيئة التنمية الصناعية (إن وجد)</li><li>شعار الشركة، والملف التعريفي (اختياري)</li></ul>
        <p class="muted" style="margin:0">مش مطلوب ترفعها دلوقتي: رفع المستندات بيتفتح من حسابك على المنصة بعد تسجيل الطلب، وشارة «موثّق» بتظهر بعد مراجعتها.</p></div></div>

      <div class="stp" data-s="4"><div class="fgrid2">
        <label class="f2"><span class="lb"><span class="bi-ar">مسؤول التسجيل – الاسم · </span>Reg Officer Name *</span><input id="o-name" required></label>
        <label class="f2"><span class="lb"><span class="bi-ar">متحرك · </span>Mobile No *</span><input id="o-mob" required dir="ltr" inputmode="tel" placeholder="+20 1X XXXX XXXX"></label>
        <label class="f2 full"><span class="lb"><span class="bi-ar">الإيميل · </span>E-mail *</span><input id="o-mail" type="email" required dir="ltr"></label>
        <label class="f2 full" style="flex-direction:row;align-items:flex-start;gap:8px;font-weight:600"><input type="checkbox" id="o-terms" style="margin-top:5px"> <span>أقرّ بصحة البيانات، وأوافق على <a href="legal.html#terms" target="_blank" style="color:var(--green);text-decoration:underline">الشروط والأحكام</a> و<a href="legal.html#membership" target="_blank" style="color:var(--green);text-decoration:underline">اتفاقية العضوية</a> و<a href="legal.html#privacy" target="_blank" style="color:var(--green);text-decoration:underline">سياسة الخصوصية</a>. مدة التسجيل في المنصة عام واحد.</span></label>
        <div class="full" id="o-cons"></div>
      </div></div>

      <div class="stp" data-s="5">
        <dl class="sumbox" id="sum"></dl>
        <div class="note2" style="line-height:1.9" data-mig-vat data-mig-buy id="payNote2">🔒 الدفع الإلكتروني بيتم في صفحة بوابة الدفع الآمنة نفسها (البطاقات البنكية والمحافظ الإلكترونية)، ومنصتنا <b>مش بتطلب ولا بتحفظ بيانات أي كارت</b>. بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع، والفاتورة الإلكترونية (شاملة ضريبة القيمة المضافة 14%) بتوصلك على نفس البريد.</div>
      </div>

      <div class="stp" data-s="6" id="doneStep"></div>

      <span class="err" id="err" aria-live="polite"></span>
      <div class="nav3" id="nav3"><button class="btn btn-line" type="button" id="prev">→ السابق</button><button class="btn btn-green" type="button" id="next">التالي ←</button></div>
    </form>
  </section>
</main>
''', PLANS_JS + r'''
$("#plansGrid").innerHTML = plansHTML(true);
/* the platform's own app with buying off there (data/flags.js MIGFLAGS.buyOff: «🛠️ المطوّر» app_buy_ios / app_buy_android, ON by default =
   exactly like the website): the plan cards, prices and payment lines are hidden ([data-mig-buy]), the company form stays and goes to the
   team without a plan (the server then issues no invoice) — app parity plan, item app-buy-switch */
function buyOff() { return !!(window.MIGFLAGS && MIGFLAGS.buyOff && MIGFLAGS.buyOff()); }
[].forEach.call(document.querySelectorAll('.phero p, .phero a[href="#plans"]'), function (x) { x.setAttribute("data-mig-buy", ""); });
window.addEventListener("mig:flags", function () { if (buyOff()) { drawGcc(); prodHint(); } });
/* deploy 2: the gateway is live (Control Center) → the step-5 note no longer says it is being set up */
if (window.MIGPAYREADY && $("#payNote2")) $("#payNote2").innerHTML = (window.MIGLANG === "en" ? "🔒 Online payment happens on the secure payment gateway's own page (bank cards and e-wallets); our platform <b>never asks for or stores card details</b>. After you send the application, the secure payment link reaches the company e-mail within minutes, the account is activated automatically after payment, and the e-invoice (including VAT) reaches the same e-mail." : "🔒 الدفع الإلكتروني بيتم في صفحة بوابة الدفع الآمنة نفسها (البطاقات البنكية والمحافظ الإلكترونية)، ومنصتنا <b>مش بتطلب ولا بتحفظ بيانات أي كارت</b>. بعد ما تبعت الطلب، رابط الدفع الآمن بيوصلك على بريد الشركة خلال دقايق، والحساب بيتفعّل تلقائياً بعد الدفع، والفاتورة الإلكترونية (شاملة ضريبة القيمة المضافة) بتوصلك على نفس البريد.");
try { var gt = sessionStorage.getItem("mig-gate"); if (gt) { sessionStorage.removeItem("mig-gate"); /* fixed text and the gated item («label: item») go in separate spans so each part is translated in English */ var EN = window.MIGLANG === "en", gi = gt.indexOf(": "), gw = document.createElement("div"); gw.className = "warn2"; gw.setAttribute("style", "background:var(--gold-soft);border:1px dashed var(--gold);border-radius:12px;padding:12px 14px;margin-bottom:14px;font-weight:700"); [EN ? "🔒 To view" : "🔒 لعرض", " "].concat(gi > 0 ? [gt.slice(0, gi), ": ", gt.slice(gi + 2)] : [gt], [EN ? ". " : " ", "سجّل منشأتك واختر الباقة المناسبة. القوائم متاحة للتصفح، والتفاصيل والتقديم للمشتركين."]).forEach(function (t) { var sp = document.createElement("span"); sp.textContent = t; gw.appendChild(sp); }); $("#plans").insertAdjacentElement("afterbegin", gw); } } catch (x) {}
/* «عربي · English» labels: the Arabic half is hidden in English (html[lang=en] .bi-ar) so the English is not duplicated */
var EN = window.MIGLANG === "en";
function bi(t) { var i = t.indexOf(" · "); return i < 0 ? t : '<span><span class="bi-ar">' + t.slice(0, i + 3) + "</span>" + t.slice(i + 3) + "</span>"; }
var ALL = PLANS.map(function (p) { return [p[0], p[1], p[2], p[5]]; }).concat([["profile", "تسجيل بيانات فقط", PROFILE_ONLY[2], "بدون منتجات"]]);
var LIM = { profile: 0, basic: 30, premium: 80, partner: 200, strategic: Infinity };
if (window.MIGPLANS) MIGPLANS.patchLimits(LIM);
var plan = "partner";
function drawPick() { var p = P(); $("#chosen").innerHTML = '<span>📦 الباقة المختارة: <b>' + p[1] + '</b> · <b class="num">' + p[2] + '</b> جنيه سنوياً · ' + p[3] + '</span><a href="#plans">تغيير الباقة ↑</a>'; }
drawPick();
$("#cats").innerHTML = [["steel", "حديد · Steel"], ["wood", "أخشاب · Wood"], ["plastic", "بلاستيك · Plastic"], ["food", "أغذية · Food"], ["paper", "ورق · Paper"], ["chem", "كيماويات · Chemicals"], ["oil", "نفط وغاز · Oil & Gas"], ["textile", "غزل ونسيج · Textiles"], ["build", "مواد بناء · Building Materials"], ["elec", "صناعات هندسية وكهربائية · Engineering"], ["pharma", "أدوية ومستلزمات طبية · Pharma"], ["other", "أخرى · Others"]].map(function (c) { return '<label><input type="checkbox" name="cat" value="' + c[0] + '"> ' + bi(c[1]) + '</label>'; }).join("");
/* Premium = Egypt + 3 GCC states the member picks here (the Control Center's gcc_pick; the server refuses a Premium application without
   exactly that many — 400 gcc_required). #r-gcc (hidden) carries the codes: Janna's fillers set it and the boxes tick themselves. */
function PICK() { return buyOff() ? 0 : window.MIGPLAN && MIGPLAN.gccPickOf ? MIGPLAN.gccPickOf(plan) : 0; }
function gccW(n, en) { return window.MIGPLAN && MIGPLAN.gccCount ? MIGPLAN.gccCount(n, en) : (en ? n + " Gulf states" : n + " دول خليجية"); }
$("#gccG").innerHTML = ((window.MIGPLAN && MIGPLAN.GCC) || [["SA", "السعودية", "Saudi Arabia", "🇸🇦"], ["AE", "الإمارات", "UAE", "🇦🇪"], ["KW", "الكويت", "Kuwait", "🇰🇼"], ["QA", "قطر", "Qatar", "🇶🇦"], ["BH", "البحرين", "Bahrain", "🇧🇭"], ["OM", "عُمان", "Oman", "🇴🇲"]]).map(function (c) { return '<label><input type="checkbox" name="gcc" value="' + c[0] + '"> <span aria-hidden="true">' + c[3] + "</span> " + bi(c[1] + " · " + c[2]) + "</label>"; }).join("");
var GB = window.MIGPLAN && MIGPLAN.gccBind ? MIGPLAN.gccBind($("#gccF"), { pick: function () { return PICK() || 3; }, onChange: function (cs) { $("#r-gcc").value = cs.join(","); } }) : null;
function gccVal() { return GB ? GB.get() : []; }
/* a signed-in member renewing the plan he is on, with his states IN FORCE: they are shown read-only and sent as they are — the platform team
   changes them (DESIGN Q2; review M-1: an empty picker here made a renewal look like it could change them). MIGPLAN.gcc() = the server's answer. */
function lockedG() { var P = window.MIGPLAN, n = PICK(); if (!P || !P.gcc || !n || P.key !== plan) return null; var g = P.gcc(); return g && !g.pending && g.chosen && g.chosen.length === n ? g.chosen : null; }
function drawGcc() {
  var n = PICK(), f = $("#gccF"), ro = $("#gccRO"), lk = lockedG(); f.hidden = !n; if (!n) { f.removeAttribute("aria-invalid"); f.removeAttribute("data-locked"); return; }
  $("#gccL").innerHTML = bi(lk ? "دولك الخليجية في باقتك · Your plan's Gulf states" : "اختار " + gccW(n, false) + " لباقتك المميزة · Choose " + gccW(n, true) + " for your Premium plan") + (lk ? "" : " *");
  if (lk && GB) GB.set(lk);
  if (GB) GB.refresh();
  if (lk) { f.setAttribute("data-locked", "1"); [].forEach.call(document.querySelectorAll("#gccG input"), function (b) { b.disabled = true; }); ro.hidden = false; $("#gccN").textContent = ""; /* no «اخترت 3 من 3 — شيل علامة» here: he cannot change them */
    ro.textContent = EN ? "These are the Gulf states of your current plan — the renewal keeps them. To change them, contact the platform team." : "دي دولك الخليجية في باقتك الحالية — التجديد بيكمّل عليها. لتغيير الدول كلّم فريق المنصة."; }
  else { f.removeAttribute("data-locked"); ro.hidden = true; ro.textContent = ""; }
}
function gccFromField() { if (lockedG()) return; var v = $("#r-gcc").value; if (GB && v !== gccVal().join(",")) GB.set(v); }
window.addEventListener("mig:plan", function () { drawGcc(); });
$("#r-gcc").addEventListener("input", gccFromField); $("#r-gcc").addEventListener("change", gccFromField);
if (window.MIGINQ) { $("#o-cons").innerHTML = MIGINQ.consentHTML("rg", "signup"); MIGINQ.prefill({ email: "#o-mail", name: "#o-name", phone: "#o-mob", company: "#r-name" }); }
/* deploy 2: a signed-in member recognised from the old system gets the EMPTY fields pre-filled (GET /api/me/recognize, e-mail-code sessions only) */
if (window.MIGAPI && MIGAPI.token && MIGAPI.token()) MIGAPI.request("/me/recognize").then(function (j) {
  var c = j && j.known && j.company; if (!c) return;
  var map = { company: "#r-name", manager: "#r-mgr", phone: "#r-tel", address: "#r-addr", web: "#r-web", activity: "#r-act" }, n = 0;
  Object.keys(map).forEach(function (k) { var el = $(map[k]); if (el && !el.value.trim() && c[k]) { el.value = String(c[k]).slice(0, 500); n++; } });
  if (n && $("#form")) { var nt = document.createElement("div"); nt.className = "note2"; nt.setAttribute("role", "status"); nt.textContent = EN ? "We filled in your details from your old account — please review them." : "جبنا بياناتك من حسابك القديم — راجعها."; $("#form").insertAdjacentElement("afterbegin", nt); }
}, function () { /* nothing to pre-fill */ });
$("#today").textContent = "التاريخ: " + new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
function prodHint() { var l = LIM[plan]; if (buyOff()) { $("#prodHint").textContent = ""; return; } $("#prodHint").textContent = l === 0 ? "باقة تسجيل البيانات فقط لا تشمل إدراج منتجات." : l === Infinity ? "منتجات غير محدودة في باقتك." : "يمكنك إدراج حتى " + l + " منتجاً في باقتك."; }
prodHint();
var EMI = {}; $$("#r-emi option").forEach(function (o) { if (!o.value) return; var t = o.textContent.split(" · "); EMI[o.value] = EN && t[1] ? t[1] : t[0]; if (EN && t[1]) o.textContent = t[1]; });
var TITLES = ["اختر باقة التسجيل", "بيانات الشركة · Company Details", "النشاط والمنتجات والقطاعات", "المستندات المطلوبة", "مسؤول التسجيل", "مراجعة الطلب وإرساله", "تم استلام طلب الاشتراك"];
var st = 0;
function P() { for (var i = 0; i < ALL.length; i++) if (ALL[i][0] === plan) return ALL[i]; }
function fee() { return +P()[2].replace(/,/g, ""); }
function go(n) {
  st = n; $$(".stp").forEach(function (s) { s.classList.toggle("on", +s.dataset.s === n); });
  $$("#steps3 li").forEach(function (l) { var k = +l.dataset.s; l.classList.toggle("on", k === n); l.classList.toggle("done", k < n); l.querySelector(".n").textContent = k < n ? "✓" : k; });
  $("#pb3").style.width = (n / 6 * 100) + "%"; $("#stTitle").innerHTML = bi(TITLES[n]); $("#err").textContent = "";
  $("#prev").style.visibility = n > 1 && n < 6 ? "visible" : "hidden";
  $("#next").textContent = n === 5 ? (EN ? "Submit the application" : "إرسال طلب الاشتراك") : "التالي ←";
  $("#nav3").style.display = n === 6 ? "none" : "flex"; $("#chosen").hidden = n === 6;
  if (n === 5 && buyOff()) { $("#sum").innerHTML = '<dt>الشركة</dt><dd>' + esc($("#r-name").value) + '</dd><dt>المحافظة</dt><dd>' + (EMI[$("#r-emi").value] || "—") + '</dd><dt>مسؤول التسجيل</dt><dd>' + esc($("#o-name").value) + ' · <span dir="ltr">' + esc($("#o-mail").value) + '</span></dd>'; }
  else if (n === 5) { var f = fee(), v = Math.round(f * (window.MIGPLANS ? MIGPLANS.vatRate() : .14)); $("#sum").innerHTML = '<dt>الباقة</dt><dd>' + P()[1] + '</dd>' + (PICK() && window.MIGPLAN ? '<dt>' + (EN ? "Gulf states" : "دول الخليج") + '</dt><dd>' + esc(MIGPLAN.gccNames(gccVal())) + '</dd>' : '') + '<dt>الشركة</dt><dd>' + esc($("#r-name").value) + '</dd><dt>المحافظة</dt><dd>' + (EMI[$("#r-emi").value] || "—") + '</dd><dt>مدة التسجيل</dt><dd>سنة واحدة</dd><dt>رسوم التسجيل</dt><dd>' + egp(f) + '</dd><dt>ضريبة القيمة المضافة ' + (window.MIGPLANS ? MIGPLANS.vatLabel() : "14%") + '</dt><dd>' + egp(v) + '</dd><dt><b>الإجمالي</b></dt><dd style="font-size:1.15rem;color:var(--green)">' + egp((f + v)) + '</dd><dt>مسؤول التسجيل</dt><dd>' + esc($("#o-name").value) + ' · <span dir="ltr">' + esc($("#o-mail").value) + '</span></dd>'; }
  $("#form").scrollIntoView({ behavior: "smooth", block: "start" });
}
function egp(x) { x = x.toLocaleString("en-US"); return EN ? "EGP " + x : x + " جنيه"; }
function esc(s) { return String(s).replace(/[<>&"]/g, ""); }
function lbl(i) { var l = i.closest("label"); if (!l) return ""; var b = l.querySelector(".lb"); return (b ? (EN ? b.lastChild.textContent : b.textContent) : l.childNodes[0].textContent).replace("*", "").trim(); }
function valid(n) {
  var bad = [];
  $$('.stp[data-s="' + n + '"] [required]').forEach(function (i) { if (!i.value.trim() || !i.checkValidity()) bad.push(lbl(i)); });
  if (n === 1 && $("#r-vat").value && !/^\d{9}$/.test($("#r-vat").value.replace(/[\s-]/g, ""))) bad.push("رقم التسجيل الضريبي يجب أن يكون 9 أرقام");
  if (n === 1 && PICK() && gccVal().length !== PICK()) { bad.push(EN ? "Choose exactly " + gccW(PICK(), true) : "اختار " + gccW(PICK(), false) + " بالظبط"); if (GB) GB.bad(); }
  if (n === 2) { if (!$$('input[name="cat"]:checked').length) bad.push("اختر قطاعاً واحداً على الأقل"); var cnt = $("#r-prod").value.split("\n").filter(function (x) { return x.trim(); }).length; if (!buyOff() && LIM[plan] !== Infinity && cnt > LIM[plan] && LIM[plan] > 0) bad.push(EN ? "Number of products (" + cnt + ") exceeds your plan limit (" + LIM[plan] + ")" : "عدد المنتجات (" + cnt + ") أكبر من حد باقتك (" + LIM[plan] + ")"); }
  if (n === 4) { if (!$("#o-terms").checked) bad.push("الإقرار والموافقة على الشروط"); if (window.MIGINQ && $("#o-mail").value.trim() && !MIGINQ.EMRE.test($("#o-mail").value.trim())) bad.push("الإيميل"); }
  if (n === 1 && window.MIGINQ && $("#r-mail").value.trim() && !MIGINQ.EMRE.test($("#r-mail").value.trim())) bad.push("البريد الإلكتروني");
  $("#err").textContent = bad.length ? (EN ? "Please complete: " + bad.map(function (x) { return window.MIGTR ? MIGTR(x) : x; }).join(", ") : "أكمل: " + bad.join("، ")) : "";
  return !bad.length;
}
/* the application is a real inquiry (kind=signup): the server answers with a ref; nothing is "paid" or "activated" here.
   Payment happens later on the payment provider's hosted page (N-Genius); its link is e-mailed automatically once it is live. */
function finish() {
  var b = $("#next"), I = window.MIGINQ, cats = $$('input[name="cat"]:checked').map(function (i) { return i.value; }), f = fee();
  if (!I) { $("#err").textContent = EN ? "The sending service did not load, so nothing was sent. Please reload the page." : "خدمة الإرسال ماتحمّلتش، فمفيش حاجة اتبعتت. حدّث الصفحة."; return; }
  var box = document.createElement("div"); $("#err").textContent = "";
  var nob = buyOff(), pk = nob ? "" : plan, pn = nob ? "" : P()[1];   /* buying off in this app: no plan — the team settles it */
  if (nob) f = 0;
  var pl = { plan: pk, plan_name: pn, fee_egp: f, company: $("#r-name").value.trim(), manager: $("#r-mgr").value.trim(), tel: $("#r-tel").value.trim(), governorate: $("#r-emi").value, address: $("#r-addr").value.trim(),
    cr_no: $("#r-cr").value.trim(), licence_no: ($("#r-lic") || { value: "" }).value.trim(), tax_no: $("#r-vat").value.trim(), website: ($("#r-web") || { value: "" }).value.trim(), company_email: $("#r-mail").value.trim(),
    activity: $("#r-act").value.trim(), products: $("#r-prod").value.trim().slice(0, 1000), sector: cats.join(","), terms: true, gcc: PICK() ? gccVal() : undefined };
  b.disabled = true;
  I.send({ kind: "signup", target_type: "plan", target_id: pk, target_name: pn, name: $("#o-name").value.trim(), company: $("#r-name").value.trim(), email: $("#o-mail").value.trim() || $("#r-mail").value.trim(), phone: $("#o-mob").value.trim(),
    consent_wa: I.waChecked("rg"), message: $("#r-act").value.trim(), payload: pl }, { box: box, btn: b, hideForm: false }).then(function (j) {
    $("#doneStep").innerHTML = '<div class="done-box"><span class="ic">✓</span><h2>' + (EN ? "Your application was received" : "استلمنا طلب اشتراك ") + (EN ? "" : esc($("#r-name").value)) + '</h2></div>' + box.innerHTML
      + '<div class="card2"><h3 style="font-size:1rem;font-weight:800">' + (EN ? "What happens now (automatically)" : "اللي بيحصل دلوقتي (تلقائياً)") + '</h3><ol style="margin:0;padding-inline-start:20px;line-height:2">'
      + "<li>" + (EN ? "Sign in with a one-time code sent to your e-mail (no password) and complete your company profile." : "ادخل بكود لمرة واحدة بيوصلك على الإيميل (من غير باسورد) وكمّل ملف شركتك.") + "</li>"
      + (nob ? "" : "<li>" + (window.MIGPAYREADY ? (EN ? "The secure payment link reaches the company e-mail within minutes (the invoice e-mail); we never ask for card details on our pages." : "هيوصلك رابط الدفع الآمن على بريد الشركة خلال دقايق (إيميل الفاتورة)؛ ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.") : (EN ? "Once secure online payment is live, its link is e-mailed to you automatically; we never ask for card details on our pages." : "أول ما الدفع الإلكتروني الآمن يشتغل، رابطه بيوصلك تلقائياً على الإيميل؛ ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.")) + "</li>")
      + (nob ? "" : "<li>" + (EN ? "Your plan is activated automatically after payment, and the e-invoice reaches the same e-mail." : "الباقة بتتفعّل تلقائياً بعد الدفع، والفاتورة الإلكترونية بتوصلك على نفس الإيميل.") + "</li>") + "</ol>"
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (window.MIGAPI ? '<button class="btn btn-green" type="button" id="regIn">🔑 ' + (EN ? "Sign in with an e-mail code" : "ادخل بكود على الإيميل") + "</button>" : "") + '<button class="btn btn-line" type="button" data-mgq-meet>📅 ' + (EN ? "Book a meeting with Janna" : "احجز اجتماع مع جنة") + '</button><a class="btn btn-line" href="home.html">' + (EN ? "Home" : "الرئيسية") + "</a></div></div>";
    go(6);
    var ri = $("#regIn"); if (ri) ri.onclick = function () { MIGAPI.open({ email: $("#o-mail").value.trim() || $("#r-mail").value.trim() }).then(function () { location.href = "dashboard.html"; }, function () {}); };
  }, function (e) {
    b.disabled = false;
    if (e && e.code === "gcc_required" && PICK()) { go(1); $("#err").textContent = EN ? "The application was not sent: choose exactly " + gccW(PICK(), true) + "." : "الطلب ماتبعتش: اختار " + gccW(PICK(), false) + " بالظبط."; if (GB) GB.bad(); return; }
    $("#err").innerHTML = box.innerHTML;
  });
}
$("#next").onclick = function () {
  if (!valid(st)) return;
  if (st < 5) { go(st + 1); return; }
  finish();
};
$("#prev").onclick = function () { if (st > 1) go(st - 1); };
document.addEventListener("click", function (e) { var b = e.target.closest("[data-plan]"); if (!b) return; plan = b.dataset.plan; drawPick(); drawGcc(); prodHint(); go(1); });
var h = (location.hash || "").slice(1);
if (LIM.hasOwnProperty(h)) { plan = h; drawPick(); prodHint(); setTimeout(function () { $("#form").scrollIntoView({ block: "start" }); }, 200); }
else if (h === "form") setTimeout(function () { $("#form").scrollIntoView({ block: "start" }); }, 200);
drawGcc(); go(1); window.scrollTo(0, 0); if (h) setTimeout(function () { var t = document.getElementById(h === "plans" ? "plans" : "form"); if (t) t.scrollIntoView({ block: "start" }); }, 250);
''')
HEROS['register'] = ('hero-poster.jpg', 'التسجيل', 'سجّل منشأتك في منصة صنع في مصر', 'اختر باقتك واملأ استمارة التسجيل وابعت طلبك؛ بتدخل بكود على الإيميل، ورابط الدفع الإلكتروني الآمن بيوصلك تلقائياً، والباقة بتتفعّل بعد الدفع.', '<a class="btn btn-gold" href="#form">ابدأ التسجيل</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="#plans">الباقات</a>')

en_add([
 ("للمصانع الصغيرة والمتوسطة اللي عايزة تبيع وتستقبل طلبات في السوق المصري", "For small and medium factories that want to sell and receive requests in the Egyptian market"), ("مصر", "Egypt"),
 ("المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع والفرص وبيانات الموردين والمقاولين في مصر", "Tenders, RFQs, winning companies, project news & opportunities, and supplier & contractor data in Egypt"),
 ("الرد على المناقصات وطلبات الأسعار من المنصة", "Respond to tenders and RFQs from the platform"), ("استقبال طلبات المشترين المطابقة لنشاطك تلقائياً بالإيميل والواتساب", "Receive matching buyer requests automatically by e-mail and WhatsApp"),
 ("إحصائيات حقيقية لملفك (مشاهدات ونقرات وطلبات)", "Real statistics for your profile (views, clicks, requests)"), ("تنبيهات وملخصات بالجديد في قطاعك", "Alerts and digests of what's new in your sector"),
 ("فرص أسواق الخليج والدول العربية", "Gulf & Arab market opportunities"), ("فرص أفريقيا وآسيا وأوروبا", "Africa, Asia & Europe opportunities"), ("المستشار الذكي للصفقات «باسم»", "The AI deal advisor «Bassem»"),
 ("وجود رسمي للمنشأة على المنصة وطلبات مشترين بتوصلك تلقائياً.", "An official presence on the platform, with buyer requests reaching you automatically."),
 ("للمصانع اللي عايزة حضور أقوى في مصر والخليج والدول العربية", "For factories that want a stronger presence in Egypt, the Gulf and Arab markets"), ("الخليج والدول العربية", "Gulf & Arab markets"),
 ("كل الفرص والبيانات في أسواق الخليج والدول العربية كمان", "All opportunities and data in the Gulf & Arab markets too"), ("أولوية في توزيع طلبات المشترين التلقائي", "Priority in the automatic routing of buyer requests"),
 ("أولوية في ترتيب نتائج البحث والقوائم", "Priority in search results and listings"), ("بانر إعلاني يظهر بالتناوب", "A rotating advertising banner"), ("فرص أفريقيا وآسيا وأوروبا", "Africa, Asia & Europe opportunities"),
 ("أولوية في الطلبات والظهور محلياً وخليجياً.", "Priority in requests and visibility locally and in the Gulf."), ("كل الفرص والبيانات في السوق الأفريقي كمان", "All opportunities and data in the African market too"),
 ("مستشارك الذكي للصفقات «باسم» طول السنة: فرص يومية، متابعة الصفقات، وصياغة الإيميلات", "Your AI deal advisor «Bassem» all year: daily opportunities, deal follow-up and e-mail drafting"),
 ("شهادة «شريك أساسي» وشعار الشركة على المنصة", "A «Core Partner» certificate and your logo on the platform"), ("فرص آسيا وأوروبا ودول العالم", "Asia, Europe & worldwide opportunities"),
 ("صفة المورد المفضل محلياً وإقليمياً مع مستشار صفقات شخصي.", "Preferred-supplier status locally and regionally, with a personal deal advisor."), ("آسيا وأوروبا وكل الأسواق", "Asia, Europe & all markets"),
 ("كل الفرص والبيانات في كل الأسواق: آسيا وأوروبا ودول العالم", "All opportunities and data in every market: Asia, Europe and worldwide"), ("مستشارك الذكي للصفقات «باسم» في كل الأسواق", "Your AI deal advisor «Bassem» in every market"),
 ("أعلى مستويات الظهور والثقة المؤسسية، وكل الأسواق.", "The highest visibility and institutional trust, in every market."),
 ("مدة التسجيل عام واحد من تاريخ التفعيل. «تسجيل بيانات الشركة فقط» بيعمل لشركتك بروفايل في الدليل وفي نتائج البحث بس. من الباقة الأساسية وطالع بتشوف المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع: في مصر للأساسية، ومعاها 3 دول خليجية تختارها وأخبار المشتريات للمميزة، وكل دول الخليج وأفريقيا والمستشار «باسم» للشريك الأساسي، وكل أسواق العالم و«باسم» وكل الخدمات الاستشارية للشريك الاستراتيجي. دليل الموردين والمقاولين والشركات مفتوح للكل.", "Registration lasts one year from activation. «Company data only» gives your company a profile in the directory and in search results only. From the Basic plan up you see tenders, RFQs, winning companies and project news: in Egypt with Basic; plus 3 Gulf states of your choice and procurement news with Premium; plus all Gulf states, Africa and the advisor «Bassem» with Core Partner; and all world markets, «Bassem» and all consulting services with Strategic Partner. The supplier, contractor and company directories are open to everyone."),
 ("بروفايل للشركة بس: ظهور الشركة في الدليل وفي نتائج البحث (الاسم والشعار ونبذة تعريفية وبيانات التواصل الرسمية). الباقة دي مابتفتحش المناقصات ولا طلبات الأسعار ولا الترسيات ولا أخبار المشاريع ولا أي فرص، ومن غير منتجات ولا استقبال طلبات — للفرص: الباقة الأساسية فأعلى.", "Profile only: your company in the directory and in search results (name, logo, a short profile and official contacts). This plan does not open tenders, RFQs, awards, project news or any opportunities, and has no products or incoming requests — for opportunities: Basic plan and up."),
 ("مسؤول التسجيل", "Registration officer"), ("مراجعة وإرسال", "Review & submit"), ("استلام الطلب", "Received"), ("(عليه بيوصلك إيصال الطلب وكود الدخول ورابط الدفع)", "(the receipt, sign-in code and payment link are sent here)"),
 ("المستندات المطلوبة لتوثيق المنشأة", "Documents needed to verify your company"), ("السجل التجاري", "Commercial register"), ("البطاقة الضريبية وشهادة التسجيل في ضريبة القيمة المضافة", "Tax card and VAT registration certificate"),
 ("الرخصة الصناعية / سجل المصانع لدى هيئة التنمية الصناعية (إن وجد)", "Industrial licence / IDA factory register (if any)"), ("شعار الشركة، والملف التعريفي (اختياري)", "Company logo and company profile (optional)"),
 ("مش مطلوب ترفعها دلوقتي: رفع المستندات بيتفتح من حسابك على المنصة بعد تسجيل الطلب، وشارة «موثّق» بتظهر بعد مراجعتها.", "You don't need to upload them now: document upload opens in your platform account after the application, and the «Verified» badge appears after they are checked."),
 ("الدفع الإلكتروني بيتم في صفحة بوابة الدفع الآمنة نفسها (البطاقات البنكية والمحافظ الإلكترونية)، ومنصتنا", "Online payment happens on the secure payment gateway's own page (bank cards and e-wallets); our platform"),
 ("مش بتطلب ولا بتحفظ بيانات أي كارت", "never asks for or stores any card details"),
 ("بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع، والفاتورة الإلكترونية (شاملة ضريبة القيمة المضافة {n}) بتوصلك على نفس البريد.", "The payment gateway is still being set up — once live, the secure payment link is e-mailed to your company automatically, the account is activated automatically after payment, and the e-invoice (including {n} VAT) reaches the same e-mail."),
 ("مراجعة الطلب وإرساله", "Review and submit the application"), ("تم استلام طلب الاشتراك", "Application received"),
 ("اختر باقتك واملأ استمارة التسجيل وابعت طلبك؛ بتدخل بكود على الإيميل، ورابط الدفع الإلكتروني الآمن بيوصلك تلقائياً، والباقة بتتفعّل بعد الدفع.", "Choose your plan, fill in the registration form and submit; you sign in with an e-mail code, the secure payment link reaches you automatically, and the plan is activated after payment."),
])

# English for the plan matrix of 2026-11-18 (DESIGN Appendix A.1-A.3: cards, picker, summary)
en_add([("للمصانع الصغيرة اللي عايزة تبيع وتستقبل طلبات في السوق المصري", "For small factories that want to sell and receive requests in the Egyptian market"),
 ("المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في مصر", "Tenders, RFQs, winning companies and project news in Egypt"),
 ("أخبار المشتريات و3 دول خليجية تختارها — في الباقة المميزة", "Procurement news and 3 Gulf states of your choice — in the Premium plan"),
 ("أخبار المشتريات ودولتين خليجيتين تختارها — في الباقة المميزة", "Procurement news and two Gulf states of your choice — in the Premium plan"),
 ("كل دول الخليج وأفريقيا والمستشار «باسم» — في باقة الشريك الأساسي", "All Gulf states, Africa and the advisor «Bassem» — in the Core Partner plan"),
 ("آسيا وأوروبا وكل أسواق العالم — في باقة الشريك الاستراتيجي", "Asia, Europe and all world markets — in the Strategic Partner plan"),
 ("للمصانع المتوسطة اللي عايزة حضور أقوى في مصر و3 دول خليجية تختارها", "For medium factories that want a stronger presence in Egypt and 3 Gulf states of their choice"),
 ("3 دول خليجية تختارها", "3 Gulf states of your choice"), ("دولتين خليجيتين تختارها", "two Gulf states of your choice"), ("دولتين خليجيتين تختارهم", "two Gulf states of your choice"), ("دولة خليجية واحدة تختارها", "one Gulf state of your choice"),
 ("كل دول الخليج الست", "all 6 Gulf states"),
 ("المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في 3 دول خليجية تختارها وقت التسجيل (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)", "Tenders, RFQs, winning companies and project news in 3 Gulf states you choose at registration (from Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman)"),
 ("أخبار المشتريات", "Procurement news"),
 ("باقي دول الخليج وأفريقيا والمستشار «باسم» — في باقة الشريك الأساسي", "The other Gulf states, Africa and the advisor «Bassem» — in the Core Partner plan"),
 ("أولوية في الطلبات والظهور في مصر والدول الخليجية اللي اخترتها.", "Priority in requests and visibility in Egypt and the Gulf states you chose."),
 ("أولوية في الطلبات والظهور في مصر والدول الخليجية اللي اخترتها", "Priority in requests and visibility in Egypt and the Gulf states you chose"),
 ("كل دول الخليج", "All Gulf states"), ("المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في كل دول الخليج الست وأفريقيا", "Tenders, RFQs, winning companies and project news in all 6 Gulf states and Africa"),
 ("كل الخدمات الاستشارية من فريق المنصة", "All consulting services from the platform team"),
 ("الفرص والمناقصات وطلبات الأسعار في الدول دي بتبقى ضمن باقتك. كل دول الخليج الست متاحة في باقة الشريك الأساسي.", "Opportunities, tenders and RFQs in these states are included in your plan. All 6 Gulf states are included in the Core Partner plan."),
 ("دول الخليج", "Gulf states")])

# English for the gated-page notice on register.html (the titles come from site.py GATES / MIGPLAN.gate and opportunity.html)
en_add([("تفاصيل الترسيات والشركات الفائزة", "award details and winning companies"), ("ملف الشركة الفائزة وترسياتها", "the winning company's profile and awards"),
 ("تفاصيل المشروع وحزم المواد", "project details and material packages"), ("تقرير رادار الفرص القطاعي", "the sector opportunity radar report"),
 ("المستشار الذكي للصفقات", "the AI Deal Advisor"), ("تفاصيل الفرصة", "opportunity details"), ("🔒 لعرض", "🔒 To view"),
 ("سجّل منشأتك واختر الباقة المناسبة. القوائم متاحة للتصفح، والتفاصيل والتقديم للمشتركين.", "register your company and choose a plan. Lists are open to browse; details and submitting are for subscribers.")])
# English for the plan cards (text nodes are matched without their leading 💡 and trailing period) and the payment note's last sentence
en_add([("حتى 30 منتجاً في السوق الإلكتروني", "Up to 30 products in the e-marketplace"), ("حتى 80 منتجاً", "Up to 80 products"),
 ("وجود رسمي للمنشأة على المنصة وطلبات مشترين بتوصلك تلقائياً", "An official presence on the platform, with buyer requests reaching you automatically"),
 ("أولوية في الطلبات والظهور محلياً وخليجياً", "Priority in requests and visibility in Egypt and the Gulf"),
 ("صفة المورد المفضل محلياً وإقليمياً مع مستشار صفقات شخصي", "Preferred-supplier status locally and regionally, with a personal deal advisor"),
 ("أعلى مستويات الظهور والثقة المؤسسية، وكل الأسواق", "The highest visibility and institutional trust, in every market"),
 ("بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع، والفاتورة الإلكترونية (شاملة ضريبة القيمة المضافة 14%) بتوصلك على نفس البريد", "The payment gateway is still being set up — once live, the secure payment link is e-mailed to your company automatically, the account is activated automatically after payment, and the e-invoice (including 14% VAT) reaches the same e-mail"),
 ("هيوصلك رابط الدفع الآمن على بريد الشركة خلال دقايق (إيميل الفاتورة)؛ ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.", "The secure payment link reaches the company e-mail within minutes (the invoice e-mail); we never ask for card details on our pages."),
 ("جبنا بياناتك من حسابك القديم — راجعها.", "We filled in your details from your old account — please review them.")])
