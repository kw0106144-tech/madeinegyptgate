/* MIGAPI — the platform's shared client (Phase A: real accounts, inquiries, follows, notifications, honest metrics).
   No dependencies, ES5. Loaded on every page (site.py, right after data/plan.js); safe to load twice.
   Contract (base = window.MIG_API_BASE || "/api"; auth = "Authorization: Bearer <localStorage mig-tok>"; JSON; errors {error, code}):
     POST /auth/request {email, lang} · POST /auth/verify {email, code} → {token, user} · GET /me → {user, unread} · PATCH /me · POST /auth/logout
     POST /inquiries → {ok, ref} · GET /inquiries/:ref?last4= · GET /me/inquiries · GET|POST|DELETE /me/follows · GET /me/notifications
     POST /me/notifications/read · POST /me/prefs · GET /me/stats · POST /ev · POST /advisor/notify
     GET /me/incoming · POST /me/incoming/:ref/quote · POST /me/incoming/:ref/decline
     POST /auth/link {t} → {token, user}: the signed one-time login link of a routed-request e-mail
       (dashboard.html#lt=<t>&tab=incoming&ref=<REF>, 7 days, single use, bound to the member) becomes a normal session; the token
       is taken out of the address bar at once (MIGAPI.linkLogin() is the pending exchange, null when the page had no link)
   When the API cannot be reached (static preview, no Worker) every call rejects with {code:"offline"} and the UI says so honestly:
   nothing is ever shown as "sent" / "saved" without a server answer (a ref, an id, {ok:true}).
   Window events: "mig:login" {user}, "mig:logout", "mig:me" {user, unread} (every server answer), "mig:notif" {unread}.
   UI it adds: the e-mail code sign-in form (MIGAPI.signin: the sign-in page /login/ and the sign-in dialog of gated actions share it),
   the header's «دخول» → /login/?next=<this page> (EN /en/login/), the account chip + notifications bell in the site header, ☆ follow buttons
   (window.MIG_CTX = {type, id, title, url} or [data-follow-kind][data-follow-id]), first-party view / click beacons, and a one-time
   import of this browser's old favourites (mig-fav) and registration (mig-accts) after the first server sign-in. */
(function () {
  if (window.MIGAPI) return;
  var EN = function () { return window.MIGLANG === "en"; };
  var T = function (ar, en) { return EN() ? en : ar; };
  var BASE = String(window.MIG_API_BASE || "/api").replace(/\/+$/, "");
  var TK = "mig-tok", MK = "mig-me";
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jget(k, d) { try { var v = JSON.parse(ls(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function fire(n, d) { try { window.dispatchEvent(new CustomEvent(n, { detail: d || {} })); } catch (e) {} }
  /* the same opening as data/mig-forms.js's offline message */
  var OFFMSG = function () { return T("ماقدرناش نوصل لسيرفر المنصة دلوقتي، فمحصلش أي حاجة. جرّب تاني بعد شوية.", "We couldn't reach the platform's server right now, so nothing happened. Please try again shortly."); };
  function err(code, msg, status) { return { code: code, error: msg || code, status: status || 0 }; }
  /* which page this is: pages live at clean URLs (/dashboard/, /inbox/ …) and site.py sets window.MIGPAGE; the .html form is the fallback */
  function onPage(k) { return window.MIGPAGE === k || new RegExp("(^|/)" + k + "(\\.html?|/)?$").test(location.pathname); }
  /* where a follow / notification link points back to: the full path (clean URLs end with "/", so the last segment alone is empty) */
  function here() { return location.pathname + location.hash; }

  /* ---------- transport ---------- */
  function token() { return ls(TK) || ""; }
  /* a session opened by an e-mailed login link (POST /auth/link): 24 h, for answering routed requests only — the server refuses profile /
     settings changes, Bassem and the admin console with 403 full_login_required. Its session id starts with "lk" (v2.<member>.lk….<exp>.<sig>).
     An old-password sign-in (POST /auth/legacy, /login/ «حساب قديم؟») opens the SAME limited scope; its session id starts with "lg". */
  function linkSession() { return /^v2\.[^.]+\.l[kg]/.test(token()); }
  function legacySession() { return /^v2\.[^.]+\.lg/.test(token()); }
  function request(path, o) {
    o = o || {};
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej(err("offline", OFFMSG())); return; }
      var h = { Accept: "application/json" }, tk = token(), done = false;
      if (o.body !== undefined) h["Content-Type"] = "application/json";
      if (tk && o.auth !== false) h.Authorization = "Bearer " + tk;
      var ctl = window.AbortController ? new AbortController() : null;
      var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej(err("offline", OFFMSG())); }, o.timeout || 15000);
      fetch(BASE + path, { method: o.method || "GET", headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, signal: ctl ? ctl.signal : undefined, credentials: "same-origin" }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        /* a static host answers /api/* with an HTML 404 (or 405/501 for POST): the API is not connected */
        if (ct.indexOf("json") < 0) { if (r.status === 204 && r.ok) return { st: 204, j: {} }; throw err("offline", OFFMSG(), r.status); }
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw err("offline", OFFMSG(), r.status); });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.st === 204 || x.ok) { res(x.j); return; }
        if (x.st === 401 && tk && o.auth !== false) { dropSession(); }
        /* the answer's own fields stay readable (e.g. attempts_left of a wrong sign-in code) */
        var e1 = err(x.j.code || ("http_" + x.st), x.j.error || ("HTTP " + x.st), x.st); e1.body = x.j; rej(e1);
      }).catch(function (e) {
        if (done) return; done = true; clearTimeout(tm);
        rej(e && e.code ? e : err("offline", OFFMSG()));
      });
    });
  }

  /* ---------- session & the signed-in member (the server is the only source of plan truth) ---------- */
  var PLANMAP = { none: "visitor", visitor: "visitor", data: "profile", data_only: "profile", profile: "profile", basic: "basic", premium: "premium", partner: "partner", core: "partner", strategic: "strategic" };
  var LV = { visitor: 0, profile: 1, basic: 2, premium: 3, partner: 4, strategic: 5 };
  var ME = null, CONFIRMED = false, MEP = null, UNREAD = 0;
  (function () { var c = jget(MK, null); if (token() && c && c.user) { ME = c.user; UNREAD = c.unread || 0; } })();
  function planOf(u) { if (!u) return "visitor"; var p = PLANMAP[String(u.plan || "none").toLowerCase()] || "visitor"; if (p !== "visitor" && u.plan_expires && Date.parse(u.plan_expires) < Date.now()) p = "visitor"; return p; }
  function setMe(u, unread) {
    ME = u || null; UNREAD = +unread || 0;
    if (ME) ls(MK, JSON.stringify({ user: ME, unread: UNREAD, t: Date.now() })); else ls(MK, null);
    /* the member himself goes along: data/plan.js reads his chosen GCC states (user.gcc) from it */
    if (window.MIGPLAN && MIGPLAN.update) MIGPLAN.update(planOf(ME), ME && ME.role, true, ME);
  }
  function dropSession() { var had = !!token(); ls(TK, null); ls(MK, null); ME = null; CONFIRMED = true; MEP = null; UNREAD = 0; if (window.MIGPLAN && MIGPLAN.update) MIGPLAN.update("visitor", "", true); if (had) fire("mig:logout"); paintHeader(); }
  function me(force) {
    /* an e-mailed login link being exchanged decides who is signed in: wait for it */
    if (LINKP && !LINKDONE) return LINKP.then(function () {}, function () {}).then(function () { return me(force); });
    if (!token()) { CONFIRMED = true; return Promise.resolve(null); }
    if (MEP && !force) return MEP;
    MEP = request("/me").then(function (j) {
      CONFIRMED = true; setMe(j.user, j.unread); fire("mig:me", { user: ME, unread: UNREAD }); fire("mig:notif", { unread: UNREAD }); paintHeader(); return { user: ME, unread: UNREAD };
    }, function (e) { MEP = null; if (e.code !== "offline") CONFIRMED = true; throw e; });
    return MEP;
  }
  function logout() {
    var p = token() ? request("/auth/logout", { method: "POST", body: {} }).catch(function () {}) : Promise.resolve();
    return p.then(function () { dropSession(); });
  }

  /* ---------- toasts / messages ---------- */
  var tt;
  function toast(m) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast mig-toast"; document.body.appendChild(t); }
    t.setAttribute("role", "status"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 4200);
  }
  function errText(e) {
    if (!e) return T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    var c = String(e.code || "");
    if (c === "offline") return OFFMSG();
    /* a feature the owner switched off in the Control Center («🛠️ المطوّر»): 503 {code: "feature_off", feature} */
    if (c === "feature_off") {
      var ft = String(e.feature || (e.body && e.body.feature) || "");
      if (ft === "registrations") return T("التسجيل الجديد موقوف مؤقتاً — جرّب تاني بعد شوية. لو عندك حساب على المنصة، ادخل بالإيميل بتاعه عادي.", "New registrations are paused for now — please try again later. If you already have an account, sign in with its e-mail as usual.");
      if (ft === "janna_live" || ft === "bassem_live") return T("المكالمات المباشرة موقوفة مؤقتاً — جرّب تاني بعد شوية.", "Live calls are paused for now — please try again later.");
      return T("الخدمة دي موقوفة مؤقتاً — جرّب تاني بعد شوية.", "This service is paused for now — please try again later.");
    }
    /* the e-mailed one-time login link (POST /auth/link) */
    if (/^(used_link|link_used)$/.test(c)) return T("رابط الدخول ده اتستخدم قبل كده (كل رابط بيشتغل مرة واحدة). ادخل بكود على بريدك، وهتلاقي الطلب في «طلبات واردة لي».", "This sign-in link was already used (each link works once). Sign in with an e-mail code and you'll find the request under “Requests routed to me”.");
    if (/^(expired_link|link_expired)$/.test(c)) return T("رابط الدخول ده انتهت صلاحيته (الرابط صالح 7 أيام). ادخل بكود على بريدك، وهتلاقي الطلب في «طلبات واردة لي».", "This sign-in link has expired (links are valid for 7 days). Sign in with an e-mail code and you'll find the request under “Requests routed to me”.");
    if (/^(invalid_link|link_invalid|bad_link)$/.test(c) || (e.link && c !== "blocked" && e.status !== 429 && (e.status === 400 || e.status === 401 || e.status === 404 || e.status === 410))) return T("رابط الدخول ده مش صحيح أو اتنسخ ناقص. ادخل بكود على بريدك، وهتلاقي الطلب في «طلبات واردة لي».", "This sign-in link is not valid or was copied incompletely. Sign in with an e-mail code and you'll find the request under “Requests routed to me”.");
    if (c === "full_login_required" && legacySession()) return T("إنت داخل بالباسورد القديم، وده بيفتح لوحتك للمتابعة ودفع الفواتير والرد على الطلبات بس. عشان تعدّل بياناتك أو منتجاتك أو تستخدم المستشار، ادخل بكود على بريدك.", "You signed in with your old password, which opens your dashboard for following up, paying invoices and answering requests only. To change your details or products, or to use the Advisor, sign in with an e-mail code.");
    if (c === "full_login_required") return T("إنت داخل برابط من الإيميل، وده بيسمح بالرد على الطلبات بس. عشان تغيّر بياناتك أو إعداداتك أو تستخدم المستشار، ادخل بكود على بريدك.", "You signed in with the e-mail link, which only allows answering requests. To change your details or settings, or to use the Advisor, sign in with an e-mail code.");
    if (c === "quote_limit") return T("وصلت للحد المسموح: عرض واحد وتعديلين لكل طلب.", "You reached the limit: one quote and two revisions per request.");
    /* the e-mail code sign-in (worker/src/auth.js): lockout, a burnt code, a code e-mail that could not go out */
    if (c === "locked") return T("اتقفل الدخول بالبريد ده لحد بكرة بسبب أكواد غلط كتير. جرّب تاني بكرة.", "Sign-in with this e-mail is locked until tomorrow after too many wrong codes. Please try again tomorrow.");
    if (c === "too_many_attempts") return T("الكود ده اتلغى بعد محاولات غلط كتير. اطلب كود جديد.", "This code was cancelled after too many wrong attempts. Ask for a new one.");
    if (c === "send_failed") return T("ماقدرناش نبعت الكود دلوقتي. جرّب تاني بعد شوية.", "We couldn't send the code right now. Please try again shortly.");
    if (c === "invalid_email") return T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address.");
    if (c === "rate_limited" || c === "limit" || e.status === 429) return T("محاولات كتير ورا بعض. استنى شوية وجرّب تاني.", "Too many attempts. Please wait a little and try again.");
    if (c === "auth" || c === "unauthorized" || e.status === 401) return T("لازم تسجّل الدخول الأول.", "Please sign in first.");
    /* 403 has several meanings: only "plan" is about the plan */
    if (/^verification_/.test(c)) return T("ماقدرناش نتأكد إنك مش برنامج آلي. حدّث الصفحة وجرّب تاني.", "We could not verify that you are not a bot. Please reload the page and try again.");
    if (c === "blocked") return T("الطلبات من المصدر ده موقوفة بسبب إساءة استخدام.", "Requests from this sender are blocked because of abuse.");
    if (c === "forbidden") return T("الصفحة أو الخدمة دي للإدارة بس.", "This page or service is for administrators only.");
    if (c === "plan" || e.status === 403) return T("الخدمة دي مش متاحة لباقتك الحالية.", "This service is not available on your current plan.");
    if (c === "invalid_kind") return T("النوع ده مش مدعوم على المنصة لسه.", "This type is not supported by the platform yet.");
    /* the server's own checks (member profile, quotes, declines) in plain words */
    if (c === "company_locked") return T("اسم الشركة متأكد منه من المنصة ومربوط بصفحة منشأتك؛ لو محتاج تصحيح ابعت «تصحيح بيانات» من صفحة المنشأة.", "The company name is verified by the platform and linked to your company page; to correct it, send a «data correction» from that page.");
    if (/^invalid_(name|company|title)$/.test(c)) return T("الاسم والشركة واللقب من غير روابط أو إيميلات أو اسم المنصة.", "Name, company and title must not contain links, e-mail addresses or the platform's name.");
    if (c === "invalid_phone") return T("رقم الموبايل مش صحيح.", "The mobile number is not valid.");
    if (c === "invalid_products") return T("المنتجات من غير روابط أو إيميلات، ولحد 20 منتج مفصولين بفواصل.", "Products without links or e-mail addresses, up to 20 items separated by commas.");
    if (c === "already_answered") return T("رديت على الطلب ده قبل كده، فالاعتذار عنه مش متاح.", "You already answered this request, so it cannot be declined.");
    if (c === "closed") return T("الطلب ده اتقفل ومش بيستقبل ردود.", "This request is closed and takes no more answers.");
    if (c === "price_required" || c === "message_required") return T("اكتب السعر أو رسالة الأول.", "Enter a price or a message first.");
    if (c === "no_body" || c === "body_required") return T("اكتب الرد الأول.", "Write the reply first.");
    if (c === "too_long") return T("النص أطول من المسموح (4000 حرف).", "The text is longer than allowed (4,000 characters).");
    if (c === "invalid_status") return T("الحالة دي مش مسموحة للرد.", "This status is not allowed for a reply.");
    if (c === "no_channel" || c === "no_whatsapp") return T("القناة دي مش متاحة للطلب ده (المشتري ماوافقش على الواتساب أو مفيش رقم).", "This channel is not available for this request (the buyer did not opt in to WhatsApp or gave no number).");
    if (c === "search_off" || c === "no_search_key") return T("البحث على الويب مش متفعّل (مفيش مفتاح بحث متسجّل)؛ المرشّحين من دليل المنصة بس.", "Web search is off (no search key is configured); candidates come from the platform directory only.");
    if (c === "not_found" || e.status === 404) return T("مش لاقيين ده على السيرفر.", "Not found on the server.");
    if (c === "store_off" || c === "auth_off" || c === "email_off" || e.status === 503) return T("الخدمة مش جاهزة على السيرفر لسه، فمحصلش أي حاجة. جرّب تاني بعد شوية.", "The service is not ready on the server yet, so nothing happened. Please try again later.");
    return T("حصلت مشكلة: ", "Something went wrong: ") + (e.error || c || "");
  }

  /* ---------- styles (site tokens, no redesign) ---------- */
  var CSS = ''
    + '.mig-hx{display:inline-flex;align-items:center;gap:6px;margin-inline-end:6px}'
    + '.mig-ib{position:relative;display:inline-grid;place-items:center;width:36px;height:34px;border-radius:10px;border:1px solid var(--line,#e5e7eb);background:var(--surface,#fff);color:var(--fg,#111);font:inherit;font-size:1rem;cursor:pointer;padding:0}'
    + '.mig-ib:hover,.mig-ib[aria-expanded=true]{border-color:var(--green,#8E0B20);background:var(--green-soft,#fbe9ec)}'
    + '.mig-ib .n{position:absolute;top:-6px;inset-inline-end:-6px;min-width:18px;height:18px;border-radius:99px;background:#C8102E;color:#fff;font-size:.66rem;font-weight:800;line-height:18px;padding:0 4px;text-align:center}'
    + '.mig-ac{display:inline-flex;align-items:center;gap:6px;max-width:170px;border-radius:99px;border:1px solid var(--line,#e5e7eb);background:var(--surface,#fff);color:var(--fg,#111);font:inherit;font-weight:700;font-size:.8rem;padding:3px 10px 3px 4px;cursor:pointer}'
    + '.mig-ac i{font-style:normal;width:26px;height:26px;border-radius:50%;background:var(--green,#8E0B20);color:#fff;display:grid;place-items:center;font-weight:800;flex:none}'
    + '.mig-ac span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;display:none}.mig-ac{padding:3px}@media (min-width:1560px){.mig-ac span{display:inline}.mig-ac{padding:3px 10px 3px 4px}}'
    + '.mig-in{display:none}a.mig-ib{text-decoration:none}@media (max-width:760px){.mig-in{display:inline-grid}}'
    /* the SEO pages' own «دخول» (bar a.hdr-in, ☰ menu a.nav-in: seo_build.part.py) give way to the account chip: their display rules
       would beat the plain [hidden] (those pages have no [hidden]{display:none!important} of their own) */
    + '.site-hdr .hdr-acts a[data-mig-dash][hidden],.site-hdr .site-nav a.nav-in[hidden]{display:none!important}'
    + '.mig-pop{position:fixed;z-index:9300;width:min(380px,calc(100vw - 16px));max-height:min(70vh,520px);overflow:auto;background:var(--surface,#fff);color:var(--fg,#111);border:1px solid var(--line,#e5e7eb);border-top:4px solid var(--gold,#C09300);border-radius:14px;box-shadow:0 24px 50px -20px rgba(0,0,0,.45);font-size:.88rem}'
    + '.mig-pop header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);position:sticky;top:0;background:inherit}'
    + '.mig-pop header b{font-size:.95rem}.mig-pop header button{border:0;background:none;color:var(--green,#8E0B20);font:inherit;font-weight:700;font-size:.8rem;cursor:pointer}'
    + '.mig-pop ul{list-style:none;margin:0;padding:0}.mig-pop li a,.mig-pop li button{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:start;padding:10px 12px;border:0;border-bottom:1px solid var(--line,#eee);background:none;color:inherit;font:inherit;text-decoration:none;cursor:pointer}'
    + '.mig-pop li a:hover,.mig-pop li button:hover{background:var(--sunken,#f5f5f5)}.mig-pop li.un a{background:var(--green-soft,#fbe9ec)}.mig-pop small{display:block;color:var(--muted,#666);font-size:.74rem}'
    + '.mig-pop .em{padding:18px 14px;color:var(--muted,#666);text-align:center}'
    + '.mig-dlg{position:fixed;inset:0;z-index:9400;background:rgba(10,14,22,.62);display:grid;place-items:center;padding:16px}'
    + '.mig-box{width:min(430px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#fff);color:var(--fg,#111);border-radius:18px;border-top:5px solid var(--gold,#C09300);padding:22px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6);position:relative}'
    + '.mig-box h2{font-size:1.25rem;font-weight:800;margin:0}.mig-box p{margin:0;color:var(--muted,#555);font-size:.9rem;line-height:1.8}'
    + '.mig-box .x{position:absolute;top:8px;inset-inline-end:8px;width:34px;height:34px;border-radius:50%;border:0;background:var(--sunken,#f2f2f2);color:inherit;cursor:pointer;font-size:1rem}'
    + '.mig-box .er{color:#B42318;font-weight:700;font-size:.86rem;min-height:1.2em}.mig-box .ok{color:var(--green,#0b5d47);font-weight:700}'
    + '.mig-box .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}.mig-box .lnk{border:0;background:none;color:var(--green,#8E0B20);font:inherit;font-weight:700;font-size:.84rem;cursor:pointer;padding:0;text-decoration:underline}'
    + '.mig-box .lnk[disabled]{color:var(--muted,#888);text-decoration:none;cursor:default}.mig-box .fine{font-size:.76rem;color:var(--muted,#666)}'
    /* the sign-in card — one look for the sign-in page (/login/, like madeinsaudigate.com/login.html with our maroon for their
       dark green) and for the sign-in dialog: white card, 16px corners, soft shadow, maroon title and full-width button */
    + '.mig-card{--mig-brand:#8E0B20;--mig-btn:#8E0B20;--mig-btn-h:#6E0A18;--mig-line:#CDD3DA;--mig-err:#B00020;--mig-ok:#0B6B3A;box-sizing:border-box;background:var(--surface,#fff);color:var(--fg,#0F172A);border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.08);padding:28px;text-align:start}'
    + 'html[data-theme="dark"] .mig-card{--mig-brand:#F0566A;--mig-btn:#A50E26;--mig-btn-h:#C8102E;--mig-line:#4A3033;--mig-err:#FF8A96;--mig-ok:#7BD9A1}'
    + '.mig-box.mig-card{display:block;width:min(456px,100%);border-top:0;padding:28px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}'
    + '.mig-card .mig-t{margin:0 0 4px;color:var(--mig-brand);font-size:22px;font-weight:800;line-height:1.45}.mig-box .mig-t{padding-inline-end:40px}'
    + '.mig-card .mig-sub{margin:0 0 16px;color:var(--muted,#666);font-size:15px;line-height:1.75}'
    + '.mig-card .mig-sf{display:block;margin:0}'
    + '.mig-card .mig-sf label{display:block;margin:12px 0 4px;font-weight:700;font-size:15px;line-height:1.5;color:inherit}'
    + '.mig-card .mig-fld{display:block;width:100%;box-sizing:border-box;margin:0;padding:11px;border:1px solid var(--mig-line);border-radius:10px;background:var(--surface,#fff);color:var(--fg,#0F172A);font:inherit;font-size:15px;line-height:1.5}'
    + '.mig-card .mig-fld:focus{outline:0;border-color:var(--mig-brand);box-shadow:0 0 0 3px rgba(142,11,32,.16)}'
    + '.mig-card .mig-fld[readonly]{background:var(--sunken,#F4F5F7);color:var(--muted,#555)}.mig-card .mig-fld[aria-invalid="true"]{border-color:var(--mig-err)}'
    + '.mig-card .mig-code{font-size:22px;font-weight:800;letter-spacing:.4em;text-indent:.4em;text-align:center;direction:ltr;padding:8px 11px;font-variant-numeric:tabular-nums}'
    + '.mig-card .mig-hint{margin:6px 0 0;color:var(--muted,#666);font-size:13px;line-height:1.7;overflow-wrap:anywhere}'
    + '.mig-card .mig-go{display:block;box-sizing:border-box;width:100%;margin:18px 0 0;padding:12px;border:0;border-radius:10px;background:var(--mig-btn);color:#fff;font:inherit;font-size:16px;font-weight:700;line-height:1.5;text-align:center;text-decoration:none;cursor:pointer}'
    + '.mig-card .mig-go:hover{background:var(--mig-btn-h);color:#fff}.mig-card .mig-go[disabled]{opacity:.72;cursor:progress}'
    + '.mig-card .mig-go:focus-visible,.mig-card .mig-alt:focus-visible,.mig-card .mig-lnk:focus-visible,.mig-card a:focus-visible{outline:2px solid var(--gold,#C09300);outline-offset:2px}'
    + '.mig-card .mig-alt{display:block;box-sizing:border-box;width:100%;margin:10px 0 0;padding:11px;border:1px solid var(--mig-line);border-radius:10px;background:var(--surface,#fff);color:var(--mig-brand);font:inherit;font-size:15px;font-weight:700;line-height:1.5;text-align:center;text-decoration:none;cursor:pointer}'
    + '.mig-card .mig-alt:hover{border-color:var(--mig-brand)}.mig-card .mig-alt[disabled]{opacity:.65;cursor:progress}'
    /* the error / status lines sit right under the field of the step (visible above a phone keyboard); empty, they take no room */
    + '.mig-card .mig-er{margin:8px 0 0;color:var(--mig-err);font-weight:700;font-size:14px;line-height:1.6;scroll-margin:12px 0}'
    + '.mig-card .mig-ok{margin:8px 0 0;color:var(--mig-ok);font-weight:700;font-size:14px;line-height:1.6}'
    + '.mig-card .mig-er:empty,.mig-card .mig-ok:empty{margin:0;min-height:0}'
    + '.mig-card .mig-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;margin-top:14px}'
    + '.mig-card .mig-lnk{border:0;background:none;padding:2px 0;margin:0;color:var(--mig-brand);font:inherit;font-size:14px;font-weight:700;text-decoration:underline;cursor:pointer}'
    + '.mig-card .mig-lnk[disabled]{color:var(--muted,#777);text-decoration:none;cursor:default}'
    + '.mig-card .mig-fine{margin:14px 0 0;color:var(--muted,#666);font-size:12px;line-height:1.7}.mig-card .mig-fine a{color:var(--mig-brand);text-decoration:underline}'
    /* while the sign-in dialog is open (html.mig-modal) Janna's standing figure, hint and bubble (data/janna-welcome.js, z-index above
       this dialog) are hidden: on small phones they stood over the card and took the taps meant for «غيّر البريد» */
    + 'html.mig-modal .jw-st,html.mig-modal .jw-hint,html.mig-modal .jw-sb,html.mig-modal .jw-fig,html.mig-modal .jw-card{visibility:hidden!important}'
    + '.mig-fbtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--fg,#111);border-radius:99px;padding:4px 12px;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer;vertical-align:middle;line-height:1.6}'
    + '.mig-fbtn[aria-pressed=true]{background:var(--gold,#C09300);border-color:var(--gold,#C09300);color:#1A1204}.mig-fbtn:hover{border-color:var(--gold,#C09300)}'
    + '.phero .mig-fbtn-auto{margin-top:8px}.phero .mig-fbtn{background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.4)}.phero .mig-fbtn[aria-pressed=true]{background:var(--gold,#C09300);border-color:var(--gold,#C09300);color:#1A1204}'
    + '.mig-fbtn[data-follow-icon]{width:38px;height:38px;padding:0;justify-content:center;font-size:1.05rem;border-radius:50%}'
    + '.mig-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}.mig-tl li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;position:relative;padding-bottom:14px}'
    + '.mig-tl li::before{content:"";position:absolute;top:26px;bottom:0;inset-inline-start:13px;width:2px;background:var(--line,#ddd)}.mig-tl li:last-child::before{display:none}'
    + '.mig-tl .d{width:28px;height:28px;border-radius:50%;background:var(--green,#0b5d47);color:#fff;display:grid;place-items:center;font-size:.8rem}.mig-tl li.q .d{background:var(--gold,#C09300);color:#1A1204}.mig-tl li.w .d{background:var(--sunken,#eee);color:var(--fg,#111)}'
    + '.mig-tl b{display:block;font-size:.92rem}.mig-tl small{color:var(--muted,#666);font-size:.76rem}.mig-tl p{margin:2px 0 0;font-size:.86rem;white-space:pre-line;overflow-wrap:anywhere}'
    + '.mig-st{display:inline-block;border-radius:99px;padding:1px 10px;font-size:.76rem;font-weight:800;background:var(--sunken,#eee);color:var(--fg,#111)}.mig-st.s-ok{background:#E3F4EA;color:#0b5d47}.mig-st.s-q{background:#FFF4D6;color:#7A5A00}.mig-st.s-w{background:#FDECEC;color:#B42318}'
    + '.mig-off{border:1px dashed var(--line,#ccc);background:var(--sunken,#f7f7f7);border-radius:12px;padding:12px 14px;color:var(--fg,#111);font-weight:700;font-size:.9rem}'
    + '@media (prefers-reduced-motion:reduce){.mig-box,.mig-pop{animation:none!important}}';
  function addCSS() { if (document.getElementById("mig-api-css")) return; var s = document.createElement("style"); s.id = "mig-api-css"; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  addCSS();

  /* ---------- shared UI pieces: status labels, inquiry timeline, dates ---------- */
  function fDate(s, withTime) {
    if (!s) return ""; var d = new Date(s); if (isNaN(d)) return String(s);
    var o = { day: "numeric", month: "short", year: "numeric" }; if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
    try { return new Intl.DateTimeFormat(EN() ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", o).format(d); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  /* status → [ar, en, class]. Request statuses (server): received · routed · no_match · in_progress · replied · recorded · closed · blocked.
     in_progress = no registered factory matched, so the platform team was notified automatically and is working on it («جاري معالجة طلبك»).
     Delivery statuses of one factory (admin monitor): pending · sent · failed · replied · quoted · declined.
     Anything unknown gets a neutral label, never a raw key and never a made-up stage. */
  var STATUS = {
    received: ["تم الاستلام", "Received", ""], "new": ["تم الاستلام", "Received", ""],
    routed: ["اتبعت للمصانع", "Sent to factories", "s-ok"], forwarded: ["اتبعت للمصانع", "Sent to factories", "s-ok"],
    waiting: ["مستني مصنع مطابق", "Waiting for a matching factory", "s-w"], no_match: ["مستني مصنع مطابق", "Waiting for a matching factory", "s-w"], open: ["مفتوح", "Open", ""],
    in_progress: ["جاري معالجة طلبك", "We're working on your request", "s-w"], processing: ["جاري معالجة طلبك", "We're working on your request", "s-w"],
    replied: ["وصل رد", "Reply received", "s-q"], reply: ["وصل رد", "Reply received", "s-q"], quoted: ["وصل عرض سعر", "Quote received", "s-q"], quote: ["وصل عرض سعر", "Quote received", "s-q"],
    recorded: ["اتسجّل", "Recorded", "s-ok"],
    closed: ["مغلق", "Closed", ""], declined: ["اعتذار", "Declined", "s-w"], blocked: ["موقوف", "Blocked", "s-w"], spam: ["موقوف", "Blocked", "s-w"],
    pending: ["في انتظار الإرسال", "Waiting to be sent", "s-w"], sent: ["اتبعت", "Sent", "s-ok"], failed: ["الإرسال فشل (بيتعاد تلقائي)", "Sending failed (retried automatically)", "s-w"]
  };
  function statusLabel(s) { var x = STATUS[String(s || "").toLowerCase()]; return x ? T(x[0], x[1]) : (s ? T("حالة أخرى", "Other status") : ""); }
  function statusChip(s) { var x = STATUS[String(s || "").toLowerCase()]; return '<span class="mig-st ' + (x ? x[2] : "") + '"' + (x ? "" : ' title="' + esc(s) + '"') + ">" + esc(statusLabel(s)) + "</span>"; }
  /* event types (server): buyer-visible received · routed · rematched · no_match · in_progress · reply · quote · buyer_message · team_reply
     · status · closed; internal (admin monitor only) send_failed · reminder · auto_reply · resend · declined · team_notified · candidates.
     An event whose actor is "team" is a reply written by the platform team from the admin console («إحنا اللي هنرد»). */
  var EVT = {
    /* the same labels as the track page (pages.part.py) */
    in_progress: ["⏳", "جاري معالجة طلبك", "We're working on your request", "w"], processing: ["⏳", "جاري معالجة طلبك", "We're working on your request", "w"],
    team_reply: ["💬", "رد من فريق المنصة", "Reply from the platform team", "q"], team: ["💬", "رد من فريق المنصة", "Reply from the platform team", "q"],
    team_message: ["💬", "رد من فريق المنصة", "Reply from the platform team", "q"], admin_reply: ["💬", "رد من فريق المنصة", "Reply from the platform team", "q"],
    team_notified: ["🔔", "اتبلّغ فريق المنصة تلقائي", "Platform team notified automatically", ""], admin_notified: ["🔔", "اتبلّغ فريق المنصة تلقائي", "Platform team notified automatically", ""], needs_team: ["🔔", "اتبلّغ فريق المنصة تلقائي", "Platform team notified automatically", ""],
    candidates: ["🔎", "بحث تلقائي عن مصانع مرشّحة", "Automatic search for candidate factories", ""], candidates_refresh: ["🔎", "تحديث المصانع المرشّحة", "Candidate factories refreshed", ""],
    received: ["📝", "تم استلام الطلب", "Request received", ""], routed: ["🏭", "اتبعت للمصانع المطابقة", "Sent to matching factories", ""], forwarded: ["🏭", "اتبعت للمصانع المطابقة", "Sent to matching factories", ""],
    rematched: ["🏭", "وصل لمصنع مطابق جديد", "Reached a newly registered matching factory", ""],
    no_match: ["⏳", "لسه مفيش مصنع مسجّل مطابق", "No registered factory matches yet", "w"], waiting: ["⏳", "مستني مصنع مطابق", "Waiting for a matching factory", "w"],
    reply: ["💬", "وصل رد من مصنع", "A factory replied", "q"], quote: ["💰", "وصل عرض سعر", "Quote received", "q"], declined: ["✋", "مصنع اعتذر", "A factory declined", "w"],
    buyer_message: ["✉️", "رسالتك للمصنع", "Your message to the factory", ""],
    recorded: ["📝", "اتسجّل طلبك", "Request recorded", ""],
    status: ["🔄", "تحديث الحالة", "Status update", ""], closed: ["✅", "الطلب اتقفل", "Request closed", ""], note: ["ℹ️", "ملاحظة", "Note", ""],
    send_failed: ["⚠️", "الإرسال فشل وبيتعاد تلقائي", "Sending failed; retried automatically", "w"], reminder: ["⏰", "تذكير تلقائي للمصنع", "Automatic reminder to the factory", ""],
    auto_reply: ["🤖", "رد آلي (خارج المكتب)", "Automatic out-of-office reply", "w"], resend: ["↻", "إعادة تشغيل الإرسال التلقائي", "Automatic sending re-run", ""]
  };
  function timeline(events) {
    events = (events || []).slice().sort(function (a, b) { return String(a.created_at || "").localeCompare(String(b.created_at || "")); });
    if (!events.length) return '<p class="muted">' + T("مفيش تحديثات لسه.", "No updates yet.") + "</p>";
    return '<ol class="mig-tl">' + events.map(function (e) {
      var ty = String(e.type || "").toLowerCase(), x = EVT[ty] || ["•", "تحديث", "Update", ""];
      /* the platform team's own reply (admin console) reads as such, whatever event type the server filed it under */
      if (String(e.actor || "").toLowerCase() === "team" && !/^(team_notified|admin_notified|needs_team|candidates|candidates_refresh|resend|in_progress|processing)$/.test(ty)) x = EVT.team_reply;
      return '<li class="' + x[3] + '"><span class="d" aria-hidden="true">' + x[0] + '</span><div><b>' + esc(T(x[1], x[2])) + "</b><small>" + esc(fDate(e.created_at, true)) + "</small>" + (e.body ? "<p dir=\"auto\">" + esc(e.body) + "</p>" : "") + "</div></li>";
    }).join("") + "</ol>";
  }
  var KINDS = { contact: ["رسالة تواصل", "Contact message"], rfq: ["طلب عرض سعر", "Request for quotation"], basket: ["طلب من السلة", "Basket request"], opp_offer: ["عرض على فرصة", "Offer on an opportunity"], lead_interest: ["اهتمام بفرصة", "Lead interest"], project_interest: ["اهتمام بمشروع", "Project interest"], entity_contact: ["تواصل مع جهة", "Entity contact"], signup: ["طلب اشتراك", "Membership application"], profile_fix: ["تصحيح بيانات", "Profile correction"] };
  function kindLabel(k) { var x = KINDS[k]; return x ? T(x[0], x[1]) : String(k || ""); }

  /* ---------- optional Cloudflare Turnstile (the Worker asks for it only when TURNSTILE_SECRET is set; the page gets a token only when a
     site key is configured: window.MIG_TURNSTILE_SITEKEY, or the meetings key) — the same widget data/mig-forms.js uses ---------- */
  function human() {
    var key = String(window.MIG_TURNSTILE_SITEKEY || window.MEETINGS_TURNSTILE_SITEKEY || "");
    if (!key) return Promise.resolve("");
    return new Promise(function (res) {
      var box = null, fin = function (t) { if (fin.d) return; fin.d = 1; if (box) setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 400); res(t || ""); };
      setTimeout(fin, 20000);
      var go = function () {
        try {
          box = document.createElement("div"); box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9500"; document.body.appendChild(box);
          window.turnstile.render(box, { sitekey: key, appearance: "interaction-only", language: EN() ? "en" : "ar", callback: fin, "error-callback": function () { fin(""); }, "expired-callback": function () { fin(""); } });
        } catch (e) { fin(""); }
      };
      if (window.turnstile) go();
      else { var sc = document.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.onload = go; sc.onerror = function () { fin(""); }; document.head.appendChild(sc); }
    });
  }
  function askCode(email) {
    return human().then(function (tk) { var b = { email: email, lang: EN() ? "en" : "ar" }; if (tk) b.turnstile = tk; return request("/auth/request", { method: "POST", body: b, auth: false }); });
  }

  /* ---------- the e-mail-code sign-in form (owner decision 2: a one-time 6-digit code by e-mail, no passwords) ----------
     ONE component for the sign-in page (/login/, /en/login/ — signin.part.py) and the sign-in dialog below, so both look and read
     the same: step 1 the e-mail → «ابعتلي كود الدخول» (POST /auth/request — the server answers the same for any address, so no
     form ever says whether an address is registered); step 2 on the same card: the e-mail (read-only, «غيّر البريد») and «كود الدخول»
     (one-time-code autofill, numeric keyboard, the whole code pasted at once, 60 s resend timer) → «دخول» (POST /auth/verify).
     Errors are announced (role=alert) right under the field of the step (and scrolled into view, so a phone keyboard never hides
     them), Enter submits, the button is disabled while a request is on its way and focus moves to the field of the current step.
     A code that was asked for keeps step 2 for its 10 minutes in this tab (sessionStorage "mig-sgn" = {email, at}: never the code),
     so a reload while the visitor copies the code from the mail app does not ask for a new one (which would cancel the first:
     worker/src/auth.js only accepts the newest code); «غيّر البريد» and a sign-in end it.
     o = {email, note (a status line on step 1), autofocus (default true), fine (privacy line, default true), after (false: no follows /
     notification poll / old-data import here — the page the visitor goes to next does them), onDone(user, answer)}
     → {step(), focus(), reset(note, email), destroy()} */
  var SFN = 0, RXM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function asciiDigits(s) { return String(s == null ? "" : s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 1776); }); }
  /* a pasted code: the first run of exactly 6 digits («123456», the whole e-mail text), else «123 456» / «123-456», else the first 6 digits */
  function pastedCode(t) {
    var s = asciiDigits(t), m = /(?:^|\D)(\d{6})(?!\d)/.exec(s);
    if (m) return m[1];
    m = /(?:^|\D)(\d{3})[\s\u00a0.\-\u2013]?(\d{3})(?!\d)/.exec(s);
    return m ? m[1] + m[2] : s.replace(/\D/g, "").slice(0, 6);
  }
  function attemptsText(n) { return EN() ? (n === 1 ? "1 attempt" : n + " attempts") : (n === 1 ? "محاولة واحدة" : n === 2 ? "محاولتين" : n + " محاولات"); }
  /* a refused code: wrong / expired (with the attempts the server says are left), burnt, locked, rate-limited, offline */
  function codeErr(x) {
    var c = String((x && x.code) || ""), s = x && x.status, left = x && x.body ? x.body.attempts_left : undefined;
    if (c === "offline" || c === "invalid_email" || c === "too_many_attempts" || c === "locked" || c === "rate_limited" || s === 429) return errText(x);
    if (c === "invalid_code" || c === "bad_code" || c === "expired" || s === 400 || s === 401) {
      if (typeof left === "number" && left <= 0) return errText({ code: "too_many_attempts" });
      return T("الكود غلط أو انتهت صلاحيته. ", "The code is wrong or has expired. ") + (typeof left === "number" && left > 0 ? T("فاضل لك " + attemptsText(left) + "، أو اطلب كود جديد.", attemptsText(left) + " left, or ask for a new one.") : T("اطلب كود جديد.", "Ask for a new one."));
    }
    return errText(x);
  }
  /* a session the server issued (POST /auth/verify) becomes this browser's session */
  function session(j, after) {
    ls(TK, j.token); CONFIRMED = true; setMe(j.user, 0); MEP = null; paintHeader();
    fire("mig:login", { user: j.user, u: j.user.id }); fire("mig:me", { user: j.user, unread: 0 });
    if (after === false) return;
    me(true).catch(function () {}); startPoll(); setTimeout(migrate, 400); loadFollows(true);
  }
  /* a code asked for in this tab: {email, at} for its 10 minutes (sessionStorage, never the code itself) */
  var PK = "mig-sgn", CODE_MS = 10 * 60000, RESEND_S = 60;
  function pend(v) {
    try {
      if (v === undefined) { var j = JSON.parse(sessionStorage.getItem(PK) || "null"); return j && typeof j.email === "string" && typeof j.at === "number" ? j : null; }
      if (v === null) sessionStorage.removeItem(PK); else sessionStorage.setItem(PK, JSON.stringify(v));
    } catch (e) {}
    return null;
  }
  function signinForm(host, o) {
    o = o || {};
    var P = "migS" + (++SFN), email = String(o.email || "").trim(), cdT = 0, cd = 0, gone = false, step = "";
    function el(k) { return document.getElementById(P + k); }
    function say(text, ok) { var e = el("er"), s = el("st"); if (e) e.textContent = ok ? "" : String(text || ""); if (s) s.textContent = ok ? String(text || "") : ""; }
    /* the message sits right under the field; it is also brought into view (a phone keyboard covers the lower half of the screen) */
    function shown(e) { if (e && e.scrollIntoView && "scrollBehavior" in document.documentElement.style) try { e.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x) {} }
    function bad(text, inp) { say(text); if (inp) { inp.setAttribute("aria-invalid", "true"); try { inp.focus(); } catch (e) {} } shown(el("er")); }
    function busy(f, on, label) {
      var b = f.querySelector(".mig-go"); if (!b) return;
      if (on) { if (!b.hasAttribute("data-l")) b.setAttribute("data-l", b.textContent); b.textContent = label; } else if (b.hasAttribute("data-l")) { b.textContent = b.getAttribute("data-l"); b.removeAttribute("data-l"); }
      b.disabled = !!on; f.setAttribute("aria-busy", on ? "true" : "false");
    }
    function focusLater(inp, sel) { setTimeout(function () { if (gone || !inp.isConnected) return; try { inp.focus(); if (sel && inp.select) inp.select(); } catch (e) {} }, 30); }
    function fine() {
      return o.fine === false ? "" : '<p class="mig-fine">' + T('بتسجيل الدخول بتوافق على <a href="/legal/#privacy">سياسة الخصوصية</a>. بنستخدم بريدك للدخول والإشعارات اللي تختارها بس، وتقدر توقفها في أي وقت.', 'By signing in you accept the <a href="/legal/#privacy">privacy policy</a>. We use your e-mail only for sign-in and the notifications you choose, and you can stop them at any time.') + "</p>";
    }
    /* the error (role=alert) and status lines: placed right after the field of the step */
    function status() { return '<p class="mig-er" id="' + P + 'er" role="alert"></p><p class="mig-ok" id="' + P + 'st" role="status"></p>'; }
    function lbl(k, ar, en) { return '<label for="' + P + k + '">' + esc(T(ar, en)) + "</label>"; }
    function stepEmail(note, focus) {
      clearInterval(cdT); step = "email";
      host.innerHTML = '<form class="mig-sf" novalidate data-step="email">' + lbl("em", "البريد الإلكتروني", "E-mail")
        + '<input class="mig-fld" id="' + P + 'em" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" dir="ltr" required aria-describedby="' + P + 'h ' + P + 'er" value="' + esc(email) + '">'
        + status()
        + '<p class="mig-hint" id="' + P + 'h">' + esc(T("هنبعتلك كود من 6 أرقام على بريدك. مفيش كلمة سر.", "We'll e-mail you a 6-digit code. No password needed.")) + "</p>"
        + '<button class="mig-go" type="submit">' + esc(T("ابعتلي كود الدخول", "Send me a sign-in code")) + "</button>" + fine() + "</form>";
      var f = host.querySelector("form"), inp = el("em");
      if (note) say(note, true);
      inp.addEventListener("input", function () { inp.removeAttribute("aria-invalid"); });
      f.addEventListener("submit", function (e) {
        e.preventDefault(); if (f.getAttribute("aria-busy") === "true") return;
        var v = inp.value.trim(); say("");
        if (!RXM.test(v)) { bad(T("اكتب بريد إلكتروني صحيح.", "Enter a valid e-mail address."), inp); return; }
        email = v; busy(f, true, T("جاري إرسال الكود…", "Sending the code…"));
        askCode(v).then(function (j) {
          if (!j || j.ok !== true) throw err("bad_response", T("الخادم مارجّعش تأكيد.", "The server did not confirm."));
          pend({ email: v, at: Date.now() });
          if (!gone) stepCode();
        }).catch(function (x) { if (gone) return; busy(f, false); bad(errText(x), inp); });
      });
      if (focus !== false) focusLater(inp, !!email);
    }
    /* the resend button counts down from 60 s (less when step 2 comes back after a reload) */
    function tick(n) {
      clearInterval(cdT); cd = typeof n === "number" ? Math.max(0, Math.min(RESEND_S, Math.ceil(n))) : RESEND_S;
      var up = function () { var b = el("ag"); if (!b || gone) { clearInterval(cdT); return; } b.disabled = cd > 0; b.textContent = cd > 0 ? T("إعادة الإرسال بعد " + cd + " ث", "Resend in " + cd + "s") : T("ابعت الكود تاني", "Resend the code"); };
      up(); if (cd > 0) cdT = setInterval(function () { cd--; up(); if (cd <= 0) clearInterval(cdT); }, 1000);
    }
    function stepCode(wait, focus) {
      step = "code";
      host.innerHTML = '<form class="mig-sf" novalidate data-step="code">' + lbl("em", "البريد الإلكتروني", "E-mail")
        + '<input class="mig-fld" id="' + P + 'em" type="email" name="email" autocomplete="email" dir="ltr" readonly value="' + esc(email) + '">'
        + lbl("cd", "كود الدخول", "Sign-in code")
        + '<input class="mig-fld mig-code" id="' + P + 'cd" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="40" required aria-describedby="' + P + 'h ' + P + 'er">'
        + status()
        + '<p class="mig-hint" id="' + P + 'h">' + esc(T("بعتنالك كود من 6 أرقام على البريد ده، صالح 10 دقايق. مالقيتوش؟ بص في الرسائل غير المرغوب فيها (Spam).", "We e-mailed you a 6-digit code, valid for 10 minutes. Can't find it? Check your spam folder.")) + "</p>"
        + '<button class="mig-go" type="submit">' + esc(T("دخول", "Sign in")) + "</button>"
        + '<div class="mig-row"><button type="button" class="mig-lnk" data-k="back">' + esc(T("غيّر البريد", "Change e-mail")) + '</button><button type="button" class="mig-lnk" id="' + P + 'ag" data-k="again"></button></div></form>';
      var f = host.querySelector("form"), inp = el("cd"), again = el("ag");
      function norm() { var v = asciiDigits(inp.value).replace(/\D/g, "").slice(0, 6); if (v !== inp.value) inp.value = v; return v; }
      function go() { if (f.getAttribute("aria-busy") === "true") return; if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit", { cancelable: true })); }
      tick(wait);
      /* the whole code pasted at once (also «123 456» or the e-mail's text): the 6 digits, then sign in */
      inp.addEventListener("paste", function (e) {
        var t = ""; try { t = (e.clipboardData || window.clipboardData).getData("text") || ""; } catch (x) {}
        if (!t) return; e.preventDefault(); inp.value = pastedCode(t); inp.removeAttribute("aria-invalid"); if (inp.value.length === 6) go();
      });
      inp.addEventListener("input", function () { inp.removeAttribute("aria-invalid"); if (norm().length === 6) go(); });
      f.querySelector('[data-k="back"]').onclick = function () { pend(null); stepEmail(); };
      again.onclick = function () {
        if (again.disabled) return; again.disabled = true; say("");
        askCode(email).then(function (j) {
          if (!j || j.ok !== true) throw err("bad_response", T("الخادم مارجّعش تأكيد.", "The server did not confirm."));
          pend({ email: email, at: Date.now() });
          if (gone) return; inp.value = ""; tick(); say(T("بعتنا كود جديد على بريدك؛ استخدم أحدث كود وصلك (القديم مابقاش شغّال).", "A new code is on its way; use the newest one (the previous code no longer works)."), true); focusLater(inp);
        }).catch(function (x) { if (gone) return; again.disabled = false; bad(errText(x)); });
      };
      f.addEventListener("submit", function (e) {
        e.preventDefault(); if (f.getAttribute("aria-busy") === "true") return;
        var v = norm(); say("");
        if (!/^\d{6}$/.test(v)) { bad(T("الكود 6 أرقام.", "The code has 6 digits."), inp); return; }
        busy(f, true, T("جاري التأكد من الكود…", "Checking the code…"));
        request("/auth/verify", { method: "POST", body: { email: email, code: v }, auth: false }).then(function (j) {
          if (!j || !j.token || !j.user) throw err("bad_response", T("الخادم مارجّعش جلسة دخول.", "The server did not return a session."));
          return j;
        }).then(function (j) {
          /* signed in even when the dialog was closed meanwhile: the server already used the code */
          pend(null); clearInterval(cdT); session(j, o.after); if (gone) return;
          step = "done"; busy(f, true, T("دخلت بنجاح ✓", "Signed in ✓"));
          if (o.onDone) o.onDone(j.user, j);
        }, function (x) { if (gone) return; busy(f, false); bad(codeErr(x), inp); try { inp.select(); } catch (e2) {} });
      });
      if (focus !== false) focusLater(inp);
    }
    /* a code this tab asked for less than 10 minutes ago (for this address, or when none is given): back on step 2, the resend
       timer where it was — asking again would cancel the code the visitor may be copying right now */
    var pd = pend(), age = pd ? Date.now() - pd.at : -1;
    if (pd && !(age >= 0 && age < CODE_MS && RXM.test(pd.email))) { if (!email && RXM.test(pd.email)) email = pd.email; pend(null); pd = null; }
    if (pd && !o.note && (!email || email.toLowerCase() === pd.email.toLowerCase())) { email = pd.email; stepCode(RESEND_S - age / 1000, o.autofocus); }
    else stepEmail(o.note, o.autofocus);
    return {
      step: function () { return step; },
      focus: function () { var i = host.querySelector(step === "code" ? ".mig-code" : ".mig-fld"); if (i) try { i.focus(); } catch (e) {} },
      reset: function (note, em) { if (em != null) email = String(em); pend(null); stepEmail(note); },
      destroy: function () { gone = true; clearInterval(cdT); }
    };
  }

  /* ---------- sign-in dialog (gated actions: follow, dashboard, advisor …): the same card and form as the sign-in page ---------- */
  var DLG = null;
  function trap(box, e) {
    if (e.key !== "Tab") return;
    var f = [].slice.call(box.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],select,textarea')).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return; var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  function open(opts) {
    opts = opts || {};
    if (DLG) { var i0 = DLG.querySelector("input:not([readonly])"); if (i0) i0.focus(); return DLG.__p; }
    var ret = document.activeElement, resolveF, rejectF, F = null;
    var p = new Promise(function (a, b) { resolveF = a; rejectF = b; });
    var d = document.createElement("div"); d.className = "mig-dlg"; d.setAttribute("dir", EN() ? "ltr" : "rtl"); d.setAttribute("translate", "no");
    /* title «الدخول للمنصة» (buyers sign in here too); the line under it is the caller's reason, else the card's «منصة صنع في مصر» */
    d.innerHTML = '<div class="mig-box mig-card" role="dialog" aria-modal="true" aria-labelledby="migLT" aria-describedby="migLD"><button type="button" class="x" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button>'
      + '<h2 class="mig-t" id="migLT">' + esc(opts.title || T("الدخول للمنصة", "Sign in to the platform")) + '</h2><p class="mig-sub" id="migLD">' + esc(opts.why || T("منصة صنع في مصر", "Made in Egypt Gate")) + '</p><div class="mig-host"></div></div>';
    DLG = d; d.__p = p; document.body.appendChild(d); document.documentElement.style.overflow = "hidden";
    /* Janna (data/janna-welcome.js) steps out while the dialog is open: her layers hide (html.mig-modal, CSS above) and a talk she
       started stops, so nothing of hers covers the card or takes its taps on small phones */
    document.documentElement.classList.add("mig-modal");
    try { if (window.JANNA_WELCOME && JANNA_WELCOME.close) JANNA_WELCOME.close(); } catch (e) {}
    var box = d.querySelector(".mig-box");
    function close(ok, user) {
      if (!DLG) return; DLG = null; if (F) F.destroy(); d.remove(); document.documentElement.style.overflow = ""; document.documentElement.classList.remove("mig-modal");
      try { if (ret && ret.focus) ret.focus(); } catch (e) {}
      if (ok) resolveF(user); else rejectF(err("cancelled", "cancelled"));
    }
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest(".x")) close(false); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(false); } else trap(box, e); });
    F = signinForm(d.querySelector(".mig-host"), { email: opts.email || "", onDone: function (u) { close(true, u); toast(T("أهلاً بيك، دخلت بنجاح.", "Welcome, you are signed in.")); } });
    return p;
  }
  /* the sign-in page with the page the visitor is on as ?next= (they come back to it after the code); never the sign-in page itself,
     and never the home page (/, /en/): from there the factory goes on to its dashboard after the code, as on the Saudi sign-in page.
     The same rule is in site.py (_login_href), seo_build.part.py (header_html) and signin.part.py (safeNext). */
  function loginUrl(next) {
    var n = next === undefined ? location.pathname + location.search + location.hash : String(next || "");
    if (/^\/(?:en\/)?login(?:\/|\.html)?(?:[?#]|$)/i.test(n) || /^\/(?:en\/?)?(?:index\.html|home\.html)?(?:[?#]|$)/i.test(n)) n = "";
    return (EN() ? "/en/login/" : "/login/") + (n ? "?next=" + encodeURIComponent(n) : "");
  }
  /* run fn now when signed in, or after signing in (never pretends) */
  function needLogin(why) { return token() ? Promise.resolve(ME) : open({ why: why }); }

  /* ---------- inquiries, tracking ---------- */
  function inquiry(o) {
    o = o || {}; if (!o.lang) o.lang = EN() ? "en" : "ar";
    if (!o.source) o.source = "form";
    var c = window.MIG_CTX; if (c && !o.target_type) { o.target_type = c.type; o.target_id = c.id; o.target_name = o.target_name || c.title; }
    return request("/inquiries", { method: "POST", body: o }).then(function (j) {
      if (!j || !j.ref) throw err("bad_response", T("الخادم مارجّعش رقم طلب، فالطلب ماتسجّلش.", "The server returned no request number, so the request was not recorded."));
      try { var mine = jget("mig-my-refs", []); mine.unshift({ ref: j.ref, at: new Date().toISOString(), kind: o.kind }); ls("mig-my-refs", JSON.stringify(mine.slice(0, 30))); } catch (e) {}
      if (o.target_type && o.target_id) ev(o.target_type, o.target_id, "inquiry");
      return j;
    });
  }
  /* the timeline bodies come back in the page language (?lang=en → the English text the server stored with each event) */
  function track(ref, last4, t) {
    var q = [];
    if (t) q.push("t=" + encodeURIComponent(String(t))); else if (last4) q.push("last4=" + encodeURIComponent(String(last4).trim()));
    if (EN()) q.push("lang=en");
    return request("/inquiries/" + encodeURIComponent(String(ref || "").trim().toUpperCase()) + (q.length ? "?" + q.join("&") : ""), { auth: !!token() });
  }

  /* ---------- follows ---------- */
  var FOL = null, FOLP = null;
  function fkey(k, id) { return String(k) + "|" + String(id); }
  function loadFollows(force) {
    if (!token()) { FOL = null; return Promise.resolve([]); }
    if (FOLP && !force) return FOLP;
    FOLP = request("/me/follows").then(function (j) { FOL = {}; (j.items || []).forEach(function (x) { FOL[fkey(x.kind, x.ref_id)] = x; }); paintFollows(); return j.items || []; }, function (e) { FOLP = null; throw e; });
    return FOLP;
  }
  function follow(kind, id, label, url) {
    return needLogin(T("سجّل دخولك بالبريد عشان المتابعة تتحفظ في حسابك وتوصلك التنبيهات على أي جهاز.", "Sign in with your e-mail so the follow is saved to your account and alerts reach you on any device.")).then(function () {
      return request("/me/follows", { method: "POST", body: { kind: kind, ref_id: String(id), label: label || "", url: url || here() } });
    }).then(function (j) { if (!j || (j.ok !== true && !j.items && !j.id)) throw err("bad_response", T("الخادم ماأكدش الحفظ.", "The server did not confirm.")); FOL = FOL || {}; FOL[fkey(kind, id)] = { kind: kind, ref_id: String(id), label: label, url: url }; paintFollows(); return j; });
  }
  function unfollow(kind, id) {
    return request("/me/follows", { method: "DELETE", body: { kind: kind, ref_id: String(id) } }).then(function (j) { if (FOL) delete FOL[fkey(kind, id)]; paintFollows(); return j; });
  }
  function follows() { return request("/me/follows").then(function (j) { FOL = {}; (j.items || []).forEach(function (x) { FOL[fkey(x.kind, x.ref_id)] = x; }); paintFollows(); return j.items || []; }); }
  function isFollowing(k, id) { return !!(FOL && FOL[fkey(k, id)]); }
  /* what a follow really brings (worker/src/digest.js): a daily digest of NEW items for sectors, governorates, areas, entities, stores and
     saved searches; deadline reminders (7 days / 1 day) for tenders, RFQs and events. Other kinds are kept in «متابعاتي» only. */
  var ALERTK = /^(sector|governorate|region|city|entity|agency|store|search|tender|rfq|event)$/;
  function followSaved(k) {
    return ALERTK.test(String(k)) ? T("اتحفظت في «متابعاتي». هيوصلك تنبيه لما يظهر جديد حقيقي أو يقرب ميعاد إغلاق.", "Saved to “My follows”. You'll be alerted when something really new appears or a deadline approaches.")
      : T("اتحفظت في «متابعاتي» وتلاقيها في لوحتك على أي جهاز.", "Saved to “My follows”; you'll find it in your dashboard on any device.");
  }

  var FKIND = { factory: ["تابع المصنع", "Follow factory"], company: ["تابع الشركة", "Follow company"], tender: ["تابع المناقصة", "Follow tender"], rfq: ["تابع الطلب", "Follow request"], project: ["تابع المشروع", "Follow project"], offer: ["تابع العرض", "Follow offer"], entity: ["تابع الجهة", "Follow entity"], agency: ["تابع الجهة", "Follow entity"], region: ["تابع المحافظة", "Follow governorate"], governorate: ["تابع المحافظة", "Follow governorate"], city: ["تابع المنطقة", "Follow area"], sector: ["تابع القطاع", "Follow sector"], store: ["تابع المتجر", "Follow store"], event: ["تابع المعرض", "Follow event"], search: ["تابع البحث", "Follow this search"] };
  function fLabel(k, on, off) { if (on) return "★ " + T("بتتابعه", "Following"); if (off) return "☆ " + off; var x = FKIND[k] || ["تابع", "Follow"]; return "☆ " + T(x[0], x[1]); }
  /* every follow control looks and reads the same (one ☆ pill): its text always says whether it is on, so a second click never
     unfollows silently. data-follow-text = the "follow" wording for this item; data-follow-icon = an icon-only control (☆ / ★ + label). */
  function paintFollows() {
    [].forEach.call(document.querySelectorAll("[data-follow-kind][data-follow-id]"), function (b) {
      var k = b.getAttribute("data-follow-kind"), id = b.getAttribute("data-follow-id"), on = isFollowing(k, id), lab = fLabel(k, on, b.getAttribute("data-follow-text"));
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (!b.classList.contains("mig-fbtn")) b.classList.add("mig-fbtn");
      if (b.hasAttribute("data-follow-icon")) { b.textContent = on ? "★" : "☆"; b.setAttribute("aria-label", lab.slice(2)); b.setAttribute("title", lab.slice(2)); }
      else b.textContent = lab;
    });
  }
  function followCtx(c) {
    if (!c || c.follow === false) return null;
    if (c.follow && typeof c.follow === "object") { var f = c.follow; return f.kind && f.id != null && f.id !== "" ? { type: f.kind, id: f.id, title: f.label || c.title, url: f.url || c.url } : null; }
    return c.type && c.id != null && c.id !== "" ? c : null;
  }
  function attachFollow() {
    var c0 = window.MIG_CTX, old = document.querySelector(".mig-fbtn-auto");
    /* MIG_CTX.follow === false: the platform has no alerts for this kind of page yet, so no follow button is offered;
       MIG_CTX.follow = {kind, id, label}: what this page's follow means (e.g. a winning company → a saved search on its name) */
    var c = followCtx(c0);
    if (!c) { if (old) old.remove(); return; }
    if (old && old.getAttribute("data-follow-kind") === String(c.type) && old.getAttribute("data-follow-id") === String(c.id)) return;
    if (old) old.remove();
    /* a page that placed its own follow control for this item keeps it */
    var mine = null; try { mine = document.querySelector('[data-follow-kind="' + String(c.type).replace(/["\\]/g, "") + '"][data-follow-id="' + String(c.id).replace(/["\\]/g, "") + '"]'); } catch (e) {}
    if (mine) { paintFollows(); return; }
    var h = document.querySelector(".phero h1") || document.querySelector("main h1") || document.querySelector("h1"); if (!h) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "mig-fbtn mig-fbtn-auto"; b.setAttribute("data-follow-kind", c.type); b.setAttribute("data-follow-id", c.id);
    if (c.title) b.setAttribute("data-follow-label", c.title); if (c.url) b.setAttribute("data-follow-url", c.url); b.setAttribute("translate", "no");
    var wrap = document.createElement("div"); wrap.className = "mig-fwrap"; wrap.appendChild(b); h.parentNode.insertBefore(wrap, h.nextSibling);
    paintFollows();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-follow-kind][data-follow-id]"); if (!b) return;
    e.preventDefault(); if (b.__busy) return; b.__busy = true;
    var k = b.getAttribute("data-follow-kind"), id = b.getAttribute("data-follow-id"), lb = b.getAttribute("data-follow-label") || (window.MIG_CTX && MIG_CTX.id == id ? MIG_CTX.title : "") || document.title, u = b.getAttribute("data-follow-url") || here();
    var p = isFollowing(k, id) ? unfollow(k, id).then(function () { toast(T("وقّفنا المتابعة.", "Unfollowed.")); }) : follow(k, id, lb, u).then(function () { toast(followSaved(k)); });
    p.catch(function (x) { if (x && x.code !== "cancelled") toast(errText(x)); }).then(function () { b.__busy = false; });
  });

  /* ---------- notifications ---------- */
  var NOTIF = { items: [], unread: 0 }, pollT = 0;
  function notifications() { return request("/me/notifications" + (EN() ? "?lang=en" : "")).then(function (j) { NOTIF.items = j.items || []; NOTIF.unread = +j.unread || 0; UNREAD = NOTIF.unread; fire("mig:notif", { unread: UNREAD }); paintBadge(); return j; }); }
  function readNotifs(o) { return request("/me/notifications/read", { method: "POST", body: o || { all: true } }).then(function (j) { return notifications().then(function () { return j; }); }); }
  function poll() { if (!token() || document.hidden || onPage("signin")) return; notifications().catch(function () {}); }
  function startPoll() { clearInterval(pollT); if (!token()) return; pollT = setInterval(poll, 60000); }
  window.addEventListener("focus", function () { if (token()) poll(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && token()) poll(); });

  /* ---------- honest first-party metrics (aggregated per day by the Worker; no raw IP stored) ---------- */
  var SENT = {}, EVK = /^(factory|company|tender|rfq|project|offer|entity|agency|region|city|store|event|news|product|page|award)$/;
  function ev(kind, ref, metric) {
    if (!kind || ref == null || ref === "" || !metric || !EVK.test(String(kind))) return;
    var k = kind + "|" + ref + "|" + metric; if (metric === "view" && SENT[k]) return; SENT[k] = 1;
    var body = JSON.stringify({ kind: String(kind), ref: String(ref), metric: metric });
    try { if (navigator.sendBeacon && navigator.sendBeacon(BASE + "/ev", new Blob([body], { type: "application/json" }))) return; } catch (e) {}
    try { fetch(BASE + "/ev", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function viewBeacon() { var c = window.MIG_CTX; if (c && c.type && c.id != null && c.id !== "") ev(c.type, c.id, "view"); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    var href = a.getAttribute("href") || "", m = /wa\.me|api\.whatsapp\.com|whatsapp:/i.test(href) ? "wa_click" : (/^https?:\/\//i.test(href) && a.hostname && a.hostname !== location.hostname ? "web_click" : "");
    if (!m) return;
    var host = a.closest("[data-ev-kind][data-ev-ref]"), c = window.MIG_CTX;
    if (host) ev(host.getAttribute("data-ev-kind"), host.getAttribute("data-ev-ref"), m); else if (c && c.type && c.id != null && c.id !== "") ev(c.type, c.id, m);
  }, true);

  /* ---------- header: account chip + bell ---------- */
  var HX = null, POP = null;
  function initial(u) { var n = (u && (u.name || u.company || u.email)) || "?"; return n.trim().charAt(0).toUpperCase(); }
  /* the title is stored in Arabic (dashboard «اللقب»); English pages show its English form, as Bassem does */
  var TTL_EN = { "أستاذ": "Mr.", "استاذ": "Mr.", "دكتور": "Dr.", "د.": "Dr.", "مهندس": "Eng.", "م.": "Eng.", "مستشار": "Counsellor", "لواء": "Gen.", "مدام": "Mrs.", "آنسة": "Ms.", "انسة": "Ms.", "الأستاذ": "Mr.", "الدكتور": "Dr.", "المهندس": "Eng.", "دكتورة": "Dr.", "مهندسة": "Eng.", "أستاذة": "Ms." };
  function titleOf(u) { var t = String((u && u.title) || "").trim(); if (!t) return ""; return EN() ? (TTL_EN[t] || (/[؀-ۿ]/.test(t) ? "" : t)) : t; }
  function shortName(u) { if (!u) return ""; var t = titleOf(u); return ((t ? t + " " : "") + (u.name || "")).trim() || u.company || (u.email || "").split("@")[0]; }
  function paintBadge() { if (!HX) return; var n = HX.querySelector(".mig-bell .n"); if (!n) return; n.hidden = !UNREAD; n.textContent = UNREAD > 99 ? "99+" : String(UNREAD); var b = HX.querySelector(".mig-bell"); b.setAttribute("aria-label", T("الإشعارات", "Notifications") + (UNREAD ? " (" + UNREAD + " " + T("جديد", "new") + ")" : "")); }
  function paintHeader() {
    var acts = document.querySelector(".site-hdr .hdr-acts"); if (!acts) return;
    if (!HX) { HX = document.createElement("span"); HX.className = "mig-hx"; HX.setAttribute("translate", "no"); acts.insertBefore(HX, acts.firstChild); }
    var signed = !!token() && !!ME, dashA = acts.querySelector('a[data-mig-dash]') || acts.querySelector('a[href="dashboard.html"]'), regA = acts.querySelector('a[href="register.html"],a[href="/register/"],a[href="/en/register/"]');
    /* the generated SEO pages (seo_build.part.py header_html, which load this file on demand) have their own «دخول»: a.hdr-in in the
       bar (a 👤 icon up to 560px, so no second 👤 is added) and a.nav-in, the last item of the ☰ menu; signed in, both are hidden */
    var navIn = document.querySelector(".site-hdr .site-nav a.nav-in"), own = !!dashA && /(^|\s)hdr-in(\s|$)/.test(dashA.className);
    if (navIn) navIn.hidden = signed;
    if (signed) {
      HX.innerHTML = '<button type="button" class="mig-ib mig-bell" aria-haspopup="true" aria-expanded="false">🔔<span class="n" hidden></span></button><button type="button" class="mig-ac" aria-haspopup="true" aria-expanded="false" title="' + esc(shortName(ME)) + '"><i aria-hidden="true">' + esc(initial(ME)) + "</i><span>" + esc(shortName(ME)) + "</span></button>";
      HX.querySelector(".mig-ac").setAttribute("aria-label", T("حسابي: ", "My account: ") + shortName(ME));
      if (dashA) dashA.hidden = true;
      if (regA) regA.hidden = LV[planOf(ME)] >= 1;
      paintBadge();
    } else {
      if (regA) regA.hidden = false;
      /* «دخول» and its phone icon open the sign-in page (/login/, /en/login/) with this page as ?next= */
      HX.innerHTML = own ? "" : '<a class="mig-ib mig-in" href="' + esc(loginUrl()) + '" rel="nofollow" aria-label="' + esc(T("الدخول بالبريد", "Sign in with e-mail")) + '" title="' + esc(T("الدخول", "Sign in")) + '">👤</a>';
      if (navIn) navIn.setAttribute("href", loginUrl());
      if (dashA) {
        dashA.hidden = false; dashA.setAttribute("href", loginUrl());
        /* one e-mail-code sign-in for every account (buyers, factories, partners, admins): the header link says so */
        if (!dashA.getAttribute("data-mig-l")) { dashA.setAttribute("data-mig-l", "1"); dashA.setAttribute("translate", "no"); dashA.textContent = T("دخول", "Sign in"); dashA.setAttribute("title", T("الدخول بكود على البريد — لكل الحسابات", "Sign in with an e-mail code — for every account")); }
      }
    }
    HX.style.marginInlineEnd = signed ? "" : "0";
    HX.style.display = HX.firstChild ? "" : "none";   /* an empty slot would still take a gap in the bar */
  }
  function closePop() { if (!POP) return; var o = POP.__btn; POP.remove(); POP = null; if (o) { o.setAttribute("aria-expanded", "false"); } }
  function placePop(btn) {
    var r = btn.getBoundingClientRect(), w = POP.offsetWidth, x = EN() ? r.right - w : r.left;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8)); POP.style.left = x + "px"; POP.style.top = Math.min(r.bottom + 6, window.innerHeight - 120) + "px";
  }
  function showPop(btn, html) {
    closePop(); POP = document.createElement("div"); POP.className = "mig-pop"; POP.setAttribute("dir", EN() ? "ltr" : "rtl"); POP.setAttribute("translate", "no"); POP.setAttribute("role", "dialog");
    POP.innerHTML = html; POP.__btn = btn; document.body.appendChild(POP); btn.setAttribute("aria-expanded", "true"); placePop(btn);
    var f = POP.querySelector("a,button"); if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
  }
  var NIC = { inquiry: "📝", reply: "💬", quote: "💰", status: "🔄", follow: "★", digest: "📰", deadline: "⏰", meeting: "📅", advisor: "🤝", incoming: "📥", system: "ℹ️",
    inquiry_reply: "💬", inquiry_quote: "💰", inquiry_rematched: "🏭", inquiry_closed: "✅", inquiry_declined_all: "✋", inquiry_status: "🔄",
    inquiry_team_reply: "💬", team_reply: "💬", team_needed: "🔴", team: "🔴", inquiry_in_progress: "⏳" };
  function nIcon(k) { k = String(k || ""); return NIC[k] || NIC[k.split("_")[0]] || "🔔"; }
  /* notification / e-mail links: the member dashboard is dashboard.html (older rows may say dash.html) */
  function fixUrl(u) {
    u = String(u || "").trim(); if (!u) return "";
    u = u.replace(/^(https?:\/\/(www\.)?madeinegyptgate\.com)?\/?dash\.html/i, "dashboard.html").replace(/^(https?:\/\/(www\.)?madeinegyptgate\.com)?\/dashboard(\.html|\/)?(?=#|$)/i, "dashboard.html");
    /* only links back into the platform: no scheme other than http(s), no protocol-relative («//host», «/\host», «\host») and no other site
       (follow / notification URLs are stored by the server from what pages sent) */
    if (/^\s*(\/\/|\/\\|\\)/.test(u) || /[\u0000-\u001f]/.test(u)) return "";
    var sch = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    if (sch) { if (!/^https?$/i.test(sch[1])) return ""; var hm = /^https?:\/\/([^\/?#]+)/i.exec(u), hh = hm ? hm[1].toLowerCase().replace(/:\d+$/, "") : ""; if (!hh || !(/^(www\.)?madeinegyptgate\.com$/.test(hh) || hh === String(location.hostname || "").toLowerCase())) return ""; }
    /* on the dashboard itself a link to one of its tabs stays on the page (#tab), so it does not reload through /dashboard.html → /dashboard/ */
    if (onPage("dashboard") && /^dashboard\.html(#|$)/i.test(u)) return u.slice(14) || "#overview";
    return u;
  }
  /* the server writes notification titles in Arabic: English pages show the English form of the known ones (title_en when the server sends it) */
  var NT = [
    [/^تم استلام طلبك (MIG-\S+)$/, "Your request $1 was received"], [/^رد جديد على طلبك (MIG-\S+)$/, "New reply on your request $1"],
    [/^عرض سعر جديد على (MIG-\S+)$/, "New quote on $1"], [/^طلبك (MIG-\S+) وصل لمصنع جديد$/, "Your request $1 reached a new factory"],
    [/^تم إغلاق الطلب (MIG-\S+)$/, "Request $1 closed"], [/^تحديث على طلبك (MIG-\S+)$/, "Update on your request $1"],
    [/^(\d+) (?:عنصر جديد|عناصر جديدة) تطابق متابعاتك$/, "$1 new item(s) match what you follow"], [/^بكرة آخر موعد: (.+)$/, "Deadline tomorrow: $1"],
    [/^باقي 7 أيام على آخر موعد: (.+)$/, "7 days to the deadline: $1"], [/^طلب جديد (?:اتوزّع عليك|وارد)[: ]+(.+)$/, "New request routed to you: $1"]
  ];
  function nTitle(n) {
    var t = String((n && n.title) || ""); if (!EN()) return t; if (n.title_en) return String(n.title_en);
    for (var i = 0; i < NT.length; i++) if (NT[i][0].test(t)) return t.replace(NT[i][0], NT[i][1]);
    return t;
  }
  function notifHTML() {
    var it = NOTIF.items || [];
    return '<header><b>' + esc(T("الإشعارات", "Notifications")) + "</b>" + (NOTIF.unread ? '<button type="button" data-n="all">' + esc(T("علّم الكل مقروء", "Mark all read")) + "</button>" : "") + "</header>"
      + (it.length ? "<ul>" + it.slice(0, 30).map(function (n) {
        var u = fixUrl(n.url) || fixUrl(n.ref ? "dashboard.html#inquiries" : "dashboard.html#notifications");
        return '<li class="' + (n.read_at ? "" : "un") + '"><a href="' + esc(u) + '" data-nid="' + esc(n.id) + '"><span aria-hidden="true">' + nIcon(n.kind) + "</span><span><b dir=\"auto\">" + esc(nTitle(n)) + "</b><small>" + esc(fDate(n.created_at, true)) + "</small></span></a></li>";
      }).join("") + "</ul>" : '<p class="em">' + esc(T("مفيش إشعارات لسه. هتوصلك هنا ردود طلباتك وتنبيهات متابعاتك.", "No notifications yet. Replies to your requests and alerts for what you follow will appear here.")) + "</p>")
      + '<ul><li><a href="' + esc(fixUrl("dashboard.html#notifications")) + '">' + esc(T("كل الإشعارات", "All notifications")) + "</a></li></ul>";
  }
  function staffLinks() {
    var r = typeof ME.staff_role === "string" ? ME.staff_role : (ME.role === "admin" ? "admin" : ""), out = [];
    if (r === "owner" || r === "admin" || r === "editor" || r === "support") out.push(["/admin/", "🛠️", "لوحة التحكم", "Control Center"]);
    else if (r === "seo") out.push(["/seo-team/", "🔎", "لوحة فريق الـ SEO", "SEO team board"]);
    else if (r === "data") out.push(["/data-desk/", "🗂️", "لوحة فريق الداتا", "Data team desk"]);
    if (ME.role === "admin") out.push(["inbox.html", "🛰️", "متابعة الطلبات (إدارة)", "Requests console (admin)"], ["seo-admin.html", "🔎", "مساحة SEO (إدارة)", "SEO workspace (admin)"], ["panel.html", "🗂️", "لوحة الإدارة (النظام القديم)", "Old admin panel (previous system)"]);
    return out;
  }
  function acctHTML() {
    var pl = window.MIGPLAN && MIGPLAN.PL ? MIGPLAN.PL[MIGPLAN.key] : null;
    return '<header><b>' + esc(shortName(ME)) + "<small>" + esc(ME.email || "") + (pl ? " · " + esc(MIGPLAN.name ? MIGPLAN.name(MIGPLAN.key) : pl.n) : "") + "</small></b></header><ul>"
      + [["dashboard.html#overview", "🏠", "لوحتي", "My dashboard"], ["dashboard.html#inquiries", "📝", "طلباتي", "My requests"], ["dashboard.html#follows", "★", "متابعاتي", "My follows"], ["dashboard.html#notifications", "🔔", "الإشعارات", "Notifications"], ["dashboard.html#profile", "👤", "بياناتي", "My details"]]
        .map(function (x) { return '<li><a href="' + esc(fixUrl(x[0])) + '"><span aria-hidden="true">' + x[1] + "</span><span>" + esc(T(x[2], x[3])) + "</span></a></li>"; }).join("")
      /* the platform team (deploy 2): «لوحة التحكم» (/admin/, the Admin Control Center) for owner / admin / editor / support, the team
         boards for seo / data (GET /api/me user.staff_role; before migration 0006 the old members.role "admin" flag), then — for admins —
         the requests console, the SEO workspace and the owner's old admin panel (/panel.html, the old system, kept as it is) */
      + staffLinks().map(function (x) { return '<li><a href="' + x[0] + '" rel="nofollow"><span aria-hidden="true">' + x[1] + "</span><span>" + esc(T(x[2], x[3])) + "</span></a></li>"; }).join("")
      + '<li><button type="button" data-n="out"><span aria-hidden="true">🚪</span><span>' + esc(T("تسجيل الخروج", "Sign out")) + "</span></button></li></ul>";
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    /* the header's «دخول» (its phone icon, the SEO pages' ☰ menu item) go to the sign-in page; ?next= is taken at click time (hash routes change it) */
    var dl = t.closest && t.closest('.mig-in,.site-hdr .hdr-acts a[data-mig-dash],.site-hdr .hdr-acts a[href="dashboard.html"],.site-hdr .site-nav a.nav-in');
    if (dl && !token()) { dl.setAttribute("href", loginUrl()); return; }
    var bell = t.closest && t.closest(".mig-bell");
    if (bell) { e.preventDefault(); if (POP && POP.__btn === bell) { closePop(); return; } showPop(bell, notifHTML()); notifications().then(function () { if (POP && POP.__btn === bell) { POP.innerHTML = notifHTML(); placePop(bell); } }, function (x) { if (POP && POP.__btn === bell) POP.insertAdjacentHTML("afterbegin", '<p class="em">' + esc(errText(x)) + "</p>"); }); return; }
    var ac = t.closest && t.closest(".mig-ac");
    if (ac) { e.preventDefault(); if (POP && POP.__btn === ac) { closePop(); return; } showPop(ac, acctHTML()); return; }
    if (POP && !(t.closest && t.closest(".mig-pop"))) closePop();
    var n = t.closest && t.closest(".mig-pop [data-n],.mig-pop [data-nid]");
    if (n) {
      if (n.getAttribute("data-n") === "all") { e.preventDefault(); readNotifs({ all: true }).then(function () { if (POP) { POP.innerHTML = notifHTML(); } }, function (x) { toast(errText(x)); }); }
      else if (n.getAttribute("data-n") === "out") { e.preventDefault(); closePop(); logout().then(function () { toast(T("تم تسجيل الخروج.", "Signed out.")); if (onPage("dashboard") || onPage("inbox") || onPage("seo-admin") || onPage("advisor")) location.reload(); }); }
      else if (n.getAttribute("data-nid")) { request("/me/notifications/read", { method: "POST", body: { ids: [n.getAttribute("data-nid")] } }).catch(function () {}); }
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && POP) { var b = POP.__btn; closePop(); if (b) b.focus(); } });
  window.addEventListener("resize", closePop);

  /* ---------- one-time import of this browser's old data after the first server sign-in ---------- */
  /* a favourite product (market.html, ids 1000+i of data/oldprod.js) becomes a saved search on its name: the daily digest then alerts on
     real new tenders / RFQs that mention it (the server has no "product" follows). Names are known only where oldprod.js is loaded. */
  function favNames(ids) {
    var P = window.MIGOLDP; if (!P || !P.length) return null;
    var out = []; ids.forEach(function (id) { var o = P[+id - 1000]; var n = o && String(o[0] || "").replace(/\s+/g, " ").trim(); if (n && n.length >= 3 && out.indexOf(n) < 0) out.push(n.slice(0, 120)); });
    return out;
  }
  function migrate() {
    if (!token() || !ME) return; var flag = "mig-migrated:" + ME.id; if (ls(flag)) return;
    var fav = jget("mig-fav", {}), favIds0 = Object.keys(fav || {}).filter(function (k) { return fav[k]; }), accts = jget("mig-accts", []);
    if (!Array.isArray(accts)) accts = [];
    var acct = null; for (var i = accts.length - 1; i >= 0; i--) if (accts[i] && accts[i].m && String(accts[i].m).toLowerCase() === String(ME.email || "").toLowerCase()) { acct = accts[i]; break; }
    if (acct && ME.company) acct = null;
    /* favourites wait for a page that can name them (market / home / company / city); the account part never waits */
    var favIds = favNames(favIds0);
    if (favIds === null) { favIds = []; if (favIds0.length && !acct) return; }
    if (!favIds.length && !acct) { ls(flag, "1"); return; }
    var d = document.createElement("div"); d.className = "mig-dlg"; d.setAttribute("dir", EN() ? "ltr" : "rtl"); d.setAttribute("translate", "no");
    d.innerHTML = '<div class="mig-box" role="dialog" aria-modal="true" aria-labelledby="migMT"><h2 id="migMT">' + esc(T("ننقل بياناتك القديمة لحسابك؟", "Move your old data to your account?")) + "</h2><p>"
      + esc(T("لقينا على الجهاز ده بيانات محفوظة قبل الحسابات الحقيقية:", "We found data saved on this device before real accounts existed:")) + "</p><ul>"
      + (favIds.length ? "<li>" + esc(T(favIds.length + " منتج في المفضلة — هيتحفظوا كبحث متابَع، وتوصلك تنبيهات بالمناقصات والطلبات الجديدة اللي بتذكرهم", favIds.length + " favourite products — saved as followed searches, so you're alerted to new tenders and requests that mention them")) + "</li>" : "")
      + (acct ? "<li>" + esc(T("بيانات التسجيل: ", "Registration details: ")) + esc(acct.n || "") + "</li>" : "")
      + "</ul><p class=\"fine\">" + esc(T("الباقة والصلاحيات بتتحدد من حسابك على المنصة بس، مش من الجهاز.", "Your plan and access come from your platform account only, never from this device.")) + '</p><p class="er" role="alert"></p><div class="row"><button class="btn btn-green" type="button" data-m="yes">' + esc(T("انقلها لحسابي", "Move it to my account")) + '</button><button class="btn btn-line" type="button" data-m="no">' + esc(T("لا، شكراً", "No, thanks")) + "</button></div></div>";
    document.body.appendChild(d);
    var yes = d.querySelector('[data-m="yes"]'); setTimeout(function () { yes.focus(); }, 30);
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") { d.remove(); } else trap(d.querySelector(".mig-box"), e); });
    d.querySelector('[data-m="no"]').onclick = function () { ls(flag, "1"); d.remove(); };
    yes.onclick = function () {
      yes.disabled = true; var jobs = favIds.slice(0, 100).map(function (n) { return request("/me/follows", { method: "POST", body: { kind: "search", ref_id: n, label: T("منتج من المفضلة: ", "Favourite product: ") + n, url: "market.html" } }); });
      if (acct) { var patch = {}; if (!ME.company && acct.n) patch.company = acct.n; if (Object.keys(patch).length) jobs.push(request("/me", { method: "PATCH", body: patch })); }
      Promise.all(jobs).then(function () { ls(flag, "1"); d.remove(); loadFollows(true); me(true).catch(function () {}); toast(T("اتنقلت بياناتك لحسابك.", "Your data was moved to your account.")); }, function (x) { yes.disabled = false; d.querySelector(".er").textContent = errText(x); });
    };
  }

  /* ---------- signed one-time login link (routed-request e-mails): …#lt=<t>&tab=incoming&ref=<REF> → POST /auth/link {t} → {token, user} ---------- */
  /* Runs while this script loads, before the page's own scripts read the hash: the token leaves the address bar and the history at once
     (the rest of the hash — tab=incoming&ref=<REF> — stays for the page). The link works once and for 7 days, and only for its member;
     a refused link is reported honestly by the page (MIGAPI.linkLogin() rejects with e.link = true). */
  var LINKP = null, LINKDONE = false;
  (function () {
    var h = String(location.hash || ""), m = /(?:^#|&)lt=([^&]+)/.exec(h); if (!m) return;
    var t = m[1]; try { t = decodeURIComponent(t); } catch (e) {}
    var rest = h.replace(/^#/, "").split("&").filter(function (p) { return p && !/^lt=/.test(p); }).join("&");
    try { history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : "")); } catch (e) {}
    if (!/^[\w.~+\/=:-]{16,800}$/.test(t)) { var e0 = err("link_invalid", "link_invalid", 400); e0.link = true; LINKP = Promise.reject(e0); LINKP.catch(function () {}); LINKDONE = true; return; }
    LINKP = request("/auth/link", { method: "POST", body: { t: t }, auth: false, timeout: 15000 }).then(function (j) {
      if (!j || !j.token || !j.user) throw err("bad_response", T("الخادم مارجّعش جلسة دخول.", "The server did not return a session."));
      ls(TK, j.token); CONFIRMED = true; setMe(j.user, 0); MEP = null; FOL = null; FOLP = null; paintHeader();
      fire("mig:login", { user: j.user, u: j.user.id, via: "link" }); fire("mig:me", { user: j.user, unread: 0 });
      return j.user;
    }, function (e) { if (e && e.code !== "offline") e.link = true; throw e; });
    LINKP.then(function () { LINKDONE = true; }, function () { LINKDONE = true; });
  })();

  /* ---------- plan helpers ---------- */
  function plan() { return (window.MIGPLAN && MIGPLAN.key) || (CONFIRMED ? planOf(ME) : "visitor"); }
  function isMember() { return CONFIRMED && !!ME && LV[planOf(ME)] >= 2; }

  /* ---------- public API ---------- */
  window.MIGAPI = {
    base: BASE, token: token, request: request, me: me, user: function () { return ME; }, confirmed: function () { return CONFIRMED && !!ME; },
    open: open, login: open, logout: logout, needLogin: needLogin,
    /* the sign-in form on any element (the sign-in page /login/ mounts it in its card) and the sign-in page's URL for a ?next= */
    signin: signinForm, loginUrl: loginUrl,
    inquiry: inquiry, track: track,
    follow: follow, unfollow: unfollow, follows: follows, isFollowing: isFollowing, attach: attachFollow, followSaved: followSaved, followCtx: followCtx,
    notifications: notifications, readNotifications: readNotifs,
    ev: ev, prefs: function (o) { return request("/me/prefs", { method: "POST", body: o || {} }); },
    stats: function () { return request("/me/stats"); },
    myInquiries: function () { return request("/me/inquiries"); },
    incoming: function () { return request("/me/incoming"); },
    quote: function (ref, o) { return request("/me/incoming/" + encodeURIComponent(ref) + "/quote", { method: "POST", body: o || {} }); },
    decline: function (ref, reason) { return request("/me/incoming/" + encodeURIComponent(ref) + "/decline", { method: "POST", body: { reason: reason || "" } }); },
    updateMe: function (o) { return request("/me", { method: "PATCH", body: o || {} }).then(function (j) { if (j && j.user) { setMe(j.user, UNREAD); paintHeader(); fire("mig:me", { user: ME, unread: UNREAD }); } return j; }); },
    notify: function (msg, channel) { return request("/advisor/notify", { method: "POST", body: { message: String(msg || ""), channel: channel || "both" } }); },
    isMember: isMember, plan: plan, planOf: planOf, LV: LV, onPage: onPage,
    /* is the platform's server connected (and its e-mail-code sign-in on)? GET /auth/health answers 200 JSON — so a signed-out page
       never has to call /me just to get the normal 401 (which browsers log as a console error) */
    ping: function () { return request("/auth/health", { auth: false, timeout: 6000 }); },
    /* the pending exchange of an e-mailed one-time login link (null when this page was not opened from one) */
    linkLogin: function () { return LINKP; }, linkSession: linkSession, legacySession: legacySession,
    /* the optional Turnstile token (resolves "" when no site key is configured) — the /login/ old-password card sends it like the code form */
    human: human,
    ui: { toast: toast, errText: errText, offline: OFFMSG, statusLabel: statusLabel, statusChip: statusChip, timeline: timeline, kindLabel: kindLabel, date: fDate, esc: esc, shortName: shortName, titleOf: titleOf, fixUrl: fixUrl, nIcon: nIcon, nTitle: nTitle }
  };

  /* ---------- start ---------- */
  function start() {
    paintHeader();
    /* an e-mailed login link is exchanged first: the session it opens replaces any older one on this browser */
    (LINKP ? LINKP.then(null, function () {}) : Promise.resolve()).then(function () {
      paintHeader();
      /* the sign-in page (/login/) only shows who is signed in: no follows, notification poll or old-data import there */
      if (token()) { me(!!LINKP).then(function () { if (onPage("signin")) return; loadFollows().catch(function () {}); startPoll(); setTimeout(migrate, 800); }, function () {}); }
      else { CONFIRMED = true; if (window.MIGPLAN && MIGPLAN.update) MIGPLAN.update("visitor", "", true); }
    });
    attachFollow(); viewBeacon();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.addEventListener("hashchange", function () { setTimeout(function () { attachFollow(); viewBeacon(); }, 350); });
  window.addEventListener("mig:ctx", function () { attachFollow(); viewBeacon(); });
  /* another tab signed in / out */
  window.addEventListener("storage", function (e) { if (e.key === TK) { if (!e.newValue) dropSession(); else { MEP = null; me(true).catch(function () {}); } } });
})();
