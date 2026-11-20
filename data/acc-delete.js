/* data/acc-delete.js — «طلبات حذف الحساب / Account deletion requests» in the Control Center (/admin/#delreq; app parity plan, item
   account-delete-request; migration 0010). Loaded by the Control Center page after data/acc.js; registers itself with MIGACC.use() in
   «العملاء والاشتراكات» with the permission members.delete (the owner — OWNER_ONLY; the Worker checks it on every call).
   API (worker/src/delete-requests.js, acc.js): GET /api/admin/cc/delete-requests?status= · POST /api/admin/cc/delete-requests/:id
   {status: done | rejected, note}. A request deletes NOTHING by itself:
     member  → «افتح العضو» (the member's own page in «الأعضاء والاشتراكات», where the owner runs the existing audited deletion, which
               also erases Bassem's / Janna's memory of him), then «✓ تم الحذف» closes the request;
     visitor → «امسح ذاكرة الزائر» = the owner's audited memory erasure (POST /api/admin/cc/memory/erase {visitor_id, reason, confirm},
               acc-memory.js) behind the typed visitor id, then the request closes as done.
   «✕ رفض» needs a reason (kept in the audit log). Requests older than 30 days are flagged. Arabic first with the English twin (X.T),
   every server string escaped (X.h). ES5, no dependencies. */
(function () {
  "use strict";
  var W = window;
  function start(X) {
    var T = X.T, h = X.h, str = X.str, trim = X.trim;
    var API = "/admin/cc/delete-requests";
    var MORE = { delete_off: ["طلبات حذف الحساب محتاجة ملف قاعدة البيانات 0010_delete_requests.sql (GitHub ← Actions ← d1-migrate).", "Account deletion requests need the database file 0010_delete_requests.sql (GitHub → Actions → d1-migrate)."] };
    Object.keys(MORE).forEach(function (k) { if (!X.ERRS[k]) X.ERRS[k] = MORE[k]; });
    var KIND = { member: ["حساب عضو", "Member account"], visitor: ["زائر (كلامه مع جنة)", "Visitor (Janna conversations)"] };
    var STATUS = { pending: ["مستني تنفيذ", "Waiting", "p"], done: ["اتنفّذ", "Done", "ok"], rejected: ["اترفض", "Rejected", "x"] };
    var SRC = { web: ["الموقع", "Website"], "app-ios": ["تطبيق الآيفون", "iPhone app"], "app-android": ["تطبيق الأندرويد", "Android app"] };
    function L(p) { return p ? T(p[0], p[1]) : ""; }
    function rowH(r) {
      var s = STATUS[r.status] || [r.status, r.status, "g"], m = r.member || null, who;
      if (r.kind === "member") who = m ? (m.deleted ? '<span class="mut">' + h(T("(الحساب اتحذف)", "(account deleted)")) + "</span>" : '<b dir="auto">' + h(m.company || m.name || "—") + '</b><br><small dir="ltr">' + h(m.email) + "</small>") : "—";
      else who = '<code dir="ltr">' + h(str(r.visitor_id).slice(0, 12)) + "…</code>";
      var acts = "";
      if (r.status === "pending") {
        if (r.kind === "member" && m && !m.deleted) acts += X.btn("drOpen", h(T("افتح العضو", "Open the member")), "l s", ' data-m="' + h(m.id) + '"');
        if (r.kind === "visitor") acts += X.btn("drErase", h(T("امسح ذاكرة الزائر", "Erase the visitor's memory")), "d s", ' data-id="' + h(r.id) + '" data-v="' + h(r.visitor_id) + '"');
        if (r.kind === "member") acts += X.btn("drDone", h(T("✓ تم الحذف", "✓ Deleted")), "s", ' data-id="' + h(r.id) + '"');
        acts += X.btn("drNo", h(T("✕ رفض", "✕ Reject")), "l s", ' data-id="' + h(r.id) + '"');
      }
      return "<tr><td><code dir=\"ltr\">" + h(r.id) + "</code></td><td>" + h(L(KIND[r.kind])) + "</td><td>" + who + "</td><td>" + h(L(SRC[r.source]) || r.source) + "</td><td>" + X.fdh(r.created_at, true)
        + (r.status === "pending" ? '<br><small class="' + (r.overdue ? "bad" : "mut") + '">' + h(r.overdue ? T("فات ميعاد الـ30 يوم", "Past the 30 days") : T("آخر ميعاد: ", "Due: ")) + (r.overdue ? "" : X.fdh(r.due_at)) + "</small>" : "")
        + "</td><td>" + X.tag(L(s), s[2]) + (r.note ? '<br><small dir="auto">' + h(r.note) + "</small>" : "") + (r.decided_by ? '<br><small dir="ltr">' + h(r.decided_by) + "</small>" : "") + '</td><td class="acts2">' + acts + "</td></tr>";
    }
    function run(arg) {
      var c = X.cur(); c.st.f = arg === "all" ? "" : "pending";
      X.head(T("طلبات حذف الحساب", "Account deletion requests"), h(T("الطلب مابيمسحش حاجة لوحده: نفّذ الحذف المسجّل خلال 30 يوم، وبعدين قفل الطلب", "A request deletes nothing by itself: run the audited deletion within 30 days, then close the request")),
        X.btn("drAll", h(c.st.f ? T("كل الطلبات", "All requests") : T("المستنية بس", "Waiting only")), "l s") + X.btn("drRf", h(T("↻ تحديث", "↻ Refresh")), "l s"));
      X.setCt(X.loadingH());
      var paint = function (j) {
        if (!X.alive(c)) return;
        var it = j && j.items ? j.items : [];
        if (j && j.available === false) { X.setCt(X.cardH("", '<p class="note">' + h(L(MORE.delete_off)) + "</p>")); return; }
        X.setCt(X.cardH("", '<div class="tbl-s"><table><thead><tr><th>' + h(T("الرقم", "No.")) + "</th><th>" + h(T("النوع", "Kind")) + "</th><th>" + h(T("مين", "Who")) + "</th><th>" + h(T("منين", "From")) + "</th><th>" + h(T("التاريخ", "Date")) + "</th><th>" + h(T("الحالة", "Status")) + "</th><th></th></tr></thead><tbody>"
          + (it.length ? it.map(rowH).join("") : X.emptyRow(7, T("مفيش طلبات", "No requests"))) + "</tbody></table></div>"));
      };
      var load = function () { X.GET(API + (c.st.f ? "?status=" + c.st.f : "")).then(paint, function (e) { if (X.alive(c)) X.setCt(X.errH(e)); }); };
      var close = function (id, status, note) {
        return X.POST(API + "/" + X.enc(id), { status: status, note: note || "" }).then(function () { X.toast(status === "done" ? T("اتقفل الطلب ✓ — واتسجّل في السجل", "Request closed ✓ — logged") : T("اترفض الطلب — واتسجّل في السجل", "Request rejected — logged")); load(); }, function (e) { X.toast(X.errText(e), 1); throw e; });
      };
      c.on.drRf = load;
      c.on.drAll = function () { X.go("delreq", c.st.f ? "all" : ""); };
      c.on.drOpen = function (b) { X.go("users", b.getAttribute("data-m")); };
      c.on.drDone = function (b) {
        if (!X.sure(T("الحساب اتحذف فعلاً من «الأعضاء والاشتراكات»؟ الطلب هيتقفل «اتنفّذ».", "Was the account really deleted in «Members & subscriptions»? The request will be closed as done."))) return;
        close(b.getAttribute("data-id"), "done");
      };
      c.on.drNo = function (b) {
        var id = b.getAttribute("data-id"), n = trim(W.prompt(T("سبب الرفض (بيتحفظ في السجل):", "Why is it rejected (kept in the log):")) || "");
        if (n.length < 5) { if (n) X.toast(T("اكتب السبب (5 حروف على الأقل)", "Write the reason (5 characters at least)"), 1); return; }
        close(id, "rejected", n);
      };
      c.on.drErase = function (b) {
        var id = b.getAttribute("data-id"), v = b.getAttribute("data-v");
        X.typed({ title: T("مسح ذاكرة جنة عن الزائر ده", "Erase Janna's memory of this visitor"), expect: v,
          msg: T("المسح نهائي ومسجّل (طلب الزائر " + id + "). اكتب رقم الزائر علشان تأكّد.", "The erasure is final and audited (visitor request " + id + "). Type the visitor id to confirm."),
          submit: function (r) {
            X.POST("/admin/cc/memory/erase", { visitor_id: v, confirm: v, reason: T("طلب مسح من الزائر نفسه (", "The visitor's own erasure request (") + id + ")" }).then(function () {
              r.done(); return close(id, "done", T("اتمسحت ذاكرة الزائر", "The visitor's memory was erased"));
            }, function (e) { if (e && e.code === "not_found") { r.done(); return close(id, "done", T("مفيش ذاكرة محفوظة للرقم ده", "No memory was stored for this id")); } r.err(e); });
          } });
      };
      load();
    }
    X.section("delreq", { ar: "طلبات حذف الحساب", en: "Account deletion requests", group: "العملاء والاشتراكات", group_en: "Customers & subscriptions", perm: "members.delete", run: run });
  }
  if (W.MIGACC && W.MIGACC.use) W.MIGACC.use(start);
  else { W.MIGACC_PLUGINS = W.MIGACC_PLUGINS || []; if (W.MIGACC_PLUGINS.push) W.MIGACC_PLUGINS.push(start); }
})();
