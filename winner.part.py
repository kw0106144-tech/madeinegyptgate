# Winning company profile: winner.html#<index in REAL.awards> — members only (gated by the 'awards' feature; visitors go to registration).
PAGES['winner'] = ('ملف الشركة الفائزة – صنع في مصر', 'rfq', COMMON_CSS + '''
.wnh { position: relative; min-height: 300px; display: flex; align-items: flex-end; color: #fff; overflow: hidden; }
.wnh .bg { position: absolute; inset: 0; background: url(img/m3.jpg) center/cover; }
.wnh .bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(20,4,8,.94) 8%, rgba(20,4,8,.4)); }
.wnh .wrap { position: relative; padding-block: 30px 26px; width: 100%; }
.wnh .crumb { font-size: .82rem; opacity: .85; } .wnh .crumb a { color: #fff; }
.wnh h1 { font-size: clamp(1.5rem, 3.4vw, 2.4rem); margin-top: 8px; }
.wnh .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; } .wnh .chips span { background: rgba(255,255,255,.16); border-radius: 999px; padding: 5px 13px; font-size: .84rem; font-weight: 700; }
.wng { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; margin-block: 24px 40px; }
.wng h2 { font-size: 1.12rem; margin-bottom: 10px; }
.wnaw { border: 2px solid var(--green); border-radius: 16px; padding: 16px; background: var(--surface); }
.wnaw h3 { font-size: 1.05rem; line-height: 1.6; }
.wnkv { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font-size: .9rem; margin: 12px 0 0; } .wnkv dt { color: var(--muted); } .wnkv dd { margin: 0; font-weight: 700; }
.wnl a, .wnl div { display: flex; flex-direction: column; gap: 4px; padding: 11px 0; border-bottom: 1px solid var(--line); color: var(--fg); } .wnl > :last-child { border-bottom: 0; }
.wnl small { color: var(--muted); font-size: .8rem; display: flex; gap: 10px; flex-wrap: wrap; }
.wnside { display: flex; flex-direction: column; gap: 14px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 86px); }
.wnside .btn { width: 100%; justify-content: center; margin-top: 8px; }
.wnst { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .wnst div { background: var(--bg2, #f6f1f2); border-radius: 12px; padding: 10px; } .wnst b { display: block; font-size: 1.25rem; color: var(--green); } .wnst span { font-size: .78rem; color: var(--muted); font-weight: 700; }
@media (max-width: 900px) { .wng { grid-template-columns: 1fr; } .wnside { position: static; } }
''', '''
<section class="wnh"><span class="bg"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › <a href="winners.html">الشركات الفائزة</a> › <span id="wnCr">الشركة</span></nav><span class="chip chip-gold">🏆 شركة فائزة</span><h1 id="wnT">الشركة الفائزة</h1><div class="chips" id="wnC"></div></div></section>
<main class="wrap" id="top"><div class="wng"><div style="display:flex;flex-direction:column;gap:18px;min-width:0" id="wnM"></div><aside class="wnside" id="wnA"></aside></div></main>
''', r'''
var A = (window.REAL && REAL.awards) || [], id = (function (h) { return /^a-[2-9a-hjkmnp-z]{8}$/.test(h) && window.MIGOVL ? MIGOVL.idx("award", h) : parseInt(h, 10); })((location.hash || "").slice(1)), a = A[id], R = window.MIGREG;
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dA(d) { try { return new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T00:00:00")); } catch (e) { return d || ""; } }
function val(x) { if (x.value_egp_million) return Math.round(x.value_egp_million * 1e6).toLocaleString("en-US") + " <span>جنيه</span>"; if (x.value_usd_million) return x.value_usd_million.toLocaleString("en-US") + " <span>مليون دولار</span>"; if (x.value_eur_million) return x.value_eur_million.toLocaleString("en-US") + " <span>مليون يورو</span>"; return "غير معلنة"; }
/* award counts: English picks singular/plural itself (the dictionary has one form only) */
function nAw(n) { return window.MIGLANG === "en" ? n + (n === 1 ? " award" : " awards") : n + " ترسية"; }
function NN(t) { return String(t || "").replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim(); }
function place(x) { var g = R && x.region_code ? R.name(x.region_code) : ""; return g + (x.city && x.city !== g && x.city !== g.replace(/^محافظة /, "") ? (g ? " – " : "") + x.city : ""); }
if (!a) { $("#wnM").innerHTML = '<div class="card2">لم يُعثر على الترسية. <a href="winners.html">كل الشركات الفائزة ←</a></div>'; }
else {
  var name = a.winner_ar || "الشركة الفائزة", key = NN(name.split(/[(،]/)[0]);
  var mine = A.map(function (x, i) { return [x, i]; }).filter(function (p) { return NN(String(p[0].winner_ar || "").split(/[(،]/)[0]) === key; }).sort(function (p, q) { return (q[0].date || "") > (p[0].date || "") ? 1 : -1; });
  var egp = mine.reduce(function (s, p) { return s + (p[0].value_egp_million || 0); }, 0), usd = mine.reduce(function (s, p) { return s + (p[0].value_usd_million || 0); }, 0);
  var ents = {}; mine.forEach(function (p) { var e = p[0].awarding_entity_ar; if (e) ents[e] = (ents[e] || 0) + 1; });
  var govs = {}; mine.forEach(function (p) { if (p[0].region_code) govs[p[0].region_code] = 1; });
  document.title = name + " – الشركات الفائزة | صنع في مصر";
  $("#wnT").textContent = name; $("#wnCr").textContent = name;
  $("#wnC").innerHTML = '<span>🏆 ' + nAw(mine.length) + '</span>' + Object.keys(govs).slice(0, 4).map(function (g) { return '<span>📍 ' + esc(R ? R.name(g) : g) + '</span>'; }).join("");
  $("#wnM").innerHTML = '<div class="wnaw"><span class="chip chip-gold">الترسية المختارة</span><h3 style="margin-top:8px">' + esc(a.title_ar) + '</h3><dl class="wnkv"><dt>الجهة المُرسية</dt><dd>' + esc(a.awarding_entity_ar || "جهة غير معلنة") + '</dd><dt>المحافظة</dt><dd>' + (a.region_code ? '<a href="region.html#' + a.region_code + '">' + esc(place(a)) + '</a>' : esc(a.city || "—")) + '</dd><dt>القيمة</dt><dd class="num">' + val(a) + '</dd><dt>تاريخ الترسية</dt><dd>' + esc(dA(a.date)) + '</dd></dl>' + (a.source_url ? '<a class="btn btn-line btn-sm" style="margin-top:12px" href="' + esc(a.source_url) + '" target="_blank" rel="noopener">مصدر الخبر ↗</a>' : '') + '</div>'
    + '<div class="card2"><h2><span>كل ترسيات</span> ' + esc(name) + '</h2><div class="wnl">' + mine.map(function (p) { var x = p[0]; return (p[1] === id ? '<div>' : '<a href="winner.html#' + p[1] + '">') + '<b>' + esc(x.title_ar) + '</b><small><span>🏛️ ' + esc(x.awarding_entity_ar || "جهة غير معلنة") + '</span><span>📍 ' + esc(place(x)) + '</span><span>💰 ' + val(x) + '</span><span>📅 ' + esc(dA(x.date)) + '</span></small>' + (p[1] === id ? '</div>' : '</a>'); }).join("") + '</div></div>'
    + (Object.keys(ents).length ? '<div class="card2"><h2>الجهات المتعاملة مع الشركة</h2><div class="wnl">' + Object.keys(ents).sort(function (p, q) { return ents[q] - ents[p]; }).map(function (e) { return '<div><b>' + esc(e) + '</b><small><span>' + nAw(ents[e]) + '</span></small></div>'; }).join("") + '</div></div>' : '');
  $("#wnA").innerHTML = '<div class="card2"><h2 style="font-size:1.02rem">ملخص الشركة</h2><div class="wnst"><div><b class="num">' + mine.length + '</b><span>' + (window.MIGLANG === "en" ? (mine.length === 1 ? "announced award" : "announced awards") : "ترسية معلنة") + '</span></div>' + (Object.keys(ents).length ? '<div><b class="num">' + Object.keys(ents).length + '</b><span>جهة مُرسية</span></div>' : '') + (egp ? '<div style="grid-column:1/-1"><b class="num">' + Math.round(egp * 1e6).toLocaleString("en-US") + '</b><span>إجمالي القيم بالجنيه</span></div>' : '') + (usd ? '<div style="grid-column:1/-1"><b class="num">' + usd.toLocaleString("en-US") + ' مليون $</b><span>إجمالي القيم بالدولار</span></div>' : '') + '</div>'
    + '<button class="btn btn-green" type="button" id="wnRfq">📝 اعرض منتجاتك على الشركة</button><button class="mig-fbtn" type="button" data-follow-kind="search" data-follow-id="' + esc(String(name).slice(0, 150)) + '" data-follow-label="' + esc(name) + '" data-follow-url="winner.html#' + id + '" data-follow-text="تابع ترسيات الشركة">☆ تابع ترسيات الشركة</button><a class="btn btn-line" href="winners.html">كل الشركات الفائزة</a><a class="btn btn-line" href="agencies.html">الجهات الحكومية</a></div>'
    + '<div class="card2"><p class="muted" style="font-size:.84rem">الترسيات منشورة من مصادرها الرسمية والإعلامية؛ المنصة جهة إعلامية ولا تُرسي العقود.</p></div>';
  /* the winning company is not a platform member: the platform never writes to it on anyone's behalf (anti-spam / no consent).
     The supplier records its interest (lead_interest) and is notified automatically of this company's new awards; MIG_CTX for Janna */
  var EN = window.MIGLANG === "en";
  /* follow = a saved search on the company's name: the daily digest then reports its new awards (worker/src/digest.js "search") */
  if (window.MIGINQ) MIGINQ.ctx({ type: "company", id: "w" + id, title: name, url: "winner.html#" + id, follow: { kind: "search", id: String(name).replace(/["<>&]/g, "").slice(0, 150), label: name, url: "winner.html#" + id } });
  $("#wnRfq").addEventListener("click", function () {
    if (!window.MIGINQ) { toast(EN ? "The sending service did not load. Please reload the page." : "خدمة الإرسال ماتحمّلتش. حدّث الصفحة."); return; }
    var IN = !!(window.MIGAPI && MIGAPI.token());
    MIGINQ.dialog({ kind: "lead_interest", target_type: "company", target_id: "w" + id, target_name: name, title: (EN ? "Offer your products to " : "اعرض منتجاتك على ") + name,
      /* "you follow its new awards" is made true here: a saved search on the company's name (the server's own auto-follow is by id only) */
      onOk: function () { if (IN) MIGAPI.follow("search", String(name).replace(/["<>&]/g, "").slice(0, 150), name, "winner.html#" + id).catch(function () {}); },
      /* lead_interest: the server records it and, for a signed-in member, follows the company (inquiries.js auto-follow) — said only then */
      intro: MIGINQ.esc(window.MIGAPI && MIGAPI.token() ? (EN ? "This company is not a registered member of the platform, so the platform will not send it your message. Your interest and products are recorded in your account and you follow its new awards automatically." : "الشركة دي مش عضو مسجّل على المنصة، فالمنصة مش هتبعتلها رسالتك. اهتمامك ومنتجاتك بيتسجّلوا في حسابك، وبتتابع ترسياتها الجديدة تلقائياً.") : (EN ? "This company is not a registered member of the platform, so the platform will not send it your message. Your interest and products are recorded under a tracking number." : "الشركة دي مش عضو مسجّل على المنصة، فالمنصة مش هتبعتلها رسالتك. اهتمامك ومنتجاتك بيتسجّلوا برقم متابعة.")),
      fields: [{ k: "products", label: EN ? "Your products *" : "منتجاتك *", req: 1, full: 1 }], message: { label: EN ? "Notes" : "ملاحظات" }, payload: { award: a.title_ar || "", awarding_entity: a.awarding_entity_ar || "" }, submit: EN ? "Record my interest" : "سجّل اهتمامي" });
  });
  window.__seoDone = 1; setTimeout(function () { if (window.MIGSEO) MIGSEO(document.title, (name + ": " + a.title_ar).slice(0, 155), { "@context": "https://schema.org", "@type": "Organization", name: name, address: { "@type": "PostalAddress", addressCountry: "EG" } }); }, 0);
}
window.addEventListener("hashchange", function () { location.reload(); });
''')

en_add([("تابع ترسيات الشركة", "Follow the company's awards")])

# ---- Phase A (forms & honesty pass): winner.part.py is the last page file site.py runs before building PAGES, so every page
# gets the shared clients (data/mig-api.js + data/mig-forms.js; both are safe to load twice) and the English entries for the new
# static Arabic strings (EN_NEW, see pages.part.py) merged into the i18n dictionary before the page is translated.
for _k in list(PAGES.keys()):
    _t = PAGES[_k]
    PAGES[_k] = (_t[0], _t[1], _t[2], _t[3] + MIG_SCRIPTS, EN_JS() + (_t[4] or ''))
