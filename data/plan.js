/* Plan-based access — the owner's plan matrix (2026-11-18; prices annual EGP before VAT; the Control Center matrix, applied by
   data/plans-live.js, is the single source of truth):
     «تسجيل بيانات الشركة فقط» profile = the company's profile in the directory and in search results ONLY: no tenders, RFQs, awards,
       project or procurement news, no products, no incoming requests, no alerts (markets []).
     basic = Egypt: tenders, RFQs, winning companies (awards), project news · premium = Egypt + 3 GCC states the member chooses on the
       registration form (the server's user.gcc → MIGPLAN.gcc(); not chosen yet = all six for now, as before) + procurement news ·
     core partner = + all six GCC states + Africa + Bassem · strategic = all world markets + Bassem + all consulting services.
   The supplier / contractor / consultant / company directories are open to everyone (visitors too). Basic and above respond to tenders /
   RFQs, RECEIVE automatically routed requests and see their real stats; premium and above get priority in matching and listing.
   The plan comes from the server only (GET /api/me through data/mig-api.js). The cached copy ("mig-me", written by mig-api.js after a
   server answer) is a UI hint for the first paint; once /api/me answers, MIGPLAN.update() replaces it and a devtools-edited value cannot unlock
   anything (every gated action is also checked on the server). The legacy "mig-plan" key is honoured only for an advisor session the Worker
   issued from an activation link (sessionStorage "mig-adv-token", see advisor.part.py), never on its own. */
(function () {
  /* gcc = how many GCC states the member picks (Control Center key gcc_pick, data/plans-live.js; 0 = all six when the plan has the Gulf) */
  var PL = {
    visitor:  { lv: 0, n: "زائر", en: "Visitor", products: 0, markets: [], price: 0, gcc: 0 },
    profile:  { lv: 1, n: "تسجيل بيانات الشركة فقط", en: "Company data only", products: 0, markets: [], price: 4000, gcc: 0 },
    basic:    { lv: 2, n: "الباقة الأساسية", en: "Basic plan", products: 30, markets: ["local"], price: 10000, gcc: 0 },
    premium:  { lv: 3, n: "الباقة المميزة", en: "Premium plan", products: 80, markets: ["local", "gulf"], price: 25000, gcc: 3 },
    partner:  { lv: 4, n: "باقة الشريك الأساسي", en: "Core Partner plan", products: 200, markets: ["local", "gulf", "africa"], price: 50000, gcc: 0 },
    strategic:{ lv: 5, n: "باقة الشريك الاستراتيجي", en: "Strategic Partner plan", products: Infinity, markets: ["local", "gulf", "africa", "asia", "europe"], price: 100000, gcc: 0 }
  };
  /* price = the annual registration fee in EGP before VAT — the same figures register.html shows (register.part.py PLANS / PROFILE_ONLY);
     Janna (data/janna.js) quotes prices from here only. VAT on top: 14%. */
  var VAT = 0.14;
  /* plan-scope wording: «دول الخليج» (the 6 GCC states); the RFQ form and the export-market pages keep «الخليج والدول العربية» (owner Q1 / Q5) */
  var MKN = { local: ["مصر", "Egypt"], gulf: ["دول الخليج", "the Gulf states"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
  /* level needed: 1 = any plan (content, inside the plan's markets), 2 = basic+, 3 = premium+, 4 = partner / strategic */
  /* owner 2026-11-18 (11th message): «تسجيل بيانات الشركة فقط» is a PROFILE ONLY — «بتخليه يعمل بروفايل لمصنعه على المنصة لكن مش
     بتفتحله أي حاجة» — so every opportunity feature starts at Basic (2); the profile plan keeps its directory listing only.
     Procurement news from Premium (3). The supplier / contractor directories are open to everyone (0: no gate anywhere). */
  var FEAT = { tenders: 2, rfq: 2, awards: 2, winners: 2, projects: 2, procurement: 3, export: 2, leads: 2, radar: 2, suppliers: 0, contractors: 0, alerts: 2,
               respond: 2, incoming: 2, stats: 2, products: 2, intl: 3, priority: 3, advisor: 4, bassem: 4 };
  /* the 6 GCC states: [code, Arabic, English, flag] (the codes the Worker stores in members.prefs_json.gcc) */
  var GCC = [["SA", "السعودية", "Saudi Arabia", "🇸🇦"], ["AE", "الإمارات", "UAE", "🇦🇪"], ["KW", "الكويت", "Kuwait", "🇰🇼"], ["QA", "قطر", "Qatar", "🇶🇦"], ["BH", "البحرين", "Bahrain", "🇧🇭"], ["OM", "عُمان", "Oman", "🇴🇲"]];
  var GCC_C = ["SA", "AE", "KW", "QA", "BH", "OM"];
  /* EXACTLY the Worker's gccCode / normGcc (worker/src/common.js — keep the two in step; worker/test/gcc.test.mjs «R-6» runs both on one
     vector): «عمّان» / Amman (and «عمان» next to «الأردن») is Jordan, never Oman; «المملكة المتحدة» is not Saudi Arabia; a list is split on
     spaces and , ، ; | / and each word is matched («أبو ظبي» → «ظبي» → AE, «وقطر» → QA) */
  var GCC_RX = [["SA", /السعود|الرياض|جد[ةه]|الدمام|saudi|\bksa\b|riyadh|jeddah|dammam/i], ["AE", /الإمارات|الامارات|دبي|ظبي|الشارق[ةه]|\buae\b|emirates|dubai|dhabi|sharjah/i],
    ["KW", /الكويت|kuwait/i], ["QA", /قطر|الدوح[ةه]|qatar|doha/i], ["BH", /البحرين|المنام[ةه]|bahrain|manama/i], ["OM", /عُمان|عمان|مسقط|\boman|muscat/i]];
  var AMMAN = /عمّان|عَمّان|\bamman\b/i, JORDAN = /الأردن|الاردن|jordan/i;
  function gccCode(s) {
    var t = String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); if (!t) return "";
    if (GCC_C.indexOf(t.toUpperCase()) > -1) return t.toUpperCase();
    if (AMMAN.test(t) || (JORDAN.test(t) && /عمان/.test(t))) return "";
    for (var i = 0; i < GCC_RX.length; i++) if (GCC_RX[i][1].test(t)) return GCC_RX[i][0];
    return "";
  }
  function gccParse(v) {
    var a = Object.prototype.toString.call(v) === "[object Array]" ? v : String(v == null ? "" : v).split(/[\s,،;|\/]+/), out = [];
    for (var i = 0; i < a.length && i < 20; i++) { var x = a[i], c = gccCode(typeof x === "string" || typeof x === "number" ? String(x) : ""); if (c && out.indexOf(c) < 0) out.push(c); }
    return out;
  }
  function gccRow(c) { for (var i = 0; i < GCC.length; i++) if (GCC[i][0] === c) return GCC[i]; return null; }
  function gccName(c) { var r = gccRow(c); return r ? (EN() ? r[2] : r[1]) : ""; }
  function gccNames(cs) { return (cs || []).map(gccName).filter(Boolean).join(EN() ? ", " : "، "); }
  /* «3 دول خليجية» / «دولتين خليجيتين» / «دولة خليجية واحدة» · "3 Gulf states" */
  function gccCount(n, en) {
    if (en === undefined) en = EN();
    if (en) return n === 1 ? "one Gulf state" : n === 2 ? "two Gulf states" : n + " Gulf states";   /* no digit where the Arabic has none (MIGOVL.trFill pairs) */
    return n === 1 ? "دولة خليجية واحدة" : n === 2 ? "دولتين خليجيتين" : n + " دول خليجية";
  }
  function gccPickOf(k) { var p = PL[k], v = p ? +p.gcc || 0 : 0; return v > 0 && v < 6 && v % 1 === 0 && p.markets.indexOf("gulf") > -1 ? v : 0; }
  /* the GCC coverage of plan k for a member (u = the server's user: u.gcc = {pick, all, chosen, pending}) → {pick, all, chosen, pending}.
     A pick plan whose member has not chosen yet is «pending»: all six for now (today's behaviour) and a prompt to choose. */
  function gccOf(k, u, preview) {
    var p = PL[k] || PL.visitor;
    if (p.markets.indexOf("gulf") < 0) return { pick: 0, all: false, chosen: [], pending: false };
    var pick = gccPickOf(k); if (!pick) return { pick: 0, all: true, chosen: [], pending: false };
    var g = !preview && u && u.gcc && typeof u.gcc === "object" ? u.gcc : null, ch = g && !g.pending ? gccParse(g.chosen) : [];
    return ch.length === pick ? { pick: pick, all: false, chosen: ch, pending: false } : { pick: pick, all: false, chosen: [], pending: true };
  }
  /* pages site.py gates at load (keep in sync with GATES there): re-checked when the server answers with a lower plan */
  var GATE = { entity: "awards", winner: "awards", project: "projects", radar: "radar" };
  var MAP = { none: "visitor", data: "profile", data_only: "profile", core: "partner" };
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function norm(p) { p = String(p || "").toLowerCase(); p = MAP[p] || p; return PL[p] ? p : "visitor"; }
  var EN = function () { return window.MIGLANG === "en"; };
  /* which page this is: pages live at clean URLs (/advisor/, /inbox/ …) and site.py sets window.MIGPAGE; the .html form is the fallback */
  function onPage(k) { return window.MIGPAGE === k || new RegExp("(^|/)" + k + "(\\.html?|/)?$").test(location.pathname); }
  function pageKey() { return window.MIGPAGE || (location.pathname.replace(/\/+$/, "").split("/").pop() || "home").replace(/\.html?$/, ""); }

  /* first paint: the last server answer cached by data/mig-api.js (only while its session token exists) */
  /* ME = the signed-in member as the server last described it (its gcc = the chosen GCC states); PV = an admin preview is on */
  var key = "visitor", role = "", confirmed = false, ME = null, PV = false;
  try {
    var c = JSON.parse(ls("mig-me") || "null");
    if (ls("mig-tok") && c && c.user) { key = norm(c.user.plan); role = c.user.role || ""; ME = c.user; if (key !== "visitor" && c.user.plan_expires && Date.parse(c.user.plan_expires) < Date.now()) key = "visitor"; }
  } catch (e) {}
  /* a partner session issued by the Worker from an activation link (advisor.html#login=…) */
  if (key === "visitor") { try { var a = JSON.parse(ss("mig-adv-token") || "null"), ak = a && a.k ? String(a.k).split("|")[1] : ""; if (a && a.t && (ak === "partner" || ak === "strategic")) key = ak; } catch (e) {} }
  /* an admin may preview the site as a plan (view only; the server still decides every action) — a previewed pick plan counts as «not chosen» */
  var pv = role === "admin" ? ss("mig-pv-plan") : null; if (pv && PL[pv]) { key = pv; PV = true; }

  function nm(k) { var p = PL[k] || PL.visitor; return EN() ? p.en : p.n; }
  /* a page gate waiting for the server (see MIGPLAN.gate) */
  var pendingGate = "", gateT = 0;
  function gateUrl(f) { return "register.html#" + ((FEAT[f] || 0) >= 4 ? "partner" : "plans"); }
  function gateOut(f) { try { sessionStorage.setItem("mig-gate", document.title); } catch (e) {} location.replace(gateUrl(f)); }
  function gateDone(f) {
    pendingGate = ""; clearTimeout(gateT); document.documentElement.classList.remove("mig-gate-wait");
    var P = window.MIGPLAN; if (f && !P.can(f) && !(f === "advisor" && onPage("advisor"))) gateOut(f);
  }
  function mkName(m) { return MKN[m] ? (EN() ? MKN[m][1] : MKN[m][0]) : m; }
  /* deploy 2 — plan gates that say what the next plan unlocks and preselect it on /register/ (register.html#<plan> preselects it):
     LVK = the plan of each level; needKey(f) = the lowest plan that has feature f; needMarket(m) = the lowest plan whose markets include m
     (PL is mutated in place by data/plans-live.js, so both follow the Control Center matrix); unlocks(k) = what plan k gives */
  var LVK = ["profile", "profile", "basic", "premium", "partner", "strategic"], SELLK = ["profile", "basic", "premium", "partner", "strategic"];
  function needKey(f) { return LVK[Math.min(5, Math.max(1, FEAT[f] || 1))]; }
  function needMarket(m) { for (var i = 0; i < SELLK.length; i++) if (PL[SELLK[i]].markets.indexOf(m) > -1) return SELLK[i]; return "strategic"; }
  /* the lowest plan that covers ALL six GCC states (the Gulf without a pick): «باقة الشريك الأساسي» in the owner's matrix */
  function allGulfKey() { for (var i = 0; i < SELLK.length; i++) if (PL[SELLK[i]].markets.indexOf("gulf") > -1 && !gccPickOf(SELLK[i])) return SELLK[i]; return "partner"; }
  function capOf(k, f) {
    var c = window.MIGPLANS && MIGPLANS.caps ? MIGPLANS.caps(k) : null;
    if (c && Object.prototype.hasOwnProperty.call(c, f)) return !!+c[f];
    return (PL[k] || PL.visitor).lv >= ({ respond: 2, incoming: 2, stats: 2, priority: 3, procurement: 3, bassem: 4 }[f] || 9);
  }
  /* the plan's geographic scope in words. gen = the generic wording («مصر + 3 دول خليجية تختارها»); otherwise, for the viewer's own
     plan, the GCC states he chose («مصر + السعودية، الإمارات، قطر») or «كل دول الخليج مؤقتاً (اختار 3)» while he has not chosen yet */
  function scopeText(k, gen) {
    var P = window.MIGPLAN, key = k || P.key, p = PL[key] || PL.visitor, m = p.markets, e = EN();
    if (!m.length) return key === "profile" ? (e ? "Company profile only — no opportunities" : "بروفايل الشركة بس — من غير فرص") : (e ? "public pages only" : "الصفحات العامة بس");
    if (["local", "gulf", "africa", "asia", "europe"].every(function (x) { return m.indexOf(x) > -1; })) return e ? "all world markets (Egypt, the Gulf, Africa, Asia, Europe)" : "كل أسواق العالم (مصر والخليج وأفريقيا وآسيا وأوروبا)";
    var pick = gccPickOf(key), g = !gen && key === P.key ? P.gcc() : null, out = "";
    m.forEach(function (x, i) {
      var t, sep = i ? (e ? ", " : "، ") : "";
      if (x === "gulf" && pick) {
        if (i) sep = " + ";
        t = g && g.chosen.length ? gccNames(g.chosen) : g && g.pending ? (e ? "all Gulf states for now (choose " + pick + ")" : "كل دول الخليج مؤقتاً (اختار " + pick + ")") : (e ? gccCount(pick, true) + " of your choice" : gccCount(pick, false) + " تختارها");
      } else if (x === "gulf") t = e ? "all 6 Gulf states" : "كل دول الخليج الست";
      else t = mkName(x);
      out += sep + t;
    });
    return out;
  }
  function unlocks(k) {
    var p = PL[k]; if (!p || k === "visitor") return [];
    var e = EN(), n = p.products, out = [];
    /* profile only: the listing, nothing else (owner 2026-11-18) */
    if (k === "profile") return [e ? "Your company profile in the platform directory and in search results (name, logo, a short profile, official contacts) — no opportunity data" : "ملف لشركتك في دليل المنصة وفي نتائج البحث (الاسم والشعار والنبذة وبيانات التواصل الرسمية) — من غير بيانات الفرص"];
    out.push(e ? "Tenders, RFQs, winning companies and project news in: " + scopeText(k, true) : "المناقصات وطلبات الأسعار والشركات الفايزة وأخبار المشاريع في: " + scopeText(k, true));
    if (capOf(k, "procurement")) out.push(e ? "Procurement news" : "أخبار المشتريات");
    if (n === Infinity) out.push(e ? "Unlimited products in the marketplace" : "منتجات غير محدودة في السوق");
    else if (n > 0) out.push(e ? "Up to " + n + " products in the marketplace" : "حتى " + n + " منتج في السوق");
    if (capOf(k, "respond")) out.push(e ? "Respond to tenders and RFQs" : "الرد على المناقصات وطلبات الأسعار");
    if (capOf(k, "incoming")) out.push(e ? "Matching buyer requests reach you automatically" + (capOf(k, "priority") ? ", with priority" : "") : "طلبات المشترين المطابقة بتوصلك تلقائياً" + (capOf(k, "priority") ? " وبأولوية" : ""));
    if (capOf(k, "stats")) out.push(e ? "Real statistics of your profile" : "إحصائيات حقيقية لملفك");
    if (capOf(k, "bassem")) out.push(e ? "Your AI deal advisor «Bassem» for the whole subscription" : "المستشار الذكي للصفقات «باسم» طول مدة الاشتراك");
    if (k === "strategic") out.push(e ? "All consulting services" : "كل الخدمات الاستشارية", e ? "A «Strategic Partner» banner on the platform and an honour from the association" : "بانر «شريك استراتيجي» على المنصة وتكريم من الجمعية");
    return out;
  }
  function priceLine(k) {
    var p = PL[k]; if (!p || !p.price) return "";
    var e = EN(), v = Math.round((window.MIGPLAN.VAT || 0) * 100), pr = Number(p.price).toLocaleString("en-US");
    return e ? "EGP " + pr + " a year + " + v + "% VAT" : pr + " جنيه سنوياً + ضريبة القيمة المضافة " + v + "%";
  }
  function upHref(k) {
    var P = window.MIGPLAN, mem = P.plan && P.plan.lv >= 1 && window.MIGAPI && MIGAPI.token && MIGAPI.token();
    return mem ? (onPage("dashboard") ? "" : "dashboard.html") + "#tab=plan&plan=" + k : "register.html#" + k;
  }
  function unlockBox(k) {
    var u = unlocks(k), e = EN(); if (!u.length) return "";
    /* review UX-6: the heading ends with a colon and the price has its own labelled line, so it never reads as if the plan pays the member */
    var pl = priceLine(k);
    return '<div class="lk-un"><b>' + (e ? "What «" + nm(k) + "» includes:" : "«" + nm(k) + "» بتديك:") + "</b><ul>" + u.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"
      + (pl ? '<p class="lk-pr">' + (e ? "Price: " : "السعر: ") + '<span class="num">' + pl + "</span></p>" : "") + "</div>";
  }
  window.MIGPLAN = {
    PL: PL, FEAT: FEAT, key: key, plan: PL[key], role: role, confirmed: function () { return confirmed; },
    name: nm, mkName: mkName, VAT: VAT,
    /* the annual fee in EGP before VAT (0 for a visitor); with VAT: Math.round(price(k) * (1 + MIGPLAN.VAT)) */
    price: function (k) { var p = PL[norm(k)]; return p ? p.price || 0 : 0; },
    scope: function (k) { return (PL[k || window.MIGPLAN.key] || PL.visitor).markets.slice(); },
    scopeText: scopeText,
    /* ---------- the GCC states (Premium = Egypt + the 3 the member chose; Core Partner and up = all six) ---------- */
    GCC: GCC, gccCode: gccCode, gccParse: gccParse, gccName: gccName, gccNames: gccNames, gccCount: gccCount, gccPickOf: gccPickOf,
    gccFlag: function (c) { var r = gccRow(c); return r ? r[3] : ""; },
    /* the viewer's coverage {pick, all, chosen, pending} (gccOf(k, user) for any plan and member, e.g. the dashboard's own member) */
    gcc: function () { return gccOf(window.MIGPLAN.key, ME, PV); }, gccOf: function (k, u) { return gccOf(norm(k), u, false); },
    allGulfKey: allGulfKey,
    /* is an item of market m (and GCC state cc: a code, "ARAB" = another Arab country, "" = unknown) inside the viewer's plan? */
    inScope: function (m, cc) {
      var P = window.MIGPLAN; if (!P.market(m)) return false; if (m !== "gulf") return true;
      var g = P.gcc(); if (!g.pick || g.pending || cc === "ARAB") return true; return !!cc && g.chosen.indexOf(cc) > -1;
    },
    /* procurement news («أخبار المشتريات») only for the plans that have it (Premium and up); every other news item for everyone */
    newsOK: function (n) { var c = n && typeof n === "object" ? (n.category_ar || n.category || n.sector || "") : String(n || ""); return String(c).replace(/^\s+|\s+$/g, "") !== "أخبار المشتريات" || window.MIGPLAN.can("procurement"); },
    /* the 6-state picker (register / dashboard / data desk): o = {id, selected:[codes], pick, legend, hint, ro} → a fieldset; gccBind wires it */
    gccPicker: function (o) {
      o = o || {}; var id = String(o.id || "gccp").replace(/[^\w-]/g, ""), e = EN(), pick = o.pick || gccPickOf("premium") || 3, sel = gccParse(o.selected || []);
      var lg = o.legend || (e ? "Choose " + gccCount(pick, true) + " for your Premium plan" : "اختار " + gccCount(pick, false) + " لباقتك المميزة");
      var hn = o.hint === false ? "" : o.hint || (e ? "Opportunities, tenders and RFQs in these states are included in your plan. All 6 Gulf states are included in the «" + nm(allGulfKey()) + "»." : "الفرص والمناقصات وطلبات الأسعار في الدول دي بتبقى ضمن باقتك. كل دول الخليج الست متاحة في «" + nm(allGulfKey()) + "».");
      return '<fieldset class="gccf" id="' + id + '" data-pick="' + pick + '" aria-describedby="' + id + "N" + (hn ? " " + id + "H" : "") + '"><legend>' + lg + ' <span aria-hidden="true">*</span></legend>'
        + (hn ? '<p class="gcch" id="' + id + 'H">' + hn + "</p>" : "") + '<div class="gccg">'
        + GCC.map(function (r) { return '<label><input type="checkbox" name="' + id + '" value="' + r[0] + '"' + (sel.indexOf(r[0]) > -1 ? " checked" : "") + (o.ro ? " disabled" : "") + '> <span aria-hidden="true">' + r[3] + "</span> <span>" + (e ? r[2] : r[1]) + "</span></label>"; }).join("")
        + '</div><p class="gccn num" id="' + id + 'N" aria-live="polite"></p></fieldset>';
    },
    /* root = the fieldset (or any element holding its checkboxes): live counter «اخترت 2 من 3», the other boxes disabled once pick are ticked;
       → {get() → codes, set(codes or text), ok() → exactly pick} */
    gccBind: function (root, o) {
      o = o || {}; if (!root) return null;
      /* o.pick: a number or a function (the register form's plan can change) */
      var pk = function () { var v = typeof o.pick === "function" ? +o.pick() : +o.pick; return v > 0 ? v : +root.getAttribute("data-pick") || 3; };
      var e = EN(), boxes = [].slice.call(root.querySelectorAll('input[type="checkbox"]')), out = root.querySelector(".gccn");
      var get = function () { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); };
      var paint = function () {
        var n = get().length, pick = pk();
        boxes.forEach(function (b) { b.disabled = !!o.ro || (!b.checked && n >= pick); var l = b.closest ? b.closest("label") : null; if (l) { l.classList.toggle("on", b.checked); l.classList.toggle("dis", b.disabled); } });
        if (out) out.textContent = (e ? n + " of " + pick + " chosen" : "اخترت " + n + " من " + pick) + (n >= pick && !o.ro ? (e ? " — to change one, untick one first" : " — علشان تغيّر دولة شيل علامة واحدة الأول") : "");
        if (n === pick) root.removeAttribute("aria-invalid");
      };
      var changed = function () { if (o.onChange) try { o.onChange(get()); } catch (x) {} };
      boxes.forEach(function (b) { b.addEventListener("change", function () { paint(); changed(); }); });
      paint();
      return { get: get, ok: function () { return get().length === pk(); }, pick: pk, refresh: paint,
        /* codes, a list, or free text («السعودية، قطر، عمان»): the first pick states are ticked */
        set: function (v) { var cs = gccParse(v).slice(0, pk()); boxes.forEach(function (b) { b.checked = cs.indexOf(b.value) > -1; }); paint(); changed(); },
        bad: function () { root.setAttribute("aria-invalid", "true"); var f = boxes.filter(function (b) { return !b.checked && !b.disabled; })[0] || boxes[0]; if (f) try { f.focus(); } catch (x) {} } };
    },
    /* legacy callers (register flow): the plan is never set by the browser any more */
    set: function () {},
    /* page gates (site.py GATES): true = leave the page now. A platform session whose plan the server has not confirmed yet waits for
       /api/me (the page stays hidden meanwhile, at most 8 s, then the cached plan decides) instead of being sent away; the advisor
       page handles visitors itself (lock box + sign-in with an e-mail code), so a partner on a new device can sign in there. */
    gate: function (f) {
      var P = window.MIGPLAN; if (P.can(f)) return false;
      if (ls("mig-tok") && !confirmed) {
        pendingGate = f; document.documentElement.classList.add("mig-gate-wait");
        clearTimeout(gateT); gateT = setTimeout(function () { if (pendingGate) gateDone(pendingGate); }, 8000);
        return false;
      }
      if (f === "advisor" && onPage("advisor")) return false;
      try { sessionStorage.setItem("mig-gate", document.title); } catch (e) {}
      return true;
    },
    /* where a gate sends a visitor: the plans list, or the partner plans for the advisor */
    gateUrl: gateUrl,
    needKey: needKey, needMarket: needMarket, unlocks: unlocks, unlockBox: unlockBox, priceLine: priceLine, upHref: upHref,
    can: function (f) { return window.MIGPLAN.plan.lv >= (FEAT[f] || 0); },
    market: function (m) { return window.MIGPLAN.plan.markets.indexOf(m) > -1; },
    needName: function (f) {
      var lv = FEAT[f] || 0, e = EN();
      return lv >= 4 ? (e ? "the Core Partner or Strategic Partner plan" : "باقة الشريك الأساسي أو الشريك الاستراتيجي") : lv >= 3 ? (e ? "the Premium plan or higher" : "الباقة المميزة فأعلى") : lv >= 2 ? (e ? "the Basic plan or higher" : "الباقة الأساسية فأعلى") : (e ? "the Basic plan or higher" : "الباقة الأساسية فأعلى");
    },
    /* called by data/mig-api.js with the server's answer (u = the server's user: its gcc = the GCC states the member chose) */
    update: function (k, r, isServer, u) {
      k = norm(k); var P = window.MIGPLAN, was = P.key, g0 = JSON.stringify(P.gcc());
      if (isServer) { confirmed = true; role = r || ""; P.role = role; ME = u && typeof u === "object" ? u : null; PV = false; var p2 = role === "admin" ? ss("mig-pv-plan") : null; if (p2 && PL[p2]) { k = p2; PV = true; } }
      /* without a platform session, a Worker-issued advisor session still counts (activation-link flow) */
      if (k === "visitor" && !ls("mig-tok")) { try { var a2 = JSON.parse(ss("mig-adv-token") || "null"), k2 = a2 && a2.k ? String(a2.k).split("|")[1] : ""; if (a2 && a2.t && PL[k2] && PL[k2].lv >= 4) k = k2; } catch (e) {} }
      P.key = k; P.plan = PL[k];
      if (isServer && pendingGate) gateDone(pendingGate);
      /* a new plan, or the same plan with other GCC states (the member just chose them): pages that show coverage repaint on "mig:plan" */
      if (was !== k || JSON.stringify(P.gcc()) !== g0) { try { window.dispatchEvent(new CustomEvent("mig:plan", { detail: { key: k, was: was, gcc: P.gcc() } })); } catch (e) {} }
      if (was !== k) {
        var pg = pageKey(), f = GATE[pg];
        if (f && PL[was].lv >= FEAT[f] && PL[k].lv < FEAT[f]) { ss("mig-gate", document.title); location.replace("register.html#plans"); }
      }
      pvBar();
    },
    lockHTML: function (f, title) {
      var e = EN(), P = window.MIGPLAN;
      var nk = P.needKey ? P.needKey(f) : ((FEAT[f] || 0) >= 4 ? "partner" : "plans");
      return '<div class="lockbox"><div class="lk-ic">🔒</div><h2>' + (title || (e ? "This section is for members" : "هذا القسم متاح للأعضاء")) + "</h2><p>" + (e ? "Available on <b>" : "متاح لمشتركي <b>") + P.needName(f) + "</b>. " + (e ? "Your plan: <b>" : "باقتك الحالية: <b>") + nm(P.key) + "</b>.</p>" + (PL[nk] ? unlockBox(nk) : "") + '<div class="lk-acts"><a class="btn btn-gold" href="' + (PL[nk] ? upHref(nk) : "register.html#plans") + '" data-mig-want="' + (PL[nk] ? nk : "") + '">' + (PL[nk] ? (P.plan && P.plan.lv >= 1 ? (e ? "Upgrade to «" + nm(nk) + "»" : "رقّي لـ«" + nm(nk) + "»") : (e ? "Subscribe to «" + nm(nk) + "»" : "اشترك في «" + nm(nk) + "»")) : (e ? "Choose a plan" : "اختار باقة")) + '</a><a class="btn btn-line" href="register.html#plans">' + (e ? "Compare plans" : "قارن الباقات") + "</a></div></div>";
    },
    /* a market outside the plan's geographic scope */
    scopeLockHTML: function (m, title, cc) {
      var e = EN(), P = window.MIGPLAN, need = needMarket(m), g = m === "gulf" && P.market("gulf") ? P.gcc() : null;
      /* a Premium member and a GCC state that is not one of the states he chose (cc "" = a Gulf country the item does not name) */
      if (g && g.pick && !g.pending && cc !== "ARAB" && !(cc && g.chosen.indexOf(cc) > -1)) {
        var all = allGulfKey(), st = cc ? gccName(cc) : (e ? "this state" : "الدولة دي");
        return '<div class="lockbox"><div class="lk-ic">🌍</div><h2>' + (title || (e ? "This state is not one of the " + g.pick + " you chose" : "الدولة دي مش من الـ" + g.pick + " دول اللي اخترتها")) + "</h2><p>" + (e ? "Your plan covers: <b>" : "باقتك بتغطي: <b>") + P.scopeText() + "</b>. " + (e ? st + " and all 6 Gulf states are included in the <b>«" + nm(all) + "»</b>." : "فرص " + st + " وكل دول الخليج الست متاحة في <b>«" + nm(all) + "»</b>.") + "</p>" + unlockBox(all) + '<div class="lk-acts"><a class="btn btn-gold" href="' + upHref(all) + '" data-mig-want="' + all + '">' + (e ? "Upgrade to «" + nm(all) + "»" : "رقّي لـ«" + nm(all) + "»") + '</a><a class="btn btn-line" href="register.html#plans">' + (e ? "Compare plans" : "قارن الباقات") + "</a></div></div>";
      }
      return '<div class="lockbox"><div class="lk-ic">🌍</div><h2>' + (title || (e ? "Outside your plan's markets" : "السوق ده خارج النطاق الجغرافي لباقتك")) + "</h2><p>" + (e ? "Your plan covers: <b>" : "باقتك بتغطي: <b>") + P.scopeText() + "</b>. " + (e ? "Opportunities in " + mkName(m) + " are included from <b>" + nm(need) + "</b>." : "فرص " + mkName(m) + " متاحة من <b>" + nm(need) + "</b>.") + "</p>" + unlockBox(need) + '<div class="lk-acts"><a class="btn btn-gold" href="' + upHref(need) + '" data-mig-want="' + need + '">' + (e ? "Upgrade to «" + nm(need) + "»" : "رقّي لـ«" + nm(need) + "»") + '</a><a class="btn btn-line" href="register.html#plans">' + (e ? "Compare plans" : "قارن الباقات") + "</a></div></div>";
    }
  };
  var css = '.lockbox{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:34px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;margin:20px auto;max-width:640px}.lockbox .lk-ic{width:70px;height:70px;border-radius:50%;background:var(--gold-soft);display:grid;place-items:center;font-size:2rem}.lockbox h2{font-size:1.25rem;font-weight:800}.lockbox p{color:var(--muted)}.lk-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.lk-un{align-self:stretch;text-align:start;background:var(--sunken,#F6F7F8);border:1px solid var(--line);border-radius:14px;padding:12px 14px;font-size:.88rem;line-height:1.8}.lk-un b{display:block;color:var(--fg)}.lk-un b small{font-weight:600;color:var(--muted);font-size:.8rem;margin-inline-start:6px}.lk-un ul{margin:6px 0 0;padding-inline-start:18px;color:var(--fg)}.lk-un .lk-pr{margin:8px 0 0;padding-top:6px;border-top:1px dashed var(--line);font-weight:700;color:var(--fg)}.lk-un .lk-pr .num{font-weight:700}.lk-blur{position:relative}.lk-blur>.lk-inner{filter:blur(6px);pointer-events:none;user-select:none;opacity:.6}.lk-blur>.lockbox{position:absolute;inset:0;margin:auto;height:fit-content;z-index:5;box-shadow:0 20px 40px -20px rgba(0,0,0,.4)}' +
    'html.mig-gate-wait main,html.mig-gate-wait .phero{visibility:hidden}' +
    /* the GCC-state picker (MIGPLAN.gccPicker): 3 × 2 boxes (2 columns on phones), each at least 44 px high */
    '.gccf{border:1px solid var(--line);border-radius:14px;padding:10px 14px 12px;margin:0;display:flex;flex-direction:column;gap:8px;min-width:0;background:var(--surface)}.gccf legend{font-weight:800;padding:0 6px;font-size:.92rem}.gccf[aria-invalid=true]{border-color:#B42318;box-shadow:0 0 0 2px rgba(180,35,24,.15)}.gccf .gcch{margin:0;color:var(--muted);font-size:.84rem;line-height:1.7}.gccg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gccg label{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer;font-size:.88rem;font-weight:600;background:var(--surface);overflow-wrap:anywhere}.gccg label.on{border-color:var(--green);background:var(--green-soft)}.gccg label.dis{opacity:.55;cursor:not-allowed}.gccg input{width:18px;height:18px;margin:0;flex:none;accent-color:var(--green)}.gccg input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}.gccf .gccn{margin:0;font-size:.82rem;font-weight:700;color:var(--muted)}@media (max-width:560px){.gccg{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.planpv{position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);z-index:44;background:var(--green-deep);color:#fff;border-radius:99px;padding:6px 8px 6px 14px;display:flex;align-items:center;gap:8px;font-size:.8rem;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}.planpv select{font:inherit;font-size:.8rem;border:0;border-radius:99px;padding:4px 10px;background:#fff;color:#0F172A}.planpv .x{background:none;border:0;color:#fff;cursor:pointer;opacity:.7}';
  var st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  /* admin-only preview bar («معاينة كـ»): view the site as a plan; never shown to members or visitors */
  function pvBar() {
    var old = document.querySelector(".planpv"); if (!document.body) return;
    /* not on the admin consoles (requests console, SEO workspace): the plan preview has no use there and must not cover their lists on phones */
    if (role !== "admin" || onPage("inbox") || onPage("seo-admin")) { if (old) old.remove(); return; }
    if (old) return;
    var d = document.createElement("div"), e = EN(); d.className = "planpv"; d.setAttribute("role", "region"); d.setAttribute("aria-label", e ? "Admin preview by plan" : "معاينة الإدارة حسب الباقة"); d.setAttribute("translate", "no");
    d.innerHTML = "<span>👁 " + (e ? "Admin preview as" : "معاينة الإدارة كـ") + '</span><select aria-label="' + (e ? "Plan" : "الباقة") + '"><option value="">' + (e ? "(my real plan)" : "(باقتي الحقيقية)") + "</option>" + Object.keys(PL).map(function (k) { return '<option value="' + k + '"' + (ss("mig-pv-plan") === k ? " selected" : "") + ">" + nm(k) + "</option>"; }).join("") + '</select><button class="x" type="button" aria-label="' + (e ? "Hide" : "إخفاء") + '">✕</button>';
    document.body.appendChild(d);
    d.querySelector("select").onchange = function () { ss("mig-pv-plan", this.value || null); location.reload(); };
    d.querySelector(".x").onclick = function () { d.remove(); };
  }
  document.addEventListener("DOMContentLoaded", pvBar);
  document.addEventListener("click", function (ev) { var a = ev.target && ev.target.closest ? ev.target.closest("[data-mig-want]") : null; if (a && a.getAttribute("data-mig-want")) ss("mig-want-plan", a.getAttribute("data-mig-want")); }, true);
})();
