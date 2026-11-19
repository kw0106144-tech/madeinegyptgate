# Member company profile page: company.html#<index in MIGOLDFAC> (factories & suppliers registered on the platform)
PAGES['company'] = ('ملف المصنع – صنع في مصر', 'factories', COMMON_CSS + '''
.cph .lgx { width: 112px; height: 112px; border-radius: 22px; background: #fff; box-shadow: 0 14px 30px -14px rgba(0,0,0,.6); display: grid; place-items: center; overflow: hidden; flex: none; border: 3px solid #fff; }
.cph .lgx i { display: block; width: 100%; height: 100%; background-size: 1000% 1000%; background-repeat: no-repeat; }
.cph .lgx b { font-size: 2.6rem; color: var(--green); }
.cph .row { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.cph .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.cph .chips span { background: rgba(255,255,255,.16); color: #fff; border-radius: 999px; padding: 4px 12px; font-size: .82rem; font-weight: 700; }
.cpg { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
.cpg .card2 h2 { font-size: 1.12rem; margin-bottom: 10px; }
.cpg .desc { line-height: 1.95; font-size: .98rem; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.pgrid .pi { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); display: flex; flex-direction: column; color: var(--fg); }
.pgrid .pi .im { aspect-ratio: 1; background-size: cover; background-position: center; background-color: #fff; }
.pgrid .pi .im.sp { background-size: 1000% 1000%; background-repeat: no-repeat; }
.pgrid .pi .im.lgf { display: grid; place-items: center; background: #fff; border-bottom: 1px solid var(--line); }
.pgrid .pi .im.lgf i { display: block; width: 58%; aspect-ratio: 1; background-size: 1000% 1000%; background-repeat: no-repeat; }
.pgrid .pi b { padding: 8px 10px 10px; font-size: .84rem; line-height: 1.5; }
.cpf { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0; font-size: .9rem; }
.cpf dt { color: var(--muted); } .cpf dd { margin: 0; font-weight: 700; }
.cpa { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.cpa .btn { width: 100%; justify-content: center; }
.sim { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.sim a { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: var(--surface); color: var(--fg); transition: border-color .2s ease, transform .2s ease; }
.sim a:hover { border-color: var(--green); transform: translateY(-2px); }
.sim .l { width: 52px; height: 52px; border-radius: 10px; flex: none; background-size: 1000% 1000%; background-repeat: no-repeat; background-color: #fff; border: 1px solid var(--line); display: grid; place-items: center; font-weight: 900; color: var(--green); }
.sim b { font-size: .86rem; line-height: 1.45; display: block; } .sim small { color: var(--muted); font-size: .76rem; }
.vbadge { display: inline-flex; gap: 6px; align-items: center; background: var(--green-soft, #e8f5ee); color: var(--green); border-radius: 999px; padding: 4px 12px; font-weight: 800; font-size: .82rem; }
@media (max-width: 900px) { .cpg { grid-template-columns: 1fr; } .cph .lgx { width: 84px; height: 84px; } }
''', '''
<section class="phero cph"><span class="bg" id="cpBg" style="background-image:url(img/m0.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="factories.html">دليل المصانع</a></nav>
  <div class="row"><span class="lgx" id="cpLg"><b>م</b></span><div style="min-width:0"><h1 id="cpT" style="margin:0">ملف المصنع</h1><div class="chips" id="cpC"></div></div></div>
</div></section>
<main class="wrap pbody2" id="top"><div id="cpD"></div></main>
''', r'''
var F = window.MIGOLDFAC || [], H = (location.hash || "").slice(1);
/* deploy 2: an added company (Control Center) is addressed by its stable id company.html#c-xxxxxxxx */
if (/^c-[2-9a-hjkmnp-z]{8}$/.test(H) && window.MIGOVL) { var CI = MIGOVL.idx("fac", H); H = CI >= 0 ? String(CI) : ""; }
/* a link shared before the directory clean-up (74 duplicate listings merged): company.html#o<old index> → the record it became */
if (/^o\d+$/.test(H) && window.MIGOLDFAC_MAP) { var NW = MIGOLDFAC_MAP[+H.slice(1)]; H = NW >= 0 ? String(NW) : ""; try { history.replaceState(null, "", H ? "#" + H : location.pathname); } catch (x) {} }
var XF = /^x\d+$/.test(H), id = XF ? -1 : parseInt(H, 10), o = F[id];
if (o && !o[8] && window.MIGOLDFACD) { o = o.slice(); o[8] = MIGOLDFACD[id] || ""; }
/* researched factories (data/facx.js): company.html#x<index> */
if (XF && window.MIGFACX) { var xf = MIGFACX.list[+H.slice(1)]; if (xf) { var xw = xf[9] ? "https://" + String(xf[9]).replace(/^https?:\/\//, "") : (xf[8] || ""); o = [xf[0], xf[1], xf[2], xf[3], xf[5], -1, 0, xw, xf[4], MIGFACX.fp[xf[0]] || [], (window.MIGREG && MIGREG.of(xf[2])) || ""]; } }
function gvn(c) { return c && window.MIGREG && MIGREG.by[c] ? MIGREG.name(c) : ""; }
var ENc = window.MIGLANG === "en", TRc = function (t) { return ENc && window.MIGTR ? String(MIGTR(t) || t) : t; };
''' + MIG_VFX_JS + r'''
var VF = XF && o ? VFX(o[0]) : false; /* one of the 91 companies verified by the platform team */
var COVER = [["الغذائية", "m2"], ["الأغذية", "m2"], ["مواد البناء", "m3"], ["الأسمنت", "m3"], ["الحديد", "m4"], ["الألمنيوم", "m4"], ["المعادن", "m4"], ["البتروكيماويات", "m1"], ["الكيماويات", "m1"], ["النفط", "m1"], ["الأدوية", "e1"], ["الطبية", "e1"], ["الكهرباء", "e2"], ["التكييف", "e2"], ["الإلكترونيات", "e2"], ["البلاستيك", "m3"], ["الأثاث", "m0"], ["الزجاج", "m0"]];
function cover(s) { for (var i = 0; i < COVER.length; i++) if ((s || "").indexOf(COVER[i][0]) > -1) return COVER[i][1]; return "e3"; }
function pos(c) { return (c % 10) * 100 / 9 + "% " + Math.floor(c / 10) * 100 / 9 + "%"; }
function lgStyle(x) { var u = window.MIGOVL && MIGOVL.logo(x); if (u) return MIGOVL.bg(u); return x[5] >= 0 ? "background-image:url(img/old/lg" + x[5] + ".jpg);background-position:" + pos(x[6]) : ""; }
function esc(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
if (!o) { $("#cpD").innerHTML = '<div class="card2">لم يُعثر على المنشأة. <a href="factories.html">ارجع إلى دليل المصانع ←</a></div>'; }
else {
  var em = gvn(o[10]), city = o[2] || em || "جمهورية مصر العربية";
  /* 224 members carry only the country as their location: say so instead of presenting it as an address */
  if (city === "جمهورية مصر العربية" && !em) city = "مصر — المحافظة غير محددة";
  /* «بيانات غير مكتملة»: what the record is missing (data/regions.js MIGINC, flags in MIGOLDFAC[11]) */
  var INC = window.MIGINC && !XF ? MIGINC.list(o[11]) : [];
  document.title = o[0] + " – دليل المصانع | صنع في مصر";
  $("#cpT").textContent = o[0];
  $("#cpBg").style.backgroundImage = "url(img/" + cover(o[1]) + ".jpg)";
  $("#cpLg").innerHTML = (o[5] >= 0 || (window.MIGOVL && MIGOVL.logo(o))) ? '<i role="img" aria-label="' + esc(ENc ? "Logo of " + TRc(o[0]) : "شعار " + o[0]) + '" style="' + lgStyle(o) + '"></i>' : '<b>' + esc(o[0].replace(/^(مصنع|شركة|الشركة|مؤسسة)\s+/, "").charAt(0)) + '</b>';
  $("#cpC").innerHTML = '<span>🏷️ ' + esc(o[1]) + '</span><span>' + (o[3] === "مصنع" ? "🏭 مصنع" : "🏢 " + esc(o[3])) + '</span><span>📍 ' + esc(city) + '</span><span>' + (VF ? '✓ موثّق من فريق المنصة' : XF ? '📚 بيانات من مصادر عامة' : '📇 مدرجة في دليل المنصة') + '</span>';
  /* product photos: match the member's product names with the platform's product listings */
  var PIMG = {}; (window.MIGOLDP || []).forEach(function (p) { if (p[3] >= 0 && !PIMG[p[0]]) PIMG[p[0]] = p; });
  var own = (window.MIGOLDP || []).map(function (p, i) { return [p, i]; }).filter(function (a) { return window.MIGP2F && MIGP2F[a[1]] && MIGP2F[a[1]] === o[7] && a[0][3] >= 0; });
  var prods = own.length ? own.map(function (a) { return [a[0][0], a[0]]; }) : (o[9] || []).map(function (n) { var p = PIMG[n], k; if (!p) for (k in PIMG) { if (k.indexOf(n) > -1 || n.indexOf(k) > -1) { p = PIMG[k]; break; } } return [n, p]; });
  var cv = cover(o[1]);
  var pHtml = prods.length ? '<div class="pgrid">' + prods.map(function (x) { var p = x[1]; return '<a class="pi" href="market.html" data-q="' + esc(x[0]) + '"><span class="im' + (p ? ' sp" style="background-image:url(img/old/pr' + p[3] + '.jpg);background-position:' + pos(p[4]) + '"' : o[5] >= 0 ? ' lgf"><i style="' + lgStyle(o) + '"></i' : '" style="background-image:url(img/' + cv + '.jpg)"') + '></span><b dir="auto">' + esc(x[0]) + '</b></a>'; }).join("") + '</div>' : '<p class="muted">تُضاف منتجات المنشأة من لوحة المصنع.</p>';
  var sim = F.map(function (x, i) { return [x, i]; }).filter(function (a) { return a[1] !== id && a[0][1] === o[1]; }).sort(function (a, b) { return (b[0][5] >= 0) - (a[0][5] >= 0); }).slice(0, 8);
  var sHtml = sim.length ? '<div class="sim">' + sim.map(function (a) { var x = a[0]; return '<a href="company.html#' + a[1] + '"><span class="l" style="' + lgStyle(x) + '">' + (x[5] >= 0 ? "" : esc(x[0].charAt(0))) + '</span><span style="min-width:0"><b>' + esc(x[0]) + '</b><small>' + esc(x[2] || gvn(x[10])) + '</small></span></a>'; }).join("") + '</div>' : '';
  $("#cpD").innerHTML = '<div class="cpg"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">'
    + '<div class="card2"><h2>عن المنشأة</h2><p class="desc" dir="auto">' + esc(o[8] || "منشأة مسجّلة في منصة صنع في مصر.") + '</p></div>'
    + '<div class="card2"><h2>المنتجات والخدمات</h2>' + pHtml + '</div>'
    + (sHtml ? '<div class="card2"><h2>منشآت في نفس القطاع</h2>' + sHtml + '</div>' : '')
    + '</div><aside style="display:flex;flex-direction:column;gap:14px">'
    + '<div class="card2"><span class="vbadge">' + (VF ? "✓ موثّق من فريق المنصة" : XF ? "📚 مصنع مصري – غير مسجّل بعد" : "📇 مدرجة في دليل المنصة") + '</span><dl class="cpf" style="margin-top:12px"><dt>القطاع</dt><dd>' + esc(o[1]) + '</dd><dt>النوع</dt><dd>' + esc(o[3]) + '</dd><dt>الموقع</dt><dd>' + esc(city) + '</dd>' + (em ? '<dt>المحافظة</dt><dd><a href="region.html#' + o[10] + '">' + em + '</a></dd>' : '') + ((o[9] || []).length ? '<dt>المنتجات</dt><dd>' + (o[9] || []).length + '</dd>' : '') + '</dl>' + (INC.length ? '<small class="muted" style="display:block;margin-top:10px">⚠️ ' + esc(MIGINC.label + ": " + INC.join("، ")) + '</small>' : '')
    + '<div class="cpa"><a class="btn btn-green" href="contact.html#rfq-form" id="cpRfq">📝 اطلب عرض سعر من المنشأة</a><button class="btn btn-line" type="button" id="cpMsg">✉️ راسل المنشأة عبر المنصة</button><button class="mig-fbtn" type="button" id="cpFol" data-follow-kind="company" data-follow-id="' + esc(H) + '" data-follow-label="' + esc(o[0]) + '" data-follow-url="company.html#' + esc(H) + '" data-follow-text="تابع المنشأة">☆ تابع المنشأة</button>' + (o[7] ? '<a class="btn btn-line" href="' + esc(o[7]) + '" target="_blank" rel="noopener">' + (XF ? 'الموقع الرسمي للشركة ↗' : 'الصفحة على موقع المنصة ↗') + '</a>' : '') + (!XF && o[17] && window.MIGOVL && MIGOVL.okUrl(o[17]) ? '<a class="btn btn-line" href="' + esc(o[17]) + '" target="_blank" rel="noopener nofollow">الموقع الرسمي للشركة ↗</a>' : '') + '<button class="btn btn-line" type="button" id="cpShare">🔗 نسخ رابط الملف</button></div></div>'
    + '<div class="card2"><h2>هل هذه منشأتك؟</h2><p class="muted" style="font-size:.88rem">سجّل منشأتك على المنصة (الباقة الأساسية فأعلى) علشان طلبات المشترين المطابقة توصلك تلقائياً، وحدّث بياناتك ومنتجاتك.</p><a class="btn btn-gold" style="width:100%;justify-content:center;margin-top:8px" href="register.html#plans">سجّل منشأتك</a><button class="btn btn-line btn-sm" type="button" id="cpFix" style="width:100%;justify-content:center;margin-top:8px">✏️ بلّغ عن تصحيح في البيانات</button></div>'
    + '</aside></div>';
  /* the RFQ form on contact.html reads this target (type, id, name) and sends it with the request; MIG_CTX tells Janna and the follow/beacon code which company is on screen */
  var TGT = { type: "company", id: H, name: o[0], url: "company.html#" + H }, EN = window.MIGLANG === "en";
  if (window.MIGINQ) MIGINQ.ctx({ type: "company", id: H, title: o[0], url: "company.html#" + H });
  $("#cpRfq").addEventListener("click", function () { if (window.MIGINQ) MIGINQ.setTarget(TGT); else try { sessionStorage.setItem("mig-rfq-to", JSON.stringify(TGT)); } catch (x) {} });
  $("#cpMsg").addEventListener("click", function () {
    if (!window.MIGINQ) { toast(EN ? "The sending service did not load. Please reload the page." : "خدمة الإرسال ماتحمّلتش. حدّث الصفحة."); return; }
    MIGINQ.dialog({ kind: "contact", target_type: "company", target_id: H, target_name: o[0], title: (EN ? "Message " : "راسل ") + o[0], consentKind: "contact_factory", needPhone: true,
      intro: MIGINQ.esc(EN ? "If this company is a registered member, your message reaches it automatically by e-mail (and WhatsApp if it opted in) and its reply is forwarded to you. If it is not registered, the platform does not contact it on your behalf — you are told honestly." : "لو المنشأة دي عضو مسجّل على المنصة، رسالتك بتوصلها تلقائياً بالإيميل (والواتساب لو مفعّلاه) وردها بيتبعتلك. لو مش مسجّلة، المنصة مش بتراسلها نيابةً عنك — وهتعرف ده بوضوح."),
      message: { label: EN ? "Your message *" : "رسالتك *", req: true }, payload: { sector: o[1], governorate: o[10] || "" }, submit: EN ? "Send" : "إرسال" });
  });
  $("#cpFix").addEventListener("click", function () {
    if (!window.MIGINQ) return;
    MIGINQ.dialog({ kind: "profile_fix", target_type: "company", target_id: H, target_name: o[0], title: EN ? "Report a data correction" : "تصحيح بيانات المنشأة", message: { label: EN ? "What should be corrected, and the source *" : "إيه اللي محتاج يتصحّح، والمصدر *", req: true }, submit: EN ? "Send the correction" : "إرسال التصحيح" });
  });
  $("#cpShare").addEventListener("click", function () { var u = location.href; try { navigator.clipboard.writeText(u); } catch (x) {} this.textContent = "✓ تم نسخ الرابط"; });
  document.addEventListener("click", function (e) { var a = e.target.closest(".pi[data-q]"); if (a) try { sessionStorage.setItem("mig-q", a.dataset.q); } catch (x) {} });
  window.__seoDone = 1; setTimeout(function () { if (!window.MIGSEO) return; var dsc = o[8] || o[0]; if (ENc) { var td = TRc(o[8] || ""); dsc = td && !/[\u0600-\u06FF]/.test(td) ? td : TRc(o[0]) + " – " + TRc(o[1]) + " · " + TRc(city) + ". Company profile in the Made in Egypt Gate directory."; }
    MIGSEO(document.title, dsc.slice(0, 155), { "@context": "https://schema.org", "@type": "Organization", name: o[0], address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "EG" } }); }, 0);
}
window.addEventListener("hashchange", function () { location.reload(); window.scrollTo(0, 0); });
''')

en_add([("مصر — المحافظة غير محددة", "Egypt — governorate not specified"), ("مدرجة في دليل المنصة", "Listed in the platform directory"), ("راسل المنشأة عبر المنصة", "Message the company via the platform"), ("تابع المنشأة", "Follow the company"),
 ("سجّل منشأتك على المنصة (الباقة الأساسية فأعلى) علشان طلبات المشترين المطابقة توصلك تلقائياً، وحدّث بياناتك ومنتجاتك.", "Register your company on the platform (Basic plan or higher) so that matching buyer requests reach you automatically, and update your data and products."),
 ("سجّل منشأتك", "Register your company"), ("بلّغ عن تصحيح في البيانات", "Report a data correction")])
