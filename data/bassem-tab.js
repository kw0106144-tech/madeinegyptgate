/* «باسم معاك» — the bar of a page that came out of Bassem's live call (data/bassem-tab.js). Owner 2026-11-19: «لما بفتح المناقصة اللي
   باسم فاتحا بتفتح صفحة تانيه فيها جنة والمفروض ان باسم بس هو اللي بيكمل».
   During Bassem's call a page leaves his shared screen only into a tab of its own (data/janna-live.js openTab: «افتح الصفحة دي», a
   result's link, a same-site link on the screen that opens a new tab, ctrl / middle click included), and the call goes on in its tab.
   In that tab Janna does not appear and no second call starts (data/janna-live.js, janna-welcome.js, janna.js, bassem.js and
   bassem-stand.js read the same mark: window.MIG_WB); this file, loaded by janna-live.js or janna-welcome.js only there, shows a small
   bar at the bottom of the page: «باسم معاك في الصفحة التانية — ارجع للمكالمة» / "Bassem is with you in the other tab — Back to the call".
   - «ارجع للمكالمة» brings the call's tab to the front from the member's tap: the call's tab (window.opener) is named «mig-call-<ms>» and
     window.open("", that name) selects it (checked in a real Chrome 153: opener.focus() alone does not switch tabs), plus opener.focus().
     When this page is still in front a moment later (a browser that does not allow either), the bar says where the call is and offers
     «اقفل التاب دي» (window.close(): the browser then shows the tab this one came from). The call's page shows its video again and says
     «أهلاً بيك تاني» (JANNA_LIVE.welcomeBack).
   - It asks the call's tab (window.opener) whether the call is still on: every 4 s while this page is shown, whenever the member comes
     back to it, and at once when the call is closed there (janna-live.js wbTell → update()). Once it is over (that tab closed or gone to
     another page, or no Bassem call open there) the bar says «المكالمة مع باسم خلصت» with «كلّمه من مكتبه» (/advisor/: a call starts
     there only by the member's own tap) and the mark is dropped: the tab's next pages are ordinary ones, with Janna as everywhere.
     Without an opener to ask (a link that carried ?with=bassem by itself) the bar keeps its first words and the mark lasts its 4 h.
   - It never covers a page dialog (aria-modal) or the phone menu (it slides away meanwhile); ✕ hides it on this page.
   Bilingual in code (T(ar, en)), translate="no" (the page translator leaves it alone). ES5, no libraries, no network.
   API: window.MIG_WB_TAB = {back(), state() → "live" | "ended" | "unknown", update(), end()} */
(function () {
  "use strict";
  var W = window, D = document, DE = D.documentElement;
  if (W.MIG_WB_TAB) return;
  try { if (W.top !== W) return; } catch (e0) { return; }
  if (W.MIG_WB !== true) return; /* only in Bassem's tab (janna-live.js / janna-welcome.js decided, and loaded this file) */
  var EN = String(W.MIGLANG || DE.getAttribute("lang") || "ar").slice(0, 2).toLowerCase() === "en";
  function T(ar, en) { return EN ? en : ar; }
  function lsGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  var CSS = ""
    + ".mig-wb-bar{position:fixed;z-index:2147480000;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);transform:translateX(-50%);"
    + "display:flex;align-items:center;gap:10px;box-sizing:border-box;width:max-content;max-width:calc(100vw - 20px);margin:0;padding:6px 6px 6px 14px;"
    + "border-radius:999px;background:#04121a;color:#dff7ff;border:1px solid rgba(120,220,255,.55);box-shadow:0 0 22px -6px rgba(90,210,255,.85),0 14px 30px -14px rgba(0,0,0,.7);"
    + "font:700 14px/1.45 Cairo,Tajawal,Tahoma,sans-serif;text-align:start;transition:transform .35s cubic-bezier(.2,.8,.25,1),opacity .25s}"
    + ".mig-wb-bar[dir=rtl]{padding:6px 14px 6px 6px}.mig-wb-bar[hidden]{display:none}"
    + ".mig-wb-bar.away{transform:translate(-50%,calc(100% + 40px));opacity:0;pointer-events:none}"
    + ".mig-wb-bar .mwb-av{position:relative;flex:none;width:34px;height:34px}"
    + ".mig-wb-bar .mwb-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:50% 18%;border:2px solid #e9c46a;display:block;box-sizing:border-box;background:#0b2230}"
    + ".mig-wb-bar .mwb-av i{position:absolute;bottom:-1px;inset-inline-end:-1px;width:11px;height:11px;border-radius:50%;background:#ff3b5c;border:2px solid #04121a;animation:mwbRec 1.6s ease infinite}"
    + ".mig-wb-bar.ended .mwb-av i{background:#8aa1ab;animation:none}"
    + "@keyframes mwbRec{0%{box-shadow:0 0 0 0 rgba(255,59,92,.6)}70%{box-shadow:0 0 0 7px rgba(255,59,92,0)}100%{box-shadow:0 0 0 0 rgba(255,59,92,0)}}"
    + ".mig-wb-bar .mwb-tx{flex:1 1 auto;min-width:0}.mig-wb-bar .mwb-dash{flex:none;opacity:.6}"
    + ".mig-wb-bar button,.mig-wb-bar a{flex:none;display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-height:34px;margin:0;padding:7px 15px;border:0;border-radius:999px;"
    + "font:inherit;font-weight:800;line-height:1.2;cursor:pointer;text-decoration:none;white-space:nowrap;box-shadow:none}"
    + ".mig-wb-bar .mwb-go,.mig-wb-bar .mwb-desk{background:#5ad2ff;color:#04121a}.mig-wb-bar .mwb-go:hover,.mig-wb-bar .mwb-desk:hover{background:#8fe2ff}"
    + ".mig-wb-bar .mwb-cl{background:transparent;color:#bff3ff;border:1px solid rgba(120,220,255,.55)}"
    + ".mig-wb-bar .mwb-x{width:30px;height:30px;min-height:0;padding:0;justify-content:center;background:rgba(255,255,255,.1);color:#dff7ff;font-size:13px}"
    + ".mig-wb-bar [hidden]{display:none!important}"
    + ".mig-wb-bar button:focus-visible,.mig-wb-bar a:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}"
    + "html.nav-open .mig-wb-bar{visibility:hidden}"
    + "@media (max-width:560px){.mig-wb-bar{width:calc(100vw - 16px);max-width:none;gap:7px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);font-size:12.5px}"
    + ".mig-wb-bar .mwb-dash{display:none}.mig-wb-bar button,.mig-wb-bar a{padding:6px 11px}.mig-wb-bar .mwb-av{width:30px;height:30px}}"
    + "@media (prefers-reduced-motion:reduce){.mig-wb-bar{transition:none}.mig-wb-bar .mwb-av i{animation:none}}"
    + "@media print{.mig-wb-bar{display:none!important}}";

  var bar = null, tx = null, dash = null, go = null, cl = null, desk = null, shown = "", hintT = 0, pollT = 0;
  /* the call's tab: the window that opened this one (same site), while it is there */
  function opener() { try { var o = W.opener; return o && o !== W ? o : null; } catch (e) { return null; } }
  /* "live": a Bassem call is open in the call's tab · "ended": that tab closed, went to another site / page, or has no Bassem call open ·
     "unknown": no opener to ask (the mark came with the link itself). A closed call's tab reads as no opener at all (Chrome:
     window.opener → null), so a tab still named «mig-bassem-<ms>» (openTab names it and always opens it with an opener) that has lost
     its opener lost the call: "ended" */
  function state() {
    var o = opener(); if (!o) return /^mig-bassem-\d+$/.test(String(W.name || "")) ? "ended" : "unknown";
    try { if (o.closed) return "ended"; var J = o.JANNA_LIVE; return J && J.isOpen && J.isOpen() && J.persona && J.persona() === "bassem" ? "live" : "ended"; } catch (e) { return "ended"; }
  }
  /* the call is over: the tab's next pages are ordinary ones (this page stays as it is) */
  function end() {
    W.MIG_WB = false; /* this page's call buttons work again (data/janna-live.js wbHold) */
    try { W.sessionStorage.removeItem("mig-wb"); } catch (e) {}
    try { if (/^mig-bassem-/.test(String(W.name || ""))) W.name = ""; } catch (e) {}
    show("ended");
  }
  function deskUrl() { return EN && lsGet("mig-lang") !== "en" ? "/advisor/?lang=en" : "/advisor/"; }
  function headshot() {
    var h = (W.BASSEM_REAL && W.BASSEM_REAL.headshot) || "img/bassem/head.webp";
    return /^(https?:)?\//.test(h) ? h : "/" + h;
  }
  function el(tag, cls, txt) { var x = D.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
  function build() {
    if (bar || !D.body) return;
    if (!D.getElementById("mig-wb-bar-css")) { var s = D.createElement("style"); s.id = "mig-wb-bar-css"; s.textContent = CSS; (D.head || DE).appendChild(s); }
    bar = el("div", "mig-wb-bar"); bar.dir = EN ? "ltr" : "rtl"; bar.lang = EN ? "en" : "ar"; bar.setAttribute("translate", "no");
    bar.setAttribute("role", "region"); bar.setAttribute("aria-label", T("مكالمتك مع باسم", "Your call with Bassem"));
    var av = el("span", "mwb-av"), im = el("img"); im.alt = ""; im.width = 34; im.height = 34; im.decoding = "async"; im.src = headshot();
    im.onerror = function () { im.onerror = null; im.src = "/img/bassem.jpg"; };
    av.appendChild(im); av.appendChild(el("i")); bar.appendChild(av);
    tx = el("span", "mwb-tx"); tx.setAttribute("role", "status"); tx.setAttribute("aria-live", "polite"); bar.appendChild(tx);
    dash = el("span", "mwb-dash", "—"); dash.setAttribute("aria-hidden", "true"); bar.appendChild(dash);
    go = el("button", "mwb-go", "🎥 " + T("ارجع للمكالمة", "Back to the call")); go.type = "button"; go.onclick = back; bar.appendChild(go);
    cl = el("button", "mwb-cl", T("اقفل التاب دي", "Close this tab")); cl.type = "button"; cl.hidden = true; bar.appendChild(cl);
    cl.onclick = function () { try { W.close(); } catch (e) {} setTimeout(function () { if (cl) cl.hidden = true; }, 400); }; /* a tab the browser will not let a page close stays: only the words remain */
    desk = el("a", "mwb-desk", T("كلّمه من مكتبه", "Call him from his desk")); desk.href = deskUrl(); desk.hidden = true; bar.appendChild(desk);
    var x = el("button", "mwb-x", "✕"); x.type = "button"; x.title = T("إخفاء", "Hide"); x.setAttribute("aria-label", x.title);
    x.onclick = function () { bar.hidden = true; clearInterval(pollT); }; bar.appendChild(x);
    D.body.appendChild(bar);
  }
  /* "live" (also "unknown") · "hint" (the call's tab did not come to the front) · "ended" */
  function show(k) {
    build(); if (!bar || shown === k) return; shown = k;
    bar.classList.toggle("ended", k === "ended");
    tx.textContent = k === "ended" ? T("المكالمة مع باسم خلصت", "Your call with Bassem has ended")
      : k === "hint" ? T("المكالمة مفتوحة في التاب اللي جيت منها — ارجعلها من شريط التابات", "The call is open in the tab you came from — switch to it from your tab bar")
      : T("باسم معاك في الصفحة التانية", "Bassem is with you in the other tab");
    dash.hidden = k !== "live"; go.hidden = k !== "live"; cl.hidden = k !== "hint"; desk.hidden = k !== "ended";
  }
  /* «ارجع للمكالمة»: the call's tab to the front, from this tap. A page cannot switch tabs with focus() alone (Chrome 153 keeps the
     current tab), but window.open("", <that tab's name>) from a tap selects the tab of that name: the call's tab gets a name of its own
     («mig-call-<ms>») first. A browser that still keeps this tab in front → the hint (below). */
  function front(o) {
    var nm = "", tok = "t" + new Date().getTime() + Math.random(), w = null, same = true;
    try { nm = String(o.name || ""); if (!/^mig-call-\d+$/.test(nm)) { nm = "mig-call-" + new Date().getTime(); o.name = nm; } o.__migTok = tok; } catch (e) { nm = ""; }
    if (nm) {
      try { w = W.open("", nm); } catch (e) { w = null; }
      /* the window it answered is the call's own (it carries the token) — anything else is a blank tab it just made: closed at once */
      try { same = !w || w.__migTok === tok; } catch (e) { same = true; }
      if (!same) { try { w.close(); } catch (e) {} }
    }
    try { o.focus(); } catch (e) {}
  }
  function back() {
    var o = opener();
    if (state() === "ended") { end(); return; }
    if (o) {
      front(o);
      try { if (o.JANNA_LIVE && o.JANNA_LIVE.welcomeBack) o.JANNA_LIVE.welcomeBack(); } catch (e) {}
    }
    clearTimeout(hintT);
    hintT = setTimeout(function () {
      if (D.hidden || (D.hasFocus && !D.hasFocus())) return; /* the call's tab is in front (or its window has the focus) */
      show("hint");
      hintT = setTimeout(function () { if (shown === "hint") show("live"); }, 15000);
    }, 650);
  }
  function update() {
    if (shown === "ended") return "ended";
    var s = state();
    if (s === "ended") { end(); return s; }
    if (shown !== "hint") show("live");
    return s;
  }
  /* a page dialog (aria-modal) or the call overlay of this tab is open: the bar slides away meanwhile */
  function covered() {
    var lv = D.querySelector(".jnl"); if (lv && !lv.hidden) return true;
    var list = D.querySelectorAll('[aria-modal="true"]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (bar && bar.contains(e)) continue;
      if (e.closest && e.closest('[aria-hidden="true"],[inert],[hidden]')) continue;
      var cs = W.getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
      var r = e.getBoundingClientRect(); if (r.width > 40 && r.height > 40) return true;
    }
    return false;
  }
  function tick() { if (!bar || bar.hidden || D.hidden) return; bar.classList.toggle("away", covered()); }
  function start() {
    build(); if (!bar) return;
    update(); tick();
    var n = 0;
    pollT = setInterval(function () { if (D.hidden || !bar || bar.hidden) return; tick(); if (++n % 4 === 0) update(); }, 1000);
    D.addEventListener("visibilitychange", function () { if (!D.hidden) { update(); tick(); } });
    W.addEventListener("focus", function () { update(); });
    W.addEventListener("pageshow", function (e) { if (e && e.persisted) { shown = shown === "ended" ? "ended" : ""; update(); } });
  }
  W.MIG_WB_TAB = { back: back, state: state, update: update, end: end };
  if (D.body) start(); else D.addEventListener("DOMContentLoaded", start);
})();
