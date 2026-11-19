# About page (replaces the earlier simple version in pages.part.py)
PAGES['about'] = ('عن المنصة – صنع في مصر', 'home', COMMON_CSS + '''
html[dir=ltr] #train text { transform-box: fill-box; transform-origin: center; transform: scaleX(-1); }
.ahero { position: relative; min-height: 560px; display: flex; align-items: flex-end; color: #fff; overflow: hidden; background: #4A0510; }
.ahero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ahero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(270deg, rgba(40,4,10,.92) 0%, rgba(40,4,10,.65) 45%, rgba(40,4,10,.2) 100%), linear-gradient(0deg, rgba(40,4,10,.7), transparent 50%); }
.ahero .wrap { position: relative; z-index: 1; padding-block: 60px 48px; display: flex; flex-direction: column; gap: 14px; width: 100%; }
.ahero .crumb { font-size: .82rem; opacity: .8; } .ahero .crumb a { color: #fff; }
.ahero .since { align-self: flex-start; background: var(--gold); color: #1A1204; font-weight: 800; border-radius: 99px; padding: 3px 14px; font-size: .86rem; }
.ahero h1 { font-size: clamp(1.9rem, 4.4vw, 3.2rem); font-weight: 900; line-height: 1.3; max-width: 16em; }
.ahero h1 em { font-style: normal; color: #E2BE72; }
.ahero p { max-width: 44em; opacity: .92; font-size: 1.05rem; }
.ahero .acts { display: flex; gap: 10px; flex-wrap: wrap; }
.days { display: inline-flex; align-items: baseline; gap: 10px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.25); border-radius: 14px; padding: 8px 16px; align-self: flex-start; backdrop-filter: blur(6px); }
.days b { font-size: 2rem; font-weight: 900; color: #E2BE72; font-variant-numeric: tabular-nums; }
.anav { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 74px); z-index: 20; background: var(--surface); border-bottom: 1px solid var(--line); box-shadow: 0 10px 20px -18px rgba(0,0,0,.35); }
.anav .wrap { display: flex; gap: 4px; overflow-x: auto; padding-block: 8px; scrollbar-width: none; }
.anav a { flex: none; padding: 6px 14px; border-radius: 99px; font-size: .86rem; font-weight: 700; color: var(--fg); white-space: nowrap; }
.anav a.on { background: var(--green); color: #fff; }
.asec { padding-block: 54px; scroll-margin-top: 130px; }
.asec.alt { background: var(--sunken); }
.ahead { display: flex; flex-direction: column; gap: 6px; margin-bottom: 22px; }
.ahead .eb { color: var(--gold-deep); font-weight: 800; font-size: .85rem; }
.ahead h2 { font-size: clamp(1.4rem, 3vw, 2.1rem); font-weight: 900; }
.ahead p { color: var(--muted); max-width: 52em; }
.who { display: grid; grid-template-columns: 1.05fr 1fr; gap: 28px; align-items: center; }
.who .txt { display: flex; flex-direction: column; gap: 12px; font-size: 1.02rem; line-height: 1.95; }
.who .txt b { color: var(--green); }
.apic { position: relative; margin: 0; border-radius: 20px; overflow: hidden; aspect-ratio: 16 / 9; background: #2A0409; box-shadow: 0 24px 50px -30px rgba(0,0,0,.6); }
.apic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.apic figcaption { position: absolute; bottom: 0; inset-inline: 0; padding: 14px 18px; background: linear-gradient(0deg, rgba(0,0,0,.75), transparent); color: #fff; font-weight: 800; }
.apic.logo { aspect-ratio: auto; display: flex; flex-direction: column; }
.apic.logo img { aspect-ratio: 16 / 9; height: auto; object-fit: contain; background: #fff; }
.apic.logo figcaption { position: static; background: #2A0409; }
/* sentences whose Arabic is split by <b>: the English is given whole (the engine would translate fragment by fragment) */
.en-t { display: none; } html[lang=en] .en-t { display: inline; } html[lang=en] .ar-t { display: none; }
.apic figcaption small { display: block; font-weight: 600; opacity: .85; }
.astats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-top: 30px; }
.astats div { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; text-align: center; border-top: 4px solid var(--green); }
.astats b { display: block; font-size: 1.9rem; font-weight: 900; color: var(--green); font-variant-numeric: tabular-nums; }
.astats span { font-size: .82rem; color: var(--muted); font-weight: 700; }
.org { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 22px; align-items: start; }
.tiers { display: flex; flex-direction: column; align-items: stretch; gap: 0; }
.tier { position: relative; text-align: start; font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; cursor: pointer; display: grid; grid-template-columns: 52px 1fr; gap: 12px; align-items: center; transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.tier:hover { transform: translateX(-4px); }
.tier.on { border-color: var(--green); box-shadow: 0 14px 28px -20px rgba(142,11,32,.6); background: var(--green-soft); }
.tier .lg { width: 52px; height: 52px; border-radius: 12px; background: #fff; border: 1px solid var(--line); display: grid; place-items: center; overflow: hidden; font-size: 1.5rem; }
.tier .lg img { max-width: 92%; max-height: 92%; }
.tier small { display: block; color: var(--gold-deep); font-weight: 800; font-size: .72rem; }
.tier b { font-size: .95rem; line-height: 1.45; }
.link { height: 26px; width: 2px; margin-inline-start: 41px; background: repeating-linear-gradient(180deg, var(--green) 0 5px, transparent 5px 9px); }
.odet { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.odet h3 { font-size: 1.3rem; font-weight: 900; }
.odet .role { align-self: flex-start; }
.odet ul { margin: 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 6px; }
.odet .ofacts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.odet .ofacts div { background: var(--sunken); border-radius: 12px; padding: 10px 12px; font-size: .84rem; }
.odet .ofacts b { display: block; font-size: .74rem; color: var(--muted); }
.avm { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 22px; }
.vmtabs { display: flex; flex-direction: column; gap: 8px; }
.vmtabs button { font: inherit; text-align: start; border: 1px solid var(--line); background: var(--surface); border-radius: 14px; padding: 14px 16px; cursor: pointer; font-weight: 800; color: var(--fg); display: flex; align-items: center; gap: 10px; transition: all .2s ease; }
.vmtabs button span { font-size: 1.4rem; }
.vmtabs button.on { background: #C8102E; color: #fff; border-color: #C8102E; transform: translateX(-6px); }
.vmbody { position: relative; background: linear-gradient(135deg, #C8102E, #E0283F); color: #fff; border-radius: 22px; padding: 34px; min-height: 260px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
.vmbody::before { content: "”"; position: absolute; top: -40px; inset-inline-end: 20px; font-size: 14rem; line-height: 1; color: rgba(255,255,255,.08); font-family: Georgia, serif; }
.vmbody small { color: #E2BE72; font-weight: 800; }
.vmbody p { font-size: clamp(1.15rem, 2.2vw, 1.55rem); font-weight: 800; line-height: 1.75; position: relative; }
.vmbody .vals { display: flex; flex-wrap: wrap; gap: 8px; }
.vmbody .vals span { display: inline-block; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); border-radius: 12px; padding: 8px 14px; font-weight: 700; font-size: .92rem; }
.vmbody .vals span b { display: block; font-size: .78rem; opacity: .8; font-weight: 600; }
.swap2 { animation: swap2 .45s ease both; } @keyframes swap2 { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.goals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.goal { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
.goal:hover { transform: translateY(-5px); box-shadow: 0 20px 34px -24px rgba(142,11,32,.55); border-color: var(--green); }
.goal .n { position: absolute; top: 10px; inset-inline-end: 16px; font-size: 3rem; font-weight: 900; color: var(--green-soft); line-height: 1; }
.goal .ic { width: 50px; height: 50px; border-radius: 14px; background: var(--green-soft); display: grid; place-items: center; font-size: 1.5rem; position: relative; }
.goal h3 { font-size: 1.05rem; font-weight: 800; position: relative; }
.goal p { color: var(--muted); font-size: .88rem; position: relative; }
.rail { position: relative; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; padding-bottom: 8px; scroll-behavior: smooth; }
.rail-in { position: relative; min-width: 100%; }
.rail .trk { position: absolute; top: 58px; inset-inline: 0; height: 18px; background: repeating-linear-gradient(90deg, #8B6B3E 0 6px, transparent 6px 22px); opacity: .55; border-radius: 4px; }
.rail .trk::before, .rail .trk::after { content: ""; position: absolute; inset-inline: 0; height: 3px; background: #6B7280; border-radius: 2px; }
.rail .trk::before { top: 2px; } .rail .trk::after { bottom: 2px; }
.rail .done { position: absolute; top: 64px; inset-inline-start: 0; height: 6px; width: 0; border-radius: 3px; background: linear-gradient(270deg, var(--green), var(--gold)); opacity: .9; }
.rail .sts { position: relative; display: grid; gap: 14px; padding-top: 96px; }
.rail .st { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 5px; transition: transform .35s ease, border-color .35s ease, box-shadow .35s ease; }
.rail .st::before { content: ""; position: absolute; top: -40px; left: 50%; transform: translateX(-50%); width: 18px; height: 18px; border-radius: 50%; background: var(--surface); border: 4px solid #9CA3AF; transition: all .35s ease; z-index: 1; }
.rail .st::after { content: ""; position: absolute; top: -22px; left: 50%; width: 2px; height: 22px; background: var(--line); }
.rail .st.past::before { border-color: var(--green); }
.rail .st.on { transform: translateY(-6px); border-color: var(--gold); box-shadow: 0 18px 30px -22px rgba(163,129,65,.8); }
.rail .st.on::before { background: var(--gold); border-color: var(--gold); box-shadow: 0 0 0 7px rgba(192,147,0,.28); }
.rail .st.future { border-style: dashed; }
.rail .y { font-weight: 900; color: var(--green); font-size: 1.05rem; } .rail .y small { font-size: .7rem; color: var(--gold-deep); font-weight: 800; margin-inline-start: 6px; }
.rail .st b { font-size: .92rem; line-height: 1.45; } .rail .st p { color: var(--muted); font-size: .8rem; }
.rail .st .ic { font-size: 1.3rem; }
.train { position: absolute; top: 4px; left: 0; right: auto; width: 230px; height: 70px; z-index: 3; pointer-events: none; will-change: transform; }
.train svg { width: 100%; height: 100%; overflow: visible; }
.train .wh { transform-box: fill-box; transform-origin: center; animation: whl .6s linear infinite; }
.train.stop .wh { animation-play-state: paused; }
.train .smk { animation: smk 1.4s ease-out infinite; transform-box: fill-box; transform-origin: center; }
.train.stop .smk { animation-duration: 2.6s; }
@keyframes whl { to { transform: rotate(-360deg); } }
@keyframes smk { 0% { opacity: .7; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(18px,-16px) scale(1.6); } }
.rail-ctl { display: flex; gap: 8px; justify-content: center; margin-top: 10px; }
.rail-ctl button { font: inherit; font-size: .8rem; font-weight: 700; border: 1px solid var(--line); background: var(--surface); color: var(--fg); border-radius: 99px; padding: 4px 14px; cursor: pointer; }
.acc { display: flex; flex-direction: column; gap: 10px; }
.acc details { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
.acc summary { cursor: pointer; list-style: none; padding: 16px 18px; font-weight: 800; display: flex; align-items: center; gap: 12px; }
.acc summary::-webkit-details-marker { display: none; }
.acc summary span.i { width: 38px; height: 38px; border-radius: 10px; background: var(--green-soft); display: grid; place-items: center; flex: none; }
.acc summary::after { content: "+"; margin-inline-start: auto; font-size: 1.3rem; color: var(--green); transition: transform .2s ease; }
.acc details[open] summary::after { transform: rotate(45deg); }
.acc details[open] { border-color: var(--green); }
.acc .bd { padding: 0 18px 18px 18px; padding-inline-start: 68px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; font-size: .92rem; }
.acc .bd b { color: var(--fg); }
.tbd { background: var(--gold-soft); color: var(--gold-deep); border-radius: 6px; padding: 0 6px; font-weight: 700; font-size: .8rem; }
.acta { background: linear-gradient(135deg, var(--green-deep), var(--green)); color: #fff; border-radius: 22px; padding: 30px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.acta h2 { font-size: 1.5rem; font-weight: 900; }
@media (max-width: 1000px) { .who, .org, .avm { grid-template-columns: 1fr; } .astats { grid-template-columns: repeat(3, 1fr); } .goals { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .astats { grid-template-columns: repeat(2, 1fr); } .goals { grid-template-columns: 1fr; } .ahero { min-height: 520px; } .acc .bd { padding-inline-start: 18px; } }
''', '''
<section class="ahero" id="top">
  <video autoplay muted loop playsinline poster="img/about-poster.jpg" aria-hidden="true"><source src="media/about-bg.mp4" type="video/mp4"></video>
  <div class="wrap">
    <nav class="crumb"><a href="home.html">الرئيسية</a> › عن المنصة</nav>
    <span class="since">المنصة الوطنية الموحدة B2B 🇪🇬</span>
    <h1>اليد التي تساند <em>المصنع المصري</em> ليستمر وينتشر</h1>
    <p>منصة صنع في مصر منصة رقمية تربط المصانع والموردين بالمشترين المحليين والدوليين، مملوكة للجمعية المصرية للتنمية الصناعية وتشغّلها الحسيني جروب وشركاءه لخدمة المصانع الوطنية في محافظات مصر الـ27، ودعم التحول الرقمي للقطاع الصناعي، وفتح أسواق جديدة للمنتج المصري في بيئة موثوقة وشفافة.</p>
    <span class="days"><b class="num" id="days">27</b><span>محافظة مصرية في نطاق تغطية المنصة</span></span>
    <div class="acts"><a class="btn btn-gold" href="register.html">سجّل مصنعك</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="#journey">تعرّف على رحلتنا</a></div>
  </div>
</section>
<nav class="anav" aria-label="أقسام الصفحة"><div class="wrap" id="anav"><a href="#who">من نحن</a><a href="#structure">الإطار والتشغيل</a><a href="#vision">الرؤية والرسالة والقيم</a><a href="#goals">الأهداف</a><a href="#journey">رحلتنا</a><a href="#map">خريطة المناطق الصناعية</a><a href="#legal">المرجعية القانونية والخدمية</a></div></nav>

<section class="asec" id="who"><div class="wrap">
  <div class="who">
    <div class="txt">
      <div class="ahead" style="margin:0"><span class="eb">من نحن</span><h2>بجانب المصنع المصري… ومستمرون</h2></div>
      <p><span class="ar-t">تعمل منصة <b>صنع في مصر</b> بهدف واحد: أن يجد كل مصنع مصري طريقاً أقصر إلى المشتري. نعرّف السوق بالمنتج الوطني، ونربط المصانع والموردين بالمشترين والموزعين والمقاولين والاستشاريين والجهات الحكومية والقطاع الخاص داخل مصر وخارجها.</span><span class="en-t" translate="no">The <b>Made in Egypt</b> platform has one goal: for every Egyptian factory to find a shorter path to the buyer. We introduce the market to national products, and we connect factories and suppliers with buyers, distributors, contractors, consultants, government entities and the private sector in Egypt and abroad.</span></p>
      <p>نقدّم لكل مصنع ملفاً رقمياً متكاملاً، ودليلاً شاملاً للمصانع المصرية، وقاعدة بيانات للمنتجات الصناعية، ونظاماً لطلبات عروض الأسعار (RFQ)، ومساحة لعرض الكتالوجات والشهادات، ومتابعة للمناقصات والمشاريع في <b>محافظات مصر الـ27</b>، ونفتح له مسارات إلى خمسة أسواق: المحلي والخليجي والأفريقي والآسيوي والأوروبي، دعماً لعلامة «صنع في مصر».</p>
      <p><span class="ar-t">المنصة مملوكة <b>للجمعية المصرية للتنمية الصناعية</b> وتشغّلها <b>الحسيني جروب وشركاءه</b></span><span class="en-t" translate="no">The platform is owned by the <b>Egypt Industrial Development Association</b> and operated by <b>ElHouseni Group &amp; Partners</b></span>، إسهاماً في مستهدفات <b>رؤية مصر 2030</b> والاستراتيجية الوطنية للصناعة الرامية إلى <b>تعميق التصنيع المحلي</b> وزيادة الصادرات الصناعية، ودعماً للتحول الرقمي للقطاع الصناعي.</p>
    </div>
    <figure class="apic logo"><img src="img/about-poster.jpg" alt="شعار منصة صنع في مصر" loading="lazy"><figcaption><span class="ar-t">منصة صنع في مصر · </span>Made in Egypt Gate<small>بوابة المنتج الصناعي المصري إلى الأسواق المحلية والدولية</small></figcaption></figure>
  </div>
  <div class="astats" id="astats"><!--AB_FAC--><!--AB_COM--><div><b data-n="27">27</b><span>محافظة</span></div><!--AB_ZONES--><div><b data-n="5">5</b><span>أسواق مستهدفة</span></div><div><b data-n="5">5</b><span>باقات اشتراك سنوية</span></div></div>
</div></section>

<section class="asec alt" id="structure"><div class="wrap">
  <div class="ahead"><span class="eb">الإطار والتشغيل</span><h2>من يقف خلف المنصة؟</h2><p>اضغط على أي مستوى لعرض دوره ومسؤولياته.</p></div>
  <div class="org">
    <div class="tiers" id="tiers">
      <button class="tier on" type="button" data-t="0"><span class="lg">🏛️</span><span><small>الإطار الوطني</small><b>رؤية مصر 2030 وتعميق التصنيع المحلي</b></span></button>
      <span class="link"></span>
      <button class="tier" type="button" data-t="1"><span class="lg">🏢</span><span><small>المالك</small><b>الجمعية المصرية للتنمية الصناعية</b></span></button>
      <span class="link"></span>
      <button class="tier" type="button" data-t="2"><span class="lg">⚙️</span><span><small>المشغّل</small><b>الحسيني جروب وشركاءه</b></span></button>
      <span class="link"></span>
      <button class="tier" type="button" data-t="3"><span class="lg"><img src="img/logo-site.png" alt=""></span><span><small>المنصة</small><b>منصة صنع في مصر</b></span></button>
      <span class="link"></span>
      <button class="tier" type="button" data-t="4"><span class="lg">🤝</span><span><small>المستفيدون</small><b>المصانع والمشترون والجهات والمستثمرون</b></span></button>
    </div>
    <div class="odet" id="odet"></div>
  </div>
</div></section>

<section class="asec" id="vision"><div class="wrap">
  <div class="ahead"><span class="eb">الرؤية والرسالة والقيم</span><h2>ما الذي نسعى إليه؟</h2></div>
  <div class="avm"><div class="vmtabs" id="vmtabs"><button class="on" type="button" data-k="0"><span>👁️</span>الرؤية</button><button type="button" data-k="1"><span>🎯</span>الرسالة</button><button type="button" data-k="2"><span>💎</span>القيم</button></div><div class="vmbody" id="vmbody"></div></div>
</div></section>

<section class="asec alt" id="goals"><div class="wrap">
  <div class="ahead"><span class="eb">الأهداف</span><h2>ستة أهداف نعمل عليها كل يوم</h2><p>أهداف تنسجم مع «رؤية مصر 2030» والاستراتيجية الوطنية للصناعة الرامية إلى تعميق التصنيع المحلي وزيادة نسبة المكون المحلي ونمو الصادرات الصناعية المصرية.</p></div>
  <div class="goals" id="goalsG"></div>
</div></section>

<section class="asec" id="journey"><div class="wrap">
  <div class="ahead"><span class="eb">رحلتنا</span><h2>قطار المنصة: محطات رحلتنا… وما بعدها</h2><p>تابع القطار وهو يمر على محطات رحلتنا.</p></div>
  <div class="rail" id="rail"><div class="rail-in" id="railIn"><span class="trk"></span><span class="done" id="tlp"></span><div class="train" id="train" aria-hidden="true"></div><div class="sts" id="tl"></div></div></div><div class="rail-ctl"><button type="button" id="trainBtn">⏸ إيقاف القطار</button><button type="button" id="trainRe">↺ من البداية</button></div>
</div></section>

<section class="asec alt" id="map"><div class="wrap">
  <div class="ahead"><span class="eb">خريطة المناطق الصناعية</span><h2>المدن والمناطق الصناعية والحرة والموانئ في مصر</h2><p>خريطة تفاعلية ثلاثية الأبعاد: صفِّ حسب النوع، واضغط على أي موقع لعرض تفاصيله والانتقال إلى صفحة محافظته.</p></div>
  <div id="aboutMap"></div>
</div></section>

<section class="asec" id="legal"><div class="wrap">
  <div class="ahead"><span class="eb">المرجعية القانونية والخدمية</span><h2>إطار واضح لخدمة موثوقة</h2></div>
  <div class="acc">
    <details open><summary><span class="i">🏛️</span>الإطار المؤسسي</summary><div class="bd"><p><span class="ar-t">منصة صنع في مصر منصة معلومات وأعمال خاصة مملوكة <b>للجمعية المصرية للتنمية الصناعية</b> وتشغّلها <b>الحسيني جروب وشركاءه</b></span><span class="en-t" translate="no">Made in Egypt Gate is a private information and business platform owned by the <b>Egypt Industrial Development Association</b> and operated by <b>ElHouseni Group &amp; Partners</b></span>، وتسترشد في خدماتها بتوجهات الدولة المصرية نحو تعميق التصنيع المحلي و«رؤية مصر 2030»، وتعرّف المصانع بالجهات الرسمية ذات الصلة، مثل <b>وزارة الصناعة</b> و<b>هيئة التنمية الصناعية (IDA)</b> و<b>مركز تحديث الصناعة (IMC)</b> و<b>اتحاد الصناعات المصرية</b> والهيئة العامة للاستثمار والمناطق الحرة (GAFI) والهيئة الاقتصادية لقناة السويس (SCZone).</p><p><span class="ar-t">المنصة <b>ليست جهة حكومية ولا تتبع أياً من هذه الجهات</b></span><span class="en-t" translate="no">The platform <b>is not a government entity and is not affiliated with any of these entities</b></span>، وتُستقى الاشتراطات والإجراءات الرسمية من مواقعها المعتمدة. <a href="useful-links.html">مواقع تهمك ↗</a></p></div></details>
    <details><summary><span class="i">🏢</span>المالك والمشغّل</summary><div class="bd"><a href="https://eafid.org/" target="_blank" rel="noopener" class="eafid" title="الجمعية المصرية للتنمية الصناعية" style="display:inline-block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 12px;margin:0 0 10px;box-shadow:0 8px 20px -10px rgba(0,0,0,.5)"><img src="img/eafid-logo.png" alt="شعار الجمعية المصرية للتنمية الصناعية" width="230" height="75" style="display:block;width:230px;height:auto"></a><p><b>الجمعية المصرية للتنمية الصناعية</b> (Egypt Industrial Development Association) – جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي (<a href="https://eafid.org/" target="_blank" rel="noopener">eafid.org</a>) – هي مالكة المنصة، وتشغّلها الحسيني جروب وشركاءه (استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير).</p><p>العنوان: الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية · البريد: info@madeinegyptgate.com · الخط الساخن: <span class="num" dir="ltr">02 38346757</span> · الجوال وواتساب: <span class="num" dir="ltr">01279188996</span></p></div></details>
    <details><summary><span class="i">🛠️</span>نطاق الخدمات</summary><div class="bd"><p>ملف تعريفي رقمي للمنشأة · دليل شامل للمصانع والموردين · قاعدة بيانات للمنتجات الصناعية · نظام طلبات عروض الأسعار (RFQ) · متابعة المناقصات والمشاريع حسب المحافظة والقطاع · إدارة الكتالوجات والشهادات · دليل المقاولين والاستشاريين · دليل جهات التمويل والشحن والتأمين · فتح مسارات التصدير إلى خمسة أسواق · الفعاليات والمعارض الصناعية وشهادات الشراكة وفق الباقة.</p></div></details>
    <details><summary><span class="i">⚖️</span>حدود المسؤولية</summary><div class="bd"><p>المنصة منصة معلومات أعمال وخدمات تجارية، <b>وليست جهة حكومية ولا جهة تعاقدات حكومية</b>، ولا ترسي العقود ولا تضمن ترسية أي مناقصة أو عقد. يتم التقديم على المناقصات الحكومية عبر بواباتها الرسمية، مثل بوابة التعاقدات العامة المصرية (etenders.gov.eg) وهيئة الشراء الموحد، وبوابات الموردين لدى الشركات العامة وقطاعي البترول والكهرباء.</p><p>دليل التمويل والشحن والتأمين للتعريف بالجهات وبيانات التواصل معها فقط؛ <b>المنصة لا تقدم التمويل ولا تتوسط فيه</b>.</p></div></details>
    <details><summary><span class="i">🔒</span>حماية البيانات والسياسات</summary><div class="bd"><p>تُعالَج بيانات المنشآت والمستخدمين وفق قانون حماية البيانات الشخصية رقم 151 لسنة 2020 في جمهورية مصر العربية، ولا تُعرض بيانات التواصل التفصيلية إلا للمشتركين وفق باقاتهم.</p><p><a href="legal.html#privacy">سياسة الخصوصية</a> · <a href="legal.html#terms">الشروط والأحكام</a> · <a href="legal.html#refund">سياسة الإلغاء والاسترداد</a> · <a href="legal.html">المركز القانوني</a></p></div></details>
  </div>
  <div class="acta" style="margin-top:28px"><div><!--AB_CTA--><p style="opacity:.9">سجّل مصنعك اليوم، ودع منتجك يصل إلى السوق المحلي والعربي والعالمي.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-gold" href="register.html">سجّل مصنعك</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="contact.html">تواصل معنا</a></div></div>
</div></section>
''', '''
var D = 27, ZN = (window.MIGZONES || []).length;
if (ZN && $("#stZ")) $("#stZ").dataset.n = ZN;
function count(el, n, s) { var red = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now(); if (red) { el.textContent = n.toLocaleString("en-US") + (s || ""); return; } (function f(t) { var k = Math.min(1, (t - t0) / 1600), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(n * e).toLocaleString("en-US") + (k === 1 ? (s || "") : ""); if (k < 1) requestAnimationFrame(f); })(t0); }
count($("#days"), D);
var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; io.unobserve(e.target); if (e.target.id === "astats") $$("#astats b").forEach(function (b) { count(b, +b.dataset.n, b.dataset.s); }); }); }, { threshold: .3 });
/* structure */
var ORG = [
 ["الإطار الوطني", "رؤية مصر 2030 والاستراتيجية الوطنية للصناعة", "توجّه وطني تسترشد به المنصة في خدماتها، دون أن تكون جهة حكومية أو تابعة لأي جهة حكومية.", ["تعميق التصنيع المحلي وزيادة نسبة المكون المحلي", "تفضيل المنتج المصري في التعاقدات الحكومية (القانون رقم 5 لسنة 2015)", "نمو الصادرات الصناعية وفتح أسواق جديدة للمنتج المصري", "التحول الرقمي ودعم المشروعات الصغيرة والمتوسطة"], [["الرؤية", "رؤية مصر 2030"], ["الوزارة المعنية", "وزارة الصناعة"], ["الجهات الفنية", "هيئة التنمية الصناعية · مركز تحديث الصناعة"], ["صفة المنصة", "منصة خاصة غير حكومية"]]],
 ["المالك", "الجمعية المصرية للتنمية الصناعية", "Egypt Industrial Development Association — جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي، مالكة المنصة.", [], [["المقر", "الجيزة – مدينة السادس من أكتوبر – الحي 11"], ["الخط الساخن", '<span class="num" dir="ltr">02 38346757</span>'], ["الجوال وواتساب", '<span class="num" dir="ltr">01279188996</span>'], ["البريد", "info@madeinegyptgate.com"], ["الدفع", "إلكتروني فقط"], ["الموقع", "madeinegyptgate.com"]]],
 ["المشغّل", "الحسيني جروب وشركاءه", "الجهة المسؤولة عن تشغيل المنصة.", ["استقبال الطلبات", "تسجيل الشركاء", "خدمة العملاء", "التطوير"], []],
 ["المنصة", "منصة صنع في مصر · Made in Egypt Gate", "المنصة الوطنية الموحدة B2B لربط المصانع والموردين المصريين بالمشترين محلياً ودولياً.", ["ملف رقمي متكامل لكل مصنع", "دليل المصانع وقاعدة بيانات المنتجات الصناعية", "طلبات الأسعار والمناقصات والمشاريع حسب المحافظة", "مسارات التصدير إلى خمسة أسواق"], [["الشعار", "المنصة الوطنية الموحدة B2B"], ["التغطية", "محافظات مصر الـ27"], ["الدليل", "%%AB_DIRN%% منشأة عضو"], ["الموقع", "madeinegyptgate.com"]]],
 ["المستفيدون", "المصانع والمشترون والجهات والمستثمرون", "كل من يبحث عن منتج مصري أو يريد إيصال منتجه إلى السوق.", ["المصانع والموردون ومنافذ البيع", "المشترون والموزعون والمقاولون والاستشاريون", "الجهات الحكومية والشركات العامة والقطاع الخاص", "المستثمرون والمصدّرون والشركاء الدوليون"], [["المحافظات", "27 محافظة"], ["المناطق الصناعية والحرة", (ZN || 46) + (window.MIGLANG === "en" ? " zones" : " منطقة")], ["الأسواق", "5 أسواق"], ["الباقات", "5 باقات سنوية"]]]
];
function org(i) { var o = ORG[i]; $$("#tiers .tier").forEach(function (b) { b.classList.toggle("on", +b.dataset.t === i); }); $("#odet").innerHTML = '<div class="swap2" style="display:flex;flex-direction:column;gap:12px"><span class="chip chip-gold role">' + o[0] + '</span><h3>' + o[1] + '</h3><p class="muted">' + o[2] + '</p><ul>' + o[3].map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul><div class="ofacts">' + o[4].map(function (f) { return '<div><b>' + f[0] + '</b>' + (f[1] === "يُضاف" ? '<span class="tbd">يُضاف من المستندات الرسمية</span>' : f[1]) + '</div>'; }).join("") + '</div></div>'; }
$("#tiers").addEventListener("click", function (e) { var b = e.target.closest(".tier"); if (b) org(+b.dataset.t); }); org(0);
/* vision / mission / values */
var VM = [
 ["الرؤية", '<p>أن تصبح منصة صنع في مصر المرجع الرقمي الأول لربط المصانع المصرية بالمشترين المحليين والدوليين، ودعم التحول الرقمي للقطاع الصناعي من خلال بيئة موثوقة وشفافة ترفع كفاءة التوريدات والتصدير، إسهاماً في «رؤية مصر 2030».</p>'],
 ["الرسالة", '<p>توفير منصة صناعية ذكية تجمع المصانع والمنتجات والموردين والعملاء في نظام موحد يسهّل الوصول إلى المنتجات الصناعية، وإرسال طلبات عروض الأسعار، وإدارة العلاقات التجارية بكفاءة عالية، دعماً لتعميق التصنيع المحلي وعلامة «صنع في مصر».</p>'],
 ["القيم", '<div class="vals"><span><b>01</b>الموثوقية</span><span><b>02</b>الشفافية</span><span><b>03</b>الشراكة</span><span><b>04</b>خدمة المصنع أولاً</span><span><b>05</b>الاستدامة</span><span><b>06</b>الابتكار</span></div>']
];
function vm(k) { $$("#vmtabs button").forEach(function (b) { b.classList.toggle("on", +b.dataset.k === k); }); $("#vmbody").innerHTML = '<div class="swap2" style="display:flex;flex-direction:column;gap:12px"><small>' + VM[k][0] + '</small>' + VM[k][1] + '</div>'; }
$("#vmtabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) vm(+b.dataset.k); }); vm(0);
/* goals */
var GOALS = [["🏭", "حضور أقوى للمنتج المصري", "رفع الطلب على المنتجات المصرية وتعريف المشترين بها في محافظات مصر الـ27، دعماً لعلامة «صنع في مصر»."], ["🌍", "دعم وتعزيز التصدير", "فتح أسواق جديدة للمنتج المصري في الأسواق العربية والأفريقية والآسيوية والأوروبية."], ["📑", "فرص أقرب للمصنع", "ربط المصانع بالمناقصات وطلبات الأسعار والمشاريع حسب القطاع والمحافظة، مع التعريف بتفضيل المنتج المصري في التعاقدات الحكومية (القانون رقم 5 لسنة 2015) ونسبة المكون المحلي."], ["🤝", "ربط المستثمرين بالمصانع", "تسهيل الفرص الاستثمارية والشراكات الصناعية لزيادة الطاقة الإنتاجية."], ["💡", "تحول رقمي للمصانع", "أدوات ذكية تساعد المصانع والمنشآت الصغيرة والمتوسطة على الظهور والبيع رقمياً والنمو."], ["📊", "بيانات تدعم القرار", "مؤشرات عن الطلب والقطاعات والأسواق تساعد المصنع على التخطيط."]];
$("#goalsG").innerHTML = GOALS.map(function (g, i) { return '<div class="goal cin" style="animation-delay:' + i * 70 + 'ms"><span class="n num">0' + (i + 1) + '</span><span class="ic">' + g[0] + '</span><h3>' + g[1] + '</h3><p>' + g[2] + '</p></div>'; }).join("");
/* journey */
var TL = [
 ["🚉", "المحطة 1", "", "الانطلاق", "إطلاق منصة صنع في مصر منصةً وطنية موحدة B2B لربط المصانع والموردين بالمشترين.", "past"],
 ["🏭", "المحطة 2", "", "دليل المصانع المصرية", "ملف رقمي لكل مصنع، ودليل يضم %%AB_DIRN%% منشأة عضو في مختلف القطاعات.", "past"],
 ["📦", "المحطة 3", "", "قاعدة المنتجات الصناعية", "منتجات ومكونات صناعية مصرية بمواصفاتها الفنية للمشترين داخل مصر وخارجها.", "past"],
 ["📑", "المحطة 4", "", "طلبات الأسعار والمناقصات", "نظام طلبات عروض الأسعار (RFQ) ومتابعة المناقصات الصناعية المنشورة أولاً بأول.", "past"],
 ["🗺️", "المحطة 5", "", "محافظات مصر الـ27", "تغطية المحافظات ومدنها ومناطقها الصناعية والحرة والاقتصادية، لكل محافظة صفحة وفرص.", "past"],
 ["🏢", "اليوم", "", "المالك والمشغّل", "المنصة مملوكة للجمعية المصرية للتنمية الصناعية وتشغّلها الحسيني جروب وشركاءه، دعماً لتعميق التصنيع المحلي.", "now"],
 ["📡", "اليوم", "", "المنصة الجديدة", "رادار الفرص القطاعي، وخريطة الفرص في محافظات مصر، والمساعدة الذكية «جنة».", "now"],
 ["🌍", "المحطة القادمة", "", "دعم التصدير", "توسيع مسارات التصدير إلى الأسواق العربية والأفريقية والآسيوية والأوروبية.", "future"],
 ["🚀", "نحو رؤية 2030", "", "التكامل والتوسع", "التكامل مع المنصات والجهات التنظيمية الصناعية، وخدمات رقمية جديدة للمصانع الوطنية، مواكبةً لمستهدفات «رؤية مصر 2030».", "future"]
];
var COLW = 230;
$("#tl").style.gridTemplateColumns = "repeat(" + TL.length + ", " + (COLW - 14) + "px)";
$("#railIn").style.width = (TL.length * COLW) + "px";
$("#tl").innerHTML = TL.map(function (t) { return '<div class="st ' + (t[5] === "future" ? "future" : "") + '"><span class="ic">' + t[0] + '</span><span class="y num"><bdi>' + t[1] + '</bdi>' + (t[2] ? '<small>' + t[2] + '</small>' : '') + '</span><b>' + t[3] + '</b><p>' + t[4] + '</p></div>'; }).join("");
$("#train").innerHTML = '<svg viewBox="0 0 170 52"><g class="smk"><circle cx="14" cy="6" r="5" fill="#CBD5E1"/></g><path d="M8 14 Q8 10 14 10 H58 Q66 10 66 18 V38 H8 Z" fill="#C8102E"/><path d="M8 14 Q2 16 2 26 V38 H8 Z" fill="#8E0B20"/><rect x="14" y="15" width="14" height="9" rx="2" fill="#E0F2FE"/><rect x="32" y="15" width="12" height="9" rx="2" fill="#E0F2FE"/><rect x="48" y="15" width="12" height="9" rx="2" fill="#E0F2FE"/><rect x="2" y="28" width="64" height="4" fill="#C09300"/><rect x="70" y="12" width="46" height="26" rx="4" fill="#C8102E"/><rect x="74" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="88" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="102" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="70" y="28" width="46" height="4" fill="#C09300"/><rect x="120" y="12" width="46" height="26" rx="4" fill="#C8102E"/><rect x="124" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="138" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="152" y="16" width="10" height="8" rx="2" fill="#E0F2FE"/><rect x="120" y="28" width="46" height="4" fill="#C09300"/><rect x="66" y="30" width="4" height="3" fill="#374151"/><rect x="116" y="30" width="4" height="3" fill="#374151"/><g fill="#1F2937">' + [14, 30, 52, 80, 106, 130, 156].map(function (x) { return '<g class="wh"><circle cx="' + x + '" cy="42" r="6"/><circle cx="' + x + '" cy="42" r="2" fill="#9CA3AF"/><rect x="' + (x - .8) + '" y="37" width="1.6" height="10" fill="#9CA3AF"/></g>'; }).join("") + '</g><text x="37" y="35.5" font-size="5" font-weight="800" fill="#fff" text-anchor="middle">صنع في مصر</text></svg>';
var tr = { i: 0, x: 0, run: true, t0: 0, phase: "dwell", from: 0, to: 0, raf: 0 }, RTL = getComputedStyle($("#rail")).direction === "rtl";
function stX(i) { return i * COLW + COLW / 2; }
function place(x) { var w = TL.length * COLW, px = (RTL ? (w - x) : x) - 115; $("#train").style.transform = "translateX(" + px + "px)" + (RTL ? "" : " scaleX(-1)"); $("#tlp").style.width = Math.max(0, x) + "px"; var r = $("#rail"); if (tr.run && !r.matches(":hover")) { var target = (RTL ? -(x - r.clientWidth / 2) : x - r.clientWidth / 2); r.scrollLeft = RTL ? Math.min(0, target) : Math.max(0, target); } }
function mark(i) { $$("#tl .st").forEach(function (el, k) { el.classList.toggle("on", k === i); el.classList.toggle("past", k < i); }); }
function step(ts) {
  if (!tr.run) { tr.raf = 0; return; }
  if (!tr.t0) tr.t0 = ts;
  var el = ts - tr.t0;
  if (tr.phase === "dwell") { $("#train").classList.add("stop"); if (el > 1500) { if (tr.i >= TL.length - 1) { tr.phase = "end"; tr.t0 = ts; } else { tr.phase = "move"; tr.from = stX(tr.i); tr.to = stX(tr.i + 1); tr.t0 = ts; $("#train").classList.remove("stop"); } } }
  else if (tr.phase === "move") { var k = Math.min(1, el / 1600), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; tr.x = tr.from + (tr.to - tr.from) * e; place(tr.x); if (k >= 1) { tr.i++; mark(tr.i); tr.phase = "dwell"; tr.t0 = ts; } }
  else if (tr.phase === "end") { if (el > 3500) { tr.i = 0; tr.x = stX(0); place(tr.x); mark(0); tr.phase = "dwell"; tr.t0 = ts; } }
  tr.raf = requestAnimationFrame(step);
}
function startTrain() { if (tr.raf) return; tr.run = true; tr.t0 = 0; $("#trainBtn").textContent = "⏸ إيقاف القطار"; tr.raf = requestAnimationFrame(step); }
function stopTrain() { tr.run = false; $("#train").classList.add("stop"); $("#trainBtn").textContent = "▶ تشغيل القطار"; }
$("#trainBtn").onclick = function () { if (tr.run) stopTrain(); else startTrain(); };
$("#trainRe").onclick = function () { tr.i = 0; tr.x = stX(0); tr.phase = "dwell"; tr.t0 = 0; place(tr.x); mark(0); startTrain(); };
tr.x = stX(0); place(tr.x); mark(0);
var reducedT = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reducedT) { tr.run = false; tr.i = 6; tr.x = stX(6); place(tr.x); mark(6); $("#trainBtn").hidden = true; }
else { var tio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) startTrain(); else if (tr.raf) { cancelAnimationFrame(tr.raf); tr.raf = 0; } }); }, { threshold: .25 }); tio.observe($("#rail")); }
io.observe($("#astats"));
/* map */
if (window.MIGSAMap) MIGSAMap.mount($("#aboutMap"));
/* section nav highlight */
var secs = $$(".asec"), links = $$("#anav a");
var so = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); }); }); }, { rootMargin: "-45% 0px -50% 0px" });
secs.forEach(function (s) { so.observe(s); });
function hg() { var h = location.hash.slice(1); if (h && document.getElementById(h)) setTimeout(function () { document.getElementById(h).scrollIntoView({ block: "start" }); }, 200); }
hg();
''')
HEROS.pop('about', None)

# ---- honest counts (owner decision: no hand-written numbers): every about-page counter is computed at build time from the data
# files themselves (data/oldfac.js members by type, data/zones.js zones); a file that cannot be read hides its counter instead of guessing.
def _about_counts():
    import json as _j
    def arr(fn, var):
        try:
            s = open(B + 'data/' + fn, encoding='utf-8').read(); i = s.index('window.' + var + '=') + len('window.' + var + '=')
            return _j.JSONDecoder().raw_decode(s[i:].lstrip())[0]
        except Exception:
            return None
    F = arr('oldfac.js', 'MIGOLDFAC')
    fac = len([o for o in F if o[3] == 'مصنع']) if F else 0
    com = len([o for o in F if o[3] != 'مصنع']) if F else 0
    Z = arr('zones.js', 'MIGZONES')
    return fac, com, (len(Z) if Z else 0)
_af, _ac, _az = _about_counts()
_t = PAGES['about']; _b = _t[3]; _j4 = _t[4]
_b = _b.replace('<!--AB_FAC-->', ('<div><b data-n="%d" id="stY">%s</b><span>مصنع في دليل المنصة</span></div>' % (_af, '{:,}'.format(_af))) if _af else '')
_b = _b.replace('<!--AB_COM-->', ('<div><b data-n="%d">%s</b><span>شركة ومورد في دليل المنصة</span></div>' % (_ac, '{:,}'.format(_ac))) if _ac else '')
_b = _b.replace('<!--AB_ZONES-->', ('<div><b data-n="%d" id="stZ">%d</b><span>منطقة صناعية واستثمارية وحرة</span></div>' % (_az, _az)) if _az else '')
_b = _b.replace('<!--AB_CTA-->', ('<h2>انضم إلى %s منشأة عضو في دليل المنصة</h2>' % '{:,}'.format(_af + _ac)) if (_af and _ac) else '<h2>سجّل منشأتك على المنصة</h2>')
if _af and _ac:
    _j4 = _j4.replace('%%AB_DIRN%%', '{:,}'.format(_af + _ac))
else:
    _j4 = _j4.replace(', ["الدليل", "%%AB_DIRN%% منشأة عضو"]', '').replace('ودليل يضم %%AB_DIRN%% منشأة عضو في مختلف القطاعات.', 'ودليل للمصانع والشركات والموردين في مختلف القطاعات.')
PAGES['about'] = (_t[0], _t[1], _t[2], _b, _j4)
# English (numbers become {n} in the keys, so these follow whatever the data says)
en_add([("انضم إلى دليل يضم 2,926 مصنع وشركة ومورد", "Join a directory of 2,926 factories, companies & suppliers"), ("سجّل منشأتك على المنصة", "Register your company on the platform"),
        ("مصنع في دليل المنصة", "factories in the platform directory"), ("شركة ومورد في دليل المنصة", "companies & suppliers in the platform directory"),
        ("منطقة صناعية واستثمارية وحرة", "industrial, investment & free zones"), ("2,926 مصنع وشركة ومورد", "2,926 factories, companies & suppliers"),
        ("ملف رقمي لكل مصنع، ودليل يضم 2,926 مصنع وشركة ومورد في مختلف القطاعات.", "A digital profile for every factory, and a directory of 2,926 factories, companies and suppliers across all sectors.")])
en_add([("منصة صنع في مصر منصة رقمية تربط المصانع والموردين بالمشترين المحليين والدوليين، مملوكة للجمعية المصرية للتنمية الصناعية وتشغّلها الحسيني جروب وشركاءه لخدمة المصانع الوطنية في محافظات مصر الـ27، ودعم التحول الرقمي للقطاع الصناعي، وفتح أسواق جديدة للمنتج المصري في بيئة موثوقة وشفافة.",
         "Made in Egypt Gate is a digital platform that connects factories and suppliers with local and international buyers. It is owned by the Egypt Industrial Development Association and operated by ElHouseni Group & Partners to serve national factories across Egypt's 27 governorates, support the digital transformation of the industrial sector and open new markets for Egyptian products in a trusted, transparent environment."),
        ("الحسيني جروب وشركاءه", "ElHouseni Group & Partners"), ("المالك والمشغّل", "Owner and Operator"),
        (") – هي مالكة المنصة، وتشغّلها الحسيني جروب وشركاءه (استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير).", ") – It is the owner of the platform, which is operated by ElHouseni Group & Partners (receiving requests, partner registration, customer service and development)."),
        ("Egypt Industrial Development Association — جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي، مالكة المنصة.", "Egypt Industrial Development Association — a non-profit association registered under No. 6189 of 2017 and operating under the supervision of the Ministry of Social Solidarity, the owner of the platform."),
        ("الجهة المسؤولة عن تشغيل المنصة.", "The entity responsible for operating the platform."),
        ("استقبال الطلبات", "Receiving requests"), ("تسجيل الشركاء", "Partner registration"), ("التطوير", "Development"),
        ("المنصة مملوكة للجمعية المصرية للتنمية الصناعية وتشغّلها الحسيني جروب وشركاءه، دعماً لتعميق التصنيع المحلي.", "The platform is owned by the Egypt Industrial Development Association and operated by ElHouseni Group & Partners, in support of deepening local manufacturing.")])   # owner / operator (owner approval 2026-11-19)
en_add([("مصنع عضو في دليل المنصة", "member factories in the platform directory"), ("شركة ومورد في دليل المنصة", "companies & suppliers in the platform directory")])
en_add([("2,926 مصنع وشركة ومورد", "{n} factories, companies & suppliers"), ("ملف رقمي لكل مصنع، ودليل يضم 2,926 مصنع وشركة ومورد في مختلف القطاعات.", "A digital profile for every factory, and a directory of {n} factories, companies and suppliers across sectors."), ("ملف رقمي لكل مصنع، ودليل للمصانع والشركات والموردين في مختلف القطاعات.", "A digital profile for every factory, and a directory of factories, companies and suppliers across sectors.")])
