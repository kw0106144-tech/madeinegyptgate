/* data/delete-account.js — /delete-account/ «حذف الحساب» (delete-account.part.py; app parity plan, item account-delete-request). A REQUEST
   only: worker/src/delete-requests.js records it (migration 0010) and the owner runs the audited deletion within 30 days.
     #daMember  (switch account_delete): signed out → «ادخل بحسابك» (the e-mail-code dialog, MIGAPI.open); an e-mailed link session →
                «ادخل بكود على الإيميل» first; signed in → GET /api/me/delete-request (a pending request is shown as it is) or
                «🗑 طلب حذف الحساب» → a second confirmation («أيوه، احذف حسابي» / «لا، رجوع») → POST /api/me/delete-request;
     #daVisitor (switch visitor_erase_request): «امسح كلامي مع جنة» for this device's random visitor id (localStorage "mig-vid", the id
                data/janna-live.js keeps) → POST /api/janna/memory/erase-request — no id on this device = nothing to erase.
   Both sections are [data-mig-feature] (data/flags.js hides them while the switch is off; #daOff then says what the privacy policy says).
   The words here are DRAFTS until the owner approves them (docs/app/OWNER-APPROVAL-AR.md). Honest states only: «اتسجّل» only on the
   server's answer. ES5, bilingual in code (T(ar, en)), translate="no" on what this file writes. */
(function () {
  "use strict";
  var W = window, D = document, EN = W.MIGLANG === "en", T = function (a, e) { return EN ? e : a; };
  var A = W.MIGAPI, mbox = D.getElementById("daMember"), vbox = D.getElementById("daVisitor"), DAYS = 30;
  if (!mbox || !vbox) return;
  [mbox, vbox].forEach(function (b) { b.setAttribute("translate", "no"); b.dir = EN ? "ltr" : "rtl"; });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function st(kind, text) { return '<p class="dast ' + kind + '" role="status">' + esc(text) + "</p>"; }
  function day(s) { if (!s) return ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date(s)); } catch (e) { return String(s).slice(0, 10); } }
  function errText(e) {
    var c = e && String(e.code || "");
    if (c === "feature_off" || c === "delete_off") return T("طلبات حذف الحساب مش متاحة دلوقتي — ابعتلنا على info@madeinegyptgate.com.", "Account deletion requests are not available right now — write to us at info@madeinegyptgate.com.");
    if (c === "full_login_required") return T("دخلت برابط من الإيميل — ادخل بكود على الإيميل الأول علشان تطلب حذف الحساب.", "You came in through an e-mail link — sign in with an e-mail code first to ask for the account's deletion.");
    if (c === "rate_limited" || (e && e.status === 429)) return T("طلبات كتير النهارده — جرّب تاني بكرة.", "Too many requests today — please try again tomorrow.");
    if (c === "visitor_linked") return T("كلامك مع جنة على الجهاز ده مربوط بحساب عضو — ادخل بحسابك واطلب حذف الحساب.", "Your conversations with Janna on this device belong to a member account — sign in and ask for the account's deletion.");
    if (c === "offline") return T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فمحصلش أي حاجة. جرّب تاني بعد شوية.", "We couldn't reach the platform's server right now, so nothing happened. Please try again shortly.");
    return T("الطلب ماتسجّلش — جرّب تاني بعد شوية.", "The request was not recorded — please try again shortly.");
  }
  /* what happens, said before anything is asked (the 30 days of the privacy policy; what the law keeps) */
  var WHAT = '<ul><li>' + esc(T("الطلب بيوصل لفريق المنصة، وحذف الحساب وبياناته بيتنفّذ خلال " + DAYS + " يوم.", "The request reaches the platform team, and the account and its data are deleted within " + DAYS + " days."))
    + "</li><li>" + esc(T("بيتحذف: بيانات حسابك وشركتك ومنتجاتك ومتابعاتك وإشعاراتك، وذاكرة باسم وجنة عنك.", "Deleted: your account and company data, your products, follows and notifications, and Bassem's and Janna's memory of you."))
    + "</li><li>" + esc(T("بيفضل محفوظ اللي القانون بيطلبه بس، زي الفواتير الضريبية.", "Kept: only what the law requires, such as tax invoices.")) + "</li></ul>";

  /* ---------------------------------------------------------------- the member ---------------------------------------------------------------- */
  function memberSignin() {
    mbox.innerHTML = "<h2>" + esc(T("حذف حساب العضو", "Delete a member account")) + "</h2>" + WHAT
      + "<p>" + esc(T("علشان تطلب حذف حسابك، ادخل بحسابك الأول (كود من 6 أرقام على إيميلك).", "To ask for your account's deletion, sign in first (a 6-digit code to your e-mail).")) + '</p><div class="daa"><button type="button" class="dabtn" id="daIn">🔑 ' + esc(T("ادخل بحسابك", "Sign in")) + "</button></div>";
    var b = D.getElementById("daIn");
    b.onclick = function () { if (A && A.open) A.open({ why: T("ادخل بحسابك علشان تطلب حذفه", "Sign in to ask for your account's deletion") }).then(function () { memberShow(); }, function () {}); };
  }
  function memberAsk() {
    mbox.innerHTML = "<h2>" + esc(T("حذف حساب العضو", "Delete a member account")) + "</h2>" + WHAT + '<div class="daa"><button type="button" class="dabtn" id="daAsk">🗑 ' + esc(T("طلب حذف الحساب", "Request account deletion")) + "</button></div>";
    D.getElementById("daAsk").onclick = memberConfirm;
  }
  function memberConfirm() {
    mbox.innerHTML = "<h2>" + esc(T("متأكد إنك عايز تحذف حسابك؟", "Are you sure you want your account deleted?")) + "</h2>"
      + "<p>" + esc(T("بعد ما الفريق ينفّذ الحذف مش هتقدر ترجّع الحساب ولا بياناته. لو عندك باقة سارية، الحذف بينهيها.", "Once the team runs the deletion, the account and its data cannot be restored. A plan in force ends with it.")) + "</p>"
      + '<div class="daa"><button type="button" class="dabtn" id="daYes">' + esc(T("أيوه، احذف حسابي", "Yes, delete my account")) + '</button><button type="button" class="dabtn l" id="daNo">' + esc(T("لا، رجوع", "No, go back")) + "</button></div>";
    D.getElementById("daNo").onclick = memberAsk;
    var y = D.getElementById("daYes");
    y.onclick = function () {
      y.disabled = true;
      A.request("/me/delete-request", { method: "POST", body: { lang: EN ? "en" : "ar" } }).then(function (j) { memberStatus(j && j.request); }, function (e) {
        y.disabled = false; var p = D.createElement("div"); p.innerHTML = st("err", errText(e)); mbox.appendChild(p.firstChild);
      });
    };
  }
  function memberStatus(r) {
    if (!r) { memberAsk(); return; }
    var head = "<h2>" + esc(T("حذف حساب العضو", "Delete a member account")) + "</h2>";
    if (r.status === "pending") { mbox.innerHTML = head + st("ok", T("طلب حذف حسابك اتسجّل برقم " + r.id + " يوم " + day(r.created_at) + "، والحذف بيتنفّذ خلال " + DAYS + " يوم.", "Your account deletion request is recorded as " + r.id + " on " + day(r.created_at) + "; the deletion is carried out within " + DAYS + " days.")); return; }
    if (r.status === "done") { mbox.innerHTML = head + st("info", T("طلب حذف الحساب رقم " + r.id + " اتنفّذ يوم " + day(r.decided_at) + ".", "Deletion request " + r.id + " was carried out on " + day(r.decided_at) + ".")); return; }
    mbox.innerHTML = head + st("warn", T("طلب حذف الحساب رقم " + r.id + " اتقفل من غير حذف — لو عندك سؤال ابعتلنا على info@madeinegyptgate.com.", "Deletion request " + r.id + " was closed without a deletion — write to us at info@madeinegyptgate.com with any question.")) + '<div class="daa"><button type="button" class="dabtn" id="daAsk">🗑 ' + esc(T("اطلب تاني", "Ask again")) + "</button></div>";
    D.getElementById("daAsk").onclick = memberConfirm;
  }
  function memberShow() {
    if (!A || !A.request) { mbox.innerHTML = st("err", T("خدمة الدخول ماتحمّلتش — حدّث الصفحة.", "The sign-in service did not load — please reload the page.")); return; }
    if (!(A.token && A.token())) { memberSignin(); return; }
    if (A.linkSession && A.linkSession()) {
      mbox.innerHTML = "<h2>" + esc(T("حذف حساب العضو", "Delete a member account")) + "</h2>" + st("warn", errText({ code: "full_login_required" })) + '<div class="daa"><button type="button" class="dabtn" id="daCode">🔑 ' + esc(T("ادخل بكود على الإيميل", "Sign in with an e-mail code")) + "</button></div>";
      D.getElementById("daCode").onclick = function () { var em = (A.user && A.user() || {}).email || ""; A.open({ email: em }).then(function () { memberShow(); }, function () {}); };
      return;
    }
    mbox.innerHTML = '<p class="dast info">' + esc(T("بنشوف حالة حسابك…", "Checking your account…")) + "</p>";
    A.request("/me/delete-request").then(function (j) { memberStatus(j && j.request); }, function (e) {
      if (e && (e.status === 401 || e.code === "unauthorized")) { memberSignin(); return; }
      mbox.innerHTML = "<h2>" + esc(T("حذف حساب العضو", "Delete a member account")) + "</h2>" + st("err", errText(e));
    });
  }

  /* ---------------------------------------------------------------- a visitor (Janna's memory on this device) ---------------------------------------------------------------- */
  function vid() { var v = ""; try { v = W.localStorage.getItem("mig-vid") || ""; } catch (e) { v = ""; } return /^[0-9a-f]{32}$/.test(v) ? v : ""; }
  function visitorShow() {
    var v = vid(), head = "<h2>" + esc(T("كلامك مع جنة على الجهاز ده", "Your conversations with Janna on this device")) + "</h2>"
      + "<p>" + esc(T("جنة بتفتكر كلامها مع زوار الموقع برقم عشوائي محفوظ على الجهاز (مش باسمك ولا رقمك). تقدر تطلب مسح كلامك معاها.", "Janna remembers her conversations with visitors by a random number kept on the device (not your name or number). You can ask for your conversations with her to be erased.")) + "</p>";
    if (!v) { vbox.innerHTML = head + st("info", T("مفيش كلام محفوظ مع جنة على الجهاز ده.", "There are no saved conversations with Janna on this device.")); return; }
    vbox.innerHTML = head + '<div class="daa"><button type="button" class="dabtn l" id="daV">🧹 ' + esc(T("امسح كلامي مع جنة", "Erase my conversations with Janna")) + "</button></div>";
    var b = D.getElementById("daV");
    b.onclick = function () {
      b.disabled = true;
      var done = function (r) { vbox.innerHTML = head + st("ok", T("طلبك اتسجّل برقم " + r.id + "، والمسح بيتنفّذ خلال " + DAYS + " يوم.", "Your request is recorded as " + r.id + "; the erasure is carried out within " + DAYS + " days.")); };
      if (!W.fetch) { b.disabled = false; return; }
      fetch("/api/janna/memory/erase-request", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ visitor_id: v, lang: EN ? "en" : "ar" }), credentials: "same-origin", cache: "no-store" }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase(); if (ct.indexOf("json") < 0) throw { code: "offline" };
        return r.json().then(function (j) { if (!r.ok || !j || !j.request) throw { code: (j && (j.code || j.error)) || "http_" + r.status, status: r.status }; return j; });
      }).then(function (j) { done(j.request); }, function (e) { b.disabled = false; var p = D.createElement("div"); p.innerHTML = st("err", errText(e && e.code ? e : { code: "offline" })); vbox.appendChild(p.firstChild); });
    };
  }

  function start() {
    var F = W.MIGFLAGS;
    var go = function () {
      /* the sections ship hidden (no flash while the switches load); data/flags.js hides them again if a switch goes off */
      if (!F || F.on("account_delete") === true) { mbox.hidden = false; memberShow(); }
      if (!F || F.on("visitor_erase_request") === true) { vbox.hidden = false; visitorShow(); }
      if (F && F.apply) F.apply();
    };
    if (F && F.ready) F.ready(go, 3000); else go();
  }
  W.addEventListener("mig:logout", function () { if (mbox && !mbox.hidden) memberSignin(); });
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})();
