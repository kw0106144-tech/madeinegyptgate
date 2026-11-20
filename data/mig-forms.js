/* MIGINQ — one honest path for every "send / contact / request / interest / offer" form on the platform.
   ES5, no dependencies. Uses data/mig-api.js (window.MIGAPI.inquiry → POST /api/inquiries → {ok, ref, status, routed}).
   Rules (owner decisions, final):
   - nothing is shown as "sent" unless the server answered with a real ref; the UI states the TRUE number of factories the
     request was routed to (automatic matching to registered member factories, basic plan or higher; premium first);
   - 0 matches → said honestly: the request stays open 30 days and is sent automatically to matching members who join later;
   - no human operator: messages say what happens automatically, never "our team will call you";
   - API unreachable (static preview) → honest "not sent" + a Janna meeting as the fallback.
   Window events (same window as the form): "mig:inquiry" {ok, ref, status, routed, kind, error, code} — Janna's screen listens to it.
   API: MIGINQ.send(obj, {box, form, btn, onOk}) · MIGINQ.dialog(cfg) · MIGINQ.result(j, kind) · MIGINQ.fail(e)
        MIGINQ.setTarget({type, id, name}) / getTarget() / clearTarget() (RFQ addressed to one factory: sessionStorage "mig-rfq-to")
        MIGINQ.ctx({type, id, title, url}) (sets window.MIG_CTX and fires "mig:ctx") · MIGINQ.prefill(map) · MIGINQ.consentHTML(p)
        MIGINQ.planOK(feature) / MIGINQ.lockHTML(feature) · MIGINQ.marketOf(text) · MIGINQ.inScope(market) */
(function () {
  if (window.MIGINQ && window.MIGINQ.__v) return;
  var EN = function () { return window.MIGLANG === "en"; };
  var T = function (ar, en) { return EN() ? en : ar; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fire(d) { try { window.dispatchEvent(new CustomEvent("mig:inquiry", { detail: d })); } catch (e) {} }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function user() { try { return window.MIGAPI && MIGAPI.token() && MIGAPI.user ? MIGAPI.user() : null; } catch (e) { return null; } }
  var EMRE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
  function digits(s) { return String(s == null ? "" : s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 1632); }); }

  var CSS = ".mgq-ok{background:var(--green-soft,#e8f5ee);color:var(--fg,#111);border:1px solid var(--green,#0b5d47);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;line-height:1.85;font-size:.92rem}"
    + ".mgq-ok b.h{color:var(--green,#0b5d47);font-size:1.02rem}.mgq-ok .ref{font:800 1.05rem/1.4 ui-monospace,Menlo,Consolas,monospace;direction:ltr;unicode-bidi:isolate;letter-spacing:.04em}"
    + ".mgq-ok .acts,.mgq-er .acts{display:flex;gap:8px;flex-wrap:wrap}.mgq-ok .sm,.mgq-er .sm{font-size:.8rem;color:var(--muted,#555)}"
    + ".mgq-wait{background:#FFF7E0;border-color:#C09300}.mgq-er{background:#FEF3F2;color:#7A271A;border:1px solid #F4B9B2;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-weight:700;font-size:.9rem;line-height:1.8}"
    + ".mgq-cons{display:flex;flex-direction:column;gap:6px;font-size:.8rem;color:var(--muted,#555);line-height:1.7}.mgq-cons label{display:flex;gap:8px;align-items:flex-start;font-weight:600;color:var(--fg,#111)}.mgq-cons input{margin-top:5px;flex:none}"
    + ".mgq-to{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--gold-soft,#FBF4DE);border:1px dashed var(--gold,#C09300);border-radius:12px;padding:8px 12px;font-weight:700;font-size:.88rem}.mgq-to button{border:0;background:none;color:var(--green,#8E0B20);font:inherit;font-size:.8rem;text-decoration:underline;cursor:pointer}"
    + ".mgq-dlg{position:fixed;inset:0;z-index:9350;background:rgba(10,14,22,.62);display:grid;place-items:center;padding:14px}"
    + ".mgq-box{width:min(560px,100%);max-height:calc(100vh - 28px);overflow:auto;background:var(--surface,#fff);color:var(--fg,#111);border-radius:18px;border-top:5px solid var(--gold,#C09300);padding:20px;display:flex;flex-direction:column;gap:12px;position:relative;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}"
    + ".mgq-box h2{margin:0;font-size:1.18rem;font-weight:800;padding-inline-end:36px}.mgq-box .x{position:absolute;top:10px;inset-inline-end:10px;width:34px;height:34px;border-radius:50%;border:0;background:var(--sunken,#f2f2f2);color:inherit;cursor:pointer;font-size:1rem}"
    + ".mgq-box .intro{margin:0;color:var(--muted,#555);font-size:.88rem;line-height:1.8}.mgq-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mgq-grid .full{grid-column:1/-1}"
    + ".mgq-grid label{display:flex;flex-direction:column;gap:5px;font-size:.85rem;font-weight:700}.mgq-grid input,.mgq-grid select,.mgq-grid textarea{font:inherit;font-weight:400;color:var(--fg,#111);background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:10px;padding:9px 11px;min-width:0;width:100%;box-sizing:border-box}"
    + ".mgq-grid textarea{min-height:96px;resize:vertical}.mgq-err{color:#B42318;font-weight:700;font-size:.85rem;min-height:1.1em;margin:0}"
    + "@media (max-width:560px){.mgq-grid{grid-template-columns:1fr}}";
  function addCSS() { if (document.getElementById("mgq-css")) return; var s = document.createElement("style"); s.id = "mgq-css"; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  if (document.head) addCSS(); else document.addEventListener("DOMContentLoaded", addCSS);

  /* ---------- plan / geographic scope (UI only; the server decides every action) ---------- */
  var MKAR = { "المحلي": "local", "مصر": "local", "الخليجي": "gulf", "العربي": "gulf", "الأفريقي": "africa", "الآسيوي": "asia", "الأوروبي": "europe" };
  function marketOf(x) { x = String(x || ""); if (/^(local|gulf|africa|asia|europe)$/.test(x)) return x; return MKAR[x] || "local"; }
  function plan() { return window.MIGPLAN || null; }
  function lv() { var P = plan(); return P && P.plan ? P.plan.lv : 0; }
  function inScope(m) { var P = plan(); if (!P) return m === "local"; if (P.plan.lv < 1) return false; return P.market(marketOf(m)); }
  function planOK(f) { var P = plan(); return !!(P && P.can(f)); }
  function lockHTML(f, title) { var P = plan(); return P && P.lockHTML ? P.lockHTML(f, title) : '<div class="mgq-er">' + esc(T("الخدمة دي للأعضاء.", "This is for members.")) + ' <a data-mig-buy href="register.html#plans">' + esc(T("الباقات", "Plans")) + "</a></div>"; }
  function scopeLockHTML(m, title) { var P = plan(); return P && P.scopeLockHTML ? P.scopeLockHTML(marketOf(m), title) : lockHTML("tenders", title); }

  /* ---------- page context for Janna, follows and beacons ---------- */
  function ctx(c) { window.MIG_CTX = c || null; try { window.dispatchEvent(new CustomEvent("mig:ctx", { detail: c || {} })); } catch (e) {} }

  /* ---------- an RFQ addressed to one factory / company (fixes the dead "mig-rfq-to") ---------- */
  function setTarget(t) { if (!t || !t.name) { ss("mig-rfq-to", null); return; } ss("mig-rfq-to", JSON.stringify({ type: t.type || "company", id: String(t.id == null ? "" : t.id), name: String(t.name), url: t.url || "" })); }
  function getTarget() { var v = ss("mig-rfq-to"); if (!v) return null; try { var o = JSON.parse(v); return o && o.name ? o : null; } catch (e) { return { type: "company", id: "", name: v }; } }

  /* ---------- prefill from the signed-in account ---------- */
  function prefill(map, root) {
    var u = user(); if (!u) return; root = root || document;
    var v = { name: ((u.title ? u.title + " " : "") + (u.name || "")).trim(), email: u.email, phone: u.phone, company: u.company };
    Object.keys(map || {}).forEach(function (k) { var el = root.querySelector(map[k]); if (el && !el.value && v[k]) el.value = v[k]; });
  }

  /* ---------- consent (Egypt PDPL 151/2020): WhatsApp is opt-in, data use is stated ---------- */
  /* no WhatsApp opt-in box here: the platform does not send request updates to buyers on WhatsApp yet (they arrive by e-mail and on the
     tracking page), so it would collect a consent that does nothing — consent_wa is sent as false */
  function consentHTML(p, kind) {
    p = p || "mgq";
    var routes = kind === "rfq" || kind === "basket" || kind === "contact_factory";
    return '<div class="mgq-cons">'
      + "<span>" + esc(routes ? T("بإرسالك الطلب بتوافق إن المنصة تبعت تفاصيله (من غير رقم موبايلك) تلقائياً للمصانع المسجّلة اللي بتطابقه بس، وتبعتلك ردودهم. ", "By sending, you agree that the platform automatically shares the request details (not your mobile number) only with the registered factories that match it, and forwards their answers to you. ") : T("بإرسالك بتوافق إن المنصة تحفظ بياناتك علشان الطلب ده بس. ", "By sending, you agree that the platform keeps your details for this request only. "))
      + '<a href="legal.html#privacy" target="_blank" rel="noopener">' + esc(T("سياسة الخصوصية", "Privacy policy")) + "</a></span></div>";
  }
  function waChecked(p, root) { var el = (root || document).querySelector("#" + (p || "mgq") + "-wa"); return !!(el && el.checked); }

  /* ---------- results ---------- */
  function n2(n) { return EN() ? (n === 1 ? "one registered factory/company" : n === 2 ? "two registered factories/companies" : n + " registered factories/companies") : n === 1 ? "مصنع/شركة واحدة مسجّلة" : n === 2 ? "مصنعين/شركتين مسجّلتين" : n + " مصانع/شركات مسجّلة"; }
  function trackHref(ref) { return "track.html#" + encodeURIComponent(ref); }
  function meetBtn() { return '<button class="btn btn-line btn-sm" type="button" data-mgq-meet>' + esc(T("📅 احجز اجتماع مع جنة", "📅 Book a meeting with Janna")) + "</button>"; }
  var RECORDED = {
    contact: ["رسالتك اتسجّلت. جنة (المساعدة الذكية) بترد فوراً على أغلب الأسئلة من أي صفحة، وتقدر تحجز اجتماع تعريفي معاها في أي وقت.", "Your message is recorded. Janna (the AI assistant) answers most questions instantly on any page, and you can book an introductory meeting with her at any time."],
    opp_offer: ["عرضك اتسجّل على الفرصة ومحفوظ في حسابك. بيانات صاحب الفرصة مش متاحة على المنصة، فالتقديم الرسمي بيكون عند الجهة من الإعلان الرسمي، وهنبلغك تلقائياً بأي تحديث على الفرصة.", "Your offer is recorded on this opportunity and kept in your account. The publisher's contact is not on the platform, so the official submission is made to the entity through its official notice; you will be notified automatically of updates."],
    lead_interest: ["اهتمامك اتسجّل، وهنبلغك تلقائياً بأي تحديث.", "Your interest is recorded; you will be notified automatically of updates."],
    project_interest: ["اهتمامك بالمشروع اتسجّل، وهنبلغك تلقائياً بأي تحديث عليه.", "Your interest in the project is recorded; you will be notified automatically of updates."],
    entity_contact: ["رسالتك اتسجّلت. المنصة ما بتراسلش الجهات أو الشركات غير المسجّلة نيابةً عن حد؛ تقدر تتواصل معاها من بياناتها الرسمية المنشورة.", "Your message is recorded. The platform does not write to entities or unregistered companies on anyone's behalf; use their official published contact details."],
    signup: ["طلب الاشتراك اتسجّل. تقدر تدخل دلوقتي بكود على الإيميل وتكمّل بيانات شركتك. الدفع الإلكتروني الآمن بيتجهّز — أول ما يشتغل هيوصلك رابطه تلقائياً على الإيميل ده، ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.", "Your application is recorded. You can sign in now with an e-mail code and complete your company data. Secure online payment is being set up — once live, its link is e-mailed to you automatically; we never ask for card details on our pages."],
    profile_fix: ["طلب التصحيح اتسجّل وهيتطبّق في تحديث البيانات الجاي بعد التحقق من المصدر.", "Your correction is recorded and will be applied in the next data update after the source is checked."]
  };
  var RECORDED_OUT = {
    lead_interest: ["اهتمامك اتسجّل برقم متابعة. ادخل بحسابك (كود على الإيميل) علشان تتابع التحديثات تلقائياً.", "Your interest is recorded under a tracking number. Sign in (e-mail code) to follow updates automatically."],
    project_interest: ["اهتمامك بالمشروع اتسجّل برقم متابعة. ادخل بحسابك (كود على الإيميل) علشان تتابع تحديثاته تلقائياً.", "Your interest in the project is recorded under a tracking number. Sign in (e-mail code) to follow its updates automatically."]
  };
  function result(j, kind) {
    j = j || {}; var ref = String(j.ref || ""), st = String(j.status || "").toLowerCase(), n = +j.routed || 0, wait = false, body;
    var routable = kind === "rfq" || kind === "basket";
    if (j.duplicate) body = T("الطلب ده اتسجّل قبل كده بنفس البيانات، ودي حالته الحالية.", "This request was already recorded with the same details; this is its current status.") + " ";
    else body = "";
    if (st === "routed" || st === "replied" || st === "quoted" || (n > 0 && st !== "recorded")) {
      body += T("اتبعت تلقائياً لـ" + n2(n) + " على المنصة بتطابق طلبك. الردود وعروض الأسعار هتتبعتلك تلقائياً على بريدك أول ما توصل، والحالة بتتحدّث في صفحة التتبع.", "It was sent automatically to " + n2(n) + " on the platform that " + (n === 1 ? "matches" : "match") + " your request. Replies and quotes are forwarded to your e-mail automatically as they arrive, and the status updates on the tracking page.");
    } else if (routable && st === "received") {
      /* matched factories exist but the sending is being retried (worker/src/inquiries.js: status stays "received" until a send succeeds) */
      wait = true;
      body += T("طلبك اتسجّل، والإرسال للمصانع المطابقة بيتعاد تلقائي خلال ساعة بسبب عطل مؤقت في الإرسال. هيوصلك إيميل بالعدد الحقيقي أول ما يتبعت، والحالة بتتحدّث في صفحة التتبع.", "Your request is recorded; sending it to the matching factories is retried automatically within the hour because of a temporary sending problem. You will get an e-mail with the real number once it is sent, and the tracking page updates.");
    } else if (st === "in_progress") {
      /* no registered match: the Worker notified the platform's administrators and is looking for candidate factories («جاري معالجة طلبك») */
      wait = true;
      body += T("جاري معالجة طلبك: لحد دلوقتي مفيش مصنع مسجّل على المنصة بيطابق طلبك، فإدارة المنصة اتبلّغت تلقائياً وبتدوّر على مصانع تقدر تنفّذه. أي رد هيظهر في صفحة التتبع، والطلب هيفضل مفتوح 30 يوم وهيتبعت تلقائياً لأي مصنع مطابق يسجّل.", "We're working on your request: no registered factory on the platform matches it yet, so the platform's administrators were notified automatically and are looking for factories that can fulfil it. Any reply appears on the tracking page, and the request stays open for 30 days and is sent automatically to any matching factory that registers.");
    } else if (st === "no_match" || st === "waiting" || st === "open") {
      wait = true;
      body += T("لحد دلوقتي مفيش مصنع مسجّل على المنصة بيطابق طلبك، فماتبعتش لأي حد. الطلب هيفضل مفتوح 30 يوم وهيتبعت تلقائياً لأي مصنع مطابق يسجّل، وهيوصلك إيميل ساعتها. ممكن كمان توسّع المواصفات في طلب جديد، أو تحجز اجتماع مع جنة تساعدك.", "No registered factory on the platform matches your request yet, so it was not sent to anyone. It stays open for 30 days and is sent automatically to any matching factory that registers — you will get an e-mail then. You can also broaden the specifications in a new request, or book a meeting with Janna for help.");
    } else {
      /* «you will be notified» is said only to a signed-in member: the server follows the item for them (inquiries.js auto-follow) */
      var r = !user() && RECORDED_OUT[kind] ? RECORDED_OUT[kind] : RECORDED[kind]; body += r ? T(r[0], r[1]) : T("طلبك اتسجّل.", "Your request is recorded.");
    }
    return '<div class="mgq-ok' + (wait ? " mgq-wait" : "") + '" role="status" data-inq-ref="' + esc(ref) + '" data-inq-status="' + esc(st) + '" data-inq-routed="' + n + '"><b class="h">✓ ' + esc(T("اتسجّل برقم", "Recorded under number")) + ' <span class="ref">' + esc(ref) + "</span></b><span>" + esc(body) + "</span>"
      + '<span class="sm">' + esc(T("بنبعت إيصال بالرقم ده على بريدك. للمتابعة: رقم الطلب + آخر 4 أرقام من الموبايل اللي كتبته (أو ادخل بحسابك).", "A receipt with this number is being e-mailed to you. To track it: the number + the last 4 digits of the mobile you entered (or sign in).")) + "</span>"
      + '<span class="acts"><a class="btn btn-green btn-sm" href="' + trackHref(ref) + '">' + esc(T("تتبّع الطلب ←", "Track the request →")) + "</a>" + (wait ? meetBtn() : "") + "</span></div>";
  }
  function fail(e) {
    e = e || {}; var off = e.code === "offline", msg;
    /* same opening as data/mig-api.js's offline message; no meeting offer here (booking needs the same server) */
    if (off) msg = T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فطلبك ماتبعتش ومااتسجّلش. جرّب تاني بعد شوية.", "We couldn't reach the platform's server right now, so your request was NOT sent or recorded. Please try again shortly.");
    else if (window.MIGAPI && MIGAPI.ui && MIGAPI.ui.errText) msg = T("الطلب ماتبعتش: ", "The request was not sent: ") + MIGAPI.ui.errText(e);
    else msg = T("الطلب ماتبعتش: ", "The request was not sent: ") + (e.error || e.code || "");
    if (!off && /^(invalid_email)$/.test(e.code)) msg = T("اكتب بريد إلكتروني صحيح — عليه بيوصلك الإيصال والردود.", "Please enter a valid e-mail — the receipt and replies go there.");
    if (!off && /^(name_required|invalid_name)$/.test(e.code)) msg = T("اكتب اسمك (من غير روابط).", "Please enter your name (no links).");
    if (!off && e.code === "verification_required") msg = T("لازم نتأكد إنك مش برنامج آلي. حدّث الصفحة وجرّب تاني.", "We need to verify you are not a bot. Reload the page and try again.");
    return '<div class="mgq-er" role="alert" data-inq-error="' + esc(e.code || "error") + '"><span>⚠️ ' + esc(msg) + "</span>" + "</div>";
  }

  /* ---------- optional Cloudflare Turnstile: the Worker asks anonymous senders for it only when TURNSTILE_SECRET is set; the page
     gets a token only when a site key is configured (window.MIG_TURNSTILE_SITEKEY, or the meetings key) — otherwise nothing is loaded ---------- */
  function human() {
    var key = String(window.MIG_TURNSTILE_SITEKEY || window.MEETINGS_TURNSTILE_SITEKEY || "");
    if (!key || user()) return Promise.resolve("");
    return new Promise(function (res) {
      var box = null, fin = function (t) { if (fin.d) return; fin.d = 1; if (box) setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 400); res(t || ""); };
      setTimeout(fin, 20000);
      var go = function () {
        try {
          box = document.createElement("div"); box.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9500"; document.body.appendChild(box);
          window.turnstile.render(box, { sitekey: key, appearance: "interaction-only", language: EN() ? "en" : "ar", callback: fin, "error-callback": function () { fin(""); }, "expired-callback": function () { fin(""); } });
        } catch (e) { fin(""); }
      };
      if (window.turnstile) go();
      else { var sc = document.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.onload = go; sc.onerror = function () { fin(""); }; document.head.appendChild(sc); }
    });
  }

  /* ---------- send ---------- */
  function send(o, opt) {
    opt = opt || {}; o = o || {};
    var box = opt.box, btn = opt.btn, form = opt.form, old = btn ? btn.innerHTML : "";
    if (!o.source) o.source = window.__migJannaSubmit ? "janna" : "form";
    if (!o.lang) o.lang = EN() ? "en" : "ar";
    if (!window.MIGAPI || !MIGAPI.inquiry) {
      var e0 = { code: "offline" };
      if (box) { box.innerHTML = fail(e0); box.hidden = false; }
      fire({ ok: false, code: "offline", kind: o.kind });
      return Promise.reject(e0);
    }
    if (btn) { btn.disabled = true; btn.textContent = T("جاري الإرسال…", "Sending…"); }
    return human().then(function (tk) { if (tk) o.turnstile = tk; return MIGAPI.inquiry(o); }).then(function (j) {
      if (box) { box.innerHTML = result(j, o.kind); box.hidden = false; }
      if (form && opt.hideForm !== false) form.hidden = true;
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
      fire({ ok: true, ref: j.ref, status: j.status, routed: +j.routed || 0, kind: o.kind, duplicate: !!j.duplicate });
      try { window.dispatchEvent(new CustomEvent("mig:agent-action", { detail: { tool: "janna_submit_form", ok: true } })); } catch (x) {}
      if (opt.onOk) try { opt.onOk(j); } catch (x) {}
      if (box && box.scrollIntoView) try { box.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (x) {}
      return j;
    }, function (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
      if (box) { box.innerHTML = fail(e); box.hidden = false; }
      fire({ ok: false, code: (e && e.code) || "error", error: e && e.error, kind: o.kind });
      throw e;
    });
  }
  /* basic field checks shared by the forms (the server checks again) */
  function check(v) {
    var u = user();
    if (!u || !u.email) { if (!EMRE.test(String(v.email || "").trim())) return T("اكتب بريد إلكتروني صحيح — عليه بيوصلك الإيصال والردود.", "Please enter a valid e-mail — the receipt and replies go there."); }
    if (!u || !u.name) { if (String(v.name || "").trim().length < 2) return T("اكتب اسمك.", "Please enter your name."); }
    if (v.phone && (digits(v.phone).match(/\d/g) || []).length < 8) return T("رقم الموبايل مش صحيح.", "The mobile number is not valid.");
    if (v.needPhone && !v.phone && !(u && u.phone)) return T("اكتب رقم الموبايل (آخر 4 أرقام منه بتتبّع بيهم الطلب).", "Please enter your mobile (its last 4 digits are used to track the request).");
    return "";
  }

  /* ---------- a small form dialog for item-level actions (offer on an RFQ, interest, contact an entity…) ----------
     cfg: {kind, target_type, target_id, target_name, title, intro (html), fields: [{k, label, type, req, ph, opts, full}],
           message: {label, ph, req} | false, payload: {}, needPhone, consentKind, submit, note (html shown above the button),
           needPlan: "respond" (UI lock; the server checks too), source, onOk(j) (after the server answered with a ref)} */
  function dialog(cfg) {
    cfg = cfg || {}; addCSS();
    if (cfg.needPlan && !planOK(cfg.needPlan)) {
      var dl = document.createElement("div"); dl.className = "mgq-dlg";
      dl.innerHTML = '<div class="mgq-box" role="dialog" aria-modal="true"><button class="x" type="button" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button>' + lockHTML(cfg.needPlan, cfg.lockTitle) + "</div>";
      document.body.appendChild(dl); dl.addEventListener("click", function (e) { if (e.target === dl || e.target.closest(".x")) dl.remove(); });
      return dl;
    }
    var u = user(), p = "mgqd" + Date.now().toString(36);
    var F = [];
    if (!u || !u.name) F.push({ k: "name", label: T("الاسم *", "Name *"), req: 1, ac: "name" });
    if (!u || !u.company) F.push({ k: "company", label: T("الشركة / المصنع", "Company / factory"), ac: "organization" });
    if (!u || !u.email) F.push({ k: "email", label: T("البريد الإلكتروني *", "E-mail *"), type: "email", req: 1, ltr: 1, ac: "email" });
    if (!u || !u.phone) F.push({ k: "phone", label: T("الموبايل", "Mobile") + (cfg.needPhone ? " *" : ""), type: "tel", ltr: 1, ac: "tel", ph: "+20 1X XXXX XXXX" });
    F = F.concat(cfg.fields || []);
    var fh = F.map(function (f) {
      var id = p + "-" + f.k, a = ' id="' + id + '"' + (f.ltr ? ' dir="ltr"' : "") + (f.ac ? ' autocomplete="' + f.ac + '"' : "") + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + (f.type === "number" ? ' inputmode="decimal"' : "");
      var inp = f.opts ? '<select' + a + ">" + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>" : '<input type="' + (f.type === "number" ? "text" : (f.type || "text")) + '"' + a + (f.v != null ? ' value="' + esc(f.v) + '"' : "") + ">";
      return '<label class="' + (f.full ? "full" : "") + '">' + esc(f.label) + inp + "</label>";
    }).join("");
    var m = cfg.message === false ? null : (cfg.message || {});
    if (m) fh += '<label class="full">' + esc(m.label || T("الرسالة", "Message")) + '<textarea id="' + p + '-msg"' + (m.ph ? ' placeholder="' + esc(m.ph) + '"' : "") + ">" + esc(m.v || "") + "</textarea></label>";
    var d = document.createElement("div"); d.className = "mgq-dlg";
    d.innerHTML = '<div class="mgq-box" role="dialog" aria-modal="true" aria-labelledby="' + p + '-t"><button class="x" type="button" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button>'
      + '<h2 id="' + p + '-t">' + esc(cfg.title || T("إرسال", "Send")) + "</h2>" + (cfg.intro ? '<p class="intro">' + cfg.intro + "</p>" : "")
      + (u ? '<p class="intro">' + esc(T("هيتبعت باسم حسابك: ", "Sent from your account: ")) + "<b>" + esc(u.email || "") + "</b></p>" : "")
      + '<form novalidate><div class="mgq-grid">' + fh + "</div>" + consentHTML(p, cfg.consentKind || cfg.kind) + (cfg.note ? '<p class="intro">' + cfg.note + "</p>" : "")
      + '<p class="mgq-err" role="alert"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-green" type="submit">' + esc(cfg.submit || T("إرسال", "Send")) + "</button></div></form><div class=\"mgq-res\" hidden></div></div>";
    document.body.appendChild(d);
    var prev = document.activeElement, box = d.querySelector(".mgq-box"), fm = d.querySelector("form"), er = d.querySelector(".mgq-err");
    function close() { d.remove(); try { if (prev && prev.focus) prev.focus(); } catch (e) {} }
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest(".x")) close(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    setTimeout(function () { var f = fm.querySelector("input,select,textarea"); if (f) f.focus(); }, 40);
    fm.addEventListener("submit", function (e) {
      e.preventDefault(); er.textContent = "";
      var v = function (k) { var el = fm.querySelector("#" + p + "-" + k); return el ? String(el.value || "").trim() : ""; };
      var miss = F.filter(function (f) { return f.req && !v(f.k); }).map(function (f) { return f.label.replace(/\s*\*$/, ""); });
      if (miss.length) { er.textContent = T("أكمل: ", "Please complete: ") + miss.join(T("، ", ", ")); return; }
      var msg = m ? String((fm.querySelector("#" + p + "-msg") || {}).value || "").trim() : "";
      if (m && m.req && !msg) { er.textContent = T("اكتب رسالتك.", "Please write your message."); return; }
      var c = check({ name: v("name"), email: v("email"), phone: v("phone"), needPhone: cfg.needPhone }); if (c) { er.textContent = c; return; }
      var pl = {}; Object.keys(cfg.payload || {}).forEach(function (k) { pl[k] = cfg.payload[k]; });
      (cfg.fields || []).forEach(function (f) { if (v(f.k)) pl[f.k] = f.type === "number" ? (parseFloat(digits(v(f.k)).replace(/,/g, "")) || v(f.k)) : v(f.k); });
      var o = { kind: cfg.kind, target_type: cfg.target_type, target_id: cfg.target_id == null ? "" : String(cfg.target_id), target_name: cfg.target_name || "", name: v("name"), company: v("company"), email: v("email"), phone: v("phone"), consent_wa: waChecked(p, fm), message: msg, payload: pl, source: cfg.source };
      send(o, { box: d.querySelector(".mgq-res"), form: fm, btn: fm.querySelector("[type=submit]"), onOk: cfg.onOk }).catch(function () {});
    });
    return d;
  }

  /* the honest fallback everywhere: a Janna meeting (live video when available, else the meeting page) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-mgq-meet]"); if (!b) return;
    e.preventDefault();
    if (window.JANNA_LIVE && JANNA_LIVE.open) { try { JANNA_LIVE.open({ intent: "meeting" }); return; } catch (x) {} }
    location.href = "contact.html#meet";
  });

  window.MIGINQ = { __v: 1, T: T, esc: esc, send: send, check: check, dialog: dialog, result: result, fail: fail, setTarget: setTarget, getTarget: getTarget,
    clearTarget: function () { ss("mig-rfq-to", null); }, ctx: ctx, prefill: prefill, consentHTML: consentHTML, waChecked: waChecked, user: user,
    planOK: planOK, lockHTML: lockHTML, scopeLockHTML: scopeLockHTML, inScope: inScope, marketOf: marketOf, level: lv, digits: digits, EMRE: EMRE };
})();
