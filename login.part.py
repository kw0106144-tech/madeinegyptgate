# -*- coding: utf-8 -*-
# login.html — the same URL and look as the live page (docs/janna/legacy-live/login.html: centred card, logo, «دخول المصانع» /
# «منصة صنع في مصر», maroon button, «ليس لديك حساب؟ سجّل شركتك · الرئيسية»), now on the platform's own sign-in
# (ACC-CONTRACT §1.6). Standalone (never page()), noindex, no site header, bilingual (T(ar, en); ?lang=en / localStorage mig-lang).
#   Card A (default) «الدخول بكود على الإيميل»: POST /api/auth/request {email, lang} → 6-digit code → POST /api/auth/verify
#     {email, code} → localStorage mig-tok + mig-me (the keys data/mig-api.js reads) → redirect.
#   Card B «حساب قديم؟ ادخل بالباسورد بتاعك» (only when GET /api/auth/legacy/health says {enabled:true}): POST /api/auth/legacy
#     {email, password, lang} — the Worker checks the password against the OLD system server-side and never stores it.
#   Redirect: ?next=<dashboard|panel|advisor|track|pay|register>.html[#…] when valid; else the Control Center for staff
#     (GET /api/admin/cc/whoami 200); else the member dashboard. Already signed in → «كمّل على لوحتك» / «خروج».
# exec'd by site.py after panel.part.py (uses B, OUT and, when present, SEO_STATE for the clean URLs).
import json as _lg_json


def _lg_url(k):
    try:
        cfg = SEO_STATE['cfg']
    except Exception:
        return '%s.html' % k
    if k in ('home', 'index'):
        return '/'
    if k in ('panel', 'login', 'admin') or k in (cfg.get('flat_pages') or []) or k in (cfg.get('legacy_live_pages') or []):
        return '/%s.html' % k
    return (cfg.get('static_paths') or {}).get(k) or '/%s/' % k


_LG_URLS = {k: _lg_url(k) for k in ('home', 'dashboard', 'panel', 'advisor', 'track', 'pay', 'register')}
_LG_URLS_JS = _lg_json.dumps(_LG_URLS, ensure_ascii=False).replace('<', '\\u003c')

_LG_CSS = (
    # the live CSS, verbatim
    'body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f3f6f4;display:flex;min-height:100vh;align-items:center;justify-content:center}'
    '.c{background:#fff;border-radius:16px;box-shadow:0 8px 30px #0001;padding:28px;width:min(92vw,400px)}h1{margin:0 0 4px;color:#8E0B20;font-size:22px}'
    'p{color:#666;margin:0 0 16px}label{display:block;font-weight:700;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cdd6d1;'
    'border-radius:10px;font-size:15px}button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:#8E0B20;color:#fff;font-size:16px;'
    'font-weight:700;cursor:pointer}#e{color:#b00020;font-weight:700;margin-top:10px;min-height:20px}a{color:#8E0B20}'
    # additions: secondary/link buttons, code input, notes, focus, the old-password card, language switch
    'button.lk{width:auto;margin:10px 0 0;padding:0;background:none;color:#8E0B20;font-size:14px;font-weight:700;text-decoration:underline}'
    'button.l2{background:#fff;color:#0F172A;border:1px solid #cdd6d1}button[disabled]{opacity:.6;cursor:default}'
    'input.code{font-size:24px;letter-spacing:.5em;text-align:center;font-weight:800;direction:ltr}'
    '.ok{color:#0B6B3A;font-weight:700}.nt{font-size:12px;color:#64748B;margin:10px 0 0}.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center}'
    '.old{border-top:1px dashed #cdd6d1;margin-top:18px;padding-top:6px}.old h2{font-size:16px;color:#8E0B20;margin:10px 0 0}'
    ':focus-visible{outline:2px solid #C09300;outline-offset:2px}.lng{text-align:center;margin:12px 0 0}.lng button{width:auto;margin:0;padding:4px 10px;background:none;'
    'color:#64748B;font-size:12px;font-weight:600;border:1px solid #e2e8f0;border-radius:99px}.who{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:8px 0}'
    '@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'
)

_LG_JS = r'''
(function () {
  "use strict";
  var U = window.MIGLOGIN_URLS || {}, BASE = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var L = window.MIGLANG === "en" ? "en" : "ar";
  function T(a, e) { return L === "en" ? e : a; }
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function url(k) { return U[k] || (k === "home" ? "/" : k + ".html"); }
  var RXM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function api(method, path, body, tok) {
    return new Promise(function (res, rej) {
      var hd = { Accept: "application/json" }, done = false; if (body !== undefined) hd["Content-Type"] = "application/json"; if (tok) hd.Authorization = "Bearer " + tok;
      var tm = setTimeout(function () { if (!done) { done = true; rej({ code: "offline", status: 0 }); } }, 15000);
      fetch(BASE + path, { method: method, headers: hd, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; });
      }).then(function (x) { if (done) return; done = true; clearTimeout(tm); if (x.ok) res(x.j); else rej({ code: x.j.code || "http_" + x.st, status: x.st, error: x.j.error || "", j: x.j }); }, function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline", status: 0 }); });
    });
  }
  function err(e, legacy) {
    var c = e && e.code, s = e && e.status;
    if (c === "offline") return T("تعذّر الاتصال بسيرفر المنصة دلوقتي — جرّب تاني بعد شوية.", "We couldn't reach the platform's server — please try again shortly.");
    if (legacy) {
      if (c === "invalid_credentials" || s === 401) return T("الإيميل أو الباسورد غلط", "Wrong e-mail or password");
      if (c === "use_email_code") return T("الحساب ده لازم يدخل بكود على الإيميل", "This account must sign in with an e-mail code");
      if (c === "legacy_off" || s === 503) return T("النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل", "The old system is not available right now — sign in with an e-mail code");
      if (c === "email_mismatch") return T("الإيميل ده مش هو إيميل الحساب في النظام القديم", "This e-mail is not the account's e-mail in the old system");
    }
    if (c === "rate_limited" || c === "locked" || c === "too_many_attempts" || s === 429) return T("محاولات كتير — جرّب بعد شوية", "Too many attempts — try again later");
    if (c === "invalid_code" || c === "bad_code" || c === "expired" || s === 401) return T("الكود غلط أو انتهت صلاحيته. اطلب كود جديد.", "The code is wrong or has expired. Ask for a new one.");
    if (c === "email_off") return T("إرسال الكود بالإيميل مش متاح دلوقتي.", "Sending the code by e-mail is not available right now.");
    if (c === "invalid_email") return T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address.");
    return T("تعذّر الدخول", "Could not sign in");
  }
  /* ?next= only for our own pages (same site, no scheme, no //) */
  var NX = /^(dashboard|panel|advisor|track|pay|register)\.html(#[^\s<>"']*)?$/;
  function nextUrl() { var m = /[?&]next=([^&#]*)/.exec(location.search), v = ""; try { v = m ? decodeURIComponent(m[1]) : ""; } catch (e) { v = ""; } var x = NX.exec(v); return x ? url(x[1]) + (x[2] || "") : ""; }
  function done(tok) {
    var n = nextUrl(); if (n) { location.href = n; return; }
    api("GET", "/admin/cc/whoami", undefined, tok).then(function () { location.href = url("panel"); }, function () { location.href = url("dashboard"); });
  }
  function keep(j) { if (!j || !j.token) throw { code: "bad_response" }; ls("mig-tok", j.token); ls("mig-me", JSON.stringify({ user: j.user || null, unread: 0 })); return j.token; }
  var S = { email: "", legacyOn: false, cd: 0, t: 0 };
  function chrome() {
    document.documentElement.lang = L; document.documentElement.dir = L === "en" ? "ltr" : "rtl";
    document.title = T("دخول المصانع – منصة صنع في مصر", "Sign in – Made in Egypt Gate");
    $("#t1").textContent = T("دخول المصانع", "Sign in"); $("#t2").textContent = T("منصة صنع في مصر", "Made in Egypt Gate");
    $("#lk").innerHTML = h(T("ليس لديك حساب؟ ", "No account yet? ")) + '<a href="' + h(url("register")) + '#plans">' + h(T("سجّل شركتك", "Register your company")) + '</a> · <a href="' + h(url("home")) + '">' + h(T("الرئيسية", "Home")) + "</a>";
    var b = $("#lng"); b.textContent = L === "en" ? "العربية" : "English"; b.setAttribute("lang", L === "en" ? "ar" : "en");
  }
  function stepEmail(msg) {
    clearInterval(S.t);
    $("#app").innerHTML = '<form id="fa" novalidate><h2 style="font-size:16px;margin:6px 0 0;color:#0F172A">' + h(T("الدخول بكود على الإيميل", "Sign in with an e-mail code")) + '</h2><p class="nt">' + h(T("هنبعتلك كود من 6 أرقام — مفيش باسورد.", "We'll send you a 6-digit code — no password.")) + '</p><label for="m">' + h(T("البريد الإلكتروني", "E-mail")) + '</label><input id="m" type="email" required dir="ltr" autocomplete="email" value="' + h(S.email) + '"><button type="submit" id="go">' + h(T("ابعتلي كود الدخول", "Send me a sign-in code")) + '</button><div id="e" role="alert">' + h(msg || "") + "</div></form>"
      + (S.legacyOn ? '<div class="old"><button type="button" class="lk" id="ol" aria-expanded="false">' + h(T("حساب قديم؟ ادخل بالباسورد بتاعك", "Old account? Sign in with your password")) + '</button><div id="ob" hidden></div></div>' : "");
    var f = $("#fa"); setTimeout(function () { var m = $("#m"); if (m) m.focus(); }, 30);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = $("#m").value.trim(), e = $("#e"); e.textContent = "";
      if (!RXM.test(v)) { e.textContent = T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address."); $("#m").setAttribute("aria-invalid", "true"); $("#m").focus(); return; }
      S.email = v; $("#go").disabled = true;
      api("POST", "/auth/request", { email: v, lang: L }).then(function (j) { if (!j || j.ok !== true) throw { code: "bad_response" }; stepCode(); }, function (x) { $("#go").disabled = false; e.textContent = err(x); });
    });
    var ol = $("#ol"); if (ol) ol.addEventListener("click", function () { var ob = $("#ob"), open = ob.hidden; ob.hidden = !open; ol.setAttribute("aria-expanded", open ? "true" : "false"); if (open) legacyForm(); });
  }
  function tick() {
    clearInterval(S.t); S.cd = 60;
    var up = function () { var b = $("#again"); if (!b) { clearInterval(S.t); return; } b.disabled = S.cd > 0; b.textContent = S.cd > 0 ? T("إعادة الإرسال بعد " + S.cd + " ث", "Resend in " + S.cd + "s") : T("ابعت الكود تاني", "Resend the code"); };
    up(); S.t = setInterval(function () { S.cd--; up(); if (S.cd <= 0) clearInterval(S.t); }, 1000);
  }
  function stepCode(msg) {
    $("#app").innerHTML = '<form id="fc" novalidate><p class="nt">' + h(T("بعتنا كود من 6 أرقام على ", "We sent a 6-digit code to ")) + '<b dir="ltr">' + h(S.email) + "</b>. " + h(T("بص كمان على الرسائل غير المرغوب فيها.", "Check your spam folder too.")) + '</p><label for="cd">' + h(T("كود الدخول", "Sign-in code")) + '</label><input id="cd" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required><button type="submit" id="go">' + h(T("دخول", "Sign in")) + '</button><div id="e" role="alert">' + (msg || "") + '</div><div class="row"><button type="button" class="lk" id="back">' + h(T("غيّر البريد", "Change e-mail")) + '</button><button type="button" class="lk" id="again"></button></div></form>';
    var f = $("#fc"), inp = $("#cd"); tick(); setTimeout(function () { inp.focus(); }, 30);
    inp.addEventListener("input", function () { var v = inp.value.replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }).replace(/[۰-۹]/g, function (c) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(c); }).replace(/\D/g, "").slice(0, 6); if (v !== inp.value) inp.value = v; if (v.length === 6 && !$("#go").disabled) { if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit", { cancelable: true })); } });
    $("#back").addEventListener("click", function () { stepEmail(); });
    $("#again").addEventListener("click", function () { var b = $("#again"); b.disabled = true; api("POST", "/auth/request", { email: S.email, lang: L }).then(function () { $("#e").innerHTML = '<span class="ok">' + h(T("بعتنا كود جديد.", "A new code was sent.")) + "</span>"; tick(); }, function (x) { b.disabled = false; $("#e").textContent = err(x); }); });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = inp.value.trim(), e = $("#e"); e.textContent = "";
      if (!/^\d{6}$/.test(v)) { e.textContent = T("الكود 6 أرقام.", "The code has 6 digits."); inp.focus(); return; }
      $("#go").disabled = true;
      api("POST", "/auth/verify", { email: S.email, code: v }).then(keep).then(function (tok) { clearInterval(S.t); $("#app").innerHTML = '<p class="ok" role="status">' + h(T("دخلت بنجاح ✓ جارٍ التحويل…", "Signed in ✓ redirecting…")) + "</p>"; done(tok); }, function (x) { $("#go").disabled = false; inp.select(); e.textContent = err(x); });
    });
  }
  function legacyForm() {
    var ob = $("#ob");
    ob.innerHTML = '<h2>' + h(T("الدخول بالباسورد القديم", "Sign in with the old password")) + '</h2><form id="fl" novalidate autocomplete="on"><label for="lm">' + h(T("البريد الإلكتروني", "E-mail")) + '</label><input id="lm" type="email" required dir="ltr" autocomplete="username" value="' + h(S.email) + '"><label for="lp">' + h(T("كلمة المرور", "Password")) + '</label><input id="lp" type="password" required dir="ltr" autocomplete="current-password"><button type="submit" id="lgo">' + h(T("دخول", "Sign in")) + '</button><div id="le" role="alert" style="color:#b00020;font-weight:700;margin-top:10px;min-height:20px"></div><p class="nt">' + h(T("الباسورد بيتأكد منه النظام القديم بس ومش بيتحفظ عندنا.", "The password is checked by the old system only and is never stored by us.")) + "</p></form>";
    setTimeout(function () { var x = $("#lm"); if (x) (x.value ? $("#lp") : x).focus(); }, 30);
    $("#fl").addEventListener("submit", function (ev) {
      ev.preventDefault(); var m = $("#lm").value.trim(), p = $("#lp").value, e = $("#le"); e.textContent = "";
      if (!RXM.test(m)) { e.textContent = T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address."); $("#lm").focus(); return; }
      if (!p || p.length > 200) { e.textContent = T("اكتب الباسورد.", "Enter the password."); $("#lp").focus(); return; }
      $("#lgo").disabled = true;
      api("POST", "/auth/legacy", { email: m, password: p, lang: L }).then(function (j) { $("#lp").value = ""; p = ""; return keep(j); }).then(function (tok) { $("#app").innerHTML = '<p class="ok" role="status">' + h(T("دخلت بنجاح ✓ جارٍ التحويل…", "Signed in ✓ redirecting…")) + "</p>"; done(tok); }, function (x) { $("#lp").value = ""; p = ""; $("#lgo").disabled = false; e.textContent = err(x, true); if (x && x.code === "use_email_code") { S.email = m; } });
    });
  }
  function signedIn(tok) {
    $("#app").innerHTML = '<p class="nt" role="status">' + h(T("جارٍ التحقق من الجلسة…", "Checking your session…")) + "</p>";
    api("GET", "/admin/cc/whoami", undefined, tok).then(function (j) { show(j && j.user, true); }, function (x) {
      if (x && x.status === 401) { ls("mig-tok", null); ls("mig-me", null); start(); return; }
      var me = null; try { me = (JSON.parse(ls("mig-me") || "null") || {}).user; } catch (e) {}
      show(me, false, x && x.code === "offline");
    });
    function show(u, staff, off) {
      var n = nextUrl(), dest = n || (staff ? url("panel") : url("dashboard"));
      $("#app").innerHTML = '<div class="who">' + h(T("إنت داخل بالفعل", "You are already signed in")) + (u && u.email ? ' — <b dir="ltr">' + h(u.email) + "</b>" : "") + (off ? '<br><small style="color:#92400E">' + h(T("السيرفر مش بيرد دلوقتي، فمش متأكدين من الجلسة.", "The server is not answering right now, so the session could not be checked.")) + "</small>" : "") + '</div><button type="button" id="cont">' + h(staff && !n ? T("كمّل على لوحة الإدارة", "Continue to the admin panel") : T("كمّل على لوحتك", "Continue to your dashboard")) + '</button><button type="button" class="l2" id="out">' + h(T("خروج", "Sign out")) + "</button>";
      $("#cont").addEventListener("click", function () { location.href = dest; });
      $("#out").addEventListener("click", function () { var b = $("#out"); b.disabled = true; api("POST", "/auth/logout", {}, tok).catch(function () {}).then(function () { ls("mig-tok", null); ls("mig-me", null); start(); }); });
    }
  }
  function start() {
    chrome();
    var tok = ls("mig-tok");
    if (tok) { signedIn(tok); return; }
    stepEmail();
    api("GET", "/auth/legacy/health").then(function (j) { if (j && j.enabled === true && !S.legacyOn) { S.legacyOn = true; if ($("#fa")) { var keepV = $("#m").value; stepEmail($("#e").textContent); $("#m").value = keepV; } } }, function () {});
  }
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest || !ev.target.closest("#lng")) return;
    L = L === "en" ? "ar" : "en"; window.MIGLANG = L; ls("mig-lang", L);
    try { var u = location.href.replace(/([?&])lang=(en|ar)&?/, "$1").replace(/[?&](#|$)/, "$1"); if (u !== location.href) history.replaceState(null, "", u); } catch (e) {}
    chrome(); if ($("#fc")) stepCode(); else if ($("#fa")) { var ob = $("#ob"), wasOpen = ob && !ob.hidden; stepEmail(); if (wasOpen) $("#ol").click(); } else start();
  });
  start();
})();
'''

_LG_LANG = ('<script>(function(){var q=/[?&]lang=(en|ar)\\b/.exec(location.search),L="ar";try{if(q)localStorage.setItem("mig-lang",q[1]);'
            'L=localStorage.getItem("mig-lang")||"ar"}catch(e){if(q)L=q[1]}window.MIGLANG=L==="en"?"en":"ar";var d=document.documentElement;'
            'd.lang=window.MIGLANG;d.dir=window.MIGLANG==="en"?"ltr":"rtl"})();</script>')

_LG_HTML = ('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<link rel="icon" href="img/logo-site.png"><title>دخول المصانع – منصة صنع في مصر</title><meta name="robots" content="noindex">'
            '<meta name="referrer" content="strict-origin-when-cross-origin">' + _LG_LANG + '<style>' + _LG_CSS + '</style></head>'
            '<body><main class="c"><img src="img/logo-site.png" alt="صنع في مصر" width="56" height="56" style="height:56px;width:auto;display:block;margin:0 auto 10px">'
            '<h1 id="t1">دخول المصانع</h1><p id="t2">منصة صنع في مصر</p><div id="app"><noscript><p>صفحة الدخول محتاجة JavaScript شغّال في المتصفح.</p></noscript></div>'
            '<p id="lk" style="margin-top:14px">ليس لديك حساب؟ <a href="' + _LG_URLS['register'] + '#plans">سجّل شركتك</a> · <a href="' + _LG_URLS['home'] + '">الرئيسية</a></p>'
            '<p class="lng"><button type="button" id="lng" lang="en">English</button></p></main>'
            '<script>window.MIGLOGIN_URLS=' + _LG_URLS_JS + ';</script><script>' + _LG_JS + '</script></body></html>')
open(OUT + 'login.html', 'w', encoding='utf-8').write(_LG_HTML)
print('login.html', len(_LG_HTML), 'bytes')
