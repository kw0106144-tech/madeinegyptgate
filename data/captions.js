/* Live subtitles for Janna & Bassem — everything they say is also written at the bottom of the page.
   Sources (all automatic, no changes needed in the speaking engines):
   1) Browser speech synthesis (janna.js / bassem.js): speechSynthesis.speak is wrapped; the caption follows the spoken
      sentence using the utterance's boundary events (falls back to timing by length).
   2) Live video calls (Anam widget): 'anam-agent:message-received' events with role "agent" (cue tags like [happy] removed).
   3) Any engine or video can call window.MIGCAPTIONS.show(text, {speaker, ms}) / .hide().
   Speaker name: window.MIGCAPTIONS.speaker if set, else «باسم» when Bassem is the active advisor on the page, else «جنة».
   Viewers can switch captions off with the CC button (remembered in localStorage 'mig-cc').
   During a live call (data/janna-live.js) the box and the CC button sit in the call's own caption strip under the video (.jnl-cap),
   so they never cover the widget's controls and stay visible in its full-screen mode; MIGCAPTIONS.place() re-checks at once. */
(function () {
  if (window.MIGCAPTIONS) return;
  var EN = window.MIGLANG === "en";
  /* the hologram kiosk (janna.html) has no language engine: its language comes from ?lang=en (sessionStorage "janna-lang") */
  if (!EN && window.JANNA_KIOSK) { try { EN = /[?&]lang=en\b/.test(location.search) || sessionStorage.getItem("janna-lang") === "en"; } catch (e) {} }
  var on = true; try { on = localStorage.getItem("mig-cc") !== "0"; } catch (e) {}
  var css = ''
    + '.mig-cc{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);z-index:2147483600;max-width:min(780px,calc(100vw - 32px));pointer-events:none;'
    + 'background:rgba(8,12,16,.86);color:#fff;border-radius:14px;padding:10px 18px 11px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);font:600 clamp(.95rem,1.4vw,1.12rem)/1.7 Cairo,"IBM Plex Sans Arabic",Tahoma,sans-serif;'
    + 'text-align:center;opacity:0;transition:opacity .25s ease;unicode-bidi:isolate}'
    + '.mig-cc.on{opacity:1}.mig-cc b{color:#e9c46a;font-weight:800;margin-inline-end:6px}.mig-cc .w{color:#fff}.mig-cc .d{color:rgba(255,255,255,.62)}'
    + '.mig-ccbtn{position:fixed;z-index:2147483601;left:calc(env(safe-area-inset-left,0px) + 12px);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);border:1px solid rgba(255,255,255,.35);background:rgba(8,12,16,.75);color:#fff;'
    + 'border-radius:8px;font:800 .72rem/1 Tahoma,sans-serif;padding:6px 7px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s}'
    + '.mig-ccbtn.show{opacity:.85;pointer-events:auto}.mig-ccbtn[aria-pressed="false"]{text-decoration:line-through;opacity:.55}'
    + 'body.mig-cc-up .mig-cc{bottom:calc(env(safe-area-inset-bottom,0px) + 86px)}'
    /* members' tools in Arabic (html.jn-quiet.jn-qrtl, set by data/janna-live.js / janna.js): Janna's / Bassem's headshot waits at the
       bottom-left corner, so the CC button moves beside it instead of on top of it */
    + 'html.jn-quiet.jn-qrtl .mig-ccbtn{left:calc(env(safe-area-inset-left,0px) + 88px);bottom:calc(env(safe-area-inset-bottom,0px) + 34px)}'
    + '@media (max-width:640px){.mig-cc{padding:8px 12px 9px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px)}}'
    + '@media (prefers-reduced-motion:reduce){.mig-cc,.mig-ccbtn{transition:none}}';
  var st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  var box = document.createElement("div"); box.className = "mig-cc"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); box.setAttribute("translate", "no");
  var btn = document.createElement("button"); btn.type = "button"; btn.className = "mig-ccbtn"; btn.textContent = "CC"; btn.setAttribute("translate", "no");
  btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.title = EN ? "Subtitles on/off" : "الترجمة المكتوبة تشغيل/إيقاف";
  function mount() { if (!document.body) return setTimeout(mount, 50); document.body.appendChild(box); document.body.appendChild(btn); lift(); place(); }
  /* the live call's caption strip when the call screen is open, otherwise the page */
  function place() {
    if (!document.body) return;
    var lv = document.querySelector(".jnl"), slot = lv && !lv.hidden ? lv.querySelector(".jnl-cap") : null;
    var host = slot || document.body;
    if (box.parentNode !== host) host.appendChild(box);
    if (btn.parentNode !== host) host.appendChild(btn);
    box.classList.toggle("in-call", !!slot);
  }
  mount();
  btn.addEventListener("click", function () { on = !on; btn.setAttribute("aria-pressed", on ? "true" : "false"); try { localStorage.setItem("mig-cc", on ? "1" : "0"); } catch (e) {} if (!on) hide(true); });

  /* keep clear of the plan-preview bar at the bottom of the page */
  function lift() { var pv = document.querySelector(".planpv"), r = pv && pv.getBoundingClientRect(); document.body.classList.toggle("mig-cc-up", !!(r && r.height > 0 && getComputedStyle(pv).display !== "none" && getComputedStyle(pv).visibility !== "hidden")); }
  setInterval(function () { lift(); place(); }, 1500);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  /* cue tags in any script (🌐: Janna's Arabic calls already show [دافئة] [متفهمة] [داعم]; more languages = more translated tags) */
  function clean(s) {
    return String(s || "").replace(/\[[^\[\]\n]{1,24}\]/g, "")
      .replace(/https?:\/\/\S+/g, "").replace(/(?:\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDEFF]|[\u2600-\u27BF\uFE0F])/g, "").replace(/\s+/g, " ").trim();
  }
  function speakerName() {
    var api = window.MIGCAPTIONS;
    if (api && api.speaker) return api.speaker;
    var bassemActive = !!(window.BASSEM && (typeof window.BASSEM.active === "function" ? window.BASSEM.active() : window.BASSEM.active !== false)) || document.documentElement.classList.contains("bassem-on");
    return bassemActive ? (EN ? "Bassem" : "باسم") : (EN ? "Janna" : "جنة");
  }
  /* split long text into readable chunks (~2 lines) at sentence/phrase breaks */
  function chunks(text) {
    /* the live call's caption strip on a phone is narrow: shorter chunks keep it to two lines */
    var narrow = box.classList.contains("in-call") && box.parentNode && box.parentNode.clientWidth < 460;
    var out = [], rest = text, max = narrow ? 62 : 110;
    while (rest.length > max) {
      var cut = -1, seps = [". ", "؟ ", "? ", "! ", "، ", ", ", "؛ ", " "];
      for (var i = 0; i < seps.length && cut < 0; i++) { var k = rest.lastIndexOf(seps[i], max); if (k > (narrow ? 24 : 40)) cut = k + seps[i].length; }
      if (cut < 0) cut = max;
      out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut);
    }
    if (rest.trim()) out.push(rest.trim());
    return out;
  }
  var cur = null, hideT = 0, timer = 0;
  /* a caption's direction (🌐 the persona may speak any language): rtl when it has a letter of a right-to-left script (Arabic, Hebrew,
     Syriac, Thaana …: an Arabic caption that starts with «Rand Water» stays rtl, as before), ltr when it has another letter, else the page's.
     The box isolates its content (unicode-bidi:isolate, so this dir decides — never the name's letters), the name and the words each in
     their own run: «جنة:» comes first in a French caption on the Arabic page, on the right of an Arabic one exactly as before */
  function dirOf(s) { return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.test(s) ? "rtl" : /[A-Za-z\u00c0-\u024f\u0370-\u058f\u0900-\u1fff\u2c00-\ud7ff\uf900-\ufb1c]/.test(s) ? "ltr" : EN ? "ltr" : "rtl"; }
  function render(who, chunk, done) {
    if (!on) return;
    place();
    var d = dirOf(chunk);
    box.innerHTML = "<b><bdi>" + esc(who) + "</bdi>:</b>" + '<span dir="' + d + '" style="unicode-bidi:isolate"' + (done ? ' class="w"' : "") + ">" + esc(chunk) + "</span>";
    box.dir = d;
    box.classList.add("on"); btn.classList.add("show");
  }
  function hide(now) { clearTimeout(hideT); hideT = setTimeout(function () { box.classList.remove("on"); if (now) btn.classList.remove("show"); }, now ? 0 : 1400); }
  /* show a whole text with timed chunks (used for live calls, videos and as fallback) */
  function show(text, opt) {
    opt = opt || {}; text = clean(text); if (!text) return;
    clearTimeout(timer); clearTimeout(hideT); place();
    var who = opt.speaker || speakerName(), parts = chunks(text), i = 0;
    var perChar = opt.ms ? opt.ms / Math.max(1, text.length) : (/[؀-ۿ]/.test(text) ? 72 : 62);
    (function next() {
      if (i >= parts.length) { hide(); return; }
      render(who, parts[i]); var d = Math.max(1600, parts[i].length * perChar); i++; timer = setTimeout(next, d);
    })();
  }

  /* 1) wrap browser speech synthesis */
  var synth = window.speechSynthesis;
  if (synth && synth.speak && !synth.__migcc) {
    var orig = synth.speak.bind(synth), origCancel = synth.cancel ? synth.cancel.bind(synth) : null;
    synth.speak = function (u) {
      try {
        var text = clean(u && u.text), who = speakerName(), parts = chunks(text), starts = [], pos = 0;
        parts.forEach(function (p) { var k = text.indexOf(p, pos); starts.push(k < 0 ? pos : k); pos = (k < 0 ? pos : k) + p.length; });
        var gotBoundary = false;
        clearTimeout(timer); clearTimeout(hideT);
        if (text) {
          /* show at once (also covers devices with no voice installed, where "start" never fires); boundary events then keep it in sync */
          show(text, { speaker: who });
          u.addEventListener("boundary", function (e) {
            if (!gotBoundary) { gotBoundary = true; clearTimeout(timer); }
            var ci = e.charIndex || 0, idx = 0; for (var j = 0; j < starts.length; j++) if (ci >= starts[j]) idx = j;
            if (cur !== idx) { cur = idx; render(who, parts[idx]); }
          });
          u.addEventListener("end", function () { cur = null; if (gotBoundary) hide(); });
          u.addEventListener("error", function () { cur = null; hide(); });
        }
      } catch (e) {}
      return orig(u);
    };
    if (origCancel) synth.cancel = function () { clearTimeout(timer); hide(); return origCancel(); };
    synth.__migcc = 1;
  }

  /* 2) live video calls (Anam widget): agent transcript messages */
  document.addEventListener("anam-agent:message-received", function (e) {
    var d = e.detail || {}; if (d.role !== "agent" && d.role !== "assistant") return;
    var lp = window.JANNA_LIVE && window.JANNA_LIVE.persona, live = "";
    try { live = typeof lp === "function" ? lp() : String(lp || ""); } catch (x) {}
    var who = live === "bassem" ? (EN ? "Bassem" : "باسم") : live === "janna" ? (EN ? "Janna" : "جنة") : undefined;
    show(d.content || d.text || "", { speaker: who });
  }, true);
  document.addEventListener("anam-agent:session-ended", function () { hide(); }, true);

  window.MIGCAPTIONS = { show: show, hide: function () { clearTimeout(timer); hide(true); }, speaker: null, on: function () { return on; }, place: place };
})();
