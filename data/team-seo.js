/* «لوحة فريق الـ SEO» — seo-team.html → /seo-team/ (ACC-CONTRACT §12.2). ES5, no dependencies.
   A deliberately SIMPLE board for the SEO team that works by hand: big tabs — الصفحات (search a page, see its current title and
   description, edit them with a live Google preview and length counters), الكلمات المفتاحية, التحويلات 301, الفحص (pages whose title or
   description is missing, too short or too long) and الأرشفة (sitemaps + IndexNow). The full workspace stays at /seo-admin/.
   It talks ONLY to the existing SEO API /api/seo/* (functions/_lib/seo-api.js), exactly like seo-admin.html:
     GET /health · GET /pages?q=&lang=&issue=&limit=&offset= · GET /page?path= · PATCH /page {path, title?, description?, h1?, target_kw?,
     ping_indexnow?} ("" = back to the build value) · DELETE /page?path= · GET|PUT /keywords · GET|POST|DELETE /redirects · GET /test?url=
     · GET /config · POST /indexnow/key · POST /indexnow {since?|urls?|all?} · GET /indexnow/log
   Who: roles seo | editor | admin | owner (GET /api/me → user.role; the SEO API checks the token and the role again on every call).
   Anyone else → the live lock box «غير مصرّح لك بدخول هذه الصفحة». Signed out → the e-mail-code sign-in (window.MIGAPI.open).
   When /api/seo cannot be reached, the board says so honestly and can show a READ-ONLY report from the public build manifest
   (/_seo/pages.json, the seo manifest); nothing can be saved then. Nothing is shown as saved without the server's answer. */
(function () {
  "use strict";
  if (window.__MIG_SEOTEAM) return; window.__MIG_SEOTEAM = 1;
  var EN = window.MIGLANG === "en";
  function T(a, e) { return EN ? e : a; }
  var A = window.MIGAPI || null;
  var BASE = String(window.SEO_API_BASE || "/api/seo").replace(/\/+$/, "");
  var SITE0 = "https://madeinegyptgate.com";
  var app = document.getElementById("tmApp"), whoEl = document.getElementById("tmWho");
  if (!app) return;
  window.__seoDone = 1;
  if (EN) {
    var h1 = document.getElementById("tmH1"), ld = document.getElementById("tmLead"), cr = document.getElementById("tmCrumb");
    if (h1) h1.textContent = "SEO team board";
    if (ld) ld.textContent = "Page titles and descriptions in Google, keywords, 301 redirects, page checks and indexing — for the SEO team that works by hand.";
    if (cr) cr.innerHTML = '<a href="/">Home</a> › <span>SEO team board</span>';
    try { document.title = "SEO team board – Made in Egypt Gate"; } catch (e) {}
  }
  try { if (!window.sessionStorage.getItem("janna-stage")) window.sessionStorage.setItem("janna-stage", "1"); } catch (e) {}
  var OK_ROLES = { seo: 1, editor: 1, admin: 1, owner: 1 };
  var TABS = [["pages", "📄", "الصفحات", "Pages"], ["keywords", "🎯", "الكلمات المفتاحية", "Keywords"], ["redirects", "↪️", "التحويلات 301", "301 redirects"], ["check", "🩺", "الفحص", "Check"], ["index", "🗺️", "الأرشفة", "Indexing"]];
  var S = { mode: "boot", user: null, role: "", health: null, cfg: null, tab: "pages", pg: { q: "", lang: "", offset: 0, limit: 30 }, ed: null, kw: null, rd: null, rdq: "", chk: { kind: "title", cat: "", lang: "", data: {} }, inx: null, local: null, sm: null };
  var RENDER = {};

  /* ---------- helpers ---------- */
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function nf(n) { n = +n || 0; try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }
  function clen(s) { s = String(s == null ? "" : s); var m = s.match(/[\uD800-\uDBFF]/g); return m ? s.length - m.length : s.length; }
  function plain(v) { return v == null ? "" : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); }
  function cut(s, n) { s = String(s == null ? "" : s); return clen(s) > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + " …" : s; }
  function fd(v) {
    if (v == null || v === "") return "—"; var d = new Date(String(v)); if (isNaN(d.getTime())) return esc(v);
    var o = { year: "numeric", month: "short", day: "numeric" }; if (!/^\d{4}-\d\d-\d\d$/.test(String(v))) { o.hour = "2-digit"; o.minute = "2-digit"; }
    try { return esc(new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", o).format(d)); } catch (e) { return esc(String(v).slice(0, 16).replace("T", " ")); }
  }
  function normPath(p) {
    var s = String(p == null ? "" : p).trim();
    if (/^https?:\/\//i.test(s)) { try { s = new URL(s).pathname; } catch (e) { return "/"; } }
    var c = s.search(/[?#]/); if (c >= 0) s = s.slice(0, c);
    try { s = decodeURIComponent(s); } catch (e) { /* keep */ }
    if (s.normalize) s = s.normalize("NFC");
    return s.charAt(0) === "/" ? s : "/" + s;
  }
  function encP(p) { try { return encodeURI(p); } catch (e) { return p; } }
  function site() { return String((S.health && S.health.site) || SITE0).replace(/\/+$/, ""); }
  function host() { try { return new URL(site()).host; } catch (e) { return "madeinegyptgate.com"; } }
  function token() { return (A && A.token && A.token()) || ""; }
  /* the team role /api/me tells (integration patch P-TEAM-6 adds user.staff_role; "" = no staff role) → a role, "" (none) or undefined
     (/api/me does not say: ask the SEO API itself, exactly like seo-admin.html) */
  function hintOf(u) {
    if (!u) return undefined;
    if (own(u, "staff_role")) return String(u.staff_role || "").toLowerCase();
    var r = String(u.cc_role || u.team_role || u.role || "").toLowerCase();
    return /^(owner|admin|data|seo|editor|support)$/.test(r) ? r : undefined;
  }
  function roleName(r) { return ({ owner: T("المالك", "Owner"), admin: T("مدير", "Admin"), seo: T("فريق الـ SEO", "SEO team"), editor: T("محرر", "Editor"), data: T("فريق الداتا", "Data team"), platform: T("مفتاح المنصة", "Platform key") })[r] || T("عضو", "Member"); }
  function ro() { return S.mode !== "ready"; }
  function dis() { return ro() ? " disabled" : ""; }
  function loading(t) { return '<p class="tm-load">⏳ ' + esc(t || T("جارٍ التحميل…", "Loading…")) + "</p>"; }
  function chip(t, cls) { return '<span class="tm-c' + (cls ? " " + cls : "") + '">' + esc(t) + "</span>"; }
  function toast(m) { if (A && A.ui && A.ui.toast) A.ui.toast(m); }
  function panel() { return document.getElementById("tmPanel"); }
  /* how long until every edge location shows a change (the API's own figure), else two minutes */
  function soon(sec) { var s = +sec || ((S.health && +S.health.edge_ttl_s) ? +S.health.edge_ttl_s + 60 : 120), m = Math.max(1, Math.ceil(s / 60)); return m <= 1 ? T("خلال دقيقة", "within a minute") : m === 2 ? T("خلال دقيقتين", "within two minutes") : T("خلال " + m + " دقائق", "within " + m + " minutes"); }
  /* length rules of the SEO score (functions/_lib/seo-score.js): title 30–60 (61–65 close), description 70–160 */
  function lenCls(n, k) { if (k === "title") return n >= 30 && n <= 60 ? "g" : n >= 61 && n <= 65 ? "a" : "r"; if (k === "description") return n >= 70 && n <= 160 ? "g" : (n >= 50 && n < 70) || (n > 160 && n <= 170) ? "a" : "r"; return n ? "g" : "r"; }
  function cntHtml(n, k) { return '<span class="tm-cnt ' + lenCls(n, k) + '">' + nf(n) + " " + esc(T("حرف", "chars")) + "</span>"; }
  function catOf(kind, n) { if (!n) return "missing"; if (kind === "title") return n < 30 ? "short" : n > 65 ? "long" : "ok"; return n < 70 ? "short" : n > 160 ? "long" : "ok"; }
  var CAT_L = { missing: [T("ناقص", "Missing"), "r"], "short": [T("قصير", "Too short"), "a"], "long": [T("طويل", "Too long"), "a"], ok: [T("مظبوط", "OK"), "g"] };

  /* ---------- transport: same-origin /api/seo with the platform token (as seo-admin.html) ---------- */
  function api(method, path, o) {
    o = o || {};
    if (S.mode === "local") return localApi(method, path);
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej({ code: "offline", status: 0 }); return; }
      var h = { Accept: "application/json" }, tk = token(), body, done = false;
      if (o.json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
      if (tk) h.Authorization = "Bearer " + tk;
      var ctl = window.AbortController ? new AbortController() : null;
      var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej({ code: "offline", status: 0 }); }, o.timeout || 30000);
      fetch(BASE + path, { method: method, headers: h, body: body, credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw { code: "offline", status: r.status }; });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.ok) { res(x.j); return; }
        var e = { code: x.j.code || "http_" + x.st, error: x.j.error || "", status: x.st, field: x.j.field, errors: x.j.errors, j: x.j };
        if (x.st === 401 && S.mode === "ready") setTimeout(function () { signIn(true); }, 0);
        rej(e);
      }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline", status: 0 }); });
    });
  }
  var FIELDN = { title: T("العنوان", "Title"), description: T("الوصف", "Description"), h1: "H1", target_kw: T("الكلمة المستهدفة", "Target keyword"), from: T("من", "From"), to: T("إلى", "To"), path: T("المسار", "Path") };
  function isContact(x) { return !!x && /لا يُسمح بأرقام الهاتف|not allowed on public pages|not published/i.test(String(x.error || x.msg || "")); }
  var CONTACT_TXT = T("ممنوع أرقام تليفون أو واتساب أو إيميلات في نصوص الصفحات العامة؛ التواصل عن طريق نموذج «اطلب عرض سعر» بس.", "Phone numbers, WhatsApp numbers and e-mail addresses are not allowed in public page text; contact goes through the «Request a quote» form only.");
  function errText(e) {
    if (!e) return T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    var c = String(e.code || ""), st = +e.status || 0;
    if (c === "read_only") return T("وضع القراءة فقط: الحفظ محتاج اتصال بواجهة الـ SEO.", "Read-only mode: saving needs the SEO API.");
    if (c === "offline") return T("مفيش اتصال بواجهة الـ SEO (‎/api/seo‎) دلوقتي، فمحصلش أي حفظ. جرّب تاني بعد شوية.", "The SEO API (/api/seo) cannot be reached right now, so nothing was saved. Try again shortly.");
    if (isContact(e)) return (FIELDN[String(e.field || "").replace(/\..*$/, "")] ? T("في «", "In «") + FIELDN[String(e.field).replace(/\..*$/, "")] + "»: " : "") + CONTACT_TXT;
    if (st === 401) return T("الجلسة انتهت. ادخل تاني.", "Your session ended. Please sign in again.");
    if (c === "use_email_code") return T("الحساب ده داخل بالباسورد القديم. لوحة الـ SEO محتاجة دخول بكود على الإيميل.", "This account signed in with the old password. The SEO board needs a sign-in with an e-mail code.");
    if (c === "full_login_required") return T("إنت داخل برابط من الإيميل، وده مش كفاية للوحة الـ SEO. ادخل بكود على الإيميل.", "You signed in with an e-mailed link, which is not enough for the SEO board. Sign in with an e-mail code.");
    if (c === "admin_only") return T("الإجراء ده للمدير بس.", "Only an admin can do this.");
    if (c === "preview_read_only") return T("دي نسخة معاينة والحفظ مقفول فيها. عدّل من الموقع الأساسي.", "This is a preview deployment where saving is off. Edit on the main site.");
    if (st === 403) return T("حسابك مش مسموحله بالإجراء ده (المساحة دي لفريق الـ SEO والإدارة).", "Your account may not do this (this board is for the SEO team and the admins).");
    if (c === "daily_limit") return T("وصلت للحد اليومي لإرسال IndexNow (20 مرة في اليوم). جرّب بكرة.", "The daily IndexNow limit (20 a day) is reached. Try again tomorrow.");
    if (c === "no_urls") return T("مفيش جديد يتبعت", "Nothing new to send") + (e.j && e.j.skipped ? T(": " + nf(e.j.skipped) + " صفحة اتبعتت قبل كده بنفس حالتها.", ": " + nf(e.j.skipped) + " pages were already sent in their current state.") : ".");
    if (c === "no_key") return T("مفيش مفتاح IndexNow لسه — ولّده من تبويب «الأرشفة».", "No IndexNow key yet — generate it in the «Indexing» tab.");
    if (st === 429 || c === "rate_limited") return T("تعديلات كتير في وقت قصير. استنى دقيقة وجرّب تاني.", "Too many changes in a short time. Wait a minute and try again.");
    if (c === "unknown_path") return T("المسار ده مش صفحة منشورة على الموقع.", "This path is not a published page of the site.");
    if (c === "redirect_loop") return T("التحويل ده هيعمل حلقة (loop).", "This redirect would create a loop.");
    if (c === "target_gone") return T("الهدف عليه 410 (محذوف).", "The target is marked 410 (gone).");
    if (c === "bundle_too_large") return T("حجم التعديلات هيعدّي الحد المسموح. اطلب من المدير يراجع التعديلات القديمة.", "The edits would exceed the size limit. Ask an admin to review old edits.");
    if (c === "manifest_unavailable") return T("ملف البناء (‎/_seo/pages.json‎) مش منشور لسه.", "The build manifest (/_seo/pages.json) is not deployed yet.");
    if (c === "kv_off" || c === "kv_error" || c === "auth_off" || c === "auth_backend_off" || c === "auth_store_error" || c === "auth_backend_error" || st === 503) return T("واجهة الـ SEO محتاجة إعداد أو مش متاحة دلوقتي، فمحصلش أي حفظ.", "The SEO API needs configuration or is unavailable right now, so nothing was saved.") + (c ? " (" + c + ")" : "");
    if (e.field && FIELDN[String(e.field).replace(/\..*$/, "")]) return T("قيمة مش مقبولة في «", "Invalid value in «") + FIELDN[String(e.field).replace(/\..*$/, "")] + "»: " + (e.error || c);
    return T("حصلت مشكلة: ", "Something went wrong: ") + (e.error || c);
  }
  function errBox(e) { return '<div class="tm-msg bad" role="alert">' + esc(errText(e)) + (e && e.code && e.code !== "offline" && e.code !== "read_only" ? '<small dir="ltr">' + esc(e.code + (e.status ? " · HTTP " + e.status : "")) + "</small>" : "") + "</div>"; }

  /* ---------- read-only fallback: the public build manifest scored in the browser (title/description lengths only) ---------- */
  function pickK(r, ks) { for (var i = 0; i < ks.length; i++) { var v = r[ks[i]]; if (v != null && v !== "") return v; } return ""; }
  function normRow(r) { if (!r || typeof r !== "object") return null; var p = pickK(r, ["p", "path", "url", "loc"]); if (typeof p !== "string" || !p) return null; var path = normPath(p), t = String(pickK(r, ["ti", "title"])), d = String(pickK(r, ["d", "desc", "description"])); return { path: path, lang: String(pickK(r, ["l", "lang"]) || (/^\/en(\/|$)/.test(path) ? "en" : "ar")), type: String(pickK(r, ["t", "type"])), title: t, description: d, h1: String(pickK(r, ["h1", "h"])), kw: String(pickK(r, ["kw", "target_kw"])), effective: { title: t, description: d, h1: String(pickK(r, ["h1", "h"])) }, override: null }; }
  function loadLocal() {
    var c = ["/_seo/pages.json", "/seo-manifest.json"], i = 0;
    function next() {
      if (i >= c.length) return Promise.resolve(null);
      var u = c[i++];
      return fetch(u, { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok || (r.headers.get("content-type") || "").indexOf("json") < 0) throw 0; return r.json(); }).then(function (raw) {
        var arr = Array.isArray(raw) ? raw : raw && (raw.rows || raw.pages || raw.items); if (!Array.isArray(arr)) return next();
        var rows = arr.map(normRow).filter(Boolean), by = {}; rows.forEach(function (r) { by[r.path] = r; });
        return rows.length ? { rows: rows, by: by, src: u } : next();
      }, function () { return next(); });
    }
    return next();
  }
  function localApi(method, path) {
    var L = S.local, u = new URL(path, "http://x"), q = u.searchParams, p = u.pathname;
    if (method !== "GET" || !L) return Promise.reject({ code: "read_only", status: 0 });
    if (p === "/pages") {
      var text = String(q.get("q") || "").toLowerCase(), lang = q.get("lang") || "", issue = q.get("issue") || "";
      var items = L.rows.filter(function (r) { var tl = clen(r.title), dl = clen(r.description); return (!lang || r.lang === lang) && (!text || (r.path + " " + r.title).toLowerCase().indexOf(text) >= 0) && (!issue || (issue === "title_len" ? tl < 30 || tl > 65 : dl < 70 || dl > 160)); });
      if (q.get("sort") === "path") items = items.slice().sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
      var lim = Math.min(500, +q.get("limit") || 30), off = +q.get("offset") || 0;
      return Promise.resolve({ total: items.length, offset: off, limit: lim, items: items.slice(off, off + lim) });
    }
    if (p === "/page") { var r = L.by[normPath(q.get("path") || "")] || null; return Promise.resolve({ path: normPath(q.get("path") || ""), defaults: r, override: null, meta: null, effective: r ? r.effective : null }); }
    return Promise.reject({ code: "read_only", status: 0 });
  }

  /* ---------- shell & tabs ---------- */
  function shell() {
    app.innerHTML = '<div id="tmBan"></div><nav class="tm-tabs" role="tablist" aria-label="' + esc(T("أقسام لوحة الـ SEO", "SEO board sections")) + '">' + TABS.map(function (t) { return '<button type="button" class="tm-tab" role="tab" id="tmTab-' + t[0] + '" aria-controls="tmPanel" data-tab="' + t[0] + '" aria-selected="false"><span aria-hidden="true">' + t[1] + "</span>" + esc(T(t[2], t[3])) + "</button>"; }).join("") + '</nav><div id="tmPanel" role="tabpanel" tabindex="-1"></div>';
    var b = document.getElementById("tmBan");
    if (S.mode === "local") b.innerHTML = '<div class="tm-msg warn" role="note">⚠️ ' + esc(T("واجهة الـ SEO (‎/api/seo‎) مش متصلة، فده تقرير «قراءة فقط» من ملف البناء (" + S.local.src + "). مفيش حفظ ولا تحويلات ولا IndexNow لحد ما الاتصال يرجع.", "The SEO API (/api/seo) is not connected, so this is a read-only report from the build manifest (" + S.local.src + "). No saving, redirects or IndexNow until the connection is back.")) + ' <button type="button" class="tm-lnk" data-act="retry">↻ ' + esc(T("جرّب الاتصال تاني", "Try the connection again")) + "</button></div>";
  }
  function setHash() { var h = S.tab === "pages" && S.ed ? "#edit=" + encodeURIComponent(S.ed.path) : "#" + S.tab; try { history.replaceState(null, "", location.pathname + location.search + h); } catch (e) {} }
  function go(tab, keepEd) {
    if (!RENDER[tab]) tab = "pages";
    if (!keepEd && S.ed && tab !== "pages") S.ed = null;
    S.tab = tab; setHash();
    [].forEach.call(app.querySelectorAll(".tm-tab"), function (b) { var on = b.getAttribute("data-tab") === tab; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    var p = panel(); if (p) RENDER[tab](p);
  }
  function needApi(p, title) { p.innerHTML = '<section class="tm-card"><h2>' + esc(title) + '</h2><div class="tm-msg warn">' + esc(T("القسم ده محتاج اتصال بواجهة الـ SEO (‎/api/seo‎). ارجع له لما الاتصال يرجع.", "This section needs the SEO API (/api/seo). Come back when the connection is back.")) + "</div></section>"; }

  /* ---------- tab: الصفحات ---------- */
  RENDER.pages = function (p) {
    if (S.ed) { paintEditorShell(p); return; }
    var q = S.pg;
    p.innerHTML = '<section class="tm-card"><div class="tm-h"><h2>📄 ' + esc(T("الصفحات", "Pages")) + '</h2><span class="tm-lead" id="tmPgCnt"></span></div>'
      + '<p class="tm-lead">' + esc(T("دوّر بكلمة من العنوان أو بالمسار (زي ‎/factories/‎)، واضغط «تعديل» عشان تغيّر العنوان والوصف اللي بيظهروا في جوجل.", "Search with a word from the title or with the path (like /factories/), then press «Edit» to change the title and description shown in Google.")) + "</p>"
      + '<form class="tm-tools" data-form="pgq" role="search"><input class="tm-in" type="search" name="q" dir="auto" value="' + esc(q.q) + '" aria-label="' + esc(T("بحث في الصفحات", "Search pages")) + '" placeholder="' + esc(T("مثلاً: دليل المصانع أو /tenders/", "e.g. factory directory or /tenders/")) + '"><select class="tm-in" name="lang" aria-label="' + esc(T("اللغة", "Language")) + '"><option value="">' + esc(T("كل اللغات", "All languages")) + '</option><option value="ar"' + (q.lang === "ar" ? " selected" : "") + ">" + esc(T("عربي", "Arabic")) + '</option><option value="en"' + (q.lang === "en" ? " selected" : "") + ">English</option></select><button class=\"btn btn-green tm-big\" type=\"submit\">🔍 " + esc(T("ابحث", "Search")) + "</button></form>"
      + '<div id="tmPgList" aria-live="polite">' + loading() + "</div></section>";
    loadPages();
  };
  function loadPages() {
    var q = S.pg, el = document.getElementById("tmPgList"); if (!el) return;
    el.innerHTML = loading();
    api("GET", "/pages?limit=" + q.limit + "&offset=" + q.offset + (q.q ? "&q=" + encodeURIComponent(q.q) : "") + (q.lang ? "&lang=" + q.lang : "")).then(function (j) {
      var x = document.getElementById("tmPgList"); if (!x || S.tab !== "pages" || S.ed) return;
      var items = j.items || [], total = +j.total || 0, cnt = document.getElementById("tmPgCnt");
      if (cnt) cnt.textContent = T("عدد الصفحات: ", "Pages: ") + nf(total);
      x.innerHTML = items.length ? '<div class="tm-list">' + items.map(pageRow).join("") + "</div>" + pager(total, q.offset, q.limit, "pg") : '<div class="tm-empty">' + esc(q.q ? T("مفيش صفحات مطابقة للبحث ده.", "No pages match this search.") : T("مفيش صفحات في ملف البناء.", "No pages in the build manifest.")) + "</div>";
    }, function (e) { var x = document.getElementById("tmPgList"); if (x) x.innerHTML = errBox(e); });
  }
  function pageRow(r) {
    var e = r.effective || r, t = e.title || "", d = e.description || "", tl = clen(t), dl = clen(d);
    return '<article class="tm-row"><div class="top"><code>' + esc(r.path) + '</code><span class="tm-acts">' + chip(r.lang === "en" ? "English" : T("عربي", "Arabic"), "b") + (r.override ? chip(T("عليها تعديل", "Edited"), "a") : "") + "</span></div>"
      + '<div class="v"><b>' + esc(T("العنوان: ", "Title: ")) + '</b><span dir="auto">' + esc(t || "—") + "</span> " + cntHtml(tl, "title") + "</div>"
      + '<div class="v"><b>' + esc(T("الوصف: ", "Description: ")) + '</b><span dir="auto">' + esc(d ? cut(d, 220) : "—") + "</span> " + cntHtml(dl, "description") + "</div>"
      + '<div class="tm-acts"><button type="button" class="btn btn-green btn-sm" data-act="edit" data-path="' + esc(r.path) + '">✎ ' + esc(ro() ? T("عرض", "View") : T("تعديل العنوان والوصف", "Edit title & description")) + '</button><a class="btn btn-line btn-sm" href="' + esc(encP(r.path)) + '" target="_blank" rel="noopener">↗ ' + esc(T("افتح الصفحة", "Open the page")) + "</a></div></article>";
  }
  function pager(total, off, lim, key) {
    if (total <= lim) return "";
    return '<div class="tm-pager"><button type="button" class="btn btn-line" data-act="page" data-k="' + key + '" data-d="-1"' + (off <= 0 ? " disabled" : "") + ">‹ " + esc(T("السابق", "Previous")) + "</button><span>" + nf(off + 1) + "–" + nf(Math.min(total, off + lim)) + esc(T(" من ", " of ")) + nf(total) + '</span><button type="button" class="btn btn-line" data-act="page" data-k="' + key + '" data-d="1"' + (off + lim >= total ? " disabled" : "") + ">" + esc(T("التالي", "Next")) + " ›</button></div>";
  }

  /* ---------- the page editor (title / description / H1 / target keyword) ---------- */
  var EDF = [["title", T("العنوان (title)", "Title (title tag)"), 2, 120, T("المثالي من 30 لـ 60 حرف — ده اللي بيظهر بالأزرق في جوجل.", "Best 30–60 characters — the blue line in Google.")],
    ["description", T("الوصف (meta description)", "Description (meta description)"), 3, 320, T("المثالي من 70 لـ 160 حرف — السطرين اللي تحت العنوان في جوجل.", "Best 70–160 characters — the lines under the title in Google.")],
    ["h1", T("العنوان الرئيسي في الصفحة (H1)", "Main heading on the page (H1)"), 2, 120, T("اختياري. سيبه زي ما هو لو مش متأكد.", "Optional. Leave it as it is if unsure.")],
    ["target_kw", T("الكلمة المستهدفة", "Target keyword"), 1, 120, T("الكلمة اللي عايزين الصفحة تظهر بيها في البحث (للمتابعة بس).", "The search term this page should rank for (tracking only).")]];
  function openEditor(path) { S.ed = { path: normPath(path), data: null, orig: {} }; if (S.tab !== "pages") S.tab = "pages"; go("pages", true); }
  function paintEditorShell(p) {
    var D = S.ed;
    p.innerHTML = '<section class="tm-card"><div class="tm-h"><h2>✎ ' + esc(T("تعديل الصفحة", "Edit the page")) + '</h2><button type="button" class="btn btn-line btn-sm" data-act="ed-close">' + esc(T("← رجوع للقايمة", "← Back to the list")) + '</button></div><div><code>' + esc(D.path) + '</code> <a class="tm-lnk" href="' + esc(encP(D.path)) + '" target="_blank" rel="noopener">' + esc(T("افتح الصفحة ↗", "Open the page ↗")) + '</a></div><div id="tmEd">' + loading() + "</div></section>";
    if (D.data) { paintEditor(); return; }
    api("GET", "/page?path=" + encodeURIComponent(D.path)).then(function (j) { if (S.ed !== D) return; D.data = j; paintEditor(); }, function (e) { var x = document.getElementById("tmEd"); if (x && S.ed === D) x.innerHTML = errBox(e); });
  }
  function paintEditor() {
    var D = S.ed, j = D.data, el = document.getElementById("tmEd"); if (!el) return;
    if (!j.defaults) { el.innerHTML = '<div class="tm-msg warn">' + esc(T("الصفحة دي مش موجودة في ملف البناء، فمينفعش نعدّلها من هنا. اتأكد من المسار.", "This page is not in the build manifest, so it cannot be edited here. Check the path.")) + "</div>"; return; }
    var def = j.defaults, ov = j.override || {}, meta = j.meta || {};
    D.def = { title: def.title || "", description: def.description || "", h1: def.h1 || "", target_kw: def.kw || "" };
    D.orig = { title: ov.title || D.def.title, description: ov.description || D.def.description, h1: ov.h1 || D.def.h1, target_kw: meta.target_kw || j.target_kw || D.def.target_kw };
    el.innerHTML = '<form data-form="ed" novalidate class="tm-list">'
      + EDF.map(function (f, i) {
        var k = f[0], isOv = k === "target_kw" ? !!meta.target_kw : own(ov, k);
        return (i === 2 ? '<details class="tm-sec"' + (ov.h1 || meta.target_kw ? " open" : "") + "><summary><b>" + esc(T("حقول إضافية (H1 والكلمة المستهدفة)", "More fields (H1 and target keyword)")) + "</b></summary>" : "")
          + '<label class="tm-f wide" data-f="' + k + '"><span class="lb"><span>' + esc(f[1]) + (isOv ? " " + chip(T("متعدّل", "Edited"), "a") : "") + '</span><span id="tmC-' + k + '"></span></span><textarea data-k="' + k + '" rows="' + f[2] + '" maxlength="' + f[3] + '" dir="auto"' + (ro() ? " readonly" : "") + (f[2] === 1 ? ' class="sm" style="min-height:50px"' : "") + "></textarea>"
          + '<span class="tm-def"><span>' + esc(T("قيمة البناء: ", "Build value: ")) + '<b dir="auto">' + esc(D.def[k] || "—") + "</b></span>" + (ro() ? "" : '<button type="button" class="tm-lnk" data-act="ed-def" data-k="' + k + '">' + esc(T("رجوع لقيمة البناء", "Back to the build value")) + "</button>") + '</span><span class="hint">' + esc(f[4]) + '</span><span class="er" role="alert"></span></label>'
          + (i === 3 ? "</details>" : "");
      }).join("")
      + '<div class="tm-f wide"><span class="lb"><span>' + esc(T("معاينة جوجل (تقريبية)", "Google preview (approximate)")) + '</span></span><div id="tmSerp"></div></div>'
      + (ro() ? '<div class="tm-msg warn">' + esc(T("وضع القراءة فقط: الحفظ محتاج اتصال بواجهة الـ SEO.", "Read-only mode: saving needs the SEO API.")) + "</div>"
        : '<label class="tm-chk"><input type="checkbox" name="inx"> <span>' + esc(T("ابلغ محركات البحث بالتعديل على طول (IndexNow — Bing وYandex)", "Tell search engines about the change right away (IndexNow — Bing and Yandex)")) + "</span></label>"
        + '<div id="tmEdMsg" aria-live="polite"></div><div class="tm-acts"><button class="btn btn-green tm-big" type="submit">💾 ' + esc(T("احفظ وانشر", "Save & publish")) + "</button>" + (j.override || (j.meta && j.meta.target_kw) ? '<button class="btn btn-line" type="button" data-act="ed-del">🗑️ ' + esc(T("رجّع الصفحة كلها لقيم البناء", "Return the whole page to its build values")) + "</button>" : "") + "</div>")
      + (j.history && j.history.length ? '<p class="tm-lead">' + esc(T("آخر تعديل: ", "Last change: ")) + fd(j.history[0].at) + (j.history[0].by_email || j.history[0].email ? ' — <span dir="ltr">' + esc(j.history[0].by_email || j.history[0].email) + "</span>" : "") + "</p>" : "")
      + "</form>";
    var f = el.querySelector("form");
    EDF.forEach(function (x) { var t = f.querySelector('[data-k="' + x[0] + '"]'); if (t) t.value = D.orig[x[0]] || ""; });
    paintLive();
  }
  function formVals() { var f = document.querySelector('form[data-form="ed"]'), o = {}; if (!f) return o; EDF.forEach(function (x) { var t = f.querySelector('[data-k="' + x[0] + '"]'); o[x[0]] = t ? plain(t.value) : ""; }); return o; }
  function paintLive() {
    var D = S.ed; if (!D || !D.data) return;
    var v = formVals(), t = v.title || D.def.title, d = v.description || D.def.description;
    ["title", "description", "h1"].forEach(function (k) { var c = document.getElementById("tmC-" + k); if (c) c.innerHTML = cntHtml(clen(v[k] || D.def[k]), k === "h1" ? "" : k); });
    var segs = String(D.path).split("/").filter(Boolean), u = host() + (segs.length ? " › " + segs.join(" › ") : "");
    var s = document.getElementById("tmSerp"); if (!s) return;
    var w = [];
    if (clen(t) > 60) w.push(T("العنوان أطول من 60 حرف، فجوجل غالباً هيقصّه.", "The title is longer than 60 characters, so Google will probably cut it."));
    if (clen(t) < 30) w.push(T("العنوان قصير — زوّد كلمات بتوصف الصفحة.", "The title is short — add words that describe the page."));
    if (!d) w.push(T("مفيش وصف: جوجل هيختار جملة من الصفحة.", "No description: Google will pick a sentence from the page."));
    else if (clen(d) > 160) w.push(T("الوصف أطول من 160 حرف، فجوجل غالباً هيقصّه.", "The description is longer than 160 characters, so Google will probably cut it."));
    else if (clen(d) < 70) w.push(T("الوصف قصير — المثالي من 70 لـ 160 حرف.", "The description is short — best 70–160 characters."));
    var rtl = (D.data.defaults && D.data.defaults.lang) !== "en";
    s.innerHTML = '<div class="tm-serp" dir="' + (rtl ? "rtl" : "ltr") + '"><div class="sn"><img src="/img/logo-site.png" alt="" width="26" height="26"><span><span style="display:block">' + esc(rtl ? "منصة صنع في مصر" : "Made in Egypt Gate") + '</span><span class="su">' + esc(cut(u, 70)) + '</span></span></div><div class="st">' + esc(cut(t, 60) || "—") + "</div>" + (d ? '<div class="sd">' + esc(cut(d, 160)) + "</div>" : '<div class="sd em">' + esc(T("مفيش وصف.", "No description.")) + "</div>") + "</div>"
      + (w.length ? '<p class="tm-msg warn" style="margin-top:8px">⚠️ ' + esc(w.join(" ")) + "</p>" : '<p class="tm-msg ok" style="margin-top:8px">✓ ' + esc(T("الطول مظبوط.", "The lengths are fine.")) + "</p>");
  }
  function edErr(k, m) { var f = document.querySelector('form[data-form="ed"]'), lab = f && f.querySelector('[data-f="' + k + '"]'); if (!lab) return false; lab.classList.toggle("bad", !!m); lab.querySelector(".er").textContent = m || ""; return true; }
  function saveEditor(btn) {
    var D = S.ed; if (!D || !D.data || ro()) return;
    var v = formVals(), body = { path: D.path }, n = 0, bad = 0, msg = document.getElementById("tmEdMsg");
    EDF.forEach(function (x) { edErr(x[0], ""); });
    EDF.forEach(function (x) {
      var k = x[0], cur = v[k], o = plain(D.orig[k]);
      if (cur && clen(cur) > x[3]) { edErr(k, T("أطول من المسموح (" + x[3] + " حرف).", "Longer than allowed (" + x[3] + " characters).")); bad++; return; }
      if (cur === o) return;
      body[k] = k !== "target_kw" && cur === plain(D.def[k]) ? "" : cur; n++;
    });
    if (bad) { msg.innerHTML = '<div class="tm-msg bad" role="alert">' + esc(T("صلّح الخانات المعلّمة بالأحمر.", "Fix the fields marked in red.")) + "</div>"; return; }
    if (!n) { msg.innerHTML = '<div class="tm-msg info">' + esc(T("مفيش تغيير عن القيم الحالية.", "Nothing changed from the current values.")) + "</div>"; return; }
    var inx = document.querySelector('form[data-form="ed"] input[name="inx"]'); if (inx && inx.checked) body.ping_indexnow = true;
    btn.disabled = true; msg.innerHTML = '<div class="tm-msg info">⏳ ' + esc(T("بنحفظ وبننشر… استنى رد السيرفر.", "Saving and publishing… waiting for the server.")) + "</div>";
    api("PATCH", "/page", { json: body }).then(function (r) {
      if (!r || r.ok !== true) throw { code: "bad_response", error: T("السيرفر ماأكدش الحفظ", "the server did not confirm the save") };
      var ex = "";
      (r.warnings || []).forEach(function (w) { ex += "<small>⚠️ " + esc((FIELDN[w.field] ? FIELDN[w.field] + ": " : "") + (w.msg || "")) + "</small>"; });
      if (r.indexnow) ex += "<small>📣 IndexNow: " + esc(r.indexnow.ok ? T("اتبعت", "sent") + " (" + (r.indexnow.status || "") + ")" : r.indexnow.code === "no_key" ? T("مفيش مفتاح IndexNow لسه — ولّده من «الأرشفة».", "no IndexNow key yet — generate it under «Indexing».") : (r.indexnow.status || "") + " " + (r.indexnow.message || "")) + "</small>";
      var ok = '<div class="tm-msg ' + (r.changed === false ? "info" : "ok") + '" role="status">' + esc(r.changed === false ? T("السيرفر رد: مفيش تغيير عن آخر نسخة محفوظة.", "The server says nothing changed since the last saved version.") : T("✅ السيرفر حفظ ونشر التعديل (نسخة ", "✅ The server saved and published the change (version ") + (r.bundle_v || "—") + T("). بيظهر على الموقع ", "). It shows on the site ") + soon(r.visible_within_s) + ".") + ex + "</div>";
      return api("GET", "/page?path=" + encodeURIComponent(D.path)).then(function (j) { if (S.ed !== D) return; D.data = j; paintEditor(); var m2 = document.getElementById("tmEdMsg"); if (m2) m2.innerHTML = ok; }, function () { if (msg) msg.innerHTML = ok; });
    }).then(null, function (e) {
      if (S.ed !== D) return;
      if (e.field) edErr(String(e.field).replace(/\..*$/, ""), isContact(e) ? CONTACT_TXT : (e.error || errText(e)));
      (e.errors || []).forEach(function (x) { if (x && x.field) edErr(String(x.field).replace(/\..*$/, ""), isContact(x) ? CONTACT_TXT : (x.msg || "")); });
      var m3 = document.getElementById("tmEdMsg"); if (m3) m3.innerHTML = e.code === "bad_response" ? '<div class="tm-msg bad" role="alert">' + esc(T("السيرفر مارجّعش تأكيد، فمش هنعتبر التعديل اتحفظ. افتح الصفحة تاني واتأكد.", "The server did not confirm, so we do not count the change as saved. Reopen the page and check.")) + "</div>" : errBox(e);
    }).then(function () { var b2 = document.querySelector('form[data-form="ed"] button[type="submit"]'); if (b2) b2.disabled = false; });
  }
  function deleteOverride(btn) {
    var D = S.ed; if (!D || ro()) return;
    if (!window.confirm(T("هنمسح كل تعديلات الصفحة دي وهترجع لقيم البناء (العنوان والوصف وكل الحقول). متأكد؟", "This removes every edit of this page and returns it to its build values (title, description and every field). Are you sure?"))) return;
    btn.disabled = true;
    api("DELETE", "/page?path=" + encodeURIComponent(D.path)).then(function (r) {
      var ok = '<div class="tm-msg ok" role="status">' + esc(r && r.removed ? T("✅ السيرفر مسح التعديل؛ الصفحة بترجع لقيم البناء ", "✅ The server removed the edit; the page returns to its build values ") + soon() + "." : T("السيرفر رد: مكانش فيه تعديل محفوظ.", "The server says there was no saved edit.")) + "</div>";
      return api("GET", "/page?path=" + encodeURIComponent(D.path)).then(function (j) { if (S.ed !== D) return; D.data = j; paintEditor(); var m = document.getElementById("tmEdMsg"); if (m) m.innerHTML = ok; });
    }).then(null, function (e) { btn.disabled = false; var m = document.getElementById("tmEdMsg"); if (m) m.innerHTML = errBox(e); });
  }

  /* ---------- tab: الكلمات المفتاحية ---------- */
  RENDER.keywords = function (p) {
    if (S.mode === "local") { needApi(p, "🎯 " + T("الكلمات المفتاحية", "Keywords")); return; }
    p.innerHTML = '<section class="tm-card"><div class="tm-h"><h2>🎯 ' + esc(T("الكلمات المفتاحية", "Keywords")) + '</h2><button type="button" class="btn btn-green" data-act="kw-new"' + dis() + ">➕ " + esc(T("مجموعة جديدة", "New cluster")) + "</button></div>"
      + '<p class="tm-lead">' + esc(T("كل مجموعة = كلمة مستهدفة + الصفحة اللي المفروض تظهر بيها + كلمات قريبة منها. الكلمات العامة بتاخد شهور؛ الكلمات الطويلة أسرع.", "Each cluster = a target keyword + the page that should rank for it + related terms. Broad terms take months; long-tail terms move faster.")) + '</p><div id="tmKwEd"></div><div id="tmKw" aria-live="polite">' + loading() + "</div></section>";
    api("GET", "/keywords").then(function (j) { S.kw = j.items || []; S.kwSrc = j.source || ""; paintKw(); }, function (e) { var x = document.getElementById("tmKw"); if (x) x.innerHTML = errBox(e); });
  };
  function paintKw() {
    var el = document.getElementById("tmKw"); if (!el) return;
    var items = S.kw || [];
    el.innerHTML = (S.kwSrc === "build" ? '<p class="tm-note">' + esc(T("دي الكلمات من ملف البناء؛ أول حفظ بيعمل نسخة الفريق القابلة للتعديل.", "These come from the build file; the first save creates the team's editable copy.")) + "</p>" : "")
      + (items.length ? '<div class="tm-list">' + items.map(function (k, i) { var d = k.difficulty; return '<article class="tm-row"><div class="top"><span class="t" dir="auto">🎯 ' + esc(k.target_kw || "—") + "</span><span>" + chip(k.cluster) + (d ? " " + chip(d === "H" ? T("صعبة", "Hard") : d === "M" ? T("متوسطة", "Medium") : T("سهلة", "Easy"), d === "H" ? "r" : d === "M" ? "a" : "g") : "") + '</span></div><div class="meta"><span>' + esc(T("الصفحة: ", "Page: ")) + (k.target_url ? '<button type="button" class="tm-lnk" data-act="edit" data-path="' + esc(k.target_url) + '"><code>' + esc(k.target_url) + "</code></button>" : "—") + "</span></div>" + ((k.secondary_kw || []).length ? '<div class="v"><b>' + esc(T("كلمات قريبة: ", "Related: ")) + "</b>" + k.secondary_kw.slice(0, 12).map(function (s) { return '<span class="tm-c" dir="auto">' + esc(s) + "</span>"; }).join(" ") + "</div>" : "") + '<div class="tm-acts"><button type="button" class="btn btn-line btn-sm" data-act="kw-edit" data-i="' + i + '"' + dis() + ">✎ " + esc(T("تعديل", "Edit")) + "</button></div></article>"; }).join("") + "</div>"
        : '<div class="tm-empty">' + esc(T("مفيش مجموعات كلمات لسه. اضغط «مجموعة جديدة» عشان تبدأ.", "No keyword clusters yet. Press «New cluster» to start.")) + "</div>");
  }
  function kwForm(k, isNew) {
    var ed = document.getElementById("tmKwEd"); if (!ed) return;
    ed.innerHTML = '<form class="tm-card" data-form="kw" novalidate style="border-color:var(--green)"><h3>' + esc(isNew ? T("مجموعة جديدة", "New cluster") : T("تعديل المجموعة ", "Edit cluster ") + k.cluster) + '</h3><div class="tm-grid">'
      + '<label class="tm-f" data-f="cluster"><span class="lb"><span>' + esc(T("رمز المجموعة (حروف إنجليزي وأرقام)", "Cluster id (latin letters & digits)")) + ' <span class="req">*</span></span></span><input type="text" data-k="cluster" dir="ltr" maxlength="40"' + (isNew ? "" : " readonly") + ' value="' + esc(k.cluster || "") + '"><span class="er" role="alert"></span></label>'
      + '<label class="tm-f" data-f="difficulty"><span class="lb"><span>' + esc(T("الصعوبة", "Difficulty")) + '</span></span><select data-k="difficulty">' + [["", "—"], ["L", T("سهلة", "Easy")], ["M", T("متوسطة", "Medium")], ["H", T("صعبة", "Hard")]].map(function (d) { return '<option value="' + d[0] + '"' + (d[0] === (k.difficulty || "") ? " selected" : "") + ">" + esc(d[1]) + "</option>"; }).join("") + "</select></label>"
      + '<label class="tm-f wide" data-f="target_kw"><span class="lb"><span>' + esc(T("الكلمة المستهدفة", "Target keyword")) + ' <span class="req">*</span></span></span><input type="text" data-k="target_kw" dir="auto" maxlength="120"><span class="er" role="alert"></span></label>'
      + '<label class="tm-f wide" data-f="target_url"><span class="lb"><span>' + esc(T("صفحة الهدف (مسار يبدأ بـ /)", "Target page (a path starting with /)")) + '</span></span><input type="text" data-k="target_url" dir="ltr" maxlength="500" placeholder="/factories/"><span class="er" role="alert"></span></label>'
      + '<label class="tm-f wide" data-f="secondary_kw"><span class="lb"><span>' + esc(T("كلمات قريبة (واحدة في كل سطر)", "Related terms (one per line)")) + '</span></span><textarea data-k="secondary_kw" rows="4" dir="auto"></textarea><span class="er" role="alert"></span></label>'
      + '</div><div id="tmKwMsg" aria-live="polite"></div><div class="tm-acts"><button class="btn btn-green tm-big" type="submit">💾 ' + esc(T("احفظ", "Save")) + '</button><button class="btn btn-line" type="button" data-act="kw-cancel">' + esc(T("إلغاء", "Cancel")) + "</button></div></form>";
    var f = ed.querySelector("form"); f.querySelector('[data-k="target_kw"]').value = k.target_kw || ""; f.querySelector('[data-k="target_url"]').value = k.target_url || ""; f.querySelector('[data-k="secondary_kw"]').value = (k.secondary_kw || []).join("\n");
    try { ed.scrollIntoView({ block: "start", behavior: "smooth" }); f.querySelector(isNew ? '[data-k="cluster"]' : '[data-k="target_kw"]').focus(); } catch (e) {}
  }
  function fErr(f, k, m) { var lab = f.querySelector('[data-f="' + k + '"]'); if (!lab) return; lab.classList.toggle("bad", !!m); var er = lab.querySelector(".er"); if (er) er.textContent = m || ""; }
  function saveKw(f) {
    var g = function (k) { var x = f.querySelector('[data-k="' + k + '"]'); return x ? x.value : ""; };
    var cl = plain(g("cluster")), tk = plain(g("target_kw")), tu = plain(g("target_url")), bad = 0, msg = document.getElementById("tmKwMsg");
    ["cluster", "target_kw", "target_url"].forEach(function (k) { fErr(f, k, ""); });
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(cl)) { fErr(f, "cluster", T("لازم 1–40 حرف إنجليزي أو رقم أو _ أو -.", "Must be 1–40 latin letters, digits, _ or -.")); bad++; }
    if (!tk) { fErr(f, "target_kw", T("الخانة دي لازم تتملا.", "This field is required.")); bad++; }
    if (tu && tu.charAt(0) !== "/" && !/^https?:\/\//i.test(tu)) { fErr(f, "target_url", T("لازم مسار يبدأ بـ /", "Must be a path starting with /")); bad++; }
    if (bad) return;
    var body = { cluster: cl, target_url: tu ? normPath(tu) : "", target_kw: tk, secondary_kw: String(g("secondary_kw") || "").split(/\n|\|/).map(plain).filter(Boolean).slice(0, 20), difficulty: g("difficulty") };
    (S.kw || []).forEach(function (k) { if (k.cluster === cl && k.name) body.name = k.name; });
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true; msg.innerHTML = '<div class="tm-msg info">⏳ ' + esc(T("بنحفظ…", "Saving…")) + "</div>";
    api("PUT", "/keywords", { json: body }).then(function (j) {
      if (!j || !Array.isArray(j.items)) throw { code: "bad_response", error: T("السيرفر مارجّعش القايمة", "the server did not return the list") };
      S.kw = j.items; S.kwSrc = "kv"; var ed = document.getElementById("tmKwEd"); if (ed) ed.innerHTML = '<div class="tm-msg ok" role="status">' + esc(T("✅ السيرفر حفظ المجموعة ", "✅ The server saved cluster ") + cl + ".") + "</div>"; paintKw();
    }, function (e) { btn.disabled = false; msg.innerHTML = errBox(e); });
  }

  /* ---------- tab: التحويلات 301 ---------- */
  RENDER.redirects = function (p) {
    if (S.mode === "local") { needApi(p, "↪️ " + T("التحويلات 301", "301 redirects")); return; }
    p.innerHTML = '<form class="tm-card" data-form="rd" novalidate><h2>↪️ ' + esc(T("تحويل جديد", "New redirect")) + '</h2><p class="tm-lead">' + esc(T("لما صفحة تتنقل لعنوان جديد: حوّل العنوان القديم للجديد عشان جوجل والزوار مايوصلوش لصفحة مش موجودة. 301 = دائم، 302 = مؤقت، 410 = الصفحة اتشالت نهائياً.", "When a page moves: redirect the old address to the new one so Google and visitors never land on a missing page. 301 = permanent, 302 = temporary, 410 = the page is gone for good.")) + "</p>"
      + '<div class="tm-grid"><label class="tm-f" data-f="from"><span class="lb"><span>' + esc(T("من (العنوان القديم)", "From (old address)")) + ' <span class="req">*</span></span></span><input type="text" data-k="from" dir="ltr" maxlength="500" placeholder="/old-page/"><span class="er" role="alert"></span></label>'
      + '<label class="tm-f" data-f="to"><span class="lb"><span>' + esc(T("إلى (العنوان الجديد)", "To (new address)")) + ' <span class="req">*</span></span></span><input type="text" data-k="to" dir="ltr" maxlength="500" placeholder="/factories/"><span class="er" role="alert"></span></label>'
      + '<label class="tm-f" data-f="code"><span class="lb"><span>' + esc(T("النوع", "Type")) + '</span></span><select data-k="code"><option value="301">301 · ' + esc(T("دائم", "permanent")) + '</option><option value="302">302 · ' + esc(T("مؤقت", "temporary")) + '</option><option value="410">410 · ' + esc(T("اتشالت نهائياً", "gone")) + "</option></select></label>"
      + '<label class="tm-f" data-f="note"><span class="lb"><span>' + esc(T("ملاحظة", "Note")) + '</span><span class="opt">' + esc(T("اختياري", "optional")) + '</span></span><input type="text" data-k="note" dir="auto" maxlength="200"></label></div>'
      + '<div id="tmRdMsg" aria-live="polite"></div><div class="tm-acts"><button class="btn btn-green tm-big" type="submit"' + dis() + ">💾 " + esc(T("احفظ التحويل", "Save the redirect")) + "</button></div></form>"
      + '<section class="tm-card"><div class="tm-h"><h2>' + esc(T("التحويلات الحالية", "Current redirects")) + '</h2><span class="tm-lead" id="tmRdCnt"></span></div><form class="tm-tools" data-form="rdq" role="search"><input class="tm-in" type="search" data-k="q" dir="auto" value="' + esc(S.rdq) + '" aria-label="' + esc(T("بحث في التحويلات", "Search redirects")) + '" placeholder="' + esc(T("دوّر في من/إلى/الملاحظة…", "Search from/to/note…")) + '"><button class="btn btn-line tm-big" type="submit">🔍 ' + esc(T("بحث", "Search")) + '</button></form><div id="tmRdTest" aria-live="polite"></div><div id="tmRd" aria-live="polite">' + loading() + "</div></section>";
    loadRd();
  };
  function loadRd() {
    var el = document.getElementById("tmRd"); if (!el) return; el.innerHTML = loading();
    api("GET", "/redirects" + (S.rdq ? "?q=" + encodeURIComponent(S.rdq) : "")).then(function (j) {
      S.rd = j.admin || []; var x = document.getElementById("tmRd"); if (!x) return;
      var c = document.getElementById("tmRdCnt"); if (c) c.textContent = T("من الفريق: ", "By the team: ") + nf(S.rd.length) + T(" · من البناء (تلقائي): ", " · from the build (automatic): ") + nf(j.build_count || 0);
      x.innerHTML = S.rd.length ? '<div class="tm-list">' + S.rd.map(function (r, i) { return '<article class="tm-row"><div class="top"><span class="t"><code>' + esc(r.from) + "</code> → " + (+r.code === 410 ? chip("410", "r") : "<code>" + esc(r.to) + "</code>") + "</span>" + chip(String(r.code), +r.code === 410 ? "r" : +r.code === 302 ? "a" : "g") + '</div><div class="meta">' + (r.note ? '<span dir="auto">' + esc(r.note) + "</span>" : "") + "<span>" + fd(r.updated_at || r.created_at) + '</span></div><div class="tm-acts"><button type="button" class="btn btn-line btn-sm" data-act="rd-test" data-i="' + i + '">▶ ' + esc(T("اختبر", "Test")) + '</button><button type="button" class="btn btn-line btn-sm" data-act="rd-del" data-i="' + i + '"' + dis() + ">🗑️ " + esc(T("احذف", "Delete")) + "</button></div></article>"; }).join("") + "</div>"
        : '<div class="tm-empty">' + esc(S.rdq ? T("مفيش تحويلات مطابقة.", "No matching redirects.") : T("مفيش تحويلات من الفريق لسه. تحويلات البناء (الروابط القديمة) شغالة تلقائياً.", "No redirects by the team yet. The build's redirects (old links) work automatically.")) + "</div>";
    }, function (e) { var x = document.getElementById("tmRd"); if (x) x.innerHTML = errBox(e); });
  }
  function saveRd(f) {
    var g = function (k) { var x = f.querySelector('[data-k="' + k + '"]'); return x ? plain(x.value) : ""; };
    var from = g("from"), to = g("to"), code = +g("code") || 301, msg = document.getElementById("tmRdMsg"), bad = 0;
    fErr(f, "from", ""); fErr(f, "to", "");
    if (!from || (from.charAt(0) !== "/" && !/^https?:\/\//i.test(from))) { fErr(f, "from", T("لازم مسار يبدأ بـ /", "Must be a path starting with /")); bad++; }
    else if (normPath(from) === "/") { fErr(f, "from", T("مينفعش تحوّل الصفحة الرئيسية.", "The home page cannot be redirected.")); bad++; }
    if (code !== 410 && (!to || (to.charAt(0) !== "/" && !/^https:\/\//i.test(to)) || to.indexOf("//") === 0)) { fErr(f, "to", T("لازم مسار يبدأ بـ / أو رابط https على نفس الموقع (أو اختار 410).", "Must be a path starting with / or an https URL on this site (or choose 410).")); bad++; }
    if (bad) return;
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true; msg.innerHTML = '<div class="tm-msg info">⏳ ' + esc(T("بنحفظ…", "Saving…")) + "</div>";
    api("POST", "/redirects", { json: { from: from, to: code === 410 ? "" : to, code: code, note: g("note") } }).then(function (j) {
      if (!j || j.ok !== true) throw { code: "bad_response", error: T("السيرفر ماأكدش الحفظ", "the server did not confirm the save") };
      var ex = ""; if (j.collapsed) ex += "<small>" + esc(T("السلسلة اتجمعت للهدف النهائي: ", "The chain was collapsed to the final target: ") + ((j.redirect && j.redirect.to) || "")) + "</small>";
      (j.warnings || []).forEach(function (w) { ex += "<small>⚠️ " + esc(w.msg || "") + "</small>"; });
      msg.innerHTML = '<div class="tm-msg ok" role="status">' + esc(T("✅ السيرفر حفظ التحويل ونشره. بيشتغل ", "✅ The server saved and published the redirect. It works ") + soon() + ".") + ex + "</div>";
      f.reset(); loadRd();
    }, function (e) { msg.innerHTML = errBox(e); if (e.field) fErr(f, String(e.field), e.error || ""); }).then(function () { btn.disabled = false; });
  }
  function testRd(u) {
    var out = document.getElementById("tmRdTest"); if (!out) return; out.innerHTML = loading();
    var url = /^https?:\/\//i.test(u) ? u : location.origin + (u.charAt(0) === "/" ? "" : "/") + encP(u);
    api("GET", "/test?url=" + encodeURIComponent(url)).then(function (j) {
      var ch = j.chain || [];
      out.innerHTML = '<div class="tm-msg ' + (j.hops > 1 ? "warn" : +j.final_status >= 200 && +j.final_status < 300 ? "ok" : +j.final_status === 410 ? "info" : "bad") + '">' + ch.map(function (c, i) { return (i + 1) + ". <code>" + esc(c.url) + "</code> → <b>" + esc(c.status == null ? "—" : c.status) + "</b>" + (c.location ? " → <code>" + esc(c.location) + "</code>" : ""); }).join("<br>") + "<small>" + esc(T("عدد الخطوات: ", "Hops: ") + (j.hops == null ? "—" : j.hops) + T(" · الحالة النهائية: ", " · final status: ") + (j.final_status == null ? "—" : j.final_status)) + "</small></div>";
    }, function (e) { out.innerHTML = errBox(e); });
  }
  function delRd(r, btn) {
    if (!window.confirm(T("تحذف التحويل من ", "Delete the redirect from ") + r.from + T("؟", "?"))) return;
    btn.disabled = true;
    api("DELETE", "/redirects?from=" + encodeURIComponent(r.from)).then(function (j) { toast(j && j.removed ? T("السيرفر حذف التحويل.", "The server deleted the redirect.") : T("السيرفر رد: التحويل مكانش موجود.", "The server says the redirect did not exist.")); loadRd(); }, function (e) { btn.disabled = false; toast(errText(e)); });
  }

  /* ---------- tab: الفحص (missing / short / long titles and descriptions) ---------- */
  RENDER.check = function (p) {
    var c = S.chk;
    p.innerHTML = '<section class="tm-card"><div class="tm-h"><h2>🩺 ' + esc(T("الفحص", "Check")) + '</h2><button type="button" class="btn btn-line btn-sm" data-act="chk-reload">↻ ' + esc(T("افحص تاني", "Check again")) + "</button></div>"
      + '<p class="tm-lead">' + esc(T("الصفحات اللي عنوانها أو وصفها ناقص أو قصير أو أطول من اللي جوجل بيعرضه (من ملف البناء ومعاه تعديلات الفريق المنشورة). اضغط «صلّح» على أي صفحة.", "Pages whose title or description is missing, too short or longer than Google shows (from the build manifest, with the team's published edits). Press «Fix» on any page.")) + "</p>"
      + '<div class="tm-seg" role="group" aria-label="' + esc(T("نوع الفحص", "What to check")) + '"><button type="button" data-act="chk-kind" data-k="title" aria-pressed="' + (c.kind === "title") + '">' + esc(T("العناوين (30–60 حرف)", "Titles (30–60 chars)")) + '</button><button type="button" data-act="chk-kind" data-k="description" aria-pressed="' + (c.kind === "description") + '">' + esc(T("الأوصاف (70–160 حرف)", "Descriptions (70–160 chars)")) + "</button></div>"
      + '<div id="tmChk" aria-live="polite">' + loading(T("بنفحص الصفحات…", "Checking the pages…")) + "</div></section>";
    loadCheck();
  };
  function loadCheck(force) {
    var c = S.chk, kind = c.kind; if (force) c.data[kind] = null;
    if (c.data[kind] && !c.data[kind].more) { paintCheck(); return; }
    var d = c.data[kind] || { items: [], total: 0, off: 0 };
    api("GET", "/pages?issue=" + (kind === "title" ? "title_len" : "desc_len") + "&sort=path&limit=500&offset=" + d.off).then(function (j) {
      d.items = d.items.concat(j.items || []); d.total = +j.total || d.items.length; d.off = d.items.length; d.more = false; c.data[kind] = d;
      if (S.tab === "check" && c.kind === kind) paintCheck();
    }, function (e) { var x = document.getElementById("tmChk"); if (x) x.innerHTML = errBox(e); });
  }
  function paintCheck() {
    var c = S.chk, kind = c.kind, d = c.data[kind], el = document.getElementById("tmChk"); if (!el || !d) return;
    var key = kind === "title" ? "title" : "description", n = { missing: 0, "short": 0, "long": 0 }, rows = [];
    d.items.forEach(function (r) { var e = r.effective || r, v = e[key] || "", cat = catOf(kind, clen(v)); if (cat === "ok") return; n[cat]++; if ((!c.cat || c.cat === cat) && (!c.lang || r.lang === c.lang)) rows.push({ r: r, v: v, cat: cat }); });
    var shown = c.shown || 50;
    el.innerHTML = '<div class="tm-kv">' + ["missing", "short", "long"].map(function (k) { return '<div><span>' + esc(CAT_L[k][0]) + '</span><b style="font-size:1.4rem">' + nf(n[k]) + "</b></div>"; }).join("") + "</div>"
      + '<div class="tm-tools"><div class="tm-seg" role="group" aria-label="' + esc(T("المشكلة", "Problem")) + '">' + [["", T("الكل", "All")], ["missing", CAT_L.missing[0]], ["short", CAT_L["short"][0]], ["long", CAT_L["long"][0]]].map(function (x) { return '<button type="button" data-act="chk-cat" data-k="' + x[0] + '" aria-pressed="' + (c.cat === x[0]) + '">' + esc(x[1]) + "</button>"; }).join("") + '</div><select class="tm-in" data-act-change="chk-lang" aria-label="' + esc(T("اللغة", "Language")) + '"><option value="">' + esc(T("كل اللغات", "All languages")) + '</option><option value="ar"' + (c.lang === "ar" ? " selected" : "") + ">" + esc(T("عربي", "Arabic")) + '</option><option value="en"' + (c.lang === "en" ? " selected" : "") + ">English</option></select></div>"
      + (rows.length ? '<div class="tm-list">' + rows.slice(0, shown).map(function (x) { var r = x.r; return '<article class="tm-row"><div class="top"><code>' + esc(r.path) + "</code>" + chip(CAT_L[x.cat][0], CAT_L[x.cat][1]) + '</div><div class="v" dir="auto">' + esc(x.v ? cut(x.v, 220) : T("— مفيش —", "— none —")) + " " + cntHtml(clen(x.v), key) + '</div><div class="tm-acts"><button type="button" class="btn btn-green btn-sm" data-act="edit" data-path="' + esc(r.path) + '">🛠️ ' + esc(ro() ? T("عرض", "View") : T("صلّح", "Fix")) + "</button></div></article>"; }).join("") + "</div>"
        + (rows.length > shown ? '<div class="tm-acts"><button type="button" class="btn btn-line" data-act="chk-more">' + esc(T("اعرض كمان (" + nf(rows.length - shown) + ")", "Show more (" + nf(rows.length - shown) + ")")) + "</button></div>" : "")
        : '<div class="tm-empty">' + esc(n.missing + n["short"] + n["long"] ? T("مفيش صفحات بالفلتر ده.", "No pages with this filter.") : kind === "title" ? T("✓ كل العناوين طولها مظبوط.", "✓ Every title has a good length.") : T("✓ كل الأوصاف طولها مظبوط.", "✓ Every description has a good length.")) + "</div>")
      + (d.total > d.items.length ? '<p class="tm-lead">' + esc(T("اتفحص أول " + nf(d.items.length) + " من " + nf(d.total) + ".", "Checked the first " + nf(d.items.length) + " of " + nf(d.total) + ".")) + ' <button type="button" class="tm-lnk" data-act="chk-load">' + esc(T("افحص الباقي", "Check the rest")) + "</button></p>" : "");
  }

  /* ---------- tab: الأرشفة (sitemaps + IndexNow) ---------- */
  RENDER.index = function (p) {
    p.innerHTML = '<section class="tm-card"><div class="tm-h"><h2>🗺️ ' + esc(T("خرائط الموقع", "Sitemaps")) + '</h2><a class="btn btn-line btn-sm" href="/sitemap.xml" target="_blank" rel="noopener">↗ sitemap.xml</a></div><p class="tm-lead">' + esc(T("محركات البحث بتلاقي الصفحات من خريطة الموقع. الخريطة بتتعمل تلقائياً مع كل نشر للموقع، وفيها الصفحات المفهرسة بس.", "Search engines find the pages through the sitemap. It is generated automatically with every deploy and lists the indexable pages only.")) + '</p><div id="tmSm">' + loading() + "</div></section>"
      + '<section class="tm-card"><h2>📣 IndexNow</h2><p class="tm-lead">' + esc(T("بيبلّغ Bing وYandex بالصفحات الجديدة أو المعدّلة على طول. جوجل مش بيستخدمه؛ بيعتمد على خريطة الموقع وSearch Console. الحد: 20 إرسال في اليوم.", "Tells Bing and Yandex about new or changed pages right away. Google does not use it; it relies on the sitemap and Search Console. Limit: 20 sends a day.")) + '</p><div id="tmInx">' + (S.mode === "local" ? '<div class="tm-msg warn">' + esc(T("IndexNow محتاج اتصال بواجهة الـ SEO.", "IndexNow needs the SEO API.")) + "</div>" : loading()) + "</div></section>";
    loadSm(); if (S.mode === "ready") loadInx();
  };
  function loadSm() {
    var el = document.getElementById("tmSm"); if (!el) return;
    fetch("/sitemap.xml", { cache: "no-store", credentials: "same-origin" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.text(); }).then(function (t) {
      var d = new DOMParser().parseFromString(t, "application/xml"); if (d.getElementsByTagName("parsererror").length) throw { bad: 1 };
      var tx = function (n, s) { var x = n.getElementsByTagName(s)[0]; return x ? String(x.textContent || "").trim() : ""; };
      var maps = [].slice.call(d.getElementsByTagName("sitemap")).map(function (n) { return { loc: tx(n, "loc"), lm: tx(n, "lastmod") }; });
      if (!maps.length) maps = [{ loc: "/sitemap.xml", lm: "", n: d.getElementsByTagName("url").length }];
      S.sm = maps; paintSm();
    }, function (e) { var x = document.getElementById("tmSm"); if (x) x.innerHTML = '<div class="tm-msg bad">' + esc(e && e.bad ? T("‎/sitemap.xml‎ مش XML صالح.", "/sitemap.xml is not valid XML.") : T("ماقدرناش نجيب ‎/sitemap.xml‎ (HTTP ", "Could not fetch /sitemap.xml (HTTP ") + ((e && e.status) || 0) + ")") + "</div>"; });
  }
  function pathOf(loc) { try { return new URL(loc, location.href).pathname; } catch (e) { return loc; } }
  function paintSm() {
    var el = document.getElementById("tmSm"), maps = S.sm || []; if (!el) return;
    var tot = 0, done = 0; maps.forEach(function (m) { if (m.n != null && m.n >= 0) { tot += m.n; done++; } });
    el.innerHTML = '<div class="tm-tw"><table><thead><tr><th>' + esc(T("الملف", "File")) + "</th><th>" + esc(T("آخر تحديث", "Last updated")) + "</th><th>" + esc(T("روابط", "URLs")) + "</th></tr></thead><tbody>" + maps.map(function (m) { var p = pathOf(m.loc); return '<tr><td><a href="' + esc(p) + '" target="_blank" rel="noopener"><code>' + esc(p) + "</code></a></td><td>" + fd(m.lm) + "</td><td>" + (m.n == null ? "—" : m.n < 0 ? chip("HTTP " + (m.err || 0), "r") : nf(m.n)) + "</td></tr>"; }).join("") + "</tbody></table></div>"
      + '<div class="tm-acts"><button type="button" class="btn btn-line" data-act="sm-count">🔢 ' + esc(T("عدّ الروابط", "Count the URLs")) + "</button>" + (done ? "<span><b>" + nf(tot) + "</b> " + esc(T("رابط في " + nf(done) + " ملف", "URLs in " + nf(done) + " files")) + "</span>" : "") + "</div>";
  }
  function countSm(btn) {
    var q = (S.sm || []).filter(function (m) { return m.n == null; }); if (!q.length) return; btn.disabled = true;
    function next() {
      var m = q.shift(); if (!m) { btn.disabled = false; return; }
      fetch(pathOf(m.loc), { cache: "no-store" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.text(); }).then(function (t) { m.n = new DOMParser().parseFromString(t, "application/xml").getElementsByTagName("url").length; }, function (e) { m.n = -1; m.err = (e && e.status) || 0; }).then(function () { paintSm(); next(); });
    }
    next(); next();
  }
  /* msg: the server's answer to the last send, painted with the reloaded log (one render, so it cannot be overwritten) */
  function loadInx(msg) {
    var el = document.getElementById("tmInx"); if (!el) return;
    Promise.all([api("GET", "/config").then(null, function (e) { return { err: e }; }), api("GET", "/indexnow/log").then(null, function (e) { return { err: e, items: [] }; })]).then(function (r) {
      var x = document.getElementById("tmInx"); if (!x) return;
      if (r[0] && !r[0].err) S.cfg = r[0];
      S.inx = (r[1] && r[1].items) || [];
      var c = S.cfg || {}, key = c.indexnow_key || "", last = null; S.inx.some(function (y) { if (y.ok) { last = y.at; return true; } return false; });
      x.innerHTML = (r[0] && r[0].err ? errBox(r[0].err) : key ? '<div class="tm-msg ok">✓ ' + esc(T("مفتاح IndexNow شغال.", "The IndexNow key is set.")) + ' <code>' + esc(key) + "</code></div>" : '<div class="tm-msg warn">' + esc(T("مفيش مفتاح IndexNow لسه — اعمله مرة واحدة.", "No IndexNow key yet — create it once.")) + '</div><div class="tm-acts"><button type="button" class="btn btn-green" data-act="inx-key">🔑 ' + esc(T("اعمل مفتاح IndexNow", "Create the IndexNow key")) + "</button></div>")
        + '<div class="tm-acts"><button type="button" class="btn btn-green tm-big" data-act="inx-since"' + (key && last ? "" : " disabled") + ">📣 " + esc(T("ابلغ عن الصفحات المعدّلة من آخر إرسال", "Send the pages changed since the last send")) + "</button>" + (last ? '<span class="tm-lead">' + esc(T("آخر إرسال ناجح: ", "Last successful send: ")) + fd(last) + "</span>" : "") + "</div>"
        + '<form class="tm-tools" data-form="inxurl" novalidate><input class="tm-in" type="text" data-k="url" dir="ltr" placeholder="/factories/" aria-label="' + esc(T("رابط صفحة واحدة", "One page link")) + '"><button class="btn btn-line tm-big" type="submit"' + (key ? "" : " disabled") + ">📣 " + esc(T("ابلغ عن الصفحة دي", "Send this page")) + "</button></form>"
        + '<div class="tm-acts"><button type="button" class="btn btn-line" data-act="inx-all"' + (key ? "" : " disabled") + ">📣 " + esc(T("كل خريطة الموقع (مرة بعد الإطلاق)", "The whole sitemap (once after launch)")) + "</button></div>"
        + "<h3>" + esc(T("سجل الإرسال", "Send log")) + "</h3>" + (S.inx.length ? '<div class="tm-list">' + S.inx.slice(0, 10).map(function (y) { return '<div class="tm-row"><div class="top"><span>' + fd(y.at) + (y.by_email ? ' · <span dir="ltr">' + esc(y.by_email) + "</span>" : "") + "</span>" + chip((y.ok ? "✓ " : "✗ ") + (y.status || "—"), y.ok ? "g" : "r") + '</div><div class="meta"><span>' + esc(T("روابط: ", "URLs: ")) + nf(y.count) + "</span>" + (y.message ? '<span dir="auto">' + esc(y.message) + "</span>" : "") + "</div></div>"; }).join("") + "</div>" : '<div class="tm-empty">' + esc(T("مفيش إرسال لسه.", "Nothing sent yet.")) + "</div>")
        + '<div id="tmInxMsg" aria-live="polite">' + (msg || "") + "</div>";
    });
  }
  function sendInx(body, btn) {
    btn.disabled = true; var m = document.getElementById("tmInxMsg"); if (m) m.innerHTML = '<div class="tm-msg info">⏳ ' + esc(T("بنبعت…", "Sending…")) + "</div>";
    api("POST", "/indexnow", { json: body }).then(function (j) {
      var t = j.ok ? T("✅ IndexNow استلم ", "✅ IndexNow accepted ") + nf(j.sent) + T(" رابط", " URLs") + (j.skipped ? T(" (واتخطّينا " + nf(j.skipped) + " اتبعتت قبل كده)", " (skipped " + nf(j.skipped) + " already sent)") : "") : T("IndexNow رد: ", "IndexNow answered: ") + (j.status || "") + " " + (j.message || "");
      loadInx('<div class="tm-msg ' + (j.ok ? "ok" : "warn") + '" role="status">' + esc(t) + "</div>");
    }, function (e) { btn.disabled = false; var m3 = document.getElementById("tmInxMsg"); if (m3) m3.innerHTML = errBox(e); });
  }

  /* ---------- sign-in, lock box, offline ---------- */
  function paintWho() {
    if (!whoEl) return;
    var u = S.user, h = "";
    if ((S.mode === "ready" || S.mode === "local") && u) {
      h = '<span class="chip">👤 <span dir="ltr">' + esc(u.email || "") + "</span> · " + esc(roleName(S.role)) + "</span>";
      if (S.role === "admin" || S.role === "owner") h += '<a class="btn btn-sm" href="/admin/" rel="nofollow">🛠️ ' + esc(T("لوحة التحكم", "Control Center")) + '</a><a class="btn btn-sm" href="/data-desk/" rel="nofollow">🗂️ ' + esc(T("مكتب الاستقبال", "Front desk")) + "</a>";
      h += '<a class="btn btn-sm" href="/seo-admin/" rel="nofollow">🧰 ' + esc(T("مساحة الـ SEO الكاملة", "Full SEO workspace")) + '</a><button class="btn btn-sm" type="button" data-act="logout">' + esc(T("تسجيل الخروج", "Sign out")) + "</button>";
    }
    whoEl.innerHTML = h;
  }
  function box(icon, title, body, acts) { app.innerHTML = '<div class="tm-card tm-lock"><div class="ic" aria-hidden="true">' + icon + "</div><h2>" + esc(title) + "</h2>" + body + '<div class="tm-acts">' + (acts || "") + "</div></div>"; }
  function signIn(expired, msg) {
    S.mode = "login"; S.user = null; paintWho();
    box("🔐", T("دخول فريق الـ SEO", "SEO team sign-in"), (expired || msg ? '<p class="tm-msg warn">' + esc(msg || T("الجلسة انتهت أو الحساب اتغيّر. ادخل تاني.", "Your session ended or the account changed. Please sign in again.")) + "</p>" : "") + '<p class="tm-lead">' + esc(T("اللوحة دي لفريق الـ SEO وإدارة المنصة. ادخل ببريد الشغل بتاعك وهيوصلك كود من 6 أرقام — مفيش كلمة سر. كل تعديل بيتسجّل باسمك.", "This board is for the SEO team and the platform admins. Sign in with your work e-mail and you will get a 6-digit code — no password. Every change is logged under your name.")) + "</p>",
      '<button class="btn btn-green tm-big" type="button" data-act="login">🔑 ' + esc(T("الدخول بالبريد (كود من 6 أرقام)", "Sign in with e-mail (6-digit code)")) + "</button>");
  }
  function lockBox(server) {
    S.mode = "denied"; paintWho();
    var u = S.user;
    box("⛔", T("غير مصرّح لك بدخول هذه الصفحة", "You are not allowed to open this page"),
      (u && u.email ? "<p>" + esc(T("داخل حالياً بـ: ", "Signed in as: ")) + '<b dir="ltr">' + esc(u.email) + "</b></p>" : "")
      + '<p class="tm-lead">' + esc(server ? T("واجهة الـ SEO أكّدت إن الحساب ده مش عليه دور فريق الـ SEO.", "The SEO API confirmed this account has no SEO-team role.") : T("اللوحة دي لفريق الـ SEO وإدارة المنصة بس. لو انت من الفريق، اطلب من المدير يضيف بريدك في «الصلاحيات والفريق» بدور «فريق الـ SEO».", "This board is for the SEO team and the platform admins only. If you are on the team, ask an admin to add your e-mail under «Roles & team» with the «SEO team» role.")) + "</p>",
      (S.role === "data" ? '<a class="btn btn-green" href="/data-desk/">' + esc(T("روح لمكتب الاستقبال (لوحة فريقك)", "Go to the front desk (your team board)")) + "</a>" : "")
      + '<button class="btn ' + (S.role === "data" ? "btn-line" : "btn-green") + '" type="button" data-act="switch">' + esc(T("الدخول بحساب تاني", "Use another account")) + "</button>" + (server ? "" : '<button class="btn btn-line" type="button" data-act="recheck">' + esc(T("اتأكد من السيرفر تاني", "Check with the server again")) + "</button>") + '<a class="btn btn-line" href="/">' + esc(T("الرئيسية", "Home")) + "</a>");
  }
  function offline(withRo) {
    S.mode = "offline"; paintWho();
    box("🔌", T("واجهة الـ SEO مش متصلة", "The SEO API is not connected"), '<p class="tm-lead">' + esc(T("ماقدرناش نوصل لواجهة الـ SEO (‎/api/seo‎) دلوقتي، فمفيش حفظ. تقدر تشوف تقرير «قراءة فقط» من ملف البناء العام لحد ما الاتصال يرجع.", "We couldn't reach the SEO API (/api/seo) right now, so nothing can be saved. You can view a read-only report from the public build manifest until the connection is back.")) + "</p>",
      '<button class="btn btn-green tm-big" type="button" data-act="retry">↻ ' + esc(T("حاول تاني", "Try again")) + "</button>" + (withRo !== false ? '<button class="btn btn-line tm-big" type="button" data-act="ro">👁️ ' + esc(T("تقرير قراءة فقط", "Read-only report")) + "</button>" : ""));
  }
  function configBox(e) {
    S.mode = "config"; paintWho();
    box("⚙️", T("واجهة الـ SEO محتاجة إعداد", "The SEO API needs configuration"), errBox(e) + '<p class="tm-lead">' + esc(T("ده إعداد بيعمله المطوّر مرة واحدة في مشروع Cloudflare Pages. بلّغ الإدارة.", "This is a one-time developer setup in the Cloudflare Pages project. Tell the admins.")) + "</p>", '<button class="btn btn-green" type="button" data-act="retry">↻ ' + esc(T("حاول تاني", "Try again")) + "</button>");
  }
  function boot() {
    S.mode = "boot"; S.health = null; paintWho(); app.innerHTML = '<div class="tm-card">' + loading() + "</div>";
    if (!A) { offline(); return; }
    if (!token()) {
      (A.ping ? A.ping() : Promise.reject({ code: "offline" })).then(function (j) { if (j && j.auth === false) { configBox({ code: "auth_off" }); return; } signIn(false); }, function () { offline(); });
      return;
    }
    A.me().then(function (r) {
      var u = r && r.user; if (!u) { signIn(true); return; }
      S.user = u; var h = hintOf(u); S.role = h || "";
      /* /api/me says this account is not on the SEO team: the lock box, without asking the SEO API (no 403 for ordinary members) */
      if (h !== undefined && !OK_ROLES[h]) { lockBox(false); return; }
      connect();
    }, function (e) { if (e && e.code === "offline") offline(); else signIn(true); });
  }
  function connect(manual) {
    S.mode = "boot";
    return api("GET", "/health", { timeout: 20000 }).then(function (h) {
      S.health = h; S.mode = "ready"; if (!OK_ROLES[S.role]) S.role = h.role === "seo" ? "seo" : h.role === "admin" ? "admin" : S.role;
      start();
    }, function (e) {
      if (e.code === "offline") { offline(); return; }
      if (e.status === 401) { signIn(true); return; }
      /* a session opened with the old password (or an e-mailed link) carries no team role: sign in again with an e-mail code */
      if (e.status === 403 && (e.code === "use_email_code" || e.code === "full_login_required")) { signIn(true, errText(e)); return; }
      if (e.status === 403) { lockBox(true); return; }
      configBox(e);
    });
  }
  function start() {
    paintWho(); shell();
    var h = String(location.hash || "").replace(/^#/, ""), m = /^edit=(.+)$/.exec(h), tab = h;
    if (m) { var pth = ""; try { pth = decodeURIComponent(m[1]); } catch (e) { pth = m[1]; } S.ed = { path: normPath(pth), data: null, orig: {} }; tab = "pages"; }
    go(RENDER[tab] ? tab : "pages", !!m);
  }
  function startLocal(btn) {
    if (btn) btn.disabled = true;
    app.innerHTML = '<div class="tm-card">' + loading(T("بنحمّل ملف البناء (قراءة فقط)…", "Loading the build manifest (read-only)…")) + "</div>";
    loadLocal().then(function (L) {
      if (!L) { offline(false); var p = app.querySelector(".tm-lead"); if (p) p.textContent = T("ولا ملف البناء العام موجود على الدومين ده، فمفيش حاجة نعرضها.", "The public build manifest is not on this host either, so there is nothing to show."); return; }
      S.local = L; S.mode = "local"; paintWho(); shell(); go("pages");
    });
  }

  /* ---------- events ---------- */
  app.addEventListener("click", function (e) {
    var tb = e.target.closest(".tm-tab[data-tab]"); if (tb) { go(tb.getAttribute("data-tab")); return; }
    var b = e.target.closest("[data-act]"); if (!b || !app.contains(b)) return;
    var a = b.getAttribute("data-act");
    if (a === "login") { if (A && A.open) A.open({ title: T("دخول فريق الـ SEO", "SEO team sign-in") }).then(function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); }, function () {}); }
    else if (a === "switch") { var p = A && A.logout && token() ? A.logout() : Promise.resolve(); Promise.resolve(p).then(null, function () {}).then(function () { S.user = null; signIn(false); if (A && A.open) A.open({ title: T("دخول فريق الـ SEO", "SEO team sign-in") }).then(function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); }, function () {}); }); }
    else if (a === "recheck") { b.disabled = true; connect(true); }
    else if (a === "retry") boot();
    else if (a === "ro") startLocal(b);
    else if (a === "edit") openEditor(b.getAttribute("data-path"));
    else if (a === "ed-close") { S.ed = null; go("pages"); }
    else if (a === "ed-def") { var t = document.querySelector('form[data-form="ed"] [data-k="' + b.getAttribute("data-k") + '"]'); if (t && S.ed) { t.value = S.ed.def[b.getAttribute("data-k")] || ""; paintLive(); } }
    else if (a === "ed-del") deleteOverride(b);
    else if (a === "page") { var k = b.getAttribute("data-k"), d = +b.getAttribute("data-d") || 0; if (k === "pg") { S.pg.offset = Math.max(0, S.pg.offset + d * S.pg.limit); loadPages(); try { panel().scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) {} } }
    else if (a === "kw-new") kwForm({ cluster: "", secondary_kw: [] }, true);
    else if (a === "kw-edit") { var kk = (S.kw || [])[+b.getAttribute("data-i")]; if (kk) kwForm(kk, false); }
    else if (a === "kw-cancel") { var ed = document.getElementById("tmKwEd"); if (ed) ed.innerHTML = ""; }
    else if (a === "rd-test") { var r = (S.rd || [])[+b.getAttribute("data-i")]; if (r) testRd(r.from); }
    else if (a === "rd-del") { var r2 = (S.rd || [])[+b.getAttribute("data-i")]; if (r2) delRd(r2, b); }
    else if (a === "chk-kind") { S.chk.kind = b.getAttribute("data-k"); S.chk.cat = ""; S.chk.shown = 50; RENDER.check(panel()); }
    else if (a === "chk-cat") { S.chk.cat = b.getAttribute("data-k") || ""; S.chk.shown = 50; paintCheck(); }
    else if (a === "chk-more") { S.chk.shown = (S.chk.shown || 50) + 50; paintCheck(); }
    else if (a === "chk-load") { var dd = S.chk.data[S.chk.kind]; if (dd) { dd.more = true; loadCheck(); } }
    else if (a === "chk-reload") { S.chk.data = {}; RENDER.check(panel()); }
    else if (a === "sm-count") countSm(b);
    else if (a === "inx-key") { b.disabled = true; api("POST", "/indexnow/key", { json: {} }).then(function (j) { S.cfg = S.cfg || {}; S.cfg.indexnow_key = j.key; loadInx(); toast(T("السيرفر عمل المفتاح؛ بيشتغل ", "The server created the key; it goes live ") + soon() + "."); }, function (x) { b.disabled = false; toast(errText(x)); }); }
    else if (a === "inx-since") { var last = null; (S.inx || []).some(function (y) { if (y.ok) { last = y.at; return true; } return false; }); if (last && window.confirm(T("هنبعت الصفحات اللي اتغيّرت من آخر إرسال ناجح. تكمّل؟", "Send the pages changed since the last successful send?"))) sendInx({ since: last }, b); }
    else if (a === "inx-all") { if (window.confirm(T("هنبعت كل صفحات خريطة الموقع (لحد 10,000). ده بيتعمل مرة بعد الإطلاق. تكمّل؟", "Send every sitemap page (up to 10,000)? Do this once after launch. Continue?"))) sendInx({ all: true }, b); }
  });
  app.addEventListener("change", function (e) { var s = e.target.closest && e.target.closest('[data-act-change="chk-lang"]'); if (s) { S.chk.lang = s.value; S.chk.shown = 50; paintCheck(); } });
  app.addEventListener("input", function (e) { if (e.target.closest && e.target.closest('form[data-form="ed"]')) { var lab = e.target.closest(".tm-f.bad"); if (lab) { lab.classList.remove("bad"); lab.querySelector(".er").textContent = ""; } paintLive(); } });
  app.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-form]"); if (!f) return; e.preventDefault();
    var k = f.getAttribute("data-form");
    if (k === "pgq") { S.pg.q = plain(f.elements.q.value); S.pg.lang = f.elements.lang.value; S.pg.offset = 0; loadPages(); }
    else if (k === "ed") saveEditor(f.querySelector('button[type="submit"]'));
    else if (k === "kw") saveKw(f);
    else if (k === "rd") saveRd(f);
    else if (k === "rdq") { S.rdq = plain(f.querySelector('[data-k="q"]').value); loadRd(); }
    else if (k === "inxurl") { var v = plain(f.querySelector('[data-k="url"]').value); if (!v) return; var u = /^https?:\/\//i.test(v) ? v : site() + encP(normPath(v)); sendInx({ urls: [u] }, f.querySelector('button[type="submit"]')); }
  });
  if (whoEl) whoEl.addEventListener("click", function (e) {
    var b = e.target.closest('[data-act="logout"]'); if (!b) return;
    b.disabled = true; var p = A && A.logout ? A.logout() : Promise.resolve();
    Promise.resolve(p).then(null, function () {}).then(function () { S.user = null; S.ed = null; signIn(false); });
  });
  window.addEventListener("mig:login", function () { if (S.mode !== "ready" && S.mode !== "boot") boot(); });
  window.addEventListener("mig:logout", function () { if (S.mode === "ready" || S.mode === "denied" || S.mode === "local") { S.user = null; S.ed = null; signIn(false); } });
  boot();
})();
