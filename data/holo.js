/* «الشاشة الضوئية» — holographic workspace for Janna & Bassem.
   While the on-site AI character works (live video tool calls, or any engine that reports an action) the visitor SEES him/her
   open a laptop: the lid opens in 3D, the screen powers on with live mini-charts, a cone of light rises from the screen and
   translucent cyan glass panels fly out one by one and float around (task title, live steps checklist, task-progress ring,
   abstract activity chart, an «AI» chip and one main panel: real results harvested from the page, an e-mail being typed,
   the deal pipeline, contracting-guide steps, notification chips…). When the action ends the panels fly back into the screen
   and the lid closes (or stays open when another action follows: actions are queued, never two laptops).
   Self-contained: no libraries, no network; ES5 + injected CSS. Charts/rings are decorative (rings = task progress %, charts =
   unlabeled activity waves); results only ever show what is really on the page.
   API (safe any time, even before DOMContentLoaded):
     MIGHOLO.act(toolName, args, opts)  — known tools → fitting scene (opts: {who, anchor, title})
     MIGHOLO.show({who, title, kind, steps, items, count, anchor}) — custom scene
     MIGHOLO.step(text, state)          — append/update a step ("doing" | "done" | "fail")
     MIGHOLO.result({count, items:[{title, sub, href}], tool?, badge?, title?})  — tool: only that tool's scene; badge: the results header
     MIGHOLO.close() · MIGHOLO.busy() · MIGHOLO.who (default speaker; assignable)
   Auto wiring: document "anam-agent:tool-call-started" (capture, client tools) and window "mig:agent-action" {tool, args, who}. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIGHOLO && W.MIGHOLO.__v) return;

  /* ---------- helpers ---------- */
  function EN() { return W.MIGLANG === "en"; }
  function T(ar, en) { return EN() ? en : ar; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function now() { return new Date().getTime(); }
  function mq(q) { try { return !!(W.matchMedia && W.matchMedia(q).matches); } catch (e) { return false; } }
  function RM() { return mq("(prefers-reduced-motion: reduce)"); }
  function MOB() { return (W.innerWidth || D.documentElement.clientWidth || 1024) <= 640; }
  function str(v, n) { v = v == null ? "" : (Array.isArray(v) ? v.join(T("، ", ", ")) : String(v)); v = v.replace(/\s+/g, " ").trim(); return n && v.length > n ? v.slice(0, n - 1) + "…" : v; }
  function el(tag, cls, html) { var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function vis(e) {
    if (!e || e.hidden) return null;
    var r; try { r = e.getBoundingClientRect(); } catch (x) { return null; }
    if (!r || r.width < 8 || r.height < 8) return null;
    var cs = W.getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
    return r;
  }
  function num(s) { s = String(s == null ? "" : s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 1632; }).replace(/[,،٬]/g, ""); var m = s.match(/\d+/); return m ? +m[0] : null; }
  var BASE = (function () {
    var s = D.currentScript && D.currentScript.src;
    if (s && /\/data\/holo\.js/.test(s)) return s.replace(/data\/holo\.js.*$/, "");
    return "";
  })();
  var NM = { janna: ["جنة", "Janna"], bassem: ["باسم", "Bassem"] };
  var ROLE = { janna: ["جنة · مديرة التسجيل", "Janna · Registration manager"], bassem: ["باسم · مستشار أعمالك", "Bassem · Your business advisor"] };
  function nm(w) { return T(NM[w][0], NM[w][1]); }
  function V(w, m, f) { return w === "janna" ? f : m; } /* Egyptian Arabic verb gender */
  var GOV = { CAI: "القاهرة", GIZ: "الجيزة", ALX: "الإسكندرية", QLB: "القليوبية", SHR: "الشرقية", DKH: "الدقهلية", GHR: "الغربية", MNF: "المنوفية", BHR: "البحيرة", KFS: "كفر الشيخ", DMT: "دمياط", PTS: "بورسعيد", ISM: "الإسماعيلية", SUZ: "السويس", NSN: "شمال سيناء", JSN: "جنوب سيناء", FYM: "الفيوم", BNS: "بني سويف", MNY: "المنيا", AST: "أسيوط", SHG: "سوهاج", QNA: "قنا", LXR: "الأقصر", ASN: "أسوان", BBA: "البحر الأحمر", WAD: "الوادي الجديد", MTR: "مطروح" };
  var GOV_EN = { CAI: "Cairo", GIZ: "Giza", ALX: "Alexandria", QLB: "Qalyubia", SHR: "Sharqia", DKH: "Dakahlia", GHR: "Gharbia", MNF: "Monufia", BHR: "Beheira", KFS: "Kafr El Sheikh", DMT: "Damietta", PTS: "Port Said", ISM: "Ismailia", SUZ: "Suez", NSN: "North Sinai", JSN: "South Sinai", FYM: "Faiyum", BNS: "Beni Suef", MNY: "Minya", AST: "Asyut", SHG: "Sohag", QNA: "Qena", LXR: "Luxor", ASN: "Aswan", BBA: "Red Sea", WAD: "New Valley", MTR: "Matrouh" };
  /* same normalisation as data/janna-live.js (so we compare what it typed the same way) */
  function norm(s) { return String(s || "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/[\u0623\u0625\u0622]/g, "\u0627").replace(/\u0629/g, "\u0647").replace(/\u0649/g, "\u064A").replace(/^\u0627\u0644/, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function govCode(g) {
    g = str(g, 40); if (!g) return "";
    if (GOV[g.toUpperCase()]) return g.toUpperCase();
    var n = norm(g); for (var k in GOV) if (norm(GOV[k]) === n || norm(GOV_EN[k]) === n || (n.length > 2 && norm(GOV[k]).indexOf(n) > -1)) return k;
    return "";
  }
  function gov(g) { var c = govCode(g); return c ? T(GOV[c], GOV_EN[c]) : str(g, 40); }
  /* advisor market / opportunity-kind codes → names (from data/advisor-guides.js when loaded) */
  var MK = { local: ["السوق المحلي", "Local market"], gulf: ["الخليج", "Gulf (GCC)"], gcc: ["الخليج", "Gulf (GCC)"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"], eu: ["أوروبا", "Europe"] };
  var KD = { gov: ["مناقصة حكومية", "Government tender"], pvt: ["مشتري خاص", "Private buyer"], rfq: ["طلب عرض أسعار", "RFQ"] };
  function codeName(v, pool, fb) {
    v = str(v, 30); if (!v) return ""; var k = v.toLowerCase(), G = W.ADVISOR_GUIDES, o = G && G[pool] && G[pool][k === "gcc" ? "gulf" : k];
    if (o && (o.name_ar || o.name_en)) return T(o.name_ar || o.name_en, o.name_en || o.name_ar);
    return fb[k] ? T(fb[k][0], fb[k][1]) : v;
  }
  /* search box + governorate select of each listing page (mirrors janna-live.js SEARCH) */
  var APPLIED = { market: function (d, q) { var b = d.querySelector('#activeF [data-k="q"]'); return !!(b && norm(b.textContent).indexOf(norm(q)) > -1); } };
  var BOX = { factories: ["#q", "#c"], market: ["#sq", null], tenders: ["#olQ", null], rfqs: ["#olQ", null], suppliers: ["#sq", "#se"], offers: ["#oq", "#ocity"], projects: ["#q", "#r"], advisor: ["#advQ", null] };
  var PAGES = { track: ["تتبّع الطلب", "Request tracking"], home: ["الرئيسية", "Home"], factories: ["دليل المصانع", "Factory directory"], market: ["السوق", "Marketplace"], offers: ["العروض", "Offers"], tenders: ["المناقصات", "Tenders"], rfqs: ["طلبات الأسعار", "RFQs"], projects: ["المشروعات", "Projects"], suppliers: ["دليل الموردين", "Suppliers"], region: ["المحافظات", "Governorates"], cities: ["المدن الصناعية", "Industrial cities"], map: ["الخريطة", "Map"], news: ["الأخبار", "News"], events: ["المعارض", "Exhibitions"], winners: ["الترسيات", "Contract awards"], "export-market": ["أسواق التصدير", "Export markets"], intl: ["المنصات الدولية", "International"], about: ["عن المنصة", "About"], contact: ["تواصل معنا", "Contact"], register: ["التسجيل", "Registration"], legal: ["المركز القانوني", "Legal"], radar: ["رادار الفرص", "Radar"], advisor: ["مكتب المستشار", "Advisor desk"] };
  var NOUN = { factories: ["مصانع", "factories"], market: ["منتجات", "products"], tenders: ["مناقصات", "tenders"], rfqs: ["طلبات أسعار", "RFQs"], suppliers: ["موردين", "suppliers"], offers: ["عروض", "offers"], projects: ["مشروعات", "projects"] };
  function pname(p) { return PAGES[p] ? T(PAGES[p][0], PAGES[p][1]) : str(p, 40); }
  /* real result cards on each listing page (title/sub/count selectors) */
  var SPEC = {
    factories: { card: "#grid a.fc", title: "h3", sub: "small", count: "#cnt" },
    market: { card: "#grid article.pc", title: ".t", sub: ".moq", count: "#rCount" },
    tenders: { card: "#olL .ol-it", title: "h3", sub: ".m span", count: "#olC" },
    rfqs: { card: "#olL .ol-it", title: "h3", sub: ".m span", count: "#olC" },
    suppliers: { card: "#sgrid a.sc", title: "h3", sub: "small", count: "#scnt" },
    projects: { card: "#grid a.pj", title: ".top b", sub: ".top small", count: "#cnt" },
    offers: { card: "#ogrid a.of", title: "b.n", sub: ".st", count: "#ocnt" },
    advisor: { card: "article.opc", title: "h3", sub: ".opc-m span", count: null }
  };
  var STG = [["discover", "اكتشاف", "Discover"], ["contact", "تواصل", "Contact"], ["offer", "تقديم عرض", "Offer"], ["negotiation", "تفاوض", "Negotiation"], ["contract", "تعاقد", "Contract"], ["delivery", "توريد", "Delivery"]];

  /* ---------- who is speaking ---------- */
  var whoSet = null;
  function liveEl() { var o = D.querySelector(".jnl"); return o && !o.hidden && vis(o) ? o : null; }
  function liveFrame() { var o = liveEl(); return o ? o.querySelector("iframe") : null; }
  function defWho() {
    if (whoSet === "janna" || whoSet === "bassem") return whoSet;
    try { if (liveEl() && W.JANNA_LIVE && typeof W.JANNA_LIVE.persona === "function") return W.JANNA_LIVE.persona() === "bassem" ? "bassem" : "janna"; } catch (e) {}
    var on = false, b = W.BASSEM;
    try { on = !!(b && (typeof b.active === "function" ? b.active() : b.active !== false)); } catch (e) {}
    var c = D.documentElement && D.documentElement.classList;
    return on || (c && (c.contains("bassem-on") || c.contains("bs-on"))) ? "bassem" : "janna";
  }

  /* ---------- look ---------- */
  var F = 'Cairo,"IBM Plex Sans Arabic",Tahoma,sans-serif';
  var CSS = ''
    + '.mgh{position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483500;pointer-events:none;overflow:hidden;font-family:' + F + ';-webkit-font-smoothing:antialiased}'
    + '.mgh *,.mgh *:before,.mgh *:after{box-sizing:border-box}'
    + '.mgh-halo{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(4,30,44,.44),rgba(4,30,44,.2) 52%,rgba(4,30,44,0));opacity:0;transition:opacity .9s ease}'
    + '.mgh.on .mgh-halo{opacity:1}'
    + '.mgh-cone{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .7s ease;-webkit-filter:blur(4px);filter:blur(4px)}'
    + '.mgh.beam .mgh-cone{opacity:1}.mgh.nobeam .mgh-cone,.mgh.nobeam .mgh-rays,.mgh.nobeam .mgh-pts{display:none}'
    + '.mgh-rays{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;-webkit-filter:drop-shadow(0 0 3px rgba(63,224,255,.95));filter:drop-shadow(0 0 3px rgba(63,224,255,.95))}.mgh-rays line{stroke-width:1.3;stroke-linecap:round;opacity:0;transition:opacity .8s ease}.mgh-rays line.on{opacity:1}'
    + '.mgh-stage{position:absolute;width:0;height:0;-webkit-perspective:1000px;perspective:1000px}'
    + '.mgh-plate{position:absolute;border-radius:50%;border:1.5px solid rgba(110,232,255,.75);box-shadow:0 0 18px rgba(63,224,255,.55),inset 0 0 18px rgba(63,224,255,.45);background:radial-gradient(closest-side,rgba(63,224,255,.35),rgba(63,224,255,.08) 70%,transparent);opacity:0;transform:scale(.6);transition:opacity .5s ease,transform .7s cubic-bezier(.2,.9,.25,1)}'
    + '.mgh-plate:after{content:"";position:absolute;inset:14%;border-radius:50%;border:1px dashed rgba(233,196,106,.65)}'
    + '.mgh.up .mgh-plate{opacity:1;transform:none}'
    + '.mgh-lap{position:absolute;top:0;height:0;-webkit-transform-style:preserve-3d;transform-style:preserve-3d;opacity:0;transition:opacity .35s ease}'
    + '.mgh.up .mgh-lap{opacity:1}'
    + '.mgh-base{position:absolute;left:0;top:0;width:100%;-webkit-transform-origin:50% 0;transform-origin:50% 0;transform:rotateX(90deg);-webkit-transform-style:preserve-3d;transform-style:preserve-3d;border-radius:5px 5px 12px 12px;background:linear-gradient(180deg,#3a4655,#1b242e 55%,#10171e);box-shadow:inset 0 0 0 1px rgba(170,225,255,.22)}'
    + '.mgh-kb{position:absolute;left:7%;right:7%;top:8%;height:52%;border-radius:3px;background-color:rgba(63,224,255,.07);background-image:linear-gradient(90deg,#0b1219 1.5px,transparent 1.5px),linear-gradient(#0b1219 1.5px,transparent 1.5px);background-size:7.69% 20%}'
    + '.mgh-kb:after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;border-radius:3px;background:rgba(63,224,255,.42);box-shadow:0 0 16px rgba(63,224,255,.45);opacity:0;transition:opacity .9s ease}.mgh.lit .mgh-kb:after{opacity:1}'
    + '.mgh-tp{position:absolute;left:33%;right:33%;top:67%;height:25%;border-radius:4px;border:1px solid rgba(170,225,255,.25);background:rgba(255,255,255,.04)}'
    + '.mgh-lip{position:absolute;left:0;top:100%;width:100%;height:6px;-webkit-transform-origin:50% 0;transform-origin:50% 0;transform:rotateX(-90deg);background:linear-gradient(#4b5867,#141b23);border-radius:0 0 6px 6px}'
    + '.mgh-lid{position:absolute;left:2%;width:96%;bottom:0;-webkit-transform-origin:50% 100%;transform-origin:50% 100%;transform:rotateX(-89deg);-webkit-transform-style:preserve-3d;transform-style:preserve-3d;transition:transform .95s cubic-bezier(.25,.9,.25,1)}'
    + '.mgh.open .mgh-lid{transform:rotateX(10deg)}'
    + '.mgh-scr,.mgh-shell{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:7px 7px 2px 2px;-webkit-backface-visibility:hidden;backface-visibility:hidden}'
    + '.mgh-scr{background:#06090d;padding:5% 4% 7%;box-shadow:inset 0 0 0 1px rgba(170,225,255,.22)}'
    + '.mgh-scr:after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(170,240,255,.45),0 0 26px 3px rgba(63,224,255,.6);opacity:0;transition:opacity .8s ease}.mgh.lit .mgh-scr:after{opacity:1}'
    + '.mgh-shell{transform:rotateY(180deg);background:linear-gradient(160deg,#4a5866,#222c37 55%,#141b22);box-shadow:inset 0 0 0 1px rgba(170,225,255,.2)}'
    + '.mgh-shell:after{content:"";position:absolute;left:42%;top:38%;width:16%;height:24%;border-radius:50%;background:radial-gradient(closest-side,#fff1c4,#e9c46a 55%,rgba(233,196,106,0));opacity:.85}'
    + '.mgh-disp{position:relative;width:100%;height:100%;border-radius:3px;overflow:hidden;background:radial-gradient(130% 100% at 50% 0%,#11405e,#06121d 72%);opacity:0;transition:opacity .45s ease .1s}'
    + '.mgh.lit .mgh-disp{opacity:1}'
    + '.mgh-disp:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#d9fbff;box-shadow:0 0 12px #3fe0ff;transform:scaleX(0);opacity:0;z-index:2}'
    + '.mgh.lit .mgh-disp:before{-webkit-animation:mghPow .7s ease-out both;animation:mghPow .7s ease-out both}'
    + '@keyframes mghPow{0%{transform:scaleX(0);opacity:1}45%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1) scaleY(30);opacity:0}}'
    + '.mgh-sb{height:10%;display:flex;gap:4%;align-items:center;padding:0 5%;background:rgba(63,224,255,.14)}.mgh-sb i{width:5%;height:45%;border-radius:50%;background:#3fe0ff;opacity:.8}.mgh-sb i:nth-child(2){background:#e9c46a}'
    + '.mgh-sg{position:absolute;left:5%;right:5%;top:17%;bottom:7%;display:flex;flex-wrap:wrap;gap:6%;align-content:space-between}'
    + '.mgh-sbars{width:56%;height:47%;display:flex;align-items:flex-end;gap:5%;padding:4%;border:1px solid rgba(63,224,255,.3);border-radius:3px}'
    + '.mgh-sbars i{flex:1;height:100%;background:linear-gradient(0deg,#19c3d6,#bff6ff);-webkit-transform-origin:50% 100%;transform-origin:50% 100%;transform:scaleY(var(--h));-webkit-animation:mghBar 1.5s ease-in-out infinite alternate;animation:mghBar 1.5s ease-in-out infinite alternate;-webkit-animation-delay:var(--dl);animation-delay:var(--dl)}'
    + '@keyframes mghBar{to{transform:scaleY(var(--h2))}}'
    + '.mgh-sdon{width:30%;height:47%;border-radius:50%;background:conic-gradient(#3fe0ff 0 62%,#e9c46a 62% 80%,rgba(63,224,255,.16) 80%);-webkit-mask:radial-gradient(closest-side,transparent 52%,#000 56%);mask:radial-gradient(closest-side,transparent 52%,#000 56%);-webkit-animation:mghSpin 7s linear infinite;animation:mghSpin 7s linear infinite}'
    + '.mgh-sline{width:56%;height:40%}.mgh-sline svg{display:block;width:100%;height:100%;overflow:visible}.mgh-sline path{fill:none;stroke:#7ff0ff;stroke-width:2.4;stroke-linecap:round}'
    + '.mgh-rv{overflow:hidden;-webkit-animation:mghRvA var(--rt,2.6s) ease-in-out infinite;animation:mghRvA var(--rt,2.6s) ease-in-out infinite}.mgh-rv>*{-webkit-animation:mghRvB var(--rt,2.6s) ease-in-out infinite;animation:mghRvB var(--rt,2.6s) ease-in-out infinite}'
    + '@keyframes mghRvA{0%{transform:translateX(-100%)}60%,100%{transform:translateX(0)}}@keyframes mghRvB{0%{transform:translateX(100%)}60%,100%{transform:translateX(0)}}'
    + '.mgh-srows{width:30%;height:40%;display:flex;flex-direction:column;justify-content:space-around}.mgh-srows i{display:block;height:16%;border-radius:2px;background:linear-gradient(90deg,rgba(63,224,255,.75),rgba(63,224,255,.12))}.mgh-srows i:nth-child(2){width:70%;background:linear-gradient(90deg,rgba(233,196,106,.8),rgba(233,196,106,.1))}'
    + '@keyframes mghSpin{to{transform:rotate(360deg)}}'
    + '.mgh-pool{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(63,224,255,.55),rgba(63,224,255,.14) 60%,rgba(63,224,255,0));opacity:0;transition:opacity .9s ease}'
    + '.mgh.lit .mgh-pool{opacity:1}'
    + '.mgh-pt{position:absolute;left:0;top:0;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#dcfcff;box-shadow:0 0 6px 2px rgba(63,224,255,.85);opacity:0}'
    + '.mgh-pt.g{background:#fff1c4;box-shadow:0 0 6px 2px rgba(233,196,106,.85)}'
    + '.mgh.beam .mgh-pt{-webkit-animation:mghPt var(--pd) linear var(--pl) infinite;animation:mghPt var(--pd) linear var(--pl) infinite}'
    + '@keyframes mghPt{0%{transform:translate(0,0) scale(.5);opacity:0}12%{opacity:1}80%{opacity:.8}100%{transform:translate(var(--tx),var(--ty)) scale(1.3);opacity:0}}'
    /* field + panels */
    + '.mgh-field{position:absolute;width:640px;height:430px;-webkit-perspective:1100px;perspective:1100px}'
    + '.mgh-field.mob{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;height:auto;-webkit-perspective:900px;perspective:900px}.mgh-field.mob.dn{justify-content:flex-start}'
    + '.mgh-p{position:absolute;opacity:0}'
    + '.mgh-field.mob .mgh-p{position:relative;flex:none}'
    + '.mgh-p.pre{visibility:hidden;-webkit-animation:none!important;animation:none!important;opacity:1}'
    + '.mgh-p.go{will-change:transform,opacity;-webkit-animation:mghOut .95s cubic-bezier(.16,.84,.24,1) var(--d,0s) both;animation:mghOut .95s cubic-bezier(.16,.84,.24,1) var(--d,0s) both}'
    /* settled: no filled opacity animation left on the panel (a filled opacity animation makes it a backdrop root and kills the glass blur) */
    + '.mgh-p.set{-webkit-animation:none;animation:none;will-change:auto;opacity:1;transform:translate3d(0,0,var(--z)) rotateY(var(--ry)) rotateX(var(--rx))}.mgh-p.set .mgh-g{-webkit-animation:none;animation:none}'
    + '.mgh-p.in{-webkit-animation:mghIn .6s cubic-bezier(.55,0,.75,.2) var(--d,0s) both;animation:mghIn .6s cubic-bezier(.55,0,.75,.2) var(--d,0s) both}'
    + '@keyframes mghOut{0%{opacity:0;transform:translate3d(var(--dx),var(--dy),-180px) rotateX(38deg) scale(.05)}45%{opacity:.95}100%{opacity:1;transform:translate3d(0,0,var(--z)) rotateY(var(--ry)) rotateX(var(--rx)) scale(1)}}'
    + '@keyframes mghIn{0%{opacity:1;transform:translate3d(0,0,var(--z)) rotateY(var(--ry)) rotateX(var(--rx)) scale(1)}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),-180px) rotateX(38deg) scale(.04)}}'
    + '.mgh-bob{-webkit-animation:mghBob var(--bt,7s) ease-in-out infinite alternate;animation:mghBob var(--bt,7s) ease-in-out infinite alternate}'
    + '@keyframes mghBob{0%{transform:translate3d(0,-5px,0)}100%{transform:translate3d(0,6px,0)}}'
    + '.mgh-g{position:relative;overflow:hidden;border-radius:12px;padding:12px 14px;color:#e6fcff;'
    + 'background:linear-gradient(155deg,rgba(70,220,250,.3),rgba(8,40,60,.7) 34%,rgba(4,20,34,.76) 68%,rgba(25,195,214,.26));'
    + 'border:1px solid rgba(120,236,255,.7);box-shadow:inset 0 1px 0 rgba(210,252,255,.45),inset 0 0 22px rgba(63,224,255,.22),inset 0 0 26px -6px rgba(63,224,255,.55),0 0 24px -3px rgba(63,224,255,.65),0 22px 44px -22px rgba(0,8,16,.8);'
    + '-webkit-backdrop-filter:blur(12px) saturate(150%);backdrop-filter:blur(12px) saturate(150%)}'
    + '.mgh-tx .mgh-g{background:linear-gradient(155deg,rgba(22,104,132,.9),rgba(6,32,48,.9) 32%,rgba(4,20,34,.92) 68%,rgba(14,96,118,.88))}'
    + '.mgh-p.go .mgh-g{-webkit-animation:mghFlk .9s linear calc(var(--d,0s) + .3s) backwards;animation:mghFlk .9s linear calc(var(--d,0s) + .3s) backwards}'
    + '@keyframes mghFlk{0%{opacity:.2}8%{opacity:.9}14%{opacity:.35}24%{opacity:1}34%{opacity:.62}44%,100%{opacity:1}}'
    + '.mgh-g:before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:inherit;background:repeating-linear-gradient(0deg,rgba(170,245,255,.07) 0 1px,transparent 1px 3px)}'
    + '.mgh-g:after{content:"";position:absolute;top:-40%;bottom:-40%;left:-60%;width:40%;pointer-events:none;background:linear-gradient(90deg,rgba(190,250,255,0),rgba(190,250,255,.17),rgba(190,250,255,0));transform:translateX(0) skewX(-18deg);-webkit-animation:mghSweep 6s ease-in-out var(--sw,1.2s) infinite;animation:mghSweep 6s ease-in-out var(--sw,1.2s) infinite}'
    + '@keyframes mghSweep{0%{transform:translateX(0) skewX(-18deg)}35%,100%{transform:translateX(430%) skewX(-18deg)}}'
    + '.mgh-cn{position:absolute;left:3px;top:3px;right:3px;bottom:3px;pointer-events:none;'
    + 'background:linear-gradient(#aaf5ff,#aaf5ff) 0 0/12px 2px,linear-gradient(#aaf5ff,#aaf5ff) 0 0/2px 12px,linear-gradient(#aaf5ff,#aaf5ff) 100% 0/12px 2px,linear-gradient(#aaf5ff,#aaf5ff) 100% 0/2px 12px,'
    + 'linear-gradient(#aaf5ff,#aaf5ff) 0 100%/12px 2px,linear-gradient(#aaf5ff,#aaf5ff) 0 100%/2px 12px,linear-gradient(#e9c46a,#e9c46a) 100% 100%/12px 2px,linear-gradient(#e9c46a,#e9c46a) 100% 100%/2px 12px;background-repeat:no-repeat;opacity:.95}'
    + '.mgh-hd{position:relative;display:flex;align-items:center;gap:5px;margin:-2px 0 9px;font:700 10.5px/1.2 ' + F + ';color:rgba(185,244,255,.88);white-space:nowrap;text-shadow:0 0 6px rgba(63,224,255,.45)}[lang=en] .mgh-hd{letter-spacing:.1em;text-transform:uppercase;font-size:10px}.mgh-hd span{overflow:hidden;text-overflow:ellipsis}.mgh-task .mgh-hd{padding-inline-end:28px}'
    + '.mgh-hd i{width:6px;height:6px;border-radius:50%;background:#3fe0ff;box-shadow:0 0 6px #3fe0ff}.mgh-hd i:nth-child(2){background:#e9c46a;box-shadow:0 0 6px #e9c46a}.mgh-hd i:nth-child(3){opacity:.45}'
    + '.mgh-hd em{flex:1;height:1px;margin:0 4px;background:linear-gradient(90deg,rgba(63,224,255,.65),rgba(63,224,255,.05))}'
    + '.mgh-g h4,.mgh-g h5{position:relative;margin:0;color:#f2feff;text-shadow:0 0 6px rgba(63,224,255,.45),0 0 12px rgba(63,224,255,.35)}'
    /* task */
    + '.mgh-task .who{position:relative;display:flex;align-items:center;gap:8px;font:700 11.5px/1.3 ' + F + ';color:#f3d78a;text-shadow:0 0 8px rgba(233,196,106,.6);padding-inline-end:26px}'
    + '.mgh-task .who img{width:26px;height:26px;border-radius:50%;object-fit:cover;object-position:50% 20%;border:1.5px solid rgba(233,196,106,.9);box-shadow:0 0 10px rgba(233,196,106,.55);background:#0b1f3a}'
    + '.mgh-task h4{margin:7px 0 9px;font:800 15px/1.6 ' + F + '}'
    + '.mgh-bar{position:relative;height:3px;border-radius:3px;background:rgba(63,224,255,.2);overflow:hidden}'
    + '.mgh-bar i{position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,rgba(63,224,255,0),#3fe0ff,#e9c46a,rgba(233,196,106,0));-webkit-animation:mghLoad 1.25s linear infinite;animation:mghLoad 1.25s linear infinite}'
    + '@keyframes mghLoad{from{transform:translateX(-110%)}to{transform:translateX(260%)}}'
    + '.mgh-done .mgh-bar i{-webkit-animation:none;animation:none;width:100%;transform:none;background:linear-gradient(90deg,#19c3d6,#e9c46a)}'
    + '.mgh-x{position:absolute;top:9px;inset-inline-end:9px;z-index:3;width:22px;height:22px;border-radius:50%;border:1px solid rgba(170,240,255,.6);background:rgba(4,20,32,.7);color:#cff8ff;font:700 14px/1 Tahoma,sans-serif;cursor:pointer;pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:0}'
    + '.mgh-x:before{content:"";position:absolute;left:-11px;top:-11px;right:-11px;bottom:-11px;border-radius:50%}.mgh-x:hover,.mgh-x:focus-visible{background:#3fe0ff;color:#04121a;outline:none}'
    /* steps */
    + '.mgh-steps{position:relative;list-style:none;margin:0;padding:0}'
    + '.mgh-steps li{display:flex;align-items:flex-start;gap:8px;margin:0 0 7px;font:600 12.5px/1.55 ' + F + ';color:rgba(220,248,255,.85);opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease}'
    + '.mgh-steps li:last-child{margin-bottom:0}.mgh-steps li.sh{opacity:1;transform:none}'
    + '.mgh-steps li b{position:relative;flex:none;width:16px;height:16px;margin-top:2px;border-radius:50%;border:1.5px solid rgba(63,224,255,.35)}'
    + '.mgh-steps li.doing b{border-color:rgba(63,224,255,.18);border-top-color:#7ff0ff;-webkit-animation:mghSpin .8s linear infinite;animation:mghSpin .8s linear infinite}'
    + '.mgh-steps li.done b{border-color:#e9c46a;background:rgba(233,196,106,.2);box-shadow:0 0 8px rgba(233,196,106,.65);-webkit-animation:mghPop .4s ease-out;animation:mghPop .4s ease-out}'
    + '.mgh-steps li.done b:after{content:"";position:absolute;left:4.5px;top:1.5px;width:4px;height:8px;border:solid #fff1c4;border-width:0 2px 2px 0;transform:rotate(45deg)}'
    + '.mgh-steps li.fail b{border-color:#ff7a8e;background:rgba(255,90,110,.18)}.mgh-steps li.fail b:after{content:"×";position:absolute;left:0;right:0;top:-3px;text-align:center;font:800 13px/1 Tahoma,sans-serif;color:#ffb3be}'
    + '.mgh-steps li.done span{color:#f4feff}.mgh-steps li.fail span{color:#ffc9d1}.mgh-steps li.wait b{border:1.5px dashed rgba(233,196,106,.85)}.mgh-steps li.wait span{color:#ffeec4}'
    + '@keyframes mghPop{0%{transform:scale(.4)}70%{transform:scale(1.25)}100%{transform:scale(1)}}'
    + '.mgh-task .mgh-steps{margin-top:10px}'
    /* ring */
    + '.mgh-ring{position:relative;text-align:center}.mgh-ring svg{display:block;width:100%;height:auto;overflow:visible}'
    + '.mgh-ring .t{fill:none;stroke:rgba(63,224,255,.16);stroke-width:7}'
    + '.mgh-ring .v{fill:none;stroke:url(#mghRg);stroke-width:7;stroke-linecap:round;transition:stroke-dashoffset .7s ease;transform:rotate(-90deg);transform-origin:50% 50%}'
    + '.mgh-ring .o{fill:none;stroke:rgba(233,196,106,.7);stroke-width:1.2;stroke-dasharray:2 6;transform-origin:50% 50%;-webkit-animation:mghSpin 14s linear infinite;animation:mghSpin 14s linear infinite}'
    + '.mgh-ring .o2{fill:none;stroke:rgba(63,224,255,.45);stroke-width:1;stroke-dasharray:30 14 4 14;transform-origin:50% 50%;-webkit-animation:mghSpin 9s linear infinite reverse;animation:mghSpin 9s linear infinite reverse}'
    + '.mgh-ring b{position:absolute;left:0;right:0;top:50%;margin-top:-14px;font:800 21px/28px Tahoma,sans-serif;color:#f2feff;text-shadow:0 0 6px rgba(63,224,255,.9),0 0 14px rgba(63,224,255,.6);direction:ltr}'
    + '.mgh-ringp small{display:block;margin-top:6px;text-align:center;font:600 10.5px/1.3 ' + F + ';color:rgba(170,240,255,.8)}'
    + '.mgh-ringp .mgh-g{padding:12px}'
    /* chart */
    + '.mgh-ch{position:relative;height:76px;direction:ltr;background:linear-gradient(rgba(63,224,255,.18),rgba(63,224,255,.18)) 0 24%/100% 1px no-repeat,linear-gradient(rgba(63,224,255,.18),rgba(63,224,255,.18)) 0 48%/100% 1px no-repeat,linear-gradient(rgba(63,224,255,.18),rgba(63,224,255,.18)) 0 72%/100% 1px no-repeat,linear-gradient(rgba(63,224,255,.3),rgba(63,224,255,.3)) 0 100%/100% 1px no-repeat}'
    + '.mgh-ch .bars{position:absolute;left:2px;right:2px;bottom:1px;top:22%;display:flex;align-items:flex-end;gap:5px}'
    + '.mgh-ch .bars i{flex:1;height:100%;border-radius:2px 2px 0 0;background:linear-gradient(0deg,rgba(25,195,214,.45),#bff6ff);box-shadow:0 0 6px rgba(63,224,255,.5);-webkit-transform-origin:50% 100%;transform-origin:50% 100%;transform:scaleY(var(--h));-webkit-animation:mghBar 1.7s ease-in-out infinite alternate;animation:mghBar 1.7s ease-in-out infinite alternate;-webkit-animation-delay:var(--dl);animation-delay:var(--dl)}'
    + '.mgh-ch svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}.mgh-ch .mgh-rv{position:absolute;left:0;top:0;width:100%;height:100%;--rt:3.2s}'
    + '.mgh-ch .ln{fill:none;stroke:#f0d27e;stroke-width:2.2;stroke-linecap:round;filter:drop-shadow(0 0 3px rgba(233,196,106,.9))}.mgh-ch .ln2{fill:none;stroke:#7ff0ff;stroke-width:1.5;opacity:.85;stroke-dasharray:4 5}'
    /* AI chip */
    + '.mgh-aip .mgh-g{width:100%;height:100%;padding:0;display:flex;align-items:center;justify-content:center;border-color:rgba(233,196,106,.75);box-shadow:inset 0 0 22px -4px rgba(233,196,106,.6),0 0 22px -2px rgba(233,196,106,.55),0 0 0 1px rgba(63,224,255,.25)}'
    + '.mgh-ai{position:relative;font:900 28px/1 Tahoma,Arial,sans-serif;letter-spacing:.02em;color:#fff3cf;text-shadow:0 0 8px rgba(233,196,106,.95),0 0 18px rgba(233,196,106,.6);direction:ltr}'
    + '.mgh-ai:before,.mgh-ai:after{content:"";position:absolute;top:50%;width:14px;height:1.5px;background:rgba(233,196,106,.85);box-shadow:0 -7px 0 rgba(63,224,255,.7),0 7px 0 rgba(63,224,255,.7)}.mgh-ai:before{right:100%;margin-right:5px}.mgh-ai:after{left:100%;margin-left:5px}'
    /* results */
    + '.mgh-main{max-height:268px}'
    + '.mgh-res h5,.mgh-main h5{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 9px;font:800 13px/1.4 ' + F + '}'
    + '.mgh-g h5 em{font-style:normal;font:800 11px/1.5 Tahoma,sans-serif;color:#04121a;background:linear-gradient(90deg,#aaf5ff,#e9c46a);border-radius:999px;padding:1px 9px;text-shadow:none;white-space:nowrap}'
    + '.mgh-it{position:relative;display:block;padding:6px 9px;margin:0 0 6px;border-radius:8px;border:1px solid rgba(63,224,255,.25);background:rgba(63,224,255,.07);color:#eafdff;text-decoration:none;pointer-events:auto;cursor:pointer;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease,background-color .2s,border-color .2s}'
    + '.mgh-it.sh{opacity:1;transform:none}.mgh-it:last-child{margin-bottom:0}'
    + '.mgh-it b{display:block;font:700 12.5px/1.5 ' + F + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.mgh-it small{display:block;font:500 10.5px/1.45 ' + F + ';color:rgba(185,236,250,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.mgh-it:hover,.mgh-it:focus-visible{border-color:#7ff0ff;background:rgba(63,224,255,.2);outline:none}'
    + '.mgh-none{font:600 12px/1.7 ' + F + ';color:rgba(210,244,255,.85)}'
    + '.mgh-sk{position:relative;display:block;height:9px;margin:9px 0;border-radius:4px;overflow:hidden;background:rgba(63,224,255,.14)}.mgh-sk:after{content:"";position:absolute;left:0;top:0;bottom:0;width:50%;background:linear-gradient(90deg,rgba(63,224,255,0),rgba(150,240,255,.4),rgba(63,224,255,0));-webkit-animation:mghSk 1.4s linear infinite;animation:mghSk 1.4s linear infinite}'
    + '.mgh-sk:nth-child(odd){width:72%}'
    + '@keyframes mghSk{from{transform:translateX(-100%)}to{transform:translateX(200%)}}'
    /* mail / form / calendar / pipeline / guide / notify / sent / page */
    + '.mgh-row{display:flex;gap:6px;padding:4px 0;border-bottom:1px solid rgba(63,224,255,.22);font:600 11.5px/1.55 ' + F + '}'
    + '.mgh-row span{flex:none;color:rgba(160,235,255,.75)}.mgh-row b{min-width:0;flex:1;color:#f2feff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}.mgh-row b.sub{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'
    + '[dir=rtl] .mgh-row b{text-align:right}[dir=ltr] .mgh-row b{text-align:left}'
    + '.mgh-body{margin-top:8px;font:500 11.5px/1.75 ' + F + ';color:rgba(228,250,255,.9);height:80px;overflow:hidden;white-space:pre-line;unicode-bidi:plaintext}'
    + '.mgh-caret{display:inline-block;width:2px;height:1.05em;margin:0 1px;vertical-align:-3px;background:#7ff0ff;box-shadow:0 0 6px #3fe0ff;-webkit-animation:mghBlink 1s steps(1) infinite;animation:mghBlink 1s steps(1) infinite}'
    + '@keyframes mghBlink{50%{opacity:0}}'
    + '.mgh-fm .f{margin:0 0 8px}.mgh-fm .f span{display:block;font:600 10px/1.4 ' + F + ';color:rgba(160,235,255,.7)}'
    + '.mgh-fm .f b{display:block;min-height:24px;border-bottom:1.5px solid rgba(63,224,255,.55);font:700 12.5px/1.8 ' + F + ';color:#f2feff;box-shadow:0 7px 8px -9px #3fe0ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}'
    + '.mgh-cal .tile{display:flex;gap:12px;align-items:center}'
    + '.mgh-cal .d{flex:none;width:62px;height:66px;border-radius:10px;border:1px solid rgba(233,196,106,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:rgba(233,196,106,.1);box-shadow:0 0 14px -2px rgba(233,196,106,.6);color:#fff1c4;font:900 15px/1.1 Tahoma,sans-serif;text-align:center;direction:ltr}'
    + '.mgh-cal .d small{font:700 10px/1 Tahoma,sans-serif;color:#7ff0ff}'
    + '.mgh-cal .tx{min-width:0;font:700 12.5px/1.6 ' + F + ';color:#eafdff}.mgh-cal .tx small{display:block;font-weight:500;font-size:11px;color:rgba(185,236,250,.78)}'
    + '.mgh-stg{position:relative;display:flex;justify-content:space-between;margin:4px 0 12px}'
    + '.mgh-stg:before{content:"";position:absolute;left:8%;right:8%;top:9px;height:2px;background:rgba(63,224,255,.28)}'
    + '.mgh-stg i{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;font:600 10px/1.25 ' + F + ';white-space:nowrap;font-style:normal;color:rgba(170,230,250,.62);text-align:center;transition:color .4s}'
    + '.mgh-stg i:before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid rgba(63,224,255,.38);background:#071a28;transition:background-color .4s,border-color .4s,box-shadow .4s}'
    + '.mgh-stg i.on{color:#dffbff}.mgh-stg i.on:before{border-color:#3fe0ff;background:#156f86;box-shadow:0 0 8px #3fe0ff}'
    + '.mgh-stg i.cur{color:#fff1c4;font-weight:800}.mgh-stg i.cur:before{border-color:#fff1c4;background:#e9c46a;box-shadow:0 0 0 4px rgba(233,196,106,.25),0 0 16px #e9c46a;-webkit-animation:mghBeat 1.3s ease-in-out infinite;animation:mghBeat 1.3s ease-in-out infinite}'
    + '@keyframes mghBeat{50%{transform:scale(1.18)}}'
    + '.mgh-nx{font:600 11.5px/1.65 ' + F + ';color:#eafdff}.mgh-nx span{color:rgba(160,235,255,.72)}'
    + '.mgh-gd ol{list-style:none;margin:0;padding:0}'
    + '.mgh-gd li{display:flex;gap:8px;margin:0 0 7px;font:600 11.5px/1.6 ' + F + ';color:#eafdff;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease}.mgh-gd li.sh{opacity:1;transform:none}'
    + '.mgh-gd li i{flex:none;width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 10.5px/1 Tahoma,sans-serif;font-style:normal;color:#04121a;background:linear-gradient(135deg,#d6fbff,#3fe0ff);box-shadow:0 0 8px rgba(63,224,255,.75)}'
    + '.mgh-gd li span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
    + '.mgh-chips{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 10px}'
    + '.mgh-chip{display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;border:1px solid rgba(63,224,255,.5);background:rgba(63,224,255,.09);font:700 11.5px/1.2 ' + F + ';color:#dffbff;transition:border-color .4s,background-color .4s}'
    + '.mgh-chip i{width:8px;height:8px;border-radius:50%;background:#3fe0ff;box-shadow:0 0 8px #3fe0ff;-webkit-animation:mghBlink 1s steps(1) infinite;animation:mghBlink 1s steps(1) infinite}'
    + '.mgh-chip.ok{border-color:rgba(37,211,102,.75);background:rgba(37,211,102,.14)}.mgh-chip.ok i{background:#25d366;box-shadow:0 0 8px #25d366;-webkit-animation:none;animation:none}'
    + '.mgh-msg{font:500 11.5px/1.7 ' + F + ';color:rgba(228,250,255,.9);unicode-bidi:plaintext}'
    + '.mgh-sent{display:flex;align-items:center;gap:12px}.mgh-sent svg{flex:none;width:54px;height:54px;overflow:visible}'
    + '.mgh-sent circle{fill:rgba(63,224,255,.12);stroke:#3fe0ff;stroke-width:3}.mgh-sent path{fill:none;stroke:#fff1c4;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;transition:stroke-dashoffset .6s ease}'
    + '.mgh-sent.ok path{stroke-dashoffset:0}.mgh-sent .tx{font:700 12.5px/1.6 ' + F + ';color:#eafdff}.mgh-sent .tx small{display:block;font-weight:500;font-size:11px;color:rgba(185,236,250,.78)}'
    + '.mgh-url{display:flex;align-items:center;gap:6px;margin:0 0 8px;padding:4px 9px;border-radius:999px;border:1px solid rgba(63,224,255,.3);background:rgba(2,12,20,.35);font:600 10.5px/1.4 Tahoma,sans-serif;color:rgba(185,236,250,.85);direction:ltr;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.mgh-url:before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:#25d366;box-shadow:0 0 6px #25d366}'
    /* compact (phone / short screens / live call): stacked, opaque glass (cheaper than blur) */
    + '.mgh-field.mob .mgh-g{padding:10px 12px;-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(155deg,rgba(30,110,140,.9),rgba(6,26,40,.93) 40%,rgba(4,20,32,.94) 75%,rgba(20,120,140,.88))}'
    + '.mgh-field.mob .mgh-task h4{font-size:13.5px;margin:5px 0 7px}.mgh-field.mob .mgh-steps li{font-size:11.5px;margin-bottom:4px}'
    + '.mgh-field.mob .mgh-body{height:54px}.mgh-field.mob .mgh-main{max-height:none;height:100%}.mgh-field.mob .mgh-mainp .mgh-bob{height:100%}'
    + '.mgh-field.mob .mgh-task .mgh-steps{min-height:68px}.mgh-field.mob .s2 .mgh-steps{min-height:44px}.mgh-field.mob .s2 .mgh-steps li:not(:nth-last-child(-n+2)),.mgh-field.mob .s1 .mgh-steps li:not(:last-child){display:none}.mgh-field.mob .s1 .mgh-steps{min-height:22px}.mgh-field.mob .s1 .mgh-bar{display:none}'
    + '.mgh-task .tm{display:flex;align-items:center;gap:6px;margin-inline-start:auto;flex:none}.mgh-task .tm .mgh-ring{width:36px}.mgh-task .tm .mgh-ring b{font-size:9.5px;line-height:12px;margin-top:-6px;text-shadow:0 0 6px rgba(63,224,255,.9)}'
    + '.mgh-task .tm .mgh-ai{font-size:12px;padding:5px 5px 4px;border:1px solid rgba(233,196,106,.85);border-radius:6px;box-shadow:inset 0 0 8px -2px rgba(233,196,106,.7),0 0 8px -2px rgba(233,196,106,.6)}.mgh-task .tm .mgh-ai:before,.mgh-task .tm .mgh-ai:after{display:none}'
    + '@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.mgh-g{background:linear-gradient(155deg,rgba(30,110,140,.88),rgba(6,26,40,.92) 40%,rgba(4,20,32,.93) 75%,rgba(20,120,140,.85))}}'
    + '.mgh-sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}'
    /* reduced motion: plain fades, no 3D, no bobbing */
    + '.mgh-rm .mgh-p.go{-webkit-animation:mghFade .35s ease var(--d,0s) both;animation:mghFade .35s ease var(--d,0s) both}'
    + '.mgh-rm .mgh-p.in{-webkit-animation:mghFade .3s ease reverse both;animation:mghFade .3s ease reverse both}'
    + '@keyframes mghFade{from{opacity:0}to{opacity:1}}'
    + '.mgh-rm .mgh-bob,.mgh-rm .mgh-p.go .mgh-g,.mgh-rm .mgh-g:after,.mgh-rm .mgh-sbars i,.mgh-rm .mgh-sdon,.mgh-rm .mgh-rv,.mgh-rm .mgh-rv>*,.mgh-rm .mgh-ch .bars i,.mgh-rm .mgh-sk:after,.mgh-rm .mgh-ring .o,.mgh-rm .mgh-ring .o2,.mgh-rm .mgh-bar i,.mgh-rm .mgh-disp:before,.mgh-rm .mgh-stg i.cur:before,.mgh-rm .mgh-sk,.mgh-rm .mgh-steps li.doing b,.mgh-rm .mgh-steps li.done b{-webkit-animation:none!important;animation:none!important}'
    + '.mgh-rm .mgh-p.set{transform:none}.mgh-rm .mgh-pt{display:none}.mgh-rm .mgh-lid,.mgh-rm .mgh-plate,.mgh-rm .mgh-steps li,.mgh-rm .mgh-it,.mgh-rm .mgh-gd li{transition:none!important}'
    + '.mgh-rm .mgh-steps li.doing b{border-color:#7ff0ff}.mgh-rm .mgh-cone{-webkit-filter:none;filter:none}';

  function injectCss() {
    if (D.getElementById("mgh-css")) return;
    var s = D.createElement("style"); s.id = "mgh-css"; s.textContent = CSS;
    (D.head || D.documentElement).appendChild(s);
  }

  /* ---------- state ---------- */
  var S = { state: "idle", root: null, sc: null, q: [], timers: [], lastKey: "", lastT: 0, holdT: 0, geo: null, sr: null, poll: 0, uid: 0, prevFocus: null };
  function gt(fn, ms) { var id = setTimeout(fn, ms); S.timers.push(id); return id; } /* global (laptop) timers */
  function clearGT() { for (var i = 0; i < S.timers.length; i++) clearTimeout(S.timers[i]); S.timers = []; }
  /* screen-reader announcements, queued ~1.5 s apart so one never overwrites the previous */
  var srQ = [], srT = 0, srLast = 0;
  function srSay(t) {
    t = str(t, 300); if (!t) return;
    srQ.push(t); while (srQ.length > 3) srQ.shift();
    if (!srT) srPump();
  }
  function srPump() {
    srT = setTimeout(function () {
      srT = 0; if (!srQ.length || !D.body) return;
      if (!S.sr || !S.sr.parentNode) { S.sr = el("div", "mgh-sr"); S.sr.setAttribute("role", "status"); S.sr.setAttribute("aria-live", "polite"); injectCss(); D.body.appendChild(S.sr); }
      var sr = S.sr, t = srQ.shift(); sr.textContent = ""; setTimeout(function () { sr.textContent = t; }, 60);
      srLast = now(); if (srQ.length) srPump();
    }, Math.max(0, srLast + 1500 - now()));
  }

  /* ---------- the stage (laptop, light cone, particles, field) ---------- */
  function build() {
    injectCss();
    var r = el("div", "mgh" + (RM() ? " mgh-rm" : ""));
    r.setAttribute("translate", "no");
    var bars = "", hs = [[.45, .9], [.7, .35], [.3, .8], [.85, .5], [.5, 1], [.62, .3], [.4, .75]];
    for (var i = 0; i < hs.length; i++) bars += '<i style="--h:' + hs[i][0] + ';--h2:' + hs[i][1] + ";--dl:-" + (i * .23).toFixed(2) + 's"></i>';
    r.innerHTML = '<div class="mgh-halo" aria-hidden="true"></div>'
      + '<svg class="mgh-cone" aria-hidden="true" focusable="false"><defs><linearGradient id="mghCg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#7ff0ff" stop-opacity=".6"/><stop offset=".5" stop-color="#3fe0ff" stop-opacity=".16"/><stop offset="1" stop-color="#3fe0ff" stop-opacity="0"/></linearGradient></defs>'
      + '<polygon class="c1" fill="url(#mghCg)" opacity=".5"/><polygon class="c2" fill="url(#mghCg)"/></svg>'
      + '<svg class="mgh-rays" aria-hidden="true" focusable="false"></svg>'
      + '<div class="mgh-pts" aria-hidden="true"></div>'
      + '<div class="mgh-stage" aria-hidden="true"><div class="mgh-pool"></div><div class="mgh-plate"></div>'
      + '<div class="mgh-lap"><div class="mgh-base"><div class="mgh-kb"></div><div class="mgh-tp"></div><div class="mgh-lip"></div></div>'
      + '<div class="mgh-lid"><div class="mgh-scr"><div class="mgh-disp"><div class="mgh-sb"><i></i><i></i><i></i></div><div class="mgh-sg">'
      + '<div class="mgh-sbars">' + bars + '</div><div class="mgh-sdon"></div>'
      + '<div class="mgh-sline mgh-rv"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M2 34 C14 30 18 12 30 18 S48 34 58 22 S78 4 98 8"/></svg></div>'
      + '<div class="mgh-srows"><i></i><i></i><i></i></div></div></div></div><div class="mgh-shell"></div></div></div></div>'
      + '<div class="mgh-field"></div>';
    var pts = r.querySelector(".mgh-pts"), ph = "";
    for (var k = 0; k < 12; k++) ph += '<span class="mgh-pt' + (k % 4 === 1 ? " g" : "") + '"></span>';
    pts.innerHTML = ph;
    D.body.appendChild(r);
    S.root = r;
    r.addEventListener("focusin", function (e) { var t = e.relatedTarget; if (t && t.nodeType === 1 && !r.contains(t)) S.prevFocus = t; });
    /* a settled panel drops its fly-in animation (keeps the glass blur working, frees will-change) */
    r.addEventListener("animationend", function (e) { var t = e.target; if (t && t.classList && t.classList.contains("mgh-p") && t.classList.contains("go") && /^mgh(Out|Fade)$/.test(e.animationName)) settle(t); });
    layout();
    return r;
  }
  function settle(p) { if (p.classList.contains("go")) { p.classList.remove("go"); p.classList.add("set"); } }

  function anchorEl(sc) {
    var a = sc && sc.anchor;
    if (a) {
      if (typeof a === "string") { try { a = D.querySelector(a); } catch (e) { a = null; } }
      if (a && typeof a.x === "number" && typeof a.y === "number" && !a.nodeType) return { pt: a };
      if (a && a.nodeType === 1) { var ra = vis(a); if (ra) return { r: ra, kind: "el" }; }
    }
    var lv = liveEl();
    if (lv) {
      var v = lv.querySelector(".jnl-me .v") || lv.querySelector("anam-agent"), rv = vis(v);
      if (rv) { var fr = lv.querySelector("iframe"), bar = lv.querySelector(".jnl-bar"), col = lv.querySelector(".jnl-me"); return { r: rv, kind: "live", fr: vis(fr), bar: vis(bar), col: vis(col) }; }
    }
    var who = sc ? sc.who : defWho();
    /* the big welcome/stage figures first (when open), then the docked figures */
    var order = who === "bassem" ? [".bs-wfig", ".jn-st-fig", ".bs-fig", ".jn-fig"] : [".jn-st-fig", ".bs-wfig", ".jn-fig", ".bs-fig"];
    for (var i = 0; i < order.length; i++) { var f = D.querySelector(order[i]), rf = vis(f); if (rf && !f.classList.contains("box") && rf.height > 120) return { r: rf, kind: "fig" }; }
    var minis = [".bs-mini", ".jn-mini", ".bs-fig", ".jn-fig"];
    for (var j = 0; j < minis.length; j++) { var m = D.querySelector(minis[j]), rm = vis(m); if (rm) return { r: rm, kind: "mini" }; }
    return null;
  }
  /* areas the panels must not cover: the characters' open chat bubbles and welcome cards */
  function noGo() {
    var out = [], ns = D.querySelectorAll(".jn-bub,.bs-bub,.jn-st-pan,.bs-wbox,.wa-float,.totop");
    for (var i = 0; i < ns.length; i++) { var r = vis(ns[i]); if (r) out.push(r); }
    return out;
  }
  function ovl(a, b) { var w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; }
  function rect(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* compute geometry: laptop hinge point/size, which side the field opens to, field box (full 3D constellation or compact stack) */
  function geom() {
    var vw = W.innerWidth || D.documentElement.clientWidth, vh = W.innerHeight || D.documentElement.clientHeight;
    var sc = S.sc, a = anchorEl(sc), live = !!(a && a.kind === "live");
    /* captions bar: keep everything above it (it wraps to 2–3 lines on phones) */
    var cc = D.querySelector(".mig-cc"), ccR = vis(cc), reserve = 96;
    if (cc) reserve = Math.max(reserve, ccR ? vh - ccR.top + 8 : (vw <= 640 ? Math.min(170, vh * .24 + 30) : 112));
    var botLim = vh - reserve, ng = noGo();
    var forceCmp = vw <= 640 || vh <= 520 || live;
    var fh = a && a.r ? a.r.height : 0, lw;
    if (a && a.kind === "fig") lw = forceCmp ? clamp(fh * .42, 70, 90) : clamp(fh * .27, 84, 118);
    else lw = forceCmp ? 78 : 108;
    var lh = lw * .62, depth = lw * .64, cands = [];
    if (a && a.pt) cands.push({ hx: a.pt.x, hy: a.pt.y, side: a.pt.x > vw / 2 ? "right" : "left" });
    else if (live) cands = liveCands(a, vw, vh, lw, lh);
    else if (a && a.kind === "fig") {
      /* the opaque body (arms included) is roughly the middle 76% of the figure box: the laptop floats just outside it, at hand height */
      var bL = a.r.left + a.r.width * .12, bR = a.r.right - a.r.width * .12, hy0 = a.r.top + a.r.height * .55;
      var cL = { hx: bL - 12 - lw / 2, hy: hy0, side: "right" }, cR = { hx: bR + 12 + lw / 2, hy: hy0, side: "left" };
      cands = a.r.left + a.r.width / 2 > vw / 2 ? [cL, cR] : [cR, cL];
    } else if (a) {
      var sd = a.r.left + a.r.width / 2 > vw / 2 ? "right" : "left";
      cands.push({ hx: sd === "right" ? a.r.left - lw * .6 : a.r.right + lw * .6, hy: a.r.top + Math.min(a.r.height, 80) * .5, side: sd });
    } else cands.push({ hx: vw - (forceCmp ? 70 : 140), hy: vh - (forceCmp ? 150 : 190), side: "right" });
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var vs = [false, true];
      for (var v = 0; v < vs.length; v++) {
        var g = place(cands[i], vw, vh, lw, lh, depth, botLim, forceCmp, live, ng, vs[v]); if (!g) continue;
        g.score += i * .03;
        if (!best || g.score < best.score) best = g;
      }
    }
    if (!best) best = place({ hx: vw - 70, hy: vh - 150, side: "right" }, vw, vh, lw, lh, depth, botLim, true, false, [], false) || place({ hx: vw / 2, hy: vh * .7, side: "right" }, vw, vh, lw, lh, depth, vh, true, false, [], false);
    best.vw = vw; best.vh = vh; best.live = live; best.lw = lw; best.lh = lh; best.depth = depth;
    return best;
  }
  /* live call (owner 2026-11-18 «مش بيفتح ليه سكرينات»): the screens open BESIDE the face (desktop: the free band of the video
     tile on the shared-screen side) or UNDER it (phones / narrow tiles), never over the face, and the call's own buttons at the
     bottom of the video stay free */
  function liveCtlTop(v) {
    var lv = liveEl(), t = v.bottom - 64;
    if (lv) { var ns = lv.querySelectorAll(".jv-acts,.jv-ctl"); for (var i = 0; i < ns.length; i++) { var r = vis(ns[i]); if (r && r.top > v.top + v.height * .45) t = Math.min(t, r.top); } }
    return t;
  }
  function liveCands(a, vw, vh, lw, lh) {
    var v = a.r, fr = a.fr, out = [], botY = Math.min(v.bottom, liveCtlTop(v)) - 10, dz = lw * .64 * .6;
    if (vw <= 640) {
      var barOn = a.bar && a.bar.top >= 0 && a.bar.bottom <= vh * .5, top0 = (barOn ? a.bar.bottom : Math.max(v.top, 0)) + 8;
      var chest = Math.max(v.top, 0) + Math.min(v.height, vh) * .6, hyP = Math.max(top0 + lh * .98, chest - dz - 6);
      out.push({ hx: v.left + lw / 2 + 8, hy: hyP, side: "left", liveDown: true, topY: hyP + dz + 6, botY: botY }); return out;
    }
    var leftNear = !fr || v.left + v.width / 2 > fr.left + fr.width / 2, side = leftNear ? "left" : "right";
    var faceW = Math.min(v.width * .46, v.height * .72), band = Math.min(320, (v.width - faceW) / 2 - 14);
    if (band >= 180) {
      var hx = leftNear ? v.left + lw / 2 + 10 : v.right - lw / 2 - 10, hy = v.top + lh * .98 + 12;
      out.push({ hx: hx, hy: hy, side: side, liveDown: true, topY: hy + dz + 8, botY: botY, bandW: band, bandL: leftNear ? v.left + 10 : v.right - 10 - band });
      return out;
    }
    var hy2 = v.top + v.height * .5 - dz - 6;
    out.push({ hx: leftNear ? v.left + lw / 2 + 8 : v.right - lw / 2 - 8, hy: hy2, side: side, liveDown: true, topY: hy2 + dz + 6, botY: botY });
    return out;
  }
  function place(c, vw, vh, lw, lh, depth, botLim, forceCmp, live, ng, avoid) {
    var hx = clamp(c.hx, lw / 2 + 8, vw - lw / 2 - 8), hy = c.hy;
    if (Math.abs(hx - c.hx) > lw * .35) return null; /* no room on this side */
    if (!c.liveDown) { hy = Math.min(hy, botLim - depth * .5); hy = Math.max(hy, lh + 20); }
    var side = c.side, sTop = hy - lh * .98, sx = hx + (side === "right" ? -1 : 1) * lw * .03, sy = hy - lh * .55, g = { hx: hx, hy: hy, side: side, sx: sx, sy: sy, sTop: sTop, k: 1, cmp: true, score: 0, dn: false };
    var lapR = rect(hx - lw / 2, sTop, lw, lh + depth * .6), fr = null, k, i;
    if (!forceCmp) {
      var FW = 640, FH = 430, nearX = side === "right" ? hx + lw * .3 : hx - lw * .3, fb = hy - lh * .5;
      if (avoid) for (i = 0; i < ng.length; i++) if (ng[i].top < fb && ng[i].bottom > fb - FH) { if (side === "right" && ng[i].left < nearX && ng[i].right > nearX - FW) nearX = Math.min(nearX, ng[i].left - 10); if (side === "left" && ng[i].right > nearX && ng[i].left < nearX + FW) nearX = Math.max(nearX, ng[i].right + 10); }
      var availW = side === "right" ? nearX - 12 : vw - nearX - 12, availH = fb - 10;
      var kmax = vw >= 1600 && vh >= 860 ? 1.2 : 1;
      k = Math.min(kmax, availW / FW, availH / FH);
      if (k >= .7) {
        var fl = side === "right" ? nearX - FW * k : nearX;
        fr = rect(fl, fb - FH * k, FW * k, FH * k); g.cmp = false; g.k = k;
      }
    }
    if (!fr) {
      var pw = Math.min(300, vw - 24), H, left, top;
      if (c.liveDown) { /* live call: beside the face (desktop band) or under it (phone), panels open downwards */
        top = c.topY; var lim = Math.min(botLim, c.botY || botLim);
        if (c.bandW) { pw = c.bandW; left = clamp(c.bandL, 10, vw - 10 - pw); H = Math.max(120, Math.min(460, lim - top)); }
        else { H = Math.max(100, Math.min(c.botY ? 280 : 190, vh * (c.botY ? .42 : .3), lim - top - 8)); left = clamp(hx - lw / 2, 10, vw - 10 - pw); }
        fr = rect(left, top, pw, H); g.dn = true;
      } else if (c.liveUp) { /* desktop live call: in the free band above the video tile */
        var x0 = side === "left" ? hx + lw * .32 : c.xEnd, x1 = side === "left" ? c.xEnd : hx - lw * .32;
        pw = Math.min(340, x1 - x0 - 4); top = Math.max(8, c.colTop + 8); H = hy - lh * .55 - top;
        if (H < 120) { top = Math.max(8, c.vr.top + 6); H = Math.min(190, c.vr.height * .5); hy = Math.min(hy, top + H + lh + 4); }
        left = side === "left" ? x0 : x1 - pw; fr = rect(left, top, pw, H);
      } else {
        var bottom = sTop - 8, Hab = Math.min(vh * (vw <= 640 || vh <= 520 ? .43 : .62), bottom - 14);
        if (Hab >= 150 || vw < pw + lw + 40) {
          var right = side === "right" ? Math.min(vw - 10, hx + lw * .35) : Math.max(pw + 10, hx - lw * .35 + pw);
          left = clamp(right - pw, 10, vw - 10 - pw);
          if (avoid) for (i = 0; i < ng.length; i++) if (ng[i].top < bottom && ng[i].bottom > bottom - Hab && ng[i].left < left + pw && ng[i].right > left) {
            var l2 = side === "right" ? ng[i].left - 10 - pw : ng[i].right + 10;
            if (l2 >= 10 && l2 + pw <= vw - 10) left = l2;
            else if (ng[i].top - 8 > 220 && hy + depth * .6 > ng[i].top) { /* no room beside it: laptop and stack go above it */
              hy = ng[i].top - depth * .6 - 6; sTop = hy - lh * .98; bottom = sTop - 8; Hab = Math.min(vh * (vw <= 640 || vh <= 520 ? .43 : .62), bottom - 14);
            }
          }
          H = Math.max(60, Hab); fr = rect(left, bottom - H, pw, H);
        } else { /* short landscape screens: beside the laptop */
          var bt = Math.min(botLim, hy + depth * .3); H = Math.min(bt - 10, vh * .43, 300);
          left = side === "right" ? hx - lw * .6 - pw : hx + lw * .6; left = clamp(left, 10, vw - 10 - pw);
          fr = rect(left, bt - H, pw, H); g.beside = true;
        }
      }
      g.cmp = true;
    }
    g.hy = hy; g.sTop = hy - lh * .98; g.sy = hy - lh * .55;
    g.fx1 = fr.left; g.fy1 = fr.top; g.fx2 = fr.right; g.fy2 = fr.bottom;
    var A = fr.width * fr.height || 1, o = 0;
    for (i = 0; i < ng.length; i++) o += ovl(fr, ng[i]) / A + ovl(lapR, ng[i]) / (lapR.width * lapR.height);
    g.score = o + (g.cmp && !forceCmp ? .06 : 0) + (fr.height < 120 ? .5 : 0) + (avoid ? .01 : 0);
    return g;
  }

  function layout() {
    var r = S.root; if (!r) return;
    var G = geom(), vw = G.vw, vh = G.vh, lw = G.lw, lh = G.lh, depth = G.depth, hx = G.hx, hy = G.hy, side = G.side;
    var yaw = side === "right" ? 16 : -16, rm = r.classList.contains("mgh-rm");
    var stage = r.querySelector(".mgh-stage"), lap = r.querySelector(".mgh-lap");
    stage.style.left = hx + "px"; stage.style.top = hy + "px";
    stage.style.webkitPerspectiveOrigin = stage.style.perspectiveOrigin = "0px " + (-lh * .4) + "px";
    lap.style.width = lw + "px"; lap.style.left = (-lw / 2) + "px";
    lap.style.transform = rm ? "rotateX(-16deg) rotateY(" + yaw + "deg)" : "rotateX(-21deg) rotateY(" + yaw + "deg)";
    r.querySelector(".mgh-base").style.height = depth + "px";
    r.querySelector(".mgh-lid").style.height = lh + "px";
    var pool = r.querySelector(".mgh-pool"); pool.style.width = lw * 2 + "px"; pool.style.height = lw * .8 + "px"; pool.style.left = -lw + "px"; pool.style.top = (-lw * .25) + "px";
    var pl = r.querySelector(".mgh-plate"); pl.style.width = lw * 1.3 + "px"; pl.style.height = lw * .36 + "px"; pl.style.left = (-lw * .65) + "px"; pl.style.top = (depth * .2) + "px";
    var sx = G.sx, sTop = G.sTop, sw = lw * .78, fx1 = G.fx1, fy1 = G.fy1, fx2 = G.fx2, fy2 = G.fy2;
    /* field */
    var f = r.querySelector(".mgh-field");
    f.classList.toggle("mob", G.cmp); f.classList.toggle("dn", !!G.dn);
    r.classList.toggle("nobeam", !!G.dn);
    if (G.cmp) {
      f.style.left = fx1 + "px"; f.style.width = (fx2 - fx1) + "px"; f.style.maxHeight = (fy2 - fy1) + "px"; f.style.height = "auto";
      if (G.dn) { f.style.top = fy1 + "px"; f.style.bottom = "auto"; } else { f.style.top = "auto"; f.style.bottom = (vh - fy2) + "px"; }
      f.style.transform = ""; f.style.overflow = "visible";
      f.style.webkitPerspectiveOrigin = f.style.perspectiveOrigin = side === "right" ? "80% 100%" : "20% 100%";
    } else {
      f.style.left = fx1 + "px"; f.style.top = fy1 + "px"; f.style.bottom = "auto"; f.style.width = "640px"; f.style.height = "430px"; f.style.maxHeight = "";
      f.style.transformOrigin = "0 0"; f.style.transform = G.k !== 1 ? "scale(" + G.k.toFixed(3) + ")" : ""; f.style.overflow = "visible";
      f.style.webkitPerspectiveOrigin = f.style.perspectiveOrigin = side === "right" ? "90% 100%" : "10% 100%";
    }
    /* soft dark-teal halo behind the panels so the light reads as light on bright pages */
    var halo = r.querySelector(".mgh-halo"), hw = (fx2 - fx1) * 1.2 + 80, hh = (fy2 - fy1) * 1.15 + 100;
    halo.style.left = ((fx1 + fx2) / 2 - hw / 2) + "px"; halo.style.top = ((fy1 + fy2) / 2 - hh / 2 + 20) + "px"; halo.style.width = hw + "px"; halo.style.height = hh + "px";
    /* cone of light from the screen up to the lower part of the panels (it stops below the text) */
    var cone = r.querySelector(".mgh-cone"); cone.setAttribute("viewBox", "0 0 " + vw + " " + vh); cone.setAttribute("preserveAspectRatio", "none");
    var reach = fy1 + (fy2 - fy1) * (G.cmp ? .55 : .45);
    var g = cone.querySelector("linearGradient"); g.setAttribute("x1", sx); g.setAttribute("y1", sTop); g.setAttribute("x2", (fx1 + fx2) / 2); g.setAttribute("y2", reach);
    var p2 = [[sx - sw / 2, sTop + 6], [sx + sw / 2, sTop + 6], [fx2 - (fx2 - fx1) * .08, reach], [fx1 + (fx2 - fx1) * .08, reach]];
    var p1 = [[sx - sw * .7, sTop + 10], [sx + sw * .7, sTop + 10], [fx2 + 24, reach - 16], [fx1 - 24, reach - 16]];
    function pts(a2) { var o = []; for (var i = 0; i < a2.length; i++) o.push(a2[i][0].toFixed(1) + "," + a2[i][1].toFixed(1)); return o.join(" "); }
    cone.querySelector(".c2").setAttribute("points", pts(p2)); cone.querySelector(".c1").setAttribute("points", pts(p1));
    /* particles rising from the screen into the field */
    var ps = r.querySelectorAll(".mgh-pt");
    for (var i = 0; i < ps.length; i++) {
      var q = ps[i], tx = fx1 + (fx2 - fx1) * ((i * 37 % 100) / 100), ty = fy1 + (fy2 - fy1) * ((i * 53 % 70) / 100);
      q.style.left = (sx + (i % 5 - 2) * sw * .1) + "px"; q.style.top = (sTop + 4) + "px";
      q.style.setProperty("--tx", (tx - sx) + "px"); q.style.setProperty("--ty", (ty - sTop) + "px");
      q.style.setProperty("--pd", (2.2 + (i % 4) * .45) + "s"); q.style.setProperty("--pl", (-(i * .37)).toFixed(2) + "s");
    }
    G.mode = (G.cmp ? "c" + Math.round((fy2 - fy1) / 24) + "w" + Math.round((fx2 - fx1) / 24) : "f") + (G.live ? "l" : "") + (G.dn ? "d" : "") + G.side; /* compact: a different room rebuilds the stack */
    S.geo = { vw: vw, vh: vh, mob: G.cmp, cmp: G.cmp, live: G.live, dn: G.dn, mode: G.mode, side: side, hx: hx, hy: hy, lw: lw, sx: sx, sy: G.sy, k: G.k, fx1: fx1, fy1: fy1, fx2: fx2, fy2: fy2 };
  }

  function openLaptop(cb) {
    var r = S.root;
    if (!r) r = build();
    clearGT();
    if (r.classList.contains("open") && r.classList.contains("lit")) { r.classList.add("up", "on", "beam"); gt(cb, 60); return; }
    var rm = r.classList.contains("mgh-rm");
    void r.offsetWidth;
    r.classList.add("up");
    gt(function () { r.classList.add("open"); }, rm ? 0 : 140);
    gt(function () { r.classList.add("lit"); }, rm ? 0 : 820);
    gt(function () { r.classList.add("on", "beam"); }, rm ? 40 : 1150);
    gt(cb, rm ? 80 : 1250);
  }
  function closeLaptop() {
    var r = S.root; if (!r) { S.state = "idle"; return; }
    S.state = "closing"; clearGT();
    var rm = r.classList.contains("mgh-rm");
    r.classList.remove("beam", "on");
    gt(function () { r.classList.remove("lit"); }, rm ? 0 : 320);
    gt(function () { r.classList.remove("open"); }, rm ? 0 : 560);
    gt(function () { r.classList.remove("up"); }, rm ? 120 : 1450);
    gt(function () { if (r.parentNode) r.parentNode.removeChild(r); if (S.root === r) S.root = null; S.state = "idle"; stopPoll(); }, rm ? 520 : 1850);
  }
  function startPoll() { if (S.poll) return; S.poll = setInterval(function () { if (S.root) { layoutSoft(); ctlGuard(); } else stopPoll(); }, 1300); }
  /* QA H2: in a live call the stack never covers the call's own buttons (✕, send): the results panel gives up the room (fewer rows,
     else it goes, as fit() does), and anything still over them lets the clicks through */
  function ctlGuard() {
    try {
      var G = S.geo || {}, sc = S.sc, lv = liveEl(); if (!G.live || !S.root || !sc || !lv) return;
      var ns = lv.querySelectorAll(".jv-ctl,.jv-acts"), top = 1e9, i;
      for (i = 0; i < ns.length; i++) { var r = vis(ns[i]); if (r && r.height) top = Math.min(top, r.top); }
      var f = S.root.querySelector(".mgh-field"); if (top > 1e8 || !f) return;
      var lim = top - 10, bot = function () { var b = 0, ps = f.querySelectorAll(".mgh-p"); for (var j = 0; j < ps.length; j++) { var q = ps[j].getBoundingClientRect(); if (q.height) b = Math.max(b, q.bottom); } return b; };
      var over = bot() - lim, mp = sc.mainEl && sc.mainEl.closest ? sc.mainEl.closest(".mgh-p") : null;
      if (over > 0 && mp && mp.parentNode === f && G.cmp) {
        var nh = Math.floor(mp.getBoundingClientRect().height - over);
        if (nh >= 104) { mp.style.height = nh + "px"; sc.maxItems = Math.max(1, Math.min(3, Math.floor((nh - 62) / 47))); var its = sc.mainEl.querySelectorAll(".mgh-it"); for (var k = its.length - 1; k >= sc.maxItems; k--) its[k].parentNode.removeChild(its[k]); }
        else { f.removeChild(mp); sc.panels.splice(sc.panels.indexOf(mp), 1); sc.mainEl = null; sc.noMain = true; }
      }
      var as = f.querySelectorAll(".mgh-it, .mgh-x"); for (i = 0; i < as.length; i++) { var rr = as[i].getBoundingClientRect(); as[i].style.pointerEvents = rr.height && rr.bottom > lim ? "none" : ""; }
    } catch (e) {}
  }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = 0; } }
  var lastSig = "";
  function layoutSoft() {
    var a = anchorEl(S.sc), sig = a && a.r ? [Math.round(a.r.left), Math.round(a.r.top), Math.round(a.r.width), Math.round(a.r.height)].join() : "-";
    var ng = noGo(); for (var i = 0; i < ng.length; i++) sig += "|b" + Math.round(ng[i].left) + "," + Math.round(ng[i].top);
    sig += "|" + (W.innerWidth || 0) + "x" + (W.innerHeight || 0);
    if (sig !== lastSig) { lastSig = sig; relayout(); }
  }
  /* re-measure; when the layout mode changes (phone ↔ desktop, rotation, live call) rebuild the panels of the running scene in place */
  function relayout() {
    if (!S.root) return;
    var before = S.geo && S.geo.mode;
    layout();
    var sc = S.sc;
    if (!sc || sc.dead || !sc.panels.length || S.state === "closing") return;
    if (S.geo.mode !== before) present(sc, true);
    else rays(sc.panels, true);
  }

  /* ---------- scenes ---------- */
  function newScene(spec) {
    var sc = { id: ++S.uid, spec: spec, who: spec.who === "bassem" || spec.who === "janna" ? spec.who : defWho(), tool: spec.tool || "", kind: spec.kind || "generic",
      title: spec.title || "", plan: spec.plan || [], main: spec.main || null, anchor: spec.anchor || null, steps: [], panels: [], t: [], dead: false, done: false,
      planDone: false, items: spec.items || null, count: spec.count, key: spec.key || "", acted: {}, hurryAt: 0 };
    if (!sc.main && (sc.items || sc.count != null)) sc.main = { type: "results" };
    return sc;
  }
  function st(sc, fn, ms) { var id = setTimeout(function () { if (!sc.dead) fn(); }, ms); sc.t.push(id); return id; }
  function si(sc, fn, ms) { var id = setInterval(function () { if (sc.dead) { clearInterval(id); return; } fn(); }, ms); sc.t.push(id); return id; }
  function kill(sc) { if (!sc) return; sc.dead = true; for (var i = 0; i < sc.t.length; i++) { clearTimeout(sc.t[i]); clearInterval(sc.t[i]); } sc.t = []; }
  /* something newer is waiting: finish the current scene fast (steps tick quickly, short hold) */
  function hurry(sc) {
    if (!sc || sc.dead || sc.hurryAt) return;
    sc.hurryAt = now();
    if (sc.cur) { clearTimeout(sc.cur.id); var f = sc.cur.fin; sc.cur = null; st(sc, f, 150); }
  }

  function panel(sc, slot, cls, inner, o) {
    o = o || {};
    var p = el("div", "mgh-p mgh-" + slot + "p" + (o.tx ? " mgh-tx" : "")), b = el("div", "mgh-bob"), g = el("div", "mgh-g mgh-" + cls);
    g.dir = EN() ? "ltr" : "rtl"; g.lang = EN() ? "en" : "ar";
    if (o.deco) p.setAttribute("aria-hidden", "true");
    g.innerHTML = '<span class="mgh-cn" aria-hidden="true"></span>' + (o.hd ? '<div class="mgh-hd" aria-hidden="true"><i></i><i></i><i></i><em></em><span>' + esc(o.hd) + "</span></div>" : "") + inner;
    b.appendChild(g); p.appendChild(b);
    p._slot = slot; p._g = g;
    sc.panels.push(p);
    return p;
  }
  /* desktop constellation (fractions of a 640×430 field, measured from the laptop side) */
  var SLOTS = {
    task: { n: 0, t: .6, w: 300, z: 50, ry: 6, rx: 2, bt: 6.6 },
    steps: { n: .02, t: .03, w: 272, z: -10, ry: 8, rx: 3, bt: 7.4 },
    main: { n: .5, t: 0, w: 304, z: 0, ry: 10, rx: 3, bt: 8.2 },
    chart: { n: .5, t: .66, w: 206, z: -40, ry: 12, rx: 4, bt: 6.9 },
    ring: { n: .835, t: .62, w: 106, z: -20, ry: 14, rx: 3, bt: 7.8 },
    ai: { n: .4, t: .43, w: 66, z: 80, ry: 6, rx: 0, bt: 5.6 }
  };
  var ORDER = ["task", "steps", "ai", "main", "ring", "chart"];
  function hdTask(w) { return w === "bassem" ? T("باسم · مهمة مباشرة", "Advisor · live task") : T("جنة · مهمة مباشرة", "Janna · live task"); }

  function present(sc, re) {
    if (sc.dead) return;
    var r = S.root; if (!r) return;
    if (!re) S.state = "working";
    layout();
    var G = S.geo, f = r.querySelector(".mgh-field"), cmp = G.cmp, rm = r.classList.contains("mgh-rm");
    f.innerHTML = ""; sc.panels = []; sc.mainEl = null;
    var who = sc.who, head = BASE + "img/" + who + "/head.webp";
    var x = '<button type="button" class="mgh-x" aria-label="' + esc(T("إخفاء الشاشة الضوئية", "Hide the hologram")) + '" title="' + esc(T("إخفاء (Esc)", "Hide (Esc)")) + '">×</button>';
    var taskInner = x + '<div class="who"><img alt="" src="' + esc(head) + '"><span>' + esc(T(ROLE[who][0], ROLE[who][1])) + "</span>"
      + (cmp ? '<span class="tm" aria-hidden="true">' + ringSvg() + '<b class="mgh-ai">AI</b></span>' : "")
      + "</div><h4>" + esc(sc.title) + '</h4><div class="mgh-bar" aria-hidden="true"><i></i></div>' + (cmp ? '<ol class="mgh-steps"></ol>' : "");
    var task = panel(sc, "task", "task", taskInner, { hd: hdTask(who), tx: true }), list = [], mainP = null;
    sc.noMain = false; sc.maxItems = 0;
    if (cmp) {
      /* compact (phone, short screens, live call): main panel (if any, never in a live call) above the task card */
      /* a live call with a tall free band beside the face (owner 2026-11-18): the main screen opens too, under the task card */
      var tall = G.live && G.dn && (G.fy2 - G.fy1) >= 300;
      if (sc.main && (!G.live || tall)) mainP = mainPanel(sc); else sc.noMain = true;
      list = G.dn ? (mainP ? [task, mainP] : [task]) : mainP ? [mainP, task] : [task];
    } else {
      list.push(task);
      list.push(panel(sc, "steps", "stepsg", '<ol class="mgh-steps"></ol>', { hd: T("خطوات التنفيذ", "Process"), tx: true }));
      if (sc.main) { mainP = mainPanel(sc); list.push(mainP); }
      list.push(panel(sc, "ai", "aig", '<b class="mgh-ai">AI</b>', { deco: true })); /* after main: floats in front of it */
      list.push(panel(sc, "ring", "ringg", ringSvg() + "<small>" + esc(T("تقدّم المهمة", "Task progress")) + "</small>", { deco: true }));
      list.push(panel(sc, "chart", "chart", chartHtml(), { deco: true, hd: T("نشاط", "Activity") }));
    }
    var i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i]; p.classList.add("pre");
      if (!cmp) {
        var s = SLOTS[p._slot] || SLOTS.main, left = G.side === "right" ? 640 - s.n * 640 - s.w : s.n * 640;
        p.style.left = left + "px"; p.style.top = (s.t * 430) + "px"; p.style.width = s.w + "px";
        if (p._slot === "ai") p.style.height = s.w + "px";
        p.style.setProperty("--z", rm ? "0px" : s.z + "px"); p.style.setProperty("--ry", rm ? "0deg" : (G.side === "right" ? s.ry : -s.ry) + "deg"); p.style.setProperty("--rx", rm ? "0deg" : s.rx + "deg");
        p.firstChild.style.setProperty("--bt", s.bt + "s");
      } else {
        p.style.setProperty("--z", "0px"); p.style.setProperty("--ry", rm ? "0deg" : (G.side === "right" ? 6 : -6) + "deg"); p.style.setProperty("--rx", "0deg");
        p.firstChild.style.setProperty("--bt", (6 + i) + "s");
      }
      p._g.style.setProperty("--sw", (1 + i * .7).toFixed(1) + "s");
      f.appendChild(p);
    }
    if (cmp) fit(sc, f, task, mainP);
    var close = f.querySelector(".mgh-x"); if (close) close.onclick = function () { api.close(true); };
    var img = f.querySelector(".mgh-task img"); if (img) img.onerror = function () { this.style.display = "none"; };
    list = sc.panels.slice();
    /* measure final spots, then fly out of the screen one by one */
    for (i = 0; i < list.length; i++) {
      p = list[i];
      var rc = p.getBoundingClientRect(), k = G.k || 1;
      var dx = (G.sx - (rc.left + rc.width / 2)) / k, dy = (G.sy - (rc.top + rc.height / 2)) / k;
      p.style.setProperty("--dx", dx.toFixed(1) + "px"); p.style.setProperty("--dy", dy.toFixed(1) + "px");
    }
    rays(list, re);
    var ord = cmp ? list.slice().reverse() : ORDER.map(function (n) { for (var j = 0; j < list.length; j++) if (list[j]._slot === n || (n === "main" && list[j] === mainP)) return list[j]; return null; }).filter(function (q) { return q; });
    for (i = 0; i < ord.length; i++) {
      var o = ord[i]; o.classList.remove("pre");
      if (re) { o.classList.add("set"); continue; }
      o.style.setProperty("--d", (rm ? i * .06 : i * .16).toFixed(2) + "s"); o.classList.add("go");
      (function (q, ms) { st(sc, function () { settle(q); }, ms); })(o, (rm ? 450 + i * 60 : 1100 + i * 160)); /* fallback if animationend is missed */
    }
    sc.ringEl = f.querySelector(".mgh-ring");
    sc.stepsEl = f.querySelector(".mgh-steps");
    sc.taskEl = f.querySelector(".mgh-task");
    if (re) { restore(sc); return; }
    srSay(sc.title);
    startPoll();
    var pre = sc.preSteps || [];
    for (i = 0; i < pre.length; i++) addStep(sc, pre[i].t, pre[i].s);
    if (sc.items || sc.count != null) fillResults(sc, { items: sc.items || [], count: sc.count });
    st(sc, function () { runPlan(sc); }, rm || sc.hurryAt ? 200 : 900);
  }
  /* compact stack: never taller than the room it was given (≤45% of the screen, above the captions) */
  function fit(sc, f, task, mainP) {
    var room = parseFloat(f.style.maxHeight) || 300, gap = 8, th = task.offsetHeight;
    if (th > room) { task._g.classList.add("s2"); th = task.offsetHeight; }
    if (th > room) { task._g.classList.add("s1"); th = task.offsetHeight; }
    if (mainP) {
      var mh = Math.min(sc.main.type === "results" ? 196 : 176, room - th - gap);
      if (mh < 104) { f.removeChild(mainP); sc.panels.splice(sc.panels.indexOf(mainP), 1); sc.mainEl = null; sc.noMain = true; }
      else { mainP.style.height = Math.floor(mh) + "px"; sc.maxItems = Math.max(1, Math.min(3, Math.floor((mh - 62) / 47))); } /* fixed height: nothing shifts when results arrive */
    }
  }
  /* rebuild after a mode change: same scene, its steps/progress/results/main state, no restart */
  function restore(sc) {
    var max = S.geo.cmp ? 3 : 5, from = Math.max(0, sc.steps.length - max);
    for (var i = 0; i < sc.steps.length; i++) { var s = sc.steps[i]; s.li = mkLi(s.t, s.s); s.li.classList.add("sh"); if (i >= from && sc.stepsEl) sc.stepsEl.appendChild(s.li); }
    var pct = sc.pct || 0; sc.pct = pct; if (sc.ringEl) { sc.ringEl.querySelector(".v").setAttribute("stroke-dashoffset", (226.2 * (1 - pct / 100)).toFixed(1)); sc.ringEl.querySelector("b").textContent = pct + "%"; }
    S.instant = true;
    try {
      if (sc.res) fillResults(sc, sc.res);
      for (var k in sc.acted) mainAct(sc, k);
    } finally { S.instant = false; }
    if (sc.done && sc.taskEl) sc.taskEl.classList.add("mgh-done");
  }

  /* thin projection rays from the screen to the panels' near corners */
  function rays(list, instant) {
    var r = S.root, G = S.geo, sv = r && r.querySelector(".mgh-rays"); if (!sv) return;
    var h = "", sx = G.sx;
    function ln(x1, y1, x2, y2, o) { h += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="url(#mghRy)" style="stroke-opacity:' + o + '"/>'; }
    var top = G.sy - (G.hy - G.sy) * .75;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].parentNode) continue;
      var rc = list[i].getBoundingClientRect(), near = G.side === "right" ? rc.right : rc.left, far = G.side === "right" ? rc.left : rc.right;
      if (G.cmp) { if (list[i]._slot === "task") { ln(sx - 12, top, rc.left + 6, rc.bottom, .9); ln(sx + 12, top, rc.right - 6, rc.bottom, .9); } continue; }
      if (list[i]._slot === "ai") continue;
      ln(sx + (G.side === "right" ? 10 : -10), top, near - (G.side === "right" ? 4 : -4), rc.bottom - 2, .85);
      if (list[i]._slot === "task" || list[i]._slot === "main" || list[i]._slot === "steps") ln(sx - (G.side === "right" ? 14 : -14), top, far + (G.side === "right" ? 6 : -6), rc.bottom - 2, .45);
    }
    sv.setAttribute("viewBox", "0 0 " + G.vw + " " + G.vh);
    sv.innerHTML = '<defs><linearGradient id="mghRy" gradientUnits="userSpaceOnUse" x1="' + sx + '" y1="' + top + '" x2="' + (G.fx1 + G.fx2) / 2 + '" y2="' + G.fy1 + '"><stop offset="0" stop-color="#bff6ff" stop-opacity=".9"/><stop offset=".6" stop-color="#3fe0ff" stop-opacity=".45"/><stop offset="1" stop-color="#3fe0ff" stop-opacity=".12"/></linearGradient></defs>' + h;
    var ls = sv.querySelectorAll("line"), rm = r.classList.contains("mgh-rm");
    for (var j = 0; j < ls.length; j++) { if (instant || rm) ls[j].classList.add("on"); else (function (l, k) { setTimeout(function () { l.classList.add("on"); }, 500 + k * 90); })(ls[j], j); }
  }
  function unrays() { var sv = S.root && S.root.querySelector(".mgh-rays"); if (!sv) return; var ls = sv.querySelectorAll("line"); for (var j = 0; j < ls.length; j++) ls[j].classList.remove("on"); }
  function collapse(sc, cb) {
    unrays();
    if (!sc) { cb && cb(); return; }
    kill(sc);
    var ps = sc.panels.slice(), rm = S.root && S.root.classList.contains("mgh-rm");
    for (var i = 0; i < ps.length; i++) { var p = ps[ps.length - 1 - i]; p.style.setProperty("--d", (rm ? 0 : i * .07).toFixed(2) + "s"); p.classList.remove("go", "set", "pre"); p.classList.add("in"); }
    var r = S.root;
    gt(function () { for (var j = 0; j < ps.length; j++) if (ps[j].parentNode) ps[j].parentNode.removeChild(ps[j]); if (r) { var f = r.querySelector(".mgh-field"); if (f && !S.sc) f.innerHTML = ""; } cb && cb(); }, rm ? 320 : 600 + ps.length * 70);
  }

  /* ---------- steps + progress ---------- */
  function mkLi(text, state) { var li = el("li", state || "doing"); li.innerHTML = '<b aria-hidden="true"></b><span></span>'; li.lastChild.textContent = text; return li; }
  function addStep(sc, text, state) {
    var li = mkLi(text, state);
    sc.steps.push({ t: text, s: state || "doing", li: li });
    if (sc.stepsEl) {
      sc.stepsEl.appendChild(li);
      var lis = sc.stepsEl.children, max = S.geo && S.geo.cmp ? 3 : 5;
      while (lis.length > max) sc.stepsEl.removeChild(lis[0]);
      void li.offsetWidth; li.classList.add("sh");
    }
    prog(sc); if (state === "fail") srSay(text); ctlGuard();
    return sc.steps.length - 1;
  }
  function setStep(sc, i, state, text) {
    var s = sc.steps[i]; if (!s) return;
    if (text) { s.t = text; s.li.lastChild.textContent = text; }
    s.s = state; s.li.className = state + " sh";
    prog(sc);
  }
  function prog(sc) {
    var n = sc.steps.length, d = 0, total = Math.max(n, sc.planLen || 0, 1);
    for (var i = 0; i < n; i++) d += sc.steps[i].s === "done" || sc.steps[i].s === "fail" || sc.steps[i].s === "wait" ? 1 : sc.steps[i].s === "doing" ? .45 : 0;
    var pct = sc.done ? 100 : Math.min(96, Math.round(100 * d / total));
    ringTo(sc, pct);
  }
  function ringSvg() {
    var id = "mghRg";
    return '<div class="mgh-ring"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ff0ff"/><stop offset=".6" stop-color="#19c3d6"/><stop offset="1" stop-color="#e9c46a"/></linearGradient></defs>'
      + '<circle class="o" cx="50" cy="50" r="48"/><circle class="o2" cx="50" cy="50" r="44"/><circle class="t" cx="50" cy="50" r="36"/><circle class="v" cx="50" cy="50" r="36" stroke-dasharray="226.2" stroke-dashoffset="226.2"/></svg><b>0%</b></div>';
  }
  function ringTo(sc, pct) {
    var R = sc.ringEl; if (!R) { sc.pct = pct; return; }
    R.querySelector(".v").setAttribute("stroke-dashoffset", (226.2 * (1 - pct / 100)).toFixed(1));
    var b = R.querySelector("b"), from = sc.pct || 0, t0 = now();
    sc.pct = pct;
    if (S.root && S.root.classList.contains("mgh-rm")) { b.textContent = pct + "%"; return; }
    (function tick() { if (sc.dead) return; var k = Math.min(1, (now() - t0) / 650), v = Math.round(from + (pct - from) * (1 - Math.pow(1 - k, 3))); b.textContent = v + "%"; if (k < 1) (W.requestAnimationFrame || setTimeout)(tick, 16); })();
  }
  /* abstract, unlabeled activity chart (decorative: no numbers) — HTML bars + a revealed line, transform-only animation */
  function chartHtml() {
    var bars = "", hs = [.35, .6, .45, .8, .55, .9, .4, .7, .5, .85, .6, .75, .45, .65];
    for (var i = 0; i < hs.length; i++) bars += '<i style="--h:' + hs[i] + ";--h2:" + (0.35 + ((i * 7) % 10) / 15).toFixed(2) + ";--dl:-" + (i * .21).toFixed(2) + 's"></i>';
    return '<div class="mgh-ch" aria-hidden="true"><div class="bars">' + bars + '</div>'
      + '<svg viewBox="0 0 200 84" preserveAspectRatio="none" focusable="false"><path class="ln2" d="M0 50 C25 62 40 30 70 38 S115 66 140 44 S180 18 200 26"/></svg>'
      + '<div class="mgh-rv"><svg viewBox="0 0 200 84" preserveAspectRatio="none" focusable="false"><path class="ln" d="M0 62 C20 40 38 52 58 34 S98 20 118 36 S160 60 200 14"/></svg></div></div>';
  }

  /* ---------- main panels ---------- */
  function mainPanel(sc) {
    var m = sc.main, t = m.type, h = "", hd = "";
    if (t === "results") { hd = m.hd || T("من الصفحة", "From the page"); h = "<h5><span>" + esc(T("النتايج", "Results")) + '</span><em hidden></em></h5><div class="mgh-list" role="list"><span class="mgh-sk"></span><span class="mgh-sk"></span><span class="mgh-sk"></span><span class="mgh-sk"></span></div>'; }
    else if (t === "page") { hd = T("بيفتح", "Opening"); h = '<div class="mgh-url">madeinegyptgate.com/' + esc(m.path || "") + "</div><h5><span>" + esc(m.name) + '</span></h5><span class="mgh-sk"></span><span class="mgh-sk"></span><span class="mgh-sk"></span>'; }
    else if (t === "mail") {
      hd = T("مسودة بالذكاء الاصطناعي", "AI draft");
      h = "<h5><span>" + esc(T("مسودة إيميل", "E-mail draft")) + '</span><em>' + esc(m.lang || "") + "</em></h5>"
        + (m.to ? '<div class="mgh-row"><span>' + esc(T("إلى:", "To:")) + '</span><b dir="auto">' + esc(m.to) + "</b></div>" : "")
        + '<div class="mgh-row"><span>' + esc(T("الموضوع:", "Subject:")) + '</span><b class="sub" dir="auto"></b></div><div class="mgh-body" dir="auto"></div>';
    }
    else if (t === "form") {
      hd = T("نموذج", "Form");
      h = "<h5><span>" + esc(m.name) + "</span></h5><div class=\"mgh-fm\">";
      for (var i = 0; i < m.rows.length; i++) h += '<div class="f"><span>' + esc(m.rows[i][0]) + '</span><b data-v="' + i + '" dir="auto"></b></div>';
      h += "</div>";
    }
    else if (t === "cal") {
      hd = T("المواعيد", "Calendar");
      var dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(m.date || ""), MON = EN() ? ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] : ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
      var dd = dm ? '<span style="font-size:22px">' + (+dm[3]) + "</span><small>" + esc(MON[(+dm[2] - 1) % 12] || "") + "</small>" : m.date ? esc(str(m.date, 8)) : "📅";
      h = "<h5><span>" + esc(m.name) + '</span></h5><div class="mgh-cal"><div class="tile"><div class="d">' + dd + (m.time ? "<small>" + esc(m.time) + "</small>" : "") + '</div><div class="tx">' + esc(m.line || "") + (m.sub ? "<small>" + esc(m.sub) + "</small>" : "") + "</div></div></div>";
    }
    else if (t === "pipe") {
      hd = T("خط الصفقة", "Deal pipeline");
      var cur = -1; for (var j = 0; j < STG.length; j++) if (STG[j][0] === m.stage) cur = j;
      if (m.stage === "won") cur = STG.length;
      h = "<h5><span>" + esc(m.name || T("الصفقة", "Deal")) + "</span>" + (m.stage === "won" ? "<em>🏆 " + esc(T("تمّت", "Won")) + "</em>" : m.stage === "lost" ? "<em>" + esc(T("لم تكتمل", "Lost")) + "</em>" : "") + '</h5><div class="mgh-stg" aria-hidden="true">';
      for (j = 0; j < STG.length; j++) h += '<i data-k="' + j + '">' + esc(T(STG[j][1], STG[j][2])) + "</i>";
      h += "</div>" + (m.next ? '<div class="mgh-nx"><span>' + esc(T("الخطوة الجاية: ", "Next step: ")) + "</span>" + esc(m.next) + "</div>" : "") + (m.due ? '<div class="mgh-nx"><span>' + esc(T("الميعاد: ", "Due: ")) + "</span><bdi>" + esc(m.due) + "</bdi></div>" : "");
      sc.pipeCur = cur;
    }
    else if (t === "guide") {
      hd = T("دليل التعاقد", "Contract guide");
      h = "<h5><span>" + esc(m.name) + '</span></h5><div class="mgh-gd"><ol>';
      for (var g = 0; g < m.list.length; g++) h += '<li><i>' + (g + 1) + "</i><span>" + esc(m.list[g]) + "</span></li>";
      h += "</ol></div>";
    }
    else if (t === "notify") {
      hd = T("تنبيه", "Notify");
      h = "<h5><span>" + esc(T("تنبيه للعضو", "Member alert")) + '</span></h5><div class="mgh-chips">';
      for (var c = 0; c < m.ch.length; c++) h += '<span class="mgh-chip" data-c="' + c + '"><i></i>' + esc(m.ch[c][0]) + " · <span>" + esc(T("بيتبعت…", "sending…")) + "</span></span>";
      h += "</div>" + (m.msg ? '<div class="mgh-msg" dir="auto">' + esc(m.msg) + "</div>" : "");
    }
    else if (t === "sent") {
      hd = T("إرسال", "Send");
      h = '<div class="mgh-sent"><svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="24"/><path d="M15 28 L24 36 L39 19"/></svg><div class="tx">' + esc(m.line) + '<small class="st">' + esc(m.sub || "") + "</small></div></div>";
    }
    var p = panel(sc, "main", "main mgh-" + (t === "results" ? "res" : t), h, { hd: hd, tx: true });
    if (t === "results") { p._g.setAttribute("role", "group"); p._g.setAttribute("aria-label", T("النتايج", "Results")); }
    else p.setAttribute("aria-hidden", "true");
    sc.mainEl = p._g;
    return p;
  }
  function typeTo(sc, node, text, cps, cb) {
    text = String(text || "");
    if (!node) { cb && cb(); return; }
    if (S.instant || (S.root && S.root.classList.contains("mgh-rm"))) { node.textContent = text; cb && cb(); return; }
    var i = 0, caret = el("span", "mgh-caret"), tn = D.createTextNode("");
    node.textContent = ""; node.appendChild(tn); node.appendChild(caret);
    var step = Math.max(1, Math.round(cps / 30)), id = si(sc, function () {
      i = Math.min(text.length, i + step); tn.nodeValue = text.slice(0, i);
      if (i >= text.length) { clearInterval(id); st(sc, function () { if (caret.parentNode) caret.parentNode.removeChild(caret); cb && cb(); }, 350); }
    }, 33);
  }
  function showSeq(sc, nodes, gap) { for (var i = 0; i < nodes.length; i++) { if (S.instant) nodes[i].classList.add("sh"); else (function (n, k) { st(sc, function () { n.classList.add("sh"); }, k * gap); })(nodes[i], i); } }
  function pipeLight(sc, upto) {
    if (!sc.mainEl) return; var is = sc.mainEl.querySelectorAll(".mgh-stg i");
    for (var j = 0; j < is.length; j++) { is[j].className = j < upto ? "on" : j === upto ? "cur" : ""; }
  }
  function mainAct(sc, what) {
    sc.acted[what] = 1;
    var m = sc.main, g = sc.mainEl; if (!m || !g) return;
    if (what === "type" && m.type === "mail") { typeTo(sc, g.querySelector(".sub"), m.subject || "…", 40, function () { typeTo(sc, g.querySelector(".mgh-body"), m.body || "", 70); }); }
    if (what === "type" && m.type === "form") { var bs = g.querySelectorAll(".f b"), k = 0; (function nx() { if (k >= bs.length) return; var b = bs[k]; typeTo(sc, b, m.rows[k][1], 45, function () { k++; nx(); }); })(); }
    if (what === "stage" && m.type === "pipe") { var cur = sc.pipeCur, n = 0; if (cur < 0) return; if (S.instant) { pipeLight(sc, cur); return; } (function walk() { pipeLight(sc, n); if (n < cur && n < STG.length) { n++; st(sc, walk, 260); } })(); }
    if (what === "guide" && m.type === "guide") showSeq(sc, g.querySelectorAll(".mgh-gd li"), 260);
    var ch = g.querySelectorAll(".mgh-chip"), sn = g.querySelector(".mgh-sent"), c;
    /* "sent ✓" only after a real confirmation (form submit event / engine report); otherwise "awaiting confirmation" */
    var okT = sc.spec && sc.spec.okText ? sc.spec.okText : ["اتبعت", "Sent"];
    if (what === "sent") { delete sc.acted.pending; if (sn) { sn.classList.add("ok"); sn.querySelector(".st").textContent = T(okT[0] + " ✓", okT[1] + " ✓"); } for (c = 0; c < ch.length; c++) { ch[c].classList.add("ok"); ch[c].lastChild.textContent = T(okT[0] + " ✓", okT[1].toLowerCase() + " ✓"); } }
    if (what === "fail") { delete sc.acted.pending; if (sn) { sn.classList.remove("ok"); sn.querySelector(".st").textContent = T("مااتبعتش ✗", "Not sent ✗"); } for (c = 0; c < ch.length; c++) ch[c].lastChild.textContent = T("مااتبعتش", "not sent"); }
    if (what === "pending" && !sc.acted.sent) { if (sn) sn.querySelector(".st").textContent = T("مستني تأكيد الإرسال", "Awaiting confirmation"); for (c = 0; c < ch.length; c++) ch[c].lastChild.textContent = T("مستني التأكيد", "awaiting confirmation"); }
  }

  /* ---------- results ---------- */
  function fillResults(sc, data) {
    sc.res = data;
    var G = S.geo || {};
    if (!sc.mainEl || !sc.main || sc.main.type !== "results") {
      if (sc.dead || !S.root || sc.noMain || G.cmp) return; /* compact/live: the step line carries the result */
      /* a desktop scene without a results panel: swap its main panel for one */
      var old = null; for (var i = 0; i < sc.panels.length; i++) if (sc.panels[i]._slot === "main") old = sc.panels[i];
      sc.main = { type: "results" };
      var p = mainPanel(sc), f = S.root.querySelector(".mgh-field"), s = SLOTS.main;
      if (old && old.parentNode) { f.replaceChild(p, old); sc.panels.splice(sc.panels.indexOf(old), 1); } else f.appendChild(p);
      p.style.left = (G.side === "right" ? 640 - s.n * 640 - s.w : s.n * 640) + "px"; p.style.top = s.t * 430 + "px"; p.style.width = s.w + "px"; p.style.setProperty("--z", s.z + "px"); p.style.setProperty("--ry", (G.side === "right" ? s.ry : -s.ry) + "deg"); p.style.setProperty("--rx", s.rx + "deg");
      p.style.setProperty("--dx", "0px"); p.style.setProperty("--dy", "40px"); p.style.setProperty("--d", "0s"); p.classList.add("go");
      st(sc, function () { settle(p); }, 1100);
    }
    var g = sc.mainEl, list = g.querySelector(".mgh-list"), em = g.querySelector("h5 em");
    var items = (data && data.items) || [], cnt = data && data.count != null && data.count !== "" ? +data.count : null;
    if (em) { if (cnt != null && !isNaN(cnt)) { em.hidden = false; em.textContent = cnt.toLocaleString("en-US"); } else em.hidden = true; }
    list.innerHTML = "";
    var max = G.cmp ? sc.maxItems || 3 : 5, nodes = [];
    if (!items.length) { var none = el("div", "mgh-none"); none.textContent = data && data.note ? data.note : cnt === 0 ? T("مفيش نتايج مطابقة للبحث ده", "No matching results") : T("النتايج ظاهرة على الشاشة", "The results are on the screen"); list.appendChild(none); return; }
    for (var j = 0; j < items.length && j < max; j++) {
      var it = items[j] || {}, href = it.href ? String(it.href) : "", safe = /^(https?:|\/|[a-z0-9._-]+\.html)/i.test(href) && !/^javascript:/i.test(href);
      var a = el(safe ? "a" : "div", "mgh-it"); a.setAttribute("role", "listitem");
      if (safe) { a.href = href; if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) { a.target = "_blank"; a.rel = "noopener noreferrer"; } }
      a.innerHTML = '<b dir="auto"></b>' + (it.sub ? '<small dir="auto"></small>' : "");
      a.firstChild.textContent = str(it.title, 120); if (it.sub) a.lastChild.textContent = str(it.sub, 120);
      (function (a2, it2, safe2) {
        a2.addEventListener("click", function (e) {
          var fr = liveFrame();
          if (safe2 && fr && it2._doc && it2._doc !== D) { e.preventDefault(); try { fr.contentWindow.location.href = a2.href; } catch (x) { fr.src = a2.href; } return; }
          if (!safe2 && it2._el) { try { it2._el.scrollIntoView({ behavior: "smooth", block: "center" }); it2._el.click(); } catch (x) {} }
        });
        if (!safe2 && it2._el) { a2.tabIndex = 0; a2.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); a2.click(); } }); }
      })(a, it, safe);
      list.appendChild(a); nodes.push(a);
    }
    sc.hasItems = true;
    showSeq(sc, nodes, 140); ctlGuard();
  }
  /* Egyptian Arabic count phrase: نتيجة واحدة · نتيجتين · 3–10 نتايج · 11+ نتيجة */
  function arN(n) { return n === 1 ? "نتيجة واحدة" : n === 2 ? "نتيجتين" : n.toLocaleString("en-US") + (n >= 3 && n <= 10 ? " نتايج" : " نتيجة"); }
  function pageOf(doc) { var p = ""; try { var w = doc.defaultView; p = w && w.MIGPAGE ? String(w.MIGPAGE) : ""; if (!p) p = (doc.location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, ""); } catch (e) {} return (p || "home").replace(/^index$/, "home"); }
  function readPage(doc) {
    var pg = pageOf(doc), s = SPEC[pg]; if (!s) return { page: pg, ok: false };
    var cards = [], all; try { all = doc.querySelectorAll(s.card); } catch (e) { return { page: pg, ok: false }; }
    for (var i = 0; i < all.length && cards.length < 8; i++) {
      var c = all[i]; if (!c.getClientRects().length) continue;
      var t = c.querySelector(s.title), sb = s.sub ? c.querySelector(s.sub) : null, title = str(t && t.textContent, 120);
      if (!title) continue;
      var href = c.tagName === "A" && c.getAttribute("href") ? c.href : "";
      cards.push({ title: title, sub: str(sb && sb.textContent, 90), href: href, _el: c, _doc: doc });
    }
    var visible = 0; for (var v = 0; v < all.length; v++) if (all[v].getClientRects().length) visible++;
    var ce = s.count ? doc.querySelector(s.count) : null, count = ce ? num(ce.textContent) : null;
    return { page: pg, ok: true, items: cards, count: count, visible: visible, sig: (ce ? ce.textContent : "") + "|" + visible + "|" + cards.slice(0, 3).map(function (q) { return q.title; }).join("~") };
  }
  /* ---- verified search: results are shown only once the page really shows THIS search ---- */
  function curDoc(ctx) {
    if (ctx.live) { var fr = liveFrame(); if (!fr) return null; try { return fr.contentDocument; } catch (e) { return null; } }
    return D;
  }
  /* state of the target page: is it open (a fresh document in a live call), does its search box hold the query, is the governorate applied */
  function probe(ctx) {
    var d = curDoc(ctx), o = { page: false, q: false, g: false, gNA: false, d: d };
    if (!d || d.readyState === "loading" || pageOf(d) !== ctx.page || (ctx.live && d === ctx.doc0)) return o;
    o.page = true;
    var bx = BOX[ctx.page] || [], qb = null, gs = null;
    try { qb = bx[0] ? d.querySelector(bx[0]) : null; gs = bx[1] ? d.querySelector(bx[1]) : null; } catch (e) {}
    o.q = !ctx.q || !!(qb && norm(qb.value).indexOf(norm(ctx.q)) > -1);
    /* pages that apply the search only on submit: the box alone is not proof */
    if (o.q && ctx.q && APPLIED[ctx.page]) { try { o.q = APPLIED[ctx.page](d, ctx.q); } catch (e) { o.q = false; } }
    if (!ctx.g) o.g = true;
    else if (!gs || gs.tagName !== "SELECT") { o.g = true; o.gNA = true; }
    else {
      var op = gs.options[gs.selectedIndex], tx = op ? norm(String(op.textContent).split(" · ")[0]) : "", gn = norm(GOV[ctx.code] || ctx.g);
      o.g = !!(gs.value && (String(gs.value).toUpperCase() === ctx.code || (tx && (tx.indexOf(gn) > -1 || gn.indexOf(tx) > -1))));
    }
    return o;
  }
  function deadline(sc, ctx) { var d = ctx.t0 + (ctx.live ? 9000 : 4200); return sc.hurryAt ? Math.min(d, sc.hurryAt + 1000) : d; }
  /* poll until test() is true (and at least minMs passed, for pacing) or the shared deadline passes */
  function pollStep(sc, ctx, test, minMs, done) {
    var t1 = now();
    if (!ctx.t0) ctx.t0 = t1;
    var id = si(sc, function () {
      var ok = test(), el2 = now() - t1;
      if (ok && el2 >= (sc.hurryAt ? 0 : minMs)) { clearInterval(id); done(true); }
      else if (now() > deadline(sc, ctx)) { clearInterval(id); done(false); }
    }, 160);
  }
  var FAILTXT = { page: ["الصفحة لسه ما اتفتحتش", "The page hasn't opened yet"], q: ["البحث لسه ما اتطبّقش على الصفحة", "The search isn't applied on the page yet"], g: ["فلتر المحافظة لسه ما اتطبّقش", "The governorate filter isn't applied yet"] };
  function failRes(sc, ctx) { if (sc.main && sc.main.type === "results") fillResults(sc, { items: [], count: null, note: T("مستني الصفحة تعرض نتايج البحث ده", "Waiting for the page to show this search") }); }
  function searchPlan(ctx, openTxt, P) {
    var plan = [];
    var ok = function () { return !ctx.fail; };
    plan.push({ t: openTxt, wait: function (sc, done) {
      pollStep(sc, ctx, function () { return probe(ctx).page; }, 850, function (y) { if (y) done(null, "done"); else { ctx.fail = "page"; failRes(sc, ctx); done(T(FAILTXT.page[0], FAILTXT.page[1]), "wait"); } });
    } });
    if (ctx.q) plan.push({ t: T("بكتب «" + ctx.q + "» في البحث", "Typing “" + ctx.q + "” in search"), cond: ok, wait: function (sc, done) {
      pollStep(sc, ctx, function () { var p = probe(ctx); return p.page && p.q; }, 850, function (y) { if (y) done(null, "done"); else { ctx.fail = "q"; failRes(sc, ctx); done(T(FAILTXT.q[0], FAILTXT.q[1]), "wait"); } });
    } });
    if (ctx.g) plan.push({ t: T("بفلتر بالمحافظة: " + ctx.gName, "Filtering by governorate: " + ctx.gName), cond: ok, wait: function (sc, done) {
      pollStep(sc, ctx, function () { var p = probe(ctx); return p.page && p.q && p.g; }, 750, function (y) {
        if (!y) { ctx.fail = "g"; failRes(sc, ctx); done(T(FAILTXT.g[0], FAILTXT.g[1]), "wait"); return; }
        if (probe(ctx).gNA) { ctx.gNA = true; done(T("الصفحة دي مفيهاش فلتر بالمحافظة", "This page has no governorate filter"), "wait"); } else done(null, "done");
      });
    } });
    plan.push({ t: T("بجمع النتايج…", "Collecting the results…"), cond: ok, wait: function (sc, done) {
      var last = null, same = 0;
      pollStep(sc, ctx, function () {
        if (sc.extResult) return true;
        var p = probe(ctx); if (!(p.page && p.q && p.g)) { same = 0; return false; }
        var res = readPage(p.d); if (!res.ok) return false;
        if (last && last.sig === res.sig) same++; else same = 0;
        last = res; return same >= 2;
      }, 700, function (y) {
        if (sc.extResult) { done(sc.extText || T("النتايج قدامك", "Results are ready"), "done"); return; }
        var res = y ? last : null;
        if (res && res.items.length) {
          fillResults(sc, { items: res.items, count: res.count });
          var n = res.count != null ? res.count : res.visible;
          var txt = res.count != null ? T("لقيت " + arN(n), "Found " + n.toLocaleString("en-US") + (n === 1 ? " result" : " results")) : T("ظاهر " + arN(n) + " على الشاشة", n + " results on screen");
          srSay(txt + (res.items[0] ? T("، أولها: ", ", first: ") + res.items[0].title : ""));
          done(txt, "done");
        } else if (res && res.count === 0) { fillResults(sc, { items: [], count: 0 }); done(T("مفيش نتايج مطابقة", "No matching results"), "done"); }
        else if (res) { fillResults(sc, { items: [], count: null }); done(T("النتايج ظاهرة على الشاشة", "The results are on the screen"), "done"); }
        else { failRes(sc, ctx); done(T("مستني الصفحة تعرض النتايج", "Waiting for the page to show the results"), "wait"); }
      });
    } });
    return plan;
  }
  /* page opened (navigate): verified the same way */
  function openPlan(ctx, P, name) {
    return [P(T("بفتح " + name, "Opening " + name), 800), { t: T("بحمّل الصفحة", "Loading the page"), wait: function (sc, done) {
      pollStep(sc, ctx, function () { return probe(ctx).page; }, 900, function (y) { done(y ? T("الصفحة قدامك دلوقتي", "The page is in front of you") : T(FAILTXT.page[0], FAILTXT.page[1]), y ? "done" : "wait"); });
    } }];
  }
  /* sent/notify: wait for a real confirmation */
  function confirmStep(sp) {
    return { t: T("مستني تأكيد الإرسال…", "Waiting for confirmation…"), wait: function (sc, done) {
      sc.confIdx = sc.steps.length - 1;
      var t1 = now(), okT = sp.okText || ["اتبعت", "Sent"], id = si(sc, function () {
        if (sp.ok) { clearInterval(id); mainAct(sc, "sent"); done(T(okT[0], okT[1]), "done"); }
        else if (sp.bad) { clearInterval(id); mainAct(sc, "fail"); done(T("مااتبعتش" + (sp.bad.length > 1 ? ": " + sp.bad : ""), "Not sent" + (sp.bad.length > 1 ? ": " + sp.bad : "")), "fail"); }
        else if (now() - t1 > (sc.hurryAt ? 500 : 4500)) { clearInterval(id); mainAct(sc, "pending"); done(T("مستني تأكيد الإرسال", "Awaiting confirmation"), "wait"); }
      }, 200);
    } };
  }
  function onConfirm(sp) {
    sp.ok = true; sp.bad = "";
    var sc = S.sc, okT = sp.okText || ["اتبعت", "Sent"];
    if (sc && !sc.dead && sc.spec === sp && sc.confIdx != null && sc.steps[sc.confIdx] && sc.steps[sc.confIdx].s === "wait") { setStep(sc, sc.confIdx, "done", T(okT[0], okT[1])); mainAct(sc, "sent"); srSay(T(okT[0], okT[1])); }
  }
  /* the platform answered with an error (or not at all): the scene says so — never "sent" */
  function onFail(sp, why) {
    if (sp.ok) return; sp.bad = String(why || "-").slice(0, 90);
    var sc = S.sc;
    if (sc && !sc.dead && sc.spec === sp && sc.confIdx != null && sc.steps[sc.confIdx] && sc.steps[sc.confIdx].s === "wait") { setStep(sc, sc.confIdx, "fail", T("مااتبعتش", "Not sent")); mainAct(sc, "fail"); srSay(T("مااتبعتش", "Not sent")); }
  }
  /* janna_submit_form: confirmed ONLY by the platform's answer with a reference number — "mig:inquiry" {ok, ref, routed} from data/mig-forms.js
     on the page or in the live screen (the engines also confirm with "mig:agent-action" {tool, ok:true} after such an answer). The form's
     own submit event proves nothing (the request can still fail on the server), so it is not used. */
  function watchSubmit(sp) {
    var wins = [W], fr = liveFrame(), t0 = now();
    if (fr) { try { if (fr.contentWindow && fr.contentWindow !== W) wins.push(fr.contentWindow); } catch (e) {} }
    function h(e) {
      var x = (e && e.detail) || {};
      if (x.ok && x.ref) { sp.ref = String(x.ref); onConfirm(sp); off(); }
      else if (x.ok === false) { onFail(sp, x.code === "offline" ? T("سيرفر المنصة مش متاح", "the platform's server is not reachable") : x.error || x.code || ""); off(); }
    }
    function off() { for (var j = 0; j < wins.length; j++) { try { wins[j].removeEventListener("mig:inquiry", h); } catch (e) {} } }
    for (var i = 0; i < wins.length; i++) { try { wins[i].addEventListener("mig:inquiry", h); } catch (e) {} }
    setTimeout(function () { off(); if (!sp.ok && !sp.bad && now() - t0 > 29000) onFail(sp, T("مفيش رد من المنصة", "no answer from the platform")); }, 30000);
  }

  function runPlan(sc) {
    var plan = sc.plan, i = 0;
    sc.planLen = plan.length + (sc.preSteps ? sc.preSteps.length : 0);
    prog(sc);
    function next() {
      if (sc.dead) return;
      while (i < plan.length && plan[i].cond && !plan[i].cond()) i++;
      if (i >= plan.length) { sc.planLen = sc.steps.length; sc.planDone = true; maybeFinish(sc); return; }
      var it = plan[i++], idx = addStep(sc, it.t, "doing");
      if (it.fn) it.fn(sc, idx);
      if (it.wait) it.wait(sc, function (txt, state) { if (sc.dead) return; setStep(sc, idx, state || "done", txt); next(); });
      else {
        var fin = function () { setStep(sc, idx, it.st || "done", it.t2); if (it.fn2) it.fn2(sc); next(); };
        sc.cur = { id: st(sc, function () { sc.cur = null; fin(); }, sc.hurryAt ? 150 : it.ms || 900), fin: fin };
      }
    }
    next();
  }
  function maybeFinish(sc) {
    if (sc.dead || sc.done || !sc.planDone) return;
    for (var i = 0; i < sc.steps.length; i++) if (sc.steps[i].s === "doing") { if (!sc.extGuard) sc.extGuard = st(sc, function () { forceDone(sc); }, 15000); return; }
    sc.done = true; prog(sc);
    if (sc.taskEl) sc.taskEl.classList.add("mgh-done");
    var last = sc.steps.length ? sc.steps[sc.steps.length - 1].t : "";
    srSay(T("خلصت: ", "Done: ") + sc.title + (last ? " — " + last : ""));
    S.state = "holding";
    var hold = S.q.length ? 400 : sc.hasItems ? 9000 : sc.main && /^(mail|guide|pipe|cal|form)$/.test(sc.main.type) ? 6500 : 4200;
    sc.holdMs = hold; armHold(sc, hold);
  }
  function forceDone(sc) { for (var i = 0; i < sc.steps.length; i++) if (sc.steps[i].s === "doing") setStep(sc, i, "done"); maybeFinish(sc); }
  function armHold(sc, ms) {
    clearTimeout(S.holdT);
    S.holdT = setTimeout(function () {
      if (S.sc !== sc || sc.dead) return;
      if (sc.hover && !S.q.length) { armHold(sc, 1500); return; }
      var nx = S.q.shift(); S.q = [];
      if (nx && now() - nx._t < 8000) { begin(nx); return; }
      S.sc = null; collapse(sc, function () {}); gt(function () { if (!S.sc) closeLaptop(); }, 450);
    }, ms);
  }

  /* ---------- begin / queue ---------- */
  var waiting = [];
  function begin(spec) {
    if (!D.body) { waiting.push(spec); return; }
    var sc = newScene(spec), old = S.sc;
    clearTimeout(S.holdT);
    S.sc = sc;
    if (spec.preSteps) sc.preSteps = spec.preSteps;
    if (!S.root || S.state === "idle" || S.state === "closing") {
      if (S.root) S.root.classList.toggle("mgh-rm", RM());
      S.state = "opening";
      if (old) kill(old);
      if (!S.root) build(); else layout();
      openLaptop(function () { present(sc); });
    } else if (old) {
      S.state = "opening";
      collapse(old, function () { if (S.sc === sc) openLaptop(function () { present(sc); }); });
    } else { S.state = "opening"; openLaptop(function () { present(sc); }); }
    hoverWire();
  }
  /* newest wins: while a scene runs only the latest call waits, and the running scene is hurried */
  function enqueue(spec) {
    spec._t = now();
    if (!D.body) { waiting.push(spec); return; }
    if (!S.sc || S.state === "idle" || S.state === "closing" || S.state === "holding") { begin(spec); return; }
    if (spec.key && S.sc.key === spec.key) return; /* duplicate of what is running */
    S.q = [spec];
    hurry(S.sc);
  }
  function hoverWire() {
    var r = S.root; if (!r || r.__hw) return; r.__hw = 1;
    r.addEventListener("pointerover", function (e) { if (S.sc && e.target.closest && e.target.closest(".mgh-it,.mgh-x")) S.sc.hover = true; });
    r.addEventListener("pointerout", function (e) { if (S.sc && e.target.closest && e.target.closest(".mgh-it,.mgh-x")) S.sc.hover = false; });
    r.addEventListener("focusin", function () { if (S.sc) S.sc.hover = true; });
    r.addEventListener("focusout", function () { if (S.sc) S.sc.hover = false; });
  }

  /* ---------- tool → scene ---------- */
  function A(o) { if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { o = {}; } } return o && typeof o === "object" ? o : {}; }
  function fromTool(tool, args, opts) {
    var a = A(args), o = opts || {}, w = o.who === "bassem" || o.who === "janna" ? o.who : /^bassem_/.test(tool) ? "bassem" : defWho(), N = nm(w), sp = { who: w, tool: tool, anchor: o.anchor || null };
    var P = function (t, ms, extra) { var x = { t: t, ms: ms || 900 }; if (extra) for (var k in extra) x[k] = extra[k]; return x; };
    switch (tool) {
      case "janna_navigate": {
        var pg = PAGES[a.page] ? a.page : "home", name = pname(pg), extra = "", fr0 = liveFrame(), d00 = null;
        if (fr0) { try { d00 = fr0.contentDocument; } catch (e) {} }
        if (pg === "region" && a.governorate) extra = " · " + gov(a.governorate);
        if (pg === "register" && a.plan) extra = T(" · باقة ", " · ") + str(a.plan, 30) + (EN() ? " plan" : "");
        sp.kind = "navigate"; sp.title = T(N + " " + V(w, "بيفتحلك", "بتفتحلك") + ": " + name + extra, N + " is opening: " + name + extra);
        sp.main = { type: "page", name: name + extra, path: pg + ".html" };
        sp.plan = openPlan({ page: pg, live: !!fr0, doc0: d00 }, P, name);
        break;
      }
      case "janna_search":
      case "bassem_open_opportunity": {
        var opp = tool === "bassem_open_opportunity", sec = opp ? "advisor" : (SPEC[a.section] && a.section !== "advisor" ? a.section : "factories");
        var q = str(a.query, 50), g = opp ? "" : gov(a.governorate), mk = codeName(a.market, "markets", MK), kd = codeName(a.kind, "kinds", KD);
        var noun = opp ? T("فرص", "opportunities") : T(NOUN[sec][0], NOUN[sec][1]), tag = [mk, kd].filter(Boolean).join(" · ");
        var what = T(noun + (q ? " " + q : "") + (g ? " في " + g : "") + (tag ? " · " + tag : ""), (q ? "“" + q + "” " : "") + noun + (g ? " in " + g : "") + (tag ? " · " + tag : ""));
        sp.kind = "search"; sp.title = T(N + " " + V(w, "بيدوّر", "بتدوّر") + " دلوقتي: " + what, N + " is searching: " + what);
        sp.main = { type: "results" };
        /* snapshot of the live screen now: only a NEW document (after the engine navigates) can be this search's result */
        var fr = liveFrame(), d0 = null; if (fr) { try { d0 = fr.contentDocument; } catch (e) {} }
        var ctx = { page: sec, q: q, g: g ? str(a.governorate, 40) : "", code: govCode(a.governorate), gName: g, live: !!fr, doc0: d0 };
        sp.plan = searchPlan(ctx, opp ? T("بفتح رادار الفرص", "Opening the opportunity radar") : T("بفتح " + pname(sec), "Opening " + pname(sec)), P);
        break;
      }
      case "janna_fill_rfq":
      case "janna_fill_contact":
      case "janna_fill_registration": {
        var kind = tool.replace("janna_fill_", ""), rows = [], nmF;
        if (kind === "rfq") { nmF = T("طلب عرض سعر", "Request for quotation"); rows = [[T("المنتج", "Product"), a.product], [T("الكمية", "Quantity"), a.quantity], [T("المدينة", "City"), a.city]]; }
        else if (kind === "contact") { nmF = T("رسالة تواصل", "Contact message"); rows = [[T("الاسم", "Name"), a.name], [T("الموضوع", "Subject"), a.subject], [T("الرسالة", "Message"), a.message]]; }
        else { nmF = T("طلب التسجيل", "Registration form"); rows = [[T("المنشأة", "Company"), a.company_name], [T("المسؤول", "Manager"), a.manager], [T("المحافظة", "Governorate"), a.governorate ? gov(a.governorate) : ""], [T("النشاط", "Activity"), a.activity], [T("الباقة", "Plan"), a.plan]]; }
        rows = rows.filter(function (r2) { return str(r2[1]); }).slice(0, 4).map(function (r2) { return [r2[0], str(r2[1], 60)]; });
        if (!rows.length) rows = [[T("البيانات", "Details"), "…"]];
        sp.kind = "form"; sp.title = T(N + " " + V(w, "بيملالك", "بتملالك") + " " + nmF, N + " is filling your " + nmF.toLowerCase());
        sp.main = { type: "form", name: nmF, rows: rows };
        sp.plan = [P(T("بفتح النموذج", "Opening the form"), 800), P(T("بكتب البيانات اللي قلتها", "Typing what you told me"), 2200, { fn: function (sc) { mainAct(sc, "type"); } }), P(T("راجع البيانات قبل الإرسال", "Please review before sending"), 700)];
        break;
      }
      case "janna_submit_form": {
        var fn = a.form === "contact" ? T("رسالة التواصل", "the contact message") : a.form === "registration" ? T("طلب التسجيل", "the registration") : T("طلب عرض السعر", "the quote request");
        sp.kind = "submit"; sp.title = T(N + " " + V(w, "بيبعت", "بتبعت") + " " + fn, N + " is sending " + fn);
        sp.main = { type: "sent", line: T("إرسال " + fn, "Sending " + fn), sub: T("بعد موافقتك", "after your confirmation") };
        sp.plan = [P(T("بتأكد إن البيانات كاملة", "Checking the details are complete"), 900), P(T("بضغط إرسال", "Pressing send"), 900), confirmStep(sp)];
        watchSubmit(sp);
        break;
      }
      case "janna_follow": {
        var flw = str(a.label, 60) || T("اللي على الشاشة", "what is on the screen");
        sp.kind = "follow"; sp.okText = ["اتحفظت في «متابعاتي»", "Saved to “My follows”"];
        sp.title = T(N + " " + V(w, "بيضيفلك", "بتضيفلك") + " للمتابعة: " + flw, N + " is following for you: " + flw);
        sp.main = { type: "sent", line: T("متابعة: ", "Follow: ") + flw, sub: T("تنبيهات بالجديد على حسابك", "alerts on your account") };
        sp.plan = [P(T("بحدد اللي هتابعه", "Picking what to follow"), 800), P(T("بحفظه في «متابعاتي»", "Saving it to “My follows”"), 800), confirmStep(sp)];
        break;
      }
      case "janna_track": {
        var ref = str(String(a.ref || "").toUpperCase(), 24);
        sp.kind = "navigate"; sp.title = T(N + " " + V(w, "بيتابعلك", "بتتابعلك") + " الطلب" + (ref ? " " + ref : ""), N + " is tracking your request" + (ref ? " " + ref : ""));
        sp.main = { type: "page", name: T("تتبّع الطلب", "Request tracking") + (ref ? " · " + ref : ""), path: "track.html" };
        var frT = liveFrame(), dT = null; if (frT) { try { dT = frT.contentDocument; } catch (e) {} }
        sp.plan = [P(T("بفتح صفحة التتبّع", "Opening the tracking page"), 800), { t: T("بكتب رقم الطلب" + (ref ? " " + ref : ""), "Typing the request number" + (ref ? " " + ref : "")), wait: function (sc, done) {
          var ctx = { page: "track", live: !!frT, doc0: dT };
          pollStep(sc, ctx, function () { var p = probe(ctx), tn = null; if (!p.page) return false; try { tn = p.d.querySelector("#tn"); } catch (e) {} return !ref || !!(tn && String(tn.value || "").toUpperCase() === ref); }, 900, function (y) { done(y ? T("حالة الطلب قدامك على الشاشة", "The request's status is on your screen") : T(FAILTXT.page[0], FAILTXT.page[1]), y ? "done" : "wait"); });
        } }];
        break;
      }
      case "janna_start_meeting": {
        sp.kind = "meeting"; sp.title = T(N + " " + V(w, "بيبدأ", "بتبدأ") + " الاجتماع التعريفي", N + " is starting the introductory meeting");
        sp.main = { type: "cal", name: T("اجتماع تعريفي", "Introductory meeting"), line: str(a.name, 40) || T("أهلاً بيك", "Welcome"), sub: str(a.company, 40), date: "LIVE" };
        sp.plan = [P(T("بجهّز جدول الأعمال", "Preparing the agenda"), 900)];
        if (a.recording_consent === true || a.recording_consent === "true") sp.plan.push(P(T("بشغّل التسجيل بعد موافقتك", "Starting the recording (you agreed)"), 800));
        sp.plan.push(P(T("الاجتماع بدأ", "The meeting has started"), 600));
        break;
      }
      case "janna_book_meeting":
        a = { date: "", time: str(a.preferred_time, 20), topic: a.topic || T("اجتماع أونلاين مع فريق التسجيل", "Online meeting with the registration team") };
        /* falls through */
      case "janna_schedule_meeting": {
        sp.kind = "meeting"; sp.title = T(N + " " + V(w, "بيحجزلك", "بتحجزلك") + " ميعاد اجتماع", N + " is booking your meeting");
        sp.main = { type: "cal", name: T("حجز اجتماع", "Meeting booking"), date: str(a.date, 12), time: str(a.time, 8), line: str(a.topic, 60) || T("اجتماع أونلاين", "Online meeting"), sub: T("بتوقيت القاهرة", "Cairo time") };
        sp.plan = [P(T("بشوف المواعيد", "Checking the calendar"), 900), P(T("بحجز " + [str(a.date, 12), str(a.time, 8)].filter(Boolean).join(" "), "Booking " + [str(a.date, 12), str(a.time, 8)].filter(Boolean).join(" ")), 900), P(T("بجهّز تأكيد الحجز", "Preparing the confirmation"), 700)];
        break;
      }
      case "bassem_start_deal": {
        sp.kind = "deal"; sp.title = T(N + " " + V(w, "بيبدأ", "بتبدأ") + " صفقة جديدة" + (a.query ? ": " + str(a.query, 50) : ""), N + " is starting a new deal" + (a.query ? ": " + str(a.query, 50) : ""));
        sp.main = { type: "pipe", name: str(a.query, 50) || T("صفقة جديدة", "New deal"), stage: "discover", next: str(a.next_action, 70), due: str(a.due_date, 20) };
        sp.plan = [P(T("بفتح الفرصة", "Opening the opportunity"), 850), P(T("بسجّل الصفقة في خط المبيعات", "Adding the deal to your pipeline"), 900, { fn: function (sc) { mainAct(sc, "stage"); } })];
        if (a.next_action) sp.plan.push(P(T("الخطوة الجاية: " + str(a.next_action, 50), "Next step: " + str(a.next_action, 50)), 700));
        break;
      }
      case "bassem_update_deal": {
        var sn = ""; for (var s2 = 0; s2 < STG.length; s2++) if (STG[s2][0] === a.stage) sn = T(STG[s2][1], STG[s2][2]);
        if (a.stage === "won") sn = T("تمّت بنجاح", "Won"); if (a.stage === "lost") sn = T("لم تكتمل", "Lost");
        sp.kind = "deal"; sp.title = T(N + " " + V(w, "بيحدّث", "بتحدّث") + " الصفقة" + (sn ? ": " + sn : ""), N + " is updating the deal" + (sn ? ": " + sn : ""));
        sp.main = { type: "pipe", name: str(a.query || a.title, 50), stage: str(a.stage, 20), next: str(a.next_action, 70), due: str(a.due_date, 20) };
        sp.plan = [P(T("بفتح الصفقة", "Opening the deal"), 800)];
        sp.plan.push(P(sn ? T("بنقلها لمرحلة: " + sn, "Moving it to: " + sn) : T("بحدّث البيانات", "Updating the details"), 1000, { fn: function (sc) { mainAct(sc, "stage"); } }));
        if (a.next_action) sp.plan.push(P(T("الخطوة الجاية: " + str(a.next_action, 50), "Next step: " + str(a.next_action, 50)), 700));
        else sp.plan.push(P(T("المرحلة ظاهرة في خط الصفقة", "The stage is shown in the pipeline"), 500));
        break;
      }
      case "bassem_draft_email": {
        /* the e-mail's own language (zh, fr … too — holo4 CHANGES §4-B item 4), not only AR / EN */
        var lg = /^[a-z]{2}\b/i.test(String(a.language || "")) ? String(a.language).slice(0, 2).toUpperCase() : "";
        sp.kind = "email"; sp.title = T(N + " " + V(w, "بيكتبلك", "بتكتبلك") + " إيميل" + (a.subject ? ": " + str(a.subject, 50) : ""), N + " is drafting an e-mail" + (a.subject ? ": " + str(a.subject, 50) : ""));
        /* a recipient is shown only when it is one of the open deal's own addresses (data/janna-live.js knownEmail); anything else —
           an invented one like «sales@supplier-example.com» or a plausible-looking guess like «sales@baosteel.com» — is not */
        var knownTo = false; try { knownTo = !!(W.JANNA_LIVE && W.JANNA_LIVE.knownEmail && W.JANNA_LIVE.knownEmail(a.to)); } catch (e) {}
        sp.main = { type: "mail", to: knownTo ? str(a.to, 50) : T("المستلم: هيتحدد لما نختار الجهة", "Recipient: set once we choose the buyer"), subject: str(a.subject, 90), body: str(a.body, 200), lang: lg };
        sp.plan = [P(T("بختار الصيغة المناسبة", "Choosing the right wording"), 800), P(T("بكتب الموضوع ونص الرسالة", "Writing the subject and body"), 2600, { fn: function (sc) { mainAct(sc, "type"); } }), P(T("المسودة جاهزة لمراجعتك", "Draft ready for your review"), 600)];
        break;
      }
      case "bassem_send_email": {
        /* the call's draft and the deal room both go out FROM THE PLATFORM (data/janna-live.js mailTool): «اتبعت» only on its confirmation
           ("mig:agent-action" ok), «مااتبعتش» on its refusal ("mig:tool-outcome" failed / refused, failTool) */
        sp.kind = "send"; sp.title = T(N + " " + V(w, "بيبعت", "بتبعت") + " الإيميل", N + " is sending the e-mail");
        sp.main = { type: "sent", line: T("إرسال الإيميل", "Sending the e-mail"), sub: str(a.to || a.subject, 50) };
        sp.plan = [P(T("براجع المسودة", "Reviewing the draft"), 800), P(T("ببعت", "Sending"), 900), confirmStep(sp)];
        break;
      }
      case "bassem_open_guide": {
        var tp = str(a.topic, 60), gd = guideFor(tp);
        sp.kind = "guide"; sp.title = T(N + " " + V(w, "بيفتح", "بتفتح") + " دليل التعاقد" + (gd.name ? ": " + gd.name : tp ? ": " + tp : ""), N + " is opening the contracting guide" + (gd.name ? ": " + gd.name : tp ? ": " + tp : ""));
        sp.main = { type: "guide", name: gd.name || tp || T("خطوات التعاقد", "Contracting steps"), list: gd.list, real: gd.real };
        sp.plan = [P(T("بفتح الدليل", "Opening the guide"), 800), P(T("بجهّز الخطوات بالترتيب", "Putting the steps in order"), 1300, { fn: function (sc) { mainAct(sc, "guide"); } }), P(T("الدليل قدامك", "The guide is in front of you"), 600)];
        break;
      }
      case "bassem_notify_member": {
        var chn = String(a.channel || "").toLowerCase(), ch = [];
        if (/whats|wa|both|all/.test(chn) || !chn) ch.push([T("واتساب", "WhatsApp")]);
        if (/mail|both|all/.test(chn) || !chn) ch.push([T("الإيميل", "E-mail")]);
        sp.kind = "notify"; sp.title = T(N + " " + V(w, "بيبعتلك", "بتبعتلك") + " تنبيه", N + " is sending you an alert");
        sp.main = { type: "notify", ch: ch, msg: str(a.message, 110) };
        sp.plan = [P(T("بكتب الرسالة", "Writing the message"), 800)];
        for (var c2 = 0; c2 < ch.length; c2++) sp.plan.push(P(T("ببعت على " + ch[c2][0], "Sending via " + ch[c2][0]), 800));
        sp.plan.push(confirmStep(sp));
        break;
      }
      /* data/bassem-live-tools.js: Bassem opens ONE item on the shared screen; its real key facts arrive with MIGHOLO.result */
      case "bassem_open_item": {
        var isec = { tenders: ["مناقصة", "tender"], rfqs: ["طلب عرض سعر", "RFQ"], factories: ["مصنع", "factory"], suppliers: ["مورد", "supplier"], products: ["منتج", "product"], projects: ["مشروع", "project"], winners: ["ترسية", "award"], intel: ["فرصة من مركز المعلومات", "Information Center item"] }[String(a.section || "")] || ["بند", "item"];
        var iwhat = str(a.title, 60) || str(a.ref, 40) || (a.index ? T("رقم " + a.index, "no. " + a.index) : "");
        sp.kind = "search"; sp.title = T(N + " " + V(w, "بيفتحلك", "بتفتحلك") + " " + isec[0] + (iwhat ? ": " + iwhat : ""), N + " is opening the " + isec[1] + (iwhat ? ": " + iwhat : ""));
        sp.main = { type: "results" };
        /* what he points at, per section (QA L2) */
        var istep = { rfqs: ["بعلّملك على المطلوب والكمية ومكان التسليم والموعد", "Pointing at the request, quantity, delivery place and deadline"], factories: ["بعلّملك على النشاط والمكان والمنتجات وطلب عرض السعر", "Pointing at the activity, location, products and the quote button"],
          suppliers: ["بعلّملك على النشاط والمكان والمنتجات وطلب عرض السعر", "Pointing at the activity, location, products and the quote button"], products: ["بعلّملك على المنتج والمصنع وطلب عرض السعر", "Pointing at the product, its maker and the quote button"],
          projects: ["بعلّملك على المالك والمقاول والقيمة والمرحلة", "Pointing at the owner, contractor, value and stage"], winners: ["بعلّملك على الفايز والجهة والقيمة والتاريخ", "Pointing at the winner, entity, value and date"],
          intel: ["بعلّملك على المطلوب والجهة والبلد وآخر ميعاد والقيمة", "Pointing at what is requested, the buyer, country, deadline and value"] }[String(a.section || "")] || ["بعلّملك على الجهة والمبلغ والموعد والمستندات", "Pointing at the entity, amount, deadline and documents"];
        sp.plan = [P(T("بفتح الصفحة على الشاشة", "Opening the page on the screen"), 900), P(T("بدوّر على البند", "Finding the item"), 1000), P(T(istep[0], istep[1]), 1600)];
        break;
      }
      /* data/bassem-live-tools.js: scrolling / pointing on the screen is shown by its own pointer, not as a new hologram scene */
      case "bassem_screen": { sp.skip = true; break; }
      case "bassem_intel": {
        var iq = str(a.query, 40), imk = codeName(a.market, "markets", MK), iact = String(a.action || "").toLowerCase();
        /* one result: its details (the screen opens its page) / its own official document (worker-intel src/doc.js) */
        if (/^(?:item|details?|open|get)$/.test(iact)) {
          sp.kind = "search"; sp.title = T(N + " " + V(w, "بيفتحلك", "بتفتحلك") + " تفاصيل الفرصة من مركز المعلومات", N + " is opening the item's details from the Information Center");
          sp.plan = [P(T("بجيب الفرصة من مركز المعلومات", "Fetching the item"), 800), P(T("بفتح صفحتها على الشاشة", "Opening its page on the screen"), 1000), P(T("الجهة والبلد وآخر ميعاد والقيمة والمطلوب", "Buyer, country, deadline, value and what is requested"), 900)];
          break;
        }
        if (/^(?:doc|document|pdf|read|requirements)$/.test(iact)) {
          sp.kind = "search"; sp.title = T(N + " " + V(w, "بيقرالك", "بتقرالك") + " المستند الرسمي للفرصة", N + " is reading the item's official document");
          sp.plan = [P(T("بفتح المستند الرسمي من موقع الجهة", "Opening the official document on the buyer's site"), 1200), P(T("بقرا الشروط والمستندات والتأمين والميعاد", "Reading the requirements, documents, bid bond and deadline"), 2200), P(T("بقولك اللي مكتوب فيه بس", "Telling you only what it says"), 800)];
          break;
        }
        sp.kind = "search"; sp.title = a.action === "search" ? T(N + " بيدوّر في المصادر الرسمية: " + (iq || "فرص لقطاعك") + (imk ? " · " + imk : ""), N + " is searching official sources: " + (iq || "opportunities for your sector") + (imk ? " · " + imk : ""))
          : T(N + " بيجهّزلك الجديد النهارده من المصادر الرسمية", N + " is preparing today's news from official sources");
        sp.plan = [P(T("بفتح مركز المعلومات اليومي", "Opening the daily information center"), 900), P(T("بدوّر في المناقصات وطلبات الأسعار والمشاريع", "Scanning tenders, RFQs and projects"), 1300), P(T("بفلتر على نطاق باقتك", "Filtering to your plan's markets"), 1000), P(T("النتيجة معايا — بقولهالك دلوقتي", "Got it — telling you now"), 600)];
        break;
      }
      case "bassem_web_search": {
        var WM = { eg: ["مصر", "Egypt"], sa: ["السعودية", "Saudi Arabia"], ae: ["الإمارات", "UAE"], kw: ["الكويت", "Kuwait"], qa: ["قطر", "Qatar"], om: ["عمان", "Oman"], bh: ["البحرين", "Bahrain"], jo: ["الأردن", "Jordan"], iq: ["العراق", "Iraq"], ly: ["ليبيا", "Libya"], sd: ["السودان", "Sudan"], ma: ["المغرب", "Morocco"], dz: ["الجزائر", "Algeria"], tn: ["تونس", "Tunisia"], ke: ["كينيا", "Kenya"], ng: ["نيجيريا", "Nigeria"], et: ["إثيوبيا", "Ethiopia"], za: ["جنوب أفريقيا", "South Africa"], cn: ["الصين", "China"], "in": ["الهند", "India"], tr: ["تركيا", "Turkey"], de: ["ألمانيا", "Germany"], it: ["إيطاليا", "Italy"], fr: ["فرنسا", "France"], es: ["إسبانيا", "Spain"], gb: ["بريطانيا", "UK"], us: ["أمريكا", "USA"], ru: ["روسيا", "Russia"], arab: ["الدول العربية", "Arab markets"] };
        var wq = str(a.query, 50), wk = str(a.market, 24).toLowerCase(), wm = WM[wk] ? T(WM[wk][0], WM[wk][1]) : codeName(a.market, "markets", MK); /* bassem_web_search market codes (worker/src/websearch.js) */
        sp.kind = "search"; sp.title = T(N + " بيدوّر في الإنترنت: " + (wq || "…") + (wm ? " · " + wm : ""), N + " is searching the web: " + (wq || "…") + (wm ? " · " + wm : ""));
        sp.main = { type: "results", hd: T("من الإنترنت", "From the web") };
        sp.plan = [P(T("بدوّر في مواقع على الإنترنت", "Searching websites"), 900), P(T("بشيل المكرر والمواقع اللي مش مناسبة", "Dropping duplicates and unsuitable sites"), 1100), P(T("دي نتايج من الإنترنت — لازم نتأكد من المصدر", "Web results — check each source"), 700)];
        break;
      }
      case "bassem_recall": {
        var rq = str(a.query, 50);
        sp.kind = "search"; sp.title = T(N + " بيفتكر اللي عملناه قبل كده" + (rq ? ": " + rq : ""), N + " is recalling our earlier work" + (rq ? ": " + rq : ""));
        sp.main = { type: "results", hd: T("من الذاكرة", "From memory") };
        sp.plan = [P(T("بفتح ذاكرة مكالماتنا وبحثنا", "Opening our calls and searches"), 800), P(T("بدوّر على اللي يخص سؤالك", "Looking for what matches"), 900)];
        break;
      }
      default: {
        sp.kind = "generic"; sp.title = T(N + " " + V(w, "بيشتغل", "بتشتغل") + " على طلبك", N + " is working on your request");
        sp.plan = [P(T("بفهم المطلوب", "Understanding the request"), 900), P(T("بنفّذ", "Working on it"), 1100), P(T("خلصت", "Done"), 500)];
      }
    }
    if (o.title) sp.title = String(o.title);
    sp.key = tool + "|" + safeJson(a);
    return sp;
  }
  function safeJson(a) { try { return JSON.stringify(a); } catch (e) { return ""; } }
  /* real contracting steps from data/advisor-guides.js when loaded (never invented) */
  function guideFor(topic) {
    var G = W.ADVISOR_GUIDES, L = EN() ? "en" : "ar", out = { name: "", list: [], real: false };
    var t = String(topic || "").toLowerCase();
    if (G) {
      var pools = [G.markets || {}, G.kinds || {}, G.portals || {}], hit = null;
      for (var p = 0; p < pools.length && !hit; p++) for (var k in pools[p]) {
        var o = pools[p][k]; if (!o) continue;
        var names = [k, o.name_ar, o.name_en].join(" ").toLowerCase();
        if (t && (k.toLowerCase() === t || names.indexOf(t) >= 0 || (t.length > 3 && t.indexOf(String(o.name_ar || "").toLowerCase()) >= 0))) { hit = o; break; }
      }
      if (hit && hit.steps && hit.steps.length) {
        out.name = EN() ? hit.name_en || "" : hit.name_ar || "";
        for (var i = 0; i < hit.steps.length && out.list.length < 4; i++) { var s = hit.steps[i]; out.list.push(str(typeof s === "string" ? s : s[L] || s.ar || s.en, 92)); }
        out.real = true; return out;
      }
    }
    out.list = [T("بفتح الدليل الخاص بالموضوع", "Opening the guide for this topic"), T("الخطوات بالترتيب ظاهرة على الشاشة", "The ordered steps are on the screen"), T("اسألني عن أي خطوة", "Ask me about any step")];
    return out;
  }

  /* ---------- public API ---------- */
  function lastWaiting() { return waiting.length ? waiting[waiting.length - 1] : null; }
  function confirmTool(tool) {
    if (S.sc && S.sc.spec && (!tool || S.sc.tool === tool)) onConfirm(S.sc.spec);
    for (var i = 0; i < S.q.length; i++) if (!tool || S.q[i].tool === tool) S.q[i].ok = true;
  }
  /* the platform said no (or did not answer): the running / queued scene of that tool ends «مااتبعتش» — never «اتبعت» */
  function failTool(tool, why) {
    if (!tool) return;
    if (S.sc && S.sc.spec && S.sc.tool === tool) onFail(S.sc.spec, why);
    for (var i = 0; i < S.q.length; i++) if (S.q[i].tool === tool && !S.q[i].ok) S.q[i].bad = String(why || "-").slice(0, 90);
  }
  function restoreFocus() {
    var t = S.prevFocus; S.prevFocus = null;
    try {
      if (t && t.isConnected !== false && D.documentElement.contains(t) && vis(t)) { t.focus(); return; }
      var c = [".bs-mini", ".jn-mini", ".bs-fig button", ".jn-fig button"];
      for (var i = 0; i < c.length; i++) { var e = D.querySelector(c[i]); if (e && vis(e)) { e.focus(); return; } }
      if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    } catch (e) {}
  }
  var api = {
    __v: 2, badges: 1, /* show/result take {badge} (the results header), result takes {tool} (its own scene); bassem_web_search / bassem_recall scenes */
    act: function (tool, args, opts) {
      try {
        tool = String(tool || "");
        var sp = fromTool(tool, args, opts), t = now();
        if (sp.skip) return;
        if (sp.key === S.lastKey && t - S.lastT < 2000) return; /* same tool call reported twice (widget + engine) */
        S.lastKey = sp.key; S.lastT = t;
        enqueue(sp);
      } catch (e) { if (W.console && console.warn) console.warn("MIGHOLO.act", e); }
    },
    show: function (o) {
      try {
        o = o || {};
        var w = o.who === "bassem" || o.who === "janna" ? o.who : defWho(), mainT = null;
        var k = String(o.kind || "");
        if (o.items || o.count != null || k === "search" || k === "results") mainT = { type: "results", hd: o.badge ? str(o.badge, 24) : "" };
        var sp = { who: w, tool: "show", kind: k || "custom", title: o.title ? str(o.title, 160) : T(nm(w) + " " + V(w, "بيشتغل", "بتشتغل") + " على طلبك", nm(w) + " is working on your request"), anchor: o.anchor || null, main: mainT, plan: [], items: o.items || null, count: o.count };
        var pre = [], steps = o.steps || [];
        for (var i = 0; i < steps.length; i++) { var s = steps[i]; if (typeof s === "string") pre.push({ t: str(s, 140), s: i === steps.length - 1 && !o.done ? "doing" : "done" }); else if (s && s.text) pre.push({ t: str(s.text, 140), s: s.state === "done" || s.state === "fail" || s.state === "doing" ? s.state : "done" }); }
        sp.preSteps = pre;
        sp._t = now();
        begin(sp);
      } catch (e) { if (W.console && console.warn) console.warn("MIGHOLO.show", e); }
    },
    step: function (text, state) {
      try {
        text = str(text, 140); if (!text) return;
        state = state === "done" || state === "fail" || state === "doing" ? state : null;
        var sc = S.sc, lw = lastWaiting();
        /* before the page is ready: attach to the scene that is waiting instead of starting another one */
        if ((!D.body || !sc) && lw) { (lw.preSteps = lw.preSteps || []).push({ t: text, s: state || "doing" }); if (lw.plan) lw.planLen = (lw.planLen || 0) + 1; return; }
        if (!sc || sc.dead || S.state === "closing") { api.show({ steps: [{ text: text, state: state || "doing" }] }); return; }
        /* an engine reporting the send succeeded confirms the pending "sent" */
        if (state === "done" && sc.confIdx != null && /^(اتبعت|اتبعتت|تم الإرسال|تم الارسال|sent|delivered)/i.test(text)) { onConfirm(sc.spec); return; }
        if (!sc.stepsEl) { (sc.preSteps = sc.preSteps || []).push({ t: text, s: state || "doing" }); return; }
        for (var i = sc.steps.length - 1; i >= 0; i--) if (sc.steps[i].t === text) { setStep(sc, i, state || "done"); after(sc); return; }
        addStep(sc, text, state || "doing"); after(sc);
      } catch (e) {}
      function after(sc2) { if (sc2.done) { sc2.done = false; S.state = "working"; if (sc2.taskEl) sc2.taskEl.classList.remove("mgh-done"); clearTimeout(S.holdT); } clearTimeout(sc2.extGuard); sc2.extGuard = 0; maybeFinish(sc2); }
    },
    result: function (o) {
      try {
        o = o || {};
        var items = (o.items || []).map(function (x) { return { title: x && x.title, sub: x && x.sub, href: x && x.href }; }).filter(function (x) { return str(x.title); });
        var sc = S.sc, n = o.count != null ? +o.count : items.length, lw = lastWaiting();
        /* {tool}: the results belong to THAT tool's scene — the running one, else the one waiting in the queue, else a scene of their own; never another tool's scene */
        if (o.tool && sc && !sc.dead && S.state !== "closing" && sc.tool !== String(o.tool)) {
          var qd = S.q.concat(waiting);
          for (var qi = qd.length - 1; qi >= 0; qi--) if (qd[qi] && qd[qi].tool === String(o.tool)) { qd[qi].items = items; qd[qi].count = o.count; if (!qd[qi].main || qd[qi].main.type !== "results") qd[qi].main = { type: "results", hd: o.badge ? str(o.badge, 24) : "" }; return; }
          api.show({ items: items, count: o.count, steps: [], badge: o.badge, title: o.title, who: o.who }); return;
        }
        if ((!D.body || !sc) && lw) { lw.items = items; lw.count = o.count; if (!lw.main || lw.main.type !== "results") lw.main = { type: "results" }; return; }
        if (!sc || sc.dead || S.state === "closing") { api.show({ items: items, count: o.count, steps: [], badge: o.badge, title: o.title, who: o.who }); return; }
        sc.extResult = true;
        sc.extText = items.length || o.count != null ? T("لقيت " + arN(n), "Found " + n + " results") : T("النتايج ظاهرة على الشاشة", "The results are on the screen");
        if (!sc.stepsEl) { sc.items = items; sc.count = o.count; if (!sc.main || sc.main.type !== "results") sc.main = { type: "results" }; return; }
        fillResults(sc, { items: items, count: o.count });
        if (sc.done) armHold(sc, Math.max(sc.holdMs || 0, 9000));
      } catch (e) {}
    },
    close: function (byUser) {
      var hadFocus = false;
      try { hadFocus = !!(S.root && D.activeElement && S.root.contains(D.activeElement)); } catch (e) {}
      waiting = []; S.q = [];
      clearTimeout(S.holdT);
      var sc = S.sc; S.sc = null;
      if (hadFocus || byUser === true) restoreFocus();
      if (!S.root) { S.state = "idle"; return; }
      clearGT();
      collapse(sc, function () {});
      gt(function () { if (!S.sc) closeLaptop(); }, sc ? 380 : 0);
      S.state = "closing";
    },
    busy: function () { return S.state !== "idle" || waiting.length > 0; },
    /* re-measure now (data/bassem-live-tools.js: the video is back in view on a phone — review 2026-11-19 #19) */
    relayout: function () { try { relayout(); } catch (e) {} }
  };
  try {
    Object.defineProperty(api, "who", { enumerable: true, configurable: true, get: function () { return defWho(); }, set: function (v) { whoSet = v === "bassem" || v === "janna" ? v : null; } });
  } catch (e) { api.who = defWho(); }
  W.MIGHOLO = api;

  /* ---------- auto wiring ---------- */
  D.addEventListener("anam-agent:tool-call-started", function (e) {
    var d = e && e.detail || {}; if (d.toolType && d.toolType !== "client") return;
    var name = d.toolName || d.name; if (!name) return;
    var who = /^bassem_/.test(name) ? "bassem" : null;
    try { if (!who && liveEl() && W.JANNA_LIVE && typeof W.JANNA_LIVE.persona === "function") who = W.JANNA_LIVE.persona(); } catch (x) {}
    api.act(name, d.arguments || d.args || {}, { who: who });
  }, true);
  /* {tool, args, who} starts a scene; {tool, status:"done"|"sent"|"ok"} (or ok:true) confirms the running one (e.g. the e-mail really went out) */
  W.addEventListener("mig:agent-action", function (e) {
    var d = e && e.detail || {}, tool = d.tool || d.toolName;
    if (d.ok === true || /^(done|ok|sent|success|delivered|completed)$/i.test(String(d.status || d.phase || ""))) { confirmTool(tool); return; }
    if (tool) api.act(tool, d.args || d.arguments || {}, { who: d.who, anchor: d.anchor, title: d.title });
  });
  /* data/janna-live.js outcome(): a send the platform refused or did not do shows as such on the send scene. Some outcome texts are
     internal English notes ("address not confirmed", "no recipient" …): the Arabic scene says «مااتبعتش» alone then, never English */
  W.addEventListener("mig:tool-outcome", function (e) {
    var d = e && e.detail || {}, why;
    if (d.tool !== "bassem_send_email" || !/^(refused|failed)$/.test(String(d.outcome || ""))) return;
    why = String(d.text || "").replace(/^[⚠️⏳\s]+/, "").replace(/^(مااتبعتش|Not sent):\s*/, "");
    failTool(d.tool, EN() || /[\u0600-\u06ff]/.test(why) ? why : "");
  });
  /* Escape hides the hologram (not when the key belongs to an open dialog) */
  D.addEventListener("keydown", function (e) {
    if (!S.root || S.state === "closing" || (e.key !== "Escape" && e.key !== "Esc")) return;
    var t = e.target; if (t && t.closest && t.closest("dialog,[role=dialog],[aria-modal=true]") && !(S.root.contains(t))) return;
    api.close(true);
  }, true);
  var rsT = 0;
  W.addEventListener("resize", function () { if (!S.root) return; clearTimeout(rsT); rsT = setTimeout(relayout, 120); });
  function flush() { var w2 = waiting; waiting = []; for (var i = 0; i < w2.length; i++) enqueue(w2[i]); }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", flush); else setTimeout(flush, 0);
})();
