/* «ذاكرة باسم» — the BROWSER side of Bassem's search memory and web search (data/bassem-memory.js).
   Owner 2026-11-18: «أنا لما قولتلك عايز تفاعل يبقي يكون عنده اكسيس كامل في المنصة ويكون عنده ذاكره بحث توصله بكل حاجه سواء في
   المنصه او غيرها». The store is the Worker's /api/advisor/memory (worker/src/memory.js); the web search is the Anam SERVER_WEBHOOK
   bassem_web_search (POST /api/advisor/web, worker/src/websearch.js). This file only listens, writes and shows.
   Loaded lazily by data/janna-live.js when Bassem's call screen opens (JANNA_LIVE.open({persona:"bassem"})), then attaches to every Anam
   SDK client janna-live.js announces: window "mig:live-client" {client, persona} (or window.MIG_LIVE_CLIENT when this file arrived after
   the event). Bassem's calls (his member's sign-in) and, since 0009, Janna's calls (the visitor id — see 5). One CALL = every client of one call (a call that goes on
   past a session cap is a chain of sessions: same call_id, the turn numbers go on).
   1) memory writes, with the member's own sign-in (Bearer: the platform session localStorage "mig-tok", else Bassem's advisor token
      sessionStorage "mig-adv-token" — a refused one is tried once with the other, as janna-live.js does for the call itself):
        {kind:"search", call_id, tool, query, market, count, results≤5}   each completed search (bassem_intel, janna_lookup, janna_search,
                                                                         bassem_web_search, janna_item / platform_item / bassem_open_item,
                                                                         bassem_open_opportunity) — only what the tool REALLY returned
        {kind:"turns", call_id, turns≤30 [{role, text, seq}]}             the conversation (MESSAGE_HISTORY_UPDATED), every 5 minutes
        {kind:"summary", call_id, turns?, tools≤40, final, started_at}    every 5 minutes (final:false) and when the call ends (final:true);
                                                                         the Worker builds the summary itself (no LLM)
      Server tools report their result in TOOL_CALL_COMPLETED; data/bassem-live-tools.js reports what its screen tools found as a
      structured window "mig:screen-result" {tool, query, count, items} (stored as is); the client tools' handlers are also watched through
      a pass-through wrapper of client.registerToolCallHandler (the value they return is never changed). E-mail bodies / addresses /
      phone numbers in tool arguments are dropped here (the Worker masks the rest).
   2) bassem_recall {query} — CLIENT tool, awaitResult:true (anam/tools.json): GET /api/advisor/memory?q=&limit=5 → the Worker's short
      text goes back to the LLM (≤ 1,000 characters, ≤ 6.5 s; any failure is said as it is, never a guess); the hits fly out on the
      hologram («من الذاكرة»).
   3) the web tools (SERVER webhooks, worker/src/websearch.js + web-hunt.js): bassem_web_search / bassem_web_hunt in Bassem's calls,
      janna_web_search / janna_web_hunt in Janna's — their answer {count, results[{title, url, snippet, source, date, type?}], text} |
      {error, text} arrives in TOOL_CALL_COMPLETED: the hologram shows the titles with their source domain («من الإنترنت»: MIGHOLO.result;
      skipped when data/call-holo.js MIG_CALL_HOLO.owns(tool) says its cards show it), and a clickable list sits on the shared screen
      (a hunt's results with their type: مناقصة / طلب عرض سعر / عميل محتمل / مشروع جديد / خبر) — links open in a NEW TAB (other sites
      cannot be shown inside the shared-screen iframe). A hunt is remembered as query «product · market», its entities = the sites.
      Webhook arguments arrive nested in TOOL_CALL_STARTED ({bodyParams:{…}}, review 2026-11-20 S12): args() unwraps them.
   4) the OUTCOME of each action (consolidation 2026-11-18, critic D): data/janna-live.js reports it on window "mig:tool-outcome"
      {tool, outcome: ok|refused|failed} (its done() sends a success there too); server tools report it in
      TOOL_CALL_COMPLETED / TOOL_CALL_FAILED. Each tool record of the call summary carries {n, name, args, outcome?} — the Worker leaves
      refused / failed actions out of «الخطوات الجاية» (a refused follow is never remembered as an open follow-up).
   OWNER'S MEMORY POLICY (2026-11-18 23:50): Bassem's memory with each member STAYS — it only grows and is consolidated day after day, so
   he carries on with the member's tasks; there is no member-facing deletion here (no «امسح ذاكرتي», no DELETE call). The only deletion
   path is the owner's audited Control Center action for a formal legal data-subject request (PDPL 151/2020).
   5) MEMORY UPGRADE (worker migration 0009, 2026-11-19):
      - JANNA'S CALLS ARE REMEMBERED TOO (persona "janna"): the same recording goes to POST /api/janna/memory with the page's random
        visitor id (data/janna-live.js JANNA_LIVE.visitorId, localStorage "mig-vid") and the member's own sign-in when he has one (an id
        linked to a member is his: 409 visitor_linked → a new id, review 2026-11-19 #7); a contact Janna's tools receive
        (janna_fill_registration / janna_start_meeting / janna_schedule_meeting / janna_fill_contact: e-mail, mobile) is sent once as
        {kind:"contact"} — the Worker keeps only keyed hashes (to link the visitor to his member account after registration).
      - each tool record carries s = the turn number it started at (the knowledge bank «بنك المعلومات» knows which tool answered which
        question) and the few non-personal arguments the tasks need (deal, date, time, plan, product, form, channel …);
      - the tasks tool: bassem_tasks (Bassem) / janna_tasks (Janna) — CLIENT tools with awaitResult: {action: list|add|done|cancel|reopen|due,
        id?, title?, due?} → GET|POST /api/advisor/memory/tasks (his sign-in) or /api/janna/memory/tasks (the visitor id); the Worker's short
        text goes back to the LLM (≤ 1,000 characters, ≤ 6.5 s; a failure is said as it is).
   ES5, no libraries, no network except /api/advisor/memory and /api/janna/memory. API: window.BASSEM_MEMORY = {__v, attach, call, flush,
   recall, outcome, tasks, _t} */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.BASSEM_MEMORY && W.BASSEM_MEMORY.__v) return;
  var inScreen = false; try { inScreen = W.top !== W && W.parent.__jannaLive === 1; } catch (e) {}
  if (inScreen) return;

  /* ---------- constants ---------- */
  var API = String(W.MIG_API_BASE || "/api").replace(/\/+$/, "") + "/advisor/memory";
  var VAPI = String(W.MIG_API_BASE || "/api").replace(/\/+$/, "") + "/janna/memory"; /* Janna's visitors (worker/src/visitor.js) */
  var TURN_MS = Math.max(1000, +W.MIG_BMM_TURN_MS || 300000);   /* turns + summary every 5 minutes (tests may shorten it) */
  var RECALL_MS = 6500, FETCH_MS = 12000, MAX_TURNS = 30, MAX_BODY = 26000, MAX_REQ = 30000, CHAIN_MS = 25000; /* the Worker refuses > 32,768 characters (413) */
  var RECALL = "bassem_recall", TASKS_TOOL = { bassem: "bassem_tasks", janna: "janna_tasks" };
  /* the web tools: plain searches and opportunity hunts of both personas */
  var WEB = { bassem_web_search: 1, bassem_web_hunt: 1, janna_web_search: 1, janna_web_hunt: 1 }, HUNT = { bassem_web_hunt: 1, janna_web_hunt: 1 };
  var TYPE_L = { tender: ["مناقصة", "Tender"], rfq: ["طلب عرض سعر", "RFQ"], buyer: ["عميل محتمل", "Potential buyer"], buyer_list: ["قائمة عملاء محتملين", "List of potential buyers"], project: ["مشروع جديد", "New project"], news: ["خبر", "News"] };
  /* the contact a visitor gives Janna's tools (only to the Worker, which keeps a keyed hash): the account owner's first */
  var CONTACT = { janna_fill_registration: ["owner_email", "email", "owner_mobile", "phone"], janna_start_meeting: ["email", "phone"], janna_schedule_meeting: ["email", "phone"], janna_book_meeting: ["email", "phone"], janna_fill_contact: ["phone"] };
  /* the tools whose answer is a search (or one item) worth remembering */
  var STORE = { bassem_intel: 1, janna_lookup: 1, janna_search: 1, bassem_web_search: 1, bassem_web_hunt: 1, janna_web_search: 1, janna_web_hunt: 1, janna_item: 1, platform_item: 1, bassem_open_item: 1, bassem_open_opportunity: 1 };
  var ITEM = { janna_item: 1, platform_item: 1, bassem_open_item: 1 };
  var SEC = { tenders: ["المناقصات", "tenders"], rfqs: ["طلبات الأسعار", "RFQs"], factories: ["المصانع", "factories"], suppliers: ["الموردين", "suppliers"], market: ["المنتجات", "products"], products: ["المنتجات", "products"], offers: ["العروض", "offers"], projects: ["المشروعات", "projects"], winners: ["الترسيات", "awards"] };
  /* the only tool arguments the Worker's call summary reads (worker/src/memory.js buildSummary) — nothing else leaves the page */
  var KEEP = { title: 1, label: 1, name: 1, page: 1, section: 1, guide: 1, ref: 1, ref_id: 1, kind: 1, subject: 1, language: 1, session_time: 1, morning_time: 1, stage: 1, next_action: 1, query: 1, market: 1,
    /* 0009 tasks: which deal / date / form an action was about; the names only so the knowledge bank can strip them (never e-mails or numbers) */
    deal: 1, due_date: 1, reminder_date: 1, date: 1, time: 1, plan: 1, product: 1, form: 1, channel: 1, topic: 1, company: 1, company_name: 1, owner_name: 1, manager: 1 };
  function EN() { return W.MIGLANG === "en"; }
  function T(ar, en) { return EN() ? en : ar; }
  function now() { return new Date().getTime(); }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim(); return n && s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function num(s) { s = String(s == null ? "" : s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6f0; }).replace(/[,،٬]/g, ""); var m = /\d+/.exec(s); return m ? +m[0] : null; }
  /* a tool's arguments: an object, its JSON text, or a webhook's nested {bodyParams | parameters | arguments | args | input: {…}} (S12) */
  var NEST = { bodyParams: 1, queryParams: 1, parameters: 1, arguments: 1, args: 1, input: 1 };
  function args(a) {
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = {}; } }
    if (!a || typeof a !== "object" || a instanceof Array) return {};
    var o = {}, k, j, b;
    for (k in a) if (own(a, k) && !own(NEST, k) && k !== "headers") o[k] = a[k]; /* a webhook's headers never leave the event */
    for (k in NEST) if (own(NEST, k) && own(a, k)) {
      b = a[k]; if (typeof b === "string" && /^\s*\{/.test(b)) { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (b && typeof b === "object" && !(b instanceof Array)) { for (j in b) if (own(b, j)) o[j] = b[j]; } /* the body is what the tool was sent */
      else if (b != null && typeof b !== "object") o[k] = b;
    }
    return o;
  }
  function rnd(n) { var s = ""; try { var b = new Uint8Array(n); (W.crypto || W.msCrypto).getRandomValues(b); for (var i = 0; i < n; i++) s += ("0" + b[i].toString(16)).slice(-2); } catch (e) { s = Math.random().toString(16).slice(2, 2 + 2 * n); } return s; }
  function json(v) { try { return JSON.stringify(v); } catch (e) { return ""; } }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  /* http(s) links only (relative platform links become absolute); no credentials, no other schemes */
  function abs(u) {
    u = String(u == null ? "" : u).trim(); if (!u || u.length > 600) return "";
    if (/^\/(?!\/)/.test(u)) u = location.protocol + "//" + location.host + u;
    if (!/^https?:\/\/[^\s]+$/i.test(u)) return "";
    var a = D.createElement("a"); a.href = u;
    if (!/^https?:$/.test(a.protocol) || !a.hostname || a.username || a.password) return "";
    return a.href.length > 300 ? "" : a.href;
  }
  function host(u) { if (!u) return ""; var a = D.createElement("a"); a.href = u; return String(a.hostname || "").replace(/^www\./i, "").toLowerCase(); }
  /* tool arguments → the KEEP fields only, ≤ 80 characters each (an address / a message body never leaves the page from here) */
  function scal(a) {
    var o = {}, n = 0;
    for (var k in a) {
      if (!own(a, k) || !own(KEEP, k)) continue;
      var v = a[k];
      if (typeof v === "string" || typeof v === "number") { v = clip(v, 80); if (v !== "") { o[k] = v; n++; } }
      else if (typeof v === "boolean") { o[k] = v; n++; }
      if (n >= 12) break;
    }
    return o;
  }

  /* ---------- the API: the member's own sign-in, JSON or nothing ---------- */
  function toks() {
    var out = [], t = "", c = null;
    try { t = localStorage.getItem("mig-tok") || ""; } catch (e) {}
    if (t) out.push(t);
    try { c = JSON.parse(sessionStorage.getItem("mig-adv-token") || "null"); } catch (e) {}
    if (c && c.t && out.indexOf(String(c.t)) < 0) out.push(String(c.t));
    return out;
  }
  var AUTH = { tok: "" }, MEM = { off: "", pause: 0 };
  function once(method, url, body, tok, opt) {
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej({ code: "offline" }); return; }
      var fin = false, h = { Accept: "application/json" };
      if (body) h["Content-Type"] = "application/json";
      if (tok) h.Authorization = "Bearer " + tok;
      var tm = setTimeout(function () { if (!fin) { fin = true; rej({ code: "timeout" }); } }, opt.ms || FETCH_MS);
      var init = { method: method, headers: h, credentials: "same-origin", cache: "no-store" };
      if (body) init.body = json(body);
      if (opt.keepalive) init.keepalive = true;
      fetch(url, init).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { return { status: r.status, ok: r.ok, j: j || {} }; });
      }).then(function (x) { if (fin) return; fin = true; clearTimeout(tm); res(x); }, function (e) { if (fin) return; fin = true; clearTimeout(tm); rej(e && e.code ? e : { code: "network" }); });
    });
  }
  function api(method, url, body, opt) {
    opt = opt || {};
    var list = toks(), i = 0, k = AUTH.tok ? list.indexOf(AUTH.tok) : -1;
    if (!list.length) return Promise.reject({ code: "login_required", status: 401 });
    if (k > 0) list = list.slice(k).concat(list.slice(0, k));
    function next(prev) {
      if (i >= list.length) return Promise.reject(prev);
      var tk = list[i++];
      return once(method, url, body, tk, opt).then(function (x) {
        if (x.ok) { AUTH.tok = tk; return x.j; }
        var code = String((x.j && (x.j.code || x.j.error)) || "http_" + x.status), e = { code: code, status: x.status };
        if ((x.status === 401 || x.status === 403) && /^(unauthorized|full_login_required|plan|forbidden|login_required)$/.test(code) && i < list.length) return next(e);
        throw e;
      });
    }
    return next({ code: "login_required", status: 401 });
  }
  /* Janna's visitor: the random id data/janna-live.js keeps. Her memory API needs no sign-in, but a signed-in member's full session
     ("mig-tok" v2) goes with it: an id linked to a member is read and written only with HIS sign-in (worker visitor.js, review
     2026-11-19 #7); anybody else gets 409 visitor_linked → a new random id (JANNA_LIVE.rotateVisitor) and the write is tried once more */
  var VMEM = { off: "", pause: 0 };
  function vid() {
    var v = ""; try { if (W.JANNA_LIVE && typeof JANNA_LIVE.visitorId === "function") v = String(JANNA_LIVE.visitorId() || ""); } catch (e) {}
    if (!v) { try { v = localStorage.getItem("mig-vid") || ""; } catch (e) {} }
    return /^[0-9a-f]{32}$/.test(v) ? v : "";
  }
  function vtok() { var t = ""; try { t = localStorage.getItem("mig-tok") || ""; } catch (e) {} return /^v2\./.test(t) ? t : ""; }
  function vcall(method, url, body, opt) {
    return once(method, url, body, vtok(), opt || {}).then(function (x) {
      if (x.ok) return x.j;
      throw { code: String((x.j && (x.j.code || x.j.error)) || "http_" + x.status), status: x.status, text: x.j && x.j.text };
    });
  }
  /* 409 visitor_linked: this call goes on with a NEW random id (never the member's) */
  function vrotate(C) { var v = ""; try { if (W.JANNA_LIVE && typeof JANNA_LIVE.rotateVisitor === "function") v = String(JANNA_LIVE.rotateVisitor() || ""); } catch (e) {} if (/^[0-9a-f]{32}$/.test(v) && C) C.vid = v; return /^[0-9a-f]{32}$/.test(v) ? v : ""; }
  function merge(a, b) { var o = {}, k; for (k in a) if (own(a, k)) o[k] = a[k]; for (k in b) if (own(b, k)) o[k] = b[k]; return o; }
  /* writes go one after the other (the turns before the summary that is built from them); a page that is closing sends at once */
  var QW = Promise.resolve();
  function write(body, keep, C) {
    C = C || CALL;
    var J = !!(C && C.agent === "janna"), st = J ? VMEM : MEM;
    if (st.off) return Promise.reject({ code: st.off });
    if (st.pause > now()) return Promise.reject({ code: "rate_limited" });
    var go = function () {
      var vw = function () { return vcall("POST", VAPI, merge(body, { visitor_id: C.vid, lang: EN() ? "en" : "ar" }), { keepalive: !!keep }); };
      var p = !J ? api("POST", API, body, { keepalive: !!keep })
        : C.vid ? vw().then(null, function (e) { if (e && e.code === "visitor_linked" && vrotate(C)) return vw(); throw e; }) : Promise.reject({ code: "no_visitor" });
      return p.then(null, function (e) {
        e = e || {};
        if (/^(memory_off|auth_off|store_off|plan|unauthorized|login_required|full_login_required|origin_not_allowed|blocked|no_visitor|visitor_linked)$/.test(e.code)) st.off = e.code; /* nothing more is sent from this page */
        if (e.code === "rate_limited") st.pause = now() + 600000;
        throw e;
      });
    };
    if (keep) return go();
    var p = QW.then(go, go); QW = p.then(null, function () {}); return p;
  }

  /* ---------- one call ---------- */
  var CALL = null;
  function newCall(agent) {
    if (CALL && CALL.timer) clearInterval(CALL.timer);
    agent = agent === "janna" ? "janna" : "bassem";
    CALL = { id: (agent === "janna" ? "jc-" : "bc-") + now().toString(36) + "-" + rnd(5), agent: agent, vid: agent === "janna" ? vid() : "", contact: {}, t0: new Date().toISOString(), parts: 0, next: 0, by: {}, turns: [], tools: [], recs: {}, pend: {}, done: {},
      ended: false, dirty: false, timer: 0, closeT: 0, last: now(), live: [], tn: 0, wait: [], scr: {} };
    CALL.timer = setInterval(function () { if (CALL && !CALL.ended) flush(false); }, TURN_MS);
    return CALL;
  }
  function endCall(keep) {
    var C = CALL; if (!C || C.ended) return Promise.resolve(false);
    C.ended = true; clearInterval(C.timer); clearTimeout(C.closeT);
    return flush(true, keep, C);
  }
  /* the turns not sent yet (or grown since) in request-sized chunks: ≤ 30 turns, ≤ MAX_BODY characters */
  function chunks(C) {
    var dirty = [], out = [], cur = [], size = 0;
    for (var i = 0; i < C.turns.length; i++) if (C.turns[i].sent !== C.turns[i].text) dirty.push(C.turns[i]);
    dirty.sort(function (a, b) { return a.seq - b.seq; });
    for (var j = 0; j < dirty.length; j++) {
      var t = dirty[j], s = json(t.text).length + 40; /* the JSON length (quotes / backslashes are escaped) = what the Worker counts */
      if (cur.length && (cur.length >= MAX_TURNS || size + s > MAX_BODY)) { out.push(cur); cur = []; size = 0; }
      cur.push(t); size += s;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  var wire = function (list) { return list.map(function (t) { return { role: t.role, text: t.text, seq: t.seq }; }); };
  function mark(list) { for (var i = 0; i < list.length; i++) list[i].sent = list[i].text; }
  function flush(final, keep, C) {
    C = C || CALL;
    if (!C || MEM.off) return Promise.resolve(false);
    var cs = chunks(C), last = final && cs.length ? cs.pop() : null, p = Promise.resolve(true);
    if (!final && !cs.length && !C.dirty) return p;
    if (final && !C.turns.length && !C.tools.length) return p; /* a call that never started talking */
    cs.forEach(function (ch) { var q = write({ kind: "turns", call_id: C.id, turns: wire(ch) }, keep, C).then(function () { mark(ch); return true; }); p = keep ? q : p.then(function () { return q; }); });
    var sum = function () {
      var b = { kind: "summary", call_id: C.id, tools: C.tools.slice(-40), final: !!final, started_at: C.t0 };
      if (last) b.turns = wire(last);
      while (b.tools.length && json(b).length > MAX_REQ) b.tools.shift(); /* the oldest tools go first: the body always fits the Worker's cap */
      return write(b, keep, C).then(function (j) { if (last) mark(last); C.dirty = false; return j || true; });
    };
    p = keep ? sum() : p.then(sum, sum);
    return p.then(null, function () { return false; });
  }
  W.addEventListener("pagehide", function () { if (CALL && !CALL.ended) endCall(true); });
  D.addEventListener("visibilitychange", function () { if (D.visibilityState === "hidden" && CALL && !CALL.ended) flush(false, true); });
  /* janna-live.js reports the end of a call on the call element (anam-agent:session-ended); a chain goes on with session-continued */
  D.addEventListener("anam-agent:session-ended", function () { if (CALL && !CALL.ended) endCall(false); }, true);

  /* ---------- the conversation ---------- */
  var GREET = /^(أهلا|اهلا|أهلًا|مرحب|يا هلا|hello|hi\b|welcome)/i;
  /* 📎 the platform's own notes to the persona (data/chat-media.js, worker/src/chat-media.js — addContext): never stored as the person's
     words, should Anam ever list them in the message history (worker/src/memory.js drops them on the server too) */
  var PLAT = /^[\s\u200e\u200f]*\[\s*(?:بداي[ةه]\s+نتيج[ةه]\s+قراء[ةه]|ملاحظ[ةه]\s+من\s+المنص[ةه]|START\s+OF\s+THE\s+READING|PLATFORM\s+NOTE)/i;
  function history(part, msgs) {
    var C = part.call; if (!C || C.ended || !msgs || !msgs.length) return;
    C.last = now();
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i] || {}, role = m.role === "persona" ? "persona" : m.role === "user" ? "user" : "";
      if (!role) continue;
      var text = clip(m.content, 600); if (!text) continue;
      var key = part.n + ":" + i, r = C.by[key];
      if (!r) {
        if (role === "user" && PLAT.test(text)) { C.by[key] = { skip: 1 }; continue; }
        /* the next session of a chained call starts with its own greeting, cut at its first words: not part of the conversation */
        if (part.n > 1 && role === "persona" && !part.greeted && now() - part.t0 < 20000 && (GREET.test(text) || text.length < 25)) { part.greeted = true; C.by[key] = { skip: 1 }; continue; }
        if (role === "persona") part.greeted = true;
        r = C.by[key] = { seq: C.next++, role: role, text: text, sent: "" }; C.turns.push(r); C.dirty = true;
      } else if (!r.skip && r.text !== text) { r.text = text; C.dirty = true; }
    }
    var n = 0; for (var j = 0; j < C.turns.length; j++) if (C.turns[j].sent !== C.turns[j].text) n++;
    if (n >= MAX_TURNS) flush(false); /* never more than one request's worth waiting */
  }

  /* ---------- tool calls ---------- */
  function started(part, p) {
    var C = part.call; if (!C || C.ended || !p) return;
    var name = String(p.toolName || p.eventName || ""), a = args(p.arguments || p.eventData), id = String(p.toolCallId || "") || name + "|" + json(a);
    if (!name || C.pend[id]) return;
    C.pend[id] = { name: name, args: a, t: now(), type: String(p.toolType || "") }; C.last = now();
    if (name !== RECALL) {
      var rec = { n: ++C.tn, name: name, args: scal(a), s: C.next }; C.tools.push(rec); C.recs[id] = rec; if (C.tools.length > 60) C.tools.shift(); C.dirty = true;
      C.wait.push({ rec: rec, t: now() }); if (C.wait.length > 40) C.wait.shift();
    }
    if (C.agent === "janna" && CONTACT[name]) contact(C, name, a);
    if (WEB[name]) webCard({ state: "loading", hunt: !!HUNT[name], who: C.agent, query: clip(HUNT[name] ? huntQuery(a) : a.query, 120) });
  }
  function completed(part, p, via) {
    var C = part.call; if (!C || !p) return;
    var id = String(p.toolCallId || ""), info = (id && C.pend[id]) || null, name = String(p.toolName || (info && info.name) || "");
    if (!name || name === RECALL) return;
    if (id) { if (C.done[id]) return; C.done[id] = via || 1; }
    var a = info ? info.args : args(p.arguments);
    /* a SERVER tool's completion is its outcome (an {error} answer = failed); a client tool's outcome comes from the page (outcome()) */
    if (info && info.type && info.type !== "client" && via !== "handler") setOutcome(C, C.recs[id], errOf(p.result) ? "failed" : "ok");
    result(C, id, name, a, p.result);
  }
  function failed(part, p) {
    var C = part.call; if (!C || !p) return;
    var id = String(p.toolCallId || ""), name = String(p.toolName || (C.pend[id] && C.pend[id].name) || "");
    if (id) { C.done[id] = "fail"; setOutcome(C, C.recs[id], "failed"); }
    if (WEB[name]) { var t = T("البحث على الإنترنت مش متاح دلوقتي.", "Web search is not available right now."), pa = (C.pend[id] && C.pend[id].args) || {}; webCard({ state: "error", query: clip(HUNT[name] ? huntQuery(pa) : pa.query || "", 120), text: t }); holoFail(t); }
  }
  /* a visitor's e-mail / mobile from Janna's tool arguments → once per call to the Worker, which keeps only a keyed hash */
  function contact(C, name, a) {
    var keys = CONTACT[name], em = "", ph = "";
    for (var i = 0; i < keys.length; i++) {
      var v = String(a[keys[i]] == null ? "" : a[keys[i]]).replace(/\s+/g, " ").trim(); if (!v || v.length > 254) continue;
      if (/@/.test(v)) { if (!em && /^[^\s@]{1,64}@[^\s@]{1,253}\.[a-z]{2,24}$/i.test(v)) em = v.toLowerCase(); }
      else if (!ph && String(num(v.replace(/[^0-9٠-٩۰-۹]/g, "")) || "").length >= 7) ph = v.slice(0, 30);
    }
    var key = em + "|" + ph; if ((!em && !ph) || C.contact[key]) return;
    C.contact[key] = 1;
    var b = { kind: "contact" }; if (em) b.email = em; if (ph) b.phone = ph;
    write(b, false, C).then(null, function () {});
  }
  /* ---------- the outcome of each action (critic D) ---------- */
  function setOutcome(C, rec, st) {
    if (!C || !rec || rec.outcome || !/^(ok|refused|failed)$/.test(st)) return false;
    rec.outcome = st; C.dirty = true;
    for (var i = 0; i < C.wait.length; i++) if (C.wait[i].rec === rec) { C.wait.splice(i, 1); break; }
    return true;
  }
  /* the oldest record of that tool still waiting (≤ 3 minutes) gets it: calls of one tool complete in the order they started */
  function outcome(tool, st) {
    var C = CALL; if (!C || C.ended || !tool || !/^(ok|refused|failed)$/.test(st)) return false;
    var t = now();
    for (var i = 0; i < C.wait.length; i++) {
      var w = C.wait[i];
      if (t - w.t > 180000) { C.wait.splice(i, 1); i--; continue; }
      if (w.rec.name === tool) return setOutcome(C, w.rec, st);
    }
    return false;
  }
  function errOf(r) { var x = parse(r); return !!(x && x.o && x.o.error && !rowsOf(x.o).length); }
  W.addEventListener("mig:tool-outcome", function (e) { var d = (e && e.detail) || {}; outcome(String(d.tool || ""), String(d.outcome || "")); });
  /* only this channel: janna-live.js's done() reports "mig:agent-action" AND this outcome, and one completion must mark one record */

  /* a tool's answer → {obj} (JSON) or {text} */
  function parse(r) {
    if (r == null) return null;
    if (typeof r === "object") return { o: r };
    var s = String(r);
    if (/^\s*[\[{]/.test(s)) { try { var o = JSON.parse(s); if (o && typeof o === "object") return { o: o }; } catch (e) {} }
    return { s: s };
  }
  function rowsOf(o) {
    var a = o.results || o.items || o.hits || o.top || (o.item ? [o.item] : null) || (o.data && (o.data.results || o.data.items)) || (o instanceof Array ? o : null);
    if (!(a instanceof Array) && (o.title || o.title_ar || o.name)) a = [o]; /* one item (janna_item …) */
    return a instanceof Array ? a : [];
  }
  function item(r, tool) {
    if (!r || typeof r !== "object") return null;
    var title = clip(r.title || r.title_ar || r.name || r.title_en || r.product || r.label || "", 200);
    if (!title) return null;
    var u = abs(r.open_url || r.url || r.link || r.href || ""), web = !!WEB[tool]; /* open_url = the item's own page (janna_lookup): unique, unlike a list link */
    var ent = web ? clip(host(u) || r.source || r.site, 80) : clip(r.entity || r.maker || r.company || r.buyer || r.market_name || r.governorate || r.location || "", 120);
    var dl = web ? "" : clip(r.deadline || r.closing_date || r.valid_to || "", 25);
    var ref = typeof r.ref === "string" ? r.ref : typeof r.id === "string" ? r.id : "";
    if (!/^[A-Za-z0-9#:_.\/-]{1,64}$/.test(ref)) ref = "";
    return { title: title, entity: ent, deadline: dl, url: u, ref: ref };
  }
  /* the shared screen's text (data/bassem-live-tools.js): «القائمة: 12 …» · «أول الظاهر: a ؛ b» · «مفتوح فيها: X» — anything else is not stored */
  function textItems(s) {
    var o = { count: null, items: [] }, m;
    m = /(?:^|\n)\s*(?:القائمة|List)\s*:\s*([^\n]*)/.exec(s); if (m) o.count = num(m[1]);
    m = /(?:^|\n)\s*(?:أول الظاهر|First shown)\s*:\s*([^\n]*)/.exec(s);
    if (m) o.items = m[1].split(/\s*[؛;]\s*/).map(function (t) { return clip(t, 200); }).filter(Boolean).slice(0, 5).map(function (t) { return { title: t, entity: "", deadline: "", url: "", ref: "" }; });
    m = /(?:^|\n)\s*(?:مفتوح فيها|Open in it|البند|Item)\s*:\s*([^\n]*)/.exec(s);
    if (m && !o.items.length && clip(m[1], 200)) o.items = [{ title: clip(m[1], 200), entity: "", deadline: "", url: "", ref: "" }];
    if (o.count == null && (m = /(?:لقيت|Found)\s+([0-9٠-٩][0-9٠-٩,]*)/.exec(s))) o.count = num(m[1]);
    return o;
  }
  /* a hunt's query as it is shown and remembered: «product · market» (the market codes of worker/src/websearch.js; none = Egypt) */
  var MKN = { eg: ["مصر", "Egypt"], sa: ["السعودية", "Saudi Arabia"], ae: ["الإمارات", "UAE"], kw: ["الكويت", "Kuwait"], qa: ["قطر", "Qatar"], om: ["عمان", "Oman"], bh: ["البحرين", "Bahrain"], jo: ["الأردن", "Jordan"], iq: ["العراق", "Iraq"], ly: ["ليبيا", "Libya"], sd: ["السودان", "Sudan"], ma: ["المغرب", "Morocco"], dz: ["الجزائر", "Algeria"], tn: ["تونس", "Tunisia"], ke: ["كينيا", "Kenya"], ng: ["نيجيريا", "Nigeria"], et: ["إثيوبيا", "Ethiopia"], za: ["جنوب أفريقيا", "South Africa"], cn: ["الصين", "China"], "in": ["الهند", "India"], tr: ["تركيا", "Turkey"], de: ["ألمانيا", "Germany"], it: ["إيطاليا", "Italy"], fr: ["فرنسا", "France"], es: ["إسبانيا", "Spain"], gb: ["بريطانيا", "UK"], us: ["أمريكا", "USA"], ru: ["روسيا", "Russia"], gulf: ["الخليج", "GCC"], arab: ["الدول العربية", "Arab countries"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"], world: ["العالم", "the world"] };
  function huntQuery(a) {
    var p = clip(a.product || a.query || a.q || "", 120), k = clip(a.market || "", 30), c = k.toLowerCase(), m = own(MKN, c) ? T(MKN[c][0], MKN[c][1]) : k;
    return p ? p + " · " + (m || T("مصر", "Egypt")) : "";
  }
  function queryOf(name, a) {
    if (HUNT[name]) return huntQuery(a);
    var q = clip(a.query || a.q || a.keyword || a.keywords || a.search || a.product || a.title || a.ref || a.label || "", 200);
    if (!q && name === "bassem_intel" && a.action === "brief") q = T("ملخص الجديد النهارده", "today's brief") + (a.sector ? " · " + clip(a.sector, 60) : "");
    if (!q && SEC[a.section]) q = T(SEC[a.section][0], SEC[a.section][1]);
    var g = clip(a.governorate || a.city || "", 40);
    return q && g && q.indexOf(g) < 0 ? q + " · " + g : q;
  }
  function result(C, id, name, a, raw) {
    var x = parse(raw), list = [], count = null;
    if (x && x.o) {
      if (WEB[name]) { web(C, a, x.o, name); return; }
      if (x.o.error && !rowsOf(x.o).length) return; /* a refusal / failure is not a search result */
      var rows = rowsOf(x.o);
      for (var i = 0; i < rows.length && list.length < 5; i++) { var it = item(rows[i], name); if (it) list.push(it); }
      count = typeof x.o.count === "number" ? x.o.count : typeof x.o.total === "number" ? x.o.total : rows.length;
    } else if (x && x.s) {
      if (WEB[name]) { web(C, a, { error: "websearch_failed", text: clip(x.s, 300) }, name); return; }
      if (now() - ((C.scr && C.scr[name]) || 0) < 30000) return; /* already stored from the screen's structured answer (screenResult) */
      var t = textItems(x.s); list = t.items; count = t.count != null ? t.count : list.length ? list.length : null;
      if (count == null) return; /* the answer does not say what was found: nothing is stored */
    } else return;
    var rec = id && C.recs[id];
    if (rec && ITEM[name] && list[0] && !rec.args.title) rec.args.title = clip(list[0].title, 80); /* «اتفتح: …» in the call summary */
    if (!STORE[name]) return;
    var q = queryOf(name, a) || (ITEM[name] && list[0] ? list[0].title : "");
    if (!q) return;
    store(C, name, q, clip(a.market || "", 30), count, list);
  }
  function store(C, tool, q, market, count, list) {
    var b = { kind: "search", call_id: C.id, tool: tool, query: q, market: market, count: Math.max(0, Math.min(1e6, count | 0)), results: list.slice(0, 5) };
    C.dirty = true;
    return write(b, false, C).then(null, function () { return false; });
  }

  /* data/bassem-live-tools.js's structured answer (window "mig:screen-result" {tool, query, count, items}): the search / the opened item
     exactly as the shared screen showed it, stored as is — the handler's text (worded for the LLM) is then not parsed again */
  function screenResult(d) {
    var C = CALL, tool = String((d && d.tool) || "");
    if (!C || C.ended || !C.live.length || !STORE[tool]) return;
    var src = d.items instanceof Array ? d.items : [], list = [];
    for (var i = 0; i < src.length && list.length < 5; i++) { var it = item(src[i], tool); if (it) list.push(it); }
    var q = clip(d.query, 200) || (list[0] ? list[0].title : ""); if (!q || !list.length) return;
    C.scr[tool] = now();
    /* «اتفتح: …» in the call summary: the newest record of that tool without a title gets the opened item's */
    if (ITEM[tool]) for (var j = C.tools.length - 1; j >= 0; j--) if (C.tools[j].name === tool) { if (!C.tools[j].args.title) C.tools[j].args.title = clip(list[0].title, 80); break; }
    store(C, tool, q, "", typeof d.count === "number" && d.count >= 0 ? d.count : list.length, list);
  }
  W.addEventListener("mig:screen-result", function (e) { try { screenResult((e && e.detail) || {}); } catch (x) {} });

  /* ---------- web search: the hologram + the clickable list on the shared screen ---------- */
  function web(C, a, o, name) {
    name = name || "bassem_web_search";
    var hunt = !!HUNT[name], q = clip(hunt ? huntQuery(a) || o.query || "" : a.query || o.query || "", 120);
    if (o.error || !(o.results instanceof Array)) {
      var t = clip(o.text, 300) || T("البحث على الإنترنت مش متاح دلوقتي.", "Web search is not available right now.");
      webCard({ state: "error", query: q, text: t }); holoFail(t); return;
    }
    var items = [], max = hunt ? 6 : 5;
    for (var i = 0; i < o.results.length && items.length < max; i++) {
      var r = o.results[i] || {}, u = abs(r.url), title = clip(r.title, 160);
      if (!u || !title) continue;
      items.push({ title: title, url: u, domain: host(u), source: clip(r.source, 60), snippet: clip(r.snippet, 220), date: clip(r.date, 30), type: TYPE_L[r.type] ? r.type : "", official: r.official === true });
    }
    var count = typeof o.count === "number" ? o.count : items.length;
    webCard({ state: "ok", hunt: hunt, query: q, count: count, items: items, text: clip(o.text, 300) });
    holoWeb(name, C.agent, q, count, items);
    if (q) store(C, name, q, clip(a.market || o.market || "", 30), count, items.map(function (x) { return { title: x.title, entity: x.domain, deadline: "", url: x.url, ref: "" }; }));
  }
  function holoOn() { return !!(W.MIGHOLO && MIGHOLO.result); }
  /* the call's cards (data/call-holo.js) show this tool already: no second scene of it */
  function cardsOwn(tool) { try { return !!(W.MIG_CALL_HOLO && typeof MIG_CALL_HOLO.owns === "function" && MIG_CALL_HOLO.owns(tool)); } catch (e) { return false; } }
  function holoWeb(tool, who, q, count, items) {
    if (!holoOn() || cardsOwn(tool)) return;
    var badge = !!MIGHOLO.badges, J = who === "janna"; /* holo.js with result badges shows «من الإنترنت» in the panel's header */
    try {
      MIGHOLO.result({ who: J ? "janna" : "bassem", tool: tool, count: count, badge: T("من الإنترنت", "From the web"), title: (J ? T("جنة دوّرت في الإنترنت: ", "Janna searched the web: ") : T("باسم دوّر في الإنترنت: ", "Bassem searched the web: ")) + q,
        items: items.map(function (x) { return { title: x.title, sub: (x.type ? T(TYPE_L[x.type][0], TYPE_L[x.type][1]) + " · " : "") + x.domain + (x.date ? " · " + x.date : "") + (badge ? "" : T(" · من الإنترنت", " · from the web")), href: x.url }; }) });
    } catch (e) {}
  }
  function holoFail(t) { try { if (W.MIGHOLO && MIGHOLO.step) MIGHOLO.step(clip(t, 120), "fail"); } catch (e) {} }

  var CSS = ''
    + '.bmm-web{position:absolute;z-index:4;inset:auto 12px 12px 12px;max-height:min(64%,440px);display:flex;flex-direction:column;box-sizing:border-box;background:#fff;color:#14232a;border-radius:16px;'
    + 'box-shadow:0 24px 60px -20px rgba(0,0,0,.6),0 0 0 1px rgba(4,18,26,.1),0 0 0 3px rgba(63,224,255,.35);font:400 .88rem/1.6 Cairo,Tajawal,Tahoma,sans-serif;overflow:hidden}'
    + '.bmm-web[hidden]{display:none}.bmm-web.bmm-fixed{position:fixed;z-index:2147483002;inset:auto 12px 12px auto;width:min(480px,calc(100vw - 24px))}'
    + '.bmm-hd{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:1px solid #e3ecef;background:linear-gradient(180deg,#f3fbfd,#fff)}'
    + '.bmm-badge{flex:none;display:inline-flex;align-items:center;gap:6px;padding:2px 10px 3px;border-radius:999px;background:#04121a;color:#bff3ff;font-weight:800;font-size:.74rem;line-height:1.5;box-shadow:0 0 0 1px rgba(63,224,255,.55)}'
    + '.bmm-badge i{width:12px;height:12px;border-radius:50%;border:2px solid #3fe0ff;box-sizing:border-box;background:radial-gradient(circle at 50% 50%,transparent 40%,rgba(63,224,255,.55) 41%,transparent 60%)}'
    + '.bmm-hd b{flex:1;min-width:0;font-weight:800;color:#04121a;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.bmm-hd b bdi{font-weight:800}.bmm-hd small{flex:none;color:#5b6b72;font-size:.76rem}'
    + '.bmm-x{flex:none;width:30px;height:30px;border-radius:50%;border:0;background:#eef3f5;color:#04121a;font:inherit;font-weight:800;cursor:pointer}.bmm-x:focus-visible,.bmm-web a:focus-visible{outline:3px solid #e9c46a;outline-offset:2px}'
    + '.bmm-note{margin:0;padding:6px 12px;background:#fff8e6;color:#6b4e00;font-size:.76rem;line-height:1.6;border-bottom:1px solid #f3e3b5}'
    + '.bmm-web ol{list-style:none;margin:0;padding:6px;overflow-y:auto;overscroll-behavior:contain}.bmm-web li{margin:0}'
    + '.bmm-web li a{display:grid;grid-template-columns:auto 1fr;grid-template-areas:"av dm" "av ty" "av t" "av s";column-gap:10px;padding:8px 8px 9px;border-radius:12px;text-decoration:none;color:inherit}'
    + '.bmm-web li a:hover{background:#f1f7f9}.bmm-av{grid-area:av;width:30px;height:30px;border-radius:9px;background:#04121a;color:#bff3ff;display:flex;align-items:center;justify-content:center;font:800 .8rem/1 system-ui,sans-serif;text-transform:uppercase;margin-top:3px}'
    + '.bmm-dm{grid-area:dm;font-size:.74rem;color:#0b5d47;font-weight:700;direction:ltr;unicode-bidi:isolate;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.bmm-dm em{font-style:normal;color:#5b6b72;font-weight:400}.bmm-t{grid-area:t;font-weight:800;color:#0a3d8f;line-height:1.45;overflow-wrap:anywhere}.bmm-web li a:hover .bmm-t{text-decoration:underline}'
    + '.bmm-s{grid-area:s;color:#4a5a61;font-size:.8rem;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
    + '.bmm-ty{grid-area:ty;justify-self:start;margin:2px 0;padding:0 8px;border-radius:999px;background:#eaf6f0;color:#0b5d47;font-size:.72rem;font-weight:800;line-height:1.7}'
    + '.bmm-st{padding:14px 14px 16px;color:#33444b}.bmm-st.wait::before{content:"";display:inline-block;width:12px;height:12px;margin-inline-end:8px;vertical-align:-1px;border-radius:50%;border:2px solid #cfe6ee;border-top-color:#0b5d47;animation:bmmSpin .9s linear infinite}'
    + '@keyframes bmmSpin{to{transform:rotate(360deg)}}'
    + '@media (max-width:820px),(max-aspect-ratio:3/2){.jnl .bmm-web{inset:50px 8px auto 8px;max-height:calc(100% - 64px)}}'
    + '@media (prefers-reduced-motion:reduce){.bmm-st.wait::before{animation:none}}';
  var cssOn = false, card = null;
  function el(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function arN(n) { return n === 1 ? "نتيجة واحدة" : n === 2 ? "نتيجتين" : n + (n >= 3 && n <= 10 ? " نتايج" : " نتيجة"); }
  function webCard(o) {
    if (!D.body) return;
    if (!cssOn) { var st = el("style"); st.textContent = CSS; (D.head || D.documentElement).appendChild(st); cssOn = true; }
    var host0 = D.querySelector(".jnl .jnl-scr");
    if (!card || !card.parentNode || (host0 && card.parentNode !== host0)) {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      card = el("section", "bmm-web" + (host0 ? "" : " bmm-fixed")); card.setAttribute("role", "region"); card.setAttribute("translate", "no");
      (host0 || D.body).appendChild(card);
    }
    card.dir = EN() ? "ltr" : "rtl"; card.hidden = false; card.innerHTML = "";
    card.setAttribute("aria-label", T("نتايج من الإنترنت", "Results from the web"));
    var hd = el("div", "bmm-hd"), bd = el("span", "bmm-badge"); bd.appendChild(el("i")); bd.appendChild(D.createTextNode(T("من الإنترنت", "From the web")));
    hd.appendChild(bd);
    var ttl = el("b", null, o.query ? (o.hunt ? T("فرص: ", "Opportunities: ") : T("بحث: ", "Search: ")) : T("بحث الإنترنت", "Web search"));
    if (o.query) { var qb = el("bdi", null, o.query); qb.setAttribute("dir", "auto"); ttl.appendChild(qb); } /* an English query stays whole inside the Arabic line */
    hd.appendChild(ttl);
    if (o.state === "ok") {
      var sites = {}, ns = 0; for (var i = 0; i < o.items.length; i++) if (!sites[o.items[i].domain]) { sites[o.items[i].domain] = 1; ns++; }
      hd.appendChild(el("small", null, o.items.length ? T(arN(o.items.length) + " من " + (ns === 1 ? "موقع واحد" : ns + " مواقع"), o.items.length + " results from " + ns + (ns === 1 ? " site" : " sites")) : ""));
    }
    var x = el("button", "bmm-x", "✕"); x.type = "button"; x.title = T("اقفل النتايج", "Close the results"); x.setAttribute("aria-label", x.title);
    x.onclick = function () { card.hidden = true; };
    hd.appendChild(x); card.appendChild(hd);
    if (o.state === "loading") {
      var J = o.who === "janna";
      card.appendChild(el("div", "bmm-st wait", o.hunt ? (J ? T("جنة بتدوّر على فرص في مواقع على الإنترنت…", "Janna is looking for opportunities on websites…") : T("باسم بيدوّر على فرص في مواقع على الإنترنت…", "Bassem is looking for opportunities on websites…"))
        : J ? T("جنة بتدوّر في مواقع على الإنترنت…", "Janna is searching websites…") : T("باسم بيدوّر في مواقع على الإنترنت…", "Bassem is searching websites…")));
      ping(); return;
    }
    if (o.state === "error") { card.appendChild(el("div", "bmm-st", o.text || T("البحث على الإنترنت مش متاح دلوقتي.", "Web search is not available right now."))); return; }
    if (!o.items.length) { card.appendChild(el("div", "bmm-st", o.text || T("مالقيتش نتايج على الإنترنت للبحث ده.", "No web results for this search."))); return; }
    card.appendChild(el("p", "bmm-note", T("دي مواقع على الإنترنت، مش من بيانات المنصة — لازم نتأكد من المصدر. كل رابط بيفتح في تاب جديد.", "These are websites, not the platform's data — check each source. Every link opens in a new tab.")));
    var ol = el("ol");
    for (var j = 0; j < o.items.length; j++) {
      var it = o.items[j], li = el("li"), a = el("a");
      a.href = it.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.referrerPolicy = "no-referrer";
      a.setAttribute("aria-label", it.title + " — " + it.domain + T(" (يفتح في تاب جديد)", " (opens in a new tab)"));
      a.appendChild(el("span", "bmm-av", (it.domain || "?").charAt(0)));
      var dm = el("span", "bmm-dm", it.domain); if (it.date) { dm.appendChild(D.createTextNode(" ")); dm.appendChild(el("em", null, "· " + it.date)); } a.appendChild(dm);
      if (it.type) { var ty = el("span", "bmm-ty", T(TYPE_L[it.type][0], TYPE_L[it.type][1]) + (it.official ? T(" · بوابة رسمية", " · official portal") : "")); a.appendChild(ty); } /* a hunt: what kind of opportunity */
      var tt = el("span", "bmm-t", it.title); tt.setAttribute("dir", "auto"); a.appendChild(tt);
      if (it.snippet) { var sn = el("span", "bmm-s", it.snippet); sn.setAttribute("dir", "auto"); a.appendChild(sn); }
      li.appendChild(a); ol.appendChild(li);
    }
    card.appendChild(ol);
    ping();
  }
  /* phones (screen under the video): the «الشاشة» button pings, as it does when the screen changes */
  function ping() { var sw = D.querySelector(".jnl-hd .sw"); if (sw) { sw.classList.remove("new"); void sw.offsetWidth; sw.classList.add("new"); } }

  /* ---------- bassem_recall: the member's memory, back to the LLM ---------- */
  function errText(e) {
    var c = (e && e.code) || "";
    if (/^(memory_off|auth_off|store_off)$/.test(c)) return T("ذاكرة باسم لسه مش متفعّلة على المنصة، فمش هقدر أفتكر المكالمات اللي فاتت دلوقتي. أقدر أدوّرلك في المنصة نفسها.", "Bassem's memory is not switched on yet, so I cannot recall earlier calls right now. I can search the platform itself.");
    if (c === "plan") return T("ذاكرة باسم للأعضاء على باقة الشريك الأساسي أو الاستراتيجي بس.", "Bassem's memory is for Core and Strategic Partner members only.");
    if (/^(login_required|unauthorized|full_login_required|forbidden)$/.test(c)) return T("مقدرتش أفتح ذاكرتنا لأن جلسة الدخول على المنصة مش شغالة دلوقتي. ماتعتمدش على كلامي عن اللي فات؛ قولّي كنا بندوّر على إيه وأنا أدوّر تاني.", "I could not open our memory because the sign-in is not active. Tell me what we were looking for and I will search again.");
    if (c === "rate_limited") return T("طلبات كتير ورا بعض على الذاكرة. استنى دقيقة ونجرّب تاني.", "Too many memory requests in a row. Let us try again in a minute.");
    return T("الذاكرة مش بترد دلوقتي، فمش هقول حاجة عن اللي فات من دماغي. قولّي كنا بندوّر على إيه وأنا أدوّر تاني في المنصة.", "The memory is not answering right now, so I will not guess about earlier calls. Tell me what we were looking for and I will search the platform again.");
  }
  function hitTitle(h) {
    if (h.kind === "search") return clip((h.query || "") + (h.best && h.best.title ? " — " + h.best.title : ""), 120);
    return clip(h.text, 120);
  }
  function hitSub(h) {
    var src = h.kind === "search" ? h.source || T("بحث", "search") : h.kind === "summary" ? T("ملخص مكالمة", "call summary") : h.kind === "turn" ? (h.role === "user" ? T("إنت قلت", "you said") : T("باسم قال", "Bassem said")) : T("معلومة قلتها", "a fact you gave");
    return clip([h.day_ar || h.date || "", src, h.kind === "search" && h.count ? arN(h.count) : ""].filter(Boolean).join(" · "), 90);
  }
  function holoRecall(q, j) {
    if (!holoOn()) return;
    var hits = (j && j.hits instanceof Array ? j.hits : []).slice(0, 5);
    try {
      MIGHOLO.result({ who: "bassem", tool: RECALL, count: j && typeof j.count === "number" ? j.count : hits.length, badge: T("من الذاكرة", "From memory"), title: T("باسم بيفتكر: ", "Bassem recalls: ") + q,
        items: hits.map(function (h) { var u = h.best && h.best.url ? abs(h.best.url) : ""; return { title: hitTitle(h), sub: hitSub(h), href: u }; }).filter(function (x) { return x.title; }) });
    } catch (e) {}
  }
  function recall(q) {
    q = clip(q, 120);
    if (!q) q = T("آخر مرة", "last time"); /* critic B: no keywords = the newest calls (the Worker's time words), never a refusal */
    var done = false;
    return new Promise(function (res) {
      var tm = setTimeout(function () { if (!done) { done = true; res(errText({ code: "timeout" })); } }, RECALL_MS + 200);
      /* call_id = the call going on: «آخر مرة» / «امبارح» then mean the calls BEFORE this one (worker/src/memory.js recall, critic B) */
      api("GET", API + "?q=" + encodeURIComponent(q) + "&limit=5" + (CALL && CALL.id ? "&call_id=" + encodeURIComponent(CALL.id) : ""), null, { ms: RECALL_MS }).then(function (j) {
        if (done) return; done = true; clearTimeout(tm);
        var t = clip(j && j.text, 1000) || T("مافيش حاجة في ذاكرتنا عن «" + q + "». ماتخترعش؛ دوّر في المنصة أو اسأل العضو.", "Nothing in our memory about “" + q + "”. Do not invent; search the platform or ask the member.");
        holoRecall(q, j || {});
        res(t);
      }, function (e) { if (done) return; done = true; clearTimeout(tm); res(errText(e)); });
    });
  }

  /* ---------- bassem_tasks / janna_tasks: the persona's own task list (worker/src/tasks.js) ---------- */
  function tasksErr(e) {
    var c = (e && e.code) || "";
    if (e && e.text && /^(no_task|invalid)$/.test(c)) return clip(e.text, 300) || T("المهمة دي مش واضحة؛ اطلب القايمة الأول.", "That task is not clear; list the tasks first.");
    if (c === "invalid") return T("بيانات المهمة مش مظبوطة (العنوان من 3 لـ 160 حرف، والميعاد زي «بكرة الساعة 10» أو 2026-12-01). ماتقولش إنها اتسجّلت.", "The task details are not valid (a 3–160 character title, a date like 2026-12-01). Do not say it was saved.");
    if (/^(tasks_off|memory_off|store_off|auth_off)$/.test(c)) return T("قايمة المهام لسه مش متفعّلة على المنصة. ماتقولش إن حاجة اتسجّلت.", "The task list is not switched on yet. Do not say anything was saved.");
    if (/^(login_required|unauthorized|full_login_required|forbidden|plan)$/.test(c)) return T("مقدرتش أفتح قايمة المهام لأن جلسة الدخول مش شغالة. ماتقولش إن حاجة اتسجّلت.", "I could not open the task list (the sign-in is not active). Do not say anything was saved.");
    return T("قايمة المهام مش بترد دلوقتي، فمش هقول إنها اتسجّلت. نجرّب تاني بعد شوية.", "The task list is not answering right now, so I will not say it was saved. Let us try again shortly.");
  }
  function tasks(a, C) {
    C = C || CALL; a = args(a);
    var J = !!(C && C.agent === "janna"), act = String(a.action || "list").toLowerCase(), body = { action: act }, done = false;
    var ks = ["id", "title", "due", "kind", "status"];
    for (var i = 0; i < ks.length; i++) { var v = a[ks[i]]; if (v != null && v !== "") body[ks[i]] = typeof v === "number" ? v : clip(v, 160); }
    if (C && C.id) body.call_id = C.id;
    return new Promise(function (res) {
      var tm = setTimeout(function () { if (!done) { done = true; res(tasksErr({ code: "timeout" })); } }, RECALL_MS + 200);
      var q = act === "list" ? "?status=" + encodeURIComponent(String(body.status || "open")) : "";
      var p = J ? (C.vid ? (act === "list" ? vcall("GET", VAPI + "/tasks" + q + "&visitor_id=" + C.vid + "&lang=" + (EN() ? "en" : "ar"), null, { ms: RECALL_MS }) : vcall("POST", VAPI + "/tasks", merge(body, { visitor_id: C.vid, lang: EN() ? "en" : "ar" }), { ms: RECALL_MS })) : Promise.reject({ code: "memory_off" }))
        : act === "list" ? api("GET", API + "/tasks" + q, null, { ms: RECALL_MS }) : api("POST", API + "/tasks", body, { ms: RECALL_MS });
      p.then(function (j) { if (done) return; done = true; clearTimeout(tm); res(clip(j && j.text, 1000) || T("تمام.", "Done.")); },
        function (e) { if (done) return; done = true; clearTimeout(tm); if (J && e && e.code === "visitor_linked") vrotate(C); res(tasksErr(e)); });
    });
  }

  /* ---------- attach to one SDK client ---------- */
  var CLIENTS = [];
  /* the client tools' handlers (data/bassem-live-tools.js) — their answers are watched, never changed */
  function spy(name, h, part) {
    if (!h || typeof h.onStart !== "function" || h.__bmm) return h;
    var o = { __bmm: 1, onStart: function (p) {
      var r = h.onStart.apply(h, arguments);
      try { Promise.resolve(r).then(function (v) { completed(part, { toolCallId: p && p.toolCallId, toolName: name, arguments: p && p.arguments, result: v }, "handler"); }, function () {}); } catch (e) {}
      return r;
    } };
    if (h.onComplete) o.onComplete = function () { return h.onComplete.apply(h, arguments); };
    if (h.onFail) o.onFail = function () { return h.onFail.apply(h, arguments); };
    return o;
  }
  function attach(c, persona) {
    if (!c || typeof c.addListener !== "function" || CLIENTS.indexOf(c) > -1) return false;
    if (persona && persona !== "bassem" && persona !== "janna") return false;
    var agent = persona === "janna" ? "janna" : "bassem";
    if (agent === "janna" && !vid()) return false; /* no visitor id (data/janna-live.js older than 0009): Janna's call is not recorded */
    /* one call at a time: a client of the OTHER persona means the page moved on — the old call is closed first (its final summary), so a
       part that never reported its end can never block the next call's memory */
    if (CALL && !CALL.ended && CALL.agent !== agent) endCall(false);
    CLIENTS.push(c); if (CLIENTS.length > 6) CLIENTS.shift();
    /* a client while the call is on (or a moment after its last session closed) = the next session of the same call */
    if (!CALL || CALL.ended || CALL.agent !== agent || (now() - CALL.last > 180000 && !CALL.live.length)) newCall(agent);
    var C = CALL, part = { call: C, n: ++C.parts, c: c, t0: now(), greeted: false, closed: false };
    C.live.push(part); clearTimeout(C.closeT); C.last = now();
    var reg = typeof c.registerToolCallHandler === "function" ? c.registerToolCallHandler : null;
    var TT = TASKS_TOOL[agent];
    if (reg && !reg.__bmm) {
      var wrap = function (name, h) { return reg.call(c, name, name === RECALL || name === TT ? h : spy(name, h, part)); };
      wrap.__bmm = 1;
      try { c.registerToolCallHandler = wrap; } catch (e) {}
      /* handlers registered before this file saw the client (best effort: the SDK's own table) */
      try { var hs = c.toolCallManager && c.toolCallManager.handlers; if (hs) for (var n in hs) if (n !== RECALL && n !== TT && hs[n] && !hs[n].__bmm) hs[n] = spy(n, hs[n], part); } catch (e) {}
      if (agent === "bassem") { try { reg.call(c, RECALL, { onStart: function (p) { return recall(args(p && p.arguments).query || args(p && p.arguments).q || ""); } }); } catch (e) {} }
      /* the tasks tool (a persona without it never calls it: the handler then just waits) */
      try { reg.call(c, TT, { onStart: function (p) { return tasks(p && p.arguments, C); } }); } catch (e) {}
    }
    var E = (W.anam && W.anam.AnamEvent) || {};
    var on = function (k, fn) { try { c.addListener(E[k] || k, function (a, b) { try { fn(a, b); } catch (x) {} }); } catch (e) {} };
    on("TOOL_CALL_STARTED", function (p) { started(part, p); });
    on("TOOL_CALL_COMPLETED", function (p) { completed(part, p, "event"); });
    on("TOOL_CALL_FAILED", function (p) { failed(part, p); });
    on("MESSAGE_HISTORY_UPDATED", function (m) { history(part, m); });
    on("CONNECTION_CLOSED", function () {
      part.closed = true; var i = C.live.indexOf(part); if (i > -1) C.live.splice(i, 1);
      /* no next session within 25 s (and janna-live.js did not say the call ended): the call is over */
      if (!C.live.length && !C.ended) { clearTimeout(C.closeT); C.closeT = setTimeout(function () { if (CALL === C && !C.ended && !C.live.length) endCall(false); }, CHAIN_MS); }
    });
    return true;
  }
  W.addEventListener("mig:live-client", function (e) { var d = (e && e.detail) || {}; if ((d.persona === "bassem" || d.persona === "janna") && d.client) attach(d.client, d.persona); });
  /* this file arrived after the event */
  try { var M0 = W.MIG_LIVE_CLIENT; if (M0 && (M0.persona === "bassem" || M0.persona === "janna") && M0.client) attach(M0.client, M0.persona); } catch (e) {}

  W.BASSEM_MEMORY = {
    __v: 1, attach: function (c, persona) { return attach(c, persona === "janna" ? "janna" : "bassem"); }, recall: recall, tasks: function (a) { return tasks(a, CALL); },
    call: function () { return CALL ? { id: CALL.id, agent: CALL.agent, ended: CALL.ended, parts: CALL.parts, turns: CALL.turns.length, tools: CALL.tools.length } : null; },
    flush: function (final) { return final ? endCall(false) : flush(false); },
    /* no forget(): the owner's memory policy keeps Bassem's memory (see the header) */
    outcome: function (tool, st) { return outcome(String(tool || ""), String(st || "")); },
    _t: { parse: parse, item: item, textItems: textItems, abs: abs, queryOf: queryOf, scal: scal, args: args, huntQuery: huntQuery, chunks: function () { return CALL ? chunks(CALL).map(function (ch) { return ch.length; }) : []; }, mem: MEM, vmem: VMEM, vid: vid }
  };
})();
