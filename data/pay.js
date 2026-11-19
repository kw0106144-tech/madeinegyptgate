/* pay.html — the public invoice payment page (ACC-CONTRACT §1.8; shell in pay.part.py). Reads #inv=<pay_token>[&r=1] from the address hash
   (the token is never put in a page URL's query string) and the invoice from the Worker:
     GET  /api/pay/invoice?t=<token> → {invoice:{no, status, plan, plan_name, period_days, net_minor, vat_bp, vat_minor, total_minor, currency,
                                        company, issued_at, paid_at, test}, gateway:{ready, provider_label}, manual:{enabled, ar, en}, email_masked}
     POST /api/pay/checkout {t}      → {redirect_url} (the provider's hosted page; no card field on our site, ever)
   Honest states only: nothing is shown as paid without the server saying so; while the gateway is not live the page says
   «بوابة الدفع لسه بتتجهّز» exactly like register.html. No tracking pixels. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window, EN = W.MIGLANG === "en", T = function (a, e) { return EN ? e : a; };
  var API = String(W.MIG_API_BASE || "/api").replace(/\/+$/, ""), TOKEN = "", RET = false, INV = null, POLL = 0, T0 = 0;
  var POLL_MS = W.MIGPAY_POLL_MS || 3000, POLL_MAX = W.MIGPAY_POLL_MAX || 60000;
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"'`]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]; }); }
  function lang(u) { return EN ? u.replace(/^([^#]*)/, function (p) { return p + (p.indexOf("?") > -1 ? "&" : "?") + "lang=en"; }) : u; }
  function money(minor, cur) { var v = (+minor || 0) / 100, s = v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); return EN ? (cur || "EGP") + " " + s : s + " " + (!cur || cur === "EGP" ? "جنيه" : cur); }
  function day(s) { if (!s) return ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date(s)); } catch (e) { return String(s).slice(0, 10); } }
  function hash() {
    var h = ""; try { h = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { h = (location.hash || "").slice(1); }
    var q = {}; h.split("&").forEach(function (p) { var i = p.indexOf("="); if (i > 0) q[p.slice(0, i)] = p.slice(i + 1); else if (p) q[p] = "1"; });
    TOKEN = /^[A-Za-z0-9_\-]{16,128}$/.test(q.inv || "") ? q.inv : ""; RET = q.r === "1";
  }
  function hero(h, p) { var a = $("#payH"), b = $("#payP"); if (a) a.textContent = h; if (b) b.textContent = p; }
  function box(html) { var b = $("#payBox"); if (b) b.innerHTML = html; }
  function side() {
    var s = $("#paySide"); if (!s) return;
    s.innerHTML = '<div class="payc"><h3>🔒 ' + T("الدفع الآمن", "Secure payment") + "</h3><ul><li>" + T("الدفع بيتم في صفحة بوابة الدفع نفسها (البطاقات البنكية والمحافظ الإلكترونية).", "Payment happens on the payment gateway's own page (bank cards and e-wallets).") + "</li><li>"
      + T("منصتنا مش بتطلب ولا بتحفظ بيانات أي كارت.", "Our platform never asks for or stores any card details.") + "</li><li>" + T("الباقة بتتفعّل تلقائياً بعد تأكيد الدفع، والإيصال بيوصلك على الإيميل.", "Your plan is activated automatically once the payment is confirmed, and the receipt reaches your e-mail.") + "</li></ul></div>"
      + '<div class="payc"><h3>💬 ' + T("محتاج مساعدة؟", "Need help?") + '</h3><p style="margin:0;font-size:.88rem">' + T("فريق المنصة بيرد عليك من صفحة التواصل.", "The platform team answers you from the contact page.") + '</p><a class="btn btn-line btn-sm" href="' + lang("contact.html") + '">' + T("تواصل معنا", "Contact us") + "</a></div>";
  }
  function crumb() { var c = $("#payCr"); if (c) c.innerHTML = '<a href="' + lang("home.html") + '">' + T("الرئيسية", "Home") + "</a> › " + T("دفع الفاتورة", "Invoice payment"); }
  /* fetch JSON from the Worker; a static host (no API) answers HTML → offline */
  function req(path, o) {
    o = o || {};
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej({ code: "offline" }); return; }
      var done = false, tm = setTimeout(function () { if (!done) { done = true; rej({ code: "offline" }); } }, o.timeout || 15000);
      fetch(API + path, { method: o.method || "GET", headers: o.body ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined, credentials: "omit", cache: "no-store" }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw { code: "offline", status: r.status }; });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.ok) res(x.j); else { var e = {}; for (var k in x.j) if (Object.prototype.hasOwnProperty.call(x.j, k)) e[k] = x.j[k]; e.code = x.j.code || "http_" + x.st; e.status = x.st; rej(e); }
      }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline" }); });
    });
  }
  function msg(kind, icon, title, text, acts) {
    return '<div class="payst ' + kind + '" role="status">' + (icon ? icon + " " : "") + "<b>" + esc(title) + "</b>" + (text ? '<br><span style="font-weight:600">' + esc(text) + "</span>" : "") + "</div>" + (acts ? '<div class="paya">' + acts + "</div>" : "");
  }
  function dash() { return '<a class="btn btn-green" href="' + lang("dashboard.html#plan") + '">🏠 ' + T("افتح لوحتك", "Open your dashboard") + "</a>"; }
  function contact() { return '<a class="btn btn-line" href="' + lang("contact.html") + '">💬 ' + T("كلّمنا", "Contact us") + "</a>"; }
  function bad() { hero(T("الرابط مش صحيح", "Invalid link"), ""); box(msg("err", "⚠️", T("الرابط ده مش صحيح أو انتهى — لو محتاج مساعدة كلّمنا", "This link is not valid or has expired — contact us if you need help"), "", contact())); }
  function offline() { box(msg("warn", "📡", T("ماقدرناش نوصل لسيرفر المنصة دلوقتي", "We couldn't reach the platform's server right now"), T("محصلش أي دفع. جرّب تاني بعد شوية.", "No payment was made. Please try again shortly."), '<button class="btn btn-line" type="button" id="payRe">↻ ' + T("حاول تاني", "Try again") + "</button>")); var b = $("#payRe"); if (b) b.onclick = load; }
  function card(i) {
    var vat = Math.round((+i.vat_bp || 0) / 100 * 100) / 100, days = +i.period_days || 0;
    var per = days === 365 ? T("سنة (365 يوم)", "One year (365 days)") : days ? (EN ? days + " days" : days + " يوم") : "—";
    /* a prorated upgrade (Terms §5): the price difference for the days left, until the end date of the plan in force */
    if (i.period_end && /^\d{4}-\d{2}-\d{2}$/.test(String(i.period_end))) per = T("ترقية لحد " + i.period_end + " (فرق السعر عن " + days + " يوم فاضلين)", "Upgrade until " + i.period_end + " (the price difference for " + days + " days left)");
    return "<h2>🧾 " + T("فاتورة رقم ", "Invoice ") + '<span class="num" dir="ltr">' + esc(i.no) + "</span>" + (i.test ? ' <span class="paytag">' + T("فاتورة تجريبية (Sandbox)", "Test invoice (Sandbox)") + "</span>" : "") + "</h2>"
      + '<dl class="payinv">' + (i.company ? "<dt>" + T("الشركة", "Company") + '</dt><dd dir="auto">' + esc(i.company) + "</dd>" : "")
      + "<dt>" + T("الباقة", "Plan") + '</dt><dd dir="auto">' + esc(i.plan_name || i.plan) + "</dd><dt>" + T("المدة", "Period") + "</dt><dd>" + esc(per) + "</dd>"
      + "<dt>" + T("الصافي", "Net") + '</dt><dd class="num">' + esc(money(i.net_minor, i.currency)) + "</dd>"
      + "<dt>" + T("ضريبة القيمة المضافة ", "VAT ") + esc(vat + "%") + '</dt><dd class="num">' + esc(money(i.vat_minor, i.currency)) + "</dd>"
      + "<dt><b>" + T("الإجمالي", "Total") + '</b></dt><dd class="num tot">' + esc(money(i.total_minor, i.currency)) + "</dd>"
      + (i.issued_at ? "<dt>" + T("تاريخ الإصدار", "Issued on") + "</dt><dd>" + esc(day(i.issued_at)) + "</dd>" : "") + "</dl>";
  }
  function manualHTML(j, i) {
    var m = j.manual || {}, t = EN ? m.en || m.ar : m.ar || m.en;
    if (!m.enabled || !t) return "";
    return "<h2>🏦 " + T("التحويل البنكي / إنستاباي", "Bank transfer / InstaPay") + '</h2><div class="payman" dir="auto">' + esc(t) + "</div>"
      + msg("info", "✍️", T("اكتب رقم الفاتورة ", "Write the invoice number ") + i.no + T(" في بيان التحويل", " in the transfer description"), T("بعد التحويل، الباقة بتتفعّل لما فريق المنصة يأكد وصول المبلغ.", "After the transfer, the plan is activated once the platform team confirms the amount arrived."));
  }
  /* the invoice as the server answered it */
  /* review PAY-M3: the last attempt reached the gateway (redirected / pending) less than 48 h ago and is not confirmed yet — a lost webhook
     or a browser that never came back; the button stays (the attempt may have been abandoned), but the payer is warned not to pay twice */
  function checking(j) {
    var p = j && (j.last_attempt || j.last_payment || j.payment), at = p ? Date.parse(p.at || "") : NaN;
    return !!(p && /^(redirected|pending)$/.test(String(p.status || "")) && at > 0 && Date.now() - at < 172800000);
  }
  function show(j) {
    var i = j && j.invoice; if (!i || !i.no) { bad(); return; }
    INV = j; var st = String(i.status || ""), g = j.gateway || {};
    hero(T("دفع الفاتورة", "Invoice payment") + " " + i.no, i.company ? i.company : "");
    if (st === "paid") { box(card(i) + msg("ok", "✓", T("الفاتورة دي اتدفعت", "This invoice is paid"), i.paid_at ? T("اتدفعت يوم ", "Paid on ") + day(i.paid_at) : "", dash())); return; }
    if (st === "void") { box(card(i) + msg("warn", "⛔", T("الفاتورة دي اتلغت", "This invoice was cancelled"), T("لو محتاج فاتورة جديدة اطلبها من «باقتي» في لوحتك أو كلّمنا.", "If you need a new invoice, ask for it from “My plan” in your dashboard or contact us."), dash() + contact())); return; }
    if (st === "refunded") { box(card(i) + msg("warn", "↩", T("مبلغ الفاتورة دي اترد", "This invoice was refunded"), "", contact())); return; }
    if (st === "expired") { box(card(i) + msg("warn", "⌛", T("الفاتورة دي انتهت صلاحيتها", "This invoice has expired"), T("اطلب فاتورة جديدة من «باقتي» في لوحتك.", "Ask for a new invoice from “My plan” in your dashboard."), dash() + contact())); return; }
    if (st !== "open") { bad(); return; }
    var mail = j.email_masked ? '<p class="note" style="margin:0">' + esc(T("إيصال الدفع بيوصل على ", "The receipt goes to ") + j.email_masked) + "</p>" : "";
    var man = manualHTML(j, i);
    if (g.ready) {
      box(card(i) + (checking(j) ? msg("warn", "⏳", T("فيه محاولة دفع للفاتورة دي لسه مستنية تأكيد البوابة", "A payment attempt for this invoice is still waiting for the gateway's confirmation"), T("لو المبلغ اتخصم منك ماتدفعش تاني — الإيصال بيوصلك على الإيميل أول ما البوابة تأكد، ولو ماوصلش خلال يومين كلّمنا.", "If the amount was already taken, do not pay again — the receipt reaches your e-mail as soon as the gateway confirms; if nothing arrives within two days, contact us."), "") : "") + '<div class="paya"><button class="paybtn" type="button" id="payGo">💳 ' + T("ادفع الآن", "Pay now") + "</button></div>"
        + '<p class="note" style="margin:0">🔒 ' + esc(T("هتتحوّل لصفحة الدفع الآمنة", "You will be taken to the secure payment page") + (g.provider_label ? " (" + g.provider_label + ")" : "") + T(" — منصتنا مش بتطلب ولا بتحفظ بيانات أي كارت.", " — our platform never asks for or stores card details.")) + "</p>"
        + mail + '<p class="er" role="alert" id="payEr"></p>' + (man ? "<hr style=\"border:0;border-top:1px solid var(--line);width:100%\">" + man : ""));
      $("#payGo").onclick = checkout;
      return;
    }
    if (man) { box(card(i) + man + mail); return; }
    box(card(i) + msg("warn", "⏳", T("بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على الإيميل", "The payment gateway is still being set up — once it is live, the secure payment link reaches you automatically by e-mail"), T("ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.", "We will never ask for card details on our pages.")) + mail);
  }
  function checkout() {
    var b = $("#payGo"), er = $("#payEr"); if (!b) return; b.disabled = true; if (er) er.textContent = "";
    b.innerHTML = '<span class="paysp" aria-hidden="true"></span> ' + T("بنجهّز صفحة الدفع…", "Preparing the payment page…");
    req("/pay/checkout", { method: "POST", body: { t: TOKEN } }).then(function (j) {
      var u = String(j && j.redirect_url || "");
      if (!/^https:\/\/[^\s"'<>`\\]+$/i.test(u)) throw { code: "provider_error" };
      (W.MIGPAYGO || function (x) { location.assign(x); })(u);   /* MIGPAYGO: test seam (the browser tests capture the hand-off) */
    }).catch(function (e) {
      b.disabled = false; b.innerHTML = "💳 " + T("ادفع الآن", "Pay now");
      var c = e && e.code;
      if (c === "state" || c === "gateway_not_ready") { load(); return; }
      if (er) er.innerHTML = '<span class="payst err" style="display:block">' + esc(c === "offline" ? T("ماقدرناش نوصل لسيرفر المنصة دلوقتي — جرّب تاني بعد شوية.", "We couldn't reach the platform's server — please try again shortly.")
        : c === "rate_limited" || (e && e.status === 429) ? T("محاولات كتير ورا بعض — استنى شوية وجرّب تاني.", "Too many attempts — please wait a little and try again.")
        : T("بوابة الدفع مش بترد دلوقتي — جرّب تاني بعد شوية.", "The payment gateway is not responding right now — please try again shortly.")) + "</span>";
    });
  }
  /* «والباقة اتفعّلت» only when the server says the activation is done (activation.status, ACC-CONTRACT D7): pending = the cron retries
     within minutes, review = a higher plan was already in force or the team must decide — the payment itself is confirmed either way */
  function paidMsg(j) {
    var a = j && j.activation, until = a && a.plan_until ? T("الباقة سارية لحد ", "Your plan is valid until ") + day(a.plan_until) : "";
    if (a && a.status && a.status !== "done") return msg("ok", "✓", T("اتدفعت الفاتورة", "The invoice is paid"), a.status === "review" ? T("فريق المنصة بيراجع تفعيل الباقة وهيبلغك على الإيميل.", "The platform team is reviewing the plan activation and will e-mail you.") : T("تفعيل الباقة بيخلص خلال دقايق، والإيصال بيوصلك على الإيميل.", "The plan activation completes within minutes; the receipt reaches your e-mail."), dash());
    return msg("ok", "✓", T("اتدفعت الفاتورة والباقة اتفعّلت", "The invoice is paid and your plan is active"), until, dash());
  }
  /* back from the provider (#…&r=1): the result comes only from the server (webhook / re-query), never from the return URL */
  /* the Worker answers last_attempt:{status, provider, at} (payments.js publicInvoice, ACC-CONTRACT D7); last_payment / payment are older names */
  function failed(j) { var p = j && (j.last_attempt || j.last_payment || j.payment); return !!(p && /^(failed|cancelled|expired)$/.test(String(p.status || ""))); }
  function poll() {
    clearTimeout(POLL);
    req("/pay/invoice?t=" + encodeURIComponent(TOKEN)).then(function (j) {
      var i = j && j.invoice; if (!i) { bad(); return; }
      if (i.status === "paid") { hero(T("تم الدفع", "Payment done"), ""); box(card(i) + paidMsg(j)); return; }
      if (i.status !== "open") { show(j); return; }
      if (failed(j)) { hero(T("دفع الفاتورة", "Invoice payment") + " " + i.no, i.company ? i.company : ""); box(card(i) + msg("err", "✕", T("الدفع ماتمّش — تقدر تحاول تاني", "The payment did not go through — you can try again"), "", '<button class="btn btn-green" type="button" id="payAgain">💳 ' + T("حاول تاني", "Try again") + "</button>")); $("#payAgain").onclick = again; return; }
      if (Date.now() - T0 >= POLL_MAX) { box(card(i) + msg("warn", "⌛", T("لسه ماوصلناش تأكيد من بوابة الدفع. هنبعتلك إيميل أول ما يوصل.", "We have not received the gateway's confirmation yet. We will e-mail you as soon as it arrives."), "", '<button class="btn btn-line" type="button" id="payRe2">↻ ' + T("حدّث", "Refresh") + "</button>" + contact())); $("#payRe2").onclick = function () { T0 = Date.now(); waiting(); poll(); }; return; }
      POLL = setTimeout(poll, POLL_MS);
    }, function (e) {
      if (e && e.status === 404) { bad(); return; }
      if (Date.now() - T0 >= POLL_MAX) { offline(); return; }
      POLL = setTimeout(poll, POLL_MS);
    });
  }
  function waiting() { hero(T("جاري تأكيد الدفع…", "Confirming the payment…"), ""); box(msg("info", '<span class="paysp" aria-hidden="true"></span>', T("جاري تأكيد الدفع…", "Confirming the payment…"), T("ماتقفلش الصفحة — بنستنى تأكيد بوابة الدفع (لحد دقيقة).", "Please keep this page open — we are waiting for the gateway's confirmation (up to a minute)."))); }
  function again() { try { history.replaceState(null, "", location.pathname + location.search + "#inv=" + TOKEN); } catch (e) { /* old browsers */ } RET = false; load(); }
  function load() {
    clearTimeout(POLL); hash();
    if (!TOKEN) { bad(); return; }
    if (RET) { T0 = Date.now(); waiting(); poll(); return; }
    box('<div class="paysk"></div><div class="paysk" style="width:60%"></div>');
    req("/pay/invoice?t=" + encodeURIComponent(TOKEN)).then(show, function (e) { if (e && (e.status === 404 || e.code === "not_found")) bad(); else offline(); });
  }
  function start() { crumb(); side(); load(); }
  W.addEventListener("hashchange", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
