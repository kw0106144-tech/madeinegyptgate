/* data/chat-media.js — 📎 photos in the chats of Janna and Bassem (owner 2026-11-20: «مفيش في شاشه الشات بتاعت جنة او باسم مكان العميل
   يحطلهم في صوره او فيديو في الشات»). Phase 1A (the live calls, data/janna-live.js) + 1A+ (the «اكتبلي» bubble, data/janna.js), behind the
   owner's switch chat_photos («🛠️ المطوّر» → «المزايا», OFF; data/flags.js). Loaded lazily by those two files (their own ?v=, or
   window.MIGVER_CM) only while the switch is on. Janna and Bassem never see the photo: the platform's Worker reads it once with AI and keeps
   nothing (worker/src/chat-media.js); the page gives the persona that TEXT with the Anam SDK's addContext() — never a URL, a byte, an id, a
   seal or a ticket.
     photoPrep(file, cb)    the photo redrawn on a canvas: a JPEG of at most 1,280 px, quality 0.85, white background — the redraw drops EXIF
                            and GPS. Files up to 20 MB; errors: none | too_big | type | decode | small (no «send the original» fallback: the
                            Worker refuses more than 2,048 px)
     mediaPost(o)           XHR POST with upload progress and a 45 s timeout (the browser sets Content-Length; the Worker requires it)
     markSafe(text)         a typed text that carries a platform note's marker anywhere («[ملاحظة من المنصة…», "[PLATFORM NOTE…") is
                            quoted, so nothing the person types can pose as the platform (data/janna-live.js sdkSay runs every typed text
                            through it; the photo's caption passes it here too)
   The call (host = data/janna-live.js cmHost()): callTap → the first-use notice once per device (localStorage "mig-cm-ok") → the picker
   (camera or gallery: the accept list is image-only, so the Android app offers both and the iPhone converts HEIC to JPEG) → the chip on
   <body> (.jnl-nzf.jnl-cmf, right above the call's controls; the noise and 🌐 chips stack above it) → ➤: addContext(the UPLOADING note) →
   POST /api/janna/media/look (the call's ticket) | /api/advisor/media/look (Bassem: the call's own sign-in) → addContext(the Worker's block)
   + sendUserMessage("📎 " + caption) only while the data channel is open; a failure → addContext(the FAILURE note) + the chip's error.
   Bassem's «🏭 ضيفها لمنتجاتي» (a full sign-in and a plan with products: the Worker's `prod`): POST /api/me/media?purpose=product (pending
   until the team approves; unsaved, deleted after 7 days) → sessionStorage "mig-prod-img" → «منتجاتي» on the shared screen.
   The bubble (data/janna.js): bubbleLook(prep, lang, cb) with a bubble ticket (POST /api/janna/media/ticket, sessionStorage "mig-cm-t"; no
   visitor id anywhere). Every visible text is Arabic first with its English twin (ui_copy of the design; the owner approves the words:
   docs/app/OWNER-APPROVAL-AR.md §8). ES5, no dependencies. window.MIGCHATMEDIA {__v: 1, …}. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIGCHATMEDIA && W.MIGCHATMEDIA.__v) return;
  var API = String(W.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var LIM = { inMax: 20 * 1048576, side: 1280, q: 0.85, min: 64, upMs: 45000, photos: 9, wide: 520 };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); W.localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function ss(k, v) { try { if (v === undefined) return W.sessionStorage.getItem(k); if (v === null) W.sessionStorage.removeItem(k); else W.sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }

  /* ---------- the texts (AR / EN; [ar, en] or {j: [ar, en], b: [ar, en]} per persona) ---------- */
  var TX = {
    att: ["ابعت صورة", "Send a photo"],
    ok: ["تمام، اختار صورة", "OK, choose a photo"], cancel: ["إلغاء", "Cancel"],
    notice: { j: ["📎 المنصة بتقرا الصورة آلياً بالذكاء الاصطناعي وبتقول لجنة وصفها — جنة نفسها مش بتشوف الصورة. الصورة نفسها مابتتحفظش، لكن وصفها المكتوب بيبقى جزء من كلام المكالمة وذاكرتها زي أي كلام. المنصة بتشيل الأرقام والإيميلات واللينكات والعناوين اللي تلاقيها، بس ماتبعتش صور فيها أشخاص أو بطاقات شخصية أو بيانات تواصل.",
      "📎 The photo is read automatically by AI so Janna knows what it shows — she does not see it herself. The photo itself is not kept, but its written description becomes part of the call and its memory, like anything said. The platform removes the numbers, e-mails, links and addresses it finds, but please don't send photos of people, ID cards or contact details."],
      b: ["📎 المنصة بتقرا الصورة آلياً بالذكاء الاصطناعي وبتقول لباسم وصفها — باسم نفسه مش بيشوف الصورة. الصورة نفسها مابتتحفظش، إلا لو اخترت تضيفها لـ«منتجاتي»، لكن وصفها المكتوب بيبقى جزء من كلام المكالمة وذاكرتها زي أي كلام. المنصة بتشيل الأرقام والإيميلات واللينكات والعناوين اللي تلاقيها، بس ماتبعتش صور فيها أشخاص أو بطاقات شخصية أو بيانات تواصل.",
      "📎 The photo is read automatically by AI so Bassem knows what it shows — he does not see it himself. The photo itself is not kept unless you choose to add it to «My products», but its written description becomes part of the call and its memory, like anything said. The platform removes the numbers, e-mails, links and addresses it finds, but please don't send photos of people, ID cards or contact details."] },
    noticeB: ["📎 المنصة بتقرا الصورة آلياً بالذكاء الاصطناعي علشان تدوّرلك عليها. الصورة ووصفها مابيتحفظوش. ماتبعتش صور فيها أشخاص أو بطاقات شخصية أو بيانات تواصل.",
      "📎 The platform reads the photo automatically with AI to search for it. The photo and its description are not kept. Please don't send photos of people, ID cards or contact details."],
    ready: ["الصورة جاهزة — اكتب سؤالك عنها لو حابب واضغط ➤", "Photo ready — add a question if you like and press ➤"],
    ph: ["سؤالك عن الصورة (اختياري)…", "Your question about the photo (optional)…"],
    rm: ["شيل الصورة", "Remove the photo"],
    up: ["⏳ بتترفع… {n}%", "⏳ Uploading… {n}%"],
    read: ["🔎 المنصة بتقرا الصورة…", "🔎 The platform is reading the photo…"],
    done: { j: ["✓ جنة عرفت وصف الصورة", "✓ Janna got the photo's description"], b: ["✓ باسم عرف وصف الصورة", "✓ Bassem got the photo's description"] },
    notread: { j: ["المنصة ماقدرتش تقرا الصورة — قول لجنة هي إيه", "The platform couldn't read the photo — tell Janna what it shows"], b: ["المنصة ماقدرتش تقرا الصورة — قول لباسم هي إيه", "The platform couldn't read the photo — tell Bassem what it shows"] },
    cap: ["📎 بعتلك صورة", "📎 I sent you a photo"],
    type: ["نوع الملف ده مش مدعوم — ابعت صورة JPG أو PNG أو WebP.", "This file type isn't supported — send a JPG, PNG or WebP photo."],
    decode: ["مش قادرين نفتح الصورة دي (ممكن تكون HEIC) — صوّرها تاني من الكاميرا أو ابعت نسخة JPG.", "We can't open this photo (it may be HEIC) — take it again with the camera or send a JPG copy."],
    small: ["الصورة صغيرة أوي — ابعت صورة أوضح.", "The photo is too small — send a clearer one."],
    too_big: ["الصورة كبيرة أوي — جرّب صورة تانية.", "The photo is too large — try another one."],
    rate_limited: ["بعت صور كتير في وقت قصير — استنى شوية وجرّب تاني.", "Too many photos in a short time — wait a little and try again."],
    feature_off: ["إرسال الصور موقوف مؤقتاً.", "Sending photos is paused for now."],
    offline: ["ماقدرناش نوصل لسيرفر المنصة — الصورة مااتبعتتش.", "We couldn't reach the platform's server — the photo was not sent."],
    prod: ["🏭 ضيفها لمنتجاتي", "🏭 Add to my products"],
    prodUp: ["⏳ بتترفع لصور منتجاتك…", "⏳ Uploading to your product photos…"],
    prodOk: ["✓ اتضافت لصورك — كمّل اسم المنتج وتصنيفه في «منتجاتي» واحفظه؛ لو ماتحفظش خلال 7 أيام الصورة بتتمسح، والمنتج بيظهر في السوق بعد موافقة الفريق.", "✓ Added to your photos — finish the product's name and category in «My products» and save it; unsaved, the photo is deleted after 7 days, and the product shows in the market after the team approves it."],
    prodLogin: ["علشان تضيف صورة لمنتجاتك ادخل بكود على الإيميل الأول.", "To add a photo to your products, sign in with an e-mail code first."],
    prodPlan: ["باقتك مافيهاش منتجات في السوق.", "Your plan has no marketplace products."],
    /* what the persona receives from the page itself (the Worker writes the reading block) */
    noteUp: { j: ["[ملاحظة من المنصة: الزائر بيبعتلك صورة دلوقتي والمنصة بتقراها. لو اتكلم عنها قبل ما توصلك قراءتها قوليله «ثواني، الصورة لسه بتوصلني» وماتخمّنيش اللي فيها.]",
      "[PLATFORM NOTE: the visitor is sending you a photo now and the platform is reading it. If they talk about it before the reading arrives, say \"One moment, the photo is still on its way\" and don't guess what it shows.]"],
      b: ["[ملاحظة من المنصة: العضو بيبعتلك صورة دلوقتي والمنصة بتقراها. لو اتكلم عنها قبل ما توصلك قراءتها قوله «ثواني، الصورة لسه بتوصلني» وماتخمّنش اللي فيها.]"] },
    noteFail: { j: ["[ملاحظة من المنصة: الصورة اللي الزائر كان بيبعتها ماوصلتش للمنصة. لو سأل عنها قوليله يجرّب يبعتها تاني أو يكتبلك اسم المنتج.]",
      "[PLATFORM NOTE: the photo the visitor was sending did not reach the platform. If they ask, tell them to try again or type the product's name.]"],
      b: ["[ملاحظة من المنصة: الصورة اللي العضو كان بيبعتها ماوصلتش للمنصة. لو سأل عنها قوله يجرّب يبعتها تاني أو يكتبلك اسم المنتج.]"] },
    noteProd: ["[ملاحظة من المنصة: العضو ضاف الصورة {ref} لصور منتجاته ومسودة منتج اتفتحت في «منتجاتي» (مستنية الاسم والتصنيف والحفظ وموافقة الفريق قبل ما تظهر). قوله كده من غير ما تقول إنها اتنشرت.]"]
  };
  /* tx(key, en, persona) — Bassem's notes to the persona are always Arabic (his persona advises in Arabic on every page) */
  function tx(k, en, p) {
    var v = TX[k]; if (!v) return "";
    if (Object.prototype.toString.call(v) !== "[object Array]") v = v[p === "bassem" || p === "b" ? "b" : "j"] || v.j;
    return (en && v[1]) || v[0];
  }
  function fill(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o && o[k] != null ? String(o[k]) : ""; }); }

  /* ---------- the photo: redrawn as a JPEG ≤ 1,280 px (EXIF / GPS dropped) ---------- */
  function photoPrep(file, cb) {
    if (!file) { cb("none"); return; }
    if (file.size > LIM.inMax) { cb("too_big"); return; }
    var t = String(file.type || "").toLowerCase();
    if (t && !/^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif)$/.test(t)) { cb("type"); return; }
    var URLo = W.URL || W.webkitURL, src = "", im = new Image(), done = false;
    var fin = function (e, r) { if (done) return; done = true; try { if (src) URLo.revokeObjectURL(src); } catch (x) {} cb(e, r); };
    try { src = URLo.createObjectURL(file); } catch (e) { fin("decode"); return; }
    im.onerror = function () { fin("decode"); };
    im.onload = function () {
      var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      if (!w || !h) { fin("decode"); return; }
      if (w < LIM.min || h < LIM.min) { fin("small"); return; }
      var k = Math.min(1, LIM.side / Math.max(w, h)), w2 = Math.max(1, Math.round(w * k)), h2 = Math.max(1, Math.round(h * k)), cv = D.createElement("canvas"), cx = null;
      cv.width = w2; cv.height = h2;
      try { cx = cv.getContext("2d"); } catch (e) { cx = null; }
      if (!cx) { fin("decode"); return; }
      try { cx.fillStyle = "#fff"; cx.fillRect(0, 0, w2, h2); cx.drawImage(im, 0, 0, w2, h2); } catch (e) { fin("decode"); return; }
      var out = function (b) {
        if (!b || !b.size) { fin("decode"); return; }
        var u = ""; try { u = URLo.createObjectURL(b); } catch (e) { u = ""; }
        fin(null, { blob: b, w: w2, h: h2, url: u, type: "image/jpeg" });
      };
      try {
        if (cv.toBlob) cv.toBlob(out, "image/jpeg", LIM.q);
        else { var d = cv.toDataURL("image/jpeg", LIM.q), bs = atob(d.split(",")[1] || ""), a = new Uint8Array(bs.length); for (var i = 0; i < bs.length; i++) a[i] = bs.charCodeAt(i); out(new Blob([a], { type: "image/jpeg" })); }
      } catch (e) { fin("decode"); }
    };
    im.src = src;
  }

  /* ---------- the upload ---------- */
  function mediaPost(o) {
    var x = null, fin = false, done = function (st, j) { if (fin) return; fin = true; if (o.cb) o.cb(st, j); };
    try { x = new XMLHttpRequest(); x.open("POST", o.url, true); } catch (e) { done(0, { code: "offline" }); return null; }
    x.timeout = o.timeout || LIM.upMs;
    var h = o.headers || {};
    for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && h[k]) { try { x.setRequestHeader(k, h[k]); } catch (e) {} }
    try { x.setRequestHeader("Content-Type", o.type || "image/jpeg"); x.setRequestHeader("Accept", "application/json"); } catch (e) {}
    if (x.upload) {
      x.upload.onprogress = function (e) { if (e && e.lengthComputable && e.total && o.onProgress) { try { o.onProgress(Math.min(100, Math.round(e.loaded * 100 / e.total))); } catch (x2) {} } };
      x.upload.onload = function () { if (o.onUploaded) { try { o.onUploaded(); } catch (x2) {} } };
    }
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) { j = null; } done(x.status, j); };
    x.onerror = function () { done(0, { code: "offline" }); };
    x.ontimeout = function () { done(0, { code: "timeout" }); };
    x.onabort = function () { done(0, { code: "aborted" }); };
    try { x.send(o.blob); } catch (e) { done(0, { code: "offline" }); }
    return x;
  }

  /* ---------- nothing typed can pose as a platform note ---------- */
  /* a marker phrase ANYWHERE in what the person types (review 2026-11-20: «📎 [PLATFORM NOTE: …]» — the photo turn's own 📎 prefix — and
     «ok [ملاحظة من المنصة: …]» passed a start-only check) → the whole text in quotes without its square brackets; a leading 📎 stays in
     front (worker/src/knowledge.js skips photo turns by it); idempotent (sdkSay runs it again on the photo turn) */
  var MARK_RX = /(?:ملاحظ[ةه]\s+من\s+المنص[ةه]|بداي[ةه]\s+نتيج[ةه]|نهاي[ةه]\s+نتيج[ةه]|platform\s+note|start\s+of\s+the\s+reading|end\s+of\s+the\s+reading|continuation\s+of\s+the\s+same)/i;
  function markSafe(t) {
    t = String(t == null ? "" : t);
    if (!MARK_RX.test(t)) return t;
    var m = /^\s*\uD83D\uDCCE\s*/.exec(t), s = (m ? t.slice(m[0].length) : t).replace(/[\[\]\u3010\u3011\uFF3B\uFF3D]/g, " ");
    s = s.replace(/^[\s\u200E\u200F(\uFF08{\u00AB<"'\u201C\u201D]+/, "").replace(/[)\uFF09}\u00BB>"'\u201C\u201D\s]+$/, "").replace(/\s{2,}/g, " ");
    return (m ? "\uD83D\uDCCE " : "") + "\u201C" + s + "\u201D";
  }

  /* ---------- the server's bilingual error («عربي / English») in one language ---------- */
  function side(msg, en) { var s = String(msg || ""), i = s.indexOf(" / "); if (i < 0) return s; return en ? s.slice(i + 3) : s.slice(0, i); }
  function errText(st, j, en) {
    var c = String((j && j.code) || "");
    if (!st || c === "offline" || c === "timeout") return tx("offline", en);
    if (st === 429) return tx("rate_limited", en);
    if (c === "feature_off" || c === "ai_off") return tx("feature_off", en);
    if (st === 413) return tx("too_big", en);
    if (st === 415) return tx("type", en);
    if (j && typeof j.error === "string" && /\s\/\s/.test(j.error)) return side(j.error, en);
    return tx("offline", en);
  }

  /* ---------- the first-use notice (once per device and kind: "mig-cm-ok" = the call's, "mig-cm-ok-b" = the bubble's) ---------- */
  var CSS = ".cm-ntc{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));background:rgba(4,18,26,.55);font-family:Cairo,Tajawal,Tahoma,sans-serif}"
    + ".cm-ntc>div{box-sizing:border-box;width:min(460px,100%);background:#fff;color:#0F172A;border-radius:16px;padding:18px;box-shadow:0 20px 50px -20px rgba(0,0,0,.6);font:600 15px/1.8 Cairo,Tahoma,Arial,sans-serif}"
    + ".cm-ntc p{margin:0 0 10px}.cm-ntc .acts{display:flex;flex-wrap:wrap;gap:8px}.cm-ntc button{flex:1 1 auto;min-height:44px;border-radius:999px;border:0;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer}"
    + ".cm-ntc .ok{background:#0b5d47;color:#fff}.cm-ntc .no{background:#EEF0F3;color:#0F172A}.cm-ntc button:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}"
    + ".jnl-cmf .jv-cm{gap:6px 8px;min-width:min(100%,300px)}.jnl-cmf .jv-cm img{flex:none;width:40px;height:40px;border-radius:9px;object-fit:cover;border:1px solid rgba(233,196,106,.65);background:#fff}"
    + ".jnl-cmf .jv-cm span{flex:1 1 150px;min-width:0}.jnl-cmf .jv-cm.er{border-color:#ff9aa9}.jnl-cmf .jv-cm.ok{border-color:#2fd0a0}.jnl-cmf .jv-cm .cm-x{width:40px;padding:0}.jnl-cmf .jv-cm .cm-pr{background:#0b5d47;border-color:#e9c46a}"
    + ".jnl-sdk .jv-ctl .jv-att{width:44px;padding:0;font-size:1.05rem}.jnl-sdk .jv-ctl .jv-att[hidden],.jnl-sdk .jv-ctl .jv-snd[hidden],.jnl-sdk .jv-ctl .jv-file{display:none}";
  function style() { if (D.getElementById("mig-cm-css")) return; var s = D.createElement("style"); s.id = "mig-cm-css"; s.textContent = CSS; (D.head || D.documentElement).appendChild(s); }
  function okSeen(kind) { return ls(kind === "b" ? "mig-cm-ok-b" : "mig-cm-ok") === "1" || !!OKMEM[kind]; }
  function okSet(kind) { OKMEM[kind] = 1; ls(kind === "b" ? "mig-cm-ok-b" : "mig-cm-ok", "1"); }
  var OKMEM = {};
  /* the card over the call: «تمام، اختار صورة» opens the picker inside the same tap (a browser opens a file picker only from a tap) */
  function notice(text, en, yes) {
    style();
    var old = D.querySelector(".cm-ntc"); if (old && old.parentNode) old.parentNode.removeChild(old);
    var c = D.createElement("div"); c.className = "cm-ntc"; c.setAttribute("translate", "no"); c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true"); c.dir = en ? "ltr" : "rtl";
    c.innerHTML = "<div><p>" + esc(text) + '</p><div class="acts"><button type="button" class="ok">' + esc(tx("ok", en)) + '</button><button type="button" class="no">' + esc(tx("cancel", en)) + "</button></div></div>";
    D.body.appendChild(c);
    var close = function () { if (c.parentNode) c.parentNode.removeChild(c); };
    c.querySelector(".ok").onclick = function () { close(); yes(); };
    c.querySelector(".no").onclick = close;
    c.addEventListener("click", function (e) { if (e.target === c) close(); });
    try { c.querySelector(".ok").focus(); } catch (e) {}
    return c;
  }

  /* ======================================================================================================================
     the live call (data/janna-live.js gives a host: {persona, en, ok, box, ov, live(), ctx(text), say(text), toast(text), ticket(),
     btok(), full(), chain(), relayout(), replay(), go(url), upd(), api})
     ====================================================================================================================== */
  var CS = { pend: null, busy: false, el: null, st: "", thumb: "", hideT: 0, last: null, xhr: null, rz: 0 }, HOST = null;
  function P(h) { return h && h.persona === "bassem" ? "bassem" : "janna"; }
  function urlDrop(u) { try { if (u) (W.URL || W.webkitURL).revokeObjectURL(u); } catch (e) {} }
  /* the 📎 tap: the notice once per device, then the picker (in the same tap) */
  function callTap(h, fi) {
    if (!h || !fi || CS.busy) return;
    HOST = h; wire(fi);
    var go = function () { pick(fi, h); };
    if (!okSeen("c")) { notice(tx("notice", h.en, P(h)), h.en, function () { okSet("c"); go(); }); return; }
    go();
  }
  function pick(fi, h) {
    try { fi.value = ""; } catch (e) {}
    replayArm(h);
    try { fi.click(); } catch (e) {}
  }
  /* the Android camera app sends the page to the background: when the picker closes the call's video plays again (once) */
  function replayArm(h) {
    var fired = false, fn = function () { if (fired) return; if (D.visibilityState && D.visibilityState !== "visible") return; fired = true; off(); setTimeout(function () { try { if (h && h.replay) h.replay(); } catch (e) {} }, 300); };
    var off = function () { W.removeEventListener("focus", fn); D.removeEventListener("visibilitychange", fn); };
    W.addEventListener("focus", fn); D.addEventListener("visibilitychange", fn); /* the window's own focus (never an element's: no capture) */
    setTimeout(off, 600000);
  }
  function wire(fi) {
    if (fi.__cm) return; fi.__cm = 1;
    fi.addEventListener("change", function () {
      var f = fi.files && fi.files[0], h = HOST; if (!f || !h) return;
      photoPrep(f, function (e, r) {
        try { fi.value = ""; } catch (x) {}
        if (e) { if (e !== "none") chip(h, "err", { t: tx(e, h.en) }); return; }
        if (CS.pend) urlDrop(CS.pend.url);
        CS.pend = r; chip(h, "ready", { url: r.url }); if (h.upd) h.upd();
      });
    });
  }
  function pending() { return !!CS.pend; }
  /* the box's placeholder while a photo waits — not in a narrow box (390 px: under 220 px, where data/janna-live.js shortens its own
     placeholder too): there the chip above already says it */
  function ph(h) { var inp = CS.pend && h && h.box ? h.box.querySelector(".jv-ctl input") : null; return CS.pend && h && !(inp && inp.clientWidth && inp.clientWidth < 220) ? tx("ph", h.en) : ""; }
  /* ➤ with a photo waiting → 1 (taken), 0 (no photo: the text goes as usual), -1 (the call cannot take it yet: «ثانية واحدة») */
  function send(h, caption) {
    if (!CS.pend) return 0;
    if (CS.busy) return 1;
    if (!h || !h.live()) return -1;
    var p = CS.pend, B = P(h) === "bassem", ch = h.chain(), photos = ch ? (ch.photos = ch.photos || []) : [], ref = "P" + Math.min(99, photos.length + 1), en = !!h.en && !B;
    CS.pend = null; CS.busy = true; HOST = h;
    h.ctx(tx("noteUp", en, P(h)));
    chip(h, "up", { n: 0, url: p.url });
    var hd = { "X-MIG-Ref": ref, "X-MIG-Lang": h.en ? "en" : "ar" };
    if (B) { var bt = h.btok(); if (bt) hd.Authorization = "Bearer " + bt; if (h.full()) hd["X-MIG-Can"] = "prod"; }
    else hd["X-MIG-Ticket"] = h.ticket();
    CS.xhr = mediaPost({ url: (h.api || API) + (B ? "/advisor/media/look" : "/janna/media/look"), blob: p.blob, type: p.type || "image/jpeg", headers: hd,
      onProgress: function (n) { if (CS.st === "up") chip(h, "up", { n: n, url: p.url }); },
      onUploaded: function () { chip(h, "read", { url: p.url }); },
      cb: function (st, j) {
        CS.busy = false; CS.xhr = null;
        /* the person ended the call meanwhile (✕ or the overlay closed): nothing to tell, no chip over the ended call — a call that is only
           renewing its session (Bassem's next part) keeps its box "live", so there the photo's failure still shows */
        var bs = h.box && h.box.getAttribute ? String(h.box.getAttribute("data-state") || "") : "";
        if (!h.live() && bs && bs !== "live" && bs !== "connecting") { chipOff(); if (h.upd) h.upd(); return; }
        if (st === 200 && j && j.ok && typeof j.context === "string" && j.context) {
          var told = h.live() && h.ctx(j.context);
          if (!told) { chip(h, "err", { t: tx("offline", h.en), url: p.url }); if (h.upd) h.upd(); return; }
          var cap = String(caption || "").replace(/^\s+|\s+$/g, "");
          h.say(cap ? "📎 " + markSafe(cap) : tx("cap", h.en)); /* the default caption carries its own 📎; a typed caption passes markSafe here too */
          photos.push({ ref: ref, what: j.seen ? String(j.seen.what_en || j.seen.what_ar || "") : "", seal: String(j.seal || "") });
          if (photos.length > LIM.photos) photos.splice(0, photos.length - LIM.photos);
          if (CS.last) urlDrop(CS.last.url);
          CS.last = { blob: p.blob, url: p.url, ref: ref, prod: B && j.prod === true && !!h.full() };
          chip(h, j.seen ? "done" : "notread", { url: p.url, prod: CS.last.prod });
        } else {
          if (h.live()) h.ctx(tx("noteFail", en, P(h)));
          chip(h, "err", { t: errText(st, j, h.en), url: p.url });
        }
        if (h.upd) h.upd();
      } });
    if (h.upd) h.upd();
    return 1;
  }
  /* Bassem's «🏭 ضيفها لمنتجاتي»: the same photo into the member's own product photos (team approval), then «منتجاتي» on his screen */
  function prodAdd(h) {
    var L = CS.last; if (!L || CS.busy || !h) return;
    var tk = h.full(); if (!tk) { chip(h, "err", { t: tx("prodLogin", h.en), url: L.url }); return; }
    CS.busy = true; chip(h, "prodUp", { url: L.url });
    mediaPost({ url: (h.api || API) + "/me/media?purpose=product", blob: L.blob, type: "image/jpeg", headers: { Authorization: "Bearer " + tk }, cb: function (st, j) {
      CS.busy = false;
      var m = j && j.media;
      if ((st === 200 || st === 201) && m && m.id) {
        ss("mig-prod-img", JSON.stringify({ id: String(m.id), url: String(m.url || ""), width: +m.width || 0, height: +m.height || 0, t: new Date().getTime() }));
        L.prod = false;
        try { if (h.go) h.go("dashboard.html#products"); } catch (e) {}
        if (h.live()) h.ctx(fill(tx("noteProd", false), { ref: L.ref }));
        chip(h, "prodOk", { url: L.url });
      } else {
        var c = String((j && j.code) || "");
        chip(h, "err", { t: c === "full_login_required" || st === 401 ? tx("prodLogin", h.en) : c === "plan" ? tx("prodPlan", h.en) : errText(st, j, h.en), url: L.url });
      }
      if (h.upd) h.upd();
    } });
  }
  /* the chip on <body> (the noise / 🌐 chips' look and layer: above the hologram, hidden by html.mig-modal / html.jnl-lgm-on) */
  function chip(h, st, o) {
    o = o || {}; style();
    var en = !!(h && h.en), el = CS.el, c, txt = "", cls = "", acts = "", stay = 0, B = P(h) === "bassem";
    clearTimeout(CS.hideT);
    if (!el) {
      el = CS.el = D.createElement("div"); el.className = "jnl-nzf jnl-cmf"; el.setAttribute("translate", "no");
      el.innerHTML = '<div class="jv-nz jv-cm" role="status" aria-live="polite"></div>'; D.body.appendChild(el);
      if (!CS.rz) { CS.rz = 1; W.addEventListener("resize", place); }
    }
    if (h && h.ov && !h.ov.__cm) { h.ov.__cm = 1; h.ov.addEventListener("scroll", place, { passive: true }); }
    c = el.firstChild; el.dir = en ? "ltr" : "rtl"; CS.st = st;
    if (o.url) CS.thumb = o.url;
    if (st === "ready") { txt = tx("ready", en); stay = -1; }
    else if (st === "up") txt = fill(tx("up", en), { n: o.n || 0 });
    else if (st === "read") txt = tx("read", en);
    else if (st === "done") { txt = tx("done", en, P(h)); cls = "ok"; stay = o.prod ? 90000 : 15000; if (o.prod) acts = '<button type="button" class="cm-pr">' + esc(tx("prod", en)) + "</button>"; }
    else if (st === "notread") { txt = tx("notread", en, P(h)); stay = 15000; }
    else if (st === "prodUp") txt = tx("prodUp", en);
    else if (st === "prodOk") { txt = tx("prodOk", en); cls = "ok"; stay = 30000; }
    else { txt = String(o.t || tx("offline", en)); cls = "er"; stay = 15000; }
    var busy = st === "up" || st === "read" || st === "prodUp";
    c.className = "jv-nz jv-cm" + (cls ? " " + cls : "");
    c.innerHTML = (CS.thumb ? '<img src="' + esc(CS.thumb) + '" alt="">' : "") + "<span>" + esc(txt) + "</span>" + acts
      + (busy ? "" : '<button type="button" class="cm-x" title="' + esc(tx("rm", en)) + '" aria-label="' + esc(tx("rm", en)) + '">✕</button>');
    var x = c.querySelector(".cm-x"), pr = c.querySelector(".cm-pr");
    if (x) x.onclick = function () { if (st === "ready" && CS.pend) { urlDrop(CS.pend.url); CS.pend = null; } chipOff(); if (h && h.upd) h.upd(); };
    if (pr) pr.onclick = function () { prodAdd(h); };
    el.hidden = false; place();
    if (stay > 0) CS.hideT = setTimeout(function () { if (CS.st === st) chipOff(); }, stay);
    if (h && h.relayout) { try { h.relayout(); } catch (e) {} }
  }
  function chipOff() {
    clearTimeout(CS.hideT); CS.st = ""; CS.thumb = "";
    if (CS.el && CS.el.parentNode) CS.el.parentNode.removeChild(CS.el);
    CS.el = null;
    if (HOST && HOST.relayout) { try { HOST.relayout(); } catch (e) {} }
  }
  /* its place: centred over the video, its bottom 6 px above the control bar → its rect (the other chips stack on it), or null */
  function place() {
    var el = CS.el, h = HOST, bx = h && h.box; if (!el || el.hidden || !bx) return null;
    var ctl = bx.querySelector(".jv-ctl"), r = bx.getBoundingClientRect(), cr = ctl && !ctl.hidden ? ctl.getBoundingClientRect() : null, vh = W.innerHeight || D.documentElement.clientHeight;
    if (!r || !r.width || !cr || !cr.height) { el.style.visibility = "hidden"; return null; }
    el.style.visibility = ""; el.style.left = Math.round(r.left + 10) + "px"; el.style.width = Math.max(0, Math.round(r.width - 20)) + "px"; el.style.bottom = Math.round(vh - cr.top + 6) + "px";
    var cr2 = el.firstChild ? el.firstChild.getBoundingClientRect() : null;
    return cr2 && cr2.height ? cr2 : null;
  }
  /* after every update of the call's bar (data/janna-live.js updCtl): 📎 shows while h.ok; on a narrow bar it takes ➤'s place while the box is
     empty and no photo waits (the 390 px bar keeps its text box), on a wide one both show */
  function sync(h) {
    if (!h) return;
    HOST = h;
    var bx = h.box, att = bx && bx.querySelector(".jv-att"), snd = bx && bx.querySelector(".jv-snd"), inp = bx && bx.querySelector(".jv-ctl input"), fi = bx && bx.querySelector(".jv-file");
    if (!att || !snd || !inp) return;
    style();
    if (fi) wire(fi);
    if (!inp.__cm) { inp.__cm = 1; inp.addEventListener("input", function () { if (HOST) sync(HOST); }); }
    if (!h.ok) {
      att.hidden = true; snd.hidden = false;
      if (CS.pend) { urlDrop(CS.pend.url); CS.pend = null; }
      if (CS.st === "ready" || !h.live()) chipOff();
      return;
    }
    var label = tx("att", h.en);
    if (att.title !== label) { att.title = label; att.setAttribute("aria-label", label); }
    var narrow = (bx.clientWidth || 0) < LIM.wide, typed = !!String(inp.value || "").replace(/\s+/g, "");
    if (narrow && (typed || CS.pend || CS.busy)) { att.hidden = true; snd.hidden = false; }
    else if (narrow) { att.hidden = false; snd.hidden = true; }
    else { att.hidden = false; snd.hidden = false; }
    att.disabled = CS.busy;
    place();
  }
  /* the call's next part (data/janna-live.js resumeText): the photos of this call by their labels (≤ 300 characters) */
  function resumeLine(ch) {
    var ps = ch && ch.photos; if (!ps || !ps.length) return "";
    var s = "Photos sent earlier in this call (platform descriptions, may be wrong): " + ps.map(function (p) { return p.ref + " = " + (String(p.what || "").replace(/[\[\]{}<>«»"\r\n]+/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 60) || "no description"); }).join("; ");
    return s.length > 300 ? s.slice(0, 299) + "…" : s;
  }
  /* the call closed: the chip, a waiting photo and the notice go with it */
  function drop() {
    try { if (CS.xhr) CS.xhr.abort(); } catch (e) {}
    if (CS.pend) urlDrop(CS.pend.url); if (CS.last) urlDrop(CS.last.url);
    CS.pend = null; CS.last = null; CS.busy = false; CS.xhr = null; chipOff(); HOST = null;
    var n = D.querySelector(".cm-ntc"); if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  /* ======================================================================================================================
     the «اكتبلي» bubble (data/janna.js): a bubble ticket (30 min, 4 looks; no visitor id) → the same look
     ====================================================================================================================== */
  function ticketGet(cb, fresh) {
    var o = null; try { o = JSON.parse(ss("mig-cm-t") || "null"); } catch (e) { o = null; }
    if (!fresh && o && o.t && +o.exp > new Date().getTime() + 60000) { cb(String(o.t)); return; }
    var x = null; try { x = new XMLHttpRequest(); x.open("POST", API + "/janna/media/ticket", true); } catch (e) { cb("", 0, { code: "offline" }); return; }
    x.timeout = 15000; try { x.setRequestHeader("Content-Type", "application/json"); x.setRequestHeader("Accept", "application/json"); } catch (e) {}
    var fin = false, done = function (st, j) { if (fin) return; fin = true; if (st === 200 && j && j.media_ticket) { ss("mig-cm-t", JSON.stringify({ t: j.media_ticket, exp: new Date().getTime() + (+j.expires_in || 1800) * 1000 })); cb(String(j.media_ticket)); } else cb("", st, j); };
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} done(x.status, j); };
    x.onerror = x.ontimeout = function () { done(0, { code: "offline" }); };
    try { x.send("{}"); } catch (e) { done(0, { code: "offline" }); }
  }
  /* cb(null, answer) | cb({t: error text}) */
  function bubbleLook(p, en, cb) {
    var again = true;
    var go = function (fresh) {
      ticketGet(function (t, st, j) {
        if (!t) { cb({ t: errText(st, j, en) }); return; }
        mediaPost({ url: API + "/janna/media/look", blob: p.blob, type: p.type || "image/jpeg", headers: { "X-MIG-Ticket": t, "X-MIG-Ref": "P1", "X-MIG-Lang": en ? "en" : "ar" },
          cb: function (st2, j2) {
            if (st2 === 403 && j2 && j2.code === "ticket_invalid" && again) { again = false; ss("mig-cm-t", null); go(true); return; }
            if (st2 === 200 && j2 && j2.ok) { cb(null, j2); return; }
            cb({ t: errText(st2, j2, en) });
          } });
      }, fresh);
    };
    go(false);
  }

  W.MIGCHATMEDIA = { __v: 1, photoPrep: photoPrep, mediaPost: mediaPost, markSafe: markSafe, tx: tx, errText: errText,
    okSeen: okSeen, okSet: okSet, notice: notice,
    callTap: callTap, sync: sync, pending: pending, send: send, ph: ph, place: place, resumeLine: resumeLine, drop: drop,
    bubbleLook: bubbleLook, state: function () { return { pending: !!CS.pend, busy: CS.busy, chip: CS.st, prod: !!(CS.last && CS.last.prod) }; } };
  try { W.dispatchEvent(new CustomEvent("mig:chat-media", { detail: { v: 1 } })); } catch (e) {}
})();
