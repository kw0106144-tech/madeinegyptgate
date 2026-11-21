/* «جنة لايف» — live video Janna (Anam real-time avatar) with her own "screen".
   The visitor opens a full-screen black stage: on the right Janna talks live (voice + real lip movement + emotions, Egyptian
   Arabic / English), on the left her "screen" shows the platform in a same-origin iframe that she drives with client tools:
   janna_navigate / janna_search / janna_fill_rfq / janna_fill_contact / janna_fill_registration / janna_submit_form /
   janna_book_meeting, plus the meeting tools (optional Turnstile: window.MEETINGS_TURNSTILE_SITEKEY):
   - janna_start_meeting {name, email, phone?, company?, activity?, markets?, language?, recording_consent} → MEETING MODE in the
     same overlay: «اجتماع تعريفي مع جنة» header, recording badge + elapsed timer (sessions are capped at 10 min on the current
     plan: gentle warning at 8:00), agenda checklist ticked from tool calls / what is said (or by hand), POST /api/meetings/start,
     and on session end POST /api/meetings/{id}/finish → the visitor gets the recording + summary by email (Worker meetings.js).
     Scheduled meetings: the consent shown is the one the Worker answers on /join (an unticked box withdraws it); closing
     before a session started promises nothing (no /finish).
   - janna_schedule_meeting {name, email, phone?, company?, date, time, topic?, language?} (Egypt time) → POST /api/meetings and a
     confirmation card (.ics «أضف للتقويم», WhatsApp share); offline: prefilled WhatsApp / e-mail to the platform team.
   Personas: JANNA_LIVE.open() → Janna (AR/EN by MIGLANG); JANNA_LIVE.open({persona:"bassem"}) → «باسم · مستشار أعمالك»
   (members' business advisor; tools janna_navigate + janna_search). meeting.html calls JANNA_LIVE.open({meeting:{id,…}}).
   The live session survives navigation because only the iframe changes. Forms are filled for the visitor but only sent
   after they confirm (the persona calls janna_submit_form). Never touches card fields or file uploads.
   Persona + tools live in Anam Lab (persona ids below); the site's origin must be in each persona's Allowed Domains.
   All UI text is bilingual in code: T(ar, en). Works without the API (static preview): everything stays local.
   Phase A (action layer, same API as the buttons — data/mig-forms.js / data/mig-api.js):
   - janna_submit_form clicks the form's own submit button; the screen's MIGINQ fires "mig:inquiry" and ONLY a server answer with a
     ref is announced as sent ("✅ اتبعت برقم …", with the true number of factories it was routed to); otherwise the real error.
   - janna_fill_rfq on a factory / company page addresses the RFQ to that factory (sessionStorage "mig-rfq-to").
   - janna_follow {kind?, id?, label?} (defaults to what is on the screen: window.MIG_CTX) → MIGAPI.follow · janna_track {ref, last4}.
   - Bassem's tools (BACKLOG item 11) drive advisor.html through its own controls (#advQ, [data-how], [data-start], [data-open],
     #advPlan, #advStg, [data-dtab], #mTo #mSub #mBody #mLang #mSend): bassem_open_opportunity, bassem_start_deal,
     bassem_draft_email, bassem_send_email (only after the member said yes; FROM THE PLATFORM — the deal room's button, or POST
     /api/advisor/send, which starts the opportunity's deal; both answer Bassem in the SDK call: «e-mails from the call» below),
     bassem_update_deal, bassem_open_guide; plus
     bassem_notify_member → POST /api/advisor/notify through sendPost with the call's own sign-in and up to 3 opportunities of the call, whose
     details, links and official file the platform adds to the e-mail (notifyGo) · bassem_set_work_time → MIGAPI.prefs (POST /api/me/prefs).
     When neither Bassem's screen nor advisor.html is open, the page navigates to advisor.html#bcmd=<json> and runs it there.
   - every tool call is also shown on the holographic workspace: MIGHOLO.act(tool, args, {who}).
   - JANNA_LIVE.open({intent:"meeting"}) opens Janna with the meeting card (JANNA_LIVE.intents = ["meeting"]).
   - No human step: nothing says "the team will contact you"; failures are stated as they are, with a Janna meeting as the fallback.
   Live calls without a third-party mark in the video (worker/src/janna-session.js): «ابدأ الكلام» asks the Worker for a short-lived Anam
   session token (POST /api/janna/session {agent, lang}; for Bassem with the member's own sign-in) and runs the call with the pinned Anam
   JS SDK (exact file + SRI) in this same call layout: our own AI label on the video from the first second («جنة · مساعِدة بالذكاء
   الاصطناعي» / "Janna · AI assistant", «باسم · مستشار بالذكاء الاصطناعي» / "Bassem · AI advisor"), microphone mute, a text box, end,
   the captions strip (data/captions.js) and the 10-minute limit the Worker sends (warning 2 minutes before). The SDK's events are
   re-dispatched on the call element as the widget's own DOM events (anam-agent:tool-call-started / session-started / session-ended /
   message-received), so every tool goes through the same run() and holo.js / captions.js see exactly what they see with the widget.
   No key on the Worker (503), no API (static preview), an Anam / network failure or an SDK file that cannot load → today's widget
   (agent-widget, SRI). A rate limit, the daily cap, a blocked network or a refused Bassem sign-in is said as it is (never the widget). */
(function () {
  /* the page widgets hidden on the call's shared screen (any page on it): Janna's and Bassem's figures, bubbles and pills, the old bot,
     the «اسأل جنة» pill (#seoAsk) and buttons ([data-ask]) of the generated pages and the Information Center — Janna never appears
     there, in Bassem's call or in her own — the WhatsApp float and the plan preview. Set by this file inside the screen (app pages) and
     by the call's page on every document the screen shows (scrHook: generated and /intel/ pages do not load this file). */
  var SCREEN_CSS = "[class^='jn-'],[class*=' jn-'],[class^='bs-'],[class*=' bs-'],body [class^='jw-'],body [class*=' jw-'],.jnl-btn,.sanad,.sanad-btn,.sanad-tip,#sdBox,.wa-float,.planpv,#seoAsk,.ask-btn,[data-ask]{display:none!important}"
    + "@supports selector(:has(a)){.ci:has([data-ask]){display:none!important}}";
  var inScreen = false; try { inScreen = window.top !== window && window.parent.__jannaLive === 1; } catch (e) {}
  if (inScreen) {
    /* inside Janna's screen: the local Janna engine must not start (janna-live.js loads before janna.js) and page widgets are hidden */
    window.__janna = 1; window.JANNA_EMBED = 1;
    var s0 = document.createElement("style"); s0.setAttribute("data-mig-scr", "1");
    s0.textContent = SCREEN_CSS;
    (document.head || document.documentElement).appendChild(s0);
    return;
  }
  if (window.__jannaLive) return; window.__jannaLive = 1;
  /* ---------- «باسم معاك» — owner 2026-11-19: «لما بفتح المناقصة اللي باسم فاتحا بتفتح صفحة تانيه فيها جنة والمفروض ان باسم بس هو اللي
     بيكمل». A page that leaves Bassem's live call («افتح الصفحة دي», a result's link, a same-site link on his shared screen that opens a new
     tab, ctrl / middle click included) opens in a tab of its own (openTab) and the call goes on here. That tab is HIS: no Janna there
     (no standing figure, invitation box, greeting, chat, «اسأل جنة» or call: data/janna-welcome.js, janna.js, bassem.js and
     bassem-stand.js read the same mark), no second call (open() brings the call's tab back instead) and a bar that leads back to the call
     (data/bassem-tab.js, loaded here or by janna-welcome.js). The tab carries the mark in window.name «mig-bassem-<ms>» (kept through the
     site's redirects) and ?with=bassem (taken out of the address at once); sessionStorage "mig-wb" (the opening time) keeps it for the
     tab's next pages, 4 h at most. Every page a visitor opens by himself keeps its Janna. ---------- */
  var WB_CSS = "body [class^='jn-'],body [class*=' jn-'],body [class^='jw-'],body [class*=' jw-'],body .bs-fig,body .bs-mini,body .bs-bub,body .bs-wel,body .bst-st,body .bst-sb,body .bst-hint,body .jnl-btn,body .sanad,body .sanad-btn,body .sanad-tip,#seoAsk,body .ask-btn,body [data-ask]{display:none!important}"
    + "@supports selector(:has(a)){body .ci:has([data-ask]){display:none!important}}";
  function wbOn() {
    var W = window, now = new Date().getTime(), t = 0, s = 0, m = null;
    if (W.MIG_WB === true || W.MIG_WB === false) return W.MIG_WB;
    try { m = /^mig-bassem-(\d{12,14})$/.exec(String(W.name || "")); } catch (e) {}
    if (m) t = +m[1];
    if (/[?&]with=bassem(?:&|$)/.test(location.search)) {
      if (!t) t = now;
      try { history.replaceState(history.state, "", location.pathname + location.search.replace(/([?&])with=bassem(&|$)/, function (x, a, b) { return b ? a : ""; }).replace(/[?&]$/, "") + location.hash); } catch (e) {}
    }
    try { s = +sessionStorage.getItem("mig-wb") || 0; if (t > s) sessionStorage.setItem("mig-wb", String(t)); } catch (e) {}
    if (!t) t = s;
    W.MIG_WB = t > 0 && now - t < 144e5 && now - t > -6e4;
    return W.MIG_WB;
  }
  var WB = wbOn();
  var EN = window.MIGLANG === "en";
  /* the platform's own app (user agent «MIGApp/<v> (ios|android)», app/): "ios" | "android" | "" — its own words where a browser's would
     mislead (the microphone is the app's, in the phone's settings), the consent card of the store rules (call_consent_app) — app parity plan */
  var INAPP = (function () { var u = navigator.userAgent || "", m = /\bMIGApp\/[^\s()]*\s*\((ios|android)\)/i.exec(u); return m ? m[1].toLowerCase() : /\bMIGApp\b/.test(u) ? (/iPhone|iPad|iPod/.test(u) ? "ios" : "android") : ""; })();
  function micAskTx() { return INAPP ? T("اسمح للتطبيق يستخدم الميكروفون علشان تتكلم مع ", "Allow the app to use the microphone so you can talk to ") : T("اسمح للمتصفح يستخدم الميكروفون علشان تتكلم مع ", "Allow the microphone so you can talk to "); }
  function micWhereTx() { return INAPP === "ios" ? T("الإعدادات ← صنع في مصر ← الميكروفون", "Settings → Made in Egypt → Microphone") : T("إعدادات الموبايل ← التطبيقات ← صنع في مصر ← الأذونات ← الميكروفون", "the phone's Settings → Apps → Made in Egypt → Permissions → Microphone"); }
  /* personas: the Arabic Janna listens in Egyptian Arabic (accurate STT), the English one serves ?lang=en pages; Bassem (Arabic) advises members */
  var AGENTS = { janna: EN ? "e5101653-65b4-44a6-85e5-ec2e78f82685" : "5f06d835-22cc-4460-b412-84cefa9e565b", bassem: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be" };
  /* the Anam widget: an exact, immutable file (not the package-root redirect) with Subresource Integrity — the page holds the platform
     session (localStorage "mig-tok"), so a changed third-party file must never run (security review L4) */
  var WIDGET = "https://unpkg.com/@anam-ai/agent-widget@0.8.0/dist/index.umd.js", WIDGET_SRI = "sha384-4Z4FU2wuqWvykHhn4qPvZSyoJJRV7yuRD7/PSD4DhSJvg0Z+vg8W/PH2s+rO9Yo8";
  /* the Anam JS SDK (window.anam) for calls without the widget: the same rule — an exact file with SRI, from jsDelivr and, if that cannot
     be reached, the same bytes from unpkg. 4.29.1 (on npm since 2026-10-19); the call below keeps one "session started" per call itself */
  var SDK_V = "4.29.1", SDK_SRI = "sha384-S+prKbl1DuQHFJl/uMWM/WVzZuZuToG2n+SqaNi51unIiPRH746eVdsfYGdAyYPf";
  var SDK_URLS = ["https://cdn.jsdelivr.net/npm/@anam-ai/js-sdk@" + SDK_V + "/dist/umd/anam.js", "https://unpkg.com/@anam-ai/js-sdk@" + SDK_V + "/dist/umd/anam.js"];
  var SESS_API = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "") + "/janna/session";
  /* sessionStorage: the Worker said "not configured" (no key / no endpoint) → this tab opens the widget directly for 30 minutes */
  var MODE_KEY = "mig-jnl-mode";
  var API = String(window.MEETINGS_API || "/api/meetings").replace(/\/+$/, "");
  var WA_TEAM = "201279188996", TEAM_MAIL = "info@madeinegyptgate.com", SITE = "https://madeinegyptgate.com/";
  /* optional Cloudflare Turnstile site key (only when the Worker has TURNSTILE_SECRET): window.MEETINGS_TURNSTILE_SITEKEY */
  var TS_KEY = String(window.MEETINGS_TURNSTILE_SITEKEY || "");
  var CAP_MIN = 120, WARN_SEC = 118 * 60; /* owner 2026-11-18: Anam Growth plan — no plan cap; the Worker allows 2 h per call (max_session_sec) */
  var T = function (ar, en) { return EN ? en : ar; };
  var GOV = { CAI: "القاهرة", GIZ: "الجيزة", ALX: "الإسكندرية", QLB: "القليوبية", SHR: "الشرقية", DKH: "الدقهلية", GHR: "الغربية", MNF: "المنوفية", BHR: "البحيرة", KFS: "كفر الشيخ", DMT: "دمياط", PTS: "بورسعيد", ISM: "الإسماعيلية", SUZ: "السويس", NSN: "شمال سيناء", JSN: "جنوب سيناء", FYM: "الفيوم", BNS: "بني سويف", MNY: "المنيا", AST: "أسيوط", SHG: "سوهاج", QNA: "قنا", LXR: "الأقصر", ASN: "أسوان", BBA: "البحر الأحمر", WAD: "الوادي الجديد", MTR: "مطروح" };
  var PAGES = { home: 1, factories: 1, market: 1, offers: 1, tenders: 1, rfqs: 1, projects: 1, suppliers: 1, region: 1, cities: 1, map: 1, news: 1, events: 1, winners: 1, "export-market": 1, intl: 1, about: 1, contact: 1, register: 1, legal: 1, radar: 1 };
  var SEARCH = { factories: ["#q", "#c"], market: ["#sq", null], tenders: ["#olQ", null], rfqs: ["#olQ", null], suppliers: ["#sq", "#se"], offers: ["#oq", "#ocity"], projects: ["#q", "#r"] };
  var NAMES = { home: ["الرئيسية", "Home"], factories: ["دليل المصانع", "Factory directory"], market: ["السوق", "Marketplace"], offers: ["العروض", "Offers"], tenders: ["المناقصات", "Tenders"], rfqs: ["طلبات الأسعار", "RFQs"], projects: ["المشاريع", "Projects"], suppliers: ["الموردين", "Suppliers"], region: ["المحافظات", "Governorates"], cities: ["المدن الصناعية", "Industrial cities"], map: ["الخريطة", "Map"], news: ["الأخبار", "News"], events: ["المعارض", "Exhibitions"], winners: ["الترسيات", "Contract awards"], "export-market": ["أسواق التصدير", "Export markets"], intl: ["المنصات الدولية", "International"], about: ["عن المنصة", "About"], contact: ["تواصل معنا", "Contact"], register: ["التسجيل", "Registration"], legal: ["المركز القانوني", "Legal"], radar: ["رادار الفرص", "Radar"] };
  var AGENDA = [["intro", "التعارف ونشاطك", "Introductions & your business"], ["platform", "المنصة والجهة المشغّلة", "The platform & its operator"], ["tour", "جولة على الشاشة", "Screen tour"], ["plan", "الباقة المناسبة ومستشارك باسم", "The right plan & your advisor Bassem"], ["questions", "أسئلتك", "Your questions"], ["register", "التسجيل", "Registration"]];
  /* clean URLs (deploy build): site.py pages live at /<key>/ under <base href="/"> and tell their key in window.MIGPAGE; "x.html" there
     only answers with a 301 to the SEO landing page (/factories/, /tenders/ … without the app or Janna), so the screen goes straight to
     the app pages. window.MIGPATHS {app, static} (if the build provides it) wins over this copy of seo/config.json. */
  var CLEAN = !!document.querySelector('base[href="/"]') || (!/\.html?$/i.test(location.pathname) && location.pathname !== "/") || /(^|\/)janna\.html$/i.test(location.pathname);
  var APPP = { factories: "/factories/search/", tenders: "/tenders/search/", rfqs: "/rfq/search/", winners: "/awards/search/", news: "/news/search/", events: "/events/calendar/", projects: "/projects/search/", offers: "/offers/search/", cities: "/industrial-zones/explore/", region: "/governorates/explore/" };
  var STP = { home: "/", rfqs: "/rfq/", winners: "/awards/", cities: "/industrial-zones/", region: "/governorates/", "export-market": "/export/", factory: "/factories/" };
  var SHIM = { company: 1, article: 1, event: 1, offer: 1, city: 1, project: 1, winner: 1, entity: 1, lead: 1, opportunity: 1, "export-market": 1 };
  function url(u) {
    u = String(u == null ? "" : u); if (!CLEAN) return u;
    var m = /^([\w-]+)\.html(\?[^#]*)?(#.*)?$/.exec(u); if (!m) return u;
    var k = m[1], q = m[2] || "", h = m[3] || "", P = window.MIGPATHS || {};
    if (k === "home" || k === "index") return "/" + q + h;
    var ap = (P.app || APPP)[k]; if (ap) return ap + q + h;
    if (SHIM[k] && h) return u; /* company.html#N … → the build's hash shim opens the record's clean URL */
    return ((P["static"] || STP)[k] || "/" + k + "/") + q + h;
  }
  /* the page key of a window (site.py: window.MIGPAGE); the file name only on an old flat build */
  function pageKey(w) { var k = ""; try { w = w || window; k = String(w.MIGPAGE || ""); if (!k) k = (w.location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, ""); } catch (e) {} return !k || k === "index" ? "home" : k; }

  /* the live call screen (owner: «شاشة الفيديو الحي أكبر»): a BIG video (~75vh on desktop, with a full-screen button; nearly the whole
     phone screen) framed by the office backdrop (img/office-backdrop.jpg); her "screen" with the platform sits beside it (wide screens)
     or under it (phones / 4:3), never shrinking the video. The captions get their own strip under the video (data/captions.js moves
     its box into .jnl-cap), so they never cover the widget's controls at the bottom of the video. */
  var css = ''
    + '.jnl-btn{position:fixed;z-index:64;right:14px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:8px;padding:9px 14px 9px 10px;border-radius:999px;border:1px solid rgba(120,220,255,.55);background:#04121a;color:#dff7ff;font:800 .86rem Cairo,Tajawal,Tahoma,sans-serif;cursor:pointer;box-shadow:0 0 22px -6px rgba(90,210,255,.9),0 10px 24px -12px rgba(0,0,0,.6)}'
    + '.jnl-btn i{width:9px;height:9px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 0 0 rgba(255,59,92,.6);animation:jnlRec 1.6s ease infinite}'
    + '@keyframes jnlRec{0%{box-shadow:0 0 0 0 rgba(255,59,92,.6)}70%{box-shadow:0 0 0 8px rgba(255,59,92,0)}100%{box-shadow:0 0 0 0 rgba(255,59,92,0)}}'
    /* members' tools (dashboard, requests monitor, advisor, meeting — data/janna.js sets html.jn-quiet): the pill sits at the bottom corner
       next to Janna's collapsed headshot, on the side away from the page's navigation (left in Arabic, right in English) */
    + 'html.jn-quiet .jnl-btn{top:auto;transform:none;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);right:14px;left:auto;width:64px;height:30px;padding:0;justify-content:center;gap:5px;font-size:0;line-height:1}html.jn-quiet.jn-qrtl .jnl-btn{right:auto;left:14px}'
    + 'html.jn-quiet .jnl-btn::after{content:"LIVE";font:800 .72rem/1 Cairo,Tajawal,Tahoma,sans-serif;letter-spacing:.04em}'
    /* the stage: office backdrop + a soft vignette; video column (me) on the right, meeting panel (mt) + screen (scr) on the left */
    + '.jnl{position:fixed;inset:0;z-index:2147483000;box-sizing:border-box;background:#05090c url(img/office-backdrop.jpg) 50% 40%/cover no-repeat;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr);grid-template-areas:"mt me" "scr me";column-gap:16px;padding:14px;font-family:Cairo,Tajawal,Tahoma,sans-serif;color:#dff7ff;overflow:hidden;'
    + '--jnl-vh:min(75vh,calc(100vh - 150px));--jnl-w:min(calc(var(--jnl-vh) * 1.5),calc(100vw - 440px))}'
    + '.jnl::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 70% at 72% 46%,rgba(5,9,12,.08),rgba(5,9,12,.62) 78%),linear-gradient(180deg,rgba(5,9,12,.25),rgba(5,9,12,.55))}'
    + '.jnl>*{position:relative}.jnl[hidden]{display:none}'
    + '.jnl-scr{grid-area:scr;display:flex;flex-direction:column;min-width:0;min-height:0;border-radius:18px;overflow:hidden;border:1px solid rgba(120,220,255,.35);box-shadow:0 0 50px -12px rgba(90,210,255,.55),0 30px 60px -30px rgba(0,0,0,.8);background:#fff}'
    + '.jnl-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#04121a;border-bottom:1px solid rgba(120,220,255,.25);font-size:.84rem}'
    + '.jnl-bar b{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jnl-bar button,.jnl-hd button{border:1px solid rgba(120,220,255,.45);background:rgba(4,18,26,.55);color:#bff3ff;border-radius:9px;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}'
    + '.jnl-bar .x,.jnl-hd .x{border-color:#c8102e;background:#c8102e;color:#fff}.jnl-bar .tv,.jnl-hd .sw{display:none}'
    + '.jnl-scr iframe{flex:1;width:100%;min-height:0;border:0;background:#fff}'
    + '.jnl-me{grid-area:me;width:var(--jnl-w);min-height:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}'
    + '.jnl-hd{display:flex;align-items:center;gap:10px;margin:0 0 8px;min-width:0}.jnl-hd .who{flex:1;min-width:0;display:flex;align-items:center;gap:9px}'
    + '.jnl-hd .who img{width:38px;height:38px;border-radius:50%;object-fit:cover;object-position:50% 18%;border:2px solid #e9c46a;flex:none}'
    + '.jnl-hd h3{margin:0;font-size:1.02rem;line-height:1.35;color:#fff;text-shadow:0 0 10px rgba(90,210,255,.7),0 1px 2px rgba(0,0,0,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jnl-hd p{margin:0;font-size:.76rem;color:#e9c46a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.8)}'
    + '.jnl-hd .acts{display:flex;gap:6px;flex:none}.jnl-hd .who .nm{min-width:0;overflow:hidden}'
    + '.jnl-mem{margin:-4px 0 8px;font-size:.76rem;line-height:1.5;color:#bff3ff;text-shadow:0 1px 2px rgba(0,0,0,.8)}.jnl.fs .jnl-mem{display:none}'
    /* review 2026-11-19 #17 / #18: the memory notice never takes a second line on phones, and on shorter screens it takes the tip's place */
    + '@media (max-width:820px){.jnl-mem{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}@media (max-height:840px){.jnl-mem~.jnl-tip{display:none}}'
    + '.jnl-me .v{position:relative;width:100%;flex:none;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 0 0 1px rgba(233,196,106,.38),0 28px 70px -22px rgba(0,0,0,.85),0 0 70px -16px rgba(90,210,255,.5)}'
    + '.jnl-me anam-agent{display:block;width:100%;--anam-sheet-height:var(--jnl-vh)}'
    /* the call through the SDK (no widget): the stream fills the stage height (object-fit: cover crops the sides of the 3:2 stream on a
       phone in portrait, as SHADOW_CSS does for the widget); before / after the call the persona waits in the office (real photo cutout) */
    + '.jnl-sdk{position:relative;width:100%;height:var(--jnl-vh);min-height:240px;overflow:hidden;background:#05090c url(img/office-backdrop.jpg) 50% 40%/cover no-repeat;color:#fff;font-family:Cairo,Tajawal,Tahoma,sans-serif}'
    + '.jnl-sdk::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(5,9,12,.28),rgba(5,9,12,0) 28%,rgba(5,9,12,0) 62%,rgba(5,9,12,.72))}'
    + '.jnl-sdk video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%;background:#000;opacity:0;transition:opacity .45s;z-index:1}.jnl-sdk.on video{opacity:1}'
    + '.jnl-sdk .jv-pst{position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:92%;width:auto;max-width:none;pointer-events:none;filter:drop-shadow(0 22px 36px rgba(0,0,0,.55));transition:opacity .45s}'
    + '.jnl-sdk[data-p="bassem"] .jv-pst{height:auto;width:calc(var(--jnl-vh) * .66);bottom:auto;top:7%}.jnl-sdk.on .jv-pst{opacity:0}'
    + '.jnl-sdk .jv-ai{position:absolute;z-index:3;top:12px;right:12px;display:inline-flex;align-items:center;gap:7px;max-width:calc(100% - 24px);padding:4px 12px 5px;border-radius:999px;background:rgba(4,18,26,.8);border:1px solid rgba(233,196,106,.65);font-weight:800;font-size:.8rem;line-height:1.5;color:#fff;pointer-events:none;box-shadow:0 6px 18px -8px rgba(0,0,0,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.jnl-sdk .jv-ai i{flex:none;width:8px;height:8px;border-radius:50%;background:#e9c46a;box-shadow:0 0 8px rgba(233,196,106,.9)}.jnl-sdk.on .jv-ai i{background:#2fd0a0;box-shadow:0 0 8px rgba(47,208,160,.9)}'
    + '.jnl-sdk .jv-st{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);width:max-content;max-width:min(88%,460px);padding:9px 16px;border-radius:14px;background:rgba(4,18,26,.86);border:1px solid rgba(120,220,255,.45);font-weight:700;font-size:.9rem;line-height:1.7;text-align:center}.jnl-sdk .jv-st:empty{display:none}'
    + '.jnl-sdk .jv-st.wait::before{content:"";display:inline-block;width:12px;height:12px;margin-inline-end:8px;vertical-align:-1px;border-radius:50%;border:2px solid rgba(191,243,255,.35);border-top-color:#bff3ff;animation:jnlSpin .9s linear infinite}@keyframes jnlSpin{to{transform:rotate(360deg)}}'
    + '.jnl-sdk .jv-acts{position:absolute;z-index:3;left:0;right:0;bottom:max(18px,4%);display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:0 12px}.jnl-sdk .jv-acts[hidden],.jnl-sdk .jv-ctl[hidden]{display:none}'
    + '.jnl-sdk .jv-go{display:inline-flex;align-items:center;gap:9px;border:0;border-radius:999px;padding:12px 22px;background:#0b5d47;color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 0 0 3px rgba(233,196,106,.55),0 16px 30px -12px rgba(0,0,0,.8)}.jnl-sdk .jv-go:hover{background:#0d6e54}'
    + '.jnl-sdk .jv-go i{width:10px;height:10px;border-radius:50%;background:#ff3b5c;animation:jnlRec 1.6s ease infinite}.jnl-sdk .jv-go2{border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:10px 16px;background:rgba(4,18,26,.7);color:#fff;font:inherit;font-weight:700;font-size:.86rem;cursor:pointer}'
    + '.jnl-sdk .jv-ctl{position:absolute;z-index:3;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:10px 12px 12px}'
    + '.jnl-sdk .jv-ctl button{flex:none;min-width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(4,18,26,.78);color:#fff;font:inherit;font-weight:800;font-size:.9rem;cursor:pointer;padding:0 12px}'
    + '.jnl-sdk .jv-ctl .jv-mic[aria-pressed="true"]{background:#8E0B20;border-color:#ff9aa9}.jnl-sdk .jv-ctl .jv-end{background:#c8102e;border-color:#c8102e}.jnl-sdk .jv-ctl button:disabled{opacity:.5;cursor:default}'
    + '.jnl-sdk .jv-ctl form{flex:1;min-width:0;display:flex;gap:6px;margin:0}.jnl-sdk .jv-ctl input{flex:1;min-width:0;height:44px;box-sizing:border-box;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(4,18,26,.78);color:#fff;font:inherit;font-size:.9rem;padding:0 13px}'
    + '.jnl-sdk .jv-ctl input::placeholder{color:rgba(223,247,255,.7)}.jnl-sdk[dir="rtl"] .jv-snd{transform:scaleX(-1)}.jnl-sdk button:focus-visible,.jnl-sdk input:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}'
    /* «وضع الدوشة» (noise guard, owner 2026-11-19): a small chip pinned just above the call's control bar (nzPlace). It lives on <body>, above
       the hologram layer (holo.js .mgh, z-index 2147483500 — on short phones its panels run down to the controls by design), so ✋ is never
       hidden; it steps aside while the platform's sign-in dialog is open (html.mig-modal). ✋ «استنى» lights up while the persona talks */
    + '.jnl-nzf{position:fixed;z-index:2147483550;display:flex;justify-content:center;pointer-events:none;box-sizing:border-box;font-family:Cairo,Tajawal,Tahoma,sans-serif}.jnl-nzf[hidden],html.mig-modal .jnl-nzf{display:none!important}'
    + '.jnl-nzf .jv-nz{pointer-events:auto;width:max-content;max-width:100%;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 8px;padding:7px 10px;border-radius:16px;background:rgba(4,18,26,.94);border:1px solid rgba(233,196,106,.65);color:#fff;font-weight:700;font-size:.8rem;line-height:1.55;text-align:center;box-shadow:0 12px 28px -14px rgba(0,0,0,.85)}'
    + '.jnl-nzf .jv-nz span{flex:1 1 220px;min-width:0}.jnl-nzf button{flex:none;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:rgba(4,18,26,.75);color:#fff;font:inherit;font-weight:800;font-size:.84rem;padding:0 14px;cursor:pointer}'
    + '.jnl-nzf .nz-hand,.jnl-nzf .nz-on{background:#0b5d47;border-color:#e9c46a}.jnl-nzf .jv-nz.hd .nz-hand{box-shadow:0 0 0 3px rgba(233,196,106,.6)}.jnl-nzf .nz-x{width:40px;padding:0}.jnl-nzf button:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}'
    /* 🌐 the language the person speaks (langUi): the button beside 🎙️, its link under «ابدأ», its menu over the video, its chip (the noise
       chip's look, stacked above it: langPlace) */
    + '.jnl-sdk .jv-ctl .jv-lang{position:relative;width:44px;padding:0;font-size:1.05rem}.jnl-sdk .jv-ctl .jv-lang b{position:absolute;bottom:2px;inset-inline-end:1px;min-width:16px;box-sizing:border-box;padding:0 3px;border-radius:7px;background:#0b5d47;border:1px solid #e9c46a;font-size:.56rem;line-height:1.35;letter-spacing:.02em}.jnl-sdk .jv-ctl .jv-lang[hidden],.jnl-sdk .jv-lgo[hidden]{display:none}'
    + '.jnl-sdk .jv-lgo{flex:0 0 100%;box-sizing:border-box;margin:0;border:0;background:none;padding:2px 8px;color:#dff7ff;font:inherit;font-weight:700;font-size:.84rem;text-decoration:underline;text-underline-offset:3px;text-shadow:0 1px 3px rgba(0,0,0,.95);cursor:pointer}'
    + '.jnl-sdk .jv-lgm{position:absolute;z-index:6;top:52px;bottom:72px;left:50%;transform:translateX(-50%);width:min(420px,calc(100% - 20px));display:flex;flex-direction:column;gap:8px;box-sizing:border-box;padding:10px 12px;border-radius:16px;background:rgba(4,18,26,.96);border:1px solid rgba(233,196,106,.65);box-shadow:0 18px 44px -16px rgba(0,0,0,.85);color:#fff}'
    + '.jnl-sdk .jv-lgm .lgm-h{display:flex;align-items:center;gap:8px}.jnl-sdk .jv-lgm .lgm-h b{flex:1;min-width:0;font-size:.86rem;line-height:1.5}.jnl-sdk .jv-lgm .lgm-x{flex:none;width:36px;height:36px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;font:inherit;cursor:pointer}'
    + '.jnl-sdk .jv-lgm .lgm-q{flex:none;height:40px;box-sizing:border-box;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:.9rem;padding:0 14px}.jnl-sdk .jv-lgm .lgm-q::placeholder{color:rgba(223,247,255,.7)}'
    + '.jnl-sdk .jv-lgm ul{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start;overscroll-behavior:contain}'
    + '.jnl-sdk .jv-lgm li[hidden]{display:none}.jnl-sdk .jv-lgm li button{width:100%;min-height:44px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;box-sizing:border-box;padding:4px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-weight:800;font-size:.9rem;cursor:pointer;text-align:start}'
    + '.jnl-sdk .jv-lgm li button small{font-weight:600;font-size:.72rem;color:#bff3ff}.jnl-sdk .jv-lgm li button[aria-selected="true"]{border-color:#e9c46a;background:rgba(11,93,71,.75)}'
    + '.jnl-sdk .jv-lgm .lgm-n{margin:0;font-size:.74rem;line-height:1.6;color:#cfe6ee}.jnl-sdk .jv-lgm button:focus-visible,.jnl-sdk .jv-lgm input:focus-visible,.jnl-sdk .jv-lgo:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}'
    + 'html.jnl-lgm-on .jnl-nzf{display:none!important}.jnl-lgf .jv-lg span{flex:0 1 auto}.jnl-lgf .jv-lg bdi{font-weight:800}.jnl-lgf .lg-yes,.jnl-lgf .lg-back{background:#0b5d47;border-color:#e9c46a}.jnl-lgf .lg-yes,.jnl-lgf .lg-no,.jnl-lgf .lg-x{width:40px;padding:0}'
    /* the platform's sign-in box (data/mig-api.js) must show above the call when Bassem's call asks for a sign-in */
    + 'html.jnl-on .mig-dlg{z-index:2147483300}'
    + '.jnl-cap{min-height:54px;margin-top:10px;display:flex;align-items:flex-start;justify-content:center;gap:8px}'
    + '.jnl .jnl-cap .mig-cc{position:relative;left:auto;right:auto;bottom:auto;top:auto;transform:none;max-width:100%;flex:0 1 auto;z-index:auto}.jnl .jnl-cap .mig-ccbtn{position:static;flex:none;align-self:center}'
    + '.jnl-tip{margin-top:4px;font-size:.8rem;line-height:1.8;color:#cfe6ee;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.85)}'
    + '.jnl-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:4;background:rgba(4,18,26,.92);color:#dff7ff;border:1px solid rgba(120,220,255,.45);border-radius:12px;padding:7px 14px;font-size:.84rem;font-weight:700;pointer-events:none;opacity:0;transition:opacity .3s;max-width:90%;text-align:center}.jnl-toast.on{opacity:1}'
    /* full screen: the video alone (the whole page goes full screen, so the captions and the hologram stay visible) */
    + '.jnl.fs{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:"me";justify-items:center;--jnl-vh:calc(100vh - 140px);--jnl-w:min(calc(var(--jnl-vh) * 1.5),calc(100vw - 28px))}'
    + '.jnl.fs .jnl-scr,.jnl.fs .jnl-mt,.jnl.fs .jnl-tip{display:none!important}'
    /* meeting mode */
    + '.jnl.mtg .jnl-tip{display:none}'
    + '.jnl-mt{grid-area:mt;margin:0 0 12px;border:1px solid rgba(120,220,255,.35);border-radius:14px;background:rgba(4,18,26,.9);padding:10px 12px;display:flex;flex-direction:column;gap:7px;font-size:.84rem;line-height:1.6}'
    + '.jnl-mt[hidden]{display:none}.jnl-mt .jm-who,.jnl-mt .jm-cap,.jnl-mt .jm-st{display:block}.jnl-mt bdi{display:inline}.jnl-card .jc-when,.jnl-card .jc-sm{display:block}'
    + '.jnl-mt .jm-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.jnl-mt .jm-h b{flex:1 1 auto;font-size:.95rem;color:#fff}'
    + '.jnl-mt .jm-rec{display:inline-flex;align-items:center;gap:6px;background:rgba(255,59,92,.14);color:#ff9aa9;border:1px solid rgba(255,59,92,.5);border-radius:99px;padding:1px 10px;font-weight:800;font-size:.76rem}'
    + '.jnl-mt .jm-rec i{width:8px;height:8px;border-radius:50%;background:#ff3b5c;animation:jnlRec 1.6s ease infinite}'
    + '.jnl-mt .jm-rec.off{background:rgba(255,255,255,.08);color:#b9c7cc;border-color:rgba(255,255,255,.25)}.jnl-mt .jm-rec.off i{background:#8a9aa0;animation:none}'
    + '.jnl-mt .jm-tm{font:800 .9rem/1 ui-monospace,Menlo,Consolas,monospace;color:#bff3ff;direction:ltr;unicode-bidi:isolate}'
    + '.jnl-mt .jm-warn{background:#e9c46a;color:#1a1204;border-radius:99px;padding:1px 10px;font-weight:800;font-size:.76rem}.jnl-mt .jm-warn[hidden]{display:none}'
    + '.jnl-mt .jm-who{color:#9fc9d6;font-size:.8rem;overflow-wrap:anywhere}.jnl-mt .jm-who bdi{color:#dff7ff;font-weight:700}'
    + '.jnl-mt .jm-cap{color:#7fa6b3;font-size:.74rem}'
    + '.jnl-mt ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 10px}'
    + '.jnl-mt li label{display:flex;gap:7px;align-items:flex-start;cursor:pointer;color:#cfe9f1}.jnl-mt li input{accent-color:#2fd0a0;margin-top:4px;flex:none}.jnl-mt li.done label{color:#7fe3c0;text-decoration:line-through;text-decoration-color:rgba(127,227,192,.5)}'
    + '.jnl-mt .jm-st{color:#e9c46a;font-weight:700;font-size:.8rem}.jnl-mt .jm-st:empty{display:none}.jnl-mt .jm-st.ok{color:#7fe3c0}'
    /* confirmation card (scheduled meeting) on Janna\'s screen */
    + '.jnl-card{position:absolute;inset:auto 16px 16px 16px;margin:auto;max-width:460px;z-index:3;background:#fff;color:#1d2a30;border-radius:16px;box-shadow:0 24px 60px -20px rgba(0,0,0,.55),0 0 0 1px rgba(4,18,26,.08);padding:16px 18px;display:flex;flex-direction:column;gap:8px;font-size:.9rem;line-height:1.7}'
    + '.jnl-card h4{margin:0;font-size:1.05rem;color:#0b5d47;padding-inline-end:28px}.jnl-card h4.jc-er{color:#8E0B20}.jnl-card .jc-when{font-weight:800;color:#04121a}.jnl-card .jc-sm{color:#5b6b72;font-size:.82rem}'
    + '.jnl-card .jc-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.jnl-card .jc-acts a{display:inline-flex;align-items:center;gap:5px;text-decoration:none;border-radius:10px;padding:6px 12px;font-weight:800;font-size:.84rem;border:1px solid #cfdde2;color:#04121a;background:#f4f8f9}.jnl-card .jc-acts a.jc-p{background:#0b5d47;border-color:#0b5d47;color:#fff}.jnl-card .jc-acts a.jc-wa{background:#1f9e55;border-color:#1f9e55;color:#fff}'
    + '.jnl-card .jc-cx{position:absolute;top:8px;inset-inline-end:8px;width:28px;height:28px;border-radius:50%;border:0;background:#eef3f5;cursor:pointer;font-size:.9rem;color:#04121a}'
    + '.jnl-note{position:fixed;z-index:2147483001;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(92vw,520px);background:#04121a;color:#dff7ff;border:1px solid rgba(120,220,255,.5);border-radius:14px;padding:10px 16px;font:700 .88rem/1.7 Cairo,Tajawal,Tahoma,sans-serif;box-shadow:0 18px 40px -16px rgba(0,0,0,.6);text-align:center}'
    + '@media (max-height:760px){.jnl-tip{display:none}}'
    /* stacked (phones, tablets in portrait, 4:3 screens): the video first, as large as the screen allows; the screen under it (scroll, or
       the «الشاشة» button); the call bar's «الفيديو» button scrolls back up */
    + '@media (max-width:820px),(max-aspect-ratio:3/2){.jnl{display:block;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px;--jnl-vh:min(75vh,calc(100vh - 150px));--jnl-w:min(calc(100vw - 20px),calc(var(--jnl-vh) * 1.5))}'
    + '.jnl-me{margin:0 auto;overflow:visible;justify-content:flex-start;min-height:calc(100vh - 20px)}.jnl-hd .sw,.jnl-bar .tv{display:inline-block}'
    + '.jnl-scr{height:calc(100vh - 20px);margin-top:12px}.jnl-mt{margin:12px 0 0}.jnl-mt ul{grid-template-columns:1fr 1fr}'
    + '.jnl-toast{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);bottom:auto}.jnl.fs{overflow:hidden}.jnl.fs .jnl-me{min-height:0}'
    + '.jnl-hd .sw.new{animation:jnlPing 1.2s ease 3}@keyframes jnlPing{50%{box-shadow:0 0 0 6px rgba(120,220,255,.35)}}}'
    + '@media (max-width:820px){.jnl{--jnl-vh:calc(100vh - 150px);--jnl-w:calc(100vw - 20px)}.jnl.fs{--jnl-vh:calc(100vh - 120px);--jnl-w:calc(100vw - 20px)}.jnl-tip{display:none}.jnl-hd p,.jnl-hd .role,.jnl-hd .lb{display:none}.jnl-hd h3{font-size:.95rem}.jnl-hd .acts button{min-width:38px;padding:5px 9px}'
    + '.jnl .jnl-cap .mig-cc{font-size:.9rem;line-height:1.6;padding:6px 12px 7px}'
    + '.jnl-bar{font-size:.78rem;padding:7px 9px}.jnl-bar .go{display:none}.jnl-btn{top:auto;transform:none;bottom:calc(env(safe-area-inset-bottom,0px) + 150px);right:auto;left:10px;padding:7px 11px 7px 9px;font-size:.78rem}html.jn-quiet .jnl-btn{bottom:calc(env(safe-area-inset-bottom,0px) + 86px);right:14px;left:auto;padding:0;font-size:0}html.jn-quiet.jn-qrtl .jnl-btn{right:auto;left:14px}'
    + '.jnl-mt{padding:8px 10px;gap:5px;font-size:.78rem}.jnl-mt .jm-cap{display:none}.jnl-mt ul{display:flex;flex-wrap:wrap;gap:4px}.jnl-mt li label{border:1px solid rgba(120,220,255,.25);border-radius:99px;padding:0 8px 0 6px;font-size:.74rem}.jnl-mt li input{margin-top:3px}.jnl-card{inset:auto 10px 10px 10px;padding:12px 14px;font-size:.84rem}}'
    + '@supports (height:100svh){@media (max-width:820px){.jnl{--jnl-vh:calc(100svh - 150px)}.jnl.fs{--jnl-vh:calc(100svh - 120px)}.jnl-me{min-height:calc(100svh - 20px)}.jnl-scr{height:calc(100svh - 20px)}}}'
    + '@media (prefers-reduced-motion:reduce){.jnl-hd .sw.new,.jnl-sdk .jv-go i,.jnl-sdk .jv-st.wait::before{animation:none}.jnl-sdk video,.jnl-sdk .jv-pst{transition:none}}';
  /* inside the widget's (open) shadow root: the video region takes the stage height, so on a phone in portrait the 3:2 stream fills the
     screen (object-fit: cover crops the sides) — without access to it the widget keeps its own 3:2 frame */
  var SHADOW_CSS = ".anam-video-region{aspect-ratio:auto!important;height:var(--jnl-vh,auto)!important;max-height:none!important}.anam-sheet{border-radius:18px!important}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  /* Bassem's tab («باسم معاك» above): Janna's engine (data/janna.js, loaded after this file) does not start, her widgets stay hidden, the
     «جنة لايف» pill is not added, and the bar back to the call comes (data/bassem-tab.js) */
  if (WB) wbStart();
  function wbStart() {
    var de = document.documentElement; de.classList.add("mig-wb"); window.__janna = 1;
    if (!document.getElementById("mig-wb-css")) { var s = document.createElement("style"); s.id = "mig-wb-css"; s.textContent = WB_CSS; (document.head || de).appendChild(s); }
    if (window.MIG_WB_TAB || document.querySelector("script[data-wb]")) return;
    var me = document.querySelector('script[src*="data/janna-live.js"]'), src = me ? me.src : "", v = /[?&]v=([\w.-]+)/.exec(src);
    var sc = document.createElement("script"); sc.src = (src ? src.replace(/data\/janna-live\.js.*$/, "") : "") + "data/bassem-tab.js" + (window.MIGVER_WB || (v ? "?v=" + v[1] : "")); sc.async = true; sc.charset = "utf-8"; sc.setAttribute("data-wb", "1");
    (document.head || de).appendChild(sc);
  }
  /* is the call that opened this tab still on? "live" · "ended" (its tab closed, gone to another site, or no Bassem call there any
     more) · "unknown" (no opener to ask) — data/bassem-tab.js asks the same */
  function wbCall() {
    var o = null; try { o = window.opener; } catch (e) { return "unknown"; }
    if (!o) { try { if (/^mig-bassem-\d+$/.test(String(window.name || ""))) return "ended"; } catch (e) {} return "unknown"; } /* its call's tab was closed (Chrome: opener → null; data/bassem-tab.js state()) */
    if (o === window) return "unknown";
    try { if (o.closed) return "ended"; var J = o.JANNA_LIVE; return J && J.isOpen && J.isOpen() && J.persona() === "bassem" ? "live" : "ended"; } catch (e) { return "ended"; }
  }
  /* never a second call from his tab: the call's tab comes back (the bar's back(): opener.focus() from the member's tap) — once that call
     is known to be over the mark is dropped (this tab is an ordinary one from its next page) and a call may start here as anywhere */
  function wbHold() {
    if (!WB || window.MIG_WB === false) return false; /* the bar (data/bassem-tab.js end()) already dropped the mark: the call is over */
    if (wbCall() === "ended") { var B0 = window.MIG_WB_TAB; if (B0 && B0.end) B0.end(); else { try { sessionStorage.removeItem("mig-wb"); } catch (e) {} try { if (/^mig-bassem-/.test(window.name)) window.name = ""; } catch (e) {} } WB = false; window.MIG_WB = false; return false; }
    var B = window.MIG_WB_TAB;
    if (B && B.back) { try { B.back(); } catch (e) {} return true; }
    try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (e) {}
    return true;
  }

  var btn = document.createElement("button"); btn.type = "button"; btn.className = "jnl-btn"; btn.setAttribute("translate", "no");
  btn.innerHTML = "<i></i>" + T("جنة لايف · كلّميها فيديو", "Janna LIVE · video chat"); btn.title = T("جنة لايف · كلّميها فيديو", "Janna LIVE · video chat"); btn.setAttribute("aria-label", btn.title); if (!WB) document.body.appendChild(btn);

  var ov = null, frame = null, title = null, toast = null, pending = null, tt = 0, persona = "janna", SID = "", sessT0 = 0, MT = null, NUDGE = "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function say(msg) { if (!toast) return; toast.textContent = msg; toast.classList.add("on"); clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove("on"); }, 2600); }
  /* the site's language is shared through localStorage "mig-lang" (data/i18n.js); ?lang=en is only added when that is not available
     (on the clean-URL build ?lang=en answers with a 301 that can drop the page into its SEO twin) */
  function lsLang() { try { return localStorage.getItem("mig-lang") || ""; } catch (e) { return ""; } }
  function withLang(u) { if (!EN || /[?&]lang=en\b/.test(u) || (CLEAN && lsLang() === "en")) return u; return u.replace(/^([^#]*)/, function (p) { return p + (p.indexOf("?") > -1 ? "&" : "?") + "lang=en"; }); }
  function who(ar, en) { return persona === "bassem" ? T(ar[1], en[1]) : T(ar[0], en[0]); }
  function build() {
    var B = persona === "bassem", name = who(["جنة", "باسم"], ["Janna", "Bassem"]), D2 = EN ? "ltr" : "rtl", SDKM = liveMode() === "sdk";
    ov = document.createElement("div"); ov.className = "jnl"; ov.setAttribute("translate", "no"); ov.dir = "ltr"; ov.setAttribute("data-persona", persona); ov.setAttribute("data-mode", SDKM ? "sdk" : "widget");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", who(["مكالمة فيديو مع جنة", "مكالمة فيديو مع باسم"], ["Video call with Janna", "Video call with Bassem"]));
    ov.innerHTML = '<aside class="jnl-me">'
      + '<div class="jnl-hd" dir="' + D2 + '"><div class="who"><div class="nm"><h3>' + esc(name) + '<span class="role"> · ' + who(["مساعدتك الذكية", "مستشار أعمالك"], ["your smart assistant", "your business advisor"]) + '</span></h3><p>' + who(["بتتكلم مصري وإنجليزي", "مستشارك الشخصي للفرص والصفقات طول السنة"], ["Speaks Egyptian Arabic & English", "Your personal advisor for opportunities & deals, all year"]) + '</p></div></div>'
      + '<div class="acts"><button type="button" class="sw" title="' + esc(who(["شاشة جنة", "شاشة باسم"], ["Janna's screen", "Bassem's screen"])) + '" aria-label="' + esc(who(["شاشة جنة", "شاشة باسم"], ["Janna's screen", "Bassem's screen"])) + '">🖥️<span class="lb"> ' + T("الشاشة", "Screen") + '</span></button><button type="button" class="fsb" aria-pressed="false" title="' + esc(T("ملء الشاشة", "Full screen")) + '" aria-label="' + esc(T("ملء الشاشة", "Full screen")) + '">⛶<span class="lb"> ' + T("ملء الشاشة", "Full screen") + '</span></button><button type="button" class="x">✕ ' + T("إنهاء", "End") + '</button></div></div>'
      /* owner 2026-11-18 23:50: Bassem's memory stays (no «امسح ذاكرتي»); the member is told it plainly */
      + (B && SDKM ? '<p class="jnl-mem" dir="' + D2 + '" title="' + esc(T("باسم فاكر شغلكم سوا علشان يكمّل معاك يوم بعد يوم", "Bassem remembers your work together, so he carries on with you day after day")) + '">🧠 ' + T("باسم فاكر شغلكم سوا علشان يكمّل معاك يوم بعد يوم", "Bassem remembers your work together") + '</p>' : "")
      /* 0009: Janna remembers her visitors too (no delete wording anywhere: the memory is permanent — owner 2026-11-18) */
      + (!B && SDKM ? '<p class="jnl-mem" dir="' + D2 + '" title="' + esc(T("جنة فاكرة كلامكم علشان تكمّل معاك", "Janna remembers your conversations so she can carry on with you")) + '">🧠 ' + T("جنة فاكرة كلامكم علشان تكمّل معاك", "Janna remembers your conversations") + '</p>' : "")
      + '<div class="v">' + (SDKM ? sdkHtml(name) : widgetHtml(name)) + '</div>'
      + '<div class="jnl-cap" dir="' + D2 + '"></div>'
      + '<div class="jnl-tip" dir="' + D2 + '">' + (B ? T("قوله مثلاً: «افتحلي المناقصات الجديدة» · «دوّرلي على طلبات أسعار للبلاستيك» · «وريني المشاريع في الخليج»", "Try: “open the new tenders” · “find RFQs for plastics” · “show me projects in the Gulf”") : T("قولها مثلاً: «وديني المناقصات» · «دوّري لي على مصانع بلاستيك في الشرقية» · «عايز أبعت طلب عرض سعر» · «سجّليلي مصنعي» · «عايز اجتماع تعريفي»", "Try: “take me to tenders” · “find plastic factories in Sharqia” · “I want to send a quote request” · “register my factory” · “I'd like an intro meeting”")) + '</div></aside>'
      + '<div class="jnl-mt" hidden dir="' + D2 + '"></div>'
      + '<section class="jnl-scr"><div class="jnl-bar" dir="' + D2 + '"><b>🖥️ ' + who(["شاشة جنة", "شاشة باسم"], ["Janna's screen", "Bassem's screen"]) + ' — <span class="jnl-t"></span></b><button type="button" class="tv">🎥 ' + T("الفيديو", "Video") + '</button><button type="button" class="go"' + (B ? ' title="' + esc(T("بتفتح في تاب جديدة، وباسم يفضل معاك في المكالمة هنا", "Opens in a new tab; Bassem stays with you on the call here")) + '"' : "") + '>' + T("افتح الصفحة دي", "Open this page") + '</button><button type="button" class="x">✕ ' + T("إنهاء", "End") + '</button></div><iframe title="' + (B ? "Bassem" : "Janna") + ' screen"></iframe><div class="jnl-toast" role="status" aria-live="polite"></div></section>';
    document.body.appendChild(ov);
    frame = ov.querySelector("iframe"); title = ov.querySelector(".jnl-t"); toast = ov.querySelector(".jnl-toast");
    frame.addEventListener("load", onLoad);
    [].forEach.call(ov.querySelectorAll(".x"), function (x) { x.onclick = close; });
    var uT = 0, lastTop = 0, mark = function () { uT = Date.now(); };
    ["touchstart", "touchmove", "wheel", "pointerdown", "keydown"].forEach(function (n) { ov.addEventListener(n, mark, { passive: true }); });
    ov.addEventListener("scroll", function () { if (Date.now() - uT < 1500) { lastTop = ov.scrollTop; return; } if (Math.abs(ov.scrollTop - lastTop) > 2) ov.scrollTop = lastTop; }, { passive: true });
    /* «افتح الصفحة دي»: Janna's call ends and this tab goes to the page; Bassem's call goes on here and the page opens in his own tab
       (openTab: no Janna there, the bar back to the call) — owner 2026-11-19 */
    ov.querySelector(".go").onclick = function () {
      var u = ""; try { u = frame.contentWindow.location.href; } catch (e) {}
      if (persona === "bassem") { if (!u || !/^https?:/i.test(u)) say(T("مقدرتش أفتح الصفحة دي في تاب جديدة — هي قدامك على الشاشة", "Couldn't open this page in a new tab — it is here on the screen")); else openTab(u); return; }
      close(); if (u) location.href = u;
    };
    clearInterval(scrT); scrT = setInterval(scrHook, 200);
    ov.querySelector(".fsb").onclick = function () { fullscreen(!ov.classList.contains("fs")); };
    ov.querySelector(".sw").onclick = function () { this.classList.remove("new"); var s2 = ov.querySelector(".jnl-scr"); if (s2) try { s2.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { s2.scrollIntoView(); } };
    ov.querySelector(".tv").onclick = function () { try { ov.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { ov.scrollTop = 0; } };
    /* the persona's round headshot beside the name (the same face as the live video: data/janna-real.js / bassem-real.js) */
    var hs = B ? ((window.BASSEM_REAL && BASSEM_REAL.headshot) || "img/bassem.jpg") : ((window.JANNA_REAL && JANNA_REAL.headshot) || "img/janna.jpg");
    var im = new Image(); im.onload = function () { var h = ov && ov.querySelector(".jnl-hd .who"); if (h && !h.querySelector("img")) { var c = im.cloneNode(); c.alt = ""; h.insertBefore(c, h.firstChild); } }; im.src = hs;
    if (SDKM) mountSdk(); else mountWidget();
  }
  /* ---------- the holographic screens (data/holo.js) — owner 2026-11-18 «مش بيفتح ليه سكرينات» ----------
     1) the call starts → the laptop opens and its screens show the member's REAL facts (Bassem) or the platform's sections (Janna)
     2) when he/she TALKS about a section (tenders, RFQs, projects, export markets…) that page opens on the shared screen with its
        hologram — once per section per call, one every 9 s at most, never right after a real tool call (the engine's own tools win) */
  var HT = { sec: {}, t: 0, tool: 0, buf: {}, t0: 0 };
  var HTOP = [
    ["tenders", /مناقص|\btenders?\b/i],
    ["rfqs", /طلبات?\s+(ال)?(عروض|تسعير|أسعار|اسعار)|عروض\s+(ال)?(أسعار|اسعار)|\bRFQs?\b/i],
    ["projects", /مشاريع|مشروعات|\bprojects\b/i],
    ["export-market", /تصدير|أسواق|اسواق|\bexport/i],
    ["winners", /ترسي|\bawards?\b|\bwinners\b/i],
    ["factories", /مصانع|\bfactories\b/i],
    ["suppliers", /موردين|\bsuppliers\b/i],
    ["market", /منتجات|\bproducts\b/i],
    ["radar", /فرص(?!ة سعيدة)|\bopportunit/i],
    ["register", /باقات|الباقة|التسجيل|\bplans\b|\bregist/i, "janna"]
  ];
  var MKN2 = { local: ["مصر", "Egypt"], gulf: ["الخليج", "the Gulf"], arab: ["الدول العربية", "Arab markets"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
  function holoOn() { return !!(window.MIGHOLO && MIGHOLO.act); }
  /* a server tool's start (webhook arguments arrive nested: {bodyParams:{…}}); bassem_intel is Janna's tool too, so it speaks as the persona
     of the call — «جنة بتدوّر…», never «باسم بيدوّر…» in her call (map 2026-11-20). In SDK calls the holo cards on the video show the search
     tools (data/call-holo.js), and data/holo.js leaves them to the cards (MIG_CALL_HOLO.owns) */
  function holoTool(n, a) { if (!n || !/^(bassem|janna)_/.test(n) || !holoOn()) return; a = a || {}; if (a.bodyParams && typeof a.bodyParams === "object") a = a.bodyParams; try { MIGHOLO.act(n, a, { who: /^bassem_/.test(n) && n !== "bassem_intel" ? "bassem" : persona }); } catch (e) {} }
  function fmtDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch (e) { return m[0]; } }
  function holoWelcome() {
    HT = { sec: {}, t: 0, tool: 0, buf: {}, t0: Date.now() };
    if (!holoOn() || !MIGHOLO.show) return;
    var B = persona === "bassem", i = null, items = [], steps, L = function (p) { try { return withLang(url(p)); } catch (e) { return p; } };
    try { i = B && window.BASSEM && BASSEM.info ? BASSEM.info() : null; } catch (e) {}
    if (B && i && i.eligible) {
      if (i.company || i.name) items.push({ title: String(i.company || i.name), sub: T("ملف شركتك على المنصة", "Your company file on the platform"), href: L("dashboard.html") });
      if (i.planName) items.push({ title: T("باقة ", "") + i.planName + (EN ? " plan" : ""), sub: i.end ? T("باسم مستشارك لحد ", "Bassem is your advisor until ") + fmtDay(i.end) : "", href: L("dashboard.html") });
      var mk = (i.markets || []).map(function (m) { return MKN2[m] ? MKN2[m][EN ? 1 : 0] : ""; }).filter(Boolean);
      if (mk.length) items.push({ title: T("أسواق باقتك", "Your plan's markets"), sub: mk.join(T("، ", ", ")) });
      items.push({ title: T("المناقصات وطلبات الأسعار والمشاريع", "Tenders, RFQs and projects"), sub: T("الجديد كل يوم في نطاق باقتك", "New every day in your plan's markets"), href: L("tenders.html") }); /* never «من المصادر الرسمية» (owner 2026-11-18 / 2026-11-20) */
      steps = [T("فتحت ملف شركتك", "Opened your company file"), T("بجهّز الجديد في نطاق باقتك", "Preparing what is new in your plan's markets")];
    } else {
      items = [{ title: T("دليل المصانع والشركات المصرية", "Egyptian factory & company directory"), sub: T("دوّر بالمنتج أو النشاط أو المحافظة", "Search by product, activity or governorate"), href: L("factories.html") },
        { title: T("المناقصات وطلبات عروض الأسعار", "Tenders and requests for quotation"), sub: T("من مصر والخليج وأفريقيا", "From Egypt, the Gulf and Africa"), href: L("tenders.html") },
        { title: T("التسجيل والباقات", "Registration and plans"), sub: T("سجّل مصنعك وابدأ تبيع", "Register your factory and start selling"), href: L("register.html") }];
      steps = [T("فتحت شاشة المنصة", "Opened the platform screen"), T("قولّي بتدوّر على إيه وأنا أفتحهولك", "Tell me what you need and I'll open it")];
    }
    try { MIGHOLO.show({ who: B ? "bassem" : "janna", kind: "welcome", title: B ? T("باسم فتحلك مكتبك", "Bassem opened your desk") : T("جنة فتحتلك المنصة", "Janna opened the platform for you"), steps: steps, items: items, done: true }); } catch (e) {}
  }
  function holoTopic(text) {
    if (!holoOn() || !frame || !text) return;
    var now = Date.now(); if (now - HT.t < 9000 || now - HT.tool < 25000 || now - HT.t0 < 1500) return;
    var best = null, bi = 1e9;
    for (var i = 0; i < HTOP.length; i++) { var h = HTOP[i]; if (HT.sec[h[0]] || (h[2] && h[2] !== persona)) continue; var m = h[1].exec(text); if (m && m.index < bi) { bi = m.index; best = h[0]; } }
    if (!best) return;
    HT.sec[best] = 1; HT.t = now;
    run("janna_navigate", { page: best }, { topic: 1 }); /* he only TALKS about it: the screen changes, the «الشاشة» button pings — the call never scrolls away from him (review 2026-11-19 #16) */
  }
  /* the platform's server tools still running in this call (bassem_intel, platform_item, janna_lookup): «ابعتلي» waits for them (notifyGo),
     so the opportunities Bassem fetched in the same turn are known before the note goes out (his rule 9: every tool at once) */
  var INFL = {}, INFL_TOOLS = /^(bassem_intel|platform_item|janna_lookup)$/;
  function inflMark(d, on) {
    d = d || {}; var n = String(d.toolName || d.name || ""), k;
    if (!INFL_TOOLS.test(n)) return;
    k = String(d.toolCallId || "") || n;
    if (on) INFL[k] = Date.now(); else { delete INFL[k]; delete INFL[n]; }
  }
  /* resolves once none of them is running (after at least 0.6 s) or after max ms; a call older than 8 s no longer counts */
  function inflWait(max) {
    var t0 = Date.now();
    return new Promise(function (res) {
      (function tick() {
        var now = Date.now(), busy = false, k;
        for (k in INFL) if (INFL.hasOwnProperty(k)) { if (now - INFL[k] > 8000) delete INFL[k]; else busy = true; }
        if ((!busy && now - t0 >= 600) || now - t0 >= max) { res(); return; }
        setTimeout(tick, 150);
      })();
    });
  }
  /* the call's DOM events → its handlers: the widget's own events, or the same events re-dispatched by the SDK call (sdkFire) */
  function wire(el) {
    el.addEventListener("anam-agent:tool-call-started", function (e) { var d = e.detail || {}; HT.tool = Date.now(); try { scrMark(d); } catch (x) {} cmpGive(d.toolName); if (d.toolType && d.toolType !== "client") { holoTool(d.toolName, d.arguments || {}); return; } run(d.toolName, d.arguments || {}); });
    /* speed review 2026-11-20 #5: what a janna_lookup found goes on the screen at once (lookupDone), platform_item's one item opens (itemShow) */
    el.addEventListener("anam-agent:tool-call-completed", function (e) { try { lookupDone(e.detail || {}); } catch (x) {} try { itemShow(e.detail || {}); } catch (x) {} });
    el.addEventListener("anam-agent:session-started", function (e) { SID = String((e.detail && e.detail.sessionId) || ""); sessT0 = Date.now(); onSession(); holoWelcome(); if (NUDGE) nudge(NUDGE, 0); });
    el.addEventListener("anam-agent:session-ended", function (e) { onSessionEnd(e.detail || {}); });
    el.addEventListener("anam-agent:message-received", function (e) { onMessage(e.detail || {}); });
    /* what the platform's server tools returned: the opportunities and any e-mail address in their data (the recipient of a draft) */
    el.addEventListener("anam-agent:tool-call-completed", function (e) { try { harvest(e.detail || {}); } catch (x) {} });
    /* «ابعتلي» waits for the server tools still running (inflWait); registered after harvest, so their results are kept first */
    el.addEventListener("anam-agent:tool-call-started", function (e) { inflMark(e.detail, 1); });
    el.addEventListener("anam-agent:tool-call-completed", function (e) { inflMark(e.detail, 0); });
    el.addEventListener("anam-agent:tool-call-failed", function (e) { inflMark(e.detail, 0); });
    el.addEventListener("anam-agent:error", function (e) { var m = (e.detail && e.detail.message) || ""; say(/origin/i.test(m) ? T("الفيديو المباشر بيشتغل على موقع المنصة الرسمي", "Live video works on the official site") : T("حصلت مشكلة في الاتصال، جرّب تاني", "Connection problem, please try again")); });
  }
  function widgetHtml(name) { return '<anam-agent agent-id="' + AGENTS[persona] + '" layout="inline" ui-text-input="true" ui-mute-button="true" call-to-action="' + esc(T("ابدأ الكلام مع ", "Start talking to ") + name) + '" agent-name="' + esc(name) + '"></anam-agent>'; }
  function mountWidget() {
    var ag = ov && ov.querySelector("anam-agent"); if (!ag) return;
    wire(ag);
    if (!document.querySelector('script[data-anam]')) { var sc = document.createElement("script"); sc.src = WIDGET; sc.integrity = WIDGET_SRI; sc.crossOrigin = "anonymous"; sc.referrerPolicy = "no-referrer"; sc.async = true; sc.setAttribute("data-anam", "1"); sc.onerror = function () { sc.remove(); say(T("الفيديو المباشر مش متاح دلوقتي — جرّب تاني بعد شوية.", "Live video is not available right now — please try again later.")); }; document.head.appendChild(sc); }
    shadowCss(ag, 0);
  }

  /* ---------- the live call through the Anam JS SDK (no widget, no third-party mark in the video) ---------- */
  var LV = null, LVN = 0, VIDN = 0, sdkP = null, sdkBad = 0;
  /* "sdk" unless the Worker already said in this tab that it cannot mint tokens (MODE_KEY); window.JANNA_LIVE_MODE = "widget" | "sdk" wins */
  function liveMode() {
    var f = String(window.JANNA_LIVE_MODE || "");
    if (f === "widget" || f === "sdk") return f;
    try { var m = JSON.parse(sessionStorage.getItem(MODE_KEY) || "null"); if (m && m.m === "widget" && +m.until > Date.now()) return "widget"; } catch (e) {}
    return "sdk";
  }
  function rememberWidget() { try { sessionStorage.setItem(MODE_KEY, JSON.stringify({ m: "widget", until: Date.now() + 30 * 60000 })); } catch (e) {} }
  function sdkBox() { return ov ? ov.querySelector(".jnl-sdk") : null; }
  function sdkName() { return who(["جنة", "باسم"], ["Janna", "Bassem"]); }
  function sdkHtml(name) {
    var B = persona === "bassem", R = B ? window.BASSEM_REAL : window.JANNA_REAL, D2 = EN ? "ltr" : "rtl";
    /* the same real photo as the docked figure (data/janna-real.js / bassem-real.js): a cut-out, so the office stays behind her / him */
    var body = (R && R.body) || (B ? "img/bassem/body.webp" : "img/janna/body.webp"), wh = B ? ' width="623" height="1619"' : ' width="1243" height="1128"';
    var ai = who(["جنة · مساعِدة بالذكاء الاصطناعي", "باسم · مستشار بالذكاء الاصطناعي"], ["Janna · AI assistant", "Bassem · AI advisor"]);
    var mic = T("اكتم الميكروفون", "Mute microphone"), ph = T("اكتب بأي لغة…", "Any language…"), snd = T("ابعت", "Send"), end = T("إنهاء المكالمة", "End call"), lgh = langHead();
    return '<div class="jnl-sdk" data-p="' + (B ? "bassem" : "janna") + '" data-state="idle" dir="' + D2 + '" role="group" aria-label="' + esc(ai) + '">'
      + '<img class="jv-pst" src="' + esc(body) + '"' + wh + ' alt="' + esc(name) + '" decoding="async">'
      + '<video id="jnlVid' + (++VIDN) + '" autoplay playsinline aria-label="' + esc(who(["فيديو جنة المباشر", "فيديو باسم المباشر"], ["Janna's live video", "Bassem's live video"])) + '"></video>'
      + '<div class="jv-ai" translate="no"><i aria-hidden="true"></i><span>' + esc(ai) + '</span></div>'
      + '<div class="jv-st" role="status" aria-live="polite"></div>'
      + '<div class="jv-acts"><button type="button" class="jv-go"><i aria-hidden="true"></i><span>' + esc(T("ابدأ الكلام مع ", "Start talking to ") + name) + '</span></button>'
      + '<button type="button" class="jv-go2" hidden>⌨️ ' + esc(T("كمّل كتابة من غير ميكروفون", "Continue by typing (no microphone)")) + '</button><button type="button" class="jv-lgo" hidden title="' + esc(lgh) + '" aria-label="' + esc(lgh) + '">🌐</button></div>'
      + '<div class="jv-ctl" hidden><button type="button" class="jv-mic" aria-pressed="false" title="' + esc(mic) + '" aria-label="' + esc(mic) + '">🎙️</button><button type="button" class="jv-lang" hidden aria-haspopup="dialog" aria-expanded="false" title="' + esc(lgh) + '" aria-label="' + esc(lgh) + '">🌐</button>'
      + '<form novalidate><button type="button" class="jv-att" hidden title="' + esc(T("ابعت صورة", "Send a photo")) + '" aria-label="' + esc(T("ابعت صورة", "Send a photo")) + '">📎</button><input type="text" maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '"><button type="submit" class="jv-snd" title="' + esc(snd) + '" aria-label="' + esc(snd) + '">➤</button>'
      + '<input type="file" class="jv-file" accept="image/jpeg,image/png,image/webp" hidden tabindex="-1" aria-hidden="true"></form>'
      + '<button type="button" class="jv-end" title="' + esc(end) + '" aria-label="' + esc(end) + '">✕</button></div></div>';
  }
  function mountSdk() {
    var bx = sdkBox(); if (!bx) return;
    wire(bx);
    bx.querySelector(".jv-go").onclick = function () { var f = bx.__go; bx.__go = null; if (f) f(); else sdkStart(false); };
    bx.querySelector(".jv-go2").onclick = function () { bx.__go = null; sdkStart(true); };
    bx.querySelector(".jv-end").onclick = function () { sdkStop("user"); };
    bx.querySelector(".jv-mic").onclick = sdkMute;
    bx.querySelector(".jv-lang").onclick = bx.querySelector(".jv-lgo").onclick = function () { langMenu(!LG.menu); }; /* 🌐 */
    var f = bx.querySelector(".jv-ctl form"), inp = f.querySelector("input");
    bx.querySelector(".jv-att").onclick = cmTap; /* 📎 (data/chat-media.js) */
    f.onsubmit = function (e) { if (e && e.preventDefault) e.preventDefault(); var v = inp.value.trim(), cm = cmSend(v); if (cm > 0) { inp.value = ""; return; } if (cm < 0) { say(T("ثانية واحدة — المكالمة لسه بتتوصل", "One moment — the call is still connecting")); return; } if (!v) return; if (sdkSay(v)) inp.value = ""; else say(T("ثانية واحدة — المكالمة لسه بتتوصل", "One moment — the call is still connecting")); };
    var v = bx.querySelector("video");
    v.addEventListener("playing", function () { if (LV && !LV.closed && LV.client) { LV.playing = true; bx.classList.add("on"); } });
    sdkUi("idle");
    loadSdk().then(null, function () {}); /* warm the cache while the visitor looks at the call screen; nothing is started */
  }
  /* the call's own states: idle (photo + «ابدأ»), connecting, live, ended / error (photo, the reason, «ابدأ» again when it can help) */
  function sdkUi(state, msg, opt) {
    var bx = sdkBox(); if (!bx) return; opt = opt || {};
    bx.setAttribute("data-state", state); if (state !== "live" && state !== "connecting") { bx.classList.remove("on"); micDrop(); } /* the call is over: our microphone is released */
    var st = bx.querySelector(".jv-st"); st.textContent = msg || ""; st.classList.toggle("wait", state === "connecting");
    var a0 = bx.querySelector(".jv-acts"), go = bx.querySelector(".jv-go span");
    a0.hidden = state === "connecting" || state === "live" || !!opt.noRetry;
    go.textContent = opt.go || (state === "idle" ? T("ابدأ الكلام مع ", "Start talking to ") + sdkName() : T("ابدأ مكالمة جديدة", "Start a new call"));
    bx.__go = opt.act || null;
    bx.querySelector(".jv-go2").hidden = !opt.typing;
    bx.querySelector(".jv-ctl").hidden = state !== "live";
    updCtl();
  }
  function updCtl() {
    var bx = sdkBox(), me = LV; if (!bx) return;
    var mic = bx.querySelector(".jv-mic"), inp = bx.querySelector(".jv-ctl input"), snd = bx.querySelector(".jv-snd"), ok = !!(me && me.ready && !me.closed), txt = ok && !!me.dc, mu = !!(me && me.muted);
    var ml = mu ? T("شغّل الميكروفون", "Unmute microphone") : T("اكتم الميكروفون", "Mute microphone");
    mic.hidden = !!(me && me.textOnly); mic.disabled = !ok || !!(me && me.micDenied); mic.textContent = mu ? "🔇" : "🎙️"; mic.title = ml; mic.setAttribute("aria-label", ml); mic.setAttribute("aria-pressed", mu ? "true" : "false");
    inp.disabled = !txt; snd.disabled = !txt;
    var ph = me && me.micDenied && !me.textOnly ? T("الميكروفون مقفول — اكتب رسالتك هنا…", "Microphone blocked — type your message here…") : inp.clientWidth >= 220 ? T("اكتب رسالتك بأي لغة…", "Type a message in any language…") : T("اكتب بأي لغة…", "Any language…"); /* 🌐 any language; short where the 🌐 button leaves a narrow box (390 px) */
    var cph = window.MIGCHATMEDIA && MIGCHATMEDIA.ph ? MIGCHATMEDIA.ph(cmHost(true)) : ""; if (cph) ph = cph; /* 📎 a photo waits for its question */
    if (inp.placeholder !== ph) { inp.placeholder = ph; inp.setAttribute("aria-label", ph); }
    cmUi(); nzChip(); langUi();
  }
  /* ---------- 📎 photos in the call (owner 2026-11-20: «مفيش … مكان العميل يحطلهم في صوره»; switch chat_photos) — the logic is data/chat-media.js
     (loaded with this file's ?v= or window.MIGVER_CM while the switch is on); these are its hooks: the button shows once the call can take a
     photo (the data channel open, Janna's photo ticket or Bassem's sign-in), never in the widget or the kiosk ---------- */
  var CM = { load: 0 };
  function cmOk(me) { var F = window.MIGFLAGS; return !!(window.MIGCHATMEDIA && F && F.on && F.on("chat_photos") === true && sdkBox() && !window.JANNA_KIOSK && me && me.ready && me.dc && !me.closed && (persona === "bassem" ? !!BTOK : !!me.mt)); }
  function cmLoad() {
    if (window.MIGCHATMEDIA || CM.load) return; CM.load = 1;
    var sc = document.createElement("script"); sc.src = LT.base + "data/chat-media.js" + (window.MIGVER_CM || (LT.v ? "?v=" + LT.v : "")); sc.charset = "utf-8"; sc.async = true;
    sc.onload = function () { updCtl(); }; sc.onerror = function () { CM.load = 0; if (sc.parentNode) sc.parentNode.removeChild(sc); };
    document.head.appendChild(sc);
  }
  function cmHost(ok) {
    return { persona: persona, en: EN, ok: !!ok, box: sdkBox(), ov: ov, api: String(window.MIG_API_BASE || "/api").replace(/\/+$/, ""),
      live: function () { var m = LV; return !!(m && m.client && m.ready && m.dc && !m.closed); },
      ctx: function (t) { var m = LV; if (!m || !m.client || !m.ready || !m.dc || m.closed || !m.client.addContext) return false; try { m.client.addContext(String(t)); return true; } catch (e) { return false; } },
      say: function (t) { return sdkSay(t, { photo: true }); }, toast: say, ticket: function () { return (LV && LV.mt) || ""; }, btok: function () { return BTOK; }, full: signedTok,
      chain: function () { return LV ? LV.chain : null; }, relayout: nzPlace, replay: function () { if (LV) sdkPlay(LV); }, go: function (u) { if (frame) go(u); }, upd: updCtl };
  }
  function cmUi() { var bx = sdkBox(), b = bx && bx.querySelector(".jv-att"), F = window.MIGFLAGS, M = window.MIGCHATMEDIA; if (!b) return; if (!M && F && F.on && F.on("chat_photos") === true) cmLoad(); if (M && M.sync) { try { M.sync(cmHost(cmOk(LV))); } catch (e) {} } else b.hidden = true; }
  function cmTap() { var M = window.MIGCHATMEDIA, bx = sdkBox(); if (M && M.callTap && bx && cmOk(LV)) M.callTap(cmHost(true), bx.querySelector(".jv-file")); }
  /* ➤ with a photo waiting: 1 = sent with the text as its question · 0 = no photo · -1 = the call cannot take it yet */
  function cmSend(v) { var M = window.MIGCHATMEDIA; if (!M || !M.pending || !M.pending()) return 0; return M.send(cmHost(cmOk(LV)), v); }
  /* the noise and 🌐 chips stack above the photo chip (placed first) */
  function cmTop(t) { var M = window.MIGCHATMEDIA, r = null; try { r = M && M.place ? M.place() : null; } catch (e) { r = null; } return r && r.height ? r.top : t; }
  window.addEventListener("mig:flags", function () { try { cmUi(); } catch (e) {} }); /* 📎 the owner switched chat_photos on / off */
  /* the pinned SDK, loaded once (SRI; jsDelivr, then the same bytes from unpkg); when neither loads, this page does not try again for
     10 minutes (the next «ابدأ» goes straight to the widget instead of waiting for the CDNs again) */
  function loadSdk() {
    if (window.anam && typeof window.anam.createClient === "function") return Promise.resolve(window.anam);
    if (sdkP) return sdkP;
    if (sdkBad && Date.now() - sdkBad < 600000) return Promise.reject({ code: "sdk_load" });
    sdkP = new Promise(function (res, rej) {
      var i = 0;
      (function next() {
        if (i >= SDK_URLS.length) { sdkP = null; sdkBad = Date.now(); rej({ code: "sdk_load" }); return; }
        var sc = document.createElement("script"), done = false, tm = 0;
        var fail = function () { if (done) return; done = true; clearTimeout(tm); sc.onload = sc.onerror = null; if (sc.parentNode) sc.parentNode.removeChild(sc); next(); };
        sc.src = SDK_URLS[i++]; sc.integrity = SDK_SRI; sc.crossOrigin = "anonymous"; sc.referrerPolicy = "no-referrer"; sc.async = true; sc.setAttribute("data-anam-sdk", SDK_V);
        sc.onload = function () { if (done) return; if (window.anam && typeof window.anam.createClient === "function") { done = true; clearTimeout(tm); res(window.anam); } else fail(); };
        sc.onerror = fail; tm = setTimeout(fail, 15000);
        document.head.appendChild(sc);
      })();
    });
    return sdkP;
  }
  /* POST /api/janna/session → {sessionToken, max_session_sec}; anything that is not the Worker's JSON (static preview) = "unavailable" */
  function sessToken(agent, auth, extra) {
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej({ code: "unavailable" }); return; }
      var fin = false, h = { "Content-Type": "application/json", Accept: "application/json" }; if (auth) h.Authorization = "Bearer " + auth;
      var tm = setTimeout(function () { if (!fin) { fin = true; rej({ code: "timeout" }); } }, 15000);
      fetch(SESS_API, { method: "POST", headers: h, body: JSON.stringify(sessBody(agent, extra)), credentials: "same-origin", cache: "no-store" }).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "unavailable", status: r.status };
        var st = String(r.headers.get("server-timing") || "").slice(0, 300); /* the Worker's own split of this wait (JANNA_LIVE.timing) */
        return r.json().then(function (j) {
          if (!r.ok || !j || typeof j.sessionToken !== "string" || !j.sessionToken) throw { code: String((j && (j.code || j.error)) || "http_" + r.status), status: r.status, retry_after: j && j.retry_after, server_timing: st };
          j.server_timing = st;
          return j;
        });
      }).then(function (j) { if (fin) return; fin = true; clearTimeout(tm); res(j); }, function (e) { if (fin) return; fin = true; clearTimeout(tm); rej(e && e.code ? e : { code: "network" }); });
    });
  }
  /* Bassem: the Worker checks the member's plan with the member's own sign-in — the platform session ("mig-tok"), else Bassem's advisor
     token from an activation link (advisor.html: sessionStorage "mig-adv-token"); a refusal of the first is tried once with the other */
  var BTOK = "";
  function bassemAuth() {
    var out = [], t = "", c = null;
    try { t = localStorage.getItem("mig-tok") || ""; } catch (e) {}
    if (t) out.push(t);
    try { c = JSON.parse(sessionStorage.getItem("mig-adv-token") || "null"); } catch (e) {}
    if (c && c.t && out.indexOf(String(c.t)) < 0) out.push(String(c.t));
    return out;
  }
  /* Janna's memory of her visitors (worker/src/visitor.js, migration 0009 — owner 2026-11-18: «ذاكرة باسم وجنة مهمين جداً»): a RANDOM
     first-party visitor id, created at the first live call with Janna and kept in localStorage "mig-vid" (32 hex characters). It goes
     with Janna's session request (her short visitor block, «أهلاً بيك تاني») and with her call memory (data/bassem-memory.js, POST
     /api/janna/memory) — only to the platform's own Worker. No storage → an id for this page only. Signed in (the platform session
     "mig-tok"), Janna's request also carries the sign-in so the Worker links the visitor id to the member account. */
  var VID = "", VID_M = "mig-vid-m";
  function newVid() { var v = ""; try { var rb = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(rb); for (var i = 0; i < rb.length; i++) v += ("0" + rb[i].toString(16)).slice(-2); } catch (e) { v = ""; } return v; }
  function signedTok() { var t = ""; try { t = localStorage.getItem("mig-tok") || ""; } catch (e) {} return /^v2\./.test(t) ? t : ""; }
  /* review 2026-11-19 #7 (a shared computer): an id a signed-in call used belongs to that member (the Worker links it to his account), so
     after sign-out — no "mig-tok" any more — or when the Worker says so (rotate_visitor / 409 visitor_linked), this browser starts a NEW
     random id: the next person never reads the member's Janna memory or adds to it. "mig-vid-m" = this id was used signed in. */
  function rotateVisitor() { var v = newVid(); VID = v; try { if (v) localStorage.setItem("mig-vid", v); else localStorage.removeItem("mig-vid"); localStorage.removeItem(VID_M); } catch (e) {} return v; }
  function visitorId() {
    var m = ""; try { m = localStorage.getItem(VID_M) || ""; } catch (e) {}
    if (m && !signedTok()) return rotateVisitor(); /* signed out since this id was used signed in */
    if (/^[0-9a-f]{32}$/.test(VID)) return VID;
    var v = ""; try { v = localStorage.getItem("mig-vid") || ""; } catch (e) {}
    if (!/^[0-9a-f]{32}$/.test(v)) {
      v = newVid();
      if (v) { try { localStorage.setItem("mig-vid", v); } catch (e) {} }
    }
    VID = v; return v;
  }
  try { window.addEventListener("storage", function (e) { if (e && e.key === "mig-tok" && !/^v2\./.test(String(e.newValue || ""))) { var m = ""; try { m = localStorage.getItem(VID_M) || ""; } catch (x) {} if (m) rotateVisitor(); } }); } catch (e) {} /* signed out in another tab */
  function sessBody(agent, extra) { var b = { agent: agent, lang: EN ? "en" : "ar", ff: 1, cs: 1 }; /* ff: this page knows the owner's switches (feature_off); cs: and the consent card */ if (aiOk()) b.consent = true; if (agent === "janna") { var vi = visitorId(); if (vi) b.visitor_id = vi; } if (extra) for (var k in extra) if (extra.hasOwnProperty(k) && !b.hasOwnProperty(k)) b[k] = extra[k]; return b; }
  function mint(agent, extra) {
    if (agent !== "bassem") {
      var jt = signedTok(); /* Janna never needs it: a refused / old sign-in is ignored by the Worker */
      return sessToken(agent, jt, extra).then(function (j) {
        if (j && j.rotate_visitor) rotateVisitor(); /* this id is another member's (or the signed-out member's): this call gets a new one */
        if (jt) { try { localStorage.setItem(VID_M, "1"); } catch (e) {} } /* this call writes signed in: its id becomes the member's */
        return j;
      });
    }
    var c = bassemAuth(), i = 0;
    var next = function (prev) {
      if (i >= c.length) return Promise.reject(prev || { code: "login_required", status: 401 });
      var tk = c[i++];
      /* BTOK: the sign-in this call was opened with — the e-mails of the call go out with it alone (sendPost), as the member of the call */
      return sessToken(agent, tk, extra).then(function (j) { BTOK = tk; return j; }, function (e) { if (e && /^(login_required|full_login_required|plan)$/.test(e.code) && i < c.length) return next(e); throw e; });
    };
    return next(null);
  }
  function sdkStart(textOnly) {
    if (!sdkBox() || (LV && !LV.closed)) return;
    var me = { gen: ++LVN, st: "connecting", client: null, sid: "", ready: false, dc: false, playing: false, closed: false, stopped: false, stopReason: "", textOnly: !!textOnly, muted: false, micDenied: false, seen: {}, msgN: 0, max: CAP_MIN * 60, timers: [], connT: 0, own: {},
      chain: { n: 0, log: [], userEnded: false, t0: Date.now() } };
    LV = me; tmStart(me); sdkUi("connecting", connMsg(me)); if (persona === "bassem") loadTools();
    nzPrep(me); /* noise guard: the audio meter + our own microphone request start inside this tap, while the token is minted */
    /* owner 2026-11-19 «باسم بياخد وقت»: the token is asked for at once, BESIDE the SDK download (it used to wait for it); a token minted
       for a call whose SDK then fails to load is simply not used (the widget takes over, as before). When the SDK already failed to load
       in this page (sdkBad: loadSdk refuses at once for 10 minutes) no token is asked for at all — every minted token counts in the
       Worker's daily cap and the per-network hourly limit — and the widget takes over exactly as before */
    var p = persona, tok = function () { return mint(p).then(function (j) { tmMark(me, "token"); if (me.tm) me.tm.server = String(j.server_timing || ""); return j; },
      function (e) { tmMark(me, "token"); if (me.tm && e && e.server_timing) me.tm.server = String(e.server_timing); throw e; }); };
    var tokP = sdkBad && Date.now() - sdkBad < 600000 ? null : tok();
    if (tokP) tokP.then(null, function () {}); /* answered below once the SDK is there; never an unhandled rejection while it loads */
    me.timers.push(setTimeout(function () { sdkSlow(me); }, SLOW_MS));
    loadSdk().then(function (A) {
      tmMark(me, "sdk");
      if (LV !== me) return;
      (tokP || tok()).then(function (j) {
        if (LV !== me || me.stopped) return;
        me.max = maxOf(j); me.mt = typeof j.media_ticket === "string" ? j.media_ticket : ""; /* 📎 the call's photo ticket (Janna) */
        sdkRun(me, A, j.sessionToken);
      }, function (e) { if (LV === me) sdkRefused(me, e || {}); });
    }, function () { if (LV === me) { LV = null; toWidget(true); } });
  }
  /* ---------- where the start of a call goes (owner 2026-11-19 «باسم بياخد وقت»: the screen stayed on «بنوصّلك بباسم…» a long time) ----------
     marks in ms after the «ابدأ» tap (performance.now()): token (the Worker answered; its own split is the Server-Timing header, kept in
     `server`), sdk (the Anam SDK is loaded — fetched beside the token now), mic (our microphone answered), stream (the session starts:
     streamToVideoElement), connected (WebRTC is up), ready (SESSION_READY), video (first frames), play (the video plays), voice (the first
     words of her / his greeting arrive). JANNA_LIVE.timing() = the last call's marks; a "mig:live-timing" event carries them at «ready» and
     «voice». After SLOW_MS without a session the status says the connection is slow instead of a frozen «بنوصّلك…» (never over the
     browser's microphone question). Continuation parts of a chained call are not timed. */
  var SLOW_MS = 7000, TM = null;
  var PERF = window.performance && typeof window.performance.now === "function" ? function () { return window.performance.now(); } : function () { return Date.now(); };
  function tmStart(me) { TM = me.tm = { t0: PERF(), persona: persona, marks: {}, server: "" }; }
  function tmMark(me, k) {
    var t = me && me.tm; if (!t || t.marks[k] != null) return;
    t.marks[k] = Math.round(PERF() - t.t0);
    if (k === "ready" || k === "voice") { try { window.dispatchEvent(new CustomEvent("mig:live-timing", { detail: tmOut(t) })); } catch (e) {} }
    if (k === "voice") tmBeacon(me);
  }
  /* speed review 2026-11-20 #11 (the owner's «بياخد وقت» about the start, which Anam's data cannot see): POST /api/janna/timing, a
     text/plain JSON body of numbers only — no id, no words, no address. k "start" (once, at «voice»): {p, lang (the page's: ar | en), relay
     0|1, region (Anam's getActiveSessionRegion), ms: {token, sdk, mic, stream, connected, ready, video, play, voice}, srv: the Worker's
     Server-Timing durations (boot … total)}; k "turns" (the call's end): up to 20 [first reasoning chunk, last reasoning chunk, first words],
     ms after the end of his speech (-1 = none). worker/src/live-timing.js timingLine reads exactly these */
  function tmSend(o) {
    var u = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "") + "/janna/timing", b = JSON.stringify(o);
    try { if (navigator.sendBeacon && navigator.sendBeacon(u, b)) return; } catch (e) {}
    try { if (window.fetch) fetch(u, { method: "POST", body: b, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).then(null, function () {}); } catch (e) {}
  }
  function tmRegion(me) { var rg = ""; try { rg = String((me.client && me.client.getActiveSessionRegion && me.client.getActiveSessionRegion()) || ""); } catch (e) { rg = ""; } return /^[a-z0-9._-]{1,40}$/i.test(rg) ? rg : ""; }
  function tmBeacon(me) {
    var t = me && me.tm, ms = {}, srv = {}, k, m, rx = /(boot|checks|ctx|persona|wait|token|total);dur=(\d+)/g;
    if (!t || t.sent) return; t.sent = 1;
    for (k in t.marks) if (t.marks.hasOwnProperty(k) && /^(token|sdk|mic|stream|connected|ready|video|play|voice)$/.test(k)) ms[k] = Math.max(0, Math.round(+t.marks[k] || 0));
    while ((m = rx.exec(String(t.server || "")))) srv[m[1]] = +m[2];
    t.region = tmRegion(me); /* kept for the "turns" beacon: the client is gone by the call's end */
    tmSend({ k: "start", p: t.persona === "bassem" ? "bassem" : "janna", lang: EN ? "en" : "ar", relay: me.relay ? 1 : 0, region: t.region, ms: ms, srv: srv });
  }
  function tmTurns(me, on) {
    if (!me.tm) return; /* the first part of a call only (continuation parts are not timed) */
    var c = { e: 0, r0: -1, r1: -1, o: -1 }, L = me.tm.turns = [];
    me.tmPush = function () { if (c.e && L.length < 20 && (c.r0 >= 0 || c.o >= 0)) L.push([c.r0, c.r1, c.o]); c = { e: 0, r0: -1, r1: -1, o: -1 }; };
    on("USER_SPEECH_ENDED", function () { me.tmPush(); c.e = Date.now(); });
    on("REASONING_STREAM_EVENT_RECEIVED", function () { if (!c.e) return; var d = Date.now() - c.e; if (c.r0 < 0) c.r0 = d; c.r1 = d; });
    on("MESSAGE_STREAM_EVENT_RECEIVED", function (ev) { if (c.e && ev && ev.role === "persona" && c.o < 0) c.o = Date.now() - c.e; });
  }
  function tmTurnsSend(me) {
    var t = me && me.tm; if (!t || !me.tmPush || t.turnsSent) return; me.tmPush(); t.turnsSent = 1;
    if (t.turns && t.turns.length) tmSend({ k: "turns", p: t.persona === "bassem" ? "bassem" : "janna", lang: EN ? "en" : "ar", region: t.region || tmRegion(me), turns: t.turns });
  }
  /* a browser whose stream → connected took over 8 s starts its next calls through Anam's TURN relay for 30 days (localStorage
     "mig-jnl-relay" = until when); a relay start that fails drops it (relayDrop: a network that blocks TURN / TLS never fails every call) */
  function relayMem() { var v = 0; try { v = +localStorage.getItem("mig-jnl-relay") || 0; if (v && v <= Date.now()) { localStorage.removeItem("mig-jnl-relay"); v = 0; } } catch (e) { v = 0; } return v > Date.now(); }
  function relaySlow(me) { var t = me.tm && me.tm.marks; if (me.relay || !t || t.stream == null || t.connected == null || t.connected - t.stream <= 8000) return; try { localStorage.setItem("mig-jnl-relay", String(Date.now() + 30 * 864e5)); } catch (e) {} }
  function relayDrop(me) { if (me && me.relay) { try { localStorage.removeItem("mig-jnl-relay"); } catch (e) {} } }
  function tmOut(t) { var o = { persona: t.persona, server: t.server }; for (var k in t.marks) if (t.marks.hasOwnProperty(k)) o[k] = t.marks[k]; return o; }
  function connMsg(me) {
    var slow = !!(me && me.tm && PERF() - me.tm.t0 >= SLOW_MS);
    return slow ? T("لسه بنوصّلك ب" + sdkName() + "… الاتصال بطيء شوية، خليك معانا", "Still connecting you to " + sdkName() + "… the connection is a little slow, please stay with us")
      : T("بنوصّلك ب" + sdkName() + "…", "Connecting you to " + sdkName() + "…");
  }
  function sdkSlow(me) { if (LV === me && !me.ready && !me.closed && !me.stopped && !me.micAsk && !me.cont) sdkUi("connecting", connMsg(me)); }
  function sdkRun(me, A, token) {
    var bx = sdkBox(), vid = bx && bx.querySelector("video"), E = A.AnamEvent || {}, c = null;
    if (!vid) return;
    /* the token starts ONE session (maxSessions 1 on the Worker): no SDK retries with it; the visitor's «جرّب تاني» gets a new token */
    var opts = { metrics: { disableClientMetrics: true }, api: { retry: { maxAttempts: 1 } } };
    if (me.textOnly) opts.disableInputAudio = true;
    /* a network that blocks UDP can hold the first frames for many seconds before the SDK's own fallback: window.JANNA_LIVE_RELAY = 1 (set
       by a page, or in the console before «ابدأ») sends the media through Anam's TURN relay from the start (Anam docs: Client Options,
       rtcConfiguration.iceTransportPolicy "relay") — off by default; JANNA_LIVE.timing() shows whether stream → connected was the slow part */
    var rl = String(window.JANNA_LIVE_RELAY) === "1" || relayMem(); /* + a browser whose last start stalled (relaySlow; speed review 2026-11-20 #11) */
    if (rl) opts.rtcConfiguration = { iceTransportPolicy: "relay" };
    me.relay = rl;
    try { c = A.createClient(token, opts); } catch (e) { sdkFail(me, "start"); return; }
    me.client = c;
    var mlc = { client: c, persona: persona }; window.MIG_LIVE_CLIENT = mlc; try { window.dispatchEvent(new CustomEvent("mig:live-client", { detail: mlc })); } catch (e) {} /* contract: data/bassem-memory.js, data/bassem-live-tools.js … attach here */
    if (persona === "bassem") liveTools(c); /* Bassem's tools answer with what the shared screen shows (data/bassem-live-tools.js); never in Janna's calls */
    var on = function (k, fn) { if (E[k]) c.addListener(E[k], function (a, b) { if (LV !== me || me.closed) return; try { fn(a, b); } catch (x) {} }); };
    contWire(me, on);
    me.nz = me.nz || nzNew(); nzWire(me, on); /* «وضع الدوشة»: after contWire, so a continued part's cut greeting is already marked */
    langWire(me, on); /* 🌐 this tab's choice again (after contCtx), applied / refused */
    on("MIC_PERMISSION_PENDING", function () { if (!me.ready && !me.cont) { me.micAsk = true; sdkUi("connecting", micAskTx() + sdkName()); } });
    on("MIC_PERMISSION_GRANTED", function () { if (me.micAsk) { me.micAsk = false; if (!me.ready && !me.closed && !me.cont) sdkUi("connecting", connMsg(me)); } });
    /* the SDK keeps the call without a microphone: the text box still works */
    on("MIC_PERMISSION_DENIED", function () { me.micAsk = false; me.micDenied = true; updCtl(); say(INAPP ? T("الميكروفون مقفول للتطبيق — تقدر تكتب في الخانة تحت، أو تفتحه من ", "The microphone is off for the app — you can type in the box below, or turn it on in ") + micWhereTx() + "." : T("الميكروفون مقفول للموقع ده — تقدر تكتب في الخانة تحت، أو تسمح بالميكروفون من إعدادات المتصفح.", "The microphone is blocked for this site — you can type in the box below, or allow the microphone in your browser settings.")); });
    on("CONNECTION_ESTABLISHED", function () { tmMark(me, "connected"); relaySlow(me); });
    tmTurns(me, on); /* the reasoning time of each reply, for the call's end (numbers only) */
    on("SESSION_READY", function (sid) {
      if (me.ready) return; /* once per call, even if the engine repeats it after a reconnect */
      clearTimeout(me.connT); me.ready = true; me.st = "live"; me.sid = String(sid || ""); me.t0 = Date.now(); tmMark(me, "ready"); sdkUi("live"); sdkTimers(me);
      if (me.cont) contReady(me); else sdkFire("session-started", { sessionId: me.sid });
    });
    on("DATA_CHANNEL_OPEN", function () { me.dc = true; updCtl(); if (NUDGE && me.ready) nudge(NUDGE, 0); });
    on("VIDEO_PLAY_STARTED", function () { me.playing = true; tmMark(me, "play"); var b = sdkBox(); if (b) b.classList.add("on"); });
    on("VIDEO_STREAM_STARTED", function () { tmMark(me, "video"); setTimeout(function () { sdkPlay(me); }, 0); });
    /* complete messages, as the widget reports them (captions.js, the meeting agenda) */
    on("MESSAGE_HISTORY_UPDATED", function (msgs) {
      msgs = msgs || [];
      for (var i = me.msgN; i < msgs.length; i++) { var m = msgs[i] || {}; if (contSkip(me, m)) continue; contLog(me, m); sdkFire("message-received", { role: m.role === "persona" ? "agent" : "user", content: String(m.content || "") }); }
      me.msgN = msgs.length;
    });
    /* what he/she is saying right now: the screens follow the words (holoTopic) */
    on("MESSAGE_STREAM_EVENT_RECEIVED", function (ev) { ev = ev || {}; if (ev.role === "user") heardAdd(String(ev.id || ""), String(ev.content || "")); /* his words: a dictated address, «he spoke since it was shown» */ if (ev.role !== "persona" || (me.skip && me.skip[String(ev.id || "")])) return; tmMark(me, "voice"); var k = String(ev.id || "m"); HT.buf[k] = (HT.buf[k] || "") + String(ev.content || ""); holoTopic(HT.buf[k]); if (window.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS.follow) { try { MIG_LIVE_TOOLS.follow(HT.buf[k], k); } catch (x) {} } });
    on("TOOL_CALL_STARTED", function (d) { d = d || {}; sdkTool(me, d.toolName, d.toolType, d.arguments, d.toolCallId); });
    on("CLIENT_TOOL_EVENT_RECEIVED", function (d) { d = d || {}; sdkTool(me, d.eventName, "client", d.eventData, ""); }); /* older engines */
    /* the outcome of a tool call (server webhook bassem_intel included): data/bassem-intel-view.js shows exactly what Bassem got */
    on("TOOL_CALL_COMPLETED", function (d) { d = d || {}; urlsKeep(d.result); sdkFire("tool-call-completed", { toolName: String(d.toolName || ""), toolType: String(d.toolType || ""), toolSubtype: String(d.toolSubtype || ""), toolCallId: String(d.toolCallId || ""), result: d.result, executionTime: d.executionTime }); });
    on("TOOL_CALL_FAILED", function (d) { d = d || {}; sdkFire("tool-call-failed", { toolName: String(d.toolName || ""), toolType: String(d.toolType || ""), toolCallId: String(d.toolCallId || ""), errorMessage: String(d.errorMessage || "") }); });
    /* bassem_save_profile (CLIENT tool, awaitResult): the handler's answer goes back to Bassem as the tool result, so he says «اتسجّل»
       only when the platform saved it; the DOM path (run → bassemTool) leaves this tool to the handler (me.own) */
    if (persona === "bassem" && c.registerToolCallHandler) {
      try { c.registerToolCallHandler("bassem_save_profile", { onStart: function (pl) { return LV !== me || me.closed ? T("ماتسجّلش: المكالمة اتقفلت.", "Not saved: the call was closed.") : profileTool(pl && pl.arguments); } }); me.own.bassem_save_profile = 1; } catch (e) {}
      /* janna_follow (critic D): the follow's real outcome goes back to Bassem (his own copy of the tool with awaitResult — the shared tool
         stays fire-and-forget for Janna), so he never promises alerts for a follow that was refused; run() leaves the call to this handler */
      try { c.registerToolCallHandler("janna_follow", { onStart: function (pl) { var x = pl && pl.arguments; if (typeof x === "string") { try { x = JSON.parse(x); } catch (e) { x = {}; } } return LV !== me || me.closed ? T("مااتحفظتش: المكالمة اتقفلت.", "Not saved: the call was closed.") : followTool(x || {}); } }); me.own.janna_follow = 1; } catch (e) {}
      /* the e-mail tools ANSWER Bassem (awaitResult, owner 2026-11-19 «كل ما اديله اوردر انه يبعت ايميل بيقولي معرفش»): after a draft, what is on
         the screen and «قوله ملخصه، واسأله تحب أبعته؟»; after a send, «اتبعت» ONLY when the platform answered sent (mailTool) */
      ["bassem_draft_email", "bassem_send_email"].forEach(function (tn) {
        try { c.registerToolCallHandler(tn, { onStart: function (pl) { return LV !== me || me.closed ? T("مااتعملش: المكالمة اتقفلت.", "Not done: the call was closed.") : mailTool(tn, pl && pl.arguments); } }); me.own[tn] = 1; } catch (e) {}
      });
    }
    on("CONNECTION_CLOSED", function (code, details) { sdkClosed(me, String(code || ""), String(details || "")); });
    /* our own microphone (echo cancellation, noise suppression, voice isolation where offered) goes with the stream: the session starts
       once the browser answered (MIC_WAIT at most), else — or when ours failed — the SDK captures the microphone itself, as before */
    micFor(me).then(function (ms) {
      if (LV !== me || me.stopped || me.closed) { micStop(ms); return; } /* ✕ while the browser was asking */
      if (!ms && INAPP === "android" && (me.micDenied || me.micErr === "NotAllowedError")) { ms = silentMic(); if (ms) { var was = me.micDenied; me.micDenied = true; updCtl(); if (!was) say(T("الميكروفون مقفول للتطبيق — تقدر تكتب في الخانة تحت، أو تفتحه من ", "The microphone is off for the app — you can type in the box below, or turn it on in ") + micWhereTx() + "."); } }
      me.micUsed = ms ? (me.micDenied ? "none" : "own") : "sdk"; tmMark(me, "mic");
      /* no session after 45 s (the widget's own start-up limit): stop and say so */
      me.connT = setTimeout(function () { if (LV !== me || me.ready || me.closed) return; me.stopped = true; try { c.stopStreaming(); } catch (x) {} if (!me.closed) sdkFail(me, "start"); }, 45000);
      tmMark(me, "stream");
      var pr; try { pr = ms ? c.streamToVideoElement(vid.id, ms) : c.streamToVideoElement(vid.id); } catch (e) { pr = Promise.reject(e); }
      Promise.resolve(pr).then(function () { if (LV !== me || me.stopped) { try { c.stopStreaming(); } catch (x) {} } }, function () {
        try { c.stopStreaming(); } catch (x) {}
        if (LV === me && !me.closed) { if (me.stopped) { me.closed = true; sdkUi("idle"); } else sdkFail(me, me.micDenied ? "mic" : "start"); }
      });
    });
  }
  /* ---------- Bassem's screen tools (data/bassem-live-tools.js): loaded lazily when his call opens, with THIS file's ?v= (the build can set
     window.MIGVER_LT = "?v=<hash of bassem-live-tools.js>" to bust it on its own). A client created before the file arrived waits in
     window.__migLTQ and is attached on load (its handlers only have to exist before the first tool call). ---------- */
  var LT = (function () { var s = document.querySelector('script[src*="data/janna-live.js"]'), src = s ? s.src : "", m = /[?&]v=([\w.-]+)/.exec(src); return { base: src ? src.replace(/data\/janna-live\.js.*$/, "") : "", v: m ? m[1] : "" }; })(), ltOn = false;
  function loadTools() {
    if (window.MIG_LIVE_TOOLS || ltOn) return; ltOn = true;
    var sc = document.createElement("script"); sc.src = LT.base + "data/bassem-live-tools.js" + (window.MIGVER_LT || (LT.v ? "?v=" + LT.v : "")); sc.charset = "utf-8"; sc.async = true;
    sc.onerror = function () { ltOn = false; if (sc.parentNode) sc.parentNode.removeChild(sc); };
    document.head.appendChild(sc);
  }
  function liveTools(c) {
    var h = { persona: persona, frame: function () { return frame; }, go: go, say: say, run: run, ov: function () { return ov; }, link: function (u) { return withLang(url(u)); }, shown: lookupShown };
    if (window.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS.attach) { try { MIG_LIVE_TOOLS.attach(c, h); } catch (e) {} } else { loadTools(); (window.__migLTQ = window.__migLTQ || []).push([c, h]); }
  }

  /* ---------- no time wall (owner 2026-11-18: «مينفعش باسم يبقى محدد بوقت … ده مستشار، المفروض يبقى معايا لغاية لما أخلص») ----------
     Anam ends each session at its max_session_sec (the Worker's value), so one call is a CHAIN of sessions on the same <video>:
     · max−60 s: the next token is minted in the background (the same POST /api/janna/session; the conversation so far reaches the next
       session ONLY through addContext() — never in the token request, review 2026-11-18 #15); a transient refusal is asked once more at
       max−20 s; if there is still no token the member is told how long is left and the call stops at max_session_sec (review #4, #14);
     · from max−20 s the next session starts in the first pause (nobody speaking for 1.2 s: the persona's text stream, its voice level, the
       visitor's speech events, and no tool still reading the screen), at max−5 s in any case, or at once when the engine ends the session for
       its length (CONNECTION_CLOSED near the cap or "max duration");
     · the old session's microphone is muted, the new one streams to the SAME video element (its first frame replaces the old picture), then
       the old one is stopped; a 1–2 s «باسم معاك…» shimmer instead of the end screen; the shared screen, the hologram and the captions stay
       as they are (no session-ended / session-started — a "session-continued" event instead);
     · a saved persona cannot skip its greeting per session (Anam: skipGreeting is persona config; a token for a saved persona takes only
       personaId), so the new part's greeting is cut at its first words (interruptPersona, the video muted until then, kept out of the
       captions / the log / the screens) and the conversation so far + the screen reach its LLM with addContext() (used on the next turn);
     · at most CHAIN_HOURS hours in all (window.JANNA_LIVE_CHAIN_HOURS, default 4) and CHAIN_MAX continuations (window.JANNA_LIVE_CHAIN_MAX,
       default 24); never after the visitor's ✕, closing or leaving; Bassem only (window.JANNA_LIVE_CHAIN_ALL = 1: Janna too, never during a
       meeting). The last part keeps today's 2-minute warning.
     A refused token (rate limit, daily cap …) ends the call as today, with the reason said; a new part that fails to start hands the call
     back to the part that is still running (review #14). */
  var CHAIN_MAX = (function () { var n = parseInt(window.JANNA_LIVE_CHAIN_MAX, 10); return n >= 0 && n <= 96 ? n : 24; })();
  var CHAIN_HOURS = (function () { var h = parseFloat(window.JANNA_LIVE_CHAIN_HOURS); return h > 0 && h <= 12 ? h : 4; })();
  /* the Worker's session length; Anam's own platform limit for one session is 2 hours (a bigger plan sends a bigger max_session_sec) */
  function maxOf(j) { return Math.max(60, Math.min(7200, +(j && j.max_session_sec) || CAP_MIN * 60)); }
  function chainOk(me) { var c = me && me.chain; return !!c && !c.userEnded && c.n < CHAIN_MAX && Date.now() - c.t0 < CHAIN_HOURS * 3600000 && (persona === "bassem" || !!window.JANNA_LIVE_CHAIN_ALL) && !(MT && !MT.done); }
  function contTimers(me, ms) {
    me.timers.push(setTimeout(function () { if (LV === me && !me.closed) contPrep(me); }, Math.max(1000, ms - 60000)));
    me.timers.push(setTimeout(function () { if (LV === me && !me.closed) contWatch(me); }, Math.max(2000, ms - 20000)));
    me.timers.push(setTimeout(function () { if (LV === me && !me.closed) contGo(me, "time"); }, Math.max(3000, ms - 5000)));
    /* review #4: no next part by max_session_sec (refused / failed token) → the call stops here, as without a chain; a token still on its
       way gets 8 s more (the engine's own cut then continues the call) */
    var stopAt = function (late) {
      if (LV !== me || me.closed || me.swapped) return;
      if (!late && me.next && me.next.st === "minting" && chainOk(me)) { me.timers.push(setTimeout(function () { stopAt(true); }, 8000)); return; }
      sdkStop("max");
    };
    me.timers.push(setTimeout(function () { stopAt(false); }, ms));
  }
  /* how long is left in this part, said when no continuation could be prepared (built from max_session_sec, review #4 / #9) */
  function contLeftMsg(me) {
    var left = Math.max(5, Math.round(((me.t0 || Date.now()) + me.max * 1000 - Date.now()) / 1000)), mins = Math.round(me.max / 60);
    var ar = left >= 90 ? Math.round(left / 60) + " دقايق" : left + " ثانية", en = left >= 90 ? Math.round(left / 60) + " minutes" : left + " seconds";
    return T("⏳ المكالمة هتقف بعد حوالي " + ar + " (حد الجلسة " + mins + " دقيقة) — مقدرتش أجهّز التكملة", "⏳ The call will stop in about " + en + " (the session limit is " + mins + " minutes) — the continuation could not be prepared");
  }
  /* a refusal that will not change in a few seconds (no second try) */
  function contFinal(e) { return /^(rate_limited|daily_cap|plan|login_required|full_login_required|unauthorized|forbidden)$/.test(String((e && e.code) || "")); }
  /* the persona's words without the cue-like tokens Anam did not take as cues (it strips only the tags it knows; seen live: «[صاف] معاك
     حق…» at the start of a Janna reply) — the rule of worker/src/text.js stripCues, which worker/test/cue-tags.test.mjs compares with this
     one: "[" + 1–24 letters of any script, spaces, "-" or "_" + "]" (a letter in it), with the spaces around it; digits («[1]»), a link's
     text «[x](…)» and a token glued to a link or an address stay. ES5 has no \p{L}: a "letter" is a character outside the ASCII
     non-letters and the digit / punctuation / symbol / surrogate ranges of CUE_NL (the way nzNorm keeps every script's letters) */
  var CUE_NL = "\\x7b-\\xbf\\xd7\\xf7\\u0600-\\u060f\\u061b-\\u061f\\u0660-\\u066d\\u06d4\\u06f0-\\u06f9\\u0964-\\u096f\\u2000-\\u2bff\\u3000-\\u303f\\ud800-\\udfff\\ufe00-\\ufe0f\\ufeff\\uff00-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65";
  var CUE_RUN = new RegExp("(?:[ \\t]{0,8}\\[(?=[ _-]{0,23}[^\\x00-\\x40\\x5b-\\x60" + CUE_NL + "])[^\\x00-\\x1f\\x21-\\x2c\\x2e-\\x40\\x5b-\\x5e\\x60" + CUE_NL + "]{1,24}\\](?!\\())+[ \\t]*", "g");
  var CUE_LOOSE = /(?:^|\s)[^\s\/=?&#@:\[\]]*$/, CUE_ROLE = /\[(?:INST|SYS|SYSTEM)\]/i, CUE_OPEN = /^$|[\n(\[{«"'“‘]$/, CUE_CLOSE = /^$|^[\n.,;:!?،؛؟…)\]}»"'”’]/;
  function cueStrip(v) {
    var s = String(v == null ? "" : v), out = s.replace(CUE_RUN, function (m, i) {
      if ((m.charAt(0) === "[" && !CUE_LOOSE.test(s.slice(Math.max(0, i - 300), i))) || CUE_ROLE.test(m)) return m; /* part of a link / an address / a bigger bracket; a role marker */
      return CUE_OPEN.test(s.slice(Math.max(0, i - 1), i)) || CUE_CLOSE.test(s.slice(i + m.length, i + m.length + 1)) ? "" : " ";
    });
    return out === s ? s : out.trim();
  }
  /* the whole call's conversation (every part), for the next part's context — the persona's own words through cueStrip (they reach the
     next session's LLM as «باسم: …»); the member's words exactly as before */
  function contLog(me, m) { var c = me.chain; if (!c) return; var t = String(m.content || ""); if (m.role === "persona") t = cueStrip(t); t = t.replace(/\[[a-z_ -]{2,24}\]/gi, "").replace(/\s+/g, " ").trim(); if (!t) return; c.log.push({ role: m.role === "persona" ? "persona" : "user", text: t.slice(0, 1200) }); if (c.log.length > 60) c.log.splice(0, c.log.length - 60); }
  function resumeOf(me) {
    var L = (me.chain && me.chain.log) || [], out = [], n = 0;
    for (var i = L.length - 1; i >= 0 && out.length < 16; i--) { var t = L[i].text.slice(0, 700); if (n + t.length > 3500) break; n += t.length; out.unshift({ role: L[i].role, text: t }); }
    return out;
  }
  function resumeText(me) {
    var r = resumeOf(me), nm = sdkName(), scr = "";
    try { scr = window.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS.screenText ? MIG_LIVE_TOOLS.screenText() : ""; } catch (e) {}
    var s = "[CONTINUATION of the same live call — part " + (me.chain.n + 1) + "] The video connection was renewed automatically (one session has a fixed maximum length). The member is still with you and did not hang up. Do NOT greet again, do not introduce yourself, do not mention any reconnection or time limit: continue exactly where the conversation stopped and answer the member's next words in context.";
    if (scr) s += "\nOn the shared screen now: " + scr;
    var lc = langOn() ? langStored() : ""; if (lc) s += "\nLANGUAGE: " + lc + " (" + langRow(lc)[3] + "): continue only in " + langRow(lc)[3] + ".";
    var pl = ""; try { pl = window.MIGCHATMEDIA && MIGCHATMEDIA.resumeLine ? MIGCHATMEDIA.resumeLine(me.chain) : ""; } catch (e) { pl = ""; } if (pl) s += "\n" + pl; /* 📎 */
    if (r.length) s += "\nThe conversation so far (oldest first):\n" + r.map(function (m) { return (m.role === "user" ? "Member: " : nm + ": ") + m.text; }).join("\n");
    return s.slice(0, 6000);
  }
  /* max−60 s: the next token, in the background */
  function contPrep(me, retry) {
    if (!chainOk(me) || me.stopped) return;
    if (me.next) { if (!retry || me.next.st !== "failed" || me.next.retried || contFinal(me.next.err)) return; } /* one more try at max−20 s */
    var nx = me.next = { st: "minting", token: "", max: 0, err: null, want: "", retried: !!retry }, p = persona;
    mint(p)
      .then(function (j) { nx.st = "ready"; nx.token = j.sessionToken; nx.max = maxOf(j); nx.mt = typeof j.media_ticket === "string" ? j.media_ticket : ""; if (nx.want && LV === me) contGo(me, nx.want); },
        function (e) {
          nx.st = "failed"; nx.err = e || {};
          if (nx.want && contGo(me, nx.want)) return;
          if (LV === me && !me.closed && !me.warnedEnd && (nx.retried || nx.want || contFinal(nx.err))) { me.warnedEnd = true; say(contLeftMsg(me)); }
        });
  }
  /* is anybody speaking, or is a tool still reading the screen? (never switch mid-sentence) */
  function contQuiet(me) {
    var t = Date.now(), s = me.spk || {};
    if (s.user || t - (s.userT || 0) < 1200 || s.on || t < (s.until || 0)) return false;
    if (me.lvl) { var v = -1; try { v = me.lvl(); } catch (e) { me.lvl = null; } if (v > 0.015) s.loudT = t; if (v >= 0 && t - (s.loudT || 0) < 1200) return false; }
    try { if (window.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS.busy && MIG_LIVE_TOOLS.busy()) return false; } catch (e) {}
    return true;
  }
  function contWatch(me) {
    if (me.watchT || !chainOk(me)) return; contPrep(me, true); contMeter(me);
    me.watchT = setInterval(function () { if (LV !== me || me.closed || me.swapped) { clearInterval(me.watchT); return; } if (contQuiet(me)) contGo(me, "pause"); }, 250);
    me.timers.push(me.watchT);
  }
  /* the persona's voice level (Web Audio on the video's own stream, not connected to the speakers); -1 = not measurable */
  function contMeter(me) {
    if (me.lvl !== undefined) return; me.lvl = null;
    if (me.nzLvl) { me.lvl = me.nzLvl; return; } /* the noise guard's meter on this part's voice (one analyser, its context made inside the «ابدأ» tap) */
    try {
      var AC = window.AudioContext || window.webkitAudioContext, bx = sdkBox(), v = bx && bx.querySelector("video"), st = v && v.srcObject;
      if (!AC || !st || !st.getAudioTracks || !st.getAudioTracks().length) return;
      var ac = me.ac = new AC(); if (ac.state !== "running" && ac.resume) ac.resume().then(null, function () {});
      var an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(st).connect(an);
      var buf = new Uint8Array(an.fftSize);
      me.lvl = function () { if (ac.state !== "running") return -1; an.getByteTimeDomainData(buf); var q = 0; for (var i = 0; i < buf.length; i++) { var x = (buf[i] - 128) / 128; q += x * x; } return Math.sqrt(q / buf.length); };
    } catch (e) { me.lvl = null; }
  }
  /* this part's speaking state + the continued part's own steps (registered before sdkRun's other listeners) */
  function contWire(me, on) {
    var s = me.spk = { on: false, until: 0, user: false, userT: 0, loudT: 0, id: "", t0: 0, n: 0 };
    on("MESSAGE_STREAM_EVENT_RECEIVED", function (ev) {
      ev = ev || {}; if (ev.role !== "persona") return;
      var id = String(ev.id || "");
      if (me.cont && contGreet(me, id, ev)) return;
      if (id !== s.id) { s.id = id; s.t0 = Date.now(); s.n = 0; }
      s.n += String(ev.content || "").length; s.on = !ev.endOfSpeech && !ev.interrupted;
      s.until = ev.interrupted ? Date.now() + 400 : Math.max(s.until, s.t0 + s.n * 75 + 700); /* the voice lags the text: ~75 ms a character */
    });
    on("USER_SPEECH_STARTED", function () { s.user = true; s.userT = Date.now(); if (me.cont) me.cont.userSpoke = true; }); /* contGreet tells the greeting from an answer to these words */
    on("USER_SPEECH_ENDED", function () { s.user = false; s.userT = Date.now(); });
    on("DATA_CHANNEL_OPEN", function () { if (me.cont) setTimeout(function () { contCtx(me); }, 0); });
    on("VIDEO_PLAY_STARTED", function () { if (me.cont) contPlaying(me); });
  }
  /* now: the next part (why: "pause" | "time" | "cut") */
  function contGo(me, why) {
    if (me.swapped || LV !== me || !chainOk(me) || me.stopped || (me.closed && why !== "cut")) return false; /* ✕ / max stop / ended: no next part */
    var nx = me.next;
    if (!nx) { contPrep(me); nx = me.next; if (!nx) return false; }
    if (nx.st === "failed") { if (why !== "cut") { contUi(false); return false; } contFail(me, nx.err); return true; } /* the engine ends it, then the reason is said */
    if (why !== "pause" || nx.st === "ready") contUi(true);
    if (nx.st !== "ready") { if (!nx.want || why === "cut") nx.want = why; return true; }
    me.swapped = true; clearInterval(me.watchT);
    var bx = sdkBox(), v = bx && bx.querySelector("video");
    try { if (me.client && !me.closed) me.client.muteInputAudio(); } catch (e) {}
    if (v) v.muted = true; /* until the new part's greeting is cut */
    me.chain.n++;
    var me2 = { gen: ++LVN, st: "connecting", client: null, sid: "", ready: false, dc: false, playing: false, closed: false, stopped: false, stopReason: "", textOnly: me.textOnly, muted: me.muted, micDenied: me.micDenied, seen: {}, msgN: 0, max: nx.max || me.max, timers: [], connT: 0, own: {}, mt: nx.mt || me.mt || "",
      chain: me.chain, cont: { prev: me, why: why, t: Date.now(), greet: "", src: v ? v.srcObject : null } };
    LV = me2;
    loadSdk().then(function (A) { if (LV === me2 && !me2.stopped) sdkRun(me2, A, nx.token); }, function () { if (LV === me2) contFail(me2, { code: "sdk_load" }); });
    return true;
  }
  /* the engine ended this part: its length → the next part at once, no end screen (an inactivity / end_call end is a real end) */
  function contCut(me, code, details) {
    if (!me.ready || me.stopReason || me.swapped || !chainOk(me)) return false;
    var el = (Date.now() - (me.t0 || Date.now())) / 1000, d = String(details || "");
    if (/inactiv|silence|USER_REQUESTED|end_call|api_requested/i.test(d) || /MICROPHONE/.test(code)) return false;
    if (!(/max|duration|length|limit/i.test(d) || el >= me.max - 45)) return false;
    me.closed = true; me.st = "ended"; sdkClear(me); me.client = null; /* the video keeps its last picture under the shimmer */
    if (contGo(me, "cut")) return true;
    me.closed = false; return false;
  }
  /* the continued part is ready: the old one goes when the new picture plays (at the latest 5 s later) */
  function contReady(me) {
    var g = me.cont;
    sdkFire("session-continued", { sessionId: me.sid, part: me.chain.n + 1, previous: g.prev ? g.prev.sid : "" });
    if (me.muted) { try { me.client.muteInputAudio(); } catch (e) {} }
    setTimeout(function () { contCtx(me); }, 0);
    setTimeout(function () { if (g.greet !== "cut") g.greet = "done"; contUnmute(me); }, 7000);
    g.retT = setTimeout(function () { contPlaying(me); }, 5000);
  }
  function contCtx(me) {
    var g = me.cont; if (!g || g.ctx || !me.ready || !me.dc || !me.client || LV !== me) return;
    g.ctx = true; try { me.client.addContext(resumeText(me)); } catch (e) { g.ctx = false; }
  }
  /* the new part's greeting: cut at its first words, kept out of the captions, the log and the screens */
  function contGreet(me, id, ev) {
    var g = me.cont, sp = me.spk || {};
    if (g.greet === "cut" || g.greet === "done") {
      if (id && id === g.greetId && ev) { if (ev.interrupted || ev.endOfSpeech) g.cutOk = true; else g.lastChunk = Date.now(); } /* is the cut greeting still talking? */
      return !!(me.skip && me.skip[id]);
    }
    /* the member spoke first: speech that starts > 1 s after his words ended is the answer to them (heard); earlier, it is the greeting */
    if (Date.now() - g.t > 20000 || (g.userSpoke && !sp.user && sp.userT && Date.now() - sp.userT > 1000)) { g.greet = "done"; contUnmute(me); return false; }
    g.greet = "cut"; me.skip = me.skip || {}; me.skip[id] = 1; g.greetId = id;
    try { me.client.interruptPersona(); } catch (e) {}
    /* unmuted only once the greeting stopped: still streaming 900 ms later → interrupted once more, unmuted after at most 2.5 s */
    setTimeout(function () {
      if (!g.cutOk && g.lastChunk && Date.now() - g.lastChunk < 600) { try { if (me.client) me.client.interruptPersona(); } catch (e) {} setTimeout(function () { g.greet = "done"; contUnmute(me); }, 1600); return; }
      g.greet = "done"; contUnmute(me);
    }, 900);
    return true;
  }
  /* MESSAGE_HISTORY: the first persona message of a continued part is its cut greeting (by id, else by position) */
  function contSkip(me, m) {
    var g = me.cont;
    if (!g || !g.greetId || g.histSkipped || !m || m.role !== "persona") return !!(me.skip && m && me.skip[String(m.id || "")]);
    g.histSkipped = true; return true;
  }
  function contUnmute(me) { var bx = sdkBox(), v = bx && bx.querySelector("video"); if (v && LV === me) v.muted = false; }
  function contPlaying(me) {
    var g = me.cont; if (!g || g.playing) return; g.playing = true; clearTimeout(g.retT);
    if (g.prev) contRetire(g.prev);
    setTimeout(function () { if (LV === me) contUi(false); }, 350);
  }
  /* an old part, stopped quietly (its CONNECTION_CLOSED is ignored: it is not LV any more) */
  function contRetire(o) {
    if (!o || o.retired) return; o.retired = true; o.swapped = true; tmTurnsSend(o); /* the first part's reply times (numbers only) */
    sdkClear(o); clearInterval(o.watchT); try { if (o.ac) o.ac.close(); } catch (e) {} o.ac = null;
    var c = o.client; o.closed = true; o.st = "ended"; o.client = null;
    if (c) { try { var p = c.stopStreaming(); if (p && p.then) p.then(null, function () {}); } catch (e) {} }
  }
  function contEnd(me) {
    if (!me) return; clearInterval(me.watchT); try { if (me.ac) me.ac.close(); } catch (e) {} me.ac = null;
    if (me.cont && me.cont.prev) contRetire(me.cont.prev);
    var bx = sdkBox(), v = bx && bx.querySelector("video"); if (v) v.muted = false;
  }
  /* the engine already ended this part and the next one is still on its way: the visitor's ✕ ends the call now (review #5) */
  function contAbort(me, reason) {
    me.stopped = true; if (!me.stopReason) me.stopReason = reason; me.swapped = true; /* the token that arrives later starts nothing */
    contUi(false); contEnd(me);
    var bx = sdkBox(), v = bx && bx.querySelector("video"); if (bx) bx.classList.remove("on"); try { if (v) v.srcObject = null; } catch (x) {}
    sdkFire("session-ended", { sessionId: me.sid, reason: "user_ended_during_continuation" });
    sdkUi("ended", T("المكالمة انتهت.", "The call has ended."));
  }
  /* review #14: the new part failed before it was ready while the previous part still runs → back to the previous part, which keeps the
     call until its own end (its stop timer); no error screen in the middle of the call */
  function contBack(me2) {
    var g = me2 && me2.cont, o = g && g.prev;
    if (!o || o.closed || o.retired || o.stopped || LV !== me2 || me2.ready) return false;
    var c2 = me2.client; me2.closed = true; me2.st = "error"; sdkClear(me2); me2.client = null; me2.cont = null;
    if (c2) { try { var p = c2.stopStreaming(); if (p && p.then) p.then(null, function () {}); } catch (x) {} }
    LV = o; o.swapped = false; if (o.chain) o.chain.n = Math.max(0, o.chain.n - 1); o.next = { st: "failed", err: { code: "start" }, retried: true, want: "" };
    var bx = sdkBox(), v = bx && bx.querySelector("video");
    try { if (v && g.src && v.srcObject !== g.src) { v.srcObject = g.src; var pp = v.play(); if (pp && pp.then) pp.then(null, function () {}); } } catch (x) {}
    if (v) v.muted = false; if (bx) bx.classList.add("on");
    try { if (o.client && !o.muted && !(o.nz && o.nz.gate)) o.client.unmuteInputAudio(); } catch (x) {} /* noisy-room mode: the gate reopens it when she is quiet */
    contUi(false);
    if (!o.warnedEnd) { o.warnedEnd = true; say(contLeftMsg(o)); }
    return true;
  }
  /* the next part could not start: the call ends as today, with the reason */
  function contFail(me, e) {
    if (contBack(me)) return;
    var c = String((e && e.code) || ""), why = c === "rate_limited" ? T("اتفتحت مكالمات كتير من نفس الشبكة الساعة دي", "too many calls from this network this hour") : c === "daily_cap" ? T("مكالمات الفيديو خلصت لليوم", "today's live calls are used up") : /^(plan|login_required|full_login_required)$/.test(c) ? T("الدخول أو الباقة محتاجين تأكيد", "your sign-in or plan needs confirming") : T("الاتصال ماكملش", "the connection did not go through");
    if (me.chain) me.chain.userEnded = true;
    contEnd(me);
    var c2 = me.client; me.closed = true; me.st = "ended"; sdkClear(me); me.client = null;
    if (c2) { try { var p = c2.stopStreaming(); if (p && p.then) p.then(null, function () {}); } catch (x) {} }
    var bx = sdkBox(), v = bx && bx.querySelector("video"); if (bx) bx.classList.remove("on"); try { if (v) v.srcObject = null; } catch (x) {}
    contUi(false);
    sdkFire("session-ended", { sessionId: me.sid, reason: "continuation_failed:" + c });
    sdkUi("ended", T("المكالمة وصلت لحد الجلسة ومقدرتش أكمّلها تلقائياً (" + why + "). تقدر تبدأ مكالمة جديدة.", "The call reached the session limit and could not continue automatically (" + why + "). You can start a new call."));
  }
  /* «باسم معاك…»: a subtle shimmer over the video while the next part connects (12 s at most) */
  var contCss = 0;
  function contUi(on) {
    var bx = sdkBox(); if (!bx) return;
    var el = bx.querySelector(".jv-cont");
    if (!on) { if (el) { el.classList.remove("on"); clearTimeout(el.__t); } return; }
    if (!contCss) {
      contCss = 1; var st = document.createElement("style");
      st.textContent = '.jnl-sdk .jv-cont{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;transition:opacity .35s ease;display:flex;align-items:flex-end;justify-content:center;padding-bottom:86px;background:linear-gradient(100deg,rgba(5,9,12,0) 30%,rgba(120,220,255,.18) 50%,rgba(5,9,12,0) 70%) 0 0/250% 100% no-repeat;animation:jvShim 1.6s linear infinite}'
        + '.jnl-sdk .jv-cont.on{opacity:1}.jnl-sdk .jv-cont span{padding:6px 16px;border-radius:999px;background:rgba(4,18,26,.8);border:1px solid rgba(233,196,106,.6);color:#fff;font-weight:800;font-size:.92rem;box-shadow:0 0 22px -6px rgba(90,210,255,.85)}'
        + '@keyframes jvShim{0%{background-position:120% 0}100%{background-position:-120% 0}}@media (prefers-reduced-motion:reduce){.jnl-sdk .jv-cont{animation:none}}';
      document.head.appendChild(st);
    }
    if (!el) { el = document.createElement("div"); el.className = "jv-cont"; el.setAttribute("role", "status"); el.innerHTML = "<span></span>"; bx.appendChild(el); }
    el.querySelector("span").textContent = who(["جنة معاك…", "باسم معاك…"], ["Janna is with you…", "Bassem is with you…"]);
    el.classList.add("on"); clearTimeout(el.__t); el.__t = setTimeout(function () { el.classList.remove("on"); }, 12000);
  }
  /* autoplay with sound needs the visitor's tap on some browsers: then one more tap plays the video */
  function sdkPlay(me) {
    var bx = sdkBox(), v = bx && bx.querySelector("video"); if (!v || !v.paused || LV !== me || me.closed) return;
    var p; try { p = v.play(); } catch (e) { p = null; }
    if (p && p.then) p.then(null, function () {
      if (LV !== me || me.closed) return;
      var st = bx.querySelector(".jv-st"); st.classList.remove("wait"); st.textContent = T("اضغط على الفيديو علشان تسمع ", "Tap the video to hear ") + sdkName();
      bx.addEventListener("click", function once() { bx.removeEventListener("click", once); st.textContent = ""; try { var q = v.play(); if (q && q.then) q.then(null, function () {}); } catch (e) {} });
    });
  }
  function sdkFire(name, detail) {
    var el = sdkBox(); if (!el) return;
    var ev = null;
    try { ev = new CustomEvent("anam-agent:" + name, { detail: detail, bubbles: true, composed: true }); } catch (e) { try { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("anam-agent:" + name, true, false, detail); } catch (x) { ev = null; } }
    if (ev) el.dispatchEvent(ev);
  }
  /* one tool call = one action, even when the engine reports it on both channels (dedicated event + legacy client event) */
  function sdkTool(me, name, type, args, id) {
    if (!name) return;
    if (typeof args === "string") { try { args = JSON.parse(args); } catch (e) { args = {}; } }
    args = args && typeof args === "object" ? args : {};
    var k = "", now = Date.now(); try { k = String(name) + "|" + JSON.stringify(args); } catch (e) { k = String(name); }
    if ((id && me.seen["#" + id]) || (me.seen[k] && now - me.seen[k] < 1500)) return;
    if (id) me.seen["#" + id] = now; me.seen[k] = now;
    sdkFire("tool-call-started", { toolName: String(name), toolType: type == null ? "" : String(type), toolCallId: id || "", arguments: args });
  }
  function sdkTimers(me) {
    var ms = me.max * 1000;
    if (chainOk(me)) { contTimers(me, ms); return; }
    if (me.max > 180) me.timers.push(setTimeout(function () { if (LV === me && !me.closed && !(MT && !MT.done)) say(T("⏳ باقي دقيقتين على نهاية المكالمة", "⏳ 2 minutes left in this call")); }, ms - 120000));
    me.timers.push(setTimeout(function () { if (LV === me && !me.closed) sdkStop("max"); }, ms));
  }
  function sdkClear(me) { clearTimeout(me.connT); for (var i = 0; i < me.timers.length; i++) clearTimeout(me.timers[i]); me.timers = []; nzEnd(me); }
  function sdkStop(reason) {
    var me = LV; if (!me) return;
    if (me.closed) { if (me.chain && reason !== "max") { me.chain.userEnded = true; if (me.next && !me.swapped && me.next.want === "cut" && me.next.st === "minting") contAbort(me, reason); } return; } /* review #5: ✕ while the next part is on its way after the engine's cut */
    me.stopped = true; if (!me.stopReason) me.stopReason = reason;
    if (me.chain && reason !== "max") me.chain.userEnded = true; /* never auto-continue after the visitor ended the call */
    if (me.cont && me.cont.prev) contRetire(me.cont.prev);
    var c = me.client;
    if (c) { try { var p = c.stopStreaming(); if (p && p.then) p.then(null, function () {}); } catch (e) {} }
    /* the SDK reports CONNECTION_CLOSED itself; a client that has not connected yet does not, so the call is closed here */
    if (!me.closed && (c || reason !== "close")) sdkClosed(me, "CONNECTION_CLOSED_CODE_NORMAL", "");
  }
  function sdkClosed(me, code, details) {
    if (me.closed) return;
    if (contCut(me, code, details)) return;
    me.closed = true; me.st = "ended"; sdkClear(me); me.client = null;
    var bx = sdkBox(), v = bx && bx.querySelector("video"); if (bx) bx.classList.remove("on"); try { if (v) v.srcObject = null; } catch (e) {}
    if (!me.ready) { if (me.stopReason) sdkUi("idle"); else sdkFail(me, me.micDenied || /MICROPHONE/.test(code) ? "mic" : "start"); return; }
    sdkFire("session-ended", { sessionId: me.sid, reason: details || code }); tmTurnsSend(me);
    var mins = me.chain && me.chain.n ? Math.round((Date.now() - me.chain.t0) / 60000) : Math.round(me.max / 60), maxed = me.stopReason === "max" || /max(imum)?.?(duration|length)/i.test(details); contUi(false); contEnd(me);
    sdkUi("ended", maxed ? T("خلصت مدة المكالمة (" + mins + " دقايق). تقدر تبدأ مكالمة جديدة.", "The call reached its " + mins + "-minute limit. You can start a new call.")
      : me.stopReason || /NORMAL|SERVER_CLOSED/.test(code) || !code ? T("المكالمة انتهت.", "The call has ended.") : T("الاتصال اتقطع — تقدر تبدأ مكالمة جديدة.", "The connection dropped — you can start a new call."));
  }
  function sdkFail(me, why) {
    if (why === "start") relayDrop(me); /* a start through the relay failed: the next call tries without it */
    if (contBack(me)) return; /* a new part that did not start: the running one keeps the call (review #14) */
    me.closed = true; me.st = "error"; sdkClear(me); me.client = null; contUi(false); contEnd(me);
    if (why === "mic") {
      sdkUi("error", INAPP ? T("الميكروفون مقفول للتطبيق — افتحه من ", "The microphone is off for the app — turn it on in ") + micWhereTx() + T(" وجرّب تاني، أو كمّل كتابة.", " and try again, or continue by typing.")
        : T("الميكروفون مقفول للموقع ده. اسمح بيه من إعدادات المتصفح وجرّب تاني، أو كمّل كتابة.", "The microphone is blocked for this site. Allow it in your browser settings and try again, or continue by typing."), { go: T("جرّب تاني", "Try again"), typing: true });
      /* the app: its own page in the phone's Settings (app-settings: — iOS opens it, and the Android app opens its own page there too) */
      var stl = INAPP && sdkBox() ? sdkBox().querySelector(".jv-st") : null;
      if (stl) { var al = document.createElement("a"); al.href = "app-settings:"; al.textContent = " " + T("افتح الإعدادات", "Open Settings"); al.style.cssText = "color:inherit;text-decoration:underline;font-weight:800"; stl.appendChild(al); }
      return;
    }
    sdkUi("error", T("الاتصال ماكملش — جرّب تاني.", "The call could not connect — please try again."), { go: T("جرّب تاني", "Try again") });
  }
  /* the Worker's answer when it gives no token */
  function sdkRefused(me, e) {
    var c = String(e.code || ""), s = +e.status || 0;
    /* this site cannot mint tokens (no key on the Worker, no endpoint): the widget, and this tab keeps it for a while */
    if (c === "unavailable" || c === "anam_not_configured" || c === "store_off" || s === 404) { rememberWidget(); LV = null; toWidget(true); return; }
    me.closed = true; me.st = "error";
    if (c === "feature_off") { sdkUi("error", liveOffMsg(persona), { noRetry: true }); return; }
    /* the owner switched the consent on after this page asked (or the device's «موافق» is gone): the card, then the same call again */
    if (c === "consent_required") { aiSet(false); sdkUi("idle"); aiCard(persona, function () { if (sdkBox()) sdkStart(!!me.textOnly); }); return; }
    if (c === "rate_limited") { var mn = Math.max(1, Math.ceil((+e.retry_after || 3600) / 60)); sdkUi("error", T("اتفتحت مكالمات فيديو كتير من نفس الشبكة الساعة دي — جرّب تاني بعد " + mn + " دقيقة.", "Too many video calls from this network this hour — please try again in " + mn + " min."), { go: T("جرّب تاني", "Try again") }); return; }
    if (c === "daily_cap") { sdkUi("error", T("مكالمات الفيديو المباشرة خلصت لليوم — جرّب تاني بكرة.", "Today's live video calls are used up — please try again tomorrow."), { noRetry: true }); return; }
    if (c === "blocked") { sdkUi("error", T("مكالمات الفيديو المباشرة مش متاحة من الشبكة دي.", "Live video calls are not available from this network."), { noRetry: true }); return; }
    if (c === "plan") { sdkUi("error", T("مكالمة باسم بالفيديو لأعضاء باقة الشريك الأساسي والشريك الاستراتيجي.", "Video calls with Bassem are for Core Partner and Strategic Partner members."), { noRetry: true }); return; }
    if (c === "login_required" || c === "full_login_required") {
      var A = window.MIGAPI, why = c === "full_login_required" ? T("إنت داخل برابط من الإيميل، وده للرد على الطلبات بس — سجّل دخولك بكود الإيميل علشان تكلّم باسم فيديو.", "You came in through an e-mail link, which only allows answering requests — sign in with your e-mail code to video-call Bassem.") : T("سجّل دخولك بكود يوصلك على بريد شركتك علشان تكلّم باسم فيديو.", "Sign in with a code sent to your company e-mail to video-call Bassem.");
      if (!A || typeof A.login !== "function") { sdkUi("error", why, { noRetry: true }); return; }
      sdkUi("error", why, { go: T("سجّل الدخول", "Sign in"), act: function () { A.login({ why: why }).then(function () { if (sdkBox()) sdkStart(false); }, function () {}); } });
      return;
    }
    /* Anam, the network or the Worker did not answer: today's widget for this call */
    LV = null; toWidget(true);
  }
  /* the Worker or the SDK cannot run this call: today's widget in the same place (its own «ابدأ الكلام» button) */
  function toWidget(fromStart) {
    var v = ov && ov.querySelector(".jnl-me .v"); if (!v || v.querySelector("anam-agent")) return;
    var nm = sdkName();
    micDrop(); langDrop(); /* the widget captures its own microphone; no 🌐 there */
    v.innerHTML = widgetHtml(nm); ov.setAttribute("data-mode", "widget");
    mountWidget();
    if (fromStart) say(T("اضغط «ابدأ الكلام مع " + nm + "» علشان نبدأ", "Press “Start talking to " + nm + "” to begin"));
  }
  /* a message typed in the call (the text box, or the welcome card's «اجتماع» request): only once the session can take it */
  function sdkSay(text, opt) {
    var me = LV, t = String(text == null ? "" : text).trim().slice(0, 500);
    if (window.MIGCHATMEDIA && MIGCHATMEDIA.markSafe) t = MIGCHATMEDIA.markSafe(t); /* 📎 nothing typed can pose as a platform note */
    if (!t || !me || !me.client || !me.ready || !me.dc || me.closed) return false;
    try { me.client.sendUserMessage(t); } catch (e) { return false; }
    NZ.typed.push({ t: Date.now(), x: nzNorm(t) }); if (NZ.typed.length > 6) NZ.typed.shift(); /* a typed turn is never a noise interruption */
    if (!(opt && opt.photo)) langTyped(t); /* 🌐 a script only some languages write in: a suggestion, never a switch */
    sdkFire("message-sent", { content: t }); return true;
  }
  function sdkMute() {
    var me = LV; if (!me || !me.client || me.closed || me.textOnly) return;
    if (me.nz && me.nz.gate) me.muted = !me.muted; /* noisy-room mode holds the microphone while the persona talks: the button keeps the visitor's own choice, applied when it reopens */
    else { try { var s = me.muted ? me.client.unmuteInputAudio() : me.client.muteInputAudio(); me.muted = s && typeof s.isMuted === "boolean" ? s.isMuted : !me.muted; } catch (e) { return; } }
    sdkFire(me.muted ? "mic-muted" : "mic-unmuted", {}); updCtl();
  }
  /* ---------- «وضع الدوشة» — the noise guard (owner 2026-11-19: «أهم حاجة في جنة وباسم إنهم عادي لو بيتكلموا مع الشخص وحواليه دوشة أو
     أصوات تانية يتفاعلوا معاه ويركزوا مع صوته هو»). Anam's server VAD stops the persona whenever it hears "speech" (there is no barge-in
     setting), so noise around the visitor cut Janna / Bassem mid-sentence. SDK calls only (the widget fallback is a black box):
     1) our own microphone: getUserMedia {echoCancellation, noiseSuppression, autoGainControl, channelCount 1} + voiceIsolation when the
        browser lists it (getSupportedConstraints), asked inside the «ابدأ» tap while the token is minted, handed to the stream as a CLONE
        per part (the SDK stops the tracks it gets when a part ends; the chain's next part gets a new clone of the same capture). Refused,
        missing or unanswered for MIC_WAIT → the SDK's own capture exactly as before (its MIC_PERMISSION_* events → the existing UI).
        Released when the call is over (sdkUi), when the widget takes over and on close();
     2) false interruptions: the persona was speaking (her text still streaming, her voice on the meter, or her message reported
        interrupted), USER_SPEECH_STARTED fired, and the user turn after it was empty, only fillers («امم», "uh") or one of the recogniser's
        own phrases on noise («اشتركوا في القناة» …; never with a stop word, never text the visitor typed). Review 2026-11-20 of the owner's «لما بكلم جنة او
        باسم مش بيسكتوا»: a short word is a real barge-in («بس», «لأ», «استنى», "wait", "dur" — any language, any script), never noise. Two
        within 90 s → an offer chip, only where his own voice is measured (4); never noisy-room mode by itself (owner 2026-11-19);
     3) noisy-room mode: while the persona speaks the microphone is muted (muteInputAudio; the visitor's own mute stays his); it reopens
        ~250 ms after her voice stops (the meter; else her text timing) AND at once when his own voice is heard (4) — Anam's VAD then stops her
        exactly as in normal mode. Never used where his voice cannot be measured (iOS / iPadOS unless JANNA_LIVE_NOISE_METER = 1, the SDK's
        own capture, no Web Audio): the call stays in normal mode there. The chip says «🔇 المكان فيه دوشة — الدوشة اللي بعيد مش هتقطعني، وصوتك
        إنت بيوقفني؛ ولو ماوقفتش دوس ✋» with ✋ (interruptPersona + the microphone at once) and «↩︎ الوضع العادي». The persona's own endOfSpeechSensitivity
        (the Lab's) is KEPT in this mode; a page may still lower it with window.JANNA_LIVE_EOS_NOISY (0–1), and NZ_EOS[0] goes back on the way
        out. For THIS call only (review 2026-11-20): every call starts in normal mode; the tab keys of earlier builds are cleared at load;
     4) his own voice (near-field): every 80 ms the level of OUR capture (echo-cancelled, noise-suppressed; never the clone the SDK mutes)
        against a bar = the largest of NZ_NEAR_MIN, the room × NZ_NEAR (window.JANNA_LIVE_NEAR, 1.5–20, default 2) and, once his own voice is
        known in this call, NZ_SELF × his voice (window.JANNA_LIVE_SELF, 0.2–0.9, default 0.5 = 6 dB under the median level of his voice
        while Anam heard him with the microphone open and her silent: a TV, office voices 2-3 m away and her echo reach the microphone well
        under that). The room = the 90th percentile of the last ~4 s, each level committed NZ_LAG later and dropped when Anam reports his
        speech in between (his own first syllables never become room). This tick and one of the two before over the bar = his voice; -1
        until 12 room levels are in (the microphone is never closed before his voice can reopen it). An opening Anam's VAD does not confirm
        within NZ_HOLD adds its peak to the room (gone ~4 s later; never a level as loud as his own voice): no lasting penalty. In normal
        mode the same measure only counts his barge-ins that Anam did not hear (JANNA_LIVE.noise().missed_by_anam), nothing more.
     The meter is a Web Audio analyser on the persona's own stream (AUDIO_STREAM_STARTED), never connected to the speakers, its context made
     inside the «ابدأ» tap; window.JANNA_LIVE_NOISE_METER = 0 turns it off (text timing only), = 1 turns it on for iOS / iPadOS too (off there
     by default: Web Audio on a remote WebRTC stream has not been tried on a real iPhone); window.JANNA_LIVE_MIC_WAIT (ms, 1000–60000,
     default 15000) bounds the wait for the browser's answer; JANNA_LIVE_EOS_NORMAL / _NOISY override NZ_EOS. JANNA_LIVE.noise() / .noise(true|false). */
  var MIC_WAIT = (function () { var n = parseInt(window.JANNA_LIVE_MIC_WAIT, 10); return n >= 1000 && n <= 60000 ? n : INAPP === "android" ? 60000 : 15000; })(), /* Android app: 60 s (its dialog; a 2nd request meanwhile is answered empty) */ NZ_TH = 0.012, NZ_EOS = [nzNum(window.JANNA_LIVE_EOS_NORMAL, 0.45), nzNum(window.JANNA_LIVE_EOS_NOISY, -1)]; /* -1: noisy-room mode keeps the persona's value */
  var NZ = { on: false, why: "", fis: [], offerUntil: 0, ac: null, mic: null, mm: null, typed: [], last: null, el: null, near: 0, nearMiss: 0, missed: 0, his: 0, hv: [] };
  try { sessionStorage.removeItem("mig-jnl-noise"); sessionStorage.removeItem("mig-jnl-noise2"); } catch (e) {} /* earlier builds kept the mode for the tab */
  var NZ_NEAR = (function () { var n = parseFloat(window.JANNA_LIVE_NEAR); return n >= 1.5 && n <= 20 ? n : 2; })(), NZ_NEAR_MIN = 0.015, NZ_HOLD = 900, NZ_RB = 50, NZ_LAG = 800, NZ_SELF = (function () { var n = parseFloat(window.JANNA_LIVE_SELF); return n >= 0.2 && n <= 0.9 ? n : 0.5; })();
  var NZ_STOP = /(^| )(استني|استنا|لحظه|ثانيه|ثواني|ثوان|كفايه|خلاص|وقف|وقفي|اسكت|اسكتي|بس|معلش|اسمع|اسمعي|جنه|باسم|stop|wait|hold on|hang on|one sec|janna|bassem|attends|attendez|espera|espere|aspetta|warte|bekle|subiri)( |$)/;
  var NZ_FILL = /^(ا+ه*|ه+|ا?م+|ه+م+|ها+|اها|اوه|و|uh+|um+|hm+|mm+|ah+|oh+|eh+|er+m?|huh|ha+)$/;
  /* owner 2026-11-19 («لما بقوله اه او اوكيه مش بيفهم»): a short answer is a real reply, never noise — checked before NZ_FILL (which matches «اه») */
  var NZ_ANS = /^(اه|ايوه|ايوا|ايو|اوكي|اوكيه|اوك|اوكاي|تمام|ماشي|طيب|طب|نعم|لا|لاء|لاا|اكيد|صح|موافق|حاضر|ok|okay|okey|yes|yeah|yep|yup|no|nope|sure|right|fine|oui|si|vale|ja|evet|hayir|da|sim|nao|non|nein|ndiyo|sawa)$/; /* + the 🌐 languages' short answers */
  /* the recogniser's own phrases on noise (Bassem's live prompt lists those it wrote): noise unless a stop word is in them */
  var NZ_HALL = /(^| )(اشتركوا في القناه|شكرا للمشاهده|شكرا لكم|تابعونا|ترجمه نانسي قنقر|المترجم|موسيقي|thanks for watching|thank you for watching|subscribe to (the|my|our|this) channel|please subscribe|like and subscribe)( |$)/;
  function nzNum(v, d) { v = parseFloat(v); return v >= 0 && v <= 1 ? v : d; }
  function nzNew() { return { gate: false, gateT: 0, eos: null, loudT: 0, meterOk: false, lvl: null, src: null, pid: "", pon: false, pt0: 0, pn: 0, plast: 0, puntil: 0, pintT: 0, cutId: "", handT: 0, cand: null, usedPid: "", seenU: {}, hn: 0, userOn: false, uT: 0, rb: null, pq: null, nh: 0, nearT: 0, nearPk: 0, aT: 0, nearOk: false, nearEver: false, mT: 0, lv: -1, room: 0, thr: 0 }; }
  function nzMicOk(me) { return !!me && !me.textOnly && !me.micDenied; }
  function nzEvt(kind, d) { try { window.dispatchEvent(new CustomEvent("mig:noise", { detail: { kind: kind, on: NZ.on, why: (d && d.why) || "", count: NZ.fis.length } })); } catch (e) {} }
  function nzNorm(s) { return String(s || "").replace(/\[[a-z_ -]{2,24}\]/gi, " ").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase().replace(/[\s\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u00A0-\u00BF\u00D7\u00F7\u2000-\u206F\u060C\u061B\u061F\u066A-\u066D\u06D4\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\u2190-\u2BFF\uD800-\uDFFF\uFE00-\uFE0F]+/g, " ").replace(/\s+/g, " ").trim(); } /* every script's letters stay; punctuation, symbols, ♪ and emoji go */
  /* the user turn that followed an interruption: "empty" | "noise" = false; "" = meant. Review 2026-11-20 («مش بيسكتوا»): no "short" — a short
     word is how people barge in («بس», «لأ», "wait"); a letter of another script = another language = meant */
  function nzJudge(raw) {
    var r = String(raw || ""), t = nzNorm(r), w;
    if (!t) return "empty";
    if (/[?\u061F]/.test(r) || /[^\u0621-\u064A\u0660-\u0669a-z0-9 ]/.test(t)) return ""; /* a question; a letter of another script */
    if (NZ_HALL.test(t) && !NZ_STOP.test(t)) return "noise";
    w = t.split(" ");
    return w.every(function (x) { return NZ_FILL.test(x) && !NZ_ANS.test(x); }) ? "noise" : ""; /* «اه» / «تمام» / "ok" = a reply */
  }
  function nzTyped(text) {
    var x = nzNorm(text), now = Date.now(); if (!x) return false;
    for (var i = 0; i < NZ.typed.length; i++) { var e = NZ.typed[i]; if (e.x && now - e.t < 30000 && (x === e.x || x.indexOf(e.x) > -1 || e.x.indexOf(x) > -1)) return true; }
    return false;
  }
  /* --- our own microphone --- */
  function micLive(s) { try { var t = s && s.getAudioTracks ? s.getAudioTracks() : []; return !!(t.length && t[0].readyState !== "ended"); } catch (e) { return false; } }
  function micStop(s) { try { if (s && s.getTracks) s.getTracks().forEach(function (t) { try { t.stop(); } catch (x) {} }); } catch (e) {} }
  function micDrop() { var s = NZ.mic; NZ.mic = null; nzMicOff(); micStop(s); }
  function micGet(me) {
    var md = navigator.mediaDevices, c = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, p, shown = false, tm;
    if (!md || !md.getUserMedia || !window.Promise) return null;
    if (micLive(NZ.mic)) return Promise.resolve(NZ.mic);
    try { var sc = md.getSupportedConstraints ? md.getSupportedConstraints() : null; if (sc && sc.voiceIsolation) c.voiceIsolation = true; } catch (e) {}
    try { p = md.getUserMedia({ audio: c }); } catch (e) { return null; }
    /* not answered within 350 ms and not granted before = the browser is asking: the same words as the SDK's own MIC_PERMISSION_PENDING */
    var granted = false; try { navigator.permissions.query({ name: "microphone" }).then(function (r) { granted = !!r && r.state === "granted"; }, function () {}); } catch (e) {}
    tm = setTimeout(function () { if (!granted && LV === me && !me.ready && !me.closed && !me.micUsed) { shown = true; me.micAsk = true; sdkUi("connecting", micAskTx() + sdkName()); } }, 350);
    var back = function () { clearTimeout(tm); if (shown) me.micAsk = false; if (shown && LV === me && !me.ready && !me.closed && !me.micUsed) sdkUi("connecting", connMsg(me)); };
    return Promise.resolve(p).then(function (s) {
      back();
      if (!micLive(s) || LV !== me || me.closed || me.stopped || me.micUsed) { micStop(s); return null; } /* the call ended, or the SDK already took the microphone */
      micDrop(); NZ.mic = s; return s;
    }, function (e) { back(); me.micErr = String((e && e.name) || "error"); return null; });
  }
  /* the Android app after a refused microphone: a silent stream, so the SDK does not ask a second time (the text box still works) */
  var SILENT = null;
  function silentMic() { try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!SILENT || SILENT.state === "closed") SILENT = new AC(); return SILENT.createMediaStreamDestination().stream; } catch (e) { return null; } }
  /* the stream for this part: a clone of our capture, or null (= the SDK captures the microphone itself) */
  function micFor(me) {
    var clone = function (s) { if (!micLive(s)) return null; try { return s.clone(); } catch (e) { NZ.mic = null; return s; } };
    if (me.textOnly) return Promise.resolve(null);
    if (me.cont) return Promise.resolve(clone(NZ.mic));
    if (!me.micP) return Promise.resolve(null);
    return new Promise(function (res) {
      var done = false, fin = function (s) { if (done) return; done = true; clearTimeout(tm); res(clone(s)); };
      var tm = setTimeout(function () { fin(null); }, MIC_WAIT); /* not answered: the SDK asks itself (its request joins the same browser prompt) */
      me.micP.then(fin, function () { fin(null); });
    });
  }
  /* --- the persona's voice level (Web Audio analyser on her stream; -1 = not measurable) --- */
  function nzAc() {
    var f = String(window.JANNA_LIVE_NOISE_METER), ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (f === "0" || (ios && f !== "1")) return null; /* iOS / iPadOS: not tried on real devices yet — text timing there unless the page opts in */
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { if (!NZ.ac || NZ.ac.state === "closed") NZ.ac = new AC(); if (NZ.ac.state === "suspended" && NZ.ac.resume) { var r = NZ.ac.resume(); if (r && r.then) r.then(null, function () {}); } } catch (e) { NZ.ac = null; }
    return NZ.ac;
  }
  function nzMeter(me, st) {
    var z = me.nz, ac = NZ.ac;
    if (!z || z.src || !ac || ac.state === "closed" || !st || !st.getAudioTracks || !st.getAudioTracks().length) return;
    try {
      var src = ac.createMediaStreamSource(st), an = ac.createAnalyser(), buf; an.fftSize = 512; src.connect(an); buf = new Uint8Array(an.fftSize);
      z.src = src; z.lvl = me.nzLvl = function () { if (ac.state !== "running") return -1; an.getByteTimeDomainData(buf); var q = 0; for (var i = 0; i < buf.length; i++) { var x = (buf[i] - 128) / 128; q += x * x; } return Math.sqrt(q / buf.length); };
    } catch (e) { z.src = null; z.lvl = null; }
  }
  /* --- his own voice (near-field, item 4): OUR capture, never the clone the SDK mutes; -1 = not measurable here --- */
  function nzMicOff() { var m = NZ.mm; NZ.mm = null; try { if (m && m.src) m.src.disconnect(); } catch (e) {} }
  function nzMicLvl(me) {
    var s = NZ.mic, ac = NZ.ac, m = NZ.mm, b, q = 0, i, x;
    if (!me || me.micUsed !== "own" || !s || !ac || ac.state !== "running" || !micLive(s)) return -1;
    if (!m || m.s !== s) {
      nzMicOff();
      try { var an = ac.createAnalyser(), src = ac.createMediaStreamSource(s); an.fftSize = 2048; src.connect(an); m = NZ.mm = { s: s, src: src, an: an, f: typeof an.getFloatTimeDomainData === "function" }; m.buf = m.f ? new Float32Array(an.fftSize) : new Uint8Array(an.fftSize); } catch (e) { nzMicOff(); return -1; }
    }
    b = m.buf;
    if (m.f) { m.an.getFloatTimeDomainData(b); for (i = 0; i < b.length; i++) q += b[i] * b[i]; }
    else { m.an.getByteTimeDomainData(b); for (i = 0; i < b.length; i++) { x = (b[i] - 128) / 128; q += x * x; } }
    return Math.sqrt(q / b.length);
  }
  /* the room: levels committed NZ_LAG after they were measured (nzUserOn drops the queue: his first syllables never become room) */
  function nzRoomAdd(z, v) { var rb = z.rb || (z.rb = []); rb.push(v); if (rb.length > NZ_RB) rb.shift(); }
  /* one 80 ms step: 1 = his own voice now, 0 = not, -1 = no measure (or not enough room yet: the microphone then stays open) */
  function nzNearStep(z, m, now) {
    if (m < 0) return -1;
    var pq = z.pq || (z.pq = []), rb = z.rb || (z.rb = []), srt, room, thr;
    while (pq.length && now - pq[0][0] >= NZ_LAG) nzRoomAdd(z, pq.shift()[1]);
    srt = rb.slice().sort(function (a, b) { return a - b; });
    room = srt.length ? srt[Math.floor((srt.length - 1) * 0.9)] : 0;
    thr = Math.max(NZ_NEAR_MIN, room * NZ_NEAR, NZ.his * NZ_SELF);
    z.lv = m; z.room = room; z.thr = thr;
    z.nh = ((z.nh << 1) | (m > thr ? 1 : 0)) & 7;
    if (m > thr) z.aT = now;
    if (z.nearT && m > z.nearPk) z.nearPk = m;
    /* clamped to the bar: a louder room raises it within seconds, a burst over it cannot */
    if (!z.userOn && !(z.nearT && now - z.nearT < NZ_HOLD)) pq.push([now, Math.min(m, thr)]);
    if (rb.length < 12) return -1;
    return (z.nh & 1) && (z.nh & 6) ? 1 : 0;
  }
  /* his own voice in this call: Anam hears him, she is silent, the microphone is open; the median of his last 60 loud ticks */
  function nzHis(z) {
    var hv = NZ.hv, s; if (!(z.lv > z.room * NZ_NEAR) || z.lv <= NZ_NEAR_MIN) return;
    hv.push(z.lv); if (hv.length > 60) hv.shift();
    if (hv.length >= 15) { s = hv.slice().sort(function (a, b) { return a - b; }); NZ.his = s[Math.floor(s.length / 2)]; }
  }
  /* nearEver: our capture gave a real signal in this part (an analyser that only reads silence never closes the microphone) */
  function nzNear(me, z, now) { var r = nzNearStep(z, nzMicLvl(me), now); z.nearOk = r >= 0; if (r >= 0 && z.lv >= 0.0005) z.nearEver = true; return r; }
  function nzPrep(me) { nzDefault(); me.nz = nzNew(); NZ.offerUntil = 0; if (me.textOnly) return; nzAc(); me.micP = micGet(me); }
  /* a new call: normal mode, no offer and no count from the last call (review 2026-11-20: the mode is per call); «🛠️ المطوّر» →
     noise_mode_default on: the call starts in noisy-room mode, which still closes the microphone only where his own voice is measured */
  function nzDefault() { NZ.on = false; NZ.why = ""; NZ.fis = []; NZ.near = 0; NZ.nearMiss = 0; NZ.missed = 0; NZ.his = 0; NZ.hv = []; if (window.MIGFLAGS && MIGFLAGS.on && MIGFLAGS.on("noise_mode_default") === true) { NZ.on = true; NZ.why = "default"; } }
  /* the ?nzdebug=1 readout goes with the call (review F6: frozen numbers of an ended call mislead a phone test) */
  function nzDbgOff() { if (NZ.dbg && NZ.dbg.parentNode) NZ.dbg.parentNode.removeChild(NZ.dbg); NZ.dbg = null; NZ.dbgT = 0; }
  function nzEnd(me) {
    nzDbgOff(); /* a later part of the same call draws it again at its next tick */
    var z = me && me.nz; if (!z) return;
    if (z.cand) { clearTimeout(z.cand.tm); z.cand.done = true; }
    try { if (z.src) z.src.disconnect(); } catch (e) {}
    z.src = null; z.lvl = null; me.nzLvl = null;
  }
  /* --- per part: listeners (registered after contWire) + an 80 ms tick --- */
  function nzWire(me, on) {
    on("MESSAGE_STREAM_EVENT_RECEIVED", function (ev) { nzStream(me, ev || {}); });
    on("MESSAGE_HISTORY_UPDATED", function (msgs) { nzHist(me, msgs || []); });
    on("USER_SPEECH_STARTED", function () { nzUserOn(me); });
    on("USER_SPEECH_ENDED", function () { nzUserOff(me); });
    on("AUDIO_STREAM_STARTED", function (st) { nzMeter(me, st); });
    on("VIDEO_STREAM_STARTED", function (st) { setTimeout(function () { var bx = sdkBox(), v = bx && bx.querySelector("video"); if (LV === me) nzMeter(me, st && st.getAudioTracks ? st : v && v.srcObject); }, 400); }); /* her voice inside the video stream */
    on("DATA_CHANNEL_OPEN", function () { setTimeout(function () { if (NZ.on && LV === me) nzEos(me); }, 0); }); /* after sdkRun's own handler set me.dc */
    on("PERSONA_CONFIG_UPDATE_APPLIED", function (x) { var cf = x && x.changedFields; if (!cfAny(cf) || cfHas(cf, "voiceDetectionOptions") || cfHas(cf, "endOfSpeechSensitivity")) me.nz.eosOk = Date.now(); }); /* a 🌐 languageCode update is not this one */
    on("SERVER_WARNING", function (m) { me.nz.warn = String(m || "").slice(0, 200); });
    me.timers.push(setInterval(function () { nzTick(me); }, 80));
  }
  function nzStream(me, ev) {
    var z = me.nz, now = Date.now(), id = String(ev.id || "");
    if (ev.role === "persona") {
      if ((me.skip && me.skip[id]) || (id && id === z.cutId)) return; /* a continued part's cut greeting; the message ✋ cut */
      if (id !== z.pid) { z.pid = id; z.pt0 = now; z.pn = 0; }
      z.pn += String(ev.content || "").length; z.plast = now; z.pon = !ev.endOfSpeech && !ev.interrupted;
      if (ev.interrupted) { z.pintT = now; z.puntil = now + 300; if (z.cand && !z.cand.done && (!z.cand.pid || z.cand.pid === id)) z.cand.int = true; }
      else z.puntil = Math.max(z.puntil, z.pt0 + z.pn * 75 + 700); /* her voice lags the text: ~75 ms a character (as contWire) */
      nzTick(me);
    } else if (ev.role === "user" && ev.endOfSpeech !== false) nzUser(me, String(ev.content || ""), id);
  }
  function nzHist(me, msgs) {
    var z = me.nz, c = z.cand, i;
    for (i = Math.max(0, msgs.length - 4); i < msgs.length; i++) { var m = msgs[i] || {}; if (c && !c.done && m.role === "persona" && m.interrupted && (!c.pid || String(m.id || "") === c.pid)) c.int = true; }
    for (i = z.hn; i < msgs.length; i++) { var u = msgs[i] || {}; if (u.role === "user") nzUser(me, String(u.content || ""), String(u.id || "")); }
    z.hn = msgs.length;
  }
  function nzUserOn(me) {
    var z = me.nz, now = Date.now(); z.userOn = true; z.uT = now; if (z.pq) z.pq.length = 0; /* what came just before was him, not the room */
    if (NZ.on || !nzMicOk(me) || !me.ready || (me.cont && me.cont.greet !== "done") || (z.cand && !z.cand.done) || !z.pid || z.pid === z.usedPid) return; /* one interruption = one check, once per persona message */
    var strong = z.pon || (z.meterOk && now - z.loudT < 220) || (z.pintT > 0 && now - z.pintT < 1500);
    var weak = !z.meterOk && now < z.puntil - 300; /* no meter: her estimated voice was still playing (needs her «interrupted») */
    if (!strong && !weak) return;
    z.usedPid = z.pid;
    var c = z.cand = { at: now, pid: z.pid, strong: strong, int: false, done: false, text: null, tm: 0 };
    c.tm = setTimeout(function () { nzDecide(me, c); }, 8000);
  }
  function nzUserOff(me) {
    var z = me.nz, c = z.cand; z.userOn = false;
    if (c && !c.done && c.text == null) { clearTimeout(c.tm); c.tm = setTimeout(function () { nzDecide(me, c); }, 3500); } /* no transcript by then = nothing was said */
  }
  function nzUser(me, text, id) {
    var z = me.nz, c = z.cand;
    if (id) { if (z.seenU[id]) return; z.seenU[id] = 1; }
    if (!c || c.done || c.text != null) return;
    if (nzTyped(text)) { c.done = true; clearTimeout(c.tm); return; } /* what the visitor typed: meant, never noise */
    c.text = text; clearTimeout(c.tm); c.tm = setTimeout(function () { nzDecide(me, c); }, 250); /* her «interrupted» may come with the same history update */
  }
  function nzDecide(me, c) {
    var z = me.nz; if (c.done) return;
    if (c.text == null && z.userOn && Date.now() - c.at < 30000) { c.tm = setTimeout(function () { nzDecide(me, c); }, 1000); return; } /* still talking */
    c.done = true;
    if (LV !== me || me.closed || NZ.on || !(c.strong || c.int)) return;
    var v = c.text == null ? "empty" : nzJudge(c.text);
    if (v) nzFalse(me, v, c.text || "");
  }
  function nzFalse(me, why, text) {
    var now = Date.now();
    NZ.fis = NZ.fis.filter(function (t) { return now - t < 90000; }); NZ.fis.push(now);
    NZ.last = { why: why, text: String(text || "").slice(0, 80), at: now };
    nzEvt("false-interruption", { why: why });
    /* owner 2026-11-19 («عايزه يبقي متفاعل»): never switch to half-duplex by itself — only offer it (the chip); the visitor decides.
       Review 2026-11-20: offered after TWO noise cuts within 90 s, and only where his own voice still stops her in that mode */
    if (NZ.fis.length < 2 || !me.nz || !me.nz.nearEver) return;
    NZ.offerUntil = now + 20000; nzChip(); setTimeout(nzChip, 20100);
  }
  /* ?nzdebug=1 (tests on a phone, where there are no DevTools): the guard's numbers in a corner of the call; nothing else changes */
  var NZ_DBG = /[?&#]nzdebug=1(?![0-9])/.test(String(location.href));
  function nzDbg(z, now) {
    var el = NZ.dbg; if (!NZ_DBG || now - (NZ.dbgT || 0) < 250) return; NZ.dbgT = now;
    if (!el) { el = NZ.dbg = document.createElement("div"); el.setAttribute("translate", "no"); el.setAttribute("aria-hidden", "true"); el.style.cssText = "position:fixed;left:6px;top:6px;z-index:2147483647;background:rgba(0,0,0,.75);color:#fff;font:11px/1.4 monospace;padding:4px 6px;border-radius:6px;pointer-events:none;direction:ltr;white-space:pre"; document.body.appendChild(el); }
    el.textContent = (NZ.on ? "noisy" : "normal") + (z.gate ? " MIC-SHUT" : "") + (z.userOn ? " anam-hears-you" : "") + "\nlevel " + z.lv.toFixed(3) + "  room " + z.room.toFixed(3) + "  bar " + z.thr.toFixed(3) + "  you " + NZ.his.toFixed(3) + "\nopens " + NZ.near + "  not-speech " + NZ.nearMiss + "  missed-by-anam " + NZ.missed + "  noise-cuts " + NZ.fis.length;
  }
  /* the half-duplex gate: shut while she speaks, open ~250 ms after her voice stops */
  function nzTick(me) {
    var z = me.nz; if (!z || LV !== me || me.closed || me.swapped || !me.ready) return;
    var now = Date.now(), lv = -1; nzPlace(); nzDbg(z, now);
    if (z.lvl) { try { lv = z.lvl(); } catch (e) { z.lvl = null; } }
    if (lv > NZ_TH) { z.loudT = now; z.meterOk = true; }
    if (z.pon && now - z.plast > 5000 && (z.meterOk ? now - z.loudT > 1000 : now > z.puntil)) z.pon = false; /* her end-of-speech never came */
    if (z.userOn && now - z.uT > 10000 && now - z.aT > 3000) z.userOn = false; /* a speech start whose end never came (Anam docs: ~10 s), and he is quiet here */
    /* speaking: her text still coming; her voice on the meter; or (her voice not heard on the meter yet) her text timing — never the ✋-cut
       tail, never a continued part's cut greeting (no heard message yet: z.pid stays empty) */
    var heard = z.meterOk && z.loudT >= z.pt0, fresh = now - z.handT > 1200;
    var spk = z.pon || (!!z.pid && fresh && (z.meterOk && now - z.loudT < 120 || !heard && now < z.puntil));
    var near = nzMicOk(me) && !me.muted ? nzNear(me, z, now) : -1; /* his own mute stays his */
    if (near >= 0 && z.userOn && !spk && !z.gate) nzHis(z);
    /* normal mode, and wherever his voice is not measured: the microphone stays open and Anam's VAD stops her when he speaks */
    if (!NZ.on || near < 0 || !z.nearEver) {
      if (z.gate) nzGate(me, false);
      if (near > 0 && spk && !z.userOn && !z.mT) z.mT = now; /* his voice while she talks: did Anam hear it? */
      if (z.mT && now - z.mT > 700) { if (!(z.uT > z.mT - 300)) NZ.missed++; z.mT = 0; }
      return;
    }
    /* noisy-room mode: his own voice opens the microphone at once; Anam's VAD then stops her */
    if (near > 0 && z.gate) { z.nearT = now; z.nearPk = z.lv; NZ.near++; nzGate(me, false); return; }
    if (z.nearT) {
      if (z.userOn || now - z.nearT < NZ_HOLD) return;
      /* not speech for Anam: that level is room for ~4 s — never a level as loud as his own voice (a short «بس» Anam heard too little of) */
      if (!(z.uT > z.nearT)) { NZ.nearMiss++; if (!(NZ.his && z.nearPk >= NZ.his * 0.8)) { for (var i = 0; i < 6; i++) nzRoomAdd(z, z.nearPk); } }
      z.nearT = 0;
    }
    if (spk && !z.userOn) { nzGate(me, true); return; }
    if (!z.gate) return;
    if (heard ? now - z.loudT >= 250 && (now >= z.puntil - 1200 || now - z.loudT >= 800) : now >= z.puntil + 250) nzGate(me, false);
    else if (now - z.gateT > 60000) nzGate(me, false);
  }
  function nzGate(me, shut) {
    var z = me.nz; if (!z || !!z.gate === !!shut) return;
    z.gate = !!shut; z.gateT = Date.now();
    if (me.client && !me.closed && !me.swapped && !me.muted && nzMicOk(me)) { try { if (shut) me.client.muteInputAudio(); else me.client.unmuteInputAudio(); } catch (e) {} }
    nzChip();
  }
  /* endOfSpeechSensitivity: unchanged in noisy-room mode unless a page set NZ_EOS[1] (then that value, and NZ_EOS[0] back on the way out);
     never sent in a part that never changed it */
  function nzEos(me) {
    var z = me.nz, want = NZ_EOS[NZ.on ? 1 : 0];
    if (!z || want < 0 || z.eos === want || (!NZ.on && z.eos === null) || !me.client || !me.dc || me.closed || me.swapped || !nzMicOk(me)) return;
    try { me.client.sendDataMessage(JSON.stringify({ message_type: "persona_config", data: { voiceDetectionOptions: { endOfSpeechSensitivity: want } } })); z.eos = want; } catch (e) {}
  }
  function nzSet(on, why) {
    on = !!on; if (NZ.on === on) { nzChip(); return; }
    NZ.on = on; NZ.why = String(why || ""); NZ.fis = []; NZ.offerUntil = 0; /* this call only (review 2026-11-20) */
    var me = LV;
    if (me && me.nz && !me.closed) { nzEos(me); if (on) nzTick(me); else nzGate(me, false); }
    nzChip(); nzEvt(on ? "on" : "off", { why: why });
  }
  /* ✋ «استنى»: the visitor wants to talk now — the persona stops and the microphone opens at once */
  function nzHand() {
    var me = LV, z = me && me.nz; if (!z || !me.client || me.closed || !me.ready) return;
    nzAc(); /* a tap: the meter's context can start now (iOS) */
    z.handT = Date.now(); if (z.pid) z.cutId = z.pid; z.pon = false; z.puntil = 0;
    try { me.client.interruptPersona(); } catch (e) {}
    z.gate = false; z.gateT = z.handT;
    /* review 2026-11-19 #14: ✋ opens only the noise gate — a microphone the visitor muted himself stays muted (his own 🎤 opens it) */
    if (!me.muted) { if (nzMicOk(me)) { try { me.client.unmuteInputAudio(); } catch (e) {} } }
    else sayAny(T("🎤 المايك مقفول من عندك — دوس زرار المايك علشان تتكلم.", "🎤 Your microphone is muted — tap the mic button to talk."));
    updCtl(); nzEvt("hand", {});
  }
  function nzChip() {
    var bx = sdkBox(), me = LV, z = me && me.nz, el = NZ.el, c, live = !!(bx && ov && !ov.hidden && z && me.ready && !me.closed && nzMicOk(me));
    var m = !live || !z.nearEver ? "" : NZ.on ? "on" : Date.now() < NZ.offerUntil ? "offer" : ""; /* only where his own voice is measured */
    if (!m) { if (el) el.hidden = true; return; }
    if (!el) { el = NZ.el = document.createElement("div"); el.className = "jnl-nzf"; el.setAttribute("translate", "no"); el.innerHTML = '<div class="jv-nz" role="status" aria-live="polite"></div>'; document.body.appendChild(el); if (!NZ.rz) { NZ.rz = 1; window.addEventListener("resize", nzPlace); } }
    if (!ov.__nz) { ov.__nz = 1; ov.addEventListener("scroll", nzPlace, { passive: true }); } /* phones: the call column scrolls */
    c = el.firstChild; el.dir = EN ? "ltr" : "rtl";
    if (c.getAttribute("data-m") !== m) {
      c.setAttribute("data-m", m);
      c.innerHTML = m === "on"
        ? '<span>' + esc(T("🔇 المكان فيه دوشة — الدوشة اللي بعيد مش هتقطعني، وصوتك إنت بيوقفني؛ ولو ماوقفتش دوس ✋", "🔇 It's noisy where you are — distant noise won't cut me off, your own voice still stops me; if I don't stop, tap ✋")) + '</span><button type="button" class="nz-hand">' + esc(T("✋ استنى", "✋ Wait")) + '</button><button type="button" class="nz-off">' + esc(T("↩︎ الوضع العادي", "↩︎ Normal mode")) + '</button>'
        : '<span>' + esc(T("🔇 شكل المكان عندك فيه دوشة — تحب الدوشة اللي بعيد ماتقطعنيش؟ صوتك إنت هيفضل يوقفني", "🔇 It sounds noisy where you are — shall I keep distant noise from cutting me off? Your own voice will still stop me")) + '</span><button type="button" class="nz-on">' + esc(T("🔇 أيوه، وضع الدوشة", "🔇 Yes, noisy-room mode")) + '</button><button type="button" class="nz-x" title="' + esc(T("لأ، شكراً", "No, thanks")) + '" aria-label="' + esc(T("لأ، شكراً", "No, thanks")) + '">✕</button>';
      var b1 = c.querySelector(".nz-hand"), b2 = c.querySelector(".nz-off"), b3 = c.querySelector(".nz-on"), b4 = c.querySelector(".nz-x");
      if (b1) b1.onclick = nzHand;
      if (b2) b2.onclick = function () { nzAc(); nzSet(false, "visitor"); };
      if (b3) b3.onclick = function () { nzAc(); nzSet(true, "visitor"); };
      if (b4) b4.onclick = function () { NZ.offerUntil = 0; nzChip(); };
    }
    el.hidden = false; c.classList.toggle("hd", m === "on" && !!z.gate); nzPlace();
  }
  /* the chip's place: centred over the video, its bottom 6 px above the control bar (followed on every tick, scroll and resize) */
  function nzPlace() {
    var el = NZ.el, bx = sdkBox(); if (!el || el.hidden) { langPlace(); return; }
    var ctl = bx && bx.querySelector(".jv-ctl"), r = bx ? bx.getBoundingClientRect() : null, cr = ctl && !ctl.hidden ? ctl.getBoundingClientRect() : null, vh = window.innerHeight || document.documentElement.clientHeight;
    if (!r || !r.width || !cr || !cr.height) { el.style.visibility = "hidden"; langPlace(); return; }
    el.style.visibility = ""; el.style.left = Math.round(r.left + 10) + "px"; el.style.width = Math.max(0, Math.round(r.width - 20)) + "px"; el.style.bottom = Math.round(vh - cmTop(cr.top) + 6) + "px";
    langPlace(); /* the 🌐 chip sits above this one */
  }
  /* ---------- 🌐 the language the person SPEAKS in the call (owner 2026-11-20: «جنة او باسم يتكلموا اي لغه في العالم بناءا علي الشخص اللي
     بيكلمهم»). Every call hears exactly as before (Janna on the Arabic pages and Bassem on both: Arabic; Janna on the English pages: English);
     only the person changes it — 🌐 next to 🎙️, or its link under «ابدأ الكلام» before the call — never this page by itself. The choice:
     sessionStorage "mig-jnl-lang:<persona>" (this tab only) and, on a live part, Anam's documented mid-session update persona_config
     {languageCode} — languageCode ONLY: sttProvider / sttLanguages cannot change mid-session — + addContext(langNote) for the LLM (no extra
     reply). Every later part / call of this tab sends it again at DATA_CHANNEL_OPEN, and only when it differs from the persona's own: a call
     where nobody chose sends no persona_config and no LANGUAGE line. Applied = a PERSONA_CONFIG_UPDATE_APPLIED whose changedFields name
     languageCode (SDK 4.29.1 emits it; Anam's event list does not show it yet); a SERVER_WARNING within 5 s with no such event (Anam drops a
     refused update and says why) puts the choice back and says so in Arabic AND English (the person who chose may read neither page language).
     Suggestions only (a chip for 20 s, once per browser and language: localStorage "mig-jnl-langask"): the browser's language (not ar / en on
     the Arabic pages), Arabic for Janna on an English page, English for Bassem on an English page, and typed text in a script scriptLang()
     is sure of — never on Arabic or Latin text. Off in the widget and while «🛠️ المطوّر» → call_languages is off (data/flags.js).
     JANNA_LIVE.lang() = {current, def, stored, applied, warn}; JANNA_LIVE.lang(code) chooses (tests). */
  var LG = { mem: {}, asked: {}, prev: "", sentT: 0, sentTo: "", applied: false, warn: "", ask: "", askUntil: 0, fail: 0, el: null, menu: null, doc: null, key: null, rz: 0 };
  function langOn() { var F = window.MIGFLAGS; return !!sdkBox() && !(F && F.on && F.on("call_languages") === false); }
  function langDef() { return persona === "janna" && EN ? "en" : "ar"; }
  function langStored() { var s = ""; try { s = sessionStorage.getItem("mig-jnl-lang:" + persona) || ""; } catch (e) { s = LG.mem[persona] || ""; } return langRow(s) && s !== langDef() ? s : ""; }
  function langStore(code) { code = langRow(code) && code !== langDef() ? code : ""; LG.mem[persona] = code; try { if (code) sessionStorage.setItem("mig-jnl-lang:" + persona, code); else sessionStorage.removeItem("mig-jnl-lang:" + persona); } catch (e) {} }
  /* what the persona hears now: the person's 🌐 choice in this tab, else the persona's own language */
  function callLang() { return (langOn() && langStored()) || langDef(); }
  function langLabel(c) { return c === "ar" ? "ع" : String(c).toUpperCase(); }
  function langHead() { return T("لغة كلامك في المكالمة (مش لغة الموقع)", "The language you speak in this call (not the site language)"); }
  /* changedFields of PERSONA_CONFIG_UPDATE_APPLIED (an object, a list or a string): does it name k (camel or snake case, at any depth)? */
  function cfHas(cf, k) {
    var sk = k.replace(/[A-Z]/g, function (c) { return "_" + c.toLowerCase(); }), i, j;
    if (!cf) return false;
    if (typeof cf === "string") return cf.indexOf(k) > -1 || cf.indexOf(sk) > -1;
    if (Object.prototype.toString.call(cf) === "[object Array]") { for (i = 0; i < cf.length; i++) if (cfHas(cf[i], k)) return true; return false; }
    if (typeof cf !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(cf, k) || Object.prototype.hasOwnProperty.call(cf, sk)) return true;
    for (j in cf) if (Object.prototype.hasOwnProperty.call(cf, j) && cf[j] && typeof cf[j] === "object" && cfHas(cf[j], k)) return true;
    return false;
  }
  function cfAny(cf) { if (!cf) return false; if (typeof cf === "string" || Object.prototype.toString.call(cf) === "[object Array]") return cf.length > 0; if (typeof cf === "object") { for (var k in cf) if (Object.prototype.hasOwnProperty.call(cf, k)) return true; } return false; }
  /* the person's choice (the menu, the chips, JANNA_LIVE.lang) — the only way the language changes */
  function langSet(code) {
    code = String(code == null ? "" : code).toLowerCase(); if (!langRow(code) || !langOn()) return false;
    var me = LV, prev = callLang();
    langStore(code); LG.ask = ""; LG.fail = 0; LG.warn = "";
    if (code !== prev) { LG.prev = prev; LG.applied = false; if (me && me.ready && me.dc && me.client && !me.closed && !me.swapped) langSend(me, code, 1); }
    langUi(); return true;
  }
  /* persona_config {languageCode} (nothing else) + the LLM's LANGUAGE line (note: 0 none — a continued part has it in resumeText —, 1 mid-call, 2 the call's start) */
  function langSend(me, code, note) {
    try { me.client.sendDataMessage(JSON.stringify({ message_type: "persona_config", data: { languageCode: code } })); } catch (e) { return false; }
    LG.sentT = Date.now(); LG.sentTo = code; LG.applied = false; me.lang = code; /* what this part hears now (langOff) */
    if (note) { try { if (me.client.addContext) me.client.addContext(langNote(code, note === 2)); } catch (e) {} }
    return true;
  }
  /* every part, once it is ready and its data channel is open: the choice of this tab again — only when there is one */
  function langPart(me) {
    if (me.langDone || !me.ready || !me.dc || !me.client || me.closed || me.swapped || LV !== me || !langOn()) return;
    me.langDone = true;
    var stored = langStored();
    if (stored && stored !== langDef()) { LG.prev = langDef(); langSend(me, stored, me.cont ? 0 : 2); }
    langUi();
  }
  function langWire(me, on) {
    on("DATA_CHANNEL_OPEN", function () { setTimeout(function () { langPart(me); }, 0); });
    on("SESSION_READY", function () { setTimeout(function () { langPart(me); }, 0); if (!me.cont) setTimeout(function () { if (LV === me && !me.closed) langAskBrowser(); }, 1500); });
    on("PERSONA_CONFIG_UPDATE_APPLIED", function (x) { if (cfHas(x && x.changedFields, "languageCode")) { LG.applied = true; LG.sentT = 0; langUi(); } });
    on("SERVER_WARNING", function (m) { langWarn(me, m); });
  }
  /* Anam refused the update (a language its speech-to-text provider does not take): the choice goes back, said in both languages */
  function langWarn(me, m) {
    if (!LG.sentT || LG.applied || Date.now() - LG.sentT > 5000) return;
    var to = langRow(LG.sentTo), back = langRow(LG.prev && LG.prev !== LG.sentTo ? LG.prev : langDef());
    LG.sentT = 0; LG.warn = String(m == null ? "" : m).slice(0, 200); LG.fail = Date.now();
    langStore(back[0]);
    try { if (me.client && me.client.addContext && to) me.client.addContext("NOTE (the listening language did NOT change): switching what you hear to " + to[3] + " failed; the person's speech still reaches you as " + back[3] + " speech-to-text. Reply in the language of their own words (typed messages reach you exactly as written)."); } catch (e) {}
    langUi(); setTimeout(langChip, 10100);
  }
  /* a suggestion: the 20 s chip, once per browser and language (localStorage, else this page) */
  function langAsk(code) {
    var now = Date.now(), seen = {};
    if (!langOn() || !code || code === callLang() || (LG.ask && now < LG.askUntil) || LG.asked[code]) return;
    try { seen = JSON.parse(localStorage.getItem("mig-jnl-langask") || "{}") || {}; } catch (e) { seen = {}; }
    if (seen[code]) return;
    seen[code] = now; LG.asked[code] = 1; try { localStorage.setItem("mig-jnl-langask", JSON.stringify(seen)); } catch (e) {}
    LG.ask = code; LG.askUntil = now + 20000; langChip(); setTimeout(langChip, 20100);
  }
  var LANG_ALIAS = { fil: "tl", nb: "no", nn: "no", iw: "he", "in": "id" };
  function langAskBrowser() {
    if (!langOn() || langStored()) return; /* he chose already */
    var nl = "", p, def = langDef();
    try { nl = String((navigator.languages && navigator.languages[0]) || navigator.language || ""); } catch (e) {}
    p = nl.toLowerCase().split(/[-_]/)[0]; p = LANG_ALIAS[p] || p;
    if (!langRow(p)) return;
    if (persona === "janna" && EN && p === "ar") { langAsk("ar"); return; }
    if (persona === "bassem" && EN && p === "en") { langAsk("en"); return; }
    if (p !== "ar" && p !== "en" && p !== def) langAsk(p);
  }
  /* he typed in a script only one language (or a few) writes in: suggest it — the typed message itself reaches the LLM as written */
  function langTyped(t) { var c = ""; try { c = scriptLang(t); } catch (e) { c = ""; } if (c && c !== callLang()) langAsk(c); }
  /* the 🌐 button, its link under «ابدأ», the menu and the chip follow the state */
  function langUi() {
    var bx = sdkBox(), me = LV, on = langOn(), cur = callLang(), r = langRow(cur) || langRow("ar"), tl = langHead() + ": " + r[1];
    if (bx) {
      var b = bx.querySelector(".jv-lang"), g = bx.querySelector(".jv-lgo");
      if (b) { b.hidden = !on || !!(me && (me.textOnly || me.micDenied)); b.innerHTML = '<span aria-hidden="true">🌐</span><b aria-hidden="true">' + esc(langLabel(cur)) + "</b>"; b.title = tl; b.setAttribute("aria-label", tl); }
      if (g) { g.hidden = !on; g.textContent = "🌐 " + r[1]; g.title = tl; g.setAttribute("aria-label", tl); }
    }
    if (!on && LG.menu) langMenu(false);
    langChip();
  }
  function langFold(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { if (s.normalize) s = s.normalize("NFD"); } catch (e) {}
    return s.replace(/[\u0300-\u036f\u064b-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  /* the menu: every language by its own name (the persona's own first, then العربية / English), with a filter box */
  function langMenu(open) {
    var bx = sdkBox(), m = LG.menu, b = bx && bx.querySelector(".jv-lang"), cur, def, hd, order, items = [], i, r, q, lis;
    if (!open || !bx || !langOn()) {
      if (m && m.parentNode) m.parentNode.removeChild(m); LG.menu = null; if (b) b.setAttribute("aria-expanded", "false"); document.documentElement.classList.remove("jnl-lgm-on");
      if (LG.doc) { document.removeEventListener("click", LG.doc, true); document.removeEventListener("keydown", LG.key, true); LG.doc = LG.key = null; }
      return;
    }
    if (m) return;
    cur = callLang(); def = langDef(); hd = langHead(); order = [def, def === "ar" ? "en" : "ar"];
    for (i = 0; i < CALL_LANGS.length; i++) if (order.indexOf(CALL_LANGS[i][0]) < 0) order.push(CALL_LANGS[i][0]);
    for (i = 0; i < order.length; i++) {
      r = langRow(order[i]);
      items.push('<li data-s="' + esc(langFold(r.join(" "))) + '"><button type="button" role="option" data-l="' + r[0] + '" aria-selected="' + (r[0] === cur ? "true" : "false") + '"><bdi lang="' + r[0] + '">' + esc(r[1]) + (r[0] === cur ? " ✓" : "") + "</bdi><small>" + esc(T(r[2], r[3])) + "</small></button></li>");
    }
    m = LG.menu = document.createElement("div"); m.className = "jv-lgm"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", hd); m.dir = EN ? "ltr" : "rtl";
    m.innerHTML = '<div class="lgm-h"><b>🌐 ' + esc(hd) + '</b><button type="button" class="lgm-x" title="' + esc(T("إغلاق", "Close")) + '" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button></div>'
      + '<input type="search" class="lgm-q" autocomplete="off" enterkeyhint="search" placeholder="' + esc(T("دوّر على لغتك…", "Find your language…")) + '" aria-label="' + esc(T("دوّر على لغتك", "Find your language")) + '">'
      + '<ul role="listbox" aria-label="' + esc(hd) + '">' + items.join("") + "</ul>"
      + '<p class="lgm-n">' + esc(who(["جنة هتسمعك وترد عليك باللغة اللي تختارها، وتقدر تكتبلها بأي لغة في الخانة تحت.", "باسم هيسمعك ويرد عليك باللغة اللي تختارها، وتقدر تكتبله بأي لغة في الخانة تحت."], ["Janna hears you and answers in the language you choose; you can also type to her in any language in the box below.", "Bassem hears you and answers in the language you choose; you can also type to him in any language in the box below."])) + "</p>";
    bx.appendChild(m); if (b) b.setAttribute("aria-expanded", "true"); document.documentElement.classList.add("jnl-lgm-on"); /* the chips step aside while it is open */
    q = m.querySelector(".lgm-q"); lis = m.querySelectorAll("li");
    q.oninput = function () { var v = langFold(q.value); for (var j = 0; j < lis.length; j++) lis[j].hidden = !!v && lis[j].getAttribute("data-s").indexOf(v) < 0; };
    m.querySelector(".lgm-x").onclick = function () { langMenu(false); };
    m.querySelector("ul").onclick = function (e) { var t = e.target && e.target.closest ? e.target.closest("[data-l]") : null; if (!t) return; langMenu(false); langSet(t.getAttribute("data-l")); };
    LG.doc = function (e) { var t = e.target; if (LG.menu && !LG.menu.contains(t) && !(t && t.closest && t.closest(".jv-lang, .jv-lgo, .jnl-lgf"))) langMenu(false); };
    LG.key = function (e) { if (e.key !== "Escape" && e.key !== "Esc") return; langMenu(false); var b2 = sdkBox() && sdkBox().querySelector(".jv-lang"); if (b2 && !b2.hidden) { try { b2.focus(); } catch (x) {} } };
    document.addEventListener("click", LG.doc, true); document.addEventListener("keydown", LG.key, true);
    try { if (window.matchMedia && window.matchMedia("(pointer:fine)").matches) q.focus(); else { var s0 = m.querySelector('[aria-selected="true"]'); if (s0) s0.focus(); } } catch (e) {}
  }
  /* the chip over the video: «🎤 Français · ↩︎ عربي» while another language is on, a suggestion «🎤 Español? ✓ ✕», or the refusal (both languages) */
  function langChip() {
    var bx = sdkBox(), me = LV, el = LG.el, now = Date.now(), cur = callLang(), def = langDef(), m = "", c, r, k, nm;
    var live = !!(bx && ov && !ov.hidden && me && me.ready && !me.closed && !me.textOnly && langOn());
    if (live) m = LG.fail && now - LG.fail < 10000 ? "fail" : LG.ask && now < LG.askUntil && LG.ask !== cur ? "ask" : cur !== def ? "cur" : "";
    if (!m) { if (el) el.hidden = true; return; }
    if (!el) {
      el = LG.el = document.createElement("div"); el.className = "jnl-nzf jnl-lgf"; el.setAttribute("translate", "no");
      el.innerHTML = '<div class="jv-nz jv-lg" role="status" aria-live="polite"></div>'; document.body.appendChild(el);
      if (!LG.rz) { LG.rz = 1; window.addEventListener("resize", langPlace); }
    }
    if (!ov.__lg) { ov.__lg = 1; ov.addEventListener("scroll", langPlace, { passive: true }); }
    c = el.firstChild; el.dir = EN ? "ltr" : "rtl"; k = m + ":" + (m === "ask" ? LG.ask : cur) + ":" + def;
    if (c.getAttribute("data-k") !== k) {
      c.setAttribute("data-k", k);
      if (m === "fail") c.innerHTML = '<span>⚠️ <bdi dir="rtl" lang="ar">ماقدرتش أغيّر لغة السمع — تقدر تكتب بلغتك في الخانة تحت</bdi><br><bdi dir="ltr" lang="en">I could not switch the listening language — you can type in your language in the box below</bdi></span><button type="button" class="lg-x" title="' + esc(T("إغلاق", "Close")) + '" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button>';
      else if (m === "ask") {
        r = LG.ask === "menu" ? null : langRow(LG.ask);
        nm = r ? '<bdi lang="' + r[0] + '">' + esc(r[1]) + (/[\u0590-\u08ff]/.test(r[1]) ? "؟" : "?") + "</bdi>" : "🌐?"; /* the question mark in the name's own run */
        c.innerHTML = '<span title="' + esc(langHead()) + '">🎤 ' + nm + '</span><button type="button" class="lg-yes" title="' + esc(r ? T("أيوه، هتكلم بال" + r[2], "Yes, I'll speak " + r[3]) : T("اختار لغتك", "Choose your language")) + '" aria-label="' + esc(r ? T("أيوه، هتكلم بال" + r[2], "Yes, I'll speak " + r[3]) : T("اختار لغتك", "Choose your language")) + '">✓</button><button type="button" class="lg-no" title="' + esc(T("لأ، شكراً", "No, thanks")) + '" aria-label="' + esc(T("لأ، شكراً", "No, thanks")) + '">✕</button>';
      } else {
        r = langRow(cur);
        c.innerHTML = '<span title="' + esc(langHead()) + '">🎤 <bdi lang="' + r[0] + '">' + esc(r[1]) + '</bdi></span><button type="button" class="lg-back" title="' + esc(def === "en" ? T("ارجع للإنجليزي", "Back to English") : T("ارجع للعربي", "Back to Arabic")) + '" aria-label="' + esc(def === "en" ? T("ارجع للإنجليزي", "Back to English") : T("ارجع للعربي", "Back to Arabic")) + '">' + (def === "en" ? "↩︎ English" : "↩︎ عربي") + "</button>";
      }
      var y = c.querySelector(".lg-yes"), n0 = c.querySelector(".lg-no"), bk = c.querySelector(".lg-back"), x0 = c.querySelector(".lg-x");
      if (y) y.onclick = function () { var a = LG.ask; LG.ask = ""; if (a === "menu") { langChip(); langMenu(true); } else langSet(a); };
      if (n0) n0.onclick = function () { LG.ask = ""; langChip(); };
      if (bk) bk.onclick = function () { langSet(langDef()); };
      if (x0) x0.onclick = function () { LG.fail = 0; langChip(); };
    }
    el.hidden = false; langPlace();
  }
  /* its place: like the noise chip's (6 px above the control bar), and above the noise chip when both show */
  function langPlace() {
    var el = LG.el, bx = sdkBox(); if (!el || el.hidden) return;
    var ctl = bx && bx.querySelector(".jv-ctl"), r = bx ? bx.getBoundingClientRect() : null, cr = ctl && !ctl.hidden ? ctl.getBoundingClientRect() : null, vh = window.innerHeight || document.documentElement.clientHeight;
    var nz = NZ.el, nr = nz && !nz.hidden && nz.style.visibility !== "hidden" ? nz.getBoundingClientRect() : null;
    if (!r || !r.width || !cr || !cr.height) { el.style.visibility = "hidden"; return; }
    el.style.visibility = ""; el.style.left = Math.round(r.left + 10) + "px"; el.style.width = Math.max(0, Math.round(r.width - 20)) + "px"; el.style.bottom = Math.round(vh - (nr && nr.height ? nr.top : cmTop(cr.top)) + 6) + "px";
  }
  function langDrop() { langMenu(false); LG.ask = ""; LG.fail = 0; if (LG.el && LG.el.parentNode) LG.el.parentNode.removeChild(LG.el); LG.el = null; }
  /* review 2026-11-20 F5: «🛠️ المطوّر» turned call_languages off while this call hears another language: the call goes back to the persona's
     own at once — what the switch promises (every call then hears exactly as before) —, once, and the tab's choice is forgotten */
  function langOff() {
    var me = LV, def = langDef(), r = langRow(def), ar = def === "ar";
    if (langOn() || !me || !me.lang || me.lang === def || !me.ready || !me.dc || !me.client || me.closed || me.swapped) return;
    langStore(""); LG.ask = ""; LG.fail = 0; LG.warn = ""; LG.prev = def;
    if (!langSend(me, def, 0)) return;
    LG.sentT = 0; /* the persona's own language: no refusal to wait for (langWarn) */
    try { if (me.client.addContext) me.client.addContext("LANGUAGE: " + r[0] + " (" + r[3] + "). The platform turned the 🌐 language switch off: their speech reaches you in " + r[3] + " again. From your next reply "
      + (ar ? "speak Egyptian Arabic exactly as your rules say." : "speak " + r[3] + " as your rules say.") + " Tool arguments stay as your rules say (search words in Arabic or English)."); } catch (e) {}
  }
  window.addEventListener("mig:flags", function () { try { langOff(); } catch (e) {} try { langUi(); } catch (e) {} });
  /* the stage height inside the widget (see SHADOW_CSS); retried until the widget has rendered its shadow root */
  function shadowCss(ag, n) {
    var sr = null; try { sr = ag.shadowRoot; } catch (e) {}
    if (sr && sr.querySelector(".anam-sheet, .anam-widget")) { if (!sr.querySelector("style[data-jnl]")) { var s2 = document.createElement("style"); s2.setAttribute("data-jnl", "1"); s2.textContent = SHADOW_CSS; sr.appendChild(s2); } return; }
    if (n < 60 && ov && ov.contains(ag)) setTimeout(function () { shadowCss(ag, n + 1); }, 250);
  }
  /* «اجتماع» from Janna's welcome card: once the session is on, the visitor's request is typed into the call for them (the same as
     typing it in the widget's own text box), so Janna starts the introductory meeting at once; nothing is sent if that box is missing */
  function nudge(text, n) {
    /* the SDK call: sent as the visitor's own message once the session can take it */
    if (sdkBox()) { if (sdkSay(text)) NUDGE = ""; else if (n < 24 && ov) setTimeout(function () { if (NUDGE) nudge(text, n + 1); }, 500); return; }
    var ag = ov && ov.querySelector("anam-agent"), sr = null; try { sr = ag && ag.shadowRoot; } catch (e) {}
    var inp = sr && sr.querySelector("input.anam-ctl-input");
    if (!inp || inp.disabled) { if (n < 24 && ov) setTimeout(function () { nudge(text, n + 1); }, 500); return; }
    NUDGE = "";
    try {
      inp.value = text; inp.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      setTimeout(function () { var b = sr.querySelector(".anam-ctl-send"); if (b && !b.disabled) b.click(); else inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, composed: true })); }, 120);
    } catch (e) {}
  }
  /* full screen = the video alone; the whole page goes full screen (not only the overlay) so the captions and the hologram stay visible */
  function fullscreen(on) {
    if (!ov) return; ov.classList.toggle("fs", !!on);
    var b = ov.querySelector(".fsb"), bl = on ? T("تصغير", "Exit full screen") : T("ملء الشاشة", "Full screen"); if (b) { b.setAttribute("aria-pressed", on ? "true" : "false"); b.title = bl; b.setAttribute("aria-label", bl); b.innerHTML = (on ? "🗗" : "⛶") + '<span class="lb"> ' + esc(bl) + "</span>"; }
    var de = document.documentElement, fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (on && !fsEl) { var rq = de.requestFullscreen || de.webkitRequestFullscreen; if (rq) { var pr = rq.call(de); if (pr && pr.catch) pr.catch(function () {}); } }
      else if (!on && fsEl) { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { var p2 = ex.call(document); if (p2 && p2.catch) p2.catch(function () {}); } }
    } catch (e) {}
    if (on) try { ov.scrollTop = 0; } catch (e) {}
  }
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (n) { document.addEventListener(n, function () { if (ov && ov.classList.contains("fs") && !(document.fullscreenElement || document.webkitFullscreenElement)) fullscreen(false); }); });
  document.addEventListener("keydown", function (e) { if (ov && !ov.hidden && (e.key === "Escape" || e.key === "Esc") && ov.classList.contains("fs") && !(document.fullscreenElement || document.webkitFullscreenElement)) fullscreen(false); });
  /* open() · open({persona:"bassem"|"janna"}) · open({intent:"meeting"}) · open({meeting:{id, kind:"scheduled", name, consent}, screen:"home.html"}) */
  function open(o) {
    o = o && typeof o === "object" && !o.target && !o.type ? o : {};
    /* Bassem's tab: his call is in the tab that opened this one — that tab comes back, no second call here («باسم معاك») */
    if (!ov && wbHold()) return;
    var p = o.persona === "bassem" ? "bassem" : "janna";
    if (o.meeting || o.intent === "meeting") p = "janna";
    /* «🛠️ المطوّر» → «المزايا»: this persona's live calls are switched off (data/flags.js; the Worker refuses the token too) */
    if (liveOff(p)) { if (!(ov && persona === p)) note(liveOffMsg(p)); return; }
    /* the store rules (call_consent_app in the app / call_consent_web on the website, both OFF until the owner approves the text): the
       AI-call notice first, once per device (localStorage "mig-ai-ok"); «لا، شكراً» = no call. The Worker refuses a session without it too */
    if (!ov && aiNeed() && !o.__aiok) { aiCard(p, function () { o.__aiok = 1; open(o); }); return; }
    if (ov && persona !== p) close();
    persona = p;
    if (p === "bassem") loadTools();
    if (!ov) build();
    /* Bassem SHOWS what he finds and saves: data/bassem-intel-view.js (intel results on the hologram + the screen, bassem_save_profile) */
    if (p === "bassem" && !window.BASSEM_VIEW && !document.querySelector("script[data-bassem-view]")) { var bv = document.createElement("script"), me0 = document.querySelector('script[src*="data/janna-live.js"]'); bv.src = (me0 ? me0.src.replace(/data\/janna-live\.js.*$/, "") : CLEAN ? "/" : "") + "data/bassem-intel-view.js" + (window.MIGVER_BV || (me0 && /[?&]v=([\w.-]+)/.exec(me0.src) ? "?v=" + /[?&]v=([\w.-]+)/.exec(me0.src)[1] : "")); /* same ?v= as janna-live.js (consolidation) */ bv.async = true; bv.setAttribute("data-bassem-view", "1"); document.head.appendChild(bv); }
    if (sdkBox()) holoCards(); /* the holo cards on the call video: what the persona searches for and what it found (data/call-holo.js) */
    if (!window.BASSEM_MEMORY && !document.querySelector("script[data-bmm]")) { /* 0009: Janna's calls are remembered too (visitor id) */ var bmS = document.createElement("script"), bmJ = document.querySelector('script[src*="data/janna-live.js"]'), bmU = bmJ ? bmJ.src : "", bmV = /[?&]v=([\w.-]+)/.exec(bmU); bmS.src = (bmU ? bmU.replace(/data\/janna-live\.js.*$/, "") : "") + "data/bassem-memory.js" + (window.MIGVER_BM || (bmV ? "?v=" + bmV[1] : "")); bmS.async = true; bmS.charset = "utf-8"; bmS.setAttribute("data-bmm", "1"); document.head.appendChild(bmS); } /* Bassem's memory + web results, Janna's visitor memory: data/bassem-memory.js */
    ov.hidden = false; document.documentElement.style.overflow = "hidden"; document.documentElement.classList.add("jnl-on");
    if (!frame.getAttribute("src")) frame.src = o.screen ? withLang(url(o.screen)) : here();
    try { if (window.JANNA && JANNA.stop) JANNA.stop(); if (window.BASSEM && BASSEM.stop) BASSEM.stop(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    if (o.meeting && o.meeting.id && (!MT || MT.id !== o.meeting.id)) startMeeting({ kind: "scheduled", id: String(o.meeting.id), name: o.meeting.name || o.meeting.first_name || "", email: "", consent: !!o.meeting.consent });
    else if (o.intent === "meeting" && !MT) {
      /* the welcome card «اجتماع»: meeting mode at once (agenda, timer, recording only after consent); Janna collects the name, the
         e-mail and the consent in the call and starts it with janna_start_meeting */
      startMeeting({ kind: "instant", pre: true, name: "", email: "", consent: false });
      NUDGE = T("عايز أبدأ اجتماع تعريفي معاكي دلوقتي", "I'd like to start an introductory meeting with you now");
      if (sessT0) nudge(NUDGE, 0);
    }
  }
  /* «كروت الهولوجرام» (owner 2026-11-20 «المفروض وهي بتقول أنا ببحث عن مناقصة او فرصة يظهر ده»): data/call-holo.js, loaded once and
     lazily, with this file's ?v= (or window.MIGVER_CH), for SDK calls only — the widget fallback reports no tool results */
  function holoCards() {
    if (window.MIG_CALL_HOLO || document.querySelector("script[data-call-holo]")) return;
    var s = document.createElement("script"), me = document.querySelector('script[src*="data/janna-live.js"]'), src = me ? me.src : "", v = /[?&]v=([\w.-]+)/.exec(src);
    s.src = (src ? src.replace(/data\/janna-live\.js.*$/, "") : CLEAN ? "/" : "") + "data/call-holo.js" + (window.MIGVER_CH || (v ? "?v=" + v[1] : "")); s.async = true; s.charset = "utf-8"; s.setAttribute("data-call-holo", "1");
    document.head.appendChild(s);
  }
  /* the page the screen starts on: the page the visitor is on (its clean URL), the home page from the meeting page */
  function here() {
    if (pageKey(window) === "meeting") return withLang(url("home.html"));
    if (!CLEAN) { var f = location.pathname.split("/").pop() || "home.html"; return withLang(f.replace(/^index\.html$/, "home.html") + location.search.replace(/([?&])(lang|live)=[^&]*&?/g, "$1").replace(/[?&]$/, "") + cleanHash()); }
    return withLang(location.pathname + location.search.replace(/([?&])(lang|live)=[^&]*&?/g, "$1").replace(/[?&]$/, "") + cleanHash());
  }
  function cleanHash() { return (location.hash || "").replace(/([#&])(live=1|bcmd=[^&]*|lt=[^&]*)(&|$)/g, function (m, a, b, c) { return c ? a : ""; }).replace(/^#$/, ""); }
  function close() {
    if (!ov) return;
    var m = MT && !MT.done ? MT : null;
    if (m) finishMeeting("closed");
    if (ov.classList.contains("fs")) fullscreen(false);
    /* the SDK call is ended explicitly (stops the session and its minutes); removing the widget's element ends the widget's session */
    sdkStop("close"); LV = null;
    try { if (window.MIGCHATMEDIA && MIGCHATMEDIA.drop) MIGCHATMEDIA.drop(); } catch (e) {} /* 📎 */
    langDrop(); micDrop(); nzDbgOff(); NZ.offerUntil = 0; if (NZ.el && NZ.el.parentNode) NZ.el.parentNode.removeChild(NZ.el); NZ.el = null; try { if (NZ.ac) { var acp = NZ.ac.close(); if (acp && acp.then) acp.then(null, function () {}); } } catch (e) {} NZ.ac = null; /* noise guard: microphone + meter released */
    /* the captions box goes back to the page first; the holo cards' timers stop (data/call-holo.js) */
    try { if (window.MIGCAPTIONS && MIGCAPTIONS.place) { ov.hidden = true; MIGCAPTIONS.place(); } } catch (e) {}
    try { if (window.MIG_CALL_HOLO && MIG_CALL_HOLO.clear) MIG_CALL_HOLO.clear(); } catch (e) {}
    ov.remove(); ov = null; frame = null; SID = ""; sessT0 = 0; NUDGE = ""; document.documentElement.style.overflow = ""; document.documentElement.classList.remove("jnl-on");
    clearInterval(scrT); scrT = 0; setTimeout(wbTell, 0);
    if (m) { m.noteEl = note(m.msg); MT = null; }
  }
  /* ---------- the AI-call notice (app parity plan, item ai-call-consent; the owner's switches call_consent_app / call_consent_web, both
     OFF until he approves the words of docs/app/OWNER-APPROVAL-AR.md): «موافق، ابدأ» is kept on this device (localStorage "mig-ai-ok",
     else for this page) and every session request then says consent: true (sessBody) ---------- */
  var AI_KEY = "mig-ai-ok", AI_MEM = false;
  function aiOk() { if (AI_MEM) return true; try { return localStorage.getItem(AI_KEY) === "1"; } catch (e) { return false; } }
  function aiSet(v) { AI_MEM = !!v; try { if (v) localStorage.setItem(AI_KEY, "1"); else localStorage.removeItem(AI_KEY); } catch (e) {} }
  function aiNeed() { var F = window.MIGFLAGS; return !!(F && F.on && F.on(INAPP ? "call_consent_app" : "call_consent_web") === true) && !aiOk(); }
  function aiCard(p, then) {
    var old = document.querySelector(".jnl-ai"); if (old) old.remove();
    if (!document.getElementById("jnl-ai-css")) { var st = document.createElement("style"); st.id = "jnl-ai-css";
      st.textContent = ".jnl-ai{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));background:rgba(4,18,26,.55)}"
        + ".jnl-ai>div{box-sizing:border-box;width:min(460px,100%);background:#fff;color:#0F172A;border-radius:16px;padding:18px;box-shadow:0 20px 50px -20px rgba(0,0,0,.6);font:600 15px/1.8 Cairo,Tahoma,Arial,sans-serif}"
        + ".jnl-ai b{display:block;font-size:16px;font-weight:800;margin:0 0 6px}.jnl-ai p{margin:0 0 8px}.jnl-ai a{color:#8E0B20;text-decoration:underline}"
        + ".jnl-ai .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.jnl-ai button{flex:1 1 auto;min-height:44px;border-radius:999px;border:0;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer}"
        + ".jnl-ai .ok{background:#0b5d47;color:#fff}.jnl-ai .no{background:#EEF0F3;color:#0F172A}"; document.head.appendChild(st); }
    var B = p === "bassem", nm = B ? T("باسم", "Bassem") : T("جنة", "Janna"), leg = (CLEAN ? "/legal/" : "legal.html") + (EN ? "?lang=en" : "") + "#privacy";
    var c = document.createElement("div"); c.className = "jnl-ai"; c.setAttribute("translate", "no"); c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true"); c.dir = EN ? "ltr" : "rtl";
    c.innerHTML = '<div><b>' + esc(T("قبل المكالمة", "Before the call")) + "</b><p>"
      + esc(B ? T("المكالمة دي مع مساعد بالذكاء الاصطناعي: صوتك وكلامك بيتبعتوا لمزوّد المحادثة المرئية (Anam) علشان يتحوّل لرد، والمنصة بتحتفظ بملخص كلامكم علشان باسم يكمّل معاك.", "This call is with an AI assistant: your voice and words are sent to the video-chat provider (Anam) to be turned into a reply, and the platform keeps a summary of your conversation so Bassem can carry on with you.")
        : T("المكالمة دي مع مساعد بالذكاء الاصطناعي: صوتك وكلامك بيتبعتوا لمزوّد المحادثة المرئية (Anam) علشان يتحوّل لرد، والمنصة بتحتفظ بملخص كلامكم علشان جنة تكمّل معاك.", "This call is with an AI assistant: your voice and words are sent to the video-chat provider (Anam) to be turned into a reply, and the platform keeps a summary of your conversation so Janna can carry on with you."))
      + '</p><p><a href="' + esc(leg) + '">' + esc(T("سياسة الخصوصية", "Privacy policy")) + '</a></p><div class="acts"><button type="button" class="ok">' + esc(T("موافق، ابدأ", "OK, start")) + '</button><button type="button" class="no">' + esc(T("لا، شكراً", "No, thanks")) + "</button></div></div>";
    document.body.appendChild(c);
    var fin = function (yes) { c.remove(); if (yes) { aiSet(true); then(); } else note(T("تمام — تقدر تكلّم " + nm + " كتابة من غير مكالمة.", "OK — you can still write to " + nm + " without a call.")); };
    c.querySelector(".ok").onclick = function () { fin(true); }; c.querySelector(".no").onclick = function () { fin(false); };
    try { c.querySelector(".ok").focus(); } catch (e) {}
  }
  /* the owner's switches (data/flags.js MIGFLAGS; absent → nothing is off) */
  function liveOff(p) { var F = window.MIGFLAGS; return !!(F && F.on && F.on(p === "bassem" ? "bassem_live" : "janna_live") === false); }
  function liveOffMsg(p) { var F = window.MIGFLAGS, m = F && F.msg ? F.msg(p === "bassem" ? "bassem_live" : "janna_live") : ""; return m || (p === "bassem" ? T("مكالمات باسم المباشرة موقوفة مؤقتاً — جرّب تاني بعد شوية.", "Live calls with Bassem are paused for now — please try again later.") : T("مكالمات جنة المباشرة موقوفة مؤقتاً — تقدر تكلّمها كتابة من «اسأل جنة».", "Live calls with Janna are paused for now — you can still write to her via «Ask Janna».")); }
  function note(msg) {
    if (!msg) return; var n = document.createElement("div"); n.className = "jnl-note"; n.dir = EN ? "ltr" : "rtl"; n.setAttribute("translate", "no"); n.setAttribute("role", "status"); n.textContent = msg;
    document.body.appendChild(n); setTimeout(function () { n.remove(); }, 9000); return n;
  }
  btn.addEventListener("click", function () { open(); });
  /* members' tools (dashboard, requests monitor, advisor, meeting): the pill goes next to the collapsed headshot, away from the page's
     navigation — set here too, because data/janna.js does not run while Bassem serves a partner member */
  (function () {
    var k = pageKey(window); if (!{ dashboard: 1, inbox: 1, advisor: 1, meeting: 1, admin: 1 }[k]) return;
    var de = document.documentElement, rtl = (de.getAttribute("dir") || (document.body && getComputedStyle(document.body).direction) || "rtl") !== "ltr";
    de.classList.add("jn-quiet"); de.classList.toggle("jn-qrtl", rtl);
  })();
  (function () {
    var want = /[?&#]live=1(?:[&#]|$)/.test(location.search + location.hash);
    if (!want && !window.JANNA_LIVE_AUTO) return;
    if (WB) return; /* Bassem's tab: no call starts by itself here («باسم معاك») */
    if (!want || pageKey(window) !== "advisor") { setTimeout(open, 300); return; }
    /* Bassem's "I'm ready — let's talk on video" link: he opens once the platform confirms the member's plan (data/bassem.js decides) */
    var tries = 0, done0 = false;
    var go = function () {
      if (done0) return; var B = window.BASSEM, i = B && B.info ? B.info() : null;
      if (i && i.eligible && !i.expired) { done0 = true; try { history.replaceState(null, "", location.pathname + location.search + (location.hash || "").replace(/([#&])live=1(&|$)/, function (m, a, b) { return b ? a : ""; }).replace(/^#$/, "")); } catch (e) {} setTimeout(function () { open({ persona: "bassem" }); }, 300); return; }
      if (i && i.pending && tries++ < 40) { setTimeout(go, 500); return; }
    };
    ["mig:me", "mig:login", "bassem:change"].forEach(function (n) { window.addEventListener(n, function () { setTimeout(go, 200); }); });
    setTimeout(go, 600);
  })();

  /* ---------- tools ---------- */
  function go(u, then) { if (!MIR && LKS) LKS.k = ""; /* the screen moves on: the mirrored search is no longer what it shows (review F2) */ pending = then || null; frame.src = withLang(url(u)); var sw = ov && ov.querySelector(".jnl-hd .sw"); if (sw && ov.scrollTop < 40) sw.classList.add("new"); }

  /* ---------- nothing leaves the call by the side door («باسم معاك», owner 2026-11-19) ----------
     openTab(u): a same-site page out of Bassem's call opens in a tab of its own, marked as his (window.name «mig-bassem-<ms>» + ?with=bassem,
     see the top of this file), from the member's own tap (a browser lets a page open a tab only then); the call stays in this tab. Another
     site's page → a plain new tab. → the new window (same site), or null. */
  var scrT = 0, TABS = [];
  function absUrl(u, w) { try { return new URL(String(u == null ? "" : u), (w && w.location && w.location.href) || location.href); } catch (e) { return null; } }
  function extTab(href) { try { window.open(href, "_blank", "noopener"); } catch (e) {} }
  function openTab(u) {
    var a = absUrl(u); if (!a || !/^https?:$/.test(a.protocol)) return null;
    /* another site, or a file / API answer of this one (a PDF, an .ics, an export: no page, no Janna — and a signed query stays whole) */
    if (a.origin !== location.origin || /^\/(api|media|data|img|assets|_seo)\//.test(a.pathname) || /\.(?!html?$)[a-z0-9]{2,5}$/i.test(a.pathname)) { extTab(a.href); return null; }
    if (!/[?&]with=bassem(?:&|$)/.test(a.search)) a.search = (a.search && a.search !== "?" ? a.search + "&" : "?") + "with=bassem";
    var nm = "mig-bassem-" + new Date().getTime(), w = null;
    try { w = window.open(a.href, nm); } catch (e) { w = null; }
    if (!w) { say(INAPP ? T("مقدرتش أفتح الصفحة — كمّل هنا على الشاشة", "I couldn't open the page — carry on here on the screen") : T("المتصفح منع فتح تاب جديدة — اسمح بالنوافذ المنبثقة للموقع، أو كمّل هنا على الشاشة", "The browser blocked the new tab — allow pop-ups for this site, or carry on here on the screen")); return null; }
    try { if (w.name !== nm) w.name = nm; } catch (e) {}
    TABS.push(w); if (TABS.length > 12) TABS.shift();
    say(INAPP ? T("فتحتلك الصفحة فوق المكالمة — وأنا معاك هنا", "I opened the page over the call — I'm right here with you") : T("فتحتلك الصفحة في تاب جديدة — وأنا معاك هنا في المكالمة", "I opened the page in a new tab — I'm right here with you on the call"));
    return w;
  }
  /* the call ended here: Bassem's tabs say so at once (data/bassem-tab.js update()) instead of at their next look */
  function wbTell() { for (var i = 0; i < TABS.length; i++) { try { var w = TABS[i]; if (w && !w.closed && w.MIG_WB_TAB && w.MIG_WB_TAB.update) w.MIG_WB_TAB.update(); } catch (e) {} } }
  /* a link click → what it would do: "tab" (a new tab: target=_blank or a named target, ctrl / ⌘ / shift / middle click), "top" (_top /
     _parent: the whole tab), "" (where it is). null: not a navigation worth a look (no link, a download, mailto: / tel:, a hash link) */
  function linkOf(e, w) {
    if (e.defaultPrevented || (e.type === "auxclick" && e.button !== 1)) return null;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || typeof a.href !== "string" || a.hasAttribute("download") || /^\s*#/.test(a.getAttribute("href") || "")) return null; /* (an SVG link's href is no string) */
    var u = absUrl(a.href, w); if (!u || !/^https?:$/.test(u.protocol)) return null;
    var tg = String(a.getAttribute("target") || "").toLowerCase();
    var how = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1 || (tg && tg !== "_self" && tg !== "_top" && tg !== "_parent") ? "tab" : tg === "_top" || tg === "_parent" ? "top" : "";
    return { u: u, same: u.origin === location.origin, how: how };
  }
  /* the shared screen's documents (every page it shows: app, generated, the Information Center): Janna's widgets hidden (SCREEN_CSS), and
     its links — Bassem's call: a same-site page it would open in a new tab → openTab; any call: _top / _parent never take this tab (that
     would end the call): same-site → on the screen, another site → a new tab; its window.open the same way. Hooked on load and, before
     that, by a look every 200 ms while the call is open (a link can be tapped before the page's images finished). */
  function scrHook() {
    var d = null, w = null; try { if (!frame) return; d = frame.contentDocument; w = frame.contentWindow; } catch (e) { return; }
    if (!d || !w || !d.documentElement || d.__migScr) return;
    d.__migScr = 1;
    try { if (!d.querySelector("style[data-mig-scr]")) { var s = d.createElement("style"); s.setAttribute("data-mig-scr", "1"); s.textContent = SCREEN_CSS; (d.head || d.documentElement).appendChild(s); } } catch (e) {}
    var click = function (e) {
      var l = linkOf(e, w); if (!l || !frame) return;
      if (l.how === "tab") { if (l.same && persona === "bassem") { e.preventDefault(); openTab(l.u.href); } return; }
      if (l.how === "top") { e.preventDefault(); if (l.same) { try { w.location.href = l.u.href; } catch (x) { frame.src = l.u.href; } } else extTab(l.u.href); }
    };
    d.addEventListener("click", click, false); d.addEventListener("auxclick", click, false);
    try {
      var o0 = w.open;
      if (o0 && !o0.__mig) {
        var o1 = function (u, t) {
          var tg = String(t == null || t === "" ? "_blank" : t).toLowerCase(), a = absUrl(u, w);
          if (a && /^https?:$/.test(a.protocol)) {
            if ((tg === "_top" || tg === "_parent") && frame) { if (a.origin === location.origin) { try { w.location.href = a.href; } catch (x) { frame.src = a.href; } } else extTab(a.href); return null; }
            if (tg === "_blank" && a.origin === location.origin && persona === "bassem") return openTab(a.href);
          }
          return o0.apply(w, arguments);
        };
        o1.__mig = 1; w.open = o1;
      }
    } catch (e) {}
  }
  /* this tab's own links while a call is open (the hologram's results, the cards under the video …): nothing takes this tab away from the
     call — a same-site page opens on the shared screen (a busy screen: Bassem's tab, else a new tab), another site's in a new tab; a
     same-site link that opens a new tab → Bassem's tab in his call */
  function topClick(e) {
    if (!ov || ov.hidden) return;
    var l = linkOf(e, window); if (!l) return;
    if (l.u.origin === location.origin && l.u.pathname === location.pathname && l.u.search === location.search && l.u.hash) return; /* this page's own anchor */
    if (l.how === "tab") { if (l.same && persona === "bassem") { e.preventDefault(); openTab(l.u.href); } return; }
    e.preventDefault();
    if (!l.same) { extTab(l.u.href); return; }
    if (frame && !screenBusy()) {
      go(l.u.pathname + l.u.search + l.u.hash);
      if (stackedNow()) { var s2 = ov.querySelector(".jnl-scr"); if (s2) try { s2.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (x) { s2.scrollIntoView(); } }
      return;
    }
    if (persona === "bassem") openTab(l.u.href); else extTab(l.u.href);
  }
  document.addEventListener("click", topClick, false); document.addEventListener("auxclick", topClick, false);
  function stackedNow() { try { return !!(window.matchMedia && window.matchMedia("(max-width:820px),(max-aspect-ratio:3/2)").matches); } catch (e) { return false; } }
  function onLoad() {
    cmpGive(""); scrHook();
    var d; try { d = frame.contentDocument; title.textContent = d.title.split("|")[0].split("·")[0].trim(); } catch (e) { return; }
    var p = pending; pending = null; if (p) setTimeout(function () { try { p(d, frame.contentWindow); } catch (e) { } }, 450);
  }
  function setVal(d, sel, v) {
    var el = d.querySelector(sel); if (!el || v == null || v === "") return false;
    if (el.tagName === "SELECT") {
      var n = norm(v), opt = [].filter.call(el.options, function (o) { return o.value && (norm(o.textContent).indexOf(n) > -1 || n.indexOf(norm(o.textContent.split(" · ")[0])) > -1 || norm(o.value) === n); })[0];
      if (!opt) return false; el.value = opt.value;
    } else el.value = String(v);
    ["input", "change", "keyup"].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
    el.style.transition = "box-shadow .3s"; el.style.boxShadow = "0 0 0 3px rgba(90,210,255,.75)";
    setTimeout(function () { el.style.boxShadow = ""; }, 4000);
    return true;
  }
  function norm(s) { return String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/^ال/, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function show(d, sel) { var el = d.querySelector(sel); inView(el, "start"); }
  function inView(el, at) {
    if (!el || !el.getBoundingClientRect) return; var w = el.ownerDocument && el.ownerDocument.defaultView; if (!w) return;
    try { var r = el.getBoundingClientRect(), y = r.top + w.pageYOffset - (at === "center" ? (w.innerHeight - r.height) / 2 : 70); w.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); } catch (e) {}
  }
  function govCode(g) { if (!g) return ""; if (GOV[String(g).toUpperCase()]) return String(g).toUpperCase(); var n = norm(g); for (var k in GOV) if (norm(GOV[k]) === n || norm(GOV[k]).indexOf(n) > -1) return k; return ""; }
  /* ---------- the page shows what the lookups found (speed review 2026-11-20 #5) ----------
     A janna_lookup that found something puts the same search on the shared screen as soon as its RESULT is in (the screen moves before the
     persona speaks: her next pass takes ≥ 0.67 s after the tool returns), so her own janna_search for it does not load it again (run);
     platform_item's ONE item (found, not «ambiguous») opens its own page. From the result, never from the call's start: webhook arguments
     arrive nested ({bodyParams}), and a search that found nothing (a foreign word too) never replaces the screen. Never over work on the
     screen (screenBusy: the deal room, a form being filled); the first lookup in 2.5 s only. Bassem's screen tools read it as they read his
     own janna_search (data/bassem-live-tools.js watchSearch, host.shown) */
  var LKS = { k: "", t: 0, ok: 0 }, LK_SEC = { factories: "factories", suppliers: "suppliers", products: "market", market: "market", tenders: "tenders", rfqs: "rfqs", offers: "offers" };
  /* review 2026-11-20 F1: the page moves the screen only when the persona did not. The prompts still ask for janna_lookup + janna_search (or
     platform_item + bassem_open_item) in ONE step: then the persona's own screen tool already shows the request, and a second load would
     only delay the list and replace the page Bassem's awaited tools are reading. scrMark (wire(), every tool call's start): when each
     janna_lookup / platform_item started (LK0, by toolCallId) and when the persona last started a tool that moves the screen (SCR.t — never
     the page's own mirror, which does not come through wire()). MV0: the page's own last move (the first result in 2.5 s only). MIR: go()
     is running for the mirror. */
  var SCR = { t: 0 }, LK0 = {}, LK0_N = 0, MIR = 0, MV0 = 0;
  var SCR_TOOLS = /^(janna_(search|navigate|open|fill_rfq|fill_contact|fill_registration|submit_form)|bassem_(open_item|screen|open_opportunity|start_deal|open_guide|update_deal|draft_email))$/;
  function scrMark(d) {
    var n = String((d && (d.toolName || d.name)) || ""), id = String((d && d.toolCallId) || ""), now = Date.now();
    if (n === "janna_lookup" || n === "platform_item") { if (id) { if (++LK0_N > 60) { LK0 = {}; LK0_N = 1; } LK0[id] = now; } return; }
    if (SCR_TOOLS.test(n)) SCR.t = now;
  }
  /* the persona started a screen tool with this lookup / item (the same step) or after it: the screen is the persona's */
  function scrMoved(d, now) { var t0 = LK0[String((d && d.toolCallId) || "")] || now - 4000; return SCR.t > 0 && SCR.t >= t0 - 50; }
  function mirror(name, a) { MIR = 1; try { run(name, a, { mirror: 1 }); } finally { MIR = 0; } }
  function lookupDone(d) {
    if (String(d.toolName || "") !== "janna_lookup" || !frame) return;
    var r = resJson(d.result), now = Date.now(), sec, q, s, ok;
    if (!r || !(+r.count > 0) || !r.results || !r.results.length) return;
    sec = r.section === "cities" ? "cities" : LK_SEC[r.section] || ""; q = String(r.query || "").slice(0, 120);
    ok = sec === "cities" || (!!sec && !!q && !(sec === "tenders" && r.market && r.market !== "local"));
    /* the persona put it on the screen in the same step: no second load; remembered, so a later janna_search for it is skipped while the
       screen still shows it (lookupShown reads the screen) */
    if (scrMoved(d, now)) { if (ok && sec !== "cities") LKS = { k: sec + "|" + norm(q), t: now, ok: 1 }; return; }
    if (!ok || now - MV0 < 2500 || screenWork()) return;
    MV0 = now;
    if (sec === "cities") { LKS = { k: "cities", t: now, ok: 1 }; mirror("janna_navigate", { page: "cities" }); return; }
    LKS = { k: sec + "|" + norm(q), t: now, ok: 0 }; s = { section: sec, query: q }; if (r.governorate) s.governorate = String(r.governorate);
    mirror("janna_search", s);
  }
  /* is this search the one on the screen from a lookup (the last 20 s)? While the mirror's page loads (ok 0, ≤ 10 s) yes; then only while
     the screen really shows that section with these words in its search box (review F2: the screen may have moved since — another tool,
     JANNA_LIVE.show, a tap inside it) */
  function lookupShown(a) {
    a = a || {}; var sec = LK_SEC[a.section] || a.section, now = Date.now();
    if (!LKS.k || now - LKS.t >= 20000 || LKS.k !== sec + "|" + norm(a.query)) return false;
    return LKS.ok ? frameHas(sec, a.query) : now - LKS.t < 10000;
  }
  /* the screen shows section sec's page with q in its search box — the same normalisation as the key (norm: a leading «ال» too);
     data/bassem-live-tools.js boxHas compares the same way */
  function frameHas(sec, q) {
    var f = SEARCH[sec], w = null, b = null;
    try { w = frame && frame.contentWindow; if (f && w && pageKey(w) === sec) b = w.document.querySelector(f[0]); } catch (e) { b = null; }
    return !!b && norm(b.value).indexOf(norm(q)) > -1;
  }
  function itemShow(d) {
    if (String(d.toolName || "") !== "platform_item" || !frame) return;
    var r = resJson(d.result), now = Date.now(), u = String((r && r.found === true && !r.ambiguous && r.open_url) || ""), i = u.indexOf("/", 8), h = i > 0 ? u.slice(0, i).toLowerCase() : "";
    if (!(h === "https://madeinegyptgate.com" || h === "https://www.madeinegyptgate.com") || u.length <= i + 1) return;
    if (scrMoved(d, now) || now - MV0 < 2500 || screenWork()) return; /* the persona's own tool shows it; one result in 2.5 s (F1) */
    MV0 = now; go(u.slice(i));
  }
  /* work a navigation would lose, for the page's OWN moves above: the deal room open, or a text field of a real form (the RFQ, contact,
     registration and deal forms) that differs from its page value. A list's filters and its script-filled selects are no work (screenBusy
     counts every select whose options a script filled, so it is true on most list pages) */
  function screenWork() {
    var d = null, dr, f, i, x, t; try { d = frame && frame.contentDocument; } catch (e) { return false; }
    if (!d || !d.querySelector) return false;
    dr = d.querySelector("#advDr"); if (dr && !dr.hidden) return true;
    f = d.querySelectorAll("form input, form textarea");
    for (i = 0; i < f.length; i++) {
      x = f[i]; t = String(x.type || "").toLowerCase();
      if (/^(hidden|submit|button|reset|search|image|file|checkbox|radio|range|color)$/.test(t) || (x.closest && x.closest("[role=search]"))) continue;
      if (String(x.value || "") !== String(x.defaultValue || "")) return true;
    }
    return false;
  }
  function run(name, a, o) {
    a = a && typeof a === "object" ? a : {};
    if (name === "janna_search" && !(o && (o.mirror || o.force)) && lookupShown(a)) return; /* already on the screen (lookupDone); force: Bassem's watchSearch found it was not */
    /* every tool call is also shown on the holographic workspace (holo.js de-duplicates the same call reported twice) */
    try { if (window.MIGHOLO && MIGHOLO.act) MIGHOLO.act(name, a, { who: /^bassem_/.test(name) ? "bassem" : persona }); } catch (e) {}
    logAct(name, a);
    if (!(o && (o.topic || o.force)) && window.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS.take && MIG_LIVE_TOOLS.take(name, a)) return; /* data/bassem-live-tools.js (a topic ping is not a tool call; force = its own call) */
    if (name === "bassem_recall") return; /* answered by data/bassem-memory.js (client tool, awaitResult) — the screen stays where it is */
    if (/^bassem_/.test(name)) { bassemTool(name, a); return; }
    if (name === "janna_follow") { if (LV && !LV.closed && LV.own && LV.own.janna_follow) return; followTool(a); return; } /* Bassem's SDK call: its awaitResult handler (sdkRun) follows and answers */
    if (name === "janna_track") { trackTool(a); return; }
    if (!frame) return;
    agendaFromTool(name, a);
    if (name === "janna_start_meeting") { meetingTool(a); return; }
    if (name === "janna_schedule_meeting") { scheduleTool(a); return; }
    if (name === "janna_navigate") {
      var p = PAGES[a.page] ? a.page : "home", h = "";
      if (p === "region") h = govCode(a.governorate) ? "#" + govCode(a.governorate) : "";
      if (p === "register" && a.plan) h = "#" + a.plan;
      go(p + ".html" + h); say("➜ " + (NAMES[p] ? NAMES[p][EN ? 1 : 0] : p)); return;
    }
    if (name === "janna_search") {
      var s = SEARCH[a.section] ? a.section : "factories", f = SEARCH[s], lk = o && o.mirror ? LKS : null;
      go(s + ".html", function (d) {
        setVal(d, f[0], a.query);
        if (a.governorate && f[1]) setVal(d, f[1], GOV[govCode(a.governorate)] || a.governorate);
        show(d, f[0]);
        if (lk) lk.ok = 1; /* the mirror's page is on the screen with its words (lookupShown reads the screen from now on) */
      });
      say("🔎 " + (a.query || "")); return;
    }
    if (name === "janna_fill_rfq") {
      /* on a factory / company page the request is addressed to that factory by name (the form shows it and sends target_*) */
      var fc = screenCtx();
      if (fc && /^(factory|company)$/.test(fc.type) && fc.title) { try { sessionStorage.setItem("mig-rfq-to", JSON.stringify({ type: fc.type, id: String(fc.id), name: fc.title, url: fc.url || "" })); } catch (e) {} }
      go("contact.html#rfq-form", function (d) {
        setVal(d, "#r-p", a.product); setVal(d, "#r-q", a.quantity); setVal(d, "#r-c", a.city); setVal(d, "#r-x", a.details);
        setVal(d, "#r-g", GOV[govCode(a.governorate)] || a.governorate); setVal(d, "#r-s", a.sector); if (a.market) setVal(d, "#r-m", a.market);
        setVal(d, "#r-n", a.name); setVal(d, "#r-co", a.company); setVal(d, "#r-e", a.email); setVal(d, "#r-ph", a.phone); show(d, "#rfq-form");
      });
      say(T("📝 بملالك طلب عرض السعر…", "📝 Filling your quote request…")); return;
    }
    if (name === "janna_fill_contact") {
      go("contact.html", function (d) { setVal(d, "#c-n", a.name); setVal(d, "#c-e", a.email); setVal(d, "#c-p", a.phone); setVal(d, "#c-s", a.subject); setVal(d, "#c-m", a.message); show(d, "#msgF"); });
      say(T("✉️ بملالك رسالة التواصل…", "✉️ Filling the contact form…")); return;
    }
    if (name === "janna_book_meeting") {
      /* no human reads a "meeting request" message: the meeting is booked directly (POST /api/meetings) when a day and time are given */
      var pt = String(a.preferred_time || ""), dm = /(\d{4}-\d{2}-\d{2})/.exec(pt), tm = /(\d{1,2}:\d{2})/.exec(pt);
      scheduleTool({ name: a.name, email: a.email, phone: a.phone, company: a.company, topic: a.topic, language: a.language, date: a.date || (dm ? dm[1] : ""), time: a.time || (tm ? tm[1] : "") });
      return;
    }
    if (name === "janna_fill_registration") {
      var plan = /^(profile|basic|premium|partner|strategic)$/.test(a.plan) ? a.plan : "basic";
      var fill = function (d) {
        setVal(d, "#r-name", a.company_name); setVal(d, "#r-mgr", a.manager); setVal(d, "#r-tel", a.phone);
        setVal(d, "#r-emi", GOV[govCode(a.governorate)] || a.governorate); setVal(d, "#r-addr", a.address); setVal(d, "#r-act", a.activity);
        setVal(d, "#r-mail", a.email); setVal(d, "#r-prod", a.products ? String(a.products).split(/[،,]\s*/).join("\n") : "");
        setVal(d, "#o-name", a.owner_name); setVal(d, "#o-mob", a.owner_mobile); setVal(d, "#o-mail", a.owner_email);
        setVal(d, "#r-gcc", a.gcc_countries);
        show(d, "#form");
      };
      var cur = ""; try { cur = frame.contentWindow.location.hash; } catch (e) {}
      if (pageKey(frame.contentWindow) === "register" && cur === "#" + plan) fill(frame.contentDocument); else go("register.html#" + plan, fill);
      say(T("🏭 بسجّلك على الباقة… راجع البيانات", "🏭 Filling your registration… please review")); return;
    }
    if (name === "janna_submit_form") {
      var d, w; try { d = frame.contentDocument; w = frame.contentWindow; } catch (e) { return; }
      var SEL = { contact: "#msgF", rfq: "#rfq-form", factory_rfq: "#rfqForm", offer: "#offer", registration: "#regF" };
      var fm = d.querySelector(SEL[a.form] || "#rfq-form") || d.querySelector("#rfq-form, #msgF, #rfqForm, form#offer");
      if (!fm) { say(T("مفيش فورم مفتوح على الشاشة أبعته.", "There is no open form on the screen to send.")); return; }
      /* registration: every step but the last only moves the wizard on; the last one sends the application (kind=signup) and is announced like any other request */
      var last = fm.id === "regF" && !!d.querySelector('.stp.on[data-s="5"]');
      if (fm.id === "regF" && !last) { var nx = d.querySelector("#next"); if (nx) nx.click(); say(T("➡️ الخطوة الجاية في التسجيل — راجع البيانات", "➡️ Next registration step — please review")); return; }
      var done = false, to = 0;
      var fin = function (msg, ok) { if (done) return; done = true; clearTimeout(to); try { w.removeEventListener("mig:inquiry", h); } catch (e) {} w.__migJannaSubmit = 0; say(msg); if (ok) { try { window.dispatchEvent(new CustomEvent("mig:agent-action", { detail: { tool: "janna_submit_form", ok: true } })); } catch (e) {} } };
      var h = function (e) {
        var x = (e && e.detail) || {};
        if (x.ok && x.ref) fin("✅ " + T("اتبعت برقم ", "Sent — reference ") + x.ref + (x.routed ? T(" لـ" + x.routed + " مصنع مسجّل", " to " + x.routed + " registered factories") : (/^(rfq|basket)$/.test(x.kind) ? T(" — لسه مفيش مصنع مسجّل مطابق، والطلب مفتوح", " — no matching registered factory yet; the request stays open") : "")), true);
        else fin("⚠️ " + (x.code === "offline" ? T("مااتبعتش: سيرفر المنصة مش متاح دلوقتي.", "Not sent: the platform's server is not reachable right now.") : T("مااتبعتش: ", "Not sent: ") + (x.error || x.code || "")), false);
      };
      w.addEventListener("mig:inquiry", h); w.__migJannaSubmit = 1;
      say(T("⏳ ببعت الطلب… مستنية رد المنصة", "⏳ Sending… waiting for the platform's answer"));
      var sb = last ? d.querySelector("#next") : fm.querySelector('[type="submit"]');
      if (sb && sb.click) sb.click(); else if (fm.requestSubmit) fm.requestSubmit(); else fm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      /* a form that stopped on its own validation shows the reason; no answer at all is never reported as sent */
      setTimeout(function () { if (done) return; var er = d.querySelector(".ferr:not([hidden]), #rfqErr:not([hidden]), #o-err, #dErr, #regF #err"); if (er && er.textContent.trim()) fin("✍️ " + er.textContent.trim(), false); }, 1200);
      to = setTimeout(function () { fin(T("⚠️ لسه مفيش رد من المنصة — الطلب مااتأكدش.", "⚠️ No answer from the platform yet — the request is not confirmed."), false); }, 25000);
      return;
    }
  }

  /* ---------- action layer helpers ---------- */
  function screenWin() { try { return frame ? frame.contentWindow : window; } catch (e) { return window; } }
  function screenCtx() { try { return screenWin().MIG_CTX || null; } catch (e) { return null; } }
  function sayAny(msg) { if (toast && ov && !ov.hidden) say(msg); else note(msg); }
  function done(tool) { try { window.dispatchEvent(new CustomEvent("mig:agent-action", { detail: { tool: tool, ok: true } })); } catch (e) {} outcome(tool, "ok"); }
  /* what came of a tool call (consolidation 2026-11-18, critic D): window "mig:tool-outcome" {tool, outcome: ok | refused | failed, text}.
     data/bassem-memory.js keeps it on the call's tool record, so the memory never lists a refused follow or a deal that never opened as an
     open next step. ok also comes from done(); refused = a check here or on the page said no (nothing was done); failed = the platform
     did not do it (an error, offline) */
  function outcome(tool, st, text) { if (!tool || !/^(ok|refused|failed)$/.test(String(st))) return; try { window.dispatchEvent(new CustomEvent("mig:tool-outcome", { detail: { tool: String(tool), outcome: String(st), text: String(text || "").slice(0, 200) } })); } catch (e) {} }
  /* said to the member AND reported as that tool's outcome */
  function refuse(tool, st, msg) { sayAny(msg); outcome(tool, st, msg); }
  /* activity log of what Janna / Bassem did (this tab only; the server keeps the real records) */
  function logAct(name, a) {
    try { var L = JSON.parse(sessionStorage.getItem("mig-agent-log") || "[]"); L.unshift({ at: new Date().toISOString(), who: /^bassem_/.test(name) ? "bassem" : persona, tool: name, q: String(a.query || a.product || a.deal || a.topic || a.ref || "").slice(0, 80) }); sessionStorage.setItem("mig-agent-log", JSON.stringify(L.slice(0, 50))); } catch (e) {}
  }
  function errMsg(e) {
    var A = window.MIGAPI;
    if (e && e.code === "full_login_required") { try { if (A && A.login) setTimeout(function () { A.login({ why: T("سجّل دخولك بكود الإيميل علشان باسم يقدر يظبط ده.", "Sign in with your e-mail code so Bassem can set this.") }); }, 600); } catch (x) {} return T("إنت داخل برابط من الإيميل، وده للرد على الطلبات بس — سجّل دخولك بكود الإيميل الأول.", "You came in through an e-mail link, which only allows answering requests — please sign in with your e-mail code first."); }
    if (e && e.code === "offline") return T("سيرفر المنصة مش متاح دلوقتي.", "The platform's server is not reachable right now."); if (A && A.ui) return A.ui.errText(e); if (e && (e.status === 401 || e.code === "auth")) return T("لازم تسجّل الدخول الأول.", "Please sign in first."); if (e && e.status === 403) return T("الخدمة دي مش متاحة لباقتك الحالية.", "This service is not available on your current plan."); return String((e && (e.error || e.code)) || ""); }
  /* janna_follow → a Promise of the short result Bassem's awaitResult handler gives back (sdkRun); anywhere else it is only said.
     A sector, a governorate, an entity or a search is followed by its words: {kind, label} needs no id (ref_id = the label — worker/src/me.js
     keeps it, digest.js matches new platform items against it); with no kind and nothing specific on the screen, the label becomes a saved
     search (kind "search"). owner's test 2026-11-18: «تابعلي حديد الصلب» (kind sector, no id) was refused and never saved (follows = 0).
     A kind of its own (a sector while a tender page is on the screen) never borrows the screen's id. */
  var FOLLOW_BY_LABEL = /^(sector|search|governorate|region|city|entity|agency)$/;
  function followTool(a) {
    a = a && typeof a === "object" ? a : {};
    var w = screenWin(), c = screenCtx() || {}, A = w.MIGAPI || window.MIGAPI, tool = "janna_follow";
    var lab = String(a.label || a.query || "").replace(/\s+/g, " ").trim().slice(0, 160), k0 = String(a.kind || "").trim().toLowerCase(), id0 = a.id != null ? String(a.id).trim() : "";
    var no = function (st, msg) { refuse(tool, st, "⚠️ " + msg); return Promise.resolve(T("مااتحفظتش: ", "Not saved: ") + msg); };
    /* what this page's follow means (MIG_CTX.follow: false = no alerts here; {kind, id, label} = e.g. a saved search on a company name) */
    if (!k0 && c.follow && typeof c.follow === "object") c = { type: c.follow.kind, id: c.follow.id, title: c.follow.label || c.title, url: c.follow.url || c.url };
    var onScr = c.follow !== false && !!c.type && c.id != null && c.id !== "", kind = k0, id = id0, url = String(a.url || ""), scrItem = false;
    /* a follow by LABEL (a sector / saved search, no item on screen) is Bassem's (his members are signed in); on Janna's call it would open
       a sign-in inside the shared screen, hidden on phones — her follows stay as live: the item on the screen, else she says why (review
       2026-11-19 #3) */
    var byLabel = persona === "bassem";
    if (id) kind = k0 || String(c.type || "");
    else if (k0) { if (onScr && k0 === String(c.type).toLowerCase()) { id = String(c.id); scrItem = true; } else if (byLabel && FOLLOW_BY_LABEL.test(k0) && lab) id = lab; }
    else if (onScr) { kind = String(c.type); id = String(c.id); scrItem = true; }
    else if (lab && byLabel) { kind = "search"; id = lab; }
    if (!kind || !id) {
      if (!byLabel) return no("refused", !k0 && c.follow === false ? T("الصفحة دي لسه مالهاش متابعة وتنبيهات على المنصة — تقدر تتابع قطاع أو جهة أو مناقصة معينة.", "This page has no follow alerts on the platform yet — you can follow a sector, an entity or a specific tender instead.") : T("مفيش حاجة محددة على الشاشة أتابعها — افتح صفحة المصنع أو المناقصة الأول.", "Nothing specific on the screen to follow — open the factory or tender page first."));
      if (!k0 && c.follow === false) return no("refused", T("الصفحة دي لسه مالهاش متابعة وتنبيهات على المنصة — قولّي اسم القطاع أو الكلمة اللي نتابعها.", "This page has no follow alerts on the platform yet — tell me the sector or the words to follow."));
      return no("refused", k0 && !FOLLOW_BY_LABEL.test(k0) ? T("محتاج صفحة الحاجة دي مفتوحة على الشاشة الأول، أو قولّي اسم القطاع أو الكلمة اللي نتابعها.", "I need that item's page open on the screen first, or tell me the sector or the words to follow.") : T("مفيش حاجة محددة أتابعها — قولّي اسم القطاع أو الكلمة اللي نتابعها، أو افتح صفحة المصنع أو المناقصة.", "Nothing specific to follow — tell me the sector or the words to follow, or open the factory or tender page."));
    }
    if (!A || !A.follow) return no("failed", T("خدمة المتابعة مش متاحة في الصفحة دي.", "Following is not available on this page."));
    if (scrItem && !url) url = c.url || "";
    var label = lab || (scrItem ? String(c.title || "") : ""), what = label || id;
    var p = A.follow(kind, id, label, url).then(function () {
      sayAny("★ " + (A.followSaved ? A.followSaved(kind) : T("اتحفظت في «متابعاتي».", "Saved to “My follows”."))); done(tool);
      return T("اتحفظت في متابعاتي: " + what + ". التنبيه بيوصل لما يظهر جديد حقيقي على المنصة.", "Saved to My follows: " + what + ". The alert comes when something really new appears on the platform.");
    }, function (e) {
      if (e && e.code === "cancelled") { outcome(tool, "refused", "sign-in cancelled"); return T("مااتحفظتش: نافذة تسجيل الدخول اتقفلت من غير دخول.", "Not saved: the sign-in window was closed without signing in."); }
      var m = errMsg(e); refuse(tool, "failed", "⚠️ " + T("مااتحفظتش: ", "Not saved: ") + m); return T("مااتحفظتش: ", "Not saved: ") + m;
    });
    /* the handler answers in time (the sign-in dialog may still be open): what is known now; the real outcome is reported when it comes */
    return new Promise(function (res) { var t = setTimeout(function () { res(T("لسه مااتحفظتش: مستنيين العضو يسجّل دخوله بكود الإيميل علشان المتابعة تتحفظ في حسابه.", "Not saved yet: waiting for the member to sign in with his e-mail code so the follow is saved to his account.")); }, 9000); p.then(function (v) { clearTimeout(t); res(v); }); });
  }
  function trackTool(a) {
    var ref = String(a.ref || "").trim().toUpperCase(), l4 = String(a.last4 || "").replace(/\D/g, "").slice(-4);
    if (!ref) { sayAny(T("محتاجة رقم الطلب علشان أتتبعه.", "I need the request number to track it.")); return; }
    if (!frame) { location.href = withLang(url("track.html#" + encodeURIComponent(ref))); return; }
    go("track.html#" + encodeURIComponent(ref), function (d) { setVal(d, "#tn", ref); if (l4) setVal(d, "#tp", l4); var f = d.querySelector("#tf"); if (f && (l4 || (window.MIGAPI && MIGAPI.token()))) { var b = f.querySelector('[type="submit"]'); if (b) b.click(); } show(d, "#tf"); });
    say("🔎 " + ref);
  }

  /* ---------- Bassem (members' deal advisor): drives advisor.html through its own controls ---------- */
  function waitFor(d, sel, cb, n) { n = n || 0; var el = null; try { el = d.querySelector(sel); } catch (e) {} if (el) { cb(el); return; } if (n > 48) { cb(null); return; } setTimeout(function () { waitFor(d, sel, cb, n + 1); }, 250); }
  function glow(el) { if (!el || !el.style) return; inView(el, "center"); el.style.transition = "box-shadow .3s"; el.style.boxShadow = "0 0 0 3px rgba(233,196,106,.95), 0 0 24px rgba(233,196,106,.6)"; setTimeout(function () { el.style.boxShadow = ""; }, 4500); }
  function doing(msg) { sayAny("🧑‍💼 " + T("باسم بيعمل دلوقتي: ", "Bassem is now: ") + msg); }
  function onAdvisor(name, a, fn) {
    if (frame) { if (pageKey(frame.contentWindow) === "advisor") waitFor(frame.contentDocument, "#advQ", function () { fn(frame.contentDocument, frame.contentWindow); }); else go("advisor.html", function (d, w) { waitFor(d, "#advQ", function () { fn(d, w); }); }); return; }
    if (pageKey(window) === "advisor") { waitFor(document, "#advQ", function () { fn(document, window); }); return; }
    /* hand the command to advisor.html through this tab's own storage: the link carries only a one-time random key, so a link
       written by someone else can never make Bassem act (security QA: «advisor.html#bcmd=<json>» ran tools with no confirmation) */
    var n = ""; try { var rb = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(rb); for (var i = 0; i < rb.length; i++) n += ("0" + rb[i].toString(16)).slice(-2); } catch (e) { n = ""; }
    if (!n || !BCMD_OK[name]) return;
    try { sessionStorage.setItem("mig-bcmd", JSON.stringify({ n: n, t: name, a: a, at: Date.now() })); } catch (e) { return; }
    location.href = withLang(url("advisor.html#bcmd=" + n));
  }
  /* the only Bassem tools that may be handed over to advisor.html (they drive its own controls; nothing here sends without the page) */
  var BCMD_OK = { bassem_open_opportunity: 1, bassem_start_deal: 1, bassem_draft_email: 1, bassem_send_email: 1, bassem_update_deal: 1, bassem_open_guide: 1 };
  function setIn(d, sel, v, ev) { var el = d.querySelector(sel); if (!el || v == null || v === "") return null; el.value = String(v); (ev || ["input", "change"]).forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); }); glow(el); return el; }
  /* the advisor page filters 250 ms after an input and rebuilds its list with #advQ (advisor.part.py renderBrief): the cards are read once the
     new #advQ is there (650 ms at most, as before) — never earlier, or the first UNFILTERED card would be opened (speed review 2026-11-20 #8) */
  function advSearch(d, q, cb) { var i = d.querySelector("#advQ"), t0 = Date.now(); if (i && q != null) { i.value = String(q); if (i.oninput) i.oninput(); else i.dispatchEvent(new Event("input", { bubbles: true })); glow(i); } (function wait() { var i2 = d.querySelector("#advQ"); if ((i && i2 && i2 !== i) || Date.now() - t0 >= 650) { cb(d.querySelector(".opc")); return; } setTimeout(wait, 50); })(); }
  function dealText(d) { var dr = d.querySelector("#advDr"); if (!dr) return ""; var t = dr.textContent || ""; [].forEach.call(dr.querySelectorAll("input,textarea"), function (x) { t += " " + (x.value || ""); }); return t.toLowerCase(); }
  /* the e-mail addresses written in the open deal (its text and its fields), lower case, each once */
  function dealMails(d) {
    var m = (d && d.querySelector ? dealText(d) : "").match(/[^\s@<>()"',;:«»\[\]]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g) || [], out = [];
    for (var i = 0; i < m.length; i++) { var x = m[i].replace(/^[.]+|[.]+$/g, ""); if (out.indexOf(x) < 0) out.push(x); }
    return out;
  }
  /* the deal room / advisor page the call works on: the screen's document, or this page when it is advisor.html itself */
  function advDoc() { try { if (frame && frame.contentDocument) return frame.contentDocument; } catch (e) { return null; } return pageKey(window) === "advisor" ? document : null; }
  /* may this address be a recipient? one of the open deal's own addresses, one in the data the call's tools returned, his own typing, or
     one he dictated (spoken forms too) — the hologram shows a recipient only then (holo.js); never a guessed address */
  function knownEmail(v) { var e = toArg(v); return !!(e.addr && mailSource(e.addr)); }
  /* the shared screen holds work that a navigation would lose: the deal room open, or a form field that differs from its page value
     (a draft Bassem typed, the member's own typing); search boxes do not count */
  function screenBusy() {
    var d = null; try { d = frame && frame.contentDocument; } catch (e) { return false; }
    if (!d || !d.querySelector) return false;
    var dr = d.querySelector("#advDr"); if (dr && !dr.hidden) return true;
    var f = d.querySelectorAll("input,textarea,select");
    for (var i = 0; i < f.length; i++) {
      var x = f[i], t = String(x.type || "").toLowerCase();
      if (/^(hidden|submit|button|reset|search|image|file)$/.test(t) || x.id === "advQ" || (x.closest && x.closest("[role=search]"))) continue;
      if (x.tagName === "SELECT") { for (var j = 0; j < x.options.length; j++) if (x.options[j].selected !== x.options[j].defaultSelected) return true; continue; }
      if (t === "checkbox" || t === "radio") { if (x.checked !== x.defaultChecked) return true; continue; }
      if (String(x.value || "") !== String(x.defaultValue || "")) return true;
    }
    return false;
  }
  /* open a deal: by id, by words of its title / buyer, the one already open, or the first in the pipeline */
  function openDealIn(d, deal, cb) {
    var dr = d.querySelector("#advDr"), b = null, q = String(deal || "").trim().toLowerCase();
    if (q) { try { b = d.querySelector('[data-open="' + q.replace(/"/g, "") + '"]'); } catch (e) {} }
    if (!b && q) { [].some.call(d.querySelectorAll(".dc"), function (c) { if ((c.textContent || "").toLowerCase().indexOf(q) > -1) { b = c.querySelector("[data-open]"); return true; } return false; }); }
    if (!b && !q && dr && !dr.hidden) { cb(true); return; }
    if (!b && !q) b = d.querySelector(".dc [data-open]") || d.querySelector("[data-open]");
    if (!b) { cb(false); return; }
    b.click(); waitFor(d, "#advDr .pn", function (el) { cb(!!el); });
  }
  function tab(d, t, sel, cb) { var b = d.querySelector('#advDr [data-dtab="' + t + '"]'); if (b && !b.classList.contains("on")) b.click(); waitFor(d, sel, cb); }
  var EMRE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
  /* POST to the platform API with the platform session (localStorage "mig-tok") — the same contract as data/mig-api.js, used only where
     that shared client is not on the page: JSON or nothing (a static host answers HTML → {code:"offline"}), never a guessed success */
  function post(path, body) {
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej({ code: "offline" }); return; }
      var tk = "", fin = false; try { tk = localStorage.getItem("mig-tok") || ""; } catch (e) {}
      var h = { "Content-Type": "application/json", Accept: "application/json" }; if (tk) h.Authorization = "Bearer " + tk;
      var tm = setTimeout(function () { if (!fin) { fin = true; rej({ code: "offline" }); } }, 15000);
      fetch(String(window.MIG_API_BASE || "/api").replace(/\/+$/, "") + path, { method: "POST", headers: h, body: JSON.stringify(body || {}), credentials: "same-origin" }).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "offline" };
        return r.json().then(function (j) { if (!r.ok) throw { code: (j && j.code) || "http_" + r.status, error: (j && j.error) || "HTTP " + r.status, status: r.status }; return j; });
      }).then(function (j) { if (fin) return; fin = true; clearTimeout(tm); res(j); }, function (e) { if (fin) return; fin = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline" }); });
    });
  }
  /* bassem_save_profile → data/bassem-intel-view.js saveProfile() → a Promise of the short result Bassem is given (awaitResult):
     «اتسجّل: …» only after the platform answered that it saved, else «ماتسجّلش: <why>» / «مش متأكد إنه اتسجّل …» */
  function profileTool(a) {
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = {}; } }
    a = a && typeof a === "object" ? a : {};
    var off = T("ماتسجّلش: حفظ بيانات المصنع مش متاح في الصفحة دي دلوقتي.", "Not saved: saving the factory profile is not available on this page right now.");
    return new Promise(function (res0) {
      /* critic D: the save's outcome («اتسجّل» = ok, «ماتسجّلش» = failed, «مش متأكد» = unknown) */
      var n = 0, res = function (t) { t = String(t == null ? "" : t); outcome("bassem_save_profile", /^(اتسج|Saved|Already saved)/.test(t) ? "ok" : /^(ماتسج|Not saved)/.test(t) ? "failed" : "", t); res0(t); };
      (function wait() {
        var V = window.BASSEM_VIEW;
        if (V && V.saveProfile) { var p = null; try { p = V.saveProfile(a); } catch (e) { p = null; } if (p && p.then) p.then(res, function () { res(off); }); else res(off); return; }
        if (n++ < 12) { setTimeout(wait, 250); return; } /* the view script loads with the call: give it 3 s */
        sayAny(T("حفظ بيانات المصنع مش متاح دلوقتي — ماتسجّلش حاجة.", "Saving your factory profile is not available right now — nothing was saved.")); res(off);
      })();
    });
  }
  /* ---------- e-mails from the call (owner 2026-11-19: «كل ما اديله اوردر انه يبعت ايميل بيقولي معرفش» · «بقوله اكتب عنوان الايميل بيقولي
     مش هعرف اكتبه» · «باسم كتب الايميل بس مش بيقراه الاول كان بيقراه») ----------
     bassem_draft_email puts the e-mail ON THE SCREEN: the deal room of an open deal, else the e-mail draft («مسودة إيميل», below) — to /
     subject / body, left to right for a text that is not Arabic, scrollable, editable («✏️ عدّل»), «📋 انسخ», minimise / ✕. In the SDK call
     (awaitResult, sdkRun) the tool ANSWERS Bassem with what is on the screen: the recipient and where it came from, the language, and
     what to do now — tell the member in 2-3 Egyptian sentences what the e-mail says, then «تحب أبعته؟» (the body is read out in full
     only when he asks). bassem_send_email — and the draft's «📤 ابعت من المنصة» — sends it FROM THE PLATFORM: an open deal through its
     deal room's own button, else POST /api/advisor/send, which starts or reuses the deal of the opportunity the e-mail is about (an
     Information Center notice too), so the reply is tracked; the Worker keeps every safeguard of the deal room (limits, new recipients,
     opt-outs, Reply-To, footer, unsubscribe, audit). Bassem is told «اتبعت» ONLY when the platform answered sent; every refusal comes
     back as words he can act on (no address → «أبعته لمين؟», the buyer's country, a limit, the plan …). «📧 من بريدي» still opens the
     member's own mail app with the draft.
     The recipient («إلى») is never a guess: an address in the data the call's tools returned (bassem_intel / platform_item / janna_lookup
     results, a tender document's text) or in the open deal is filled in; one the member DICTATED (spoken forms: «info at x dot com», «آت»,
     «دوت», «أندرسكور») is filled in and shown letter by letter, and goes out only once he heard / saw it (he spoke again after it was
     shown, or tapped ✓); his own typing is his; anything else Bassem passes is only offered as a one-tap suggestion. */

  /* @mail-pure-begin — no DOM and no state of the call (only T): worker/test/bassem-email.test.mjs runs this block on its own */
  /* @lang-pure-begin — the languages a person may SPEAK in a live call (the 🌐 switch, «🌐 the language the person speaks» below):
     the codes Anam's own speech-to-text takes (docs personas/voices/multilingual: 57 + the beta bn yue gu ha ln mt oc tg te; "yue" has 3
     letters) as [code, native name, Arabic name (the one «بال» takes: بالفرنساوي), English name]. No DOM and no state of the call:
     functions/_tests/call-lang.test.mjs runs this block on its own (inside @mail-pure: langName below reads it) */
  var CALL_LANGS = [["ar", "العربية", "عربي", "Arabic"], ["en", "English", "إنجليزي", "English"], ["af", "Afrikaans", "أفريكانز", "Afrikaans"],
    ["hy", "Հայերեն", "أرمني", "Armenian"], ["az", "Azərbaycanca", "أذربيجاني", "Azerbaijani"], ["be", "Беларуская", "بيلاروسي", "Belarusian"],
    ["bn", "বাংলা", "بنغالي", "Bengali"], ["bs", "Bosanski", "بوسني", "Bosnian"], ["bg", "Български", "بلغاري", "Bulgarian"],
    ["yue", "粵語", "كانتوني", "Cantonese"], ["ca", "Català", "كتالوني", "Catalan"], ["zh", "中文", "صيني", "Chinese"],
    ["hr", "Hrvatski", "كرواتي", "Croatian"], ["cs", "Čeština", "تشيكي", "Czech"], ["da", "Dansk", "دنماركي", "Danish"],
    ["nl", "Nederlands", "هولندي", "Dutch"], ["et", "Eesti", "إستوني", "Estonian"], ["fi", "Suomi", "فنلندي", "Finnish"],
    ["fr", "Français", "فرنساوي", "French"], ["gl", "Galego", "جاليكي", "Galician"], ["de", "Deutsch", "ألماني", "German"],
    ["el", "Ελληνικά", "يوناني", "Greek"], ["gu", "ગુજરાતી", "جوجاراتي", "Gujarati"], ["ha", "Hausa", "هوسا", "Hausa"],
    ["he", "עברית", "عبري", "Hebrew"], ["hi", "हिन्दी", "هندي", "Hindi"], ["hu", "Magyar", "مجري", "Hungarian"],
    ["is", "Íslenska", "آيسلندي", "Icelandic"], ["id", "Bahasa Indonesia", "إندونيسي", "Indonesian"], ["it", "Italiano", "إيطالي", "Italian"],
    ["ja", "日本語", "ياباني", "Japanese"], ["kn", "ಕನ್ನಡ", "كانادا", "Kannada"], ["kk", "Қазақ тілі", "كازاخي", "Kazakh"],
    ["ko", "한국어", "كوري", "Korean"], ["lv", "Latviešu", "لاتفي", "Latvian"], ["ln", "Lingála", "لينجالا", "Lingala"],
    ["lt", "Lietuvių", "ليتواني", "Lithuanian"], ["mk", "Македонски", "مقدوني", "Macedonian"], ["ms", "Bahasa Melayu", "ملايو", "Malay"],
    ["mt", "Malti", "مالطي", "Maltese"], ["mi", "Māori", "ماوري", "Maori"], ["mr", "मराठी", "ماراثي", "Marathi"],
    ["ne", "नेपाली", "نيبالي", "Nepali"], ["no", "Norsk", "نرويجي", "Norwegian"], ["oc", "Occitan", "أوكسيتاني", "Occitan"],
    ["fa", "فارسی", "فارسي", "Persian"], ["pl", "Polski", "بولندي", "Polish"], ["pt", "Português", "برتغالي", "Portuguese"],
    ["ro", "Română", "روماني", "Romanian"], ["ru", "Русский", "روسي", "Russian"], ["sr", "Српски", "صربي", "Serbian"],
    ["sk", "Slovenčina", "سلوفاكي", "Slovak"], ["sl", "Slovenščina", "سلوفيني", "Slovenian"], ["es", "Español", "إسباني", "Spanish"],
    ["sw", "Kiswahili", "سواحيلي", "Swahili"], ["sv", "Svenska", "سويدي", "Swedish"], ["tl", "Tagalog", "تاجالوج", "Tagalog"],
    ["tg", "Тоҷикӣ", "طاجيكي", "Tajik"], ["ta", "தமிழ்", "تاميلي", "Tamil"], ["te", "తెలుగు", "تيلوجو", "Telugu"],
    ["th", "ไทย", "تايلاندي", "Thai"], ["tr", "Türkçe", "تركي", "Turkish"], ["uk", "Українська", "أوكراني", "Ukrainian"],
    ["ur", "اردو", "أردو", "Urdu"], ["vi", "Tiếng Việt", "فيتنامي", "Vietnamese"], ["cy", "Cymraeg", "ويلزي", "Welsh"]];
  function langRow(c) { c = String(c == null ? "" : c).toLowerCase(); for (var i = 0; i < CALL_LANGS.length; i++) if (CALL_LANGS[i][0] === c) return CALL_LANGS[i]; return null; }
  /* the line the persona's LLM gets (addContext, no reply of its own) when the person chose what she / he hears; greet: the call starts with it */
  function langNote(code, greet) {
    var r = langRow(code) || langRow("ar"), nm = r[3], ar = r[0] === "ar";
    return "LANGUAGE: " + r[0] + " (" + nm + "). The person tapped 🌐 and chose " + nm + ": their speech now reaches you in " + nm + ". From your next reply "
      + (ar ? "speak Egyptian Arabic exactly as your rules say" : "speak only " + nm + ", natural and correct,") + " until they choose or speak another language."
      + (greet ? " If you greeted them in another language, greet them again in one short sentence in " + (ar ? "Egyptian Arabic" : nm) + "." : "")
      + " Tool arguments stay as your rules say (search words in Arabic or English).";
  }
  /* typed text → a code ONLY for an unmistakable non-Latin, non-Arabic script (2+ letters, more than its Latin ones): kana = ja (before Han),
     Han zh, Hangul ko, Hebrew he, Greek el, Thai th, Armenian hy, Bengali bn, Gujarati gu, Tamil ta, Telugu te, Kannada kn; "menu" for
     Cyrillic or Devanagari (several languages share them); "" for any text with an Arabic letter and for Latin text — Egyptians type English
     and Franco («ana 3ayez») every day, so it never suggests anything there */
  var LANG_SCR = [["ja", /[\u3040-\u30ff]/g], ["zh", /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g], ["ko", /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g],
    ["he", /[\u05d0-\u05ea\u05f0-\u05f2]/g], ["el", /[\u0370-\u03ff\u1f00-\u1fff]/g], ["th", /[\u0e01-\u0e5b]/g], ["hy", /[\u0531-\u0587]/g],
    ["bn", /[\u0980-\u09ff]/g], ["gu", /[\u0a80-\u0aff]/g], ["ta", /[\u0b80-\u0bff]/g], ["te", /[\u0c00-\u0c7f]/g], ["kn", /[\u0c80-\u0cff]/g],
    ["menu", /[\u0400-\u04ff\u0900-\u097f]/g]];
  function scriptLang(text) {
    var s = String(text == null ? "" : text), best = "", bn = 0, i, n, lat;
    if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(s)) return "";
    lat = (s.match(/[a-z\u00c0-\u024f]/gi) || []).length;
    for (i = 0; i < LANG_SCR.length; i++) { n = (s.match(LANG_SCR[i][1]) || []).length; if (n > bn) { bn = n; best = LANG_SCR[i][0]; } }
    if (bn < 2 || lat >= bn) return "";
    return best === "zh" && /[\u3040-\u30ff]/.test(s) ? "ja" : best; /* kana with Han = Japanese */
  }
  /* @lang-pure-end */
  var MAILRX = /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
  function mailOk(s) { s = String(s == null ? "" : s); return s.length <= 254 && MAILRX.test(s) && s.indexOf("..") < 0 && !/^\.|\.@/.test(s); }
  /* the spoken words of an address → its characters (Latin and Egyptian forms; letters said one by one are joined) */
  /* the 🌐 languages too: arobase / arroba / chiocciola / Klammeraffe / собака / 艾特 / ایٹ · punto / ponto / Punkt / nokta / точка / 点 / 點 /
     ڈاٹ · Unterstrich / 下划线 / «tiret bas» «guion bajo» «trattino basso» «alt çizgi» · tiret / guion / trattino / Bindestrich / дефис —
     never Turkish «et» (French «et» = «and»), Turkish «tire» (English «tire»: «egypt tire dot com») nor «دات» (an Egyptian «ذات» can be heard so) */
  var MSYM = [[/^(?:at|@|آت|ات|أت|إت|ايت|آيت|arobase|arroba|chiocciola|klammeraffe|собака|艾特|ایٹ)$/, "@"], [/^(?:dot|\.|point|period|دوت|نقطة|نقطه|بوينت|punto|ponto|punkt|nokta|точка|点|點|ڈاٹ)$/, "."],
    [/^(?:underscore|_|اندرسكور|أندرسكور|إندرسكور|شرطةسفلية|unterstrich|下划线|tiretbas|guionbajo|trattinobasso|altçizgi)$/, "_"], [/^(?:dash|hyphen|minus|-|داش|هايفن|شرطة|شرطه|tiret|guion|guión|trattino|bindestrich|дефис)$/, "-"]];
  var MTLD = { "كوم": "com", "نت": "net", "اورج": "org", "أورج": "org", "جوف": "gov" };
  var MSAY = { "@": ["آت", "at"], ".": ["دوت", "dot"], "_": ["أندرسكور", "underscore"], "-": ["داش", "dash"] };
  function mailTokens(text) {
    var s = String(text == null ? "" : text).toLowerCase()
      .replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 1632); }).replace(/[\u06f0-\u06f9]/g, function (c) { return String(c.charCodeAt(0) - 1776); })
      .replace(/[\u064b-\u0652\u0640]/g, "").replace(/\uff20/g, "@").replace(/\bat\s+sign\b/g, "at").replace(/\bunder\s+score\b/g, "underscore")
      .replace(/[اأإ]ندر\s+سكور/g, "اندرسكور").replace(/شرط[ةه]\s+(?:سفلي[ةه]|تحتي[ةه])/g, "شرطةسفلية")
      .replace(/(^|\s)(?:tiret\s+bas|gui[oó]n\s+bajo|trattino\s+basso|alt\s+çizgi)(?=\s|$)/g, function (m, a) { return a + m.slice(a.length).replace(/\s+/g, "").replace("ó", "o"); })
      .replace(/\s*(艾特|点|點)\s*/g, " $1 ");
    var raw = s.split(/[\s,،;؛]+/), out = [], i, k, w, sym;
    for (i = 0; i < raw.length; i++) {
      w = raw[i].replace(/^[«»"'“”‘’()\[\]<>{}:!?؟]+/, "").replace(/[«»"'“”‘’()\[\]<>{}:!?؟]+$/, "");
      if (!w) continue;
      sym = "";
      for (k = 0; k < MSYM.length; k++) if (MSYM[k][0].test(w)) { sym = MSYM[k][1]; break; }
      if (sym) out.push({ k: "s", v: sym, w: w });
      else if (MTLD.hasOwnProperty(w)) out.push({ k: "w", v: MTLD[w] });
      else if (/^[a-z0-9._%+@-]+$/.test(w)) out.push({ k: "w", v: w });
      else out.push({ k: "x", v: w });
    }
    return out;
  }
  /* every address written or spoken in a text, as «إلى» takes it (lower case, each once): the word(s) before «at» (or the letters spelled
     one by one) @ the words up to the first «dot» joined («lamu west» → lamuwest), then one label after each dot */
  function spokenMails(text) {
    var tk = mailTokens(text), found = [], i, j, t, u, local, dom, parts, need, first, cand;
    for (i = 0; i < tk.length; i++) {
      t = tk[i]; local = null; dom = "";
      if (t.k === "w" && t.v.indexOf("@") > 0 && t.v.indexOf("@") === t.v.lastIndexOf("@")) { local = t.v.slice(0, t.v.indexOf("@")); dom = t.v.slice(t.v.indexOf("@") + 1); }
      else if (t.k === "s" && t.v === "@") {
        parts = []; j = i - 1;
        if (j >= 0 && tk[j].k === "w" && tk[j].v.length === 1) {
          while (j >= 0 && ((tk[j].k === "w" && tk[j].v.length === 1) || (tk[j].k === "s" && tk[j].v !== "@"))) { parts.unshift(tk[j].v); j--; }
        } else {
          while (j >= 0 && tk[j].k === "w" && tk[j].v.indexOf("@") < 0) {
            parts.unshift(tk[j].v); j--;
            if (j >= 1 && tk[j].k === "s" && tk[j].v !== "@" && tk[j - 1].k === "w") { parts.unshift(tk[j].v); j--; } else break;
          }
        }
        local = parts.join("");
      }
      if (local === null) continue;
      need = !dom || /[.\-]$/.test(dom); first = dom.indexOf(".") < 0;
      for (j = i + 1; j < tk.length; j++) {
        u = tk[j];
        if (u.k === "s" && (u.v === "." || u.v === "-")) { if (need) break; dom += u.v; need = true; if (u.v === ".") first = false; continue; }
        if (u.k !== "w" || u.v.indexOf("@") > -1) break;
        if (need) {
          dom += u.v; need = false; if (u.v.indexOf(".") > -1) first = false;
          if (u.v.length === 1) while (j + 1 < tk.length && tk[j + 1].k === "w" && tk[j + 1].v.length === 1) { j++; dom += tk[j].v; }
          continue;
        }
        if (first) { dom += u.v; continue; }
        break;
      }
      cand = (local + "@" + dom).replace(/[.\-]+$/, "").replace(/^[.\-_]+/, "");
      if (mailOk(cand) && found.indexOf(cand) < 0) found.push(cand);
    }
    return found;
  }
  function spokenMail(text) { var m = spokenMails(text); return m.length ? m[0] : ""; }
  /* «i n f o (آت) l a m u … (دوت) k e»: what the screen spells and Bassem can read back */
  function mailSpell(addr) { var s = String(addr || ""), out = [], c, i; for (i = 0; i < s.length; i++) { c = s.charAt(i); out.push(MSAY[c] ? "(" + T(MSAY[c][0], MSAY[c][1]) + ")" : c); } return out.join(" "); }
  /* Bassem's `to` → {addr} a valid address (spoken forms parsed) · {bad} words that are no address · {} nothing passed */
  function toArg(v) {
    var raw = String(v == null ? "" : v).replace(/^\s+|\s+$/g, ""), l = raw.toLowerCase().replace(/^mailto:/, ""), s;
    if (!raw) return {};
    if (mailOk(l)) return { addr: l, raw: raw };
    s = spokenMail(raw);
    return s ? { addr: s, raw: raw, spoken: true } : { bad: raw.slice(0, 80), raw: raw };
  }
  /* did the member say an address in these words of his? this one exactly; or (speech-to-text may have garbled it or written it in Arabic
     letters — the screen then spells it for him to confirm) its letters «local @ domain» in that order, or an utterance shaped like an
     address: a word, «at» / آت / «@», then «dot» / دوت / نقطة / «.» followed by a word. Ordinary words are no dictation (review 2026-11-19:
     «look at this point» or «the procurement office of Lamu West» made ANY guessed address «said»): «point» / «period» count only in the
     exact parse, and the letters of the two parts only around an «at» */
  function mailHeard(addr, texts) {
    addr = String(addr || "").toLowerCase(); if (!mailOk(addr)) return false;
    var p = addr.split("@"), loc = p[0].replace(/[^a-z0-9]/g, ""), dom = p[1].split(".")[0].replace(/[^a-z0-9]/g, ""), i, j, t, tk, x, at, dot, flat;
    for (i = 0; i < (texts || []).length; i++) {
      t = String(texts[i] || ""); if (spokenMails(t).indexOf(addr) > -1) return true;
      tk = mailTokens(t); at = -1; dot = false; flat = "";
      for (j = 0; j < tk.length; j++) {
        x = tk[j];
        if (x.k === "s" && x.v === "@") { flat += "@"; if (at < 0 && j > 0) at = j; continue; }
        if (x.k === "w") { flat += x.v.replace(/[^a-z0-9@]/g, ""); if (at < 0 && x.v.indexOf("@") > 0) { at = j; continue; } }
        if (at > -1 && ((x.k === "s" && x.v === "." && !/^(?:point|period)$/.test(x.w || "") && j + 1 < tk.length && tk[j + 1].k !== "s") || (x.k === "w" && /[a-z0-9]\.[a-z]{2,}/.test(x.v)))) dot = true;
      }
      if (loc.length > 1 && dom.length > 1 && flat.indexOf(loc + "@" + dom) > -1) return true;
      if (at > -1 && dot) return true;
    }
    return false;
  }
  /* the language an e-mail is written in: Swahili is told apart (a buyer's local language is never the default — owner 2026-11-19: a
     Kenyan government buyer got an e-mail in Swahili), Arabic by its letters, else the language Bassem named, else English */
  var SW_W = " kwa katika ya na wa za ni hii huu kutoka pia sisi yetu wenu tafadhali asante habari ndugu mpendwa kuhusu ugavi shule samani kampuni bidhaa ombi zabuni kwamba tunaweza tuna kama hizi wetu yako ";
  function mailLang(text, given) {
    var s = String(text || ""), w = s.toLowerCase().match(/[a-z]+/g) || [], seen = {}, n = 0, i, ar, la, g;
    for (i = 0; i < w.length; i++) if (!seen[w[i]] && SW_W.indexOf(" " + w[i] + " ") > -1) { seen[w[i]] = 1; n++; }
    if (n >= 5) return "sw";
    ar = (s.match(/[\u0600-\u06ff]/g) || []).length; la = (s.match(/[a-z]/gi) || []).length;
    if (ar > la) return "ar";
    g = String(given || "").toLowerCase().slice(0, 2);
    return /^[a-z]{2}$/.test(g) && g !== "ar" ? g : la ? "en" : "";
  }
  /* the language(s) a buyer in that market does business in (worker-intel market codes): Arabic for Egypt and the Arab countries, French
     (or Arabic) for the Maghreb, French for francophone Africa, English for the rest of Africa, Asia, Europe and the international banks */
  var BIZ = { ar: " local gulf eg sa ae qa kw om bh jo iq lb ye ps sy sd ly so gcc arab ", arfr: " ma tn dz mr dj km ", fr: " sn ci ml bf ne td bj tg ga cg cd gn bi cf mg ", enfr: " cm rw mu sc ", pt: " ao mz gw cv st " };
  function bizLang(market) {
    var c = " " + String(market || "").toLowerCase().replace(/^(africa|asia):/, "") + " ";
    return BIZ.ar.indexOf(c) > -1 ? ["ar"] : BIZ.arfr.indexOf(c) > -1 ? ["ar", "fr"] : BIZ.fr.indexOf(c) > -1 ? ["fr"] : BIZ.enfr.indexOf(c) > -1 ? ["en", "fr"] : BIZ.pt.indexOf(c) > -1 ? ["pt", "en"] : ["en"];
  }
  /* every 🌐 language (CALL_LANGS; the 11 e-mail languages keep their names: فرنساوي، إسباني …) */
  function langName(l) { var n = langRow(l); return n ? T(n[2], n[3]) : String(l || "").toUpperCase(); }
  /* which opportunity of the call an e-mail is about: the most words of its title / buyer / ref (and original title) in the e-mail; the
     notice on the screen needs one such word, any other two — an e-mail about nothing the tools returned starts a deal of its own */
  var STOPW = " the and for with from our your this that dear sir madam regards supply tender notice request please kind best السادة تحية طيبة وبعد من في على الى إلى عن مع هذا هذه بخصوص ";
  function mwords(s) {
    return String(s || "").toLowerCase().replace(/[\u064b-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .split(/[^a-z0-9\u0621-\u064a]+/).filter(function (w) { return w.length > 2 && STOPW.indexOf(" " + w + " ") < 0; });
  }
  function oppPick(list, screenKey, text) {
    var ws = {}, best = null, bs = 0, i, j, o, sc, w, seen;
    mwords(text).forEach(function (x) { ws[x] = 1; });
    for (i = 0; i < (list || []).length; i++) {
      o = list[i]; sc = 0; w = mwords([o.o.title, o.o.entity, o.o.ref, o.alt || ""].join(" ")); seen = {};
      for (j = 0; j < w.length; j++) if (ws[w[j]] && !seen[w[j]]) { seen[w[j]] = 1; sc++; }
      if (!sc) continue;
      if (screenKey && o.k === screenKey) sc += 1;
      if (sc > bs) { bs = sc; best = o; }
    }
    return bs >= 2 ? best : null;
  }
  /* «ابعتلي»: which opportunities of THIS call the note is about → ≤ 3 refs ("intel:<id>" / "item:<id>") for POST /api/advisor/notify; the
     platform then adds each one's details, links and official file from its own data (worker/src/notify-items.js). Only what the call's
     tools returned (list = OPPC) or the screen shows (screenKey) — never a link or a title from the text. given = Bassem's `ids` (comma-
     separated: a platform id may have spaces, «intl-558/2026/BTB (BE2630001388)» — review F2), kept only when they are one of those; the
     others come back in .unused (an id from an earlier call: Bassem is told to fetch it first — review R2). Else, by the note's words
     (review F1: the boilerplate every entry shares — «دعوة لتقديم العطاءات لتوريد» — and bare numbers name nothing): a word counts only
     when it is in exactly one entry's title / buyer / original title; an entry's own number written whole in the note counts 2, the
     screen's entry 1 more; an entry needs 2, and half of the best one's score or half of its own words (a short title quoted in full beside a
     long one); best first. Else, for a note about nothing named, the screen's one when the member's own last words asked to send */
  var SENDW = /ابعت|ابعث|ابعاد|بعتلي|ايميل|إيميل|واتس|send|e-?mail|whats ?app/i;
  /* the note for a whole-number match: lower case, Arabic-Indic digits as ASCII, one space between words */
  function refText(s) {
    return " " + String(s || "").toLowerCase().replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[\u06f0-\u06f9]/g, function (d) { return String(d.charCodeAt(0) - 0x6f0); }).replace(/\s+/g, " ") + " ";
  }
  /* an entry's number (≥ 4 characters, a list key's «OFF:» dropped) written whole in the note — never inside a longer number («6/2026/2027» is
     not in «16/2026/2027») */
  function refIn(nt, ref) {
    var r = String(ref || "").toLowerCase().replace(/^off:/, "").replace(/^\s+|\s+$/g, ""), at, WCH = /[a-z0-9\u0621-\u064a\/]/;
    if (r.length < 4) return false;
    for (at = nt.indexOf(r); at > -1; at = nt.indexOf(r, at + 1)) if (!WCH.test(nt.charAt(at - 1)) && !WCH.test(nt.charAt(at + r.length))) return true;
    return false;
  }
  function notifyRefs(list, screenKey, text, given, heard) {
    var out = [], unused = [], i, j, k, o, sc, d, w, seen, bag, ws = {}, ids, cand = [], df = {}, bags = [], nt, best;
    list = list || [];
    out.unused = unused;
    function inList(key) { for (var q = 0; q < list.length; q++) if (list[q].k === key) return true; return false; }
    function add(key) { if (key && out.indexOf(key) < 0 && out.length < 3) out.push(key); }
    ids = String(given == null ? "" : given).split(/[,;،]+/);
    for (i = 0; i < ids.length; i++) {
      k = ids[i].replace(/^\s+|\s+$/g, "").replace(/^(?:intel|item):\s*/i, ""); if (!k) continue;
      if (/^[0-9a-z]{11}$/i.test(k) && (inList("intel:" + k.toLowerCase()) || screenKey === "intel:" + k.toLowerCase())) add("intel:" + k.toLowerCase());
      else if (inList("item:" + k) || screenKey === "item:" + k) add("item:" + k);
      else if (unused.length < 3 && unused.indexOf(k.slice(0, 60)) < 0) unused.push(k.slice(0, 60));
    }
    if (out.length) return out;
    mwords(text).forEach(function (x) { ws[x] = 1; });
    nt = refText(text);
    for (i = 0; i < list.length; i++) {
      w = mwords([list[i].o.title, list[i].o.entity, list[i].alt || ""].join(" ")); seen = {}; bag = [];
      for (j = 0; j < w.length; j++) if (!seen[w[j]] && !/^\d+$/.test(w[j])) { seen[w[j]] = 1; bag.push(w[j]); df[w[j]] = (df[w[j]] || 0) + 1; }
      bags.push(bag);
    }
    for (i = 0; i < list.length; i++) {
      o = list[i]; sc = 0; d = 0;
      for (j = 0; j < bags[i].length; j++) { w = bags[i][j]; if (list.length > 1 && df[w] > 1) continue; d++; if (ws[w]) sc++; }
      if (refIn(nt, o.o.ref)) sc += 2;
      if (sc && screenKey && o.k === screenKey) sc += 1;
      if (sc >= 2) cand.push({ k: o.k, s: sc, d: d, i: i });
    }
    cand.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    best = cand.length ? cand[0].s : 0;
    for (i = 0; i < cand.length; i++) if (cand[i].s * 2 >= best || cand[i].s * 2 >= cand[i].d) add(cand[i].k);
    if (!out.length && screenKey && SENDW.test(String(heard || ""))) add(screenKey);
    return out;
  }
  /* the body of POST /api/advisor/send (worker/src/advisor.js sendFromCall) */
  var TOSRC = { data: "opportunity", deal: "deal", doc: "document", said: "dictated", typed: "typed", sent: "repeat" };
  function sendBody(st) {
    var b = { to: String(st.to || ""), subject: String(st.subject || ""), body: String(st.body || ""), via: st.via === "button" ? "button" : "bassem" }, o = st.opp;
    if (st.language) b.language = String(st.language);
    if (TOSRC[st.toSrc]) b.to_source = TOSRC[st.toSrc];
    if (st.dealId) b.deal_id = String(st.dealId);
    else if (o && (o.title || o.ref)) { b.opportunity = {}; ["ref", "title", "entity", "market", "country", "source_url", "closing_date", "kind"].forEach(function (k) { if (o[k] != null && o[k] !== "") b.opportunity[k] = String(o[k]); }); }
    if (st.market) b.market = String(st.market);
    return b;
  }
  /* the platform's answer {status, j} → {ok, screen: what the member reads, bassem: the tool result} — «اتبعت» ONLY on sent:true */
  function sendWords(to, r) {
    var j = (r && r.j) || {}, c = String(j.code || ""), er = String(j.error || ""), d = j.deal || {}, ti = String(d.title || "").slice(0, 80), w, fb;
    if (j.sent === true) return { ok: true,
      screen: "✅ " + T("اتبعت من المنصة لـ ", "Sent from the platform to ") + to + (ti ? T(" — والرد هيتسجّل في صفقة «" + ti + "»", " — the reply is tracked in the deal “" + ti + "”") : ""),
      bassem: T("اتبعت ✓ من المنصة لـ " + to + " باسم شركته" + (ti ? "، واتسجّل في صفقة \"" + ti + "\"" + (j.deal_created ? " اللي اتفتحت دلوقتي" : "") : "") + " علشان الرد يتتابع. قوله إنه اتبعت وإنك هتتابع الرد.",
        "Sent ✓ from the platform to " + to + " in his company's name" + (ti ? ", on the deal \"" + ti + "\"" + (j.deal_created ? " (just started)" : "") : "") + ", so the reply is tracked. Tell him it was sent and that you will follow the reply.") };
    fb = T(" يقدر يبعته من بريده بزرار «من بريدي».", " He can send it from his own mail app with “From my mail”.");
    if (j.message && j.sent === false) { /* kept on the deal, not delivered */
      w = /not configured/i.test(er) ? T("الإرسال من المنصة مش متشغّل دلوقتي، والإيميل اتحفظ مسودة في الصفقة", "sending from the platform is not switched on right now; the e-mail is saved as a draft in the deal")
        : /^member not verified/i.test(er) ? T("حسابه لسه مش متفعّل للإرسال من المنصة، والإيميل اتحفظ مسودة في الصفقة", "his account is not yet enabled for sending from the platform; the e-mail is saved as a draft in the deal")
        : T("مزوّد الإيميل ماقبلوش", "the e-mail provider did not accept it") + (er ? " (" + er.slice(0, 120) + ")" : "");
      return { ok: false, failed: true, code: "not_sent", screen: "⚠️ " + T("مااتبعتش: ", "Not sent: ") + w + "." + fb, bassem: T("مااتبعتش: ", "Not sent: ") + w + T(". قوله كده بصراحة.", ". Tell him so honestly.") + fb };
    }
    if (c === "timeout") return { ok: false, failed: true, code: c, screen: "⏳ " + T("المنصة مارديتش في الوقت — مش متأكد إنه اتبعت. بص على صفقاتك قبل ما تبعته تاني.", "The platform did not answer in time — not sure it was sent. Check your deals before sending it again."),
      bassem: T("مش متأكد إنه اتبعت: المنصة مارديتش في الوقت. قوله كده، وماتبعتوش تاني قبل ما يبص على صفقاته.", "Not sure it was sent: the platform did not answer in time. Tell him so, and do not send it again before he checks his deals.") };
    var M = { /* code → [the member's words AR, EN, what Bassem does next AR, EN] */
      invalid_to: ["عنوان المستلم مش صحيح", "the recipient's address is not valid", "اسأله «أبعته لمين؟» وابعته تاني بالعنوان الصح في to.", "ask him who to send it to and send again with the right address in to."],
      invalid_cc: ["عنوان النسخة مش صحيح", "the Cc address is not valid", "شيل النسخة أو صححها.", "drop or fix the Cc."],
      too_many_recipients: ["المستلمين أكتر من خمسة", "more than five recipients", "خليه مستلم واحد.", "keep one recipient."],
      subject_required: ["الموضوع ناقص", "the subject is missing", "اكتب المسودة تاني بـ bassem_draft_email.", "write the draft again with bassem_draft_email."],
      body_required: ["نص الإيميل ناقص", "the message is missing", "اكتب المسودة تاني بـ bassem_draft_email.", "write the draft again with bassem_draft_email."],
      subject_too_long: ["الموضوع طويل زيادة", "the subject is too long", "اختصره واكتب المسودة تاني.", "shorten it and write the draft again."],
      body_too_long: ["الإيميل طويل زيادة", "the e-mail is too long", "اختصره واكتب المسودة تاني.", "shorten it and write the draft again."],
      market_required: ["محتاج أعرف الجهة دي في أنهي بلد علشان أفتحلها صفقة", "I need the buyer's country to start its deal", "اسأله «الجهة دي في أنهي بلد؟» وابعت تاني بالبلد في market.", "ask him which country the buyer is in and send again with it in market."],
      market_not_in_plan: ["السوق ده مش في باقتك", "this market is not in your plan", "قوله كده من غير ضغط، وإن السوق ده في باقة أعلى.", "tell him so without pressure: that market is in a higher plan."],
      daily_limit: ["وصلت لحد الإيميلات في اليوم" + (j.limit ? " (" + j.limit + ")" : ""), "today's e-mail limit is reached" + (j.limit ? " (" + j.limit + ")" : ""), "قوله إنه يتبعت بكرة، أو يبعته من بريده.", "tell him it can go tomorrow, or from his own mail."],
      new_recipient_limit: ["وصلت لحد العناوين الجديدة في اليوم" + (j.limit ? " (" + j.limit + ")" : ""), "today's limit of new recipients is reached" + (j.limit ? " (" + j.limit + ")" : ""), "قوله إن العنوان ده يتبعتله بكرة، أو يبعته من بريده.", "tell him this address can get it tomorrow, or from his own mail."],
      opted_out: ["المستلم ده طلب مايوصلوش رسايل من شركتك", "this recipient asked not to get e-mails from your company", "ماتبعتلوش تاني.", "do not send to it again."],
      deal_limit: ["صفقاتك وصلت للحد الأقصى", "your deals reached the maximum", "قوله يقفل صفقات قديمة.", "tell him to close old deals."],
      deal_not_found: ["الصفقة دي مش في صفقاتك", "that deal is not in your deals", "ابعته من غير صفقة (deal فاضي).", "send it with no deal (empty deal)."],
      opportunity_required: ["الفرصة مالهاش عنوان", "the opportunity has no title", "ابعته من غير فرصة.", "send it without the opportunity."],
      plan: ["باقتك الحالية مافيهاش الإرسال من المنصة", "your current plan does not include sending from the platform", "قوله كده من غير ضغط.", "tell him so without pressure."],
      full_login_required: ["لازم تسجّل دخولك بكود الإيميل الأول", "you need to sign in with your e-mail code first", "الشاشة بتطلب منه يسجّل دخوله؛ بعدها ابعت تاني.", "the screen asks him to sign in; then send again."],
      offline: ["سيرفر المنصة مش متاح دلوقتي", "the platform's server is not reachable right now", "قوله كده بصراحة.", "tell him so honestly."]
    };
    w = M[c] || (r && r.status === 401 ? ["لازم تسجّل الدخول الأول", "you need to sign in first", "قوله يسجّل دخوله.", "tell him to sign in."] : [er || c || "سبب مش معروف", er || c || "unknown reason", "قوله السبب زي ما هو.", "tell him the reason as it is."]);
    fb = /^(market_required|invalid_to|invalid_cc|too_many_recipients|subject_required|body_required|opted_out|full_login_required)$/.test(c) ? "" : fb;
    return { ok: false, failed: !M[c] || c === "offline", code: c, screen: "⚠️ " + T("مااتبعتش: ", "Not sent: ") + T(w[0], w[1]) + "." + fb, bassem: T("مااتبعتش: " + w[0] + ". " + w[2], "Not sent: " + w[1] + ". " + w[3]) + fb };
  }
  /* @mail-pure-end */

  /* ---------- what the call's tools returned: the opportunities (to start the right deal) and every address in their data ---------- */
  var MAILS = {}, MAILS_N = 0, OPPC = [], HEARD = [], USER_T = 0, TO_PEND = { addr: "", at: 0, ok: false }, MAIL_OWN = /@(?:[a-z0-9-]+\.)*madeinegyptgate\.com$/;
  function resJson(r) {
    for (var n = 0; n < 3 && r != null; n++) {
      if (typeof r === "string") { try { r = JSON.parse(r); } catch (x) { return null; } continue; }
      if (typeof r !== "object") return null;
      if (r.results || r.found != null || r.title || r.id || r.text) return r;
      r = r.result != null ? r.result : r.data != null ? r.data : r.body;
    }
    return null;
  }
  /* every address in the values of a result (its strings one by one — never its JSON text, where «\nprocurement@…» would read «nprocurement@…») */
  function mailsKeep(x, item) {
    var n = 0;
    function scan(s) {
      var m = String(s).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/g) || [];
      for (var i = 0; i < m.length && MAILS_N < 300; i++) {
        var a = m[i].replace(/^[._%+-]+/, "");
        if (!mailOk(a) || MAIL_OWN.test(a)) continue;
        if (!MAILS[a]) { MAILS[a] = { src: "data", at: Date.now(), item: item || "" }; MAILS_N++; } else if (item && !MAILS[a].item) MAILS[a].item = item;
      }
    }
    (function walk(v, depth) {
      if (v == null || depth > 6 || n > 2000) return;
      if (typeof v === "string") { n++; scan(v); return; }
      if (typeof v !== "object") return;
      if (Object.prototype.toString.call(v) === "[object Array]") { for (var i = 0; i < v.length && i < 200; i++) walk(v[i], depth + 1); return; }
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) walk(v[k], depth + 1);
    })(x, 0);
  }
  function oppAdd(k, o) {
    for (var i = 0; i < OPPC.length; i++) if (OPPC[i].k === k) { OPPC.splice(i, 1); break; }
    OPPC.unshift({ k: k, o: o, at: Date.now(), alt: "" }); if (OPPC.length > 40) OPPC.length = 40;
  }
  function itemOpp(name, x) {
    if (!x || typeof x !== "object" || !/^(bassem_intel|platform_item|janna_lookup)$/.test(name)) return null;
    var id = String(x.id == null ? "" : x.id), title = String(x.title || x.title_ar || x.name || "").slice(0, 300);
    if (!id || !title) return null;
    if (name === "bassem_intel") return { k: "intel:" + id, o: { ref: "", title: title, entity: String(x.entity || ""), market: String(x.market || ""), country: String(x.market_name || x.country || ""), source_url: String(x.url || ""), closing_date: String(x.deadline || "").slice(0, 10), kind: String(x.kind || "") } };
    var sec = String(x.section || "");
    if (sec && !/^tenders?$/.test(sec)) return null; /* RFQs, factories, products … are answered through the platform, not by e-mail */
    return { k: "item:" + id, o: { ref: String(x.ref_no || x.ref || id), title: title, entity: String(x.entity || ""), market: String(x.market || "local"), country: String(x.country || ""), source_url: enc(x.documents_url || x.url || x.open_url || ""), closing_date: String(x.deadline || "").slice(0, 10), kind: "gov" } };
  }
  /* a completed tool call (anam-agent:tool-call-completed, both the SDK call and the widget): only what the platform's SERVER tools returned
     — never a client tool's answer (ours quote the address he dictated, which must stay «said», never become «data») */
  var HARVEST = /^(bassem_intel|platform_item|janna_lookup|bassem_web_search|knowledge_lookup)$/;
  function harvest(d) {
    d = d || {}; var name = String(d.toolName || d.name || ""), ty = String(d.toolType || "").toLowerCase(), r, list, it, i, k = "";
    if (!name || ty === "client" || !(HARVEST.test(name) || ty === "server")) return;
    r = resJson(d.result);
    if (!r) { if (d.result != null) mailsKeep(d.result, name === "bassem_intel" ? screenOppKey() : ""); return; }
    list = r.results && r.results.length ? r.results : r.found !== false && (r.id || r.title) ? [r] : [];
    if (name === "janna_lookup" && r.section && !/^tenders?$/.test(String(r.section))) list = [];
    for (i = 0; i < list.length && i < 12; i++) { it = itemOpp(name, list[i]); if (it) { oppAdd(it.k, it.o); mailsKeep(list[i], it.k); if (list.length === 1) k = it.k; } }
    /* a notice's own document (bassem_intel action "doc": its id, or none — then the notice on the screen) gives its addresses to that
       notice; a web search or a knowledge answer gives addresses to no notice (they are «data», never filled in by themselves) */
    if (!k && name === "bassem_intel") k = r.id && /^[0-9a-z]{11}$/.test(String(r.id)) ? "intel:" + r.id : screenOppKey();
    mailsKeep(r, k);
  }
  /* the member's own words (MESSAGE_STREAM_EVENT_RECEIVED role user, message-received): for «did he dictate it?» and «did he speak since?» */
  function heardAdd(id, text) {
    text = String(text || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); if (!text) return;
    var now = Date.now(), i, h;
    for (i = HEARD.length - 1; i >= 0 && i >= HEARD.length - 4; i--) {
      h = HEARD[i];
      if (id) { if (h.id === id) { h.s = h.s.indexOf(text) > -1 ? h.s : text.indexOf(h.s) > -1 ? text : h.s + " " + text; return; } continue; } /* the same utterance, streaming */
      if (now - h.t < 90000 && (h.s.indexOf(text) > -1 || text.indexOf(h.s) > -1)) { if (text.length > h.s.length) h.s = text; return; } /* its copy in the history */
    }
    HEARD.push({ id: id || "", s: text, t: now }); USER_T = now; if (HEARD.length > 14) HEARD.shift();
  }
  function heardTexts() { var out = [], t0 = Date.now() - 20 * 60000; for (var i = 0; i < HEARD.length; i++) if (HEARD[i].t >= t0) out.push(HEARD[i].s); return out; }
  /* the opportunity the shared screen shows: an Information Center notice (/intel/<kind>/<slug>-<id>/) or a platform page (MIG_CTX) */
  function screenOppKey() {
    var w = screenWin(), p = "", c, m; try { p = String(w.location.pathname || ""); } catch (e) { return ""; }
    m = /^\/intel\/(?:en\/)?[a-z_-]+\/[^\/]*-([0-9a-z]{11})\/?$/.exec(p); if (m) return "intel:" + m[1];
    c = screenCtx(); return c && c.id != null && c.id !== "" ? "item:" + c.id : "";
  }
  /* that notice read from its own page when no tool of the call returned it (the JSON-LD the Information Center writes, worker-intel pages.js) */
  function screenOpp() {
    var k = screenOppKey(), d = null, i, ld, j, o, chip; if (!k) return null;
    try { d = frame && frame.contentDocument; } catch (e) { d = null; }
    if (k.indexOf("intel:") === 0 && d && d.querySelectorAll) {
      ld = d.querySelectorAll('script[type="application/ld+json"]');
      for (i = 0; i < ld.length; i++) { try { j = JSON.parse(ld[i].textContent || "{}"); } catch (e) { j = null; } if (j && j.isBasedOn && (j.name || j.headline)) break; j = null; }
    }
    for (i = 0; i < OPPC.length; i++) if (OPPC[i].k === k) { if (j && !OPPC[i].alt) OPPC[i].alt = String((j.about && j.about.name) || ""); return OPPC[i]; }
    if (!d || !d.querySelectorAll) return null;
    if (k.indexOf("intel:") === 0) {
      if (!j) return null;
      chip = d.querySelector(".sx-chips span:nth-child(2)");
      o = { ref: "", title: String(j.name || j.headline || ""), entity: String((j.about && j.about.description) || ""), market: "", country: chip ? String(chip.textContent || "").replace(/[^\u0600-\u06ffA-Za-z' -]/g, "").replace(/^\s+|\s+$/g, "") : "", source_url: String(j.isBasedOn || ""), closing_date: String(j.expires || "").slice(0, 10), kind: "" };
      oppAdd(k, o); OPPC[0].alt = String((j.about && j.about.name) || ""); return OPPC[0];
    }
    var c = screenCtx(); if (!c || !/tender/.test(String(c.type || ""))) return null;
    oppAdd(k, { ref: String(c.id), title: String(c.title || ""), entity: "", market: "local", country: "", source_url: String(c.url || ""), closing_date: "", kind: "gov" }); return OPPC[0];
  }
  function oppMails(k) { var out = []; if (!k) return out; for (var a in MAILS) if (MAILS.hasOwnProperty(a) && MAILS[a].item === k) out.push(a); return out; }
  /* where an address may come from: the tools' data of this call · the open deal · the member's own words — else "" (never filled in) */
  function mailSource(addr) {
    if (!mailOk(addr)) return "";
    if (MAILS[addr]) return MAILS[addr].src;
    var d = advDoc(); if (d && dealMails(d).indexOf(addr) > -1) return "deal";
    if (CMP && CMP.toSrc === "typed" && String(CMP.to.value || "").replace(/^\s+|\s+$/g, "").toLowerCase() === addr) return "typed";
    if (TO_PEND.ok && TO_PEND.addr === addr) return "said";
    return mailHeard(addr, heardTexts()) ? "said" : "";
  }
  /* a dictated address on the screen goes out only once he heard / saw it: he spoke after it was shown, or tapped ✓ */
  function toReady(addr) { return TO_PEND.addr !== addr || TO_PEND.ok || USER_T > TO_PEND.at + 300; }
  /* Bassem sends an e-mail he put on the screen only after the member said something since it appeared (review 2026-11-19): a draft and its
     send in one turn — words in a tool's result, a web page or a tender document telling him to — never e-mail anyone; the 2-3 sentence
     summary and «تحب أبعته؟» come first. The member's own «📤 ابعت» click needs no such check */
  function heardSince(t) { return USER_T > (+t || 0); }
  function askFirstWords() { return T("لسه مااتبعتش: هو ماقالش حاجة من ساعة ما الإيميل ظهر على الشاشة. قوله ملخصه في جملتين أو تلاتة واسأله «تحب أبعته؟»، ولما يقولك ابعته استدعي bassem_send_email تاني.", "Not sent yet: he has not said anything since the e-mail appeared on the screen. Tell him in 2-3 sentences what it says and ask «Shall I send it?»; when he says send it, call bassem_send_email again."); }
  function confirmWords(addr) { return T("لسه مااتبعتش: العنوان اللي قاله اتكتب على الشاشة حرف حرف (" + mailSpell(addr) + "). اطلب منه يبص عليه ويقولك لو صح، ولما يأكّد ابعت تاني.", "Not sent yet: the address he said is on the screen letter by letter (" + mailSpell(addr) + "). Ask him to check it; once he confirms, send again."); }
  var NO_TO = function () { return T("مااتبعتش: مفيش عنوان مستلم. اسأله مرة واحدة «أبعته لمين؟» — ماتقولش إنك مش عارف — ولما يقولك العنوان (حتى بالكلام زي info آت … دوت com) استدعي bassem_send_email تاني وحطه في to.", "Not sent: there is no recipient. Ask him once «Who shall I send it to?» — never say you don't know — and when he says it (even spoken, like info at … dot com) call bassem_send_email again with it in to."); };
  var SRCW = { data: ["من بيانات الفرصة", "from the opportunity's data"], deal: ["من بيانات الصفقة", "from the deal"], typed: ["هو كتبه بنفسه", "he typed it himself"], said: ["هو قاله", "he said it"], sent: ["بعتناله قبل كده في المكالمة دي", "already e-mailed in this call"] };
  /* an address the platform sent to in this call (confirmed then): known from now on, «sent» */
  function mailSent(addr, item) { if (!mailOk(addr)) return; if (!MAILS[addr] || MAILS[addr].src !== "data") { if (!MAILS[addr]) MAILS_N++; MAILS[addr] = { src: "sent", at: Date.now(), item: item || "" }; } }
  function toWords(i) {
    i = i || {};
    if (i.bad) return T("مقدرتش أكتب عنوان مستلم من \"" + i.bad + "\": اطلب منه يتهجّاه حرف حرف (آت، دوت، أندرسكور) أو يكتبه بنفسه في خانة إلى.", "I could not make a recipient address out of \"" + i.bad + "\": ask him to spell it letter by letter (at, dot, underscore) or type it in the To box himself.");
    if (i.addr && i.src === "said" && !toReady(i.addr)) return T("المستلم اللي قاله اتكتب على الشاشة حرف حرف: " + mailSpell(i.addr) + " — خليه يبص عليه ويقولك لو صح قبل ما تبعته.", "The recipient he said is on the screen letter by letter: " + mailSpell(i.addr) + " — let him check it before you send.");
    if (i.addr) return T("المستلم: " + i.addr + " (" + (SRCW[i.src] || SRCW.typed)[0] + ")" + (i.offered ? "؛ والعنوان التاني اللي كتبته (" + i.offered + ") مش في بيانات الفرصة ولا هو قاله فمااتحطش" : "") + ".",
      "Recipient: " + i.addr + " (" + (SRCW[i.src] || SRCW.typed)[1] + ")" + (i.offered ? "; the other address you wrote (" + i.offered + ") is neither in the data nor said by him, so it was not used" : "") + ".");
    if (i.offered) return T("العنوان اللي كتبته (" + i.offered + ") مش في بيانات الفرصة ولا هو قاله، فمااتحطش في المستلم: اسأله «أبعته لمين؟».", "The address you wrote (" + i.offered + ") is neither in the opportunity's data nor said by him, so it was not put in To: ask him «Who shall I send it to?».");
    if (i.several) return T("في بيانات الفرصة أكتر من عنوان (" + i.several.join("، ") + "): اسأله يختار أنهي واحد، وحطه في to.", "The opportunity's data has several addresses (" + i.several.join(", ") + "): ask him which one, and put it in to.");
    return T("خانة المستلم فاضية: اسأله مرة واحدة «أبعته لمين؟» — ماتقولش إنك مش عارف، وماتخمّنش عنوان — ولما يقوله حطه في to (حتى لو قاله بالكلام زي info آت … دوت com).", "The To box is empty: ask him once «Who shall I send it to?» — never say you don't know, never guess one — and when he says it put it in to (even spoken, like info at … dot com).");
  }
  /* the answer of bassem_draft_email: what is on the screen, and what Bassem does now (the 2-3 sentence summary, «تحب أبعته؟»); cl = the
     language the member speaks in the call (callLang(): the 🌐 choice, else Arabic) — "ar" gives exactly the words of before */
  function draftWords(where, info, lang, o, cl) {
    var bl = o && (o.market || o.country) ? bizLang(o.market) : null, foreign = lang && lang !== "ar", L = [], ml, fo;
    cl = langRow(cl) ? String(cl).toLowerCase() : "ar";
    L.push(T((where === "room" ? "المسودة في غرفة الصفقة قدامه على الشاشة" : "المسودة قدامه على الشاشة") + (lang ? " بال" + langName(lang) : "") + "، ولسه مااتبعتتش.", (where === "room" ? "The draft is in the deal room on his screen" : "The draft is on his screen") + (lang ? " in " + langName(lang) : "") + ", not sent yet."));
    L.push(toWords(info));
    if (cl === "ar") L.push(T("قوله دلوقتي في جملتين أو تلاتة بالمصري الإيميل بيقول إيه (رايح لمين، وبيطلب إيه، وأهم نقطة فيه) من غير ما تقراه" + (foreign ? "، وده مهم لأنه مش بالعربي" : "") + "، وبعدين اسأله «تحب أبعته؟». لو طلب تقراهوله اقراه كله" + (foreign ? "، ولو مش فاهم اللغة قوله معناه بالمصري جملة جملة" : "") + ".",
      "Now tell him in 2-3 sentences what the e-mail says (to whom, what it asks, the key point) without reading it out" + (foreign ? " — it matters, it is not in Arabic" : "") + ", then ask «Shall I send it?». Read it in full only if he asks."));
    else { ml = langName(cl); fo = !!lang && lang !== cl;
      L.push(T("قوله دلوقتي في جملتين أو تلاتة بال" + ml + " (لغته هو) الإيميل بيقول إيه (رايح لمين، وبيطلب إيه، وأهم نقطة فيه) من غير ما تقراه" + (fo ? "، وده مهم لأنه مش بلغته" : "") + "، وبعدين اسأله بلغته «تحب أبعته؟». لو طلب تقراهوله اقراه كله" + (fo ? "، ولو مش فاهم اللغة قوله معناه بلغته جملة جملة" : "") + ".",
        "Now tell him in 2-3 sentences in his language (" + ml + ") what the e-mail says (to whom, what it asks, the key point) without reading it out" + (fo ? " — it matters, it is not in his language" : "") + ", then ask him in his language «Shall I send it?». Read it in full only if he asks" + (fo ? "; if he does not understand that language, tell him its meaning in his language sentence by sentence" : "") + ".")); }
    if (lang && bl && bl.indexOf(lang) < 0) L.push(T("ملاحظة: الجهة في " + (o.country || o.market) + " والتعامل الرسمي معاها بال" + langName(bl[0]) + "؛ لو هو ماطلبش ال" + langName(lang) + " بنفسه، اكتب الإيميل تاني بال" + langName(bl[0]) + ".",
      "Note: the buyer is in " + (o.country || o.market) + " and does business in " + langName(bl[0]) + "; unless he asked for " + langName(lang) + " himself, write it again in " + langName(bl[0]) + "."));
    return L.join(" ");
  }
  /* the Worker refused the sign-in itself (nothing was sent or stored): the call's next sign-in may be tried (sendPost) */
  function signRefused(x) { var c = String((x && x.j && x.j.code) || ""); return !!x && (x.status === 401 || (x.status === 403 && (c === "plan" || c === "full_login_required"))); }
  /* POST /api/advisor/send with the member's platform sign-in (localStorage "mig-tok") → {status, j}; never a guessed success. The sign-in
     the call was opened with (BTOK, mint) — else the call's own order (bassemAuth: the platform session, else the advisor token of an
     activation / WhatsApp call link; review 2026-11-19: with "mig-tok" alone a member whose call came from such a link was told «لازم تسجّل
     الدخول»), the next one only after signRefused, never after a timeout or any answer of the send itself.
     path / ms (optional): the same for another advisor endpoint — «ابعتلي» posts "/advisor/notify" with 60 s (notifyGo) */
  function sendPost(body, path, ms) {
    var tks = BTOK ? [BTOK] : bassemAuth();
    function once(tk) {
      return new Promise(function (res) {
        if (!window.fetch) { res({ status: 0, j: { code: "offline" } }); return; }
        var fin = false, h = { "Content-Type": "application/json", Accept: "application/json" }, tm;
        if (tk) h.Authorization = "Bearer " + tk;
        tm = setTimeout(function () { if (!fin) { fin = true; res({ status: 0, j: { code: "timeout" } }); } }, ms || 20000);
        fetch(String(window.MIG_API_BASE || "/api").replace(/\/+$/, "") + (path || "/advisor/send"), { method: "POST", headers: h, body: JSON.stringify(body), credentials: "same-origin" }).then(function (r) {
          if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) return { status: r.status, j: { code: "offline" } };
          return r.json().then(function (j) { return { status: r.status, j: j || {} }; }, function () { return { status: r.status, j: { code: "offline" } }; });
        }, function () { return { status: 0, j: { code: "offline" } }; }).then(function (x) { if (fin) return; fin = true; clearTimeout(tm); res(x); });
      });
    }
    function from(i) { return once(tks[i] || "").then(function (x) { return i + 1 < tks.length && signRefused(x) ? from(i + 1) : x; }); }
    return from(0);
  }
  /* Bassem learns what the member did himself («📤 ابعت» clicked): the SDK call's context for his next turn */
  function tellBassem(text) { try { if (LV && !LV.closed && LV.client && LV.client.addContext) LV.client.addContext(String(text)); } catch (e) {} }

  /* ---------- the e-mail draft on the shared screen ---------- */
  var CMP = null, LAST_DRAFT = "", ROOM_DEAL = "", ROOM_DRAFT = "", ROOM_SENT = "", ROOM_AT = 0;
  var CMP_CSS = '.jnl-cmp{position:absolute;z-index:5;inset:52px 10px 10px 10px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;padding:10px 12px 12px;background:#fff;color:#14232a;border-radius:16px;overflow:auto;overscroll-behavior:contain;'
    + 'box-shadow:0 24px 60px -20px rgba(0,0,0,.6),0 0 0 1px rgba(4,18,26,.1),0 0 0 3px rgba(233,196,106,.6);font:400 .9rem/1.6 Cairo,Tajawal,Tahoma,sans-serif}'
    + '.jnl-cmp[hidden]{display:none}.jnl-cmp.fx{position:fixed;z-index:2147483003;inset:auto 12px 12px auto;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px)}'
    + '.jnl-cmp .jc-hd{display:flex;align-items:center;gap:8px}.jnl-cmp .jc-hd b{flex:1;min-width:0;font-weight:800;color:#04121a}'
    + '.jnl-cmp .jc-lg{font-style:normal;font-weight:800;font-size:.72rem;background:#04121a;color:#bff3ff;border-radius:999px;padding:1px 9px;direction:ltr}.jnl-cmp .jc-lg[hidden],.jnl-cmp .jc-why[hidden],.jnl-cmp .jc-sg[hidden],.jnl-cmp .jc-sp[hidden]{display:none}'
    + '.jnl-cmp .jc-hd button{flex:none;width:32px;height:32px;border-radius:50%;border:0;background:#eef3f5;color:#04121a;font:inherit;font-weight:800;cursor:pointer}'
    + '.jnl-cmp .jc-nt{color:#5b6b72;font-size:.76rem;line-height:1.5}.jnl-cmp .jc-why{margin:0;padding:6px 10px;border-radius:10px;background:#fff8e6;color:#6b4e00;font-size:.8rem}'
    + '.jnl-cmp label{display:flex;flex-direction:column;gap:2px;font-weight:700;font-size:.8rem;color:#33444b}.jnl-cmp .jc-bl{flex:1;min-height:0}'
    + '.jnl-cmp .jc-src{font-style:normal;font-weight:700;font-size:.72rem;color:#0b5d47}.jnl-cmp .jc-src:empty{display:none}'
    + '.jnl-cmp input,.jnl-cmp textarea{font:inherit;font-size:.92rem;font-weight:400;color:#14232a;border:1px solid #cfdde3;border-radius:10px;padding:7px 10px;background:#fff;box-sizing:border-box;width:100%}'
    + '.jnl-cmp textarea{flex:1;min-height:180px;resize:vertical;line-height:1.75;white-space:pre-wrap}.jnl-cmp [readonly]{background:#f6fafb}'
    + '.jnl-cmp .jc-sg{font-size:.8rem;color:#0b5d47;display:flex;flex-wrap:wrap;align-items:center;gap:6px}.jnl-cmp .jc-sg bdi{direction:ltr;font-weight:700}'
    + '.jnl-cmp .jc-sp{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;background:#fff8e6;color:#6b4e00;font-size:.8rem;font-weight:700}'
    + '.jnl-cmp .jc-sp bdi{display:inline-flex;flex-wrap:wrap;gap:3px;direction:ltr}.jnl-cmp .jc-ch{display:inline-block;min-width:1.2em;padding:1px 5px;border-radius:6px;background:#fff;color:#04121a;border:1px solid #ecd9a0;font:700 .95rem/1.4 Consolas,Menlo,monospace;text-align:center}'
    + '.jnl-cmp .jc-ch.sy{font:800 .72rem/1.9 Cairo,Tajawal,Tahoma,sans-serif;color:#6b4e00}'
    + '.jnl-cmp .jc-st{min-height:1.2em;margin:0;font-size:.82rem;font-weight:700;color:#0b5d47}.jnl-cmp .jc-st.err{color:#B42318}.jnl-cmp .jc-st a,.jnl-cmp .jc-st button{color:#0a3d8f;margin-inline-start:6px;background:none;border:0;padding:0;font:inherit;text-decoration:underline;cursor:pointer}'
    + '.jnl-cmp .jc-acts{display:flex;flex-wrap:wrap;gap:8px}.jnl-cmp .jc-acts button,.jnl-cmp .jc-sg button,.jnl-cmp .jc-sp button{border-radius:999px;border:1px solid #cfdde3;background:#fff;color:#04121a;font:inherit;font-weight:800;padding:6px 14px;cursor:pointer}'
    + '.jnl-cmp .jc-acts .jc-send{background:#0b6b35;border-color:#0b6b35;color:#fff}.jnl-cmp .jc-acts .jc-send[disabled]{opacity:.6;cursor:wait}.jnl-cmp .jc-hi{box-shadow:0 0 0 3px rgba(233,196,106,.95),0 0 24px rgba(233,196,106,.6)}'
    + '.jnl-cmp button:focus-visible,.jnl-cmp input:focus-visible,.jnl-cmp textarea:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}'
    + '.jnl-cmp.min{inset:52px auto auto 10px;width:auto;max-width:calc(100% - 20px);padding:4px 6px 4px 12px;overflow:hidden;cursor:pointer}.jnl-cmp.min>*:not(.jc-hd){display:none}.jnl-cmp.min .jc-x{display:none}'
    + '@media (max-width:820px){.jnl-cmp{inset:48px 6px 6px 6px;padding:8px 10px}.jnl-cmp textarea{min-height:140px}}'
    /* review 2026-11-19 #15 (phones / stacked): «رجوع لباسم» (data/bassem-live-tools.js, bottom 14px, ~48px tall) stays — the open draft
       ends above it, so its «📤 ابعت» / «✏️ عدّل» are never under the button and both can be tapped */
    + '@media (max-width:820px),(max-aspect-ratio:3/2){.jnl:not(.fs) .jnl-scr.blt-bk.jnl-cmp-on .jnl-cmp:not(.min):not(.fx){bottom:68px}}';
  function cmpRtl(s) { return /[\u0600-\u06ff]/.test(String(s || "")); }
  function cmpOn() { return !!(CMP && !CMP.el.hidden && document.body && document.body.contains(CMP.el)); }
  /* a draft is waiting in the composer (open, folded or closed with ✕ — its text is kept until the next draft) */
  function cmpDraft() { return !!(CMP && String(CMP.body.value || "").replace(/\s+/g, "")); }
  /* the deal room is open on the shared screen (or on this page, advisor.html itself) */
  function dealOnScreen() { var d = advDoc(), dr = null; try { dr = d && d.querySelector ? d.querySelector("#advDr") : null; } catch (e) { dr = null; } return !!(dr && !dr.hidden && dr.querySelector(".pn")); }
  /* the status line under the draft; act = [label, fn] adds a small button (e.g. open the new deal on the shared screen) */
  function cmpSay(msg, err, href, act) {
    if (!CMP) return; var st = CMP.st; st.textContent = msg || ""; st.className = "jc-st" + (err ? " err" : "");
    if (href) { var l = document.createElement("a"); l.href = href; l.textContent = T("لو ما اتفتحش: افتحه من هنا", "If it did not open: open it here"); st.appendChild(l); }
    if (act) { var b = document.createElement("button"); b.type = "button"; b.textContent = act[0]; b.onclick = act[1]; st.appendChild(b); }
  }
  function cmpEdit(on) {
    var C = CMP; if (!C) return; C.sub.readOnly = !on; C.body.readOnly = !on;
    var b = C.el.querySelector(".jc-edit"); b.setAttribute("aria-pressed", on ? "true" : "false"); b.textContent = on ? "✔️ " + T("تمام", "Done") : "✏️ " + T("عدّل", "Edit");
    if (on) { try { C.body.focus(); } catch (e) {} }
  }
  function cmpCopy() {
    var C = CMP; if (!C) return;
    var t = (C.sub.value ? C.sub.value + "\n\n" : "") + C.body.value;
    var ok = function () { cmpSay(T("اتنسخ ✓ — الصقه في بريدك أو في أي مكان.", "Copied ✓ — paste it into your mail or anywhere."), false); };
    var old = function () {
      var ta = document.createElement("textarea"), r = false; ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { r = document.execCommand("copy"); } catch (e) { r = false; } ta.parentNode.removeChild(ta);
      if (r) ok(); else cmpSay(T("مقدرتش أنسخ — حدّد النص بإيدك وانسخه.", "Could not copy — select the text and copy it by hand."), true);
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(ok, old); return; } } catch (e) {}
    old();
  }
  /* «📧 من بريدي»: the member's own mail app with the draft — nothing is sent from here */
  function cmpMailto() {
    var C = CMP; if (!C) return;
    var to = C.to.value.trim(), sub = C.sub.value.trim(), body = C.body.value;
    if (!EMRE.test(to)) { cmpSay(T("اكتب بريد المستلم الأول (من إعلان الجهة أو موقعها الرسمي) — باسم مش بيخمّن عناوين.", "Write the recipient's e-mail first (from the buyer's notice or official site) — Bassem never guesses addresses."), true); try { C.to.focus(); } catch (e) {} return; }
    if (!sub || !body.replace(/\s+/g, "")) { cmpSay(T("الموضوع ونص الرسالة مطلوبين.", "Subject and message are required."), true); return; }
    var href = "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") + "?subject=" + encodeURIComponent(sub) + "&body=" + encodeURIComponent(body);
    C.href = href;
    cmpSay(T("اتفتح الإيميل في برنامج البريد عندك — راجعه واضغط إرسال من هناك.", "The e-mail opened in your mail app — review it and press send there."), false, href);
    try { if (!window.JANNA_LIVE_NO_MAILTO) { var x = document.createElement("a"); x.href = href; x.style.display = "none"; document.body.appendChild(x); x.click(); x.parentNode.removeChild(x); } } catch (e) {}
  }
  /* «إلى» with its source: a dictated address is spelled letter by letter with ✓ / ✏️ under it */
  function cmpSrc(C, src) { C.el.querySelector(".jc-src").textContent = src === "said" ? (toReady(C.to.value.trim().toLowerCase()) ? T("اللي قلته ✓", "what you said ✓") : T("اللي قلته — اتأكد منه", "what you said — please check it")) : SRCW[src] && src !== "typed" ? SRCW[src][EN ? 1 : 0] + " ✓" : ""; }
  function cmpSpell(C, addr) {
    var sp = C.el.querySelector(".jc-sp"), bd, i, ch, x, ok, ed; sp.innerHTML = ""; sp.hidden = !addr; if (!addr) return;
    sp.appendChild(document.createTextNode(T("اتأكد من العنوان حرف حرف:", "Check the address letter by letter:") + " "));
    bd = document.createElement("bdi"); bd.setAttribute("aria-label", addr);
    for (i = 0; i < addr.length; i++) { ch = addr.charAt(i); x = document.createElement("span"); x.className = "jc-ch" + (MSAY[ch] ? " sy" : ""); x.textContent = MSAY[ch] ? ch + " " + T(MSAY[ch][0], MSAY[ch][1]) : ch; bd.appendChild(x); }
    sp.appendChild(bd);
    ok = document.createElement("button"); ok.type = "button"; ok.textContent = "✓ " + T("صح", "Correct");
    ok.onclick = function () { if (TO_PEND.addr === addr) TO_PEND.ok = true; cmpSpell(C, ""); cmpSrc(C, "said"); };
    ed = document.createElement("button"); ed.type = "button"; ed.textContent = "✏️ " + T("أصلّحه", "Fix it");
    ed.onclick = function () { try { C.to.focus(); C.to.select(); } catch (e) {} };
    sp.appendChild(ok); sp.appendChild(ed);
  }
  function cmpTo(addr, src) {
    var C = cmpBox(); C.to.value = addr || ""; C.toSrc = addr ? src : ""; C.sg.innerHTML = ""; C.sg.hidden = true;
    if (addr && src === "said") TO_PEND = { addr: addr, at: Date.now(), ok: TO_PEND.ok && TO_PEND.addr === addr };
    cmpSpell(C, addr && src === "said" && !toReady(addr) ? addr : ""); cmpSrc(C, C.toSrc);
  }
  /* an address Bassem passed that nobody said and no data holds: only offered — the member's own tap uses it */
  function cmpOffer(C, list) {
    var sg = C.sg, i; sg.innerHTML = ""; if (!list.length) { sg.hidden = true; return; }
    sg.appendChild(document.createTextNode((list.length > 1 ? T("العناوين اللي في بيانات الفرصة:", "Addresses in the opportunity's data:") : T("باسم كتب العنوان ده:", "Bassem wrote this address:")) + " "));
    for (i = 0; i < list.length && i < 4; i++) (function (em) {
      var bd = document.createElement("bdi"), ub = document.createElement("button"); bd.textContent = em; ub.type = "button"; ub.textContent = T("استخدمه", "Use it");
      ub.onclick = function () { cmpTo(em, "typed"); }; sg.appendChild(bd); sg.appendChild(ub);
    })(list[i]);
    sg.hidden = false;
  }
  function cmpBox() {
    var host = ov && ov.querySelector(".jnl-scr");
    if (CMP && document.body.contains(CMP.el) && (!host || CMP.el.parentNode === host)) return CMP;
    if (!document.getElementById("jnlCmpCss")) { var st = document.createElement("style"); st.id = "jnlCmpCss"; st.textContent = CMP_CSS; (document.head || document.documentElement).appendChild(st); }
    var keep = CMP; if (keep && keep.el.parentNode) keep.el.parentNode.removeChild(keep.el);
    var el = document.createElement("section"); el.className = "jnl-cmp" + (host ? "" : " fx"); el.setAttribute("role", "region"); el.setAttribute("translate", "no"); el.hidden = true;
    el.innerHTML = '<div class="jc-hd"><b>✉️ ' + esc(T("مسودة إيميل", "E-mail draft")) + '</b><em class="jc-lg" hidden></em>'
      + '<button type="button" class="jc-min" title="' + esc(T("صغّرها", "Minimise")) + '" aria-label="' + esc(T("صغّر المسودة", "Minimise the draft")) + '">–</button>'
      + '<button type="button" class="jc-x" title="' + esc(T("اقفل", "Close")) + '" aria-label="' + esc(T("اقفل المسودة", "Close the draft")) + '">✕</button></div>'
      + '<p class="jc-why" hidden></p>'
      + '<span class="jc-nt">' + esc(T("بيتبعت من المنصة باسم شركتك لما تقول لباسم «ابعته» أو تضغط «ابعت»، والرد بيتسجّل في صفقة على المنصة. باسم بيقولك ملخصه، ويقراه كله لو طلبت.", "Sent from the platform in your company's name when you tell Bassem “send it” or press “Send”; the reply is tracked in a deal on the platform. Bassem tells you what it says, and reads it in full if you ask.")) + '</span>'
      + '<label>' + esc(T("إلى", "To")) + ' <em class="jc-src"></em><input class="jc-to" type="email" dir="ltr" autocomplete="off" spellcheck="false" placeholder="' + esc(T("لسه مفيش مستلم — قول لباسم العنوان أو اكتبه هنا", "No recipient yet — tell Bassem the address or type it here")) + '"></label>'
      + '<div class="jc-sp" hidden></div><div class="jc-sg" hidden></div>'
      + '<label>' + esc(T("الموضوع", "Subject")) + '<input class="jc-sub" maxlength="250" readonly></label>'
      + '<label class="jc-bl">' + esc(T("نص الرسالة", "Message")) + '<textarea class="jc-body" readonly></textarea></label>'
      + '<p class="jc-st" role="status" aria-live="polite"></p>'
      + '<div class="jc-acts"><button type="button" class="jc-send">📤 ' + esc(T("ابعت من المنصة", "Send via the platform")) + '</button><button type="button" class="jc-mail">📧 ' + esc(T("من بريدي", "From my mail")) + '</button><button type="button" class="jc-copy">📋 ' + esc(T("انسخ", "Copy")) + '</button><button type="button" class="jc-edit" aria-pressed="false">✏️ ' + esc(T("عدّل", "Edit")) + '</button></div>';
    (host || document.body).appendChild(el);
    CMP = { el: el, to: el.querySelector(".jc-to"), sub: el.querySelector(".jc-sub"), body: el.querySelector(".jc-body"), st: el.querySelector(".jc-st"), sg: el.querySelector(".jc-sg"), href: "", toSrc: "", opp: null, lang: "", market: "", at: 0, busy: false, sentKey: "" };
    /* open and not folded → the host screen says so (CSS above); every way it opens / folds / closes changes `hidden` or `class` */
    var mark = function () { var on = !el.hidden && !el.classList.contains("min"); try { if (host) host.classList.toggle("jnl-cmp-on", on); } catch (e) {} };
    try { if (window.MutationObserver) new MutationObserver(mark).observe(el, { attributes: true, attributeFilter: ["hidden", "class"] }); } catch (e) {}
    mark();
    if (keep) { CMP.to.value = keep.to.value; CMP.sub.value = keep.sub.value; CMP.body.value = keep.body.value; CMP.sub.dir = keep.sub.dir; CMP.body.dir = keep.body.dir; CMP.toSrc = keep.toSrc; CMP.opp = keep.opp; CMP.lang = keep.lang; CMP.market = keep.market; CMP.at = keep.at; CMP.sentKey = keep.sentKey; cmpSrc(CMP, CMP.toSrc); }
    el.querySelector(".jc-x").onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); el.hidden = true; };
    el.querySelector(".jc-min").onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); el.classList.toggle("min"); };
    el.onclick = function (e) { if (el.classList.contains("min") && !(e && e.target && e.target.closest && e.target.closest(".jc-min"))) el.classList.remove("min"); };
    el.querySelector(".jc-edit").onclick = function () { cmpEdit(CMP.body.readOnly); };
    el.querySelector(".jc-copy").onclick = cmpCopy;
    el.querySelector(".jc-mail").onclick = cmpMailto;
    el.querySelector(".jc-send").onclick = function () { cmpSendNow("button"); };
    /* his own typing in «إلى» is his address (no letter-by-letter check needed) */
    CMP.to.addEventListener("input", function () { CMP.toSrc = CMP.to.value.trim() ? "typed" : ""; CMP.sg.hidden = true; cmpSpell(CMP, ""); cmpSrc(CMP, CMP.toSrc); });
    [CMP.sub, CMP.body].forEach(function (x) { x.addEventListener("input", function () { x.dir = cmpRtl(x.value) ? "rtl" : "ltr"; }); });
    return CMP;
  }
  /* a new draft in the composer → the text for Bassem (draftWords) */
  function cmpDraftNow(a, why) {
    var C = cmpBox(), el = C.el, sub = String(a.subject || ""), body = String(a.body || ""), lg = mailLang(sub + "\n" + body, a.language), pick, prevK = C.opp ? C.opp.k : "", info, em, cur, ms;
    screenOpp(); /* the notice on the screen joins the call's opportunities (read from its own page when no tool returned it) */
    pick = oppPick(OPPC, screenOppKey(), sub + "\n" + body);
    /* the last recipient stays only for a new version of the SAME e-mail: the same opportunity, or (no opportunity) a draft not sent yet,
       within 10 minutes — a new e-mail never inherits the address of the last one */
    if (C.to.value && !(pick ? pick.k === prevK : !prevK && !C.sentKey && Date.now() - (C.at || 0) < 600000)) { C.to.value = ""; C.toSrc = ""; }
    C.opp = pick; C.lang = lg; C.market = ""; C.sentKey = ""; C.busy = false;
    el.dir = EN ? "ltr" : "rtl"; el.setAttribute("aria-label", T("مسودة إيميل من باسم", "E-mail draft from Bassem"));
    C.sub.value = sub; C.body.value = body; C.sub.dir = cmpRtl(sub) ? "rtl" : "ltr"; C.body.dir = cmpRtl(body) ? "rtl" : "ltr";
    var b0 = el.querySelector(".jc-lg"); b0.textContent = lg ? lg.toUpperCase() : ""; b0.hidden = !lg;
    var w0 = el.querySelector(".jc-why"); w0.textContent = why || ""; w0.hidden = !why;
    C.sg.innerHTML = ""; C.sg.hidden = true; cmpSpell(C, "");
    em = toArg(a.to); cur = C.to.value.trim().toLowerCase();
    if (em.addr) { var s0 = cur === em.addr && C.toSrc ? C.toSrc : mailSource(em.addr); if (s0) { if (cur !== em.addr || C.toSrc !== s0) cmpTo(em.addr, s0); info = { addr: em.addr, src: s0 }; } else { cmpOffer(C, [em.addr]); info = { addr: cur, src: cur ? C.toSrc : "", offered: em.addr }; } }
    else if (em.bad) info = { addr: cur, src: C.toSrc, bad: cur ? "" : em.bad };
    else if (cur && C.toSrc) info = { addr: cur, src: C.toSrc };
    else { ms = pick ? oppMails(pick.k) : []; if (ms.length === 1) { cmpTo(ms[0], "data"); info = { addr: ms[0], src: "data" }; } else { if (ms.length > 1) cmpOffer(C, ms); info = { several: ms.length > 1 ? ms : null }; } }
    if (!C.to.value.trim()) C.to.title = C.to.placeholder;
    cmpSrc(C, C.toSrc);
    cmpEdit(false); cmpSay("", false); C.href = ""; C.at = Date.now();
    el.classList.remove("min"); el.hidden = false;
    try { C.body.scrollTop = 0; el.scrollTop = 0; } catch (e) {}
    /* phones: the screen sits under the video — the «الشاشة» button pings, as it does when the screen changes */
    var sw = ov && ov.querySelector(".jnl-hd .sw"); if (sw) { sw.classList.remove("new"); void sw.offsetWidth; sw.classList.add("new"); }
    done("bassem_draft_email");
    return draftWords("cmp", info, lg, pick && pick.o, callLang());
  }
  /* the composer's draft FROM THE PLATFORM (Bassem's bassem_send_email, or the member's own «📤 ابعت») → the text for Bassem */
  function cmpSendNow(via) {
    var C = CMP, B = via !== "button", to, sub, body, key, msg;
    var stop = function (m, st) { cmpSay(m, true); if (B) outcome("bassem_send_email", st || "refused", m); return m; };
    if (!C || !cmpDraft()) return Promise.resolve(T("مفيش إيميل مكتوب على الشاشة لسه: اكتبه الأول بـ bassem_draft_email، وبعدها ابعته.", "There is no e-mail on the screen yet: write it first with bassem_draft_email, then send it."));
    C.el.classList.remove("min"); C.el.hidden = false;
    if (C.busy) return Promise.resolve(T("الإيميل ده بيتبعت دلوقتي — استنى النتيجة وماتبعتوش تاني.", "This e-mail is being sent right now — wait for the result, do not send it again."));
    to = C.to.value.trim().toLowerCase(); sub = C.sub.value.trim(); body = C.body.value;
    if (!to) { try { C.to.focus(); } catch (e) {} C.to.classList.add("jc-hi"); setTimeout(function () { C.to.classList.remove("jc-hi"); }, 4500); stop(T("لسه مفيش مستلم: قول لباسم العنوان أو اكتبه في خانة إلى.", "No recipient yet: tell Bassem the address or type it in To.")); return Promise.resolve(NO_TO()); }
    if (!mailOk(to)) { stop(T("العنوان اللي في خانة إلى مش صحيح — صححه.", "The address in To is not valid — please correct it.")); return Promise.resolve(T("مااتبعتش: العنوان اللي في خانة إلى (" + to + ") مش صحيح. اطلب منه يقوله تاني حرف حرف.", "Not sent: the address in To (" + to + ") is not valid. Ask him to say it again letter by letter.")); }
    if (!B && TO_PEND.addr === to) TO_PEND.ok = true; /* his own click is his confirmation */
    if (B && C.toSrc === "said" && !toReady(to)) { cmpSpell(C, to); cmpSay(T("اتأكد من العنوان الأول — لما تقول صح بيتبعت.", "Check the address first — it goes out once you confirm."), false); outcome("bassem_send_email", "refused", "address not confirmed"); return Promise.resolve(confirmWords(to)); }
    if (!sub || !body.replace(/\s+/g, "")) { stop(T("الموضوع ونص الرسالة مطلوبين.", "Subject and message are required.")); return Promise.resolve(T("مااتبعتش: الموضوع أو نص الإيميل ناقص — اكتب المسودة تاني بـ bassem_draft_email.", "Not sent: the subject or the message is missing — write the draft again with bassem_draft_email.")); }
    key = to + "\n" + sub + "\n" + body;
    if (C.sentKey === key) { msg = T("الإيميل ده اتبعت فعلاً لـ " + to + " — مش هيتبعت مرتين.", "This e-mail was already sent to " + to + " — it is not sent twice."); cmpSay("✅ " + msg, false); return Promise.resolve(msg); }
    if (B && !heardSince(C.at)) { cmpSay(T("مستني موافقتك: قول لباسم «ابعته» أو اضغط «ابعت من المنصة».", "Waiting for your OK: tell Bassem “send it” or press “Send via the platform”."), false); outcome("bassem_send_email", "refused", T("مستني موافقتك", "waiting for your OK")); return Promise.resolve(askFirstWords()); }
    C.busy = true; var btn = C.el.querySelector(".jc-send"); btn.disabled = true;
    cmpSay("⏳ " + T("ببعت من المنصة…", "Sending from the platform…"), false);
    if (B) doing(T("ببعت الإيميل من المنصة", "sending the e-mail from the platform"));
    return sendPost(sendBody({ to: to, subject: sub, body: body, language: C.lang, opp: C.opp && C.opp.o, via: via, toSrc: C.toSrc, market: C.market })).then(function (r) {
      C.busy = false; btn.disabled = false;
      var w = sendWords(to, r), dl = r.j && r.j.deal;
      if (w.ok) {
        C.sentKey = key; mailSent(to, C.opp ? C.opp.k : "");
        cmpSay(w.screen, false, "", dl && dl.id ? ["📂 " + T("افتح الصفقة", "Open the deal"), function () { go("advisor.html#deal=" + encodeURIComponent(dl.id)); }] : null);
        if (B) done("bassem_send_email"); else tellBassem(T("العضو ضغط «ابعت» بنفسه: الإيميل \"" + sub + "\" اتبعت من المنصة لـ " + to + " (المنصة أكدت). ماتبعتوش تاني.", "The member pressed “Send” himself: the e-mail \"" + sub + "\" was sent from the platform to " + to + " (confirmed). Do not send it again."));
      } else {
        cmpSay(w.screen, true);
        if (B) outcome("bassem_send_email", w.failed ? "failed" : "refused", w.screen);
        else tellBassem(T("العضو ضغط «ابعت» بنفسه على الإيميل \"" + sub + "\" لـ " + to + " و", "The member pressed “Send” himself on the e-mail \"" + sub + "\" to " + to + " — ") + w.bassem);
        if (w.code === "full_login_required") { try { var A = window.MIGAPI; if (A && A.login) setTimeout(function () { A.login({ why: T("سجّل دخولك بكود الإيميل علشان باسم يبعت الإيميل من المنصة.", "Sign in with your e-mail code so Bassem can send the e-mail from the platform.") }); }, 600); } catch (x) {} }
      }
      return w.bassem;
    });
  }
  /* the draft gives way when Bassem shows something else (a tool that drives the screen / shows results, or a new page on the screen):
     it folds to its «✉️» chip and keeps everything the member typed; the next draft or send brings it back */
  var CMP_GIVE = /^(janna_search|janna_navigate|janna_open|bassem_open_item|bassem_screen|bassem_open_opportunity|bassem_start_deal|bassem_open_guide|bassem_update_deal|bassem_web_search|bassem_intel)$/;
  function cmpGive(tool) { if (!cmpOn() || CMP.el.classList.contains("min") || (tool ? !CMP_GIVE.test(String(tool)) : Date.now() - (CMP.at || 0) < 1500)) return; CMP.el.classList.add("min"); } /* a page load right after it opened does not fold it */

  /* ---------- the deal room (advisor.part.py): Bassem fills its own fields and presses its own «ابعت من المنصة» ---------- */
  function roomDraft(d, a) {
    return new Promise(function (res) {
      doing(T("بكتبلك الإيميل", "drafting your e-mail"));
      var known = dealMails(d);
      tab(d, "mail", "#mTo", function (to) {
        if (!to) { res(T("مقدرتش أفتح المراسلات في الصفقة — جرّب تاني.", "Could not open the deal's e-mails — please try again.")); return; }
        /* the deal room has an Arabic and an LTR (English) template: every language but Arabic (zh, fr, es …) takes the LTR one */
        if (a.language && d.querySelector("#mLang")) setIn(d, "#mLang", /^ar/i.test(a.language) ? "ar" : "en", ["change"]);
        setTimeout(function () {
          var em = toArg(a.to), cur = to.value.trim().toLowerCase(), info = cur ? { addr: cur, src: "deal" } : {}, s0;
          /* Bassem never invents a recipient: an address of this deal / opportunity, of the call's data, or the member's own words */
          if (em.addr) {
            s0 = cur === em.addr || known.indexOf(em.addr) > -1 ? "deal" : mailSource(em.addr);
            if (s0) { setIn(d, "#mTo", em.addr); info = { addr: em.addr, src: s0 }; if (s0 === "said") { TO_PEND = { addr: em.addr, at: Date.now(), ok: TO_PEND.ok && TO_PEND.addr === em.addr }; if (!toReady(em.addr)) sayAny("🔤 " + T("اتأكد من العنوان: ", "Check the address: ") + mailSpell(em.addr)); } }
            else { info.offered = cur ? "" : em.addr; sayAny(T("باسم ما بيخمّنش عناوين بريد: البريد ده مش موجود في بيانات الفرصة ولا إنت قلته، فسيبت خانة «إلى» زي ما هي.", "Bassem never guesses addresses: that e-mail is neither in the opportunity's data nor said by you, so “To” was left as it is.")); }
          } else if (em.bad) info.bad = cur ? "" : em.bad;
          /* no real recipient yet: the draft says so instead of an address (owner test 2026-11-18: «sales@supplier-example.com») */
          if (!to.value.trim()) { to.placeholder = T("المستلم: قول لباسم العنوان أو اكتبه هنا", "Recipient: tell Bassem the address or type it here"); to.title = to.placeholder; }
          if (a.subject) setIn(d, "#mSub", a.subject); if (a.body) setIn(d, "#mBody", a.body);
          /* a subject / body that is not Arabic (English, Chinese, French …) reads left to right */
          [["#mSub", a.subject], ["#mBody", a.body]].forEach(function (x) { var el = x[1] && d.querySelector(x[0]); if (el) el.dir = /[\u0600-\u06ff]/.test(String(x[1])) ? "rtl" : "ltr"; });
          var sg0 = d.querySelector("#advStg"), mb0 = d.querySelector("#mBody"); ROOM_DEAL = sg0 ? String(sg0.getAttribute("data-stage") || "") : "";
          ROOM_DRAFT = "b" + Date.now().toString(36); ROOM_AT = Date.now(); if (mb0) mb0.setAttribute("data-bassem-draft", ROOM_DRAFT); /* roomSend sends only this form */
          glow(d.querySelector("#mBody")); done("bassem_draft_email");
          res(draftWords("room", info, mailLang(String(a.subject || "") + "\n" + String(a.body || ""), a.language), roomOpp(d), callLang()));
        }, 300);
      });
    });
  }
  /* the open deal's market / country (its chips) for the language note */
  function roomOpp(d) { var h = d.querySelector("#advDr .pn-h .opc-t .chip"), t = h ? String(h.textContent || "") : ""; return t ? { market: /الخليج|Gulf/i.test(t) ? "gulf" : /مصر|Egypt/i.test(t) ? "local" : "", country: t } : null; }
  function roomWords(x, to) {
    x = x || {};
    if (x.sent) { mailSent(to, ""); ROOM_SENT = ROOM_DRAFT; done("bassem_send_email"); return T("اتبعت ✓ من المنصة لـ " + to + " من غرفة الصفقة، والرد هيتسجّل فيها. قوله إنه اتبعت وإنك هتتابع الرد.", "Sent ✓ from the platform to " + to + " from the deal room; the reply is tracked there. Tell him it was sent and that you will follow the reply."); }
    if (x.mailto) { outcome("bassem_send_email", "refused", "opened in his mail app"); return T("اتفتح في برنامج البريد عنده (الصفحة مش متوصلة بخادم المستشار دلوقتي) — قوله يدوس إرسال من هناك، وماتقولش إنه اتبعت.", "It opened in his mail app (the page is not connected to the advisor server right now) — tell him to press send there; never say it was sent."); }
    if (x.code === "placeholders") { outcome("bassem_send_email", "refused", "placeholders"); return T("مااتبعتش: الإيميل لسه فيه بيانات بين [ ] ناقصة. كمّلها في المسودة (bassem_draft_email) أو قوله يكمّلها، وبعدين ابعت.", "Not sent: the e-mail still has [placeholders]. Fill them in (bassem_draft_email) or ask him to, then send."); }
    var w = sendWords(to, { status: 0, j: x.stored ? { sent: false, message: {}, error: x.error } : { code: x.code || "", error: x.error || "", limit: x.limit || "" } });
    outcome("bassem_send_email", w.failed ? "failed" : "refused", w.screen);
    return w.bassem;
  }
  /* the deal room's own «ابعت من المنصة», on the room that is open NOW — never a room re-opened or a tab switched just to send: that
     re-renders the form with its template, and the member would get an e-mail he never saw. Bassem's draft is marked on its #mBody
     (ROOM_DRAFT); a form without that mark (closed, re-opened, another tab) holds no draft of his */
  function roomOpenId() { var d = advDoc(), s = null; try { s = d && d.querySelector ? d.querySelector("#advDr:not([hidden]) #advStg") : null; } catch (e) { s = null; } return s ? String(s.getAttribute("data-stage") || "") : ""; }
  function roomIs(d, deal, openId) { var h = d && d.querySelector ? d.querySelector("#advDr #advDrT") : null, q = norm(deal); return deal === openId || !!(h && q && norm(h.textContent || "").indexOf(q) > -1); }
  function roomSend(d, a) {
    return new Promise(function (res) {
      var b = d.querySelector("#advDr #mSend"), to = d.querySelector("#advDr #mTo"), mb = d.querySelector("#advDr #mBody"), w = null, em = toArg(a.to), v, fin = false, tm = 0, h;
      if (!b || !to || !mb) { outcome("bassem_send_email", "refused", "no e-mail form open"); res(T("مااتبعتش: المراسلات مش مفتوحة في الصفقة دي — اكتب الإيميل الأول بـ bassem_draft_email.", "Not sent: the deal's e-mail form is not open — write the e-mail first with bassem_draft_email.")); return; }
      if (ROOM_DRAFT && ROOM_DEAL && roomOpenId() === ROOM_DEAL && mb.getAttribute("data-bassem-draft") !== ROOM_DRAFT) { outcome("bassem_send_email", "refused", "the draft is no longer on the screen"); res(T("مااتبعتش: المسودة اللي كتبتها مش على الشاشة دلوقتي (الصفقة اتقفلت أو اتفتح تبويب تاني). اكتبها تاني بـ bassem_draft_email وبعدين ابعتها.", "Not sent: the draft you wrote is no longer on the screen (the deal was closed or another tab opened). Write it again with bassem_draft_email, then send it.")); return; }
      if (ROOM_SENT && mb.getAttribute("data-bassem-draft") === ROOM_SENT) { res(T("الإيميل ده اتبعت فعلاً من غرفة الصفقة — مش هيتبعت مرتين.", "This e-mail was already sent from the deal room — it is not sent twice.")); return; }
      try { w = d.defaultView; } catch (e) { w = null; }
      if (em.addr) { var s0 = dealMails(d).indexOf(em.addr) > -1 ? "deal" : mailSource(em.addr); if (s0) { setIn(d, "#mTo", em.addr); if (s0 === "said" && TO_PEND.addr !== em.addr) TO_PEND = { addr: em.addr, at: Date.now(), ok: false }; } }
      v = to.value.trim().toLowerCase();
      if (!EMRE.test(v)) { glow(to); try { to.focus(); } catch (e) {} outcome("bassem_send_email", "refused", "no recipient"); res(NO_TO()); return; }
      if (!toReady(v)) { sayAny("🔤 " + T("اتأكد من العنوان: ", "Check the address: ") + mailSpell(v)); outcome("bassem_send_email", "refused", "address not confirmed"); res(confirmWords(v)); return; }
      /* Bassem's draft in this room goes out only after the member said something since it appeared (heardSince) */
      if (ROOM_DRAFT && mb.getAttribute("data-bassem-draft") === ROOM_DRAFT && !heardSince(ROOM_AT)) { glow(b); sayAny(T("مستني موافقتك: قول لباسم «ابعته» أو اضغط «ابعت من المنصة».", "Waiting for your OK: tell Bassem “send it” or press “Send via the platform”.")); outcome("bassem_send_email", "refused", T("مستني موافقتك", "waiting for your OK")); res(askFirstWords()); return; }
      h = function (e) { var x = (e && e.detail) || {}; if (fin) return; fin = true; clearTimeout(tm); try { w.removeEventListener("mig:advisor-mail", h); } catch (er) {} res(roomWords(x, v)); };
      try { w.addEventListener("mig:advisor-mail", h); } catch (e) {}
      tm = setTimeout(function () { if (fin) return; fin = true; try { w.removeEventListener("mig:advisor-mail", h); } catch (er) {} res(T("مش متأكد لسه إنه اتبعت — غرفة الصفقة مارديتش. بص على المراسلات فيها قبل ما تبعته تاني.", "Not sure yet that it was sent — the deal room did not answer. Check its e-mails before sending again.")); }, 20000);
      doing(T("ببعت الإيميل من المنصة", "sending the e-mail from the platform")); glow(b); b.click();
    });
  }
  /* bassem_draft_email / bassem_send_email → a Promise of the text Bassem is given (sdkRun's awaitResult handlers); the DOM path (run →
     bassemTool: the widget, which cannot answer a tool) runs the same and the outcome is only shown on the screen */
  function capped(p, ms, late) { return new Promise(function (res) { var t = setTimeout(function () { res(late); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function () { clearTimeout(t); res(late); }); }); }
  var LATE_SEND = function () { return T("مش متأكد لسه إنه اتبعت — المنصة لسه مارديتش. ماتبعتوش تاني؛ النتيجة هتظهر على الشاشة.", "Not sure yet that it was sent — the platform has not answered. Do not send it again; the result will show on the screen."); };
  /* the composer's draft from the platform, with a recipient / market Bassem passed with the send */
  function cmpSendFor(name, a) {
    var C = CMP, em = toArg(a.to), s0;
    if (a.market) C.market = String(a.market).slice(0, 60);
    if (em.addr && C.to.value.trim().toLowerCase() !== em.addr) { s0 = mailSource(em.addr); if (s0) cmpTo(em.addr, s0); else { cmpOffer(C, [em.addr]); C.el.hidden = false; C.el.classList.remove("min"); outcome(name, "refused", "address not in the data, not said"); return Promise.resolve(T("مااتبعتش: ", "Not sent: ") + toWords({ offered: em.addr })); } }
    else if (em.bad && !C.to.value.trim()) { outcome(name, "refused", "no address"); return Promise.resolve(T("مااتبعتش: ", "Not sent: ") + toWords({ bad: em.bad })); }
    return capped(cmpSendNow("bassem"), 23000, LATE_SEND());
  }
  function mailTool(name, a) {
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = {}; } }
    a = a && typeof a === "object" ? a : {};
    var deal = String(a.deal || "").replace(/^\s+|\s+$/g, ""), rd, openId;
    if (name === "bassem_draft_email") {
      /* an e-mail with NO deal behind it (no deal named, no deal room open on the screen) opens in the composer — never in the first deal
         of his list, never «مالقيتش الصفقة» (owner 2026-11-18, 4th message #3) */
      if (!deal && !dealOnScreen()) { LAST_DRAFT = "cmp"; return Promise.resolve(cmpDraftNow(a, "")); }
      return capped(new Promise(function (res) {
        onAdvisor(name, a, function (d) {
          openDealIn(d, a.deal, function (ok) {
            /* a deal that is not in his deals: the draft still opens on the screen (the composer) — it is never lost */
            if (!ok) { LAST_DRAFT = "cmp"; res(cmpDraftNow(a, T("مالقيتش الصفقة دي في صفقاتك، فالمسودة هنا — ولما تقول ابعته بيتبعت من المنصة وبتتفتحله صفقة لوحده.", "That deal is not in your deals, so the draft is here — when you say send it, it goes from the platform and gets its own deal."))); return; }
            LAST_DRAFT = "room"; roomDraft(d, a).then(res);
          });
        });
      }), 9000, T("المسودة لسه بتتكتب على الشاشة — قوله إنها قدامه حالاً.", "The draft is still being written on the screen — tell him it is coming."));
    }
    /* bassem_send_email: what is on the screen and he saw — the room his last draft went to (if it is still the open one), else the
       composer's draft, else the room open now with an e-mail he wrote himself; nothing else */
    rd = advDoc(); openId = roomOpenId();
    if (LAST_DRAFT === "room" && !deal) {
      if (openId && (!ROOM_DEAL || openId === ROOM_DEAL)) return capped(roomSend(rd, a), 23000, LATE_SEND());
      outcome(name, "refused", "the deal room of the draft is closed");
      return Promise.resolve(T("مااتبعتش: المسودة كانت في غرفة الصفقة، والغرفة دي اتقفلت. اكتبها تاني بـ bassem_draft_email وبعدين ابعتها.", "Not sent: the draft was in the deal room, and that room was closed. Write it again with bassem_draft_email, then send it."));
    }
    if (!deal && cmpDraft()) return cmpSendFor(name, a);
    if (openId && (!deal || roomIs(rd, deal, openId))) return capped(roomSend(rd, a), 23000, LATE_SEND());
    if (cmpDraft()) return cmpSendFor(name, a); /* a deal he named that is not open: the draft on the screen is the one he saw */
    outcome(name, "refused", "nothing drafted");
    return Promise.resolve(T("مفيش إيميل مكتوب على الشاشة يتبعت: اكتبه الأول بـ bassem_draft_email، وبعدها ابعته.", "There is no e-mail on the screen to send: write it first with bassem_draft_email, then send it."));
  }
  /* ---------- links in Bassem's messages (owner 2026-11-19: «بعتلي ... الرابط ومش بيفتح»: the model retyped a 160-character tender link
     and dropped one letter, so the e-mailed link answered 500). Every https link the call's tools returned (bassem_intel, janna_lookup,
     platform_item results) is remembered; a link in a message he sends is replaced by the remembered link of the same host it is closest
     to; a foreign link that matches nothing is not sent at all (the platform's own pages pass as they are). */
  var URLS = {}, URLS_N = 0;
  /* a link as it goes into a message or an e-mail: percent-encoded — janna_lookup's lean answer (POST from Anam) gives open_url decoded, Arabic
     letters and all, so the model copies it right (speed review 2026-11-20 #12); an encoded link stays as it is */
  function enc(u) { u = String(u == null ? "" : u); if (!/[^\x21-\x7e]/.test(u)) return u; try { return encodeURI(decodeURI(u)); } catch (e) { try { return encodeURI(u); } catch (x) { return u; } } }
  function urlsKeep(x) {
    var s = ""; try { s = typeof x === "string" ? x : JSON.stringify(x); } catch (e) { return; }
    var m = String(s || "").replace(/\\\//g, "/").match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    for (var i = 0; i < m.length && URLS_N < 800; i++) { var u = m[i].replace(/[),.;:\]]+$/, ""); if (!URLS[u]) { URLS[u] = 1; URLS_N++; } }
  }
  function urlHost(u) { var m = /^https?:\/\/([^\/?#]+)/i.exec(u); return m ? m[1].toLowerCase().replace(/^www\./, "") : ""; }
  function urlDist(a, b, max) { /* Levenshtein distance, stops early past max */
    var n = a.length, m = b.length, i, j, prev = [], cur, best;
    if (Math.abs(n - m) > max) return max + 1;
    for (j = 0; j <= m; j++) prev[j] = j;
    for (i = 1; i <= n; i++) {
      cur = [i]; best = i;
      for (j = 1; j <= m; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[m];
  }
  function urlsFix(msg) {
    return String(msg || "").replace(/(https?:\/\/|www\.)[^\s<>"'«»]+/gi, function (u0) {
      var u = u0.replace(/[),.;:\]]+$/, ""), tail = u0.slice(u.length), k, d, lim, best = "", bd = 1e9, h;
      if (/^www\./i.test(u)) u = "https://" + u;
      if (URLS[u]) return enc(u) + tail;
      h = urlHost(u);
      for (k in URLS) {
        if (!URLS.hasOwnProperty(k) || urlHost(k) !== h) continue;
        lim = Math.max(3, Math.round(k.length * 0.04)); d = urlDist(u, k, lim);
        if (d <= lim && d < bd) { bd = d; best = k; }
      }
      if (best) return enc(best) + tail;
      if (h === "madeinegyptgate.com") return enc(u) + tail;
      return T("(الرابط الرسمي موجود على صفحة الفرصة في المنصة)", "(the official link is on the opportunity's page on the platform)") + tail;
    });
  }
  /* «ابعتلي» (bassem_notify_member — a CLIENT tool, awaitResult off): the note + up to 3 opportunities of THIS call (notifyRefs: the call's
     tools' results and the shared screen, read once the server tools still running in this turn are done — inflWait) → POST
     /api/advisor/notify {message, channel, items?} with the call's own sign-in (sendPost, 60 s: the official files are downloaded one after
     another from the buyers' sites, ≤ 36 s in all). The platform adds each one's details, its links and its official file from its own data
     (worker/src/notify-items.js). A member's notify with opportunities runs one at a time (429 notify_busy while the one before is still
     going: sent again a few seconds later, ≤ 40 s). What really went is shown (notifyDone) and told to Bassem for his next turn (tellBassem,
     SDK calls) — «مرفق» only when the platform says it attached the file. No opportunity → today's note */
  /* the shared screen's opportunity. A platform tender page names its tender by its list key (MIG_CTX.id, shared by several tenders:
     OFF:6/2026/2027 ×3 — review F3 / R4): when a tool of this call returned the same tender (the same title), its own id is the one sent,
     and the screen's copy leaves the list (the same tender twice would cancel its own words in notifyRefs) */
  function notifyScreenKey() {
    var k = "", c, t, i; try { k = screenOppKey(); } catch (e) { k = ""; }
    if (k.indexOf("item:") === 0) {
      c = screenCtx(); if (!c || !/tender/.test(String(c.type || ""))) return ""; /* a factory page is no opportunity */
      t = mwords(c.title).join(" ");
      if (t) for (i = 0; i < OPPC.length; i++) if (OPPC[i].k !== k && OPPC[i].k.indexOf("item:") === 0 && mwords(OPPC[i].o.title).join(" ") === t) {
        k = OPPC[i].k;
        for (i = 0; i < OPPC.length; i++) if (OPPC[i].k === "item:" + c.id) { OPPC.splice(i, 1); break; }
        return k;
      }
    }
    return k;
  }
  function notifyGo(name, a) {
    var msg = urlsFix(String(a.message || "").trim()), chn = /^(whatsapp|email|both)$/.test(a.channel) ? a.channel : "both", t0 = Date.now(), refs = [], body;
    if (!msg) { refuse(name, "refused", T("قولّي الرسالة اللي عايزني أبعتهالك.", "Tell me the message you want me to send you.")); return; }
    doing(T("ببعتلك الرسالة", "sending you the message"));
    /* 429 notify_busy: the member's notify before this one is still going — the same body again a few seconds later */
    function send(n) {
      return sendPost(body, "/advisor/notify", 60000).then(function (x) {
        if (!(x && x.status === 429 && x.j && x.j.code === "notify_busy") || n >= 6 || Date.now() - t0 > 40000) return x;
        return new Promise(function (res) { setTimeout(res, Math.max(2, Math.min(10, +x.j.retry_after || 5)) * 1000); }).then(function () { return send(n + 1); });
      });
    }
    inflWait(4000).then(function () {
      var sk = "", c, st = "";
      try { screenOpp(); } catch (e) {}
      try { sk = notifyScreenKey(); c = sk.indexOf("item:") === 0 ? screenCtx() : null; st = c && c.title ? String(c.title).slice(0, 300) : ""; } catch (e) { sk = ""; }
      try { refs = notifyRefs(OPPC, sk, msg, a.ids, heardTexts().slice(-2).join(" ")); } catch (e) { refs = []; }
      /* the screen's tender goes with its page's title: the platform picks among the tenders that share its number by it (review R4) */
      body = refs.length ? { message: msg, channel: chn, items: refs.map(function (r) { return r === sk && st ? { ref: r, title: st } : r; }) } : { message: msg, channel: chn };
      return send(0);
    }).then(function (x) { notifyDone(name, x, refs.unused); }, function () { notifyDone(name, { status: 0, j: { code: "offline" } }, refs.unused); });
  }
  /* [AR, EN]: «الملف الرسمي مرفق» / «الملفين الرسميين مرفقين» / «3 ملفات رسمية مرفقة» */
  function nFiles(n) { return n === 1 ? ["الملف الرسمي مرفق", "the official file is attached"] : n === 2 ? ["الملفين الرسميين مرفقين", "the 2 official files are attached"] : [n + " ملفات رسمية مرفقة", "the " + n + " official files are attached"]; }
  /* a reason as the member reads it and Bassem hears it: no link (he never reads one aloud — review R9) */
  function noUrl(s) { return String(s || "").replace(/\s*[—:-]?\s*(?:https?:\/\/|www\.)\S+/gi, "").replace(/\s{2,}/g, " ").replace(/^\s+|\s+$/g, ""); }
  /* a title for Bassem: no quotes or brackets, cut at a word boundary (review R9) */
  function clipW(s, n) {
    s = String(s || "").replace(/["«»<>\[\]{}]/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (s.length <= n) return s;
    var c = s.slice(0, n), sp = c.lastIndexOf(" ");
    return (sp > n * 0.5 ? c.slice(0, sp) : c).replace(/[\s,.;:،؛\-–—(]+$/, "") + "…";
  }
  /* the platform's answer {status, j} → what the member reads; the outcome of the tool; what Bassem is told. unused = Bassem's ids that are
     not among this call's results (review R2) */
  function notifyDone(name, x, unused) {
    var j = (x && x.j) || {}, st = x ? x.status : 0, s0 = j.sent || {}, pend = j.pending || {}, its = j.items && j.items.length ? j.items : [], att = +j.attached || 0, i, it, ch, waTpl, extra = "", nf, whys = [], whyKeys = [], miss = 0, skip = 0, un = unused && unused.length ? unused : [];
    if (st === 200) {
      /* outside WhatsApp's 24-hour window the server sends only a notice template (pending.whatsapp): the message itself follows when the member replies */
      waTpl = !!pend.whatsapp || s0.whatsapp === "template";
      ch = [s0.email ? T("الإيميل", "e-mail") : "", s0.whatsapp && s0.whatsapp !== "template" ? T("الواتساب", "WhatsApp") : ""].filter(Boolean);
      for (i = 0; i < its.length; i++) {
        it = its[i] || {};
        if (it.found && it.file && it.file.attached && it.file.skipped) skip++;
        if (it.found && it.file && !it.file.attached && it.file.reason !== "kind") { miss++; if (it.file.why && whyKeys.indexOf(String(it.file.why.ar)) < 0) { whyKeys.push(String(it.file.why.ar)); whys.push(it.file.why); } }
      }
      /* review R9: the file is «in the e-mail» (never «with it» when WhatsApp went too); one reason only when every file that did not come shares it */
      if (s0.email && att > 0) {
        nf = skip ? (att === 1 ? ["فيه ملف مرفق", "a file is attached"] : att === 2 ? ["فيه ملفين مرفقين", "2 files are attached"] : ["فيه " + att + " ملفات مرفقة", att + " files are attached"]) : nFiles(att);
        extra = T(" — و" + nf[0] + " في الإيميل", " — " + nf[1] + " to the e-mail") + (miss || skip ? T("، وفيه ملفات مااترفقتش — السبب مكتوب في الإيميل", "; some files were not attached — the e-mail says why") : "");
      } else if (s0.email && miss) extra = whys.length === 1 ? T(" — بالتفاصيل واللينكات؛ " + (miss > 1 ? "الملفات الرسمية مااترفقتش: " : "الملف الرسمي مااترفقش: ") + noUrl(whys[0].ar), " — with the details and links; " + (miss > 1 ? "the official files were not attached: " : "the official file was not attached: ") + noUrl(whys[0].en))
        : T(" — بالتفاصيل واللينكات؛ الملفات الرسمية مااترفقتش — سبب كل واحد مكتوب في الإيميل", " — with the details and links; the official files were not attached — the e-mail says why for each one");
      if (un.length && (ch.length || waTpl)) extra += T(" — من غير تفاصيل فرصة مش من نتايج المكالمة دي", " — without the details of an opportunity that is not among this call's results");
      sayAny(ch.length ? "✅ " + T("اتبعتت على ", "Sent by ") + ch.join(T(" و", " and ")) + extra + (waTpl ? T(" — وعلى الواتساب وصلك تنبيه، والرسالة نفسها هتوصلك هناك أول ما ترد على الواتساب", " — and a WhatsApp notice reached you; the message itself follows there as soon as you reply on WhatsApp") : "") : waTpl ? "✅ " + T("وصلك تنبيه على الواتساب، والرسالة نفسها هتوصلك هناك أول ما ترد عليه.", "A WhatsApp notice reached you; the message itself follows there as soon as you reply.") : "⚠️ " + T("الرسالة مااتبعتتش على أي قناة.", "The message was not sent on any channel."));
      if (ch.length || waTpl) done(name); else outcome(name, "failed", "not sent on any channel");
    } else if (j.code === "timeout") refuse(name, "failed", "⏳ " + T("مش متأكد إنها اتبعتت — المنصة مارديتش في الوقت. بص على إيميلك قبل ما تطلبها تاني.", "Not sure it was sent — the platform did not answer in time. Check your inbox before asking again."));
    else if (j.code === "notify_busy") refuse(name, "failed", "⏳ " + T("مااتبعتتش: رسالة قبلها لسه بتتبعت. اطلبها تاني بعد دقيقة.", "Not sent: the message before it is still being sent. Ask again in a minute."));
    else refuse(name, "failed", "⚠️ " + T("مااتبعتتش: ", "Not sent: ") + errMsg({ code: j.code || (st ? "http_" + st : "offline"), error: j.error, status: st }));
    tellBassem(notifyWords(x, un));
  }
  /* what Bassem is told (his next turn): only what the platform answered — the channels, and per opportunity whether its file went and why
     not (never a link); nothing per opportunity when nothing went (review R9); Bassem's ids that were not used, and what to do (review R2) */
  function notifyWords(x, unused) {
    var j = (x && x.j) || {}, st = x ? x.status : 0, s0 = j.sent || {}, pend = j.pending || {}, its = j.items || [], ar = [], en = [], i, it, t, w, f, sk, la, le, un = unused || [];
    var chA = [s0.email ? "الإيميل" : "", s0.whatsapp && s0.whatsapp !== "template" ? "الواتساب" : ""].filter(Boolean), chE = [s0.email ? "e-mail" : "", s0.whatsapp && s0.whatsapp !== "template" ? "WhatsApp" : ""].filter(Boolean);
    if (st !== 200) return j.code === "timeout" ? T("نتيجة «ابعتلي»: مش متأكد إنها اتبعتت، المنصة مارديتش في الوقت. قوله كده، وماتبعتهاش تاني قبل ما يبص على إيميله.", "Result of «send to me»: not sure it was sent, the platform did not answer in time. Tell him so, and do not send it again before he checks his inbox.")
      : j.code === "notify_busy" ? T("نتيجة «ابعتلي»: مااتبعتتش لسه، لأن رسالة قبلها لسه بتتبعت. قوله كده، وابعتها تاني بـ bassem_notify_member بعد دقيقة.", "Result of «send to me»: not sent yet, the message before it is still being sent. Tell him so, and send it again with bassem_notify_member in a minute.")
      : T("نتيجة «ابعتلي»: مااتبعتتش (" + String(j.code || j.error || st || "offline").slice(0, 60) + "). قوله كده بصراحة.", "Result of «send to me»: not sent (" + String(j.code || j.error || st || "offline").slice(0, 60) + "). Tell him so honestly.");
    ar.push(chA.length ? "اتبعتت على " + chA.join(" و") : pend.whatsapp ? "وصله تنبيه على الواتساب، والرسالة نفسها هتوصله هناك أول ما يرد" : "مااتبعتتش على أي قناة");
    en.push(chE.length ? "sent by " + chE.join(" and ") : pend.whatsapp ? "a WhatsApp notice reached him; the message itself follows when he replies" : "not sent on any channel");
    if (chA.length && pend.whatsapp) { ar.push("وعلى الواتساب وصله تنبيه بس لحد ما يرد"); en.push("on WhatsApp only a notice until he replies"); }
    for (i = 0; (chA.length || pend.whatsapp) && i < its.length && i < 3; i++) {
      it = its[i] || {}; t = clipW(it.title, 50); f = it.file || {}; w = (it.found ? f.why : it.why) || {};
      if (!it.found) { ar.push("الفرصة " + (i + 1) + ": مااتبعتش تفاصيلها (" + noUrl(w.ar || it.reason || "") + ")"); en.push("opportunity " + (i + 1) + ": no details sent (" + noUrl(w.en || it.reason || "") + ")"); }
      else if (f.attached && f.skipped) {
        /* review R1: another file of the notice came, not the main one */
        sk = f.skipped; la = f.label && f.label.ar ? f.label.ar : "ملف من ملفاتها"; le = f.label && f.label.en ? "the " + f.label.en : "one of its files";
        ar.push("\"" + t + "\": تفاصيلها ولينكاتها، واترفق " + la + " بس — و" + (sk.label && sk.label.ar ? sk.label.ar : "ملف تاني ليها") + " مااترفقش (" + noUrl(sk.why && sk.why.ar || sk.reason || "") + "، واللينك بتاعه في الإيميل)");
        en.push("\"" + t + "\": its details and links, and only " + le + " was attached — " + (sk.label && sk.label.en ? "the " + sk.label.en : "another of its files") + " was not (" + noUrl(sk.why && sk.why.en || sk.reason || "") + "; its link is in the e-mail)");
      }
      else if (f.attached) { ar.push("\"" + t + "\": تفاصيلها ولينكاتها والملف الرسمي اترفق في الإيميل"); en.push("\"" + t + "\": its details, links and official file are in the e-mail"); }
      else { ar.push("\"" + t + "\": تفاصيلها ولينكاتها" + (f.reason === "kind" ? "" : "، والملف مااترفقش (" + noUrl(w.ar || f.reason || "") + ")")); en.push("\"" + t + "\": its details and links" + (f.reason === "kind" ? "" : "; the file was not attached (" + noUrl(w.en || f.reason || "") + ")")); }
    }
    if (un.length) {
      ar.push("الـ id «" + un.join("، ") + "» مش من نتايج المكالمة دي، فالإيميل راح من غير تفاصيل" + (un.length > 1 ? "هم" : "ها") + " — لو عايز تبعتها، هاتها الأول بأداتها بالـ id ده (bassem_intel بـ action item، أو platform_item) وبعدين ابعت تاني");
      en.push("the id «" + un.join(", ") + "» is not among this call's results, so the e-mail went without its details — to send it, first fetch it with its tool by that id (bassem_intel with action item, or platform_item), then send again");
    }
    return T("نتيجة «ابعتلي»: " + ar.join("؛ ") + ". قول للعضو اللي حصل ده بس.", "Result of «send to me»: " + en.join("; ") + ". Tell the member only what happened.");
  }
  function bassemTool(name, a) {
    var A = window.MIGAPI;
    /* the member's factory profile (POST /api/advisor/profile) — never routed to advisor.html. In the SDK call the registered handler
       saves it and answers Bassem (sdkRun); the widget cannot answer a tool, so there it is saved without a result */
    if (name === "bassem_save_profile") { if (LV && !LV.closed && LV.own && LV.own.bassem_save_profile) return; profileTool(a); return; }
    if (name === "bassem_notify_member") { notifyGo(name, a); return; }
    if (name === "bassem_set_work_time") {
      var pr = {}; ["morning_time", "session_time", "days", "call_today_at", "pause", "wa_optin", "email_digest"].forEach(function (k) { if (a[k] != null && a[k] !== "") pr[k] = a[k]; });
      if (!pr.morning_time && a.time) pr.morning_time = a.time;
      doing(T("بظبط ميعاد شغلنا", "setting our work time"));
      if (!Object.keys(pr).length) { refuse(name, "refused", T("قولّي الميعاد اللي يناسبك (مثلاً 09:30).", "Tell me the time that suits you (e.g. 09:30).")); return; }
      (A && A.prefs ? A.prefs(pr) : post("/me/prefs", pr)).then(function (j) { var q = (j && j.prefs) || pr; var said = [pr.morning_time && q.morning_time ? T("رسالة الصبح ", "morning message ") + q.morning_time : "", pr.session_time != null && q.session_time ? T("ميعاد شغلنا اليومي ", "our daily work time ") + q.session_time : "", q.call_today_at && pr.call_today_at ? T("لينك مكالمتنا النهارده هيوصلك الساعة ", "today's call link reaches you at ") + String(q.call_today_at).slice(-5) : "", pr.pause != null ? (q.pause ? T("الرسايل موقوفة", "messages paused") : T("الرسايل شغالة", "messages on")) : ""].filter(Boolean);
        sayAny("✅ " + T("اتسجّل", "Saved") + (said.length ? ": " + said.join(" · ") : "")); done(name); },
        function (e) { refuse(name, "failed", "⚠️ " + T("مااتسجّلش: ", "Not saved: ") + errMsg(e)); });
      return;
    }
    /* the e-mail tools (draft on the screen, send FROM THE PLATFORM): mailTool. In the SDK call its awaitResult handlers (sdkRun) run it
       and answer Bassem — the DOM path leaves those calls to them (me.own); the widget cannot answer a tool, so here it only shows */
    if (name === "bassem_draft_email" || name === "bassem_send_email") { if (LV && !LV.closed && LV.own && LV.own[name]) return; mailTool(name, a); return; }
    if (!BCMD_OK[name]) return; /* a tool this file does not know (e.g. a new one whose file did not load) never opens a deal */
    onAdvisor(name, a, function (d) {
      if (name === "bassem_open_opportunity") {
        doing(T("بدوّر على الفرصة", "looking for the opportunity"));
        advSearch(d, [a.query, a.market, a.kind].filter(Boolean).join(" ") || a.query || "", function (card) {
          if (!card && a.market) { advSearch(d, a.query || "", function (c2) { openCard(c2); }); return; } openCard(card);
        });
        function openCard(card) { if (!card) { refuse(name, "refused", T("مالقيتش فرصة مفتوحة بالوصف ده في نطاق باقتك.", "No open opportunity matches that within your plan's markets.")); return; } glow(card); var h = card.querySelector("[data-how]"); if (h) h.click(); sayAny("📂 " + ((card.querySelector("h3") || {}).textContent || "")); done(name); }
        return;
      }
      if (name === "bassem_start_deal") {
        doing(T("ببدأ الصفقة", "starting the deal"));
        var go2 = function (card) {
          if (!card) { refuse(name, "refused", T("مالقيتش الفرصة دي — قولّي اسمها أو الجهة.", "I couldn't find that opportunity — tell me its title or buyer.")); return; }
          glow(card); var b = card.querySelector("[data-start]") || card.querySelector("[data-open]"); if (!b) { outcome(name, "failed", "no start button on the card"); return; } b.click();
          waitFor(d, "#advPlan", function (f) {
            if (!f) { refuse(name, "failed", T("الصفقة مااتفتحتش — جرّب تاني.", "The deal did not open — please try again.")); return; }
            var ch = false; if (a.next_action) { setIn(d, "#advNA", a.next_action); ch = true; } if (a.due_date) { setIn(d, '#advPlan [name="due_date"]', a.due_date); ch = true; }
            if (ch) { var sb = f.querySelector('[type="submit"]'); if (sb) sb.click(); }
            done(name);
          });
        };
        if (a.query) advSearch(d, a.query, go2); else go2(d.querySelector(".opc"));
        return;
      }
      if (name === "bassem_open_guide") {
        doing(T("بفتحلك دليل التعاقد", "opening the contracting guide"));
        var dr = d.querySelector("#advDr");
        if (dr && !dr.hidden && d.querySelector('#advDr [data-dtab="guide"]') && !a.topic) { tab(d, "guide", "#advDr .pn-b", function () { done(name); }); return; }
        advSearch(d, a.topic || "", function (card) { var h = card && card.querySelector("[data-how]"); if (!h) { refuse(name, "refused", T("مالقيتش دليل للموضوع ده.", "No guide found for that topic.")); return; } glow(card); h.click(); done(name); });
        return;
      }
      openDealIn(d, a.deal, function (ok) {
        if (!ok) { refuse(name, "refused", T("مالقيتش الصفقة دي في صفقاتك — ابدأها الأول من الفرصة.", "I couldn't find that deal — start it from the opportunity first.")); return; }
        if (name === "bassem_update_deal") {
          doing(T("بحدّث الصفقة", "updating the deal"));
          tab(d, "over", "#advPlan", function () {
            if (a.stage) { var sg = d.querySelector("#advStg"); if (sg && sg.value !== a.stage && [].some.call(sg.options, function (o) { return o.value === a.stage; })) setIn(d, "#advStg", a.stage, ["change"]); }
            setTimeout(function () {
              var f = d.querySelector("#advPlan"); if (!f) { done(name); return; }
              var ch = false, due = a.due_date || a.reminder_date;
              if (a.next_action) { setIn(d, "#advNA", a.next_action); ch = true; }
              if (due) { setIn(d, '#advPlan [name="due_date"]', due); ch = true; }
              if (a.note || (a.reminder_date && a.due_date)) { var nt = f.querySelector('[name="notes"]'); if (nt) { nt.value = (nt.value ? nt.value + "\n" : "") + new Date().toISOString().slice(0, 10) + ": " + (a.note || "") + (a.reminder_date && a.due_date ? " (" + T("تذكير", "reminder") + " " + a.reminder_date + ")" : ""); glow(nt); ch = true; } }
              if (ch) { var sb = f.querySelector('[type="submit"]'); if (sb) sb.click(); }
              done(name);
            }, a.stage ? 700 : 50);
          });
          return;
        }
      });
    });
  }
  /* a Bassem command handed over from another page of THIS tab: advisor.html#bcmd=<one-time key>. The command itself waits in this tab's
     sessionStorage ("mig-bcmd", written by onAdvisor a moment ago); a key that does not match, an old entry (> 2 min), a tool outside
     BCMD_OK or a command written into the link itself (old #bcmd=<json> links) is ignored. */
  (function () {
    var m = /[#&]bcmd=([^&]+)/.exec(location.hash || ""); if (!m || pageKey(window) !== "advisor") return;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    var c = null; try { c = JSON.parse(sessionStorage.getItem("mig-bcmd") || "null"); sessionStorage.removeItem("mig-bcmd"); } catch (e) {}
    if (!c || !/^[a-f0-9]{24}$/.test(m[1]) || c.n !== m[1] || !(Date.now() - (+c.at || 0) < 120000) || !BCMD_OK[c.t]) return;
    setTimeout(function () { run(c.t, c.a || {}); }, 900);
  })();

  /* ---------- meetings (Janna-hosted) ---------- */
  function api(method, path, body, opts) {
    var off = function () { var e = new Error("offline"); e.offline = true; throw e; };
    return fetch(API + path, { method: method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, keepalive: !!(opts && opts.keepalive), credentials: "same-origin" }).then(function (r) {
      /* the static preview has no API: anything that is not JSON from the Worker counts as offline */
      if ((r.headers.get("content-type") || "").indexOf("application/json") < 0) off();
      return r.json().then(function (j) { if (!r.ok) { var e = new Error((j && j.error) || "HTTP " + r.status); e.status = r.status; throw e; } return j; });
    }, off);
  }
  /* Turnstile token for POST /api/meetings and /start ("" when not configured or unavailable: the Worker then decides) */
  function human() {
    if (!TS_KEY) return Promise.resolve("");
    return new Promise(function (res) {
      var box = null, fin = function (t) { if (fin.d) return; fin.d = 1; if (box) setTimeout(function () { box.remove(); }, 400); res(t || ""); };
      setTimeout(fin, 20000);
      var go = function () {
        try {
          box = document.createElement("div"); box.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483002"; document.body.appendChild(box);
          window.turnstile.render(box, { sitekey: TS_KEY, appearance: "interaction-only", language: EN ? "en" : "ar", callback: fin, "error-callback": function () { fin(""); }, "expired-callback": function () { fin(""); } });
        } catch (e) { fin(""); }
      };
      if (window.turnstile) go();
      else { var sc = document.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.onload = go; sc.onerror = function () { fin(""); }; document.head.appendChild(sc); }
    });
  }
  var validEmail = function (e) { return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(String(e || "")); };
  var digits = function (s) { return String(s == null ? "" : s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 1776); }); };
  var z2 = function (n) { return (n < 10 ? "0" : "") + n; };
  /* Egypt time (Africa/Cairo, +02 / +03 in summer) */
  function cParts(ms) { var p = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }; }
  function cOff(ms) { var p = cParts(ms); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000); }
  function cairoToUtc(date, time) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""), t = /^(\d{2}):(\d{2})$/.exec(time || ""); if (!d || !t) return null;
    var naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]), ms = naive - cOff(naive - 7200000) * 60000; ms = naive - cOff(ms) * 60000;
    var p = cParts(ms); return p.y === +d[1] && p.mo === +d[2] && p.d === +d[3] && p.h === +t[1] && p.mi === +t[2] ? ms : null;
  }
  function isoCairo(ms) { var p = cParts(ms), o = cOff(ms), a = Math.abs(o); return p.y + "-" + z2(p.mo) + "-" + z2(p.d) + "T" + z2(p.h) + ":" + z2(p.mi) + ":00" + (o < 0 ? "-" : "+") + z2(Math.floor(a / 60)) + ":" + z2(a % 60); }
  function stamp(ms) { var p = cParts(ms); return "" + p.y + z2(p.mo) + z2(p.d) + "T" + z2(p.h) + z2(p.mi) + "00"; }
  function fmtCairo(ms) { try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + T(" (بتوقيت القاهرة)", " (Egypt time)"); } catch (e) { return isoCairo(ms); } }
  function normDate(v) {
    var s = digits(v).trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) return m[1] + "-" + z2(+m[2]) + "-" + z2(+m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return m[3] + "-" + z2(+m[2]) + "-" + z2(+m[1]);
    return "";
  }
  function normTime(v) {
    var s = digits(v).trim().toLowerCase(), m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحاً|مساء|مساءً|بالليل|الضهر|العصر)?$/.exec(s); if (!m) return "";
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] || "";
    if (/^(pm|p\.m\.|م|مساء|مساءً|بالليل|العصر)$/.test(ap) && h < 12) h += 12;
    if (/^(am|a\.m\.|ص|صباحا|صباحاً)$/.test(ap) && h === 12) h = 0;
    if (ap === "الضهر" && h < 11) h += 12;
    return h < 24 && mi < 60 ? z2(h) + ":" + z2(mi) : "";
  }
  function icsEsc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function icsFor(ms, id) {
    var mu = id ? SITE.replace(/\/$/, "") + (CLEAN ? "/meeting/#" : "/meeting.html#") + id : "", now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var sum = T("اجتماع تعريفي مع جنة — منصة صنع في مصر", "Introductory meeting with Janna — Made in Egypt Gate");
    var desc = mu ? T("ادخل الاجتماع من هنا: ", "Join here: ") + mu : T("الموعد لسه مااتأكدش على المنصة.", "The time is not confirmed on the platform yet.");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Made in Egypt Gate//Janna meetings//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE", "TZID:Africa/Cairo", "BEGIN:STANDARD", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:EET", "DTSTART:20231026T235959", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1TH", "END:STANDARD",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:EEST", "DTSTART:20230428T000000", "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR", "END:DAYLIGHT", "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:" + (id ? "meeting-" + id : "req-" + ms + "-" + Math.random().toString(36).slice(2, 8)) + "@madeinegyptgate.com", "DTSTAMP:" + now,
      "DTSTART;TZID=Africa/Cairo:" + stamp(ms), "DTEND;TZID=Africa/Cairo:" + stamp(ms + 30 * 60000),
      "SUMMARY:" + icsEsc(sum), "DESCRIPTION:" + icsEsc(desc), mu ? "URL:" + mu : "", mu ? "LOCATION:" + icsEsc(mu) : "", "ORGANIZER;CN=Janna:mailto:meetings@madeinegyptgate.com",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "DESCRIPTION:" + icsEsc(sum), "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n") + "\r\n";
  }
  var icsHref = function (ms, id) { return "data:text/calendar;charset=utf-8," + encodeURIComponent(icsFor(ms, id)); };

  /* meeting mode inside the overlay */
  function panel() { return ov && ov.querySelector(".jnl-mt"); }
  function startMeeting(o) {
    if (!ov) return;
    var prev = MT && MT.pre && !MT.done && o.kind === "instant" && !o.pre ? MT : null; /* the meeting card's meeting, now with the details */
    if (MT && MT.timer) clearInterval(MT.timer);
    MT = { kind: o.kind, pre: !!o.pre, id: o.id || "", name: String(o.name || "").slice(0, 80), email: String(o.email || "").trim().slice(0, 254), consent: !!o.consent, agenda: prev ? prev.agenda : {}, offline: false, done: false, t0: prev ? prev.t0 : Date.now(), warned: prev ? prev.warned : false, msg: "", user: prev ? prev.user : 0, startP: null, sess: !!SID || !!(prev && prev.sess) };
    ov.classList.add("mtg");
    var p = panel(); p.hidden = false;
    p.innerHTML = '<div class="jm-h"><b>' + T("اجتماع تعريفي مع جنة", "Introductory meeting with Janna") + '</b><span class="jm-rec"><i></i><span></span></span><span class="jm-tm">00:00</span><span class="jm-warn" hidden>' + T("باقي دقيقتين", "2 minutes left") + '</span></div>'
      + '<div class="jm-who"></div><div class="jm-cap">⏱️ ' + T("الجلسة مفتوحة لحد ما تخلص", "The session stays open until you finish") + '</div>'
      + '<ul>' + AGENDA.map(function (a) { return '<li data-k="' + a[0] + '"><label><input type="checkbox" data-k="' + a[0] + '"> <span>' + T(a[1], a[2]) + '</span></label></li>'; }).join("") + '</ul><div class="jm-st" role="status" aria-live="polite"></div>';
    p.querySelector("ul").addEventListener("change", function (e) { var k = e.target.getAttribute("data-k"); if (MT && k) { MT.agenda[k] = e.target.checked ? 1 : 0; e.target.closest("li").classList.toggle("done", e.target.checked); } });
    renderWho(); renderRec();
    [].forEach.call(p.querySelectorAll("li[data-k]"), function (li) { var k = li.getAttribute("data-k"); if (MT.agenda[k]) { li.classList.add("done"); li.querySelector("input").checked = true; } });
    MT.timer = setInterval(tick, 1000); tick();
    if (MT.pre) { status(sessT0 ? T("قول لجنة اسمك وبريدك، وهل توافق على تسجيل الاجتماع — وهي تبدأه.", "Tell Janna your name and e-mail, and whether you agree to the meeting being recorded — she starts it.") : T("اضغط «ابدأ الكلام مع جنة» — هتسألك عن اسمك وبريدك، وموافقتك على التسجيل، وتبدأ الاجتماع.", "Press “Start talking to Janna” — she asks for your name, your e-mail and your consent to recording, then starts the meeting.")); return; }
    if (o.kind === "instant") {
      if (o.activity || o.company) mark("intro");
      if (!MT.consent) { status(T("الاجتماع ده مش بيتسجّل، لأن التسجيل محتاج موافقتك.", "This meeting is not recorded: recording needs your consent.")); return; }
      if (!validEmail(MT.email)) { status(T("محتاجين بريدك الإلكتروني علشان نبعتلك التسجيل والملخص.", "We need your email to send you the recording and summary.")); return; }
      var m = MT;
      m.startP = human().then(function (tok) { return api("POST", "/start", { name: m.name, email: m.email, phone: o.phone || "", company: o.company || "", activity: o.activity || "", markets: o.markets || "", language: o.language || (EN ? "en" : "ar"), consent: true, session_id: SID || undefined, started_at: new Date(sessT0 || m.t0).toISOString(), turnstile_token: tok || undefined }); })
        .then(function (j) { m.id = j.id; if (MT === m && !m.done) status(T("الاجتماع بيتسجّل، وهيوصلك التسجيل والملخص على ", "Recording; the recording and summary will be sent to ") + m.email, true); },
          function (e) { if (e.offline) { m.offline = true; if (MT === m && !m.done) status(T("سيتم إرسال التسجيل بعد تفعيل السيرفر", "The recording will be sent once the server is activated")); } else if (MT === m && !m.done) status(T("تعذّر حفظ الاجتماع على السيرفر: ", "Could not save the meeting on the server: ") + e.message); });
    } else status(sessT0 ? "" : T("اضغط «ابدأ الكلام مع جنة» علشان نبدأ الاجتماع", "Press “Start talking to Janna” to begin the meeting"));
    if (o.kind === "scheduled" && SID) joinMeeting();
  }
  function renderWho() { var p = panel(); if (!p || !MT) return; p.querySelector(".jm-who").innerHTML = "👤 " + (MT.name ? "<bdi>" + esc(MT.name) + "</bdi>" : T("زائر", "Guest")) + (MT.email ? " · <bdi>" + esc(MT.email) + "</bdi>" : MT.kind === "scheduled" ? " · " + T("اجتماع محجوز", "booked meeting") : ""); }
  function renderRec() {
    var p = panel(); if (!p || !MT) return; var r = p.querySelector(".jm-rec"), live = MT.kind === "instant" || !!sessT0;
    r.classList.toggle("off", !MT.consent || MT.done);
    r.querySelector("span").textContent = MT.done ? T("انتهى الاجتماع", "Meeting ended") : MT.pre ? T("التسجيل بموافقتك بس", "Recorded only with your consent") : !MT.consent ? T("بدون تسجيل", "Not recorded") : live ? T("جاري التسجيل", "Recording") : T("التسجيل يبدأ مع الجلسة", "Recording starts with the session");
  }
  function status(msg, ok) { var p = panel(); if (!p) return; var s = p.querySelector(".jm-st"); s.textContent = msg || ""; s.classList.toggle("ok", !!ok); }
  function tick() {
    var p = panel(); if (!p || !MT) return;
    var base = sessT0 || (MT.kind === "instant" && !MT.pre ? MT.t0 : 0), sec = base ? Math.max(0, Math.floor((Date.now() - base) / 1000)) : 0;
    p.querySelector(".jm-tm").textContent = z2(Math.floor(sec / 60)) + ":" + z2(sec % 60);
    if (sec >= WARN_SEC && !MT.warned && !MT.done) { MT.warned = true; p.querySelector(".jm-warn").hidden = false; say(T("⏳ باقي دقيقتين على نهاية الجلسة", "⏳ 2 minutes left in this session")); }
  }
  function mark(k) { if (!MT || MT.done || MT.agenda[k]) return; MT.agenda[k] = 1; var p = panel(), li = p && p.querySelector('li[data-k="' + k + '"]'); if (li) { li.classList.add("done"); li.querySelector("input").checked = true; } }
  function agendaFromTool(name, a) {
    if (!MT) return;
    if (name === "janna_navigate") mark(a.page === "about" || a.page === "legal" ? "platform" : a.page === "register" ? "plan" : "tour");
    else if (/^janna_(search|fill_rfq|fill_contact)$/.test(name)) mark("tour");
    else if (name === "janna_fill_registration") { mark("plan"); mark("register"); }
  }
  function onMessage(d) {
    if (d && (d.role === "agent" || d.role === "persona")) holoTopic(String(d.content || ""));
    if (d && d.role === "user") heardAdd("", String(d.content || "")); /* the e-mail tools: what he said (a dictated address) */
    if (!MT || MT.done) return; var c = String(d.content || "");
    if (d.role === "user") { MT.user++; if (c.length > 12) mark("intro"); if (/[?؟]/.test(c)) mark("questions"); return; }
    if (/الجمعية المصرية للتنمية الصناعية|الجهة المشغ|بتديرها|تديرها|operated by|operator|EAFID/i.test(c)) mark("platform");
    if (/باسم|Bassem|باقة|الباقة|الباقات|\bplans?\b/i.test(c)) mark("plan");
  }
  function joinMeeting() {
    var m = MT; if (!m || m.kind !== "scheduled" || !m.id) return;
    api("POST", "/" + m.id + "/join", { session_id: SID || undefined, consent: m.consent }).then(function (j) {
      m.joined = true;
      if (j && typeof j.consent === "boolean") { m.consent = j.consent; if (MT === m) renderRec(); } /* the server's answer is what will happen */
      if (MT === m && !m.done) status(m.consent ? T("الاجتماع بيتسجّل، وهيوصلك التسجيل والملخص على بريدك المسجّل", "Recording; the recording and summary will be sent to your registered email") : T("الاجتماع مش بيتسجّل: هيوصلك ملخص مكتوب من بياناتك ومحاور الاجتماع على بريدك المسجّل", "Not recorded: a written summary of your details and the agenda will be sent to your registered email"), true);
    }, function (e) {
      if (e.offline) { m.offline = true; if (MT === m && !m.done) status(T("سيتم إرسال التسجيل بعد تفعيل السيرفر", "The recording will be sent once the server is activated")); }
      else if (MT === m && !m.done) status(e.status === 409 && /early/.test(e.message) ? T("لسه بدري على الاجتماع، تقدر تدخل قبل الموعد بـ 15 دقيقة.", "It's too early: you can join from 15 minutes before the start.") : e.status === 410 ? T("وقت الاجتماع ده خلص.", "This meeting's time has passed.") : T("تعذّر تسجيل دخولك للاجتماع على السيرفر: ", "Could not register your joining on the server: ") + e.message);
    });
  }
  function onSession() { if (!MT || MT.done) return; MT.sess = true; renderRec(); tick(); if (MT.pre) status(T("قول لجنة اسمك وبريدك، وهل توافق على تسجيل الاجتماع — وهي تبدأه.", "Tell Janna your name and e-mail, and whether you agree to the meeting being recorded — she starts it.")); if (MT.kind === "scheduled") { status(""); joinMeeting(); } }
  function onSessionEnd() { if (MT && !MT.done) finishMeeting("ended"); sessT0 = 0; }
  function finishMeeting(reason) {
    var m = MT; if (!m || m.done) return; m.done = true; clearInterval(m.timer);
    var agenda = AGENDA.map(function (a) { return a[0]; }).filter(function (k) { return m.agenda[k]; });
    var body = { session_id: SID || undefined, ended_at: new Date().toISOString(), agenda_done: agenda };
    var mail = m.email || T("بريدك المسجّل", "your registered email"), offMsg = T("سيتم إرسال التسجيل بعد تفعيل السيرفر", "The recording will be sent once the server is activated");
    var ok = function () { return m.consent ? T("هيوصلك تسجيل الاجتماع وملخصه على ", "You'll receive the meeting recording and summary at ") + mail : T("هيوصلك ملخص الاجتماع على ", "You'll receive the meeting summary at ") + mail; };
    var canSend = m.kind === "scheduled" || (m.consent && validEmail(m.email));
    /* a booked meeting only counts once Janna's session started; otherwise nothing is recorded or sent — say so */
    var notStarted = T("الاجتماع ما بدأش، فمفيش تسجيل ولا ملخص. تقدر تدخل تاني بنفس اللينك في ميعاد الاجتماع.", "The meeting didn't start, so there is no recording or summary. You can rejoin with the same link at the meeting time.");
    var started = m.kind !== "scheduled" || m.sess;
    var neutral = function (msg) { m.msg = msg; if (MT === m) status(msg); if (m.noteEl) m.noteEl.textContent = msg; };
    if (m.pre && !m.sess && !sessT0) { m.msg = ""; renderRec(); return; }
    m.msg = !canSend ? T("انتهى الاجتماع، شكراً على وقتك!", "The meeting has ended. Thank you for your time!") : !started ? notStarted : m.offline ? offMsg : ok();
    renderRec(); status(m.msg, canSend && started && !m.offline);
    if (!canSend || !started) return;
    var send = function () {
      if (!m.id) return;
      if (reason === "unload" && navigator.sendBeacon) { try { navigator.sendBeacon(API + "/" + m.id + "/finish", JSON.stringify(body)); } catch (e) {} return; }
      api("POST", "/" + m.id + "/finish", body, { keepalive: true }).then(function () { if (!m.offline) return; m.offline = false; m.msg = ok(); if (MT === m) status(m.msg, true); },
        function (e) {
          if (e.offline) { m.offline = true; neutral(offMsg); }
          else if (e.status === 409 && /not live/.test(e.message)) neutral(notStarted); /* the server never saw the meeting start */
          else neutral(T("تعذّر حفظ نهاية الاجتماع على السيرفر: ", "Could not save the end of the meeting on the server: ") + e.message);
        });
    };
    if (m.startP) m.startP.then(send, send); else send();
  }
  window.addEventListener("pagehide", function () { if (MT && !MT.done) finishMeeting("unload"); });
  /* leaving the page ends the SDK call at once (the widget's session ends with the page) */
  window.addEventListener("pagehide", function () { if (LV && !LV.closed) sdkStop("unload"); });
  function meetingTool(a) {
    var consent = a.recording_consent === true || a.recording_consent === "true";
    if (MT && !MT.done && !MT.pre) { if (a.name && !MT.name) MT.name = String(a.name).slice(0, 80); if (a.email && !MT.email && MT.kind === "instant") MT.email = String(a.email).trim(); renderWho(); if (a.activity) mark("intro"); return; }
    startMeeting({ kind: "instant", name: a.name, email: a.email, phone: a.phone, company: a.company, activity: a.activity, markets: Array.isArray(a.markets) ? a.markets.join("، ") : a.markets, language: a.language, consent: consent });
    say(T("🎥 بدأنا الاجتماع التعريفي", "🎥 Introductory meeting started"));
  }

  /* janna_schedule_meeting → POST /api/meetings + confirmation card on Janna's screen */
  function scheduleTool(a) {
    var date = normDate(a.date), time = normTime(a.time), ms = date && time ? cairoToUtc(date, time) : null;
    var d = { name: String(a.name || "").slice(0, 80), email: String(a.email || "").trim(), phone: String(a.phone || ""), company: String(a.company || ""), topic: String(a.topic || ""), language: /^en/i.test(a.language || "") ? "en" : /^ar/i.test(a.language || "") ? "ar" : (EN ? "en" : "ar"), date: date, time: time };
    if (ms == null) { card({ error: T("التاريخ أو الوقت مش واضح، جنة هتأكده معاك (مثلاً 2026-12-01 الساعة 14:00 بتوقيت القاهرة).", "The date or time is unclear; Janna will confirm it with you (e.g. 2026-12-01 at 14:00 Egypt time)."), d: d }); return; }
    if (ms < Date.now() + 10 * 60000) { card({ error: T("الموعد لازم يكون بعد 10 دقايق على الأقل من دلوقتي.", "The meeting must be at least 10 minutes from now."), d: d, ms: ms }); return; }
    d.starts_at = isoCairo(ms);
    say(T("📅 بحجزلك الاجتماع…", "📅 Booking your meeting…"));
    human().then(function (tok) { if (tok) d.turnstile_token = tok; return api("POST", "", d); }).then(function (j) { delete d.turnstile_token; card({ ok: true, id: j.id, url: j.url, ms: Date.parse(j.starts_at) || ms, d: d }); },
      function (e) { delete d.turnstile_token; card({ offline: !!e.offline, error: e.offline ? "" : apiErr(e), ms: ms, d: d }); });
  }
  function apiErr(e) {
    var m = String(e.message || "");
    if (e.status === 429) return T("في طلبات حجز كتير للبريد ده النهارده — جرّب تاني بكرة، أو كلّم جنة لايف دلوقتي.", "Too many booking requests for this email today — try again tomorrow, or talk to Janna live now.");
    if (/email/i.test(m)) return T("البريد الإلكتروني مش صحيح.", "The email address is not valid.");
    if (/future|60 days|date/i.test(m)) return T("الموعد لازم يكون خلال الـ 60 يوم الجايين.", "The meeting must be within the next 60 days.");
    if (/links/i.test(m)) return T("الاسم لازم يكون اسمك بس، من غير لينكات أو عناوين.", "The name must be just your name, without links or addresses.");
    if (/name/i.test(m)) return T("محتاجين اسمك.", "We need your name.");
    if (/verification/i.test(m)) return T("محتاجين نتأكد إنك مش برنامج آلي، جرّب تاني.", "We need to verify you're not a bot; please try again.");
    return T("تعذّر الحجز دلوقتي: ", "Could not book right now: ") + m;
  }
  function card(o) {
    var scr = ov && ov.querySelector(".jnl-scr"); if (!scr) return;
    var old = scr.querySelector(".jnl-card"); if (old) old.remove();
    var c = document.createElement("div"); c.className = "jnl-card"; c.dir = EN ? "ltr" : "rtl"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", T("حجز اجتماع", "Meeting booking"));
    var d = o.d || {}, when = o.ms ? fmtCairo(o.ms) : (d.date || "") + " " + (d.time || ""), h = "";
    var waTeam = "https://wa.me/" + WA_TEAM + "?text=" + encodeURIComponent(T("مرحباً، عايز أحجز اجتماع تعريفي أونلاين مع جنة (منصة صنع في مصر).", "Hello, I'd like to book an online introductory meeting with Janna (Made in Egypt Gate).") + "\n" + T("الاسم: ", "Name: ") + (d.name || "") + "\n" + T("البريد: ", "Email: ") + (d.email || "") + (d.phone ? "\n" + T("الموبايل: ", "Phone: ") + d.phone : "") + (d.company ? "\n" + T("الشركة: ", "Company: ") + d.company : "") + "\n" + T("الموعد المقترح: ", "Preferred time: ") + when + (d.topic ? "\n" + T("الموضوع: ", "Topic: ") + d.topic : ""));
    var mailto = "mailto:" + TEAM_MAIL + "?subject=" + encodeURIComponent(T("طلب اجتماع تعريفي مع جنة", "Introductory meeting request with Janna")) + "&body=" + encodeURIComponent(decodeURIComponent(waTeam.split("?text=")[1]));
    if (o.ok) {
      var share = "https://wa.me/?text=" + encodeURIComponent(T("اجتماعي التعريفي مع جنة على منصة صنع في مصر: ", "My introductory meeting with Janna on Made in Egypt Gate: ") + when + "\n" + o.url);
      h = '<h4>✅ ' + T("اتحجز اجتماعك مع جنة", "Your meeting with Janna is booked") + '</h4><div class="jc-when">' + esc(when) + '</div><div class="jc-sm">' + esc(T("هيوصلك إيميل فيه اللينك ودعوة التقويم", "You'll get an email with the link and a calendar invitation")) + (d.email ? ' — <bdi>' + esc(d.email) + '</bdi>' : "") + '</div>'
        + '<div class="jc-acts"><a class="jc-p" download="meeting-with-janna.ics" href="' + esc(icsHref(o.ms, o.id)) + '">📅 ' + T("أضف للتقويم", "Add to calendar") + '</a><a class="jc-wa" target="_blank" rel="noopener" href="' + esc(share) + '">💬 ' + T("شارك على واتساب", "Share on WhatsApp") + '</a><a target="_blank" rel="noopener" href="' + esc(withLang(url("meeting.html#" + o.id))) + '">🔗 ' + T("صفحة الاجتماع", "Meeting page") + '</a></div>';
    } else {
      h = (o.offline ? '<h4>📅 ' + T("طلب اجتماع مع جنة", "Meeting request with Janna") + '</h4>' : '<h4 class="jc-er">⚠️ ' + T("لسه ما اتحجزش", "Not booked yet") + '</h4>')
        + (o.error ? '<div>' + esc(o.error) + '</div>' : "") + (o.ms ? '<div class="jc-when">' + esc(when) + '</div>' : "")
        + '<div class="jc-sm">' + (o.offline ? T("الحجز الأونلاين مش متاح دلوقتي (سيرفر المنصة مش متوصل)، فالاجتماع مااتحجزش. تقدر تكلّم جنة لايف دلوقتي، أو تحجز تاني بعد شوية.", "Online booking is not available right now (the platform's server is not connected), so the meeting was NOT booked. You can talk to Janna live now, or book again later.") : T("الاجتماع مااتحجزش. صحّح البيانات وجرّب تاني، أو كلّم جنة لايف دلوقتي.", "The meeting was not booked. Correct the details and try again, or talk to Janna live now.")) + '</div>';
    }
    c.innerHTML = '<button type="button" class="jc-cx" aria-label="' + T("إغلاق", "Close") + '">✕</button>' + h;
    c.querySelector(".jc-cx").onclick = function () { c.remove(); };
    scr.appendChild(c);
  }
  window.JANNA_LIVE = { intents: ["meeting"], bassem: bassemTool, open: open, close: close, run: run, finish: function () { finishMeeting("manual"); },
    meeting: function () { return MT ? { id: MT.id, kind: MT.kind, name: MT.name, email: MT.email, consent: MT.consent, offline: MT.offline, done: MT.done, session_id: SID, agenda: AGENDA.map(function (a) { return a[0]; }).filter(function (k) { return MT.agenda[k]; }), msg: MT.msg } : null; },
    persona: function () { return persona; }, cairo: { toUtc: cairoToUtc, fmt: fmtCairo, iso: isoCairo },
    /* how the open call runs: "sdk" (our own call, no third-party mark) or "widget"; live() = the SDK call's state */
    mode: function () { return ov ? (sdkBox() ? "sdk" : "widget") : liveMode(); },
    live: function () { return LV ? { state: LV.st, session_id: LV.sid, ready: LV.ready, muted: LV.muted, text_only: LV.textOnly, max_session_sec: LV.max, part: LV.chain ? LV.chain.n + 1 : 1, chain_max: CHAIN_MAX } : null; } };
  /* the open call's shared screen shows a same-site page (data/bassem-intel-view.js: the Information Center filtered like his search) */
  /* it never replaces a screen that holds work (the deal room, an edited form: an unsent e-mail draft would be lost) unless the
     member asked for it himself (o.force: the «افتحها على الشاشة» button) */
  window.JANNA_LIVE.show = function (u, o) { u = String(u || ""); if (!frame || !ov || ov.hidden || !/^\/(?!\/)[^\s"'<>\\]*$/.test(u)) return false; if (!(o && o.force) && screenBusy()) return false; go(u); return true; };
  window.JANNA_LIVE.screenBusy = screenBusy;
  /* a holo card's result tapped by the member (data/call-holo.js): its page on the shared screen, as the page opens an item itself
     (itemShow: this site's paths only) — never over work on the screen (screenWork: the deal room, a form being filled; then Bassem's own
     tab, else a new tab; screenBusy would send almost every list page to a new tab: its script-filled selects) — and on stacked layouts
     the call scrolls to the screen like «الشاشة». The tap counts as the screen's last move (MV0, the 2.5 s rule): a lookup answering
     right after it does not take away what he chose. This tab never leaves the call. */
  window.JANNA_LIVE.showCard = function (u) {
    u = String(u || ""); if (!frame || !ov || ov.hidden || !/^\/(?!\/)[^\s"'<>\\]*$/.test(u)) return false;
    if (screenWork()) { var a = absUrl(u); if (!a) return false; if (persona === "bassem") openTab(a.href); else extTab(a.href); return true; }
    MV0 = Date.now(); go(u);
    var sw = ov.querySelector(".jnl-hd .sw"); if (sw) sw.classList.remove("new");
    if (stackedNow()) { var s2 = ov.querySelector(".jnl-scr"); if (s2) try { s2.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { s2.scrollIntoView(); } }
    return true;
  };
  /* is the persona speaking (her text still streaming, or her voice still playing it: contWire's estimate)? data/call-holo.js keeps its
     cards up while she talks about them */
  window.JANNA_LIVE.speaking = function () { var s = LV && !LV.closed && LV.spk; return !!(s && (s.on || Date.now() < (s.until || 0))); };
  /* «باسم معاك»: isOpen() = a call is open in this tab (Bassem's tab asks its opener); openTab(u) = a page out of Bassem's call in a tab of
     its own (data/bassem-intel-view.js «افتحها في صفحة جديدة»); welcomeBack() = the member came back from that tab (its bar): on a phone the
     video comes back into view */
  window.JANNA_LIVE.isOpen = function () { return !!(ov && !ov.hidden); };
  window.JANNA_LIVE.openTab = function (u) { return persona === "bassem" && ov ? openTab(u) : null; };
  window.JANNA_LIVE.welcomeBack = function () {
    if (!ov || ov.hidden) return false;
    if (stackedNow()) { try { ov.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { ov.scrollTop = 0; } }
    say(T("أهلاً بيك تاني — كمّل كلامك مع باسم", "Welcome back — carry on with Bassem"));
    return true;
  };
  window.JANNA_LIVE.knownEmail = knownEmail;
  /* the e-mail tools' helpers (debugging in the browser console; the same functions worker/test/bassem-email.test.mjs runs) */
  window.JANNA_LIVE.mail = { spoken: spokenMail, spell: mailSpell, source: mailSource, lang: mailLang };
  window.JANNA_LIVE.visitorId = visitorId; /* data/bassem-memory.js: Janna's call memory goes with this id */
  window.JANNA_LIVE.rotateVisitor = rotateVisitor; /* data/bassem-memory.js: a 409 visitor_linked → a new id (review 2026-11-19 #7) */
  /* the last call's start, in ms after the «ابدأ» tap (tmMark): {persona, server: the Worker's Server-Timing, token, sdk, mic, stream,
     connected, ready, video, play, voice} — null before the first call */
  window.JANNA_LIVE.timing = function () { return TM ? tmOut(TM) : null; };
  /* «وضع الدوشة»: noise() = the guard's state; noise(true | false) switches noisy-room mode (this call only) */
  /* 🌐 lang() = {current, def, stored, applied, warn}; lang(code) = the person's choice (tests, the console) */
  window.JANNA_LIVE.lang = function (code) { if (code != null && code !== "") langSet(code); return { current: callLang(), def: langDef(), stored: langStored(), applied: LG.applied, warn: LG.warn }; };
  window.JANNA_LIVE.noise = function (on) {
    if (on === true || on === false) nzSet(on, "api");
    var z = LV && LV.nz;
    return { on: NZ.on, why: NZ.why, false_interruptions: NZ.fis.length, last: NZ.last, offer: Date.now() < NZ.offerUntil, gate: !!(z && z.gate), eos: z ? z.eos : null, eos_applied: !!(z && z.eosOk), server_warning: (z && z.warn) || "", meter: !!(z && z.meterOk), mic: (LV && LV.micUsed) || "", mic_error: (LV && LV.micErr) || "",
      near: { measured: !!(z && z.nearEver), now: !!(z && z.nearOk), opens: NZ.near, not_speech: NZ.nearMiss, k: NZ_NEAR, self: NZ_SELF, his: NZ.his, level: z ? z.lv : -1, room: z ? z.room : 0, threshold: z ? z.thr : 0 }, missed_by_anam: NZ.missed };
  };
})();
