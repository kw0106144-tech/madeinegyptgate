/* Analytics loader loaded on every page (structured data is written into each page's HTML at build time by seo_build.part.py,
   so nothing is built here at run time any more).
   MIGSEOCFG: analytics / tag managers / webmaster verification — fill the IDs on the live site; nothing loads while an ID is empty.
   Security: no third-party tag runs on the private pages (dashboard, requests console, advisor, SEO workspace, admin) or for a
   visitor with a platform session — a tag manager could otherwise read the session token in localStorage. */
window.MIGSEOCFG = {
  google_site_verification: "",   // Google Search Console
  bing_verification: "",          // Bing Webmaster Tools (msvalidate.01)
  yandex_verification: "",        // Yandex Webmaster
  facebook_domain_verification: "",
  pinterest_verification: "",
  gtm: "",                        // Google Tag Manager  GTM-XXXXXXX
  ga4: "",                        // Google Analytics 4  G-XXXXXXXXXX
  google_ads: "",                 // AW-XXXXXXXXX
  clarity: "",                    // Microsoft Clarity
  meta_pixel: "",                 // Meta (Facebook/Instagram) Pixel
  snap_pixel: "",                 // Snapchat Pixel
  tiktok_pixel: "",               // TikTok Pixel
  linkedin_partner: "",           // LinkedIn Insight Tag
  x_pixel: "",                    // X (Twitter) Pixel
  hotjar: ""                      // Hotjar site id
};
(function () {
  var C = window.MIGSEOCFG, H = document.head;
  function meta(n, v) { if (!v) return; var m = document.createElement("meta"); m.setAttribute("name", n); m.content = v; H.appendChild(m); }
  meta("google-site-verification", C.google_site_verification); meta("msvalidate.01", C.bing_verification); meta("yandex-verification", C.yandex_verification);
  meta("facebook-domain-verification", C.facebook_domain_verification); meta("p:domain_verify", C.pinterest_verification);
  window.MIGTRACK = function () {};
  /* private pages and signed-in visitors: no third-party tags at all */
  var PRIV = { dashboard: 1, inbox: 1, advisor: 1, "seo-admin": 1, admin: 1, panel: 1, login: 1, track: 1, meeting: 1, pay: 1, "seo-team": 1, "data-desk": 1 };
  var pg = window.MIGPAGE || (location.pathname.replace(/\/+$/, "").split("/").pop() || "home").replace(/\.html?$/, "");
  var signed = false; try { signed = !!localStorage.getItem("mig-tok"); } catch (e) {}
  if (PRIV[pg] || signed) return;
  function js(src) { var s = document.createElement("script"); s.async = true; s.src = src; H.appendChild(s); }
  /* Tags only load when an ID is set (the live site). Track key events with MIGTRACK(name, params). */
  if (C.gtm) { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" }); js("https://www.googletagmanager.com/gtm.js?id=" + C.gtm); }
  if (C.ga4 || C.google_ads) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag("js", new Date()); if (C.ga4) window.gtag("config", C.ga4); if (C.google_ads) window.gtag("config", C.google_ads); js("https://www.googletagmanager.com/gtag/js?id=" + (C.ga4 || C.google_ads)); }
  if (C.clarity) { window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); }; js("https://www.clarity.ms/tag/" + C.clarity); }
  if (C.meta_pixel) { window.fbq = window.fbq || function () { (window.fbq.q = window.fbq.q || []).push(arguments); }; window.fbq("init", C.meta_pixel); window.fbq("track", "PageView"); js("https://connect.facebook.net/en_US/fbevents.js"); }
  if (C.snap_pixel) { window.snaptr = window.snaptr || function () { (window.snaptr.q = window.snaptr.q || []).push(arguments); }; window.snaptr("init", C.snap_pixel); window.snaptr("track", "PAGE_VIEW"); js("https://sc-static.net/scevent.min.js"); }
  if (C.tiktok_pixel) { js("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + C.tiktok_pixel); }
  if (C.linkedin_partner) { window._linkedin_partner_id = C.linkedin_partner; js("https://snap.licdn.com/li.lms-analytics/insight.min.js"); }
  if (C.x_pixel) { js("https://static.ads-twitter.com/uwt.js"); }
  if (C.hotjar) { window.hj = window.hj || function () { (window.hj.q = window.hj.q || []).push(arguments); }; window._hjSettings = { hjid: C.hotjar, hjsv: 6 }; js("https://static.hotjar.com/c/hotjar-" + C.hotjar + ".js?sv=6"); }
  window.MIGTRACK = function (name, params) {
    try {
      var p = params || {}, ev = { event: name }, k;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) ev[k] = p[k];
      if (window.gtag) window.gtag("event", name, p);
      if (window.dataLayer) window.dataLayer.push(ev);
      if (window.fbq) window.fbq("trackCustom", name, p);
      if (window.snaptr) window.snaptr("track", "CUSTOM_EVENT_1");
    } catch (e) {}
  };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a,button") : null; if (!a) return;
    var t = (a.textContent || "").replace(/^\s+|\s+$/g, "").slice(0, 40), h = a.getAttribute("href") || "";
    if (/register(\.html|\/)/.test(h) || /سجّل|التسجيل|Regist/i.test(t)) window.MIGTRACK("sign_up_click", { label: t });
    else if (/wa\.me/.test(h)) window.MIGTRACK("whatsapp_click");
    else if (/طلب سعر|عرض سعر|RFQ|Quot/i.test(t)) window.MIGTRACK("rfq_click", { label: t });
    else if (/tender|procure/i.test(h)) window.MIGTRACK("tender_source_click");
  });
})();
