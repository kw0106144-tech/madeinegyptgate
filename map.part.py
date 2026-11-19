# Opportunities map: map.html — every opportunity per city on the 3D map + compact charts + informative tables
PAGES['map'] = ('خريطة الفرص – صنع في مصر', 'cities', COMMON_CSS + '''
.mk2 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.mk2 div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; border-top: 3px solid var(--green); }
.mk2 b { display: block; font-size: 1.35rem; font-weight: 900; color: var(--green); font-variant-numeric: tabular-nums; }
.mk2 span { font-size: .74rem; color: var(--muted); font-weight: 700; }
.ch3 { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; }
.cc { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cc h3 { font-size: .88rem; font-weight: 800; } .cc h3 small { font-weight: 600; color: var(--muted); font-size: .7rem; }
.hb3 { display: grid; grid-template-columns: 96px 1fr 28px; gap: 6px; align-items: center; font-size: .74rem; }
.hb3 .t { height: 8px; background: var(--sunken); border-radius: 4px; overflow: hidden; } .hb3 .t i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(270deg, var(--green), #F0566A); }
.hb3 button { all: unset; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hb3 button:hover { color: var(--green); }
.stk { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--sunken); }
.stk i { display: block; height: 100%; }
.lg3 { display: flex; flex-direction: column; gap: 4px; font-size: .74rem; }
.lg3 span { display: flex; align-items: center; gap: 6px; } .lg3 i { width: 9px; height: 9px; border-radius: 2px; } .lg3 b { margin-inline-start: auto; }
.tb-tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.tb-tools input, .tb-tools select { font: inherit; font-size: .85rem; border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; background: var(--surface); color: var(--fg); }
.tb-tools input { flex: 1 1 200px; }
.tw4 { overflow: auto; max-height: 560px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.tw4 table { width: 100%; min-width: 900px; border-collapse: separate; border-spacing: 0; font-size: .82rem; }
.tw4 th, .tw4 td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: start; white-space: nowrap; }
.tw4 thead th { position: sticky; top: 0; background: var(--sunken); font-size: .74rem; color: var(--muted); cursor: pointer; z-index: 1; user-select: none; }
.tw4 thead th.on { color: var(--green); }
.tw4 tbody tr { cursor: pointer; } .tw4 tbody tr:hover td, .tw4 tbody tr.sel td { background: var(--green-soft); }
.tw4 td.n { font-variant-numeric: tabular-nums; font-weight: 800; }
.tw4 .z { color: var(--muted); font-weight: 600; }
.tw4 .mini { display: inline-block; height: 6px; border-radius: 3px; background: var(--gold); vertical-align: middle; margin-inline-start: 6px; }
.cdet { background: var(--surface); border: 1px solid var(--green); border-radius: 16px; padding: 14px 16px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.cdet > h3 { grid-column: 1 / -1; font-size: 1.05rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cdet > h3 a { font-size: .8rem; font-weight: 700; }
.cdet section { min-width: 0; } .cdet section h4 { font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
.cdet ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow: auto; }
.cdet li { font-size: .78rem; line-height: 1.5; background: var(--sunken); border-radius: 8px; padding: 5px 8px; }
.cdet li a { color: var(--fg); } .cdet li a:hover { color: var(--green); } .cdet li small { display: block; color: var(--muted); font-size: .7rem; }
@media (max-width: 1000px) { .mk2 { grid-template-columns: repeat(3, 1fr); } .ch3 { grid-template-columns: 1fr; } .cdet { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .mk2, .cdet { grid-template-columns: 1fr 1fr; } }
''', '''
%HERO%
<script src="data/oldrfq.js"></script>
<main class="wrap pbody2" id="top">
  <div class="mk2" id="mk2"></div>
  <div id="mapX"></div>
  <div class="ch3">
    <div class="cc"><h3>أعلى المدن والمناطق فرصاً <small>· اضغط على أي موقع</small></h3><div id="chTop" style="display:flex;flex-direction:column;gap:5px"></div></div>
    <div class="cc"><h3>الفرص حسب المحافظة</h3><div id="chReg" style="display:flex;flex-direction:column;gap:5px;max-height:330px;overflow:auto"></div></div>
    <div class="cc"><h3>تركيبة الفرص</h3><div class="stk" id="chMix"></div><div class="lg3" id="chMixL"></div><h3 style="margin-top:6px">أبرز القطاعات المطلوبة</h3><div class="stk" id="chSec"></div><div class="lg3" id="chSecL"></div></div>
  </div>
  <div id="cdetW"></div>
  <div class="card2">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h2>📋 جدول الفرص حسب المدينة والمنطقة</h2><div class="tb-tools"><input type="search" id="tq" placeholder="ابحث عن مدينة أو منطقة…" aria-label="بحث"><select id="treg" aria-label="المحافظة"></select><span class="chip chip-gray" id="tcnt"></span></div></div>
    <div class="tw4"><table><thead><tr><th data-k="name">المدينة / المنطقة</th><th data-k="reg">المحافظة</th><th data-k="open" class="on">مناقصات مفتوحة ▼</th><th data-k="tend">كل المناقصات</th><th data-k="rfq">طلبات أسعار</th><th data-k="proj">مشاريع</th><th data-k="val">قيمة المشاريع</th><th data-k="fac">مصانع</th><th data-k="zon">مناطق صناعية وحرة</th><th data-k="total">الإجمالي</th><th>أبرز القطاعات</th></tr></thead><tbody id="tb"></tbody></table></div>
  </div>
  <span class="note2">يُجمع الجدول من المناقصات المنشورة (بمصادرها الرسمية)، وطلبات عروض الأسعار، والمشاريع، والمصانع المسجّلة، والمناطق الصناعية والحرة والاستثمارية والموانئ في محافظات مصر الـ27. مواقع المدن والمناطق على الخريطة تقريبية.</span>
</main>
''', r'''
/* Egyptian industrial cities, industrial / free / investment zones, ports and governorate capitals
   (approximate coordinates from public sources: IDA, GAFI, SCZone, OpenStreetMap, Wikipedia).
   name: [lon, lat, governorate code, aliases matched inside any city/address text].
   Specific areas first, governorates last (keyed by the governorate name, placed on its capital). */
var GEO = {
  "مدينة بدر والروبيكي": [31.74, 30.14, "CAI", ["مدينة بدر", "بدر", "Badr", "الروبيكي", "Robbiki"]],
  "العاصمة الإدارية الجديدة": [31.76, 30.02, "CAI", ["العاصمة الإدارية", "New Administrative Capital"]],
  "القاهرة الجديدة": [31.49, 30.0, "CAI", ["القاهرة الجديدة", "التجمع", "New Cairo"]],
  "مدينة نصر": [31.35, 30.05, "CAI", ["مدينة نصر", "Nasr City"]],
  "المعادي": [31.26, 29.96, "CAI", ["المعادي", "Maadi"]],
  "حلوان و15 مايو": [31.34, 29.84, "CAI", ["حلوان", "Helwan", "15 مايو", "التبين"]],
  "أكتوبر الجديدة": [30.69, 29.78, "GIZ", ["أكتوبر الجديدة", "اكتوبر الجديدة", "New October"]],
  "السادس من أكتوبر": [30.93, 29.95, "GIZ", ["السادس من أكتوبر", "6 أكتوبر", "6 اكتوبر", "أكتوبر", "اكتوبر", "October", "الشيخ زايد", "Sheikh Zayed"]],
  "أبو رواش والقرية الذكية": [31.03, 30.07, "GIZ", ["أبو رواش", "ابو رواش", "Abu Rawash", "كرداسة", "القرية الذكية", "Smart Village", "الإسكندرية الصحراوي"]],
  "برج العرب الجديدة": [29.61, 30.85, "ALX", ["برج العرب", "Borg El Arab"]],
  "العامرية ومرغم": [29.8, 31.05, "ALX", ["العامرية", "مرغم", "Amreya", "Amriya"]],
  "الدخيلة": [29.81, 31.13, "ALX", ["الدخيلة", "Dekheila"]],
  "أبو قير": [30.06, 31.32, "ALX", ["أبو قير", "ابو قير", "Abu Qir"]],
  "شبرا الخيمة": [31.24, 30.13, "QLB", ["شبرا الخيمة", "Shubra El Kheima", "Shubra El-Kheima"]],
  "العبور": [31.46, 30.21, "QLB", ["العبور", "Obour"]],
  "الخانكة وأبو زعبل": [31.37, 30.23, "QLB", ["الخانكة", "أبو زعبل", "ابو زعبل", "العكرشة", "Khanka"]],
  "العاشر من رمضان": [31.75, 30.29, "SHR", ["العاشر من رمضان", "العاشر", "10th of Ramadan", "Tenth of Ramadan"]],
  "الصالحية الجديدة": [31.9, 30.64, "SHR", ["الصالحية", "Salhia"]],
  "بلبيس": [31.56, 30.42, "SHR", ["بلبيس", "Belbeis", "Bilbeis"]],
  "جمصة": [31.49, 31.44, "DKH", ["جمصة", "Gamasa"]],
  "ميت غمر": [31.26, 30.72, "DKH", ["ميت غمر", "Mit Ghamr"]],
  "المحلة الكبرى": [31.16, 30.97, "GHR", ["المحلة", "Mahalla"]],
  "كفر الزيات": [30.82, 30.82, "GHR", ["كفر الزيات", "Kafr El Zayat"]],
  "مدينة السادات": [30.59, 30.4, "MNF", ["السادات", "Sadat"]],
  "قويسنا": [31.18, 30.54, "MNF", ["قويسنا", "Quesna", "Qwesna"]],
  "كفر الدوار": [30.13, 31.13, "BHR", ["كفر الدوار", "Kafr El Dawwar"]],
  "دمياط الجديدة": [31.69, 31.42, "DMT", ["دمياط الجديدة", "New Damietta"]],
  "شرق بورسعيد": [32.36, 31.17, "PTS", ["شرق بورسعيد", "شرق بور سعيد", "East Port Said"]],
  "القنطرة غرب": [32.28, 30.74, "ISM", ["القنطرة", "Qantara"]],
  "وادي التكنولوجيا": [32.41, 30.58, "ISM", ["شرق الإسماعيلية", "وادي التكنولوجيا", "Technology Valley"]],
  "العين السخنة": [32.3, 29.7, "SUZ", ["العين السخنة", "السخنة", "Sokhna", "تيدا", "TEDA"]],
  "الأدبية وعتاقة": [32.48, 29.87, "SUZ", ["الأدبية", "الادبية", "عتاقة", "Adabiya", "Attaka"]],
  "شرم الشيخ": [34.33, 27.92, "JSN", ["شرم الشيخ", "Sharm El Sheikh"]],
  "كوم أوشيم": [30.93, 29.64, "FYM", ["كوم أوشيم", "كوم اوشيم", "Kom Oshim"]],
  "بني سويف الجديدة": [31.14, 29.05, "BNS", ["بني سويف الجديدة", "بياض العرب", "New Beni Suef"]],
  "الواسطى وكوم أبو راضي": [31.11, 29.35, "BNS", ["الواسطى", "كوم أبو راضي", "كوم ابو راضي"]],
  "أسيوط الجديدة وعرب العوامر": [31.27, 27.29, "AST", ["أسيوط الجديدة", "اسيوط الجديدة", "New Assiut", "أبنوب", "عرب العوامر"]],
  "سوهاج الجديدة": [31.64, 26.38, "SHG", ["سوهاج الجديدة", "New Sohag"]],
  "نجع حمادي": [32.25, 26.05, "QNA", ["نجع حمادي", "Nag Hammadi"]],
  "قفط": [32.88, 25.99, "QNA", ["قفط", "Qift"]],
  "كوم أمبو": [32.95, 24.47, "ASN", ["كوم أمبو", "كوم امبو", "Kom Ombo"]],
  "سفاجا": [33.93, 26.74, "BBA", ["سفاجا", "Safaga"]],
  "رأس غارب": [33.08, 28.36, "BBA", ["رأس غارب", "راس غارب", "Ras Gharib"]],
  "العلمين الجديدة": [28.87, 30.81, "MTR", ["العلمين", "Alamein"]],
  "الضبعة": [28.46, 31.03, "MTR", ["الضبعة", "Dabaa"]],
  "القاهرة": [31.236, 30.044, "CAI", ["القاهرة", "Cairo"]],
  "الجيزة": [31.209, 30.013, "GIZ", ["الجيزة", "Giza"]],
  "الإسكندرية": [29.919, 31.2, "ALX", ["الإسكندرية", "الاسكندرية", "Alexandria"]],
  "القليوبية": [31.183, 30.466, "QLB", ["القليوبية", "بنها", "Qalyubia", "Benha", "Banha"]],
  "الشرقية": [31.502, 30.587, "SHR", ["الشرقية", "الزقازيق", "Sharqia", "Sharkia", "Zagazig"]],
  "الدقهلية": [31.381, 31.041, "DKH", ["الدقهلية", "المنصورة", "طلخا", "Dakahlia", "Mansoura"]],
  "الغربية": [31.0, 30.787, "GHR", ["الغربية", "طنطا", "Gharbia", "Tanta"]],
  "المنوفية": [31.011, 30.554, "MNF", ["المنوفية", "شبين الكوم", "Menoufia", "Monufia", "Shebin"]],
  "البحيرة": [30.468, 31.034, "BHR", ["البحيرة", "دمنهور", "Beheira", "Damanhour"]],
  "كفر الشيخ": [30.94, 31.111, "KFS", ["كفر الشيخ", "Kafr El Sheikh"]],
  "دمياط": [31.815, 31.417, "DMT", ["دمياط", "شطا", "Damietta"]],
  "بورسعيد": [32.284, 31.265, "PTS", ["بورسعيد", "بور سعيد", "الرسوة", "Port Said"]],
  "الإسماعيلية": [32.272, 30.596, "ISM", ["الإسماعيلية", "الاسماعيلية", "Ismailia"]],
  "السويس": [32.549, 29.967, "SUZ", ["السويس", "Suez"]],
  "شمال سيناء": [33.803, 31.131, "NSN", ["شمال سيناء", "العريش", "North Sinai", "Arish"]],
  "جنوب سيناء": [33.611, 28.236, "JSN", ["جنوب سيناء", "الطور", "South Sinai", "El Tor"]],
  "الفيوم": [30.842, 29.308, "FYM", ["الفيوم", "Fayoum", "Faiyum"]],
  "بني سويف": [31.097, 29.074, "BNS", ["بني سويف", "Beni Suef"]],
  "المنيا": [30.744, 28.11, "MNY", ["المنيا", "Minya"]],
  "أسيوط": [31.183, 27.181, "AST", ["أسيوط", "اسيوط", "Assiut", "Asyut"]],
  "سوهاج": [31.692, 26.557, "SHG", ["سوهاج", "الكوثر", "Sohag"]],
  "قنا": [32.727, 26.164, "QNA", ["محافظة قنا", "مدينة قنا", "Qena"]],
  "الأقصر": [32.639, 25.687, "LXR", ["الأقصر", "الاقصر", "Luxor"]],
  "أسوان": [32.899, 24.089, "ASN", ["أسوان", "اسوان", "Aswan"]],
  "البحر الأحمر": [33.812, 27.257, "BBA", ["البحر الأحمر", "الغردقة", "Red Sea", "Hurghada"]],
  "الوادي الجديد": [30.546, 25.439, "WAD", ["الوادي الجديد", "الخارجة", "New Valley", "Kharga"]],
  "مطروح": [27.237, 31.354, "MTR", ["مطروح", "Matrouh", "Matruh"]]
};
var R = MIGREG, C = {}, OK = {}; R.list.forEach(function (r) { OK[r[0]] = 1; });
/* when the record carries a governorate code, only aliases inside that governorate are matched (e.g. "قنا – سفاجا – القصير" + QNA → قنا, not the Red Sea's سفاجا).
   "قنا" is never matched as a bare substring (it is inside "قناة السويس"); the exact key lookup below still finds it. */
function norm(c, reg) { c = String(c || ""); var keys = Object.keys(GEO); for (var i = 0; i < keys.length; i++) { if (reg && GEO[keys[i]][2] !== reg) continue; var a = GEO[keys[i]][3]; for (var j = 0; j < a.length; j++) if (c.indexOf(a[j]) > -1) return keys[i]; } return c.replace(/^(منطقة|مدينة|محافظة)\s+/, "").replace(/\s*[-–،,(].*$/, "").trim(); }
function city(name, reg) { if (reg && !OK[reg]) return null; var n = norm(name, reg), g = GEO[n]; if (g && reg && g[2] !== reg) g = null; if (!g) { var rg0 = reg || R.of(n); if (!OK[rg0]) return null; n = R.name(rg0); g = GEO[n]; } if (!g) return null; var k = n; if (!C[k]) { C[k] = { name: k, reg: g[2], open: 0, tend: 0, rfq: 0, proj: 0, val: 0, fac: 0, zon: 0, sec: {}, L: { t: [], p: [], f: [], z: [] }, lon: g[0], lat: g[1] }; } return C[k]; }
var now = new Date(); now.setHours(0, 0, 0, 0);
(window.REAL && REAL.tenders || []).forEach(function (t, i) { var c = city(t.city, t.region_code); if (!c) return; var open = t.closing_date && new Date(t.closing_date + "T00:00:00") >= now; c.tend++; if (open) c.open++; if (t.kind === "pvt") c.rfq++; c.sec[t.sector_ar] = (c.sec[t.sector_ar] || 0) + 1; c.L.t.push([t.ref ? "ET" + t.ref : "MD" + (i + 1), t.title_ar, t.entity_ar, open ? "مفتوحة حتى " + t.closing_date : "مغلقة"]); });
(window.MIGRFQ || []).forEach(function (r) { if (Array.isArray(r)) r = { id: r[0], date: r[1], title: r[2], city: r[4], region: r[7], sector: r[9] }; var c = city(r.city, r.region); if (!c) return; c.rfq++; c.sec[r.sector || "أخرى"] = (c.sec[r.sector || "أخرى"] || 0) + 1; c.L.t.push([r.id, r.title, r.buyer || "طلب عرض سعر", r.date || "", "/rfq/"]); });
(window.MIG && MIG.PROJECTS || []).forEach(function (p) { var c = city(p[3], R.of(p[2])); if (!c) return; c.proj++; c.val += p[6] || 0; c.L.p.push([p[0], p[1], p[4], p[6]]); });
(window.MIGFAC || []).forEach(function (f) { var c = city(f.city, f.region_code); if (!c) return; c.fac++; c.L.f.push([f.name_ar, f.sector_ar]); });
(window.MIGZONES || []).forEach(function (z) { var c = city(z.city, z.region_code); if (!c) return; c.zon++; c.L.z.push([z.name_ar, z.status_ar || ""]); });
var CITIES = Object.keys(C).map(function (k) { var c = C[k]; c.total = c.tend + c.rfq + c.proj; return c; });
function fmtV(m) { return m ? (m >= 1000 ? (m / 1000).toFixed(1) + " مليار" : Math.round(m) + " مليون") : "—"; }
var T = CITIES.reduce(function (a, c) { a.open += c.open; a.tend += c.tend; a.rfq += c.rfq; a.proj += c.proj; a.val += c.val; a.fac += c.fac; return a; }, { open: 0, tend: 0, rfq: 0, proj: 0, val: 0, fac: 0 });
$("#mk2").innerHTML = [[CITIES.filter(function (c) { return c.total > 0; }).length, "مدينة ومنطقة عليها فرص"], [T.open, "مناقصة مفتوحة الآن"], [T.tend, "مناقصة منشورة"], [T.proj, "مشروع قائم"], [fmtV(T.val), "جنيه قيمة المشاريع"], [T.fac, "مصنع مسجّل"]].map(function (k) { return '<div><b class="num">' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join("");
/* charts */
var top = CITIES.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 10), tm = Math.max(1, top[0] ? top[0].total : 1);
$("#chTop").innerHTML = top.map(function (c) { return '<div class="hb3"><button type="button" data-c="' + c.name + '">' + c.name + '</button><span class="t"><i style="width:' + (c.total / tm * 100) + '%"></i></span><b class="num">' + c.total + '</b></div>'; }).join("");
var byR = R.list.map(function (r) { return [r, CITIES.filter(function (c) { return c.reg === r[0]; }).reduce(function (a, c) { return a + c.total; }, 0)]; }).sort(function (a, b) { return b[1] - a[1]; }), rm = Math.max(1, byR[0][1]);
$("#chReg").innerHTML = byR.map(function (x) { return '<div class="hb3"><a href="region.html#' + x[0][0] + '" style="color:inherit">' + x[0][1] + '</a><span class="t"><i style="width:' + (x[1] / rm * 100) + '%"></i></span><b class="num">' + x[1] + '</b></div>'; }).join("");
function stack(el, lg, parts) { var t = parts.reduce(function (a, p) { return a + p[1]; }, 0) || 1; $(el).innerHTML = parts.map(function (p) { return '<i style="width:' + (p[1] / t * 100) + '%;background:' + p[2] + '" title="' + p[0] + '"></i>'; }).join(""); $(lg).innerHTML = parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + p[0] + '<b class="num">' + p[1] + '</b></span>'; }).join(""); }
stack("#chMix", "#chMixL", [["مناقصات مفتوحة", T.open, "#C8102E"], ["مناقصات مغلقة", T.tend - T.open, "#9FCBB0"], ["طلبات أسعار", T.rfq, "#C09300"], ["مشاريع", T.proj, "#1F4E6B"]]);
var SEC = {}; CITIES.forEach(function (c) { Object.keys(c.sec).forEach(function (k) { SEC[k] = (SEC[k] || 0) + c.sec[k]; }); });
var SC = ["#C8102E", "#C09300", "#1F4E6B", "#7FB8C9", "#8B2E2E", "#5FAE7E"];
stack("#chSec", "#chSecL", Object.keys(SEC).sort(function (a, b) { return SEC[b] - SEC[a]; }).slice(0, 6).map(function (k, i) { return [k, SEC[k], SC[i]]; }));
/* table */
$("#treg").innerHTML = R.opts("");
var sk = "open", sd = -1, sel = "";
var EN = window.MIGLANG === "en"; function TR(x) { return EN && window.MIGTR ? MIGTR(x) : x; } function HAY(x) { return window.MIGHAY ? MIGHAY(x) : ""; }
function zst(x) { return window.MIGSAMap && MIGSAMap.status ? MIGSAMap.status(x) : x; }
function money(m) { return !m ? (EN ? "Value not disclosed" : "القيمة غير معلنة") : EN ? (m >= 1000 ? (m / 1000).toFixed(1) + " billion EGP" : Math.round(m) + " million EGP") : fmtV(m) + " جنيه"; }
function topSec(c) { return Object.keys(c.sec).sort(function (a, b) { return c.sec[b] - c.sec[a]; }).slice(0, 2).join("، ") || "—"; }
function table() {
  var q = $("#tq").value.trim().toLowerCase(), rg = $("#treg").value;
  var l = CITIES.filter(function (c) { return (!q || (c.name + HAY(c.name)).toLowerCase().indexOf(q) > -1) && (!rg || c.reg === rg); }).sort(function (a, b) { var x = sk === "name" ? TR(a.name).localeCompare(TR(b.name), EN ? "en" : "ar") : sk === "reg" ? TR(R.name(a.reg)).localeCompare(TR(R.name(b.reg)), EN ? "en" : "ar") : a[sk] - b[sk]; return x * (sk === "name" || sk === "reg" ? -sd : sd) || b.total - a.total; });
  var mx = Math.max(1, Math.max.apply(null, l.map(function (c) { return c.total; })));
  $("#tcnt").textContent = EN ? l.length + (l.length === 1 ? " city or area in the table" : " cities and areas in the table") : l.length + " مدينة ومنطقة في الجدول";
  $("#tb").innerHTML = l.map(function (c) { return '<tr data-c="' + c.name + '"' + (c.name === sel ? ' class="sel"' : '') + '><td><b>' + c.name + '</b></td><td><a href="region.html#' + c.reg + '" onclick="event.stopPropagation()">' + R.name(c.reg) + '</a></td><td class="n" style="color:var(--green)">' + c.open + '</td><td class="n">' + c.tend + '</td><td class="n">' + c.rfq + '</td><td class="n">' + c.proj + '</td><td class="n">' + fmtV(c.val) + '</td><td class="n">' + c.fac + '</td><td class="n">' + c.zon + '</td><td class="n">' + c.total + '<span class="mini" style="width:' + Math.round(c.total / mx * 60) + 'px"></span></td><td class="z">' + topSec(c) + '</td></tr>'; }).join("");
}
$$(".tw4 thead th[data-k]").forEach(function (th) { th.addEventListener("click", function () { var k = th.dataset.k; if (sk === k) sd = -sd; else { sk = k; sd = -1; } $$(".tw4 thead th").forEach(function (x) { x.classList.remove("on"); x.textContent = x.textContent.replace(/ [▲▼]$/, ""); }); th.classList.add("on"); th.textContent += sd < 0 ? " ▼" : " ▲"; table(); }); });
$("#tq").addEventListener("input", table); $("#treg").addEventListener("change", table);
function FQ(q) { q = String(q == null ? "" : q).replace(/^\s+|\s+$/g, ""); return q ? "/factories/search/#q=" + encodeURIComponent(q) : "/factories/search/"; }
function detail(name) {
  var c = C[name]; if (!c) return; sel = name; table();
  function list(a, f) { return a.length ? '<ul>' + a.slice(0, 40).map(f).join("") + '</ul>' : '<span class="muted" style="font-size:.78rem">' + (EN ? "None." : "لا يوجد.") + '</span>'; }
  $("#cdetW").innerHTML = '<div class="cdet"><h3>📍 ' + c.name + ' <span class="chip chip-gray">' + R.name(c.reg) + '</span><span class="chip chip-green">' + (EN ? c.total + ' opportunities & projects' : c.total + ' فرصة ومشروع') + '</span>' + (function () { var zz = (window.MIGZONES || []).filter(function (z) { return z.region_code === c.reg && (z.city === c.name || z.name_ar.indexOf(c.name) > -1 || String(z.city || "").indexOf(c.name) > -1); })[0]; return zz ? '<a href="city.html#' + zz.id + '">صفحة المدينة ←</a> ' : ''; })() + '<a href="region.html#' + c.reg + '">صفحة المحافظة ←</a></h3>'
    + '<section><h4>' + (EN ? 'Tenders & RFQs' : 'المناقصات وطلبات الأسعار') + ' (' + c.L.t.length + ')</h4>' + list(c.L.t, function (t) { return '<li><a href="' + (t[4] || "opportunity.html#" + t[0]) + '">' + t[1] + '</a><small>' + t[2] + ' · ' + t[3] + '</small></li>'; }) + '</section>'
    + '<section><h4>' + (EN ? 'Projects' : 'المشاريع') + ' (' + c.L.p.length + ')</h4>' + list(c.L.p, function (p) { return '<li><a href="project.html#' + p[0] + '">' + p[1] + '</a><small>' + TR(p[2]) + ' · ' + money(p[3]) + '</small></li>'; }) + '</section>'
    + '<section><h4>' + (EN ? 'Factories' : 'المصانع') + ' (' + c.L.f.length + ')</h4>' + list(c.L.f, function (f) { return '<li><a href="' + FQ(f[0]) + '">' + f[0] + '</a><small>' + f[1] + '</small></li>'; }) + '</section>'
    + '<section><h4>' + (EN ? 'Industrial & free zones and ports' : 'المناطق الصناعية والحرة والموانئ') + ' (' + c.L.z.length + ')</h4>' + list(c.L.z, function (z) { return '<li>' + z[0] + '<small>' + zst(z[1]) + '</small></li>'; }) + '</section></div>';
  $("#cdetW").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.addEventListener("click", function (e) { var r = e.target.closest("#tb tr[data-c], #chTop button[data-c]"); if (r) detail(r.dataset.c); });
table();
if (window.MIGSAMap) MIGSAMap.mount($("#mapX"), { bubbles: CITIES.map(function (c) { return { name: c.name, lat: c.lat, lon: c.lon, count: c.total }; }), onBubble: function (b) { detail(b.name); } });
var h0 = decodeURIComponent((location.hash || "").slice(1)); if (C[h0]) detail(h0);
''')
HEROS['map'] = ('hero.jpg', '<a href="region.html">المحافظات والمدن</a> › خريطة الفرص', 'خريطة الفرص في محافظات مصر', 'كل مدينة ومنطقة صناعية ودائرتها: كلما كبرت الدائرة زادت الفرص. اضغط على أي موقع لعرض مناقصاته وطلبات الأسعار ومشاريعه ومصانعه ومناطقه الصناعية والحرة، من الدلتا والقاهرة الكبرى ومنطقة قناة السويس إلى الصعيد وسيناء.', '<a class="btn btn-gold" href="#tb">جدول المدن والمناطق</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="region.html">صفحات المحافظات</a>')
