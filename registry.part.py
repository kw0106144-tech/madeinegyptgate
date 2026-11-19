# -*- coding: utf-8 -*-
RCSS = COMMON_CSS + '''
.rk { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.rk a { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; padding-inline-end: 56px; color: var(--fg); display: flex; flex-direction: column; gap: 6px; position: relative; transition: transform .2s ease, box-shadow .2s ease; }
.rk a:hover { transform: translateY(-4px); box-shadow: 0 16px 30px -18px rgba(0,0,0,.4); }
.rk .pos { position: absolute; top: 12px; inset-inline-end: 12px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--gold); color: #1A1204; }
.rk b.v { font-size: 1.4rem; font-weight: 800; color: var(--green); }
.tw2 { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.tw2 table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: .88rem; }
.tw2 th { text-align: start; background: var(--sunken); color: var(--muted); font-weight: 700; font-size: .78rem; padding: 10px 12px; white-space: nowrap; }
.tw2 td { padding: 11px 12px; border-top: 1px solid var(--line); }
.tw2 tr:hover td { background: var(--green-soft); }
.tw2 a { color: var(--green); font-weight: 700; }
.ent { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.ent-side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 84px); }
.kv2 { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: .88rem; }
.kv2 dt { color: var(--muted); } .kv2 dd { margin: 0; font-weight: 600; }
.bars3 { display: flex; flex-direction: column; gap: 8px; }
.bars3 div { display: grid; grid-template-columns: 150px 1fr minmax(90px, max-content); gap: 10px; align-items: center; font-size: .86rem; }
.bars3 b { white-space: nowrap; }
.bars3 .t { height: 12px; border-radius: 99px; background: var(--sunken); overflow: hidden; }
.bars3 .t i { display: block; height: 100%; width: 0; background: linear-gradient(270deg, var(--gold), var(--green)); border-radius: 99px; transition: width 1.1s cubic-bezier(.2,.8,.2,1); }
.cgrid2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.cc { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; color: var(--fg); display: flex; flex-direction: column; gap: 6px; transition: transform .2s ease, border-color .2s ease; }
.cc:hover { transform: translateY(-4px); border-color: var(--green); }
.cc .top { display: flex; gap: 10px; align-items: center; }
.cc .av { width: 46px; height: 46px; border-radius: 12px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-weight: 800; font-size: 1.1rem; flex: none; }
@media (max-width: 900px) { .rk, .cgrid2 { grid-template-columns: 1fr 1fr; } .ent { grid-template-columns: 1fr; } .ent-side { position: static; } }
@media (max-width: 520px) { .rk, .cgrid2 { grid-template-columns: 1fr; } .bars3 div { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; } .bars3 .t { grid-column: 1 / -1; grid-row: 2; } }
'''
HELP = '''
function cTotals() { var t = {}; REG.awards.forEach(function (w) { var x = t[w[3]] || (t[w[3]] = { n: 0, v: 0, u: 0 }); x.n++; x.v += w[4]; x.u += w[9] || 0; }); return t; }
function aTotals() { var t = {}; REG.awards.forEach(function (w) { var x = t[w[2]] || (t[w[2]] = { n: 0, v: 0, u: 0 }); x.n++; x.v += w[4]; x.u += w[9] || 0; }); return t; }
function dAr(s) { var p = String(s || "").split("-"); if (p.length < 2) return String(s || ""); return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", p.length > 2 ? { day: "numeric", month: "short", year: "numeric" } : { month: "short", year: "numeric" }).format(new Date(+p[0], +p[1] - 1, +(p[2] || 1))); }
/* sector / entity-type labels: English is chosen here (these labels are not in the dictionary); options keep the Arabic value */
var LBEN = { "صحة": "Health", "مياه وصرف صحي": "Water & Sanitation", "كهرباء وطاقة": "Electricity & Energy", "بترول وغاز": "Oil & Gas", "نقل وطيران": "Transport & Aviation", "نقل": "Transport", "تعليم": "Education", "إدارة محلية": "Local Government", "صناعة": "Industry", "مناطق اقتصادية": "Economic Zones", "إعلام": "Media", "حكومة مركزية": "Central Government", "تطوير عمراني": "Urban Development", "بنوك": "Banks", "أخرى": "Other", "مقاولات": "Contracting", "محافظة": "Governorate", "مستشفى": "Hospital", "مركز طبي": "Medical Center", "جامعة": "University", "هيئة": "Authority", "مركز حكومي": "Government Center", "شركة حكومية": "Government-Owned Company", "جهة حكومية": "Government entity", "القطاع الخاص": "Private sector" };
function LB(s) { return window.MIGLANG === "en" && LBEN[s] ? LBEN[s] : s; }
function opts(sel, arr) { var u = []; arr.forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); $(sel).innerHTML += u.map(function (x) { return '<option value="' + esc(x) + '">' + LB(x) + "</option>"; }).join(""); }
function esc(s) { return String(s).replace(/[<>&"]/g, ""); }
function aed(v) { return v ? REG.money(v) + " جنيه" : REG.money(v); }
/* EGP total plus the awards published only in USD (each part in its own span, so each is translated) */
function usd(u) { var b = u >= 1000, x = b ? Math.round(u / 100) / 10 : Math.round(u * 10) / 10; return window.MIGLANG === "en" ? "USD " + x + (b ? " billion" : " million") : x + (b ? " مليار دولار" : " مليون دولار"); }
function amt(v, u) { return u ? (v ? '<span>' + aed(v) + '</span> + ' : '') + '<span>' + usd(u) + '</span>' : aed(v); }
function AG(id) { return REG.a(id) || ["", "جهة غير معلنة", "", "", ""]; }
function HAY(a) { return a.map(function (s) { s = String(s == null ? "" : s); return s + " " + (window.MIGHAY ? MIGHAY(s) : ""); }).join(" ").toLowerCase(); }
REG.agencies.forEach(function (a) { if (!a[1]) a[1] = "جهة غير معلنة"; }); REG.companies.forEach(function (c) { if (!c[1]) c[1] = "شركة غير معلنة"; });
'''

PAGES['winners'] = ('الشركات الفائزة – صنع في مصر', 'rfq', RCSS, '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="card2"><h2>🏆 الأعلى ترسيةً</h2><div class="rk" id="rk"></div></div>
  <div class="tools2"><input type="search" id="q" placeholder="ابحث بالشركة أو المنافسة أو الجهة…" aria-label="بحث"><select id="ag" aria-label="الجهة"><option value="">كل الجهات</option></select><select id="sc" aria-label="القطاع"><option value="">كل القطاعات</option></select><select id="rg" aria-label="المحافظة"></select></div>
  <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span id="cnt" class="muted"></span><span class="note2">ترسيات معلنة من مصادرها الرسمية (رابط المصدر مع كل ترسية)؛ المنصة جهة إعلامية ولا تُرسي العقود.</span></div>
  <div class="tw2"><table><thead><tr><th>المنافسة</th><th>الشركة الفائزة</th><th>الجهة</th><th>القطاع</th><th>القيمة</th><th>المتقدمون</th><th>التاريخ</th></tr></thead><tbody id="tb"></tbody></table></div>
</main>
''', HELP + '''
var T = cTotals(), top = Object.keys(T).sort(function (a, b) { return T[b].v - T[a].v || T[b].u - T[a].u; }).slice(0, 6);
$("#rk").innerHTML = top.map(function (id, i) { var c = REG.c(id); return '<a href="entity.html#' + id + '"><span class="pos num">' + (i + 1) + '</span><b>' + c[1] + '</b><small class="muted">' + c[2] + ' · 📍 ' + c[3] + '</small><b class="v">' + amt(T[id].v, T[id].u) + '</b><small class="muted"><b class="num">' + T[id].n + '</b> ترسية</small></a>'; }).join("");
opts("#ag", REG.awards.map(function (w) { return AG(w[2])[1]; })); opts("#sc", REG.awards.map(function (w) { return w[6]; })); $("#rg").innerHTML = MIGREG.opts(MIGREG.take());
/* hide the sector filter and the bidders column while the data has nothing to tell apart */
var SEC = $("#sc").options.length > 2; if (!SEC) { $("#sc").hidden = true; $$(".tw2 thead th")[3].style.display = "none"; }
var BID = REG.awards.some(function (w) { return w[7] !== "—" && w[7] !== "" && w[7] != null; }); if (!BID) $$(".tw2 thead th")[5].style.display = "none";
try { var q0 = sessionStorage.getItem("mig-q"); if (q0) { $("#q").value = q0; sessionStorage.removeItem("mig-q"); } } catch (x) {}
/* #q=<name>: a winning company / awarding entity of the agency cards and rankings (entity.html#<id> → /awards/search/#q=<name>,
   seo_build.part.py entity_targets). The exact name of a REG record lists that record's own awards; any other text searches as typed */
var EXACT = null;
function hq() {
  var h = location.hash || ""; if (!/^#q=/.test(h)) return false;
  var v = h.slice(3); try { v = decodeURIComponent(v); } catch (x) {}
  v = v.trim(); $("#q").value = v; EXACT = null;
  REG.companies.some(function (c) { if (c[1] === v) { EXACT = { k: 3, id: c[0], v: v }; return true; } return false; });
  if (!EXACT) REG.agencies.some(function (a) { if (a[1] === v) { EXACT = { k: 2, id: a[0], v: v }; return true; } return false; });
  return true;
}
hq();
function render() {
  var q = $("#q").value.trim(), ag = $("#ag").value, sc = $("#sc").value, rg = $("#rg").value;
  if (EXACT && q !== EXACT.v) EXACT = null;
  q = q.toLowerCase();
  var l = REG.awards.filter(function (w) { var c = REG.c(w[3]), a = AG(w[2]); return (!ag || a[1] === ag) && (!sc || w[6] === sc) && (!rg || MIGREG.of(c[3]) === rg) && (EXACT ? w[EXACT.k] === EXACT.id : (!q || HAY([w[1], c[1], a[1], w[0]]).indexOf(q) > -1)); });
  $("#cnt").innerHTML = '<span>' + l.length + ' ترسية</span> · <span>إجمالي</span> ' + amt(l.reduce(function (s, w) { return s + w[4]; }, 0), l.reduce(function (s, w) { return s + (w[9] || 0); }, 0));
  $("#tb").innerHTML = l.map(function (w) { var c = REG.c(w[3]), a = AG(w[2]); return '<tr><td><b>' + w[1] + '</b><br><small class="muted" dir="ltr">' + w[0] + '</small>' + (/^https?:/.test(w[8] || "") ? ' <small><a href="' + w[8] + '" target="_blank" rel="noopener">المصدر ↗</a></small>' : '') + '</td><td><a href="entity.html#' + c[0] + '">' + c[1] + '</a></td><td>' + (a[0] ? '<a href="entity.html#' + a[0] + '">' + a[1] + '</a>' : a[1]) + '</td>' + (SEC ? '<td>' + LB(w[6]) + '</td>' : '') + '<td class="num"><b>' + amt(w[4], w[9]) + '</b></td>' + (BID ? '<td class="num">' + w[7] + '</td>' : '') + '<td>' + dAr(w[5]) + '</td></tr>'; }).join("") || '<tr><td colspan="7" style="text-align:center;padding:24px" class="muted">لا توجد نتائج.</td></tr>';
}
$("#q").addEventListener("input", render); ["#ag", "#sc", "#rg"].forEach(function (id) { $(id).addEventListener("change", render); });
render();
window.addEventListener("hashchange", function () { if (hq()) { render(); var t = document.querySelector(".tw2"); if (t && t.scrollIntoView) t.scrollIntoView({ block: "start" }); } });
''')

PAGES['agencies'] = ('الجهات الحكومية – صنع في مصر', 'rfq', RCSS, '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="tools2"><input type="search" id="q" placeholder="ابحث باسم الجهة أو القطاع…" aria-label="بحث"><select id="sc" aria-label="القطاع"><option value="">كل القطاعات</option></select><select id="rg" aria-label="المحافظة"></select></div>
  <div class="cgrid2" id="grid"></div>
  <span class="note2">الجهات مستخلصة من المناقصات المنشورة على المنصة ومن الترسيات الرسمية المعلنة.</span>
</main>
''', HELP + '''
var A = aTotals(), GOV = REG.agencies.filter(function (a) { return a[4] !== "القطاع الخاص"; });
opts("#sc", GOV.map(function (a) { return a[2]; })); $("#rg").innerHTML = MIGREG.opts(MIGREG.take());
function render() {
  var q = $("#q").value.trim(), sc = $("#sc").value, rg = $("#rg").value;
  q = q.toLowerCase();
  var l = GOV.filter(function (a) { return (!sc || a[2] === sc) && (!rg || MIGREG.of(a[3]) === rg) && (!q || (HAY([a[1], a[2], a[4]]) + " " + LB(a[2]) + " " + LB(a[4])).toLowerCase().indexOf(q) > -1); });
  $("#grid").innerHTML = l.map(function (a, i) { var t = A[a[0]] || { n: 0, v: 0 }; return '<a class="cc cin" style="animation-delay:' + i * 50 + 'ms" href="entity.html#' + a[0] + '"><div class="top"><span class="av">🏛️</span><div><b>' + a[1] + '</b><br><small class="muted"><span>' + LB(a[4]) + '</span> · <span>📍 ' + a[3] + '</span></small></div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip chip-green">' + LB(a[2]) + '</span>' + (a[5] ? '<span class="chip chip-gray">' + a[5] + '</span>' : '') + '</div><small class="muted">' + (t.n ? '<b class="num">' + t.n + '</b> ترسية · ' + amt(t.v, t.u) : 'لا ترسيات مسجلة بعد') + '</small><span style="color:var(--green);font-weight:700;font-size:.86rem">منافسات وترسيات الجهة ←</span></a>'; }).join("") || '<div class="card2">لا توجد نتائج.</div>';
}
$("#q").addEventListener("input", render); ["#sc", "#rg"].forEach(function (id) { $(id).addEventListener("change", render); });
render();
''')

PAGES['contractors'] = ('دليل المقاولين والموردين – صنع في مصر', 'projects', RCSS, '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="seg2" id="tp"><button class="on" data-k="m">🏗️ قطاع المقاولات والإنشاءات <small id="nM"></small></button><button data-k="w">🏆 مقاولون فائزون بترسيات معلنة <small id="nW"></small></button><button data-k="s">✓ مصانع وشركات موثّقة من فريق المنصة <small id="nS"></small></button></div>
  <div class="tools2"><input type="search" id="q" placeholder="ابحث بالاسم أو التخصص…" aria-label="بحث"><select id="rg" aria-label="المحافظة"></select><select id="cl" aria-label="التصنيف"><option value="">كل التصنيفات</option></select></div>
  <p class="muted" id="cnt" style="margin:0"></p>
  <div class="cgrid2" id="grid"></div>
  <span class="note2" id="cnote"></span>
</main>
<script src="data/oldfac.js"></script>
''', HELP + MIG_VFX_JS + '''
/* three real lists, never mixed and never padded: (m) the establishments listed in the platform directory under the sector
   «المقاولات والإنشاءات» (data/oldfac.js; the data has no separate «contractor» type), (w) the contractors that won the published
   contract awards (data/registry.js "rc" records from REAL.awards, each with its source), (s) the 91 companies of data/factories.js
   (data/registry.js mirror) verified manually by the platform team — its clients — with their published awards */
var T = cTotals(), EN = window.MIGLANG === "en", K = "m", SEC = "المقاولات والإنشاءات";
var M = (window.MIGOLDFAC || []).map(function (o, i) { return [o, i]; }).filter(function (a) { return a[0][1] === SEC; });
function ar(n, one, two, few, many) { var m = n % 100; return n === 1 ? one : n === 2 ? two : m >= 3 && m <= 10 ? n + " " + few : n + " " + many; }
function cntTxt(n) { return EN ? n + (n === 1 ? " listing" : " listings") : ar(n, "منشأة واحدة", "منشأتان", "منشآت", "منشأة"); }
var W = REG.companies.filter(function (c) { return c[2] === "مقاولات"; }), S = REG.companies.filter(function (c) { return c[2] !== "مقاولات"; });
$("#nM").textContent = "(" + M.length + ")"; $("#nW").textContent = "(" + W.length + ")"; $("#nS").textContent = "(" + S.length + ")"; if (!W.length) $('#tp button[data-k="w"]').hidden = true;
$("#rg").innerHTML = MIGREG.opts(MIGREG.take()); opts("#cl", REG.companies.map(function (c) { return c[4]; }).filter(function (x) { return x !== "—"; }));
var h = (location.hash || "").slice(1); if (h === "suppliers") K = "s"; if (h === "winners" && W.length) K = "w";
function tabs() { $$("#tp button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === K); }); $("#cl").hidden = K !== "s" || $("#cl").options.length < 2; }
function render() {
  var q = $("#q").value.trim().toLowerCase(), rg = $("#rg").value, cl = $("#cl").value, html = "", n = 0;
  if (K === "m") {
    var l = M.filter(function (a) { var o = a[0]; return (!rg || o[10] === rg) && (!q || HAY([o[0], o[1], o[2], (o[9] || []).join(" ")]).indexOf(q) > -1); });
    n = l.length;
    html = l.map(function (a, i) { var o = a[0], gv = o[10] && MIGREG.by[o[10]] ? MIGREG.name(o[10]) : "", loc = o[2] && o[2] !== "جمهورية مصر العربية" ? o[2] : (gv || "مصر — المحافظة غير محددة"), inc = window.MIGINC ? MIGINC.list(o[11]) : [];
      return '<a class="cc cin" style="animation-delay:' + Math.min(i, 12) * 50 + 'ms" href="company.html#' + a[1] + '"><div class="top"><span class="av">🏗️</span><div><b>' + esc(o[0]) + '</b><br><small class="muted">📍 ' + esc(loc) + ' · ' + esc(o[3]) + '</small></div></div>' + ((o[9] || []).length ? '<small class="muted">' + esc((o[9] || []).slice(0, 4).join("، ")) + '</small>' : '') + '<div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span class="chip chip-gray">📇 مدرجة في دليل المنصة</span>' + (inc.length ? '<small class="muted">⚠️ ' + esc(MIGINC.label + ": " + inc.join("، ")) + '</small>' : '') + '</div></a>'; }).join("");
    $("#cnote").textContent = EN ? "Listings in the platform directory under the sector “Contracting & Construction” (the data has no separate contractor type). Not verified by the platform." : "المنشآت المدرجة في دليل المنصة ضمن قطاع «المقاولات والإنشاءات» (البيانات مافيهاش تصنيف «مقاول» مستقل). البيانات مش متحقَّق منها من المنصة.";
  } else {
    var l2 = (K === "w" ? W : S).filter(function (c) { return (!rg || MIGREG.of(c[3]) === rg) && (!cl || c[4] === cl) && (!q || HAY([c[1], c[5]]).indexOf(q) > -1); });
    l2.sort(function (a, b) { return ((T[b[0]] || {}).v || 0) - ((T[a[0]] || {}).v || 0); });
    n = l2.length;
    html = l2.map(function (c, i) { var t = T[c[0]] || { n: 0, v: 0 }; return '<a class="cc cin" style="animation-delay:' + Math.min(i, 12) * 50 + 'ms" href="entity.html#' + c[0] + '"><div class="top"><span class="av">📦</span><div><b>' + c[1] + '</b><br><small class="muted">📍 ' + c[3] + (c[4] !== "—" ? ' · تصنيف ' + c[4] : '') + '</small></div></div><small class="muted">' + c[5] + '</small><div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">' + (t.n ? '<span class="chip chip-green">🏆 ' + (EN ? t.n + (t.n === 1 ? " award" : " awards") : ar(t.n, "ترسية واحدة", "ترسيتان", "ترسيات", "ترسية")) + '</span><span class="chip chip-gold">' + amt(t.v, t.u) + '</span>' : '<span class="chip chip-gray">لا ترسيات مسجلة بعد</span>') + (VFX(c[1]) ? '<span class="chip chip-green">✓ موثّق من فريق المنصة</span>' : '') + '</div></a>'; }).join("");
    $("#cnote").textContent = K === "w" ? (EN ? "Contractors named as winners in published contract awards; each award links to its source. Not registered on the platform." : "مقاولون معلن فوزهم بترسيات عقود منشورة، ولكل ترسية مصدرها. غير مسجّلين في المنصة.")
      : (EN ? "Egyptian factories and companies verified by the platform team, with the awards published for them." : "مصانع وشركات مصرية وثّقها فريق المنصة، مع الترسيات المعلنة لها.");
  }
  $("#cnt").textContent = cntTxt(n);
  $("#grid").innerHTML = html || '<div class="card2">' + (EN ? "No results." : "لا توجد نتائج.") + '</div>';
}
tabs();
$("#tp").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; K = b.dataset.k; tabs(); try { history.replaceState(null, "", K === "s" ? "#suppliers" : K === "w" ? "#winners" : "#contractors"); } catch (x) {} render(); });
$("#q").addEventListener("input", render); ["#rg", "#cl"].forEach(function (id) { $(id).addEventListener("change", render); });
render();
''')

PAGES['entity'] = ('ملف الجهة / الشركة – صنع في مصر', 'rfq', RCSS, '''
<div id="ehero"></div>
<main class="wrap pbody2" id="top"><div class="ent" id="ent"></div></main>
''', HELP + '''
function show() {
  var id = (location.hash || "").slice(1), isA = /^r?a[0-9]/.test(id), e = isA ? REG.a(id) : REG.c(id);
  if (!e) { location.replace("winners.html"); return; }
  var aw = REG.awards.filter(function (w) { return isA ? w[2] === id : w[3] === id; }).sort(function (a, b) { return a[5] < b[5] ? 1 : -1; });
  var tot = aw.reduce(function (s, w) { return s + w[4]; }, 0), totU = aw.reduce(function (s, w) { return s + (w[9] || 0); }, 0);
  $("#ehero").innerHTML = HERO(isA ? "m1.jpg" : "m3.jpg", '<a href="' + (isA ? "agencies.html" : "winners.html") + '">' + (isA ? "الجهات الحكومية" : "الشركات الفائزة") + '</a> › ' + e[1], e[1], (isA ? LB(e[4]) + " · " + LB(e[2]) : e[2] + (e[4] !== "—" ? " · تصنيف " + e[4] : "")) + " · 📍 " + e[3], (isA ? '<a class="btn btn-gold" href="tenders.html">منافسات الجهة المفتوحة</a>' : '<button class="btn btn-gold" type="button" id="entAsk">اعرض منتجاتك على الشركة</button>') + '<button class="mig-fbtn" type="button" data-follow-kind="' + (isA ? "entity" : "search") + '" data-follow-id="' + (isA ? id : String(e[1]).replace(/["<>&]/g, "").slice(0, 150)) + '" data-follow-label="' + String(e[1]).replace(/"/g, "&quot;") + '" data-follow-url="entity.html#' + id + '" data-follow-text="' + (isA ? "تابع الجهة" : "تابع ترسيات الشركة") + '">☆ ' + (isA ? "تابع الجهة" : "تابع ترسيات الشركة") + '</button>');
  /* an agency is followed as an entity (its new tenders / awards); a winning company as a saved search on its name (its new awards) */
  if (window.MIGINQ) MIGINQ.ctx({ type: "entity", id: id, title: e[1], url: "entity.html#" + id, follow: isA ? null : { kind: "search", id: String(e[1]).replace(/["<>&]/g, "").slice(0, 150), label: e[1], url: "entity.html#" + id } });
  var ask = document.getElementById("entAsk"); if (ask) ask.onclick = function () {
    var EN = window.MIGLANG === "en";
    if (!window.MIGINQ) { toast(EN ? "The sending service did not load. Please reload the page." : "خدمة الإرسال ماتحمّلتش. حدّث الصفحة."); return; }
    /* signed in: the company is also followed (POST /api/me/follows) once the server has recorded the interest — only then is it said */
    var IN = !!(window.MIGAPI && MIGAPI.token());
    MIGINQ.dialog({ kind: "entity_contact", target_type: "entity", target_id: id, target_name: e[1], title: (EN ? "Offer your products to " : "اعرض منتجاتك على ") + e[1],
      onOk: function () { if (IN) MIGAPI.follow(isA ? "entity" : "search", isA ? id : String(e[1]).replace(/["<>&]/g, "").slice(0, 150), e[1], "entity.html#" + id).catch(function () {}); },
      intro: MIGINQ.esc(EN ? "This company is not a registered member of the platform, so the platform does not send it messages on anyone's behalf. Your interest is recorded" + (IN ? " in your account and you follow its new awards automatically" : "") + "; to contact it directly, use its official published details." : "الشركة دي مش عضو مسجّل على المنصة، فالمنصة ما بتبعتلهاش رسايل نيابةً عن حد. اهتمامك بيتسجّل" + (IN ? " في حسابك وبتتابع ترسياتها الجديدة تلقائياً" : "") + "؛ وللتواصل المباشر استخدم بياناتها الرسمية المنشورة."),
      fields: [{ k: "products", label: EN ? "Your products *" : "منتجاتك *", req: 1, full: 1 }], message: { label: EN ? "Notes" : "ملاحظات" }, submit: EN ? "Record my interest" : "سجّل اهتمامي" });
  };
  /* counterparties: EGP and USD-only values summed apart; bars sized on an EGP equivalent (USD at about EGP 50, stated under the chart when both occur) */
  var RATE = 50, by = {}, byU = {}; aw.forEach(function (w) { var k = isA ? REG.c(w[3])[1] : AG(w[2])[1]; by[k] = (by[k] || 0) + w[4]; byU[k] = (byU[k] || 0) + (w[9] || 0); });
  function eq(k) { return by[k] + byU[k] * 1e6 * RATE; }
  var keys = Object.keys(by).sort(function (a, b) { return eq(b) - eq(a); }), mx = keys.length ? eq(keys[0]) : 0, MIX = keys.some(function (k) { return byU[k]; }) && keys.some(function (k) { return by[k]; });
  var BIDS = aw.some(function (w) { return w[7] !== "—" && w[7] !== "" && w[7] != null; }), NB = aw.filter(function (w) { return typeof w[7] === "number"; });
  $("#ent").innerHTML = '<div style="display:flex;flex-direction:column;gap:18px;min-width:0"><div class="card2 cin"><h2>' + (isA ? "ترسيات الجهة" : "ترسيات الشركة") + '</h2><div class="tw2"><table><thead><tr><th>المنافسة</th><th>' + (isA ? "الفائز" : "الجهة") + '</th><th>القيمة</th>' + (BIDS ? '<th>المتقدمون</th>' : '') + '<th>التاريخ</th></tr></thead><tbody>' + aw.map(function (w) { var o = isA ? REG.c(w[3]) : AG(w[2]); return '<tr><td><b>' + w[1] + '</b><br><small class="muted" dir="ltr">' + w[0] + '</small></td><td>' + (o[0] ? '<a href="#' + o[0] + '">' + o[1] + '</a>' : o[1]) + '</td><td class="num"><b>' + amt(w[4], w[9]) + '</b></td>' + (BIDS ? '<td class="num">' + w[7] + '</td>' : '') + '<td>' + dAr(w[5]) + '</td></tr>'; }).join("") + (aw.length ? '' : '<tr><td colspan="' + (BIDS ? 5 : 4) + '" class="muted" style="text-align:center">لا توجد ترسيات مسجلة بعد.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card2 cin" style="animation-delay:.1s"><h2>' + (isA ? "أكبر الشركات الفائزة لدى الجهة" : "أكبر الجهات المتعاملة مع الشركة") + '</h2><div class="bars3">' + keys.map(function (k) { return '<div><span>' + k + '</span><span class="t"><i data-w="' + (mx > 0 ? eq(k) / mx * 100 : 0) + '"></i></span><b class="num">' + amt(by[k], byU[k]) + '</b></div>'; }).join("") + '</div>' + (MIX ? '<span class="note2">' + (window.MIGLANG === "en" ? "Bar lengths are approximate: USD values are counted at about EGP 50 per dollar." : "أطوال الأشرطة تقريبية: القيم بالدولار محسوبة بنحو 50 جنيهاً للدولار.") + '</span>' : '') + '</div></div>' +
    '<aside class="ent-side"><div class="card2"><h2>ملخص</h2><dl class="kv2"><dt>عدد الترسيات</dt><dd class="num">' + aw.length + '</dd><dt>إجمالي القيمة</dt><dd>' + (aw.length ? amt(tot, totU) : '—') + '</dd>' + (NB.length ? '<dt>متوسط المتقدمين</dt><dd class="num">' + Math.round(NB.reduce(function (s, w) { return s + w[7]; }, 0) / NB.length) + '</dd>' : '') + '<dt>المحافظة</dt><dd>' + e[3] + '</dd>' + (isA ? '<dt>القطاع</dt><dd>' + LB(e[2]) + '</dd><dt>النوع</dt><dd>' + LB(e[4]) + '</dd>' : (e[5] && e[5] !== "—" ? '<dt>التخصص</dt><dd>' + e[5] + '</dd>' : '')) + (!isA && /^https?:/.test(e[6] || "") ? '<dt>المصدر</dt><dd><a href="' + e[6] + '" target="_blank" rel="noopener">الموقع / المصدر ↗</a></dd>' : '') + '</dl><span class="note2">المصدر: الترسيات والمناقصات المعلنة رسمياً.</span></div>' +
    '<div class="card2"><h2>روابط</h2><a class="btn btn-line" href="winners.html">كل الترسيات</a><a class="btn btn-line" href="agencies.html">الجهات الحكومية</a><a class="btn btn-line" href="contractors.html">دليل المقاولين</a></div></aside>';
  setTimeout(function () { $$(".bars3 i").forEach(function (i) { i.style.width = i.dataset.w + "%"; }); }, 120);
  window.scrollTo(0, 0);
}
show(); window.addEventListener("hashchange", show);
''')
HEROS['winners'] = ('m3.jpg', '<a href="tenders.html">طلبات الأسعار</a> › الشركات الفائزة', 'الشركات الفائزة ونتائج الترسية', 'من فاز بكل منافسة، وبكم، ولدى أي جهة. اقرأ السوق قبل تسعير عرضك القادم.', '<a class="btn btn-gold" href="agencies.html">الجهات الحكومية</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="contractors.html">دليل المقاولين</a>')
HEROS['agencies'] = ('m1.jpg', '<a href="tenders.html">طلبات الأسعار</a> › الجهات الحكومية', 'الجهات الحكومية', 'الجهات الحكومية وشبه الحكومية الطارحة للمنافسات في محافظات مصر الـ27، وترسياتها، وأكبر الشركات الفائزة لديها.', '<a class="btn btn-gold" href="winners.html">الشركات الفائزة</a>')
HEROS['contractors'] = ('m0.jpg', '<a href="projects.html">المشاريع</a> › دليل المقاولين', 'دليل المقاولين والموردين', 'المنشآت المدرجة في دليل المنصة ضمن قطاع المقاولات والإنشاءات، ومصانع وشركات مصرية موثّقة من فريق المنصة بترسياتها المعلنة، بتخصصاتها ومحافظاتها.', '<a class="btn btn-gold" href="leads.html">طلبات المواد من المقاولين</a>')

en_add([("قطاع المقاولات والإنشاءات", "Contracting & Construction sector"), ("مصانع وشركات موثّقة من فريق المنصة", "Factories & companies verified by the platform team"), ("مقاولون فائزون بترسيات معلنة", "Contractors with published contract awards"), ("المنشآت المدرجة في دليل المنصة ضمن قطاع المقاولات والإنشاءات، ومصانع وشركات مصرية موثّقة من فريق المنصة بترسياتها المعلنة، بتخصصاتها ومحافظاتها.", "Listings in the platform directory under the Contracting & Construction sector, and Egyptian factories and companies verified by the platform team with their published awards, by speciality and governorate."), ("اعرض منتجاتك على الشركة", "Offer your products to the company"), ("تابع الجهة", "Follow the entity"), ("تابع الشركة", "Follow the company")])
