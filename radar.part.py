# Sector radar report: radar.html#metal … (partner & strategic plans only — gated in site.py)
import re as _re2
_rsrc = open(B + 'regions.part.py', encoding='utf-8').read()
_FOCUS = _re2.search(r'var FOCUS = \{.*?\n', _rsrc, _re2.S).group(0) + _re2.search(r'var N = 5100;[^\n]*\n', _rsrc).group(0)

PAGES['radar'] = ('رادار الفرص القطاعي – صنع في مصر', 'rfq', COMMON_CSS + '''
.rhero { background: radial-gradient(ellipse at 20% 0%, #5A0614 0%, #8E0B20 45%, #4A0510 100%); color: #fff; position: relative; overflow: hidden; }
.rhero .wrap { position: relative; z-index: 1; padding-block: 30px 26px; display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 20px; align-items: center; }
.rhero h1 { font-size: clamp(1.5rem, 3.4vw, 2.3rem); font-weight: 900; }
.rhero h1 em { font-style: normal; color: #E2BE72; }
.rhero p { opacity: .85; }
.rhero .crumb { font-size: .8rem; opacity: .75; } .rhero .crumb a { color: #fff; }
.rhero .excl { align-self: flex-start; display: inline-flex; gap: 6px; align-items: center; background: rgba(192,147,0,.18); border: 1px solid rgba(192,147,0,.6); color: #E2BE72; border-radius: 99px; padding: 2px 12px; font-size: .78rem; font-weight: 800; }
.secs2 { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.secs2 button { font: inherit; font-size: .84rem; font-weight: 700; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #fff; border-radius: 99px; padding: 4px 14px; cursor: pointer; }
.secs2 button.on { background: var(--gold); border-color: var(--gold); color: #fff; }
.mini-radar { width: 200px; height: 200px; }
.mini-radar .sw { transform-origin: 100px 100px; animation: sweep 4s linear infinite; }
@keyframes sweep { to { transform: rotate(360deg); } }
.rk { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.rk div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; border-top: 3px solid var(--green); }
.rk b { display: block; font-size: 1.45rem; font-weight: 900; color: var(--green); font-variant-numeric: tabular-nums; }
.rk span { font-size: .76rem; color: var(--muted); font-weight: 700; }
.mkts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.mk { font: inherit; text-align: start; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.mk:hover { transform: translateY(-3px); }
.mk.on { border-color: var(--green); box-shadow: 0 14px 26px -20px rgba(142,11,32,.6); background: var(--green-soft); }
.mk h3 { font-size: .98rem; display: flex; justify-content: space-between; gap: 6px; align-items: center; }
.mk h3 b { color: var(--green); font-size: 1.3rem; }
.mk .v { font-size: .78rem; color: var(--muted); }
.mk .where { display: flex; flex-wrap: wrap; gap: 4px; }
.mk .where span { font-size: .72rem; background: var(--sunken); border-radius: 99px; padding: 1px 8px; font-weight: 700; }
.mk .bar { height: 5px; border-radius: 4px; background: var(--sunken); overflow: hidden; } .mk .bar i { display: block; height: 100%; background: linear-gradient(270deg, var(--green), var(--gold)); }
.rgrid2 { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 14px; }
.rc { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rc h3 { font-size: .95rem; font-weight: 800; } .rc h3 small { display: block; font-size: .72rem; color: var(--muted); font-weight: 600; }
.hb2 { display: grid; grid-template-columns: 110px 1fr 30px; gap: 8px; align-items: center; font-size: .78rem; }
.hb2 .t { height: 10px; background: var(--sunken); border-radius: 5px; overflow: hidden; } .hb2 .t i { display: block; height: 100%; background: var(--green); border-radius: 5px; }
.hb2 a { color: var(--fg); } .hb2 a:hover { color: var(--green); }
.dn { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; }
.dn svg { width: 110px; height: 110px; }
.dn ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: .8rem; }
.dn li { display: flex; gap: 6px; align-items: center; } .dn li i { width: 10px; height: 10px; border-radius: 3px; } .dn li b { margin-inline-start: auto; }
.wk { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; align-items: end; height: 120px; }
.wk div { display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; font-size: .7rem; color: var(--muted); }
.wk i { width: 100%; max-width: 34px; border-radius: 6px 6px 0 0; background: linear-gradient(0deg, var(--green), #F0566A); }
.wk b { color: var(--fg); font-size: .78rem; }
.ent { display: flex; flex-direction: column; gap: 6px; }
.ent div { display: flex; justify-content: space-between; gap: 8px; font-size: .82rem; padding: 6px 8px; border-radius: 8px; background: var(--sunken); }
.tabs3 { display: flex; gap: 6px; flex-wrap: wrap; }
.tabs3 button { font: inherit; font-weight: 700; font-size: .86rem; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 6px 14px; cursor: pointer; color: var(--fg); }
.tabs3 button.on { background: var(--green-deep); color: #fff; border-color: var(--green-deep); }
.tw3 { overflow-x: auto; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.tw3 table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: .84rem; }
.tw3 th, .tw3 td { padding: 9px 12px; border-top: 1px solid var(--line); text-align: start; vertical-align: top; }
.tw3 thead th { background: var(--sunken); border-top: 0; font-size: .76rem; color: var(--muted); }
.tw3 td small { display: block; color: var(--muted); font-size: .74rem; }
.tw3 tr:hover td { background: var(--green-soft); }
.pill2 { display: inline-block; font-size: .72rem; font-weight: 800; border-radius: 99px; padding: 1px 8px; }
.pill2.g { background: var(--green-soft); color: var(--green); } .pill2.p { background: var(--gold-soft); color: var(--gold-deep); } .pill2.r { background: #FDECEC; color: #B42318; }
@media (max-width: 1100px) { .rk { grid-template-columns: repeat(3, 1fr); } .mkts { grid-template-columns: repeat(3, 1fr); } .rgrid2 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .rhero .wrap { grid-template-columns: 1fr; } .mini-radar { display: none; } .rk, .mkts, .rgrid2 { grid-template-columns: 1fr 1fr; } .rgrid2 > :first-child { grid-column: 1 / -1; } }
@media print { .site-hdr, .util, .site-ftr, .wa-float, .totop, .rhero .secs2 { display: none !important; } }
''', '''
<section class="rhero"><div class="wrap">
  <div style="display:flex;flex-direction:column;gap:8px">
    <nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="home.html#radar">رادار الفرص</a> › تقرير القطاع</nav>
    <span class="excl">🔒 حصري لباقتي الشريك الأساسي والشريك الاستراتيجي</span>
    <h1>رادار قطاع <em id="secName">—</em></h1>
    <p id="secLead">أين تُطلب منتجات قطاعك الآن: محلياً حسب المحافظة، وفي الأسواق الخليجية والأفريقية والآسيوية والأوروبية، مع المشاريع والجهات والمناقصات. ويمنح قانون تفضيل المنتجات المصرية في العقود الحكومية (رقم 5 لسنة 2015) أولوية للمنتج المصري المستوفي لنسبة المكون المحلي المقررة.</p>
    <div class="secs2" id="secs2"></div>
  </div>
  <svg class="mini-radar" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.18)"/><circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,.14)"/><circle cx="100" cy="100" r="28" fill="none" stroke="rgba(255,255,255,.12)"/><g class="sw"><path d="M100 100 L100 8 A92 92 0 0 1 175 48 Z" fill="rgba(192,147,0,.32)"/></g><g id="mrDots"></g><circle cx="100" cy="100" r="5" fill="#E2BE72"/></svg>
</div></section>
<main class="wrap pbody2" id="top">
  <div class="rk" id="rk"></div>
  <div><div class="sh" style="margin-bottom:10px"><div><h2 style="font-size:1.15rem">أين الطلب على قطاعك؟</h2><p class="muted" style="font-size:.85rem">اضغط على سوق لعرض فرصه بالتفصيل.</p></div></div><div class="mkts" id="mkts"></div></div>
  <div class="rgrid2">
    <div class="rc"><h3>الفرص المحلية حسب المحافظة<small>مناقصات وطلبات أسعار ومشاريع داخل مصر</small></h3><div id="byReg" style="display:flex;flex-direction:column;gap:6px"></div></div>
    <div class="rc"><h3>نوع الفرص<small>حكومي مقابل خاص</small></h3><div class="dn"><svg viewBox="0 0 42 42" id="dn"></svg><ul id="dnL"></ul></div><h3 style="margin-top:6px">مواعيد الإغلاق<small>عدد الفرص التي تغلق خلال الأسابيع القادمة</small></h3><div class="wk" id="wk"></div></div>
    <div class="rc"><h3>أبرز الجهات الطالبة<small>حسب عدد الفرص والمشاريع</small></h3><div class="ent" id="ent"></div></div>
  </div>
  <div class="card2">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="tabs3" id="tabs3"><button class="on" data-t="opps">المناقصات وطلبات الأسعار</button><button data-t="projs">المشاريع</button><button data-t="leads">طلبات المقاولين</button><button data-t="awards">الترسيات</button></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip chip-gray" id="mkF">كل الأسواق</span><button class="btn btn-sm btn-line" type="button" onclick="window.print()">🖨️ طباعة التقرير</button><button class="mig-fbtn" type="button" id="secFol" data-follow-kind="sector" data-follow-id="metal" data-follow-label="" data-follow-url="radar.html" data-follow-text="تابع القطاع">☆ تابع القطاع</button></div></div>
    <div class="tw3" id="tbl"></div>
  </div>
  <span class="note2">يجمع التقرير الفرص المنشورة على المنصة وأخبار المشاريع المعلنة في محافظات مصر الـ27. فرص الأسواق الخارجية منشورة من مصادرها الرسمية (البنك الدولي وبوابات المشتريات)، وبتظهر حسب النطاق الجغرافي لباقتك. وثّق نسبة المكون المحلي في منتجاتك لتستفيد من أفضلية المنتج المصري في التعاقدات الحكومية وفق القانون رقم 5 لسنة 2015.</span>
</main>
''', OPPS_JS + 'var R = MIGREG;\n' + _FOCUS + r'''
var SEC = [
 ["metal", "الحديد والمعادن", ["المعادن", "حديد", "صلب", "ألمنيوم", "معدن", "تسليح", "قنوات", "مواسير وصمامات"]],
 ["build", "مواد البناء", ["مواد البناء", "خرسانة", "إسمنت", "أسمنت", "بلوك", "طوب", "مبانٍ جاهزة"]],
 ["plastic", "البلاستيك والتغليف", ["البلاستيك", "مواسير", "HDPE", "PVC", "عبوات", "تغليف", "كراتين"]],
 ["elec", "الكهرباء والكابلات", ["الكهرباء", "كابلات", "لوحات", "تكييف", "ألواح شمسية", "مضخات"]],
 ["food", "الصناعات الغذائية", ["الغذائية", "تمور", "أغذية", "زيت", "أعلاف", "عسل", "أسماك"]],
 ["petro", "البتروكيماويات والكيماويات", ["البتروكيماويات", "كيماويات", "كيميائية", "حبيبات", "عزل"]],
 ["glass", "الزجاج", ["الزجاج", "زجاج"]],
 ["furn", "الأثاث والتجهيزات", ["الأثاث", "أثاث", "تجهيزات"]]
];
var MKN = ["المحلي", "الخليجي", "الأفريقي", "الآسيوي", "الأوروبي"];
var R = MIGREG, cur = "metal", mk = -1, tab = "opps";
function SK(k) { for (var i = 0; i < SEC.length; i++) if (SEC[i][0] === k) return SEC[i]; return SEC[0]; }
function hit(txt, s) { txt = String(txt || ""); return s[2].some(function (w) { return txt.indexOf(w) > -1; }); }
function val(s) { s = String(s || ""); if (/\b(?!EGP\b)[A-Z]{3}\b/.test(s)) return 0; var n = parseFloat(s.replace(/[^\d.]/g, "")) || 0; return s.indexOf("مليار") > -1 ? n * 1e9 : s.indexOf("مليون") > -1 ? n * 1e6 : s.indexOf("ألف") > -1 ? n * 1e3 : n; }
/* market card value: EGP total, else the totals per foreign currency (val() counts EGP only), else «غير معلنة» */
function mval(l) { var e = l.reduce(function (a, x) { return a + val(x[8]); }, 0), fc = {}; l.forEach(function (x) { var m = /([\d][\d,.]*)\s*([A-Z]{3})\b/.exec(String(x[8] || "")); if (m && m[2] !== "EGP") fc[m[2]] = (fc[m[2]] || 0) + (parseFloat(m[1].replace(/,/g, "")) || 0); });
  var f = Object.keys(fc).map(function (c) { return Math.round(fc[c]).toLocaleString("en-US") + " " + c; }).join(" · ");
  return e ? '<span class="v">القيمة التقديرية: ' + fmt(e) + ' جنيه</span>' + (f ? '<span class="v"><bdi>+ ' + f + '</bdi></span>' : '') : '<span class="v">القيمة التقديرية: ' + (f ? '<bdi>' + f + '</bdi>' : '<span>غير معلنة</span>') + '</span>'; }
function fmt(v) { return v >= 1e9 ? (v / 1e9).toFixed(1) + " مليار" : v >= 1e6 ? (v / 1e6).toFixed(1) + " مليون" : v >= 1e3 ? Math.round(v / 1e3) + " ألف" : String(v); }
function mkIdx(o) { var i = MKN.indexOf(o[5]); return i < 0 ? 0 : i; }
var PRJ = (window.MIG && MIG.PROJECTS) ? MIG.PROJECTS : [], LDS = (window.MIG && MIG.LEADS) ? MIG.LEADS : [];
var AWD = (window.REG && REG.awards) ? REG.awards : [];
/* geographic scope of the plan (basic = Egypt · premium + the 3 GCC states the member chose · partner + all GCC + Africa · strategic = all);
   a Gulf item is checked against the member's GCC states (x[4] = «(city – )country»); the server decides actions */
var MKK = { "المحلي": "local", "الخليجي": "gulf", "الأفريقي": "africa", "الآسيوي": "asia", "الأوروبي": "europe" };
function inSc(x) { var m = MKK[x[5]] || "local", P = window.MIGPLAN; return !P || P.plan.lv < 1 ? true : P.inScope ? P.inScope(m, m === "gulf" && P.gccCode ? P.gccCode(x[4]) : "") : P.market(m); }
function data() {
  var s = SK(cur);
  var o0 = OPPS.filter(function (x) { return hit(x[6] + " " + x[2], s); }), o = o0.filter(inSc), hid = o0.length - o.length, P = window.MIGPLAN;
  /* hidden only because a Premium member did not choose their GCC state (the market is in his plan): the one note the radar shows (review R-5 —
     items of markets outside the plan stay hidden without a note, as before this change) */
  var hidG = P && P.plan && P.plan.lv >= 1 && P.market && P.market("gulf") ? o0.filter(function (x) { return (MKK[x[5]] || "local") === "gulf" && !inSc(x); }).length : 0;
  var p = PRJ.filter(function (x) { return x[13].some(function (k) { return hit(k[0], s); }); });
  var l = LDS.filter(function (x) { return hit(x[4], s); });
  return { s: s, o: o, p: p, l: l, hid: hid, hidG: hidG };
}
function donut(parts) { var tot = parts.reduce(function (a, b) { return a + b[1]; }, 0) || 1, off = 25, out = '<circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--sunken)" stroke-width="6"/>'; parts.forEach(function (p) { var d = p[1] / tot * 100; out += '<circle cx="21" cy="21" r="15.9" fill="none" stroke="' + p[2] + '" stroke-width="6" stroke-dasharray="' + d + ' ' + (100 - d) + '" stroke-dashoffset="' + off + '"/>'; off -= d; }); return out + '<text x="21" y="23.5" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor">' + tot + '</text>'; }
function render() {
  var D = data(), s = D.s, o = D.o;
  $("#secName").textContent = s[1]; var ttl = window.MIGLANG === "en" && window.MIGTR ? MIGTR(s[1]) + " Sector Radar – Made in Egypt" : "رادار قطاع " + s[1] + " – صنع في مصر"; window.__seoDone = true; if (window.MIGSEO) MIGSEO(ttl); else document.title = ttl;
  $$("#secs2 button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === cur); });
  var gov = o.filter(function (x) { return x[1] === "gov"; }).length, tv = o.reduce(function (a, x) { return a + val(x[8]); }, 0) + D.p.reduce(function (a, x) { return a + (x[6] || 0) * 1e6; }, 0);
  var mks = MKN.filter(function (m, i) { return o.some(function (x) { return mkIdx(x) === i; }); }).length;
  $("#rk").innerHTML = [[o.length + D.p.length + D.l.length, "فرصة ومشروع وطلب"], [gov, "مناقصة حكومية"], [o.length - gov, "طلب عرض سعر"], [D.p.length, "مشروع مرتبط بقطاعك"], [fmt(tv), "جنيه قيمة تقديرية"], [mks + " / 5", "أسواق نشطة"]].map(function (k) { return '<div><b class="num">' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join("");
  var maxM = 1, M = MKN.map(function (m, i) { var l = o.filter(function (x) { return mkIdx(x) === i; }); if (i === 0) l = l.concat(D.p.map(function (p) { return [p[0], "prj", p[1], p[7], p[3], "المحلي", "", 0, p[6] + " مليون"]; })); if (l.length > maxM) maxM = l.length; var w = {}; l.forEach(function (x) { var k = i === 0 ? (R.name(R.of(x[4]) || R.of(x[3]))) : x[4]; if (k && k !== "خارج مصر" && k !== "خارج الدولة" && k !== "غير محددة") w[k] = (w[k] || 0) + 1; }); return [m, l, Object.keys(w).sort(function (a, b) { return w[b] - w[a]; }).slice(0, 4).map(function (k) { return "<bdi>" + k + "</bdi> (" + w[k] + ")"; })]; });
  $("#mkts").innerHTML = M.map(function (m, i) { return '<button type="button" class="mk' + (mk === i ? " on" : "") + '" data-m="' + i + '"><h3>السوق ' + m[0] + '<b class="num">' + m[1].length + '</b></h3><span class="bar"><i style="width:' + (m[1].length / maxM * 100) + '%"></i></span>' + mval(m[1]) + '<span class="where">' + (m[2].length ? m[2].map(function (w) { return "<span>" + w + "</span>"; }).join("") : '<span>لا فرص منشورة حالياً</span>') + '</span></button>'; }).join("");
  var byR = R.list.map(function (r) { var n = o.filter(function (x) { return mkIdx(x) === 0 && (R.of(x[4]) || R.of(x[3])) === r[0]; }).length + D.p.filter(function (p) { return R.of(p[2]) === r[0]; }).length; return [r, n]; }).sort(function (a, b) { return b[1] - a[1]; }), mx = Math.max(1, byR[0][1]);
  $("#byReg").innerHTML = byR.map(function (x) { return '<div class="hb2"><a href="region.html#' + x[0][0] + '">' + x[0][1] + '</a><span class="t"><i style="width:' + (x[1] / mx * 100) + '%;opacity:' + (x[1] ? 1 : .2) + '"></i></span><b class="num">' + x[1] + '</b></div>'; }).join("");
  var parts = [["مناقصات حكومية", gov, "#C8102E"], ["طلبات أسعار (خاص)", o.length - gov, "#C09300"], ["مشاريع", D.p.length, "#1F4E6B"]];
  $("#dn").innerHTML = donut(parts); $("#dnL").innerHTML = parts.map(function (p) { return '<li><i style="background:' + p[2] + '"></i>' + p[0] + '<b class="num">' + p[1] + '</b></li>'; }).join("");
  var W = [0, 0, 0, 0, 0]; o.forEach(function (x) { var w = Math.min(4, Math.floor((x[7] || 0) / 7)); W[w]++; }); var wm = Math.max(1, Math.max.apply(null, W));
  $("#wk").innerHTML = W.map(function (n, i) { return '<div><b class="num">' + n + '</b><i style="height:' + Math.max(4, n / wm * 80) + 'px"></i><span>' + (i < 4 ? "أسبوع " + (i + 1) : "لاحقاً") + '</span></div>'; }).join("");
  var E = {}; o.forEach(function (x) { E[x[3]] = (E[x[3]] || 0) + 1; }); D.p.forEach(function (p) { E[p[7]] = (E[p[7]] || 0) + 1; }); D.l.forEach(function (l) { E[l[2]] = (E[l[2]] || 0) + 1; });
  $("#ent").innerHTML = Object.keys(E).sort(function (a, b) { return E[b] - E[a]; }).slice(0, 7).map(function (k) { return '<div><span>' + k + '</span><b class="num">' + E[k] + '</b></div>'; }).join("") || '<span class="muted">لا توجد جهات بعد.</span>';
  $("#mrDots").innerHTML = o.slice(0, 18).map(function (x, i) { var a = (mkIdx(x) * 72 + (i * 23) % 60 - 30) * Math.PI / 180, r = 22 + Math.min(70, (x[7] || 1) * 3); return '<circle cx="' + (100 + Math.sin(a) * r) + '" cy="' + (100 - Math.cos(a) * r) + '" r="3.5" fill="' + (x[1] === "gov" ? "#3DDC84" : "#E2BE72") + '"/>'; }).join("");
  $("#mkF").textContent = mk < 0 ? "كل الأسواق" : "السوق " + MKN[mk];
  var fb = $("#secFol"); if (fb) { fb.setAttribute("data-follow-id", cur); fb.setAttribute("data-follow-label", s[1]); /* the sector's own name: the daily digest matches new items by sector */ fb.setAttribute("data-follow-url", "radar.html#" + cur); }
  if (window.MIGINQ) MIGINQ.ctx({ type: "sector", id: cur, title: s[1], url: "radar.html#" + cur });
  table(D);
}
function table(D) {
  var P = window.MIGPLAN, nk = P && P.allGulfKey ? P.allGulfKey() : "partner", EN = window.MIGLANG === "en";
  /* the GCC states a Premium member did not choose: «N فرصة في دول خليجية تانية — متاحة في «باقة الشريك الأساسي»» above the table (the same
     note as the export-market page); no note for markets outside the plan, as before */
  var h = D.hidG && P ? '<div class="note2" style="margin-bottom:8px">🌍 <span class="num">' + D.hidG + "</span> " + (EN ? "opportunities in other Gulf states — included in the «" + P.name(nk) + "»" : "فرصة في دول خليجية تانية — متاحة في «" + P.name(nk) + "»") + ' (' + P.scopeText() + ') — <a href="' + (P.upHref ? P.upHref(nk) : "register.html#" + nk) + '" data-mig-want="' + nk + '">' + (EN ? "Upgrade" : "ترقية الباقة") + "</a></div>" : "";
  if (tab === "opps") { var l = D.o.filter(function (x) { return mk < 0 || mkIdx(x) === mk; }).sort(function (a, b) { return ((a[7] <= 0) - (b[7] <= 0)) || (a[7] - b[7]); }); h += '<table><thead><tr><th>الفرصة</th><th>الجهة</th><th>السوق / الموقع</th><th>القيمة</th><th>الإغلاق</th><th></th></tr></thead><tbody>' + (l.length ? l.map(function (x) { var rg = R.of(x[4]); return '<tr><td><span class="pill2 ' + (x[1] === "gov" ? "g" : "p") + '">' + (x[1] === "gov" ? "مناقصة" : "طلب سعر") + '</span> <b>' + x[2] + '</b><small class="num">' + x[0] + '</small></td><td>' + x[3] + '</td><td>' + x[5] + '<small>' + (rg ? '<a href="region.html#' + rg + '">📍 ' + R.name(rg) + '</a>' : '📍 ' + x[4]) + '</small></td><td class="num">' + (x[8] || "—") + '</td><td>' + (x[7] > 0 ? '<span class="pill2 ' + (x[7] <= 3 ? "r" : "g") + ' num">' + x[7] + ' يوم</span>' : '<span class="pill2">مغلقة</span>') + '</td><td><a class="btn btn-sm btn-green" href="opportunity.html#' + x[0] + '">التفاصيل</a></td></tr>'; }).join("") : '<tr><td colspan="6" class="muted">لا توجد فرص في هذا السوق حالياً.</td></tr>') + '</tbody></table>'; }
  if (tab === "projs") { h = '<table><thead><tr><th>المشروع</th><th>المحافظة</th><th>المرحلة</th><th>القيمة</th><th>صلته بقطاعك</th><th></th></tr></thead><tbody>' + (D.p.length ? D.p.map(function (p) { var m = p[13].filter(function (k) { return hit(k[0], D.s); }); return '<tr><td><b>' + p[1] + '</b><small>المالك: ' + p[7] + '</small></td><td><a href="region.html#' + R.of(p[2]) + '">' + p[3] + '</a></td><td>' + MIG.STAGES[p[5]] + '</td><td class="num">' + MIG.money(p[6]) + '</td><td>' + '<small>' + m.map(function (k) { return k[0]; }).join("، ") + '</small>' + '</td><td><a class="btn btn-sm btn-green" href="project.html#' + p[0] + '">المشروع</a></td></tr>'; }).join("") : '<tr><td colspan="6" class="muted">لا توجد مشاريع تتطلب منتجات هذا القطاع حالياً.</td></tr>') + '</tbody></table>'; }
  if (tab === "leads") { h = '<table><thead><tr><th>المادة المطلوبة</th><th>الجهة المرتبطة</th><th>الكمية</th><th>المحافظة</th><th>المهلة</th><th></th></tr></thead><tbody>' + (D.l.length ? D.l.map(function (l) { return '<tr><td><b>' + l[4] + '</b><small>' + l[10] + '</small></td><td>' + l[2] + '</td><td class="num">' + l[5] + ' ' + l[6] + '</td><td>' + l[7] + '</td><td class="num">' + l[8] + ' يوم</td><td><a class="btn btn-sm btn-green" href="leads.html">الطلب</a></td></tr>'; }).join("") : '<tr><td colspan="6" class="muted">لسه مفيش طلبات مواد منشورة من المقاولين على المنصة لهذا القطاع.</td></tr>') + '</tbody></table>'; }
  if (tab === "awards") { var a = AWD.filter(function (w) { return hit(w[1] + " " + (w[6] || ""), D.s); }); h = '<table><thead><tr><th>المناقصة</th><th>الشركة الفائزة</th><th>القيمة</th><th>التاريخ</th></tr></thead><tbody>' + (a.length ? a.map(function (w) { return '<tr><td><b>' + w[1] + '</b></td><td>' + (window.REG ? (REG.c(w[3]) || [])[1] || "" : "") + '</td><td class="num">' + (window.REG && REG.money ? (w[4] ? REG.money(w[4]) + ' جنيه' : REG.money(w[4])) : w[4] + ' جنيه') + '</td><td class="num">' + (w[5] || "") + '</td></tr>'; }).join("") : '<tr><td colspan="4" class="muted">لا توجد ترسيات مسجلة لهذا القطاع بعد. <a href="winners.html">كل الشركات الفائزة ←</a></td></tr>') + '</tbody></table>'; }
  $("#tbl").innerHTML = h;
}
$("#secs2").innerHTML = SEC.map(function (s) { return '<button type="button" data-k="' + s[0] + '">' + s[1] + '</button>'; }).join("");
$("#secs2").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; location.hash = b.dataset.k; });
$("#mkts").addEventListener("click", function (e) { var b = e.target.closest(".mk"); if (!b) return; var i = +b.dataset.m; mk = mk === i ? -1 : i; tab = "opps"; $$("#tabs3 button").forEach(function (x) { x.classList.toggle("on", x.dataset.t === tab); }); render(); });
$("#tabs3").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#tabs3 button").forEach(function (x) { x.classList.toggle("on", x === b); }); table(data()); });
function route() { var h = (location.hash || "").slice(1); cur = SEC.some(function (s) { return s[0] === h; }) ? h : "metal"; mk = -1; render(); }
window.addEventListener("hashchange", route); route();
window.addEventListener("mig:plan", function () { render(); });
''')

en_add([("تابع القطاع", "Follow the sector"), ("فرص الأسواق الخارجية منشورة من مصادرها الرسمية (البنك الدولي وبوابات المشتريات)، وبتظهر حسب النطاق الجغرافي لباقتك.", "Opportunities in foreign markets are published from their official sources (World Bank and procurement portals) and shown according to your plan's geographic scope."),
 ("مشروع مرتبط بقطاعك", "projects linked to your sector"), ("فرصة في أسواق خارج النطاق الجغرافي لباقتك", "opportunities in markets outside your plan's geographic scope"), ("ترقية الباقة", "Upgrade your plan"), ("صلته بقطاعك", "Link to your sector"),
 ("لسه مفيش طلبات مواد منشورة من المقاولين على المنصة لهذا القطاع.", "No contractor material requests have been published on the platform for this sector yet.")])
