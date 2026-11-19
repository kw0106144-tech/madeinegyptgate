# Suppliers directory (suppliers.html) and retail outlets (outlets.html)
SEL_CSS = COMMON_CSS + '''
.sgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.sc { display: flex; flex-direction: column; gap: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; color: var(--fg); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.sc:hover { transform: translateY(-3px); border-color: var(--green); box-shadow: 0 16px 28px -22px rgba(0,0,0,.5); }
.sc .top { display: flex; gap: 12px; align-items: center; }
.sc .l { width: 60px; height: 60px; border-radius: 12px; flex: none; background: #fff center / contain no-repeat; border: 1px solid var(--line); display: grid; place-items: center; font-weight: 900; color: var(--green); font-size: 1.4rem; }
.sc .l.sp { background-size: 1000% 1000%; }
.sc h3 { font-size: .98rem; line-height: 1.45; margin: 0; }
.sc small { color: var(--muted); font-size: .8rem; }
.sc p { font-size: .84rem; color: var(--muted); line-height: 1.7; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.sc .go { margin-top: auto; font-weight: 800; color: var(--green); font-size: .86rem; }
.stools { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.stools input, .stools select { font: inherit; border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; background: var(--surface); color: var(--fg); min-width: 180px; }
.stools input { flex: 1; }
.ostore { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.os { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; }
.os .hd { padding: 16px 18px; background: linear-gradient(135deg, var(--green), var(--green-deep, #7A0A1C)); color: #fff; }
.os .hd h3 { margin: 0; font-size: 1.1rem; } .os .hd small { opacity: .85; }
.os .pr { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px; }
.os .pr a { display: block; aspect-ratio: 1; border-radius: 10px; border: 1px solid var(--line); background: #fff center / contain no-repeat; }
.os .ft { padding: 0 16px 16px; display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }
.os .ft .btn { flex: 1; justify-content: center; }
.os .stat { display: flex; gap: 14px; padding: 0 18px; font-size: .84rem; color: var(--muted); } .os .stat b { color: var(--fg); }
'''
PAGES['suppliers'] = ('الموردون – صنع في مصر', 'factories', SEL_CSS, '''%HERO%
<main class="wrap pbody2" id="top">
  <div class="stools"><input type="search" id="sq" placeholder="ابحث باسم المورد أو المنتج…" aria-label="بحث"><select id="ss" aria-label="القطاع"><option value="">كل القطاعات</option></select><select id="se" aria-label="المحافظة"><option value="">كل المحافظات</option></select></div>
  <p class="muted" id="scnt" style="margin-bottom:12px"></p>
  <div class="sgrid" id="sgrid"></div>
  <div style="text-align:center;margin-top:16px"><button type="button" class="btn btn-line" id="sMore" hidden><span>عرض المزيد</span> <span class="num" id="sMoreN"></span></button></div>
</main>
''', r'''
/* governorate names come from the shared list of the 27 governorates (data/regions.js) */
var EMN = {}; ((window.MIGREG && MIGREG.list) || []).forEach(function (r) { EMN[r[0]] = r[1]; });
/* the old site's sector labels: merge abbreviations and near-duplicates into one label per sector */
var SECN = { "ص.معدنية": "المعادن والمشغولات المعدنية", "مسبوكات معدنية": "المعادن والمشغولات المعدنية", "صناعات بلاستيكية": "الصناعات البلاستيكية", "أثاث الخشبي": "الأثاث المنزلي والفندقي", "اثاث منزلى وفندقى ومطاعم (خشبي و معدني )": "الأثاث المنزلي والفندقي", "منظفات وأصباغ": "صناعة المنظفات والصابون والمطهرات", "كيماويات بناء": "صناعة المواد العازلة وكيماويات البناء والحراريات", "الهيدروليك والآلات": "أنظمة هيدروليك ونيوماتيك وخراطيم", "الماكينات والمعدات والألات الهندسية": "صناعة الماكينات والمعدات والأجهزة وقطع الغيار", "قطع الغيار ومستلزمات نقل الحركة": "قطع غيار وسيور وتروس ورومان بلي وزيوت", "الأجهزة والمعدات الكهربية": "صناعة الأجهزة الكهربائية والأدوات المنزلية", "ادوات منزليه": "صناعة الأجهزة الكهربائية والأدوات المنزلية", "أنظمة مكافحة حرائق": "صناعة الأمن الصناعي ومكافحة وإنذار الحريق والسرقة", "أنظمة الأمان والحلول الأمنية": "صناعة الأمن الصناعي ومكافحة وإنذار الحريق والسرقة", "صناعة الزجاج ومنتجاته ومستلزماته": "زجاج ومرايات واكسسواراتهم", "استشارات ماليه": "استشارات وحلول وخدمات وصيانة", "حلول رقميه": "استشارات وحلول وخدمات وصيانة" };
function sec(o) { return SECN[o[1]] || o[1]; }
function snm(o) { var n = String(o[0] || ""); if (window.MIGLANG === "en" && window.MIGTR) { var t = MIGTR(n); if (t) n = t; } return n.replace(/^[^0-9A-Za-z\u0621-\u064A]+/, ""); }
/* avatar letter from the name as displayed (English translation in English mode), skipping "شركة / Company / El / Al" */
function ini(o) { var n = snm(o).replace(/^(شركة|شركه|مؤسسة|مصنع|the|company|co\.?|el|al)[\s\-]+/i, ""); var m = n.match(/[0-9A-Za-z\u0621-\u064A]/); return m ? m[0].toUpperCase() : "🏭"; }
var L = (window.MIGOLDFAC || []).map(function (o, i) { return [o, i]; }).filter(function (a) { return a[0][3] !== "مصنع"; });
function pos(c) { return (c % 10) * 100 / 9 + "% " + Math.floor(c / 10) * 100 / 9 + "%"; }
function esc(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
var secs = []; L.forEach(function (a) { if (secs.indexOf(sec(a[0])) < 0) secs.push(sec(a[0])); });
$("#ss").innerHTML += secs.sort().map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("");
$("#se").innerHTML += Object.keys(EMN).map(function (k) { return '<option value="' + k + '">' + EMN[k] + '</option>'; }).join("");
/* search text: name, sector, products, about, plus their English translation in English mode (cached per row) */
function hay(a) { var o = a[0]; return a[2] || (a[2] = [o[0], sec(o), (o[9] || []).join(" "), o[8]].map(function (s) { s = String(s || ""); return s + " " + (window.MIGHAY ? MIGHAY(s) : ""); }).join(" ").toLowerCase()); }
/* query handed over by the home search */
try { var q0 = sessionStorage.getItem("mig-q"); if (q0) { $("#sq").value = q0; sessionStorage.removeItem("mig-q"); } } catch (x) {}
var SHOWN = 48;
function render(more) {
  SHOWN = more ? SHOWN + 48 : 48;
  var q = $("#sq").value.trim().toLowerCase(), s = $("#ss").value, e = $("#se").value;
  var l = L.filter(function (a) { var o = a[0]; return (!s || sec(o) === s) && (!e || o[10] === e) && (!q || hay(a).indexOf(q) > -1); });
  $("#scnt").textContent = l.length + " مورداً";
  var rest = l.length - SHOWN; $("#sMore").hidden = rest <= 0; $("#sMoreN").textContent = "(" + rest + ")";
  $("#sgrid").innerHTML = l.slice(0, SHOWN).map(function (a) { var o = a[0]; return '<a class="sc" href="company.html#' + a[1] + '"><span class="top"><span class="l' + (o[5] >= 0 ? ' sp" style="background-image:url(img/old/lg' + o[5] + '.jpg);background-position:' + pos(o[6]) + '">' : '">' + esc(ini(o))) + '</span><span style="min-width:0"><h3>' + esc(snm(o)) + '</h3><small>🏷️ ' + esc(sec(o)) + ' · 📍 ' + esc(EMN[o[10]] || o[2]) + '</small></span></span><p>' + esc(o[8] || "") + '</p><span class="go">ملف المورد ←</span></a>'; }).join("") || '<div class="card2">لا توجد نتائج مطابقة.</div>';
}
var sqT; $("#sq").addEventListener("input", function () { clearTimeout(sqT); sqT = setTimeout(function () { render(); }, 200); });
["#ss", "#se"].forEach(function (id) { $(id).addEventListener("change", function () { render(); }); });
$("#sMore").addEventListener("click", function () { render(true); });
render();
''')
HEROS['suppliers'] = ('m3.jpg', '<a href="factories.html">دليل المصانع</a> › الموردون', 'الموردون', 'الموردون والشركات التجارية المسجّلة في منصة صنع في مصر: مواد خام ومعدات وخدمات صناعية من محافظات مصر الـ27.', '<a class="btn btn-gold" href="register.html">سجّل كمورد ←</a>')

PAGES['outlets'] = ('منافذ البيع – صنع في مصر', 'market', SEL_CSS, '''%HERO%
<main class="wrap pbody2" id="top">
  <p class="muted" style="margin-bottom:14px">منافذ البيع بالتجزئة والجمعيات التعاونية التي تعرض منتجات مصنوعة في مصر، مع أحدث العروض المرصودة على منتجات المصانع الوطنية.</p>
  <div class="ostore" id="ost"></div>
</main>
''', r'''
var O = window.MIGOFFERS || [], G = {};
O.forEach(function (o) { var k = o.store_ar || o.store_en; if (!G[k]) G[k] = { n: k, en: o.store_en, c: [], items: [], site: "" }; var g = G[k]; g.items.push(o); (o.cities_ar || []).forEach(function (c) { if (g.c.indexOf(c) < 0) g.c.push(c); }); if (!g.site && o.source_url) { try { g.site = new URL(o.source_url).origin; } catch (x) {} } });
function esc(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
/* Arabic noun after a number: 1, 2, 3–10, 11+ (English: singular / plural) */
function pl(n, f) { return window.MIGLANG === "en" ? (n === 1 ? f[4] : f[5]) : n === 2 ? f[1] : n >= 3 && n <= 10 ? f[2] : n >= 11 ? f[3] : f[0]; }
var PLO = ["عرض", "عرضان", "عروض", "عرضاً", "offer", "offers"], PLM = ["منتج مصري", "منتجان مصريان", "منتجات مصرية", "منتجاً مصرياً", "Egyptian product", "Egyptian products"];
var S = Object.keys(G).map(function (k) { return G[k]; }).sort(function (a, b) { return b.items.length - a.items.length; });
$("#ost").innerHTML = S.map(function (g) { var made = g.items.filter(function (o) { return o.made_in_egypt != null ? !!o.made_in_egypt : !!o.made_in_uae; }).length, best = Math.max.apply(null, g.items.map(function (o) { return o.discount_pct || 0; }));
  return '<div class="os"><div class="hd"><h3>🏬 ' + esc(g.n) + '</h3><small>' + esc(g.en || "") + (g.c.length ? ' · 📍 ' + esc(g.c.join("، ")) : '') + '</small></div>'
    + '<div class="pr">' + g.items.slice(0, 8).map(function (o) { return '<a href="offer.html#' + esc(o.id) + '" title="' + esc(o.product_ar) + '" style="background-image:url(' + esc(o.img || o.image_file) + ')"></a>'; }).join("") + '</div>'
    + '<div class="stat"><span><b>' + g.items.length + '</b> ' + pl(g.items.length, PLO) + '</span><span><b>' + made + '</b> ' + pl(made, PLM) + '</span>' + (best ? '<span>خصم حتى <b>' + best + '%</b></span>' : '') + '</div>'
    + '<div class="ft" style="margin-top:12px"><a class="btn btn-green" href="offers/search/#store=' + encodeURIComponent(g.n) + '">عروض المنفذ ←</a>' + (g.site ? '<a class="btn btn-line" href="' + esc(g.site) + '" target="_blank" rel="noopener">موقع المنفذ ↗</a>' : '') + '</div></div>'; }).join("") || '<div class="card2">لا توجد منافذ حالياً.</div>';
''')
HEROS['outlets'] = ('m2.jpg', '<a href="market.html">السوق</a> › منافذ البيع', 'منافذ البيع', 'الهايبر ماركت والجمعيات الاستهلاكية التي تبيع المنتج المصري، وعروضها الحالية على منتجات المصانع الوطنية.', '<a class="btn btn-gold" href="register.html">سجّل منفذ البيع ←</a>')
