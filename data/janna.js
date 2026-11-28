/* «جنة» (Janna) — the platform's assistant, standing on every page as a real-looking woman (data/janna-real.js: photo cutout +
   eyes/mouth overlay frames; kind "bust" = the waist-up woman of her live video, standing at the bottom edge of the screen like
   a presenter; a full-body photo with a pointing hand also works). She stands at the bottom-right, breathes, sways, blinks,
   moves her lips with her voice (browser speech synthesis ar-EG / en, or pre-recorded clips from data/janna-voice.js), speaks from a bubble beside her, listens
   through the microphone, keeps the conversation going from page to page (sessionStorage), and DOES things for the visitor:
   takes them to any section, runs searches on the directory pages, fills the RFQ / contact / registration forms by
   conversation (the visitor always confirms before anything is sent), and answers questions from data/bot.js (MIGBOT).
   Full-screen hologram mode: site/janna.html sets window.JANNA_KIOSK (black background, she stands large, tap to talk).
   Fallbacks: no JANNA_REAL → the old animated SVG (window.JANNA_SVG) → the round photo img/janna.jpg.

   Fixed lines live in LINES (id → {ar, en, mood}); ids ending in .0/.1/.2 are random variants of one line. A pre-recorded clip
   for a line is looked up in window.JANNA_VOICE under "<id>.<lang>" (e.g. "intro.factories.ar", "greet.1.en"); dynamic text
   (answers, counts, names) under "qa:<sha1 of the spoken text>". window.JANNA.lines() lists every fixed line for the generator:
   [{key: "<id>.<lang>", id, lang, text, speak (text as spoken, without emoji), mood}].
   Her nodes carry translate="no": she speaks her own language.

   She COMES TO the visitor instead of waiting as a side icon (owner: «مش يبقوا أيقونة في الجنب»):
   - WELCOME CARD (first eligible page view of a tab session): a compact card docked at a bottom corner (phones: a small peek
     above the bottom edge), placed clear of the page's controls — it never covers the page, its search boxes, calls to action,
     forms or the menu (owner 2026-11-18). A tap expands it into her greeting panel with big actions (live video, intro meeting
     now, guided tour, register, search, browse alone; desktop: a corner panel, phones: a bottom sheet). Audio starts only on a
     tap («🔊 اسمعني» / her face); on dismiss she shrinks into her dock (FLIP animation). See «welcome card».
   - PAGE ARRIVALS: on every later page she steps forward (larger) for ~6 s with a one-line page intro and 2-3 page chips, then
     settles into the dock; once per page per session, never when the visitor already scrolled / typed or is filling a form.
   - GUIDED TOUR: 8 steps across the platform (home → directory → tenders → RFQs → export markets → plans → form), a spotlight
     on a real element of each page, continuity through sessionStorage (ST.tour) and the pending-action hand-over (kind "tour").
   - FULL ACCESS: any page by name; a specific company / tender (ref or words) / RFQ / news story / event / offer / city / zone /
     governorate; live counts from the loaded data («عندنا X مصنع…»); «إيه اللي في الصفحة دي؟»; plan comparison. Missing data
     files are loaded on demand (need()). Fuzzy Arabic matching (N(), base()); she never invents: no match → she says so.
   Not on dashboard / advisor / meeting pages, the kiosk, or while Bassem (data/bassem.js, html.bs-on) serves a member. */
(function () {
  if (window.__janna) return;
  /* «باسم معاك»: a page that came out of Bassem's live call is his — she does not start there (data/janna-live.js sets window.MIG_WB
     before this file; the same test here in case it did not run: window.name «mig-bassem-<ms>», ?with=bassem, sessionStorage "mig-wb") */
  if (!window.JANNA_KIOSK && wbOn()) return;
  function wbOn() {
    var W = window, now = new Date().getTime(), t = 0, s = 0, m = null;
    if (W.MIG_WB === true || W.MIG_WB === false) return W.MIG_WB;
    try { m = /^mig-bassem-(\d{12,14})$/.exec(String(W.name || "")); } catch (e) {}
    if (m) t = +m[1];
    if (!t && /[?&]with=bassem(?:&|$)/.test(location.search)) t = now;
    try { s = +sessionStorage.getItem("mig-wb") || 0; if (t > s) sessionStorage.setItem("mig-wb", String(t)); } catch (e) {}
    if (!t) t = s;
    W.MIG_WB = t > 0 && now - t < 144e5 && now - t > -6e4;
    return W.MIG_WB;
  }
  window.__janna = 1;
  var KIOSK = !!window.JANNA_KIOSK;
  var R0 = window.JANNA_REAL, REAL = R0 && R0.body && R0.w && R0.h ? R0 : null, SVG = window.JANNA_SVG || "";
  var BUST = !!(REAL && REAL.kind === "bust");
  var RM = false; try { RM = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };
  /* her language: the site's language (MIGLANG), unless the visitor switched her (toggle or a full sentence in the other
     language) while the site was in that same language; a later site-language switch wins again */
  var SITEL = window.MIGLANG === "en" ? "en" : "ar";
  var L = (function () { var l = ss("janna-lang"); if (l && !KIOSK && ss("janna-lsite") !== SITEL) { ss("janna-lang", null); l = null; } return l === "en" || l === "ar" ? l : SITEL; })();
  var soundOn = ls("janna-snd") !== "0", unlocked = false, ttsBlocked = false;
  /* the page key: site.py sets window.MIGPAGE on every page (the deploy build serves clean URLs such as /advisor/ or /tenders/search/,
     where the file name says nothing); the file name is only the fallback of an old flat build */
  var PAGE = String(window.MIGPAGE || "") || (location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, "") || "home";
  if (PAGE === "index" || KIOSK) PAGE = "home";
  /* clean URLs (deploy build: <base href="/">, pages at /<key>/; "x.html" only answers with a 301 to the SEO landing page, where
     neither the app nor Janna runs) → she navigates straight to the app pages. window.MIGPATHS {app, static} wins over this copy of
     seo/config.json when the build provides it. */
  var CLEAN = !!document.querySelector('base[href="/"]') || (!/\.html?$/i.test(location.pathname) && location.pathname !== "/") || KIOSK;
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
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- conversation state (survives page changes in this tab) ---------- */
  var ST = (function () { try { return JSON.parse(ss("janna-st") || "null"); } catch (e) { return null; } })() || {};
  ST.t = ST.t || []; ST.flow = ST.flow || null; ST.pend = ST.pend || null;
  function save() { ss("janna-st", JSON.stringify(ST)); }
  function logT(w, x) { ST.t.push([w, String(x || "").slice(0, 280), PAGE]); if (ST.t.length > 14) ST.t = ST.t.slice(-14); save(); }
  /* a request carried in the URL (QR from the hologram kiosk to the visitor's phone): #janna=<base64 json> */
  (function () {
    var m = /[#&]janna=([A-Za-z0-9_\-]+)/.exec(location.hash); if (!m) return;
    try { var p = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))))); if (p && p.kind) { p.page = PAGE; ST.pend = p; ST.open = true; save(); } } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search + (PAGE === "contact" ? "#rfq-form" : "")); } catch (e) {}
  })();

  /* ---------- everything she says: id → {ar, en, mood} ---------- */
  var LINES = {
    "greet.0": { m: "happy", ar: "يا أهلاً وسهلاً 😊 أنا جنة، معاك هنا في منصة صنع في مصر. أقدر أدوّرلك على مصانع ومنتجات ومناقصات، وأبعتلك طلب عرض سعر، وأسجّلك مصنعك خطوة بخطوة. قولّي بس محتاج إيه.", en: "Hi there, welcome 😊 I'm Janna, here with you at Made in Egypt Gate. I can find factories, products and tenders for you, send a request for quotation, and register your factory step by step. Just tell me what you need." },
    "greet.1": { m: "excited", ar: "أهلاً بيك، نوّرت المنصة ✨ أنا جنة، وموجودة عشان أساعدك في أي حاجة: تدوّر، تسجّل، تبعت طلب… وأنا أعملهالك بنفسي.", en: "Welcome, great to have you here ✨ I'm Janna. Searching, registering, sending a request: tell me and I'll do it for you." },
    "greet.2": { m: "happy", ar: "منوّر يا فندم 😊 أنا جنة. لو بتدوّر على مصنع أو منتج، أو عايز تسجّل مصنعك، أنا معاك خطوة بخطوة.", en: "Hello and welcome 😊 I'm Janna. Looking for a factory or a product, or want to register your factory? I'm with you every step of the way." },
    "salam.0": { m: "happy", ar: "وعليكم السلام ورحمة الله 😊 أهلاً بيك، أساعدك في إيه؟", en: "And peace be upon you too 😊 Welcome! How can I help?" },
    "love.0": { m: "happy", ar: "ده من ذوقك 🌷 وأنا مبسوطة إني بساعدك. تحب أدوّرلك على حاجة؟", en: "That's very kind of you 🌷 I'm happy to help. Shall I look something up for you?" },
    "nice.0": { m: "happy", ar: "ميرسي، ده من ذوقك 😊 أنا هنا عشانك، قولّي محتاج إيه.", en: "Thank you, that's kind 😊 I'm here for you, just tell me what you need." },
    "joke.0": { m: "excited", ar: "مرة مصنع زجاج اتسأل: إنت ليه شفاف كده؟ قال: أصل معنديش حاجة أخبّيها 😄 بس بجد، لو محتاج مصنع أنا أدوّرلك عليه في ثانية.", en: "Why did the glass factory never lie? Because everyone could see right through it 😄 Seriously though, I can find you a factory in seconds." },
    "joke.1": { m: "excited", ar: "مرة الحديد زعل، قالوله: خليك صلب 😄 طب قولّي، أدوّرلك على مصانع حديد؟", en: "Why are steel factories so calm? They have nerves of steel 😄 Shall I find you some steel factories?" },
    "teaser.0": { m: "happy", ar: "أهلاً بيك 😊 أنا جنة، لو محتاج أي حاجة دوس عليّا وأنا أساعدك.", en: "Hi 😊 I'm Janna. If you need anything, tap me and I'll help." },
    "teaser.1": { m: "happy", ar: "منوّر 😊 أنا جنة، مساعدتك هنا. دوس عليّا لو عايز حاجة.", en: "Welcome 😊 I'm Janna, your assistant here. Tap me if you need anything." },
    "plans": { m: "calm", ar: "{list} مفيش باقة مجانية. «تسجيل بيانات الشركة فقط» بروفايل في الدليل بس، والمناقصات وطلبات الأسعار والترسيات وأخبار المشاريع من الأساسية وطالع، وكل باقة أعلى بتزوّد أسواق ومزايا. تحب أساعدك تختار الأنسب لمصنعك؟", en: "{list} There is no free plan. «Company data only» is a directory profile only; tenders, RFQs, awards and project news start with Basic, and each higher plan adds markets and features. Shall I help you choose the right one?" },
    "hi.0": { m: "happy", ar: "أهلاً بيك 😊 أؤمرني، أساعدك في إيه؟", en: "Hi 😊 What can I do for you?" },
    "hi.1": { m: "excited", ar: "يا هلا! تحت أمرك، محتاج إيه؟", en: "Hey there! I'm all yours, what do you need?" },
    "hi.2": { m: "happy", ar: "أهلاً وسهلاً 🌷 قولّي أقدر أعملك إيه.", en: "Hello 🌷 Tell me how I can help." },
    "how.0": { m: "happy", ar: "الحمد لله تمام، وأحسن لما كلّمتني 😊 أساعدك في إيه؟", en: "I'm great, even better now you're here 😊 How can I help?" },
    "thanks.0": { m: "happy", ar: "العفو، ده واجبي 😊", en: "You're welcome, my pleasure 😊" },
    "thanks.1": { m: "happy", ar: "تسلم! أي خدمة 🌷 لو احتجت حاجة تانية أنا هنا.", en: "Anytime 🌷 If you need anything else, I'm right here." },
    "thanks.2": { m: "happy", ar: "ولا يهمك، أنا موجودة دايماً 😊", en: "Don't mention it, I'm always around 😊" },
    "who.0": { m: "happy", ar: "أنا جنة 😊 المساعدة الذكية لمنصة صنع في مصر. بتكلّم مصري وإنجليزي، وأقدر أعمل معاك حاجات كتير بنفسي.", en: "I'm Janna 😊 the smart assistant of Made in Egypt Gate. I speak Egyptian Arabic and English, and I can do a lot of things for you myself." },
    "can.0": { m: "excited", ar: "أقدر أعملك حاجات كتير: أوديك لأي قسم، أدوّرلك على مصانع أو منتجات أو مناقصات في أي محافظة، أملالك طلب عرض سعر وأبعته، أبعت رسالتك للمنصة برقم متابعة، وأملا معاك استمارة تسجيل مصنعك. جرّب قولّي مثلاً: دوّريلي على مصانع حديد في الشرقية.", en: "Lots of things: I can take you to any section, search factories, products or tenders in any governorate, fill in and send a request for quotation, send your message to the platform with a tracking number, and fill in your factory's registration form with you. Try saying: find steel factories in Sharqia." },
    "confused.0": { m: "empathetic", ar: "ولا يهمك خالص، خلّيني أبسّطهالك 🤗 قولّي بكلمة واحدة إنت عايز إيه: مصانع، منتجات، مناقصات، ولا تسجيل؟", en: "No worries at all, let me make it simple 🤗 Just tell me in one word what you want: factories, products, tenders or registration?" },
    "confused.1": { m: "empathetic", ar: "معلش، حقك عليا 🙏 تعالى نمشيها خطوة خطوة. اختار من دول وأنا أعملهالك.", en: "Sorry about that 🙏 Let's take it one step at a time. Pick one of these and I'll do it for you." },
    "confused.2": { m: "empathetic", ar: "أنا آسفة لو اتلخبطنا 🤗 قولّي محتاج إيه بالظبط، وأنا هعمله بنفسي.", en: "I'm sorry if that got confusing 🤗 Tell me exactly what you need and I'll do it myself." },
    "bye.0": { m: "happy", ar: "مع السلامة، نوّرتنا 🌷 أنا هنا لو احتجتني.", en: "Bye for now, it was lovely 🌷 I'm here whenever you need me." },
    "ack.0": { m: "happy", ar: "تمام 👌", en: "Got it 👌" },
    "ack.1": { m: "happy", ar: "حلو أوي!", en: "Lovely!" },
    "ack.2": { m: "happy", ar: "ماشي، تمام.", en: "Okay, perfect." },
    "think.0": { m: "thinking", ar: "ممم… ثانية بس.", en: "Hmm… one second." },
    "think.1": { m: "thinking", ar: "ممم، خلّيني أشوف…", en: "Hmm, let me see…" },
    "fallback.0": { m: "thinking", ar: "سؤال حلو! 🤔 بس مش متأكدة فهمته صح. أقدر أساعدك في: التسجيل والباقات، المصانع، المنتجات، المناقصات وطلبات الأسعار، والمحافظات. اختار من دول أو قولها بطريقة تانية.", en: "Good question! 🤔 I'm not sure I got it right though. I can help with registration and plans, factories, products, tenders and RFQs, and governorates. Pick one or say it another way." },
    "fallback.1": { m: "empathetic", ar: "ممم، دي ملقيتلهاش إجابة عندي 🙈 بس جرّب تسألني عن الباقات، أو قولّي: دوّريلي على مصنع أو منتج، وأنا أعملهولك.", en: "Hmm, I don't have an answer for that one 🙈 Try asking me about plans, or say: find me a factory or a product, and I'll do it." },
    "listening": { m: "calm", ar: "سامعاك… اتكلم دلوقتي 🎙️", en: "I'm listening… go ahead 🎙️" },
    "nomic": { m: "empathetic", ar: "الميكروفون مش متاح في المتصفح ده 🙈 اكتبلي هنا وأنا أرد عليك على طول.", en: "The microphone isn't available in this browser 🙈 Type here and I'll answer right away." },
    "nomic.app": { m: "empathetic", ar: "الميكروفون مش متاح للتطبيق 🙈 اكتبلي هنا وأنا أرد عليك على طول.", en: "The microphone isn't available to the app 🙈 Type here and I'll answer right away." },
    "nohear": { m: "empathetic", ar: "معلش ما سمعتش كويس، ممكن تقولها تاني؟", en: "Sorry, I didn't catch that. Could you say it again?" },
    "attract.0": { m: "excited", ar: "أهلاً بيك 👋 قرّب وكلّمني! أنا جنة، وأقدر أساعدك تلاقي مصانع ومنتجات وتسجّل مصنعك.", en: "Hello 👋 Come closer and talk to me! I'm Janna, I can help you find factories and products and register your factory." },
    "attract.1": { m: "happy", ar: "إزيك 😊 عندك سؤال عن المنصة؟ دوس على الشاشة وكلّمني.", en: "Hi there 😊 Got a question about the platform? Tap the screen and talk to me." },
    /* navigation */
    "nav.go.0": { m: "happy", ar: "ثانية واحدة وأوديك على {name}…", en: "One second, taking you to {name}…" },
    "nav.go.1": { m: "excited", ar: "من عينيا، يلا على {name} 👉", en: "With pleasure, off to {name} 👉" },
    "nav.go.2": { m: "happy", ar: "حاضر، رايحين {name} دلوقتي.", en: "Sure, heading to {name} now." },
    "nav.here": { m: "happy", ar: "إحنا فيها أصلاً 😊", en: "We're already here 😊" },
    "arrive.0": { m: "happy", ar: "وصلنا.", en: "Here we are." },
    "arrive.1": { m: "happy", ar: "أهو، وصلنا يا سيدي 😊", en: "There we go, we've arrived 😊" },
    "arrive.2": { m: "happy", ar: "تمام كده، وصلنا.", en: "Okay, we're here." },
    "region.one": { m: "happy", ar: "دي صفحة محافظة {name}: مناقصاتها ومصانعها ومنتجاتها ومشاريعها ومناطقها الصناعية.", en: "This is the {name} governorate page: its tenders, factories, products, projects and industrial zones." },
    /* search */
    "search.go.0": { m: "thinking", ar: "ثانية واحدة وأدوّرلك في {what}{about}…", en: "One second, searching {what}{about}…" },
    "search.go.1": { m: "excited", ar: "من عينيا! بدوّرلك في {what}{about}…", en: "On it! Searching {what}{about}…" },
    "search.res": { m: "proud", ar: "لقيتلك {n} نتيجة في {what}، دي قدامك 👇", en: "I found {n} results in {what}, here they are 👇" },
    "search.resF": { m: "proud", ar: "لقيتلك {n} نتايج في {what}، دي قدامك 👇", en: "I found {n} results in {what}, here they are 👇" },
    "search.res1": { m: "proud", ar: "لقيتلك نتيجة واحدة في {what}، دي قدامك 👇", en: "I found one result in {what}, here it is 👇" },
    "search.res2": { m: "proud", ar: "لقيتلك نتيجتين في {what}، دول قدامك 👇", en: "I found two results in {what}, here they are 👇" },
    "search.res0": { m: "empathetic", ar: "ملقيتش حاجة بالكلمة دي 🤔 جرّب كلمة أقرب، أو من غير اسم المحافظة.", en: "Nothing came up for that 🤔 Try a closer word, or without the governorate." },
    "search.done": { m: "happy", ar: "دي النتايج قدامك 👇", en: "Here are the results 👇" },
    "search.ask": { m: "calm", ar: "بتدوّر على إيه بالظبط؟ اكتبلي الكلمة وأنا أدوّر.", en: "What exactly are you looking for? Type the word and I'll search." },
    /* plan wizard */
    "wiz.who": { m: "excited", ar: "يلا نسجّل سوا 😊 قولّي الأول، حضرتك مين؟", en: "Let's register together 😊 First, who are you?" },
    "wiz.buyer": { m: "happy", ar: "للمشترين والمقاولين مش محتاج تسجّل خالص 😊 ابعت طلب عرض سعر ببلاش، والمنصة توصّله للمصانع المناسبة في قطاعك ومحافظتك. تحب أملاه معاك دلوقتي؟", en: "Buyers and contractors don't need to register at all 😊 Post a free request for quotation and the platform sends it to matching factories in your sector and governorate. Shall I fill it in with you now?" },
    "wiz.what": { m: "happy", ar: "حلو أوي 👌 وعايز إيه من المنصة؟", en: "Lovely 👌 And what do you want from the platform?" },
    "wiz.plan": { m: "proud", ar: "أنسب باقة ليك: «{plan}».\n{feat}.\n{price}\n{pay} هتحتاج السجل التجاري والبطاقة الضريبية. تحب نملا الاستمارة سوا؟", en: "Your best fit: the {plan}.\n{feat}.\n{price}\n{pay} You'll need your commercial register and tax card. Shall we fill in the form together?" },
    "reg.plan": { m: "happy", ar: "تمام، «{plan}» اختيار ممتاز 👌", en: "Great, the {plan} is an excellent choice 👌" },
    /* forms by conversation */
    "flow.rfq.got": { m: "happy", ar: "فهمت إن المنتج: «{p}» 👌 لو مش ده، دوس «غيّر المنتج».", en: "I understood the product as “{p}” 👌 If that's not right, tap “Change product”." },
    "flow.rfq.start": { m: "excited", ar: "يلا بينا نعمل طلب عرض السعر سوا 📝 هسألك كام سؤال صغيرين، وأنا أملا الفورم مكانك.", en: "Let's put your request for quotation together 📝 A few quick questions and I'll fill in the form for you." },
    "flow.rfq.p": { m: "calm", ar: "إيه المنتج اللي محتاجه؟ مثلاً: زجاج شفاف 6 مم.", en: "What product do you need? For example: 6 mm clear glass." },
    "flow.rfq.q": { m: "calm", ar: "والكمية قد إيه تقريباً؟", en: "And roughly what quantity?" },
    "flow.rfq.c": { m: "calm", ar: "هتستلم في أنهي مدينة أو محافظة؟", en: "Which city or governorate should it be delivered to?" },
    "flow.rfq.s": { m: "calm", ar: "المنتج ده تبع أنهي قطاع؟ اختار من دول 👇", en: "Which sector is it? Pick one 👇" },
    "flow.rfq.d": { m: "calm", ar: "عايز العروض توصلك إمتى؟", en: "When do you want the offers by?" },
    "flow.rfq.x": { m: "calm", ar: "فيه مواصفات أو تفاصيل زيادة تحب المصانع تعرفها؟", en: "Any specifications or extra details the factories should know?" },
    "flow.contact.start": { m: "happy", ar: "تمام، هنكتب رسالتك سوا ✉️ وأنا أملاها في الفورم.", en: "Sure, let's write your message together ✉️ and I'll put it in the form." },
    "flow.contact.n": { m: "calm", ar: "اسمك الكريم إيه؟", en: "May I have your name?" },
    "flow.contact.p": { m: "calm", ar: "رقم موبايلك؟ آخر 4 أرقام منه بتتابع بيهم رسالتك.", en: "Your mobile number? Its last 4 digits let you track your message." },
    "flow.contact.e": { m: "calm", ar: "إيميلك إيه؟ عليه بيوصلك الإيصال برقم المتابعة وأي رد.", en: "Your e-mail? The receipt with the tracking number, and any reply, go there." },
    "flow.rfq.n": { m: "calm", ar: "اسمك الكريم إيه؟", en: "May I have your name?" },
    "flow.rfq.co": { m: "calm", ar: "اسم شركتك؟ لو مفيش، دوس «تخطّي».", en: "Your company's name? If none, tap “Skip”." },
    "flow.rfq.e": { m: "calm", ar: "إيميلك إيه؟ عليه بيوصلك الإيصال برقم الطلب وعروض المصانع.", en: "Your e-mail? The receipt with the request number and the factories' offers go there." },
    "flow.rfq.ph": { m: "calm", ar: "رقم موبايلك؟ آخر 4 أرقام منه بتتابع بيهم الطلب.", en: "Your mobile number? Its last 4 digits let you track the request." },
    "flow.contact.r": { m: "calm", ar: "حضرتك صاحب مصنع، ولا مشتري، ولا…؟ اختار من دول.", en: "Are you a factory owner, a buyer, or…? Pick one." },
    "flow.contact.s": { m: "calm", ar: "موضوع الرسالة إيه باختصار؟", en: "What's the subject, in short?" },
    "flow.contact.m": { m: "calm", ar: "قولّي رسالتك، وأنا أكتبهالك زي ما هي.", en: "Tell me your message and I'll write it down as it is." },
    "flow.reg.start": { m: "excited", ar: "يلا بينا! 🎉 هسألك بيانات الشركة واحدة واحدة، وأنا أملا استمارة التسجيل مكانك.", en: "Let's go! 🎉 I'll ask for your company details one by one and fill in the registration form for you." },
    "flow.reg.gcc": { m: "calm", ar: "إنت اخترت الباقة المميزة: فيها مصر + 3 دول خليجية تختارهم. أنهي 3 دول؟ (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)", en: "You chose Premium: Egypt + 3 Gulf states of your choice. Which 3? (from Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman)" },
    "flow.reg.name": { m: "calm", ar: "اسم الشركة أو المصنع إيه؟", en: "What's the company or factory name?" },
    "flow.reg.mgr": { m: "calm", ar: "اسم المدير المسؤول؟", en: "The manager's name?" },
    "flow.reg.tel": { m: "calm", ar: "رقم تليفون الشركة؟", en: "The company's phone number?" },
    "flow.reg.emi": { m: "calm", ar: "المصنع في أنهي محافظة؟", en: "Which governorate is the factory in?" },
    "flow.reg.addr": { m: "calm", ar: "العنوان بالتفصيل؟ المدينة أو المنطقة الصناعية، والحي، ورقم القطعة.", en: "The full address? City or industrial zone, district and plot number." },
    "flow.reg.act": { m: "calm", ar: "نشاطكم إيه؟ مثلاً: تصنيع أنابيب PVC.", en: "What's your activity? For example: manufacturing PVC pipes." },
    "flow.reg.prod": { m: "calm", ar: "أهم منتجاتكم إيه؟ اكتبها وافصل بينها بفاصلة.", en: "Your main products? Separate them with commas." },
    "flow.reg.mail": { m: "calm", ar: "إيميل الشركة؟ عليه هتوصلك الفاتورة وبيانات الدخول.", en: "The company e-mail? The invoice and login details go there." },
    "flow.reg.cr": { m: "calm", ar: "رقم السجل التجاري؟", en: "The commercial register number?" },
    "flow.reg.vat": { m: "calm", ar: "رقم التسجيل الضريبي، اللي على البطاقة الضريبية؟ 9 أرقام.", en: "The tax registration number from your tax card? 9 digits." },
    "flow.reg.oname": { m: "calm", ar: "مين مسؤول التسجيل؟ الاسم لو سمحت.", en: "Who is the registration officer? Their name, please." },
    "flow.reg.omob": { m: "calm", ar: "موبايل مسؤول التسجيل؟", en: "The registration officer's mobile?" },
    "flow.reg.omail": { m: "calm", ar: "وإيميله؟ لو هو نفس إيميل الشركة دوس «نفس الإيميل».", en: "And their e-mail? If it's the company e-mail, tap \"same e-mail\"." },
    "flow.req": { m: "empathetic", ar: "ده سؤال مهم ومينفعش نعدّيه 🙏", en: "This one is needed, we can't skip it 🙏" },
    "flow.bad.phone": { m: "empathetic", ar: "الرقم ده شكله ناقص حاجة 🙏 اكتبه كده مثلاً: 01012345678", en: "That number doesn't look complete 🙏 Write it like: 01012345678" },
    "flow.bad.mail": { m: "empathetic", ar: "الإيميل محتاج يبقى بالشكل ده: name@company.com", en: "The e-mail should look like: name@company.com" },
    "flow.bad.vat": { m: "empathetic", ar: "رقم التسجيل الضريبي 9 أرقام بالظبط، زي 123456789. اكتبه تاني لو سمحت 🙏", en: "The tax registration number is exactly 9 digits, like 123456789. Please type it again 🙏" },
    "flow.bad.gov": { m: "empathetic", ar: "معلش مش لاقية المحافظة دي 🙈 اكتب اسمها تاني، زي: الجيزة.", en: "Sorry, I can't find that governorate 🙈 Type it again, like: Giza." },
    "flow.bad.opt": { m: "empathetic", ar: "اختار واحدة من دول لو سمحت 👇", en: "Please pick one of these 👇" },
    "flow.bad.gcc": { m: "calm", ar: "محتاجة 3 دول بالظبط من السعودية والإمارات والكويت وقطر والبحرين وعُمان، مثلاً: السعودية والإمارات وقطر.", en: "I need exactly 3 of Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman — for example: Saudi Arabia, UAE and Qatar." },
    "flow.skip": { m: "calm", ar: "ماشي، نعدّيها.", en: "Okay, let's skip it." },
    "flow.cancel": { m: "calm", ar: "ولا يهمك، لغيت 👍 لو احتجتني أنا هنا.", en: "No problem, cancelled 👍 I'm here if you need me." },
    "flow.resume": { m: "happy", ar: "كنا في نص الكلام 😊 نكمّل؟", en: "We were in the middle of something 😊 Shall we continue?" },
    "flow.going": { m: "happy", ar: "كده تمام 👌 هاخدك على الفورم وأملاه لك.", en: "All set 👌 Let me take you to the form and fill it in." },
    "fill.done": { m: "proud", ar: "ملّيتلك كل البيانات 👌 بص عليها في الفورم، ولو فيه حاجة عايز تغيّرها غيّرها بإيدك.", en: "I've filled in everything 👌 Have a look at the form, and change anything you like by hand." },
    "fill.confirm.rfq": { m: "happy", ar: "أبعت الطلب دلوقتي؟", en: "Shall I send the request now?" },
    "fill.confirm.contact": { m: "happy", ar: "أبعت الرسالة؟", en: "Shall I send the message?" },
    "fill.confirm.reg": { m: "happy", ar: "أكمّل للخطوة الجاية؟", en: "Shall I go on to the next step?" },
    "fill.edit": { m: "calm", ar: "براحتك خالص، عدّل اللي إنت عايزه في الفورم، ولما تخلص دوس «أبعته».", en: "Take your time, edit whatever you like in the form, and tap \"Send\" when you're done." },
    "fill.miss": { m: "empathetic", ar: "لسه فيه بيان ناقص في الفورم 🙏 خلّيني أسألك عليه.", en: "One detail is still missing in the form 🙏 Let me ask you for it." },
    "fill.err": { m: "empathetic", ar: "فيه حاجة محتاجة تتظبط في الفورم 🙏 {err}", en: "Something in the form needs fixing 🙏 {err}" },
    /* said only after the platform answered with a reference number (window event "mig:inquiry" from data/mig-forms.js) */
    "sent.rfq": { m: "proud", ar: "برافو عليك! 👏 الطلب اتسجّل برقم {ref}، واتبعت تلقائياً لـ{n} مصنع مسجّل بيطابق طلبك. عروضهم هتوصلك على إيميلك، وتتابعه من صفحة التتبع.", en: "Well done! 👏 Your request is recorded under {ref} and was sent automatically to {n} registered factories that match it. Their offers reach your e-mail, and you can follow it on the tracking page." },
    "sent.rfq0": { m: "calm", ar: "الطلب اتسجّل برقم {ref}. لحد دلوقتي مفيش مصنع مسجّل على المنصة بيطابقه، فماتبعتش لحد؛ هيفضل مفتوح 30 يوم ويتبعت تلقائياً لأي مصنع مطابق يسجّل، وهيوصلك إيميل ساعتها.", en: "Your request is recorded under {ref}. No registered factory on the platform matches it yet, so it was not sent to anyone; it stays open for 30 days and goes automatically to any matching factory that joins, and you'll get an e-mail then." },
    "sent.rfqwork": { m: "calm", ar: "الطلب اتسجّل برقم {ref}، وحالته «جاري معالجة طلبك»: لحد دلوقتي مفيش مصنع مسجّل بيطابقه، فإدارة المنصة اتبلّغت تلقائياً وبتدوّر على مصانع تقدر تنفّذه. أي رد هيظهر في صفحة التتبع.", en: "Your request is recorded under {ref} and its status is “We're working on your request”: no registered factory matches it yet, so the platform's administrators were notified automatically and are looking for factories that can fulfil it. Any reply appears on the tracking page." },
    "sent.rfqretry": { m: "calm", ar: "الطلب اتسجّل برقم {ref}، والإرسال للمصانع المطابقة بيتعاد تلقائي خلال ساعة بسبب عطل مؤقت. هيوصلك إيميل بالعدد الحقيقي أول ما يتبعت.", en: "Your request is recorded under {ref}; sending it to the matching factories is retried automatically within the hour because of a temporary fault. You'll get an e-mail with the real number once it goes out." },
    "sent.contact": { m: "proud", ar: "تمام كده! 👏 رسالتك اتسجّلت برقم {ref}، وإيصالها في الطريق لإيميلك. أي رد هيوصلك على الإيميل ويظهر في صفحة التتبع.", en: "Done! 👏 Your message is recorded under {ref} and its receipt is on its way to your e-mail. Any reply reaches your e-mail and appears on the tracking page." },
    "sent.fail": { m: "empathetic", ar: "مااتبعتش 🙏 {err} البيانات لسه في الفورم، تقدر تجرّب تاني.", en: "It was not sent 🙏 {err} Your details are still in the form, so you can try again." },
    "sent.wait": { m: "empathetic", ar: "لسه مفيش رد من المنصة، فالطلب مااتأكدش 🙏 لو ظهر رقم في الفورم يبقى اتسجّل؛ غير كده جرّب تاني بعد شوية.", en: "There's no answer from the platform yet, so the request is not confirmed 🙏 If a number shows in the form it was recorded; otherwise try again in a little while." },
    "reg.docs": { m: "proud", ar: "برافو عليك، كده خلصنا أهم جزء 👏 دلوقتي خطوة المستندات: السجل التجاري، والبطاقة الضريبية، وشهادة القيمة المضافة، ولوجو الشركة. دي لازم ترفعها إنت بنفسك من جهازك، أنا مقدرش أرفع ملفات. وبعدها التوقيع والختم، وفي الآخر الدفع بالكارت أو المحفظة. بيانات الكارت دي إنت بس اللي تكتبها، أنا مش بلمسها خالص 🔒", en: "Well done, the main part is finished 👏 Now the documents step: commercial register, tax card, VAT certificate and company logo. You need to upload those yourself from your device; I can't upload files. Then the signature and stamp, and finally payment by card or wallet. Only you enter the card details; I never touch them 🔒" },
    "kiosk.qr": { m: "happy", ar: "صوّر الكود ده بموبايلك 📱 وهتلاقي الصفحة قدامك على طول: {name}.", en: "Scan this code with your phone 📱 and {name} will open right there." },
    "kiosk.fillqr": { m: "proud", ar: "تمام كده 👌 صوّر الكود بموبايلك، وهتلاقي الفورم متعبّي ببياناتك، راجعه وابعته من عندك.", en: "All set 👌 Scan the code with your phone and you'll find the form already filled in. Check it and send it from there." },
    /* welcome stage, live video, meeting */
    "stage.hello": { m: "excited", ar: "أهلاً بيك في منصة صنع في مصر! أنا جنة، مسؤولة التسجيل والتسويق في المنصة. هنا هتلاقي دليل المصانع والشركات المصرية، والمناقصات وطلبات الأسعار، وأسواق التصدير، وأنا معاك خطوة بخطوة. تحب أكلّمك فيديو، ولا نعمل اجتماع تعريفي دلوقتي، ولا آخدك جولة في المنصة؟", en: "Welcome to Made in Egypt Gate! I'm Janna, the platform's registration and marketing manager. Here you'll find the directory of Egyptian factories and companies, tenders and requests for quotation, and export markets, and I'm with you every step of the way. Shall we talk on video, have an intro meeting right now, or shall I give you a tour of the platform?" },
    "stage.again": { m: "happy", ar: "أهلاً بيك تاني 😊 اختار اللي تحبه من هنا، أو اسألني أي حاجة.", en: "Welcome back 😊 Pick anything here, or ask me whatever you like." },
    "stage.dock": { m: "happy", ar: "أنا هنا في الركن لو احتجتني 😊 دوس عليّا في أي وقت.", en: "I'll be right here in the corner 😊 Tap me any time." },
    "stage.search": { m: "happy", ar: "بتدوّر على إيه؟ اختار القسم، أو اكتبلي على طول، زي: مصانع بلاستيك في الشرقية.", en: "What are you looking for? Pick a section, or just type, e.g. plastic factories in Sharqia." },
    /* 📎 a photo in her bubble (switch chat_photos): the platform reads it (worker/src/chat-media.js); she never says she saw it */
    "photo.reading": { m: "thinking", ar: "ثواني، المنصة بتقرا الصورة…", en: "One moment, the platform is reading the photo…" },
    "photo.got": { m: "happy", ar: "الصورة شكلها فيها {what} — صح؟", en: "The photo looks like {what} — right?" },
    "photo.low": { m: "thinking", ar: "مش متأكدة من الصورة، باين إنها {what} — هي إيه بالظبط؟ اكتبلي اسمها.", en: "I'm not sure about the photo — it looks like {what}. What is it exactly? Type its name." },
    "photo.none": { m: "empathetic", ar: "الصورة وصلت، بس المنصة ماقدرتش تقرا اللي فيها. اكتبلي اسم المنتج وأنا أدوّرلك.", en: "The photo arrived, but the platform couldn't read it. Type the product's name and I'll search for it." },
    "photo.person": { m: "calm", ar: "أنا مابوصفش الناس ولا بقرا البطاقات أو بيانات التواصل — ابعتلي صورة للمنتج نفسه أو اكتبلي اسمه.", en: "I don't describe people or read ID cards or contact details — send me a photo of the product itself or type its name." },
    "live.none": { m: "empathetic", ar: "الفيديو المباشر مش متاح في الصفحة دي دلوقتي 🙏 أقدر أبعت رسالتك للمنصة برقم متابعة، أو نكمّل هنا كتابة وصوت.", en: "Live video isn't available on this page right now 🙏 I can send your message to the platform with a tracking number, or we carry on here by text and voice." },
    /* guided tour (8 steps) */
    "tour.start": { m: "excited", ar: "يلا بينا نلف المنصة سوا 🧭 هوريك أهم الأقسام في ٨ خطوات، ودوس «التالي» لما تخلص كل خطوة.", en: "Let's tour the platform together 🧭 Eight short steps through the main sections; tap “Next” after each one." },
    "tour.home": { m: "happy", ar: "دي الصفحة الرئيسية لمنصة صنع في مصر: من المصنع المصري للأسواق المحلية والخارجية. من هنا تبدأ أي حاجة.", en: "This is the home page of Made in Egypt Gate: from the Egyptian factory to local and foreign markets. Everything starts here." },
    "tour.search": { m: "calm", ar: "ده البحث: اختار مصانع، أو شركات وموردين، أو منتجات، أو مناقصات وطلبات أسعار، واكتب اللي بتدوّر عليه.", en: "This is the search: choose factories, companies and suppliers, products, or tenders and RFQs, and type what you're looking for." },
    "tour.factories": { m: "calm", ar: "ده دليل المصانع: المصانع والشركات المصرية على المنصة. دوّر بالاسم أو المنتج، وفلتر بالمحافظة والقطاع، وافتح ملف أي مصنع واطلب منه عرض سعر.", en: "This is the factory directory: the Egyptian factories and companies on the platform. Search by name or product, filter by governorate and sector, open any profile and ask for a quote." },
    "tour.tenders": { m: "calm", ar: "دي المناقصات الحكومية المنشورة: لكل مناقصة رقمها والجهة وموعد الإغلاق، وتقدر تفلترها بالمحافظة والقطاع.", en: "These are published government tenders: each with its number, entity and closing date, filterable by governorate and sector." },
    "tour.rfqs": { m: "calm", ar: "ودي طلبات عروض الأسعار اللي وصلت المنصة من شركات ومقاولين. المشتري يبعت طلبه ببلاش، والمصانع المسجّلة توصلها الطلبات.", en: "And these are the requests for quotation the platform received from companies and contractors. Buyers post for free; registered factories receive them." },
    "tour.export": { m: "calm", ar: "دي أسواق التصدير: الخليج والدول العربية وأفريقيا وآسيا وأوروبا، بالفرص المفتوحة ومتطلبات دخول كل سوق والشحن.", en: "These are the export markets: the Gulf & Arab states, Africa, Asia and Europe, with open opportunities, entry requirements and shipping." },
    "tour.plans": { m: "proud", ar: "ودي الباقات: من تسجيل البيانات بس لحد الشريك الاستراتيجي، وكل باقة بتفتحلك أسواق ومزايا أكتر.", en: "And these are the plans: from data registration only up to Strategic Partner; each one opens more markets and features." },
    "tour.form": { m: "excited", ar: "وده نموذج التسجيل، وبكده خلصنا الجولة 🎉 أقدر أملاه معاك خطوة بخطوة، أو أكلّمك فيديو وأشرحلك. تحب نعمل إيه؟", en: "And this is the registration form, that's the end of the tour 🎉 I can fill it in with you step by step, or talk you through it on video. What would you like?" },
    "tour.resume": { m: "happy", ar: "كنا في نص الجولة 😊 نكمّل؟", en: "We were in the middle of the tour 😊 Shall we continue?" },
    "tour.end": { m: "happy", ar: "تمام، وقفنا الجولة 👍 لو عايز ترجعلها قولّي «خدني جولة».", en: "Okay, tour stopped 👍 Say “take me on a tour” any time to restart it." },
    /* full access: items, counts, the current page */
    "item.go": { m: "happy", ar: "ثانية وأفتحلك {what} «{name}»…", en: "One second, opening {what} “{name}”…" },
    "item.go1": { m: "happy", ar: "ثانية وأفتحلك {what}…", en: "One second, opening {what}…" },
    "kiosk.tour": { m: "excited", ar: "الجولة بتمشي معاك على الصفحات نفسها 🧭 صوّر الكود ده بموبايلك 📱 وهتبدأ الجولة معايا خطوة بخطوة.", en: "The tour walks you through the pages themselves 🧭 Scan this code with your phone 📱 and the tour starts with me, step by step." },
    "item.none": { m: "empathetic", ar: "ملقيتش «{q}» في بيانات المنصة 🙈 تحب أدوّرلك في {what}؟", en: "I couldn't find “{q}” in the platform's data 🙈 Shall I search {what} for you?" },
    "item.many": { m: "thinking", ar: "لقيت كذا نتيجة قريبة من «{q}»، تقصد أنهي واحدة؟ 👇", en: "I found a few close matches for “{q}”. Which one do you mean? 👇" },
    "item.shown": { m: "proud", ar: "دي التفاصيل قدامك 👇", en: "Here are the details 👇" },
    "count.none": { m: "empathetic", ar: "ملقيتش ولا نتيجة بالمواصفات دي في بيانات المنصة 🤔 جرّب كلمة أقرب أو محافظة تانية.", en: "Nothing in the platform's data matches that 🤔 Try a closer word or another governorate." },
    "loading": { m: "thinking", ar: "ثانية، بجيب البيانات…", en: "One moment, fetching the data…" },
    /* page introductions */
    "intro.useful-links": { m: "calm", ar: "دي المراجع الرسمية ومواقع تهمك: الجهات الصناعية، والمواصفات والجودة والتراخيص، والتصدير والجمارك، والاستثمار والدعم.", en: "These are official references and useful sites: industrial authorities, standards, quality and licensing, exports and customs, investment and support." },
    "intro.bourse": { m: "calm", ar: "دي البورصة الصناعية: أسهم الشركات الصناعية المدرجة في البورصة المصرية ومؤشراها الرئيسيان EGX30 وEGX70.", en: "This is the industrial bourse: industrial companies listed on the Egyptian Exchange and its two main indices, EGX30 and EGX70." },
    "intro.agencies": { m: "calm", ar: "دي الجهات الحكومية وشبه الحكومية اللي بتطرح منافسات في محافظات مصر، وترسياتها، وأكبر الشركات الفائزة عندها.", en: "These are the government and semi-government entities that tender across Egypt, their awards and their biggest winners." },
    "intro.contractors": { m: "calm", ar: "ده دليل المقاولين والموردين: تخصصاتهم ومحافظاتهم، عشان تعرف تورّد منتجاتك لمين.", en: "This is the contractors and suppliers directory: their specialities and governorates, so you know who to supply." },
    "intro.leads": { m: "calm", ar: "دي طلبات توريد المواد من المقاولين والاستشاريين في المشاريع المعلنة. اطلب التواصل، والمنصة تبعت ملف مصنعك للطرف الطالب.", en: "These are material supply requests from contractors and consultants on announced projects. Ask to connect and the platform sends your factory profile to them." },
    "intro.consultant-leads": { m: "calm", ar: "دي طلبات الاستشاريين في المشاريع: مواد ومواصفات مطلوبة.", en: "These are consultants' requests on projects: materials and specifications needed." },
    "intro.project-news": { m: "calm", ar: "دي أخبار المشاريع ومراحلها.", en: "This is project news and project stages." },
    "intro.videos": { m: "calm", ar: "دي المرئيات: لقاءات ومؤتمرات وجولات مرئية في القطاع الصناعي المصري.", en: "These are videos: interviews, conferences and visual tours of Egyptian industry." },
    "intro.deal": { m: "calm", ar: "ده دليل استرشادي لخدمات الصفقة: جهات تمويل المصانع والشحن والتأمين، والتقديم بيتم مباشرة مع الجهة.", en: "This is a guide to deal services: factory financing, shipping and insurance; you apply directly with each provider." },
    "intro.event": { m: "calm", ar: "دي تفاصيل المعرض: مواعيده ومكانه ونبذة عنه، ورابط موقعه الرسمي.", en: "These are the exhibition details: dates, venue, an overview and the official website link." },
    "intro.home": { m: "happy", ar: "دي الصفحة الرئيسية: هنا آخر المناقصات وطلبات الأسعار، والمصانع، والعروض، وأخبار الصناعة. تحب أدوّرلك على حاجة؟", en: "This is the home page: the latest tenders and RFQs, factories, offers and industry news. Shall I look something up for you?" },
    "intro.factories": { m: "happy", ar: "ده دليل المصانع: المصانع والشركات المصرية على المنصة. قولّي بتدوّر على إيه وفي أنهي محافظة، وأنا أفلترهالك.", en: "This is the factory directory: the Egyptian factories and companies on the platform. Tell me what you're looking for and where, and I'll filter it for you." },
    "intro.company": { m: "calm", ar: "ده ملف المنشأة: نبذة عنها ومنتجاتها، وتقدر تطلب منها عرض سعر من الزرار الأخضر.", en: "This is the company profile: an overview and its products. Use the green button to request a quote directly." },
    "intro.factory": { m: "proud", ar: "ده مثال لملف مصنع كامل: منتجات وشهادات وصور وطلب عرض سعر مباشر. ملف مصنعك هيبقى كده بعد التسجيل.", en: "This is a sample full factory profile: products, certificates, photos and a direct RFQ form. Your factory's profile will look like this after you register." },
    "intro.market": { m: "happy", ar: "ده السوق: منتجات المصانع المصرية بأسعار المصنع. قولّي اسم المنتج وأنا أطلّعهولك.", en: "This is the marketplace: Egyptian factory products at factory prices. Tell me the product and I'll pull it up." },
    "intro.offers": { m: "happy", ar: "دي أحدث العروض في منافذ البيع: أغذية وملابس ومفروشات ومواد بناء وأجهزة.", en: "These are the latest retail offers: food, clothing, home textiles, building materials and appliances." },
    "intro.offer": { m: "calm", ar: "دي تفاصيل العرض: السعر قبل وبعد الخصم، والمتجر، والفروع.", en: "Here are the offer details: price before and after discount, the store and its branches." },
    "intro.tenders": { m: "calm", ar: "دي المناقصات المصرية: كل مناقصة معاها الجهة صاحبتها وموعد الإغلاق. قولّي النشاط أو المحافظة وأنا أفلترهالك.", en: "These are Egyptian tenders, each with its buyer and closing date. Tell me the activity or governorate and I'll filter them." },
    "intro.rfqs": { m: "calm", ar: "دي طلبات عروض الأسعار من الشركات والمقاولين. لو إنت مشتري ابعت طلبك ببلاش، ولو مصنع سجّل عشان توصلك الطلبات.", en: "These are real requests for quotation from companies and contractors. Buyers can post one for free; factories should register to receive them." },
    "intro.opportunity": { m: "calm", ar: "دي كل الفرص المفتوحة: مناقصات محلية وخارجية. افتح أي فرصة تشوف تفاصيلها وموعدها.", en: "These are all open opportunities: local and international tenders. Open any of them for details and deadlines." },
    "intro.projects": { m: "calm", ar: "دي مشاريع مصر الكبيرة ومراحلها والمواد اللي محتاجاها. اختار مشروع وقدّم عرض توريد.", en: "These are Egypt's major projects, their stages and the materials they need. Open a project and offer to supply." },
    "intro.project": { m: "calm", ar: "دي تفاصيل المشروع: المالك والمقاول والقيمة وحزم المواد المطلوبة.", en: "These are the project details: owner, contractor, value and the material packages needed." },
    "intro.winners": { m: "calm", ar: "دي الترسيات: مين كسب العقود، وبكام، ومن أنهي جهة. اقرا السوق قبل ما تسعّر عرضك الجاي.", en: "These are contract awards: who won, for how much and from which entity. Read the market before pricing your next bid." },
    "intro.region": { m: "calm", ar: "دي صفحات المحافظات: لكل محافظة مناقصاتها ومصانعها ومنتجاتها ومشاريعها. قولّي اسم المحافظة وأنا أفتحهالك.", en: "These are the governorate pages: each with its tenders, factories, products and projects. Tell me the governorate and I'll open it." },
    "intro.cities": { m: "calm", ar: "دي المدن والمناطق الصناعية والحرة في مصر. افتح أي مدينة تشوف الفرص والمصانع فيها.", en: "These are Egypt's industrial cities and free zones. Open any city to see its opportunities and factories." },
    "intro.city": { m: "calm", ar: "دي صفحة المدينة الصناعية: معلوماتها والمناقصات والمصانع والمشاريع اللي حواليها.", en: "This is the industrial city page: its details, tenders, factories and nearby projects." },
    "intro.map": { m: "happy", ar: "دي خريطة مصر الصناعية: كل المدن والمناطق الصناعية والحرة والموانئ. دوس على أي دبوس تعرف تفاصيله.", en: "This is Egypt's industrial map: every industrial city, free zone and port. Click any pin for details." },
    "intro.register": { m: "excited", ar: "هنا بتسجّل منشأتك وتختار باقتك. تحب أساعدك أختار الباقة، أو أملا الاستمارة معاك؟", en: "This is where you register and pick a plan. Shall I help you choose one, or fill in the form with you?" },
    "intro.about": { m: "calm", ar: "دي صفحة عن المنصة: إحنا مين، وأهدافنا، والجمعية المصرية للتنمية الصناعية اللي بتشغّل المنصة.", en: "This is the About page: who we are, our goals, and the Egypt Industrial Development Association that runs the platform." },
    "intro.contact": { m: "happy", ar: "هنا تتواصل معانا أو تبعت طلب عرض سعر. لو تحب، أنا أملا الفورم معاك.", en: "Here you can contact us or send a request for quotation. If you like, I'll fill in the form with you." },
    "intro.export-market": { m: "calm", ar: "دي أسواق التصدير الخمسة: المحلي، والخليجي والعربي، والأفريقي، والآسيوي، والأوروبي.", en: "These are the five export markets: local, Gulf & Arab, African, Asian and European." },
    "intro.intl": { m: "calm", ar: "دي المنصات الدولية لمنظومة صنع في: السعودية والإمارات والخليج وأفريقيا وآسيا وأوروبا.", en: "These are the international 'Made in' platforms: Saudi Arabia, the UAE, the Gulf, Africa, Asia and Europe." },
    "intro.news": { m: "calm", ar: "دي أخبار الصناعة المصرية. دوس على أي خبر تقراه كامل.", en: "This is Egyptian industry news. Click any story to read it." },
    "intro.article": { m: "calm", ar: "ده الخبر كامل.", en: "Here's the full story." },
    "intro.events": { m: "happy", ar: "دي رزنامة المعارض الصناعية في مصر، وتقدر تضيف أي معرض لتقويمك.", en: "This is the calendar of industrial exhibitions in Egypt. You can add any of them to your calendar." },
    "intro.media-center": { m: "calm", ar: "ده المركز الإعلامي: الأخبار والفيديوهات والمعارض.", en: "This is the media centre: news, videos and exhibitions." },
    "intro.suppliers": { m: "calm", ar: "ده دليل الموردين والشركات. قولّي بتدوّر على إيه وأنا أدوّرلك.", en: "This is the suppliers directory. Tell me what you need and I'll search it." },
    "intro.outlets": { m: "calm", ar: "دي منافذ البيع وعروضها. دوس على أي منفذ تشوف عروضه.", en: "These are retail outlets and their offers. Click any outlet to see its offers." },
    "intro.radar": { m: "calm", ar: "ده رادار الفرص: فين منتجك مطلوب محلياً وفي الأسواق الخارجية.", en: "This is the opportunity radar: where your product is in demand locally and abroad." },
    "intro.legal": { m: "calm", ar: "ده المركز القانوني: الشروط والخصوصية والعضوية والاسترداد والشكاوى.", en: "This is the legal centre: terms, privacy, membership, refunds and complaints." },
    "intro.dashboard": { m: "calm", ar: "دي لوحتك على المنصة: طلباتك، والطلبات اللي بتتوزّع على مصنعك، ومتابعاتك، وإشعاراتك، وباقتك.", en: "This is your platform dashboard: your requests, the requests routed to your factory, your follows, your notifications and your plan." },
    "intro.track": { m: "calm", ar: "هنا تتابع حالة طلب عرض السعر برقمه.", en: "Here you can track your request for quotation by its number." }
  };
  /* the plans: data/plan.js (MIGPLAN) is the ONLY source — names, markets, product limits, levels and, when the platform has them, the
     yearly prices (MIGPLAN.PL[k].price, EGP before VAT). A price MIGPLAN does not give is never said: she points to the plans page. */
  var PKEYS = ["profile", "basic", "premium", "partner", "strategic"];
  var PMK = { local: ["مصر", "Egypt"], gulf: ["كل دول الخليج الست", "all 6 Gulf states"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
  function MP() { return window.MIGPLAN && window.MIGPLAN.PL ? window.MIGPLAN : null; }
  function planName(k) { var P = MP(), o = P && P.PL[k]; return o ? (L === "ar" ? o.n : o.en) : k; }
  /* the platform's own app (user agent «MIGApp», app/): its own «nomic» words; and while the owner keeps buying off inside it
     (data/flags.js MIGFLAGS.buyOff — «🛠️ المطوّر» app_buy_ios / app_buy_android, ON by default = exactly like the website) Janna names
     no price and no payment there (store rules, app parity plan item app-buy-switch) */
  var NOMIC = /\bMIGApp\b/.test(navigator.userAgent || "") ? "nomic.app" : "nomic";
  function noBuy() { var F = window.MIGFLAGS; return !!(F && F.buyOff && F.buyOff()); }
  function planPrice(k) {
    var P = MP(), o = P && P.PL[k], v = null; if (!o || noBuy()) return null;
    try { if (typeof P.price === "function") v = P.price(k); } catch (e) {}
    if (v == null) v = o.price != null ? o.price : o.egp;
    v = Number(v); return v > 0 && isFinite(v) ? v : null;
  }
  function vatRate() { var P = MP(), r = P && P.VAT != null ? Number(P.VAT) : .14; return r >= 0 && r < 1 ? r : .14; }
  /* how many GCC states plan k lets the member pick (Premium = Egypt + 3 he chooses; 0 = none or all six) */
  function gccPick(k) { var P = MP(); return P && P.gccPickOf && k ? P.gccPickOf(k) : 0; }
  function gccWords(n, ar) { var P = MP(); return P && P.gccCount ? P.gccCount(n, !ar) : n + (ar ? " دول خليجية" : " Gulf states"); }
  /* «مصر» · «مصر + 3 دول خليجية تختارها» · «مصر وكل دول الخليج الست وأفريقيا» · «كل أسواق العالم» */
  function planMarkets(k) {
    var P = MP(), o = P && P.PL[k], ar = L === "ar", m = (o && o.markets) || [], n = gccPick(k), parts = [], plus = "";
    if (!m.length) return "";
    if (["local", "gulf", "africa", "asia", "europe"].every(function (x) { return m.indexOf(x) > -1; })) return ar ? "كل أسواق العالم" : "all world markets";
    m.forEach(function (x) { if (x === "gulf" && n) plus = " + " + gccWords(n, ar) + (ar ? " تختارها" : " of your choice"); else parts.push(PMK[x] ? PMK[x][ar ? 0 : 1] : x); });
    return (ar ? parts.join(" و") : parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts.join("")) + plus;
  }
  function planFeat(k) {
    var P = MP(), o = P && P.PL[k]; if (!o) return "";
    var ar = L === "ar";
    /* profile only (owner 2026-11-18): the listing, no opportunities */
    if (k === "profile") return ar ? "بروفايل لشركتك في الدليل وفي نتائج البحث بس — مابيفتحش المناقصات ولا طلبات الأسعار ولا أي فرص" : "only your company profile in the directory and in search results — no tenders, RFQs or opportunities";
    /* a capability of plan k: the Control Center matrix when it carries it, else the plan's level */
    var cap = function (f, lv) { var c = window.MIGPLANS && MIGPLANS.caps ? MIGPLANS.caps(k) : null; return c && Object.prototype.hasOwnProperty.call(c, f) ? !!+c[f] : o.lv >= lv; };
    var out = [(ar ? "المناقصات وطلبات الأسعار والترسيات وأخبار المشاريع في: " : "Tenders, RFQs, awards and project news in: ") + planMarkets(k)];
    if (o.products === Infinity) out.push(ar ? "منتجات بلا حدود" : "unlimited products"); else if (o.products > 0) out.push(ar ? "حتى " + o.products + " منتج" : "up to " + o.products + " products");
    out.push(ar ? "بتستقبل طلبات المشترين تلقائياً وإحصائياتك الحقيقية" : "receives buyers' requests automatically, with your real stats");
    if (cap("procurement", 3)) out.push(ar ? "أخبار المشتريات" : "procurement news");
    if (cap("priority", 3)) out.push(ar ? "أولوية في المطابقة والظهور" : "priority in matching and listings");
    if (cap("bassem", 4)) out.push(ar ? "مستشار أعمالك باسم طول السنة" : "Bassem, your business advisor, all year");
    if (k === "strategic") out.push(ar ? "كل الخدمات الاستشارية" : "all consulting services");
    return out.join(" · ");
  }
  function planPriceTxt(k) {
    if (noBuy()) return "";
    var p = planPrice(k), r = vatRate(); if (p == null) return L === "ar" ? "السعر الحالي مكتوب في صفحة الباقات." : "The current price is on the plans page.";
    var v = Math.round(p * r), pc = Math.round(r * 100) + "%";
    return L === "ar" ? "السعر " + money(p) + " جنيه في السنة + ضريبة القيمة المضافة " + pc + " (" + money(v) + ") يعني " + money(p + v) + " جنيه." : "Price: EGP " + money(p) + " a year + " + pc + " VAT (" + money(v) + ") = EGP " + money(p + v) + ".";
  }
  function plansList() {
    var ar = L === "ar", ks = PKEYS.filter(function (k) { return MP() && MP().PL[k]; }), priced = ks.filter(function (k) { return planPrice(k) != null; }).length === ks.length && ks.length;
    if (noBuy()) return ks.length ? (ar ? "عندنا " + ks.length + " باقات سنوية: " : "We have " + ks.length + " yearly plans: ") + ks.map(planName).join(ar ? "، " : ", ") + "." : "";
    if (!ks.length) return ar ? "الباقات وأسعارها في صفحة الباقات." : "The plans and their prices are on the plans page.";
    if (!priced) return (ar ? "عندنا " + ks.length + " باقات سنوية: " : "We have " + ks.length + " yearly plans: ") + ks.map(planName).join(ar ? "، " : ", ") + (ar ? ". الأسعار الحالية في صفحة الباقات." : ". The current prices are on the plans page.");
    return (ar ? "باقاتنا سنوية: " : "Our plans are yearly: ") + ks.map(function (k) { return planName(k) + " " + (ar ? money(planPrice(k)) + " جنيه" : "EGP " + money(planPrice(k))); }).join(ar ? "، و" : ", ") + (ar ? "، وكلها عليها ضريبة القيمة المضافة " + Math.round(vatRate() * 100) + "%." : ", all plus " + Math.round(vatRate() * 100) + "% VAT.");
  }
  var PAYTXT = { ar: "بوابة الدفع الإلكتروني لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع.", en: "The online payment gateway is still being set up — once it is live, the secure payment link reaches your company e-mail automatically and the account is activated automatically after payment." };
  /* deploy 2: the Control Center says the gateway is live (data/plans-live.js → window.MIGPAYREADY) */
  if (window.MIGPAYREADY) PAYTXT = { ar: "الدفع أونلاين من صفحة الدفع الآمنة بعد طلب التسجيل — رابط الدفع بيوصلك على بريد الشركة، والحساب بيتفعّل تلقائياً بعد الدفع.", en: "Payment is online, on the secure payment page, after you send the registration — the link reaches the company e-mail and the account is activated automatically after payment." };
  function money(n) { return Number(n).toLocaleString("en-US"); }

  /* UI labels (not spoken) */
  var TX = {
    name: { ar: "جنة", en: "Janna" }, role: { ar: "مساعدتك الذكية", en: "your smart assistant" },
    ask: { ar: "اكتب لجنة أي حاجة…", en: "Ask Janna anything…" }, mic: { ar: "اتكلم", en: "Talk" }, chat: { ar: "محادثة", en: "Chat" },
    reg: { ar: "ساعديني أسجّل", en: "Help me register" }, regfill: { ar: "املي الاستمارة معايا", en: "Fill in the form with me" },
    rfq: { ar: "ابعتي طلب عرض سعر", en: "Send a request for quotation" }, msg: { ar: "ابعتي رسالة للمنصة", en: "Send a message to the platform" },
    can: { ar: "بتعرفي تعملي إيه؟", en: "What can you do?" }, skip: { ar: "تخطّي", en: "Skip" }, cancel: { ar: "إلغاء", en: "Cancel" },
    yes: { ar: "أيوه، كمّلي", en: "Yes, continue" }, send: { ar: "أبعته ✓", en: "Send ✓" }, next: { ar: "كمّلي ✓", en: "Continue ✓" }, edit: { ar: "هعدّل الأول", en: "Let me edit first" },
    same: { ar: "نفس الإيميل", en: "Same e-mail" }, chgP: { ar: "غيّر المنتج", en: "Change product" }, openPage: { ar: "افتح صفحة التسجيل", en: "Open the registration page" }, compare: { ar: "قارن الباقات", en: "Compare plans" },
    phone: { ar: "كمّل من موبايلك", en: "Continue on my phone" }, thinking: { ar: "جنة بتفكر", en: "Janna is thinking" },
    snd: { ar: "الصوت", en: "Sound" }, min: { ar: "تصغير", en: "Minimise" }, open: { ar: "افتح جنة", en: "Open Janna" }, talk: { ar: "كلّم جنة", en: "Talk to Janna" },
    tapToTalk: { ar: "دوس على الشاشة وكلّم جنة", en: "Tap the screen to talk to Janna" },
    qr: { ar: "صوّر الكود بموبايلك", en: "Scan with your phone" }, goThere: { ar: "خديني هناك", en: "Take me there" },
    "srch.factories": { ar: "دوّري لي على مصنع", en: "Find me a factory" }, "srch.market": { ar: "دوّري لي على منتج", en: "Find me a product" },
    "srch.tenders": { ar: "دوّري على مناقصة", en: "Find a tender" }, "srch.rfqs": { ar: "دوّري على طلب", en: "Find a request" },
    "srch.suppliers": { ar: "دوّري على مورد", en: "Find a supplier" }, "srch.projects": { ar: "دوّري على مشروع", en: "Find a project" }, "srch.offers": { ar: "دوّري على عرض", en: "Find an offer" },
    /* welcome stage */
    stRole: { ar: "مسؤولة التسجيل والتسويق", en: "Registration & marketing manager" }, stOnline: { ar: "متاحة دلوقتي", en: "Available now" },
    stHi: { ar: "أهلاً بيك في منصة صنع في مصر 👋", en: "Welcome to Made in Egypt Gate 👋" },
    stMe: { ar: "أنا جنة، مسؤولة التسجيل في المنصة، وموجودة عشانك.", en: "I'm Janna, the platform's registration manager, and I'm here for you." },
    stVal: { ar: "أكتر من 3,000 منشأة مصرية، والمناقصات وطلبات الأسعار، وأسواق التصدير الخمسة… في مكان واحد، وأنا معاك خطوة بخطوة.", en: "More than 3,000 Egyptian companies, tenders and RFQs, and five export markets… in one place, and I'm with you every step." },
    stHear: { ar: "🔊 اسمعني", en: "🔊 Hear me" }, stHearSub: { ar: "أو دوس في أي حتة عشان أتكلم", en: "or tap anywhere and I'll talk" }, stReplay: { ar: "🔁 قوليها تاني", en: "🔁 Say it again" },
    stVideo: { ar: "🎥 كلّمني فيديو دلوقتي", en: "🎥 Talk to me on video now" }, stVideoS: { ar: "مكالمة فيديو مباشرة معايا", en: "A live video call with me" },
    stMeet: { ar: "📅 اجتماع تعريفي معايا دلوقتي", en: "📅 An intro meeting with me now" }, stMeetS: { ar: "أشرحلك المنصة والباقات لايف", en: "I explain the platform and plans live" },
    stLive: { ar: "🎥 مكالمة فيديو لايف أو اجتماع تعريفي دلوقتي", en: "🎥 A live video call or an intro meeting now" }, stLiveS: { ar: "صوت وصورة على طول، ولو عايز اجتماع تعريفي قول «اجتماع» في المكالمة", en: "Voice and video right away; for an intro meeting just say “meeting” in the call" },
    stTour: { ar: "🧭 خدني جولة في المنصة", en: "🧭 Take me on a platform tour" }, stTourS: { ar: "٨ خطوات سريعة", en: "8 quick steps" },
    stReg: { ar: "✍️ سجّل مصنعك", en: "✍️ Register your factory" }, stRegS: { ar: "أختارلك الباقة وأملا الاستمارة معاك", en: "I pick the plan and fill in the form with you" },
    stFind: { ar: "🔎 بدوّر على مصانع / مناقصات / عروض", en: "🔎 I'm looking for factories / tenders / offers" }, stFindS: { ar: "قولّي وأنا أجيبهولك", en: "Tell me and I'll find it" },
    wcHi: { ar: "أهلاً بيك 👋 أنا جنة", en: "Hi there 👋 I'm Janna" }, wcTap: { ar: "دوس هنا وأنا أكلمك 🔊", en: "Tap here and I'll talk 🔊" },
    wcSub: { ar: "مسؤولة التسجيل · متاحة دلوقتي", en: "Registration manager · online now" }, wcOpen: { ar: "افتح جنة واسمعها", en: "Open Janna and hear her" },
    stAlone: { ar: "اتصفح لوحدي", en: "Browse on my own" }, stAsk: { ar: "أو اسألني أي حاجة…", en: "Or ask me anything…" }, close: { ar: "إغلاق", en: "Close" },
    expand: { ar: "قدّامي", en: "Bring Janna forward" }, video: { ar: "🎥 فيديو", en: "🎥 Video" }, meet: { ar: "📅 اجتماع", en: "📅 Meeting" }, tourB: { ar: "🧭 جولة", en: "🧭 Tour" },
    /* tour */
    tNext: { ar: "التالي ←", en: "Next →" }, tBack: { ar: "→ رجوع", en: "← Back" }, tEnd: { ar: "إنهاء الجولة", en: "End tour" }, tCont: { ar: "كمّلي الجولة", en: "Continue the tour" }, tStep: { ar: "خطوة", en: "Step" },
    /* items */
    photoBtn: { ar: "ابعتلي صورة المنتج", en: "Send me a photo of the product" }, photoF: { ar: "🔎 دوّري عليها في المصانع", en: "🔎 Search factories for it" },
    photoM: { ar: "🛒 دوّري في السوق", en: "🛒 Search the marketplace" }, photoLive: { ar: "🎥 كلّم جنة عنها", en: "🎥 Talk to Janna about it" },
    openIt: { ar: "افتح", en: "Open" }, source: { ar: "المصدر الرسمي", en: "Official source" }, showAll: { ar: "اعرضهم في الصفحة", en: "Show them on the page" }, details: { ar: "التفاصيل", en: "Details" }
  };
  function t(k) { return (TX[k] || {})[L] || ""; }
  var MOODS = { happy: { r: 1, p: 1.12, e: "😊" }, excited: { r: 1.07, p: 1.2, e: "🤩" }, calm: { r: .96, p: 1.05, e: "🙂" }, empathetic: { r: .9, p: 1, e: "🤗" }, thinking: { r: .94, p: 1.04, e: "🤔" }, proud: { r: 1, p: 1.16, e: "👏" } };

  /* pick a line (a random variant that differs from the last one used) → segment {t, k (voice key or null), m} */
  var lastV = {};
  function ln(id, vars) {
    var ids = LINES[id] ? [id] : [0, 1, 2, 3, 4].map(function (i) { return id + "." + i; }).filter(function (k) { return LINES[k]; });
    if (!ids.length) return null;
    var pool = ids.length > 1 ? ids.filter(function (k) { return k !== lastV[id]; }) : ids, k = pool[Math.floor(Math.random() * pool.length)]; lastV[id] = k;
    var o = LINES[k], s = o[L] || o.ar, dyn = false;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (a, n) { dyn = true; return vars[n] == null ? "" : vars[n]; });
    return { t: s, k: dyn ? null : k + "." + L, m: o.m };
  }
  function seg(text, mood) { return { t: String(text || ""), k: null, m: mood || "calm" }; }

  /* ---------- page sections (navigation) & search pages ---------- */
  var SECT = [
    ["rfqs", "طلبات الاسعار|طلبات عروض الاسعار|طلبات عرض السعر|طلبات التسعير|طلبات التوريد", "rfqs?|requests? for quotations?|quote requests|purchase requests", "طلبات الأسعار", "the requests for quotation"],
    ["consultant-leads", "طلبات الاستشاريين|طلبات استشاريين", "consultant (?:leads|requests)", "طلبات الاستشاريين", "consultants' requests"],
    ["leads", "طلبات المواد|طلبات المقاولين|طلبات توريد المواد", "material requests|leads|contractor leads", "طلبات المواد", "material requests"],
    ["contractors", "دليل المقاولين|مقاولين|المقاولين|مقاولون", "contractors?", "دليل المقاولين والموردين", "the contractors directory"],
    ["project-news", "اخبار المشاريع|اخبار المشروعات", "project news", "أخبار المشاريع", "project news"],
    ["useful-links", "روابط مفيده|مواقع تهمك|المراجع الرسميه|مراجع رسميه|جهات رسميه|لينكات مفيده", "useful links|official references|links", "المراجع الرسمية ومواقع تهمك", "official references"],
    ["bourse", "بورصه|البورصه الصناعيه|اسهم|الاسهم|مؤشر البورصه", "bourse|stock exchange|stocks?|shares|egx", "البورصة الصناعية", "the industrial bourse"],
    ["deal", "خدمات الصفقه|تمويل المصانع|جهات التمويل|تمويل", "deal services|financ(?:e|ing)", "خدمات الصفقة والتمويل", "deal services and financing"],
    ["factory", "ملف مصنع نموذجي|مثال ملف مصنع|بروفايل نموذجي", "sample (?:factory )?profile", "مثال ملف المصنع", "the sample factory profile"],
    ["tenders", "مناقصات|مناقصه|المناقصات الحكوميه", "tenders?|bids", "المناقصات", "tenders"],
    ["factories", "دليل المصانع|مصانع|مصنع|دليل الشركات|شركات", "factory directory|factor(?:y|ies)|manufacturers?|companies|directory", "دليل المصانع", "the factory directory"],
    ["suppliers", "موردين|موردون|مورد|دليل الموردين", "suppliers?|vendors?", "دليل الموردين", "the suppliers directory"],
    ["market", "سوق الالكتروني|سوق|منتجات|منتج|متجر|سلع", "market(?:place)?|products?|shop|store|goods", "السوق", "the marketplace"],
    ["outlets", "منافذ البيع|منافذ|محلات", "outlets|retailers", "منافذ البيع", "retail outlets"],
    ["offers", "عروض|خصومات|تخفيضات|اوكازيون", "offers?|deals|discounts|sales", "العروض", "the offers"],
    ["projects", "مشاريع|مشروعات|مشروع", "projects?", "المشاريع", "projects"],
    ["region", "محافظات|المحافظات", "governorates?|regions?|provinces?", "المحافظات", "the governorates"],
    ["cities", "مدن صناعيه|المدن الصناعيه|مناطق صناعيه|المناطق الصناعيه|مناطق حره|مدن", "industrial (?:cities|zones|areas)|free zones|cities|zones", "المدن الصناعية", "industrial cities"],
    ["map", "خريطه|خريطة الفرص", "map", "الخريطة", "the map"],
    ["news", "اخبار", "news", "الأخبار", "the news"],
    ["events", "معارض|معرض|فعاليات", "events?|exhibitions?|fairs?|expos?", "المعارض", "exhibitions"],
    ["videos", "فيديوهات|فيديو", "videos?", "الفيديوهات", "videos"],
    ["media-center", "مركز الاعلامي|المركز الاعلامي|ميديا", "media(?: cent(?:er|re))?", "المركز الإعلامي", "the media centre"],
    ["winners", "ترسيات|ترسيه|شركات الفايزه|فايزين|فائزين", "awards?|winners?|contract awards", "الترسيات", "contract awards"],
    ["agencies", "جهات الحكوميه|جهات حكوميه", "government entities|agencies", "الجهات الحكومية", "government entities"],
    ["export-market", "تصدير|اسواق التصدير|اسواق الخارجيه", "exports?|export markets?", "أسواق التصدير", "export markets"],
    ["intl", "منصات الدوليه|منصات دوليه", "international platforms?|intl", "المنصات الدولية", "international platforms"],
    ["radar", "رادار|رادار الفرص", "radar", "رادار الفرص", "the opportunity radar"],
    ["about", "عن المنصه|من نحن|مين احنا|عنكم|عن الجمعيه", "about(?: us)?|who we are", "عن المنصة", "the About page"],
    ["contact", "اتصل بنا|تواصل|اتصال|الدعم|دعم", "contact(?: us)?|support", "صفحة التواصل", "the contact page"],
    ["register", "تسجيل|باقات|اشتراك|اسعار الباقات", "register|registration|plans|pricing|sign ?up|packages", "التسجيل والباقات", "registration and plans"],
    ["legal", "شروط|الشروط والاحكام|خصوصيه|سياسه الخصوصيه|المركز القانوني|قانوني", "terms|privacy|legal", "المركز القانوني", "the legal centre"],
    ["track", "تتبع|تتبع الطلب", "track(?:ing)?", "تتبع الطلب", "request tracking"],
    ["dashboard", "لوحه المصنع|لوحه التحكم|داشبورد", "dashboard", "لوحة المصنع", "the factory dashboard"],
    ["home", "رئيسيه|الصفحه الرئيسيه|هوم|بدايه", "home(?: ?page)?|main page", "الصفحة الرئيسية", "the home page"]
  ];
  var SEARCH = {
    factories: { q: "#q", gov: "#c", cnt: "#cnt", ar: "دليل المصانع", en: "the factory directory", x: "شركات|شركه" },
    market: { q: "#sq", gov: "#fReg", form: "#ssearch", res: "#results", ar: "السوق", en: "the marketplace" },
    tenders: { q: "#olQ", rg: "#olRg", cnt: "#olC", ar: "المناقصات", en: "tenders" },
    rfqs: { q: "#olQ", rg: "#olRg", cnt: "#olC", ar: "طلبات الأسعار", en: "requests for quotation", x: "طلبات|طلب" },
    suppliers: { q: "#sq", gov: "#se", cnt: "#scnt", ar: "الموردين", en: "suppliers" },
    offers: { q: "#oq", cnt: "#ocnt", ar: "العروض", en: "offers", x: "عرض" },
    projects: { q: "#q", gov: "#r", cnt: "#cnt", ar: "المشاريع", en: "projects" }
  };
  var GOV = [["CAI", "القاهرة", "Cairo", "قاهره|مصر الجديده", "cairo"], ["GIZ", "الجيزة", "Giza", "جيزه", "giza"], ["ALX", "الإسكندرية", "Alexandria", "اسكندريه|سكندريه", "alexandria|alex"], ["QLB", "القليوبية", "Qalyubia", "قليوبيه", "qalyubi?ya|qaliubiya"], ["SHR", "الشرقية", "Sharqia", "شرقيه", "sharqi?ya|sharkia|sharqia"], ["DKH", "الدقهلية", "Dakahlia", "دقهليه|منصوره", "dakahlia|daqahlia|mansoura"], ["GHR", "الغربية", "Gharbia", "غربيه|طنطا|محله الكبري", "gharbi?ya|tanta|mahalla"], ["MNF", "المنوفية", "Monufia", "منوفيه", "monufia|menoufia|minufiya"], ["BHR", "البحيرة", "Beheira", "بحيره|دمنهور", "beheira|buhayra|damanhour"], ["KFS", "كفر الشيخ", "Kafr El Sheikh", "كفر الشيخ", "kafr el ?sheikh"], ["DMT", "دمياط", "Damietta", "دمياط", "damietta"], ["PTS", "بورسعيد", "Port Said", "بورسعيد|بور سعيد", "port ?said"], ["ISM", "الإسماعيلية", "Ismailia", "اسماعيليه", "ismailia"], ["SUZ", "السويس", "Suez", "سويس", "suez"], ["NSN", "شمال سيناء", "North Sinai", "شمال سيناء?|عريش", "north sinai|arish"], ["JSN", "جنوب سيناء", "South Sinai", "جنوب سيناء?|شرم الشيخ", "south sinai|sharm"], ["FYM", "الفيوم", "Faiyum", "فيوم", "fayoum|faiyum|fayyum"], ["BNS", "بني سويف", "Beni Suef", "بني سويف", "beni ?suef"], ["MNY", "المنيا", "Minya", "منيا", "minya|menia"], ["AST", "أسيوط", "Assiut", "اسيوط", "assiut|asyut"], ["SHG", "سوهاج", "Sohag", "سوهاج", "sohag"], ["QNA", "قنا", "Qena", "قنا", "qena"], ["LXR", "الأقصر", "Luxor", "اقصر|لوكسور", "luxor"], ["ASN", "أسوان", "Aswan", "اسوان", "aswan"], ["BBA", "البحر الأحمر", "Red Sea", "بحر الاحمر|غردقه", "red sea|hurghada"], ["WAD", "الوادي الجديد", "New Valley", "وادي الجديد", "new valley"], ["MTR", "مطروح", "Matrouh", "مطروح|مرسي مطروح", "matrouh|matruh"]];
  function govName(c) { for (var i = 0; i < GOV.length; i++) if (GOV[i][0] === c) return L === "ar" ? GOV[i][1] : GOV[i][2]; return c; }

  /* chips (suggested actions) per page: ["reg"], ["rfq"], ["msg"], ["srch", entity], ["nav", ar, en, href], ["regfill"], ["can"] */
  var P = {
    home: [["reg"], ["srch", "factories"], ["rfq"], ["can"]],
    factories: [["srch", "factories"], ["rfq"], ["reg"]], company: [["rfq"], ["nav", "دليل المصانع", "Factory directory", "factories.html"]], factory: [["reg"]],
    market: [["srch", "market"], ["rfq"], ["nav", "العروض", "Offers", "offers.html"]], offers: [["srch", "offers"], ["nav", "منافذ البيع", "Retail outlets", "outlets.html"]], offer: [["nav", "كل العروض", "All offers", "offers.html"]],
    tenders: [["srch", "tenders"], ["reg"], ["nav", "طلبات الأسعار", "RFQs", "rfqs.html"]], rfqs: [["srch", "rfqs"], ["rfq"], ["reg"]], opportunity: [["reg"]],
    projects: [["srch", "projects"], ["nav", "طلبات المواد", "Material requests", "leads.html"]], project: [["nav", "كل المشاريع", "All projects", "projects.html"]],
    winners: [["nav", "الجهات الحكومية", "Government entities", "agencies.html"]], region: [["nav", "خريطة الفرص", "Opportunity map", "map.html"]],
    cities: [["nav", "الخريطة", "Map", "map.html"]], city: [["reg"]], map: [["nav", "المدن الصناعية", "Industrial cities", "cities.html"]],
    register: [["reg"], ["regfill"]], about: [["reg"]], contact: [["rfq"], ["msg"], ["nav", "واتساب", "WhatsApp", "https://wa.me/201279188996"]],
    "export-market": [["reg"]], intl: [], news: [["nav", "المعارض", "Exhibitions", "events.html"]], article: [["nav", "كل الأخبار", "All news", "news.html"]],
    events: [], event: [["nav", "كل المعارض", "All exhibitions", "events.html"]], "media-center": [], suppliers: [["srch", "suppliers"], ["reg"]], outlets: [], radar: [["reg"]], legal: [], dashboard: [], track: [["rfq"]],
    "useful-links": [["nav", "المركز القانوني", "Legal centre", "legal.html"]], bourse: [["nav", "الأخبار", "News", "news.html"]], agencies: [["nav", "الترسيات", "Contract awards", "winners.html"]],
    contractors: [["nav", "طلبات المواد", "Material requests", "leads.html"]], leads: [["nav", "المشاريع", "Projects", "projects.html"]], videos: [["nav", "الأخبار", "News", "news.html"]], deal: [["rfq"]]
  };
  var ALIAS = { entity: "agencies", winner: "winners", "contractor-leads": "leads", lead: "leads" };
  /* pages where she stays in the corner (no welcome stage, no arrivals): members' tools and live meetings */
  var QUIET = { dashboard: 1, advisor: 1, meeting: 1, admin: 1, inbox: 1, pay: 1, "seo-team": 1, "data-desk": 1 };
  function pkey(p) { p = p || PAGE; return LINES["intro." + p] ? p : ALIAS[p] && LINES["intro." + ALIAS[p]] ? ALIAS[p] : "home"; }

  /* ---------- styles ---------- */
  var css = ''
    + '.jn-fig{position:fixed;z-index:65;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);height:min(40vh,380px);pointer-events:none;font-family:Cairo,Tajawal,Tahoma,sans-serif;--bd:4s}'
    + '.jn-fig[hidden],.jn-mini[hidden],.jn-bub[hidden],.jn-beam[hidden]{display:none!important}'
    + '.jn-fig.box{pointer-events:auto;cursor:pointer}'
    + '.jn-floor{position:absolute;left:4%;right:4%;bottom:-2.2%;height:6%;border-radius:50%;background:radial-gradient(closest-side,rgba(10,20,30,.42),rgba(10,20,30,.16) 55%,transparent 100%);transition:box-shadow .4s ease}'
    + '.jn-floor::after{content:"";position:absolute;inset:-30% -8%;border-radius:50%;background:radial-gradient(closest-side,rgba(90,210,255,.28),transparent 70%);opacity:.0;transition:opacity .4s ease}'
    + '.jn-fig.talk .jn-floor::after,.jn-fig.hot .jn-floor::after{opacity:1}'
    + '.jn-mood,.jn-bob,.jn-sway,.jn-breath,.jn-flip{position:absolute;inset:0;transform-origin:50% 100%}'
    + '.jn-mood{transition:transform .7s cubic-bezier(.3,.7,.3,1),opacity .5s ease}.jn-floor{transition:opacity .5s ease}'
    /* standing over page text with her bubble closed: she fades to a hologram ghost until the mouse reaches her */
    + '.jn-fig.ghost:not(.hot):not(.jn-open):not(.talk) .jn-mood{opacity:.32}.jn-fig.ghost:not(.hot):not(.jn-open):not(.talk) .jn-floor{opacity:.3}'
    + '.jn-sway{animation:jnSway 9s ease-in-out infinite}.jn-breath{animation:jnBreath var(--bd) ease-in-out infinite}.jn-flip.on{transform:scaleX(-1)}'
    + '.jn-fig.talk .jn-bob{animation:jnBob .36s ease-in-out infinite alternate}'
    + '@keyframes jnSway{0%,100%{transform:rotate(-.35deg)}50%{transform:rotate(.35deg)}}@keyframes jnBreath{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.006)}}@keyframes jnBob{from{transform:translateY(0)}to{transform:translateY(-1px)}}'
    + '.jn-fig.m-excited{--bd:2.6s}.jn-fig.m-calm{--bd:4.6s}.jn-fig.m-empathetic{--bd:5.4s}'
    + '.jn-fig.m-thinking .jn-mood{transform:rotate(-1.1deg)}.jn-fig.m-empathetic .jn-mood{transform:rotate(.6deg) translateY(1px)}'
    + '.jn-fig.m-excited .jn-mood{animation:jnHop .5s ease 2}.jn-fig.m-proud .jn-mood{animation:jnProud 1.1s ease 2}'
    + '@keyframes jnHop{0%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}@keyframes jnProud{0%,100%{transform:scale(1)}50%{transform:scale(1.012)}}'
    + '.jn-fig.m-proud .jn-floor::after{opacity:1;animation:jnGlow 1.1s ease 2}@keyframes jnGlow{50%{opacity:.25}}'
    + '.jn-photo,.jn-ov{position:absolute;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}.jn-photo{left:0;top:0;width:100%;height:100%;transition:filter .3s ease}'
    + '.jn-ov{opacity:0}.jn-ov.on{opacity:1}'
    + '.jn-fig.hot .jn-photo{filter:drop-shadow(0 0 10px rgba(90,210,255,.75)) drop-shadow(0 0 2px rgba(90,210,255,.9))}.jn-fig.talk .jn-photo{filter:drop-shadow(0 0 7px rgba(90,210,255,.45))}'
    + '.jn-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:radial-gradient(#fff,#7fe3ff 45%,rgba(90,210,255,0) 72%);box-shadow:0 0 12px 3px rgba(90,210,255,.75);opacity:0;transition:opacity .3s ease;pointer-events:none}'
    + '.jn-open .jn-dot{opacity:1;animation:jnDot 1.6s ease-in-out infinite}@keyframes jnDot{50%{transform:scale(1.35)}}'
    + '.jn-x{position:absolute;top:1%;right:4%;width:26px;height:26px;border-radius:50%;border:1px solid rgba(120,220,255,.6);background:rgba(4,18,26,.82);color:#bff3ff;font:800 16px/1 Cairo,Tahoma,sans-serif;cursor:pointer;pointer-events:auto;opacity:.55;transition:opacity .2s ease;padding:0}'
    + '.jn-x:hover,.jn-x:focus-visible,.jn-fig.hot .jn-x{opacity:1}'
    + '.jn-tag{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);white-space:nowrap;pointer-events:auto;cursor:pointer;border:1px solid rgba(120,220,255,.55);background:rgba(4,18,26,.84);color:#dff7ff;border-radius:999px;padding:3px 11px;font:800 .74rem/1.6 Cairo,Tahoma,sans-serif;box-shadow:0 0 14px -4px rgba(90,210,255,.8);animation:jnTag 3s ease-in-out infinite}'
    + '.jn-open .jn-tag{display:none}@keyframes jnTag{50%{box-shadow:0 0 20px -2px rgba(90,210,255,.95)}}'
    + 'html.jn-hot,html.jn-hot *{cursor:pointer!important}'
    + '.jn-fig .jn-svg{position:absolute;inset:0;border-radius:22px;background:radial-gradient(120% 80% at 50% 100%,#06202b 0%,#020608 60%,#000 100%);border:1px solid rgba(120,220,255,.35);box-shadow:0 18px 40px -12px rgba(0,0,0,.7),0 0 26px -6px rgba(90,210,255,.55);overflow:hidden}.jn-fig .jn-svg svg{width:100%;height:100%;display:block}'
    + '.jn-svg.blink #jn-eyes{transform:scaleY(.12)}.jn-svg #jn-eyes{transform-box:fill-box;transform-origin:center}'
    + '.jn-fig .jn-pic{position:absolute;inset:0;border-radius:50%;object-fit:cover;width:100%;height:100%;border:3px solid rgba(120,220,255,.7);box-shadow:0 0 22px -4px rgba(90,210,255,.8)}'
    + '.jn-beam{position:fixed;z-index:66;height:2px;transform-origin:0 50%;pointer-events:none;background:linear-gradient(90deg,rgba(127,227,255,.95),rgba(127,227,255,.15));box-shadow:0 0 8px rgba(90,210,255,.8);border-radius:2px}'
    + '.jn-bub{position:fixed;z-index:66;width:360px;max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#0f172a;border:1px solid #d7e3ee;border-radius:18px;box-shadow:0 26px 60px -20px rgba(0,0,0,.45),0 0 0 4px rgba(90,210,255,.14),0 0 30px -8px rgba(90,210,255,.55);font-family:Cairo,Tajawal,Tahoma,sans-serif;animation:jnIn .3s ease both}'
    + '@keyframes jnIn{from{opacity:0;transform:translateX(12px) scale(.98)}to{opacity:1;transform:none}}'
    + '.jn-pin{position:absolute;right:-5px;width:9px;height:9px;border-radius:50%;background:#7fe3ff;box-shadow:0 0 10px 2px rgba(90,210,255,.85)}'
    + '.jn-hd{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #eef2f6}.jn-hd b{font-size:.92rem}.jn-hd small{color:#64748b;font-size:.72rem;display:block}.jn-hd .jn-sp{flex:1}'
    + '.jn-emo{font-size:1.25rem;line-height:1;display:inline-block}.jn-emo.pop{animation:jnPop .45s cubic-bezier(.3,1.6,.6,1)}@keyframes jnPop{from{transform:scale(.3)}to{transform:scale(1)}}'
    + '.jn-hd button{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:3px 8px;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer;color:#0f172a}.jn-hd button.on{background:#0f172a;color:#fff;border-color:#0f172a}'
    + '.jn-body{padding:12px 14px;overflow:auto;font-size:.92rem;line-height:1.85;white-space:pre-line;flex:1 1 auto;min-height:0}.jn-acts,.jn-in,.jn-hd,.jn-qr{flex:0 0 auto}'
    + '.jn-body.more{-webkit-mask-image:linear-gradient(#000 calc(100% - 30px),rgba(0,0,0,.15));mask-image:linear-gradient(#000 calc(100% - 30px),rgba(0,0,0,.15))}'
    + '.jn-bub.teaser .jn-acts,.jn-bub.teaser .jn-in{display:none}.jn-bub.teaser .jn-body{cursor:pointer}'
    + '.jn-bub.peek .jn-body{max-height:5.8em}'
    + '.jn-bub.top .jn-pin{display:none}.jn-body .q{color:#64748b;font-size:.8rem;margin-bottom:4px}'
    + '.jn-typing{color:#0e7490;font-weight:700}.jn-typing i{display:inline-block;font-style:normal;animation:jnDots 1s infinite}.jn-typing i:nth-child(2){animation-delay:.15s}.jn-typing i:nth-child(3){animation-delay:.3s}@keyframes jnDots{0%,60%,100%{opacity:.2}30%{opacity:1}}'
    + '.jn-acts{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}.jn-acts a,.jn-acts button{border:1px solid #f1c6cd;background:#fdf2f4;color:#8e0b20;border-radius:999px;padding:5px 11px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer;text-decoration:none}'
    + '.jn-acts .pri{background:#c8102e;color:#fff;border-color:#c8102e}.jn-acts .ok{background:#0e7a43;color:#fff;border-color:#0e7a43}'
    + '.jn-qr{display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 14px 10px;font-size:.76rem;color:#475569}.jn-qr canvas,.jn-qr img{border:6px solid #fff;box-shadow:0 0 0 1px #e2e8f0;border-radius:6px}'
    + '.jn-in{display:flex;gap:6px;padding:10px;border-top:1px solid #eef2f6}.jn-in input{flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:11px;padding:8px 10px;font:inherit;font-size:.88rem}'
    + '.jn-in input.need{border-color:#22b8e0;box-shadow:0 0 0 3px rgba(34,184,224,.18)}'
    + '.jn-in button{border:0;border-radius:11px;padding:0 12px;font:inherit;font-weight:800;cursor:pointer;background:#0f172a;color:#fff}.jn-in .mic{background:#c8102e}.jn-in .mic.rec{animation:jnPulse 1s ease infinite}'
    + '.jn-in .att{background:#eef2f6;color:#0f172a}.jn-in .att[hidden]{display:none}.jn-body .jn-cmth{display:block;max-width:132px;max-height:132px;margin:8px 0 0;border-radius:10px;object-fit:cover;border:1px solid #e2e8f0}'
    + '@keyframes jnPulse{0%,100%{box-shadow:0 0 0 0 rgba(200,16,46,.5)}50%{box-shadow:0 0 0 8px rgba(200,16,46,0)}}'
    + '.jn-mini{position:fixed;z-index:65;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:64px;height:64px;border-radius:50%;background:#000;border:2px solid rgba(120,220,255,.7);box-shadow:0 0 22px -4px rgba(90,210,255,.85);overflow:hidden;cursor:pointer;padding:0}'
    + '.jn-mini img{width:100%;height:100%;object-fit:cover;display:block}.jn-mini svg{width:200%;height:200%;margin:-6% 0 0 -50%;display:block}'
    + '.jn-filled{outline:3px solid rgba(34,184,224,.9)!important;outline-offset:1px;box-shadow:0 0 0 6px rgba(34,184,224,.2),0 0 18px rgba(34,184,224,.45)!important;transition:outline-color .4s ease,box-shadow .4s ease}'
    + '.sanad-btn,.sanad-tip{display:none!important}'
    + '.jn-bub.sheet{left:8px!important;right:8px!important;width:auto!important;top:auto!important;bottom:calc(var(--fh,30vh) + 6px)!important;max-height:min(var(--sh,52vh),460px)}.jn-bub.sheet .jn-pin{display:none}'
    + '@media (max-width:640px){.jn-fig{height:22vh;right:6px}.jn-tag{font-size:.66rem;padding:2px 8px;bottom:4%}.jn-hd small{display:none}.jn-body{font-size:.88rem;padding:10px 12px}'
    + '.jn-acts{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:8px}.jn-acts::-webkit-scrollbar{display:none}.jn-acts>*{flex:0 0 auto;white-space:nowrap}}'
    + '@media (prefers-reduced-motion:reduce){.jn-sway,.jn-breath,.jn-bob,.jn-mood,.jn-tag,.jn-dot,.jn-floor::after{animation:none!important}}'
    /* kiosk (full-screen hologram on a black background) */
    + 'body.jn-kiosk{background:#000;margin:0;overflow:hidden;min-height:100vh}'
    + '.jn-kiosk .jn-fig{height:88vh;bottom:5vh;right:auto;left:58%;transform:translateX(-50%)}.jn-kiosk.jn-portrait .jn-fig{height:56vh;bottom:4vh;left:50%}.jn-kiosk .jn-x,.jn-kiosk .jn-mini,.jn-kiosk .jn-tag{display:none!important}'
    + '.jn-kiosk .jn-photo{filter:drop-shadow(0 0 16px rgba(90,210,255,.35))}'
    + '.jn-kiosk .jn-floor{left:-10%;right:-10%;height:7%;background:radial-gradient(closest-side,rgba(90,210,255,.35),rgba(90,210,255,.1) 60%,transparent 100%)}.jn-kiosk .jn-floor::after{opacity:.6}'
    + '.jn-kiosk .jn-bub{background:rgba(2,22,32,.62);color:#dff7ff;border:1px solid rgba(120,220,255,.55);box-shadow:0 0 50px -8px rgba(90,210,255,.7),inset 0 0 40px -14px rgba(90,210,255,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-size:1.1rem;max-height:76vh}'
    + '.jn-kiosk .jn-bub::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(150,230,255,.05) 0 1px,transparent 1px 3px)}'
    + '.jn-kiosk .jn-hd,.jn-kiosk .jn-in{border-color:rgba(120,220,255,.2)}.jn-kiosk .jn-hd small{color:#e9c46a}.jn-kiosk .jn-hd button{background:transparent;color:#bff3ff;border-color:rgba(120,220,255,.4)}.jn-kiosk .jn-hd button.on{background:rgba(90,210,255,.2)}'
    + '.jn-kiosk .jn-body{font-size:1.18rem}.jn-kiosk .jn-body .q{color:#7fb6c8}.jn-kiosk .jn-in input{background:rgba(255,255,255,.06);color:#fff;border-color:rgba(120,220,255,.35)}'
    + '.jn-kiosk .jn-acts a,.jn-kiosk .jn-acts button{background:rgba(90,210,255,.08);color:#bff3ff;border-color:rgba(120,220,255,.45);font-size:.92rem}.jn-kiosk .jn-acts .pri{background:#c8102e;color:#fff;border-color:#c8102e}.jn-kiosk .jn-qr{color:#bff3ff}'
    + '.jn-tap{position:fixed;inset:auto 0 1.5vh;text-align:center;color:#9adfff;font:800 2.2vh Cairo,Tahoma,sans-serif;text-shadow:0 0 12px rgba(90,210,255,.9);animation:jnPulseT 2s ease infinite;z-index:67}'
    + '@keyframes jnPulseT{0%,100%{opacity:.5}50%{opacity:1}}'
    /* the bubble's "bring her forward" button, item details */
    + '.jn-hd .jn-exp{padding:3px 7px}.jn-dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:8px 0 0;font-size:.82rem;line-height:1.6;white-space:normal}.jn-dl dt{color:#64748b}.jn-dl dd{margin:0;font-weight:700}'
    + '.jn-tstep{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.74rem;color:#0e7490;font-weight:800;white-space:normal}.jn-tstep i{flex:1;height:5px;border-radius:9px;background:#e0f2fe;overflow:hidden;position:relative}.jn-tstep i b{position:absolute;inset:0 auto 0 0;background:#0891b2;border-radius:9px}[dir=rtl] .jn-tstep i b{inset:0 0 0 auto}'
    /* page arrival: she steps forward, larger, then settles back into her corner */
    + 'body:not(.jn-kiosk) .jn-fig{transition:transform .6s cubic-bezier(.2,.8,.25,1)}'
    + '.jn-fig.jn-come{transform-origin:100% 100%;transform:scale(1.3);animation:jnCome .75s cubic-bezier(.2,.8,.25,1) both}'
    + '@keyframes jnCome{from{transform:translateX(70%) scale(1.3);opacity:0}to{transform:scale(1.3);opacity:1}}'
    + '@media (max-width:640px){.jn-fig.jn-come{transform:scale(1.45);animation-name:jnComeP}@keyframes jnComeP{from{transform:translateX(70%) scale(1.45);opacity:0}to{transform:scale(1.45);opacity:1}}}'
    /* guided tour spotlight (the page stays clickable through it) */
    + '.jn-spot{position:fixed;z-index:62;border-radius:14px;pointer-events:none;box-shadow:0 0 0 200vmax rgba(3,10,16,.55),0 0 0 3px rgba(127,227,255,.95),0 0 28px 8px rgba(90,210,255,.55);transition:top .35s ease,left .35s ease,width .35s ease,height .35s ease}'
    + '.jn-spot[hidden]{display:none}'
    /* welcome card (owner 2026-11-18: «she must never cover the page»): no full-screen overlay any more. On the session's first
       page view she waits in a compact card docked at a bottom corner (phones: a small peek above the bottom edge), placed clear
       of the page's controls (fields, buttons, calls to action, the menu) — the page under it stays readable, usable and
       scrollable. A tap expands it into her greeting panel (desktop: a corner panel; phones: a bottom sheet) and she talks. */
    + '.jn-wc{position:fixed;z-index:70;bottom:calc(env(safe-area-inset-bottom,0px) + var(--wb,16px));right:16px;width:380px;max-width:calc(100vw - 20px);box-sizing:border-box;background:#fff;color:#0f172a;border:1px solid #d7e3ee;border-radius:18px;box-shadow:0 22px 50px -20px rgba(0,0,0,.45),0 0 0 4px rgba(90,210,255,.13),0 0 28px -8px rgba(90,210,255,.5);font-family:Cairo,Tajawal,Tahoma,sans-serif;line-height:1.5;text-align:start;overscroll-behavior:contain;visibility:hidden}'
    + '.jn-wc:not(.big){display:flex;align-items:center}'
    + '.jn-wc.in{visibility:visible;animation:jnWcIn .5s cubic-bezier(.2,.8,.25,1) both}.jn-wc.out{pointer-events:none}'
    + '@keyframes jnWcIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}'
    + '.jn-wc-hd{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-radius:18px}'
    + '.jn-wc-hd:focus-visible{outline:3px solid #22b8e0;outline-offset:-3px}'
    + '.jn-wc-av{position:relative;flex:0 0 auto;width:48px;height:48px}'
    + '.jn-wc-av img{display:block;width:100%;height:100%;border-radius:50%;object-fit:cover;background:#04121a;border:2px solid rgba(120,220,255,.8);box-shadow:0 0 16px -4px rgba(90,210,255,.85);box-sizing:border-box}'
    + '.jn-wc-av i{position:absolute;bottom:2px;inset-inline-end:2px;width:11px;height:11px;border-radius:50%;background:#16a34a;border:2px solid #fff;animation:jnLive 1.6s ease infinite}'
    + '.jn-wc-tx{min-width:0;flex:1 1 auto;display:flex;flex-direction:column}'
    + '.jn-wc-sm b{font-size:.95rem;line-height:1.45;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jn-wc-sm small{font-size:.74rem;font-weight:700;color:#0e7490;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jn-wc-sm small.p{display:none}'
    /* «🔊 hear me» beside her hello (desktop); on phones the whole peek is the button */
    + '.jn-wc-hr{flex:0 0 auto;margin-inline-end:48px;min-height:38px;border:0;border-radius:12px;padding:6px 12px;background:linear-gradient(135deg,#0e7490,#0891b2);color:#fff;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 8px 18px -10px rgba(8,145,178,.9)}'
    + '.jn-wc .jn-st-x{position:absolute;top:8px;inset-inline-end:8px;z-index:2;width:32px;height:32px;padding:0;border-radius:50%;border:1px solid #e2e8f0;background:#fff;color:#0f172a;cursor:pointer;font:700 14px/1 Cairo,Tahoma,sans-serif}'
    + '.jn-wc:not(.big) .jn-st-x{top:50%;margin-top:-16px}'
    + '.jn-wc .jn-st-fig,.jn-wc-lg,.jn-wc-body{display:none}'
    /* expanded: her figure (the same lips and eyes as in her corner) heads the panel; the panel scrolls inside the screen */
    + '.jn-wc.big{width:420px;max-height:var(--wmh,calc(100vh - 140px));overflow-y:auto;overflow-x:hidden}'
    + '.jn-wc.big .jn-wc-hd{cursor:default;align-items:center;padding:14px 16px 8px;padding-inline-end:48px;border-radius:18px 18px 0 0}'
    + '.jn-wc.big .jn-wc-av,.jn-wc.big .jn-wc-sm,.jn-wc.big .jn-wc-hr{display:none}'
    + '.jn-wc.big .jn-st-fig{display:block;position:relative;flex:0 0 auto;width:112px;aspect-ratio:var(--ar,1.1);border-radius:16px;overflow:hidden;background:radial-gradient(120% 95% at 50% 100%,#0b3a4f 0%,#04121a 72%);box-shadow:0 0 0 3px rgba(90,210,255,.18),0 10px 24px -12px rgba(0,0,0,.6)}'
    + '.jn-wc.big .jn-wc-lg{display:flex;flex-direction:column;gap:2px}.jn-wc.big .jn-wc-body{display:block;padding:0 16px}'
    + '.jn-wc .jn-rep{position:relative;height:100%;margin:0 auto}.jn-rep .jn-floor::after{opacity:.75}.jn-rep.talk .jn-bob{animation:jnBob .36s ease-in-out infinite alternate}'
    + '.jn-rep .jn-photo{filter:drop-shadow(0 0 18px rgba(90,210,255,.35))}.jn-rep.pic .jn-photo{border-radius:50%;object-fit:cover;border:4px solid rgba(120,220,255,.7)}'
    + '.jn-st-tag{display:inline-flex;align-items:center;align-self:flex-start;gap:7px;font-size:.72rem;font-weight:800;color:#0e7490;background:#ecfeff;border:1px solid #a5f3fc;border-radius:999px;padding:1px 10px;line-height:1.6}'
    + '.jn-st-tag i{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#16a34a;animation:jnLive 1.6s ease infinite}@keyframes jnLive{0%{box-shadow:0 0 0 0 rgba(22,163,74,.6)}70%{box-shadow:0 0 0 7px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}'
    + '.jn-wc h2{margin:4px 0 0;font-size:1.2rem;line-height:1.4;color:#0f172a}.jn-st-me{margin:0;font-weight:800;color:#334155;font-size:.86rem;line-height:1.6}.jn-st-val{margin:4px 0 10px;color:#475569;font-size:.88rem;line-height:1.75}'
    + '.jn-st-hear{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:2px 10px;width:100%;border:0;border-radius:14px;padding:10px 14px;background:linear-gradient(135deg,#0e7490,#0891b2);color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 10px 24px -10px rgba(8,145,178,.85);animation:jnHear 2.2s ease-in-out infinite}'
    + '.jn-st-hear small{font-weight:600;opacity:.9;font-size:.76rem}.jn-st-hear.on{animation:none;background:#e0f2fe;color:#0e7490;box-shadow:none;font-size:.88rem;padding:7px 12px}@keyframes jnHear{50%{box-shadow:0 10px 30px -6px rgba(8,145,178,.95)}}'
    + '.jn-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}'
    + '.jn-st-card{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-width:0;text-align:start;border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:9px 12px;font:inherit;cursor:pointer;color:#0f172a;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;min-height:62px}'
    + '.jn-st-card b{font-size:.9rem;line-height:1.4}.jn-st-card small{color:#64748b;font-size:.72rem;line-height:1.45}'
    + '.jn-st-card:hover,.jn-st-card:focus-visible{transform:translateY(-2px);border-color:#22b8e0;box-shadow:0 12px 26px -14px rgba(14,116,144,.75);outline:none}'
    + '.jn-st-card.live{background:#04121a;border-color:#04121a;color:#dff7ff}.jn-st-card.live small{color:#9adfff}.jn-st-card.pri{background:#c8102e;border-color:#c8102e;color:#fff}.jn-st-card.pri small{color:#ffe4e8}.jn-st-card.wide{grid-column:1/-1}'
    + '.jn-st-in{display:flex;gap:6px}.jn-st-in input{flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:12px;padding:9px 11px;font:inherit;font-size:.9rem}.jn-st-in button{border:0;border-radius:12px;padding:0 14px;background:#0f172a;color:#fff;font:inherit;font-weight:800;cursor:pointer}'
    /* «browse on my own» stays pinned at the bottom of the panel while it scrolls */
    + '.jn-st-alone{position:sticky;bottom:0;display:block;width:calc(100% + 32px);margin:8px -16px 0;padding:9px 16px 11px;border:0;border-top:1px solid #eef2f6;background:#fff;color:#475569;font:inherit;font-weight:800;text-decoration:underline;text-underline-offset:4px;cursor:pointer;border-radius:0 0 18px 18px}'
    + '.jn-wc :focus-visible{outline:3px solid #22b8e0;outline-offset:2px}'
    /* the open site menu (phones) is never covered: the card steps out of sight while it is open */
    + 'html.nav-open .jn-wc{visibility:hidden!important;pointer-events:none!important}'
    /* her panel already shows what she says: the captions bar and its CC toggle step aside while it is expanded */
    + 'html.jn-staged .mig-cc,html.jn-staged .mig-ccbtn{opacity:0!important;visibility:hidden!important;pointer-events:none!important}'
    /* no free corner for the card: her round headshot waves once in its place */
    + '.jn-mini.jn-hi{animation:jnHiP 1.4s ease 3}@keyframes jnHiP{0%,100%{box-shadow:0 0 22px -4px rgba(90,210,255,.85)}50%{box-shadow:0 0 0 7px rgba(90,210,255,.35),0 0 30px 2px rgba(90,210,255,.9)}}'
    /* phones: a two-line peek (headshot, hello, «tap and I'll talk»); expanded, a bottom sheet */
    + '@media (max-width:640px){.jn-wc{border-radius:16px}.jn-wc:not(.big) .jn-wc-hd{padding:8px 10px;padding-inline-end:44px;gap:9px;border-radius:16px}'
    + '.jn-wc:not(.big) .jn-wc-av{width:44px;height:44px}.jn-wc-hr{display:none}.jn-wc-sm b{font-size:.92rem;line-height:1.4}.jn-wc-sm small.d{display:none}.jn-wc-sm small.p{display:block}'
    + '.jn-wc:not(.big) .jn-st-x{margin-top:-15px;width:30px;height:30px}'
    + '.jn-wc.big{left:8px!important;right:8px!important;width:auto!important;max-width:none;bottom:calc(env(safe-area-inset-bottom,0px) + 8px)!important;max-height:calc(100vh - 64px);max-height:calc(100dvh - 64px);border-radius:20px}'
    + '.jn-wc.big .jn-wc-hd{padding:10px 12px 6px;padding-inline-end:44px;gap:10px}.jn-wc.big .jn-st-fig{width:84px}.jn-wc.big .jn-wc-body{padding:0 12px}'
    + '.jn-wc h2{font-size:1.02rem;margin:2px 0 0}.jn-st-me{font-size:.8rem;line-height:1.5}.jn-st-val{font-size:.8rem;line-height:1.6;margin:2px 0 8px}.jn-st-tag{font-size:.66rem;padding:1px 8px}'
    + '.jn-st-grid{gap:7px;margin:8px 0}.jn-st-card{min-height:50px;padding:7px 10px;border-radius:12px}.jn-st-card b{font-size:.84rem;line-height:1.35}.jn-st-card small{font-size:.68rem;line-height:1.35}'
    + '.jn-st-hear{font-size:.9rem;padding:8px 12px}.jn-st-hear small{font-size:.68rem}.jn-st-in input{padding:8px 10px}'
    + '.jn-st-alone{width:calc(100% + 24px);margin:6px -12px 0;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 9px);border-radius:0 0 20px 20px}}'
    + '@media (prefers-reduced-motion:reduce){.jn-wc,.jn-wc.in,.jn-wc-av i,.jn-st-hear,.jn-fig.jn-come,.jn-st-tag i,.jn-mini.jn-hi{animation:none!important}.jn-spot,body:not(.jn-kiosk) .jn-fig{transition:none!important}}'
    + 'html.bs-on .jn-stage,html.bs-on .jn-spot{display:none!important}'
    /* no side icon: live video is offered by Janna herself (stage card, chips), so Janna Live's floating button stays hidden */
    + 'html.jn-here .jnl-btn{display:none!important}'
    + '.jn-bub.qd{right:14px!important;left:auto!important;top:auto!important;bottom:calc(env(safe-area-inset-bottom,0px) + 128px)!important;width:min(380px,calc(100vw - 28px))!important;max-height:min(62vh,520px)}.jn-bub.qd.qdl{left:14px!important;right:auto!important}.jn-bub.qd .jn-pin{display:none}'
    /* her bubble already shows what she says: the captions bar and site toasts keep out of its way while it is open */
    + 'html.jn-bubon .mig-cc{opacity:0!important;visibility:hidden}html.jn-bubon #toast{bottom:auto!important;top:calc(env(safe-area-inset-top,0px) + 74px)!important}'
    /* arrival / dock hello: the whole intro is readable (no input row until the visitor engages) */
    + '.jn-bub.peek.arr .jn-in{display:none}.jn-bub.peek.arr .jn-body{max-height:none}'
    /* tour on phones (and wherever the spotlight needs the space): the sheet moves to the free side of the spotlight */
    + '.jn-bub.sheet.at{top:var(--st)!important;bottom:auto!important}'
    + '.jn-bub.sheet.low{bottom:calc(env(safe-area-inset-bottom,0px) + 8px)!important}'
    /* phones: a fleeting hello whose sheet would cover the page's fields or buttons (hero calls to action, chips) shrinks to a
       two-line peek in her headshot's row (a tap opens the whole bubble) */
    + '.jn-bub.sheet.cpk{left:var(--pl,8px)!important;right:var(--pr,86px)!important;bottom:var(--pb,14px)!important;max-height:64px;border-radius:16px;cursor:pointer}'
    + '.jn-bub.cpk .jn-hd,.jn-bub.cpk .jn-acts,.jn-bub.cpk .jn-in,.jn-bub.cpk .jn-qr,.jn-bub.cpk .jn-pin{display:none!important}'
    + '.jn-bub.cpk .jn-body{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:none;padding:8px 12px;font-size:.8rem;line-height:1.55;-webkit-mask-image:none;mask-image:none}'
    /* desktop: a hello said from her round headshot (her standing figure would sit on the page's controls) */
    + '.jn-bub.mp .jn-pin{display:none}'
    + '.jn-fig.ghost:not(.hot):not(.jn-open):not(.talk) .jn-off:not(:focus-visible){opacity:0;pointer-events:none}'
    /* the bust (REAL.kind "bust", the same woman as her live video): a presenter at the bottom edge of the screen */
    + '.jn-fig.jn-bust{bottom:0;height:min(27vh,232px)}'
    /* no pointing hand: no floor ellipse, no beam; the dot stays (invisible) at REAL.anchor, where her bubble attaches */
    + '.jn-bust .jn-floor,.jn-fig.jn-bust~.jn-beam{display:none!important}.jn-bust .jn-dot{visibility:hidden!important;animation:none!important}'
    + '.jn-bust .jn-photo{filter:drop-shadow(0 10px 22px rgba(6,16,26,.26))}'
    + '.jn-fig.jn-bust.talk .jn-photo{filter:drop-shadow(0 10px 22px rgba(6,16,26,.26)) drop-shadow(0 0 6px rgba(90,210,255,.35))}'
    + '.jn-fig.jn-bust.hot .jn-photo{filter:drop-shadow(0 10px 22px rgba(6,16,26,.26)) drop-shadow(0 0 9px rgba(90,210,255,.7))}'
    /* over the page with her bubble closed she steps back a little (shoulders below the screen edge) and turns into a faint
       hologram; she comes up again when the mouse reaches her or she speaks */
    + '.jn-bust .jn-bob{transition:transform .8s cubic-bezier(.3,.7,.3,1)}'
    + '.jn-fig.jn-bust.ghost:not(.hot):not(.jn-open):not(.talk) .jn-bob{transform:translateY(17%)}'
    + '.jn-fig.jn-bust.ghost:not(.hot):not(.jn-open):not(.talk) .jn-mood{opacity:.4}'
    + '.jn-fig.jn-bust.ghost:not(.hot):not(.jn-open):not(.talk) .jn-flip{filter:saturate(.7)}.jn-fig.jn-bust.ghost:not(.hot):not(.jn-open):not(.talk) .jn-photo{filter:drop-shadow(0 0 4px rgba(90,210,255,.75))}'
    + '.jn-bust .jn-sway{animation:jnSwayB 11s ease-in-out infinite}.jn-bust .jn-breath{animation:jnBreathB var(--bd) ease-in-out infinite}'
    + '@keyframes jnSwayB{0%,100%{transform:rotate(-.45deg)}35%{transform:rotate(.15deg) translateX(.2%)}65%{transform:rotate(.5deg)}}'
    + '@keyframes jnBreathB{0%,100%{transform:scale(1,1)}50%{transform:scale(1.003,1.009)}}'
    + '.jn-fig.jn-bust.m-thinking .jn-mood{transform:rotate(-.9deg)}'
    + '.jn-bust .jn-x{top:6%;right:12%;transition:top .8s cubic-bezier(.3,.7,.3,1),opacity .2s ease}.jn-bust .jn-tag{bottom:8%}'
    + '.jn-fig.jn-bust.ghost:not(.hot):not(.jn-open):not(.talk) .jn-x{top:22%}'
    + '@media (max-width:640px){.jn-fig.jn-bust{height:min(22vh,calc(64vw / var(--ar,1.1)))}}'
    + '@media (prefers-reduced-motion:reduce){.jn-bust .jn-bob{transition:none}}'
    /* kiosk: she stands at the bottom edge, never cut by the side of the screen, and leaves the bubble at least ~480px;
       portrait: larger (the shoulders may run off the sides like a TV close-up), the panel above her head */
    + '.jn-kiosk .jn-fig.jn-bust{bottom:0;height:min(86vh,calc(66vw / var(--ar,1.1)),calc((100vw - 500px) / var(--ar,1.1)))}'
    + '.jn-kiosk.jn-portrait .jn-fig.jn-bust{bottom:0;height:min(57vh,calc(112vw / var(--ar,1.1)))}'
    + '.jn-kiosk .jn-bust .jn-photo{filter:drop-shadow(0 0 22px rgba(90,210,255,.28))}'
    + '.jn-rep.jn-bust .jn-photo{filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}';
  var stl = document.createElement("style"); stl.textContent = css; document.head.appendChild(stl);

  /* ---------- her figure ---------- */
  var fig = document.createElement("div"); fig.className = "jn-fig m-happy"; fig.setAttribute("translate", "no"); fig.setAttribute("aria-hidden", "false");
  var mini = document.createElement("button"); mini.type = "button"; mini.className = "jn-mini"; mini.setAttribute("translate", "no"); mini.hidden = true;
  var beam = document.createElement("div"); beam.className = "jn-beam"; beam.hidden = true; beam.setAttribute("aria-hidden", "true");
  /* copies of her figure (the expanded welcome card) blink and move their lips with her: AV.setV / AV.blink update them too */
  var REPS = [];
  var AV = (function () {
    var flipped = false, eyes = null, eyesH = null, blinkT = 0, mouths = [], dot = document.createElement("span"), hitMap = null, root, svgBox = null;
    dot.className = "jn-dot";
    var inner = '<div class="jn-floor"></div><div class="jn-mood"><div class="jn-bob"><div class="jn-sway"><div class="jn-breath"><div class="jn-flip"></div></div></div></div></div>';
    fig.innerHTML = inner + '<button type="button" class="jn-x" aria-label="">–</button><span class="jn-tag" role="button" tabindex="0"></span>';
    root = fig.querySelector(".jn-flip");
    function pct(v, of) { return (v / of * 100).toFixed(3) + "%"; }
    function ov(src, r, cls) { var im = new Image(); im.className = "jn-ov " + cls; im.alt = ""; im.decoding = "async"; im.src = src; im.style.left = pct(r.x, REAL.w); im.style.top = pct(r.y, REAL.h); im.style.width = pct(r.w, REAL.w); im.style.height = pct(r.h, REAL.h); root.appendChild(im); return im; }
    if (REAL) {
      fig.style.aspectRatio = REAL.w + " / " + REAL.h; fig.style.setProperty("--ar", (REAL.w / REAL.h).toFixed(4)); fig.classList.toggle("jn-bust", BUST);
      var body = new Image(); body.className = "jn-photo"; body.alt = L === "ar" ? "جنة" : "Janna"; body.src = REAL.body; body.decoding = "async"; root.appendChild(body);
      if (REAL.eyes && REAL.eyes.closed) eyes = ov(REAL.eyes.closed, REAL.eyes, "jn-eye");
      if (REAL.eyes && REAL.eyes.half) eyesH = ov(REAL.eyes.half, REAL.eyes, "jn-eye");
      ((REAL.mouth && REAL.mouth.frames) || []).forEach(function (f, i) { mouths[i] = f ? ov(f, REAL.mouth, "jn-m" + i) : null; });
      /* the point her bubble attaches to: her pointing fingertip (standing photo) or REAL.anchor (bust: beside her shoulder) */
      var FA = REAL.finger || REAL.anchor, fx = FA ? FA.x : REAL.w * .2, fy = FA ? FA.y : REAL.h * .38;
      /* she should point towards her bubble (to her left on screen): mirror the photo when the pointing hand is on the right */
      flipped = fx > REAL.w * .55; root.classList.toggle("on", flipped);
      dot.style.left = pct(fx, REAL.w); dot.style.top = pct(fy, REAL.h); root.appendChild(dot);
      [REAL.headshot, REAL.eyes && REAL.eyes.closed, REAL.eyes && REAL.eyes.half].concat((REAL.mouth && REAL.mouth.frames) || []).forEach(function (s) { if (s) { var p = new Image(); p.src = s; } });
      /* alpha map of the photo: only her actual pixels are clickable, the page under the transparent parts stays usable */
      var mk = function () { try { var cw = 120, ch = Math.round(cw * REAL.h / REAL.w), c = document.createElement("canvas"); c.width = cw; c.height = ch; var x = c.getContext("2d"); x.drawImage(body, 0, 0, cw, ch); hitMap = { w: cw, h: ch, d: x.getImageData(0, 0, cw, ch).data }; } catch (e) { hitMap = null; fig.classList.add("box"); } };
      if (body.complete && body.naturalWidth) mk(); else { body.addEventListener("load", function () { mk(); layout(); }); body.addEventListener("error", function () { fig.classList.add("box"); }); }
    } else if (SVG) {
      fig.classList.add("box"); fig.style.aspectRatio = "150 / 214"; fig.style.height = "214px";
      svgBox = document.createElement("div"); svgBox.className = "jn-svg"; svgBox.innerHTML = SVG; root.appendChild(svgBox); root.appendChild(dot); dot.style.left = "6%"; dot.style.top = "45%";
    } else {
      fig.classList.add("box"); fig.style.aspectRatio = "1 / 1"; fig.style.height = "96px";
      var pic = new Image(); pic.className = "jn-pic"; pic.alt = ""; pic.src = "img/janna.jpg"; root.appendChild(pic); root.appendChild(dot); dot.style.left = "4%"; dot.style.top = "50%";
    }
    mini.innerHTML = REAL && REAL.headshot ? '<img alt="" src="' + esc(REAL.headshot) + '">' : SVG && !REAL ? SVG : '<img alt="" src="img/janna.jpg">';
    var V = svgBox ? [0, 1, 2, 3].map(function (i) { return svgBox.querySelectorAll("#jn-m" + i); }) : null, cur = -1;
    return {
      real: !!REAL, flipped: flipped,
      setV: function (n) { if (n === cur) return; cur = n; REPS.forEach(function (r) { r.setV(n); }); if (V) { V.forEach(function (els, i) { [].forEach.call(els, function (e) { e.style.display = i === n ? "" : "none"; }); }); return; } mouths.forEach(function (m, i) { if (m) m.classList.toggle("on", i === n); }); },
      /* a blink passes through the half-closed frame (REAL.eyes.half) on the way down and up: 0 open, 1 half, 2 closed */
      blink: function (on) {
        var set = function (st) { if (eyes) eyes.classList.toggle("on", st === 2); if (eyesH) eyesH.classList.toggle("on", st === 1); if (svgBox) svgBox.classList.toggle("blink", st === 2); REPS.forEach(function (r) { r.blink(st); }); };
        clearTimeout(blinkT); if (!eyesH || RM) { set(on ? 2 : 0); return; }
        set(1); blinkT = setTimeout(function () { set(on ? 2 : 0); }, 40);
      },
      finger: function () { var r = dot.getBoundingClientRect(); if (!r.width && !r.height && !r.left) { var f = fig.getBoundingClientRect(); return { x: f.left, y: f.top + f.height * .45 }; } return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
      hit: function (x, y, home) {
        if (fig.hidden) return false;
        var b = (REAL && !home ? fig.querySelector(".jn-photo") : fig).getBoundingClientRect(); if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
        if (!REAL || !hitMap) return true;
        var u = (x - b.left) / b.width; if (flipped) u = 1 - u;
        var px = Math.min(hitMap.w - 1, Math.floor(u * hitMap.w)), py = Math.min(hitMap.h - 1, Math.floor((y - b.top) / b.height * hitMap.h));
        for (var dx = -1; dx <= 1; dx++) { var q = px + dx; if (q < 0 || q >= hitMap.w) continue; if (hitMap.d[(py * hitMap.w + q) * 4 + 3] > 60) return true; }
        return false;
      }
    };
  })();

  /* ---------- the speech bubble ---------- */
  var bub = document.createElement("section"); bub.className = "jn-bub"; bub.hidden = true; bub.setAttribute("translate", "no"); bub.setAttribute("aria-live", "polite");
  bub.innerHTML = '<span class="jn-pin" aria-hidden="true"></span><div class="jn-hd"><span class="jn-emo" aria-hidden="true">😊</span><div><b class="jn-n"></b><small class="jn-r"></small></div><span class="jn-sp"></span><button type="button" class="jn-exp" aria-label="">⤢</button><button type="button" class="jn-snd"></button><button type="button" class="jn-lng"></button><button type="button" class="jn-cl" aria-label="✕">✕</button></div><div class="jn-body"></div><div class="jn-acts"></div><div class="jn-qr" hidden></div><form class="jn-in"><input type="text" autocomplete="off" enterkeyhint="send"><button type="button" class="att" hidden aria-label="📎">📎</button><button type="button" class="mic" aria-label="mic">🎤</button><button type="submit" aria-label="send">➤</button><input type="file" class="jn-file" accept="image/jpeg,image/png,image/webp" hidden tabindex="-1" aria-hidden="true"></form>';
  document.body.appendChild(fig); document.body.appendChild(mini); document.body.appendChild(beam); document.body.appendChild(bub);
  if (KIOSK) document.body.classList.add("jn-kiosk");
  var bodyEl = bub.querySelector(".jn-body"), acts = bub.querySelector(".jn-acts"), qr = bub.querySelector(".jn-qr"), input = bub.querySelector("input"), emo = bub.querySelector(".jn-emo"), pin = bub.querySelector(".jn-pin");
  function chrome() {
    fig.querySelector(".jn-tag").textContent = "💬 " + t("talk"); fig.querySelector(".jn-x").setAttribute("aria-label", t("min")); fig.querySelector(".jn-x").title = t("min");
    mini.setAttribute("aria-label", t("open")); mini.title = t("open");
    bub.dir = L === "ar" ? "rtl" : "ltr"; bub.lang = L;
    bub.querySelector(".jn-n").textContent = t("name"); bub.querySelector(".jn-r").textContent = t("role");
    bub.querySelector(".jn-snd").textContent = (soundOn ? "🔊 " : "🔇 ") + t("snd"); bub.querySelector(".jn-snd").classList.toggle("on", soundOn);
    bub.querySelector(".jn-lng").textContent = L === "ar" ? "EN" : "ع";
    var ex = bub.querySelector(".jn-exp"); ex.title = t("expand"); ex.setAttribute("aria-label", t("expand")); ex.hidden = KIOSK || quietPage();
    input.placeholder = ST.flow && ST.flow.ph ? ST.flow.ph : t("ask"); bub.querySelector(".mic").title = t("mic");
  }
  chrome();
  /* ---------- 📎 «ابعتلي صورة المنتج» (owner 2026-11-20; switch chat_photos): data/chat-media.js (loaded with this file's ?v= or
     window.MIGVER_CM, only while the switch is on) redraws the photo, the platform reads it once with AI and keeps nothing
     (worker/src/chat-media.js, a bubble ticket — no visitor id), and she searches with what it says. Never in the kiosk. ---------- */
  var CMF = bub.querySelector(".jn-file"), CMB = bub.querySelector(".jn-in .att"), CML = 0;
  function cmOn() { var F = window.MIGFLAGS; return !KIOSK && !!(F && F.on && F.on("chat_photos") === true); }
  function cmLoad() { if (window.MIGCHATMEDIA || CML) return; CML = 1; var sc = document.createElement("script"); sc.src = "data/chat-media.js" + (window.MIGVER_CM || (DV ? "?v=" + DV : "")); sc.charset = "utf-8"; sc.async = true; sc.onload = cmBtn; sc.onerror = function () { CML = 0; if (sc.parentNode) sc.parentNode.removeChild(sc); }; document.head.appendChild(sc); }
  function cmBtn() { if (!CMB) return; var on = cmOn(); if (on && !window.MIGCHATMEDIA) cmLoad(); CMB.hidden = !(on && window.MIGCHATMEDIA); CMB.title = t("photoBtn"); CMB.setAttribute("aria-label", t("photoBtn")); }
  /* the notice once per device (a bubble message, not spoken), then the picker — «تمام، اختار صورة» is a tap, so the picker opens */
  function cmPick() { var M = window.MIGCHATMEDIA; if (!M || !CMF) return; if (!M.okSeen("b")) { show({ segs: [seg(M.tx("noticeB", L === "en"), "calm")], acts: [btn("cmok", M.tx("ok", L === "en"), null, "pri"), btn("cmno", M.tx("cancel", L === "en"))], speak: false }); return; } cmOpen(); }
  function cmOpen() { try { CMF.value = ""; } catch (e) {} try { CMF.click(); } catch (e) {} }
  if (CMF) CMF.addEventListener("change", function () {
    var f = CMF.files && CMF.files[0], M = window.MIGCHATMEDIA; if (!f || !M) return;
    M.photoPrep(f, function (e, p) { try { CMF.value = ""; } catch (x) {} if (e) { if (e !== "none") show({ segs: [seg(M.tx(e, L === "en"), "empathetic")], acts: [chip(["srch", "market"]), chip(["srch", "factories"])] }); return; } cmLook(p); });
  });
  function cmLook(p) {
    var M = window.MIGCHATMEDIA, en = L === "en"; logT("u", "📎");
    show({ segs: [ln("photo.reading")], html: p.url ? '<img class="jn-cmth" src="' + esc(p.url) + '" alt="">' : "", speak: false });
    M.bubbleLook(p, en, function (err, j) {
      if (err) { show({ segs: [seg(err.t, "empathetic")], acts: [chip(["srch", "market"]), chip(["srch", "factories"])] }); return; }
      var s = j.seen, r = j.reason, what = s ? (en ? s.what_en || s.what_ar : s.what_ar || s.what_en) : "";
      if (!s || !what) { show({ segs: [ln(/^(person|id_document|contact_card)$/.test(String(r)) ? "photo.person" : "photo.none")], acts: [chip(["srch", "market"]), chip(["srch", "factories"])] }); return; }
      var ta = s.terms_ar || [], te = s.terms_en || [], term = (en ? te[0] || ta[0] : ta[0] || te[0]) || what, acts = [btn("cmf", t("photoF"), term, "pri"), btn("cmm", t("photoM"), term)];
      if (liveOn()) acts.push(btn("live", t("photoLive"), ""));
      show({ segs: [ln(s.confidence === "low" ? "photo.low" : "photo.got", { what: what })], acts: acts });
    });
  }
  window.addEventListener("mig:flags", function () { try { cmBtn(); } catch (e) {} });
  setTimeout(cmBtn, 0);
  /* html.jn-bubon while her bubble is open (captions bar and toasts step aside, see the styles) */
  (function () { var sync = function () { document.documentElement.classList.toggle("jn-bubon", !bub.hidden); }; try { new MutationObserver(sync).observe(bub, { attributes: true, attributeFilter: ["hidden"] }); } catch (e) {} sync(); })();

  /* layout: her place on the page, and the bubble where her finger points */
  function pageRTL() { try { return getComputedStyle(document.documentElement).direction === "rtl" || document.documentElement.dir === "rtl"; } catch (e) { return document.documentElement.dir !== "ltr"; } }
  function rtlButtons() { var r = 0; if (KIOSK) return 0; [".wa-float", ".totop"].forEach(function (s) { var e = document.querySelector(s); if (!e) return; try { var cs = getComputedStyle(e); if (cs.position === "fixed" && cs.direction === "rtl") r = 70; } catch (x) {} }); return r; }
  function isPhone() { return !KIOSK && window.innerWidth <= 640; }
  /* fixed bars at the bottom of the page (the plan-preview pill) that she must stand on, not cover */
  function barLift(x0, x1) {
    var lift = 0; [".planpv"].forEach(function (sel) { var e = document.querySelector(sel); if (!e) return; var r = e.getBoundingClientRect(); if (!r.width || !r.height) return; if (r.right > x0 && r.left < x1 && r.top > window.innerHeight * .6) lift = Math.max(lift, window.innerHeight - r.top + 6); }); return lift;
  }
  /* miniHi (desktop): a hello is said from her round headshot because her standing figure would sit on the page's controls;
     she stays docked until it ends */
  var miniHi = false;
  function dock(on) { if (KIOSK) return; fig.hidden = !!on; mini.hidden = !on; if (!on) miniHi = false; }
  function layout() {
    if (stageEl) return; /* her welcome card is up: the corner stays empty */
    var vw = window.innerWidth, vh = window.innerHeight, phone = vw <= 640, und = false;
    if (!KIOSK) {
      var r = Math.max(phone ? 4 : 10, rtlButtons()), qd = quietPage(), endL = qd && pageRTL();
      fig.style.right = r + "px"; mini.style.right = endL ? "auto" : (qd ? 14 : r) + "px"; mini.style.left = endL ? "14px" : "";
      /* on phones (and on the members' tools) she waits as the round headshot while her bubble is closed */
      if (qd) dock(true); else if (bub.hidden) { if (phone) dock(true); else if (fig.hidden && ls("janna-min") !== "1" && !miniHi) { fig.classList.add("ghost"); dock(false); und = true; } }
      var fw = fig.hidden ? 0 : fig.getBoundingClientRect().width, lf = barLift(vw - r - Math.max(fw, 64), vw - r);
      fig.style.bottom = lf ? lf + "px" : ""; mini.style.bottom = lf ? lf + "px" : "";
      if (!mini.hidden) miniClear();
    }
    var kp = KIOSK && vw / vh < 1; document.body.classList.toggle("jn-portrait", kp); if (KIOSK) fig.style.left = "";
    var fr = fig.getBoundingClientRect(); bub.style.setProperty("--fh", Math.round(fig.hidden ? (mini.hidden ? 70 : Math.max(70, vh - mini.getBoundingClientRect().top)) : Math.max(0, vh - fr.top)) + "px");
    if (phone) bub.style.setProperty("--sh", (fig.hidden ? 56 : Math.round(Math.max(30, Math.min(56, (fr.top - 70) / vh * 100)))) + "vh");
    /* phones: a bubble opened from her round headshot is a sheet above it; the members' tools (desktop): a corner panel above her
       headshot, on the side away from the page's navigation (left in Arabic, right in English) — never over the sidebar */
    if (!bub.hidden && fig.hidden && phone) { sheet(); return; }
    if (!bub.hidden && !KIOSK && quietPage()) { qpanel(); return; }
    if (!bub.hidden && fig.hidden && miniHi) { mpanel(); return; }
    bub.classList.remove("qd", "qdl", "mp");
    /* back from her headshot: the see-through ghost state is decided at once, so she never flashes solid over the page */
    if (bub.hidden || fig.hidden) { beam.hidden = true; if (und) ghostCheck(); else ghostSoon(); return; }
    fig.classList.remove("ghost");
    var gap = KIOSK ? 34 : 22, F = AV.finger(), maxW = KIOSK ? Math.min(vw * .4, 620) : (bub.classList.contains("peek") ? peekW || 340 : 380), room = F.x - gap - 16, w;
    if (kp) {
      /* portrait hologram screen: she stands smaller at the bottom, the panel spans the width above her */
      bub.classList.remove("sheet"); bub.classList.add("top");
      w = Math.round(Math.min(vw * .92, 900)); bub.style.width = w + "px"; bub.style.right = "auto"; bub.style.bottom = "auto"; bub.style.left = Math.round((vw - w) / 2) + "px";
      var tp = Math.round(vh * .02), mh = Math.max(vh * .3, fr.top + fr.height * .06 - tp - 10); bub.style.maxHeight = Math.round(mh) + "px"; bub.style.top = tp + "px";
      var kb = bub.offsetHeight; if (BUST) { tp = Math.max(tp, Math.round(Math.min(fr.top + fr.height * .02, vh * .62) - 12 - kb)); bub.style.top = tp + "px"; }
      var kx = Math.max(Math.round((vw - w) / 2) + 24, Math.min(Math.round((vw + w) / 2) - 24, F.x)), ky = tp + kb, kdx = kx - F.x, kdy = ky - F.y, kl = Math.sqrt(kdx * kdx + kdy * kdy);
      beam.hidden = kl < 4 || F.y < ky; beam.style.left = F.x + "px"; beam.style.top = F.y + "px"; beam.style.width = kl + "px"; beam.style.transform = "rotate(" + Math.atan2(kdy, kdx) + "rad)";
      return;
    }
    bub.classList.remove("top"); bub.style.maxHeight = "";
    if (KIOSK && room < 480) {
      /* landscape but narrow: move her to the right so the panel keeps a readable width */
      var shift = Math.min(480 - room, vw - fr.right + (BUST ? 0 : fr.width * .08));
      if (shift > 8) { fig.style.left = Math.round(fr.left + fr.width / 2 + shift) + "px"; F = AV.finger(); room = F.x - gap - 16; }
    }
    w = Math.min(maxW, room);
    if (!KIOSK && (phone || w < 270)) { sheet(); return; }
    bub.classList.remove("sheet"); bub.style.width = Math.max(200, w) + "px"; bub.style.left = "auto"; bub.style.bottom = "auto";
    bub.style.right = Math.round(vw - F.x + gap) + "px";
    var bh = bub.offsetHeight, top = Math.max(10, Math.min(vh - bh - 10, F.y - Math.min(56, bh / 2)));
    if (!KIOSK && (bub.classList.contains("peek") || tourAt)) top = Math.max(10, vh - bh - 12 - barLift(vw - F.x - w, vw - F.x));
    /* a hello (page arrival, dock hello) moves up until it is clear of the page's controls (fields, buttons, hero chips) */
    /* (at its whole height while it is a fleeting hello — no room → .nofit and it closes; once engaged it may shrink to fit) */
    if (!KIOSK && !tourAt && !spotEl && bub.classList.contains("peek")) { var sp = freeSpot(F.x - gap - Math.max(200, w), F.x - gap, top + bh, bh, pageCtrls(), clearTop(), fleet() ? bh : 150); if (sp) { top = sp.top; if (sp.h < bh) { bub.style.maxHeight = Math.floor(sp.h) + "px"; bh = sp.h; } } noFit(!sp); }
    /* guided tour: the bubble never sits on the spotlighted element (above or below it, else the spotlight is trimmed) */
    if (!KIOSK && spotEl) top = avoidY(top, bh, F.x - gap - Math.max(200, w), F.x - gap);
    bub.style.top = Math.round(top) + "px"; moreCue();
    var ey = Math.max(top + 16, Math.min(top + bh - 16, F.y)), ex = F.x - gap;
    pin.style.top = Math.round(ey - top - 4) + "px"; pin.style.right = bub.dir === "rtl" ? "-5px" : "-5px";
    var dx = ex - F.x, dy = ey - F.y, len = Math.sqrt(dx * dx + dy * dy);
    beam.hidden = len < 4; beam.style.left = F.x + "px"; beam.style.top = F.y + "px"; beam.style.width = len + "px"; beam.style.transform = "rotate(" + Math.atan2(dy, dx) + "rad)";
  }
  /* the bubble as a sheet across the bottom of the screen (phones, narrow windows); clear of a tour spotlight */
  function qpanel() {
    bub.classList.remove("sheet", "at", "top", "mp"); bub.classList.add("qd"); bub.classList.toggle("qdl", pageRTL());
    bub.style.width = ""; bub.style.right = ""; bub.style.top = ""; bub.style.left = ""; bub.style.bottom = ""; bub.style.maxHeight = ""; beam.hidden = true; moreCue();
  }
  function sheet() {
    bub.classList.remove("qd", "qdl", "mp"); bub.classList.add("sheet"); bub.classList.remove("at", "top"); bub.style.width = ""; bub.style.right = ""; bub.style.top = ""; bub.style.left = ""; bub.style.bottom = ""; bub.style.maxHeight = ""; beam.hidden = true;
    /* a fleeting hello whose sheet turns out to cover a page control after all (taller than planned) becomes the two-line peek,
       which sits in her headshot's row, between the screen edge and the headshot */
    if (fleet() && !bub.classList.contains("cpk") && crosses(bub.getBoundingClientRect(), pageCtrls()) && peekBox()) bub.classList.add("cpk");
    if (bub.classList.contains("cpk")) { var pb = peekBox(); if (pb) { bub.style.setProperty("--pl", Math.round(pb.left) + "px"); bub.style.setProperty("--pr", Math.round(window.innerWidth - pb.right) + "px"); bub.style.setProperty("--pb", Math.round(window.innerHeight - pb.bottom) + "px"); } }
    noFit(fleet() && crosses(bub.getBoundingClientRect(), pageCtrls()));
    if (spotEl) { var sb = bub.getBoundingClientRect(), st0 = avoidY(sb.top, sb.height, sb.left, sb.right); if (Math.abs(st0 - sb.top) > 1) { bub.style.setProperty("--st", Math.round(st0) + "px"); bub.classList.add("at"); } }
    moreCue();
  }
  /* ---------- keeping clear of the page's controls ----------
     the page's primary controls on screen: form fields, buttons, call-to-action links, hero chips and counters. Her fleeting
     hellos (page arrival, dock hello) never cover them, and her round headshot steps aside from them. Floating widgets (WhatsApp,
     back to top, captions, dialogs, Bassem, Janna Live) and the site header are not page controls. */
  var CTRLS = 'input,select,textarea,button,a.btn,[role="button"],.acts a,.hchips a,.kpis a,.lk-acts a';
  var NOTPAGE = '.site-hdr,.util,.wa-float,.totop,.ask-btn,.mig-cc,.mig-ccbtn,#toast,.planpv,.mig-pop,.mig-dlg,.mgq-dlg,.jnl,.jnl-btn,.jnl-note,.bs-fig,.bs-mini,.bs-bub,.bs-wel';
  function pageCtrls() {
    var out = [], vw = window.innerWidth, vh = window.innerHeight;
    [].forEach.call(document.querySelectorAll(CTRLS), function (e) {
      if (e.type === "hidden" || inJanna(e) || (e.closest && e.closest(NOTPAGE))) return;
      var r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
      try { var cs = getComputedStyle(e); if (cs.visibility === "hidden" || +cs.opacity === 0 || cs.position === "fixed") return; } catch (x) {}
      out.push(r);
    });
    return out;
  }
  /* a place for a bubble spanning l..r whose bottom is at most bot0 and whose top stays below minTop, clear of the controls: the
     lowest free gap that holds its height h, else the tallest gap of at least hMin (the bubble shrinks to it) → {top, h} or null */
  function freeSpot(l, r, bot0, h, obs, minTop, hMin) {
    var iv = [], hi = bot0, gaps = [], tall = null;
    obs.forEach(function (o) { if (o.right > l && o.left < r && o.bottom + 8 > minTop && o.top - 8 < bot0) iv.push([o.top - 8, o.bottom + 8]); });
    iv.sort(function (a, b) { return b[1] - a[1]; });
    iv.forEach(function (v) { if (v[1] < hi) gaps.push([Math.max(minTop, v[1]), hi]); hi = Math.min(hi, v[0]); });
    gaps.push([minTop, hi]);
    for (var i = 0; i < gaps.length; i++) {
      var gh = gaps[i][1] - gaps[i][0]; if (gh >= h) return { top: gaps[i][1] - h, h: h };
      if (gh >= (hMin || h) && (!tall || gh > tall.h)) tall = { top: gaps[i][0], h: gh };
    }
    return tall;
  }
  /* the highest a hello may go: below the site header as it is on screen now (the top bar above it scrolls away) */
  function clearTop() { var hd = document.querySelector(".site-hdr"), b = hd ? hd.getBoundingClientRect().bottom : 0; return Math.max(headerBottom(), b > 0 ? b : 0) + 8; }
  /* the top for box b, moved up just far enough to clear every control it touches (gap px above them); null above minTop */
  function liftClear(b, obs, minTop, gap) {
    var h = b.bottom - b.top, top = b.top, g = gap == null ? 8 : gap;
    for (var n = 0; n < 30; n++) {
      var hit = null;
      obs.forEach(function (r) { if (!(r.right <= b.left || r.left >= b.right || r.bottom <= top || r.top >= top + h) && (!hit || r.top < hit.top)) hit = r; });
      if (!hit) return top;
      top = hit.top - g - h; if (top < minTop) return null;
    }
    return null;
  }
  /* phones: the two-line peek's place — her headshot's row, from the screen edge to the headshot, clear of the floating buttons */
  function peekBox() {
    var vw = window.innerWidth, m = mini.getBoundingClientRect(); if (!m.width) return null;
    var onR = m.left + m.width / 2 > vw / 2, b = { top: m.top, bottom: m.bottom, left: onR ? 8 : m.right + 8, right: onR ? m.left - 8 : vw - 8 };
    [".wa-float", ".totop", ".ask-btn", ".mig-ccbtn"].forEach(function (s) {
      var e = document.querySelector(s), r = e && e.getBoundingClientRect(); if (!r || !r.width || r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right) return;
      try { var cs = getComputedStyle(e); if (cs.visibility === "hidden" || +cs.opacity === 0) return; } catch (x) {}
      if (onR) b.left = Math.max(b.left, r.right + 8); else b.right = Math.min(b.right, r.left - 8);
    });
    return b.right - b.left >= 150 ? b : null;
  }
  /* her round headshot steps up out of the way of a control under it (a gate's buttons, a hero chip …), at most to mid-screen */
  function miniClear() {
    var m = mini.getBoundingClientRect(); if (!m.width) return;
    var obs = pageCtrls(); if (!crosses(m, obs)) return;
    var top = liftClear({ left: m.left, right: m.right, top: m.top, bottom: m.bottom }, obs, window.innerHeight * .45, 6);
    if (top != null) mini.style.bottom = Math.round(window.innerHeight - top - m.height) + "px";
  }
  /* her standing figure (solid, as while she talks) sits on one of these controls — her own pixels, not just her box (AV.hit
     falls back to the box until the photo is loaded) */
  function figOn(obs) {
    var b = fig.getBoundingClientRect(); if (!b.width) return false;
    return obs.some(function (r) {
      var x0 = Math.max(r.left, b.left), x1 = Math.min(r.right, b.right), y0 = Math.max(r.top, b.top), y1 = Math.min(r.bottom, b.bottom);
      if (x1 - x0 < 2 || y1 - y0 < 2) return false;
      for (var i = 0; i < 5; i++) for (var j = 0; j < 3; j++) if (AV.hit(x0 + (x1 - x0) * (i + .5) / 5, y0 + (y1 - y0) * (j + .5) / 3, true)) return true;
      return false;
    });
  }
  /* the same while she is still hidden (welcome stage closing): measured in her corner, unseen */
  function figBlocks() {
    var h0 = fig.hidden, v0 = fig.style.visibility; fig.style.visibility = "hidden"; fig.hidden = false;
    var on = false; try { on = figOn(pageCtrls()); } catch (e) {}
    fig.hidden = h0; fig.style.visibility = v0; return on;
  }
  /* the corner rule (desktop): where her standing figure would sit on the page's controls (a form's fields, a search box, buttons)
     she waits as her round headshot instead — it steps aside from them (miniClear) — and stands again after a conversation where
     she fits. Not while she talks, a bubble is open, she was minimised or her welcome card is up. */
  function cornerRule() {
    if (KIOSK || isPhone() || quietPage() || stageEl || !bub.hidden || ls("janna-min") === "1" || busy()) return;
    if (!fig.hidden && figBlocks()) { miniHi = true; dock(true); layout(); }
  }
  /* desktop hello from her headshot: a panel above it on the headshot's side, moved up until it is clear of the page's controls */
  function mpBox(h, w) {
    var vw = window.innerWidth, m = mini.getBoundingClientRect(); w = Math.min(w || 340, vw - 28);
    var left = m.left + m.width / 2 > vw / 2 ? Math.max(14, m.right - w) : Math.min(vw - 14 - w, m.left), top = (m.top || window.innerHeight - 78) - 10 - h;
    return { left: left, right: left + w, top: top, bottom: top + h };
  }
  function mpanel() {
    bub.classList.remove("sheet", "at", "top", "qd", "qdl"); bub.classList.add("mp"); beam.hidden = true;
    var b0 = mpBox(1, peekW || 340); bub.style.width = (b0.right - b0.left) + "px"; bub.style.maxHeight = ""; bub.style.right = "auto"; bub.style.bottom = "auto"; bub.style.left = Math.round(b0.left) + "px";
    var bh = bub.offsetHeight, b = mpBox(bh, peekW || 340), minTop = clearTop(), sp = freeSpot(b.left, b.right, b.bottom, bh, pageCtrls(), minTop, fleet() ? bh : 150);
    if (sp && sp.h < bh) bub.style.maxHeight = Math.floor(sp.h) + "px";
    bub.style.top = Math.round(sp ? sp.top : Math.max(minTop, b.top)) + "px"; noFit(!sp); moreCue();
  }
  /* a fleeting hello (page arrival, dock hello) not yet engaged; .nofit: it found no place clear of the page's controls */
  function fleet() { return bub.classList.contains("arr"); }
  function noFit(f) { bub.classList.toggle("nofit", !!f && fleet()); }
  window.addEventListener("resize", layout); window.addEventListener("orientationchange", function () { setTimeout(layout, 300); });
  /* the bubble grows after it was placed (typed text, chips, web fonts): place it again so it never runs off the screen */
  (function () { if (!window.ResizeObserver) return; var lh = -1, raf = 0; try { new ResizeObserver(function () { var h = bub.offsetHeight; if (bub.hidden || Math.abs(h - lh) < 3) return; lh = h; if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (!bub.hidden) layout(); }); }).observe(bub); } catch (e) {} })();
  /* the spotlight's rectangle on screen (as drawn, before it is trimmed around the bubble) */
  function spotR() {
    if (!spotEl) return null; var r = spotEl.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth, pad = 8;
    var o = { top: Math.max(6, r.top - pad), bottom: Math.min(vh - 6, r.bottom + pad), left: Math.max(6, r.left - pad), right: Math.min(vw - 6, r.right + pad) };
    return o.bottom - o.top < 16 || o.right - o.left < 16 ? null : o;
  }
  /* a top for a bubble of height bh spanning x0..x1 that keeps clear of the spotlight */
  function avoidY(top, bh, x0, x1) {
    var sr = spotR(), vh = window.innerHeight; if (!sr || sr.right <= x0 || sr.left >= x1 || top >= sr.bottom || top + bh <= sr.top) return top;
    if (sr.top - 12 - bh >= 10) return sr.top - 12 - bh;
    if (sr.bottom + 12 + bh <= vh - 10) return sr.bottom + 12;
    return top;
  }
  /* a fade at the bottom of her text while there is more to scroll */
  function moreCue() { var b = bodyEl; b.classList.toggle("more", b.scrollHeight - b.clientHeight - b.scrollTop > 6); }
  bodyEl.addEventListener("scroll", moreCue, { passive: true });
  /* bubble closed and she stands over page text (headline, paragraphs, cards): fade her (see .ghost) */
  var ghostT = 0;
  function ghostSoon() { clearTimeout(ghostT); ghostT = setTimeout(ghostCheck, 260); }
  function ghostCheck() {
    if (KIOSK || fig.hidden || !bub.hidden || !AV.real) { fig.classList.remove("ghost"); return; }
    var b = fig.getBoundingClientRect(), hits = 0, tot = 0;
    for (var gy = .08; gy < 1; gy += .12) for (var gx = .1; gx < 1; gx += .2) {
      var x = b.left + b.width * gx, y = b.top + b.height * gy; if (!AV.hit(x, y, true)) continue; tot++;
      var el = document.elementFromPoint(x, y); if (!el || el === document.body || el === document.documentElement || (el.closest && el.closest(".jn-fig,.jn-mini"))) continue;
      if (el.closest("h1,h2,h3,h4,h5,p,li,td,th,label,input,select,textarea,button,a,img,figure,[class*=card],[class*=stat],[class*=pill]")) hits++;
    }
    fig.classList.toggle("ghost", tot > 0 && hits >= 2);
    xoff();
  }
  /* as the see-through ghost, her minimise button and «talk» tag (the only parts of her that take clicks there) step aside where
     they sit on a page control — measured where the ghost puts them (their move is not animated for the measurement) */
  function xoff() {
    var g = !fig.hidden && fig.classList.contains("ghost"), obs = g ? pageCtrls() : [];
    [fig.querySelector(".jn-x"), fig.querySelector(".jn-tag")].forEach(function (e) {
      if (!e) return; var off = false;
      if (g) { var t0 = e.style.transition; e.style.transition = "none"; off = crosses(e.getBoundingClientRect(), obs); e.style.transition = t0; }
      e.classList.toggle("jn-off", off);
    });
  }
  window.addEventListener("scroll", ghostSoon, { passive: true });
  /* the page's controls move under her round headshot while it scrolls: once it stops, the headshot steps aside again */
  var miniT = 0; window.addEventListener("scroll", function () { if (KIOSK || mini.hidden) return; clearTimeout(miniT); miniT = setTimeout(function () { if (!mini.hidden && !stageEl) layout(); }, 200); }, { passive: true });

  /* ---------- life: blinking, moods ---------- */
  (function blink() {
    setTimeout(function () {
      AV.blink(true);
      setTimeout(function () { AV.blink(false); if (Math.random() < .2) setTimeout(function () { AV.blink(true); setTimeout(function () { AV.blink(false); blink(); }, 110); }, 170); else blink(); }, 120);
    }, rnd(2500, 6000));
  })();
  var moodNow = "happy", moodT = 0;
  function setMood(m) {
    m = MOODS[m] ? m : "happy"; clearTimeout(moodT);
    if (m !== moodNow) { fig.classList.remove("m-" + moodNow); void fig.offsetWidth; fig.classList.add("m-" + m); moodNow = m; }
    else if (m === "excited" || m === "proud") { fig.classList.remove("m-" + m); void fig.offsetWidth; fig.classList.add("m-" + m); }
    emo.textContent = MOODS[m].e; emo.classList.remove("pop"); void emo.offsetWidth; emo.classList.add("pop");
    if (m === "thinking") moodT = setTimeout(function () { if (moodNow === "thinking") setMood("calm"); }, 6000);
  }

  /* ---------- voice + lip sync ---------- */
  var synth = window.speechSynthesis, voices = [];
  function loadV() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
  if (synth) { loadV(); try { synth.addEventListener ? synth.addEventListener("voiceschanged", loadV) : (synth.onvoiceschanged = loadV); } catch (e) {} }
  var FEM = /female|salma|hoda|zariyah|laila|layla|mariam|amira|samantha|zira|aria|jenny|google us english|serena|karen|moira|tessa|victoria|susan|hazel|libby|sonia|natasha|ava|allison|google uk english female|amina|rana|shakira|nour|noura/i;
  function voice(lang) {
    var c = voices.filter(function (v) { return lang === "ar" ? /^ar/i.test(v.lang) : /^en/i.test(v.lang); });
    if (!c.length) return null;
    var eg = c.filter(function (v) { return /ar[-_]EG/i.test(v.lang); }), pool = lang === "ar" && eg.length ? eg : c;
    /* owner 2026-11-18: Janna never speaks with a man's voice — female browser voices only, else no browser voice at all */
    return pool.filter(function (v) { return FEM.test(v.name); })[0] || c.filter(function (v) { return FEM.test(v.name); })[0] || null;
  }
  /* letter → mouth frame: 0 closed (m/b/f, pauses), 1 slightly open (E, most consonants), 2 open (A), 3 rounded (O/U/W) */
  function vis(ch) {
    if (!ch) return 0;
    if (/[اآأإىaáàÁ]/i.test(ch)) return 2;
    if (/[وؤoOuUwWóú]/.test(ch)) return 3;
    if (/[مبفپmMbBpPfFvV]/.test(ch)) return 0;
    if (/[\s.,،؛!?؟…:\-]/.test(ch)) return 0;
    return 1;
  }
  var lip = { T: 0, raf: 0, word: "", wi: 0, bnd: false }, audioEl = null, SAY = { id: 0, done: null }, timers = [];
  function talking(on) { fig.classList.toggle("talk", !!on); REPS.forEach(function (r) { r.el.classList.toggle("talk", !!on); }); }
  function lipsOn() {
    clearInterval(lip.T); talking(true);
    lip.T = setInterval(function () {
      if (lip.word && lip.wi < lip.word.length) AV.setV(vis(lip.word.charAt(lip.wi++)));
      else if (lip.bnd) AV.setV(0);
      else AV.setV([1, 2, 1, 3, 1, 0, 2][Math.floor(Math.random() * 7)]);
    }, 80);
  }
  function lipsOff() { clearInterval(lip.T); cancelAnimationFrame(lip.raf); AV.setV(0); }
  function clean(s) { return String(s || "").replace(/https?:\/\/\S+/g, "").replace(/(?:\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDEFF]|[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D])/g, "").replace(/[•●▪«»"]/g, " ").replace(/\n+/g, ". ").replace(/\s+([.،,!؟?])/g, "$1").replace(/\s+/g, " ").replace(/^[\s.،]+/, "").trim(); }
  function sentences(s) { return s.replace(/([.!؟?…])\s+/g, "$1\u0001").split("\u0001").map(function (x) { return x.trim(); }).filter(Boolean); }
  function later(fn, ms) { var h = setTimeout(fn, ms); timers.push(h); return h; }
  function stop() {
    SAY.id++; SAY.done = null; timers.forEach(clearTimeout); timers = [];
    try { if (synth && (synth.speaking || synth.pending)) synth.cancel(); } catch (e) {}
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
    lipsOff(); talking(false);
  }
  function busy() { return fig.classList.contains("talk"); }
  /* say a list of segments one after another; cb runs when all of them have been spoken */
  function say(segs, cb) {
    stop(); var id = SAY.id; SAY.done = cb || null; var list = (segs || []).filter(function (s) { return s && clean(s.t); }), i = 0;
    (function next() {
      if (id !== SAY.id) return;
      if (i >= list.length) { lipsOff(); talking(false); var d = SAY.done; SAY.done = null; if (d) d(); return; }
      var s = list[i++];
      playSeg(s, id, function () { if (id !== SAY.id) return; AV.setV(0); later(next, i < list.length ? 260 : 0); });
    })();
  }
  function clipFor(s, spoken) {
    var VO = window.JANNA_VOICE; if (!VO) return null;
    if (s.k && VO[s.k] && VO[s.k].src) return VO[s.k];
    var q = VO["qa:" + sha1(spoken)]; return q && q.src ? q : null;
  }
  function playSeg(s, id, done) {
    var spoken = clean(s.t); if (!spoken) return done();
    var clip = soundOn ? clipFor(s, spoken) : null;
    if (clip) return playClip(clip, spoken, s, id, done);
    if (soundOn && synth && typeof SpeechSynthesisUtterance !== "undefined" && !ttsBlocked && (unlocked || ST.audio) && voice(L)) return tts(spoken, s.m, id, done);
    sim(spoken, id, done);
  }
  /* no voice available (sound off, blocked before a tap, or no female voice): the mouth stays closed — never silent "talking"
     (owner 2026-11-18); the bubble shows the words for their reading time, then the flow goes on */
  function sim(text, id, done) {
    lipsOff(); talking(false); AV.setV(0);
    later(function () { if (id !== SAY.id) return; done(); }, Math.min(9000, 900 + text.length * 55));
  }
  function tts(spoken, mood, id, done) {
    var parts = sentences(spoken), j = 0, mo = MOODS[mood] || MOODS.happy;
    (function one() {
      if (id !== SAY.id) return; if (j >= parts.length) return done();
      var idx = j++, txt = parts[idx], u = new SpeechSynthesisUtterance(txt), v = voice(L), fired = false, fin = false;
      u.lang = L === "ar" ? "ar-EG" : "en-US"; if (v) u.voice = v;
      u.rate = Math.max(.7, Math.min(1.3, mo.r * (L === "ar" ? .97 : 1)));
      u.pitch = Math.max(.7, Math.min(1.6, mo.p + (idx % 2 ? -.04 : .03) + rnd(-.02, .02) + (/[؟?]$/.test(txt) ? .06 : 0) - (idx === parts.length - 1 && parts.length > 1 ? .03 : 0)));
      var end = function () { if (fin) return; fin = true; lipsOff(); if (id !== SAY.id) return; later(one, rnd(140, 300)); };
      var toSim = function () { if (fin) return; fin = true; lipsOff(); sim(parts.slice(idx).join(" "), id, done); };
      u.onstart = function () { fired = true; lip.word = ""; lip.bnd = false; lipsOn(); if (!ST.audio) { ST.audio = true; save(); } };
      u.onboundary = function (e) { if (e.name && e.name !== "word") return; lip.bnd = true; var m = /^\S+/.exec(txt.slice(e.charIndex || 0)); lip.word = m ? m[0] : ""; lip.wi = 0; };
      u.onend = end;
      u.onerror = function (e) { var er = e && e.error; if (er === "interrupted" || er === "canceled") { fin = true; return; } if (er === "not-allowed") ttsBlocked = true; toSim(); };
      try { synth.speak(u); } catch (e) { toSim(); return; }
      later(function () {
        if (fired || fin) return;
        if (synth.speaking) { lipsOn(); (function poll() { later(function () { if (fin) return; if (synth.speaking || synth.pending) poll(); else end(); }, 300); })(); }
        else { try { synth.cancel(); } catch (x) {} toSim(); }
      }, 1100);
      later(function () { if (!fin && !synth.speaking) end(); }, 2500 + txt.length * 160);
    })();
  }
  function playClip(clip, spoken, s, id, done) {
    var a = new Audio(clip.src), W = clip.words || [], fin = false; audioEl = a;
    var fallback = function () { if (fin) return; fin = true; audioEl = null; if (synth && !ttsBlocked && (unlocked || ST.audio)) tts(spoken, s.m, id, done); else sim(spoken, id, done); };
    a.onended = function () { if (fin) return; fin = true; lipsOff(); done(); };
    a.onerror = fallback;
    var loop = function () {
      if (fin || id !== SAY.id) return; var tm = a.currentTime * 1000, w = null;
      for (var i = 0; i < W.length; i++) if (tm >= W[i][0] && tm < W[i][1]) { w = W[i]; break; }
      if (w) { var wd = String(w[2] || ""), f = (tm - w[0]) / Math.max(1, w[1] - w[0]); AV.setV(vis(wd.charAt(Math.min(wd.length - 1, Math.floor(f * wd.length))))); } else if (!W.length) AV.setV([1, 2, 1, 3][Math.floor(tm / 90) % 4]); else AV.setV(0);
      lip.raf = requestAnimationFrame(loop);
    };
    var p; try { p = a.play(); } catch (e) { return fallback(); }
    talking(true);
    if (p && p.then) p.then(function () { if (!ST.audio) { ST.audio = true; save(); } loop(); }, function () { if (fin) return; fin = true; audioEl = null; sim(spoken, id, done); });
    else loop();
  }
  /* tiny SHA-1 (UTF-8) for the "qa:<sha1>" clip keys */
  function sha1(str) {
    var s = unescape(encodeURIComponent(str)), n = s.length, w = [], i, j, H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    for (i = 0; i < n; i++) w[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8); w[(((n + 8) >> 6) + 1) * 16 - 1] = n * 8;
    var rol = function (x, c) { return (x << c) | (x >>> (32 - c)); };
    for (i = 0; i < w.length; i += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], X = [];
      for (j = 0; j < 80; j++) {
        X[j] = j < 16 ? (w[i + j] | 0) : rol(X[j - 3] ^ X[j - 8] ^ X[j - 14] ^ X[j - 16], 1);
        var f = j < 20 ? (b & c) | (~b & d) : j < 40 ? b ^ c ^ d : j < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        var k = j < 20 ? 0x5A827999 : j < 40 ? 0x6ED9EBA1 : j < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
        var tmp = (rol(a, 5) + f + e + k + X[j]) | 0; e = d; d = c; c = rol(b, 30); b = a; a = tmp;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
    }
    return H.map(function (h) { return ("00000000" + (h >>> 0).toString(16)).slice(-8); }).join("");
  }

  /* ---------- showing a message ---------- */
  function btn(k, label, v, cls) { return '<button type="button" data-jn="' + k + '"' + (v != null ? ' data-v="' + esc(v) + '"' : "") + (cls ? ' class="' + cls + '"' : "") + ">" + esc(label) + "</button>"; }
  function linkBtn(label, href, pri) {
    if (!/^(https?:|mailto:|tel:)/.test(href)) return btn("nav", label + (L === "ar" ? " ←" : " →"), href, pri ? "pri" : "");
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener"' + (pri ? ' class="pri"' : "") + ">" + esc(label) + (L === "ar" ? " ←" : " →") + "</a>";
  }
  function chip(c) {
    switch (c[0]) {
      case "reg": return btn("reg", t("reg"), null, "pri");
      case "regfill": return btn("regfill", t("regfill"), c[1] || "");
      case "rfq": return btn("rfq", t("rfq"));
      case "msg": return btn("msg", t("msg"));
      case "can": return btn("can", t("can"));
      case "live": return liveOn() ? btn("live", t("video"), "") : btn("msg", t("msg"));
      case "meet": return liveOn() ? btn("live", t("meet"), "meeting") : btn("msg", t("msg"));
      case "tour": return btn("tour", t("tourB"));
      case "srch": return btn("srch", t("srch." + c[1]), c[1]);
      case "nav": return linkBtn(L === "ar" ? c[1] : c[2], c[3]);
    }
    return "";
  }
  function pageActs() {
    var p = P[PAGE] || P[pkey()] || P.home, out = p.map(chip), has = function (k) { return p.some(function (c) { return c[0] === k; }); };
    if (!has("reg")) out.push(chip(["reg"])); if (!has("rfq") && out.length < 4) out.push(chip(["rfq"]));
    return out;
  }
  var lastShown = null, peekIv = 0;
  /* o: {segs, acts, q (the visitor's words), speak, cb, html} */
  function show(o) {
    if (typeof o === "string") o = { segs: [seg(o)] };
    /* o.mini: on phones the bubble comes from her round headshot (no standing figure over the page) */
    stopTyping(); if (fig.hidden && !KIOSK && !(o.mini && (isPhone() || miniHi))) dock(false); bub.hidden = false; fig.classList.add("jn-open"); fig.classList.remove("ghost"); qr.hidden = true; qr.innerHTML = "";
    bub.classList.toggle("teaser", !!o.teaser); bub.classList.toggle("peek", !!o.peek && !KIOSK); bub.classList.toggle("arr", !!o.fleeting && !!o.peek && !KIOSK); bub.classList.toggle("cpk", !!o.cpk && !!o.peek && isPhone()); bub.classList.remove("nofit");
    var segs = (o.segs || []).filter(Boolean), text = segs.map(function (s) { return s.t; }).join("\n");
    bodyEl.innerHTML = (o.q ? '<div class="q">' + esc(o.q) + "</div>" : "") + esc(text) + (o.html || "");
    acts.innerHTML = (o.acts || []).join("");
    bodyEl.scrollTop = 0; lastShown = o;
    var m = o.mood || (segs[segs.length - 1] || {}).m || "happy"; setMood(segs[0] && segs[0].m === "thinking" ? "thinking" : m);
    if (text) logT("j", text);
    /* a fleeting hello (arrival, dock) is not a conversation: the next page does not reopen it */
    if (o.fleeting) { if (ST.open) { ST.open = false; save(); } } else if (!ST.open) { ST.open = true; save(); }
    input.placeholder = ST.flow && ST.flow.ph ? ST.flow.ph : t("ask"); input.classList.toggle("need", !!(ST.flow && ST.flow.ph));
    layout(); setTimeout(layout, 60);
    /* a fleeting hello that found no place clear of the page's controls is not shown at all; while one is up it follows the page
       (a hero whose headline rotates moves its buttons) and closes when it no longer fits */
    clearInterval(peekIv);
    if (o.fleeting && bub.classList.contains("nofit")) { hideBub(); return; }
    if (o.fleeting && o.peek && !KIOSK) peekIv = setInterval(function () { if (bub.hidden || !fleet()) { clearInterval(peekIv); return; } layout(); if (bub.classList.contains("nofit")) { clearInterval(peekIv); settle(); } }, 600);
    if (o.speak !== false) say(segs, function () { if (m !== moodNow && m !== "thinking") setMood(m); if (o.cb) o.cb(); });
    else { stop(); if (o.cb) o.cb(); }
  }
  /* «جنة بتفكر…» for a moment before she answers */
  var typT = 0;
  function stopTyping() { clearTimeout(typT); }
  function reply(fn, ms) {
    stop(); stopTyping(); if (fig.hidden && !KIOSK) dock(false); bub.hidden = false; bub.classList.remove("teaser"); fig.classList.add("jn-open"); setMood("thinking");
    bodyEl.innerHTML = '<span class="jn-typing">' + esc(t("thinking")) + "<i>.</i><i>.</i><i>.</i></span>"; acts.innerHTML = ""; layout();
    typT = setTimeout(fn, ms || rnd(400, 900));
  }
  var peekW = 340; /* width of the arrival / hello bubble (an arrival beside a form may ask for a narrower one) */
  function hideBub() { peekW = 340; clearTimeout(settleT); fig.classList.remove("jn-come"); if (ST.tour != null) ST.tour = null; if (spotEl || spotTok) { spotTok++; tourSpot(null); } stop(); bub.hidden = true; beam.hidden = true; bub.classList.remove("teaser", "peek", "cpk", "mp", "nofit"); fig.classList.remove("jn-open"); ST.open = false; save(); if (!KIOSK && (isPhone() || ls("janna-min") === "1")) dock(true); if (miniHi) { miniHi = false; if (!isPhone() && ls("janna-min") !== "1") { if (figBlocks()) miniHi = true; else { fig.classList.add("ghost"); dock(false); layout(); ghostCheck(); } } } ghostSoon(); }
  /* first visit, before any gesture: a short hello instead of the whole greeting, then she steps back */
  function teaser() {
    var t0 = Date.now(), done = false;
    show({ segs: [ln("teaser")], teaser: true, acts: [], cb: function () { done = true; } });
    var iv = setInterval(function () {
      if (!bub.classList.contains("teaser") || bub.hidden) { clearInterval(iv); return; }
      if (!busy() && Date.now() - t0 > (done ? 6000 : 9000)) { clearInterval(iv); hideBub(); }
    }, 1000);
  }
  function intro(speak, short) {
    var k = pkey(), segs = [], code = PAGE === "region" ? (location.hash || "").slice(1).toUpperCase() : "";
    if (!short && PAGE === "home") segs.push(ln("greet"));
    if (code && GOV.some(function (g) { return g[0] === code; })) segs.push(ln("region.one", { name: govName(code) }));
    else segs.push(ln("intro." + k));
    show({ segs: segs, acts: pageActs(), speak: speak });
  }

  /* ---------- text understanding ---------- */
  function N(s) {
    return String(s || "").toLowerCase().replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x660; }).replace(/[^\u0621-\u064A0-9a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  var PRE = "(?:[وفبلك]?(?:ال|لل)?)";
  function rxAr(alts) { return new RegExp("(?:^|\\s)" + PRE + "(?:" + alts.replace(/ /g, "\\s+") + ")(?=\\s|$)"); }
  function rxEn(alts) { return new RegExp("(?:^|\\s)(?:" + alts + ")(?=\\s|$)"); }
  function has(n, ar, en) { return (ar && rxAr(ar).test(n)) || (en && rxEn(en).test(n)); }
  function base(tok) { var b = tok; if (b.length > 3) b = b.replace(/^و(?=..)/, ""); return b.replace(/^(?:بال|فال|كال|وال|لل|ال|ب|ل|ف|ك)(?=...)/, ""); }
  var QW = "ازاي|ايه|ليه|امتي|امته|هل|كام|بكام|منين|مين|كيف|ماذا|ما هي|ما هو|متي|how|what|why|when|which|is|are|does|do|can i|price|cost";
  var NAVW = "وديني|ودني|خديني|خدني|روحي|روح|اروح|نروح|افتح|افتحي|افتحيلي|افتحلي|وريني|وريني|اعرض|اعرضي|اعرضيلي|انقليني|اشوف|نشوف|فين|ادخل|اخش|go to|goto|open|take me|show me|navigate|where is|where are|bring me|go";
  var SRW = "دوري|دور|دورلي|دوريلي|دورليا|ابحث|ابحثي|ابحثيلي|بحث|هاتي|هاتيلي|هاتلي|طلعيلي|طلعي|شوفيلي|لاقيلي|عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|نفسي|find|search|look for|looking for|need|want|get me|list|search for";
  var STOP = {}; ("على علي عن لي ليا يا جنه من فضلك لو سمحت سمحتي بتاع بتاعه بتوع اللي الي شويه كام اي ايه حاجه حاجات في ف انا انت انتي ممكن تعمليلي عايزين محتاجين بس كده دي ده محافظه محافظة مدينه منطقه اعمل اعملي نعمل ابعت ابعتي ارسل please for me some a an the in at of on with to can you could i im show find search look looking need want get list all any governorate my" + " ازاي ازاى كيف ليه امتي هل منين مين ماذا متي الاقي نلاقي القي يلاقي لاقي فيه يوجد توجد موجود موجوده عندكم عندك هناك فين بيعمل بيعملوا بتعمل بيبيع بيبيعوا ينتج تنتج is are there where who how what which do does make makes sell sells produce produces" + " " + (NAVW + "|" + SRW).replace(/\|/g, " ")).split(/\s+/).forEach(function (w) { if (w) STOP[N(w)] = 1; });
  var govTxt = ""; /* the words that named the place (e.g. «مدينة السادات»), so they are not searched for */
  function findGov(n, orig) {
    govTxt = "";
    for (var i = 0; i < GOV.length; i++) if (has(n, GOV[i][3], GOV[i][4])) return GOV[i][0];
    var m = /(?:^|\s)(?:في|ف|in|at)\s+(.{3,})$/.exec(orig || ""); if (m && window.MIGREG && MIGREG.of) {
      try {
        var ws = m[1].replace(/[؟?!.,،]+/g, " ").trim().split(/\s+/);
        for (var k = 1; k <= ws.length; k++) { var c = MIGREG.of(ws.slice(0, k).join(" ")); if (c && GOV.some(function (g) { return g[0] === c; })) { govTxt = ws.slice(0, k).join(" "); return c; } }
      } catch (e) {}
    }
    return "";
  }
  function govWords(code) { var g = GOV.filter(function (x) { return x[0] === code; })[0], o = {}; if (!g) return o; (g[3] + "|" + g[4] + "|" + N(g[1]) + "|" + N(g[2])).split(/[|\s]/).forEach(function (w) { w = w.replace(/[?()]/g, ""); if (w) { o[w] = 1; o[base(w)] = 1; } }); return o; }
  function findSect(n) { for (var i = 0; i < SECT.length; i++) if (has(n, SECT[i][1], SECT[i][2])) return SECT[i]; return null; }
  function sectBy(page) { for (var i = 0; i < SECT.length; i++) if (SECT[i][0] === page) return SECT[i]; return null; }
  function entWords() { var o = {}; SECT.forEach(function (s) { (s[1] + "|" + s[2]).split(/[|\s]/).forEach(function (w) { w = w.replace(/\(\?:[^)]*\)\??|[?()]/g, ""); if (w) { o[N(w)] = 1; o[base(N(w))] = 1; } }); }); Object.keys(SEARCH).forEach(function (k) { (SEARCH[k].x || "").split("|").forEach(function (w) { if (w) o[w] = 1; }); }); ["factory", "factories", "products", "product", "tender", "tenders", "suppliers", "supplier", "offers", "offer", "projects", "project", "companies", "company", "deals", "rfq", "rfqs", "market", "marketplace", "requests", "request", "manufacturers", "manufacturer"].forEach(function (w) { o[w] = 1; }); return o; }
  var ENTW = null, termAlt = "";
  /* «الحديد» → «حديد» (the directory matches the bare word); a few words where ال is part of the word keep it */
  function noAl(tok) { return /^ال[\u0621-\u064A]{3,}$/.test(tok) && !/^ال(?:ومن|ومون|ماس|مونيوم|ياف|وان|بان|عاب|ات|ه|ي$)/.test(tok) ? tok.slice(2) : tok; }
  function term(orig, gov) {
    ENTW = ENTW || entWords(); var gw = gov ? govWords(gov) : {};
    if (gov && govTxt) govTxt.split(/\s+/).forEach(function (w) { w = N(w); if (w) { gw[w] = 1; gw[base(w)] = 1; } });
    var kept = String(orig || "").replace(/[؟?!.,،«»"']/g, " ").split(/\s+/).filter(function (tok) {
      var n = N(tok); if (!n) return false; var b = base(n);
      return !(STOP[n] || STOP[b] || ENTW[n] || ENTW[b] || gw[n] || gw[b]);
    });
    termAlt = kept.join(" ").trim();
    return kept.map(noAl).join(" ").trim();
  }
  function regW0(n) { return /(^|\s)(سجل|سجلي|سجليني|اسجل|نسجل|تسجيل|التسجيل|اشترك|اشتراك|انضم|register|registration|sign ?up|subscribe|join)(\s|$)/.test(n); }
  function planOf(n) {
    if (has(n, "شريك الاستراتيجي|استراتيجي|استراتيجيه", "strategic")) return "strategic";
    if (has(n, "شريك الاساسي|شريك اساسي|شريك", "core partner|partner")) return "partner";
    if (has(n, "مميزه|بريميوم|بريميم", "premium")) return "premium";
    if (has(n, "اساسيه|بيسك", "basic")) return "basic";
    if (has(n, "بيانات فقط|بيانات بس|تسجيل بيانات|بروفايل", "profile|data registration")) return "profile";
    return "";
  }

  /* ---------- navigation (she takes the visitor) ---------- */
  function abs(href) { try { return new URL(url(href), document.baseURI || location.href).href; } catch (e) { return href; } }
  function pageOf(href) { var p = String(href).split("#")[0].split("?")[0].split("/").pop().replace(/\.html?$/, ""); return p || PAGE; }
  /* label: what the page is called in her lines (an item's name), else the section's name */
  function goTo(href, pend, segs, actsOut, label) {
    var tp = pageOf(href), hash = String(href).split("#")[1];
    if (KIOSK) { /* the hologram has no pages: hand the page over to the visitor's phone */
      var payload = pend ? "#janna=" + b64(JSON.stringify(pend)) : hash ? "#" + hash : "";
      var nm = label || (tp === "region" && hash && GOV.some(function (g) { return g[0] === hash.toUpperCase(); }) ? (L === "ar" ? "محافظة " : "") + govName(hash.toUpperCase()) : nameOf(tp));
      show({ segs: (segs || []).concat([ln(pend && pend.kind === "fill" ? "kiosk.fillqr" : "kiosk.qr", { name: nm })]), acts: [btn("home", t("can"))] });
      showQR(abs(String(href).split("#")[0]) + payload); return;
    }
    var p = pend || { kind: "arrive" }; p.page = tp;
    var same = tp === PAGE;
    ST.open = true;
    var go = function () {
      if (same) {
        ST.pend = null; save();
        if (hash != null && location.hash.slice(1) !== hash) {
          var pb = PAGE === "register" && document.querySelector('[data-plan="' + hash + '"]');
          if (pb) pb.click(); else { location.hash = hash; var el = document.getElementById(hash); if (el) try { el.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); } catch (e) {} }
        }
        runPend(p, true); return;
      }
      ST.pend = p; save(); location.href = url(href);
    };
    if (same && !hash && p.kind === "arrive") { show({ segs: [ln("nav.here"), ln("intro." + pkey())], acts: pageActs() }); return; }
    var fired = false, nav = function () { if (fired) return; fired = true; go(); };
    show({ segs: segs || [ln("nav.go", { name: nameOf(tp) })], acts: actsOut || [], cb: nav });
    var tok = SAY.id;
    setTimeout(function () { if (SAY.id === tok && !busy()) nav(); }, 1200);
    setTimeout(function () { if (SAY.id === tok) nav(); }, 9000);
  }
  /* pages that are not sections (one item each) */
  var PNAME = { company: ["ملف الشركة", "the company profile"], article: ["الخبر", "the news story"], event: ["صفحة المعرض", "the exhibition page"], offer: ["صفحة العرض", "the offer page"], city: ["صفحة المدينة الصناعية", "the industrial city page"], opportunity: ["صفحة الفرص", "the opportunities page"], project: ["صفحة المشروع", "the project page"], entity: ["صفحة الجهة", "the entity page"], winner: ["صفحة الترسية", "the award page"], lead: ["صفحة الطلب", "the request page"], "contractor-leads": ["طلبات المقاولين", "contractor requests"], index: ["الصفحة الرئيسية", "the home page"] };
  function nameOf(page) { var s = sectBy(page) || sectBy(ALIAS[page]); return s ? (L === "ar" ? s[3] : s[4]) : PNAME[page] ? PNAME[page][L === "ar" ? 0 : 1] : (L === "ar" ? "الصفحة" : "the page"); }
  /* a governorate's page, named as the governorate (not «the governorates») */
  function goGov(code) { var nm = (L === "ar" ? "محافظة " : "") + govName(code) + (L === "en" ? " governorate" : ""); goTo("region.html#" + code, null, [ln("nav.go", { name: nm })], null, nm); }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

  /* ---------- search on the directory pages ---------- */
  function fire(el, evs) { evs.forEach(function (ev) { var e; try { e = ev === "keyup" ? new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }) : new Event(ev, { bubbles: true, cancelable: true }); } catch (x) { e = document.createEvent("Event"); e.initEvent(ev, true, true); } el.dispatchEvent(e); }); }
  function setField(el, v) {
    if (!el) return false;
    if (el.tagName === "SELECT") { if (typeof v === "number") el.selectedIndex = v; else el.value = v; }
    else { var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, d = Object.getOwnPropertyDescriptor(proto, "value"); if (d && d.set) d.set.call(el, v); else el.value = v; }
    fire(el, ["input", "change", "keyup"]); return true;
  }
  /* a select option by its text (the site may show it translated); its position only as a fallback */
  function selOpt(sel, opts, i) {
    var o = opts[i]; if (!sel || !o) return false;
    var want = [N(o[0]), N(o[1])], k = -1;
    [].forEach.call(sel.options, function (op, j) { if (k < 0 && op.value !== "" && (want.indexOf(N(op.textContent)) > -1 || want.indexOf(N(op.value)) > -1)) k = j; });
    if (k < 0 && sel.options[i] && sel.options[i].value !== "") k = i;
    if (k < 0) return false;
    sel.selectedIndex = k; fire(sel, ["input", "change"]); return true;
  }
  function glow(el) { if (!el) return; el.classList.add("jn-filled"); setTimeout(function () { el.classList.remove("jn-filled"); }, 6000); }
  function selGov(sel, code) {
    if (!sel || !code) return false;
    var o = [].filter.call(sel.options, function (x) { return x.value === code; })[0];
    if (!o) { var nm = [N(govName(code)), N(GOV.filter(function (g) { return g[0] === code; })[0][1]).replace(/^ال/, "")]; o = [].filter.call(sel.options, function (x) { var tx = N(x.textContent); return x.value && nm.some(function (k) { return k && tx.indexOf(k) > -1; }); })[0]; }
    if (!o) return false; sel.value = o.value; fire(sel, ["input", "change"]); return true;
  }
  var HOLO_SEARCH = { factories: 1, market: 1, tenders: 1, rfqs: 1, suppliers: 1, offers: 1, projects: 1 };
  function doSearch(p, here) {
    var c = SEARCH[p.ent] || SEARCH[PAGE]; if (!c) return;
    var hs = SEARCH[p.ent] ? p.ent : PAGE; if (HOLO_SEARCH[hs] && hs === PAGE && !p.re) holo("janna_search", { section: hs, query: p.term || "", governorate: p.gov || "" });
    var what = L === "ar" ? c.ar : c.en, q = $(c.q), okGov = false;
    if (p.gov) { if (c.gov) okGov = selGov($(c.gov), p.gov); else if (c.rg) { var b = $(c.rg + ' [data-rg="' + p.gov + '"]'); if (b) { b.click(); okGov = true; } } }
    if (q) { setField(q, p.term || ""); if (c.form) { var f = $(c.form); if (f) { try { f.requestSubmit ? f.requestSubmit() : fire(f, ["submit"]); } catch (e) { fire(f, ["submit"]); } } } glow(q); try { q.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "center" }); } catch (e) { q.scrollIntoView(); } }
    setTimeout(function () {
      var segs = here ? [] : [ln("arrive")], cnt = c.cnt && $(c.cnt), n = null;
      if (cnt) { var m = /[\d][\d,٬]*/.exec(cnt.textContent || ""); if (m) n = +m[0].replace(/[,٬]/g, ""); }
      if (n === 0 && p.alt && !p.re) { var p2 = JSON.parse(JSON.stringify(p)); p2.term = p.alt; p2.re = 1; return doSearch(p2, here); }
      if (n === 0) segs.push(ln("search.res0")); else if (n != null) segs.push(ln(n === 1 ? "search.res1" : n === 2 ? "search.res2" : n <= 10 && L === "ar" ? "search.resF" : "search.res", { n: money(n), what: what })); else segs.push(ln("search.done"));
      if (p.gov && !okGov) segs.push(seg(L === "ar" ? "الصفحة دي مفيهاش فلتر بالمحافظة، فدوّرت بالكلمة بس." : "This page has no governorate filter, so I searched by the word only.", "calm"));
      if (c.res && n == null) { var r = $(c.res); if (r) try { r.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); } catch (e) {} }
      show({ segs: segs, peek: true, acts: [btn("srch", t("srch." + (SEARCH[p.ent] ? p.ent : PAGE)), SEARCH[p.ent] ? p.ent : PAGE), chip(["rfq"]), chip(["reg"])] });
    }, 450);
  }
  function startSearch(ent, tm, gov) {
    var c = SEARCH[ent], what = L === "ar" ? c.ar : c.en;
    var about = (tm ? (L === "ar" ? " على «" + tm + "»" : " for “" + tm + "”") : "") + (gov ? (L === "ar" ? " في " + govName(gov) : " in " + govName(gov)) : "");
    var pend = { kind: "search", ent: ent, term: tm, gov: gov }; if (termAlt && termAlt !== tm) pend.alt = termAlt;
    if (KIOSK) { goTo(ent + ".html", pend, [ln("search.go", { what: what, about: about })]); return; }
    if (ent === PAGE) { show({ segs: [ln("search.go", { what: what, about: about })] }); setTimeout(function () { doSearch(pend, true); }, 350); return; }
    goTo(ent + ".html", pend, [ln("search.go", { what: what, about: about })]);
  }

  /* ---------- forms by conversation ---------- */
  /* the sector list of contact.html #r-s (chosen by its text, not by position) */
  var RFQ_S = [["الزجاج", "Glass"], ["مواد البناء", "Building materials"], ["الصناعات الغذائية", "Food industries"], ["البلاستيك والتغليف", "Plastics & packaging"], ["الكهرباء والكابلات", "Electrical & cables"], ["المعادن والألمنيوم", "Metals & aluminium"], ["البتروكيماويات والكيماويات", "Petrochemicals & chemicals"], ["الأدوية والمستلزمات الطبية", "Pharma & medical supplies"], ["الأثاث والأخشاب", "Furniture & wood"], ["الغزل والنسيج", "Spinning & textiles"], ["الورق والتغليف", "Paper & packaging"], ["أخرى", "Other"]];
  var RFQ_D = [["خلال أسبوع", "Within a week"], ["خلال أسبوعين", "Within two weeks"], ["خلال شهر", "Within a month"]];
  var CON_R = [["صاحب منشأة / مصنع مصري", "Factory owner"], ["مشترٍ / شركة توريدات", "Buyer / supplies company"], ["مستثمر محلي / أجنبي", "Investor"], ["جهة حكومية / شريك", "Government / partner"], ["أخرى", "Other"]];
  var FLOWS = {
    rfq: { page: "contact", hash: "rfq-form", form: "#rfq-form", submit: '#rfq-form button[type="submit"]', err: "#rfq-form .ferr",
      steps: [{ id: "p", f: "#r-p", req: 1, ph: ["مثلاً: زجاج شفاف 6 مم", "e.g. 6 mm clear glass"] }, { id: "q", f: "#r-q", req: 1, ph: ["مثلاً: 1,200 م²", "e.g. 1,200 m²"] }, { id: "c", f: "#r-c", ph: ["مثلاً: القاهرة", "e.g. Cairo"] }, { id: "s", f: "#r-s", opts: RFQ_S }, { id: "d", f: "#r-d", opts: RFQ_D }, { id: "x", f: "#r-x", ph: ["المواصفات أو التفاصيل", "Specs or details"] }, { id: "n", f: "#r-n", req: 1, ph: ["اسمك", "Your name"] }, { id: "co", f: "#r-co", ph: ["اسم الشركة", "Company name"] }, { id: "e", f: "#r-e", req: 1, type: "email", ph: ["name@company.com", "name@company.com"] }, { id: "ph", f: "#r-ph", req: 1, type: "phone", ph: ["01XXXXXXXXX", "01XXXXXXXXX"] }] },
    contact: { page: "contact", form: "#msgF", submit: '#msgF button[type="submit"]', err: "#msgF .ferr",
      steps: [{ id: "n", f: "#c-n", req: 1, ph: ["اسمك", "Your name"] }, { id: "e", f: "#c-e", req: 1, type: "email", ph: ["name@company.com", "name@company.com"] }, { id: "p", f: "#c-p", req: 1, type: "phone", ph: ["01XXXXXXXXX", "01XXXXXXXXX"] }, { id: "r", f: "#c-r", opts: CON_R }, { id: "s", f: "#c-s", ph: ["موضوع الرسالة", "Subject"] }, { id: "m", f: "#c-m", req: 1, ph: ["رسالتك", "Your message"] }] },
    reg: { page: "register", form: "#regF",
      steps: [{ id: "gcc", f: "#r-gcc", req: 1, type: "gcc", when: "gcc", ph: ["مثلاً: السعودية، الإمارات، قطر", "e.g. Saudi Arabia, UAE, Qatar"] }, { id: "name", f: "#r-name", req: 1, ph: ["اسم الشركة", "Company name"] }, { id: "mgr", f: "#r-mgr", req: 1, ph: ["اسم المدير", "Manager's name"] }, { id: "tel", f: "#r-tel", req: 1, type: "phone", ph: ["رقم التليفون", "Phone number"] }, { id: "emi", f: "#r-emi", req: 1, type: "gov", ph: ["المحافظة", "Governorate"] }, { id: "addr", f: "#r-addr", req: 1, ph: ["العنوان", "Address"] }, { id: "act", f: "#r-act", req: 1, ph: ["النشاط", "Activity"] }, { id: "prod", f: "#r-prod", req: 1, type: "list", ph: ["منتج 1، منتج 2، …", "product 1, product 2, …"] }, { id: "mail", f: "#r-mail", req: 1, type: "email", ph: ["info@company.com", "info@company.com"] }, { id: "cr", f: "#r-cr", req: 1, ph: ["رقم السجل التجاري", "Commercial register no."] }, { id: "vat", f: "#r-vat", req: 1, type: "vat", ph: ["123456789", "123456789"] }, { id: "oname", f: "#o-name", req: 1, ph: ["اسم مسؤول التسجيل", "Officer's name"] }, { id: "omob", f: "#o-mob", req: 1, type: "phone", ph: ["01XXXXXXXXX", "01XXXXXXXXX"] }, { id: "omail", f: "#o-mail", req: 1, type: "email", same: "mail", ph: ["الإيميل", "E-mail"] }] }
  };
  var SKIPW = /^(تخطي|تخطيها|سكيب|skip|عدي|عديها|عدي دي|مش عارف|معرفش|مفيش|لا|لأ|no|none|pass|nothing|بلاش)$/;
  var CANCELW = /(^|\s)(الغي|الغاء|الغيها|كنسل|كانسل|كفايه|مش عايز اكمل|cancel|stop|never mind|quit)(\s|$)/;
  function digits(s) { return String(s || "").replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x660; }).replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x6F0; }); }
  function stepQ(f, i) {
    var s = FLOWS[f.n].steps[i], n = s.type === "gcc" ? gccNeed(f) : 0;
    if (n && n !== 3) return seg(L === "ar" ? "إنت اخترت الباقة المميزة: فيها مصر + " + gccWords(n, true) + " تختارهم. أنهي دول؟ (من السعودية والإمارات والكويت وقطر والبحرين وعُمان)" : "You chose Premium: Egypt + " + gccWords(n, false) + " of your choice. Which ones? (from Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman)", "calm");
    return ln("flow." + f.n + "." + s.id);
  }
  /* the GCC states the registration flow must ask for: the flow's plan, else the plan picked on the open register form */
  function gccNeed(f) { var fs = document.getElementById("gccF"); if (fs && fs.getAttribute("data-locked") === "1") return 0; /* a renewal with the states in force: nothing to ask */
    if (f && f.plan) return gccPick(f.plan); return fs && !fs.hidden ? (+fs.getAttribute("data-pick") || gccPick("premium") || 3) : 0; }
  function askStep(pre) {
    var f = ST.flow, fl = FLOWS[f && f.n];
    if (!fl) { if (f && f.n === "search") return show({ segs: (pre || []).concat([ln("search.ask")]), acts: [btn("fcancel", t("cancel"))] }); ST.flow = null; save(); return intro(true, true); }
    var s = fl.steps[f.i]; f.ph = s.ph ? s.ph[L === "ar" ? 0 : 1] : t("ask"); save();
    var a = [];
    if (s.opts) s.opts.forEach(function (o, k) { a.push(btn("ans", o[L === "ar" ? 0 : 1], k)); });
    if (s.same && f.v[s.same]) a.push(btn("ans", t("same"), "=" + s.same, "ok"));
    if (f.n === "rfq" && f.sug && f.v.p === f.sug && s.id !== "p") a.push(btn("redo", "✏️ " + t("chgP"), "p"));
    if (!s.req) a.push(btn("skip", t("skip")));
    a.push(btn("fcancel", t("cancel")));
    show({ segs: (pre || []).concat([stepQ(f, f.i)]), acts: a });
    setTimeout(function () { try { if (!("ontouchstart" in window)) input.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  function startFlow(n, pre, extra) {
    ST.flow = { n: n, i: 0, v: {}, plan: extra && extra.plan || "" }; if (ST.flow.plan) ST.plan = ST.flow.plan; save();
    var f = ST.flow, steps = FLOWS[n].steps; if (extra && extra.v) Object.keys(extra.v).forEach(function (k) { if (extra.v[k]) f.v[k] = extra.v[k]; });
    /* the GCC-states step only for a plan that has a pick (Premium) */
    if (n === "reg" && !gccNeed(f)) f.v.gcc = "";
    /* a signed-in visitor: name / e-mail / phone come from the account (data/mig-api.js), so she does not ask for them */
    var me = null; try { me = window.MIGAPI && MIGAPI.token() && MIGAPI.user ? MIGAPI.user() : null; } catch (e) {}
    if (me && (n === "rfq" || n === "contact")) { if (me.name && !f.v.n) f.v.n = String(me.name); if (me.email && !f.v.e) f.v.e = String(me.email); if (me.phone) { if (n === "rfq" && !f.v.ph) f.v.ph = String(me.phone); if (n === "contact" && !f.v.p) f.v.p = String(me.phone); } if (n === "rfq" && me.company && !f.v.co) f.v.co = String(me.company); save(); }
    while (f.i < steps.length && f.v[steps[f.i].id] != null) f.i++;
    var got = []; if (n === "rfq" && f.v.p) { f.sug = f.v.p; save(); got.push(ln("flow.rfq.got", { p: f.v.p })); }
    askStep((pre || []).concat([ln("flow." + n + ".start")], got));
  }
  function flowInput(raw, chipV) {
    var f = ST.flow, fl = FLOWS[f.n], s = fl.steps[f.i], n = N(raw), v = String(raw || "").trim();
    if (chipV == null && CANCELW.test(n)) return cancelFlow();
    if (chipV == null && /(مش فاهم|مفهمتش|زهقت|مش شغال|i dont understand|confused)/.test(n)) return askStep([ln("confused"), seg(L === "ar" ? "بص، أنا محتاجة منك حاجة واحدة بس:" : "Look, I just need one thing from you:", "empathetic")]);
    var skip = chipV === "skip" || (chipV == null && SKIPW.test(n));
    if (skip) { if (s.req) return askStep([ln("flow.req")]); f.i++; return nextStep([ln("flow.skip")]); }
    if (chipV != null && /^=/.test(chipV)) { v = f.v[chipV.slice(1)]; }
    else if (s.opts) {
      var idx = chipV != null ? +chipV : -1;
      if (idx < 0 && n) s.opts.forEach(function (o, k) { if (idx < 0 && (N(o[0]).indexOf(n) > -1 || n.indexOf(N(o[0]).split(" ")[0]) > -1 || N(o[1]).indexOf(n) > -1 || n === String(k + 1))) idx = k; });
      if (idx < 0 || !s.opts[idx]) return askStep([ln("flow.bad.opt")]);
      v = idx;
    } else if (s.type === "phone") { v = digits(v).replace(/[\s\-().]/g, ""); if (!/^(?:(?:\+|00)20|0)(?:1[0125]\d{8}|[2-9]\d{7,8})$/.test(v)) return askStep([ln("flow.bad.phone")]); }
    else if (s.type === "email") { v = v.replace(/\s+/g, ""); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return askStep([ln("flow.bad.mail")]); }
    else if (s.type === "vat") { v = digits(v).replace(/[\s\-]/g, ""); if (!/^\d{9}$/.test(v)) return askStep([ln("flow.bad.vat")]); }
    else if (s.type === "gov") { var g = findGov(N(v), v); if (!g) return askStep([ln("flow.bad.gov")]); v = g; }
    else if (s.type === "list") { v = v.split(/\s*[,،;\n]+\s*/).filter(Boolean).join("\n"); }
    else if (s.type === "gcc") { var P0 = MP(), cs = P0 && P0.gccParse ? P0.gccParse(v) : [], gn = gccNeed(f) || 3; if (cs.length !== gn) return askStep([gn === 3 ? ln("flow.bad.gcc") : seg(L === "ar" ? "محتاجة " + gccWords(gn, true) + " بالظبط من السعودية والإمارات والكويت وقطر والبحرين وعُمان." : "I need exactly " + gccWords(gn, false) + " of Saudi Arabia, UAE, Kuwait, Qatar, Bahrain and Oman.", "calm")]); v = cs.join(","); }
    if (v === "" && s.req) return askStep([ln("flow.req")]);
    f.v[s.id] = v; f.i++; nextStep([ln("ack")]);
  }
  function nextStep(pre) {
    var f = ST.flow, fl = FLOWS[f.n]; while (f.i < fl.steps.length && f.v[fl.steps[f.i].id] != null) f.i++;
    save(); if (f.i < fl.steps.length) return askStep(pre);
    /* all answers collected: go to the form and fill it */
    var pend = { kind: "fill", flow: f.n, v: f.v, plan: f.plan }; ST.flow = null; save(); chrome();
    pre = (pre || []).filter(function (x) { return x && !/^ack\./.test(x.k || ""); });
    var href = fl.page + ".html" + (f.n === "reg" && f.plan ? "#" + f.plan : fl.hash ? "#" + fl.hash : "");
    if (fl.page === PAGE && !KIOSK) { show({ segs: (pre || []).concat([ln("flow.going")]) }); setTimeout(function () { doFill(pend, true); }, 500); return; }
    goTo(href, pend, (pre || []).concat([ln("flow.going")]));
  }
  function cancelFlow() { ST.flow = null; save(); chrome(); show({ segs: [ln("flow.cancel")], acts: pageActs() }); }
  var REG_CATS = [["steel", "حديد|صلب|معادن|معدن|steel|metal|iron"], ["wood", "خشب|اخشاب|اثاث|wood|furniture"], ["plastic", "بلاستيك|pvc|hdpe|plastic"], ["food", "اغذيه|غذائ|اكل|عصير|البان|لبن|حلويات|food|dairy|juice"], ["paper", "ورق|كرتون|paper|carton"], ["chem", "كيماو|دهان|اسمد|منظفات|chemical|paint|fertili"], ["oil", "بترول|نفط|غاز|oil|gas|petro"], ["textile", "غزل|نسيج|ملابس|قماش|مفروشات|textile|garment|cloth"], ["build", "اسمنت|سيراميك|رخام|طوب|بناء|زجاج|cement|ceramic|marble|glass|building"], ["elec", "كهرب|كابل|هندسي|محركات|electric|cable|engineer"], ["pharma", "دواء|ادويه|طبي|pharma|medic"]];
  var fillState = null;
  function doFill(p, here) {
    var fl = FLOWS[p.flow]; if (!fl) return;
    var form = $(fl.form);
    if (!form) { show({ segs: [seg(L === "ar" ? "مش لاقية الفورم في الصفحة دي 🙈" : "I can't find the form on this page 🙈", "empathetic")], acts: pageActs() }); return; }
    if (p.flow === "reg" && p.plan) { var pb = document.querySelector('[data-plan="' + p.plan + '"]'); if (pb && PAGE === "register" && here) pb.click(); }
    var filled = [];
    fl.steps.forEach(function (s) {
      var v = p.v[s.id]; if (v == null || v === "") return; var el = $(s.f); if (!el) return;
      if (s.opts) { selOpt(el, s.opts, +v); } else if (s.type === "gov") { selGov(el, v); } else setField(el, String(v));
      if (el.offsetParent !== null) { el.classList.add("jn-filled"); filled.push(el); }
    });
    if (p.flow === "reg") {
      var txt = N((p.v.act || "") + " " + (p.v.prod || "")), any = false;
      REG_CATS.forEach(function (c) { if (new RegExp(c[1]).test(txt)) { var cb = $('input[name="cat"][value="' + c[0] + '"]'); if (cb && !cb.checked) { cb.checked = true; fire(cb, ["change"]); } any = true; } });
      if (!any) { var o = $('input[name="cat"][value="other"]'); if (o && !o.checked) { o.checked = true; fire(o, ["change"]); } }
    }
    try { var tg = filled[0] || form; window.scrollBy({ top: tg.getBoundingClientRect().top - 130, behavior: RM ? "auto" : "smooth" }); } catch (e) { try { (filled[0] || form).scrollIntoView(); } catch (x) {} }
    setTimeout(function () { filled.forEach(function (el) { el.classList.remove("jn-filled"); }); }, 9000);
    fillState = p;
    var hv = p.v || {};
    holo(p.flow === "reg" ? "janna_fill_registration" : "janna_fill_" + p.flow, p.flow === "rfq" ? { product: hv.p, quantity: hv.q, city: hv.c } : p.flow === "contact" ? { name: hv.n, subject: hv.s, message: hv.m } : { company_name: hv.name, manager: hv.mgr, governorate: hv.emi, activity: hv.act, plan: p.plan || "" });
    show({ peek: true, segs: (here ? [] : [ln("arrive")]).concat([ln("fill.done"), ln("fill.confirm." + p.flow)]), acts: [btn("fconfirm", p.flow === "reg" ? t("next") : t("send"), null, "ok"), btn("fedit", t("edit")), btn("fcancel2", t("cancel"))] });
  }
  /* first flow step whose form field is required but empty or invalid (inside scope) */
  function missing(fl, scope) {
    for (var i = 0; i < fl.steps.length; i++) {
      var st = fl.steps[i], el = $(st.f); if (!el || (scope && !scope.contains(el))) continue;
      if (st.when === "gcc") { var fs = document.getElementById("gccF"); if (!fs || fs.hidden || fs.getAttribute("data-locked") === "1") continue; }
      var v = String(el.value || "").trim(), bad = (el.required || st.req) && (!v || (el.checkValidity && !el.checkValidity()));
      if (!bad && st.type === "vat" && v && !/^\d{9}$/.test(digits(v).replace(/[\s\-]/g, ""))) bad = true;
      if (bad) return i;
    }
    return -1;
  }
  /* go back into the conversation at step i (its old answer dropped), then fill the form again */
  function refix(p, i, pre) {
    var fl = FLOWS[p.flow], v = {}; Object.keys(p.v || {}).forEach(function (k) { v[k] = p.v[k]; }); delete v[fl.steps[i].id];
    fillState = null; ST.flow = { n: p.flow, i: i, v: v, plan: p.plan || "" }; save(); askStep(pre);
  }
  function errText(e) { var x = e ? String(e.textContent || "").trim() : ""; return L === "ar" ? x.replace(/\s*·\s*[^،,]*?[A-Za-z][^،,]*/g, "").trim() : x; }
  function curStep() { var s = document.querySelector("#regF .stp.on"); return s ? +s.getAttribute("data-s") : -1; }
  function confirmFill() {
    var p = fillState, fl = p && FLOWS[p.flow]; if (!fl) return;
    if (p.flow === "reg") return regAdvance(0);
    var b = $(fl.submit); if (!b) return;
    var fin = false, toT = 0;
    var off = function () { fin = true; clearTimeout(toT); window.removeEventListener("mig:inquiry", onAns); };
    var again = function () { return [btn("fconfirm", t("send"), null, "ok"), btn("fedit", t("edit"))]; };
    /* data/mig-forms.js: "mig:inquiry" {ok, ref, status, routed, kind, error, code} — the only proof that it was sent */
    var onAns = function (e) {
      if (fin) return; var x = (e && e.detail) || {}; off();
      if (x.ok && x.ref) { fillState = null; logT("j", "sent:" + p.flow + ":" + x.ref); show({ segs: [sentLine(p.flow, x)], acts: [linkBtn(L === "ar" ? "تتبّع الطلب" : "Track it", "track.html#" + encodeURIComponent(x.ref), true), chip(["srch", "factories"]), chip(["reg"])] }); return; }
      show({ segs: [ln("sent.fail", { err: x.code === "offline" ? (L === "ar" ? "سيرفر المنصة مش متاح دلوقتي." : "The platform's server is not reachable right now.") : String(x.error || x.code || "").slice(0, 160) })], acts: again() });
    };
    window.addEventListener("mig:inquiry", onAns);
    holo("janna_submit_form", { form: p.flow === "contact" ? "contact" : "rfq" });
    b.click();
    /* the form stopped on its own checks (nothing went to the server) */
    setTimeout(function () {
      if (fin) return;
      var mi = missing(fl, $(fl.form)), e = $(fl.err), et = e && !e.hidden ? errText(e) : "";
      if (mi > -1) { off(); return refix(p, mi, [ln("fill.miss")]); }
      if (et) { off(); show({ segs: [ln("fill.err", { err: et })], acts: again() }); }
    }, 700);
    toT = setTimeout(function () { if (fin) return; off(); show({ segs: [ln("sent.wait")], acts: again() }); }, 25000);
  }
  /* what she says once the platform answered with a reference number: the TRUE number of factories it was routed to, or why none */
  function sentLine(flow, x) {
    var ref = String(x.ref), st = String(x.status || "").toLowerCase(), n = +x.routed || 0;
    if (flow !== "rfq") return ln("sent.contact", { ref: ref });
    if (st === "in_progress") return ln("sent.rfqwork", { ref: ref });
    if (st === "received" && !n) return ln("sent.rfqretry", { ref: ref });
    if (n > 0) return ln("sent.rfq", { ref: ref, n: money(n) });
    return ln("sent.rfq0", { ref: ref });
  }
  /* the holographic workspace (data/holo.js) shows what she does on the page; it confirms a send only after the platform's answer */
  function holo(tool, args) { try { if (window.MIGHOLO && MIGHOLO.act) MIGHOLO.act(tool, args || {}, { who: "janna" }); } catch (e) {} }
  function regAdvance(n) {
    var s0 = curStep(), next = $("#next"); if (!next || s0 < 0) return;
    if (s0 >= 3) { fillState = null; show({ segs: [ln("reg.docs")], acts: [btn("qr", "📱 " + t("phone")), chip(["msg"])] }); return; }
    next.click();
    setTimeout(function () {
      var s1 = curStep();
      if (s1 === s0) {
        var mi = fillState ? missing(FLOWS.reg, document.querySelector('#regF .stp[data-s="' + s0 + '"]')) : -1;
        if (mi > -1) return refix(fillState, mi, [ln("fill.miss")]);
        var e = $("#err"); show({ segs: [ln("fill.err", { err: errText(e) })], acts: [btn("fconfirm", t("next"), null, "ok"), btn("fedit", t("edit"))] }); return;
      }
      if (s1 < 3 && n < 4) regAdvance(n + 1); else { fillState = null; show({ segs: [ln("reg.docs")], acts: [btn("qr", "📱 " + t("phone")), chip(["msg"])] }); }
    }, 500);
  }

  /* ---------- the plan wizard ---------- */
  var W = {};
  function wiz(step, val) {
    if (step === 1) {
      W = {};
      show({ segs: [ln("wiz.who")], acts: [btn("w2", "🏭 " + (L === "ar" ? "مصنع" : "A factory"), "factory"), btn("w2", "🏢 " + (L === "ar" ? "شركة أو مورد" : "A company / supplier"), "supplier"), btn("w2", "🛒 " + (L === "ar" ? "مشتري أو مقاول" : "A buyer / contractor"), "buyer")] });
      return;
    }
    if (step === 2) {
      W.type = val;
      if (val === "buyer") { show({ segs: [ln("wiz.buyer")], acts: [btn("rfq", "📝 " + t("rfq"), null, "pri"), chip(["srch", "factories"])] }); return; }
      show({ segs: [ln("wiz.what")], acts: [btn("w3", "📇 " + (L === "ar" ? "أظهر في الدليل بس" : "Just be listed in the directory"), "profile"), btn("w3", "🇪🇬 " + (L === "ar" ? "أستقبل طلبات المشترين في مصر" : "Receive buyers' requests in Egypt"), "basic"), btn("w3", "🌍 " + (L === "ar" ? "مصر + 3 دول خليجية أختارها" : "Egypt + 3 Gulf states I choose"), "premium"), btn("w3", "🌍 " + (L === "ar" ? "مصر وكل الخليج وأفريقيا + باسم" : "Egypt, the whole Gulf & Africa + Bassem"), "partner"), btn("w3", "⭐ " + (L === "ar" ? "كل أسواق العالم + باسم + كل الاستشارات" : "All world markets + Bassem + all consulting"), "strategic")] });
      return;
    }
    if (step === 3) {
      W.plan = val;
      if (noBuy()) { show({ segs: [ln("wiz.plan", { plan: planName(val), feat: planFeat(val), price: "", pay: "" })], acts: [btn("regfill", "✍️ " + t("regfill"), val, "pri"), linkBtn(t("openPage"), "register.html#form"), btn("qr", "📱 " + t("phone"))] }); return; }
      show({ segs: [ln("wiz.plan", { plan: planName(val), feat: planFeat(val), price: planPriceTxt(val), pay: PAYTXT[L] })], acts: [btn("regfill", "✍️ " + t("regfill"), val, "pri"), linkBtn(t("openPage"), "register.html#" + val), btn("qr", "📱 " + t("phone")), linkBtn(t("compare"), "register.html#plans")] });
    }
  }
  function showQR(url) {
    url = url || abs("register.html#" + (W.plan || ST.plan || "plans"));
    qr.hidden = false; qr.innerHTML = '<div class="qrb"></div><span>' + esc(t("qr")) + "</span>"; layout();
    var box = qr.querySelector(".qrb"), sz = KIOSK ? 240 : 150;
    function draw() { try { new window.QRCode(box, { text: url, width: sz, height: sz, correctLevel: url.length > 600 ? window.QRCode.CorrectLevel.L : window.QRCode.CorrectLevel.M }); } catch (e) { box.innerHTML = '<a href="' + esc(url) + '" style="word-break:break-all">' + esc(url.slice(0, 120)) + "</a>"; } setTimeout(layout, 30); }
    if (window.QRCode) draw(); else { var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; /* cdnjs' published SRI (security review L4) */ sc.integrity = "sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA=="; sc.crossOrigin = "anonymous"; sc.referrerPolicy = "no-referrer"; sc.onload = draw; sc.onerror = function () { box.innerHTML = '<a href="' + esc(url) + '">' + esc(url.slice(0, 120)) + "</a>"; }; document.head.appendChild(sc); }
  }

  /* ---------- understanding the visitor ---------- */
  function setLang(l, quiet) { L = l; ss("janna-lang", l); ss("janna-lsite", SITEL); chrome(); if (!quiet) intro(true, true); }
  function qa(q, n) {
    var a = window.MIGBOT && MIGBOT.answer ? MIGBOT.answer(q, L) : null;
    /* the app with buying off there: a stored answer that names a price or a payment is not said (the plans line instead) */
    if (a && a[0] && noBuy() && /\d[\d,.]*\s*(جنيه|ج\.م)|EGP\s*\d|ادفع|الدفع|دفع الاشتراك|pay(ment)?\b/i.test(String(a[0]))) { show({ segs: [seg(L === "ar" ? "تفاصيل أسعار الباقات مش متاحة جوه التطبيق. " + plansList() : "Plan prices are not available inside the app. " + plansList(), "calm")], q: q, acts: [chip(["reg"])] }); return true; }
    if (a && a[0]) {
      var segs = []; if (Math.random() < .3) segs.push(ln("think")); segs.push(seg(a[0], "calm"));
      var la = (a[1] || []).slice(0, 4).map(function (l) { return linkBtn(l[0], l[1]); }); if (la.length < 2) la.push(chip(["can"]));
      show({ segs: segs, q: q, acts: la });
      return true;
    }
    return false;
  }
  function fallback(q, confused) {
    show({ segs: [ln(confused ? "confused" : "fallback")], q: q, acts: [chip(["srch", "factories"]), chip(["srch", "market"]), chip(["srch", "tenders"]), chip(["reg"]), chip(["rfq"])] });
  }
  /* 🌐 (owner 2026-11-20 «جنة او باسم يتكلموا اي لغه في العالم»): this scripted bubble speaks Arabic and English only, so Franco Arabic
     («ana 3ayez masane3 7adid»: a word of 3+ Latin letters with 2 3 5 6 7 8 9 in it — never a size or unit like m2, 8mm, 5kg, 3pcs, 2x2 —,
     or two of its everyday words) is Arabic, and a message in another language — another script's letters, accented Latin together with
     a word of that language (never «Nestlé» or «café» in an English sentence), or 3+ Latin words with none of English and one of another
     language — gets one line in both languages and the live call, where Janna speaks the visitor's language (while the owner's
     call_languages switch is on). English and Arabic messages: exactly as before */
  var FRANCO_X = /^(b2b|b2c|b2g|c2c|p2p|mp3|mp4|h2o|co2|a3|a4|a5|2d|3d|4g|5g|g7|g20|ps5|x5|q7|u2|w3c|covid19|usb2|usb3|ipv6|web2|web3|gen2|gen3|wifi5|wifi6|euro5|euro6)$/;
  var FRANCO_UNIT = /^\d+(mm|cm|m[23]?|kgs?|g|t|tons?|tonnes?|kwh?|kva|w|v|hp|ltr|l|ml|pcs|inch(es)?|ft)$/;
  var FRANCO_W = " ana enta enty inta inti howa heya ehna ezay ezayak ezayek izay leh fein fen feen keda kda kedda mesh msh mish 3ayez 3ayza 3awez 3awza abga 3andy 3andi momken mumkin bkam bekam tamam shokran ahlan yalla khalas ya3ni kwayes kwayesa awy awi delwa2ty dlw2ty bardo bardu ";
  function franco(q) {
    var w = String(q || "").toLowerCase().match(/[a-z0-9']+/g) || [], n = 0, seen = {}, i, x;
    for (i = 0; i < w.length; i++) {
      x = w[i];
      if ((x.match(/[a-z]/g) || []).length >= 3 && /(^|[^0-9])[235-9]([^0-9]|$)/.test(x) && !FRANCO_UNIT.test(x) && !FRANCO_X.test(x)) return true;
      if (!seen[x] && FRANCO_W.indexOf(" " + x + " ") > -1) { seen[x] = 1; n++; }
    }
    return n >= 2;
  }
  var EN_W = " the a an and or of in on at to for from with by is are was be am i you we he she it they my me your our this that these those what where when who how which why can could would will do does did have has need want looking look find search show give get send please hello hi hey thanks thank ok okay yes no not any some all about more price prices list cost costs factory factories company companies supplier suppliers product products tender tenders rfq rfqs quote quotation buy sell offer offers plan plans register registration egypt egyptian cairo giza steel iron plastic cement casting ";
  var OTHER_W = " je tu il nous vous ils elle le la les des du est une pour avec et mais dans sur cherche bonjour merci oui pas qui quel quelle combien prix usine usines acier ciment veux voudrais besoin el los las es una para con por busco hola gracias quiero necesito fabrica fabricas acero precio donde eu nao uma com obrigado preciso aco io sono il lo gli della ciao grazie cerco voglio acciaio fabbrica ich bin der die das und ist nicht mit suche brauche hallo danke bitte fabrik stahl preis bir ve ben merhaba fabrika ik het een van zoek dank saya ingin mencari pabrik baja terima kasih untuk habari asante nataka kiwanda chuma ";
  function otherLang(q) {
    var s = String(q || ""), w, i, en = 0, ot = 0;
    if (/[\u0600-\u06ff]/.test(s)) return false;
    if (/[\u0370-\u058f\u0590-\u05ff\u0900-\u0dff\u0e00-\u0e7f\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s)) return true; /* another script */
    w = s.toLowerCase().match(/[a-z]+/g) || [];
    for (i = 0; i < w.length; i++) { if (EN_W.indexOf(" " + w[i] + " ") > -1) en++; else if (OTHER_W.indexOf(" " + w[i] + " ") > -1) ot++; }
    if (/[\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f]/.test(s) && ot > 0 && ot >= en) return true; /* accented Latin with a word of that language */
    return w.length >= 3 && !en && ot > 0;
  }
  /* the owner's switch: «🛠️ المطوّر» → call_languages off = the live call hears only its own language (data/janna-live.js langOn) */
  function langsOff() { var F = window.MIGFLAGS; return !!(F && F.on && F.on("call_languages") === false); }
  function handle(q, fromVoice) {
    q = String(q || "").trim(); if (!q) return;
    /* switch language only on a real sentence: one English word ("hello", "ok") keeps her in Arabic; Franco Arabic is Arabic */
    var hasAr = /[\u0600-\u06FF]/.test(q), enW = (q.match(/[a-z]{2,}/gi) || []).length, fr = !hasAr && franco(q), oth = !hasAr && !fr && otherLang(q);
    if (!ST.flow) { if (fr) { if (L !== "ar") setLang("ar", true); } else if (enW >= 2 && !hasAr && L !== "en") setLang("en", true); else if (hasAr && L !== "ar") setLang("ar", true); }
    logT("u", q);
    if (ST.flow) { reply(function () { flowInput(q); }, rnd(300, 600)); return; }
    if (oth && liveOn() && !langsOff()) { reply(function () { show({ segs: [seg("جنة المباشرة بتتكلم لغتك — كلّمها فيديو أو اكتبلها بلغتك", "happy"), seg("Live Janna speaks your language — call or type to her in it", "happy")], q: q, acts: [chip(["live"]), chip(["can"])], speak: false }); }); return; }
    reply(function () { understand(q); });
  }
  function understand(q) {
    var n = N(q).replace(/^(?:يا )?جنه(?: |$)/, "").replace(/^(?:hey |hi )?janna(?: |$)/, "") || N(q), toks = n.split(" ").length, question = rxAr(QW).test(n) || /[؟?]/.test(q);
    var navT = has(n, NAVW, "go to|open|take me|show me|navigate|where is|where are|bring me"), srT = has(n, SRW, "find|search|look for|looking for|need|want|get me|search for");
    /* small talk */
    if (/(مش فاهم|مش فاهمه|مفهمتش|زهقت|مش شغال|مبيشتغلش|بايظ|مش عارف اعمل|تعبت|حاجه غلط|i dont understand|i don t understand|not working|doesnt work|confus|annoy|frustrat)/.test(n)) { setMood("empathetic"); return fallback(q, true); }
    if (/(^|\s)(شكرا|متشكر|متشكره|ميرسي|تسلم|تسلمي|تسلميلي|الف شكر|thank|thanks|thx|merci)(\s|$)/.test(n)) return show({ segs: [ln("thanks")], q: q, acts: pageActs() });
    if (/(انتي مين|انت مين|مين انتي|اسمك ايه|who are you|your name|whats your name)/.test(n)) return show({ segs: [ln("who"), ln("can")], q: q, acts: [chip(["srch", "factories"]), chip(["rfq"]), chip(["reg"])] });
    if (/(تعرفي تعملي ايه|بتعرفي تعملي ايه|تقدري تعملي ايه|بتعملي ايه|تقدري تساعديني في ايه|بتساعدي في ايه|what can you do|what do you do|how can you help)/.test(n) || /^(ساعديني|help|help me|مساعده)$/.test(n)) return show({ segs: [ln("can")], q: q, acts: [chip(["srch", "factories"]), chip(["srch", "tenders"]), chip(["rfq"]), chip(["msg"]), chip(["reg"])] });
    if (toks <= 6 && /^(?:يا جنه )?(السلام عليكم|سلام عليكم|السلام عليكو|سلامو عليكو|السلام عليكي)/.test(n)) return show({ segs: [ln("salam")], q: q, acts: pageActs() });
    if (toks <= 5 && /(ازيك|عامله ايه|اخبارك|how are you)/.test(n)) return show({ segs: [ln("how")], q: q, acts: pageActs() });
    if (toks <= 6 && /(^|\s)(بحبك|حبيتك|بموت فيكي|i love you|love you)(\s|$)/.test(n)) return show({ segs: [ln("love")], q: q, acts: pageActs() });
    if (/(^|\s)(نكته|نكت|ضحكيني|joke|jokes|make me laugh)(\s|$)/.test(n)) return show({ segs: [ln("joke")], q: q, acts: [chip(["srch", "factories"]), chip(["can"])] });
    if (toks <= 6 && /(^|\s)(شاطره|جميله|حلوه|عسل|قمر|جدعه|تحفه|برافو|ممتازه|عظيمه|you are great|you re great|youre great|smart|amazing|awesome|beautiful|good job|well done|nice)(\s|$)/.test(n) && !findSect(n)) return show({ segs: [ln("nice")], q: q, acts: pageActs() });
    if (toks <= 4 && !findSect(n) && !regW0(n) && /^(اهلا|اهلين|هاي|هالو|مرحبا|السلام عليكم|سلام عليكم|صباح الخير|مساء الخير|صباحو|يا جنه|جنه|hi|hello|hey|good morning|good evening|good afternoon)/.test(n)) return show({ segs: [ln("hi")], q: q, acts: pageActs() });
    if (toks <= 4 && /^(سلام|مع السلامه|باي|bye|goodbye|see you)/.test(n)) return show({ segs: [ln("bye")], q: q, acts: [] });
    /* a tender / RFQ number wins over the RFQ form («افتحي طلب السعر RFQ-2026-4382») */
    if (refOf(q) && (has(n, OPENW, OPENW) || /(مناقص|ممارس|tender|رقم|ref|number)/.test(n) || /(^|\s)(طلب|rfq)(\s|$)/.test(n) && has(n, OPENW, OPENW))) { curQ = q; findRef(refOf(q)); return; }
    /* do things: RFQ, contact message, registration */
    var rfqW = /(طلب\s*(عرض\s*)?(سعر|اسعار|تسعير)|عرض\s*سعر|تسعيره|(^|\s)rfq(\s|$)|quot(e|ation))/.test(n) && !/(^|\s)(طلبات|rfqs|requests)(\s|$)/.test(n);
    if (rfqW && (!question || /(ابعت|ارسل|اعمل|اطلب|قدم|عايز|عاوز|محتاج|اكتب|نعمل|send|post|make|request|get|need|want|submit)/.test(n))) {
      var prod = q.replace(/.*?(?:عرض\s*(?:ال)?سعر|تسعير[ةه]?|requests?\s+for\s+(?:an?\s+)?quot(?:e|ation)s?|(?:quotation|quote)s?(?:\s+requests?)?|rfqs?)\s*(?:على|علي|عن|ل|لـ|for|of|on)?\s*/i, "").replace(/^(?:an?|the)\s+/i, "").replace(/[.?!؟]+$/, "").trim();
      return startFlow("rfq", [], { v: { p: prod && prod.length > 1 && prod !== q ? prod : null } });
    }
    if (/(ابعت|ارسل|اكتب|ابعتي|اكتبي|send|write)\s.*(رساله|شكوي|استفسار|message|complaint|inquiry|enquiry)/.test(n) || /(اكلم|كلمي|اتواصل|تواصلي|contact)\s*(مع)?\s*(الفريق|الدعم|الاداره|حد|معاكم|support|team|you)/.test(n)) return startFlow("contact");
    var regW = /(^|\s)(سجل|سجلي|سجليني|اسجل|نسجل|تسجيل|التسجيل|اشترك|اشتراك|انضم|register|registration|sign ?up|subscribe|join)(\s|$)/.test(n);
    var plan = planOf(n), openT = has(n, "وديني|ودني|خديني|خدني|روحي|روح|افتح|افتحي|افتحيلي|افتحلي|اعرض|اعرضي|اعرضيلي|انقليني|صفحه", "go to|open|take me|navigate|bring me|page");
    var priceQ = /(^|\s)(اسعار|الاسعار|سعر|بكام|كام|تكلفه|التكلفه|رسوم|الرسوم|price|prices|pricing|cost|costs|how much|fee|fees)(\s|$)/.test(n) && /(باق|اشتراك|تسجيل|عضوي|plan|package|subscri|membership|regist)/.test(n);
    if (priceQ && !openT && !CMPW.test(n)) { if (noBuy()) return show({ segs: [seg(L === "ar" ? "تفاصيل أسعار الباقات مش متاحة جوه التطبيق. " + plansList() : "Plan prices are not available inside the app. " + plansList(), "calm")], q: q, acts: [chip(["reg"])] }); if (plan) return wiz(3, plan); return show({ segs: [ln("plans", { list: plansList() })], q: q, acts: [chip(["reg"]), linkBtn(t("compare"), "register.html#plans")] }); }
    if (regW && openT) return goTo("register.html" + (plan ? "#" + plan : ""));
    if (regW) {
      if (question && qa(q, n)) return;
      if (plan) return startFlow("reg", [ln("reg.plan", { plan: planName(plan) })], { plan: plan });
      return wiz(1);
    }
    /* full access: tour, live video / meeting, the current page, plan comparison, counts, a specific item */
    if (fullAccess(q, n)) return;
    if (plan && (srT || navT || toks <= 3) && !CMPW.test(n)) return wiz(3, plan);
    /* search / navigate */
    var sec = findSect(n), gov = findGov(n, q), ent = sec && SEARCH[sec[0]] ? sec[0] : "";
    if (!ent) { for (var k in SEARCH) if (SEARCH[k].x && rxAr(SEARCH[k].x).test(n)) { ent = k; break; } }
    var tm = ent || gov ? term(q, gov) : "";
    var findQ = has(n, "فيه|يوجد|توجد|الاقي|نلاقي|القي|يلاقي|عندكم|فين|مين بيعمل|مين بيبيع", "is there|are there|any|where can i find|where can i get|where can i buy|how do i find|how can i find|who makes|who sells|find");
    if (question && !navT && !srT && !(findQ && ent && (tm || gov)) && qa(q, n)) return;
    if (ent && (tm || gov) && (srT || navT || findQ || !question)) return startSearch(ent, tm, gov);
    if ((navT || srT || toks <= 3) && sec) { if (sec[0] === "register") return openT ? goTo("register.html") : wiz(1); if (sec[0] === "region" && gov) return goGov(gov); return goTo(sec[0] + ".html"); }
    if (gov && (navT || toks <= 3)) return goGov(gov);
    if (ent && (srT || navT)) return goTo(ent + ".html");
    if (qa(q, n)) return;
    fallback(q);
  }

  /* ---------- microphone ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, micBtn = bub.querySelector(".mic");
  if (!SR) micBtn.style.display = "none";
  function listen() {
    if (!SR) { show({ segs: [ln(NOMIC)], acts: pageActs() }); return; }
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    stop(); if (fig.hidden && !KIOSK) dock(false); bub.hidden = false; bub.classList.remove("teaser"); fig.classList.add("jn-open"); bodyEl.textContent = LINES.listening[L]; setMood("calm"); layout();
    rec = new SR(); rec.lang = L === "ar" ? "ar-EG" : "en-US"; rec.interimResults = true; rec.maxAlternatives = 1;
    micBtn.classList.add("rec"); var got = "";
    rec.onresult = function (e) { var s = ""; for (var i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript; got = s; bodyEl.textContent = "🎙️ " + s; if (e.results[e.results.length - 1].isFinal) { try { rec.stop(); } catch (x) {} } };
    rec.onerror = function (e) { micBtn.classList.remove("rec"); rec = null; got = ""; show({ segs: [ln(e && (e.error === "not-allowed" || e.error === "service-not-allowed") ? NOMIC : "nohear")], acts: pageActs() }); };
    rec.onend = function () { micBtn.classList.remove("rec"); rec = null; if (got) handle(got, true); };
    try { rec.start(); } catch (e) { rec = null; micBtn.classList.remove("rec"); show({ segs: [ln(NOMIC)], acts: pageActs() }); }
  }

  /* ---------- events ---------- */
  function untap() { var tp = document.querySelector(".jn-tap"); if (tp) tp.remove(); }
  function unlock() { untap(); if (!unlocked) { unlocked = true; ttsBlocked = false; } }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.isTrusted !== false) { unlocked = true; ttsBlocked = false; untap(); } }, true); });
  function minimise() { stop(); hideBub(); fig.hidden = true; mini.hidden = false; ls("janna-min", "1"); }
  function restore(speak) { unlock(); miniHi = false; mini.hidden = true; fig.hidden = false; ls("janna-min", "0"); layout(); openJ(speak); }
  function openJ(speak) {
    unlock();
    if (ST.flow) { askStep([ln("flow.resume")]); return; }
    if (fillState) { show({ segs: [ln("fill.confirm." + fillState.flow)], acts: [btn("fconfirm", fillState.flow === "reg" ? t("next") : t("send"), null, "ok"), btn("fedit", t("edit")), btn("fcancel2", t("cancel"))] }); return; }
    intro(speak);
  }
  /* her corner: a click brings her forward on the stage again (a conversation in progress resumes in the bubble) */
  function canStage() { return !KIOSK && !ST.flow && !fillState && ST.tour == null && !quietPage(); }
  function figClick() { if (bub.hidden) { if (canStage()) openStage(false); else openJ(true); } else hideBub(); }
  /* only her real pixels react to the mouse; everything around her stays clickable. While she is the faint see-through
     ghost (bubble closed, standing over the page) a control the visitor sees through her (link, button, field, tab…)
     keeps its clicks: she never takes a click aimed at it, and she does not light up over it */
  var hotRaf = 0, CTRL = 'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="option"],[contenteditable="true"],[onclick]';
  function seeThru(el) { return !!(el && el.closest && fig.classList.contains("ghost") && !fig.classList.contains("jn-open") && el.closest(CTRL) && !inJanna(el)); }
  function grab(x, y, el) { return AV.hit(x, y) && !seeThru(el); }
  if (AV.real) {
    document.addEventListener("click", function (e) {
      if (fig.hidden || e.target.closest && (e.target.closest(".jn-bub") || e.target.closest(".jn-x") || e.target.closest(".jn-tag") || e.target.closest(".jn-mini"))) return;
      if (grab(e.clientX, e.clientY, e.target)) { e.preventDefault(); e.stopPropagation(); unlock(); figClick(); }
    }, true);
    /* the press itself must not focus or open the control under her (a select, a link) */
    ["pointerdown", "mousedown"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (fig.hidden || e.target.closest && e.target.closest(".jn-bub,.jn-x,.jn-tag,.jn-mini")) return; if (grab(e.clientX, e.clientY, e.target)) { e.preventDefault(); e.stopPropagation(); } }, true); });
    document.addEventListener("touchend", function (e) { var tc = e.changedTouches && e.changedTouches[0]; if (!tc || fig.hidden || e.target.closest && e.target.closest(".jn-bub,.jn-x,.jn-tag,.jn-mini")) return; if (grab(tc.clientX, tc.clientY, document.elementFromPoint(tc.clientX, tc.clientY) || e.target)) { e.preventDefault(); e.stopPropagation(); unlock(); figClick(); } }, { capture: true, passive: false });
    document.addEventListener("pointermove", function (e) {
      if (hotRaf || e.pointerType === "touch") return; var x = e.clientX, y = e.clientY;
      hotRaf = requestAnimationFrame(function () { hotRaf = 0; var el = document.elementFromPoint(x, y) || document.body, h = !fig.hidden && AV.hit(x, y) && !el.closest(".jn-bub") && !seeThru(el); fig.classList.toggle("hot", h); document.documentElement.classList.toggle("jn-hot", h); });
    }, { passive: true });
  } else fig.addEventListener("click", function (e) { if (e.target.closest(".jn-x") || e.target.closest(".jn-tag")) return; unlock(); figClick(); });
  fig.querySelector(".jn-x").addEventListener("click", function (e) { e.stopPropagation(); minimise(); });
  var tag = fig.querySelector(".jn-tag");
  tag.addEventListener("click", function (e) { e.stopPropagation(); unlock(); openJ(true); });
  tag.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); unlock(); openJ(true); } });
  mini.addEventListener("click", function () { if (canStage()) { unlock(); ls("janna-min", "0"); openStage(false); } else restore(true); });
  bub.addEventListener("click", function (e) {
    unlock();
    /* the two-line peek opens into her whole bubble on a tap (on the click, so the tap never lands on the page under it) */
    if (bub.classList.contains("cpk")) { arrTouched = true; clearTimeout(settleT); bub.classList.remove("cpk", "arr"); layout(); return; }
    var b = e.target.closest("button,a");
    if (bub.classList.contains("teaser") && (!b || !b.closest(".jn-hd"))) { openJ(true); return; }
    if (!b) return;
    if (b.classList.contains("jn-cl")) { hideBub(); return; }
    if (b.classList.contains("jn-exp")) { if (!ST.flow) { hideBub(); openStage(false); } return; }
    if (b.classList.contains("jn-snd")) { soundOn = !soundOn; ls("janna-snd", soundOn ? "1" : "0"); if (!soundOn) stop(); chrome(); return; }
    if (b.classList.contains("jn-lng")) { setLang(L === "ar" ? "en" : "ar"); return; }
    if (b.classList.contains("mic")) { listen(); return; }
    if (b.classList.contains("att")) { cmPick(); return; } /* 📎 */
    var k = b.getAttribute("data-jn"), v = b.getAttribute("data-v"); if (!k) { stop(); return; }
    var label = b.textContent.replace(/[←→]/g, "").trim();
    if (k === "ans" || k === "skip") { if (ST.flow) { logT("u", label); reply(function () { flowInput(label, k === "skip" ? "skip" : v); }, rnd(250, 450)); } return; }
    if (k === "nav") { goTo(v); return; }
    if (k === "cmok") { var CMM = window.MIGCHATMEDIA; if (CMM) CMM.okSet("b"); cmOpen(); return; } /* 📎 the notice's «تمام، اختار صورة»: the picker in the same tap */
    if (k === "cmno") { show({ segs: [ln("flow.cancel")], acts: pageActs() }); return; }
    if (k === "cmf" || k === "cmm") { logT("u", label); startSearch(k === "cmf" ? "factories" : "market", v || "", ""); return; }
    if (k === "it") { var it = null; try { it = JSON.parse(v); } catch (x) {} if (it && KIND_AR[it.kind]) { logT("u", label); goItem(it.kind, it.name, it.href, it.pend); } return; }
    if (k === "qr") { showQR(); return; }
    if (k === "fcancel") { cancelFlow(); return; }
    if (k === "redo") { if (ST.flow && FLOWS[ST.flow.n]) { var fs = FLOWS[ST.flow.n].steps; for (var ri = 0; ri < fs.length; ri++) if (fs[ri].id === v) { delete ST.flow.v[v]; ST.flow.sug = ""; ST.flow.i = ri; save(); askStep(); break; } } return; }
    if (k === "fcancel2") { fillState = null; show({ segs: [ln("flow.cancel")], acts: pageActs() }); return; }
    if (k === "fedit") { show({ segs: [ln("fill.edit")], acts: [btn("fconfirm", fillState && fillState.flow === "reg" ? t("next") : t("send"), null, "ok")] }); return; }
    if (k === "fconfirm") { confirmFill(); return; }
    /* stage / tour / full access */
    if (k === "live") { liveOpen(v || ""); return; }
    if (k === "tnext" || k === "tback") { tourGo(+v); return; }
    if (k === "tend") { tourEnd(); return; }
    if (k === "tour") { tourStart(); return; }
    if (k === "sq") { var sp = String(v || "").split("|"); startSearch(SEARCH[sp[0]] ? sp[0] : "factories", sp[1] || "", sp[2] || ""); return; }
    if (k === "regfill" && ST.tour != null) { ST.tour = null; save(); }
    if (k === "regfill") tourSpot(null);
    logT("u", label);
    reply(function () {
      if (k === "reg") wiz(1); else if (k === "w2") wiz(2, v); else if (k === "w3") wiz(3, v);
      else if (k === "regfill") startFlow("reg", [], { plan: v || W.plan || "" });
      else if (k === "rfq") startFlow("rfq"); else if (k === "msg") startFlow("contact");
      else if (k === "can" || k === "home") show({ segs: [ln("can")], acts: [chip(["srch", "factories"]), chip(["srch", "tenders"]), chip(["rfq"]), chip(["msg"]), chip(["reg"])] });
      else if (k === "srch") { ST.flow = { n: "search", ent: v, ph: L === "ar" ? "مثلاً: حديد، كابلات، الشرقية…" : "e.g. steel, cables, Giza…" }; save(); show({ segs: [ln("search.ask")], acts: [btn("fcancel", t("cancel"))] }); }
      else if (k === "q") understand(v);
    }, rnd(300, 550));
  });
  /* the "what are you looking for?" mini-flow is handled here (no form behind it) */
  var flowInput0 = flowInput;
  flowInput = function (raw, chipV) {
    if (ST.flow && ST.flow.n === "search") {
      var ent = ST.flow.ent, n = N(raw); ST.flow = null; save(); chrome();
      if (CANCELW.test(n)) return show({ segs: [ln("flow.cancel")], acts: pageActs() });
      var gov = findGov(n, raw), tm = term(raw, gov) || (gov ? "" : String(raw).trim());
      return startSearch(SEARCH[ent] ? ent : "factories", tm, gov);
    }
    return flowInput0(raw, chipV);
  };
  bub.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); unlock(); var q = input.value; input.value = ""; handle(q); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !bub.hidden) hideBub(); });

  /* ====================================================================================================================
     WELCOME CARD — the first page view of a session: a compact card in a corner, clear of the page's controls; a tap expands
     it into her greeting panel with big actions (the old full-screen stage covered the whole page: retired 2026-11-18).
     ==================================================================================================================== */
  var stageEl = null, stageRep = null, stageRet = null, stageSpoke = false;
  function bassemOn() {
    try { if (window.BASSEM && typeof BASSEM.active === "function" && BASSEM.active()) return true; } catch (e) {}
    var de = document.documentElement; return de.classList.contains("bs-on") || de.hasAttribute("data-bassem");
  }
  function quietPage() { return KIOSK || !!QUIET[PAGE] || bassemOn(); }
  /* a copy of her figure (photo + eye / mouth frames) that follows AV's visemes and blinks */
  function replica() {
    var box = document.createElement("div"); box.className = "jn-rep" + (BUST ? " jn-bust" : "");
    box.innerHTML = '<div class="jn-floor"></div><div class="jn-mood"><div class="jn-bob"><div class="jn-sway"><div class="jn-breath"><div class="jn-flip' + (AV.flipped ? " on" : "") + '"></div></div></div></div></div>';
    var root = box.querySelector(".jn-flip"), eyes = null, eyesH = null, mouths = [];
    var pct = function (v, of) { return (v / of * 100).toFixed(3) + "%"; };
    var ov = function (src, r, cls) { var im = new Image(); im.className = "jn-ov " + cls; im.alt = ""; im.src = src; im.style.left = pct(r.x, REAL.w); im.style.top = pct(r.y, REAL.h); im.style.width = pct(r.w, REAL.w); im.style.height = pct(r.h, REAL.h); root.appendChild(im); return im; };
    var body = new Image(); body.className = "jn-photo"; body.alt = ""; root.appendChild(body);
    if (REAL) {
      box.style.aspectRatio = REAL.w + " / " + REAL.h; body.src = REAL.body;
      if (REAL.eyes && REAL.eyes.closed) eyes = ov(REAL.eyes.closed, REAL.eyes, "jn-eye");
      if (REAL.eyes && REAL.eyes.half) eyesH = ov(REAL.eyes.half, REAL.eyes, "jn-eye");
      ((REAL.mouth && REAL.mouth.frames) || []).forEach(function (f, i) { mouths[i] = f ? ov(f, REAL.mouth, "jn-m" + i) : null; });
    } else { box.classList.add("pic"); box.style.aspectRatio = "1 / 1"; body.src = "img/janna.jpg"; }
    var r = { el: box, ratio: REAL ? REAL.w / REAL.h : 1,
      setV: function (n) { mouths.forEach(function (m, i) { if (m) m.classList.toggle("on", i === n); }); },
      blink: function (st) { st = st === true ? 2 : st === false ? 0 : st; if (eyes) eyes.classList.toggle("on", st === 2); if (eyesH) eyesH.classList.toggle("on", st === 1); } };
    REPS.push(r); return r;
  }
  function dropReplica(r) { var i = REPS.indexOf(r); if (i > -1) REPS.splice(i, 1); }
  function stCard(k, cls, title, sub) { return '<button type="button" class="jn-st-card ' + cls + '" data-st="' + k + '"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></button>"; }
  /* the static SEO pages load her only when the visitor taps «اسأل جنة» (seo_build SEO_JS, #seoAsk[data-done]): that tap is a call
     for her (her card opens expanded and she may talk at once). An idle pre-load without any gesture on the page is no call. */
  function asked() {
    var a = document.getElementById("seoAsk"); if (!(a && a.getAttribute("data-done"))) return false;
    try { return !navigator.userActivation || !!navigator.userActivation.hasBeenActive; } catch (e) { return true; }
  }
  function wakeUnlock() { try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) unlock(); } catch (e) {} }
  var wcIv = 0, wcT = 0, wcY0 = 0, wcT0 = 0, wcIns = -1;
  /* the bottom safe-area inset (iPhone home bar): the card's bottom offset is measured above it */
  function safeBottom() {
    if (wcIns >= 0) return wcIns;
    var p = document.createElement("div"); p.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(p); wcIns = p.offsetHeight || 0; p.remove(); return wcIns;
  }
  /* floating buttons the card must leave free (WhatsApp, back to top, «Ask Janna», captions toggle, Janna Live, plan preview) */
  function floatRects() {
    var out = [], vh = window.innerHeight;
    [".wa-float", ".totop", ".ask-btn", ".mig-ccbtn", ".jnl-btn", ".planpv"].forEach(function (s) {
      [].forEach.call(document.querySelectorAll(s), function (e) {
        var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh) return;
        try { var cs = getComputedStyle(e); if (cs.visibility === "hidden" || +cs.opacity === 0 || cs.display === "none") return; } catch (x) {}
        out.push({ left: r.left - 6, right: r.right + 6, top: r.top - 6, bottom: r.bottom + 6 });
      });
    });
    return out;
  }
  /* the page's forms on screen: the card never sits on any part of a form (its title, its fields, its buttons) */
  function formRects() {
    var out = [], vw = window.innerWidth, vh = window.innerHeight;
    [].forEach.call(document.querySelectorAll("form"), function (f) {
      if (inJanna(f) || (f.closest && f.closest(NOTPAGE))) return;
      var r = f.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
      try { var cs = getComputedStyle(f); if (cs.visibility === "hidden" || cs.display === "none") return; } catch (x) {}
      out.push(r);
    });
    return out;
  }
  function wcObs(fl) { return pageCtrls().concat(formRects(), fl || floatRects()); }
  /* the page's main call to action on screen (its first visible button / call-to-action link outside the header) */
  function mainCta() {
    var vw = window.innerWidth, vh = window.innerHeight, els = document.querySelectorAll("a.btn,button.btn");
    for (var i = 0; i < els.length; i++) {
      var e = els[i]; if (inJanna(e) || (e.closest && e.closest(NOTPAGE))) continue;
      var r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      return r;
    }
    return null;
  }
  /* the corner away from the main call to action comes first; without one on screen, the end side of the page (left in Arabic,
     right in English: the hero's text and buttons start on the other side) */
  function wcSides() {
    var c = mainCta(), first = pageRTL() ? "l" : "r";
    if (c) first = (c.left + c.right) / 2 > window.innerWidth / 2 ? "l" : "r";
    return first === "l" ? ["l", "r"] : ["r", "l"];
  }
  /* the card's place: a bottom corner, clear of the page's controls, forms and floating buttons. Where one is in the way it first
     slides sideways past a floating button, then moves up into the nearest free gap (at most about a fifth of the screen), then
     tries the other corner; nowhere free → false (it is not shown: she waits in her corner). Expanded: the same corner, as tall
     as the screen allows below the header (phones: a bottom sheet, see the styles). */
  function wcPlace() {
    var st = stageEl; if (!st) return false;
    var vw = window.innerWidth, vh = window.innerHeight, phone = isPhone(), big = st.classList.contains("big"), m = phone ? 10 : 16, sb = safeBottom();
    if (big && phone) { st.style.left = ""; st.style.right = ""; st.style.width = ""; st.style.removeProperty("--wb"); st.style.removeProperty("--wmh"); return true; }
    var put = function (side, off, w) { st.style.width = w + "px"; if (side === "l") { st.style.left = off + "px"; st.style.right = "auto"; } else { st.style.right = off + "px"; st.style.left = "auto"; } };
    if (big) {
      var bw = Math.min(420, vw - 2 * m), bs = st.getAttribute("data-side") || wcSides()[0], bo = Math.min(+st.getAttribute("data-off") || m, vw - bw - m);
      put(bs, Math.max(m, bo), bw); st.style.setProperty("--wb", m + "px"); st.style.setProperty("--wmh", Math.max(260, vh - clearTop() - m - sb - 8) + "px"); return true;
    }
    var fl = floatRects(), obs = wcObs(fl), sides = wcSides(), best = null, ct = clearTop();
    st.style.setProperty("--wb", m + "px");
    for (var i = 0; i < sides.length && !(best && best.clear); i++) {
      var side = sides[i], offs = [m];
      /* past the floating buttons standing in this corner */
      var push = 0; fl.forEach(function (f) { if (f.bottom > vh - 150 && (side === "l" ? f.left < vw / 2 : f.right > vw / 2)) push = Math.max(push, side === "l" ? f.right : vw - f.left); });
      if (push > m) offs.push(Math.round(push + 4));
      for (var j = 0; j < offs.length; j++) {
        var w = Math.min(phone ? 340 : 380, vw - offs[j] - m); if (w < (phone ? 240 : 280)) continue;
        put(side, offs[j], w);
        var h = st.offsetHeight, x0 = side === "l" ? offs[j] : vw - offs[j] - w, r = { left: x0, right: x0 + w, top: vh - sb - m - h, bottom: vh - sb - m };
        var clear = !crosses(r, obs), top = clear ? r.top : liftClear(r, obs, Math.max(ct, r.top - vh * (phone ? .2 : .22)), 8);
        if (top == null) continue;
        if (!best || clear || top > best.top + 1) best = { side: side, off: offs[j], w: w, h: h, top: top, clear: clear };
        if (clear) break;
      }
    }
    if (!best) return false;
    put(best.side, best.off, best.w); st.setAttribute("data-side", best.side); st.setAttribute("data-off", String(best.off));
    st.style.setProperty("--wb", Math.max(m, Math.round(vh - sb - best.top - best.h)) + "px");
    return true;
  }
  /* while the compact card waits: the page may move a control under it (a rotating hero, late images) — it finds a free place
     again, or steps into her corner */
  function wcWatch() {
    var st = stageEl; if (!st || st.classList.contains("big")) { clearInterval(wcIv); wcIv = 0; return; }
    if (Date.now() - wcT0 > 45000) { clearInterval(wcIv); wcIv = 0; }
    if (document.documentElement.classList.contains("nav-open") || st.classList.contains("out")) return;
    if (!crosses(st.getBoundingClientRect(), wcObs())) return;
    if (!wcPlace()) closeStage(false);
  }
  function wcBig(focus) {
    var st = stageEl; if (!st || st.classList.contains("big")) return;
    clearInterval(wcIv); wcIv = 0; st.classList.add("big");
    var hd = st.querySelector(".jn-wc-hd"); hd.removeAttribute("role"); hd.removeAttribute("tabindex"); hd.removeAttribute("aria-label");
    st.setAttribute("aria-labelledby", "jn-st-h");
    if (!stageRep) { stageRep = replica(); var sf = st.querySelector(".jn-st-fig"); sf.appendChild(stageRep.el); sf.style.aspectRatio = String(stageRep.ratio); sf.style.setProperty("--ar", String(stageRep.ratio)); }
    document.documentElement.classList.add("jn-staged");
    wcPlace(); st.scrollTop = 0;
    if (focus) setTimeout(function () { try { var f = st.querySelector(".jn-wc-body .jn-st-hear") || st.querySelector(".jn-st-card"); if (f && stageEl === st) f.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  /* no free corner for the compact card: she waits in her corner (her round headshot waves once) — a tap there opens the card */
  function wcNoRoom() {
    var st = stageEl; stageEl = null; clearInterval(wcIv); wcIv = 0; if (st) st.remove();
    document.documentElement.classList.remove("jn-wcon", "jn-staged"); layout(); cornerRule(); ghostSoon();
    if (!mini.hidden) { mini.classList.add("jn-hi"); setTimeout(function () { mini.classList.remove("jn-hi"); }, 6000); }
  }
  /* auto: the session's first page view → the compact card (she talks after the visitor's first tap); otherwise (the visitor called
     her from her corner; big: asked for her on an SEO page) the card opens expanded and she talks at once */
  function openStage(auto, big) {
    if (stageEl || quietPage()) return false;
    stop(); stopTyping(); clearTimeout(settleT); fig.classList.remove("jn-come");
    if (!bub.hidden) { bub.hidden = true; beam.hidden = true; fig.classList.remove("jn-open"); ST.open = false; }
    var ts0 = ls("janna-stage-ts");
    tourSpot(null); ss("janna-stage", "1"); ls("janna-stage-ts", String(Date.now())); ls("janna-min", "0"); stageSpoke = false; miniHi = false;
    stageRet = document.activeElement;
    var open = !auto || !!big, hs = REAL && REAL.headshot ? REAL.headshot : "img/janna.jpg";
    var st = document.createElement("section"); st.className = "jn-stage jn-wc jn-st-pan"; st.setAttribute("role", "dialog"); st.setAttribute("aria-modal", "false");
    st.setAttribute("aria-labelledby", "jn-wc-h"); st.setAttribute("translate", "no"); st.dir = L === "ar" ? "rtl" : "ltr"; st.lang = L;
    var live = liveOn() && typeof JANNA_LIVE.open === "function", meetOk = live && liveIntent("meeting");
    st.innerHTML = '<button type="button" class="jn-st-x" data-st="close" aria-label="' + esc(t("close")) + '" title="' + esc(t("close")) + '">✕</button>'
      + '<div class="jn-wc-hd" data-st="open" role="button" tabindex="0" aria-label="' + esc(t("wcOpen")) + '">'
      + '<div class="jn-wc-av" aria-hidden="true"><img src="' + esc(hs) + '" alt="" width="52" height="52" decoding="async"><i></i></div>'
      + '<div class="jn-st-fig" aria-hidden="true"></div>'
      + '<div class="jn-wc-tx jn-wc-sm"><b id="jn-wc-h">' + esc(t("wcHi")) + '</b><small class="d">' + esc(t("wcSub")) + '</small><small class="p">' + esc(t("wcTap")) + "</small></div>"
      + '<div class="jn-wc-tx jn-wc-lg"><span class="jn-st-tag"><i aria-hidden="true"></i>' + esc(t("name")) + " · " + esc(t("stRole")) + " · " + esc(t("stOnline")) + "</span>"
      + '<h2 id="jn-st-h">' + esc(auto ? t("stHi") : t("name") + " 👋") + '</h2><p class="jn-st-me">' + esc(t("stMe")) + "</p></div></div>"
      + '<button type="button" class="jn-wc-hr" data-st="hear">' + esc(t("stHear")) + "</button>"
      + '<div class="jn-wc-body"><p class="jn-st-val">' + esc(t("stVal")) + "</p>"
      + '<button type="button" class="jn-st-hear' + (unlocked ? " on" : "") + '" data-st="hear"><span>' + esc(unlocked ? t("stReplay") : t("stHear")) + "</span>" + (unlocked ? "" : "<small>" + esc(t("stHearSub")) + "</small>") + "</button>"
      + '<div class="jn-st-grid">'
      /* one live card until Janna Live can be told to start the intro meeting itself (JANNA_LIVE.intents): in the call she
         starts the meeting when the visitor asks for it */
      + (meetOk ? stCard("video", "live", t("stVideo"), t("stVideoS")) + stCard("meet", "live", t("stMeet"), t("stMeetS")) : live ? stCard("video", "live wide", t("stLive"), t("stLiveS")) : "")
      + stCard("tour", "", t("stTour"), t("stTourS")) + stCard("reg", "pri", t("stReg"), t("stRegS"))
      + stCard("find", "wide", t("stFind"), t("stFindS")) + "</div>"
      + '<form class="jn-st-in"><input type="text" autocomplete="off" enterkeyhint="send" placeholder="' + esc(t("stAsk")) + '" aria-label="' + esc(t("stAsk")) + '"><button type="submit" aria-label="send">➤</button></form>'
      + '<button type="button" class="jn-st-alone" data-st="alone">' + esc(t("stAlone")) + "</button></div>";
    document.body.appendChild(st); stageEl = st;
    fig.hidden = true; mini.hidden = true; beam.hidden = true;
    document.documentElement.classList.add("jn-wcon");
    st.addEventListener("click", stageClick);
    st.addEventListener("keydown", stageKey);
    st.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); var q = st.querySelector("input").value.trim(); if (!q) return; unlock();
      closeStage(false, function () { handle(q); });
    });
    wcY0 = window.scrollY || 0; wcT0 = Date.now();
    if (open) wcBig(true);
    else if (!wcPlace()) { ss("janna-stage", null); ls("janna-stage-ts", ts0 || "0"); wcNoRoom(); logT("j", "stage:corner"); return false; }
    else wcIv = setInterval(wcWatch, 1200);
    st.classList.add("in");
    /* the visitor called her (a tap): she talks straight away; on her own arrival she waits for the visitor's tap */
    if (open && (unlocked || !auto)) setTimeout(function () { if (stageEl === st && !stageSpoke) stageSpeak(auto ? "stage.hello" : "stage.again"); }, RM ? 150 : 650);
    logT("j", "stage");
    return true;
  }
  function stageSpeak(id) {
    if (!stageEl) return; unlock(); stageSpoke = true;
    var h = stageEl.querySelector(".jn-st-hear"); if (h) { h.classList.add("on"); h.innerHTML = "<span>" + esc(t("stReplay")) + "</span>"; }
    var s = ln(id || "stage.hello"); setMood(s.m); say([s]);
  }
  function stageClick(e) {
    var st = stageEl; if (!st) return; var b = e.target.closest("[data-st]"), big = st.classList.contains("big"); unlock();
    if (!b) { if (big && !e.target.closest("input,button,a,form") && !stageSpoke) stageSpeak("stage.hello"); return; }
    var k = b.getAttribute("data-st");
    /* the compact card: a tap on her face, her hello or «🔊 hear me» opens it and she talks (the tap allows the voice) */
    if (k === "open") { if (!big) { wcBig(true); stageSpeak("stage.hello"); } else if (!stageSpoke) stageSpeak("stage.hello"); return; }
    if (k === "hear") { if (!big) wcBig(true); return stageSpeak("stage.hello"); }
    if (k === "close") return closeStage(big);
    if (k === "alone") return closeStage(true);
    logT("u", b.textContent);
    if (k === "video") return closeStage(false, function () { liveOpen(""); });
    if (k === "meet") return closeStage(false, function () { liveOpen("meeting"); });
    if (k === "tour") return closeStage(false, function () { tourStart(); });
    if (k === "reg") return closeStage(false, function () { reply(function () { wiz(1); }, 300); });
    if (k === "find") return closeStage(false, function () { findMenu(); });
  }
  function findMenu() {
    show({ segs: [ln("stage.search")], acts: [chip(["srch", "factories"]), chip(["srch", "tenders"]), chip(["srch", "offers"]), chip(["srch", "market"]), chip(["srch", "rfqs"])] });
  }
  /* keyboard: Esc closes; Enter / Space on the compact card opens it (the card is not modal: Tab moves on to the page) */
  function stageKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeStage(false); return; }
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("jn-wc-hd") && stageEl && !stageEl.classList.contains("big")) { e.preventDefault(); unlock(); wcBig(true); stageSpeak("stage.hello"); }
  }
  /* the card makes way for the page: scrolling on (the compact card), a page field taking the focus (phones: the keyboard would
     lift the card onto it), a tap beside the expanded sheet (phones), Esc anywhere while it is expanded */
  window.addEventListener("scroll", function () {
    var st = stageEl; if (!st || st.classList.contains("big") || st.classList.contains("out")) return;
    if (Math.abs((window.scrollY || 0) - wcY0) > 240) { closeStage(false); return; }
    clearTimeout(wcT); wcT = setTimeout(wcWatch, 160);
  }, { passive: true });
  window.addEventListener("resize", function () { wcIns = -1; var st = stageEl; if (!st || st.classList.contains("out")) return; clearTimeout(wcT); wcT = setTimeout(function () { if (stageEl === st && !wcPlace()) closeStage(false); }, 120); });
  document.addEventListener("focusin", function (e) { var st = stageEl; if (!st || inJanna(e.target) || !isField(e.target)) return; if (!st.classList.contains("big") || isPhone()) closeStage(false); }, true);
  document.addEventListener("pointerdown", function (e) { var st = stageEl; if (!st || !st.classList.contains("big") || !isPhone() || inJanna(e.target)) return; closeStage(false); }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && stageEl && stageEl.classList.contains("big") && !stageEl.contains(e.target)) closeStage(false); });
  /* she leaves the card by shrinking into her corner (her standing figure, or the round headshot on phones) */
  function closeStage(hello, then) {
    if (!stageEl) return; var st = stageEl, rep = stageRep; stageEl = null; stageRep = null; stop();
    clearInterval(wcIv); wcIv = 0; clearTimeout(wcT);
    document.documentElement.classList.remove("jn-staged", "jn-wcon");
    var hadFocus = st.contains(document.activeElement);
    /* desktop: where her standing figure would sit on the page's controls (a hero counter, a search box, a form), she shrinks
       into her round headshot instead (the corner rule, see cornerRule) */
    miniHi = !then && !isPhone() && !KIOSK && figBlocks();
    var toMini = isPhone() || miniHi, tgt = toMini ? mini : fig; fig.hidden = toMini; mini.hidden = !toMini; fig.classList.remove("jn-open"); layout();
    var fin = function () {
      tgt.style.visibility = ""; if (rep) dropReplica(rep); st.remove();
      try { if (hadFocus && stageRet && stageRet.focus && document.contains(stageRet) && stageRet !== document.body) stageRet.focus({ preventScroll: true }); } catch (e) {}
      layout(); ghostSoon();
      if (then) then(); else if (hello) dockHello();
    };
    if (RM) return fin();
    var sr = st.getBoundingClientRect(), tr = (toMini ? mini : fig.querySelector(".jn-photo") || fig).getBoundingClientRect();
    if (!sr.width || !tr.width) return fin();
    tgt.style.visibility = "hidden"; st.classList.add("out");
    st.style.animation = "none"; st.style.transformOrigin = "0 0"; st.style.transition = "transform .55s cubic-bezier(.55,0,.25,1), opacity .5s ease";
    void st.offsetWidth;
    var sc = Math.max(.06, Math.min(1, tr.width / sr.width, tr.height / sr.height));
    st.style.transform = "translate(" + Math.round(tr.left - sr.left) + "px," + Math.round(tr.top - sr.top) + "px) scale(" + sc.toFixed(3) + ")"; st.style.opacity = "0";
    setTimeout(fin, 560);
  }
  function dockHello() {
    /* only where it covers none of the page's controls (on phones a two-line peek when the sheet would); else no hello at all */
    var pl = helloPlan(false); if (!pl) { if (miniHi) { miniHi = false; layout(); } ghostSoon(); return; }
    peekW = pl.w || 340;
    show({ segs: [ln("stage.dock")], peek: true, fleeting: true, mini: true, cpk: pl.cpk, acts: [chip(["live"]), chip(["tour"]), chip(["srch", "factories"])] });
    autoSettle(6500, 9000);
  }
  /* Janna Live declares the intents it understands: JANNA_LIVE.intents = ["meeting", …] (or {meeting: true}) */
  /* Janna Live is on this page and the owner has not switched her live calls off («🛠️ المطوّر», data/flags.js) */
  function liveOn() { var F = window.MIGFLAGS; return !!window.JANNA_LIVE && !(F && F.on && F.on("janna_live") === false); }
  function liveIntent(k) { var sup = window.JANNA_LIVE && JANNA_LIVE.intents; return !!(sup && (sup === true || sup[k] === true || (typeof sup.indexOf === "function" && sup.indexOf(k) > -1))); }
  /* live video (data/janna-live.js): her own screen with the platform; «meeting» asks her to start the intro meeting */
  function liveOpen(intent) {
    var JL = window.JANNA_LIVE;
    if (!JL || typeof JL.open !== "function") { show({ segs: [ln("live.none")], acts: [btn("msg", t("msg"), null, "pri"), chip(["can"])] }); return false; }
    var o = { persona: "janna" };
    if (intent && liveIntent(intent)) o.intent = intent;
    ST.open = false; save(); stop(); stopTyping(); if (!bub.hidden) hideBub();
    logT("j", "live:" + (intent || "video"));
    try { JL.open(o); } catch (e) { try { JL.open(); } catch (x) {} }
    return true;
  }

  /* ====================================================================================================================
     PAGE ARRIVALS — on later page views she steps forward for a few seconds, says what the page is, then settles back.
     ==================================================================================================================== */
  var acted = false, settleT = 0, arrTouched = false;
  function inJanna(el) { return !!(el && el.closest && el.closest(".jn-bub,.jn-stage,.jn-fig,.jn-mini,.jnl")); }
  function isField(el) { return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); }
  function formBusy() { var a = document.activeElement; return isField(a) && !inJanna(a); }
  ["wheel", "touchmove", "keydown"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (!inJanna(e.target)) acted = true; }, { capture: true, passive: true }); });
  document.addEventListener("focusin", function (e) { if (isField(e.target) && !inJanna(e.target)) { acted = true; if (fig.classList.contains("jn-come")) settle(); } }, true);
  /* the visitor engaged with an arrival bubble: it stays, and the input row comes back */
  var engage = function () { arrTouched = true; clearTimeout(settleT); if (bub.classList.contains("arr") && !bub.classList.contains("cpk")) { bub.classList.remove("arr"); layout(); } };
  bub.addEventListener("pointerdown", engage); bub.addEventListener("focusin", engage);
  function regionLine() { var code = PAGE === "region" ? (location.hash || "").slice(1).toUpperCase() : ""; return code && GOV.some(function (g) { return g[0] === code; }) ? ln("region.one", { name: govName(code) }) : null; }
  function arrive() {
    var key = "janna-arr:" + PAGE; if (ss(key)) { ghostSoon(); return; } ss(key, "1");
    setTimeout(function () {
      if (acted || formBusy() || !bub.hidden || stageEl || ST.flow || fillState || ST.tour != null || quietPage() || ls("janna-min") === "1" || window.scrollY > 240) { ghostSoon(); return; }
      /* she never steps over the page's forms: the larger figure only where it covers no field, else her normal size,
         else (the bubble itself would sit on a field) no arrival at all */
      var plan = arrivalPlan(); if (!plan) { ghostSoon(); return; }
      var hello = function () {
        arrTouched = false;
        peekW = plan.w || 340;
        show({ segs: [regionLine() || ln("intro." + pkey())], peek: true, fleeting: true, mini: plan.mini, cpk: plan.cpk, acts: pageActs().slice(0, 3) });
        autoSettle(6500, 8000);
      };
      if (plan.big) comeForward(hello); else hello();
    }, 1300);
  }
  /* the page's visible form fields (inputs, selects, text areas) */
  function pageFields() {
    var out = [], vw = window.innerWidth, vh = window.innerHeight;
    [].forEach.call(document.querySelectorAll("input,select,textarea"), function (e) {
      if (inJanna(e) || e.type === "hidden" || (e.closest && e.closest(".jnl,.bs-bub,.bs-wel"))) return;
      var r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
      try { var cs = getComputedStyle(e); if (cs.visibility === "hidden" || +cs.opacity === 0) return; } catch (x) {}
      out.push(r);
    });
    return out;
  }
  function crosses(a, list) { return list.some(function (r) { return !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom); }); }
  /* where the arrival would put her figure and her bubble (predicted before anything moves) → {big, mini} or null */
  function arrivalPlan() { return helloPlan(true); }
  /* the same for every fleeting hello (allowBig: the page arrival may bring her forward larger; the dock hello never does). The
     page's controls (fields, buttons, call-to-action links, hero chips and counters) are never covered by it. */
  function helloPlan(allowBig) {
    if (KIOSK) return { big: false };
    var vw = window.innerWidth, vh = window.innerHeight, obs = pageCtrls(), H = 230, minTop = clearTop();
    if (isPhone()) {
      /* phones: the round headshot in the corner and a compact sheet just above it — or, where that sheet would cover one of the
         page's controls (the hero's calls to action, its chips), a two-line peek in the headshot's row; neither fits → no hello */
      if (mini.hidden) { fig.hidden = true; mini.hidden = false; layout(); }
      var mt = mini.getBoundingClientRect().top || vh - 70, sh = { left: 8, right: vw - 8, bottom: mt - 6, top: mt - 6 - 210 };
      if (!crosses(sh, obs)) return { mini: true };
      var pb = peekBox(); return pb && !crosses(pb, obs) ? { mini: true, cpk: true } : null;
    }
    /* desktop: where her standing figure would sit on a control (a hero counter, a search box), the hello comes from her round
       headshot, its panel above it moved up until clear; no clear place → no hello (she stays the see-through figure) */
    if (!miniHi && fig.hidden) { fig.hidden = false; mini.hidden = true; layout(); }
    if (miniHi || figOn(obs)) {
      miniHi = true; fig.hidden = true; mini.hidden = false; layout();
      var mb = mpBox(H); if (freeSpot(mb.left, mb.right, mb.bottom, H, obs, minTop, 150)) return { mini: true };
      dock(false); layout(); ghostCheck(); return null;
    }
    var fr = fig.getBoundingClientRect(); if (!fr.width) return null;
    var F = AV.finger(), gap = 22;
    var bubAt = function (fx, bw, bh) { var w = Math.min(bw || 340, fx - gap - 16); return { left: fx - gap - w, right: fx - gap, top: vh - 12 - (bh || H), bottom: vh - 12 }; };
    if (allowBig) {
      var s = 1.3, big = { left: fr.right - fr.width * s, right: fr.right, top: fr.bottom - fr.height * s, bottom: fr.bottom };
      var bfx = fr.right - (fr.right - F.x) * s;
      if (!crosses(big, obs) && !crosses(bubAt(bfx), obs)) return { big: true };
    }
    if (!crosses(bubAt(F.x), obs)) return { big: false };
    /* the bust is wider than the old standing figure: a narrower (taller) bubble may still clear a form beside her */
    if (BUST && !crosses(bubAt(F.x, 280, 290), obs)) return { big: false, w: 280 };
    /* else the bubble moves up until it is clear of them (layout() lifts it the same way, with its real height) */
    var ba = bubAt(F.x); if (freeSpot(ba.left, ba.right, ba.bottom, H, obs, minTop, 150)) return { big: false };
    return null;
  }
  function comeForward(cb) { if (KIOSK) return cb(); fig.hidden = false; mini.hidden = true; fig.classList.add("jn-come"); layout(); setTimeout(cb, RM ? 0 : 700); }
  /* after ms (and once she stopped talking) the peek bubble closes and she goes back to her corner, unless the visitor engaged */
  function autoSettle(ms, cap) {
    clearTimeout(settleT); arrTouched = false; var t0 = Date.now();
    var tick = function () {
      if (arrTouched || bub.hidden || ST.flow || fillState || ST.tour != null || !bub.classList.contains("peek")) return;
      if (busy() && Date.now() - t0 < (cap || 14000)) { settleT = setTimeout(tick, 900); return; }
      settle();
    };
    settleT = setTimeout(tick, ms);
  }
  function settle() { clearTimeout(settleT); if (!bub.hidden && bub.classList.contains("peek") && !ST.flow && !fillState) hideBub(); fig.classList.remove("jn-come"); setTimeout(layout, 650); }

  /* ====================================================================================================================
     GUIDED TOUR — 8 steps over 5 pages; each step spotlights a real element and she explains it.
     ==================================================================================================================== */
  var TOUR = [
    { p: "home", s: ["section.hero h1", "h1"], up: 1, l: "tour.home" },
    { p: "home", s: ["#sbox"], l: "tour.search" },
    { p: "factories", s: [".tools2", "#q"], l: "tour.factories" },
    { p: "tenders", s: ["#olK", "#olQ"], l: "tour.tenders" },
    { p: "rfqs", s: ["#olL", "#olK"], l: "tour.rfqs" },
    { p: "export-market", s: ["#mk4", "#mhero"], l: "tour.export" },
    { p: "register", s: ["#plansGrid", "#plans"], l: "tour.plans" },
    { p: "register", s: ["#regF .stp.on", "#regF", "#form"], l: "tour.form" }
  ];
  var spot = null, spotEl = null, spotRaf = 0, spotTok = 0, tourAt = null, spotEndT = 0;
  /* the step's element (first selector that is on screen); up: its parent block (e.g. the hero's text column) */
  function tourEl(stp) { for (var i = 0; i < stp.s.length; i++) { var e = document.querySelector(stp.s[i]); if (e && e.getBoundingClientRect().height > 10) return stp.up && e.parentElement && e.parentElement !== document.body ? e.parentElement : e; } return null; }
  function tourSpot(el) {
    spotEl = el || null;
    if (!el) { tourAt = null; if (spot) spot.hidden = true; if (!bub.hidden) layout(); return; }
    if (!spot) { spot = document.createElement("div"); spot.className = "jn-spot"; spot.setAttribute("aria-hidden", "true"); document.body.appendChild(spot); }
    spot.hidden = false; layout(); placeSpot();
  }
  function placeSpot() {
    if (!spot || !spotEl) return;
    var o = spotR(); if (!o) { spot.style.opacity = "0"; return; }
    var top = o.top, bot = o.bottom, left = o.left, right = o.right;
    /* still under the bubble (an element taller than the free part of the screen): show the part the bubble leaves free */
    if (!bub.hidden) {
      var br = bub.getBoundingClientRect();
      if (br.width && !(br.right <= left || br.left >= right || br.bottom <= top || br.top >= bot)) {
        if (br.top - 10 - top >= bot - (br.bottom + 10)) bot = Math.min(bot, br.top - 10); else top = Math.max(top, br.bottom + 10);
      }
    }
    if (bot - top < 16) { spot.style.opacity = "0"; return; }
    spot.style.opacity = ""; spot.style.top = top + "px"; spot.style.left = left + "px"; spot.style.width = (right - left) + "px"; spot.style.height = (bot - top) + "px";
  }
  ["scroll", "resize"].forEach(function (ev) { window.addEventListener(ev, function () {
    if (!spotEl) return;
    if (!spotRaf) spotRaf = requestAnimationFrame(function () { spotRaf = 0; placeSpot(); });
    /* once the page stops moving, the bubble finds its free place again */
    clearTimeout(spotEndT); spotEndT = setTimeout(function () { if (spotEl && !bub.hidden) { layout(); placeSpot(); } }, 180);
  }, { passive: true }); });
  /* the bottom of the site's sticky header (the tour scrolls each element just below it) */
  function headerBottom() {
    /* a sticky header ends up at its own «top» offset once the page scrolls, a fixed one stays where it is */
    var b = 0; [].forEach.call(document.querySelectorAll("header,.site-hdr,nav"), function (e) { try { var cs = getComputedStyle(e); if (cs.position !== "fixed" && cs.position !== "sticky") return; var r = e.getBoundingClientRect(), y = cs.position === "sticky" ? (parseFloat(cs.top) || 0) + r.height : r.bottom; if (r.height && y > b && y < window.innerHeight * .3) b = y; } catch (x) {} });
    return b;
  }
  function tourStart() {
    ST.flow = null; fillState = null; save();
    /* the hologram has no pages to walk through: the tour starts on the visitor's phone (QR with the tour hand-over) */
    if (KIOSK) { show({ segs: [ln("kiosk.tour")], acts: [btn("home", t("can"))] }); showQR(abs("home.html") + "#janna=" + b64(JSON.stringify({ kind: "tour", i: 0 }))); return; }
    tourGo(0, [ln("tour.start")]);
  }
  function tourGo(i, pre) {
    if (i < 0 || i >= TOUR.length) return tourEnd();
    ST.tour = i; save(); var stp = TOUR[i];
    if (stp.p === PAGE) return tourShow(i, pre);
    tourSpot(null);
    goTo(stp.p + ".html", { kind: "tour", i: i }, (pre || []).concat([ln("nav.go", { name: nameOf(stp.p) })]));
  }
  function tourShow(i, pre) {
    var stp = TOUR[i], el = tourEl(stp), last = i === TOUR.length - 1; ST.tour = i; save();
    var tok = ++spotTok; if (spot) spot.hidden = true; spotEl = null; tourAt = el;
    var acts = [];
    if (last) acts.push(btn("regfill", "✍️ " + t("regfill"), "", "pri"), chip(["live"]));
    else acts.push(btn("tnext", t("tNext"), i + 1, "pri"));
    if (i > 0) acts.push(btn("tback", t("tBack"), i - 1));
    acts.push(btn("tend", t("tEnd")));
    var pctDone = Math.round((i + 1) / TOUR.length * 100);
    /* her bubble docks to the bottom (on phones from her headshot), then the element is scrolled into the free part above it */
    show({ segs: (pre || []).concat([ln(stp.l)]), mini: true, acts: acts, html: '<div class="jn-tstep">' + esc(t("tStep")) + " " + (i + 1) + "/" + TOUR.length + '<i><b style="width:' + pctDone + '%"></b></i></div>' });
    if (el) {
      try {
        var r = el.getBoundingClientRect(), y = r.top + window.scrollY, h = r.height, vh = window.innerHeight, br = bub.getBoundingClientRect();
        var b0 = headerBottom() + 14, b1 = (br.width && br.left < r.right && br.right > r.left ? br.top : vh) - 16;
        var to = h <= b1 - b0 ? y - b0 - (b1 - b0 - h) / 2 : y - b0;
        window.scrollTo({ top: Math.max(0, to), behavior: RM ? "auto" : "smooth" });
      } catch (e) {}
      setTimeout(function () { if (tok === spotTok && tourAt === el) tourSpot(el); }, RM ? 30 : 560);
    } else tourSpot(null);
    if (last) { ST.tour = null; save(); } /* the last step stays on screen, the tour itself is over */
  }
  function tourEnd(quiet) { ST.tour = null; save(); spotTok++; tourSpot(null); if (!quiet) show({ segs: [ln("tour.end")], acts: pageActs() }); }
  function tourResume() {
    var i = ST.tour; if (i == null || !TOUR[i]) { ST.tour = null; save(); return false; }
    if (TOUR[i].p === PAGE) { setTimeout(function () { tourShow(i); }, 700); return true; }
    setTimeout(function () { show({ segs: [ln("tour.resume")], acts: [btn("tnext", t("tCont"), i, "pri"), btn("tend", t("tEnd"))] }); }, 900);
    return true;
  }

  /* ====================================================================================================================
     FULL ACCESS — items by name or reference, live counts, the current page, plan comparison.
     Data files a page did not load are fetched on demand with the same cache-busting token as this file.
     ==================================================================================================================== */
  var DV = (function () { var s = document.querySelector('script[src*="data/janna.js"]'), m = s && /[?&]v=([\w.-]+)/.exec(s.src); return m ? m[1] : ""; })();
  var DATA = {
    oldfac: function () { return window.MIGOLDFAC; }, facx: function () { return window.MIGFACX; }, oldtend: function () { return window.MIGTEND; },
    oldrfq: function () { return window.MIGRFQ; }, offers: function () { return window.MIGOFFERS; }, zones: function () { return window.MIGZONES; },
    projects: function () { return window.MIG && MIG.PROJECTS; }, real: function () { return window.REAL; },
    /* the governorates (city text → governorate code): every page counts by the same rule (the kiosk page does not load it) */
    regions: function () { return window.MIGREG; }, factories: function () { return window.MIGFAC; }
  };
  var LOADS = {};
  function need(list, cb) {
    /* members-only opportunities (data/opp-full.js): a member's details go back into the data files loaded here, a visitor keeps the teasers */
    var left = 0, fired = false, fin = function () { if (fired) return; fired = true; try { if (window.MIGOPP) MIGOPP.patch(); } catch (e) {} cb(); };
    list.forEach(function (k) {
      if (!DATA[k] || DATA[k]()) return;
      var sc = LOADS[k]; if (sc && sc.done) return;
      left++;
      if (!sc) {
        sc = document.createElement("script"); sc.src = "data/" + k + ".js" + (DV ? "?v=" + DV : ""); sc.charset = "utf-8"; sc.async = true; LOADS[k] = sc;
        sc.addEventListener("load", function () { sc.done = true; }); sc.addEventListener("error", function () { sc.done = true; });
        document.head.appendChild(sc);
      }
      var one = function () { if (--left <= 0) fin(); };
      sc.addEventListener("load", one); sc.addEventListener("error", one);
    });
    if (!left) return fin();
    setTimeout(fin, 15000);
  }
  /* the companies as factories.html counts them: facx.js merges MIGFAC (factories.js) and needs the governorates first; a page
     that loaded facx.js without them (the kiosk) gets it built again once they are there */
  function needFac(cb) {
    var done = false, fin = function () { if (!done) { done = true; cb(); } };
    need(["regions", "factories", "oldfac", "facx"], function () {
      var X = window.MIGFACX, F = window.MIGFAC || [];
      if (X && X.list && F.every(function (f) { return X.list.some(function (x) { return x[0] === f.name_ar; }); })) return fin();
      var sc = document.createElement("script"); sc.src = "data/facx.js?v=" + (DV || "1") + "&all=1"; sc.charset = "utf-8"; sc.onload = sc.onerror = fin; document.head.appendChild(sc);
      setTimeout(fin, 15000);
    });
  }
  /* "show it in English" for a data string (the site's own translation table) */
  function trd(s) { s = String(s == null ? "" : s); try { return L === "en" && window.MIGTR ? String(MIGTR(s)) : s; } catch (e) { return s; } }
  /* fuzzy match of the visitor's words against a name: share of the query words found (prefix-tolerant), bonus for the phrase */
  var GENERIC = { "شركه": 1, "مصنع": 1, "مصانع": 1, "مجموعه": 1, "مؤسسه": 1, "ملف": 1, "بروفايل": 1, "صفحه": 1, "منشاه": 1, "company": 1, "factory": 1, "group": 1, "profile": 1, "page": 1, "co": 1, "ltd": 1, "the": 1 };
  function qtoks(s) { return N(s).split(" ").map(function (w) { return base(w); }).filter(function (w, i, a) { return w.length > 1 && !GENERIC[w] && !STOP[w] && a.indexOf(w) === i; }); }
  function fuzzy(qt, text) {
    var n = N(text); if (!qt.length || !n) return 0;
    var nt = n.split(" ").map(base), hit = 0;
    qt.forEach(function (q) { if (nt.some(function (w) { return w === q || (q.length >= 3 && w.length >= 3 && (w.indexOf(q) === 0 || q.indexOf(w) === 0)) || (q.length >= 4 && w.indexOf(q) > -1); })) hit++; });
    var sc = hit / qt.length; if (!sc) return 0;
    if (n.indexOf(qt.join(" ")) > -1) sc += .3;
    return sc - Math.min(.25, Math.max(0, nt.length - qt.length) * .015);
  }
  function ranked(list, qt, textOf, min) {
    var out = []; (list || []).forEach(function (x, i) { var s = fuzzy(qt, textOf(x, i)); if (s >= (min || .74)) out.push({ x: x, i: i, s: s }); });
    return out.sort(function (a, b) { return b.s - a.s; });
  }
  /* one clear winner, or a short list to choose from */
  function pick(res) { if (!res.length) return null; if (res.length === 1 || res[0].s - res[1].s >= .2) return res[0]; return false; }
  function itemList(res, nameOf, hrefOf, q, ent) {
    var seen = {}, acts = []; q = orig(q);
    res.forEach(function (r) { var nm = nameOf(r), k = N(nm), h = hrefOf(r), lb = nm.length > 46 ? nm.slice(0, 44) + "…" : nm; if (acts.length >= 4 || seen[k]) return; seen[k] = 1; acts.push(typeof h === "string" ? linkBtn(lb, h) : btn("it", lb + (L === "ar" ? " ←" : " →"), JSON.stringify(h))); });
    if (ent) acts.push(btn("sq", "🔎 " + t("srch." + ent), ent + "|" + q + "|"));
    show({ segs: [ln("item.many", { q: q })], acts: acts });
  }
  function noItem(q, ent) {
    q = orig(q); var c = SEARCH[ent], what = c ? (L === "ar" ? c.ar : c.en) : nameOf(ent);
    show({ segs: [ln("item.none", { q: q, what: what })], acts: [c ? btn("sq", "🔎 " + t("srch." + ent), ent + "|" + q + "|", "pri") : linkBtn(nameOf(ent), ent + ".html", true), chip(["can"])] });
  }
  var KIND_AR = { company: ["ملف", "the profile of"], tender: ["المناقصة", "the tender"], rfq: ["طلب السعر", "the RFQ"], news: ["الخبر", "the story"], event: ["المعرض", "the event"], offer: ["العرض", "the offer"], zone: ["صفحة", "the page of"] };
  function goItem(kind, name, href, pend) {
    var what = KIND_AR[kind][L === "ar" ? 0 : 1].replace(/ of$/, ""), nm = String(name || "");
    /* a long title (news) is not read out before leaving: a short line, then the page */
    var line = nm.length > 42 ? ln("item.go1", { what: what }) : ln("item.go", { what: what, name: nm });
    goTo(href, pend || null, [line], null, L === "ar" ? what + " «" + (nm.length > 60 ? nm.slice(0, 58) + "…" : nm) + "»" : what + " “" + (nm.length > 60 ? nm.slice(0, 58) + "…" : nm) + "”");
  }

  /* companies: the platform's members (MIGOLDFAC → company.html#i) and researched factories (MIGFACX → company.html#x<i>) */
  /* the directory's own name key (factories.html NN): duplicates are dropped exactly as the page drops them */
  function NN(x) { return String(x).replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").replace(/^(مصنع|شركة|الشركة)\s+/, "").trim().toLowerCase(); }
  function facAll() {
    var out = [], seen = {}, seenX = {}, EN0 = {}, D0 = window.I18N_EN || {};
    (window.MIGFAC || []).forEach(function (f) { if (f.name_en) EN0[f.name_ar] = f.name_en; });
    ((window.MIGFACX && MIGFACX.list) || []).forEach(function (f, i) { seenX[NN(f[0])] = 1; out.push({ n: f[0], en: EN0[f[0]] || D0[f[0]] || "", sec: f[1], loc: f[2], gov: window.MIGREG ? MIGREG.of(f[2]) : "", txt: f[0] + " " + f[1] + " " + f[4] + " " + ((MIGFACX.fp && MIGFACX.fp[f[0]]) || []).join(" "), href: "company.html#x" + i }); });
    /* the same members the directory lists (factories.html mergeOld): placed by their location text */
    (window.MIGOLDFAC || []).forEach(function (o, i) { var k = NN(o[0]), g = window.MIGREG ? MIGREG.of(o[2]) : o[10]; if (seenX[k] || /obeikan|العبيكان/i.test(o[0]) || (o[2] !== "جمهورية مصر العربية" && !g)) return; seenX[k] = 1; out.push({ n: o[0], sec: o[1], loc: o[2], gov: g || "", txt: o[0] + " " + o[1] + " " + (o[8] || "") + " " + (o[9] || []).join(" "), href: "company.html#" + i }); });
    return out;
  }
  function findCompany(q) {
    var qt = qtoks(q); if (!qt.length) return false;
    needFac(function () {
      var res = ranked(facAll(), qt, function (f) { return f.n + (f.en ? " " + f.en : ""); }), p = pick(res);
      if (p) return goItem("company", L === "en" && p.x.en ? p.x.en : trd(p.x.n), p.x.href);
      if (p === false) return itemList(res, function (r) { return trd(r.x.n); }, function (r) { return r.x.href; }, q, "factories");
      noItem(q, "factories");
    });
    return true;
  }
  /* tenders & RFQs by reference: the platform's lists (tenders.html / rfqs.html) and the researched tenders (opportunity.html) */
  function refOf(q) {
    var s = digits(q), m = /(?:^|[\s(#:«"])([A-Za-z]{2,6}-\d{2,}(?:-[A-Za-z0-9]+)*|\d{1,5}(?:\s*\/\s*\d{1,5}){1,3})(?=$|[\s)»".,،؟?])/.exec(s);
    if (m) return m[1].replace(/\s+/g, "").toUpperCase();
    var m2 = /(?:^|\s)(\d{4,6})(?=$|\s|[؟?.,])/.exec(s); return m2 && /(طلب|rfq|request|رقم|number|no)/i.test(N(q)) ? m2[1] : "";
  }
  function findRef(ref) {
    need(["oldtend", "oldrfq"], function () {
      var R = String(ref).toUpperCase(), eq = function (x) { return String(x || "").replace(/\s+/g, "").toUpperCase() === R; }, i;
      var T = window.MIGTEND || [], Q = rfqShown(), RT = ((window.REAL || {}).tenders) || [], RI = ((window.REAL || {}).tenders_intl) || [];
      for (i = 0; i < T.length; i++) if (eq(T[i][0])) return goItem("tender", ref, "tenders.html", { kind: "item", k: "tend", ref: T[i][0], title: T[i][3] });
      for (i = 0; i < Q.length; i++) if (eq(Q[i][0])) return goItem("rfq", ref, "rfqs.html", { kind: "item", k: "rfq", ref: Q[i][0], title: Q[i][2] });
      for (i = 0; i < RT.length; i++) if (eq(RT[i].ref) || eq(window.MIGOID ? MIGOID(RT[i], i) : "")) return tenderCard(RT[i], i, false);
      for (i = 0; i < RI.length; i++) if (eq(RI[i].ref) || eq("IN" + (i + 1))) return tenderCard(RI[i], i, true);
      show({ segs: [ln("item.none", { q: ref, what: L === "ar" ? "المناقصات" : "tenders" })], acts: [btn("sq", "🔎 " + t("srch.tenders"), "tenders|" + ref + "|", "pri"), btn("sq", "🔎 " + t("srch.rfqs"), "rfqs|" + ref + "|")] });
    });
  }
  function findTender(q, rfq, onNone) {
    var qt = qtoks(q); if (!qt.length) return false;
    need(rfq ? ["oldrfq", "regions"] : ["oldtend", "regions"], function () {
      if (rfq) {
        var rr = ranked(rfqShown(), qt, function (x) { return x[2] + " " + (x[9] || "") + (L === "en" ? " " + trd(x[2]) + " " + (x[10] || "") : ""); }, .7), pr = pick(rr);
        if (pr) return goItem("rfq", trd(pr.x[2]), "rfqs.html", { kind: "item", k: "rfq", ref: pr.x[0], title: pr.x[2] });
        if (pr === false) return startSearch("rfqs", orig(q), "");
        return onNone ? onNone() : noItem(q, "rfqs");
      }
      var lt = ranked(window.MIGTEND || [], qt, function (x) { return x[3] + (L === "en" ? " " + trd(x[3]) : ""); }, .7), rt = ranked(((window.REAL || {}).tenders) || [], qt, function (x) { return x.title_ar + " " + (x.title_en || ""); }, .7);
      var top = (lt[0] && (!rt[0] || lt[0].s >= rt[0].s)) ? "l" : rt[0] ? "r" : "";
      var all = lt.length + rt.length;
      if (top === "r" && (all === 1 || rt[0].s - ((lt[0] || {}).s || 0) >= .2 && (!rt[1] || rt[0].s - rt[1].s >= .2))) return tenderCard(rt[0].x, rt[0].i, false);
      if (top === "l") { var pl = pick(lt); if (pl && (!rt[0] || pl.s - rt[0].s >= .2)) return goItem("tender", trd(pl.x[3]), "tenders.html", { kind: "item", k: "tend", ref: pl.x[0], title: pl.x[3] }); }
      /* only the platform's own list matched: its search finds them; researched tenders (opportunity.html) are listed here */
      if (all && !rt.length) return startSearch("tenders", orig(q), "");
      if (all) {
        var mix = lt.map(function (r) { return { s: r.s, n: trd(r.x[3]), it: { kind: "tender", name: trd(r.x[3]), href: "tenders.html", pend: { kind: "item", k: "tend", ref: r.x[0], title: r.x[3] } } }; })
          .concat(rt.map(function (r) { return { s: r.s, r: r, n: L === "en" && r.x.title_en ? r.x.title_en : trd(r.x.title_ar), href: "opportunity.html#" + (window.MIGOID ? MIGOID(r.x, r.i) : "MD" + (r.i + 1)).toLowerCase() }; }))
          .sort(function (a, b) { return b.s - a.s; });
        /* the same tender listed twice counts once */
        var seenT = {}; mix = mix.filter(function (m) { var k = N(m.n); if (seenT[k]) return false; seenT[k] = 1; return true; });
        if (mix.length === 1 && mix[0].r) return tenderCard(mix[0].r.x, mix[0].r.i, false);
        return itemList(mix, function (m) { return m.n; }, function (m) { return m.href || m.it; }, q, "tenders");
      }
      if (onNone) return onNone();
      noItem(q, "tenders");
    });
    return true;
  }
  /* the RFQs rfqs.html lists (it hides bulk «طلب سعر مجمع» entries without real details) */
  function rfqShown() {
    return (window.MIGRFQ || []).filter(function (x) { if (!/^طلب سعر مجمع/.test(x[2])) return true; var d = String(x[3] || "").replace(/[\s….]+/g, " ").trim(), co = (/:\s*(.+?)\s*\(/.exec(x[2]) || [])[1] || ""; return d.length >= 30 && !(co && d.split(co).join("").trim() === ""); });
  }
  /* a researched tender: its facts in the bubble — no source link (owner 2026-11-20 «ميكتبش مصدر اي معلومه»: Janna never shows or opens a
     source; the platform's own page is one tap away) */
  function tenderCard(x, i, intl) {
    var ttl = L === "en" && x.title_en ? x.title_en : trd(x.title_ar), ent = L === "en" && x.entity_en ? x.entity_en : trd(x.entity_ar);
    var where = intl ? (L === "en" ? (x.city ? x.city + ", " : "") + (x.country_en || "") : (x.city ? x.city + " – " : "") + (x.country_ar || "")) : trd(x.city || (window.MIGREG ? MIGREG.name(x.region_code) : ""));
    var rows = [[L === "ar" ? "الجهة" : "Entity", ent], [L === "ar" ? "المكان" : "Location", where], [L === "ar" ? "الرقم" : "Ref.", x.ref], [L === "ar" ? "النشر" : "Published", x.publish_date], [L === "ar" ? "الإغلاق" : "Closing", x.closing_date]];
    var html = '<dl class="jn-dl">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>";
    var id = intl ? "in" + (i + 1) : (window.MIGOID ? MIGOID(x, i) : "MD" + (i + 1)).toLowerCase(), acts = [];
    acts.push(linkBtn(t("details"), "opportunity.html#" + id, true)); acts.push(chip(["reg"]));
    show({ segs: [seg((L === "ar" ? "دي المناقصة: «" : "Here is the tender: “") + ttl + (L === "ar" ? "»." : "”."), "proud")], html: html, acts: acts });
  }
  function findNews(q) {
    var qt = qtoks(q); if (!qt.length) return false;
    var N0 = ((window.REAL || {}).news) || [], P0 = MP();
    /* «أخبار المشتريات» only for the plans that have it (Premium and up) — the same predicate as the list search (review M-4); an item she
       may not name scores nothing, so the indexes (article.html#i) stay those of REAL.news */
    var okN = function (x) { return x && (!P0 || !P0.newsOK || P0.newsOK(x)); };
    var tx = function (x) { return okN(x) ? x.title_ar + " " + (x.title_en || "") + (L === "en" ? " " + trd(x.title_ar) : "") : ""; };
    var res = ranked(N0, qt, tx, .7);
    if (!res.length) res = ranked(N0, qt, function (x) { return okN(x) ? tx(x) + " " + (x.summary_ar || "") + (L === "en" ? " " + trd(x.summary_ar || "") : "") : ""; }, .7);
    var p = pick(res);
    if (p) return goItem("news", trd(p.x.title_ar), "article.html#" + p.i);
    if (p === false) return itemList(res, function (r) { return trd(r.x.title_ar); }, function (r) { return "article.html#" + r.i; }, q, "");
    show({ segs: [ln("item.none", { q: orig(q), what: nameOf("news") })], acts: [linkBtn(nameOf("news"), "news.html", true), chip(["can"])] });
    return true;
  }
  /* «… امتى؟ / فين؟»: the exhibition's dates and venue in the bubble, the page one tap away */
  function fdate(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "")); if (!m) return String(d || ""); var MA = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"], ME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return L === "ar" ? +m[3] + " " + MA[+m[2] - 1] + " " + m[1] : +m[3] + " " + ME[+m[2] - 1] + " " + m[1]; }
  function eventCard(x, q) {
    var nm = L === "en" && x.name_en ? x.name_en : x.name_ar, when = x.start_date ? fdate(x.start_date) + (x.end_date && x.end_date !== x.start_date ? (L === "ar" ? " لحد " : " to ") + fdate(x.end_date) : "") : "";
    var line = (L === "ar" ? "«" + nm + "»" : "“" + nm + "”") + (when ? (L === "ar" ? " من " : " runs from ") + when : "") + (x.venue ? (L === "ar" ? "، في " : ", at ") + trd(x.venue) : "") + ".";
    var acts = [linkBtn(t("details"), "event.html#" + x.id, true)]; acts.push(linkBtn(nameOf("events"), "events.html")); /* no source link (owner 2026-11-20) */
    show({ segs: [seg(line, "happy")], q: q ? orig(q) : "", acts: acts });
  }
  function findEvent(q, ask) {
    var qt = qtoks(q); if (!qt.length) return false;
    var res = ranked(((window.REAL || {}).events) || [], qt, function (x) { return x.name_ar + " " + (x.name_en || "") + " " + (x.sector_ar || ""); }, .7), p = pick(res);
    var nm = function (x) { return L === "en" && x.name_en ? x.name_en : x.name_ar; };
    if (p && ask) return eventCard(p.x, curQ);
    if (p) return goItem("event", nm(p.x), "event.html#" + p.x.id);
    if (p === false) return itemList(res, function (r) { return nm(r.x); }, function (r) { return "event.html#" + r.x.id; }, q, "");
    show({ segs: [ln("item.none", { q: orig(q), what: nameOf("events") })], acts: [linkBtn(nameOf("events"), "events.html", true), chip(["can"])] });
    return true;
  }
  function findOffer(q) {
    var qt = qtoks(q); if (!qt.length) return false;
    need(["offers"], function () {
      var O = window.MIGOFFERS || [], nm = function (x) { return L === "en" && x.product_en ? x.product_en : x.product_ar; };
      var brand = O.filter(function (x) { return x.brand && fuzzy(qt, x.brand) >= .99; });
      if (brand.length > 1) return startSearch("offers", orig(q), "");
      var res = ranked(O, qt, function (x) { return x.product_ar + " " + (x.product_en || "") + " " + (x.brand || ""); }, .74), p = pick(res);
      if (p) return goItem("offer", nm(p.x), "offer.html#" + p.x.id);
      if (p === false) return startSearch("offers", orig(q), "");
      noItem(q, "offers");
    });
    return true;
  }
  function findZone(q, onNone) {
    var qt = qtoks(q); if (!qt.length) return false;
    need(["zones"], function () {
      var nm = function (x) { return L === "en" && x.name_en ? x.name_en : x.name_ar; };
      var res = ranked(window.MIGZONES || [], qt, function (x) { return x.name_ar + " " + (x.name_en || ""); }, .74);
      if (!res.length) res = ranked(window.MIGZONES || [], qt, function (x) { return x.name_ar + " " + (x.name_en || "") + " " + (x.city || ""); }, .74);
      /* the kind the visitor named (city / free zone / industrial zone) breaks a tie */
      var nq = N(q), want = /مدينه|city/.test(nq) ? /مدينه|city/ : /حره|free/.test(nq) ? /حره|free/ : /صناعي|industrial/.test(nq) ? /صناعي|industrial/ : null;
      if (want) { res.forEach(function (r) { if (want.test(N(r.x.name_ar + " " + (r.x.name_en || "")))) r.s += .25; }); res.sort(function (a, b) { return b.s - a.s; }); }
      var p = pick(res);
      if (p) return goItem("zone", nm(p.x), "city.html#" + p.x.id);
      if (p === false) return itemList(res, function (r) { return nm(r.x); }, function (r) { return "city.html#" + r.x.id; }, q, "");
      if (onNone) return onNone();
      show({ segs: [ln("item.none", { q: orig(q), what: nameOf("cities") })], acts: [linkBtn(nameOf("cities"), "cities.html", true), chip(["can"])] });
    });
    return true;
  }
  /* arrived on tenders.html / rfqs.html for one item: filter by its number and open its detail card */
  function openListItem(p, here) {
    var q = $("#olQ"); if (!q) return runPend({ kind: "arrive" }, here);
    /* the list's own search matches the number part reliably ("RFQ-2026-4382" → "2026-4382") */
    setField(q, String(p.ref).replace(/^[A-Za-z]{2,6}-(?=\d)/, "")); glow(q);
    setTimeout(function () {
      var bs = [].slice.call(document.querySelectorAll("#olL [data-i]")), key = N(p.title || "").slice(0, 28);
      var b = bs.filter(function (x) { return key && N(x.textContent).indexOf(key) > -1; })[0] || bs[0];
      if (b) { try { b.scrollIntoView({ block: "center" }); } catch (e) {} b.click(); }
      show({ segs: (here ? [] : [ln("arrive")]).concat([ln(b ? "item.shown" : "search.res0")]), peek: true, acts: [chip(["srch", p.k === "rfq" ? "rfqs" : "tenders"]), chip(["reg"])] });
    }, 450);
  }

  /* live counts: «عندنا كام مصنع حديد في الشرقية؟» */
  var COUNTW = /(^|\s)(كام|عدد|قد ايه|اد ايه|how many|number of|count of)(\s|$)/;
  var CUNIT = {
    factories: [["منشأة واحدة", "منشأتين", "منشآت", "منشأة"], "factories and companies", "factories"],
    tenders: [["مناقصة واحدة", "مناقصتين", "مناقصات", "مناقصة"], "tenders", "tenders"],
    rfqs: [["طلب سعر واحد", "طلبين", "طلبات أسعار", "طلب سعر"], "requests for quotation", "rfqs"],
    offers: [["عرض واحد", "عرضين", "عروض", "عرض"], "offers", "offers"],
    events: [["معرض واحد", "معرضين", "معارض وفعاليات", "معرض وفعالية"], "exhibitions and events", "events"],
    news: [["خبر واحد", "خبرين", "أخبار", "خبر"], "news stories", "news"],
    zones: [["مدينة أو منطقة واحدة", "مدينتين أو منطقتين", "مدن ومناطق صناعية", "مدينة ومنطقة صناعية"], "industrial cities and zones", "cities"],
    projects: [["مشروع واحد", "مشروعين", "مشاريع", "مشروع"], "projects", "projects"]
  };
  function plural(n, f) { return n === 1 ? f[0] : n === 2 ? f[1] : (n >= 3 && n <= 10 ? money(n) + " " + f[2] : money(n) + " " + f[3]); }
  function countEnt(n) {
    if (has(n, "مصنع|مصانع|شركه|شركات|منشاه|منشات|منشآت", "factor(?:y|ies)|compan(?:y|ies)|manufacturers?")) return "factories";
    if (has(n, "مناقصه|مناقصات|ممارسه|ممارسات", "tenders?")) return "tenders";
    if (has(n, "طلب سعر|طلبات اسعار|طلبات عروض اسعار|طلبات|طلب", "rfqs?|requests?")) return "rfqs";
    if (has(n, "عرض|عروض|خصم|خصومات", "offers?|deals?|discounts?")) return "offers";
    if (has(n, "معرض|معارض|فعاليه|فعاليات", "events?|exhibitions?|fairs?")) return "events";
    if (has(n, "خبر|اخبار", "news|stories")) return "news";
    if (has(n, "مدينه صناعيه|مدن صناعيه|مدن|منطقه صناعيه|مناطق صناعيه|منطقه حره|مناطق حره|مناطق", "industrial (?:cities|zones)|free zones|zones|cities")) return "zones";
    if (has(n, "مشروع|مشاريع|مشروعات", "projects?")) return "projects";
    if (has(n, "محافظه|محافظات", "governorates?")) return "govs";
    return "";
  }
  function countIntent(q, n) {
    if (!COUNTW.test(n)) return false;
    var e = countEnt(n); if (!e) return false;
    if (e === "govs") { var ng = window.MIGREG && MIGREG.list ? MIGREG.list.length : GOV.length; show({ segs: [seg(L === "ar" ? "المنصة مغطية " + ng + " محافظة، كل محافظة ليها صفحة بمناقصاتها ومصانعها ومشاريعها." : "The platform covers " + ng + " governorates, each with its own page of tenders, factories and projects.", "proud")], q: q, acts: [linkBtn(nameOf("region"), "region.html", true), linkBtn(nameOf("map"), "map.html")] }); return true; }
    var gov = findGov(n, q), tm = term(q, gov).split(" ").filter(function (w) { return !/^(كام|عدد|قد|اد|ايه|قطاع|مجال|عندنا|عندكو|موجودين|مسجلين|مسجله|مفتوحه|مفتوح|how|many|number|count|sector|registered|open|we|have|there)$/.test(N(w)); }).join(" ").trim();
    var files = ({ factories: ["oldfac", "facx", "factories"], tenders: ["oldtend"], rfqs: ["oldrfq"], offers: ["offers"], zones: ["zones"], projects: ["projects"] }[e] || []).concat(["regions"]);
    if (files.some(function (k) { return !DATA[k](); })) show({ segs: [ln("loading")], speak: false });
    (e === "factories" ? needFac : function (cb) { need(files, cb); })(function () {
      var qt = tm ? qtoks(tm) : [], gName = gov ? GOV.filter(function (g) { return g[0] === gov; })[0][1] : "";
      var okT = function (txt) { if (!qt.length) return true; var x = " " + N(txt).split(" ").map(base).join(" ") + " "; return qt.every(function (w) { return x.indexOf(" " + w) > -1 || (w.length >= 4 && x.indexOf(w) > -1); }); };
      var inGov = function (code, txt) { return !gov || code === gov || (!code && txt && N(txt).indexOf(N(gName).replace(/^ال/, "")) > -1); };
      var list = [], extra = "", names = [];
      if (e === "factories") list = facAll().filter(function (f) { return inGov(f.gov, f.loc) && okT(f.txt); }), names = list.map(function (f) { return f.n; });
      else if (e === "tenders") { list = (window.MIGTEND || []).filter(function (x) { return inGov(x[10], x[5]) && okT(x[3] + " " + x[6] + " " + x[4]); }); var op = list.filter(function (x) { return x[2] === "سارية" || x[2] === "تنتهي قريباً"; }).length, nd = list.filter(function (x) { return x[2] === "غير محدد الموعد"; }).length; extra = L === "ar" ? (op ? " منهم " + money(op) + " مفتوحة دلوقتي" : " ومفيش منهم حاجة مفتوحة دلوقتي") + (nd ? "، و" + money(nd) + " بدون موعد إغلاق معلن." : ".") : (op ? " " + money(op) + " of them are open now" : " None of them is open right now") + (nd ? ", and " + money(nd) + " have no published deadline." : "."); names = list.map(function (x) { return x[3]; }); }
      else if (e === "rfqs") list = rfqShown().filter(function (x) { return inGov(x[7], x[4]) && okT(x[2] + " " + x[3] + " " + (x[9] || "")); }), names = list.map(function (x) { return x[2]; });
      else if (e === "offers") list = (window.MIGOFFERS || []).filter(function (x) { return (!gov || (x.region_codes || []).indexOf(gov) > -1) && okT(x.product_ar + " " + (x.brand || "") + " " + (x.category_ar || "") + " " + (x.store_ar || "")); }), names = list.map(function (x) { return x.product_ar; });
      else if (e === "events") list = (((window.REAL || {}).events) || []).filter(function (x) { return inGov(x.region_code, x.venue) && okT(x.name_ar + " " + (x.sector_ar || "")); }), names = list.map(function (x) { return x.name_ar; });
      else if (e === "news") list = (((window.REAL || {}).news) || []).filter(function (x) { return x && inGov(x.region_code, "") && okT(x.title_ar + " " + (x.summary_ar || "") + " " + (x.category_ar || "")) && (!window.MIGPLAN || !MIGPLAN.newsOK || MIGPLAN.newsOK(x)); }), names = list.map(function (x) { return x.title_ar; });
      else if (e === "zones") list = (window.MIGZONES || []).filter(function (x) { return inGov(x.region_code, x.city) && okT(x.name_ar + " " + (x.city || "") + " " + (x.focus_sectors_ar || []).join(" ")); }), names = list.map(function (x) { return x.name_ar; });
      else if (e === "projects") list = ((window.MIG && MIG.PROJECTS) || []).filter(function (x) { return inGov("", x[2]) && okT(x[1] + " " + x[4]); }), names = list.map(function (x) { return x[1]; });
      var U = CUNIT[e], c = list.length, where = nameOf(U[2]);
      if (!c) return show({ segs: [ln("count.none")], q: q, acts: [SEARCH[U[2]] ? btn("sq", "🔎 " + t("srch." + U[2]), U[2] + "|" + tm + "|" + gov, "pri") : linkBtn(where, U[2] + ".html", true), chip(["can"])] });
      var txt = L === "ar"
        ? "عندنا " + plural(c, U[0]) + (tm ? " ليها علاقة بـ«" + tm + "»" : "") + (gov ? " في محافظة " + govName(gov) : "") + " في " + where + " على المنصة." + extra
        : "We have " + money(c) + " " + U[1] + (tm ? " matching “" + tm + "”" : "") + (gov ? " in " + govName(gov) : "") + " in " + where + " on the platform." + extra;
      if (e === "projects") txt += L === "ar" ? " (بيانات المشاريع استرشادية.)" : " (Project data is indicative.)";
      var ex = names.slice(0, 3).map(trd).filter(Boolean), exTxt = ex.length && c > 1 ? (L === "ar" ? "\nمنهم مثلاً: " : "\nFor example: ") + ex.join(L === "ar" ? "، " : ", ") + "." : "";
      var acts = [SEARCH[U[2]] ? btn("sq", "🔎 " + t("showAll"), U[2] + "|" + tm + "|" + gov, "pri") : linkBtn(where, U[2] + ".html", true)];
      if (gov) acts.push(linkBtn((L === "ar" ? "محافظة " : "") + govName(gov), "region.html#" + gov));
      acts.push(chip(["reg"]));
      show({ segs: [seg(txt, "proud")], q: q, html: exTxt ? '<div class="q" style="margin-top:6px">' + esc(exTxt.trim()) + "</div>" : "", acts: acts });
    });
    return true;
  }
  /* «إيه اللي في الصفحة دي؟» — read the page's own headings */
  var READW = /(اللي في الصفحه|الي في الصفحه|الصفحه دي فيها|فيها ايه الصفحه|ايه الصفحه دي|اقري الصفحه|اقريلي الصفحه|لخصي الصفحه|لخصيلي الصفحه|ملخص الصفحه|احنا فين|انا فين|اشرحيلي الصفحه|whats on this page|what s on this page|what is on this page|what is this page|summari[sz]e (?:this|the) page|read (?:this|the) page|where am i)/;
  function readPage(q) {
    var h1 = document.querySelector("h1"), title = h1 ? (h1.innerText || h1.textContent).replace(/\s+/g, " ").trim() : document.title.split(/\s[–|·-]\s/)[0];
    var hs = [], seen = {};
    [].forEach.call(document.querySelectorAll("h2,h3"), function (h) {
      if (hs.length >= 6 || inJanna(h) || (h.closest && h.closest(".bs-bub,.bs-wel,.jnl,header,footer,nav,.pdov")) || !h.offsetParent) return;
      var x = (h.innerText || h.textContent).replace(/\s+/g, " ").trim(), k = N(x); if (x.length < 3 || x.length > 70 || !k || seen[k]) return; seen[k] = 1; hs.push(x);
    });
    var cnt = ["#cnt", "#olC", "#scnt", "#ocnt"].map(function (s) { var e = document.querySelector(s); return e && e.offsetParent ? e.textContent.trim() : ""; }).filter(Boolean)[0];
    var segs = [seg((L === "ar" ? "إنت دلوقتي في صفحة «" : "You're on the page “") + title + (L === "ar" ? "»." : "”."), "calm"), regionLine() || ln("intro." + pkey())];
    if (hs.length) segs.push(seg((L === "ar" ? "الصفحة فيها: " : "It has: ") + hs.join(L === "ar" ? "، " : ", ") + ".", "calm"));
    if (cnt) segs.push(seg((L === "ar" ? "والعدد الظاهر دلوقتي: " : "Currently showing: ") + cnt + ".", "calm"));
    show({ segs: segs, q: q, acts: pageActs() });
  }
  /* plan comparison: all five, or the two the visitor named */
  var CMPW = /(قارن|قارني|قارنيلي|مقارنه|الفرق بين|فرق بين|ايه الفرق|compare|comparison|difference between|differences)/;
  function plansIn(n) {
    var o = [];
    if (has(n, "استراتيجي|استراتيجيه|الاستراتيجي", "strategic")) o.push("strategic");
    if (has(n, "شريك الاساسي|شريك اساسي|الشريك الاساسي", "core partner|core") || (has(n, "شريك", "partner") && !o.length)) o.push("partner");
    if (has(n, "مميزه|المميزه|بريميوم", "premium")) o.push("premium");
    if (has(n, "اساسيه|الاساسيه|بيسك", "basic")) o.push("basic");
    if (has(n, "بيانات فقط|بيانات بس|تسجيل بيانات|بروفايل", "profile|data registration|data only")) o.push("profile");
    return o;
  }
  function comparePlans(q, n) {
    var ks = plansIn(n); if (ks.length < 2) ks = ["profile", "basic", "premium", "partner", "strategic"];
    ks.sort(function (a, b) { return PKEYS.indexOf(a) - PKEYS.indexOf(b); });
    var priced = ks.every(function (k) { return planPrice(k) != null; });
    var lines = ks.map(function (k) { return "• " + planName(k) + (planPrice(k) != null ? ": " + money(planPrice(k)) + (L === "ar" ? " جنيه في السنة" : " EGP a year") : "") + " — " + planFeat(k) + "."; });
    var segs = [seg(priced ? (L === "ar" ? "دي مقارنة الباقات (الأسعار سنوية + ضريبة القيمة المضافة " + Math.round(vatRate() * 100) + "%):" : "Here's the plan comparison (yearly prices + " + Math.round(vatRate() * 100) + "% VAT):") : noBuy() ? (L === "ar" ? "دي مقارنة الباقات:" : "Here's the plan comparison:") : (L === "ar" ? "دي مقارنة الباقات، والأسعار الحالية في صفحة الباقات:" : "Here's the plan comparison; the current prices are on the plans page:"), "calm"), seg(lines.join("\n"), "calm")];
    if (ks.length === 2 && priced) { var d = planPrice(ks[1]) - planPrice(ks[0]); segs.push(seg(L === "ar" ? "الفرق بينهم " + money(Math.abs(d)) + " جنيه في السنة قبل الضريبة." : "The difference is EGP " + money(Math.abs(d)) + " a year before VAT.", "calm")); }
    show({ segs: segs, q: q, acts: noBuy() ? [btn("reg", t("reg"), null, "pri")] : [btn("reg", t("reg"), null, "pri"), linkBtn(t("compare"), "register.html#plans")] });
  }
  /* the visitor's sentence → an item to open (returns true when handled) */
  var OPENW = "افتح|افتحي|افتحيلي|افتحلي|افتحيلنا|وريني|وريلي|ورينا|اعرضي|اعرضيلي|اعرضلي|هاتي|هاتيلي|خديني علي|خديني على|خدني علي|خدني على|وديني علي|وديني على|عايز اشوف|عاوز اشوف|عايزه اشوف|عاوزه اشوف|ادخل علي|ادخل على|open|show me|show|take me to|bring up|pull up|go to";
  function strip(q, re) { return String(q).replace(re, " ").replace(/\s+/g, " ").trim(); }
  function itemIntent(q, n) {
    var ref = refOf(q);
    if (ref && (has(n, OPENW, OPENW) || /(مناقص|طلب|ممارس|rfq|tender|رقم|ref|number)/.test(n) || N(q).replace(/\s/g, "").length <= ref.length + 2)) { findRef(ref); return true; }
    var openT = has(n, OPENW, OPENW);
    /* «خبر عن …» / «news about …» */
    var mn = /(?:^|\s)(?:ال)?(?:خبر|اخبار|مقال|مقاله)\s+(?:عن|بخصوص|حول|بتاع|علي|على)\s+(.+)$/.exec(n) || /(?:^|\s)(?:news|article|story)\s+(?:about|on)\s+(.+)$/.exec(n);
    if (mn) return findNews(mn[1]) !== false;
    if (!openT && !/(^|\s)(ملف|بروفايل|profile)(\s|$)/.test(n)) {
      /* «معرض … امتى؟» — when is an exhibition */
      var me = /(?:^|\s)(?:معرض|ملتقي|مؤتمر)\s+(.+?)\s*(?:امتي|امته|فين|ميعاده|موعده)?$/.exec(n);
      if (me && /(امتي|امته|ميعاد|موعد|فين|when|where)/.test(n)) return findEvent(me[1].replace(/(امتي|امته|فين|ميعاده|موعده)/g, ""), true) !== false;
      /* «when is the Cairo WoodShow?» / «where is …» */
      var mw = /(?:^|\s)(?:when|where)\s+(?:is|does|will)\s+(?:the\s+)?(.+?)(?:\s+(?:take place|be held|held|start|open))?$/.exec(n);
      if (mw && /(show|expo|exhibition|fair|forum|summit|week|conference|event|\d{4})/.test(mw[1])) { if (findEvent(mw[1], true) !== false) return true; }
      return false;
    }
    var rest = strip(n, new RegExp("(?:^|\\s)(?:" + OPENW + "|لي|ليا|لو سمحت|من فضلك|please|me|the|a|an)(?=\\s|$)", "g"));
    var kw = function (re) { var m = new RegExp("(?:^|\\s)(?:ال)?(?:" + re + ")(?:\\s|$)").exec(rest); return m ? strip(rest.replace(m[0], " "), /^$/) : null; };
    var r;
    if ((r = kw("ملف|بروفايل|profile")) != null) { r = strip(r, /(?:^|\s)(?:ال)?(?:شركه|مصنع|منشاه|company|factory)(?=\s|$)/g); if (r) return findCompany(r) !== false; }
    if ((r = kw("شركه|مصنع|منشاه|company|factory")) != null && r && !findSect(r)) return findCompany(r) !== false;
    /* a governorate in the words: the item when one matches («مناقصة صوامع الشرقية»), else the filtered list («مناقصات الشرقية») */
    var gq = function (x) { var g = findGov(x, x); return g ? { g: g, tm: term(orig(x), g) } : null; };
    if ((r = kw("مناقصه|ممارسه|مزايده|tender|bid")) != null && r) { var g1 = gq(r); if (!g1) return findTender(r, false) !== false; if (g1.tm) return findTender(r, false, function () { startSearch("tenders", g1.tm, g1.g); }) !== false; }
    if ((r = kw("طلب سعر|طلب عرض سعر|طلب|rfq|request")) != null && r) { var g2 = gq(r); if (!g2) return findTender(r, true) !== false; if (g2.tm) return findTender(r, true, function () { startSearch("rfqs", g2.tm, g2.g); }) !== false; }
    if ((r = kw("خبر|مقال|مقاله|news|article|story")) != null && r) return findNews(r) !== false;
    if ((r = kw("معرض|ملتقي|مؤتمر|فعاليه|event|exhibition|expo|fair")) != null && r) return findEvent(r) !== false;
    if ((r = kw("عرض|اوكازيون|offer|deal")) != null && r) return findOffer(r) !== false;
    /* a zone kind was named: the zone first (also «المنطقة الحرة بالإسكندرية»), the governorate only when no zone matches */
    if ((r = kw("مدينه|المدينه الصناعيه|منطقه صناعيه|منطقه حره|منطقه|zone|industrial city|city|free zone|industrial zone")) != null && r) {
      var gz = findGov(r, r);
      return findZone(rest, gz ? function () { goGov(gz); } : null) !== false;
    }
    return false;
  }
  /* the hook called by understand(): everything above, in a fixed order */
  /* the visitor's own spelling of a normalised phrase (for display and for the page's search box) */
  var curQ = "";
  function orig(r) {
    var want = {}; N(r).split(" ").forEach(function (w) { if (w) want[w] = 1; });
    var out = String(curQ).replace(/[؟?!.,،«»"']/g, " ").split(/\s+/).filter(function (w) { return w && want[N(w)]; }).join(" ");
    return out || r;
  }
  function fullAccess(q, n) {
    curQ = q;
    if (ST.tour != null && /^(التالي|كملي|كمل|بعده|اللي بعده|next|continue|go on)$/.test(n)) { tourGo(ST.tour + 1); return true; }
    if (/(جوله|tour|walk me through|عرفيني (?:علي|على) المنصه|فرجيني (?:علي|على) المنصه|فرجيني المنصه|لفيني)/.test(n)) { tourStart(); return true; }
    if (/(اجتماع|ميتنج|ميتينج|ميتنغ|meeting)/.test(n)) { if (!liveOpen("meeting")) return true; return true; }
    if (/(فيديو|video|لايف|live|كاميرا|مكالمه)/.test(n) && /(كلم|كلميني|اكلم|نتكلم|اتكلم|مكالمه|call|talk|chat|لايف|live|شوفك|اشوفك|اشوفك)/.test(n) && !/(فيديوهات|videos)/.test(n)) { liveOpen(""); return true; }
    if (READW.test(n)) { readPage(q); return true; }
    if (CMPW.test(n) && (/(باق|plan|package|اشتراك|subscription)/.test(n) || plansIn(n).length >= 2)) { comparePlans(q, n); return true; }
    if (countIntent(q, n)) return true;
    return itemIntent(q, n);
  }

  /* ---------- carrying on after a page change ---------- */
  function runPend(p, here) {
    if (!p) return;
    if (p.kind === "search") return doSearch(p, here);
    if (p.kind === "fill") return doFill(p, here);
    if (p.kind === "tour") return tourShow(+p.i || 0);
    if (p.kind === "item") return openListItem(p, here);
    var k = pkey(), code = PAGE === "region" ? (location.hash || "").slice(1).toUpperCase() : "";
    var segs = [ln("arrive")];
    if (code && GOV.some(function (g) { return g[0] === code; })) segs.push(ln("region.one", { name: govName(code) })); else segs.push(ln("intro." + k));
    show({ segs: segs, acts: pageActs() });
  }

  /* ---------- start ---------- */
  function start() {
    layout();
    if (!KIOSK && !quietPage()) document.documentElement.classList.add("jn-here");
    /* members' tools: data/janna-live.js moves its «جنة لايف» pill next to her collapsed headshot, away from the page's navigation */
    if (!KIOSK && quietPage()) { document.documentElement.classList.add("jn-quiet"); document.documentElement.classList.toggle("jn-qrtl", pageRTL()); }
    if (KIOSK) {
      /* janna.html has no language engine of its own: her language (?lang=en → "janna-lang") sets the page's direction too */
      try { var de0 = document.documentElement; de0.lang = L; de0.dir = L === "ar" ? "rtl" : "ltr"; if (L === "en" && /[\u0600-\u06FF]/.test(document.title)) document.title = "Janna · Made in Egypt Gate assistant"; } catch (e) {}
      var tap = document.createElement("div"); tap.className = "jn-tap"; tap.setAttribute("translate", "no"); tap.dir = L === "ar" ? "rtl" : "ltr"; tap.lang = L; tap.textContent = t("tapToTalk"); document.body.appendChild(tap);
      document.addEventListener("click", function first(e) { document.removeEventListener("click", first, true); unlock(); if (!e.target.closest(".jn-bub")) { ST.flow = null; intro(true); } }, true);
      intro(false);
      /* idle attract loop: every 45 s without interaction she invites the next visitor */
      var lastAct = Date.now(); ["click", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, true); });
      setInterval(function () { if (Date.now() - lastAct > 45000 && !busy()) { lastAct = Date.now(); ST.flow = null; fillState = null; save(); chrome(); show({ segs: [ln("attract")], acts: [chip(["srch", "factories"]), chip(["rfq"]), chip(["reg"]), chip(["can"])] }); if (!document.querySelector(".jn-tap")) { var tp2 = document.createElement("div"); tp2.className = "jn-tap"; tp2.setAttribute("translate", "no"); tp2.textContent = t("tapToTalk"); document.body.appendChild(tp2); } } }, 5000);
      return;
    }
    var pend = ST.pend; if (pend && pend.page !== PAGE) pend = null;
    if (ST.pend) { ST.pend = null; save(); }
    if (pend) { if (ls("janna-min") === "1") { ls("janna-min", "0"); } ss("janna-arr:" + PAGE, "1"); setTimeout(function () { runPend(pend, false); }, pend.kind === "arrive" ? 600 : 900); return; }
    /* the members' tools (dashboard, requests monitor, advisor, live meetings): she waits silent and collapsed in her corner, away
       from the page's navigation, and never covers a control (coordinator review A1) */
    if (quietPage()) { fig.hidden = true; mini.hidden = false; layout(); return; }
    /* a new tab session: her welcome card waits in a corner (not on members' tools, not while Bassem serves a member) */
    /* the welcome card at most once a day per browser: a new tab or a visit within 24 h gets the lighter page arrival */
    if (!ss("janna-stage") && !quietPage() && !ST.flow && Date.now() - (+ls("janna-stage-ts") || 0) < 864e5) { ss("janna-stage", "1"); ST.greeted = true; save(); }
    if (!ss("janna-stage") && !quietPage() && !ST.flow) {
      var ask0 = asked(); if (ask0) wakeUnlock();
      ST.greeted = true; save(); ss("janna-arr:" + PAGE, "1"); fig.hidden = true; mini.hidden = true;
      setTimeout(function () { var lv = document.querySelector(".jnl"); if (!stageEl && bub.hidden && !quietPage() && !(lv && !lv.hidden)) openStage(true, ask0); else layout(); }, ask0 ? 60 : 900);
      return;
    }
    /* «اسأل جنة» on an SEO page once her card was already shown (this session / the last 24 h): she answers the call at once */
    if (asked()) { wakeUnlock(); layout(); setTimeout(function () { if (bub.hidden && !stageEl) openJ(true); }, 400); return; }
    if (ST.tour != null && tourResume()) return;
    if (ls("janna-min") === "1") { fig.hidden = true; mini.hidden = false; return; }
    if (ST.flow && ST.open) { setTimeout(function () { askStep([ln("flow.resume")]); }, 900); return; }
    if (!ST.greeted) {
      ST.greeted = true; save();
      setTimeout(function () { if (!bub.hidden) return; if (unlocked) intro(true); else teaser(); }, 1500);
      return;
    }
    if (ST.open) setTimeout(function () { if (bub.hidden) intro(true, true); }, 900);
    else { arrive(); setTimeout(cornerRule, 1100); }
  }
  /* a member signed in (data/bassem.js): Bassem takes over, she leaves the stage / tour / corner at once */
  window.addEventListener("bassem:change", function (e) {
    if (!(e && e.detail && e.detail.active)) return;
    if (stageEl) { var st = stageEl; stageEl = null; if (stageRep) { dropReplica(stageRep); stageRep = null; } st.remove(); clearInterval(wcIv); wcIv = 0; document.documentElement.classList.remove("jn-staged", "jn-wcon"); }
    stop(); tourSpot(null); clearTimeout(settleT); fig.classList.remove("jn-come"); if (!bub.hidden) { bub.hidden = true; beam.hidden = true; }
  });
  if (document.readyState !== "loading") setTimeout(start, 0); else document.addEventListener("DOMContentLoaded", start);

  /* ---------- public API ---------- */
  window.JANNA = {
    say: function (text, mood) { show({ segs: [seg(text, mood)] }); }, show: show, intro: intro, ask: handle, handle: handle,
    register: function () { restore(false); wiz(1); }, rfq: function () { restore(false); startFlow("rfq"); }, lang: function () { return L; }, setLang: setLang,
    minimise: minimise, restore: restore, mood: setMood, state: function () { return JSON.parse(JSON.stringify(ST)); }, stop: stop, viseme: function (n) { AV.setV(n); }, blink: AV.blink,
    /* every fixed line, plus the placeholder lines whose values come from a fixed set (sections, governorates, plans):
       those are keyed "qa:<sha1 of the spoken text>", exactly as playSeg looks them up. Still dynamic (and so only voiced
       per instance): search.res* {n}, search.go with a search word, fill.err {err}, flow.rfq.got {p}. */
    lines: function () {
      var out = [], L0 = L, seen = {};
      Object.keys(LINES).forEach(function (id) { ["ar", "en"].forEach(function (lg) { var x = LINES[id][lg]; if (!x || /\{\w+\}/.test(x)) return; out.push({ key: id + "." + lg, id: id, lang: lg, text: x, speak: clean(x), mood: LINES[id].m }); }); });
      var add = function (id, lg, vars) { var o = LINES[id], x = o && o[lg]; if (!x) return; x = x.replace(/\{(\w+)\}/g, function (a, k) { return vars[k] == null ? "" : vars[k]; }); var sp = clean(x), key = "qa:" + sha1(sp); if (seen[key]) return; seen[key] = 1; out.push({ key: key, id: id, lang: lg, text: x, speak: sp, mood: o.m, vars: vars }); };
      ["ar", "en"].forEach(function (lg) {
        L = lg;
        var names = SECT.map(function (x) { return lg === "ar" ? x[3] : x[4]; }), govs = GOV.map(function (g) { return g[0]; });
        Object.keys(LINES).forEach(function (id) {
          if (/^nav\.go\./.test(id)) { names.forEach(function (nm) { add(id, lg, { name: nm }); }); govs.forEach(function (c) { add(id, lg, { name: (lg === "ar" ? "محافظة " : "") + govName(c) }); }); }
          if (/^search\.go\./.test(id)) Object.keys(SEARCH).forEach(function (k) { var w = lg === "ar" ? SEARCH[k].ar : SEARCH[k].en; add(id, lg, { what: w, about: "" }); govs.forEach(function (c) { add(id, lg, { what: w, about: (lg === "ar" ? " في " : " in ") + govName(c) }); }); });
        });
        govs.forEach(function (c) { add("region.one", lg, { name: govName(c) }); });
        names.forEach(function (nm) { add("kiosk.qr", lg, { name: nm }); });
        PKEYS.forEach(function (k) { add("wiz.plan", lg, { plan: planName(k), feat: planFeat(k), price: planPriceTxt(k), pay: PAYTXT[lg] }); add("reg.plan", lg, { plan: planName(k) }); });
        add("plans", lg, { list: plansList() });
      });
      L = L0; return out;
    },
    sha1: sha1, clean: clean,
    /* she comes to the visitor */
    stage: function () { unlock(); return openStage(false); }, closeStage: function () { closeStage(true); }, tour: tourStart, endTour: function () { tourEnd(true); },
    live: liveOpen, find: function (q) { handle(q); }, need: need
  };
})();
