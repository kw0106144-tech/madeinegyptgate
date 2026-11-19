# One news article page: article.html#<index in REAL.news>
PAGES['article'] = ('الخبر – صنع في مصر', 'media', COMMON_CSS + '''
.arh { position: relative; min-height: 340px; display: flex; align-items: flex-end; color: #fff; overflow: hidden; }
.arh .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.arh .bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(10,4,6,.92) 8%, rgba(10,4,6,.35) 60%, rgba(10,4,6,.15)); }
.arh .wrap { position: relative; width: 100%; box-sizing: border-box; padding-block: 34px 30px; }
.arh .crumb { font-size: .82rem; opacity: .85; } .arh .crumb a { color: #fff; }
.arh h1 { font-size: clamp(1.4rem, 3.2vw, 2.3rem); line-height: 1.45; max-width: 900px; margin-top: 10px; }
.arh .meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: .9rem; opacity: .9; }
.arg { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 22px; align-items: start; margin-block: 26px 40px; }
.arb { font-size: 1.08rem; line-height: 2.05; }
.arb .lead { font-size: 1.2rem; font-weight: 700; margin-bottom: 14px; }
.arb img { width: 100%; border-radius: 16px; margin-bottom: 16px; max-height: 460px; object-fit: cover; }
.ara { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
#arR a { display: grid; grid-template-columns: 84px 1fr; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); color: var(--fg); }
#arR a:last-child { border-bottom: 0; }
.rel img { width: 84px; height: 60px; object-fit: cover; border-radius: 10px; }
.rel b { font-size: .86rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.rel small { display: block; color: var(--muted); font-size: .74rem; }
@media (max-width: 900px) { .arg { grid-template-columns: 1fr; } }
''', '''
<section class="arh"><span class="bg" id="arBg" style="background-image:url(img/hero.jpg)"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="media-center.html">المركز الإعلامي</a> › <a href="news.html">الأخبار</a></nav><span class="chip chip-gold" id="arCat">خبر</span><h1 id="arT">الخبر</h1><div class="meta" id="arM"></div></div></section>
<main class="wrap" id="top"><div class="arg"><article class="card2 arb" id="arB"></article><aside class="card2 rel"><h2 style="font-size:1.05rem;margin-bottom:8px">أخبار ذات صلة</h2><div id="arR"></div><a class="btn btn-line" style="width:100%;justify-content:center;margin-top:12px" href="news.html">كل الأخبار ←</a></aside></div></main>
''', r'''
var EN = window.MIGLANG === "en", N = (window.REAL && REAL.news) || [], id = (function (h) { return /^n-[2-9a-hjkmnp-z]{8}$/.test(h) && window.MIGOVL ? MIGOVL.idx("news", h) : parseInt(h, 10); })((location.hash || "").slice(1)), n = N[id];
var FB = ["img/e0.jpg", "img/m1.jpg", "img/m4.jpg", "img/e2.jpg", "img/m3.jpg", "img/m0.jpg"];
function esc(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dA(d) { try { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(/^\d{4}-\d\d-\d\d$/.test(d) ? d + "T12:00:00" : d)); } catch (e) { return d || ""; } }
function img(x, i) { return x.image_file || FB[i % FB.length]; }
/* procurement news («أخبار المشتريات») only for the plans that have it (Premium and up — data/plan.js newsOK): the others see a lock box */
var NOK = function (x) { return !window.MIGPLAN || !MIGPLAN.newsOK || MIGPLAN.newsOK(x); };
if (!n) { $("#arB").innerHTML = '<p>لم يُعثر على الخبر. <a href="news.html">كل الأخبار ←</a></p>'; }
else if (!NOK(n)) {
  $("#arT").textContent = "أخبار المشتريات"; $("#arCat").textContent = "أخبار المشتريات"; $("#arM").innerHTML = "";
  $("#arB").innerHTML = MIGPLAN.lockHTML("procurement", EN ? "Procurement news is for members from the Premium plan up" : "أخبار المشتريات للمشتركين من الباقة المميزة وطالع");
  $("#arR").innerHTML = N.map(function (x, i) { return [x, i]; }).filter(function (a) { return a[1] !== id && NOK(a[0]); }).slice(0, 6).map(function (a) { return '<a href="article.html#' + a[1] + '"><img src="' + img(a[0], a[1]) + '" alt="" loading="lazy"><span><b>' + esc(a[0].title_ar) + '</b><small>' + esc(dA(a[0].date)) + '</small></span></a>'; }).join("");
  window.addEventListener("mig:plan", function () { if (NOK(n)) location.reload(); });
}
else {
  document.title = n.title_ar + " – أخبار الصناعة | صنع في مصر";
  if (window.MIGINQ) MIGINQ.ctx({ type: "news", id: String(id), title: n.title_ar, url: "article.html#" + id, follow: false });
  $("#arT").textContent = n.title_ar; $("#arCat").textContent = n.category_ar || "خبر";
  $("#arBg").style.backgroundImage = "url(" + img(n, id) + ")";
  $("#arM").innerHTML = '<span>📅 ' + esc(dA(n.date)) + '</span><span>📰 ' + esc(n.source_name || "") + '</span>' + (n.region_code && window.MIGREG ? '<span>📍 ' + esc(MIGREG.name(n.region_code)) + '</span>' : '');
  $("#arB").innerHTML = (n.image_file ? '<img src="' + n.image_file + '" alt="">' : '') + '<p class="lead">' + esc(n.title_ar) + '</p><p>' + esc(n.summary_ar || "") + '</p>'
    + '<div class="ara">' + (n.url ? '<a class="btn btn-green" href="' + esc(n.url) + '" target="_blank" rel="noopener">اقرأ الخبر كاملاً من المصدر ↗</a>' : '') + '<button class="btn btn-line" type="button" id="arShare">🔗 نسخ رابط الخبر</button><a class="btn btn-line" href="https://wa.me/?text=' + encodeURIComponent(n.title_ar + " " + location.href) + '" target="_blank" rel="noopener">مشاركة عبر واتساب</a></div>'
    + '<p class="muted" style="font-size:.82rem;margin-top:14px"><span>' + (EN ? 'Source:' : 'المصدر:') + '</span> <span>' + esc(n.source_name || "") + '</span>. <span>' + (EN ? 'News is published in brief with a link to its original source.' : 'تُنشر الأخبار بإيجاز مع الإحالة إلى مصدرها الأصلي.') + '</span></p>';
  $("#arShare").onclick = function () { try { navigator.clipboard.writeText(location.href); } catch (x) {} this.textContent = "✓ تم نسخ الرابط"; };
  var rel = N.map(function (x, i) { return [x, i]; }).filter(function (a) { return a[1] !== id && a[0].category_ar === n.category_ar && NOK(a[0]); }).slice(0, 6);
  var have = rel.map(function (r) { return r[1]; });
  if (rel.length < 4) rel = rel.concat(N.map(function (x, i) { return [x, i]; }).filter(function (a) { return a[1] !== id && have.indexOf(a[1]) < 0 && NOK(a[0]); }).slice(0, 6 - rel.length));
  $("#arR").innerHTML = rel.map(function (a) { return '<a href="article.html#' + a[1] + '"><img src="' + img(a[0], a[1]) + '" alt="" loading="lazy"><span><b>' + esc(a[0].title_ar) + '</b><small>' + esc(dA(a[0].date)) + '</small></span></a>'; }).join("");
  window.__seoDone = 1; setTimeout(function () { if (!window.MIGSEO) return; var AR = /[\u0600-\u06FF]/, tT = EN && window.MIGTR ? MIGTR(n.title_ar) : n.title_ar, dS = n.summary_ar || n.title_ar; if (EN && window.MIGTR) { dS = MIGTR(dS); if (AR.test(dS)) dS = AR.test(tT) ? document.title : tT; } MIGSEO(document.title, dS.slice(0, 155), { "@context": "https://schema.org", "@type": "NewsArticle", headline: tT, datePublished: n.date, image: n.image_file ? [location.origin + "/" + n.image_file] : undefined, publisher: { "@type": "Organization", name: "منصة صنع في مصر" }, isBasedOn: n.url }); }, 0);
}
window.addEventListener("hashchange", function () { location.reload(); });
''')
