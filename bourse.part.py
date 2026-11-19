# -*- coding: utf-8 -*-
PAGES['bourse'] = ('البورصة الصناعية – صنع في مصر', 'home', COMMON_CSS + '''
.btiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.btile { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 4px; color: var(--fg); transition: transform .2s ease, border-color .2s ease; }
.btile:hover { transform: translateY(-3px); border-color: var(--green); }
.btile small { color: var(--muted); font-size: .8rem; }
.btile b { font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.chg { display: inline-flex; align-items: center; gap: 4px; font-size: .8rem; font-weight: 800; padding: 1px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; align-self: flex-start; }
.chg.up { background: #E7F6EE; color: #067647; } .chg.dn { background: #FDECEC; color: #B42318; } .chg.st { background: var(--gold-soft); color: var(--gold-deep); }
.btab { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.btab table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: .9rem; }
.btab th { text-align: start; background: var(--sunken); color: var(--muted); font-weight: 700; font-size: .78rem; padding: 10px 12px; white-space: nowrap; }
.btab td { padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: middle; font-variant-numeric: tabular-nums; }
.btab tr { cursor: pointer; } .btab tr:hover td { background: var(--green-soft); }
.btab a { color: var(--fg); font-weight: 800; }
.spark { width: 120px; height: 34px; display: block; }
.bdet { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
.chartcard { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.chead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px; }
.chead .px { font-size: 2.2rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.ranges { display: inline-flex; background: var(--sunken); border-radius: 10px; padding: 4px; }
.ranges button { border: 0; background: transparent; padding: 5px 12px; border-radius: 8px; font-weight: 700; font-size: .84rem; color: var(--muted); cursor: pointer; font-variant-numeric: tabular-nums; }
.ranges button.on { background: var(--surface); color: var(--green); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.cwrap { position: relative; width: 100%; height: 340px; }
.cwrap svg { width: 100%; height: 100%; display: block; overflow: visible; }
.tip { position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; font-size: .82rem; box-shadow: 0 10px 24px -12px rgba(0,0,0,.35); white-space: nowrap; transform: translate(-50%, -110%); opacity: 0; transition: opacity .12s ease; }
.tip b { font-variant-numeric: tabular-nums; }
.kv3 { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: .9rem; }
.kv3 dt { color: var(--muted); } .kv3 dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; text-align: end; }
.rel { display: flex; flex-direction: column; gap: 8px; }
.rel a { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); font-weight: 700; font-size: .88rem; }
.rel a:hover { border-color: var(--green); }
.bnav { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.bnav a { flex: none; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 6px 12px; font-weight: 700; font-size: .84rem; color: var(--fg); }
.bnav a.on { background: var(--green); border-color: var(--green); color: #fff; }
@media (max-width: 1000px) { .btiles { grid-template-columns: 1fr 1fr; } .bdet { grid-template-columns: 1fr; } .cwrap { height: 260px; } }
''', '''
<div id="bhero"></div>
<main class="wrap pbody2" id="top"><div id="bbody" style="display:flex;flex-direction:column;gap:18px"></div><p class="note2" id="basof"></p></main>
''', '''
/* Industrial companies listed on the Egyptian Exchange (EGX) and its main indices EGX30 / EGX70. Prices come only from the real market feed REAL.market (EGX instruments); without it the names are listed without a price. */
var LNK_ = { "البتروكيماويات": [["البتروكيماويات في السوق", "market.html#cat-petro"], ["رادار قطاع البتروكيماويات", "radar.html#petro"]], "الأسمدة والكيماويات": [["البتروكيماويات والأسمدة في السوق", "market.html#cat-petro"], ["رادار قطاع البتروكيماويات", "radar.html#petro"]], "مواد البناء": [["مواد البناء في السوق", "market.html#cat-build"], ["رادار قطاع مواد البناء", "radar.html#build"]], "المعادن": [["المعادن في السوق", "market.html#cat-metal"], ["رادار قطاع الحديد والمعادن", "radar.html#metal"]], "الحديد والصلب": [["المعادن في السوق", "market.html#cat-metal"], ["رادار قطاع الحديد والمعادن", "radar.html#metal"]], "الصناعات الغذائية": [["الأغذية في السوق", "market.html#cat-food"], ["رادار القطاع الغذائي", "radar.html#food"]], "الأدوية": [["الطبي والأدوية في السوق", "market.html#cat-med"], ["دليل المصانع", "factories.html"]], "الكابلات والصناعات الكهربائية": [["الكهرباء والكابلات في السوق", "market.html#cat-elec"], ["دليل المصانع", "factories.html"]], "الغزل والنسيج": [["دليل المصانع", "factories.html"], ["المشاريع الصناعية", "projects.html"]], "الطاقة": [["مشاريع الطاقة", "projects.html"]], "المؤشر العام": [["دليل المصانع", "factories.html"], ["المشاريع الصناعية", "projects.html"]] };
var SEC_ = { "ESRS": "الحديد والصلب", "EGAL": "المعادن", "SWDY": "الكابلات والصناعات الكهربائية", "ABUK": "الأسمدة والكيماويات", "MFPC": "الأسمدة والكيماويات", "SKPC": "البتروكيماويات", "JUFO": "الصناعات الغذائية", "EFID": "الصناعات الغذائية", "ORWE": "الغزل والنسيج", "ARCC": "مواد البناء" };
function lnk_(sec, sym) { if (LNK_[sec]) return LNK_[sec]; if (LNK_[SEC_[sym]]) return LNK_[SEC_[sym]]; var t = sec || ""; return /بتروكيم/.test(t) ? LNK_["البتروكيماويات"] : /أسمدة/.test(t) ? LNK_["الأسمدة والكيماويات"] : /حديد|صلب/.test(t) ? LNK_["الحديد والصلب"] : /ألومنيوم|ألمونيوم|معادن/.test(t) ? LNK_["المعادن"] : /إسمنت|أسمنت|البناء|سيراميك/.test(t) ? LNK_["مواد البناء"] : /غذائ|مرطبات|مشروبات|ألبان/.test(t) ? LNK_["الصناعات الغذائية"] : /دوائ|أدوية/.test(t) ? LNK_["الأدوية"] : /كابل|كهربائ/.test(t) ? LNK_["الكابلات والصناعات الكهربائية"] : /نسيج|غزل|سجاد/.test(t) ? LNK_["الغزل والنسيج"] : /طاقة|غاز|بترول/.test(t) ? LNK_["الطاقة"] : [["دليل المصانع", "factories.html"]]; }
function isIdx_(m) { return m.kind === "index" || m.type === "index" || /^(EGX30|EGX70|EGX70EWI|EGX100|EGX100EWI|EGX33)$/i.test(m.symbol) || /^مؤشر/.test(m.name_ar || ""); }
function exch_(m) { var t = (m.exchange || "") + " " + (m.source_url || "") + " " + m.symbol; return /EGX|egx[.]com[.]eg|[.]CA\b|CASE/i.test(t) ? "EGX" : ""; }
var INS = [
 ["s-EGX30", "مؤشر EGX30", "EGX30", null, 0, "نقطة", "مؤشر", "المؤشر العام", LNK_["المؤشر العام"], "", "", "EGX"],
 ["s-EGX70EWI", "مؤشر EGX70 متساوي الأوزان", "EGX70EWI", null, 0, "نقطة", "مؤشر", "المؤشر العام", LNK_["المؤشر العام"], "", "", "EGX"],
 ["s-ESRS", "حديد عز", "ESRS", null, 0, "ج.م", "سهم", "الحديد والصلب", LNK_["الحديد والصلب"], "", "", "EGX"],
 ["s-SWDY", "السويدي إليكتريك", "SWDY", null, 0, "ج.م", "سهم", "الكابلات والصناعات الكهربائية", LNK_["الكابلات والصناعات الكهربائية"], "", "", "EGX"],
 ["s-ABUK", "أبو قير للأسمدة والصناعات الكيماوية", "ABUK", null, 0, "ج.م", "سهم", "الأسمدة والكيماويات", LNK_["الأسمدة والكيماويات"], "", "", "EGX"],
 ["s-MFPC", "مصر لإنتاج الأسمدة (موبكو)", "MFPC", null, 0, "ج.م", "سهم", "الأسمدة والكيماويات", LNK_["الأسمدة والكيماويات"], "", "", "EGX"],
 ["s-SKPC", "سيدي كرير للبتروكيماويات (سيدبك)", "SKPC", null, 0, "ج.م", "سهم", "البتروكيماويات", LNK_["البتروكيماويات"], "", "", "EGX"],
 ["s-EGAL", "مصر للألومنيوم", "EGAL", null, 0, "ج.م", "سهم", "المعادن", LNK_["المعادن"], "", "", "EGX"],
 ["s-JUFO", "جهينة للصناعات الغذائية", "JUFO", null, 0, "ج.م", "سهم", "الصناعات الغذائية", LNK_["الصناعات الغذائية"], "", "", "EGX"],
 ["s-EFID", "إيديتا للصناعات الغذائية", "EFID", null, 0, "ج.م", "سهم", "الصناعات الغذائية", LNK_["الصناعات الغذائية"], "", "", "EGX"],
 ["s-ORWE", "السجاد الشرقي (أورينتال ويفرز)", "ORWE", null, 0, "ج.م", "سهم", "الغزل والنسيج", LNK_["الغزل والنسيج"], "", "", "EGX"],
 ["s-ARCC", "الأسمنت العربية", "ARCC", null, 0, "ج.م", "سهم", "مواد البناء", LNK_["مواد البناء"], "", "", "EGX"]
];
/* real closes (research feed): EGX instruments and international commodity references only; instruments of any other exchange are ignored */
var RMK_ = window.REAL && REAL.market && REAL.market.length ? REAL.market.filter(function (m) { return m && m.close != null && (exch_(m) === "EGX" || /LME|ALUM|REBAR/i.test(m.symbol || "")); }) : [];
if (RMK_.length) {
  var egx_ = RMK_.some(function (m) { return exch_(m) === "EGX"; });
  var R_ = RMK_.map(function (m) {
    var al = /LME|ALUM/i.test(m.symbol), rb = /REBAR/i.test(m.symbol), ix = isIdx_(m), ex = exch_(m);
    var sec = al ? "المعادن" : rb ? "الحديد والصلب" : ix ? "المؤشر العام" : (SEC_[m.symbol] || m.sector_ar || "الصناعة");
    return [rb ? "rebar" : al ? "aluminum" : "s-" + m.symbol, m.name_ar || m.symbol, (al || rb) ? "—" : m.symbol, +m.close, +(m.change_pct || 0), al ? "$/طن" : rb ? (m.unit_ar || "ج.م/طن") : ix ? "نقطة" : "ج.م", ix ? "مؤشر" : (al || rb) ? "سلعة" : "سهم", sec, lnk_(sec, m.symbol), m.as_of_date || "", m.source_url || "", ex];
  });
  /* a feed with EGX instruments replaces the list; a feed with commodity references only is added after the EGX names */
  INS = egx_ ? R_ : INS.concat(R_.filter(function (r) { return r[0] === "rebar" || r[0] === "aluminum"; }));
}
/* the as-of note: every sentence in both languages (a glued Arabic string cannot be matched by the English dictionary) */
function asof() { var EN = window.MIGLANG === "en", T = function (a, e) { return EN ? e : a; }; var x = INS.filter(function (i) { return i[9]; }), st = x.filter(function (i) { return i[11]; }).length, al = x.some(function (i) { return i[0] === "aluminum"; });
  var pend = T("تظهر آخر أسعار الإغلاق للأسهم والمؤشرات هنا فور ربط موجز الأسعار من البورصة المصرية (EGX).", "The latest closing prices of stocks and indices appear here as soon as the price feed from the Egyptian Exchange (EGX) is connected."), noAdv = T("المنصة لا تقدّم توصيات استثمارية.", "The platform does not give investment advice.");
  if (!x.length) { $("#basof").textContent = pend + " " + noAdv; return; }
  var src = [st ? T("الأسهم والمؤشرات من البورصة المصرية EGX", "stocks and indices from the Egyptian Exchange, EGX") : "", al ? T("الألومنيوم من تسوية بورصة لندن للمعادن", "aluminum from the London Metal Exchange settlement") : ""].filter(Boolean).join(T("، و", "; "));
  $("#basof").textContent = T("آخر سعر إغلاق حقيقي بتاريخ ", "Last real closing price on ") + x[0][9] + " (" + src + T("، ومصدر كل سعر في صفحة الأداة). ", "; each price's source is on the instrument page). ") + (st ? "" : pend + " ") + T("مفيش رسم تاريخي لحد ما يترّبط موجز أسعار مرخّص، والمنصة لا تقدّم توصيات استثمارية.", "There is no historical chart until a licensed price feed is connected, and the platform does not give investment advice."); }
/* owner decision (final): no simulated price history. Only the real last close (REAL.market, with its date and source) is shown;
   a historical series / chart appears only when a licensed EGX price feed is connected. */
function series(ins) { return []; }
var DATA = {}; INS.forEach(function (x) { DATA[x[0]] = series(x); });
function f2(v, u) { if (v == null || !isFinite(v)) return "—"; return v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2); }
function chg(c) { return '<span class="chg ' + (c > 0 ? "up" : c < 0 ? "dn" : "st") + '">' + (c > 0 ? "▲ +" + c.toFixed(1) + "%" : c < 0 ? "▼ " + c.toFixed(1) + "%" : "● مستقر") + '</span>'; }
function chgX(x) { return x[3] == null ? '<span class="chg st">' + (x[11] || "—") + '</span>' : chg(x[4]); }
function dAr(d, o) { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", o || { day: "numeric", month: "short", year: "numeric" }).format(d); }
function spark(id) { if (!DATA[id].length) return '<span class="muted">—</span>'; var s = DATA[id].slice(-60), mn = Math.min.apply(null, s.map(function (p) { return p[1]; })), mx = Math.max.apply(null, s.map(function (p) { return p[1]; })), w = 120, h = 34; var pts = s.map(function (p, i) { return ((document.documentElement.dir !== "ltr") ? w - i / (s.length - 1) * w : i / (s.length - 1) * w).toFixed(1) + "," + (h - 3 - (p[1] - mn) / ((mx - mn) || 1) * (h - 6)).toFixed(1); }); var last = pts[pts.length - 1].split(","); return '<svg class="spark" viewBox="0 0 120 34" aria-hidden="true"><polyline points="' + pts.join(" ") + '" fill="none" stroke="#C8102E" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="#C8102E"/></svg>'; }
function overview() {
  $("#bhero").innerHTML = HERO("m4.jpg", "البورصة الصناعية", "البورصة الصناعية", "أسهم الشركات الصناعية المدرجة في البورصة المصرية (EGX) ومؤشراها الرئيسيان EGX30 وEGX70: الحديد والصلب والألومنيوم والكابلات والأسمدة والبتروكيماويات والأسمنت والأغذية والنسيج.", "");
  var tiles = INS.slice(0, 4).map(function (x) { return '<a class="btile" href="#' + x[0] + '"><small>' + x[1] + (x[2] !== "—" ? " (" + x[2] + ")" : "") + '</small><b>' + f2(x[3]) + (x[3] == null ? '' : ' <small>' + x[5] + '</small>') + '</b>' + chgX(x) + '</a>'; }).join("");
  var rows = INS.map(function (x) { return '<tr data-go="' + x[0] + '"><td><a href="#' + x[0] + '">' + x[1] + '</a><br><small class="muted">' + x[6] + ' · ' + x[7] + (x[2] !== "—" ? " · " + x[2] : "") + (x[11] ? " · " + x[11] : "") + '</small></td><td><b>' + f2(x[3]) + '</b>' + (x[3] == null ? '' : ' <small class="muted">' + x[5] + '</small>') + '</td><td>' + chgX(x) + '</td><td class="num">' + (x[9] || "—") + '</td></tr>'; }).join("");
  $("#bbody").innerHTML = '<div class="btiles">' + tiles + '</div><div class="btab"><table><thead><tr><th>السهم / المؤشر / السلعة</th><th>آخر سعر</th><th>التغيّر اليومي</th><th>تاريخ الإغلاق</th></tr></thead><tbody>' + rows + '</tbody></table></div><span class="note2">آخر سعر إغلاق منشور لكل سهم ومؤشر بتاريخه ومصدره؛ الرسوم البيانية التاريخية بتظهر لما يتربط موجز أسعار مرخّص من البورصة المصرية. المعلومات للاطلاع فقط وليست توصية استثمارية.</span>';
}
var RANGES = window.MIGLANG === "en" ? [["1M", 22], ["3M", 66], ["6M", 130], ["1Y", 260]] : [["1ش", 22], ["3ش", 66], ["6ش", 130], ["سنة", 260]], rg = 1;
function chart(id) {
  var x = INS.filter(function (i) { return i[0] === id; })[0], all = DATA[id], s = all.slice(-RANGES[rg][1]); if (s.length < 2 || !$("#cw")) return;
  var box = $("#cw"), W = box.clientWidth, H = box.clientHeight, P = { l: 56, r: 12, t: 12, b: 26 };
  var mn = Math.min.apply(null, s.map(function (p) { return p[1]; })), mx = Math.max.apply(null, s.map(function (p) { return p[1]; })), pad = (mx - mn) * .12 || 1; mn -= pad; mx += pad;
  function X(i) { var f = i / (s.length - 1) * (W - P.l - P.r); return (document.documentElement.dir !== "ltr") ? W - P.r - f : P.l + f; }
  function Y(v) { return P.t + (1 - (v - mn) / (mx - mn)) * (H - P.t - P.b); }
  var step = (mx - mn) / 4, g = "", lab = "";
  for (var k = 0; k <= 4; k++) { var v = mn + step * k, y = Y(v); g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>'; lab += '<text x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)" font-family="Cairo">' + f2(v) + '</text>'; }
  var xt = ""; [0, .5, 1].forEach(function (f) { var i = Math.round(f * (s.length - 1)); xt += '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Cairo">' + dAr(s[i][0], { day: "numeric", month: "short" }) + '</text>'; });
  var line = s.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
  var area = line + " L" + X(s.length - 1) + " " + (H - P.b) + " L" + X(0) + " " + (H - P.b) + " Z";
  var lx = X(s.length - 1), ly = Y(s[s.length - 1][1]);
  $("#csvg").setAttribute("viewBox", "0 0 " + W + " " + H);
  $("#csvg").innerHTML = '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8102E" stop-opacity=".22"/><stop offset="1" stop-color="#C8102E" stop-opacity="0"/></linearGradient></defs>' + g + lab + xt + '<path d="' + area + '" fill="url(#ga)"/><path d="' + line + '" fill="none" stroke="#C8102E" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + lx + '" cy="' + ly + '" r="5" fill="#C8102E" stroke="var(--surface)" stroke-width="2"/><line id="xh" y1="' + P.t + '" y2="' + (H - P.b) + '" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/><circle id="xd" r="5" fill="#C8102E" stroke="var(--surface)" stroke-width="2" opacity="0"/>';
  $("#rchg").textContent = ""; /* a chart is drawn only from a real price series (a licensed feed), never a simulated one */
  box.onpointermove = function (e) { var r = box.getBoundingClientRect(), mxp = e.clientX - r.left, i = Math.round(((document.documentElement.dir !== "ltr") ? (W - P.r - mxp) : (mxp - P.l)) / (W - P.l - P.r) * (s.length - 1)); i = Math.max(0, Math.min(s.length - 1, i)); var px = X(i), py = Y(s[i][1]); var xh = $("#xh"), xd = $("#xd"); xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("opacity", ".6"); xd.setAttribute("cx", px); xd.setAttribute("cy", py); xd.setAttribute("opacity", "1"); var t = $("#tip"); t.style.left = px + "px"; t.style.top = py + "px"; t.style.opacity = 1; t.innerHTML = dAr(s[i][0]) + '<br><b>' + f2(s[i][1]) + ' ' + x[5] + '</b>'; };
  box.onpointerleave = function () { $("#tip").style.opacity = 0; $("#xh").setAttribute("opacity", "0"); $("#xd").setAttribute("opacity", "0"); };
}
function detail(id) {
  var x = INS.filter(function (i) { return i[0] === id; })[0], s = DATA[id], has = s.length > 1;
  var EXN = { EGX: "البورصة المصرية (EGX)" };
  $("#bhero").innerHTML = HERO("m4.jpg", '<a href="bourse.html">البورصة الصناعية</a> › ' + x[1], x[1] + (x[2] !== "—" ? " (" + x[2] + ")" : ""), x[6] + (window.MIGLANG === "en" ? " · " : " · قطاع ") + x[7] + (x[11] ? " · " + (EXN[x[11]] || x[11]) : ""), "");
  var main = has ? '<div class="chartcard"><div class="chead"><div><small class="muted">آخر سعر</small><div class="px">' + f2(x[3]) + ' <small style="font-size:1rem" class="muted">' + x[5] + '</small></div>' + chg(x[4]) + ' <span class="muted" style="font-size:.84rem" id="rchg"></span></div><div class="ranges" id="ranges">' + RANGES.map(function (r, i) { return '<button type="button"' + (i === rg ? ' class="on"' : '') + ' data-r="' + i + '">' + r[0] + '</button>'; }).join("") + '</div></div><div class="cwrap" id="cw"><svg id="csvg" role="img" aria-label="رسم سعر ' + x[1] + '"></svg><div class="tip" id="tip"></div></div></div>'
    : '<div class="chartcard"><div class="chead"><div><small class="muted">آخر سعر</small><div class="px">' + (x[3] == null ? '—' : f2(x[3]) + ' <small style="font-size:1rem" class="muted">' + x[5] + '</small>') + '</div>' + chgX(x) + (x[3] != null && x[9] ? ' <span class="muted" style="font-size:.84rem">' + (window.MIGLANG === "en" ? "Close of " : "إغلاق ") + x[9] + '</span>' : '') + '</div></div><p>' + (x[3] == null ? 'يظهر آخر سعر إغلاق هنا فور ربط موجز الأسعار من ' + (EXN[x[11]] || "البورصة المصرية") + '. يمكنك متابعة السعر الرسمي على الموقع الرسمي للبورصة المصرية.' : 'آخر سعر إغلاق منشور بتاريخه ومصدره. السلسلة التاريخية والرسم البياني بيظهروا لما يتربط موجز أسعار مرخّص من البورصة المصرية؛ لحد كده تابع تاريخ السعر على الموقع الرسمي.') + '</p>' + (x[10] ? '<a class="btn btn-line btn-sm" style="align-self:flex-start" target="_blank" rel="noopener" href="' + x[10] + '">' + (window.MIGLANG === "en" ? "Price source ↗" : "مصدر السعر ↗") + '</a>' : '') + '<a class="btn btn-line btn-sm" style="align-self:flex-start" target="_blank" rel="noopener" href="' + "https://www.egx.com.eg/" + '">الموقع الرسمي للبورصة المصرية ↗</a></div>';
  $("#bbody").innerHTML = '<nav class="bnav">' + INS.map(function (i) { return '<a href="#' + i[0] + '"' + (i[0] === id ? ' class="on"' : '') + '>' + i[1] + '</a>'; }).join("") + '</nav><div class="bdet">' + main +
    '<aside style="display:flex;flex-direction:column;gap:16px"><div class="card2"><h2>ملخص</h2><dl class="kv3"><dt>آخر سعر</dt><dd>' + f2(x[3]) + (x[3] == null ? '' : ' ' + x[5]) + '</dd><dt>التغيّر اليومي</dt><dd>' + chgX(x) + '</dd><dt>النوع</dt><dd>' + x[6] + '</dd><dt>القطاع</dt><dd>' + x[7] + '</dd>' + (x[11] ? '<dt>السوق</dt><dd>' + x[11] + '</dd>' : '') + (x[10] ? '<dt>المصدر</dt><dd><a href="' + x[10] + '" target="_blank" rel="noopener">صفحة السعر ↗</a></dd>' : '') + '</dl></div><div class="card2"><h2>مرتبط في المنصة</h2><div class="rel">' + x[8].map(function (r) { return '<a href="' + r[1] + '">' + r[0] + ' ←</a>'; }).join("") + '</div></div></aside></div>';
  if (!has) return;
  chart(id);
  $("#ranges").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; rg = +b.dataset.r; $$("#ranges button").forEach(function (z) { z.classList.toggle("on", z === b); }); chart(id); });
}
function route() { var h = (location.hash || "").slice(1), x = DATA[h] ? INS.filter(function (i) { return i[0] === h; })[0] : null; if (x) detail(h); else overview(); if (window.MIGINQ) MIGINQ.ctx(x ? { type: "page", id: "bourse:" + h, title: x[1], url: "bourse.html#" + h, follow: false } : null); window.scrollTo(0, 0); }
document.addEventListener("click", function (e) { var r = e.target.closest("tr[data-go]"); if (r && !e.target.closest("a")) location.hash = r.dataset.go; });
asof(); route(); window.addEventListener("hashchange", route);
var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { var h = (location.hash || "").slice(1); if (DATA[h]) chart(h); }, 150); });
''')

en_add([("تاريخ الإغلاق", "Close date"),
 ("آخر سعر إغلاق منشور لكل سهم ومؤشر بتاريخه ومصدره؛ الرسوم البيانية التاريخية بتظهر لما يتربط موجز أسعار مرخّص من البورصة المصرية. المعلومات للاطلاع فقط وليست توصية استثمارية.", "The last published close of each share and index, with its date and source; historical charts appear once a licensed EGX price feed is connected. For information only, not investment advice."),
 ("آخر سعر إغلاق منشور بتاريخه ومصدره. السلسلة التاريخية والرسم البياني بيظهروا لما يتربط موجز أسعار مرخّص من البورصة المصرية؛ لحد كده تابع تاريخ السعر على الموقع الرسمي.", "The last published close, with its date and source. The price history and chart appear once a licensed EGX price feed is connected; until then, follow the price history on the official website."),
 ("يظهر آخر سعر إغلاق هنا فور ربط موجز الأسعار من البورصة المصرية (EGX). يمكنك متابعة السعر الرسمي على الموقع الرسمي للبورصة المصرية.", "The last close appears here once the price feed of the Egyptian Exchange (EGX) is connected. You can follow the official price on the EGX website.")])
