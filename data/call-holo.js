/* «كروت الهولوجرام على فيديو المكالمة» — owner 2026-11-20, in a live call with Janna on his iPhone: «المفروض وهي بتقول أنا ببحث عن مناقصة
   او فرصة يظهر ده», with three circles on the empty office wall around her head. While Janna or Bassem SEARCHES, what she / he searches
   for and what the search found float as small glass cards ON THE VIDEO, around the face, so the member sees the persona and the
   results together without scrolling (on phones the shared screen is under the video). Loaded lazily by data/janna-live.js when a call
   opens (the same ?v= as janna-live.js, or window.MIGVER_CH). ES5, no libraries, nothing from other origins.
   1) What starts a card: only a REAL tool call of the SDK call (data/janna-live.js re-dispatches the SDK's TOOL_CALL_STARTED /
      TOOL_CALL_COMPLETED / TOOL_CALL_FAILED as anam-agent:* events on .jnl-sdk; this file listens on the document, capture phase) —
      never her words: a «ثواني، بدوّرلك» with no tool call behind it shows nothing (owner's call 8bacbfac, turns 28 and 30). Tools:
      janna_lookup (server: the platform's directory, its JSON answer), janna_search (client: the shared screen; no data of its own),
      bassem_intel action search / brief / item (server: the Information Center), platform_item (server: ONE item), and in Bassem's calls
      bassem_open_item / bassem_open_opportunity when they carry words (their structured twin: window "mig:screen-result" from
      data/bassem-live-tools.js, and the handler's answer). Webhook arguments arrive nested ({bodyParams:{…}}): unwrapped here.
   2) One step = one group: the persona starts all its tools within ~50 ms; starts within JOIN_MS join one card group, a later one
      replaces it («a new search replaces them»). janna_lookup + janna_search with the same section and words are ONE row. Completions
      pair by toolCallId (an engine without ids: the oldest start of that tool still waiting). The searching card shows at once
      («بدوّر على» + the words + the sections, a scanning line), the results when every data row answered (or 1.5 s after the first):
      a header with the count of each section and up to 3 result cards (title · entity / company · ONE key fact the result really has:
      deadline, place, country, value or price; «✓ موثّق من فريق المنصة» only on verified:true). Nothing found → one card «مالقيتش
      نتايج مطابقة لـ «…»» that fades after 6 s; a call that failed / never answered says so — never a made-up result. A result's
      `text`, `note` and `contact` are instructions to the LLM and are never shown; e-mail addresses, phone numbers and links are
      stripped from every shown string (privacy: no factory contacts).
   3) Where: the free wall around the face, derived from the stage size, the stream's real size (videoWidth / videoHeight, 3:2) and its
      object-fit: cover / object-position — the persona's head box (hair and normal motion included, window.JANNA_LIVE_FACE overrides
      it), never over the face, the AI label (.jv-ai), the control bar, the chips above it (noise / 🌐), the status line, Bassem's
      «شوف الشاشة», the hologram's panels (data/holo.js) or any button. Wide stages: the upper-left wall (searching / header), then
      the upper-right under the AI label and the lower sides beside the neck and shoulders (the owner's three circles, larger cards).
      Phones in portrait (the head fills most of the width): the header in the top-left corner beside the AI label, the results on the
      shelf under the chin (over the jacket), the upper-right wall when it is wide enough; a result needs 86 px to be read (never a
      2-word pill), a chip up (🌐 / noise) moves them above it. Laid out on
      events (start, result, resize, full screen, the video's size) plus a light 700 ms check while cards show (the chips appear without
      an event) — no animation-frame loop, no work per video frame. ?holodebug=1 (or window.JANNA_LIVE_HOLO_DEBUG = 1) draws the head box
      and the free zones, to calibrate a new avatar on a real phone.
   4) Behaviour: the cards stay while the persona talks about them (JANNA_LIVE.speaking(): the countdown waits for her speech, 75 s at
      most), fade 30 s after the results without a new search, at the end of the call or with ✕. A tap on a result = its page on the
      shared screen exactly as an item opens there (JANNA_LIVE.showCard: open_url of THIS site only; a screen with work on it — the deal
      room, a form being filled — is never replaced: Bassem's own tab / a new tab instead), and on stacked phones the call scrolls to the
      screen like «الشاشة»; the call is never left. The cards never move the screen by themselves, never touch the microphone, the
      captions, the barge-in or the 🌐 switch (they hide while its menu is open); hidden unless the call is live, gone with the call.
   5) data/holo.js and data/bassem-intel-view.js ask owns(tool, args) and leave these tools to the cards in SDK calls (no second scene of
      the same search over her face). Off: window.JANNA_LIVE_HOLO = 0, or the owner's switch «🛠️ المطوّر» → call_holo (data/flags.js).
   API: window.MIG_CALL_HOLO = {owns(tool, args), on(), state(), clear(), layout(), _t (the pure functions, tests)} */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.MIG_CALL_HOLO) return;
  var EN = W.MIGLANG === "en";
  function T(ar, en) { return EN ? en : ar; }

  /* @holo-pure-begin — no DOM in this block (functions/_tests/call-holo.test.mjs reaches it through MIG_CALL_HOLO._t) */
  var OP = Object.prototype.hasOwnProperty;
  function own(o, k) { return !!o && OP.call(o, k); }
  function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  /* a shown string: no links, no e-mail addresses, no phone numbers (a reference like 6/2026/2027, an RFQ number, a date stay) */
  var MAIL_RX = /[^\s@<>()\[\]«»"',;:]+@[^\s@<>()\[\]«»"',;:]+\.[a-z]{2,24}/gi;
  function clean(v, n) {
    var s = v == null ? "" : isArr(v) ? v.join(T("، ", ", ")) : typeof v === "object" ? "" : String(v);
    s = s.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(MAIL_RX, "")
      .replace(/(^|[^\d\/:.\-])(0\d[\d\s\-]{7,12}\d)(?![\d\/])/g, function (m, a) { return a; })
      .replace(/(?:\+|00)\d[\d\s\-().]{6,16}\d/g, "")
      .replace(/[\u200e\u200f]/g, "").replace(/\s+/g, " ").replace(/^[\s\-–—·|:،,]+|[\s\-–—·|:،,]+$/g, "");
    return n && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }
  /* the same normalisation as data/janna-live.js norm (a leading «ال» aside) */
  function norm(s) { return String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/^ال/, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase(); }
  /* the tool's arguments: an object, its JSON text, or the webhook's nested {bodyParams:{…}} (never a field called body: an e-mail has one) */
  function argsOf(a) {
    var o = {}, k, b = null, i, nest = ["bodyParams", "parameters", "arguments", "args", "input"];
    if (typeof a === "string") { try { a = JSON.parse(a); } catch (e) { a = null; } }
    if (!a || typeof a !== "object" || isArr(a)) return o;
    for (k in a) if (own(a, k) && (a[k] == null || typeof a[k] !== "object")) o[k] = a[k];
    for (i = 0; i < nest.length; i++) {
      b = a[nest[i]]; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (b && typeof b === "object" && !isArr(b)) { for (k in b) if (own(b, k)) o[k] = b[k]; }
    }
    return o;
  }
  /* the tool's answer: its JSON text (server webhooks), an object, or wrapped once */
  function resOf(r) {
    for (var n = 0; n < 4 && r != null; n++) {
      if (typeof r === "string") { try { r = JSON.parse(r); } catch (x) { return null; } continue; }
      if (typeof r !== "object" || isArr(r)) return null;
      if (r.results || r.found != null || r.ok === false || r.count != null || r.error) return r;
      r = r.result != null ? r.result : r.data != null ? r.data : r.body;
    }
    return null;
  }
  function fmtN(n) { n = +n; if (!isFinite(n)) return ""; try { return Math.round(n).toLocaleString("en-US"); } catch (e) { return String(Math.round(n)); } }
  function fmtDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!m) return ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch (e) { return m[0]; } }
  /* «لقيت …»: Egyptian Arabic counting (as data/holo.js / bassem-intel-view.js arN), English plural */
  function nRes(n) {
    n = Math.max(0, Math.round(+n || 0));
    if (EN) return n === 1 ? "1 result" : fmtN(n) + " results";
    return n === 0 ? "مفيش نتايج" : n === 1 ? "نتيجة واحدة" : n === 2 ? "نتيجتين" : fmtN(n) + (n <= 10 ? " نتايج" : " نتيجة");
  }
  /* sections: icon, plural (the searching card), one (a result's tag) */
  var SECS = {
    factories: { ic: "🏭", pl: ["مصانع", "Factories"], one: ["مصنع", "Factory"] },
    suppliers: { ic: "🏭", pl: ["موردين", "Suppliers"], one: ["مورد", "Supplier"] },
    products: { ic: "📦", pl: ["منتجات", "Products"], one: ["منتج", "Product"] },
    tenders: { ic: "📄", pl: ["مناقصات", "Tenders"], one: ["مناقصة", "Tender"] },
    rfqs: { ic: "🧾", pl: ["طلبات أسعار", "RFQs"], one: ["طلب عرض سعر", "RFQ"] },
    offers: { ic: "🏷️", pl: ["عروض", "Offers"], one: ["عرض", "Offer"] },
    cities: { ic: "🏙️", pl: ["مدن صناعية", "Industrial zones"], one: ["منطقة صناعية", "Industrial zone"] },
    projects: { ic: "🏗️", pl: ["مشروعات", "Projects"], one: ["مشروع", "Project"] },
    awards: { ic: "🏆", pl: ["ترسيات", "Awards"], one: ["ترسية", "Award"] },
    intel: { ic: "🌍", pl: ["فرص", "Opportunities"], one: ["فرصة", "Opportunity"] },
    opp: { ic: "💼", pl: ["فرص", "Opportunities"], one: ["فرصة", "Opportunity"] }
  };
  var LIST_SEC = { factories: "factories", suppliers: "suppliers", products: "products", market: "products", tenders: "tenders", rfqs: "rfqs", rfq: "rfqs", offers: "offers", cities: "cities", projects: "projects" };
  var ITEM_SEC = { tenders: "tenders", rfqs: "rfqs", factories: "factories", suppliers: "factories", products: "products", offers: "offers", cities: "cities", awards: "awards", winners: "awards", projects: "projects", intel: "intel" };
  function S(sec) { return SECS[sec] || SECS.factories; }
  /* markets: janna_lookup's tender markets, bassem_intel's codes / words (never a raw code on the card) */
  var MKN = { local: ["مصر", "Egypt"], eg: ["مصر", "Egypt"], gulf: ["الخليج", "the Gulf"], gcc: ["الخليج", "the Gulf"], arab: ["الدول العربية", "Arab markets"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"],
    europe: ["أوروبا", "Europe"], eu: ["أوروبا", "Europe"], intl: ["برّه مصر", "abroad"], all: ["مصر وبرّه", "Egypt & abroad"], plan: ["أسواق باقتك", "your plan's markets"],
    sa: ["السعودية", "Saudi Arabia"], ae: ["الإمارات", "the UAE"], qa: ["قطر", "Qatar"], kw: ["الكويت", "Kuwait"], om: ["عُمان", "Oman"], bh: ["البحرين", "Bahrain"], jo: ["الأردن", "Jordan"], iq: ["العراق", "Iraq"],
    ma: ["المغرب", "Morocco"], tn: ["تونس", "Tunisia"], dz: ["الجزائر", "Algeria"], ly: ["ليبيا", "Libya"], lb: ["لبنان", "Lebanon"], sd: ["السودان", "Sudan"],
    "africa:ke": ["كينيا", "Kenya"], "africa:ng": ["نيجيريا", "Nigeria"], "africa:et": ["إثيوبيا", "Ethiopia"], "africa:gh": ["غانا", "Ghana"], "africa:tz": ["تنزانيا", "Tanzania"], "africa:ug": ["أوغندا", "Uganda"],
    "africa:za": ["جنوب أفريقيا", "South Africa"], "africa:mz": ["موزمبيق", "Mozambique"], "africa:sn": ["السنغال", "Senegal"], "africa:ci": ["كوت ديفوار", "Côte d'Ivoire"], "africa:cm": ["الكاميرون", "Cameroon"],
    "asia:cn": ["الصين", "China"], "asia:in": ["الهند", "India"], "asia:tr": ["تركيا", "Türkiye"], "asia:pk": ["باكستان", "Pakistan"], "asia:id": ["إندونيسيا", "Indonesia"], "asia:vn": ["فيتنام", "Vietnam"] };
  var MKW = { "مصر": "eg", egypt: "eg", "الخليج": "gcc", "الخليج العربي": "gcc", "دول الخليج": "gcc", "الدول العربية": "arab", "أفريقيا": "africa", "افريقيا": "africa", "آسيا": "asia", "اسيا": "asia",
    "أوروبا": "eu", "اوروبا": "eu", international: "intl", "دولي": "intl", "عالمي": "intl", saudi: "sa", "السعودية": "sa", uae: "ae", "الإمارات": "ae", "الامارات": "ae", china: "asia:cn", "الصين": "asia:cn" };
  function mkCode(v) {
    var s = String(isArr(v) ? v[0] : v == null ? "" : v).split(/\s*[,،;|]\s*/)[0].replace(/^\s+|\s+$/g, "").toLowerCase();
    if (!s) return ""; if (own(MKN, s)) return s; if (own(MKW, s)) return MKW[s];
    return "";
  }
  function mkName(c) { return own(MKN, c) ? T(MKN[c][0], MKN[c][1]) : ""; }
  /* «مناقصات برّه مصر», «فرص في الخليج», "Tenders abroad", "Opportunities in Europe" */
  function mkWhere(c) { var n = mkName(c); return !n ? "" : c === "intl" ? n : T("في ", "in ") + n; }
  var KIND_EN = { tender_gov: "Government tender", tender_semi: "Semi-government tender", tender_private: "Private-sector tender", rfq: "Request for quotation", project: "Project", project_news: "Project news", news: "News" };
  var IKIND = { tenders: ["مناقصات", "Tenders"], tender: ["مناقصات", "Tenders"], rfq: ["طلبات أسعار", "RFQs"], rfqs: ["طلبات أسعار", "RFQs"], projects: ["مشروعات", "Projects"], project: ["مشروعات", "Projects"], news: ["أخبار", "News"] };
  /* English for a few data values the Arabic data files carry (governorates, statuses, zone types), then the site's dictionary */
  var GOV = ["القاهرة", "Cairo", "الجيزة", "Giza", "الإسكندرية", "Alexandria", "القليوبية", "Qalyubia", "الشرقية", "Sharqia", "الدقهلية", "Dakahlia", "الغربية", "Gharbia", "المنوفية", "Monufia", "البحيرة", "Beheira",
    "كفر الشيخ", "Kafr El Sheikh", "دمياط", "Damietta", "بورسعيد", "Port Said", "الإسماعيلية", "Ismailia", "السويس", "Suez", "شمال سيناء", "North Sinai", "جنوب سيناء", "South Sinai", "الفيوم", "Faiyum",
    "بني سويف", "Beni Suef", "المنيا", "Minya", "أسيوط", "Asyut", "سوهاج", "Sohag", "قنا", "Qena", "الأقصر", "Luxor", "أسوان", "Aswan", "البحر الأحمر", "Red Sea", "الوادي الجديد", "New Valley", "مطروح", "Matrouh"];
  var GOVN = {}; (function () { for (var i = 0; i < GOV.length; i += 2) GOVN[norm(GOV[i])] = GOV[i + 1]; })();
  var STATUS_EN = { "سارية": "Open", "تنتهي قريباً": "Closing soon", "تنتهي قريبا": "Closing soon", "منتهية": "Closed", "غير محدد الموعد": "No published deadline" };
  var ISTATUS = { open: ["سارية", "Open"], closing_soon: ["تنتهي قريباً", "Closing soon"], closed: ["منتهية", "Closed"] };
  function stMark(st) { st = String(st || ""); return /^(سارية|Open)/.test(st) ? "🟢 " : /^(تنتهي|Closing)/.test(st) ? "🟠 " : /^(منتهية|Closed)/.test(st) ? "⚪ " : "⏳ "; }
  var ZONE = { free_zone: ["منطقة حرة", "Free zone"], industrial_city: ["مدينة صناعية", "Industrial city"], industrial_area: ["منطقة صناعية", "Industrial area"], investment_zone: ["منطقة استثمارية", "Investment zone"], port_zone: ["منطقة ميناء", "Port zone"], tech_park: ["مجمع تكنولوجي", "Technology park"] };
  function trEn(s) {
    s = String(s || ""); if (!EN || !s || !/[\u0600-\u06ff]/.test(s)) return s;
    var g = GOVN[norm(s)]; if (g) return g;
    if (own(STATUS_EN, s)) return STATUS_EN[s];
    try { var t = W.MIGTR ? W.MIGTR(s) : ""; if (t && t !== s) return t; } catch (e) {}
    return s;
  }
  /* a place worth showing («غير محددة» = none) */
  function place(v) { v = clean(v, 44); return !v || /^غير محدد/.test(v) ? "" : trEn(v); }
  function money(v, cur) { var n = +v; if (!isFinite(n) || n <= 0) return ""; var c = String(cur || "EGP").toUpperCase(); return c === "EGP" ? T(fmtN(n) + " ج.م", "EGP " + fmtN(n)) : EN ? c + " " + fmtN(n) : fmtN(n) + " " + c; }
  /* an item's page on this site as a path ("" for any other site): the screen opens only this site's pages */
  var HOST_RX = /^https?:\/\/(?:www\.)?madeinegyptgate\.com(?=[\/?#]|$)/i;
  function pathOf(u) {
    u = String(u == null ? "" : u).replace(/^\s+|\s+$/g, ""); if (!u) return "";
    if (HOST_RX.test(u)) u = u.replace(HOST_RX, "") || "/";
    return /^\/(?!\/)[^\s"'<>\\]*$/.test(u) ? u : "";
  }
  function intelOff() { var F = W.MIGFLAGS; try { return !!(F && F.on && F.on("intel_pages") === false); } catch (e) { return false; } }
  /* the Information Center's page of an item; an English call shows its English twin (/intel/en/…), as data/bassem-intel-view.js does */
  function intelPath(u) { var p = pathOf(u); if (!/^\/intel\//.test(p) || intelOff()) return ""; return EN ? p.replace(/^\/intel\/(?!en\/)/, "/intel/en/") : p; }
  function deadline(d) { var f = fmtDay(d); return f ? "⏳ " + T("آخر ميعاد ", "Deadline ") + f : ""; }
  /* the same fact for a narrow card: the hourglass says «deadline» («⏳ 3 ديسمبر 2026») */
  function short(f) { return String(f || "").replace(/^⏳ (?:آخر ميعاد|Deadline) /, "⏳ "); }
  function rfqTitle(s) { return clean(String(s || "").replace(/^\s*طلب\s+عرض\s+سعر\s*[–\-:]\s*/, "").replace(/\s*[–\-]\s*رقم\s+الطلب\s*:.*$/, "").replace(/\s*[–\-]\s*بتاريخ\s+[\d\-\/]+\s*$/, ""), 160); }

  /* ---------- a tool call → what the card says (null: not one the cards show) ---------- */
  function words(v, n) { return clean(v, n || 60); }
  function specOf(name, a) {
    a = argsOf(a); var s, q, act;
    if (name === "janna_lookup" || name === "janna_search") {
      s = LIST_SEC[String(a.section || "").toLowerCase()] || (name === "janna_search" ? "factories" : ""); q = words(a.query);
      if (!s || !q) return null;
      return { kind: "list", tool: name, sec: s, q: q, gov: words(a.governorate, 40), mk: s === "tenders" ? mkCode(a.market) : "", data: name === "janna_lookup", key: s + "|" + norm(q) };
    }
    if (name === "bassem_intel") {
      act = String(a.action || "search").toLowerCase();
      if (/^(item|details?|open|get)$/.test(act)) return { kind: "item", tool: name, sec: "intel", q: words(a.title || a.query, 80), data: true, key: "item" };
      if (act !== "search" && act !== "brief") return null; /* its official document (doc): data/holo.js keeps that scene */
      q = act === "brief" ? "" : words(a.query) || words(a.sector, 40);
      return { kind: "list", tool: name, sec: "intel", q: q, brief: act === "brief", mk: mkCode(a.market), ik: IKIND[String(a.kind || "").toLowerCase()] || null, data: true, key: "intel|" + norm(q) + "|" + (act === "brief" ? "b" : "") };
    }
    if (name === "platform_item") {
      s = ITEM_SEC[String(a.section || "").toLowerCase()]; if (!s) return null;
      return { kind: "item", tool: name, sec: s, q: words(a.title, 80) || words(a.ref, 40), data: true, key: "item" };
    }
    if (name === "bassem_open_item") { /* only when it carries words: a bare «التانية» (index) or a link stays the hologram's */
      q = words(a.title, 80) || words(a.ref, 40); if (!q) return null;
      return { kind: "item", tool: name, sec: ITEM_SEC[String(a.section || "").toLowerCase()] || "tenders", q: q, data: false, key: "item" };
    }
    if (name === "bassem_open_opportunity") {
      q = words(a.query); if (!q) return null;
      return { kind: "item", tool: name, sec: "opp", q: q, mk: mkCode(a.market), search: true, data: false, key: "item" };
    }
    return null;
  }
  /* the section words of a row: «مناقصات · الخليج», «فرص · أوروبا», «مصانع في الشرقية» */
  function rowLabel(r) {
    var l = T(S(r.sec).pl[0], S(r.sec).pl[1]), m = "";
    if (r.sec === "intel") { l = r.brief ? T("الجديد النهارده", "New today") : r.ik ? T(r.ik[0], r.ik[1]) : l; m = mkWhere(r.mkr || r.mk); }
    else if (r.sec === "tenders" && r.mk && r.mk !== "local" && r.mk !== "eg") m = mkWhere(r.mk);
    else if (r.sec === "opp") m = mkWhere(r.mk);
    if (m) l += " " + m;
    if (r.gov) l += T(" في ", " in ") + place(r.gov);
    return l;
  }
  /* ---------- a result → a card {sec, ic, tag, title, sub, fact, href, ok} (only what the result has) ---------- */
  function cardOf(sec, r) {
    r = r || {}; var rs = String(r.section || ""), c = { sec: sec, ic: S(sec).ic, tag: T(S(sec).one[0], S(sec).one[1]), title: "", sub: "", fact: "", href: pathOf(r.open_url || r.url), ok: false }, t;
    if (sec === "intel") {
      c.title = clean(r.title || r.title_ar || r.title_orig, 160); c.sub = clean(r.entity, 70);
      c.tag = EN ? KIND_EN[r.kind] || c.tag : clean(r.kind_label, 30) || c.tag;
      t = EN ? (clean(r.country, 40) || mkName(String(r.market || ""))) : (clean(r.market_name, 30) || clean(r.country, 40));
      c.fact = deadline(r.deadline) || (t ? "🌍 " + t : "") || (money(r.value, r.currency) ? "💰 " + money(r.value, r.currency) : "");
      c.href = intelPath(r.open_url || r.page);
      return c;
    }
    if (r.product != null && (sec === "products" || sec === "offers") && !(rs === "factories")) {
      c.title = clean(EN && r.product_en ? r.product_en : r.product, 140);
      if (sec === "offers" || r.price_egp != null) {
        c.sec = "offers"; c.ic = S("offers").ic; c.tag = T(S("offers").one[0], S("offers").one[1]);
        c.sub = [clean(r.brand, 40), clean(r.store, 50)].filter(Boolean).join(" · ");
        t = money(r.price_egp, "EGP");
        c.fact = t ? "💰 " + t + (+r.old_price_egp > +r.price_egp ? T(" بدل ", " (was ") + fmtN(r.old_price_egp) + T("", ")") : "") + (+r.discount_pct > 0 ? " · -" + fmtN(r.discount_pct) + "%" : "") : "";
      } else {
        t = clean(r.maker, 90); c.sub = EN ? t.replace(/^من إنتاج\s*/, "By ") : t;
      }
      return c;
    }
    if (rs === "factories" || sec === "factories" || sec === "suppliers" || (sec === "products" && r.name)) {
      c.sec = rs === "factories" && sec === "products" ? "factories" : sec; c.ic = S("factories").ic;
      t = clean(r.type, 20); c.tag = EN ? (/مورد/.test(t) ? "Supplier" : /شركة/.test(t) ? "Company" : "Factory") : t || T(S(c.sec).one[0], S(c.sec).one[1]);
      c.title = clean(r.name || r.title, 140); c.sub = trEn(clean(r.activity, 70));
      t = place(r.governorate) || place(r.location); c.fact = t ? "📍 " + t : "";
      c.ok = r.verified === true;
      return c;
    }
    if (sec === "tenders") {
      c.title = clean(EN && r.title_en ? r.title_en : r.title, 160); c.sub = clean(EN && r.entity_en ? r.entity_en : trEn(clean(r.entity, 70)), 70);
      var intl = r.market && r.market !== "local", where = intl ? clean(EN && r.country_en ? r.country_en : trEn(clean(r.country, 40)), 40) : place(r.governorate), st = clean(r.status, 30);
      c.fact = deadline(r.deadline) || (where ? (intl ? "🌍 " : "📍 ") + where : "") || (st ? stMark(st) + trEn(st) : "");
      if (r.type && !EN && /^(مناقصة|ممارسة|مزايدة|طلب)/.test(clean(r.type, 24))) c.tag = clean(r.type, 24);
      return c;
    }
    if (sec === "rfqs") {
      c.title = rfqTitle(r.title) || clean(r.title, 160); c.sub = trEn(clean(r.activity, 70));
      t = clean(r.quantity, 50);
      c.fact = deadline(r.deadline) || (t ? "📦 " + t : "") || (place(r.governorate) ? "📍 " + place(r.governorate) : "") || (fmtDay(r.date) ? "🗓️ " + fmtDay(r.date) : "");
      return c;
    }
    if (sec === "cities") {
      c.title = clean(EN && r.name_en ? r.name_en : r.name || r.title, 140); t = ZONE[String(r.type || "")]; c.sub = t ? T(t[0], t[1]) : "";
      t = place(r.governorate); c.fact = t ? "📍 " + t : "";
      return c;
    }
    c.title = clean(r.title || r.name, 160); c.sub = clean(r.entity || r.owner || r.winner, 70);
    t = place(r.governorate); c.fact = deadline(r.deadline) || (t ? "📍 " + t : "");
    return c;
  }
  /* ONE item (platform_item / bassem_intel item / an opened item): the card plus up to two more facts */
  function itemCard(sec, r) {
    var c = cardOf(sec === "intel" ? "intel" : sec, r), f = [], add = function (x) { x = clean(x, 70); if (x && f.indexOf(x) < 0 && x !== c.fact) f.push(x); }, t;
    if (sec === "tenders") {
      t = clean(r.status, 30); if (t && (c.fact.indexOf("⏳") !== 0 || fmtDay(r.deadline))) add(stMark(t) + trEn(t));
      t = r.market && r.market !== "local" ? clean(EN && r.country_en ? r.country_en : r.country, 40) : place(r.governorate) || place(r.city); if (t) add((r.market && r.market !== "local" ? "🌍 " : "📍 ") + trEn(t));
      if (money(r.bid_bond_egp, "EGP")) add("🛡️ " + T("التأمين: ", "Bid bond: ") + money(r.bid_bond_egp, "EGP"));
      if (money(r.booklet_price_egp, "EGP")) add("📘 " + T("الكراسة: ", "Booklet: ") + money(r.booklet_price_egp, "EGP"));
      if (money(r.estimated_value, r.currency)) add("💰 " + T("القيمة التقديرية: ", "Estimated value: ") + money(r.estimated_value, r.currency));
    } else if (sec === "rfqs") {
      if (clean(r.quantity, 50)) add("📦 " + clean(r.quantity, 50)); if (clean(r.delivery, 50)) add("🚚 " + clean(r.delivery, 50)); if (place(r.governorate)) add("📍 " + place(r.governorate));
    } else if (sec === "projects") {
      c.sub = clean(r.owner, 60) || c.sub; if (clean(r.stage, 30)) add("🏗️ " + trEn(clean(r.stage, 30)));
      if (+r.value_egp_million > 0) add("💰 " + T(fmtN(r.value_egp_million) + " مليون ج.م", "EGP " + fmtN(r.value_egp_million) + " million")); if (clean(r.contractor, 50)) add("👷 " + clean(r.contractor, 50));
    } else if (sec === "awards") {
      c.sub = clean(r.winner, 60) || c.sub; if (clean(r.entity, 60)) add("🏛️ " + clean(r.entity, 60)); if (fmtDay(r.date)) add("🗓️ " + fmtDay(r.date));
    } else if (sec === "intel") {
      t = EN ? (clean(r.country, 40) || mkName(String(r.market || ""))) : (clean(r.market_name, 30) || clean(r.country, 40)); if (t) add("🌍 " + t);
      if (money(r.value, r.currency)) add("💰 " + money(r.value, r.currency)); t = ISTATUS[String(r.status || "")]; if (t) add(stMark(t[1]) + T(t[0], t[1]));
    } else if (sec === "factories") {
      if (clean(r.products, 60) && !/^منتجات /.test(clean(r.products, 60))) add("📦 " + clean(r.products, 60));
    } else if (sec === "offers") {
      if (fmtDay(r.valid_to)) add("🗓️ " + T("لحد ", "Until ") + fmtDay(r.valid_to));
    }
    c.more = f.slice(0, 2);
    return c;
  }
  /* an opportunity opened on the advisor page (data/bassem-live-tools.js watchOpportunity: «مفتوح على الشاشة: الفرصة «…»\n meta | …») */
  function oppCard(text) {
    var s = String(text || ""), m = /[«“]([^»”\n]{2,200})[»”]/.exec(s), lines = s.split("\n");
    if (!/^(مفتوح على الشاشة|On the screen)/.test(s) || !m) return null;
    var meta = clean((lines[1] || "").split("|").slice(0, 2).join(" · "), 90);
    return { sec: "opp", ic: S("opp").ic, tag: T(S("opp").one[0], S("opp").one[1]), title: clean(m[1], 160), sub: meta, fact: "", href: "", ok: false, more: [] };
  }

  /* ---------- geometry: where the face is on the stage, where the free wall is (all in stage px) ---------- */
  /* head = the persona's head with hair and normal talking motion, fractions of the stream frame (measured on the live avatars' Anam
     previews, 1152×768: OpenCV face boxes at 2 fps + landmarks); eye / cheek / chin lines; the neck (turtleneck / collar) columns */
  var FACES = { janna: { head: [0.305, 0.095, 0.655, 0.72], eye: 0.40, cheek: 0.52, chin: 0.71, neck: [0.385, 0.595] },
    bassem: { head: [0.315, 0.04, 0.67, 0.705], eye: 0.345, cheek: 0.47, chin: 0.70, neck: [0.36, 0.57] } };
  function faceOf(p, ov) {
    var f = FACES[p === "bassem" ? "bassem" : "janna"], o = ov && ov[p === "bassem" ? "bassem" : "janna"], k, out = {};
    for (k in f) if (own(f, k)) out[k] = f[k];
    if (o && isArr(o) && o.length === 4) out.head = o;
    else if (o && typeof o === "object") for (k in o) if (own(out, k) && typeof o[k] === typeof out[k]) out[k] = o[k];
    return out;
  }
  function stageGeom(Wd, Hd, vw, vh, pos, face) {
    vw = +vw || 1152; vh = +vh || 768; pos = pos || [0.5, 0.3];
    var s = Math.max(Wd / vw, Hd / vh), rw = vw * s, rh = vh * s, ox = (Wd - rw) * pos[0], oy = (Hd - rh) * pos[1];
    var X = function (f) { return ox + f * rw; }, Y = function (f) { return oy + f * rh; };
    return { W: Wd, H: Hd, s: s, ox: ox, oy: oy, rw: rw, rh: rh, head: { l: X(face.head[0]), t: Y(face.head[1]), r: X(face.head[2]), b: Y(face.head[3]) },
      eye: Y(face.eye), cheek: Y(face.cheek), chin: Y(face.chin), neckL: X(face.neck[0]), neckR: X(face.neck[1]), visible: [-ox / rw, (Wd - ox) / rw, -oy / rh, (Hd - oy) / rh] };
  }
  /* object-position "50% 30%" → [0.5, 0.3] (keywords too); anything else → the stage's own 50% 30% */
  function posOf(s) {
    var p = String(s || "").split(/\s+/), K = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }, v = [0.5, 0.3];
    for (var i = 0; i < 2 && i < p.length; i++) { if (own(K, p[i])) v[i] = K[p[i]]; else if (/%$/.test(p[i]) && isFinite(parseFloat(p[i]))) v[i] = parseFloat(p[i]) / 100; }
    return v;
  }
  function R(l, t, r, b) { return { l: l, t: t, r: r, b: b, w: r - l, h: b - t }; }
  function hit(a, b) { return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
  function padR(a, p) { return R(a.l - p, a.t - p, a.r + p, a.b + p); }
  /* the largest part of z that no obstacle covers (left / right / above / below each one in turn) */
  function trim(z, obs) {
    var cur = z;
    for (var i = 0; i < obs.length && cur && cur.w > 0 && cur.h > 0; i++) {
      var o = obs[i]; if (!hit(cur, o)) continue;
      var c = [R(cur.l, cur.t, Math.min(cur.r, o.l), cur.b), R(Math.max(cur.l, o.r), cur.t, cur.r, cur.b), R(cur.l, cur.t, cur.r, Math.min(cur.b, o.t)), R(cur.l, Math.max(cur.t, o.b), cur.r, cur.b)], best = null;
      for (var j = 0; j < 4; j++) if (c[j].w > 0 && c[j].h > 0 && (!best || score(c[j]) > score(best))) best = c[j];
      cur = best;
    }
    return cur && cur.w > 0 && cur.h > 0 ? cur : null;
  }
  /* a free part is worth what can be read in it: width first (a 40 px sliver holds a pill, 86 px a card) */
  function score(r) { return (r.w >= 150 ? 3 : r.w >= 86 ? 2 : r.w >= 40 ? 1 : 0) * 100000 + Math.min(r.w, 260) * Math.min(r.h, 200); }
  var M = 6, P = 6, GP = 6;
  /* the free zones: ul / ur (the owner's upper circles), tl (the top-left corner beside the AI label, above the head), ll / lr (beside the
     lower face and the neck), bot (the shelf under the chin, over the jacket) — each already clear of the obstacles */
  function zonesOf(g, ob) {
    var h = g.head, ai = ob.ai || null, aiB = ai ? ai.b : M, aiL = ai ? ai.l : g.W - M, bot = Math.min(g.H, ob.bottom != null ? ob.bottom : g.H) - M;
    var obs = (ai ? [padR(ai, 4)] : []).concat(ob.rects || []), z = {};
    z.ul = trim(R(M, M, h.l - P, Math.min(g.eye, bot)), obs);
    z.ur = trim(R(h.r + P, aiB + P, g.W - M, Math.min(g.cheek, bot)), obs);
    z.tl = trim(R(M, M, aiL - P, Math.min(h.t - P, bot)), obs);
    z.ll = trim(R(M, g.cheek, h.l - P, bot), obs);
    z.lr = trim(R(h.r + P, g.cheek, g.W - M, bot), obs);
    z.bl = trim(R(M, h.b + P, g.neckL - P, bot), obs);
    z.br = trim(R(g.neckR + P, h.b + P, g.W - M, bot), obs);
    z.bot = R(M, h.b + P, g.W - M, bot); z.bot = z.bot.w > 0 && z.bot.h > 0 ? z.bot : null;
    z.obs = obs;
    return z;
  }
  /* a card's class by the room it gets — full: tag, title (2 lines), entity, fact · tall: the same in a narrow column · compact: tag, title (2), fact · slim: icon + title (2),
     fact · mini: icon + title (1), fact · pill: icon + 2 words (a sliver of wall) · ifull / icompact: ONE item with its extra facts */
  var HGT = { full: 86, tall: 80, compact: 66, slim: 52, mini: 38, pill: 52, ifull: 112, icompact: 82 };
  function clsFor(w, h, item) {
    w = Math.round(w); h = Math.round(h); /* zone edges come from fractions of the frame: 65.9 px holds a 66 px card */
    if (item && w >= 150 && h >= HGT.ifull) return "ifull";
    if (item && w >= 120 && h >= HGT.icompact) return "icompact";
    if (w >= 150 && h >= HGT.full) return "full";
    if (w >= 86 && h >= HGT.tall) return "tall";
    if (w >= 86 && h >= HGT.compact) return "compact";
    if (w >= 86 && h >= HGT.slim) return "slim";
    if (w >= 86 && h >= HGT.mini) return "mini";
    if (w >= 40 && h >= HGT.pill) return "pill";
    return "";
  }
  /* the shelf (or any wide band) cut into k columns between the obstacles; each column clear of them */
  function columns(z, k, obs, minW) {
    var out = [], free = [[z.l, z.r]], i, j, n, w, x, o, nf;
    for (i = 0; i < obs.length; i++) {
      o = obs[i]; if (!hit(z, o) || Math.min(z.b, o.b) - Math.max(z.t, o.t) < z.h * 0.4) continue; /* a low obstacle only shortens the column (trim below) */
      nf = []; for (j = 0; j < free.length; j++) { if (o.r <= free[j][0] || o.l >= free[j][1]) { nf.push(free[j]); continue; } if (o.l - GP > free[j][0]) nf.push([free[j][0], o.l - GP]); if (o.r + GP < free[j][1]) nf.push([o.r + GP, free[j][1]]); }
      free = nf;
    }
    for (j = 0; j < free.length && out.length < k; j++) {
      w = free[j][1] - free[j][0]; n = Math.max(0, Math.min(k - out.length, Math.floor((w + GP) / (minW + GP))));
      if (!n) continue;
      var cw = (w - GP * (n - 1)) / n;
      for (i = 0; i < n; i++) { x = free[j][0] + i * (cw + GP); var c = trim(R(x, z.t, x + cw, z.b), obs); if (c && c.w >= minW - 1) out.push(c); }
    }
    return out;
  }
  /* the plan: need {head: true|false, n: result cards (0–3), item: one bigger card} → {head: slot|null, cards: [slot…]} — slot {l, t, w, h, cls} */
  function planOf(g, ob, need) {
    var z = zonesOf(g, ob), out = { head: null, cards: [], zones: z }, wide = g.W >= 560, used = [];
    var place1 = function (zone, w, hh, cls, bottom) {
      if (!zone) return null;
      var ww = Math.min(zone.w, w), hgt = Math.min(zone.h, hh);
      var s = { l: zone.l, t: bottom ? zone.b - hgt : zone.t, w: ww, h: hgt, cls: cls };
      used.push(R(s.l, s.t, s.l + s.w, s.t + s.h));
      return s;
    };
    /* the shelf under the chin cut into k columns, in reading order (RTL: from the right) — above the chips (🌐 / noise) when that holds
       more cards than the narrow parts beside them */
    var shelfCols = function (k, minW) {
      var sh = z.bot ? trim(z.bot, used.map(function (u) { return padR(u, GP / 2); })) : null; if (!sh || k < 1) return [];
      var obs = z.obs.concat(used.map(function (u) { return padR(u, GP / 2); })), top = sh.b, i;
      for (i = 0; i < obs.length; i++) if (hit(sh, obs[i])) top = Math.min(top, obs[i].t - GP);
      var a = top - sh.t >= HGT.mini ? R(sh.l, sh.t, sh.r, top) : null, ca = a ? columns(a, k, [], minW) : [], cb = columns(sh, k, obs, minW), cols = cb.length > ca.length ? cb : ca;
      cols.sort(function (x, y) { return ob.rtl ? y.l - x.l : x.l - y.l; });
      return cols;
    };
    var shrink = function (zone, s, bottom) { if (!zone || !s) return zone; var r = bottom ? R(zone.l, zone.t, zone.r, s.t - GP) : R(zone.l, s.t + s.h + GP, zone.r, zone.b); return r.w > 0 && r.h > 0 ? r : null; };
    /* 1) the searching / header card */
    if (need.head) {
      var hh = need.tall ? 74 : 62;
      if (z.ul && z.ul.w >= 150 && z.ul.h >= 62) { out.head = place1(z.ul, 270, hh, ""); z.ul = shrink(z.ul, out.head); }
      else if (z.tl && z.tl.w >= 104 && z.tl.h >= 34) { out.head = place1(z.tl, 250, Math.min(z.tl.h, hh), ""); z.tl = null; }
      else if (z.ur && z.ur.w >= 104 && z.ur.h >= 62) { out.head = place1(z.ur, 250, hh, ""); z.ur = shrink(z.ur, out.head); }
      else if (z.ul && z.ul.w >= 104 && z.ul.h >= 62) { out.head = place1(z.ul, 250, hh, ""); z.ul = shrink(z.ul, out.head); }
      else if (z.bot && z.bot.w >= 120 && z.bot.h >= 34) {
        /* no wall above or beside the head (Bassem on a tall phone): the header takes the shelf's first column, two results the others */
        var hc = shelfCols(wide ? 2 : 3, 96)[0];
        if (hc) { var hh2 = Math.min(hc.h, Math.max(hh, HGT.full + 6)); out.head = { l: hc.l, t: hc.b - hh2, w: Math.min(hc.w, 260), h: hh2, cls: "" }; used.push(R(out.head.l, out.head.t, out.head.l + out.head.w, out.head.t + out.head.h)); }
      } else {
        var sl = [z.ur, z.ul, z.ll, z.lr];
        for (var si = 0; si < sl.length && !out.head; si++) if (sl[si] && sl[si].w >= 40 && sl[si].h >= 46) out.head = place1(sl[si], 86, 64, "hpill");
      }
    }
    if (out.head && !out.head.cls) out.head.cls = out.head.h >= 72 ? "hfull" : out.head.h >= 50 ? "hmid" : "hstrip"; /* the header's lines by its height */
    /* 2) the results */
    var n = need.item ? 1 : Math.max(0, Math.min(3, need.n || 0)), item = !!need.item;
    var want = function (zone, bottom) {
      if (!zone || out.cards.length >= n) return zone;
      var cls = clsFor(zone.w, zone.h, item); if (!cls || cls === "pill") return zone; /* a result needs room to be read: never a 2-word pill */
      var s = place1(zone, item ? 300 : cls === "full" ? 260 : 190, HGT[cls], cls, bottom);
      out.cards.push(s); return shrink(zone, s, bottom);
    };
    var noOverlap = function (zone) { if (!zone) return null; return trim(zone, used.map(function (u) { return padR(u, GP / 2); })); };
    if (n && wide) {
      /* the owner's circles, larger cards: upper-right under the AI label, lower-left beside the neck / shoulder, lower-right, then the
         upper-left under the header */
      var zr = noOverlap(z.ur), zl = noOverlap(z.bl && z.ll ? (z.bl.w * z.bl.h > z.ll.w * z.ll.h ? z.bl : z.ll) : z.bl || z.ll), zr2 = noOverlap(z.br && z.lr ? (z.br.w * z.br.h > z.lr.w * z.lr.h ? z.br : z.lr) : z.br || z.lr);
      zr = want(zr); zl = want(zl, true); zr2 = want(zr2, true);
      var zu = noOverlap(z.ul); zu = want(zu);
      zr = want(zr); zl = want(zl, true); zr2 = want(zr2, true);
    } else if (n) {
      /* phones: the upper-right wall when it can hold a card, then the shelf under the chin, then the narrow walls */
      var ur = noOverlap(z.ur); if (ur && ur.w >= 96 && !item) ur = want(ur);
      var left = n - out.cards.length;
      if (left > 0) {
        var cols = shelfCols(left, item ? 150 : 96);
        if (!cols.length && !item) cols = shelfCols(left, 86);
        for (var ci = 0; ci < cols.length && out.cards.length < n; ci++) {
          var c = cols[ci], cl = clsFor(c.w, c.h, item); if (!cl || cl === "pill") continue;
          var hgt2 = Math.min(c.h, item ? HGT[cl] : Math.max(HGT[cl], out.head && out.head.t >= z.bot.t - 1 ? out.head.h : 0, Math.min(c.h, HGT.full + 6))); /* one height for the shelf's row */
          out.cards.push({ l: c.l, t: c.b - hgt2, w: c.w, h: hgt2, cls: clsFor(c.w, hgt2, item) || cl }); used.push(R(c.l, c.b - hgt2, c.r, c.b));
        }
      }
      var rest = [noOverlap(z.ur), noOverlap(z.ll), noOverlap(z.lr), noOverlap(z.ul)];
      for (var ri = 0; ri < rest.length && out.cards.length < n; ri++) { var zz = rest[ri]; while (zz && out.cards.length < n) { var before = out.cards.length; zz = want(zz, ri === 1 || ri === 2); if (out.cards.length === before) break; } }
    }
    return out;
  }
  /* @holo-pure-end */

  /* ---------- the page side ---------- */
  var JOIN_MS = 1500, HOLD_MS = 30000, MAX_MS = 75000, NONE_MS = 6000, WAIT_MS = 6000, LOST_MS = 20000, TICK_MS = 700, SETTLE_MS = 1500;
  function now() { return new Date().getTime(); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function JL() { return W.JANNA_LIVE || null; }
  function persona() { var J = JL(); try { return J && J.persona ? J.persona() : "janna"; } catch (e) { return "janna"; } }
  function V(m, f) { return persona() === "bassem" ? m : f; } /* Janna speaks as a woman, Bassem as a man */
  function enabled() {
    if (W.JANNA_LIVE_HOLO === 0 || W.JANNA_LIVE_HOLO === false || W.JANNA_LIVE_HOLO === "0") return false;
    var F = W.MIGFLAGS; try { if (F && F.on && F.on("call_holo") === false) return false; } catch (e) {}
    return true;
  }
  /* the SDK call's stage in this tab (the widget fallback has none: no cards there) */
  function box() { var o = D.querySelector('.jnl[data-mode="sdk"]'); if (!o || o.hidden) return null; return o.querySelector(".jnl-sdk"); }
  function fromCall(e, bx) { var t = e && e.target; if (!bx) return false; if (!t || t === D || t === W) return true; return t === bx || !!(bx.contains && bx.contains(t)); }
  function debugOn() { try { return W.JANNA_LIVE_HOLO_DEBUG === 1 || /[?&#]holodebug=1\b/.test(String(W.location && (W.location.search + W.location.hash))); } catch (e) { return false; } }

  var G = null, SEEN = {}, SEEN_N = 0, LAYER = null, TICK = 0, LAST_OWN = {}, CSS_ON = false, FOLD_T = 0;
  /* does the cards' layer show this tool now (data/holo.js / bassem-intel-view.js ask before their own scene of it)? Without
     arguments: was this tool's last start one of the cards' (data/bassem-live-tools.js gives its facts with no arguments) */
  function owns(tool, a) {
    tool = String(tool || ""); if (!enabled() || !box()) return false;
    if (a === undefined) return !!(LAST_OWN[tool] && now() - LAST_OWN[tool] < 20000);
    return !!specOf(tool, a);
  }
  function newGroup(t) {
    clearGroup(false);
    G = { id: t, t0: t, tLast: t, rows: [], calls: [], firstData: 0, shownAt: 0, fadeAt: 0, mode: "search", item: null, hidden: false, sig: "" };
    try {
      var H = W.MIGHOLO, de = D.documentElement;
      if (H && H.scene && /^(welcome|navigate)$/.test(String(H.scene() || "")) && H.close) { /* the hologram's welcome / page scene makes room for the search */
        H.close(); css(); de.className = (de.className + " jvh-fold").replace(/^\s+/, ""); clearTimeout(FOLD_T); FOLD_T = setTimeout(function () { de.className = de.className.replace(/\s*\bjvh-fold\b/g, ""); }, 1600);
      }
    } catch (e) {}
  }
  function rowFor(sp) {
    for (var i = 0; i < G.rows.length; i++) {
      var r = G.rows[i]; if (r.key !== sp.key) continue;
      if (sp.data) r.data = true; if (!r.gov && sp.gov) r.gov = sp.gov; if (!r.mk && sp.mk) r.mk = sp.mk; if (sp.search) r.search = true; if (sp.tool === "platform_item" || sp.tool === "bassem_intel") r.sec = sp.sec;
      if (!r.q && sp.q) r.q = sp.q;
      return r;
    }
    var row = { key: sp.key, kind: sp.kind, sec: sp.sec, q: sp.q, gov: sp.gov || "", mk: sp.mk || "", mkr: "", brief: !!sp.brief, ik: sp.ik || null, search: !!sp.search, data: !!sp.data, wait: sp.tool === "janna_search" ? 4000 : 12500,
      pend: 0, done: false, failed: false, lost: false, screen: false, count: null, items: [], more: false, wide: false, item: null, none: false, t: now() };
    G.rows.push(row); return row;
  }
  function onStart(e) {
    var bx = box(); if (!bx || !enabled() || !fromCall(e, bx)) return;
    var d = (e && e.detail) || {}, name = String(d.toolName || d.name || ""), id = String(d.toolCallId || ""), sp = specOf(name, d.arguments || d.args);
    if (!sp) return;
    var t = now();
    if (id) { if (SEEN[id]) return; if (++SEEN_N > 200) { SEEN = {}; SEEN_N = 1; } SEEN[id] = t; }
    LAST_OWN[name] = t;
    if (!G || t - G.tLast > JOIN_MS || G.mode === "none" || G.mode === "fail" || G.hidden) newGroup(t);
    G.tLast = t;
    var row = rowFor(sp), call = { id: id, name: name, row: row, data: sp.data, done: false, t: t };
    G.calls.push(call); if (sp.data) row.pend++;
    row.done = false; if (G.mode !== "search") G.mode = "search";
    render(true);
  }
  /* the start this completion belongs to: by id; an engine without ids → the oldest start of that tool still waiting (this group only) */
  function callOf(name, id) {
    if (!G) return null; var i, c;
    if (id) { for (i = 0; i < G.calls.length; i++) { c = G.calls[i]; if (c.id === id) return c.done ? null : c; } return null; }
    for (i = 0; i < G.calls.length; i++) { c = G.calls[i]; if (!c.done && c.name === name && !c.id) return c; }
    for (i = 0; i < G.calls.length; i++) { c = G.calls[i]; if (!c.done && c.name === name) return c; }
    return null;
  }
  function settle(c) { c.done = true; if (c.data) c.row.pend = Math.max(0, c.row.pend - 1); var r = c.row; if (!r.pend) r.done = true; }
  function onDone(e) {
    var bx = box(); if (!bx || !G || !fromCall(e, bx)) return;
    var d = (e && e.detail) || {}, name = String(d.toolName || d.name || ""), c = callOf(name, String(d.toolCallId || "")); if (!c) return;
    var r = c.row, x = resOf(d.result), list, i;
    if (x && !x.error && !(x.ok === false && !isArr(x.results)) && (c.data || r.lost)) { r.failed = false; r.lost = false; } /* an answer after «مفيش رد» (20 s) still counts */
    if (name === "janna_lookup") {
      if (!x || x.error) r.failed = true;
      else { r.count = +x.count || 0; list = isArr(x.results) ? x.results : []; r.items = []; for (i = 0; i < list.length && r.items.length < 6; i++) { var cd = cardOf(r.sec, list[i]); if (cd.title) r.items.push(cd); } r.more = !!x.has_more || r.count > r.items.length; if (x.market && r.sec === "tenders" && !r.mk) r.mk = mkCode(x.market); }
    } else if (name === "bassem_intel") {
      if (!x || (x.ok === false && !isArr(x.results))) r.failed = true;
      else if (r.kind === "item") { list = isArr(x.results) ? x.results : []; if (x.found === false || !list.length) r.none = true; else r.item = itemCard("intel", list[0]); }
      else { r.count = x.count != null && isFinite(+x.count) ? +x.count : (x.results || []).length; list = isArr(x.results) ? x.results : []; r.items = []; for (i = 0; i < list.length && r.items.length < 6; i++) { var ic = cardOf("intel", list[i]); if (ic.title) r.items.push(ic); } r.wide = !!x.widened; if (x.market && x.market !== "all" && !r.mk) r.mkr = mkCode(x.market) || (x.market === "plan" ? "plan" : ""); }
    } else if (name === "platform_item") {
      if (!x || x.error) r.failed = true;
      else if (x.found === true && !r.item) { var sec = ITEM_SEC[String(x.section || r.sec)] || r.sec; r.sec = sec; r.item = itemCard(sec, x); if (!r.item.title) r.item = null; if (!r.item) r.none = true; }
      else if (x.found === false && !r.item) r.none = true;
    } else if (name === "janna_search") {
      if (!r.data && !r.items.length) r.screen = true; /* fire-and-forget: the results are on the shared screen (no data of its own) */
    } else if (name === "bassem_open_item") {
      if (!r.item) { if (/^(مفتوح دلوقتي على الشاشة|Now open on the shared screen|فتحت «|Opened “)/.test(String(d.result || ""))) r.screen = true; else if (!r.data) r.none = true; }
    } else if (name === "bassem_open_opportunity") {
      if (!r.item) { var oc = oppCard(d.result); if (oc) r.item = oc; else if (/^(مفيش فرصة|No open opportunity)/.test(String(d.result || ""))) r.none = true; else r.screen = true; }
    }
    settle(c); if (c.data && !G.firstData) G.firstData = now();
    render(true);
  }
  function onFail(e) {
    var bx = box(); if (!bx || !G || !fromCall(e, bx)) return;
    var d = (e && e.detail) || {}, c = callOf(String(d.toolName || d.name || ""), String(d.toolCallId || "")); if (!c) return;
    if (c.data || !c.row.data) c.row.failed = true;
    settle(c); render(true);
  }
  /* Bassem's screen: what janna_search / bassem_open_item really show there (data/bassem-live-tools.js emitRes) — only for a row the
     platform's own tools gave nothing to */
  function onScreen(e) {
    if (!G || !box()) return;
    var d = (e && e.detail) || {}, tool = String(d.tool || ""), items = isArr(d.items) ? d.items : [], q = norm(d.query), i, r, cd;
    if (!items.length) return;
    for (i = 0; i < G.rows.length; i++) {
      r = G.rows[i];
      if (tool === "bassem_open_item" && r.kind === "item" && !r.item) { r.item = { sec: r.sec, ic: S(r.sec).ic, tag: T(S(r.sec).one[0], S(r.sec).one[1]), title: clean(items[0].title, 160), sub: clean(items[0].entity, 70), fact: deadline(items[0].deadline), href: pathOf(items[0].url), ok: false, more: [] }; r.none = false; break; }
      if (tool === "janna_search" && r.kind === "list" && !r.data && !r.items.length && (!q || norm(r.q) === q || q.indexOf(norm(r.q)) > -1)) {
        r.count = d.count != null && isFinite(+d.count) ? +d.count : items.length;
        for (var j = 0; j < items.length && r.items.length < 6; j++) { cd = { sec: r.sec, ic: S(r.sec).ic, tag: T(S(r.sec).one[0], S(r.sec).one[1]), title: clean(items[j].title, 160), sub: clean(items[j].entity, 70), fact: deadline(items[j].deadline), href: pathOf(items[j].url), ok: false }; if (cd.title) r.items.push(cd); }
        r.screen = false; r.done = true; break;
      }
    }
    render(true);
  }

  /* ---------- the group's state → what to show ---------- */
  function rowsLeft() { var n = 0; for (var i = 0; i < G.rows.length; i++) { var r = G.rows[i]; if (r.data && r.pend > 0) n++; } return n; }
  function itemRow() { for (var i = 0; i < G.rows.length; i++) if (G.rows[i].kind === "item") return G.rows[i]; return null; }
  /* up to 3 result cards, one from each section in turn (the order the persona asked them in) */
  function picks() {
    var lists = [], out = [], i, k = 0, more = true;
    for (i = 0; i < G.rows.length; i++) if (G.rows[i].kind === "list" && G.rows[i].items.length) lists.push(G.rows[i].items);
    while (out.length < 3 && more) { more = false; for (i = 0; i < lists.length && out.length < 3; i++) if (lists[i][k]) { out.push(lists[i][k]); more = true; } k++; }
    return out;
  }
  function phase(t) {
    var left = rowsLeft(), it = itemRow(), anyList = false, anyRes = false, allFail = true, settled = true, i, r;
    for (i = 0; i < G.rows.length; i++) {
      r = G.rows[i];
      if (r.data && r.pend > 0 && t - r.t > LOST_MS) { r.pend = 0; r.lost = true; r.failed = true; r.done = true; } /* no answer in 20 s: said as it is */
      if (!r.data && !(r.screen || r.items.length || r.item || r.none || r.failed) && t - r.t > r.wait) r.screen = true; /* a screen tool that never reported back: its results are on the screen */
      if (r.kind === "list") anyList = true;
      if (r.items.length || r.item) anyRes = true;
      if (!r.failed) allFail = false;
      if (r.data ? r.pend > 0 : !(r.screen || r.items.length || r.item || r.none || r.failed)) settled = false;
    }
    if (it && it.item && (!anyList || !left)) return "item";
    if (anyRes && (!left || (G.firstData && t - G.firstData > SETTLE_MS))) return it && it.item ? "item" : "results";
    if (!settled) return "search";
    if (allFail) return "fail";
    if (!anyRes) { for (i = 0; i < G.rows.length; i++) if (G.rows[i].screen) return "screen"; return "none"; }
    return "results";
  }
  function qWords() { var q = [], i, n; for (i = 0; i < G.rows.length; i++) { n = G.rows[i].q; if (n && q.indexOf(n) < 0) q.push(n); } return q.join(" · "); }
  function labels() { var l = [], i, s; for (i = 0; i < G.rows.length; i++) { if (G.rows[i].kind !== "list" && !G.rows[i].search) continue; s = rowLabel(G.rows[i]); if (l.indexOf(s) < 0) l.push(s); } return l.join(" · "); }
  function chipLen() { var n = 0, i; for (i = 0; i < G.rows.length; i++) if (G.rows[i].kind === "list") n += rowLabel(G.rows[i]).length + 6; return n; }
  function total() { var n = 0, i; for (i = 0; i < G.rows.length; i++) if (G.rows[i].count != null) n += G.rows[i].count; return n; }

  /* ---------- the layer ---------- */
  var CSS = ".jnl-sdk .jv-holo{position:absolute;inset:0;z-index:2;pointer-events:none;font-family:Cairo,Tajawal,Tahoma,sans-serif;color:#e8fbff;-webkit-font-smoothing:antialiased}"
    + "html.jnl-lgm-on .jnl-sdk .jv-holo,.jnl-sdk:not([data-state=\"live\"]) .jv-holo{display:none}html.jvh-fold .mgh{opacity:0!important;transition:opacity .2s!important}"
    /* the glass: cyan edge, dark translucent body, light text (no backdrop-filter over the live WebRTC video: phones) */
    + ".jv-holo .jvh-c{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;gap:0;pointer-events:auto;overflow:hidden;border-radius:12px;border:1px solid rgba(120,220,255,.62);padding:4px 9px;"
    + "background:linear-gradient(160deg,rgba(12,48,66,.86),rgba(4,18,26,.82) 58%,rgba(8,34,48,.86));box-shadow:0 0 0 1px rgba(2,10,16,.35),0 0 18px -5px rgba(90,210,255,.75),inset 0 0 16px -7px rgba(120,220,255,.5);"
    + "line-height:1.25;font-size:11px;font-weight:600;text-decoration:none;color:inherit;text-align:start;text-shadow:0 1px 2px rgba(0,0,0,.7);opacity:0;transform:translateY(6px) scale(.97);transition:opacity .35s ease,transform .35s ease,left .3s ease,top .3s ease,width .3s ease,height .3s ease;-webkit-tap-highlight-color:transparent}"
    + ".jv-holo .jvh-c.on{opacity:1;transform:none}.jv-holo .jvh-c.out{opacity:0;transform:translateY(-5px) scale(.97);pointer-events:none}"
    + ".jv-holo .full,.jv-holo .ifull,.jv-holo .hfull{padding:6px 10px 7px}"
    + ".jv-holo .jvh-c::before,.jv-holo .jvh-c::after{content:\"\";position:absolute;width:8px;height:8px;border:2px solid rgba(170,238,255,.9);pointer-events:none}"
    + ".jv-holo .jvh-c::before{top:2px;left:2px;border-right:0;border-bottom:0;border-top-left-radius:5px}.jv-holo .jvh-c::after{bottom:2px;right:2px;border-left:0;border-top:0;border-bottom-right-radius:5px}"
    + ".jv-holo .jvh-c>*{position:relative;min-width:0;flex:none}"
    + ".jv-holo .jvh-h{display:flex;align-items:center;gap:5px;color:#9fe6ff;font-weight:800;font-size:11.5px;white-space:nowrap;overflow:hidden;padding-inline-end:24px}.jv-holo .jvh-h>span{min-width:0;overflow:hidden;text-overflow:ellipsis}"
    + ".jv-holo .jvh-h b{min-width:0;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:800}"
    + ".jv-holo .jvh-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#5ad2ff;box-shadow:0 0 8px #5ad2ff;animation:jvhPulse 1.2s ease-in-out infinite}.jv-holo .jvh-dot.ok{animation:none;background:#7fe3c0;box-shadow:0 0 8px #7fe3c0}"
    + ".jv-holo .jvh-q{font-weight:800;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".jv-holo .jvh-l{color:#cdefff;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jv-holo .jvh-w{color:#f1d58b;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".jv-holo .jvh-n{flex:none;padding:0 6px;border-radius:99px;background:rgba(90,210,255,.22);border:1px solid rgba(120,220,255,.55);color:#fff;font-weight:800;font-size:11px;line-height:1.35}"
    + ".jv-holo .jvh-cs{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;color:#e4f8ff;font-weight:700}"
    + ".jv-holo .hmid{padding:4px 9px}.jv-holo .hmid .jvh-cs{-webkit-line-clamp:1;display:block;white-space:nowrap;text-overflow:ellipsis}.jv-holo .hmid .jvh-q{font-size:12.5px}"
    + ".jv-holo .hstrip{padding:3px 8px;justify-content:center}.jv-holo .hstrip>.jvh-l,.jv-holo .hstrip>.jvh-cs,.jv-holo .hstrip>.jvh-w{padding-inline-end:24px}.jv-holo .hstrip .jvh-cs{-webkit-line-clamp:1;display:block;white-space:nowrap;text-overflow:ellipsis}"
    /* «بدوّر…»: a light sweeping over the glass and a scanning line at its foot */
    + ".jv-holo .jvh-sw{position:absolute!important;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit}.jv-holo .jvh-sw::before{content:\"\";position:absolute;top:0;bottom:0;left:-45%;width:45%;background:linear-gradient(90deg,rgba(120,220,255,0),rgba(150,230,255,.22),rgba(120,220,255,0));animation:jvhSweep 1.9s ease-in-out infinite}"
    + ".jv-holo .jvh-sw::after{content:\"\";position:absolute;left:8px;right:8px;bottom:2px;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(90,210,255,0),#7fe3ff,rgba(90,210,255,0));background-size:50% 100%;background-repeat:no-repeat;animation:jvhBar 1.4s linear infinite}"
    + ".jv-holo .jvh-x{position:absolute!important;top:3px;inset-inline-end:3px;z-index:1;width:22px;height:22px;box-sizing:border-box;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(4,18,26,.7);color:#fff;font:inherit;font-size:11px;line-height:20px;padding:0;cursor:pointer;text-shadow:none}"
    + ".jv-holo .hstrip .jvh-x{top:50%;margin-top:-11px}"
    + ".jv-holo .jvh-x:focus-visible,.jv-holo a.jvh-c:focus-visible{outline:2px solid #e9c46a;outline-offset:1px}"
    + ".jv-holo a.jvh-c{cursor:pointer}.jv-holo a.jvh-c:hover{border-color:#c9f4ff;box-shadow:0 0 0 1px rgba(2,10,16,.35),0 0 22px -4px rgba(120,225,255,.95),inset 0 0 16px -6px rgba(150,230,255,.6)}"
    + ".jv-holo .jvh-tag{display:flex;align-items:center;gap:4px;color:#8fdcff;font-weight:800;font-size:11px;white-space:nowrap;overflow:hidden}.jv-holo .jvh-tag span{overflow:hidden;text-overflow:ellipsis}.jv-holo .jvh-tag em{flex:none;font-style:normal;color:#7fe3c0}"
    + ".jv-holo .jvh-t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-weight:800;font-size:12px;color:#fff;overflow-wrap:anywhere}.jv-holo .jvh-t .jvh-i{font-style:normal}"
    + ".jv-holo .jvh-e,.jv-holo .jvh-f{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jv-holo .jvh-e{color:#bfeaf7}.jv-holo .jvh-f{color:#f1d58b;font-weight:700}"
    + ".jv-holo .mini .jvh-t{-webkit-line-clamp:1}.jv-holo .pill{padding:5px 6px;align-items:center;justify-content:center;text-align:center}.jv-holo .pill .jvh-t{font-size:11px}.jv-holo .ifull .jvh-t{font-size:12.5px}"
    /* a data line keeps its own direction (dir=auto) but sits on the card's side */
    + ".jv-holo[dir=\"ltr\"] [dir=\"auto\"]{text-align:left}.jv-holo[dir=\"rtl\"] [dir=\"auto\"]{text-align:right}"
    + ".jv-holo .jvh-dbg{position:absolute;box-sizing:border-box;pointer-events:none;border:1px dashed rgba(255,200,60,.9);color:#ffd27a;font:700 9px/1 monospace;padding:1px}.jv-holo .jvh-dbg.hd{border:2px solid #ff3b5c}"
    + "@keyframes jvhPulse{50%{opacity:.35;transform:scale(.8)}}@keyframes jvhSweep{0%{left:-45%}100%{left:100%}}@keyframes jvhBar{0%{background-position:-60% 0}100%{background-position:160% 0}}"
    + "@media (prefers-reduced-motion:reduce){.jv-holo .jvh-c{transition:none}.jv-holo .jvh-dot,.jv-holo .jvh-sw::before,.jv-holo .jvh-sw::after{animation:none}.jv-holo .jvh-sw::before{display:none}}";
  function css() { if (CSS_ON && D.getElementById("jvh-css")) return; CSS_ON = true; if (D.getElementById("jvh-css")) return; var s = D.createElement("style"); s.id = "jvh-css"; s.textContent = CSS; (D.head || D.documentElement).appendChild(s); }
  function layer(bx) {
    if (LAYER && LAYER.parentNode === bx) return LAYER;
    css();
    var l = D.createElement("div"); l.className = "jv-holo"; l.setAttribute("translate", "no"); l.dir = EN ? "ltr" : "rtl";
    var sr = D.createElement("span"); sr.className = "jvh-sr"; sr.setAttribute("role", "status"); sr.setAttribute("aria-live", "polite");
    sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"; l.appendChild(sr); l.__sr = sr;
    l.addEventListener("click", onClick, false);
    l.addEventListener("pointerover", function () { if (G) G.hover = now(); }, { passive: true });
    l.addEventListener("focusin", function () { if (G) G.hover = now(); });
    bx.appendChild(l); LAYER = l;
    return l;
  }
  function closest(el, sel, stop) { for (var n = el; n && n !== stop && n.nodeType !== 9; n = n.parentNode) { var m = n.matches || n.webkitMatchesSelector || n.msMatchesSelector; if (m && m.call(n, sel)) return n; } return null; }
  /* a tap: ✕ hides the cards; a result opens its page on the shared screen (the call stays), never by the browser's own navigation */
  function onClick(e) {
    var t = e && e.target, x = t && closest(t, ".jvh-x", LAYER);
    if (x) { if (e.preventDefault) e.preventDefault(); hideAll(true); return; }
    var a = t && closest(t, "a.jvh-c", LAYER); if (!a) return;
    if (e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; /* a new tab: data/janna-live.js topClick, as for any link */
    var p = String(a.getAttribute("data-p") || a.getAttribute("href") || "");
    if (e.preventDefault) e.preventDefault();
    var J = JL(), ok = false; try { ok = !!(J && J.showCard && J.showCard(p)); } catch (x2) { ok = false; }
    if (!ok && J && J.show) { try { J.show(p); } catch (x3) {} }
    if (G) G.hover = now();
  }

  /* the obstacles on the stage, in stage px: the AI label, the bottom limit (the control bar), the status line, the continuation pill,
     the chips above the bar (on <body>), Bassem's «شوف الشاشة», his intel card, the hologram's panels and laptop */
  function vis(el) {
    if (!el || el.hidden) return null; var r = null; try { r = el.getBoundingClientRect(); } catch (e) { return null; }
    if (!r || r.width < 2 || r.height < 2) return null;
    try { var cs = W.getComputedStyle ? W.getComputedStyle(el) : null; if (cs && (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0)) return null; } catch (e) {}
    return r;
  }
  function obstacles(bx) {
    var br = bx.getBoundingClientRect(), out = { ai: null, bottom: br.height, rects: [], rtl: !EN };
    var rel = function (r) { return R(r.left - br.left, r.top - br.top, r.right - br.left, r.bottom - br.top); };
    var a = vis(bx.querySelector(".jv-ai")); if (a) out.ai = rel(a);
    var c = bx.querySelector(".jv-ctl"), cr = c && !c.hidden ? vis(c) : null; if (cr) out.bottom = cr.top - br.top;
    var add = function (el, p) { var r = vis(el); if (!r) return; var q = rel(r); if (hit(q, R(0, 0, br.width, br.height))) out.rects.push(padR(q, p || 4)); };
    add(bx.querySelector(".jv-st"), 6);
    var co = bx.querySelector(".jv-cont.on span"); if (co) add(co, 6);
    var hs = ""; try { hs = W.MIGHOLO && W.MIGHOLO.scene ? String(W.MIGHOLO.scene() || "") : ""; } catch (e) { hs = ""; }
    var sels = [".jnl-nzf:not([hidden]) .jv-nz", ".blt-see.on", ".bv-card:not([hidden])"].concat(hs ? [".mgh .mgh-base", ".mgh .mgh-lid", ".mgh .mgh-p"] : []);
    for (var i = 0; i < sels.length; i++) { var l = []; try { l = D.querySelectorAll(sels[i]); } catch (e) { l = []; } for (var j = 0; j < l.length && j < 12; j++) add(l[j], 5); }
    return out;
  }
  function geomNow(bx) {
    var v = bx.querySelector("video"), W0 = bx.clientWidth || 0, H0 = bx.clientHeight || 0, pos = "50% 30%";
    try { pos = (W.getComputedStyle(v).objectPosition) || pos; } catch (e) {}
    return stageGeom(W0, H0, v && v.videoWidth, v && v.videoHeight, posOf(pos), faceOf(persona(), W.JANNA_LIVE_FACE));
  }

  /* ---------- rendering ---------- */
  function cardHtml(c, cls) {
    var sec = S(c.sec), ic = esc(c.ic || sec.ic), pill = cls === "pill", lite = cls === "slim" || cls === "mini", item = cls === "ifull" || cls === "icompact", big = cls === "full" || cls === "tall" || item, h = "";
    var fact = cls === "full" || item ? c.fact : short(c.fact);
    if (!item && c.more && c.more.length) fact = [cls === "full" ? c.fact : short(c.fact)].concat(c.more).filter(Boolean).join(" · "); /* one item in a short card */
    var ok = c.ok ? ' <em title="' + esc(T("موثّق من فريق المنصة", "Verified by the platform team")) + '">✓ ' + esc(T("موثّق", "Verified")) + "</em>" : "";
    if (pill) return '<span class="jvh-tag">' + ic + '</span><b class="jvh-t" dir="auto">' + esc(c.title) + "</b>";
    var one = !item && c.more && c.more.length && !big && c.sub; /* one item in a short card: its buyer / company beside the tag */
    if (!lite) h += '<span class="jvh-tag">' + ic + " <span>" + esc(c.tag) + (one ? " · " + esc(c.sub) : "") + "</span>" + ok + "</span>";
    h += '<b class="jvh-t" dir="auto">' + (lite ? '<i class="jvh-i">' + ic + "</i> " : "") + esc(c.title) + "</b>";
    if (big && c.sub) h += '<span class="jvh-e" dir="auto">' + esc(c.sub) + "</span>";
    if (fact) h += '<span class="jvh-f" dir="auto">' + esc(fact) + "</span>";
    else if (!big && c.sub && !one) h += '<span class="jvh-e" dir="auto">' + esc(c.sub) + "</span>";
    if (item && c.more) for (var i = 0; i < c.more.length && i < (cls === "ifull" ? 2 : 1); i++) h += '<span class="jvh-f" dir="auto">' + esc(c.more[i]) + "</span>";
    return h;
  }
  /* the header: «بدوّر على» + the words + the sections while searching; «لقيت» + each section's count; «مالقيتش…» / «ماكملش» */
  function headHtml(mode, cls, w) {
    var X = '<button type="button" class="jvh-x" aria-label="' + esc(T("إخفاء الكروت", "Hide the cards")) + '" title="' + esc(T("إخفاء", "Hide")) + '">✕</button>';
    var q = qWords(), lb = labels(), t = now(), strip = cls === "hstrip", pill = cls === "hpill", h = "", i, r, lens = w && w < 140 ? "" : "🔎 "; /* a narrow header: the pulsing dot says it */
    if (mode === "search") {
      var it = itemRow(), opening = !!(it && !it.search && G.rows.length === 1), head = opening ? T("بفتحلك", "Opening") : T("بدوّر على", "Searching"), waiting = t - G.t0 > WAIT_MS;
      var wait = '<span class="jvh-w">' + esc(T("لسه " + V("مستني", "مستنية") + " الرد…", "Still waiting for the answer…")) + "</span>";
      if (pill) return '<div class="jvh-sw"></div><span class="jvh-h" style="padding:0;justify-content:center"><i class="jvh-dot"></i>🔎</span><span class="jvh-l" dir="auto">' + esc(q || lb) + "</span>";
      h = '<div class="jvh-sw"></div>' + X + '<span class="jvh-h"><i class="jvh-dot"></i><span>' + lens + esc(head) + (strip && q ? ":" : "") + "</span>" + (strip && q ? '<b dir="auto">' + esc(q) + "</b>" : "") + "</span>";
      if (!strip && q) h += '<span class="jvh-q" dir="auto">' + esc(q) + "</span>";
      if ((strip || cls === "hmid") && waiting) return h + wait;
      if (lb && !(opening && q)) h += '<span class="jvh-l" dir="auto">' + esc(lb) + "</span>";
      if (waiting) h += wait;
      return h;
    }
    if (mode === "none" || mode === "fail" || mode === "screen") {
      var ic = mode === "screen" ? "🖥️" : mode === "fail" ? "⚠️" : "🔍";
      var m1 = mode === "none" ? T("مالقيتش نتايج مطابقة", "No matching results") : mode === "fail" ? T("البحث ده ماكملش", "This search did not finish") : stacked() ? T("النتايج على الشاشة تحت", "The results are on the screen below") : T("النتايج على الشاشة جنبي", "The results are on the screen beside me");
      var m2 = mode === "none" ? (q ? T("لـ «" + q + "»", "for “" + q + "”") : "") : mode === "fail" ? T("مفيش نتايج أعرضها", "No results to show") : q;
      if (pill) return '<span class="jvh-h" style="padding:0;justify-content:center">' + ic + '</span><span class="jvh-l" dir="auto">' + esc(m1) + "</span>";
      h = X + '<span class="jvh-h"><span>' + ic + " " + esc(m1) + "</span></span>";
      if (strip) h += '<span class="jvh-l" dir="auto">' + esc([m2, lb].filter(Boolean).join(" · ")) + "</span>";
      else { if (m2) h += '<span class="jvh-q" dir="auto">' + esc(m2) + "</span>"; if (lb) h += '<span class="jvh-l" dir="auto">' + esc(lb) + "</span>"; }
      return h;
    }
    /* results: «🔎 لقيت · 22 نتيجة», the words, each section's count («مصانع 10 · مناقصات 11 · فرص مفيش») */
    var chips = [], n = total(), wide = false;
    for (i = 0; i < G.rows.length; i++) {
      r = G.rows[i]; if (r.kind !== "list") continue; if (r.wide) wide = true;
      var v = r.failed ? (r.lost ? T("مفيش رد", "no answer") : T("ماكملش", "failed")) : r.count != null ? (r.count ? fmtN(r.count) : T("مفيش", "none")) : r.screen ? T("على الشاشة", "on the screen") : "…";
      chips.push(rowLabel(r) + ": " + v);
    }
    var nb = n ? '<span class="jvh-n">' + esc(nRes(n)) + "</span>" : "", cs = '<span class="jvh-cs" dir="auto">' + esc(chips.join(" · ")) + "</span>";
    if (pill) return '<span class="jvh-h" style="padding:0;justify-content:center">🔎</span><span class="jvh-q">' + esc(n ? nRes(n) : q) + "</span>";
    if (strip) return X + '<span class="jvh-h"><i class="jvh-dot ok"></i><span dir="auto">' + lens + esc(q || T("لقيت", "Found")) + "</span></span>" + cs;
    h = X + '<span class="jvh-h"><i class="jvh-dot ok"></i><span>' + lens + esc(T("لقيت", "Found")) + "</span>" + nb + "</span>";
    if (q) h += '<span class="jvh-q" dir="auto">' + esc(q) + "</span>";
    h += cs;
    if (wide) h += '<span class="jvh-w">' + esc(T("وسّعت البحث لأسواق تانية", "Widened to other markets")) + "</span>";
    return h;
  }
  function stacked() { try { return !!(W.matchMedia && W.matchMedia("(max-width:820px),(max-aspect-ratio:3/2)").matches); } catch (e) { return false; } }
  function srText(mode) {
    var q = qWords(), lb = labels();
    if (mode === "search") return T("بدوّر على ", "Searching for ") + (q || lb);
    if (mode === "none") return q ? T("مالقيتش نتايج مطابقة لـ " + q, "No matching results for " + q) : T("مالقيتش نتايج مطابقة", "No matching results");
    if (mode === "fail") return T("البحث ده ماكملش", "This search did not finish");
    if (mode === "screen") return T("النتايج على الشاشة", "The results are on the screen");
    var p = picks(), it = itemRow(), s = (mode === "item" && it && it.item ? it.item.title : nRes(total()) + (p.length ? T(" — أولها: ", " — first: ") + p[0].title : ""));
    return s;
  }
  /* one element per slot, reused (content rewritten only when it changed; position on every layout) */
  function slotEl(l, k, tag) {
    var el = null, i, ch = l.children || l.childNodes || [];
    for (i = 0; i < ch.length; i++) if (ch[i].getAttribute && ch[i].getAttribute("data-k") === k) { el = ch[i]; break; }
    if (el && el.tagName.toLowerCase() !== tag) { l.removeChild(el); el = null; }
    if (!el) { el = D.createElement(tag); el.setAttribute("data-k", k); l.appendChild(el); setTimeout(function () { el.className = el.className.replace(/\s*\bon\b/g, "") + " on"; }, 20); }
    return el;
  }
  function put(el, s, cls, html, href, title) {
    var k = cls + "|" + html;
    if (el.__k !== k) {
      el.__k = k; el.innerHTML = html;
      el.className = "jvh-c " + cls + (/\bon\b/.test(el.className) ? " on" : "") + (el.__mode ? " " + el.__mode : "");
      if (href) { el.setAttribute("href", href); el.setAttribute("data-p", href); if (title) el.setAttribute("title", title); el.setAttribute("aria-label", title || ""); }
    }
    el.style.left = Math.round(s.l) + "px"; el.style.top = Math.round(s.t) + "px"; el.style.width = Math.round(s.w) + "px"; el.style.height = Math.round(s.h) + "px";
  }
  function hideAll(user) {
    if (!G) return; G.hidden = true; G.fadeAt = 0;
    var l = LAYER; if (!l) return;
    var ch = [].slice.call(l.children || []);
    for (var i = 0; i < ch.length; i++) if (ch[i].getAttribute && ch[i].getAttribute("data-k")) { ch[i].className = String(ch[i].className).replace(/\s*\bon\b/g, "") + " out"; }
    setTimeout(function () { if (G && G.hidden) clearGroup(true); }, user ? 260 : 420);
  }
  function clearGroup(drop) {
    var l = LAYER;
    if (l) { var ch = [].slice.call(l.children || []); for (var i = 0; i < ch.length; i++) if (ch[i] !== l.__sr) l.removeChild(ch[i]); if (l.__sr) l.__sr.textContent = ""; }
    if (drop !== false) G = null;
  }
  function render(changed) {
    var bx = box();
    if (!bx || !enabled()) { if (G) { G = null; } if (LAYER && LAYER.parentNode) LAYER.parentNode.removeChild(LAYER); LAYER = null; stopTick(); return; }
    if (!G || G.hidden) return;
    var l = layer(bx), t = now(), mode = phase(t), it = itemRow();
    var p = mode === "results" ? picks() : [], one = mode === "item" && it && it.item ? it.item : null;
    var head = mode !== "item"; /* one item: its own card says it all */
    /* a taller header while it waits, and when its counts take two lines («Factories 10 · Tenders 11 · Opportunities 1») */
    var need = { head: head, n: one ? 0 : p.length, item: !!one, tall: (mode === "search" && t - G.t0 > WAIT_MS) || (mode === "results" && chipLen() > (EN ? 30 : 34)) };
    var plan = planOf(geomNow(bx), obstacles(bx), need);
    var keep = {};
    if (plan.head) { var hel = slotEl(l, "head", "div"); hel.__mode = mode === "none" ? "jvh-none" : mode === "fail" ? "jvh-fail" : mode === "search" ? "jvh-s" : "jvh-sum"; put(hel, plan.head, plan.head.cls, headHtml(mode, plan.head.cls, plan.head.w)); keep.head = 1; }
    var cards = one ? [one] : p;
    for (var i = 0; i < cards.length && i < plan.cards.length; i++) {
      var s = plan.cards[i], c = cards[i], href = c.href || "", tg = href ? "a" : "div", el = slotEl(l, "r" + i, tg);
      put(el, s, s.cls, cardHtml(c, s.cls), href, c.title + (c.sub ? " — " + c.sub : "") + (href ? T(" (افتحها على الشاشة)", " (open it on the screen)") : ""));
      keep["r" + i] = 1;
    }
    var ch = [].slice.call(l.children || []);
    for (var j = 0; j < ch.length; j++) { var k = ch[j].getAttribute && ch[j].getAttribute("data-k"); if (k && !keep[k] && !/^dbg/.test(k)) l.removeChild(ch[j]); }
    debugDraw(l, plan);
    /* the fade: 30 s after the results (the countdown waits while the persona speaks, 75 s at most), 6 s for «nothing» / «did not finish» */
    if (mode !== G.mode || changed) {
      if (mode !== G.mode) G.shownAt = t;
      G.mode = mode; var sx = srText(mode); if (l.__sr && l.__sr.textContent !== sx) l.__sr.textContent = sx; /* said once per change (aria-live) */
      G.fadeAt = mode === "search" ? 0 : mode === "none" || mode === "fail" ? t + NONE_MS : mode === "screen" ? t + 10000 : Math.max(G.fadeAt || 0, t + HOLD_MS);
    }
    startTick();
  }
  function debugDraw(l, plan) {
    var ch = [].slice.call(l.children || []), i;
    for (i = 0; i < ch.length; i++) { var k = ch[i].getAttribute && ch[i].getAttribute("data-k"); if (k && /^dbg/.test(k)) l.removeChild(ch[i]); }
    if (!debugOn()) return;
    var bx = box(), g = geomNow(bx), z = plan.zones, list = [["hd", g.head]], n;
    for (n in z) if (own(z, n) && z[n] && n !== "obs") list.push([n, z[n]]);
    for (i = 0; i < list.length; i++) { var r = list[i][1], d = D.createElement("div"); d.setAttribute("data-k", "dbg" + i); d.className = "jvh-dbg" + (list[i][0] === "hd" ? " hd" : ""); d.textContent = list[i][0]; d.style.cssText = "left:" + Math.round(r.l) + "px;top:" + Math.round(r.t) + "px;width:" + Math.round(r.r - r.l) + "px;height:" + Math.round(r.b - r.t) + "px"; l.appendChild(d); }
  }
  function startTick() { if (!TICK) TICK = setInterval(tick, TICK_MS); }
  function stopTick() { if (TICK) { clearInterval(TICK); TICK = 0; } }
  function tick() {
    var bx = box();
    if (!bx || !LAYER || !LAYER.parentNode || LAYER.parentNode !== bx) { G = null; LAYER = null; stopTick(); return; } /* the call closed, or the widget took its place */
    if (!G) { stopTick(); return; }
    if (G.hidden) return;
    var t = now(), J = JL(), sp = false;
    if (G.fadeAt) {
      try { sp = !!(J && J.speaking && J.speaking()); } catch (e) { sp = false; }
      if ((sp || (G.hover && t - G.hover < 4000)) && G.mode !== "none" && G.mode !== "fail") G.fadeAt = Math.min(Math.max(G.fadeAt, t + 6000), G.shownAt + MAX_MS);
      if (t >= G.fadeAt) { hideAll(false); return; }
    }
    render(false);
  }
  function clear() {
    stopTick(); clearGroup(true); SEEN = {}; SEEN_N = 0; LAST_OWN = {}; if (LAYER && LAYER.parentNode) LAYER.parentNode.removeChild(LAYER); LAYER = null;
    clearTimeout(FOLD_T); FOLD_T = 0; try { var de = D.documentElement; de.className = String(de.className || "").replace(/\s*\bjvh-fold\b/g, ""); } catch (e) {}
  }
  var rsT = 0; function soon() { clearTimeout(rsT); rsT = setTimeout(function () { if (G && !G.hidden) render(false); }, 120); }

  /* ---------- wiring (capture phase on the document, as data/holo.js and bassem-intel-view.js) ---------- */
  D.addEventListener("anam-agent:tool-call-started", function (e) { try { onStart(e); } catch (x) {} }, true);
  D.addEventListener("anam-agent:tool-call-completed", function (e) { try { onDone(e); } catch (x) {} }, true);
  D.addEventListener("anam-agent:tool-call-failed", function (e) { try { onFail(e); } catch (x) {} }, true);
  D.addEventListener("anam-agent:session-ended", function () { try { clear(); } catch (x) {} }, true);
  W.addEventListener("mig:screen-result", function (e) { try { onScreen(e); } catch (x) {} });
  W.addEventListener("resize", soon);
  D.addEventListener("fullscreenchange", soon); D.addEventListener("webkitfullscreenchange", soon);
  D.addEventListener("loadedmetadata", function (e) { if (e && e.target && e.target.tagName === "VIDEO") soon(); }, true);
  D.addEventListener("resize", function (e) { if (e && e.target && e.target.tagName === "VIDEO") soon(); }, true); /* the stream's own size changed */

  W.MIG_CALL_HOLO = { v: 1, owns: owns, on: function () { return !!(G && !G.hidden && LAYER && LAYER.parentNode); }, clear: clear, layout: function () { if (G && !G.hidden) render(false); },
    state: function () { if (!G) return null; var t = now(); return { mode: phase(t), rows: G.rows.map(function (r) { return { sec: r.sec, q: r.q, count: r.count, items: r.items.length, failed: r.failed, screen: r.screen, item: !!r.item }; }), fadeIn: G.fadeAt ? Math.max(0, G.fadeAt - t) : null, hidden: !!G.hidden }; },
    _t: { argsOf: argsOf, resOf: resOf, clean: clean, specOf: specOf, cardOf: cardOf, itemCard: itemCard, oppCard: oppCard, rowLabel: rowLabel, nRes: nRes, pathOf: pathOf, stageGeom: stageGeom, posOf: posOf, faceOf: faceOf, zonesOf: zonesOf, planOf: planOf, FACES: FACES, HGT: HGT } };
})();
