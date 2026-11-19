/* MIGPLANS — the plans matrix of the Admin Control Center is the single source of truth for prices, limits, markets and features on the
   site (ACC-CONTRACT §7.4). Loaded right after data/plan.js on every page (P-S1); reads window.MIGOVL_DATA.plans (data/overlay.js — no
   network call) and updates data/plan.js in place:
     MIGPLAN.PL[k].n / .en (names), .price (EGP before VAT), .products (−1 → Infinity), .markets (m_* switches), .gcc (gcc_pick: how many
     GCC states the member picks, 0 = all six), MIGPLAN.VAT = vat_bp / 10000;
     MIGPLAN.can(f): respond · incoming · stats · priority · bassem · alerts · listing · procurement → the matrix; advisor → bassem;
     products → products ≠ 0; intl → any market beyond Egypt; everything else → the original level check. A key the matrix does not carry
     (gcc_pick / procurement before the Control Center saved them) keeps the build's value (data/plan.js).
   data/janna.js and data/bot.js build every plan / price sentence from MIGPLAN at call time, so they follow without a patch.
   window.MIGPLANS: {data, price(k) "10,000", priceNum(k), vatRate() 0.14, vatLabel() "14%", products(k), markets(k), name(k), caps(k),
     patchCards(PLANS, PROFILE_ONLY) (register.html + home cards, before plansHTML()), patchLimits(LIM), sentence(lang, style), apply()}.
   On DOMContentLoaded: [data-mig-price="<plan>"] (formatted price), [data-mig-plan-name="<plan>"], [data-mig-limit="<plan>:products"],
   [data-mig-prices="legal|bot"] (the full sentence), [data-mig-vat] (the VAT % inside the element's text).
   window.MIGPAYREADY = pay.ready, window.MIGPAYMANUAL = pay.manual (payment sentences of register.html, data/janna.js, data/bot.js — P-S8/P-S9).
   No overlay (static preview, Worker off) → nothing changes: the build's literals stay. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window, P = W.MIGPLAN;
  if (!P || !P.PL || W.MIGPLANS) return;
  var KEYS = ["visitor", "profile", "basic", "premium", "partner", "strategic"], SELL = ["profile", "basic", "premium", "partner", "strategic"];
  var MKS = ["local", "gulf", "africa", "asia", "europe"], CAPF = { respond: 1, incoming: 1, stats: 1, priority: 1, bassem: 1, alerts: 1, listing: 1, procurement: 1 };
  /* the build's values (data/plan.js) — what the literals on the pages say today */
  var B = {}, VAT0 = typeof P.VAT === "number" ? P.VAT : 0.14;
  KEYS.forEach(function (k) { var o = P.PL[k] || {}; B[k] = { n: o.n, en: o.en, price: o.price || 0, products: o.products, markets: (o.markets || []).slice(), lv: o.lv, gcc: o.gcc || 0 }; });
  var D = null, CAPS = {};
  var EN = function () { return W.MIGLANG === "en"; };
  var HAS = Object.prototype.hasOwnProperty;
  function neutral(s) { return W.MIGOVL && MIGOVL.neutral ? MIGOVL.neutral(s, 1) : String(s == null ? "" : s).replace(/[<>"'`]/g, "").replace(/\s+/g, " ").trim(); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return Number(n || 0).toLocaleString("en-US"); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /* ---------- read the published matrix ---------- */
  function load(data) {
    var pl = data && data.plans, list = pl && pl.list;
    if (!list || typeof list !== "object") return false;
    KEYS.forEach(function (k) {
      var x = HAS.call(list, k) ? list[k] : null, o = P.PL[k]; if (!x || !o) return;
      var c = x.caps && typeof x.caps === "object" ? x.caps : {};
      CAPS[k] = c;
      if (x.name_ar) o.n = neutral(x.name_ar);
      if (x.name_en) o.en = neutral(x.name_en);
      if (k !== "visitor") {
        var pr = Math.round(num(x.price_egp, o.price)); if (pr >= 0) o.price = pr;
        if (HAS.call(c, "products")) { var n = Math.round(num(c.products, 0)); o.products = n < 0 ? Infinity : n; }
        var m = MKS.filter(function (mk) { return +c["m_" + mk] === 1; });
        if (m.length || MKS.some(function (mk) { return HAS.call(c, "m_" + mk); })) { o.markets.splice(0); m.forEach(function (mk) { o.markets.push(mk); }); }
        /* Premium = Egypt + N GCC states the member picks (0 = all six); only meaningful with the Gulf market */
        if (HAS.call(c, "gcc_pick")) { var g = Math.round(num(c.gcc_pick, 0)); o.gcc = g >= 0 && g <= 5 ? g : 0; }
        o.sellable = x.sellable == null ? 1 : +x.sellable ? 1 : 0;
        o.days = Math.round(num(x.duration_days, 365));
      }
    });
    var vb = num(pl.vat_bp, NaN); if (vb >= 0 && vb <= 5000) P.VAT = vb / 10000;
    /* English names of renamed plans */
    var tr = {}; KEYS.forEach(function (k) { var o = P.PL[k]; if (o.n !== B[k].n && o.en) tr[o.n] = o.en; });
    trFill(tr);
    return true;
  }
  function trFill(pairs) { if (W.MIGOVL && MIGOVL.trFill) MIGOVL.trFill(pairs); }
  function caps(k) { return HAS.call(CAPS, k) ? CAPS[k] : null; }
  function canCap(k, f) {
    var c = caps(k); if (!c || k === "visitor") return null;
    if (CAPF[f]) return HAS.call(c, f) ? !!+c[f] : null;
    if (f === "advisor") return HAS.call(c, "bassem") ? !!+c.bassem : null;
    if (f === "products") return HAS.call(c, "products") ? +c.products !== 0 : null;
    if (f === "intl") return P.PL[k].markets.some(function (m) { return m !== "local"; });
    return null;
  }
  /* MIGPLAN.can / needName follow the matrix (the server checks every action again) */
  function wrap() {
    var can0 = P.can, need0 = P.needName, nk0 = P.needKey;
    /* the plan a lock box preselects on /register/ (data/plan.js needKey): the matrix's lowest sellable plan that has the feature */
    if (nk0) P.needKey = function (f) {
      var first = null; SELL.forEach(function (k) { if (first || P.PL[k].sellable === 0) return; var r = canCap(k, f); if (r === null) r = (B[k].lv || 0) >= (P.FEAT[f] || 0); if (r) first = k; });
      return first || nk0.call(this, f);
    };
    P.can = function (f) {
      var k = W.MIGPLAN.key; if (k === "visitor") return can0.call(this, f);
      var r = canCap(k, f); return r === null ? can0.call(this, f) : r;
    };
    P.needName = function (f) {
      if (!D) return need0.call(this, f);
      /* the lowest plan that has it; today's wording when that is still the build's level */
      var first = null; SELL.forEach(function (k) { if (first) return; var r = canCap(k, f); if (r === null) r = (B[k].lv || 0) >= (P.FEAT[f] || 0); if (r) first = k; });
      if (!first || (B[first].lv || 0) === (P.FEAT[f] || 0) || ((P.FEAT[f] || 0) >= 4 && (B[first].lv || 0) >= 4)) return need0.call(this, f);
      var nm = P.name(first); return EN() ? "the «" + nm + "» plan or higher" : "«" + nm + "» فأعلى";
    };
  }

  /* ---------- texts ---------- */
  function vatPct() { return Math.round((typeof P.VAT === "number" ? P.VAT : VAT0) * 10000) / 100; }
  function vatLabel() { return vatPct() + "%"; }
  function nProd(n, en) {   /* «30 منتجاً» · «200 منتج» · «5 منتجات» · «منتجات غير محدودة» (Arabic agreement as on register.html) */
    if (n === Infinity || n < 0) return en ? "Unlimited products" : "منتجات غير محدودة";
    if (!n) return en ? "No products" : "بدون منتجات";
    if (en) return n + (n === 1 ? " product" : " products");
    var r = n % 100;
    return n === 1 ? "منتج واحد" : n === 2 ? "منتجين" : r >= 3 && r <= 10 ? n + " منتجات" : r === 0 || r === 1 || r === 2 ? n + " منتج" : n + " منتجاً";
  }
  function limText(k, en) { var n = P.PL[k] ? P.PL[k].products : 0; return n === Infinity ? (en ? "unlimited" : "غير محدودة") : String(n || 0); }
  var MK_CHIP = { local: "🇪🇬 مصر", gulf: "🌍 كل دول الخليج", africa: "🌍 أفريقيا", asia: "🌐 آسيا", europe: "🌍 أوروبا" };
  /* the Gulf chip of a plan: «🌍 3 دول خليجية تختارها» (a pick plan) or «🌍 كل دول الخليج» (all six) */
  function gulfChip(k) { var n = P.gccPickOf ? P.gccPickOf(k) : 0; return n ? "🌍 " + gChoose(n) : MK_CHIP.gulf; }
  function gccWords(n) { return P.gccCount ? P.gccCount(n, false) : n + " دول خليجية"; }
  function chips(k) {
    var m = P.PL[k].markets;
    if (m.indexOf("asia") > -1 && m.indexOf("europe") > -1) {   /* today's strategic card */
      return m.filter(function (x) { return x !== "asia" && x !== "europe"; }).map(function (x) { return x === "gulf" ? "🌍 الخليج" : MK_CHIP[x]; }).concat(["🌐 آسيا وأوروبا وكل الأسواق"]);
    }
    return m.map(function (x) { return x === "gulf" ? gulfChip(k) : MK_CHIP[x]; });
  }
  /* the cards say «3 دول خليجية» (the build's gcc_pick of Premium). Another number from the Control Center — or 0 = all six — rewrites
     each phrase with the right Arabic agreement («دولة خليجية واحدة تختارها» · «دولتين خليجيتين تختارهم» · «4 دول خليجية تختارها» ·
     «كل دول الخليج الست»; at 0 «باقي دول الخليج» and «اللي اخترتها» drop out), and on the English page the old text's translation gets the
     same change (review M-5). Runtime pairs need the same count of digits on both sides (MIGOVL.trFill), so the English says "six". */
  var RXG = /3 دول خليجية/g;
  function gChoose(n, en, who) {
    if (en) return !n ? "all six Gulf states" : (n === 1 ? "one Gulf state" : n === 2 ? "two Gulf states" : n + " Gulf states") + " of " + (who || "your") + " choice";
    return !n ? "كل دول الخليج الست" : n === 1 ? "دولة خليجية واحدة تختارها" : n === 2 ? "دولتين خليجيتين تختارهم" : n + " دول خليجية تختارها";
  }
  function gAtReg(n, en) {
    if (!n) return en ? "all six Gulf states" : "كل دول الخليج الست";
    if (en) return (n === 1 ? "one Gulf state" : n === 2 ? "two Gulf states" : n + " Gulf states") + " you choose at registration (from Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman)";
    return (n === 1 ? "دولة خليجية واحدة تختارها" : n === 2 ? "دولتين خليجيتين تختارهم" : n + " دول خليجية تختارها") + " وقت التسجيل (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)";
  }
  /* the card texts that carry Premium's GCC count, by their build text → (n) → [Arabic, English] */
  var GTXT = {
    "أخبار المشتريات و3 دول خليجية تختارها — في الباقة المميزة": function (n) { return ["أخبار المشتريات و" + gChoose(n) + " — في الباقة المميزة", "Procurement news and " + gChoose(n, true) + " — in the Premium plan"]; },
    "للمصانع المتوسطة اللي عايزة حضور أقوى في مصر و3 دول خليجية تختارها": function (n) { return ["للمصانع المتوسطة اللي عايزة حضور أقوى في مصر و" + gChoose(n), "For medium factories that want a stronger presence in Egypt and " + gChoose(n, true, "their")]; },
    "🌍 3 دول خليجية تختارها": function (n) { return ["🌍 " + (n ? gChoose(n) : "كل دول الخليج"), n ? gChoose(n, true) : "All Gulf states"]; },
    "المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في 3 دول خليجية تختارها وقت التسجيل (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)": function (n) { return ["المناقصات وطلبات الأسعار والشركات الفائزة وأخبار المشاريع في " + gAtReg(n), "Tenders, RFQs, winning companies and project news in " + gAtReg(n, true)]; },
    "باقي دول الخليج وأفريقيا والمستشار «باسم» — في باقة الشريك الأساسي": function (n) { return n ? null : ["أفريقيا والمستشار «باسم» — في باقة الشريك الأساسي", "Africa and the advisor «Bassem» — in the Core Partner plan"]; },
    "أولوية في الطلبات والظهور في مصر والدول الخليجية اللي اخترتها.": function (n) { return n === 1 ? ["أولوية في الطلبات والظهور في مصر والدولة الخليجية اللي اخترتها.", "Priority in requests and visibility in Egypt and the Gulf state you chose."] : n ? null : ["أولوية في الطلبات والظهور في مصر ودول الخليج.", "Priority in requests and visibility in Egypt and the Gulf states."]; }
  };
  var NUMG = /[0-9٠-٩][0-9٠-٩,.:%\/\-]*/g, cutG = function (t) { return String(t).replace(/^[^\u0600-\u06FF]*/, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); };
  function gccText(s, n) {
    s = String(s);
    var f = GTXT[s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "")];
    if (f) {
      var v = f(n); if (!v) return s;
      if (W.MIGLANG === "en") { var p0 = {}; p0[cutG(v[0])] = v[1]; trFill(p0); }
      return v[0];
    }
    /* a text this table does not know: the count words only (n = 0 → «كل دول الخليج الست») */
    RXG.lastIndex = 0; if (!RXG.test(s)) return s; RXG.lastIndex = 0;
    var out = s.replace(RXG, n ? gccWords(n) : "كل دول الخليج الست"); RXG.lastIndex = 0;
    if (W.MIGLANG === "en" && W.I18N_EN && P.gccCount) {
      /* the dictionary is keyed on the text without its leading emoji, numbers as {n}: the old English, the count words replaced,
         then the text's other numbers (if any) in their order */
      var core = cutG(s), e0 = W.I18N_EN[core.replace(NUMG, "{n}")];
      if (e0) {
        var rest = core.replace(RXG, "").match(NUMG) || [], i = 0, p = {}; RXG.lastIndex = 0;
        p[cutG(out)] = String(e0).replace(/\{n\} Gulf states/i, n ? P.gccCount(n, true) : "all six Gulf states").replace(/\{n\}/g, function () { return rest[i++] || ""; });
        trFill(p);
      }
    }
    return out;
  }
  /* /register/'s intro paragraph ([data-mig-gcc-intro]): its «ومعاها 3 دول خليجية تختارها» follows the matrix too (review M-5) */
  var INTRO_AR = "ومعاها 3 دول خليجية تختارها", INTRO_EN = "plus 3 Gulf states of your choice";
  function gccIntro(el, n) {
    var t = el.textContent || "", ar = "ومعاها " + gChoose(n), en = "plus " + gChoose(n, true);
    if (t.indexOf(INTRO_AR) > -1) {
      var nt = t.replace(INTRO_AR, ar);
      if (W.MIGLANG === "en" && W.I18N_EN) { var e0 = W.I18N_EN[cutG(t).replace(NUMG, "{n}")]; if (e0 && String(e0).indexOf("plus {n} Gulf states of your choice") > -1) { var p = {}; p[cutG(nt)] = String(e0).replace("plus {n} Gulf states of your choice", en); trFill(p); } }
      el.textContent = nt;
    } else if (t.indexOf(INTRO_EN) > -1) el.textContent = t.replace(INTRO_EN, en);
  }
  var RXP = /(حتى\s+)?\d[\d,]*\s*(منتجاً|منتجات|منتج)/;
  function bullet(s, n, en0) {
    if (!RXP.test(s)) return s;
    var out = s.replace(RXP, function (m0, upto) { return n === Infinity ? "منتجات غير محدودة" : (upto ? "حتى " : "") + nProd(n); });
    /* English: the old sentence's translation, numbers as {n} */
    if (out !== s && W.MIGLANG === "en" && W.I18N_EN) {
      var NUM = /[0-9٠-٩][0-9٠-٩,.:%\/\-]*/g, k0 = s.replace(/\s+/g, " ").trim().replace(NUM, "{n}"), e0 = W.I18N_EN[k0];
      if (e0) { var p = {}; p[out] = n === Infinity ? String(e0).replace(/up to \{n\} products?/i, "Unlimited products").replace(/\{n\} products?/i, "unlimited products") : String(e0).replace(/\{n\}/, String(n)); trFill(p); }
    }
    return out;
  }
  /* Premium's GCC count when the matrix differs from the build (3): a number, 0 = all six — null when nothing changed, or when Premium has no
     Gulf market at all (then the chips say it and the texts are the owner's to rewrite) */
  function gccNow() {
    var o = P.PL.premium; if (!o || !B.premium || !P.gccPickOf || o.markets.indexOf("gulf") < 0) return null;
    var n = P.gccPickOf("premium"); return n === (B.premium.gcc || 0) ? null : n;
  }
  /* register.html / home: the PLANS cards and the «profile only» row, mutated in place before plansHTML() */
  function patchCards(PL, PO) {
    if (!D) return;
    (PL || []).forEach(function (p) {
      var k = p && p[0], o = k && P.PL[k]; if (!o || !B[k]) return;
      p[2] = money(o.price);
      if (o.n !== B[k].n) p[1] = esc(o.n);
      if (o.products !== B[k].products) {
        p[5] = nProd(o.products);
        if (Array.isArray(p[7])) p[7] = p[7].map(function (s) { return bullet(String(s), o.products); });
      }
      if (o.markets.join() !== B[k].markets.join() || (o.gcc || 0) !== (B[k].gcc || 0)) p[4] = chips(k);
      /* the number of GCC states of the pick plan changed (0 = Premium covers all six): every «3 دول خليجية» on the cards (premium's
         texts, basic's locked line) */
      var gn = gccNow();
      if (gn !== null) [3, 7, 8, 9].forEach(function (i) { if (Array.isArray(p[i])) p[i] = p[i].map(function (x) { return gccText(x, gn); }); else if (typeof p[i] === "string") p[i] = gccText(p[i], gn); });
    });
    if (PO && P.PL.profile) { PO[2] = money(P.PL.profile.price); if (P.PL.profile.n !== B.profile.n) PO[1] = esc(P.PL.profile.n); }
  }
  function patchLimits(L) { if (!D || !L) return; SELL.forEach(function (k) { if (HAS.call(L, k) || P.PL[k]) L[k] = P.PL[k].products === Infinity ? Infinity : +P.PL[k].products || 0; }); }
  /* the full price sentences (today's literals, with the current names, prices and VAT) */
  var LEGAL_AR = { profile: "تسجيل بيانات فقط", basic: "الأساسية", premium: "المميزة", partner: "الشريك الأساسي", strategic: "الشريك الاستراتيجي" };
  var LEGAL_EN = { profile: "Data Registration Only", basic: "Basic", premium: "Premium", partner: "Core Partner", strategic: "Strategic Partner" };
  function shown() { return SELL.filter(function (k) { var o = P.PL[k]; return o && o.sellable !== 0 && o.price > 0; }); }
  function legalParts(en) {
    var ks = shown(), nm = function (k) { var o = P.PL[k]; return o.n === B[k].n ? (en ? LEGAL_EN[k] : LEGAL_AR[k]) : (en ? o.en || o.n : o.n); };
    if (en) {
      var items = ks.map(function (k) { return nm(k) + " (EGP " + money(P.PL[k].price) + ")"; });
      var list = items.length > 1 ? items.slice(0, -1).join(", ") + " and " + items[items.length - 1] : items.join("");
      return [list + " per year; prices exclude", "VAT (" + vatLabel() + ")"];
    }
    return [ks.map(function (k, i) { return (i ? "و" : "") + nm(k) + " (" + money(P.PL[k].price) + " جنيه)"; }).join("، ") + " سنوياً، والأسعار غير شاملة", "ضريبة القيمة المضافة (" + vatLabel() + ")"];
  }
  function sentence(lang, style) {
    var en = lang === "en";
    if (style === "legal") { var p = legalParts(en); return p[0] + " " + p[1]; }
    /* bot: data/bot.js PKG (the static fallback when MIGPLAN is missing), now with the prices of the matrix */
    var ks = shown(), list = ks.map(function (k) { return (en ? P.PL[k].en : P.PL[k].n) + " " + (en ? "EGP " + money(P.PL[k].price) : money(P.PL[k].price) + " جنيه"); });
    return en ? "We have yearly membership plans. «Company data only» is a directory profile only; tenders, RFQs, awards and project news start with the Basic plan, and each higher plan adds markets and features. The yearly prices: " + list.join(", ") + ", plus " + vatLabel() + " VAT; there is no free registration."
      : "عندنا باقات اشتراك سنوية. «تسجيل بيانات الشركة فقط» بروفايل في الدليل بس، والمناقصات وطلبات الأسعار والترسيات وأخبار المشاريع من الباقة الأساسية وطالع، وكل باقة أعلى بتزوّد أسواق ومزايا. الأسعار السنوية: " + list.join("، و") + " + ضريبة القيمة المضافة " + vatLabel() + "، ومفيش تسجيل مجاني.";
  }

  /* ---------- the page's marked elements ---------- */
  function each(sel, fn) { if (!W.document || !document.querySelectorAll) return; [].forEach.call(document.querySelectorAll(sel), function (el) { try { fn(el); } catch (e) { /* one element */ } }); }
  function apply() {
    if (!D) return;
    var en = EN(), V0 = Math.round(VAT0 * 10000) / 100 + "%";
    each("[data-mig-price]", function (el) { var k = el.getAttribute("data-mig-price"); if (P.PL[k] && P.PL[k].price > 0) el.textContent = money(P.PL[k].price); });
    var gi = gccNow(); if (gi !== null) each("[data-mig-gcc-intro]", function (el) { gccIntro(el, gi); });
    each("[data-mig-plan-name]", function (el) { var k = el.getAttribute("data-mig-plan-name"); if (P.PL[k] && P.PL[k].n !== B[k].n) el.textContent = en ? P.PL[k].en || P.PL[k].n : P.PL[k].n; });
    each("[data-mig-limit]", function (el) { var a = String(el.getAttribute("data-mig-limit")).split(":"); if (a[1] === "products" && P.PL[a[0]]) el.textContent = limText(a[0], en); });
    each("[data-mig-prices]", function (el) {
      var st = el.getAttribute("data-mig-prices");
      if (st === "legal") {
        var ar = legalParts(false), ep = legalParts(true), tr = {}; tr[ar[0]] = ep[0]; tr[ar[1]] = ep[1]; trFill(tr);
        el.innerHTML = esc(ar[0]) + " <b>" + esc(ar[1]) + "</b>";
      } else el.textContent = sentence(en ? "en" : "ar", st);
    });
    /* the VAT % written inside a text (register.html payment note): only the number changes, so its English stays keyed */
    if (vatLabel() !== V0) each("[data-mig-vat]", function (el) {
      var w = document.createTreeWalker(el, 4), n; while ((n = w.nextNode())) if (n.nodeValue.indexOf(V0) > -1) n.nodeValue = n.nodeValue.split(V0).join(vatLabel());
    });
  }

  W.MIGPLANS = {
    get data() { return D; },
    price: function (k) { return money(P.price(k)); }, priceNum: function (k) { return P.price(k); },
    vatRate: function () { return typeof P.VAT === "number" ? P.VAT : VAT0; }, vatLabel: vatLabel,
    products: function (k) { return P.PL[k] ? P.PL[k].products : 0; }, productsLabel: nProd, markets: function (k) { return P.PL[k] ? P.PL[k].markets.slice() : []; },
    name: function (k) { return P.name(k); }, caps: caps, sellable: shown,
    patchCards: patchCards, patchLimits: patchLimits, sentence: sentence, apply: apply
  };
  function start(data) {
    if (D || !data) return;
    if (data.pay && typeof data.pay === "object") { W.MIGPAYREADY = !!data.pay.ready; W.MIGPAYMANUAL = !!data.pay.manual; }
    if (!load(data)) return;
    D = data.plans;
    wrap();
    try { W.dispatchEvent(new CustomEvent("mig:plans", { detail: { v: data.v } })); } catch (e) { /* old browsers */ }
    if (W.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply(); }
  }
  if (W.MIGOVL && MIGOVL.onData) MIGOVL.onData(start); else start(W.MIGOVL_DATA);
})();
