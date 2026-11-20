# -*- coding: utf-8 -*-
# «دخول المصانع» — the factory sign-in page: /login/ (Arabic) and /en/login/ (English «Factory sign-in»), made like the owner's
# reference madeinsaudigate.com/login.html: a light grey page with ONE centred white card (soft shadow, 16px corners) — our logo in
# line with «دخول المصانع» / «منصة صنع في مصر» (one start-aligned head), the form, a full-width button and «ليس لديك حساب؟ سجّل مصنعك ·
# الرئيسية» — with our maroon where the Saudi page has its dark green; under the card the one-line privacy consent and the language
# switch. No site header / footer / assistants, as on the Saudi page.
# The sign-in itself stays the owner's decision 2 (worker/src/auth.js): a one-time 6-digit code by e-mail, never a password. So the
# Saudi card's second field is «كود الدخول»: step 1 the e-mail → «ابعتلي كود الدخول»; step 2 on the same card the code → «دخول».
# The form is data/mig-api.js's shared component (MIGAPI.signin) — the same one, with the same API calls and error texts (rate limit,
# lockout, wrong / expired code, offline), that the sign-in dialog of gated actions uses.
# After the code: ?next= when it is a path on this site (never another site — checked again after the URL parser removed dot segments —
# never a sign-in page, never the home page), else /dashboard/. The server answers
# the code request the same for any address (no account oracle), so an address that is not a registered member's is only known after
# the code: a brand-new account without a factory is then offered the registration path («سجّل مصنعك») or another e-mail.
# Already signed in → «إنت داخل بالفعل» with «لوحة مصنعي» (+ the staff board of a team member) + «خروج».
# deploy 2 (ACC-CONTRACT §1.6, moved here from the never-built login.part.py — /login.html stays the owner's old system):
#   * card «حساب قديم؟ ادخل بالباسورد بتاعك» under the form, only while signed out and only when GET /api/auth/legacy/health answers
#     {enabled:true}: POST /api/auth/legacy {email, password, lang} → the same session keys data/mig-api.js uses (mig-tok, mig-me). The
#     password goes only to the server (which asks the old system and never stores it); it is never kept in this page after the answer.
#   * staff routing after the code when there is no ?next=: GET /api/me → user.staff_role owner / admin / editor / support → /admin/
#     («لوحة التحكم», the new Admin Control Center), seo → /seo-team/, data → /data-desk/, anyone else → /dashboard/. Without the key
#     (before migration 0006) the old members.role "admin" flag decides. An old-password session is never staff → ?next= or /dashboard/.
# The platform's own app (user agent «MIGApp», app/: no address bar there): «دخول فريق المنصة» (under the card here and in every page's
#   footer, shown only in the app — [data-mig-app-only], seo_build.part.py pwa_head) opens /login/?team=1, the team mode: the card says
#   «دخول فريق المنصة»; a signed-in staff member goes straight to the board of his role (the same staffDest: owner / admin / editor /
#   support → /admin/, seo → /seo-team/, data → /data-desk/); a signed-in account that is not staff is told so, with its own dashboard;
#   signed out, the code form, then the same staff routing. Browsers can use ?team=1 too; nothing else changes for them.
# Registered like the other pages (PAGES key «signin»; seo/config.json static_paths «signin» → /login/, noindex_static) and written by
# PAGE_WRITERS['signin'] from site.py's page loop: noindex,follow, canonical = itself, never in a sitemap (scan_static_pages keeps
# noindex rows out). deploy 1: /login.html and /panel.html stay on the owner's old system (deploy/legacy-live.txt; login.part.py is not
# built) — this page never uses the key «login» and never writes /login.html.
# exec'd by site.py after seo_build.part.py / seo-admin.part.py (uses SEO, SEO_STATE, seo_static_head, seo_rewrite_links, _bust).
import json as _sg_json, html as _sg_html, re as _sg_re

_SG = {
    'title': ('دخول المصانع – منصة صنع في مصر', 'Factory sign-in – Made in Egypt Gate'),
    'h1': ('دخول المصانع', 'Factory sign-in'),
    'sub': ('منصة صنع في مصر', 'Made in Egypt Gate'),
    'desc': ('دخول المصانع والشركات إلى منصة صنع في مصر بكود من 6 أرقام يوصل على البريد الإلكتروني، من غير كلمة سر: لوحة المصنع والطلبات الواردة والمتابعات.',
             'Factory sign-in to Made in Egypt Gate with a 6-digit code sent to your e-mail, no password: your factory dashboard, incoming requests and follows.'),
    'noacc': ('ليس لديك حساب؟', 'No account yet?'),
    'reg': ('سجّل مصنعك', 'Register your factory'),
    'home': ('الرئيسية', 'Home'),
    'logo': ('منصة صنع في مصر – الرئيسية', 'Made in Egypt Gate – Home'),
    'nojs': ('الدخول محتاج تشغيل JavaScript في المتصفح.', 'Signing in needs JavaScript turned on in your browser.'),
    # one line under the card (the sign-in dialog keeps the longer privacy note inside its card)
    'fine': ('بتسجيل الدخول بتوافق على <a href="%s">سياسة الخصوصية</a>.', 'By signing in you accept the <a href="%s">privacy policy</a>.'),
    'team': ('دخول فريق المنصة', 'Platform team sign-in'),
}
SEO['signin'] = (_SG['desc'][0], 'دخول المصانع, تسجيل الدخول, لوحة المصنع, صنع في مصر', 'WebPage', [], 'yearly', '0.1')
PAGES['signin'] = (_SG['title'][0], '', '', '', '')

_SG_CSS = '''
:root{--bg:#F3F4F6;--surface:#FFFFFF;--sunken:#F4F5F7;--fg:#0F172A;--muted:#666666;--line:#DCE1E6;--gold:#C09300;color-scheme:light}
:root[data-theme="dark"]{--bg:#120708;--surface:#1C0E10;--sunken:#261316;--fg:#F2E8E9;--muted:#A8989A;--line:#35201F;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Cairo",Tahoma,Arial,sans-serif;font-size:15px;line-height:1.6}
[hidden]{display:none!important}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.lgp{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
 padding:24px max(16px,env(safe-area-inset-right,0px)) calc(24px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
.lgp-card{width:min(456px,100%);background:var(--surface);border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.08);padding:28px}
.lgp-card h1{margin:0 0 4px;color:#8E0B20;font-size:22px;font-weight:800;line-height:1.45}
:root[data-theme="dark"] .lgp-card h1{color:#F0566A}
.lgp-card .mig-sub{margin:0 0 16px;color:var(--muted);font-size:15px}
/* one start-aligned head like the Saudi card: our logo in line with the title and the subtitle (no centred logo above them) */
.lgp-head{display:flex;align-items:center;gap:12px;margin:0 0 16px}
.lgp-card .lgp-head .mig-t{margin:0 0 2px}
.lgp-card .lgp-head .mig-sub{margin:0}
.lgp-logo{display:block;flex:none;border-radius:50%}
.lgp-logo img{display:block;width:48px;height:46px}
.lgp-app{min-height:180px}
.lgp-links{margin:14px 0 0;color:var(--muted);font-size:15px;line-height:1.8}
.lgp-links a,.lgp-back a{color:var(--mig-brand,#8E0B20);text-decoration:underline}
/* under the card: the one-line privacy consent and the language switch */
.lgp-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 14px;width:min(456px,100%);margin:0;text-align:center}
.lgp-fine{margin:0;color:var(--muted);font-size:12.5px;line-height:1.7}
.lgp-fine a{color:inherit;text-decoration:underline}
.lgp-fine a:hover{color:var(--fg)}
.lgp-lang{margin:0;font-size:13px}
.lgp-lang a{display:inline-block;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:3px 14px;background:var(--surface)}
.lgp-lang a:hover{color:var(--fg)}
.lgp-box{display:flex;flex-direction:column;gap:2px;margin:4px 0 0;padding:12px 14px;border-radius:12px;background:var(--sunken);border:1px solid var(--line)}
.lgp-box b{font-size:16px;font-weight:800}
.lgp-box span{font-size:14px;color:var(--muted);overflow-wrap:anywhere}
.lgp-box .lgp-em{color:var(--fg);align-self:flex-start}
.lgp-box:focus{outline:0}
.lgp-done{margin:6px 0 0;font-size:15px}
.lgp-done:focus{outline:0}
.lgp-back{margin:12px 0 0;font-size:14px;text-align:center}
.lgp-old{margin:16px 0 0;padding:12px 0 0;border-top:1px dashed var(--line)}
.lgp-old .mig-lnk{display:block;margin:0 auto;text-align:center}
.lgp-old h2{margin:12px 0 2px;color:#8E0B20;font-size:16px;font-weight:800}
:root[data-theme="dark"] .lgp-old h2{color:#F0566A}
.lgp-old label{display:block;margin:10px 0 4px;font-size:14px;font-weight:700}
.lgp-old .lgp-pw{margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.7}
.toast{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom,0px));inset-inline:0;margin:0 auto;width:fit-content;max-width:calc(100% - 32px);
 background:#8E0B20;color:#fff;padding:10px 18px;border-radius:10px;font-size:.9rem;z-index:60;box-shadow:0 10px 30px rgba(0,0,0,.25)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
'''

# the head runs before data/mig-api.js: page key, language (the English twin is /en/login/), the remembered theme, the site's URLs
_SG_BOOT = r'''(function () {
  var EN = %(en)s, d = document.documentElement, ls = null;
  window.MIGPAGE = "signin"; window.MIGLANG = EN ? "en" : "ar"; window.MIGSIGNIN = %(urls)s;
  try { ls = window.localStorage; var th = ls.getItem("mig-theme"); if (th) d.setAttribute("data-theme", th); } catch (e) { ls = null; }
  /* the visitor's language: ?lang= first, else the choice data/i18n.js remembers (mig-lang) — the Arabic page sends an English visitor
     to /en/login/; the English page sends nobody away unless ?lang=ar asks for it. ?next= and the rest of the query are kept. */
  var m = /[?&]lang=(en|ar)(?=&|$)/.exec(location.search), q = m ? m[1] : "", rest = location.search.replace(/[?&]lang=(?:en|ar)(?=&|$)/g, "").replace(/^&/, "?");
  if (q) try { if (ls) ls.setItem("mig-lang", q); } catch (e) {}
  var want = q; if (!want) try { want = ls ? ls.getItem("mig-lang") || "" : ""; } catch (e) { want = ""; }
  if ((!EN && want === "en") || (EN && q === "ar")) { location.replace((EN ? "/login/" : "/en/login/") + rest + location.hash); return; }
  if (q) try { history.replaceState(null, "", location.pathname + rest + location.hash); } catch (e) {}
})();'''

_SG_JS = r'''(function () {
  "use strict";
  var EN = window.MIGLANG === "en", T = function (a, e) { return EN ? e : a; };
  var A = window.MIGAPI, U = window.MIGSIGNIN || {}, app = document.getElementById("lgpApp"), F = null, pend = "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function param(k) {
    try { return new URLSearchParams(location.search).get(k) || ""; } catch (e) {}
    var m = new RegExp("[?&]" + k + "=([^&#]*)").exec(location.search); try { return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; } catch (x) { return ""; }
  }
  /* ?next= only to a page of this site: a path ("/x/…" or a bare "x.html"), no scheme, no «//host» or «/\host», no control characters,
     the same origin once resolved, never a sign-in page (no loop) and never the home page (/, /en/: the factory goes on to its
     dashboard, as on the Saudi sign-in page). The URL parser removes dot segments — «/.//evil.example», «/..//x», «/%2e//x»,
     «/a/..//x» all come out as the path «//evil.example» — so the RESULT is checked again: it must start with one «/» only and
     resolve to this origin, or the visitor would be sent to another site by location.replace() and the links built from it. */
  function safeNext(v) {
    v = String(v || "");
    if (/^[\w-]+\.html(?:[?#]|$)/.test(v)) v = "/" + v;
    if (!v || v.length > 2048 || v.charAt(0) !== "/" || /^\/[\/\\]/.test(v) || /[\u0000-\u001f\u007f\\]/.test(v)) return "";
    var u, r; try { u = new URL(v, location.origin); } catch (e) { return ""; }
    if (u.origin !== location.origin) return "";
    r = u.pathname + u.search + u.hash;
    if (r.charAt(0) !== "/" || /^\/[\/\\]/.test(r) || /[\u0000-\u001f\u007f\\]/.test(r)) return "";
    try { if (new URL(r, location.origin).origin !== location.origin) return ""; } catch (e) { return ""; }
    if (/^\/(?:en\/)?login(?:\/|\.html)?$/i.test(u.pathname) || /^\/(?:en\/?)?(?:index\.html|home\.html)?$/i.test(u.pathname)) return "";
    return r;
  }
  var NEXT = safeNext(param("next")), DASH = U.dash || "/dashboard/", TEAM = param("team") === "1";
  /* from the English page an Arabic-only path keeps the visitor in English (the app pages switch from ?lang=en; /en/ pages are English) */
  function withLang(u) {
    if (!EN || /^\/en(?:[\/?#]|$)/.test(u)) return u;
    var i = u.indexOf("#"), h = i < 0 ? "" : u.slice(i); if (i >= 0) u = u.slice(0, i);
    return /[?&]lang=/.test(u) ? u + h : u + (u.indexOf("?") < 0 ? "?" : "&") + "lang=en" + h;
  }
  function dest() { return withLang(NEXT || DASH); }
  /* where a staff member works when no ?next= was asked (GET /api/me user.staff_role, ACC-CONTRACT §12.1): the Control Center for
     owner / admin / editor / support, the team boards for seo / data; "" = not staff. Without staff_role (before migration 0006) the
     old members.role "admin" flag sends the platform's admins to the Control Center. */
  function staffDest(u) {
    if (!u) return "";
    var r = typeof u.staff_role === "string" ? u.staff_role : (u.role === "admin" ? "admin" : "");
    if (r === "owner" || r === "admin" || r === "editor" || r === "support") return U.admin || "/admin/";
    if (r === "seo") return U.seoteam || "/seo-team/";
    if (r === "data") return U.datadesk || "/data-desk/";
    return "";
  }
  function staffName(u) { var d = staffDest(u); return !d ? "" : d === (U.seoteam || "/seo-team/") ? T("لوحة فريق الـ SEO", "SEO team board") : d === (U.datadesk || "/data-desk/") ? T("لوحة فريق الداتا", "Data team desk") : T("لوحة التحكم", "Control Center"); }
  var coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  function stop() { if (F) { F.destroy(); F = null; } }
  /* the privacy consent is the line under the card here (fine: false), not a paragraph inside it */
  function form(note, first) { stop(); F = A.signin(app, { note: note || "", after: false, fine: false, autofocus: !(first && coarse), onDone: done }); }
  function focusBox() { var b = app.querySelector("[tabindex='-1']"); if (b) try { b.focus(); } catch (e) {} }
  /* a brand-new account without a factory: the address is not a registered member's (the server made a free buyer account just now) */
  function fresh(u) {
    if (!u || u.company || u.factory_ref || u.verified || u.role === "admin" || (A.planOf ? A.planOf(u) : u.plan) !== "visitor") return false;
    var c = Date.parse(u.created_at || ""); return !isNaN(c) && Math.abs(Date.now() - c) < 15 * 60000;
  }
  function done(u) {
    stop(); oldOff();
    if (fresh(u)) { regPath(u); return; }
    app.innerHTML = '<p class="mig-ok lgp-done" role="status" tabindex="-1">✓ ' + esc(T("دخلت بنجاح، بنحوّلك…", "Signed in — taking you there…")) + "</p>";
    focusBox();
    var t0 = Date.now(), go = function (to) { setTimeout(function () { location.replace(withLang(to)); }, Math.max(0, 300 - (Date.now() - t0))); };
    if (NEXT) { go(NEXT); return; }
    /* the staff role is on GET /api/me (not on the sign-in answer): one call, then the member's own board */
    A.me(true).then(function (r) { go(staffDest(r && r.user) || DASH); }, function () { go(staffDest(u) || DASH); });
  }
  function regPath(u) {
    app.innerHTML = '<div class="lgp-box" role="status" tabindex="-1"><b>✓ ' + esc(T("دخلت بنجاح", "You're signed in")) + "</b><span>" + esc(T("بس البريد ده مش مربوط بمصنع مسجّل على المنصة.", "but this e-mail is not linked to a factory registered on the platform.")) + '</span><span class="lgp-em" dir="ltr">' + esc(u.email || "") + "</span></div>"
      + '<p class="mig-hint">' + esc(T("لو مصنعك مسجّل عندنا ببريد تاني ادخل بيه، أو سجّل مصنعك دلوقتي.", "If your factory is registered with another e-mail, sign in with that one — or register your factory now.")) + "</p>"
      + '<a class="mig-go" href="' + esc(withLang(U.register || "/register/")) + '">' + esc(T("سجّل مصنعك", "Register your factory")) + "</a>"
      + '<button type="button" class="mig-alt" data-lg="other">' + esc(T("ادخل ببريد تاني", "Use another e-mail")) + "</button>"
      + '<p class="lgp-back"><a href="' + esc(dest()) + '">' + esc(T("كمّل بالحساب ده (حساب مشتري)", "Continue with this account (buyer)")) + "</a></p>";
    focusBox();
  }
  /* «دخول فريق المنصة» (?team=1, the app's way to the boards): a staff member goes to his board, anyone else hears it is a team entry */
  function teamGo(u) { var d = TEAM && !NEXT ? staffDest(u) : ""; if (d) { app.innerHTML = '<p class="mig-ok lgp-done" role="status" tabindex="-1">✓ ' + esc(T("بنحوّلك للوحتك…", "Taking you to your board…")) + "</p>"; location.replace(withLang(d)); } return !!d; }
  function signedIn(u) {
    stop(); u = u || A.user() || {};
    if (teamGo(u)) return;
    var em = String(u.email || ""), who = A.ui && A.ui.shortName ? A.ui.shortName(u) : "", link = !!(A.linkSession && A.linkSession());
    if (who === em.split("@")[0]) who = "";
    if (u.company && who && who !== u.company) who += " · " + u.company;
    app.innerHTML = '<div class="lgp-box" role="status"><b>' + esc(T("إنت داخل بالفعل", "You're already signed in")) + "</b>" + (who ? '<span dir="auto">' + esc(who) + "</span>" : "") + (em ? '<span class="lgp-em" dir="ltr">' + esc(em) + "</span>" : "") + "</div>"
      + (link ? '<p class="mig-hint">' + esc(A.legacySession && A.legacySession() ? T("دخلت بالباسورد القديم، وده بيفتح لوحتك للمتابعة ودفع الفواتير والرد على الطلبات بس. عشان تعدّل بياناتك أو منتجاتك ادخل بكود على بريدك.", "You signed in with your old password, which opens your dashboard for following up, paying invoices and answering requests only. To change your details or products, sign in with an e-mail code.") : T("دخلت برابط من الإيميل، وده بيسمح بالرد على الطلبات بس. عشان تغيّر بياناتك أو إعداداتك ادخل بكود على بريدك.", "You signed in with an e-mailed link, which only allows answering requests. To change your details or settings, sign in with an e-mail code.")) + "</p>" : "")
      + (TEAM && !staffDest(u) && u.email ? '<p class="mig-hint">' + esc(T("الحساب ده مش من حسابات فريق المنصة. لو إنت من الفريق، ادخل بإيميل الفريق بتاعك.", "This account is not a platform team account. If you are on the team, sign in with your team e-mail.")) + "</p>" : "")
      + (staffDest(u) ? '<a class="mig-go" href="' + esc(withLang(staffDest(u))) + '">' + esc(staffName(u)) + "</a>" : "")
      + '<a class="' + (staffDest(u) ? "mig-alt" : "mig-go") + '" href="' + esc(withLang(DASH)) + '">' + esc(T("لوحة مصنعي", "My factory dashboard")) + "</a>"
      + (link ? '<button type="button" class="mig-alt" data-lg="code">' + esc(T("ادخل بكود على بريدك", "Sign in with an e-mail code")) + "</button>" : "")
      + '<button type="button" class="mig-alt" data-lg="out">' + esc(T("خروج", "Sign out")) + "</button>"
      + (NEXT && NEXT !== DASH ? '<p class="lgp-back"><a href="' + esc(withLang(NEXT)) + '">' + esc(T("رجوع للصفحة اللي كنت فيها", "Back to the page you were on")) + "</a></p>" : "");
  }
  /* ---------- «حساب قديم؟ ادخل بالباسورد بتاعك» (old-password bridge; only while signed out, only when the server enables it) ---------- */
  var OLD = document.getElementById("lgpOld"), RXM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function oldOff() { if (OLD) { OLD.hidden = true; OLD.innerHTML = ""; } }
  function oldErr(x) {
    var c = String((x && x.code) || ""), st = x && x.status;
    if (c === "offline") return A.ui && A.ui.offline ? A.ui.offline() : T("ماقدرناش نوصل لسيرفر المنصة دلوقتي.", "We couldn't reach the platform's server right now.");
    if (c === "invalid_credentials" || st === 401) return T("الإيميل أو الباسورد غلط", "Wrong e-mail or password");
    if (c === "use_email_code") return T("الحساب ده لازم يدخل بكود على الإيميل", "This account must sign in with an e-mail code");
    if (/^verification_/.test(c)) return T("ماقدرناش نتأكد إنك مش برنامج آلي — حدّث الصفحة وجرّب تاني", "We could not verify that you are not a bot — reload the page and try again");
    if (c === "email_mismatch" || st === 409) return T("الإيميل ده مش هو إيميل الحساب في النظام القديم", "This e-mail is not the account's e-mail in the old system");
    if (c === "rate_limited" || c === "locked" || st === 429) return T("محاولات كتير — جرّب بعد شوية", "Too many attempts — try again later");
    if (c === "legacy_off" || st === 503) return T("النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل", "The old system is not available right now — sign in with an e-mail code");
    return T("ماقدرناش ندخلك دلوقتي — جرّب تاني أو ادخل بكود على الإيميل", "We couldn't sign you in right now — try again or sign in with an e-mail code");
  }
  function oldCard() {
    if (!OLD || !A.request) return;
    A.request("/auth/legacy/health", { auth: false, timeout: 8000 }).then(function (j) {
      if (!j || j.enabled !== true || A.token() || !F) return;
      OLD.innerHTML = '<button type="button" class="mig-lnk" id="lgpOldT" aria-expanded="false" aria-controls="lgpOldB">' + esc(T("حساب قديم؟ ادخل بالباسورد بتاعك", "Old account? Sign in with your password")) + "</button>"
        + '<div id="lgpOldB" hidden><h2>' + esc(T("الدخول بالباسورد القديم", "Sign in with your old password")) + '</h2><form class="mig-sf" id="lgpOldF" novalidate>'
        + '<label for="lgpOm">' + esc(T("البريد الإلكتروني", "E-mail")) + '</label><input class="mig-fld" id="lgpOm" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" dir="ltr" required>'
        + '<label for="lgpOp">' + esc(T("الباسورد", "Password")) + '</label><input class="mig-fld" id="lgpOp" type="password" autocomplete="current-password" dir="ltr" maxlength="200" required>'
        + '<button class="mig-go" type="submit">' + esc(T("دخول", "Sign in")) + '</button><p class="mig-er" id="lgpOe" role="alert"></p>'
        + '<p class="lgp-pw">🔒 ' + esc(T("الباسورد بيتأكد منه النظام القديم بس ومش بيتحفظ عندنا. الدخول ده بيفتح لوحتك للمتابعة ودفع الفواتير والرد على الطلبات بس؛ تعديل البيانات والمنتجات وباسم ولوحة التحكم محتاجين الدخول بكود على الإيميل.", "Your password is checked by the old system only and is never stored here. This sign-in opens your dashboard for following up, paying invoices and answering requests only; changing your details or products, Bassem and the Control Center need an e-mail code sign-in.")) + "</p></form></div>";
      OLD.hidden = false;
      var tg = document.getElementById("lgpOldT"), bx = document.getElementById("lgpOldB"), f = document.getElementById("lgpOldF"), em = document.getElementById("lgpOm"), pw = document.getElementById("lgpOp"), er = document.getElementById("lgpOe");
      tg.addEventListener("click", function () { var open = bx.hidden; bx.hidden = !open; tg.setAttribute("aria-expanded", open ? "true" : "false"); if (open) { var fe = app.querySelector('input[type="email"]'); if (fe && fe.value && !em.value) em.value = fe.value; try { (em.value ? pw : em).focus(); } catch (e) {} } });
      f.addEventListener("submit", function (ev) {
        ev.preventDefault(); if (f.getAttribute("aria-busy") === "true") return;
        var m = em.value.trim(), pass = pw.value, b = f.querySelector(".mig-go"); er.textContent = ""; em.removeAttribute("aria-invalid"); pw.removeAttribute("aria-invalid");
        if (!RXM.test(m)) { er.textContent = T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address."); em.setAttribute("aria-invalid", "true"); em.focus(); return; }
        if (!pass) { er.textContent = T("اكتب الباسورد.", "Enter the password."); pw.setAttribute("aria-invalid", "true"); pw.focus(); return; }
        f.setAttribute("aria-busy", "true"); b.disabled = true;
        /* Turnstile (required by the server whenever TURNSTILE_SECRET is set — the same widget as the e-mail-code form) */
        (A.human ? A.human() : Promise.resolve("")).then(function (tk) {
          var ob = { email: m, password: pass, lang: EN ? "en" : "ar" }; if (tk) ob.turnstile = tk;
          return A.request("/auth/legacy", { method: "POST", body: ob, auth: false, timeout: 20000 });
        }).then(function (j) {
          pass = ""; pw.value = "";
          if (!j || !j.token || !j.user) throw { code: "bad_response" };
          /* the same session keys data/mig-api.js reads on the next page (mig-tok, mig-me); an old-password session is never staff */
          try { localStorage.setItem("mig-tok", j.token); localStorage.setItem("mig-me", JSON.stringify({ user: j.user, unread: 0, t: Date.now() })); } catch (e) { throw { code: "storage" }; }
          oldOff(); stop();
          app.innerHTML = '<p class="mig-ok lgp-done" role="status" tabindex="-1">✓ ' + esc(T("دخلت بنجاح، بنحوّلك…", "Signed in — taking you there…")) + "</p>"; focusBox();
          setTimeout(function () { location.replace(dest()); }, 300);
        }, function (x) {
          /* the password stays only after a network failure (so «دخول» can be pressed again); any answer of the server clears it */
          if (!(x && x.code === "offline")) { pass = ""; pw.value = ""; }
          f.setAttribute("aria-busy", "false"); b.disabled = false;
          er.textContent = x && x.code === "storage" ? T("المتصفح مش سامح بحفظ الدخول (التخزين مقفول).", "This browser does not allow saving the sign-in (storage is blocked).") : oldErr(x);
          if (x && x.code === "use_email_code") { var fe = app.querySelector('input[type="email"]'); if (fe && !fe.readOnly && !fe.value) fe.value = m; }
        });
      });
    }, function () { /* no bridge on this server: the card stays hidden */ });
  }
  /* the language switch keeps ?next= and remembers the choice (as data/i18n.js does) */
  var sw = document.getElementById("lgpSw");
  if (sw) {
    if (NEXT) sw.setAttribute("href", sw.getAttribute("href") + (sw.getAttribute("href").indexOf("?") < 0 ? "?" : "&") + "next=" + encodeURIComponent(NEXT));
    sw.addEventListener("click", function () { try { localStorage.setItem("mig-lang", sw.getAttribute("data-lang")); } catch (e) {} });
  }
  if (!A || !A.signin) { app.innerHTML = '<p class="mig-er" role="alert" style="color:#B00020;font-weight:700">' + esc(T("ماقدرناش نحمّل خدمة الدخول. حدّث الصفحة وجرّب تاني.", "The sign-in service did not load. Please reload the page.")) + "</p>"; return; }
  app.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-lg]") : null; if (!b) return;
    var k = b.getAttribute("data-lg");
    if (k === "code") { var em = (A.user() || {}).email || ""; stop(); F = A.signin(app, { email: em, after: false, fine: false, onDone: done }); return; }
    /* «خروج» / «ادخل ببريد تاني»: the server ends the session, then the form (data/mig-api.js fires mig:logout) */
    b.disabled = true; pend = k === "out" ? T("تم تسجيل الخروج.", "You are signed out.") : T("اكتب البريد اللي مصنعك مسجّل بيه.", "Enter the e-mail your factory is registered with.");
    A.logout().then(function () { if (A.token()) return; if (pend) { form(pend); pend = ""; } });
  });
  window.addEventListener("mig:logout", function () { form(pend); pend = ""; oldCard(); });
  if (TEAM) { var sub = document.querySelector(".lgp-card .mig-sub"); if (sub) sub.textContent = T("دخول فريق المنصة", "Platform team sign-in"); }
  if (A.token()) {
    oldOff(); signedIn(A.user());
    /* the server confirms the session (an expired one ends with a 401 → mig:logout → the form) */
    A.me().then(function (r) { if (r && r.user && A.token() && !F) signedIn(r.user); }, function () {});
  } else { form("", true); oldCard(); }
})();'''


def _sg_page(L, path, sp):
    en = L == 'en'
    X = lambda k: _SG[k][1] if en else _SG[k][0]
    urls = {'dash': sp.get('dashboard', '/dashboard/'), 'register': sp.get('register', '/register/'), 'home': '/en/' if en else '/',
            'admin': sp.get('admin', '/admin/'), 'seoteam': sp.get('seo-team', '/seo-team/'), 'datadesk': sp.get('data-desk', '/data-desk/')}
    head = seo_static_head('signin', X('title'), lang=L, h1=X('h1'))
    if en:
        # the English meta description (seo_static_head translates the Arabic one with the site dictionary, which does not have it)
        d = _sg_html.escape(_SG['desc'][1], quote=True)
        for rx in (r'(<meta name="description" content=")[^"]*(">)', r'(<meta property="og:description" content=")[^"]*(">)', r'(<meta name="twitter:description" content=")[^"]*(">)'):
            head = _sg_re.sub(rx, lambda m: m.group(1) + d + m.group(2), head, count=1)
    reg = urls['register'] + ('?lang=en' if en else '')
    sw = ('/login/?lang=ar', 'ar', 'العربية') if en else ('/en/login/', 'en', 'English')
    legal = sp.get('legal', '/legal/') + ('?lang=en' if en else '') + '#privacy'
    body = ('<main class="lgp" id="top"><div class="mig-card lgp-card">'
            '<a class="lgp-logo" href="%s"><img src="/img/logo-site.png" alt="%s" width="67" height="64"></a>'
            '<h1 class="mig-t" id="lgpT">%s</h1><p class="mig-sub">%s</p>'
            '<div class="lgp-app" id="lgpApp"><noscript><p class="mig-er" style="color:#B00020;font-weight:700">%s</p></noscript></div><div class="lgp-old" id="lgpOld" hidden></div>'
            '<p class="lgp-links">%s <a href="%s">%s</a> · <a href="%s">%s</a><span data-mig-app-only hidden> · <a href="%s" rel="nofollow">%s</a></span></p></div>'
            '<div class="lgp-foot"><p class="lgp-fine">%s</p>'
            '<p class="lgp-lang"><a id="lgpSw" href="%s" hreflang="%s" lang="%s" data-lang="%s" rel="nofollow">%s</a></p></div></main>'
            % (urls['home'], X('logo'), X('h1'), X('sub'), X('nojs'), X('noacc'), reg, X('reg'), urls['home'], X('home'), ('/en/login/' if en else '/login/') + '?team=1', X('team'),
               X('fine') % _sg_html.escape(legal, quote=True), sw[0], sw[1], sw[1], sw[1], sw[2]))
    boot = _SG_BOOT % {'en': 'true' if en else 'false', 'urls': _sg_json.dumps(urls).replace('<', '\\u003c')}
    html = ('<!doctype html>\n<html lang="%s" dir="%s"><head>%s<style>%s</style><script>%s</script><script src="data/mig-api.js"></script></head>'
            '<body>%s<script>%s</script>%s</body></html>') % ('en' if en else 'ar', 'ltr' if en else 'rtl', head, _SG_CSS, boot, body, _SG_JS, seo_static_tail())
    return seo_rewrite_links(_bust(html), lang=L)


def _sg_write(OUT, path):
    sp = SEO_STATE['cfg'].get('static_paths', {})
    en_dir = OUT + 'en' + path
    # the English file exists before either head is made, so both carry the same hreflang pair (seo_static_head looks for the file)
    os.makedirs(en_dir, exist_ok=True)
    open(en_dir + 'index.html', 'a').close()
    for L in ('en', 'ar'):
        fp = (en_dir if L == 'en' else OUT + path.lstrip('/')) + 'index.html'
        open(fp, 'w', encoding='utf-8').write(_sg_page(L, path, sp))


PAGE_WRITERS['signin'] = _sg_write
# kept out of the legacy sitemap.xml too (same pattern as meeting.part.py / inbox.part.py)
_seo_files_sg = seo_files
def seo_files(OUT, keys):
    return _seo_files_sg(OUT, [k for k in keys if k != 'signin'])
