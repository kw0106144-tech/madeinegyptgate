/* janna-welcome.js — the visitor-facing Janna is the REAL Janna (owner 2026-11-18): she STANDS at the bottom-left edge of every public page
   as a cut-out person (no box, no background), alive with her real Anam idle motion; when the visitor taps her she talks IN PLACE with
   her real voice and lip-sync (pre-rendered Anam clips of the live persona), with a speech bubble beside her holding the words and her
   three actions. Owner 2026-11-18 (later): «كبر حجمها شويه وخليها في كل الصفحات» → bigger: --jw-w = 23.8vw within 280–440 px on desktop
   (325 px at 1366, was 260), 178 px on phones (was 150) — on the app pages AND the generated SEO pages (hubs, sectors, governorates,
   company profiles, tenders, news …), Arabic and English.
   - Media: packed-alpha H.264 MP4s (colour on top, alpha as grey below: img/janna/welcome/janna-cut-*.mp4) composited into a <canvas> —
     on a real GPU with WebGL (one texture upload and one draw per frame, almost no main-thread time; a software WebGL is not used),
     else in 2D with a per-pixel pass (about 5 ms a frame: her idle motion then runs at ~12 fps, timer-paced) — so they play everywhere
     incl. iOS Safari. Nothing loads before window load + an idle moment (videos preload="none" until played); prefers-reduced-motion /
     Save-Data (or no canvas / H.264) → the still cut-out PNG, tap still works. No sound before a tap. Her idle video pauses while she is
     aside, out, held or the tab is hidden, and she rests (stands still on her loop's start frame, nothing decoded or drawn) after ~20 s
     without the visitor scrolling, pointing, touching or typing — the next sign of the visitor and she moves again.
   - Her words per page: section() gives each section the clip whose spoken line fits it, else the general «home» line. English pages
     (/en/…, or the app in English) have no voice and keep her idle motion (their box shows her invitation only); never lip movement
     without her voice (a blocked autoplay shows «🔊» instead of a silent clip).
   - Actions: 🎥 JANNA_LIVE.open({persona:"janna"}) (janna-live.js takes the EN persona when MIGLANG is "en"), 💬 JANNA.restore(false),
     📝 JANNA.register(). Generated pages carry no Janna until asked: the actions load her from window.SEO_ASK_SRC like the «اسأل جنة»
     pill (#seoAsk, hidden while she stands), with the page's language pinned for i18n.js; failing that 📝 opens /register/. The chosen
     action waits for janna.js to start and is never lost on the way. Afterwards the page's own «اسأل جنة» buttons ([data-ask]) still work:
     #seoAsk stays enabled (marked done) and opens janna.js's card.
     💬 / 📝 hand the page to janna.js (her chat bubble hangs on janna.js's own figure): the cut-out steps out and comes back when the chat
     is minimised. One Janna at a time: she steps out only for a janna.js conversation the visitor can see (its bubble, its expanded card or
     stage, its tour spotlight); when janna.js merely puts its figure back by itself (its welcome card, hidden while she stands, closes on
     the first scroll or field focus) it is sent to its corner button at once, so the two never swap. Bassem (signed-in members, html.bs-on)
     replaces her; the phone menu (html.nav-open) covers her; members' tools stay QUIET and /advisor/ is Bassem's desk; never inside a
     frame (Janna's live «screen»).
   - Owner 2026-11-18, the invitation box («هيفرق ازاي انها بتتكلم ولا يظهر جنبها بوكس … اضغط علي …»): her box beside her is an explicit
     invitation, «أهلاً وسهلاً يا فندم! 👋 أنا جنة، مسؤولة التسجيل …» (EN "Welcome! 👋 I'm Janna …"), over one big full-width
     «🎥 اضغط هنا ونتكلم» button (the 🎥 call, ≥ 44 px; the click itself is the browser's gesture) with 💬 / 📝 smaller below. Its words
     follow her voice: while she says a clip (Arabic only) they are that clip's words (captions), otherwise the invitation; when a clip
     ends or is stopped the invitation comes back and the big button pulses a few times (not under reduced motion). It opens by itself
     once per tab session (sessionStorage "jw-invited"), on the first page she stands on: Arabic tries her line with sound first, and a
     refusal shows the invitation at once with «🔊 اسمع صوتي» and her voice on the first tap anywhere. On later pages only her voice opens
     it: an Arabic line not yet said in this tab is tried and the box opens with its captions only if it really plays (refused → nothing,
     no gesture armed); English → nothing. Closed by the visitor (✕, Esc, a tap on her) → never by itself again in that tab ("jw-shut").
     A tap on her while «🔊» waits plays her line instead of closing the box. Her captions, lip-sync and red dot start only when her voice
     really plays; a clip that makes no progress for ~8 s or that the browser pauses (media keys, a call, the back/forward cache) ends her
     try (a resume from outside is stopped): the invitation again («🔊» again if she had not begun). The box goes aside with her (a field
     she stands over, a page dialog), and a first tap on such a field is no gesture for her voice. A double click / tap on her or on «🔊»
     neither closes the box nor lands on the page under it (the used «🔊» keeps its place). Site data blocked → only a page reached from
     outside the site opens it by itself.
   - She slides aside while a form control under her is focused or a page dialog is open (also when she comes back from janna.js); her
     hint waits while the visitor is in a field. At the end of a page the footer keeps her corner free (site_footer's .ftr-end inset and
     height are set to her real size here); under a footer without that room she slides aside at the end of a long page (desktop) and
     comes back when the visitor scrolls up. Clicks pass through everything but her head; on phones she stands on top of a fixed bottom
     bar. Error pages tag the script with data-jw="error" (general line). QA: JANNA_WELCOME.alphaAt(x, y) / .state(). ES5, no deps. */
(function () {
  "use strict";
  if (window.__jannaWelcome) return; window.__jannaWelcome = 1;
  var W = window, D = document, DE = D.documentElement;
  try { if (W.top !== W) return; } catch (e0) { return; }
  if (W.JANNA_EMBED || W.JANNA_KIOSK) return;
  /* «باسم معاك» (owner 2026-11-19 «لما بفتح المناقصة اللي باسم فاتحا بتفتح صفحة تانيه فيها جنة والمفروض ان باسم بس هو اللي بيكمل»): a
     page that came out of Bassem's live call (data/janna-live.js openTab: window.name «mig-bassem-<ms>», ?with=bassem; sessionStorage
     "mig-wb" for the tab's next pages, 4 h at most) is HIS — she does not stand, greet or invite there, the «اسأل جنة» pill and buttons
     are hidden, and the bar back to the call comes (data/bassem-tab.js). The same test and the same hidden widgets as janna-live.js. */
  var WB_CSS = "body [class^='jn-'],body [class*=' jn-'],body [class^='jw-'],body [class*=' jw-'],body .bs-fig,body .bs-mini,body .bs-bub,body .bs-wel,body .bst-st,body .bst-sb,body .bst-hint,body .jnl-btn,body .sanad,body .sanad-btn,body .sanad-tip,#seoAsk,body .ask-btn,body [data-ask]{display:none!important}"
    + "@supports selector(:has(a)){body .ci:has([data-ask]){display:none!important}}";
  function wbOn() {
    var now = new Date().getTime(), t = 0, s = 0, m = null;
    if (W.MIG_WB === true || W.MIG_WB === false) return W.MIG_WB;
    try { m = /^mig-bassem-(\d{12,14})$/.exec(String(W.name || "")); } catch (e) {}
    if (m) t = +m[1];
    if (/[?&]with=bassem(?:&|$)/.test(location.search)) {
      if (!t) t = now;
      try { history.replaceState(history.state, "", location.pathname + location.search.replace(/([?&])with=bassem(&|$)/, function (x, a, b) { return b ? a : ""; }).replace(/[?&]$/, "") + location.hash); } catch (e) {}
    }
    try { s = +W.sessionStorage.getItem("mig-wb") || 0; if (t > s) W.sessionStorage.setItem("mig-wb", String(t)); } catch (e) {}
    if (!t) t = s;
    W.MIG_WB = t > 0 && now - t < 144e5 && now - t > -6e4;
    return W.MIG_WB;
  }
  function wbStart() {
    DE.classList.add("mig-wb");
    if (!D.getElementById("mig-wb-css")) { var s = D.createElement("style"); s.id = "mig-wb-css"; s.textContent = WB_CSS; (D.head || DE).appendChild(s); }
    if (W.MIG_WB_TAB || D.querySelector("script[data-wb]")) return;
    var me = D.currentScript, v = me && me.src ? /[?&]v=([\w.-]+)/.exec(me.src) : null;
    var sc = D.createElement("script"); sc.src = "/data/bassem-tab.js" + (W.MIGVER_WB || (v ? "?v=" + v[1] : "")); sc.async = true; sc.charset = "utf-8"; sc.setAttribute("data-wb", "1");
    (D.head || DE).appendChild(sc);
  }
  if (wbOn()) { wbStart(); return; }
  var PATH = location.pathname || "/";
  /* members' tools and Janna's own pages stay quiet; /advisor/ is Bassem's (he stands there); deploy 2: the invoice payment page /pay/
     (no figure over the invoice and «ادفع الآن») and the Control Center /admin/ */
  var QUIET = /^\/(dashboard|inbox|advisor|meeting|seo-admin|seo-team|data-desk|panel|login|janna|track|pay|admin)(\/|\.html|$)/;
  if (QUIET.test(PATH)) return;
  var ME = D.currentScript, PKIND = ME && ME.getAttribute ? ME.getAttribute("data-jw") || "" : "";
  var EN = String(W.MIGLANG || DE.getAttribute("lang") || "ar").slice(0, 2).toLowerCase() === "en";
  var BASE = "/img/janna/welcome/";
  /* her real voice (Egyptian Arabic): clip file + the words she says in it */
  var CLIPS = {
    home: ["home", "أهلاً بيك في منصة صنع في مصر! أنا جنة. تحب أدوّرلك على مصنع، ولا منتج، ولا مناقصة؟"],
    factories: ["factories", "ده دليل المصانع والشركات المصرية. قولّي بتدوّر على إيه ومنين، وأنا أطلعلك المصانع المناسبة."],
    market: ["market", "دي منتجات المصانع المصرية الأعضاء في المنصة. لو عجبك منتج، أبعتلك طلب عرض سعر للمصنع على طول."],
    /* owner 2026-11-18 «شيل كلمة من المصادر الرسمية»: tenders2 = the same Anam clip with that phrase cut out (new file name: the
       30-day cache of janna-cut-tenders.mp4 must not serve the old words under the new caption) */
    tenders: ["tenders2", "هنا المناقصات والفرص. قولّي نشاطك، وأنا أوريك المناسب ليك وآخر ميعاد للتقديم."],
    register: ["register", "عايز تسجّل شركتك في المنصة؟ أنا معاك خطوة بخطوة، وأقولك الباقة المناسبة ليك."],
    contact: ["contact", "لو محتاج تكلّمنا، أنا هنا. قولّي محتاج إيه، وأنا أوصّل رسالتك لفريق المنصة على طول."]
  };
  /* which line fits the page: the factory directory (hub, search, sectors, sector × governorate, governorates) → factories; a company
     profile, the suppliers / contractors lists, zones, offers (shop flyers), RFQs, awards, projects, news, events … → the general line */
  function section() {
    if (PKIND === "error") return "home";
    var mp = String(W.MIGPAGE || "").replace(/\.html?$/, "");
    var p = PATH.replace(/^\/en(?=\/|$)/, "").replace(/index\.html?$/, "");
    var seg = p.split("/"), a = String(seg[1] || "").replace(/\.html?$/, "").toLowerCase(), b = String(seg[2] || "").toLowerCase();
    var k = mp || a, ctx = W.MIG_CTX && W.MIG_CTX.type;
    if (k === "register" || k === "legal") return "register";
    if (k === "contact" || k === "about") return "contact";
    if (k === "market" || k === "products" || k === "industrial_products") return "market";
    if (k === "tenders" || k === "tender-item") return "tenders";
    if (k === "governorates") return b === "explore" ? "home" : "factories";
    if (k === "factories") return ctx === "company" ? "home" : "factories";
    return "home";
  }
  var KEY = section(), CLIP = EN ? null : CLIPS[KEY] || null;
  /* inv: her invitation (the box's words whenever she is not speaking); call: the big button, callT its title (a voice & video call) */
  var S = EN ? {
    tag: "Janna · Registration officer", hit: "Talk to Janna, registration officer", hide: "Hide Janna", dlg: "Janna · Registration officer (AI assistant)",
    inv: "Welcome! 👋 I'm Janna, the registration officer at Made in Egypt Gate. Would you like to talk, so I can explain everything about the platform?",
    call: "🎥 Click here to talk with me", callT: "Voice & video call with Janna", chat: "💬 Chat", reg: "📝 Register your factory", x: "Close", wait: "⏳ One moment…",
    hint: "Ask me 👋 I'll help you find the factory, product or tender you need",
    oops: "Sorry, I couldn't open that just now. Please try again in a moment."
  } : {
    tag: "جنة · مسؤولة التسجيل", hit: "كلّم جنة، مسؤولة التسجيل", hide: "إخفاء جنة", dlg: "جنة · مسؤولة التسجيل (مساعِدة بالذكاء الاصطناعي)",
    inv: "أهلاً وسهلاً يا فندم! 👋 أنا جنة، مسؤولة التسجيل في منصة صنع في مصر. تحب نتكلم وأشرحلك كل حاجة عن المنصة؟",
    call: "🎥 اضغط هنا ونتكلم", callT: "مكالمة صوت وصورة مع جنة", chat: "💬 اكتبلي", reg: "📝 سجّل مصنعك", x: "إغلاق", snd: "🔊 اسمع صوتي", wait: "⏳ لحظة…",
    hint: "اسألني 👋 أساعدك تلاقي المصنع أو المنتج أو المناقصة اللي محتاجها",
    oops: "معلش، مقدرتش أفتحها دلوقتي. جرّب تاني كمان شوية."
  };
  var DIR = EN ? "ltr" : "rtl";
  var PHONE_MQ = "(max-width:640px),(max-height:520px)";
  var css = ""
    /* the standing cut-out: no box, no background; she stands at the page's bottom-left edge (cut by the screen bottom) */
    + "html{--jw-w:325px}@supports (width:clamp(1px,1vw,2px)){html{--jw-w:clamp(280px,23.8vw,440px)}}"
    + ".jw-st{position:fixed;z-index:2147480400;left:0;bottom:0;bottom:var(--jw-b,0px);width:325px;height:282px;width:var(--jw-w);height:calc(var(--jw-w)*.8667);pointer-events:none;margin:0;padding:0;"
    + "transform:translateX(-110%);transition:transform 1s cubic-bezier(.2,.85,.25,1.08),opacity .2s}"
    + ".jw-st.in{transform:none}.jw-st.in.away,.jw-st.out,.jw-st.in.out{transform:translateX(-110%)}.jw-st.ghost{opacity:.22}"
    + ".jw-st canvas,.jw-st .jw-pos{position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;display:block;margin:0}"
    + ".jw-st .jw-pos{transition:opacity .25s}.jw-st.live .jw-pos{opacity:0}"
    + ".jw-st video{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;pointer-events:none}"
    + ".jw-st .jw-gr{position:absolute;left:6%;right:6%;bottom:calc(var(--jw-w)*-.062);height:calc(var(--jw-w)*.13);border-radius:50%;"
    + "background:radial-gradient(ellipse at center,rgba(2,6,23,.38) 0,rgba(2,6,23,.16) 45%,rgba(2,6,23,0) 72%)}"
    /* only her head and neck take the tap: clicks on her shoulders reach the page under her */
    + ".jw-cl{position:absolute;top:6%;left:5%;z-index:3;width:30px;height:30px;padding:0;margin:0;border-radius:50%;border:1px solid rgba(255,255,255,.75);background:rgba(8,20,32,.66);color:#fff;font:700 15px/28px system-ui,sans-serif;text-align:center;cursor:pointer;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.35);opacity:.85;transition:opacity .2s,transform .2s}"
    + ".jw-cl:hover,.jw-cl:focus-visible{opacity:1;transform:scale(1.08)}.jw-cl:focus-visible{outline:3px solid #22b8e0;outline-offset:2px}"
    + "@media (max-width:640px){.jw-cl{width:26px;height:26px;font-size:13px;line-height:24px;top:4%;left:4%}}"
    + ".jw-hit{position:absolute;left:31%;right:25%;top:8%;bottom:28%;pointer-events:auto;cursor:pointer;border:0;background:transparent;padding:0;margin:0;"
    + "min-height:0;box-shadow:none;border-radius:46% 46% 40% 40%;-webkit-tap-highlight-color:transparent}"
    + ".jw-nt{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);white-space:nowrap;pointer-events:none;"
    + "background:rgba(15,23,42,.84);color:#fff;font:700 12px/1.2 Cairo,Tajawal,Tahoma,sans-serif;padding:5px 11px;border-radius:999px;box-shadow:0 4px 12px rgba(2,6,23,.3)}"
    + ".jw-aib{display:inline-block;margin-inline-start:4px;padding:0 4px;border-radius:5px;background:#22b8e0;color:#04202a;font:800 9.5px/15px Tahoma,sans-serif}"
    + ".jw-nt:before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-inline-end:6px;vertical-align:middle;box-shadow:0 0 0 2px rgba(34,197,94,.3)}"
    + ".jw-st.talk .jw-nt:before{background:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,.35)}"
    + "@keyframes jwIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}"
    /* her short hint, beside her head */
    + ".jw-hint{position:fixed;z-index:2147480450;left:248px;bottom:196px;left:calc(var(--jw-w)*.763);bottom:calc(var(--jw-b,0px) + var(--jw-w)*.603);max-width:240px;box-sizing:border-box;margin:0;background:#fff;color:#0f172a;"
    + "border-radius:16px 16px 16px 4px;padding:10px 14px;font:600 13px/1.6 Cairo,Tajawal,Tahoma,sans-serif;box-shadow:0 10px 28px rgba(2,6,23,.22);animation:jwIn .35s ease both;cursor:pointer}"
    /* the speech bubble beside her (never over her face) */
    + ".jw-sb{position:fixed;z-index:2147480500;left:288px;bottom:70px;width:340px;left:calc(var(--jw-w)*.886);bottom:calc(var(--jw-b,0px) + var(--jw-w)*.215);width:min(340px,calc(100vw - var(--jw-w)*.886 - 16px));box-sizing:border-box;margin:0;padding:0;"
    + "background:#fff;color:#0f172a;border-radius:18px 18px 18px 6px;box-shadow:0 16px 44px rgba(2,6,23,.28);font-family:Cairo,Tajawal,Tahoma,sans-serif;text-align:start;"
    + "animation:jwIn .3s cubic-bezier(.2,.8,.25,1) both}"
    + ".jw-sb:before{content:'';position:absolute;left:-9px;bottom:30px;border:10px solid transparent;border-left:0;border-right-color:#fff;filter:drop-shadow(-2px 1px 1px rgba(2,6,23,.08))}"
    + ".jw-sb .jw-txt{display:grid;align-items:center;margin:0;padding:12px 16px 2px 36px;font-size:14px;line-height:1.75;font-weight:600;color:#0f172a}"
    + ".jw-sb[dir=ltr] .jw-txt{padding:12px 36px 2px 16px}"
    /* her words: the invitation and (Arabic) the captions of her clip share one place, so the box keeps its size when they swap */
    + ".jw-sb .jw-txt>span{grid-area:1/1}.jw-sb.cap .jw-iv,.jw-sb:not(.cap) .jw-cc{visibility:hidden}"
    + ".jw-sb .jw-acts{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:8px 12px 12px}"
    + ".jw-sb .jw-acts button{flex:1 1 auto;margin:0;min-height:0;border:0;border-radius:12px;padding:7px 10px;font:700 12.5px/1.4 Cairo,Tajawal,Tahoma,sans-serif;cursor:pointer;"
    + "background:#eef2f7;color:#0f172a;box-shadow:none;text-transform:none;letter-spacing:0}"
    /* the invitation's answer: one big call button on its own row (the strongest thing in the box), chat and register smaller below */
    + ".jw-sb .jw-acts .jw-call{flex:1 0 100%;min-height:46px;padding:10px 14px;border-radius:14px;font-size:15.5px;font-weight:800;line-height:1.35;"
    + "background:linear-gradient(135deg,#0ea5c6,#22b8e0);color:#04202a;box-shadow:0 6px 18px rgba(14,165,198,.38)}"
    + ".jw-sb .jw-acts .jw-call:hover{filter:brightness(1.06)}.jw-sb .jw-acts .jw-reg{background:#fdecef;color:#b00d27}"
    /* when she has finished speaking: a gentle pulse on the call button (three soft rings) */
    + "@keyframes jwPu{0%{box-shadow:0 6px 18px rgba(14,165,198,.38),0 0 0 0 rgba(34,184,224,.6)}35%{transform:scale(1.02)}"
    + "70%{box-shadow:0 6px 18px rgba(14,165,198,.38),0 0 0 12px rgba(34,184,224,0);transform:none}100%{box-shadow:0 6px 18px rgba(14,165,198,.38),0 0 0 0 rgba(34,184,224,0)}}"
    + ".jw-sb .jw-acts .jw-call.jw-pu{animation:jwPu 1.6s ease-out 3}"
    + ".jw-sb .jw-acts button[aria-busy=true]{opacity:.8;cursor:progress}"
    + ".jw-sb .jw-x{position:absolute;top:6px;left:6px;right:auto;width:26px;height:26px;min-height:0;margin:0;padding:0;border-radius:50%;border:0;"
    + "background:#eef2f7;color:#334155;font:13px/26px Tahoma,sans-serif;text-align:center;cursor:pointer;box-shadow:none}"
    + ".jw-sb[dir=ltr] .jw-x{left:auto;right:6px}"
    + ".jw-sb .jw-snd{display:inline-block;margin:10px 14px 0;min-height:0;border:0;border-radius:999px;background:#c8102e;color:#fff;font:600 12px/1.4 Cairo,Tahoma,sans-serif;padding:6px 12px;cursor:pointer}"
    + ".jw-sb .jw-snd[hidden]{display:none}.jw-sb .jw-snd.jw-used{visibility:hidden}"
    /* she is aside (a field she stands over, a page dialog): her box goes with her */
    + ".jw-sb.jw-aw{visibility:hidden}"
    + ".jw-sb .jw-acts button:focus-visible,.jw-sb .jw-x:focus-visible,.jw-sb .jw-snd:focus-visible,.jw-hit:focus-visible{outline:3px solid #22b8e0;outline-offset:2px}"
    /* while she stands, she is the page's Janna: janna.js's corner button / figure and the SEO pill wait */
    + "html.jw-on .jn-mini,html.jw-on .jn-fig,html.jw-has .jn-wc:not(.big){display:none!important}"
    + "html.nav-open .jw-st,html.nav-open .jw-sb,html.nav-open .jw-hint{visibility:hidden!important;pointer-events:none!important}"
    + "html.jw-ask #seoAsk{display:none!important}"
    + "html.bs-on .jw-st,html.bs-on .jw-sb,html.bs-on .jw-hint{display:none!important}"
    /* the footer's end (site_footer .ftr-end / .ftr-dock) keeps her corner free on a computer: its inset and height follow her real size
       (the footer's own values, 254 × 206, were made for the old 260 × 225 figure) */
    + "html.jw-on.jw-has .site-ftr .ftr-end{--pl:calc(var(--jw-w) - 6px);--fh:calc(var(--jw-w)*.8667 - 19px)}"
    + "@media " + PHONE_MQ + "{html{--jw-w:178px}.jw-st{width:178px;height:154px}"
    + ".jw-nt{font-size:10px;padding:3px 8px;bottom:5px}.jw-aib{font-size:8px;line-height:12px;padding:0 3px}.jw-nt:before{width:6px;height:6px;margin-inline-end:4px}"
    + ".jw-st .jw-gr{bottom:-14px;height:28px}"
    + ".jw-hint{left:136px;bottom:calc(var(--jw-b,0px) + 112px);max-width:min(220px,calc(100vw - 146px));font-size:12px;padding:8px 12px}"
    + ".jw-sb{left:136px;bottom:calc(var(--jw-b,0px) + 44px);width:min(360px,calc(100vw - 144px))}"
    + ".jw-sb .jw-txt{font-size:12.5px;line-height:1.65;padding:10px 12px 2px 30px}.jw-sb[dir=ltr] .jw-txt{padding:10px 30px 2px 12px}"
    + ".jw-sb .jw-acts{gap:6px;padding:6px 10px 10px}.jw-sb .jw-acts button{padding:6px 6px;font-size:12px}"
    /* narrow phones: 💬 and 📝 keep one row (📝 wraps its own words instead of dropping below 💬); a two-line call label is balanced */
    + ".jw-sb .jw-acts .jw-chat{flex:0 1 auto}.jw-sb .jw-acts .jw-reg{flex:1 1 0;min-width:0}"
    + ".jw-sb .jw-acts .jw-call{min-height:44px;padding:8px 10px;font-size:14px;text-wrap:balance}.jw-sb:before{bottom:14px}}"
    + "@media (prefers-reduced-motion:reduce){.jw-st{transition:none;transform:none}.jw-sb,.jw-hint,.jw-sb .jw-acts .jw-call.jw-pu{animation:none}}";
  var st0 = D.createElement("style"); st0.textContent = css; (D.head || DE).appendChild(st0);
  function el(tag, cls, txt) { var x = D.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
  function lsGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) {} }

  /* one Janna at a time (this runs before janna.js starts on DOMContentLoaded): without an open janna.js conversation in this tab she
     starts minimised (her corner button, hidden while the cut-out stands) instead of re-opening an old chat behind the cut-out */
  (function () {
    var s = null; try { s = JSON.parse(W.sessionStorage.getItem("janna-st") || "null"); } catch (e) { s = null; }
    s = s && typeof s === "object" ? s : {};
    var busy = !!(s.open || s.flow || s.pend || s.tour != null) || /[#&]janna=/.test(location.hash || "");
    if (!busy && lsGet("janna-min") !== "1") lsSet("janna-min", "1");   /* unset too: no janna.js arrival hello behind the cut-out */
  })();
  var ASK = D.getElementById("seoAsk");
  if (ASK) DE.classList.add("jw-ask");

  var REDUCED = false, SAVE = false;
  try { REDUCED = !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  try { var cn = navigator.connection || navigator.mozConnection || navigator.webkitConnection; SAVE = !!(cn && cn.saveData); } catch (e) {}
  try { if (!SAVE && W.matchMedia) SAVE = W.matchMedia("(prefers-reduced-data: reduce)").matches; } catch (e) {}
  var STILL = REDUCED || SAVE;   /* the still cut-out, no idle video (a tap still plays her voice clip) */

  /* ---------------- the standing cut-out ---------------- */
  var CW = 480, CH = 416, AY = 432;            /* packed frame: colour 480x416 on top, 16px gutter, alpha 480x416 from y=432 */
  var CAN = false, stand = null, cv = null, ctx = null, off = null, octx = null, buf = null, bctx = null, snap = null, sctx = null, img = null, GLR = null;
  var QA_PATH = String(W.JANNA_WELCOME_PATH || "");
  var vIdle = null, vTalk = null, cur = null, talkBad = false, started = false, stillT = 0;
  var bubble = null, txt = null, inv = null, snd = null, drawn = false, lastT = -1, raf = 0, tmo = 0, talking = false, fadeT0 = 0, fading = false, lastDraw = 0;
  /* talking: a try of her voice is on; spoke: it really plays (from "playing"); tryN: the current try; tapT: when her box opened or her
     voice was asked for (a 2nd tap on her right after it is not a close) */
  var spoke = false, tryN = 0, tapT = 0;
  /* she rests: after ~20 s without the visitor scrolling, moving the pointer, touching or typing, her idle loop stops at its seamless
     start frame (she stands still, nothing is decoded or drawn); the next sign of the visitor and she moves again */
  var REST_MS = 20000, lastAct = Date.now(), rest = false;
  var handed = false, held = false, jmo = null, pend = null;
  var LUT = new Uint8Array(256);
  (function () { for (var i = 0; i < 256; i++) LUT[i] = i < 10 ? 0 : i > 245 ? 255 : Math.round((i - 10) * 255 / 235); })();
  function canVideo() {
    try {
      var c = D.createElement("canvas"), v = D.createElement("video");
      return !!(c.getContext && v.canPlayType && v.canPlayType('video/mp4; codecs="avc1.4D401E"'));
    } catch (e) { return false; }
  }
  /* the GPU compositor: the packed frame as a texture, its alpha half applied in a fragment shader (the same 10..245 → 0..255 ramp as
     the 2D LUT), premultiplied output on a transparent canvas; two textures so the idle ↔ talk dissolve keeps the outgoing frame */
  function glMake(c, force) {
    /* only on a real GPU: a software WebGL (SwiftShader, llvmpipe …, also under software compositing) costs more main-thread time than 2D */
    var o = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: !force }, g = null;
    try { g = c.getContext("webgl", o) || c.getContext("experimental-webgl", o); } catch (e) { g = null; }
    if (!g) return null;
    try {
      if (!force) {
        var rn = String(g.getParameter(g.RENDERER) || "");
        if (/^webkit webgl$/i.test(rn) && !/firefox/i.test(navigator.userAgent || "")) { var ri = g.getExtension("WEBGL_debug_renderer_info"); if (ri) rn = String(g.getParameter(ri.UNMASKED_RENDERER_WEBGL) || ""); }
        if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn)) return null;
      }
      var hy = (CH / (AY + CH)).toFixed(6), ay = (AY / (AY + CH)).toFixed(6);
      var vs = "attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}";
      var fs = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n"
        + "uniform sampler2D t;uniform float k;varying vec2 v;void main(){vec3 c=texture2D(t,vec2(v.x,v.y*" + hy + ")).rgb;"
        + "float a=clamp((texture2D(t,vec2(v.x," + ay + "+v.y*" + hy + ")).r*255.-10.)/235.,0.,1.);gl_FragColor=vec4(c*a,a)*k;}";
      var sh = function (type, src) { var s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : null; };
      var a = sh(g.VERTEX_SHADER, vs), b = sh(g.FRAGMENT_SHADER, fs); if (!a || !b) return null;
      var pr = g.createProgram(); g.attachShader(pr, a); g.attachShader(pr, b); g.linkProgram(pr);
      if (!g.getProgramParameter(pr, g.LINK_STATUS)) return null;
      g.useProgram(pr);
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
      var lp = g.getAttribLocation(pr, "p"); g.enableVertexAttribArray(lp); g.vertexAttribPointer(lp, 2, g.FLOAT, false, 0, 0);
      var tex = [g.createTexture(), g.createTexture()];
      for (var i = 0; i < 2; i++) {
        g.bindTexture(g.TEXTURE_2D, tex[i]);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      }
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      g.viewport(0, 0, CW, CH); g.clearColor(0, 0, 0, 0);
      if (g.getError() !== g.NO_ERROR) return null;
      return { g: g, tex: tex, sz: ["", ""], at: 0, uk: g.getUniformLocation(pr, "k") };
    } catch (e) { return null; }
  }
  function glDraw(fresh, k) {
    var R = GLR, g = R.g, i = R.at;
    if (fresh) {
      g.bindTexture(g.TEXTURE_2D, R.tex[i]);
      var sz = cur.videoWidth + "x" + cur.videoHeight;
      if (R.sz[i] !== sz) { g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, cur); R.sz[i] = sz; }
      else g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, g.RGB, g.UNSIGNED_BYTE, cur);
    }
    g.clear(g.COLOR_BUFFER_BIT);
    if (k < 1 && R.sz[1 - i]) { g.bindTexture(g.TEXTURE_2D, R.tex[1 - i]); g.uniform1f(R.uk, 1 - k); g.drawArrays(g.TRIANGLE_STRIP, 0, 4); }
    g.bindTexture(g.TEXTURE_2D, R.tex[i]); g.uniform1f(R.uk, k); g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }
  /* the 2D compositor (no GPU WebGL): drawImage + getImageData + a per-pixel alpha pass (LUT) + putImageData — about 5 ms a frame on a
     CPU canvas, so her idle motion runs at ~12 fps there (timer-paced), her talking (lip-sync) and the dissolve at ~26 fps */
  function make2D() {
    try {
      var c = D.createElement("canvas"); c.width = CW; c.height = CH;
      off = D.createElement("canvas"); off.width = CW; off.height = AY + CH;
      buf = D.createElement("canvas"); buf.width = CW; buf.height = CH;
      snap = D.createElement("canvas"); snap.width = CW; snap.height = CH;
      ctx = c.getContext("2d");
      octx = off.getContext("2d", { willReadFrequently: true }) || off.getContext("2d");
      bctx = buf.getContext("2d"); sctx = snap.getContext("2d");
      if (!(ctx && octx && bctx && sctx)) return false;
      cv = c; cv.setAttribute("aria-hidden", "true");
      return true;
    } catch (e) { return false; }
  }
  /* the GPU went away (context lost): carry on in 2D on a fresh canvas */
  function to2D() {
    if (!GLR) return; GLR = null;
    var old = cv;
    if (!make2D()) { cv = old; canvasFail(); return; }
    if (old && old.parentNode) old.parentNode.replaceChild(cv, old);
    lastT = -1; fading = false; kick();
  }
  function mkVideo(src, idle) {
    var v = D.createElement("video");
    v.muted = !!idle; if (idle) { v.setAttribute("muted", ""); v.loop = true; }
    v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
    v.preload = "none"; v.setAttribute("preload", "none"); v.setAttribute("disablepictureinpicture", ""); v.setAttribute("disableremoteplayback", "");
    v.setAttribute("aria-hidden", "true"); v.tabIndex = -1; v.src = src;
    stand.appendChild(v);
    return v;
  }
  function slideIn() {
    if (!stand || stand.classList.contains("in")) return;
    stand.classList.add("in");
    scheduleHints();
    autoSoon(1200);
  }
  /* owner 2026-11-18 («مش لازم تدوس عليها عشان تتكلم — هي تتكلم لوحدها»), then the invitation box: on the first page of the tab
     session her box opens by itself once ("jw-invited"): Arabic tries her line with sound — it plays → its captions, then the invitation;
     the browser refuses sound before the visitor's first tap / click / key → the invitation at once with «🔊», and her voice starts on
     the visitor's first tap / click / key ANYWHERE on the page (not only on her) — never a silent lip-synced clip. Later pages: an Arabic
     line not yet said in this tab is tried WITHOUT the box, which opens (with its captions) only if her voice really plays; refused →
     nothing at all. Once the visitor closes her box ("jw-shut") it never opens by itself again in that tab. */
  var SAID = "jw-said", INV = "jw-invited", SHUT = "jw-shut", autoDone = false, autoN = 0, armed = false, probe = false;
  function ssGet(k) { try { return W.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k) { try { W.sessionStorage.setItem(k, "1"); } catch (e) {} }
  /* site data blocked (sessionStorage throws): no memory of the tab, so only a page the visitor came to from elsewhere opens her box by
     itself (the site's own pages are reached with a same-site referrer) and no later page tries her voice — no box on every page */
  var STORE = (function () { try { var s = W.sessionStorage; s.setItem("jw-ss", "1"); var ok = s.getItem("jw-ss") === "1"; s.removeItem("jw-ss"); return ok; } catch (e) { return false; } })();
  function fromSite() { var r = String(D.referrer || ""), o = location.protocol + "//" + location.host + "/"; return r.slice(0, o.length) === o; }
  function saidList() { try { var l = JSON.parse(W.sessionStorage.getItem(SAID) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function said(k) { try { var l = saidList(); if (l.indexOf(k) < 0) { l.push(k); W.sessionStorage.setItem(SAID, JSON.stringify(l.slice(-24))); } } catch (e) {} }
  function sayKey() { return "v:" + (CLIP ? CLIP[0] : KEY); }
  function voice() { return !!(CLIP && CAN && !talkBad); }   /* her voice can play on this page (Arabic, canvas, no broken clip) */
  function shut() { ssSet(SHUT); }   /* the visitor closed her box: it never opens by itself again in this tab */
  /* «🔊»: sndOn = it waits for the visitor. Once shown it keeps its place in the box when it goes (visibility only), so the box never
     shrinks under the pointer: the 2nd click of a double click lands in the box, not on a link of the page that was under it */
  function sndOn() { return !!(snd && !snd.hidden && !snd.classList.contains("jw-used")); }
  function sndShow() { if (snd) { snd.hidden = false; snd.classList.remove("jw-used"); } }
  function sndHide() {
    if (!snd || snd.hidden) return;
    var f = D.activeElement === snd; snd.classList.add("jw-used");
    if (f && bubble) { var c = bubble.querySelector(".jw-call"); if (c) { try { c.focus(); } catch (e) {} } }   /* keyboard focus stays in her box */
  }
  function autoSoon(ms) { setTimeout(autoTalk, ms); }
  /* the platform's own app (user agent «MIGApp», app/) lets any page play sound by itself, where a phone browser waits for the visitor's
     first tap in the page: unless the owner switched «جنة بتتكلم لوحدها أول ما التطبيق يفتح» on (app_janna_autovoice, default OFF), she
     behaves there exactly as in a phone browser — on the first page her box with «🔊» and her voice on the first tap; on later pages
     nothing by herself — until the visitor has tapped in this page (app parity plan, item janna-autovoice-switch) */
  var INAPP = /\bMIGApp\b/.test((W.navigator && W.navigator.userAgent) || ""), TAPPED = false;
  if (INAPP) ["pointerdown", "keydown", "touchend"].forEach(function (x) { W.addEventListener(x, function () { TAPPED = true; }, true); });
  function appQuiet() { var F = W.MIGFLAGS; return INAPP && !TAPPED && !(F && F.on && F.on("app_janna_autovoice") === true); }
  function autoTalk() {
    if (autoDone || !stand) return;
    if (flagOff("janna_welcome")) { autoDone = true; return; }   /* «🛠️ المطوّر»: her invitation box is switched off — nothing opens by itself */
    var first = STORE ? ssGet(INV) !== "1" : !fromSite();
    var fresh = voice() && (STORE ? saidList().indexOf(sayKey()) < 0 : first);
    /* closed by the visitor in this tab; or a later page with no new line of hers to say (English: never) → nothing by itself */
    if (ssGet(SHUT) === "1" || (!first && !fresh)) { autoDone = true; return; }
    /* not now (the visitor is typing, a dialog or the live call is open, Bassem's page, tab hidden…): look again a little later */
    if (handed || held || awayOn || bubble || talking || pend || D.hidden || DE.classList.contains("bs-on") || DE.classList.contains("nav-open")) {
      if (++autoN < 12) autoSoon(2500);
      return;
    }
    autoDone = true;
    if (!first) { if (!appQuiet()) tryVoice(); return; }   /* the app: a later page stays silent until a tap, as a phone browser */
    openBubble();   /* the first page: her box at once */
    if (fresh && appQuiet()) { sndShow(); armGesture(); }   /* the app: exactly as when a phone browser refuses the sound */
    else if (fresh) startTalk();   /* her line with sound if the browser allows it, else «🔊» + her voice on the first tap anywhere */
    else sndShow();   /* she already said this line in this tab: «🔊» if the visitor wants to hear it */
  }
  /* a later page: her voice alone first; the box opens with her words only if it really plays (startTalk's "playing"), else nothing
     (a clip that never starts is given up quietly by startTalk's watch) */
  function tryVoice() {
    probe = true; startTalk();
    if (!talking) probe = false;
  }
  function armGesture() {
    if (armed) return; armed = true;
    var evs = ["pointerdown", "keydown", "touchend"];
    var go = function (e) {
      var t = e && e.target;
      if (t && t.closest && t.closest(".jw-sb,.jw-st")) return;   /* her own buttons do it themselves */
      if (e && e.type === "keydown" && (e.key === "Escape" || e.key === "Esc")) return;   /* Esc closes her box (and gives no gesture) */
      /* she is aside (a field she stands over, a page dialog), or this tap is on a field she stands over (she steps aside for it): no
         voice now — the visitor's next tap / key after that is the one */
      if (awayOn || (t && t.matches && t.matches(SEL) && !mine(t) && hitsMe(t))) return;
      evs.forEach(function (x) { W.removeEventListener(x, go, true); });
      armed = false;
      if (!stand || handed || held || talking || talkBad || !bubble || !sndOn()) return;
      sndHide(); startTalk();
    };
    evs.forEach(function (x) { W.addEventListener(x, go, true); });
  }
  /* the still cut-out (reduced motion, Save-Data, no video, or while the idle video is still on its way) */
  function showStill() {
    if (!img) return;
    if (img.getAttribute("src")) { if (img.complete && img.naturalWidth) slideIn(); return; }
    img.onload = function () { slideIn(); };
    img.onerror = function () { if (!drawn) giveUp(); };
    img.src = BASE + "janna-cut-idle.png";
  }
  function offNow() { try { return W.sessionStorage.getItem("jw-off") === "1"; } catch (e) { return false; } }
  function closeHer() { try { W.sessionStorage.setItem("jw-off", "1"); } catch (e) {} try { stopTalk(); } catch (e) {} giveUp(); }
  function giveUp() {
    try { if (raf) W.cancelAnimationFrame(raf); } catch (e) {} raf = 0; if (tmo) { clearTimeout(tmo); tmo = 0; }
    try { if (vIdle) vIdle.pause(); if (vTalk) vTalk.pause(); } catch (e) {}
    closeBubble(true); pend = null; hideHint();
    if (stand && stand.parentNode) stand.parentNode.removeChild(stand); stand = null;
    DE.classList.remove("jw-on"); DE.classList.remove("jw-has"); DE.classList.remove("jw-ask");
  }
  function canvasFail() {
    CAN = false; GLR = null; talking = false; probe = false; cur = null;
    try { if (raf) W.cancelAnimationFrame(raf); } catch (e) {} raf = 0; if (tmo) { clearTimeout(tmo); tmo = 0; }
    try { if (vIdle) vIdle.pause(); if (vTalk) vTalk.pause(); } catch (e) {}
    if (stand) { stand.classList.remove("live"); stand.classList.remove("talk"); }
    sndHide();   /* no canvas, no voice: no «🔊» either */
    setText(false);
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    showStill();
  }
  function draw() {
    if (!cur || cur.readyState < 2 || !CAN) return;
    var t = cur.currentTime, fresh = !(t === lastT && drawn);
    if (!fresh && !fading) return;
    if (cur === vIdle && !talking && drawn && t < lastT - 1 && Date.now() - lastAct > REST_MS) { rest = true; pauseIdle(); }   /* wrapped: rest here */
    lastT = t;
    /* a short dissolve when she switches between idle and talking, so she never jumps */
    var k = fading ? Math.min(1, (Date.now() - fadeT0) / 360) : 1;
    try {
      if (GLR) glDraw(fresh, k);
      else {
        if (fresh) {
          octx.drawImage(cur, 0, 0, CW, AY + CH);
          var col = octx.getImageData(0, 0, CW, CH), al = octx.getImageData(0, AY, CW, CH).data, d = col.data, n = d.length;
          for (var i = 3; i < n; i += 4) d[i] = LUT[al[i - 3]];
          bctx.putImageData(col, 0, 0);
        }
        ctx.clearRect(0, 0, CW, CH);
        if (k < 1) { ctx.globalAlpha = 1 - k; ctx.drawImage(snap, 0, 0); ctx.globalAlpha = k; }
        ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1;
      }
      if (k >= 1) fading = false;
    } catch (e) { canvasFail(); return; }
    if (!drawn) { drawn = true; stand.classList.add("live"); slideIn(); }
  }
  function loop(ts) {
    raf = 0; if (!stand || !CAN) return;
    /* talking (lip-sync) and the dissolve: every animation frame, drawn at ~26 fps; idle: paced by a timer (not 60 wake-ups a second),
       ~26 fps on the GPU, ~12 fps in 2D */
    var paced = !talking && !fading, gap = !paced || GLR ? 38 : 80;
    if (!D.hidden && (fading || !ts || ts - lastDraw >= gap - 10)) { lastDraw = ts || 0; draw(); }
    if (!cur || cur.paused) return;
    if (paced && !fading) {
      var gone = W.performance && W.performance.now ? W.performance.now() - lastDraw : 0;
      tmo = setTimeout(function () { tmo = 0; if (!raf) raf = W.requestAnimationFrame(loop); }, Math.max(0, gap - 16 - gone));
    }
    else raf = W.requestAnimationFrame(loop);
  }
  function kick() {
    if (tmo) { clearTimeout(tmo); tmo = 0; }
    if (!raf && CAN && W.requestAnimationFrame) raf = W.requestAnimationFrame(loop);
  }
  function useVideo(v) {
    if (cur === v) return kick();
    if (drawn) {
      if (GLR) { GLR.at = 1 - GLR.at; fading = true; fadeT0 = Date.now(); }
      else if (snap) { try { sctx.clearRect(0, 0, CW, CH); sctx.drawImage(cv, 0, 0); fading = true; fadeT0 = Date.now(); } catch (e) {} }
    }
    cur = v; lastT = -1; kick();
  }
  function playIdle() {
    talking = false; if (stand) stand.classList.remove("talk");
    if (!CAN || STILL || !vIdle) {
      cur = null; drawn = false; if (stand) stand.classList.remove("live");
      try { if (GLR) GLR.g.clear(GLR.g.COLOR_BUFFER_BIT); else if (ctx) ctx.clearRect(0, 0, CW, CH); } catch (e) {}
      showStill(); return;
    }
    if (handed || held || D.hidden || awayOn) return;   /* aside / out / held: her idle motion waits (no decoding off screen) */
    rest = false;
    useVideo(vIdle);
    try { var p = vIdle.play(); if (p && p.catch) p.catch(function () { if (!drawn) showStill(); }); } catch (e) { if (!drawn) showStill(); }
  }
  function pauseIdle() { try { if (vIdle && !vIdle.paused) vIdle.pause(); } catch (e) {} }
  function pauseAll() {
    pauseIdle();
    if (talking) stopTalk();
  }
  function stopTalk() {
    var was = talking, sp = spoke; talking = false; probe = false; spoke = false; if (stand) stand.classList.remove("talk");
    if (was && vTalk) { try { vTalk.pause(); } catch (e) {} }
    if (was) setText(sp);   /* stopped: her invitation again; the call button pulses if she had begun to speak */
  }
  function talkFail() {
    talkBad = true; var was = talking; talking = false; probe = false; if (stand) stand.classList.remove("talk");
    sndHide();
    setText(false);
    if (was) playIdle();
  }
  /* she has finished speaking: a field under her that the visitor focused meanwhile → she steps aside for it now */
  function afterTalk() { if (stand && !handed && !why.f && coveredFocus()) { why.f = 1; reAway(); } }
  /* her try ended before she said a word (her clip never came, or the browser paused it first): quietly back to the invitation, no
     pulse; on the visitor's own try «🔊» comes back, so they can ask again */
  function quitTalk() {
    var pr = probe;
    talking = false; probe = false; if (stand) stand.classList.remove("talk");
    try { if (vTalk && !vTalk.paused) vTalk.pause(); } catch (e) {}
    if (!pr && !talkBad) sndShow();
    setText(false); playIdle();
  }
  /* the browser paused her clip by itself (media keys, its media controls, a headset, a phone call, the back/forward cache …): she
     stops like at its end — the invitation again and the pulse — instead of standing frozen over her captions */
  function talkPaused() {
    if (!spoke) quitTalk(); else { stopTalk(); playIdle(); }
    afterTalk();
  }
  /* every try is watched: no progress of her clip for ~8 s (it never arrives, or stalls on the way) → she gives up as above */
  function watchTalk(n) {
    var t0 = -1, since = 0;
    var chk = function () {
      if (n !== tryN || !talking || !stand) return;
      var t = vTalk ? vTalk.currentTime : 0, now = Date.now();
      if (t !== t0 || !since) { t0 = t; since = now; }
      else if (now - since > 8000) { talkPaused(); return; }
      setTimeout(chk, 1000);
    };
    setTimeout(chk, 1000);
  }
  /* her voice: the clip of this page's line, with sound (a tap is the gesture); a refused play shows «🔊», never a silent clip. A later
     page's own try (probe) has no box yet: it loads nothing unless the browser lets her speak, and opens the box once she really does */
  function startTalk() {
    if (!CLIP || !CAN || talkBad || !stand) return;
    if (!vTalk) {
      vTalk = mkVideo(BASE + "janna-cut-" + CLIP[0] + ".mp4", false);
      vTalk.addEventListener("playing", function () {
        /* resumed from outside after her try ended (media keys, the system's media controls): no voice without her */
        if (!talking) { try { vTalk.pause(); } catch (e) {} return; }
        /* now she really speaks: her lip-sync, the red dot and the captions start with her voice (never before it) */
        spoke = true; useVideo(vTalk); pauseIdle(); said(sayKey());
        if (stand) stand.classList.add("talk");
        if (probe) { probe = false; if (!bubble && stand && !handed && !held && !awayOn) openBubble(); }   /* she speaks: her box, with her words */
        setText(false);
      });
      vTalk.addEventListener("ended", function () { if (talking) { playIdle(); setText(true); afterTalk(); } });   /* the end: invitation + pulse */
      /* the script's own pauses come after talking = false, and the clip's end pauses it with ended = true: any other pause is the browser's */
      vTalk.addEventListener("pause", function () { if (talking && stand && !vTalk.ended) talkPaused(); });
      vTalk.addEventListener("error", function () { talkFail(); });
    }
    if (!probe) vTalk.preload = "auto";
    talking = true; spoke = false; tapT = Date.now(); setText(false);
    var p = null, n = ++tryN;
    try { vTalk.muted = false; vTalk.volume = 1; if (vTalk.currentTime > 0) vTalk.currentTime = 0; p = vTalk.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () {
      if (!talking || n !== tryN) return; talking = false; if (stand) stand.classList.remove("talk");
      if (probe) probe = false;   /* a later page and the browser refused: nothing opens, no gesture is armed (no nagging) */
      else if (snd && !talkBad) { sndShow(); armGesture(); }
      setText(false);
      playIdle();
    });
    if (!vTalk.paused && vTalk.readyState >= 3) useVideo(vTalk);
    if (talking) watchTalk(n);
  }
  /* the box's words follow her voice: while she says her clip, its words (captions); otherwise her invitation. cue: a clip just ended
     or was stopped → the invitation comes back and the call button pulses a few times (CSS; none under reduced motion) */
  function setText(cue) {
    if (!bubble) return;
    var cap = !!(talking && spoke && CLIP);
    if (cap) bubble.classList.add("cap"); else bubble.classList.remove("cap");
    if (!cue || cap) return;
    if (inv) inv.textContent = S.inv;
    var b = bubble.querySelector(".jw-call");
    if (b) { b.classList.remove("jw-pu"); void b.offsetWidth; b.classList.add("jw-pu"); }   /* restart the pulse */
  }
  /* silent: closed by the script (she steps out, the call opens …) — a queued action (⏳) still runs; the visitor's ✕ / Esc / tap cancels it */
  function closeBubble(silent) {
    if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
    bubble = null; txt = null; inv = null; snd = null;
    if (!silent) { pend = null; if (talking) { stopTalk(); playIdle(); } setTimeout(endCheck, 0); }
  }
  function actions() {
    var box = el("div", "jw-acts");
    [["call", "jw-call", S.call], ["chat", "jw-chat", S.chat], ["reg", "jw-reg", S.reg]].forEach(function (a) {
      var b = el("button", a[1], a[2]); b.type = "button"; b.setAttribute("data-act", a[0]);
      /* the big button says what it does: a voice & video call (its name keeps the visible words first, for voice control) */
      if (a[0] === "call") { b.title = S.callT; b.setAttribute("aria-label", S.call.replace(/^\S+\s+/, "") + " — " + S.callT); }
      b.onclick = function () { act(a[0], b); };
      box.appendChild(b);
    });
    return box;
  }
  function openBubble() {
    bubble = el("div", "jw-sb"); bubble.setAttribute("role", "dialog"); bubble.setAttribute("aria-label", S.dlg);
    bubble.setAttribute("translate", "no"); bubble.setAttribute("dir", DIR); bubble.setAttribute("lang", EN ? "en" : "ar");
    var x = el("button", "jw-x", "✕"); x.type = "button"; x.setAttribute("aria-label", S.x); x.onclick = function () { shut(); closeBubble(); };
    bubble.appendChild(x);
    if (voice()) {
      snd = el("button", "jw-snd", S.snd); snd.type = "button"; snd.hidden = true;
      snd.onclick = function () { sndHide(); startTalk(); };
      bubble.appendChild(snd);
    }
    /* her words: the invitation and, where she has a voice, the words of her clip (shown while she says them) */
    txt = el("p", "jw-txt"); inv = el("span", "jw-iv", S.inv); txt.appendChild(inv);
    if (voice()) txt.appendChild(el("span", "jw-cc", CLIP[1]));
    bubble.appendChild(txt);
    bubble.appendChild(actions());
    if (awayOn) bubble.classList.add("jw-aw");
    hideHint();   /* her box and her short hint never stand together */
    D.body.appendChild(bubble);
    tapT = Date.now();
    ssSet(INV);   /* her invitation has been shown in this tab: later pages open it only when her voice plays */
    setText(false);
  }
  function talk() {
    if (!stand || handed || held || DE.classList.contains("bs-on")) return false;
    /* «🛠️ المطوّر»: her invitation box is switched off → a tap on her opens her chat (janna.js) instead of the box */
    if (flagOff("janna_welcome") && !bubble) { autoDone = true; setAway(false); hideHint(); act("chat"); return true; }
    why.f = 0; why.e = 0; setAway(false); hideHint();   /* the visitor called her: she stands in front again */
    autoDone = true;   /* nothing more opens by itself on this page */
    if (bubble) {
      /* her voice waits for a tap («🔊» shown): this tap is it; otherwise the tap closes her box (for this tab, like ✕) — but not the
         2nd tap of a double tap on her, nor a tap the moment her box opened by itself: then her box stays and her voice goes on */
      if (sndOn() && !talking) { sndHide(); startTalk(); return true; }
      if (Date.now() - tapT < 700) return true;
      shut(); closeBubble(); return true;
    }
    probe = false;   /* a later page's own try of her voice (no box yet) is now the visitor's */
    if (!stand.classList.contains("in")) slideIn();
    openBubble();
    if (CLIP) startTalk();
    return true;
  }

  /* ---------------- her actions (Janna's own scripts; generated pages load them on demand) ---------------- */
  function ready(name) {
    if (name === "call") return !!(W.JANNA_LIVE && W.JANNA_LIVE.open) && (!LJ.on || LJ.done || !!W.JANNA);
    return !!(W.JANNA && (name === "chat" ? W.JANNA.restore : W.JANNA.register));
  }
  function canLoad() { return !!((W.SEO_ASK_SRC && W.SEO_ASK_SRC.length) || (ASK && ASK.getAttribute("data-done"))); }
  function regUrl() { return "/register/"; }
  /* pages without her scripts (error pages): her app pages do it — the live call opens itself on #live=1, the chat on #janna=<arrive> */
  function navFor(name) {
    if (name === "call") return "/#live=1";
    if (name === "chat") return "/#janna=eyJraW5kIjoiYXJyaXZlIn0";
    return regUrl();
  }
  function go(u) {
    if (EN) lsSet("mig-lang", "en");   /* the visitor reads English: the app pages follow (data/i18n.js) */
    location.href = u;
  }
  function act(name, btn) {
    if (pend) return;
    var run = function () {
      if (name === "call") {
        stopTalk(); closeBubble(true); W.JANNA_LIVE.open({ persona: "janna" });
        checkState(); if (!held) playIdle();   /* the call's overlay holds her; without one she goes on standing */
      }
      else handTo(name === "chat" ? function () { W.JANNA.restore(false); } : function () { W.JANNA.register(); });
    };
    if (ready(name)) { try { run(); } catch (e) { if (name === "reg") go(regUrl()); } return; }
    if (!canLoad()) { go(navFor(name)); return; }
    pend = { name: name, btn: btn, run: run, label: btn ? btn.textContent : "", aria: btn ? btn.getAttribute("aria-label") : null };
    /* ⏳ while her scripts load: the button's accessible name says it too (the call button has its own aria-label) */
    if (btn) { btn.textContent = S.wait; btn.setAttribute("aria-busy", "true"); if (pend.aria != null) btn.setAttribute("aria-label", S.wait); }
    loadJanna(function (ok) {
      var p = pend; if (!p) return; pend = null;
      if (p.btn) { p.btn.textContent = p.label; p.btn.removeAttribute("aria-busy"); if (p.aria != null) p.btn.setAttribute("aria-label", p.aria); }
      if (bassemOn()) return;   /* a member signed in meanwhile: Bassem serves the page */
      if (ok && ready(p.name)) { try { p.run(); return; } catch (e) {} }
      if (p.name === "reg") { go(regUrl()); return; }
      if (inv && bubble) { inv.textContent = S.oops; bubble.classList.remove("cap"); }
    });
  }
  /* the same scripts, in the same order, as the «اسأل جنة» pill (window.SEO_ASK_SRC from the SEO asset); i18n.js reads the visitor's
     stored language, so the page's own language is pinned while it runs (Arabic page → Arabic Janna, English page → English Janna and
     the EN live persona). English pages skip the 2 MB Arabic→English dictionary: janna.js / janna-live.js are bilingual in code. */
  var LJ = { on: false, done: false, cbs: [], t0: 0, t1: 0, tm: 0 };
  /* janna.js has run its start() (one task after it loads): html.jn-here, or html.jn-quiet on members' pages / with Bassem */
  function jnStarted() { return DE.classList.contains("jn-here") || DE.classList.contains("jn-quiet"); }
  function pinLang() {
    var want = EN ? "en" : "ar", prev = lsGet("mig-lang");
    if (EN && !W.I18N_EN) W.I18N_EN = {};
    if (prev === want) return null;
    lsSet("mig-lang", want);
    return function () { if (lsGet("mig-lang") === want) lsSet("mig-lang", prev); };
  }
  function ljEnd(ok) {
    if (LJ.tm) { clearInterval(LJ.tm); LJ.tm = 0; }
    if (ok) askFix();
    var c = LJ.cbs; LJ.cbs = [];
    for (var i = 0; i < c.length; i++) { try { c[i](ok); } catch (e) {} }
  }
  function loadJanna(cb) {
    LJ.cbs.push(cb);
    if (LJ.tm) return;
    LJ.t0 = Date.now(); LJ.t1 = 0;
    LJ.tm = setInterval(function () {
      /* every script ran (or the pill's did) and janna.js has started — before that, its start() would undo what the action opens */
      var J = !!(W.JANNA && W.JANNA.restore), ok = LJ.done || (!LJ.on && J);
      if (ok && !LJ.t1) LJ.t1 = Date.now();
      if (ok && (!J || jnStarted() || Date.now() - LJ.t1 > 2000)) ljEnd(true);
      else if (Date.now() - LJ.t0 > 25000) ljEnd(false);
    }, 150);
    if (LJ.on || (ASK && ASK.getAttribute("data-done"))) return;   /* already on its way (here or by the pill) */
    LJ.on = true;
    /* the pill can no longer start a second copy; no data-done yet: janna.js reads that at its start as «the visitor tapped اسأل جنة» and
       would open its own card / spoken intro, while here she does exactly what the visitor chose (askFix marks it done afterwards) */
    if (ASK) ASK.disabled = true;
    var l = (W.SEO_ASK_SRC || []).slice(), i = 0;
    (function nx() {
      if (i >= l.length) { LJ.done = true; if (ASK) ASK.hidden = true; return; }
      var src = String(l[i++]), s = D.createElement("script"), unpin = /\/i18n\.js(\?|$)/.test(src) ? pinLang() : null;
      s.src = src; s.charset = "utf-8";
      s.onload = s.onerror = function () { s.onload = s.onerror = null; if (unpin) unpin(); nx(); };
      (D.body || DE).appendChild(s);
    })();
  }
  /* the page's own «اسأل جنة» buttons ([data-ask]) click #seoAsk while it is enabled, else they only toast «جنة بتفتح دلوقتي…». Once
     Janna's scripts are on the page (loaded here or by the pill) #seoAsk is marked done (the pill never loads a second copy) and enabled
     again, and a click on it opens janna.js's card (she steps out for it) */
  function askFix() {
    if (!ASK || !W.JANNA || !jnStarted() || (LJ.on && !LJ.done)) return;
    if (!ASK.getAttribute("data-done")) ASK.setAttribute("data-done", "1");
    if (ASK.disabled) ASK.disabled = false;
  }
  function askJanna() {
    var J = W.JANNA; if (!J || !jnStarted()) return;
    var wc = D.querySelector(".jn-wc:not(.big)"), hd = wc && wc.querySelector('[data-st="open"]');
    try { if (hd) hd.click(); else if (!D.querySelector(".jn-wc.big,.jn-stage:not(.jn-wc)") && J.stage) J.stage(); } catch (e) {}
    setTimeout(checkState, 40);
  }
  /* the pill's own handler runs first (registered before this script): on its first tap it marks the button done and loads the scripts */
  if (ASK) ASK.addEventListener("click", function () { if (W.JANNA && jnStarted() && !ASK.disabled && !(LJ.on && !LJ.done)) askJanna(); });

  /* 💬 / 📝: janna.js shows her chat on its own figure, so the cut-out steps out (and the corner button may show) until it is minimised */
  function jfig() { return D.querySelector(".jn-fig"); }
  function shown(e) { return !!(e && !e.hidden); }
  /* a janna.js conversation the visitor can see: its bubble, its expanded welcome card or full stage, its tour spotlight */
  function jannaTalks() { return shown(D.querySelector(".jn-bub")) || !!D.querySelector(".jn-wc.big,.jn-stage:not(.jn-wc),.jn-spot:not([hidden])"); }
  function jannaUp() { return jannaTalks() || shown(jfig()); }
  function jannaCorner() { try { if (W.JANNA && W.JANNA.minimise) W.JANNA.minimise(); } catch (e) {} }
  function stepOut() {
    var p = pend;   /* an action on its way (⏳) is still carried out */
    stopTalk(); closeBubble(true); pend = p; hideHint();
    handed = true; if (stand) stand.classList.add("out");
    pauseAll();
    DE.classList.remove("jw-on");
  }
  function handTo(fn) {
    stepOut();
    try { fn(); } catch (e) { comeBack(); return; }
    watchJanna();
  }
  function watchJanna() {
    if (jmo) return;
    var f = jfig();
    if (!f || !W.MutationObserver) return;   /* the state check below polls */
    jmo = new W.MutationObserver(function () { if (handed && f.hidden && !jannaTalks()) comeBack(); });
    jmo.observe(f, { attributes: true, attributeFilter: ["hidden"] });
  }
  function comeBack() {
    if (!handed) return; handed = false;
    if (jmo) { try { jmo.disconnect(); } catch (e) {} jmo = null; }
    if (!stand) return;
    DE.classList.add("jw-on");
    /* she does not come back over the field the visitor is typing in, an open page dialog or the end of the page */
    why.f = coveredFocus() ? 1 : 0; why.d = dialogOpen() ? 1 : 0; why.e = atEnd() ? 1 : 0;
    awayOn = !!(why.f || why.d || why.e);
    if (awayOn) stand.classList.add("away"); else stand.classList.remove("away");
    stand.classList.remove("out");
    if (!started) begin(); else playIdle();
  }
  /* the live call (full-screen overlay) or Bassem: she holds still (no idle video under the call) */
  function liveUp() { var o = D.querySelector(".jnl"); return !!(o && !o.hidden); }
  function bassemOn() { return DE.classList.contains("bs-on"); }
  function checkState() {
    if (!stand) return;
    var hold = liveUp() || bassemOn() || DE.classList.contains("nav-open");
    if (hold && !held) { held = true; pauseAll(); hideHint(); if (bassemOn()) { closeBubble(true); pend = null; } }
    else if (!hold && held) { held = false; if (!handed && started) playIdle(); }
    if (handed) {
      if (!jannaUp()) comeBack();
      /* janna.js's figure stands idle (its bubble closed, no card, no call) for a few seconds → it goes back to its corner button and
         the cut-out comes back as the page's Janna */
      else if (jannaIdle()) { if (++idleN >= 3) { idleN = 0; jannaCorner(); if (!jannaUp()) comeBack(); } }
      else idleN = 0;
    }
    else if (started) {
      idleN = 0;
      /* janna.js opened a conversation by itself (or for the page's «اسأل جنة»): one Janna at a time, she steps out for it */
      if (jannaTalks()) { stepOut(); watchJanna(); }
      /* janna.js only put its figure back (its hidden welcome card closed on a scroll or a field focus): to its corner button at once —
         hidden while she stands, so nothing on the page changes */
      else if (shown(jfig())) jannaCorner();
    }
    askFix();
  }
  var idleN = 0;
  function jannaIdle() {
    var f = jfig();
    return !!(f && !f.hidden && !jannaTalks() && !liveUp() && W.JANNA && W.JANNA.minimise);
  }

  /* ---------------- hint, step aside, bottom bar ---------------- */
  var hint = null, hintN = 0, hintOn = false;
  function hideHint() { if (hint && hint.parentNode) hint.parentNode.removeChild(hint); hint = null; }
  /* the visitor is in one of the page's fields (typing, choosing): no hint pops up */
  function fieldBusy() { var a = D.activeElement; return !!(a && a !== D.body && a.matches && a.matches(SEL) && !mine(a)); }
  function showHint() {
    if (D.hidden || hintN >= 3 || !stand || bubble || awayOn || handed || held || !stand.classList.contains("in") || fieldBusy()) return;
    hintN++; hideHint();
    hint = el("div", "jw-hint", S.hint); hint.setAttribute("translate", "no"); hint.setAttribute("dir", DIR); hint.setAttribute("lang", EN ? "en" : "ar");
    hint.onclick = function () { hideHint(); talk(); }; D.body.appendChild(hint);
    setTimeout(hideHint, 7000);
  }
  function scheduleHints() { if (hintOn) return; hintOn = true; setTimeout(showHint, 6500); setInterval(showHint, 45000); }
  function isPhone() { try { return W.matchMedia ? W.matchMedia(PHONE_MQ).matches : W.innerWidth <= 640; } catch (e) { return W.innerWidth <= 640; } }
  function barOffset() {
    /* phones: stand on top of a fixed bottom bar if the page has one, never over it */
    var b = 0;
    if (isPhone() && D.body) {
      var all = D.body.children, vh = W.innerHeight, vw = W.innerWidth;
      for (var i = 0; i < all.length; i++) {
        var e = all[i]; if (e === stand || e === bubble || e === hint || e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
        var cs = W.getComputedStyle(e); if (cs.position !== "fixed" && cs.position !== "sticky") continue;
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        var r = e.getBoundingClientRect();
        if (r.bottom >= vh - 2 && r.top > vh * 0.6 && r.width >= vw * 0.6 && r.height > 20 && r.height < 140) b = Math.max(b, Math.round(vh - r.top));
      }
    }
    DE.style.setProperty("--jw-b", b + "px");
  }
  /* she steps aside (slides off the left edge) while the visitor uses a form control she stands over (f), while a page dialog is open (d)
     and, on desktop, at the end of a long page (e); she comes back when none of them holds any more */
  var awayOn = false, SEL = "input:not([type=hidden]),select,textarea,[contenteditable=true]", why = { f: 0, d: 0, e: 0 };
  function mine(e) { return (stand && stand.contains(e)) || (bubble && bubble.contains(e)) || (hint && hint.contains(e)); }
  function hitsMe(e) {
    if (!stand || !e || !e.getBoundingClientRect) return false;
    var q = e.getBoundingClientRect(); if (!q.width || !q.height) return false;
    var w = stand.offsetWidth, h = stand.offsetHeight, vh = W.innerHeight;
    var b = parseFloat(W.getComputedStyle(DE).getPropertyValue("--jw-b")) || 0;
    return q.right > w * 0.12 && q.left < w * 0.88 && q.bottom > vh - b - h * 0.9 && q.top < vh - b;
  }
  function coveredFocus() { var a = D.activeElement; return !!(a && a.matches && a.matches(SEL) && !mine(a) && hitsMe(a)); }
  function setAway(on) {
    if (!stand || awayOn === on) return; awayOn = on;
    /* her box goes aside with her (never left alone over the visitor's field or on top of the page's dialog) and comes back with her */
    if (bubble) { if (on) bubble.classList.add("jw-aw"); else bubble.classList.remove("jw-aw"); }
    if (on) { hideHint(); stand.classList.add("away"); if (!talking) pauseIdle(); }
    else { stand.classList.remove("away"); if (started && !talking) playIdle(); }
  }
  function reAway() { setAway(!!(why.f || why.d || why.e)); }
  /* a page dialog (product quick view, basket, sign-in, lightbox …) opens above the page → she steps aside until it closes */
  function dialogOpen() {
    var list = D.querySelectorAll('[aria-modal="true"]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (mine(e)) continue;
      if (e.closest && e.closest('[aria-hidden="true"],[inert],[hidden]')) continue;
      var cs = W.getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
      var r = e.getBoundingClientRect(); if (r.width > 40 && r.height > 40) return true;
    }
    return false;
  }
  function watchDialogs() {
    setInterval(function () {
      if (!stand || D.hidden || talking || handed) return;
      var now = dialogOpen() ? 1 : 0; if (now === why.d) return; why.d = now; reAway();
    }, 500);
  }
  function watchControls() {
    D.addEventListener("focusin", function (ev) {
      var t = ev.target; if (!stand || !t || !t.matches || mine(t)) return;
      if (!t.matches(SEL)) return;
      hideHint();
      if (talking || handed) return;
      if (hitsMe(t)) { why.f = 1; reAway(); }
    }, true);
    D.addEventListener("focusout", function () {
      if (!why.f) return;
      setTimeout(function () { if (why.f && !coveredFocus()) { why.f = 0; if (!handed) reAway(); } }, 600);
    }, true);
  }
  /* desktop: the visitor reached the end of a long page whose footer keeps no room for her — its last rows (legal links, quick links, the
     copyright line) would sit where she stands, so she makes way; back once they scroll up (~220 px). The current footer reserves her
     corner (.ftr-end, sized by the rule above), so there she stays. Not while her bubble is open, never on phones (the footer keeps room
     for her there) and not on a page that does not scroll. */
  var ROOM = null;
  function atEnd() {
    if (!stand || bubble || talking || isPhone()) return false;
    if (ROOM == null) ROOM = !!D.querySelector(".site-ftr .ftr-end");
    if (ROOM) return false;
    var se = D.scrollingElement || DE, y = W.pageYOffset || se.scrollTop || 0, vh = W.innerHeight;
    var H = Math.max(se.scrollHeight, D.body ? D.body.scrollHeight : 0);
    if (H - vh < 240 || y < 60) return false;
    var left = H - (y + vh);
    return why.e ? left < 220 : left < 28;
  }
  function endCheck() { if (!stand || handed) return; var e = atEnd() ? 1 : 0; if (e === why.e) return; why.e = e; reAway(); }
  function watchEnd() {
    var rq = 0;
    var f = function () { rq = 0; endCheck(); };
    W.addEventListener("scroll", function () { if (!rq) rq = W.requestAnimationFrame ? W.requestAnimationFrame(f) : setTimeout(f, 50); }, { passive: true });
    W.addEventListener("resize", function () { setTimeout(endCheck, 150); });
  }

  /* any sign of the visitor wakes her from rest (passive listeners; between rests they only note the time) */
  function watchActivity() {
    var on = function () { lastAct = Date.now(); if (rest && stand && started && !talking) playIdle(); };
    ["wheel", "keydown", "touchstart", "pointerdown", "mousemove"].forEach(function (t) { W.addEventListener(t, on, { passive: true, capture: true }); });
    W.addEventListener("scroll", on, { passive: true });   /* the page's own scroll only (a strip that scrolls itself is no visitor) */
  }

  /* desktop: the pointer on a link / button / field that her body covers → she fades so the visitor sees what they are about to click */
  function watchHover() {
    var fine = false; try { fine = !!(W.matchMedia && W.matchMedia("(hover: hover) and (pointer: fine)").matches); } catch (e) {}
    if (!fine) return;
    var on = false, rr = null, rt = 0;
    var set = function (g) { if (g === on || !stand) return; on = g; if (g) stand.classList.add("ghost"); else stand.classList.remove("ghost"); };
    D.addEventListener("mousemove", function (e) {
      if (!stand || handed || awayOn || !stand.classList.contains("in")) { set(false); return; }
      var now = Date.now(); if (!rr || now - rt > 400) { rr = stand.getBoundingClientRect(); rt = now; }
      var x = e.clientX, y = e.clientY, g = false;
      if (x >= rr.left && x < rr.right && y >= rr.top && y < rr.bottom) {
        var t = e.target;
        g = !!(t && t.closest && !mine(t) && t.closest("a[href],button,input,select,textarea,label,summary,[role=button],[tabindex]"));
      }
      set(g);
    }, { passive: true });
    D.addEventListener("mouseout", function (e) { if (!e.relatedTarget) set(false); });
  }

  /* her silhouette (0..255 at a point on screen): the live canvas frame, else a small alpha map of the still cut-out */
  var amap = null;
  function alphaAt(x, y) {
    if (!stand) return 0;
    var r = stand.getBoundingClientRect(); if (!r.width || !r.height) return 0;
    var fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return 0;
    var px = Math.floor(fx * CW), py = Math.floor(fy * CH);
    try {
      if (CAN && drawn && GLR) {
        /* the drawing buffer is only readable in the task that drew it: draw the current frame again, then read the one pixel */
        if (cur && cur.readyState >= 2) glDraw(true, 1);
        var o = new Uint8Array(4); GLR.g.readPixels(px, CH - 1 - py, 1, 1, GLR.g.RGBA, GLR.g.UNSIGNED_BYTE, o); lastT = -1;
        return o[3];
      }
      if (CAN && drawn && ctx) return ctx.getImageData(px, py, 1, 1).data[3];
      if (img && img.complete && img.naturalWidth) {
        if (!amap) {
          var c = D.createElement("canvas"); c.width = 120; c.height = 104;
          var x2 = c.getContext("2d"); x2.drawImage(img, 0, 0, 120, 104); amap = x2.getImageData(0, 0, 120, 104).data;
        }
        return amap[(Math.floor(fy * 104) * 120 + Math.floor(fx * 120)) * 4 + 3];
      }
    } catch (e) {}
    return 255;
  }
  function opaqueAt(x, y) { return alphaAt(x, y) > 60; }
  function passOn(hit, x, y) {
    var t = null;
    try { hit.style.pointerEvents = "none"; t = D.elementFromPoint(x, y); } catch (e) {} hit.style.pointerEvents = "";
    if (!t || mine(t)) return;
    var c = t.closest ? t.closest("a[href],button,input,select,textarea,label,summary,[role=button],[tabindex]") : null;
    try {
      if (c && /^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) c.focus();
      else (c || t).click();
    } catch (e) {}
  }

  /* ---------------- start: after the page has loaded and the browser is idle ---------------- */
  function build() {
    if (stand || !D.body || offNow()) return;
    stand = el("div", "jw-st"); stand.setAttribute("translate", "no"); stand.setAttribute("dir", DIR);
    stand.appendChild(el("span", "jw-gr"));
    img = el("img", "jw-pos"); img.alt = ""; img.setAttribute("aria-hidden", "true"); img.decoding = "async";
    stand.appendChild(img);
    if (canVideo()) {
      /* QA only: window.JANNA_WELCOME_PATH = "gl" (WebGL even in software) | "2d" picks the compositor */
      var c1 = D.createElement("canvas"); c1.width = CW; c1.height = CH;
      GLR = QA_PATH === "2d" ? null : glMake(c1, QA_PATH === "gl");
      if (GLR) {
        cv = c1; cv.setAttribute("aria-hidden", "true"); CAN = true;
        cv.addEventListener("webglcontextlost", function (e) { try { e.preventDefault(); } catch (x) {} to2D(); }, false);
      }
      else CAN = make2D();
      if (CAN) stand.appendChild(cv);
    }
    var nt = el("span", "jw-nt", S.tag); nt.setAttribute("dir", DIR); nt.appendChild(el("b", "jw-aib", "AI")); stand.appendChild(nt);
    var hit = el("button", "jw-hit"); hit.type = "button"; hit.setAttribute("aria-label", S.hit);
    /* only her own pixels answer: a click on a transparent corner of the head box goes on to the page under her */
    hit.onclick = function (ev) {
      if (ev && ev.detail && ev.clientX != null && !opaqueAt(ev.clientX, ev.clientY)) { passOn(hit, ev.clientX, ev.clientY); return; }
      if (ev && ev.detail > 1) return;   /* the 2nd click of a double click on her: the first one did it */
      talk();
    };
    stand.appendChild(hit);
    /* owner 2026-11-18 («حط علامة لو عايز أقفلها»): ✕ hides her for this tab; janna.js's own small corner button stays for chat/call */
    var cl = el("button", "jw-cl", "✕"); cl.type = "button"; cl.setAttribute("aria-label", S.hide); cl.title = S.hide;
    cl.onclick = function (ev) { if (ev) { ev.preventDefault(); ev.stopPropagation(); } closeHer(); };
    stand.appendChild(cl);
    D.body.appendChild(stand);
    barOffset(); W.addEventListener("resize", barOffset); setTimeout(barOffset, 2500);
    watchControls(); watchHover(); watchDialogs(); watchEnd(); watchActivity();
    D.addEventListener("visibilitychange", function () {
      if (!stand) return;
      if (D.hidden) pauseIdle();
      else if (!talking && started) playIdle();
    });
    /* back from the back/forward cache: the browser paused her videos when it put the page away — a clip she was saying ends (the
       invitation again), her idle motion goes on */
    W.addEventListener("pageshow", function (e) {
      if (!e || !e.persisted || !stand) return;
      if (talking && vTalk && vTalk.paused && !vTalk.ended) talkPaused();
      else if (!talking && started) playIdle();
    });
    /* Esc closes her box while it is shown (not while it waits aside with her: that Esc is for the visitor's field or the page's dialog) */
    D.addEventListener("keydown", function (e) { if ((e.key === "Escape" || e.key === "Esc") && bubble && !awayOn) { shut(); closeBubble(); } });
    W.addEventListener("bassem:change", function () { setTimeout(checkState, 0); });
    setInterval(checkState, 1500);
    /* an open janna.js conversation keeps the page: she waits until it is minimised; its figure alone goes to its corner */
    if (jannaTalks()) { handed = true; stand.classList.add("out"); watchJanna(); return; }
    if (shown(jfig())) jannaCorner();
    why.f = coveredFocus() ? 1 : 0; why.d = dialogOpen() ? 1 : 0; why.e = atEnd() ? 1 : 0;
    if (why.f || why.d || why.e) { awayOn = true; stand.classList.add("away"); }
    begin();
  }
  function begin() {
    if (started || !stand) return; started = true;
    DE.classList.add("jw-on"); DE.classList.add("jw-has");
    if (bassemOn() || liveUp()) held = true;
    if (CAN && !STILL) {
      vIdle = mkVideo(BASE + "janna-cut-idle.mp4", true);
      vIdle.addEventListener("playing", function () { if (!talking) useVideo(vIdle); });
      vIdle.addEventListener("error", function () { vIdle = null; if (!talking) playIdle(); });
      stillT = setTimeout(function () { if (!drawn && !awayOn) showStill(); }, 3500);
      if (held) showStill(); else playIdle();
    } else showStill();
  }
  function init() {
    if (init.done) return; init.done = 1;
    /* «🛠️ المطوّر» → «المزايا» (data/flags.js): the owner switched the standing figures off → she does not stand (janna.js keeps its corner) */
    flagsThen(function () {
      if (flagOff("standing_figures")) return;
      try { build(); } catch (e) { try { giveUp(); } catch (e2) {} }
    });
  }
  function flagOff(k) { var F = W.MIGFLAGS; return !!(F && F.on && F.on(k) === false); }
  function flagsThen(fn) { var F = W.MIGFLAGS; if (F && F.ready) F.ready(fn, 3000); else fn(); }
  /* a switch that arrives after she stood (a slow answer): she steps out / her box closes */
  W.addEventListener("mig:flags", function () {
    try { if (stand && flagOff("standing_figures")) { stopTalk(); giveUp(); } else if (bubble && flagOff("janna_welcome")) closeBubble(); } catch (e) {}
  });
  function whenIdle() {
    if (whenIdle.on) return; whenIdle.on = 1;
    if (W.requestIdleCallback) W.requestIdleCallback(init, { timeout: 2500 }); else setTimeout(init, 400);
  }
  if (D.readyState === "complete") whenIdle();
  else {
    W.addEventListener("load", whenIdle);
    /* a page whose load event never comes (a hanging third-party request) still gets her, a little later */
    var safety = function () { setTimeout(whenIdle, 9000); };
    if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", safety); else safety();
  }

  /* janna.js's corner button (when it shows while she stands) → she answers */
  D.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(".jn-mini") : null;
    if (!t || !stand || handed || bubble || !DE.classList.contains("jw-on")) return;
    if (talk()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  W.JANNA_WELCOME = {
    open: function () { return talk(); },
    close: function () { closeBubble(); },
    key: KEY, lang: EN ? "en" : "ar", voiced: !!CLIP,
    /* QA: her opacity (0..255) at a point on screen, and her state */
    alphaAt: alphaAt,
    state: function () { return { path: !CAN ? "still" : GLR ? "gl" : "2d", resting: rest, drawn: drawn, away: awayOn, why: [why.f, why.d, why.e].join(""), handed: handed, held: held, talking: talking, pending: pend ? pend.name : null,
      box: bubble ? (bubble.classList.contains("cap") ? "captions" : "invite") : null, probe: probe, spoke: talking && spoke }; }
  };
})();
