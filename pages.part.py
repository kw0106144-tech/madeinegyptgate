# -*- coding: utf-8 -*-
# Bodies for the new pages. Each entry: (title, nav_key, css, html, js)
PAGES = {}
# the shared clients every form page needs (safe to load twice; the integrator also adds data/mig-api.js to every page in site.py)
MIG_SCRIPTS = '<script src="data/mig-api.js"></script><script src="data/mig-forms.js"></script>'
# ---- shared page helpers (ES5), pasted into the page scripts that need them:
# VFX(name): one of the 91 companies of data/factories.js (MIGFAC) — verified manually by the platform team, its clients (owner decision
#   2026-11-18) — by its MIGFAC name or the researched spelling data/facx.js keeps for it (facx.js SAME). Imported member listings
#   (MIGOLDFAC) and the other researched rows are NOT verified.
# ARN(n, one, two, few, many): Arabic number agreement (1 · 2 · 3–10 plural · 11+ singular).
# KEYN(name): the directory's company-name matching key (same rules as the data clean-up's norm.js key()).
MIG_VFX_JS = r'''
function VFX(name) { var s = VFX.s; if (!s) { s = VFX.s = {}; (window.MIGFAC || []).forEach(function (f) { s[f.name_ar] = 1; }); var A = (window.MIGFACX && MIGFACX.same) || { "مجموعة سيراميكا كليوباترا": "سيراميكا كليوباترا", "السجاد الشرقي (أورينتال ويفرز)": "النساجون الشرقيون", "فريش للأجهزة المنزلية": "فريش للأجهزة الكهربائية", "الأسمنت العربية": "الشركة العربية للأسمنت" }; for (var k in A) if (s[k]) s[A[k]] = 1; } return !!s[name]; }
function ARN(n, one, two, few, many) { var m = n % 100, t = Number(n).toLocaleString("en-US"); return n === 1 ? one : n === 2 ? two : m >= 3 && m <= 10 ? t + " " + few : t + " " + many; }
function KEYN(s) { s = String(s || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); }).toLowerCase().replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[^ء-يa-z0-9]+/g, " ").replace(/(^|\s)(co|ltd|llc|sae|inc|company)(?=\s|$)/g, " ").replace(/(^|\s)(ش م م|ش م|ش ذ م م|ذ م م)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim().replace(/^(الشركه|شركه|مصنع|مصانع|مؤسسه)\s+/, ""); return s.replace(/\s+/g, ""); }
'''

# ---- English equivalents for the new static Arabic strings (Phase A forms / honesty pass). The site's i18n engine translates
# text nodes from window.I18N_EN; these entries are merged into it by every page (winner.part.py appends EN_JS() to all pages).
import re as _re_en, json as _json_en
EN_NEW = {}
def en_add(pairs):
    for a, b in pairs:
        k = _re_en.sub(r'[0-9٠-٩][0-9٠-٩,.:%/\-]*', '{n}', _re_en.sub(r'\s+', ' ', a).strip())
        # only as many numbers become {n} in the English text as the Arabic key has (i18n.js fills them in order);
        # a number that exists only in the English text ("10th of Ramadan City") stays as written
        EN_NEW[k] = _re_en.sub(r'[0-9][0-9,.:%/\-]*', '{n}', b, count=k.count('{n}')) if k.count('{n}') else b
def EN_JS():
    return '(function(){var D=window.I18N_EN;if(!D)return;var A=' + _json_en.dumps(EN_NEW, ensure_ascii=False) + ';for(var k in A)if(!(k in D))D[k]=A[k];})();\n'

COMMON_CSS = '''
.faq .fgo { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0 10px; padding: 7px 14px; border-radius: 10px; background: var(--green); color: #fff; font-weight: 800; font-size: .85rem; } .faq .fgo:hover { background: var(--green-deep); }
.phero { position: relative; overflow: hidden; background: var(--green-deep); color: #fff; }
.phero .bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .28; transform: scale(1.05); animation: kb 18s ease-in-out infinite alternate; }
@keyframes kb { to { transform: scale(1.15) translate(-2%, 1%); } }
.phero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(270deg, rgba(4,25,14,.85), rgba(4,25,14,.35)); }
.phero .wrap { position: relative; z-index: 1; padding-block: 44px 40px; display: flex; flex-direction: column; gap: 10px; }
.phero .crumb { font-size: .82rem; opacity: .8; } .phero .crumb a { color: #fff; }
.phero h1 { font-size: clamp(1.7rem, 4vw, 2.7rem); font-weight: 800; animation: heroIn .8s cubic-bezier(.2,.8,.2,1) both; }
.phero p { max-width: 46em; opacity: .9; animation: heroIn .8s cubic-bezier(.2,.8,.2,1) .12s both; }
.phero .acts { display: flex; gap: 8px; flex-wrap: wrap; animation: heroIn .8s cubic-bezier(.2,.8,.2,1) .24s both; }
@keyframes heroIn { from { opacity: .25; transform: translateY(26px); } to { opacity: 1; transform: none; } }
.pbody2 { padding-block: 30px 56px; display: flex; flex-direction: column; gap: 22px; }
.card2 { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.card2 h2 { font-size: 1.2rem; font-weight: 800; }
.tools2 { display: flex; flex-wrap: wrap; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
.tools2 input, .tools2 select, .f2 input, .f2 select, .f2 textarea { font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; min-width: 0; }
.tools2 input[type=search] { flex: 2 1 220px; } .tools2 select { flex: 1 1 160px; }
.f2 { display: flex; flex-direction: column; gap: 5px; font-size: .86rem; font-weight: 600; }
.f2 textarea { min-height: 110px; resize: vertical; font-weight: 400; }
.fgrid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .fgrid2 .full { grid-column: 1 / -1; }
@media (max-width: 600px) { .fgrid2 { grid-template-columns: 1fr; } }
.okbox2 { background: var(--green-soft); color: var(--green); border-radius: 12px; padding: 14px 16px; font-weight: 700; }
.seg2 { display: inline-flex; background: var(--sunken); border-radius: 10px; padding: 4px; flex-wrap: wrap; gap: 2px; }
.seg2 button { border: 0; background: transparent; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: .86rem; color: var(--muted); }
.seg2 button.on { background: var(--surface); color: var(--green); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.cin { animation: cin .5s ease both; }
@keyframes cin { from { opacity: .2; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: none; } }
.chip-red { background: #FDECEC; color: #C0392B; } .chip-amber { background: #FFF4E0; color: #A86400; }
.note2 { font-size: .76rem; color: var(--muted); display: inline-flex; gap: 5px; align-items: center; }
.note2::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--gold); }
@media (prefers-reduced-motion: reduce) { .phero .bg, .phero h1, .phero p, .phero .acts, .cin { animation: none !important; } }
'''

def hero(img, crumb, title, text, acts=''):
    return ('<section class="phero"><span class="bg" style="background-image:url(img/%s)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › %s</nav>'
            '<h1>%s</h1><p>%s</p>%s</div></section>') % (img, crumb, title, text, ('<div class="acts">%s</div>' % acts) if acts else '')

OPPS_JS = '''
var OPPS = [
 ["MSG-GT4417","gov","توريد مواسير HDPE ووصلات PN16 لشبكة مياه","جهة حكومية – قطاع مياه الشرب والصرف الصحي","الجيزة","المحلي","مواد البناء",3,"42 مليون"],
 ["MSG-RF8210","pvt","حديد قنوات (Channels) بدرجة S275JR لمشروع صناعي","مقاول عام – المنامة","البحرين","الخليجي","المعادن والألمنيوم",1,"7.8 مليون"],
 ["MSG-GT4390","gov","زجاج آمن مقسّى لمبانٍ صحية","جهة حكومية – قطاع الصحة","الإسكندرية","المحلي","الزجاج",6,"28 مليون"],
 ["MSG-RF8197","pvt","كابلات نحاس جهد منخفض مع Datasheet وشهادات اختبار","مقاول كهرباء – القاهرة الجديدة","القاهرة","المحلي","الكهرباء والكابلات",2,"11 مليون"],
 ["MSG-RF8174","pvt","تمور معبأة 1 كجم لسلسلة متاجر","سلسلة تجزئة – الكويت","الكويت","الخليجي","الصناعات الغذائية",9,"3.8 مليون"],
 ["MSG-GT4352","gov","أثاث مدرسي لـ 40 مدرسة","جهة حكومية – قطاع التعليم","أسيوط","المحلي","الأثاث",14,"65 مليون"],
 ["MSG-RF8160","pvt","عبوات بلاستيك للأغذية 500 مل","مصنع عصائر – مسقط","عُمان","الخليجي","البلاستيك والمطاط",5,"2.1 مليون"],
 ["MSG-RF8142","pvt","بلوك أسمنتي معزول – 200 ألف حبة","مستورد مواد بناء – نيروبي","كينيا","الأفريقي","مواد البناء",11,"6.4 مليون"],
 ["MSG-GT4318","gov","محاليل وريدية لمستشفيات حكومية","جهة حكومية – قطاع الصحة","الدقهلية","المحلي","الأدوية والطبي",0,"33 مليون"],
 ["MSG-RF8101","pvt","حبيبات بولي إيثيلين HDPE – 500 طن","مصنع عبوات – هو تشي منه","فيتنام","الآسيوي","البتروكيماويات",16,"24 مليون"],
 ["MSG-RF8093","pvt","قطاعات ألمنيوم لواجهات فندق","مطوّر عقاري – ميلانو","إيطاليا","الأوروبي","المعادن والألمنيوم",20,"9.5 مليون"],
 ["MSG-RF8088","pvt","ألواح PVC للأسقف","مقاول – أكرا","غانا","الأفريقي","البلاستيك والمطاط",7,"3.3 مليون"],
 ["MSG-GT4301","gov","خرسانة جاهزة لمشروع طرق","جهة حكومية – قطاع النقل","الشرقية","المحلي","مواد البناء",24,"51 مليون"],
 ["MSG-RF8070","pvt","زيت طعام 17 لتر – 3 حاويات","موزع أغذية – الدوحة","قطر","الخليجي","الصناعات الغذائية",4,"1.9 مليون"],
 ["MSG-RF8061","pvt","ميثانول صناعي – 2,000 طن","مصنع كيماويات – روتردام","هولندا","الأوروبي","البتروكيماويات",27,"39 مليون"],
 ["MSG-RF8305","pvt","مضخات طرد مركزي لمحطة معالجة","شركة مقاولات – بورسعيد","بورسعيد","المحلي","مواد البناء",12,"8.7 مليون"],
 ["MSG-GT4460","gov","إنارة LED لطرق داخلية","وحدة محلية – المنيا","المنيا","المحلي","الكهرباء والكابلات",18,"20.5 مليون"],
 ["MSG-RF8311","pvt","عصائر معبأة لفنادق","مجموعة فنادق – المنامة","البحرين","الخليجي","الصناعات الغذائية",8,"2.6 مليون"],
 ["MSG-RF8320","pvt","أنابيب ري HDPE 63 مم","مزارع – الخرطوم","السودان","الأفريقي","البلاستيك والمطاط",13,"4.1 مليون"],
 ["MSG-RF8333","pvt","زجاج شفاف 6 مم – حاويتان","مستورد – مومباي","الهند","الآسيوي","الزجاج",15,"5.2 مليون"]
];
function realOpps(openOnly) {
  if (!(window.REAL && REAL.tenders && REAL.tenders.length)) return null;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  return REAL.tenders.map(function (t, i) {
    var d = t.closing_date ? Math.round((new Date(t.closing_date + "T00:00:00") - now) / 864e5) : 0, v = t.estimated_value_egp || t.estimated_value;
    var vs = v ? (v >= 1e9 ? (v / 1e9).toFixed(1) + " مليار" : (v / 1e6).toFixed(1) + " مليون") : "";
    return [(window.MIGOID ? MIGOID(t, i) : "MD" + (i + 1)), t.kind, t.title_ar, t.entity_ar || "", t.city || (window.MIGREG ? MIGREG.name(t.region_code) : ""), "المحلي", t.sector_ar, d, vs, t.source_url, t.ref, t.procurement_type, t.publish_date, t.closing_date, String(t.id || t.ref || "")];
  }).filter(function (o) { return !openOnly || o[7] > 0; });
}
function realIntl(openOnly) {
  if (!(window.REAL && REAL.tenders_intl && REAL.tenders_intl.length)) return null;
  var MK = { gulf: "الخليجي", africa: "الأفريقي", asia: "الآسيوي", europe: "الأوروبي" }, now = new Date(); now.setHours(0, 0, 0, 0);
  return REAL.tenders_intl.map(function (t, i) {
    var d = t.closing_date ? Math.round((new Date(t.closing_date + "T00:00:00") - now) / 864e5) : 0;
    var vs = t.estimated_value ? Math.round(t.estimated_value).toLocaleString("en-US") + " " + (t.currency || "") : "";
    return ["IN" + (i + 1), t.kind || "gov", t.title_ar, t.entity_ar || "", (t.city ? t.city + " – " : "") + t.country_ar, MK[t.market] || "الخليجي", t.sector_ar, d, vs, t.source_url, t.ref, t.source_name, t.publish_date, t.closing_date, String(t.ref || "")];
  }).filter(function (o) { return !openOnly || o[7] > 0; });
}
/* only published opportunities with a source are shown; the illustrative MSG-* list above is never used (owner decision: remove anything unverified) */
var RO_ = realOpps(false), RI_ = realIntl(false); OPPS = (RO_ || []).concat(RI_ || []); window.MIG_REAL_OPPS = true;
'''

# ---------------- OPPORTUNITY DETAIL ----------------
PAGES['opportunity'] = ('تفاصيل الفرصة – صنع في مصر', 'rfq', COMMON_CSS + '''
.odet { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.side2 { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 84px); }
.cdown { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; }
.cdown div { background: var(--green-deep); color: #fff; border-radius: 12px; padding: 10px 4px; }
.cdown b { display: block; font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.cdown span { font-size: .72rem; opacity: .8; }
.facts2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.facts2 div { background: var(--sunken); border-radius: 12px; padding: 12px; }
.facts2 small { display: block; color: var(--muted); font-size: .76rem; }
.facts2 b { font-size: .98rem; }
.reqs { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 6px; }
.docs a { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); }
.docs a:hover { border-color: var(--green); }
.tline { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.tline li { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; font-size: .78rem; position: relative; }
.tline li .d { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--line); background: var(--surface); display: grid; place-items: center; font-size: .75rem; font-weight: 800; z-index: 1; }
.tline li.done .d { border-color: var(--green); background: var(--green); color: #fff; }
.tline li.now .d { border-color: var(--gold); background: var(--gold); color: #1A1204; box-shadow: 0 0 0 6px rgba(192,147,0,.25); animation: pulseg 1.6s infinite; }
@keyframes pulseg { 50% { box-shadow: 0 0 0 10px rgba(192,147,0,.08); } }
.tline li::before { content: ""; position: absolute; top: 14px; inset-inline-start: -50%; width: 100%; height: 3px; background: var(--line); }
.tline li:first-child::before { display: none; }
.tline li.done::before, .tline li.now::before { background: var(--green); }
.sim a { display: block; padding: 10px; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); font-size: .86rem; }
.sim a:hover { border-color: var(--gold); }
@media (max-width: 900px) { .odet { grid-template-columns: 1fr; } .side2 { position: static; } .facts2 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .tline { grid-template-columns: repeat(5, minmax(0,1fr)); font-size: .7rem; } }
''', '''
<div id="ohero"></div>
<main class="wrap pbody2" id="top"><div class="odet" id="odet"></div></main>
''', OPPS_JS + '''
var DESC = { "مواد البناء": ["شهادة مطابقة للمواصفات القياسية المصرية (الهيئة المصرية العامة للمواصفات والجودة)", "بيان نسبة المكون المحلي وفق القانون رقم 5 لسنة 2015 بشأن تفضيل المنتجات المصرية في التعاقدات الحكومية", "جدول توريد على دفعات حسب تقدم المشروع"], "الصناعات الغذائية": ["شهادة سلامة غذاء (ISO 22000 أو ما يعادلها)", "تسجيل المنتج وترخيصه لدى الهيئة القومية لسلامة الغذاء", "صلاحية متبقية لا تقل عن 70% عند التسليم", "بطاقة بيانات باللغة العربية"], "البلاستيك والمطاط": ["شهادة مطابقة للمواصفة القياسية المصرية المطلوبة أو ما يعادلها", "تقرير اختبار من مختبر معتمد من المجلس الوطني للاعتماد (EGAC)", "عينة قبل الإنتاج الكمي"], "الكهرباء والكابلات": ["Datasheet لكل بند", "شهادات اختبار النوع (Type Test)", "شهادة المنشأ وبيان نسبة المكون المحلي إن وجد"], "المعادن والألمنيوم": ["شهادة المطحنة (MTC)", "مطابقة الدرجة المطلوبة", "تقرير فحص الأبعاد"], "الزجاج": ["شهادة مطابقة السماكة والمقاس", "اختبار الأمان للزجاج المقسّى", "خطة تعبئة ونقل آمنة"], "البتروكيماويات": ["شهادة تحليل (COA) لكل دفعة", "صحيفة بيانات السلامة (SDS)", "شروط الشحن (Incoterms)"], "الأدوية والطبي": ["تسجيل المنتج لدى هيئة الدواء المصرية", "شهادة GMP", "سلسلة تبريد موثقة عند الحاجة"], "الأثاث": ["عينة معتمدة لكل صنف", "ضمان لا يقل عن سنتين", "التركيب في الموقع"] };
function closeOf(t) { var x = new Date(); x.setDate(x.getDate() + t[7]); x.setHours(15, 0, 0, 0); return x; }
function dAr(x) { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(x); }
var cdT;
/* kind label: government tender / public-sector company tender / request for quotation */
function KT(o) { return o[1] === "gov" || o[1] === "public-company"; }
function KL(o) { return o[1] === "gov" ? "مناقصة حكومية" : o[1] === "public-company" ? (window.MIGLANG === "en" ? "Public-sector company tender" : "مناقصة شركة عامة") : "طلب عرض سعر"; }
function DL(n) { var m = n % 100; return n < 0 ? "مغلقة" : n === 0 ? "يُغلق اليوم" : n === 1 ? "يُغلق بكرة" : n === 2 ? "يُغلق بعد يومين" : "يُغلق بعد " + n + (m >= 3 && m <= 10 ? " أيام" : " يوماً"); }
/* in-page links to the offer form (CTAs and document links) scroll to it and leave the hash (the opportunity id) alone */
document.addEventListener("click", function (e) {
  var a = e.target.closest('a[href="#offer"]'); if (!a) return; e.preventDefault();
  var f = $("#offer"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
});
function show() {
  clearInterval(cdT);
  var id = decodeURIComponent((location.hash || "").slice(1)).toUpperCase(), t = OPPS.filter(function (o) { return o[0] === id; })[0];
  if (id === "OFFER" && $("#offer")) return;
  if (!t) {
    $("#ohero").innerHTML = HERO("m3.jpg", '<a href="tenders.html">الفرص</a>', "كل الفرص المفتوحة", "اختر فرصة لعرض تفاصيلها والتقديم عليها.");
    $("#odet").innerHTML = '<div class="card2" style="grid-column:1/-1">' + OPPS.filter(function (o) { return o[7] >= 0; }).map(function (o) { return '<a class="sim" href="#' + o[0].toLowerCase() + '" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px;border:1px solid var(--line);border-radius:10px;color:var(--fg)"><span><b>' + o[2] + '</b><br><small class="muted">' + o[3] + ' · ' + o[5] + '</small></span><span class="chip ' + (KT(o) ? "chip-green" : "chip-gold") + '">' + KL(o) + '</span></div></a>'; }).join("") + '</div>';
    return;
  }
  var mk = { "المحلي": "local", "الخليجي": "gulf", "الأفريقي": "africa", "الآسيوي": "asia", "الأوروبي": "europe" }[t[5]] || "local";
  if (window.MIGPLAN && !MIGPLAN.can("tenders")) { try { sessionStorage.setItem("mig-gate", "تفاصيل الفرصة: " + t[2]); } catch (x) {} location.replace("register.html#" + (mk === "local" ? "basic" : mk === "gulf" ? "premium" : mk === "africa" ? "partner" : "strategic")); return; }
  var WID = t[14] || t[0]; /* the id the platform's alerts and deadline reminders use (worker/build-index.js) */
  if (window.MIGINQ) MIGINQ.ctx({ type: "tender", id: WID, title: t[2], url: "opportunity.html#" + t[0].toLowerCase() });
  /* the plan's markets, and for a Gulf item the GCC state (Premium = the 3 states the member chose; t[4] = «(city – )country») */
  var cc = mk === "gulf" && window.MIGPLAN && MIGPLAN.gccCode ? MIGPLAN.gccCode(t[4]) : "";
  if (window.MIGPLAN && !(MIGPLAN.inScope ? MIGPLAN.inScope(mk, cc) : MIGPLAN.market(mk))) { $("#ohero").innerHTML = HERO(KT(t) ? "m1.jpg" : "m3.jpg", '<a href="tenders.html">الفرص</a>', t[2], t[3] + " · " + t[4]); $("#odet").innerHTML = '<div style="grid-column:1/-1">' + MIGPLAN.scopeLockHTML(mk, null, cc) + "</div>"; window.scrollTo(0, 0); return; }
  var EN = window.MIGLANG === "en", gov = KT(t), loc = t[5] === "المحلي", shut = t[7] < 0, end = t[13] ? new Date(t[13] + "T15:00:00") : null;
  var stage = t[7] <= 0 ? 2 : 1;
  var SHUT = '<span class="chip chip-red" style="align-self:flex-start">' + (EN ? "Submission closed on the deadline" : "انتهى موعد التقديم") + '</span>';
  $("#ohero").innerHTML = HERO(gov ? "m1.jpg" : "m3.jpg", '<a href="' + (gov ? "tenders.html" : "rfqs.html") + '">' + (gov ? "المناقصات الحكومية" : "طلبات عروض الأسعار") + '</a> › ' + t[0], t[2], t[3] + ' · ' + t[4] + ' · السوق ' + t[5], (shut ? SHUT : '<a class="btn btn-gold" href="#offer">قدّم عرضك الآن</a>') + '<button class="mig-fbtn" type="button" id="saveO" data-follow-kind="tender" data-follow-id="' + String(WID).replace(/[&<>"]/g, "") + '" data-follow-label="' + String(t[2]).replace(/"/g, "&quot;") + '" data-follow-url="opportunity.html#' + t[0].toLowerCase() + '" data-follow-text="' + (window.MIGLANG === "en" ? "Follow this opportunity" : "تابع الفرصة") + '">☆ تابع الفرصة</button><button class="btn" style="background:rgba(255,255,255,.14);color:#fff" type="button" id="shareO">🔗 مشاركة</button>');
  var reqs = DESC[t[6]] || ["مطابقة المواصفات المطلوبة", "شهادة المنشأ"];
  if (!loc) reqs = reqs.filter(function (r) { return !/المكون المحلي|المصرية|سلامة الغذاء|EGAC/.test(r); }).concat(["الالتزام بشروط التسجيل والمواصفات المعتمدة في بلد الجهة الطارحة"]);
  var sim = OPPS.filter(function (o) { return o[6] === t[6] && o[0] !== t[0] && o[7] > 0; }).slice(0, 4);
  var val = t[8] ? (/[A-Z]{3}$/.test(t[8]) ? t[8] : t[8] + ' جنيه') : 'غير معلنة';
  var DSC = EN ? '<span>' + MIGTR(t[3]) + '</span>' + (gov ? " invites bids for: " : " requests quotations for: ") + '<span>' + MIGTR(t[2]) + '</span>' + ", in line with the terms and specifications in the tender documents" + (loc ? ", taking into account the preference for Egyptian products and the local-content ratio under Law No. 5 of 2015 where applicable" : "") + ". The platform shows the opportunity for information only; it does not issue or award tenders."
    : (gov ? "تطرح " + t[3] + " مناقصة عامة لـ" : "تطلب " + t[3] + " عروض أسعار لـ") + t[2] + '، وفق الشروط والمواصفات الواردة في كراسة الطلب' + (loc ? '، مع مراعاة تفضيل المنتج المصري ونسبة المكون المحلي وفق القانون رقم 5 لسنة 2015 حيث ينطبق' : '') + '. المنصة تعرض الفرصة للمعلومات ولا تطرح المناقصات ولا ترسيها.';
  $("#odet").innerHTML =
    '<div style="display:flex;flex-direction:column;gap:18px;min-width:0">' +
    '<div class="card2 cin"><div style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip chip-gray" dir="ltr">' + t[0] + '</span>' + (t[9] ? '<a class="chip chip-green" href="' + t[9] + '" target="_blank" rel="noopener">' + (/etenders\\.gov\\.eg|\\.gov\\.eg/.test(t[9]) ? 'الإعلان الرسمي على بوابة التعاقدات العامة ↗' : 'مصدر الإعلان ↗') + '</a>' + (t[11] ? '<span class="chip chip-gray" style="white-space:normal;max-width:100%;overflow-wrap:anywhere">' + t[11] + '</span>' : '') : '') + '<span class="chip ' + (gov ? "chip-green" : "chip-gold") + '">' + KL(t) + '</span><span class="chip chip-gray">' + t[6] + '</span><span class="chip ' + (t[7] <= 3 ? "chip-red" : t[7] <= 10 ? "chip-amber" : "chip-green") + '">' + DL(t[7]) + '</span></div>' +
    '<div class="facts2"><div><small>القيمة التقديرية</small><b>' + val + '</b></div><div><small>تاريخ الطرح</small><b>' + (t[12] ? dAr(new Date(t[12] + 'T12:00:00')) : 'غير معلن') + '</b></div><div><small>آخر موعد للتقديم</small><b>' + (t[13] ? dAr(new Date(t[13] + 'T12:00:00')) : 'غير معلن') + '</b></div><div><small>مكان التسليم</small><b>' + t[4] + '</b></div><div><small>السوق</small><b>' + t[5] + '</b></div><div><small>' + (t[11] ? 'نوع الطرح' : 'مدة التنفيذ') + '</small><b>' + (t[11] || 'حسب كراسة الشروط') + '</b></div></div></div>' +
    '<div class="card2 cin" style="animation-delay:.08s"><h2>وصف الطلب</h2><p>' + DSC + '</p><h2>المتطلبات</h2><ul class="reqs">' + reqs.map(function (r) { return "<li>" + r + "</li>"; }).join("") + '<li>عرض فني وعرض مالي منفصلان</li></ul></div>' +
    '<div class="card2 cin" style="animation-delay:.16s"><h2>مراحل الطلب</h2><ol class="tline">' + ["الطرح", "الاستفسارات", "إغلاق التقديم", "فتح العروض", "الترسية"].map(function (s, i) { return '<li class="' + (i < stage ? "done" : i === stage ? "now" : "") + '"><span class="d">' + (i < stage ? "✓" : i + 1) + '</span>' + s + '</li>'; }).join("") + '</ol></div>' +
    '<div class="card2 cin" style="animation-delay:.24s"><h2>المستندات</h2>' + (t[9] ? '<div class="docs" style="display:flex;flex-direction:column;gap:8px"><a href="' + t[9] + '" target="_blank" rel="noopener">📄 <span>كراسة الشروط والمستندات من الإعلان الرسمي للجهة</span><span class="chip chip-gray">↗</span></a></div><span class="note2">المنصة ما بتنشرش نسخ من الكراسات؛ المرجع هو الإعلان الرسمي للجهة.</span>' : '<p class="muted">لا توجد مستندات منشورة لهذه الفرصة على المنصة.</p>') + '</div>' +
    (shut ? '<div class="card2 cin" id="offer" style="animation-delay:.32s"><h2>قدّم عرضك</h2>' + SHUT + '<p class="muted">' + (EN ? "The deadline for this opportunity has passed, so offers can no longer be submitted. Browse open opportunities in the same sector instead." : "انتهى آخر موعد للتقديم على هذه الفرصة، فلا يمكن تقديم عروض عليها الآن. تصفّح الفرص المفتوحة في القطاع نفسه.") + '</p><a class="btn btn-green" href="tenders.html" style="align-self:flex-start">العودة للوحة الفرص</a></div>' :
    (window.MIGPLAN && !MIGPLAN.can("respond") ? '<div class="card2 cin" id="offer" style="animation-delay:.32s"><h2>قدّم عرضك</h2>' + MIGPLAN.lockHTML("respond", "تسجيل عرضك على الفرص متاح من الباقة الأساسية") + '</div>' :
    '<form class="card2 cin" id="offer" novalidate style="animation-delay:.32s"><h2>قدّم عرضك</h2><p class="muted">' + (gov ? 'التقديم الرسمي على المناقصة بيكون عند الجهة من الإعلان الرسمي. هنا بتسجّل عرضك المبدئي في حسابك علشان نتابعه ونبلغك تلقائياً بأي تحديث على الفرصة.' : 'بتسجّل عرضك على الطلب في حسابك، وهنبلغك تلقائياً بأي تحديث عليه.') + '</p><div class="fgrid2"><label class="f2">اسم المصنع / الشركة *<input id="o-n" placeholder="الاسم كما في السجل التجاري / الرخصة الصناعية"></label><label class="f2">السعر الإجمالي<input id="o-p" inputmode="decimal" placeholder="مثلاً: 250000"></label><label class="f2">العملة<select id="o-cur"><option value="EGP">جنيه مصري</option><option value="USD">دولار</option><option value="EUR">يورو</option></select></label><label class="f2">مدة التوريد (يوم)<input id="o-d" inputmode="numeric"></label><label class="f2">صلاحية العرض<select id="o-v"><option>30 يوماً</option><option>60 يوماً</option><option>90 يوماً</option></select></label><label class="f2">المسؤول *<input id="o-c" autocomplete="name"></label><label class="f2">البريد الإلكتروني *<input id="o-e" type="email" dir="ltr" autocomplete="email"></label><label class="f2">الموبايل<input id="o-ph" type="tel" dir="ltr" autocomplete="tel"></label><label class="f2 full">ملاحظات على العرض<textarea id="o-x" placeholder="الالتزام بالمواصفات، طريقة التوريد…"></textarea></label></div><div id="o-cons"></div><p class="ferr" id="o-err" role="alert" style="color:#B42318;font-weight:700;margin:0"></p><button class="btn btn-green" type="submit" style="align-self:flex-start">تسجيل العرض</button></form><div id="offerR" hidden></div>')) +
    '</div>' +
    '<aside class="side2"><div class="card2"><h2>الوقت المتبقي</h2>' + (end ? '<div class="cdown" id="cd"><div><b>0</b><span>يوم</span></div><div><b>0</b><span>ساعة</span></div><div><b>0</b><span>دقيقة</span></div><div><b>0</b><span>ثانية</span></div></div>' : '<p class="muted">موعد الإغلاق غير معلن؛ راجع الإعلان الرسمي.</p>') + (shut ? SHUT : '<a class="btn btn-gold" href="#offer">قدّم عرضك</a>') + '</div>' +
    '<div class="card2"><h2>الجهة الطارحة</h2><b>' + t[3] + '</b><span class="muted">📍 ' + t[4] + ' · السوق ' + t[5] + '</span><span class="muted">' + (t[9] ? "التفاصيل الملزمة في الإعلان الرسمي لدى الجهة" : gov ? "جهة حكومية" : "مشترٍ على المنصة") + '</span><a class="btn btn-line btn-sm" href="' + (gov ? "tenders.html" : "rfqs.html") + '">كل طلبات الجهة</a></div>' +
    '<div class="card2"><h2>فرص مشابهة</h2><div class="sim" style="display:flex;flex-direction:column;align-items:stretch;gap:8px">' + (sim.length ? sim.map(function (o) { return '<a href="#' + o[0].toLowerCase() + '"><b>' + o[2] + '</b><br><small class="muted">' + o[5] + ' · ' + DL(o[7]) + '</small></a>'; }).join("") : '<span class="muted">لا توجد فرص مشابهة حالياً.</span>') + '</div></div></aside>';
  function tick() { if (!end) return; var ms = Math.max(0, end - Date.now()), b = $$("#cd b"); if (b.length < 4) { clearInterval(cdT); return; } b[0].textContent = Math.floor(ms / 864e5); b[1].textContent = Math.floor(ms % 864e5 / 36e5); b[2].textContent = Math.floor(ms % 36e5 / 6e4); b[3].textContent = Math.floor(ms % 6e4 / 1e3); }
  tick(); if (!shut && end) cdT = setInterval(tick, 1000);
  var OF = $("#offer"); if (!shut && OF && OF.tagName === "FORM") {
    if (window.MIGINQ) { $("#o-cons").innerHTML = MIGINQ.consentHTML("o", "opp_offer"); MIGINQ.prefill({ name: "#o-c", email: "#o-e", phone: "#o-ph", company: "#o-n" }); }
    OF.addEventListener("submit", function (e) {
      e.preventDefault(); var er = $("#o-err"), I = window.MIGINQ, v = function (i) { return $(i).value.trim(); }; er.textContent = "";
      if (!v("#o-n") || !v("#o-c") || !v("#o-e")) { er.textContent = EN ? "Please fill in the required fields (*)." : "أكمل الحقول المطلوبة (*)."; return; }
      if (!I) { er.textContent = EN ? "The sending service did not load, so nothing was sent. Please reload the page." : "خدمة الإرسال ماتحمّلتش، فمفيش حاجة اتبعتت. حدّث الصفحة."; return; }
      var c = I.check({ name: v("#o-c"), email: v("#o-e"), phone: v("#o-ph") }); if (c) { er.textContent = c; return; }
      I.send({ kind: "opp_offer", target_type: "tender", target_id: WID, target_name: t[2], name: v("#o-c"), company: v("#o-n"), email: v("#o-e"), phone: v("#o-ph"), consent_wa: I.waChecked("o"), message: v("#o-x"),
        payload: { title: t[2], entity: t[3], market: mk, sector: t[6], price: v("#o-p"), currency: $("#o-cur").value, lead_time_days: v("#o-d"), validity: $("#o-v").value, source_url: t[9] || "", ref: t[10] || "" } },
        { box: $("#offerR"), form: OF, btn: OF.querySelector("[type=submit]") }).catch(function () {});
    });
  }
  $("#shareO").onclick = function () { var u = location.href; try { navigator.clipboard.writeText(u).then(function () { toast("تم نسخ رابط الفرصة"); }, function () { toast(u); }); } catch (x) { toast(u); } };
  window.scrollTo(0, 0);
}
show(); window.addEventListener("hashchange", show);
/* the server's answer (another plan, or the GCC states just chosen) decides again */
window.addEventListener("mig:plan", function () { show(); });
''')

# ---------------- FACTORIES DIRECTORY ----------------
# ---- honest hero counts for factories.html, computed at build time from the same data (and the same filters) the pages show:
# products listed on market.html (data/oldprod.js) and published RFQs on rfqs.html (data/oldrfq.js); no rounding up, no "+".
import json as _json_fs, re as _re_fs
def _fs_arr(f, var):
    try:
        t = open(B + 'data/' + f, encoding='utf-8').read(); i = t.index('window.%s=' % var) + len('window.%s=' % var)
        return _json_fs.JSONDecoder().raw_decode(t, i)[0]
    except Exception:
        return None
def _fs_rfq_ok(x):
    if not _re_fs.match(r'^طلب سعر مجمع', str(x[2])): return True
    d = _re_fs.sub(r'[\s….]+', ' ', str(x[3] or '')).strip(); m = _re_fs.search(r':\s*(.+?)\s*\(', str(x[2])); co = m.group(1) if m else ''
    return len(d) >= 30 and not (co and d.replace(co, '').strip() == '')
_fs_p = _fs_arr('oldprod.js', 'MIGOLDP'); _fs_r = _fs_arr('oldrfq.js', 'MIGRFQ')
_FS_PROD = '{:,}'.format(len([o for o in _fs_p if not (_re_fs.search(r'\.(jpe?g|png|gif|webp)$', str(o[0]), _re_fs.I) or _re_fs.search(r'(.)\1{4,}', str(o[0])))])) if _fs_p is not None else '—'
_FS_RFQ = '{:,}'.format(len([x for x in _fs_r if _fs_rfq_ok(x)])) if _fs_r is not None else '—'
_FS_DIR = '—'  # filled in the browser with the exact number of entries in the directory grid
def _fs_ar(n, one, two, few, many):
    # Arabic number agreement for a label shown after a number: 1 · 2 · 3–10 plural · 11+ singular
    try:
        n = int(str(n).replace(',', ''))
    except ValueError:
        return many
    m = n % 100
    return one if n == 1 else two if n == 2 else few if 3 <= m <= 10 else many
_FS_PROD_L = _fs_ar(_FS_PROD, 'منتج من أعضاء المنصة', 'منتجان من أعضاء المنصة', 'منتجات من أعضاء المنصة', 'منتجاً من أعضاء المنصة')
_FS_RFQ_L = _fs_ar(_FS_RFQ, 'طلب عرض سعر منشور', 'طلبا عرض سعر منشوران', 'طلبات عروض أسعار منشورة', 'طلب عرض سعر منشور')

PAGES['factories'] = ('دليل المصانع – صنع في مصر', 'factories', COMMON_CSS + '''
.fstats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.fstats a { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; color: var(--fg); border-inline-start: 4px solid var(--green); transition: transform .2s ease; }
.fstats a:hover { transform: translateY(-3px); }
.fstats b { display: block; font-size: 1.6rem; font-weight: 800; color: var(--green); }
.fstats span { font-size: .82rem; color: var(--muted); }
.fgrid3 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.fc { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; color: var(--fg); transition: transform .25s ease, box-shadow .25s ease; }
.fc:hover { transform: translateY(-5px); box-shadow: 0 18px 34px -20px rgba(0,0,0,.4); }
.fc .cv { height: 92px; background-size: cover; background-position: center; position: relative; }
.fc .cv::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(4,25,14,.6), rgba(4,25,14,.1)); }
.fc .lg { position: absolute; bottom: -26px; inset-inline-start: 14px; z-index: 1; width: 58px; height: 58px; border-radius: 14px; background: #fff; border: 1px solid var(--line); display: grid; place-items: center; font-weight: 800; color: #C8102E; overflow: hidden; padding: 4px; font-size: 1.2rem; }
.fc .lg img { max-width: 100%; max-height: 100%; }
.fc .lg i.sp { display: block; width: 56px; height: 56px; background-size: 560px 560px; background-repeat: no-repeat; border-radius: 12px; }
.fc .b { padding: 32px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.fc h3 { font-size: .96rem; font-weight: 800; line-height: 1.45; }
.fc small { color: var(--muted); font-size: .78rem; }
.fc .ft { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 8px; }
@media (max-width: 1000px) { .fgrid3 { grid-template-columns: repeat(2, 1fr); } .fstats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .fgrid3 { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="fstats"><a href="#grid"><b class="num" id="fsN">''' + _FS_DIR + '''</b><span>منشأة صناعية وتجارية في الدليل</span></a><a href="cities.html"><b class="num" id="fsG">—</b><span>محافظة مصرية بمناطقها الصناعية والحرة</span></a><a href="market.html"><b class="num">''' + _FS_PROD + '''</b><span>''' + _FS_PROD_L + '''</span></a><a href="rfqs.html"><b class="num">''' + _FS_RFQ + '''</b><span>''' + _FS_RFQ_L + '''</span></a></div>
  <div class="tools2"><input type="search" id="q" placeholder="ابحث باسم المصنع أو المنتج أو التخصص…" aria-label="بحث"><select id="pp" aria-label="المنتج"><option value="">كل المنتجات</option></select><select id="c" aria-label="المحافظة"></select><select id="s" aria-label="القطاع"><option value="">كل القطاعات</option></select><select id="k" aria-label="النوع"><option value="">كل الأنواع</option><option value="مصنع">مصانع</option><option value="مورد">موردون</option><option value="شركة">شركات</option></select><label id="vL" style="display:flex;align-items:center;gap:6px;font-size:.88rem" hidden><input type="checkbox" id="v"> ✓ موثّق من فريق المنصة فقط</label></div>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span id="cnt" class="muted"></span><span class="note2" id="fNote"></span></div>
  <div class="fgrid3" id="grid"></div>
  <button class="btn btn-line" type="button" id="fMore" style="align-self:center" hidden>عرض المزيد</button>
</main>
''', '''
''' + MIG_VFX_JS + '''
var FAC = MIGFACX.list.slice(), COVER = MIGFACX.cover, FP = MIGFACX.fp, ENF = window.MIGLANG === "en";
function VER(f) { return !!f[5] || (f[10] !== "old" && VFX(f[0])); }
var PROFILE = "إيجيتك للكابلات";
function NN(t) { return String(t).replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\\s+/g, " ").replace(/^(مصنع|شركة|الشركة)\\s+/, "").trim().toLowerCase(); }
/* the imported member listings (MIGOLDFAC, duplicates already merged by the data clean-up) follow the facx rows; a member that is the
   same company as a facx row (KEYN, the clean-up's matching key) is listed once — so the grid holds the directory's unique count */
function mergeOld() { if (!window.MIGOLDFAC || mergeOld.done) return; mergeOld.done = 1; var SEEN = {}; FAC.forEach(function (x) { SEEN[KEYN(x[0])] = 1; }); mergeOld.dup = 0; MIGOLDFAC.forEach(function (o, oi) { if (SEEN[KEYN(o[0])]) { mergeOld.dup++; return; } if (/obeikan|العبيكان/i.test(o[0]) || (o[2] !== "جمهورية مصر العربية" && !MIGREG.of(o[2]))) return; var cv = "e3"; Object.keys(COVER).forEach(function (k) { if (o[1].indexOf(k) > -1) cv = COVER[k]; }); FAC.push([o[0], o[1], o[2], o[3], "مدرجة في دليل منصة صنع في مصر.", o[4], o[5] >= 0 ? "SP:" + o[5] + ":" + o[6] : "", cv, o[7], "", "old", oi]); }); }
mergeOld();
var allP = []; FAC.forEach(function (f) { (FP[f[0]] || []).forEach(function (x) { if (allP.indexOf(x) < 0) allP.push(x); }); });
$("#pp").innerHTML += allP.map(function (x) { return "<option>" + x + "</option>"; }).join("");
function uniq(i) { var u = []; FAC.forEach(function (f) { if (u.indexOf(f[i]) < 0) u.push(f[i]); }); return u; }
$("#c").innerHTML = MIGREG.opts(MIGREG.take());
function FR(f) { return MIGREG.of(f[2]); }
/* sector options: one per sector, near-duplicate spellings merged («اثاث» / «الأثاث», «ص.معدنية» / «صناعات معدنية», «الأدوية» / «الصناعات الدوائية») */
var SYN = { "غذائيه": "اغذيه", "دوائيه": "ادويه", "بلاستيكيه": "بلاستيك", "معدنيه": "معادن", "طبيه": "طبي", "هندسيه": "هندسي", "كهربيه": "كهربائيه", "منزليه": "منزلي" };
function SK(x) { return String(x || "").replace(/^ص\\.\\s*/, "صناعات ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").split(/[^\\u0621-\\u064Aa-zA-Z0-9]+/).map(function (w) { w = w.replace(/^و(?=...)/, "").replace(/^ال(?=..)/, ""); return SYN[w] || w; }).filter(function (w) { return w && w !== "و" && !/^صناع(ه|ات)$/.test(w); }).sort().join(" "); }
var SVAL = {};
function SV(x) { return SVAL[x] || SK(x); }
function SOPTS() { var seen = {}, o = [], EN = window.MIGLANG === "en"; FAC.forEach(function (f) { var k = SK(f[1]); if (!k) return; if (!seen[k]) { seen[k] = { k: k, n: {}, best: f[1] }; o.push(seen[k]); } var e = seen[k]; e.n[f[1]] = (e.n[f[1]] || 0) + 1; if (e.n[f[1]] > (e.n[e.best] || 0)) e.best = f[1]; });
  /* in English, options whose translated labels are the same are merged too */
  var byL = {}; SVAL = {}; o = o.filter(function (e) { e.l = EN && window.MIGTR ? String(MIGTR(e.best)) : e.best; var lk = e.l.toLowerCase(), m = byL[lk]; Object.keys(e.n).forEach(function (x) { SVAL[x] = m ? m.k : e.k; }); if (m) return false; byL[lk] = e; return true; });
  o.sort(function (a, b) { return a.l.localeCompare(b.l, EN ? "en" : "ar"); }); return '<option value="">كل القطاعات</option>' + o.map(function (e) { return '<option value="' + e.k + '">' + e.best + "</option>"; }).join(""); }
/* show the “verified only” filter only when the directory has verified records */
function VCHK() { var any = FAC.some(VER); $("#vL").hidden = !any; if (!any) $("#v").checked = false; }
/* what the directory holds, counted from the rows themselves */
function NOTE() { var v = 0, p = 0, M = window.MIGOLDFAC && mergeOld.done ? (window.MIGOVL ? MIGOVL.count("fac") : MIGOLDFAC.filter(function (o) { return !!o; }).length) : 0, d = mergeOld.dup || 0; FAC.forEach(function (f) { if (f[10] !== "old") { if (VER(f)) v++; else p++; } }); var n = $("#fNote"); if (!n) return;
  if (!M) { n.textContent = ENF ? v + " factories verified by the platform team and " + p + " from public sources; the platform directory's member listings are loading…" : ARN(v, "مصنع واحد موثّق", "مصنعان موثّقان", "مصانع موثّقة", "مصنعاً موثّقاً") + " من فريق المنصة و" + ARN(p, "مصنع واحد", "مصنعان", "مصانع", "مصنعاً") + " من مصادر عامة؛ أعضاء دليل المنصة بيتحمّلوا…"; return; }
  n.textContent = ENF ? "The directory holds " + FAC.length.toLocaleString("en-US") + " unique companies: " + v + " factories verified by the platform team, " + M.toLocaleString("en-US") + " members listed from the platform's directory (not verified) and " + p + " factor" + (p === 1 ? "y" : "ies") + " from public sources" + (d ? " — " + d + " of the members are verified factories and appear once." : ".")
    : "الدليل فيه " + ARN(FAC.length, "منشأة واحدة", "منشأتان", "منشآت فريدة", "منشأة فريدة") + ": " + ARN(v, "مصنع واحد موثّق", "مصنعان موثّقان", "مصانع موثّقة", "مصنعاً موثّقاً") + " من فريق المنصة، و" + ARN(M, "عضو واحد", "عضوان", "أعضاء", "عضواً") + " من دليل المنصة (غير موثّقين)، و" + ARN(p, "مصنع واحد", "مصنعان", "مصانع", "مصنعاً") + " من مصادر عامة" + (d ? " — و" + ARN(d, "عضو واحد منهم هو نفس مصنع موثّق فبيظهر", "عضوان منهم هما نفس مصانع موثّقة فبيظهروا", "منهم هم نفس مصانع موثّقة فبيظهروا", "منهم هم نفس مصانع موثّقة فبيظهروا") + " مرة واحدة." : "."); }
/* logo initial: from the name as displayed (English in English mode), without company prefixes or the article */
function INI(n) { var EN = window.MIGLANG === "en", x = EN && window.MIGTR ? String(MIGTR(n)) : String(n); x = EN && !/[\\u0600-\\u06FF]/.test(x) ? x.replace(/^\\s*(the|el|al)[\\s-]+/i, "") : String(n).replace(/^(مصنع|شركة|الشركة|مؤسسة|مورد|مجموعة)\\s+/, "").replace(/^ال(?=..)/, ""); var m = /[A-Za-z0-9\\u0621-\\u064A]/.exec(x); return m ? m[0].toUpperCase() : ""; }
var SHOW = 24;
(function () { var n = $("#fsN"), g = $("#fsG"); if (n) n.textContent = FAC.length.toLocaleString("en-US"); if (g && window.MIGREG && MIGREG.list) g.textContent = MIGREG.list.length; NOTE(); })();
function FURL(f) { if (f[0] === PROFILE) return "factory.html"; if (f[9]) return "https://" + String(f[9]).replace(/^https?:\\/\\//, ""); return f[8] || "factory.html"; }
function FEXT(f) { return f[10] !== "old" && FURL(f).indexOf("http") === 0; }
$("#s").innerHTML = SOPTS(); VCHK();
/* the list's state lives in the URL (sweep 2026-11-19 #4): /factories/search/#q=…&c=…&s=…&k=…&pp=…&v=1 — a shared or bookmarked link
   opens the same list, and Back comes back to it (with or without the bfcache; «عرض المزيد» is kept in history.state). Every change
   replaces the current history entry (no new entries). Still read: #q=<text> and #verified (the hubs, Janna, the footer), ?q= (a hub's
   search form without JS) and sessionStorage «mig-q» / «mig-city» (the search boxes of the other pages). */
var FSK = ["q", "c", "s", "k", "pp"], FS = { q: "", c: "", s: "", k: "", pp: "", v: false };
function fsTrim(x) { return String(x == null ? "" : x).replace(/^\\s+|\\s+$/g, ""); }
function fsParse() {
  var o = { q: "", c: "", s: "", k: "", pp: "", v: false }, h = location.hash.replace(/^#/, ""), m = /(?:^|[?&])q=([^&#]*)/.exec(location.search);
  if (m) { try { o.q = fsTrim(decodeURIComponent(m[1].replace(/\\+/g, " "))); } catch (x) { o.q = fsTrim(m[1]); } }
  if (h === "verified") o.v = true;
  else if (/^(?:q|c|s|k|pp|v)=/.test(h)) h.split("&").forEach(function (kv) { var i = kv.indexOf("="), k = kv.slice(0, i), v = kv.slice(i + 1); if (i < 1) return; try { v = decodeURIComponent(v); } catch (x) {} if (k === "v") o.v = v === "1"; else if (FSK.indexOf(k) > -1) o[k] = k === "q" ? fsTrim(v) : v; });
  return o;
}
function fsHas(id, v) { var o = $(id).options; for (var i = 0; i < o.length; i++) if (o[i].value === v) return true; return false; }
function fsWant(k) { return k === "c" && FS.c ? MIGREG.of(FS.c) || "" : FS[k] || ""; }
/* the controls → FS; a select still waiting for its option (the sectors of the member listings arrive with data/oldfac.js) keeps its wish */
function fsFromCtl() { var o = { q: fsTrim($("#q").value), v: $("#v").checked || (!!FS.v && $("#vL").hidden) }; FSK.slice(1).forEach(function (k) { var v = $("#" + k).value, w = fsWant(k); o[k] = v || (w && !fsHas("#" + k, w) ? w : ""); }); FS = o; }
function fsToCtl() { $("#q").value = FS.q; FSK.slice(1).forEach(function (k) { var w = fsWant(k); $("#" + k).value = fsHas("#" + k, w) ? w : ""; }); $("#v").checked = !!FS.v && !$("#vL").hidden; }
function fsSame() { return fsTrim($("#q").value) === FS.q && ($("#v").checked === !!FS.v || $("#vL").hidden) && FSK.slice(1).every(function (k) { var v = $("#" + k).value, w = fsWant(k); return v === w || (!v && !fsHas("#" + k, w)); }); }
function fsUrl() {
  var p = [], s = location.search.replace(/^\\?/, "").split("&").filter(function (x) { return x && !/^q=/.test(x); }).join("&");
  FSK.forEach(function (k) { if (FS[k]) p.push(k + "=" + encodeURIComponent(FS[k])); }); if (FS.v) p.push("v=1");
  return location.pathname + (s ? "?" + s : "") + (p.length ? "#" + p.join("&") : "");
}
function fsSave() { try { history.replaceState({ fshow: SHOW }, "", fsUrl()); } catch (x) {} }
FS = fsParse();
try { var pq = sessionStorage.getItem("mig-q"); if (pq) { if (!FS.q) FS.q = fsTrim(pq); sessionStorage.removeItem("mig-q"); } var pc = sessionStorage.getItem("mig-city"); if (pc) { if (!FS.c && MIGREG.of(pc)) FS.c = MIGREG.of(pc); sessionStorage.removeItem("mig-city"); } } catch (x) {}
if (!FS.c && $("#c").value) FS.c = $("#c").value;   /* MIGREG.take(): the governorate another page's search chose */
fsToCtl();
try { var hs0 = history.state; if (hs0 && +hs0.fshow > 24) SHOW = Math.min(+hs0.fshow, 6000); } catch (x) {}
window.__ofl = function () { if (mergeOld.done) return; mergeOld(); var cur = $("#s").value; $("#s").innerHTML = SOPTS(); $("#s").value = FS.s && fsHas("#s", FS.s) ? FS.s : cur; VCHK(); if (FS.v && !$("#vL").hidden) $("#v").checked = true; var n = $("#fsN"); if (n) n.textContent = FAC.length.toLocaleString("en-US"); NOTE(); render(); };
if (window.MIGOLDFAC) window.__ofl();
function render() {
  var q = $("#q").value.trim(), c = $("#c").value, s = $("#s").value, k = $("#k").value, v = $("#v").checked, pp = $("#pp").value, ql = q.toLowerCase();
  var l = FAC.filter(function (f) { var pr = (FP[f[0]] || []).join(" "); return (!c || FR(f) === c) && (!s || SV(f[1]) === s) && (!k || String(f[3]).indexOf(k) > -1) && (!v || VER(f)) && (!pp || pr.indexOf(pp) > -1) && (!q || (f[0] + f[1] + f[4] + " " + pr + (f.hay != null ? f.hay : (f.hay = MIGHAY(f[0] + " | " + f[1] + " | " + f[4]) + (FP[f[0]] || []).map(MIGHAY).join("")))).toLowerCase().indexOf(ql) > -1); });
  $("#cnt").textContent = ENF ? l.length.toLocaleString("en-US") + (l.length === 1 ? " matching listing" : " matching listings") : ARN(l.length, "منشأة واحدة مطابقة", "منشأتان مطابقتان", "منشآت مطابقة", "منشأة مطابقة");
  var total = l.length; l = l.slice(0, SHOW); var mb = $("#fMore"); if (mb) { var rest = total - SHOW; mb.hidden = total <= SHOW; mb.textContent = ENF ? "Show more (" + rest.toLocaleString("en-US") + " more)" : "عرض المزيد (" + ARN(rest, "منشأة واحدة أخرى", "منشأتان أخريان", "منشآت أخرى", "منشأة أخرى") + ")"; }
  $("#grid").innerHTML = l.length ? l.map(function (f, i) { return '<a class="fc cin" style="animation-delay:' + Math.min(i, 12) * 50 + 'ms" href="' + (f[10] === "old" ? MPG(f[11]) || "company.html#" + f[11] : "company.html#x" + MIGFACX.list.indexOf(f)) + '"><div class="cv" style="background-image:url(img/' + f[7] + '.jpg)"><span class="lg">' + (f[6] && f[6].indexOf("SP:") === 0 ? spr(f[6]) : f[6] ? '<img src="' + f[6] + '" alt="">' : INI(f[0])) + '</span></div><div class="b"><h3>' + f[0] + '</h3><small>🏷️ ' + f[1] + ' · ' + f[3] + '</small><small>📍 ' + f[2] + (!FR(f) || f[2].indexOf(MIGREG.name(FR(f))) > -1 ? '' : ' · ' + MIGREG.name(FR(f))) + '</small><p class="muted" style="font-size:.84rem">' + f[4] + '</p><div style="display:flex;flex-wrap:wrap;gap:5px">' + (FP[f[0]] || []).map(function (x) { var hit = (pp && x === pp) || (ql && x.toLowerCase().indexOf(ql) > -1); return '<span style="font-size:.74rem;border-radius:6px;padding:1px 8px;font-weight:700;' + (hit ? 'background:var(--green);color:#fff' : 'background:var(--gold-soft);color:var(--gold-deep)') + '">📦 ' + x + '</span>'; }).join("") + '</div><div class="ft">' + (VER(f) ? '<span class="chip chip-green">✓ موثّق من فريق المنصة</span>' : f[10] === "old" ? '<span class="chip chip-gray">في دليل المنصة</span>' : '<span class="chip chip-gray">من مصادر عامة</span>') + '<span class="more" style="font-size:.84rem;color:var(--green);font-weight:700">' + "ملف المصنع ←" + '</span></div></div></a>'; }).join("") : '<div class="card2" style="grid-column:1/-1;text-align:center">لا توجد نتائج بهذه الفلاتر.</div>';
}
function MPG(i) { var o = window.MIGOLDFAC ? MIGOLDFAC[i] : null, m = o && !o[16] ? /^https?:\\/\\/(?:www\\.)?madeinegyptgate\\.com\\/factories\\/([^\\/?#]+)\\/?$/i.exec(String(o[7] || "")) : null, s; if (!m) return ""; s = m[1]; try { s = decodeURIComponent(s); } catch (x) {} if (s.normalize) s = s.normalize("NFC"); return "/factories/" + encodeURIComponent(s) + "/"; }
function spr(v) { var a = v.split(":"), c = +a[2]; return '<i class="sp" role="img" aria-label="الشعار" style="background-image:url(img/old/lg' + a[1] + '.jpg);background-position:-' + (c % 10) * 56 + 'px -' + Math.floor(c / 10) * 56 + 'px"></i>'; }
$("#fMore").addEventListener("click", function () { SHOW += 24; render(); fsSave(); });
["#q", "#c", "#s", "#k", "#v", "#pp"].forEach(function (id) { $(id).addEventListener(id === "#q" ? "input" : "change", function () { SHOW = 24; }); });
$("#grid").addEventListener("click", function (e) {
  var a = e.target.closest("[data-old]"); if (!a) return; e.preventDefault(); var f = FAC[+a.dataset.old];
  var o = document.createElement("div"); o.className = "pdov";
  o.innerHTML = '<div class="box" role="dialog" aria-modal="true" style="position:relative;max-width:560px"><button class="x" type="button" aria-label="إغلاق">✕</button><div class="bd" style="padding:22px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:14px;align-items:center"><span class="fc" style="position:static;display:block"><span class="lg" style="position:static">' + (f[6] ? spr(f[6]) : INI(f[0])) + '</span></span><div><h2 style="margin:0;font-size:1.2rem">' + f[0] + '</h2><small class="muted">🏷️ ' + f[1] + ' · ' + f[3] + '</small></div></div><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0"><dt class="muted">الموقع</dt><dd style="margin:0">📍 ' + f[2] + '</dd><dt class="muted">القطاع</dt><dd style="margin:0">' + f[1] + '</dd><dt class="muted">الحالة</dt><dd style="margin:0">' + (f[5] ? '<span class="chip chip-green">✓ مصنع معتمد</span>' : '<span class="chip chip-gray">عضو مسجّل</span>') + '</dd></dl><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn btn-green" href="contact.html#rfq-form">📝 اطلب عرض سعر</a><a class="btn btn-line" href="' + f[8] + '" target="_blank" rel="noopener">الملف الكامل ↗</a></div></div></div>';
  document.body.appendChild(o); o.addEventListener("click", function (ev) { if (ev.target === o || ev.target.closest(".x")) o.remove(); });
});
["#q"].forEach(function (id) { $(id).addEventListener("input", render); });
["#c", "#s", "#k", "#v", "#pp"].forEach(function (id) { $(id).addEventListener("change", render); });
["#q", "#c", "#s", "#k", "#v", "#pp"].forEach(function (id) { $(id).addEventListener(id === "#q" ? "input" : "change", function () { fsFromCtl(); fsSave(); }); });
render();
/* a state that came from elsewhere (another page's search box, ?q=, the governorate it chose) is written into the URL too, so Back keeps it */
if ((FS.q || FS.c || FS.s || FS.k || FS.pp || FS.v) && fsUrl() !== location.pathname + location.search + location.hash) fsSave();
/* a link to this page with a new #q=… while it is open (Janna, an in-page link); in-page anchors (#grid) are left alone */
window.addEventListener("hashchange", function () { if (!/^#(?:(?:q|c|s|k|pp|v)=|verified$)/.test(location.hash)) { if (FS.q || FS.c || FS.s || FS.k || FS.pp || FS.v) fsSave(); return; } FS = fsParse(); fsToCtl(); SHOW = 24; render(); });
/* Back / Forward: the browser may restore the search box and the filters after this script ran, or show the page from its cache:
   whenever the controls do not show what the list was drawn with, draw it again from them */
function fsCheck() { if (fsSame()) return; fsFromCtl(); render(); fsSave(); }
document.addEventListener("DOMContentLoaded", fsCheck); window.addEventListener("pageshow", fsCheck);
''')

# ---------------- CITIES ----------------
PAGES['cities'] = ('المناطق الصناعية والحرة – صنع في مصر', 'cities', COMMON_CSS + '''
.ctabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.ctabs button { flex: none; display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 10px 14px; cursor: pointer; font-weight: 700; font-size: .9rem; color: var(--fg); transition: all .2s ease; }
.ctabs button.on { background: var(--green); border-color: var(--green); color: #fff; transform: translateY(-2px); }
.city { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
.city .ph { min-height: 340px; background-size: cover; background-position: center; position: relative; }
.city .ph::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(4,25,14,.85), rgba(4,25,14,.15)); }
.city .ph .in { position: absolute; inset: auto 20px 20px; z-index: 1; color: #fff; display: flex; flex-direction: column; gap: 6px; }
.city .ph h2 { font-size: 1.6rem; font-weight: 800; }
.city .b { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
.city h3 { font-size: 1rem; font-weight: 800; }
.city ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.city li { background: var(--sunken); border-radius: 10px; padding: 8px 10px; font-size: .84rem; display: flex; justify-content: space-between; gap: 6px; }
.allc { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.allc button, .allc .cbt { text-align: start; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 10px 12px; cursor: pointer; font-size: .86rem; color: var(--fg); display: flex; justify-content: space-between; gap: 8px; transition: border-color .2s ease; }
.allc button:hover, .allc .cbt:hover { border-color: var(--green); }
.allc button, .allc .cbt { align-items: center; padding: 6px 10px 6px 6px; }
.allc .cimg { flex: none; width: 74px; height: 56px; border-radius: 8px; background-size: cover; background-position: center; }
.allc .ctx { flex: 1; min-width: 0; line-height: 1.5; }
.nsrc { font-size: .78rem; font-weight: 700; margin-top: auto; }
.allc .cg { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px 0; border-bottom: 2px solid var(--green-soft); font-weight: 800; color: var(--fg); }
.allc .cg small { font-size: .66rem; color: var(--gold-deep); letter-spacing: .06em; } .allc .cg span { color: var(--muted); font-weight: 600; font-size: .8rem; } .allc .cg em { margin-inline-start: auto; font-style: normal; font-size: .8rem; color: var(--green); }
.swap { animation: cin .5s ease; }
@media (max-width: 860px) { .city { grid-template-columns: minmax(0, 1fr); } .city .b .btn { white-space: normal; } .city .ph { min-height: 240px; } }
@media (max-width: 480px) { .city ul { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="ctabs" id="ctabs" role="tablist"></div>
  <div id="city"></div>
  <div class="card2"><h2>المناطق الصناعية والحرة حسب المحافظة</h2><p class="muted">اختر منطقة لعرض مصانع محافظتها في دليل المصانع، أو افتح صفحة المحافظة لعرض مناقصاتها ومنتجاتها ومشاريعها.</p><div class="allc" id="allc"></div></div>
</main>
''', '''
var CITY = [
 ["⚓", "المنطقة الصناعية بالعين السخنة (المنطقة الاقتصادية لقناة السويس)", "محافظة السويس", "نحو 210 كم²", "إحدى مناطق الهيئة العامة للمنطقة الاقتصادية لقناة السويس (SCZone)، مجاورة لميناء العين السخنة على خليج السويس، ويعمل بها عدد من المطورين الصناعيين، منهم «تيدا مصر» في منطقة التعاون الاقتصادي والتجاري الصينية المصرية.", ["الكيماويات والبتروكيماويات", "مواد البناء", "الأجهزة المنزلية والإلكترونيات", "تجميع السيارات ومكوناتها"], ["الشركة العربية للأسمنت"], "sczone-sokhna-iz", "SUZ", "https://sczone.eg"],
 ["🏭", "مدينة العاشر من رمضان", "محافظة الشرقية", "19,584.7 فدان للمنطقة الصناعية (هيئة التنمية الصناعية)", "أكبر المدن الصناعية الجديدة في مصر، أُنشئت بالقرار الجمهوري رقم 249 لسنة 1977 وتتبع هيئة المجتمعات العمرانية الجديدة، وتضم مصانع في الصناعات الغذائية والنسيجية والدوائية والهندسية ومواد البناء.", ["الصناعات الغذائية", "المنسوجات والملابس الجاهزة", "الأدوية", "مواد البناء والحديد والصلب"], ["إيجيتك للكابلات", "النساجون الشرقيون", "المصرية الدولية للصناعات الدوائية (إيبيكو)", "سيراميكا كليوباترا"], "ic-10th-of-ramadan", "SHR", ""],
 ["🏗️", "مدينة السادس من أكتوبر", "محافظة الجيزة", "8,730 فدان للمنطقة الصناعية (هيئة التنمية الصناعية)", "مدينة جديدة غرب القاهرة أُنشئت بالقرار الجمهوري رقم 504 لسنة 1979، وتضم أربع مناطق صناعية تحتضن الصناعات الغذائية والدوائية والهندسية وصناعة السيارات.", ["الصناعات الغذائية", "الأدوية", "الصناعات الهندسية", "السيارات والصناعات المغذية"], ["جهينة للصناعات الغذائية", "إيديتا للصناعات الغذائية"], "ic-6th-of-october", "GIZ", ""],
 ["⚙️", "مدينة السادات", "محافظة المنوفية", "مدينة صناعية جديدة على الطريق الصحراوي", "مدينة صناعية جديدة على طريق القاهرة – الإسكندرية الصحراوي يغلب على مصانعها التوجه للتصدير، وتضم مجمعاً تكنولوجياً لشركة سيليكون واحة.", ["الحديد والصلب", "المنسوجات والملابس الجاهزة", "الصناعات الغذائية", "الأدوات الكهربائية"], ["حديد عز"], "ic-sadat-city", "MNF", ""],
 ["🚢", "المنطقة الحرة العامة بالإسكندرية", "محافظة الإسكندرية", "5.7 مليون م² – أكبر منطقة حرة عامة في مصر", "تديرها الهيئة العامة للاستثمار والمناطق الحرة في العامرية عند بداية طريق القاهرة – الإسكندرية الصحراوي، على بعد نحو 25 كم من وسط الإسكندرية، وتجاورها مدينة برج العرب الجديدة بمناطقها الصناعية.", ["الأدوية", "البلاستيك والراتنجات", "الأخشاب والأثاث", "السيارات والصناعات المغذية"], ["سيدي كرير للبتروكيماويات (سيدبك)", "أبوقير للأسمدة والصناعات الكيماوية", "ليسيكو مصر", "فاركو للأدوية"], "fz-alexandria", "ALX", "https://www.gafi.gov.eg"],
 ["🛳️", "المنطقة الصناعية بشرق بورسعيد (المنطقة الاقتصادية لقناة السويس)", "محافظة بورسعيد", "63 كم²", "منطقة صناعية ولوجستية متكاملة مجاورة لميناء شرق بورسعيد عند المدخل الشمالي لقناة السويس، ضمن مناطق الهيئة العامة للمنطقة الاقتصادية لقناة السويس.", ["مواد البناء", "الغزل والملابس الجاهزة", "الأدوية", "تجميع السيارات"], [], "sczone-east-port-said-iz", "PTS", "https://sczone.eg"],
 ["🧰", "مدينة الجلود بالروبيكي", "محافظة القاهرة", "506 فدان (هيئة التنمية الصناعية)", "الموقع الذي نُقلت إليه المدابغ من منطقة مجرى العيون، على بعد نحو 5 كم من مدينة بدر، وهي مخصصة لدباغة الجلود والصناعات الجلدية.", ["دباغة الجلود", "المنتجات الجلدية", "الغراء"], [], "ia-robbiki-leather-city", "CAI", "https://www.ida.gov.eg"],
 ["🪑", "مدينة دمياط للأثاث", "محافظة دمياط", "331 فداناً", "مدينة متخصصة في صناعة الأثاث بشطا في دمياط، تضم 54 عنبراً بها 1,348 مصنعاً وورشة إلى جانب مركز تكنولوجيا الأثاث، وفق بيانات مجلس الوزراء.", ["الأثاث", "الصناعات التكميلية للأثاث", "معارض الأثاث"], ["مصر لإنتاج الأسمدة (موبكو)"], "ia-damietta-furniture-city", "DMT", ""]
];
var ZT = { industrial_city: "مدينة صناعية جديدة", industrial_area: "منطقة صناعية", free_zone: "منطقة حرة", tech_park: "مجمع تكنولوجي", port_zone: "ميناء ومنطقة مينائية", investment_zone: "منطقة استثمارية" };
var ALL = (window.MIGZONES || []).map(function (z) { return z; });
var ci = 0;
$("#ctabs").innerHTML = CITY.map(function (c, i) { return '<button role="tab"' + (i ? "" : ' class="on"') + ' data-i="' + i + '">' + c[0] + ' ' + c[1].replace(/\\s*\\(.*?\\)/, "").replace(/ – .*$/, "").replace(/ وميناء .*$/, "") + '</button>'; }).join("");
function showCity() {
  var c = CITY[ci];
  /* c[7]: the zone id of this featured city in zones.js (link + photo); name matching is only a fallback, preferring industrial cities */
  var czz = ALL.filter(function (z) { return z.id === c[7]; })[0] || ALL.filter(function (z) { return z.region_code === c[8] && (z.name_ar.indexOf(c[1].replace(/^مدينة\\s+/, "").split(" (")[0]) > -1 || c[1].indexOf(z.name_ar) > -1); }).sort(function (a, b) { return (b.type === "industrial_city") - (a.type === "industrial_city"); })[0], cimg = (czz && window.MIGIND && MIGIND.zone(czz.id)) || "img/m0.jpg";
  $("#city").innerHTML = '<div class="city swap"><div class="ph" style="background-image:url(' + cimg + '), url(img/m1.jpg)"><div class="in"><span class="chip chip-gold" style="align-self:flex-start">📊 ' + c[3] + '</span><h2>' + c[0] + ' ' + c[1] + '</h2><span>📍 ' + c[2] + '</span></div></div><div class="b"><p>' + c[4] + '</p><h3>القطاعات المستهدفة</h3><ul>' + c[5].map(function (x) { return '<li>🏢 ' + x + ' <span class="chip chip-green">قطاع رئيسي</span></li>'; }).join("") + '</ul>' + (c[6].length ? '<h3>مصانع من المحافظة في دليل المنصة</h3><ul>' + c[6].map(function (x) { return '<li>🔹 ' + x + ' <span class="chip chip-gold">في الدليل</span></li>'; }).join("") + '</ul>' : '') + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (czz ? '<a class="btn btn-gold" href="city.html#' + czz.id + '">صفحة المدينة: الفرص والمصانع والمنتجات ←</a>' : '') + '<a class="btn btn-green" href="factories.html" data-city="' + c[8] + '">استعراض مصانع المحافظة</a><a class="btn btn-line" href="region.html#' + c[8] + '">صفحة المحافظة</a>' + (c[9] ? '<a class="btn btn-line" href="' + c[9] + '" target="_blank" rel="noopener">الموقع الرسمي ↗</a>' : '') + '</div></div></div>';
}
$("#ctabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; ci = +b.dataset.i; $$("#ctabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); showCity(); });
var CIND = ["m0.jpg", "m1.jpg", "m2.jpg", "m3.jpg", "m4.jpg", "e0.jpg", "e1.jpg", "e2.jpg", "e3.jpg", "e4.jpg"];
function CIMG(c, rg, k) { var zz = ALL.filter(function (z) { return z.name_ar === c; })[0], zi = zz && window.MIGIND && MIGIND.zone(zz.id); if (zi) return zi; var g = "img/" + CIND[(c.length * 7 + k * 3) % CIND.length]; return g; }
$("#allc").innerHTML = MIGREG.list.map(function (r) { var l = ALL.filter(function (z) { return z.region_code === r[0]; }); return l.length ? '<a class="cg" href="region.html#' + r[0] + '"><small>' + r[0] + '</small>محافظة ' + r[1] + ' <span>(' + l.length + ')</span><em>صفحة المحافظة ←</em></a>' + l.map(function (z, k) { return '<a class="cbt" href="city.html#' + z.id + '" title="' + (z.operator_ar || "").replace(/"/g, "") + '"><span class="cimg" style="background-image:url(' + CIMG(z.name_ar, r[0], k) + ')"></span><span class="ctx">📍 ' + z.name_ar + '<br><small class="muted">' + (ZT[z.type] || "") + (z.city ? " · " + z.city : "") + '</small></span><span class="muted">←</span></a>'; }).join("") : ""; }).join("");
document.addEventListener("click", function (e) { var a = e.target.closest("[data-city]"); if (!a) return; try { sessionStorage.setItem("mig-city", a.dataset.city); } catch (x) {} if (a.tagName === "BUTTON") { var gc = window.MIGREG ? MIGREG.of(a.dataset.city) : ""; location.href = "/factories/search/" + (gc ? "#c=" + gc : ""); } });
showCity();
if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { var auto = setInterval(function () { ci = (ci + 1) % CITY.length; $$("#ctabs button").forEach(function (x, i) { x.classList.toggle("on", i === ci); }); showCity(); }, 7000); $("#ctabs").addEventListener("click", function () { clearInterval(auto); }); }
''')

# ---------------- MEDIA CENTER ----------------
PAGES['media-center'] = ('المركز الإعلامي – صنع في مصر', 'media', COMMON_CSS + '''
.vgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.vc { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; text-align: start; padding: 0; color: var(--fg); transition: transform .25s ease, box-shadow .25s ease; }
.vc:hover { transform: translateY(-5px); box-shadow: 0 18px 34px -20px rgba(0,0,0,.4); }
.vc .th { display: block; width: 100%; aspect-ratio: 16/9; max-width: 100%; background-size: cover; background-position: center; position: relative; }
.vc .th .pl { position: absolute; inset: 0; margin: auto; width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,.92); color: #8E0B20; display: grid; place-items: center; transition: transform .25s ease; }
.vc:hover .pl { transform: scale(1.15); }
.vc .th .du { position: absolute; bottom: 8px; inset-inline-end: 8px; background: rgba(0,0,0,.7); color: #fff; font-size: .75rem; border-radius: 6px; padding: 0 8px; }
.vc .b { width: 100%; box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.vc h3 { font-size: .98rem; font-weight: 800; line-height: 1.5; }
.vc small { color: var(--muted); font-size: .8rem; }
.ngrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.nw2 { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 0 0 16px; display: flex; flex-direction: column; gap: 8px; color: var(--fg); overflow: hidden; transition: transform .2s ease, box-shadow .2s ease; }
.nw2:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -22px rgba(142,11,32,.55); }
.nw2 > :not(.nim) { margin-inline: 16px; }
.nim { position: relative; display: block; aspect-ratio: 16 / 9; background-size: cover; background-position: center; margin-bottom: 4px; }
.nim::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(4,25,14,.45), transparent 55%); }
.nim .chip { position: absolute; top: 10px; inset-inline-start: 10px; z-index: 1; background: var(--green); color: #fff; }
.nw2 h3 { margin-inline: 16px; font-size: 1rem; font-weight: 800; line-height: 1.55; }
.nmore { display: flex; justify-content: center; margin-top: 14px; }
.evl { display: flex; flex-direction: column; gap: 10px; }
.ev2 { display: grid; grid-template-columns: 90px 1fr auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
.ev2 .d { background: var(--green); color: #fff; border-radius: 12px; text-align: center; padding: 8px 4px; font-weight: 800; line-height: 1.3; }
.ev2 .d small { display: block; font-weight: 600; font-size: .72rem; opacity: .85; }
.vmodal { position: fixed; inset: 0; background: rgba(4,15,9,.75); z-index: 70; display: grid; place-items: center; padding: 16px; }
.vmodal .box { width: min(860px, 100%); background: #000; border-radius: 16px; overflow: hidden; position: relative; }
.vmodal .box .th { aspect-ratio: 16/9; max-width: 100%; background-size: cover; background-position: center; display: grid; place-items: center; color: #fff; text-align: center; }
.vmodal .box .th div { background: rgba(0,0,0,.6); padding: 14px 18px; border-radius: 12px; max-width: 80%; }
.vmodal .x { position: absolute; top: 10px; inset-inline-end: 10px; z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; background: #fff; cursor: pointer; }
.vmodal .box.nrd { background: var(--surface); color: var(--fg); padding: 22px 20px 20px; display: flex; flex-direction: column; gap: 10px; max-height: 90vh; overflow: auto; width: min(720px, 100%); }
.vmodal .box.nrd .x { background: var(--sunken, #F1F5F9); }
.nrd h2 { font-size: 1.2rem; font-weight: 800; line-height: 1.6; margin: 0; padding-inline-end: 44px; }
.nrd p { margin: 0; line-height: 1.9; }
.nrd .chip { align-self: flex-start; }
.nrd .btn { align-self: flex-start; }
.nrd .lockbox { margin: 8px auto 0; }
@media (max-width: 900px) { .vgrid, .ngrid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .vgrid, .ngrid { grid-template-columns: 1fr; } .ev2 { grid-template-columns: 70px 1fr; } .ev2 .btn { grid-column: 1 / -1; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="seg2" id="mtabs" role="tablist"><button class="on" data-k="news">📰 البوابة الإخبارية</button><button data-k="videos">🎥 المرئيات واللقاءات</button><button data-k="events">📅 المعارض والفعاليات</button></div>
  <section id="news" class="card2"><h2>البوابة الإخبارية</h2><div class="ngrid" id="ngrid"></div><div class="nmore" id="nMoreW"><button type="button" class="btn btn-line" id="nMore">عرض المزيد</button></div></section>
  <section id="videos" class="card2"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h2>المرئيات واللقاءات الصناعية</h2><div class="seg2" id="vcat"></div></div><div class="vgrid" id="vgrid"></div></section>
  <section id="events" class="card2"><h2>المعارض والفعاليات القادمة</h2><div class="evl" id="evl"></div><span class="note2">المواعيد وفق المواقع الرسمية للمنظمين؛ يُرجى التأكد منها قبل الزيارة.</span></section>
</main>
<div class="vmodal" id="vm" role="dialog" aria-modal="true" aria-label="فيديو" hidden></div>
''', '''
var NEWS = [["صناعة", "09 نوفمبر 2026", "تعرّف على المنظومة الرقمية الموحدة لدعم المصنعين بوزارة الصناعة", "توفر المنظومة باقة متكاملة من الخدمات الصناعية الرقمية للمستثمر في جميع مراحل المشروع، وتحدد لأول مرة مدداً زمنية ملزمة للاستجابة لشكاوى المصنعين، وتطلق خدمة «احسب فرصتك» لإعداد دراسة جدوى مبدئية، ومعرضاً رقمياً لمستلزمات الإنتاج يدعم تعميق التصنيع المحلي.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d8%aa%d8%b9%d8%b1%d9%81-%d8%b9%d9%84%d9%89-%d8%a7%d9%84%d9%85%d9%86%d8%b8%d9%88%d9%85%d8%a9-%d8%a7%d9%84%d8%b1%d9%82%d9%85%d9%8a%d8%a9-%d8%a7%d9%84%d9%85%d9%88%d8%ad%d8%af%d8%a9-%d9%84%d8%af%d8%b9-4/"], ["صناعة", "09 نوفمبر 2026", "رئيس الوزراء يستعرض محاور خطة توطين صناعة السيارات والصناعات المغذية", "استعرض الدكتور مصطفى مدبولي رئيس مجلس الوزراء أهم محاور خطة توطين صناعة السيارات والصناعات المغذية لها، بحضور المهندس خالد هاشم وزير الصناعة.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d8%b1%d8%a6%d9%8a%d8%b3-%d8%a7%d9%84%d9%88%d8%b2%d8%b1%d8%a7%d8%a1-%d9%8a%d8%b3%d8%aa%d8%b9%d8%b1%d8%b6-%d9%85%d8%ad%d8%a7%d9%88%d8%b1-%d8%ae%d8%b7%d8%a9-%d8%aa%d9%88%d8%b7%d9%8a%d9%86-%d8%b5%d9%86/"], ["صناعة", "04 نوفمبر 2026", "وزير الصناعة يشارك في افتتاح قمة الصلب العربي التاسعة عشرة بالقاهرة", "شارك وزير الصناعة في افتتاح الدورة التاسعة عشرة لقمة الصلب العربي والمعرض الدولي للحديد والصلب المصاحب لها، بمشاركة شركات ومؤسسات من مختلف الدول العربية.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d9%88%d8%b2%d9%8a%d8%b1-%d8%a7%d9%84%d8%b5%d9%86%d8%a7%d8%b9%d8%a9-%d9%8a%d8%b4%d8%a7%d8%b1%d9%83-%d9%81%d9%8a-%d8%a7%d9%81%d8%aa%d8%aa%d8%a7%d8%ad-%d9%81%d8%b9%d8%a7%d9%84%d9%8a%d8%a7%d8%aa-%d9%82/"], ["استثمار", "11 أكتوبر 2026", "مشروع صيني جديد بمنطقة السخنة الصناعية المتكاملة يعزز الصناعات التكميلية", "يأتي مشروع شركة «ليجيالونغ» الصينية بمنطقة السخنة الصناعية المتكاملة إضافةً نوعية للصناعات التكميلية داخل المنطقة الاقتصادية لقناة السويس، بما يدعم توطين الصناعات المتخصصة ونقل التكنولوجيا وزيادة تنافسية المنتجات المصرية.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d9%8a%d8%a3%d8%aa%d9%8a-%d9%85%d8%b4%d8%b1%d9%88%d8%b9-%d8%b4%d8%b1%d9%83%d8%a9-%d9%84%d9%8a%d8%ac%d9%8a%d8%a7%d9%84%d9%88%d9%86%d8%ba-%d8%a7%d9%84%d8%b5%d9%8a%d9%86%d9%8a%d8%a9-%d8%a8/"], ["استثمار", "07 أكتوبر 2026", "نظام الإيجار المنتهي بالتملك للأراضي الصناعية", "يتيح النظام مدداً إيجارية تبدأ من 7 سنوات وتصل إلى 21 عاماً بحد أقصى مقابل إيجار سنوي يبلغ 5% من سعر المتر المربع، لتخفيف الأعباء المالية الأولية عن المستثمر الصناعي.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d8%aa%d8%b9%d8%b1%d9%81-%d8%b9%d9%84%d9%89-%d9%86%d8%b8%d8%a7%d9%85-%d8%a7%d9%84%d8%a5%d9%8a%d8%ac%d8%a7%d8%b1-%d8%a7%d9%84%d9%85%d9%86%d8%aa%d9%87%d9%8a-%d8%a8%d8%a7%d9%84%d8%aa%d9%85%d9%84%d9%83/"], ["تمويل", "04 أكتوبر 2026", "إطلاق صندوق إعادة هيكلة المصانع المتعثرة برأسمال مليار جنيه", "أعلن محافظ البنك المركزي المصري ووزير الصناعة إطلاق «صندوق إعادة هيكلة المصانع المتعثرة» برأسمال يبلغ مليار جنيه، للمشاركة في رؤوس أموال المصانع المتعثرة وإعادة تشغيلها.", "منصة صنع في مصر", "https://madeinegyptgate.com/%d9%85%d9%86-%d8%a7%d9%84%d8%aa%d8%b9%d8%ab%d8%b1-%d8%a5%d9%84%d9%89-%d8%a7%d9%84%d8%a5%d9%86%d8%aa%d8%a7%d8%ac-%d8%b1%d8%a4%d9%88%d8%b3-%d8%a3%d9%85%d9%88%d8%a7%d9%84-%d8%a8%d9%80%d8%b1/"]];
var VID = []; /* only real videos (data/videos.js, verified via oEmbed); the former illustrative list is gone */
var EV = [["29–31", "مارس 2027", "معرض ومؤتمر مصر الدولي للطاقة (إيجيبس 2027)", "القاهرة · مركز مصر للمعارض الدولية – القاهرة الجديدة", "https://www.egypes.com/", "dmg events"], ["14–16", "يونيو 2027", "معرض بيج 5 كونستراكت إيجيبت 2027", "القاهرة · مركز مصر للمعارض الدولية – القاهرة الجديدة", "https://www.big5constructegypt.com/", "dmg events"]];
function dA(d, o) { try { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", o || { day: "numeric", month: "long", year: "numeric" }).format(new Date(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d) ? d + "T12:00:00" : d)); } catch (e) { return d; } }
function fmtDur(s) { s = Math.round(+s); if (!s) return ""; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); }
/* procurement news («أخبار المشتريات») only for the plans that have it (Premium and up — data/plan.js newsOK) */
var NOK = function (n) { return n && (!window.MIGPLAN || !MIGPLAN.newsOK || MIGPLAN.newsOK(n)); }, RN_ = window.REAL && REAL.news ? REAL.news.filter(NOK) : [];
/* «أخبار المشتريات» never get a public page (seo_build skips them), so they are read HERE: a card opens #read=<index>, and article.html#<index or
   id> of such an item (home ticker, media strip, Janna) lands here through the shim's fallback (review M-2 / B-2) */
function isProcN(n) { return !!n && String(n.category_ar || "").replace(/^ +| +$/g, "") === "أخبار المشتريات"; }
var RHREF = location.pathname + location.search;
if (window.REAL && RN_.length) NEWS = (RN_.filter(function (n) { return n.category_ar !== "شؤون حكومية"; }).length ? RN_.filter(function (n) { return n.category_ar !== "شؤون حكومية"; }) : RN_).map(function (n) { return [n.category_ar, dA(n.date), n.title_ar, n.summary_ar, n.source_name, n.url, n.image_file || "", REAL.news.indexOf(n), isProcN(n)]; });
if (window.REAL && REAL.events.length) EV = REAL.events.map(function (e) { var s = new Date(e.start_date + "T12:00:00"), t = new Date((e.end_date || e.start_date) + "T12:00:00"), mo = new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", { month: "long", year: "numeric" }).format(s); return [s.getDate() + (t.getDate() !== s.getDate() ? "–" + t.getDate() : ""), mo, e.name_ar, e.city + (e.venue ? " · " + e.venue : ""), e.url, e.organizer]; });
var NK = [["أسمنت", "m3"], ["بناء", "m3"], ["عقار", "m3"], ["إسكان", "m3"], ["حديد", "m4"], ["صلب", "m4"], ["تعدين", "m4"], ["معادن", "m4"], ["بتروك", "m1"], ["كيماو", "m1"], ["بوليمر", "m1"], ["بروبيلين", "m1"], ["نفط", "m1"], ["طاقة", "e3"], ["كهرب", "e2"], ["هيدروجين", "e3"], ["أغذية", "m2"], ["غذائ", "m2"], ["زراع", "m2"], ["تمور", "m2"], ["ميناء", "hero"], ["موانئ", "hero"], ["صادرات", "hero"], ["تصدير", "hero"], ["لوجست", "hero"], ["شحن", "hero"], ["أدوية", "e1"], ["دواء", "e1"], ["صح", "e1"], ["معرض", "e2"], ["منتدى", "e0"], ["مؤتمر", "e0"], ["مصنع", "e0"], ["صناع", "m0"], ["تراخيص", "p2"], ["استثمار", "p2"], ["أسعار", "p5"], ["مؤشر", "p5"]];
var NPOOL = ["m0", "e0", "m4", "p2", "m1", "e2", "m3", "hero"];
function NIMG(n, i) { var t = n[2] + " " + n[3]; for (var k = 0; k < NK.length; k++) if (t.indexOf(NK[k][0]) > -1) return NK[k][1]; return NPOOL[i % NPOOL.length]; }
function NC(n, i, k) { var href = n[7] != null && n[7] > -1 ? (n[8] ? RHREF + "#read=" + n[7] : "article.html#" + n[7]) : ""; return '<article class="nw2 cin" style="animation-delay:' + Math.min(k, 12) * 60 + 'ms">' + (href ? '<a href="' + href + '" style="display:contents;color:inherit">' : '') + '<span class="nim" style="background-image:url(' + (n[6] || 'img/' + NIMG(n, i) + '.jpg') + ')"><span class="chip chip-green">' + n[0] + '</span></span><h3>' + n[2] + '</h3>' + (href ? '</a>' : '') + '<p class="muted" style="font-size:.86rem">' + n[3] + '</p><small class="muted">📅 ' + n[1] + '</small>' + (n[5] ? (OWN.test(n[5]) ? '<a class="nsrc" href="' + (href || n[5].replace(/^https?:\\/\\/www\\./i, "https://")) + '">المصدر: ' + n[4] + ' ←</a>' : '<a class="nsrc" href="' + n[5] + '" target="_blank" rel="noopener">المصدر: ' + n[4] + ' ↗</a>') : '') + '</article>'; }
var OWN = /^https?:\\/\\/(?:www\\.)?madeinegyptgate\\.com\\//i;
/* news.html: 24 cards first, then «عرض المزيد» reveals 24 more */
var NSHOW = 0;
function moreN() { var b = NEWS.slice(NSHOW, NSHOW + 24); $("#ngrid").insertAdjacentHTML("beforeend", b.map(function (n, k) { return NC(n, NSHOW + k, k); }).join("")); NSHOW += b.length; $("#nMoreW").style.display = NSHOW >= NEWS.length ? "none" : ""; }
moreN(); $("#nMore").addEventListener("click", moreN);
if (window.MIGVIDS && MIGVIDS.length) VID = MIGVIDS.map(function (v) { return [String(v.thumb || "").indexOf("https://i.ytimg.com/vi/" + v.id + "/") === 0 ? v.thumb : "yt/" + v.id, v.category_ar, fmtDur(v.duration), (v.date && v.date.length >= 10) ? dA(v.date.slice(0, 10), v.date_approx ? { month: "long", year: "numeric" } : null) : (v.date ? v.date.slice(0, 4) : "يوتيوب"), v.title_ar, v.channel, v.url]; });
var cats = ["الكل"]; VID.forEach(function (v) { if (cats.indexOf(v[1]) < 0) cats.push(v[1]); });
$("#vcat").innerHTML = cats.map(function (c, i) { return '<button data-c="' + c + '"' + (i ? "" : ' class="on"') + '>' + c + (i ? "" : " (" + VID.length + ")") + '</button>'; }).join("");
var vc = "الكل";
function rv() { if (!VID.length) { $("#vgrid").innerHTML = '<p class="muted">' + (window.MIGLANG === "en" ? "Videos appear here from their official channels." : "الفيديوهات بتظهر هنا من قنواتها الرسمية.") + '</p>'; return; } $("#vgrid").innerHTML = VID.filter(function (v) { return vc === "الكل" || v[1] === vc; }).map(function (v, i) { return '<button class="vc cin" style="animation-delay:' + Math.min(i, 12) * 50 + 'ms" data-v="' + VID.indexOf(v) + '"><span class="th" style="background-image:url(' + (/^https:/.test(v[0]) ? v[0] : 'img/' + v[0] + '.jpg') + ')"><span class="pl"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span class="du num">' + v[2] + '</span></span><span class="b"><span class="chip chip-gold" style="align-self:flex-start">' + v[1] + '</span><h3>' + v[4] + '</h3><small>🎤 ' + v[5] + ' · 📅 ' + v[3] + '</small></span></button>'; }).join(""); }
$("#vcat").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; vc = b.dataset.c; $$("#vcat button").forEach(function (x) { x.classList.toggle("on", x === b); }); rv(); });
rv();
$("#vgrid").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; var v = VID[+b.dataset.v]; $("#vm").innerHTML = '<div class="box"><button class="x" id="vx" aria-label="إغلاق">✕</button><div class="th" style="background-image:url(' + (/^https:/.test(v[0]) ? v[0] : 'img/' + v[0] + '.jpg') + ')"><div><b>' + v[4] + '</b><br><small>🎤 ' + v[5] + '</small><br>' + (v[6] ? '<a class="btn btn-gold" style="margin-top:10px" href="' + v[6] + '" target="_blank" rel="noopener">شاهد على يوتيوب ↗</a>' : '') + '</div></div></div>'; $("#vm").hidden = false; window.__vmFrom = b; $("#vx").focus(); });
function vmClose() { $("#vm").hidden = true; if (RD) { RD = null; if (/^#read=/.test(location.hash)) try { history.replaceState(null, "", RHREF); } catch (e) {} } if (window.__vmFrom && window.__vmFrom.focus) window.__vmFrom.focus(); }
/* the reader of one procurement news item (REAL.news[index], or the Control Center id «n-…»): the item for Premium and up, the lock box otherwise */
var RD = null;
function exh(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function readFind(k) { var N = (window.REAL && REAL.news) || [], i; if (/^[0-9]+$/.test(k)) { i = +k; return N[i] ? { n: N[i], i: i } : null; } for (i = 0; i < N.length; i++) if (N[i] && String(N[i].id || "") === k) return { n: N[i], i: i }; return null; }
function readHTML(n) {
  var E = window.MIGLANG === "en", P = window.MIGPLAN, x = '<button class="x" id="vx" type="button" aria-label="' + (E ? "Close" : "إغلاق") + '">✕</button>';
  if (!NOK(n)) return '<div class="box nrd">' + x + (P && P.lockHTML ? P.lockHTML("procurement", E ? "Procurement news is for members on the Premium plan and up" : "أخبار المشتريات للمشتركين من الباقة المميزة وطالع") : "") + "</div>";
  return '<div class="box nrd">' + x + '<span class="chip chip-green">' + exh(n.category_ar) + '</span><h2 id="nrdT">' + exh(n.title_ar) + '</h2><small class="muted">📅 ' + exh(dA(n.date)) + (n.source_name ? " · " + exh(n.source_name) : "") + "</small>"
    + (n.summary_ar ? "<p>" + exh(n.summary_ar) + "</p>" : "") + (/^https:/.test(String(n.url || "")) ? '<a class="btn btn-green" href="' + exh(n.url) + '" target="_blank" rel="noopener">' + (E ? "Read it at the source ↗" : "اقرأ الخبر من المصدر ↗") + "</a>" : "") + "</div>";
}
function readOpen() {
  var m = /^#read=(.+)$/.exec(location.hash || ""), k; if (!m) return;
  try { k = decodeURIComponent(m[1]); } catch (e) { k = m[1]; }
  var r = readFind(k); if (!r || !isProcN(r.n)) return;
  RD = r; $("#vm").innerHTML = readHTML(r.n); $("#vm").setAttribute("aria-label", window.MIGLANG === "en" ? "Procurement news" : "أخبار المشتريات"); $("#vm").hidden = false;
  if (!window.__vmFrom || !document.body.contains(window.__vmFrom)) window.__vmFrom = null; var bx = $("#vx"); if (bx) bx.focus();
}
document.addEventListener("click", function (e) { var a = e.target && e.target.closest ? e.target.closest('a[href*="#read="]') : null; if (a) window.__vmFrom = a; }, true);
window.addEventListener("hashchange", readOpen);
/* the server's answer about the plan (MIGPLAN.update): the open reader follows it */
window.addEventListener("mig:plan", function () { if (RD && !$("#vm").hidden) { $("#vm").innerHTML = readHTML(RD.n); var bx = $("#vx"); if (bx) bx.focus(); } });
$("#vm").addEventListener("click", function (e) { if (e.target.id === "vm" || e.target.id === "vx") vmClose(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#vm").hidden) vmClose(); });
$("#evl").innerHTML = EV.map(function (e) { return '<div class="ev2"><span class="d num">' + e[0] + '<small>' + e[1] + '</small></span><div><b>' + e[2] + '</b><br><small class="muted">📍 ' + e[3] + '</small></div>' + (e[4] ? '<a class="btn btn-sm btn-green" href="' + e[4] + '" target="_blank" rel="noopener">الموقع الرسمي ↗</a>' : '') + '</div>'; }).join("");
$("#mtabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; $$("#mtabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); document.getElementById(b.dataset.k).scrollIntoView({ behavior: "smooth", block: "start" }); });
function hashGo() { var h = location.hash.slice(1); if (h && document.getElementById(h)) { $$("#mtabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.k === h); }); setTimeout(function () { document.getElementById(h).scrollIntoView({ block: "start" }); }, 200); } }
hashGo(); window.addEventListener("hashchange", hashGo); readOpen();
''')

# ---------------- CONTACT ----------------
PAGES['contact'] = ('اتصل بنا – صنع في مصر', 'contact', COMMON_CSS + '''
.cgrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 20px; align-items: start; }
.cinfo { display: flex; flex-direction: column; gap: 10px; }
.cinfo .it { display: flex; gap: 12px; align-items: center; text-align: start; font: inherit; width: 100%; cursor: pointer; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; color: var(--fg); transition: transform .2s ease, border-color .2s ease; }
.cinfo .it:hover { transform: translateX(-4px); border-color: var(--green); }
.cinfo .ic { width: 46px; height: 46px; border-radius: 12px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-size: 1.3rem; flex: none; }
.cinfo small { display: block; color: var(--muted); font-size: .78rem; }
.cinfo b { overflow-wrap: anywhere; }
.cinfo div.it { cursor: default; }
.cinfo .ct { padding: 0; gap: 0; align-items: stretch; overflow: hidden; }
.cinfo .ct > a { display: flex; gap: 12px; align-items: center; flex: 1 1 auto; min-width: 0; padding: 14px; color: var(--fg); text-decoration: none; cursor: pointer; }
.cinfo .ct > a:focus-visible, .cinfo .cp:focus-visible { outline: 2px solid var(--green); outline-offset: -2px; }
.cinfo .cp { flex: none; font: inherit; font-size: .8rem; font-weight: 700; color: var(--green); background: var(--green-soft); border: 0; border-inline-start: 1px solid var(--line); padding: 0 14px; cursor: pointer; min-width: 64px; }
.cinfo .cp:hover { background: var(--green); color: #fff; }
html[lang=en] .cinfo .ar-only { display: none; }
.faq details { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--surface); }
.faq summary { cursor: pointer; font-weight: 700; }
.faq p { margin-top: 8px; color: var(--muted); }
@media (max-width: 860px) { .cgrid { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="cgrid">
    <div class="cinfo">
      <div class="it ct"><a href="tel:+201279188996" data-tel-text="1" data-mig-setting="whatsapp_display"><span class="ic">📞</span><span><small>الموبايل / الواتساب</small><b dir="ltr">01279188996</b></span></a><button class="cp" type="button" data-copy="01279188996" data-mig-setting="whatsapp_display" aria-label="نسخ رقم الموبايل"><span aria-hidden="true">⧉</span> نسخ</button></div>
      <a class="it" href="https://wa.me/201279188996" data-mig-setting="whatsapp_number"><span class="ic">💬</span><span><small>محادثة واتساب</small><b>واتساب المنصة الرسمي</b></span></a>
      <div class="it ct"><a href="mailto:info@madeinegyptgate.com" data-mig-setting="contact_email"><span class="ic">✉️</span><span><small>البريد الإلكتروني الرسمي</small><b>info@madeinegyptgate.com</b></span></a><button class="cp" type="button" data-copy="info@madeinegyptgate.com" data-mig-setting="contact_email" aria-label="نسخ البريد الإلكتروني"><span aria-hidden="true">⧉</span> نسخ</button></div>
      <div class="it ct"><a href="tel:+20238346757" data-mig-setting="hotline_tel" data-mig-setting-text="hotline_display"><span class="ic">☎️</span><span><small>الخط الساخن (الهاتف الأرضي)</small><b dir="ltr">02 38346757</b></span></a><button class="cp" type="button" data-copy="+20238346757" data-mig-setting="hotline_tel" aria-label="نسخ رقم الخط الساخن"><span aria-hidden="true">⧉</span> نسخ</button></div>
      <a class="it" href="https://www.google.com/maps/search/?api=1&query=%D8%A7%D9%84%D8%AD%D9%8A+11+%D9%85%D8%AF%D9%8A%D9%86%D8%A9+%D8%A7%D9%84%D8%B3%D8%A7%D8%AF%D8%B3+%D9%85%D9%86+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9+%D9%85%D8%B5%D8%B1" target="_blank" rel="noopener"><span class="ic">📍</span><span><small>المقر الرئيسي (الجيزة – مدينة السادس من أكتوبر)</small><b data-mig-setting="address_ar">الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية</b></span></a>
      <div class="it"><span class="ic">🏢</span><span><small>المالك</small><a href="https://eafid.org/" target="_blank" rel="noopener" style="display:block;width:max-content;margin:6px 0"><img src="img/eafid-logo.png" alt="شعار الجمعية المصرية للتنمية الصناعية" width="200" height="65" style="display:block;width:200px;height:auto;border:1px solid var(--line);border-radius:10px;background:#fff;padding:4px"></a><b>الجمعية المصرية للتنمية الصناعية</b><small class="ar-only" dir="ltr" style="text-align:start">Egypt Industrial Development Association</small><small>جمعية غير هادفة للربح، مشهرة برقم 6189 لسنة 2017 وتعمل تحت إشراف وزارة التضامن الاجتماعي · <a href="https://eafid.org/" target="_blank" rel="noopener">eafid.org</a></small></span></div>
      <div class="it"><span class="ic">⚙️</span><span><small>المشغّل</small><b>الحسيني جروب وشركاءه</b><small>استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير</small></span></div>
      <div class="card2 faq"><h2>أسئلة شائعة</h2>
        <details open><summary>كيف أسجّل مصنعي؟</summary><p>اختار الباقة المناسبة لمصنعك، واملأ استمارة التسجيل وابعت الطلب: بيوصلك رقم متابعة على الإيميل، وبتدخل بكود لمرة واحدة وتكمّل ملفك. <span data-mig-buy>الدفع بيتم في صفحة بوابة الدفع الآمنة نفسها، ورابطه بيوصلك تلقائياً على الإيميل أول ما يتفعّل — ومنصتنا مش بتطلب بيانات كارت أبداً. </span>رفع مستندات المنشأة (السجل التجاري والبطاقة الضريبية والرخصة الصناعية) من حسابك هيتفعّل في المرحلة الجاية من المنصة.</p><a class="fgo" href="register.html#plans">📝 ابدأ التسجيل الآن ←</a></details>
        <details><summary>هل يوجد تسجيل مجاني؟</summary><p>لا يوجد تسجيل مجاني. التسجيل بباقات سنوية تُختار وفق حجم مصنعك وإنتاجه، وتتيح لك المنصة الوصول إلى طلبات التوريد وفرص البيع من الجهات والمقاولين والمشترين.</p><a class="fgo" href="register.html#plans" data-mig-buy>📦 الباقات والأسعار ←</a></details>
        <details><summary>كيف أتابع طلب عرض السعر؟</summary><p>أدخل رقم الطلب وآخر 4 أرقام من موبايلك في صفحة التتبع (أو ادخل بحسابك) وهتشوف حالته الحقيقية: اتبعت لكام مصنع مسجّل، والردود وعروض الأسعار اللي وصلت.</p><a class="fgo" href="track.html">🎯 تتبع حالة الطلب ←</a></details>
        <details><summary>أين أجد المناقصات وطلبات الأسعار؟</summary><p>في صفحات المناقصات وطلبات الأسعار، حسب المحافظة والقطاع والنطاق الجغرافي لباقتك، مع رابط الإعلان الرسمي لكل مناقصة. المنصة تعرض الفرص للمعلومات ولا تطرح المناقصات ولا ترسيها.</p><a class="fgo" href="tenders.html">📑 المناقصات وطلبات الأسعار ←</a></details>
        <details><summary>كيف أعرض منتجاتي في السوق؟</summary><p>منتجات الأعضاء بتظهر في السوق الإلكتروني حسب حد باقتك، وطلبات الأسعار عليها بتتبعت تلقائياً للمصانع المسجّلة. إضافة المنتجات وتعديلها بنفسك من حسابك بتتفعّل في المرحلة الجاية من المنصة.</p><a class="fgo" href="market.html">🛒 السوق الإلكتروني ←</a></details>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:20px">
      <form class="card2" id="msgF" novalidate><h2>✉️ أرسل استفسارك أو طلبك</h2><p class="muted">رسالتك بتتسجّل برقم متابعة ويوصلك إيصال بيه على بريدك. لو عندك سؤال عن المنصة أو الباقات، جنة (المساعدة الذكية) بترد عليك فوراً من أي صفحة.</p><div class="fgrid2"><label class="f2">الاسم الكريم / المسؤول *<input id="c-n" placeholder="م. أحمد محمد" required autocomplete="name"></label><label class="f2">البريد الإلكتروني *<input id="c-e" type="email" dir="ltr" placeholder="name@company.com" required autocomplete="email"></label><label class="f2">رقم الموبايل / الواتساب *<input id="c-p" type="tel" inputmode="tel" dir="ltr" placeholder="01X XXXX XXXX" required autocomplete="tel"></label><label class="f2">صفة المرسل<select id="c-r"><option>صاحب منشأة / مصنع مصري</option><option>مشترٍ / شركة توريدات</option><option>مستثمر محلي / أجنبي</option><option>جهة حكومية / شريك</option><option>أخرى</option></select></label><label class="f2 full">موضوع الرسالة<input id="c-s" placeholder="مثلاً: توثيق ملف المصنع"></label><label class="f2 full">تفاصيل الرسالة *<textarea id="c-m" required placeholder="اكتب رسالتك هنا…"></textarea></label></div><div id="c-cons"></div><button class="btn btn-green" type="submit" style="align-self:flex-start">إرسال الرسالة الآن</button></form>
      <div id="msgR" hidden></div>
      <form class="card2" id="rfq-form" novalidate><h2>📝 أرسل طلب عرض سعر (RFQ)</h2><p class="muted">المنصة بتطابق طلبك تلقائياً (القطاع والمنتج والمحافظة والسوق) مع المصانع المسجّلة على المنصة وبتبعته لحد 10 منهم بالإيميل (وعلى الواتساب للي مفعّله)، وبتقولك العدد الحقيقي. ردودهم وعروض أسعارهم بتوصلك تلقائياً على بريدك، وأرقام المصانع الشخصية مش بتظهر.</p><div class="mgq-to" id="r-to" hidden></div><div class="fgrid2"><label class="f2 full">المنتج المطلوب *<input id="r-p" placeholder="مثلاً: زجاج شفاف 6 مم" required></label><label class="f2">الكمية *<input id="r-q" placeholder="مثلاً: 1,200 م²" required></label><label class="f2">القطاع<select id="r-s"><option>الزجاج</option><option>مواد البناء</option><option>الصناعات الغذائية</option><option>البلاستيك والتغليف</option><option>الكهرباء والكابلات</option><option>المعادن والألمنيوم</option><option>البتروكيماويات والكيماويات</option><option>الأدوية والمستلزمات الطبية</option><option>الأثاث والأخشاب</option><option>الغزل والنسيج</option><option>الورق والتغليف</option><option>أخرى</option><option value="" selected>اختر القطاع</option></select></label><label class="f2">محافظة التسليم<select id="r-g"></select></label><label class="f2">مدينة / منطقة التسليم<input id="r-c" placeholder="مثلاً: العاشر من رمضان"></label><label class="f2">سوق التسليم<select id="r-m"><option value="local">مصر</option><option value="gulf">الخليج والدول العربية</option><option value="africa">أفريقيا</option><option value="asia">آسيا</option><option value="europe">أوروبا</option></select></label><label class="f2" id="r-ccw" hidden>دولة التسليم *<select id="r-cc"><option value="">اختار الدولة</option><option value="SA">السعودية</option><option value="AE">الإمارات</option><option value="KW">الكويت</option><option value="QA">قطر</option><option value="BH">البحرين</option><option value="OM">عُمان</option><option value="ARAB">دولة عربية تانية (العراق، الأردن، لبنان…)</option></select></label><label class="f2">آخر موعد للعروض<select id="r-d"><option>خلال أسبوع</option><option>خلال أسبوعين</option><option>خلال شهر</option></select></label><label class="f2 full">المواصفات<textarea id="r-x" placeholder="المواصفات الفنية وشروط التسليم والدفع…"></textarea></label><label class="f2">الاسم *<input id="r-n" autocomplete="name" required></label><label class="f2">الشركة<input id="r-co" autocomplete="organization"></label><label class="f2">البريد الإلكتروني *<input id="r-e" type="email" dir="ltr" autocomplete="email" required></label><label class="f2">الموبايل (لتتبّع الطلب) *<input id="r-ph" type="tel" dir="ltr" inputmode="tel" placeholder="01X XXXX XXXX" autocomplete="tel" required></label></div><div id="r-cons"></div><button class="btn btn-gold" type="submit" style="align-self:flex-start">إرسال طلب عرض السعر</button></form>
      <div id="rfqR" hidden></div>
      <div class="card2" id="meet" style="scroll-margin-top:90px"><h2>📅 اجتماع مع جنة</h2><p class="muted">جنة بتشرحلك المنصة والباقات وتساعدك في طلبك في اجتماع فيديو مباشر أو في ميعاد تختاره، ويوصلك ملخص الاجتماع على بريدك.</p><div data-mig-off="janna_live" hidden></div><button class="btn btn-green" type="button" id="meetB" style="align-self:flex-start">ابدأ اجتماع مع جنة</button></div>
    </div>
  </div>
</main>
''', '''
document.addEventListener("click", function (e) { var c = e.target.closest("[data-copy]"); if (!c) return; var v = c.dataset.copy; try { navigator.clipboard.writeText(v).then(function () { toast("تم النسخ: " + v); }, function () { toast(v); }); } catch (x) { toast(v); } });
/* the mobile's tel: link follows the number shown (the Control Center can change it: data/settings-live.js rewrites the text, and the
   hotline / e-mail links themselves) */
function telOf(t) { var d = String(t || "").replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }).replace(/[^\\d+]/g, ""); if (/^00/.test(d)) d = "+" + d.slice(2); else if (/^0\\d{8,10}$/.test(d)) d = "+20" + d.slice(1); else if (/^20\\d{9,10}$/.test(d)) d = "+" + d; return /^\\+?\\d{6,15}$/.test(d) ? "tel:" + d : ""; }
function telSync() { [].forEach.call(document.querySelectorAll("a[data-tel-text]"), function (a) { var b = a.querySelector("b"), u = b ? telOf(b.textContent) : ""; if (u && a.getAttribute("href") !== u) a.setAttribute("href", u); }); }
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a[data-tel-text]")) telSync(); }, true);
window.addEventListener("load", telSync);
/* required fields + a simple Egyptian phone check (mobile 01x / landline, optional +20), with an inline error */
function ferr(f, el, m) { var p = f.querySelector(".ferr"); if (!p) { p = document.createElement("p"); p.className = "ferr"; p.setAttribute("role", "alert"); p.style.cssText = "color:#B42318;font-weight:700;margin:0"; f.querySelector('button[type="submit"]').insertAdjacentElement("beforebegin", p); } p.textContent = m; p.hidden = !m; [].forEach.call(f.querySelectorAll("[aria-invalid]"), function (x) { x.removeAttribute("aria-invalid"); }); if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); } return !m; }
function fok(f, req, ph) {
  var EN = window.MIGLANG === "en", miss = req.map(function (id) { return $(id); }).filter(function (el) { return !el.value.trim(); })[0];
  if (miss) return ferr(f, miss, EN ? "Please fill in all required fields (*)." : "من فضلك أكمل كل الحقول المطلوبة (*).");
  if (ph) { var d = $(ph).value.replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }).replace(/[\\s\\-().]/g, ""); if (!/^(?:(?:\\+|00)20|0)(?:1[0125]\\d{8}|[2-9]\\d{7,8})$/.test(d)) return ferr(f, $(ph), EN ? "Enter a valid Egyptian phone number, e.g. 01012345678 or +20 10 1234 5678." : "اكتب رقم هاتف مصرياً صحيحاً، مثل 01012345678 أو ‎+20 10 1234 5678."); }
  return ferr(f, null, "");
}
var EN = window.MIGLANG === "en", INQ = function () { return window.MIGINQ; };
function noLib(box) { box.innerHTML = '<div class="okbox2" style="background:#FEF3F2;color:#7A271A">' + (EN ? "⚠️ The sending service did not load, so nothing was sent. Please reload the page." : "⚠️ خدمة الإرسال ماتحمّلتش، فمفيش حاجة اتبعتت. حدّث الصفحة وجرّب تاني.") + "</div>"; box.hidden = false; }
/* the RFQ addressed to one factory (company.html / factory.html / winner.html / Janna): sessionStorage "mig-rfq-to" */
var TO = INQ() ? INQ().getTarget() : null;
function drawTo() { var b = $("#r-to"); if (!TO) { b.hidden = true; b.innerHTML = ""; return; } b.hidden = false; b.innerHTML = '<span>🎯 ' + (EN ? "Addressed to: " : "الطلب موجّه إلى: ") + '<bdi>' + String(TO.name).replace(/[<>&]/g, "") + '</bdi></span><button type="button" id="r-toX">' + (EN ? "send to all matching factories instead" : "ابعته لكل المصانع المطابقة بدل كده") + '</button><small class="muted" style="flex-basis:100%;font-weight:600">' + (EN ? "If this factory is a registered member it receives the request first; matching registered factories also receive it, and you are told the true number." : "لو المنشأة دي عضو مسجّل على المنصة بيوصلها الطلب أولاً، وبيوصل كمان للمصانع المسجّلة المطابقة، وبتعرف العدد الحقيقي.") + "</small>"; }
drawTo();
document.addEventListener("click", function (e) { if (e.target.id === "r-toX") { TO = null; if (INQ()) INQ().clearTarget(); drawTo(); } });
if (window.MIGREG && MIGREG.opts) $("#r-g").innerHTML = MIGREG.opts(""); else $("#r-g").innerHTML = '<option value="">—</option>';
/* «دولة التسليم» shows (and is required) only for the Gulf market */
function ccShow() { var on = $("#r-m").value === "gulf"; $("#r-ccw").hidden = !on; $("#r-cc").required = on; }
$("#r-m").addEventListener("change", ccShow); ccShow();
if (INQ()) { $("#c-cons").innerHTML = INQ().consentHTML("c", "contact"); $("#r-cons").innerHTML = INQ().consentHTML("r", "rfq"); INQ().prefill({ name: "#c-n", email: "#c-e", phone: "#c-p" }); INQ().prefill({ name: "#r-n", email: "#r-e", phone: "#r-ph", company: "#r-co" }); }
window.addEventListener("mig:me", function () { if (INQ()) { INQ().prefill({ name: "#c-n", email: "#c-e", phone: "#c-p" }); INQ().prefill({ name: "#r-n", email: "#r-e", phone: "#r-ph", company: "#r-co" }); } });
$("#msgF").addEventListener("submit", function (e) {
  e.preventDefault(); if (!fok(this, ["#c-n", "#c-e", "#c-p", "#c-m"], "#c-p")) return;
  var I = INQ(); if (!I) { noLib($("#msgR")); return; }
  if (!I.EMRE.test($("#c-e").value.trim())) { ferr(this, $("#c-e"), EN ? "Please enter a valid e-mail." : "اكتب بريد إلكتروني صحيح."); return; }
  var subj = $("#c-s").value.trim();
  I.send({ kind: "contact", target_type: TO && TO.type ? TO.type : "", target_id: TO ? TO.id : "", target_name: TO ? TO.name : "", name: $("#c-n").value.trim(), email: $("#c-e").value.trim(), phone: $("#c-p").value.trim(), consent_wa: I.waChecked("c"), message: (subj ? subj + "\\n\\n" : "") + $("#c-m").value.trim(), payload: { role: $("#c-r").value, subject: subj } }, { box: $("#msgR"), form: this, btn: this.querySelector("[type=submit]") }).catch(function () {});
});
$("#rfq-form").addEventListener("submit", function (e) {
  e.preventDefault(); if (!fok(this, ["#r-p", "#r-q"].concat($("#r-m").value === "gulf" ? ["#r-cc"] : [], ["#r-n", "#r-e", "#r-ph"]), "#r-ph")) return;
  var I = INQ(); if (!I) { noLib($("#rfqR")); return; }
  if (!I.EMRE.test($("#r-e").value.trim())) { ferr(this, $("#r-e"), EN ? "Please enter a valid e-mail." : "اكتب بريد إلكتروني صحيح."); return; }
  var g = $("#r-g").value, gn = g && window.MIGREG ? MIGREG.name(g) : "";
  I.send({ kind: "rfq", target_type: TO && TO.type ? TO.type : "", target_id: TO ? TO.id : "", target_name: TO ? TO.name : "", name: $("#r-n").value.trim(), company: $("#r-co").value.trim(), email: $("#r-e").value.trim(), phone: $("#r-ph").value.trim(), consent_wa: I.waChecked("r"),
    message: $("#r-x").value.trim(), payload: { product: $("#r-p").value.trim(), qty: $("#r-q").value.trim(), sector: $("#r-s").value, governorate: g, governorate_name: gn, city: $("#r-c").value.trim(), market: $("#r-m").value, country: $("#r-m").value === "gulf" ? $("#r-cc").value : "", deadline: $("#r-d").value } },
    { box: $("#rfqR"), form: this, btn: this.querySelector("[type=submit]"), onOk: function () { if (I) I.clearTarget(); } }).catch(function () {});
});
$("#meetB").onclick = function () { if (window.JANNA_LIVE && JANNA_LIVE.open) JANNA_LIVE.open({ intent: "meeting" }); else toast(EN ? "Janna's live meeting is not available on this page right now." : "اجتماع جنة المباشر مش متاح في الصفحة دي دلوقتي."); };
try { var rq = sessionStorage.getItem("mig-rfq-qty"); if (rq) { sessionStorage.removeItem("mig-rfq-qty"); $("#r-q").value = rq; } } catch (x) {}   /* PPROF hook: quantity + unit picked on a product page (seo_pprof.part.py) */
try { var ri = sessionStorage.getItem("mig-rfq-item"); if (ri) { sessionStorage.removeItem("mig-rfq-item"); $("#r-p").value = ri; if (location.hash !== "#rfq-form") setTimeout(function () { $("#rfq-form").scrollIntoView({ block: "start" }); }, 200); } } catch (x) {}
if (TO && location.hash !== "#rfq-form") setTimeout(function () { $("#rfq-form").scrollIntoView({ block: "start" }); }, 200);
if (location.hash === "#meet") setTimeout(function () { $("#meet").scrollIntoView({ block: "start" }); }, 200);
if (location.hash === "#rfq-form") setTimeout(function () { $("#rfq-form").scrollIntoView({ block: "start" }); }, 200);
''')
en_add([("الحسيني جروب وشركاءه", "ElHouseni Group & Partners"), ("استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير", "Receiving requests, partner registration, customer service and development")])   # contact: owner / operator (owner approval 2026-11-19)

en_add([("نسخ رقم الموبايل", "Copy the mobile number"), ("نسخ البريد الإلكتروني", "Copy the e-mail address"), ("نسخ رقم الخط الساخن", "Copy the hotline number"),
        ("تم النسخ", "Copied")])

# ---------------- TRACK REQUEST ----------------
# track.html — real tracking only: GET /api/inquiries/:ref?last4=<last 4 digits of the phone> (data/mig-api.js MIGAPI.track) returns the
# buyer-visible events; the timeline is drawn from them and nothing else (no sample request, no invented counts). A signed-in owner can
# open their own request without last4. track.html#<ref> pre-fills the number. Offline (no API) → an honest message.
PAGES['track'] = ('تتبع حالة الطلب – صنع في مصر', 'rfq', COMMON_CSS + '''
.trkf { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 8px; align-items: end; }
.trkf label { display: flex; flex-direction: column; gap: 4px; font-weight: 700; font-size: .85rem; }
.trkf input { font: inherit; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--surface); color: var(--fg); min-width: 0; }
.trkh { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; }
.trkr { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: .84rem; }
.trkr button { border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 2px 10px; font: inherit; font-size: .8rem; cursor: pointer; }
@media (max-width: 640px) { .trkf { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <form class="card2 trkf" id="tf" novalidate>
    <label>رقم الطلب<input type="text" id="tn" dir="ltr" autocomplete="off" spellcheck="false" placeholder="MIG-26-XXXXXX" aria-describedby="tnh"></label>
    <label>آخر 4 أرقام من موبايلك<input id="tp" type="text" inputmode="numeric" dir="ltr" maxlength="4" autocomplete="off" placeholder="1234"></label>
    <button class="btn btn-green" type="submit">تتبع الطلب</button>
    <small class="muted" id="tnh" style="grid-column:1/-1">رقم الطلب موجود في إيميل الاستلام اللي وصلك. لو داخل بحسابك، طلباتك كلها في <a href="dashboard.html#inquiries">لوحتي ← طلباتي</a>.</small>
    <div class="trkr" id="trr" hidden style="grid-column:1/-1"></div>
  </form>
  <div id="tr" aria-live="polite"></div>
</main>
<script src="data/mig-api.js"></script>
''', '''
(function () {
  var EN = window.MIGLANG === "en", T = function (a, e) { return EN ? e : a; }, A = window.MIGAPI, U = A && A.ui, esc = U ? U.esc : function (x) { return String(x || ""); };
  var out = $("#tr"), fm = $("#tf");
  function norm(s) { return String(s || "").replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }); }
  /* no registered match → the Worker notifies the admins, searches for candidate factories and sets the buyer-visible status
     "in_progress" («جاري معالجة طلبك»); a reply sent from the admin console («إحنا اللي هنرد») is a buyer-visible event with actor
     "team". Both are labelled here as well, so the page is right whatever labels data/mig-api.js carries. */
  var IP = T("جاري معالجة طلبك", "We're working on your request");
  function isTeam(e) { return String(e.actor || "").toLowerCase() === "team" || /^(team|team_reply|team_message|admin_reply)$/.test(String(e.type || "").toLowerCase()); }
  /* status chip: «جاري معالجة طلبك» for in_progress; the server's own label (status_label) for a status this page's labels do not know */
  function chip(s, lbl) { s = String(s || "").toLowerCase(); if (s === "in_progress") return '<span class="mig-st s-w">' + esc(IP) + "</span>"; var h = U.statusChip(s); return lbl && /حالة أخرى|Other status/.test(h) ? '<span class="mig-st">' + esc(lbl) + "</span>" : h; }
  /* the request number the Worker issues: MIG-<yy>-<6 letters/digits> (typed with spaces, without dashes or in lower case is fine) */
  function refOf(s) { var m = /^MIG-?(\\d{2})-?([A-Z0-9]{6})$/.exec(norm(s).toUpperCase().replace(/[\\s\\u200f\\u200e]+/g, "")); return m ? "MIG-" + m[1] + "-" + m[2] : ""; }
  var LAST = { ref: "", l4: "" };
  function li(ic, cls, title, e) { return '<li class="' + cls + '"><span class="d" aria-hidden="true">' + ic + "</span><div><b>" + esc(title) + "</b><small>" + esc(U.date(e.created_at, true)) + "</small>" + (e.body ? '<p dir="auto">' + esc(e.body) + "</p>" : "") + "</div></li>"; }
  function tl(events) {
    events = (events || []).slice().sort(function (a, b) { return String(a.created_at || "").localeCompare(String(b.created_at || "")); });
    if (!events.length) return U.timeline([]);
    return '<ol class="mig-tl">' + events.map(function (e) {
      e = e || {};
      if (isTeam(e)) return li("💬", "q", T("رد فريق المنصة", "Reply from the platform team"), e);
      if (String(e.type || "").toLowerCase() === "in_progress") return li("⏳", "w", IP, e);
      return U.timeline([e]).replace(/^\\s*<ol[^>]*>/, "").replace(/<\\/ol>\\s*$/, "");
    }).join("") + "</ol>";
  }
  function show(j) {
    var st = String(j.status || "").toLowerCase(), team = (j.events || []).some(function (e) { return e && isTeam(e); });
    var note = st === "in_progress"
      ? T("لحد دلوقتي مفيش مصنع مسجّل على المنصة يطابق طلبك، فإدارة المنصة اتبلّغت تلقائياً وبتدوّر على مصانع تقدر تنفّذه. أي رد من فريق المنصة أو من مصنع بيظهر هنا تلقائي، والطلب بيفضل مفتوح وبيتبعت تلقائي لأي مصنع مطابق ينضم.", "No registered factory on the platform matches your request yet, so the platform's administrators were notified automatically and are looking for factories that can fulfil it. Any reply from the platform team or from a factory appears here automatically, and the request stays open and is sent automatically to any matching factory that joins.")
      : T("الحالة دي جاية من المنصة مباشرة وبتتحدّث تلقائي: الطلب بيتبعت للمصانع المسجّلة المطابقة، والردود وعروض الأسعار بتوصلك على إيميلك وهنا. لو مفيش مصنع مطابق دلوقتي، الطلب بيفضل مفتوح وبيتبعت تلقائي لأي مصنع مطابق ينضم بعد كده.", "This status comes straight from the platform and updates automatically: the request is sent to matching registered factories, and replies and quotes reach you by e-mail and here. If no factory matches yet, the request stays open and is sent automatically to any matching factory that joins later.");
    /* opened with the last 4 digits only (proof "last4"): the Worker hides quotes, replies, messages and the chosen factory (redacted) */
    var red = !!j.redacted;
    out.innerHTML = '<div class="card2 cin"><div class="trkh"><h2>' + T("الطلب ", "Request ") + '<span dir="ltr" class="num">' + esc(j.ref) + "</span></h2>" + chip(j.status, j.status_label) + '</div><p class="muted">' + esc(U.kindLabel(j.kind)) + (j.target_name && !red ? " · " + esc(j.target_name) : "") + (j.created_at ? " · " + esc(U.date(j.created_at, true)) : "") + "</p>"
      + (red ? '<div class="note2" role="status" id="trRed">🔒 ' + T("علشان تشوف عروض الأسعار والردود افتح لينك المتابعة اللي وصلك على الإيميل أو ادخل بحسابك.", "To see the quotes and replies, open the tracking link you received by e-mail or sign in.") + (A && A.login && !A.token() ? ' <button type="button" class="btn btn-line btn-sm" id="trIn">' + T("ادخل بحسابك", "Sign in") + "</button>" : "") + "</div>" : "")
      + (team && !red ? '<p class="note2" role="status">💬 ' + T("فريق المنصة رد على طلبك — الرد في الخط الزمني تحت.", "The platform team replied to your request — the reply is in the timeline below.") + "</p>" : "")
      + tl(j.events || []) + '<p class="note2">' + note + "</p></div>";
    var bi = $("#trIn"); if (bi) bi.addEventListener("click", function () { try { A.login(); } catch (x) {} });
  }
  function go(ref, l4, quiet) {
    if (!A) { out.innerHTML = '<div class="mig-off">' + T("الخدمة دي هتشتغل أول ما المنصة تتربط بالسيرفر.", "This service will work as soon as the platform is connected to its server.") + "</div>"; return; }
    var typed = norm(ref).trim(); ref = refOf(typed); l4 = norm(l4).replace(/\\D/g, "");
    if (!typed) { if (!quiet) { out.innerHTML = '<p class="ferr" role="alert">' + T("اكتب رقم الطلب.", "Enter the request number.") + "</p>"; $("#tn").focus(); } return; }
    if (!ref) { if (!quiet) { out.innerHTML = '<p class="ferr" role="alert">' + T("رقم الطلب بيبدأ بـ MIG- وبعده رقمين و6 حروف أو أرقام، زي MIG-26-7KQ2MX. هتلاقيه في إيميل الاستلام.", "The request number starts with MIG- followed by 2 digits and 6 letters or digits, e.g. MIG-26-7KQ2MX. It is in your receipt e-mail.") + "</p>"; $("#tn").focus(); } return; }
    $("#tn").value = ref; LAST = { ref: ref, l4: l4 };
    if (!A.token() && l4.length !== 4) { if (!quiet) { out.innerHTML = '<p class="ferr" role="alert">' + T("اكتب آخر 4 أرقام من الموبايل اللي سجّلته في الطلب.", "Enter the last 4 digits of the mobile number you gave in the request.") + "</p>"; $("#tp").focus(); } return; }
    out.innerHTML = '<div class="card2"><p class="muted">⏳ ' + T("جارٍ البحث…", "Searching…") + "</p></div>";
    try { history.replaceState(null, "", "#" + encodeURIComponent(ref)); } catch (e) {}
    A.track(ref, l4).then(function (j) { if (!j || !j.ref) throw { code: "not_found", status: 404 }; show(j); }, function (e) { throw e; }).catch(function (e) {
      if (e && e.code === "offline") { out.innerHTML = '<div class="mig-off" role="status">' + esc(U.offline()) + "</div>"; return; }
      if (e && (e.status === 404 || e.status === 403 || e.code === "not_found")) { out.innerHTML = '<div class="card2"><p class="ferr" role="alert" style="color:#B42318;font-weight:700">' + T("مالقيناش طلب بالرقم ده وآخر 4 أرقام دول. اتأكد من الرقم في إيميل الاستلام.", "No request matches this number and these last 4 digits. Check the number in your receipt e-mail.") + "</p></div>"; return; }
      out.innerHTML = '<div class="card2"><p class="ferr" role="alert">' + esc(U.errText(e)) + "</p></div>";
    });
  }
  fm.addEventListener("submit", function (e) { e.preventDefault(); go($("#tn").value, $("#tp").value); });
  /* signed in from the hint above: the same request again, now as its owner (full details) */
  window.addEventListener("mig:login", function () { if (LAST.ref && $("#trRed")) go(LAST.ref, "", true); });
  /* requests this browser received a real ref for (stored by MIGAPI.inquiry after the server answered) */
  try { var mine = JSON.parse(localStorage.getItem("mig-my-refs") || "[]"); if (mine.length) { var r = $("#trr"); r.hidden = false; r.innerHTML = T("طلباتك من الجهاز ده: ", "Your requests from this device: ") + mine.slice(0, 6).map(function (m) { return '<button type="button" dir="ltr" data-r="' + esc(m.ref) + '">' + esc(m.ref) + "</button>"; }).join(""); r.addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b) return; $("#tn").value = b.getAttribute("data-r"); go($("#tn").value, $("#tp").value, true); if (!A.token()) $("#tp").focus(); }); } } catch (e) {}
  var h = decodeURIComponent((location.hash || "").slice(1));
  /* the receipt e-mail links to track.html#<ref>~<signed token> (GET /api/inquiries/:ref?t=…): opens without the last 4 digits */
  var ht = /^([A-Za-z0-9-]{4,40})~([A-Za-z0-9_-]{8,80})$/.exec(h);
  if (ht && A) { $("#tn").value = ht[1].toUpperCase(); out.innerHTML = '<div class="card2"><p class="muted">⏳ ' + T("جارٍ البحث…", "Searching…") + "</p></div>"; A.track(ht[1].toUpperCase(), "", ht[2]).then(function (j) { if (!j || !j.ref) throw { code: "not_found", status: 404 }; show(j); }, function (e) { out.innerHTML = e && e.code === "offline" ? '<div class="mig-off" role="status">' + esc(U.offline()) + "</div>" : '<div class="card2"><p class="ferr" role="alert">' + esc(U.errText(e)) + "</p></div>"; }); }
  else if (h && refOf(h)) { $("#tn").value = refOf(h); if (A && A.token()) go(h, "", true); }
})();
''')

en_add([("رقم الطلب", "Request number"), ("آخر 4 أرقام من موبايلك", "Last 4 digits of your mobile"), ("تتبع الطلب", "Track the request"),
 ("رقم الطلب موجود في إيميل الاستلام اللي وصلك. لو داخل بحسابك، طلباتك كلها في", "The request number is in the receipt e-mail you received. If you are signed in, all your requests are in"),
 ("لوحتي ← طلباتي", "My dashboard → My requests"), ("ولائحته التنفيذية والقوانين ذات العلاقة في جمهورية مصر العربية. والمسؤول عن معالجة البيانات هو مشغّل المنصة: الجمعية المصرية للتنمية الصناعية (مشهرة برقم 6189 لسنة 2017) — السادس من أكتوبر، الجيزة، مصر.", "and its executive regulations and related laws of the Arab Republic of Egypt. The data controller is the platform operator: the Egypt Industrial Development Association (registered under No. 6189 of 2017) — 6th of October City, Giza, Egypt."), ("يُغلق بكرة", "Closes tomorrow"), ("يُغلق بعد يومين", "Closes in 2 days"), ("يُغلق بعد 5 أيام", "Closes in 5 days"), ("يُغلق بعد 15 يوماً", "Closes in 15 days"), ("منشأة صناعية وتجارية في الدليل", "industrial & trading companies in the directory"), ("✓ موثّق من فريق المنصة", "✓ Verified by the platform team"), ("موثّق من فريق المنصة", "Verified by the platform team"), ("✓ موثّق من فريق المنصة فقط", "✓ Verified by the platform team only"), ("موثّق من فريق المنصة فقط", "Verified by the platform team only"), ("من مصادر عامة", "From public sources"), ("في دليل المنصة", "In the platform directory"), ("اجتماعك مع جنة", "Your meeting with Janna"), ("جميع الفروع / المتجر الإلكتروني", "All branches / online store"), ("ملاك المشاريع", "Project owners"),
 ("🔒 بيانات التواصل الشخصية مش بتظهر على المنصة؛ سجّل اهتمامك وهيوصلك أي تحديث تلقائياً.", "🔒 Personal contact details are not shown on the platform; register your interest and you will get every update automatically."), ("منشأة في الدليل", "companies in the directory"), ("محافظة مصرية بمناطقها الصناعية والحرة", "Egyptian governorates with their industrial & free zones"), ("منتجاً من أعضاء المنصة", "products from platform members"), ("منتجات من أعضاء المنصة", "products from platform members"), ("منتجان من أعضاء المنصة", "products from platform members"), ("منتج من أعضاء المنصة", "product from platform members"), ("طلبات عروض أسعار منشورة", "published RFQs"), ("طلبا عرض سعر منشوران", "published RFQs"), ("تتبع حالة الطلب", "Track a request"), ("طلب عرض سعر منشور", "published requests for quotation"), ("مدرجة في دليل منصة صنع في مصر.", "Listed in the Made in Egypt Gate directory."), ("في دليل المنصة", "In the platform directory")])

# ---------------- INTERNATIONAL ----------------
PAGES['intl'] = ('المنصات الدولية – صنع في مصر', 'intl', COMMON_CSS + '''
.igrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 1100px) { .igrid { grid-template-columns: repeat(3, 1fr); } }
.ic2 { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 10px; color: var(--fg); overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
.ic2:hover { transform: translateY(-5px); box-shadow: 0 18px 34px -20px rgba(0,0,0,.4); }
.ic2 .flag { display: block; width: 64px; height: 43px; border-radius: 5px; box-shadow: 0 4px 12px -4px rgba(0,0,0,.35); overflow: hidden; transition: transform .3s ease; } .ic2 .flag svg { width: 100%; height: 100%; display: block; } .ic2:hover .flag { transform: rotate(-4deg) scale(1.08); }
.ic2 h3 { font-size: 1.08rem; font-weight: 800; }
.ic2 .tags { display: flex; flex-wrap: wrap; gap: 5px; }
.plogo2 { background: #fff; border-radius: 10px; padding: 4px 8px; height: 50px; display: flex; align-items: center; border: 1px solid var(--line); } .plogo2 img { max-height: 42px; max-width: 150px; }
.ic2 .go { margin-top: auto; font-weight: 700; color: var(--green); }
.ic2.home { border-color: var(--gold); background: var(--gold-soft); }
.ic2 .ist { align-self: flex-start; font-size: .78rem; font-weight: 800; border-radius: 99px; padding: 3px 10px; line-height: 1.5; }
.ic2 .ist.y { background: var(--green-soft); color: var(--green); } .ic2 .ist.n { background: var(--sunken); color: var(--muted); }
.ic2::before { content: ""; position: absolute; top: 0; inset-inline: 0; height: 4px; background: linear-gradient(90deg, var(--gold), var(--green)); }
@media (max-width: 900px) { .igrid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .igrid { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="igrid" id="ig"></div>
  <p class="note2" id="igNote">🌍 أسواق باقتك هي اللي بتحدد مصنعك بيظهر على أنهي منصة من منصات «صنع في». كل منصة ليها حسابها ودخولها.</p>
  <div class="card2"><h2>🤝 التكامل الصناعي والتصدير البيني</h2><p>تهدف منصة «صنع في مصر» إلى الربط والتكامل المباشر مع المنصات الصناعية العربية والأفريقية والدولية لدعم نفاذ المنتجات المصرية إلى الأسواق الخارجية، وتعزيز الشراكات بين المصانع والموردين، وتكامل سلاسل التوريد.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-green" href="export-market.html#gulf">الأسواق الخمسة</a><a class="btn btn-gold" href="register.html#plans">سجّل مصنعك</a><a class="btn btn-line" href="contact.html">شراكة مع المنصة</a></div></div>
</main>
''', '''

var FLAG = {
 gcc: '<svg viewBox="0 0 60 40"><rect width="60" height="40" rx="4" fill="#8E0B20"/><circle cx="30" cy="20" r="12" fill="none" stroke="#C09300" stroke-width="2.5"/><path d="M18 20h24M30 8c5 4 5 20 0 24M30 8c-5 4-5 20 0 24" stroke="#C09300" stroke-width="1.6" fill="none"/></svg>',
 sa: '<img src="img/flag-sa.svg" alt="علم المملكة العربية السعودية" style="display:block;width:100%;height:100%;object-fit:cover;border-radius:4px">',
 ae: '<svg viewBox="0 0 60 40"><clipPath id="cae"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#cae)"><rect width="60" height="13.4" fill="#00732F"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.6" width="60" height="13.4" fill="#000"/><rect width="16" height="40" fill="#FF0000"/></g></svg>',
 qa: '<svg viewBox="0 0 60 40"><clipPath id="cqa"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#cqa)"><rect width="60" height="40" fill="#8A1538"/><path d="M0 0h18l6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2 6 2.2-6 2.2L18 40H0z" fill="#fff"/></g></svg>',
 kw: '<svg viewBox="0 0 60 40"><clipPath id="ckw"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#ckw)"><rect width="60" height="13.4" fill="#007A3D"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.6" width="60" height="13.4" fill="#CE1126"/><path d="M0 0l15 13.3v13.4L0 40z" fill="#000"/></g></svg>',
 bh: '<svg viewBox="0 0 60 40"><clipPath id="cbh"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#cbh)"><rect width="60" height="40" fill="#CE1126"/><path d="M0 0h16l6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4H0z" fill="#fff"/></g></svg>',
 om: '<svg viewBox="0 0 60 40"><clipPath id="com"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#com)"><rect width="60" height="40" fill="#DB161B"/><rect x="16" width="44" height="13.4" fill="#fff"/><rect x="16" y="26.6" width="44" height="13.4" fill="#008000"/><path d="M5 5l6 6M11 5l-6 6M8 4v9" stroke="#fff" stroke-width="1.5"/></g></svg>',
 af: '<svg viewBox="0 0 60 40"><clipPath id="caf"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#caf)"><rect width="60" height="40" fill="#2E7D32"/><circle cx="42.60" cy="20.00" r=".75" fill="#E8C33A"/><circle cx="42.32" cy="22.62" r=".75" fill="#E8C33A"/><circle cx="41.51" cy="25.12" r=".75" fill="#E8C33A"/><circle cx="40.19" cy="27.41" r=".75" fill="#E8C33A"/><circle cx="38.43" cy="29.36" r=".75" fill="#E8C33A"/><circle cx="36.30" cy="30.91" r=".75" fill="#E8C33A"/><circle cx="33.89" cy="31.98" r=".75" fill="#E8C33A"/><circle cx="31.32" cy="32.53" r=".75" fill="#E8C33A"/><circle cx="28.68" cy="32.53" r=".75" fill="#E8C33A"/><circle cx="26.11" cy="31.98" r=".75" fill="#E8C33A"/><circle cx="23.70" cy="30.91" r=".75" fill="#E8C33A"/><circle cx="21.57" cy="29.36" r=".75" fill="#E8C33A"/><circle cx="19.81" cy="27.41" r=".75" fill="#E8C33A"/><circle cx="18.49" cy="25.12" r=".75" fill="#E8C33A"/><circle cx="17.68" cy="22.62" r=".75" fill="#E8C33A"/><circle cx="17.40" cy="20.00" r=".75" fill="#E8C33A"/><circle cx="17.68" cy="17.38" r=".75" fill="#E8C33A"/><circle cx="18.49" cy="14.88" r=".75" fill="#E8C33A"/><circle cx="19.81" cy="12.59" r=".75" fill="#E8C33A"/><circle cx="21.57" cy="10.64" r=".75" fill="#E8C33A"/><circle cx="23.70" cy="9.09" r=".75" fill="#E8C33A"/><circle cx="26.11" cy="8.02" r=".75" fill="#E8C33A"/><circle cx="28.68" cy="7.47" r=".75" fill="#E8C33A"/><circle cx="31.32" cy="7.47" r=".75" fill="#E8C33A"/><circle cx="33.89" cy="8.02" r=".75" fill="#E8C33A"/><circle cx="36.30" cy="9.09" r=".75" fill="#E8C33A"/><circle cx="38.43" cy="10.64" r=".75" fill="#E8C33A"/><circle cx="40.19" cy="12.59" r=".75" fill="#E8C33A"/><circle cx="41.51" cy="14.88" r=".75" fill="#E8C33A"/><circle cx="42.32" cy="17.38" r=".75" fill="#E8C33A"/><circle cx="30" cy="20" r="10.6" fill="#fff"/><path d="M23.78 16.38 L24.53 15.15 L25.11 14.73 L25.81 13.67 L28.74 13.39 L28.93 14.18 L30.58 14.64 L31.49 14.44 L32.83 14.49 L33.14 15.28 L33.75 16.20 L34.06 17.37 L34.85 18.03 L36.30 18.07 L35.53 19.50 L34.24 20.69 L34.34 22.15 L34.35 23.07 L33.42 24.63 L32.89 25.00 L32.41 25.91 L31.60 26.46 L30.58 26.61 L30.27 26.10 L29.66 25.18 L29.40 24.45 L29.07 23.35 L29.39 22.25 L29.15 21.33 L28.56 20.41 L28.65 19.50 L28.01 19.44 L27.09 19.13 L26.18 19.28 L25.54 19.42 L24.71 18.95 L24.16 18.21 L23.70 17.53 Z" fill="#2E7D32"/><ellipse cx="35.53" cy="23.71" rx=".6" ry="1.4" fill="#2E7D32"/></g></svg>',
 as: '<svg viewBox="0 0 60 40"><clipPath id="cas"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#cas)"><rect width="60" height="40" fill="#0E5E8C"/><circle cx="30" cy="20" r="12" fill="none" stroke="#fff" stroke-width="2"/><path d="M18 20h24M30 8v24M21 12c6 3 12 3 18 0M21 28c6-3 12-3 18 0" stroke="#fff" stroke-width="1.4" fill="none"/><circle cx="30" cy="20" r="3" fill="#E8711C"/></g></svg>',
 eu: '<svg viewBox="0 0 60 40"><rect width="60" height="40" rx="4" fill="#003399"/><circle cx="40.0" cy="20.0" r="1.5" fill="#FFCC00"/><circle cx="38.7" cy="25.0" r="1.5" fill="#FFCC00"/><circle cx="35.0" cy="28.7" r="1.5" fill="#FFCC00"/><circle cx="30.0" cy="30.0" r="1.5" fill="#FFCC00"/><circle cx="25.0" cy="28.7" r="1.5" fill="#FFCC00"/><circle cx="21.3" cy="25.0" r="1.5" fill="#FFCC00"/><circle cx="20.0" cy="20.0" r="1.5" fill="#FFCC00"/><circle cx="21.3" cy="15.0" r="1.5" fill="#FFCC00"/><circle cx="25.0" cy="11.3" r="1.5" fill="#FFCC00"/><circle cx="30.0" cy="10.0" r="1.5" fill="#FFCC00"/><circle cx="35.0" cy="11.3" r="1.5" fill="#FFCC00"/><circle cx="38.7" cy="15.0" r="1.5" fill="#FFCC00"/></svg>',
 eg: '<svg viewBox="0 0 60 40"><clipPath id="ceg"><rect width="60" height="40" rx="4"/></clipPath><g clip-path="url(#ceg)"><rect width="60" height="13.4" fill="#CE1126"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.6" width="60" height="13.4" fill="#000"/><path d="M30 15.5l2.5 3.5-2.5 5-2.5-5z" fill="#C09300"/></g></svg>'
};
var IP = [["eg", "منصة المنتجات الوطنية بجمهورية مصر العربية", "منصة صنع في مصر", ["صناعات غذائية", "منسوجات وملابس جاهزة", "كيماويات وأسمدة", "صناعات هندسية وكهربائية"], "/", 1, "img/logo-site.png"], ["ae", "منصة المنتجات الوطنية بدولة الإمارات العربية المتحدة", "منصة صنع في الإمارات", ["ألمنيوم ومعادن", "بتروكيماويات وبلاستيك", "صناعات دوائية وطبية", "صناعات غذائية"], "https://madeinuaegate.ae", 0, "img/pl-ae.png"], ["sa", "منصة المنتجات الوطنية بالمملكة العربية السعودية", "منصة صنع في السعودية", ["صناعات ثقيلة", "بتروكيماويات", "تعدين", "أغذية ومشروبات"], "https://madeinsaudigate.com", 0, "img/pl-sa.png"], ["gcc", "منصة المنتجات الوطنية الخليجية", "التكامل الخليجي", ["تكامل صناعي خليجي", "تبادل تجاري", "سلاسل إمداد مشتركة", "استثمارات مشتركة"], "https://madeingcc.org", 0, ""], ["qa", "منصة المنتجات الوطنية بدولة قطر", "منصة صنع في قطر", ["صناعات غاز ومسال", "أسمدة ومخصبات", "حديد وصلب", "صناعات دوائية"], "https://madeinqatar.qa", 0, ""], ["kw", "منصة المنتجات الوطنية بدولة الكويت", "منصة صنع في الكويت", ["صناعات نفطية", "مواد بناء", "بلاستيك وبوليمرات", "صناعات كهربائية"], "https://madeinkuwaitgate.com", 0, ""], ["bh", "منصة المنتجات الوطنية بمملكة البحرين", "منصة صنع في البحرين", ["ألمنيوم", "صناعات تحويلية", "بتروكيماويات", "خدمات لوجستية"], "https://madeinbahraingate.com", 0, ""], ["om", "منصة المنتجات الوطنية بسلطنة عُمان", "منصة صنع في عُمان", ["صناعات معدنية", "منتجات كيميائية", "صناعات بحرية", "خامات طبيعية"], "https://madeinomangate.com", 0, ""], ["af", "منصة المنتجات الوطنية في القارة الأفريقية", "منصة صنع في أفريقيا", ["مواد البناء", "الأغذية والزراعة", "التعدين", "الطاقة"], "https://www.madeinafrica.com", 0, ""], ["as", "منصة المنتجات الوطنية في القارة الآسيوية", "منصة صنع في آسيا", ["الصناعات الهندسية", "الإلكترونيات", "البتروكيماويات", "المنسوجات"], "https://www.madeinasia.com", 0, ""], ["eu", "منصة المنتجات الوطنية في القارة الأوروبية", "منصة صنع في أوروبا", ["المعدات والآلات", "الأدوية", "السيارات وقطع الغيار", "الأغذية المصنعة"], "https://madeineurope.com", 0, ""]];
/* the member's plan on each sister «صنع في» platform: his markets decide where his factory appears (owner 2026-11-18). Each platform keeps
   its own account and sign-in — no shared sign-in yet. The GCC-wide platform has no label until the owner decides (Q4). */
var ICC = { sa: "SA", ae: "AE", kw: "KW", qa: "QA", bh: "BH", om: "OM" }, IMK = { af: "africa", as: "asia", eu: "europe" };
function intlState(code) {
  var P = window.MIGPLAN, EN = window.MIGLANG === "en"; if (!P || !P.market) return null;
  var nm = function (k) { return P.name ? P.name(k) : k; };
  if (ICC[code]) {
    if (P.inScope ? P.inScope("gulf", ICC[code]) : P.market("gulf")) return [1, EN ? "✓ Included in your plan" : "✓ ضمن باقتك"];
    var g = P.gcc ? P.gcc() : null, all = P.allGulfKey ? P.allGulfKey() : "partner";
    if (g && g.pick && !g.pending) return [0, EN ? "🔒 Not one of your " + g.pick + " chosen states — included in the «" + nm(all) + "»" : "🔒 مش من الـ" + g.pick + " دول اللي اخترتها — متاحة في «" + nm(all) + "»"];
    var pk = P.needMarket ? P.needMarket("gulf") : "premium", n = P.gccPickOf ? P.gccPickOf(pk) : 0;
    return [0, n ? (EN ? "🔒 Available in the «" + nm(pk) + "» (as one of " + n + " states you choose)" : "🔒 متاح في «" + nm(pk) + "» (ضمن " + n + " دول تختارها)") : (EN ? "🔒 Available in the «" + nm(pk) + "»" : "🔒 متاح في «" + nm(pk) + "»")];
  }
  if (IMK[code]) return P.market(IMK[code]) ? [1, EN ? "✓ Included in your plan" : "✓ ضمن باقتك"] : [0, EN ? "🔒 Available in the «" + nm(P.needMarket ? P.needMarket(IMK[code]) : "strategic") + "»" : "🔒 متاح في «" + nm(P.needMarket ? P.needMarket(IMK[code]) : "strategic") + "»"];
  return null;
}
function drawIntl() {
$("#ig").innerHTML = IP.map(function (p, i) { var st = intlState(p[0]); return '<a class="ic2 cin' + (p[5] ? " home" : "") + '" style="animation-delay:' + i * 60 + 'ms" href="' + p[4] + '"><span style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span class="flag">' + FLAG[p[0]] + '</span>' + (p[6] ? '<span class="plogo2"><img src="' + p[6] + '" alt="شعار ' + p[2] + '"></span>' : '') + '</span><span class="chip chip-gold" style="align-self:flex-start">' + p[2] + '</span><h3>' + p[1] + '</h3>' + (st ? '<span class="ist ' + (st[0] ? "y" : "n") + '">' + st[1] + '</span>' : '') + '<small class="muted">⚙️ أبرز القطاعات المستهدفة:</small><div class="tags">' + p[3].map(function (t) { return '<span class="chip chip-gray">' + t + '</span>'; }).join("") + '</div><span class="go">' + (p[5] ? "أنت هنا ✓" : "زيارة المنصة الرسمية ↗") + '</span></a>'; }).join("");
}
drawIntl(); window.addEventListener("mig:plan", drawIntl);
''')

# English for the plan matrix of 2026-11-18: the RFQ form's delivery country (contact.html) and the plan chips of /intl/
en_add([("دولة التسليم", "Delivery country"), ("اختار الدولة", "Choose the country"), ("دولة عربية تانية (العراق، الأردن، لبنان…)", "Another Arab country (Iraq, Jordan, Lebanon…)"),
 ("السعودية", "Saudi Arabia"), ("الإمارات", "UAE"), ("الكويت", "Kuwait"), ("قطر", "Qatar"), ("البحرين", "Bahrain"), ("عُمان", "Oman"),
 ("أسواق باقتك هي اللي بتحدد مصنعك بيظهر على أنهي منصة من منصات «صنع في». كل منصة ليها حسابها ودخولها.", "Your plan's markets decide which «Made in» platforms your factory appears on. Each platform has its own account and sign-in.")])

# ---------------- ABOUT ----------------
PAGES['about'] = ('عن المنصة – صنع في مصر', 'home', COMMON_CSS + '''
.agrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ab { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 8px; scroll-margin-top: 90px; }
.ab .ic { width: 48px; height: 48px; border-radius: 12px; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-size: 1.4rem; }
.ab h2 { font-size: 1.1rem; font-weight: 800; }
@media (max-width: 900px) { .agrid { grid-template-columns: 1fr; } }
''', '''
%HERO%
<main class="wrap pbody2" id="top">
  <div class="agrid">
    <section class="ab cin" id="vision-mission"><span class="ic">👁️</span><h2>الرؤية والرسالة</h2><p>أن تكون المنصة المرجع الرقمي الأول لربط المصانع والموردين بالمشترين المحليين والدوليين، ودعم التحول الرقمي للقطاع الصناعي في بيئة موثوقة وشفافة، تماشياً مع «رؤية مصر 2030» والاستراتيجية الوطنية للصناعة وتعميق التصنيع المحلي.</p></section>
    <section class="ab cin" id="what-we-offer" style="animation-delay:.08s"><span class="ic">🛠️</span><h2>ماذا نقدم؟</h2><p>ملف رقمي متكامل لكل مصنع، وسوق إلكتروني للمنتجات الوطنية، ومناقصات وطلبات عروض أسعار من خمسة أسواق، ودليل للمقاولين والاستشاريين وشركات الشحن والتأمين.</p></section>
    <section class="ab cin" id="why-us" style="animation-delay:.16s"><span class="ic">⭐</span><h2>القيمة المضافة</h2><p>تُشغّل المنصة وتديرها الجمعية المصرية للتنمية الصناعية، وتربط المصانع والموردين بالمشترين في محافظات مصر الـ27 والأسواق الخارجية، فلا يحتاج المصنع إلى بناء سوقه بنفسه.</p></section>
  </div>
  <section class="ab cin" id="future-vision"><span class="ic">🌐</span><h2>الرؤية المستقبلية</h2><p>التوسع إلى الأسواق الأفريقية والآسيوية والأوروبية عبر شراكات مع المنصات الدولية، وربط كامل لسلسلة الصفقة: من طلب السعر إلى الشحن والتأمين والتسليم.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-green" href="intl.html">المنصات الدولية</a><a class="btn btn-line" href="useful-links.html">مواقع تهمك</a></div></section>
</main>
''', '''
function hg() { var h = location.hash.slice(1); if (h && document.getElementById(h)) setTimeout(function () { document.getElementById(h).scrollIntoView({ block: "start" }); }, 200); }
hg(); window.addEventListener("hashchange", hg);
''')

PAGES['useful-links'] = ('مواقع تهمك – صنع في مصر', 'home', COMMON_CSS + '''
.ul2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.ul2 a { display: flex; gap: 12px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; color: var(--fg); font-weight: 700; transition: transform .2s ease, border-color .2s ease; }
.ul2 a:hover { transform: translateY(-3px); border-color: var(--green); }
.ul2 .ic { width: 44px; height: 44px; border-radius: 12px; background: var(--green-soft); display: grid; place-items: center; font-size: 1.3rem; flex: none; }
''', '''
%HERO%
<main class="wrap pbody2" id="top"><div class="ul2">
<a href="https://www.ida.gov.eg/"><span class="ic">🏛️</span>الهيئة العامة للتنمية الصناعية</a>
<a href="https://sczone.eg/"><span class="ic">🏭</span>الهيئة العامة للمنطقة الاقتصادية لقناة السويس</a>
<a href="https://www.gafi.gov.eg/"><span class="ic">🏦</span>الهيئة العامة للاستثمار والمناطق الحرة</a>
<a href="https://www.eos.org.eg/"><span class="ic">✅</span>الهيئة المصرية العامة للمواصفات والجودة</a>
<a href="https://www.eta.gov.eg/"><span class="ic">🧾</span>مصلحة الضرائب المصرية</a>
</div></main>
''', '')

HEROS = {
 'factories': ('m0.jpg', 'المصانع', 'دليل المصانع والشركات الوطنية', 'تصفّح المصانع والموردين في جمهورية مصر العربية حسب المحافظة والقطاع، وافتح ملف أي مصنع لرؤية منتجاته وشهاداته وبيانات التواصل.', '<a class="btn btn-gold" href="dashboard.html#profile">سجّل مصنعك بالدليل الآن 🏭</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="contact.html#rfq-form">أرسل طلب عرض سعر (RFQ) 📝</a>'),
 'cities': ('m1.jpg', 'المناطق الصناعية والحرة', 'دليل المناطق الصناعية والحرة في مصر', 'الخريطة الصناعية لمحافظات مصر الـ27؛ استكشف المدن الصناعية الجديدة والمناطق الصناعية والحرة والمينائية، من العاشر من رمضان والسادس من أكتوبر ومدينة السادات إلى المنطقة الاقتصادية لقناة السويس (العين السخنة وشرق بورسعيد) والمنطقة الحرة بالإسكندرية، وقطاعاتها المستهدفة.', '<a class="btn btn-gold" href="dashboard.html#profile">سجّل مصنعك بالدليل الآن 🏭</a><a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="contact.html#rfq-form">أرسل طلب عرض سعر (RFQ) 📝</a>'),
 'media-center': ('v0.jpg', 'المركز الإعلامي', 'المركز الإعلامي', 'أحدث الأخبار الصناعية، واللقاءات التلفزيونية، وتغطيات المؤتمرات، وأجندة المعارض.', ''),
 'contact': ('m1.jpg', 'اتصل بنا', 'تواصل مع إدارة منصة صنع في مصر', 'يسعدنا استقبال استفسارات المصانع الوطنية، وطلبات التوثيق، وشراكات التوريد، ومقترحات التعاون الاقتصادي والتجاري المحلي والدولي.', ''),
 'track': ('m3.jpg', '<a href="rfqs.html">طلبات الأسعار</a> › تتبع الطلب', 'تتبع حالة الطلب', 'أدخل رقم الطلب لمعرفة مرحلته والعروض الواردة عليه.', ''),
 'intl': ('m4.jpg', 'المنصات الدولية', 'بوابات ومنصات الصناعة العربية والدولية', 'دليلك المباشر لاستكشاف المنصات الصناعية الشقيقة في الدول العربية وأفريقيا وآسيا وأوروبا، وتسهيل التبادل التجاري والمناقصات وسلاسل الإمداد المشتركة.', ''),
 'about': ('hero-poster.jpg', 'عن المنصة', 'عن منصة صنع في مصر', 'المرجع الرقمي الأول لربط المصانع والموردين بالمشترين المحليين والدوليين، ودعم التحول الرقمي للقطاع الصناعي في بيئة موثوقة وشفافة، تماشياً مع «رؤية مصر 2030».', '<a class="btn btn-gold" href="dashboard.html#profile">سجّل مصنعك معنا الآن 🏭</a>'),
 'useful-links': ('m4.jpg', '<a href="about.html">عن المنصة</a> › مواقع تهمك', 'مواقع تهمك', 'روابط الجهات الحكومية الداعمة للقطاع الصناعي في جمهورية مصر العربية.', ''),
}

en_add([
 ("رسالتك بتتسجّل برقم متابعة ويوصلك إيصال بيه على بريدك. لو عندك سؤال عن المنصة أو الباقات، جنة (المساعدة الذكية) بترد عليك فوراً من أي صفحة.", "Your message is recorded under a tracking number and a receipt is e-mailed to you. For questions about the platform or the plans, Janna (the AI assistant) answers instantly on any page."),
 ("البريد الإلكتروني *", "E-mail *"), ("رقم الموبايل / الواتساب *", "Mobile / WhatsApp *"), ("مثلاً: توثيق ملف المصنع", "e.g. verifying the factory profile"), ("اكتب رسالتك هنا…", "Write your message here…"),
 ("المنصة بتطابق طلبك تلقائياً (القطاع والمنتج والمحافظة والسوق) مع المصانع المسجّلة على المنصة وبتبعته لحد 10 منهم بالإيميل (وعلى الواتساب للي مفعّله)، وبتقولك العدد الحقيقي. ردودهم وعروض أسعارهم بتوصلك تلقائياً على بريدك، وأرقام المصانع الشخصية مش بتظهر.", "The platform automatically matches your request (sector, product, governorate and market) with the factories registered on the platform and sends it to up to 10 of them by e-mail (and by WhatsApp to those who turned it on), telling you the true number. Their replies and quotes reach your e-mail automatically; factories' personal numbers are never shown."),
 ("مثلاً: زجاج شفاف 6 مم", "e.g. clear glass 6 mm"), ("مثلاً: 1,200 م²", "e.g. 1,200 m²"), ("اختر القطاع", "Choose the sector"), ("محافظة التسليم", "Delivery governorate"), ("مدينة / منطقة التسليم", "Delivery city / area"), ("مثلاً: العاشر من رمضان", "e.g. 10th of Ramadan City"), ("سوق التسليم", "Delivery market"),
 ("الخليج والدول العربية", "the Gulf & Arab countries"), ("أفريقيا", "Africa"), ("آسيا", "Asia"), ("أوروبا", "Europe"), ("المواصفات الفنية وشروط التسليم والدفع…", "Technical specifications, delivery and payment terms…"), ("الاسم *", "Name *"), ("الشركة", "Company"), ("الموبايل (لتتبّع الطلب) *", "Mobile (to track the request) *"),
 ("البتروكيماويات والكيماويات", "Petrochemicals & chemicals"), ("الأدوية والمستلزمات الطبية", "Pharmaceuticals & medical supplies"), ("الأثاث والأخشاب", "Furniture & wood"), ("الغزل والنسيج", "Spinning & textiles"), ("الورق والتغليف", "Paper & packaging"), ("الكهرباء والكابلات", "Electrical & cables"),
 ("اجتماع مع جنة", "Meeting with Janna"), ("جنة بتشرحلك المنصة والباقات وتساعدك في طلبك في اجتماع فيديو مباشر أو في ميعاد تختاره، ويوصلك ملخص الاجتماع على بريدك.", "Janna explains the platform and the plans and helps with your request in a live video meeting or at a time you choose; the meeting summary is e-mailed to you."), ("ابدأ اجتماع مع جنة", "Start a meeting with Janna"),
])

en_add([
 ("حسب كراسة الشروط", "As per the tender documents"), ("غير معلن", "Not announced"), ("كراسة الشروط والمستندات من الإعلان الرسمي للجهة", "Tender documents from the entity's official notice"),
 ("المنصة ما بتنشرش نسخ من الكراسات؛ المرجع هو الإعلان الرسمي للجهة.", "The platform does not publish copies of tender documents; the entity's official notice is the reference."),
 ("لا توجد مستندات منشورة لهذه الفرصة على المنصة.", "No documents for this opportunity are published on the platform."), ("تسجيل عرضك على الفرص متاح من الباقة الأساسية", "Recording your offer on opportunities is available from the Basic plan"),
 ("التقديم الرسمي على المناقصة بيكون عند الجهة من الإعلان الرسمي. هنا بتسجّل عرضك المبدئي في حسابك علشان نتابعه ونبلغك تلقائياً بأي تحديث على الفرصة.", "The official bid is submitted to the entity through its official notice. Here you record your preliminary offer in your account so it is tracked and you are notified automatically of any update."),
 ("بتسجّل عرضك على الطلب في حسابك، وهنبلغك تلقائياً بأي تحديث عليه.", "You record your offer on this request in your account and are notified automatically of any update."),
 ("اسم المصنع / الشركة *", "Factory / company name *"), ("مثلاً: 250000", "e.g. 250000"), ("العملة", "Currency"), ("جنيه مصري", "Egyptian pound"), ("دولار", "US dollar"), ("يورو", "Euro"), ("المسؤول *", "Contact person *"), ("الموبايل", "Mobile"),
 ("ملاحظات على العرض", "Notes on the offer"), ("الالتزام بالمواصفات، طريقة التوريد…", "Compliance with the specifications, delivery method…"), ("تسجيل العرض", "Record the offer"), ("تابع الفرصة", "Follow this opportunity"),
 ("موعد الإغلاق غير معلن؛ راجع الإعلان الرسمي.", "The closing date is not announced; check the official notice."),
])

en_add([("واتساب المنصة الرسمي", "The platform's official WhatsApp"),
 # «كيف أسجّل مصنعي؟» in three parts: the payment sentence is [data-mig-buy] (hidden in a store app while its buying is off)
 ("اختار الباقة المناسبة لمصنعك، واملأ استمارة التسجيل وابعت الطلب: بيوصلك رقم متابعة على الإيميل، وبتدخل بكود لمرة واحدة وتكمّل ملفك.", "Choose the plan that fits your factory, fill in the registration form and send it: a tracking number reaches your e-mail, and you sign in with a one-time code to complete your profile."),
 ("الدفع بيتم في صفحة بوابة الدفع الآمنة نفسها، ورابطه بيوصلك تلقائياً على الإيميل أول ما يتفعّل — ومنصتنا مش بتطلب بيانات كارت أبداً.", "Payment happens on the secure payment gateway's own page, and its link is e-mailed to you automatically as soon as it is live — our platform never asks for card details."),
 ("رفع مستندات المنشأة (السجل التجاري والبطاقة الضريبية والرخصة الصناعية) من حسابك هيتفعّل في المرحلة الجاية من المنصة.", "Uploading your company documents (commercial register, tax card and industrial licence) from your account opens in the platform's next phase."),
 ("أدخل رقم الطلب وآخر 4 أرقام من موبايلك في صفحة التتبع (أو ادخل بحسابك) وهتشوف حالته الحقيقية: اتبعت لكام مصنع مسجّل، والردود وعروض الأسعار اللي وصلت.", "Enter the request number and the last 4 digits of your mobile on the tracking page (or sign in) to see its real status: how many registered factories it was sent to, and the replies and quotes received."),
 ("في صفحات المناقصات وطلبات الأسعار، حسب المحافظة والقطاع والنطاق الجغرافي لباقتك، مع رابط الإعلان الرسمي لكل مناقصة. المنصة تعرض الفرص للمعلومات ولا تطرح المناقصات ولا ترسيها.", "On the tenders and RFQs pages, by governorate, sector and your plan's geographic scope, with a link to each tender's official notice. The platform shows opportunities for information; it does not issue or award tenders."),
 ("منتجات الأعضاء بتظهر في السوق الإلكتروني حسب حد باقتك، وطلبات الأسعار عليها بتتبعت تلقائياً للمصانع المسجّلة. إضافة المنتجات وتعديلها بنفسك من حسابك بتتفعّل في المرحلة الجاية من المنصة.", "Members' products appear in the marketplace within your plan's limit, and price requests on them are routed automatically to registered factories. Adding and editing products yourself from your account comes in the platform's next phase.")])

# market.html: visually-hidden page heading (one h1 for search engines; QA D 2026-11-18)
en_add([("سوق صنع في مصر — منتجات المصانع المصرية الأعضاء في المنصة", "Made in Egypt Market — products of the Egyptian member factories on the platform")])
