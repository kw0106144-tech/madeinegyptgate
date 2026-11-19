/* «باسم بيوريك» — what Bassem finds and records during his live call, SHOWN to the member (owner 2026-11-18: «باسم مش بيجمع اي داتا
   ولا بيعرض حاجه ولا بيدني اي مناقصات»). Loaded once by data/janna-live.js when Bassem's call opens. ES5, no libraries.
   1) bassem_intel — an Anam SERVER tool (the engine calls /api/intel/tool itself). The page shows EXACTLY the tool's own answer:
      data/janna-live.js re-dispatches the SDK's TOOL_CALL_COMPLETED as "anam-agent:tool-call-completed" {toolName, toolCallId, result}
      and result = the webhook's JSON {count, results[], market, widened, text}: the same count, the same items, the same widening note
      Bassem is speaking from, on
        - the hologram: MIGHOLO.show({kind:"results", count, items:[{title, sub:"الجهة · السوق · آخر ميعاد …", href: official url}]})
        - the call's shared screen: the FIRST result's own page on the Information Center (/intel/<seg>/<slug>-<id>/) — not a list
          page, whose own window (120 days) and count would differ from what Bassem says. The screen is never replaced while it holds
          work (the deal room / an edited form: JANNA_LIVE.show refuses); then, and on phones, a results card under the video offers it.
      Only when no outcome arrives within 8 s (an engine that does not report it, the widget) the public feed is read instead, and it
      is labelled as the Information Center's list, with no count and no «باسم لقى» claim.
   2) bassem_save_profile — a client tool with awaitResult: janna-live.js registers it with the SDK (registerToolCallHandler) and
      saveProfile() returns the Promise of the short result Bassem is given: «اتسجّل في ملف مصنعك: …» only after POST
      /api/advisor/profile answered that it saved; else «ماتسجّلش: <why>» or «مش متأكد إنه اتسجّل …». The hologram shows the same.
   No invented data: only what the tool / the feed / the platform answered; nothing is shown when the API does not answer.
   API: window.BASSEM_VIEW = {saveProfile(args) → Promise<string>, intel(args), showIntel(r, args, mode), toolResult(detail),
        feedParams(args), screenUrl(r), mkName(code)} */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.BASSEM_VIEW) return;
  var EN = W.MIGLANG === "en";
  function T(ar, en) { return EN ? en : ar; }
  var API = String(W.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var INTEL = "/api/intel";
  var FALLBACK_MS = 8000;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function str(v, n) { v = v == null ? "" : (Object.prototype.toString.call(v) === "[object Array]" ? v.join(T("، ", ", ")) : String(v)); v = v.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); return n && v.length > n ? v.slice(0, n - 1) + "…" : v; }
  function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function holo() { return W.MIGHOLO && W.MIGHOLO.result ? W.MIGHOLO : null; }
  function live() { return D.querySelector(".jnl:not([hidden])"); }
  /* the stacked call layout (phones, portrait tablets, 4:3): the shared screen is under the video, behind the «الشاشة» button */
  function stacked() { try { return !!(W.matchMedia && W.matchMedia("(max-width:820px),(max-aspect-ratio:3/2)").matches); } catch (e) { return false; } }

  /* ---------- markets: spoken name → code (for the fallback feed query only) and code → name (every code the tool may answer) ---------- */
  var MK = { local: "eg", egypt: "eg", eg: "eg", "مصر": "eg", gulf: "gcc", gcc: "gcc", "الخليج": "gcc", "الخليج العربي": "gcc", "دول الخليج": "gcc", arab: "arab", "الدول العربية": "arab", "العربية": "arab",
    africa: "africa", "أفريقيا": "africa", "افريقيا": "africa", asia: "asia", "آسيا": "asia", "اسيا": "asia", "شرق آسيا": "asia", "شرق اسيا": "asia", europe: "eu", eu: "eu", "أوروبا": "eu", "اوروبا": "eu",
    intl: "intl", international: "intl", "دولي": "intl", "عالمي": "intl", china: "asia:cn", "الصين": "asia:cn", india: "asia:in", "الهند": "asia:in", turkey: "asia:tr", "تركيا": "asia:tr",
    saudi: "sa", "saudi arabia": "sa", ksa: "sa", "السعودية": "sa", "السعوديه": "sa", uae: "ae", "الإمارات": "ae", "الامارات": "ae", qatar: "qa", "قطر": "qa", kuwait: "kw", "الكويت": "kw", oman: "om", "عمان": "om", "عُمان": "om",
    bahrain: "bh", "البحرين": "bh", libya: "ly", "ليبيا": "ly", sudan: "sd", "السودان": "sd", iraq: "iq", "العراق": "iq", jordan: "jo", "الأردن": "jo", "الاردن": "jo", morocco: "ma", "المغرب": "ma",
    algeria: "dz", "الجزائر": "dz", tunisia: "tn", "تونس": "tn", kenya: "africa:ke", "كينيا": "africa:ke", nigeria: "africa:ng", "نيجيريا": "africa:ng", ethiopia: "africa:et", "إثيوبيا": "africa:et", "اثيوبيا": "africa:et" };
  /* names as worker-intel markets.js / terms.js MARKET_GROUP_NAME give them */
  var MKN = { eg: ["مصر", "Egypt"], gcc: ["الخليج", "the Gulf"], arab: ["الدول العربية", "Arab markets"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], eu: ["أوروبا", "Europe"], intl: ["السوق الدولي", "international"],
    sa: ["السعودية", "Saudi Arabia"], ae: ["الإمارات", "the UAE"], qa: ["قطر", "Qatar"], kw: ["الكويت", "Kuwait"], om: ["عُمان", "Oman"], bh: ["البحرين", "Bahrain"], jo: ["الأردن", "Jordan"], iq: ["العراق", "Iraq"],
    ma: ["المغرب", "Morocco"], tn: ["تونس", "Tunisia"], dz: ["الجزائر", "Algeria"], ly: ["ليبيا", "Libya"], lb: ["لبنان", "Lebanon"], ye: ["اليمن", "Yemen"], ps: ["فلسطين", "Palestine"], sy: ["سوريا", "Syria"],
    sd: ["السودان", "Sudan"], dj: ["جيبوتي", "Djibouti"], mr: ["موريتانيا", "Mauritania"], so: ["الصومال", "Somalia"],
    "africa:ke": ["كينيا", "Kenya"], "africa:ng": ["نيجيريا", "Nigeria"], "africa:et": ["إثيوبيا", "Ethiopia"], "africa:gh": ["غانا", "Ghana"], "africa:tz": ["تنزانيا", "Tanzania"], "africa:ug": ["أوغندا", "Uganda"],
    "africa:rw": ["رواندا", "Rwanda"], "africa:sn": ["السنغال", "Senegal"], "africa:ci": ["كوت ديفوار", "Côte d'Ivoire"], "africa:za": ["جنوب أفريقيا", "South Africa"], "africa:cm": ["الكاميرون", "Cameroon"],
    "africa:ao": ["أنغولا", "Angola"], "africa:mz": ["موزمبيق", "Mozambique"], "africa:zm": ["زامبيا", "Zambia"], "africa:cd": ["الكونغو الديمقراطية", "DR Congo"], "africa:ss": ["جنوب السودان", "South Sudan"],
    "asia:cn": ["الصين", "China"], "asia:in": ["الهند", "India"], "asia:tr": ["تركيا", "Türkiye"], "asia:pk": ["باكستان", "Pakistan"], "asia:bd": ["بنغلاديش", "Bangladesh"], "asia:id": ["إندونيسيا", "Indonesia"],
    "asia:my": ["ماليزيا", "Malaysia"], "asia:vn": ["فيتنام", "Vietnam"], "asia:jp": ["اليابان", "Japan"], "asia:kr": ["كوريا الجنوبية", "South Korea"], "asia:uz": ["أوزبكستان", "Uzbekistan"], "asia:kz": ["كازاخستان", "Kazakhstan"] };
  function marketCode(v) {
    var s = str(isArr(v) ? v[0] : String(v == null ? "" : v).split(/\s*[,،;|/]\s*/)[0], 40).toLowerCase(); if (!s) return "";
    if (MK[s]) return MK[s];
    if (/^(?:[a-z]{2}|africa:[a-z]{2}|asia:[a-z]{2})$/.test(s)) return s;
    return "";
  }
  /* a code («gcc», «africa:ke», «gcc,africa») → its name(s); never a raw code in the Arabic interface */
  function mkName(c) {
    var list = String(c || "").split(","), out = [];
    for (var i = 0; i < list.length; i++) { var k = list[i].replace(/^\s+|\s+$/g, "").toLowerCase(); if (!k) continue; out.push(MKN[k] ? MKN[k][EN ? 1 : 0] : T("السوق اللي طلبته", "the market you asked for")); }
    if (!out.length) return "";
    return out.length < 2 ? out[0] : out.slice(0, -1).join(T("، ", ", ")) + T(" و", " and ") + out[out.length - 1];
  }
  var KINDS = { tenders: "tenders", tender: "tenders", "مناقصات": "tenders", "مناقصة": "tenders", tender_gov: "tender_gov", tender_semi: "tender_semi", tender_private: "tender_private",
    rfq: "rfq", rfqs: "rfq", "طلبات أسعار": "rfq", projects: "projects", project: "project", "مشاريع": "projects", project_news: "project_news", news: "news", "أخبار": "news", "اخبار": "news" };
  function feedParams(a) {
    a = a || {};
    var brief = String(a.action || "").toLowerCase() === "brief", q = brief ? "" : str(a.query, 100), p = { lang: EN ? "en" : "ar", per: 10 };
    var m = marketCode(a.market), k = KINDS[str(a.kind, 30).toLowerCase()] || "";
    if (q) p.q = q;
    if (m) p.market = m;
    if (k) p.kind = k;
    if (!q && a.sector) p.sector = str(a.sector, 60); /* the tool filters by sector only when there are no product words */
    var d = parseInt(a.days, 10); p.days = brief ? 1 : Math.min(Math.max(d > 0 ? d : 30, 1), 90);
    if (!brief) p.sort = "relevance";
    return { brief: brief, p: p };
  }
  function qs(p) { var o = []; for (var k in p) if (p.hasOwnProperty(k) && p[k] !== "" && p[k] != null) o.push(encodeURIComponent(k) + "=" + encodeURIComponent(p[k])); return o.join("&"); }
  function getJson(u, ms) {
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej({ code: "offline" }); return; }
      var fin = false, tm = setTimeout(function () { if (!fin) { fin = true; rej({ code: "timeout" }); } }, ms || 12000);
      W.fetch(u, { headers: { Accept: "application/json" }, credentials: "same-origin" }).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { if (!r.ok) throw { code: (j && (j.code || j.error)) || "http_" + r.status, status: r.status }; return j; });
      }).then(function (j) { if (fin) return; fin = true; clearTimeout(tm); res(j); }, function (e) { if (fin) return; fin = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline" }); });
    });
  }
  function fmtDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch (e) { return m[0]; } }
  var ISNEWS = function (it) { return it && it.kind === "news" && it.tag !== "tender_news"; };
  /* an item's own page on the Information Center as a same-site path ("" when it has none) */
  function pagePath(it) { var m = /^(?:https?:\/\/[^\/]*madeinegyptgate\.com)?(\/intel\/[^\s"'<>\\]*)$/i.exec(String((it && it.page) || "")); return m ? m[1] : ""; }
  /* one result line: title · «الجهة · السوق · آخر ميعاد …» · the official link (else its page on the Information Center) */
  function item(it) {
    var sub = [str(it.entity, 60), str(it.market_name, 30), it.deadline ? T("آخر ميعاد ", "deadline ") + fmtDay(it.deadline) : str(it.kind_label, 30)].filter(Boolean).join(" · ");
    var href = /^https?:\/\//i.test(String(it.url || "")) ? String(it.url) : pagePath(it);
    return { title: str(it.title || it.title_ar || it.title_orig, 140), sub: sub, href: href, kind: it.kind || "", page: pagePath(it) };
  }
  function arN(n) { return n === 1 ? "نتيجة واحدة" : n === 2 ? "نتيجتين" : n.toLocaleString("en-US") + (n >= 3 && n <= 10 ? " نتايج" : " نتيجة"); }
  /* the shared screen: the first result's own page (exactly one of the items Bassem got), nothing when there is none */
  function screenUrl(r) { var it = r && r.items && r.items[0]; return it ? pagePath(it) : ""; }
  function flashScreenButton() {
    var sw = D.querySelector(".jnl .jnl-hd .sw"); if (!sw) return;
    sw.classList.remove("new"); void sw.offsetWidth; sw.classList.add("new"); /* restart the ping even when it already ran */
  }

  /* ---------- bassem_intel: the tool's own answer; the feed only as a labelled fallback ---------- */
  var RUN = 0, PEND = [];
  function pendFind(id) { for (var i = 0; i < PEND.length; i++) if (id ? PEND[i].id === id : true) return i; return -1; }
  function onStarted(d) {
    var a = d.arguments || d.args || {};
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (x) { a = {}; } }
    var id = String(d.toolCallId || ""), k = ""; try { k = JSON.stringify(a); } catch (x) {}
    for (var i = 0; i < PEND.length; i++) if ((id && PEND[i].id === id) || (PEND[i].k === k && Date.now() - PEND[i].at < 1500)) return; /* one call reported twice */
    var p = { id: id, k: k, a: a, at: Date.now(), t: 0 };
    p.t = setTimeout(function () { var j = PEND.indexOf(p); if (j < 0) return; PEND.splice(j, 1); intel(p.a); }, FALLBACK_MS);
    PEND.push(p); if (PEND.length > 6) { clearTimeout(PEND[0].t); PEND.shift(); }
  }
  function take(d) { var i = pendFind(String(d.toolCallId || "")); if (i < 0 && d.toolCallId) i = pendFind(""); if (i < 0) return null; var p = PEND.splice(i, 1)[0]; clearTimeout(p.t); return p; }
  /* the webhook's JSON as the engine reports it (an object, or its JSON text, possibly wrapped once) → {count, results[], …} | null */
  function parseResult(r) {
    for (var n = 0; n < 3 && r != null; n++) {
      if (typeof r === "string") { try { r = JSON.parse(r); } catch (x) { return null; } continue; }
      if (typeof r !== "object") return null;
      if (isArr(r.results)) return r;
      r = r.result != null ? r.result : r.data != null ? r.data : r.body;
    }
    return null;
  }
  /* TOOL_CALL_COMPLETED of bassem_intel → exactly what Bassem got */
  function toolResult(d) {
    d = d || {}; var p = take(d), r = parseResult(d.result);
    if (!r) { if (p) intel(p.a); return false; } /* an answer the page cannot read: the labelled feed list instead */
    RUN++; /* a fallback feed query still on its way must not overwrite the tool's own answer */
    var a = (p && p.a) || {}, brief = String(a.action || "").toLowerCase() === "brief", mk = String(r.market || "");
    var asked = mk && mk !== "plan" && mk !== "all" ? mk : "";
    showIntel({ count: r.count, items: r.results, brief: brief, q: brief ? "" : str(a.query, 100), market: r.widened ? "" : asked, widenedFrom: r.widened ? asked || marketCode(a.market) : "", widenedTo: r.widened ? String(r.widened) : "" }, a, "tool");
    return true;
  }
  function toolFailed(d) {
    var p = take(d || {}); if (!p) return;
    RUN++; var H = holo();
    if (H) try { H.step(T("البحث في مركز المعلومات ماكملش — مفيش نتايج أعرضها", "The Information Center search did not finish — no results to show"), "fail"); } catch (e) {}
  }
  /* fallback: GET the public feed (as asked → the longest word → without the market) and show it as the Information Center's list */
  function intel(a) {
    var run = ++RUN, f = feedParams(a), p = f.p;
    var show = function (r) { if (run === RUN) showIntel(r, a, "feed"); };
    if (f.brief) {
      getJson(INTEL + "/brief?" + qs({ lang: p.lang, market: p.market || "", sector: a && a.sector ? str(a.sector, 60) : "" })).then(function (j) {
        var top = ((j && j.top) || []).slice(0), opp = top.filter(function (x) { return !ISNEWS(x); });
        show({ items: (opp.length ? opp : top).slice(0, 5), brief: true });
      }, function (e) { show({ error: e }); });
      return;
    }
    var tryQ = function (pp, widened, shorter) {
      getJson(INTEL + "/feed?" + qs(pp)).then(function (j) {
        var items = (j && j.items) || [], opp = items.filter(function (x) { return !ISNEWS(x); });
        if (!opp.length && pp.q && !shorter && /\s/.test(pp.q)) { var w = pp.q.split(/\s+/).sort(function (x, y) { return y.length - x.length; })[0]; if (w && w.length > 1) { var p2 = copy(pp); p2.q = w; tryQ(p2, widened, true); return; } }
        if (!opp.length && pp.market && !widened) { var p3 = copy(pp); delete p3.market; tryQ(p3, pp.market, shorter); return; }
        /* tenders / RFQs / projects only; news only when there is nothing else (as the tool answers) */
        show({ items: (opp.length ? opp : items).slice(0, 5), q: pp.q || "", market: widened ? "" : pp.market || "", widenedFrom: widened || "" });
      }, function (e) { show({ error: e }); });
    };
    tryQ(p, "", false);
  }
  function copy(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }
  /* r: {count, items[], q, market, widenedFrom, widenedTo, brief, error}; mode "tool" = the tool's own answer (its count and items),
     "feed" = the fallback list (no count, no «باسم لقى») */
  function showIntel(r, a, mode) {
    r = r || {};
    var H = holo(), L = live(), tool = mode === "tool";
    if (r.error) {
      /* the page could not read the feed: say so on the hologram; never a made-up list */
      if (H) try { H.step(T("مقدرتش أعرض النتايج على الشاشة دلوقتي", "Could not show the results on the screen right now"), "fail"); } catch (e) {}
      return;
    }
    var items = (r.items || []).map(item).filter(function (x) { return x.title; });
    var n = tool ? (r.count != null && !isNaN(+r.count) ? +r.count : items.length) : null;
    var wide = r.widenedTo === "all" ? T("كل الأسواق", "all markets") : r.widenedTo ? T("أسواق باقتك", "your plan's markets") : T("أسواق تانية", "other markets");
    var note = r.widenedFrom ? T("مفيش في " + mkName(r.widenedFrom) + " — دي نتايج من " + wide, "Nothing in " + mkName(r.widenedFrom) + " — results from " + wide) : "";
    var qt = r.q ? ": «" + str(r.q, 40) + "»" : "", mt = r.market ? " · " + mkName(r.market) : "";
    var title = r.brief ? T("الجديد النهارده من المصادر الرسمية", "New today from official sources") : tool ? T("باسم لقى في مركز المعلومات", "Bassem found in the Information Center") + qt + mt : T("في مركز المعلومات", "In the Information Center") + qt + mt;
    var first = items.length ? str(items[0].title, 70) : "";
    var last = !items.length ? { text: T("مفيش نتايج مطابقة في المصادر الرسمية", "No matching results in the official sources"), state: "done" }
      : tool ? (r.brief ? T("فيه " + n.toLocaleString("en-US") + " فرصة وخبر جديد في آخر 24 ساعة — أهمها: ", n + " new items in the last 24 hours — first: ") + first : T("لقيت " + arN(n) + " — أولها: ", "Found " + n + (n === 1 ? " result" : " results") + " — first: ") + first)
      : T("دي أحدث القايمة في مركز المعلومات — أولها: ", "The latest in the Information Center — first: ") + first;
    if (H && H.show) try {
      var stp = [tool ? T("دوّرت في المناقصات وطلبات الأسعار والمشاريع والأخبار الرسمية", "Searched official tenders, RFQs, projects and news") : T("فتحت قايمة مركز المعلومات", "Opened the Information Center list")];
      if (note) stp.push(note);
      stp.push(last);
      H.show({ who: "bassem", kind: "results", title: title, steps: stp, items: items, count: n, done: true });
    } catch (e) {}
    else if (H) try { H.result({ count: n, items: items }); } catch (e) {}
    if (!L) return;
    var url = screenUrl({ items: items }), shown = false, busy = false;
    if (url && W.JANNA_LIVE && W.JANNA_LIVE.show) { try { shown = !!W.JANNA_LIVE.show(url); busy = !shown && !!(W.JANNA_LIVE.screenBusy && W.JANNA_LIVE.screenBusy()); } catch (e) {} }
    if (shown) flashScreenButton();
    /* phones (the screen sits under the video) and a screen that holds work (the e-mail draft stays): the card offers the page */
    if (stacked() || (url && !shown)) card({ title: title, count: n, items: items, note: [note, !items.length ? T("مفيش نتايج مطابقة في المصادر الرسمية", "No matching results in the official sources") : "", busy ? T("سيبت الشاشة زي ما هي علشان شغلك اللي عليها", "I left the screen as it is so your work on it stays") : ""].filter(Boolean).join(" · "), more: url, busy: busy });
  }

  /* ---------- the results card under the video (phones; on desktop only when the screen was left as it is) ---------- */
  var CSS = ".bv-card{margin:10px auto 0;max-width:var(--jnl-w,100%);box-sizing:border-box;border:1px solid rgba(120,220,255,.45);border-radius:14px;background:rgba(4,18,26,.94);color:#dff7ff;padding:10px 12px;font:600 .84rem/1.6 Cairo,Tajawal,Tahoma,sans-serif;box-shadow:0 0 24px -8px rgba(90,210,255,.55)}"
    + ".bv-card[hidden]{display:none}.bv-card h4{margin:0 0 6px;font-size:.9rem;color:#fff;display:flex;gap:8px;align-items:center}.bv-card h4 em{font-style:normal;background:rgba(90,210,255,.18);border:1px solid rgba(120,220,255,.5);border-radius:99px;padding:0 8px;font-size:.76rem}"
    + ".bv-card h4 b{flex:1 1 auto}.bv-card .bv-x{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;cursor:pointer}"
    + ".bv-card ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}.bv-card li a,.bv-card li span.t{display:block;color:#bff3ff;text-decoration:none;font-weight:800;overflow-wrap:anywhere}"
    + ".bv-card li small{display:block;color:#9fc9d6;font-weight:600;font-size:.76rem}.bv-card .bv-n{color:#e9c46a;font-size:.8rem}.bv-card .bv-more{display:inline-block;margin-top:8px;color:#04121a;background:#5ad2ff;border-radius:10px;padding:4px 12px;font-weight:800;text-decoration:none;border:0;font:inherit;cursor:pointer}"
    + ".bv-card .bv-ok{color:#7fe3c0}.bv-card .bv-er{color:#ff9aa9}"
    /* phones: over the top of the video, kept short (Bassem's face stays visible below it), scrolls inside itself, folds after 12 s */
    + "@media (max-width:820px),(max-aspect-ratio:3/2){.bv-card{position:fixed;z-index:2147483200;left:10px;right:10px;top:calc(env(safe-area-inset-top,0px) + 62px);margin:0;max-width:none;max-height:28vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:rgba(4,18,26,.9)}}";
  function css() { if (D.getElementById("bv-css")) return; var s = D.createElement("style"); s.id = "bv-css"; s.textContent = CSS; (D.head || D.documentElement).appendChild(s); }
  /* o: {title, count, items[{title, sub, href}], note, more (screen path), busy (the screen holds work), cls: "ok" | "er"} */
  function card(o) {
    var L = live(), me = L && L.querySelector(".jnl-me"); if (!me) return null;
    css();
    var c = me.querySelector(".bv-card");
    if (!c) { c = D.createElement("section"); c.className = "bv-card"; c.setAttribute("role", "status"); c.setAttribute("aria-live", "polite"); c.dir = EN ? "ltr" : "rtl"; var cap = me.querySelector(".jnl-cap"); if (cap && cap.nextSibling) me.insertBefore(c, cap.nextSibling); else me.appendChild(c); }
    var h = '<h4><b class="' + (o.cls ? "bv-" + o.cls : "") + '">' + esc(o.title) + "</b>" + (o.count != null && !isNaN(+o.count) ? "<em>" + esc((+o.count).toLocaleString("en-US")) + "</em>" : "") + '<button type="button" class="bv-x" aria-label="' + esc(T("إخفاء", "Hide")) + '">✕</button></h4>';
    if (o.note) h += '<div class="bv-n">' + esc(o.note) + "</div>";
    var it = o.items || [];
    if (it.length) {
      h += "<ol>";
      for (var i = 0; i < it.length && i < 5; i++) {
        var x = it[i], safe = /^https?:\/\//i.test(x.href || "") || /^\/intel\//.test(x.href || "");
        h += "<li>" + (safe ? '<a dir="auto" href="' + esc(x.href) + '" target="_blank" rel="noopener">' + esc(x.title) + "</a>" : '<span class="t" dir="auto">' + esc(x.title) + "</span>") + (x.sub ? '<small dir="auto">' + esc(x.sub) + "</small>" : "") + "</li>";
      }
      h += "</ol>";
    }
    /* the member's own choice: on the call's screen — or, while the screen holds his work, in a new tab (nothing on the screen is lost) */
    if (o.more) h += '<button type="button" class="bv-more">' + esc(o.busy ? T("افتحها في صفحة جديدة", "Open in a new tab") : T("افتحها على الشاشة", "Open on the screen")) + "</button>";
    c.innerHTML = h; c.hidden = false;
    c.querySelector(".bv-x").onclick = function () { c.hidden = true; };
    /* it covers part of the video on phones: it folds away after 12 s (40 s on desktop) unless the member is using it */
    clearTimeout(c._t); c._t = setTimeout(function () { c.hidden = true; }, stacked() ? 12000 : 40000);
    c.onpointerdown = function () { clearTimeout(c._t); };
    var mb = c.querySelector(".bv-more");
    if (mb) mb.onclick = function () {
      var JL = W.JANNA_LIVE, s = L.querySelector(".jnl-scr");
      if (JL && JL.screenBusy && JL.screenBusy()) { try { W.open(o.more, "_blank", "noopener"); } catch (e) {} return; }
      if (JL && JL.show) JL.show(o.more, { force: true });
      if (s) try { s.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { s.scrollIntoView(); }
    };
    return c;
  }

  /* ---------- bassem_save_profile → POST /api/advisor/profile → the result Bassem is given ---------- */
  var FIELDS = ["products", "specs", "capacity", "target_markets", "certifications", "export_experience", "notes"];
  var LABEL = { products: ["المنتجات", "Products"], specs: ["المواصفات", "Specifications"], capacity: ["الطاقة الإنتاجية", "Capacity"], target_markets: ["الأسواق المستهدفة", "Target markets"], certifications: ["الشهادات", "Certifications"], export_experience: ["خبرة التصدير", "Export experience"], notes: ["ملاحظات", "Notes"] };
  function lab(f) { return LABEL[f] ? LABEL[f][EN ? 1 : 0] : String(f || ""); }
  function labs(list) { var o = []; for (var i = 0; i < (list || []).length; i++) if (LABEL[list[i]]) o.push(lab(list[i])); return o.join(T("، ", ", ")); }
  function auths() {
    var out = [], t = "", c = null;
    try { t = localStorage.getItem("mig-tok") || ""; } catch (e) {}
    if (t) out.push(t);
    try { c = JSON.parse(sessionStorage.getItem("mig-adv-token") || "null"); } catch (e) {}
    if (c && c.t && out.indexOf(String(c.t)) < 0) out.push(String(c.t));
    return out;
  }
  function postJson(path, body, tok, ms) {
    return new Promise(function (res, rej) {
      if (!W.fetch) { rej({ code: "offline" }); return; }
      var fin = false, h = { "Content-Type": "application/json", Accept: "application/json" }; if (tok) h.Authorization = "Bearer " + tok;
      var tm = setTimeout(function () { if (!fin) { fin = true; rej({ code: "timeout" }); } }, ms || 15000);
      W.fetch(API + path, { method: "POST", headers: h, body: JSON.stringify(body || {}), credentials: "same-origin" }).then(function (r) {
        if ((r.headers.get("content-type") || "").toLowerCase().indexOf("json") < 0) throw { code: "offline", status: r.status };
        return r.json().then(function (j) { if (!r.ok) throw { code: (j && j.code) || "http_" + r.status, error: (j && j.error) || "", field: j && j.field, max: j && j.max, status: r.status }; return j; });
      }).then(function (j) { if (fin) return; fin = true; clearTimeout(tm); res(j); }, function (e) { if (fin) return; fin = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline" }); });
    });
  }
  function why(e) {
    e = e || {}; var c = String(e.code || ""), f = lab(e.field);
    if (c === "profile_store_off") return T("حفظ بيانات المصنع لسه مش متفعّل على المنصة", "Saving the factory profile is not switched on yet");
    if (c === "offline") return T("سيرفر المنصة مش متاح دلوقتي", "The platform's server is not reachable right now");
    if (c === "full_login_required") return T("سجّل دخولك بكود الإيميل الأول", "Sign in with your e-mail code first");
    if (c === "plan") return T("الخدمة دي لباقات الشريك والاستراتيجي", "This is for the partner and strategic plans");
    if (e.status === 401 || c === "unauthorized") return T("لازم تسجّل الدخول الأول", "Please sign in first");
    if (c === "too_long") return T("«" + f + "» أطول من المسموح (" + e.max + " حرف)", "“" + f + "” is too long (max " + e.max + ")");
    if (c === "too_many") return T("«" + f + "» فيها عناصر أكتر من المسموح (" + e.max + ")", "“" + f + "” has too many items (max " + e.max + ")");
    if (c === "invalid_field") return T("«" + f + "» مش بالشكل الصح", "“" + f + "” is not in the right form");
    if (c === "rate_limited") return T("تغييرات كتير ورا بعض — جرّب بعد شوية", "Too many changes in a row — try again in a few minutes");
    if (c === "busy") return T("الملف اتغيّر في نفس اللحظة — جرّب تاني", "The profile changed at the same moment — try again");
    if (c === "empty") return T("مفيش بيانات أسجّلها", "Nothing to save");
    return String(e.error || c || T("مفيش رد من المنصة", "No answer from the platform"));
  }
  /* → Promise<string>: the tool result (never rejects). «اتسجّل» only on the platform's own "saved" answer. */
  function saveProfile(a) {
    a = a || {};
    var body = { source: "bassem" }, n = 0;
    for (var i = 0; i < FIELDS.length; i++) { var k = FIELDS[i], v = a[k]; if (v == null || v === "" || (isArr(v) && !v.length)) continue; body[k] = v; n++; }
    if (!n) {
      scene(T("باسم بيسجّل بيانات مصنعك", "Bassem is saving your factory profile"), [], { text: T("مفيش بيانات أسجّلها — قولّي منتجاتك ومواصفاتها", "Nothing to save yet — tell me your products and their specs"), state: "fail" });
      return Promise.resolve(T("ماتسجّلش: الطلب مافيهوش بيانات — اسأل العضو عن منتجاته ومواصفاتها.", "Not saved: the call carried no details — ask the member for his products and their specs."));
    }
    var title = T("باسم سجّل بيانات مصنعك", "Bassem saved your factory profile");
    return new Promise(function (resolve) {
      var said = false, say = function (s) { if (!said) { said = true; resolve(s); } };
      /* the engine waits about 15 s for the answer: past 12 s Bassem is told it is not confirmed (the screen still shows the outcome) */
      var dl = setTimeout(function () { say(T("مش متأكد إنه اتسجّل: المنصة لسه مارَدّتش — هيظهر على الشاشة أول ما ترد.", "Not confirmed: the platform has not answered yet — the screen shows it as soon as it does.")); }, 12000);
      var toks = auths(), idx = 0;
      var fail = function (e) {
        clearTimeout(dl);
        var t2 = T("بيانات مصنعك ماتسجّلتش", "Your factory profile was NOT saved"), w = why(e);
        scene(t2, [], { text: w, state: "fail" });
        if (live() && stacked()) card({ title: t2, note: w, cls: "er" });
        say(e && e.code === "timeout" ? T("مش متأكد إنه اتسجّل: المنصة مارَدّتش في الوقت.", "Not confirmed: the platform did not answer in time.") : T("ماتسجّلش: ", "Not saved: ") + w + ".");
      };
      var go = function (prev) {
        var tok = toks[idx++] || "";
        if (!tok && idx > 1) { fail(prev); return; }
        postJson("/advisor/profile", body, tok, 11000).then(function (j) {
          clearTimeout(dl);
          var p = (j && j.profile) || {}, saved = (j && j.saved) || [], clipped = (j && j.clipped) || [], items = [];
          for (var x = 0; x < FIELDS.length; x++) { var f = FIELDS[x]; if (p[f] == null || (saved.length && saved.indexOf(f) < 0 && !(f in body))) continue; items.push({ title: lab(f), sub: str(p[f], 120) }); }
          var cut = clipped.length ? T(" (اختصرت " + labs(clipped) + " علشان كانت أطول من المسموح)", " (" + labs(clipped) + " shortened: longer than allowed)") : "";
          scene(title, items, { text: (saved.length ? T("اتسجّل على المنصة ✓", "Saved on the platform ✓") : T("البيانات دي متسجّلة عندك من قبل ✓", "These details were already saved ✓")) + cut, state: "done" });
          try { W.dispatchEvent(new CustomEvent("mig:agent-action", { detail: { tool: "bassem_save_profile", ok: true } })); } catch (e) {}
          if (live() && stacked()) card({ title: title, items: items, cls: "ok" });
          say(saved.length ? T("اتسجّل في ملف مصنعك: ", "Saved to the factory profile: ") + labs(saved) + cut + "." : T("اتسجّل من قبل: البيانات دي موجودة في ملف مصنعك بالفعل.", "Already saved: these details are in the factory profile already."));
        }, function (e) {
          if (e && (e.status === 401 || /^(full_login_required|plan)$/.test(e.code)) && idx < toks.length) { go(e); return; }
          fail(e);
        });
      };
      go(null);
    });
  }
  function scene(title, items, last) {
    var H = W.MIGHOLO; if (!H || !H.show) return;
    try { H.show({ who: "bassem", kind: "results", title: title, steps: [T("بجمع اللي قلتهولي عن مصنعك", "Collecting what you told me about your factory"), last], items: items, count: items.length || null, done: true }); } catch (e) {}
  }

  /* ---------- wiring (capture phase: the widget's own events reach the document even when they do not bubble) ---------- */
  D.addEventListener("anam-agent:tool-call-started", function (e) { var d = (e && e.detail) || {}; if ((d.toolName || d.name) === "bassem_intel") onStarted(d); }, true);
  D.addEventListener("anam-agent:tool-call-completed", function (e) { var d = (e && e.detail) || {}; if ((d.toolName || d.name) === "bassem_intel") toolResult(d); }, true);
  D.addEventListener("anam-agent:tool-call-failed", function (e) { var d = (e && e.detail) || {}; if ((d.toolName || d.name) === "bassem_intel") toolFailed(d); }, true);
  W.BASSEM_VIEW = { saveProfile: saveProfile, intel: intel, showIntel: showIntel, toolResult: toolResult, feedParams: feedParams, screenUrl: screenUrl, mkName: mkName, v: 2 };
})();
