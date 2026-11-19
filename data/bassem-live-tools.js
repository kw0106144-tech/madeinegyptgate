/* «باسم شايف شاشته» — Bassem's live-call tools that ANSWER, on a screen that moves (data/bassem-live-tools.js).
   Owner 2026-11-18: «لما بيقولي أنا يفتحلك دليل المصانع … بتبقى شاشة ثابتة مش متحركة ومش بيفتح أي حاجة فرعية ولا حتى بيعرفني مين الجهة
   ولا المبلغ … ولما بيقولي هفتحلك مناقصة بيفتح شاشة ثابتة مش متفاعلة».
   Loaded lazily by data/janna-live.js when a live call opens (same ?v= as janna-live.js, or window.MIGVER_LT). Two jobs:
   1) The client tools return what the SHARED SCREEN really shows to the LLM: janna-live.js hands the Anam SDK client to attach(), which
      registers registerToolCallHandler(name, {onStart}) handlers; with awaitResult:true on the tool (anam/bassem-client-tools.json) the
      string they resolve with is the tool result Bassem reads. The text is harvested from the page's DOM AFTER it rendered (count + top
      items with title, entity, deadline, status, governorate, ref …) — never from memory, never invented; a page that does not show the
      asked item says so.
        janna_search · janna_navigate · bassem_open_opportunity   run by janna-live.js run() exactly as before; this file waits for the
                                                                  screen to show the result and reads it
        bassem_open_item {section, ref?, title?, index?}          NEW, run here: opens THAT tender / RFQ / factory / supplier / product /
                                                                  project / award on the shared screen (its own page or dialog), scrolls to
                                                                  it and points at the key fields one after the other; section "intel" (or
                                                                  an /intel/ page link, an intel id, the official link of one of his
                                                                  bassem_intel results) opens that Information Center item's own page and
                                                                  reads its real fields (owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي
                                                                  مش لاقي التفاصيل»)
        bassem_screen {action, target?}                           NEW, run here: scroll_down · scroll_up · next_result · prev_result · back ·
                                                                  highlight — Bassem drives the page while he talks
   2) Every action is visibly animated: a pointer labelled «باسم» glides to what he talks about (ripple on "clicks"), a pulsing ring
      follows each key field while the page scrolls smoothly, the item's key facts fly out on the hologram (MIGHOLO.result). Phones /
      stacked layout: the shared screen opens by itself when Bassem drives it, with a «رجوع لباسم» button back to the video.
   janna-live.js asks take(name, args) at the top of run(): true = this file runs the tool (the new ones), false = run() runs it and this
   file only watches. One tool call = one action: the SDK reports the call to the DOM path (run) first and to the handler right after;
   the handler picks up the job run() started (same name + arguments, ≤ 4 s), or starts it when run() did not.
   ES5, no libraries, no network. API: MIG_LIVE_TOOLS.attach(client, host) · take(name, args) · screenText() · busy() · defs · __v */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIG_LIVE_TOOLS && W.MIG_LIVE_TOOLS.__v) return;
  function EN() { return W.MIGLANG === "en"; }
  function T(ar, en) { return EN() ? en : ar; }
  function now() { return new Date().getTime(); }
  function tx(el) { return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  function cut(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return n && s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function norm(s) { return String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase(); }
  function words(s) { return norm(s).split(/[^ء-يa-z0-9]+/).filter(function (w) { return w.length > 1; }).map(function (w) { return w.replace(/^(ال|و)(?=...)/, ""); }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* poll test() every step ms until it returns something truthy (that value) or ms passed (null) */
  function until(test, ms, step) {
    return new Promise(function (res) {
      var t0 = now();
      (function poll() { var v = null; try { v = test(); } catch (e) { v = null; } if (v) { res(v); return; } if (now() - t0 > ms) { res(null); return; } setTimeout(poll, step || 180); })();
    });
  }
  function RM() { try { return !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function args(a) { if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = {}; } } return a && typeof a === "object" ? a : {}; }
  /* Bassem's calls only (review 2026-11-18 #1): Janna's calls never get his pointer, ring, «رجوع لباسم» or these handlers */
  function isBassem() { try { var J = W.JANNA_LIVE; return !!(J && J.persona && J.persona() === "bassem"); } catch (e) { return false; } }
  /* a path of THIS site only: «//host/…» and «/\host» are other sites (review #6) */
  function sameSite(p) { if (!/^\/(?![\/\\])/.test(String(p || ""))) return false; try { return new URL(p, location.href).origin === location.origin; } catch (e) { return true; } }

  /* ---------- the host (janna-live.js): {persona, frame(), go(u, then), say(msg), run(name, a), ov(), link(u)} ---------- */
  var H = null;
  function ov() { try { return (H && H.ov && H.ov()) || D.querySelector(".jnl"); } catch (e) { return D.querySelector(".jnl"); } }
  function fr() { try { var f = H && H.frame ? H.frame() : null; return f || (ov() ? ov().querySelector(".jnl-scr iframe") : null); } catch (e) { return null; } }
  function fdoc() { var f = fr(); try { return f ? f.contentDocument : null; } catch (e) { return null; } }
  function fwin() { var f = fr(); try { return f ? f.contentWindow : null; } catch (e) { return null; } }
  function say(m) { try { if (H && H.say) H.say(m); } catch (e) {} }
  function go(u) { if (!H || !H.go || !fr()) return false; try { H.go(u); return true; } catch (e) { return false; } }
  function pageOf(d) {
    var k = ""; try { var w = d.defaultView; k = String(w.MIGPAGE || ""); if (!k) k = (w.location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, ""); } catch (e) {}
    return !k || k === "index" ? "home" : k;
  }
  function ctxOf(d) { try { return d.defaultView.MIG_CTX || null; } catch (e) { return null; } }
  function ready(d) { try { return !!d && d.readyState !== "loading" && !!d.body && d.location.href !== "about:blank"; } catch (e) { return false; } }
  function shown(el) { if (!el || !el.getClientRects || !el.getClientRects().length) return false; try { var cs = el.ownerDocument.defaultView.getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; } catch (e) { return true; } }
  function titleOf(d) { try { return cut(String(d.title || "").split("|")[0].split("·")[0].split(" – ")[0], 90); } catch (e) { return ""; } }

  /* ---------- the listing pages of the platform (the same selectors data/holo.js reads) ---------- */
  var SEC = {
    tenders: { key: "tenders", file: "tenders.html", card: "#olL .ol-it", title: "h3", count: "#olC", box: "#olQ", noun: ["المناقصات", "Tenders"] },
    rfqs: { key: "rfqs", file: "rfqs.html", card: "#olL .ol-it", title: "h3", count: "#olC", box: "#olQ", noun: ["طلبات الأسعار", "RFQs"] },
    factories: { key: "factories", file: "factories.html", card: "#grid a.fc", title: "h3", count: "#cnt", box: "#q", noun: ["دليل المصانع", "Factory directory"] },
    suppliers: { key: "suppliers", file: "suppliers.html", card: "#sgrid a.sc", title: "h3", count: "#scnt", box: "#sq", noun: ["دليل الموردين", "Suppliers"] },
    products: { key: "market", file: "market.html", card: "#grid article.pc", title: ".t", count: "#rCount", box: "#sq", noun: ["السوق", "Marketplace"] },
    projects: { key: "projects", file: "projects.html", card: "#grid a.pj", title: ".top b", count: "#cnt", box: "#q", noun: ["المشروعات", "Projects"] },
    offers: { key: "offers", file: "offers.html", card: "#ogrid a.of", title: "b.n", count: "#ocnt", box: "#oq", noun: ["العروض", "Offers"] },
    winners: { key: "winners", file: "winners.html", card: "#rk a, #wL a, #grid a, .wn-it", title: "b, h3", count: "#cnt", box: "#q", noun: ["الترسيات", "Contract awards"] }
  };
  SEC.market = SEC.products; SEC.awards = SEC.winners; SEC.companies = SEC.factories;
  function secOfPage(k) { for (var s in SEC) if (SEC[s].key === k) return s === "market" ? "products" : s === "awards" ? "winners" : s === "companies" ? "factories" : s; return ""; }
  function cards(d, S) { var out = []; try { var l = d.querySelectorAll(S.card); for (var i = 0; i < l.length; i++) if (shown(l[i])) out.push(l[i]); } catch (e) {} return out; }
  function countText(d, S) { var e = null; try { e = S.count ? d.querySelector(S.count) : null; } catch (x) {} return e ? cut(tx(e), 120) : ""; }
  /* one result card → its facts, read from the card itself (emoji-tagged lines of the platform's cards) */
  var TAGS = [["🏛", "entity"], ["📍", "place"], ["#", "ref"], ["🏷", "activity"], ["⏳", "deadline"], ["📅", "date"], ["📦", "qty"], ["💰", "value"], ["🏪", "store"]];
  function cardFacts(S, c) {
    var f = { title: "", el: c }, t = null; try { t = c.querySelector(S.title); } catch (e) {}
    f.title = cut(tx(t) || tx(c), 150);
    var parts = c.querySelectorAll("span, small, dd, b, .price, .seller, .st, .big-val, .chip, .st2");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (p.children.length > 1) continue;
      var s = tx(p); if (!s || s.length > 160) continue;
      for (var k = 0; k < TAGS.length; k++) if (s.indexOf(TAGS[k][0]) === 0 && !f[TAGS[k][1]]) { f[TAGS[k][1]] = cut(s.slice(TAGS[k][0].length).replace(/^[️\s]+/, ""), 90); break; }
      if (/\bst2\b/.test(p.className) && !f.status && !/التفاصيل|Details/.test(s)) f.status = s;
      if (/big-val/.test(p.className) && !f.value) f.value = s;
      if (/(^|\s)price(\s|$)/.test(p.className) && !f.value) f.value = s;
      if (/seller/.test(p.className) && !f.entity) f.entity = s.replace(/^(مصنع|Factory):\s*/, "");
      if (p.tagName === "SMALL" && !f.place && /📍/.test(s)) f.place = cut(s.split("📍").pop(), 60);
      if (p.tagName === "SMALL" && !f.activity && /🏷/.test(s)) f.activity = cut(s.split("🏷").pop().split("·")[0].replace(/^[️\s]+/, ""), 60);
    }
    var dl = c.querySelector("dl"); if (dl) { var dts = dl.querySelectorAll("dt"); for (var j = 0; j < dts.length; j++) { var lb = tx(dts[j]), dd = dts[j].nextElementSibling, v = tx(dd); if (/المالك|Owner/i.test(lb) && !f.entity) f.entity = v; else if (/المقاول|Contractor/i.test(lb)) f.contractor = v; } }
    if ((S === SEC.factories || S === SEC.suppliers) && f.qty) { f.products = f.qty; delete f.qty; }
    if (S === SEC.factories && !f.place) { var sm = c.querySelectorAll("small"); if (sm[1]) f.place = cut(tx(sm[1]).replace(/^📍\s*/, ""), 60); }
    return f;
  }
  function factLine(f, i) {
    var L = [(i != null ? (i + 1) + ") " : "") + f.title];
    if (f.entity) L.push(T("الجهة: ", "Entity: ") + f.entity);
    if (f.contractor) L.push(T("المقاول: ", "Contractor: ") + f.contractor);
    if (f.value) L.push(T("القيمة: ", "Value: ") + f.value);
    if (f.deadline) L.push(T("آخر موعد: ", "Deadline: ") + f.deadline);
    if (f.status) L.push(T("الحالة: ", "Status: ") + f.status);
    if (f.place) L.push(T("المكان: ", "Place: ") + f.place);
    if (f.activity) L.push(T("النشاط: ", "Activity: ") + f.activity);
    if (f.date) L.push(T("تاريخ النشر: ", "Published: ") + f.date);
    if (f.qty) L.push(T("الكمية: ", "Quantity: ") + f.qty);
    if (f.products) L.push(T("منتجات: ", "Products: ") + f.products);
    if (f.ref) L.push(T("رقم: ", "Ref: ") + f.ref);
    return L.join(" | ");
  }
  /* the open item: a dialog on the page (tender / RFQ / product), else the page itself (factory, project, award …) */
  function openDialog(d) {
    var l = []; try { l = d.querySelectorAll(".pdov .box, [role='dialog'][aria-modal='true'], .modal.on, .pvm.on"); } catch (e) {}
    for (var i = l.length - 1; i >= 0; i--) if (shown(l[i]) && tx(l[i]).length > 20) return l[i]; /* the newest one */
    return null;
  }
  function pairs(root, page) {
    var out = [], dts = root.querySelectorAll("dt");
    if (page) { var dls = root.querySelectorAll("dl"), bestDl = null, bn = 0; for (var b = 0; b < dls.length; b++) { if (dls[b].closest && dls[b].closest("a, .pj, .fc, .sc, .pc, .ol-it")) continue; var nn = dls[b].querySelectorAll("dt").length; if (nn > bn && shown(dls[b])) { bn = nn; bestDl = dls[b]; } } if (bestDl) dts = bestDl.querySelectorAll("dt"); }
    for (var i = 0; i < dts.length && out.length < 16; i++) {
      var dd = dts[i].nextElementSibling; if (!dd || dd.tagName !== "DD" || !shown(dts[i])) continue; var v = tx(dd), k = tx(dts[i]);
      if (v && v !== "—" && v !== "-") out.push({ k: k, v: cut(v, 140), el: dd, lb: dts[i] });
      else if (AMT_RE.test(k)) out.push({ k: k, v: T("مش منشور على الشاشة دي", "not published on this screen"), el: dd, lb: dts[i], none: true }); /* QA M1: «كام المبلغ؟» has an honest answer */
    }
    return out;
  }
  var AMT_RE = /(القيمة|التكلفة|المبلغ|السعر|ثمن|التأمين|قيمة|Value|Amount|Price|Cost|Bond|Fee)/i;
  var KEYS = [
    ["entity", /^(الجهة|الجهة الطارحة|الجهة المالكة|المالك|المشتري|الشركة|Entity|Buyer|Owner|Issuing)/i],
    ["amount", /(القيمة|التكلفة|المبلغ|السعر|ثمن|التأمين|قيمة|Value|Amount|Price|Cost|Bond|Fee)/i],
    ["deadline", /(آخر موعد|الموعد النهائي|موعد الإغلاق|الموعد|Deadline|Closing|Due)/i],
    ["place", /(المحافظة|الموقع|مكان|العنوان|Governorate|Location|Place)/i],
    ["contractor", /(المقاول|الفائز|Contractor|Winner)/i],
    ["activity", /(النشاط|القطاع|النوع|Sector|Activity|Type)/i],
    ["ref", /(رقم|Ref|No\.)/i]
  ];
  function detail(d) {
    var dlg = openDialog(d), root = dlg || d.querySelector("main") || d.body, c = ctxOf(d) || {};
    var h = root.querySelector("h1, h2, h3"), out = { root: root, dialog: !!dlg, title: cut(tx(h) || c.title || titleOf(d), 160), titleEl: h, facts: [], docs: [], marks: [] };
    var P = pairs(root, !dlg); out.facts = P;
    var st = root.querySelector(".st2"); if (st) out.status = tx(st);
    /* sources / documents of the item (the notice, the tender booklet …): only links that are really on it */
    var as = root.querySelectorAll("a[href]");
    for (var i = 0; i < as.length && out.docs.length < 3; i++) { var a = as[i], t = tx(a); if (!shown(a)) continue; if (/(كراسة|الشروط|المصدر|مصدر|صفحة المناقصة|الإعلان|Source|Documents?|Notice|PDF)/i.test(t) || /\.pdf(\?|$)/i.test(a.href)) out.docs.push({ t: cut(t, 60), el: a }); }
    var big = root.querySelector(".big-val"); if (big && shown(big)) out.value = tx(big);
    /* key fields, in the order Bassem walks the member through them */
    var seen = {}; if (h && shown(h)) out.marks.push({ el: h, lab: T("البند", "Item") });
    KEYS.forEach(function (K) { for (var j = 0; j < P.length; j++) if (!seen[j] && K[1].test(P[j].k) && (K[0] !== "ref" || out.marks.length < 2)) { seen[j] = 1; out.marks.push({ el: P[j].el, lab: P[j].none ? P[j].k + ": " + T("مش منشور", "not published") : P[j].k, key: K[0] }); if (K[0] !== "amount") break; } });
    if (big && shown(big)) out.marks.splice(Math.min(2, out.marks.length), 0, { el: big, lab: T("القيمة", "Value"), key: "amount" });
    out.docs.forEach(function (x) { out.marks.push({ el: x.el, lab: T("المستندات / المصدر", "Documents / source"), key: "docs" }); });
    /* a company profile: its products and the quote button */
    if (!dlg && /company|factory|supplier/.test(String(c.type || ""))) {
      var hs = root.querySelectorAll("h2, h3"); for (var k = 0; k < hs.length; k++) if (/المنتجات|Products/i.test(tx(hs[k]))) { out.prodEl = hs[k]; out.marks.push({ el: hs[k], lab: T("المنتجات", "Products") }); var lis = [], sec2 = (hs[k].closest && hs[k].closest("section")) || hs[k].parentNode, sib = sec2 ? sec2.querySelectorAll("article h3, article h4, li") : []; for (var m = 0; m < sib.length && lis.length < 8; m++) { var s2 = tx(sib[m]); if (s2 && s2.length < 80 && lis.indexOf(s2) < 0) lis.push(s2); } out.products = lis; break; }
      var btns = root.querySelectorAll("a, button"); for (var q = 0; q < btns.length; q++) if (/(اطلب عرض سعر|طلب عرض سعر|Request a quote|Get a quote)/i.test(tx(btns[q])) && shown(btns[q])) { out.marks.push({ el: btns[q], lab: T("اطلب عرض سعر", "Request a quote") }); break; }
    }
    if (!dlg && /company|factory|supplier/.test(String(c.type || ""))) { /* QA M3: walk down the page in order; «النوع: مصنع» only repeats the section */
      out.marks = out.marks.filter(function (m) { return !(m.key === "activity" && /^(النوع|Type)$/i.test(String(m.lab || "").trim()) && /^(مصنع|مورد|شركة|منشأة|Factory|Supplier|Company)$/i.test(tx(m.el))); });
      var m0 = out.marks.length && out.marks[0].el === h ? out.marks.shift() : null;
      out.marks.sort(function (a, b) { return yOf(a.el) - yOf(b.el); }); if (m0) out.marks.unshift(m0);
    }
    out.marks = out.marks.slice(0, 6);
    out.type = String(c.type || ""); out.ref = String(c.id || ""); out.url = String(c.url || "");
    var lock = root.querySelector(".lock"); if (lock && shown(lock)) out.lock = cut(tx(lock).replace(/[🔒←→]/g, ""), 160);
    return out;
  }
  function yOf(el) { try { return el.getBoundingClientRect().top + (el.ownerDocument.defaultView.pageYOffset || 0); } catch (e) { return 0; } }
  function detailText(o, what) {
    var L = [T("مفتوح دلوقتي على الشاشة", "Now open on the shared screen") + (what ? " (" + what + ")" : "") + ": " + o.title];
    if (o.status) L.push(T("الحالة: ", "Status: ") + o.status);
    if (o.value) L.push(T("القيمة: ", "Value: ") + o.value);
    o.facts.forEach(function (p) { L.push(p.k + ": " + p.v); });
    if (o.products && o.products.length) L.push(T("المنتجات: ", "Products: ") + o.products.join(T("، ", ", ")));
    if (o.docs.length) L.push(T("على البند: ", "On the item: ") + o.docs.map(function (x) { return x.t; }).join(T("، ", ", ")));
    if (o.lock) L.push(T("ملحوظة على الشاشة: ", "Note on screen: ") + o.lock);
    if (o.facts.some(function (p) { return p.none; })) L.push(T("(المبلغ مش على الشاشة دي: لو العضو سأل «كام؟» قول كده بصراحة، وهات التفاصيل بـ platform_item أو افتح صفحة البند نفسها بالـ url — ماتخمّنش رقم)", "(the amount is not on this screen: if asked, say so, then get the details with platform_item or open the item's own page by url — never guess a figure)"));
    L.push(T("(بيانات حقيقية من الشاشة — اذكر منها بس، ومتقرأش كل حاجة: قول الأهم بإيجاز)", "(real data from the screen — mention only these, briefly)"));
    return L.join("\n").slice(0, 1800);
  }
  /* what the screen shows now: page title, counters, sections (janna_navigate, scrolls, the continuation context) */
  function pageSummary(d) {
    if (!ready(d)) return T("الشاشة لسه بتحمّل", "The screen is still loading");
    var L = [T("الصفحة على الشاشة: ", "Page on screen: ") + (titleOf(d) || pageOf(d))], c = ctxOf(d);
    var dlg = openDialog(d); if (dlg) { var o = detail(d); L.push(T("مفتوح فيها: ", "Open in it: ") + o.title); }
    var ks = [], kl = d.querySelectorAll("#olK .k, .fstats a, .kpis .k, .stats .k, .ol-top .k");
    for (var i = 0; i < kl.length && ks.length < 6; i++) { var b = kl[i].querySelector("b"), sm = kl[i].querySelector("small, span"); if (b && sm && shown(kl[i])) ks.push(tx(b) + " " + tx(sm)); }
    if (ks.length) L.push(T("العدّادات: ", "Counters: ") + ks.join(" · "));
    var s = secOfPage(pageOf(d)); if (s) { var S = SEC[s], n = countText(d, S); if (n) L.push(T("القائمة: ", "List: ") + n); var cs = cards(d, S).slice(0, 4).map(function (x) { return cardFacts(S, x).title; }); if (cs.length) L.push(T("أول الظاهر: ", "First shown: ") + cs.join(" ؛ ")); }
    else if (c && c.title) L.push(T("البند: ", "Item: ") + cut(c.title, 120));
    var hs = [], hl = d.querySelectorAll("main h2, main h3, section h2");
    for (var j = 0; j < hl.length && hs.length < 6; j++) { if (hl[j].closest && hl[j].closest("a, button, article, .ol-it, .pdov")) continue; var t = tx(hl[j]); if (t && t.length < 70 && shown(hl[j]) && hs.indexOf(t) < 0) hs.push(t); }
    if (hs.length) L.push(T("الأقسام: ", "Sections: ") + hs.join(" · "));
    return L.join("\n").slice(0, 1200);
  }

  /* ---------- look: the «باسم» pointer, the pulsing ring, the phone «رجوع لباسم» button (in the call overlay, above the screen) ---------- */
  var CSS = ''
    + '.blt{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}'
    + '.blt-ptr{position:absolute;left:0;top:0;display:flex;align-items:flex-start;gap:2px;opacity:0;transform:translate(40px,60px);transition:transform .75s cubic-bezier(.22,.9,.28,1),opacity .35s ease;will-change:transform;filter:drop-shadow(0 6px 14px rgba(0,0,0,.45))}'
    + '.blt-ptr.on{opacity:1}.blt-ptr svg{width:26px;height:26px;flex:none}'
    + '.blt-ptr b{margin-top:16px;padding:2px 10px 3px;border-radius:999px;background:#0b5d47;color:#fff;font:800 .74rem/1.4 Cairo,Tahoma,sans-serif;box-shadow:0 0 0 2px rgba(233,196,106,.85),0 0 16px rgba(63,224,255,.65);white-space:nowrap}'
    + '.blt-ptr i{position:absolute;left:-14px;top:-14px;width:30px;height:30px;border-radius:50%;border:3px solid rgba(233,196,106,.95);opacity:0}'
    + '.blt-ptr.tap i{animation:bltTap .6s ease-out}@keyframes bltTap{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.9);opacity:0}}'
    + '.blt-ring{position:absolute;left:0;top:0;width:0;height:0;border-radius:12px;opacity:0;transition:opacity .3s ease;box-shadow:0 0 0 3px rgba(233,196,106,.95),0 0 0 7px rgba(63,224,255,.35),0 0 28px 6px rgba(63,224,255,.45);animation:bltPulse 1.05s ease-in-out infinite}'
    + '.blt-ring.on{opacity:1}.blt-ring em{position:absolute;bottom:100%;inset-inline-start:0;margin-bottom:6px;padding:1px 9px 2px;border-radius:8px;background:rgba(4,18,26,.92);color:#e9c46a;font:800 .72rem/1.5 Cairo,Tahoma,sans-serif;font-style:normal;white-space:nowrap;border:1px solid rgba(233,196,106,.6)}'
    + '@keyframes bltPulse{0%,100%{box-shadow:0 0 0 3px rgba(233,196,106,.95),0 0 0 7px rgba(63,224,255,.32),0 0 22px 4px rgba(63,224,255,.4)}50%{box-shadow:0 0 0 4px rgba(233,196,106,1),0 0 0 12px rgba(63,224,255,.12),0 0 36px 10px rgba(63,224,255,.55)}}'
    + '.blt-back{position:absolute;z-index:6;bottom:14px;inset-inline-end:14px;display:none;align-items:center;gap:7px;border:1px solid rgba(233,196,106,.75);border-radius:999px;background:#04121a;color:#fff;font:800 .86rem/1 Cairo,Tahoma,sans-serif;padding:10px 14px;cursor:pointer;pointer-events:auto;box-shadow:0 10px 24px -8px rgba(0,0,0,.7),0 0 18px -4px rgba(63,224,255,.8)}'
    + '.blt-back img{width:26px;height:26px;border-radius:50%;object-fit:cover;object-position:50% 18%;border:2px solid #e9c46a}'
    + '@media (max-width:820px),(max-aspect-ratio:3/2){.jnl:not(.fs) .blt-back.on{display:inline-flex}.jnl:not(.fs) .jnl-scr.blt-bk .jnl-bar .tv{display:none}}'
    + '.blt-see{position:fixed;z-index:7;top:calc(env(safe-area-inset-top,0px) + 58px);left:50%;transform:translateX(-50%);display:none;border:1px solid rgba(233,196,106,.75);border-radius:999px;background:#04121a;color:#fff;font:800 .84rem/1 Cairo,Tahoma,sans-serif;padding:9px 14px;cursor:pointer;box-shadow:0 10px 24px -8px rgba(0,0,0,.7),0 0 18px -4px rgba(63,224,255,.8)}.blt-see.on{display:block}'
    + 'html.jnl-on.blt-away .mgh{opacity:0!important;visibility:hidden!important;transition:opacity .25s ease,visibility 0s linear .25s}'
    + '@media (prefers-reduced-motion:reduce){.blt-ptr{transition:opacity .2s}.blt-ring{animation:none}.blt-ptr.tap i{animation:none}}';
  var L = null, ringEl = null, ringT = 0, ringRaf = 0, PF = null, touchT = 0, IO = null;
  /* the site's own floating buttons («اسأل جنة», back to top) stay off Bassem's screen (QA L7) */
  var FRAME_CSS = '.totop,.jn-fig,.jn-beam,.jn-bub,.jn-mini,.jn-tap,.jn-spot,.jn-wc{display:none!important}';
  function frameCss() { var d = fdoc(); try { if (ready(d) && !d.getElementById("blt-fcss")) { var st = d.createElement("style"); st.id = "blt-fcss"; st.textContent = FRAME_CSS; (d.head || d.body).appendChild(st); } } catch (e) {} }
  /* phones / stacked: while the member looks at the shared screen (the video mostly scrolled away) the hologram — fixed at the video's
     chest height — would cover the fields Bassem points at: it fades out until the video is back in view (QA H1) */
  function watchAway(o) {
    if (IO && IO.o === o) return; if (IO) { try { IO.disconnect(); } catch (e) {} IO = null; } away(false);
    var vb = o.querySelector(".jnl-sdk") || o.querySelector("video"); if (!vb || !W.IntersectionObserver) return;
    try { IO = new W.IntersectionObserver(function (es) { var e = es[es.length - 1], gone = !!e && stacked() && e.intersectionRatio < 0.4;
      /* review 2026-11-19 #20: the member is on the screen (whichever way he got there: «شوف الشاشة ↓», the header's 🖥️, his own scroll) → the chip is done */
      if (gone && L && L.see) L.see.classList.remove("on");
      away(gone); }, { root: o, threshold: [0, 0.2, 0.4, 0.6, 1] }); IO.o = o; IO.observe(vb); } catch (e) { IO = null; }
  }
  /* review 2026-11-19 #19: back to the video — the hologram comes back only when the overlay has stopped scrolling and holo.js has measured
     the video where it really is (a scene laid out while the video was scrolled away sat ~80 px too high, over his mouth, until the next
     1.3 s re-measure) */
  var AWT = 0;
  function away(on) {
    var de = D.documentElement; clearTimeout(AWT); AWT = 0;
    if (on) { try { de.classList.add("blt-away"); } catch (e) {} return; }
    var o = ov(), last = -1, n = 0;
    try { if (!de.classList.contains("blt-away")) return; } catch (e) { return; }
    (function settle() {
      var y = o ? o.scrollTop : 0;
      if (y !== last && n++ < 15) { last = y; AWT = setTimeout(settle, 90); return; }
      AWT = 0; try { if (W.MIGHOLO && typeof MIGHOLO.relayout === "function") MIGHOLO.relayout(); } catch (e) {}
      try { de.classList.remove("blt-away"); } catch (e) {}
    })();
  }
  function layer() {
    var o = ov(), scr = o && o.querySelector(".jnl-scr"); if (!scr) return null;
    if (L && L.scr === scr && scr.contains(L.root)) return L;
    if (!D.getElementById("blt-css")) { var st = D.createElement("style"); st.id = "blt-css"; st.textContent = CSS; D.head.appendChild(st); }
    var root = D.createElement("div"); root.className = "blt"; root.setAttribute("aria-hidden", "true");
    root.innerHTML = '<div class="blt-ring"><em></em></div><div class="blt-ptr"><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#e9c46a" stroke="#04121a" stroke-width="1.4" stroke-linejoin="round"/></svg><b>' + T("باسم", "Bassem") + '</b></div>';
    scr.appendChild(root);
    var bk = D.createElement("button"); bk.type = "button"; bk.className = "blt-back"; bk.setAttribute("translate", "no");
    var hs = (W.BASSEM_REAL && W.BASSEM_REAL.headshot) || "img/bassem.jpg";
    bk.innerHTML = '<img alt="" src="' + String(hs).replace(/"/g, "") + '"><span>' + T("رجوع لباسم", "Back to Bassem") + '</span>';
    bk.onclick = function () { backToVideo(); };
    scr.appendChild(bk);
    /* «شوف الشاشة ↓»: the member is typing / just touched the call — Bassem does not scroll it away, he offers the screen (QA M5) */
    var see = D.createElement("button"); see.type = "button"; see.className = "blt-see"; see.setAttribute("translate", "no"); see.textContent = T("شوف الشاشة ↓", "See the screen ↓");
    see.onclick = function () { see.classList.remove("on"); touchT = 0; showScreen(true); };
    o.appendChild(see);
    var mark = function () { touchT = now(); }; try { o.addEventListener("touchstart", mark, { passive: true }); o.addEventListener("keydown", mark); } catch (e) {}
    /* a new page on the screen: no stale pointer / ring from the old one (QA L1), the site's floating buttons hidden (QA L7) */
    var f0 = scr.querySelector("iframe"); if (f0 && !f0.__blt) { f0.__blt = 1; f0.addEventListener("load", function () { hidePtr(); unring(); frameCss(); }); }
    watchAway(o);
    L = { scr: scr, root: root, ptr: root.querySelector(".blt-ptr"), ring: root.querySelector(".blt-ring"), back: bk, see: see };
    return L;
  }
  /* an element on the shared screen → its box in the screen's own coordinates */
  function boxOf(el) {
    var l = layer(), f = fr(); if (!l || !f || !el || !el.getBoundingClientRect) return null;
    var a = f.getBoundingClientRect(), s = l.scr.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: a.left - s.left + r.left, y: a.top - s.top + r.top, w: r.width, h: r.height, fw: a.width, fh: a.height, fx: a.left - s.left, fy: a.top - s.top };
  }
  /* the tip at the element's START edge, at the bottom of its first line: the «باسم» label hangs under the words, not on them (QA L4) */
  function ptrAt(l, b) {
    var rtl = !EN(), x = rtl ? b.x + b.w - 6 : b.x + 6, y = b.y + Math.min(b.h, 30) - 4;
    x = Math.max(b.fx + 6, Math.min(b.fx + b.fw - 90, x)); y = Math.max(b.fy + 6, Math.min(b.fy + b.fh - 40, y));
    l.ptr.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function pointTo(el, tap) {
    var l = layer(), b = boxOf(el); if (!l || !b) return;
    PF = el; l.ptr.classList.add("on"); ptrAt(l, b); /* then it follows the element while the page scrolls (ring loop, QA M2) */
    if (tap) setTimeout(function () { l.ptr.classList.remove("tap"); void l.ptr.offsetWidth; l.ptr.classList.add("tap"); }, RM() ? 60 : 720);
  }
  function hidePtr() { PF = null; if (L) { L.ptr.classList.remove("on"); } }
  /* the ring follows the element while the page scrolls under it */
  function ring(el, label, ms) {
    var l = layer(); if (!l) return;
    ringEl = el; clearTimeout(ringT); l.ring.querySelector("em").textContent = label || ""; l.ring.querySelector("em").hidden = !label;
    var place = function () {
      if (ringEl !== el) return; var b = boxOf(el);
      if (b && b.w > 2) { var p = 6; l.ring.style.transform = "translate(" + Math.round(b.x - p) + "px," + Math.round(b.y - p) + "px)"; l.ring.style.width = Math.round(b.w + 2 * p) + "px"; l.ring.style.height = Math.round(b.h + 2 * p) + "px"; l.ring.classList.add("on"); if (PF === el) ptrAt(l, b); }
      ringRaf = (W.requestAnimationFrame || function (f) { return setTimeout(f, 40); })(place);
    };
    (W.cancelAnimationFrame || clearTimeout)(ringRaf); place();
    ringT = setTimeout(function () { if (ringEl === el) unring(); }, ms || 2600);
  }
  function unring() { ringEl = null; (W.cancelAnimationFrame || clearTimeout)(ringRaf); if (L) L.ring.classList.remove("on"); }
  /* scroll INSIDE the screen only: Element.scrollIntoView() also scrolls the call overlay (the iframe's ancestor), so on phones each
     step of a walk pulled the overlay back to the screen and undid «رجوع لباسم» (found while checking QA H1 / L6) */
  function scrollTo(el, block) {
    try {
      var d = el.ownerDocument, w = d.defaultView, beh = RM() ? "auto" : "smooth";
      for (var p = el.parentElement; p && p !== d.body && p !== d.documentElement; p = p.parentElement) {
        var cs = w.getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) { /* a dialog's own scroll box */
          var pr = p.getBoundingClientRect(), er = el.getBoundingClientRect(), dy = er.top - pr.top - (p.clientHeight - er.height) / 2;
          try { p.scrollBy({ top: dy, behavior: beh }); } catch (x) { p.scrollTop += dy; }
          return;
        }
      }
      var r = el.getBoundingClientRect(), y = r.top + (w.pageYOffset || 0) - (block === "start" ? 70 : (w.innerHeight - r.height) / 2);
      try { w.scrollTo({ top: Math.max(0, y), behavior: beh }); } catch (x) { w.scrollTo(0, Math.max(0, y)); }
    } catch (e) {}
  }
  /* walk the member through the key fields: scroll → pointer → ring, one after the other (not awaited by the tool result) */
  var tourN = 0;
  function tour(marks, gap) {
    var my = ++tourN, i = 0; gap = gap || 1500;
    (function next() {
      if (my !== tourN) return;
      if (i >= marks.length) { setTimeout(function () { if (my === tourN) { unring(); } }, 1200); return; }
      var m = marks[i++]; if (!m || !m.el || !shown(m.el)) { next(); return; }
      scrollTo(m.el, "center");
      setTimeout(function () { if (my !== tourN) return; pointTo(m.el, false); ring(m.el, m.lab, gap + 600); setTimeout(next, gap); }, RM() ? 80 : 520);
    })();
  }
  /* phones / stacked layout: the shared screen opens by itself when Bassem drives it, «رجوع لباسم» goes back to the video */
  function stacked() { var o = ov(); try { return !!o && W.getComputedStyle(o).display === "block"; } catch (e) { return false; } }
  /* janna-live.js keeps the overlay's scroll where the visitor left it unless they touched it in the last 1.5 s (a guard against
     focus jumps): this scroll is wanted, so it is marked like a touch for the time it runs */
  function wanted(o) { var n = 0; (function f() { try { o.dispatchEvent(new Event("wheel")); } catch (e) {} if (++n < 9) setTimeout(f, 250); })(); }
  function typing() { var a = D.activeElement, o = ov(); return !!(a && o && o.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)); }
  function showScreen(force) {
    var l = layer(), o = ov(); if (!l || !o) return;
    if (!stacked()) { l.back.classList.remove("on"); l.scr.classList.remove("blt-bk"); l.see.classList.remove("on"); return; }
    l.back.classList.add("on"); l.scr.classList.add("blt-bk"); /* one way back to the video, not two (QA L6) */
    var r = l.scr.getBoundingClientRect(); if (Math.abs(r.top) < 60) { l.see.classList.remove("on"); return; }
    if (!force && (typing() || now() - touchT < 5000)) { l.see.classList.add("on"); return; } /* QA M5: never scroll the typing box away */
    l.see.classList.remove("on"); wanted(o); try { o.scrollTo({ top: l.scr.offsetTop - 10, behavior: RM() ? "auto" : "smooth" }); } catch (e) { o.scrollTop = l.scr.offsetTop - 10; }
  }
  function backToVideo() { var o = ov(); if (!o) return; if (L && L.see) L.see.classList.remove("on"); wanted(o); try { o.scrollTo({ top: 0, behavior: RM() ? "auto" : "smooth" }); } catch (e) { o.scrollTop = 0; } }

  /* ---------- waiting for the screen ---------- */
  /* a NEW document (after a navigation) of page key k, rendered */
  function newPage(d0, test, ms) { return until(function () { var d = fdoc(); if (!ready(d) || (d0 && d === d0)) return null; return test(d) ? d : null; }, ms || 9000, 200); }
  /* the list of section S stops changing (count line + first titles the same for 2 polls) */
  function settled(d, S, ms) {
    var last = "", same = 0;
    return until(function () {
      var cs = cards(d, S), sig = countText(d, S) + "|" + cs.length + "|" + cs.slice(0, 3).map(function (c) { return tx(c).slice(0, 40); }).join("~");
      if (sig === last && (cs.length || countText(d, S))) same++; else { same = 0; last = sig; }
      return same >= 2 ? d : null;
    }, ms || 4000, 220).then(function (x) { return x || d; });
  }
  function boxHas(d, S, q) { if (!q) return true; var b = null; try { b = d.querySelector(S.box); } catch (e) {} return !!b && norm(b.value).indexOf(norm(q)) > -1; }
  /* type into the page's own search box (its own input events filter the list) */
  function typeIn(d, S, q) {
    var b = null; try { b = d.querySelector(S.box); } catch (e) {} if (!b) return false;
    scrollTo(b, "center"); pointTo(b, true);
    b.value = String(q); ["input", "change", "keyup"].forEach(function (t) { try { b.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {} });
    ring(b, T("بحث", "Search"), 1800); return true;
  }
  function best(list, q) {
    var ws = words(q), top = null, bs = 0; if (!ws.length) return list[0] || null;
    list.forEach(function (f) { var h = norm(f.title + " " + (f.ref || "") + " " + (f.entity || "")), s = 0; ws.forEach(function (w) { if (h.indexOf(w) > -1) s += w.length; }); if (norm(f.ref || "") === norm(q)) s += 100; if (s > bs) { bs = s; top = f; } });
    return bs >= Math.min(4, ws.join("").length) ? top : null;
  }

  /* ---------- tool: janna_search (run() searches; this reads what the screen then shows) ---------- */
  function watchSearch(a, d0) {
    var s = SEC[a.section] ? a.section : "factories", S = SEC[s], q = cut(a.query, 60);
    if (s === "market") s = "products";
    if (!fr()) return Promise.resolve(T("شاشة باسم مش مفتوحة دلوقتي، فمفيش نتايج ظاهرة.", "Bassem's screen is not open, so no results are shown."));
    showScreen();
    return newPage(d0, function (d) { return pageOf(d) === S.key && boxHas(d, S, q); }, 11000).then(function (d) {
      if (!d) { var d2 = fdoc(); if (ready(d2) && pageOf(d2) === S.key) d = d2; }
      if (!d) return T("الشاشة لسه ما عرضتش نتايج البحث ده — قول للعضو إن الصفحة بتحمّل وجرّب تاني بعد ثواني.", "The screen has not shown this search yet — tell the member the page is loading and try again in a few seconds.");
      return settled(d, S, 3500).then(function () { return s === "tenders" && soonest(d) ? sleep(300).then(function () { return settled(d, S, 2500); }) : d; }).then(function () {
        var cs = cards(d, S), n = countText(d, S), all = cs.map(function (c, i) { var f = cardFacts(S, c); f.pos = i + 1; return f; });
        var top = (s === "tenders" ? rankT(all, q) : all).slice(0, 8), tally = s === "tenders" ? tenderTally(d, q) : "";
        if (top.length) emitRes("janna_search", q || T(S.noun[0], S.noun[1]), numOf(n) != null ? numOf(n) : cs.length, top); /* Bassem's memory */
        var bx = null; try { bx = d.querySelector(S.box); } catch (e) {}
        /* animation: the pointer on the search box, then over the first results */
        var marks = []; if (bx) marks.push({ el: bx, lab: T("بحث: ", "Search: ") + q }); var ce = S.count ? d.querySelector(S.count) : null; if (ce && shown(ce)) marks.push({ el: ce, lab: n });
        top.slice(0, 3).forEach(function (f, i) { marks.push({ el: f.el, lab: T("نتيجة ", "Result ") + (i + 1) }); });
        tour(marks, 1100);
        var head = T("الشاشة بتعرض دلوقتي: ", "The shared screen now shows: ") + T(S.noun[0], S.noun[1]) + (q ? T(" — بحث «" + q + "»", " — search “" + q + "”") : "") + " — " + (n || (cs.length + T(" نتيجة ظاهرة", " results visible")));
        if (!top.length) return head + "\n" + T("مفيش نتايج مطابقة ظاهرة على الشاشة. ماتخترعش نتايج؛ اقترح كلمة بحث تانية أو قسم تاني.", "No matching results on the screen. Do not invent any; suggest another search word or section.");
        return head + (tally ? "\n" + tally : "") + "\n" + top.map(function (f) { return factLine(f, f.pos - 1); }).join("\n") + "\n" + T("(بيانات حقيقية من الشاشة، الرقم في أول السطر = مكانها على الشاشة. لفتح واحدة: bassem_open_item بالقسم و index ده (أو url)؛ أرقام المناقصات زي OFF:1 مش فريدة. ابدأ بالسارية اللي ليها جهة وموعد، وقول أهم 2–3 بس)", "(real data from the screen; the first number = its position on the screen. To open one: bassem_open_item with the section and that index (or url); tender numbers like OFF:1 are not unique. Start with the open ones that have an entity and a deadline; say the top 2–3 only)");
      });
    });
  }
  /* tenders on the screen, most useful first (QA H4): open / closing soon with a named entity and a deadline, then the other open ones,
     then expired, then the ones without a deadline; cards where the words are only in the entity's name go after all the others */
  function rankT(list, q) {
    var ws = words(q);
    return list.map(function (f, i) {
      var st = String(f.status || ""), open = /(سارية|تنتهي قريب|^Open|Closing)/i.test(st), exp = /(منتهية|Closed)/i.test(st);
      var named = !!f.entity && !/^(جهة حكومية|Government (entity|body))$/i.test(f.entity), tier = open ? (named && f.deadline ? 0 : 1) : exp ? 2 : 3, rel = 0;
      if (ws.length) { var hm = norm(f.title + " " + (f.activity || "")); ws.forEach(function (w) { if (hm.indexOf(w) > -1) rel++; }); }
      return { f: f, k: (ws.length && !rel ? 100 : 0) + tier * 10, i: i }; /* words only in the entity («المركز الطبي للسكك الحديد» for حديد): last (review #10) */
    }).sort(function (a, b) { return a.k - b.k || a.i - b.i; }).map(function (x) { return x.f; });
  }
  /* the page's own sort «أقرب موعد» (its #olO select): the open tenders come first on the screen too */
  function soonest(d) { var o = null; try { o = d.querySelector("#olO"); } catch (e) {} if (!o || o.value === "dl" || !o.querySelector('option[value="dl"]')) return false; o.value = "dl"; try { o.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} return true; }
  /* how many of the matches are open / closing / expired / undated — counted on the page's own data (window.MIGTEND, its search rule) */
  function tenderTally(d, q) {
    var Dt = null; try { Dt = d.defaultView.MIGTEND; } catch (e) {} if (!Dt || !Dt.length) return "";
    var qq = String(q || "").trim().toLowerCase(), n = { o: 0, s: 0, e: 0, u: 0 }, all = 0, money = 0;
    for (var i = 0; i < Dt.length; i++) { var x = Dt[i]; if (!x) continue; if (qq) { var h = x._h || x.join(" ").toLowerCase(); if (h.indexOf(qq) < 0) continue; } all++; if (x[7] || x[8]) money++; var st = String(x[2] || ""); if (st === "سارية") n.o++; else if (st === "تنتهي قريباً") n.s++; else if (st === "منتهية") n.e++; else n.u++; }
    if (!all) return "";
    return T("من " + all + ": " + n.o + " سارية · " + n.s + " تنتهي خلال 7 أيام · " + n.e + " منتهية · " + n.u + " من غير موعد معلن" + (money ? "" : " — والقايمة دي مافيهاش مبالغ (ثمن كراسة / تأمين)؛ المبلغ المنشور لمناقصة بتلاقيه في صفحتها نفسها (url) أو platform_item"), "Of " + all + ": " + n.o + " open · " + n.s + " closing within 7 days · " + n.e + " closed · " + n.u + " without a published deadline" + (money ? "" : " — this list carries no amounts (booklet price / bond); a published amount is on the tender's own page (url) or in platform_item"));
  }
  /* ---------- tool: janna_navigate ---------- */
  function watchNavigate(a, d0) {
    if (!fr()) return Promise.resolve(T("شاشة باسم مش مفتوحة دلوقتي.", "Bassem's screen is not open."));
    showScreen();
    var want = String(a.page || "home");
    return newPage(d0, function (d) { var k = pageOf(d); return k === want || (want === "home" && k === "home") || !!k; }, 9000).then(function (d) {
      d = d || fdoc(); if (!ready(d)) return T("الصفحة لسه بتحمّل على الشاشة.", "The page is still loading on the screen.");
      return sleep(700).then(function () {
        var marks = [], kl = d.querySelectorAll("#olK .k, .fstats a, .kpis .k, .ol-top .k");
        for (var i = 0; i < kl.length && marks.length < 4; i++) if (shown(kl[i])) marks.push({ el: kl[i], lab: tx(kl[i].querySelector("small, span")) });
        var h1 = d.querySelector("h1"); if (h1 && shown(h1)) marks.unshift({ el: h1, lab: "" });
        /* a directory: the walk goes on to its first cards, and Bassem gets his next step (QA M4) */
        var sN = secOfPage(pageOf(d)), SN = sN ? SEC[sN] : null;
        if (SN) cards(d, SN).slice(0, 3).forEach(function (c, i) { marks.push({ el: c, lab: T("نتيجة ", "Result ") + (i + 1) + ": " + cut(cardFacts(SN, c).title, 40) }); });
        tour(marks, 1000);
        return pageSummary(d) + "\n" + (SN ? T("(اللي فوق ظاهر فعلاً على الشاشة. الخطوة الجاية: افتح واحد بـ bassem_open_item {section:\"" + sN + "\", index:N}، أو دوّر بمنتج العضو بـ janna_search في القسم ده)", "(this is really on the screen. Next step: open one with bassem_open_item {section:\"" + sN + "\", index:N}, or search the member's product with janna_search in this section)") : T("(اللي فوق ظاهر فعلاً على الشاشة؛ اوصف منه بإيجاز)", "(this is really on the screen; describe it briefly)"));
      });
    });
  }
  /* ---------- tool: bassem_open_opportunity (run() drives advisor.html; this reads the opened opportunity) ---------- */
  function watchOpportunity(a, d0) {
    if (!fr()) return Promise.resolve(T("شاشة باسم مش مفتوحة دلوقتي.", "Bassem's screen is not open."));
    showScreen();
    return until(function () { var d = fdoc(); return ready(d) && pageOf(d) === "advisor" && d.querySelector("#advQ") ? d : null; }, 10000, 220).then(function (d) {
      if (!d) return T("صفحة الفرص (مستشارك) ما اتفتحتش على الشاشة لسه.", "The opportunities page (advisor) has not opened on the screen yet.");
      return sleep(1100).then(function () {
        var c = null, l = d.querySelectorAll("article.opc"); for (var i = 0; i < l.length; i++) if (shown(l[i])) { c = l[i]; break; }
        if (!c) return T("مفيش فرصة مفتوحة بالوصف ده في نطاق باقة العضو على الشاشة. ماتخترعش فرصة.", "No open opportunity with that description in the member's plan markets is on the screen. Do not invent one.");
        var f = cardFacts({ title: "h3" }, c), meta = [].map.call(c.querySelectorAll(".opc-m span, .opc-f .chip, .opc-t .chip"), tx).filter(Boolean).slice(0, 8);
        var dr = d.querySelector("#advDr:not([hidden]) .pn"), dt = dr ? tx(dr.querySelector("h2")) : "";
        tour([{ el: c.querySelector("h3") || c, lab: T("الفرصة", "Opportunity") }].concat(dr ? [{ el: dr.querySelector("h2") || dr, lab: T("دليل التعاقد", "Contracting guide") }] : []), 1300);
        return T("مفتوح على الشاشة: الفرصة ", "On the screen: the opportunity ") + "«" + f.title + "»\n" + meta.join(" | ") + (dt ? "\n" + T("ومعاها دليل التعاقد: ", "With its contracting guide: ") + dt : "") + "\n" + T("(بيانات حقيقية من الشاشة — قول الجهة والقيمة والموعد لو ظاهرين، ماتخترعش غيرهم)", "(real data from the screen — say the buyer, value and deadline if shown; nothing else)");
      });
    });
  }

  /* ---------- the Information Center results Bassem got: bassem_intel is a SERVER tool, so its answer arrives only as TOOL_CALL_COMPLETED
     (janna-live.js re-dispatches it as "anam-agent:tool-call-completed"); «افتحلي التانية» / «اللي في جنوب أفريقيا» opens one of THESE ---------- */
  var INTEL = { t: 0, items: [], one: null };
  var ISEC = { key: "intel", noun: ["مركز المعلومات", "Information Center"] };
  function intelParse(r) {
    for (var n = 0; n < 3 && r != null; n++) {
      if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return null; } continue; }
      if (typeof r !== "object") return null;
      if (r.results && typeof r.results.length === "number") return r;
      r = r.result != null ? r.result : r.data != null ? r.data : r.body;
    }
    return null;
  }
  /* an item's page on the Information Center (/intel/[en/]<seg>/<slug>-<id>/, on this site) → {path, id} */
  function intelPath(u) {
    var m = /^(?:https?:\/\/(?:www\.)?madeinegyptgate\.com)?(\/intel\/(?:en\/)?(?:tenders|projects|news|rfq)\/(?:[^\s"'<>\\?#\/]*-)?([0-9a-z]{11})\/?)(?:[?#][^\s"'<>\\]*)?$/i.exec(String(u || "").replace(/^\s+|\s+$/g, ""));
    return m ? { path: m[1], id: m[2].toLowerCase() } : null;
  }
  function intelLang(p) { p = String(p || ""); return EN() ? p.replace(/^\/intel\/(?!en\/)/, "/intel/en/") : p.replace(/^\/intel\/en\//, "/intel/"); }
  function intelRow(x) {
    var ip = intelPath((x && (x.page || x.open_url)) || ""); if (!ip) return null;
    return { id: String(x.id || ip.id), title: cut(x.title || x.title_ar || "", 160), entity: cut(x.entity || "", 120), place: cut(x.market_name || "", 60), deadline: cut(x.deadline || "", 25), url: String(x.url || ""), path: ip.path };
  }
  D.addEventListener("anam-agent:tool-call-completed", function (e) {
    var d = (e && e.detail) || {}; if ((d.toolName || d.name) !== "bassem_intel" || !isBassem()) return;
    var r = intelParse(d.result); if (!r) return;
    var list = []; for (var i = 0; i < r.results.length && list.length < 10; i++) { var x = intelRow(r.results[i]); if (x) list.push(x); }
    if (!list.length) return;
    /* one item (action item / doc): the item being talked about — the search list behind «التانية» stays as it was */
    if (r.action === "item" || r.action === "doc") { INTEL.one = list[0]; if (r.action === "item") tourIntel(list[0]); return; }
    INTEL.items = list; INTEL.t = now();
  }, true);
  function regById(id) { var all = INTEL.items.concat(INTEL.one ? [INTEL.one] : []); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function bareUrl(u) { return String(u || "").replace(/^\s*https?:\/\/(?:www\.)?/i, "").replace(/[\/#?]+$/, "").toLowerCase(); }
  function regByUrl(u) { var b = bareUrl(u), all = INTEL.items.concat(INTEL.one ? [INTEL.one] : []); if (!b) return null; for (var i = 0; i < all.length; i++) if (all[i].url && bareUrl(all[i].url) === b) return all[i]; return null; }
  function curIntel() { var d = fdoc(); try { var ip = ready(d) ? intelPath(d.location.pathname) : null; return ip ? (regById(ip.id) || { id: ip.id, path: ip.path, title: titleOf(d) }) : null; } catch (e) { return null; } }
  /* the Information Center item an open asks for → {path, id, …} | null (null: not an intel item, the platform's own sections take it) */
  function intelTarget(a, s) {
    var u = String(a.url || a.open_url || a.page || ""), ref = String(a.ref || a.id || "").replace(/^\s+|\s+$/g, ""), q = cut(a.title, 120), idx = parseInt(a.index, 10);
    var ip = intelPath(u) || intelPath(ref); if (ip) return regById(ip.id) || { id: ip.id, path: ip.path };
    if (/^https?:\/\//i.test(u)) { var k = regByUrl(u); if (k) return k; } /* the official link of one of his results (url instead of page) */
    /* the platform's own address (janna_lookup's open_url): exactly that item, never an Information Center result that looks like it */
    if (s !== "intel" && /^(?:https?:\/\/(?:www\.)?madeinegyptgate\.com)?\/(?![\/\\])/i.test(u)) return null;
    var rl = ref.toLowerCase();
    if (/^[0-9a-z]{11}$/.test(rl)) { var r1 = regById(rl); if (r1) return r1; if (s === "intel") return { id: rl, path: "/intel/tenders/" + rl + "/" }; } /* the Worker redirects it to the item's own page */
    var c = curIntel(), fresh = INTEL.items.length > 0 && now() - INTEL.t < 3600000;
    /* the title of one of his results, (nearly) as the tool gave it: that result, wherever the screen is (call 2026-11-19 20:18: the
       Kenyan school-furniture tender was looked for on the platform's Egyptian list and «ما لقيتش بند مطابق») */
    if (fresh && q && !(ref && SEC[s])) { var sq = strongIntel(q); if (sq) return sq; }
    /* «افتحلي التانية» right after an Information Center search, while its result is on the screen: his results, not the platform's list */
    if (s === "intel" || (fresh && c && !(ref && SEC[s]))) {
      if (idx > 0) return INTEL.items[idx - 1] || null;
      if (q || ref) { var b = best(INTEL.items.concat(INTEL.one ? [INTEL.one] : []).map(function (x) { return { title: x.title, entity: x.entity + " " + x.place, ref: x.id, x: x }; }), q || ref); if (b && (s === "intel" || covers(b.x, q || ref))) return b.x; }
      if (s === "intel" && !q && !ref) return c || INTEL.one || INTEL.items[0] || null;
    }
    return null;
  }
  /* a platform section named: the words asked must be mostly (≥ 60 % of their letters) in that result's title / buyer / place —
     «بتاعة Rand Water» is that result, one shared «توريد» is not (a platform tender opened while an Information Center page is shown) */
  function covers(x, q) { var ws = words(q), h = norm(x.title + " " + x.entity + " " + x.place + " " + x.id), n = 0, all = 0; for (var i = 0; i < ws.length; i++) { all += ws[i].length; if (h.indexOf(ws[i]) > -1) n += ws[i].length; } return all > 0 && n / all >= 0.6; }
  /* a title that is one of his results' titles (contained either way, ≥ 12 letters) or has 80 % of its words in one */
  function strongIntel(q) {
    var nq = norm(q), wq = words(q), all = INTEL.items.concat(INTEL.one ? [INTEL.one] : []), bestX = null, bs = 0;
    if (nq.length < 12 && wq.length < 3) return null;
    for (var i = 0; i < all.length; i++) {
      var nt = norm(all[i].title); if (!nt) continue;
      if (nt.indexOf(nq) > -1 || (nt.length >= 12 && nq.indexOf(nt) > -1)) return all[i];
      var hit = 0; for (var k = 0; k < wq.length; k++) if (nt.indexOf(wq[k]) > -1) hit++;
      var r = wq.length ? hit / wq.length : 0; if (r > bs) { bs = r; bestX = all[i]; }
    }
    return wq.length >= 3 && bs >= 0.8 ? bestX : null;
  }
  /* the item's own page on the Information Center (worker-intel pages.js itemHtml): title, summary, the facts list, status, official link */
  function intelRead(d) {
    var o = detail(d), main = d.querySelector("main") || d.body, ip = intelPath(d.location.pathname);
    o.id = ip ? ip.id : ""; o.page = ip ? ip.path : ""; o.ok = !!main.querySelector(".sx-facts"); o.summary = ""; o.sumOrig = false;
    var st = main.querySelector(".sx-chips .sx-st:not(.sx-orig)"); if (st && shown(st)) o.status = tx(st); /* not the «بلغة المصدر» chip */
    var card = main.querySelector(".sx-main .card2"), ps = card ? card.querySelectorAll("p") : [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], t = tx(p); if (/(^|\s)note(\s|$)/.test(p.className) || p.querySelector("a") || t.length < 20) continue;
      var pv = p.previousElementSibling; o.sumOrig = !!(pv && /(^|\s)note(\s|$)/.test(pv.className) && /(مقتطف|excerpt)/i.test(tx(pv)));
      o.summary = cut(t, 600); o.sumEl = p; break;
    }
    var off = main.querySelector("a.btn-gold[href]"); o.official = off || null; o.url = off ? String(off.href || "") : "";
    var notes = card ? card.querySelectorAll("p.note") : [];
    for (var j = 0; j < notes.length; j++) if (/(مصدر رسمي|Official source|خبر عن طرح|News about a tender)/i.test(tx(notes[j]))) { o.source = cut(tx(notes[j]), 160); break; }
    /* the walk: the item, what is requested, who, where, the deadline, the value, the official document */
    var fk = function (re) { for (var k = 0; k < o.facts.length; k++) if (re.test(o.facts[k].k)) return o.facts[k]; return null; };
    var mk = [], h = main.querySelector("h1");
    if (h && shown(h)) mk.push({ el: h, lab: T("الفرصة", "Opportunity") });
    if (o.sumEl && shown(o.sumEl)) mk.push({ el: o.sumEl, lab: o.sumOrig ? T("من نص المصدر", "From the source") : T("المطلوب", "What is requested") });
    [[/^(الجهة|Entity)/i, "entity", ["الجهة", "Buyer"]], [/^(السوق|Market)/i, "place", ["البلد", "Country"]], [/(آخر موعد|Deadline)/i, "deadline", ["آخر موعد", "Deadline"]], [/(القيمة|Value)/i, "amount", ["القيمة", "Value"]]].forEach(function (K) { var f = fk(K[0]); if (f && f.el && shown(f.el)) mk.push({ el: f.el, lab: T(K[2][0], K[2][1]), key: K[1] }); });
    if (off && shown(off)) mk.push({ el: off, lab: T("المستند الرسمي", "Official document"), key: "docs" });
    o.marks = mk;
    return o;
  }
  function intelText(o) {
    var L = [T("مفتوح دلوقتي على الشاشة", "Now open on the shared screen") + " (" + T("مركز المعلومات", "Information Center") + "): " + o.title];
    if (o.status) L.push(T("الحالة: ", "Status: ") + o.status);
    if (o.summary) L.push((o.sumOrig ? T("من نص المصدر: ", "From the source's text: ") : T("المطلوب: ", "What is requested: ")) + o.summary);
    o.facts.forEach(function (p) { L.push(p.k + ": " + p.v); });
    if (o.source) L.push(o.source);
    if (!o.facts.some(function (p) { return AMT_RE.test(p.k) && !p.none; })) L.push(T("(القيمة مش منشورة في المصدر: لو سأل «كام؟» قول كده بصراحة، وماتخمّنش رقم)", "(no value is published at the source: if asked, say so — never guess a figure)"));
    if (o.id) L.push(T("(id الفرصة: " + o.id + " — شروطها ومستنداتها والتأمين من مستندها الرسمي نفسه: bassem_intel بـ action=\"doc\" و id=\"" + o.id + "\")", "(item id: " + o.id + " — its requirements, documents and bid bond from its own official document: bassem_intel with action=\"doc\" and id=\"" + o.id + "\")"));
    L.push(T("(بيانات حقيقية من الشاشة — اذكر منها بس، بإيجاز: الجهة والبلد وآخر ميعاد والمطلوب)", "(real data from the screen — mention only these, briefly: buyer, country, deadline, what is requested)"));
    return L.join("\n").slice(0, 2000);
  }
  /* open one Information Center item on the shared screen and read it (bassem_open_item) */
  function openIntel(it) {
    var path = intelLang(it.path), d0 = fdoc(), here = false;
    try { var ip0 = ready(d0) && d0.readyState === "complete" ? intelPath(d0.location.pathname) : null; here = !!ip0 && ip0.id === it.id; } catch (e) { here = false; }
    if (!here) go(path);
    var wait = here ? Promise.resolve(d0) : until(function () { var d = fdoc(); if (!ready(d) || d.readyState !== "complete" || d === d0) return null; var ip = intelPath(d.location.pathname); return ip && ip.id === it.id && d.querySelector("h1") ? d : null; }, 10000, 220);
    return wait.then(function (d) {
      var known = (it.title ? "«" + it.title + "»" : "") + (it.entity ? T(" — الجهة: ", " — buyer: ") + it.entity : "") + (it.deadline ? T(" — آخر ميعاد: ", " — deadline: ") + it.deadline : "");
      if (!d) return T("صفحة الفرصة لسه ما اتفتحتش على الشاشة. ", "The item's page has not opened on the screen yet. ") + (known ? T("اللي معايا من نتيجة البحث: ", "From the search result: ") + known + "\n" : "") + T("(قول ده بصراحة؛ تفاصيلها كلها من bassem_intel بـ action=\"item\" و id=\"" + it.id + "\")", "(say so; all its details: bassem_intel with action=\"item\" and id=\"" + it.id + "\")");
      return settleText(d).then(function () {
        var o = intelRead(d);
        if (!o.ok) return T("الفرصة دي مبقتش موجودة في مركز المعلومات (اتشالت أو اتقفلت صفحتها). قول ده بصراحة ودوّر تاني بـ bassem_intel.", "This item is no longer on the Information Center (removed). Say so and search again with bassem_intel.");
        LAST = { d: d, o: o, t: now() };
        tour(o.marks, 1500);
        holoFacts(o, ISEC);
        var fv = function (re) { for (var k = 0; k < o.facts.length; k++) if (re.test(o.facts[k].k)) return o.facts[k].v; return ""; };
        emitRes("bassem_open_item", o.title, 1, [{ title: o.title, entity: fv(/^(الجهة|Entity)/i), deadline: fv(/(آخر موعد|Deadline)/i), ref: o.id, url: o.page ? "https://madeinegyptgate.com" + o.page : o.url }]);
        return intelText(o);
      });
    });
  }
  /* action "item" of bassem_intel: data/bassem-intel-view.js opens the item's page on the screen; Bassem's pointer walks it here */
  function tourIntel(it) {
    until(function () { var d = fdoc(); if (!ready(d) || d.readyState !== "complete") return null; var ip = intelPath(d.location.pathname); return ip && ip.id === it.id && d.querySelector("h1") ? d : null; }, 9000, 250).then(function (d) {
      if (!d) return;
      settleText(d).then(function () { var o = intelRead(d); if (!o.ok) return; LAST = { d: d, o: o, t: now() }; showScreen(); tour(o.marks, 1500); });
    });
  }
  function intelNone() {
    var L = [T("مش عارف أنهي فرصة من مركز المعلومات تقصد. افتحها بـ url = الـ page بتاعتها، أو ref = الـ id بتاعها، أو index = ترتيبها في نتايج bassem_intel.", "Not sure which Information Center item is meant. Open it with url = its page, ref = its id, or index = its position in the bassem_intel results.")];
    if (INTEL.items.length) L.push(T("آخر نتايج مركز المعلومات: ", "Latest Information Center results: ") + INTEL.items.slice(0, 5).map(function (x, i) { return (i + 1) + ") " + x.title + (x.entity ? " — " + x.entity : "") + " [id " + x.id + "]"; }).join(" ؛ "));
    return L.join("\n");
  }

  /* ---------- tool: bassem_open_item {section, ref?, title?, index?} ---------- */
  function openItem(a) {
    var s0 = String(a.section || "").toLowerCase();
    var s = s0; if (!SEC[s]) s = "tenders"; if (s === "market") s = "products"; if (s === "awards") s = "winners";
    var S = SEC[s], ref = cut(a.ref, 80), q = cut(a.title, 120), idx = parseInt(a.index, 10);
    if (!fr()) return Promise.resolve(T("شاشة باسم مش مفتوحة دلوقتي، افتح المكالمة الأول.", "Bassem's screen is not open."));
    showScreen();
    /* an Information Center item (bassem_intel's results): its own page there — never the platform's Egyptian lists */
    var iT = intelTarget(a, s0);
    if (iT) return openIntel(iT);
    if (s0 === "intel") return Promise.resolve(intelNone());
    var d0 = fdoc(), cur = ready(d0) ? pageOf(d0) : "";
    /* the item's own address from janna_lookup / janna_item (open_url): this site only, never another one */
    var u = String(a.url || a.open_url || ""), um = /^(?:https?:\/\/(?:www\.)?madeinegyptgate\.com)?(\/[^\s"'<>\\]*)$/i.exec(u);
    if (um && !sameSite(um[1])) um = null; /* «//other.site/…» is not this site (review #6) */
    /* a LIST link (tenders/search/#OFF:1 — janna_lookup's old `url`) is not the item: its number may be shared → by number + title */
    var lm = um && /^\/(tenders|rfq)\/search\/?#(.+)$/.exec(um[1]); if (lm && (s === "tenders" || s === "rfqs")) { try { ref = cut(decodeURIComponent(lm[2]), 80); } catch (e) { ref = cut(lm[2], 80); } um = null; u = ""; }
    if (u && !um && !ref && !q && !(idx > 0)) return Promise.resolve(T("الرابط ده مش صفحة من المنصة، فمفتحتوش على الشاشة. افتح البند بالـ url اللي راجع من janna_lookup أو بـ index.", "That link is not a page of this platform, so it was not opened. Use the url from janna_lookup, or an index."));
    /* a tender id from janna_lookup / platform_item: eg-tnd-NNN is that tender's own page (review #3) */
    if (!um && s === "tenders" && /^eg-tnd-\d{1,4}$/i.test(ref)) um = [u, "/tender-item/" + ref.toLowerCase() + "/"];
    if (um && um[1].length > 1) {
      var dl1 = d0 && openDialog(d0); if (dl1) { var x1 = dl1.querySelector(".x"); if (x1) x1.click(); }
      go(um[1]);
      var seenU = 0;
      return until(function () { var d = fdoc(); if (!ready(d) || d.readyState !== "complete") return null; if (openDialog(d) && (d !== d0 || /#/.test(um[1]))) return d; if (d !== d0 && d.querySelector("h1")) { if (!seenU) seenU = now(); return now() - seenU > 800 ? d : null; } return null; }, 11000, 220)
        .then(function (d) { return d ? sleep(400).then(function () { return shownItem(d, S); }) : T("صفحة البند لسه ما اتفتحتش على الشاشة.", "The item's page has not opened on the screen yet."); });
    }
    /* tenders / RFQs by number: found on the list itself (numbers are NOT unique — OFF:1 ×5, OFF: ×10 …) */
    if (ref && (s === "tenders" || s === "rfqs")) return openByRef(S, ref.replace(/^intl-/i, ""), q, d0, cur);
    if (ref && (s === "factories" || s === "suppliers") && /^x?\d+$/.test(ref)) { go("company.html#" + ref); return itemPage(d0, S, "company"); }
    if (ref && s === "projects" && /^[a-z]{0,3}\d+$/i.test(ref)) { go("project.html#" + ref); return itemPage(d0, S, "project"); }
    /* by position on the list that is on the screen now, or by title through the page's own search box */
    var onList = cur === S.key ? Promise.resolve(d0) : (go(S.file), newPage(d0, function (d) { return pageOf(d) === S.key; }, 9000));
    return onList.then(function (d) {
      if (!d) return T("صفحة " + S.noun[0] + " ما اتفتحتش على الشاشة لسه.", "The " + S.noun[1] + " page has not opened on the screen yet.");
      closeDialogs(d); /* the item opened before goes away first */
      var step = q || (ref && !(idx > 0)) ? (typeIn(d, S, q || ref), sleep(500).then(function () { return settled(d, S, 3000); })) : settled(d, S, 2500);
      return step.then(function () {
        var list = cards(d, S).map(function (c) { return cardFacts(S, c); }), pick = idx > 0 ? list[idx - 1] : best(list, q || ref);
        if (!pick) return notFound(S, q || ref || ("#" + idx));
        return clickCard(S, pick);
      });
    });
  }
  function closeDialogs(d) { for (var g0 = openDialog(d), k0 = 0; g0 && k0 < 3; g0 = openDialog(d), k0++) { var xg = g0.querySelector(".x, [data-close]"); if (!xg) break; xg.click(); } }
  /* one card on the list on the screen: pointed at, "clicked", its details read once they show */
  function clickCard(S, pick) {
    scrollTo(pick.el, "center");
    return sleep(RM() ? 80 : 560).then(function () {
      pointTo(pick.el, true); ring(pick.el, T("بفتح دي", "Opening this"), 1400);
      return sleep(RM() ? 100 : 900).then(function () {
        var d1 = fdoc(), ln = pick.el.tagName === "A" ? pick.el : null, op = pick.el.querySelector("[data-open]");
        if (op) op.click(); else if (ln && ln.getAttribute("href")) { try { fwin().location.href = ln.href; } catch (e) { ln.click(); } } else pick.el.click();
        return ln && !op ? itemPage(d1, S, "") : until(function () { var d2 = fdoc(); return ready(d2) && openDialog(d2) ? d2 : null; }, 6000, 200).then(function (d2) { return d2 ? shownItem(d2, S) : T("فتحت «" + pick.title + "» بس تفاصيله لسه ما ظهرتش.", "Opened “" + pick.title + "” but its details are not shown yet.") + "\n" + factLine(pick); });
      });
    });
  }
  /* a tender / RFQ by its list number (review #3, QA H3): on the list page (opened without #ref, or the one already on the screen —
     a second open of the same number needs no hashchange), the page's own search box narrows the list to the title (or the number),
     and the card whose number is that one — any letter case, with or without «OFF:» — is opened; several cards sharing it: the title
     picks one, else the candidates are said (never the first one as if it were the asked one). A number the list does not have goes
     through the page's own #<ref>: a sourced tender forwards to its own page, which is read as the item. */
  function refKey(r) { return norm(String(r || "").replace(/^\s*off:\s*/i, "")); }
  function openByRef(S, ref, q, d0, cur) {
    var onList = cur === S.key ? Promise.resolve(d0) : (go(S.file), newPage(d0, function (d) { return pageOf(d) === S.key && cards(d, S).length > 0; }, 9000));
    return onList.then(function (d) {
      if (!d) return T("صفحة " + S.noun[0] + " ما اتفتحتش على الشاشة لسه.", "The " + S.noun[1] + " page has not opened on the screen yet.");
      closeDialogs(d);
      var exact = /^\s*off:/i.test(ref) ? norm(ref) : "", kq = refKey(ref);
      var match = function () { return cards(d, S).map(function (c, i) { var f = cardFacts(S, c); f.pos = i + 1; return f; }).filter(function (f) { return f.ref && (exact ? norm(f.ref) === exact : refKey(f.ref) === kq); }); };
      var look = function (w) { typeIn(d, S, w); return sleep(500).then(function () { return settled(d, S, 3000); }).then(match); };
      return look(q || ref).then(function (m) { return !m.length && q ? look(ref) : m; }).then(function (m) {
        if (m.length > 1 && q) { var b = best(m, q); if (b) m = [b]; }
        if (m.length === 1) return clickCard(S, m[0]);
        if (m.length > 1) {
          tour(m.slice(0, 3).map(function (f) { return { el: f.el, lab: T("رقم ", "No. ") + f.ref + " · " + f.pos }; }), 1300);
          return T("الرقم «" + ref + "» مشترك بين " + m.length + " على شاشة " + S.noun[0] + " — مش بند واحد. اسأل العضو يقصد أنهي واحد، وافتحه بـ index (رقمه على الشاشة) أو بالـ url:", "The number “" + ref + "” is shared by " + m.length + " items on the " + S.noun[1] + " screen — not one item. Ask which one, then open it by index (its number on the screen) or url:") + "\n" + m.slice(0, 6).map(function (f) { return factLine(f, f.pos - 1); }).join("\n");
        }
        return viaHash(d, S, ref);
      });
    });
  }
  function viaHash(d, S, ref) {
    var w = fwin(), h = "#" + encodeURIComponent(ref);
    try { if (w && w.location.hash === h) w.history.replaceState(null, "", w.location.pathname + w.location.search); } catch (e) {} /* the same #ref again would fire no hashchange */
    go(S.file + h);
    var t0 = now(), last = null, since = 0;
    return until(function () {
      var d2 = fdoc(); if (!ready(d2)) return null;
      if (d2 === d || pageOf(d2) === S.key) { var g = openDialog(d2), c = ctxOf(d2); if (g && c && refKey(c.id) === refKey(ref)) return d2; return now() - t0 > 3500 ? "none" : null; }
      if (d2 !== last) { last = d2; since = now(); } /* forwarded (opportunity.html → the item's own page): read it once it stays */
      return d2.readyState === "complete" && d2.querySelector("h1") && now() - since > 900 ? d2 : null;
    }, 7000, 200).then(function (x) { return x && x !== "none" ? sleep(300).then(function () { return shownItem(fdoc(), S); }) : notFound(S, ref); });
  }
  /* an item that opens as its own page (factory profile, project, award …) */
  function itemPage(d0, S, type) {
    return newPage(d0, function (d) { var c = ctxOf(d); return (!type || (c && String(c.type || "").indexOf(type) > -1) || !!d.querySelector("h1")) && !!d.querySelector("h1"); }, 10000).then(function (d) {
      return d ? sleep(600).then(function () { return shownItem(d, S); }) : T("صفحة البند لسه ما اتفتحتش على الشاشة.", "The item's page has not opened on the screen yet.");
    });
  }
  /* the structured twin of a search / an opened item for Bassem's memory (data/bassem-memory.js): window "mig:screen-result"
     {tool, query, count, items:[{title, entity, deadline, ref, url}]} — the same facts the text gives the LLM (consolidation 2026-11-19:
     the memory parsed an earlier wording of these texts and stored nothing with the final one) */
  function numOf(s) { var m = /([0-9\u0660-\u0669][0-9\u0660-\u0669,\u066c]*)/.exec(String(s || "")); return m ? +m[1].replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).replace(/[,\u066c]/g, "") : null; }
  function emitRes(tool, query, count, list) {
    try {
      var items = (list || []).slice(0, 5).map(function (f) { return { title: cut(f.title, 200), entity: cut(f.entity || "", 120), deadline: cut(f.deadline || "", 25), ref: cut(f.ref || "", 64), url: cut(f.url || "", 300) }; }).filter(function (x) { return !!x.title; });
      if (items.length) W.dispatchEvent(new CustomEvent("mig:screen-result", { detail: { tool: tool, query: cut(query, 200), count: count, items: items } }));
    } catch (e) {}
  }
  /* what came of an open (critic D): window "mig:tool-outcome" {tool, outcome} — data/bassem-memory.js keeps it on the call's tool record,
     and the Worker lists an item that never opened under «لسه ماتمّش», never under «اتفتح». ONE outcome per call, on every path (start()),
     so the memory's per-tool FIFO stays aligned: ok = the item is on the screen (detailText / clickCard), anything else = refused */
  var OPENED = /^(مفتوح دلوقتي على الشاشة|Now open on the shared screen|فتحت «|Opened “)/;
  function outcomeOf(tool, st) { try { W.dispatchEvent(new CustomEvent("mig:tool-outcome", { detail: { tool: tool, outcome: st } })); } catch (e) {} }
  function shownItem(d, S) {
    return settleText(d).then(function () {
      var o = detail(d);
      LAST = { d: d, o: o, t: now() };
      tour(o.marks, 1500);
      holoFacts(o, S);
      var fk = function (re) { for (var i = 0; i < o.facts.length; i++) if (!o.facts[i].none && re.test(o.facts[i].k)) return o.facts[i].v; return ""; };
      emitRes("bassem_open_item", o.title, 1, [{ title: o.title, entity: fk(KEYS[0][1]), deadline: fk(/(آخر موعد|موعد|Deadline|Closing)/i), ref: o.ref || fk(/^(رقم|Ref|No\.)/i), url: o.url }]);
      return detailText(o, T(S.noun[0], S.noun[1]));
    });
  }
  /* the item's text stops changing (2 polls); in English also until its labels are translated — the site translates after rendering (QA M6) */
  function settleText(d) {
    var last = "", same = 0, t0 = now();
    return until(function () {
      var root = openDialog(d) || d.querySelector("main") || d.body; if (!root) return true;
      var labs = [].map.call(root.querySelectorAll("dt, h1, h2"), tx).join("|"), sig = labs + "#" + tx(root).length;
      if (sig === last) same++; else { same = 0; last = sig; }
      if (EN() && /[\u0600-\u06FF]/.test([].map.call(root.querySelectorAll("dt"), tx).join("")) && now() - t0 < 2000) return null;
      return same >= 2 ? true : null;
    }, 2600, 150);
  }
  function notFound(S, what) {
    return T("مالقيتش على شاشة " + S.noun[0] + " بند مطابق لـ «" + what + "». قول ده للعضو بصراحة، واقترح تدوّر بكلمة تانية (janna_search) أو تفتح من النتايج اللي ظاهرة.", "Nothing on the " + S.noun[1] + " screen matches “" + what + "”. Say so honestly and suggest another search (janna_search) or one of the visible results.");
  }
  /* the item's key facts on the hologram (data/holo.js) */
  function holoFacts(o, S) {
    var H2 = W.MIGHOLO; if (!H2 || !H2.result) return;
    var items = [{ title: o.title, sub: T(S.noun[0], S.noun[1]) + (o.status ? " · " + o.status : "") }];
    o.marks.forEach(function (m) { if (!m.key || m.key === "docs") return; var p = null; for (var i = 0; i < o.facts.length; i++) if (o.facts[i].el === m.el) p = o.facts[i]; if (p) items.push({ title: p.v, sub: p.k }); else if (m.key === "amount" && o.value) items.push({ title: o.value, sub: m.lab }); });
    if (o.docs.length) items.push({ title: o.docs[0].t, sub: T("المستندات / المصدر", "Documents / source") });
    try { H2.result({ tool: "bassem_open_item", count: null, items: items.slice(0, 6) }); } catch (e) {}
  }

  /* ---------- tool: bassem_screen {action, target?} ---------- */
  var CUR = { doc: null, i: -1 };
  function screenAct(a) {
    var act = String(a.action || ""), d = fdoc(), w = fwin();
    if (!fr() || !ready(d)) return Promise.resolve(T("الشاشة مش جاهزة دلوقتي.", "The screen is not ready."));
    showScreen();
    if (act === "scroll_down" || act === "scroll_up") {
      var dlg = openDialog(d), sc = dlg && dlg.scrollHeight > dlg.clientHeight + 20 ? dlg : null, h = sc ? sc.clientHeight : w.innerHeight, dy = Math.round(h * 0.7) * (act === "scroll_up" ? -1 : 1);
      try { (sc || w).scrollBy({ top: dy, behavior: RM() ? "auto" : "smooth" }); } catch (e) { if (sc) sc.scrollTop += dy; else w.scrollBy(0, dy); }
      var l = layer(); if (l) { var f = fr().getBoundingClientRect(), s2 = l.scr.getBoundingClientRect(); l.ptr.classList.add("on"); l.ptr.style.transform = "translate(" + Math.round(f.left - s2.left + f.width / 2) + "px," + Math.round(f.top - s2.top + (act === "scroll_up" ? f.height * 0.25 : f.height * 0.7)) + "px)"; }
      return sleep(RM() ? 120 : 800).then(function () { return T("نزلت/طلعت في الصفحة. الظاهر دلوقتي:\n", "Scrolled. Now visible:\n") + visibleText(d); });
    }
    if (act === "next_result" || act === "prev_result") {
      var s = secOfPage(pageOf(d)), S = SEC[s];
      if (!S) return Promise.resolve(T("الصفحة اللي على الشاشة مش قايمة نتايج. ", "The page on screen is not a results list. ") + pageSummary(d));
      var g = openDialog(d); if (g) { var x = g.querySelector(".x, [data-close]"); if (x) x.click(); }
      var cs = cards(d, S); if (!cs.length) return Promise.resolve(T("مفيش نتايج ظاهرة على الشاشة.", "No results are visible on the screen."));
      if (CUR.doc !== d) { CUR.doc = d; CUR.i = -1; }
      CUR.i = Math.max(0, Math.min(cs.length - 1, CUR.i + (act === "next_result" ? 1 : -1)));
      var c = cs[CUR.i], fct = cardFacts(S, c);
      scrollTo(c, "center");
      return sleep(RM() ? 80 : 560).then(function () { pointTo(c, false); ring(c, T("نتيجة ", "Result ") + (CUR.i + 1), 3200); return T("النتيجة رقم " + (CUR.i + 1) + " من " + cs.length + " الظاهرين: ", "Result " + (CUR.i + 1) + " of " + cs.length + " shown: ") + factLine(fct) + "\n" + T("(لفتحها: bassem_open_item {section:\"" + s + "\", index:" + (CUR.i + 1) + "})", "(to open it: bassem_open_item {section:\"" + s + "\", index:" + (CUR.i + 1) + "})"); });
    }
    if (act === "back") {
      var dg = openDialog(d);
      if (dg) { var bx = dg.querySelector(".x, [data-close], .jc-cx"); pointTo(bx || dg, true); return sleep(RM() ? 80 : 700).then(function () { if (bx) bx.click(); else try { d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {} return sleep(400).then(function () { return T("قفلت التفاصيل ورجعت للقايمة.\n", "Closed the details, back to the list.\n") + pageSummary(fdoc()); }); }); }
      /* the page the tools opened before this one — never the browser's history.back(), which can take the whole page (and the call) back */
      var here0 = hrefOf(d), prev = "";
      while (HIST.length && !prev) { var h0 = HIST.pop(); if (h0 && h0 !== here0) prev = h0; }
      if (!prev) return Promise.resolve(T("مفيش صفحة قبلها على الشاشة — دي أول صفحة اتفتحت في المكالمة دي.", "There is no previous page on the screen — this is the first one opened in this call."));
      go(prev); var tb = now();
      return until(function () { var d2 = fdoc(); if (!ready(d2)) return null; if (d2 !== d) return d2; return hrefOf(d2) === prev && now() - tb > 700 ? d2 : null; }, 6000, 200)
        .then(function (d2) { return d2 ? sleep(500).then(function () { return T("رجعت للصفحة اللي قبلها على الشاشة.\n", "Went back on the screen.\n") + pageSummary(d2); }) : T("الصفحة اللي قبلها لسه بتحمّل على الشاشة.", "The previous page is still loading on the screen."); });
    }
    if (act === "highlight") {
      var el = findText(d, a.target);
      if (!el) return Promise.resolve(T("مالقيتش «" + cut(a.target, 60) + "» على الشاشة.", "Could not find “" + cut(a.target, 60) + "” on the screen."));
      scrollTo(el, "center");
      return sleep(RM() ? 80 : 560).then(function () {
        pointTo(el, false); ring(el, cut(a.target, 40), 3600);
        var v = el.tagName === "DT" && el.nextElementSibling ? tx(el.nextElementSibling) : ""; if (el.tagName === "DT" && (v === "—" || v === "-")) v = T("مش منشور على الشاشة دي", "not published on this screen");
        return T("علّمت على: ", "Highlighted: ") + cut(tx(el), 200) + (v ? " — " + v : "");
      });
    }
    return Promise.resolve(T("الحركة دي مش معروفة: ", "Unknown action: ") + act);
  }
  function findText(d, t) {
    var q = norm(t); if (!q) return null;
    var root = openDialog(d) || d.body, l = root.querySelectorAll("dt, h1, h2, h3, h4, b, strong, label, a, button, .chip, .st2, .k, th, dd, small"), bestEl = null, bl = 1e9;
    for (var i = 0; i < l.length; i++) { var s = norm(tx(l[i])); if (s && s.indexOf(q) > -1 && s.length < bl && shown(l[i])) { bestEl = l[i]; bl = s.length; } }
    if (!bestEl && /(المبلغ|القيمه|قيمه|السعر|ثمن|التامين|الفلوس|كام|amount|value|price|cost|bond|fee)/i.test(q)) {
      var big = root.querySelector(".big-val"); if (big && shown(big)) return big;
      var dts = root.querySelectorAll("dt"); for (var k = 0; k < dts.length; k++) if (shown(dts[k]) && AMT_RE.test(tx(dts[k]))) return dts[k];
    }
    return bestEl;
  }
  /* the headings / cards / fields that are inside the screen's viewport now */
  function visibleText(d) {
    var w = d.defaultView, H0 = w.innerHeight, out = [], seen = {}, l = d.querySelectorAll("h1, h2, h3, h4, dt, p, .ol-it h3, a.fc h3, article.pc .t, a.pj .top b");
    for (var i = 0; i < l.length && out.length < 9; i++) {
      if (l[i].tagName === "P" && (tx(l[i]).length < 25 || (l[i].closest && l[i].closest("a, button, footer, nav")))) continue; var r = l[i].getBoundingClientRect(); if (r.bottom < 0 || r.top > H0 || !shown(l[i])) continue; var t = tx(l[i]); if (l[i].tagName === "DT" && l[i].nextElementSibling) t += ": " + tx(l[i].nextElementSibling); t = cut(t, 110); if (t && !seen[t]) { seen[t] = 1; out.push(t); } }
    return out.length ? out.join("\n") : pageSummary(d);
  }

  /* ---------- the screen follows his words (QA M7): janna-live.js hands over the persona's text stream; a field of the item just opened
     that he names (its label, or its value) is pointed at as he says it — the timed walk then stops ---------- */
  var LAST = null, FOL = { id: "", n: 0, k: "", t: 0 };
  var SAY = [["entity", /(الجه[هة]|الشرك[هة]|المالك|entity|buyer|owner)/i], ["deadline", /(آخر موعد|اخر موعد|آخر ميعاد|اخر ميعاد|الموعد|الميعاد|deadline|closing)/i],
    ["amount", /(المبلغ|القيم[هة]|الكراس[هة]|التأمين|التامين|ثمن|السعر|amount|value|price|bond|booklet)/i], ["place", /(المحافظ[هة]|المكان|الموقع|governorate|location)/i],
    ["activity", /(النشاط|القطاع|activity|sector)/i], ["docs", /(المستندات|المصدر|الإعلان|documents|source|notice)/i]];
  function follow(text, id) {
    if (!LAST || !isBassem()) return;
    if (fdoc() !== LAST.d || now() - LAST.t > 180000) { LAST = null; return; }
    text = String(text || ""); id = String(id || "");
    if (id !== FOL.id) { FOL.id = id; FOL.n = 0; }
    var from = Math.max(0, FOL.n - 24), fresh = text.slice(from), base = FOL.n - from; FOL.n = text.length; if (!fresh) return;
    /* the field named LAST in what he just said (a word cut between two chunks is still caught by the 24-character overlap) */
    var nf = norm(fresh), hit = null, best = base;
    LAST.o.marks.forEach(function (m) {
      if (!m.el || !m.key || !shown(m.el)) return;
      for (var i = 0; i < SAY.length; i++) if (SAY[i][0] === m.key) { var re = new RegExp(SAY[i][1].source, "gi"), x; while ((x = re.exec(fresh))) { if (x.index + x[0].length > best) { best = x.index + x[0].length; hit = m; } } }
      var v = norm(tx(m.el)).slice(0, 24), at = v.length >= 6 ? nf.lastIndexOf(v) : -1; if (at > -1 && at + v.length > best) { best = at + v.length; hit = m; }
    });
    if (!hit || (FOL.k === hit.lab && now() - FOL.t < 4000)) return;
    FOL.k = hit.lab; FOL.t = now(); tourN++;
    scrollTo(hit.el, "center");
    setTimeout(function () { pointTo(hit.el, false); ring(hit.el, hit.lab, 3200); }, RM() ? 60 : 380);
  }

  /* ---------- one tool call = one job ---------- */
  var OBS = { janna_search: watchSearch, janna_navigate: watchNavigate, bassem_open_opportunity: watchOpportunity };
  var OWN = { bassem_open_item: openItem, bassem_screen: screenAct };
  /* the longest a handler waits before answering with what is there (keep under the tool's toolTimeoutSeconds) */
  /* each ≈ 1.5 s under its toolTimeoutSeconds in anam/tools.json (12 · 10 · 12 · 12 · 10 s): an answer after the engine's timeout is lost */
  var LIMIT = { janna_search: 10500, janna_navigate: 8500, bassem_open_opportunity: 10500, bassem_open_item: 10500, bassem_screen: 8000 };
  var JOBS = [];
  function keyOf(n, a) { try { return n + "|" + JSON.stringify(a || {}); } catch (e) { return n; } }
  function job(n, a) {
    var j = { n: n, k: keyOf(n, a), t: now(), done: false }; j.p = new Promise(function (r) { j.res = function (v) { if (j.done) return; j.done = true; r(v); }; });
    JOBS.push(j); if (JOBS.length > 30) JOBS.splice(0, JOBS.length - 30); return j;
  }
  function find(n, a) {
    var k = keyOf(n, a), t = now(), i, j;
    for (i = JOBS.length - 1; i >= 0; i--) { j = JOBS[i]; if (j.k === k && !j.claimed && t - j.t < 4000) return j; }
    for (i = JOBS.length - 1; i >= 0; i--) { j = JOBS[i]; if (j.n === n && !j.claimed && t - j.t < 1500) return j; } /* same call, arguments reported differently */
    return null;
  }
  /* the pages the tools opened, for «back» inside the screen (review #2) */
  var HIST = [];
  function hrefOf(d) { try { return ready(d) ? String(d.location.href) : ""; } catch (e) { return ""; } }
  function remember() { var h = hrefOf(fdoc()); if (h && HIST[HIST.length - 1] !== h) { HIST.push(h); if (HIST.length > 20) HIST.shift(); } }
  function start(n, a, j) {
    var d0 = fdoc(), f = OWN[n] || OBS[n];
    if (n !== "bassem_screen") remember();
    tourN++; unring(); if (n !== "bassem_screen") hidePtr(); frameCss(); LAST = n === "bassem_screen" ? LAST : null;
    /* the observed tools: run() navigates right after this returns, so the document of NOW is the old one */
    setTimeout(function () {
      var p; try { p = f(a, d0); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function (v) { v = String(v == null ? "" : v); if (n === "bassem_open_item") outcomeOf(n, OPENED.test(v) ? "ok" : "refused"); j.res(v); }, function (e) { if (n === "bassem_open_item") outcomeOf(n, "failed"); j.res(T("حصلت مشكلة وأنا بقرا الشاشة: ", "Problem reading the screen: ") + String((e && e.message) || e || "")); });
    }, OWN[n] ? 0 : 60);
    setTimeout(function () { j.res(partial(n)); }, LIMIT[n] || 12000);
  }
  function partial(n) { var d = fdoc(); return T("لسه الشاشة بتجهز — ده اللي ظاهر لحد دلوقتي:\n", "The screen is still getting ready — this is what shows so far:\n") + (ready(d) ? pageSummary(d) : T("الصفحة بتحمّل", "loading")); }
  /* run() asks first: true = this file runs that tool (the new ones); the watched ones stay with run() */
  function take(n, a) {
    a = args(a); if (!isBassem()) return false; /* Janna's calls: run() as before, nothing of Bassem's (review #1) */
    if (OWN[n]) { var j = job(n, a); start(n, a, j); return true; }
    if (OBS[n]) { var j2 = job(n, a); start(n, a, j2); }
    return false;
  }
  function busy() { var t = now(), n = 0; JOBS.forEach(function (j) { if (!j.done && t - j.t < 20000) n++; }); return n; }
  function handler(n) {
    return { onStart: function (pl) {
      var a = args(pl && pl.arguments), j = find(n, a);
      /* the DOM path (run) did not see this call (deduplicated, or no screen yet): run it now, once */
      if (!j && H && H.run) { try { H.run(n, a); } catch (e) {} j = find(n, a); }
      if (!j) { j = job(n, a); start(n, a, j); }
      j.claimed = true;
      return j.p;
    } };
  }
  var CLIENTS = [];
  function attach(c, host) {
    if (host && host.persona && host.persona !== "bassem") return false; /* review #1 */
    if (host) H = host;
    if (!c || typeof c.registerToolCallHandler !== "function" || CLIENTS.indexOf(c) > -1) return false;
    CLIENTS.push(c); if (CLIENTS.length > 4) CLIENTS.shift();
    for (var n in OBS) c.registerToolCallHandler(n, handler(n));
    for (var m in OWN) c.registerToolCallHandler(m, handler(m));
    try { layer(); } catch (e) {}
    return true;
  }
  /* the screen in one paragraph (the continuation's context for the next session) */
  function screenText() { var d = fdoc(); return ready(d) ? pageSummary(d).replace(/\n/g, " · ").slice(0, 600) : ""; }

  /* the client tools' definitions as Anam takes them (POST /v1/tools; copy in anam/bassem-client-tools.json) */
  var DEFS = [
    { name: "bassem_open_item", type: "CLIENT", description: "Open ONE specific item on the shared screen (its own page or dialog) and point at its key fields (entity, amount, deadline, documents) while you talk. Use it after janna_lookup / janna_search / platform_item / bassem_intel results, or when the member says «افتحلي دي» or «التانية». Best: url = the result's open_url; else index = its number in the list on the screen; a tender id (eg-tnd-003) also works as ref. A bassem_intel result: section=intel and url = its open_url (or ref = its id, or index = its position in those results). Tender list numbers are NOT unique (OFF:1 is shared by several tenders): with a ref pass the title too. The call waits for the screen and returns the item's real details as shown: say the 2-3 facts that matter, never invent a missing one. If it says not found or still loading, say so honestly and never claim it is open. While it runs you may say «ثواني، بفتحلك التفاصيل».",
      config: { awaitResult: true, toolTimeoutSeconds: 12, parameters: { type: "object", properties: {
        section: { type: "string", enum: ["tenders", "rfqs", "factories", "suppliers", "products", "projects", "winners", "intel"], description: "Which section the item is in (awards / الترسيات = winners, a company = factories, a bassem_intel result = intel)." },
        ref: { type: "string", description: "The item's reference as returned by janna_search / janna_lookup (tender id like eg-tnd-003, tender number like OFF:6/2026/2027 — not unique, add the title —, RFQ number, company id like x0, project id like r015), or a bassem_intel result's id. Never make one up." },
        title: { type: "string", description: "The item's title or company name when there is no ref." },
        index: { type: "integer", minimum: 1, description: "Position (1 = first) in the results list currently on the shared screen (section=intel: in the last bassem_intel results), e.g. «التانية» = 2." },
        url: { type: "string", description: "The item's open_url from janna_lookup or bassem_intel (this site only) — the most direct way to open it." } }, required: ["section"] } } },
    { name: "bassem_screen", type: "CLIENT", description: "Drive the shared screen while talking: scroll_down / scroll_up the page, next_result / prev_result to walk through the results list one by one (highlighted), back to close the open details or go to the previous page, highlight to point at a word or field on screen (target = the text, e.g. 'آخر موعد', 'الجهة'). Returns what is visible after the action.",
      config: { awaitResult: true, toolTimeoutSeconds: 10, parameters: { type: "object", properties: {
        action: { type: "string", enum: ["scroll_down", "scroll_up", "next_result", "prev_result", "back", "highlight"] },
        target: { type: "string", description: "For highlight: the text on screen to point at." } }, required: ["action"] } } }
  ];

  W.MIG_LIVE_TOOLS = { __v: 3, attach: attach, take: take, busy: busy, screenText: screenText, follow: follow, defs: DEFS,
    /* test / debug hooks */ _t: { detail: detail, pageSummary: pageSummary, cards: cards, cardFacts: cardFacts, SEC: SEC, tour: tour, showScreen: showScreen,
      intelPath: intelPath, intelTarget: intelTarget, intelRead: intelRead, intelText: intelText, intelLang: intelLang, INTEL: INTEL } };
  /* clients that started before this file arrived (janna-live.js queues them) */
  var Q = W.__migLTQ || []; W.__migLTQ = null;
  for (var qi = 0; qi < Q.length; qi++) { try { attach(Q[qi][0], Q[qi][1]); } catch (e) {} }
})();
