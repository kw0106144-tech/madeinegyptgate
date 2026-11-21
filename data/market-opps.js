/* «فرص السوق» / "Market opportunities" — /market-opportunities/ (market-opportunities.part.py). ES5, no dependencies.
   The opportunities Janna's and Bassem's web searches found, published at once by the platform (owner 2026-11-20, «تظهر علطول»):
   GET /api/janna/opportunities?type=&market=&q=&page= (worker/src/web-public.js) → {items: [{id, type, title, entity?, product?, market,
   governorate?, governorate_en?, status: open|closing|closed|unknown|"", deadline?, official?, found}], total, page, pages, counts, open,
   markets} | {off: true}. Each card shows the opportunity itself and nothing about where it came from (owner: «ميكتبش مصدر اي معلومه»,
   «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه وخلاص»): the server sends no link, no site, no snippet, and this
   file shows no link but the platform's own. Every string from the server is escaped (esc) before it reaches the page.
   Honest states: a closed tender reads «منتهية» (never among the open ones, listed last by the server), an unknown deadline «ميعادها مش
   معروف»; nothing is shown as loaded without the server's answer (offline → an honest message and «حاول تاني»).
   «🎥 عايز التفاصيل» opens Janna's live call on this page (data/janna-live.js JANNA_LIVE.open); inside the call's shared screen it only
   says to ask her in the call. Texts: T(ar, en) (window.MIGLANG). Tests: worker/test/web-public.test.mjs (window.MIG_OPPS._t). */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIG_OPPS) return;
  function EN() { return W.MIGLANG === "en"; }
  function T(ar, en) { return EN() ? en : ar; }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var TYPES = ["tender", "rfq", "buyer", "buyer_list", "project", "news"];
  var TY = { tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "Request for quotation"], buyer: ["عميل محتمل", "Potential buyer"],
    buyer_list: ["قائمة مصانع ممكن تبقى عملاء", "Plants that could become buyers"], project: ["مشروع جديد", "New project"], news: ["خبر", "News"] };
  var MK = { eg: ["مصر", "Egypt"], sa: ["السعودية", "Saudi Arabia"], ae: ["الإمارات", "UAE"], kw: ["الكويت", "Kuwait"], qa: ["قطر", "Qatar"], om: ["عمان", "Oman"], bh: ["البحرين", "Bahrain"],
    jo: ["الأردن", "Jordan"], iq: ["العراق", "Iraq"], ly: ["ليبيا", "Libya"], sd: ["السودان", "Sudan"], ma: ["المغرب", "Morocco"], dz: ["الجزائر", "Algeria"], tn: ["تونس", "Tunisia"],
    ke: ["كينيا", "Kenya"], ng: ["نيجيريا", "Nigeria"], et: ["إثيوبيا", "Ethiopia"], za: ["جنوب أفريقيا", "South Africa"], cn: ["الصين", "China"], "in": ["الهند", "India"], tr: ["تركيا", "Turkey"],
    de: ["ألمانيا", "Germany"], it: ["إيطاليا", "Italy"], fr: ["فرنسا", "France"], es: ["إسبانيا", "Spain"], gb: ["بريطانيا", "UK"], us: ["أمريكا", "USA"], ru: ["روسيا", "Russia"],
    gulf: ["الخليج", "GCC"], arab: ["الدول العربية", "Arab countries"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
  function L2(m, k) { var v = own(m, k) ? m[k] : null; return v ? (EN() ? v[1] : v[0]) : ""; }
  function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")); }
  function fday(d) {
    if (!isDay(d)) return "";
    try { return new Intl.DateTimeFormat(EN() ? "en-GB" : "ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")); } catch (e) { return d; }
  }
  /* «فرصة واحدة / فرصتين / 3 فرص / 11 فرصة» */
  function arN(n) { return n === 1 ? "فرصة واحدة" : n === 2 ? "فرصتين" : n + (n >= 3 && n <= 10 ? " فرص" : " فرصة"); }
  function countText(total, open) {
    total = +total || 0; open = +open || 0;
    if (!total) return "";
    return T(arN(total) + (open ? "، والمفتوح منها من المناقصات وطلبات الأسعار: " + open : ""), total + (total === 1 ? " opportunity" : " opportunities") + (open ? " — open tenders and RFQs among them: " + open : ""));
  }
  function stText(it) {
    var d = isDay(it.deadline) ? fday(it.deadline) : "";
    if (it.status === "open") return T("مفتوحة", "Open") + (d ? T(" — آخر ميعاد ", " — deadline ") + d : "");
    if (it.status === "closing") return T("بتقفل قريب", "Closing soon") + (d ? " — " + d : "");
    if (it.status === "closed") return T("منتهية", "Closed") + (d ? T(" — آخر ميعاد كان ", " — the deadline was ") + d : "");
    if (it.status === "unknown") return T("ميعادها مش معروف", "Deadline not known");
    return "";
  }
  function placeOf(it) {
    var m = L2(MK, String(it.market || "")), g = EN() ? (it.governorate_en || "") : (it.governorate || "");
    return [m, g].filter(function (x) { return !!x; }).join(" — ");
  }
  /* one opportunity → its card (every server string escaped; no link but the platform's own call button) */
  function card(it) {
    it = it || {};
    var ty = own(TY, it.type) ? it.type : "", st = /^(open|closing|closed|unknown)$/.test(String(it.status || "")) ? it.status : "", id = Math.max(0, Math.floor(+it.id || 0));
    var title = String(it.title || "") || [L2(TY, ty), String(it.product || "")].filter(function (x) { return !!x; }).join(" — ");
    var h = '<article class="mo-c' + (st === "closed" ? " closed" : "") + '" id="o-' + id + '"><div class="mo-top">';
    if (ty) h += '<span class="mo-b ty">' + esc(L2(TY, ty)) + "</span>";
    if (it.official === true && (ty === "tender" || ty === "rfq")) h += '<span class="mo-b of">' + esc(T("رسمية", "Official")) + "</span>";
    if (st) h += '<span class="mo-b ' + st + '">' + esc(stText(it)) + "</span>";
    h += '</div><h3 dir="auto">' + esc(title) + "</h3>";
    var rows = [], place = placeOf(it);
    if (it.entity) rows.push([ty === "buyer" || ty === "buyer_list" ? T("الشركة", "Company") : ty === "tender" || ty === "rfq" ? T("الجهة", "Entity") : T("الجهة أو الشركة", "Entity or company"), String(it.entity)]);
    if (it.product) rows.push([T("المنتج", "Product"), String(it.product)]);
    if (place) rows.push([T("السوق", "Market"), place]);
    if (isDay(it.found)) rows.push([T("اتضافت", "Added"), fday(it.found)]);
    if (rows.length) h += '<dl class="mo-m">' + rows.map(function (r) { return "<dt>" + esc(r[0]) + '</dt><dd dir="auto">' + esc(r[1]) + "</dd>"; }).join("") + "</dl>";
    h += '<div class="mo-a"><button type="button" class="btn btn-green btn-sm" data-mo-ask="' + id + '">🎥 ' + esc(T("عايز التفاصيل", "Get the details")) + "</button></div>";
    return h + "</article>";
  }

  /* ---------- the page ---------- */
  var $L = D.getElementById("moL"), $C = D.getElementById("moC"), $T = D.getElementById("moT"), $M = D.getElementById("moM"), $Q = D.getElementById("moQ"), $F = D.getElementById("moF"), $P = D.getElementById("moP");
  W.MIG_OPPS = { _t: { card: card, countText: countText, stText: stText, placeOf: placeOf, esc: esc, arN: arN } };
  if (!$L) return;
  var S = { type: "", market: "", q: "", page: 1, items: [], busy: false, seq: 0, last: null };
  function api(path) {
    var A = W.MIGAPI;
    if (A && typeof A.request === "function") return A.request(path, { auth: false, timeout: 12000 });
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej({ code: "offline" }); return; }
      W.fetch(String(W.MIG_API_BASE || "/api").replace(/\/+$/, "") + path, { headers: { Accept: "application/json" }, credentials: "omit" }).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "offline" };
        return r.json().then(function (j) { if (!r.ok) throw { code: (j && j.code) || "error" }; return j; });
      }).then(res, function (e) { rej(e && e.code ? e : { code: "offline" }); });
    });
  }
  function qs() {
    var p = ["page=" + S.page];
    if (S.type) p.push("type=" + encodeURIComponent(S.type));
    if (S.market) p.push("market=" + encodeURIComponent(S.market));
    if (S.q) p.push("q=" + encodeURIComponent(S.q));
    return "?" + p.join("&");
  }
  function msg(html, cls) { $L.innerHTML = '<p class="mo-msg' + (cls ? " " + cls : "") + '" role="status">' + html + "</p>"; if ($P) $P.innerHTML = ""; }
  function paintTools(j) {
    var c = (j && j.counts) || {}, all = 0, k;
    for (k in c) if (own(c, k)) all += +c[k] || 0;
    if ($T) $T.innerHTML = [""].concat(TYPES.filter(function (t) { return +c[t] > 0 || S.type === t; })).map(function (t) {
      var n = t ? +c[t] || 0 : all;
      return '<button type="button" data-mo-type="' + esc(t) + '" aria-pressed="' + (S.type === t) + '">' + esc(t ? L2(TY, t) : T("الكل", "All")) + ' <span class="n">' + n + "</span></button>";
    }).join("");
    if ($M) {
      var ms = (j && j.markets) || [], h = '<option value="">' + esc(T("كل الأسواق", "All markets")) + "</option>", seen = false;
      for (var i = 0; i < ms.length; i++) { var code = String((ms[i] && ms[i].code) || ""); if (!/^[a-z]{2,8}$/.test(code)) continue; if (code === S.market) seen = true; h += '<option value="' + esc(code) + '"' + (code === S.market ? " selected" : "") + ">" + esc(L2(MK, code) || code.toUpperCase()) + "</option>"; }
      if (S.market && !seen) h += '<option value="' + esc(S.market) + '" selected>' + esc(L2(MK, S.market) || S.market.toUpperCase()) + "</option>";
      $M.innerHTML = h;
    }
    if ($C) $C.textContent = countText(j && j.total, j && j.open);
  }
  function paint(j, more) {
    S.last = j;
    if (j && j.off) {
      if ($T) $T.innerHTML = ""; if ($C) $C.textContent = "";
      msg(esc(T("صفحة «فرص السوق» مش متاحة دلوقتي. تقدر تشوف ", "The «Market opportunities» page is not available right now. You can see the ")) + '<a href="/tenders/">' + esc(T("المناقصات", "tenders")) + "</a>"
        + esc(T(" و", " and the ")) + '<a href="/rfq/">' + esc(T("طلبات الأسعار", "requests for quotation")) + "</a>" + esc(T(" على المنصة، أو تسأل جنة.", " on the platform, or ask Janna.")));
      return;
    }
    paintTools(j);
    var items = (j && j.items) || [];
    S.items = more ? S.items.concat(items) : items;
    if (!S.items.length) {
      msg(esc(S.type || S.market || S.q ? T("مفيش فرص بالشروط دي. جرّب كلمة تانية أو شيل الفلتر.", "No opportunities match. Try another word or clear the filter.")
        : T("لسه مفيش فرص هنا. اسأل جنة تدوّرلك على فرص لمنتجك دلوقتي.", "No opportunities here yet. Ask Janna to look for opportunities for your product now.")));
      return;
    }
    $L.innerHTML = S.items.map(card).join("");
    if ($P) $P.innerHTML = j && +j.page < +j.pages ? '<button type="button" class="btn btn-line" data-mo-more="1">' + esc(T("عرض المزيد", "Show more")) + "</button>" : "";
  }
  function load(more) {
    if (S.busy && more) return;
    var seq = ++S.seq; S.busy = true;
    if (!more) { S.page = 1; msg("⏳ " + esc(T("جارٍ التحميل…", "Loading…"))); }
    api("/janna/opportunities" + qs()).then(function (j) {
      if (seq !== S.seq) return; S.busy = false;
      if (!j || (j.ok !== true && !j.off)) throw { code: "bad_response" };
      paint(j, more);
    }, function (e) {
      if (seq !== S.seq) return; S.busy = false;
      if (more) { S.page = Math.max(1, S.page - 1); }
      msg(esc(e && e.code === "rate_limited" ? T("طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.", "Too many requests in a row. Wait a minute and try again.") : T("ماقدرناش نجيب الفرص دلوقتي. جرّب تاني بعد شوية.", "We couldn't load the opportunities right now. Please try again shortly."))
        + ' <button type="button" class="btn btn-line btn-sm" data-mo-retry="1">' + esc(T("حاول تاني", "Try again")) + "</button>", "err");
    });
  }
  function note(t) { var A = W.MIGAPI; if (A && A.ui && A.ui.toast) A.ui.toast(t); }
  D.addEventListener("click", function (e) {
    var t = e.target, b = t && t.closest ? t.closest("[data-mo-type],[data-mo-more],[data-mo-retry],[data-mo-ask]") : null;
    if (!b) return;
    if (b.hasAttribute("data-mo-type")) { S.type = b.getAttribute("data-mo-type") || ""; if (TYPES.indexOf(S.type) < 0) S.type = ""; load(false); return; }
    if (b.hasAttribute("data-mo-more")) { S.page += 1; load(true); return; }
    if (b.hasAttribute("data-mo-retry")) { load(false); return; }
    /* «عايز التفاصيل»: Janna's live call on this page; in the call's shared screen she is already there */
    e.preventDefault();
    var J = W.JANNA_LIVE, framed = false;
    try { framed = W.top !== W; } catch (x) { framed = true; }
    if (J && typeof J.open === "function") { try { J.open(); return; } catch (x2) { /* below */ } }
    if (framed) { note(T("اسأل جنة عن الفرصة دي في المكالمة دلوقتي.", "Ask Janna about this opportunity in the call now.")); return; }
    W.location.href = "/?live=1";
  });
  if ($F) $F.addEventListener("submit", function (e) { e.preventDefault(); S.q = String(($Q && $Q.value) || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 80); load(false); });
  if ($M) $M.addEventListener("change", function () { S.market = /^[a-z]{2,8}$/.test($M.value) ? $M.value : ""; load(false); });
  load(false);
})();
