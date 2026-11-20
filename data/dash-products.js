/* «منتجاتي» — the member's own products in the marketplace (ACC-CONTRACT §1.7), and the account status line refinement.
   Plugs into the customer dashboard (dashboard.html, dash.part.html) through window.MIGDASH (integration patch P-D1: addTab / extend /
   status). Real API only (Bearer session of data/mig-api.js):
     GET /api/me/account → {status, plan, plan_name, plan_expires, requested_plan, open_invoice:{no, total_minor, currency, pay_url}|null,
                            caps, limits:{products, images_per_product, used_products}, linked:{factory_ref, name}|null, legacy_session}
     GET /api/me/products → {items:[{id, state, fields, live, reject_reason, submitted_at, images:[{id, url, w, h}]}], limit, used, can_add, need}
     POST /api/me/products {fields, images, submit} · PATCH /api/me/products/:id · POST /api/me/products/:id/submit · DELETE /api/me/products/:id
     POST /api/me/media?purpose=product (raw JPEG/PNG/WebP, ≤ 3 MB) → {media:{id, url, width, height, bytes}}
   A product shows in the market only after the platform team approves it; an approved product keeps its published version while a new
   edit waits for review. Nothing is shown as saved without the server's answer; an unreachable API says so. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window;
  /* ---------- shared self-service helper (dash-company.js reuses it) ---------- */
  if (!W.MIGSELF) W.MIGSELF = (function () {
    var EN = function () { return W.MIGLANG === "en"; }, T = function (a, e) { return EN() ? e : a; };
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"'`]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]; }); }
    function off() { return W.MIGAPI && MIGAPI.ui ? MIGAPI.ui.offline() : T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فمحصلش أي حاجة. جرّب تاني بعد شوية.", "We couldn't reach the platform's server right now, so nothing happened. Please try again shortly."); }
    /* like MIGAPI.request, but the whole error body is kept (errors[], limit, used, need) and raw image bodies can be sent */
    function call(path, o) {
      o = o || {};
      return new Promise(function (res, rej) {
        if (!W.fetch) { rej({ code: "offline", error: off() }); return; }
        var base = String((W.MIGAPI && MIGAPI.base) || W.MIG_API_BASE || "/api").replace(/\/+$/, ""), tk = W.MIGAPI && MIGAPI.token ? MIGAPI.token() : "", h = { Accept: "application/json" }, done = false;
        if (tk) h.Authorization = "Bearer " + tk;
        var body = o.raw !== undefined ? o.raw : o.body !== undefined ? JSON.stringify(o.body) : undefined;
        if (o.raw !== undefined) h["Content-Type"] = o.type || "application/octet-stream"; else if (o.body !== undefined) h["Content-Type"] = "application/json";
        var tm = setTimeout(function () { if (!done) { done = true; rej({ code: "offline", error: off() }); } }, o.timeout || 20000);
        fetch(base + path, { method: o.method || "GET", headers: h, body: body, credentials: "same-origin" }).then(function (r) {
          var ct = (r.headers.get("content-type") || "").toLowerCase();
          if (ct.indexOf("json") < 0) { if (r.status === 204 && r.ok) return { st: 204, ok: true, j: {} }; throw { code: "offline", error: off(), status: r.status }; }
          return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw { code: "offline", error: off(), status: r.status }; });
        }).then(function (x) {
          if (done) return; done = true; clearTimeout(tm);
          if (x.ok) { res(x.j); return; }
          if (x.st === 401 && tk && W.MIGAPI && MIGAPI.me) MIGAPI.me(true).catch(function () {}); /* the normal path drops a dead session */
          var e = {}; for (var k in x.j) if (Object.prototype.hasOwnProperty.call(x.j, k)) e[k] = x.j[k];
          e.code = x.j.code || "http_" + x.st; e.error = x.j.error || "HTTP " + x.st; e.status = x.st; rej(e);
        }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline", error: off() }); });
      });
    }
    var MSG = {
      plan: ["الخدمة دي مش متاحة لباقتك الحالية.", "This is not available on your current plan."],
      link_required: ["اربط حسابك بملف شركتك الأول من «ملف الشركة».", "Link your account to your company profile first, under “Company profile”."],
      limit: ["وصلت لحد المنتجات في باقتك.", "You reached the product limit of your plan."],
      open_request: ["عندك طلب تعديل لسه بيتراجع — استنى الرد عليه أو اسحبه الأول.", "You already have a change request under review — wait for the answer or withdraw it first."],
      open_invoice: ["عندك فاتورة مفتوحة بالفعل — ادفعها الأول.", "You already have an open invoice — please pay it first."],
      invalid_contact: ["بيانات التواصل الشخصية مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة. شيل أرقام التليفون والواتساب والإيميلات من النص.", "Personal contact details are never published — buyers reach you through the platform. Remove phone, WhatsApp and e-mail details from the text."],
      unsupported_type: ["نوع الصورة مش مدعوم — ارفع JPG أو PNG أو WebP.", "This image type is not supported — upload a JPG, PNG or WebP."],
      too_large: ["الصورة أكبر من المسموح (3 ميجا).", "The image is larger than allowed (3 MB)."],
      invalid_image: ["الصورة دي مش سليمة أو أصغر من المسموح (300×300 بكسل على الأقل).", "This image is damaged or too small (at least 300×300 pixels)."],
      media_off: ["رفع الصور مش متاح دلوقتي على المنصة — تقدر تحفظ من غير صور وتضيفها بعدين.", "Image upload is not available on the platform right now — you can save without images and add them later."],
      store_off: ["الخدمة دي لسه بتتجهّز على السيرفر — جرّب تاني بعد شوية.", "This service is still being set up on the server — please try again shortly."],
      not_found: ["العنصر ده مش موجود (يمكن اتحذف).", "This item no longer exists (it may have been deleted)."],
      state: ["حالته اتغيرت — حدّث الصفحة وجرّب تاني.", "Its state changed — reload the page and try again."],
      required: ["فيه بيانات مطلوبة ناقصة.", "Some required details are missing."],
      invalid: ["راجع البيانات المكتوبة.", "Please check the details entered."]
    };
    function errText(e) {
      var c = e && String(e.code || ""), m = MSG[c];
      if (c === "limit" && e && e.limit != null) return T("وصلت لحد المنتجات في باقتك (" + e.limit + " منتج).", "You reached your plan's product limit (" + e.limit + " products).");
      if (m) return T(m[0], m[1]);
      if (/^invalid_/.test(c) && e.error) return T(MSG.invalid[0], MSG.invalid[1]);
      return W.MIGAPI && MIGAPI.ui ? MIGAPI.ui.errText(e) : (e && e.error) || T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    }
    /* phone / WhatsApp / e-mail in public text (same rule as functions/_lib/seo-privacy.js, without look-behind) */
    var SEP = "[\\s\\-./()\\u00a0\\u200e\\u200f]*";
    var RX = [new RegExp("(^|[^\\d+])((\\+|00)" + SEP + "20" + SEP + "|0)" + SEP + "1[0125](" + SEP + "\\d){8}(?!\\d)"),
      new RegExp("(^|[^\\d+])((\\+|00)" + SEP + "20" + SEP + "\\(?0?|\\(?0)(2\\)?(" + SEP + "\\d){8}|3\\)?(" + SEP + "\\d){7}|(4[0-8]|5[05-7]|6[2-9]|8[2468]|9[2-7])\\)?(" + SEP + "\\d){7})(?!\\d)"),
      new RegExp("(الخط الساخن|خط ساخن|رقم الهاتف|رقم التليفون|تليفاكس|تليفون|تلفون|هاتف|فاكس|موبايل|محمول|جوال|واتساب|واتس اب|واتس|اتصل|اتصال|hot\\s?line|telephone|tel|phone|mobile|cell|fax|whats\\s?app|call)\\s*[:：\\-–]?\\s*((\\+|00)?\\d(" + SEP + "\\d){4,})", "i"),
      /(wa\.me\/\+?\d{6,}|whatsapp\.com\/send\/?\?phone=\+?\d{6,}|\b(tel|sms|callto):\+?[\d\s\-.()]{5,})/i,
      /[a-z0-9._%+\-]+\s*(@|＠|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*[a-z0-9\-]+(\s*(\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\})\s*[a-z0-9\-]+)+/i];
    function hasContact(s) { s = String(s || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }); for (var i = 0; i < RX.length; i++) if (RX[i].test(s)) return true; return false; }
    /* GET /api/me/account, once per session (both tabs and the status line use it) */
    var ACC = null, ACCP = null;
    function account(force) {
      if (!W.MIGAPI || !MIGAPI.token || !MIGAPI.token()) return Promise.reject({ code: "unauthorized" });
      if (ACC && !force) return Promise.resolve(ACC);
      if (ACCP && !force) return ACCP;
      ACCP = call("/me/account").then(function (j) { ACC = j; ACCP = null; return j; }, function (e) { ACCP = null; throw e; });
      return ACCP;
    }
    function reset() { ACC = null; ACCP = null; }
    W.addEventListener("mig:logout", reset); W.addEventListener("mig:login", reset);
    /* an image file → its pixel size (browser decode), before it is sent */
    function dims(file) {
      return new Promise(function (res) {
        try { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); }; im.onerror = function () { res(null); URL.revokeObjectURL(u); }; im.src = u; }
        catch (e) { res(null); }
      });
    }
    var TYPES = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
    /* validate + upload one image (POST /api/me/media?purpose=…) */
    function upload(file, purpose, minSide) {
      if (!file) return Promise.reject({ code: "required" });
      if (!TYPES[file.type]) return Promise.reject({ code: "unsupported_type" });
      if (file.size > 3 * 1048576) return Promise.reject({ code: "too_large" });
      return dims(file).then(function (d) {
        if (!d) throw { code: "invalid_image" };
        if (d.w < (minSide || 64) || d.h < (minSide || 64)) throw { code: "invalid_image", why: "small" };
        return call("/me/media?purpose=" + encodeURIComponent(purpose || "product"), { method: "POST", raw: file, type: file.type, timeout: 60000 });
      }).then(function (j) { if (!j || !j.media || !j.media.id) throw { code: "bad_response", error: T("السيرفر ماأكدش رفع الصورة.", "The server did not confirm the upload.") }; return j.media; });
    }
    /* same-site link check for server-provided URLs (pay links, image previews) */
    function safeUrl(u, img) {
      u = String(u || "");
      if (W.MIGOVL && MIGOVL.okUrl && MIGOVL.okUrl(u)) return u;
      if (/^\/(media\/u\/|api\/me\/media\/|pay\/|pay\.html)[^\s"'<>`\\]*$/.test(u)) return u;
      if (!img && /^pay(\.html|\/)#inv=[A-Za-z0-9_\-]{16,128}(&r=1)?$/.test(u)) return u;
      if (/^https:\/\/(www\.)?madeinegyptgate\.com\/[^\s"'<>`\\]*$/i.test(u)) return u;
      return "";
    }
    return { T: T, EN: EN, esc: esc, call: call, errText: errText, hasContact: hasContact, account: account, resetAccount: reset, upload: upload, safeUrl: safeUrl };
  })();

  var M = W.MIGDASH, X = W.MIGSELF, T = X.T, esc = X.esc;
  if (!M || !M.addTab) return;   /* the dashboard without integration patch P-D1: nothing to plug into */

  /* ---------- account status line (MIGDASH.status): suspended / pending with an invoice; never a second line ---------- */
  var ACC = null;
  function planName(k) { return W.MIGPLAN && MIGPLAN.name && k ? MIGPLAN.name(k) : k || ""; }
  M.status(function (st) {
    var a = ACC; if (!a || !a.status) return st;
    if (a.status === "suspended") return { k: "exp", t: "⏸ " + T("الحساب موقوف مؤقتاً — كلّمنا", "Account temporarily suspended — contact us"), href: "contact.html", ht: T("تواصل معنا ←", "Contact us →") };
    if (a.status === "pending" && a.open_invoice) {
      var u = X.safeUrl(a.open_invoice.pay_url), rp = a.requested_plan ? planName(a.requested_plan) : "";
      return { k: "wait", t: "⏳ " + T("بانتظار إتمام الاشتراك", "Awaiting subscription completion") + (rp ? " · " + rp : ""), href: u, ht: u ? T("ادفع الفاتورة ←", "Pay the invoice →") : "" };
    }
    return st;
  });
  function loadAccount() {
    X.account().then(function (j) { var was = JSON.stringify(ACC && [ACC.status, ACC.open_invoice && ACC.open_invoice.no]); ACC = j; if (was !== JSON.stringify([j.status, j.open_invoice && j.open_invoice.no])) M.render(); }, function () { /* deploy 1's line stays */ });
  }
  W.addEventListener("mig:me", function () { if (!ACC) loadAccount(); });
  W.addEventListener("mig:logout", function () { ACC = null; PS.list = null; });
  W.addEventListener("mig:login", function () { ACC = null; PS.list = null; });
  if (W.MIGAPI && MIGAPI.token && MIGAPI.token()) loadAccount();

  /* ---------- «منتجاتي» ---------- */
  var CATS = [["food", "الصناعات الغذائية", "Food industries"], ["build", "مواد البناء", "Building materials"], ["plastic", "البلاستيك والتغليف", "Plastics & packaging"], ["elec", "الكهرباء والتكييف", "Electrical & HVAC"],
    ["glass", "الزجاج", "Glass"], ["metal", "الحديد والمعادن", "Iron & metals"], ["petro", "البتروكيماويات والأسمدة", "Petrochemicals & fertilizers"], ["med", "الطبي والأدوية", "Medical & pharmaceuticals"],
    ["furn", "الأثاث", "Furniture"], ["other", "منتجات صناعية متنوعة", "Other industrial products"]];
  function cats() {
    var en = {}; CATS.forEach(function (c) { en[c[0]] = c[2]; });
    var L = W.MIGOVL && MIGOVL.cats ? MIGOVL.cats(CATS.map(function (c) { return [c[0], c[1], ""]; })) : CATS;
    return L.map(function (c) { return [c[0], c[1], en[c[0]] || (W.MIGTR ? MIGTR(c[1]) : c[1])]; });
  }
  function catName(k) { var c = cats().filter(function (x) { return x[0] === k; })[0]; return c ? T(c[1], c[2]) : k || "—"; }
  var ST = { draft: ["مسودة", "Draft", "#5B6B7A", "#EEF2F5"], pending: ["بانتظار المراجعة", "Under review", "#7A5A00", "#FFF4D6"], approved: ["منشور", "Published", "#0B6B35", "#E3F7EA"],
    rejected: ["مرفوض", "Rejected", "#B42318", "#FDECEC"], hidden: ["مخفي", "Hidden", "#5B6B7A", "#EEF2F5"], deleted: ["محذوف", "Deleted", "#5B6B7A", "#EEF2F5"] };
  function chip(s) { var x = ST[s] || [s, s, "#5B6B7A", "#EEF2F5"]; return '<span class="mp-st" style="color:' + x[2] + ";background:" + x[3] + '">' + esc(T(x[0], x[1])) + "</span>"; }
  var PS = { list: null, form: null, busy: false, msg: "" };
  function lvNeed() {   /* the lowest plan level whose matrix allows products (default: basic) */
    var P = W.MIGPLAN, lv = 2; if (!P || !P.PL) return lv;
    ["profile", "basic", "premium", "partner", "strategic"].some(function (k) { var o = P.PL[k]; if (o && o.products !== 0) { lv = o.lv; return true; } return false; });
    return lv;
  }
  function planLimit() { var P = W.MIGPLAN, me = M.me(), k = me && W.MIGAPI ? MIGAPI.planOf(me) : "visitor"; return P && P.PL[k] ? P.PL[k].products : 0; }
  function loadList(force) {
    if (PS.list && !PS.list.err && !force) return Promise.resolve(PS.list);
    return X.call("/me/products").then(function (j) { PS.list = j || { items: [] }; return PS.list; }, function (e) { PS.list = { err: e }; return PS.list; });
  }
  function lim(j) { var l = j && j.limit != null ? +j.limit : planLimit(); return l === Infinity || l < 0 ? -1 : l; }
  function counter(j) { var l = lim(j), u = j && j.used != null ? +j.used : (j && j.items ? j.items.filter(function (x) { return x.state !== "deleted" && x.state !== "rejected"; }).length : 0); return '<span class="mp-cnt num">' + u + " " + T("من", "of") + " " + (l < 0 ? T("بلا حد", "unlimited") : l) + "</span>"; }
  function head(p, extra) { return '<div class="ph" data-mp-root="1"><div><span class="chip chip-gold">' + T("مصنعي", "My factory") + "</span><h1>" + T("منتجاتي", "My products") + "</h1>" + (p ? "<p>" + p + "</p>" : "") + "</div>" + (extra || "") + "</div>"; }
  var CSS = ".mp-list{display:flex;flex-direction:column;gap:10px}.mp-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:var(--surface)}"
    + ".mp-im{width:64px;height:64px;border-radius:10px;background:var(--sunken) center/cover no-repeat;display:grid;place-items:center;font-size:1.4rem;overflow:hidden}.mp-im img{width:100%;height:100%;object-fit:cover}"
    + ".mp-row b{display:block;overflow-wrap:anywhere}.mp-row small{color:var(--muted);font-size:.78rem;display:block}.mp-st{display:inline-block;border-radius:99px;padding:1px 10px;font-size:.76rem;font-weight:800;margin-inline-end:6px}"
    + ".mp-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.mp-cnt{display:inline-block;background:var(--green-soft);color:var(--green);border-radius:99px;padding:3px 12px;font-weight:800;font-size:.85rem}"
    + ".mp-why{background:#FDECEC;color:#B42318;border-radius:10px;padding:6px 10px;font-size:.82rem;margin-top:6px}.mp-imgs{display:flex;gap:8px;flex-wrap:wrap}.mp-imgs figure{margin:0;position:relative;width:88px;height:88px;border-radius:10px;overflow:hidden;border:1px solid var(--line)}"
    + ".mp-imgs img{width:100%;height:100%;object-fit:cover}.mp-imgs button{position:absolute;top:4px;inset-inline-end:4px;border:0;border-radius:99px;background:rgba(0,0,0,.6);color:#fff;width:24px;height:24px;cursor:pointer}"
    + ".mp-f .er:empty{display:none}.mp-f .fe{color:#B42318;font-size:.78rem;font-weight:700}.mp-f [aria-invalid=true]{border-color:#B42318}"
    + "@media (max-width:560px){.mp-row{grid-template-columns:52px minmax(0,1fr)}.mp-im{width:52px;height:52px}.mp-acts{grid-column:1/-1;justify-content:flex-start}}";
  function css() { if (document.getElementById("mp-css")) return; var s = document.createElement("style"); s.id = "mp-css"; s.textContent = CSS; document.head.appendChild(s); }
  function img1(x) { var im = (x.images || [])[0], u = im && X.safeUrl(im.url, true); return u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : "📦"; }
  function row(x) {
    var f = x.fields || {}, lv = x.live || null, pend = x.state === "pending" && lv;
    return '<div class="mp-row" data-mp-id="' + esc(x.id) + '"><span class="mp-im">' + img1(x) + '</span><div style="min-width:0"><b dir="auto">' + esc(f.name || (lv && lv.name) || "—") + "</b><small>"
      + chip(x.state) + esc(catName(f.category)) + (f.price ? " · " + esc(f.price) : "") + "</small>"
      + (pend ? '<small>' + T("النسخة المنشورة بتفضل ظاهرة في السوق لحد ما التعديل يتوافق عليه.", "The published version stays in the market until the change is approved.") + "</small>" : "")
      + (x.state === "rejected" && x.reject_reason ? '<div class="mp-why">' + T("سبب الرفض: ", "Reason: ") + esc(x.reject_reason) + "</div>" : "") + "</div>"
      + '<div class="mp-acts"><button class="btn btn-sm btn-line" type="button" data-mp-edit="' + esc(x.id) + '">✏️ ' + T("تعديل", "Edit") + "</button>"
      + (x.state === "draft" || x.state === "rejected" ? '<button class="btn btn-sm btn-green" type="button" data-mp-submit="' + esc(x.id) + '">📤 ' + T("إرسال للمراجعة", "Send for review") + "</button>" : "")
      + '<button class="btn btn-sm btn-line" type="button" data-mp-del="' + esc(x.id) + '" style="color:#B42318">🗑 ' + T("حذف", "Delete") + "</button></div></div>";
  }
  function field(name, label, inner, hint, full) { return '<label class="f' + (full ? " full" : "") + '" data-mp-f="' + name + '">' + label + inner + (hint ? "<small>" + hint + "</small>" : "") + '<span class="fe" role="alert"></span></label>'; }
  function form(j) {
    var x = PS.form || {}, f = x.fields || {}, max = j && j.images_per_product != null ? +j.images_per_product : (ACC && ACC.limits && ACC.limits.images_per_product != null ? +ACC.limits.images_per_product : 1);
    var imgs = x.images || [], cs = cats();
    return '<form class="dcard mp-f" id="mpF" novalidate><h2>' + (x.id ? T("تعديل المنتج", "Edit product") : T("منتج جديد", "New product")) + "</h2>"
      + '<div class="fg">'
      + field("name", T("اسم المنتج (عربي) *", "Product name (Arabic) *"), '<input name="name" maxlength="120" required dir="auto" value="' + esc(f.name || "") + '">')
      + field("name_en", T("اسم المنتج (إنجليزي)", "Product name (English)"), '<input name="name_en" maxlength="120" dir="ltr" value="' + esc(f.name_en || "") + '">')
      + field("category", T("التصنيف *", "Category *"), '<select name="category" required><option value="">' + T("اختار التصنيف", "Choose a category") + "</option>" + cs.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (f.category === c[0] ? " selected" : "") + ">" + esc(T(c[1], c[2])) + "</option>"; }).join("") + "</select>")
      + field("price", T("السعر (اختياري)", "Price (optional)"), '<input name="price" maxlength="40" dir="auto" value="' + esc(f.price || "") + '" placeholder="' + esc(T("مثلاً: 120 جنيه للكيلو — أو سيبه فاضي", "e.g. EGP 120 per kg — or leave empty")) + '">', T("لو فاضي بيظهر «السعر عند الطلب».", "Empty = “price on request”."))
      + field("description", T("الوصف (عربي)", "Description (Arabic)"), '<textarea name="description" maxlength="600" dir="auto">' + esc(f.description || "") + "</textarea>", "", true)
      + field("description_en", T("الوصف (إنجليزي)", "Description (English)"), '<textarea name="description_en" maxlength="600" dir="ltr">' + esc(f.description_en || "") + "</textarea>", "", true)
      + '<div class="f full" data-mp-f="images">' + T("صور المنتج", "Product images") + ' <small>(' + (max > 0 ? T("لحد ", "up to ") + max + T(" صورة · ", " · ") : "") + T("JPG أو PNG أو WebP لحد 3 ميجا، 300×300 بكسل على الأقل", "JPG, PNG or WebP up to 3 MB, at least 300×300 pixels") + ")</small>"
      + '<div class="mp-imgs">' + imgs.map(function (m, i) { var u = X.safeUrl(m.url, true); return "<figure>" + (u ? '<img src="' + esc(u) + '" alt="">' : "") + '<button type="button" data-mp-rmimg="' + i + '" aria-label="' + esc(T("شيل الصورة", "Remove image")) + '">✕</button></figure>'; }).join("") + "</div>"
      + (imgs.length < max ? '<input type="file" name="img" accept="image/jpeg,image/png,image/webp" style="max-width:100%">' : "") + '<span class="fe" role="alert"></span></div>'
      + "</div>"
      + '<p class="note">' + T("المنتج بيظهر في السوق بعد موافقة فريق المنصة. بيانات التواصل الشخصية (تليفون، واتساب، إيميل) مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة.", "The product shows in the market after the platform team approves it. Personal contact details (phone, WhatsApp, e-mail) are never published — buyers reach you through the platform.") + "</p>"
      + '<p class="er" role="alert"></p><div class="tools"><button class="btn btn-green" type="submit" data-mp-go="submit">📤 ' + T("إرسال للمراجعة", "Send for review") + '</button><button class="btn btn-line" type="submit" data-mp-go="draft">💾 ' + T("حفظ كمسودة", "Save as draft") + '</button><button class="btn btn-line" type="button" data-mp-cancel>' + T("رجوع", "Back") + "</button></div></form>";
  }
  function view() {
    css();
    var me = M.me() || {}, j = PS.list, P = W.MIGPLAN;
    var lockMsg = T("منتجاتك في السوق متاحة في الباقات اللي فيها منتجات", "Your products in the marketplace are available on plans that include products");
    if (M.lv() < lvNeed() && !(j && !j.err && lim(j) !== 0)) return head("") + (P ? P.lockHTML("products", lockMsg) : "");
    if (!j) return head(T("المنتج بيظهر في السوق بعد موافقة فريق المنصة.", "A product shows in the market after the platform team approves it.")) + '<div class="dcard"><p class="note">⏳ ' + T("جارٍ التحميل…", "Loading…") + "</p></div>";
    if (j.err) return head("") + '<div class="' + (j.err.code === "offline" ? "mig-off" : "erbox") + '" role="alert">' + esc(X.errText(j.err)) + '</div><div class="tools"><button class="btn btn-line" type="button" data-mp-reload>↻ ' + T("حاول تاني", "Try again") + "</button></div>";
    if (j.need === "plan" || lim(j) === 0) return head("") + (P ? P.lockHTML("products", lockMsg) : "");
    if (PS.form) return head(counter(j)) + form(j);
    var items = (j.items || []).filter(function (x) { return x.state !== "deleted"; }), can = j.can_add !== false && j.need !== "link";
    return head(T("المنتج بيظهر في السوق بعد موافقة فريق المنصة. ", "A product shows in the market after the platform team approves it. ") + counter(j),
        '<button class="btn btn-gold" type="button" data-mp-new' + (can ? "" : " disabled") + ">➕ " + T("منتج جديد", "New product") + "</button>")
      + (PS.msg ? '<div class="okbox" role="status">' + esc(PS.msg) + "</div>" : "")
      + (j.need === "link" ? '<div class="erbox" style="background:#FFF4D6;color:#7A5A00">🔗 ' + T("اربط حسابك بملف شركتك الأول من «ملف الشركة» — المنتجات بتتنشر باسم شركتك في الدليل.", "Link your account to your company profile first, under “Company profile” — products are published under your company's directory listing.") + ' <button class="btn btn-sm btn-gold" type="button" data-go="company">🏭 ' + T("ملف الشركة", "Company profile") + "</button></div>" : "")
      + (!can && j.need !== "link" ? '<p class="note">' + T("وصلت لحد المنتجات في باقتك. تقدر تحذف منتج أو ترقّي باقتك.", "You reached your plan's product limit. Delete a product or upgrade your plan.") + ' <a data-mig-buy href="register.html#plans">' + T("قارن الباقات", "Compare plans") + "</a></p>" : "")
      + (items.length ? '<div class="mp-list">' + items.map(row).join("") + "</div>" : '<div class="empty"><b>' + T("لسه مفيش منتجات.", "No products yet.") + "</b><span>" + T("أضف منتجاتك علشان تظهر للمشترين في السوق بعد المراجعة.", "Add your products so buyers see them in the market after review.") + "</span></div>");
  }
  function busy(on) { PS.busy = on; [].forEach.call(document.querySelectorAll("#mpF button, #mpF input, #mpF select, #mpF textarea"), function (b) { b.disabled = !!on; }); }
  function showErr(f, e) {
    var er = f.querySelector(".er"); [].forEach.call(f.querySelectorAll(".fe"), function (s) { s.textContent = ""; }); [].forEach.call(f.querySelectorAll("[aria-invalid]"), function (s) { s.removeAttribute("aria-invalid"); });
    var any = false;
    (e && e.errors || []).forEach(function (x) { var w = f.querySelector('[data-mp-f="' + String(x.field || "").replace(/[^a-z_]/g, "") + '"]'); if (w) { any = true; w.querySelector(".fe").textContent = x.msg || X.errText({ code: x.code || "invalid" }); var i = w.querySelector("input,select,textarea"); if (i) i.setAttribute("aria-invalid", "true"); } });
    er.className = "er erbox"; er.textContent = any ? T("راجع الحقول اللي عليها ملاحظة.", "Please check the highlighted fields.") : X.errText(e);
  }
  function collect(f) {
    var g = function (n) { return f.elements[n] ? String(f.elements[n].value || "").trim() : ""; };
    return { name: g("name"), name_en: g("name_en"), category: g("category"), description: g("description"), description_en: g("description_en"), price: g("price") };
  }
  function check(o) {
    var e = [];
    if (!o.name) e.push({ field: "name", msg: T("اكتب اسم المنتج.", "Enter the product name.") });
    if (!o.category) e.push({ field: "category", msg: T("اختار التصنيف.", "Choose a category.") });
    ["name", "name_en", "description", "description_en", "price"].forEach(function (k) { if (o[k] && X.hasContact(o[k])) e.push({ field: k, msg: X.errText({ code: "invalid_contact" }) }); });
    return e;
  }
  function save(f, submit) {
    var o = collect(f), errs = check(o); if (errs.length) { showErr(f, { code: "invalid", errors: errs }); return; }
    var x = PS.form, body = { fields: o, images: (x.images || []).map(function (m) { return m.id; }), submit: !!submit };
    busy(true);
    (x.id ? X.call("/me/products/" + encodeURIComponent(x.id), { method: "PATCH", body: body }) : X.call("/me/products", { method: "POST", body: body })).then(function (j) {
      if (!j || !j.item || !j.item.id) throw { code: "bad_response", error: T("السيرفر ماأكدش الحفظ.", "The server did not confirm.") };
      PS.form = null; PS.msg = j.item.state === "pending" ? T("✓ اتبعت المنتج للمراجعة — هيظهر في السوق بعد موافقة فريق المنصة.", "✓ The product was sent for review — it shows in the market after the platform team approves it.") : T("✓ اتحفظ المنتج كمسودة.", "✓ The product was saved as a draft.");
      return loadList(true).then(function () { busy(false); M.render(); });
    }).catch(function (e) { busy(false); showErr(f, e); });
  }
  function done(panel) {
    if (!panel) return;
    if (!PS.list) { loadList().then(function () { if (document.querySelector("[data-mp-root]")) M.render(); }); }
    var b = function (sel, fn) { [].forEach.call(panel.querySelectorAll(sel), function (el) { el.addEventListener("click", function (ev) { fn(el, ev); }); }); };
    b("[data-mp-reload]", function () { PS.list = null; M.render(); });
    b("[data-mp-new]", function () { PS.form = { fields: {}, images: [] }; PS.msg = ""; M.render(); });
    b("[data-mp-cancel]", function () { PS.form = null; M.render(); });
    b("[data-mp-edit]", function (el) {
      var id = el.getAttribute("data-mp-edit"), x = ((PS.list && PS.list.items) || []).filter(function (i) { return i.id === id; })[0]; if (!x) return;
      PS.form = { id: x.id, fields: JSON.parse(JSON.stringify(x.fields || {})), images: (x.images || []).slice() }; PS.msg = ""; M.render();
    });
    b("[data-mp-submit]", function (el) {
      el.disabled = true;
      X.call("/me/products/" + encodeURIComponent(el.getAttribute("data-mp-submit")) + "/submit", { method: "POST", body: {} }).then(function (j) {
        if (!j || !j.item) throw { code: "bad_response", error: T("السيرفر ماأكدش.", "The server did not confirm.") };
        PS.msg = T("✓ اتبعت المنتج للمراجعة.", "✓ The product was sent for review."); return loadList(true).then(function () { M.render(); });
      }).catch(function (e) { el.disabled = false; M.ui.toast(X.errText(e)); });
    });
    b("[data-mp-del]", function (el) {
      if (!W.confirm(T("تحذف المنتج ده؟ لو كان منشور هيختفي من السوق.", "Delete this product? If it is published it disappears from the market."))) return;
      el.disabled = true;
      X.call("/me/products/" + encodeURIComponent(el.getAttribute("data-mp-del")), { method: "DELETE" }).then(function (j) {
        if (!j || j.ok !== true) throw { code: "bad_response", error: T("السيرفر ماأكدش الحذف.", "The server did not confirm.") };
        PS.msg = T("✓ اتحذف المنتج.", "✓ The product was deleted."); return loadList(true).then(function () { M.render(); });
      }).catch(function (e) { el.disabled = false; M.ui.toast(X.errText(e)); });
    });
    var f = panel.querySelector("#mpF"); if (!f) return;
    var go = "submit";
    [].forEach.call(f.querySelectorAll("[data-mp-go]"), function (bt) { bt.addEventListener("click", function () { go = bt.getAttribute("data-mp-go"); }); });
    f.addEventListener("submit", function (ev) { ev.preventDefault(); if (!PS.busy) save(f, go === "submit"); });
    /* keep typed values across re-renders (image upload re-renders the form) */
    f.addEventListener("input", function () { PS.form.fields = collect(f); });
    f.addEventListener("change", function () { PS.form.fields = collect(f); });
    b("[data-mp-rmimg]", function (el) { PS.form.fields = collect(f); PS.form.images.splice(+el.getAttribute("data-mp-rmimg"), 1); M.render(); });
    var fi = f.querySelector('input[type="file"]');
    if (fi) fi.addEventListener("change", function () {
      var file = fi.files && fi.files[0], w = f.querySelector('[data-mp-f="images"] .fe'); if (!file) return;
      PS.form.fields = collect(f); w.textContent = "⏳ " + T("جارٍ رفع الصورة…", "Uploading the image…"); busy(true);
      X.upload(file, "product", 300).then(function (m) { busy(false); PS.form.images.push({ id: m.id, url: m.url, w: m.width, h: m.height }); M.render(); },
        function (e) { busy(false); w.textContent = X.errText(e); fi.value = ""; });
    });
  }
  M.addTab({ key: "products", icon: "📦", ar: "منتجاتي", en: "My products", after: "incoming", level: lvNeed(), view: view, done: done, legacy: ["products"] });
})();
