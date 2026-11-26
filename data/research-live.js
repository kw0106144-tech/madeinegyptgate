/* «بحث وكتابة عميقة» in Bassem's live call (design part A §A.11.3, §A.12.1; worker/src/research.js). Loaded lazily by data/janna-live.js
   (with its ?v=) only while the owner's switch research_bassem is on; janna-live.js ALWAYS registers Bassem's client tool bassem_research
   and answers «off» at once when this file is absent, the switch is off or the page is the kiosk — so a switch OFF never stalls a call.
     MIGRESEARCH.onTool(host, args) → Promise of the tool's answer (≤ 5 s; mail ≤ 8 s): start / status / mail. The answer is the Worker's own
       line (`ack`), which never carries a link, a document key or a source.
     Polling: GET /api/advisor/research/<id> every 2 s (4 s after 30 s), again when the tab comes back (visibilitychange); a heartbeat
       {action: "alive"} every 30 s while the call is live (the automatic e-mail waits for it to stop).
     Done: host.ctx(block) at once (the persona reads it at its next turn); at the first quiet moment (host.quiet(): nobody speaks, no tool
       runs) host.talk(say) when the SDK has it (Arabic / English calls), else the chip «🔔 نتيجة البحث جاهزة — اسمعها», whose tap sends the
       member's own words «قولّي نتيجة البحث». The outcome (announced / cut) is posted once.
     The overlay .mrs-box: up to 5 items — the Worker's label, place, deadline + the status computed by the server NOW, badge, the checked
       line — every string through textContent (never innerHTML of server text), a link only when the server built one (same-origin path),
       «📄 افتح المستند» on the call's screen, «📩 ابعتهولي» (the member's own e-mail).
   ES5 only (CLAUDE.md 2.1). Texts T(ar, en); translate="no" on the overlay. */
(function () {
  "use strict";
  if (window.MIGRESEARCH) return;
  var EN = function () { return window.MIGLANG === "en"; };
  var T = function (ar, en) { return EN() ? en : ar; };
  var JOBS = {}, ORDER = [], CSS_DONE = false;
  var POLL_MS = 2000, POLL_SLOW_MS = 4000, POLL_MAX_MS = 240000, ALIVE_MS = 30000, ALIVE_MAX_MS = 1800000, GATE_MS = 250, GATE_MAX_MS = 45000, START_WAIT_MS = 5000, MAIL_WAIT_MS = 8000;

  function api(host) { return String((host && host.api) || window.MIG_API_BASE || "/api").replace(/\/+$/, ""); }
  function req(host, method, path, body, ms) {
    return new Promise(function (res) {
      if (!window.fetch) { res({ status: 0, j: { code: "offline" } }); return; }
      var fin = false, h = { Accept: "application/json" }, tk = host && host.btok ? host.btok() : "", tm;
      if (body) h["Content-Type"] = "application/json";
      if (tk) h.Authorization = "Bearer " + tk;
      tm = setTimeout(function () { if (!fin) { fin = true; res({ status: 0, j: { code: "timeout" } }); } }, ms || 10000);
      fetch(api(host) + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }).then(function (r) {
        if (r.status === 204) return { status: 204, j: {} };
        return r.json().then(function (j) { return { status: r.status, j: j || {} }; }, function () { return { status: r.status, j: {} }; });
      }, function () { return { status: 0, j: { code: "offline" } }; }).then(function (x) { if (fin) return; fin = true; clearTimeout(tm); res(x); });
    });
  }
  function argsOf(a) {
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = {}; } }
    a = a && typeof a === "object" ? a : {};
    var keys = ["bodyParams", "arguments", "parameters", "input"], i, k, v;
    for (i = 0; i < keys.length; i++) { v = a[keys[i]]; if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } } if (v && typeof v === "object") for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) a[k] = v[k]; }
    return a;
  }
  function fold(s) { return String(s == null ? "" : s).toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
  function jobKey(a) { return [a.kind, a.product, a.market, a.governorate, a.question, a.subject, a.details ? String(a.details).slice(0, 80) : ""].map(fold).join("|"); }
  function offText() { return T("البحث الأعمق مش متاح دلوقتي. كمّل باللي رجع من الأدوات التانية، وماتوعدش بيه.", "The deeper search is not available right now. Go on with the other tools' results; promise nothing."); }
  function fire(phase, j) { try { var ev; var d = { phase: phase, label: j.label, kind: j.kind, top: j.top || [] }; if (typeof window.CustomEvent === "function") ev = new CustomEvent("mig:research", { detail: d }); else { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("mig:research", false, false, d); } window.dispatchEvent(ev); } catch (e) {} }
  function running(j) { return j && /^(queued|gathering|writing|checking)$/.test(j.state); }
  function latest() { for (var i = ORDER.length - 1; i >= 0; i--) if (JOBS[ORDER[i]]) return JOBS[ORDER[i]]; return null; }

  /* ---------- the tool ---------- */
  function onTool(host, raw) {
    var a = argsOf(raw), action = String(a.action || "start").toLowerCase();
    if (action === "status") return statusOf(host, a);
    if (action === "mail") return mailOf(host, a);
    var key = jobKey(a), now = +new Date(), i, j;
    for (i = 0; i < ORDER.length; i++) {
      j = JOBS[ORDER[i]]; if (!j || j.key !== key) continue;
      if (running(j)) return Promise.resolve(String(j.ack || "").slice(0, 250));
      if (j.state === "done" && now - j.doneAt < 900000) { if (j.block && host.ctx) host.ctx(j.block); return Promise.resolve(String(j.block || "").slice(0, 1200)); }
    }
    var run = latest();
    if (running(run)) return Promise.resolve(T("فيه بحث لسه شغّال (" + run.label + "): قوله كده، وأول ما يخلص يقدر يطلب التاني. ماتوعدش ببحث تاني.", "A search is still running (" + run.label + "): say so; once it is done another can start. Promise nothing else."));
    var chain = host.chainId ? host.chainId() : "", body = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k) && !/^(bodyParams|arguments|parameters|input)$/.test(k)) body[k] = a[k];
    body.action = "start"; body.call_key = key + "|" + chain; body.chain = chain; body.lang = host.lang ? host.lang() : (EN() ? "en" : "ar"); body.phone = !!(host.phone && host.phone());
    if (String(a.kind) === "quote" && host.heard) body.heard = host.heard();
    return req(host, "POST", "/advisor/research", body, START_WAIT_MS).then(function (x) {
      var d = x.j || {};
      if (d.id) track(host, d, key);
      if (d.ack) return String(d.ack);
      if (x.status === 0) return T("مش متأكد إن البحث بدأ؛ قوله إنك بتحاول، ولو بدأ هيظهر على الشاشة.", "Not sure the search started; say you are trying, and if it did it will appear on the screen.");
      return offText();
    });
  }
  function statusOf(host, a) {
    return req(host, "POST", "/advisor/research", { action: "status", label: a.label || "", lang: host.lang ? host.lang() : "" }, START_WAIT_MS).then(function (x) {
      var d = x.j || {}; if (d.id && JOBS[d.id]) apply(host, JOBS[d.id], d);
      return String(d.ack || T("مفيش بحث بالرقم ده في المكالمة دي.", "There is no search with that label in this call."));
    });
  }
  function mailOf(host, a) {
    var j = a.label ? null : latest();
    return req(host, "POST", "/advisor/research", { action: "mail", label: a.label || (j ? j.label : "") }, MAIL_WAIT_MS).then(function (x) {
      return String((x.j && x.j.ack) || T("مااتبعتش دلوقتي؛ قوله إنه يقدر يطلبه تاني.", "Not sent now; tell them they can ask again."));
    });
  }

  /* ---------- one job: polling, heartbeat, delivery ---------- */
  function track(host, d, key) {
    var j = JOBS[d.id];
    if (!j) { j = JOBS[d.id] = { id: d.id, label: d.label, kind: d.kind, key: key, state: d.state || "queued", ack: d.ack || "", at: +new Date(), doneAt: 0, top: [], told: "", host: host }; ORDER.push(d.id); if (ORDER.length > 8) delete JOBS[ORDER.shift()]; }
    fire("start", j); ui(host); poll(j); alive(j);
  }
  function apply(host, j, d) {
    var was = j.state;
    j.state = d.state || j.state; j.progress = d.progress || j.progress; j.eta = d.eta_s;
    if (d.state === "done") { j.top = d.top || []; j.say = d.say || ""; j.block = d.block || ""; j.title = d.title || ""; j.doc = d.doc_path || ""; if (!j.doneAt) j.doneAt = +new Date(); }
    if (was !== j.state) { fire(j.state === "done" ? "done" : j.state === "failed" ? "fail" : "step", j); if (j.state === "done") deliver(j); }
    ui(host);
  }
  function poll(j) {
    if (j.pt) return;
    var t0 = +new Date();
    (function next() {
      if (!running(j) || +new Date() - t0 > POLL_MAX_MS) { j.pt = 0; return; }
      j.pt = setTimeout(function () {
        if (document.hidden) { j.pt = 0; return; } /* the tab sleeps: polling resumes on visibilitychange */
        req(j.host, "GET", "/advisor/research/" + j.id, null, 8000).then(function (x) { if (x.status === 200 && x.j) apply(j.host, j, x.j); next(); });
      }, +new Date() - t0 > 30000 ? POLL_SLOW_MS : POLL_MS);
    })();
  }
  function alive(j) {
    if (j.at2) return;
    j.at2 = setInterval(function () {
      var h = j.host;
      if (+new Date() - j.at > ALIVE_MAX_MS || !h || !h.live || !h.live()) { clearInterval(j.at2); j.at2 = 0; return; }
      req(h, "POST", "/advisor/research/" + j.id, { action: "alive" }, 6000);
    }, ALIVE_MS);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) return; for (var i = 0; i < ORDER.length; i++) { var j = JOBS[ORDER[i]]; if (j && running(j)) { j.pt = 0; poll(j); } } });
  function told(j, v) { if (j.told) return; j.told = v; req(j.host, "POST", "/advisor/research/" + j.id, { action: "told", told: v }, 6000); }
  /* the block at once, the spoken line at the first quiet gap (never while the member speaks), else the chip */
  function deliver(j) {
    var h = j.host; if (!h) return;
    if (j.block && h.ctx) h.ctx(j.block);
    var t0 = +new Date(), lang = h.lang ? h.lang() : "ar";
    var canTalk = h.talk && (lang === "ar" || lang === "en");
    if (!canTalk || !j.say) { chip(j); return; }
    (function gate() {
      if (+new Date() - t0 > GATE_MAX_MS) { chip(j); return; }
      if (h.live && h.live() && h.quiet && h.quiet()) { if (h.talk(j.say)) { told(j, "announced"); return; } chip(j); return; }
      setTimeout(gate, GATE_MS);
    })();
  }

  /* ---------- the overlay ---------- */
  function css() {
    if (CSS_DONE) return; CSS_DONE = true;
    var s = document.createElement("style");
    s.textContent = ".mrs-box{position:absolute;inset-inline-end:10px;bottom:10px;z-index:30;width:min(360px,calc(100% - 20px));max-height:70%;overflow:auto;background:#fff;color:#1d1d1f;border:1px solid #e3d6d8;border-radius:14px;box-shadow:0 10px 30px -12px rgba(0,0,0,.35);font:14px/1.6 Tahoma,Arial,sans-serif;padding:10px 12px}"
      + ".mrs-box h4{margin:0 0 6px;font-size:.95rem;font-weight:800;display:flex;gap:6px;align-items:center}.mrs-box h4 b{flex:1}.mrs-x{border:0;background:none;font-size:1rem;cursor:pointer;min-width:32px;min-height:32px}"
      + ".mrs-st{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}.mrs-st span{background:#f4eef0;border-radius:999px;padding:2px 8px;font-size:.78rem}"
      + ".mrs-it{border-top:1px solid #f0e6e8;padding:6px 0}.mrs-it b{display:block;font-weight:700}.mrs-it small{color:#5c5c66;display:block}.mrs-bd{display:inline-block;font-size:.72rem;background:#E3F7EA;color:#0B6B35;border-radius:6px;padding:0 6px;margin-inline-start:4px}"
      + ".mrs-a{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.mrs-a button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:8px 12px;min-height:40px;cursor:pointer;background:#8E0B20;color:#fff}.mrs-a button.l{background:#f4f5f7;color:#1d1d1f;border:1px solid #ddd}"
      + ".mrs-chip{display:block;width:100%;margin-top:6px;background:#FFF4D6!important;color:#7A5A00!important}@media(prefers-color-scheme:dark){.mrs-box{background:#1d1b1e;color:#f2eef0;border-color:#3a3236}.mrs-st span{background:#2c262a}.mrs-it{border-color:#3a3236}.mrs-it small{color:#b9b0b4}}";
    document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  var ST = { open: ["مفتوحة", "Open"], closing: ["بتقفل قريب", "Closing soon"], closed: ["ميعادها خلص", "Deadline passed"], unknown: ["ميعادها مش معروف", "Deadline not known"] };
  function box(host) {
    var root = (host && host.ov) || document.body, b = root.querySelector(".mrs-box");
    if (!b) { css(); b = el("div", "mrs-box"); b.setAttribute("translate", "no"); b.setAttribute("dir", EN() ? "ltr" : "rtl"); b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite"); root.appendChild(b); }
    return b;
  }
  function ui(host) {
    var j = latest(); if (!j) return;
    var b = box(host); while (b.firstChild) b.removeChild(b.firstChild);
    var hd = el("h4"), x = el("button", "mrs-x", "✕");
    hd.appendChild(el("b", "", j.state === "done" ? (j.title || T("نتيجة البحث", "Search result")) : T("🔎 بحث أعمق", "🔎 Deeper search")));
    x.setAttribute("aria-label", T("اقفل", "Close")); x.onclick = function () { b.style.display = "none"; }; hd.appendChild(x); b.appendChild(hd); b.style.display = "";
    var st = el("div", "mrs-st"), pr = j.progress || {};
    st.appendChild(el("span", "", T("🔎 بجمع البيانات ", "🔎 Gathering ") + (pr.gather === "done" || j.state === "done" ? "✓" : "⏳")));
    st.appendChild(el("span", "", T("📄 بكتب المستند ", "📄 Writing ") + (j.state === "done" ? "✓" : j.state === "failed" ? "✕" : "⏳")));
    b.appendChild(st);
    if (j.state === "failed") b.appendChild(el("div", "", T("البحث ماكملش.", "The search did not finish.")));
    var top = j.top || [];
    for (var i = 0; i < top.length && i < 5; i++) {
      var it = top[i], row = el("div", "mrs-it"), nm = el("b", "", it.label || "");
      if (it.badge) nm.appendChild(el("span", "mrs-bd", it.badge === "member" ? T("عضو على المنصة", "Member on the platform") : T("✓ موثّق من فريق المنصة", "✓ Verified by the platform team")));
      row.appendChild(nm);
      var meta = [it.entity && String(it.label).indexOf(it.entity) < 0 ? it.entity : "", it.place || it.country || "", it.deadline ? T("آخر ميعاد ", "Deadline ") + it.deadline : "", it.status && ST[it.status] ? T(ST[it.status][0], ST[it.status][1]) : ""].filter(function (v) { return !!v; }).join(" · ");
      if (meta) row.appendChild(el("small", "", meta));
      if (it.line) row.appendChild(el("small", "", it.line));
      if (it.link && /^\/(?!\/)[^\s"'<>\\]*$/.test(it.link)) (function (u) { row.style.cursor = "pointer"; row.onclick = function () { if (host.go) host.go(u); }; })(it.link);
      b.appendChild(row);
    }
    if (j.state === "done") {
      var ac = el("div", "mrs-a"), op = el("button", "", T("📄 افتح المستند", "📄 Open the document")), ml = el("button", "l", T("📩 ابعتهولي", "📩 E-mail it to me"));
      op.onclick = function () { if (host.go) host.go("/research/#" + j.id); };
      ml.onclick = function () { ml.disabled = true; req(host, "POST", "/advisor/research/" + j.id + "/mail", {}, MAIL_WAIT_MS).then(function (x) { ml.textContent = x.j && x.j.sent ? T("✓ اتبعت على إيميلك", "✓ Sent to your e-mail") : T("مااتبعتش", "Not sent"); }); };
      ac.appendChild(op); ac.appendChild(ml); b.appendChild(ac);
      if (j.chip && !j.told) {
        var c = el("button", "mrs-chip", T("🔔 نتيجة البحث جاهزة — اسمعها", "🔔 The search result is ready — hear it"));
        c.onclick = function () { if (j.block && host.ctx) host.ctx(j.block); if (host.nudge) host.nudge(T("قولّي نتيجة البحث", "Tell me the search result")); j.chip = false; told(j, "announced"); ui(host); };
        ac.appendChild(c);
      }
    }
  }
  function chip(j) { j.chip = true; ui(j.host); }

  /* Bassem's next session part (a renewed connection) hears what is pending */
  function resumeLine() {
    var j = latest(); if (!j || (!running(j) && j.state !== "done")) return "";
    return EN() ? "[PLATFORM NOTE: in this call there is a deeper search (" + j.label + ") that is " + (running(j) ? "still running" : "done, its result on the screen") + ". If asked about it call bassem_research with action=status and label=" + j.label + "; never answer from memory.]"
      : "[ملاحظة من المنصة: في المكالمة دي فيه بحث أعمق (" + j.label + ") " + (running(j) ? "لسه شغّال" : "خلص ونتيجته على الشاشة") + ". لو سأل عنه نادي bassem_research بـ action=status و label=" + j.label + "، وماتجاوبش من دماغك.]";
  }
  window.MIGRESEARCH = { onTool: onTool, resumeLine: resumeLine, jobs: function () { return ORDER.map(function (id) { return JOBS[id]; }); }, _argsOf: argsOf, _jobKey: jobKey };
})();
