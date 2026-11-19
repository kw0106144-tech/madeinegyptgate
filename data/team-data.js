/* «لوحة فريق الداتا — مكتب الاستقبال» — data-desk.html → /data-desk/ (ACC-CONTRACT §12.2–§12.3). ES5, no dependencies.
   The front desk at the office: a client walks in and wants to place an order, be registered by hand, or the team adds a project,
   a tender or a buyer RFQ. Big buttons, big inputs, tablet first. Every result shown is the SERVER's answer (ref, routed count,
   member id + status, published/draft); nothing is ever shown as saved without it. Offline → an honest message, the form keeps its data.
   Who: roles data | admin | owner (GET /api/me → user.role; the server checks every call again). Anyone else → the live lock box
   «غير مصرّح لك بدخول هذه الصفحة». Signed out → the e-mail-code sign-in of data/mig-api.js (window.MIGAPI.open).
   API (Worker, Bearer v2 session; JSON; errors {error, code, errors?:[{field, msg}]}):
     POST /api/team/desk/inquiry {buyer:{name, company, phone, email?, governorate?, type?}, product, quantity, unit?, details?, deadline?,
                                  target_company_ref?}                                   → {ok, ref, status, routed}
     POST /api/team/desk/member  {company, contact_name, title?, email, phone, sector, governorate, products?, requested_plan, gcc?}
                                 (gcc = the GCC states of a plan whose member picks them — Premium = Egypt + 3 — 422 gcc_required otherwise)
                                                                                          → {ok, member_id, status} · 409 {code:"exists", member:{…}}
     POST /api/team/desk/content {collection:"tenders"|"projects"|"rfqs", item:{…overlay fields…}, private?, source_url?}
                                                                                          → {ok, id, state:"published"|"draft"}
     GET  /api/team/desk/mine?kind=&page=&limit=                                          → {items, total, page, limit}
   Governorates come from data/regions.js (window.MIGREG, the 27 codes), sectors from window.MIGSECTORS, plans from window.MIGPLAN. */
(function () {
  "use strict";
  if (window.__MIG_DESK) return; window.__MIG_DESK = 1;
  var EN = window.MIGLANG === "en";
  function T(a, e) { return EN ? e : a; }
  var A = window.MIGAPI || null;
  var BASE = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var app = document.getElementById("tmApp"), whoEl = document.getElementById("tmWho");
  if (!app) return;
  window.__seoDone = 1;
  if (EN) {
    var h1 = document.getElementById("tmH1"), ld = document.getElementById("tmLead"), cr = document.getElementById("tmCrumb");
    if (h1) h1.textContent = "Data team board — front desk";
    if (ld) ld.textContent = "When a client comes to the office: a new order, a member registered by hand, a project, a tender or a request for quotation — every result is the server's real answer.";
    if (cr) cr.innerHTML = '<a href="/">Home</a> › <span>Front desk</span>';
    try { document.title = "Data team board — front desk – Made in Egypt Gate"; } catch (e) {}
  }
  /* a staff tool: Janna's full-screen welcome stage must not cover the desk (her small corner figure stays) */
  try { if (!window.sessionStorage.getItem("janna-stage")) window.sessionStorage.setItem("janna-stage", "1"); } catch (e) {}
  var OK_ROLES = { data: 1, admin: 1, owner: 1 };
  var S = { mode: "boot", user: null, role: "", teamPage: "", view: "home", off: null, mine: null, mq: { kind: "", page: 0 }, forms: {}, res: {}, busy: {} };

  /* ---------- helpers ---------- */
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ascii(s) { return String(s == null ? "" : s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); }); }
  function clean(s) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim(); }
  function line(s) { return clean(s).replace(/\s+/g, " "); }
  function nf(n) { n = +n || 0; try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }
  function cairoToday() {
    try { var o = {}; new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; }); if (o.year && o.month && o.day) return o.year + "-" + o.month + "-" + o.day; } catch (e) {}
    return new Date().toISOString().slice(0, 10);
  }
  function fdate(v) {
    if (!v) return "—"; var d = new Date(String(v)); if (isNaN(d.getTime())) return esc(v);
    var o = { year: "numeric", month: "short", day: "numeric" }; if (!/^\d{4}-\d\d-\d\d$/.test(String(v))) { o.hour = "2-digit"; o.minute = "2-digit"; }
    try { return esc(new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", o).format(d)); } catch (e) { return esc(String(v).slice(0, 16).replace("T", " ")); }
  }
  function token() { return (A && A.token && A.token()) || ""; }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  /* the team role /api/me tells (integration patch P-TEAM-6 adds user.staff_role; "" = no staff role) → a role, "" (none) or undefined
     (/api/me does not say: ask the server, GET /api/team/whoami) */
  function hintOf(u) {
    if (!u) return undefined;
    if (own(u, "staff_role")) return String(u.staff_role || "").toLowerCase();
    var r = String(u.cc_role || u.team_role || u.role || "").toLowerCase();
    return /^(owner|admin|data|seo|editor|support)$/.test(r) ? r : undefined;
  }
  /* the member's own board: the server's team_page (seo-team.html / data-desk.html / admin/) as its clean URL; the old «panel.html» answer
     means the Control Center, which lives at /admin/ (/panel.html stays the owner's old system) */
  function teamPage(r, page) { if (page) { var p = String(page).replace(/^\/+/, "").replace(/\.html$/, "/"); return /^(panel|admin)\/?$/.test(p) ? "/admin/" : "/" + p; } return r === "seo" || r === "editor" ? "/seo-team/" : r === "data" ? "/data-desk/" : ""; }
  function roleName(r) { return ({ owner: T("المالك", "Owner"), admin: T("مدير", "Admin"), data: T("فريق الداتا", "Data team"), seo: T("فريق الـ SEO", "SEO team"), editor: T("محرر", "Editor"), support: T("دعم", "Support") })[r] || T("عضو", "Member"); }
  function loading(t) { return '<div class="tm-card"><p class="tm-load">⏳ ' + esc(t || T("جارٍ التحميل…", "Loading…")) + "</p></div>"; }
  function chip(t, cls) { return '<span class="tm-c' + (cls ? " " + cls : "") + '">' + esc(t) + "</span>"; }
  function toast(m) { if (A && A.ui && A.ui.toast) A.ui.toast(m); }

  /* ---------- reference lists (real data files only) ---------- */
  var GOVS = ((window.MIGREG && window.MIGREG.list) || []).map(function (g) { var en = (g[3] || []).filter(function (x) { return !/[؀-ۿ]/.test(x); })[0] || g[1]; return [g[0], g[1], en]; });
  function govName(c, en) { for (var i = 0; i < GOVS.length; i++) if (GOVS[i][0] === c) return en ? GOVS[i][2] : GOVS[i][1]; return ""; }
  var SECTORS = (window.MIGSECTORS || []).map(function (s) { return [s[0], s[0], s[1] || s[0]]; });
  var PLAN_KEYS = ["profile", "basic", "premium", "partner", "strategic"];
  var PLANS = PLAN_KEYS.filter(function (k) { return window.MIGPLAN && window.MIGPLAN.PL && window.MIGPLAN.PL[k]; }).map(function (k) { var p = window.MIGPLAN.PL[k]; return [k, p.n, p.en]; });
  var BTYPES = [["company", "شركة", "Company"], ["factory", "مصنع", "Factory"], ["contractor", "مقاول", "Contractor"], ["government", "جهة حكومية", "Government body"], ["trader", "تاجر أو موزّع", "Trader or distributor"], ["individual", "فرد", "Individual"]];
  var UNITS = [["طن", "ton"], ["كيلو", "kg"], ["قطعة", "piece"], ["متر", "metre"], ["متر مربع", "m²"], ["متر مكعب", "m³"], ["لتر", "litre"], ["كرتونة", "carton"], ["طقم", "set"]];
  var TEND_TYPES = [["مناقصة عامة", "مناقصة عامة", "Public tender"], ["مناقصة", "مناقصة", "Tender"], ["ممارسة عامة", "ممارسة عامة", "Public practice (negotiated bid)"], ["مناقصة محدودة", "مناقصة محدودة", "Limited tender"]];
  /* the project stages of data/projects.js (MIG.STAGES, index 0–6) */
  var STAGES = [["0", "التخطيط", "Planning"], ["1", "التصميم", "Design"], ["2", "طرح العقود", "Tendering"], ["3", "الترسية", "Award"], ["4", "التنفيذ", "Construction"], ["5", "التشطيبات", "Finishing"], ["6", "مكتمل", "Completed"]];

  /* ---------- transport: same-origin /api with the platform session (keeps the full error body: field errors, 409 summary) ---------- */
  function call(method, path, body, o) {
    o = o || {};
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej({ code: "offline", status: 0 }); return; }
      var h = { Accept: "application/json" }, tk = token(), done = false;
      if (body !== undefined) h["Content-Type"] = "application/json";
      if (tk) h.Authorization = "Bearer " + tk;
      var ctl = window.AbortController ? new AbortController() : null;
      var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej({ code: "offline", status: 0, timeout: true }); }, o.timeout || 25000);
      fetch(BASE + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        /* a static host (no Worker route yet) answers with HTML: the desk service is not connected */
        if (ct.indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw { code: "offline", status: r.status }; });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.ok) { res(x.j); return; }
        var e = { code: x.j.code || "http_" + x.st, error: x.j.error || "", status: x.st, j: x.j, errors: Array.isArray(x.j.errors) ? x.j.errors : null };
        /* the session ended mid-entry: keep what was typed (memory only) for the same account after it signs in again */
        if (x.st === 401 && !o.quiet) setTimeout(function () { saveDraft(); signIn(true); }, 0);
        rej(e);
      }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline", status: 0 }); });
    });
  }
  function errText(e) {
    if (!e) return T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    var c = String(e.code || ""), st = +e.status || 0;
    if (c === "offline") return T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فمحصلش أي حفظ. البيانات لسه في الفورم — جرّب تاني بعد شوية.", "We couldn't reach the platform's server right now, so nothing was saved. Your entries are still in the form — please try again shortly.");
    if (st === 401) return T("الجلسة انتهت. ادخل تاني بالبريد، ومحصلش أي حفظ.", "Your session ended. Please sign in again; nothing was saved.");
    if (c === "invalid_contact") return T("ممنوع أرقام تليفون أو واتساب أو إيميلات في النصوص اللي بتتنشر على الموقع. بيانات التواصل مكانها خانات العميل بس.", "Phone numbers, WhatsApp numbers and e-mail addresses are not allowed in text that is published; contact details go in the client fields only.");
    if (c === "use_email_code") return T("الحساب ده داخل بالباسورد القديم. مكتب الاستقبال محتاج دخول بكود على الإيميل.", "This account signed in with the old password. The front desk needs a sign-in with an e-mail code.");
    if (c === "full_login_required") return T("إنت داخل برابط من الإيميل، وده مش كفاية لمكتب الاستقبال. ادخل بكود على الإيميل.", "You signed in with an e-mailed link, which is not enough for the front desk. Sign in with an e-mail code.");
    if (c === "invalid_url") return T("الرابط لازم يبدأ بـ https:// ويكون رابط كامل.", "The link must be a full address starting with https://.");
    if (st === 403) return T("حسابك مش مسموحله بالإجراء ده (الصفحة دي لفريق الداتا والإدارة).", "Your account may not do this (this page is for the data team and the admins).");
    if (st === 409) return T("الإيميل ده متسجّل على المنصة قبل كده.", "This e-mail address is already registered on the platform.");
    if (c === "rate_limited" || c === "limit" || st === 429) return T("إدخالات كتير ورا بعض. استنى دقيقة وجرّب تاني.", "Too many entries in a row. Wait a minute and try again.");
    if (st === 422 || st === 400) return T("فيه بيانات ناقصة أو مش صحيحة — راجع الخانات المعلّمة بالأحمر، ومحصلش أي حفظ.", "Some data is missing or not valid — check the fields marked in red; nothing was saved.") + (e.error && !(e.errors && e.errors.length) ? " (" + e.error + ")" : "");
    if (st === 503 || /_off$/.test(c)) return T("الخدمة مش جاهزة على السيرفر لسه، فمحصلش أي حفظ.", "The service is not ready on the server yet, so nothing was saved.");
    if (st >= 500) return T("حصل خطأ في السيرفر ومفيش حفظ مؤكد. جرّب تاني، ولو اتكرر بلّغ الإدارة.", "A server error happened and nothing was confirmed as saved. Try again; if it repeats, tell the admins.");
    return T("حصلت مشكلة: ", "Something went wrong: ") + (e.error || c);
  }

  /* ---------- the five forms (declarative: field key = the server's field name) ---------- */
  function opt(list, ph) { return [["", ph || T("— اختار —", "— choose —")]].concat(list.map(function (x) { return [x[0], EN ? x[2] : x[1]]; })); }
  var FORMS = {
    order: { icon: "🧾", ar: "طلبية لعميل في المقر", en: "Order for a client at the office", tab_ar: "طلبية", tab_en: "Order",
      lead_ar: "العميل عايز ينزّل طلبية: بنسجّلها والسيستم بيوزّعها تلقائياً على المصانع المسجّلة المطابقة، والرد بيوصل للعميل.",
      lead_en: "The client wants to place an order: we record it and the system routes it automatically to matching registered factories; their answers reach the client.",
      secs: [
        [T("بيانات العميل", "Client details"), [
          { k: "buyer.name", ar: "اسم العميل", en: "Client name", req: 1, max: 120, ac: "name" },
          { k: "buyer.company", ar: "الشركة أو الجهة", en: "Company or organisation", req: 1, max: 160, ac: "organization" },
          { k: "buyer.phone", ar: "رقم الموبايل", en: "Mobile number", req: 1, t: "tel", max: 30, hint_ar: "للتواصل مع العميل بس — مش بيتنشر.", hint_en: "Only to reach the client — never published." },
          { k: "buyer.email", ar: "الإيميل", en: "E-mail", t: "email", max: 254, hint_ar: "لو العميل كتبه، بيوصله إيصال الاستلام والردود عليه.", hint_en: "If the client gives one, the receipt and the answers are sent to it." },
          { k: "buyer.governorate", ar: "المحافظة", en: "Governorate", t: "select", opts: function () { return opt(GOVS); } },
          { k: "buyer.type", ar: "نوع العميل", en: "Client type", t: "select", opts: function () { return opt(BTYPES); } }]],
        [T("الطلبية", "The order"), [
          { k: "product", ar: "المنتج المطلوب", en: "Product needed", req: 1, max: 200, wide: 1 },
          { k: "quantity", ar: "الكمية", en: "Quantity", req: 1, max: 60, im: "decimal" },
          { k: "unit", ar: "الوحدة", en: "Unit", max: 20, list: "tmUnits" },
          { k: "deadline", ar: "مطلوبة قبل", en: "Needed by", t: "date", future: 1 },
          { k: "details", ar: "المواصفات والتفاصيل", en: "Specifications and details", t: "textarea", max: 2000, wide: 1 },
          { k: "target_company_ref", ar: "مصنع معيّن من الدليل", en: "A specific directory company", max: 20, ltr: 1, pattern: /^(\d{1,6}|x\d{1,6}|c-[2-9a-hjkmnp-z]{8})$/,
            hint_ar: "اختياري: رقم المنشأة في الدليل لو العميل عايز مصنع بعينه. التوزيع على المصانع المسجّلة المطابقة بيحصل تلقائي في كل الأحوال.", hint_en: "Optional: the company's directory number if the client wants that one. Routing to matching registered factories happens automatically anyway." }]]],
      submit_ar: "📨 سجّل الطلبية ووزّعها", submit_en: "📨 Record and route the order" },
    member: { icon: "🪪", ar: "تسجيل عضو يدوي", en: "Register a member by hand", tab_ar: "عضو جديد", tab_en: "New member",
      lead_ar: "تسجيل شركة أو مصنع عضو جديد بالباقة اللي طلبها. الحساب بيتسجّل «بانتظار التفعيل»: التفعيل وتغيير الباقة من الإدارة بس، وبوابة الدفع لسه بتتجهّز.",
      lead_en: "Register a new member company or factory with the plan it asked for. The account is created as «pending activation»: activation and plan changes are done by the admins only, and the payment gateway is still being set up.",
      secs: [
        [T("الشركة", "The company"), [
          { k: "company", ar: "اسم الشركة أو المصنع", en: "Company or factory name", req: 1, max: 160, wide: 1, ac: "organization" },
          { k: "sector", ar: "القطاع", en: "Sector", req: 1, t: "select", opts: function () { return opt(SECTORS); } },
          { k: "governorate", ar: "المحافظة", en: "Governorate", req: 1, t: "select", opts: function () { return opt(GOVS); } },
          { k: "products", ar: "المنتجات", en: "Products", t: "textarea", cls: "sm", max: 600, wide: 1, hint_ar: "افصل بين المنتجات بفاصلة (لحد 20 منتج). من غير أرقام تليفون أو روابط.", hint_en: "Separate products with commas (up to 20). No phone numbers or links." }]],
        [T("المسؤول", "The contact person"), [
          { k: "contact_name", ar: "اسم المسؤول", en: "Contact person", req: 1, max: 120, ac: "name" },
          { k: "title", ar: "الوظيفة", en: "Job title", max: 40 },
          { k: "email", ar: "الإيميل", en: "E-mail", req: 1, t: "email", max: 254, hint_ar: "عليه بيوصل إيميل الترحيب والدخول.", hint_en: "The welcome and sign-in e-mail goes to it." },
          { k: "phone", ar: "رقم الموبايل", en: "Mobile number", req: 1, t: "tel", max: 30 }]],
        [T("الباقة", "The plan"), [
          { k: "requested_plan", ar: "الباقة المطلوبة", en: "Requested plan", req: 1, t: "select", opts: function () { return opt(PLANS); }, hint_ar: "بتتسجّل كطلب بس — الإدارة هي اللي بتفعّل.", hint_en: "Recorded as a request only — the admins activate it." },
          { k: "gcc", ar: "دول الخليج (الباقة المميزة: اختار 3)", en: "Gulf states (Premium: pick 3)", req: 1, t: "gcc", wide: 1, hint_ar: "الباقة المميزة فيها مصر + 3 دول خليجية يختارها العميل. كل دول الخليج الست في باقة الشريك الأساسي.", hint_en: "Premium includes Egypt + 3 Gulf states the client picks. All 6 Gulf states are in the Core Partner plan." }]]],
      submit_ar: "✍️ سجّل العضو", submit_en: "✍️ Register the member" },
    project: { icon: "🏗️", ar: "إضافة مشروع", en: "Add a project", tab_ar: "مشروع", tab_en: "Project", coll: "projects",
      lead_ar: "مشروع جديد لصفحة «مشاريع مصر». لو كتبت رابط المصدر الرسمي بيتنشر على طول، ومن غيره بيتحفظ مسودة لحد ما الإدارة توافق.",
      lead_en: "A new project for the «Egypt projects» page. With an official source link it is published at once; without one it is saved as a draft until the admins approve it.",
      secs: [
        [T("المشروع", "The project"), [
          { k: "name", ar: "اسم المشروع", en: "Project name", req: 1, max: 300, wide: 1 },
          { k: "stage", ar: "المرحلة", en: "Stage", req: 1, t: "select", opts: function () { return opt(STAGES); } },
          { k: "gov", ar: "المحافظة", en: "Governorate", t: "select", opts: function () { return opt(GOVS); } },
          { k: "city", ar: "المدينة أو المنطقة", en: "City or area", max: 120 },
          { k: "sector", ar: "المجال", en: "Field", max: 120, hint_ar: "مثلاً: طاقة ومياه، طرق وكباري، إسكان.", hint_en: "For example: energy & water, roads & bridges, housing." },
          { k: "value", ar: "القيمة (مليون جنيه)", en: "Value (million EGP)", t: "number", min: 0, max: 1e9 },
          { k: "start", ar: "سنة البداية", en: "Start year", max: 20, im: "numeric" },
          { k: "end", ar: "سنة النهاية المتوقعة", en: "Expected end year", max: 20, im: "numeric" }]],
        [T("الأطراف", "The parties"), [
          { k: "owner", ar: "المالك", en: "Owner", max: 200 },
          { k: "contractor", ar: "المقاول", en: "Contractor", max: 200 },
          { k: "consultant", ar: "الاستشاري", en: "Consultant", max: 200 },
          { k: "update", ar: "آخر خبر عن المشروع", en: "Latest news about the project", t: "textarea", cls: "sm", max: 500, wide: 1 }]],
        [T("المصدر", "The source"), [
          { k: "source_url", ar: "رابط المصدر الرسمي", en: "Official source link", t: "url", max: 500, wide: 1, ltr: 1, hint_ar: "رابط https لخبر أو إعلان رسمي عن المشروع. من غيره بيتحفظ مسودة للإدارة.", hint_en: "An https link to official news or an announcement. Without it the project is saved as a draft for the admins." }]]],
      submit_ar: "🏗️ احفظ المشروع", submit_en: "🏗️ Save the project" },
    tender: { icon: "📑", ar: "إضافة مناقصة", en: "Add a tender", tab_ar: "مناقصة", tab_en: "Tender", coll: "tenders",
      lead_ar: "مناقصة جديدة لصفحة المناقصات. لو كتبت رابط الإعلان الرسمي بتتنشر على طول، ومن غيره بتتحفظ مسودة لحد ما الإدارة توافق.",
      lead_en: "A new tender for the tenders page. With the official notice link it is published at once; without one it is saved as a draft until the admins approve it.",
      secs: [
        [T("المناقصة", "The tender"), [
          { k: "title", ar: "عنوان المناقصة", en: "Tender title", req: 1, max: 300, wide: 1 },
          { k: "title_en", ar: "العنوان بالإنجليزي", en: "Title in English", max: 300, wide: 1, ltr: 1 },
          { k: "type", ar: "النوع", en: "Type", req: 1, t: "select", opts: function () { return opt(TEND_TYPES); } },
          { k: "entity", ar: "الجهة الطارحة", en: "Issuing entity", max: 160 },
          { k: "gov", ar: "المحافظة", en: "Governorate", t: "select", opts: function () { return opt(GOVS); } },
          { k: "sector", ar: "القطاع", en: "Sector", t: "select", opts: function () { return opt(SECTORS); } },
          { k: "deadline", ar: "آخر ميعاد للتقديم", en: "Closing date", t: "date" },
          { k: "booklet", ar: "ثمن كراسة الشروط (جنيه)", en: "Tender booklet price (EGP)", t: "number", min: 0, max: 100000000, int: 1 },
          { k: "bond", ar: "التأمين الابتدائي", en: "Bid bond", max: 60 }]],
        [T("المصدر", "The source"), [
          { k: "source_url", ar: "رابط الإعلان الرسمي", en: "Official notice link", t: "url", max: 500, wide: 1, ltr: 1, hint_ar: "رابط https للإعلان (بوابة التعاقدات الحكومية أو موقع الجهة). من غيره بتتحفظ مسودة للإدارة.", hint_en: "An https link to the notice (the government procurement portal or the entity's site). Without it the tender is saved as a draft for the admins." }]]],
      submit_ar: "📑 احفظ المناقصة", submit_en: "📑 Save the tender" },
    rfq: { icon: "📝", ar: "إضافة طلب عرض سعر (RFQ)", en: "Add a request for quotation (RFQ)", tab_ar: "طلب عرض سعر", tab_en: "RFQ", coll: "rfqs",
      lead_ar: "طلب عرض سعر يتعرض في صفحة «طلبات الأسعار» عشان المصانع المسجّلة تقدّم عليه. بيانات العميل مش بتتنشر. لو عايز الطلب يتبعت للمصانع المطابقة على طول استخدم «طلبية لعميل في المقر».",
      lead_en: "A request for quotation shown on the «RFQs» page so registered factories can bid. The client's details are never published. To send it straight to matching factories use «Order for a client at the office».",
      secs: [
        [T("الطلب اللي بيتنشر", "The published request"), [
          { k: "title", ar: "عنوان الطلب", en: "Request title", req: 1, max: 300, wide: 1, hint_ar: "مثلاً: توريد 200 طن حديد تسليح.", hint_en: "For example: supply of 200 tons of rebar." },
          { k: "details", ar: "التفاصيل والمواصفات", en: "Details and specifications", t: "textarea", max: 2000, wide: 1 },
          { k: "qty", ar: "الكمية", en: "Quantity", max: 60 },
          { k: "delivery", ar: "مكان التسليم", en: "Delivery place", max: 120 },
          { k: "deadline", ar: "آخر ميعاد للعروض", en: "Offers due by", t: "date", future: 1 },
          { k: "gov", ar: "المحافظة", en: "Governorate", t: "select", opts: function () { return opt(GOVS); } },
          { k: "sector", ar: "القطاع", en: "Sector", t: "select", opts: function () { return opt(SECTORS); } }]],
        [T("بيانات العميل (للإدارة بس — مش بتتنشر)", "Client details (admins only — never published)"), [
          { k: "p.client", ar: "اسم العميل أو الشركة", en: "Client or company", max: 160 },
          { k: "p.phone", ar: "رقم الموبايل", en: "Mobile number", t: "tel", max: 30 },
          { k: "p.email", ar: "الإيميل", en: "E-mail", t: "email", max: 254 }]],
        [T("المصدر", "The source"), [
          { k: "source_url", ar: "رابط مستند رسمي", en: "Official document link", t: "url", max: 500, wide: 1, ltr: 1, hint_ar: "اختياري. من غيره الطلب بيتحفظ مسودة لحد ما الإدارة توافق.", hint_en: "Optional. Without it the request is saved as a draft until the admins approve it." }]]],
      submit_ar: "📝 احفظ الطلب", submit_en: "📝 Save the request" }
  };
  var VIEWS = ["order", "member", "project", "tender", "rfq", "mine"];

  /* ---------- rendering ---------- */
  /* the GCC states of the requested plan (Premium = Egypt + 3): how many, from the plans matrix (data/plan.js + data/plans-live.js) */
  function gccPick(k) { var P = window.MIGPLAN; return P && P.gccPickOf && k ? P.gccPickOf(k) : 0; }
  function gccField(fid, f) {
    var hint = EN ? f.hint_en : f.hint_ar;
    return '<div class="tm-f wide" data-f="' + esc(f.k) + '" data-gcc="1" hidden><div data-k="' + esc(f.k) + '" class="tm-gcc"></div>' + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + '<span class="er" role="alert"></span></div>';
  }
  /* (re)draw the picker for the plan chosen in the form; the ticked states stay */
  function gccToggle(f) {
    var w = f && f.querySelector('[data-gcc="1"]'), sel = f && f.querySelector('[data-k="requested_plan"]'), P = window.MIGPLAN; if (!w || !sel) return;
    var n = gccPick(sel.value), box = w.querySelector(".tm-gcc"), keep = gccVals(f); w.hidden = !n;
    if (!n || !P || !P.gccPicker) { box.innerHTML = ""; box.removeAttribute("data-pick"); return; }
    if (+box.getAttribute("data-pick") === n && box.querySelector("fieldset")) return;
    box.innerHTML = P.gccPicker({ id: "tm-" + f.getAttribute("data-form") + "-gcc", pick: n, selected: keep.slice(0, n), legend: (EN ? "Gulf states for the Premium plan (pick " + n + ")" : "دول الخليج للباقة المميزة (اختار " + n + ")"), hint: false }); box.setAttribute("data-pick", n);
    if (P.gccBind) P.gccBind(box.querySelector("fieldset"), { pick: n });
  }
  function gccVals(f) { return [].slice.call(f ? f.querySelectorAll('[data-gcc="1"] input[type="checkbox"]') : []).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); }
  function fieldHtml(fid, f) {
    if (f.t === "gcc") return gccField(fid, f);
    var id = "tm-" + fid + "-" + f.k.replace(/\W/g, "_"), lb = EN ? f.en : f.ar, t = f.t || "text", attrs = ' id="' + id + '" name="' + esc(f.k) + '" data-k="' + esc(f.k) + '"' + (f.req ? ' required aria-required="true"' : "") + (f.ltr ? ' dir="ltr"' : t === "email" || t === "tel" || t === "url" ? ' dir="ltr"' : ' dir="auto"');
    var hint = EN ? f.hint_en : f.hint_ar, inner;
    if (t === "select") inner = "<select" + attrs + ">" + f.opts().map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>";
    else if (t === "textarea") inner = "<textarea" + attrs + (f.cls ? ' class="' + f.cls + '"' : "") + ' maxlength="' + (f.max || 2000) + '"></textarea>';
    else inner = '<input type="' + (t === "number" ? "number" : t) + '"' + attrs + (f.max && t !== "number" ? ' maxlength="' + f.max + '"' : "") + (t === "number" ? ' min="' + (f.min || 0) + '"' + (f.int ? ' step="1"' : ' step="any"') + ' inputmode="decimal"' : "") + (f.im ? ' inputmode="' + f.im + '"' : "") + (f.ac ? ' autocomplete="' + f.ac + '"' : t === "email" ? ' autocomplete="email"' : t === "tel" ? ' autocomplete="tel"' : ' autocomplete="off"') + (f.list ? ' list="' + f.list + '"' : "") + (t === "date" && f.future ? ' min="' + cairoToday() + '"' : "") + ">";
    return '<label class="tm-f' + (f.wide ? " wide" : "") + '" data-f="' + esc(f.k) + '"><span class="lb"><span>' + esc(lb) + (f.req ? ' <span class="req" aria-hidden="true">*</span>' : "") + "</span>" + (f.req ? "" : '<span class="opt">' + esc(T("اختياري", "optional")) + "</span>") + "</span>" + inner + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + '<span class="er" role="alert"></span></label>';
  }
  function formHtml(fid) {
    var F = FORMS[fid];
    return '<form class="tm-card" data-form="' + fid + '" novalidate><div class="tm-h"><h2>' + F.icon + " " + esc(EN ? F.en : F.ar) + '</h2><button type="button" class="btn btn-line btn-sm" data-act="home">' + esc(T("← كل الأقسام", "← All sections")) + "</button></div>"
      + '<p class="tm-lead">' + esc(EN ? F.lead_en : F.lead_ar) + "</p>"
      + F.secs.map(function (s) { return '<div class="tm-sec"><h3>' + esc(s[0]) + '</h3><div class="tm-grid">' + s[1].map(function (f) { return fieldHtml(fid, f); }).join("") + "</div></div>"; }).join("")
      + '<p class="hint" style="color:var(--muted);font-size:.85rem">' + esc(T("الخانات اللي عليها * لازم تتملا.", "Fields marked * are required.")) + "</p>"
      + '<div class="tm-msgbox" id="tmMsg-' + fid + '" aria-live="polite"></div>'
      + '<div class="tm-acts"><button class="btn btn-green tm-big" type="submit">' + esc(EN ? F.submit_en : F.submit_ar) + '</button><button class="btn btn-line" type="button" data-act="clear" data-f="' + fid + '">' + esc(T("امسح الفورم", "Clear the form")) + "</button></div></form>"
      + '<div id="tmRes-' + fid + '" aria-live="polite"></div>';
  }
  function tilesHtml() {
    var mineN = S.mine && typeof S.mine.total === "number" ? S.mine.total : null;
    return '<div class="tm-tiles" role="list">' + ["order", "member", "project", "tender", "rfq"].map(function (k) { var F = FORMS[k]; return '<button type="button" class="tm-tile" role="listitem" data-go="' + k + '"><span class="ic" aria-hidden="true">' + F.icon + "</span><b>" + esc(EN ? F.en : F.ar) + "</b><small>" + esc(EN ? F.lead_en : F.lead_ar).split(/[.:]|\s—\s/)[0] + "</small></button>"; }).join("")
      + '<button type="button" class="tm-tile" role="listitem" data-go="mine"><span class="ic" aria-hidden="true">📂</span><b>' + esc(T("إدخالاتي", "My entries")) + (mineN != null ? ' <span class="tm-c b">' + nf(mineN) + "</span>" : "") + "</b><small>" + esc(T("كل اللي سجّلته بحالته ورقمه ورابطه", "Everything you entered, with its status, number and link")) + "</small></button></div>";
  }
  function tabsHtml() {
    return '<nav class="tm-tabs" role="tablist" aria-label="' + esc(T("أقسام مكتب الاستقبال", "Front-desk sections")) + '"><button type="button" class="tm-tab" role="tab" data-go="home" aria-selected="' + (S.view === "home") + '">🏠 ' + esc(T("الرئيسية", "Home")) + "</button>"
      + VIEWS.map(function (k) { var F = FORMS[k], lb = F ? (EN ? F.tab_en : F.tab_ar) : T("إدخالاتي", "My entries"), ic = F ? F.icon : "📂"; return '<button type="button" class="tm-tab" role="tab" data-go="' + k + '" aria-selected="' + (S.view === k) + '"><span aria-hidden="true">' + ic + "</span>" + esc(lb) + "</button>"; }).join("") + "</nav>";
  }
  function shell() {
    app.innerHTML = '<div class="tm-ban" id="tmBan" aria-live="polite"></div>' + tabsHtml() + '<datalist id="tmUnits">' + UNITS.map(function (u) { return '<option value="' + esc(EN ? u[1] : u[0]) + '"></option>'; }).join("") + '</datalist><div id="tmView"></div>';
    paintBanner();
  }
  function paintBanner() {
    var b = document.getElementById("tmBan"); if (!b) return;
    b.innerHTML = S.off ? '<div class="tm-msg warn" role="status">⚠️ ' + esc(T("مكتب الاستقبال مش متصل بسيرفر المنصة دلوقتي. تقدر تملا الفورم، بس مفيش أي حاجة هتتحفظ غير لما السيرفر يرد — وهنقولك النتيجة الحقيقية.", "The front desk cannot reach the platform's server right now. You can fill in a form, but nothing is saved until the server answers — and we will show you its real answer.")) + ' <button type="button" class="tm-lnk" data-act="retry-conn">↻ ' + esc(T("جرّب الاتصال تاني", "Try the connection again")) + "</button></div>" : "";
  }
  function go(v, push) {
    if (VIEWS.indexOf(v) < 0) v = "home";
    saveDraft(); S.view = v;
    if (push !== false) { try { history.replaceState(null, "", location.pathname + location.search + (v === "home" ? "" : "#" + v)); } catch (e) {} }
    [].forEach.call(app.querySelectorAll(".tm-tab"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-go") === v ? "true" : "false"); });
    var el = document.getElementById("tmView"); if (!el) return;
    if (v === "home") el.innerHTML = '<div class="tm-card"><h2>' + esc(T("أهلاً بيك في مكتب الاستقبال", "Welcome to the front desk")) + '</h2><p class="tm-lead">' + esc(T("اختار اللي عايز تعمله. كل نتيجة بتشوفها هي رد السيرفر الحقيقي (رقم الطلب، عدد المصانع اللي اتبعتلها، منشور ولا مسودة).", "Choose what you want to do. Every result you see is the server's real answer (the reference, how many factories it was sent to, published or draft).")) + "</p></div>" + tilesHtml();
    else if (v === "mine") { el.innerHTML = mineShell(); loadMine(); }
    else { el.innerHTML = formHtml(v); restoreDraft(v); gccToggle(formEl(v)); if (S.res[v]) document.getElementById("tmRes-" + v).innerHTML = S.res[v]; }
    var a = el.querySelector("h2"); if (a && push !== false) { try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) {} }
  }
  /* switching sections keeps what was typed (in memory only — never in browser storage: client data stays on the server) */
  function formEl(v) { return app.querySelector('form[data-form="' + (v || S.view) + '"]'); }
  function saveDraft() { var f = formEl(); if (!f) return; if (S.user) S.draftOwner = S.user.id; var o = {}; [].forEach.call(f.querySelectorAll("[data-k]"), function (x) { o[x.getAttribute("data-k")] = x.type === "checkbox" ? x.checked : x.value; }); S.forms[S.view] = o; }
  function restoreDraft(v) { var o = S.forms[v], f = formEl(v); if (!o || !f) return; [].forEach.call(f.querySelectorAll("[data-k]"), function (x) { var k = x.getAttribute("data-k"); if (o[k] !== undefined) { if (x.type === "checkbox") x.checked = !!o[k]; else x.value = o[k]; } }); }

  /* ---------- validation ---------- */
  function fieldsOf(fid) { var out = []; FORMS[fid].secs.forEach(function (s) { out = out.concat(s[1]); }); return out; }
  function setErr(f, k, msg) {
    var lab = f.querySelector('[data-f="' + k + '"]'); if (!lab) return false;
    lab.classList.toggle("bad", !!msg); var er = lab.querySelector(".er"); if (er) er.textContent = msg || "";
    var inp = lab.querySelector("[data-k]"); if (inp) { if (msg) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid"); }
    return true;
  }
  function phoneOk(v) { return /^(\+|00)?\d{8,15}$/.test(v); }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254; }
  function urlOk(v) { if (!/^https:\/\/[^\s"'<>`]+$/i.test(v) || v.length > 500) return false; try { var u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !!u.hostname && u.hostname.indexOf(".") > 0; } catch (e) { return false; } }
  function collect(fid) {
    var f = formEl(fid), vals = {}, errs = [];
    fieldsOf(fid).forEach(function (d) {
      var el = f.querySelector('[data-k="' + d.k + '"]'); if (!el) return;
      if (d.t === "gcc") {
        var w = f.querySelector('[data-gcc="1"]'), cs = gccVals(f), gn = w && !w.hidden ? +(el.getAttribute("data-pick") || 0) : 0, gm = gn && cs.length !== gn ? T("اختار " + gn + " دول خليجية بالظبط.", "Choose exactly " + gn + " Gulf states.") : "";
        setErr(f, d.k, gm); var fs = el.querySelector("fieldset"); if (fs) { if (gm) fs.setAttribute("aria-invalid", "true"); else fs.removeAttribute("aria-invalid"); }
        if (gm) errs.push(d.k); else if (gn) vals[d.k] = cs; return;
      }
      var t = d.t || "text", v = t === "textarea" ? clean(el.value) : line(el.value), m = "";
      if (t === "tel" || t === "number" || d.im) v = ascii(v);
      if (t === "tel") v = v.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
      if (!v) { if (d.req) m = t === "select" ? T("اختار من القايمة.", "Choose from the list.") : T("الخانة دي لازم تتملا.", "This field is required."); }
      else if (t === "email" && !emailOk(v)) m = T("اكتب إيميل صحيح (زي name@company.com).", "Enter a valid e-mail (like name@company.com).");
      else if (t === "tel" && !phoneOk(v)) m = T("اكتب رقم موبايل صحيح (8 لـ 15 رقم).", "Enter a valid phone number (8 to 15 digits).");
      else if (t === "url" && !urlOk(v)) m = T("الرابط لازم يبدأ بـ https:// ويكون رابط كامل.", "The link must be a full address starting with https://.");
      else if (t === "date" && (!/^\d{4}-\d\d-\d\d$/.test(v) || isNaN(Date.parse(v + "T12:00:00Z")))) m = T("التاريخ مش صحيح.", "The date is not valid.");
      else if (t === "date" && d.future && v < cairoToday()) m = T("التاريخ ده عدّى. اختار النهارده أو بعده.", "This date has passed. Choose today or later.");
      else if (t === "number" && (!isFinite(+v) || +v < (d.min || 0) || (d.max != null && +v > d.max) || (d.int && Math.floor(+v) !== +v))) m = T("اكتب رقم صحيح" + (d.int ? " (من غير كسور)" : "") + ".", "Enter a valid number" + (d.int ? " (no fractions)" : "") + ".");
      else if (d.max && v.length > d.max) m = T("أطول من المسموح (" + d.max + " حرف).", "Longer than allowed (" + d.max + " characters).");
      else if (d.pattern && !d.pattern.test(v)) m = T("الرقم ده مش بشكل أرقام الدليل (مثلاً 1234).", "This is not a directory number (for example 1234).");
      setErr(f, d.k, m);
      if (m) errs.push(d.k); else if (v !== "") vals[d.k] = t === "number" ? +v : v;
    });
    return { vals: vals, errs: errs, f: f };
  }
  function pick(vals, keys) { var o = {}; keys.forEach(function (k) { if (vals[k] !== undefined && vals[k] !== "") o[k.replace(/^.*\./, "")] = vals[k]; }); return o; }
  function bodyOf(fid, v) {
    if (fid === "order") {
      var b = pick(v, ["product", "quantity", "unit", "details", "deadline", "target_company_ref"]);
      b.buyer = pick(v, ["buyer.name", "buyer.company", "buyer.phone", "buyer.email", "buyer.governorate", "buyer.type"]);
      return b;
    }
    if (fid === "member") return pick(v, ["company", "contact_name", "title", "email", "phone", "sector", "governorate", "products", "requested_plan", "gcc"]);
    var F = FORMS[fid], item, priv = null;
    if (fid === "project") {
      item = pick(v, ["name", "city", "sector", "value", "owner", "contractor", "consultant", "start", "end", "source_url"]);
      item.stage = +v.stage;
      if (v.gov) item.region = "محافظة " + govName(v.gov);
      if (v.update) item.updates = [[cairoToday(), v.update]];
    } else if (fid === "tender") {
      item = pick(v, ["type", "title", "title_en", "entity", "gov", "sector", "deadline", "booklet", "bond", "source_url"]);
      if (v.gov) item.gov_name = govName(v.gov);
    } else {
      item = pick(v, ["title", "details", "qty", "delivery", "deadline", "gov", "sector"]);
      /* the walk-in client's contact: content.js deskCreate moves client / phone / email / channel out of the item into the admin-only
         private part (never compiled into the public overlay) */
      var p = pick(v, ["p.client", "p.phone", "p.email"]); for (var pk in p) if (own(p, pk)) item[pk] = p[pk]; item.channel = "desk";
    }
    var body = { collection: F.coll, item: item };
    if (priv) body["private"] = priv;
    if (v.source_url) body.source_url = v.source_url;
    return body;
  }
  var PATHS = { order: "/team/desk/inquiry", member: "/team/desk/member", project: "/team/desk/content", tender: "/team/desk/content", rfq: "/team/desk/content" };

  /* ---------- submit: only the server's answer counts ---------- */
  function submit(fid) {
    if (S.busy[fid]) return;
    var c = collect(fid), f = c.f, box = document.getElementById("tmMsg-" + fid), res = document.getElementById("tmRes-" + fid);
    S.res[fid] = ""; if (res) res.innerHTML = "";
    if (c.errs.length) {
      box.innerHTML = '<div class="tm-msg bad" role="alert">' + esc(T("فيه " + c.errs.length + " خانة محتاجة تتصلّح (معلّمة بالأحمر). محصلش أي حفظ.", c.errs.length + " field(s) need fixing (marked in red). Nothing was saved.")) + "</div>";
      var first = f.querySelector('[aria-invalid="true"]'); if (first) { try { first.focus(); } catch (e) {} }
      return;
    }
    var btn = f.querySelector('button[type="submit"]'), body = bodyOf(fid, c.vals);
    S.busy[fid] = true; btn.disabled = true;
    box.innerHTML = '<div class="tm-msg info" role="status">⏳ ' + esc(T("بنبعت للسيرفر… استنى رده.", "Sending to the server… waiting for its answer.")) + "</div>";
    call("POST", PATHS[fid], body).then(function (j) {
      var html = resultHtml(fid, j, c.vals);
      if (!html) throw { code: "bad_response", status: 200, error: T("السيرفر مارجّعش تأكيد واضح", "the server did not return a clear confirmation") };
      box.innerHTML = ""; S.res[fid] = html; S.forms[fid] = null;
      f.reset(); fieldsOf(fid).forEach(function (d) { setErr(f, d.k, ""); });
      if (res) { res.innerHTML = html; try { res.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {} }
      S.off = false; paintBanner(); S.mine = null; toast(T("السيرفر أكّد الحفظ.", "The server confirmed the save."));
    }).then(null, function (e) {   /* (a separate step: the «bad_response» thrown above lands here too) */
      if (e.code === "bad_response") { box.innerHTML = '<div class="tm-msg bad" role="alert">' + esc(T("السيرفر رد من غير رقم أو حالة، فمش هنعتبرها اتحفظت. راجع «إدخالاتي» قبل ما تعيد.", "The server answered without a reference or a status, so we do not count it as saved. Check «My entries» before trying again.")) + "</div>"; return; }
      if (e.status === 409 && fid === "member") { box.innerHTML = existsHtml(e.j); return; }
      var marked = 0;
      (e.errors || []).forEach(function (x) { if (x && x.field && markServerErr(f, fid, x.field, x.msg)) marked++; });
      if (e.j && e.j.field && markServerErr(f, fid, e.j.field, e.error)) marked++;
      if (e.code === "offline") { S.off = true; paintBanner(); }
      box.innerHTML = '<div class="tm-msg bad" role="alert">' + esc(errText(e)) + (e.code && e.code !== "offline" ? '<small dir="ltr">' + esc(e.code + (e.status ? " · HTTP " + e.status : "")) + "</small>" : "") + "</div>";
      if (marked) { var first = f.querySelector('[aria-invalid="true"]'); if (first) { try { first.focus(); } catch (x) {} } }
    }).then(function () { S.busy[fid] = false; if (btn) btn.disabled = false; });
  }
  /* a server field name ("buyer.phone", "item.title", "title", "private.phone") → the field on the form */
  function markServerErr(f, fid, field, msg) {
    var k = String(field), cands = [k, k.replace(/^item\./, ""), k.replace(/^private\./, "p."), "buyer." + k.replace(/^buyer\./, ""), k.replace(/^.*\./, "")];
    if (fid === "project" && /region/.test(k)) cands.push("gov");
    if (fid === "project" && /updates/.test(k)) cands.push("update");
    for (var i = 0; i < cands.length; i++) if (setErr(f, cands[i], msg || T("القيمة دي مش مقبولة.", "This value is not accepted."))) return true;
    return false;
  }
  function existsHtml(j) {
    var m = (j && (j.member || j.existing)) || {}, rows = [];
    var L = { company: T("الشركة", "Company"), name: T("الاسم", "Name"), contact_name: T("المسؤول", "Contact"), plan: T("الباقة الحالية", "Current plan"), plan_name: T("الباقة", "Plan"), requested_plan: T("الباقة المطلوبة", "Requested plan"), status: T("الحالة", "Status"), since: T("مسجّل من", "Registered since"), created_at: T("اتسجّل", "Registered"), member_id: T("رقم العضو", "Member id"), id: T("رقم العضو", "Member id"), governorate: T("المحافظة", "Governorate"), sector: T("القطاع", "Sector") };
    for (var k in L) if (own(L, k) && m[k] != null && m[k] !== "" && typeof m[k] !== "object") rows.push("<div><span>" + esc(L[k]) + "</span>" + (k === "created_at" || k === "since" ? fdate(m[k]) : k === "status" ? esc(memberStatus(m[k])) : k === "plan" || k === "requested_plan" ? esc(planName(m[k])) : k === "governorate" && govName(m[k], EN) ? esc(govName(m[k], EN)) : '<b dir="auto">' + esc(m[k]) + "</b>") + "</div>");
    return '<div class="tm-res bad" role="alert"><h3>⚠️ ' + esc(T("الإيميل ده متسجّل قبل كده", "This e-mail is already registered")) + "</h3><p>" + esc(T("مفيش عضو جديد اتعمل. ده ملخّص العضو الموجود:", "No new member was created. This is the existing member:")) + "</p>"
      + (rows.length ? '<div class="tm-kv">' + rows.join("") + "</div>" : "<p>" + esc(T("السيرفر مابعتش تفاصيل.", "The server sent no details.")) + "</p>")
      + '<p class="tm-lead">' + esc(T("لو محتاج تعديل في الباقة أو التفعيل، دي حاجة الإدارة بتعملها من لوحة الإدارة.", "Plan changes or activation are done by the admins in the admin panel.")) + "</p></div>";
  }
  function planName(k) { var P = window.MIGPLAN && window.MIGPLAN.PL && window.MIGPLAN.PL[String(k || "").toLowerCase()]; return P ? (EN ? P.en : P.n) : String(k || "—"); }
  function memberStatus(s) { return ({ pending: T("بانتظار التفعيل", "Pending activation"), active: T("نشط", "Active"), suspended: T("موقوف", "Suspended"), removed: T("اتشال", "Removed") })[s] || s || "—"; }
  function contentState(s) { return ({ published: T("منشور", "Published"), draft: T("بانتظار موافقة الإدارة", "Waiting for admin approval"), pending: T("بانتظار موافقة الإدارة", "Waiting for admin approval"), hidden: T("مخفي", "Hidden"), rejected: T("مرفوض", "Rejected"), deleted: T("اتحذف", "Deleted") })[s] || s || "—"; }
  function inqStatus(s) { return A && A.ui && A.ui.statusLabel ? A.ui.statusLabel(s) || s : s; }
  function stateCls(s) { s = String(s || ""); return /^(published|active|routed|replied|quoted|sent|recorded)$/.test(s) ? "g" : /^(draft|pending|received|in_progress|no_match|waiting)$/.test(s) ? "a" : /^(rejected|suspended|blocked|failed|deleted|removed)$/.test(s) ? "r" : "b"; }
  function money(minor) { var n = Math.round((+minor || 0) / 100); return nf(n) + " " + T("جنيه", "EGP"); }
  function safeLink(u) { u = String(u || ""); return /^https:\/\/[^\s"'<>`]+$/i.test(u) || /^\/(?!\/)[^\s"'<>`]*$/.test(u) ? u : ""; }
  function resultHtml(fid, j, v) {
    if (!j || j.ok !== true) return "";
    var again = '<div class="tm-acts"><button type="button" class="btn btn-green" data-act="again" data-f="' + fid + '">➕ ' + esc(T("إدخال جديد", "New entry")) + '</button><button type="button" class="btn btn-line" data-go="mine">📂 ' + esc(T("إدخالاتي", "My entries")) + "</button></div>";
    if (fid === "order") {
      if (!j.ref) return "";
      var routed = typeof j.routed === "number" ? j.routed : null, st = String(j.status || "");
      var rt = routed == null ? T("السيرفر مابعتش عدد المصانع.", "The server did not say how many factories.") : routed > 0 ? T("اتبعتت تلقائياً لـ " + nf(routed) + (routed === 1 ? " مصنع مسجّل مطابق." : routed === 2 ? " مصنعين مسجّلين مطابقين." : " مصانع مسجّلة مطابقة."), "Sent automatically to " + nf(routed) + " matching registered " + (routed === 1 ? "factory." : "factories."))
        : T("مفيش مصنع مسجّل مطابق دلوقتي، فالطلب اتعلّم «محتاج متابعة الفريق» والإدارة هتدوّر وترد على العميل.", "No matching registered factory right now, so the request is flagged «needs the team» and the admins will look for one and answer the client.");
      var rc = j.receipt_to === "buyer" ? T("إيصال الاستلام والردود بتروح على إيميل العميل تلقائياً.", "The receipt and the answers go to the client's e-mail automatically.") : j.receipt_to === "team" ? T("العميل مكتبش إيميل، فالإيصال والردود بتوصل لفريق المنصة: اديله رقم الطلب عشان يتابع.", "The client gave no e-mail, so the receipt and the answers reach the platform team: give the client the reference to follow up.") : (v["buyer.email"] ? "" : T("اديله رقم الطلب عشان يتابع.", "Give the client the reference to follow up."));
      var tl = safeLink(j.track_url || j.link);
      return '<div class="tm-res' + (routed === 0 ? " draft" : "") + '" role="status"><h3>✅ ' + esc(T("السيرفر سجّل الطلبية", "The server recorded the order")) + "</h3><div>" + esc(T("رقم الطلب: ", "Reference: ")) + '<span class="tm-ref">' + esc(j.ref) + "</span></div>"
        + '<div class="tm-kv"><div><span>' + esc(T("الحالة", "Status")) + "</span>" + chip(inqStatus(st) || "—", stateCls(st)) + "</div><div><span>" + esc(T("المصانع اللي اتبعتلها", "Factories it was sent to")) + "</span><b>" + (routed == null ? "—" : nf(routed)) + "</b></div></div>"
        + "<p>" + esc(rt) + "</p>" + (rc ? '<p class="tm-lead">' + esc(rc) + "</p>" : "")
        + (tl ? '<p><a href="' + esc(tl) + '" target="_blank" rel="noopener">' + esc(T("صفحة تتبّع الطلب ↗", "Request tracking page ↗")) + "</a></p>" : "") + again + "</div>";
    }
    if (fid === "member") {
      if (j.member_id == null || j.member_id === "") return "";
      var inv = j.invoice && j.invoice.no ? j.invoice : null;
      var mail = j.welcome_sent === true ? T("اتبعتله إيميل الترحيب والدخول على ", "The welcome and sign-in e-mail was sent to ") : j.welcome_sent === false ? T("إيميل الترحيب ماتبعتش (خدمة البريد مش جاهزة) — الإدارة تقدر تبعته من لوحة الإدارة. الإيميل: ", "The welcome e-mail was not sent (the mail service is not ready) — the admins can send it from the admin panel. E-mail: ") : T("السيستم بيبعت إيميل الترحيب والدخول على ", "The system sends the welcome and sign-in e-mail to ");
      return '<div class="tm-res draft" role="status"><h3>✅ ' + esc(T("السيرفر سجّل العضو", "The server registered the member")) + "</h3><div>" + esc(T("رقم العضو: ", "Member id: ")) + '<span class="tm-ref">' + esc(j.member_id) + "</span></div>"
        + '<div class="tm-kv"><div><span>' + esc(T("الحالة", "Status")) + "</span>" + chip(memberStatus(j.status), stateCls(j.status)) + "</div><div><span>" + esc(T("الباقة المطلوبة", "Requested plan")) + "</span><b>" + esc(planName(j.requested_plan || v.requested_plan)) + "</b></div>"
        + (inv ? "<div><span>" + esc(T("الفاتورة", "Invoice")) + '</span><b dir="ltr">' + esc(inv.no) + "</b>" + (inv.total_minor ? " · " + esc(money(inv.total_minor)) : "") + "</div>" : "") + "</div>"
        + '<p class="tm-lead">' + esc(mail) + '<b dir="ltr">' + esc(v.email || "") + "</b>. " + esc(inv ? T("الفاتورة اتعملت تلقائياً؛ التفعيل بيتم بعد الدفع أو من الإدارة.", "The invoice was issued automatically; activation follows the payment or an admin.") : T("التفعيل من الإدارة — بوابة الدفع لسه بتتجهّز.", "Activation is done by the admins — the payment gateway is still being set up.")) + "</p>" + again + "</div>";
    }
    if (j.id == null || j.id === "") return "";
    var pub = j.state === "published", dr = j.state === "draft", lk = safeLink(j.link), ref = j.ref || j.id;
    return '<div class="tm-res' + (pub ? "" : " draft") + '" role="status"><h3>' + (pub ? "✅ " + esc(T("اتنشر على الموقع", "Published on the site")) : dr ? "📝 " + esc(T("اتحفظ مسودة", "Saved as a draft")) : "✅ " + esc(T("السيرفر سجّله", "The server recorded it"))) + "</h3><div>" + esc(T("الرقم: ", "Number: ")) + '<span class="tm-ref">' + esc(ref) + "</span></div>"
      + "<p>" + esc(pub ? T("بيظهر في الموقع خلال دقيقتين تقريباً.", "It shows on the site within about two minutes.") : dr ? (j.publish_error ? T("اتحفظ، بس النشر ماتمّش (", "Saved, but publishing did not go through (") + j.publish_error + T(") — هيظهر للإدارة في الموافقات.", ") — it shows to the admins under approvals.") : T("مستني موافقة الإدارة في لوحة الإدارة قبل ما يتنشر.", "It waits for the admins' approval in the admin panel before it is published.")) : T("حالته: ", "Its state: ") + (j.state || "—")) + "</p>"
      + ((j.warnings || []).length ? '<p class="tm-lead">⚠️ ' + j.warnings.map(function (w) { return esc(w && (w.msg || w.code) || w); }).join(" · ") + "</p>" : "")
      + (lk ? '<p><a href="' + esc(lk) + '" target="_blank" rel="noopener">' + esc(T("افتحه على الموقع ↗", "Open it on the site ↗")) + "</a></p>" : "") + again + "</div>";
  }

  /* ---------- «إدخالاتي»: the caller's own entries ---------- */
  var KIND_L = { "": [T("الكل", "All")], inquiry: [T("طلبيات", "Orders")], member: [T("أعضاء", "Members")], content: [T("مشاريع ومناقصات وطلبات", "Projects, tenders & RFQs")] };
  function mineShell() {
    return '<section class="tm-card"><div class="tm-h"><h2>📂 ' + esc(T("إدخالاتي", "My entries")) + '</h2><button type="button" class="btn btn-line btn-sm" data-act="mine-reload">↻ ' + esc(T("تحديث", "Refresh")) + "</button></div>"
      + '<p class="tm-lead">' + esc(T("كل اللي سجّلته من الحساب ده بس، بحالته الحالية على السيرفر.", "Only what you entered from this account, with its current state on the server.")) + "</p>"
      + '<div class="tm-seg" role="group" aria-label="' + esc(T("النوع", "Kind")) + '">' + ["", "inquiry", "member", "content"].map(function (k) { return '<button type="button" data-act="mine-kind" data-k="' + k + '" aria-pressed="' + (S.mq.kind === k) + '">' + esc(KIND_L[k][0]) + "</button>"; }).join("") + "</div>"
      + '<div id="tmMine" aria-live="polite"><p class="tm-load">⏳ ' + esc(T("جارٍ التحميل…", "Loading…")) + "</p></div></section>";
  }
  function loadMine() {
    var el = document.getElementById("tmMine"); if (!el) return;
    el.innerHTML = '<p class="tm-load">⏳ ' + esc(T("جارٍ التحميل…", "Loading…")) + "</p>";
    var q = "?page=" + S.mq.page + "&limit=20" + (S.mq.kind ? "&kind=" + encodeURIComponent(S.mq.kind) : "");
    call("GET", "/team/desk/mine" + q).then(function (j) {
      if (!S.mq.kind && !S.mq.page) S.mine = j;
      S.off = false; paintBanner(); paintMine(j);
    }, function (e) {
      if (e.code === "offline") { S.off = true; paintBanner(); }
      var x = document.getElementById("tmMine"); if (x) x.innerHTML = '<div class="tm-msg bad" role="alert">' + esc(e.code === "offline" ? T("ماقدرناش نجيب إدخالاتك من السيرفر دلوقتي. جرّب تاني بعد شوية.", "We couldn't get your entries from the server right now. Try again shortly.") : errText(e)) + "</div>";
    });
  }
  function kindOf(it) { var k = String(it.kind || it.type || "").toLowerCase(); if (/inq|order/.test(k)) return "inquiry"; if (/member/.test(k)) return "member"; if (k) return "content"; return it.member_id ? "member" : "content"; }
  var COLL_L = { tenders: T("مناقصة", "Tender"), tend: T("مناقصة", "Tender"), projects: T("مشروع", "Project"), proj: T("مشروع", "Project"), rfqs: T("طلب عرض سعر", "RFQ"), rfq: T("طلب عرض سعر", "RFQ") };
  function linkOf(it, k) {
    var u = safeLink(it.link || it.url || it.track_url);
    if (u) return u;
    if (k === "inquiry" && it.ref && (S.role === "admin" || S.role === "owner")) return "/inbox/#" + encodeURIComponent(it.ref);
    return "";
  }
  /* a human title: the content's title, the member's company, the order's product (the audit summary minus its English prefix) */
  function titleOf(it, k) {
    if (k === "member") return it.company || it.title || it.name || "";
    if (k === "inquiry") return it.title || it.product || String(it.summary || "").replace(/^walk-in order:\s*/i, "");
    return it.title || it.name || it.summary || "";
  }
  function paintMine(j) {
    var el = document.getElementById("tmMine"); if (!el) return;
    var items = (j && Array.isArray(j.items)) ? j.items : [], total = j && typeof j.total === "number" ? j.total : items.length, lim = (j && +j.limit) || 20, pg = (j && +j.page) || 0;
    if (!items.length) { el.innerHTML = '<div class="tm-empty">' + esc(S.mq.kind || pg ? T("مفيش إدخالات هنا.", "No entries here.") : T("لسه ماسجّلتش أي حاجة من الحساب ده. اختار قسم من فوق وابدأ.", "You have not entered anything from this account yet. Pick a section above to start.")) + "</div>"; return; }
    el.innerHTML = '<p class="tm-lead">' + esc(T("العدد: ", "Total: ")) + "<b>" + nf(total) + "</b></p>" + '<div class="tm-list">' + items.map(function (it) {
      var k = kindOf(it), st = String(it.status || it.state || ""), coll = it.collection || it.coll || "", ref = it.ref || it.id || it.member_id || "", u = linkOf(it, k);
      var kl = k === "inquiry" ? T("طلبية", "Order") : k === "member" ? T("عضو", "Member") : COLL_L[coll] || T("محتوى", "Content");
      var sl = k === "inquiry" ? inqStatus(st) : k === "member" ? memberStatus(st) : (EN ? it.status_en : it.status_ar) || contentState(st);
      return '<article class="tm-row"><div class="top"><span class="t" dir="auto">' + esc(titleOf(it, k) || "—") + "</span>" + (st ? chip(sl, stateCls(st)) : "") + '</div><div class="meta"><span>' + esc(kl) + "</span>" + (ref ? '<span dir="ltr">#' + esc(ref) + "</span>" : "")
        + (k === "inquiry" && typeof it.routed === "number" ? "<span>" + esc(T("اتبعتت لـ ", "Sent to ")) + nf(it.routed) + esc(T(" مصنع", " factories")) + "</span>" : "")
        + (k === "member" && it.requested_plan ? "<span>" + esc(T("طلب: ", "Asked for: ") + planName(it.requested_plan)) + "</span>" : "")
        + "<span>" + fdate(it.at || it.created_at) + "</span>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(T("افتح ↗", "Open ↗")) + "</a>" : "") + "</div>"
        + (it.reject_reason ? '<div class="v"><b>' + esc(T("سبب الرفض: ", "Reason: ")) + '</b><span dir="auto">' + esc(it.reject_reason) + "</span></div>" : "") + "</article>";
    }).join("") + "</div>"
      + (total > lim ? '<div class="tm-pager"><button type="button" class="btn btn-line" data-act="mine-page" data-d="-1"' + (pg <= 0 ? " disabled" : "") + ">‹ " + esc(T("السابق", "Previous")) + "</button><span>" + nf(pg * lim + 1) + "–" + nf(Math.min(total, pg * lim + items.length)) + esc(T(" من ", " of ")) + nf(total) + '</span><button type="button" class="btn btn-line" data-act="mine-page" data-d="1"' + ((pg + 1) * lim >= total ? " disabled" : "") + ">" + esc(T("التالي", "Next")) + " ›</button></div>" : "");
  }

  /* ---------- sign-in, lock box, offline ---------- */
  function paintWho() {
    if (!whoEl) return;
    var u = S.user, h = "";
    if (S.mode === "ready" && u) {
      h = '<span class="chip">👤 <span dir="ltr">' + esc(u.email || "") + "</span> · " + esc(roleName(S.role)) + "</span>";
      if (S.role === "admin" || S.role === "owner") h += '<a class="btn btn-sm" href="/admin/" rel="nofollow">🛠️ ' + esc(T("لوحة التحكم", "Control Center")) + '</a><a class="btn btn-sm" href="/seo-team/" rel="nofollow">🔎 ' + esc(T("لوحة الـ SEO", "SEO board")) + "</a>";
      h += '<button class="btn btn-sm" type="button" data-act="logout">' + esc(T("تسجيل الخروج", "Sign out")) + "</button>";
    }
    whoEl.innerHTML = h;
  }
  function box(icon, title, body, acts) { app.innerHTML = '<div class="tm-card tm-lock"><div class="ic" aria-hidden="true">' + icon + "</div><h2>" + esc(title) + "</h2>" + body + '<div class="tm-acts">' + (acts || "") + "</div></div>"; }
  function signIn(expired, msg) {
    S.mode = "login"; S.user = null; paintWho();
    box("🔐", T("دخول فريق الداتا", "Data team sign-in"), (expired || msg ? '<p class="tm-msg warn">' + esc(msg || T("الجلسة انتهت أو الحساب اتغيّر. ادخل تاني.", "Your session ended or the account changed. Please sign in again.")) + "</p>" : "") + '<p class="tm-lead">' + esc(T("الصفحة دي لفريق الداتا وإدارة المنصة. ادخل ببريد الشغل بتاعك وهيوصلك كود من 6 أرقام — مفيش كلمة سر.", "This page is for the data team and the platform admins. Sign in with your work e-mail and you will get a 6-digit code — no password.")) + "</p>",
      '<button class="btn btn-green tm-big" type="button" data-act="login">🔑 ' + esc(T("الدخول بالبريد (كود من 6 أرقام)", "Sign in with e-mail (6-digit code)")) + "</button>");
  }
  function lockBox(server) {
    S.mode = "denied"; paintWho();
    var u = S.user, tp = teamPage(S.role, S.teamPage);
    box("⛔", T("غير مصرّح لك بدخول هذه الصفحة", "You are not allowed to open this page"),
      (u && u.email ? "<p>" + esc(T("داخل حالياً بـ: ", "Signed in as: ")) + '<b dir="ltr">' + esc(u.email) + "</b></p>" : "")
      + '<p class="tm-lead">' + esc(server ? T("السيرفر أكّد إن الحساب ده مش عليه دور فريق الداتا.", "The server confirmed this account has no data-team role.") : T("الصفحة دي لفريق الداتا (مكتب الاستقبال) وإدارة المنصة بس. لو انت من الفريق، اطلب من المدير يضيف بريدك في «الصلاحيات والفريق» بدور «فريق الداتا».", "This page is for the data team (front desk) and the platform admins only. If you are on the team, ask an admin to add your e-mail under «Roles & team» with the «data team» role.")) + "</p>",
      (tp && tp !== "/data-desk/" ? '<a class="btn btn-green" href="' + esc(tp) + '">' + esc(T("روح للوحة فريقك", "Go to your team board")) + "</a>" : "")
      + '<button class="btn ' + (tp && tp !== "/data-desk/" ? "btn-line" : "btn-green") + '" type="button" data-act="switch">' + esc(T("الدخول بحساب تاني", "Use another account")) + "</button>" + (server ? "" : '<button class="btn btn-line" type="button" data-act="recheck">' + esc(T("اتأكد من السيرفر تاني", "Check with the server again")) + "</button>") + '<a class="btn btn-line" href="/">' + esc(T("الرئيسية", "Home")) + "</a>");
  }
  function offline(msg) {
    S.mode = "offline"; paintWho();
    box("🔌", T("مكتب الاستقبال مش متصل بالسيرفر", "The front desk cannot reach the server"), '<p class="tm-lead">' + esc(msg || T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فمش هنقدر نتأكد من حسابك أو نحفظ أي حاجة. اتأكد من الإنترنت وجرّب تاني.", "We couldn't reach the platform's server right now, so we cannot check your account or save anything. Check the internet connection and try again.")) + "</p>",
      '<button class="btn btn-green tm-big" type="button" data-act="retry">↻ ' + esc(T("حاول تاني", "Try again")) + "</button>");
  }
  function boot() {
    S.mode = "boot"; S.teamPage = ""; paintWho(); app.innerHTML = loading();
    if (!A) { offline(); return; }
    if (!token()) {
      (A.ping ? A.ping() : Promise.reject({ code: "offline" })).then(function (j) {
        if (j && j.auth === false) { offline(T("تسجيل الدخول بالكود مش متفعّل على السيرفر لسه.", "Sign-in with a code is not enabled on the server yet.")); return; }
        signIn(false);
      }, function () { offline(); });
      return;
    }
    A.me().then(function (r) {
      var u = r && r.user; if (!u) { signIn(true); return; }
      S.user = u; var h = hintOf(u); S.role = h || "";
      /* /api/me says this account is not on the data team: the lock box, without asking the desk API (no 403 for ordinary members) */
      if (h !== undefined && !OK_ROLES[h]) { lockBox(false); return; }
      whoami(false, h);
    }, function (e) { if (e && e.code === "offline") offline(); else signIn(true); });
  }
  /* the server decides: GET /api/team/whoami → {role, desk, team_page}; then «إدخالاتي» gives the tile its count */
  function whoami(manual, hint) {
    S.mode = S.mode === "ready" ? "ready" : "boot";
    return call("GET", "/team/whoami", undefined, { quiet: true }).then(function (j) {
      S.role = String((j && j.role) || S.role || "").toLowerCase(); S.teamPage = (j && j.team_page) || "";
      if (j && j.desk === false || (j && j.desk == null && !OK_ROLES[S.role])) { lockBox(true); return; }
      start();
    }, function (e) {
      if (e.status === 401) { signIn(true); return; }
      if (e.status === 403 && (e.code === "use_email_code" || e.code === "full_login_required")) { signIn(true, errText(e)); return; }
      if (e.status === 403) { lockBox(true); return; }
      /* not reachable: a member /api/me already shows on the team may fill the forms (nothing is saved without the server) */
      if (OK_ROLES[hint]) { start(); S.off = true; paintBanner(); return; }
      if (manual) toast(errText(e)); offline();
    });
  }
  function start() {
    /* drafts typed under another account on this tablet are never shown to the next person */
    if (S.draftOwner && S.user && S.user.id !== S.draftOwner) { S.forms = {}; S.res = {}; S.draftOwner = ""; }
    S.mode = "ready"; paintWho(); shell();
    var h = String(location.hash || "").replace(/^#/, ""); go(VIEWS.indexOf(h) >= 0 ? h : "home", false);
    probe();
  }
  /* «إدخالاتي» count (and a second check that the desk API answers) */
  function probe(manual) {
    return call("GET", "/team/desk/mine?page=0&limit=20").then(function (j) {
      S.mine = j; S.off = false;
      if (S.mode !== "ready") { start(); return; }
      paintBanner(); if (S.view === "home") go("home", false); else if (S.view === "mine") paintMine(j);
      if (manual) toast(T("السيرفر متصل.", "The server is connected."));
    }, function (e) {
      if (e.status === 403 && (e.code === "use_email_code" || e.code === "full_login_required")) { signIn(true, errText(e)); return; }
      if (e.status === 403) { lockBox(true); return; }
      if (e.status === 401) return;
      S.off = true; if (S.mode === "ready") paintBanner(); else if (manual) toast(errText(e));
    });
  }

  /* ---------- events ---------- */
  app.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]"); if (g && app.contains(g)) { e.preventDefault(); go(g.getAttribute("data-go")); return; }
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "home") go("home");
    else if (act === "login") { if (A && A.open) A.open({ title: T("دخول فريق الداتا", "Data team sign-in") }).then(function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); }, function () {}); }
    else if (act === "switch") { var p = A && A.logout && token() ? A.logout() : Promise.resolve(); Promise.resolve(p).then(null, function () {}).then(function () { S.user = null; signIn(false); if (A && A.open) A.open({ title: T("دخول فريق الداتا", "Data team sign-in") }).then(function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); }, function () {}); }); }
    else if (act === "recheck") { b.disabled = true; whoami(true).then(function () { b.disabled = false; }); }
    else if (act === "retry") boot();
    else if (act === "retry-conn") probe(true);
    else if (act === "clear") { var f = formEl(b.getAttribute("data-f")); if (f && window.confirm(T("تمسح كل اللي اتكتب في الفورم؟", "Clear everything typed in this form?"))) { f.reset(); S.forms[b.getAttribute("data-f")] = null; fieldsOf(b.getAttribute("data-f")).forEach(function (d) { setErr(f, d.k, ""); }); var mb = document.getElementById("tmMsg-" + b.getAttribute("data-f")); if (mb) mb.innerHTML = ""; } }
    else if (act === "again") { var fid = b.getAttribute("data-f"); S.res[fid] = ""; var r = document.getElementById("tmRes-" + fid); if (r) r.innerHTML = ""; var ff = formEl(fid); if (ff) { var i0 = ff.querySelector("[data-k]"); try { ff.scrollIntoView({ block: "start", behavior: "smooth" }); if (i0) i0.focus(); } catch (x) {} } }
    else if (act === "mine-reload") loadMine();
    else if (act === "mine-kind") { S.mq.kind = b.getAttribute("data-k") || ""; S.mq.page = 0; [].forEach.call(app.querySelectorAll('[data-act="mine-kind"]'), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); loadMine(); }
    else if (act === "mine-page") { S.mq.page = Math.max(0, S.mq.page + (+b.getAttribute("data-d") || 0)); loadMine(); }
  });
  if (whoEl) whoEl.addEventListener("click", function (e) {
    var b = e.target.closest('[data-act="logout"]'); if (!b) return;
    b.disabled = true; var p = A && A.logout ? A.logout() : Promise.resolve();
    Promise.resolve(p).then(null, function () {}).then(function () { S.user = null; S.forms = {}; S.res = {}; signIn(false); });
  });
  app.addEventListener("submit", function (e) { var f = e.target.closest("form[data-form]"); if (!f) return; e.preventDefault(); submit(f.getAttribute("data-form")); });
  app.addEventListener("change", function (e) { if (e.target && e.target.getAttribute && e.target.getAttribute("data-k") === "requested_plan") gccToggle(e.target.closest("form[data-form]")); });
  app.addEventListener("reset", function (e) { var f = e.target; setTimeout(function () { gccToggle(f); }, 0); }, true);
  app.addEventListener("input", function (e) { var lab = e.target.closest && e.target.closest(".tm-f.bad"); if (lab) { lab.classList.remove("bad"); var er = lab.querySelector(".er"); if (er) er.textContent = ""; e.target.removeAttribute("aria-invalid"); } });
  window.addEventListener("hashchange", function () { if (S.mode !== "ready") return; var h = String(location.hash || "").replace(/^#/, ""); if ((VIEWS.indexOf(h) >= 0 ? h : "home") !== S.view) go(VIEWS.indexOf(h) >= 0 ? h : "home", false); });
  window.addEventListener("mig:login", function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); });
  window.addEventListener("mig:logout", function () { if (S.mode === "ready" || S.mode === "denied") { S.user = null; S.forms = {}; S.res = {}; signIn(false); } });
  window.addEventListener("beforeunload", function (e) { if (S.mode !== "ready") return; saveDraft(); var dirty = false; for (var k in S.forms) if (S.forms[k]) for (var x in S.forms[k]) if (S.forms[k][x]) dirty = true; if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  boot();
})();
