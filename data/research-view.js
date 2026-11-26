/* «بحث وكتابة عميقة» — the document page /research/#<id> (research.part.py; worker/src/research.js GET /api/advisor/research/<id>/doc).
   A member's document opens with his own sign-in (data/mig-api.js, localStorage «mig-tok»): another account, an expired or a hidden document
   → «المستند ده مش متاح» (no reason given). While the job runs: its progress, refreshed every 3 s. The document: the title, the summary,
   the sections in order (paragraphs, bullets, steps, item cards, posts and e-mails with «📋 انسخ», the quotation's rows), the item's
   status computed by the server when the page is read (a tender read after its deadline never says «مفتوحة»), the CTAs, «🖨️ اطبع / احفظ
   PDF», «📋 انسخ المستند», «📩 ابعتهولي», «🗑️ امسح المستند».
   SECURITY: every server / model string goes in through textContent (never innerHTML); a link only from the server's linkable paths, and
   only when it is a same-origin path (^/(?!/)); the id leaves the address bar after it is read (history.replaceState). No source, no link
   out, no provenance label is ever shown. ES5 (CLAUDE.md 2.1); the chrome T(ar, en), the document body translate="no". */
(function () {
  "use strict";
  var EN = function () { return window.MIGLANG === "en"; };
  var T = function (ar, en) { return EN() ? en : ar; };
  var root = document.getElementById("rsDoc"); if (!root) return;
  var API = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var KEY = "mig-rs-last";
  function idOf() {
    var m = /^#(rj[0-9a-z]{20})$/.exec(location.hash || "");
    if (m) { try { sessionStorage.setItem(KEY, m[1]); } catch (e) {} try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return m[1]; }
    try { var s = sessionStorage.getItem(KEY) || ""; return /^rj[0-9a-z]{20}$/.test(s) ? s : ""; } catch (e) { return ""; }
  }
  var ID = idOf();
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function clear() { while (root.firstChild) root.removeChild(root.firstChild); }
  function tok() { try { return (window.MIGAPI && MIGAPI.token && MIGAPI.token()) || localStorage.getItem("mig-tok") || ""; } catch (e) { return ""; } }
  function get(path, method, body) {
    var h = { Accept: "application/json" }, t = tok(); if (t) h.Authorization = "Bearer " + t; if (body) h["Content-Type"] = "application/json";
    return fetch(API + path, { method: method || "GET", headers: h, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, j: j || {} }; }, function () { return { status: r.status, j: {} }; });
    }, function () { return { status: 0, j: {} }; });
  }
  function note(cls, text) { clear(); root.appendChild(el("div", "rsn " + cls, text)); }
  function signIn() {
    clear(); var c = el("div", "rsn info", T("المستند ده متاح لصاحبه بس: ادخل بحسابك.", "This document is available to its owner only: sign in."));
    var b = el("button", "rsb", T("ادخل بحسابك", "Sign in")); b.type = "button";
    b.onclick = function () { if (window.MIGAPI && MIGAPI.open) MIGAPI.open({}); };
    c.appendChild(el("br")); c.appendChild(b); root.appendChild(c);
  }
  var ST = { open: ["مفتوحة", "Open", "ok"], closing: ["بتقفل قريب", "Closing soon", "warn"], closed: ["ميعادها خلص", "Deadline passed", "err"], unknown: ["ميعادها مش معروف", "Deadline not known", "info"] };
  var TYPE = { tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "RFQ"], buyer: ["شركة ممكن تبقى عميل", "Potential buyer"], buyer_list: ["قايمة مصانع", "List of plants"], project: ["مشروع جديد", "New project"], company: ["شركة", "Company"], product: ["منتج", "Product"] };
  var CTA = { register: ["✍️ سجّل مصنعك علشان الطلبات توصلك", "✍️ Register your factory so the requests reach you", "/register/"], rfq: ["📝 اطلب عرض سعر", "📝 Ask for a quotation", "/contact/#rfq-form"] };
  var safePath = function (p) { return typeof p === "string" && /^\/(?!\/)[^\s"'<>\\]*$/.test(p) ? p : ""; };
  function copyBtn(text) {
    var b = el("button", "rsb l", T("📋 انسخ", "📋 Copy")); b.type = "button";
    b.onclick = function () { var done = function () { b.textContent = T("✓ اتنسخ", "✓ Copied"); }; try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () {}); return; } } catch (e) {}
      var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta); };
    return b;
  }
  function itemCard(it) {
    var c = el("div", "rsi"), h = el("b", "", it.label || "");
    if (it.badge) h.appendChild(el("span", "rsbd", it.badge === "member" ? T("عضو على المنصة", "Member on the platform") : T("✓ موثّق من فريق المنصة", "✓ Verified by the platform team")));
    c.appendChild(h);
    var meta = [it.entity && String(it.label).indexOf(it.entity) < 0 ? it.entity : "", it.place || it.country || "", it.activity || "", it.value || "", it.deadline ? T("آخر ميعاد ", "Deadline ") + it.deadline : ""].filter(function (v) { return !!v; });
    if (meta.length) c.appendChild(el("small", "", meta.join(" · ")));
    if (it.status && ST[it.status]) c.appendChild(el("span", "rsst " + ST[it.status][2], T(ST[it.status][0], ST[it.status][1])));
    if (it.line) c.appendChild(el("p", "", it.line));
    var u = safePath(it.link); if (u) { var a = el("a", "rsl", T("افتح صفحته على المنصة", "Open its page on the platform")); a.href = u; c.appendChild(a); }
    return c;
  }
  function textOf(d) {
    var out = [d.title || ""]; if (d.summary) out.push(d.summary);
    (d.sections || []).forEach(function (s) { out.push("", s.heading || ""); (s.blocks || []).forEach(function (b) { if (b.type === "item") { var it = d.items[b.ref]; if (it) out.push("• " + [it.label, it.place || it.country || "", it.deadline ? T("آخر ميعاد ", "Deadline ") + it.deadline : "", it.line || ""].filter(function (v) { return !!v; }).join(" — ")); } else if (b.type !== "cta") out.push((b.subject ? b.subject + "\n" : "") + (b.text || "")); }); });
    return out.join("\n");
  }
  function show(x) {
    var d = x.doc; clear();
    var art = el("article", "rsa"); art.setAttribute("translate", "no"); art.setAttribute("dir", d.dir === "ltr" ? "ltr" : "rtl"); art.setAttribute("lang", d.lang || "ar");
    art.appendChild(el("h1", "", d.title || ""));
    if (d.summary) art.appendChild(el("p", "rss", d.summary));
    (d.sections || []).forEach(function (s) {
      var sec = el("section", "rssec"); sec.appendChild(el("h2", "", s.heading || "")); var list = null;
      (s.blocks || []).forEach(function (b) {
        if (b.type === "item") { var it = d.items && d.items[b.ref]; if (it) sec.appendChild(itemCard(it)); return; }
        if (b.type === "cta") { var c = CTA[b.cta]; if (c) { var a = el("a", "rsb", T(c[0], c[1])); a.href = c[2]; if (b.cta === "register") a.setAttribute("data-mig-buy", "1"); sec.appendChild(a); } else if (b.cta === "mail") sec.appendChild(mailBtn()); return; }
        if (b.type === "bullet" || b.type === "step") { if (!list) { list = el(b.type === "step" ? "ol" : "ul"); sec.appendChild(list); } list.appendChild(el("li", "", b.text)); return; }
        list = null;
        if (b.type === "post" || b.type === "email") { var box = el("div", "rspost"); if (b.subject) box.appendChild(el("b", "", b.subject)); box.appendChild(el("p", "", b.text)); box.appendChild(copyBtn((b.subject ? b.subject + "\n\n" : "") + b.text)); sec.appendChild(box); return; }
        if (b.type === "row") { var r = el("div", "rsrow"); String(b.text || "").split("|").forEach(function (cell) { r.appendChild(el("span", "", cell.replace(/^\s+|\s+$/g, ""))); }); sec.appendChild(r); return; }
        sec.appendChild(el("p", "", b.text));
      });
      art.appendChild(sec);
    });
    root.appendChild(art);
    var ac = el("div", "rsact"), pr = el("button", "rsb l", T("🖨️ اطبع / احفظ PDF", "🖨️ Print / save as PDF")); pr.type = "button"; pr.onclick = function () { try { window.print(); } catch (e) {} };
    ac.appendChild(pr); ac.appendChild(copyBtn(textOf(d))); ac.appendChild(mailBtn());
    var del = el("button", "rsb l", T("🗑️ امسح المستند", "🗑️ Delete the document")); del.type = "button";
    del.onclick = function () { if (!window.confirm(T("تمسح المستند ده؟ مش هيرجع تاني.", "Delete this document? It cannot be undone."))) return; get("/advisor/research/" + ID, "POST", { action: "delete" }).then(function () { note("info", T("اتمسح.", "Deleted.")); }); };
    ac.appendChild(del); root.appendChild(ac);
    if (x.expires_at) root.appendChild(el("p", "rsk", T("المنصة بتحتفظ بالمستند لحد ", "The platform keeps this document until ") + String(x.expires_at).slice(0, 10) + "."));
  }
  function mailBtn() {
    var b = el("button", "rsb l", T("📩 ابعتهولي على الإيميل", "📩 E-mail it to me")); b.type = "button";
    b.onclick = function () { b.disabled = true; get("/advisor/research/" + ID + "/mail", "POST", {}).then(function (x) { b.textContent = x.j && x.j.sent ? T("✓ اتبعت على إيميلك", "✓ Sent to your e-mail") : T("مااتبعتش — ادخل بكود الإيميل وجرّب تاني", "Not sent — sign in with an e-mail code and try again"); }); };
    return b;
  }
  var tries = 0;
  function load() {
    if (!ID) { note("err", T("المستند ده مش متاح.", "This document is not available.")); return; }
    if (!tok()) { signIn(); return; }
    get("/advisor/research/" + ID + "/doc").then(function (x) {
      if (x.status === 200 && x.j && x.j.doc) { show(x.j); return; }
      if (x.status === 202) { note("info", T("المستند لسه بيتكتب… ", "The document is still being written… ") + (x.j && x.j.eta_s ? T("حوالي ", "about ") + x.j.eta_s + T(" ثانية", " s") : "")); if (++tries < 60) setTimeout(load, 3000); return; }
      if (x.status === 401) { signIn(); return; }
      if (x.status === 0) { note("err", T("مفيش اتصال دلوقتي — جرّب تاني.", "No connection right now — try again.")); return; }
      note("err", T("المستند ده مش متاح.", "This document is not available."));
    });
  }
  window.addEventListener("mig:login", function () { tries = 0; load(); });
  load();
})();
