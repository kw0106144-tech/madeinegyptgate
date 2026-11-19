# Retail offers: offers.html (all, filter by city/chain/category) and offer.html#id (one offer: store, branch, city, map, image, validity, source)
OCSS = COMMON_CSS + '''
.oftools { display: flex; gap: 8px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px; }
.oftools select, .oftools input { font: inherit; font-size: .88rem; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; background: var(--surface); color: var(--fg); }
.oftools input { flex: 1 1 200px; }
.ofgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.of { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; color: var(--fg); position: relative; transition: transform .2s ease, border-color .2s ease; }
.of:hover { transform: translateY(-3px); border-color: var(--gold); }
.of .im { aspect-ratio: 1; background: #fff; display: block; } .of .im img { width: 100%; height: 100%; object-fit: contain; }
.of .bdg { position: absolute; top: 8px; inset-inline: 8px; display: flex; flex-wrap: wrap; gap: 4px; z-index: 1; pointer-events: none; }
.of .off { background: #B42318; color: #fff; font-size: .72rem; font-weight: 800; border-radius: 6px; padding: 0 7px; z-index: 1; }
.of .sa { margin-inline-start: auto; background: var(--green); color: #fff; font-size: .66rem; font-weight: 800; border-radius: 6px; padding: 0 6px; z-index: 1; }
.of .tx { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); }
.of b.n { font-size: .8rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.8em; }
.of .pr { display: flex; gap: 6px; align-items: baseline; } .of .pr b { color: #B42318; } .of .pr s { color: var(--muted); font-size: .74rem; }
.of .st { font-size: .7rem; color: var(--green); font-weight: 700; } .of .dt { font-size: .68rem; color: var(--muted); }
.od { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 20px; align-items: start; }
.od .pic { background: #fff; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; position: relative; } .od .pic img { width: 100%; display: block; }
.od dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; font-size: .9rem; } .od dt { color: var(--muted); } .od dd { margin: 0; font-weight: 700; }
.od .big { display: flex; gap: 12px; align-items: baseline; } .od .big b { font-size: 2rem; color: #B42318; font-weight: 900; } .od .big s { color: var(--muted); }
.cities2 { display: flex; flex-wrap: wrap; gap: 6px; } .cities2 a { font-size: .78rem; background: var(--sunken); border-radius: 99px; padding: 2px 10px; color: var(--fg); }
.omap { position: relative; height: 260px; border-radius: 16px; overflow: hidden; border: 1px solid var(--line); background: #eef1f4; }
.omap canvas { width: 100%; height: 100%; display: block; }
@media (max-width: 1100px) { .ofgrid { grid-template-columns: repeat(3, 1fr); } .od { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .ofgrid { grid-template-columns: repeat(2, 1fr); } }
'''
# approximate city centres in Egypt ([lon, lat]) for the small offer map; governorate codes map to the governorate capital
_GEO = '{"CAI": [31.24, 30.04], "GIZ": [31.21, 30.01], "ALX": [29.92, 31.20], "QLB": [31.18, 30.46], "SHR": [31.50, 30.59], "DKH": [31.38, 31.04], "GHR": [31.00, 30.79], "MNF": [31.01, 30.56], "BHR": [30.47, 31.04], "KFS": [30.94, 31.11], "DMT": [31.81, 31.42], "PTS": [32.30, 31.26], "ISM": [32.27, 30.60], "SUZ": [32.53, 29.97], "NSN": [33.80, 31.13], "JSN": [33.62, 28.24], "FYM": [30.84, 29.31], "BNS": [31.10, 29.07], "MNY": [30.74, 28.11], "AST": [31.18, 27.18], "SHG": [31.69, 26.56], "QNA": [32.73, 26.16], "LXR": [32.64, 25.69], "ASN": [32.90, 24.09], "BBA": [33.81, 27.26], "WAD": [30.55, 25.44], "MTR": [27.24, 31.35], "مدينة نصر": [31.34, 30.06], "مصر الجديدة": [31.32, 30.09], "القاهرة الجديدة": [31.47, 30.03], "التجمع الخامس": [31.47, 30.01], "المعادي": [31.26, 29.96], "حلوان": [31.33, 29.85], "السادس من أكتوبر": [30.93, 29.96], "6 أكتوبر": [30.93, 29.96], "الشيخ زايد": [30.98, 30.04], "العبور": [31.47, 30.23], "شبرا الخيمة": [31.24, 30.13], "العاشر من رمضان": [31.74, 30.30], "المحلة الكبرى": [31.17, 30.97], "برج العرب": [29.69, 30.92], "العامرية": [29.80, 31.03], "العين السخنة": [32.35, 29.60], "الغردقة": [33.81, 27.26], "شرم الشيخ": [34.33, 27.92], "العلمين": [28.95, 30.83], "العلمين الجديدة": [28.95, 30.83]}'
OFF_JS = 'window.GEOC = ' + _GEO + ';\n' + r'''
/* offers data: prices in EGP (price_egp / old_price_egp); older builds used *_aed names for the same figures, read both */
function pe(o) { return o.price_egp != null ? o.price_egp : o.price_aed; }
function ope(o) { return o.old_price_egp != null ? o.old_price_egp : o.old_price_aed; }
function mie(o) { return o.made_in_egypt != null ? !!o.made_in_egypt : !!o.made_in_uae; }
function ocs(o) { return o.cities_ar || []; }
function isEN() { return window.MIGLANG === "en"; }
function fm(n) { return n == null ? n : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function brd(o) { return o.brand ? (isEN() ? o.brand.replace(/\s*\([\u0600-\u06FF\s]+\)/, "") : o.brand) : ""; }
function ocat(o) { return isEN() && o.category_en ? o.category_en : o.category_ar; }
function obr(o) { return isEN() && o.branch_en ? o.branch_en : o.branch_example; }
function geoOf(c) { var G = window.GEOC || {}; if (G[c]) return G[c]; var r = window.MIGREG ? MIGREG.of(c) : ""; return r ? G[r] : null; }
var SZEN = [[/المقاس\/اللون:/g, "Size/colour:"], [/للقطعة/g, "per piece"], [/للمتر المربع/g, "per m²"], [/أزواج/g, "pairs"], [/قطعتين/g, "2 pieces"], [/قطعة/g, "piece"], [/قطع/g, "pieces"], [/سم/g, "cm"], [/بوصة/g, "inch"], [/وات/g, "W"], [/حنفيتان/g, "2 taps"], [/شعلات/g, "burners"], [/لتر/g, "L"], [/كجم/g, "kg"], [/جم/g, "g"], [/مل/g, "ml"]];
function sz(o) { if (!o.size_unit || o.product_ar.indexOf(o.size_unit) > -1) return ''; var sn = (o.size_unit.match(/\d+(\.\d+)?/) || [])[0]; if (sn && new RegExp("(^|[^\\d.])" + sn.replace(".", "\\.") + "(?![\\d.])").test(o.product_ar)) return ''; var u = o.size_unit; if (window.MIGLANG === "en") SZEN.forEach(function (r) { u = u.replace(r[0], r[1]); }); return ' – ' + u; }
function offCard(o) { return '<a class="of" href="offer.html#' + o.id + '">' + '<span class="bdg">' + (o.discount_pct ? '<span class="off">خصم ' + o.discount_pct + '%</span>' : '') + (mie(o) ? '<span class="sa">🇪🇬 صنع في مصر</span>' : '') + '</span><span class="im">' + (o.img ? '<img src="' + o.img + '" alt="" loading="lazy">' : '') + '</span><span class="tx"><b class="n">' + o.product_ar + sz(o) + '</b><span class="pr"><b class="num">' + fm(pe(o)) + ' ج.م</b>' + (ope(o) ? '<s class="num">' + fm(ope(o)) + '</s>' : '') + '</span><span class="st">🏪 ' + o.store_ar + '</span><span class="dt">' + (o.valid_to ? (isEN() ? 'Valid until ' : 'حتى ') + o.valid_to : 'سعر المتجر الإلكتروني') + '</span></span></a>'; }
'''
PAGES['offers'] = ('آخر العروض – صنع في مصر', 'market', OCSS + '''
.ogr { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 14px; }
.ogr button { border: 1px solid var(--line); background: var(--surface); color: var(--fg); border-radius: 999px; padding: 8px 15px; font: inherit; font-weight: 700; font-size: .88rem; cursor: pointer; transition: background .2s ease, border-color .2s ease; }
.ogr button small { background: var(--bg2, #f3eef0); border-radius: 999px; padding: 1px 8px; margin-inline-start: 4px; font-size: .74rem; }
.ogr button:hover { border-color: var(--green); }
.ogr button.on { background: var(--green); border-color: var(--green); color: #fff; } .ogr button.on small { background: rgba(255,255,255,.2); }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="oftools"><input type="search" id="oq" placeholder="ابحث عن منتج أو علامة…" aria-label="بحث"><select id="ocity" aria-label="المدينة"><option value="">كل المدن</option></select><select id="ostore" aria-label="المتجر"><option value="">كل المتاجر</option></select><select id="ocat" aria-label="القسم"><option value="">كل الأقسام</option></select><label class="chip chip-gray" style="cursor:pointer"><input type="checkbox" id="osa"> صنع في مصر فقط</label><span class="chip chip-green" id="ocnt"></span></div>
  <div class="ogr" id="ogr" role="tablist" aria-label="أقسام العروض"></div>
  <div class="ofgrid" id="ogrid"></div>
  <span class="note2" id="onote"></span>
</main>
''', OFF_JS + r'''
var O = (window.MIGOFFERS || []).map(function (o) { if (window.MIGLANG === "en" && o.product_en && !o._en) { o._en = 1; o.store_ar0 = o.store_ar; o.product_ar = o.product_en; if (o.store_en) o.store_ar = o.store_en; } return o; });
function uniq(f) { var u = []; O.forEach(function (o) { [].concat(f(o)).forEach(function (x) { if (x && u.indexOf(x) < 0) u.push(x); }); }); return u.sort(function (a, b) { return a.localeCompare(b, "ar"); }); }
$("#ocity").innerHTML += uniq(function (o) { return ocs(o).filter(function (c) { return c !== "جميع الفروع"; }); }).map(function (c) { return "<option>" + c + "</option>"; }).join("");
$("#ostore").innerHTML += uniq(function (o) { return o.store_ar; }).map(function (c) { return "<option>" + c + "</option>"; }).join("");
var GR = [["", "كل العروض"], ["food", "🛒 أغذية ومشروبات"], ["fashion", "👕 ملابس وأحذية"], ["home", "🛏️ مفروشات وأثاث"], ["build", "🧱 مواد بناء وأدوات صحية"], ["tech", "📺 أجهزة وإلكترونيات"], ["care", "🧴 منظفات وعناية"]], G = "";
function grp(o) { var c = o.category_ar || ""; return /ملابس|أحذية/.test(c) ? "fashion" : /مفروشات|أثاث|مراتب/.test(c) ? "home" : /سيراميك|أدوات صحية|خلاطات|حمامات|مواد بناء/.test(c) ? "build" : /أجهزة|تلفزيون|إلكترونيات|تكييف/.test(c) ? "tech" : /منظفات|عناية/.test(c) ? "care" : "food"; }
try { var g0 = (location.hash || "").slice(1); if (GR.some(function (g) { return g[0] && g[0] === g0; })) G = g0; } catch (e) {}
$("#ogr").innerHTML = GR.map(function (g) { var n = g[0] ? O.filter(function (o) { return grp(o) === g[0]; }).length : O.length; return n ? '<button type="button" data-g="' + g[0] + '"' + (g[0] === G ? ' class="on"' : '') + '>' + g[1] + ' <small>' + n + '</small></button>' : ''; }).join("");
$("#ogr").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; G = b.dataset.g; $$("#ogr button").forEach(function (x) { x.classList.toggle("on", x === b); }); render(); });
var CL = {}; O.forEach(function (o) { CL[o.category_ar] = ocat(o); });
$("#ocat").innerHTML += uniq(function (o) { return o.category_ar; }).sort(function (a, b) { return CL[a].localeCompare(CL[b], isEN() ? "en" : "ar"); }).map(function (c) { return '<option value="' + c + '">' + CL[c] + "</option>"; }).join("");
try { var st0 = /^store=/.test(g0) ? decodeURIComponent(g0.slice(6)) : ""; if (st0) { var so = O.filter(function (o) { return o.store_ar === st0 || o.store_ar0 === st0 || o.store_en === st0; })[0]; if (so) $("#ostore").value = so.store_ar; } } catch (e) {}
try { var c0 = sessionStorage.getItem("mig-ocity"); if (c0) { $("#ocity").value = c0; sessionStorage.removeItem("mig-ocity"); } } catch (e) {}
function render() { var q = $("#oq").value.trim(), c = $("#ocity").value, s = $("#ostore").value, k = $("#ocat").value, sa = $("#osa").checked;
  var l = O.filter(function (o) { return (!q || (o.product_ar + " " + (o.brand || "") + " " + (o.product_en || "") + " " + (o.store_en || "") + " " + (o.store_ar0 || "") + " " + (o.category_en || "") + (window.MIGHAY ? MIGHAY(o.category_ar) : "")).toLowerCase().indexOf(q.toLowerCase()) > -1) && (!c || ocs(o).indexOf(c) > -1 || (ocs(o).indexOf("جميع الفروع") > -1 && ocs(o).length === 1)) && (!s || o.store_ar === s) && (!k || o.category_ar === k) && (!G || grp(o) === G) && (!sa || mie(o)); }).sort(function (a, b) { return mie(b) - mie(a) || (b.discount_pct || 0) - (a.discount_pct || 0); });
  $("#ocnt").textContent = l.length + " عرض"; $("#ogrid").innerHTML = l.map(offCard).join("") || '<div class="card2" style="grid-column:1/-1">لا توجد عروض بهذا البحث.</div>'; }
["#oq"].forEach(function (i) { $(i).addEventListener("input", render); }); ["#ocity", "#ostore", "#ocat", "#osa"].forEach(function (i) { $(i).addEventListener("change", render); });
$("#onote").textContent = "العروض من نشرات ومواقع المتاجر الرسمية، آخر تحديث " + (O[0] ? O[0].source_checked : "") + ". الأسعار والتواريخ كما نشرها المتجر، وقد تختلف بين الفروع.";
render();
''')
HEROS['offers'] = ('m2.jpg', '<a href="market.html">السوق</a> › آخر العروض', 'آخر العروض في منافذ البيع', 'عروض حقيقية من منافذ البيع في محافظات مصر، والأولوية للمنتجات المصنوعة في مصر. اختر مدينتك أو متجرك، واضغط على العرض لمعرفة مكانه وتفاصيله.', '<a class="btn btn-gold" href="#ogrid">تصفّح العروض</a>')

PAGES['offer'] = ('تفاصيل العرض – صنع في مصر', 'market', OCSS, '''
<section class="phero"><span class="bg" style="background-image:url(img/m2.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="offers.html">آخر العروض</a></nav><h1 id="oT">عرض</h1><p id="oS"></p></div></section>
<main class="wrap pbody2" id="top"><div id="od"></div><div><h2 style="font-size:1.1rem;margin-bottom:10px">عروض أخرى في نفس المتجر</h2><div class="ofgrid" id="omore"></div></div></main>
''', OFF_JS + r'''
var O = (window.MIGOFFERS || []).map(function (o) { if (window.MIGLANG === "en" && o.product_en && !o._en) { o._en = 1; o.product_ar = o.product_en; if (o.store_en) o.store_ar = o.store_en; } return o; }), id = decodeURIComponent((location.hash || "").slice(1)), o = O.filter(function (x) { return x.id === id; })[0];
if (!o) { $("#od").innerHTML = '<div class="card2">لم يُعثر على العرض. <a href="offers.html">كل العروض ←</a></div>'; $("#oT").textContent = isEN() ? "Offer not available" : "العرض غير متاح"; $("#omore").parentNode.style.display = "none"; }
else {
  if (window.MIGINQ) MIGINQ.ctx({ type: "offer", id: String(o.id), title: o.product_ar + " – " + o.store_ar, url: "offer.html#" + o.id });
  document.title = o.product_ar + (isEN() ? " – Offer at " : " – عرض ") + o.store_ar; window.__seoDone = 1; setTimeout(function () { MIGSEO(document.title, isEN() ? o.product_ar + sz(o) + " for " + fm(pe(o)) + " EGP" + (ope(o) ? " (was " + fm(ope(o)) + " EGP)" : "") + " at " + o.store_ar + (o.valid_to ? ", valid until " + o.valid_to : "") + "." : "عرض " + o.product_ar + sz(o) + " بسعر " + pe(o) + " جنيه" + (ope(o) ? " بدلاً من " + ope(o) : "") + " في " + o.store_ar + (o.valid_to ? " حتى " + o.valid_to : "") + ".", { "@context": "https://schema.org", "@type": "Product", "name": o.product_ar, "brand": o.brand ? { "@type": "Brand", "name": o.brand } : undefined, "image": o.img ? "https://madeinegyptgate.com/" + o.img : undefined, "countryOfOrigin": mie(o) ? "EG" : undefined, "offers": { "@type": "Offer", "price": pe(o), "priceCurrency": "EGP", "availability": "https://schema.org/InStock", "validFrom": o.valid_from || undefined, "priceValidUntil": o.valid_to || undefined, "seller": { "@type": "Organization", "name": o.store_ar } } }); }, 0); $("#oT").textContent = o.product_ar; $("#oS").textContent = o.store_ar + " · " + (obr(o) || (isEN() ? "All branches" : "جميع الفروع"));
  var cs = ocs(o).filter(function (c) { return c !== "جميع الفروع"; });
  $("#od").innerHTML = '<div class="od"><div class="pic">' + (o.discount_pct ? '<span class="off" style="position:absolute;top:12px;inset-inline-start:12px;background:#B42318;color:#fff;border-radius:8px;padding:2px 10px;font-weight:800">خصم ' + o.discount_pct + '%</span>' : '') + (o.img ? '<img src="' + o.img + '" alt="' + o.product_ar + '">' : '') + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:14px;min-width:0"><div class="card2">' + (mie(o) ? '<span class="chip chip-green" style="align-self:flex-start">🇪🇬 صنع في مصر</span>' : '') + '<h2>' + o.product_ar + sz(o) + '</h2>' + (o.product_en ? '<small class="muted" dir="ltr" style="text-align:right">' + o.product_en + '</small>' : '') + '<div class="big"><b class="num">' + fm(pe(o)) + ' ج.م</b>' + (ope(o) ? '<s class="num">' + fm(ope(o)) + ' ج.م</s>' : '') + '</div>'
    + '<dl><dt>العلامة</dt><dd>' + (brd(o) || "—") + '</dd><dt>القسم</dt><dd>' + ocat(o) + '</dd><dt>المتجر</dt><dd>' + o.store_ar + (o.store_en && o.store_en !== o.store_ar ? ' <small class="muted">(' + o.store_en + ')</small>' : '') + '</dd><dt>الفرع</dt><dd>' + (obr(o) || "جميع الفروع / المتجر الإلكتروني") + '</dd><dt>صلاحية العرض</dt><dd>' + (o.valid_to ? (o.valid_from ? '<span class="num">' + o.valid_from + '</span> <span>إلى</span> ' : '<span>حتى</span> ') + '<span class="num">' + o.valid_to + '</span>' : o.valid_from ? (isEN() ? 'From ' + o.valid_from + ' (end date not specified)' : 'من ' + o.valid_from + ' (تاريخ الانتهاء غير محدد)') : 'غير محددة من المتجر (سعر المتجر الإلكتروني)') + '</dd>' + '<dt>المصدر</dt><dd><a href="' + o.source_url + '" target="_blank" rel="noopener">نشرة / صفحة العرض الرسمية ↗</a> <small class="muted">· تم التحقق ' + o.source_checked + '</small></dd></dl></div>'
    + '<div class="card2"><h2>📍 أين يتوفر العرض؟</h2><div class="omap"><canvas id="omap"></canvas></div><div class="cities2">' + (cs.length ? cs.map(function (c) { return '<a href="offers.html" data-oc="' + c + '">' + c + '</a>'; }).join("") : '<span class="muted">جميع الفروع / التوصيل داخل مصر</span>') + '</div>' + (o.lat ? '<a class="btn btn-line btn-sm" style="align-self:flex-start" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.store_ar + " " + (o.branch_example || cs[0] || "")) + '">افتح الفرع في خرائط Google ↗</a>' : '') + '<span class="note2">الموقع على الخريطة تقريبي (مركز المدينة أو الحي).</span></div></div></div>';
  $("#omore").innerHTML = O.filter(function (x) { return x.store_ar === o.store_ar && x.id !== o.id; }).slice(0, 5).map(offCard).join("");
  document.addEventListener("click", function (e) { var a = e.target.closest("[data-oc]"); if (a) { try { sessionStorage.setItem("mig-oc" + "ity", a.dataset.oc); } catch (x) {} } });
  /* small map: Egypt outline + offer location */
  (function () { var c = $("#omap"); if (!c || !window.WORLD) return; var r = c.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; var x = c.getContext("2d"); x.scale(d, d); var W = r.width, H = r.height, B = [24.6, 21.8, 37.0, 31.8];
    function m(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); } var y0 = m(B[1]), y1 = m(B[3]), sc = Math.min(W / (B[2] - B[0]), H / ((y1 - y0) * 180 / Math.PI)) * .92, ox = (W - (B[2] - B[0]) * sc) / 2, oy = (H - (y1 - y0) * 180 / Math.PI * sc) / 2;
    function P(lo, la) { return [W - (ox + (lo - B[0]) * sc) - 0, oy + (y1 - m(la)) * 180 / Math.PI * sc]; }
    function Pm(lo, la) { var p = P(lo, la); return [W - p[0], p[1]]; }
    WORLD.forEach(function (f) { x.beginPath(); f.c.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt, i) { var p = Pm(pt[0], pt[1]); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); }); }); x.fillStyle = f.id === "818" ? "#C8102E" : "#dcd6d2"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = .6; x.stroke(); });
    cs.forEach(function (cn) { var g = geoOf(cn); if (!g) return; var p = Pm(g[0], g[1]); x.beginPath(); x.arc(p[0], p[1], 4, 0, 7); x.fillStyle = "rgba(192,147,0,.6)"; x.fill(); });
    if (o.lat) { var p = Pm(o.lon, o.lat); x.beginPath(); x.arc(p[0], p[1], 9, 0, 7); x.fillStyle = "rgba(180,35,24,.25)"; x.fill(); x.beginPath(); x.arc(p[0], p[1], 5, 0, 7); x.fillStyle = "#B42318"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke(); x.font = "700 12px Cairo"; x.fillStyle = "#0F172A"; x.textAlign = "center"; x.fillText(obr(o) || "", p[0], p[1] - 14); }
  })();
}
window.addEventListener("hashchange", function () { location.reload(); });
''')
