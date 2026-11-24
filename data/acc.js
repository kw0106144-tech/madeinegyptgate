/* data/acc.js — Admin Control Center of منصة صنع في مصر / Made in Egypt Gate (panel.html; docs/janna/ACC-CONTRACT.md §1).
   The owner's live panel (same look, URL, navigation, labels and order) rebuilt on the Worker: every section reads and writes
   /api/admin/cc/* (acc.js router → content.js, payments.js, email-center.js), the existing SEO API /api/seo/* and the existing
   /api/admin/* endpoints, with the platform session of data/mig-api.js (localStorage mig-tok, e-mail code). Nothing is cached or
   invented: lists show «جارٍ التحميل…», then the server's rows or the honest empty text; a toast says only what the server confirmed.
   Role-aware (owner / admin / editor / support; the server checks every permission again), Arabic first with full English parity
   (T(ar, en), <html lang dir> switch), RTL/LTR, desktop + 390 px. ES5, no dependencies. Every string from the server is escaped (h()).
   Base rows of the site's data files are read raw (window.MIGOVL_ADMIN = 1: data/mig-overlay.js installs no setters) and merged
   with the Control Center drafts by the panel. */
(function () {
  "use strict";
  if (window.MIGACC) return;
  var W = window, D = document, CFG = W.MIGACC_CFG || {};
  CFG.v = CFG.v || {}; CFG.urls = CFG.urls || {}; CFG.cats = CFG.cats || []; CFG.banners = CFG.banners || [];
  var LANG = W.MIGLANG === "en" ? "en" : "ar";
  function EN() { return LANG === "en"; }
  function T(a, e) { return EN() ? e : a; }
  function L2(x) { return x ? (EN() ? (x[1] != null ? x[1] : x[0]) : x[0]) : ""; }
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || D).querySelectorAll(s)); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function U(k) { return CFG.urls[k] || (k === "home" ? "/" : k + ".html"); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v == null ? "" : String(v); }
  function trim(v) { return str(v).replace(/^\s+|\s+$/g, ""); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function nfc(s) { s = str(s); try { return s.normalize ? s.normalize("NFC") : s; } catch (e) { return s; } }
  function today() { return cairoDay(new Date()); }
  function cairoDay(d) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch (e) { return d.toISOString().slice(0, 10); } }
  function rid(n) { var a = "23456789abcdefghjkmnpqrstuvwxyz", s = "", r = new Uint8Array(n || 8); try { (W.crypto || W.msCrypto).getRandomValues(r); } catch (e) { for (var j = 0; j < r.length; j++) r[j] = Math.floor(Math.random() * 256); } for (var i = 0; i < r.length; i++) s += a.charAt(r[i] % a.length); return s; }

  /* ---------- formatting (Latin digits; dates ar-EG-u-nu-latn / en-GB, Cairo time) ---------- */
  function nf(n) { if (n == null || n === "" || isNaN(+n)) return "—"; return (+n).toLocaleString("en-US"); }
  function nfz(n) { return n == null ? "—" : nf(n); }
  function money(minor, cur) {
    if (minor == null || minor === "" || isNaN(+minor)) return "—";
    var v = (+minor) / 100;
    return v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " " + (!cur || cur === "EGP" ? T("جنيه", "EGP") : cur);
  }
  function fd(iso, time) {
    if (!iso) return "—";
    var s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s); if (isNaN(d.getTime())) return s.slice(0, time ? 16 : 10);
    try {
      var o = { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" };
      if (time) { o.hour = "2-digit"; o.minute = "2-digit"; o.hour12 = false; }
      return new Intl.DateTimeFormat(EN() ? "en-GB" : "ar-EG-u-nu-latn", o).format(d);
    } catch (e) { return s.slice(0, time ? 16 : 10).replace("T", " "); }
  }
  /* a timestamp in a table cell: never broken inside (the live CSS allows overflow-wrap:anywhere in cells) */
  function fdh(iso, time) { return '<span class="nw">' + h(fd(iso, time)) + "</span>"; }
  function kb(n) { return n == null ? "—" : (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"); }
  function dleft(d) { if (!d) return null; var t = Date.parse(String(d).length === 10 ? d + "T23:59:59+02:00" : d); return isNaN(t) ? null : Math.ceil((t - Date.now()) / 864e5); }
  function safeUrl(u) { u = trim(u); if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u; if (/^\/[A-Za-z0-9؀-ۿ%\/_\-.~#=?&]*$/.test(u) && u.indexOf("//") !== 0) return u; if (/^(img|media|data)\/[A-Za-z0-9\/_\-.]+$/.test(u)) return u; return ""; }
  function imgUrl(u) { u = trim(u); if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u; if (/^\/(media\/u|img)\/[A-Za-z0-9\/_\-.]+$/.test(u)) return u; if (/^img\/[A-Za-z0-9\/_\-.]+$/.test(u)) return u; if (/^\/media\/u\/[A-Za-z0-9\/_\-.]+\?e=\d+&s=[A-Za-z0-9_\-]+$/.test(u)) return u; return ""; }
  /* previews load same-site images only (uploads and the build's img/): no third-party requests from the admin panel */
  function localImg(u) { u = imgUrl(u); return /^(\/(media\/u|img)\/|img\/)/.test(u) ? u : ""; }
  function host(u) { try { return new URL(u, location.href).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
  function cut(s, n) { s = str(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function lnk(u, txt) { var s = safeUrl(u); return s ? '<a href="' + h(s) + '" target="_blank" rel="noopener nofollow noreferrer" dir="ltr">' + h(txt || host(s) || s) + " ↗</a>" : (u ? '<small dir="ltr">' + h(cut(u, 60)) + "</small>" : "—"); }

  /* ---------- labels shared by many sections ---------- */
  var PLANS = [["", "بدون باقة", "No plan"], ["profile", "تسجيل بيانات فقط", "Company data only"], ["basic", "الأساسية", "Basic"], ["premium", "المميزة", "Premium"], ["partner", "الشريك الأساسي", "Core partner"], ["strategic", "الشريك الاستراتيجي", "Strategic partner"]];
  function planKey(p) { p = str(p).toLowerCase(); return p === "visitor" || p === "none" ? "" : p; }
  function planName(p) { p = planKey(p); for (var i = 0; i < PLANS.length; i++) if (PLANS[i][0] === p) return T(PLANS[i][1], PLANS[i][2]); return p; }
  /* ---------- the GCC states of a plan whose member picks them (Premium = Egypt + 3 — the matrix key gcc_pick, DESIGN §2.5) ---------- */
  var GCCL = [["SA", "السعودية", "Saudi Arabia", "🇸🇦"], ["AE", "الإمارات", "UAE", "🇦🇪"], ["KW", "الكويت", "Kuwait", "🇰🇼"], ["QA", "قطر", "Qatar", "🇶🇦"], ["BH", "البحرين", "Bahrain", "🇧🇭"], ["OM", "عُمان", "Oman", "🇴🇲"]];
  function gccRow(c) { for (var i = 0; i < GCCL.length; i++) if (GCCL[i][0] === c) return GCCL[i]; return null; }
  function gccList(v) { var out = []; (Object.prototype.toString.call(v) === "[object Array]" ? v : str(v).split(/[\s,،;|]+/)).forEach(function (x) { var c = str(x).toUpperCase(); if (gccRow(c) && out.indexOf(c) < 0) out.push(c); }); return out; }
  function gccNames(cs) { return gccList(cs).map(function (c) { var r = gccRow(c); return T(r[1], r[2]); }).join(EN() ? ", " : "، "); }
  function gccFlags(cs) { return gccList(cs).map(function (c) { return gccRow(c)[3]; }).join(""); }
  /* how many states plan k's member picks: the matrix (GET /admin/cc/plans, cached once per visit), else Premium = 3 */
  var PICKS = null;
  function ccPick(k) { var c = PICKS && PICKS[planKey(k)], v = c && c.gcc_pick != null ? +c.gcc_pick : ({ premium: 3 }[planKey(k)] || 0); return v > 0 && v < 6 && v % 1 === 0 ? v : 0; }
  function loadPicks() {
    if (PICKS || !can("plans.read")) return Promise.resolve();
    return GET("/admin/cc/plans").then(function (j) { var o = {}; Object.keys((j && j.plans) || {}).forEach(function (k) { o[k] = (j.plans[k] || {}).caps || {}; }); PICKS = o; }, function () {});
  }
  /* a member row's GCC state (memberRow.gcc = userOut.gcc {pick, all, chosen, pending}; gcc_stored = the saved choice) */
  function gccState(r) { var g = r && r.gcc && typeof r.gcc === "object" ? r.gcc : null; return g || { pick: 0, all: false, chosen: [], pending: false }; }
  function gccText(r) { var g = gccState(r); return g.chosen && g.chosen.length ? gccNames(g.chosen) : g.pending ? T("⚠ لسه مااختارش — مؤقتاً كل دول الخليج", "⚠ Not chosen yet — all Gulf states for now") : g.all ? T("كل دول الخليج الست", "All 6 Gulf states") : "—"; }
  /* who saved the states (memberRow.gcc_src), in words */
  var GCC_SRCW = { signup: ["استمارة التسجيل", "the registration form"], member: ["العضو", "the member"], admin: ["فريق المنصة", "the platform team"], desk: ["مكتب البيانات", "the data desk"], janna: ["جنة", "Janna"] };
  function gccSrc(k) { var w = GCC_SRCW[str(k)]; return w ? T(w[0], w[1]) : str(k); }
  /* member details «دول الخليج»: what the plan in force covers, then a saved choice that is NOT in force (a Partner's old choice, states kept
     for later) and the states waiting for an open invoice (memberRow.gcc_next) — review B-3 */
  function gccDetail(m, invs) {
    var g = gccState(m), st = gccList(m.gcc_stored), cov = (g.chosen || []).slice().sort().join(), out = gccText(m);
    if (st.length && (g.chosen || []).length && st.slice().sort().join() === cov) out += (m.gcc_src ? T(" (من: ", " (from: ") + gccSrc(m.gcc_src) + (m.gcc_at ? " · " + fd(m.gcc_at, true) : "") + ")" : "");
    else if (st.length) out += " · " + T("الاختيار المحفوظ: ", "Saved choice: ") + gccNames(st) + T(" (مش مستخدم في الباقة الحالية", " (not used by the current plan") + (m.gcc_src ? T("؛ من: ", "; from: ") + gccSrc(m.gcc_src) : "") + ")";
    var nx = m.gcc_next && typeof m.gcc_next === "object" ? m.gcc_next : null;
    if (nx && gccList(nx.gcc).length && (invs || []).some(function (x) { return x && x.no === nx.inv && x.status === "open"; }))
      out += " · " + T("مع الفاتورة ", "With invoice ") + nx.inv + ": " + gccNames(nx.gcc) + T(" — بتتفعّل بعد الدفع", " — applied once it is paid");
    return out;
  }
  function planOpts(sel, withNone) { return PLANS.filter(function (x) { return withNone || x[0]; }).map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === planKey(sel) ? " selected" : "") + ">" + h(T(x[1], x[2])) + "</option>"; }).join(""); }
  var KINDS = { contact: ["رسالة تواصل", "Message"], rfq: ["طلب عرض سعر", "Request for quotation"], basket: ["طلب سلة منتجات", "Product basket request"], opp_offer: ["عرض على فرصة", "Offer on an opportunity"], lead_interest: ["اهتمام بفرصة", "Interest in an opportunity"], project_interest: ["اهتمام بمشروع", "Interest in a project"], entity_contact: ["تواصل مع جهة", "Contact an entity"], signup: ["طلب اشتراك", "Membership application"], profile_fix: ["تصحيح بيانات", "Data correction"] };
  function kindName(k) { return KINDS[k] ? L2(KINDS[k]) : str(k); }
  var INQ_ST = { received: ["تم الاستلام", "Received", ""], routed: ["اتبعت للمصانع المطابقة", "Sent to matching factories", "ok"], in_progress: ["جاري معالجة طلبك", "We're working on your request", "p"], no_match: ["لا يوجد مصنع مطابق بعد", "No matching factory yet", "p"], replied: ["وصلك رد", "Answered", "b"], recorded: ["اتسجّل", "Recorded", "g"], closed: ["اتقفل", "Closed", "g"], blocked: ["موقوف", "Blocked", "x"] };
  function inqChip(s) { var x = INQ_ST[s]; return '<span class="tag ' + (x ? x[2] : "g") + '">' + h(x ? L2(x) : T("حالة أخرى", "Other status")) + "</span>"; }
  var SRC = { form: ["نموذج الموقع", "Site form"], janna: ["جنة", "Janna"], bassem: ["باسم", "Bassem"], basket: ["سلة السوق", "Market basket"], admin: ["إدخال يدوي", "Manual entry"] };
  var ROLES = { owner: ["المالك", "Owner"], admin: ["مدير", "Admin"], manager: ["مدير (بدون الإعدادات)", "Admin (no settings)"], editor: ["محرر", "Editor"], support: ["خدمة العملاء", "Support"], seo: ["فريق الـ SEO", "SEO team"], data: ["فريق الداتا", "Data team"], platform: ["مفتاح المنصة", "Platform key"], portal: ["فريق المنصة (بوابة الفريق)", "Team (team portal)"] };
  function roleName(r) { return ROLES[r] ? L2(ROLES[r]) : str(r || "—"); }
  var GOV_EN = { CAI: "Cairo", GIZ: "Giza", ALX: "Alexandria", QLB: "Qalyubia", SHR: "Sharqia", DKH: "Dakahlia", GHR: "Gharbia", MNF: "Monufia", BHR: "Beheira", KFS: "Kafr El Sheikh", DMT: "Damietta", PTS: "Port Said", ISM: "Ismailia", SUZ: "Suez", FYM: "Faiyum", BNS: "Beni Suef", MNY: "Minya", AST: "Asyut", SHG: "Sohag", QNA: "Qena", LXR: "Luxor", ASN: "Aswan", BBA: "Red Sea", NSN: "North Sinai", JSN: "South Sinai", WAD: "New Valley", MTR: "Matrouh" };
  function govList() { return (W.MIGREG && MIGREG.list) || []; }
  function govName(c) { if (!c) return ""; if (EN() && GOV_EN[c]) return GOV_EN[c]; var r = W.MIGREG && MIGREG.by && MIGREG.by[c]; return r ? r[1] : str(c); }
  function govOpts(sel, all) { return '<option value="">' + h(all || T("— المحافظة —", "— Governorate —")) + "</option>" + govList().map(function (r) { return '<option value="' + h(r[0]) + '"' + (r[0] === sel ? " selected" : "") + ">" + h(EN() && GOV_EN[r[0]] ? GOV_EN[r[0]] : r[1]) + "</option>"; }).join(""); }
  function sectors() { return W.MIGSECTORS || []; }
  function secName(s) { if (!EN()) return str(s); var l = sectors(); for (var i = 0; i < l.length; i++) if (l[i][0] === s) return l[i][1]; return str(s); }

  /* ---------- transport (same base, token and offline rule as data/mig-api.js; keeps the whole error body: errors[], need …) ---------- */
  var BASE = String(W.MIG_API_BASE || "/api").replace(/\/+$/, "");
  function tok() { return ls("mig-tok") || ""; }
  function dropTok() { ls("mig-tok", null); ls("mig-me", null); }
  function E(code, msg, status, j) { return { code: code, error: msg || code, status: status || 0, j: j || {} }; }
  function OFF() { return T("لوحة التحكم مش متصلة بالسيرفر دلوقتي — جرّب تاني بعد شوية", "The control panel can't reach the server right now — please try again shortly"); }
  function fname(r) { var cd = r.headers.get("content-disposition") || "", m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd); try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return m ? m[1] : ""; } }
  function api(method, path, body, o) {
    o = o || {};
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej(E("offline", OFF())); return; }
      var hd = { Accept: o.raw ? "text/csv, application/json" : "application/json" }, t = tok(), done = false, b;
      if (o.bin !== undefined) { hd["Content-Type"] = o.type || "application/octet-stream"; b = o.bin; }
      else if (o.text !== undefined) { hd["Content-Type"] = o.type || "text/csv; charset=utf-8"; b = o.text; }
      else if (body !== undefined) { hd["Content-Type"] = "application/json"; b = JSON.stringify(body); }
      if (t && o.auth !== false) hd.Authorization = "Bearer " + t;
      var ctl = W.AbortController ? new AbortController() : null;
      var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (x) {} rej(E("offline", OFF())); }, o.timeout || 30000);
      fetch((o.abs ? "" : BASE) + path, { method: method, headers: hd, body: b, credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (o.raw && r.ok && ct.indexOf("json") < 0) return r.blob().then(function (bl) { return { st: r.status, ok: true, j: { blob: bl, name: fname(r) } }; });
        if (ct.indexOf("json") < 0) { if (r.ok && r.status === 204) return { st: 204, ok: true, j: {} }; throw E("offline", OFF(), r.status); }
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw E("offline", OFF(), r.status); });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.ok) { res(x.j); return; }
        var e = E(x.j.code || "http_" + x.st, x.j.error || "HTTP " + x.st, x.st, x.j);
        if (x.st === 401 && t && o.auth !== false && !o.no401) setTimeout(onUnauthorized, 0);
        rej(e);
      }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : E("offline", OFF())); });
    });
  }
  function GET(p, o) { return api("GET", p, undefined, o); }
  function POST(p, b, o) { return api("POST", p, b === undefined ? {} : b, o); }
  function PUT(p, b, o) { return api("PUT", p, b === undefined ? {} : b, o); }
  function PATCH(p, b, o) { return api("PATCH", p, b === undefined ? {} : b, o); }
  function DEL(p, b, o) { return api("DELETE", p, b, o); }
  function qs(o) { var a = []; Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (v === undefined || v === null || v === "" || v === false) return; a.push(encodeURIComponent(k) + "=" + encodeURIComponent(v === true ? 1 : v)); }); return a.length ? "?" + a.join("&") : ""; }
  function enc(s) { return encodeURIComponent(str(s)); }

  /* errors in plain words (the server's English text stays visible, small, for support) */
  var ERRS = {
    offline: null,
    unauthorized: ["الجلسة انتهت — ادخل تاني بكود على الإيميل.", "Your session ended — sign in again with an e-mail code."],
    forbidden: ["مش مسموح لدورك بالإجراء ده.", "Your role is not allowed to do this."],
    owner_only: ["الإجراء ده لمالك المنصة بس.", "Only the owner can do this."],
    use_email_code: ["الحساب ده لازم يدخل بكود على الإيميل.", "This account must sign in with an e-mail code."],
    rate_limited: ["طلبات كتير في وقت قصير — استنى دقيقة وجرّب تاني.", "Too many requests in a short time — wait a minute and try again."],
    limit: ["وصلت للحد المسموح.", "The limit is reached."],
    invalid: ["في بيانات محتاجة تتصلّح (معلّمة باللون الأحمر).", "Some fields need fixing (marked in red)."],
    required: ["في حقل مطلوب فاضي.", "A required field is empty."],
    bad_json: ["البيانات اللي اتبعتت مش مفهومة للسيرفر.", "The server could not read the data sent."],
    not_found: ["مش موجود (يمكن اتمسح أو اتغيّر).", "Not found (it may have been removed or changed)."],
    method: ["الإجراء ده مش متاح.", "This action is not available."],
    conflict: ["فيه تعارض مع تعديل تاني — حدّث الصفحة وجرّب تاني.", "This conflicts with another change — refresh and try again."],
    exists: ["موجود قبل كده.", "It already exists."],
    reason_required: ["الحساب ده معاه ذاكرة باسم أو ملف مصنع: اكتب السبب القانوني (طلب رسمي من صاحب البيانات بموجب قانون حماية البيانات الشخصية 151 لسنة 2020) — 10 حروف على الأقل.", "This account has Bassem memory or a factory profile: write the legal basis (a formal data-subject request under Egypt's personal data protection law 151/2020) — at least 10 characters."],
    state: ["الحالة الحالية ماتسمحش بالإجراء ده.", "The current state does not allow this."],
    locked: ["فيه نشر تاني شغّال دلوقتي — جرّب بعد 5 ثواني.", "Another publish is running — try again in 5 seconds."],
    too_large: ["الحجم أكبر من المسموح.", "It is larger than allowed."],
    overlay_too_large: ["التعديلات المنشورة هتعدّي الحد (512 كيلوبايت) — قلّل النصوص الطويلة الأول.", "The published edits would exceed the limit (512 KB) — shorten long texts first."],
    unsupported_type: ["نوع الملف مش مسموح — JPEG أو PNG أو WebP بس.", "This file type is not allowed — JPEG, PNG or WebP only."],
    invalid_image: ["الصورة مش صالحة.", "The image is not valid."],
    media_off: ["رفع الصور محتاج تفعيل R2.", "Image uploads need R2 to be enabled."],
    store_off: ["قاعدة بيانات لوحة التحكم لسه ماتفعّلتش (ترحيل 0006).", "The Control Center database is not set up yet (migration 0006)."],
    kv_off: ["مخزن النشر (KV) مش مربوط.", "The publishing store (KV) is not bound."],
    config_secret_missing: ["لازم يتضاف السر CONFIG_SECRET للـ Worker الأول عشان المفاتيح تتحفظ مشفّرة.", "Add the CONFIG_SECRET secret to the Worker first so keys can be stored encrypted."],
    email_off: ["إرسال الإيميل مش متفعّل لسه.", "E-mail sending is not configured yet."],
    legacy_off: ["النظام القديم مش متاح دلوقتي.", "The old system is not reachable right now."],
    audit_failed: ["ماتحفظش: سجل العمليات ماقدرش يسجّل التغيير، فالتغيير اتلغى.", "Not saved: the audit log could not record the change, so it was refused."],
    provider_error: ["مزوّد الخدمة رجّع خطأ.", "The provider returned an error."],
    source_required: ["المصدر مطلوب للنشر — من غير مصدر الإعلان بيفضل مسودة.", "A source is required to publish — without the announcement's source it stays a draft."],
    invalid_url: ["الرابط لازم يكون https أو مسار صورة من الموقع.", "The link must be https or an image path of the site."],
    invalid_contact: ["ممنوع أرقام تليفون أو واتساب أو إيميلات في البيانات العامة — المشترين بيتواصلوا عن طريق المنصة.", "Phone numbers, WhatsApp numbers and e-mail addresses are not allowed in public data — buyers contact through the platform."],
    open_invoice: ["فيه فاتورة مفتوحة بالفعل.", "There is already an open invoice."],
    in_use: ["الصورة مستخدمة — شيلها من العناصر الأول.", "The image is in use — remove it from the items first."],
    company_locked: ["اسم الشركة مقفول لأنه مربوط بملف في الدليل.", "The company name is locked because it is linked to a directory listing."],
    smtp_unsupported: ["SMTP مش بيشتغل على Cloudflare Workers — استخدم Resend أو Brevo API.", "SMTP cannot run on Cloudflare Workers — use Resend or the Brevo API."],
    invalid_key: ["المفتاح مش بالشكل الصحيح (Resend بيبدأ بـ re_، وBrevo API بـ xkeysib-).", "The key has the wrong format (Resend keys start with re_, Brevo API keys with xkeysib-)."],
    invalid_from: ["البريد المرسِل لازم يكون على madeinegyptgate.com.", "The sender address must be on madeinegyptgate.com."],
    required_template: ["القالب ده أساسي ومينفعش يتقفل.", "This template is required and cannot be switched off."],
    body_not_editable: ["نص القالب ده بيتكتب من الكود — تقدر تعدّل العنوان والمقدمة والخاتمة بس.", "This template's body is composed in code — only the subject, intro and outro can change."],
    unknown_var: ["فيه متغيّر مش معروف في النص.", "The text uses an unknown variable."],
    invalid_provider: ["البوابة دي مش متاحة.", "This gateway is not available."],
    gateway_not_ready: ["بوابة الدفع لسه بتتجهّز.", "The payment gateway is not ready yet."],
    invalid_entity: ["نوع بيانات غير معروف للاستيراد.", "Unknown import entity."],
    link_required: ["اربط الحساب بملف شركة الأول.", "Link the account to a company listing first."],
    not_set: ["مفيش مفتاح متضاف.", "No key is set."],
    unreadable: ["المفتاح المحفوظ مش مقروء (CONFIG_SECRET اتغيّر؟) — دخّله تاني.", "The saved key cannot be read (CONFIG_SECRET changed?) — enter it again."],
    token_test_required: ["اختبر توكن respond.io الأول (لازم ينجح والقناة تكون موجودة).", "Test the respond.io token first (it must pass with the channel found)."],
    test_message_required: ["ابعت رسالة التجربة لرقم المنصة الأول.", "Send the test message to the platform's number first."],
    delivery_confirmation_required: ["علّم إن رسالة التجربة وصلت الأول.", "Confirm that the test message arrived first."],
    dry_run_env: ["WA_DRY_RUN = \"1\" على الـ Worker بيقفل كل الإرسال — لازم يبقى \"0\" الأول.", "WA_DRY_RUN = \"1\" on the Worker stops all sending — it must be \"0\" first."],
    use_payments: ["مفاتيح بوابة الدفع بتتحفظ من «بوابة الدفع».", "Payment-gateway keys are managed in «Payment gateway»."],
    unknown_slot: ["مفتاح غير معروف.", "Unknown key slot."],
    test_the_token: ["القناة بتتجرّب مع اختبار توكن respond.io.", "The channel is checked by the respond.io token test."],
    anam_key_missing: ["مفيش مفتاح Anam على المنصة — ضيفه الأول في «مفتاح Anam».", "No Anam key on the platform — add it first in «Anam key»."],
    anam_refused: ["Anam رفض الطلب.", "Anam refused the request."],
    anam_unreachable: ["Anam مش بيرد دلوقتي — جرّب تاني بعد شوية.", "Anam did not answer — try again in a moment."],
    persona_not_found: ["شخصية باسم مش موجودة في حساب Anam بتاع المفتاح ده.", "Bassem's persona is not in the Anam account of this key."],
    persona_changed: ["شخصية باسم اتعدّلت في Anam في نفس اللحظة — دوس تاني.", "Bassem's persona changed in Anam at the same moment — press again."],
    tool_changed: ["الأداة اتعدّلت في Anam في نفس اللحظة — دوس تاني.", "The tool changed in Anam at the same moment — press again."],
    anam_shape: ["Anam ردّ بشكل مش متوقّع — ماتغيّرش حاجة؛ بلّغ المطوّر.", "Anam answered in an unexpected shape — nothing was changed; tell the developer."],
    connect_busy: ["فيه توصيل تاني شغّال دلوقتي — استنى دقيقة ودوس تاني.", "Another connection is running — wait a minute and press again."],
    tool_secret_invalid: ["«سر أدوات باسم» فيه حروف ماتنفعش في هيدر.", "«Bassem's tool secret» has characters a header cannot carry."],
    secret_not_saved: ["السر الجديد ماتحفظش — ماتغيّرش حاجة في Anam؛ جرّب تاني.", "The new secret was not stored — nothing changed in Anam; try again."],
    data_file: null
  };
  function errText(e) {
    if (!e) return T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    if (e.code === "offline") return OFF();
    if (e.code === "data_file") return e.error;
    /* a limit that lasts longer than «a minute» (e.g. the developer panel's rollbacks: up to an hour): say how long (retry_s) */
    if (e.code === "rate_limited" || e.status === 429) { var rs = e.j ? +e.j.retry_s || +e.j.retry_after || 0 : 0; if (rs > 90) { var rm = Math.ceil(rs / 60); return rm >= 120 ? T("طلبات كتير في وقت قصير — استنى حوالي " + Math.round(rm / 60) + " ساعة وجرّب تاني.", "Too many requests in a short time — wait about " + Math.round(rm / 60) + " h and try again.") : T("طلبات كتير في وقت قصير — استنى حوالي " + rm + " دقيقة وجرّب تاني.", "Too many requests in a short time — wait about " + rm + " min and try again."); } }
    var x = ERRS[e.code];
    if (!x && /^invalid_/.test(e.code || "")) x = ERRS.invalid;
    var why = e.j && e.j.why ? " (" + e.j.why + ")" : "";
    var need = e.code === "forbidden" && e.j && e.j.need ? " — " + T("محتاج صلاحية: ", "needs: ") + e.j.need : "";
    if (x) return L2(x) + why + need;
    if (e.status === 401) return L2(ERRS.unauthorized);
    if (e.status === 403) return L2(ERRS.forbidden);
    if (e.status === 429) return L2(ERRS.rate_limited);
    if (e.status >= 500) return T("حصل خطأ في السيرفر — جرّب تاني بعد شوية.", "Server error — please try again shortly.");
    return T("حصلت مشكلة", "Something went wrong");
  }
  function errSmall(e) { return e && e.code && e.code !== "offline" && e.code !== "data_file" ? '<small class="mut" dir="ltr" style="display:block">' + h(e.code + (e.error && e.error !== e.code ? " — " + cut(e.error, 200) : "")) + "</small>" : ""; }
  function errH(e, retry) { return '<div class="errc" role="alert">' + h(errText(e)) + errSmall(e) + (retry !== false ? '<div class="acts"><button type="button" class="btn l s" data-a="retry">↻ ' + h(T("حاول تاني", "Try again")) + "</button></div>" : "") + "</div>"; }

  /* ---------- lazy site data files (the build's ?v= hashes) ---------- */
  var LOADED = {}, LOADING = {};
  function load1(f) {
    if (LOADED[f]) return Promise.resolve();
    if (LOADING[f]) return LOADING[f];
    LOADING[f] = new Promise(function (res, rej) {
      var s = D.createElement("script"); s.src = "/data/" + f + ".js?v=" + (CFG.v[f] || "0"); s.async = false;
      s.onload = function () { LOADED[f] = 1; res(); };
      s.onerror = function () { delete LOADING[f]; rej(E("data_file", T("ملف بيانات الموقع مش متاح: ", "A site data file is not available: ") + f + ".js")); };
      D.head.appendChild(s);
    });
    return LOADING[f];
  }
  function need(list) { return (list || []).reduce(function (p, f) { return p.then(function () { return load1(f); }); }, Promise.resolve()); }
  var SEOJ = {};
  function seoJson(name) { if (SEOJ[name]) return SEOJ[name]; SEOJ[name] = fetch("/_seo/" + name, { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok) throw E("not_found", "HTTP " + r.status, r.status); return r.json(); }).catch(function (e) { delete SEOJ[name]; throw e; }); return SEOJ[name]; }

  /* ---------- UI primitives (live markup: .ph, .cd, .bar, table, .pg, #mo/#bx, #tt) ---------- */
  function toast(m, bad) { var t = $("#tt"); if (!t) return; t.textContent = m; t.style.display = "block"; t.style.background = bad ? "#B42318" : "#0F172A"; clearTimeout(toast.i); toast.i = setTimeout(function () { t.style.display = "none"; }, bad ? 5200 : 2800); }
  function head(title, sub, bar) { $("#ph").innerHTML = '<div class="ph"><div><h1>' + h(title) + "</h1>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>" + (bar ? '<div class="bar" style="margin:0">' + bar + "</div>" : "") + "</div>"; D.title = title + " – " + T("لوحة التحكم – صنع في مصر", "Control Center – Made in Egypt Gate"); }
  function setCt(html) { $("#ct").innerHTML = html; }
  function loadingH() { return '<div class="cd"><div class="in" role="status">' + h(T("جارٍ التحميل…", "Loading…")) + "</div></div>"; }
  function emptyRow(n, txt) { return '<tr><td colspan="' + n + '" style="text-align:center;padding:26px;color:#64748B">' + h(txt || T("لا توجد نتائج", "No results")) + "</td></tr>"; }
  function btn(act, txt, cls, attrs) { return '<button type="button" class="btn ' + (cls || "l") + '" data-a="' + act + '"' + (attrs || "") + ">" + txt + "</button>"; }
  function tag(txt, cls) { return '<span class="tag' + (cls ? " " + cls : "") + '">' + h(txt) + "</span>"; }
  function srch(v, ph) { return '<input id="q" type="search" placeholder="' + h(ph || T("بحث…", "Search…")) + '" value="' + h(v || "") + '" aria-label="' + h(T("بحث", "Search")) + '">'; }
  function sel(id, opts, v, lab) { return '<select id="' + id + '" data-c="' + id + '" aria-label="' + h(lab || "") + '">' + opts.map(function (o) { return '<option value="' + h(o[0]) + '"' + (str(o[0]) === str(v) ? " selected" : "") + ">" + h(L2([o[1], o[2]])) + "</option>"; }).join("") + "</select>"; }
  function chkb(id, on, lab) { return '<label style="display:inline-flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="' + id + '" data-c="' + id + '" style="width:auto;margin:0"' + (on ? " checked" : "") + ">" + h(lab) + "</label>"; }
  function dateIn(id, v, lab) { return '<input type="date" id="' + id + '" data-c="' + id + '" value="' + h(v || "") + '" aria-label="' + h(lab) + '" title="' + h(lab) + '" style="min-width:150px">'; }
  /* a table like the live one: first column = row actions, then the section's columns */
  function tableH(cols, rows, o) {
    o = o || {};
    var th = "<th>" + (o.count != null ? h(nf(o.count) + " " + T("سجل", "records")) : "") + "</th>" + cols.map(function (c) { return "<th>" + h(L2([c[0], c[1]])) + "</th>"; }).join("");
    var body = rows.length ? rows.map(function (r, i) {
      var acts = o.acts ? o.acts(r, i) : "";
      return "<tr" + (o.rowAttr ? o.rowAttr(r, i) : "") + '><td style="white-space:nowrap">' + acts + "</td>" + cols.map(function (c) { return "<td>" + c[2](r, i) + "</td>"; }).join("") + "</tr>";
    }).join("") : emptyRow(cols.length + 1, o.empty);
    /* --mw: on small screens a many-column table keeps ~110 px per column (its card scrolls sideways) instead of breaking words per letter */
    return "<table" + (o.cls ? ' class="' + o.cls + '"' : "") + ' style="--mw:' + Math.max(760, (cols.length + 1) * 110) + 'px"><thead><tr>' + th + "</tr></thead><tbody>" + body + "</tbody></table>";
  }
  function pagerH(page, total, limit) {
    var n = Math.ceil((total || 0) / (limit || 50)); if (n <= 1) return "";
    return '<button type="button" class="btn s l" data-pg="-1"' + (page <= 0 ? " disabled" : "") + ">" + h(T("السابق", "Previous")) + "</button> " + h(T("صفحة ", "Page ") + (page + 1) + T(" من ", " of ") + n) + ' <button type="button" class="btn s l" data-pg="1"' + (page >= n - 1 ? " disabled" : "") + ">" + h(T("التالي", "Next")) + "</button>";
  }
  function cardH(title, inner, extra) { return '<div class="cd">' + (title ? "<h3>" + h(title) + (extra || "") + "</h3>" : "") + '<div class="in">' + inner + "</div></div>"; }
  function kvH(pairs) { return '<div class="kv">' + pairs.filter(function (p) { return p && p[1] !== undefined && p[1] !== null && p[1] !== ""; }).map(function (p) { return "<div><span>" + h(p[0]) + "</span><b" + (p[2] ? ' dir="' + p[2] + '"' : ' dir="auto"') + ">" + (p[3] ? p[1] : h(p[1])) + "</b></div>"; }).join("") + "</div>"; }
  function tabsH(list, cur, act) { return '<div class="tabs" role="tablist">' + list.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (t[0] === cur ? "true" : "false") + '" class="' + (t[0] === cur ? "on" : "") + (t[4] ? " " + t[4] : "") + '" data-a="' + (act || "tab") + '" data-v="' + h(t[0]) + '">' + h(L2([t[1], t[2]])) + (t[3] ? '<span class="n">' + h(nf(t[3])) + "</span>" : "") + "</button>"; }).join("") + "</div>"; }

  /* ---------- modal (live #mo/#bx): Esc closes, focus is trapped and returns to the opener ---------- */
  var MO = { ret: null, onClose: null, on: null };
  function mh(title) { return '<div class="mh"><h2 id="bxT">' + h(title) + '</h2><button type="button" class="x" data-x aria-label="' + h(T("إغلاق", "Close")) + '">✕</button></div>'; }
  function modal(html, o) {
    o = o || {};
    var mo = $("#mo"), bx = $("#bx");
    if (!mo.classList.contains("on")) MO.ret = D.activeElement;
    bx.className = o.wide ? "wide" : ""; bx.setAttribute("dir", EN() ? "ltr" : "rtl"); bx.innerHTML = html; mo.classList.add("on");
    MO.onClose = o.onClose || null; MO.on = o.on || {};
    /* move focus into the dialog — unless the user already clicked into one of its fields (never steal their caret) */
    var focusIn = function () { if (bx.contains(D.activeElement) && D.activeElement !== bx) return; var f = o.focus ? $(o.focus, bx) : $("input:not([type=hidden]):not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled])", bx) || $("button", bx); if (f) try { f.focus(); } catch (e) {} };
    focusIn(); setTimeout(focusIn, 30);
    return bx;
  }
  function closeModal() {
    var mo = $("#mo"); if (!mo || !mo.classList.contains("on")) return;
    mo.classList.remove("on"); $("#bx").innerHTML = ""; var f = MO.onClose; MO.onClose = null; MO.on = null;
    if (f) try { f(); } catch (e) {}
    try { if (MO.ret && MO.ret.focus && D.body.contains(MO.ret)) MO.ret.focus(); } catch (e) {}
  }
  function trap(e) {
    var bx = $("#bx"), f = $$('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href],iframe', bx).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return; var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && D.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && D.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  /* the live pattern for destructive actions */
  function sure(msg) { return W.confirm(msg || T("حذف نهائي؟ لا يمكن التراجع.", "Delete permanently? This cannot be undone.")); }
  /* owner-only or money actions: the item's name / number typed again */
  function typed(o) {
    return new Promise(function (res) {
      modal(mh(o.title) + '<p>' + h(o.msg) + '</p><label>' + h(T("اكتب للتأكيد: ", "Type to confirm: ")) + '<b dir="ltr">' + h(o.expect) + '</b><input data-tc dir="ltr" autocomplete="off"></label>' + (o.extra || "") + '<div class="ft2"><button type="button" class="btn d" data-a="tcok" disabled>' + h(o.ok || T("تأكيد", "Confirm")) + "</button>" + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', {
        focus: "[data-tc]",
        /* o.submit (optional): called on EVERY confirm instead of resolving once — after a server error the dialog stays usable (fix a field, confirm again) */
        on: { tcok: function () { var vals = {}; $$("#bx [data-tf]").forEach(function (x) { vals[x.getAttribute("data-tf")] = x.type === "checkbox" ? (x.checked ? 1 : 0) : x.value; }); (o.submit || res)({ ok: true, vals: vals, done: closeModal, err: function (e) { var er = $("#bx .er"); if (er) er.innerHTML = h(errText(e)) + errSmall(e); var b = $("#bx [data-a=tcok]"); if (b) b.disabled = false; } }); var b = $("#bx [data-a=tcok]"); if (b) b.disabled = true; } },
        onClose: function () { res({ ok: false }); }
      });
      var inp = $("#bx [data-tc]"); inp.addEventListener("input", function () { $("#bx [data-a=tcok]").disabled = trim(inp.value).toLowerCase() !== str(o.expect).toLowerCase(); });
    });
  }

  /* ---------- forms: the live .fr grid; inline validation; the server's errors[] mapped to the fields ---------- */
  /* field: {n, l:[ar,en], t, w, dir, req, max, opts:[[v, ar, en]], ro, hint:[ar,en], ph, purpose, min, maxv, step, rows} */
  function fieldH(f, v) {
    var lab = h(L2(f.l)) + (f.req ? ' <b class="bad" aria-hidden="true">*</b>' : ""), cls = f.w || f.t === "ta" || f.t === "lines" || f.t === "img" || f.t === "html" ? ' class="w"' : "";
    var dir = f.dir || /^(email|url|num|int|date|time|pw|tel)$/.test(f.t) ? ' dir="ltr"' : ' dir="auto"', ro = f.ro ? " disabled" : "", req = f.req ? ' aria-required="true"' : "";
    var hint = f.hint ? '<span class="hint">' + h(L2(f.hint)) + "</span>" : "", fe = '<div class="fe" data-fe="' + f.n + '" role="alert"></div>', id = "f_" + f.n.replace(/[^\w-]/g, "_");
    var val = v == null ? "" : v;
    if (f.t === "html") return '<div class="w">' + (typeof f.html === "function" ? f.html(v) : f.html || "") + "</div>";
    if (f.t === "pick") return '<div class="w">' + pickH(f.n, val, f.ro, f.l) + "</div>";
    if (f.t === "gcc") { var gv = gccList(val); return '<div class="w" data-gccw="' + f.n + '"><fieldset class="gccf" style="border:1px solid #CBD5E1;border-radius:10px;padding:8px 12px;margin:0"><legend style="font-weight:700;padding:0 6px">' + lab + '</legend><div style="display:flex;flex-wrap:wrap;gap:6px 14px">' + GCCL.map(function (r) { return '<label class="chk" style="min-height:36px"><input type="checkbox" data-f="' + f.n + '" value="' + r[0] + '"' + (gv.indexOf(r[0]) > -1 ? " checked" : "") + ro + '> <span aria-hidden="true">' + r[3] + "</span> " + h(T(r[1], r[2])) + "</label>"; }).join("") + "</div>" + hint + fe + "</fieldset></div>"; }
    if (f.t === "chk") return '<label class="chk' + (f.w ? " w" : "") + '"><input type="checkbox" id="' + id + '" data-f="' + f.n + '"' + (val && val !== "0" ? " checked" : "") + ro + "> " + lab + hint + fe + "</label>";
    if (f.t === "sel") {
      var opts = typeof f.opts === "function" ? f.opts() : f.opts || [];
      return "<label" + cls + ' for="' + id + '">' + lab + '<select id="' + id + '" data-f="' + f.n + '"' + ro + req + ">" + opts.map(function (o) { return '<option value="' + h(o[0]) + '"' + (str(o[0]) === str(val) ? " selected" : "") + ">" + h(L2([o[1], o[2]])) + "</option>"; }).join("") + "</select>" + hint + fe + "</label>";
    }
    if (f.t === "gov") return "<label" + cls + ' for="' + id + '">' + lab + '<select id="' + id + '" data-f="' + f.n + '"' + ro + req + ">" + govOpts(val) + "</select>" + hint + fe + "</label>";
    if (f.t === "sector") return "<label" + cls + ' for="' + id + '">' + lab + '<select id="' + id + '" data-f="' + f.n + '"' + ro + req + '><option value="">' + h(T("— القطاع —", "— Sector —")) + "</option>" + sectors().map(function (s) { return '<option value="' + h(s[0]) + '"' + (s[0] === val ? " selected" : "") + ">" + h(EN() ? s[1] : s[0]) + "</option>"; }).join("") + (val && !sectors().some(function (s) { return s[0] === val; }) ? '<option value="' + h(val) + '" selected>' + h(val) + "</option>" : "") + "</select>" + hint + fe + "</label>";
    if (f.t === "ta" || f.t === "lines") return '<label class="w" for="' + id + '">' + lab + '<textarea id="' + id + '" data-f="' + f.n + '"' + dir + ro + req + (f.max ? ' maxlength="' + f.max * (f.t === "lines" ? 40 : 1) + '"' : "") + (f.rows ? ' rows="' + f.rows + '"' : "") + (f.ph ? ' placeholder="' + h(L2(f.ph)) + '"' : "") + ">" + h(f.t === "lines" && Array.isArray(val) ? val.map(function (x) { return Array.isArray(x) ? x.join(" | ") : x; }).join("\n") : val) + "</textarea>" + hint + fe + "</label>";
    if (f.t === "tags") return "<label" + cls + ' for="' + id + '">' + lab + '<input id="' + id + '" data-f="' + f.n + '"' + dir + ro + req + ' value="' + h(Array.isArray(val) ? val.join("، ") : val) + '">' + '<span class="hint">' + h(f.hint ? L2(f.hint) : T("افصل بينهم بفاصلة", "Separate with commas")) + "</span>" + fe + "</label>";
    if (f.t === "img") {
      var u = localImg(val), up = ST.features && ST.features.media_r2 === false ? '<span class="hint">' + h(T("رفع الصور محتاج تفعيل R2 — تقدر تكتب رابط صورة موجودة.", "Image uploads need R2 to be enabled — you can enter the URL of an existing image.")) + "</span>" : '<input type="file" accept="image/jpeg,image/png,image/webp" data-up="' + f.n + '" data-purpose="' + (f.purpose || "other") + '" aria-label="' + h(T("رفع صورة", "Upload an image")) + '"' + ro + ">";
      return '<div class="w"><label for="' + id + '">' + lab + '</label><div class="imgp">' + (u ? '<img src="' + h(u) + '" alt="" data-pv="' + f.n + '">' : '<img alt="" data-pv="' + f.n + '" hidden>') + '<input id="' + id + '" data-f="' + f.n + '" dir="ltr" value="' + h(val) + '" placeholder="/media/u/…" style="flex:1 1 220px;padding:9px;border:1px solid #CBD5E1;border-radius:9px;font:inherit"' + ro + ">" + up + "</div>" + '<span class="hint">' + h(f.hint ? L2(f.hint) : T("JPEG أو PNG أو WebP، حتى 5 ميجا.", "JPEG, PNG or WebP, up to 5 MB.")) + "</span>" + fe + "</div>";
    }
    var type = f.t === "email" ? "email" : f.t === "num" || f.t === "int" ? "number" : f.t === "date" ? "date" : f.t === "time" ? "time" : f.t === "pw" ? "password" : "text";
    return "<label" + cls + ' for="' + id + '">' + lab + '<input id="' + id + '" type="' + type + '" data-f="' + f.n + '"' + dir + ro + req + (f.max && type === "text" ? ' maxlength="' + f.max + '"' : "") + (f.step ? ' step="' + f.step + '"' : f.t === "num" ? ' step="any"' : "") + (f.min != null ? ' min="' + f.min + '"' : "") + (f.maxv != null ? ' max="' + f.maxv + '"' : "") + (f.ph ? ' placeholder="' + h(L2(f.ph)) + '"' : "") + (f.t === "pw" ? ' autocomplete="new-password" value=""' : ' value="' + h(val) + '"') + ">" + hint + fe + "</label>";
  }
  function formH(fields, vals) { vals = vals || {}; return '<div class="fr">' + fields.map(function (f) { return fieldH(f, own(vals, f.n) ? vals[f.n] : f.def); }).join("") + "</div>"; }
  function readForm(root, fields) {
    var o = {};
    fields.forEach(function (f) {
      if (f.t === "html") return;
      if (f.t === "gcc") { var w = $('[data-gccw="' + f.n + '"]', root); if (w) o[f.n] = w.hidden ? [] : $$('[data-f="' + f.n + '"]', root).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); return; }
      var el = $('[data-f="' + f.n + '"]', root); if (!el) return;
      var v = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value;
      if (f.t === "tags") v = trim(v) ? trim(v).split(/\s*[,،;\n]\s*/).filter(Boolean) : [];
      else if (f.t === "lines") v = trim(v) ? v.split(/\n/).map(trim).filter(Boolean) : [];
      else if (f.t === "num") v = trim(v) === "" ? null : +v;
      else if (f.t === "int") v = trim(v) === "" ? null : parseInt(v, 10);
      else if (typeof v === "string" && f.t !== "pw" && f.t !== "ta") v = trim(v);
      o[f.n] = v;
    });
    return o;
  }
  var RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(fields, v, o) {
    var e = {};
    fields.forEach(function (f) {
      var x = v[f.n]; if (f.t === "html" || f.ro) return;
      if (f.t === "gcc") { var pk = f.pick ? f.pick(v) : 0; if (pk && (x || []).length !== pk) e[f.n] = T("اختار " + pk + " دول خليجية بالظبط", "Choose exactly " + pk + " Gulf states"); return; }
      var empty = x == null || x === "" || (Array.isArray(x) && !x.length);
      if (f.req && empty && !(o && o.noReq)) { e[f.n] = T("مطلوب", "Required"); return; }
      if (empty) return;
      if (f.max && typeof x === "string" && x.length > f.max) e[f.n] = T("أطول من المسموح (" + f.max + " حرف)", "Too long (max " + f.max + " characters)");
      if (f.max && Array.isArray(x) && f.t === "tags" && x.length > (f.maxn || 30)) e[f.n] = T("عدد أكبر من المسموح", "Too many items");
      if (f.t === "email" && !RX_EMAIL.test(x)) e[f.n] = T("بريد إلكتروني غير صحيح", "Invalid e-mail address");
      if (f.t === "url" && !/^https:\/\/[^\s"'<>]+$/i.test(x) && !(f.path && /^\/[^\s"'<>]*$/.test(x) && x.indexOf("//") !== 0)) e[f.n] = T("رابط https كامل", "A full https link");
      if (f.t === "img" && !imgUrl(x)) e[f.n] = T("رابط صورة غير مقبول", "Image URL not accepted");
      if (f.t === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(x)) e[f.n] = T("التاريخ بالشكل YYYY-MM-DD", "Date as YYYY-MM-DD");
      if (f.t === "time" && !/^\d{2}:\d{2}$/.test(x)) e[f.n] = T("الساعة بالشكل 15:30", "Time as 15:30");
      if ((f.t === "num" || f.t === "int") && (isNaN(x) || (f.min != null && x < f.min) || (f.maxv != null && x > f.maxv))) e[f.n] = T("رقم غير مقبول", "Number not accepted");
      if (f.check) { var m = f.check(x, v); if (m) e[f.n] = m; }
    });
    return e;
  }
  function serverErrs(e) {
    var o = {}, j = (e && e.j) || {};
    (j.errors || []).forEach(function (x) { if (x && x.field) o[String(x.field).replace(/^fields\./, "")] = x.msg || x.message || x.code || T("قيمة غير مقبولة", "Value not accepted"); });
    if (j.field && !o[j.field]) o[String(j.field).replace(/^fields\./, "")] = errText(e);
    return o;
  }
  function showErrs(root, errs) {
    $$("[data-f]", root).forEach(function (el) { el.removeAttribute("aria-invalid"); });
    $$("[data-fe]", root).forEach(function (el) { el.textContent = ""; });
    var first = null;
    Object.keys(errs || {}).forEach(function (k) {
      var el = $('[data-f="' + k + '"]', root), fe = $('[data-fe="' + k + '"]', root);
      if (el) { el.setAttribute("aria-invalid", "true"); if (!first) first = el; }
      if (fe) fe.textContent = errs[k];
    });
    if (first) try { first.focus(); } catch (e) {}
    return !!Object.keys(errs || {}).length;
  }
  function unmapped(errs, fields) { var names = {}; fields.forEach(function (f) { names[f.n] = 1; }); return Object.keys(errs).filter(function (k) { return !names[k]; }).map(function (k) { return k + ": " + errs[k]; }); }

  /* ---------- images: type, size and dimensions checked here, then the server validates again (magic bytes, EXIF strip) ---------- */
  var IMG_MIN = { banner: [1120, 200], logo: [96, 96], product: [300, 300] };
  function upload(file, purpose) {
    return new Promise(function (res, rej) {
      if (!file) return rej(E("required", ""));
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(E("unsupported_type", ""));
      if (file.size > 5 * 1048576) return rej(E("too_large", T("حتى 5 ميجا", "up to 5 MB")));
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, hh = im.naturalHeight, mn = IMG_MIN[purpose] || [64, 64]; URL.revokeObjectURL(url);
        if (w < mn[0] || hh < mn[1]) return rej(E("invalid_image", "", 422, { why: T("أقل مقاس ", "minimum ") + mn[0] + "×" + mn[1] + T(" بكسل (الصورة " + w + "×" + hh + ")", " px (this one is " + w + "×" + hh + ")") }));
        if (w > 6000 || hh > 6000 || w * hh > 36e6) return rej(E("invalid_image", "", 422, { why: T("أكبر مقاس 6000×6000", "maximum 6000×6000") }));
        api("POST", "/admin/cc/media" + qs({ purpose: purpose || "other", name: cut(file.name || "", 80) }), undefined, { bin: file, type: file.type, timeout: 90000 }).then(function (j) { if (!j || !j.media) throw E("bad_response", T("السيرفر مارجّعش بيانات الصورة.", "The server returned no image data.")); res(j.media); }, rej);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(E("invalid_image", "", 422, { why: T("الملف مش صورة سليمة", "the file is not a readable image") })); };
      im.src = url;
    });
  }
  function bindUploads(root) {
    $$("[data-up]", root).forEach(function (inp) {
      inp.addEventListener("change", function () {
        var n = inp.getAttribute("data-up"), f = inp.files && inp.files[0], fe = $('[data-fe="' + n + '"]', root), tgt = $('[data-f="' + n + '"]', root), pv = $('[data-pv="' + n + '"]', root);
        if (!f) return; if (fe) fe.textContent = T("جارٍ الرفع…", "Uploading…"); inp.disabled = true;
        upload(f, inp.getAttribute("data-purpose")).then(function (m) {
          var u = m.public_url || m.url || ""; if (tgt) tgt.value = u; if (pv && localImg(m.url || u)) { pv.src = localImg(m.url || u); pv.hidden = false; }
          if (fe) fe.textContent = ""; inp.disabled = false; inp.value = "";
          toast(T("اترفعت الصورة ✓", "Image uploaded ✓") + (m.width ? " " + m.width + "×" + m.height : ""));
        }, function (e) { if (fe) fe.textContent = errText(e); inp.disabled = false; inp.value = ""; });
      });
    });
  }

  /* ---------- CSV (UTF-8 BOM, every cell quoted, formula guard; header = API field names; <section>-<YYYY-MM-DD>.csv) ---------- */
  function csvCell(v) { var s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function saveBlob(blob, name) { var a = D.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function csvSave(section, rows, keys) {
    if (!rows.length) { toast(T("لا توجد بيانات", "No data")); return; }
    keys = keys || Object.keys(rows[0]);
    var csv = "﻿" + keys.map(csvCell).join(",") + "\n" + rows.map(function (r) { return keys.map(function (k) { return csvCell(r[k]); }).join(","); }).join("\n");
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), section + "-" + today() + ".csv"); toast(T("تم التصدير ✓", "Exported ✓"));
  }
  function serverCsv(path, section) { toast(T("جارٍ التجهيز…", "Preparing…")); GET(path, { raw: true, timeout: 120000 }).then(function (j) { if (!j.blob) throw E("bad_response", ""); saveBlob(j.blob, j.name || section + "-" + today() + ".csv"); toast(T("تم التصدير ✓", "Exported ✓")); }, function (e) { toast(errText(e), 1); }); }

  /* ---------- state, roles, permissions ---------- */
  var ST = { me: null, role: "", perms: [], features: {}, boot: null };
  var BD = {};
  var CUR = null;
  function can(p) { return ST.perms.indexOf(p) > -1; }
  function canAny(a) { for (var i = 0; i < a.length; i++) if (can(a[i])) return true; return false; }
  function isAdm() { return ST.role === "owner" || ST.role === "admin" || ST.role === "manager"; }
  function seoOk() { return ST.perms.some(function (p) { return /^seo(\.|$)/.test(p); }) || /^(owner|admin|manager|editor)$/.test(ST.role); }

  /* ---------- navigation: the live GR (groups, labels, order) + the new items inside the same groups ---------- */
  /* [key, AR, EN, badge, permission] — live items keep their live key, label and position */
  var GR = [
    ["", "", [["home", "الرئيسية", "Dashboard", "", "stats.read"]]],
    ["العملاء والاشتراكات", "Customers & subscriptions", [["users", "الأعضاء والاشتراكات", "Members & subscriptions", "expSoon", "members.read"], ["partners", "الشركاء", "Partners", "", "members.read"], ["customers", "العملاء (المشترون)", "Customers (buyers)", "", "customers.read"], ["members", "دليل الشركات", "Company directory", "", "directory.read"], ["plans", "الباقات والصلاحيات", "Plans & permissions", "", "plans.read"], ["approvals", "الموافقات", "Approvals", "approvals", ["approvals.products", "approvals.company"]], ["invoices", "الفواتير والمدفوعات", "Invoices & payments", "unpaid", "pay.read"]]],
    ["الخدمات", "Services", [["tenders", "المناقصات", "Tenders", "", "content.read"], ["rfqs", "طلبات عروض المشترين", "Buyer RFQs", "rfqNew", "content.read"], ["products", "المنتجات", "Products", "", "content.read"], ["store", "المتجر والعروض والتصنيفات", "Store, offers & categories", "", "content.read"], ["awards", "الترسيات والفائزون", "Awards & winners", "", "content.read"], ["projects", "المشاريع", "Projects", "", "content.read"], ["procurement", "أخبار المشتريات", "Procurement news", "", "content.read"], ["events", "الفعاليات والمعارض", "Events & exhibitions", "", "content.read"], ["banners", "البانرات الإعلانية", "Banners", "", "content.read"], ["zones", "المناطق الصناعية", "Industrial zones", "", "content.read"]]],
    ["المحتوى", "Content", [["news", "الأخبار", "News", "", "content.read"], ["videos", "الفيديوهات", "Videos", "", "content.read"], ["notices", "إعلانات الموقع", "Site notices", "", "content.read"], ["media", "مكتبة الصور", "Media library", "", "content.read"], ["publish", "النشر والتحديث", "Publishing & rebuild", "edge", "content.read"]]],
    ["التواصل", "Communication", [["messages", "الرسائل والطلبات", "Messages & requests", "msgNew", "orders.read"], ["whatsapp", "الواتساب", "WhatsApp", "", "wa.read"], ["bassem", "باسم – المستشار", "Bassem – advisor", "", "bassem.read"], ["bassem-meetings", "📞 اجتماعات باسم", "📞 Bassem's meetings", "", "meetings.bassem"]]],
    ["SEO يدوي", "SEO (manual)", [["seo", "بيانات الصفحات", "Page data", "", "seo"], ["keywords", "تتبع الكلمات", "Keyword tracking", "", "seo"], ["redirects", "تحويلات 301", "301 redirects", "", "seo"], ["seo-admin", "مساحة SEO الكاملة ↗", "Full SEO workspace ↗", "", "seo"]]],
    ["النظام", "System", [["payments", "بوابة الدفع", "Payment gateway", "", function () { return can("pay.config") || (can("pay.read") && can("pay.invoice")); }], ["keys", "مفاتيح الخدمات", "Service keys", "", "keys.manage"], ["mail", "البريد", "E-mail", "", "email.read"], ["settings", "الإعدادات", "Settings", "", "settings.read"], ["staff", "الإدارة والصلاحيات", "Admins & roles", "", "staff.read"], ["audit", "سجل العمليات", "Audit log", "", "audit.read"], ["reports", "التقارير", "Reports", "", "reports.read"], ["import", "استيراد من النظام القديم", "Import from the old system", "", "import.run"]]]
  ];
  var NAVP = {}, NAVL = {};
  GR.forEach(function (g) { g[2].forEach(function (x) { NAVP[x[0]] = x[4]; NAVL[x[0]] = [x[1], x[2]]; }); });
  function visible(k) { var p = NAVP[k], sx = ST.boot && ST.boot.sections; if (!p) return false; if (sx && !sx[k]) return false; /* a team-portal session: only its own sections (worker portal-map.js) */ if (typeof p === "function") return !!p(); if (p === "seo") return seoOk(); return Array.isArray(p) ? canAny(p) : can(p); }
  function firstVisible() { for (var i = 0; i < GR.length; i++) for (var j = 0; j < GR[i][2].length; j++) { var k = GR[i][2][j][0]; if (k !== "seo-admin" && visible(k) && SEC[k]) return k; } return ""; }
  function navPaint() {
    var nv = $("#nv"); if (!nv) return;
    if (!ST.me) { nv.innerHTML = ""; return; }
    nv.innerHTML = GR.map(function (g) {
      var items = g[2].filter(function (x) { return visible(x[0]); });
      if (!items.length) return "";
      return (g[0] ? "<h4>" + h(T(g[0], g[1])) + "</h4>" : "") + items.map(function (x) {
        if (x[0] === "seo-admin") return '<a class="xl" href="' + h(U("seo-admin")) + '" target="_blank" rel="noopener"><span>' + h(T(x[1], x[2])) + "</span></a>";
        var on = CUR && CUR.key === x[0], n = x[3] ? +BD[x[3]] || 0 : 0, nt = x[0] === "messages" ? +BD.needsTeam || 0 : 0;
        var bds = (nt > 0 ? '<span class="bd nt" title="' + h(T("محتاجة تدخّل الفريق", "Need the team")) + '">🔴 ' + h(nf(nt)) + "</span>" : "") + (n > 0 ? '<span class="bd">' + h(nf(n)) + "</span>" : "");
        return '<button type="button" class="' + (on ? "on" : "") + '" data-e="' + x[0] + '"' + (on ? ' aria-current="page"' : "") + "><span>" + h(T(x[1], x[2])) + "</span>" + (bds ? '<span class="lb">' + bds + "</span>" : "") + "</button>";
      }).join("");
    }).join("");
  }
  var SEC = {};
  function go(k, arg) { var hsh = "#" + k + (arg ? "/" + enc(arg) : ""); if (location.hash === hsh) route(true); else location.hash = hsh; }
  function route(force) {
    if (!ST.me) return;
    var m = /^#([\w-]+)(?:\/(.*))?$/.exec(location.hash || ""), k = m ? m[1] : "home", arg = "";
    try { arg = m && m[2] ? decodeURIComponent(m[2]) : ""; } catch (e) { arg = ""; }
    if (!SEC[k] || !visible(k)) { k = visible("home") ? "home" : firstVisible(); arg = ""; }
    if (!k) { lockForbidden({ code: "forbidden" }); return; }
    if (!force && CUR && CUR.key === k && CUR.arg === arg) return;
    openSec(k, arg);
  }
  function openSec(k, arg) {
    closeModal();
    CUR = { key: k, arg: arg || "", on: {}, ch: {}, q: null, st: {} };
    navPaint();
    $("#ph").innerHTML = ""; setCt(loadingH());
    try { SEC[k](arg || ""); } catch (e) { setCt(errH(E("client", String(e && e.message || e)))); if (W.console) console.warn("acc section", k, e); }
    if (W.innerWidth <= 820) { var sd = $("#sd"); if (sd) sd.classList.remove("open"); var mb = $("#mnu"); if (mb) mb.setAttribute("aria-expanded", "false"); }
  }
  function rerun() { if (CUR) openSec(CUR.key, CUR.arg); }
  function cur(k) { return CUR && CUR.key === k; }
  /* a section registers its handlers on CUR; async renders check that the user is still on it */
  function alive(c) { return CUR === c; }

  /* ---------- boot: lock card / 403 lock box / offline card / the panel ---------- */
  function lockH(title, msg, acts) { return '<div class="lock" role="alert"><h2>' + h(title) + "</h2><p>" + msg + '</p><div class="acts">' + acts + "</div></div>"; }
  function chrome() {
    var t = function (s, a, e) { var el = $(s); if (el) el.textContent = T(a, e); };
    t(".lg b", "صنع في مصر", "Made in Egypt"); t(".lg small", "لوحة التحكم", "Control Center"); t("#whoL", "مسجّل باسم", "Signed in as");
    t("#site", "فتح الموقع ↗", "Open the site ↗"); t("#lo", "خروج", "Sign out"); t(".skip", "تخطي إلى المحتوى", "Skip to content");
    var lg = $("#lng"); if (lg) { lg.textContent = EN() ? "العربية" : "English"; lg.setAttribute("lang", EN() ? "ar" : "en"); lg.setAttribute("aria-label", EN() ? "عرض اللوحة بالعربي" : "Show the panel in English"); }
    var nv = $("#nv"); if (nv) nv.setAttribute("aria-label", T("لوحة التحكم", "Control Center"));
    var mb = $("#mnu"); if (mb) mb.setAttribute("aria-label", T("القائمة", "Menu"));
    var lo = $("#lo"); if (lo) lo.hidden = !tok();
    D.documentElement.lang = LANG; D.documentElement.dir = EN() ? "ltr" : "rtl";
  }
  function lockSignedOut() {
    ST.me = null; CUR = null; navPaint(); chrome(); $("#who").textContent = "—";
    $("#ph").innerHTML = ""; D.title = T("لوحة التحكم – صنع في مصر", "Control Center – Made in Egypt Gate");
    setCt(lockH(T("لوحة التحكم", "Control Center"), h(T("الدخول للوحة التحكم بكود من 6 أرقام بيوصل على إيميلك — مفيش باسورد.", "Sign in to the Control Center with a 6-digit code sent to your e-mail — no password.")),
      (W.MIGAPI && MIGAPI.open ? btn("signin", h(T("ادخل بكود على الإيميل", "Sign in with an e-mail code")), "r") : "") + '<a class="btn l" href="' + h(U("login")) + '?next=' + h(encodeURIComponent(location.pathname + location.hash)) + '">' + h(T("صفحة الدخول", "Sign-in page")) + "</a>"));
  }
  function lockForbidden(e) {
    ST.me = null; CUR = null; navPaint(); chrome(); $("#ph").innerHTML = "";
    var legacy = e && e.code === "use_email_code", tm = e && e.j && (e.j.team === "seo" || e.j.team === "data") ? e.j.team : "";
    var tmUrl = tm ? U(tm === "seo" ? "seo-team" : "data-desk") : "";
    setCt(lockH(T("غير مصرّح لك بدخول هذه الصفحة", "You are not allowed to open this page"),
      legacy ? h(T("إنت داخل بالباسورد القديم. لوحة التحكم بتفتح بس بالدخول بكود على الإيميل.", "You signed in with the old password. The Control Center opens only with an e-mail code sign-in.")) : tm ? h(T("حسابك في " + ROLES[tm][0] + " — شغلك كله في لوحة فريقك.", "Your account is on the " + ROLES[tm][1] + " — all your work is on your team board.")) : h(T("الحساب ده مش من فريق إدارة المنصة. لو محتاج صلاحية، كلّم مالك المنصة.", "This account is not on the platform's admin team. If you need access, ask the platform owner.")),
      (legacy && W.MIGAPI ? btn("signin2", h(T("ادخل بكود على الإيميل", "Sign in with an e-mail code")), "r") : "") + (tmUrl ? '<a class="btn r" href="' + h(tmUrl) + '">' + h(T("افتح لوحة فريقك", "Open your team board")) + "</a> " : "") + '<a class="btn l" href="' + h(U("home")) + '">' + h(T("الرئيسية", "Home")) + "</a>" + (tok() ? btn("logout", h(T("خروج", "Sign out"))) : "")));
  }
  function lockOffline(e) {
    ST.me = null; CUR = null; navPaint(); chrome(); $("#ph").innerHTML = "";
    setCt(lockH(T("لوحة التحكم", "Control Center"), h(OFF()) + errSmall(e), btn("reboot", "↻ " + h(T("حاول تاني", "Try again")), "r")));
  }
  function onUnauthorized() { if (!ST.me) return; dropTok(); closeModal(); toast(L2(ERRS.unauthorized), 1); lockSignedOut(); }
  var POLL = 0;
  function badges() { if (!ST.me || !can("stats.read") || D.hidden) return; GET("/admin/cc/badges").then(function (j) { BD = j || {}; navPaint(); }, function () {}); }
  function boot() {
    chrome();
    if (!tok()) { lockSignedOut(); return; }
    setCt(loadingH());
    GET("/admin/cc/whoami", { no401: true }).then(function (j) {
      ST.boot = j || {}; ST.me = j.user || {}; ST.role = j.role || ""; ST.perms = Array.isArray(j.perms) ? j.perms : []; ST.features = j.features || {};
      $("#who").textContent = ST.me.name || ST.me.email || "—"; chrome();
      route(true); badges(); clearInterval(POLL); POLL = setInterval(badges, 60000);
    }, function (e) {
      if (e.status === 401) { dropTok(); lockSignedOut(); }
      else if (e.status === 403) lockForbidden(e);
      else lockOffline(e);
    });
  }
  function setLang(l) {
    LANG = l === "en" ? "en" : "ar"; W.MIGLANG = LANG; ls("mig-lang", LANG);
    try { var u = location.href.replace(/([?&])lang=(en|ar)&?/, "$1").replace(/[?&](#|$)/, "$1"); if (u !== location.href) history.replaceState(null, "", u); } catch (e) {}
    chrome(); if (ST.me) { navPaint(); rerun(); } else if (!tok()) lockSignedOut(); else boot();
  }

  /* ---------- global events (delegated) ---------- */
  var GA = {
    retry: function () { rerun(); },
    reboot: function () { boot(); },
    signin: function () { if (!W.MIGAPI) return; MIGAPI.open({ title: T("الدخول للوحة التحكم", "Sign in to the Control Center") }).then(function () { boot(); }, function () {}); },
    signin2: function () { if (!W.MIGAPI) return; MIGAPI.logout().then(function () { return MIGAPI.open({ title: T("الدخول للوحة التحكم", "Sign in to the Control Center") }); }).then(function () { boot(); }, function () { boot(); }); },
    logout: function () { doLogout(); }
  };
  function doLogout() { var p = W.MIGAPI && MIGAPI.logout ? MIGAPI.logout() : Promise.resolve(); p.catch(function () {}).then(function () { dropTok(); location.href = U("login"); }); }
  D.addEventListener("click", function (ev) {
    var t = ev.target, b;
    if (!t || !t.closest) return;
    if ((b = t.closest("#nv [data-e]"))) { ev.preventDefault(); go(b.getAttribute("data-e")); return; }
    if (t.id === "mo") { closeModal(); return; }
    if (t.closest("[data-x]")) { ev.preventDefault(); closeModal(); return; }
    if (t.closest("#lo")) { ev.preventDefault(); doLogout(); return; }
    if (t.closest("#lng")) { ev.preventDefault(); setLang(EN() ? "ar" : "en"); return; }
    if (t.closest("#mnu")) { var sd = $("#sd"), o = !sd.classList.contains("open"); sd.classList.toggle("open", o); t.closest("#mnu").setAttribute("aria-expanded", o ? "true" : "false"); return; }
    if ((b = t.closest("[data-pg]")) && CUR && CUR.page) { ev.preventDefault(); CUR.page(+b.getAttribute("data-pg")); return; }
    if ((b = t.closest("[data-a]"))) {
      var a = b.getAttribute("data-a"), inMo = $("#mo").contains(b), fn = (inMo && MO.on && MO.on[a]) || (CUR && CUR.on[a]) || GA[a];
      if (fn) { ev.preventDefault(); if (b.disabled) return; fn(b, ev); }
    }
  });
  D.addEventListener("change", function (ev) {
    var t = ev.target, c = t && t.getAttribute && t.getAttribute("data-c");
    if (!c) return;
    var inMo = $("#mo").contains(t), fn = (inMo && MO.on && MO.on["c:" + c]) || (CUR && CUR.ch[c]);
    if (fn) fn(t, ev);
  });
  D.addEventListener("input", function (ev) {
    var t = ev.target; if (!t || t.id !== "q" || !CUR || !CUR.q) return;
    var c = CUR; clearTimeout(W.__accq); W.__accq = setTimeout(function () { if (alive(c)) c.q(t.value); }, 350);
  });
  D.addEventListener("keydown", function (ev) {
    var mo = $("#mo"); if (!mo || !mo.classList.contains("on")) return;
    if (ev.key === "Escape") { ev.preventDefault(); closeModal(); } else if (ev.key === "Tab") trap(ev);
  });
  W.addEventListener("hashchange", function () { route(false); });
  D.addEventListener("visibilitychange", function () { if (!D.hidden) badges(); });

  /* ---------- a generic paged list over a server endpoint (live: search 350 ms, filters, ↻, ⬇ Excel, pager 50) ---------- */
  /* o: {path(c) → URL without paging, cols, acts(r,i), empty, csv: path|fn, note, count, after(c, j), key: section} */
  function serverList(c, o) {
    c.st.page = c.st.page || 0;
    var limit = o.limit || 50, tb = $("#tb"), pg = $("#pgn");
    if (!tb) return;
    tb.innerHTML = '<div style="padding:18px" role="status">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>"; if (pg) pg.innerHTML = "";
    var u = o.path(c), sep = u.indexOf("?") > -1 ? "&" : "?";
    GET(u + sep + "page=" + c.st.page + "&limit=" + limit).then(function (j) {
      if (!alive(c)) return;
      var items = j.items || [], total = j.total != null ? j.total : items.length;
      c.st.rows = items; c.st.total = total; c.st.j = j;
      tb.innerHTML = tableH(o.cols, items, { count: total, acts: o.acts, empty: o.empty, rowAttr: o.rowAttr });
      if (pg) pg.innerHTML = pagerH(c.st.page, total, limit);
      if (o.after) o.after(c, j);
    }, function (e) { if (!alive(c)) return; tb.innerHTML = '<div style="padding:12px">' + errH(e) + "</div>"; });
    c.page = function (d) { c.st.page = Math.max(0, c.st.page + d); serverList(c, o); };
  }
  function listShell(note) { return (note ? '<div class="note">' + note + "</div>" : "") + '<div class="cd"><div id="tb"><div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + '</div></div><div class="pg" id="pgn"></div></div>'; }

  /* =====================================================================================================================
     home — الإحصائيات (آخر 30 يوم): the live cards in the live order + the new ones; every number from GET /api/admin/cc/stats
     ===================================================================================================================== */
  var SRC_NAME = { direct: ["مباشر", "Direct"], google: ["Google", "Google"], bing: ["Bing", "Bing"], yahoo: ["Yahoo", "Yahoo"], duckduckgo: ["DuckDuckGo", "DuckDuckGo"], facebook: ["فيسبوك", "Facebook"], instagram: ["إنستجرام", "Instagram"], x: ["X (تويتر)", "X (Twitter)"], linkedin: ["لينكدإن", "LinkedIn"], youtube: ["يوتيوب", "YouTube"], whatsapp: ["واتساب", "WhatsApp"], telegram: ["تيليجرام", "Telegram"] };
  function chartH(series, days) {
    days = days || 30;
    var m = {}, list = [], i; (series || []).forEach(function (x) { m[x.day] = x; });
    for (i = days - 1; i >= 0; i--) { var d = cairoDay(new Date(Date.now() - i * 864e5)); list.push([d, m[d] ? +m[d].v || 0 : 0, m[d] ? +m[d].u || 0 : 0]); }
    var mx = Math.max(3, Math.max.apply(null, list.map(function (d) { return d[1]; }))), Wd = 900, Ht = 240, px = 40, pr = 10, pt = 10, pb = 26;
    var X = function (k) { return px + (Wd - px - pr) * (k / (days - 1)); }, Y = function (v) { return pt + (Ht - pt - pb) * (1 - v / mx); };
    var Lp = function (ix) { return list.map(function (d, k) { return X(k).toFixed(1) + "," + Y(d[ix]).toFixed(1); }).join(" "); };
    var g = ""; for (i = 0; i <= 4; i++) { var yv = Math.round(mx * i / 4); g += '<line x1="' + px + '" x2="' + (Wd - pr) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '" stroke="#E5E9E7"/><text x="' + (px - 6) + '" y="' + (Y(yv) + 4) + '" font-size="11" text-anchor="end" fill="#64748B">' + yv + "</text>"; }
    for (i = 0; i < days; i += 5) g += '<text x="' + X(i) + '" y="' + (Ht - 6) + '" font-size="11" text-anchor="middle" fill="#64748B">' + list[i][0].slice(5) + "</text>";
    return '<div class="chart" dir="ltr"><svg viewBox="0 0 ' + Wd + " " + Ht + '" style="width:100%;height:auto" role="img" aria-label="' + h(T("الزيارات اليومية", "Daily visits")) + '">' + g + '<polyline points="' + Lp(1) + '" fill="none" stroke="#14472f" stroke-width="2.5"/><polyline points="' + Lp(2) + '" fill="none" stroke="#C8102E" stroke-width="2" stroke-dasharray="5 4"/></svg></div><div style="font-size:12px;color:#475569"><span style="color:#14472f">■</span> ' + h(T("مشاهدات الصفحات", "Page views")) + ' &nbsp; <span style="color:#C8102E">■</span> ' + h(T("زوار فريدون", "Unique visitors")) + "</div>";
  }
  function rowsOf(a, g) { return a && a.length ? a.map(function (x) { return '<div class="row"><span>' + g(x) + "</span><b>" + h(nf(x.c != null ? x.c : x.n)) + "</b></div>"; }).join("") : '<div style="color:#64748B;padding:10px 0">' + h(T("لا توجد بيانات بعد — العدّاد بدأ يشتغل من الآن.", "No data yet — the counter has just started.")) + "</div>"; }
  function stName(s) { return s === "pending" ? T("بانتظار التفعيل", "Awaiting activation") : s === "suspended" ? T("موقوف", "Suspended") : T("نشط", "Active"); }
  SEC.home = function () {
    var c = CUR;
    head(T("الإحصائيات", "Statistics"), h(T("آخر 30 يوم", "Last 30 days")), btn("retry", "↻ " + h(T("تحديث", "Refresh"))));
    GET("/admin/cc/stats?days=30").then(function (s) {
      if (!alive(c)) return;
      var v = function (x) { return x == null ? "—" : h(nf(x)); };
      var K = function (a, b, sm, tip) { return '<div class="kc"' + (tip ? ' title="' + h(tip) + '"' : "") + "><span>" + h(a) + "</span><b>" + b + "</b><small>" + (sm || "&nbsp;") + "</small></div>"; };
      var un = s.unpaid || {};
      var kp = K(T("مشاهدات الصفحات", "Page views"), v(s.views), h(T("آخر 30 يوم", "Last 30 days")))
        + K(T("زوار فريدون", "Unique visitors"), v(s.visitors), s.mobile == null ? "—" : h(nf(s.mobile) + "% " + T("موبايل", "mobile")), T("مجموع الزوار الفريدين يومياً", "Sum of daily unique visitors"))
        + K(T("المناقصات", "Tenders"), v(s.tenders), "") + K(T("الشركات", "Companies"), v(s.companies), "")
        + K(T("الأعضاء", "Members"), v(s.members), s.pending == null ? "" : h(nf(s.pending) + " " + T("بانتظار التحقق", "awaiting verification")))
        + K(T("طلبات RFQ", "RFQ requests"), v(s.rfqs), s.rfqNew == null ? "" : h(nf(s.rfqNew) + " " + T("جديد هذا الأسبوع", "new this week")))
        + K(T("رسائل جديدة", "New messages"), v(s.msgNew), s.msgAll == null ? "" : h(T("من ", "of ") + nf(s.msgAll)))
        + K(T("الأخبار / الفيديوهات", "News / videos"), v(s.news) + " / " + v(s.videos), "") + K(T("المنتجات", "Products"), v(s.products), "")
        + K(T("اشتراكات قاربت على الانتهاء", "Subscriptions ending soon"), v(s.soon), h(T("خلال 30 يوم", "within 30 days"))) + K(T("اشتراكات منتهية", "Expired subscriptions"), v(s.expired), "")
        + K(T("محتاجة تدخّل الفريق", "Need the team"), v(s.needsTeam), "") + K(T("موافقات معلّقة", "Pending approvals"), v(s.approvals), "")
        + K(T("فواتير غير مدفوعة", "Unpaid invoices"), v(un.n), un.total_minor == null ? "" : h(money(un.total_minor)))
        + K(T("إيراد الشهر", "Revenue this month"), s.revenue_month_minor == null ? "—" : h(money(s.revenue_month_minor)), h(T("الفواتير المدفوعة بس", "paid invoices only")));
      var noPv = !s.series || !s.series.length;
      var plansC = PLANS.map(function (p) { var c0 = (s.plans || []).filter(function (x) { return planKey(x.plan) === p[0]; }).reduce(function (a, x) { return a + (+x.c || 0); }, 0); return '<div class="row"><span>' + h(T(p[1], p[2])) + "</span><b>" + h(nf(c0)) + "</b></div>"; }).join("");
      var rec = (s.recent || []).length ? s.recent.map(function (x) { return '<div class="row"><span><b dir="auto">' + h(x.company || x.email) + '</b><br><small dir="ltr">' + h(x.email) + "</small></span>" + tag(stName(x.status), x.status === "pending" ? "p" : x.status === "suspended" ? "x" : "") + "</div>"; }).join("") : '<div style="color:#64748B;padding:10px 0">' + h(T("لسه مفيش أعضاء مسجّلين.", "No members yet.")) + "</div>";
      setCt(goLiveH() + '<div class="kp">' + kp + "</div>"
        + '<div class="cd"><h3>' + h(T("الزيارات اليومية", "Daily visits")) + '</h3><div class="in">' + chartH(s.series, 30) + (noPv ? '<p class="mut sm">' + h(T("لا توجد بيانات بعد — العدّاد بدأ يشتغل من الآن.", "No data yet — the counter has just started.")) + (s.since ? " " + h(T("بداية العدّ: ", "Counting since: ") + s.since) : "") + "</p>" : s.since ? '<p class="mut sm">' + h(T("بداية العدّ: ", "Counting since: ") + s.since) + "</p>" : "") + "</div></div>"
        + '<div class="gr">' + cardH(T("أكثر الصفحات زيارة", "Most visited pages"), rowsOf(s.top, function (x) { return '<span dir="ltr">' + h(x.path) + "</span>"; }))
        + cardH(T("مصادر الزيارات", "Traffic sources"), rowsOf(s.src, function (x) { return h(SRC_NAME[x.ref] ? L2(SRC_NAME[x.ref]) : x.ref); }))
        + cardH(T("الأعضاء حسب الباقة", "Members by plan"), plansC) + cardH(T("آخر المسجّلين", "Latest sign-ups"), rec)
        + cardH(T("الطلبات حسب النوع", "Requests by kind"), rowsOf(s.msgKinds, function (x) { return h(kindName(x.kind)); })) + "</div>");
    }, function (e) { if (alive(c)) setCt(goLiveH() + errH(e)); });
  };
  /* the owner's go-live checklist on the home view (whoami.features — presence only, never a value): where each key goes, what is done */
  function goLiveH() {
    if (ST.role !== "owner") return "";
    var f = ST.features || {}, it = [
      [f.config_secret !== false, T("سر التشفير CONFIG_SECRET على الـ Worker (من غيره المفاتيح مش بتتحفظ)", "The CONFIG_SECRET Worker secret (keys cannot be saved without it)"), ""],
      [!!f.pay_ready, T("بوابة الدفع: دخّل مفاتيح Paymob (أو N-Genius / PayTabs) وجرّب فاتورة تجريبية", "Payment gateway: enter the Paymob (or N-Genius / PayTabs) keys and try a test invoice"), "payments"],
      [!!f.email_ready, T("البريد: مفتاح Resend أو Brevo والمرسِل", "E-mail: the Resend or Brevo key and the sender"), "mail"],
      [!!f.respondio, T("الواتساب: توكن respond.io + اختبار", "WhatsApp: the respond.io token + a test"), "keys"],
      [!!f.wa_live, T("تشغيل إرسال واتساب الحقيقي بعد رسالة تجربة لرقم المنصة", "Turn real WhatsApp sending on after a test message to the platform's number"), "keys"]
    ], left = it.filter(function (x) { return !x[0]; }).length;
    if (!left) return "";
    return cardH(T("تجهيز التشغيل", "Go-live checklist") + " · " + nf(it.length - left) + "/" + nf(it.length), '<ul style="list-style:none;margin:0;padding:0">' + it.map(function (x) {
      return '<li class="row"><span>' + (x[0] ? "✓ " : "○ ") + h(x[1]) + "</span>" + (x[2] && visible(x[2]) ? '<a class="btn l s" href="#' + x[2] + '">' + h(x[0] ? T("مراجعة", "Review") : T("افتح", "Open")) + "</a>" : "") + "</li>";
    }).join("") + "</ul>");
  }

  /* =====================================================================================================================
     users — الأعضاء والاشتراكات (live columns + filters) · partners — الشركاء (same component, plan=partner,strategic)
     ===================================================================================================================== */
  var MST = [["active", "نشط", "Active"], ["pending", "معلّق (بانتظار إتمام الاشتراك)", "Pending (subscription not completed)"], ["suspended", "موقوف", "Suspended"]];
  function memberFields(isNew) {
    var plan = can("members.plan"), wr = can("members.write"), ct = can("members.contact"), owner = ST.role === "owner";
    return [
      { n: "email", l: ["البريد الإلكتروني", "E-mail"], t: "email", req: 1, ro: !isNew && !owner, hint: !isNew && owner ? ["تغيير البريد بيغيّر الحساب اللي بيدخل بكود — اتأكد إنه بريد العضو الصحيح.", "Changing the e-mail changes the mailbox that signs in with a code — make sure it is the member's own address."] : null },
      { n: "company", l: ["اسم الشركة", "Company name"], max: 160, ro: !(wr || ct) }, { n: "name", l: ["اسم المدير", "Manager's name"], max: 120, ro: !(wr || ct) },
      { n: "phone", l: ["الجوال", "Mobile"], t: "tel", max: 30, ro: !(wr || ct), hint: ["بيتسجّل بالصيغة الدولية (+20…)", "Stored in international format (+20…)"] },
      { n: "plan", l: ["الباقة", "Plan"], t: "sel", opts: PLANS, ro: !plan },
      { n: "gcc", l: ["دول الخليج (الباقة المميزة: اختار 3)", "Gulf states (Premium: pick 3)"], t: "gcc", ro: !plan, pick: function (v) { return ccPick(v.plan); }, hint: ["الفرص والمناقصات وطلبات الأسعار في الدول دي بتبقى ضمن باقته. كل دول الخليج الست في باقة الشريك الأساسي.", "Opportunities, tenders and RFQs in these states are in the member's plan. All 6 Gulf states are in the Core Partner plan."] },
      { n: "plan_until", l: ["الاشتراك حتى (YYYY-MM-DD) — اتركه فارغاً لبدون تاريخ", "Subscription until (YYYY-MM-DD) — leave empty for no date"], t: "date", ro: !plan },
      { n: "status", l: ["الحالة", "Status"], t: "sel", opts: MST, ro: !plan },
      { n: "_pw", t: "html", html: '<div class="note" style="margin:0">' + h(T("الدخول بكود على الإيميل — مفيش باسورد. الحسابات القديمة تقدر تدخل بباسوردها القديم من صفحة الدخول.", "Sign-in is by an e-mail code — there is no password. Old accounts can still sign in with their old password on the sign-in page.")) + "</div>" },
      { n: "title", l: ["اللقب", "Title"], max: 40, ro: !(wr || ct) }, { n: "sector", l: ["القطاع", "Sector"], t: "sector", ro: !wr }, { n: "governorate", l: ["المحافظة", "Governorate"], t: "gov", ro: !wr },
      { n: "products", l: ["المنتجات / الكلمات (للمطابقة)", "Products / keywords (matching)"], t: "ta", max: 1000, rows: 3, ro: !wr },
      { n: "factory_ref", l: ["ربط بملف في الدليل", "Link to a directory listing"], t: "pick", ro: !can("directory.link") },
      { n: "inbox_paused", l: ["إيقاف الطلبات الواردة", "Pause incoming requests"], t: "chk", ro: !wr }, { n: "notes", l: ["ملاحظات (للإدارة)", "Notes (admins only)"], t: "ta", max: 2000, rows: 3, ro: !wr }
    ].concat(isNew ? [{ n: "invite", l: ["ابعت دعوة دخول على الإيميل", "Send a sign-in invitation by e-mail"], t: "chk", w: 1 }] : []);
  }
  /* directory picker (factory_ref): the site's directory (oldfac.js + facx.js) + Control Center adds; value = "12" | "x3" | "c-…" */
  var DIRX = null;
  function dirIndex() {
    if (DIRX) return DIRX;
    DIRX = need(["regions", "oldfac", "factories", "facx"]).then(function () {
      var out = [];
      (W.MIGOLDFAC || []).forEach(function (r, i) { if (r) out.push({ ref: String(i), name: r[0], sector: r[1], gov: r[10], url: r[7] }); });
      ((W.MIGFACX && MIGFACX.list) || []).forEach(function (r, i) { if (r) out.push({ ref: "x" + i, name: r[0], sector: r[1], gov: "", url: "" }); });
      return (can("content.read") || can("directory.read") ? GET("/admin/cc/content/fac?all=1").then(function (j) { (j.items || []).forEach(function (x) { if (x.kind === "add" && !x.deleted) { var f = x.draft || x.live || {}; out.push({ ref: x.id, name: f.name || x.id, sector: f.sector, gov: f.gov, url: "" }); } }); return out; }, function () { return out; }) : out);
    }, function (e) { DIRX = null; throw e; });
    return DIRX;
  }
  function dirName(ref, list) { if (!ref) return ""; for (var i = 0; i < (list || []).length; i++) if (list[i].ref === String(ref)) return list[i].name; return ""; }
  function pickH(n, v, ro, lab) {
    return '<label>' + h(lab ? L2(lab) : T("ربط بملف في الدليل", "Link to a directory listing")) + '</label><input type="hidden" data-f="' + n + '" value="' + h(v || "") + '"><div class="pick" data-pick="' + n + '"><div class="acts2"><b data-pkn dir="auto">' + h(v ? T("جارٍ التحميل…", "Loading…") : T("مش مربوط", "Not linked")) + "</b>"
      + (ro ? '<small class="mut">' + h(T("(الربط محتاج صلاحية directory.link)", "(linking needs the directory.link permission)")) + "</small>" : (v ? '<button type="button" class="btn s l" data-a="pkclr" data-n="' + n + '">' + h(T("إلغاء الربط", "Unlink")) + "</button>" : "")) + "</div>"
      + (ro ? "" : '<input data-pkq placeholder="' + h(T("ابحث باسم الشركة في الدليل…", "Search the directory by company name…")) + '" dir="auto" style="width:100%;margin-top:6px;padding:9px;border:1px solid #CBD5E1;border-radius:9px;font:inherit"><div data-pkr></div>') + '<div class="fe" data-fe="' + n + '"></div></div>';
  }
  function bindPick(root) {
    $$("[data-pick]", root).forEach(function (box) {
      var n = box.getAttribute("data-pick"), hid = $('[data-f="' + n + '"]', root), q = $("[data-pkq]", box), out = $("[data-pkr]", box), nm = $("[data-pkn]", box);
      var paintName = function (list) { nm.textContent = hid.value ? (dirName(hid.value, list) || "#" + hid.value) : T("مش مربوط", "Not linked"); };
      if (hid.value) dirIndex().then(paintName, function () { nm.textContent = "#" + hid.value; });
      if (!q) return;
      q.addEventListener("input", function () {
        var v = nfc(trim(q.value)); if (v.length < 2) { out.innerHTML = ""; return; }
        dirIndex().then(function (list) {
          var k = v.toLowerCase(), m = list.filter(function (x) { return String(x.name || "").toLowerCase().indexOf(k) > -1; }).slice(0, 8);
          out.innerHTML = m.length ? m.map(function (x) { return '<button type="button" class="btn s l" style="margin:4px 4px 0 0" data-a="pkset" data-n="' + n + '" data-v="' + h(x.ref) + '" data-t="' + h(x.name) + '"><span dir="auto">' + h(x.name) + "</span> <small>" + h(secName(x.sector || "")) + "</small></button>"; }).join("") : '<small class="mut">' + h(T("مفيش شركة بالاسم ده في الدليل.", "No company with this name in the directory.")) + "</small>";
        }, function (e) { out.innerHTML = '<small class="bad">' + h(errText(e)) + "</small>"; });
      });
    });
  }
  var PICK_ON = {
    pkset: function (b) { var root = $("#bx"), n = b.getAttribute("data-n"); $('[data-f="' + n + '"]', root).value = b.getAttribute("data-v"); $('[data-pick="' + n + '"] [data-pkn]', root).textContent = b.getAttribute("data-t"); $('[data-pick="' + n + '"] [data-pkr]', root).innerHTML = ""; $('[data-pick="' + n + '"] [data-pkq]', root).value = ""; },
    pkclr: function (b) { var root = $("#bx"), n = b.getAttribute("data-n"); $('[data-f="' + n + '"]', root).value = ""; $('[data-pick="' + n + '"] [data-pkn]', root).textContent = T("مش مربوط", "Not linked"); b.remove(); }
  };
  function untilTag(u) { if (!u) return "<small>" + h(T("بدون تاريخ", "No date")) + "</small>"; var d = dleft(u); return tag(u + (d != null && d < 0 ? T(" · منتهي", " · expired") : d != null && d <= 30 ? T(" · قارب", " · soon") : ""), d != null && d < 0 ? "x" : d != null && d <= 30 ? "p" : ""); }
  function memberCols() {
    var plan = can("members.plan");
    return [
      ["الشركة", "Company", function (r) { return '<b dir="auto">' + h(r.company || "—") + '</b><br><small dir="auto">' + h(r.name || r.manager || "") + "</small>"; }],
      ["البريد", "E-mail", function (r) { return '<span dir="ltr">' + h(r.email || "") + "</span>"; }],
      ["الجوال", "Mobile", function (r) { return '<span dir="ltr" class="nw">' + h(r.phone || r.tel || "") + "</span>"; }],
      ["الباقة", "Plan", function (r) { var g = gccState(r), sub = g.chosen && g.chosen.length ? '<br><small class="nw" title="' + h(gccNames(g.chosen)) + '" aria-label="' + h(T("دول الخليج: ", "Gulf states: ") + gccNames(g.chosen)) + '">' + gccFlags(g.chosen) + "</small>" : g.pending ? "<br>" + tag(T("⚠ لسه مااختارش دول الخليج", "⚠ Gulf states not chosen"), "p") : "";
        return (plan ? '<select class="pl" data-c="pl" data-id="' + h(r.id) + '" aria-label="' + h(T("الباقة", "Plan")) + '">' + planOpts(r.plan, true) + "</select>" : h(planName(r.plan) || T("بدون باقة", "No plan"))) + sub; }],
      ["الاشتراك حتى", "Subscription until", function (r) { return untilTag(r.plan_until); }],
      ["الحالة", "Status", function (r) { var s = r.status || "active"; if (!plan) return tag(stName(s), s === "active" ? "" : s === "pending" ? "p" : "x"); return '<button type="button" class="btn s ' + (s === "active" ? "l" : "r") + '" data-a="st" data-id="' + h(r.id) + '">' + h(s === "active" ? T("✓ نشط", "✓ Active") : s === "suspended" ? T("⏸ موقوف — تفعيل", "⏸ Suspended — activate") : T("⏸ معلّق — تفعيل", "⏸ Pending — activate")) + "</button>"; }],
      ["آخر دخول", "Last sign-in", function (r) { return (r.last_seen_at ? fdh(r.last_seen_at, true) : "—"); }],
      ["ربط الدليل", "Directory link", function (r) { return r.factory_ref ? '<small dir="auto">' + h(r.factory_name || "#" + r.factory_ref) + "</small>" : "—"; }],
      ["فاتورة مفتوحة", "Open invoice", function (r) { return r.open_invoice ? '<small dir="ltr">' + h(r.open_invoice.no) + "</small><br><small>" + h(money(r.open_invoice.total_minor)) + "</small>" : "—"; }]
    ];
  }
  function memberSection(partners, arg) {
    var c = CUR, F = c.st.f = { q: "", plan: partners ? "partner,strategic" : "", status: "", expired: 0, soon: 0 };
    var title = partners ? T("الشركاء", "Partners") : T("الأعضاء والاشتراكات", "Members & subscriptions");
    var bar = function () {
      return srch(F.q) + (partners ? "" : sel("fp", [["", "كل الباقات", "All plans"], ["none", "بدون باقة", "No plan"]].concat(PLANS.slice(1)), F.plan, T("الباقة", "Plan")))
        + sel("fs", [["", "كل الحالات", "All statuses"], ["active", "نشط", "Active"], ["pending", "معلّق", "Pending"], ["suspended", "موقوف", "Suspended"]], F.status, T("الحالة", "Status"))
        + chkb("fx", F.expired, T("المنتهية فقط", "Expired only")) + chkb("fsn", F.soon, T("تنتهي خلال 30 يوم", "Ending within 30 days"))
        + (can("members.write") ? btn("add", h(partners ? T("➕ شريك جديد", "➕ New partner") : T("➕ عضو جديد", "➕ New member")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + (isAdm() ? btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) : "");
    };
    head(title, "", bar());
    var opt = { path: function () { return "/admin/cc/members" + qs({ q: F.q, plan: F.plan, status: F.status, expired: F.expired ? 1 : "", soon: F.soon ? 1 : "" }); }, cols: memberCols(), empty: T("لا يوجد أعضاء لسه — أول ما حد يسجّل دخول أو يشترك هيظهر هنا.", "No members yet — anyone who signs in or subscribes will show here."),
      acts: function (r, i) { return (can("members.write") || can("members.contact") ? '<button type="button" class="btn s l" data-a="ed" data-i="' + i + '">' + h(T("تعديل", "Edit")) + "</button> " : "") + '<button type="button" class="btn s l" data-a="dt" data-i="' + i + '">' + h(T("تفاصيل", "Details")) + "</button>"; } };
    setCt(listShell(partners ? h(T("الشركاء = أصحاب باقة الشريك الأساسي والشريك الاستراتيجي.", "Partners = members on the Core partner and Strategic partner plans.")) : ""));
    var load = function () { serverList(c, opt); };
    c.q = function (v) { F.q = v; c.st.page = 0; load(); };
    c.ch.fp = function (t) { F.plan = t.value; c.st.page = 0; load(); };
    c.ch.fs = function (t) { F.status = t.value; c.st.page = 0; load(); };
    c.ch.fx = function (t) { F.expired = t.checked ? 1 : 0; c.st.page = 0; load(); };
    c.ch.fsn = function (t) { F.soon = t.checked ? 1 : 0; c.st.page = 0; load(); };
    c.ch.pl = function (t) {
      /* review UX-5: a plan change takes effect at once and has side effects — name the company and old → new plan and ask first */
      var id = t.getAttribute("data-id"), r = (c.st.rows || []).filter(function (x) { return String(x.id) === id; })[0], from = r ? r.plan || "" : "", to = t.value || "";
      var who = r ? r.company || r.email || id : id, pn = function (k) { return planName(k) || T("بدون باقة", "No plan"); };
      /* Premium = Egypt + 3 GCC states: without the member's states (chosen or stored) the form opens with the picker */
      var pk = ccPick(to);
      if (pk && r && gccList(r.gcc_stored).length !== pk) { t.value = from; toast(T("اختار الدول الخليجية للعضو الأول", "Choose the member's Gulf states first")); memberForm(r, partners, load, { plan: planKey(to) }); return; }
      if (!sure(T("تغيير باقة «" + who + "» من «" + pn(from) + "» لـ «" + pn(to) + "»؟\nالتغيير بيتنفّذ فوراً وتاريخ الانتهاء بيفضل زي ما هو. لو الحساب موقوف هيرجع نشط، ولو الباقة الجديدة بتستقبل طلبات، الطلبات المطابقة ممكن تتبعتله تلقائي.",
        "Change the plan of «" + who + "» from «" + pn(from) + "» to «" + pn(to) + "»?\nThe change applies at once and the end date stays as it is. A suspended account becomes active again, and if the new plan receives requests, matching requests may be sent to it automatically."))) { t.value = from; return; }
      t.disabled = true;
      POST("/admin/cc/members/" + enc(id) + "/plan", pk ? { plan: t.value || "", gcc: gccList(r && r.gcc_stored) } : { plan: t.value || "" }).then(function (j) { toast(T("تم تغيير الباقة ✓", "Plan changed ✓") + (j && j.rematched ? T(" — واتبعتله الطلبات المطابقة", " — matching requests sent") : "")); load(); badges(); }, function (e) { toast(errText(e), 1); load(); });
    };
    c.on.rf = load;
    c.on.ex = function () { serverCsv("/admin/cc/members.csv" + qs({ q: F.q, plan: F.plan, status: F.status, expired: F.expired ? 1 : "", soon: F.soon ? 1 : "" }), partners ? "partners" : "users"); };
    c.on.add = function () { memberForm(null, partners, load); };
    loadPicks();
    c.on.ed = function (b) { memberForm(c.st.rows[+b.getAttribute("data-i")], partners, load); };
    c.on.dt = function (b) { memberDetail(c.st.rows[+b.getAttribute("data-i")].id, load); };
    c.on.st = function (b) {
      var id = b.getAttribute("data-id"), r = (c.st.rows || []).filter(function (x) { return String(x.id) === id; })[0]; if (!r) return;
      var to = (r.status || "active") === "active" ? "suspended" : "active";
      if (to === "suspended" && !sure(T("إيقاف الحساب مؤقتاً؟ الباقة بتتحفظ والطلبات الواردة بتقف لحد ما ترجّعه.", "Suspend this account? The plan is held and incoming requests stop until you reactivate it."))) return;
      b.disabled = true;
      POST("/admin/cc/members/" + enc(id) + "/status", { status: to }).then(function () { toast(to === "active" ? T("اتفعّل الحساب ✓", "Account activated ✓") : T("اتوقف الحساب مؤقتاً ✓", "Account suspended ✓")); load(); badges(); }, function (e) { toast(errText(e), 1); b.disabled = false; });
    };
    load();
    if (arg) memberDetail(arg, load);
  }
  SEC.users = function (arg) { memberSection(false, arg); };
  SEC.partners = function (arg) { memberSection(true, arg); };
  function memberForm(r, partners, done, pre) {
    var isNew = !r, fields = memberFields(isNew), vals = r ? { email: r.email, company: r.company, name: r.name || r.manager, phone: r.phone || r.tel, plan: planKey(r.plan), plan_until: r.plan_until || "", status: r.status || "active", title: r.title, sector: r.sector, governorate: r.governorate, products: r.products, factory_ref: r.factory_ref, inbox_paused: r.inbox_paused ? 1 : 0, notes: r.notes || "",
      gcc: gccState(r).chosen && gccState(r).chosen.length ? gccState(r).chosen.slice() : gccList(r.gcc_stored) } : { status: "active", plan: partners ? "partner" : "", invite: 0, gcc: [] };
    var shown = Object.assign({}, vals, pre || {});
    var bx = modal(mh(isNew ? (partners ? T("شريك جديد", "New partner") : T("عضو جديد", "New member")) : T("تعديل", "Edit")) + formH(fields, shown) + '<div class="ft2"><button type="button" class="btn r" data-a="sv">' + h(T("حفظ", "Save")) + '</button><button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', {
      wide: true, on: Object.assign({}, PICK_ON, {
        sv: function (b) {
          var v = readForm(bx, fields), er = $(".er", bx); er.textContent = "";
          var errs = validate(fields, v);
          /* review R-3: the Gulf states are checked for a new member, a plan change into a pick plan, or when the boxes were touched — never for
             an edit of a member who keeps his plan (a Premium member who has not chosen yet stays «not chosen yet», all six for now) */
          if (!isNew && errs.gcc && v.plan === vals.plan && (v.gcc || []).slice().sort().join() === (vals.gcc || []).slice().sort().join()) delete errs.gcc;
          if (showErrs(bx, errs)) return;
          b.disabled = true;
          var fail = function (e) { b.disabled = false; var se = serverErrs(e); showErrs(bx, se); er.innerHTML = h(errText(e)) + errSmall(e) + (e.code === "exists" && e.j && e.j.id ? ' <button type="button" class="btn s l" data-a="openx" data-id="' + h(e.j.id) + '">' + h(T("افتح الحساب الموجود", "Open the existing account")) + "</button>" : ""); };
          if (isNew) {
            var body = {}; Object.keys(v).forEach(function (k) { if (k.charAt(0) !== "_") body[k] = v[k]; }); body.inbox_paused = v.inbox_paused ? 1 : 0; body.invite = !!v.invite;
            if (!ccPick(v.plan)) delete body.gcc;
            if (!can("directory.link")) delete body.factory_ref;
            POST("/admin/cc/members", body).then(function (j) { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓") + (body.invite ? T(" — والدعوة اتبعتت", " — invitation sent") : "")); done(); badges(); }, fail);
            return;
          }
          var prof = {}, keys = ["company", "name", "phone", "title", "sector", "governorate", "products", "inbox_paused", "notes"];
          if (ST.role === "owner") keys.push("email"); if (can("directory.link")) keys.push("factory_ref");
          if (!can("members.write")) keys = ["company", "name", "phone", "title"];
          keys.forEach(function (k) { var a = k === "inbox_paused" ? (v[k] ? 1 : 0) : v[k], o0 = k === "inbox_paused" ? (vals[k] ? 1 : 0) : (vals[k] == null ? "" : vals[k]); if (String(a) !== String(o0)) prof[k] = a; });
          var steps = [];
          if (Object.keys(prof).length) steps.push(function () { return PATCH("/admin/cc/members/" + enc(r.id), prof); });
          var pk = ccPick(v.plan), gNow = (v.gcc || []).slice().sort().join(), gWas = (vals.gcc || []).slice().sort().join();
          if (can("members.plan") && (v.plan !== vals.plan || v.plan_until !== vals.plan_until)) steps.push(function () { return POST("/admin/cc/members/" + enc(r.id) + "/plan", pk ? { plan: v.plan || "", plan_until: v.plan_until || "", gcc: v.gcc || [] } : { plan: v.plan || "", plan_until: v.plan_until || "" }); });
          else if (can("members.plan") && pk && gNow !== gWas) steps.push(function () { return POST("/admin/cc/members/" + enc(r.id) + "/gcc", { gcc: v.gcc || [] }); });
          if (can("members.plan") && v.status !== vals.status) steps.push(function () { return POST("/admin/cc/members/" + enc(r.id) + "/status", { status: v.status }); });
          if (!steps.length) { closeModal(); toast(T("مفيش تغيير", "Nothing changed")); return; }
          steps.reduce(function (p, s) { return p.then(s); }, Promise.resolve()).then(function () { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓")); done(); badges(); }, fail);
        },
        openx: function (b) { closeModal(); memberDetail(b.getAttribute("data-id"), done); }
      })
    });
    bindPick(bx);
    /* the Gulf states: only while the selected plan has a pick (Premium = 3); once pick are ticked the other boxes wait */
    var ps = $('[data-f="plan"]', bx), gw = $('[data-gccw="gcc"]', bx);
    if (gw) {
      var gtog = function () {
        var n = ccPick(ps ? ps.value : vals.plan), bxs = $$('[data-f="gcc"]', gw), on = bxs.filter(function (x) { return x.checked; }).length, lg = $("legend", gw);
        gw.hidden = !n; if (lg && n) lg.innerHTML = h(T("دول الخليج (الباقة المميزة: اختار " + n + ")", "Gulf states (Premium: pick " + n + ")")) + (n ? ' <b class="bad" aria-hidden="true">*</b>' : "");
        bxs.forEach(function (x) { x.disabled = !can("members.plan") || (!x.checked && n > 0 && on >= n); });
      };
      if (ps) ps.addEventListener("change", gtog); gw.addEventListener("change", gtog); gtog();
    }
  }
  /* 0013 «اللي ظاهر عنه على الإنترنت»: what Bassem gets about the member from the platform's own ONE web search for him (name + company
     of his account; worker/src/member-web.js) — shown to bassem.read only (the server sends bassem_web to no one else), cleared with
     members.write (DELETE /api/admin/cc/members/:id/web-summary, audited). The links are for the team only, never in Bassem's block */
  function memberWebH(w) {
    var st = { found: T("فيه ملخص", "Summary found"), none: T("مفيش حاجة واضحة في النتايج — مفيش سطر لباسم", "Nothing clear in the results — no line for Bassem"),
      failed: T("البحث فشل — هيتعاد بعد ٦ ساعات", "The search failed — retried after 6 hours"),
      cleared: T("اتمسح من الفريق — مش هيتدوّر عليه تاني إلا لو اسمه أو شركته اتغيّروا", "Cleared by the team — not searched again unless the name or company changes") };
    var note = !w.switch_on ? T("مفتاح «باسم يعرف العضو من الإنترنت» مقفول في «المطوّر»: مفيش بحث ولا سطر.", "The switch «Bassem knows the member from the web» is off in «Developer»: no search, no line.")
      : !w.search_ready ? T("مفيش مفتاح بحث إنترنت شغّال في «مفاتيح الخدمات».", "No working web-search key in «Service keys».")
      : !w.can_search ? T("مفيش اسم بالكامل (كلمتين على الأقل) وشركة في حسابه، فمابيتعملش بحث.", "No full name (two words or more) and company on the account, so no search runs.")
      : !w.status ? T("لسه ماتعملش بحث — بيتعمل أول ما يكلّم باسم وهو داخل بحسابه.", "Not searched yet — it runs when he next calls Bassem signed in.") : "";
    var srcs = (w.sources || []).map(function (u) { return '<a href="' + h(u) + '" target="_blank" rel="noopener noreferrer nofollow" dir="ltr">' + h(String(u).replace(/^https?:\/\//, "").slice(0, 60)) + "</a>"; }).join("<br>");
    return "<h3>" + h(T("اللي ظاهر عنه على الإنترنت (لباسم والفريق بس)", "What the web shows about him (Bassem and the team only)")) + "</h3>"
      + kvH([[T("الحالة", "Status"), w.status ? (st[w.status] || w.status) : ""], [T("الملخص اللي باسم بيشوفه", "The summary Bassem sees"), w.summary],
        [T("اتدوّر عليه", "Searched"), w.searched_at ? fdh(w.searched_at, true) : "", "", 1], [T("صالح لحد", "Valid until"), w.expires_at ? fdh(w.expires_at) : "", "", 1],
        [T("الروابط (للفريق بس)", "Links (team only)"), srcs, "ltr", 1]])
      + (w.stale ? '<p class="mut">' + h(T("الاسم أو الشركة اتغيّروا من ساعة البحث: هيتدوّر تاني في المكالمة الجاية.", "The name or company changed since the search: it is searched again at the next call.")) + "</p>" : "")
      + (note ? '<p class="mut">' + h(note) + "</p>" : "")
      + (can("members.write") && w.stored && w.status && w.status !== "cleared" ? '<div class="acts2">' + btn("mwclr", h(T("🧹 امسح الملخص", "🧹 Clear the summary")), "l") + "</div>" : "");
  }
  function memberDetail(id, done) {
    modal(mh(T("تفاصيل العضو", "Member details")) + loadingH(), { wide: true });
    GET("/admin/cc/members/" + enc(id)).then(function (j) {
      var m = j.member || {}, meta = j.meta || {}, inv = j.invoices || [], rt = j.routed || {}, lp = j.legacy_profile || {}, au = j.audit || [];
      var acts = (can("pay.invoice") ? btn("inv", h(T("🧾 إصدار فاتورة", "🧾 Issue an invoice")), "r") : "") + (can("members.plan") ? btn("ext", h(T("⏩ مدّ الاشتراك", "⏩ Extend")), "l") + btn("sus", h((m.status || "active") === "suspended" ? T("▶ إعادة التفعيل", "▶ Reactivate") : T("⏸ إيقاف مؤقت", "⏸ Suspend")), "l") + btn("rev", h(T("إنهاء كل الجلسات", "End all sessions")), "l") : "") + (can("members.write") ? btn("invt", h(T("✉ ابعت دعوة دخول", "✉ Send a sign-in invitation")), "l") : "") + (can("members.delete") ? btn("anon", h(T("🗑 أرشفة ومسح البيانات", "🗑 Archive and erase")), "d") : "");
      var lpKeys = Object.keys(lp || {}).filter(function (k) { return lp[k] !== "" && lp[k] != null && !/pass|secret|token|api_?key/i.test(k); });
      var html = mh((m.company || m.email || T("عضو", "Member"))) + '<div class="drw">' + kvH([[T("البريد", "E-mail"), m.email, "ltr"], [T("الجوال", "Mobile"), m.phone, "ltr"], [T("الباقة", "Plan"), planName(m.plan) || T("بدون باقة", "No plan")], [T("دول الخليج", "Gulf states"), gccDetail(m, inv)], [T("الاشتراك حتى", "Until"), m.plan_until || T("بدون تاريخ", "No date")], [T("الحالة", "Status"), stName(m.status)], [T("الباقة المطلوبة", "Requested plan"), m.requested_plan ? planName(m.requested_plan) : ""], [T("تاريخ التفعيل", "Activated"), m.activated_at ? fd(m.activated_at, true) : ""], [T("متحقق", "Verified"), m.verified ? T("نعم", "Yes") : T("لا", "No")], [T("أُنشئ", "Created"), fd(m.created_at, true)], [T("آخر دخول", "Last sign-in"), m.last_seen_at ? fd(m.last_seen_at, true) : ""], [T("المصدر", "Source"), m.source || meta.source], [T("رقم في النظام القديم", "Old-system id"), m.legacy_id || meta.legacy_id], [T("ربط الدليل", "Directory link"), m.factory_ref ? (m.factory_name || "#" + m.factory_ref) : ""], [T("دور في الإدارة", "Admin role"), m.role ? roleName(m.role) : ""], [T("المتابعات", "Follows"), j.follows != null ? nf(j.follows) : ""], [T("الجلسات المفتوحة", "Open sessions"), j.sessions != null ? nf(j.sessions) : ""], [T("وسوم", "Tags"), meta.tags], [T("ملاحظات", "Notes"), meta.notes]])
        + '<div class="acts2">' + acts + "</div>"
        + "<h3>" + h(T("الفواتير", "Invoices")) + "</h3>" + (inv.length ? '<div class="tbl-s">' + tableH([["الرقم", "No.", function (x) { return '<span dir="ltr">' + h(x.no) + "</span>"; }], ["الباقة", "Plan", function (x) { return h(x.plan_name || planName(x.plan)); }], ["الإجمالي", "Total", function (x) { return h(money(x.total_minor, x.currency)); }], ["الحالة", "Status", function (x) { return invChip(x.status); }], ["التاريخ", "Date", function (x) { return fdh(x.issued_at); }]], inv, {}) + "</div>" : '<p class="mut">' + h(T("مفيش فواتير.", "No invoices.")) + "</p>")
        + "<h3>" + h(T("الطلبات اللي وصلتله", "Requests routed to this member")) + " (" + h(nf(rt.count || 0)) + ")</h3>" + ((rt.last || []).length ? "<ul>" + rt.last.map(function (x) { return '<li><a href="#messages/' + enc(x.ref) + '" dir="ltr">' + h(x.ref) + "</a> · " + inqChip(x.status) + " · " + fdh(x.created_at) + "</li>"; }).join("") + "</ul>" : '<p class="mut">' + h(T("لسه مفيش.", "None yet.")) + "</p>")
        + (j.bassem ? "<h3>" + h(T("باسم", "Bassem")) + "</h3>" + kvH(Object.keys(j.bassem).filter(function (k) { return typeof j.bassem[k] !== "object"; }).map(function (k) { return [k, String(j.bassem[k])]; })) : "")
        + (j.bassem_web ? memberWebH(j.bassem_web) : "")
        + (lpKeys.length ? "<h3>" + h(T("بيانات الحساب في النظام القديم (للإدارة فقط)", "Old-system account data (admins only)")) + "</h3>" + kvH(lpKeys.map(function (k) { return [k, typeof lp[k] === "object" ? JSON.stringify(lp[k]) : String(lp[k])]; })) : "")
        + (au.length ? "<h3>" + h(T("سجل العمليات", "Audit history")) + '</h3><ol class="tl">' + au.map(function (a) { return "<li><b>" + h(a.action) + "</b><small>" + fdh(a.at, true) + " · " + h(a.actor_email || a.actor_id) + "</small>" + (a.summary ? '<div dir="auto">' + h(a.summary) + "</div>" : "") + "</li>"; }).join("") + "</ol>" : "") + "</div>";
      var bx = modal(html, { wide: true, on: {
        inv: function () { invoiceForm({ member_id: m.id, email: m.email }, function () { memberDetail(id, done); }); },
        ext: function () { askDays(function (d) { return POST("/admin/cc/members/" + enc(m.id) + "/extend", { days: d }).then(function () { toast(T("اتمدّ الاشتراك ✓", "Subscription extended ✓")); done && done(); memberDetail(id, done); }); }); },
        sus: function (b) { var to = (m.status || "active") === "suspended" ? "active" : "suspended"; if (to === "suspended" && !sure(T("إيقاف الحساب مؤقتاً؟", "Suspend this account?"))) return; b.disabled = true; POST("/admin/cc/members/" + enc(m.id) + "/status", { status: to }).then(function () { toast(T("تم ✓", "Done ✓")); done && done(); memberDetail(id, done); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        mwclr: function (b) { if (!sure(T("تمسح ملخص الإنترنت بتاع العضو ده؟ باسم مش هيشوفه، ومش هيتدوّر عليه تاني إلا لو اسمه أو شركته اتغيّروا.", "Clear this member's web summary? Bassem will not see it, and he is not searched again unless his name or company changes."))) return; b.disabled = true; DEL("/admin/cc/members/" + enc(m.id) + "/web-summary").then(function () { toast(T("اتمسح ✓", "Cleared ✓")); memberDetail(id, done); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        rev: function (b) { if (!sure(T("إنهاء كل جلسات الدخول المفتوحة للعضو ده؟", "End every open session of this member?"))) return; b.disabled = true; POST("/admin/cc/members/" + enc(m.id) + "/sessions/revoke").then(function (x) { toast(T("اتقفلت الجلسات: ", "Sessions ended: ") + nf(x && x.revoked != null ? x.revoked : 0)); memberDetail(id, done); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        invt: function (b) { b.disabled = true; POST("/admin/cc/members/" + enc(m.id) + "/invite", { lang: LANG }).then(function (x) { toast(x && x.sent ? T("اتبعتت الدعوة ✓", "Invitation sent ✓") : T("ماتبعتتش — الإرسال مش متفعّل", "Not sent — e-mail is not configured"), !(x && x.sent)); b.disabled = false; }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        anon: function () { typed({ title: T("أرشفة ومسح بيانات العضو", "Archive and erase this member"), msg: T("البريد والاسم والتليفون والشركة بيتمسحوا، والجلسات بتتقفل، والطلبات اللي بعتها بتفضل زي ما هي. مفيش تراجع.", "E-mail, name, phone and company are erased, sessions end, and requests the member sent stay as they are. This cannot be undone."), expect: m.email, ok: T("أرشفة نهائية", "Archive permanently"), extra: '<div class="fr" style="margin-top:8px"><label class="w">' + h(T("السبب القانوني (لو العضو ليه ذاكرة مع باسم أو ملف مصنع)", "Legal basis (when the member has Bassem memory or a factory profile)")) + '<input data-tf="reason" maxlength="300" dir="auto"><span class="hint">' + h(T("ذاكرة باسم مع العضو وملف مصنعه بيتمسحوا مع الحساب — ده بيتعمل بس لطلب رسمي من صاحب البيانات بموجب قانون حماية البيانات الشخصية 151 لسنة 2020. اكتب الطلب (رقمه وتاريخه)؛ بيتسجّل في سجل العمليات.", "Bassem's memory of the member and the factory profile are erased with the account — only for a formal data-subject request under Egypt's personal data protection law 151/2020. Write the request (number and date); it is kept in the audit log.")) + '</span></label></div>', submit: function (r2) { var rs = trim(r2.vals.reason || ""); DEL("/admin/cc/members/" + enc(m.id), rs ? { confirm: m.email, reason: rs } : { confirm: m.email }).then(function () { r2.done(); toast(T("اتأرشف الحساب ✓", "Account archived ✓")); done && done(); }, r2.err); } }); }
      } });
    }, function (e) { modal(mh(T("تفاصيل العضو", "Member details")) + errH(e, false)); });
  }
  function askDays(fn) {
    var f = [{ n: "days", l: ["عدد الأيام (1–1095)", "Days (1–1095)"], t: "int", req: 1, min: 1, maxv: 1095, def: 365 }];
    var bx = modal(mh(T("مدّ الاشتراك", "Extend the subscription")) + formH(f, { days: 365 }) + '<div class="ft2">' + btn("ok", h(T("مدّ", "Extend")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er"></div>', { on: { ok: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; fn(v.days).catch(function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); } } });
  }

  /* =====================================================================================================================
     customers ➕ — العملاء (المشترون): computed from inquiries by e-mail (GET /api/admin/cc/customers)
     ===================================================================================================================== */
  SEC.customers = function () {
    var c = CUR, F = c.st.f = { q: "", kind: "", has: "", from: "", to: "" };
    head(T("العملاء (المشترون)", "Customers (buyers)"), h(T("كل اللي بعت طلبات للمنصة، مجمّعين بالإيميل", "Everyone who sent requests, grouped by e-mail")), srch(F.q)
      + sel("fk", [["", "كل الأنواع", "All kinds"]].concat(Object.keys(KINDS).map(function (k) { return [k, KINDS[k][0], KINDS[k][1]]; })), F.kind, T("النوع", "Kind"))
      + sel("fh", [["", "حساب أو من غير", "With or without account"], ["1", "عنده حساب", "Has an account"], ["0", "من غير حساب", "No account"]], F.has, T("الحساب", "Account"))
      + dateIn("ff", F.from, T("من تاريخ", "From")) + dateIn("ft", F.to, T("إلى تاريخ", "To")) + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + (isAdm() ? btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) : ""));
    var path = function () { return "/admin/cc/customers" + qs({ q: F.q, kind: F.kind, has_account: F.has, from: F.from, to: F.to }); };
    var opt = { path: path, empty: T("لسه مفيش طلبات من مشترين.", "No requests from buyers yet."),
      cols: [["الاسم / الشركة", "Name / company", function (r) { return '<b dir="auto">' + h(r.name || "—") + '</b><br><small dir="auto">' + h(r.company || "") + "</small>"; }],
        ["البريد", "E-mail", function (r) { return '<span dir="ltr">' + h(r.email || "") + "</span>"; }], ["الجوال", "Mobile", function (r) { return '<span dir="ltr" class="nw">' + h(r.phone || "") + "</span>"; }],
        ["أول طلب", "First request", function (r) { return fdh(r.first_at); }], ["آخر طلب", "Last request", function (r) { return fdh(r.last_at); }],
        ["عدد الطلبات", "Requests", function (r) { var k = r.kinds || {}; return "<b>" + h(nf(r.total)) + "</b><br>" + Object.keys(k).map(function (x) { return tag(kindName(x) + " " + nf(k[x]), "g"); }).join(" "); }],
        ["مفتوحة", "Open", function (r) { return h(nf(r.open)); }],
        ["حساب", "Account", function (r) { return r.member ? tag(planName(r.member.plan) || T("حساب بدون باقة", "Account, no plan"), "b") : "<small>" + h(T("بدون حساب", "No account")) + "</small>"; }],
        ["محظور", "Blocked", function (r) { return r.blocked ? tag(T("محظور", "Blocked"), "x") : "—"; }]],
      acts: function (r, i) { return '<button type="button" class="btn s l" data-a="dt" data-i="' + i + '">' + h(T("تفاصيل", "Details")) + "</button>"; } };
    setCt(listShell(""));
    var load = function () { serverList(c, opt); };
    c.q = function (v) { F.q = v; c.st.page = 0; load(); };
    c.ch.fk = function (t) { F.kind = t.value; c.st.page = 0; load(); }; c.ch.fh = function (t) { F.has = t.value; c.st.page = 0; load(); };
    c.ch.ff = function (t) { F.from = t.value; c.st.page = 0; load(); }; c.ch.ft = function (t) { F.to = t.value; c.st.page = 0; load(); };
    c.on.rf = load; c.on.ex = function () { serverCsv("/admin/cc/customers.csv" + path().replace(/^[^?]*/, ""), "customers"); };
    c.on.dt = function (b) { customerDetail(c.st.rows[+b.getAttribute("data-i")], load); };
    load();
  };
  function customerDetail(r, done) {
    modal(mh(r.name || r.email) + loadingH(), { wide: true });
    GET("/admin/cc/customers/" + enc(r.cid)).then(function (j) {
      var cu = j.customer || r, iq = j.inquiries || [], lm = j.legacy_messages || [];
      var f = [{ n: "note", l: ["ملاحظة (للإدارة)", "Note (admins only)"], t: "ta", max: 2000, rows: 3, ro: !can("customers.write") }, { n: "tags", l: ["وسوم", "Tags"], max: 200, w: 1, ro: !can("customers.write"), hint: ["مثال: مورد كبير، متكرر", "e.g. big buyer, repeat"] }];
      var bx = modal(mh(cu.name || cu.email) + kvH([[T("البريد", "E-mail"), cu.email, "ltr"], [T("الجوال", "Mobile"), cu.phone, "ltr"], [T("الشركة", "Company"), cu.company], [T("أول طلب", "First request"), fd(cu.first_at, true)], [T("آخر طلب", "Last request"), fd(cu.last_at, true)], [T("الحساب", "Account"), cu.member ? (planName(cu.member.plan) || T("حساب بدون باقة", "Account, no plan")) : T("بدون حساب", "No account")]])
        + '<div class="acts2">' + (cu.member && can("members.read") ? '<a class="btn s l" href="#users/' + enc(cu.member.id) + '">' + h(T("افتح الحساب", "Open the account")) + "</a>" : "") + (can("orders.block") && cu.email && !cu.blocked ? btn("blk", h(T("⛔ حظر", "⛔ Block")), "d s") : "") + "</div>"
        + "<h3>" + h(T("الطلبات", "Requests")) + " (" + nf(iq.length) + ")</h3>" + '<div class="tbl-s">' + tableH([["رقم الطلب", "Ref", function (x) { return '<a href="#messages/' + enc(x.ref) + '" dir="ltr">' + h(x.ref) + "</a>"; }], ["النوع", "Kind", function (x) { return h(kindName(x.kind)); }], ["الموضوع", "Subject", function (x) { return '<span dir="auto">' + h(cut(x.target_name || x.title || (x.payload && x.payload.product) || x.message || "", 80)) + "</span>"; }], ["الحالة", "Status", function (x) { return inqChip(x.status); }], ["وصل لـ", "Routed to", function (x) { return h(nf(x.routed_count)); }], ["التاريخ", "Date", function (x) { return fdh(x.created_at); }]], iq, { empty: T("مفيش طلبات.", "No requests.") }) + "</div>"
        + (lm.length ? "<h3>" + h(T("رسائل النظام القديم", "Old-system messages")) + "</h3><ul>" + lm.map(function (x) { return '<li dir="auto">' + fdh(x.legacy_at || x.created_at) + " · " + h(x.subject || "") + " — " + h(cut(x.body || "", 120)) + "</li>"; }).join("") + "</ul>" : "")
        + "<h3>" + h(T("ملاحظات ووسوم", "Notes & tags")) + "</h3>" + formH(f, { note: cu.note || "", tags: cu.tags || "" }) + (can("customers.write") ? '<div class="ft2">' + btn("svn", h(T("حفظ", "Save")), "r") + "</div>" : "") + '<div class="er" role="alert"></div>', { wide: true, on: {
          svn: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; PUT("/admin/cc/customers/" + enc(r.cid) + "/note", { note: v.note, tags: v.tags }).then(function () { b.disabled = false; toast(T("تم الحفظ ✓", "Saved ✓")); done && done(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); },
          blk: function (b) { if (!sure(T("حظر البريد ده؟ طلباته الجاية هتترفض وجلساته هتتقفل.", "Block this e-mail? Its future requests are refused and its sessions end."))) return; b.disabled = true; POST("/admin/block", { email: cu.email, reason: "admin panel" }).then(function () { toast(T("اتحظر ✓", "Blocked ✓")); closeModal(); done && done(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); }
        } });
    }, function (e) { modal(mh(r.name || r.email) + errH(e, false)); });
  }

  /* =====================================================================================================================
     Content engine (§4): base rows of the site's data files (raw, MIGOVL_ADMIN) merged with the Control Center rows
     (GET /api/admin/cc/content/:coll?all=1). Named fields of §4.4; base edits store only the changed fields (null = back to the
     build value); hide = hole/splice in the published overlay; delete only for adds; «حفظ ونشر» is the default button.
     ===================================================================================================================== */
  var COLL = {}, BAKED = { v: undefined };
  function defColl(k, d) { d.key = k; d.perm = d.perm || { w: "content.write", p: "content.publish" }; COLL[k] = d; return d; }
  function urlPath(u) { try { var x = new URL(u); if (!/(^|\.)madeinegyptgate\.com$/i.test(x.hostname)) return ""; var p = nfc(decodeURIComponent(x.pathname)); return p.charAt(p.length - 1) === "/" ? p : p + "/"; } catch (e) { return ""; } }
  function urlKey(u) { try { return nfc(decodeURIComponent(new URL(u).pathname)); } catch (e) { return str(u); } }
  function ovlKey(def, row, i) { try { if (W.MIGOVL && typeof MIGOVL.key === "function") { var k = MIGOVL.key(def.key, row, i); if (k != null && k !== "") return String(k); } } catch (e) {} return String(def.bkey(row, i)); }
  function slugAr(s) { return nfc(s).replace(/[^0-9A-Za-zء-ي٠-٩ٮ-ۓۺ-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  var HASHJ = {};
  function hashMap(type) { if (!HASHJ[type]) HASHJ[type] = seoJson("hash/" + type + ".json").catch(function () { return {}; }); return HASHJ[type]; }
  function seoVia(type, key) { return hashMap(type).then(function (m) { var p = m[key] || m[String(key).toLowerCase()] || ""; return p ? nfc(decodeURIComponent(p)) : ""; }); }
  function bakedV() { if (BAKED.v !== undefined) return Promise.resolve(BAKED.v); return seoJson("overlay-baked.json").then(function (j) { BAKED.v = j && j.v != null ? +j.v : null; return BAKED.v; }, function () { BAKED.v = null; return null; }); }

  var CAT_EN = { food: "Food industries", build: "Building materials", plastic: "Plastics & packaging", elec: "Electrical & HVAC", glass: "Glass", metal: "Iron & metals", petro: "Petrochemicals & fertilisers", med: "Medical & pharma", furn: "Furniture", cosm: "Cosmetics", other: "Other" };
  var CAT_AR = { cosm: "مستحضرات التجميل", other: "أخرى" };
  function catList() {
    var seen = {}, out = [];
    (CFG.cats || []).forEach(function (c) { if (c && c[0] && !seen[c[0]]) { seen[c[0]] = 1; out.push([c[0], c[1], c[2] || ""]); } });
    var mp = (W.MIGP && MIGP.cats) || {}; Object.keys(mp).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push([k, mp[k], ""]); } });
    (W.MIGOLDP || []).forEach(function (p) { var k = p && p[2]; if (k && !seen[k]) { seen[k] = 1; out.push([k, CAT_AR[k] || k, ""]); } });
    return out;
  }
  function catOpts() { var l = catList(); (CATS_ADD || []).forEach(function (x) { if (!l.some(function (c) { return c[0] === x[0]; })) l.push(x); }); return [["", "— التصنيف —", "— Category —"]].concat(l.map(function (c) { return [c[0], (c[2] ? c[2] + " " : "") + c[1], (c[2] ? c[2] + " " : "") + (CAT_EN[c[0]] || c[1])]; })); }
  var CATS_ADD = [];
  function catName(k) { var l = catList().concat(CATS_ADD); for (var i = 0; i < l.length; i++) if (l[i][0] === k) return EN() ? CAT_EN[k] || l[i][1] : l[i][1]; return str(k); }
  var TEND_TYPES = [["مناقصة عامة", "مناقصة عامة", "Public tender"], ["مناقصة", "مناقصة", "Tender"], ["ممارسة عامة", "ممارسة عامة", "Public practice"], ["مناقصة محدودة", "مناقصة محدودة", "Limited tender"]];
  var ZONE_TYPES = [["industrial_area", "منطقة صناعية", "Industrial area"], ["industrial_city", "مدينة صناعية", "Industrial city"], ["free_zone", "منطقة حرة", "Free zone"], ["tech_park", "مجمع تكنولوجي", "Technology park"], ["port_zone", "منطقة ميناء", "Port zone"], ["investment_zone", "منطقة استثمارية", "Investment zone"]];
  var STAGES = [["0", "التخطيط", "Planning"], ["1", "التصميم", "Design"], ["2", "طرح العقود", "Tendering"], ["3", "الترسية", "Award"], ["4", "التنفيذ", "Construction"], ["5", "التشطيبات", "Finishing"], ["6", "مكتمل", "Completed"]];
  function F(n, ar, en, t, x) { var o = { n: n, l: [ar, en], t: t || "text" }; if (x) Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return o; }
  var SRCF = function (n) { return F(n || "source_url", "رابط المصدر (https)", "Source link (https)", "url", { w: 1, hint: ["مطلوب للنشر — من غير مصدر الإعلان بيفضل مسودة", "Required to publish — without the announcement's source it stays a draft"] }); };

  defColl("fac", {
    label: ["دليل الشركات", "Company directory"], files: ["regions", "oldfac"], prep: ["oldfacd"], adds: true, hub: "/factories/", perm: { w: "directory.write", p: "content.publish" },
    arr: function () { return W.MIGOLDFAC || []; }, bkey: function (r) { return urlKey(r[7]); },
    from: function (r, i) { return { name: r[0], sector: r[1], location: r[2], type: r[3], verified: r[4] ? 1 : 0, logo: r[15] || "", description: W.MIGOLDFACD ? MIGOLDFACD[i] || "" : null, products: r[9] || [], gov: r[10] || "", website: r[17] || "", url: r[7] }; },
    seo: function (r) { return Promise.resolve(urlPath(r[7])); }, title: function (f) { return f.name; },
    fields: function () { return [F("name", "اسم الشركة", "Company name", "text", { req: 1, max: 160 }), F("name_en", "الاسم بالإنجليزي", "Name in English", "text", { max: 160, dir: "ltr" }), F("sector", "القطاع", "Sector", "sector", { req: 1 }), F("type", "النوع", "Type", "sel", { req: 1, opts: [["مصنع", "مصنع", "Factory"], ["شركة ومورد", "شركة ومورد", "Company & supplier"]] }), F("location", "الموقع (المدينة، المحافظة)", "Location (city, governorate)", "text", { max: 160 }), F("gov", "المحافظة", "Governorate", "gov", { req: 1 }), F("website", "الموقع الإلكتروني", "Website", "url"), F("logo", "اللوجو", "Logo", "img", { purpose: "logo", hint: ["أقل مقاس 96×96 بكسل", "At least 96×96 px"] }), F("description", "الوصف", "Description", "ta", { max: 2000, hint: ["ممنوع أرقام تليفون أو إيميلات — المشترين بيتواصلوا عن طريق المنصة", "No phone numbers or e-mails — buyers contact through the platform"] }), F("description_en", "الوصف بالإنجليزي", "Description in English", "ta", { max: 2000, dir: "ltr" }), F("products", "المنتجات", "Products", "tags", { max: 80, maxn: 30 }), F("products_en", "المنتجات بالإنجليزي", "Products in English", "tags", { max: 80, maxn: 30, dir: "ltr" })].concat(can("directory.verify") ? [F("verified", "موثّق ✓ (بعد التحقق من المستندات بس)", "Verified ✓ (only after checking documents)", "chk", { w: 1 })] : []); }
  });
  defColl("facx", {
    label: ["مصانع من مصادر عامة", "Public-source factories"], files: ["regions", "factories", "facx"], adds: false, hub: "/factories/", perm: { w: "directory.write", p: "content.publish" },
    arr: function () { return (W.MIGFACX && MIGFACX.list) || []; }, bkey: function (r) { return r[0]; },
    from: function (r) { return { name: r[0], sector: r[1], location: r[2], type: r[3], description: r[4], verified: r[5] ? 1 : 0, logo: r[6] || "", source_url: r[8] || "", website: r[9] || "", products: (W.MIGFACX && MIGFACX.fp && MIGFACX.fp[r[0]]) || [] }; },
    seo: function (r, i) { return seoVia("company", "x" + i); }, title: function (f) { return f.name; },
    fields: function () { return [F("name", "الاسم (ثابت)", "Name (fixed)", "text", { ro: 1 }), F("name_en", "الاسم بالإنجليزي", "Name in English", "text", { dir: "ltr", max: 160 }), F("sector", "القطاع", "Sector", "sector"), F("type", "النوع", "Type", "sel", { opts: [["مصنع", "مصنع", "Factory"], ["شركة", "شركة", "Company"]] }), F("location", "الموقع", "Location", "text", { max: 160 }), F("website", "الموقع الإلكتروني", "Website", "url"), F("logo", "اللوجو", "Logo", "img", { purpose: "logo" }), SRCF(), F("description", "الوصف", "Description", "ta", { max: 2000 }), F("description_en", "الوصف بالإنجليزي", "Description in English", "ta", { max: 2000, dir: "ltr" }), F("products", "المنتجات", "Products", "tags", { max: 80, maxn: 30 }), F("products_en", "المنتجات بالإنجليزي", "Products in English", "tags", { max: 80, maxn: 30, dir: "ltr" })].concat(can("directory.verify") ? [F("verified", "موثّق ✓", "Verified ✓", "chk", { w: 1 })] : []); }
  });
  defColl("prod", {
    label: ["المنتجات", "Products"], files: ["regions", "oldfac", "oldprod", "products"], adds: true, hub: "/products/",
    arr: function () { return W.MIGOLDP || []; }, bkey: function (r) { return urlKey(r[5]); },
    from: function (r, i) { return { name: r[0], name_en: r[6] || "", description: r[1] || "", category: r[2] || "", image: r[9] || "", price: r[11] || "", featured: r[12] ? 1 : 0, company_url: (W.MIGP2F && MIGP2F[i]) || "" }; },
    seo: function (r) { return Promise.resolve(urlPath(r[5])); }, title: function (f) { return f.name; },
    fields: function () { return [F("name", "اسم المنتج", "Product name", "text", { req: 1, max: 120 }), F("name_en", "الاسم بالإنجليزي", "Name in English", "text", { max: 120, dir: "ltr" }), F("category", "التصنيف", "Category", "sel", { req: 1, opts: catOpts }), F("price", "السعر (نص اختياري)", "Price (optional text)", "text", { max: 40, hint: ["بيظهر بس لو اتكتب", "Shown only when filled"] }), F("company_url", "الشركة المصنّعة", "Manufacturer", "co", { req: 1 }), F("image", "صورة المنتج", "Product image", "img", { purpose: "product", hint: ["أقل مقاس 300×300 بكسل", "At least 300×300 px"] }), F("description", "الوصف", "Description", "ta", { max: 600 }), F("featured", "منتج مميز (المتجر)", "Featured product (store)", "chk")]; }
  });
  defColl("tend", {
    label: ["مناقصات المنصة", "Platform tenders"], files: ["regions", "oldtend"], adds: true, src: true, hub: "/tenders/",
    arr: function () { return W.MIGTEND || []; }, bkey: function (r) { return r[0] + "|" + r[3]; },
    from: function (r) { return { ref: r[0], type: r[1], title: r[3], entity: r[4], gov_name: r[5], sector: r[6], booklet: r[7], bond: r[8], deadline: r[9], gov: r[10], source_url: r[11] }; },
    seo: function (r) { return Promise.resolve(urlPath(r[11])); }, title: function (f) { return f.title; },
    pre: function (v) { if (v.gov) v.gov_name = govList().filter(function (g) { return g[0] === v.gov; }).map(function (g) { return g[1]; })[0] || ""; },
    fields: function (isNew) { return [F("ref", "الرقم المرجعي", "Reference", "text", { ro: 1, hint: isNew ? ["بيتولّد تلقائياً عند الحفظ", "Generated automatically on save"] : null }), F("type", "النوع", "Type", "sel", { req: 1, opts: TEND_TYPES }), F("title", "العنوان", "Title", "text", { req: 1, max: 300, w: 1 }), F("title_en", "العنوان بالإنجليزي", "Title in English", "text", { max: 300, w: 1, dir: "ltr" }), F("entity", "الجهة", "Entity", "text", { max: 160 }), F("entity_en", "الجهة بالإنجليزي", "Entity in English", "text", { max: 160, dir: "ltr" }), F("gov", "المحافظة", "Governorate", "gov"), F("sector", "القطاع", "Sector", "sector"), F("booklet", "ثمن الكراسة (جنيه)", "Booklet price (EGP)", "int", { min: 0 }), F("bond", "التأمين", "Bid bond", "text", { max: 60 }), F("deadline", "آخر موعد", "Deadline", "date"), SRCF()]; }
  });
  defColl("rfq", {
    label: ["طلبات عروض المشترين", "Buyer RFQs"], files: ["regions", "oldrfq"], adds: true, hub: "/rfq/",
    arr: function () { return W.MIGRFQ || []; }, bkey: function (r) { return String(r[0]); },
    from: function (r) { return { no: r[0], date: r[1], title: r[2], details: r[3], delivery: r[4], qty: r[5], deadline: r[6], gov: r[7], url: r[8], sector: r[9], details_en: r[10] || "" }; },
    seo: function (r) { return Promise.resolve(urlPath(r[8])); }, title: function (f) { return f.title; },
    fields: function () { return [F("title", "المنتج / الخدمة المطلوبة", "Product / service requested", "text", { req: 1, max: 300, w: 1 }), F("qty", "الكمية والوحدة", "Quantity & unit", "text", { max: 60 }), F("delivery", "مدينة التسليم", "Delivery city", "text", { max: 120 }), F("gov", "المحافظة", "Governorate", "gov"), F("sector", "القطاع", "Sector", "sector"), F("deadline", "آخر موعد للعروض", "Offer deadline", "date"), F("date", "تاريخ النشر", "Publish date", "date"), F("details", "تفاصيل الطلب", "Request details", "ta", { max: 2000 }), F("details_en", "التفاصيل بالإنجليزي", "Details in English", "ta", { max: 2000, dir: "ltr" })]; }
  });
  defColl("offer", {
    label: ["عروض المحلات", "Store offers"], files: ["regions", "offers"], adds: true, src: true, hub: "/offers/",
    arr: function () { return W.MIGOFFERS || []; }, bkey: function (o) { return o.id; },
    from: function (o) { var x = clone(o); x.image = o.img || o.image_file || ""; return x; },
    seo: function (o) { return seoVia("offer", o.id); }, title: function (f) { return f.product_ar; },
    fields: function () { return [F("product_ar", "المنتج", "Product", "text", { req: 1, max: 200, w: 1 }), F("product_en", "المنتج بالإنجليزي", "Product in English", "text", { max: 200, w: 1, dir: "ltr" }), F("brand", "الماركة", "Brand", "text", { max: 80 }), F("made_in_egypt", "صنع في مصر", "Made in Egypt", "chk"), F("category_ar", "التصنيف", "Category", "text", { max: 80 }), F("category_en", "التصنيف بالإنجليزي", "Category in English", "text", { max: 80, dir: "ltr" }), F("size_unit", "الحجم / الوحدة", "Size / unit", "text", { max: 40 }), F("price_egp", "السعر (جنيه)", "Price (EGP)", "num", { req: 1, min: 0 }), F("old_price_egp", "السعر قبل العرض", "Price before the offer", "num", { min: 0 }), F("store_ar", "المتجر", "Store", "text", { req: 1, max: 80 }), F("store_en", "المتجر بالإنجليزي", "Store in English", "text", { max: 80, dir: "ltr" }), F("cities_ar", "المدن", "Cities", "tags"), F("region_codes", "أكواد المحافظات (CAI, GIZ…)", "Governorate codes (CAI, GIZ…)", "tags", { dir: "ltr" }), F("branch_example", "فرع على سبيل المثال", "Example branch", "text", { max: 200 }), F("branch_en", "الفرع بالإنجليزي", "Branch in English", "text", { max: 200, dir: "ltr" }), F("lat", "خط العرض", "Latitude", "num"), F("lon", "خط الطول", "Longitude", "num"), F("approx", "الموقع تقريبي", "Approximate location", "chk"), F("valid_from", "ساري من", "Valid from", "date"), F("valid_to", "ساري حتى", "Valid until", "date", { req: 1 }), SRCF(), F("image", "صورة المنتج", "Product image", "img", { purpose: "offer" })]; }
  });
  defColl("zone", {
    label: ["المناطق الصناعية", "Industrial zones"], files: ["regions", "zones"], adds: true, src: true, hub: "/industrial-zones/",
    arr: function () { return W.MIGZONES || []; }, bkey: function (z) { return z.id; }, from: function (z) { return clone(z); },
    seo: function (z) { return seoVia("city", z.id); }, title: function (f) { return f.name_ar; },
    fields: function () { return [F("name_ar", "الاسم", "Name", "text", { req: 1, max: 200, w: 1 }), F("name_en", "الاسم بالإنجليزي", "Name in English", "text", { max: 200, w: 1, dir: "ltr" }), F("type", "النوع", "Type", "sel", { req: 1, opts: ZONE_TYPES }), F("region_code", "المحافظة", "Governorate", "gov", { req: 1 }), F("city", "المدينة", "City", "text", { max: 120 }), F("operator_ar", "الجهة المشغّلة", "Operator", "text", { max: 200 }), F("lat", "خط العرض", "Latitude", "num"), F("lon", "خط الطول", "Longitude", "num"), F("approx", "الإحداثيات تقريبية", "Approximate coordinates", "chk"), F("coord_source", "مصدر الإحداثيات", "Coordinates source", "url"), F("area_km2", "المساحة (كم²)", "Area (km²)", "num", { min: 0 }), F("area_text", "المساحة (نص)", "Area (text)", "text", { max: 120 }), F("focus_sectors_ar", "القطاعات المستهدفة", "Focus sectors", "tags"), F("status_ar", "الحالة", "Status", "text", { max: 80 }), F("website", "الموقع الإلكتروني", "Website", "url"), F("notes", "ملاحظات", "Notes", "ta", { max: 600 }), SRCF()]; }
  });
  defColl("news", {
    label: ["الأخبار", "News"], files: ["regions", "real"], adds: true, src: true, srcField: "url", hub: "/news/",
    arr: function () { return (W.REAL && REAL.news) || []; }, bkey: function (n) { return n.url; },
    from: function (n) { var x = clone(n); x.image = n.image_file || ""; delete x.image_url; return x; },
    seo: function (n, i) { return seoVia("article", String(i)); }, title: function (f) { return f.title_ar; },
    fields: function () { return [F("title_ar", "العنوان", "Title", "text", { req: 1, max: 300, w: 1 }), F("title_en", "العنوان بالإنجليزي", "Title in English", "text", { max: 300, w: 1, dir: "ltr" }), F("source_name", "اسم المصدر", "Source name", "text", { req: 1, max: 120 }), F("date", "التاريخ", "Date", "date", { req: 1 }), F("category_ar", "التصنيف", "Category", "text", { max: 80 }), F("region_code", "المحافظة", "Governorate", "gov"), F("url", "رابط الخبر في المصدر (https)", "Link to the article at the source (https)", "url", { req: 1, w: 1, hint: ["مطلوب للنشر", "Required to publish"] }), F("summary_ar", "الملخص", "Summary", "ta", { max: 1200 }), F("summary_en", "الملخص بالإنجليزي", "Summary in English", "ta", { max: 1200, dir: "ltr" }), F("image", "الصورة", "Image", "img", { purpose: "news" })]; }
  });
  defColl("event", {
    label: ["الفعاليات والمعارض", "Events & exhibitions"], files: ["regions", "real"], adds: true, src: true, hub: "/events/",
    arr: function () { return (W.REAL && REAL.events) || []; }, bkey: function (e) { return e.id; },
    from: function (e) { var x = clone(e); x.image = e.image_file || ""; return x; },
    seo: function (e) { return seoVia("event", e.id); }, title: function (f) { return f.name_ar; },
    fields: function () { return [F("name_ar", "اسم الفعالية", "Event name", "text", { req: 1, max: 200, w: 1 }), F("name_en", "الاسم بالإنجليزي", "Name in English", "text", { max: 200, w: 1, dir: "ltr" }), F("start_date", "تاريخ البداية", "Start date", "date", { req: 1 }), F("end_date", "تاريخ النهاية", "End date", "date"), F("venue", "المكان", "Venue", "text", { max: 200 }), F("organizer", "المنظّم", "Organizer", "text", { max: 200 }), F("city", "المدينة", "City", "text", { max: 120 }), F("region_code", "المحافظة", "Governorate", "gov"), F("sector_ar", "القطاع", "Sector", "text", { max: 120 }), F("url", "موقع الفعالية", "Event website", "url"), SRCF(), F("about_ar", "عن الفعالية", "About", "ta", { max: 2000 }), F("agenda_ar", "البرنامج (سطر لكل بند)", "Agenda (one item per line)", "lines", { max: 200 }), F("image", "الصورة", "Image", "img", { purpose: "event" })]; }
  });
  defColl("award", {
    label: ["الترسيات والفائزون", "Awards & winners"], files: ["regions", "real"], adds: true, src: true, hub: "/awards/",
    arr: function () { return (W.REAL && REAL.awards) || []; }, bkey: function (a) { return a.title_ar + "|" + a.date + "|" + (a.source_url || ""); }, from: function (a) { return clone(a); },
    seo: function (a, i) { return seoVia("winner", String(i)); }, title: function (f) { return f.title_ar; },
    fields: function () { return [F("title_ar", "العقد / المشروع", "Contract / project", "text", { req: 1, max: 300, w: 1 }), F("title_en", "بالإنجليزي", "In English", "text", { max: 300, w: 1, dir: "ltr" }), F("winner_ar", "الشركة الفائزة", "Winner", "text", { req: 1, max: 200 }), F("winner_en", "الفائز بالإنجليزي", "Winner in English", "text", { max: 200, dir: "ltr" }), F("awarding_entity_ar", "الجهة المانحة", "Awarding entity", "text", { max: 200 }), F("awarding_entity_en", "الجهة بالإنجليزي", "Entity in English", "text", { max: 200, dir: "ltr" }), F("value_egp_million", "القيمة (مليون جنيه)", "Value (EGP million)", "num", { min: 0 }), F("value_usd_million", "القيمة (مليون دولار)", "Value (USD million)", "num", { min: 0 }), F("value_eur_million", "القيمة (مليون يورو)", "Value (EUR million)", "num", { min: 0 }), F("region_code", "المحافظة", "Governorate", "gov"), F("city", "المدينة", "City", "text", { max: 120 }), F("date", "التاريخ", "Date", "date", { req: 1 }), SRCF()]; }
  });
  defColl("opp", {
    label: ["فرص بمصادر", "Sourced opportunities"], files: ["regions", "real"], adds: true, src: true, hub: "/tenders/",
    arr: function () { return (W.REAL && REAL.tenders) || []; }, bkey: function (t) { return t.id; }, from: function (t) { return clone(t); },
    seo: function (t, i) { return seoVia("opportunity", W.MIGOID ? String(MIGOID(t, i)).toLowerCase() : ""); }, title: function (f) { return f.title_ar; },
    fields: function () { return [F("ref", "الرقم المرجعي", "Reference", "text", { max: 80 }), F("procurement_type", "نوع الطرح", "Procurement type", "sel", { opts: [["", "—", "—"]].concat(TEND_TYPES) }), F("title_ar", "العنوان", "Title", "text", { req: 1, max: 300, w: 1 }), F("title_en", "العنوان بالإنجليزي", "Title in English", "text", { max: 300, w: 1, dir: "ltr" }), F("entity_ar", "الجهة", "Entity", "text", { req: 1, max: 200 }), F("entity_en", "الجهة بالإنجليزي", "Entity in English", "text", { max: 200, dir: "ltr" }), F("region_code", "المحافظة", "Governorate", "gov"), F("city", "المدينة", "City", "text", { max: 120 }), F("sector_ar", "القطاع", "Sector", "text", { max: 120 }), F("kind", "نوع الجهة", "Entity kind", "text", { max: 40, dir: "ltr" }), F("publish_date", "تاريخ النشر", "Published", "date", { req: 1 }), F("closing_date", "آخر موعد", "Closing date", "date"), F("status", "الحالة", "Status", "sel", { opts: [["open", "مفتوحة", "Open"], ["closed", "مغلقة", "Closed"]] }), F("bid_bond_egp", "التأمين (جنيه)", "Bid bond (EGP)", "num", { min: 0 }), F("booklet_price_egp", "ثمن الكراسة (جنيه)", "Booklet (EGP)", "num", { min: 0 }), F("via", "نُشرت عن طريق", "Published via", "text", { max: 200 }), SRCF(), F("note", "ملاحظة", "Note", "ta", { max: 600 })]; }
  });
  defColl("intl", {
    label: ["فرص دولية", "International opportunities"], files: ["real"], adds: false, hub: "/tenders/",
    arr: function () { return (W.REAL && REAL.tenders_intl) || []; }, bkey: function (t) { return t.ref; }, from: function (t) { return clone(t); },
    seo: function (t, i) { return seoVia("opportunity", "in" + (i + 1)); }, title: function (f) { return f.title_ar; },
    fields: function () { return [F("title_ar", "العنوان", "Title", "text", { max: 300, w: 1 }), F("title_en", "العنوان بالإنجليزي", "Title in English", "text", { max: 300, w: 1, dir: "ltr" }), F("entity_ar", "الجهة", "Entity", "text", { max: 200 }), F("sector_ar", "القطاع", "Sector", "text", { max: 120 }), F("closing_date", "آخر موعد", "Closing date", "date"), F("estimated_value", "القيمة التقديرية", "Estimated value", "num", { min: 0 }), F("currency", "العملة", "Currency", "text", { max: 8, dir: "ltr" }), SRCF()]; }
  });
  defColl("video", {
    label: ["الفيديوهات", "Videos"], files: ["regions", "videos"], adds: true, hub: "/videos/",
    arr: function () { return W.MIGVIDS || []; }, bkey: function (v) { return v.id; }, from: function (v) { return clone(v); },
    seo: function () { return Promise.resolve(""); }, title: function (f) { return f.title_ar || f.title_original; },
    fields: function (isNew) { return (isNew ? [F("url", "رابط يوتيوب", "YouTube link", "url", { req: 1, w: 1, hint: ["السيرفر بيتأكد من الفيديو من يوتيوب (oEmbed) وبيكمّل العنوان والقناة — اللي مايتأكدش مايتنشرش", "The server checks the video with YouTube (oEmbed) and fills the title and channel — unconfirmed videos are not published"] })] : []).concat([F("title_ar", "العنوان", "Title", "text", { req: !isNew, max: 300, w: 1 }), F("title_en", "العنوان بالإنجليزي", "Title in English", "text", { max: 300, w: 1, dir: "ltr" }), F("channel", "القناة", "Channel", "text", { max: 120, ro: isNew }), F("date", "التاريخ", "Date", "date"), F("date_approx", "التاريخ تقريبي", "Approximate date", "chk"), F("category_ar", "التصنيف", "Category", "text", { max: 80 }), F("governorate", "المحافظة", "Governorate", "gov"), F("lang", "لغة الفيديو", "Video language", "sel", { opts: [["ar", "عربي", "Arabic"], ["en", "إنجليزي", "English"]] })]); }
  });
  defColl("proj", {
    label: ["المشاريع", "Projects"], files: ["regions", "projects"], adds: true, src: true, hub: "/projects/",
    arr: function () { return (W.MIG && MIG.PROJECTS) || []; }, bkey: function (p) { return p[0]; },
    from: function (p) { return { id: p[0], name: p[1], region: p[2], city: p[3], sector: p[4], stage: p[5] == null ? "" : String(p[5]), value: p[6], owner: p[7], contractor: p[8], consultant: p[9], start: p[10], end: p[11], updates: p[14] || [], source_url: p[15] || "", image: p[16] || "" }; },
    seo: function (p) { return seoVia("project", p[0]); }, title: function (f) { return f.name; },
    pre: function (v) { if (v.stage !== "" && v.stage != null) v.stage = +v.stage; if (Array.isArray(v.updates)) v.updates = v.updates.slice(0, 10).map(function (l) { var x = String(l).split("|"); return [trim(x[0]), trim(x.slice(1).join("|"))]; }); },
    fields: function () { return [F("name", "اسم المشروع", "Project name", "text", { req: 1, max: 300, w: 1 }), F("region", "المنطقة («محافظة …»)", "Region («محافظة …»)", "text", { max: 120 }), F("city", "المدينة", "City", "text", { max: 120 }), F("sector", "القطاع", "Sector", "text", { max: 120 }), F("stage", "المرحلة", "Stage", "sel", { req: 1, opts: [["", "—", "—"]].concat(STAGES) }), F("value", "القيمة (مليون جنيه)", "Value (EGP million)", "num", { min: 0 }), F("owner", "المالك", "Owner", "text", { max: 200 }), F("contractor", "المقاول", "Contractor", "text", { max: 200 }), F("consultant", "الاستشاري", "Consultant", "text", { max: 200 }), F("start", "البداية", "Start", "text", { max: 20 }), F("end", "النهاية", "End", "text", { max: 20 }), SRCF(), F("updates", "التحديثات (سطر لكل تحديث: التاريخ | النص)", "Updates (one per line: date | text)", "lines", { max: 300 }), F("image", "الصورة", "Image", "img", { purpose: "project" })]; }
  });
  defColl("banner", {
    label: ["البانرات الإعلانية", "Banners"], files: [], adds: true, hub: "", baseRO: true,
    arr: function () { return CFG.banners || []; }, bkey: function (b) { return b.img; },
    from: function (b) { return { img: b.img, alt_ar: b.alt, title_ar: b.alt, link: b.link, place: b.place, builtin: 1 }; },
    seo: function () { return Promise.resolve(""); }, title: function (f) { return f.title_ar || f.alt_ar || f.img; },
    fields: function () { return [F("title_ar", "الشريك / العنوان", "Partner / title", "text", { req: 1, max: 160 }), F("title_en", "بالإنجليزي", "In English", "text", { max: 160, dir: "ltr" }), F("place", "المكان", "Placement", "sel", { req: 1, opts: [["strategic", "شريط الشركاء الاستراتيجيين", "Strategic partners strip"], ["partner", "شريط الشركاء الأساسيين", "Core partners strip"], ["home", "الرئيسية", "Home page"]] }), F("link", "الرابط (مسار من الموقع أو https)", "Link (site path or https)", "url", { path: 1 }), F("start", "يبدأ", "Starts", "date"), F("end", "ينتهي", "Ends", "date"), F("sort", "الترتيب", "Order", "int", { min: 0, maxv: 999 }), F("member_id", "العضو المرتبط (رقم الحساب، اختياري)", "Linked member (account id, optional)", "text", { max: 40, dir: "ltr" }), F("alt_ar", "وصف الصورة", "Image description", "text", { max: 160 }), F("alt_en", "وصف الصورة بالإنجليزي", "Image description in English", "text", { max: 160, dir: "ltr" }), F("img", "صورة البانر", "Banner image", "img", { req: 1, purpose: "banner", hint: ["أقل مقاس 1120×200 بكسل", "At least 1120×200 px"] })]; }
  });
  defColl("notice", {
    label: ["إعلانات الموقع", "Site notices"], files: [], adds: true, hub: "",
    arr: function () { return []; }, bkey: function (n) { return n.id; }, from: function (n) { return clone(n); },
    seo: function () { return Promise.resolve(""); }, title: function (f) { return f.text_ar; },
    fields: function () { return [F("text_ar", "النص", "Text", "text", { req: 1, max: 200, w: 1 }), F("text_en", "النص بالإنجليزي", "Text in English", "text", { max: 200, w: 1, dir: "ltr" }), F("link", "الرابط (اختياري)", "Link (optional)", "url", { path: 1 }), F("level", "النوع", "Level", "sel", { opts: [["info", "معلومة", "Info"], ["success", "خبر حلو", "Good news"], ["warn", "تنبيه", "Warning"]] }), F("pages", "الصفحات (فاضي = كل الصفحات)", "Pages (empty = every page)", "tags", { dir: "ltr", hint: ["مفاتيح الصفحات زي: home, market, tenders", "Page keys such as: home, market, tenders"] }), F("dismissible", "ممكن يتقفل", "Can be dismissed", "chk"), F("start", "يبدأ", "Starts", "date"), F("end", "ينتهي", "Ends", "date")]; }
  });
  defColl("cats", {
    label: ["تصنيفات السوق", "Market categories"], files: ["oldprod", "products"], adds: true, hub: "",
    arr: function () { return catList(); }, bkey: function (c) { return c[0]; },
    from: function (c) { return { key: c[0], ar: c[1], en: CAT_EN[c[0]] || "", icon: c[2] || "" }; },
    seo: function () { return Promise.resolve(""); }, title: function (f) { return f.ar; },
    fields: function (isNew) { return [F("key", "المفتاح (حروف إنجليزي صغيرة)", "Key (lower-case letters)", "text", { req: 1, max: 20, dir: "ltr", ro: !isNew, check: function (x) { return /^[a-z][a-z0-9_]{1,19}$/.test(x) ? "" : T("حروف إنجليزي صغيرة وأرقام بس", "Lower-case letters and digits only"); } }), F("icon", "أيقونة (إيموجي)", "Icon (emoji)", "text", { max: 4 }), F("ar", "الاسم", "Name", "text", { req: 1, max: 60 }), F("en", "الاسم بالإنجليزي", "Name in English", "text", { max: 60, dir: "ltr" })]; }
  });

  /* ---------- merge ---------- */
  function ceRows(def, items) {
    var byBase = {}, adds = [], rows = [];
    (items || []).forEach(function (x) { if (x.kind === "base") byBase[String(x.base_key)] = x; else adds.push(x); });
    var arr = def.arr() || [];
    for (var i = 0; i < arr.length; i++) { var row = arr[i]; if (!row) continue; var k = ovlKey(def, row, i), f = def.from(row, i), cr = byBase[k] || null; rows.push(mkRow(def, "base", f, cr, k, i, row)); }
    adds.sort(function (a, b) { return String(a.created_at || "").localeCompare(String(b.created_at || "")); });
    adds.forEach(function (x) { rows.push(mkRow(def, "add", Object.assign({}, x.live && x.state === "published" ? x.live : {}, x.draft || {}), x, x.id, -1, null)); });
    return rows;
  }
  function mkRow(def, kind, f, cr, key, i, raw) {
    var m = Object.assign({}, f);
    if (cr && kind === "base") { var d = cr.draft || {}; Object.keys(d).forEach(function (k) { if (d[k] !== null && d[k] !== undefined) m[k] = d[k]; }); }
    return { kind: kind, key: key, i: i, base: f, f: m, cr: cr, raw: raw, coll: def.key };
  }
  function crHidden(cr) { return !!(cr && (cr.live_hidden || cr.deleted)); }
  function stateH(r) {
    var cr = r.cr, out = [];
    if (!cr) return tag(r.kind === "base" ? T("منشور (من بيانات الموقع)", "Published (site data)") : T("مسودة لم تُنشر", "Unpublished draft"), r.kind === "base" ? "ok" : "p");
    if (cr.deleted) out.push(tag(cr.state === "published" && !cr.live_json ? T("محذوف", "Deleted") : T("محذوف (ينتظر النشر)", "Deleted (waiting for publish)"), "x"));
    else if (cr.hidden && cr.live_hidden) out.push(tag(T("مخفي", "Hidden"), "x"));
    else if (cr.hidden) out.push(tag(T("مخفي (لسه مانشرش)", "Hidden (not published yet)"), "p"));
    else if (cr.live_hidden) out.push(tag(T("مخفي — الإظهار لسه مانشرش", "Hidden — unhiding not published yet"), "p"));
    if (!cr.deleted && cr.state === "draft") out.push(tag(T("مسودة لم تُنشر", "Unpublished draft"), "p"));
    if (!cr.deleted && cr.state === "published" && !cr.hidden && !cr.live_hidden) out.push(tag(T("منشور", "Published"), "ok"));
    if (cr.static_impact && cr.state === "published" && cr.published_v && (BAKED.v == null || cr.published_v > BAKED.v)) out.push(tag(T("يحتاج إعادة بناء", "Needs a rebuild"), "b"));
    if (cr.source === "member") out.push(tag(T("من العضو", "From the member"), "g"));
    if (cr.source === "import") out.push(tag(T("مستورد", "Imported"), "g"));
    return out.join(" ");
  }
  function visH(r) { return crHidden(r.cr) || (r.cr && r.cr.hidden) ? tag(T("مخفي", "Hidden"), "p") : tag(T("ظاهر", "Visible")); }
  function ceText(r) { var f = r.f; return nfc(Object.keys(f).map(function (k) { var v = f[k]; return typeof v === "string" ? v : Array.isArray(v) ? v.join(" ") : typeof v === "number" ? String(v) : ""; }).join(" ") + " " + (r.key || "")).toLowerCase(); }
  function ceLoad(def) { return need(def.files).then(function () { return Promise.all([GET("/admin/cc/content/" + def.key + "?all=1"), bakedV()]); }).then(function (x) { return ceRows(def, x[0].items || []); }); }
  function cw(def) { return can(def.perm.w); }
  function cp(def) { return can(def.perm.p); }
  function ceActs(def, r, i) {
    var a = [], w = cw(def), p = cp(def), hid = crHidden(r.cr) || (r.cr && r.cr.hidden);
    if (w && !(def.baseRO && r.kind === "base")) a.push('<button type="button" class="btn s l" data-a="ced" data-i="' + i + '">' + h(T("تعديل", "Edit")) + "</button>");
    if (w && !(r.cr && r.cr.deleted)) a.push('<button type="button" class="btn s l" data-a="' + (hid ? "ceun" : "cehd") + '" data-i="' + i + '">' + h(hid ? T("إظهار", "Show") : def.baseRO && r.kind === "base" ? T("إخفاء البانر الأصلي", "Hide the built-in banner") : T("إخفاء", "Hide")) + "</button>");
    if (p && r.cr && r.cr.state === "draft" && !r.cr.deleted) a.push('<button type="button" class="btn s r" data-a="cepub" data-i="' + i + '">' + h(T("انشر", "Publish")) + "</button>");
    if (w && r.cr && r.cr.state === "draft" && r.cr.live_json) a.push('<button type="button" class="btn s l" data-a="cedis" data-i="' + i + '">' + h(T("تجاهل المسودة", "Discard draft")) + "</button>");
    if (p && r.kind === "add" && r.cr && !r.cr.deleted) a.push('<button type="button" class="btn s d" data-a="cedel" data-i="' + i + '">' + h(T("حذف", "Delete")) + "</button>");
    if (p && r.kind === "base" && r.cr && !def.baseRO && r.cr.draft && Object.keys(r.cr.draft).length) a.push('<button type="button" class="btn s l" data-a="cerev" data-i="' + i + '" title="' + h(T("يرجّع بيانات البناء الأصلية", "Back to the build data")) + '">' + h(T("رجوع للأصل", "Revert")) + "</button>");
    return a.join(" ");
  }
  function seoPathOf(def, r) { if (r.kind !== "base" || !def.seo) { return r.kind === "add" && def.key === "fac" ? seoVia("company", r.key) : Promise.resolve(""); } return def.seo(r.raw, r.i).catch(function () { return ""; }); }
  function same(a, b) { var n = function (x) { if (x === undefined || x === null) return ""; if (Array.isArray(x)) return JSON.stringify(x.map(function (y) { return Array.isArray(y) ? y.map(str) : str(y); })); if (typeof x === "boolean") return x ? "1" : "0"; return str(x); }; return n(a) === n(b); }
  /* save one editor: add (POST) · first edit of a base row (POST base_key) · later edits (PATCH, null = back to the build value) */
  function ceSave(def, r, v, publish) {
    if (def.pre) def.pre(v);
    var body = { publish: !!publish };
    var chg = {};
    if (!r) { Object.keys(v).forEach(function (k) { var x = v[k]; if (x === "" || x == null || (Array.isArray(x) && !x.length)) return; chg[k] = x; }); body.fields = chg; return POST("/admin/cc/content/" + def.key, body); }
    Object.keys(v).forEach(function (k) {
      if (r.kind === "base") { if (same(v[k], r.base[k])) { if (r.cr && r.cr.draft && own(r.cr.draft, k) && r.cr.draft[k] !== null) chg[k] = null; } else chg[k] = v[k]; }
      else if (!same(v[k], r.f[k])) chg[k] = v[k];
    });
    return seoPathOf(def, r).then(function (sp) {
      body.fields = chg; if (sp) body.seo_path = sp;
      if (!r.cr) { if (!Object.keys(chg).length) return { nothing: 1 }; body.base_key = r.key; return POST("/admin/cc/content/" + def.key, body); }
      if (!Object.keys(chg).length && !publish) return { nothing: 1 };
      return PATCH("/admin/cc/content/" + def.key + "/" + enc(r.cr.id), body);
    });
  }
  function ceEditor(def, r, done, o) {
    o = o || {};
    var isNew = !r;
    var go2 = function () {
      if (r && r.kind === "base" && def.prep) { r.base = def.from(r.raw, r.i); var r2 = mkRow(def, "base", r.base, r.cr, r.key, r.i, r.raw); r.f = r2.f; }
      var fields = typeof def.fields === "function" ? def.fields(isNew) : def.fields;
      var vals = r ? clone(r.f) : Object.assign({}, o.defaults || {});
      if (def.key === "notice" && isNew && vals.dismissible == null) vals.dismissible = 1;
      var p = cp(def), srcF = def.src ? (def.srcField || "source_url") : "";
      var bx = modal(mh(isNew ? L2(o.addTitle || [T("إضافة", "Add"), T("إضافة", "Add")]) : T("تعديل", "Edit")) + (r && r.cr && r.cr.source === "member" ? '<div class="info">' + h(T("العنصر ده جه من العضو", "This item came from the member")) + (r.cr.member_id ? ' <small dir="ltr">' + h(r.cr.member_id) + "</small>" : "") + ' — <a href="#approvals">' + h(T("الموافقات", "Approvals")) + "</a></div>" : "") + (o.above || "") + formH(fields, vals) + (o.below ? o.below(r) : "")
        + '<div class="ft2">' + (p ? '<button type="button" class="btn r" data-a="svp">' + h(T("حفظ ونشر", "Save & publish")) + "</button>" : "") + '<button type="button" class="btn ' + (p ? "l" : "r") + '" data-a="svd">' + h(T("حفظ كمسودة", "Save as draft")) + '</button><button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + "</button></div>" + (p ? "" : '<p class="mut sm">' + h(T("النشر محتاج صلاحية «نشر المحتوى» — المسودة بتستنى حد ينشرها.", "Publishing needs the content.publish permission — the draft waits for someone to publish it.")) + "</p>") + '<div class="er" role="alert"></div>', {
        wide: true, on: Object.assign({}, PICK_ON, CO_ON, {
          svp: function (b) { save(b, true); }, svd: function (b) { save(b, false); }
        })
      });
      bindUploads(bx); bindCo(bx);
      function save(b, publish) {
        var v = readForm(bx, fields), er = $(".er", bx); er.textContent = "";
        var errs = validate(fields, v, { noReq: r && r.kind === "base" });
        if (publish && srcF && !trim(v[srcF]) && !(r && r.kind === "base" && trim(r.base[srcF]))) errs[srcF] = L2(ERRS.source_required);
        if (showErrs(bx, errs)) return;
        b.disabled = true;
        ceSave(def, r, v, publish).then(function (j) {
          closeModal();
          if (j && j.nothing) { toast(T("مفيش تغيير", "Nothing changed")); return; }
          toast(publish ? T("اتنشر ✓ (يظهر على الموقع خلال دقيقة)", "Published ✓ (visible on the site within a minute)") : T("تم الحفظ ✓ — مسودة لسه مانشرتش", "Saved ✓ — a draft, not published yet"));
          done && done(j); badges();
        }, function (e) {
          b.disabled = false; var se = serverErrs(e); showErrs(bx, se);
          var rest = unmapped(se, fields);
          er.innerHTML = h(errText(e)) + (rest.length ? '<br><small dir="auto">' + h(rest.join(" · ")) + "</small>" : "") + errSmall(e);
        });
      }
    };
    if (r && r.kind === "base" && def.prep) { modal(mh(T("تعديل", "Edit")) + loadingH()); need(def.prep).then(go2, function (e) { modal(mh(T("تعديل", "Edit")) + errH(e, false)); }); }
    else go2();
  }
  /* company picker for products (company_url = the producer's MIGOLDFAC [7] URL, or an added company's URL) */
  function coUrl(x) { return x.url || (x.ref && /^c-/.test(x.ref) ? "https://www.madeinegyptgate.com/factories/" + slugAr(x.name) + "-" + x.ref.slice(2) + "/" : ""); }
  var CO_ON = {
    coset: function (b) { var root = $("#bx"), n = b.getAttribute("data-n"); $('[data-f="' + n + '"]', root).value = b.getAttribute("data-v"); $('[data-co="' + n + '"] [data-con]', root).textContent = b.getAttribute("data-t"); $('[data-co="' + n + '"] [data-cor]', root).innerHTML = ""; }
  };
  function bindCo(root) {
    $$("[data-co]", root).forEach(function (box) {
      var n = box.getAttribute("data-co"), hid = $('[data-f="' + n + '"]', root), q = $("[data-coq]", box), out = $("[data-cor]", box), nm = $("[data-con]", box);
      if (hid.value) dirIndex().then(function (l) { var m = l.filter(function (x) { return coUrl(x) && urlKey(coUrl(x)) === urlKey(hid.value); })[0]; nm.textContent = m ? m.name : hid.value; }, function () {});
      q.addEventListener("input", function () {
        var v = nfc(trim(q.value)).toLowerCase(); if (v.length < 2) { out.innerHTML = ""; return; }
        dirIndex().then(function (l) { var m = l.filter(function (x) { return coUrl(x) && String(x.name || "").toLowerCase().indexOf(v) > -1; }).slice(0, 8); out.innerHTML = m.length ? m.map(function (x) { return '<button type="button" class="btn s l" style="margin:4px 4px 0 0" data-a="coset" data-n="' + n + '" data-v="' + h(coUrl(x)) + '" data-t="' + h(x.name) + '" dir="auto">' + h(x.name) + "</button>"; }).join("") : '<small class="mut">' + h(T("مفيش شركة بالاسم ده.", "No company with this name.")) + "</small>"; });
      });
    });
  }
  /* the "co" field type (rendered by the content editor) */
  var _fieldH0 = fieldH;
  fieldH = function (f, v) {
    if (f.t !== "co") return _fieldH0(f, v);
    return '<div class="w"><label>' + h(L2(f.l)) + (f.req ? ' <b class="bad">*</b>' : "") + '</label><input type="hidden" data-f="' + f.n + '" value="' + h(v || "") + '"><div data-co="' + f.n + '"><b data-con dir="auto">' + h(v ? T("جارٍ التحميل…", "Loading…") : T("مش محددة", "Not set")) + '</b><input data-coq dir="auto" placeholder="' + h(T("ابحث باسم الشركة في الدليل…", "Search the directory by company name…")) + '" style="width:100%;margin-top:6px;padding:9px;border:1px solid #CBD5E1;border-radius:9px;font:inherit"><div data-cor></div></div><div class="fe" data-fe="' + f.n + '"></div></div>';
  };

  /* ---------- the list of one collection (tabs = several collections in one section) ---------- */
  /* o: {title, sub, note, tabs:[[coll, ar, en]], cols(def) → cols, filter(r, c), bar(c) → extra filters HTML, addDefaults, addTitle, csvName} */
  function ceSection(o) {
    var c = CUR; c.st.tab = c.st.tab || (o.tabs ? o.tabs[0][0] : o.coll); c.st.q = ""; c.st.page = 0;
    var tc = function (t) { var x = (o.tabs || []).filter(function (y) { return y[0] === t; })[0]; return (x && x[3]) || t; };
    var def = function () { return COLL[tc(c.st.tab)]; };
    var paintHead = function () {
      var d = def();
      head(o.title, o.sub || "", srch(c.st.q) + (o.bar ? o.bar(c) : "") + (d.adds && cw(d) && !o.noAdd ? btn("ceadd", h(o.addLabel ? L2(o.addLabel) : T("➕ إضافة", "➕ Add")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))));
    };
    var paint = function () {
      var d = def(), rows = (c.st.rows || []).filter(function (r) { return (!c.st.q || ceText(r).indexOf(nfc(c.st.q).toLowerCase()) > -1) && (!o.filter || o.filter(r, c)); });
      c.st.view = rows;
      var lim = 50, pg = Math.min(c.st.page, Math.max(0, Math.ceil(rows.length / lim) - 1)); c.st.page = pg;
      var cols = o.cols(d, c).concat([["حالة النشر", "Publishing", function (r) { return stateH(r); }]]);
      $("#tb").innerHTML = tableH(cols, rows.slice(pg * lim, pg * lim + lim), { count: rows.length, empty: o.empty || T("مفيش نتايج بالفلتر ده.", "Nothing matches this filter."), acts: function (r) { return ceActs(d, r, rows.indexOf(r)); } });
      $("#pgn").innerHTML = pagerH(pg, rows.length, lim);
    };
    var load = function () {
      var d = def(); $("#tb").innerHTML = '<div style="padding:18px" role="status">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>"; $("#pgn").innerHTML = "";
      ceLoad(d).then(function (rows) { if (!alive(c) || def() !== d) return; c.st.rows = rows; if (o.loaded) o.loaded(c, rows); paint(); }, function (e) { if (alive(c)) $("#tb").innerHTML = '<div style="padding:12px">' + errH(e) + "</div>"; });
    };
    paintHead();
    setCt((o.tabs ? tabsH(o.tabs.map(function (t) { return [t[0], t[1], t[2]]; }), c.st.tab, "cetab") : "") + (o.note ? '<div class="note">' + o.note + "</div>" : "") + (o.top ? o.top(c) : "") + '<div class="cd"><div id="tb"></div><div class="pg" id="pgn"></div></div>');
    c.q = function (v) { c.st.q = v; c.st.page = 0; paint(); };
    c.page = function (dlt) { c.st.page = Math.max(0, c.st.page + dlt); paint(); };
    c.paint = paint; c.load = load;
    c.on.cetab = function (b) { c.st.tab = b.getAttribute("data-v"); c.st.page = 0; c.st.rows = null; $$(".tabs [data-a=cetab]").forEach(function (x) { var on = x.getAttribute("data-v") === c.st.tab; x.classList.toggle("on", on); x.setAttribute("aria-selected", on ? "true" : "false"); }); paintHead(); load(); };
    c.on.rf = load;
    c.on.ex = function () { var d = def(); csvSave(o.csvName || (c.key + (o.tabs ? "-" + c.st.tab : "")), (c.st.view || []).map(function (r) { var x = { id: r.cr ? r.cr.id : "", key: r.key, kind: r.kind, state: r.cr ? r.cr.state : "build", hidden: crHidden(r.cr) ? 1 : 0 }; Object.keys(r.f).forEach(function (k) { if (k !== "builtin") x[k] = r.f[k]; }); return x; })); };
    c.on.ceadd = function () { ceEditor(def(), null, load, { defaults: o.addDefaults ? o.addDefaults(c) : {}, addTitle: o.addTitle }); };
    var R = function (b) { return (c.st.view || [])[+b.getAttribute("data-i")]; };
    c.on.ced = function (b) { var r = R(b); if (r) ceEditor(def(), r, load, o.editOpts ? o.editOpts(r) : {}); };
    c.on.cehd = function (b) { var r = R(b); if (r) ceHide(def(), r, true, load, b); };
    c.on.ceun = function (b) { var r = R(b); if (r) ceHide(def(), r, false, load, b); };
    c.on.cepub = function (b) { var r = R(b); if (!r || !r.cr) return; b.disabled = true; POST("/admin/cc/content/publish", { ids: [r.cr.id] }).then(function (j) { toast(T("اتنشر ✓ (يظهر على الموقع خلال دقيقة)", "Published ✓ (visible on the site within a minute)")); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.cedis = function (b) { var r = R(b); if (!r || !r.cr || !sure(T("تجاهل المسودة والرجوع للنسخة المنشورة؟", "Discard the draft and go back to the published version?"))) return; b.disabled = true; POST("/admin/cc/content/" + def().key + "/" + enc(r.cr.id) + "/discard").then(function () { toast(T("تم ✓", "Done ✓")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.cedel = function (b) { var r = R(b); if (!r || !r.cr || !sure()) return; b.disabled = true; DEL("/admin/cc/content/" + def().key + "/" + enc(r.cr.id), { confirm: true }).then(function (j) { toast(T("تم الحذف", "Deleted") + edgeNote(j && j.edge)); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.cerev = function (b) { var r = R(b); if (!r || !r.cr || !sure(T("ترجع البيانات الأصلية وتلغي كل تعديلات العنصر ده؟ بيتطبّق مع النشر الجاي.", "Go back to the build data and drop every edit of this item? It applies with the next publish."))) return; b.disabled = true; DEL("/admin/cc/content/" + def().key + "/" + enc(r.cr.id), { confirm: true }).then(function (j) { toast(T("اترجّع للأصل ✓", "Reverted ✓") + edgeNote(j && j.edge)); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    if (o.on) Object.keys(o.on).forEach(function (k) { c.on[k] = function (b, ev) { o.on[k](b, c, R, ev); }; });
    if (o.ch) Object.keys(o.ch).forEach(function (k) { c.ch[k] = function (t) { o.ch[k](t, c); }; });
    load();
  }
  function edgeNote(edge) { var l = edge || [], f = l.filter(function (x) { return x.status === "failed" || x.status === "pending"; }).length; return l.length ? (f ? T(" — إجراء صفحة جوجل مستني (شوف «النشر والتحديث»)", " — the search-page action is waiting (see «Publishing & rebuild»)") : T(" — وصفحة البحث اتحدّثت", " — and the search page was updated")) : ""; }
  function ceHide(def, r, hide, done, b) {
    if (hide && !sure(T("إخفاء العنصر ده من الموقع؟ (تقدر ترجّعه بعدين)", "Hide this item from the site? (You can show it again later)"))) return;
    if (b) b.disabled = true;
    var publish = cp(def);
    seoPathOf(def, r).then(function (sp) {
      if (!r.cr && hide) return POST("/admin/cc/content/" + def.key + "/hide", { base_key: r.key, seo_path: sp || undefined, publish: publish });
      if (!r.cr) return {};
      return POST("/admin/cc/content/" + def.key + "/" + enc(r.cr.id) + "/" + (hide ? "hide" : "unhide"), { publish: publish });
    }).then(function (j) {
      toast((hide ? T("اتخفى", "Hidden") : T("ظهر تاني", "Shown again")) + (publish ? T(" ✓ (على الموقع خلال دقيقة)", " ✓ (on the site within a minute)") : T(" — مسودة، محتاجة نشر", " — a draft that needs publishing")) + edgeNote(j && j.edge));
      done(); badges();
    }, function (e) { if (b) b.disabled = false; toast(errText(e), 1); });
  }

  /* =====================================================================================================================
     members — دليل الشركات: MIGOLDFAC + MIGFACX + adds + Control Center edits; imported old companies (admin-only contacts)
     ===================================================================================================================== */
  var LEGX = null;
  function legacyIdx() {
    if (LEGX) return LEGX;
    if (!can("legacy.contacts")) return Promise.resolve({ byRef: {}, list: [] });
    LEGX = (function pull(p, acc) { return GET("/admin/cc/legacy/companies" + qs({ page: p, limit: 200 })).then(function (j) { var it = j.items || []; acc = acc.concat(it); return it.length === 200 && p < 9 ? pull(p + 1, acc) : acc; }); })(0, []).then(function (list) { var by = {}; list.forEach(function (x) { var k = x.factory_ref || x.suggested_ref; if (k && !by[k]) by[k] = x; }); return { byRef: by, list: list }; }, function () { LEGX = null; return { byRef: {}, list: [] }; });
    return LEGX;
  }
  var MEMX = null;
  function memberLinks() {
    if (MEMX) return MEMX;
    if (!can("members.read")) return Promise.resolve(null);
    MEMX = (function pull(p, acc) { return GET("/admin/cc/members" + qs({ page: p, limit: 200 })).then(function (j) { var it = j.items || []; acc = acc.concat(it); return it.length === 200 && p < 4 ? pull(p + 1, acc) : acc; }); })(0, []).then(function (list) { var by = {}; list.forEach(function (m) { if (m.factory_ref) by[String(m.factory_ref)] = m; }); return by; }, function () { MEMX = null; return null; });
    return MEMX;
  }
  function inForce(m) { var p = planKey(m && m.plan); if (!p) return false; var d = m.plan_until ? dleft(m.plan_until) : null; return d == null || d >= 0; }
  SEC.members = function () {
    var c = CUR; c.st.fl = { sector: "", gov: "", type: "", linked: "", ver: "", hid: "", src: "" };
    if (c.st.mode === "legacy") return legacySection(c);
    var refOf = function (r) { return r.coll === "facx" ? "x" + r.i : r.kind === "add" ? r.key : String(r.i); };
    var fl = c.st.fl;
    ceSection({
      title: T("دليل الشركات", "Company directory"), sub: h(T("الشركات", "Companies")), tabs: [["fac", "دليل المنصة", "Platform directory"], ["facx", "مصادر عامة", "Public sources"]], addLabel: [T("➕ شركة جديدة", "➕ New company"), T("➕ شركة جديدة", "➕ New company")], addTitle: ["شركة جديدة", "New company"],
      top: function () { return (can("legacy.contacts") ? '<div class="acts2" style="margin-bottom:10px">' + btn("legmode", h(T("🗂 شركات النظام القديم (للإدارة فقط)", "🗂 Old-system companies (admins only)")), "l s") + "</div>" : "") + (ST.features.media_r2 === false ? '<div class="note">' + h(L2(ERRS.media_off)) + "</div>" : ""); },
      bar: function () {
        return sel("fsec", [["", "كل القطاعات", "All sectors"]].concat(sectors().map(function (s) { return [s[0], s[0], s[1]]; })), fl.sector, T("القطاع", "Sector"))
          + '<select id="fgov" data-c="fgov" aria-label="' + h(T("المحافظة", "Governorate")) + '">' + govOpts(fl.gov, T("كل المحافظات", "All governorates")) + "</select>"
          + sel("ftyp", [["", "كل الأنواع", "All types"], ["مصنع", "مصنع", "Factory"], ["شركة ومورد", "شركة ومورد", "Company & supplier"], ["شركة", "شركة", "Company"]], fl.type, T("النوع", "Type"))
          + sel("flnk", [["", "مربوط أو لا", "Linked or not"], ["1", "مربوط بعضو", "Linked to a member"], ["0", "مش مربوط", "Not linked"]], fl.linked, T("الربط", "Link"))
          + sel("fver", [["", "موثّق أو لا", "Verified or not"], ["1", "موثّق", "Verified"], ["0", "مش موثّق", "Not verified"]], fl.ver, T("التوثيق", "Verification"))
          + sel("fhid", [["", "ظاهر ومخفي", "Visible and hidden"], ["0", "ظاهر", "Visible"], ["1", "مخفي", "Hidden"]], fl.hid, T("الظهور", "Visibility"))
          + sel("fsrc", [["", "كل المصادر", "All sources"], ["platform", "منصة", "Platform"], ["public", "مصادر عامة", "Public sources"], ["added", "مضاف", "Added"]], fl.src, T("المصدر", "Source"));
      },
      loaded: function (cc, rows) { Promise.all([legacyIdx(), memberLinks()]).then(function (x) { if (!alive(cc)) return; cc.st.leg = x[0].byRef; cc.st.mem = x[1]; cc.paint(); }); },
      filter: function (r, cc) {
        var f = r.f, ref = refOf(r), m = cc.st.mem && cc.st.mem[ref];
        if (fl.sector && f.sector !== fl.sector) return false; if (fl.gov && f.gov !== fl.gov) return false; if (fl.type && f.type !== fl.type) return false;
        if (fl.linked === "1" && !m) return false; if (fl.linked === "0" && m) return false;
        if (fl.ver !== "" && String(f.verified ? 1 : 0) !== fl.ver) return false;
        var hd = crHidden(r.cr) || (r.cr && r.cr.hidden) ? "1" : "0"; if (fl.hid !== "" && hd !== fl.hid) return false;
        var src = r.kind === "add" ? "added" : r.coll === "facx" ? "public" : "platform"; if (fl.src && src !== fl.src) return false;
        return true;
      },
      cols: function (d, cc) {
        var lc = can("legacy.contacts");
        return [["الشركة", "Company", function (r) { var lg = cc.st.leg && cc.st.leg[refOf(r)]; return '<b dir="auto">' + h(r.f.name || "—") + "</b>" + (lg && lc && lg.manager ? '<br><small dir="auto">' + h(lg.manager) + "</small>" : ""); }],
          ["الدولة", "Country", function () { return h(T("مصر", "Egypt")); }]].concat(lc ? [["الهاتف", "Phone", function (r) { var lg = cc.st.leg && cc.st.leg[refOf(r)]; return lg && lg.phones ? '<span dir="ltr">' + h(lg.phones) + '</span><br><small class="mut">' + h(T("للإدارة بس", "admins only")) + "</small>" : "—"; }]] : []).concat([
          ["الموقع", "Website", function (r) { return r.f.website ? lnk(r.f.website) : "—"; }],
          ["الحالة", "Status", function (r) { if (!cc.st.mem) return can("members.read") ? '<small class="mut">…</small>' : "—"; var m = cc.st.mem[refOf(r)]; return m && inForce(m) ? tag(T("مسجّل", "Registered")) : tag(T("عميل محتمل", "Prospect"), "p"); }],
          ["القطاع", "Sector", function (r) { return '<small dir="auto">' + h(secName(r.f.sector || "")) + "</small>"; }],
          ["المحافظة", "Governorate", function (r) { return h(govName(r.f.gov) || "—"); }],
          ["موثّق", "Verified", function (r) { return r.f.verified ? tag("✓", "ok") : "—"; }],
          ["مخفي", "Hidden", function (r) { return crHidden(r.cr) ? tag(T("مخفي", "Hidden"), "x") : "—"; }],
          ["المصدر", "Source", function (r) { return h(r.kind === "add" ? T("مضاف", "Added") : r.coll === "facx" ? T("مصادر عامة", "Public sources") : T("منصة", "Platform")); }],
          ["", "", function (r, i) { var a = []; var ix = (cc.st.view || []).indexOf(r); if (can("directory.verify") && !crHidden(r.cr)) a.push('<button type="button" class="btn s l" data-a="ver" data-i="' + ix + '">' + h(r.f.verified ? T("إلغاء التوثيق", "Unverify") : T("توثيق", "Verify")) + "</button>"); if (can("directory.link")) a.push('<button type="button" class="btn s l" data-a="lnk" data-i="' + ix + '">' + h(T("ربط بعضو", "Link to a member")) + "</button>"); var lg = cc.st.leg && cc.st.leg[refOf(r)]; if (lg && can("members.write")) a.push(lg.status === "registered" ? '<button type="button" class="btn s l" data-a="inv" data-i="' + ix + '">' + h(T("دعوة للتسجيل", "Invite to sign up")) + "</button>" : '<button type="button" class="btn s l" disabled title="' + h(T("الشركات المحتملة مابيتبعتلهاش حاجة", "Prospect companies are never contacted")) + '">' + h(T("دعوة للتسجيل", "Invite to sign up")) + "</button>"); return '<div class="acts2">' + a.join("") + "</div>"; }]]);
      },
      editOpts: function (r) { return { below: function () { var lg = CUR.st.leg && CUR.st.leg[refOf(r)]; if (!lg || !can("legacy.contacts")) return ""; return '<fieldset class="adm"><legend>' + h(T("بيانات من النظام القديم (للإدارة فقط — مابتتنشرش)", "Old-system data (admins only — never published)")) + "</legend>" + kvH([[T("المدير", "Manager"), lg.manager], [T("التليفونات", "Phones"), lg.phones, "ltr"], [T("البريد", "E-mail"), lg.email, "ltr"], [T("العنوان", "Address"), lg.address], [T("النشاط", "Activity"), lg.activity], [T("الحالة", "Status"), lg.status === "registered" ? T("مسجّل", "Registered") : T("عميل محتمل", "Prospect")], [T("رقم قديم", "Old id"), lg.legacy_id, "ltr"]]) + "</fieldset>"; } }; },
      ch: {
        fsec: function (t, cc) { fl.sector = t.value; cc.st.page = 0; cc.paint(); }, fgov: function (t, cc) { fl.gov = t.value; cc.st.page = 0; cc.paint(); }, ftyp: function (t, cc) { fl.type = t.value; cc.st.page = 0; cc.paint(); },
        flnk: function (t, cc) { fl.linked = t.value; cc.st.page = 0; cc.paint(); }, fver: function (t, cc) { fl.ver = t.value; cc.st.page = 0; cc.paint(); }, fhid: function (t, cc) { fl.hid = t.value; cc.st.page = 0; cc.paint(); }, fsrc: function (t, cc) { fl.src = t.value; cc.st.page = 0; cc.paint(); }
      },
      on: {
        legmode: function (b, cc) { cc.st.mode = "legacy"; legacySection(cc); },
        ver: function (b, cc, R) {
          var r = R(b); if (!r) return; var on = !r.f.verified;
          if (!sure(on ? T("توثيق الشركة دي؟ التوثيق بيظهر للزوار — بعد التحقق من المستندات بس.", "Verify this company? The badge is public — only after checking documents.") : T("إلغاء توثيق الشركة دي؟", "Remove this company's verification?"))) return;
          b.disabled = true; var def = COLL[r.coll];
          ceSave(def, r, Object.assign({}, r.f, { verified: on ? 1 : 0 }), true).then(function () { toast(on ? T("اتوثّقت ✓", "Verified ✓") : T("اتشال التوثيق ✓", "Verification removed ✓")); cc.load(); }, function (e) { b.disabled = false; toast(errText(e), 1); });
        },
        lnk: function (b, cc, R) { var r = R(b); if (r) linkMember(refOf(r), r.f.name, function () { MEMX = null; cc.load(); }); },
        inv: function (b, cc, R) { var r = R(b); var lg = r && cc.st.leg && cc.st.leg[refOf(r)]; if (lg) inviteLegacy(lg, refOf(r)); }
      }
    });
  };
  function linkMember(ref, name, done) {
    var bx = modal(mh(T("ربط بعضو", "Link to a member")) + '<p dir="auto">' + h(name) + '</p><label>' + h(T("ابحث بالإيميل أو اسم الشركة", "Search by e-mail or company")) + '<input data-mq dir="auto"></label><div data-mr class="sec"></div><div class="er"></div>', { on: {
      mset: function (b) { b.disabled = true; PATCH("/admin/cc/members/" + enc(b.getAttribute("data-id")), { factory_ref: ref }).then(function () { closeModal(); toast(T("اتربط ✓", "Linked ✓")); done && done(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); }
    } });
    var q = $("[data-mq]", bx), out = $("[data-mr]", bx), tmr = 0;
    q.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(function () { var v = trim(q.value); if (v.length < 2) { out.innerHTML = ""; return; } GET("/admin/cc/members" + qs({ q: v, limit: 10 })).then(function (j) { out.innerHTML = (j.items || []).length ? j.items.map(function (m) { return '<div class="row"><span><b dir="auto">' + h(m.company || "—") + '</b><br><small dir="ltr">' + h(m.email) + "</small></span>" + '<button type="button" class="btn s r" data-a="mset" data-id="' + h(m.id) + '">' + h(T("اربط", "Link")) + "</button></div>"; }).join("") : '<small class="mut">' + h(T("مفيش عضو بالبيانات دي.", "No member matches.")) + "</small>"; }, function (e) { out.innerHTML = '<small class="bad">' + h(errText(e)) + "</small>"; }); }, 350); });
  }
  /* «دعوة للتسجيل»: only companies that were REGISTERED in the old system (owner decision: prospects are never contacted) */
  function inviteLegacy(lg, ref) {
    if (lg.status !== "registered") { toast(T("الشركات المحتملة مابيتبعتلهاش حاجة", "Prospect companies are never contacted"), 1); return; }
    if (!lg.email || !RX_EMAIL.test(lg.email)) { toast(T("مفيش إيميل صحيح للشركة دي في النظام القديم", "No valid e-mail for this company in the old system"), 1); return; }
    if (!sure(T("نعمل حساب للشركة دي ونبعت دعوة دخول على ", "Create an account for this company and send a sign-in invitation to ") + lg.email + "؟")) return;
    var body = { email: lg.email, company: lg.company || "", name: lg.manager || "", invite: true };
    if (ref && can("directory.link")) body.factory_ref = ref;
    POST("/admin/cc/members", body).then(function () { toast(T("اتعمل الحساب واتبعتت الدعوة ✓", "Account created and invitation sent ✓")); MEMX = null; }, function (e) {
      if (e.code === "exists" && e.j && e.j.id) return POST("/admin/cc/members/" + enc(e.j.id) + "/invite", { lang: LANG }).then(function (x) { toast(x && x.sent ? T("الحساب موجود — اتبعتت الدعوة ✓", "The account exists — invitation sent ✓") : T("الحساب موجود — الدعوة ماتبعتتش (الإرسال مش متفعّل)", "The account exists — the invitation was not sent (e-mail is not configured)"), !(x && x.sent)); }, function (e2) { toast(errText(e2), 1); });
      toast(errText(e), 1);
    });
  }
  function legacySection(c) {
    var F2 = c.st.lf = c.st.lf || { q: "", status: "", linked: "" };
    head(T("شركات النظام القديم", "Old-system companies"), h(T("للإدارة فقط — التليفونات والإيميلات مابتتنشرش أبداً", "Admins only — phones and e-mails are never published")), srch(F2.q)
      + sel("lst", [["", "كل الحالات", "All statuses"], ["registered", "مسجّل", "Registered"], ["lead", "عميل محتمل", "Prospect"]], F2.status, T("الحالة", "Status"))
      + sel("llk", [["", "مربوط أو لا", "Linked or not"], ["1", "مربوط بالدليل", "Linked to the directory"], ["0", "مش مربوط", "Not linked"]], F2.linked, T("الربط", "Link"))
      + btn("back", h(T("← رجوع للدليل", "← Back to the directory"))) + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    setCt(listShell(h(T("دي الشركات اللي اتنقلت من النظام القديم. استخدمها للمطابقة والربط بس؛ الشركات المحتملة مابيتبعتلهاش أي حاجة.", "These companies were imported from the old system. Use them for matching and linking only; prospects are never contacted."))));
    var opt = { path: function () { return "/admin/cc/legacy/companies" + qs({ q: F2.q, status: F2.status, linked: F2.linked }); }, empty: T("مفيش شركات مستوردة لسه — استخدم «استيراد من النظام القديم».", "No imported companies yet — use «Import from the old system»."),
      cols: [["الشركة", "Company", function (r) { return '<b dir="auto">' + h(r.company) + '</b><br><small dir="auto">' + h(r.manager || "") + "</small>"; }], ["الدولة", "Country", function (r) { return h(r.country || ""); }], ["الهاتف", "Phone", function (r) { return '<span dir="ltr">' + h(r.phones || "") + "</span>"; }], ["البريد", "E-mail", function (r) { return '<span dir="ltr">' + h(r.email || "") + "</span>"; }], ["الموقع", "Website", function (r) { return r.web ? lnk(r.web) : "—"; }], ["النشاط", "Activity", function (r) { return '<small dir="auto">' + h(cut(r.activity || "", 90)) + "</small>"; }], ["الحالة", "Status", function (r) { return tag(r.status === "registered" ? T("مسجّل", "Registered") : T("عميل محتمل", "Prospect"), r.status === "registered" ? "" : "p"); }], ["الربط", "Link", function (r) { return r.factory_ref ? tag("#" + r.factory_ref, "ok") : r.suggested_ref ? '<small class="mut">' + h(T("مقترح: #", "Suggested: #") + r.suggested_ref) + "</small>" : "—"; }]],
      acts: function (r, i) { return (can("directory.link") ? '<button type="button" class="btn s l" data-a="lref" data-i="' + i + '">' + h(T("ربط بالدليل", "Link to the directory")) + "</button> " : "") + (r.status === "registered" && can("members.write") ? '<button type="button" class="btn s l" data-a="linv" data-i="' + i + '">' + h(T("دعوة للتسجيل", "Invite to sign up")) + "</button>" : ""); } };
    var load = function () { serverList(c, opt); };
    c.q = function (v) { F2.q = v; c.st.page = 0; load(); };
    c.ch.lst = function (t) { F2.status = t.value; c.st.page = 0; load(); }; c.ch.llk = function (t) { F2.linked = t.value; c.st.page = 0; load(); };
    c.on.rf = load; c.on.back = function () { c.st.mode = ""; rerun(); };
    c.on.linv = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (r) inviteLegacy(r, r.factory_ref || ""); };
    c.on.lref = function (b) {
      var r = c.st.rows[+b.getAttribute("data-i")]; if (!r) return;
      var f = [F("factory_ref", "الملف في الدليل", "Directory listing", "pick")];
      var bx = modal(mh(T("ربط بالدليل", "Link to the directory")) + '<p dir="auto">' + h(r.company) + "</p>" + formH(f, { factory_ref: r.factory_ref || r.suggested_ref || "" }) + '<div class="ft2">' + btn("sv", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er"></div>', { wide: true, on: Object.assign({}, PICK_ON, { sv: function (b2) { var v = readForm(bx, f); b2.disabled = true; PATCH("/admin/cc/legacy/companies/" + enc(r.id), { factory_ref: v.factory_ref || "" }).then(function () { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓")); LEGX = null; load(); }, function (e) { b2.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); } }) });
      bindPick(bx);
    };
    load();
  }

  /* =====================================================================================================================
     Content sections built on the engine (live generic columns: title + excerpt · link · date · visible/hidden + key fields)
     ===================================================================================================================== */
  function tendState(dl) { if (!dl) return tag(T("غير محدد الموعد", "No deadline"), "g"); var d = dleft(dl); return d == null ? tag(T("غير محدد الموعد", "No deadline"), "g") : d < 0 ? tag(T("منتهية", "Closed"), "x") : d <= 7 ? tag(T("تنتهي قريباً", "Closing soon"), "p") : tag(T("سارية", "Open"), "ok"); }
  function ttl(t, sub) { return '<b dir="auto">' + h(cut(t || "—", 140)) + "</b>" + (sub ? '<br><small dir="auto">' + h(cut(sub, 90)) + "</small>" : ""); }
  SEC.tenders = function () {
    ceSection({
      title: T("المناقصات", "Tenders"), tabs: [["tend", "مناقصات المنصة", "Platform tenders"], ["opp", "فرص بمصادر", "Sourced opportunities"], ["intl", "فرص دولية", "International opportunities"]],
      addLabel: ["➕ مناقصة جديدة", "➕ New tender"], addTitle: ["مناقصة جديدة", "New tender"],
      note: h(T("النشر محتاج رابط المصدر — من غير مصدر الإعلان بيفضل مسودة.", "Publishing needs the source link — without the announcement's source it stays a draft.")),
      cols: function (d) {
        if (d.key === "tend") return [["الرقم", "Ref", function (r) { return '<small dir="ltr">' + h(r.f.ref || (r.kind === "add" ? T("(بيتولّد)", "(generated)") : "")) + "</small>"; }], ["العنوان", "Title", function (r) { return ttl(r.f.title, r.f.type); }], ["الجهة", "Entity", function (r) { return '<span dir="auto">' + h(r.f.entity || "—") + "</span>"; }], ["المحافظة", "Governorate", function (r) { return h(govName(r.f.gov) || r.f.gov_name || "—"); }], ["آخر موعد", "Deadline", function (r) { return h(r.f.deadline || "—"); }], ["الحالة", "Status", function (r) { return tendState(r.f.deadline); }], ["المصدر", "Source", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الظهور", "Visibility", visH]];
        return [["الرقم المرجعي", "Reference", function (r) { return '<small dir="ltr">' + h(r.f.ref || r.key) + "</small>"; }], ["العنوان", "Title", function (r) { return ttl(r.f.title_ar, r.f.title_en); }], ["الجهة", "Entity", function (r) { return '<span dir="auto">' + h(r.f.entity_ar || "—") + "</span>"; }], [d.key === "intl" ? "الدولة" : "المحافظة", d.key === "intl" ? "Country" : "Governorate", function (r) { return h(d.key === "intl" ? (EN() ? r.f.country_en : r.f.country_ar) || "—" : govName(r.f.region_code) || "—"); }], ["آخر موعد", "Deadline", function (r) { return h(r.f.closing_date || "—"); }], ["الحالة", "Status", function (r) { return tendState(r.f.closing_date); }], ["المصدر", "Source", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الظهور", "Visibility", visH]];
      }
    });
  };
  /* rfqs — طلبات عروض المشترين (RFQ): the live entity; manual entry creates a REAL inquiry (routed automatically) + a public row */
  var CHANNELS = ["اتصال هاتفي", "واتساب", "البريد الإلكتروني", "زيارة المقر", "معرض / فعالية"], CH_EN = { "اتصال هاتفي": "Phone call", "واتساب": "WhatsApp", "البريد الإلكتروني": "E-mail", "زيارة المقر": "Office visit", "معرض / فعالية": "Exhibition / event" };
  var UNITS = ["طن", "م²", "م³", "قطعة", "كرتون", "متر", "لتر"], UN_EN = { "طن": "ton", "م²": "m²", "م³": "m³", "قطعة": "piece", "كرتون": "carton", "متر": "metre", "لتر": "litre" };
  function rfqFields() {
    return [F("client", "اسم العميل / الجهة", "Client / organisation", "text", { req: 1, max: 160 }), F("phone", "الجوال", "Mobile", "tel", { max: 30 }), F("email", "البريد", "E-mail", "email"),
      F("channel", "قناة الطلب", "Request channel", "sel", { opts: CHANNELS.map(function (x) { return [x, x, CH_EN[x]]; }) }), F("product", "المنتج / الخدمة المطلوبة", "Product / service requested", "text", { req: 1, max: 300, w: 1 }),
      F("qty", "الكمية", "Quantity", "text", { max: 30 }), F("unit", "الوحدة", "Unit", "sel", { opts: UNITS.map(function (x) { return [x, x, UN_EN[x]]; }) }), F("sector", "القطاع", "Sector", "sector"), F("city", "مدينة التسليم", "Delivery city", "text", { max: 120 }), F("gov", "المحافظة", "Governorate", "gov"),
      F("deadline", "آخر موعد للعروض (YYYY-MM-DD)", "Offer deadline (YYYY-MM-DD)", "date"), F("details", "تفاصيل الطلب", "Request details", "ta", { max: 2000 }),
      F("status", "الحالة", "Status", "sel", { opts: [["active", "منشور في سوق الطلبات", "Published in the requests market"], ["closed", "مغلق", "Closed"]] })];
  }
  function rfqNew(done) {
    var f = rfqFields();
    need(["regions"]).then(function () {
      var bx = modal(mh(T("طلب RFQ جديد", "New RFQ")) + '<div class="note">' + h(T("الطلب بيتسجّل كطلب حقيقي وبيتبعت تلقائياً للمصانع المسجّلة المطابقة. لو «منشور»، بيظهر في صفحة طلبات الأسعار من غير اسم العميل ولا تليفونه ولا إيميله.", "The request is recorded as a real inquiry and sent automatically to matching registered factories. When «published» it shows on the RFQ page without the client's name, phone or e-mail.")) + "</div>" + formH(f, { status: "active", channel: CHANNELS[0], unit: UNITS[0] }) + '<div class="ft2">' + btn("sv", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', {
        wide: true, on: { sv: function (b) {
          var v = readForm(bx, f), er = $(".er", bx); er.textContent = "";
          if (!v.gov && v.city && W.MIGREG) v.gov = MIGREG.of(v.city) || "";
          if (showErrs(bx, validate(f, v))) return;
          b.disabled = true; v.publish = v.status === "active";
          POST("/admin/cc/rfqs", v).then(function (j) {
            closeModal(); var iq = (j && j.inquiry) || {};
            toast(T("اتسجّل الطلب ", "Request recorded ") + (iq.ref || "") + (iq.routed != null ? T(" — وصل لـ ", " — delivered to ") + nf(iq.routed) + T(" مصنع", " factories") : "") + (j && j.content ? T(" — ومنشور ✓", " — and published ✓") : ""));
            done && done(); badges();
          }, function (e) { b.disabled = false; showErrs(bx, serverErrs(e)); er.innerHTML = h(errText(e)) + errSmall(e); });
        } }
      });
    });
  }
  SEC.rfqs = function () {
    ceSection({
      coll: "rfq", title: T("طلبات عروض المشترين (RFQ)", "Buyer requests for quotation (RFQ)"), noAdd: true,
      note: h(T("سجّل هنا الطلبات اللي تيجيلك بالتليفون أو الواتساب. الطلبات «المنشورة» بتظهر تلقائيًا في صفحة طلبات الأسعار.", "Record here the requests you receive by phone or WhatsApp. «Published» requests appear automatically on the RFQ page.")),
      bar: function () { return can("orders.rfq") ? btn("rfqadd", h(T("➕ طلب RFQ جديد", "➕ New RFQ")), "r") : ""; },
      cols: function () {
        var pv = can("orders.read") || can("legacy.contacts");
        return [["العميل", "Client", function (r) { var p = (r.cr && r.cr.private) || {}; return pv && (p.client || p.phone) ? '<b dir="auto">' + h(p.client || "—") + '</b><br><small dir="ltr">' + h(p.phone || p.email || "") + "</small>" : '<small class="mut">' + h(r.kind === "base" ? T("(بيانات التواصل اتشالت)", "(contact data removed)") : "—") + "</small>"; }],
          ["الطلب", "Request", function (r) { return '<span dir="auto">' + h(cut(r.f.title || "", 120)) + "</span>" + (r.f.qty ? ' <small dir="auto">— ' + h(r.f.qty) + "</small>" : ""); }],
          ["التسليم", "Delivery", function (r) { return '<span dir="auto">' + h(r.f.delivery || govName(r.f.gov) || "—") + "</span>"; }], ["آخر موعد", "Deadline", function (r) { return h(r.f.deadline || "—"); }],
          ["القناة", "Channel", function (r) { var p = (r.cr && r.cr.private) || {}; return h(p.channel ? (EN() ? CH_EN[p.channel] || p.channel : p.channel) : r.kind === "base" ? T("الموقع", "Website") : "—"); }],
          ["الحالة", "Status", function (r) { return crHidden(r.cr) ? tag(T("مغلق", "Closed"), "p") : tag(T("منشور", "Published")); }],
          ["رقم الطلب", "Request ref", function (r) { var p = (r.cr && r.cr.private) || {}; return p.inquiry_ref ? '<a href="#messages/' + enc(p.inquiry_ref) + '" dir="ltr">' + h(p.inquiry_ref) + "</a>" + (p.routed != null ? "<br><small>" + h(T("وصل لـ ", "routed to ") + nf(p.routed)) + "</small>" : "") : "—"; }],
          ["", "", function (r) { var p = (r.cr && r.cr.private) || {}; return p.inquiry_ref && !crHidden(r.cr) && can("orders.close") ? '<button type="button" class="btn s l" data-a="rfqcl" data-i="' + (CUR.st.view || []).indexOf(r) + '">' + h(T("قفل الطلب", "Close the request")) + "</button>" : ""; }]];
      },
      on: {
        rfqadd: function (b, cc) { rfqNew(cc.load); },
        /* closing a manual RFQ (§3.1.9): the public row is hidden and the inquiry is closed (the buyer is told) */
        rfqcl: function (b, cc, R) {
          var r = R(b), p = r && r.cr && r.cr.private; if (!p || !p.inquiry_ref) return;
          if (!sure(T("قفل الطلب ده؟ بيختفي من صفحة طلبات الأسعار والعميل بيتبلّغ إنه اتقفل.", "Close this request? It disappears from the RFQ page and the client is told it was closed."))) return;
          b.disabled = true;
          POST("/admin/cc/content/rfq/" + enc(r.cr.id) + "/hide", { publish: cp(COLL.rfq), reason: "closed" }).then(function () { return POST("/admin/cc/orders/" + enc(p.inquiry_ref) + "/close", { reason: "" }); }).then(function () { toast(T("اتقفل الطلب ✓", "Request closed ✓")); cc.load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); });
        }
      }
    });
  };
  SEC.products = function () {
    var urlName = {};
    ceSection({
      coll: "prod", title: T("المنتجات", "Products"), addLabel: ["➕ منتج جديد", "➕ New product"], addTitle: ["منتج جديد", "New product"],
      loaded: function (cc) { urlName = {}; (W.MIGOLDFAC || []).forEach(function (r) { if (r && r[7]) urlName[urlKey(r[7])] = r[0]; }); },
      cols: function () {
        return [["المنتج", "Product", function (r) { var im = localImg(r.f.image); return (im ? '<img class="thumb" src="' + h(im) + '" alt="" loading="lazy"> ' : "") + ttl(r.f.name, catName(r.f.category)); }],
          ["الشركة", "Company", function (r) { var u = r.f.company_url; return u ? '<span dir="auto">' + h(urlName[urlKey(u)] || host(u) || "—") + "</span>" : "—"; }],
          ["السعر", "Price", function (r) { return r.f.price ? '<span dir="auto">' + h(r.f.price) + "</span>" : "—"; }], ["مميز", "Featured", function (r) { return r.f.featured ? tag("★", "b") : "—"; }], ["الحالة", "Status", visH]];
      }
    });
  };
  SEC.store = function () {
    var fl = { only: "" };
    ceSection({
      title: T("المتجر والعروض والتصنيفات", "Store, offers & categories"), tabs: [["offer", "عروض المحلات", "Store offers"], ["cats", "تصنيفات السوق", "Market categories"], ["feat", "منتجات مميزة", "Featured products", "prod"]],
      addLabel: ["➕ إضافة", "➕ Add"],
      bar: function (cc) { return cc.st.tab === "feat" ? sel("fon", [["", "كل المنتجات", "All products"], ["1", "المميزة بس", "Featured only"]], fl.only, T("مميز", "Featured")) : ""; },
      filter: function (r, cc) { return cc.st.tab !== "feat" || !fl.only || !!r.f.featured; },
      cols: function (d, cc) {
        if (cc.st.tab === "cats") return [["المفتاح", "Key", function (r) { return '<b dir="ltr">' + h(r.f.key || r.key) + "</b>"; }], ["الأيقونة", "Icon", function (r) { return h(r.f.icon || ""); }], ["الاسم", "Name", function (r) { return '<span dir="auto">' + h(r.f.ar || "") + "</span>"; }], ["بالإنجليزي", "In English", function (r) { return '<span dir="ltr">' + h(r.f.en || "") + "</span>"; }], ["الحالة", "Status", visH]];
        if (cc.st.tab === "feat") return [["المنتج", "Product", function (r) { return ttl(r.f.name, catName(r.f.category)); }], ["مميز", "Featured", function (r) { var ix = (cc.st.view || []).indexOf(r); return cw(d) ? '<button type="button" class="btn s ' + (r.f.featured ? "r" : "l") + '" data-a="feat" data-i="' + ix + '">' + h(r.f.featured ? T("★ مميز — شيله", "★ Featured — remove") : T("☆ خلّيه مميز", "☆ Feature it")) + "</button>" : r.f.featured ? "★" : "—"; }], ["الحالة", "Status", visH]];
        return [["الصورة", "Image", function (r) { var im = localImg(r.f.image || r.f.img); return im ? '<img class="thumb" src="' + h(im) + '" alt="" loading="lazy">' : "—"; }], ["المنتج", "Product", function (r) { return ttl(r.f.product_ar, r.f.brand); }], ["المتجر", "Store", function (r) { return '<span dir="auto">' + h(r.f.store_ar || "") + "</span>"; }],
          ["السعر", "Price", function (r) { return h(r.f.price_egp != null ? nf(r.f.price_egp) + " " + T("جنيه", "EGP") : "—") + (r.f.old_price_egp ? ' <s class="mut">' + h(nf(r.f.old_price_egp)) + "</s>" : ""); }], ["ساري حتى", "Valid until", function (r) { return h(r.f.valid_to || "—"); }], ["صنع في مصر", "Made in Egypt", function (r) { return r.f.made_in_egypt ? "🇪🇬" : "—"; }], ["المصدر", "Source", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الحالة", "Status", visH]];
      },
      ch: { fon: function (t, cc) { fl.only = t.value; cc.st.page = 0; cc.paint(); } },
      on: { feat: function (b, cc, R) { var r = R(b); if (!r) return; b.disabled = true; ceSave(COLL.prod, r, Object.assign({}, r.f, { featured: r.f.featured ? 0 : 1 }), cp(COLL.prod)).then(function () { toast(T("تم ✓", "Done ✓")); cc.load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); } }
    });
  };
  function simpleSection(coll, title, addAr, addEn, cols, extra) {
    return function () { ceSection(Object.assign({ coll: coll, title: title(), addLabel: ["➕ " + addAr, "➕ " + addEn], addTitle: [addAr, addEn], cols: cols }, extra ? extra() : {})); };
  }
  SEC.awards = simpleSection("award", function () { return T("الترسيات والفائزون", "Awards & winners"); }, "ترسية جديدة", "New award", function () {
    return [["العنوان", "Title", function (r) { return ttl(r.f.title_ar, r.f.winner_ar); }], ["الجهة", "Entity", function (r) { return '<span dir="auto">' + h(r.f.awarding_entity_ar || "—") + "</span>"; }], ["القيمة", "Value", function (r) { var f = r.f; return h(f.value_egp_million != null ? nf(f.value_egp_million) + T(" مليون جنيه", " m EGP") : f.value_usd_million != null ? nf(f.value_usd_million) + T(" مليون دولار", " m USD") : f.value_eur_million != null ? nf(f.value_eur_million) + T(" مليون يورو", " m EUR") : "—"); }], ["التاريخ", "Date", function (r) { return h(r.f.date || "—"); }], ["الرابط", "Link", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الحالة", "Status", visH]];
  });
  SEC.projects = simpleSection("proj", function () { return T("المشاريع", "Projects"); }, "مشروع جديد", "New project", function () {
    return [["المشروع", "Project", function (r) { return ttl(r.f.name, r.f.owner); }], ["المدينة", "City", function (r) { return '<span dir="auto">' + h(r.f.city || r.f.region || "—") + "</span>"; }], ["المرحلة", "Stage", function (r) { var s = STAGES[+r.f.stage]; return h(s ? L2([s[1], s[2]]) : "—"); }], ["القيمة", "Value", function (r) { return h(r.f.value != null && r.f.value !== "" ? nf(r.f.value) + T(" مليون جنيه", " m EGP") : "—"); }], ["الرابط", "Link", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الحالة", "Status", visH]];
  });
  var PROC = "أخبار المشتريات";
  function newsCols() { return [["العنوان", "Title", function (r) { return ttl(r.f.title_ar, r.f.summary_ar); }], ["الرابط", "Link", function (r) { return r.f.url ? lnk(r.f.url, r.f.source_name) : "—"; }], ["التاريخ", "Date", function (r) { return h(r.f.date || "—"); }], ["التصنيف", "Category", function (r) { return '<small dir="auto">' + h(r.f.category_ar || "—") + "</small>"; }], ["الحالة", "Status", visH]]; }
  SEC.news = simpleSection("news", function () { return T("الأخبار", "News"); }, "خبر جديد", "New article", newsCols);
  SEC.procurement = simpleSection("news", function () { return T("أخبار المشتريات", "Procurement news"); }, "خبر مشتريات", "New procurement news", newsCols, function () { return { filter: function (r) { return r.f.category_ar === PROC; }, empty: T("لسه مفيش أخبار مشتريات — أي خبر تصنيفه «أخبار المشتريات» بيظهر هنا.", "No procurement news yet — any news item in the «أخبار المشتريات» category shows here."), addDefaults: function () { return { category_ar: PROC }; }, note: h(T("أخبار المشتريات = أخبار تصنيفها «أخبار المشتريات». أخبار المشتريات بتظهر للمشتركين من الباقة المميزة وطالع، ومابتتنشرش كصفحات عامة.", "Procurement news = news items in the «أخبار المشتريات» category. Procurement news is shown to Premium members and up, and is never published as public pages.")) }; });
  SEC.events = simpleSection("event", function () { return T("الفعاليات والمعارض", "Events & exhibitions"); }, "فعالية جديدة", "New event", function () {
    return [["العنوان", "Title", function (r) { return ttl(r.f.name_ar, r.f.venue); }], ["الرابط", "Link", function (r) { return r.f.url || r.f.source_url ? lnk(r.f.url || r.f.source_url) : "—"; }], ["التاريخ", "Date", function (r) { return h((r.f.start_date || "—") + (r.f.end_date ? " → " + r.f.end_date : "")); }], ["المدينة", "City", function (r) { return '<span dir="auto">' + h(r.f.city || govName(r.f.region_code) || "—") + "</span>"; }], ["الحالة", "Status", visH]];
  });
  SEC.zones = simpleSection("zone", function () { return T("المناطق الصناعية", "Industrial zones"); }, "منطقة جديدة", "New zone", function () {
    return [["الاسم", "Name", function (r) { return ttl(r.f.name_ar, r.f.name_en); }], ["النوع", "Type", function (r) { var z = ZONE_TYPES.filter(function (x) { return x[0] === r.f.type; })[0]; return h(z ? L2([z[1], z[2]]) : r.f.type || "—"); }], ["المحافظة", "Governorate", function (r) { return h(govName(r.f.region_code) || "—"); }], ["المدينة", "City", function (r) { return '<span dir="auto">' + h(r.f.city || "—") + "</span>"; }], ["المصدر", "Source", function (r) { return r.f.source_url ? lnk(r.f.source_url) : "—"; }], ["الحالة", "Status", visH]];
  });
  SEC.videos = simpleSection("video", function () { return T("الفيديوهات", "Videos"); }, "إضافة برابط يوتيوب", "Add by YouTube link", function () {
    return [["الفيديو", "Video", function (r) { var th = localImg(r.f.thumb); return (th ? '<img class="thumb" src="' + h(th) + '" alt="" loading="lazy"> ' : "") + ttl(r.f.title_ar || r.f.title_original, r.f.channel); }], ["الرابط", "Link", function (r) { return r.f.url ? lnk(r.f.url, "YouTube") : "—"; }], ["التاريخ", "Date", function (r) { return h(r.f.date || "—"); }], ["يوتيوب", "YouTube", function (r) { return r.f.verified_oembed ? tag(T("متأكد ✓", "Confirmed ✓"), "ok") : tag(T("مش متأكد — مش هيتنشر", "Not confirmed — won't be published"), "p"); }], ["الحالة", "Status", visH]];
  });
  SEC.banners = simpleSection("banner", function () { return T("البانرات الإعلانية", "Banners"); }, "بانر جديد", "New banner", function () {
    var PL = { strategic: ["الشركاء الاستراتيجيين", "Strategic partners"], partner: ["الشركاء الأساسيين", "Core partners"], home: ["الرئيسية", "Home"] };
    return [["الصورة", "Image", function (r) { var im = localImg(r.f.img); return im ? '<img src="' + h(im) + '" alt="" loading="lazy" style="width:160px;height:36px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #E5E9E7">' : "—"; }], ["الشريك / العنوان", "Partner / title", function (r) { return ttl(r.f.title_ar || r.f.alt_ar, r.kind === "base" ? T("بانر أصلي في البناء (للإخفاء بس)", "Built-in banner (hide only)") : ""); }], ["المكان", "Placement", function (r) { return h(PL[r.f.place] ? L2(PL[r.f.place]) : r.f.place || "—"); }], ["الفترة", "Period", function (r) { return h(r.f.start || r.f.end ? (r.f.start || "…") + " → " + (r.f.end || "…") : "—"); }], ["العضو المرتبط", "Linked member", function (r) { return r.f.member_id ? '<small dir="ltr">' + h(r.f.member_id) + "</small>" : "—"; }], ["الحالة", "Status", visH]];
  }, function () { return { note: h(T("البانرات الأصلية في البناء بتظهر هنا للقراءة بس، وتقدر تخفيها. البانر الجديد محتاج صورة 1120×200 بكسل على الأقل.", "Built-in banners show here read-only and can be hidden. A new banner needs an image of at least 1120×200 px.")) }; });
  SEC.notices = simpleSection("notice", function () { return T("إعلانات الموقع", "Site notices"); }, "إعلان جديد", "New notice", function () {
    var LV = { info: ["معلومة", "Info"], success: ["خبر حلو", "Good news"], warn: ["تنبيه", "Warning"] };
    return [["الإعلان", "Notice", function (r) { return '<div class="nt-bar ' + h(/^(info|success|warn)$/.test(r.f.level) ? r.f.level : "info") + '"><span dir="auto">' + h(EN() && r.f.text_en ? r.f.text_en : r.f.text_ar) + "</span>" + (r.f.link ? ' <small dir="ltr">' + h(r.f.link) + "</small>" : "") + "</div>"; }], ["النوع", "Level", function (r) { return h(LV[r.f.level] ? L2(LV[r.f.level]) : "—"); }], ["الصفحات", "Pages", function (r) { return h(r.f.pages && r.f.pages.length ? r.f.pages.join(", ") : T("كل الصفحات", "Every page")); }], ["الفترة", "Period", function (r) { return h(r.f.start || r.f.end ? (r.f.start || "…") + " → " + (r.f.end || "…") : "—"); }], ["الحالة", "Status", visH]];
  }, function () { return { empty: T("مفيش إعلانات — الإعلان بيظهر كشريط تحت رأس الصفحة.", "No notices — a notice shows as a bar under the page header.") }; });

  /* media ➕ — مكتبة الصور: uploads in R2 (GET/POST/DELETE /api/admin/cc/media) */
  var PURPOSES = [["logo", "لوجو", "Logo"], ["product", "منتج", "Product"], ["banner", "بانر", "Banner"], ["news", "خبر", "News"], ["event", "فعالية", "Event"], ["zone", "منطقة", "Zone"], ["offer", "عرض", "Offer"], ["project", "مشروع", "Project"], ["notice", "إعلان", "Notice"], ["other", "أخرى", "Other"]];
  SEC.media = function () {
    var c = CUR, F2 = c.st.f = { purpose: "", owner: "", status: "", up: "other" };
    head(T("مكتبة الصور", "Media library"), h(T("JPEG أو PNG أو WebP حتى 5 ميجا — بيانات الكاميرا (EXIF) بتتشال تلقائياً", "JPEG, PNG or WebP up to 5 MB — camera data (EXIF) is removed automatically")),
      sel("mp", [["", "كل الاستخدامات", "Every purpose"]].concat(PURPOSES), F2.purpose, T("الاستخدام", "Purpose")) + sel("mo2", [["", "الإدارة والأعضاء", "Admins and members"], ["admin", "الإدارة", "Admins"], ["member", "الأعضاء", "Members"]], F2.owner, T("المالك", "Owner"))
      + sel("ms", [["", "كل الحالات", "Every status"], ["public", "منشورة", "Public"], ["pending", "بانتظار الموافقة", "Pending"], ["rejected", "مرفوضة", "Rejected"]], F2.status, T("الحالة", "Status")) + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var r2 = ST.features.media_r2 === false;
    setCt((r2 ? '<div class="note">' + h(L2(ERRS.media_off)) + "</div>" : '<div class="dz" id="dz"><p>' + h(T("اسحب الصور هنا أو اختارها", "Drag images here or choose them")) + '</p><div class="acts2" style="justify-content:center">' + sel("mup", PURPOSES, F2.up, T("استخدام الصور المرفوعة", "Purpose of the uploads")) + '<input type="file" id="mfile" accept="image/jpeg,image/png,image/webp" multiple aria-label="' + h(T("اختار صور", "Choose images")) + '"></div><div id="mupr" class="sm"></div></div>') + '<div class="cd"><div class="in"><div id="tb"></div><div class="pg" id="pgn"></div></div></div>');
    var load = function () {
      c.st.page = c.st.page || 0; var tb = $("#tb"); tb.innerHTML = '<div role="status">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>"; $("#pgn").innerHTML = "";
      GET("/admin/cc/media" + qs({ purpose: F2.purpose, owner: F2.owner, status: F2.status, page: c.st.page, limit: 48 })).then(function (j) {
        if (!alive(c)) return; var it = j.items || []; c.st.rows = it;
        tb.innerHTML = it.length ? '<div class="mg">' + it.map(function (m, i) { var u = localImg(m.url); var pr = PURPOSES.filter(function (p) { return p[0] === m.purpose; })[0]; return '<div class="it">' + (u ? '<img src="' + h(u) + '" alt="" loading="lazy">' : "") + "<b>" + h(pr ? L2([pr[1], pr[2]]) : m.purpose) + "</b><span>" + h(m.width + "×" + m.height + " · " + kb(m.bytes)) + "</span><span>" + tag(m.status === "public" ? T("منشورة", "Public") : m.status === "pending" ? T("بانتظار الموافقة", "Pending") : m.status === "rejected" ? T("مرفوضة", "Rejected") : m.status, m.status === "public" ? "ok" : "p") + " " + h(m.owner_type === "member" ? T("عضو", "member") : T("الإدارة", "admin")) + "</span>" + ((m.used_by || []).length ? '<small class="mut">' + h(T("مستخدمة في: ", "Used by: ") + m.used_by.slice(0, 3).join(", ")) + "</small>" : '<small class="mut">' + h(T("مش مستخدمة", "Not used")) + "</small>") + '<div class="acts2">' + (u ? '<button type="button" class="btn s l" data-a="cp" data-i="' + i + '">' + h(T("نسخ الرابط", "Copy link")) + "</button>" : "") + (can("media.delete") ? '<button type="button" class="btn s d" data-a="del" data-i="' + i + '"' + ((m.used_by || []).length ? " disabled" : "") + ">" + h(T("حذف", "Delete")) + "</button>" : "") + "</div></div>"; }).join("") + "</div>" : '<p class="mut" style="text-align:center;padding:20px">' + h(T("لسه مفيش صور مرفوعة.", "No uploads yet.")) + "</p>";
        $("#pgn").innerHTML = pagerH(c.st.page, j.total || it.length, 48);
      }, function (e) { if (alive(c)) tb.innerHTML = errH(e); });
    };
    c.page = function (d) { c.st.page = Math.max(0, c.st.page + d); load(); };
    c.ch.mp = function (t) { F2.purpose = t.value; c.st.page = 0; load(); }; c.ch.mo2 = function (t) { F2.owner = t.value; c.st.page = 0; load(); }; c.ch.ms = function (t) { F2.status = t.value; c.st.page = 0; load(); }; c.ch.mup = function (t) { F2.up = t.value; };
    c.on.rf = load;
    c.on.cp = function (b) { var m = c.st.rows[+b.getAttribute("data-i")], u = m.public_url || m.url; try { navigator.clipboard.writeText(u).then(function () { toast(T("اتنسخ الرابط ✓", "Link copied ✓")); }, function () { toast(u); }); } catch (e) { toast(u); } };
    c.on.del = function (b) { var m = c.st.rows[+b.getAttribute("data-i")]; if (!m || !sure()) return; b.disabled = true; DEL("/admin/cc/media/" + enc(m.id)).then(function () { toast(T("تم الحذف", "Deleted")); load(); }, function (e) { b.disabled = false; toast(errText(e) + (e.j && e.j.used_by ? " " + e.j.used_by.join(", ") : ""), 1); }); };
    var upAll = function (files) {
      files = [].slice.call(files || []); if (!files.length) return; var pr = $("#mupr"), okN = 0, i = 0;
      (function next() {
        if (i >= files.length) { pr.textContent = T("اترفع ", "Uploaded ") + okN + T(" من ", " of ") + files.length; load(); return; }
        var f = files[i++]; pr.textContent = T("جارٍ رفع ", "Uploading ") + i + "/" + files.length + " …";
        upload(f, F2.up).then(function () { okN++; next(); }, function (e) { toast((f.name || "") + ": " + errText(e), 1); next(); });
      })();
    };
    var dz = $("#dz"), fi = $("#mfile");
    if (fi) fi.addEventListener("change", function () { upAll(fi.files); fi.value = ""; });
    if (dz) { dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("on"); }); dz.addEventListener("dragleave", function () { dz.classList.remove("on"); }); dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("on"); upAll(e.dataTransfer && e.dataTransfer.files); }); }
    load();
  };

  /* publish ➕ — النشر والتحديث: overlay version and size, drafts, edge actions, "needs rebuild", emergency off (owner) */
  SEC.publish = function () {
    var c = CUR;
    head(T("النشر والتحديث", "Publishing & rebuild"), h(T("التعديلات المنشورة بتظهر على الموقع خلال دقيقتين تقريباً", "Published edits show on the site within about two minutes")), btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var load = function () {
      setCt(loadingH());
      bakedV().then(function (bv) { return GET("/admin/cc/content/status" + qs({ baked_v: bv == null ? "" : bv })).then(function (j) { return [j, bv]; }); }).then(function (x) {
        if (!alive(c)) return; var s = x[0] || {}, bv = x[1], eg = s.edge || {}, nr = s.needs_rebuild || {}, lim = s.limit || 524288;
        var warn = s.bytes > 262144;
        var html = '<div class="kp">'
          + '<div class="kc"><span>' + h(T("نسخة التعديلات المنشورة", "Published edits version")) + "</span><b>" + h(s.v ? "v" + s.v : "—") + "</b><small>" + h(s.at ? fd(s.at, true) + (s.by ? " · " + s.by : "") : T("لسه مفيش نشر", "Nothing published yet")) + "</small></div>"
          + '<div class="kc"><span>' + h(T("حجم الملف", "File size")) + "</span><b>" + h(kb(s.bytes || 0)) + "</b><small>" + h(T("من ", "of ") + kb(lim)) + (warn ? " · " + h(T("قرّب من الحد", "close to the limit")) : "") + "</small></div>"
          + '<div class="kc"><span>' + h(T("مسودات مانشرتش", "Unpublished drafts")) + "</span><b>" + h(nf(s.drafts || 0)) + "</b><small>&nbsp;</small></div>"
          + '<div class="kc"><span>' + h(T("إجراءات صفحات جوجل", "Search-page actions")) + "</span><b>" + h(nf(eg.pending || 0)) + "</b><small>" + h(T("مستنية", "pending") + " · " + nf(eg.failed || 0) + " " + T("فشلت", "failed")) + "</small></div>"
          + '<div class="kc"><span>' + h(T("محتاج إعادة بناء", "Needs a rebuild")) + "</span><b>" + h(nf(nr.n || 0)) + "</b><small>" + h(bv == null ? T("مفيش نسخة مبنية معروفة", "No known baked version") : "v" + bv) + "</small></div></div>"
          + (s.enabled === false ? '<div class="alert">' + h(T("كل التعديلات المنشورة متوقفة مؤقتاً — الموقع بيعرض بيانات البناء بس.", "All published edits are paused — the site shows the build data only.")) + "</div>" : "")
          + (s.kv === false ? '<div class="note">' + h(T("مخزن KV مش متاح — الملف بيتقري من قاعدة البيانات لحد ما يرجع.", "The KV store is unavailable — the file is read from the database until it is back.")) + "</div>" : "")
          + '<div class="acts2" style="margin-bottom:14px">' + (can("content.publish") ? btn("pall", h(T("📤 نشر الكل", "📤 Publish all")), "r", s.drafts ? "" : " disabled") + btn("retry2", h(T("↻ إعادة المحاولة لإجراءات جوجل", "↻ Retry search-page actions")), "l", (eg.pending || eg.failed) ? "" : " disabled") : "") + btn("prev", h(T("معاينة الملف المنشور", "Preview the published file"))) + (can("content.toggle") ? (s.enabled === false ? btn("ton", h(T("▶ تشغيل التعديلات المنشورة", "▶ Turn published edits back on")), "r") : btn("toff", h(T("⏸ إيقاف كل التعديلات المنشورة مؤقتاً", "⏸ Pause all published edits")), "d")) : "") + "</div>"
          + cardH(T("محتاج إعادة بناء", "Needs a rebuild"), '<p class="mut sm">' + h(bv == null ? T("النسخة المنشورة من الموقع مبنية قبل التعديلات دي — صفحات البحث الثابتة بتتحدّث في البناء الجاي.", "The published site was built before these edits — the static search pages update with the next build.") : T("بيتحدّث تلقائياً في النشر اليومي (حوالي 4:37 ص بتوقيت القاهرة). صفحات الموقع العادية بتعرض التعديل خلال دقيقتين.", "Updated automatically by the daily build (about 4:37 am Cairo time). The regular site pages show the change within two minutes.")) + "</p>"
            + '<div class="tbl-s">' + tableH([["القسم", "Section", function (r) { return h(COLL[r.coll] ? L2(COLL[r.coll].label) : r.coll); }], ["العنصر", "Item", function (r) { return '<span dir="auto">' + h(cut(r.title || r.id, 100)) + "</span>"; }], ["التغيير", "Change", function (r) { return h(r.op || ""); }], ["اتنشر", "Published", function (r) { return fdh(r.published_at, true); }]], nr.items || [], { empty: T("كل التعديلات المنشورة موجودة في البناء.", "Every published edit is in the build.") }) + "</div>")
          + cardH(T("إجراءات صفحات جوجل (noindex / تحويل)", "Search-page actions (noindex / redirect)"), '<div class="tbl-s">' + tableH([["الصفحة", "Page", function (r) { return '<span dir="ltr">' + h(r.path) + "</span>"; }], ["الإجراء", "Action", function (r) { return h(r.action === "noindex" ? T("إخفاء عن جوجل", "noindex") : r.action === "redirect" ? T("تحويل 301", "301 redirect") : r.action === "restore" ? T("إرجاع", "restore") : r.action); }], ["الحالة", "Status", function (r) { return tag(r.status, r.status === "done" ? "ok" : r.status === "failed" ? "x" : "p"); }], ["محاولات", "Attempts", function (r) { return h(nf(r.attempts || 0)); }], ["الخطأ", "Error", function (r) { return '<small dir="ltr">' + h(cut(r.error || "", 120)) + "</small>"; }]], eg.items || [], { empty: T("مفيش إجراءات مستنية.", "No pending actions.") }) + "</div>");
        setCt(html);
        if ((eg.pending || 0) > 0 && can("content.publish") && !c.st.autoRetried) { c.st.autoRetried = 1; POST("/admin/cc/content/edge-retry").then(function () { if (alive(c)) load(); }, function () {}); }
      }, function (e) { if (alive(c)) setCt(errH(e)); });
    };
    c.on.rf = load;
    c.on.pall = function (b) { if (!sure(T("نشر كل المسودات دلوقتي؟", "Publish every draft now?"))) return; b.disabled = true; POST("/admin/cc/content/publish", { all: true }).then(function (j) { toast(T("اتنشر ✓ ", "Published ✓ ") + nf(j && j.published || 0) + T(" عنصر — يظهر على الموقع خلال دقيقتين", " items — visible on the site within two minutes")); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.retry2 = function (b) { b.disabled = true; POST("/admin/cc/content/edge-retry").then(function (j) { toast(T("اتعمل: ", "Done: ") + nf(j && j.done || 0) + T(" · فشل: ", " · failed: ") + nf(j && j.failed || 0)); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.prev = function () { modal(mh(T("الملف المنشور", "The published file")) + loadingH(), { wide: true }); GET("/admin/cc/content/overlay").then(function (j) { modal(mh(T("الملف المنشور", "The published file") + (j.v ? " v" + j.v : "")) + '<pre class="js">' + h(JSON.stringify(j.data == null ? null : j.data, null, 1).slice(0, 200000)) + "</pre>", { wide: true }); }, function (e) { modal(mh(T("الملف المنشور", "The published file")) + errH(e, false), { wide: true }); }); };
    c.on.toff = function (b) { if (!sure(T("إيقاف كل التعديلات المنشورة؟ الموقع هيرجع لبيانات البناء لحد ما تشغّلها تاني.", "Pause every published edit? The site goes back to the build data until you turn them on again."))) return; b.disabled = true; POST("/admin/cc/content/overlay-toggle", { enabled: false }).then(function () { toast(T("اتوقفت ✓", "Paused ✓")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.ton = function (b) { b.disabled = true; POST("/admin/cc/content/overlay-toggle", { enabled: true }).then(function () { toast(T("اشتغلت تاني ✓", "Turned back on ✓")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    load();
  };

  /* =====================================================================================================================
     messages — الرسائل والطلبات: the sales-requests / orders console over `inquiries` (§9) + the old system's messages
     ===================================================================================================================== */
  var MKT = [["", "كل الأسواق", "All markets"], ["local", "مصر", "Egypt"], ["gulf", "الخليج والدول العربية", "Gulf & Arab"], ["africa", "أفريقيا", "Africa"], ["asia", "آسيا", "Asia"], ["europe", "أوروبا", "Europe"]];
  var OTABS = [["all", "الكل", "All", ""], ["team", "محتاجة تدخّل الفريق", "Need the team", ""], ["rfq", "طلبات أسعار", "Quote requests", "rfq"], ["basket", "سلة السوق", "Market basket", "basket"], ["opp", "عروض على فرص", "Offers on opportunities", "opp_offer"], ["interest", "اهتمام", "Interest", "lead_interest,project_interest"], ["signup", "طلبات اشتراك", "Membership applications", "signup"], ["fix", "تصحيح بيانات", "Data corrections", "profile_fix"], ["contact", "تواصل", "Contact", "contact,entity_contact"], ["legacy", "رسائل النظام القديم", "Old-system messages", ""]];
  function subjOf(r) { var p = r.payload || {}; return r.target_name || p.product || p.title || (r.items && r.items[0] && (r.items[0].name || r.items[0].product)) || kindName(r.kind); }
  SEC.messages = function (arg) {
    var c = CUR, F2 = c.st.f = { tab: "all", q: "", status: "", source: "", market: "", from: "", to: "" };
    var paintHead = function () {
      head(T("الطلبات والرسائل", "Requests & messages"), h(T("كل طلب بيتوزّع تلقائياً على المصانع المسجّلة المطابقة — هنا المتابعة والتدخّل لما يكون محتاج", "Every request is routed automatically to matching registered factories — this is where you follow up and step in when needed")),
        srch(F2.q) + (F2.tab === "legacy" ? sel("lms", [["", "كل الحالات", "All statuses"], ["new", "جديد", "New"], ["read", "مقروء", "Read"], ["done", "تم", "Done"]], F2.status, T("الحالة", "Status")) :
          sel("ost", [["", "كل الحالات", "All statuses"]].concat(Object.keys(INQ_ST).map(function (k) { return [k, INQ_ST[k][0], INQ_ST[k][1]]; })), F2.status, T("الحالة", "Status"))
          + sel("osr", [["", "كل المصادر", "All sources"]].concat(Object.keys(SRC).map(function (k) { return [k, SRC[k][0], SRC[k][1]]; })), F2.source, T("المصدر", "Source"))
          + sel("omk", MKT, F2.market, T("السوق", "Market")) + dateIn("ofr", F2.from, T("من تاريخ", "From")) + dateIn("oto", F2.to, T("إلى تاريخ", "To")))
        + (can("orders.rfq") ? btn("manual", h(T("➕ طلب يدوي", "➕ Manual request")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + (isAdm() && F2.tab !== "legacy" ? btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) : "")
        + '<a class="btn l" href="' + h(U("inbox")) + '" target="_blank" rel="noopener">' + h(T("شاشة المتابعة القديمة ↗", "The old requests console ↗")) + "</a>");
    };
    var tabsPaint = function (kinds) {
      var k = kinds || c.st.kinds || {};
      $("#otabs").innerHTML = tabsH(OTABS.map(function (t) { var n = t[0] === "team" ? +BD.needsTeam || 0 : t[3] ? t[3].split(",").reduce(function (a, x) { return a + (+k[x] || 0); }, 0) : 0; return [t[0], t[1], t[2], n, t[0] === "team" ? "nt" : ""]; }), F2.tab, "otab");
    };
    paintHead();
    setCt('<div id="otabs"></div>' + listShell(""));
    tabsPaint();
    var cols = [["من", "From", function (r) { return '<b dir="auto">' + h(r.name || "—") + '</b><br><small dir="ltr">' + h(r.phone || r.email || "") + "</small>"; }],
      ["النوع", "Kind", function (r) { return h(kindName(r.kind)); }],
      ["الموضوع", "Subject", function (r) { return '<span dir="auto">' + h(cut(subjOf(r), 90)) + '</span><br><small dir="auto">' + h(cut(r.message || "", 90)) + "</small>"; }],
      ["التاريخ", "Date", function (r) { return fdh(r.created_at, true); }], ["الحالة", "Status", function (r) { return inqChip(r.status); }],
      ["رقم الطلب", "Ref", function (r) { return '<small dir="ltr">' + h(r.ref) + "</small>"; }], ["وصل لـ", "Routed to", function (r) { return h(nf(r.routed_count || 0)); }], ["ردود", "Replies", function (r) { return h(nf(r.replies_count || 0)); }],
      ["محتاج الفريق", "Needs the team", function (r) { return r.needs_team ? tag(T("🔴 محتاج الفريق", "🔴 Needs the team"), "x") : "—"; }]];
    var opt = { path: function () { var t = OTABS.filter(function (x) { return x[0] === F2.tab; })[0] || OTABS[0]; return "/admin/cc/orders" + qs({ kind: t[3], needs_team: F2.tab === "team" ? 1 : "", status: F2.status, source: F2.source, market: F2.market, from: F2.from, to: F2.to, q: F2.q }); },
      cols: cols, empty: T("لسه مفيش طلبات.", "No requests yet."), acts: function (r, i) { return '<button type="button" class="btn s l" data-a="op" data-i="' + i + '">' + h(T("فتح", "Open")) + "</button>"; },
      after: function (cc, j) { if (j && j.kinds) { cc.st.kinds = j.kinds; tabsPaint(j.kinds); } } };
    var lopt = { path: function () { return "/admin/cc/legacy/messages" + qs({ status: F2.status, q: F2.q }); }, empty: T("مفيش رسائل مستوردة من النظام القديم.", "No messages imported from the old system."),
      cols: [["من", "From", function (r) { return '<b dir="auto">' + h(r.name || "—") + '</b><br><small dir="ltr">' + h(r.phone || r.email || "") + "</small>"; }], ["النوع", "Kind", function (r) { return h(r.kind || ""); }], ["الموضوع", "Subject", function (r) { return '<span dir="auto">' + h(r.subject || "") + '</span><br><small dir="auto">' + h(cut(r.body || "", 90)) + "</small>"; }], ["التاريخ", "Date", function (r) { return fdh(r.legacy_at || r.created_at, true); }],
        ["الحالة", "Status", function (r) { return can("orders.note") ? '<select data-c="lmst" data-id="' + h(r.id) + '" class="pl">' + [["new", "جديد", "New"], ["read", "مقروء", "Read"], ["done", "تم", "Done"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === r.status ? " selected" : "") + ">" + h(L2([o[1], o[2]])) + "</option>"; }).join("") + "</select>" : tag({ new: T("جديد", "New"), read: T("مقروء", "Read"), done: T("تم", "Done") }[r.status] || r.status, r.status === "new" ? "x" : ""); }]],
      acts: function (r, i) { return '<button type="button" class="btn s l" data-a="lmv" data-i="' + i + '">' + h(T("عرض", "View")) + "</button>" + (can("orders.close") && isAdm() ? ' <button type="button" class="btn s d" data-a="lmd" data-i="' + i + '">' + h(T("حذف", "Delete")) + "</button>" : ""); } };
    var load = function () { serverList(c, F2.tab === "legacy" ? lopt : opt); };
    c.q = function (v) { F2.q = v; c.st.page = 0; load(); };
    c.on.otab = function (b) { F2.tab = b.getAttribute("data-v"); F2.status = ""; c.st.page = 0; paintHead(); tabsPaint(); load(); };
    c.ch.ost = function (t) { F2.status = t.value; c.st.page = 0; load(); }; c.ch.lms = c.ch.ost;
    c.ch.osr = function (t) { F2.source = t.value; c.st.page = 0; load(); }; c.ch.omk = function (t) { F2.market = t.value; c.st.page = 0; load(); };
    c.ch.ofr = function (t) { F2.from = t.value; c.st.page = 0; load(); }; c.ch.oto = function (t) { F2.to = t.value; c.st.page = 0; load(); };
    c.ch.lmst = function (t) { t.disabled = true; PATCH("/admin/cc/legacy/messages/" + enc(t.getAttribute("data-id")), { status: t.value }).then(function () { toast(T("تم ✓", "Done ✓")); t.disabled = false; badges(); }, function (e) { toast(errText(e), 1); load(); }); };
    c.on.rf = load; c.on.manual = function () { rfqNew(load); };
    c.on.ex = function () { serverCsv("/admin/cc/orders.csv" + opt.path().replace(/^[^?]*/, ""), "messages"); };
    c.on.op = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (r) orderDetail(r.ref, load); };
    c.on.lmv = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r) return; modal(mh(r.subject || T("رسالة", "Message")) + kvH([[T("الاسم", "Name"), r.name], [T("الجوال", "Mobile"), r.phone, "ltr"], [T("البريد", "E-mail"), r.email, "ltr"], [T("النوع", "Kind"), r.kind], [T("التاريخ", "Date"), fd(r.legacy_at || r.created_at, true)], [T("رقم قديم", "Old id"), r.legacy_id, "ltr"]]) + '<div class="note" dir="auto" style="white-space:pre-wrap">' + h(r.body || "") + "</div>", { wide: true }); };
    c.on.lmd = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r || !sure()) return; b.disabled = true; DEL("/admin/cc/legacy/messages/" + enc(r.id)).then(function () { toast(T("تم الحذف", "Deleted")); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    load();
    if (arg) orderDetail(arg, load);
  };
  var PK = { product: ["المنتج", "Product"], quantity: ["الكمية", "Quantity"], unit: ["الوحدة", "Unit"], governorate: ["المحافظة", "Governorate"], city: ["المدينة", "City"], deadline: ["آخر موعد", "Deadline"], sector: ["القطاع", "Sector"], market: ["السوق", "Market"], country: ["الدولة", "Country"], plan: ["الباقة", "Plan"], company: ["الشركة", "Company"], channel: ["القناة", "Channel"], budget: ["الميزانية", "Budget"], via_team: ["مسجّل عن طريق الفريق", "Recorded by the team"] };
  function orderDetail(ref, done) {
    modal(mh(T("الطلب ", "Request ") + ref) + loadingH(), { wide: true });
    var paint = function (d, msg) {
      var q = d.inquiry || {}, ev = d.events || [], rt = d.routes || [], qts = d.quotes || [], pay = q.payload || {}, items = q.items || [], cand = d.candidates || [], ws = d.web_search, web = ws && typeof ws === "object" ? ws : { provider: ws ? String(ws) : "" };
      var red = !!(d.needs_team != null ? d.needs_team : q.needs_team), closed = q.status === "closed" || q.status === "blocked";
      var kv = [[T("رقم الطلب", "Ref"), q.ref, "ltr"], [T("النوع", "Kind"), kindName(q.kind)], [T("المصدر", "Source"), q.source ? L2(SRC[q.source] || [q.source, q.source]) : ""], [T("الاسم", "Name"), q.name], [T("الشركة", "Company"), q.company], [T("البريد", "E-mail"), q.email, "ltr"], [T("الجوال", "Mobile"), q.phone, "ltr"], [T("موافقة واتساب", "WhatsApp consent"), q.consent_wa ? T("نعم", "Yes") : T("لا", "No")], [T("السوق", "Market"), q.market], [T("أُنشئ", "Created"), fd(q.created_at, true)], [T("آخر تحديث", "Updated"), fd(q.updated_at, true)]];
      Object.keys(pay).forEach(function (k) { var v = pay[k]; if (v == null || v === "" || typeof v === "object" && !Array.isArray(v)) return; kv.push([PK[k] ? L2(PK[k]) : k, Array.isArray(v) ? v.join(", ") : k === "governorate" ? govName(v) || v : String(v)]); });
      var canWa = !!(q.phone && q.consent_wa);
      var candH = '<h3>🔎 ' + h(T("مصانع مرشّحة", "Candidate factories")) + " (" + nf(cand.length) + ")</h3>"
        + '<div class="alert">' + h(T("محدش من دول اتبعتله حاجة — التواصل يدوي من الفريق.", "None of these was sent anything — the team contacts them by hand.")) + "</div>"
        + '<p class="mut sm">' + h(web.error ? T("بحث الويب ما اشتغلش: ", "Web search failed: ") + cut(web.error, 120) : web.provider ? T("بحث الويب: ", "Web search: ") + web.provider : T("القايمة من دليل المنصة بس (مفيش مفتاح بحث ويب متسجّل).", "This list is from the platform directory only (no web-search key is configured).")) + (d.candidates_at ? " · " + h(T("آخر بحث: ", "Last search: ") + fd(d.candidates_at, true)) : "") + "</p>"
        + (cand.length ? cand.map(function (x) { var src = String(x.source || "").toLowerCase() === "web" ? T("بحث ويب", "Web search") : T("دليل المنصة — غير مسجّل", "Platform directory — not registered"); var lg = x.legacy || null; return '<div class="cand"><span class="src">' + h(src) + '</span><b dir="auto">' + h(x.name || "—") + "</b>" + (x.sector ? ' <small dir="auto">· ' + h(secName(x.sector)) + "</small>" : "") + (x.governorate ? " <small>· " + h(govName(x.governorate) || x.governorate) + "</small>" : "") + (x.snippet ? '<div class="sm mut" dir="auto">' + h(cut(x.snippet, 300)) + "</div>" : "") + '<div class="acts2 sm">' + (x.profile_url ? lnk(x.profile_url, T("صفحته على المنصة", "Its platform page")) : "") + (x.url && x.url !== x.profile_url ? " " + lnk(x.url) : "") + "</div>" + (lg && can("legacy.contacts") ? '<fieldset class="adm"><legend>' + h(T("تواصل من النظام القديم (للإدارة فقط)", "Old-system contacts (admins only)")) + '</legend><span dir="ltr">' + h([lg.phones, lg.email].filter(Boolean).join(" · ")) + "</span></fieldset>" : "") + "</div>"; }).join("") : '<p class="mut">' + h(T("مفيش مرشّحين لسه.", "No candidates yet.")) + "</p>")
        + (can("orders.read") ? '<div class="acts2">' + btn("cref", h(T("🔄 تحديث المرشّحين", "🔄 Refresh candidates")), "l s") + "</div>" : "");
      var reply = closed ? '<p class="mut">' + h(T("الطلب ده ", "This request is ") + (INQ_ST[q.status] ? L2(INQ_ST[q.status]) : q.status) + T("، فالرد عليه مقفول.", ", so replying is closed.")) + "</p>" : can("orders.reply") ? '<h3>🧑‍💼 ' + h(T("إحنا اللي هنرد", "We'll reply")) + '</h3><div class="fr"><label class="w">' + h(T("الرد للمشتري", "Reply to the buyer")) + '<textarea data-f="body" maxlength="4000" dir="auto" placeholder="' + h(T("اكتب للمشتري اللي اتفقتوا عليه: المصنع، السعر أو الخطوة الجاية…", "Tell the buyer what you arranged: the factory, the price or the next step…")) + '"></textarea><span class="hint">' + h(T("بيوصل باسم «فريق منصة صنع في مصر» وبيظهر في صفحة تتبّع الطلب. ماتكتبش أرقام شخصية لمصانع.", "It reaches the buyer from «the Made in Egypt Gate team» and shows on the tracking page. Never write factories' personal numbers.")) + '</span><div class="fe" data-fe="body"></div></label>'
        + "<label>" + h(T("القناة", "Channel")) + '<select data-f="channel"><option value="email">' + h(T("إيميل", "E-mail")) + "</option>" + (canWa ? '<option value="both">' + h(T("إيميل + واتساب", "E-mail + WhatsApp")) + '</option><option value="whatsapp">' + h(T("واتساب", "WhatsApp")) + "</option>" : "") + '</select><span class="hint">' + h(canWa ? T("الواتساب للمشتري محتاج قالب معتمد — لحد ما يتعتمد، الرد بيروح بالإيميل والنتيجة بتقولك.", "WhatsApp to buyers needs an approved template — until then the reply goes by e-mail and the result says so.") : T("المشتري ماوافقش على الواتساب، فالرد بالإيميل بس.", "The buyer did not opt in to WhatsApp, so the reply goes by e-mail only.")) + "</span></label>"
        + "<label>" + h(T("حالة الطلب بعد الرد", "Status after the reply")) + '<select data-f="status"><option value="replied">' + h(T("اترد", "Replied")) + '</option><option value="in_progress">' + h(T("جاري المتابعة", "In progress")) + '</option><option value="closed">' + h(T("اتقفل", "Closed")) + "</option></select></label></div>"
        + '<div class="ft2">' + btn("trp", h(T("📤 ابعت الرد للمشتري", "📤 Send the reply to the buyer")), "r") + "</div>" : "";
      var qOf = function (r) { var l = qts.filter(function (x) { return x.route_id === r.id; }); return l.length ? l[l.length - 1] : r.quote || null; };
      var ch = function (v, num) { v = v != null && v !== "" ? String(v).toLowerCase() : num ? "sent" : ""; return v === "sent" || v === "delivered" ? "✓ " + T("اتبعت", "sent") : v === "template" ? "✓ " + T("تنبيه (قالب)", "alert (template)") : v === "failed" ? "⚠️ " + T("فشل (بيتعاد تلقائي)", "failed (retried)") : v === "pending" || v === "queued" ? "⏳ " + T("لسه", "not yet") : v === "skipped" ? "—" : "—"; };
      var html = mh(cut(subjOf(q), 80)) + '<div class="drw">' + (msg || "") + '<div class="acts2">' + inqChip(q.status) + (red ? " " + tag(T("🔴 محتاج الفريق", "🔴 Needs the team"), "x") : "") + "</div>"
        + (red ? '<div class="alert">⚠️ <b>' + h(T("مفيش مصنع مسجّل مطابق للطلب ده.", "No registered factory matches this request.")) + "</b> " + h(T("الإدارة اتبلّغت تلقائي، والمشتري وصله «جاري معالجة طلبك». شوفوا المرشّحين، رتّبوا مع مصنع، وبعدين ردّوا بزرار «إحنا اللي هنرد».", "The admins were notified automatically and the buyer was told «We're working on your request». Check the candidates, arrange with a factory, then answer with «We'll reply».")) + "</div>" : "")
        + kvH(kv) + (q.message ? '<div class="note" dir="auto" style="white-space:pre-wrap">' + h(q.message) + "</div>" : "")
        + (items.length ? "<h3>" + h(T("البنود", "Items")) + "</h3><ul>" + items.map(function (it) { var qn = it.qty || it.quantity; return '<li dir="auto">' + h(it.name || it.product || it.title || T("بند", "Item")) + (qn ? " × " + h(qn) + (it.unit ? " " + h(it.unit) : "") : "") + "</li>"; }).join("") + "</ul>" : "")
        + (red || cand.length ? candH : "") + reply
        + "<h3>" + h(T("التوزيع التلقائي", "Automatic routing")) + " (" + nf(rt.length) + ")</h3>" + (rt.length ? '<div class="tbl-s">' + tableH([["المصنع", "Factory", function (r) { return '<b dir="auto">' + h(r.company || r.member_name || r.member_id || "") + "</b>" + (r.score != null ? "<br><small>" + h(T("درجة المطابقة ", "match score ") + r.score) + "</small>" : ""); }], ["الباقة", "Plan", function (r) { return h(planName(r.plan)); }], ["إيميل", "E-mail", function (r) { return h(ch(r.email_status, r.email_sent)); }], ["واتساب", "WhatsApp", function (r) { return h(ch(r.wa_status, r.wa_sent)); }], ["الحالة", "Status", function (r) { var qq = qOf(r); return h(r.status || "") + (r.error ? '<br><small class="bad" dir="auto">' + h(cut(r.error, 120)) + "</small>" : "") + (qq ? "<br>💰 " + h((qq.price || "") + " " + (qq.currency || "")) : ""); }]], rt, {}) + "</div>" : '<p class="mut">' + h(red ? T("ماتبعتش لأي مصنع: مفيش مصنع مسجّل مطابق لحد دلوقتي. الطلب مفتوح وهيتبعت تلقائي لأي مصنع مطابق ينضم — ولحد كده الفريق بيتابعه.", "Not sent to any factory: no registered factory matches yet. It stays open and is sent automatically to any matching factory that joins — meanwhile the team handles it.") : T("ماتبعتش لمصانع (النوع ده بيتسجّل بس أو لسه مفيش مطابق).", "Not sent to factories (this kind is recorded only, or nothing matches yet).")) + "</p>")
        + "<h3>" + h(T("خط السير", "Timeline")) + '</h3><ol class="tl">' + ev.slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }).map(function (e) { var inn = e.buyer_visible === 0 || e.buyer_visible === false; return '<li class="' + (inn ? "in" : "") + '"><b>' + h((inn ? "🔒 " + T("داخلي: ", "internal: ") : "") + (e.actor === "team" ? T("رد من فريق المنصة", "Reply from the platform team") : e.type)) + "</b><small>" + fdh(e.created_at, true) + (e.actor && e.actor !== "system" && e.actor !== "team" ? " · " + h(e.actor) : "") + "</small>" + (e.body ? '<div dir="auto" style="white-space:pre-wrap">' + h(e.body) + "</div>" : "") + "</li>"; }).join("") + "</ol>"
        + '<div class="acts2" style="margin-top:12px">' + (can("orders.note") ? btn("note", h(T("📝 ملاحظة داخلية", "📝 Internal note")), "l s") : "") + (can("orders.close") && !closed ? btn("cls", h(T("✅ قفل الطلب", "✅ Close the request")), "l s") : "") + (can("orders.resend") ? btn("rsd", h(T("↻ إعادة الإرسال", "↻ Re-send")), "l s") : "") + (can("orders.block") && q.email ? btn("blk", h(T("⛔ حظر", "⛔ Block")), "d s") : "") + '</div><div class="er" role="alert"></div></div>';
      var bx = modal(html, { wide: true, on: {
        trp: function (b) {
          var body = trim($('[data-f="body"]', bx).value), chn = $('[data-f="channel"]', bx).value, st = $('[data-f="status"]', bx).value;
          if (!body) { showErrs(bx, { body: T("اكتب الرد الأول", "Write the reply first") }); return; }
          b.disabled = true;
          POST("/admin/cc/orders/" + enc(q.ref) + "/team-reply", { body: body, channel: chn, status: st }).then(function (j) {
            var s = (j && j.sent) || {}, parts = [];
            if (s.email) parts.push(T("اتبعت بالإيميل ✓", "Sent by e-mail ✓"));
            if (s.whatsapp) parts.push(T("اتبعت بالواتساب ✓", "Sent by WhatsApp ✓"));
            if (j && j.fallback) parts.push(T("الواتساب ماتبعتش — اتبعت بالإيميل بدل منه (مفيش قالب واتساب معتمد للمشترين لسه)", "WhatsApp was not sent — e-mail was used instead (no approved buyer WhatsApp template yet)"));
            if (j && j.errors && j.errors.length) parts.push(T("أخطاء: ", "Errors: ") + j.errors.join(" · "));
            if (!s.email && !s.whatsapp) parts.push(T("الرد اتسجّل في صفحة التتبّع، بس ماتبعتش (الإرسال مش متفعّل).", "The reply was recorded on the tracking page but not sent (sending is not configured)."));
            toast(parts[0] || T("تم ✓", "Done ✓")); reload('<div class="okc">' + h(parts.join(" — ")) + "</div>"); done && done(); badges();
          }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); });
        },
        note: function () { askText(T("ملاحظة داخلية", "Internal note"), T("الملاحظة بتظهر للإدارة بس.", "The note is visible to admins only."), 2000, function (t) { return POST("/admin/cc/orders/" + enc(q.ref) + "/note", { body: t }).then(function () { toast(T("اتسجّلت الملاحظة ✓", "Note saved ✓")); orderDetail(ref, done); }); }, function () { orderDetail(ref, done); }); },
        cls: function () { askText(T("قفل الطلب", "Close the request"), T("المشتري بيتبلّغ إن الطلب اتقفل. اكتب سبب (اختياري).", "The buyer is told the request was closed. Write a reason (optional)."), 2000, function (t) { return POST("/admin/cc/orders/" + enc(q.ref) + "/close", { reason: t }).then(function () { toast(T("اتقفل الطلب ✓", "Request closed ✓")); done && done(); orderDetail(ref, done); }); }, function () { orderDetail(ref, done); }, true); },
        rsd: function (b) { b.disabled = true; POST("/admin/inquiries/" + enc(q.ref) + "/resend").then(function (j) { toast(T("اتعاد الإرسال التلقائي", "Automatic sending re-run") + (j && j.routed != null ? T(" — وصل لـ ", " — delivered to ") + nf(j.routed) : "")); reload(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        blk: function (b) { if (!sure(T("حظر البريد ده؟ طلباته الجاية هتترفض.", "Block this e-mail? Its future requests are refused."))) return; b.disabled = true; POST("/admin/block", { email: q.email, reason: "admin panel" }).then(function () { toast(T("اتحظر ✓", "Blocked ✓")); reload(); done && done(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
        cref: function (b) { b.disabled = true; POST("/admin/cc/orders/" + enc(q.ref) + "/candidates/refresh").then(function (j) { if (j && Array.isArray(j.candidates)) { d.candidates = j.candidates; if (j.web_search != null) d.web_search = j.web_search; d.candidates_at = j.candidates_at || new Date().toISOString(); } toast(T("اتحدّثت القايمة: ", "Candidates refreshed: ") + nf((d.candidates || []).length)); paint(d); }, function (e) { b.disabled = false; toast(errText(e), 1); }); }
      } });
    };
    var reload = function (msg) { GET("/admin/cc/orders/" + enc(ref)).then(function (d) { paint(d, msg); }, function (e) { modal(mh(T("الطلب ", "Request ") + ref) + errH(e, false), { wide: true }); }); };
    reload();
  }
  function askText(title, msg, max, fn, back, optional) {
    var f = [{ n: "t", l: [T("النص", "Text"), "Text"], t: "ta", max: max, req: !optional }];
    var bx = modal(mh(title) + "<p>" + h(msg) + "</p>" + formH(f, {}) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + btn("bk", h(T("رجوع", "Back"))) + '</div><div class="er" role="alert"></div>', { on: {
      ok: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; fn(trim(v.t)).catch(function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); },
      bk: function () { if (back) back(); else closeModal(); }
    } });
  }

  /* whatsapp ➕ — read-only: GET /api/wa/health + the existing log GET /api/admin/wa?flag= */
  SEC.whatsapp = function () {
    var c = CUR; c.st.flag = "";
    head(T("الواتساب", "WhatsApp"), h(T("متابعة بس — الإرسال بيتم تلقائياً من النظام", "Monitoring only — sending is automatic")), btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    setCt('<div id="wah">' + loadingH() + '</div><div id="watab"></div><div class="cd"><div id="tb"></div></div>');
    var health = function () { GET("/wa/health").then(function (j) { if (!alive(c)) return; $("#wah").innerHTML = cardH(T("الحالة", "Status"), kvH([[T("الواتساب", "WhatsApp"), j.whatsapp ? T("متضبط ✓", "Configured ✓") : T("مش متضبط", "Not configured")], [T("استقبال الرسائل (Webhook)", "Inbound webhook"), j.webhook ? T("متضبط ✓", "Configured ✓") : T("مش متضبط", "Not configured")], [T("القناة", "Channel"), j.channel || "—", "ltr"], [T("وضع التجربة (من غير إرسال)", "Dry run (no sending)"), j.dry_run ? T("شغّال — الرسائل بتتسجّل بس ومابتتبعتش", "On — messages are logged, not sent") : T("مقفول", "Off")]]) + (j.ok ? '<p class="ok">' + h(T("الإرسال والاستقبال شغّالين.", "Sending and receiving are working.")) + "</p>" : '<p class="warn">' + h(T("الواتساب مش جاهز بالكامل — الإيميل بيكمّل مكانه.", "WhatsApp is not fully ready — e-mail is used instead.")) + "</p>")
          /* the dry-run reason (whatsapp.js waDryReason) and, for the owner, the page that turns real sending on */
          + (j.dry_run && j.reason ? '<p class="mut sm">' + h({ no_token: T("السبب: مفيش توكن respond.io.", "Why: no respond.io token."), env_dry_run: T("السبب: WA_DRY_RUN = \"1\" على الـ Worker.", "Why: WA_DRY_RUN = \"1\" on the Worker."), switch_off: T("السبب: مفتاح «تشغيل إرسال واتساب الحقيقي» مقفول.", "Why: the «real WhatsApp sending» switch is off."), feature_off: T("السبب: «إرسال واتساب» متوقف من «🛠️ المطوّر» ← «المزايا».", "Why: WhatsApp sending is switched off in «🛠️ Developer» → «Features».") }[j.reason] || "") + "</p>" : "")
          + (can("keys.manage") ? '<div class="acts2"><a class="btn l" href="#keys">' + h(T("🔑 «مفاتيح الخدمات»: التوكن وتشغيل الإرسال الحقيقي", "🔑 «Service keys»: the token and real sending")) + "</a></div>" : "")); }, function (e) { if (alive(c)) $("#wah").innerHTML = errH(e, false); }); };
    var load = function () {
      $("#watab").innerHTML = tabsH([["", "كل الرسائل", "All messages"], ["mood", "مزاج", "Mood"], ["stop", "إيقاف", "Stop"], ["time", "مواعيد", "Times"]], c.st.flag, "wfl");
      var tb = $("#tb");
      /* the existing log endpoint (admin.js) answers members.role = admin only (owner/admin); support gets the honest note, no 403 call */
      if (!isAdm()) { tb.innerHTML = '<div style="padding:12px"><div class="note">' + h(T("سجل الواتساب الحالي على الـ API محتاج دور مدير (admin) — حالة الخدمة فوق متاحة لك.", "The current WhatsApp log API needs the admin role — the service status above is available to you.")) + "</div></div>"; return; }
      tb.innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      GET("/admin/wa" + qs({ flag: c.st.flag })).then(function (j) {
        if (!alive(c)) return; var it = j.items || [];
        tb.innerHTML = tableH([["الوقت", "Time", function (r) { return fdh(r.created_at, true); }], ["العضو", "Member", function (r) { return '<span dir="auto">' + h(r.company || r.name || r.member_id || "—") + "</span>"; }], ["الاتجاه", "Direction", function (r) { return h(r.direction === "in" ? T("وارد", "In") : T("صادر", "Out")); }], ["النوع", "Kind", function (r) { return '<small dir="ltr">' + h(r.kind || "") + "</small>"; }], ["الحالة", "Status", function (r) { return h(r.status || ""); }], ["علامة", "Flag", function (r) { return r.flag ? tag({ mood: T("مزاج", "mood"), stop: T("إيقاف", "stop"), time: T("موعد", "time") }[r.flag] || r.flag, r.flag === "mood" ? "x" : "p") : "—"; }], ["النص", "Text", function (r) { return '<small dir="auto">' + h(cut(r.text || "", 140)) + "</small>"; }]], it, { count: it.length, empty: T("مفيش رسائل في السجل.", "No messages in the log.") });
      }, function (e) { if (!alive(c)) return; tb.innerHTML = '<div style="padding:12px">' + (e.status === 403 ? '<div class="note">' + h(T("سجل الواتساب الحالي على الـ API محتاج دور مدير (admin).", "The current WhatsApp log API needs the admin role.")) + "</div>" : errH(e)) + "</div>"; });
    };
    c.on.wfl = function (b) { c.st.flag = b.getAttribute("data-v"); load(); };
    c.on.rf = function () { health(); load(); };
    health(); load();
  };
  /* bassem ➕ — read-only monitoring of partner/strategic members (GET /api/admin/cc/bassem) */
  SEC.bassem = function () {
    var c = CUR;
    head(T("باسم – المستشار", "Bassem – advisor"), h(T("متابعة بس: أعضاء الشريك الأساسي والاستراتيجي", "Monitoring only: Core and Strategic partner members")), btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    setCt('<div class="cd"><div id="tb"></div></div>');
    var DN = [T("الأحد", "Sun"), T("الاتنين", "Mon"), T("التلات", "Tue"), T("الأربع", "Wed"), T("الخميس", "Thu"), T("الجمعة", "Fri"), T("السبت", "Sat")];
    var load = function () {
      var tb = $("#tb"); tb.innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      GET("/admin/cc/bassem").then(function (j) {
        if (!alive(c)) return; var it = j.items || [];
        tb.innerHTML = tableH([["العضو", "Member", function (r) { return '<b dir="auto">' + h(r.company || "—") + '</b><br><small dir="auto">' + h(((r.title || "") + " " + (r.name || "")).trim()) + "</small>"; }], ["الباقة", "Plan", function (r) { return h(planName(r.plan)); }], ["فاضل", "Days left", function (r) { return h(r.days_left == null ? "—" : nf(r.days_left) + T(" يوم", " days")); }], ["واتساب", "WhatsApp", function (r) { return h(r.wa_optin ? (r.wa_verified ? T("✓ مفعّل ومتأكد", "✓ on, verified") : T("مفعّل (لسه ماتأكدش)", "on (not verified)")) : T("مقفول", "off")); }], ["الصبح", "Morning", function (r) { return h(r.morning_time || "—"); }], ["الجلسة", "Session", function (r) { return h(r.session_time || "—"); }], ["الأيام", "Days", function (r) { var d = r.days; return h(Array.isArray(d) ? d.map(function (x) { return DN[+x] || x; }).join("، ") : d || "—"); }], ["موقوف", "Paused", function (r) { return r.pause ? tag(T("موقوف", "Paused"), "p") : "—"; }], ["آخر رسالة صباح / مكالمة", "Last morning / call", function (r) { return h((r.morning_sent_day || "—") + " / " + (r.call_sent_day || "—")); }], ["صفقات مفتوحة", "Open deals", function (r) { return h(nf(r.deals_open || 0)); }], ["آخر نشاط", "Last activity", function (r) { return (r.last_seen_at ? fdh(r.last_seen_at, true) : "—"); }], ["تنبيهات مزاج (30 يوم)", "Mood flags (30 days)", function (r) { return r.mood_flags_30d ? tag(nf(r.mood_flags_30d), "x") : "—"; }]], it, { count: it.length, empty: T("لسه مفيش أعضاء على باقات الشراكة.", "No members on partner plans yet.") });
      }, function (e) { if (alive(c)) tb.innerHTML = '<div style="padding:12px">' + errH(e) + "</div>"; });
    };
    c.on.rf = load; load();
  };


  /* =====================================================================================================================
     bassem-meetings ➕ — «📞 اجتماعات باسم» (owner + admin, meetings.bassem; owner request 2026-11-19): send Bassem (Anam) into a Google
     Meet / Zoom / Teams call of the platform's team (POST /api/admin/cc/meetings), Anam's list of his invites (GET) with «إلغاء» for a
     pending one and «⏹ إخراج باسم» for an active one (POST …/:id/cancel), and the daily cap (PUT …/cap: the owner, meetings.cap).
     Anam cannot dial a phone number: the page says so in one line. The server checks everything again (worker/src/bassem-meetings.js).
     ===================================================================================================================== */
  var MT_ST = { pending: ["مستني", "Pending", "p"], active: ["جوّه الاجتماع دلوقتي", "In the meeting now", "ok"], ended: ["خلص", "Ended", "g"], failed: ["ماقدرش يدخل", "Could not join", "x"], cancelled: ["اتلغى", "Cancelled", "g"] };
  var MT_JOIN = { joining: ["بيدخل الاجتماع…", "Joining…"], waiting_room: ["مستني حد يدخّله من غرفة الانتظار", "Waiting to be admitted from the waiting room"], in_call: ["جوّه المكالمة", "In the call"],
    media_denied: ["الصوت أو الصورة اترفضوا", "Audio / video denied"], media_granted: ["الصوت والصورة شغّالين", "Audio / video on"], media_active: ["الصوت والصورة شغّالين", "Audio / video on"], left: ["خرج", "Left"], done: ["خلص", "Done"], error: ["حصلت مشكلة", "An error occurred"] };
  var MT_WHY = { not_admitted: ["محدش دخّله من غرفة الانتظار", "Nobody admitted him from the waiting room"], join_denied: ["دخوله اترفض", "His join was denied"], meeting_link_invalid: ["رابط الاجتماع مش شغّال", "The meeting link does not work"],
    meeting_not_started: ["الاجتماع ماكانش بدأ", "The meeting had not started"], removed_by_host: ["صاحب الاجتماع طلّعه", "The host removed him"], meeting_ended: ["الاجتماع خلص", "The meeting ended"],
    idle_timeout: ["خرج بعد سكوت طويل", "He left after a long silence"], left_call: ["خرج من الاجتماع", "He left the call"], provider_error: ["مشكلة عند مزوّد الاجتماع", "A problem at the meeting provider"] };
  var MT_TYPE = { team: ["اجتماع فريق", "Team meeting"], personal: ["مكالمة شخصية", "Personal call"] };
  var MT_ERR = {
    anam_key_missing: ["مفتاح Anam مش متضاف — المالك يضيفه من «مفاتيح الخدمات» (مفتاح فيه صلاحية الاجتماعات meetings).", "The Anam key is not set — the owner adds it in «Service keys» (a key with the meetings scope)."],
    no_capacity: ["Anam مفيهوش مكان فاضي دلوقتي — جرّب كمان شوية، أو حدّد ميعاد بعد 10 دقايق على الأقل علشان مكانه يتحجز.", "Anam has no free capacity right now — try again shortly, or schedule at least 10 minutes ahead so his place is reserved."],
    bad_link: ["الرابط لازم يكون رابط اجتماع Google Meet أو Zoom أو Microsoft Teams، زي https://meet.google.com/abc-defg-hij", "The link must be a Google Meet, Zoom or Microsoft Teams meeting link, like https://meet.google.com/abc-defg-hij"],
    too_far: ["أقصى ميعاد 7 أيام من دلوقتي.", "The latest time is 7 days from now."],
    in_past: ["الميعاد ده فات — اختار ميعاد جاي أو «دلوقتي».", "That time has passed — choose a later time or «Now»."],
    bad_time: ["التاريخ أو الساعة مش مظبوطين (بتوقيت القاهرة).", "The date or time is not valid (Cairo time)."],
    duplicate: ["باسم معزوم على الاجتماع ده بالفعل (لسه مستني أو جوّه) — ألغي الدعوة القديمة الأول لو عايز تغيّر الميعاد.", "Bassem is already invited to this meeting (pending or in it) — cancel the old invite first to change the time."],
    daily_cap: ["وصلت لحد دعوات باسم النهارده — المالك يقدر يزوّد الحد من تحت.", "Today's limit of Bassem invites is reached — the owner can raise it below."],
    meetings_off: ["دعوات باسم للاجتماعات مقفولة (الحد اليومي = 0).", "Bassem's meeting invites are off (daily cap = 0)."],
    persona_unavailable: ["ماقدرناش نقرا إعدادات باسم من Anam دلوقتي — جرّب تاني بعد شوية.", "Bassem's settings could not be read from Anam right now — try again shortly."],
    persona_copy: ["إعدادات باسم في Anam فيها حاجة ماينفعش تتنسخ للاجتماع (زي ملفات معرفة مربوطة أو سرعة صوت) — راجعها في Anam Lab.", "Bassem's Anam settings hold something that cannot be copied for a meeting (attached knowledge files or a voice speed) — check them in Anam Lab."],
    anam_unreachable: ["Anam مش بيرد دلوقتي — جرّب تاني بعد شوية.", "Anam is not answering right now — try again shortly."],
    not_ours: ["الدعوة دي مش من لوحة التحكم — تتلغي من Anam Lab.", "This invite was not made from the Control Center — cancel it in Anam Lab."],
    instruction_like: ["فيه جملة شبه أمر لباسم (زي «تجاهل التعليمات» أو «باسم لازم يقول…») — اكتب موضوعات الاجتماع بس.", "A sentence reads like an order to Bassem (such as «ignore the instructions» or «Bassem must say…») — write the meeting's topics only."],
    invalid_contact: ["ممنوع أرقام تليفون أو إيميلات أو لينكات واتساب في عنوان الاجتماع أو ملخصه.", "No phone numbers, e-mail addresses or WhatsApp links in the meeting's title or briefing."],
    feature_off: ["«مكالمات باسم المباشرة» مقفولة من «🛠️ المطوّر» ← «المزايا» — الاجتماعات كمان واقفة.", "Bassem's live calls are switched off in «🛠️ Developer» → «Features» — meetings too."]
  };
  function mtErr(e) {
    var c = e && e.code, j = (e && e.j) || {}, st = +j.upstream_status || 0, rs = +j.retry_s || 0;
    var wait = rs ? T(" (استنى حوالي " + Math.max(1, Math.ceil(rs / 60)) + " دقيقة)", " (wait about " + Math.max(1, Math.ceil(rs / 60)) + " min)") : "";
    if (c === "anam_refused") {
      if (st === 401) return T("Anam رفض المفتاح (401) — المفتاح غلط أو اتلغى، والمالك يغيّره من «مفاتيح الخدمات».", "Anam refused the key (401) — it is wrong or revoked; the owner replaces it in «Service keys».");
      if (st === 403) return T("مفتاح Anam مالوش الصلاحية المطلوبة (403) — محتاج مفتاح فيه صلاحية الاجتماعات (meetings) وقراءة الشخصيات.", "The Anam key lacks a needed permission (403) — it needs the meetings scope and persona read.");
      if (st === 429) return T("Anam بيقول طلبات كتير (429) — استنى شوية وجرّب تاني.", "Anam says too many requests (429) — wait a little and try again.") + wait;
      if (st === 503) return T("Anam مش متاح دلوقتي أو الاجتماعات مش متفعّلة على الحساب (503) — جرّب تاني بعد شوية، ولو فضلت كده كلّم Anam.", "Anam is unavailable right now, or meetings are not enabled on the account (503) — try again shortly; if it stays, contact Anam.") + wait;
      if (st >= 500) return T("Anam عنده مشكلة دلوقتي (" + st + ") — جرّب تاني بعد شوية.", "Anam has a problem right now (" + st + ") — try again shortly.");
      if (st >= 200 && st < 300) return T("Anam رجّع رد مش مفهوم — شوف القايمة تحت قبل ما تبعت تاني.", "Anam returned an unexpected answer — check the list below before sending again.");
      return T("Anam رفض الطلب (" + (st || "—") + ").", "Anam refused the request (" + (st || "—") + ").");
    }
    if (c === "anam_unreachable" && j.unclear) return T("Anam ماردّش على طلب الدعوة في الوقت — ممكن تكون اتعملت: شوف القايمة تحت قبل ما تبعت تاني.", "Anam did not answer the invite request in time — it may have been made: check the list below before sending again.");
    if (c === "no_capacity") return L2(MT_ERR.no_capacity) + wait;
    if (c === "daily_cap") return L2(MT_ERR.daily_cap) + (j.cap != null ? " (" + nf(j.cap) + ")" : "");
    if (MT_ERR[c]) return L2(MT_ERR[c]);
    return errText(e);
  }
  /* a Cairo wall-clock date + time → UTC ms (NaN when unknown) — the Worker's two-step offset rule (meetings.js cairoToUtc), for the warnings only */
  function cairoMs(d, t) {
    var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(d)), b = /^(\d{1,2}):(\d{2})$/.exec(str(t));
    if (!a || !b) return NaN;
    var naive = Date.UTC(+a[1], +a[2] - 1, +a[3], +b[1], +b[2]);
    var off = function (ms) {
      try {
        var s = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
        var m = /(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/.exec(s);
        return m ? (Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] % 24, +m[5]) - Math.floor(ms / 60000) * 60000) / 60000 : 120;
      } catch (e) { return 120; }
    };
    var ms = naive - off(naive - 72e5) * 60000;
    return naive - off(ms) * 60000;
  }
  /* the meeting links the Worker accepts (the server checks again — this only spares a round trip) */
  var MT_LINK = /^(?:https:\/\/)?(?:meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[\/?#]|$)|(?:[a-z0-9-]+\.)?zoom\.us\/j\/\d{9,11}(?:[\/?#]|$)|teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join\/|meet\/))/i;
  function mtStatusH(r) {
    var s = MT_ST[r.status] || [r.status || "—", r.status || "—", "g"], x = tag(T(s[0], s[1]), s[2]);
    if ((r.status === "pending" || r.status === "active") && r.join_state && MT_JOIN[r.join_state]) x += "<br><small>" + h(L2(MT_JOIN[r.join_state])) + "</small>";
    if (r.status_reason) x += "<br><small>" + h(MT_WHY[r.status_reason] ? L2(MT_WHY[r.status_reason]) : r.status_reason) + "</small>";
    return x;
  }
  var MT_COLS = [
    ["الحالة", "Status", mtStatusH],
    ["الميعاد (القاهرة)", "When (Cairo)", function (r) { return r.now ? h(T("فوراً", "Right away")) + "<br>" + fdh(r.created_at, true) : fdh(r.join_at, true); }],
    ["العنوان", "Title", function (r) { return '<b dir="auto">' + h(r.title || "—") + "</b>" + (r.by ? '<br><small dir="ltr">' + h(r.by) + "</small>" : ""); }],
    ["النوع", "Type", function (r) { return h(MT_TYPE[r.type] ? L2(MT_TYPE[r.type]) : r.type || "—") + (r.lang === "en" ? " · " + h(T("إنجليزي", "English")) : ""); }],
    ["الرابط", "Link", function (r) { return '<span dir="ltr">' + h(r.host || "—") + "</span>"; }]
  ];
  function mtActs(r) {
    if (r.status === "pending") return btn("mtcx", h(T("إلغاء", "Cancel")), "l s", ' data-id="' + h(r.id) + '"');
    if (r.status === "active") return btn("mtcx", h(T("⏹ إخراج باسم", "⏹ Remove Bassem")), "d s", ' data-id="' + h(r.id) + '" data-st="active"');
    return "";
  }
  function mtListH(items) { return tableH(MT_COLS, items || [], { count: (items || []).length, acts: mtActs, empty: T("لسه مفيش اجتماعات لباسم — ابعته لأول اجتماع من فوق.", "No meetings for Bassem yet — send him to the first one above.") }); }
  SEC["bassem-meetings"] = function () {
    var c = CUR, owner = can("meetings.cap");
    head(T("📞 اجتماعات باسم", "📞 Bassem's meetings"), h(T("ابعت باسم لاجتماع فيديو مع فريق المنصة", "Send Bassem to a video meeting with the platform's team")), btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var F = [
      { n: "meeting_url", l: ["رابط الاجتماع", "Meeting link"], w: 1, req: 1, max: 1500, dir: "ltr", ph: ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"], hint: ["Google Meet أو Zoom أو Microsoft Teams بس — اعمل الاجتماع من موبايلك وانسخ الرابط هنا.", "Google Meet, Zoom or Microsoft Teams only — create the meeting on your phone and paste its link here."] },
      { n: "title", l: ["عنوان الاجتماع", "Meeting title"], req: 1, max: 100, ph: ["مثلاً: اجتماع الفريق الأسبوعي", "e.g. Weekly team meeting"] },
      { n: "type", l: ["نوع المكالمة", "Call type"], t: "sel", opts: [["team", "اجتماع فريق — باسم بيسمع وبيرد لما حد يناديه باسمه", "Team meeting — Bassem listens and answers when called by name"], ["personal", "مكالمة شخصية — باسم بيرحّب وبيرد على كل الكلام", "Personal call — Bassem greets and answers everything"]] },
      { n: "lang", l: ["لغة الاجتماع", "Meeting language"], t: "sel", opts: [["ar", "عربي (مصري)", "Arabic (Egyptian)"], ["en", "إنجليزي", "English"]] },
      { n: "when", l: ["إمتى", "When"], t: "sel", opts: [["now", "دلوقتي — باسم بيدخل في خلال دقيقة", "Now — Bassem joins within a minute"], ["later", "في ميعاد محدد (بتوقيت القاهرة، لحد 7 أيام)", "At a set time (Cairo time, up to 7 days)"]] },
      { n: "date", l: ["التاريخ", "Date"], t: "date" },
      { n: "time", l: ["الساعة (بتوقيت القاهرة)", "Time (Cairo)"], t: "time", ph: ["15:30", "15:30"] },
      { n: "agenda", l: ["ملخص لباسم / جدول الأعمال (اختياري)", "Briefing for Bassem / agenda (optional)"], t: "ta", max: 2000, rows: 5, hint: ["موضوعات الاجتماع بس، سطر لكل موضوع — من غير أرقام تليفون أو إيميلات لحد، ومن غير أوامر لباسم: هو بيقراها كمعلومات.", "Only the meeting's topics, one per line — no one's phone numbers or e-mails and no orders to Bassem: he reads them as information."] }
    ];
    var steps = [["اعمل اجتماع Google Meet من موبايلك (أو Zoom أو Teams) وانسخ الرابط.", "Create a Google Meet meeting on your phone (or Zoom or Teams) and copy its link."], ["الصق الرابط هنا واكتب عنوان قصير.", "Paste the link here and write a short title."],
      ["اختار «دلوقتي» ودوس «📞 ابعت باسم للاجتماع».", "Choose «Now» and press «📞 Send Bassem to the meeting»."], ["باسم بيدخل في خلال دقيقة — لو الاجتماع فيه غرفة انتظار، دخّله.", "Bassem joins within a minute — if the meeting has a waiting room, admit him."]];
    var notes = [["باسم بيظهر في الاجتماع باسم «%DN%»، وعلى الفيديو بتاعه علامة إنه ذكاء اصطناعي.", "Bassem shows in the meeting as «%DN%», with an AI label on his video."],
      ["«دلوقتي» أو ميعاد بعد أقل من 10 دقايق: باسم بيدخل لو Anam عنده مكان فاضي ساعتها. ميعاد بعد 10 دقايق أو أكتر بيحجز مكانه.", "«Now» or a time less than 10 minutes away: Bassem joins if Anam has free capacity then. A time 10 minutes or more ahead reserves his place."],
      ["في الاجتماع مفيش شاشة ولا إيميلات ولا واتساب: باسم بيدوّر في بيانات المنصة ومركز المعلومات وبيتكلم بس.", "In a meeting there is no shared screen, e-mail or WhatsApp: Bassem searches the platform's data and the information centre, and talks."],
      ["كل دقيقة باسم جوّه الاجتماع بتتحسب من دقايق Anam (لحد ساعة في الاجتماع الواحد)، وAnam بيحتفظ بنص المكالمة وتسجيلها زي أي مكالمة مع باسم.", "Every minute Bassem spends in a meeting uses Anam minutes (up to one hour per meeting), and Anam keeps the call's transcript and recording like any call with Bassem."]];
    setCt('<div class="note" role="note">' + h(T("باسم بيدخل اجتماعات Google Meet / Zoom / Teams — مش بيتصل على أرقام تليفون", "Bassem joins Google Meet / Zoom / Teams meetings — he does not call phone numbers")) + "</div>"
      + cardH(T("📞 ابعت باسم لاجتماع", "📞 Send Bassem to a meeting"), '<ol class="bm-steps sm">' + steps.map(function (x) { return "<li>" + h(L2(x)) + "</li>"; }).join("") + "</ol>"
        + '<div id="mtf" class="bm-form">' + formH(F, { type: "team", lang: "ar", when: "now", date: today() }) + "</div>"
        + '<p class="sm warn" id="mtw" role="status" hidden></p>'
        + '<div class="acts2" style="margin-top:10px">' + btn("mtsend", h(T("📞 ابعت باسم للاجتماع", "📞 Send Bassem to the meeting")), "r") + "</div>"
        + '<div id="mtres" role="status"></div>'
        + '<ul class="bm-notes sm mut">' + notes.map(function (x) { return "<li>" + h(L2(x)).replace("%DN%", '<bdi dir="rtl">باسم · منصة صنع في مصر (AI)</bdi>') + "</li>"; }).join("") + "</ul>")
      + '<div class="cd"><h3>' + h(T("الاجتماعات", "Meetings")) + '</h3><div class="in" id="mtcap"></div><div id="tb"></div></div>');
    var root = $("#mtf");
    var later = function () { var w = $('[data-f="when"]', root); return !!w && w.value === "later"; };
    /* the date + time only for «في ميعاد محدد»; the warning line under them: passed / < 10 minutes (not reserved) / > 7 days */
    var warn = function () {
      var el = $("#mtw"), v = readForm(root, F), m = later() ? (cairoMs(v.date, v.time) - Date.now()) / 60000 : NaN;
      if (!el) return;
      var t = isNaN(m) ? "" : m < 1 ? L2(MT_ERR.in_past) : m > 7 * 1440 ? L2(MT_ERR.too_far) : m < 10 ? T("⚠ الميعاد بعد أقل من 10 دقايق: مكان باسم مش هيتحجز، ولو Anam مشغول ساعتها ممكن يرفض.", "⚠ Less than 10 minutes away: Bassem's place is not reserved, and Anam may refuse if it is busy then.") : "";
      el.textContent = t; el.hidden = !t;
    };
    var whenUi = function () {
      var on = later();
      ["date", "time"].forEach(function (n) { var el = $('[data-f="' + n + '"]', root), lb = el && el.closest ? el.closest("label") : null; if (lb) lb.hidden = !on; });
      warn();
    };
    ["when", "date", "time"].forEach(function (n) { var el = $('[data-f="' + n + '"]', root); if (el) { el.addEventListener("change", whenUi); el.addEventListener("input", warn); } });
    whenUi();
    var capH = function (j) {
      var cp = (j && j.cap) || {}, used = j && j.used_today != null ? +j.used_today : 0, lim = cp.value != null ? +cp.value : null;
      var t1 = lim == null ? "" : T("النهارده اتبعت " + nf(used) + " من " + nf(lim) + " دعوة", "Sent today: " + nf(used) + " of " + nf(lim) + " invites") + (cp.source === "default" ? T(" (الحد الافتراضي)", " (the default cap)") : "") + (lim === 0 ? T(" — الدعوات مقفولة", " — invites are off") : "");
      if (!owner) return t1 ? '<p class="sm mut" style="margin:0">' + h(t1) + "</p>" : "";
      return (t1 ? '<p class="sm" style="margin:0 0 8px">' + h(t1) + "</p>" : "") + '<label for="mt_cap" class="sm" style="margin:0 0 4px">' + h(T("الحد اليومي للدعوات (0 = مقفولة، لحد 50)", "Daily invite cap (0 = off, up to 50)")) + "</label>"
        + '<div class="acts2 bm-cap"><input id="mt_cap" type="number" min="0" max="50" step="1" dir="ltr" value="' + h(cp.source === "panel" ? String(cp.value) : "") + '" placeholder="' + h(String(cp["default"] || 10)) + '">'
        + btn("mtcap", h(T("💾 حفظ الحد", "💾 Save the cap")), "r s") + (cp.source === "panel" ? btn("mtcapdef", h(T("↺ الافتراضي", "↺ Default") + " (" + (cp["default"] || 10) + ")"), "l s") : "") + "</div>";
    };
    var load = function () {
      var tb = $("#tb"); if (!tb) return;
      tb.innerHTML = '<div style="padding:18px" role="status">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      GET("/admin/cc/meetings").then(function (j) {
        if (!alive(c)) return; c.st.j = j || {};
        tb.innerHTML = mtListH((j && j.items) || []); $("#mtcap").innerHTML = capH(j);
      }, function (e) {
        if (!alive(c)) return;
        $("#mtcap").innerHTML = "";
        tb.innerHTML = '<div style="padding:12px">' + (e.code === "anam_key_missing" ? '<div class="note">' + h(mtErr(e)) + (can("keys.manage") ? ' <a href="#keys">' + h(T("🔑 افتح «مفاتيح الخدمات» ←", "🔑 Open «Service keys» →")) + "</a>" : "") + "</div>"
          : '<div class="errc" role="alert">' + h(mtErr(e)) + errSmall(e) + '<div class="acts">' + btn("rf", "↻ " + h(T("حاول تاني", "Try again")), "l s") + "</div></div>") + "</div>";
      });
    };
    var say = function (ok, html) { var el = $("#mtres"); if (el) el.innerHTML = '<div class="' + (ok ? "okc" : "alert") + '">' + html + "</div>"; };
    c.on.rf = load;
    c.on.mtsend = function (b) {
      var v = readForm(root, F), lt = v.when === "later";
      var errs = validate(F.filter(function (f) { return lt || (f.n !== "date" && f.n !== "time"); }), v);
      if (!errs.meeting_url && !MT_LINK.test(v.meeting_url)) errs.meeting_url = L2(MT_ERR.bad_link);
      if (lt) { if (!v.date) errs.date = T("مطلوب", "Required"); if (!v.time) errs.time = T("مطلوب", "Required"); }
      var mins = lt ? (cairoMs(v.date, v.time) - Date.now()) / 60000 : 0;
      if (lt && !isNaN(mins) && !errs.time && !errs.date) { if (mins < 1) errs.time = L2(MT_ERR.in_past); else if (mins > 7 * 1440) errs.date = L2(MT_ERR.too_far); }
      if (showErrs(root, errs)) return;
      var msg = (lt ? T("باسم هيدخل الاجتماع ده يوم " + v.date + " الساعة " + v.time + " (بتوقيت القاهرة)", "Bassem will join this meeting on " + v.date + " at " + v.time + " (Cairo time)") : T("باسم هيدخل الاجتماع ده دلوقتي", "Bassem will join this meeting now"))
        + T("، وكل دقيقة جوّه الاجتماع بتتحسب من دقايق Anam.", ", and every minute in the meeting uses Anam minutes.")
        + (lt && mins < 10 ? "\n\n" + T("⚠ الميعاد بعد أقل من 10 دقايق: مكانه مش هيتحجز، وAnam ممكن يرفض لو مشغول.", "⚠ Less than 10 minutes away: his place is not reserved, and Anam may refuse if it is busy.") : "") + "\n\n" + T("نبعته؟", "Send him?");
      if (!sure(msg)) return;
      var body = { meeting_url: v.meeting_url, title: v.title, type: v.type, lang: v.lang, when: lt ? "later" : "now", agenda: v.agenda || "" };
      if (lt) { body.date = v.date; body.time = v.time; }
      b.disabled = true; $("#mtres").innerHTML = '<p class="sm" role="status">' + h(T("جارٍ الإرسال لـ Anam…", "Sending to Anam…")) + "</p>";
      POST("/admin/cc/meetings", body, { timeout: 45000 }).then(function (j) {
        b.disabled = false; if (!alive(c)) return;
        var it = (j && j.item) || {};
        say(true, h(T("✓ باسم معزوم على الاجتماع", "✓ Bassem is invited to the meeting")) + (it.host ? ' (<span dir="ltr">' + h(it.host) + "</span>)" : "") + " — " + h(MT_ST[it.status] ? L2(MT_ST[it.status]) : it.status || "")
          + "<br><small>" + h(j && j.reserved ? T("مكانه اتحجز في الميعاد.", "His place is reserved for that time.") : T("مكانه مش محجوز: لو Anam مشغول ممكن مايدخلش — تابع الحالة في القايمة تحت.", "His place is not reserved: if Anam is busy he may not join — follow the status in the list below.")) + " " + h(T("لو فيه غرفة انتظار، دخّله أول ما يطلب.", "If there is a waiting room, admit him when he asks.")) + "</small>");
        ["meeting_url", "title", "agenda"].forEach(function (n) { var el = $('[data-f="' + n + '"]', root); if (el) el.value = ""; });
        toast(T("اتبعت ✓", "Sent ✓")); load();
      }, function (e) {
        b.disabled = false; if (!alive(c)) return;
        showErrs(root, serverErrs(e)); say(false, h(mtErr(e)) + errSmall(e));
        if (e.code === "duplicate" || e.code === "daily_cap" || (e.j && e.j.unclear)) load();
      });
    };
    c.on.mtcx = function (b) {
      var id = b.getAttribute("data-id"), act = b.getAttribute("data-st") === "active";
      if (!sure(act ? T("إخراج باسم من الاجتماع دلوقتي؟", "Remove Bassem from the meeting now?") : T("إلغاء دعوة باسم للاجتماع ده؟", "Cancel Bassem's invite to this meeting?"))) return;
      b.disabled = true;
      POST("/admin/cc/meetings/" + enc(id) + "/cancel", {}).then(function (j) {
        toast(j && j.unchanged ? T("الدعوة كانت خلصت أو اتلغت قبل كده.", "The invite had already ended or been cancelled.") : act ? T("باسم خرج من الاجتماع ✓", "Bassem left the meeting ✓") : T("الدعوة اتلغت ✓", "The invite was cancelled ✓"));
        if (alive(c)) load();
      }, function (e) { b.disabled = false; toast(mtErr(e), 1); });
    };
    c.on.mtcap = function (b) {
      var inp = $("#mt_cap"), v = inp ? trim(inp.value) : "";
      if (!/^\d{1,2}$/.test(v) || +v > 50) { toast(T("الحد اليومي رقم من 0 لـ 50 (0 = الدعوات مقفولة).", "The daily cap is a number from 0 to 50 (0 = invites off)."), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/meetings/cap", { value: +v }).then(function (r) { toast(r && r.unchanged ? T("مفيش تغيير.", "No change.") : T("اتحفظ ✓", "Saved ✓")); if (alive(c)) load(); }, function (e) { b.disabled = false; toast(mtErr(e), 1); });
    };
    c.on.mtcapdef = function (b) {
      b.disabled = true;
      PUT("/admin/cc/meetings/cap", { value: null }).then(function () { toast(T("رجع للحد الافتراضي ✓", "Back to the default cap ✓")); if (alive(c)) load(); }, function (e) { b.disabled = false; toast(mtErr(e), 1); });
    };
    load();
  };

  /* =====================================================================================================================
     plans — الباقات والصلاحيات: the live matrix (numbers + checkboxes, «💾 حفظ») — the single source of truth (§7)
     ===================================================================================================================== */
  var PCOLS = ["visitor", "profile", "basic", "premium", "partner", "strategic"];
  var PCOLN = { visitor: ["بدون باقة (ثابتة)", "No plan (fixed)"], profile: ["تسجيل بيانات فقط", "Company data only"], basic: ["الأساسية", "Basic"], premium: ["المميزة", "Premium"], partner: ["الشريك الأساسي", "Core partner"], strategic: ["الشريك الاستراتيجي", "Strategic partner"] };
  var MARKET_KEYS = ["m_local", "m_gulf", "m_africa", "m_asia", "m_europe"];
  /* ---------- the Janna & Bassem price sync (the anchored token sync, DESIGN §4.5): status, reason, changes, review ---------- */
  var PS_ST = { ok: ["اتحدّث ✓", "Updated ✓"], unchanged: ["مفيش تغيير ✓", "No change ✓"], failed: ["مااتحدّثش ✗", "Not updated ✗"], dry: ["معاينة", "Preview"] };
  var PS_WHY = { section_missing: ["قسم الباقات مش موجود في البرومبت — راجعه يدوياً", "The plans section is not in the prompt — review it by hand"],
    price_header_missing: ["سطر «الأسعار سنوية…» مش موجود — راجع البرومبت يدوياً", "The «Annual fees…» line is missing — review the prompt by hand"],
    plan_lines_count: ["عدد سطور الباقات مختلف عن الباقات المتاحة للبيع — راجع البرومبت يدوياً", "The number of plan lines differs from the plans on sale — review the prompt by hand"],
    plan_line_shape: ["سطر باقة مكتوب بشكل مختلف — راجع البرومبت يدوياً", "A plan line is written differently — review the prompt by hand"],
    guard: ["التحديث كان هيغيّر نص برّه قسم الأسعار، فاتوقف — راجع البرومبت يدوياً", "The update would have changed text outside the price block, so it stopped — review the prompt by hand"],
    unknown_persona: ["شخصية مش معروفة للمزامنة", "Unknown persona"],
    conflict: ["حد عدّل البرومبت في نفس اللحظة — هنحاول تاني تلقائياً", "Someone edited the prompt at the same moment — we will try again automatically"],
    no_key: ["مفتاح Anam مش متضاف", "The Anam key is not added"] };
  function psSt(s) { return PS_ST[s] ? L2(PS_ST[s]) : str(s); }
  function psWhy(x) { if (!x || x.status === "ok" || x.status === "unchanged" || x.status === "dry") return ""; var r = str(x.reason) || (/^([a-z_]+)\b/.exec(str(x.error)) || [])[1] || ""; return PS_WHY[r] ? L2(PS_WHY[r]) : cut(str(x.error || r), 120); }
  function psPlan(k) { return PCOLN[k] ? L2(PCOLN[k]) : str(k); }
  function psVal(k, v, keys) { var t = ((keys || []).filter(function (x) { return x.k === k; })[0] || {}).type; if (t === "bool") return +v ? T("متاح", "on") : T("مش متاح", "off"); if (+v === -1) return T("بلا حد", "unlimited"); return str(v); }
  /* «⚠ محتاج مراجعة: «المميزة»: «أسواق أفريقيا» في الجدول = متاح، والبرومبت مكتوب على مش متاح» */
  function psRev(rv, keys) {
    if (!rv) return "";
    if (rv.kind === "name_elsewhere") return T("⚠ الاسم القديم «" + str(rv.old) + "» لسه مكتوب " + nf(rv.count) + " مرة برّه قسم الأسعار", "⚠ The old name «" + str(rv.old) + "» is still written " + nf(rv.count) + " time(s) outside the price block");
    var kk = (keys || []).filter(function (x) { return x.k === rv.key; })[0], lab = kk ? (EN() ? kk.label_en || kk.label_ar : kk.label_ar) : str(rv.key);
    return T("⚠ محتاج مراجعة: «" + psPlan(rv.plan) + "»: «" + lab + "» في الجدول = " + psVal(rv.key, rv.matrix, keys) + "، والبرومبت مكتوب على " + psVal(rv.key, rv.text_says, keys), "⚠ Needs review: «" + psPlan(rv.plan) + "»: «" + lab + "» in the table = " + psVal(rv.key, rv.matrix, keys) + ", the prompt says " + psVal(rv.key, rv.text_says, keys));
  }
  function psRevToast(rv) { return T("⚠ محتاج مراجعة يدوية في البرومبت: ", "⚠ The prompt needs a manual review: ") + rv.slice(0, 3).map(function (x) { return psRev(x, (CUR && CUR.st && CUR.st.j || {}).keys).replace(/^⚠\s*/, ""); }).join(" · "); }
  /* «سعر الأساسية: عشرة آلاف ← اتناشر ألف» */
  function psChg(c0) {
    if (!c0) return ""; var ar = function (w) { return T(w[0], w[1]); }, arrow = EN() ? " → " : " ← ";
    var lab = { vat: ["الضريبة", "VAT"], price: ["سعر", "price of"], products: ["منتجات", "products of"], name: ["اسم", "name of"], payment: ["جملة الدفع", "payment sentence"] }[c0.what];
    if (!lab) return "";
    return ar(lab) + (c0.plan ? " " + psPlan(c0.plan) : "") + ": " + (c0.from != null ? str(c0.from) + arrow : "") + str(c0.to);
  }
  /* after a save: GET /admin/cc/plans every 3 s (≤ 30 s) until each persona's last run is newer than the save, then the real result */
  function psPoll(c, t0, rv) {
    var n = 0, tick = function () {
      if (!alive(c)) return;
      GET("/admin/cc/plans").then(function (j) {
        if (!alive(c)) return; var last = (j.persona && j.persona.last) || [], done = last.length && last.every(function (x) { return x.at && x.at >= t0; });
        if (!done) { if (++n < 10) setTimeout(tick, 3000); else toast(T("لسه بنحدّث جنة وباسم — شوف «مزامنة جنة وباسم» بعد شوية", "Janna & Bassem are still being updated — check «Janna & Bassem sync» in a moment")); return; }
        c.st.j = j; c.st.newKeys = c.st.newKeys || [];
        var bad = last.filter(function (x) { return x.status !== "ok" && x.status !== "unchanged"; });
        toast(bad.length ? T("⚠ مااتحدّثش: ", "⚠ Not updated: ") + bad.map(function (x) { return (x.name || x.persona_id) + " — " + (psWhy(x) || psSt(x.status)); }).join(" · ") : T("جنة وباسم اتحدّثوا ✓", "Janna & Bassem were updated ✓"), bad.length > 0);
        if (rv && rv.length) setTimeout(function () { toast(psRevToast(rv), 1); }, bad.length ? 5400 : 3000);
        if (c.st.paint) c.st.paint();
      }, function () { if (++n < 10 && alive(c)) setTimeout(tick, 3000); });
    };
    setTimeout(tick, 3000);
  }
  SEC.plans = function () {
    var c = CUR, W2 = can("plans.write");
    head(T("الباقات والصلاحيات", "Plans & permissions"), h(T("صلاحيات كل عضو تتبع باقته تلقائياً", "Each member's permissions follow their plan automatically")), (W2 ? btn("plsave", h(T("💾 حفظ", "💾 Save")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var load = function () {
      setCt(loadingH());
      GET("/admin/cc/plans").then(function (j) { if (!alive(c)) return; c.st.j = j; c.st.newKeys = []; paint(); }, function (e) { if (alive(c)) setCt(errH(e)); });
    };
    var cell = function (p, k, type, v, ro) { var dis = ro || p === "visitor" || !W2 ? " disabled" : ""; return type === "bool" ? '<input type="checkbox" data-p="' + p + '" data-k="' + h(k) + '"' + (+v ? " checked" : "") + dis + ' aria-label="' + h(k + " " + p) + '">' : '<input type="number" min="' + (k === "gcc_pick" ? 0 : -1) + '"' + (k === "gcc_pick" ? ' max="5"' : "") + ' step="1" data-p="' + p + '" data-k="' + h(k) + '" value="' + h(v == null ? "" : v) + '"' + dis + ' aria-label="' + h(k + " " + p) + '">'; };
    var paint = function () {
      var j = c.st.j || {}, P = j.plans || {}, keys = (j.keys || []).concat(c.st.newKeys).slice().sort(function (a, b) { return (a.sort || 100) - (b.sort || 100); });
      var th = "<tr><th>" + h(T("الصلاحية", "Permission")) + "</th>" + PCOLS.map(function (p) { return "<th>" + h(L2(PCOLN[p])) + "</th>"; }).join("") + "</tr>";
      var top = function (lab, fn) { return '<tr class="top"><td><b>' + h(lab) + "</b></td>" + PCOLS.map(function (p) { return "<td>" + fn(p, P[p] || {}) + "</td>"; }).join("") + "</tr>"; };
      var dis = function (p) { return p === "visitor" || !W2 ? " disabled" : ""; };
      var rows = top(T("الاسم بالعربي / بالإنجليزي", "Name in Arabic / English"), function (p, x) { return '<input type="text" data-p="' + p + '" data-k="@name_ar" value="' + h(x.name_ar || "") + '" dir="auto"' + dis(p) + ' aria-label="name_ar ' + p + '"><br><input type="text" data-p="' + p + '" data-k="@name_en" value="' + h(x.name_en || "") + '" dir="ltr"' + dis(p) + ' style="margin-top:4px" aria-label="name_en ' + p + '">'; })
        + top(T("السعر السنوي (جنيه، قبل الضريبة)", "Annual price (EGP, before VAT)"), function (p, x) { return '<input type="number" min="0" step="1" data-p="' + p + '" data-k="@price_egp" value="' + h(x.price_egp == null ? 0 : x.price_egp) + '"' + dis(p) + ' aria-label="price ' + p + '">'; })
        + top(T("المدة (يوم)", "Duration (days)"), function (p, x) { return '<input type="number" min="30" max="1095" step="1" data-p="' + p + '" data-k="@duration_days" value="' + h(x.duration_days == null ? 365 : x.duration_days) + '"' + dis(p) + ' aria-label="duration ' + p + '">'; })
        + top(T("متاحة للبيع", "Available for sale"), function (p, x) { return '<input type="checkbox" data-p="' + p + '" data-k="@sellable"' + (+x.sellable ? " checked" : "") + dis(p) + ' aria-label="sellable ' + p + '">'; });
      rows += keys.map(function (k) {
        var none = !k.enforced_by || k.enforced_by === "none";
        return "<tr><td><b>" + h(EN() ? k.label_en || k.label_ar : k.label_ar) + "</b>" + (none ? " " + tag(T("محفوظ — مش مطبّق", "Saved — not applied"), "g") : "") + '<br><small class="mut" dir="ltr">' + h(k.k) + "</small></td>" + PCOLS.map(function (p) { var caps = (P[p] || {}).caps || {}; return "<td>" + cell(p, k.k, k.type, caps[k.k] != null ? caps[k.k] : (k.type === "bool" ? 0 : 0)) + "</td>"; }).join("") + "</tr>";
      }).join("");
      var ps = j.persona || {}, last = ps.last || [];
      setCt('<div class="note">' + h(T('الأرقام: 0 = غير متاح، -1 = بلا حد. الخيارات (فيديو، سوشيال...) علامة ✓ = متاح. اختيار الباقة للعضو من قسم "الأعضاء والاشتراكات".', 'Numbers: 0 = not available, -1 = unlimited. Options (video, social…) ✓ = available. Choose a member\'s plan in "Members & subscriptions".')) + "</div>"
        + '<div class="cd" style="overflow:auto"><table class="mx"><thead>' + th + "</thead><tbody>" + rows + '</tbody></table></div><div class="er" id="pler" role="alert"></div>'
        + '<div class="gr">' + cardH(T("ضريبة القيمة المضافة", "Value added tax"), '<label>' + h(T("النسبة % (لكل الباقات)", "Rate % (all plans)")) + '<input type="number" id="plvat" min="0" max="50" step="0.01" value="' + h(j.vat_bp == null ? "" : (j.vat_bp / 100)) + '"' + (W2 ? "" : " disabled") + "></label>" + '<p class="mut sm">' + h(T("العملة: ", "Currency: ") + (j.currency || "EGP")) + "</p>"
          + (W2 ? '<div class="acts2">' + btn("addk", h(T("➕ صف جديد في الجدول", "➕ New matrix row")), "l s") + "</div>" : ""))
        + cardH(T("آخر نشر", "Last publish"), kvH([[T("النسخة", "Version"), j.published_v ? "v" + j.published_v : "—", "ltr"], [T("آخر تعديل", "Last change"), j.updated_at ? fd(j.updated_at, true) : "—"]]) + '<p class="mut sm">' + h(T("الأسعار والحدود بتتطبّق فوراً على الموقع وحدود «منتجاتي» والفواتير الجديدة. في جنة وباسم بيتحدّث السعر والضريبة وعدد المنتجات واسم الباقة بس — شوف «مزامنة جنة وباسم».", "Prices and limits apply at once to the site, the «My products» limits and new invoices. In Janna and Bassem only the price, VAT, product count and plan name are updated — see «Janna & Bassem sync».")) + "</p>")
        + cardH(T("مزامنة جنة وباسم", "Janna & Bassem sync"), '<p class="sm">' + h(ps.auto ? T("المزامنة التلقائية شغّالة: بعد كل حفظ بنحدّث في برومبت جنة وباسم الأرقام اللي جاية من الجدول بس (السعر والضريبة وعدد المنتجات واسم الباقة). تغيير الأسواق أو المزايا مابيتكتبش في البرومبت تلقائياً — بيظهر هنا «محتاج مراجعة».", "Automatic sync is on: after each save only the figures that come from this table (price, VAT, product count, plan name) are updated in Janna's and Bassem's prompts. A change of markets or features is never written into the prompts automatically — it shows here as «needs review».") : T("المزامنة التلقائية مقفولة.", "Automatic sync is off.")) + "</p>"
          + (last.length ? "<ul class='sm'>" + last.map(function (x) { var why = psWhy(x); return "<li><b>" + h(x.name || x.persona_id) + "</b> — " + h(psSt(x.status) + (x.at ? " · " + fd(x.at, true) : "")) + (why ? ' <small class="bad">' + h(why) + "</small>" : "") + ((x.review || []).length ? "<br>" + (x.review || []).map(function (rv) { return '<small class="bad">' + h(psRev(rv, j.keys)) + "</small>"; }).join("<br>") : "") + "</li>"; }).join("") + "</ul>" : '<p class="mut sm">' + h(T("لسه ماحصلتش مزامنة.", "No sync yet.")) + "</p>") + (can("plans.sync") ? '<div class="acts2">' + btn("psd", h(T("معاينة التغيير", "Preview the change")), "l s") + btn("psr", h(T("مزامنة الآن", "Sync now")), "r s") + "</div>" : "")) + "</div>");
    };
    var collect = function () {
      var j = c.st.j || {}, out = {}, errs = [];
      $$("#ct [data-p]").forEach(function (el) {
        var p = el.getAttribute("data-p"), k = el.getAttribute("data-k"); if (p === "visitor") return;
        var o = out[p] = out[p] || { caps: {} }, v;
        if (el.type === "checkbox") v = el.checked ? 1 : 0; else if (el.type === "number") { v = trim(el.value) === "" ? NaN : +el.value; } else v = trim(el.value);
        var bad = "";
        if (k === "@price_egp") { if (!(v >= 0 && v <= 10000000 && v % 1 === 0)) bad = T("السعر رقم صحيح من 0 لـ 10,000,000", "Price: a whole number 0–10,000,000"); }
        else if (k === "@duration_days") { if (!(v >= 30 && v <= 1095 && v % 1 === 0)) bad = T("المدة من 30 لـ 1095 يوم", "Duration: 30–1095 days"); }
        else if (k === "gcc_pick") { if (!(v >= 0 && v <= 5 && v % 1 === 0)) bad = T("عدد دول الخليج اللي العضو بيختارها من 0 لـ 5", "Gulf states the member picks: 0 to 5"); }
        else if (el.type === "number" && k.charAt(0) !== "@") { if (!(v >= -1 && v <= 100000 && v % 1 === 0)) bad = T("الأرقام من -1 لـ 100,000", "Numbers: −1 to 100,000"); }
        else if (k === "@name_ar" && !v) bad = T("الاسم بالعربي مطلوب", "The Arabic name is required");
        /* the same rule as the Worker (acc-plans.js PLAN_NAME_BAD): «:», «—» or brackets would break the price lines of the Janna & Bassem prompts */
        if (!bad && (k === "@name_ar" || k === "@name_en") && /[:\u2014()]/.test(v)) bad = T("اسم الباقة مايكونش فيه «:» ولا «—» ولا أقواس — بيلخبط سطر الأسعار في برومبت جنة وباسم", "A plan name cannot contain «:», «—» or brackets — they break the price lines of the Janna & Bassem prompts");
        el.closest("td").classList.toggle("inv", !!bad); if (bad) errs.push(L2(PCOLN[p]) + ": " + bad);
        if (k.charAt(0) === "@") o[k.slice(1)] = v; else o.caps[k] = v;
      });
      Object.keys(out).forEach(function (p) {
        var o = out[p];
        if (o.sellable && !MARKET_KEYS.some(function (m) { return +o.caps[m] === 1; }) && MARKET_KEYS.some(function (m) { return own(o.caps, m); }) && +o.caps.listing !== 1) errs.push(L2(PCOLN[p]) + ": " + T("كل باقة متاحة للبيع لازم يكون ليها سوق واحد على الأقل أو ملف في الدليل", "a sellable plan needs a market or the directory listing"));
        if (+o.caps.gcc_pick > 0 && own(o.caps, "m_gulf") && +o.caps.m_gulf !== 1) errs.push(L2(PCOLN[p]) + ": " + T("اختيار دول الخليج محتاج «أسواق دول الخليج» تبقى متاحة في الباقة", "picking Gulf states needs the «Gulf markets» switch on"));
      });
      var vat = $("#plvat"), vb = Math.round(+vat.value * 100);
      if (!(vb >= 0 && vb <= 5000)) errs.push(T("الضريبة من 0 لـ 50%", "VAT 0–50%"));
      return { body: { plans: out, vat_bp: vb, keys: c.st.newKeys.map(function (k) { return { k: k.k, label_ar: k.label_ar, label_en: k.label_en, type: k.type, grp: k.grp }; }) }, errs: errs };
    };
    c.on.rf = load; c.st.paint = paint;
    c.on.plsave = function (b) {
      var x = collect(), er = $("#pler"); if (x.errs.length) { er.textContent = x.errs.join(" · "); return; } er.textContent = "";
      if (!x.body.keys.length) delete x.body.keys;
      b.disabled = true;
      PUT("/admin/cc/plans", x.body).then(function (r) {
        b.disabled = false; var pr = (r && r.persona) || {}, rv = pr.review || [];
        toast(T("تم الحفظ ✓ — الأسعار والحدود اتحدّثت على الموقع خلال دقيقة", "Saved ✓ — prices and limits update on the site within a minute") + (pr.queued ? T(" — وبنحدّث جنة وباسم دلوقتي…", " — updating Janna & Bassem now…") : ""));
        load();
        if (pr.queued) psPoll(c, (r && r.updated_at) || new Date().toISOString(), rv);
        else if (rv.length) setTimeout(function () { toast(psRevToast(rv), 1); }, 3000);
      }, function (e) { b.disabled = false; var se = serverErrs(e); er.innerHTML = h(errText(e)) + (Object.keys(se).length ? "<br>" + h(Object.keys(se).map(function (k) { return k + ": " + se[k]; }).join(" · ")) : "") + errSmall(e); });
    };
    c.on.addk = function () {
      var f = [F("k", "المفتاح (حروف إنجليزي صغيرة)", "Key (lower-case letters)", "text", { req: 1, max: 30, dir: "ltr", check: function (v) { return /^[a-z][a-z0-9_]{1,29}$/.test(v) && !((c.st.j.keys || []).concat(c.st.newKeys).some(function (k) { return k.k === v; })) ? "" : T("مفتاح جديد بحروف إنجليزي صغيرة", "A new key in lower-case letters"); } }), F("type", "النوع", "Type", "sel", { opts: [["bool", "متاح / مش متاح", "Available / not"], ["number", "رقم", "Number"]] }), F("label_ar", "الاسم", "Label", "text", { req: 1, max: 80 }), F("label_en", "الاسم بالإنجليزي", "Label in English", "text", { max: 80, dir: "ltr" })];
      var bx = modal(mh(T("صف جديد", "New row")) + '<p class="mut sm">' + h(T("الصف الجديد بيتحفظ ويظهر هنا، بس مفيش جزء في الموقع بيطبّقه لحد ما يتبرمج («محفوظ — مش مطبّق»).", "A new row is saved and shown here, but nothing on the site applies it until it is programmed («Saved — not applied»).")) + "</p>" + formH(f, { type: "bool" }) + '<div class="ft2">' + btn("ok", h(T("إضافة", "Add")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + "</button></div>", { on: { ok: function () { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; c.st.newKeys.push({ k: v.k, type: v.type, label_ar: v.label_ar, label_en: v.label_en || v.label_ar, grp: "features", enforced_by: "none", sort: 900 + c.st.newKeys.length }); closeModal(); paint(); toast(T("اتضاف الصف — اضغط «حفظ»", "Row added — press «Save»")); } } });
    };
    var sync = function (dry, b) {
      b.disabled = true;
      POST("/admin/cc/plans/persona-sync", { dry_run: dry }).then(function (j) {
        b.disabled = false; var it = (j && j.items) || [];
        modal(mh(dry ? T("معاينة تغيير برومبت جنة وباسم", "Preview of the Janna & Bassem prompt change") : T("نتيجة المزامنة", "Sync result")) + (it.length ? it.map(function (x) {
          var why = psWhy(x), ch = (x.changes || []).map(psChg).filter(Boolean), rvw = x.review || [];
          return "<h3>" + h(x.name || x.persona_id) + " — " + h(psSt(x.status)) + "</h3>" + (why ? '<div class="alert">' + h(why) + "</div>" : "")
            + (ch.length ? "<ul>" + ch.map(function (c0) { return "<li>" + h(c0) + "</li>"; }).join("") + "</ul>" : x.found_section && !x.changed ? '<p class="mut">' + h(T("مفيش تغيير.", "No change.")) + "</p>" : "")
            + (rvw.length ? '<div class="alert">' + rvw.map(function (rv) { return h(psRev(rv, (c.st.j || {}).keys)); }).join("<br>") + "</div>" : "")
            + (x.changed ? '<details><summary>' + h(T("النص قبل وبعد", "The text before and after")) + '</summary><div class="split"><div><b>' + h(T("قبل", "Before")) + '</b><pre class="js" dir="auto">' + h(x.before || "") + "</pre></div><div><b>" + h(T("بعد", "After")) + '</b><pre class="js" dir="auto">' + h(x.after || "") + "</pre></div></div></details>" : "");
        }).join("") : '<p class="mut">' + h(T("مفيش شخصيات للمزامنة.", "No personas to sync.")) + "</p>"), { wide: true, onClose: dry ? null : load });
      }, function (e) { b.disabled = false; toast(errText(e), 1); });
    };
    c.on.psd = function (b) { sync(true, b); }; c.on.psr = function (b) { if (sure(T("تحديث قسم الباقات في برومبت جنة وباسم دلوقتي؟", "Update the plans section of Janna's and Bassem's prompts now?"))) sync(false, b); };
    load();
  };

  /* =====================================================================================================================
     approvals ➕ — الموافقات: member products and company requests (edit / claim / create)
     ===================================================================================================================== */
  var CRK = { edit: ["تعديل بيانات الشركة", "Company data edit"], claim: ["«ده ملف شركتي»", "«This is my company»"], create: ["إضافة شركة جديدة", "New company"] };
  var APST = { pending: ["بانتظار المراجعة", "Pending review", "p"], approved: ["اتوافق عليه", "Approved", "ok"], rejected: ["مرفوض", "Rejected", "x"], withdrawn: ["اتسحب", "Withdrawn", "g"] };
  SEC.approvals = function () {
    var c = CUR, F2 = c.st.f = { type: can("approvals.products") ? "product" : "company", state: "pending" };
    var paintHead = function () { head(T("الموافقات", "Approvals"), h(T("المنتجات وطلبات ملفات الشركات اللي بعتها الأعضاء", "Products and company-listing requests sent by members")), sel("ast", [["pending", "بانتظار المراجعة", "Pending review"], ["approved", "اتوافق عليه", "Approved"], ["rejected", "مرفوض", "Rejected"]], F2.state, T("الحالة", "Status")) + (F2.type === "product" && F2.state === "pending" && can("approvals.products") ? btn("bulk", h(T("✓ قبول المحدد", "✓ Approve selected")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh")))); };
    paintHead();
    var tabs = [].concat(can("approvals.products") ? [["product", "منتجات الأعضاء", "Member products"]] : []).concat(can("approvals.company") ? [["company", "طلبات ملفات الشركات", "Company-listing requests"]] : []);
    setCt('<div id="aptab">' + tabsH(tabs, F2.type, "apt") + "</div>" + listShell(""));
    var opt = { path: function () { return "/admin/cc/approvals" + qs({ type: F2.type, state: F2.state }); }, empty: T("مفيش طلبات بانتظار المراجعة.", "Nothing is waiting for review."),
      cols: [["النوع", "Type", function (r) { return h(r.type === "product" ? T("منتج", "Product") : CRK[r.kind] ? L2(CRK[r.kind]) : r.kind); }], ["المنشأة / العضو", "Company / member", function (r) { var m = r.member || {}; return '<b dir="auto">' + h(r.factory_name || m.company || "—") + '</b><br><small dir="ltr">' + h(m.email || "") + "</small>" + (m.plan ? " " + tag(planName(m.plan), "g") : ""); }], ["التفاصيل", "Details", function (r) { return '<span dir="auto">' + h(cut(r.summary || (r.fields && (r.fields.name || r.fields.company)) || "", 140)) + "</span>"; }], ["تاريخ الإرسال", "Sent", function (r) { return fdh(r.submitted_at, true); }], ["الحالة", "Status", function (r) { var s = APST[r.state]; return tag(s ? L2(s) : r.state, s ? s[2] : "g"); }]],
      acts: function (r, i) { return (r.type === "product" && r.state === "pending" ? '<input type="checkbox" data-sel="' + h(r.id) + '" aria-label="' + h(T("اختيار", "Select")) + '" style="width:auto;margin-inline-end:6px"> ' : "") + '<button type="button" class="btn s l" data-a="rv" data-i="' + i + '">' + h(r.state === "pending" ? T("مراجعة", "Review") : T("عرض", "View")) + "</button>"; } };
    var load = function () { serverList(c, opt); };
    c.on.apt = function (b) { F2.type = b.getAttribute("data-v"); c.st.page = 0; $("#aptab").innerHTML = tabsH(tabs, F2.type, "apt"); paintHead(); load(); };
    c.ch.ast = function (t) { F2.state = t.value; c.st.page = 0; paintHead(); load(); };
    c.on.rf = load;
    c.on.bulk = function (b) { var ids = $$("#tb [data-sel]").filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute("data-sel"); }); if (!ids.length) { toast(T("اختار منتجات الأول", "Select products first"), 1); return; } if (ids.length > 50) { toast(T("50 منتج بالكتير في المرة", "At most 50 at a time"), 1); return; } if (!sure(T("قبول ", "Approve ") + ids.length + T(" منتج ونشرهم؟", " products and publish them?"))) return; b.disabled = true; POST("/admin/cc/approvals/products/approve", { ids: ids }).then(function (j) { b.disabled = false; toast(T("اتوافق على ", "Approved ") + nf(j && j.approved || 0) + ((j && j.failed && j.failed.length) ? T(" — فشل ", " — failed ") + j.failed.length : "")); load(); badges(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.rv = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (r) approvalDetail(r, load); };
    load();
  };
  var APF = { name: ["الاسم", "Name"], name_en: ["الاسم بالإنجليزي", "Name in English"], category: ["التصنيف", "Category"], description: ["الوصف", "Description"], description_en: ["الوصف بالإنجليزي", "Description in English"], price: ["السعر", "Price"], sector: ["القطاع", "Sector"], location: ["الموقع", "Location"], type: ["النوع", "Type"], gov: ["المحافظة", "Governorate"], products: ["المنتجات", "Products"], website: ["الموقع الإلكتروني", "Website"], logo: ["اللوجو", "Logo"], video: ["الفيديو", "Video"], social: ["السوشيال", "Social links"], company: ["الشركة", "Company"] };
  function approvalDetail(r, done) {
    var f = r.fields || {}, cur0 = r.current || {}, m = r.member || {};
    var keys = Object.keys(f).filter(function (k) { return k !== "images" && k !== "evidence"; });
    var show = function (v) { return Array.isArray(v) ? v.join("، ") : v && typeof v === "object" ? JSON.stringify(v) : str(v); };
    var imgs = (f.images || []).map(function (x) { return typeof x === "object" ? x : { id: x }; });
    var edits = keys.filter(function (k) { return typeof f[k] === "string" && k !== "logo"; });
    var mailDom = (str(m.email).split("@")[1] || "").toLowerCase(), webDom = host(f.website || cur0.website || "");
    var pend = r.state === "pending", canA = r.type === "product" ? can("approvals.products") : can("approvals.company");
    var bx = modal(mh((r.type === "product" ? T("منتج من العضو", "Product from the member") : CRK[r.kind] ? L2(CRK[r.kind]) : r.kind) + " — " + (r.factory_name || m.company || ""))
      + kvH([[T("العضو", "Member"), m.email, "ltr"], [T("الشركة", "Company"), m.company], [T("الباقة", "Plan"), planName(m.plan)], [T("الملف في الدليل", "Directory listing"), r.factory_name || (r.factory_ref ? "#" + r.factory_ref : "")], [T("تاريخ الإرسال", "Sent"), fd(r.submitted_at, true)], [T("الحالة", "Status"), APST[r.state] ? L2(APST[r.state]) : r.state]])
      + (r.kind === "claim" ? '<div class="info">' + h(T("أدلة الملكية: ", "Ownership evidence: ")) + h(mailDom && webDom && (mailDom === webDom || mailDom.slice(-webDom.length - 1) === "." + webDom) ? T("✓ إيميل العضو على نفس دومين موقع الشركة (", "✓ the member's e-mail is on the company website's domain (") + webDom + ")" : T("إيميل العضو مش على دومين موقع الشركة", "the member's e-mail is not on the company website's domain")) + (f.evidence ? " · " + h(show(f.evidence)) : "") + "</div>" : "")
      + '<div class="tbl-s"><table class="diff"><thead><tr><th>' + h(T("الحقل", "Field")) + "</th><th>" + h(T("المنشور حالياً", "Currently public")) + "</th><th>" + h(T("المطلوب", "Requested")) + "</th></tr></thead><tbody>" + keys.map(function (k) { var a = show(cur0[k]), b2 = show(f[k]); return '<tr class="' + (a !== b2 ? "chg" : "") + '"><td>' + h(APF[k] ? L2(APF[k]) : k) + '</td><td dir="auto">' + h(cut(a, 400) || "—") + '</td><td dir="auto">' + h(cut(b2, 400) || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>"
      + (imgs.length ? "<h3>" + h(T("الصور", "Images")) + '</h3><div class="imgp">' + imgs.map(function (x) { var u = localImg(x.url); return u ? '<img src="' + h(u) + '" alt="">' : '<small class="mut" dir="ltr">' + h(x.id || "") + "</small>"; }).join("") + "</div>" : "")
      + (r.reject_reason ? '<div class="alert">' + h(T("سبب الرفض: ", "Rejection reason: ") + r.reject_reason) + "</div>" : "")
      + (pend && canA ? "<h3>" + h(T("تصحيحات قبل القبول (اختياري)", "Corrections before approving (optional)")) + "</h3>" + formH(edits.map(function (k) { return { n: k, l: APF[k] || [k, k], t: /description/.test(k) ? "ta" : "text", max: /description/.test(k) ? 2000 : 300 }; }), f)
        + '<label class="w">' + h(T("سبب الرفض (مطلوب للرفض، 3–500 حرف)", "Rejection reason (required to reject, 3–500 characters)")) + '<textarea data-rr maxlength="500" dir="auto"></textarea></label>'
        + '<div class="ft2">' + btn("apok", h(T("✓ قبول ونشر", "✓ Approve & publish")), "r") + btn("apno", h(T("✕ رفض", "✕ Reject")), "d") + '<button type="button" class="btn l" data-x>' + h(T("إغلاق", "Close")) + "</button></div>" : "") + '<div class="er" role="alert"></div>', { wide: true, on: {
        apok: function (b) { var v = readForm(bx, edits.map(function (k) { return { n: k, t: "text" }; })), corr = {}; Object.keys(v).forEach(function (k) { if (str(v[k]) !== str(f[k])) corr[k] = v[k]; }); b.disabled = true; POST("/admin/cc/approvals/" + (r.type === "product" ? "product" : "company") + "/" + enc(r.id) + "/approve", Object.keys(corr).length ? { fields: corr } : {}).then(function () { closeModal(); toast(T("اتوافق عليه واتنشر ✓ — العضو اتبلّغ", "Approved and published ✓ — the member was told")); done && done(); badges(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); },
        apno: function (b) { var rr = trim($("[data-rr]", bx).value); if (rr.length < 3) { $(".er", bx).textContent = T("اكتب سبب الرفض (3 حروف على الأقل)", "Write the rejection reason (at least 3 characters)"); $("[data-rr]", bx).focus(); return; } b.disabled = true; POST("/admin/cc/approvals/" + (r.type === "product" ? "product" : "company") + "/" + enc(r.id) + "/reject", { reason: rr }).then(function () { closeModal(); toast(T("اترفض — العضو اتبلّغ بالسبب", "Rejected — the member was told the reason")); done && done(); badges(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); }
      } });
  }

  /* =====================================================================================================================
     invoices ➕ — الفواتير والمدفوعات (GET/POST /api/admin/cc/pay/*)
     ===================================================================================================================== */
  var INVS = { open: ["مفتوحة", "Open", "p"], paid: ["مدفوعة", "Paid", "ok"], void: ["ملغاة", "Void", "g"], refunded: ["مستردّة", "Refunded", "b"] };
  var INVSRC = { signup: ["طلب اشتراك", "Sign-up"], renewal: ["تجديد", "Renewal"], upgrade: ["ترقية", "Upgrade"], admin: ["من الإدارة", "Admin"], member: ["من العضو", "Member"], test: ["تجريبية", "Test"] };
  var PROV = { ngenius: ["N-Genius (Network International)", "N-Genius (Network International)"], paymob: ["Paymob", "Paymob"], paytabs: ["PayTabs", "PayTabs"], manual: ["تحويل بنكي / يدوي", "Bank transfer / manual"] };
  function invChip(s) { var x = INVS[s]; return tag(x ? L2(x) : s, x ? x[2] : "g"); }
  SEC.invoices = function () {
    var c = CUR, F2 = c.st.f = { tab: "inv", status: "", source: "", provider: "", from: "", to: "", q: "" };
    var paintHead = function () {
      head(T("الفواتير والمدفوعات", "Invoices & payments"), "", srch(F2.q) + (F2.tab === "inv" ? sel("ist", [["", "كل الحالات", "All statuses"]].concat(Object.keys(INVS).map(function (k) { return [k, INVS[k][0], INVS[k][1]]; })), F2.status, T("الحالة", "Status")) + sel("isr", [["", "كل المصادر", "All sources"]].concat(Object.keys(INVSRC).map(function (k) { return [k, INVSRC[k][0], INVSRC[k][1]]; })), F2.source, T("المصدر", "Source")) : sel("pst", [["", "كل الحالات", "All statuses"], ["created", "اتعملت", "Created"], ["redirected", "راح لصفحة الدفع", "Redirected"], ["pending", "مستني تأكيد", "Pending"], ["paid", "مدفوعة", "Paid"], ["failed", "فشلت", "Failed"], ["cancelled", "اتلغت", "Cancelled"], ["expired", "انتهت", "Expired"]], F2.status, T("الحالة", "Status")))
        + sel("ipv", [["", "كل البوابات", "All gateways"]].concat(Object.keys(PROV).map(function (k) { return [k, PROV[k][0], PROV[k][1]]; })), F2.provider, T("البوابة", "Gateway")) + (F2.tab === "inv" ? dateIn("ifr", F2.from, T("من تاريخ", "From")) + dateIn("ito", F2.to, T("إلى تاريخ", "To")) : "")
        + (can("pay.invoice") ? btn("new", h(T("🧾 إصدار فاتورة", "🧾 Issue an invoice")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + (isAdm() ? btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) : ""));
    };
    paintHead();
    setCt('<div id="itab">' + tabsH([["inv", "الفواتير", "Invoices"], ["pay", "محاولات الدفع", "Payment attempts"]], F2.tab, "itb") + "</div>" + listShell(""));
    var iopt = { path: function () { return "/admin/cc/pay/invoices" + qs({ status: F2.status, source: F2.source, provider: F2.provider, from: F2.from, to: F2.to, q: F2.q }); }, empty: T("لسه مفيش فواتير.", "No invoices yet."),
      cols: [["رقم الفاتورة", "Invoice no.", function (r) { return '<b dir="ltr">' + h(r.no) + "</b>" + (r.test ? " " + tag(T("تجريبية", "Test"), "g") : ""); }], ["العضو / الشركة", "Member / company", function (r) { return '<span dir="auto">' + h(r.company || "—") + '</span><br><small dir="ltr">' + h(r.email || "") + "</small>"; }], ["الباقة", "Plan", function (r) { return h(r.plan_name || planName(r.plan)); }], ["الصافي", "Net", function (r) { return h(money(r.net_minor, r.currency)); }], ["الضريبة", "VAT", function (r) { return h(money(r.vat_minor, r.currency)); }], ["الإجمالي", "Total", function (r) { return "<b>" + h(money(r.total_minor, r.currency)) + "</b>"; }], ["الحالة", "Status", function (r) { return invChip(r.status); }], ["المصدر", "Source", function (r) { return h(INVSRC[r.source] ? L2(INVSRC[r.source]) : r.source || ""); }], ["تاريخ الإصدار", "Issued", function (r) { return fdh(r.issued_at); }], ["تاريخ الدفع", "Paid", function (r) { return h(r.paid_at ? fd(r.paid_at) : "—"); }], ["البوابة", "Gateway", function (r) { return h(PROV[r.provider] ? L2(PROV[r.provider]) : r.provider || "—"); }]],
      acts: function (r, i) { return '<button type="button" class="btn s l" data-a="iv" data-i="' + i + '">' + h(T("تفاصيل", "Details")) + "</button>"; } };
    var popt = { path: function () { return "/admin/cc/pay/payments" + qs({ status: F2.status, provider: F2.provider }); }, empty: T("لسه مفيش محاولات دفع.", "No payment attempts yet."),
      cols: [["الفاتورة", "Invoice", function (r) { return '<small dir="ltr">' + h(r.invoice_no || r.invoice_id || "") + "</small>"; }], ["البوابة", "Gateway", function (r) { return h(PROV[r.provider] ? L2(PROV[r.provider]) : r.provider || ""); }], ["الوضع", "Mode", function (r) { return h(r.mode === "live" ? T("حقيقي", "Live") : T("اختبار", "Test")); }], ["المبلغ", "Amount", function (r) { return h(money(r.amount_minor, r.currency)); }], ["الحالة", "Status", function (r) { return tag(r.status, r.status === "paid" ? "ok" : r.status === "failed" ? "x" : "p"); }], ["المرجع", "Reference", function (r) { return '<small dir="ltr">' + h(r.provider_ref || "") + "</small>"; }], ["التاريخ", "Date", function (r) { return fdh(r.created_at, true); }], ["خطأ", "Error", function (r) { return '<small dir="ltr">' + h(cut(r.error || "", 100)) + "</small>"; }]] };
    var load = function () { serverList(c, F2.tab === "inv" ? iopt : popt); };
    c.q = function (v) { F2.q = v; c.st.page = 0; load(); };
    c.on.itb = function (b) { F2.tab = b.getAttribute("data-v"); F2.status = ""; c.st.page = 0; $("#itab").innerHTML = tabsH([["inv", "الفواتير", "Invoices"], ["pay", "محاولات الدفع", "Payment attempts"]], F2.tab, "itb"); paintHead(); load(); };
    c.ch.ist = function (t) { F2.status = t.value; c.st.page = 0; load(); }; c.ch.pst = c.ch.ist; c.ch.isr = function (t) { F2.source = t.value; c.st.page = 0; load(); }; c.ch.ipv = function (t) { F2.provider = t.value; c.st.page = 0; load(); }; c.ch.ifr = function (t) { F2.from = t.value; c.st.page = 0; load(); }; c.ch.ito = function (t) { F2.to = t.value; c.st.page = 0; load(); };
    c.on.rf = load; c.on.new = function () { invoiceForm({}, load); };
    c.on.ex = function () { if (F2.tab === "inv") serverCsv("/admin/cc/pay/invoices.csv" + iopt.path().replace(/^[^?]*/, ""), "invoices"); else serverCsv("/admin/cc/pay/payments.csv" + popt.path().replace(/^[^?]*/, ""), "payments"); };
    c.on.iv = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (r) invoiceDetail(r.no, load); };
    load();
  };
  function sellPlans() { return PLANS.filter(function (p) { return p[0]; }); }
  function invoiceForm(pre, done) {
    var f = (pre.member_id ? [] : [F("email", "بريد العضو / الشركة", "Member / company e-mail", "email", { req: 1 })]).concat([F("plan", "الباقة", "Plan", "sel", { req: 1, opts: sellPlans() }), F("notes", "ملاحظات (بتظهر في الفاتورة)", "Notes (shown on the invoice)", "ta", { max: 500, rows: 2 }), F("send", "ابعت الفاتورة على الإيميل", "E-mail the invoice", "chk", { w: 1 })]);
    var bx = modal(mh(T("إصدار فاتورة", "Issue an invoice")) + (pre.email ? '<p dir="ltr">' + h(pre.email) + "</p>" : "") + '<p class="mut sm">' + h(T("المبلغ بيتحسب من سعر الباقة الحالي + ضريبة القيمة المضافة. الفاتورة بتتحفظ برقم ثابت ومش بتتغيّر لو السعر اتغيّر بعدين.", "The amount is the plan's current price + VAT. The invoice keeps a fixed number and does not change if the price changes later.")) + "</p>" + formH(f, { plan: "basic", send: 1 }) + '<div class="ft2">' + btn("ok", h(T("إصدار", "Issue")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { on: {
      ok: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; var body = { plan: v.plan, source: "admin", notes: v.notes || "", send: !!v.send }; if (pre.member_id) body.member_id = pre.member_id; else body.email = v.email;
        POST("/admin/cc/pay/invoices", body).then(function (j) { closeModal(); var iv = (j && j.invoice) || {}; toast(T("اتعملت الفاتورة ", "Invoice issued ") + (iv.no || "") + " ✓"); done && done(); badges(); }, function (e) { b.disabled = false; var on = e.j && (e.j.invoice || e.j.open); $(".er", bx).innerHTML = h(errText(e)) + (on && on.no ? " (" + h(on.no) + ")" : "") + errSmall(e); }); }
    } });
  }
  function invoiceDetail(no, done) {
    modal(mh(T("الفاتورة ", "Invoice ") + no) + loadingH(), { wide: true });
    GET("/admin/cc/pay/invoices/" + enc(no)).then(function (j) {
      var iv = j.invoice || {}, py = j.payments || [], evs = j.events || [], ml = j.mails || [];
      var open = iv.status === "open";
      var bx = modal(mh(T("الفاتورة ", "Invoice ") + iv.no) + kvH([[T("الشركة", "Company"), iv.company], [T("البريد", "E-mail"), iv.email, "ltr"], [T("الباقة", "Plan"), iv.plan_name || planName(iv.plan)], [T("المدة", "Period"), iv.period_days ? nf(iv.period_days) + T(" يوم", " days") : ""], [T("الصافي", "Net"), money(iv.net_minor, iv.currency)], [T("الضريبة", "VAT"), money(iv.vat_minor, iv.currency) + (iv.vat_bp != null ? " (" + iv.vat_bp / 100 + "%)" : "")], [T("الإجمالي", "Total"), money(iv.total_minor, iv.currency)], [T("الحالة", "Status"), INVS[iv.status] ? L2(INVS[iv.status]) : iv.status], [T("المصدر", "Source"), INVSRC[iv.source] ? L2(INVSRC[iv.source]) : iv.source], [T("الإصدار", "Issued"), fd(iv.issued_at, true)], [T("الدفع", "Paid"), iv.paid_at ? fd(iv.paid_at, true) + " · " + (iv.paid_via || "") : ""], [T("البوابة", "Gateway"), PROV[iv.provider] ? L2(PROV[iv.provider]) : iv.provider], [T("مرجع البوابة", "Gateway reference"), iv.provider_ref, "ltr"], [T("مرجع التحويل اليدوي", "Manual reference"), iv.manual_ref, "ltr"], [T("ملاحظات", "Notes"), iv.notes], [T("طلب الاشتراك", "Sign-up request"), iv.inquiry_ref, "ltr"]])
        + '<div class="acts2">' + (open && can("pay.invoice") ? btn("rs", h(T("✉ إعادة إرسال رابط الدفع", "✉ Re-send the payment link")), "l s") : "") + (open && can("pay.mark_paid") ? btn("mp", h(T("💵 تسجيل دفع يدوي", "💵 Record a manual payment")), "r s") : "") + (open && can("pay.invoice") ? btn("vd", h(T("إلغاء الفاتورة", "Void the invoice")), "d s") : "") + "</div>"
        + "<h3>" + h(T("محاولات الدفع", "Payment attempts")) + "</h3>" + (py.length ? '<div class="tbl-s">' + tableH([["البوابة", "Gateway", function (x) { return h(x.provider); }], ["الوضع", "Mode", function (x) { return h(x.mode); }], ["المبلغ", "Amount", function (x) { return h(money(x.amount_minor, x.currency)); }], ["الحالة", "Status", function (x) { return h(x.status); }], ["المرجع", "Reference", function (x) { return '<small dir="ltr">' + h(x.provider_ref || "") + "</small>"; }], ["التاريخ", "Date", function (x) { return fdh(x.created_at, true); }]], py, {}) + "</div>" : '<p class="mut">' + h(T("مفيش.", "None.")) + "</p>")
        + "<h3>" + h(T("إشعارات البوابة", "Gateway events")) + "</h3>" + (evs.length ? '<div class="tbl-s">' + tableH([["النوع", "Kind", function (x) { return h(x.kind); }], ["متحقق", "Verified", function (x) { return x.verified ? "✓" : "—"; }], ["النتيجة", "Result", function (x) { return '<small dir="ltr">' + h(x.result || "") + "</small>"; }], ["التاريخ", "Date", function (x) { return fdh(x.created_at, true); }]], evs, {}) + "</div>" : '<p class="mut">' + h(T("مفيش.", "None.")) + "</p>")
        + "<h3>" + h(T("الإيميلات", "E-mails")) + "</h3>" + (ml.length ? "<ul>" + ml.map(function (x) { return '<li class="sm">' + h(fd(x.at, true) + " · " + (x.template || "") + " · " + (x.status || "")) + "</li>"; }).join("") + "</ul>" : '<p class="mut">' + h(T("مفيش.", "None.")) + "</p>") + '<div class="er" role="alert"></div>', { wide: true, on: {
          rs: function (b) { b.disabled = true; POST("/admin/cc/pay/invoices/" + enc(iv.no) + "/resend").then(function (x) { b.disabled = false; toast(x && x.sent ? T("اتبعت ✓", "Sent ✓") : T("ماتبعتش — الإرسال مش متفعّل", "Not sent — e-mail is not configured"), !(x && x.sent)); }, function (e) { b.disabled = false; toast(errText(e), 1); }); },
          vd: function () { askText(T("إلغاء الفاتورة ", "Void invoice ") + iv.no, T("الفاتورة بتتلغي ومابتتدفعش. اكتب السبب.", "The invoice is voided and can no longer be paid. Write the reason."), 500, function (t) { return POST("/admin/cc/pay/invoices/" + enc(iv.no) + "/void", { reason: t }).then(function () { toast(T("اتلغت الفاتورة", "Invoice voided")); done && done(); invoiceDetail(no, done); }); }, function () { invoiceDetail(no, done); }); },
          mp: function () { typed({ title: T("تسجيل دفع يدوي — ", "Record a manual payment — ") + iv.no, msg: T("بعد التأكيد الباقة بتتفعّل للعضو فوراً وبيوصله إيصال. اتأكد إن المبلغ وصل فعلاً.", "After confirming, the plan is activated at once and the member gets a receipt. Make sure the money has really arrived."), expect: iv.no, ok: T("تسجيل الدفع", "Record the payment"), extra: '<div class="fr" style="margin-top:8px"><label>' + h(T("مرجع التحويل / إنستاباي *", "Transfer / InstaPay reference *")) + '<input data-tf="manual_ref" dir="ltr" maxlength="120"></label><label>' + h(T("تاريخ الدفع", "Payment date")) + '<input type="date" data-tf="paid_on" value="' + h(today()) + '"></label><label class="w">' + h(T("ملاحظة", "Note")) + '<input data-tf="note" maxlength="300" dir="auto"></label></div>' }).then(function (x) { if (!x.ok) return; if (!trim(x.vals.manual_ref)) { x.err(E("required", "")); return; } POST("/admin/cc/pay/invoices/" + enc(iv.no) + "/mark-paid", { manual_ref: trim(x.vals.manual_ref), paid_on: x.vals.paid_on, note: x.vals.note || "", confirm: iv.no }).then(function () { x.done(); toast(T("اتسجّل الدفع واتفعّلت الباقة ✓", "Payment recorded and plan activated ✓")); done && done(); badges(); }, x.err); }); }
        } });
    }, function (e) { modal(mh(T("الفاتورة ", "Invoice ") + no) + errH(e, false), { wide: true }); });
  }

  /* =====================================================================================================================
     payments — بوابة الدفع (the live view, same fields and order; implemented providers only)
     ===================================================================================================================== */
  var SLOTS = { ngenius: ["pay.ngenius.api_key", "pay.ngenius.webhook_value"], paymob: ["pay.paymob.secret_key", "pay.paymob.hmac_secret"], paytabs: ["pay.paytabs.server_key", ""], manual: ["", ""] };
  function secretLab(base, info) { if (!info || !info.set) return base; if (info.readable === false) return base + T(" — المفتاح المحفوظ مش مقروء (اتغيّر CONFIG_SECRET): دخّله تاني", " — the saved key cannot be read (CONFIG_SECRET changed): enter it again"); return base + T(" (محفوظ ····", " (saved ····") + (info.tail || "") + T(" — اتركه فارغاً للإبقاء)", " — leave empty to keep it)"); }
  SEC.payments = function () {
    var c = CUR, OW = can("pay.config");
    head(T("بوابة الدفع", "Payment gateway"), h(T("ربط بوابة الدفع لاشتراكات الباقات", "Connect the payment gateway for plan subscriptions")), (OW ? btn("pysave", h(T("💾 حفظ", "💾 Save")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var load = function () { setCt(loadingH()); GET("/admin/cc/pay/config").then(function (j) { if (!alive(c)) return; c.st.j = j; c.st.prov = j.provider || ""; paint(); }, function (e) { if (alive(c)) setCt(errH(e)); }); };
    var paint = function () {
      var j = c.st.j || {}, fl = j.fields || {}, sc = j.secrets || {}, pv = c.st.prov, sl = SLOTS[pv] || ["", ""], dis = OW ? "" : " disabled", noSec = ST.features.config_secret === false;
      var provs = (j.providers && j.providers.length ? j.providers.filter(function (p) { return p.implemented !== false; }).map(function (p) { return p.key; }) : ["ngenius", "paymob", "paytabs", "manual"]).filter(function (k) { return PROV[k]; });
      var Fi = function (l, id, v, t, ph, extra) { return '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(l) + '</span><input id="py_' + id + '" type="' + (t || "text") + '" value="' + h(t === "password" ? "" : v || "") + '" placeholder="' + h(ph || "") + '" dir="ltr" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + dis + (extra || "") + (t === "password" ? ' autocomplete="new-password"' : "") + "></label>"; };
      var merchLab = pv === "paymob" ? "Integration IDs " + T("(أرقام مفصولة بفاصلة)", "(comma separated)") : pv === "paytabs" ? "Profile ID" : "Merchant / Account ID";
      var keyLab = pv === "ngenius" ? "N-Genius API Key" : pv === "paymob" ? "Paymob Secret Key" : pv === "paytabs" ? "PayTabs Server Key" : "API Key / Secret Key";
      var whLab = pv === "ngenius" ? "Webhook Secret " + T("(قيمة الهيدر X-MIG-Webhook في بوابة N-Genius)", "(the X-MIG-Webhook header value set in the N-Genius portal)") : pv === "paymob" ? "Webhook Secret (Paymob HMAC)" : "Webhook Secret";
      var ready = !!j.ready, miss = j.missing || [], ml = j.missing_labels || {};
      /* review UX-1: the Worker's labels (payments.js MISSING_LABEL), the code only as a fallback */
      var missTxt = miss.map(function (k) { var x = ml[k]; return x ? L2([x.ar || k, x.en || x.ar || k]) : k; }).join("، ");
      var sandbox = !ready && (j.state === "sandbox" || j.sandbox_ready === true), manualOn = !ready && !!j.manual;
      var wh = j.webhooks || {};
      var whList = []; ["paymob", "ngenius", "paytabs"].forEach(function (k) { if (wh[k]) whList.push([PROV[k][0] + " webhook", wh[k]]); }); if (wh.returns) Object.keys(wh.returns).forEach(function (k) { whList.push([(PROV[k] ? PROV[k][0] : k) + " return", wh.returns[k]]); });
      var t = '<style>#ct .pyf input,#ct .pyf select,#ct .pyf textarea{width:100%!important;max-width:100%!important;box-sizing:border-box}#ct .pyf input[type=checkbox]{width:auto!important}</style>'
        + '<div class="note">' + h(T("مفاتيح الـ API بتتحفظ على السيرفر متشفّرة ومش بتظهر تاني بعد الحفظ. جرّب في وضع الاختبار (Sandbox) الأول، والدفع الحقيقي بيشتغل بعد ما البوابة توافق على حسابك وتديك مفاتيح الـ Live.", "API keys are stored encrypted on the server and never shown again after saving. Try test (Sandbox) mode first; real payments start once the gateway approves your account and gives you the Live keys.")) + "</div>"
        + (ready ? '<div class="okc">✓ ' + h(T("جاهز للدفع — العملاء يقدروا يدفعوا أونلاين دلوقتي", "Ready — customers can pay online now")) + "</div>"
          : sandbox ? '<div class="okc">✓ ' + h(T("إعداد الاختبار (Sandbox) كامل: اعمل «🧪 فاتورة تجريبية» تحت وادفعها بكارت الاختبار بتاع البوابة. لما التجربة تنجح، حوّل «الوضع» لـ «حقيقي (Live)» بمفاتيح الـ Live واحفظ.", "Sandbox setup complete: issue a «🧪 Test invoice» below and pay it with the gateway's test card. Once that works, switch «Mode» to «Live» with the Live keys and save.")) + "</div>"
            + (missTxt ? '<p class="mut sm">' + h(T("فاضل عشان الدفع الحقيقي: ", "Left before real payments: ") + missTxt) + "</p>" : "")
          : '<div class="alert">' + h(T("بوابة الدفع لسه بتتجهّز", "The payment gateway is not ready yet")) + (missTxt ? ' — ' + h(T("ناقص: ", "missing: ") + missTxt) : "") + "</div>")
        + (manualOn ? '<div class="note">' + h(T("✓ التحويل اليدوي شغّال: العملاء بيشوفوا تعليمات التحويل في صفحة الدفع، وانت بتسجّل الدفع من «الفواتير».", "✓ Manual transfer is on: customers see the transfer instructions on the payment page, and you record the payment under «Invoices».")) + "</div>" : "")
        + (noSec ? '<div class="note">' + h(L2(ERRS.config_secret_missing)) + "</div>" : "")
        + '<div class="cd"><div class="in pyf" style="max-width:560px">'
        + '<label style="display:block;margin:6px 0"><input type="checkbox" id="py_enabled"' + (j.enabled ? " checked" : "") + dis + "> " + h(T("تفعيل الدفع الإلكتروني", "Enable online payment")) + "</label>"
        + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("البوابة", "Gateway")) + '</span><select id="py_provider" data-c="pyprov" style="padding:9px;border-radius:8px;border:1px solid #cfd8d3"' + dis + '><option value=""' + (!pv ? " selected" : "") + ">—</option>" + provs.map(function (k) { return '<option value="' + k + '"' + (pv === k ? " selected" : "") + ">" + h(L2(PROV[k])) + "</option>"; }).join("") + "</select></label>"
        + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("الوضع", "Mode")) + '</span><select id="py_mode" style="padding:9px;border-radius:8px;border:1px solid #cfd8d3"' + dis + '><option value="test"' + (j.mode !== "live" ? " selected" : "") + ">" + h(T("اختبار (Sandbox)", "Test (Sandbox)")) + '</option><option value="live"' + (j.mode === "live" ? " selected" : "") + ">" + h(T("حقيقي (Live)", "Live")) + "</option></select></label>"
        + Fi(T("العملة", "Currency"), "currency", j.currency || "EGP", "text", "EGP", " readonly")
        + (pv === "paymob" || pv === "paytabs" ? Fi(merchLab, "merchant_id", pv === "paymob" ? fl.integration_ids || "" : fl.merchant_id || "") : "")
        + (pv === "ngenius" ? Fi("Outlet / Reference ID", "outlet_id", fl.outlet_id) : "")
        + (pv && pv !== "manual" ? Fi(secretLab(keyLab, sc[sl[0]]), "api_key", "", "password", "", noSec ? " disabled" : "") : "")
        + (pv === "paymob" ? Fi("Paymob Public Key", "public_key", fl.public_key, "text", "egy_pk_test_… / egy_pk_live_…") : "")
        + (pv === "ngenius" || pv === "paymob" ? Fi(secretLab(whLab, sc[sl[1]]), "webhook_secret", "", "password", "", noSec ? " disabled" : "") : pv === "paytabs" ? '<p class="mut sm">Webhook Secret: ' + h(T("مش مستخدم في PayTabs — مفتاح السيرفر هو اللي بيوقّع الإشعارات.", "Not used by PayTabs — the server key signs the notifications.")) + "</p>" : "")
        + Fi(T("رابط النجاح", "Success URL"), "success_url", fl.success_url, "text", "https://madeinegyptgate.com/dashboard.html#plan") + Fi(T("رابط الفشل", "Failure URL"), "fail_url", fl.fail_url, "text", "https://madeinegyptgate.com/register.html#plans")
        + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("ملاحظات", "Notes")) + '</span><textarea id="py_notes" rows="3" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px" dir="auto"' + dis + ">" + h(fl.notes || "") + "</textarea></label>"
        + '<details style="margin-top:12px"' + (miss.indexOf("manual_text") >= 0 ? " open" : "") + "><summary><b>" + h(T("إعدادات إضافية", "More settings")) + "</b></summary>"
        + (pv === "ngenius" ? '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">N-Genius API host</span><input id="py_host" list="ngh" value="' + h(fl.host || "") + '" dir="ltr" placeholder="api-gateway.sandbox.ngenius-payments.com" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + dis + '><datalist id="ngh"><option value="api-gateway.sandbox.ngenius-payments.com"><option value="api-gateway.ngenius-payments.com"></datalist><span class="hint">' + h(T("الـ host الإقليمي اللي Network International بتديهولك وقت التعاقد.", "The regional host Network International gives you at onboarding.")) + "</span></label>" : "")
        + (pv === "paytabs" ? Fi("PayTabs region host", "host", fl.host || "secure-egypt.paytabs.com") : "")
        + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("تعليمات التحويل اليدوي (عربي): البنك، اسم الحساب، IBAN، إنستاباي", "Manual transfer instructions (Arabic): bank, account name, IBAN, InstaPay")) + '</span><textarea id="py_manual_ar" rows="3" dir="auto" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + dis + ">" + h(fl.manual_ar || "") + "</textarea></label>"
        + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("تعليمات التحويل اليدوي (إنجليزي)", "Manual transfer instructions (English)")) + '</span><textarea id="py_manual_en" rows="3" dir="ltr" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + dis + ">" + h(fl.manual_en || "") + "</textarea></label>"
        + '<label style="display:block;margin:6px 0"><input type="checkbox" id="py_manual_fallback"' + (+fl.manual_fallback ? " checked" : "") + dis + "> " + h(T("اعرض التحويل اليدوي كبديل للدفع الإلكتروني", "Offer manual transfer as an alternative to online payment")) + "</label></details>"
        + "</div></div>"
        + (whList.length ? cardH(T("روابط الـ Webhook (انسخها في لوحة البوابة)", "Webhook URLs (paste them at the gateway)"), whList.map(function (x) { return '<div class="row"><span>' + h(x[0]) + '</span><code dir="ltr" style="overflow-wrap:anywhere">' + h(x[1]) + "</code></div>"; }).join("")) : "")
        + (OW ? cardH(T("فاتورة تجريبية", "Test invoice"), '<p class="sm">' + h(T("فاتورة بإيميلك بتتدفع في وضع الاختبار (Sandbox) بس، ومش بتفعّل أي باقة حقيقية.", "An invoice to your own e-mail that can be paid in test (Sandbox) mode only and never activates a real plan.")) + '</p><div class="acts2"><select id="py_tplan" aria-label="' + h(T("الباقة", "Plan")) + '">' + planOpts("basic") + "</select>" + btn("tinv", h(T("🧪 فاتورة تجريبية", "🧪 Test invoice")), "l") + '</div><div id="py_tres" class="sm"></div>') : "");
      setCt(t);
    };
    var g = function (id) { var e = $("#py_" + id); return e ? (e.type === "checkbox" ? (e.checked ? 1 : 0) : e.value) : undefined; };
    c.ch.pyprov = function (t) { c.st.prov = t.value; var keep = {}; ["enabled", "mode", "success_url", "fail_url", "notes", "manual_ar", "manual_en", "manual_fallback"].forEach(function (k) { keep[k] = g(k); }); paint(); Object.keys(keep).forEach(function (k) { var e = $("#py_" + k); if (!e || keep[k] === undefined) return; if (e.type === "checkbox") e.checked = !!keep[k]; else e.value = keep[k]; }); };
    c.on.rf = load;
    c.on.pysave = function (b) {
      var pv = g("provider") || "", body = { enabled: g("enabled") ? 1 : 0, provider: pv, mode: g("mode"), currency: "EGP", merchant_id: pv === "paytabs" ? trim(g("merchant_id") || "") : "", outlet_id: trim(g("outlet_id") || ""), api_key: g("api_key") || "", webhook_secret: g("webhook_secret") || "", success_url: trim(g("success_url") || ""), fail_url: trim(g("fail_url") || ""), notes: g("notes") || "", integration_ids: pv === "paymob" ? trim(g("merchant_id") || "") : "", public_key: trim(g("public_key") || ""), host: trim(g("host") || ""), manual_fallback: g("manual_fallback") ? 1 : 0, manual_ar: g("manual_ar") || "", manual_en: g("manual_en") || "" };
      var bad = [];
      ["success_url", "fail_url"].forEach(function (k) { if (body[k] && !/^https:\/\/[^\s"'<>]+$/i.test(body[k])) bad.push(k); });
      if (pv === "paymob" && body.integration_ids && !/^\d+(\s*,\s*\d+)*$/.test(body.integration_ids)) bad.push("Integration IDs");
      if (bad.length) { toast(T("قيم غير مقبولة: ", "Values not accepted: ") + bad.join(", "), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/pay/config", body).then(function (r) { b.disabled = false; toast(T("تم الحفظ ✓", "Saved ✓") + (r && r.ready ? T(" — جاهز للدفع", " — ready to take payments") : "")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); });
    };
    c.on.tinv = function (b) { b.disabled = true; POST("/admin/cc/pay/test-invoice", { plan: $("#py_tplan").value }).then(function (j) { b.disabled = false; var iv = (j && j.invoice) || {}, link = iv.pay_url || (iv.pay_token ? "pay.html#inv=" + iv.pay_token : ""); $("#py_tres").innerHTML = h(T("اتعملت الفاتورة التجريبية ", "Test invoice issued ") + (iv.no || "")) + (link && safeUrl(link) ? ' — <a href="' + h(safeUrl(link)) + '" target="_blank" rel="noopener">' + h(T("افتح صفحة الدفع", "Open the payment page")) + "</a>" : ""); }, function (e) { b.disabled = false; $("#py_tres").innerHTML = '<span class="bad">' + h(errText(e)) + "</span>" + errSmall(e); }); };
    load();
  };

  /* =====================================================================================================================
     keys ➕ — «مفاتيح الخدمات» (owner only, perm keys.manage; owner decision 2026-11-18): the respond.io token + WhatsApp channel, the Anam
     key (write-only: sealed with CONFIG_SECRET on the server, never shown again), one read-only test call per key, the payment slots
     read-only (managed in «بوابة الدفع»), and the switch «تشغيل إرسال واتساب الحقيقي» — OFF until the token test passed, ONE test
     message reached the platform's own number and the owner confirmed it. API: GET/PUT/DELETE /api/admin/cc/keys[/:slot],
     POST /keys/:slot/test, POST /keys/wa-test {mode}, POST /keys/wa-live {on, confirm_delivered} (worker/src/acc-keys.js),
     POST /keys/websearch/connect «🔗 وصّل البحث بجنة وباسم» (worker/src/acc-wsconnect.js: the four web tools on Janna AR / EN and Bassem).
     ===================================================================================================================== */
  SEC.keys = function () {
    var c = CUR;
    head(T("مفاتيح الخدمات", "Service keys"), h(T("توكن الواتساب ومفتاح الفيديو ومفتاح بحث الإنترنت — بيتحفظوا مشفّرين على السيرفر ومش بيظهروا تاني بعد الحفظ", "The WhatsApp token, the video key and the web-search key — stored encrypted on the server and never shown again after saving")), btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    c.st.msg = {};
    var REASON = { no_token: ["مفيش توكن respond.io لسه", "No respond.io token yet"], env_dry_run: ["المتغيّر WA_DRY_RUN = \"1\" على الـ Worker بيقفل كل الإرسال (لازم يتغيّر لـ \"0\" من wrangler.toml)", "WA_DRY_RUN = \"1\" on the Worker stops all sending (it must be \"0\" in wrangler.toml)"], switch_off: ["مفتاح التشغيل اللي تحت مقفول", "The switch below is off"],
      feature_off: ["«إرسال واتساب» متوقف من «🛠️ المطوّر» ← «المزايا» (إيقاف الطوارئ) — مفيش ولا رسالة بتطلع، ولا حتى رسالة التجربة", "WhatsApp sending is switched off in «🛠️ Developer» → «Features» (the emergency stop) — no message leaves, not even the test message"] };
    var SRC = { env: ["سر على الـ Worker", "a Worker secret"], panel: ["من اللوحة هنا", "from this page"], none: ["مفيش", "none"], "default": ["القيمة الافتراضية", "the default"] };
    var CSRC = { env: ["المتغيّر RESPONDIO_CHANNEL_ID على الـ Worker", "the RESPONDIO_CHANNEL_ID Worker variable"], panel: ["من اللوحة هنا", "from this page"], "default": ["القيمة الافتراضية 580384", "the default 580384"] };
    var load = function () {
      setCt(loadingH());
      GET("/admin/cc/keys").then(function (j) { if (!alive(c)) return; c.st.j = j || {}; paint(); }, function (e) { if (alive(c)) setCt(errH(e)); });
    };
    var whoWhen = function (at, by) { return at ? T("آخر تحديث ", "last updated ") + fd(at, true) + (by ? T(" بواسطة ", " by ") + by : "") : ""; };
    var testLine = function (lt) {
      if (!lt || !lt.at) return '<p class="mut sm">' + h(T("لسه مااتعملّوش اختبار.", "Not tested yet.")) + "</p>";
      return '<p class="sm ' + (lt.ok ? "" : "bad") + '">' + h((lt.ok ? "✓ " + T("آخر اختبار نجح", "The last test passed") : "✗ " + T("آخر اختبار فشل", "The last test failed")) + " — " + fd(lt.at, true) + (lt.status ? " (" + lt.status + ")" : "")) + (lt.detail ? '<br><span class="mut" dir="auto">' + h(lt.detail) + "</span>" : "") + "</p>";
    };
    var msgH = function (k) { var m = c.st.msg[k]; return m ? '<div class="' + (m.ok ? "okc" : "alert") + '" role="status" dir="auto">' + h(m.t) + (m.sm ? errSmall(m.sm) : "") + "</div>" : ""; };
    var secretCard = function (slot, s, noSec, o) {
      o = o || {};
      s = s || {}; var id = slot.replace(/\W/g, "_");
      var st = s.set ? (s.readable ? '<span class="tag ok">' + h(o.ok || T("محفوظ ✓", "Saved ✓")) + "</span> " + (s.tail ? '<small class="mut" dir="ltr">••••' + h(s.tail) + "</small> " : "") + '<small class="mut">' + h(whoWhen(s.set_at, s.set_by)) + "</small>"
        : '<span class="tag x">' + h(T("محفوظ بس مش مقروء", "Saved but unreadable")) + '</span> <small class="bad">' + h(T("السر CONFIG_SECRET اتغيّر — دخّل المفتاح تاني.", "CONFIG_SECRET changed — enter the key again.")) + "</small>")
        : '<span class="tag g">' + h(T("مش متضاف", "Not added")) + "</span>";
      var envNote = s.env ? '<div class="note">' + h(T("فيه سر " + (s.env_name || "") + " على الـ Worker، وهو اللي شغّال دلوقتي (بيكسب على قيمة اللوحة). امسحه من Cloudflare لو عايز قيمة اللوحة هي اللي تشتغل.", "A " + (s.env_name || "") + " Worker secret exists and is the one in use (it wins over this page). Remove it in Cloudflare to use the value saved here.")) + "</div>" : "";
      var eff = '<p class="sm">' + h(T("المستخدم دلوقتي: ", "In use now: ")) + "<b>" + h(L2(SRC[s.effective] || SRC.none)) + "</b></p>";
      return cardH(L2([s.label_ar || slot, s.label_en || slot]), '<p style="margin:0 0 8px">' + st + "</p>" + envNote + eff
        + '<label class="w" style="display:block;margin:8px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(s.set ? T("استبدال المفتاح (الصق المفتاح الجديد)", "Replace the key (paste the new key)") : T("الصق المفتاح هنا", "Paste the key here")) + '</span><input id="k_' + id + '" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" dir="ltr" style="width:100%;max-width:520px;padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + (noSec ? " disabled" : "") + "></label>"
        + '<div class="acts2">' + btn("ksave", h(T("💾 حفظ", "💾 Save")), "r", ' data-slot="' + h(slot) + '"' + (noSec ? " disabled" : "")) + (s.set ? btn("kdel", h(T("🗑 مسح المفتاح", "🗑 Delete the key")), "l", ' data-slot="' + h(slot) + '"') : "") + (s.effective && s.effective !== "none" && s.testable !== false ? btn("ktest", h(T("🧪 اختبار", "🧪 Test")), "l", ' data-slot="' + h(slot) + '"') : "") + "</div>"
        + testLine(s.last_test) + msgH(slot) + (o.extra || ""));
    };
    var chanCard = function (s) {
      s = s || {};
      return cardH(L2([s.label_ar || "رقم قناة الواتساب على respond.io", s.label_en || "respond.io WhatsApp channel id"]),
        '<p class="sm">' + h(T("المستخدم دلوقتي: ", "In use now: ")) + '<b dir="ltr">' + h(s.effective || "—") + "</b> <small class=\"mut\">(" + h(L2(CSRC[s.source] || CSRC["default"])) + ")</small></p>"
        + '<label style="display:block;margin:8px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("رقم القناة (أرقام بس)", "Channel id (digits only)")) + '</span><input id="k_chan" type="text" inputmode="numeric" dir="ltr" maxlength="12" value="' + h(s.value || s.prefill || "") + '" style="width:200px;padding:9px;border:1px solid #cfd8d3;border-radius:8px"></label>'
        + '<div class="acts2">' + btn("csave", h(T("💾 حفظ", "💾 Save")), "r") + (s.value ? btn("cdel", h(T("↺ رجوع للقيمة الافتراضية", "↺ Back to the default")), "l") : "") + "</div>"
        + '<p class="mut sm">' + h(T("القناة بتتأكد مع اختبار توكن respond.io. تغيير التوكن أو القناة بيقفل الإرسال الحقيقي لحد ما يتجرّب تاني.", "The channel is checked by the respond.io token test. Changing the token or the channel switches real sending off until it is tested again.")) + "</p>" + msgH("respondio.channel"));
    };
    var waCard = function (w) {
      w = w || {}; var sp = w.steps || {}, live = !!w.live;
      var step = function (ok, txt) { return "<li" + (ok ? ' style="color:#166534"' : "") + ">" + (ok ? "✓ " : "○ ") + h(txt) + "</li>"; };
      /* review UX-3: under a disabled button, the step that is still missing (from wa.steps) */
      var whyOff = function (forTest) {
        if (w.dry_run_env) return T("مقفول: المتغيّر WA_DRY_RUN = \"1\" على الـ Worker.", "Disabled: WA_DRY_RUN = \"1\" on the Worker.");
        if (forTest && w.feature_off) return T("مقفول: «إرسال واتساب» متوقف من «🛠️ المطوّر» ← «المزايا» — شغّله هناك الأول.", "Disabled: WhatsApp sending is switched off in «🛠️ Developer» → «Features» — switch it on there first.");
        if (!sp.token) return T("مقفول لحد ما تضيف توكن respond.io (الخطوة 1).", "Disabled until you add the respond.io token (step 1).");
        if (!sp.token_test) return T("مقفول لحد ما تدوس «🧪 اختبار» للتوكن وينجح (الخطوة 2).", "Disabled until the token's «🧪 Test» passes (step 2).");
        if (!forTest && !sp.test_message) return T("مقفول لحد ما تبعت رسالة التجربة لرقم المنصة (الخطوة 3).", "Disabled until you send the test message to the platform's number (step 3).");
        return forTest ? T("مقفول دلوقتي — حدّث الصفحة.", "Disabled right now — refresh the page.") : T("علّم «✓ رسالة التجربة وصلت» الأول.", "Tick «✓ The test message arrived» first.");
      };
      var stateH = live ? '<div class="okc">✓ ' + h(T("الإرسال الحقيقي شغّال — الرسايل بتطلع للمصانع والمشترين", "Real sending is ON — messages go out to factories and buyers")) + (w.live_at ? ' <small dir="auto">(' + h(whoWhen(w.live_at, w.live_by)) + ")</small>" : "") + "</div>"
        : '<div class="alert">' + h(T("وضع التجربة (Dry run) — مفيش رسايل واتساب حقيقية بتطلع", "Dry run — no real WhatsApp message goes out")) + (w.reason && REASON[w.reason] ? '<br><small>' + h(L2(REASON[w.reason])) + "</small>" : "")
          + (w.reason === "feature_off" || w.feature_off ? ' <a href="#dev">' + h(T("افتح «🛠️ المطوّر» ←", "Open «🛠️ Developer» →")) + "</a>" : "") + "</div>";
      var sentNote = sp.test_message ? '<p class="sm">' + h(T("رسالة التجربة اتبعتت ", "The test message was sent ") + fd(w.test_sent_at, true) + T(" على رقم المنصة ", " to the platform's number ") + (w.own_display || "")) + "</p>" : "";
      return cardH(T("تشغيل إرسال واتساب الحقيقي", "Turn on real WhatsApp sending"), stateH
        + '<ol class="sm" style="line-height:2;margin:8px 0">' + step(sp.token, T("توكن respond.io متضاف", "The respond.io token is added")) + step(sp.token_test, T("اختبار التوكن نجح والقناة موجودة", "The token test passed and the channel exists")) + step(sp.test_message, T("رسالة تجربة اتبعتت لرقم المنصة ", "A test message was sent to the platform's number ") + (w.own_display || "01279188996")) + step(sp["switch"], T("تأكيد إنها وصلت وتشغيل الإرسال", "Confirm it arrived and switch sending on")) + "</ol>"
        + (w.dry_run_env ? '<div class="note">' + h(L2(REASON.env_dry_run)) + "</div>" : "")
        + '<div class="acts2"><select id="k_wmode" aria-label="' + h(T("نوع رسالة التجربة", "Test message type")) + '"><option value="text">' + h(T("رسالة نصية", "Text message")) + '</option><option value="template">' + h(T("قالب واتساب (بعد موافقة Meta)", "WhatsApp template (after Meta approval)")) + "</option></select>"
        + btn("wtest", h(T("📤 ابعت رسالة تجربة لرقم المنصة", "📤 Send a test message to the platform's number")), "l", w.can_send_test ? "" : " disabled") + "</div>"
        + (w.can_send_test ? "" : '<small class="why-off">' + h(whyOff(true)) + "</small>") + sentNote
        + (live || sp["switch"] ? (live ? "" : '<p class="sm">' + h(T("مفتاح «تشغيل إرسال واتساب الحقيقي» نفسه شغّال — الإرسال واقف بس للسبب اللي فوق.", "The «real WhatsApp sending» switch itself is on — sending is held only by the reason above.")) + "</p>")
          + '<div class="acts2" style="margin-top:10px">' + btn("woff", h(T("⏹ إيقاف الإرسال الحقيقي", "⏹ Switch real sending off")), "d") + "</div>"
          : '<label class="chk" style="margin:10px 0"><input type="checkbox" id="k_wok"' + (w.can_go_live ? "" : " disabled") + "> " + h(T("✓ رسالة التجربة وصلت على موبايل رقم المنصة", "✓ The test message arrived on the platform's phone")) + "</label>"
            + '<div class="acts2">' + btn("won", h(T("▶ تشغيل إرسال واتساب الحقيقي", "▶ Turn on real WhatsApp sending")), "r", w.can_go_live ? "" : " disabled") + "</div>"
            + (w.can_go_live ? "" : '<small class="why-off">' + h(whyOff(false)) + "</small>"))
        + '<p class="mut sm">' + h(T("الرسالة النصية بتوصل بس لو الرقم ده بعت رسالة لواتساب المنصة خلال آخر 24 ساعة؛ القوالب محتاجة موافقة Meta.", "A free-text message is delivered only if this number messaged the platform's WhatsApp in the last 24 hours; templates need Meta's approval.")) + "</p>" + msgH("wa"));
    };
    var payCard = function (p) {
      if (!p) return "";
      var rows = Object.keys(p.slots || {}).map(function (k) { var s = p.slots[k] || {}; return '<div class="row"><span dir="ltr">' + h(k) + "</span><span>" + (s.set ? (s.readable ? tag(T("محفوظ ✓", "Saved ✓"), "ok") + (s.tail ? ' <small class="mut" dir="ltr">••••' + h(s.tail) + "</small>" : "") : tag(T("مش مقروء — دخّله تاني", "Unreadable — enter it again"), "x")) : tag(T("مش متضاف", "Not added"), "g")) + "</span></div>"; }).join("");
      var g = p.gateway || null;
      return cardH(T("مفاتيح بوابة الدفع (للعرض بس)", "Payment-gateway keys (view only)"), '<p class="mut sm">' + h(T("بتتحفظ وتتغيّر من «بوابة الدفع» بس — مش هنا.", "They are saved and changed in «Payment gateway» only — not here.")) + "</p>"
        + (g ? '<p class="sm">' + (g.ready ? tag(T("بوابة الدفع جاهزة", "Gateway ready"), "ok") : tag(T("بوابة الدفع لسه مش جاهزة", "Gateway not ready yet"), "p")) + (g.provider ? ' <small dir="ltr">' + h(g.provider + (g.mode ? " · " + g.mode : "")) + "</small>" : "") + "</p>" : "")
        + rows + '<div class="acts2" style="margin-top:10px"><a class="btn l" href="#payments">' + h(T("افتح «بوابة الدفع» ←", "Open «Payment gateway» →")) + "</a></div>");
    };
    /* «بحث الإنترنت (جنة وباسم)» — the web search and the opportunity hunt of both personas (worker/src/websearch.js, web-hunt.js:
       POST /api/advisor/web|hunt for Bassem, /api/janna/web|hunt for Janna): the provider, the sealed key + its «اختبار» (ONE real search),
       the daily cap (0 = off), Janna's share of it, «سر أدوات باسم» and «سر أدوات جنة» (each the X-MIG-Tool header value of its own tools,
       review S17). Never a value back. */
    var WSN = { tavily: "Tavily", serper: "Serper", brave: "Brave" };
    var WSR = { ready: ["شغّال ✓", "On ✓"],
      no_tool_secret: ["لسه مفيش «سر أدوات باسم» (أو سر TOOL_SECRET على الـ Worker)", "No «Bassem tool secret» yet (or a TOOL_SECRET Worker secret)"],
      tool_secret_unreadable: ["«سر أدوات باسم» محفوظ بس مش مقروء — دخّله تاني", "The «Bassem tool secret» is saved but unreadable — enter it again"],
      no_key: ["لسه مفيش مفتاح بحث", "No search key yet"], key_unreadable: ["مفتاح البحث محفوظ بس مش مقروء — دخّله تاني", "The search key is saved but unreadable — enter it again"],
      no_provider: ["اختار مزود الخدمة", "Choose the provider"], cap_zero: ["الحد اليومي = 0 (البحث مقفول)", "Daily cap = 0 (search is off)"] };
    /* Janna's own reasons (her secret is made by the connect press; her share 0 = her search off) */
    var WSRJ = { no_tool_secret: ["لسه مفيش «سر أدوات جنة» — بيتعمل لوحده لما تدوس «🔗 وصّل البحث بجنة وباسم»", "No «Janna tool secret» yet — it is made by «🔗 Connect web search to Janna and Bassem»"],
      tool_secret_unreadable: ["«سر أدوات جنة» محفوظ بس مش مقروء — دخّله تاني أو دوس «🔗 وصّل البحث بجنة وباسم»", "The «Janna tool secret» is saved but unreadable — enter it again or press «🔗 Connect web search to Janna and Bassem»"],
      cap_janna_zero: ["نصيب جنة من الحد اليومي = 0 (بحثها مقفول)", "Janna's share of the daily cap = 0 (her search is off)"] };
    var capField = function (id, cp, def, label) {
      return '<label style="display:block;margin:8px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(label) + '</span><input id="' + id + '" type="text" inputmode="numeric" dir="ltr" maxlength="5" value="' + h(cp.value || "") + '" placeholder="' + h(String(def)) + '" style="width:140px;padding:9px;border:1px solid #cfd8d3;border-radius:8px"></label>';
    };
    var wsCard = function (w, noSec) {
      if (!w) return "";
      var pv = w.provider || {}, cp = w.cap || {}, cj = w.cap_janna || {}, opts = pv.options || ["tavily", "serper", "brave"], cur = pv.value || "";
      var sel = '<select id="k_wsprov" aria-label="' + h(T("مزود الخدمة", "Provider")) + '"><option value="">' + h(T("— اختار —", "— choose —")) + "</option>"
        + opts.map(function (o) { return '<option value="' + h(o) + '"' + (o === cur ? " selected" : "") + ">" + h(WSN[o] || o) + "</option>"; }).join("") + "</select>";
      var stB = w.ready ? '<div class="okc">' + h(T("باسم: ", "Bassem: ") + L2(WSR.ready)) + "</div>" : '<div class="alert">' + h(T("باسم: البحث على الإنترنت مقفول — ", "Bassem: web search is off — ") + L2(WSR[w.reason] || [w.reason || "", w.reason || ""])) + "</div>";
      var jr = w.janna_reason || (w.janna_ready ? "ready" : "");
      var stJ = w.janna_ready ? '<div class="okc">' + h(T("جنة: ", "Janna: ") + L2(WSR.ready)) + "</div>" : jr ? '<div class="alert">' + h(T("جنة: البحث على الإنترنت مقفول — ", "Janna: web search is off — ") + L2(WSRJ[jr] || WSR[jr] || [jr, jr])) + "</div>" : "";
      var defJ = cj["default"] != null ? cj["default"] : Math.floor((cp.effective || 300) * 0.4);
      return cardH(T("بحث الإنترنت (جنة وباسم)", "Web search (Janna and Bassem)"), stB + stJ
        + '<p class="mut sm">' + h(T("جنة (لكل الزوار) وباسم (لأعضاء الباقات) بيدوّروا في المنصة الأول، ولما بياناتها مش كفاية بيدوّروا على الإنترنت: بحث عادي، أو «صيد فرص» للمصنع اللي بيكلّمهم (مناقصات وطلبات أسعار وعملاء محتملين ومشاريع جديدة في السوق اللي يختاره). وبيقولوا المعلومة نفسها وخلاص: عمرهم ما يقولوا اسم موقع ولا لينك ولا مصدر ولا إنها من الإنترنت، والمصدر بيفضل محفوظ للفريق بس. كل استعلام بيتبعت للمزود بيتحسب واحد من الحد اليومي: البحث العادي استعلام واحد، و«صيد الفرص» من 3 لـ 6 استعلامات مع بعض؛ نفس الاستعلام خلال ساعة مش بيتحسب تاني. اللي بيلاقوه من فرص بيروح لمكتب البيانات «🌐 فرص من الإنترنت» علشان الفريق يراجعه.", "Janna (for every visitor) and Bassem (for plan members) search the platform first and, when its data is not enough, the web: a plain search, or an «opportunity hunt» for the factory they are talking to (tenders, RFQs, potential buyers and new projects in the market it picks). They say the information itself: never a site, a link, a source or that it comes from the web; the source stays with the team only. Every query sent to the provider counts one against the daily cap: a plain search is one query, a hunt 3 to 6 queries at once; the same query within an hour is not counted again. The opportunities they find go to the data desk «🌐 Web leads» for the team to review.")) + "</p>"
        + '<label style="display:block;margin:8px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("مزود الخدمة: Tavily / Serper / Brave", "Provider: Tavily / Serper / Brave")) + "</span>" + sel + "</label>"
        + (pv.env_value ? '<div class="note">' + h(T("فيه متغيّر WEBSEARCH_PROVIDER على الـ Worker.", "A WEBSEARCH_PROVIDER Worker variable exists.")) + "</div>" : "")
        + '<p class="sm">' + h(T("المستخدم دلوقتي: ", "In use now: ")) + "<b>" + h(WSN[pv.effective] || T("مفيش", "none")) + "</b></p>"
        + '<div class="acts2">' + btn("wsprov", h(T("💾 حفظ المزود", "💾 Save the provider")), "r") + "</div>"
        + capField("k_wscap", cp, cp["default"] || 300, T("الحد اليومي لاستعلامات البحث (0 = البحث مقفول)", "Daily cap of search queries (0 = search off)"))
        + '<div class="acts2">' + btn("wscap", h(T("💾 حفظ الحد", "💾 Save the cap")), "r") + (cp.value ? btn("wscapdel", h(T("↺ الافتراضي", "↺ Default") + " (" + (cp["default"] || 300) + ")"), "l") : "") + "</div>"
        + capField("k_wscapj", cj, defJ, T("نصيب جنة من الحد اليومي (0 = بحث جنة مقفول)", "Janna's share of the daily cap (0 = her search off)"))
        + '<p class="mut sm">' + h(T("جنة بتكلّم أي زائر، فليها نصيب لوحدها من نفس الحد (الافتراضي " + defJ + " = 40 %)، وماتقدرش تعدّيه ولا تعدّي الحد نفسه — والباقي لباسم. كمان جنة ليها حد في الساعة وفي الدقيقة، علشان ماحدش يخلّص رصيد اليوم في دقايق.", "Janna talks to any visitor, so she has her own share of the same cap (default " + defJ + " = 40 %), never above it or the cap itself — the rest is Bassem's. Janna also has an hourly and a per-minute limit, so nobody can use up the day's credit in minutes.")) + "</p>"
        + '<div class="acts2">' + btn("wscapj", h(T("💾 حفظ نصيب جنة", "💾 Save Janna's share")), "r") + (cj.value ? btn("wscapjdel", h(T("↺ الافتراضي", "↺ Default") + " (" + defJ + ")"), "l") : "") + "</div>"
        + '<p class="sm">' + h(T("استخدام النهارده: ", "Used today: ")) + "<b>" + h(String(w.used_today || 0)) + "</b> " + h(T("من ", "of ")) + "<b>" + h(String(cp.effective == null ? "" : cp.effective)) + "</b>"
        + (cj.effective != null ? " · " + h(T("منهم جنة: ", "of which Janna: ")) + "<b>" + h(String(w.used_today_janna || 0)) + "</b> " + h(T("من ", "of ")) + "<b>" + h(String(cj.effective)) + "</b>" : "") + "</p>" + msgH("websearch"))
        + secretCard("websearch.key", w.key, noSec)
        + secretCard("bassem.tool_secret", w.tool_secret, noSec, { extra: '<p class="mut sm">' + h(T("ده سر أداتين باسم (البحث وصيد الفرص). لو غيّرته أو مسحته، دوس «🔗 وصّل البحث بجنة وباسم» تاني علشان Anam ياخد الجديد.", "This is the secret of Bassem's two tools (search and hunt). If you change or delete it, press «🔗 Connect web search to Janna and Bassem» again so Anam gets the new one.")) + "</p>" })
        + (w.janna_secret ? secretCard("janna.tool_secret", w.janna_secret, noSec, { extra: '<p class="mut sm">' + h(T("ده سر أداتين جنة — منفصل عن سر باسم علشان جنة بتكلّم أي زائر. مش لازم تدخّله: زرار «🔗 وصّل البحث بجنة وباسم» بيعمله لوحده ويحفظه مشفّر. لو غيّرته أو مسحته، دوس الزرار تاني.", "This is the secret of Janna's two tools — separate from Bassem's because Janna talks to any visitor. You need not enter it: «🔗 Connect web search to Janna and Bassem» makes one and stores it encrypted. If you change or delete it, press the button again.")) + "</p>" }) : "")
        + connCard(w);
    };
    /* «🔗 وصّل البحث بجنة وباسم» (POST /api/admin/cc/keys/websearch/connect, worker/src/acc-wsconnect.js): the server creates / updates the
       four Anam tools (bassem_web_search, bassem_web_hunt with Bassem's secret; janna_web_search, janna_web_hunt with Janna's — each made
       and sealed there when none exists) and adds them to Bassem and to Janna AR / EN — no secret ever reaches this page or anyone;
       GET /keys → websearch.connect = {tools[{key, name, written, personas[{key, attached}], secret_changed}], connected_bassem,
       connected_janna, connected_all, at, by, secret_changed, anam_key, last} */
    var WSMISS = { key: ["مفتاح البحث", "the search key"], provider: ["مزود الخدمة", "the provider"], cap: ["حد يومي أكبر من 0", "a daily cap above 0"] };
    var WTOOL = { bassem_web_search: ["بحث باسم في الإنترنت", "Bassem's web search"], bassem_web_hunt: ["صيد الفرص عند باسم", "Bassem's opportunity hunt"], janna_web_search: ["بحث جنة في الإنترنت", "Janna's web search"], janna_web_hunt: ["صيد الفرص عند جنة", "Janna's opportunity hunt"] };
    var WPER = { bassem: ["باسم", "Bassem"], janna_ar: ["جنة (عربي)", "Janna (Arabic)"], janna_en: ["جنة (إنجليزي)", "Janna (English)"] };
    var WDONE = { created: ["اتعملت", "created"], updated: ["اتحدّثت", "updated"], unchanged: ["مظبوطة من قبل", "already set"] };
    var connCard = function (w) {
      var k = w && w.connect; if (!k) return "";
      var noKey = k.anam_key === "none", last = k.last, tl = k.tools || [], all = k.connected_all === true || (!tl.length && k.connected);
      var rows = tl.map(function (t) {
        var ok = t.written && (t.personas || []).every(function (p) { return p.attached; });
        return '<div class="row"><span><b>' + h(L2(WTOOL[t.key] || [t.key, t.key])) + '</b> <small class="mut" dir="ltr">' + h(t.name || t.key) + "</small></span><span>"
          + (t.written ? (t.personas || []).map(function (p) { return tag((p.attached ? "✓ " : "✗ ") + L2(WPER[p.key] || [p.key, p.key]), p.attached ? "ok" : "x"); }).join(" ") : tag(T("لسه ماتعملتش", "not created yet"), "g"))
          + (ok && t.secret_changed ? " " + tag(T("السر اتغيّر", "secret changed"), "p") : "") + "</span></div>";
      }).join("");
      var st = all ? '<div class="okc">' + h(T("✓ متوصّل: أدوات البحث وصيد الفرص على جنة (عربي وإنجليزي) وباسم في Anam", "✓ Connected: the search and hunt tools are on Janna (Arabic and English) and Bassem in Anam")) + (k.at ? ' <small dir="auto">(' + h(whoWhen(k.at, k.by)) + ")</small>" : "") + "</div>"
        : '<div class="alert">' + h(tl.some(function (t) { return t.written; }) ? T("التوصيل لسه مش كامل — شوف اللي ناقص تحت ودوس الزرار تاني (اللي اتعمل قبل كده مش بيتكرر).", "The connection is not complete yet — see what is missing below and press the button again (what was done is not repeated).")
          : T("لسه مش متوصّل — جنة وباسم مش هيقدروا يدوّروا على الإنترنت في المكالمة لحد ما تدوس الزرار ده.", "Not connected yet — Janna and Bassem cannot search the web in a call until you press this button.")) + "</div>";
      var changed = k.secret_changed && tl.some(function (t) { return t.written; }) ? '<div class="alert">' + h(T("سر أدوات اتغيّر بعد آخر توصيل — دوس «🔗 وصّل البحث بجنة وباسم» تاني علشان Anam ياخد الجديد.", "A tool secret changed after the last connection — press «🔗 Connect web search to Janna and Bassem» again so Anam gets the new one.")) + "</div>" : "";
      var lastH = last && last.at && !last.ok ? '<p class="sm bad">' + h((last.finished ? T("آخر محاولة مانجحتش", "The last attempt failed") : T("آخر محاولة ماكملتش", "The last attempt did not finish")) + " — " + fd(last.at, true)
        + (last.code ? " (" + [last.code, last.anam_status || "", last.step || "", last.persona ? L2(WPER[last.persona] || [last.persona, last.persona]) : ""].filter(function (x) { return !!x; }).join(" · ") + ")" : "")) + "</p>" : "";
      return cardH(T("🔗 توصيل البحث بجنة وباسم (Anam)", "🔗 Connect web search to Janna and Bassem (Anam)"), st + changed
        + (rows ? '<div class="rows">' + rows + "</div>" : "")
        + '<p class="mut sm">' + h(T("الزرار ده بيعمل 4 أدوات في Anam (أو بيحدّثها لو موجودة): بحث باسم وصيد الفرص عنده، وبحث جنة وصيد الفرص عندها، وبيضيف كل أداة لشخصيتها (جنة بالعربي والإنجليزي، وباسم) من غير ما يشيل أي أداة تانية. سر كل أداة بيتحط جوّاها من السيرفر على طول: محدش بيشوفه، ولا إنت، وماحدش يبعته لحد. ولو مفيش سر، السيرفر بيعمل واحد عشوائي ويحفظه مشفّر. الضغط مرتين مابيغيّرش حاجة.", "This button creates 4 tools in Anam (or updates them if they exist): Bassem's search and hunt, and Janna's search and hunt, and adds each tool to its persona (Janna in Arabic and English, and Bassem) without removing any other tool. The server puts each tool's secret into it directly: nobody sees it, not even you, and nobody sends it to anyone. If a secret is missing, the server makes a random one and stores it encrypted. Pressing twice changes nothing.")) + "</p>"
        + '<div class="acts2">' + btn("wsconn", h(T("🔗 وصّل البحث بجنة وباسم", "🔗 Connect web search to Janna and Bassem")), "r", noKey ? " disabled" : "") + "</div>"
        + (noKey ? '<small class="why-off">' + h(T("مقفول لحد ما تضيف «مفتاح Anam» فوق.", "Disabled until you add the «Anam key» above.")) + "</small>" : "")
        + '<p class="mut sm">' + h(T("محتاج مفتاح Anam ليه صلاحية تعديل الأدوات والشخصيات (Write على Tools و Personas). لو صلاحيته أقل، الزرار هيقولك كده (403) وإزاي تصلّحها.", "Needs an Anam key allowed to change tools and personas (Write on Tools and Personas). If it has less, the button says so (403) and how to fix it.")) + "</p>"
        + '<div class="note">' + h(T("خطوة عليك في Anam Lab: لو باسم ليه رابط مشاركة (Share link) أو مكان مسموح للـ widget، اقفلهم. أي حد معاه الرابط يقدر يكلّم باسم من برّه المنصة ويصرف من رصيد البحث ومن غير دخول العضو.", "A step for you in Anam Lab: if Bassem has a share link or allowed widget origins, close them. Anyone with the link could talk to Bassem outside the platform, without a member's sign-in, and use the search credit.")) + "</div>"
        + lastH + msgH("wsconnect"));
    };
    var connMsg = function (r) {
      r = r || {};
      var tl = r.tools || [], a;
      if (tl.length) {
        a = "✓ " + tl.map(function (t) { return L2(WTOOL[t.key] || [t.key, t.key]) + ": " + L2(WDONE[t.done] || [t.done || "", t.done || ""]); }).join(T("، ", ", ")) + ".";
        var per = r.personas || {}, added = [], same = [];
        for (var pk in per) if (Object.prototype.hasOwnProperty.call(per, pk)) ((per[pk].added || []).length ? added : same).push(L2(WPER[pk] || [pk, pk]));
        if (added.length) a += T(" اتضافت لـ: ", " Added to: ") + added.join(T("، ", ", ")) + ".";
        if (same.length) a += T(" كانت على: ", " Already on: ") + same.join(T("، ", ", ")) + ".";
      } else {
        a = r.created ? T("✓ اتعملت الأداة bassem_web_search في Anam", "✓ The tool bassem_web_search was created in Anam") : r.updated ? T("✓ اتحدّثت الأداة bassem_web_search في Anam", "✓ The tool bassem_web_search was updated in Anam") : T("✓ الأداة bassem_web_search موجودة ومظبوطة — مفيش تغيير", "✓ The tool bassem_web_search is already set — no change");
        a += r.already_attached ? T("، ومربوطة بباسم من قبل.", ", and it was already on Bassem.") : T("، واتربطت بباسم.", ", and it is now on Bassem.");
      }
      var hs = r.header_source || {};
      if (hs === "generated" || hs.bassem === "generated") a += T(" اتعمل «سر أدوات باسم» جديد واتحفظ مشفّر — محدش هيشوفه.", " A new «Bassem tool secret» was made and stored encrypted — nobody will see it.");
      if (hs.janna === "generated") a += T(" اتعمل «سر أدوات جنة» جديد واتحفظ مشفّر — محدش هيشوفه.", " A new «Janna tool secret» was made and stored encrypted — nobody will see it.");
      if (r.websearch_ready) a += T(" البحث جاهز ✓", " Web search is ready ✓");
      else if (r.websearch_missing && r.websearch_missing.length) a += T(" لسه ناقص: ", " Still missing: ") + r.websearch_missing.map(function (x) { return L2(WSMISS[x] || [x, x]); }).join(T("، ", ", ")) + ".";
      if (r.websearch_ready && r.janna_ready === false && r.janna_reason) a += T(" بحث جنة لسه مقفول: ", " Janna's search is still off: ") + L2(WSRJ[r.janna_reason] || WSR[r.janna_reason] || [r.janna_reason, r.janna_reason]) + ".";
      var fo = r.feature_on;
      if (fo === false || (fo && fo.bassem_web_search === false)) a += T(" بس «بحث باسم على الإنترنت» مقفول من «🛠️ المطوّر» ← «المزايا».", " But Bassem's web search is switched off in «🛠️ Developer» → «Features».");
      if (fo && fo.janna_web_search === false) a += T(" بس «بحث جنة على الإنترنت» مقفول من «🛠️ المطوّر» ← «المزايا».", " But Janna's web search is switched off in «🛠️ Developer» → «Features».");
      var dup = tl.filter(function (t) { return t.duplicates > 0; });
      if (dup.length) a += T(" تنبيه: فيه أدوات تانية بنفس الاسم في Anam (", " Note: other tools with the same name exist in Anam (") + dup.map(function (t) { return (t.name || t.key) + " × " + t.duplicates; }).join(", ") + T(") — امسحها من Anam Lab.", ") — delete them in Anam Lab.");
      else if (!tl.length && r.duplicates) a += T(" تنبيه: فيه " + r.duplicates + " أداة تانية بنفس الاسم في Anam — امسحها من Anam Lab.", " Note: " + r.duplicates + " other tool(s) with the same name exist in Anam — delete them in Anam Lab.");
      (r.warnings || []).forEach(function (x) {
        if (x && x.code === "share_links") a += T(" ⚠️ باسم ليه " + (x.count || 1) + " رابط مشاركة مفتوح في Anam — اقفله من Anam Lab (أي حد معاه الرابط يكلّم باسم ويصرف من رصيد البحث).", " ⚠️ Bassem has " + (x.count || 1) + " open share link(s) in Anam — close them in Anam Lab (anyone with the link can talk to Bassem and use the search credit).");
      });
      return a;
    };
    var connErr = function (e) {
      var j = (e && e.j) || {};
      if (!j.msg_ar) return errText(e);
      var done = j.tools_done || {}, dn = Object.keys(done).filter(function (k) { return !!done[k]; });
      return T(j.msg_ar, j.msg_en || j.msg_ar) + (j.persona ? T(" (عند " + L2(WPER[j.persona] || [j.persona, j.persona]) + ")", " (on " + L2(WPER[j.persona] || [j.persona, j.persona]) + ")") : "")
        + (dn.length ? T(" اللي خلص: ", " Done so far: ") + dn.map(function (k) { return L2(WTOOL[k] || [k, k]); }).join(T("، ", ", ")) + T(" — الضغطة الجاية بتكمّل الباقي.", " — the next press finishes the rest.") : j.tool_id ? T(" (الأداة نفسها بقت في Anam — اللي فاضل ربطها.)", " (The tool itself is in Anam already — only attaching it is left.)") : "");
    };
    /* the small support line: the code, Anam's status, the step and the persona only (the words above already say the rest, in the page's language) */
    var connSmall = function (e) { var j = (e && e.j) || {}; return j.msg_ar ? { code: [e.code, j.anam_status, j.step, j.persona].filter(function (x) { return !!x; }).join(" "), error: "" } : e; };
    var paint = function () {
      var j = c.st.j || {}, sl = j.slots || {}, noSec = j.config_secret === false;
      setCt((j.store === false ? '<div class="alert">' + h(L2(ERRS.store_off)) + "</div>" : "")
        + (noSec ? '<div class="alert">' + h(L2(ERRS.config_secret_missing)) + "</div>" : "")
        + '<div class="note">' + h(T("الصفحة دي لمالك المنصة بس. المفاتيح بتتبعت للسيرفر وبتتحفظ مشفّرة؛ ماحدش يقدر يشوفها تاني (ولا إنت) — بيظهر آخر 4 حروف بس. كل حفظ أو مسح أو اختبار بيتسجّل في «سجل العمليات» من غير المفتاح.", "This page is for the platform owner only. Keys go to the server and are stored encrypted; nobody can see them again (not even you) — only the last 4 characters show. Every save, delete or test is written to the «Audit log» without the key.")) + "</div>"
        + '<div class="gr">' + secretCard("respondio.token", sl["respondio.token"], noSec) + chanCard(sl["respondio.channel"]) + "</div>"
        + waCard(j.wa) + '<div class="gr">' + secretCard("anam.api_key", sl["anam.api_key"], noSec) + payCard(j.payments) + "</div>"
        + (j.websearch ? '<div class="gr">' + wsCard(j.websearch, noSec) + "</div>" : "") + cfCard(j.cloudflare, noSec) + moreSlots(sl, noSec));
    };
    /* «Cloudflare — لوحة المطوّر» (slot cloudflare.dev_token, GET /keys → cloudflare: {token, account_id, permissions_ar/en}): the token the
       developer panel lists deploys and rolls back with — write-only like every key here, never a tail: «متسجّل ✓» only */
    var cfCard = function (cf, noSec) {
      if (!cf || !cf.token) return "";
      var t = cf.token, perm = L2([cf.permissions_ar || "", cf.permissions_en || ""]);
      return '<div class="gr">' + secretCard("cloudflare.dev_token", { kind: "secret", label_ar: t.label_ar || "Cloudflare — لوحة المطوّر", label_en: t.label_en || "Cloudflare — developer panel", set: t.set, set_at: t.set_at, set_by: t.set_by, readable: t.readable, env: t.env, env_name: t.env_name, effective: t.effective, testable: t.testable, last_test: t.last_test }, noSec,
        { ok: T("متسجّل ✓", "Registered ✓"), extra: (perm ? '<p class="mut sm" dir="auto">' + h(T("الصلاحيات المطلوبة: ", "Permissions needed: ") + perm) + "</p>" : "") + (cf.account_id ? '<p class="mut sm">' + h(T("الحساب: ", "Account: ")) + '<code dir="ltr">' + h(cf.account_id) + "</code></p>" : "") + '<p class="sm"><a href="#dev/deploys">' + h(T("🛠️ افتح «النشر» في لوحة المطوّر ←", "🛠️ Open «Deploys» in the developer panel →")) + "</a></p>" }) + "</div>";
    };
    /* every other secret slot the server lists (the developer panel's «Cloudflare — لوحة المطوّر» token …) gets the same card */
    var KNOWN = { "respondio.token": 1, "respondio.channel": 1, "anam.api_key": 1, "websearch.key": 1, "bassem.tool_secret": 1, "janna.tool_secret": 1, "websearch.provider": 1, "websearch.cap": 1, "websearch.cap_janna": 1, "cloudflare.dev_token": 1 };
    var moreSlots = function (sl, noSec) {
      var ks = Object.keys(sl || {}).filter(function (k) { return !KNOWN[k] && sl[k] && typeof sl[k] === "object" && sl[k].kind !== "setting"; });
      if (!ks.length) return "";
      return '<div class="gr">' + ks.map(function (k) {
        var dev = /^(cf|cloudflare)[._-]/i.test(k) || sl[k].section === "dev";
        return secretCard(k, sl[k], noSec, { extra: dev ? '<p class="sm"><a href="#dev/deploys">' + h(T("🛠️ افتح «النشر» في لوحة المطوّر ←", "🛠️ Open «Deploys» in the developer panel →")) + "</a></p>" : "" });
      }).join("") + "</div>";
    };
    var say = function (k, ok, t, e) { c.st.msg = {}; c.st.msg[k] = { ok: ok, t: t, sm: e || null }; };
    var reload = function () { GET("/admin/cc/keys").then(function (j) { if (!alive(c)) return; c.st.j = j || {}; paint(); }, function (e) { if (alive(c)) { toast(errText(e), 1); paint(); } }); };
    c.on.rf = function () { c.st.msg = {}; load(); };
    c.on.ksave = function (b) {
      var slot = b.getAttribute("data-slot"), inp = $("#k_" + slot.replace(/\W/g, "_")), v = inp ? trim(inp.value) : "";
      if (!v) { toast(T("الصق المفتاح الأول.", "Paste the key first."), 1); if (inp) inp.focus(); return; }
      if (v.length < 16 || /\s/.test(v.replace(/^bearer\s+/i, ""))) { toast(T("المفتاح لازم يكون 16 حرف أو أكتر من غير مسافات.", "The key must be 16+ characters without spaces."), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/keys/" + enc(slot), { value: v }).then(function (r) { if (inp) inp.value = ""; v = ""; say(slot, true, T("اتحفظ ✓", "Saved ✓") + (r && r.wa_reset ? T(" — الإرسال الحقيقي اتقفل لحد ما تختبر التوكن الجديد", " — real sending is off until you test the new token") : "")); reload(); },
        function (e) { if (inp) inp.value = ""; v = ""; b.disabled = false; say(slot, false, errText(e), e); paint(); });
    };
    c.on.kdel = function (b) {
      var slot = b.getAttribute("data-slot"); if (!sure(T("مسح المفتاح ده؟ الخدمة هتقف لو مفيش سر على الـ Worker.", "Delete this key? The service stops unless a Worker secret exists."))) return;
      b.disabled = true;
      DEL("/admin/cc/keys/" + enc(slot)).then(function (r) { say(slot, true, T("اتمسح ✓", "Deleted ✓") + (r && r.env_in_force ? T(" — سر الـ Worker لسه شغّال", " — the Worker secret is still in use") : "")); reload(); }, function (e) { b.disabled = false; say(slot, false, errText(e), e); paint(); });
    };
    c.on.ktest = function (b) {
      var slot = b.getAttribute("data-slot"); b.disabled = true; b.textContent = T("جارٍ الاختبار…", "Testing…");
      POST("/admin/cc/keys/" + enc(slot) + "/test", {}, { timeout: 30000 }).then(function (r) { say(slot, !!(r && r.ok), (r && r.ok ? "✓ " : "✗ ") + ((r && r.detail) || (r && r.ok ? T("الاختبار نجح", "The test passed") : T("الاختبار فشل", "The test failed")))); reload(); },
        function (e) { say(slot, false, errText(e), e); reload(); });
    };
    c.on.csave = function (b) {
      var inp = $("#k_chan"), v = inp ? trim(inp.value).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }) : "";
      if (!/^[1-9]\d{0,11}$/.test(v)) { toast(T("رقم القناة أرقام بس (من 1 لـ 12 رقم).", "The channel id is digits only (1–12)."), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/keys/respondio.channel", { value: v }).then(function (r) { say("respondio.channel", true, r && r.unchanged ? T("مفيش تغيير.", "No change.") : T("اتحفظ ✓ — الإرسال الحقيقي اتقفل لحد ما تختبر التوكن تاني", "Saved ✓ — real sending is off until you test the token again")); reload(); }, function (e) { b.disabled = false; say("respondio.channel", false, errText(e), e); paint(); });
    };
    c.on.wsprov = function (b) {
      var sel = $("#k_wsprov"), v = sel ? sel.value : "";
      b.disabled = true;
      (v ? PUT("/admin/cc/keys/websearch.provider", { value: v }) : DEL("/admin/cc/keys/websearch.provider")).then(function (r) { say("websearch", true, r && r.unchanged ? T("مفيش تغيير.", "No change.") : T("اتحفظ ✓ — اختبر مفتاح البحث مع المزود ده", "Saved ✓ — test the search key with this provider")); reload(); },
        function (e) { b.disabled = false; say("websearch", false, errText(e), e); paint(); });
    };
    c.on.wscap = function (b) {
      var inp = $("#k_wscap"), v = inp ? trim(inp.value).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }) : "";
      if (!/^\d{1,5}$/.test(v) || +v > 10000) { toast(T("الحد اليومي رقم من 0 لـ 10000 (0 = البحث مقفول).", "The daily cap is a number from 0 to 10000 (0 = off)."), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/keys/websearch.cap", { value: v }).then(function (r) { say("websearch", true, r && r.unchanged ? T("مفيش تغيير.", "No change.") : T("اتحفظ ✓", "Saved ✓")); reload(); }, function (e) { b.disabled = false; say("websearch", false, errText(e), e); paint(); });
    };
    c.on.wscapj = function (b) {
      var inp = $("#k_wscapj"), v = inp ? trim(inp.value).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }) : "";
      if (!/^\d{1,5}$/.test(v) || +v > 10000) { toast(T("نصيب جنة رقم من 0 لـ 10000 (0 = بحث جنة مقفول؛ مابيعدّيش الحد اليومي).", "Janna's share is a number from 0 to 10000 (0 = her search off; never above the daily cap)."), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/keys/websearch.cap_janna", { value: v }).then(function (r) { say("websearch", true, r && r.unchanged ? T("مفيش تغيير.", "No change.") : T("اتحفظ ✓", "Saved ✓") + (r && r.item && r.item.effective != null && String(r.item.effective) !== v ? T(" — الشغّال " + r.item.effective + " (مابيعدّيش الحد اليومي)", " — in use: " + r.item.effective + " (never above the daily cap)") : "")); reload(); }, function (e) { b.disabled = false; say("websearch", false, errText(e), e); paint(); });
    };
    c.on.wscapjdel = function (b) { b.disabled = true; DEL("/admin/cc/keys/websearch.cap_janna").then(function () { say("websearch", true, T("رجع للافتراضي ✓", "Back to the default ✓")); reload(); }, function (e) { b.disabled = false; say("websearch", false, errText(e), e); paint(); }); };
    c.on.wsconn = function (b) {
      if (!sure(T("نوصّل البحث على الإنترنت بجنة وباسم في Anam؟ السيرفر هيعمل (أو يحدّث) 4 أدوات — البحث وصيد الفرص لكل واحد فيهم — ويضيفها لجنة (عربي وإنجليزي) ولباسم من غير ما يشيل أي أداة تانية.", "Connect web search to Janna and Bassem in Anam? The server creates (or updates) 4 tools — search and hunt for each of them — and adds them to Janna (Arabic and English) and to Bassem without removing any other tool."))) return;
      b.disabled = true; b.textContent = T("جارٍ التوصيل… (ممكن ياخد دقيقة)", "Connecting… (this can take a minute)");
      POST("/admin/cc/keys/websearch/connect", {}, { timeout: 120000 }).then(function (r) { say("wsconnect", true, connMsg(r)); reload(); },
        function (e) { say("wsconnect", false, connErr(e), connSmall(e)); reload(); });
    };
    c.on.wscapdel = function (b) { b.disabled = true; DEL("/admin/cc/keys/websearch.cap").then(function () { say("websearch", true, T("رجع للافتراضي ✓", "Back to the default ✓")); reload(); }, function (e) { b.disabled = false; say("websearch", false, errText(e), e); paint(); }); };
    c.on.cdel = function (b) { b.disabled = true; DEL("/admin/cc/keys/respondio.channel").then(function () { say("respondio.channel", true, T("رجعت للقيمة الافتراضية ✓", "Back to the default ✓")); reload(); }, function (e) { b.disabled = false; say("respondio.channel", false, errText(e), e); paint(); }); };
    c.on.wtest = function (b) {
      var w = (c.st.j || {}).wa || {}, md = ($("#k_wmode") || {}).value === "template" ? "template" : "text";
      if (!sure(T("نبعت رسالة واتساب تجربة واحدة لرقم المنصة " + (w.own_display || "01279188996") + "؟", "Send ONE test WhatsApp message to the platform's number " + (w.own_display || "01279188996") + "?"))) return;
      b.disabled = true;
      POST("/admin/cc/keys/wa-test", { mode: md }, { timeout: 30000 }).then(function (r) {
        if (r && r.sent) say("wa", true, T("اتبعتت ✓ على ", "Sent ✓ to ") + (r.to || "") + T(" — لما توصل على الموبايل علّم «الرسالة وصلت» وشغّل الإرسال.", " — when it arrives on the phone, tick «it arrived» and switch sending on."));
        else say("wa", false, T("ماتبعتتش: ", "Not sent: ") + ((r && r.error) || "") + (r && r.hint ? " — " + r.hint : ""));
        reload();
      }, function (e) { say("wa", false, errText(e), e); reload(); });
    };
    c.on.won = function (b) {
      var ok = $("#k_wok"); if (!ok || !ok.checked) { toast(T("علّم الأول إن رسالة التجربة وصلت.", "First tick that the test message arrived."), 1); return; }
      if (!sure(T("تشغيل الإرسال الحقيقي؟ رسايل واتساب حقيقية هتطلع للمصانع والمشترين من دلوقتي.", "Turn real sending on? Real WhatsApp messages will go out to factories and buyers from now on."))) return;
      b.disabled = true;
      POST("/admin/cc/keys/wa-live", { on: true, confirm_delivered: true }).then(function (r) { say("wa", !!(r && r.live), r && r.live ? T("✓ الإرسال الحقيقي اشتغل", "✓ Real sending is on") : T("المفتاح اتفتح، بس الإرسال لسه تجربة: ", "The switch is on, but sending is still a dry run: ") + (r && REASON[r.reason] ? L2(REASON[r.reason]) : "")); reload(); },
        function (e) { b.disabled = false; var need = e && e.j && e.j.need; say("wa", false, errText(e) + (need && need.length ? " (" + need.join(", ") + ")" : ""), e); paint(); });
    };
    c.on.woff = function (b) {
      if (!sure(T("إيقاف إرسال الواتساب الحقيقي؟ النظام هيرجع وضع التجربة.", "Switch real WhatsApp sending off? The system goes back to dry run."))) return;
      b.disabled = true;
      POST("/admin/cc/keys/wa-live", { on: false }).then(function () { say("wa", true, T("اتقفل ✓ — وضع التجربة", "Switched off ✓ — dry run")); reload(); }, function (e) { b.disabled = false; say("wa", false, errText(e), e); paint(); });
    };
    load();
  };

  /* =====================================================================================================================
     mail — البريد (the live view; Resend first, Brevo API; SMTP is not shown: it cannot run on Workers) + templates, log, status
     ===================================================================================================================== */
  SEC.mail = function () {
    var c = CUR; c.st.tab = "cfg";
    var paintHead = function () { head(T("البريد", "E-mail"), h(T("إرسال الإيميلات (أكواد الدخول، الفواتير، الطلبات) من noreply@madeinegyptgate.com", "Sending e-mails (sign-in codes, invoices, requests) from noreply@madeinegyptgate.com")), (c.st.tab === "cfg" && can("email.config") ? btn("mlsave", h(T("💾 حفظ", "💾 Save")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh")))); };
    var tabs = function () { return tabsH([["cfg", "الإعدادات", "Settings"], ["tpl", "القوالب", "Templates"], ["log", "سجل الإرسال", "Delivery log"], ["st", "حالة المزوّد", "Provider status"]], c.st.tab, "mtab"); };
    var shell = function () { paintHead(); setCt('<div id="mtabs">' + tabs() + '</div><div id="mbody">' + loadingH() + "</div>"); };
    var body = function (html) { var m = $("#mbody"); if (m) m.innerHTML = html; };
    var cfg = function () {
      GET("/admin/cc/email/config").then(function (j) {
        if (!alive(c) || c.st.tab !== "cfg") return; c.st.cfg = j;
        var OW = can("email.config"), dis = OW ? "" : " disabled", k = j.key || {}, noSec = ST.features.config_secret === false;
        var F3 = function (l, id, v, t, ph, extra) { return '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(l) + '</span><input id="ml_' + id + '" type="' + (t || "text") + '" value="' + h(t === "password" ? "" : v || "") + '" placeholder="' + h(ph || "") + '" dir="ltr" style="padding:9px;border:1px solid #cfd8d3;border-radius:8px"' + dis + (extra || "") + (t === "password" ? ' autocomplete="new-password"' : "") + "></label>"; };
        var keyLab = "API Key" + (j.provider === "brevo" ? " (Brevo: xkeysib-…)" : " (Resend: re_…)") + (k.source === "control_center" ? T(" (محفوظ ····", " (saved ····") + (k.tail || "") + T(" — اتركه فارغاً للإبقاء)", " — leave empty to keep it)") + (k.readable === false ? T(" — المحفوظ مش مقروء، دخّله تاني", " — the saved key cannot be read, enter it again") : "") : k.source === "worker_secret" ? T(" (مستخدم دلوقتي من سر الـ Worker — اكتب مفتاح هنا عشان تقدر تغيّره من اللوحة)", " (currently from the Worker secret — enter a key here to rotate it from the panel)") : T(" (مفيش مفتاح لسه)", " (no key yet)"));
        body('<style>#ct .pyf input,#ct .pyf select{width:100%!important;max-width:100%!important;box-sizing:border-box}#ct .pyf input[type=checkbox]{width:auto!important}</style><div class="note">' + h(T("مفتاح مزوّد البريد يُحفظ مشفّراً ولا يظهر بعد الحفظ. سجلات الدومين (MX/SPF/DKIM) على Hostinger ماتتلمسش.", "The mail provider key is stored encrypted and never shown after saving. The domain's DNS records (MX/SPF/DKIM) on Hostinger are never touched.")) + "</div>"
          + (j.ready ? '<div class="okc">✓ ' + h(T("الإرسال جاهز", "Sending is ready")) + "</div>" : '<div class="alert">' + h(T("الإرسال مش متضبط لسه", "Sending is not configured yet")) + "</div>") + (noSec ? '<div class="note">' + h(L2(ERRS.config_secret_missing)) + "</div>" : "")
          + '<div class="cd"><div class="in pyf" style="max-width:560px"><label style="display:block;margin:6px 0"><input type="checkbox" id="ml_enabled"' + (j.enabled ? " checked" : "") + dis + "> " + h(T("تفعيل إرسال الإيميلات", "Enable sending e-mails")) + "</label>"
          + '<label style="display:block;margin:10px 0"><span style="display:block;font-weight:700;margin-bottom:4px">' + h(T("طريقة الإرسال", "Sending method")) + '</span><select id="ml_provider" style="padding:9px;border-radius:8px;border:1px solid #cfd8d3"' + dis + '><option value="resend"' + (j.provider !== "brevo" ? " selected" : "") + ">" + h(T("Resend — الأساسي", "Resend — primary")) + '</option><option value="brevo"' + (j.provider === "brevo" ? " selected" : "") + ">Brevo API</option></select></label>"
          + F3(T("البريد المرسِل", "Sender address"), "from_email", j.from_email || "noreply@madeinegyptgate.com") + F3(T("اسم المرسِل", "Sender name"), "from_name", j.from_name || "منصة صنع في مصر", "text", "", ' dir="auto"') + F3("Reply-To", "reply_to", j.reply_to || "info@madeinegyptgate.com")
          + F3(keyLab, "api_key", "", "password", "", noSec ? " disabled" : "")
          + '<hr style="margin:16px 0;border:0;border-top:1px solid #e3e8e5"><b>' + h(T("رسالة تجريبية", "Test message")) + "</b>" + F3(T("أرسل إلى", "Send to"), "to", "", "text", "name@example.com", can("email.test") ? "" : " disabled") + (can("email.test") ? '<button class="btn" type="button" data-a="mltest">' + h(T("✉ إرسال تجريبي", "✉ Send a test")) + "</button>" : "") + '<div id="ml_res" class="sm" style="margin-top:8px"></div></div></div>');
      }, function (e) { if (alive(c)) body(errH(e)); });
    };
    var tpl = function () {
      GET("/admin/cc/email/templates").then(function (j) {
        if (!alive(c) || c.st.tab !== "tpl") return; var it = c.st.tpls = j.items || [];
        body('<div class="cd">' + tableH([["القالب", "Template", function (r) { return '<b dir="auto">' + h(EN() ? r.name_en || r.name_ar : r.name_ar || r.name_en) + '</b><br><small dir="ltr">' + h(r.key) + "</small>"; }], ["المجموعة", "Group", function (r) { return h(r.group || ""); }], ["القائمة", "List", function (r) { return h(r.list || "—"); }], ["شغّال", "On", function (r) { return r.required ? tag(T("أساسي — دايماً شغّال", "Required — always on"), "g") : can("email.templates") ? '<button type="button" class="btn s ' + (r.enabled ? "l" : "r") + '" data-a="tgl" data-k="' + h(r.key) + '">' + h(r.enabled ? T("✓ شغّال", "✓ On") : T("مقفول — شغّله", "Off — turn on")) + "</button>" : r.enabled ? "✓" : "—"; }], ["آخر 30 يوم", "Last 30 days", function (r) { return h(nf(r.sent_30d || 0) + T(" اتبعت", " sent") + (r.failed_30d ? " · " + nf(r.failed_30d) + T(" فشل", " failed") : "")); }], ["تعديلات", "Overrides", function (r) { var o = r.overrides || {}, n = Object.keys(o).filter(function (k) { return o[k]; }).length; return n ? tag(nf(n), "b") : "—"; }]], it, { count: it.length, acts: function (r, i) { return (can("email.templates") ? '<button type="button" class="btn s l" data-a="ted" data-i="' + i + '">' + h(T("تعديل", "Edit")) + "</button> " : "") + '<button type="button" class="btn s l" data-a="tpv" data-i="' + i + '">' + h(T("معاينة", "Preview")) + "</button>"; } }) + "</div>");
      }, function (e) { if (alive(c)) body(errH(e)); });
    };
    var logq = c.st.lq = { template: "", status: "", to: "", from: "", to_date: "", before: "", stack: [] };
    var log = function () {
      body('<div class="bar"><input id="lto" type="email" dir="ltr" placeholder="' + h(T("بحث بإيميل كامل", "Search by a full e-mail")) + '" value="' + h(logq.to) + '" aria-label="' + h(T("إيميل", "E-mail")) + '"><select id="ltp" data-c="ltp" aria-label="' + h(T("القالب", "Template")) + '"><option value="">' + h(T("كل القوالب", "All templates")) + "</option>" + (c.st.tpls || []).map(function (t) { return '<option value="' + h(t.key) + '"' + (t.key === logq.template ? " selected" : "") + ">" + h(EN() ? t.name_en || t.key : t.name_ar || t.key) + "</option>"; }).join("") + "</select>" + sel("lst2", [["", "كل الحالات", "All statuses"], ["sent", "اتبعت", "Sent"], ["failed", "فشل", "Failed"], ["skipped", "اتخطّى", "Skipped"]], logq.status, T("الحالة", "Status")) + dateIn("lfr", logq.from, T("من تاريخ", "From")) + dateIn("ltd", logq.to_date, T("إلى تاريخ", "To")) + btn("lgo", h(T("بحث", "Search")), "r") + '</div><div class="cd"><div id="ltb">' + loadingH() + '</div><div class="pg" id="lpg"></div></div>');
      GET("/admin/cc/email/log" + qs({ template: logq.template, status: logq.status, to: logq.to, from: logq.from, to_date: logq.to_date, before: logq.before, limit: 50 })).then(function (j) {
        if (!alive(c) || c.st.tab !== "log") return; var it = j.items || []; c.st.next = j.next_before || "";
        $("#ltb").innerHTML = tableH([["الوقت", "Time", function (r) { return fdh(r.at, true); }], ["القالب", "Template", function (r) { return '<small dir="ltr">' + h(r.template || "") + "</small>"; }], ["المستلم", "Recipient", function (r) { return '<small dir="ltr">' + h(r.to_masked || "") + "</small>"; }], ["العنوان", "Subject", function (r) { return '<span dir="auto">' + h(cut(r.subject || "", 90)) + "</span>"; }], ["المزوّد", "Provider", function (r) { return h(r.provider || "—"); }], ["الحالة", "Status", function (r) { return tag(r.status, r.status === "sent" ? "ok" : r.status === "failed" ? "x" : "g"); }], ["الخطأ", "Error", function (r) { return '<small dir="ltr">' + h(cut(r.error || "", 120)) + "</small>"; }]], it, { count: it.length, empty: T("السجل فاضي.", "The log is empty.") });
        $("#lpg").innerHTML = (logq.stack.length ? btn("lnew", h(T("→ الأحدث", "→ Newer")), "l s") : "") + (c.st.next ? btn("lold", h(T("الأقدم ←", "Older ←")), "l s") : "");
      }, function (e) { if (alive(c)) $("#ltb").innerHTML = errH(e); });
    };
    var stt = function () {
      Promise.all([GET("/admin/cc/email/status"), c.st.cfg ? Promise.resolve(c.st.cfg) : GET("/admin/cc/email/config")]).then(function (x) {
        if (!alive(c) || c.st.tab !== "st") return; var s = x[0] || {}, cf = x[1] || {}, lc = s.last_check;
        var KS = { control_center: ["مفتاح محفوظ في لوحة التحكم", "Key saved in the Control Center"], worker_secret: ["سر الـ Worker (RESEND_API_KEY / BREVO_API_KEY)", "Worker secret (RESEND_API_KEY / BREVO_API_KEY)"], none: ["مفيش", "None"] };
        body(cardH(T("حالة المزوّد", "Provider status"), kvH([[T("المزوّد", "Provider"), s.provider || cf.provider || "—"], [T("مصدر المفتاح", "Key source"), KS[s.key_source] ? L2(KS[s.key_source]) : s.key_source || "—"], [T("الدومين", "Domain"), s.domain || "madeinegyptgate.com", "ltr"], [T("ربط SEND_EMAIL (احتياطي)", "SEND_EMAIL binding (fallback)"), cf.send_email_binding ? T("موجود", "Present") : T("مش موجود", "Absent")], [T("آخر فحص", "Last check"), lc ? fd(lc.at, true) + " · " + (lc.ok ? T("✓ تمام", "✓ OK") : T("✕ فيه مشكلة", "✕ problem")) + (lc.detail ? " — " + lc.detail : "") : T("لسه ماتعملش", "Not yet")]]) + (can("email.config") ? '<div class="acts2">' + btn("chk", h(T("فحص المفتاح (قراءة بس)", "Check the key (read-only)")), "l") + '</div><div id="chkr" class="sm"></div>' : "")));
      }, function (e) { if (alive(c)) body(errH(e)); });
    };
    var run = function () { $("#mtabs").innerHTML = tabs(); paintHead(); body(loadingH()); ({ cfg: cfg, tpl: tpl, log: function () { (c.st.tpls ? Promise.resolve() : GET("/admin/cc/email/templates").then(function (j) { c.st.tpls = j.items || []; }, function () {})).then(log); }, st: stt })[c.st.tab](); };
    c.on.mtab = function (b) { c.st.tab = b.getAttribute("data-v"); run(); };
    c.on.rf = run;
    c.on.mlsave = function (b) {
      var g = function (id) { var e = $("#ml_" + id); return e ? (e.type === "checkbox" ? (e.checked ? 1 : 0) : e.value) : ""; };
      var bodyX = { enabled: g("enabled") ? 1 : 0, provider: g("provider"), from_email: trim(g("from_email")), from_name: trim(g("from_name")), reply_to: trim(g("reply_to")), api_key: trim(g("api_key")) };
      if (!/@madeinegyptgate\.com$/i.test(bodyX.from_email)) { toast(L2(ERRS.invalid_from), 1); return; }
      if (bodyX.reply_to && !RX_EMAIL.test(bodyX.reply_to)) { toast(T("Reply-To لازم يكون إيميل صحيح", "Reply-To must be a valid e-mail"), 1); return; }
      if (bodyX.api_key && !(bodyX.provider === "brevo" ? /^xkeysib-/.test(bodyX.api_key) : /^re_/.test(bodyX.api_key))) { toast(L2(ERRS.invalid_key), 1); return; }
      b.disabled = true;
      PUT("/admin/cc/email/config", bodyX).then(function (r) { b.disabled = false; toast(T("تم الحفظ ✓", "Saved ✓") + (r && r.ready ? T(" — الإرسال جاهز", " — sending is ready") : "")); c.st.cfg = null; run(); }, function (e) { b.disabled = false; toast(errText(e), 1); });
    };
    c.on.mltest = function (b) { var to = trim($("#ml_to").value); if (!RX_EMAIL.test(to)) { toast(T("اكتب إيميل صحيح", "Enter a valid e-mail"), 1); return; } b.disabled = true; POST("/admin/cc/email/test", { to: to, lang: LANG }).then(function (r) { b.disabled = false; var ok = r && r.ok && r.sent; $("#ml_res").innerHTML = ok ? '<span class="ok">' + h(T("تم الإرسال ✓ افحص الصندوق", "Sent ✓ check the inbox") + (r.provider ? " (" + r.provider + ")" : "")) + "</span>" : '<span class="bad">' + h(T("ماتبعتش: ", "Not sent: ") + ((r && r.error) || "")) + "</span>"; }, function (e) { b.disabled = false; $("#ml_res").innerHTML = '<span class="bad">' + h(errText(e)) + "</span>" + errSmall(e); }); };
    c.on.tgl = function (b) { var k = b.getAttribute("data-k"), t0 = (c.st.tpls || []).filter(function (x) { return x.key === k; })[0]; if (!t0) return; b.disabled = true; PUT("/admin/cc/email/templates/" + enc(k), { enabled: t0.enabled ? 0 : 1 }).then(function () { toast(T("تم ✓", "Done ✓")); tpl(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.ted = function (b) { var t0 = c.st.tpls[+b.getAttribute("data-i")]; if (t0) tplEditor(t0, tpl); };
    c.on.tpv = function (b) { var t0 = c.st.tpls[+b.getAttribute("data-i")]; if (t0) tplPreview(t0.key, null, LANG); };
    c.ch.ltp = function (t) { logq.template = t.value; }; c.ch.lst2 = function (t) { logq.status = t.value; }; c.ch.lfr = function (t) { logq.from = t.value; }; c.ch.ltd = function (t) { logq.to_date = t.value; };
    c.on.lgo = function () { logq.to = trim($("#lto").value); logq.before = ""; logq.stack = []; log(); };
    c.on.lold = function () { logq.stack.push(logq.before); logq.before = c.st.next; log(); };
    c.on.lnew = function () { logq.before = logq.stack.pop() || ""; log(); };
    c.on.chk = function (b) { b.disabled = true; POST("/admin/cc/email/status/check").then(function (r) { b.disabled = false; $("#chkr").innerHTML = '<span class="' + (r && r.ok ? "ok" : "bad") + '">' + h((r && r.ok ? T("✓ المفتاح شغّال", "✓ The key works") : T("✕ المفتاح مش شغّال", "✕ The key does not work")) + (r && r.detail ? " — " + r.detail : "")) + "</span>"; }, function (e) { b.disabled = false; $("#chkr").innerHTML = '<span class="bad">' + h(errText(e)) + "</span>"; }); };
    shell(); run();
  };
  function tplEditor(t0, done) {
    var o = t0.overrides || {}, vars = (t0.vars || []).map(function (v) { return "{{" + v + "}}"; }).join(" ");
    var f = [F("subject_ar", "العنوان (عربي)", "Subject (Arabic)", "text", { max: 200, w: 1 }), F("subject_en", "العنوان (إنجليزي)", "Subject (English)", "text", { max: 200, w: 1, dir: "ltr" }), F("intro_ar", "مقدمة قبل النص (عربي)", "Intro before the body (Arabic)", "ta", { max: 2000, rows: 3 }), F("intro_en", "مقدمة (إنجليزي)", "Intro (English)", "ta", { max: 2000, rows: 3, dir: "ltr" }), F("outro_ar", "خاتمة بعد النص (عربي)", "Outro after the body (Arabic)", "ta", { max: 2000, rows: 3 }), F("outro_en", "خاتمة (إنجليزي)", "Outro (English)", "ta", { max: 2000, rows: 3, dir: "ltr" })]
      .concat(t0.body_editable ? [F("body_ar", "النص كامل (عربي)", "Full body (Arabic)", "ta", { max: 8000, rows: 6 }), F("body_en", "النص كامل (إنجليزي)", "Full body (English)", "ta", { max: 8000, rows: 6, dir: "ltr" })] : []);
    var bx = modal(mh(T("قالب: ", "Template: ") + (EN() ? t0.name_en || t0.key : t0.name_ar || t0.key)) + '<p class="mut sm">' + h(T("سيب الحقل فاضي عشان يستخدم النص الأصلي. المتغيّرات المتاحة: ", "Leave a field empty to keep the default text. Available variables: ")) + '<code dir="ltr">' + h(vars || "{{subject}}") + "</code></p>" + formH(f, o) + '<div class="ft2">' + btn("sv", h(T("حفظ", "Save")), "r") + btn("pv", h(T("معاينة", "Preview"))) + (can("email.test") ? '<input data-tt type="email" dir="ltr" placeholder="name@example.com" aria-label="' + h(T("إيميل التجربة", "Test e-mail")) + '" style="padding:8px;border:1px solid #CBD5E1;border-radius:8px">' + btn("ts", h(T("✉ إرسال تجريبي", "✉ Send a test"))) : "") + '<button type="button" class="btn l" data-x>' + h(T("إغلاق", "Close")) + '</button></div><div class="er" role="alert"></div>', { wide: true, on: {
      sv: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; PUT("/admin/cc/email/templates/" + enc(t0.key), v).then(function () { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓")); done && done(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + (e.j && e.j.vars ? ' <code dir="ltr">' + h(e.j.vars.join(", ")) + "</code>" : "") + errSmall(e); }); },
      pv: function () { tplPreview(t0.key, readForm(bx, f), LANG, true); },
      ts: function (b) { var to = trim($("[data-tt]", bx).value); if (!RX_EMAIL.test(to)) { $(".er", bx).textContent = T("اكتب إيميل صحيح", "Enter a valid e-mail"); return; } b.disabled = true; POST("/admin/cc/email/test", { to: to, template: t0.key, lang: LANG }).then(function (r) { b.disabled = false; $(".er", bx).innerHTML = r && r.sent ? '<span class="ok">' + h(T("تم الإرسال ✓", "Sent ✓")) + "</span>" : h(T("ماتبعتش: ", "Not sent: ") + ((r && r.error) || "")); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); }
    } });
  }
  /* the server's preview HTML made inert before it enters the sandboxed (no-scripts) iframe: script, iframe, object, embed, form,
     base, meta refresh and link elements are dropped, on* handlers and javascript:/data:/vbscript: URLs stripped (defence in depth) */
  var MAIL_DROP = "script,iframe,object,embed,form,base,meta[http-equiv],link";
  function mailSafe(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      $$(MAIL_DROP, doc).forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
      $$("*", doc).forEach(function (el) { [].slice.call(el.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*(javascript|data|vbscript):/i.test(a.value))) el.removeAttribute(a.name); }); });
      return "<!doctype html>" + doc.documentElement.outerHTML;
    } catch (e) { return ""; }
  }
  function tplPreview(key, overrides, lang, keepEditor) {
    var w = D.createElement("div");
    POST("/admin/cc/email/preview", { key: key, lang: lang, overrides: overrides || undefined }).then(function (j) {
      var html = j && j.html ? '<iframe class="mailp" sandbox="" title="' + h(T("معاينة الإيميل", "E-mail preview")) + '"></iframe>' : "";
      var bx = keepEditor ? null : modal(mh(T("معاينة: ", "Preview: ") + key) + '<p><b dir="auto">' + h(j.subject || "") + '</b></p><pre class="js" dir="auto">' + h(j.text || "") + "</pre>" + html, { wide: true });
      if (keepEditor) { var er = $("#bx .er"); if (er) er.innerHTML = '<div class="info"><b dir="auto">' + h(j.subject || "") + '</b><pre class="js" dir="auto">' + h(j.text || "") + "</pre></div>"; return; }
      var fr = $("iframe.mailp", bx); if (fr) fr.srcdoc = mailSafe(j.html);
    }, function (e) { if (keepEditor) { var er = $("#bx .er"); if (er) er.innerHTML = h(errText(e)) + errSmall(e); } else toast(errText(e), 1); });
    return w;
  }

  /* =====================================================================================================================
     settings — الإعدادات: the live key/value table + structured groups (public keys are published to the site)
     ===================================================================================================================== */
  var SGROUPS = [
    ["contact", "بيانات التواصل", "Contact details", [["contact_email", "إيميل التواصل", "Contact e-mail", "email"], ["support_email", "إيميل الدعم", "Support e-mail", "email"], ["hotline_display", "الخط الساخن (كما يظهر)", "Hotline (as shown)", "text"], ["hotline_tel", "الخط الساخن (للاتصال +20…)", "Hotline (dialling +20…)", "tel"], ["whatsapp_display", "واتساب (كما يظهر)", "WhatsApp (as shown)", "text"], ["whatsapp_number", "رقم الواتساب (أرقام بس: 2012…)", "WhatsApp number (digits: 2012…)", "tel"], ["address_ar", "العنوان بالعربي", "Address in Arabic", "ta"], ["address_en", "العنوان بالإنجليزي", "Address in English", "ta"]]],
    ["social", "حساباتنا", "Our accounts", [["social_facebook", "فيسبوك", "Facebook", "soc"], ["social_x", "X (تويتر)", "X (Twitter)", "soc"], ["social_instagram", "إنستجرام", "Instagram", "soc"], ["social_linkedin", "لينكدإن", "LinkedIn", "soc"], ["social_youtube", "يوتيوب", "YouTube", "soc"]]],
    ["operator", "بيانات المشغّل والفوترة", "Operator & billing", [["operator_ar", "اسم المشغّل بالعربي", "Operator name (Arabic)", "text"], ["operator_en", "اسم المشغّل بالإنجليزي", "Operator name (English)", "text"], ["operator_reg_ar", "بيانات التسجيل (عربي)", "Registration (Arabic)", "ta"], ["operator_reg_en", "بيانات التسجيل (إنجليزي)", "Registration (English)", "ta"], ["operator_url", "موقع المشغّل", "Operator website", "url"], ["tax_no", "الرقم الضريبي", "Tax number", "text"], ["cr_no", "رقم السجل التجاري", "Commercial register no.", "text"], ["vat_bp", "ضريبة القيمة المضافة %", "VAT %", "vat"], ["billing_email", "إيميل الفواتير", "Billing e-mail", "email"]]],
    ["manual", "الدفع اليدوي", "Manual payment", [["manual_pay_ar", "تعليمات التحويل (عربي): البنك، اسم الحساب، IBAN، إنستاباي", "Transfer instructions (Arabic): bank, account name, IBAN, InstaPay", "ta"], ["manual_pay_en", "تعليمات التحويل (إنجليزي)", "Transfer instructions (English)", "ta"]]]
  ];
  function setVal(t, v) { return t === "vat" ? (v === "" || v == null ? "" : String(+v / 100)) : v == null ? "" : String(v); }
  SEC.settings = function () {
    /* the transfer instructions say where customers send money: owner only (pay.config, «بوابة الدفع») — read-only here for everyone else */
    var c = CUR, WR = can("settings.write"), PAYEE = { manual_pay_ar: 1, manual_pay_en: 1 }, PAYW = WR && can("pay.config");
    head(T("الإعدادات", "Settings"), h(T("بيانات الموقع العامة — اللي بيتحفظ هنا بيتنشر على الموقع خلال دقيقة", "The site's public details — what you save here is published within a minute")), (WR ? btn("svs", h(T("💾 حفظ ونشر", "💾 Save & publish")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    var load = function () {
      setCt(loadingH());
      GET("/admin/cc/settings").then(function (j) {
        if (!alive(c)) return; c.st.j = j; var pub = j.public || {}, known = {};
        var html = SGROUPS.map(function (g) {
          var lock = g[0] === "manual" && !PAYW ? '<p class="mut sm">🔒 ' + h(T("تعليمات التحويل بيكتبها المالك بس من «بوابة الدفع» (هي اللي بتظهر للعملاء في صفحة الدفع وفي كل فاتورة).", "Only the owner sets the transfer instructions, in «Payment gateway» (they are what customers see on the payment page and on every invoice).")) + ' <a href="#payments">' + h(T("افتح «بوابة الدفع» ←", "Open «Payment gateway» →")) + "</a></p>" : "";
          return cardH(L2([g[1], g[2]]), lock + '<div class="fr">' + g[3].map(function (k) {
            known[k[0]] = 1; var v = setVal(k[3], pub[k[0]]), dis = WR && (!PAYEE[k[0]] || PAYW) ? "" : " disabled", id = "s_" + k[0];
            if (k[3] === "soc") return '<label for="' + id + '">' + h(L2([k[1], k[2]])) + '<input id="' + id + '" data-s="' + k[0] + '" data-t="url" dir="ltr" value="' + h(v === "-" ? "" : v) + '"' + dis + (v === "-" ? " disabled" : "") + '><span class="sw"><input type="checkbox" data-hide="' + k[0] + '"' + (v === "-" ? " checked" : "") + dis + " style=\"width:auto;display:inline\"> " + h(T("إخفاء الرابط", "Hide the link")) + '</span><div class="fe" data-fe="' + k[0] + '"></div></label>';
            if (k[3] === "ta") return '<label class="w" for="' + id + '">' + h(L2([k[1], k[2]])) + '<textarea id="' + id + '" data-s="' + k[0] + '" data-t="text" rows="2" dir="' + (/_en$/.test(k[0]) ? "ltr" : "auto") + '" maxlength="500"' + dis + ">" + h(v) + '</textarea><div class="fe" data-fe="' + k[0] + '"></div></label>';
            return '<label for="' + id + '">' + h(L2([k[1], k[2]])) + '<input id="' + id + '" data-s="' + k[0] + '" data-t="' + k[3] + '"' + (k[3] === "vat" ? ' type="number" min="0" max="50" step="0.01"' : "") + ' dir="' + (/^(email|url|tel|vat)$/.test(k[3]) || /_en$/.test(k[0]) ? "ltr" : "auto") + '" value="' + h(v) + '" maxlength="500"' + dis + '><div class="fe" data-fe="' + k[0] + '"></div></label>';
          }).join("") + "</div>");
        }).join("");
        var other = Object.keys(pub).filter(function (k) { return !known[k] && k !== "cats"; });
        if (other.length) html += cardH(T("مفاتيح عامة تانية", "Other public keys"), '<div class="fr">' + other.map(function (k) { return '<label>' + h(k) + '<input data-s="' + h(k) + '" data-t="text" dir="auto" value="' + h(typeof pub[k] === "object" ? JSON.stringify(pub[k]) : pub[k]) + '" maxlength="500"' + (WR ? "" : " disabled") + '><div class="fe" data-fe="' + h(k) + '"></div></label>'; }).join("") + "</div>");
        var cu = j.custom || [];
        html += '<div class="cd"><h3>' + h(T("الإعدادات (المفتاح / القيمة)", "Settings (key / value)")) + '</h3><div class="in"><div class="note">' + h(T("إعدادات عامة للموقع (اسم المفتاح والقيمة). مثال: contact_email ، whatsapp ، phone.", "General site settings (key name and value). Example: contact_email, whatsapp, phone.")) + "</div>" + (WR ? '<div class="acts2" style="margin-bottom:8px">' + btn("kvadd", h(T("➕ إعداد جديد", "➕ New setting")), "r s") + "</div>" : "") + '<div class="tbl-s">' + tableH([["المفتاح", "Key", function (r) { return '<b dir="ltr">' + h(r.k) + "</b>"; }], ["القيمة", "Value", function (r) { return '<span dir="auto">' + h(cut(r.v, 200)) + "</span>"; }], ["آخر تعديل", "Last change", function (r) { return (r.updated_at ? fdh(r.updated_at, true) : "—") + (r.updated_by ? '<br><small dir="ltr">' + h(r.updated_by) + "</small>" : ""); }]], cu, { count: cu.length, acts: function (r, i) { return WR ? '<button type="button" class="btn s l" data-a="kved" data-i="' + i + '">' + h(T("تعديل", "Edit")) + '</button> <button type="button" class="btn s d" data-a="kvdl" data-i="' + i + '">' + h(T("حذف", "Delete")) + "</button>" : ""; } }) + "</div></div></div>";
        setCt(html + '<div class="er" id="ser" role="alert"></div>');
        $$("[data-hide]").forEach(function (cb) { cb.addEventListener("change", function () { var inp = $('[data-s="' + cb.getAttribute("data-hide") + '"]'); inp.disabled = cb.checked; }); });
      }, function (e) { if (alive(c)) setCt(errH(e)); });
    };
    var check = function (k, t, v) {
      if (v === "" || v === "-") return "";
      if (t === "email" && !RX_EMAIL.test(v)) return T("بريد إلكتروني غير صحيح", "Invalid e-mail");
      if (t === "url" && !/^https:\/\/[^\s"'<>]+$/i.test(v)) return T("رابط https كامل", "A full https link");
      if (t === "tel" && !/^\+?\d{6,15}$/.test(v)) return T("أرقام بس (مع + اختياري)", "Digits only (optional +)");
      if (t === "vat" && !(+v >= 0 && +v <= 50)) return T("من 0 لـ 50", "0 to 50");
      if (v.length > 500) return T("أطول من 500 حرف", "Longer than 500 characters");
      return "";
    };
    c.on.rf = load;
    c.on.svs = function (b) {
      var pub = (c.st.j && c.st.j.public) || {}, out = {}, errs = {};
      $$("[data-s]").forEach(function (el) {
        var k = el.getAttribute("data-s"), t = el.getAttribute("data-t"), hid = $('[data-hide="' + k + '"]'), v = hid && hid.checked ? "-" : trim(el.value);
        if (PAYEE[k] && !PAYW) return;
        var e = check(k, t, v); if (e) { errs[k] = e; return; }
        if (t === "vat") v = v === "" ? "" : String(Math.round(+v * 100));
        if (str(v) !== str(pub[k] == null ? "" : typeof pub[k] === "object" ? JSON.stringify(pub[k]) : pub[k])) out[k] = v;
      });
      if (showErrs($("#ct"), errs)) return;
      if (!Object.keys(out).length) { toast(T("مفيش تغيير", "Nothing changed")); return; }
      b.disabled = true;
      PUT("/admin/cc/settings", { public: out }).then(function () { b.disabled = false; toast(T("اتنشر ✓ (يظهر على الموقع خلال دقيقة)", "Published ✓ (visible on the site within a minute)")); load(); }, function (e) { b.disabled = false; showErrs($("#ct"), serverErrs(e)); $("#ser").innerHTML = h(errText(e)) + errSmall(e); });
    };
    var kvForm = function (r) {
      var f = [F("k", "المفتاح", "Key", "text", { req: 1, max: 60, dir: "ltr", ro: !!r, check: function (v) { return /^[A-Za-z0-9_.-]{1,60}$/.test(v) ? "" : T("حروف إنجليزي وأرقام و _ . - بس", "Latin letters, digits and _ . - only"); } }), F("v", "القيمة", "Value", "ta", { max: 2000 })];
      var bx = modal(mh(r ? T("تعديل", "Edit") : T("إعداد جديد", "New setting")) + formH(f, r || {}) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { on: { ok: function (b) { var v = readForm(bx, f); if (r) v.k = r.k; if (showErrs(bx, validate(f, v))) return; b.disabled = true; PUT("/admin/cc/settings", { custom: [{ k: v.k, v: v.v }] }).then(function () { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓")); load(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); } } });
    };
    c.on.kvadd = function () { kvForm(null); };
    c.on.kved = function (b) { kvForm((c.st.j.custom || [])[+b.getAttribute("data-i")]); };
    c.on.kvdl = function (b) { var r = (c.st.j.custom || [])[+b.getAttribute("data-i")]; if (!r || !sure()) return; b.disabled = true; PUT("/admin/cc/settings", { delete: [r.k] }).then(function () { toast(T("تم الحذف", "Deleted")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    load();
  };

  /* =====================================================================================================================
     staff ➕ — الإدارة والصلاحيات (owner: any role; admin: editor / support / seo / data only) + the permission matrix (read-only) + the team boards (§12)
     ===================================================================================================================== */
  var PMX = [["stats.read", "الإحصائيات والعلامات", "Statistics & badges", "1111"], ["members.read", "قراءة الأعضاء", "Read members", "1101"], ["members.write", "تعديل الأعضاء وإضافتهم ودعوتهم", "Edit, add and invite members", "1100"], ["members.contact", "بيانات التواصل (الاسم، اللقب، التليفون، الشركة)", "Contact fields (name, title, phone, company)", "1101"], ["members.plan", "الباقة والانتهاء والحالة", "Plan, expiry, status", "1100"], ["members.delete", "أرشفة عضو", "Archive a member", "1000"], ["customers.read", "قراءة العملاء", "Read customers", "1101"], ["customers.write", "ملاحظات ووسوم العملاء", "Customer notes & tags", "1101"], ["directory.read", "قراءة الدليل", "Read the directory", "1111"], ["directory.write", "تعديل الدليل", "Edit the directory", "1110"], ["directory.verify", "التوثيق", "Verification badge", "1100"], ["directory.link", "ربط شركة بعضو", "Link a company to a member", "1100"], ["legacy.contacts", "تواصل النظام القديم", "Old-system contacts", "1101"], ["approvals.products", "موافقات المنتجات", "Product approvals", "1110"], ["approvals.company", "موافقات الشركات", "Company approvals", "1100"], ["orders.read", "قراءة الطلبات", "Read requests", "1101"], ["orders.reply", "«إحنا اللي هنرد»", "«We'll reply»", "1101"], ["orders.note", "ملاحظة داخلية", "Internal note", "1101"], ["orders.close", "قفل الطلب", "Close a request", "1101"], ["orders.rfq", "إدخال RFQ يدوي", "Manual RFQ entry", "1101"], ["orders.resend", "إعادة الإرسال", "Re-send", "1100"], ["orders.block", "الحظر", "Block", "1100"], ["content.read", "قراءة المحتوى", "Read content", "1111"], ["content.write", "تعديل المحتوى", "Edit content", "1110"], ["content.publish", "نشر المحتوى", "Publish content", "1110"], ["content.toggle", "إيقاف كل التعديلات المنشورة", "Pause every published edit", "1000"], ["media.upload", "رفع الصور", "Upload images", "1110"], ["media.delete", "حذف الصور", "Delete images", "1110"], ["plans.read", "قراءة الباقات", "Read plans", "1111"], ["plans.write", "تعديل الباقات والأسعار", "Edit plans & prices", "1100"], ["plans.sync", "مزامنة جنة وباسم", "Janna & Bassem sync", "1100"], ["pay.read", "قراءة الفواتير", "Read invoices", "1101"], ["pay.invoice", "إصدار وإلغاء وإعادة إرسال الفواتير", "Issue, void, re-send invoices", "1100"], ["pay.mark_paid", "تسجيل دفع يدوي", "Record a manual payment", "1100"], ["pay.config", "إعدادات بوابة الدفع والمفاتيح", "Gateway settings & keys", "1000"], ["email.read", "قراءة البريد", "Read e-mail settings", "1100"], ["email.templates", "قوالب الإيميل", "E-mail templates", "1100"], ["email.test", "إرسال تجريبي", "Test send", "1100"], ["email.config", "مزوّد البريد والمفتاح والمرسِل", "Mail provider, key, sender", "1000"], ["settings.read", "قراءة الإعدادات", "Read settings", "1111"], ["settings.write", "تعديل الإعدادات", "Edit settings", "1100"], ["seo.*", "SEO (عن طريق واجهة SEO)", "SEO (through the SEO API)", "1110"], ["staff.read", "قراءة الفريق", "Read the team", "1100"], ["staff.write", "إدارة الفريق (المدير: محرر/خدمة عملاء بس)", "Manage the team (admin: editor/support only)", "1100"], ["audit.read", "سجل العمليات", "Audit log", "1100"], ["audit.export", "تصدير سجل العمليات", "Export the audit log", "1000"], ["reports.read", "التقارير", "Reports", "1100"], ["reports.export", "تصدير التقارير", "Export reports", "1100"], ["wa.read", "متابعة الواتساب", "WhatsApp monitoring", "1101"], ["bassem.read", "متابعة باسم", "Bassem monitoring", "1101"], ["import.run", "الاستيراد من النظام القديم", "Import from the old system", "1000"]];
  SEC.staff = function () {
    var c = CUR, WR = can("staff.write"), OW = ST.role === "owner";
    head(T("الإدارة والصلاحيات", "Admins & roles"), h(T("الدخول للوحة دايماً بكود على الإيميل", "Sign-in to the panel is always by an e-mail code")), (WR ? btn("add", h(T("➕ إضافة عضو للفريق", "➕ Add a team member")), "r") : "") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))));
    setCt('<div class="cd"><div id="tb"></div></div>' + cardH(T("مصفوفة الصلاحيات", "Permission matrix"), '<div class="tbl-s"><table class="mx"><thead><tr><th>' + h(T("الصلاحية", "Permission")) + "</th>" + ["owner", "admin", "editor", "support"].map(function (r) { return "<th>" + h(roleName(r)) + "</th>"; }).join("") + "</tr></thead><tbody>" + PMX.map(function (p) { return "<tr><td>" + h(L2([p[1], p[2]])) + ' <small class="mut" dir="ltr">' + h(p[0]) + "</small></td>" + p[3].split("").map(function (x) { return "<td>" + (x === "1" ? "✓" : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>") + cardH(T("لوحات الفرق", "Team boards"), '<p class="mut sm">' + h(T("فريق الـ SEO وفريق الداتا مالهمش دخول على لوحة التحكم: كل فريق بيدخل لوحته بكود على الإيميل وبيشوف شغله بس.", "The SEO team and the data team have no access to this panel: each team signs in to its own board with an e-mail code and sees only its own work.")) + '</p><div class="acts"><a class="btn l" href="' + h(U("seo-team")) + '" target="_blank" rel="noopener">' + h(T("لوحة فريق الـ SEO ↗", "SEO team board ↗")) + '</a> <a class="btn l" href="' + h(U("data-desk")) + '" target="_blank" rel="noopener">' + h(T("لوحة فريق الداتا — مكتب الاستقبال ↗", "Data team front desk ↗")) + "</a></div>"));
    var roleOpts = function () { return (OW ? [["owner", ROLES.owner[0], ROLES.owner[1]], ["admin", ROLES.admin[0], ROLES.admin[1]]] : []).concat([["editor", ROLES.editor[0], ROLES.editor[1]], ["support", ROLES.support[0], ROLES.support[1]], ["seo", ROLES.seo[0], ROLES.seo[1]], ["data", ROLES.data[0], ROLES.data[1]]]); };
    var load = function () {
      var tb = $("#tb"); tb.innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      GET("/admin/cc/staff").then(function (j) {
        if (!alive(c)) return; var it = c.st.rows = j.items || [];
        tb.innerHTML = tableH([["البريد", "E-mail", function (r) { return '<b dir="ltr">' + h(r.email) + '</b><br><small dir="auto">' + h(r.name || "") + "</small>"; }], ["الدور", "Role", function (r) { return r.bootstrap ? tag(T("مالك (من الإعدادات)", "Owner (from the settings)"), "b") : tag(roleName(r.role)); }], ["أضافه", "Added by", function (r) { return '<small dir="ltr">' + h(r.added_by || "—") + "</small><br><small>" + h(r.added_at ? fd(r.added_at, true) : "") + "</small>"; }], ["آخر دخول", "Last sign-in", function (r) { return (r.last_seen_at ? fdh(r.last_seen_at, true) : "—"); }], ["الحالة", "Status", function (r) { return r.disabled_at ? tag(T("موقوف", "Disabled"), "x") : tag(T("نشط", "Active"), "ok"); }]], it, { count: it.length, empty: T("مفيش أعضاء في الفريق غير المالك.", "No team members besides the owner."), acts: function (r, i) { if (r.bootstrap || !WR) return ""; if (!OW && /^(owner|admin)$/.test(r.role)) return ""; return '<button type="button" class="btn s l" data-a="rl" data-i="' + i + '">' + h(T("تغيير الدور", "Change role")) + '</button> <button type="button" class="btn s l" data-a="ds" data-i="' + i + '">' + h(r.disabled_at ? T("تفعيل", "Enable") : T("إيقاف", "Disable")) + '</button> <button type="button" class="btn s d" data-a="rm" data-i="' + i + '">' + h(T("إزالة", "Remove")) + "</button>"; } });
      }, function (e) { if (alive(c)) tb.innerHTML = '<div style="padding:12px">' + errH(e) + "</div>"; });
    };
    c.on.rf = load;
    c.on.add = function () {
      var f = [F("email", "البريد الإلكتروني", "E-mail", "email", { req: 1 }), F("role", "الدور", "Role", "sel", { opts: roleOpts })];
      var bx = modal(mh(T("إضافة عضو للفريق", "Add a team member")) + '<p class="mut sm">' + h(T("بيوصله إيميل بالدور ورابط الدخول بكود. المدير يقدر يضيف محرر أو خدمة عملاء أو فريق الـ SEO أو فريق الداتا بس. فريق الـ SEO وفريق الداتا بيفتحوا لوحتهم بس، مش اللوحة دي.", "They get an e-mail with the role and the sign-in link. An admin can add editors, support, the SEO team or the data team only. The SEO and data teams open only their own board, not this panel.")) + "</p>" + formH(f, { role: "editor" }) + '<div class="ft2">' + btn("ok", h(T("إضافة", "Add")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { on: { ok: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; POST("/admin/cc/staff", { email: v.email, role: v.role }).then(function () { closeModal(); toast(T("اتضاف ✓ — وصله إيميل", "Added ✓ — an e-mail was sent")); load(); }, function (e) { b.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); } } });
    };
    c.on.rl = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r) return; var f = [F("role", "الدور", "Role", "sel", { opts: roleOpts })]; var bx = modal(mh(T("تغيير الدور: ", "Change role: ") + r.email) + formH(f, { role: r.role }) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er"></div>', { on: { ok: function (b2) { var v = readForm(bx, f); b2.disabled = true; PATCH("/admin/cc/staff/" + enc(r.member_id), { role: v.role }).then(function () { closeModal(); toast(T("تم ✓", "Done ✓")); load(); }, function (e) { b2.disabled = false; $(".er", bx).innerHTML = h(errText(e)) + errSmall(e); }); } } }); };
    c.on.ds = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r || (!r.disabled_at && !sure(T("إيقاف دخول ", "Disable panel access for ") + r.email + "؟"))) return; b.disabled = true; PATCH("/admin/cc/staff/" + enc(r.member_id), { disabled: !r.disabled_at }).then(function () { toast(T("تم ✓", "Done ✓")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    c.on.rm = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r || !sure(T("إزالة ", "Remove ") + r.email + T(" من فريق الإدارة؟", " from the admin team?"))) return; b.disabled = true; DEL("/admin/cc/staff/" + enc(r.member_id)).then(function () { toast(T("اتشال من الفريق", "Removed from the team")); load(); }, function (e) { b.disabled = false; toast(errText(e), 1); }); };
    load();
  };

  /* =====================================================================================================================
     audit ➕ — سجل العمليات (newest first; cursor paging; before/after redacted by the server)
     ===================================================================================================================== */
  SEC.audit = function () {
    var c = CUR, q = c.st.f = { actor: "", action: "", target_type: "", from: "", to: "", before: "", stack: [] };
    head(T("سجل العمليات", "Audit log"), h(T("كل تعديل في اللوحة: مين، إيه، قبل وبعد", "Every change in the panel: who, what, before and after")), '<input id="aa" dir="ltr" placeholder="' + h(T("المنفّذ (إيميل)", "Actor (e-mail)")) + '" value=""><input id="ac" dir="ltr" placeholder="' + h(T("الإجراء (مثال member.plan)", "Action (e.g. member.plan)")) + '">'
      + sel("at", [["", "كل الأنواع", "All targets"], ["member", "عضو", "Member"], ["content", "محتوى", "Content"], ["invoice", "فاتورة", "Invoice"], ["inquiry", "طلب", "Request"], ["settings", "إعدادات", "Settings"], ["plans", "باقات", "Plans"], ["staff", "فريق", "Staff"], ["email", "بريد", "E-mail"], ["pay", "دفع", "Payment"], ["import", "استيراد", "Import"]], "", T("الهدف", "Target")) + dateIn("afr", "", T("من تاريخ", "From")) + dateIn("ato", "", T("إلى تاريخ", "To")) + btn("go", h(T("بحث", "Search")), "r") + (can("audit.export") ? btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) : ""));
    setCt('<div class="cd"><div id="tb"></div><div class="pg" id="pgn"></div></div>');
    var path = function (withBefore) { return qs({ actor: q.actor, action: q.action, target_type: q.target_type, from: q.from, to: q.to, before: withBefore ? q.before : "", limit: 50 }); };
    var load = function () {
      var tb = $("#tb"); tb.innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      GET("/admin/cc/audit" + path(true)).then(function (j) {
        if (!alive(c)) return; var it = c.st.rows = j.items || []; c.st.next = j.next_before || "";
        tb.innerHTML = tableH([["الوقت", "Time", function (r) { return fdh(r.at, true); }], ["المنفّذ", "Actor", function (r) { return '<small dir="ltr">' + h(r.actor_email || r.actor_id || "") + "</small><br>" + tag(roleName(r.actor_role), "g"); }], ["الإجراء", "Action", function (r) { return '<b dir="ltr">' + h(r.action) + "</b>"; }], ["الهدف", "Target", function (r) { return '<small dir="ltr">' + h((r.target_type || "") + (r.target_id ? ":" + r.target_id : "")) + "</small>"; }], ["الملخص", "Summary", function (r) { return '<span dir="auto">' + h(cut(r.summary || "", 160)) + "</span>"; }]], it, { count: it.length, empty: T("مفيش عمليات بالفلتر ده.", "No operations match this filter."), acts: function (r, i) { return '<button type="button" class="btn s l" data-a="dt" data-i="' + i + '">' + h(T("تفاصيل", "Details")) + "</button>"; } });
        $("#pgn").innerHTML = (q.stack.length ? btn("nw", h(T("→ الأحدث", "→ Newer")), "l s") : "") + (c.st.next ? btn("ol", h(T("الأقدم ←", "Older ←")), "l s") : "");
      }, function (e) { if (alive(c)) tb.innerHTML = '<div style="padding:12px">' + errH(e) + "</div>"; });
    };
    var pj = function (s) { var v = s; try { v = typeof s === "string" ? JSON.parse(s) : s; } catch (e) {} return JSON.stringify(v, null, 1); };
    c.on.go = function () { q.actor = trim($("#aa").value); q.action = trim($("#ac").value); q.before = ""; q.stack = []; load(); };
    c.ch.at = function (t) { q.target_type = t.value; }; c.ch.afr = function (t) { q.from = t.value; }; c.ch.ato = function (t) { q.to = t.value; };
    c.on.ol = function () { q.stack.push(q.before); q.before = c.st.next; load(); };
    c.on.nw = function () { q.before = q.stack.pop() || ""; load(); };
    c.on.ex = function () { serverCsv("/admin/cc/audit.csv" + path(false), "audit"); };
    c.on.dt = function (b) { var r = c.st.rows[+b.getAttribute("data-i")]; if (!r) return; modal(mh(r.action) + kvH([[T("الوقت", "Time"), fd(r.at, true)], [T("المنفّذ", "Actor"), (r.actor_email || r.actor_id) + " (" + roleName(r.actor_role) + ")"], [T("الهدف", "Target"), (r.target_type || "") + ":" + (r.target_id || ""), "ltr"], [T("الملخص", "Summary"), r.summary], [T("رقم الطلب الداخلي", "Request id"), r.req_id, "ltr"]]) + '<div class="split"><div><b>' + h(T("قبل", "Before")) + '</b><pre class="js">' + h(pj(r.before_json != null ? r.before_json : r.before)) + "</pre></div><div><b>" + h(T("بعد", "After")) + '</b><pre class="js">' + h(pj(r.after_json != null ? r.after_json : r.after)) + "</pre></div></div>", { wide: true }); };
    load();
  };

  /* =====================================================================================================================
     reports ➕ — التقارير (real data only: GET /api/admin/cc/reports/summary + CSVs; tenders by governorate from the data files)
     ===================================================================================================================== */
  function barsH(list, lab, val, fmt) { var mx = Math.max.apply(null, list.map(val).concat([1])); return list.length ? list.map(function (x) { var v = val(x); return '<div class="hb"><span dir="auto">' + h(lab(x)) + '</span><span><i style="width:' + Math.max(2, Math.round(v / mx * 100)) + '%"></i></span><b>' + h(fmt ? fmt(v, x) : nf(v)) + "</b></div>"; }).join("") : '<p class="mut">' + h(T("لا توجد بيانات بعد.", "No data yet.")) + "</p>"; }
  SEC.reports = function () {
    var c = CUR, q = { from: "", to: "" }, EX = can("reports.export");
    head(T("التقارير", "Reports"), h(T("أرقام حقيقية بس — كل رقم من مصدره", "Real numbers only — every figure from its source")), dateIn("rfr", "", T("من تاريخ", "From")) + dateIn("rto", "", T("إلى تاريخ", "To")) + btn("go", h(T("عرض", "Show")), "r"));
    var csvB = function (ds) { return EX ? ' <button type="button" class="btn s l" data-a="csv" data-v="' + ds + '">⬇ CSV</button>' : ""; };
    var load = function () {
      setCt(loadingH());
      Promise.all([GET("/admin/cc/reports/summary" + qs(q)), need(["regions", "oldtend", "real"]).then(function () { return true; }, function () { return false; })]).then(function (x) {
        if (!alive(c)) return; var s = x[0] || {};
        var byGov = {}; (W.MIGTEND || []).forEach(function (t) { if (!t) return; var k = t[10] || ""; byGov[k] = (byGov[k] || 0) + 1; }); ((W.REAL && REAL.tenders) || []).forEach(function (t) { if (!t) return; var k = t.region_code || ""; byGov[k] = (byGov[k] || 0) + 1; });
        var gl = Object.keys(byGov).map(function (k) { return { gov: k, n: byGov[k] }; }).sort(function (a, b) { return b.n - a.n; }); c.st.gov = gl;
        setCt('<div class="gr">'
          + cardH(T("الطلبات في اليوم", "Requests per day"), barsH((s.inquiries_by_day || []).slice(-31), function (r) { return r.day; }, function (r) { return +r.n || 0; }), csvB("inquiries"))
          + cardH(T("الطلبات حسب النوع", "Requests by kind"), barsH(s.inquiries_by_kind || [], function (r) { return kindName(r.kind); }, function (r) { return +r.n || 0; }))
          + cardH(T("التسجيلات في اليوم", "Sign-ups per day"), barsH((s.signups_by_day || []).slice(-31), function (r) { return r.day; }, function (r) { return +r.n || 0; }), csvB("signups"))
          + cardH(T("الإيراد المدفوع في الشهر", "Paid revenue per month"), barsH(s.revenue_by_month || [], function (r) { return r.month; }, function (r) { return +r.total_minor || 0; }, function (v, r) { return money(v) + " · " + nf(r.n) + T(" فاتورة", " invoices"); }), csvB("invoices"))
          + cardH(T("الاشتراكات النشطة حسب الباقة", "Active subscriptions by plan"), barsH(s.active_by_plan || [], function (r) { return planName(r.plan) || T("بدون باقة", "No plan"); }, function (r) { return +r.n || 0; }), csvB("members"))
          + cardH(T("مشاهدات الصفحات في اليوم", "Page views per day"), barsH((s.pv_by_day || []).slice(-31), function (r) { return r.day; }, function (r) { return +r.views || 0; }, function (v, r) { return nf(v) + " · " + nf(r.uniq) + T(" زائر", " visitors"); }), csvB("pv"))
          + cardH(T("المناقصات حسب المحافظة (من بيانات الموقع)", "Tenders by governorate (site data)"), x[1] ? barsH(gl, function (r) { return govName(r.gov) || T("غير محددة", "Not specified"); }, function (r) { return r.n; }) : errH(E("data_file", T("ملفات المناقصات مش متاحة", "The tender data files are not available")), false), ' <button type="button" class="btn s l" data-a="gcsv">⬇ CSV</button>')
          + "</div>" + (EX ? cardH(T("ملفات كاملة", "Full exports"), '<div class="acts2">' + ["payments", "customers"].map(function (d) { return btn("csv", "⬇ " + h(d) + ".csv", "l s", ' data-v="' + d + '"'); }).join("") + "</div>") : ""));
      }, function (e) { if (alive(c)) setCt(errH(e)); });
    };
    c.ch.rfr = function (t) { q.from = t.value; }; c.ch.rto = function (t) { q.to = t.value; };
    c.on.go = load;
    c.on.csv = function (b) { var ds = b.getAttribute("data-v"); serverCsv("/admin/cc/reports/" + enc(ds) + ".csv" + qs(q), "report-" + ds); };
    c.on.gcsv = function () { csvSave("tenders-by-governorate", (c.st.gov || []).map(function (r) { return { governorate: r.gov, name: govName(r.gov), tenders: r.n }; })); };
    load();
  };

  /* =====================================================================================================================
     seo / keywords / redirects — the live SEO entities, now on the existing SEO layer (/api/seo/*, single writer of seo:bundle)
     ===================================================================================================================== */
  function seoErr(e) {
    if (!e) return errText(e);
    if (e.code === "offline") return T("مفيش اتصال بواجهة الـ SEO (‎/api/seo‎). اتأكد إن الموقع منشور على Cloudflare Pages مع الـ Functions.", "The SEO API (/api/seo) cannot be reached. Make sure the site is deployed on Cloudflare Pages with its Functions.");
    if (e.status === 401) return T("الجلسة انتهت. ادخل تاني.", "Your session ended. Please sign in again.");
    if (e.status === 403 && (e.code === "forbidden" || !e.code)) return T("هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط", "This workspace is for the platform team (admin or SEO role) only");
    if (e.code === "kv_off") return T("مخزن التعديلات (Workers KV باسم SEO_KV) مش مربوط بمشروع Cloudflare Pages.", "The edit store (Workers KV binding SEO_KV) is not bound to the Cloudflare Pages project.");
    if (e.code === "manifest_unavailable") return T("ملف البناء ‎/_seo/pages.json‎ مش منشور لسه. شغّل البناء الجديد وانشر الموقع.", "The build manifest /_seo/pages.json is not deployed yet. Run the new build and deploy.");
    if (e.code === "unknown_path") return T("المسار ده مش صفحة منشورة على الموقع.", "This path is not a published page of the site.");
    if (e.code === "redirect_loop") return T("التحويل ده هيعمل حلقة (loop).", "This redirect would create a loop.");
    if (e.code === "preview_read_only") return T("دي نسخة معاينة: الحفظ مقفول هنا.", "This is a preview deployment: saving is off here.");
    if (/لا يُسمح بأرقام الهاتف|not allowed on public pages/i.test(String(e.error || ""))) return L2(ERRS.invalid_contact);
    if (e.status === 503) return T("واجهة الـ SEO مش جاهزة دلوقتي.", "The SEO API is not ready right now.");
    return errText(e);
  }
  function seoErrH(e) { return '<div class="errc" role="alert">' + h(seoErr(e)) + errSmall(e) + '<div class="acts"><button type="button" class="btn l s" data-a="retry">↻ ' + h(T("حاول تاني", "Try again")) + '</button> <a class="btn l s" href="' + h(U("seo-admin")) + '" target="_blank" rel="noopener">' + h(T("مساحة SEO الكاملة ↗", "Full SEO workspace ↗")) + "</a></div></div>"; }
  function seoLink() { return '<a class="btn l" href="' + h(U("seo-admin")) + '" target="_blank" rel="noopener">' + h(T("مساحة SEO الكاملة ↗", "Full SEO workspace ↗")) + '</a> <a class="btn l" href="' + h(U("seo-team")) + '" target="_blank" rel="noopener">' + h(T("لوحة فريق الـ SEO ↗", "SEO team board ↗")) + "</a>"; }
  SEC.seo = function () {
    var c = CUR; c.st.q = ""; c.st.page = 0;
    head(T("SEO — بيانات الصفحات", "SEO — page data"), "", srch("") + btn("add", h(T("➕ صفحة SEO", "➕ SEO page")), "r") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) + seoLink());
    setCt('<div class="note">' + h(T("أي صفحة تسجّلها هنا بيتغيّر عنوانها ووصفها وcanonical وrobots على الموقع خلال دقيقة (طبقة الـ SEO على Cloudflare).", "Any page you record here gets its title, description, canonical and robots changed on the site within a minute (the SEO layer on Cloudflare).")) + "</div>" + listShell(""));
    var paint = function () {
      var v = (c.st.rows || []).filter(function (r) { return !c.st.q || (r.path + " " + (r.fields.title || "") + " " + (r.target_kw || "")).toLowerCase().indexOf(c.st.q.toLowerCase()) > -1; }); c.st.view = v;
      var lim = 50; $("#tb").innerHTML = tableH([["الصفحة", "Page", function (r) { return '<b dir="ltr">' + h(r.path) + "</b>"; }], ["العنوان", "Title", function (r) { return '<span dir="auto">' + h(r.fields.title || "—") + "</span>"; }], ["الكلمة الرئيسية", "Main keyword", function (r) { return '<span dir="auto">' + h(r.target_kw || "—") + "</span>"; }], ["الفهرسة", "Indexing", function (r) { var no = /noindex/.test(r.fields.robots || ""); return tag(no ? T("مخفي عن جوجل", "Hidden from Google") : T("مفهرس", "Indexed"), no ? "x" : ""); }]], v.slice(c.st.page * lim, c.st.page * lim + lim), { count: v.length, empty: T("لسه مفيش تعديلات SEO على صفحات.", "No SEO overrides yet."), acts: function (r) { var i = v.indexOf(r); return '<button type="button" class="btn s l" data-a="ed" data-i="' + i + '">' + h(T("تعديل", "Edit")) + '</button> <button type="button" class="btn s d" data-a="dl" data-i="' + i + '">' + h(T("حذف", "Delete")) + "</button>"; } });
      $("#pgn").innerHTML = pagerH(c.st.page, v.length, lim);
    };
    var load = function () { $("#tb").innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>"; GET("/seo/overrides").then(function (j) { if (!alive(c)) return; c.st.rows = (j.items || []).map(function (x) { x.fields = x.fields || {}; return x; }); paint(); }, function (e) { if (alive(c)) $("#tb").innerHTML = '<div style="padding:12px">' + seoErrH(e) + "</div>"; }); };
    c.q = function (v) { c.st.q = v; c.st.page = 0; paint(); }; c.page = function (d) { c.st.page = Math.max(0, c.st.page + d); paint(); };
    var form = function (r) {
      var f = [F("path", "الصفحة (المسار، مثال /rfq/)", "Page (path, e.g. /rfq/)", "text", { req: 1, max: 512, dir: "ltr", ro: !!r, check: function (v) { return v.charAt(0) === "/" ? "" : T("المسار لازم يبدأ بـ /", "The path must start with /"); } }), F("title", "عنوان SEO (حتى 60 حرفًا)", "SEO title (up to 60 characters)", "text", { max: 120, w: 1 }), F("description", "الوصف Meta description (حتى 160 حرفًا)", "Meta description (up to 160 characters)", "ta", { max: 320, rows: 3 }), F("h1", "عنوان H1", "H1 heading", "text", { max: 120, w: 1 }), F("target_kw", "الكلمة المفتاحية الرئيسية", "Main keyword", "text", { max: 120 }), F("secondary_kw", "كلمات ثانوية", "Secondary keywords", "tags"), F("og_image", "صورة المشاركة OG", "Share image (OG)", "text", { dir: "ltr", max: 500 }), F("canonical", "رابط canonical", "Canonical link", "text", { dir: "ltr", max: 512 }), F("robots", "الفهرسة", "Indexing", "sel", { opts: [["", "الافتراضي", "Default"], ["index,follow", "مفهرس", "Indexed"], ["noindex,follow", "مخفي عن جوجل", "Hidden from Google"]] })];
      var vals = r ? { path: r.path, title: r.fields.title || "", description: r.fields.description || "", h1: r.fields.h1 || "", target_kw: r.target_kw || "", secondary_kw: r.secondary_kw || [], og_image: r.fields.og_image || "", canonical: r.fields.canonical || "", robots: r.fields.robots || "" } : {};
      var bx = modal(mh(r ? T("تعديل", "Edit") : T("صفحة SEO", "SEO page")) + (r ? "" : '<label>' + h(T("ابحث في صفحات الموقع", "Search the site's pages")) + '<input data-pq dir="auto" placeholder="' + h(T("مثال: مناقصات", "e.g. tenders")) + '"></label><div data-pr class="sm"></div>') + formH(f, vals) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { wide: true, on: {
        pset: function (b) { $('[data-f="path"]', bx).value = b.getAttribute("data-v"); $("[data-pr]", bx).innerHTML = ""; },
        ok: function (b) {
          var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return;
          var body = { path: r ? r.path : v.path }; ["title", "description", "h1", "target_kw", "og_image", "canonical", "robots"].forEach(function (k) { if (!r || str(v[k]) !== str(vals[k])) body[k] = v[k]; }); if (!r || JSON.stringify(v.secondary_kw) !== JSON.stringify(vals.secondary_kw)) body.secondary_kw = v.secondary_kw;
          b.disabled = true;
          PATCH("/seo/page", body).then(function (j) { closeModal(); toast(T("تم الحفظ ✓ — بيظهر على الموقع خلال دقيقة", "Saved ✓ — visible on the site within a minute") + (j && j.warnings && j.warnings.length ? " · " + j.warnings.join(" · ") : "")); load(); }, function (e) { b.disabled = false; showErrs(bx, serverErrs(e)); $(".er", bx).innerHTML = h(seoErr(e)) + errSmall(e); });
        }
      } });
      var pq = $("[data-pq]", bx), tm = 0;
      if (pq) pq.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { var v = trim(pq.value); if (v.length < 2) { $("[data-pr]", bx).innerHTML = ""; return; } GET("/seo/pages" + qs({ q: v, limit: 10 })).then(function (j) { $("[data-pr]", bx).innerHTML = (j.items || []).map(function (p) { return '<button type="button" class="btn s l" style="margin:3px" data-a="pset" data-v="' + h(p.path) + '"><span dir="ltr">' + h(p.path) + "</span> " + h(cut(p.title || "", 50)) + "</button>"; }).join("") || h(T("مفيش نتايج.", "No results.")); }, function (e) { $("[data-pr]", bx).textContent = seoErr(e); }); }, 350); });
    };
    c.on.rf = load; c.on.add = function () { form(null); };
    c.on.ed = function (b) { form(c.st.view[+b.getAttribute("data-i")]); };
    c.on.dl = function (b) { var r = c.st.view[+b.getAttribute("data-i")]; if (!r || !sure(T("حذف تعديلات SEO للصفحة دي؟ الصفحة بترجع لبيانات البناء.", "Delete this page's SEO overrides? The page goes back to the build values."))) return; b.disabled = true; DEL("/seo/page?path=" + enc(r.path)).then(function () { toast(T("تم الحذف", "Deleted")); load(); }, function (e) { b.disabled = false; toast(seoErr(e), 1); }); };
    c.on.ex = function () { csvSave("seo", (c.st.view || []).map(function (r) { return { path: r.path, title: r.fields.title || "", description: r.fields.description || "", h1: r.fields.h1 || "", target_kw: r.target_kw || "", secondary_kw: (r.secondary_kw || []).join("|"), og_image: r.fields.og_image || "", canonical: r.fields.canonical || "", robots: r.fields.robots || "" }; })); };
    load();
  };
  SEC.keywords = function () {
    var c = CUR; c.st.q = "";
    head(T("SEO — تتبع الكلمات", "SEO — keyword tracking"), "", srch("") + btn("add", h(T("➕ كلمة جديدة", "➕ New keyword")), "r") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) + seoLink());
    setCt('<div class="note">' + h(T("«الترتيب» بييجي من بيانات Search Console لما تتستورد في مساحة SEO الكاملة — من غيرها بيظهر «—».", "«Rank» comes from Search Console data once it is imported in the full SEO workspace — without it it shows «—».")) + "</div>" + listShell(""));
    var paint = function () {
      var v = (c.st.rows || []).filter(function (r) { return !c.st.q || (r.target_kw + " " + r.target_url + " " + (r.name || "")).toLowerCase().indexOf(c.st.q.toLowerCase()) > -1; }); c.st.view = v;
      $("#tb").innerHTML = tableH([["الكلمة", "Keyword", function (r) { return '<b dir="auto">' + h(r.target_kw || r.cluster) + "</b>"; }], ["الترتيب", "Rank", function (r) { var p = c.st.rank[nfc(r.target_kw || "").toLowerCase()]; return h(p != null ? (Math.round(p * 10) / 10).toString() : "—"); }], ["الصفحة", "Page", function (r) { return '<span dir="ltr">' + h(r.target_url || "—") + "</span>"; }], ["ملاحظة", "Note", function (r) { return '<span dir="auto">' + h(r.name || "") + "</span>"; }]], v, { count: v.length, empty: T("لسه مفيش كلمات متابعة.", "No tracked keywords yet."), acts: function (r) { return '<button type="button" class="btn s l" data-a="ed" data-i="' + v.indexOf(r) + '">' + h(T("تعديل", "Edit")) + "</button>"; } });
    };
    var load = function () {
      $("#tb").innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>";
      Promise.all([GET("/seo/keywords"), GET("/seo/gsc").catch(function () { return { rows: [] }; })]).then(function (x) {
        if (!alive(c)) return; c.st.rows = x[0].items || []; c.st.rank = {};
        (x[1].rows || []).forEach(function (r) { if (r.kind === "query" && r.query) c.st.rank[nfc(r.query).toLowerCase()] = r.position; });
        paint();
      }, function (e) { if (alive(c)) $("#tb").innerHTML = '<div style="padding:12px">' + seoErrH(e) + "</div>"; });
    };
    var form = function (r) {
      var f = [F("target_kw", "الكلمة المفتاحية", "Keyword", "text", { req: 1, max: 120 }), F("target_url", "الصفحة المستهدفة (مسار)", "Target page (path)", "text", { dir: "ltr", max: 300, check: function (v) { return !v || v.charAt(0) === "/" ? "" : T("المسار لازم يبدأ بـ /", "The path must start with /"); } }), F("name", "ملاحظة", "Note", "text", { max: 120, w: 1 }), F("secondary_kw", "كلمات ثانوية", "Secondary keywords", "tags")];
      var bx = modal(mh(r ? T("تعديل", "Edit") : T("كلمة جديدة", "New keyword")) + formH(f, r || {}) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { on: { ok: function (b) { var v = readForm(bx, f); if (showErrs(bx, validate(f, v))) return; b.disabled = true; PUT("/seo/keywords", { cluster: r ? r.cluster : "kw-" + rid(8), target_kw: v.target_kw, target_url: v.target_url, name: v.name, secondary_kw: v.secondary_kw, difficulty: r ? r.difficulty || "" : "" }).then(function () { closeModal(); toast(T("تم الحفظ ✓", "Saved ✓")); load(); }, function (e) { b.disabled = false; showErrs(bx, serverErrs(e)); $(".er", bx).innerHTML = h(seoErr(e)) + errSmall(e); }); } } });
    };
    c.q = function (v) { c.st.q = v; paint(); };
    c.on.rf = load; c.on.add = function () { form(null); }; c.on.ed = function (b) { form(c.st.view[+b.getAttribute("data-i")]); };
    c.on.ex = function () { csvSave("keywords", (c.st.view || []).map(function (r) { return { cluster: r.cluster, target_kw: r.target_kw, target_url: r.target_url, name: r.name || "", secondary_kw: (r.secondary_kw || []).join("|") }; })); };
    load();
  };
  SEC.redirects = function () {
    var c = CUR; c.st.q = "";
    head(T("SEO — تحويلات 301", "SEO — 301 redirects"), "", srch("") + btn("add", h(T("➕ تحويل جديد", "➕ New redirect")), "r") + btn("rf", h(T("↻ تحديث", "↻ Refresh"))) + btn("ex", h(T("⬇ تصدير Excel", "⬇ Export Excel"))) + seoLink());
    setCt('<div class="note">' + h(T("التحويلات بتشتغل فوراً على الموقع (خلال دقيقة).", "Redirects work on the site right away (within a minute).")) + '</div><div id="rdb" class="mut sm"></div>' + listShell(""));
    var paint = function () {
      var v = (c.st.rows || []).filter(function (r) { return !c.st.q || (r.from + " " + r.to + " " + (r.note || "")).toLowerCase().indexOf(c.st.q.toLowerCase()) > -1; }); c.st.view = v;
      $("#tb").innerHTML = tableH([["من", "From", function (r) { return '<span dir="ltr">' + h(r.from) + "</span>"; }], ["إلى", "To", function (r) { return '<span dir="ltr">' + h(r.to || "—") + "</span>"; }], ["الكود", "Code", function (r) { return h(r.code); }], ["ملاحظة", "Note", function (r) { return '<small dir="auto">' + h(r.note || "") + "</small>"; }]], v, { count: v.length, empty: T("مفيش تحويلات مضافة من اللوحة.", "No redirects added from the panel."), acts: function (r) { var i = v.indexOf(r); return '<button type="button" class="btn s l" data-a="ed" data-i="' + i + '">' + h(T("تعديل", "Edit")) + '</button> <button type="button" class="btn s d" data-a="dl" data-i="' + i + '">' + h(T("حذف", "Delete")) + "</button>"; } });
    };
    var load = function () { $("#tb").innerHTML = '<div style="padding:18px">' + h(T("جارٍ التحميل…", "Loading…")) + "</div>"; GET("/seo/redirects").then(function (j) { if (!alive(c)) return; c.st.rows = j.admin || []; $("#rdb").textContent = j.build_count ? T("+ ", "+ ") + nf(j.build_count) + T(" تحويل جاي من البناء نفسه (مش بيتعدّل من هنا).", " redirects come from the build itself (not edited here).") : ""; paint(); }, function (e) { if (alive(c)) $("#tb").innerHTML = '<div style="padding:12px">' + seoErrH(e) + "</div>"; }); };
    var form = function (r) {
      var f = [F("from", "من (الرابط القديم)", "From (the old link)", "text", { req: 1, max: 512, dir: "ltr", w: 1, ro: !!r, check: function (v) { return v.charAt(0) === "/" ? "" : T("المسار لازم يبدأ بـ /", "The path must start with /"); } }), F("to", "إلى (الرابط الجديد)", "To (the new link)", "text", { max: 512, dir: "ltr", w: 1 }), F("code", "الكود", "Code", "sel", { opts: [["301", "301 — نهائي", "301 — permanent"], ["302", "302 — مؤقت", "302 — temporary"], ["410", "410 — اتشال", "410 — gone"]] }), F("note", "ملاحظة", "Note", "text", { max: 200 })];
      var bx = modal(mh(r ? T("تعديل", "Edit") : T("تحويل جديد", "New redirect")) + formH(f, r ? { from: r.from, to: r.to, code: String(r.code), note: r.note } : { code: "301" }) + '<div class="ft2">' + btn("ok", h(T("حفظ", "Save")), "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + '</button></div><div class="er" role="alert"></div>', { on: { ok: function (b) { var v = readForm(bx, f); if (r) v.from = r.from; var er = validate(f, v); if (v.code !== "410" && !v.to) er.to = T("مطلوب", "Required"); if (showErrs(bx, er)) return; b.disabled = true; POST("/seo/redirects", { from: v.from, to: v.code === "410" ? "" : v.to, code: +v.code, note: v.note || "" }).then(function (j) { closeModal(); toast(T("تم الحفظ ✓ — بيشتغل خلال دقيقة", "Saved ✓ — active within a minute") + (j && j.warnings && j.warnings.length ? " · " + j.warnings.join(" · ") : "")); load(); }, function (e) { b.disabled = false; showErrs(bx, serverErrs(e)); $(".er", bx).innerHTML = h(seoErr(e)) + errSmall(e); }); } } });
    };
    c.q = function (v) { c.st.q = v; paint(); };
    c.on.rf = load; c.on.add = function () { form(null); }; c.on.ed = function (b) { form(c.st.view[+b.getAttribute("data-i")]); };
    c.on.dl = function (b) { var r = c.st.view[+b.getAttribute("data-i")]; if (!r || !sure()) return; b.disabled = true; DEL("/seo/redirects?from=" + enc(r.from)).then(function () { toast(T("تم الحذف", "Deleted")); load(); }, function (e) { b.disabled = false; toast(seoErr(e), 1); }); };
    c.on.ex = function () { csvSave("redirects", (c.st.view || []).map(function (r) { return { from: r.from, to: r.to, code: r.code, note: r.note || "" }; })); };
    load();
  };

  /* =====================================================================================================================
     import ➕ — استيراد من النظام القديم (owner only, §1.5). The owner signs in to the OLD system from here: the browser calls
     the old PHP API on this same origin (api/index.php, proxied unchanged to Hostinger); the password goes only there and is never
     stored or sent to the new system. Rows are paged through a=admin_list, cleaned (every pass / secret / token / key field is
     dropped), previewed as a dry run, then applied as an idempotent upsert; SEO rows go through the existing SEO API.
     ===================================================================================================================== */
  var IENT = [["users", "الأعضاء والاشتراكات", "Members & subscriptions"], ["members", "الشركات", "Companies"], ["products", "المنتجات", "Products"], ["messages", "الطلبات والرسائل", "Requests & messages"], ["rfqs", "طلبات عروض المشترين (RFQ)", "Buyer RFQs"], ["settings", "الإعدادات", "Settings"], ["plans", "الباقات والصلاحيات", "Plans & permissions"], ["pay", "إعدادات بوابة الدفع", "Payment gateway settings"], ["mail", "إعدادات البريد", "E-mail settings"], ["seo", "SEO — بيانات الصفحات", "SEO — page data"], ["keywords", "SEO — تتبع الكلمات", "SEO — keywords"], ["redirects", "SEO — تحويلات 301", "SEO — 301 redirects"], ["items:tender", "المناقصات", "Tenders"], ["items:news", "الأخبار", "News"], ["items:video", "الفيديوهات", "Videos"], ["items:award", "الترسيات", "Awards"], ["items:project", "المشاريع", "Projects"], ["items:procurement", "أخبار المشتريات", "Procurement news"], ["items:event", "الفعاليات والمعارض", "Events"], ["items:banner", "البانرات", "Banners"]];
  var FORBID = /pass|secret|token|api_?key|smtp_pass/i;
  function clean(o) { if (Array.isArray(o)) return o.map(clean); if (!o || typeof o !== "object") return o; var x = {}; Object.keys(o).forEach(function (k) { if (FORBID.test(k) || /^(has|tail)_/.test(k)) return; x[k] = clean(o[k]); }); return x; }
  function oldApi(a, body) {
    return new Promise(function (res, rej) {
      var done = false, tm = setTimeout(function () { if (!done) { done = true; rej(E("offline", T("تعذّر الاتصال بالنظام القديم", "Could not reach the old system"))); } }, 30000);
      fetch("/api/index.php?a=" + encodeURIComponent(a), { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(function (r) {
        return r.json().then(function (j) { return { st: r.status, j: j || {} }; }, function () { return { st: r.status, j: null }; });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (!x.j) { rej(E("old_bad", T("النظام القديم رجّع رد مش مفهوم", "The old system returned an unreadable answer") + " (HTTP " + x.st + ")", x.st)); return; }
        if (x.st === 401 || x.st === 403) { rej(E("old_auth", T("البيانات غلط أو الحساب مش أدمن في النظام القديم", "Wrong details, or the account is not an admin in the old system"), x.st, x.j)); return; }
        if (x.st >= 500) { rej(E("old_down", T("النظام القديم مش بيرد دلوقتي", "The old system is not answering right now") + " (HTTP " + x.st + ")", x.st)); return; }
        res(x.j);
      }).catch(function () { if (done) return; done = true; clearTimeout(tm); rej(E("offline", T("تعذّر الاتصال بالنظام القديم", "Could not reach the old system"))); });
    });
  }
  function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function retry(fn, n) { return fn().catch(function (e) { if (n <= 0 || e.code === "old_auth") throw e; return pause(600).then(function () { return retry(fn, n - 1); }); }); }
  function oldPath(p) { p = trim(p); if (!p) return ""; if (/^https?:\/\//i.test(p)) { try { p = new URL(p).pathname; } catch (e) { return ""; } } if (p.charAt(0) !== "/") p = "/" + p; return p; }
  SEC["import"] = function () {
    var c = CUR, I = c.st.imp = { step: 1, opts: { overwrite: false, publish: false, redirects: true, settings_public: false }, sel: {}, old: {}, data: {}, prog: {}, dry: {}, fin: {}, failed: {}, stop: false, run: null, report: null };
    IENT.forEach(function (x) { I.sel[x[0]] = true; });
    head(T("استيراد من النظام القديم", "Import from the old system"), h(T("للمالك بس — بينقل بياناتك من النظام القديم للنظام الجديد من غير ما يمسح حاجة هناك", "Owner only — copies your data from the old system into the new one without deleting anything there")), btn("rf", h(T("↻ من الأول", "↻ Start over"))));
    var steps = function () { var L3 = [T("الاختيار", "Choose"), T("الدخول للنظام القديم", "Old-system sign-in"), T("سحب البيانات", "Fetch"), T("معاينة", "Preview"), T("تنفيذ", "Apply"), T("التقرير", "Report")]; return '<div class="steps">' + L3.map(function (t, i) { return '<span class="' + (I.step === i + 1 ? "on" : I.step > i + 1 ? "dn" : "") + '">' + (i + 1) + ". " + h(t) + "</span>"; }).join("") + "</div>"; };
    var paint = function (inner) { setCt(steps() + inner); };
    /* step 1: entities + options + previous runs */
    var s1 = function () {
      I.step = 1;
      paint('<div class="note">' + h(T("الاستيراد بيتعمل كذا مرة من غير تكرار (بيتعرّف على كل صف بالإيميل أو الاسم أو الرقم). مفيش أي إيميل أو واتساب بيتبعت لحد، ومفيش طلب بيتوزّع، وبيانات التواصل القديمة بتفضل للإدارة بس.", "The import can run again and again without duplicates (each row is matched by e-mail, name or id). No e-mail or WhatsApp is sent to anyone, no request is routed, and old contact data stays admin-only.")) + "</div>"
        + (CFG.legacy_panel ? '<p class="mut sm">' + h(T("لوحة الإدارة القديمة لسه شغّالة زي ما هي (مفيش حاجة بتتمسح هناك): ", "The old admin panel keeps working as it is (nothing is deleted there): ")) + '<a href="' + h(CFG.legacy_panel) + '" target="_blank" rel="noopener" dir="ltr">' + h(CFG.legacy_panel) + "</a></p>" : "")
        + cardH(T("إيه اللي يتنقل", "What to copy"), '<div class="kv">' + IENT.map(function (x) { return '<label class="chk"><input type="checkbox" data-ie="' + x[0] + '"' + (I.sel[x[0]] ? " checked" : "") + "> " + h(L2([x[1], x[2]])) + "</label>"; }).join("") + "</div>")
        + cardH(T("اختيارات", "Options"), '<label class="chk"><input type="checkbox" data-io="overwrite"' + (I.opts.overwrite ? " checked" : "") + "> " + h(T("استبدل التعديلات اللي اتعملت في النظام الجديد (لو مش متعلّم، الصفوف اللي اتعدّلت هنا بتتساب)", "Replace edits made in the new system (if unticked, rows edited here are skipped)")) + '</label><label class="chk"><input type="checkbox" data-io="publish"' + (I.opts.publish ? " checked" : "") + "> " + h(T("انشر المحتوى المستورد مباشرة (لو مش متعلّم بيدخل مسودات)", "Publish the imported content right away (if unticked it arrives as drafts)")) + '</label><label class="chk"><input type="checkbox" data-io="redirects"' + (I.opts.redirects ? " checked" : "") + "> " + h(T("فعّل التحويلات 301 المستوردة", "Activate the imported 301 redirects")) + '</label><label class="chk"><input type="checkbox" data-io="settings_public"' + (I.opts.settings_public ? " checked" : "") + "> " + h(T("طبّق بيانات التواصل القديمة (الإيميل والواتساب والتليفون) على الموقع", "Apply the old contact details (e-mail, WhatsApp, phone) to the site")) + "</label>")
        + '<div class="acts2">' + btn("i2", h(T("التالي: الدخول للنظام القديم ←", "Next: sign in to the old system →")), "r") + "</div>" + '<div id="iruns" style="margin-top:14px"></div>');
      GET("/admin/cc/import/runs").then(function (j) { var it = j.items || []; var el = $("#iruns"); if (!el || !alive(c)) return; el.innerHTML = cardH(T("مرات الاستيراد اللي فاتت", "Previous imports"), it.length ? '<div class="tbl-s">' + tableH([["الرقم", "Id", function (r) { return '<small dir="ltr">' + h(r.id) + "</small>"; }], ["بدأ", "Started", function (r) { return fdh(r.started_at, true); }], ["خلص", "Finished", function (r) { return (r.finished_at ? fdh(r.finished_at, true) : "—"); }], ["الحالة", "Status", function (r) { return tag(r.status, r.status === "applied" ? "ok" : r.status === "failed" ? "x" : "p"); }], ["الأرقام", "Counts", function (r) { var k = r.counts || r.counts_json || {}; if (typeof k === "string") { try { k = JSON.parse(k); } catch (e) { k = {}; } } return '<small dir="ltr">' + h(JSON.stringify(k).slice(0, 160)) + "</small>"; }]], it, {}) + "</div>" : '<p class="mut">' + h(T("لسه ماحصلش استيراد.", "No import yet.")) + "</p>"); }, function (e) { var el = $("#iruns"); if (el) el.innerHTML = errH(e, false); });
    };
    /* step 2: sign in to the OLD system (same origin); nothing is stored */
    var s2 = function (msg) {
      I.step = 2;
      paint(cardH(T("ادخل على النظام القديم", "Sign in to the old system"), '<p class="sm">' + h(T("إيميل وباسورد حساب الأدمن في النظام القديم. البيانات دي بتروح للنظام القديم بس ومابتتحفظش في أي مكان.", "The e-mail and password of your admin account in the old system. They go only to the old system and are never stored anywhere.")) + "</p>"
        + '<form id="iold" novalidate autocomplete="off"><div class="fr"><label>' + h(T("البريد الإلكتروني", "E-mail")) + '<input id="io_m" type="email" dir="ltr" autocomplete="username" required></label><label>' + h(T("كلمة المرور", "Password")) + '<input id="io_p" type="password" dir="ltr" autocomplete="current-password" required></label></div><div class="er bad" role="alert" style="margin-top:8px">' + h(msg || "") + '</div><div class="acts2" style="margin-top:10px"><button type="submit" class="btn r" id="io_go">' + h(T("دخول للنظام القديم", "Sign in to the old system")) + "</button>" + btn("i1", h(T("رجوع", "Back"))) + "</div></form>"));
      var f = $("#iold"); f.addEventListener("submit", function (ev) {
        ev.preventDefault(); var m = trim($("#io_m").value), pw = $("#io_p").value, er = $(".er", f); er.textContent = "";
        if (!RX_EMAIL.test(m) || !pw) { er.textContent = T("اكتب الإيميل والباسورد", "Enter the e-mail and password"); return; }
        $("#io_go").disabled = true;
        oldApi("login", { email: m, password: pw }).then(function (j) {
          pw = "";
          if (!j || j.ok !== true) throw E("old_auth", T("البيانات غلط أو الحساب مش أدمن في النظام القديم", "Wrong details, or the account is not an admin in the old system"));
          var pi = $("#io_p"); if (pi) pi.value = "";
          return discover();
        }).then(function () { s3(); }, function (e) {
          pw = "";
          /* the typed password is wiped when the old system refuses it; after a network failure it stays in the field so «دخول» can simply be pressed again */
          var pi = $("#io_p"); if (pi && e.code === "old_auth") pi.value = "";
          if (!alive(c)) return; var gb = $("#io_go"); if (gb) gb.disabled = false; er.textContent = e.error || errText(e);
        });
      });
      setTimeout(function () { var x = $("#io_m"); if (x) x.focus(); }, 30);
    };
    var discover = function () {
      return oldApi("admin_stats").then(function (j) {
        if (j && j.ok === false) throw E("old_auth", T("البيانات غلط أو الحساب مش أدمن في النظام القديم", "Wrong details, or the account is not an admin in the old system"));
        I.old.stats = j || {};
        var opt = function (a) { return oldApi(a).then(function (x) { return x && x.ok !== false ? x : null; }, function () { return null; }); };
        return Promise.all([opt("plans_get"), opt("pay_get"), opt("mail_get")]).then(function (x) { I.old.plans = x[0]; I.old.pay = x[1]; I.old.mail = x[2]; });
      });
    };
    /* step 3: page through admin_list (50 / page, 150 ms pause, 2 retries, stop button) */
    var ents = function () { return IENT.filter(function (x) { return I.sel[x[0]]; }); };
    var s3 = function () {
      I.step = 3; I.stop = false;
      var st = I.old.stats || {};
      paint(cardH(T("سحب البيانات من النظام القديم", "Fetching from the old system"), '<p class="sm mut">' + h(T("الأرقام في النظام القديم: ", "Totals in the old system: ")) + '<span dir="ltr">' + h(Object.keys(st).filter(function (k) { return typeof st[k] === "number"; }).map(function (k) { return k + " " + st[k]; }).join(" · ") || "—") + "</span></p>"
        + ents().map(function (x) { return '<div class="row"><span>' + h(L2([x[1], x[2]])) + '</span><span style="flex:1;max-width:320px"><div class="pb"><i data-pb="' + x[0] + '"></i></div></span><small data-pn="' + x[0] + '">' + h(T("مستني", "waiting")) + "</small></div>"; }).join("")
        + '<div class="acts2" style="margin-top:12px">' + btn("istop", h(T("⏹ إيقاف", "⏹ Stop")), "d") + "</div>"));
      var list = ents(), i = 0;
      (function next() {
        if (!alive(c) || I.step !== 3) return;
        if (I.stop || i >= list.length) { s4(); return; }
        var en = list[i++][0];
        fetchEnt(en).then(next, function (e) { I.failed[en] = e.error || errText(e); var pn = $('[data-pn="' + en + '"]'); if (pn) pn.innerHTML = '<span class="bad">' + h(T("فشل: ", "failed: ") + (e.error || errText(e))) + "</span>"; if (e.code === "old_auth") { s2(T("جلسة النظام القديم انتهت — ادخل تاني", "The old-system session ended — sign in again")); return; } next(); });
      })();
    };
    var prog = function (en, n, total, done2) { var pb = $('[data-pb="' + en + '"]'), pn = $('[data-pn="' + en + '"]'); if (pb) pb.style.width = (total ? Math.min(100, Math.round(n / total * 100)) : done2 ? 100 : 30) + "%"; if (pn) pn.textContent = nf(n) + (total ? " / " + nf(total) : "") + (done2 ? " ✓" : " …"); };
    var fetchEnt = function (en) {
      I.data[en] = []; delete I.failed[en];
      if (en === "plans") { I.data.plans = I.old.plans ? [clean({ keys: I.old.plans.keys, perms: I.old.plans.perms })] : []; prog(en, I.data.plans.length, 1, 1); return Promise.resolve(); }
      if (en === "pay" || en === "mail") { var cf = I.old[en] && (I.old[en].cfg || I.old[en]); I.data[en] = cf ? [clean(cf)] : []; prog(en, I.data[en].length, 1, 1); return Promise.resolve(); }
      var e0 = en, kind = "";
      if (/^items:/.test(en)) { e0 = "items"; kind = en.slice(6); }
      var page = 0, total = null;
      return (function more() {
        if (I.stop || !alive(c)) return Promise.resolve();
        return retry(function () { return oldApi("admin_list", { e: e0, q: "", page: page, kind: kind }); }, 2).then(function (j) {
          if (!j || j.ok === false) throw E("old_bad", (j && j.error) || T("النظام القديم رفض الطلب", "The old system refused the request"));
          var rows = j.rows || []; if (j.total != null) total = +j.total;
          I.data[en] = I.data[en].concat(rows.map(clean)); prog(en, I.data[en].length, total, false);
          page++;
          if (!rows.length || (total != null && I.data[en].length >= total) || page > 400) { prog(en, I.data[en].length, total, true); return; }
          return pause(150).then(more);
        });
      })();
    };
    /* transform for the new system (in the browser): rfq governorate codes, SEO paths through the build's redirect map */
    var prep = function () {
      return Promise.all([need(["regions"]).catch(function () {}), seoJson("redirects.json").catch(function () { return {}; }), GET("/seo/overrides").catch(function () { return { items: [] }; })]).then(function (x) {
        var exact = (x[1] && x[1].exact) || {}, have = {}; (x[2].items || []).forEach(function (o) { have[o.path] = 1; });
        var mapP = function (p) { p = oldPath(p); return exact[p] || exact[p.replace(/\/$/, "")] || p; };
        (I.data.rfqs || []).forEach(function (r) { if (!r.gov && r.city && W.MIGREG) r.gov = MIGREG.of(r.city) || ""; });
        /* key/value settings rows carry their secret in the VALUE (k = smtp_pass …): such rows are dropped entirely */
        I.data.settings = (I.data.settings || []).filter(function (r) { var k = str(r && (r.k || r.key)); return !FORBID.test(k) && !/^(has|tail)_/.test(k); });
        I.seoRows = (I.data.seo || []).map(function (r) { return { path: mapP(r.path), title: r.title || "", description: r.descr || r.description || "", h1: r.h1 || "", target_kw: r.kw || "", secondary_kw: String(r.kw2 || "").split(/[,،|]/).map(trim).filter(Boolean).join("|"), og_image: r.og || "", canonical: r.canonical || "", robots: r.robots === "noindex" ? "noindex,follow" : r.robots === "index" ? "index,follow" : r.robots || "" }; }).filter(function (r) { return r.path && r.path !== "/" + "" && (I.opts.overwrite || !have[r.path]); });
        I.seoSkipped = (I.data.seo || []).length - I.seoRows.length;
        I.rdRows = (I.data.redirects || []).map(function (r) { return { from: oldPath(r.src || r.from), to: mapP(r.dst || r.to), code: 301, note: "من النظام القديم" }; }).filter(function (r) { return r.from && r.to && r.from !== r.to; });
        I.kwRows = (I.data.keywords || []).map(function (r, i) { var id = String(r.id != null ? r.id : i + 1).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || String(i + 1); return { cluster: "old-" + id, name: r.kw || "", target_kw: r.kw || "", target_url: r.page ? mapP(r.page) : "", secondary_kw: [], difficulty: "" }; }).filter(function (r) { return r.target_kw; });
        I.kwArchive = (I.data.keywords || []).map(function (r, i) { return { legacy_id: r.id != null ? String(r.id) : String(i + 1), kw: r.kw || "", page: r.page || "", note: r.note || "", rank: r.rank != null ? String(r.rank) : "" }; });
      });
    };
    var csv = function (head0, rows) { return "﻿" + head0.join(",") + "\n" + rows.map(function (r) { return head0.map(function (k) { return csvCell(r[k]); }).join(","); }).join("\n"); };
    var OVH = ["path", "title", "description", "h1", "target_kw", "secondary_kw", "og_image", "canonical", "robots"], RDH = ["from", "to", "code", "note"];
    var chunks = function (a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
    var serverEnts = function () { return ents().map(function (x) { return x[0]; }).filter(function (en) { return !/^(seo|keywords|redirects)$/.test(en) && (I.data[en] || []).length; }); };
    var sumCounts = function (a, b) { ["create", "update", "unchanged", "conflict", "skip", "error"].forEach(function (k) { a[k] = (a[k] || 0) + (+((b || {})[k]) || 0); }); return a; };
    var runBatches = function (dry, store) {
      var jobs = []; serverEnts().forEach(function (en) { chunks(I.data[en], 50).forEach(function (ch, bi) { jobs.push({ en: en, rows: ch, bi: bi }); }); });
      var i = 0, failed = [];
      return (function next() {
        if (i >= jobs.length || !alive(c)) return Promise.resolve(failed);
        var jb = jobs[i++], pn = $("#iprog"); if (pn) pn.textContent = (dry ? T("معاينة ", "Preview ") : T("تنفيذ ", "Applying ")) + i + " / " + jobs.length + " · " + jb.en;
        return retry(function () { return POST("/admin/cc/import/runs/" + enc(I.run.id) + "/batch", { entity: jb.en, dry_run: dry, rows: jb.rows }, { timeout: 60000 }); }, 2).then(function (j) {
          var s = store[jb.en] = store[jb.en] || { counts: {}, results: [] }; sumCounts(s.counts, j.counts); (j.results || []).forEach(function (r) { r.batch = jb.bi; s.results.push(r); });
        }, function (e) { failed.push({ en: jb.en, bi: jb.bi, error: errText(e), e: e }); var s = store[jb.en] = store[jb.en] || { counts: {}, results: [] }; s.err = (s.err || []).concat([errText(e)]); }).then(next);
      })();
    };
    var seoRun = function (dry, store) {
      var tasks = [];
      if (I.sel.seo && I.seoRows.length) tasks.push(function () { return api("POST", "/seo/import" + qs({ kind: "overrides", dry_run: dry ? 1 : 0 }), undefined, { text: csv(OVH, I.seoRows), timeout: 60000 }).then(function (j) { store.seo = { counts: { create: j.create || 0, update: j.update || 0, unchanged: j.unchanged || 0, skip: I.seoSkipped || 0, error: (j.errors || []).length }, results: (j.errors || []).map(function (x) { return { i: x.line, action: "error", key: x.field, code: x.msg }; }), client: j }; }, function (e) { store.seo = { counts: { error: I.seoRows.length }, results: [], err: [seoErr(e)] }; }); });
      if (I.sel.redirects && I.rdRows.length) tasks.push(function () { if (!I.opts.redirects) { store.redirects = { counts: { skip: I.rdRows.length }, results: [], note: T("التحويلات مش متفعّلة (الاختيار مقفول) — محفوظة في التقرير بس", "Redirects not activated (option off) — kept in the report only") }; return Promise.resolve(); } return api("POST", "/seo/import" + qs({ kind: "redirects", dry_run: dry ? 1 : 0 }), undefined, { text: csv(RDH, I.rdRows), timeout: 60000 }).then(function (j) { store.redirects = { counts: { create: j.create || 0, update: j.update || 0, unchanged: j.unchanged || 0, error: (j.errors || []).length }, results: (j.errors || []).map(function (x) { return { i: x.line, action: "error", key: x.field, code: x.msg }; }), client: j }; }, function (e) { store.redirects = { counts: { error: I.rdRows.length }, results: [], err: [seoErr(e)] }; }); });
      if (I.sel.keywords && I.kwRows.length) tasks.push(function () { if (dry) { store.keywords = { counts: { create: I.kwRows.length }, results: [], note: T("الكلمات بتتضاف لمتابعة الكلمات؛ الترتيب القديم اليدوي مش بيتعرض كترتيب", "Keywords are added to keyword tracking; the old manual rank is not shown as a ranking") }; return Promise.resolve(); } return PUT("/seo/keywords", { items: I.kwRows }).then(function (j) { store.keywords = { counts: { create: I.kwRows.length }, results: [], client: { ok: !!(j && j.ok), count: I.kwRows.length } }; }, function (e) { store.keywords = { counts: { error: I.kwRows.length }, results: [], err: [seoErr(e)] }; }); });
      return tasks.reduce(function (p, t) { return p.then(t); }, Promise.resolve());
    };
    var countsH = function (store) {
      var all = ents().map(function (x) { return x[0]; });
      return '<div class="tbl-s">' + tableH([["البيانات", "Data", function (en) { var x = IENT.filter(function (y) { return y[0] === en; })[0]; return h(x ? L2([x[1], x[2]]) : en); }], ["صفوف", "Rows", function (en) { return h(nf(en === "seo" ? (I.data.seo || []).length : en === "keywords" ? (I.data.keywords || []).length : en === "redirects" ? (I.data.redirects || []).length : (I.data[en] || []).length)); }], ["جديد", "Create", function (en) { return h(nf(((store[en] || {}).counts || {}).create || 0)); }], ["تحديث", "Update", function (en) { return h(nf(((store[en] || {}).counts || {}).update || 0)); }], ["بدون تغيير", "Unchanged", function (en) { return h(nf(((store[en] || {}).counts || {}).unchanged || 0)); }], ["تعارض", "Conflict", function (en) { var n = ((store[en] || {}).counts || {}).conflict || 0; return n ? tag(nf(n), "p") : "0"; }], ["متساب", "Skipped", function (en) { return h(nf(((store[en] || {}).counts || {}).skip || 0)); }], ["أخطاء", "Errors", function (en) { var s = store[en] || {}, n = (s.counts || {}).error || 0; return (n ? tag(nf(n), "x") : "0") + (I.failed[en] ? '<br><small class="bad">' + h(I.failed[en]) + "</small>" : "") + (s.err ? '<br><small class="bad">' + h(s.err.join(" · ")) + "</small>" : "") + (s.note ? '<br><small class="mut">' + h(s.note) + "</small>" : ""); }]], all, {}) + "</div>";
    };
    var detailsH = function (store) {
      var rows = []; Object.keys(store).forEach(function (en) { ((store[en] || {}).results || []).forEach(function (r) { if (r.action !== "unchanged") rows.push({ en: en, r: r }); }); });
      if (!rows.length) return "";
      return '<details style="margin-top:10px"><summary>' + h(T("تفاصيل الصفوف (", "Row details (") + nf(rows.length) + ")") + '</summary><div class="tbl-s">' + tableH([["البيانات", "Data", function (x) { return h(x.en); }], ["المفتاح", "Key", function (x) { return '<small dir="auto">' + h(x.r.key || "") + "</small>"; }], ["الإجراء", "Action", function (x) { var a = x.r.action; return tag(a, a === "create" ? "ok" : a === "update" ? "b" : a === "conflict" ? "p" : a === "error" ? "x" : "g"); }], ["التغيير / ملاحظات", "Change / notes", function (x) { var d = x.r.diff ? Object.keys(x.r.diff).slice(0, 4).map(function (k) { return k + ": " + cut(str(x.r.diff[k][0]), 30) + " → " + cut(str(x.r.diff[k][1]), 30); }).join(" · ") : ""; return '<small dir="auto">' + h([d, (x.r.warnings || []).join(" · "), x.r.code || ""].filter(Boolean).join(" · ")) + "</small>"; }]], rows.slice(0, 500), {}) + "</div></details>";
    };
    /* step 4: dry run preview */
    var s4 = function () {
      I.step = 4;
      paint(cardH(T("معاينة (من غير ما يتغيّر أي حاجة)", "Preview (nothing changes yet)"), '<p id="iprog" class="sm" role="status">' + h(T("جارٍ التجهيز…", "Preparing…")) + "</p>"));
      prep().then(function () { return I.run ? I.run : POST("/admin/cc/import/runs", { note: "panel", options: I.opts }).then(function (j) { I.run = j.run; return I.run; }); }).then(function () {
        I.dry = {}; return runBatches(true, I.dry).then(function (failed) { I.dryFailed = failed; return seoRun(true, I.dry); });
      }).then(function () {
        if (!alive(c)) return;
        var conflicts = Object.keys(I.dry).reduce(function (a, en) { return a + (((I.dry[en] || {}).counts || {}).conflict || 0); }, 0);
        paint(cardH(T("معاينة", "Preview"), countsH(I.dry) + detailsH(I.dry)
          + (conflicts && !I.opts.overwrite ? '<div class="note">' + h(T("الصفوف اللي فيها «تعارض» اتعدّلت في النظام الجديد بعد آخر استيراد — هتتساب زي ما هي. علّم «استبدل التعديلات» من الأول لو عايز تكتب عليها.", "Rows marked «conflict» were edited in the new system after the last import — they will be left as they are. Tick «Replace edits» from the start if you want to overwrite them.")) + "</div>" : "")
          + ((I.dryFailed || []).length ? '<div class="alert">' + h(T("بعض الدفعات ماوصلتش للسيرفر: ", "Some batches did not reach the server: ") + I.dryFailed.map(function (x) { return x.en + " #" + (x.bi + 1); }).join("، ")) + "</div>" : "")
          + '<div class="acts2">' + btn("i5", h(T("✓ نفّذ الاستيراد", "✓ Apply the import")), "r") + btn("i3", h(T("↻ اسحب البيانات تاني", "↻ Fetch again"))) + "</div>"));
      }, function (e) { if (alive(c)) paint(errH(e) + '<div class="acts2">' + btn("i4", h(T("↻ إعادة المحاولة", "↻ Retry")), "r") + "</div>"); });
    };
    /* step 5: apply, then finish + report, then sign out of the old system */
    var s5 = function () {
      if (!sure(T("تنفيذ الاستيراد دلوقتي؟ مفيش حاجة بتتمسح في النظام القديم.", "Apply the import now? Nothing is deleted in the old system."))) return;
      I.step = 5; I.fin = {};
      paint(cardH(T("تنفيذ", "Applying"), '<p id="iprog" class="sm" role="status">' + h(T("جارٍ التنفيذ…", "Applying…")) + "</p>"));
      runBatches(false, I.fin).then(function (failed) { I.finFailed = failed; return seoRun(false, I.fin); }).then(function () {
        var posts = ["seo", "keywords", "redirects"].filter(function (en) { return I.fin[en]; }).map(function (en) { return function () { var cr = { counts: I.fin[en].counts, client: I.fin[en].client || null, note: I.fin[en].note || "", errors: I.fin[en].err || [] }; if (en === "keywords") cr.archive = I.kwArchive; if (en === "redirects" && !I.opts.redirects) cr.rows = I.rdRows; return POST("/admin/cc/import/runs/" + enc(I.run.id) + "/batch", { entity: en, client_result: cr }).catch(function () {}); }; });
        return posts.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
      }).then(function () { return POST("/admin/cc/import/runs/" + enc(I.run.id) + "/finish").then(function (j) { I.report = j.run || null; }, function (e) { I.report = { status: "failed", error: errText(e) }; }); }).then(function () {
        oldApi("logout").catch(function () {});
        s6();
      });
    };
    var s6 = function () {
      I.step = 6; if (!alive(c)) return;
      var rep = I.report || {}, ff = I.finFailed || [];
      var pay = (I.data.pay || [])[0], mail = (I.data.mail || [])[0];
      paint(cardH(T("التقرير", "Report"), '<p>' + h(T("حالة الاستيراد: ", "Import status: ")) + tag(rep.status || "—", rep.status === "applied" ? "ok" : rep.status === "partial" ? "p" : rep.status ? "x" : "g") + (rep.error ? ' <small class="bad">' + h(rep.error) + "</small>" : "") + "</p>" + countsH(I.fin) + detailsH(I.fin)
        + (ff.length ? '<div class="alert">' + h(T("دفعات فشلت: ", "Failed batches: ") + ff.map(function (x) { return x.en + " #" + (x.bi + 1) + " (" + x.error + ")"; }).join("، ")) + '</div><div class="acts2">' + btn("iretry", h(T("↻ أعد الدفعات اللي فشلت", "↻ Retry the failed batches")), "r") + "</div>" : "")
        + '<div class="acts2" style="margin-top:10px">' + btn("icsv", h(T("⬇ تنزيل التقرير CSV", "⬇ Download the report (CSV)"))) + "</div>")
        + cardH(T("المفاتيح لازم تتدخل من جديد", "Keys must be entered again"), '<p class="sm">' + h(T("النظام القديم مابيطلّعش المفاتيح السرية، فاتنقلت الإعدادات من غيرها وفضلت مقفولة لحد ما تدخّل المفاتيح هنا.", "The old system never reveals secret keys, so the settings were copied without them and stay switched off until you enter the keys here.")) + "</p>"
          + (pay ? '<h3>' + h(T("بوابة الدفع", "Payment gateway")) + " — " + h(pay.provider || "—") + '</h3><div class="fr"><label>API Key / Secret Key<input type="password" id="ik_pk" dir="ltr" autocomplete="new-password"></label><label>Webhook Secret<input type="password" id="ik_pw" dir="ltr" autocomplete="new-password"></label></div><div class="acts2">' + btn("ikp", h(T("حفظ مفاتيح الدفع", "Save the payment keys")), "r s") + '<a class="btn l s" href="#payments">' + h(T("افتح بوابة الدفع", "Open the payment gateway")) + "</a></div>" : "")
          + (mail ? "<h3>" + h(T("البريد", "E-mail")) + " — " + h(mail.provider || "—") + '</h3><div class="fr"><label>API Key (Resend re_… / Brevo xkeysib-…)<input type="password" id="ik_mk" dir="ltr" autocomplete="new-password"></label></div><div class="acts2">' + btn("ikm", h(T("حفظ مفتاح البريد", "Save the mail key")), "r s") + '<a class="btn l s" href="#mail">' + h(T("افتح البريد", "Open e-mail")) + "</a></div>" : "")
          + (!pay && !mail ? '<p class="mut">' + h(T("مفيش إعدادات دفع أو بريد اتنقلت.", "No payment or e-mail settings were copied.")) + "</p>" : "") + '<div id="ikres" class="sm"></div>'));
    };
    c.on.rf = function () { rerun(); };
    c.on.i1 = s1; c.on.i2 = function () { $$("[data-ie]").forEach(function (x) { I.sel[x.getAttribute("data-ie")] = x.checked; }); $$("[data-io]").forEach(function (x) { I.opts[x.getAttribute("data-io")] = x.checked; }); if (!ents().length) { toast(T("اختار حاجة واحدة على الأقل", "Choose at least one item"), 1); return; } s2(); };
    c.on.i3 = s3; c.on.i4 = s4; c.on.i5 = s5;
    c.on.istop = function (b) { I.stop = true; b.disabled = true; toast(T("هيقف بعد الصفحة الحالية", "Stopping after the current page")); };
    c.on.iretry = function (b) {
      var ff = (I.finFailed || []).slice(); if (!ff.length) return; b.disabled = true; I.finFailed = [];
      ff.reduce(function (p, x) { return p.then(function () { var rows = chunks(I.data[x.en], 50)[x.bi] || []; return POST("/admin/cc/import/runs/" + enc(I.run.id) + "/batch", { entity: x.en, dry_run: false, rows: rows }).then(function (j) { var s = I.fin[x.en] = I.fin[x.en] || { counts: {}, results: [] }; sumCounts(s.counts, j.counts); s.err = []; (j.results || []).forEach(function (r) { s.results.push(r); }); }, function (e) { I.finFailed.push({ en: x.en, bi: x.bi, error: errText(e) }); }); }); }, Promise.resolve()).then(function () { return POST("/admin/cc/import/runs/" + enc(I.run.id) + "/finish").then(function (j) { I.report = j.run || I.report; }, function () {}); }).then(s6);
    };
    c.on.icsv = function () { var out = []; Object.keys(I.fin).forEach(function (en) { ((I.fin[en] || {}).results || []).forEach(function (r) { out.push({ entity: en, i: r.i, key: r.key || "", action: r.action, target_id: r.target_id || "", code: r.code || "", warnings: (r.warnings || []).join(" | ") }); }); var cn = (I.fin[en] || {}).counts || {}; out.push({ entity: en, i: "", key: "TOTAL", action: JSON.stringify(cn), target_id: "", code: "", warnings: "" }); }); csvSave("import", out, ["entity", "i", "key", "action", "target_id", "code", "warnings"]); };
    c.on.ikp = function (b) {
      var k = trim($("#ik_pk").value), w = trim($("#ik_pw").value); if (!k && !w) { toast(T("اكتب مفتاح الأول", "Enter a key first"), 1); return; } b.disabled = true;
      GET("/admin/cc/pay/config").then(function (j) { var f = j.fields || {}; return PUT("/admin/cc/pay/config", { enabled: j.enabled ? 1 : 0, provider: j.provider || "", mode: j.mode || "test", currency: "EGP", merchant_id: f.merchant_id || "", outlet_id: f.outlet_id || "", api_key: k, webhook_secret: w, success_url: f.success_url || "", fail_url: f.fail_url || "", notes: f.notes || "", integration_ids: f.integration_ids || "", public_key: f.public_key || "", host: f.host || "", manual_fallback: f.manual_fallback ? 1 : 0, manual_ar: f.manual_ar || "", manual_en: f.manual_en || "" }); }).then(function () { $("#ik_pk").value = ""; $("#ik_pw").value = ""; b.disabled = false; $("#ikres").innerHTML = '<span class="ok">' + h(T("اتحفظت مفاتيح الدفع مشفّرة ✓ — فعّل البوابة من «بوابة الدفع» لما تجهز", "Payment keys saved encrypted ✓ — enable the gateway in «Payment gateway» when ready")) + "</span>"; }, function (e) { b.disabled = false; $("#ikres").innerHTML = '<span class="bad">' + h(errText(e)) + "</span>" + errSmall(e); });
    };
    c.on.ikm = function (b) {
      var k = trim($("#ik_mk").value); if (!k) { toast(T("اكتب المفتاح الأول", "Enter the key first"), 1); return; } b.disabled = true;
      GET("/admin/cc/email/config").then(function (j) { return PUT("/admin/cc/email/config", { enabled: j.enabled ? 1 : 0, provider: j.provider || "resend", from_email: j.from_email || "noreply@madeinegyptgate.com", from_name: j.from_name || "منصة صنع في مصر", reply_to: j.reply_to || "info@madeinegyptgate.com", api_key: k }); }).then(function () { $("#ik_mk").value = ""; b.disabled = false; $("#ikres").innerHTML = '<span class="ok">' + h(T("اتحفظ مفتاح البريد مشفّر ✓", "Mail key saved encrypted ✓")) + "</span>"; }, function (e) { b.disabled = false; $("#ikres").innerHTML = '<span class="bad">' + h(errText(e)) + "</span>" + errSmall(e); });
    };
    s1();
  };

  /* ---------- section files (data/acc-dev.js «🛠️ المطوّر»): a script loaded after this one calls MIGACC.use(function (X) { … }) and
     gets the panel's own primitives (transport with the session, errors, cards, tables, tabs, modal, typed confirm, state) plus
     X.section(key, {ar, en, group, group_en, perm, run}) — the item joins the navigation group whose Arabic title is `group` (default
     «النظام»; a new group otherwise) and opens like every built-in section (#key/arg, CUR.on / CUR.ch handlers). The server checks every
     permission again: a section file adds pages, never rights. window.MIGACC_PLUGINS = [fn] queues files loaded before this one. ---------- */
  function addSection(k, o) {
    if (!k || !/^[\w-]{1,40}$/.test(k) || SEC[k] || NAVP[k] || !o || typeof o.run !== "function" || !o.perm) return false;
    var gn = o.group || "النظام", g = null;
    for (var i = 0; i < GR.length; i++) if (GR[i][0] === gn) g = GR[i];
    if (!g) { g = [gn, o.group_en || gn, []]; GR.push(g); }
    g[2].push([k, o.ar || k, o.en || o.ar || k, "", o.perm]); NAVP[k] = o.perm; NAVL[k] = [o.ar || k, o.en || o.ar || k]; SEC[k] = o.run;
    if (ST.me) { navPaint(); if (new RegExp("^#" + k + "(/|$)").test(location.hash || "") && (!CUR || CUR.key !== k)) route(true); }
    return true;
  }
  var XAPI = { W: W, D: D, CFG: CFG, T: T, L2: L2, EN: EN, h: h, $: $, $$: $$, ls: ls, U: U, own: own, str: str, trim: trim, enc: enc, qs: qs, nf: nf, fd: fd, fdh: fdh, cut: cut, safeUrl: safeUrl, lnk: lnk, today: today, roleName: roleName,
    GET: GET, POST: POST, PUT: PUT, PATCH: PATCH, DEL: DEL, E: E, ERRS: ERRS, errText: errText, errSmall: errSmall, errH: errH,
    toast: toast, head: head, setCt: setCt, loadingH: loadingH, btn: btn, tag: tag, cardH: cardH, kvH: kvH, tabsH: tabsH, tableH: tableH, emptyRow: emptyRow, csvSave: csvSave,
    modal: modal, mh: mh, closeModal: closeModal, sure: sure, typed: typed,
    can: can, role: function () { return ST.role; }, me: function () { return ST.me; }, features: function () { return ST.features || {}; },
    cur: function () { return CUR; }, alive: alive, rerun: rerun, go: go, section: addSection };
  function use(fn) { if (typeof fn !== "function") return false; try { fn(XAPI); return true; } catch (e) { if (W.console) console.warn("acc section file", e); return false; } }

  /* ---------- public surface (tests and the console); start ---------- */
  W.MIGACC = { v: 1, go: go, boot: boot, use: use, state: function () { return { role: ST.role, perms: ST.perms.slice(), section: CUR && CUR.key }; }, nav: function () { return GR.map(function (g) { return [g[0], g[2].map(function (x) { return [x[0], x[1]]; })]; }); }, lang: setLang };
  (Object.prototype.toString.call(W.MIGACC_PLUGINS) === "[object Array]" ? W.MIGACC_PLUGINS : []).forEach(use);
  W.MIGACC_PLUGINS = { push: use };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
})();
