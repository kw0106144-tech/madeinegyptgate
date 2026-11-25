# Public listing pages for tenders (MIGTEND) and RFQs (MIGRFQ) imported from the platform's current site, with region split
OL_CSS = COMMON_CSS + '''
.ol-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.ol-top .k { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.ol-top .k b { display: block; font-size: 1.5rem; color: var(--green); } .ol-top .k small { color: var(--muted); }
.ol-f { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px; }
.ol-f input, .ol-f select { border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; font: inherit; background: #fff; min-width: 150px; max-width: 240px; }
.ol-f input[type=search] { flex: 1; min-width: 220px; }
.ol-rg { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.ol-rg button { flex: none; border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 6px 12px; font: inherit; font-size: .84rem; font-weight: 700; cursor: pointer; color: var(--fg); }
.ol-rg button.on { background: var(--green); color: #fff; border-color: var(--green); }
.ol-rg button small { opacity: .7; margin-inline-start: 4px; }
.ol-list { display: flex; flex-direction: column; gap: 10px; }
.ol-it { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 14px; cursor: pointer; transition: border-color .2s ease, transform .2s ease; text-align: start; font: inherit; color: inherit; width: 100%; }
.ol-it:hover { border-color: var(--green); transform: translateY(-2px); }
.ol-it h3 { margin: 0; font-size: 1rem; line-height: 1.7; }
.ol-it .m { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); font-size: .84rem; grid-column: 1; }
.ol-it .s { grid-row: 1 / span 2; grid-column: 2; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; justify-content: center; }
.st2 { border-radius: 99px; padding: 2px 10px; font-size: .78rem; font-weight: 800; white-space: nowrap; }
.st2.ok { background: #E7F6EE; color: #C8102E; } .st2.soon { background: #FFF4E0; color: #A15C00; } .st2.end { background: #F1F5F9; color: #64748B; } .st2.na { background: #F1F5F9; color: #475569; }
.ol-inc { font-size: .74rem; color: var(--muted); background: var(--sunken, #F8FAFC); border: 1px dashed var(--line); border-radius: 8px; padding: 1px 8px; }
.ol-pg { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.ol-pg button { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; min-width: 38px; padding: 6px 10px; font: inherit; cursor: pointer; }
.ol-pg button.on { background: var(--green); color: #fff; border-color: var(--green); }
.oldv dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; } .oldv dt { color: var(--muted); } .oldv dd { margin: 0; }
.oldv .lock { background: #FBF4DE; border: 1px solid #EADBA8; border-radius: 12px; padding: 12px; font-size: .9rem; }
@media (max-width: 760px) { .ol-top { grid-template-columns: repeat(2, 1fr); } .ol-it { grid-template-columns: 1fr; } .ol-it .s { grid-row: auto; grid-column: 1; flex-direction: row; justify-content: flex-start; } }
'''

def _ol_body(kind):
    ph = 'ابحث برقم المناقصة أو الجهة أو النشاط…' if kind == 't' else 'ابحث برقم الطلب أو المنتج أو المواصفات…'
    extra = ('<select id="olS"><option value="">كل الحالات</option><option value="سارية">سارية</option><option value="تنتهي قريباً">تنتهي قريباً</option><option value="منتهية">منتهية</option><option value="غير محدد الموعد">غير محدد الموعد</option></select><select id="olSec"><option value="">كل الأنشطة</option></select>' if kind == 't'
             else '<select id="olS"><option value="">كل الفترات</option><option value="30">آخر 30 يوماً</option><option value="90">آخر 90 يوماً</option><option value="365">آخر سنة</option></select>')
    return '''%HERO%
<main class="wrap pbody2" id="top">
<div class="ol-top" id="olK"></div>
<div class="ol-rg" id="olRg" aria-label="التقسيم الجغرافي"></div>
<div class="ol-f"><input id="olQ" type="search" placeholder="''' + ph + '''" aria-label="بحث">''' + extra + '''<select id="olO"><option value="new">الأحدث</option><option value="dl">أقرب موعد</option></select></div>
<p class="muted" id="olC" style="margin:0"></p>
<div class="ol-list" id="olL"></div>
<div class="ol-pg" id="olP"></div>
<p class="muted" style="font-size:.84rem">''' + ('ℹ️ المناقصات منشورة من المصادر الرسمية المفتوحة للإعلام فقط، والمرجع لشروطها ومواعيدها هو الجهة المالكة ومنصتها الرسمية. راجع <a href="legal.html#tenders">إخلاء مسؤولية المناقصات</a>.' if kind == 't' else 'ℹ️ بيانات التواصل الشخصية لأصحاب الطلبات مش بتتعرض على المنصة؛ الأعضاء من الباقة الأساسية بيسجّلوا عروضهم على الطلب من خلال المنصة. راجع <a href="legal.html#rfq">قواعد طلبات الأسعار</a>.') + '''</p>
</main>'''

OL_JS = r'''
var KIND = "%KIND%", D = KIND === "t" ? (window.MIGTEND || []) : (window.MIGRFQ || []), R = window.MIGREG, PAGE = 1, PER = 20, RG = "";
var RI = KIND === "t" ? 10 : 7, can = window.MIGPLAN && MIGPLAN.can ? MIGPLAN.can(KIND === "t" ? "tenders" : "rfq") : false;
function T(ar, en) { return window.MIGLANG === "en" ? en : ar; }
/* deploy 2: the plan an action needs, preselected on /register/ (members: «باقتي» in the dashboard) — data/plan.js needKey / upHref follow the plans matrix */
function NK(f) { return window.MIGPLAN && MIGPLAN.needKey ? MIGPLAN.needKey(f) : "basic"; }
function UPG(f) { return window.MIGPLAN && MIGPLAN.upHref ? MIGPLAN.upHref(NK(f)) : "register.html#" + NK(f); }
/* Arabic number agreement: AW = the label after a number shown on its own, AN = number + noun (1 · 2 · 3–10 plural · 11+ singular) */
function AW(n, a) { var m = n % 100; return n === 1 ? a[0] : n === 2 ? a[1] : m >= 3 && m <= 10 ? a[2] : a[3]; }
function AN(n, a) { var m = n % 100; return n === 1 ? a[0] : n === 2 ? a[1] : fmt(n) + " " + (m >= 3 && m <= 10 ? a[2] : a[3]); }
/* hide test/junk «طلب سعر مجمع» submissions imported from the old site: no real details (empty/very short text, or the company name repeated) */
if (KIND === "r") D = D.filter(function (x) { if (!/^طلب سعر مجمع/.test(x[2])) return true; var d = String(x[3] || "").replace(/[\s….]+/g, " ").trim(), co = (/:\s*(.+?)\s*\(/.exec(x[2]) || [])[1] || ""; return d.length >= 30 && !(co && d.split(co).join("").trim() === ""); });
var HASRG = D.some(function (x) { return x[RI]; });
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function fmt(n) { return Number(n).toLocaleString("en-US"); }
function rname(c) { return c && R ? R.name(c) : "غير محددة"; }
function stc(s) { return s === "سارية" ? "ok" : s === "منتهية" ? "end" : s === "تنتهي قريباً" ? "soon" : "na"; }
var STEN = { "سارية": "Open", "تنتهي قريباً": "Closing soon", "منتهية": "Closed", "غير محدد الموعد": "No deadline given" };
function stt(s) { return esc(window.MIGLANG === "en" && STEN[s] ? STEN[s] : s); }
function ymd(t) { var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
var today = ymd(Date.now());
/* a tender's status is re-computed from its deadline on every visit (the data's value is as of the day it was built): passed → «منتهية»,
   within 7 days → «تنتهي قريباً», later → «سارية»; no deadline in the data → kept as it is («غير محدد الموعد») */
if (KIND === "t") { var d7 = ymd(Date.now() + 7 * 864e5); D.forEach(function (x) { var d = /^\d{4}-\d{2}-\d{2}$/.test(String(x[9] || "")) ? String(x[9]) : ""; if (d) x[2] = d < today ? "منتهية" : d <= d7 ? "تنتهي قريباً" : "سارية"; }); }
/* «بيانات غير مكتملة: …» (data/regions.js MIGINC; flags in MIGTEND[12] / MIGRFQ[11]) */
function inc(x) { var f = window.MIGINC ? MIGINC.list(x[KIND === "t" ? 12 : 11]) : []; return f.length ? '<span class="ol-inc">⚠️ ' + esc(MIGINC.label + ": " + f.join("، ")) + "</span>" : ""; }
/* search text: every field plus its English translation in English mode (cached per row) */
function hay(x) { return x._h || (x._h = x.map(function (s) { s = String(s == null ? "" : s); return s + " " + (window.MIGHAY ? MIGHAY(s) : ""); }).join(" ").toLowerCase()); }
if (KIND === "t") { var secs = {}; D.forEach(function (t) { if (t[6]) secs[t[6]] = (secs[t[6]] || 0) + 1; }); $("#olSec").innerHTML += Object.keys(secs).sort(function (a, b) { return secs[b] - secs[a]; }).map(function (s) { return "<option>" + esc(s) + "</option>"; }).join(""); }
(function () {
  var cnt = {}; D.forEach(function (x) { var k = x[RI] || "-"; cnt[k] = (cnt[k] || 0) + 1; });
  var codes = R ? R.list.map(function (r) { return r[0]; }) : [];
  $("#olRg").hidden = !HASRG;
  $("#olRg").innerHTML = '<button type="button" class="on" data-rg="">كل المحافظات<small>' + fmt(D.length) + '</small></button>' + codes.map(function (c) { return '<button type="button" data-rg="' + c + '">' + rname(c) + '<small>' + fmt(cnt[c] || 0) + '</small></button>'; }).join("") + '<button type="button" data-rg="-">على مستوى الجمهورية / غير محددة<small>' + fmt(cnt["-"] || 0) + '</small></button>';
  if (KIND === "t") { var open = D.filter(function (t) { return t[2] === "سارية" || t[2] === "تنتهي قريباً"; }).length, soon = D.filter(function (t) { return t[2] === "تنتهي قريباً"; }).length, nd = D.filter(function (t) { return t[2] === "غير محدد الموعد"; }).length, au = {};
    D.forEach(function (t) { if (t[4] && t[4] !== "جهة حكومية") au[t[4]] = 1; }); /* «جهة حكومية» is a placeholder for rows without an entity name */
    $("#olK").innerHTML = '<div class="k"><b>' + fmt(D.length) + '</b><small>' + T(AW(D.length, ["مناقصة منشورة", "مناقصتان منشورتان", "مناقصات منشورة", "مناقصة منشورة"]), "Published tenders") + '</small></div><div class="k"><b>' + fmt(open) + '</b><small>' + T(AW(open, ["مناقصة مفتوحة الآن", "مناقصتان مفتوحتان الآن", "مناقصات مفتوحة الآن", "مناقصة مفتوحة الآن"]), "Open now") + '</small></div><div class="k"><b>' + fmt(soon) + '</b><small>' + T("تنتهي خلال 7 أيام", "Closing within 7 days") + '</small></div>' + (nd ? '<div class="k"><b>' + fmt(nd) + '</b><small>' + T("بدون موعد إغلاق معلن", "Without a published deadline") + '</small></div>' : '') + '<div class="k"><b>' + fmt(Object.keys(au).length) + '</b><small>' + T(AW(Object.keys(au).length, ["جهة طارحة معلنة الاسم", "جهتان طارحتان معلنتا الاسم", "جهات طارحة معلنة الاسم", "جهة طارحة معلنة الاسم"]), "Named issuing bodies") + '</small></div>';
  } else { var m30 = D.filter(function (r) { return r[1] && (Date.now() - new Date(r[1])) / 864e5 <= 30; }).length, yr = D.filter(function (r) { return r[1] && r[1].slice(0, 4) === today.slice(0, 4); }).length;
    $("#olK").innerHTML = '<div class="k"><b>' + fmt(D.length) + '</b><small>' + T(AW(D.length, ["طلب عرض سعر منشور", "طلبا عرض سعر منشوران", "طلبات عروض أسعار منشورة", "طلب عرض سعر منشور"]), D.length === 1 ? "Published RFQ" : "Published RFQs") + '</small></div><div class="k"><b>' + fmt(m30) + '</b><small>' + T("خلال آخر 30 يوماً", "In the last 30 days") + '</small></div><div class="k"><b>' + fmt(yr) + '</b><small>' + T(AW(yr, ["طلب هذا العام", "طلبان هذا العام", "طلبات هذا العام", "طلباً هذا العام"]), "This year") + '</small></div>' + (HASRG ? '<div class="k"><b>' + fmt(Object.keys(cnt).filter(function (k) { return k !== "-"; }).length) + '</b><small>' + T(AW(Object.keys(cnt).filter(function (k) { return k !== "-"; }).length, ["محافظة مغطاة", "محافظتان مغطاتان", "محافظات مغطاة", "محافظة مغطاة"]), "Governorates covered") + '</small></div>' : '<div class="k"><b>' + fmt(Object.keys(D.reduce(function (a, r) { if (r[9]) a[r[9]] = 1; return a; }, {})).length) + '</b><small>' + T(AW(Object.keys(D.reduce(function (a, r) { if (r[9]) a[r[9]] = 1; return a; }, {})).length, ["قطاع مغطى", "قطاعان مغطيان", "قطاعات مغطاة", "قطاعاً مغطى"]), "Sectors covered") + '</small></div>');
  }
})();
function list() {
  var q = $("#olQ").value.trim().toLowerCase(), s = $("#olS").value, sec = KIND === "t" ? $("#olSec").value : "", o = $("#olO").value;
  var l = D.filter(function (x) {
    if (RG && (x[RI] || "-") !== RG) return false;
    if (KIND === "t") { if (s && x[2] !== s) return false; if (sec && x[6] !== sec) return false; }
    else if (s) { if (!x[1] || (Date.now() - new Date(x[1])) / 864e5 > +s) return false; }
    return !q || hay(x).indexOf(q) > -1;
  });
  if (o === "dl") l = l.slice().sort(function (a, b) { var da = KIND === "t" ? a[9] : a[6].split("/").reverse().join("-"), db = KIND === "t" ? b[9] : b[6].split("/").reverse().join("-"); da = da && da >= today ? da : "9999"; db = db && db >= today ? db : "9999"; return da < db ? -1 : da > db ? 1 : 0; });
  return l;
}
function render() {
  var l = list(), pages = Math.max(1, Math.ceil(l.length / PER)); if (PAGE > pages) PAGE = pages;
  $("#olC").textContent = (window.MIGLANG === "en" ? fmt(l.length) + (KIND === "t" ? (l.length === 1 ? " matching tender" : " matching tenders") : (l.length === 1 ? " matching request" : " matching requests")) : AN(l.length, KIND === "t" ? ["مناقصة واحدة مطابقة", "مناقصتان مطابقتان", "مناقصات مطابقة", "مناقصة مطابقة"] : ["طلب واحد مطابق", "طلبان مطابقان", "طلبات مطابقة", "طلباً مطابقاً"])) + (RG ? " · " + (RG === "-" ? "على مستوى الجمهورية / محافظة غير محددة" : rname(RG)) : "");
  var part = l.slice((PAGE - 1) * PER, PAGE * PER);
  $("#olL").innerHTML = part.length ? part.map(function (x) { var i = D.indexOf(x);
    if (KIND === "t") return '<button type="button" class="ol-it" data-i="' + i + '"><h3>' + esc(x[3]) + '</h3><span class="m"><span>🏛️ ' + esc(x[4]) + '</span><span>📍 ' + rname(x[10]) + '</span><span># ' + esc(x[0]) + '</span>' + (x[6] ? '<span>🏷️ ' + esc(x[6]) + '</span>' : '') + '</span>' + (inc(x) ? '<span class="m">' + inc(x) + '</span>' : '') + '<span class="s"><span class="st2 ' + stc(x[2]) + '">' + stt(x[2]) + '</span>' + (x[9] ? '<small class="muted">⏳ ' + x[9] + '</small>' : '') + '</span></button>';
    return '<button type="button" class="ol-it" data-i="' + i + '"><h3>' + esc(x[2]) + '</h3><span class="m"><span># ' + esc(x[0]) + '</span>' + (x[1] ? '<span>📅 ' + x[1] + '</span>' : '') + (x[7] || x[4] ? '<span>📍 ' + esc(x[4] || rname(x[7])) + '</span>' : '') + (x[5] ? '<span>📦 ' + esc(x[5]) + '</span>' : '') + '</span>' + (inc(x) ? '<span class="m">' + inc(x) + '</span>' : '') + '<span class="s">' + (x[6] ? '<small class="muted">⏳ ' + esc(x[6]) + '</small>' : '') + '<span class="st2 ok">التفاصيل ←</span></span></button>';
  }).join("") : '<div class="card2" style="text-align:center">لا توجد نتائج بهذه الفلاتر.</div>';
  var pg = [], a = Math.max(1, PAGE - 3), b = Math.min(pages, a + 6); for (var p = a; p <= b; p++) pg.push(p);
  $("#olP").innerHTML = (PAGE > 1 ? '<button type="button" data-p="' + (PAGE - 1) + '">‹</button>' : '') + pg.map(function (p) { return '<button type="button" data-p="' + p + '"' + (p === PAGE ? ' class="on"' : '') + '>' + fmt(p) + '</button>'; }).join("") + (PAGE < pages ? '<button type="button" data-p="' + (PAGE + 1) + '">›</button>' : '');
}
var CTX0 = window.MIG_CTX || null;
/* a tender's description (MIGTEND[14]) and the issuer's procurement contacts (MIGTEND[15], one «label: value» per line) — owner 2026-11-25:
   every tender carries its contacts; this part of detail() is reached by subscribers only (the locked branch below replaces the body) */
function tdet(x) {
  var h = "", d = String(x[14] || "").trim(), c = String(x[15] || "").trim();
  if (d) h += '<div><b style="display:block;margin-bottom:4px">' + T("تفاصيل المناقصة", "Tender details") + '</b><p style="margin:0;line-height:1.9;white-space:pre-line">' + esc(d) + '</p></div>';
  if (c) {
    var rows = c.split(/\n+/).map(function (l) {
      var i = l.indexOf(":"), k = i > 0 ? l.slice(0, i).trim() : "", v = (i > 0 ? l.slice(i + 1) : l).trim(), m;
      if (!v) return "";
      if ((m = v.match(/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/))) v = '<a href="mailto:' + esc(v) + '" dir="ltr">' + esc(v) + '</a>';
      else if (/^\+?[\d\s()\/-]{6,}$/.test(v)) v = '<a href="tel:' + esc(v.replace(/[^\d+]/g, "")) + '" dir="ltr">' + esc(v) + '</a>';
      else v = esc(v);
      return '<dt>' + esc(k || T("تواصل", "Contact")) + '</dt><dd>' + v + '</dd>';
    }).join("");
    if (rows) h += '<div><b style="display:block;margin-bottom:4px">📞 ' + T("جهات التواصل", "Contacts") + '</b><dl>' + rows + '</dl></div>';
  }
  return h;
}
function detail(x) {
  var o = document.createElement("div"); o.className = "pdov";
  can = window.MIGPLAN && MIGPLAN.can ? MIGPLAN.can(KIND === "t" ? "tenders" : "rfq") : false; /* re-read: the server's plan may have arrived after load */
  var fid = String(x[0]), ttl = KIND === "t" ? x[3] : x[2]; /* the same id the platform's alerts and deadline reminders use (worker/build-index.js) */
  /* which tender / RFQ is on screen (Janna, follows, beacons) */
  var furl = (KIND === "t" ? "tenders/search/#" : "rfq/search/#") + encodeURIComponent(fid); /* the interactive list at its clean URL (the /tenders/ hub does not open items) */
  if (window.MIGINQ) MIGINQ.ctx({ type: KIND === "t" ? "tender" : "rfq", id: fid, title: ttl, url: furl });
  var fol = '<button class="mig-fbtn" type="button" style="align-self:flex-start" data-follow-kind="' + (KIND === "t" ? "tender" : "rfq") + '" data-follow-id="' + esc(fid) + '" data-follow-label="' + esc(ttl) + '" data-follow-url="' + esc(furl) + '" data-follow-text="' + (KIND === "t" ? T("تابع المناقصة", "Follow the tender") : T("تابع الطلب", "Follow the request")) + '">☆ ' + (KIND === "t" ? T("تابع المناقصة", "Follow the tender") : T("تابع الطلب", "Follow the request")) + '</button>';
  var lock = '<div class="lock">🔒 <span>' + (KIND === "t" ? T("تنبيهات المناقصات ومتابعتها وتسجيل عرضك من الباقة الأساسية وطالع.", "Tender alerts, tracking and recording your offer start with the Basic plan.") : T("تسجيل عرض سعر على الطلب متاح للأعضاء من الباقة الأساسية.", "Recording a quote on this request is available to members from the Basic plan.")) + '</span> <a href="' + esc(UPG("respond")) + '" data-mig-want="' + esc(NK("respond")) + '" style="font-weight:800;color:var(--green)">' + T("اشترك الآن ←", "Subscribe →") + '</a></div>';
  var body = KIND === "t"
    ? '<h2 style="margin:0;font-size:1.15rem;line-height:1.7">' + esc(x[3]) + '</h2><span class="st2 ' + stc(x[2]) + '" style="align-self:flex-start">' + stt(x[2]) + '</span>' + inc(x) + '<dl><dt>' + T("رقم المناقصة", "Tender No.") + '</dt><dd class="num">' + esc(x[0]) + '</dd><dt>النوع</dt><dd>' + esc(x[1]) + '</dd><dt>الجهة</dt><dd>' + esc(x[4]) + '</dd><dt>العنوان</dt><dd>' + esc(x[5] || "—") + '</dd><dt>المحافظة</dt><dd>' + rname(x[10]) + '</dd><dt>النشاط</dt><dd>' + esc(x[6] || "—") + '</dd><dt>ثمن كراسة الشروط</dt><dd>' + (x[7] ? fmt(+x[7]) + " جنيه" : "—") + '</dd><dt>التأمين الابتدائي</dt><dd>' + (x[8] ? esc(x[8]) + (/^[0-9.]+$/.test(x[8]) ? "%" : "") : "—") + '</dd><dt>آخر موعد للعطاءات</dt><dd>' + (x[9] || "—") + '</dd></dl>' + tdet(x) + (can ? fol : lock) + (/^https?:/.test(x[11] || "") ? '<a class="btn btn-line btn-sm" href="' + esc(x[11]) + '" target="_blank" rel="noopener" style="align-self:flex-start">صفحة المناقصة ومصدرها ↗</a>' : '') + '<small class="muted">' + T("المرجع لشروط المناقصة ومواعيدها هو الجهة المالكة وكراسة الشروط المعتمدة وبوابة التعاقدات العامة المصرية (etenders.gov.eg)؛ المنصة جهة إعلامية وليست جهة شراء أو ترسية.", "The reference for tender terms and deadlines is the owning entity, the approved tender documents and the Egyptian Public Procurement Portal (etenders.gov.eg); the platform is an information provider, not a procuring or awarding entity.") + '</small>'
    : '<h2 style="margin:0;font-size:1.15rem;line-height:1.7">' + esc(x[2]) + '</h2>' + inc(x) + '<dl><dt>رقم الطلب</dt><dd class="num">' + esc(x[0]) + '</dd><dt>تاريخ النشر</dt><dd>' + (x[1] || "—") + '</dd><dt>مكان التسليم</dt><dd>' + (x[4] || x[7] ? esc(x[4] || rname(x[7])) : "—") + '</dd><dt>الكمية</dt><dd>' + esc(x[5] || "—") + '</dd><dt>الموعد النهائي</dt><dd>' + esc(x[6] || "—") + '</dd></dl>' + (x[3] ? '<p style="margin:0;font-size:.9rem;line-height:1.9;max-height:220px;overflow:auto;background:var(--sunken, #F8FAFC);padding:10px;border-radius:10px">' + esc(window.MIGLANG === "en" && x[10] ? x[10] : x[3]) + (x[3].length >= 300 ? "…" : "") + '</p>' : '') + (can ? fol + (window.MIGPLAN && MIGPLAN.can("respond") ? '<button class="btn btn-green" type="button" data-offer="1" style="align-self:flex-start">📝 ' + T("سجّل عرض سعر", "Record a quote") + '</button>' : '<div class="lock">🔒 <span>' + T("تسجيل عرض سعر على الطلب متاح من الباقة الأساسية.", "Recording a quote is available from the Basic plan.") + '</span> <a href="' + esc(UPG("respond")) + '" data-mig-want="' + esc(NK("respond")) + '" style="font-weight:800;color:var(--green)">' + T("رقّي باقتك ←", "Upgrade →") + '</a></div>') : lock);
  /* owner 2026-11-23: a visitor, or a member whose plan does not cover tenders / RFQs in Egypt, sees the title and the status only —
     the details (number, entity, dates, amounts, description) open from the plan that has them, inside its markets (Egypt = "local") */
  var mkOk = !window.MIGPLAN || !MIGPLAN.inScope || MIGPLAN.inScope("local");
  if (!(can && mkOk)) {
    var lf = KIND === "t" ? "tenders" : "rfq";
    body = '<h2 style="margin:0;font-size:1.15rem;line-height:1.7">' + esc(ttl) + '</h2>' + (KIND === "t" ? '<span class="st2 ' + stc(x[2]) + '" style="align-self:flex-start">' + stt(x[2]) + '</span>' : '')
      + (window.MIGPLAN && MIGPLAN.lockHTML ? MIGPLAN.lockHTML(lf, KIND === "t" ? T("تفاصيل المناقصة متاحة للمشتركين", "Tender details are for members") : T("تفاصيل الطلب متاحة للمشتركين", "Request details are for members"))
        : '<div class="lock">🔒 <span>' + T("التفاصيل متاحة للمشتركين من الباقة الأساسية.", "Details are for members from the Basic plan.") + '</span> <a href="' + esc(UPG(lf)) + '" data-mig-want="' + esc(NK(lf)) + '" style="font-weight:800;color:var(--green)">' + T("اشترك الآن ←", "Subscribe →") + '</a></div>');
  }
  o.innerHTML = '<div class="box oldv" role="dialog" aria-modal="true" style="position:relative;max-width:640px;max-height:90vh;overflow:auto"><button class="x" type="button" aria-label="إغلاق">✕</button><div class="bd" style="padding:22px;display:flex;flex-direction:column;gap:12px">' + body + '</div></div>';
  document.body.appendChild(o);
  var done = function () { o.remove(); if (window.MIGINQ) MIGINQ.ctx(CTX0); };
  o.addEventListener("click", function (ev) {
    if (ev.target === o || ev.target.closest(".x")) { done(); return; }
    if (ev.target.closest("[data-offer]") && window.MIGINQ) {
      MIGINQ.dialog({ kind: "opp_offer", target_type: "rfq", target_id: fid, target_name: ttl, needPlan: "respond", title: T("عرض سعر على: ", "Quote on: ") + ttl,
        intro: MIGINQ.esc(T("عرضك بيتسجّل في حسابك على الطلب ده. بيانات صاحب الطلب الشخصية مش متاحة على المنصة، وهنبلغك تلقائياً بأي تحديث.", "Your quote is recorded in your account against this request. The requester's personal contact is not on the platform; you are notified automatically of updates.")),
        fields: [{ k: "price", label: T("السعر", "Price"), type: "number" }, { k: "currency", label: T("العملة", "Currency"), opts: [["EGP", T("جنيه مصري", "EGP")], ["USD", "USD"], ["EUR", "EUR"]] }, { k: "moq", label: T("الحد الأدنى للطلب", "Minimum order") }, { k: "lead_time", label: T("مدة التوريد", "Lead time") }, { k: "validity", label: T("صلاحية العرض", "Validity") }],
        message: { label: T("ملاحظات العرض", "Notes") }, payload: { ref: x[0] }, submit: T("سجّل العرض", "Record the quote") });
    }
  });
}
$("#olL").addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) detail(D[+b.dataset.i]); });
$("#olP").addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (!b) return; PAGE = +b.dataset.p; render(); window.scrollTo({ top: $("#olRg").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); });
$("#olRg").addEventListener("click", function (e) { var b = e.target.closest("[data-rg]"); if (!b) return; RG = b.dataset.rg; PAGE = 1; $$("#olRg button").forEach(function (x) { x.classList.toggle("on", x === b); }); history.replaceState(null, "", RG && RG !== "-" ? "#" + RG : location.pathname); render(); });
["#olQ"].forEach(function (i) { $(i).addEventListener("input", function () { PAGE = 1; render(); }); });
["#olS", "#olO"].concat(KIND === "t" ? ["#olSec"] : []).forEach(function (i) { $(i).addEventListener("change", function () { PAGE = 1; render(); }); });
/* #<governorate code> filters the list; #<ref> (links in alerts and e-mails: tenders.html#<id>, rfqs.html#<ref>) opens that item —
   a sourced opportunity that lives on opportunity.html (REAL.tenders id / international ref) is forwarded there */
function openHash() {
  var h = ""; try { h = decodeURIComponent(location.hash.slice(1)); } catch (x) { h = location.hash.slice(1); }
  if (!h) return;
  var hb = document.querySelector('#olRg [data-rg="' + h.replace(/"/g, "") + '"]'); if (hb) { hb.click(); return; }
  var it = D.filter(function (x) { return String(x[0]) === h; })[0]; if (it) { detail(it); return; }
  if (KIND === "t" && window.REAL) {
    var L = REAL.tenders || [], I2 = REAL.tenders_intl || [], k;
    for (k = 0; k < L.length; k++) if (L[k] && (String(L[k].id) === h || String(L[k].ref) === h)) { location.replace("opportunity.html#" + (window.MIGOID ? MIGOID(L[k], k) : "MD" + (k + 1)).toLowerCase()); return; }
    for (k = 0; k < I2.length; k++) if (I2[k] && String(I2[k].ref) === h) { location.replace("opportunity.html#in" + (k + 1)); return; }
  }
}
openHash(); window.addEventListener("hashchange", function () { if (!document.querySelector(".pdov")) openHash(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !document.querySelector(".mgq-dlg")) { var o = document.querySelector(".pdov"); if (o) { o.remove(); if (window.MIGINQ) MIGINQ.ctx(CTX0); } } });
/* query handed over by the home search */
try { var q0 = sessionStorage.getItem("mig-q"); if (q0) { $("#olQ").value = q0; sessionStorage.removeItem("mig-q"); } } catch (x) {}
render();
'''
PAGES['tenders'] = ('المناقصات الحكومية – صنع في مصر', 'rfq', OL_CSS, _ol_body('t'), OL_JS.replace('%KIND%', 't'))
HEROS['tenders'] = ('m1.jpg', '<a href="tenders.html">طلبات الأسعار</a> › المناقصات الحكومية', 'المناقصات الحكومية', 'المناقصات والممارسات والمزايدات الحكومية المنشورة على المنصة من المصادر الرسمية المفتوحة: بوابة التعاقدات العامة المصرية (etenders.gov.eg)، وهيئة الشراء الموحد، والشركات العامة وشركات قطاعي البترول والكهرباء؛ مقسّمة على محافظات مصر الـ27، مع الجهة والنشاط والمواعيد.', '<a class="btn btn-gold" href="register.html#plans">🔔 فعّل تنبيهات المناقصات</a><a class="btn btn-line" style="background:#fff" href="agencies.html">الجهات الحكومية</a>')
PAGES['rfqs'] = ('طلبات عروض الأسعار – صنع في مصر', 'rfq', OL_CSS, _ol_body('r'), OL_JS.replace('%KIND%', 'r'))
HEROS['rfqs'] = ('m3.jpg', '<a href="rfqs.html">طلبات الأسعار</a> › طلبات عروض الأسعار', 'طلبات عروض الأسعار (RFQs)', 'طلبات الشراء الفعلية التي وصلت إلى المنصة من الشركات والمقاولين والجهات، مع القطاع والكمية وموعد الإغلاق.', '<a class="btn btn-gold" href="register.html#plans">📝 اشترك لتقديم العروض</a><a class="btn btn-line" style="background:#fff" href="contact.html#rfq-form">أرسل طلبك</a>')

en_add([("مناقصة مفتوحة الآن", "Open now"), ("تنتهي خلال 7 أيام", "Closing within 7 days"), ("بدون موعد إغلاق معلن", "Without a published deadline"), ("جهة طارحة معلنة الاسم", "Named issuing bodies"), ("غير محدد الموعد", "No deadline given"), ("ℹ️ بيانات التواصل الشخصية لأصحاب الطلبات مش بتتعرض على المنصة؛ الأعضاء من الباقة الأساسية بيسجّلوا عروضهم على الطلب من خلال المنصة. راجع", "ℹ️ Requesters' personal contact details are not shown on the platform; members from the Basic plan record their offers on a request through the platform. See")])
