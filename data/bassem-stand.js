/* bassem-stand.js — Bassem («باسم», the business advisor of Core Partner & Strategic Partner members) STANDS at the bottom-left edge of
   his own page, /advisor/ (Arabic, and the same page in English), as a cut-out person (no box, no background), alive with his real Anam
   idle motion. Owner 2026-11-18: «وباسم نفس الموضوع» — the same as the standing Janna (data/janna-welcome.js, same size: --bst-w =
   23.8vw within 280–440 px on desktop (325 px at 1366), 178 px on phones). When the visitor taps him he talks IN PLACE with his real voice
   and lip-sync (one pre-rendered Anam clip of his welcome line), with a speech bubble beside him holding the words and the actions that
   fit who is looking:
     - an eligible signed-in partner / strategic member (data/bassem.js BASSEM.info(): plan confirmed by the server, service period running,
       the page not on its lock box): 🎥 «كلّمني فيديو» = the page's own Bassem call (#advLive → BASSEM.video → Janna Live, Bassem
       persona) — offered only once a server confirmed the session on this page (callOK) —, 📂 «فرص النهارده» (scrolls to the daily
       brief), 💬 the brief's search box (#advQ) when the page has it;
     - a member whose 365 days ended: 🔄 renew (the page's own renewal link) + 📞 contact;
     - everyone else: 📦 «اعرف باقات الشريك» (the lock box's plans link, partner plan preselected), 🔑 «دخول الأعضاء» (the page's own
       e-mail-code sign-in: [data-miglogin] → MIGAPI.open), 💬 «اسأل جنة» (JANNA.restore(false) when her engine runs here, else /contact/).
     A live call is never started for anyone who is not an eligible member (checked again at the tap).
   - Media: packed-alpha H.264 MP4s (colour on top 480x416, 16 px gutter, alpha as grey below: img/bassem/stand/bassem-cut-*.mp4)
     composited into a <canvas>, so they play everywhere incl. iOS Safari; a short dissolve hides the head-position jump between idle and
     talk (the idle loop's own seam is a motion-compensated blend: no double face). Nothing loads before window load + an idle moment
     (videos preload="none" until played); prefers-reduced-motion / Save-Data
     (or no canvas / H.264) → the still cut-out PNG, a tap still works. No sound before a tap. English: the same words as TEXT only, his
     idle motion stays — no Arabic voice, never lip movement without his voice (a blocked autoplay shows «🔊» instead of a silent clip).
   - While he stands, data/bassem.js's own figure / round headshot / corner bubble (.bs-fig, .bs-mini, .bs-bub) wait (BASSEM.say from the
     page lands in his speech bubble instead), and so do Janna's corner button and figure (.jn-mini, .jn-fig) until 💬 «اسأل جنة» hands the
     page to her (he steps out while her chat — janna.js's figure, her chat panel .jn-bub / html.jn-bubon, her stage or card — is open,
     and comes back once it is closed; her chat opening by itself makes him step out too: one assistant at a time). If the standing
     figure fails they are all back.
   - He holds still and steps out under bassem.js's first-sign-in welcome (.bs-wel), the deal room (body.adr-on) and the live call (.jnl);
     the phone menu (html.nav-open) hides him, his bubble and his hint (no clicks taken there either) and pauses him until it closes.
     He slides aside while a form control under him is focused, or while a page dialog is open. Only his solid head takes a tap (his
     shoulders and the transparent pixels around his head pass clicks on to the page); he turns see-through (and lets every click
     through) while a page action sits under him: a button / .btn link / field under his face or mostly under him; a text link under his
     solid head on touch screens; on desktop the link / button the mouse points at through him; and at the page bottom (where nothing
     can be scrolled out from under him) any link mostly hidden by him. His hint never sits on a page link / button / field (beside his
     head, else above it, else not now; it goes when the page scrolls one under it). On phones he stands on top of a fixed bottom bar;
     in English (LTR) the WhatsApp / to-top floats move to the right side while he stands on the left.
   ES5, no deps. Loaded (defer) on /advisor/ and the members' /dashboard/ (site.py). */
(function () {
  "use strict";
  if (window.__bassemStand) return; window.__bassemStand = 1;
  var W = window, D = document, DE = D.documentElement;
  try { if (W.top !== W) return; } catch (e0) { return; }
  if (W.JANNA_EMBED || W.JANNA_KIOSK) return;
  /* «باسم معاك»: a page that came out of his live call (data/janna-live.js, loaded before this file, sets window.MIG_WB; the same test
     here) — the live Bassem is in the call's tab: no second, recorded Bassem standing, greeting or offering a call here; the bar
     (data/bassem-tab.js) leads back to the call */
  if ((function () {
    var now = new Date().getTime(), t = 0, s = 0, m = null;
    if (W.MIG_WB === true || W.MIG_WB === false) return W.MIG_WB;
    try { m = /^mig-bassem-(\d{12,14})$/.exec(String(W.name || "")); } catch (e) {}
    if (m) t = +m[1];
    if (!t && /[?&]with=bassem(?:&|$)/.test(location.search)) t = now;
    try { s = +W.sessionStorage.getItem("mig-wb") || 0; if (t > s) W.sessionStorage.setItem("mig-wb", String(t)); } catch (e) {}
    if (!t) t = s;
    W.MIG_WB = t > 0 && now - t < 144e5 && now - t > -6e4;
    return W.MIG_WB;
  })()) return;
  var PATH = location.pathname || "/";
  /* his page only: the advisor (window.MIGPAGE from site.py; the clean URL /advisor/, an /en/advisor/ twin, the old advisor.html) */
  var DASH = String(W.MIGPAGE || "") === "dashboard" || /^\/(en\/)?dashboard(\/|\/index\.html|\.html)?$/.test(PATH);
  if (!(DASH || String(W.MIGPAGE || "") === "advisor" || /^\/(en\/)?advisor(\/|\/index\.html|\.html)?$/.test(PATH))) return;
  var EN = /^\/en(\/|$)/.test(PATH) || String(W.MIGLANG || DE.getAttribute("lang") || "ar").slice(0, 2).toLowerCase() === "en";
  var BASE = "/img/bassem/stand/";
  var VER = { idle: "75cb41d6", poster: "c7eaf67c", talk: "a7343546" };   /* idle: md5-8 of the re-cut loop (2026-11-19: the sha1 key bb4e95ef was cached with the previous clip) */
  var IDLE = BASE + "bassem-cut-idle.mp4?v=" + VER.idle, POSTER = BASE + "bassem-cut-idle.png?v=" + VER.poster;
  var TALK = EN ? null : BASE + "bassem-cut-advisor.mp4?v=" + VER.talk;
  /* the words he says in the clip (Anam render «Bassem - MIEG Office v3»), and the same in English (text only) */
  var LINE = EN
    ? "Welcome, it's a pleasure to have you here! I'm Bassem, the business advisor at Made in Egypt Gate. Every day I work with Core Partner and Strategic Partner members: I bring them new opportunities from official sources and follow up with them step by step until the deal closes. And if you're not a member yet, choose a partner plan and I'm with you from day one."
    : "أهلاً بيك يا فندم ونوّرت! أنا باسم، مستشار الأعمال في منصة صنع في مصر. بشتغل كل يوم مع أعضاء باقة الشريك الأساسي والشريك الاستراتيجي: بجيبلهم الفرص الجديدة من المصادر الرسمية، وبتابع معاهم خطوة بخطوة لحد ما الصفقة تتقفل. ولو حضرتك لسه مش مشترك، اختار باقة الشريك، وأنا معاك من أول يوم.";
  var S = EN ? {
    tag: "Bassem · Business advisor", hit: "Talk to Bassem, business advisor", dlg: "Bassem · Business advisor (AI assistant)", x: "Close", snd: "🔊 Play his voice",
    hint: "I'm Bassem 👋 your advisor for deals and daily opportunities",
    call: "🎥 Video call me", brief: "📂 Today's opportunities", ask: "💬 Tell me what you're looking for",
    plans: "📦 See the partner plans", login: "🔑 Member sign-in", janna: "💬 Ask Janna", renew: "🔄 Renew", contact: "📞 Contact us",
    nocall: "Video calls are not available right now. Please try again shortly; I'm here with you meanwhile.",
    oops: "Sorry, I couldn't open that just now. Please try again in a moment."
  } : {
    tag: "باسم · مستشار الأعمال", hit: "كلّم باسم، مستشار الأعمال", dlg: "باسم · مستشار الأعمال (مساعد بالذكاء الاصطناعي)", x: "إغلاق", snd: "🔊 شغّل الصوت",
    hint: "أنا باسم 👋 مستشار صفقاتك وفرصك اليومية",
    call: "🎥 كلّمني فيديو", brief: "📂 فرص النهارده", ask: "💬 اكتبلي بتدوّر على إيه",
    plans: "📦 اعرف باقات الشريك", login: "🔑 دخول الأعضاء", janna: "💬 اسأل جنة", renew: "🔄 جدّد الاشتراك", contact: "📞 تواصل معنا",
    nocall: "مكالمة الفيديو مش متاحة دلوقتي. جرّب تاني بعد شوية، وأنا معاك هنا لحد كده.",
    oops: "معلش، مقدرتش أفتحها دلوقتي. جرّب تاني كمان شوية."
  };
  var DIR = EN ? "ltr" : "rtl";
  var PHONE_MQ = "(max-width:640px),(max-height:520px)";
  var css = ""
    /* the standing cut-out: no box, no background; he stands at the page's bottom-left edge (cut by the screen bottom). Above the page
       and data/bassem.js's own layers (65/66), below the sign-in dialog (9400), his welcome overlay (9500) and the live call. His size
       follows the standing Janna's: 23.8vw within 280–440 px (325 px at 1366), 178 px on phones; everything beside him scales with it */
    + "html{--bst-w:325px}@supports (width:clamp(1px,1vw,2px)){html{--bst-w:clamp(280px,23.8vw,440px)}}"
    + ".bst-st{position:fixed;z-index:9200;left:0;bottom:var(--bst-b,0px);width:325px;height:282px;width:var(--bst-w);height:calc(var(--bst-w)*.8667);pointer-events:none;margin:0;padding:0;"
    + "transform:translateX(-110%);transition:transform 1s cubic-bezier(.2,.85,.25,1.08),opacity .3s ease}"
    + ".bst-st.in{transform:none}.bst-st.in.away,.bst-st.out,.bst-st.in.out{transform:translateX(-110%)}"
    /* a page control behind him (under his face, or mostly under him): he turns see-through and lets every click through to it */
    + ".bst-st{opacity:1}.bst-st.ghost{opacity:.35}.bst-st.ghost .bst-hit{pointer-events:none}.bst-nt{transition:opacity .3s}.bst-st.ghost .bst-nt{opacity:0}"
    + ".bst-st canvas,.bst-st .bst-pos{position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;display:block;margin:0}"
    + ".bst-st .bst-pos{transition:opacity .25s}.bst-st.live .bst-pos{opacity:0}"
    + ".bst-st video{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;pointer-events:none}"
    + ".bst-st .bst-gr{position:absolute;left:8%;right:8%;bottom:-20px;height:42px;bottom:calc(var(--bst-w)*-.0615);height:calc(var(--bst-w)*.129);border-radius:50%;"
    + "background:radial-gradient(ellipse at center,rgba(2,6,23,.38) 0,rgba(2,6,23,.16) 45%,rgba(2,6,23,0) 72%)}"
    /* only his head and neck take the tap: clicks on his shoulders reach the page under him */
    + ".bst-hit{position:absolute;left:32%;right:32%;top:3%;bottom:31%;pointer-events:auto;cursor:pointer;border:0;background:transparent;padding:0;margin:0;"
    + "min-height:0;box-shadow:none;border-radius:46% 46% 40% 40%;-webkit-tap-highlight-color:transparent}"
    + ".bst-nt{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);white-space:nowrap;pointer-events:none;"
    + "background:rgba(11,31,58,.9);color:#fff;border:1px solid rgba(192,147,0,.75);font:700 12px/1.2 Cairo,Tajawal,Tahoma,sans-serif;padding:5px 11px;border-radius:999px;"
    + "box-shadow:0 4px 12px rgba(2,6,23,.3)}"
    + ".bst-aib{display:inline-block;margin-inline-start:5px;padding:0 4px;border-radius:5px;background:#C09300;color:#1A1204;font:800 9.5px/15px Tahoma,sans-serif}"
    + ".bst-nt:before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-inline-end:6px;vertical-align:middle;box-shadow:0 0 0 2px rgba(34,197,94,.3)}"
    + ".bst-st.talk .bst-nt:before{background:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,.35)}"
    + "@keyframes bstIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}"
    /* his short hint, beside his head (.up: above his head, when the page has a link / button / field beside it) */
    + ".bst-hint{position:fixed;z-index:9210;left:240px;bottom:calc(var(--bst-b,0px) + 200px);left:calc(var(--bst-w)*.738);bottom:calc(var(--bst-b,0px) + var(--bst-w)*.615);max-width:250px;box-sizing:border-box;margin:0;background:#fff;color:#0f172a;"
    + "border:1px solid #e3d3a1;border-radius:16px 16px 16px 4px;padding:10px 14px;font:600 13px/1.6 Cairo,Tajawal,Tahoma,sans-serif;box-shadow:0 10px 28px rgba(2,6,23,.22);"
    + "animation:bstHi .35s ease both;cursor:pointer}"
    + "@keyframes bstHi{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}"   /* (in place: never over its neighbours while it appears) */
    + ".bst-hint.up{left:20px;bottom:calc(var(--bst-b,0px) + 290px);left:calc(var(--bst-w)*.06);bottom:calc(var(--bst-b,0px) + var(--bst-w)*.8667 + 8px)}"
    /* the speech bubble beside him (never over his face) */
    + ".bst-sb{position:fixed;z-index:9220;left:300px;bottom:calc(var(--bst-b,0px) + 64px);width:min(380px,calc(100vw - 316px));"
    + "left:calc(var(--bst-w)*.923);bottom:calc(var(--bst-b,0px) + var(--bst-w)*.197);width:min(380px,calc(100vw - var(--bst-w)*.923 - 16px));max-height:calc(100vh - var(--bst-b,0px) - 90px);"
    + "overflow:auto;box-sizing:border-box;margin:0;padding:0;background:#fff;color:#0f172a;border-top:4px solid #C09300;border-radius:18px 18px 18px 6px;"
    + "box-shadow:0 16px 44px rgba(2,6,23,.28);font-family:Cairo,Tajawal,Tahoma,sans-serif;text-align:start;animation:bstIn .3s cubic-bezier(.2,.8,.25,1) both}"
    + ".bst-tail{position:fixed;z-index:9221;left:291px;bottom:calc(var(--bst-b,0px) + 92px);left:calc(var(--bst-w)*.895);bottom:calc(var(--bst-b,0px) + var(--bst-w)*.283);width:0;height:0;border:10px solid transparent;border-left:0;border-right-color:#fff;"
    + "filter:drop-shadow(-2px 1px 1px rgba(2,6,23,.08));pointer-events:none}"
    + ".bst-sb .bst-who{margin:0;padding:10px 16px 0 36px;font:800 12px/1.4 Cairo,Tajawal,Tahoma,sans-serif;color:#8a6a00}"
    + ".bst-sb[dir=ltr] .bst-who{padding:10px 36px 0 16px}"
    + ".bst-sb .bst-txt{margin:0;padding:4px 16px 2px 36px;font-size:14px;line-height:1.75;font-weight:600;color:#0f172a}"
    + ".bst-sb[dir=ltr] .bst-txt{padding:4px 36px 2px 16px}"
    + ".bst-sb .bst-acts{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:8px 12px 12px}"
    + ".bst-sb .bst-acts button{flex:1 1 auto;margin:0;min-height:0;border:0;border-radius:12px;padding:9px 10px;font:700 13px/1.4 Cairo,Tajawal,Tahoma,sans-serif;cursor:pointer;"
    + "background:#eef2f7;color:#0f172a;box-shadow:none;text-transform:none;letter-spacing:0}"
    + ".bst-sb .bst-acts .bst-call{background:#c8102e;color:#fff}.bst-sb .bst-acts .bst-plans,.bst-sb .bst-acts .bst-renew{background:#C09300;color:#1A1204}"
    + ".bst-sb .bst-acts .bst-login{background:#0b1f3a;color:#fff}"
    + ".bst-sb .bst-x{position:absolute;top:8px;left:6px;right:auto;width:26px;height:26px;min-height:0;margin:0;padding:0;border-radius:50%;border:0;"
    + "background:#eef2f7;color:#334155;font:13px/26px Tahoma,sans-serif;text-align:center;cursor:pointer;box-shadow:none}"
    + ".bst-sb[dir=ltr] .bst-x{left:auto;right:6px}"
    + ".bst-sb .bst-snd{display:inline-block;margin:8px 14px 0;min-height:0;border:0;border-radius:999px;background:#c8102e;color:#fff;font:600 12px/1.4 Cairo,Tahoma,sans-serif;padding:6px 12px;cursor:pointer}"
    + ".bst-sb .bst-snd[hidden]{display:none}"
    + ".bst-sb .bst-acts button:focus-visible,.bst-sb .bst-x:focus-visible,.bst-sb .bst-snd:focus-visible,.bst-hit:focus-visible{outline:3px solid #C09300;outline-offset:2px}"
    /* while he stands, he is the page's Bassem (and its only figure): bassem.js's own figure / headshot / bubble and Janna's corner wait */
    + "html.bst-on .bs-fig,html.bst-on .bs-mini,html.bst-on .bs-bub{display:none!important}"
    + "html.bst-jn .jn-mini,html.bst-jn .jn-fig{display:none!important}"
    /* the captions toggle and (English, left-to-right) the WhatsApp / to-top floats would sit on him: they move beside him / to the right */
    + "html.bst-on .mig-ccbtn{left:calc(env(safe-area-inset-left,0px) + 333px)!important;left:calc(env(safe-area-inset-left,0px) + var(--bst-w) + 8px)!important}"
    + "html.bst-on.bst-ltr .wa-float,html.bst-on.bst-ltr .totop{inset-inline-start:auto!important;inset-inline-end:calc(18px + env(safe-area-inset-right,0px))!important}"
    /* the deal room drawer takes the page: no figure over it (like the page's own rule for the other assistants) */
    + "body.adr-on .bst-st,body.adr-on .bst-sb,body.adr-on .bst-tail,body.adr-on .bst-hint{display:none!important}"
    /* the phone menu covers the page: he, his bubble and his hint are not there (and take no tap) until it closes, like Janna */
    + "html.nav-open .bst-st,html.nav-open .bst-sb,html.nav-open .bst-tail,html.nav-open .bst-hint{visibility:hidden!important;pointer-events:none!important}"
    + "html.nav-open .bst-hit,html.nav-open .bst-sb *{pointer-events:none!important}"
    + "@media " + PHONE_MQ + "{html{--bst-w:178px}.bst-st{width:178px;height:154px}"
    + ".bst-nt{font-size:10px;padding:3px 8px;bottom:5px}.bst-aib{font-size:8px;line-height:12px;padding:0 3px}.bst-nt:before{width:6px;height:6px;margin-inline-end:4px}"
    + ".bst-st .bst-gr{bottom:-14px;height:28px}"
    + ".bst-hint{left:132px;bottom:calc(var(--bst-b,0px) + 104px);max-width:min(220px,calc(100vw - 142px));font-size:12px;padding:8px 12px}"
    + ".bst-hint.up{left:10px;bottom:calc(var(--bst-b,0px) + 162px)}"
    + ".bst-sb{left:140px;bottom:calc(var(--bst-b,0px) + 40px);width:min(360px,calc(100vw - 148px));max-height:calc(100vh - var(--bst-b,0px) - 60px)}"
    + ".bst-tail{left:131px;bottom:calc(var(--bst-b,0px) + 56px)}"
    + ".bst-sb .bst-who{padding:8px 12px 0 30px;font-size:11px}.bst-sb[dir=ltr] .bst-who{padding:8px 30px 0 12px}"
    + ".bst-sb .bst-txt{font-size:12.5px;line-height:1.65;padding:2px 12px 2px 30px}.bst-sb[dir=ltr] .bst-txt{padding:2px 30px 2px 12px}"
    + ".bst-sb .bst-acts{flex-direction:column;gap:6px;padding:6px 10px 10px}.bst-sb .bst-acts button{padding:7px 8px;font-size:12px}"
    + "html.bst-on .mig-ccbtn{left:calc(env(safe-area-inset-left,0px) + 186px)!important}}"
    + "@media (prefers-reduced-motion:reduce){.bst-st{transition:opacity .2s;transform:none}.bst-sb,.bst-hint{animation:none}}";
  var st0 = D.createElement("style"); st0.textContent = css; (D.head || DE).appendChild(st0);
  function el(tag, cls, txt) { var x = D.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
  function lsSet(k, v) { try { if (v == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) {} }

  var REDUCED = false, SAVE = false;
  try { REDUCED = !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  try { var cn = navigator.connection || navigator.mozConnection || navigator.webkitConnection; SAVE = !!(cn && cn.saveData); } catch (e) {}
  try { if (!SAVE && W.matchMedia) SAVE = W.matchMedia("(prefers-reduced-data: reduce)").matches; } catch (e) {}
  var STILL = REDUCED || SAVE;   /* the still cut-out, no idle video (a tap still plays his voice clip) */

  /* ---------------- who is looking: the page's own state (data/bassem.js + the advisor page's gate) ---------------- */
  function who() {
    var B = W.BASSEM, i = null; try { i = B && B.info ? B.info() : null; } catch (e) { i = null; }
    if (i && i.eligible && !DE.classList.contains("adv-gate")) return i.expired ? "expired" : "member";
    return "visitor";
  }
  function isMember() { return who() === "member"; }
  /* 🎥 only for a membership a server confirmed on this page: the platform session once GET /api/me answered (MIGAPI.confirmed — what
     bassem.js requires for «eligible» too), or an activation-link session once the advisor page reached its server with it (its own
     «🟢 live» status chip in the hero). A copy of either session in this browser's storage alone is not enough; the Worker checks the
     member again when the call is placed. */
  function callOK() {
    var A = W.MIGAPI;
    try { if (A && A.token && A.token()) return !!(A.confirmed && A.confirmed()); } catch (e) { return false; }
    return !!D.querySelector("#advHx .live");
  }
  function whoKey() { var w = who(); return w === "member" && callOK() ? "member+call" : w; }

  /* ---------------- the standing cut-out ---------------- */
  var CW = 480, CH = 416, AY = 432;            /* packed frame: colour 480x416 on top, 16px gutter, alpha 480x416 from y=432 */
  var CAN = false, stand = null, cv = null, ctx = null, off = null, octx = null, buf = null, bctx = null, snap = null, sctx = null, img = null;
  var vIdle = null, vTalk = null, cur = null, talkBad = false, started = false, stillT = 0, gone = false;
  var bubble = null, tail = null, txt = null, actsBox = null, snd = null, drawn = false, lastT = -1, raf = 0, talking = false, fadeT0 = 0, fading = false, lastDraw = 0;
  var handed = false, handT0 = 0, downAt = 0, held = false, outFor = false, jmo = null, liveA = null, amap = null;
  var LUT = new Uint8Array(256);
  (function () { for (var i = 0; i < 256; i++) LUT[i] = i < 10 ? 0 : i > 245 ? 255 : Math.round((i - 10) * 255 / 235); })();
  function canVideo() {
    try {
      var c = D.createElement("canvas"), v = D.createElement("video");
      return !!(c.getContext && c.getContext("2d") && v.canPlayType && v.canPlayType('video/mp4; codecs="avc1.4D401E"'));
    } catch (e) { return false; }
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
    ghostSoon(0);
    scheduleHints();
  }
  /* the still cut-out (reduced motion, Save-Data, no video, or while the idle video is still on its way) */
  function showStill() {
    if (!img) return;
    if (img.getAttribute("src")) { if (img.complete && img.naturalWidth) slideIn(); return; }
    img.onload = function () { slideIn(); };
    img.onerror = function () { if (!drawn) giveUp(); };
    img.src = POSTER;
  }
  /* nothing of him can show: the page gets bassem.js's own figure / headshot and Janna's corner button back */
  function giveUp() {
    gone = true;
    try { if (raf) W.cancelAnimationFrame(raf); } catch (e) {} raf = 0;
    try { if (vIdle) vIdle.pause(); if (vTalk) vTalk.pause(); } catch (e) {}
    closeBubble(true); hideHint();
    if (stand && stand.parentNode) stand.parentNode.removeChild(stand); stand = null;
    DE.classList.remove("bst-on"); DE.classList.remove("bst-jn"); DE.classList.remove("bst-ltr");
  }
  function canvasFail() {
    CAN = false; talking = false; cur = null;
    try { if (raf) W.cancelAnimationFrame(raf); } catch (e) {} raf = 0;
    try { if (vIdle) vIdle.pause(); if (vTalk) vTalk.pause(); } catch (e) {}
    if (stand) { stand.classList.remove("live"); stand.classList.remove("talk"); }
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    showStill();
  }
  function draw() {
    if (!cur || cur.readyState < 2 || !CAN) return;
    var t = cur.currentTime, fresh = !(t === lastT && drawn);
    if (!fresh && !fading) return; lastT = t;
    try {
      if (fresh) {
        octx.drawImage(cur, 0, 0, CW, AY + CH);
        var col = octx.getImageData(0, 0, CW, CH), al = octx.getImageData(0, AY, CW, CH).data, d = col.data, n = d.length;
        for (var i = 3; i < n; i += 4) d[i] = LUT[al[i - 3]];
        bctx.putImageData(col, 0, 0);
        liveA = d;   /* his silhouette in this frame (which taps are his: opaqueAt) */
      }
      /* a short dissolve when he switches between idle and talking, so his head never jumps */
      var k = fading ? Math.min(1, (Date.now() - fadeT0) / 420) : 1;
      ctx.clearRect(0, 0, CW, CH);
      if (k < 1) { ctx.globalAlpha = 1 - k; ctx.drawImage(snap, 0, 0); ctx.globalAlpha = k; }
      ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1;
      if (k >= 1) fading = false;
    } catch (e) { canvasFail(); return; }
    if (!drawn) { drawn = true; stand.classList.add("live"); slideIn(); }
  }
  function loop(ts) {
    raf = 0; if (!stand || !CAN) return;
    if (!D.hidden && (fading || !ts || ts - lastDraw >= 38)) { lastDraw = ts || 0; draw(); }
    if ((cur && !cur.paused) || fading) raf = W.requestAnimationFrame(loop);
  }
  function kick() { if (!raf && CAN && W.requestAnimationFrame) raf = W.requestAnimationFrame(loop); }
  function useVideo(v) {
    if (cur === v) return kick();
    if (drawn && snap) { try { sctx.clearRect(0, 0, CW, CH); sctx.drawImage(cv, 0, 0); fading = true; fadeT0 = Date.now(); } catch (e) {} }
    cur = v; lastT = -1; kick();
  }
  function playIdle() {
    talking = false; if (stand) stand.classList.remove("talk");
    if (!CAN || STILL || !vIdle) {
      cur = null; drawn = false; if (stand) stand.classList.remove("live");
      try { if (ctx) ctx.clearRect(0, 0, CW, CH); } catch (e) {}
      showStill(); return;
    }
    if (handed || held || D.hidden) return;
    useVideo(vIdle);
    try { var p = vIdle.play(); if (p && p.catch) p.catch(function () { if (!drawn) showStill(); }); } catch (e) { if (!drawn) showStill(); }
  }
  function pauseAll() {
    try { if (vIdle) vIdle.pause(); } catch (e) {}
    if (talking) stopTalk();
  }
  function stopTalk() {
    var was = talking; talking = false; if (stand) stand.classList.remove("talk");
    if (was && vTalk) { try { vTalk.pause(); } catch (e) {} }
  }
  function talkFail() {
    talkBad = true; var was = talking; talking = false; if (stand) stand.classList.remove("talk");
    if (snd) snd.hidden = true;
    if (was) playIdle();
  }
  /* his voice: the welcome clip, with sound (a tap is the gesture); a refused play shows «🔊», never a silent clip */
  function startTalk() {
    if (!TALK || !CAN || talkBad || !stand) return;
    if (!vTalk) {
      vTalk = mkVideo(TALK, false);
      vTalk.addEventListener("playing", function () { if (talking) { useVideo(vTalk); try { if (vIdle) vIdle.pause(); } catch (e) {} } });
      vTalk.addEventListener("ended", function () { if (talking) playIdle(); });
      vTalk.addEventListener("error", function () { talkFail(); });
    }
    vTalk.preload = "auto";
    talking = true; stand.classList.add("talk");
    var p = null;
    try { vTalk.muted = false; vTalk.volume = 1; if (vTalk.currentTime > 0) vTalk.currentTime = 0; p = vTalk.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () {
      if (!talking) return; talking = false; if (stand) stand.classList.remove("talk");
      if (snd && !talkBad) snd.hidden = false;
      playIdle();
    });
    if (!vTalk.paused && vTalk.readyState >= 3) useVideo(vTalk);
  }

  /* ---------------- the speech bubble and his actions ---------------- */
  function closeBubble(silent) {
    if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
    if (tail && tail.parentNode) tail.parentNode.removeChild(tail);
    bubble = null; tail = null; txt = null; actsBox = null; snd = null;
    if (!silent && talking) { stopTalk(); playIdle(); }
    if (stand) ghostSoon(450);
  }
  function cleanUrl(file, clean) { return document.querySelector('base[href="/"]') || !/\.html?$/i.test(PATH) ? clean : file; }
  function go(u) { if (EN) lsSet("mig-lang", "en"); location.href = u; }
  function plansUrl() {
    var a = D.querySelector('.advlock a[href*="register"]');
    return a && a.href ? a.href : cleanUrl("register.html#partner", "/register/#partner");
  }
  function renewUrl() {
    /* the plan from the page's own renewal link (built by the page's script as register.html#<plan>), on the site's clean URL */
    var a = D.querySelector('#advHx a[href*="register"]'), h = a && a.hash && /^#[\w-]+$/.test(a.hash) ? a.hash : "#partner";
    return cleanUrl("register.html" + h, "/register/" + h);
  }
  function jannaHere() { return !!(W.JANNA && typeof W.JANNA.restore === "function" && (D.querySelector(".jn-mini") || D.querySelector(".jn-fig"))); }
  function say(t) { if (txt) txt.textContent = t; }
  function scrollTo(e, block) { try { e.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: block || "start" }); } catch (x) { try { e.scrollIntoView(); } catch (y) {} } }
  function act(name) {
    if (name === "call") {
      /* the page's own Bassem call, for an eligible member whose session a server confirmed — checked again now */
      if (!isMember() || !callOK()) { fillActs(); return; }
      if (!(W.JANNA_LIVE && typeof W.JANNA_LIVE.open === "function")) { say(S.nocall); return; }
      stopTalk(); closeBubble(true); hideHint(); playIdle();
      var lv = D.getElementById("advLive");
      try { if (lv && !lv.disabled) lv.click(); else if (W.BASSEM && W.BASSEM.video) W.BASSEM.video(); } catch (e) { }
      return;
    }
    if (name === "brief" || name === "ask") {
      var s = D.getElementById("brief"), q = D.getElementById("advQ");
      if (!s || !s.offsetParent) { say(S.oops); return; }
      stopTalk(); closeBubble(true); playIdle();
      if (name === "ask" && q) { scrollTo(q, "center"); setTimeout(function () { try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); } }, REDUCED ? 0 : 450); }
      else scrollTo(s, "start");
      return;
    }
    if (name === "plans") { stopTalk(); closeBubble(true); go(plansUrl()); return; }
    if (name === "renew") { stopTalk(); closeBubble(true); go(renewUrl()); return; }
    if (name === "contact") { stopTalk(); closeBubble(true); go(cleanUrl("contact.html", "/contact/")); return; }
    if (name === "login") {
      stopTalk(); closeBubble(true); playIdle();
      if (W.MIGAPI && typeof W.MIGAPI.open === "function") return;   /* the page's own [data-miglogin] handler opens the e-mail-code sign-in */
      var w = D.getElementById("advWarn"), m = w && w.querySelector('input[type="email"]');
      if (w) scrollTo(w, "center");
      if (m) setTimeout(function () { try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } }, REDUCED ? 0 : 450);
      return;
    }
    if (name === "janna") {
      if (jannaHere()) { handTo(function () { W.JANNA.restore(false); }); return; }
      stopTalk(); closeBubble(true); go(cleanUrl("contact.html", "/contact/"));
    }
  }
  function actionList() {
    var w = who();
    if (w === "member") {
      var l = callOK() && !flagOff("bassem_live") ? [["call", "bst-call", S.call]] : [];   /* «🛠️ المطوّر»: Bassem's live calls switched off → no 🎥 */
      l.push(["brief", "bst-brief", S.brief]);
      if (D.getElementById("advQ")) l.push(["ask", "bst-ask", S.ask]);
      return l;
    }
    if (w === "expired") return [["renew", "bst-renew", S.renew], ["contact", "bst-contact", S.contact]];
    return [["plans", "bst-plans", S.plans], ["login", "bst-login", S.login], ["janna", "bst-janna", S.janna]];
  }
  function fillActs() {
    if (!actsBox) return;
    actsBox.innerHTML = "";
    var l = actionList(); actsBox.setAttribute("data-who", whoKey());
    l.forEach(function (a) {
      var b = el("button", a[1], a[2]); b.type = "button"; b.setAttribute("data-act", a[0]);
      if (a[0] === "login") b.setAttribute("data-miglogin", "");
      b.onclick = function () { setTimeout(function () { act(a[0]); }, 0); };
      actsBox.appendChild(b);
    });
  }
  function openBubble(line) {
    bubble = el("div", "bst-sb"); bubble.setAttribute("role", "dialog"); bubble.setAttribute("aria-label", S.dlg);
    bubble.setAttribute("translate", "no"); bubble.setAttribute("dir", DIR); bubble.setAttribute("lang", EN ? "en" : "ar");
    var x = el("button", "bst-x", "✕"); x.type = "button"; x.setAttribute("aria-label", S.x); x.onclick = function () { closeBubble(); };
    bubble.appendChild(x);
    var wh = el("p", "bst-who", S.tag); bubble.appendChild(wh);
    if (TALK && CAN && !talkBad) {
      snd = el("button", "bst-snd", S.snd); snd.type = "button"; snd.hidden = true;
      snd.onclick = function () { if (snd) snd.hidden = true; startTalk(); };
      bubble.appendChild(snd);
    }
    txt = el("p", "bst-txt", line); bubble.appendChild(txt);
    actsBox = el("div", "bst-acts"); bubble.appendChild(actsBox); fillActs();
    tail = el("span", "bst-tail"); tail.setAttribute("aria-hidden", "true");
    D.body.appendChild(bubble); D.body.appendChild(tail);
    ghostOn = false; hovOn = false; focOn = false; paintGhost();
  }
  function talk() {
    if (!stand || handed || held || gone) return false;
    setAway(false); hideHint();
    if (bubble) { closeBubble(); return true; }
    if (!stand.classList.contains("in")) slideIn();
    openBubble(LINE);
    if (TALK) startTalk();
    return true;
  }
  /* the page's own messages to the member (advisor's bassemTell → BASSEM.say) land in his bubble while he stands */
  function tell(t) {
    if (!stand || gone || !t) return;
    setAway(false); hideHint();
    if (talking) { stopTalk(); playIdle(); }
    if (!bubble) openBubble(t); else { say(t); fillActs(); }
  }
  function hookSay() {
    var B = W.BASSEM; if (!B || B.__bst || typeof B.say !== "function") return;
    var orig = B.say; B.__bst = 1;
    B.say = function (t) { if (stand && !gone && DE.classList.contains("bst-on") && !handed) { tell(String(t == null ? "" : t)); return; } return orig.apply(B, arguments); };
  }

  /* ---------------- 💬 Janna: one assistant at a time — he steps out while her chat is open, back once it is closed ----------------
     janna.js shows her chat on its own figure (public pages) or, on the members' tools such as this page (its QUIET mode), as a corner
     panel (.jn-bub.qd, a bottom sheet on phones) with her figure kept hidden — html.jn-bubon while it is open */
  function jfig() { return D.querySelector(".jn-fig"); }
  function jbub() { return D.querySelector(".jn-bub"); }
  function shown(e) {
    if (!e || e.hidden) return false;
    try { var cs = W.getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; } catch (x) {}
    var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  function jannaUp() {
    return !!(shown(jfig()) || shown(jbub()) || DE.classList.contains("jn-bubon") || D.querySelector(".jn-stage:not(.jn-wc),.jn-wc.big,.jn-spot:not([hidden])"));
  }
  function stepOut() {
    stopTalk(); closeBubble(true); hideHint(); setAway(false);
    handed = true; handT0 = Date.now(); downAt = 0; if (stand) stand.classList.add("out");
    pauseAll();
    DE.classList.remove("bst-jn");
    watchJanna();
  }
  function handTo(fn) {
    stepOut();
    try { fn(); } catch (e) { comeBack(); return; }
    setTimeout(watchJanna, 300);
  }
  function watchJanna() {
    if (jmo || !W.MutationObserver) return;   /* (checkState() polls too) */
    var f = jfig(), b = jbub();
    if (!f && !b) return;
    jmo = new W.MutationObserver(function () { if (handed) checkState(); });
    var o = { attributes: true, attributeFilter: ["hidden", "class", "style"] };
    try { if (f) jmo.observe(f, o); if (b) jmo.observe(b, o); } catch (e) {}
  }
  function comeBack() {
    if (!handed) return; handed = false; handT0 = 0; downAt = 0;
    if (jmo) { try { jmo.disconnect(); } catch (e) {} jmo = null; }
    if (!stand) return;
    DE.classList.add("bst-jn");
    stand.classList.remove("out");
    if (!started) begin(); else playIdle();
  }
  /* the live call, bassem.js's first-sign-in welcome or the deal room: he holds still (and steps out under the welcome / deal room) */
  function liveUp() { var o = D.querySelector(".jnl"); return !!(o && !o.hidden); }
  function welUp() { var w = D.querySelector(".bs-wel"); return !!(w && !w.hidden); }
  function roomUp() { return !!(D.body && D.body.classList.contains("adr-on")); }
  /* the phone menu (site.py header, html.nav-open) is open over the page */
  function navUp() { return DE.classList.contains("nav-open"); }
  var stateQ = 0;
  function checkState() {
    if (stateQ) { clearTimeout(stateQ); stateQ = 0; }
    if (!stand || gone) return;
    var cover = welUp() || roomUp(), hold = cover || liveUp() || navUp();
    if (hold && !held) { held = true; pauseAll(); hideHint(); hovOn = false; focOn = false; paintGhost(); if (liveUp() || cover) closeBubble(true); }
    else if (!hold && held) { held = false; if (!handed && started) playIdle(); }
    outFor = cover; stand.classList.toggle("out", cover || handed);
    if (handed) {
      /* back once her chat is closed (it stays closed for a moment: no coming and going while janna.js re-lays it out), or when she never
         came up (give her a moment to show) */
      if (jannaUp()) downAt = 0;
      else if (Date.now() - handT0 > 1200) {
        if (!downAt) downAt = Date.now();
        if (Date.now() - downAt >= 450) comeBack(); else stateQ = setTimeout(checkState, 500);
      }
    }
    else if (started && jannaUp()) stepOut();   /* her chat opened by itself (a page message, a resumed conversation): she has the page */
    if (bubble && actsBox && actsBox.getAttribute("data-who") !== whoKey()) fillActs();
    ghostSoon(0);
  }

  /* ---------------- hint, step aside, bottom bar ---------------- */
  var hint = null, hintN = 0, hintOn = false, hintT = 0, hintRetry = 0, hintTry = 0, hintQ = 0;
  function hideHint() { if (hintT) { clearTimeout(hintT); hintT = 0; } if (hint && hint.parentNode) hint.parentNode.removeChild(hint); hint = null; }
  /* would a box of ours (the hint) sit on — or touch — a page action (a link, button, field …) that the visitor can see there? */
  function onPage(e) {
    var q = e.getBoundingClientRect(); if (!q.width || !q.height) return true;
    if (q.left < 0 || q.top < 0 || q.right > W.innerWidth || q.bottom > W.innerHeight) return true;   /* (cut by the screen edge: no room) */
    var m = 4, list = D.querySelectorAll(ACT);
    for (var i = 0; i < list.length; i++) {
      var a = list[i]; if (mine(a)) continue;
      var r = a.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right <= q.left - m || r.left >= q.right + m || r.bottom <= q.top - m || r.top >= q.bottom + m) continue;
      var x = (Math.max(r.left, q.left - m) + Math.min(r.right, q.right + m)) / 2, y = (Math.max(r.top, q.top - m) + Math.min(r.bottom, q.bottom + m)) / 2;
      if (seen(a, Math.min(Math.max(x, 1), W.innerWidth - 1), Math.min(Math.max(y, 1), W.innerHeight - 1))) return true;
    }
    return false;
  }
  function showHint() {
    if (D.hidden || hintN >= 3 || !stand || gone || bubble || awayOn || handed || held || ghosted() || !stand.classList.contains("in")) return;
    hideHint();
    hint = el("div", "bst-hint", S.hint); hint.setAttribute("translate", "no"); hint.setAttribute("dir", DIR); hint.setAttribute("lang", EN ? "en" : "ar");
    hint.style.animation = "none"; hint.style.visibility = "hidden"; D.body.appendChild(hint);
    /* never on the page's own links / buttons / fields: beside his head, else above it, else not now (tried again a little later, a
       few times; then at the next round) */
    if (onPage(hint)) {
      hint.classList.add("up");
      if (onPage(hint)) {
        hideHint();
        if (!hintRetry && hintTry < 4) { hintTry++; hintRetry = setTimeout(function () { hintRetry = 0; showHint(); }, 9000); }
        return;
      }
    }
    hint.style.animation = ""; hint.style.visibility = "";
    hintN++; hintTry = 0;
    hint.onclick = function () { hideHint(); talk(); };
    hintT = setTimeout(hideHint, 7000);
  }
  /* the page scrolled a link / button under the hint: it goes */
  function hintCheck() { if (!hint || hintQ) return; hintQ = nextFrame(function () { hintQ = 0; if (hint && onPage(hint)) hideHint(); }); }
  function nextFrame(f) { return W.requestAnimationFrame ? W.requestAnimationFrame(f) : setTimeout(f, 16); }
  function scheduleHints() { if (hintOn) return; hintOn = true; setTimeout(showHint, 6500); setInterval(showHint, 45000); }
  function barOffset() {
    /* stand on top of a fixed bottom bar if the page has one, never over it */
    var b = 0;
    if (D.body) {
      var all = D.body.children, vh = W.innerHeight, vw = W.innerWidth, fw = stand ? stand.offsetWidth : 325;
      for (var i = 0; i < all.length; i++) {
        var e = all[i]; if (e === stand || e === bubble || e === tail || e === hint || e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
        var cs = W.getComputedStyle(e); if (cs.position !== "fixed" && cs.position !== "sticky") continue;
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        var r = e.getBoundingClientRect();
        if (r.bottom >= vh - 2 && r.top > vh * 0.6 && r.width >= vw * 0.6 && r.left < fw && r.height > 20 && r.height < 140) b = Math.max(b, Math.round(vh - r.top));
      }
    }
    DE.style.setProperty("--bst-b", b + "px");
  }
  /* he steps aside (slides off the left edge) while the visitor uses a form control he stands over, and comes back when they leave it */
  var awayOn = false, SEL = "input:not([type=hidden]),select,textarea,[contenteditable=true]";
  function mine(e) { return !!e && ((stand && stand.contains(e)) || (bubble && bubble.contains(e)) || (hint && hint.contains(e)) || (tail && tail === e)); }
  function hitsMe(e) {
    if (!stand || !e || !e.getBoundingClientRect) return false;
    var q = e.getBoundingClientRect(); if (!q.width || !q.height) return false;
    var w = stand.offsetWidth, h = stand.offsetHeight, vh = W.innerHeight;
    var b = parseFloat(W.getComputedStyle(DE).getPropertyValue("--bst-b")) || 0;
    return q.right > w * 0.08 && q.left < w * 0.92 && q.bottom > vh - b - h * 0.92 && q.top < vh - b;
  }
  function setAway(on) { if (!stand || awayOn === on) return; awayOn = on; if (on) { hideHint(); stand.classList.add("away"); } else stand.classList.remove("away"); }
  /* he never hides a page action: while one sits under him he is see-through (and every click goes to the page) — not while the visitor
     talks to him.
       ghostOn — a button / .btn link / field under his face or at least half under him (every screen); a text link under his solid head
                 on touch screens (no pointer there to fade him first); at the page bottom (nothing can be scrolled out from under him
                 there) any link half hidden by his solid figure. Checked on scroll / resize and with the state poll.
       hovOn   — desktop: the mouse points at a link / button / field through him (Janna's rule), so text links are clickable too.
       focOn   — the keyboard focus is on a link / button under him. */
  var ghostOn = false, hovOn = false, focOn = false, ghostQ = 0;
  var CTRL = "button,a.btn,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]";   /* the page's actions */
  var LINKS = "a[href],area[href],[role=link],label";                                                   /* text links */
  var ACT = CTRL + "," + LINKS + ",[role=menuitem],[role=checkbox],[role=radio],[role=switch],[contenteditable=true]";
  var FINE = false; try { FINE = !!(W.matchMedia && W.matchMedia("(hover: hover) and (pointer: fine)").matches); } catch (e) {}
  function ghosted() { return !!(stand && stand.classList.contains("ghost")); }
  function paintGhost() {
    if (!stand) return;
    var g = !bubble && !talking && (ghostOn || hovOn || focOn);
    if (g === ghosted()) return;
    stand.classList.toggle("ghost", g); if (g) hideHint();
  }
  function ov(a, b) { var w = Math.min(a.right, b.r) - Math.max(a.left, b.l), h = Math.min(a.bottom, b.b) - Math.max(a.top, b.t); return w > 0 && h > 0 ? w * h : 0; }
  function seen(e, x, y) {
    var l = D.elementsFromPoint ? D.elementsFromPoint(x, y) : [];
    for (var i = 0; i < l.length; i++) { if (mine(l[i])) continue; return l[i] === e || e.contains(l[i]) || l[i].contains(e); }
    return false;
  }
  /* the page's own element at a point (under his layers), and the page action it belongs to */
  function under(x, y) {
    var l = D.elementsFromPoint ? D.elementsFromPoint(x, y) : [];
    for (var i = 0; i < l.length; i++) if (!mine(l[i])) return l[i];
    return null;
  }
  function actionAt(x, y) { var t = under(x, y); return t && t.closest ? t.closest(ACT) : null; }
  /* (the mouse rules) a page action that stays put under the pointer: not one moving past in a running strip — the footer's partner
     logos slide under his face all the time, and a click meant for him must not open a partner's site */
  function pageAction(x, y) { var a = actionAt(x, y); return a && !moving(a) ? a : null; }
  /* his silhouette: the live canvas frame's alpha, else a small alpha map of the still cut-out */
  function opaqueAt(x, y) {
    if (!stand) return false;
    var r = stand.getBoundingClientRect(); if (!r.width || !r.height) return false;
    var fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return false;
    try {
      if (CAN && drawn && liveA && stand.classList.contains("live")) return liveA[(Math.floor(fy * CH) * CW + Math.floor(fx * CW)) * 4 + 3] > 60;
      if (img && img.complete && img.naturalWidth) {
        if (!amap) {
          var c = D.createElement("canvas"); c.width = 120; c.height = 104;
          var x2 = c.getContext("2d"); x2.drawImage(img, 0, 0, 120, 104); amap = x2.getImageData(0, 0, 120, 104).data;
        }
        return amap[(Math.floor(fy * 104) * 120 + Math.floor(fx * 120)) * 4 + 3] > 60;
      }
    } catch (e) {}
    return true;
  }
  /* a tap on a transparent part of his head box goes on to the page under him */
  function passOn(x, y) {
    var t = under(x, y); if (!t) return;
    var c = t.closest ? t.closest(ACT) : null;
    try { if (c && /^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) c.focus(); else (c || t).click(); } catch (e) {}
  }
  /* inside a running CSS animation (a marquee such as the footer's partners strip; a paused one counts as still) */
  function moving(e) {
    for (var a = e, k = 0; a && a !== D.body && k < 6; a = a.parentElement, k++) {
      try { if (a.getAnimations) { var l = a.getAnimations(); for (var i = 0; i < l.length; i++) if (l[i].playState === "running" && l[i].effect && /transform|translate/.test(JSON.stringify((l[i].effect.getKeyframes && l[i].effect.getKeyframes()) || ""))) return true; } } catch (x) { return false; }
    }
    return false;
  }
  function atBottom() {
    var se = D.scrollingElement || DE, h = Math.max(se.scrollHeight || 0, D.body ? D.body.scrollHeight : 0);
    return (W.pageYOffset || se.scrollTop || 0) + W.innerHeight >= h - 4;
  }
  /* the share of an element's area that his solid pixels hide inside box b (a 5×3 grid over their overlap) */
  function solidShare(q, b) {
    var l = Math.max(q.left, b.l), rr = Math.min(q.right, b.r), t = Math.max(q.top, b.t), bb = Math.min(q.bottom, b.b), n = 0;
    if (rr <= l || bb <= t) return 0;
    for (var i = 0; i < 5; i++) for (var j = 0; j < 3; j++) if (opaqueAt(l + (i + 0.5) * (rr - l) / 5, t + (j + 0.5) * (bb - t) / 3)) n++;
    return (rr - l) * (bb - t) * n / 15 / (q.width * q.height);
  }
  function covering() {
    if (!stand || !stand.classList.contains("in") || awayOn || handed || held || stand.classList.contains("out")) return false;
    var r = stand.getBoundingClientRect(); if (r.right <= 0 || !r.width) return false;
    var face = { l: r.left + r.width * 0.32, r: r.left + r.width * 0.68, t: r.top + r.height * 0.03, b: r.top + r.height * 0.69 };   /* = .bst-hit */
    var body = { l: r.left + r.width * 0.08, r: r.left + r.width * 0.94, t: face.b, b: r.bottom }, all = { l: r.left, r: r.right, t: r.top, b: r.bottom };
    var low = atBottom(), list = D.querySelectorAll(FINE && !low ? CTRL : CTRL + "," + LINKS);
    for (var i = 0; i < list.length; i++) {
      var e = list[i], q = e.getBoundingClientRect();
      if (!q.width || !q.height || q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom) continue;
      if (mine(e)) continue;
      var cx = (q.left + q.right) / 2, cy = (q.top + q.bottom) / 2;
      if (e.matches(CTRL)) {
        var face0 = cx > face.l && cx < face.r && cy > face.t && cy < face.b;
        if (!face0 && ov(q, face) + ov(q, body) < 0.5 * q.width * q.height) continue;
      } else {
        /* a text link: on touch screens its centre on his solid head, or half of it behind his solid head; at the page bottom, half of
           it behind his solid figure. Not a link that is moving past (the footer's running partners strip): it is gone from under him
           in a moment, and he would flicker */
        if (moving(e)) continue;
        var c0 = !FINE && cx > face.l && cx < face.r && cy > face.t && cy < face.b && opaqueAt(cx, cy);
        if (!(c0 || (!FINE && solidShare(q, face) >= 0.5) || (low && solidShare(q, all) >= 0.5))) continue;
        if (!c0) { cx = (Math.max(q.left, r.left) + Math.min(q.right, r.right)) / 2; cy = (Math.max(q.top, r.top) + Math.min(q.bottom, r.bottom)) / 2; }
      }
      var vx = Math.min(Math.max(cx, 1), W.innerWidth - 1), vy = Math.min(Math.max(cy, 1), W.innerHeight - 1);
      if (seen(e, vx, vy)) return true;
    }
    return false;
  }
  var clearAt = 0;
  function ghostCheck() {
    ghostQ = 0; if (!stand || gone) return;
    var on = !bubble && !talking && covering();
    /* see-through at once; solid again only once the spot has stayed clear for a moment (no flicker while scrolling a list) */
    if (on || !ghostOn) { clearAt = 0; if (on !== ghostOn) { ghostOn = on; paintGhost(); } return; }
    if (bubble || talking) { clearAt = 0; ghostOn = false; paintGhost(); return; }
    if (!clearAt) { clearAt = Date.now(); ghostSoon(520); return; }
    if (Date.now() - clearAt < 480) { ghostSoon(520 - (Date.now() - clearAt)); return; }
    clearAt = 0; ghostOn = false; paintGhost();
  }
  function ghostSoon(ms) { if (ghostQ) return; ghostQ = setTimeout(ghostCheck, ms == null ? 140 : ms); }
  /* desktop: the mouse on a link / button / field that he covers → he fades and the click goes to it */
  function watchHover() {
    if (!FINE) return;
    var mx = -1, my = -1, rr = null, rt = 0, q = 0, offAt = 0;
    var inside = function () {
      var now = Date.now(); if (!rr || now - rt > 300) { rr = stand.getBoundingClientRect(); rt = now; }
      return mx >= rr.left && mx < rr.right && my >= rr.top && my < rr.bottom;
    };
    var run = function () {
      q = 0; if (!stand) return;
      var g = !gone && !handed && !held && !bubble && !talking && !awayOn && stand.classList.contains("in") && !stand.classList.contains("out") && inside() && !!pageAction(mx, my);
      if (g) { offAt = 0; if (!hovOn) { hovOn = true; paintGhost(); } return; }
      if (!hovOn) return;
      /* solid again once the pointer has been off the page's controls for a moment (no flicker across the gaps of a link list) */
      if (!offAt) offAt = Date.now();
      if (Date.now() - offAt < 250) { setTimeout(function () { if (!q) q = nextFrame(run); }, 260); return; }
      offAt = 0; hovOn = false; paintGhost();
    };
    /* at once (not a frame later): the fade must be there before a quick click lands */
    D.addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; if (q) return; if (hovOn || (stand && inside())) run(); }, { passive: true });
    D.addEventListener("mouseout", function (e) { if (e.relatedTarget) return; mx = my = -1; offAt = 0; if (hovOn) { hovOn = false; paintGhost(); } });
    W.addEventListener("scroll", function () { if (mx >= 0 && !q) q = nextFrame(run); }, { passive: true });
  }
  /* keyboard focus (focus-visible) on a page link / button under him */
  function kbFocus(a) {
    if (!a || a === D.body || !a.matches || mine(a) || a.matches(SEL) || !a.matches(ACT)) return false;
    var v = false; try { v = a.matches(":focus-visible"); } catch (e) { v = false; }
    return v && hitsMe(a);
  }
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
    var was = false;
    setInterval(function () {
      if (!stand || D.hidden || talking) return;
      var now = dialogOpen(); if (now === was) return; was = now;
      if (now) setAway(true);
      else { var a = D.activeElement; if (!(a && a.matches && a.matches(SEL) && !mine(a) && hitsMe(a))) setAway(false); }
    }, 500);
  }
  function watchControls() {
    D.addEventListener("focusin", function (ev) {
      var t = ev.target; if (!stand || !t || !t.matches || mine(t)) return;
      var f = kbFocus(t); if (f !== focOn) { focOn = f; paintGhost(); }
      if (talking) return;
      if (t.matches(SEL) && hitsMe(t)) setAway(true);
    }, true);
    D.addEventListener("focusout", function () {
      setTimeout(function () { var f = kbFocus(D.activeElement); if (f !== focOn) { focOn = f; paintGhost(); } }, 0);
      if (!awayOn) return;
      setTimeout(function () { var a = D.activeElement; if (!(a && a.matches && a.matches(SEL) && !mine(a) && hitsMe(a))) setAway(false); }, 600);
    }, true);
    /* the page scrolls a focused field into view under him (the brief's search box on a phone): check again */
    W.addEventListener("scroll", function () {
      ghostSoon(); hintCheck();
      if (talking || !stand) return; var a = D.activeElement;
      if (a && a.matches && a.matches(SEL) && !mine(a)) setAway(hitsMe(a));
    }, { passive: true });
  }

  /* ---------------- start: after the page has loaded and the browser is idle ---------------- */
  function build() {
    if (stand || !D.body) return;
    stand = el("div", "bst-st"); stand.setAttribute("translate", "no"); stand.setAttribute("dir", DIR);
    stand.appendChild(el("span", "bst-gr"));
    img = el("img", "bst-pos"); img.alt = ""; img.setAttribute("aria-hidden", "true"); img.decoding = "async";
    stand.appendChild(img);
    if (canVideo()) {
      cv = D.createElement("canvas"); cv.width = CW; cv.height = CH; cv.setAttribute("aria-hidden", "true");
      off = D.createElement("canvas"); off.width = CW; off.height = AY + CH;
      buf = D.createElement("canvas"); buf.width = CW; buf.height = CH;
      snap = D.createElement("canvas"); snap.width = CW; snap.height = CH;
      try {
        ctx = cv.getContext("2d");
        octx = off.getContext("2d", { willReadFrequently: true }) || off.getContext("2d");
        bctx = buf.getContext("2d"); sctx = snap.getContext("2d");
      } catch (e) { ctx = null; }
      CAN = !!(ctx && octx && bctx && sctx);
      if (CAN) stand.appendChild(cv);
    }
    var nt = el("span", "bst-nt", S.tag); nt.setAttribute("dir", DIR); nt.appendChild(el("b", "bst-aib", "AI")); stand.appendChild(nt);
    var hit = el("button", "bst-hit"); hit.type = "button"; hit.setAttribute("aria-label", S.hit);
    /* only his own pixels answer: a click on a transparent corner of the head box goes on to the page under him; with a mouse, a page
       link / button under the pointer wins too (he fades over it as the pointer arrives — this also covers a click made before that) */
    hit.onclick = function (ev) {
      if (ev && ev.detail && ev.clientX != null && (!opaqueAt(ev.clientX, ev.clientY) || (FINE && !bubble && !talking && pageAction(ev.clientX, ev.clientY)))) { passOn(ev.clientX, ev.clientY); return; }
      talk();
    };
    stand.appendChild(hit);
    D.body.appendChild(stand);
    var jUp = jannaUp();   /* (before her corner is hidden) */
    DE.classList.add("bst-on"); if (!jUp) DE.classList.add("bst-jn"); if (EN) DE.classList.add("bst-ltr");
    hookSay(); setTimeout(hookSay, 1500);
    barOffset(); W.addEventListener("resize", function () { barOffset(); ghostSoon(); }); setTimeout(barOffset, 2500);
    watchControls(); watchDialogs(); watchHover();
    /* the phone menu opening / closing and Janna's chat panel (html.nav-open / html.jn-bubon): at once, not at the next state poll */
    if (W.MutationObserver) {
      try {
        var navWas = navUp(), bubWas = DE.classList.contains("jn-bubon");
        new W.MutationObserver(function () {
          var n = navUp(), j = DE.classList.contains("jn-bubon"); if (n === navWas && j === bubWas) return;
          navWas = n; bubWas = j; checkState();
        }).observe(DE, { attributes: true, attributeFilter: ["class"] });
      } catch (e) {}
    }
    D.addEventListener("visibilitychange", function () {
      if (!stand || gone) return;
      if (D.hidden) { try { if (vIdle) vIdle.pause(); } catch (e) {} }
      else if (!talking && started) playIdle();
    });
    D.addEventListener("keydown", function (e) { if ((e.key === "Escape" || e.key === "Esc") && bubble) closeBubble(); });
    W.addEventListener("bassem:change", function () { setTimeout(checkState, 0); });
    W.addEventListener("mig:me", function () { setTimeout(checkState, 0); });
    W.addEventListener("mig:logout", function () { setTimeout(checkState, 0); });
    setInterval(checkState, 1500);
    /* an open janna.js conversation keeps the page: he waits until it is minimised */
    if (jUp) { handed = true; handT0 = Date.now(); stand.classList.add("out"); watchJanna(); return; }
    checkState();
    begin();
  }
  function begin() {
    if (started || !stand) return; started = true;
    if (liveUp() || welUp() || roomUp() || navUp()) held = true;
    if (CAN && !STILL) {
      vIdle = mkVideo(IDLE, true);
      vIdle.addEventListener("playing", function () { if (!talking) useVideo(vIdle); });
      vIdle.addEventListener("error", function () { vIdle = null; if (!talking) playIdle(); });
      stillT = setTimeout(function () { if (!drawn) showStill(); }, 3500);
      if (held) showStill(); else playIdle();
    } else showStill();
  }
  function init() {
    if (init.done) return; init.done = 1;
    /* «🛠️ المطوّر» → «المزايا» (data/flags.js): the owner switched the standing figures off → he does not stand (bassem.js keeps its own figure) */
    flagsThen(function () {
      if (flagOff("standing_figures")) return;
      try { build(); } catch (e) { try { giveUp(); } catch (e2) {} }
    });
  }
  function flagOff(k) { var F = W.MIGFLAGS; return !!(F && F.on && F.on(k) === false); }
  function flagsThen(fn) { var F = W.MIGFLAGS; if (F && F.ready) F.ready(fn, 3000); else fn(); }
  /* a switch that arrives after he stood (a slow answer): he steps out / his 🎥 goes */
  W.addEventListener("mig:flags", function () {
    try { if (stand && flagOff("standing_figures")) { stopTalk(); giveUp(); } else if (stand) fillActs(); } catch (e) {}
  });
  function whenIdle() {
    if (whenIdle.on) return; whenIdle.on = 1;
    if (W.requestIdleCallback) W.requestIdleCallback(init, { timeout: 2500 }); else setTimeout(init, 400);
  }
  if (D.readyState === "complete") whenIdle();
  else {
    W.addEventListener("load", whenIdle);
    /* a page whose load event never comes (a hanging third-party request) still gets him, a little later */
    var safety = function () { setTimeout(whenIdle, 9000); };
    if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", safety); else safety();
  }
  W.BASSEM_STAND = {
    open: function () { return talk(); },
    close: function () { closeBubble(); },
    who: who, lang: EN ? "en" : "ar", voiced: !!TALK
  };
})();
