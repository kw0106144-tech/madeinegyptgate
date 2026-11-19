# One industrial city / zone page: city.html#<zone id in data/zones.js> — the city, its opportunities, projects, factories and products in one page.
PAGES['city'] = ('المدينة الصناعية – صنع في مصر', 'cities', COMMON_CSS + '''
.cyh { position: relative; min-height: 360px; display: flex; align-items: flex-end; color: #fff; overflow: hidden; }
.cyh .bg { position: absolute; inset: 0; background-size: cover; background-position: center; transform: scale(1.03); }
.cyh .bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(20,4,8,.94) 6%, rgba(20,4,8,.45) 58%, rgba(20,4,8,.12)); }
.cyh .wrap { position: relative; width: 100%; padding-block: 34px 66px; }
.cyh .crumb, .cyh .crumb a { color: rgba(255,255,255,.88); }
.cyh h1 { font-size: clamp(1.6rem, 3.6vw, 2.6rem); line-height: 1.35; margin-top: 8px; }
.cyh .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.cyh .chips span { background: rgba(255,255,255,.16); border-radius: 999px; padding: 5px 13px; font-size: .84rem; font-weight: 700; }
.cyk { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: -34px; position: relative; z-index: 2; }
.cyk a { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; color: var(--fg); box-shadow: 0 14px 30px -20px rgba(0,0,0,.45); border-bottom: 3px solid var(--green); transition: transform .2s ease; }
.cyk a:hover { transform: translateY(-3px); }
.cyk b { display: block; font-size: 1.7rem; color: var(--green); } .cyk span { font-size: .86rem; color: var(--muted); font-weight: 700; }
.cyg { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; margin-block: 24px 40px; }
.cys { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.cys > section { scroll-margin-top: 96px; }
.cys h2 { font-size: 1.15rem; margin-bottom: 4px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.cys h2 a { font-size: .84rem; }
.cys .sub { color: var(--muted); font-size: .84rem; margin-bottom: 12px; }
.cyl { display: flex; flex-direction: column; }
.cyl a { display: flex; flex-direction: column; gap: 4px; padding: 11px 0; border-bottom: 1px solid var(--line); color: var(--fg); }
.cyl a:last-child { border-bottom: 0; }
.cyl a:hover b { color: var(--green); }
.cyl small { color: var(--muted); font-size: .8rem; display: flex; gap: 10px; flex-wrap: wrap; }
.cyf { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.cyf a { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: var(--surface); color: var(--fg); transition: border-color .2s ease, transform .2s ease; }
.cyf a:hover { border-color: var(--green); transform: translateY(-2px); }
.cyf .l { width: 50px; height: 50px; border-radius: 10px; flex: none; background-size: 1000% 1000%; background-repeat: no-repeat; background-color: #fff; border: 1px solid var(--line); display: grid; place-items: center; font-weight: 900; color: var(--green); }
.cyf b { font-size: .86rem; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } .cyf small { color: var(--muted); font-size: .75rem; display: block; }
.cyp { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.cyp a { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); color: var(--fg); display: flex; flex-direction: column; }
.cyp .im { aspect-ratio: 1; background-size: cover; background-position: center; background-color: #fff; }
.cyp .im.sp { background-size: 1000% 1000%; background-repeat: no-repeat; }
.cyp b { padding: 8px 10px 4px; font-size: .82rem; line-height: 1.45; } .cyp small { padding: 0 10px 10px; color: var(--muted); font-size: .72rem; }
.cytag { display: flex; gap: 6px; flex-wrap: wrap; } .cytag span { background: var(--green-soft, #fbe9ec); color: var(--green); border-radius: 999px; padding: 4px 11px; font-size: .78rem; font-weight: 700; }
.cykv { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: .88rem; margin: 10px 0 0; } .cykv dt { color: var(--muted); } .cykv dd { margin: 0; font-weight: 700; }
.cyside { display: flex; flex-direction: column; gap: 14px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 86px); }
.cyside .btn { width: 100%; justify-content: center; margin-top: 8px; }
.cyo a { display: flex; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px dashed var(--line); color: var(--fg); font-size: .86rem; } .cyo a:last-child { border-bottom: 0; }
.cyempty { color: var(--muted); font-size: .9rem; padding: 10px 0; }
@media (max-width: 900px) { .cyg { grid-template-columns: 1fr; } .cyk { grid-template-columns: repeat(2, 1fr); } .cyside { position: static; } }
''', '''
<section class="cyh"><span class="bg" id="cyBg" style="background-image:url(img/m0.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="cities.html">المدن والمناطق الصناعية</a> › <span id="cyCr">المدينة</span></nav><h1 id="cyT">المدينة الصناعية</h1><div class="chips" id="cyC"></div></div></section>
<main class="wrap" id="top">
  <div class="cyk" id="cyK"></div>
  <div class="cyg"><div class="cys" id="cyS"></div><aside class="cyside" id="cyA"></aside></div>
</main>
''', OPPS_JS + r'''
var Z = window.MIGZONES || [], R = MIGREG, H = decodeURIComponent((location.hash || "").slice(1)), z = null;
Z.forEach(function (x) { if (x.id === H) z = x; });
var TY = { industrial_city: "مدينة صناعية", industrial_area: "منطقة صناعية", free_zone: "منطقة حرة", tech_park: "مجمع تكنولوجي", port_zone: "ميناء ومنطقة مينائية", economic_zone: "منطقة اقتصادية", investment_zone: "منطقة استثمارية" };
var CIMG = { "ic-10th-of-ramadan": "10th-of-ramadan", "fz-planned-10th-ramadan": "10th-of-ramadan", "ic-6th-of-october": "6th-of-october", "fz-media-6-october": "6th-of-october", "ic-new-borg-el-arab": "new-borg-el-arab", "fz-planned-new-borg-el-arab": "new-borg-el-arab", "tp-silicon-waha-borg-el-arab": "new-borg-el-arab", "ic-new-damietta": "new-damietta", "ia-damietta-furniture-city": "new-damietta", "fz-damietta": "new-damietta" };
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function NN(t) { return String(t || "").replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim(); }
function pos(c) { return (c % 10) * 100 / 9 + "% " + Math.floor(c / 10) * 100 / 9 + "%"; }
if (!z) {
  $("#cyS").innerHTML = '<div class="card2">لم يُعثر على المدينة. <a href="cities.html">كل المدن والمناطق الصناعية ←</a></div>';
} else {
  var gov = z.region_code, gN = R.name(gov) || "", cityName = z.name_ar;
  var EN = window.MIGLANG === "en", T = function (x) { return EN && window.MIGTR ? MIGTR(x) : x; }, E = function (a, b) { return EN ? b : a; };
  var gNd = T(gN), cityD = EN ? (z.name_en || T(cityName)) : cityName, placeD = EN ? (T(z.city || "") || cityD) : (z.city || cityName);
  var STEN = { "قائمة": "Operational", "قائمة وتعمل": "Operational", "تعمل": "Operational", "مخططة": "Planned", "مخطط لها": "Planned", "قيد الإنشاء": "Under construction", "قيد التطوير": "Under development", "قيد التنفيذ": "Under construction" };
  function ST(x) { return EN ? (STEN[x] || T(x)) : x; }
  /* keywords that identify the city in other records (e.g. "العاشر من رمضان", "السادات", "برج العرب") */
  var KW = [z.city].concat((z.city || "").split(/\s*[–\-،,()]\s*/)).map(function (k) { return NN(String(k || "").replace(/^(مدينة|المنطقة الصناعية ب?|منطقة)\s*/, "").replace(/\s*\(.*$/, "")); }).filter(function (k, i, a) { return k.length > 2 && k !== NN(gN) && a.indexOf(k) === i; });
  function inCity(t) { var n = NN(t); return KW.some(function (k) { return n.indexOf(k) > -1; }); }
  if (window.MIGINQ) MIGINQ.ctx({ type: "city", id: H, title: cityD, url: "city.html#" + encodeURIComponent(H) });
  document.title = cityD + E(" – الفرص والمصانع والمنتجات | صنع في مصر", " – Opportunities, factories & products | Made in Egypt");
  $("#cyT").textContent = cityD; $("#cyCr").textContent = placeD;
  $("#cyBg").style.backgroundImage = "url(" + ((window.MIGIND && MIGIND.zone(z.id)) || (CIMG[z.id] ? "img/cities/" + CIMG[z.id] + ".jpg" : "img/m0.jpg")) + "), url(img/m1.jpg)";
  $("#cyC").innerHTML = '<span>🏭 ' + esc(TY[z.type] || "منطقة صناعية") + '</span>' + (gN ? '<span>📍 ' + esc(E('محافظة ' + gN, gNd + ' Governorate')) + '</span>' : '') + (z.status_ar ? '<span>✓ ' + esc(ST(z.status_ar)) + '</span>' : '') + (z.area_text ? '<span>📐 ' + esc(String(z.area_text).split("؛")[0]) + '</span>' : '');

  /* opportunities: tenders & RFQs in the city first, then in the governorate */
  var OL = OPPS.filter(function (o) { return o[5] === "المحلي" && (inCity(o[4] + " " + o[3] + " " + o[2]) || R.of(o[4]) === gov || R.of(o[3]) === gov); });
  OL.sort(function (a, b) { return inCity(b[4] + " " + b[3] + " " + b[2]) - inCity(a[4] + " " + a[3] + " " + a[2]); });
  if (OL.length < 6 && z.focus_sectors_ar) { var SK = z.focus_sectors_ar.map(function (x) { return NN(String(x).split(/\s+/).filter(function (w) { return w.length > 3 && !/^(الصناعات|صناعة|منتجات)$/.test(w); })[0] || ""); }).filter(Boolean);
    OPPS.forEach(function (o) { if (OL.length < 12 && o[5] === "المحلي" && OL.indexOf(o) < 0 && SK.some(function (k) { return NN(o[6] + " " + o[2]).indexOf(k) > -1; })) { o.sec = 1; OL.push(o); } }); }
  var oL = OL.filter(function (o) { return !o.sec; }).length;
  var oC = OL.filter(function (o) { return inCity(o[4] + " " + o[3] + " " + o[2]); }).length;
  /* projects */
  var PJ = (window.MIG && MIG.PROJECTS ? MIG.PROJECTS : []).filter(function (p) { return R.of(p[2]) === gov || R.of(p[3]) === gov || inCity(p[3] + " " + p[1]); });
  PJ.sort(function (a, b) { return inCity(b[3] + " " + b[1]) - inCity(a[3] + " " + a[1]); });
  /* factories: researched list + platform members */
  var FL = [];
  (window.MIGFACX ? MIGFACX.list : []).forEach(function (f, i) { var g = R.of(f[2]); if (inCity(f[2]) || g === gov) FL.push({ n: f[0], s: f[1], l: f[2], href: "company.html#x" + i, c: inCity(f[2]), lg: "", p: (MIGFACX.fp[f[0]] || []), u: "" }); });
  (window.MIGOLDFAC || []).forEach(function (o, i) { if (inCity(o[2]) || o[10] === gov) FL.push({ n: o[0], s: o[1], l: o[2], href: "company.html#" + i, c: inCity(o[2]), lg: o[5] >= 0 ? "background-image:url(img/old/lg" + o[5] + ".jpg);background-position:" + pos(o[6]) : "", p: o[9] || [], u: o[7] }); });
  FL.sort(function (a, b) { return (b.c - a.c) || ((b.lg ? 1 : 0) - (a.lg ? 1 : 0)); });
  var fC = FL.filter(function (f) { return f.c; }).length;
  /* products of those factories (with photos where the platform has them) */
  var U = {}; FL.forEach(function (f) { if (f.u) U[f.u] = f; });
  var PR = [], seen = {};
  (window.MIGOLDP || []).forEach(function (p, i) { var f = window.MIGP2F && U[MIGP2F[i]]; if (f && p[3] >= 0 && !seen[p[0]]) { seen[p[0]] = 1; PR.push({ n: p[0], f: f, im: "background-image:url(img/old/pr" + p[3] + ".jpg);background-position:" + pos(p[4]), sp: 1 }); } });
  var CV = { "الغذائية": "m2", "الأغذية": "m2", "البناء": "cat-build", "الأسمنت": "cat-build", "الحديد": "cat-metal", "المعادن": "cat-metal", "الألومنيوم": "cat-metal", "البلاستيك": "cat-plastic", "الزجاج": "cat-glass", "الكهرباء": "cat-cable", "الكابلات": "cat-cable", "الأجهزة": "cat-ac", "الأدوية": "e1", "الكيماويات": "m1", "الأسمدة": "m1", "البتروكيماويات": "m1", "الغزل": "m3", "المنسوجات": "m3", "الملابس": "m3", "الأثاث": "e3" };
  function cv(s) { for (var k in CV) if (String(s).indexOf(k) > -1) return CV[k]; return "e3"; }
  FL.forEach(function (f) { f.p.forEach(function (n) { if (!seen[n] && PR.length < 400) { seen[n] = 1; PR.push({ n: n, f: f, im: "background-image:url(img/" + cv(f.s) + ".jpg)", sp: 0 }); } }); });
  PR.sort(function (a, b) { return (b.f.c - a.f.c) || (b.sp - a.sp); });

  $("#cyK").innerHTML = [["#cy-opps", oL, "مناقصة وطلب سعر"], ["#cy-facs", FL.length, "مصنع وشركة"], ["#cy-prods", PR.length, "منتج"], ["#cy-projs", PJ.length, "مشروع قائم"]].map(function (k) { return '<a href="' + k[0] + '"><b class="num">' + k[1].toLocaleString("en-US") + '</b><span>' + k[2] + '</span></a>'; }).join("");
  function scope(n, sec) { if (EN) return (n ? '<b class="num">' + n + '</b> in ' + esc(placeD) + ', the rest across ' + esc(gNd) + ' Governorate' : 'Across ' + esc(gNd) + ' Governorate') + (sec ? ', plus nationwide opportunities in the city\'s sectors' : ''); return (n ? '<b class="num">' + n + '</b> في ' + esc(z.city || cityName) + ' والباقي في محافظة ' + esc(gN) : 'في محافظة ' + esc(gN)) + (sec ? '، إضافة إلى فرص على مستوى مصر في قطاعات المدينة' : ''); }
  var oH = OL.slice(0, 12).map(function (o) { return '<a href="opportunity.html#' + encodeURIComponent(o[0]) + '"><b>' + esc(o[2]) + '</b><small><span>🏛️ ' + esc(o[3]) + '</span><span>📍 ' + esc(o[4]) + '</span>' + (o.sec ? '<span>' + E('على مستوى مصر', 'Nationwide') + '</span>' : '') + (o[6] ? '<span>🏷️ ' + esc(o[6]) + '</span>' : '') + (o[7] > 0 ? '<span>⏳ ' + E('متبقٍ ' + o[7] + ' يوم', o[7] + ' days left') + '</span>' : '') + (o[8] ? '<span>💰 ' + esc(T(o[8])) + E(' جنيه', ' EGP') + '</span>' : '') + '</small></a>'; }).join("");
  var pH = PJ.slice(0, 8).map(function (p) { return '<a href="project.html#' + p[0] + '"><b>' + esc(p[1]) + '</b><small><span>📍 ' + esc(p[3] || p[2]) + '</span><span>🏷️ ' + esc(p[4]) + '</span>' + (p[7] ? '<span>👷 ' + esc(p[7]) + '</span>' : '') + '</small></a>'; }).join("");
  var fH = FL.slice(0, 24).map(function (f) { return '<a href="' + f.href + '"><span class="l" style="' + f.lg + '">' + (f.lg ? "" : esc(f.n.replace(/^(مصنع|شركة|الشركة)\s+/, "").charAt(0))) + '</span><span style="min-width:0"><b>' + esc(f.n) + '</b><small>🏷️ ' + esc(f.s) + '</small><small>📍 ' + esc(f.l) + '</small></span></a>'; }).join("");
  var prH = PR.slice(0, 24).map(function (p) { return '<a href="market.html" data-q="' + esc(p.n) + '"><span class="im' + (p.sp ? " sp" : "") + '" style="' + p.im + '"></span><b>' + esc(p.n) + '</b><small>' + esc(p.f.n) + '</small></a>'; }).join("");
  $("#cyS").innerHTML =
      '<section class="card2" id="cy-about"><h2>' + E('عن ', 'About ') + esc(cityD) + '</h2>' + (z.focus_sectors_ar && z.focus_sectors_ar.length ? '<p class="sub">القطاعات المستهدفة في المدينة:</p><div class="cytag">' + z.focus_sectors_ar.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join("") + '</div>' : '')
      + '<dl class="cykv"><dt>النوع</dt><dd>' + esc(TY[z.type] || "منطقة صناعية") + '</dd><dt>المحافظة</dt><dd><a href="region.html#' + gov + '">' + esc(gN) + '</a></dd>' + (z.city ? '<dt>الموقع</dt><dd>' + esc(z.city) + '</dd>' : '') + (z.area_text ? '<dt>المساحة</dt><dd>' + esc(z.area_text) + '</dd>' : '') + (z.operator_ar ? '<dt>جهة الإدارة</dt><dd>' + esc(z.operator_ar) + '</dd>' : '') + (z.status_ar ? '<dt>الحالة</dt><dd>' + esc(ST(z.status_ar)) + '</dd>' : '') + '</dl></section>'
    + '<section class="card2" id="cy-opps"><h2>الفرص: مناقصات وطلبات أسعار <a href="tenders.html">كل المناقصات ←</a></h2><p class="sub">' + (OL.length && !oL ? E('لا توجد فرص محلية حالياً؛ فرص مشابهة على مستوى مصر في قطاعات المدينة', 'No local opportunities right now; similar opportunities across Egypt in the city\'s sectors') : scope(oC, OL.some(function (o) { return o.sec; }))) + '</p><div class="cyl">' + (oH || '<p class="cyempty">لا توجد فرص منشورة حالياً.</p>') + '</div></section>'
    + '<section class="card2" id="cy-facs"><h2>المصانع والشركات <a href="factories.html" data-city="' + gov + '">' + esc(E('دليل مصانع ' + gN + ' ←', gNd + ' factory directory →')) + '</a></h2><p class="sub">' + scope(fC) + '</p><div class="cyf">' + (fH || '<p class="cyempty">لا توجد مصانع مسجّلة بعد. <a href="register.html">سجّل مصنعك</a></p>') + '</div></section>'
    + '<section class="card2" id="cy-prods"><h2>المنتجات <a href="market.html">السوق الإلكتروني ←</a></h2><p class="sub">' + esc(E('منتجات مصانع ' + (z.city || cityName) + ' ومحافظة ' + gN, 'Products of factories in ' + placeD + ' and ' + gNd + ' Governorate')) + '</p><div class="cyp">' + (prH || '<p class="cyempty">لا توجد منتجات منشورة بعد.</p>') + '</div></section>'
    + '<section class="card2" id="cy-projs"><h2>المشاريع القائمة <a href="projects.html">كل المشاريع ←</a></h2><p class="sub">' + esc(E('مشاريع تحتاج توريد منتجات في ' + gN, 'Projects that need supplies in ' + gNd)) + '</p><div class="cyl">' + (pH || '<p class="cyempty">لا توجد مشاريع منشورة في المحافظة حالياً.</p>') + '</div></section>';
  var others = Z.filter(function (x) { return x !== z && x.region_code === gov; });
  $("#cyA").innerHTML = '<div class="card2"><h2 style="font-size:1.02rem">روابط سريعة</h2><a class="btn btn-green" href="register.html">' + esc(E('سجّل مصنعك في ' + (z.city || cityName), 'Register your factory in ' + placeD)) + '</a><a class="btn btn-line" href="contact.html#rfq-form">📝 أرسل طلب عرض سعر</a><a class="btn btn-line" href="region.html#' + gov + '">' + esc(E('صفحة محافظة ' + gN, gNd + ' Governorate page')) + '</a><a class="btn btn-line" href="map.html">🗺️ خريطة المناطق الصناعية</a>' + (z.website ? '<a class="btn btn-line" href="' + esc(z.website) + '" target="_blank" rel="noopener">الموقع الرسمي ↗</a>' : '') + (z.source_url ? '<a class="btn btn-line" href="' + esc(z.source_url) + '" target="_blank" rel="noopener">المصدر ↗</a>' : '') + '</div>'
    + (others.length ? '<div class="card2 cyo"><h2 style="font-size:1.02rem">' + esc(E('مدن ومناطق أخرى في ' + gN, 'Other cities & zones in ' + gNd)) + '</h2>' + others.map(function (x) { return '<a href="city.html#' + x.id + '">📍 ' + esc(EN ? (x.name_en || T(x.name_ar)) : x.name_ar) + '</a>'; }).join("") + '</div>' : '');
  document.addEventListener("click", function (e) { var a = e.target.closest("[data-q]"); if (a) try { sessionStorage.setItem("mig-q", a.dataset.q); } catch (x) {} var c = e.target.closest("[data-city]"); if (c) try { sessionStorage.setItem("mig-city", c.dataset.city); } catch (x) {} });
  window.__seoDone = 1; setTimeout(function () { if (window.MIGSEO) MIGSEO(document.title, E(cityName + " في محافظة " + gN + ": الفرص والمناقصات والمصانع والمنتجات والمشاريع.", cityD + " in " + gNd + " Governorate: opportunities, tenders, factories, products and projects.").slice(0, 155), { "@context": "https://schema.org", "@type": "Place", name: cityName, address: { "@type": "PostalAddress", addressRegion: gN, addressCountry: "EG" }, geo: z.lat ? { "@type": "GeoCoordinates", latitude: z.lat, longitude: z.lon } : undefined }); }, 0);
}
window.addEventListener("hashchange", function () { location.reload(); });
''')
