# -*- coding: utf-8 -*-
PAGES['export-market'] = ('أسواق التصدير – صنع في مصر', 'home', COMMON_CSS + '''
.mtabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.mtabs a { flex: none; display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 8px 14px; font-weight: 700; font-size: .9rem; color: var(--fg); transition: all .2s ease; }
.mtabs a.on { background: var(--green); border-color: var(--green); color: #fff; transform: translateY(-2px); }
.mk4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.mk4 div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; border-inline-start: 4px solid var(--gold); }
.mk4 b { display: block; font-size: 1.5rem; font-weight: 800; color: var(--green); }
.mk4 span { font-size: .82rem; color: var(--muted); }
.mapbox { position: relative; height: 480px; border-radius: 20px; overflow: hidden; border: 1px solid var(--line); background: #04182A; }
.mapbox canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.two2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.two2 > * { min-width: 0; }
.cty { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.cty span { display: flex; align-items: center; gap: 8px; background: var(--sunken); border-radius: 10px; padding: 8px 10px; font-weight: 700; font-size: .88rem; }
.hb2 { display: grid; grid-template-columns: 130px 1fr 40px; gap: 10px; align-items: center; font-size: .88rem; }
.hb2 .t { height: 14px; background: var(--sunken); border-radius: 99px; overflow: hidden; }
.hb2 .t i { display: block; height: 100%; width: 0; background: linear-gradient(270deg, var(--gold), var(--green)); border-radius: 99px; transition: width 1.2s cubic-bezier(.2,.8,.2,1); }
.op2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; color: var(--fg); transition: border-color .2s ease, transform .2s ease; }
.op2:hover { border-color: var(--gold); transform: translateX(-4px); }
.req li { margin-bottom: 6px; }
@media (max-width: 900px) { .mk4 { grid-template-columns: 1fr 1fr; } .two2 { grid-template-columns: 1fr; } .mapbox { height: 340px; } }
''', '''
<div id="mhero"></div>
<main class="wrap pbody2" id="top">
  <nav class="mtabs" id="mtabs" aria-label="الأسواق"></nav>
  <div class="mk4" id="mk4"></div>
  <div class="mapbox"><canvas id="mcv" aria-label="خريطة مسارات التصدير إلى السوق"></canvas></div>
  <div class="two2">
    <div class="card2"><h2>🌍 الدول والمدن المستهدفة</h2><div class="cty" id="cty"></div><h2 style="margin-top:6px">📊 القطاعات الأكثر طلباً</h2><div id="secs" style="display:flex;flex-direction:column;gap:8px"></div></div>
    <div class="card2"><h2>📨 فرص مفتوحة في هذا السوق</h2><div id="ops" style="display:flex;flex-direction:column;gap:8px"></div><a class="btn btn-line" href="opportunity.html">كل الفرص المفتوحة</a></div>
  </div>
  <div class="two2">
    <div class="card2"><h2>✅ متطلبات دخول السوق</h2><ul class="req" id="req" style="margin:0;padding-inline-start:20px"></ul></div>
    <div class="card2"><h2>🚢 الشحن والتأمين والتمويل</h2><p class="muted" id="ship"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-green" href="deal.html#shipping">شركات الشحن</a><a class="btn btn-line" href="deal.html#shipping">التأمين</a><a class="btn btn-line" href="deal.html#finance">التمويل</a></div></div>
  </div>
  <div class="card2" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><h2 id="ctaT"></h2><p class="muted">سجّل مصنعك واختر هذا السوق ضمن باقتك لتصلك فرصه أولاً بأول.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-gold" id="ctaB" href="register.html">سجّل الآن</a><a class="btn btn-line" href="market.html">منتجات تُشحن لهذا السوق</a></div></div>
  <span class="note2">الأعداد والقطاعات محسوبة من الفرص المفتوحة المنشورة من مصادرها الرسمية؛ فرص الأسواق خارج مصر بتظهر حسب النطاق الجغرافي لباقتك.</span>
</main>
''', OPPS_JS + '''
/* row: [index, name, cover, description, (unused, 0), transit, scope, cities, sectors (computed), requirements, shipping, opportunity market code] */
var M = {
 local: [0, "السوق المحلي", "m0", "جمهورية مصر العربية: السوق الأول للمنتج المصري في محافظات مصر الـ27، يدعمه تفضيل المنتج المصري في التعاقدات الحكومية (القانون رقم 5 لسنة 2015) وتوجّه الدولة لتعميق التصنيع المحلي ضمن الاستراتيجية الوطنية للصناعة ورؤية مصر 2030.", 0, "1–3 أيام برّاً", "27 محافظة", [["🇪🇬", "القاهرة"], ["🇪🇬", "الجيزة"], ["🇪🇬", "الإسكندرية"], ["🇪🇬", "العاشر من رمضان"], ["🇪🇬", "السادس من أكتوبر"], ["🇪🇬", "أسيوط"]], [["مواد البناء", 92], ["الصناعات الغذائية", 81], ["البلاستيك والتغليف", 64], ["الحديد والصلب", 52], ["الكهربائية والكابلات", 41]], ["سجل تجاري وبطاقة ضريبية، وسجل صناعي أو رخصة تشغيل من هيئة التنمية الصناعية وفق القانون رقم 15 لسنة 2017", "التسجيل في منظومة الفاتورة الإلكترونية لدى مصلحة الضرائب المصرية", "مطابقة المواصفات القياسية المصرية الصادرة عن الهيئة المصرية العامة للمواصفات والجودة (EOS) حيث تكون إلزامية", "للتعاقدات الحكومية: التسجيل على بوابة التعاقدات العامة (etenders.gov.eg) وفق القانون رقم 182 لسنة 2018، مع الاستفادة من تفضيل المنتج المصري ونسبة المكوّن المحلي وفق القانون رقم 5 لسنة 2015"], "نقل بري عبر شبكة الطرق القومية بين المدن الصناعية ومحافظات مصر الـ27 خلال يوم إلى 3 أيام لأغلب المدن، مع إمكانية نقل البضائع بالقطارات عبر الهيئة القومية لسكك حديد مصر.", "المحلي"],
 gulf: [1, "السوق الخليجي والعربي", "m1", "دول مجلس التعاون الخليجي الست والأردن والعراق ودول المغرب العربي: أسواق عربية تعفي المنتج المصري المستوفي لقواعد المنشأ من الرسوم الجمركية في إطار منطقة التجارة الحرة العربية الكبرى، ومعها اتفاقية أغادير التي تجمع مصر والأردن والمغرب وتونس.", 0, "3–7 أيام بحراً عبر البحر الأحمر", "الخليج والدول العربية", [["🇸🇦", "الرياض"], ["🇸🇦", "جدة"], ["🇰🇼", "الكويت"], ["🇶🇦", "الدوحة"], ["🇴🇲", "مسقط"], ["🇯🇴", "عمّان"]], [["الصناعات الغذائية", 88], ["مواد البناء", 70], ["الملابس والمنسوجات", 52], ["الأدوية", 41], ["الأجهزة المنزلية", 33]], ["شهادة منشأ عربية تفضيلية لاستيفاء قواعد المنشأ في منطقة التجارة الحرة العربية الكبرى (أو اتفاقية أغادير)", "القيد في سجل المصدّرين لدى الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)", "مطابقة المواصفات الخليجية (GSO) واشتراطات بلد الوصول، وتسجيل المنتجات الغذائية والدوائية لدى الجهة الرقابية المختصة هناك", "بطاقة بيانات باللغة العربية، ووكيل أو موزع محلي في بعض الفئات"], "شحن بحري من موانئ العين السخنة وسفاجا عبر البحر الأحمر إلى موانئ الخليج والبحر الأحمر خلال 3–7 أيام، وخط نويبع – العقبة إلى الأردن، وشحن بري إلى ليبيا عبر منفذ السلوم.", "الخليجي"],
 africa: [2, "السوق الأفريقي", "m2", "السودان وليبيا وكينيا وتنزانيا وجيبوتي ودول شرق القارة وجنوبها: مصر عضو في السوق المشتركة لشرق وجنوب أفريقيا (الكوميسا) وفي منطقة التجارة الحرة القارية الأفريقية (AfCFTA) التي بدأ التبادل التجاري في إطارها في يناير 2021، ويقع المقر الرئيسي للبنك الأفريقي للتصدير والاستيراد في القاهرة.", 0, "5–20 يوماً برّاً وبحراً", "+10 دول", [["🇸🇩", "بورتسودان"], ["🇱🇾", "طرابلس"], ["🇩🇯", "جيبوتي"], ["🇰🇪", "مومباسا"], ["🇹🇿", "دار السلام"]], [["مواد البناء", 74], ["الأدوية", 61], ["الصناعات الغذائية", 58], ["الحديد والصلب", 36], ["الكابلات والأجهزة الكهربائية", 29]], ["شهادة منشأ الكوميسا (أو شهادة منشأ وفق قواعد منطقة التجارة الحرة القارية) للاستفادة من التخفيضات الجمركية", "شهادة مطابقة ما قبل الشحن لبعض الدول وفق اشتراطات بلد الوصول", "خطاب اعتماد أو تأمين ائتمان المشتري (مثل الشركة المصرية لضمان الصادرات)", "تسجيل المنتج لدى الجهة المختصة في بلد الوصول"], "شحن بري إلى السودان عبر منفذي أرقين وقسطل وإلى ليبيا عبر منفذ السلوم، وشحن بحري من ميناءي العين السخنة والإسكندرية إلى موانئ البحر الأحمر وشرق أفريقيا وشمالها خلال 5–20 يوماً.", "الأفريقي"],
 asia: [3, "السوق الآسيوي", "m3", "الصين والهند وتركيا ودول جنوب شرق آسيا: وجهة رئيسية للأسمدة والبتروكيماويات والموالح والحاصلات الزراعية المصنعة المصرية، وتربط مصر بتركيا اتفاقية تجارة حرة.", 0, "15–25 يوماً بحراً", "+8 دول", [["🇨🇳", "شنغهاي"], ["🇮🇳", "مومباي"], ["🇹🇷", "مرسين"], ["🇻🇳", "هو تشي منه"], ["🇲🇾", "كوالالمبور"]], [["الأسمدة", 95], ["البتروكيماويات", 66], ["الموالح والأغذية", 52], ["الغزول والمنسوجات", 40], ["الزجاج", 18]], ["شهادة تحليل (COA) وصحيفة بيانات سلامة (SDS) للكيماويات والأسمدة", "شهادة منشأ (وشهادة منشأ تفضيلية حيث تنطبق اتفاقية التجارة الحرة مع تركيا)", "الشهادات الصحية وشهادات الصحة النباتية للحاصلات الزراعية والأغذية", "مطابقة اشتراطات الاستيراد في بلد الوصول وشروط شحن واضحة (Incoterms)"], "شحن بحري من موانئ العين السخنة وشرق بورسعيد ودمياط عبر قناة السويس والبحر الأحمر إلى موانئ آسيا خلال 15–25 يوماً، ومن الإسكندرية ودمياط إلى موانئ تركيا عبر المتوسط.", "الآسيوي"],
 europe: [4, "السوق الأوروبي", "m4", "إيطاليا وإسبانيا وهولندا وألمانيا واليونان: تدخل المنتجات الصناعية المصرية أسواق الاتحاد الأوروبي معفاة من الرسوم الجمركية وفق اتفاقية المشاركة المصرية الأوروبية السارية منذ 2004، إلى جانب اتفاقيات تجارة مع دول الإفتا (EFTA) وبريطانيا.", 0, "4–12 يوماً بحراً عبر المتوسط", "+12 دولة", [["🇳🇱", "روتردام"], ["🇮🇹", "جنوة"], ["🇪🇸", "برشلونة"], ["🇬🇷", "بيرايوس"], ["🇩🇪", "هامبورغ"]], [["الملابس والمنسوجات", 80], ["الحاصلات الزراعية والأغذية المصنعة", 57], ["الأسمدة", 49], ["الكيماويات", 30], ["السيراميك ومواد البناء", 21]], ["شهادة الحركة EUR.1 أو إقرار المنشأ وفق قواعد المنشأ في اتفاقية المشاركة", "علامة المطابقة الأوروبية (CE) حيث تنطبق، وتسجيل REACH للمواد الكيميائية", "اشتراطات سلامة الغذاء والحدود القصوى لمتبقيات المبيدات للمنتجات الغذائية والزراعية", "إمكانية التتبع والتوثيق الكامل للشحنة"], "شحن بحري من موانئ الإسكندرية والدخيلة ودمياط وشرق بورسعيد عبر البحر المتوسط إلى موانئ جنوب أوروبا وشمالها خلال 4–12 يوماً.", "الأوروبي"],
 us: [5, "السوق الأمريكي", "e3", "الولايات المتحدة الأمريكية: تدخل منتجات المصانع الواقعة في المناطق الصناعية المؤهلة (QIZ) السوق الأمريكية معفاة من الرسوم الجمركية وفق بروتوكول الكويز الموقّع في ديسمبر 2004، بشرط استيفاء نسبة المكوّن المحددة في البروتوكول، وأبرز صادراتها الملابس الجاهزة والمنسوجات.", 0, "20–30 يوماً بحراً", "الولايات المتحدة", [["🇺🇸", "نيويورك / نيوجيرسي"], ["🇺🇸", "سافانا"], ["🇺🇸", "تشارلستون"], ["🇺🇸", "هيوستن"], ["🇺🇸", "لوس أنجلوس"]], [["الملابس الجاهزة", 92], ["المنسوجات المنزلية", 60], ["الصناعات الغذائية", 35], ["السيراميك ومواد البناء", 22], ["الأثاث", 15]], ["أن يكون المصنع داخل نطاق المناطق الصناعية المؤهلة (QIZ) ومسجّلاً لدى وحدة الكويز المصرية", "استيفاء نسبة المكوّن المحددة في بروتوكول الكويز وتوثيقها لكل شحنة", "الالتزام باشتراطات الجمارك الأمريكية ووضع بلد المنشأ على المنتج", "تسجيل منشآت الأغذية لدى هيئة الغذاء والدواء الأمريكية (FDA) للمنتجات الغذائية"], "شحن بحري من موانئ الإسكندرية ودمياط وشرق بورسعيد عبر البحر المتوسط والمحيط الأطلسي إلى موانئ الساحل الشرقي الأمريكي خلال 20–30 يوماً تقريباً.", "الأمريكي"]
};
var KEYS = ["local", "gulf", "africa", "asia", "europe", "us"];
function show() {
  var k = (location.hash || "").slice(1);
  if (!M[k]) { if (k && show.cur) { var t = document.getElementById(k); if (t) t.scrollIntoView({ behavior: "smooth" }); return; } k = "gulf"; }
  show.cur = k;
  var m = M[k];
  $("#mhero").innerHTML = HERO(m[2] + ".jpg", '<a href="home.html#export-map">خريطة التصدير</a> › ' + m[1], m[1], m[3], '<a class="btn btn-gold" href="register.html#' + ({ local: "basic", gulf: "premium", africa: "partner" }[k] || "strategic") + '">ادخل هذا السوق</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="#ops" onclick="event.preventDefault();document.getElementById(&quot;ops&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">الفرص المفتوحة</a>');
  $("#mtabs").innerHTML = KEYS.map(function (x) { return '<a href="#' + x + '"' + (x === k ? ' class="on"' : '') + '>' + M[x][1] + '</a>'; }).join("");
  /* every number is counted from the published open opportunities of this market (no typed-in demand figures) */
  var ops = OPPS.filter(function (o) { return o[5] === m[11] && o[7] >= 0; }), sc = {}; ops.forEach(function (o) { if (o[6]) sc[o[6]] = (sc[o[6]] || 0) + 1; });
  var SECR = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; }).slice(0, 6).map(function (x) { return [x, sc[x]]; });
  m[8] = SECR.length ? SECR : [["—", 0]];
  /* follow: false — the platform's alerts cover sectors, governorates, entities and items, not whole export markets yet (no broken ☆ button) */
  if (window.MIGINQ) MIGINQ.ctx({ type: "market", id: k, title: m[1], url: "export-market.html#" + k, follow: false });
  $("#mk4").innerHTML = '<div><b class="num">' + ops.length + '</b><span>فرصة مفتوحة منشورة</span></div><div><b>' + m[6] + '</b><span>نطاق السوق</span></div><div><b>' + (SECR.length ? SECR[0][0] : "—") + '</b><span>أكثر قطاع في الفرص المنشورة</span></div>';
  $("#cty").innerHTML = m[7].map(function (c) { return '<span>📍 ' + c[1] + '</span>'; }).join("");
  $("#secs").innerHTML = SECR.length ? SECR.map(function (r) { return '<div class="hb2"><span>' + r[0] + '</span><span class="t"><i data-w="' + (r[1] / SECR[0][1] * 100) + '"></i></span><b class="num">' + r[1] + '</b></div>'; }).join("") : '<span class="muted">مفيش فرص مفتوحة منشورة للسوق ده دلوقتي.</span>';
  setTimeout(function () { $$("#secs i").forEach(function (i) { i.style.width = i.dataset.w + "%"; }); }, 100);
  drawOps(k);
  $("#req").innerHTML = m[9].map(function (r) { return "<li>" + r + "</li>"; }).join("");
  $("#ship").textContent = m[10];
  $("#ctaT").textContent = "جاهز تدخل " + m[1] + "؟";
  $$(".pbody2 > *").forEach(function (el) { el.style.display = el.id === "mlock" ? "none" : ""; });
  var hasMap = !!(window.MIGMap && MIGMap.DEST[m[0]]); $(".mapbox").style.display = hasMap ? "" : "none";
  var old = $("#mcv"), cv = old.cloneNode(false); old.parentNode.replaceChild(cv, old);
  if (hasMap) MIGMap.start(cv, m[0]);
  window.scrollTo(0, 0);
}
/* the open opportunities of market k inside the viewer's plan. The Gulf market of a Premium member: the 3 GCC states he chose — the
   others are counted in a note («متاحة في باقة الشريك الأساسي»); the page text and its numbers stay market-wide (owner Q5) */
function drawOps(k) {
  var m = M[k], P = window.MIGPLAN, EN = window.MIGLANG === "en"; if (!m) return;
  var ops = OPPS.filter(function (o) { return o[5] === m[11] && o[7] >= 0; });
  if (P && P.plan.lv >= 1 && !P.market(k)) { $("#ops").innerHTML = P.scopeLockHTML(k); return; }
  var g = k === "gulf" && P && P.gcc && P.plan.lv >= 1 ? P.gcc() : null, hid = 0;
  if (g && g.pick && !g.pending) { var all = ops.length; ops = ops.filter(function (o) { return P.inScope("gulf", P.gccCode(o[4])); }); hid = all - ops.length; }
  var nk = P && P.allGulfKey ? P.allGulfKey() : "partner", note = hid ? '<div class="note2" style="margin-bottom:8px">🌍 <span class="num">' + hid + "</span> " + (EN ? "opportunities in other Gulf states — included in the «" + P.name(nk) + "»" : "فرصة في دول خليجية تانية — متاحة في «" + P.name(nk) + "»") + ' — <a href="' + (P.upHref ? P.upHref(nk) : "register.html#" + nk) + '" data-mig-want="' + nk + '">' + (EN ? "Upgrade" : "ترقية الباقة") + "</a></div>" : "";
  $("#ops").innerHTML = note + (ops.length ? ops.map(function (o) { return '<a class="op2" href="opportunity.html#' + o[0].toLowerCase() + '"><span><b>' + o[2] + '</b><br><small class="muted">' + o[3] + ' · ' + o[6] + '</small></span><span class="chip ' + (o[7] <= 5 ? "chip-red" : "chip-amber") + '">' + (o[7] === 1 ? "يُغلق بكرة" : o[7] === 2 ? "يُغلق بعد يومين" : "يُغلق بعد " + o[7] + (o[7] % 100 >= 3 && o[7] % 100 <= 10 ? " أيام" : " يوماً")) + '</span></a>'; }).join("") : (hid ? "" : '<span class="muted">لا توجد فرص مفتوحة حالياً.</span>'));
}
show(); window.addEventListener("hashchange", show);
/* the server's answer (another plan, or the GCC states just chosen): only the list is drawn again (no jump to the top) */
window.addEventListener("mig:plan", function () { if (show.cur) drawOps(show.cur); });
''')

en_add([("فرصة مفتوحة منشورة", "open published opportunities"), ("أكثر قطاع في الفرص المنشورة", "Top sector in published opportunities"), ("مفيش فرص مفتوحة منشورة للسوق ده دلوقتي.", "No open published opportunities for this market right now.")])
en_add([("الأعداد والقطاعات محسوبة من الفرص المفتوحة المنشورة من مصادرها الرسمية؛ فرص الأسواق خارج مصر بتظهر حسب النطاق الجغرافي لباقتك.", "Counts and sectors are computed from the open opportunities published from their official sources; opportunities in markets outside Egypt are shown according to your plan's geographic scope.")])
