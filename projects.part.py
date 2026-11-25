# -*- coding: utf-8 -*-
PCSS = COMMON_CSS + '''
.stg-bar { display: flex; gap: 3px; }
.stg-bar i { flex: 1; height: 6px; border-radius: 99px; background: var(--sunken); }
.stg-bar i.on { background: var(--green); }
.stg-bar i.now { background: var(--gold); animation: blink 1.4s ease-in-out infinite; }
@keyframes blink { 50% { opacity: .45; } }
.pgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.pj { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; color: var(--fg); transition: transform .25s ease, box-shadow .25s ease; }
.pj:hover { transform: translateY(-5px); box-shadow: 0 18px 34px -20px rgba(0,0,0,.4); }
.pj .top { min-height: 140px; justify-content: flex-end; padding: 14px 16px; background: linear-gradient(135deg, var(--green-deep), var(--green)); color: #fff; display: flex; flex-direction: column; gap: 4px; }
.pj .top b { font-size: 1.02rem; line-height: 1.5; }
.pj .top small { opacity: .85; }
.pj .b { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.pj .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: .84rem; }
.pj .kv dt { color: var(--muted); } .pj .kv dd { margin: 0; font-weight: 600; }
.pj .ft { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 6px; }
.big-val { font-size: 1.3rem; font-weight: 800; color: var(--gold-deep); }
.pstats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.pstats a { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; color: var(--fg); border-inline-start: 4px solid var(--gold); transition: transform .2s ease; }
.pstats a:hover { transform: translateY(-3px); }
.pstats b { display: block; font-size: 1.6rem; font-weight: 800; color: var(--green); }
.pstats span { font-size: .82rem; color: var(--muted); }
.lk { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; transition: border-color .2s ease, transform .2s ease; }
.lk:hover { border-color: var(--gold); transform: translateX(-4px); }
.lk .av { width: 54px; height: 54px; border-radius: 14px; display: grid; place-items: center; font-size: 1.5rem; background: var(--green-soft); }
.lk .av.cs { background: var(--gold-soft); }
.lk h3 { font-size: 1rem; font-weight: 800; line-height: 1.5; }
.lk .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .8rem; color: var(--muted); }
.lk .act { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.locked { display: inline-flex; align-items: center; gap: 6px; font-size: .78rem; color: var(--muted); background: var(--sunken); border-radius: 8px; padding: 3px 8px; filter: blur(.2px); }
.ov2 { position: fixed; inset: 0; background: rgba(4,15,9,.6); z-index: 70; display: grid; place-items: center; padding: 16px; }
.ov2 .box { background: var(--surface); border-radius: 18px; width: min(520px, 100%); padding: 22px; display: flex; flex-direction: column; gap: 12px; animation: cin .35s ease; max-height: 100%; overflow: auto; }
.pk { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
.pk b { font-size: .92rem; }
.tl2 { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
.tl2 li { display: grid; grid-template-columns: 110px 18px 1fr; gap: 10px; align-items: start; }
.tl2 li .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--green); margin-top: 5px; position: relative; }
.tl2 li .dot::after { content: ""; position: absolute; top: 14px; inset-inline-start: 6px; width: 2px; height: 40px; background: var(--line); }
.tl2 li:last-child .dot::after { display: none; }
.tl2 li small { color: var(--muted); font-size: .8rem; padding-top: 2px; }
.tl2 li p { padding-bottom: 16px; }
.stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.stages li { text-align: center; font-size: .74rem; display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; }
.stages .d { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--line); background: var(--surface); display: grid; place-items: center; font-size: .7rem; font-weight: 800; z-index: 1; }
.stages li.done .d { background: var(--green); border-color: var(--green); color: #fff; }
.stages li.now .d { background: var(--gold); border-color: var(--gold); box-shadow: 0 0 0 6px rgba(192,147,0,.25); }
.stages li::before { content: ""; position: absolute; top: 13px; inset-inline-start: -50%; width: 100%; height: 3px; background: var(--line); }
.stages li:first-child::before { display: none; }
.stages li.done::before, .stages li.now::before { background: var(--green); }
.pdet { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.pside { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 84px); }
.ring { width: 130px; height: 130px; margin: 0 auto; }
@media (max-width: 1000px) { .pgrid { grid-template-columns: 1fr 1fr; } .pstats { grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .pdet { grid-template-columns: 1fr; } .pside { position: static; } }
@media (max-width: 600px) { .pgrid { grid-template-columns: 1fr; } .lk { grid-template-columns: 44px minmax(0,1fr); } .lk .act { grid-column: 1 / -1; flex-direction: row; } .lk .act .btn { flex: 1; } .stages { font-size: .62rem; } .stages li { font-size: .62rem; } .tl2 li { grid-template-columns: 84px 18px 1fr; } .pk { grid-template-columns: minmax(0, 1fr) auto; } .pk > :last-child { grid-column: 1 / -1; justify-self: stretch; } }
'''

LEAD_MODAL_JS = '''
function leadModal(id) {
  var l = MIG.LEADS.filter(function (x) { return x[0] === id; })[0]; if (!l) return;
  if (window.MIGPLAN && !MIGPLAN.can("projects")) { try { sessionStorage.setItem("mig-gate", "التواصل بخصوص طلب: " + l[4]); } catch (x) {} location.href = "register.html#partner"; return; }
  if (!window.MIGINQ) { toast(window.MIGLANG === "en" ? "The sending service did not load. Please reload the page." : "خدمة الإرسال ماتحمّلتش. حدّث الصفحة."); return; }
  var EN = window.MIGLANG === "en";
  MIGINQ.dialog({ kind: "lead_interest", target_type: "lead", target_id: l[0], target_name: l[4] + " – " + l[2], title: EN ? "Register interest in this supply item" : "سجّل اهتمامك بالبند ده",
    intro: MIGINQ.esc(EN ? "Your interest is recorded in your account and you are notified automatically of updates. The platform does not pass messages to parties that are not registered members." : "اهتمامك بيتسجّل في حسابك وبتوصلك التحديثات تلقائياً. المنصة ما بتبعتش رسايل لأطراف مش أعضاء مسجّلين."),
    fields: [{ k: "products", label: EN ? "What you can supply" : "اللي تقدر توّرده", full: 1 }], message: { label: EN ? "Notes" : "ملاحظات" }, payload: { material: l[4], project: l[3], governorate: l[7] }, submit: EN ? "Record my interest" : "سجّل اهتمامي" });
}
document.addEventListener("click", function (e) { var b = e.target.closest("[data-lead]"); if (b) { e.preventDefault(); leadModal(b.dataset.lead); } });
/* lead types: contractor / consultant (only where the project names one) / owner (project owner or developer) */
function leadT(l) { return l[1] === "contractor" ? ["مقاول", "chip-green", "🏗️", ""] : l[1] === "consultant" ? ["استشاري", "chip-gold", "📐", " cs"] : ["المالك", "chip-gray", "🏢", " cs"]; }
function HAY(a) { return a.map(function (s) { s = String(s == null ? "" : s); return s + " " + (window.MIGHAY ? MIGHAY(s) : ""); }).join(" ").toLowerCase(); }
function leadRow(l, i) { var p = MIG.proj(l[3]), T = leadT(l); return '<article class="lk cin" style="animation-delay:' + Math.min(i || 0, 10) * 50 + 'ms"><span class="av' + T[3] + '">' + T[2] + '</span><div style="min-width:0;display:flex;flex-direction:column;gap:5px"><div style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip ' + T[1] + '">' + T[0] + '</span></div><h3><a href="lead.html#' + l[0] + '" style="color:inherit">' + l[4] + ((l[5] + ' ' + l[6]).trim() ? ' — ' + (l[5] + ' ' + l[6]).trim() : '') + '</a></h3><div class="meta"><span>🏢 الجهة المرتبطة: ' + l[2] + '</span><span>📍 ' + l[7] + '</span>' + (p ? '<a href="project.html#' + p[0] + '">🏗️ ' + p[1] + '</a>' : '') + (l[9] !== "—" && l[9] !== "غير معلنة" ? '<span>💰 ' + l[9] + ' جنيه</span>' : '') + '</div><span class="muted" style="font-size:.82rem">' + l[10] + '</span>' + (l[11] ? '<span class="locked">🔗 التسجيل من البوابة الرسمية للشركة</span>' : '<span class="locked">🔒 بيانات التواصل تظهر بعد موافقة الطرف الطالب</span>') + '</div><div class="act"><a class="btn btn-sm btn-green" href="lead.html#' + l[0] + '">التفاصيل</a>' + (l[11] ? '<a class="btn btn-sm btn-gold" href="' + l[11] + '" target="_blank" rel="noopener">سجّل كمورد ↗</a>' : '<button class="btn btn-sm btn-gold" type="button" data-lead="' + l[0] + '">اطلب تواصل</button>') + (p ? '<a class="btn btn-sm btn-line" href="project.html#' + p[0] + '">المشروع</a>' : '') + '</div></article>'; }
'''

def stage_bar_js():
    return 'function stageBar(s) { var h = ""; for (var i = 0; i < 7; i++) h += \'<i class="\' + (i < s ? "on" : i === s ? "now" : "") + \'"></i>\'; return \'<span class="stg-bar" title="\' + MIG.STAGES[s] + \'">\' + h + "</span>"; }'

PAGES['projects'] = ('مشاريع مصر – صنع في مصر', 'projects', PCSS, '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="pstats" id="pstats"></div>
  <div class="tools2"><input type="search" id="q" placeholder="ابحث باسم المشروع أو المدينة أو المادة المطلوبة…" aria-label="بحث"><select id="r" aria-label="المحافظة"><option value="">كل المحافظات</option></select><select id="s" aria-label="القطاع"><option value="">كل القطاعات</option></select><select id="st" aria-label="المرحلة"><option value="">كل المراحل</option></select><select id="o" aria-label="الترتيب"><option value="v">الأعلى قيمة</option><option value="n">الأحدث بدءاً</option></select></div>
  <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span id="cnt" class="muted"></span><span class="note2">مشاريع معلنة من مصادرها الرسمية، ورابط المصدر في صفحة كل مشروع.</span></div>
  <div class="pgrid" id="grid"></div>
</main>
''', LEAD_MODAL_JS + stage_bar_js() + '''
var P = MIG.PROJECTS;
$("#r").innerHTML = MIGREG.opts(MIGREG.take());
$("#s").innerHTML += MIG.SECTORS.filter(function (x) { return P.some(function (p) { return p[4] === x; }); }).map(function (x) { return "<option>" + x + "</option>"; }).join("");
$("#st").innerHTML += MIG.STAGES.map(function (x, i) { return '<option value="' + i + '">' + x + "</option>"; }).join("");
var tot = P.reduce(function (a, p) { return a + (p[6] || 0); }, 0), withV = P.filter(function (p) { return p[6]; }).length;
$("#pstats").innerHTML = '<a href="#top"><b class="num">' + P.length + '</b><span>مشروع معلن بمصدره</span></a>' + (withV ? '<a href="#top"><b>' + MIG.fmtVal(tot) + '</b><span>جنيه القيمة المعلنة لـ<span class="num">' + withV + '</span> مشروع</span></a>' : '') + '<a href="project-news.html"><b class="num">' + MIG.NEWS.length + '</b><span>خبر عن المشاريع</span></a>';
var h = (location.hash || "").slice(1); if (h.indexOf("sector-") === 0) { var si = +h.slice(7); if (MIG.SECTORS[si]) $("#s").value = MIG.SECTORS[si]; }
try { var q0 = sessionStorage.getItem("mig-pq"); if (q0) { $("#q").value = q0; sessionStorage.removeItem("mig-pq"); } } catch (x) {}
function render() {
  var q = $("#q").value.trim().toLowerCase(), r = $("#r").value, s = $("#s").value, st = $("#st").value, o = $("#o").value;
  var l = P.filter(function (p) { return (!r || MIGREG.of(p[2]) === r) && (!s || p[4] === s) && (st === "" || p[5] === +st) && (!q || HAY([p[1], p[3]].concat(p[13].map(function (k) { return k[0]; }))).indexOf(q) > -1); });
  l.sort(function (a, b) { return o === "n" ? (b[10] > a[10] ? 1 : -1) : b[6] - a[6]; });
  $("#cnt").textContent = l.length + " مشروع";
  $("#grid").innerHTML = l.length ? l.map(function (p, i) { return '<a class="pj cin" style="animation-delay:' + Math.min(i, 10) * 60 + 'ms" href="project.html#' + p[0] + '"><div class="top"' + (p[16] ? ' style="background-image:linear-gradient(180deg,rgba(0,40,20,.35),rgba(0,40,20,.88)),url(' + p[16] + ');background-size:cover;background-position:center"' : '') + '><span class="chip chip-gold" style="align-self:flex-start">' + p[4] + '</span><b>' + p[1] + '</b><small>📍 ' + p[3] + ' · ' + p[2] + '</small></div><div class="b"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="big-val">' + MIG.money(p[6]) + '</span><span class="chip chip-green">' + MIG.STAGES[p[5]] + '</span></div>' + stageBar(p[5]) + '<dl class="kv"><dt>المالك</dt><dd>' + p[7] + '</dd><dt>المقاول</dt><dd>' + p[8] + '</dd><dt>الاستشاري</dt><dd>' + p[9] + '</dd></dl><div class="ft"><span class="chip chip-gray">📰 ' + (p[15] ? 'له مصدر منشور' : 'مصدر غير متاح') + '</span><span style="color:var(--green);font-weight:700;font-size:.86rem">تفاصيل المشروع ←</span></div></div></a>'; }).join("") : '<div class="card2" style="grid-column:1/-1;text-align:center">لا توجد مشاريع بهذه الفلاتر.</div>';
}
$("#q").addEventListener("input", render); ["#r", "#s", "#st", "#o"].forEach(function (id) { $(id).addEventListener("change", render); });
render();
''')

PAGES['project'] = ('تفاصيل المشروع – صنع في مصر', 'projects', PCSS, '''
<div id="phero"></div>
<main class="wrap pbody2" id="top"><div class="pdet" id="pdet"></div></main>
''', LEAD_MODAL_JS + '''
function show() {
  var id = (location.hash || "").slice(1), p = MIG.proj(id);
  if (!p && document.getElementById(id)) return;
  if (!p) { location.replace("projects.html"); return; }
  $("#phero").innerHTML = HERO(p[16] ? p[16].replace(/^img\\//, "") : ["m1.jpg", "m3.jpg", "m4.jpg", "e0.jpg"][MIG.PROJECTS.indexOf(p) % 4], '<a href="projects.html">مشاريع مصر</a> › ' + p[4], p[1], '<span>📍 ' + p[3] + ' · ' + p[2] + '</span> · <span>القيمة التقديرية</span> <span>' + MIG.money(p[6]) + '</span>', '<button class="btn btn-gold" type="button" id="pInt">🤝 سجّل اهتمامك بالمشروع</button><button class="mig-fbtn" type="button" data-follow-kind="project" data-follow-id="' + p[0] + '" data-follow-label="' + String(p[1]).replace(/"/g, "&quot;") + '" data-follow-url="project.html#' + p[0] + '" data-follow-text="تابع المشروع">☆ تابع المشروع</button>');
  var leads = MIG.LEADS.filter(function (l) { return l[3] === p[0]; });
  if (window.MIGINQ) MIGINQ.ctx({ type: "project", id: p[0], title: p[1], url: "project.html#" + p[0] });
  $("#pdet").innerHTML = '<div style="display:flex;flex-direction:column;gap:18px;min-width:0">' +
    '<div class="card2 cin"><h2>مراحل المشروع</h2><ol class="stages">' + MIG.STAGES.map(function (s, i) { return '<li class="' + (i < p[5] ? "done" : i === p[5] ? "now" : "") + '"><span class="d">' + (i < p[5] ? "✓" : i + 1) + '</span>' + s + '</li>'; }).join("") + '</ol></div>' +
    '<div class="card2 cin" id="packages" style="animation-delay:.08s;scroll-margin-top:90px"><h2>📦 طلبات المواد للمشروع</h2><p class="muted" style="font-size:.88rem">لسه مفيش طلبات مواد منشورة رسمياً للمشروع ده على المنصة. المنصة ما بتنشرش بنود توريد متوقعة أو مش مؤكدة؛ أول ما جهة في المشروع تنشر احتياجها هيظهر هنا. سجّل اهتمامك أو تابع المشروع وهنبلغك تلقائياً.</p><button class="btn btn-gold btn-sm" type="button" data-pint style="align-self:flex-start">🤝 سجّل اهتمامك بالمشروع</button></div>' +
    (leads.length ? '<div class="card2 cin" style="animation-delay:.16s"><h2>🏗️ طلبات مواد من جهات المشروع</h2><div style="display:flex;flex-direction:column;gap:10px">' + leads.map(leadRow).join("") + '</div></div>' : '') +
    '<div class="card2 cin" style="animation-delay:.24s"><h2>📰 آخر التحديثات</h2><ul class="tl2">' + p[14].map(function (u) { return '<li><small>' + MIG.dAr(u[0]) + '</small><span class="dot"></span><p>' + u[1] + '</p></li>'; }).join("") + '</ul></div></div>' +
    '<aside class="pside"><div class="card2" style="text-align:center"><h2>مرحلة المشروع</h2><span class="chip chip-gold" style="align-self:center">' + MIG.STAGES[p[5]] + '</span><small class="muted">حسب آخر خبر منشور عن المشروع</small></div>' +
    '<div class="card2"><h2>بيانات المشروع</h2><dl class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:.88rem">' + (p[15] ? '<dt class="muted">المصدر</dt><dd><a href="' + p[15] + '" target="_blank" rel="noopener">الخبر الأصلي ↗</a></dd>' : '') + '<dt class="muted">المالك</dt><dd style="margin:0">' + p[7] + '</dd><dt class="muted">المقاول الرئيسي</dt><dd style="margin:0">' + p[8] + '</dd><dt class="muted">الاستشاري</dt><dd style="margin:0">' + p[9] + '</dd><dt class="muted">القطاع</dt><dd style="margin:0">' + p[4] + '</dd><dt class="muted">البدء</dt><dd style="margin:0">' + (p[10] ? MIG.dAr(p[10]) : "غير معلن") + '</dd><dt class="muted">الانتهاء المتوقع</dt><dd style="margin:0">' + (p[11] ? MIG.dAr(p[11]) : "غير معلن") + '</dd><dt class="muted">القيمة</dt><dd style="margin:0"><b>' + MIG.money(p[6]) + '</b></dd></dl><span class="note2">المرجع هو المصدر الرسمي للمشروع.</span></div>' +
    '<div class="card2"><h2>مشاريع مشابهة</h2>' + MIG.PROJECTS.filter(function (x) { return x[0] !== p[0] && (x[4] === p[4] || x[2] === p[2]); }).slice(0, 3).map(function (x) { return '<a href="#' + x[0] + '" style="display:block;padding:10px;border:1px solid var(--line);border-radius:10px;color:var(--fg)"><b style="font-size:.88rem">' + x[1] + '</b><br><small class="muted">' + x[3] + ' · ' + MIG.STAGES[x[5]] + '</small></a>'; }).join("") + '</div></aside>';
  window.scrollTo(0, 0);
}
document.addEventListener("click", function (e) {
  var g = e.target.closest('a[href="#packages"]'); if (g && document.getElementById("packages")) { e.preventDefault(); document.getElementById("packages").scrollIntoView({ behavior: "smooth" }); return; }
  var pi = e.target.closest("#pInt,[data-pint]"), pr = MIG.proj((location.hash || "").slice(1)); if (!pi || !pr) return;
  if (!window.MIGINQ) { toast(window.MIGLANG === "en" ? "The sending service did not load. Please reload the page." : "خدمة الإرسال ماتحمّلتش. حدّث الصفحة."); return; }
  var EN = window.MIGLANG === "en";
  MIGINQ.dialog({ kind: "project_interest", target_type: "project", target_id: pr[0], target_name: pr[1], title: (EN ? "Interest in: " : "اهتمام بمشروع: ") + pr[1],
    intro: MIGINQ.esc(EN ? "Your interest and what you can supply are recorded in your account; you follow the project automatically and are notified of real updates. The platform does not contact the project's owner or contractors on your behalf." : "اهتمامك واللي تقدر توّرده بيتسجّلوا في حسابك، وبتتابع المشروع تلقائياً وبتوصلك تحديثاته الحقيقية. المنصة ما بتتواصلش مع مالك المشروع أو مقاوليه نيابةً عنك."),
    fields: [{ k: "products", label: EN ? "What you can supply *" : "اللي تقدر توّرده *", req: 1, full: 1 }], message: { label: EN ? "Notes" : "ملاحظات" }, payload: { project: pr[1], governorate: pr[2], sector: pr[4] }, submit: EN ? "Record my interest" : "سجّل اهتمامي" });
});
show(); window.addEventListener("hashchange", show);
''')

PAGES['leads'] = ('طلبات المواد من المقاولين – صنع في مصر', 'projects', PCSS, '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="seg2" id="tp"><button class="on" data-k="">الكل</button><button data-k="contractor">🏗️ مقاولون</button><button data-k="consultant">📐 استشاريون</button><button data-k="owner">🏢 ملاك المشاريع</button></div>
  <div class="tools2"><input type="search" id="q" placeholder="ابحث بالمادة: توربينات رياح، حديد تسليح، ألواح شمسية…" aria-label="بحث"><select id="r" aria-label="المحافظة"><option value="">كل المحافظات</option></select></div>
  <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span id="cnt" class="muted"></span><span class="note2">هنا بتظهر طلبات المواد اللي بينشرها المقاولون والاستشاريون على المنصة، ودعوات تسجيل الموردين المفتوحة عندهم بلينك البوابة الرسمية لكل شركة.</span></div>
  <div id="list" style="display:flex;flex-direction:column;gap:10px"></div>
  <div class="card2" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><h2>أنت مقاول أو استشاري؟</h2><p class="muted">انشر احتياجك من المواد: المنصة بتبعته تلقائياً للمصانع المسجّلة المطابقة، وعروضهم بتوصلك على بريدك.</p></div><a class="btn btn-green" href="contact.html#rfq-form">انشر طلب مواد</a></div>
</main>
''', LEAD_MODAL_JS + '''
var K = "";
if (window.MIGLANG === "en") { $("#q").placeholder = "Search by material: wind turbines, rebar, solar panels…"; var ob = $('#tp [data-k="owner"]'); if (ob) ob.textContent = "🏢 Project owners"; }
$("#r").innerHTML = MIGREG.opts(MIGREG.take());
var h = (location.hash || "").slice(1); if (h === "contractors") K = "contractor"; if (h === "consultants") K = "consultant"; if (h === "owners") K = "owner";
$$("#tp button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === K); });
function render() {
  var q = $("#q").value.trim().toLowerCase(), r = $("#r").value;
  var l = MIG.LEADS.filter(function (x) { return (!K || x[1] === K) && (!r || MIGREG.of(x[7]) === r) && (!q || HAY([x[4], x[2], x[10]]).indexOf(q) > -1); });
  /* newest first (no real closing dates are published for these expected supply items, so no deadline sort or countdown) */
  l.sort(function (a, b) { return b[0] > a[0] ? 1 : -1; });
  $("#cnt").textContent = l.length + " طلب مواد";
  $("#list").innerHTML = l.length ? l.map(leadRow).join("") : MIG.LEADS.length ? '<div class="card2" style="text-align:center">لا توجد طلبات بهذه الفلاتر.</div>' : '<div class="card2" style="text-align:center;align-items:center"><h2>لسه مفيش طلبات مواد منشورة</h2><p class="muted">أول ما مقاول أو استشاري ينشر احتياجه من المواد على المنصة هيظهر هنا. لحد كده تقدر تتابع المشاريع المعلنة وتسجّل اهتمامك بيها.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn btn-green" href="projects.html">المشاريع المعلنة</a><a class="btn btn-line" href="contact.html#rfq-form">انشر طلب مواد</a></div></div>';
}
$("#tp").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; K = b.dataset.k; $$("#tp button").forEach(function (x) { x.classList.toggle("on", x === b); }); render(); });
$("#q").addEventListener("input", render); $("#r").addEventListener("change", render);
window.addEventListener("hashchange", function () { var h = (location.hash || "").slice(1); K = h === "contractors" ? "contractor" : h === "consultants" ? "consultant" : h === "owners" ? "owner" : ""; $$("#tp button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === K); }); render(); });
render();
''')

HEROS['projects'] = ('m1.jpg', '<a href="projects.html">المشاريع</a>', 'مشاريع مصر', 'تابع المشاريع الحكومية والخاصة المعلنة في محافظات مصر الـ27: مرحلتها، وقيمتها، والجهات المنفّذة، والمواد التي تحتاجها، لتصل إليها قبل منافسيك.', '<a class="btn btn-gold" href="leads.html">طلبات المواد من المقاولين</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="#grid">تصفح المشاريع</a>')
HEROS['leads'] = ('m3.jpg', '<a href="projects.html">المشاريع</a> › طلبات المواد', 'مقاولون واستشاريون يطلبون مواد', 'طلبات توريد مواد البناء والمعدات اللي بينشرها المقاولون والاستشاريون على المنصة، وبتتبعت تلقائياً للمصانع المسجّلة المطابقة.', '<a class="btn btn-gold" href="projects.html">كل المشاريع</a>')

en_add([("مشاريع معلنة من مصادرها الرسمية، ورابط المصدر في صفحة كل مشروع.", "Projects announced by their official sources; the source link is on each project page."),
 ("مشروع معلن بمصدره", "projects announced with a source"), ("خبر عن المشاريع", "project news items"), ("له مصدر منشور", "Published source"), ("مصدر غير متاح", "No source available"),
 ("سجّل اهتمامك بالمشروع", "Register interest in the project"), ("تابع المشروع", "Follow the project"), ("طلبات المواد للمشروع", "Material requests for the project"),
 ("لسه مفيش طلبات مواد منشورة رسمياً للمشروع ده على المنصة. المنصة ما بتنشرش بنود توريد متوقعة أو مش مؤكدة؛ أول ما جهة في المشروع تنشر احتياجها هيظهر هنا. سجّل اهتمامك أو تابع المشروع وهنبلغك تلقائياً.", "No material requests have been officially published for this project on the platform yet. The platform does not publish expected or unconfirmed supply items; as soon as a party in the project publishes its needs, it appears here. Register your interest or follow the project and you will be notified automatically."),
 ("مرحلة المشروع", "Project stage"), ("حسب آخر خبر منشور عن المشروع", "According to the latest published news about the project"),
 ("هنا بتظهر طلبات المواد اللي بينشرها المقاولون والاستشاريون فعلاً على المنصة بس.", "Only material requests actually published on the platform by contractors and consultants appear here."),
 ("انشر احتياجك من المواد: المنصة بتبعته تلقائياً للمصانع المسجّلة المطابقة، وعروضهم بتوصلك على بريدك.", "Publish your material needs: the platform sends them automatically to matching registered factories, and their offers reach your e-mail."),
 ("لسه مفيش طلبات مواد منشورة", "No material requests published yet"), ("أول ما مقاول أو استشاري ينشر احتياجه من المواد على المنصة هيظهر هنا. لحد كده تقدر تتابع المشاريع المعلنة وتسجّل اهتمامك بيها.", "As soon as a contractor or consultant publishes material needs on the platform, they appear here. Meanwhile you can follow announced projects and register your interest."),
 ("المشاريع المعلنة", "Announced projects"), ("انشر طلب مواد", "Publish a material request"),
 ("طلبات توريد مواد البناء والمعدات اللي بينشرها المقاولون والاستشاريون على المنصة، وبتتبعت تلقائياً للمصانع المسجّلة المطابقة.", "Requests for building materials and equipment published on the platform by contractors and consultants, sent automatically to matching registered factories."),
 ("جنيه القيمة المعلنة لـ", "EGP announced value of "), ("مشروع", "projects")])

en_add([("المرجع هو المصدر الرسمي للمشروع.", "The project's official source is the reference.")])
