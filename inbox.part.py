# Requests console («متابعة الطلبات»): inbox.html → /inbox/ — the platform team's console for the automatic inquiry engine (noindex, not in the sitemap).
# Normal flows need no person: every request is matched and sent automatically to REGISTERED member factories (basic+, premium first, max 10)
# by e-mail (a signed one-time link to the member dashboard / the reply page, no inbound e-mail needed) and WhatsApp when it is live;
# replies and quotes reach the buyer automatically and the status moves by itself.
# When NO registered factory matches, the engine does three things on its own: the admins are notified (this console + e-mail),
# candidate factories are searched automatically (the platform directory's non-member factories — shown HERE ONLY, with their source — and the
# web when a search key is configured), and the buyer is told «جاري معالجة طلبك» (status in_progress). Such requests are listed first with a
# red badge; the team arranges with a factory itself and answers the buyer from here («إحنا اللي هنرد»): e-mail (+ WhatsApp if the buyer opted in),
# shown on the buyer's tracking page as a reply from the platform team.
# Requires a platform session with role=admin (data/mig-api.js e-mail code); every endpoint is also admin-checked on the server:
#   GET /api/admin/inquiries?status=&q= → {items[{…, needs_team}], counts}
#   GET /api/admin/inquiries/:id → {inquiry, events, routes, quotes, needs_team, candidates[{name, governorate, sector, source, url, profile_url, snippet}]}
#   POST /api/admin/inquiries/:id/candidates/refresh → {candidates}
#   POST /api/admin/inquiries/:id/reply {body, channel: email|whatsapp|both, status?: in_progress|replied|closed} → {ok, sent:{email, whatsapp}}
#   POST /api/admin/inquiries/:id/resend · POST /api/admin/block {email|ip_hash}
# Next to it (deploy 1): the SEO workspace (seo-admin.html) and the owner's current admin panel (panel.html on the live system).
# All UI text is bilingual in code: T(ar, en).
PAGES['inbox'] = ('متابعة الطلبات – صنع في مصر', '', COMMON_CSS + '''
.ibx { padding-block: 22px 70px; display: flex; flex-direction: column; gap: 16px; }
.ibx h1 { font-size: clamp(1.3rem, 2.6vw, 1.8rem); font-weight: 900; }
.ibx .lead { color: var(--muted); max-width: 70em; }
.ibx-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px; }
.ibx-lk { display: flex; flex-wrap: wrap; gap: 8px; }
.ibx-auto { display: flex; gap: 10px; align-items: flex-start; background: var(--green-soft); color: var(--fg); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; font-size: .9rem; line-height: 1.8; }
.ibx-f { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ibx-f input, .ibx-f select { font: inherit; border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; background: var(--surface); color: var(--fg); min-width: 0; }
.ibx-f input[type=search] { flex: 1 1 240px; }
.ibx-sum { display: flex; flex-wrap: wrap; gap: 8px; }
.ibx-sum button { border: 1px solid var(--line); background: var(--surface); border-radius: 99px; padding: 4px 12px; font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; color: var(--fg); }
.ibx-sum button.on { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.ibx-sum button.nt { border-color: #F3C9C9; color: #B42318; }
.ibx-sum button.nt.on { background: #FDECEC; border-color: #B42318; }
.ibx-g { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ibx-l { display: flex; flex-direction: column; gap: 8px; }
.ibx-i { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; text-align: start; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: var(--surface); color: var(--fg); font: inherit; cursor: pointer; width: 100%; }
.ibx-i:hover, .ibx-i.on { border-color: var(--green); background: var(--green-soft); }
.ibx-i.nt { border-color: #E8A1A1; border-inline-start: 5px solid #C8102E; }
.ibx-i b { font-size: .92rem; overflow-wrap: anywhere; }
.ibx-i small { color: var(--muted); font-size: .76rem; grid-column: 1 / -1; overflow-wrap: anywhere; }
.ibx-nt { display: inline-flex; align-items: center; gap: 4px; background: #C8102E; color: #fff; border-radius: 99px; padding: 1px 9px; font-size: .72rem; font-weight: 800; white-space: nowrap; }
.ibx-d { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 80px); max-height: calc(100vh - 100px); overflow: auto; }
.ibx-d h2 { font-size: 1.1rem; font-weight: 900; overflow-wrap: anywhere; }
.ibx-d h3 { font-size: .95rem; font-weight: 800; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ibx-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; font-size: .86rem; }
.ibx-kv div { background: var(--sunken); border-radius: 10px; padding: 8px 10px; overflow-wrap: anywhere; }
.ibx-kv span { display: block; color: var(--muted); font-size: .72rem; }
.ibx-msg { white-space: pre-line; background: var(--sunken); border-radius: 10px; padding: 10px 12px; font-size: .9rem; overflow-wrap: anywhere; }
.ibx-tw { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
.ibx-tw table { width: 100%; border-collapse: collapse; font-size: .84rem; min-width: 520px; }
.ibx-tw th { text-align: start; background: var(--sunken); color: var(--muted); font-size: .74rem; padding: 8px 10px; white-space: nowrap; }
.ibx-tw td { padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; }
.ibx-act { display: flex; flex-wrap: wrap; gap: 8px; }
.ibx-empty { padding: 26px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; }
.ibx-alert { background: #FDECEC; color: #7A1020; border: 1px solid #F3C9C9; border-radius: 12px; padding: 10px 12px; font-size: .88rem; line-height: 1.8; }
.ibx-alert b { color: #B42318; }
.ibx-cl { display: flex; flex-direction: column; gap: 8px; }
.ibx-c { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: .86rem; background: var(--surface); }
.ibx-c b { font-size: .92rem; overflow-wrap: anywhere; }
.ibx-c .meta { color: var(--muted); font-size: .76rem; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.ibx-c .snip { color: var(--fg); font-size: .8rem; white-space: pre-line; overflow-wrap: anywhere; }
.ibx-c .lks { display: flex; flex-wrap: wrap; gap: 10px; font-size: .8rem; font-weight: 700; }
.ibx-src { display: inline-block; border-radius: 99px; padding: 0 8px; font-size: .7rem; font-weight: 800; background: var(--sunken); }
.ibx-src.web { background: #E8F0FE; color: #1A4FA0; }
.ibx-src.directory { background: var(--gold-soft); color: var(--gold-deep, #7A5A00); }
.ibx-rp { border: 2px solid var(--gold); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--gold-soft); }
.ibx-rp textarea { font: inherit; width: 100%; box-sizing: border-box; min-height: 110px; border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; background: var(--surface); color: var(--fg); resize: vertical; }
.ibx-rp .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.ibx-rp label { display: flex; flex-direction: column; gap: 4px; font-size: .82rem; font-weight: 700; }
.ibx-rp select { font: inherit; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; background: var(--surface); color: var(--fg); }
.ibx-rp small { color: var(--muted); font-weight: 500; font-size: .76rem; }
.ibx-x { display: none; }
@media (max-width: 900px) { .ibx-g { grid-template-columns: 1fr; } .ibx-d { position: static; max-height: none; } .ibx-x { display: inline-flex; } }
''', '''
<main class="wrap ibx" id="top">
  <div class="ibx-top" id="ibxH"><div><nav class="crumb" style="font-size:.8rem;color:var(--muted)"><a href="home.html">الرئيسية</a> › <a href="dashboard.html">لوحتي</a> › متابعة الطلبات</nav>
  <h1>متابعة الطلبات</h1>
  <p class="lead">الطلبات بتتوزّع تلقائي على المصانع المسجّلة المطابقة. الطلبات اللي مالقتش مصنع مسجّل مطابق بتظهر أول القايمة بعلامة حمرا.</p></div></div>
  <div id="ibx" aria-live="polite" translate="no"><p class="muted">⏳ جارٍ التحميل…</p></div>
</main>
<script src="data/mig-api.js"></script>
''', '''
(function () {
  var EN = window.MIGLANG === "en", T = function (a, e) { return EN ? e : a; }, A = window.MIGAPI, U = A.ui, esc = U.esc;
  var root = $("#ibx"), S = { status: "", q: "", items: null, counts: null, err: null, cur: null, detail: null, reply: false, busyC: false };
  root.innerHTML = '<p class="muted">⏳ ' + T("جارٍ التحميل…", "Loading…") + "</p>";
  /* the page head in the page language (static Arabic above is the first paint) + the team's other consoles */
  $("#ibxH").innerHTML = '<div><nav class="crumb" style="font-size:.8rem;color:var(--muted)"><a href="home.html">' + T("الرئيسية", "Home") + '</a> › <a href="dashboard.html">' + T("لوحتي", "My dashboard") + "</a> › " + T("متابعة الطلبات", "Requests console") + "</nav><h1>" + T("متابعة الطلبات", "Requests console") + '</h1><p class="lead">' + T("المنصة بتوزّع كل طلب تلقائي على المصانع المسجّلة المطابقة، وبتبعت الردود والعروض للمشتري وبتحدّث الحالة لوحدها. الطلبات اللي مالقتش مصنع مسجّل مطابق بتظهر أول القايمة بعلامة حمرا: الإدارة اتبلّغت تلقائي، والمشتري وصله «جاري معالجة طلبك»، والمرشّحين اتجمعوا لكم — رتّبوا مع مصنع وردّوا من هنا بزرار «إحنا اللي هنرد».", "The platform routes every request automatically to matching registered factories, forwards replies and quotes to the buyer and updates the status by itself. Requests that found no matching registered factory are listed first with a red badge: the admins were notified automatically, the buyer was told “We're working on your request”, and candidate factories were gathered for you — arrange with a factory and answer the buyer from here with “We'll reply”.") + "</p></div>"
    + '<div class="ibx-lk"><a class="btn btn-line btn-sm" href="seo-admin.html" rel="nofollow">🔎 ' + T("مساحة SEO", "SEO workspace") + '</a><a class="btn btn-line btn-sm" href="panel.html" rel="nofollow">🗂️ ' + T("لوحة الإدارة", "Admin panel") + "</a></div>";
  /* the tab title in the page language (the generated <title> is Arabic) */
  if (EN) { document.title = "Requests console – Made in Egypt Gate"; var og = document.querySelector('meta[property="og:title"]'); if (og) og.setAttribute("content", document.title); }
  /* request statuses the engine really uses (worker/src/inquiries.js); «needs_team» is the no-match flag, listed first */
  var STS = [["", "الكل", "All"], ["needs_team", "🔴 محتاج رد الفريق", "🔴 Needs the team"], ["in_progress", "جاري المعالجة (الفريق)", "In progress (team)"], ["received", "تم الاستلام (بيتبعت)", "Received (being sent)"], ["routed", "اتبعت للمصانع", "Sent to factories"], ["no_match", "مستني مصنع مطابق", "Waiting for a match"], ["replied", "وصل رد / عرض", "Reply / quote received"], ["recorded", "اتسجّل (مش بيتبعت لمصانع)", "Recorded (not routed)"], ["closed", "مغلق", "Closed"], ["blocked", "موقوف", "Blocked"]];
  function api(path, o) { return A.request("/admin" + path, o); }
  /* the no-match flag: the server's needs_team (list and detail); an older list without it: a request the team is handling */
  function nt(x) { return !!(x && (x.needs_team === true || x.needs_team === 1 || (x.needs_team == null && x.status === "in_progress"))); }
  function deny(msg, login) {
    root.innerHTML = '<div class="card2" style="max-width:560px"><p>' + msg + "</p>" + (login ? '<button class="btn btn-green" type="button" id="ibLg">🔑 ' + T("الدخول بالبريد", "Sign in with e-mail") + "</button>" : "") + "</div>";
    var b = $("#ibLg"); if (b) b.onclick = function () { A.open().then(function () { location.reload(); }, function () {}); };
  }
  function countOf(k) {
    var c = S.counts || {};
    if (k === "needs_team") return c.needs_team != null ? +c.needs_team || 0 : (S.items || []).filter(nt).length;
    return +c[k] || 0;
  }
  function shell() {
    /* totals per status come from the server (GET /api/admin/inquiries → counts), not from the filtered page */
    var cnt = S.counts || {}, all = 0; Object.keys(cnt).forEach(function (k) { if (k !== "needs_team" && k !== "total") all += +cnt[k] || 0; }); if (cnt.total != null) all = +cnt.total || all;
    root.innerHTML = '<div class="ibx-auto"><span aria-hidden="true">⚙️</span><span>' + T("مفيش خطوة عادية هنا محتاجة موظف: الإرسال للمصانع والردود للمشتري وتحديث الحالة كلهم تلقائي. الحاجة الوحيدة اللي مستنياكم هي الطلبات اللي عليها العلامة الحمرا. الأعداد اللي تحت هي إجمالي الطلبات على السيرفر حسب الحالة.", "No normal step here needs a person: sending to factories, replies to buyers and status updates are all automatic. The only thing waiting for you is the requests with the red badge. The counts below are the server's totals per status.") + "</span></div>"
      + '<form class="ibx-f" id="ibF" role="search"><input type="search" name="q" value="' + esc(S.q) + '" placeholder="' + esc(T("رقم الطلب، الاسم، الشركة، البريد…", "Ref, name, company, e-mail…")) + '" aria-label="' + esc(T("بحث", "Search")) + '"><select name="status" aria-label="' + esc(T("الحالة", "Status")) + '">' + STS.map(function (s) { return '<option value="' + s[0] + '"' + (S.status === s[0] ? " selected" : "") + ">" + T(s[1], s[2]) + "</option>"; }).join("") + '</select><button class="btn btn-green btn-sm" type="submit">' + T("بحث", "Search") + '</button><button class="btn btn-line btn-sm" type="button" data-rf>↻ ' + T("تحديث", "Refresh") + "</button></form>"
      + (S.counts ? '<div class="ibx-sum">' + STS.map(function (s) { var n = s[0] ? countOf(s[0]) : all; if (s[0] === "needs_team" && !n && S.status !== "needs_team") return ""; return '<button type="button" data-st="' + s[0] + '" class="' + (S.status === s[0] ? "on" : "") + (s[0] === "needs_team" ? " nt" : "") + '">' + T(s[1], s[2]) + ' <span class="num">' + n + "</span></button>"; }).join("") + "</div>" : "")
      + '<div class="ibx-g"><div class="ibx-l" id="ibL">' + list() + '</div><div class="ibx-d" id="ibD"' + (S.cur ? "" : " hidden") + ">" + detail() + "</div></div>";
  }
  function srcName(v) { return { form: T("فورم", "Form"), janna: T("جنة", "Janna"), bassem: T("باسم", "Bassem"), basket: T("السلة", "Basket") }[v] || v; }
  /* needs_team first (newest first inside each group, as the server sends them) */
  function ordered() { var it = (S.items || []).map(function (x, i) { return [x, i]; }); it.sort(function (a, b) { return (nt(b[0]) ? 1 : 0) - (nt(a[0]) ? 1 : 0) || a[1] - b[1]; }); return it.map(function (p) { return p[0]; }); }
  function list() {
    if (S.err) return '<div class="' + (S.err.code === "offline" ? "mig-off" : "card2") + '" role="alert">' + esc(U.errText(S.err)) + "</div>";
    if (!S.items) return '<p class="muted">⏳ ' + T("جارٍ التحميل…", "Loading…") + "</p>";
    var L = ordered(); if (S.status === "needs_team") L = L.filter(nt);
    if (!L.length) return '<div class="ibx-empty">' + (S.status === "needs_team" ? T("مفيش طلبات مستنية رد الفريق دلوقتي.", "No request is waiting for the team right now.") : T("مفيش طلبات مطابقة للبحث ده.", "No requests match this search.")) + "</div>";
    return L.map(function (x) {
      var n = x.routed_count != null ? x.routed_count : x.recipients != null ? x.recipients : null, red = nt(x);
      return '<button type="button" class="ibx-i' + (S.cur === x.id ? " on" : "") + (red ? " nt" : "") + '" data-id="' + esc(x.id) + '"><b dir="auto">' + esc(x.target_name || (x.payload && (x.payload.product || x.payload.title)) || U.kindLabel(x.kind)) + "</b><span>" + (red ? '<span class="ibx-nt">🔴 ' + T("محتاج رد الفريق", "Needs the team") + "</span> " : "") + U.statusChip(x.status) + "</span><small><span dir=\\"ltr\\">" + esc(x.ref) + "</span> · " + esc(U.kindLabel(x.kind)) + " · " + esc(x.company || x.name || x.email || "") + " · " + esc(U.date(x.created_at, true)) + (n != null ? " · " + T("اتبعت لـ ", "sent to ") + n + T(" مصنع", " factories") : "") + (x.source ? " · " + esc(srcName(x.source)) : "") + "</small></button>";
    }).join("");
  }
  /* readable names for the request's payload fields (worker/src/inquiries.js cleanPayload keeps whatever the form sent) */
  var PK = { product: ["المنتج", "Product"], qty: ["الكمية", "Quantity"], quantity: ["الكمية", "Quantity"], unit: ["الوحدة", "Unit"], sector: ["القطاع", "Sector"], governorate: ["المحافظة", "Governorate"], governorate_name: ["المحافظة", "Governorate"], city: ["المدينة / المنطقة", "City / area"], market: ["السوق", "Market"], deadline: ["آخر موعد", "Deadline"], role: ["صفة المرسل", "Sender role"], subject: ["الموضوع", "Subject"], title: ["العنوان", "Title"], entity: ["الجهة", "Entity"], price: ["السعر", "Price"], currency: ["العملة", "Currency"], moq: ["أقل كمية", "MOQ"], lead_time: ["مدة التوريد", "Lead time"], lead_time_days: ["مدة التوريد (يوم)", "Lead time (days)"], validity: ["الصلاحية", "Validity"], source_url: ["المصدر", "Source"], ref: ["رقم الإعلان", "Notice no."], mode: ["نوع الطلب", "Request type"], plan: ["الباقة", "Plan"], country: ["الدولة", "Country"], specs: ["المواصفات", "Specifications"], budget: ["الميزانية", "Budget"] };
  var TT = { factory: ["مصنع", "Factory", "factory.html#"], company: ["شركة", "Company", "company.html#"], tender: ["مناقصة", "Tender", "tenders.html#"], rfq: ["طلب عرض سعر", "RFQ", "rfqs.html#"], project: ["مشروع", "Project", "project.html#"], entity: ["جهة", "Entity", "entity.html#"], offer: ["عرض", "Offer", "offer.html#"], lead: ["فرصة", "Lead", "lead.html#"] };
  function pval(k, v) { if (k === "governorate" && /^[A-Z]{3}$/.test(String(v)) && window.MIGREG && MIGREG.name) return MIGREG.name(v) || v; if (k === "market" && window.MIGPLAN && MIGPLAN.mkName) return MIGPLAN.mkName(v); return v; }
  /* only http(s) or site-relative links are ever rendered (candidate data may come from the web) */
  function safeUrl(u) { u = String(u || "").trim(); if (/^https?:\\/\\//i.test(u)) return u; if (/^\\/?[\\w-]+\\.html(#[^"'<>\\s]*)?$/.test(u) || /^\\/[\\w\\/%.-]*\\/(#[^"'<>\\s]*)?$/.test(u)) return u; return ""; }
  function host(u) { try { return new URL(u, location.href).hostname.replace(/^www\\./, ""); } catch (e) { return ""; } }
  /* candidate factories for a request no registered member matched (admin only: never shown to buyers, never contacted by the platform) */
  function candHTML(d, q) {
    var c = d.candidates || q.candidates || [], ws = d.web_search || {}, web = typeof ws === "object" ? ws : { provider: ws ? "on" : "" };
    /* what the web search did, as the server reports it (never a promise of results) */
    var wtxt = web.error ? "⚠️ " + T("بحث الويب ما اشتغلش: ", "Web search failed: ") + String(web.error).slice(0, 120) : web.provider && web.provider !== "on" ? "🌐 " + T("بحث الويب: ", "Web search: ") + web.provider : web.skipped === "not_run" ? T("القايمة دي من دليل المنصة؛ «تحديث المرشحين» بيشغّل البحث الكامل.", "This list is from the platform directory; “Refresh candidates” runs the full search.") : !web.provider ? T("البحث على الويب مش متفعّل: مفيش مفتاح بحث متسجّل.", "Web search is off: no search key is configured.") : "";
    var h = "<h3><span>🔎 " + T("مصانع مرشّحة", "Candidate factories") + " (" + c.length + ')</span><button class="btn btn-line btn-sm" type="button" data-cand' + (S.busyC ? " disabled" : "") + ">🔄 " + T("تحديث المرشحين", "Refresh candidates") + "</button></h3>"
      + '<p class="muted" style="margin:0;font-size:.8rem">' + T("للإدارة بس: المنصة مابتتواصلش مع أي مصنع مش مسجّل. دول اقتراحات من دليل المنصة (منشآت مش أعضاء) ومن الويب لو مفتاح البحث متسجّل — كل واحد بمصدره. التواصل والترتيب عليكم، وبعدها ردّوا على المشتري من تحت.", "Admins only: the platform never contacts a factory that is not registered. These are suggestions from the platform directory (non-member companies) and from the web when a search key is configured — each with its source. You make the contact and the arrangement, then answer the buyer below.") + "</p>" + (wtxt || d.candidates_at ? '<p class="muted" style="margin:0;font-size:.76rem">' + esc(wtxt) + (d.candidates_at ? (wtxt ? " · " : "") + T("آخر بحث: ", "Last search: ") + esc(U.date(d.candidates_at, true)) : "") + "</p>" : "");
    if (!c.length) return h + '<div class="ibx-empty" style="padding:14px">' + T("مفيش مرشّحين لسه. جرّب «تحديث المرشحين».", "No candidates yet. Try “Refresh candidates”.") + "</div>";
    return h + '<div class="ibx-cl">' + c.map(function (x) {
      var src = String(x.source || "").toLowerCase() === "web" ? "web" : "directory", u = safeUrl(x.url), pu = safeUrl(x.profile_url), gov = x.governorate ? pval("governorate", x.governorate) : "";
      if (u && u === pu) u = "";
      var lab = src === "web" ? "🌐 " + T("من الويب", "Web") : x.origin === "public_source" ? "🏛️ " + T("مصدر عام رسمي (مش عضو)", "Official public source (not a member)") : "📒 " + T("دليل المنصة (مش عضو)", "Platform directory (not a member)");
      return '<div class="ibx-c"><b dir="auto">' + esc(x.name || T("(من غير اسم)", "(no name)")) + '</b><div class="meta"><span class="ibx-src ' + src + '">' + lab + "</span>" + (x.type ? '<span dir="auto">' + esc(EN ? ({ "مصنع": "Factory", "شركة ومورد": "Company & supplier", "شركة": "Company", "مورد": "Supplier" }[x.type] || x.type) : x.type) + "</span>" : "") + "<span>" + (src === "web" ? T("من نتايج البحث — محدش اتواصل معاه", "from the search results — nobody contacted it") : T("غير مسجّل — محدش اتواصل معاه", "not registered — nobody contacted it")) + "</span>" + (gov ? "<span>📍 " + esc(gov) + "</span>" : "") + (x.sector ? '<span dir="auto">🏭 ' + esc(x.sector) + "</span>" : "") + "</div>"
        + (x.snippet ? '<div class="snip" dir="auto">' + esc(String(x.snippet).slice(0, 400)) + "</div>" : "")
        + (u || pu ? '<div class="lks">' + (pu ? '<a href="' + esc(pu) + '" target="_blank" rel="noopener nofollow">📄 ' + T("صفحته على المنصة", "Its platform page") + "</a>" : "") + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow noreferrer">🔗 ' + esc(host(u) || T("المصدر", "Source")) + "</a>" : "") + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }
  /* «إحنا اللي هنرد»: the team answers the buyer from here — e-mail, and WhatsApp only when the buyer opted in; the buyer sees it on the tracking page */
  function replyHTML(q) {
    var canWa = !!(q.phone && (q.consent_wa === 1 || q.consent_wa === true)), done = q.status === "closed" || q.status === "blocked";
    if (done) return '<p class="muted">' + T("الطلب ده ", "This request is ") + U.statusLabel(q.status) + T("، فالرد عليه مقفول.", ", so replying is closed.") + "</p>";
    if (!S.reply) return '<div class="ibx-act"><button class="btn btn-gold" type="button" data-reply>🧑‍💼 ' + T("إحنا اللي هنرد", "We'll reply") + "</button></div>";
    return '<form class="ibx-rp" id="ibR" novalidate><b>🧑‍💼 ' + T("رد فريق المنصة على المشتري", "The platform team's reply to the buyer") + "</b>"
      + '<label>' + T("الرد", "Reply") + '<textarea name="body" maxlength="4000" required dir="auto" placeholder="' + esc(T("اكتب للمشتري اللي اتفقتوا عليه: المصنع، السعر أو الخطوة الجاية…", "Tell the buyer what you arranged: the factory, the price or the next step…")) + '"></textarea><small>' + T("بيوصل للمشتري باسم «فريق منصة صنع في مصر»، وبيظهر في صفحة تتبّع طلبه. ماتكتبش أرقام شخصية لمصانع.", "It reaches the buyer as “the Made in Egypt Gate team” and shows on their tracking page. Do not write factories' personal numbers.") + "</small></label>"
      + '<label>' + T("النص بالإنجليزي (اختياري", "English text (optional") + (q.lang === "en" ? T(" — المشتري بيتابع بالإنجليزي)", " — the buyer follows in English)") : ")") + '<textarea name="body_en" maxlength="4000" dir="ltr" style="min-height:70px"></textarea></label>'
      + '<div class="row"><label>' + T("القناة", "Channel") + '<select name="channel"><option value="email">' + T("إيميل", "E-mail") + "</option>" + (canWa ? '<option value="both" selected>' + T("إيميل + واتساب", "E-mail + WhatsApp") + '</option><option value="whatsapp">' + T("واتساب بس", "WhatsApp only") + "</option>" : "") + "</select>" + (canWa ? "" : "<small>" + T("المشتري ماوافقش على الواتساب، فالرد بالإيميل بس.", "The buyer did not opt in to WhatsApp, so the reply goes by e-mail only.") + "</small>") + "</label>"
      + '<label>' + T("حالة الطلب بعد الرد", "Request status after the reply") + '<select name="status"><option value="replied" selected>' + T("وصل رد", "Reply received") + '</option><option value="in_progress">' + T("لسه جاري المعالجة", "Still in progress") + '</option><option value="closed">' + T("مغلق", "Closed") + "</option></select></label></div>"
      + '<p class="er" role="alert" style="color:#B42318;font-weight:700;margin:0"></p><div class="ibx-act"><button class="btn btn-green" type="submit">📤 ' + T("ابعت الرد للمشتري", "Send the reply to the buyer") + '</button><button class="btn btn-line" type="button" data-reply-x>' + T("إلغاء", "Cancel") + "</button></div></form>";
  }
  function detail() {
    var d = S.detail; if (!S.cur) return "";
    if (!d) return '<p class="muted">⏳ ' + T("جارٍ التحميل…", "Loading…") + "</p>";
    if (d.err) return '<div role="alert">' + esc(U.errText(d.err)) + "</div>";
    var q = d.inquiry || d, ev = d.events || q.events || [], rt = d.routes || d.recipients || q.routes || [], qts = d.quotes || [], items = q.items || q.items_json || [], pay = q.payload || q.payload_json || {};
    if (typeof items === "string") { try { items = JSON.parse(items); } catch (e) { items = []; } }
    if (typeof pay === "string") { try { pay = JSON.parse(pay); } catch (e) { pay = {}; } }
    var red = nt(d.needs_team != null ? d : q);
    var tt = TT[q.target_type], tgt = q.target_type ? (tt ? T(tt[0], tt[1]) : T("عنصر", "Item")) + (q.target_id ? " #" + q.target_id : "") : "";
    var kv = [[T("الرقم", "Ref"), q.ref], [T("النوع", "Kind"), U.kindLabel(q.kind)], [T("المصدر", "Source"), q.source ? srcName(q.source) : ""], [T("الاسم", "Name"), q.name], [T("الشركة", "Company"), q.company], [T("البريد", "E-mail"), q.email], [T("الموبايل", "Mobile"), q.phone], [T("موافقة واتساب", "WhatsApp consent"), q.consent_wa == null ? "" : (q.consent_wa ? T("نعم", "Yes") : T("لا", "No"))], [T("السوق", "Market"), q.market ? pval("market", q.market) : ""], [T("أُنشئ", "Created"), U.date(q.created_at, true)], [T("آخر تحديث", "Updated"), U.date(q.updated_at, true)]].filter(function (k) { return k[1]; });
    Object.keys(pay || {}).forEach(function (k) { var v = pay[k]; if (v == null || v === "" || k === "governorate_name" && pay.governorate || k === "market" && q.market) return; var lab = PK[k] ? T(PK[k][0], PK[k][1]) : T("حقل إضافي", "Extra field") + " (" + k + ")"; kv.push([lab, Array.isArray(v) ? v.join(", ") : typeof v === "object" ? "" : String(pval(k, v))]); });
    kv = kv.filter(function (k) { return k[1]; });
    /* one factory = one route: the channels it was really delivered on (email_sent / wa_sent), the last error, attempts, its answer */
    var qOf = function (r) { var l = qts.filter(function (x) { return x.route_id === r.id; }); return l.length ? l[l.length - 1] : r.quote || null; };
    /* a channel's real outcome: the server's per-channel status (sent | pending | failed | skipped) or its sent flag (1 / 0) */
    var ch = function (num, str, r, wa) {
      var v = str != null && str !== "" ? String(str).toLowerCase() : num === 1 || num === true ? "sent" : r.status === "failed" || r.status === "pending" ? r.status : "";
      if (num === 1 || num === true || v === "sent" || v === "delivered") return "✓ " + T("اتبعت", "sent");
      if (v === "template") return "✓ " + T("اتبعت تنبيه (قالب)", "alert sent (template)");
      if (v === "failed") return "⚠️ " + T("فشل (بيتعاد تلقائي)", "failed (retried automatically)") + (!wa && r.attempts ? " · " + T("محاولات ", "attempts ") + r.attempts : "");
      if (v === "pending" || v === "queued") return "⏳ " + T("لسه", "not yet");
      if (v === "skipped") return wa ? "— " + T("(مش مفعّل)", "(not opted in)") : "—";
      return "—";
    };
    return '<div class="trkh" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h2 dir="auto">' + esc(q.target_name || (pay && pay.product) || U.kindLabel(q.kind)) + "</h2><span>" + (red ? '<span class="ibx-nt">🔴 ' + T("محتاج رد الفريق", "Needs the team") + "</span> " : "") + U.statusChip(q.status) + '</span><button class="btn btn-line btn-sm ibx-x" type="button" data-close>✕ ' + T("رجوع للقائمة", "Back to list") + "</button></div>"
      + (red ? '<div class="ibx-alert" role="status">⚠️ <b>' + T("مفيش مصنع مسجّل مطابق للطلب ده.", "No registered factory matches this request.") + "</b> " + T("الإدارة اتبلّغت تلقائي، والمشتري وصله «جاري معالجة طلبك». شوفوا المرشّحين تحت، رتّبوا مع مصنع، وبعدين ردّوا على المشتري بزرار «إحنا اللي هنرد».", "The admins were notified automatically and the buyer was told “We're working on your request”. Check the candidates below, arrange with a factory, then answer the buyer with “We'll reply”.") + "</div>" : "")
      + (tgt ? '<p class="muted" style="margin:0">' + T("موجّه إلى: ", "Addressed to: ") + (tt && q.target_id ? '<a href="' + esc(tt[2] + encodeURIComponent(q.target_id)) + '" target="_blank" rel="noopener">' + esc(tgt) + "</a>" : esc(tgt)) + "</p>" : "")
      + '<div class="ibx-kv">' + kv.map(function (k) { return "<div><span>" + esc(k[0]) + '</span><span dir="auto" style="display:block;color:inherit;font-size:inherit">' + esc(k[1]) + "</span></div>"; }).join("") + "</div>"
      + (q.message ? '<div class="ibx-msg" dir="auto">' + esc(q.message) + "</div>" : "")
      + (items && items.length ? "<h3>" + T("البنود", "Items") + '</h3><div class="ibx-kv">' + items.map(function (it) { var qn = it.qty || it.quantity; return '<div dir="auto">' + esc(it.name || it.product || it.title || T("بند", "Item")) + (qn ? " × " + esc(qn) + (it.unit ? " " + esc(it.unit) : "") : "") + "</div>"; }).join("") + "</div>" : "")
      + replyHTML(q)
      + (red || (d.candidates && d.candidates.length) ? candHTML(d, q) : "")
      + "<h3>" + T("التوزيع التلقائي", "Automatic routing") + " (" + rt.length + ")</h3>"
      + (rt.length ? '<div class="ibx-tw"><table><thead><tr><th>' + T("المصنع", "Factory") + "</th><th>" + T("الباقة", "Plan") + "</th><th>" + T("إيميل", "E-mail") + "</th><th>" + T("واتساب", "WhatsApp") + "</th><th>" + T("الحالة", "Status") + "</th></tr></thead><tbody>" + rt.map(function (r) {
          var qq = qOf(r);
          return '<tr><td><b dir="auto">' + esc(r.company || r.member_name || r.email || r.member_id || "") + "</b>" + (r.score != null ? '<span class="sub" style="display:block;color:var(--muted);font-size:.74rem">' + T("درجة المطابقة ", "match score ") + esc(r.score) + (r.priority ? " · ⭐ " + T("أولوية", "priority") : "") + "</span>" : "") + "</td><td>" + esc(window.MIGPLAN && MIGPLAN.name ? MIGPLAN.name(A.planOf({ plan: r.plan })) : r.plan || "") + "</td><td>" + ch(r.email_sent, r.email_status, r) + "</td><td>" + ch(r.wa_sent, r.wa_status, r, 1) + "</td><td>" + U.statusChip(r.status || "") + (r.error ? '<span class="sub" style="display:block;color:#B42318;font-size:.74rem" dir="auto">' + esc(r.error) + "</span>" : "") + (qq ? "<br>💰 " + esc(qq.price || "") + " " + esc(qq.currency || "") + (qq.moq ? " · MOQ " + esc(qq.moq) : "") + (qq.lead_time ? " · " + esc(qq.lead_time) : "") : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>"
        : '<p class="muted">' + (/^(rfq|basket)$/.test(q.kind) || (q.kind === "contact" && /^(factory|company)$/.test(q.target_type || "")) ? (red ? T("ماتبعتش لأي مصنع: مفيش مصنع مسجّل مطابق لحد دلوقتي. الطلب مفتوح 30 يوم وهيتبعت تلقائي لأي مصنع مطابق ينضم — ولحد كده الفريق بيتابعه.", "Not sent to any factory: no registered factory matches yet. The request stays open for 30 days and is sent automatically to any matching factory that joins — meanwhile the team handles it.") : T("ماتبعتش لأي مصنع: مفيش مصنع مسجّل مطابق لحد دلوقتي. الطلب مفتوح وهيتبعت تلقائي لأي مصنع مطابق ينضم.", "Not sent to any factory: no registered factory matches yet. The request stays open and is sent automatically to any matching factory that joins.")) : T("النوع ده بيتسجّل بس ومش بيتوزّع على مصانع.", "This kind is recorded only; it is not routed to factories.")) + "</p>")
      + "<h3>" + T("خط السير الكامل", "Full timeline") + "</h3>" + U.timeline(ev.map(function (e) { var b = e.body || "", who = String(e.actor || ""); if (e.buyer_visible === 0 || e.buyer_visible === false) b = "🔒 " + T("داخلي: ", "internal: ") + b; return { type: e.type, actor: e.actor, body: b + (who && who !== "system" && who !== "team" ? " (" + who + ")" : ""), created_at: e.created_at }; }))
      + '<p class="er" role="alert" style="color:#B42318;font-weight:700"></p><div class="ibx-act"><button class="btn btn-line btn-sm" type="button" data-resend>↻ ' + T("إعادة الإرسال التلقائي", "Re-run automatic sending") + "</button>"
      + (q.email ? '<button class="btn btn-line btn-sm" type="button" data-block="email" data-v="' + esc(q.email) + '" style="color:#B42318;border-color:#F3C9C9">⛔ ' + T("حظر البريد", "Block e-mail") + "</button>" : "")
      + (q.ip_hash ? '<button class="btn btn-line btn-sm" type="button" data-block="ip_hash" data-v="' + esc(q.ip_hash) + '" style="color:#B42318;border-color:#F3C9C9">⛔ ' + T("حظر المصدر (IP مشفّر)", "Block source (hashed IP)") + "</button>" : "") + "</div>";
  }
  function paintDetail() { var d = $("#ibD"); if (d) { d.hidden = !S.cur; d.innerHTML = detail(); } }
  function load() {
    S.items = null; S.err = null; shell();
    /* status=needs_team: the server's own filter (no registered match, the team acts) */
    var qs = "?status=" + encodeURIComponent(S.status) + "&q=" + encodeURIComponent(S.q);
    api("/inquiries" + qs).then(function (j) { S.items = j.items || []; S.counts = j.counts || null; if (!S.counts) { S.counts = {}; S.items.forEach(function (x) { S.counts[x.status] = (S.counts[x.status] || 0) + 1; }); } shell(); }, function (e) {
      S.err = e; S.items = null; shell();
      /* the console needs an e-mail-code session (a link session is refused): sign in, then load again */
      if (e && e.code === "full_login_required") A.open({ why: U.errText(e) }).then(function () { location.reload(); }, function () {});
    });
  }
  function open(id, keepReply) {
    S.cur = id; S.detail = null; if (!keepReply) S.reply = false; shell();
    api("/inquiries/" + encodeURIComponent(id)).then(function (j) { if (S.cur !== id) return; S.detail = j; paintDetail(); }, function (e) { S.detail = { err: e }; paintDetail(); });
    if (window.innerWidth <= 900) setTimeout(function () { var d = $("#ibD"); if (d) d.scrollIntoView({ block: "start" }); }, 60);
  }
  root.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "ibF") { S.q = e.target.elements.q.value.trim(); S.status = e.target.elements.status.value; S.cur = null; load(); return; }
    if (e.target.id !== "ibR") return;
    var f = e.target, er = f.querySelector(".er"), b = f.querySelector("button[type=submit]"), body = f.elements.body.value.trim(), id = S.cur;
    if (!body) { er.textContent = T("اكتب الرد الأول.", "Write the reply first."); f.elements.body.focus(); return; }
    b.disabled = true; er.textContent = "";
    var rb = { body: body, channel: f.elements.channel.value, status: f.elements.status.value }, be = f.elements.body_en ? f.elements.body_en.value.trim() : ""; if (be) rb.body_en = be;
    api("/inquiries/" + encodeURIComponent(id) + "/reply", { method: "POST", body: rb }).then(function (j) {
      if (!j || j.ok !== true) throw { code: "bad_response", error: T("الخادم ماأكدش الإرسال.", "The server did not confirm.") };
      var s = j.sent || {}, chs = f.elements.channel.value, parts = [];
      /* say exactly what the server delivered */
      parts.push(s.email ? "✓ " + T("الإيميل وصل", "e-mail sent") : "✗ " + T("الإيميل ماتبعتش", "e-mail not sent"));
      if (chs !== "email") parts.push(s.whatsapp ? "✓ " + T("الواتساب اتبعت", "WhatsApp sent") : "✗ " + T("الواتساب ماتبعتش", "WhatsApp not sent") + (j.errors && j.errors.whatsapp ? " (" + waWhy(j.errors.whatsapp) + ")" : "") + (j.fallback === "email" ? " — " + T("فالرد راح بالإيميل", "so it went by e-mail") : ""));
      U.toast(T("الرد اتسجّل وظاهر للمشتري في صفحة التتبع — ", "The reply is recorded and shown on the buyer's tracking page — ") + parts.join(" · "));
      S.reply = false; open(id); load2();
    }, function (x) { b.disabled = false; er.textContent = U.errText(x); });
  });
  /* refresh the list (counts / statuses) without closing the open request */
  /* the server's reason in the page language (known reasons; anything else as the server wrote it) */
  function waWhy(m) { m = String(m || ""); return /template/i.test(m) ? T("لسه مفيش قالب واتساب معتمد من Meta لرسايل المشترين", "no WhatsApp template for buyers is approved by Meta yet") : /agree|consent|opt/i.test(m) ? T("المشتري ماوافقش على الواتساب", "the buyer did not opt in to WhatsApp") : /phone|number/i.test(m) ? T("مفيش رقم موبايل للمشتري", "the buyer gave no mobile number") : m.slice(0, 80); }
  function load2() { api("/inquiries?status=" + encodeURIComponent(S.status) + "&q=" + encodeURIComponent(S.q)).then(function (j) { S.items = j.items || []; S.counts = j.counts || S.counts; var l = $("#ibL"); if (l) l.innerHTML = list(); }, function () {}); }
  root.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-rf]")) { load(); return; }
    var st = t.closest("[data-st]"); if (st) { S.status = st.getAttribute("data-st"); S.cur = null; load(); return; }
    var it = t.closest(".ibx-i[data-id]"); if (it) { open(it.getAttribute("data-id")); return; }
    if (t.closest("[data-close]")) { S.cur = null; shell(); return; }
    if (t.closest("[data-reply]")) { S.reply = true; paintDetail(); var ta = root.querySelector("#ibR textarea"); if (ta) ta.focus(); return; }
    if (t.closest("[data-reply-x]")) { S.reply = false; paintDetail(); return; }
    var er = function (x) { var p = root.querySelector("#ibD > .er"); if (p) p.textContent = U.errText(x); };
    var cd = t.closest("[data-cand]");
    if (cd) {
      var cid = S.cur; S.busyC = true; cd.disabled = true;
      api("/inquiries/" + encodeURIComponent(cid) + "/candidates/refresh", { method: "POST", body: {} }).then(function (j) {
        S.busyC = false; if (S.cur !== cid || !S.detail) return;
        if (!j || !Array.isArray(j.candidates)) throw { code: "bad_response", error: T("الخادم مارجّعش قايمة مرشّحين.", "The server returned no candidate list.") };
        S.detail.candidates = j.candidates; if (j.web_search != null) S.detail.web_search = j.web_search; paintDetail();
        U.toast(T("اتحدّثت قايمة المرشّحين: ", "Candidates refreshed: ") + j.candidates.length);
      }, function (x) { S.busyC = false; cd.disabled = false; er(x); U.toast(U.errText(x)); });
      return;
    }
    var rs = t.closest("[data-resend]");
    if (rs) { rs.disabled = true; api("/inquiries/" + encodeURIComponent(S.cur) + "/resend", { method: "POST", body: {} }).then(function (j) { if (!j || j.ok !== true) throw { code: "bad_response", error: T("الخادم ماأكدش.", "The server did not confirm.") }; U.toast(T("اتعاد الإرسال التلقائي", "Automatic sending re-run") + (j.routed != null ? T(" — وصل لـ ", " — delivered to ") + j.routed + T(" مصنع", " factories") + (j.added ? T(" (جديد: ", " (new: ") + j.added + ")" : "") : "")); open(S.cur); load2(); }, function (x) { rs.disabled = false; er(x); }); return; }
    var bl = t.closest("[data-block]");
    if (bl) {
      var k = bl.getAttribute("data-block"), v = bl.getAttribute("data-v");
      if (!window.confirm(T("حظر ده هيمنع أي طلبات أو دخول جديد منه. متأكد؟", "This blocks any new requests or sign-ins from it. Are you sure?") + "\\n" + v)) return;
      var body = {}; body[k] = v; bl.disabled = true;
      api("/block", { method: "POST", body: body }).then(function (j) { if (!j || j.ok !== true) throw { code: "bad_response", error: T("الخادم ماأكدش.", "The server did not confirm.") }; U.toast(T("اتحظر.", "Blocked.")); load(); }, function (x) { bl.disabled = false; er(x); });
    }
  });
  function boot() {
    if (!A.token()) {
      /* GET /api/auth/health (200 when the server is connected): no /me call and no 401 for a signed-out visitor */
      (A.ping ? A.ping() : Promise.reject({ code: "offline" })).then(function (j) {
        if (j && j.auth === false) { deny(esc(U.errText({ code: "auth_off" })), false); return; }
        deny(T("الصفحة دي لإدارة المنصة بس. ادخل ببريد الإدارة.", "This page is for platform administrators only. Sign in with the admin e-mail."), true);
      }, function (e) { deny(esc(e && e.code !== "offline" && e.status < 500 ? U.errText(e) : U.offline()), false); });
      return;
    }
    A.me().then(function (r) {
      if (!r || !r.user || r.user.role !== "admin") { deny(T("حسابك مش حساب إدارة، فالصفحة دي مش متاحة ليه.", "Your account is not an admin account, so this page is not available.") + ' <a href="dashboard.html">' + T("روح للوحتي", "Go to my dashboard") + "</a>", false); return; }
      load();
      /* the admins' notification / e-mail link (inbox.html#<REF>) opens that request (the detail endpoint takes an id or a ref) */
      var hr = ""; try { hr = decodeURIComponent((location.hash || "").slice(1)); } catch (x) {}
      hr = (/^(?:ref=)?([A-Za-z]{2,5}-[A-Za-z0-9-]{3,20})$/.exec(hr) || [])[1] || "";
      if (hr) open(hr.toUpperCase());
    }, function (e) { if (e && e.code === "offline") deny(esc(U.offline()), false); else deny(T("الصفحة دي لإدارة المنصة بس. ادخل ببريد الإدارة.", "This page is for platform administrators only. Sign in with the admin e-mail."), true); });
  }
  window.addEventListener("mig:login", function () { location.reload(); });
  boot();
})();
''')
# noindex + kept out of the sitemap (same pattern as meeting.part.py)
_seo_head_ibx = seo_head
def seo_head(key, title):
    return '<meta name="robots" content="noindex, nofollow">\n' if key == 'inbox' else _seo_head_ibx(key, title)
_seo_files_ibx = seo_files
def seo_files(OUT, keys):
    return _seo_files_ibx(OUT, [k for k in keys if k != 'inbox'])
