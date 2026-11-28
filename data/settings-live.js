/* MIGSETTINGS — the public site settings of the Admin Control Center («الإعدادات»: contact, hotline, WhatsApp, address, social links,
   operator) applied to the elements the build marks with data-mig-setting="<key>" (ACC-CONTRACT §10.3 P-S2). Reads
   window.MIGOVL_DATA.settings (data/overlay.js — public keys only, never a network call). Loaded right after data/seo.js at the end of
   <body>, so it runs before data/i18n.js translates the page (the English dictionary then translates the new text as usual).
     <a data-mig-setting="contact_email">✉ info@…</a>            → href mailto:<value>, the old address in its text → the new one
     <a data-mig-setting="whatsapp_number" data-mig-setting-text="whatsapp_display">…</a> → href https://wa.me/<digits>, text from the display key
     <a data-mig-setting="social_youtube">                         → href <https URL>; the value "-" (panel «إخفاء الرابط») hides the link
     <button data-copy="…" data-mig-setting="whatsapp_display">     → data-copy follows the value too
   A value "" (or a key the overlay does not carry) leaves the static markup exactly as built. Only the text that equals today's value
   (the seed) is replaced, so icons and labels around it stay. ES5, no dependencies. */
(function () {
  "use strict";
  var W = window;
  if (W.MIGSETTINGS) return;
  /* today's values in the build (ACC-CONTRACT §2 seeds) — the text that a new value replaces */
  var SEED = {
    contact_email: "info@madeinegyptgate.com", support_email: "support@madeinegyptgate.com", billing_email: "",
    hotline_display: "02 38346757", hotline_tel: "+20238346757", whatsapp_display: "01279188996", whatsapp_number: "201279188996",
    address_ar: "عمارة 56 (الدور الثالث)، وجه الثقافة والعلوم، الحي 11، السادس من أكتوبر، الجيزة", address_en: "Building 56 (third floor), Culture and Science Area, 11th District, 6th of October City, Giza, Egypt",
    operator_ar: "الجمعية المصرية للتنمية الصناعية", operator_en: "", operator_reg_ar: "جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي)", operator_reg_en: ""
  };
  /* a stored value that is only an older default wording of the same key leaves the build's text alone: the address before the owner's
     approved wording of 2026-11-27 (docs/IDENTITY-APPROVED.md) — the same address in another order */
  var OLD = { address_ar: ["الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية"] };
  var TEXT = { contact_email: 1, support_email: 1, billing_email: 1, hotline_display: 1, whatsapp_display: 1, address_ar: 1, operator_ar: 1, operator_reg_ar: 1 };
  var S = null, DONE = "data-mig-set-done";
  var EMAIL = /^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$/;
  function okUrl(u) { return W.MIGOVL && MIGOVL.okUrl ? MIGOVL.okUrl(u) && /^https:/i.test(String(u)) : /^https:\/\/[^\s"'<>`\\]+$/i.test(String(u || "")); }
  function neutral(s) { return W.MIGOVL && MIGOVL.neutral ? MIGOVL.neutral(s, 1) : String(s == null ? "" : s).replace(/[<>"'`]/g, "").replace(/\s+/g, " ").trim(); }
  function get(k) { var v = S && Object.prototype.hasOwnProperty.call(S, k) && typeof S[k] === "string" ? S[k] : ""; return v && OLD[k] && OLD[k].indexOf(v) > -1 ? "" : v; }
  /* the link a key builds (validated); "" = leave the href as built */
  function href(k, v) {
    if (/_email$/.test(k)) return EMAIL.test(v) ? "mailto:" + v : "";
    if (k === "hotline_tel" || /_tel$/.test(k)) { var t = v.replace(/[\s\-()]/g, ""); return /^\+?\d{6,15}$/.test(t) ? "tel:" + t : ""; }
    if (k === "whatsapp_number") { var d = v.replace(/\D/g, ""); return /^\d{8,15}$/.test(d) ? "https://wa.me/" + d : ""; }
    if (/^social_/.test(k) || k === "operator_url") return okUrl(v) ? v : "";
    return "";
  }
  /* the text a key shows (validated / neutralised); "" = leave the text as built */
  function text(k, v) {
    if (/_email$/.test(k)) return EMAIL.test(v) ? v : "";
    if (k === "whatsapp_display" || k === "hotline_display") return /^[+\d][\d\s\-]{5,24}$/.test(v) ? v : "";
    return neutral(v).slice(0, 500);
  }
  /* replace the seed inside the element's text nodes; when the seed is not there and the element holds only text, the whole text */
  function setText(el, k, v) {
    var seed = SEED[k], hit = false;
    if (seed && W.document && document.createTreeWalker) {
      var w = document.createTreeWalker(el, 4), n;
      while ((n = w.nextNode())) if (n.nodeValue.indexOf(seed) > -1) { n.nodeValue = n.nodeValue.split(seed).join(v); hit = true; }
    }
    if (!hit && !el.children.length) el.textContent = v;
  }
  function one(el) {
    if (el.hasAttribute(DONE)) return;
    var k = el.getAttribute("data-mig-setting"), tk = el.getAttribute("data-mig-setting-text"), v = get(k);
    if (!k) return;
    /* a social link the owner switched off */
    if (/^social_/.test(k) && v === "-") { el.hidden = true; el.style.display = "none"; el.setAttribute("aria-hidden", "true"); el.setAttribute(DONE, "1"); return; }
    if (v) {
      var h = href(k, v);
      if (h && (el.tagName === "A" || el.hasAttribute("href"))) el.setAttribute("href", h);
      if (el.hasAttribute("data-copy")) { var c = /_email$/.test(k) ? text(k, v) : k === "whatsapp_number" ? v.replace(/\D/g, "") : k === "hotline_tel" ? v.replace(/[\s\-()]/g, "") : text(k, v); if (c) el.setAttribute("data-copy", c); }
    }
    var t = tk || (TEXT[k] ? k : "");
    if (t) {
      var tv = get(t);
      if (tv && tv !== "-") { tv = text(t, tv); if (tv) setText(el, t, tv); }
    }
    el.setAttribute(DONE, "1");
  }
  function apply(root) {
    if (!S || !W.document) return;
    /* English: the new Arabic address / operator texts get their English twin from the same settings */
    if (W.MIGOVL && MIGOVL.trFill) {
      var tr = {}; ["address", "operator", "operator_reg"].forEach(function (b) { var a = get(b + "_ar"), e = get(b + "_en"); if (a && e && a !== "-" && e !== "-") tr[neutral(a)] = neutral(e); });
      MIGOVL.trFill(tr);
    }
    var r = root && root.querySelectorAll ? root : document;
    [].forEach.call(r.querySelectorAll("[data-mig-setting]"), function (el) { try { one(el); } catch (e) { /* one element */ } });
    /* <a data-mig-map="address_ar">: the map link is built from the address text itself (no coordinates) */
    [].forEach.call(r.querySelectorAll("a[data-mig-map]"), function (el) {
      var v = get(el.getAttribute("data-mig-map"));
      if (v && v !== "-") { v = neutral(v).slice(0, 300); if (v) el.setAttribute("href", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v + "، مصر")); }
    });
  }
  function start(data) {
    if (S || !data || !data.settings || typeof data.settings !== "object") return;
    S = data.settings;
    apply();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(); });
  }
  W.MIGSETTINGS = { get: function (k) { var v = get(k); return v === "-" ? "" : v; }, apply: apply, seed: SEED };
  if (W.MIGOVL && MIGOVL.onData) MIGOVL.onData(start); else start(W.MIGOVL_DATA);
})();
