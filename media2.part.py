# Media center split into its own pages: news.html, videos.html, events.html (calendar), event.html#id (one exhibition)
_mc = PAGES['media-center']
_TABS_OLD = '<div class="seg2" id="mtabs" role="tablist"><button class="on" data-k="news">📰 البوابة الإخبارية</button><button data-k="videos">🎥 المرئيات واللقاءات</button><button data-k="events">📅 المعارض والفعاليات</button></div>'
def _tabs(on):
    return '<div class="seg2" id="mtabs" role="tablist">' + ''.join('<a class="%s" href="%s" style="padding:7px 14px;border-radius:10px;font-weight:700;%s">%s</a>' % ('on' if k == on else '', h, 'background:var(--green);color:#fff' if k == on else 'color:var(--fg)', t) for k, h, t in [('hub', 'media-center.html', '🗂️ المركز الإعلامي'), ('news', 'news.html', '📰 البوابة الإخبارية'), ('videos', 'videos.html', '🎥 المرئيات واللقاءات'), ('events', 'events.html', '📅 المعارض والفعاليات')]) + '</div>'
assert _TABS_OLD in _mc[3]
_HUB = '''<section class="mhub" aria-label="أقسام المركز الإعلامي">
  <a class="mh" href="news.html"><span class="im" style="background-image:url(img/e0.jpg)"></span><span class="tx"><b>📰 البوابة الإخبارية</b><small>أخبار الصناعة والاستثمار والتصدير في مصر بمصادرها الأصلية</small><em id="hN"></em><i>ادخل الصفحة ←</i></span></a>
  <a class="mh" href="videos.html"><span class="im" style="background-image:url(img/v0.jpg)"></span><span class="tx"><b>🎥 المرئيات واللقاءات</b><small>فيديوهات ولقاءات من القنوات الرسمية والإخبارية عن الصناعة المصرية</small><em id="hV"></em><i>ادخل الصفحة ←</i></span></a>
  <a class="mh" href="events.html"><span class="im" style="background-image:url(img/m3.jpg)"></span><span class="tx"><b>📅 المعارض والفعاليات</b><small>رزنامة المعارض والمؤتمرات الصناعية القادمة في مصر</small><em id="hE"></em><i>ادخل الصفحة ←</i></span></a>
</section>
<script>window.addEventListener("load",function(){function c(id,n,w){var e=document.getElementById(id);if(e)e.textContent=n+" "+w;}c("hN",((window.REAL&&REAL.news)||[]).length,"خبر");c("hV",(window.MIGVIDS||[]).length,"فيديو");c("hE",((window.REAL&&REAL.events)||[]).length,"فعالية");});</script>
'''
_HUB_CSS = '''
#news,#videos,#events{display:none!important}
.mhub{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-block:8px 30px}
.mh{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;color:var(--fg);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
.mh:hover{transform:translateY(-4px);border-color:var(--green);box-shadow:0 18px 30px -22px rgba(0,0,0,.45)}
.mh .im{aspect-ratio:16/9;background-size:cover;background-position:center}
.mh .tx{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px}
.mh b{font-size:1.15rem}.mh small{color:var(--muted);line-height:1.6}
.mh em{font-style:normal;font-weight:800;color:var(--green)}.mh i{font-style:normal;font-weight:800;color:var(--gold,#C09300);margin-top:4px}
@media(max-width:860px){.mhub{grid-template-columns:1fr}}
'''
PAGES['media-center'] = (_mc[0], _mc[1], _mc[2] + _HUB_CSS, _mc[3].replace(_TABS_OLD, _tabs('hub') + _HUB), _mc[4])
for _k, _t, _hide in [('news', 'أخبار الصناعة – صنع في مصر', '#videos,#events'), ('videos', 'المرئيات واللقاءات الصناعية – صنع في مصر', '#news,#events')]:
    PAGES[_k] = (_t, 'media', _mc[2] + _hide + '{display:none!important}', _mc[3].replace(_TABS_OLD, _tabs(_k)), _mc[4])
HEROS['news'] = ('e0.jpg', '<a href="media-center.html">المركز الإعلامي</a> › الأخبار', 'البوابة الإخبارية', 'آخر أخبار الصناعة المصرية والاستثمار والتصدير، بمصادرها الأصلية.', '')
HEROS['videos'] = ('v0.jpg', '<a href="media-center.html">المركز الإعلامي</a> › المرئيات', 'المرئيات واللقاءات الصناعية', 'لقاءات ومؤتمرات وجولات مرئية في القطاع الصناعي المصري.', '')

EV_JS = r'''
var EVI = [["البناء", "m3"], ["إنشاء", "m3"], ["الأغذية", "m2"], ["غذائ", "m2"], ["زراع", "m2"], ["التعدين", "m4"], ["المعادن", "m4"], ["المياه", "e3"], ["الطاقة", "e3"], ["البلاستيك", "m1"], ["البتروكيماويات", "m1"], ["الكيماويات", "m1"], ["الطباعة", "p6"], ["التغليف", "p6"], ["السيارات", "e0"], ["الأمن", "e2"], ["الصحة", "e1"], ["الأدوية", "e1"], ["الصناع", "m0"]];
function evImg(e) { if (e.image_file) return e.image_file; var t = (e.sector_ar || "") + " " + e.name_ar; for (var i = 0; i < EVI.length; i++) if (t.indexOf(EVI[i][0]) > -1) return "img/" + EVI[i][1] + ".jpg"; return "img/e2.jpg"; }
var EN = window.MIGLANG === "en";
var EV2 = ((window.REAL && REAL.events) || []).map(function (e, i) { if (!e.id) e.id = "ev" + (i + 1); e.img = evImg(e); if (EN && e.name_en && !e._en) { e._en = 1; e._ar = e.name_ar; e.name_ar = e.name_en; } return e; }).sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
function dF(d, o) { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", o || { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00")); }
function ymd(d, add) { var p = String(d).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + (add || 0))).toISOString().slice(0, 10).replace(/-/g, ""); }
function T(s) { return EN && s && window.MIGTR ? MIGTR(s) : s; }
/* organizer name; in English drop a parenthesised duplicate such as "Informa Markets (Informa Markets)" */
function org(o) { if (!o || !EN) return o; var m = /^(.*\S)\s*\(([^()\u0600-\u06FF]+)\)$/.exec(o); if (m) { var t = T(m[1]); if (t === m[1] || t.trim().toLowerCase() === m[2].trim().toLowerCase()) return m[2]; } var r = T(o), m2 = /^(.*\S)\s*\(([^()]+)\)$/.exec(r); return m2 && m2[1].trim().toLowerCase() === m2[2].trim().toLowerCase() ? m2[1] : r; }
function loc(e) { return (e.venue ? T(e.venue) + ", " : "") + T(e.city); }
function ics(e) { var f = ymd; return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//madeinegyptgate//events//AR\r\nBEGIN:VEVENT\r\nUID:" + e.id + "@madeinegyptgate.com\r\nDTSTART;VALUE=DATE:" + f(e.start_date) + "\r\nDTEND;VALUE=DATE:" + f(e.end_date || e.start_date, 1) + "\r\nSUMMARY:" + e.name_ar + "\r\nLOCATION:" + loc(e) + "\r\nURL:" + e.url + "\r\nEND:VEVENT\r\nEND:VCALENDAR"; }
function gcal(e) { var f = ymd; return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.name_ar) + "&dates=" + f(e.start_date) + "/" + f(e.end_date || e.start_date, 1) + "&location=" + encodeURIComponent(loc(e)) + "&details=" + encodeURIComponent(e.url); }
function dlIcs(e) { var u = URL.createObjectURL(new Blob([ics(e)], { type: "text/calendar" })), a = document.createElement("a"); a.href = u; a.download = e.id + ".ics"; document.body.appendChild(a); a.click(); a.remove(); }
'''
EV_CSS = COMMON_CSS + '''
.cal { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 14px; }
.calh { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.calh h2 { font-size: 1.15rem; } .calh button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-size: 1.1rem; color: var(--green); }
.calg { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.calg .dn { text-align: center; font-size: .74rem; color: var(--muted); font-weight: 700; padding: 4px 0; }
.calg .d { min-height: 78px; border: 1px solid var(--line); border-radius: 10px; padding: 4px 6px; font-size: .76rem; display: flex; flex-direction: column; gap: 3px; background: var(--surface); min-width: 0; }
.calg .d.o { opacity: .35; } .calg .d.t { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.calg .d b { font-size: .8rem; color: var(--muted); }
.calg .d a { display: block; background: var(--green); color: #fff; border-radius: 6px; padding: 1px 6px; font-size: .68rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.evc { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; color: var(--fg); display: flex; flex-direction: column; transition: transform .2s ease, border-color .2s ease; }
.evc:hover { transform: translateY(-4px); border-color: var(--green); }
.evc .im { position: relative; aspect-ratio: 16/8; background-size: cover; background-position: center; }
.evc .dt { position: absolute; top: 10px; inset-inline-start: 10px; background: #fff; color: var(--green-deep); border-radius: 10px; padding: 4px 10px; text-align: center; font-weight: 900; line-height: 1.2; box-shadow: 0 6px 16px -8px rgba(0,0,0,.4); } .evc .dt small { display: block; font-size: .68rem; font-weight: 700; color: var(--muted); }
.evc .b { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 5px; } .evc h3 { font-size: .98rem; line-height: 1.5; } .evc .m { font-size: .8rem; color: var(--muted); }
.evf { display: flex; gap: 8px; flex-wrap: wrap; }
.evf select, .evf input { max-width: 100%; min-width: 0; font: inherit; font-size: .88rem; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; background: var(--surface); color: var(--fg); }
.evd { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
.agd { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.agd li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; background: var(--sunken); border-radius: 12px; padding: 10px 12px; font-size: .88rem; } .agd b { color: var(--green); }
.cd4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; } .cd4 div { background: var(--green-deep); color: #fff; border-radius: 10px; padding: 8px 0; } .cd4 b { display: block; font-size: 1.4rem; } .cd4 small { font-size: .7rem; opacity: .8; }
.emap { height: 220px; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: #e8f0ec; } .emap canvas { width: 100%; height: 100%; display: block; }
@media (max-width: 1000px) { .evgrid { grid-template-columns: 1fr 1fr; } .evd { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .evf input, .evf select { flex: 1 1 100%; } .calg .dn { font-size: .68rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .evgrid { grid-template-columns: 1fr; } .calg .d { min-height: 54px; } .calg .d a { font-size: 0; height: 8px; padding: 0; } }
'''
PAGES['events'] = ('المعارض والفعاليات – صنع في مصر', 'media', EV_CSS, '''
%HERO%
<main class="wrap pbody2" id="top">
''' + _tabs('events') + '''
  <div class="cal"><div class="calh"><button type="button" id="cP" aria-label="الشهر السابق">›</button><h2 id="cT"></h2><button type="button" id="cN" aria-label="الشهر التالي">‹</button></div><div class="calg" id="cG"></div></div>
  <div class="evf"><input type="search" id="eq" placeholder="ابحث عن معرض…" aria-label="بحث"><select id="ecity"><option value="">كل المدن</option></select><select id="esec"><option value="">كل القطاعات</option></select><span class="chip chip-green" id="ecnt"></span></div>
  <div class="evgrid" id="eG"></div>
  <span class="note2">المواعيد من المواقع الرسمية للمنظّمين؛ تحقق من الموقع الرسمي قبل السفر.</span>
</main>
''', EV_JS + r'''
var cur = EV2.length ? new Date(EV2[0].start_date + "T12:00:00") : new Date(); cur.setDate(1);
function cal() {
  $("#cT").textContent = dF(cur.toISOString().slice(0, 10), { month: "long", year: "numeric" });
  var first = new Date(cur), start = new Date(first); start.setDate(1 - ((first.getDay() + 1) % 7));
  var DN = EN ? ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] : ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"], h = DN.map(function (d) { return '<div class="dn">' + d + '</div>'; }).join(""), today = new Date().toISOString().slice(0, 10);
  for (var i = 0; i < 42; i++) { var d = new Date(start); d.setDate(start.getDate() + i); var iso = d.toISOString().slice(0, 10), evs = EV2.filter(function (e) { return iso >= e.start_date && iso <= (e.end_date || e.start_date); });
    h += '<div class="d' + (d.getMonth() !== cur.getMonth() ? " o" : "") + (iso === today ? " t" : "") + '"><b class="num">' + d.getDate() + '</b>' + evs.map(function (e) { return '<a href="event.html#' + e.id + '" title="' + e.name_ar + '">' + e.name_ar + '</a>'; }).join("") + '</div>'; }
  $("#cG").innerHTML = h;
}
$("#cP").onclick = function () { cur.setMonth(cur.getMonth() - 1); cal(); }; $("#cN").onclick = function () { cur.setMonth(cur.getMonth() + 1); cal(); };
function uq(f) { var u = []; EV2.forEach(function (e) { var v = f(e); if (v && u.indexOf(v) < 0) u.push(v); }); return u; }
$("#ecity").innerHTML += uq(function (e) { return e.city; }).map(function (c) { return "<option>" + c + "</option>"; }).join(""); $("#esec").innerHTML += uq(function (e) { return e.sector_ar; }).map(function (c) { return "<option>" + c + "</option>"; }).join("");
function hay(e) { var H = window.MIGHAY || function () { return ""; }; if (e._h == null) e._h = ([e._ar || e.name_ar, e.name_en, e.city, e.venue, e.organizer, e.sector_ar].join(" ") + H(e._ar || e.name_ar) + H(e.city) + H(e.venue) + H(e.organizer) + H(e.sector_ar)).toLowerCase(); return e._h; }
function grid() { var q = $("#eq").value.trim().toLowerCase(), c = $("#ecity").value, s = $("#esec").value; var l = EV2.filter(function (e) { return (!q || hay(e).indexOf(q) > -1) && (!c || e.city === c) && (!s || e.sector_ar === s); });
  $("#ecnt").textContent = l.length + " معرض وفعالية"; $("#eG").innerHTML = l.map(function (e) { var s0 = e.start_date, s1 = e.end_date || s0, my = { month: "short", year: "numeric" }, mo = s0.slice(0, 7) === s1.slice(0, 7) ? dF(s0, my) : s0.slice(0, 4) === s1.slice(0, 4) ? dF(s0, { month: "short" }) + " – " + dF(s1, my) : dF(s0, my) + " – " + dF(s1, my); return '<a class="evc" href="event.html#' + e.id + '"><span class="im" style="background-image:url(' + e.img + ')"><span class="dt"><span class="num">' + (+s0.slice(8, 10)) + (s1 !== s0 ? "–" + (+s1.slice(8, 10)) : "") + '</span><small>' + mo + '</small></span></span><span class="b"><span class="chip chip-gold" style="align-self:flex-start">' + (e.sector_ar || "معرض") + '</span><h3>' + e.name_ar + '</h3><span class="m">📍 ' + e.city + (e.venue ? " · " + e.venue : "") + '</span><span class="m">🏢 <span>' + (org(e.organizer) || "—") + '</span></span></span></a>'; }).join(""); }
$("#eq").addEventListener("input", grid); ["#ecity", "#esec"].forEach(function (i) { $(i).addEventListener("change", grid); });
cal(); grid();
''')
HEROS['events'] = ('e2.jpg', '<a href="media-center.html">المركز الإعلامي</a> › المعارض والفعاليات', 'رزنامة المعارض والفعاليات', 'المعارض والمؤتمرات الصناعية في مصر: الرزنامة الشهرية، والتواريخ، والأماكن، وبيانات المنظّمين.', '')

PAGES['event'] = ('تفاصيل المعرض – صنع في مصر', 'media', EV_CSS, '''
<section class="phero"><span class="bg" id="evBg" style="background-image:url(img/e2.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="events.html">المعارض والفعاليات</a></nav><span class="chip chip-gold" id="evSec" style="align-self:flex-start"></span><h1 id="evT">معرض</h1><p id="evS"></p><div class="acts" id="evA"></div></div></section>
<main class="wrap pbody2" id="top"><div class="evd" id="evD"></div></main>
''', 'window.GEOC = ' + _GEO + ';\n' + EV_JS + r'''
var id = (location.hash || "").slice(1), e = EV2.filter(function (x) { return x.id === id; })[0];
if (!e) $("#evD").innerHTML = '<div class="card2">لم يُعثر على المعرض. <a href="events.html">كل المعارض ←</a></div>';
else {
  document.title = e.name_ar + " – المعارض والفعاليات"; $("#evT").textContent = e.name_ar;
  if (window.MIGINQ) MIGINQ.ctx({ type: "event", id: String(e.id), title: e.name_ar, url: "event.html#" + e.id }); $("#evSec").textContent = e.sector_ar || "معرض";
  $("#evS").textContent = dF(e.start_date) + (e.end_date && e.end_date !== e.start_date ? " – " + dF(e.end_date) : "") + " · " + e.city; $("#evBg").style.backgroundImage = "url(" + e.img + ")";
  $("#evA").innerHTML = '<a class="btn btn-gold" href="' + e.url + '" target="_blank" rel="noopener">الموقع الرسمي والتسجيل ↗</a><button class="btn" style="background:rgba(255,255,255,.14);color:#fff" type="button" id="ics">📅 أضف إلى التقويم</button>';
  var days = Math.max(1, Math.round((new Date((e.end_date || e.start_date) + "T12:00:00") - new Date(e.start_date + "T12:00:00")) / 864e5) + 1), AG = [];
  for (var i = 0; i < days; i++) { var dd = new Date(e.start_date + "T12:00:00"); dd.setDate(dd.getDate() + i); AG.push([dF(dd.toISOString().slice(0, 10), { weekday: "long", day: "numeric", month: "short" }), i === 0 ? "اليوم الأول للحدث" : i === days - 1 ? "اليوم الختامي للحدث" : "اليوم " + (i + 1) + " من أيام الحدث"]); }
  $("#evD").innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div class="card2"><h2>عن الحدث</h2><p>' + (EN ? e.name_ar + ' is a specialized ' + MIGTR(e.sector_ar || "industry") + ' event in ' + T(e.city) + (e.venue ? ' at ' + T(e.venue) : '') + ', organized by ' + (org(e.organizer) || 'the organizer') + '.' : e.name_ar + (e.name_en ? ' <span class="muted" dir="ltr">(' + e.name_en + ')</span>' : '') + ' — ' + (e.sector_ar ? 'حدث متخصص في قطاع ' + e.sector_ar + '، ' : '') + 'يُقام في ' + e.city + (e.venue ? ' بمقر ' + e.venue : '') + (e.organizer ? ' بتنظيم ' + e.organizer : '') + '.') + '</p>' + (!EN && e.about_ar ? '<p>' + e.about_ar + '</p>' : '') + '<img src="' + e.img + '" alt="' + e.name_ar + '" style="width:100%;border-radius:14px;aspect-ratio:16/7;object-fit:cover"></div>'
    + (!EN && e.agenda_ar && e.agenda_ar.length ? '<div class="card2"><h2>أبرز محاور الحدث</h2><ul class="agd">' + e.agenda_ar.map(function (a, i) { return '<li><b class="num">' + (i + 1) + '</b><span>' + a + '</span></li>'; }).join("") + '</ul></div>' : '') + '<div class="card2"><h2>أيام الحدث</h2><ul class="agd">' + AG.map(function (a) { return '<li><b>' + a[0] + '</b><span>' + a[1] + '</span></li>'; }).join("") + '</ul><span class="note2">البرنامج التفصيلي والجلسات ومواعيد الدخول تُنشر على الموقع الرسمي للمنظّم.</span></div></div>'
    + '<aside style="display:flex;flex-direction:column;gap:14px"><div class="card2"><h2>⏳ يبدأ بعد</h2><div class="cd4" id="cd"></div></div><div class="card2"><h2>المكان والتاريخ</h2><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:.88rem"><dt class="muted">التاريخ</dt><dd style="margin:0;font-weight:700">' + dF(e.start_date) + (e.end_date && e.end_date !== e.start_date ? ' – ' + dF(e.end_date) : '') + '</dd><dt class="muted">المدينة</dt><dd style="margin:0;font-weight:700">' + e.city + '</dd><dt class="muted">المقر</dt><dd style="margin:0;font-weight:700">' + (e.venue || "يُعلن على الموقع الرسمي") + '</dd></dl><div class="emap"><canvas id="emap"></canvas></div><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((e.venue ? T(e.venue) + " " : "") + T(e.city)) + '">افتح في خرائط Google ↗</a></div>'
    + '<div class="card2"><h2>بيانات التواصل</h2><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:.88rem"><dt class="muted">المنظّم</dt><dd style="margin:0;font-weight:700">' + (org(e.organizer) || "—") + '</dd><dt class="muted">الموقع</dt><dd style="margin:0"><a href="' + e.url + '" target="_blank" rel="noopener" dir="ltr">' + e.url.replace(/^https?:\/\//, "").replace(/\/$/, "") + ' ↗</a></dd></dl><a class="btn btn-green btn-sm" href="' + gcal(e) + '" target="_blank" rel="noopener">إضافة إلى تقويم Google</a></div></aside>';
  $("#ics").onclick = function () { dlIcs(e); };
  (function tick() { var ms = new Date(e.start_date + "T09:00:00") - new Date(); if (ms < 0) { $("#cd").innerHTML = '<div style="grid-column:1/-1">بدأ الحدث أو انتهى</div>'; return; } var dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5), mm = Math.floor(ms % 36e5 / 6e4), ss = Math.floor(ms % 6e4 / 1e3); $("#cd").innerHTML = [[dd, "يوم"], [hh, "ساعة"], [mm, "دقيقة"], [ss, "ثانية"]].map(function (x) { return '<div><b class="num">' + x[0] + '</b><small>' + x[1] + '</small></div>'; }).join(""); setTimeout(tick, 1000); })();
  (function () { var c = $("#emap"); if (!c || !window.WORLD) return; var r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1; c.width = r.width * dpr; c.height = r.height * dpr; var x = c.getContext("2d"); x.scale(dpr, dpr); var W = r.width, H = r.height, B = [24.6, 21.8, 37.1, 31.8]; function m(l) { return Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360)); } var y1 = m(B[3]), y0 = m(B[1]), sc = Math.min(W / (B[2] - B[0]), H / ((y1 - y0) * 180 / Math.PI)) * .92, ox = (W - (B[2] - B[0]) * sc) / 2, oy = (H - (y1 - y0) * 180 / Math.PI * sc) / 2; function P(lo, la) { return [ox + (lo - B[0]) * sc, oy + (y1 - m(la)) * 180 / Math.PI * sc]; }
    WORLD.forEach(function (f) { x.beginPath(); f.c.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt, i) { var p = P(pt[0], pt[1]); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); }); }); x.fillStyle = f.id === "818" ? "#C8102E" : "#cfdcd4"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = .6; x.stroke(); });
    var G2 = window.GEOC || {}, g = G2[e.city] || G2[e.region_code] || (window.MIGREG ? G2[MIGREG.of(e.city)] : null); if (g) { var p = P(g[0], g[1]); x.beginPath(); x.arc(p[0], p[1], 10, 0, 7); x.fillStyle = "rgba(192,147,0,.35)"; x.fill(); x.beginPath(); x.arc(p[0], p[1], 5, 0, 7); x.fillStyle = "#C09300"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke(); } })();
  window.__seoDone = 1; setTimeout(function () { if (window.MIGSEO) MIGSEO(document.title, EN ? (e.name_en || e.name_ar) + " in " + T(e.city) + ", " + dF(e.start_date) + (e.end_date && e.end_date !== e.start_date ? " – " + dF(e.end_date) : "") + "." : e.name_ar + " في " + e.city + " من " + e.start_date + (e.end_date ? " إلى " + e.end_date : "") + ".", { "@context": "https://schema.org", "@type": "Event", name: e.name_ar, startDate: e.start_date, endDate: e.end_date || e.start_date, location: { "@type": "Place", name: T(e.venue || e.city), address: { "@type": "PostalAddress", addressLocality: T(e.city), addressCountry: "EG" } }, organizer: { "@type": "Organization", name: org(e.organizer), url: e.url }, image: "https://madeinegyptgate.com/" + e.img, eventStatus: "https://schema.org/EventScheduled" }); }, 0);
}
window.addEventListener("hashchange", function () { location.reload(); });
''')
