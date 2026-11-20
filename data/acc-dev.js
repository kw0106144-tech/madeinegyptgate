/* data/acc-dev.js — «🛠️ المطوّر / Developer»: the owner's developer panel inside the Control Center (/admin/#dev). Owner request
   2026-11-19: «لوحة مطوّر عشان مااحتاجكوش: أغيّر أي حاجة وأضيف أو أشيل مزايا». Loaded by the Control Center page right after
   data/acc.js; registers itself with MIGACC.use() and uses acc.js's own transport (the v2 session token), errors, cards, tabs, modal
   and typed confirm. API: worker/src/acc-dev.js + worker/src/flags.js (contract: «Developer panel — Worker API contract» v1).
   OWNER ONLY: the item shows for the role «owner» with whoami features.dev (perm dev.manage) — the Worker checks the owner again on
   every call (admin / editor / support / the platform key → 403 owner_only; team roles → 403). Six tabs (#dev/<tab>):
     features — المزايا: GET/PUT /api/admin/cc/dev/features — the registry's switches (value = the owner's choice, effective = what
                runs now; locked {code, ar, en} = cannot be switched ON from here, OFF always works; needs = on but waiting for
                something else); «↺ الافتراضي» = null; an optional reason goes to the audit; the permanent policies show as rules
     deploys  — النشر: GET /dev/deploys?limit=10 — the last Pages deployments of «madeinegyptgate» and the last versions of the Workers
                janna-lookup / migate-intel (the owner's Cloudflare token, slot cloudflare.dev_token of «مفاتيح الخدمات»: only
                «متسجّل ✓» ever comes back); POST /dev/deploys/rollback {target, id, confirm:"ارجع"} behind the typed «ارجع»
     code     — الكود: the GitHub repository, github.dev, the deploy runs (Actions), Claude Code, the owner guide, how a change goes live
     health   — صحة الموقع: GET /dev/health — the server's checks by group (pages, APIs, intel, database, worker), D1 row counts, version
     audit    — السجل: GET /dev/audit?limit=50 — the developer-panel actions (dev.features, dev.rollback, the token's keys.*, calls_report.*)
     calls    — تقرير المكالمات: GET|PUT /dev/calls-report — «تقرير المكالمات اليومي» (worker/src/calls-report.js): recipients, time, detail
                (masked / full: the owner's confirmed choice, only to madeinegyptgate.com), team tests, empty days, keep days; the last 7 runs;
                the Anam probe; «معاينة يوم…» (GET /dev/calls-report/preview?day=, shown in a sandboxed frame) and «ابعت تقرير يوم…»
                (POST /dev/calls-report/send {day}) — both audited on the server
   Health (12 / 10 min) and deploys (30 / 10 min) answers are kept for a minute in this page (a tab switch never spends the limit;
   «افحص تاني» / «↻» asks again). Nothing is invented: every list is the server's answer or the honest empty / error text. Arabic first
   with the English twin (X.T), RTL/LTR, desktop + phones. ES5, no dependencies. Every server string is escaped (X.h). */
(function () {
  "use strict";
  var W = window;
  function start(X) {
    var T = X.T, h = X.h, $ = X.$, str = X.str, trim = X.trim, enc = X.enc;
    var CFGD = (X.CFG && X.CFG.dev) || {};
    var REPO = /^[\w.-]+\/[\w.-]+$/.test(str(CFGD.repo)) ? str(CFGD.repo) : "kw0106144-tech/madeinegyptgate";
    var ACCOUNT = /^[0-9a-f]{32}$/.test(str(CFGD.account)) ? str(CFGD.account) : "88c77c2b7595dd0ce510270175f69143";
    var PAGES_PROJECT = "madeinegyptgate";
    var API = { vision: "/admin/cc/dev/vision", review: "/admin/cc/dev/review", features: "/admin/cc/dev/features", deploys: "/admin/cc/dev/deploys", rollback: "/admin/cc/dev/deploys/rollback", health: "/admin/cc/dev/health", audit: "/admin/cc/dev/audit", keys: "/admin/cc/keys",
      calls: "/admin/cc/dev/calls-report", callsSend: "/admin/cc/dev/calls-report/send", callsPreview: "/admin/cc/dev/calls-report/preview" };
    var SLOT = "cloudflare.dev_token";       /* «مفاتيح الخدمات» slot «Cloudflare — لوحة المطوّر» */
    var CONFIRM = "ارجع";                    /* the typed confirmation of a rollback (sent as is; the Worker checks it again) */
    var OWNER = function () { var f = X.features(); return X.role() === "owner" && (X.can("dev.manage") || f.dev === true); };
    var MORE = {
      feature_off: ["الميزة دي مقفولة دلوقتي من «🛠️ المطوّر».", "This feature is switched off in «🛠️ Developer»."],
      feature_locked: ["الميزة دي مقفولة لحد ما شرطها يتحقق — مينفعش تتشغّل من هنا (الإيقاف بيشتغل دايماً).", "This feature is locked until its condition is met — it cannot be switched on here (switching off always works)."],
      unknown_feature: ["ميزة غير معروفة.", "Unknown feature."],
      not_boolean: ["القيمة لازم تكون تشغيل أو إيقاف.", "The value must be on or off."],
      policy: ["دي قاعدة ثابتة — مالهاش مفتاح.", "This is a permanent rule — it has no switch."],
      no_token: ["لسه مفيش توكن Cloudflare — حطّه في «النشر» هنا أو في «مفاتيح الخدمات».", "No Cloudflare token yet — add it under «Deploys» here or in «Service keys»."],
      token_unreadable: ["توكن Cloudflare متسجّل بس مش مقروء (CONFIG_SECRET اتغيّر؟) — الصقه تاني.", "The Cloudflare token is saved but unreadable (CONFIG_SECRET changed?) — paste it again."],
      confirm_required: ["اكتب «ارجع» بالظبط علشان تأكّد.", "Type «ارجع» exactly to confirm."],
      already_current: ["النسخة دي هي الشغّالة دلوقتي بالفعل.", "This version is already the live one."],
      not_production: ["مينفعش ترجع للنشر ده: مش نشر ناجح على الموقع الحقيقي.", "This deployment cannot be restored: it is not a successful production deployment."],
      upstream: ["Cloudflare رفض الطلب — جرّب تاني بعد شوية، ولو اتكرر اتأكد من صلاحيات التوكن.", "Cloudflare refused the request — try again shortly; if it repeats, check the token's permissions."],
      secrets_changed: ["أسرار الـ Worker اتغيّرت بعد النسخة دي.", "The Worker's secrets changed after this version."],
      pre_panel: ["النسخة دي أقدم من لوحة المطوّر — محتاجة تأكيد تاني.", "This version predates the developer panel — it needs a second confirmation."],
      confirm_expired: ["التأكيد التاني خلص وقته (10 دقايق) — اقفل الرسالة وابدأ الرجوع من الأول.", "The second confirmation expired (10 minutes) — close this and start the rollback again."],
      ack_required: ["الرجوع رغم تغيير الأسرار محتاج تأكيدك التاني من الأول — ابدأ الرجوع من الأول.", "A rollback despite changed secrets needs your second confirmation first — start the rollback again."],
      invalid_recipients: ["اكتب من ١ لـ ٥ إيميلات صحيحة.", "Enter 1 to 5 valid e-mail addresses."],
      external_confirm_required: ["فيه إيميل برّه madeinegyptgate.com — علّم على التأكيد اللي تحت المستلمين الأول.", "An address outside madeinegyptgate.com — tick the confirmation under the recipients first."],
      full_internal_only: ["البيانات الكاملة بس لما كل المستلمين على madeinegyptgate.com.", "Full contacts only when every recipient is on madeinegyptgate.com."],
      full_confirm_required: ["علّم على جملة الموافقة على البيانات الكاملة الأول.", "Tick the full-contacts confirmation first."],
      invalid_time: ["الميعاد من ٠٥:٠٠ لـ ١٢:٠٠.", "The time must be between 05:00 and 12:00."],
      invalid_keep_days: ["مدة الحفظ: ٠ (على طول) أو من ٣٠ لـ ٧٣٠ يوم.", "Keep days: 0 (keep) or 30–730."],
      invalid_day: ["اختار يوم من آخر ٩٠ يوم.", "Pick a day within the last 90 days."],
      busy: ["التقرير ده بيتعمل دلوقتي — جرّب بعد دقايق.", "This report is being built right now — try again in a few minutes."]
    };
    Object.keys(MORE).forEach(function (k) { if (!X.ERRS[k]) X.ERRS[k] = MORE[k]; });
    var CACHE = {};                          /* {deploys|health: {t, j}} — this page only, one minute */
    var FRESH = 60000;

    /* ---------- small helpers ---------- */
    function L(o, a, e) { if (!o) return ""; return X.EN() ? (o[e] != null && o[e] !== "" ? o[e] : o[a]) : (o[a] != null && o[a] !== "" ? o[a] : o[e]); }
    function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
    function bool(v) { return v === true || v === 1 || v === "1" || v === "true"; }
    function short(id) { id = str(id); return id.length > 12 ? id.slice(0, 8) : id; }
    function dur(v) { v = +v; return v !== v || v < 0 ? "" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms"; }
    function chip(txt, cls) { return X.tag(txt, cls); }
    function ago(iso) { var t = Date.parse(iso); if (isNaN(t)) return ""; var m = Math.round((Date.now() - t) / 60000); if (m < 1) return T("دلوقتي", "just now"); if (m < 60) return T("من " + m + " دقيقة", m + " min ago"); var hh = Math.round(m / 60); if (hh < 48) return T("من " + hh + " ساعة", hh + " h ago"); return T("من " + Math.round(hh / 24) + " يوم", Math.round(hh / 24) + " days ago"); }
    function when(iso) { return iso ? X.fdh(iso, true) + ' <small class="mut">' + h(ago(iso)) + "</small>" : "—"; }
    function extA(u, inner, cls) { var s = /^https:\/\/[^\s"'<>]+$/i.test(str(u)) ? str(u) : ""; return s ? '<a class="' + (cls || "") + '" href="' + h(s) + '" target="_blank" rel="noopener noreferrer">' + inner + "</a>" : inner; }
    function why(o) { var t = L(o, "ar", "en"); return t ? str(t) : ""; }
    function errFull(e) { var x = X.errText(e), j = (e && e.j) || {}; if (j.locked && why(j.locked)) x += " — " + why(j.locked); if (j.upstream_status) x += " (Cloudflare " + j.upstream_status + ")"; return x; }
    function msgH(m) { return m ? '<div class="' + (m.ok ? "okc" : "alert") + '" role="status" dir="auto">' + h(m.t) + (m.e ? X.errSmall(m.e) : "") + "</div>" : ""; }
    var REASON_IN = function (lab) { return '<label class="dv-rs">' + h(lab || T("السبب (اختياري — بيتكتب في السجل)", "Reason (optional — written to the log)")) + '<input data-tf="reason" maxlength="300" dir="auto" autocomplete="off"></label>'; };
    /* a dialog with Confirm / Cancel (the panel's modal: Esc, focus trap, focus back to the opener); resolves {ok, reason} */
    function ask(title, msgHtml, okTxt, danger, withReason) {
      return new Promise(function (res) {
        var done = false, fin = function (v) { if (done) return; done = true; res(v); };
        X.modal(X.mh(title) + '<div class="dv-ask">' + msgHtml + "</div>" + (withReason ? REASON_IN() : "") + '<div class="ft2">' + X.btn("dvok", h(okTxt), danger ? "d" : "r") + '<button type="button" class="btn l" data-x>' + h(T("إلغاء", "Cancel")) + "</button></div>",
          { focus: "[data-a=dvok]", on: { dvok: function () { var r = $("#bx [data-tf=reason]"); fin({ ok: true, reason: r ? trim(r.value).slice(0, 300) : "" }); X.closeModal(); } }, onClose: function () { fin({ ok: false }); } });
      });
    }

    /* ======================================================================================================================
       the section
       ====================================================================================================================== */
    var TABS = [["features", "المزايا", "Features"], ["deploys", "النشر", "Deploys"], ["code", "الكود", "Code"], ["health", "صحة الموقع", "Health"], ["calls", "تقرير المكالمات", "Calls report"], ["audit", "السجل", "Log"]];
    var RUN = {};
    function run(arg) {
      var c = X.cur(), tab = arg && RUN[arg] ? arg : "features";
      c.st.tab = tab;
      X.head(T("🛠️ المطوّر", "🛠️ Developer"), h(T("لوحة المالك: المزايا، النشر، الكود وصحة الموقع — كل تغيير بيتسجّل", "The owner's panel: features, deploys, code and site health — every change is logged")), X.btn("dvrf", h(T("↻ تحديث", "↻ Refresh"))));
      c.on.dvrf = function () { CACHE = {}; X.rerun(); };
      c.on.dvtab = function (b) { X.go("dev", b.getAttribute("data-v")); };
      X.setCt('<div class="note dv-own">' + h(T("الصفحة دي لمالك المنصة بس — والسيرفر بيتأكد إنك المالك في كل طلب. كل تشغيل أو إيقاف أو ترجيع بيتسجّل في «السجل».", "This page is for the platform owner only — and the server checks that you are the owner on every request. Every switch, stop or rollback is written to the «Log».")) + "</div>"
        + '<div class="dv-tabs">' + X.tabsH(TABS, tab, "dvtab") + '</div><div id="dvb">' + X.loadingH() + "</div>");
      RUN[tab](c);
    }
    function body(c, html) { if (!X.alive(c)) return; var b = $("#dvb"); if (b) b.innerHTML = html; }

    /* ---------------------------------------------------------------- 1) features ---------------------------------------------------------------- */
    var SCOPE = { server: ["في السيرفر", "Server"], client: ["في صفحات الموقع", "Site pages"], both: ["السيرفر + صفحات الموقع", "Server + site pages"] };
    function nFeat(x) {
      x = x || {};
      var def = bool(x["default"]), val = x.value != null ? bool(x.value) : def;
      return { key: str(x.key), ar: x.label_ar || x.key, en: x.label_en || x.label_ar || x.key, dar: str(x.desc_ar), den: str(x.desc_en || x.desc_ar),
        def: def, value: val, eff: x.effective != null ? bool(x.effective) : val, over: bool(x.overridden), scope: SCOPE[x.scope] ? x.scope : "server",
        locked: x.locked && typeof x.locked === "object" ? x.locked : null, needs: x.needs && typeof x.needs === "object" ? x.needs : null,
        by: arr(x.enforced_by), at: str(x.updated_at), who: str(x.updated_by) };
    }
    function featH(f) {
      var lab = X.EN() ? f.en : f.ar, desc = X.EN() ? f.den : f.dar, canFlip = !(f.locked && !f.value);
      var st = f.eff ? chip(T("شغّالة دلوقتي ✓", "Running now ✓"), "ok") : f.locked ? chip("🔒 " + T("مقفولة", "Locked"), "p") : f.value ? chip(T("مستنية ⏳", "Waiting ⏳"), "p") : f.def ? chip(T("متوقفة ⏸", "Stopped ⏸"), "x") : chip(T("مقفولة (الافتراضي)", "Off (default)"), "g");
      var meta = [chip(T(SCOPE[f.scope][0], SCOPE[f.scope][1]), "g"), "<span>" + h(T("الافتراضي: ", "Default: ") + (f.def ? T("شغّالة", "on") : T("متوقفة", "off"))) + (f.over ? " · " + h(T("اختيارك: ", "your choice: ") + (f.value ? T("شغّالة", "on") : T("متوقفة", "off"))) : "") + "</span>"];
      if (f.at) meta.push("<span>" + h(T("آخر تغيير ", "Last change ")) + X.fdh(f.at, true) + (f.who ? ' <bdi dir="ltr">' + h(f.who) + "</bdi>" : "") + "</span>");
      return '<div class="dv-f' + (f.eff ? "" : " off") + (f.locked ? " lk" : "") + '" data-fk="' + h(f.key) + '">'
        + '<button type="button" class="dv-sw" role="switch" aria-checked="' + (f.value ? "true" : "false") + '" data-a="dvtog" data-k="' + h(f.key) + '" aria-label="' + h(lab) + '"' + (canFlip ? "" : " disabled") + "></button>"
        + '<div class="tx"><div class="hd"><b dir="auto">' + h(lab) + "</b> " + st + "</div>" + (desc ? '<p dir="auto">' + h(desc) + "</p>" : "")
        + (f.locked ? '<p class="lkr" dir="auto">🔒 ' + h(why(f.locked) || T("مقفولة دلوقتي", "Locked right now")) + keysLink(f.locked) + "</p>" : "")
        + (f.needs && !f.locked ? '<p class="lkr" dir="auto">⏳ ' + h(why(f.needs)) + keysLink(f.needs) + "</p>" : "")
        + '<div class="mt">' + meta.join("") + "</div>"
        + (f.over ? '<div class="acts2 sm3">' + X.btn("dvdef", h(T("↺ رجوع للافتراضي", "↺ Back to the default")), "l s", ' data-k="' + h(f.key) + '"') + "</div>" : "")
        + '<details class="dv-tech"><summary>' + h(T("تفاصيل تقنية", "Technical details")) + '</summary><ul dir="ltr"><li><code>' + h(f.key) + "</code></li>" + f.by.map(function (x) { return "<li>" + h(x === "site" ? T("صفحات الموقع (data/flags.js)", "site pages (data/flags.js)") : x) + "</li>"; }).join("") + "</ul></details>"
        + '<div class="fe" role="status" aria-live="polite"></div></div></div>';
    }
    /* a lock / a wait that names «مفاتيح الخدمات» gets the way there */
    function keysLink(o) { var t = str(o && o.ar) + " " + str(o && o.en); return /مفاتيح الخدمات|Service keys/i.test(t) ? ' <a href="#keys">' + h(T("افتح «مفاتيح الخدمات» ←", "Open «Service keys» →")) + "</a>" : ""; }
    function policyH(pol) {
      var ps = arr(pol);
      if (!ps.length) return "";
      return X.cardH(T("قواعد ثابتة — مش مفاتيح", "Permanent rules — not switches"), '<p class="mut sm">' + h(T("القواعد دي بتحمي بيانات الناس، ومالهاش مفتاح هنا ولا في أي مكان تاني.", "These rules protect people's data and have no switch — here or anywhere else.")) + '</p><ul class="dv-pol">'
        + ps.map(function (p) { return '<li><b dir="auto">🔒 ' + h(L(p, "label_ar", "label_en") || p.key) + "</b>" + (L(p, "desc_ar", "desc_en") ? '<span dir="auto">' + h(L(p, "desc_ar", "desc_en")) + "</span>" : "") + "</li>"; }).join("") + "</ul>");
    }
    RUN.features = function (c) {
      var paint = function () {
        var j = c.st.j || {}, fs = c.st.fs || [];
        body(c, '<div class="info">' + h(T("كل مفتاح بيشغّل أو بيوقف ميزة حقيقية: اللي في السيرفر بيتطبّق خلال 30 ثانية، واللي في صفحات الموقع بيظهر أو يختفي خلال دقايق. الميزة المتوقفة السيرفر بيرفض طلباتها برسالة واضحة، والتشغيل تاني بيرجّعها زي ما كانت.", "Each switch turns a real feature on or off: on the server within 30 seconds, on the site's pages within minutes. The server refuses requests for a stopped feature with a clear message; switching it on again brings it back as it was.")) + "</div>"
          + (j.updated_at ? '<p class="mut sm">' + h(T("آخر تغيير في المزايا: ", "Last change to the features: ")) + when(j.updated_at) + (j.updated_by ? ' <bdi dir="ltr">' + h(j.updated_by) + "</bdi>" : "") + "</p>" : "")
          + (fs.length ? '<div class="dv-fs">' + fs.map(featH).join("") + "</div>" : '<div class="cd"><div class="in mut">' + h(T("السيرفر مارجّعش أي مزايا.", "The server returned no features.")) + "</div></div>")
          + policyH(j.policies || j.policy) + '<div id="dvRev"></div><div id="dvVis"></div>');
        review(c); vision(c);
      };
      var take = function (j) { j = j || {}; c.st.j = j; c.st.fs = arr(j.features).map(nFeat).filter(function (f) { return f.key; }); };
      var load = function () { X.GET(API.features).then(function (j) { if (!X.alive(c)) return; take(j); paint(); }, function (e) { body(c, X.errH(e)); }); };
      var find = function (k) { var f = null; (c.st.fs || []).forEach(function (x) { if (x.key === k) f = x; }); return f; };
      var save = function (k, val, reason, okTxt) {
        var card = $('[data-fk="' + k.replace(/["\\]/g, "") + '"]'), sw = card && card.querySelector(".dv-sw"), fe = card && card.querySelector(".fe");
        if (sw) sw.disabled = true; if (fe) { fe.className = "fe mut"; fe.textContent = T("جارٍ الحفظ…", "Saving…"); }
        var f = {}; f[k] = val;
        X.PUT(API.features, reason ? { features: f, reason: reason } : { features: f }).then(function (r) {
          if (!X.alive(c)) return;
          if (r && arr(r.features).length) take(r); else load();
          paint(); X.toast(r && r.unchanged ? T("مفيش تغيير", "Nothing changed") : okTxt);
          try { var nb = $('[data-fk="' + k.replace(/["\\]/g, "") + '"] .dv-sw'); if (nb) nb.focus(); } catch (x2) {}
        }, function (e) {
          if (!X.alive(c)) return;
          X.toast(errFull(e), 1);
          if (e && e.code === "conflict") { load(); return; }   /* changed elsewhere at the same moment: the current state, then the owner decides again */
          if (sw) sw.disabled = false; if (fe) { fe.className = "fe bad"; fe.innerHTML = h(errFull(e)) + X.errSmall(e); }
        });
      };
      c.on.retry = load;
      c.on.dvtog = function (b) {
        var k = b.getAttribute("data-k"), f = find(k);
        if (!f || b.disabled) return;
        var to = !f.value, lab = X.EN() ? f.en : f.ar, desc = X.EN() ? f.den : f.dar;
        ask(to ? T("تشغيل «" + lab + "»؟", "Switch on «" + lab + "»?") : T("إيقاف «" + lab + "»؟", "Switch off «" + lab + "»?"),
          (desc ? '<p dir="auto">' + h(desc) + "</p>" : "") + '<p class="sm mut">' + h(T("التغيير بيتطبّق في السيرفر خلال 30 ثانية وفي صفحات الموقع خلال دقايق، وبيتسجّل في «السجل».", "The change applies on the server within 30 seconds and on the site's pages within minutes, and is written to the «Log».")) + "</p>",
          to ? T("▶ تشغيل", "▶ Switch on") : T("⏸ إيقاف", "⏸ Switch off"), !to, true).then(function (a) {
          if (!a.ok || !X.alive(c)) return;
          save(k, to, a.reason, to ? T("اتشغّلت ✓ — واتسجّلت في السجل", "Switched on ✓ — logged") : T("اتوقفت ✓ — بتتطبّق خلال دقايق، واتسجّلت في السجل", "Switched off ✓ — applies within minutes; logged"));
        });
      };
      c.on.dvdef = function (b) {
        var k = b.getAttribute("data-k"), f = find(k); if (!f) return;
        var lab = X.EN() ? f.en : f.ar;
        ask(T("رجوع «" + lab + "» للافتراضي؟", "Put «" + lab + "» back to its default?"), '<p>' + h(T("الافتراضي: ", "The default: ") + (f.def ? T("شغّالة", "on") : T("متوقفة", "off"))) + "</p>", T("↺ رجوع للافتراضي", "↺ Back to the default"), false, true).then(function (a) {
          if (!a.ok || !X.alive(c)) return;
          save(k, null, a.reason, T("رجعت للافتراضي ✓ — واتسجّلت في السجل", "Back to the default ✓ — logged"));
        });
      };
      load();
    };

    /* «دخول مراجعي المتاجر» (switch store_review_signin; worker/src/review-signin.js, GET|PUT|DELETE /dev/review): ONE address (a mailbox
       the team owns) + a 6-digit code the owner types, ≤ 30 days; only an HMAC of the code is stored and the code is never shown again.
       The switch stays locked until they are saved; every review sign-in is in «السجل» (review.signin). App parity plan, store-review-signin */
    function review(c) {
      var box = $("#dvRev"); if (!box) return;
      var paint = function (j, msg) {
        if (!X.alive(c) || !$("#dvRev")) return; j = j || {};
        var st = j.active ? chip(T("شغّال دلوقتي ✓", "Active now ✓"), "ok") : j.set && !j.live ? chip(T("المدة خلصت", "Expired"), "x") : j.set ? chip(T("محفوظ — المفتاح مقفول", "Saved — the switch is off"), "p") : chip(T("مش متحدد", "Not set"), "g");
        $("#dvRev").innerHTML = X.cardH(T("دخول مراجعي المتاجر — الإيميل والكود", "App-store reviewer sign-in — address and code"),
          '<p class="sm" dir="auto">' + h(T("إيميل واحد (صندوق بريد بتاع الفريق) وكود ثابت من 6 أرقام بتكتبه إنت، صالحين لحد " + (j.max_days || 30) + " يوم. الكود بيتحفظ متشفّر ومش بيظهر تاني. حطّهم في ملاحظات مراجعة App Store و«App access» في Google Play، وفعّل باقة حقيقية على الحساب ده، واقفل المفتاح «دخول مراجعي المتاجر» فوق بعد الموافقة.", "One address (a mailbox the team owns) and a fixed 6-digit code you type, valid up to " + (j.max_days || 30) + " days. The code is stored encrypted and never shown again. Put them in the App Store review notes and Google Play «App access», activate a real plan on that account, and switch «App-store reviewer sign-in» above off after the approval.")) + "</p>"
          + '<p class="sm" dir="auto">' + h(T("الإيميل لازم يكون لحساب مخصص للمراجعة بس: حساب عميل فيه طلبات أو منتجات أو ذاكرة أو فواتير بيترفض، وكذلك حسابات فريق المنصة. دخول المراجع بيخلص مع آخر المدة، ولما تقفل المفتاح أو تشيل الإيميل والكود بيخرج من الحساب على طول.", "The address must be an account kept for the review only: a customer's account with requests, products, memory or invoices is refused, and so are the platform team's accounts. The reviewer's sign-in ends with the period, and switching the key off or removing the address and code signs him out at once.")) + "</p>"
          + '<p class="sm">' + st + (j.set ? ' <bdi dir="ltr">' + h(j.email) + "</bdi> · " + h(T("لحد ", "until ")) + X.fdh(j.until, true) : "") + "</p>" + msgH(msg)
          + '<div class="fr"><label>' + h(T("الإيميل", "E-mail")) + '<input data-rv="email" type="email" dir="ltr" autocomplete="off" maxlength="254" value="' + h(j.email || "") + '"></label>'
          + "<label>" + h(T("الكود (6 أرقام)", "Code (6 digits)")) + '<input data-rv="code" type="text" inputmode="numeric" dir="ltr" autocomplete="off" maxlength="6" pattern="[0-9]{6}"></label>'
          + "<label>" + h(T("المدة بالأيام", "Days")) + '<input data-rv="days" type="number" min="1" max="' + (j.max_days || 30) + '" value="14" dir="ltr"></label></div>'
          + '<div class="acts2">' + X.btn("dvRvSave", h(T("💾 حفظ الإيميل والكود", "💾 Save the address and code")), "s") + (j.set ? X.btn("dvRvDel", h(T("🗑 شيلهم", "🗑 Remove them")), "l s") : "") + "</div>");
      };
      var val = function (k) { var e = $('#dvRev [data-rv="' + k + '"]'); return e ? trim(e.value) : ""; };
      var load = function (msg) { X.GET(API.review).then(function (j) { paint(j, msg); }, function (e) { if (X.alive(c) && $("#dvRev")) $("#dvRev").innerHTML = X.errH(e); }); };
      c.on.dvRvSave = function (b) {
        b.disabled = true;
        X.PUT(API.review, { email: val("email"), code: val("code").replace(/[^0-9]/g, ""), days: parseInt(val("days"), 10) || 0 }).then(function (j) { X.toast(T("اتحفظ ✓ — واتسجّل في السجل", "Saved ✓ — logged")); paint(j, { ok: true, t: T("اتحفظ. شغّل المفتاح «دخول مراجعي المتاجر» فوق وقت المراجعة بس.", "Saved. Switch «App-store reviewer sign-in» on above only during a review.") }); X.GET(API.features).then(function () {}, function () {}); },
          function (e) { b.disabled = false; X.toast(errFull(e), 1); load({ ok: false, t: errFull(e), e: e }); });
      };
      c.on.dvRvDel = function (b) {
        ask(T("تشيل إيميل المراجعة والكود؟", "Remove the review address and code?"), "<p>" + h(T("بعد كده الإيميل ده بيدخل بكود على الإيميل زي أي حد.", "After that this address signs in with an e-mailed code like anyone else.")) + "</p>", T("🗑 شيلهم", "🗑 Remove them"), true, false).then(function (a) {
          if (!a.ok || !X.alive(c)) return; b.disabled = true;
          X.DEL(API.review).then(function (j) { X.toast(T("اتشالوا ✓ — واتسجّل في السجل", "Removed ✓ — logged")); paint(j); }, function (e) { b.disabled = false; X.toast(errFull(e), 1); });
        });
      };
      load();
    }

    /* «🔎 تجربة قراءة صورة» (worker/src/acc-dev.js POST /dev/vision → worker/src/chat-media.js, design phase 1A): the owner tries the photo
       reading of Janna's and Bassem's calls on his own test photos BEFORE he switches chat_photos on — the photo is redrawn here exactly like
       in a call (data/chat-media.js photoPrep: a JPEG ≤ 1,280 px, EXIF dropped), read once, and nothing is stored; 20 a day inside the reading
       budget; each test is in «السجل» (dev.vision: model, size, kind, reason — never the photo or its text). No coding session can call Workers AI. */
    var VIS_MODELS = [["", "CHAT_VISION_MODEL"], ["@cf/meta/llama-4-scout-17b-16e-instruct", "Llama 4 Scout"], ["@cf/google/gemma-4-26b-a4b-it", "Gemma 4 26B"]];
    var VIS_AGENTS = [["janna-ar", "جنة (عربي)", "Janna (Arabic)"], ["janna-en", "جنة (إنجليزي)", "Janna (English)"], ["bassem", "باسم", "Bassem"]];
    function cmLib(cb) {
      if (W.MIGCHATMEDIA && W.MIGCHATMEDIA.photoPrep) { cb(W.MIGCHATMEDIA); return; }
      var me = document.querySelector('script[src*="data/acc-dev.js"]'), m = me && /[?&]v=([\w.-]+)/.exec(me.src), sc = document.createElement("script");
      sc.src = "data/chat-media.js" + (W.MIGVER_CM || (m ? "?v=" + m[1] : "")); sc.charset = "utf-8"; sc.async = true;
      sc.onload = function () { cb(W.MIGCHATMEDIA || null); }; sc.onerror = function () { cb(null); };
      document.head.appendChild(sc);
    }
    function vision(c) {
      if (!$("#dvVis")) return;
      var st = c.st.vis || (c.st.vis = { agent: "janna-ar", model: "", detail: "high", res: null, msg: null });
      var opt = function (list, cur, lab) { return list.map(function (o) { return '<option value="' + h(o[0]) + '"' + (o[0] === cur ? " selected" : "") + ">" + h(lab(o)) + "</option>"; }).join(""); };
      var paint = function () {
        if (!X.alive(c) || !$("#dvVis")) return;
        var r = st.res, who = st.agent === "bassem" ? T("اللي باسم كان هيوصله", "What Bassem would receive") : T("اللي جنة كانت هتوصلها", "What Janna would receive");
        $("#dvVis").innerHTML = X.cardH(T("🔎 تجربة قراءة صورة", "🔎 Test a photo reading"),
          '<p class="sm" dir="auto">' + h(T("اختار صورة تجربة — مابتتحفظش وبتتحسب من حد اليوم", "Choose a test photo — it is not kept and counts toward the daily cap")) + "</p>"
          + '<div class="fr"><label>' + h(T("جنة أو باسم", "Janna or Bassem")) + '<select data-vs="agent">' + opt(VIS_AGENTS, st.agent, function (o) { return T(o[1], o[2]); }) + "</select></label>"
          + '<label>' + h(T("الموديل", "Model")) + '<select data-vs="model" dir="ltr">' + opt(VIS_MODELS, st.model, function (o) { return o[1]; }) + "</select></label>"
          + '<label>' + h(T("دقة الصورة (Gemma)", "Image detail (Gemma)")) + '<select data-vs="detail" dir="ltr">' + opt([["high", "high"], ["low", "low"]], st.detail, function (o) { return o[1]; }) + "</select></label></div>"
          + '<div class="acts2"><input type="file" accept="image/jpeg,image/png,image/webp" data-vf aria-label="' + h(T("🔎 تجربة قراءة صورة", "🔎 Test a photo reading")) + '"></div>' + msgH(st.msg)
          + (r ? '<p class="sm"><bdi dir="ltr">' + h(str(r.model)) + "</bdi> · " + h(dur(r.ms)) + " · " + h(r.width + "×" + r.height) + (r.seen ? " · " + chip(str(r.seen.kind) + " / " + str(r.seen.confidence), "ok") : " · " + chip(str(r.reason || "—"), "p"))
            + (arr(r.flags).length ? " · " + chip(arr(r.flags).join(", "), "x") : "") + "</p>"
            + "<p><b>" + h(who) + '</b></p><pre class="dv-pre" dir="auto" style="white-space:pre-wrap;max-height:340px;overflow:auto">' + h(str(r.context)) + "</pre>"
            + '<details class="dv-tech"><summary>' + h(T("القراءة بعد الفلتر والرد الخام من الموديل", "The reading after the guard and the model's raw answer")) + '</summary><pre dir="ltr" style="white-space:pre-wrap;max-height:340px;overflow:auto">'
            + h(JSON.stringify(r.seen, null, 2) + "\n\n" + str(r.raw) + (r.error ? "\n\n" + str(r.error) : "")) + "</pre></details>" : ""));
        [].forEach.call($("#dvVis").querySelectorAll("[data-vs]"), function (sel) { sel.onchange = function () { st[sel.getAttribute("data-vs")] = sel.value; }; });
        var fi = $("#dvVis [data-vf]");
        if (fi) fi.onchange = function () {
          var f = fi.files && fi.files[0]; if (!f) return;
          fi.disabled = true; st.msg = { ok: true, t: T("🔎 المنصة بتقرا الصورة…", "🔎 The platform is reading the photo…") }; paint();
          cmLib(function (M) {
            if (!M) { st.msg = { ok: false, t: X.errText({ code: "offline" }) }; paint(); return; }
            M.photoPrep(f, function (e, p) {
              if (e) { st.msg = { ok: false, t: M.tx(e, X.EN()) || e }; paint(); return; }
              var ag = st.agent === "bassem" ? "bassem" : "janna", q = X.qs({ agent: ag, lang: st.agent === "janna-en" ? "en" : "ar", model: st.model, detail: st.detail });
              X.POST(API.vision + q, undefined, { bin: p.blob, type: "image/jpeg", timeout: 60000 }).then(function (j) { st.res = j || null; st.msg = null; paint(); },
                function (er) { st.msg = { ok: false, t: errFull(er), e: er }; paint(); });
            });
          });
        };
      };
      paint();
    }

    /* ---------------------------------------------------------------- 2) deploys ---------------------------------------------------------------- */
    var STATUS = { success: ["نجح", "Success", "ok"], active: ["شغّال", "Active", "ok"], failure: ["فشل", "Failed", "x"], failed: ["فشل", "Failed", "x"], canceled: ["اتلغى", "Canceled", "g"], skipped: ["اتعدّى", "Skipped", "g"], idle: ["مستني", "Waiting", "p"], active_build: ["بيتبني", "Building", "p"], building: ["بيتبني", "Building", "p"], queued: ["في الطابور", "Queued", "p"] };
    function stChip(s) { s = str(s).toLowerCase(); var x = STATUS[s]; return x ? chip(T(x[0], x[1]), x[2]) : s ? chip(s, "g") : ""; }
    var TARGETS = { pages: ["الموقع (Cloudflare Pages)", "The site (Cloudflare Pages)"], "janna-lookup": ["السيرفر الرئيسي — الـ API وجنة وباسم ولوحة التحكم", "Main server — API, Janna & Bassem, Control Center"], "migate-intel": ["مركز المعلومات — المناقصات والأخبار اليومية", "Information Center — daily tenders & news"] };
    function blockErr(b) {
      if (!b || b.ok !== false) return "";
      var e = b.error || {}, m = typeof e === "string" ? e : str(e.message || e.error || "");
      return '<div class="alert" dir="auto">' + h(T("Cloudflare مارجّعش القايمة دي", "Cloudflare did not return this list")) + (e.status ? ' <small dir="ltr">(' + h(String(e.status)) + ")</small>" : "") + (m ? '<br><small dir="auto">' + h(X.cut(m, 200)) + "</small>" : "") + "</div>";
    }
    function tokenCard(j, msg) {
      var tk = j.token || {}, set = bool(tk.set), readable = tk.readable !== false, reason = str(j.reason);
      var how = '<details class="dv-how"' + (set ? "" : " open") + "><summary>" + h(T("إزاي تعمل التوكن (مرة واحدة)", "How to create the token (once)")) + "</summary><ol>"
        + "<li>" + h(T("افتح ", "Open ")) + extA("https://dash.cloudflare.com/profile/api-tokens", '<span dir="ltr">dash.cloudflare.com/profile/api-tokens ↗</span>') + h(T(" ← Create Token ← Custom token.", " → Create Token → Custom token.")) + "</li>"
        + "<li>" + h(T("الصلاحيات (Permissions): ", "Permissions: ")) + '<code dir="ltr">Account · Cloudflare Pages · Edit</code> ' + h(T("و", "and")) + ' <code dir="ltr">Account · Workers Scripts · Edit</code> <small class="mut">' + h(T("(Read بيكفي للعرض؛ Edit لازم للترجيع)", "(Read is enough to list; Edit is needed to roll back)")) + "</small></li>"
        + "<li>" + h(T("الحساب (Account Resources): الحساب ده بس — ", "Account Resources: this account only — ")) + '<code dir="ltr">' + h(str(j.account_id || ACCOUNT)) + "</code></li>"
        + "<li>" + h(T("انسخ التوكن والصقه هنا تحت واضغط «حفظ». بعد الحفظ مابيرجعش للمتصفح تاني — بيظهر «متسجّل ✓» بس.", "Copy the token, paste it below and press «Save». After saving it never comes back to the browser — only «Registered ✓» shows.")) + "</li></ol></details>";
      var form = '<label class="w dv-tk"><span>' + h(set ? T("استبدال التوكن (الصق التوكن الجديد)", "Replace the token (paste the new one)") : T("الصق توكن Cloudflare هنا", "Paste the Cloudflare token here")) + '</span><input id="dvtok" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" dir="ltr"' + (reason === "config_secret_missing" ? " disabled" : "") + "></label>"
        + '<div class="acts2">' + X.btn("dvtsave", h(T("💾 حفظ التوكن", "💾 Save the token")), "r", reason === "config_secret_missing" ? " disabled" : "") + (set && readable ? X.btn("dvttest", h(T("🧪 اختبار", "🧪 Test")), "l") : "") + (set && tk.source !== "env" ? X.btn("dvtdel", h(T("🗑 مسح التوكن", "🗑 Delete the token")), "l") : "") + "</div>";
      var state = set ? (readable ? '<div class="okc">✓ ' + h(T("توكن Cloudflare متسجّل", "Cloudflare token registered")) + (tk.source === "env" ? ' <small>(' + h(T("سر على الـ Worker", "a Worker secret")) + ")</small>" : "") + "</div>"
          : '<div class="alert">' + h(L2x(MORE.token_unreadable)) + "</div>")
        : '<div class="alert">' + h(reason === "config_secret_missing" ? L2x(X.ERRS.config_secret_missing || ["لازم يتضاف السر CONFIG_SECRET للـ Worker الأول.", "Add the CONFIG_SECRET Worker secret first."]) : T("لسه مفيش توكن Cloudflare — من غيره اللوحة مش هتقدر تعرض النسخ ولا ترجّع نسخة.", "No Cloudflare token yet — without it the panel cannot list versions or roll back.")) + "</div>";
      return X.cardH(T("Cloudflare — لوحة المطوّر", "Cloudflare — developer panel"), state + how + form + msgH(msg)
        + '<p class="mut sm">' + h(T("التوكن بيتحفظ مشفّر مع باقي المفاتيح في ", "The token is stored encrypted with the other keys in ")) + '<a href="#keys">' + h(T("«مفاتيح الخدمات»", "«Service keys»")) + "</a>.</p>");
    }
    function L2x(p) { return p ? T(p[0], p[1]) : ""; }
    /* a rollback candidate made before this panel (the server's `panel`: false = older, null = could not be checked) */
    function panelChip(d) {
      if (!bool(d.can_rollback)) return "";
      if (d.panel === false) return " " + chip("⚠ " + T("أقدم من لوحة المطوّر", "Older than the developer panel"), "p");
      if (d.panel === null) return " " + chip("? " + T("مش متأكدين إن فيها لوحة المطوّر", "Developer panel not confirmed"), "g");
      return "";
    }
    function pagesCard(p, c) {
      p = p || {};
      var items = arr(p.items), prj = str(p.project || PAGES_PROJECT);
      c.st.pages = items;
      var rows = items.map(function (d, i) {
        var prod = str(d.environment || "production") === "production", cur = bool(d.is_current) || (p.current_id && d.id === p.current_id), can = d.can_rollback != null ? bool(d.can_rollback) : false;
        var meta = [when(d.created_on)]; if (d.commit_hash) meta.push('<code dir="ltr">' + h(str(d.commit_hash).slice(0, 7)) + "</code>"); if (d.branch) meta.push('<span dir="ltr">' + h(d.branch) + "</span>"); if (d.trigger) meta.push('<small class="mut" dir="ltr">' + h(d.trigger) + "</small>");
        return '<li class="' + (cur ? "cur" : "") + '"><div class="m"><div><b dir="ltr">' + h(d.short_id || short(d.id) || "—") + "</b> " + (cur ? chip(T("الشغّالة دلوقتي ✓", "Live now ✓"), "ok") + " " : "") + stChip(d.status) + " " + chip(prod ? T("الموقع الحقيقي", "Production") : T("تجربة", "Preview"), prod ? "b" : "g") + panelChip(d) + "</div>"
          + '<div class="sm">' + meta.join(" · ") + "</div>" + (d.commit_message ? '<div class="sm mut" dir="auto">' + h(X.cut(d.commit_message, 140)) + "</div>" : "") + "</div>"
          + '<div class="a">' + (d.url ? extA(d.url, h(T("فتح ↗", "Open ↗")), "btn l s") + " " : "") + (can ? X.btn("dvroll", h(T("↩ ارجع للنسخة دي", "↩ Roll back to this")), "d s", ' data-t="pages" data-i="' + i + '"') : "") + "</div></li>";
      }).join("");
      return X.cardH(T(TARGETS.pages[0], TARGETS.pages[1]), blockErr(p) + '<p class="mut sm">' + h(T("المشروع ", "Project ")) + '<b dir="ltr">' + h(prj) + "</b> · " + h(T("آخر النشرات (الأحدث فوق)", "Latest deployments (newest first)")) + "</p>"
        + (items.length ? '<ul class="dv-l">' + rows + "</ul>" : p.ok === false ? "" : '<p class="mut">' + h(T("مفيش نشرات.", "No deployments.")) + "</p>"));
    }
    function workerCard(w, wi, c) {
      var name = str(w.script || w.name), items = arr(w.items), cv = (w.current && w.current.version_id) || "";
      c.st.workers[wi] = { name: name, items: items };
      var rows = items.map(function (v, i) {
        var cur = bool(v.is_current) || (cv && v.id === cv), can = v.can_rollback != null ? bool(v.can_rollback) : false;
        var meta = [when(v.created_on)]; if (v.author_email) meta.push('<span dir="ltr">' + h(v.author_email) + "</span>"); if (v.source) meta.push('<small class="mut" dir="ltr">' + h(v.source) + "</small>");
        var note = str(v.message || v.tag || "");
        var tr = +v.traffic, part = tr > 0 && tr < 100 ? " " + chip(T("بياخد ", "serving ") + tr + "%", "p") : "";
        return '<li class="' + (cur ? "cur" : "") + '"><div class="m"><div><b dir="ltr">' + h(v.number != null && v.number !== "" ? "v" + v.number : short(v.id)) + '</b> <small class="mut" dir="ltr">' + h(short(v.id)) + "</small> " + (cur ? chip(T("الشغّالة دلوقتي ✓", "Live now ✓"), "ok") : "") + part + panelChip(v) + "</div>"
          + '<div class="sm">' + meta.join(" · ") + "</div>" + (note ? '<div class="sm mut" dir="auto">' + h(X.cut(note, 140)) + "</div>" : "") + "</div>"
          + '<div class="a">' + (can ? X.btn("dvroll", h(T("↩ انشر النسخة دي", "↩ Deploy this version")), "d s", ' data-t="' + h(name) + '" data-w="' + wi + '" data-i="' + i + '"') : "") + "</div></li>";
      }).join("");
      var tg = TARGETS[name];
      return X.cardH("Worker: " + name, blockErr(w) + (tg ? '<p class="mut sm">' + h(T(tg[0], tg[1])) + "</p>" : "")
        + (items.length ? '<ul class="dv-l">' + rows + "</ul>" : w.ok === false ? "" : '<p class="mut">' + h(T("مفيش نسخ.", "No versions.")) + "</p>"));
    }
    RUN.deploys = function (c) {
      c.st.workers = []; c.st.pages = [];
      var paint = function () {
        var j = c.st.j || {}, ws = arr(j.workers), ready = j.ready !== false && bool((j.token || {}).set) && (j.token || {}).readable !== false;
        c.st.workers = [];
        body(c, '<div class="info">' + h(T("لو حاجة باظت بعد نشر: ارجع للنسخة اللي قبلها بضغطة — الموقع بيرجع زي ما كان خلال ثواني. الترجيع مابيمسحش أي نسخة: بين النسخ اللي فيها لوحة المطوّر تقدر ترجع للأحدث تاني من هنا بنفس الطريقة.", "If something breaks after a deploy: roll back to the previous version in one click — the site is back as it was within seconds. A rollback deletes no version: between versions that have the developer panel you can go forward again from here the same way."))
          + '<br><small>' + h(T("⚠ النسخ المعلّمة «أقدم من لوحة المطوّر» معمولة قبل اللوحة دي: الرجوع لها بيشيل قسم «🛠️ المطوّر» (والرجوع للأحدث بيبقى من لوحة Cloudflare) وبيوقّف تطبيق المزايا اللي غيّرتها — علشان كده بنطلب تأكيد تاني قبلها.", "⚠ Versions marked «older than the developer panel» were made before this panel: going back to one removes «🛠️ Developer» (going forward again is then done in the Cloudflare dashboard) and stops the switches you changed — so a second confirmation is asked first.")) + "</small></div>"
          + (ready ? "" : tokenCard(j, c.st.msg))
          + (ready ? pagesCard(j.pages, c) + '<div class="gr">' + ws.map(function (w, i) { return workerCard(w, i, c); }).join("") + "</div>" : "")
          + (ready && j.fetched_at ? '<p class="mut sm">' + h(T("آخر تحديث للقايمة: ", "List fetched: ")) + when(j.fetched_at) + "</p>" : "")
          + (ready ? tokenCard(j, c.st.msg) : ""));
      };
      var load = function (force) {
        var k = CACHE.deploys;
        if (!force && k && Date.now() - k.t < FRESH) { c.st.j = k.j; paint(); return; }
        body(c, X.loadingH());
        X.GET(API.deploys + "?limit=10", { timeout: 45000 }).then(function (j) { CACHE.deploys = { t: Date.now(), j: j || {} }; if (!X.alive(c)) return; c.st.j = j || {}; paint(); }, function (e) { if (X.alive(c)) body(c, X.errH(e)); });
      };
      c.on.retry = function () { load(true); };
      c.on.dvtsave = function (b) {
        var inp = $("#dvtok"), v = inp ? trim(inp.value) : "";
        if (!v) { X.toast(T("الصق التوكن الأول.", "Paste the token first."), 1); if (inp) inp.focus(); return; }
        if (v.length < 16 || /\s/.test(v.replace(/^bearer\s+/i, ""))) { X.toast(T("التوكن لازم يكون 16 حرف أو أكتر من غير مسافات.", "The token must be 16+ characters without spaces."), 1); return; }
        b.disabled = true;
        X.PUT(API.keys + "/" + enc(SLOT), { value: v }).then(function () { if (inp) inp.value = ""; v = ""; c.st.msg = { ok: true, t: T("اتحفظ ✓ — التوكن متسجّل", "Saved ✓ — the token is registered") }; load(true); },
          function (e) { if (inp) inp.value = ""; v = ""; b.disabled = false; c.st.msg = { ok: false, t: X.errText(e), e: e }; paint(); });
      };
      c.on.dvttest = function (b) {
        b.disabled = true; b.textContent = T("جارٍ الاختبار…", "Testing…");
        X.POST(API.keys + "/" + enc(SLOT) + "/test", {}, { timeout: 30000 }).then(function (r) {
          r = r || {}; var ck = r.checks || {}, parts = ["token", "pages", "workers"].filter(function (k) { return ck[k] != null; }).map(function (k) { return (ck[k] === true || (ck[k] && ck[k].ok) ? "✓ " : "✗ ") + k; });
          c.st.msg = { ok: !!r.ok, t: (r.ok ? "✓ " + T("الاختبار نجح", "The test passed") : "✗ " + T("الاختبار فشل", "The test failed")) + (r.detail ? " — " + r.detail : "") + (parts.length ? " (" + parts.join(" · ") + ")" : "") }; paint();
        }, function (e) { c.st.msg = { ok: false, t: X.errText(e), e: e }; paint(); });
      };
      c.on.dvtdel = function (b) {
        ask(T("مسح توكن Cloudflare؟", "Delete the Cloudflare token?"), "<p>" + h(T("اللوحة مش هتقدر تعرض النسخ ولا ترجّع نسخة لحد ما تحط توكن تاني.", "The panel cannot list versions or roll back until you add a token again.")) + "</p>", T("🗑 مسح", "🗑 Delete"), true).then(function (a) {
          if (!a.ok) return; b.disabled = true;
          X.DEL(API.keys + "/" + enc(SLOT)).then(function (r) { c.st.msg = { ok: true, t: T("اتمسح ✓", "Deleted ✓") + (r && r.env_in_force ? T(" — سر الـ Worker لسه شغّال", " — the Worker secret is still in use") : "") }; load(true); }, function (e) { b.disabled = false; c.st.msg = { ok: false, t: X.errText(e), e: e }; paint(); });
        });
      };
      /* the steps the server asks the owner to confirm AGAIN (worker/src/acc-dev.js postRollback): 409 pre_panel (a build / version older
         than this panel) and 409 secrets_changed (Cloudflare); each answer carries a signed `ack` (10 min) that the next request sends back */
      function featList(j) {
        var l = arr(j && j.changed_features).map(function (f) { return "<li>" + h(L(f, "label_ar", "label_en") || str(f.key)) + ' <small class="mut">(' + h(f.value ? T("شغّالة", "on") : T("متوقفة", "off")) + ")</small></li>"; }).join("");
        return l ? '<p class="sm"><b>' + h(T("المزايا اللي غيّرتها ومش هتتطبّق بعد الرجوع:", "Switches you changed that will stop applying after the rollback:")) + '</b></p><ul class="sm dv-warnl">' + l + "</ul>" : "";
      }
      function backWay(tgt) {
        var cf = "https://dash.cloudflare.com/" + ACCOUNT + (tgt === "pages" ? "/pages/view/" + PAGES_PROJECT : "/workers/services/view/" + tgt + "/production");
        /* each step isolated (<bdi>): the Latin menu names keep their order inside the Arabic sentence */
        var steps = [T("لوحة Cloudflare", "Cloudflare dashboard"), "Workers & Pages", tgt === "pages" ? PAGES_PROJECT : tgt, "Deployments", tgt === "pages" ? T("آخر نشرة", "the newest deployment") : T("آخر نسخة", "the newest version"), tgt === "pages" ? "Rollback to this deployment" : "Deploy"];
        return '<p class="sm" dir="auto">' + h(T("الرجوع للأحدث بعدها: ", "Going forward again afterwards: ")) + steps.map(function (x) { return "<bdi>" + h(x) + "</bdi>"; }).join(h(T(" ← ", " → ")))
          + h(T("، أو أي نشر جديد من GitHub. ", ", or any new deploy from GitHub. ")) + extA(cf, h(T("افتح لوحة Cloudflare ↗", "Open the Cloudflare dashboard ↗"))) + "</p>";
      }
      function prePanelMsg(tgt) {
        return tgt === "pages"
          ? T("نشرة الموقع دي معمولة قبل لوحة المطوّر. لو رجعت لها: قسم «🛠️ المطوّر» هيختفي من لوحة التحكم لحد ما ترجع للأحدث، والمزايا اللي غيّرتها مش هتتطبّق على صفحات الموقع (السيرفر بيفضل يرفض المكالمات والتسجيل المقفولين). ارجع بس لو متأكد، واكتب «" + CONFIRM + "» تاني.",
              "This site deployment was made before the developer panel. If you go back to it: «🛠️ Developer» disappears from the Control Center until you go forward again, and the switches you changed stop applying on the site's pages (the server still refuses switched-off calls and registrations). Continue only if you are sure, and type «" + CONFIRM + "» again.")
          : T("نسخة السيرفر دي معمولة قبل لوحة المطوّر. لو رجعت لها: لوحة المطوّر هتختفي لحد ما ترجع للأحدث، وكل المزايا اللي قفلتها هترجع تشتغل، وتوكن Cloudflare هيفضل محفوظ ومش هتقدر تمسحه من «مفاتيح الخدمات» (لو عايز تمسحه، امسحه قبل الرجوع). ارجع بس لو متأكد، واكتب «" + CONFIRM + "» تاني.",
              "This server version was made before the developer panel. If you go back to it: the developer panel disappears until you go forward again, every switch you turned off works again, and the Cloudflare token stays saved and cannot be deleted from «Service keys» (delete it before the rollback if you want it gone). Continue only if you are sure, and type «" + CONFIRM + "» again.");
      }
      c.on.dvroll = function (b) {
        var tgt = b.getAttribute("data-t"), i = +b.getAttribute("data-i"), it, label, note, word = str((c.st.j || {}).confirm_word) || CONFIRM;
        if (tgt === "pages") { it = (c.st.pages || [])[i]; if (!it) return; label = T("نشر الموقع ", "site deployment ") + (it.short_id || short(it.id)); note = T("الصفحات هترجع زي ما كانت في النشر ده.", "The pages go back to what they were in this deployment."); }
        else { var w = c.st.workers[+b.getAttribute("data-w")]; it = w && w.items[i]; if (!it || !w) return; label = "Worker " + w.name + " " + (it.number != null && it.number !== "" ? "v" + it.number : short(it.id)); tgt = w.name;
          note = T("ترجيع الـ Worker بيرجّع إعدادات النسخة دي كمان.", "A Worker rollback also brings back that version's settings.") + (w.name === "janna-lookup" ? " " + T("وده السيرفر اللي بيرد على الصفحة دي: أول طلب بعده ممكن ياخد ثانية.", "This is the server that answers this page: the next request may take a second.") : ""); }
        var older = it.panel === false || it.panel === null;
        X.typed({ title: T("↩ ترجيع نسخة", "↩ Roll back"), expect: word, ok: T("↩ ارجع", "↩ Roll back"),
          msg: T("هتخلّي " + label + " (" + X.fd(it.created_on, true) + ") هي الشغّالة على الموقع الحقيقي. " + note + " اكتب «" + word + "» علشان تأكّد.", "This makes " + label + " (" + X.fd(it.created_on, true) + ") the live version. " + note + " Type «" + word + "» (Arabic for “go back”) to confirm."),
          extra: (older ? '<div class="alert sm" dir="auto">⚠ ' + h(it.panel === false ? T("النسخة دي أقدم من لوحة المطوّر — بعد ما تأكّد هنا هنوريك اللي هيحصل ونطلب تأكيد تاني.", "This version predates the developer panel — after you confirm here we show what happens and ask once more.") : T("مش قادرين نتأكد إن النسخة دي فيها لوحة المطوّر — هنطلب تأكيد تاني.", "We cannot confirm this version has the developer panel — a second confirmation follows.")) + "</div>" : "")
            + ((it.commit_message || it.message) ? '<p class="sm mut" dir="auto">' + h(X.cut(it.commit_message || it.message, 200)) + "</p>" : "") + REASON_IN(),
          submit: function (r) {
            var reason = trim((r.vals && r.vals.reason) || "").slice(0, 300), bd = { target: tgt, id: str(it.id), confirm: word };
            if (reason) bd.reason = reason;
            send(r, bd);
          } });
        function again(bd, extra) { var b2 = {}, k; for (k in bd) if (Object.prototype.hasOwnProperty.call(bd, k)) b2[k] = bd[k]; for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) b2[k] = extra[k]; return b2; }
        /* the POST; a 409 pre_panel / secrets_changed with an ack → one more typed confirmation that sends the SAME body with that ack
           (and force: true for secrets) — only if the owner agrees; any other error stays in the open dialog */
        function send(r, bd, st) {
          st = st || {};   /* the steps already confirmed again in this rollback (never asked twice) */
          X.POST(API.rollback, bd, { timeout: 60000 }).then(function (res) {
            r.done(); res = res || {};
            X.toast((res.note_ar || res.note_en ? L(res, "note_ar", "note_en") : T("اترجّعت ✓ — ", "Rolled back ✓ — ") + label + T(" هي الشغّالة دلوقتي", " is live now")) + T(" (اتسجّلت في السجل)", " (logged)"));
            CACHE.deploys = null;
            if (!X.alive(c)) return;
            if (res.pre_panel) {
              /* an older build / version is live now: say plainly what is gone and the way forward (for janna-lookup this panel's API is gone too) */
              c.st.msg = { ok: true, t: (tgt === "pages" ? T("الموقع رجع لنشرة أقدم من لوحة المطوّر: بعد تحديث الصفحة قسم «🛠️ المطوّر» مش هيظهر. للرجوع للأحدث: لوحة Cloudflare ← Workers & Pages ← madeinegyptgate ← Deployments ← آخر نشرة ← Rollback.", "The site is back on a deployment older than the developer panel: after a reload «🛠️ Developer» is not shown. To go forward again: Cloudflare dashboard → Workers & Pages → madeinegyptgate → Deployments → the newest deployment → Rollback.")
                : T("السيرفر رجع لنسخة أقدم من لوحة المطوّر: اللوحة دي مش هتشتغل لحد ما ترجع للأحدث من لوحة Cloudflare ← Workers & Pages ← " + tgt + " ← Deployments ← آخر نسخة ← Deploy.", "The server is back on a version older than the developer panel: this panel stops working until you go forward again in the Cloudflare dashboard → Workers & Pages → " + tgt + " → Deployments → the newest version → Deploy.")) };
              if (tgt === "janna-lookup") { body(c, msgH(c.st.msg) + backWay(tgt)); return; }
            } else c.st.msg = null;
            setTimeout(function () { if (X.alive(c)) load(true); }, tgt === "janna-lookup" ? 1500 : 0);
          }, function (e) {
            var j = (e && e.j) || {};
            if (e && e.code === "pre_panel" && j.ack && !st.pre) {
              r.done();
              X.typed({ title: tgt === "pages" ? T("⚠ نشرة أقدم من لوحة المطوّر", "⚠ A deployment older than the developer panel") : T("⚠ نسخة أقدم من لوحة المطوّر", "⚠ A version older than the developer panel"), expect: word, ok: T("↩ ارجع برضه", "↩ Roll back anyway"),
                msg: prePanelMsg(tgt) + (j.panel === null ? " " + T("(مش قادرين نتأكد منها: Cloudflare ماردّش على الفحص.)", "(It could not be checked: Cloudflare did not answer the check.)") : ""),
                extra: featList(j) + backWay(tgt),
                submit: function (r2) { send(r2, again(bd, { ack: str(j.ack) }), { pre: true, sec: st.sec }); } });
              return;
            }
            if (e && e.code === "secrets_changed" && j.force_allowed !== false && j.ack && !st.sec) {
              var names = arr(j.secrets).map(function (x) { return str(x); }).filter(function (x) { return /^[A-Za-z0-9_.-]{1,80}$/.test(x); }).join(" · ");
              r.done();
              X.typed({ title: T("⚠ أسرار الـ Worker اتغيّرت بعد النسخة دي", "⚠ The Worker's secrets changed after this version"), expect: word, ok: T("↩ ارجع برضه", "↩ Roll back anyway"),
                msg: T("Cloudflare رفض الترجيع لأن الأسرار دي اتغيّرت بعد ما النسخة دي اتعملت: ", "Cloudflare refused the rollback because these secrets changed after this version was made: ") + (names || "—")
                  + T(". لو رجعت برضه، النسخة دي هترجع بإعداداتها هي — ارجع برضه بس لو متأكد، واكتب «" + word + "» تاني.", ". If you roll back anyway, this version comes back with its own settings — continue only if you are sure, and type «" + word + "» again."),
                submit: function (r2) { send(r2, again(bd, { ack: str(j.ack), force: true }), { pre: st.pre, sec: true }); } });
              return;
            }
            r.err(e); var er = $("#bx .er"); if (er) er.innerHTML = h(errFull(e)) + X.errSmall(e);
          });
        }
      };
      load(false);
    };

    /* ---------------------------------------------------------------- 3) code ---------------------------------------------------------------- */
    RUN.code = function (c) {
      var gh = "https://github.com/" + REPO, cf = "https://dash.cloudflare.com/" + ACCOUNT;
      var L1 = [
        ["📦", T("الكود على GitHub", "The code on GitHub"), T("كل ملفات الموقع والسيرفر — وتاريخ كل تعديل", "All the site and server files — and every change's history"), gh],
        ["✏️", T("عدّل من المتصفح", "Edit in the browser"), T("محرر github.dev — من غير ما تنزّل حاجة", "The github.dev editor — nothing to install"), "https://github.dev/" + REPO],
        ["🚀", T("تشغيلات النشر (Actions)", "Deploy runs (Actions)"), T("كل نشر تلقائي: شغّال، نجح، ولا فشل", "Every automatic deploy: running, passed or failed"), gh + "/actions"],
        ["🤖", "Claude Code", T("اطلب التعديل بالكلام — وهو يكتبه ويحفظه على GitHub", "Ask for a change in words — it writes it and saves it to GitHub"), "https://claude.ai/code"],
        ["📘", T("دليل المالك", "Owner guide"), T("خطوة بخطوة بالعربي: إزاي تغيّر وتنشر وترجع", "Step by step in Arabic: how to change, deploy and roll back"), gh + "/blob/main/OWNER-GUIDE-AR.md"]
      ];
      var L2l = [
        ["☁️", T("مشروع الموقع على Cloudflare Pages", "The site's Cloudflare Pages project"), PAGES_PROJECT, cf + "/pages/view/" + PAGES_PROJECT],
        ["⚙️", "Worker janna-lookup", T("السيرفر الرئيسي", "The main server"), cf + "/workers/services/view/janna-lookup/production"],
        ["📰", "Worker migate-intel", T("مركز المعلومات", "The Information Center"), cf + "/workers/services/view/migate-intel/production"]
      ];
      var tile = function (x) { return extA(x[3], '<i aria-hidden="true">' + x[0] + "</i><span><b>" + h(x[1]) + '</b><span class="d">' + h(x[2]) + '</span><small dir="ltr">' + h(x[3].replace(/^https:\/\//, "")) + "</small></span>", "dv-tile"); };
      body(c, X.cardH(T("إزاي التعديل بيوصل للموقع", "How a change goes live"), '<p class="dv-p" dir="auto">' + h(T(
          "أي تعديل بيتحفظ (Commit) على الفرع main في GitHub — سواء من «عدّل من المتصفح» أو من Claude Code — بيشغّل النشر التلقائي: GitHub Actions بيبني الموقع وينشره على Cloudflare خلال دقايق. تابع التشغيل من «تشغيلات النشر»؛ ولو حاجة باظت بعد النشر، ارجع للنسخة اللي قبلها من تبويب «النشر» هنا بضغطة.",
          "Every change committed to the main branch on GitHub — from «Edit in the browser» or from Claude Code — starts the automatic deploy: GitHub Actions builds the site and publishes it to Cloudflare within minutes. Follow it under «Deploy runs»; if something breaks after a deploy, go back to the previous version from the «Deploys» tab here in one click.")) + "</p>")
        + '<div class="dv-tiles">' + L1.map(tile).join("") + "</div>"
        + X.cardH(T("لوحة Cloudflare", "Cloudflare dashboard"), '<div class="dv-tiles sm2">' + L2l.map(tile).join("") + '</div><p class="mut sm">' + h(T("الحساب: ", "Account: ")) + '<code dir="ltr">' + h(ACCOUNT) + "</code></p>"));
    };

    /* ---------------------------------------------------------------- 4) health ---------------------------------------------------------------- */
    var GROUPS = [["page", "الصفحات", "Pages"], ["api", "الـ API", "APIs"], ["intel", "مركز المعلومات", "Information Center"], ["", "فحوصات تانية", "Other checks"]];
    var INCARD = { db: 1, worker: 1 };   /* shown inside «قاعدة البيانات» / «نسخة السيرفر» */
    function rowH(k) {
      var ok = bool(k.ok), lab = L(k, "label_ar", "label_en") || k.id || k.url || "", u = str(k.url || ""), meta = [k.status != null && k.status !== "" ? String(k.status) : "", dur(k.ms)].filter(function (s) { return s; });
      return '<li class="' + (ok ? "ok" : "bad") + '"><span class="dot" aria-hidden="true"></span><span class="lb"><b dir="auto">' + h(lab) + "</b>" + (u ? ' <small class="mut" dir="ltr">' + h(u.replace(/^https:\/\//, "")) + "</small>" : "")
        + (k.detail ? '<small class="dtl" dir="auto">' + h(X.cut(str(k.detail), 220)) + "</small>" : "") + '</span><span class="mt" dir="ltr">' + h(meta.join(" · ")) + "</span>"
        + '<span class="sr">' + h(ok ? T("شغّال", "OK") : T("فيه مشكلة", "Problem")) + "</span></li>";
    }
    RUN.health = function (c) {
      var paint = function (j) {
        j = j || {};
        var checks = arr(j.checks), bad = checks.filter(function (k) { return !bool(k.ok); }).length, tabs = arr(j.tables), wv = j.worker && typeof j.worker === "object" ? j.worker : null;
        var badT = tabs.filter(function (t) { return t.rows == null || t.ok === false; }).length;
        var sum = !checks.length ? "" : bad || j.ok === false ? '<div class="alert dv-sum" role="status">✗ ' + h(T("فيه " + Math.max(bad, 1) + " مشكلة من " + checks.length + " فحص", Math.max(bad, 1) + " problem" + (bad > 1 ? "s" : "") + " out of " + checks.length + " checks")) + "</div>"
          : '<div class="okc dv-sum" role="status">✓ ' + h(T("كله شغّال (" + checks.length + " من " + checks.length + ")", "All good (" + checks.length + " of " + checks.length + ")")) + "</div>";
        var known = {}; GROUPS.forEach(function (g) { known[g[0]] = 1; });
        var inCard = function (gk) { var ks = checks.filter(function (k) { return str(k.group) === gk; }); return ks.length ? '<ul class="dv-h">' + ks.map(rowH).join("") + "</ul>" : ""; };
        var groups = GROUPS.map(function (g) {
          var ks = checks.filter(function (k) { var kg = str(k.group); return g[0] ? kg === g[0] : !known[kg] && !INCARD[kg]; });
          return ks.length ? X.cardH(T(g[1], g[2]), '<ul class="dv-h">' + ks.map(rowH).join("") + "</ul>") : "";
        }).join("");
        body(c, sum + '<p class="mut sm">' + h(T("آخر فحص: ", "Last check: ")) + (j.checked_at ? when(j.checked_at) : "—") + (j.ms != null ? " · " + h(T("استغرق ", "took ")) + '<span dir="ltr">' + h(dur(j.ms)) + "</span>" : "") + "</p>"
          + '<div class="acts2" style="margin-bottom:12px">' + X.btn("dvhrun", h(T("🔄 افحص تاني", "🔄 Check again")), "r") + "</div>"
          + (groups || X.cardH(T("الفحوصات", "Checks"), '<p class="mut">' + h(T("السيرفر مارجّعش فحوصات.", "The server returned no checks.")) + "</p>"))
          + '<div class="gr">'
          + X.cardH(T("قاعدة البيانات (D1) — عدد الصفوف", "Database (D1) — row counts"), inCard("db") + (tabs.length ? (badT ? '<p class="bad sm">' + h(T(badT + " جدول مش موجود أو مش بيرد", badT + " table(s) missing or not answering")) + "</p>" : "") + '<div class="dv-tb">' + tabs.map(function (t) { var miss = t.rows == null || t.ok === false; return '<div class="row' + (miss ? " bad" : "") + '"><span dir="ltr">' + h(str(t.name)) + "</span><b dir=\"ltr\">" + h(miss ? T("مش موجود", "missing") : X.nf(t.rows)) + "</b></div>"; }).join("") + '</div><p class="mut sm">' + h(T("قراية بس — مفيش أي تعديل.", "Read only — nothing is changed.")) + "</p>" : '<p class="mut">' + h(T("مفيش أرقام.", "No figures.")) + "</p>"))
          + X.cardH(T("نسخة السيرفر", "Server version"), inCard("worker") + (wv ? X.kvH([[T("الـ Worker", "Worker"), str(wv.script || "janna-lookup"), "ltr"], [T("النسخة", "Version"), str(wv.version_id || ""), "ltr"], [T("الوسم", "Tag"), str(wv.version_tag || ""), "ltr"], [T("اتنشرت", "Deployed"), wv.version_at ? X.fd(wv.version_at, true) : ""], [T("نسخة البيانات", "Data version"), str(wv.data_v || ""), "ltr"]]) + (wv.source === "none" ? '<p class="mut sm">' + h(T("الـ Worker مش متوصّل بمعلومات النسخة (version metadata).", "The Worker has no version-metadata binding.")) + "</p>" : "") : '<p class="mut">' + h(T("السيرفر مارجّعش رقم نسخة.", "The server returned no version.")) + "</p>"))
          + "</div>");
      };
      var load = function (force) {
        var k = CACHE.health;
        if (!force && k && Date.now() - k.t < FRESH) { paint(k.j); return; }
        body(c, '<div class="cd"><div class="in" role="status">' + h(T("جارٍ الفحص… (ممكن ياخد كام ثانية)", "Checking… (this can take a few seconds)")) + "</div></div>");
        X.GET(API.health, { timeout: 45000 }).then(function (j) { CACHE.health = { t: Date.now(), j: j || {} }; if (X.alive(c)) paint(j); }, function (e) { if (X.alive(c)) body(c, X.errH(e)); });
      };
      c.on.retry = function () { load(true); }; c.on.dvhrun = function () { load(true); };
      load(false);
    };

    /* ---------------------------------------------------------------- 5) the daily calls report ---------------------------------------------------------------- */
    var CR_RUN = { done: ["اتبعت ✓", "Sent ✓", "ok"], failed: ["ماتبعتش ✗", "Not sent ✗", "x"], open: ["لسه", "Not yet", "g"] };
    var CR_MAIL = { sent: ["اتبعت", "sent"], failed: ["فشل", "failed"], skipped: ["اتعدّى (القالب مقفول)", "skipped (template off)"] };
    var CR_OPT = {
      detail: [["masked", "محجوبة (الإيميل a•••@… والموبايل آخر رقمين)", "Masked (e-mail a•••@…, mobile last 2 digits)"], ["full", "كاملة (للأعضاء واللي بعتوا طلب أو حجزوا اجتماع بس)", "Full (members and people who sent a request or booked a meeting only)"]],
      tests: [["summary", "سطر واحد بس", "One line"], ["full", "كروت كاملة", "Full cards"], ["off", "مخفية", "Hidden"]],
      empty: [["send", "ابعت تقرير قصير", "Send a short report"], ["skip", "ماتبعتش حاجة", "Send nothing"]]
    };
    function crSel(k, cur) { return '<select data-cr="' + k + '">' + CR_OPT[k].map(function (o) { return '<option value="' + h(o[0]) + '"' + (o[0] === cur ? " selected" : "") + ">" + h(T(o[1], o[2])) + "</option>"; }).join("") + "</select>"; }
    RUN.calls = function (c) {
      var val = function (k) { var e = $('#dvb [data-cr="' + k + '"]'); return e ? (e.type === "checkbox" ? !!e.checked : trim(e.value)) : ""; };
      var paint = function (j, msg) {
        if (!X.alive(c)) return; j = j || {}; c.st.cr = j;
        var st = j.settings || {}, f = j.feature || {}, ap = j.anam || {}, rt = j.route || {}, lim = j.limits || {}, fc = j.full_confirm || {};
        var fchip = f.effective ? chip(T("شغّال ✓", "On ✓"), "ok") : f.locked ? chip("🔒 " + T("مقفول", "Locked"), "p") : chip(T("مقفول من «المزايا»", "Off in «Features»"), "x");
        var head1 = '<p class="sm">' + fchip + " " + h(T("بيوصل كل يوم الساعة ", "Every day at ")) + '<b dir="ltr">' + h(st.time || "08:30") + "</b>" + h(T(" بتوقيت القاهرة بتقرير اليوم اللي فات.", " Cairo time, with the day before.")) + "</p>"
          + (f.locked ? '<p class="lkr" dir="auto">🔒 ' + h(why(f.locked)) + "</p>" : "")
          + '<p class="sm">' + (ap.ok ? chip(T("Anam: قراءة الجلسات شغّالة ✓", "Anam: reading sessions works ✓"), "ok") : chip(T("Anam: مش قادر يقرا الجلسات", "Anam: cannot read sessions"), "x") + ' <span dir="auto">' + h(L(ap, "detail_ar", "detail_en")) + "</span>") + "</p>"
          /* the technical side of the e-mail's plain note «معرفة مين اللي اتكلم … لسه بالتقريب»: the migration and where it is run */
          + (j.setup ? '<p class="sm">' + (j.setup.exact_ids ? chip(T("ربط المكالمات بأصحابها شغّال ✓", "Caller identities: exact ✓"), "ok")
            : chip(T("ربط المكالمات بأصحابها: بالتقريب", "Caller identities: approximate"), "g") + ' <span dir="auto">' + h(T("ملف قاعدة البيانات ", "The database file ")) + '<bdi dir="ltr">' + h(str(j.setup.migration)) + "</bdi>"
              + h(T(" لسه ماتشغّلش — شغّله من ", " is not applied yet — run it from ")) + '<bdi dir="ltr">' + h(str(j.setup.how)) + "</bdi>"
              + h(T(" (النسخة الاحتياطية الأول، بعد ما كود الـ Worker يبقى live). لحد كده التقرير بيعرف مين اتكلم بالتقريب.", " (the backup first, once the Worker code is live). Until then the report knows who talked only approximately.")) + "</span>") + "</p>" : "")
          + (rt.attachments === false ? '<p class="mut sm">' + h(T("طريقة الإرسال الحالية مابتبعتش ملفات مرفقة: التقرير هيوصل من غير ملف calls-<اليوم>.csv.", "The current e-mail route sends no attachments: the report goes without calls-<day>.csv.")) + "</p>" : "");
        var def = j.using_default ? '<div class="alert" dir="auto">' + h(T("المستلم الافتراضي دلوقتي: ", "The default recipient now: ")) + '<bdi dir="ltr">' + h(arr(j.recipients).join(", ")) + "</bdi>" + h(T(" — وده كمان إيميل خدمة العملاء العام. حط إيميلك هنا علشان التقرير (وفيه بيانات أشخاص) يوصلك إنت بس.", " — it is also the public customer-service mailbox. Put your own address here so the report (it holds personal data) reaches you only.")) + "</div>" : "";
        var form = '<div class="fr"><label class="w">' + h(T("المستلمين (لحد " + (lim.to_max || 5) + " — إيميل في كل سطر)", "Recipients (up to " + (lim.to_max || 5) + " — one per line)")) + '<textarea data-cr="to" dir="ltr" rows="3" maxlength="1300" placeholder="you@madeinegyptgate.com">' + h(arr(st.to).join("\n")) + "</textarea></label></div>"
          + '<label class="sm" dir="auto"><input type="checkbox" data-cr="confirm_external"> ' + h(T("أأكد إن التقرير (وفيه بيانات أشخاص) يروح كمان لإيميلات برّه madeinegyptgate.com اللي فوق", "I confirm the report (it holds personal data) may also go to the addresses above outside madeinegyptgate.com")) + "</label>"
          + '<div class="fr"><label>' + h(T("الميعاد (بتوقيت القاهرة)", "Time (Cairo)")) + '<input type="time" data-cr="time" min="' + h(lim.time_min || "05:00") + '" max="' + h(lim.time_max || "12:00") + '" value="' + h(st.time || "08:30") + '" dir="ltr"></label>'
          + "<label>" + h(T("بيانات التواصل", "Contact details")) + crSel("detail", st.detail || "masked") + "</label>"
          + "<label>" + h(T("مكالمات الفريق", "Team test calls")) + crSel("tests", st.tests || "summary") + "</label>"
          + "<label>" + h(T("يوم مفيهوش مكالمات", "A day without calls")) + crSel("empty", st.empty || "send") + "</label>"
          + "<label>" + h(T("مدة حفظ التقييمات (يوم، ٠ = على طول)", "Keep the reviews (days, 0 = keep)")) + '<input type="number" data-cr="keep_days" min="0" max="' + h(String(lim.keep_max || 730)) + '" value="' + h(String(st.keep_days != null ? st.keep_days : 180)) + '" dir="ltr"></label></div>'
          + '<label class="sm" dir="auto"><input type="checkbox" data-cr="confirm_full"' + (st.full_confirmed ? " checked" : "") + "> " + h(L(fc, "ar", "en") || T("أنا موافق على البيانات الكاملة.", "I agree to full contacts.")) + "</label>"
          + '<p class="mut sm" dir="auto">' + h(T("«كاملة» بتضيف الإيميل والموبايل كاملين للأعضاء واللي بعتوا طلب أو حجزوا اجتماع بس، ولمستلمين على madeinegyptgate.com بس — وأي حاجة اتقالت في مكالمة عمرها ما بتظهر.", "«Full» adds the full e-mail and mobile of members and of people who sent a request or booked a meeting only, to recipients on madeinegyptgate.com only — nothing said in a call ever appears.")) + "</p>"
          + '<div class="acts2">' + X.btn("dvCrSave", h(T("💾 حفظ", "💾 Save")), "s") + (j.using_default ? "" : X.btn("dvCrDef", h(T("↺ المستلم الافتراضي", "↺ The default recipient")), "l s")) + "</div>";
        var day = c.st.crDay || str(j.yesterday);
        var tools = '<div class="fr"><label>' + h(T("اليوم", "Day")) + '<input type="date" data-cr="day" value="' + h(day) + '" dir="ltr"></label></div>'
          + '<div class="acts2">' + X.btn("dvCrPrev", h(T("👁 معاينة يوم…", "👁 Preview a day…")), "l") + X.btn("dvCrSend", h(T("📤 ابعت تقرير يوم…", "📤 Send a day's report…")), "r") + "</div>"
          + '<p class="mut sm" dir="auto">' + h(T("المعاينة مابتبعتش حاجة (لحد " + (lim.previews_per_10min || 6) + " كل ١٠ دقايق)، والإرسال لحد " + (lim.sends_per_day || 3) + " مرات لكل يوم — والاتنين بيتسجّلوا في «السجل».", "A preview sends nothing (up to " + (lim.previews_per_10min || 6) + " per 10 minutes); a send is limited to " + (lim.sends_per_day || 3) + " per day — both are written to the «Log».")) + '</p><div id="dvCrOut"></div>';
        var runs = arr(j.runs).map(function (r) {
          var rs = CR_RUN[r.status] || CR_RUN.open;
          return '<li><b dir="ltr">' + h(str(r.day)) + "</b> " + chip(T(rs[0], rs[1]), rs[2]) + arr(r.mails).map(function (m) { var ms = CR_MAIL[m.status] || [str(m.status), str(m.status)]; return ' <small class="mut" dir="auto">' + h(T(ms[0], ms[1]) + (m.resend ? T(" (يدوي)", " (by hand)") : "") + " → ") + '<bdi dir="ltr">' + h(str(m.to)) + "</bdi>" + (m.error ? " — " + h(X.cut(str(m.error), 80)) : "") + "</small>"; }).join("") + "</li>";
        }).join("");
        body(c, X.cardH(T("تقرير المكالمات اليومي", "Daily calls report"), head1 + def + '<div id="dvCrMsg">' + msgH(msg) + "</div>" + form)
          + X.cardH(T("معاينة وإرسال", "Preview and send"), tools)
          + X.cardH(T("آخر ٧ أيام", "The last 7 days"), runs ? '<ul class="dv-pol">' + runs + "</ul>" : '<p class="mut">' + h(T("لسه مفيش تقارير.", "No reports yet.")) + "</p>"));
      };
      var load = function (msg) { X.GET(API.calls).then(function (j) { paint(j, msg); }, function (e) { if (X.alive(c)) body(c, X.errH(e)); }); };
      var bodyOf = function () {
        var list = String(val("to") || "").split(/[\s,;]+/).filter(function (x) { return x; });
        /* the default recipient in use and the box left empty: the other settings are saved and the recipients stay as they are */
        return { to: list.length || !(c.st.cr && c.st.cr.using_default) ? list : undefined, time: val("time"), detail: val("detail"), tests: val("tests"), empty: val("empty"), keep_days: parseInt(val("keep_days"), 10), confirm_external: !!val("confirm_external"), confirm_full: !!val("confirm_full") };
      };
      var dayOf = function () { var d = val("day"); c.st.crDay = d; return d; };
      c.on.retry = function () { load(); };
      c.on.dvCrSave = function (b) {
        b.disabled = true;
        X.PUT(API.calls, bodyOf()).then(function (j) { X.toast(j && j.unchanged ? T("مفيش تغيير", "Nothing changed") : T("اتحفظ ✓ — واتسجّل في السجل", "Saved ✓ — logged")); paint(j, { ok: true, t: T("اتحفظ.", "Saved.") }); },
          function (e) { b.disabled = false; X.toast(errFull(e), 1); var mm = $("#dvCrMsg"); if (mm) mm.innerHTML = msgH({ ok: false, t: errFull(e), e: e }); }); /* the owner's edits stay in the form */
      };
      c.on.dvCrDef = function (b) {
        ask(T("ترجع للمستلم الافتراضي؟", "Back to the default recipient?"), "<p>" + h(T("التقرير هيروح لإيميلات المنصة (ومنها إيميل خدمة العملاء العام)، والبيانات هترجع محجوبة.", "The report goes to the platform's own mailboxes (the public customer-service one included), with masked contacts.")) + "</p>", T("↺ رجّع", "↺ Go back"), false, false).then(function (a) {
          if (!a.ok || !X.alive(c)) return; b.disabled = true;
          X.PUT(API.calls, { use_default: true, detail: "masked" }).then(function (j) { X.toast(T("رجع للافتراضي ✓", "Back to the default ✓")); paint(j); }, function (e) { b.disabled = false; X.toast(errFull(e), 1); });
        });
      };
      c.on.dvCrPrev = function (b) {
        var d = dayOf(), out = $("#dvCrOut"); b.disabled = true;
        if (out) out.innerHTML = '<p class="mut" role="status">' + h(T("بجهّز المعاينة… (ممكن تاخد دقيقة)", "Building the preview… (it can take a minute)")) + "</p>";
        X.GET(API.callsPreview + X.qs({ day: d }), { timeout: 90000 }).then(function (j) {
          b.disabled = false; if (!X.alive(c)) return; var o = $("#dvCrOut"); if (!o) return;
          j = j || {}; var k = j.counts || {}, w = arr(j.warnings);
          o.innerHTML = '<p class="sm"><b dir="auto">' + h(str(j.subject)) + "</b></p>"
            + '<p class="mut sm">' + h(T("مكالمات: " + (k.conversations || 0) + " · عملاء: " + (k.customers || 0) + " · كروت: " + (j.cards || 0) + " · صفوف الملف: " + (j.csv_rows || 0), "Calls: " + (k.conversations || 0) + " · customers: " + (k.customers || 0) + " · cards: " + (j.cards || 0) + " · file rows: " + (j.csv_rows || 0))) + "</p>"
            + (w.length ? '<ul class="sm">' + w.map(function (x) { return '<li dir="auto">' + h(str(x)) + "</li>"; }).join("") + "</ul>" : "")
            + '<iframe sandbox="" title="' + h(T("معاينة التقرير", "Report preview")) + '" style="width:100%;height:560px;border:1px solid var(--line,#ddd);border-radius:10px;background:#fff" srcdoc="' + h('<!doctype html><meta charset="utf-8">' + str(j.html)) + '"></iframe>';
        }, function (e) { b.disabled = false; var o = $("#dvCrOut"); if (o) o.innerHTML = X.errH(e, false); X.toast(errFull(e), 1); });
      };
      c.on.dvCrSend = function (b) {
        var d = dayOf();
        ask(T("تبعت تقرير يوم " + d + "؟", "Send the report of " + d + "?"), "<p>" + h(T("التقرير هيتبعت دلوقتي للمستلمين اللي فوق، وده بيتسجّل في السجل.", "The report goes now to the recipients above; this is logged.")) + "</p>", T("📤 ابعت", "📤 Send"), false, false).then(function (a) {
          if (!a.ok || !X.alive(c)) return; b.disabled = true;
          X.POST(API.callsSend, { day: d }, { timeout: 90000 }).then(function (j) {
            b.disabled = false; var why2 = str(j && (j.reason || j.skipped));
            X.toast(j && j.sent ? T("اتبعت ✓ — واتسجّل في السجل", "Sent ✓ — logged") : T("ماتبعتش: ", "Not sent: ") + why2, !(j && j.sent));
            load(j && j.sent ? { ok: true, t: T("التقرير اتبعت.", "The report was sent.") } : { ok: false, t: T("ماتبعتش: ", "Not sent: ") + why2 });
          }, function (e) { b.disabled = false; X.toast(errFull(e), 1); });
        });
      };
      load();
    };

    /* ---------------------------------------------------------------- 6) audit ---------------------------------------------------------------- */
    RUN.audit = function (c) {
      var pj = function (s) { var v = s; try { v = typeof s === "string" ? JSON.parse(s) : s; } catch (e) {} return JSON.stringify(v, null, 1); };
      c.st.before = ""; c.st.stack = [];
      var paint = function (j) {
        var it = c.st.rows = arr((j || {}).items); c.st.next = (j && j.next_before) || "";
        body(c, '<p class="mut sm">' + h(T("عمليات لوحة المطوّر (تشغيل وإيقاف المزايا، الترجيع، توكن Cloudflare) — الأحدث فوق. السجل الكامل في «سجل العمليات».", "Developer-panel actions (feature switches, rollbacks, the Cloudflare token) — newest first. The full log is under «Audit log».")) + ' <a href="#audit">' + h(T("سجل العمليات ←", "Audit log →")) + "</a></p>"
          + '<div class="cd">' + X.tableH([["الوقت", "Time", function (r) { return X.fdh(r.at, true); }], ["المنفّذ", "Actor", function (r) { return '<small dir="ltr">' + h(r.actor_email || r.actor_id || "") + "</small>"; }], ["الإجراء", "Action", function (r) { return '<b dir="ltr">' + h(r.action) + "</b>"; }], ["الملخص", "Summary", function (r) { return '<span dir="auto">' + h(X.cut(r.summary || ((r.target_type || "") + (r.target_id ? ":" + r.target_id : "")), 160)) + "</span>"; }]], it,
            { count: it.length, empty: T("لسه مفيش عمليات من لوحة المطوّر.", "No developer-panel actions yet."), acts: function (r, i) { return '<button type="button" class="btn s l" data-a="dvdt" data-i="' + i + '">' + h(T("تفاصيل", "Details")) + "</button>"; } })
          + '<div class="pg">' + (c.st.stack.length ? X.btn("dvnew", h(T("→ الأحدث", "→ Newer")), "l s") : "") + (c.st.next ? X.btn("dvold", h(T("الأقدم ←", "Older ←")), "l s") : "") + "</div></div>");
      };
      var load = function () {
        body(c, X.loadingH());
        X.GET(API.audit + X.qs({ limit: 50, before: c.st.before })).then(function (j) { if (X.alive(c)) paint(j); }, function (e) { if (X.alive(c)) body(c, X.errH(e)); });
      };
      c.on.retry = load;
      c.on.dvold = function () { c.st.stack.push(c.st.before); c.st.before = c.st.next; load(); };
      c.on.dvnew = function () { c.st.before = c.st.stack.pop() || ""; load(); };
      c.on.dvdt = function (b) {
        var r = (c.st.rows || [])[+b.getAttribute("data-i")]; if (!r) return;
        X.modal(X.mh(r.action) + X.kvH([[T("الوقت", "Time"), X.fd(r.at, true)], [T("المنفّذ", "Actor"), (r.actor_email || r.actor_id || "") + (r.actor_role ? " (" + X.roleName(r.actor_role) + ")" : "")], [T("الهدف", "Target"), (r.target_type || "") + ":" + (r.target_id || ""), "ltr"], [T("الملخص", "Summary"), r.summary], [T("رقم الطلب الداخلي", "Request id"), r.req_id, "ltr"]])
          + '<div class="split"><div><b>' + h(T("قبل", "Before")) + '</b><pre class="js">' + h(pj(r.before_json != null ? r.before_json : r.before)) + "</pre></div><div><b>" + h(T("بعد", "After")) + '</b><pre class="js">' + h(pj(r.after_json != null ? r.after_json : r.after)) + "</pre></div></div>", { wide: true });
      };
      load();
    };

    X.section("dev", { ar: "🛠️ المطوّر", en: "🛠️ Developer", group: "النظام", perm: OWNER, run: run });
    W.MIGACC_DEV = { v: 1, api: API, slot: SLOT, tabs: TABS.map(function (t) { return t[0]; }) };
  }
  if (W.MIGACC && W.MIGACC.use) W.MIGACC.use(start);
  else { W.MIGACC_PLUGINS = W.MIGACC_PLUGINS || []; W.MIGACC_PLUGINS.push(start); }
})();
