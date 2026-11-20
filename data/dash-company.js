/* «ملف الشركة» — the member's own listing in the company directory, and «باقتي» → «فواتيري» (ACC-CONTRACT §1.7).
   Needs data/dash-products.js right before it (window.MIGSELF: API calls, messages, upload) and the dashboard's MIGDASH (patch P-D1).
     GET /api/me/company → {linked, listing:{…public fields}|null, requests:[{id, kind, state, fields, reject_reason, created_at}],
                            allowed:[field names by plan], legacy_hint:{company, activity, web}|null}
     POST /api/me/company {kind: edit|claim|create, factory_ref?, fields} → 201 {request} · 409 open_request · 403 plan · 422
     DELETE /api/me/company/requests/:id → {ok}        POST /api/me/media?purpose=logo → {media}
     GET /api/me/invoices → {items:[{no, status, plan, plan_name, total_minor, currency, issued_at, paid_at, pay_url}]}
     POST /api/me/invoices {plan, gcc?} → 201 {invoice:{no, total_minor, pay_url}, gcc_next?} · 409 open_invoice · 422 gcc_required · 429
       (gcc = the GCC states of a pick plan — Premium = Egypt + 3 — sent on an upgrade into it; they wait for that invoice: user.gcc.next)
   Not linked: the directory is searched in the browser (data/oldfac.js + data/facx.js, loaded on demand) → «ده ملف شركتي» (claim) or
   «شركتي مش موجودة — أضفها» (create). Linked: the public listing + an edit form → a change request (one open request at a time).
   Every request is reviewed by the platform team; personal phones / e-mails are refused in every field. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window, M = W.MIGDASH, X = W.MIGSELF;
  if (!M || !M.addTab || !X) return;
  var T = X.T, esc = X.esc;
  var CS = { d: null, q: null, mode: "", form: null, busy: false, msg: "", dir: 0 };
  /* the plan a lock box sent the member here for: dashboard.html#tab=plan&plan=<k> (read at load: the dashboard rewrites its hash when it
     renders) or the click data/plan.js remembered (sessionStorage «mig-want-plan», also for a lock box on this page); the newest wins */
  var PLK = /^(profile|basic|premium|partner|strategic)$/, WANT = (function () { var m = /[#&]plan=([a-z]+)(?:&|$)/.exec(location.hash || ""); return m && PLK.test(m[1]) ? m[1] : ""; })();
  function wanted() {
    var m = /[#&]plan=([a-z]+)(?:&|$)/.exec(location.hash || ""); if (m && PLK.test(m[1])) WANT = m[1];
    try { var w = sessionStorage.getItem("mig-want-plan"); if (w) { sessionStorage.removeItem("mig-want-plan"); if (PLK.test(w)) WANT = w; } } catch (e) {}
    return WANT;
  }
  var KIND = { edit: ["طلب تعديل", "Change request"], claim: ["طلب ربط بالملف", "Claim request"], create: ["طلب إضافة شركة", "New listing request"] };
  var STATE = { pending: ["بانتظار المراجعة", "Under review", "#7A5A00", "#FFF4D6"], approved: ["اتوافق عليه", "Approved", "#0B6B35", "#E3F7EA"], rejected: ["مرفوض", "Rejected", "#B42318", "#FDECEC"], withdrawn: ["مسحوب", "Withdrawn", "#5B6B7A", "#EEF2F5"] };
  function chip(s) { var x = STATE[s] || [s, s, "#5B6B7A", "#EEF2F5"]; return '<span class="mp-st" style="color:' + x[2] + ";background:" + x[3] + '">' + esc(T(x[0], x[1])) + "</span>"; }
  function date(s) { return s && W.MIGAPI && MIGAPI.ui ? MIGAPI.ui.date(s) : String(s || "").slice(0, 10); }
  function head(p, extra) { return '<div class="ph" data-mc-root="1"><div><span class="chip chip-gold">' + T("مصنعي", "My factory") + "</span><h1>" + T("ملف الشركة", "Company profile") + "</h1>" + (p ? "<p>" + p + "</p>" : "") + "</div>" + (extra || "") + "</div>"; }
  var NOCONTACT = function () { return T("بيانات التواصل الشخصية مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة.", "Personal contact details are never published — buyers reach you through the platform."); };
  var CSS = ".mc-res{display:flex;flex-direction:column;gap:8px}.mc-hit{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface)}.mc-hit>div{flex:1;min-width:0}"
    + ".mc-hit b{display:block;overflow-wrap:anywhere}.mc-hit small{color:var(--muted);font-size:.78rem}.mc-l{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:.9rem}.mc-l dt{color:var(--muted)}.mc-l dd{margin:0;font-weight:700;overflow-wrap:anywhere}"
    + ".mc-logo{width:72px;height:72px;border-radius:12px;border:1px solid var(--line);object-fit:contain;background:#fff}.mc-req{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px 12px}"
    + ".mc-req .mp-why{flex-basis:100%}.mc-inv{width:100%;border-collapse:collapse;font-size:.86rem}.mc-inv th,.mc-inv td{border-bottom:1px solid var(--line);padding:8px 6px;text-align:start;vertical-align:middle}.mc-inv th{color:var(--muted);font-weight:700;font-size:.78rem}"
    + ".mc-tw{overflow-x:auto}@media (max-width:560px){.mc-hit{flex-wrap:wrap}.mc-l{grid-template-columns:1fr}"
    /* phones: every invoice is a small card (label · value), the «ادفع الآن» button full width */
    + ".mc-inv thead{display:none}.mc-inv,.mc-inv tbody,.mc-inv tr,.mc-inv td{display:block;width:100%;box-sizing:border-box}.mc-inv tr{border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin-bottom:8px}"
    + ".mc-inv td{border:0;padding:3px 0}.mc-inv td[data-l]::before{content:attr(data-l) \" · \";color:var(--muted);font-size:.76rem;font-weight:600}.mc-inv td .btn{width:100%;justify-content:center;margin-top:4px}}";
  function css() { if (document.getElementById("mc-css")) return; var s = document.createElement("style"); s.id = "mc-css"; s.textContent = CSS; document.head.appendChild(s); }
  function lvListing() { var L = W.MIGPLANS, lv = 1; if (L && L.caps) ["profile", "basic", "premium", "partner", "strategic"].some(function (k) { var c = L.caps(k); if (c && +c.listing) { lv = W.MIGPLAN.PL[k].lv; return true; } return false; }); return lv; }

  /* ---------- data ---------- */
  function loadCompany(force) {
    if (CS.d && !CS.d.err && !force) return Promise.resolve(CS.d);
    return X.call("/me/company").then(function (j) { CS.d = j || {}; return CS.d; }, function (e) { CS.d = { err: e }; return CS.d; });
  }
  function linkedOf(d) { var l = d && d.linked; if (l && typeof l === "object") return l.factory_ref ? l : null; return l ? { factory_ref: d.factory_ref || (d.listing && d.listing.factory_ref) || "", name: d.listing ? d.listing.name : "" } : null; }
  function openReq(d) { return (d && d.requests || []).filter(function (r) { return r.state === "pending"; })[0] || null; }
  /* the directory in the browser (only when the member searches): data/oldfac.js + data/facx.js — the overlay applies to them as on every page */
  function script(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.charset = "utf-8"; s.onload = res; s.onerror = function () { rej({ code: "offline" }); }; document.body.appendChild(s); }); }
  function loadDir() {
    if (CS.dir === 2) return Promise.resolve();
    var jobs = []; if (!W.MIGOLDFAC) jobs.push(script("data/oldfac.js")); if (!W.MIGFACX) jobs.push(script("data/facx.js"));
    CS.dir = 1; return Promise.all(jobs).then(function () { CS.dir = 2; }, function (e) { CS.dir = 0; throw e; });
  }
  function nn(t) { return String(t || "").replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي").replace(/[أإآ]/g, "ا").replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").replace(/^(مصنع|شركة|الشركة|مؤسسة)\s+/, "").trim().toLowerCase(); }
  function search(q) {
    var k = nn(q), out = []; if (k.length < 2) return out;
    var F = W.MIGOLDFAC || [], XL = (W.MIGFACX && MIGFACX.list) || [];
    function hit(name, ref, sec, loc) { var n = nn(name), p = n.indexOf(k); if (p < 0) return; out.push({ ref: ref, name: name, sector: sec, loc: loc, s: (n === k ? 0 : p === 0 ? 1 : 2) * 1000 + n.length }); }
    for (var i = 0; i < F.length; i++) if (F[i]) hit(F[i][0], F[i][16] ? String(F[i][16]) : String(i), F[i][1], F[i][2]);
    for (var j = 0; j < XL.length; j++) if (XL[j]) hit(XL[j][0], "x" + j, XL[j][1], XL[j][2]);
    return out.sort(function (a, b) { return a.s - b.s; }).slice(0, 12);
  }

  /* ---------- the form (public fields of a directory listing, §4.4 fac) ---------- */
  var SOCIAL = ["social_facebook", "social_linkedin", "social_instagram", "social_x", "social_youtube"];
  function allowed(d) {
    var a = d && Array.isArray(d.allowed) ? d.allowed : ["name", "sector", "location", "type", "gov", "description", "products", "website", "logo"];
    return a.filter(function (x) { return /^[a-z_]{2,32}$/.test(String(x)); });
  }
  function sectors() { return (W.MIGSECTORS || []).map(function (s) { return Array.isArray(s) ? s : [String(s), String(s)]; }); }
  function govs() { return W.MIGREG && MIGREG.list ? MIGREG.list.map(function (r) { return [r[0], r[1]]; }) : []; }
  function opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function fld(name, label, inner, hint, full) { return '<label class="f' + (full ? " full" : "") + '" data-mc-f="' + name + '">' + label + inner + (hint ? "<small>" + hint + "</small>" : "") + '<span class="fe" role="alert"></span></label>'; }
  function input(name, f) {
    var v = f[name] == null ? "" : f[name], req = CS.mode === "create" && /^(name|sector|type|gov)$/.test(name) ? " *" : "";
    if (name === "name") return fld(name, T("اسم الشركة / المصنع", "Company / factory name") + req, '<input name="name" maxlength="160" dir="auto" value="' + esc(v) + '">');
    if (name === "sector") return fld(name, T("القطاع", "Sector") + req, '<select name="sector"><option value="">' + T("اختار القطاع", "Choose a sector") + "</option>" + sectors().map(function (s) { return opt(s[0], v, T(s[0], s[1] || s[0])); }).join("") + "</select>");
    if (name === "type") return fld(name, T("النوع", "Type") + req, '<select name="type">' + opt("مصنع", v || "مصنع", T("مصنع", "Factory")) + opt("شركة ومورد", v, T("شركة ومورد", "Company & supplier")) + "</select>");
    if (name === "gov") return fld(name, T("المحافظة", "Governorate") + req, '<select name="gov"><option value="">' + T("اختار المحافظة", "Choose a governorate") + "</option>" + govs().map(function (g) { return opt(g[0], v, W.MIGLANG === "en" && W.MIGTR ? MIGTR(g[1]) : g[1]); }).join("") + "</select>");
    if (name === "location") return fld(name, T("المدينة / المنطقة", "City / area"), '<input name="location" maxlength="160" dir="auto" value="' + esc(v) + '" placeholder="' + esc(T("مثلاً: العاشر من رمضان، الشرقية", "e.g. 10th of Ramadan, Sharqia")) + '">');
    if (name === "description") return fld(name, T("نبذة عن الشركة", "About the company"), '<textarea name="description" maxlength="2000" dir="auto">' + esc(v) + "</textarea>", "", true);
    if (name === "products") return fld(name, T("المنتجات والخدمات", "Products & services"), '<textarea name="products" dir="auto" placeholder="' + esc(T("منتج في كل سطر", "One product per line")) + '">' + esc(Array.isArray(v) ? v.join("\n") : v) + "</textarea>", T("لحد 30 منتج.", "Up to 30 items."), true);
    if (name === "website") return fld(name, T("الموقع الإلكتروني", "Website"), '<input name="website" maxlength="300" dir="ltr" inputmode="url" value="' + esc(v) + '" placeholder="https://">');
    if (name === "video") return fld(name, T("فيديو تعريفي (رابط يوتيوب)", "Introduction video (YouTube link)"), '<input name="video" maxlength="300" dir="ltr" value="' + esc(v) + '" placeholder="https://www.youtube.com/watch?v=…">');
    if (SOCIAL.indexOf(name) > -1) return fld(name, { social_facebook: "Facebook", social_linkedin: "LinkedIn", social_instagram: "Instagram", social_x: "X", social_youtube: "YouTube" }[name], '<input name="' + name + '" maxlength="300" dir="ltr" value="' + esc(v) + '" placeholder="https://">');
    if (name === "logo") {
      var lg = CS.form && CS.form.logo, u = lg && X.safeUrl(lg.url, true);
      return '<div class="f" data-mc-f="logo">' + T("شعار الشركة", "Company logo") + ' <small>(' + T("JPG أو PNG أو WebP لحد 3 ميجا، 96×96 بكسل على الأقل", "JPG, PNG or WebP up to 3 MB, at least 96×96 pixels") + ")</small>"
        + (u ? '<div class="tools"><img class="mc-logo" src="' + esc(u) + '" alt=""><button class="btn btn-sm btn-line" type="button" data-mc-rmlogo>✕ ' + T("شيل الشعار", "Remove") + "</button></div>" : '<input type="file" name="logofile" accept="image/jpeg,image/png,image/webp" style="max-width:100%">') + '<span class="fe" role="alert"></span></div>';
    }
    return fld(name, esc(name), '<input name="' + esc(name) + '" maxlength="300" dir="auto" value="' + esc(v) + '">');
  }
  function formHTML(d) {
    var f = CS.form.fields, al = allowed(d);
    var title = CS.mode === "create" ? T("إضافة شركتك للدليل", "Add your company to the directory") : T("طلب تعديل بيانات الشركة", "Request a change to the listing");
    return '<form class="dcard mp-f" id="mcF" novalidate><h2>' + title + '</h2><div class="fg">' + al.map(function (n) { return input(n, f); }).join("") + "</div>"
      + '<p class="note">🔒 ' + NOCONTACT() + " " + T("كل طلب بيتراجع من فريق المنصة قبل ما يظهر على الموقع.", "Every request is reviewed by the platform team before it shows on the site.") + "</p>"
      + '<p class="er" role="alert"></p><div class="tools"><button class="btn btn-green" type="submit">📤 ' + T("ابعت الطلب للمراجعة", "Send for review") + '</button><button class="btn btn-line" type="button" data-mc-cancel>' + T("رجوع", "Back") + "</button></div></form>";
  }
  function collect(f, d) {
    var o = {};
    allowed(d).forEach(function (n) {
      if (n === "logo") { var lg = CS.form.logo; if (lg && !lg.keep && lg.id) o.logo = lg.id; else if (!lg && CS.mode === "edit" && d && d.listing && d.listing.logo) o.logo = ""; return; }
      var el = f.elements[n]; if (!el) return;
      var v = String(el.value || "").trim();
      o[n] = n === "products" ? v.split(/\s*[\n،,]\s*/).filter(function (x) { return !!x; }).slice(0, 30) : v;
    });
    return o;
  }
  function check(o) {
    var e = [];
    if (CS.mode === "create") ["name", "sector", "type", "gov"].forEach(function (k) { if (o[k] != null && !String(o[k]).trim()) e.push({ field: k, msg: T("الحقل ده مطلوب.", "This field is required.") }); });
    Object.keys(o).forEach(function (k) {
      if (k === "logo") return;
      var v = Array.isArray(o[k]) ? o[k].join(" ") : String(o[k] || "");
      if (v && X.hasContact(v)) e.push({ field: k, msg: NOCONTACT() });
      if (v && (k === "website" || k === "video" || SOCIAL.indexOf(k) > -1) && !/^https:\/\/[^\s"'<>`]+\.[^\s"'<>`]+$/i.test(v)) e.push({ field: k, msg: T("اكتب رابط كامل يبدأ بـ https://", "Enter a full link starting with https://") });
      if (k === "products" && o[k].some(function (p) { return p.length > 80; })) e.push({ field: k, msg: T("كل منتج لحد 80 حرف.", "Each item up to 80 characters.") });
    });
    return e;
  }
  function showErr(f, e) {
    var er = f.querySelector(".er"), any = false;
    [].forEach.call(f.querySelectorAll(".fe"), function (s) { s.textContent = ""; }); [].forEach.call(f.querySelectorAll("[aria-invalid]"), function (s) { s.removeAttribute("aria-invalid"); });
    (e && e.errors || []).forEach(function (x) { var w = f.querySelector('[data-mc-f="' + String(x.field || "").replace(/[^a-z_]/g, "") + '"]'); if (w) { any = true; w.querySelector(".fe").textContent = x.msg || X.errText({ code: x.code || "invalid" }); var i = w.querySelector("input,select,textarea"); if (i) i.setAttribute("aria-invalid", "true"); } });
    er.className = "er erbox"; er.textContent = any ? T("راجع الحقول اللي عليها ملاحظة.", "Please check the highlighted fields.") : X.errText(e);
  }

  /* ---------- views ---------- */
  function listingHTML(l, d) {
    if (!l) return "";
    var u = l.logo && X.safeUrl(l.logo, true), g = l.gov && W.MIGREG && MIGREG.name ? MIGREG.name(l.gov) : "", al = allowed(d), row = function (k, a, e, v) { return v ? "<dt>" + T(a, e) + '</dt><dd dir="auto">' + v + "</dd>" : ""; };
    var web = l.website && X.safeUrl(l.website) ? '<a href="' + esc(l.website) + '" target="_blank" rel="noopener nofollow" dir="ltr">' + esc(String(l.website).replace(/^https:\/\//, "")) + "</a>" : "";
    return '<div class="dcard"><div class="tools" style="justify-content:space-between"><h2>' + T("ملفك المنشور في الدليل", "Your published listing") + "</h2>" + (u ? '<img class="mc-logo" src="' + esc(u) + '" alt="">' : "") + "</div>"
      + '<dl class="mc-l">' + row("name", "الاسم", "Name", esc(l.name)) + row("sector", "القطاع", "Sector", esc(l.sector)) + row("type", "النوع", "Type", esc(l.type)) + row("location", "الموقع", "Location", esc(l.location))
      + row("gov", "المحافظة", "Governorate", esc(g)) + row("products", "المنتجات", "Products", esc(Array.isArray(l.products) ? l.products.join("، ") : l.products)) + row("website", "الموقع الإلكتروني", "Website", web)
      + (al.indexOf("video") > -1 ? row("video", "الفيديو", "Video", l.video && X.safeUrl(l.video) ? '<a href="' + esc(l.video) + '" target="_blank" rel="noopener nofollow">▶ ' + T("مشاهدة", "Watch") + "</a>" : "") : "")
      + row("description", "النبذة", "About", esc(l.description)) + "</dl>"
      + (l.url && X.safeUrl(l.url) ? '<a class="btn btn-sm btn-line" href="' + esc(l.url) + '" target="_blank" rel="noopener">↗ ' + T("افتح صفحة الشركة على الموقع", "Open the company page") + "</a>" : "") + "</div>";
  }
  function reqsHTML(d) {
    var R = (d.requests || []).slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    if (!R.length) return "";
    return '<div class="dcard"><h2>' + T("طلباتك السابقة", "Your requests") + '</h2><div class="mc-res">' + R.map(function (r) {
      var k = KIND[r.kind] || [r.kind, r.kind];
      return '<div class="mc-req">' + chip(r.state) + "<b>" + esc(T(k[0], k[1])) + '</b><small class="num">' + esc(date(r.created_at)) + "</small>"
        + (r.state === "pending" ? '<button class="btn btn-sm btn-line" type="button" data-mc-withdraw="' + esc(r.id) + '" style="margin-inline-start:auto">↩ ' + T("سحب الطلب", "Withdraw") + "</button>" : "")
        + (r.state === "rejected" && r.reject_reason ? '<div class="mp-why">' + T("سبب الرفض: ", "Reason: ") + esc(r.reject_reason) + "</div>" : "") + "</div>";
    }).join("") + "</div></div>";
  }
  function view() {
    css();
    var d = CS.d, P = W.MIGPLAN;
    if (M.lv() < 1) return head("") + (P ? P.lockHTML("listing", T("ملف الشركة في الدليل متاح لكل الباقات", "A directory listing is included in every plan")) : "");
    if (!d) return head("") + '<div class="dcard"><p class="note">⏳ ' + T("جارٍ التحميل…", "Loading…") + "</p></div>";
    if (d.err) return head("") + '<div class="' + (d.err.code === "offline" ? "mig-off" : "erbox") + '" role="alert">' + esc(X.errText(d.err)) + '</div><div class="tools"><button class="btn btn-line" type="button" data-mc-reload>↻ ' + T("حاول تاني", "Try again") + "</button></div>";
    var L = linkedOf(d), open = openReq(d), msg = CS.msg ? '<div class="okbox" role="status">' + esc(CS.msg) + "</div>" : "";
    var openBox = open ? '<div class="erbox" style="background:#FFF4D6;color:#7A5A00" role="status">⏳ ' + T("عندك ", "You have a ") + esc(T((KIND[open.kind] || ["طلب", "request"])[0], (KIND[open.kind] || ["طلب", "request"])[1])) + T(" بيتراجع من فريق المنصة — هيوصلك إشعار وإيميل بالنتيجة.", " under review by the platform team — you will get a notification and an e-mail with the result.") + "</div>" : "";
    if (CS.form) return head("") + msg + formHTML(d);
    if (L) return head(T("ده ملفك في دليل المصانع. أي تعديل بيتبعت لفريق المنصة للمراجعة، وبعد الموافقة بيظهر على الموقع تلقائياً.", "This is your listing in the factory directory. Any change is sent to the platform team for review, and shows on the site automatically after approval."),
        open ? "" : '<button class="btn btn-gold" type="button" data-mc-edit>✏️ ' + T("اطلب تعديل", "Request a change") + "</button>") + msg + openBox + listingHTML(d.listing || { name: L.name }, d) + reqsHTML(d);
    /* not linked: find the listing or ask to add it */
    var hint = d.legacy_hint && d.legacy_hint.company ? d.legacy_hint.company : "", q = CS.q == null ? hint : CS.q;
    return head(T("اربط حسابك بملف شركتك في الدليل علشان تقدر تعدّل بياناته وتضيف منتجاتك. دوّر على اسم شركتك:", "Link your account to your company's directory listing to edit it and add your products. Search for your company name:")) + msg + openBox
      + '<div class="dcard"><label class="f full">' + T("اسم الشركة", "Company name") + '<input type="search" id="mcQ" dir="auto" value="' + esc(q) + '" placeholder="' + esc(T("اكتب جزء من اسم شركتك", "Type part of your company name")) + '"></label>'
      + (hint && (CS.q == null || CS.q === hint) ? '<small class="note">' + T("الاسم ده من بيانات حسابك القديم على المنصة.", "This name comes from your account on the old platform.") + "</small>" : "")
      + '<div id="mcRes" aria-live="polite"></div>'
      + '<div class="tools"><button class="btn btn-line" type="button" data-mc-create' + (open ? " disabled" : "") + ">➕ " + T("شركتي مش موجودة — أضفها", "My company is not listed — add it") + "</button></div></div>"
      + reqsHTML(d);
  }
  function resHTML() {
    var q = CS.q == null ? (CS.d && CS.d.legacy_hint && CS.d.legacy_hint.company) || "" : CS.q, open = openReq(CS.d);
    if (CS.dir === 1) return '<p class="note">⏳ ' + T("جارٍ تحميل الدليل…", "Loading the directory…") + "</p>";
    if (CS.dirErr) return '<div class="mig-off" role="status">' + esc(X.errText({ code: "offline" })) + "</div>";
    if (CS.dir !== 2 || nn(q).length < 2) return "";
    var res = search(q);
    return res.length ? '<div class="mc-res">' + res.map(function (r) {
      return '<div class="mc-hit"><div><b dir="auto">' + esc(r.name) + '</b><small dir="auto">' + esc([r.sector, r.loc].filter(Boolean).join(" · ")) + "</small></div>"
        + '<button class="btn btn-sm btn-green" type="button" data-mc-claim="' + esc(r.ref) + '"' + (open ? " disabled" : "") + ">✓ " + T("ده ملف شركتي", "This is my company") + "</button></div>";
    }).join("") + "</div>" : '<p class="note">' + T("مفيش نتايج بالاسم ده.", "No results for this name.") + "</p>";
  }
  function submit(f) {
    var d = CS.d, o = collect(f, d), L = linkedOf(d);
    if (CS.mode === "edit") { var cur = d.listing || {}; Object.keys(o).forEach(function (k) { if (k === "logo") return; var a = Array.isArray(o[k]) ? o[k].join("\n") : String(o[k]), b = Array.isArray(cur[k]) ? cur[k].join("\n") : String(cur[k] == null ? "" : cur[k]); if (a === b) delete o[k]; }); }
    var errs = check(o); if (errs.length) { showErr(f, { code: "invalid", errors: errs }); return; }
    if (!Object.keys(o).length) { var e0 = f.querySelector(".er"); e0.className = "er erbox"; e0.textContent = T("مفيش أي تغيير عن البيانات المنشورة.", "Nothing changed compared with the published listing."); return; }
    var body = { kind: CS.mode, fields: o }; if (CS.mode === "edit" && L) body.factory_ref = L.factory_ref;
    CS.busy = true; [].forEach.call(f.querySelectorAll("button"), function (b) { b.disabled = true; });
    X.call("/me/company", { method: "POST", body: body }).then(function (j) {
      if (!j || !j.request || !j.request.id) throw { code: "bad_response", error: T("السيرفر ماأكدش الإرسال.", "The server did not confirm.") };
      CS.busy = false; CS.form = null; CS.msg = T("✓ اتبعت طلبك لفريق المنصة — هيوصلك إشعار وإيميل بالنتيجة.", "✓ Your request was sent to the platform team — you will get a notification and an e-mail with the result.");
      return loadCompany(true).then(function () { M.render(); });
    }).catch(function (e) { CS.busy = false; [].forEach.call(f.querySelectorAll("button"), function (b) { b.disabled = false; }); showErr(f, e); });
  }
  function done(panel) {
    if (!panel) return;
    if (!CS.d) { loadCompany().then(function () { if (document.querySelector("[data-mc-root]")) M.render(); }); }
    var b = function (sel, fn) { [].forEach.call(panel.querySelectorAll(sel), function (el) { el.addEventListener("click", function (ev) { fn(el, ev); }); }); };
    b("[data-mc-reload]", function () { CS.d = null; M.render(); });
    b("[data-mc-cancel]", function () { CS.form = null; M.render(); });
    b("[data-mc-edit]", function () { var l = (CS.d && CS.d.listing) || {}; CS.mode = "edit"; CS.msg = ""; CS.form = { fields: JSON.parse(JSON.stringify(l)), logo: l.logo ? { id: "", url: l.logo, keep: 1 } : null }; M.render(); });
    b("[data-mc-create]", function () { var h = CS.d && CS.d.legacy_hint || {}; CS.mode = "create"; CS.msg = ""; CS.form = { fields: { name: CS.q || h.company || "", description: h.activity || "", website: /^https:\/\//.test(h.web || "") ? h.web : "", type: "مصنع" }, logo: null }; M.render(); });
    function claim(el) {
      var ref = el.getAttribute("data-mc-claim");
      if (!W.confirm(T("هنبعت لفريق المنصة إن ده ملف شركتك علشان يربطوه بحسابك بعد المراجعة. تكمّل؟", "We will tell the platform team this listing is your company, so they link it to your account after review. Continue?"))) return;
      el.disabled = true;
      X.call("/me/company", { method: "POST", body: { kind: "claim", factory_ref: ref, fields: {} } }).then(function (j) {
        if (!j || !j.request) throw { code: "bad_response", error: T("السيرفر ماأكدش الإرسال.", "The server did not confirm.") };
        CS.msg = T("✓ اتبعت طلب الربط — فريق المنصة هيراجعه ويبلغك بالنتيجة.", "✓ Your claim was sent — the platform team will review it and tell you the result."); return loadCompany(true).then(function () { M.render(); });
      }).catch(function (e) { el.disabled = false; M.ui.toast(X.errText(e)); });
    }
    b("[data-mc-withdraw]", function (el) {
      if (!W.confirm(T("تسحب الطلب ده؟", "Withdraw this request?"))) return;
      el.disabled = true;
      X.call("/me/company/requests/" + encodeURIComponent(el.getAttribute("data-mc-withdraw")), { method: "DELETE" }).then(function (j) {
        if (!j || j.ok !== true) throw { code: "bad_response", error: T("السيرفر ماأكدش.", "The server did not confirm.") };
        CS.msg = T("✓ اتسحب الطلب.", "✓ The request was withdrawn."); return loadCompany(true).then(function () { M.render(); });
      }).catch(function (e) { el.disabled = false; M.ui.toast(X.errText(e)); });
    });
    var q = panel.querySelector("#mcQ"), tm = 0;
    /* the results always go into the CURRENT box: the panel may have been re-rendered (status line, account) while the directory loaded */
    function paint() {
      var box = document.getElementById("mcRes"); if (!box) return;
      box.innerHTML = resHTML();
      [].forEach.call(box.querySelectorAll("[data-mc-claim]"), function (el) { el.addEventListener("click", function () { claim(el); }); });
    }
    function run() {
      var q0 = document.getElementById("mcQ") || q; CS.q = q0.value; CS.dirErr = false;
      if (CS.dir === 2) { paint(); return; }
      if (CS.dir === 1) return;
      loadDir().then(paint, function () { CS.dirErr = true; paint(); }); paint();
    }
    if (q) {
      q.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(run, 350); });
      if (CS.dir === 2 || CS.dir === 1) paint(); else if (q.value && !CS.dir && !CS.dirErr && nn(q.value).length >= 2) run();
    }
    var f = panel.querySelector("#mcF"); if (!f) return;
    f.addEventListener("submit", function (ev) { ev.preventDefault(); if (!CS.busy) submit(f); });
    f.addEventListener("input", function () { var o = collect(f, CS.d); for (var k in o) CS.form.fields[k] = Array.isArray(o[k]) ? o[k].join("\n") : o[k]; });
    b("[data-mc-rmlogo]", function () { var o = collect(f, CS.d); for (var k in o) CS.form.fields[k] = o[k]; CS.form.logo = null; M.render(); });
    var lf = f.querySelector('input[name="logofile"]');
    if (lf) lf.addEventListener("change", function () {
      var file = lf.files && lf.files[0], w = f.querySelector('[data-mc-f="logo"] .fe'); if (!file) return;
      var o = collect(f, CS.d); for (var k in o) CS.form.fields[k] = o[k];
      w.textContent = "⏳ " + T("جارٍ رفع الشعار…", "Uploading the logo…");
      X.upload(file, "logo", 96).then(function (m) { CS.form.logo = { id: m.id, url: m.url }; M.render(); }, function (e) { w.textContent = X.errText(e); lf.value = ""; });
    });
  }
  M.addTab({ key: "company", icon: "🏭", ar: "ملف الشركة", en: "Company profile", after: "products", level: lvListing(), view: view, done: done, legacy: ["profile_company", "seo"] });

  /* ---------- «باقتي» → «فواتيري» + renew / upgrade (MIGDASH.extend) ---------- */
  var IV = { j: null, p: null, msg: "", err: null };
  var IST = { open: ["مفتوحة", "Open", "#7A5A00", "#FFF4D6"], paid: ["مدفوعة", "Paid", "#0B6B35", "#E3F7EA"], void: ["ملغاة", "Cancelled", "#5B6B7A", "#EEF2F5"], refunded: ["مستردة", "Refunded", "#5B6B7A", "#EEF2F5"] };
  function ichip(s) { var x = IST[s] || [s, s, "#5B6B7A", "#EEF2F5"]; return '<span class="mp-st" style="color:' + x[2] + ";background:" + x[3] + '">' + esc(T(x[0], x[1])) + "</span>"; }
  function money(minor, cur) { var v = (+minor || 0) / 100, s = v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); return W.MIGLANG === "en" ? (cur || "EGP") + " " + s : s + " " + (cur && cur !== "EGP" ? cur : "جنيه"); }
  function loadInv(force) {
    if (IV.j && !force) return Promise.resolve(IV.j);
    if (IV.p && !force) return IV.p;
    IV.p = X.call("/me/invoices").then(function (j) { IV.j = j || { items: [] }; IV.p = null; IV.err = null; return IV.j; }, function (e) { IV.p = null; IV.err = e; throw e; });
    return IV.p;
  }
  /* how many GCC states the upgrade form must ask for when plan k is picked: a pick plan (Premium) bought from a plan without a pick (or
     after the plan ended); 0 for a renewal — a member who has not chosen yet renews freely and chooses in «🌍 دولك الخليجية» (review R-2 /
     B-1: one picker on the page, the Worker never needs the states for a renewal), a stored choice is kept (the platform team changes it) */
  function gNeed(me, k) {
    var P = W.MIGPLAN; if (!P || !P.gccPickOf || !W.MIGAPI) return 0;
    var n = P.gccPickOf(k), cur = MIGAPI.planOf(me); if (!n || cur === k) return 0;
    return !P.gccPickOf(cur) ? n : 0;
  }
  /* the states chosen with an unpaid invoice (user.gcc.next = {gcc, inv}): named next to that open invoice */
  function gNext(me, items) {
    var g = me && me.gcc && me.gcc.next, P = W.MIGPLAN; if (!g || !g.inv || !P || !P.gccNames) return "";
    var open = (items || []).some(function (x) { return x && x.no === g.inv && x.status === "open"; }); if (!open) return "";
    return '<p class="note" style="margin:6px 0 0">🌍 ' + T("الدول اللي اخترتها مع الفاتورة " + esc(g.inv) + ": ", "The states you chose with invoice " + esc(g.inv) + ": ") + "<b>" + esc(P.gccNames(g.gcc)) + "</b>" + T(" — بتتفعّل مع الباقة بعد الدفع.", " — they apply with the plan once it is paid.") + "</p>";
  }
  function gWords(n, en) { return W.MIGPLAN && MIGPLAN.gccCount ? MIGPLAN.gccCount(n, en) : n + (en ? " Gulf states" : " دول خليجية"); }
  function upPlans(me) {
    var P = W.MIGPLAN, L = W.MIGPLANS; if (!P || !P.PL) return [];
    var cur = me && W.MIGAPI ? MIGAPI.planOf(me) : "visitor", lv = (P.PL[cur] || { lv: 0 }).lv;
    var ks = L && L.sellable ? L.sellable() : ["profile", "basic", "premium", "partner", "strategic"];
    return ks.filter(function (k) { return P.PL[k] && P.PL[k].lv >= Math.max(lv, 1) && P.PL[k].price > 0; });
  }
  function invHTML(me) {
    var j = IV.j, it = (j && j.items) || [], pl = upPlans(me), cur = me && W.MIGAPI ? MIGAPI.planOf(me) : "visitor", wn = wanted(), sel = wn && pl.indexOf(wn) > -1 ? wn : cur;
    var rows = it.map(function (x) {
      var u = x.status === "open" ? X.safeUrl(x.pay_url) : "";
      var lb = function (a, e) { return ' data-l="' + esc(T(a, e)) + '"'; };
      return "<tr><td class=\"num\" dir=\"ltr\"" + lb("رقم الفاتورة", "Invoice no.") + ">" + esc(x.no) + "</td><td" + lb("الباقة", "Plan") + ">" + esc(x.plan_name || (W.MIGPLAN ? MIGPLAN.name(x.plan) : x.plan)) + '</td><td class="num"' + lb("الإجمالي", "Total") + ">" + esc(money(x.total_minor, x.currency)) + "</td><td" + lb("الحالة", "Status") + ">" + ichip(x.status) + '</td><td class="num"' + lb("التاريخ", "Date") + ">" + esc(date(x.paid_at || x.issued_at)) + "</td><td>" + (u ? '<a class="btn btn-sm btn-gold" data-mig-buy href="' + esc(u) + '">💳 ' + T("ادفع الآن", "Pay now") + "</a>" : "") + "</td></tr>";
    }).join("");
    return '<div class="dcard" id="mcInv"><h2>🧾 ' + T("فواتيري", "My invoices") + "</h2>"
      + (IV.msg ? '<div class="okbox" role="status">' + IV.msg + "</div>" : "")
      + (it.length ? '<div class="mc-tw"><table class="mc-inv"><thead><tr><th>' + T("رقم الفاتورة", "Invoice no.") + "</th><th>" + T("الباقة", "Plan") + "</th><th>" + T("الإجمالي", "Total") + "</th><th>" + T("الحالة", "Status") + "</th><th>" + T("التاريخ", "Date") + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
        : '<p class="note">' + T("لسه مفيش فواتير على حسابك.", "There are no invoices on your account yet.") + "</p>")
      + gNext(me, it)
      + (pl.length ? '<form class="tools" id="mcRen" data-mig-buy><label class="f" style="flex:1 1 220px">' + (W.MIGPLAN && MIGPLAN.PL[cur] && MIGPLAN.PL[cur].lv >= 1 ? T("جدّد أو رقّي باقتك", "Renew or upgrade your plan") : T("اختار باقتك", "Choose your plan")) + '<select name="plan">'
        + pl.map(function (k) { return '<option value="' + esc(k) + '"' + (k === sel ? " selected" : "") + ">" + esc(MIGPLAN.name(k)) + " — " + esc(W.MIGLANG === "en" ? "EGP " + MIGPLAN.PL[k].price.toLocaleString("en-US") : MIGPLAN.PL[k].price.toLocaleString("en-US") + " جنيه") + T(" + الضريبة", " + VAT") + "</option>"; }).join("")
        + '</select></label><div id="mcGcc" style="flex-basis:100%"></div><button class="btn btn-green" type="submit">🧾 ' + T("اعمل فاتورة", "Create the invoice") + '</button><p class="note mc-q" id="mcQ" aria-live="polite" style="flex-basis:100%;margin:0"></p><p class="er" role="alert" style="flex-basis:100%"></p></form>' : "")
      + '<p class="note" data-mig-buy>' + (W.MIGPAYREADY ? T("الدفع بيتم في صفحة بوابة الدفع الآمنة نفسها، والباقة بتتفعّل تلقائياً بعد الدفع.", "Payment happens on the secure payment gateway's own page, and the plan is activated automatically after payment.") : T("بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على الإيميل.", "The payment gateway is still being set up — once it is live, the secure payment link reaches you automatically by e-mail.")) + "</p></div>";
  }
  /* «باقتي»: what the chosen plan costs NOW and until when, before the invoice is issued (GET /api/me/invoices/quote — Terms §5: an upgrade
     pays the price difference for the days left and keeps the end date; a renewal continues from the current end) */
  function invErr(e) {
    var c = e && String(e.code || "");
    if (c === "plan_lower") return T("باقتك الحالية أعلى من اللي اخترتها", "Your current plan is higher than the one you chose") + (e.available_from ? T(" — تقدر تنزل لباقة أقل لما تخلص يوم " + date(e.available_from) + ".", " — you can move to a lower plan when it ends on " + date(e.available_from) + ".") : ".");
    if (c === "suspended") return T("حسابك موقوف دلوقتي — كلّمنا عشان نراجعه.", "Your account is suspended right now — contact us to review it.");
    if (c === "gcc_required") { var n = +e.pick || (W.MIGPLAN && MIGPLAN.gccPickOf ? MIGPLAN.gccPickOf("premium") : 3) || 3; return T("اختار " + gWords(n, false) + " بالظبط", "Choose exactly " + gWords(n, true)); }
    return X.errText(e);
  }
  function quoteText(q) {
    var tot = esc(money(q.total_minor, q.currency)), until = q.until ? esc(date(q.until)) : "", name = esc(W.MIGLANG === "en" ? q.plan_name_en || q.plan_name : q.plan_name);
    if (q.kind === "renewal") return T("تجديد " + name + ": الإجمالي " + tot + " (شامل الضريبة)" + (until ? " — الاشتراك هيمتد لحد " + until + "." : "."), "Renewal of the " + name + ": total " + tot + " (VAT included)" + (until ? " — your subscription runs until " + until + "." : "."));
    var dl = esc(String(+q.days_left || 0));
    if (q.kind === "upgrade" && q.prorated) return T("ترقية لـ " + name + ": بتدفع فرق السعر عن " + dl + " يوم فاضلين في باقتك الحالية — الإجمالي " + tot + " (شامل الضريبة)، والباقة الجديدة سارية لحد " + until + " (نفس تاريخ انتهاء باقتك).", "Upgrade to the " + name + ": you pay the price difference for the " + dl + " days left on your current plan — total " + tot + " (VAT included); the new plan runs until " + until + " (your current end date).");
    if (q.kind === "upgrade") return T("ترقية لـ " + name + ": الإجمالي " + tot + " (شامل الضريبة) — اشتراك جديد لحد " + until + " لو دفعت النهارده.", "Upgrade to the " + name + ": total " + tot + " (VAT included) — a new subscription until " + until + " if you pay today.");
    return T(name + ": الإجمالي " + tot + " (شامل الضريبة) — الاشتراك سارٍ لحد " + until + " لو دفعت النهارده.", "The " + name + ": total " + tot + " (VAT included) — your subscription runs until " + until + " if you pay today.");
  }
  function plugPlan(panel, me) {
    if (!panel) return;
    css();
    /* the old honest note («الفواتير والتجديد هيظهروا هنا …») is replaced only once the server answered */
    var notes = [].filter.call(panel.querySelectorAll("p.note"), function (p) { return /الفواتير والتجديد هيظهروا هنا|Invoices and renewals will appear here/.test(p.textContent); });
    var gate = [].filter.call(panel.querySelectorAll("p.erbox[role=status]"), function (p) { return /بوابة الدفع لسه بتتجهّز|payment gateway is still being set up/.test(p.textContent); })[0];
    if (gate && W.MIGPAYREADY) {
      gate.className = "okbox"; gate.textContent = "✓ " + T("الدفع أونلاين شغّال من صفحة الدفع الآمنة.", "Online payment is live on the secure payment page.");
      /* the static «أول ما بوابة الدفع تشتغل …» sentence under it would contradict the live state */
      [].forEach.call(panel.querySelectorAll("p.note"), function (p) { if (/أول ما بوابة الدفع تشتغل|As soon as the payment gateway is live/.test(p.textContent)) p.textContent = T("رابط الدفع الآمن بيوصلك على بريدك المسجّل مع كل فاتورة (وتلاقيه كمان في «فواتيري» تحت)، والباقة بتتفعّل تلقائي بعد الدفع، والفاتورة الإلكترونية بتوصلك على نفس البريد. الدفع بيتم في صفحة بوابة الدفع نفسها؛ المنصة مش بتطلب ولا بتحفظ بيانات أي كارت.", "The secure payment link reaches your registered e-mail with every invoice (and is under «My invoices» below), your plan is activated automatically after payment, and the e-invoice reaches the same e-mail. Payment happens on the gateway's own page; the platform never asks for or stores card details."); });
    }
    function paint() {
      if (!IV.j || !panel.isConnected) return;
      var old = panel.querySelector("#mcInv"); if (old) old.parentNode.removeChild(old);
      var host = notes[0] ? notes[0].closest(".dcard") : null, wrap = document.createElement("div");
      wrap.innerHTML = invHTML(me);
      if (notes[0]) notes[0].parentNode.removeChild(notes[0]);
      if (host && host.parentNode) host.parentNode.insertBefore(wrap.firstChild, host.nextSibling); else panel.appendChild(wrap.firstChild);
      var f = panel.querySelector("#mcRen");
      if (f) {
        var qp = f.querySelector("#mcQ"), qseq = 0;
        var showQuote = function () {
          if (!qp) return; var n = ++qseq; qp.textContent = T("بنحسب المبلغ…", "Working out the amount…");
          X.call("/me/invoices/quote?plan=" + encodeURIComponent(f.elements.plan.value)).then(function (j) {
            if (n !== qseq) return; var q = j && j.quote; if (!q) { qp.textContent = ""; return; }
            var o = j.open_invoice, txt = quoteText(q);
            if (o) txt += " " + (o.replaceable ? T("(عندك فاتورة مفتوحة رقم " + esc(o.no) + " — الفاتورة الجديدة هتحل مكانها بعد ما تأكد.)", "(You have open invoice " + esc(o.no) + " — the new invoice replaces it once you confirm.)") : T("(عندك فاتورة مفتوحة رقم " + esc(o.no) + " — ادفعها الأول أو كلّمنا.)", "(You have open invoice " + esc(o.no) + " — pay it first or contact us.)"));
            qp.innerHTML = txt;
          }, function (e) { if (n === qseq) qp.textContent = invErr(e); });
        };
        f.elements.plan.addEventListener("change", showQuote); showQuote();
        /* the GCC states of a pick plan (Premium = Egypt + 3): the picker under the select when moving into it; on a renewal the stored choice
           read-only, or — not chosen yet — a pointer to the one picker of the page («🌍 دولك الخليجية»), never a second one */
        var GB = null, drawG = function () {
          var box = f.querySelector("#mcGcc"), P = W.MIGPLAN, k = f.elements.plan.value, n = gNeed(me, k); GB = null; if (!box || !P) return;
          if (n && P.gccPicker && P.gccBind) { box.innerHTML = P.gccPicker({ id: "mcgcc", pick: n }); GB = P.gccBind(box.querySelector("fieldset"), { pick: n }); return; }
          var cur = W.MIGAPI ? MIGAPI.planOf(me) : "", g = P.gccOf ? P.gccOf(cur, me) : null;
          box.innerHTML = g && cur === k && g.chosen.length ? '<p class="note" style="margin:0">🌍 ' + T("دولك: ", "Your states: ") + esc(P.gccNames(g.chosen)) + "</p>"
            : g && cur === k && g.pending ? '<p class="note" style="margin:0">💡 ' + T("لسه مااخترتش دولك الخليجية — اختارها من «🌍 دولك الخليجية» فوق. التجديد مش محتاجها.", "You haven't chosen your Gulf states yet — choose them in «🌍 Your Gulf states» above. Renewing doesn't need them.") + "</p>" : "";
        };
        f.elements.plan.addEventListener("change", drawG); drawG();
        var send = function (replace) {
          var bt = f.querySelector('button[type="submit"]'), er = f.querySelector(".er"); er.textContent = "";
          if (GB && !GB.ok()) { er.textContent = T("اختار " + gWords(GB.pick(), false) + " بالظبط", "Choose exactly " + gWords(GB.pick(), true)); GB.bad(); return; }
          bt.disabled = true;
          var body = { plan: f.elements.plan.value }; if (replace) body.replace = true; if (GB) body.gcc = GB.get();
          X.call("/me/invoices", { method: "POST", body: body }).then(function (j) {
            var iv = j && j.invoice; if (!iv || !iv.no) throw { code: "bad_response", error: T("السيرفر ماأكدش الفاتورة.", "The server did not confirm the invoice.") };
            var u = X.safeUrl(iv.pay_url);
            IV.msg = "✓ " + esc(T("اتعملت الفاتورة رقم ", "Invoice ") + iv.no) + (j.replaced ? esc(T(" (والفاتورة " + j.replaced + " اتلغت)", " (invoice " + j.replaced + " was cancelled)")) : "") + (u ? ' — <a href="' + esc(u) + '">' + T("ادفع الآن ←", "Pay now →") + "</a>" : "");
            /* the member as the server now describes him (his Gulf states may have changed with this invoice): the dashboard keeps S.me in step
               through «mig:me» (review B-1), then the page is drawn again */
            var again = function () { return loadInv(true).then(function () { X.resetAccount(); M.render(); }); };
            return M.api && M.api.me ? M.api.me(true).then(again, again) : again();
          }).catch(function (e) {
            bt.disabled = false;
            var iv2 = e && e.invoice, u2 = iv2 && X.safeUrl(iv2.pay_url);
            /* an open invoice the member may replace (a signup / renewal / their own): confirm, then the same request with replace */
            if (e && e.code === "open_invoice" && e.replaceable && iv2 && !replace) {
              if (W.confirm(T("عندك فاتورة مفتوحة رقم " + iv2.no + " (" + (iv2.plan_name || iv2.plan) + "). نلغيها ونعمل الفاتورة الجديدة؟\nلو كنت حوّلت قيمتها بالفعل، دوس «إلغاء» وكلّمنا.", "You have open invoice " + iv2.no + " (" + (iv2.plan_name || iv2.plan) + "). Cancel it and create the new invoice?\nIf you already transferred its amount, press «Cancel» and contact us."))) { send(true); return; }
            }
            if (e && e.code === "open_invoice" && u2) { er.innerHTML = esc(X.errText(e)) + ' <a href="' + esc(u2) + '">' + T("ادفع الفاتورة المفتوحة ←", "Pay the open invoice →") + "</a>"; return; }
            er.textContent = invErr(e);
            if (e && e.code === "gcc_required" && GB) GB.bad();
          });
        };
        f.addEventListener("submit", function (ev) { ev.preventDefault(); send(false); });
      }
    }
    if (IV.j) paint(); else loadInv().then(paint, function () { /* the honest note stays */ });
  }
  M.extend("plan", plugPlan);
  W.addEventListener("mig:logout", function () { IV.j = null; CS.d = null; CS.form = null; });
  W.addEventListener("mig:login", function () { IV.j = null; CS.d = null; CS.form = null; });
})();
