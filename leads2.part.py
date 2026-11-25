
# ---- separate pages: contractors' material requests / consultants' requests / one request / project news
# /leads/ lists every kind of request (contractors, consultants, owners; its hero «مقاولون واستشاريون يطلبون مواد») and /contractor-leads/
# the contractors' only: two pages, two titles (owner report 2026-11-19: both were «طلبات المواد من المقاولين»), each its own canonical
PAGES['leads'] = ('طلبات المواد من المقاولين والاستشاريين – صنع في مصر',) + tuple(PAGES['leads'][1:])
en_add([('طلبات المواد من المقاولين والاستشاريين', 'Material requests from contractors and consultants')])
def _leads_variant(key, kind, title, hero_img, crumb, h1, text):
    t = PAGES['leads']
    body = t[3].replace('<div class="seg2" id="tp">', '<div class="seg2" id="tp" hidden>')
    js = t[4].replace('var K = "";', 'var K = "%s";' % kind).replace('var h = (location.hash || "").slice(1); if (h === "contractors") K = "contractor"; if (h === "consultants") K = "consultant"; if (h === "owners") K = "owner";', '')
    js = js.replace('$("#cnt").textContent = l.length + " طلب مواد";', '$("#cnt").textContent = l.length + (K === "consultant" ? " طلب من الاستشاريين" : " طلب مواد من المقاولين");')
    PAGES[key] = (title, 'projects', t[2], body, js)
    HEROS[key] = (hero_img, crumb, h1, text, '<a class="btn btn-gold" href="contact.html#rfq-form">انشر طلب مواد</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="%s">%s</a>' % (('consultant-leads.html', 'طلبات الاستشاريين') if kind == 'contractor' else ('contractor-leads.html', 'طلبات المقاولين')))
_leads_variant('contractor-leads', 'contractor', 'طلبات المواد من المقاولين – صنع في مصر', 'm3.jpg', '<a href="projects.html">المشاريع</a> › طلبات المقاولين', 'طلبات المواد من المقاولين', 'مقاولون في المشاريع المعلنة داخل مصر يطلبون مواد البناء والمعدات.')
_leads_variant('consultant-leads', 'consultant', 'طلبات الاستشاريين – صنع في مصر', 'e3.jpg', '<a href="projects.html">المشاريع</a> › طلبات الاستشاريين', 'طلبات الاستشاريين', 'مكاتب استشارية تحدد مواصفات المواد في المشاريع وتبحث عن مصانع وطنية مؤهلة لإدراج منتجاتها ضمن قوائم الموردين والمواصفات.')

PAGES['lead'] = ('تفاصيل طلب المواد – صنع في مصر', 'projects', PCSS + '''
.ld { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
.ldf { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ldf div { background: var(--sunken); border-radius: 12px; padding: 10px 12px; } .ldf small { display: block; color: var(--muted); font-size: .74rem; } .ldf b { font-size: .95rem; }
@media (max-width: 900px) { .ld { grid-template-columns: 1fr; } .ldf { grid-template-columns: 1fr 1fr; } }
''', '''
<section class="phero"><span class="bg" style="background-image:url(img/m3.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="projects.html">المشاريع</a> › <a id="ldBack" href="contractor-leads.html">طلبات المواد</a></nav><h1 id="ldT">طلب مواد</h1><p id="ldS"></p><div class="acts"><button class="btn btn-gold" type="button" id="ldAsk">سجّل اهتمامك</button></div></div></section>
<main class="wrap pbody2" id="top"><div class="ld" id="ld"></div></main>
''', LEAD_MODAL_JS + r'''
var id = (location.hash || "").slice(1).toUpperCase(), l = MIG.LEADS.filter(function (x) { return x[0] === id; })[0];
if (!l) { location.replace("contractor-leads.html"); }
else {
  var p = MIG.proj(l[3]), cs = l[1] === "consultant", ow = l[1] === "owner";
  document.title = l[4] + " – طلب مواد"; $("#ldT").textContent = l[4] + ((l[5] + " " + l[6]).trim() ? " — " + (l[5] + " " + l[6]).trim() : "");
  $("#ldS").innerHTML = '<span>' + (ow ? "المالك" : cs ? "طلب استشاري" : "طلب مقاول") + '</span> · <span>' + l[7] + '</span>';
  $("#ldBack").href = ow ? "leads.html#owners" : cs ? "consultant-leads.html" : "contractor-leads.html"; $("#ldBack").textContent = ow ? "طلبات المواد" : cs ? "طلبات الاستشاريين" : "طلبات المقاولين";
  if (l[11]) { $("#ldAsk").textContent = "سجّل كمورد ↗"; $("#ldAsk").onclick = function () { window.open(l[11], "_blank", "noopener"); }; } else $("#ldAsk").onclick = function () { leadModal(l[0]); };
  if (window.MIGINQ) MIGINQ.ctx({ type: "lead", id: l[0], title: l[4], url: "lead.html#" + l[0] });
  var same = MIG.LEADS.filter(function (x) { return x[0] !== l[0] && (x[3] === l[3] || x[7] === l[7]); }).slice(0, 5);
  $("#ld").innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div class="card2"><h2>بيانات الطلب</h2><div class="ldf"><div><small>المادة</small><b>' + l[4] + '</b></div>' + ((l[5] + ' ' + l[6]).trim() ? '<div><small>الكمية</small><b class="num">' + (l[5] + ' ' + l[6]).trim() + '</b></div>' : '') + '<div><small>المحافظة</small><b>' + l[7] + '</b></div><div><small>الجهة المرتبطة بالمشروع</small><b>' + l[2] + '</b></div>' + (p ? '<div><small>المرحلة</small><b>' + MIG.STAGES[p[5]] + '</b></div>' : '') + '<div><small>الميزانية التقديرية</small><b>' + (l[9] !== "—" && l[9] !== "غير معلنة" ? l[9] + " جنيه" : "غير معلنة") + '</b></div></div><p class="muted">' + l[10] + '</p>' + (l[11] ? '<a class="btn btn-gold" href="' + l[11] + '" target="_blank" rel="noopener" style="align-self:flex-start">سجّل كمورد من البوابة الرسمية ↗</a><small class="muted">' + 'المصدر: البوابة الرسمية للشركة · ' + l[11].split("/")[2] + '</small>' : '<span class="locked">🔒 بيانات التواصل الشخصية مش بتظهر على المنصة؛ سجّل اهتمامك وهيوصلك أي تحديث تلقائياً.</span>') + '</div>'
    + (p ? '<div class="card2"><h2>المشروع المرتبط</h2><a href="project.html#' + p[0] + '" style="font-weight:800">🏗️ ' + p[1] + '</a><span class="muted">' + p[3] + ' · ' + MIG.STAGES[p[5]] + ' · ' + MIG.money(p[6]) + '</span></div>' : '') + '</div>'
    + '<aside style="display:flex;flex-direction:column;gap:14px"><div class="card2"><h2>طلبات مشابهة</h2>' + (same.length ? same.map(function (x) { return '<a href="lead.html#' + x[0] + '" style="display:block;padding:8px 10px;border-radius:10px;background:var(--sunken);color:var(--fg)"><b style="font-size:.86rem">' + x[4] + '</b><br><small class="muted">' + x[7] + ' · ' + x[5] + ' ' + x[6] + '</small></a>'; }).join("") : '<span class="muted">لا توجد.</span>') + '</div><div class="card2"><h2>كل الطلبات</h2><a class="btn btn-line btn-sm" href="contractor-leads.html">طلبات المقاولين</a><a class="btn btn-line btn-sm" href="consultant-leads.html">طلبات الاستشاريين</a></div></aside>';
}
window.addEventListener("hashchange", function () { location.reload(); });
''')

PAGES['project-news'] = ('أخبار المشاريع – صنع في مصر', 'projects', PCSS + '''
.pn { display: flex; flex-direction: column; gap: 10px; }
.pn a { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; color: var(--fg); transition: border-color .2s ease, transform .2s ease; }
.pn a:hover { border-color: var(--green); transform: translateY(-2px); }
.pn small { color: var(--muted); } .pn b { font-size: .95rem; line-height: 1.5; } .pn .go { color: var(--green); font-weight: 700; font-size: .84rem; white-space: nowrap; }
@media (max-width: 640px) { .pn a { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top"><div class="tools2"><input type="search" id="q" placeholder="ابحث في الأخبار…" aria-label="بحث"><select id="r" aria-label="المحافظة"></select></div><div class="pn" id="pn"></div></main>
''', r'''
$("#r").innerHTML = MIGREG.opts("");
function HAY(a) { return a.map(function (s) { s = String(s == null ? "" : s); return s + " " + (window.MIGHAY ? MIGHAY(s) : ""); }).join(" ").toLowerCase(); }
function render() { var q = $("#q").value.trim().toLowerCase(), r = $("#r").value; var l = MIG.NEWS.filter(function (n) { var p = MIG.proj(n[1]); return (!q || HAY([n[2], p ? p[1] : ""]).indexOf(q) > -1) && (!r || (p && MIGREG.of(p[2]) === r)); });
  $("#pn").innerHTML = l.length ? l.map(function (n) { var p = MIG.proj(n[1]); return '<a href="project.html#' + n[1] + '"><small class="num">📅 ' + MIG.dAr(n[0]) + '</small><span><b>' + n[2] + '</b><br><small>' + (p ? '🏗️ ' + p[1] + ' · 📍 ' + p[3] : '') + '</small></span><span class="go">المشروع ←</span></a>'; }).join("") : '<div class="card2">لا توجد أخبار بهذا البحث.</div>'; }
$("#q").addEventListener("input", render); $("#r").addEventListener("change", render); render();
''')
HEROS['project-news'] = ('m1.jpg', '<a href="projects.html">المشاريع</a> › أخبار المشاريع', 'أخبار المشاريع', 'آخر التطورات في المشاريع المعلنة في مصر: ترسيات، وبدء تنفيذ، ومراحل جديدة، مع رابط لكل مشروع وموادّه المطلوبة.', '<a class="btn btn-gold" href="projects.html">كل المشاريع</a>')

en_add([("بيانات التواصل الشخصية مش بتظهر على المنصة؛ سجّل اهتمامك وهيوصلك أي تحديث تلقائياً.", "Personal contact details are not shown on the platform; register your interest and any update reaches you automatically."), ("سجّل اهتمامك", "Register your interest")])
en_add([('🔗 التسجيل من البوابة الرسمية للشركة', '🔗 Registration on the company\'s official portal'), ('سجّل كمورد ↗', 'Register as a supplier ↗'), ('سجّل كمورد من البوابة الرسمية ↗', 'Register as a supplier on the official portal ↗'), ('المصدر: البوابة الرسمية للشركة · ', 'Source: the company\'s official portal · '), ('هنا بتظهر طلبات المواد اللي بينشرها المقاولون والاستشاريون على المنصة، ودعوات تسجيل الموردين المفتوحة عندهم بلينك البوابة الرسمية لكل شركة.', 'Material requests published by contractors and consultants on the platform appear here, together with their open supplier-registration calls linked to each company\'s official portal.')])
