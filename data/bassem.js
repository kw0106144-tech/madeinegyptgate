/* «باسم» (Bassem) — the personal business advisor of Core Partner & Strategic Partner members, for 365 days from activation.
   He replaces Janna (marketing / registration for visitors) on every page as soon as an eligible member is signed in.
   Eligibility comes from the SERVER only: the platform session of data/mig-api.js (GET /api/me → user.plan "partner" | "strategic",
   user.title + user.name for the greeting, user.activated_at for the 365 days) — nothing shows until /api/me has answered, so a
   devtools-edited "mig-plan" / "mig-me" cannot unlock him — or, without a platform session, a Worker-issued advisor session from an
   activation link (advisor.html#login=…: sessionStorage "mig-adv-token" + localStorage "mig-adv-member"). Standing realistic photo (data/bassem-real.js: body + eye / mouth overlay
   frames, arms crossed), blinks, breathes, moves his lips while he talks (browser speech synthesis with a male ar-EG / English
   voice when available, otherwise the same letter → mouth-frame fallback Janna uses), a speech bubble attached at his shoulder
   (BASSEM_REAL.anchor) with page-aware tips and quick actions, minimise to a round headshot, prefers-reduced-motion.
   First sign-in: a welcome overlay where he introduces himself and the 365-day service period (once per member).
   After the 365 days he no longer works for the member: Janna is back on the public pages, and on the dashboard / advisor he only
   offers the renewal (no video call, no daily brief, no page tips). The welcome overlay keeps clear of the live captions (data/captions.js).
   Loaded just before data/janna.js: for an eligible member it sets window.__janna so Janna's engine does not start; when the
   member signs in later on the same page (dashboard) Janna is hidden with CSS and stopped.
   API: window.BASSEM = {info, period, active, open, say, close, minimise, restore, welcome, video, stop}.
   Events on window: "bassem:change" (activated / state changed). Listens for "mig:login" (dashboard sign-in). */
(function () {
  if (window.__bassem) return; window.__bassem = 1;
  /* never inside Janna Live's screen (same-origin iframe) or the hologram kiosk */
  var EMBED = !!window.JANNA_EMBED; try { if (!EMBED && window.top !== window && window.parent.__jannaLive === 1) EMBED = true; } catch (e) {}
  if (EMBED || window.JANNA_KIOSK) return;
  var EN = window.MIGLANG === "en", L = EN ? "en" : "ar";
  var T = function (ar, en) { return EN ? en : ar; };
  var R0 = window.BASSEM_REAL, REAL = R0 && R0.body && R0.w && R0.h ? R0 : null;
  var HEAD = (REAL && REAL.headshot) || "img/bassem.jpg";
  var RM = false; try { RM = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };
  /* the page key: site.py sets window.MIGPAGE on every page (clean URLs such as /advisor/ say nothing in the file name); the file name is
     only the fallback of an old flat build */
  var PAGE = String(window.MIGPAGE || "") || (location.pathname.replace(/\/+$/, "").split("/").pop() || "home.html").replace(/\.html?$/, "") || "home"; if (PAGE === "index") PAGE = "home";
  /* clean URLs (deploy build: <base href="/">, pages at /<key>/; "x.html" only answers with a 301 to the SEO landing page without the
     app or Bassem): his links go straight to the app pages (window.MIGPATHS {app, static} wins over this copy of seo/config.json) */
  var CLEAN = !!document.querySelector('base[href="/"]') || (!/\.html?$/i.test(location.pathname) && location.pathname !== "/");
  var APPP = { factories: "/factories/search/", tenders: "/tenders/search/", rfqs: "/rfq/search/", winners: "/awards/search/", news: "/news/search/", events: "/events/calendar/", projects: "/projects/search/", offers: "/offers/search/", cities: "/industrial-zones/explore/", region: "/governorates/explore/" };
  var STP = { home: "/", rfqs: "/rfq/", winners: "/awards/", cities: "/industrial-zones/", region: "/governorates/", "export-market": "/export/" };
  function url(u) {
    u = String(u == null ? "" : u); if (!CLEAN) return u;
    var m = /^([\w-]+)\.html(\?[^#]*)?(#.*)?$/.exec(u); if (!m) return u;
    var k = m[1], q = m[2] || "", h = m[3] || "", P = window.MIGPATHS || {};
    if (k === "home" || k === "index") return "/" + q + h;
    var ap = (P.app || APPP)[k]; if (ap) return ap + q + h;
    return ((P["static"] || STP)[k] || "/" + k + "/") + q + h;
  }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- who is signed in, and the 365-day service period ---------- */
  var ELIG = { partner: 1, strategic: 1 }, DAYS = 365;
  var PLN = { partner: ["باقة الشريك الأساسي", "Core Partner plan"], strategic: ["باقة الشريك الاستراتيجي", "Strategic Partner plan"] };
  var MKN = { local: ["مصر", "Egypt"], gulf: ["الخليج", "the Gulf"], africa: ["أفريقيا", "Africa"], asia: ["آسيا", "Asia"], europe: ["أوروبا", "Europe"] };
  /* the platform session (data/mig-api.js): the user only once GET /api/me (or the sign-in) has answered */
  function API() { return window.MIGAPI || null; }
  function srvUser() { var A = API(); return A && A.token() && A.confirmed() ? A.user() : null; }
  /* the member a Worker activation link signed in (advisor.html#login=…): {id, company, email, plan, at} — valid with the session token the Worker issued */
  function advMember() { var m = null; try { m = JSON.parse(ls("mig-adv-member") || "null"); } catch (e) {} if (!m || !m.id) return null; var t = null; try { t = JSON.parse(ss("mig-adv-token") || "null"); } catch (e) {} return t && t.t && t.k === m.id + "|" + String(m.plan || "").toLowerCase() ? m : null; }
  /* «دكتور أحمد» / «Dr. Ahmed»: the title + name the member registered (falls back to the company) */
  var TTL = { "أستاذ": "Mr.", "الأستاذ": "Mr.", "دكتور": "Dr.", "الدكتور": "Dr.", "د.": "Dr.", "مهندس": "Eng.", "المهندس": "Eng.", "م.": "Eng.", "مستشار": "Counsellor", "المستشار": "Counsellor", "لواء": "Gen.", "اللواء": "Gen.", "مدام": "Mrs.", "آنسة": "Ms.", "الحاج": "Hajj", "حاج": "Hajj" };
  function addressOf(u) {
    if (!u) return ""; var n = String(u.name || "").trim(), t = String(u.title || "").trim(), first = n.split(/\s+/)[0] || "";
    if (!n) return u.company || "";
    if (!t) return n;
    return EN ? (TTL[t] || t) + " " + first : t + " " + first;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDay(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayOf(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? m[0] : ""; }
  function dnum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; }
  function fDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); if (!m) return s || ""; try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch (e) { return s; } }
  /* service period of a member id: activation date when the stored account data has one, else the first sign-in date (kept) */
  function period(u, actDate) {
    var key = "bassem-start:" + (u || "member"), act = dayOf(actDate), st = act || dayOf(ls(key)), src = act ? "activation" : "login";
    if (!st) { st = isoDay(new Date()); ls(key, st); }
    var used = Math.max(0, Math.floor(dnum(isoDay(new Date())) - dnum(st))), left = Math.max(0, DAYS - used);
    return { start: st, end: new Date((dnum(st) + DAYS) * 864e5).toISOString().slice(0, 10), used: Math.min(used, DAYS), left: left, total: DAYS, expired: used >= DAYS, src: src };
  }
  function info() {
    var A = API(), su = srvUser(), am = null, u = "", pk = "visitor";
    if (A && A.token()) { if (!su) return { eligible: false, pending: true, plan: "visitor" }; u = su.id; pk = A.planOf(su); }
    else { am = advMember(); if (am) { u = am.id; pk = String(am.plan || "").toLowerCase(); } }
    if (!u || !ELIG[pk]) return { eligible: false, user: u, plan: pk };
    var name = su ? addressOf(su) : (am.company || am.email || u);
    var p = period(u, su ? (su.activated_at || "") : (am.activated_at || am.activated));
    var mk = (window.MIGPLAN && MIGPLAN.PL && MIGPLAN.PL[pk] && MIGPLAN.PL[pk].markets) || [];
    var o = { eligible: true, user: u, name: name, company: su ? su.company || "" : (am.company || ""), email: su ? su.email : am.email, plan: pk, planName: T(PLN[pk][0], PLN[pk][1]), markets: mk, headshot: HEAD };
    for (var k in p) o[k] = p[k];
    return o;
  }
  /* he works for the member during the 365 days; afterwards he only appears on the member's own pages to offer the renewal */
  function present(i) { return !!(i && i.eligible && (!i.expired || PAGE === "dashboard" || PAGE === "advisor")); }
  function mkList(mk) { return mk.map(function (m) { return MKN[m] ? T(MKN[m][0], MKN[m][1]) : m; }).join(T("، ", ", ")); }
  function leftTxt(n) { return EN ? n + (n === 1 ? " day" : " days") + " left" : (n === 1 ? "فاضل يوم واحد" : n === 2 ? "فاضل يومين" : "فاضل " + n + (n <= 10 ? " أيام" : " يوم")); }

  var ME = info(), ON = false, MINI = ls("bassem-min") === "1";
  /* eligible at load: Janna's engine (data/janna.js, loaded right after this file) must not start on this page */
  if (present(ME)) { window.__janna = 1; document.documentElement.classList.add("bs-on"); }
  /* a signed-in partner whose plan the server has not re-confirmed yet on this page: keep Janna from starting (no flash) while
     GET /api/me answers; he himself appears only after that answer. A refused plan just leaves this one page without either. */
  else if (ME.pending) { try { var hint = JSON.parse(ls("mig-me") || "null"), hp = hint && hint.user && API() ? API().planOf(hint.user) : ""; if (ELIG[hp]) { window.__janna = 1; document.documentElement.classList.add("bs-on"); } } catch (e) {} }

  /* ---------- look ---------- */
  var css = ''
    + 'html.bs-on .jn-fig,html.bs-on .jn-mini,html.bs-on .jn-bub,html.bs-on .jn-beam,html.bs-on .jn-tap,html.bs-on .jnl-btn,html.bs-on .sanad-btn,html.bs-on .sanad-tip{display:none!important}'
    + '.bs-fig{position:fixed;z-index:65;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);height:min(40vh,380px);pointer-events:none;font-family:Cairo,Tajawal,Tahoma,sans-serif}'
    + '.bs-fig[hidden],.bs-mini[hidden],.bs-bub[hidden],.bs-wel[hidden]{display:none!important}'
    + '.bs-floor{position:absolute;left:6%;right:6%;bottom:-1.6%;height:4.5%;border-radius:50%;background:radial-gradient(closest-side,rgba(10,20,30,.42),rgba(10,20,30,.14) 55%,transparent 100%)}'
    + '.bs-sway,.bs-breath,.bs-bob{position:absolute;inset:0;transform-origin:50% 100%}'
    + '.bs-sway{animation:bsSway 10s ease-in-out infinite;transition:opacity .5s ease}.bs-breath{animation:bsBreath 4.4s ease-in-out infinite}.bs-fig.talk .bs-bob{animation:bsBob .38s ease-in-out infinite alternate}'
    + '@keyframes bsSway{0%,100%{transform:rotate(-.25deg)}50%{transform:rotate(.25deg)}}@keyframes bsBreath{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.006)}}@keyframes bsBob{from{transform:translateY(0)}to{transform:translateY(-1px)}}'
    + '.bs-fig.ghost:not(.hot):not(.open):not(.talk) .bs-sway{opacity:.3}.bs-fig.ghost:not(.hot):not(.open):not(.talk) .bs-floor{opacity:.3}'
    + '.bs-photo,.bs-ov{position:absolute;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}.bs-photo{left:0;top:0;width:100%;height:100%;transition:filter .3s ease}.bs-ov{opacity:0}.bs-ov.on{opacity:1}'
    + '.bs-fig.hot .bs-photo{filter:drop-shadow(0 0 9px rgba(192,147,0,.8)) drop-shadow(0 0 2px rgba(192,147,0,.9))}.bs-fig.talk .bs-photo{filter:drop-shadow(0 0 6px rgba(192,147,0,.45))}'
    + '.bs-fig.box{pointer-events:auto;cursor:pointer}.bs-fig .bs-pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;border:3px solid #C09300}'
    + '.bs-x{position:absolute;top:1%;right:8%;width:26px;height:26px;border-radius:50%;border:1px solid rgba(192,147,0,.7);background:rgba(11,31,58,.88);color:#f5e6b8;font:800 16px/1 Cairo,Tahoma,sans-serif;cursor:pointer;pointer-events:auto;opacity:.6;transition:opacity .2s}.bs-x:hover,.bs-x:focus-visible,.bs-fig.hot .bs-x{opacity:1}'
    + '.bs-tag{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);white-space:nowrap;pointer-events:auto;cursor:pointer;border:1px solid rgba(192,147,0,.75);background:rgba(11,31,58,.92);color:#fff;border-radius:999px;padding:3px 12px;font:800 .74rem/1.6 Cairo,Tajawal,Tahoma,sans-serif;box-shadow:0 8px 18px -8px rgba(0,0,0,.6)}.bs-fig.open .bs-tag{display:none}'
    + 'html.bs-hot,html.bs-hot *{cursor:pointer!important}'
    + '.bs-mini{position:fixed;z-index:65;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:64px;height:64px;border-radius:50%;background:#0b1f3a;border:2px solid #C09300;box-shadow:0 10px 24px -8px rgba(0,0,0,.55),0 0 0 4px rgba(192,147,0,.18);overflow:visible;cursor:pointer;padding:0}'
    + '.bs-mini img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}.bs-mini::after{content:"";position:absolute;right:2px;bottom:2px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff}'
    + '.bs-bub{position:fixed;z-index:66;width:360px;max-height:min(72vh,560px);display:flex;flex-direction:column;background:#fff;color:#0f172a;border:1px solid #d9dee8;border-top:4px solid #C09300;border-radius:18px;box-shadow:0 26px 60px -20px rgba(0,0,0,.45),0 0 0 4px rgba(192,147,0,.1);font-family:Cairo,Tajawal,Tahoma,sans-serif;animation:bsIn .3s ease both}'
    + '@keyframes bsIn{from{opacity:0;transform:translateX(12px) scale(.98)}to{opacity:1;transform:none}}'
    + '.bs-pin{position:absolute;right:-8px;width:14px;height:14px;background:#fff;border-top:1px solid #d9dee8;border-right:1px solid #d9dee8;transform:rotate(45deg)}.bs-bub.sheet .bs-pin{display:none}.bs-bub.qd{right:14px!important;left:auto!important;top:auto!important;bottom:calc(env(safe-area-inset-bottom,0px) + 92px)!important;width:min(380px,calc(100vw - 28px))!important;max-height:min(62vh,520px)}.bs-bub.qd.qdl{left:14px!important;right:auto!important}.bs-bub.qd .bs-pin{display:none}'
    + '.bs-hd{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #eef2f6;flex:0 0 auto}.bs-hd img{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #C09300;flex:none}'
    + '.bs-hd b{font-size:.92rem;display:block;line-height:1.3}.bs-hd small{color:#64748b;font-size:.72rem;display:block;line-height:1.4}.bs-hd .sp{flex:1;min-width:0}'
    + '.bs-hd button{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:3px 8px;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer;color:#0f172a}.bs-hd button.on{background:#0b1f3a;color:#fff;border-color:#0b1f3a}'
    + '.bs-body{padding:12px 14px;overflow:auto;font-size:.92rem;line-height:1.85;white-space:pre-line;flex:1 1 auto;min-height:0}'
    + '.bs-acts{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px;flex:0 0 auto}.bs-acts a,.bs-acts button{border:1px solid #d6dbe6;background:#f4f6fa;color:#0b1f3a;border-radius:999px;padding:5px 11px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer;text-decoration:none;line-height:1.6}'
    + '.bs-acts a:hover,.bs-acts button:hover{border-color:#C09300;background:#fbf4dc}.bs-acts .pri{background:#0b1f3a;color:#fff;border-color:#0b1f3a}.bs-acts .vid{background:#c8102e;color:#fff;border-color:#c8102e}.bs-acts .gold{background:#C09300;color:#1A1204;border-color:#C09300}'
    + '.bs-body.more{-webkit-mask-image:linear-gradient(#000 calc(100% - 26px),rgba(0,0,0,.2));mask-image:linear-gradient(#000 calc(100% - 26px),rgba(0,0,0,.2))}'
    + '.bs-bub.sheet{left:8px!important;right:8px!important;width:auto!important;top:auto!important;bottom:calc(var(--fh,26vh) + 6px)!important;max-height:min(var(--sh,52vh),460px)}'
    + '@media (max-width:640px){.bs-fig{height:22vh;right:6px}.bs-tag{font-size:.66rem;padding:2px 8px;bottom:4%}.bs-hd small{font-size:.68rem}.bs-body{font-size:.88rem;padding:10px 12px}.bs-acts{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.bs-acts::-webkit-scrollbar{display:none}.bs-acts>*{flex:0 0 auto;white-space:nowrap}}'
    /* welcome overlay */
    + '.bs-wel{position:fixed;inset:0;z-index:9500;background:rgba(6,12,24,.64);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px 16px calc(16px + var(--bs-cc,0px));font-family:Cairo,Tajawal,Tahoma,sans-serif}'
    /* live captions while the welcome is open (data/captions.js draws above every layer): wide layout → inside the box, in the free top of
       his navy column (html.bs-welcc + --bs-cc*); single column (phone) → --bs-cc keeps a strip under the box free for them */
    + 'html.bs-welcc .mig-cc{left:var(--bs-ccl)!important;right:auto!important;top:var(--bs-cct)!important;bottom:auto!important;transform:none!important;width:var(--bs-ccw)!important;max-width:var(--bs-ccw)!important;font-size:.95rem!important;padding:8px 12px 9px!important}'
    + '.bs-wbox{position:relative;width:min(880px,100%);max-height:calc(100vh - 32px - var(--bs-cc,0px));max-height:calc(100dvh - 32px - var(--bs-cc,0px));overflow:auto;overscroll-behavior:contain;background:#fff;color:#0f172a;border-radius:22px;display:grid;grid-template-columns:290px minmax(0,1fr);box-shadow:0 40px 80px -30px rgba(0,0,0,.7);animation:bsUp .4s cubic-bezier(.2,.8,.3,1) both}'
    + '@keyframes bsUp{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}'
    + '.bs-wl{background:radial-gradient(120% 80% at 50% 0%,#1d3c6b 0%,#0b1f3a 58%,#06142a 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:22px 18px 0;gap:10px;position:relative;overflow:hidden}'
    + '.bs-wl::before{content:"";position:absolute;inset:auto -20% -30% -20%;height:55%;background:radial-gradient(closest-side,rgba(192,147,0,.28),transparent);pointer-events:none}'
    + '.bs-wl .bs-who{text-align:center;position:relative}.bs-wl .bs-who b{display:block;font-size:1.35rem;font-weight:900}.bs-wl .bs-who small{display:block;color:#E2BE72;font-weight:800;font-size:.84rem}'
    + '.bs-wfig{position:relative;width:88%;aspect-ratio:623/780;overflow:hidden;flex:none}.bs-wfig .bs-in{position:absolute;left:0;top:0;width:100%;aspect-ratio:623/1619}.bs-wfig .bs-in .bs-photo{height:auto;aspect-ratio:623/1619}'
    + '.bs-wr{padding:24px 26px 22px;display:flex;flex-direction:column;gap:12px;min-width:0}'
    + '.bs-wr h2{font-size:clamp(1.15rem,2.4vw,1.5rem);font-weight:900;line-height:1.45;margin:0}.bs-wr .lead{color:#334155;font-size:.95rem;line-height:1.85;margin:0}'
    + '.bs-wli{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}.bs-wli li{display:flex;gap:9px;align-items:flex-start;background:#f6f7fb;border:1px solid #e8ebf2;border-radius:12px;padding:8px 10px;font-size:.84rem;line-height:1.7}.bs-wli li i{font-style:normal;font-size:1.05rem;line-height:1.5;flex:none}'
    + '.bs-per{border:1px solid rgba(192,147,0,.45);background:#fffaf0;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;font-size:.86rem}.bs-per .r{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}.bs-per b{font-size:1rem}.bs-per .n{font-size:1.35rem;font-weight:900;color:#0b1f3a;font-variant-numeric:tabular-nums}.bs-per small{color:#64748b}'
    + '.bs-bar{height:8px;border-radius:99px;background:#efe6cc;overflow:hidden}.bs-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#C09300,#0b1f3a)}'
    + '.bs-wact{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.bs-wact a,.bs-wact button{font:inherit;font-weight:800;font-size:.9rem;border-radius:12px;padding:9px 16px;cursor:pointer;text-decoration:none;border:1px solid transparent;line-height:1.5}'
    + '.bs-wact .go{background:#C09300;color:#1A1204;border-color:#C09300}.bs-wact .go:hover{filter:brightness(1.06)}.bs-wact .vid{background:#0b1f3a;color:#fff}.bs-wact .later{background:none;color:#64748b;border-color:#e2e8f0}'
    + '.bs-wx{position:absolute;top:10px;left:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(15,23,42,.08);color:#0f172a;font-size:1rem;cursor:pointer;z-index:2}.bs-wbox[dir=ltr] .bs-wx{left:auto;right:10px}'
    + '@media (max-width:760px){.bs-wbox{grid-template-columns:1fr}.bs-wl{flex-direction:row;justify-content:flex-start;padding:14px 16px;gap:12px}.bs-wl .bs-who{text-align:start}.bs-wl::before{display:none}'
    + '.bs-wfig{width:84px;height:84px;aspect-ratio:auto;border-radius:50%;border:2px solid #C09300;background:#0b1f3a}.bs-wfig .bs-in{width:180px;left:-44px;top:-22px}.bs-wr{padding:16px 16px 18px}.bs-wx{background:rgba(255,255,255,.16);color:#fff}.bs-wli{grid-template-columns:1fr}.bs-wact a,.bs-wact button{flex:1 1 auto;text-align:center}}'
    + '@media (prefers-reduced-motion:reduce){.bs-sway,.bs-breath,.bs-bob,.bs-bub,.bs-wbox{animation:none!important}}';
  var stl = document.createElement("style"); stl.textContent = css; (document.head || document.documentElement).appendChild(stl);

  /* ---------- his figure(s): the standing one in the corner, and the upper body in the welcome overlay ---------- */
  var AVS = [];
  function pct(v, of) { return (v / of * 100).toFixed(3) + "%"; }
  function makeAV(root) {
    var eyes = null, mouths = [];
    function ov(src, r, cls) { var im = new Image(); im.className = "bs-ov " + cls; im.alt = ""; im.decoding = "async"; im.src = src; im.style.left = pct(r.x, REAL.w); im.style.top = pct(r.y, REAL.h); im.style.width = pct(r.w, REAL.w); im.style.height = pct(r.h, REAL.h); root.appendChild(im); return im; }
    var body = new Image(); body.className = "bs-photo"; body.alt = T("باسم", "Bassem"); body.decoding = "async"; body.src = REAL.body; root.appendChild(body);
    if (REAL.eyes && REAL.eyes.closed) eyes = ov(REAL.eyes.closed, REAL.eyes, "bs-eye");
    ((REAL.mouth && REAL.mouth.frames) || []).forEach(function (f, i) { mouths[i] = f ? ov(f, REAL.mouth, "bs-m" + i) : null; });
    var cur = -1, av = {
      body: body,
      setV: function (n) { if (n === cur) return; cur = n; mouths.forEach(function (m, i) { if (m) m.classList.toggle("on", i === n); }); },
      blink: function (on) { if (eyes) eyes.classList.toggle("on", on); }
    };
    AVS.push(av); return av;
  }
  function setV(n) { AVS.forEach(function (a) { a.setV(n); }); }
  function blinkAll(on) { AVS.forEach(function (a) { a.blink(on); }); }

  var fig, mini, bub, bodyEl, actsEl, pin, mainAV = null, hitMap = null;
  function build() {
    if (fig) return;
    fig = document.createElement("div"); fig.className = "bs-fig"; fig.setAttribute("translate", "no"); fig.hidden = true;
    fig.innerHTML = '<div class="bs-floor"></div><div class="bs-sway"><div class="bs-breath"><div class="bs-bob"></div></div></div><button type="button" class="bs-x">–</button><span class="bs-tag" role="button" tabindex="0"></span>';
    var root = fig.querySelector(".bs-bob");
    if (REAL) {
      fig.style.aspectRatio = REAL.w + " / " + REAL.h;
      mainAV = makeAV(root);
      [REAL.eyes && REAL.eyes.closed].concat((REAL.mouth && REAL.mouth.frames) || []).forEach(function (s) { if (s) { var p = new Image(); p.src = s; } });
      var mk = function () { try { var cw = 100, ch = Math.round(cw * REAL.h / REAL.w), c = document.createElement("canvas"); c.width = cw; c.height = ch; var x = c.getContext("2d"); x.drawImage(mainAV.body, 0, 0, cw, ch); hitMap = { w: cw, h: ch, d: x.getImageData(0, 0, cw, ch).data }; } catch (e) { hitMap = null; } };
      if (mainAV.body.complete && mainAV.body.naturalWidth) mk(); else mainAV.body.addEventListener("load", function () { mk(); layout(); });
      mainAV.body.addEventListener("error", function () { fig.classList.add("box"); });
    } else {
      fig.classList.add("box"); fig.style.aspectRatio = "1 / 1"; fig.style.height = "96px";
      var pic = new Image(); pic.className = "bs-pic"; pic.alt = ""; pic.src = HEAD; root.appendChild(pic);
    }
    mini = document.createElement("button"); mini.type = "button"; mini.className = "bs-mini"; mini.setAttribute("translate", "no"); mini.hidden = true;
    mini.innerHTML = '<img alt="" src="' + esc(HEAD) + '">';
    bub = document.createElement("section"); bub.className = "bs-bub"; bub.hidden = true; bub.setAttribute("translate", "no"); bub.setAttribute("aria-live", "polite"); bub.dir = EN ? "ltr" : "rtl"; bub.lang = L;
    bub.innerHTML = '<span class="bs-pin" aria-hidden="true"></span><div class="bs-hd"><img alt="" src="' + esc(HEAD) + '"><div class="sp"><b></b><small></small></div><button type="button" class="bs-snd"></button><button type="button" class="bs-cl" aria-label="' + T("إغلاق", "Close") + '">✕</button></div><div class="bs-body"></div><div class="bs-acts"></div>';
    document.body.appendChild(fig); document.body.appendChild(mini); document.body.appendChild(bub);
    bodyEl = bub.querySelector(".bs-body"); actsEl = bub.querySelector(".bs-acts"); pin = bub.querySelector(".bs-pin");
    bodyEl.addEventListener("scroll", moreCue, { passive: true });
    wire(); chrome();
  }
  function chrome() {
    if (!fig) return;
    fig.querySelector(".bs-tag").textContent = "💼 " + T("باسم · مستشارك", "Bassem · your advisor");
    var x = fig.querySelector(".bs-x"); x.setAttribute("aria-label", T("تصغير", "Minimise")); x.title = T("تصغير", "Minimise");
    mini.setAttribute("aria-label", T("افتح باسم، مستشار أعمالك", "Open Bassem, your business advisor")); mini.title = T("باسم، مستشار أعمالك", "Bassem, your business advisor");
    bub.querySelector(".bs-hd b").textContent = T("باسم", "Bassem");
    bub.querySelector(".bs-hd small").textContent = T("مستشار أعمالك", "Your business advisor") + (ME.eligible ? " · " + (ME.expired ? T("انتهت مدة الخدمة", "Service period ended") : leftTxt(ME.left)) : "");
    var sb = bub.querySelector(".bs-snd"), sl = soundOn ? T("كتم الصوت", "Mute") : T("شغّل الصوت", "Sound on"); sb.textContent = soundOn ? "🔊" : "🔇"; sb.classList.toggle("on", soundOn); sb.title = sl; sb.setAttribute("aria-label", sl);
  }

  /* ---------- placement ---------- */
  function sideOffset() { var r = 0; [".wa-float", ".totop"].forEach(function (s) { var e = document.querySelector(s); if (!e) return; try { var cs = getComputedStyle(e); if (cs.position === "fixed" && cs.direction === "rtl") r = 70; } catch (x) {} }); return r; }
  function isPhone() { return window.innerWidth <= 640; }
  function barLift(x0, x1) { var lift = 0, e = document.querySelector(".planpv"); if (e) { var r = e.getBoundingClientRect(); if (r.width && r.height && r.right > x0 && r.left < x1 && r.top > window.innerHeight * .6) lift = window.innerHeight - r.top + 6; } return lift; }
  function dock(on) { fig.hidden = !!on; mini.hidden = !on; }
  function anchorPt() {
    var b = (mainAV ? mainAV.body : fig).getBoundingClientRect();
    if (!b.width) { var f = fig.getBoundingClientRect(); return { x: f.left, y: f.top + f.height * .25 }; }
    var a = REAL && REAL.anchor ? REAL.anchor : { x: (REAL ? REAL.w : 1) * .15, y: (REAL ? REAL.h : 1) * .24 };
    return { x: b.left + a.x / (REAL ? REAL.w : 1) * b.width, y: b.top + a.y / (REAL ? REAL.h : 1) * b.height };
  }
  function layout() {
    if (!fig || !ON) return;
    var vw = window.innerWidth, vh = window.innerHeight, phone = vw <= 640, r = Math.max(phone ? 4 : 10, sideOffset());
    /* members' tools (dashboard, requests monitor, advisor): his collapsed headshot waits on the side away from the page's navigation and
       the WhatsApp button (left in Arabic, right in English), like Janna's */
    var qd = PAGE === "dashboard" || PAGE === "inbox" || PAGE === "advisor", endL = qd && (document.documentElement.getAttribute("dir") || "rtl") !== "ltr";
    fig.style.right = r + "px"; mini.style.right = endL ? "auto" : (qd ? 14 : r) + "px"; mini.style.left = endL ? "14px" : "";
    if (qd && !phone) dock(true); else if (bub.hidden) { if (phone || MINI) dock(true); else dock(false); } else dock(false);
    var fw = fig.hidden ? 64 : fig.getBoundingClientRect().width, lf = barLift(vw - r - fw, vw - r);
    fig.style.bottom = lf ? lf + "px" : ""; mini.style.bottom = lf ? lf + "px" : "";
    var fr = fig.getBoundingClientRect();
    bub.style.setProperty("--fh", Math.round(fig.hidden ? 84 : Math.max(0, vh - fr.top)) + "px");
    if (phone) bub.style.setProperty("--sh", Math.round(Math.max(30, Math.min(56, (fr.top - 70) / vh * 100))) + "vh");
    /* members' tools (desktop): his bubble is a corner panel above his headshot, away from the sidebar — never over the navigation */
    if (!bub.hidden && qd && !phone) { bub.classList.remove("sheet"); bub.classList.add("qd"); bub.classList.toggle("qdl", endL); bub.style.width = ""; bub.style.right = ""; bub.style.top = ""; bub.style.left = ""; bub.style.bottom = ""; moreCue(); return; }
    bub.classList.remove("qd", "qdl");
    if (bub.hidden || fig.hidden) { ghostSoon(); return; }
    fig.classList.remove("ghost");
    var gap = 16, A = anchorPt(), room = A.x - gap - 16, w = Math.min(bub.classList.contains("peek") ? 340 : 380, room);
    if (phone || w < 270) { bub.classList.add("sheet"); bub.style.width = ""; bub.style.right = ""; bub.style.top = ""; bub.style.left = ""; moreCue(); return; }
    bub.classList.remove("sheet"); bub.style.width = Math.max(240, w) + "px"; bub.style.left = "auto"; bub.style.bottom = "auto";
    bub.style.right = Math.round(vw - A.x + gap) + "px";
    var bh = bub.offsetHeight, top = Math.max(10, Math.min(vh - bh - 10, A.y - Math.min(48, bh / 2)));
    bub.style.top = Math.round(top) + "px"; moreCue();
    pin.style.top = Math.round(Math.max(14, Math.min(bh - 24, A.y - top - 7))) + "px";
  }
  function moreCue() { if (bodyEl) bodyEl.classList.toggle("more", bodyEl.scrollHeight - bodyEl.clientHeight - bodyEl.scrollTop > 6); }
  /* bubble closed and he stands over page text: fade him a little (like Janna) */
  var ghostT = 0;
  function ghostSoon() { clearTimeout(ghostT); ghostT = setTimeout(ghostCheck, 260); }
  function ghostCheck() {
    if (!fig || fig.hidden || !bub.hidden || !REAL) { if (fig) fig.classList.remove("ghost"); return; }
    var b = fig.getBoundingClientRect(), hits = 0, tot = 0;
    for (var gy = .08; gy < 1; gy += .12) for (var gx = .1; gx < 1; gx += .2) {
      var x = b.left + b.width * gx, y = b.top + b.height * gy; if (!hit(x, y)) continue; tot++;
      var el = document.elementFromPoint(x, y); if (!el || el === document.body || el === document.documentElement || (el.closest && el.closest(".bs-fig,.bs-mini"))) continue;
      if (el.closest("h1,h2,h3,h4,h5,p,li,td,th,label,input,select,textarea,button,a,img,figure,[class*=card],[class*=stat],[class*=pill],[class*=kpi]")) hits++;
    }
    fig.classList.toggle("ghost", tot > 0 && hits >= 2);
  }
  /* only his real pixels react to the mouse; the page under the transparent parts stays usable */
  function hit(x, y) {
    if (!fig || fig.hidden || !mainAV) return false;
    var b = mainAV.body.getBoundingClientRect(); if (!b.width || x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
    if (!hitMap) return true;
    var px = Math.min(hitMap.w - 1, Math.floor((x - b.left) / b.width * hitMap.w)), py = Math.min(hitMap.h - 1, Math.floor((y - b.top) / b.height * hitMap.h));
    for (var dx = -1; dx <= 1; dx++) { var q = px + dx; if (q < 0 || q >= hitMap.w) continue; if (hitMap.d[(py * hitMap.w + q) * 4 + 3] > 60) return true; }
    return false;
  }

  /* ---------- life: blinking ---------- */
  var blinking = false;
  function blinkLoop() {
    if (blinking) return; blinking = true;
    (function b() { setTimeout(function () { blinkAll(true); setTimeout(function () { blinkAll(false); if (Math.random() < .18) setTimeout(function () { blinkAll(true); setTimeout(function () { blinkAll(false); b(); }, 110); }, 170); else b(); }, 120); }, rnd(2600, 6200)); })();
  }

  /* ---------- voice + lip sync (male voice preferred) ---------- */
  var soundOn = ls("bassem-snd") !== "0", unlocked = false, ttsBlocked = false;
  var synth = window.speechSynthesis, voices = [];
  function loadV() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
  if (synth) { loadV(); try { synth.addEventListener ? synth.addEventListener("voiceschanged", loadV) : (synth.onvoiceschanged = loadV); } catch (e) {} }
  var FEM = /female|woman|salma|hoda|zariyah|laila|layla|mariam|amira|samantha|zira|aria|jenny|serena|karen|moira|tessa|victoria|susan|hazel|libby|sonia|natasha|\bava\b|allison|amina|rana|shakira|nour|noura|emma|olivia|joanna|kendra|kimberly|salli|ivy|fiona|veena|catherine|clara|michelle|sara|google us english|google العربية/i;
  var MALE = /\bmale\b|shakir|hamed|naayf|fahed|tarek|tarik|omar|hamdan|bassel|moaz|zayd|rami|majed|maged|salim|david|mark\b|guy\b|ryan|daniel|george|james|thomas|alex\b|fred\b|oliver|arthur|christopher|eric\b|roger|brian|andrew|jason|tony\b|aaron|gordon|rishi|william|liam|davis|steffan|ralph|google uk english male/i;
  function voice(lang) {
    var c = voices.filter(function (v) { return lang === "ar" ? /^ar/i.test(v.lang) : /^en/i.test(v.lang); });
    if (!c.length) return null;
    var eg = c.filter(function (v) { return /ar[-_]EG/i.test(v.lang); }), male = function (v) { return MALE.test(v.name) && !FEM.test(v.name.replace(/\bmale\b/i, "")); }, notF = function (v) { return !FEM.test(v.name); };
    var pick = (lang === "ar" && eg.filter(male)[0]) || c.filter(male)[0];
    if (pick) return { v: pick, male: true };
    pick = (lang === "ar" && eg.filter(notF)[0]) || c.filter(notF)[0] || (lang === "ar" && eg[0]) || c[0];
    return { v: pick, male: false };
  }
  /* letter → mouth frame: 0 closed (m/b/f, pauses), 1 slightly open, 2 open (A), 3 rounded (O/U/W) */
  function vis(ch) {
    if (!ch) return 0;
    if (/[اآأإىaáàÁ]/i.test(ch)) return 2;
    if (/[وؤoOuUwWóú]/.test(ch)) return 3;
    if (/[مبفپmMbBpPfFvV]/.test(ch)) return 0;
    if (/[\s.,،؛!?؟…:\-]/.test(ch)) return 0;
    return 1;
  }
  var lip = { T: 0, word: "", wi: 0, bnd: false }, SAY = { id: 0 }, timers = [];
  function talking(on) { if (fig) fig.classList.toggle("talk", !!on); }
  function lipsOn() { clearInterval(lip.T); talking(true); lip.T = setInterval(function () { if (lip.word && lip.wi < lip.word.length) setV(vis(lip.word.charAt(lip.wi++))); else if (lip.bnd) setV(0); else setV([1, 2, 1, 3, 1, 0, 2][Math.floor(Math.random() * 7)]); }, 80); }
  function lipsOff() { clearInterval(lip.T); setV(0); }
  function clean(s) { return String(s || "").replace(/https?:\/\/\S+/g, "").replace(/\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDEFF]|[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/g, "").replace(/[•●▪«»"]/g, " ").replace(/\n+/g, ". ").replace(/\s+([.،,!؟?])/g, "$1").replace(/\s+/g, " ").replace(/^[\s.،]+/, "").trim(); }
  function sentences(s) { return s.replace(/([.!؟?…])\s+/g, "$1\u0001").split("\u0001").map(function (x) { return x.trim(); }).filter(Boolean); }
  function later(fn, ms) { var h = setTimeout(fn, ms); timers.push(h); return h; }
  function stop() { SAY.id++; timers.forEach(clearTimeout); timers = []; try { if (synth && (synth.speaking || synth.pending)) synth.cancel(); } catch (e) {} lipsOff(); talking(false); }
  function speak(text) {
    stop(); var id = SAY.id, spoken = clean(text); if (!spoken) return;
    sim(spoken, id); /* owner 2026-11-18: never the browser's synthetic voice for Bassem — his real voice is the Anam call or his recorded clip */
  }
  /* no voice: the mouth stays closed — never silent "talking" (owner 2026-11-18); the bubble carries the words */
  function sim(text, id) {
    lipsOff(); talking(false); setV(0);
  }
  function tts(spoken, id) {
    var parts = sentences(spoken), j = 0;
    (function one() {
      if (id !== SAY.id) return; if (j >= parts.length) { lipsOff(); talking(false); return; }
      var idx = j++, txt = parts[idx], u = new SpeechSynthesisUtterance(txt), V = voice(L), fired = false, fin = false;
      u.lang = L === "ar" ? "ar-EG" : "en-US"; if (V && V.v) u.voice = V.v;
      u.rate = L === "ar" ? .96 : .98;
      /* a deeper pitch when the browser only has a female / neutral voice for the language */
      u.pitch = (V && V.male ? .98 : .74) + (idx % 2 ? -.02 : .02) + (/[؟?]$/.test(txt) ? .05 : 0);
      var end = function () { if (fin) return; fin = true; lipsOff(); if (id !== SAY.id) return; later(one, rnd(140, 300)); };
      var toSim = function () { if (fin) return; fin = true; lipsOff(); sim(parts.slice(idx).join(" "), id); };
      u.onstart = function () { fired = true; lip.word = ""; lip.bnd = false; lipsOn(); ss("bassem-audio", "1"); };
      u.onboundary = function (e) { if (e.name && e.name !== "word") return; lip.bnd = true; var m = /^\S+/.exec(txt.slice(e.charIndex || 0)); lip.word = m ? m[0] : ""; lip.wi = 0; };
      u.onend = end;
      u.onerror = function (e) { var er = e && e.error; if (er === "interrupted" || er === "canceled") { fin = true; return; } if (er === "not-allowed") ttsBlocked = true; toSim(); };
      try { synth.speak(u); } catch (e) { toSim(); return; }
      later(function () { if (fired || fin) return; if (synth.speaking) { lipsOn(); (function poll() { later(function () { if (fin) return; if (synth.speaking || synth.pending) poll(); else end(); }, 300); })(); } else { try { synth.cancel(); } catch (x) {} toSim(); } }, 1100);
      later(function () { if (!fin && !synth.speaking) end(); }, 2500 + txt.length * 160);
    })();
  }

  /* ---------- what he says ---------- */
  var QUICK = [
    ["brief", "📰 ملخص فرص النهارده", "📰 Today's opportunities", "advisor.html#brief", "gold"],
    ["tenders", "افتحلي المناقصات", "Open the tenders", "tenders.html"],
    ["rfqs", "طلبات الأسعار", "Quote requests (RFQs)", "rfqs.html"],
    ["projects", "المشاريع وأخبارها", "Projects & their news", "projects.html"],
    ["markets", "الأسواق", "Markets", "export-market.html"]
  ];
  var TIPS = {
    tenders: ["دي المناقصات المصرية المفتوحة. صفّي بقطاعك، وركّز على ميعاد الإغلاق وقيمة التأمين وسعر الكراسة. لو لقيت مناقصة على مقاسك، افتحها في المستشار وابدأ عليها صفقة وأنا أتابعها معاك لحد ما تتقفل.", "These are the open Egyptian tenders. Filter by your sector and check the closing date, bid bond and booklet price. If one fits you, open it in the Advisor and start a deal; I'll follow it with you until it closes."],
    intl: ["دي المناقصات الدولية في الأسواق. خليك على الأسواق اللي في باقتك، واقرا الإعلان الرسمي كامل من مصدره قبل ما تقرر.", "These are the international tenders. Stick to the markets in your plan, and read the full official notice at its source before you decide."],
    rfqs: ["طلبات الأسعار فرص سريعة: اللي بيرد بدري بعرض واضح فيه السعر ومدة التوريد بيكسب. اختار الطلب المناسب، وأنا أجهّزلك إيميل الرد من المستشار.", "Quote requests move fast: whoever replies early with a clear price and lead time wins. Pick the right request and I'll draft the reply email for you in the Advisor."],
    projects: ["المشاريع الكبرى بتوريك الطلب الجاي قبل ما يتطرح. تابع المشروع وأخباره، واعرف مين المالك والمقاول عشان تقدّم منتجاتك بدري.", "Big projects show you tomorrow's demand before it is tendered. Follow the project and its news, and find the owner and contractor so you can offer your products early."],
    project: ["اقرا مرحلة المشروع والجهة المالكة كويس: لو لسه في الطرح أو الترسية، ده وقتك تتواصل وتعرّف بشركتك.", "Check the project stage and owner: if it is still at tendering or award, now is the time to reach out and introduce your company."],
    "project-news": ["أخبار المشاريع بتقولك مين اتعاقد ومين هيشتري. أي خبر يخص قطاعك، تابعه وجهّز عرض تعريف بشركتك.", "Project news tells you who signed and who will buy. Follow anything in your sector and prepare an introduction of your company."],
    news: ["أخبار السوق والمشتريات بتفرق في توقيت قرارك. لو خبر فتح باب لقطاعك، افتح المستشار وشوف الفرص المرتبطة بيه.", "Market and procurement news can change your timing. If a story opens a door for your sector, open the Advisor and check the related opportunities."],
    "export-market": ["الأسواق اللي في باقتك: {markets}. شوف المنتجات المطلوبة في كل سوق، والفرص الجديدة فيها بتوصلك كل يوم في ملخص المستشار.", "The markets in your plan: {markets}. See what each market buys; new opportunities there reach you every day in the Advisor brief."],
    winners: ["الترسيات بتقولك مين بيكسب ومين بيشتري: اعرف منافسينك، وتواصل مع المقاولين الفايزين كعملاء محتملين لمنتجاتك.", "Awards tell you who wins and who buys: know your competitors, and approach the winning contractors as potential customers."],
    radar: ["رادار الفرص بيلخّصلك الفرص حسب القطاع. اختار قطاعك وشوف الفرص المرتبطة بيه، وابدأ صفقة على المناسب منها في المستشار.", "The opportunity radar groups opportunities by sector. Pick yours, review the related ones and start a deal on the right one in the Advisor."],
    advisor: ["ده مكتبي 😊 هنا ملخص فرص النهارده في أسواقك، وصفقاتك ومراسلاتك وتذكيراتك. ابدأ صفقة على أي فرصة وأنا أتابعها معاك خطوة بخطوة لحد التعاقد.", "This is my desk 😊 Today's opportunities in your markets, your deals, emails and reminders are all here. Start a deal on any opportunity and I'll follow it with you step by step until the contract."],
    dashboard: ["أهلاً بيك في لوحة مصنعك. من هنا تفتح المناقصات وطلبات الأسعار والمشاريع، وأنا معاك كل يوم بملخص الفرص الجديدة والمتابعات.", "Welcome to your factory dashboard. Open tenders, RFQs and projects from here; I'm with you every day with new opportunities and follow-ups."]
  };
  TIPS.awards = TIPS.winners; TIPS.entity = TIPS.winners; TIPS.winner = TIPS.winners; TIPS["media-center"] = TIPS.news; TIPS.article = TIPS.news;
  function fillVars(s) { return s.replace("{markets}", mkList(ME.markets || [])).replace("{name}", ME.name || ""); }
  function greeting() {
    var h = new Date().getHours(), g = h < 12 ? T("صباح الخير", "Good morning") : T("مساء الخير", "Good evening");
    return g + (EN ? ", " : " يا ") + ME.name + " 👋 " + T("أنا باسم، مستشار أعمالك.", "I'm Bassem, your business advisor.");
  }
  function renewTxt() {
    if (ME.expired) return T("مدة خدمتي السنوية معاك خلصت. جدّد اشتراكك في باقة الشريك عشان نكمّل شغلنا سوا.", "My one-year service period with you has ended. Renew your partner plan so we can keep working together.");
    if (ME.left <= 30) return T(leftTxt(ME.left) + " في مدة خدمتي معاك. فكّر في التجديد من دلوقتي عشان المتابعة ما تقفش.", "There are " + leftTxt(ME.left) + " in my service period. Consider renewing now so the follow-up doesn't stop.");
    return "";
  }
  function tipFor(p) { var t = TIPS[p]; return t ? fillVars(T(t[0], t[1])) : ""; }
  function acts(withVideo) {
    var a = [];
    if (ME.expired) return '<a class="gold" href="register.html#' + esc(ME.plan || "partner") + '">🔄 ' + T("جدّد الاشتراك", "Renew") + '</a><a href="contact.html">' + T("تواصل معنا", "Contact us") + "</a>";
    /* «🛠️ المطوّر» → bassem_live off (data/flags.js): no 🎥 (the Worker refuses the call too; html.mig-off-bassem_live hides a late one) */
    if (withVideo !== false && !(window.MIGFLAGS && MIGFLAGS.on && MIGFLAGS.on("bassem_live") === false)) a.push('<button type="button" class="vid" data-bs="video">🎥 ' + T("كلّم باسم فيديو", "Video call with Bassem") + "</button>");
    if (ME.expired || ME.left <= 30) a.push('<a class="gold" href="register.html#' + esc(ME.plan || "partner") + '">🔄 ' + T("جدّد الاشتراك", "Renew") + "</a>");
    QUICK.forEach(function (q) { if (q[0] === PAGE || (q[0] === "brief" && PAGE === "advisor" && !ME.expired)) { if (q[0] === "brief") a.push('<button type="button" class="' + (q[4] || "") + '" data-bs="brief">' + esc(T(q[1], q[2])) + "</button>"); return; } a.push('<a href="' + esc(url(q[3])) + '"' + (q[4] ? ' class="' + q[4] + '"' : "") + ">" + esc(T(q[1], q[2])) + "</a>"); });
    return a.join("");
  }
  function show(text, o) {
    o = o || {}; build(); if (!ON) return;
    bub.hidden = false; fig.classList.add("open"); bub.classList.toggle("peek", !!o.peek);
    bodyEl.textContent = text; actsEl.innerHTML = o.acts != null ? o.acts : acts(); bodyEl.scrollTop = 0;
    layout(); setTimeout(layout, 60);
    if (o.speak !== false) speak(text); else stop();
  }
  function intro(peek) {
    if (ME.expired) { show(greeting() + "\n" + renewTxt(), { peek: !!peek }); return; }
    var tip = tipFor(PAGE), rn = renewTxt(), first = ss("bassem-hi") !== isoDay(new Date());
    /* first time today: he asks how the member is (quick answers «الحمد لله تمام» / «مش أحسن حاجة النهارده») */
    var txt = first || !tip ? greeting() + (first ? " " + T("إزي حضرتك؟ وأخبارك إيه النهارده؟", "How are you? How is your day going?") : "") + "\n" + (ME.expired ? "" : T(leftTxt(ME.left) + " في خدمتي السنوية معاك.", "There are " + leftTxt(ME.left) + " in my one-year service.")) + (tip ? "\n" + tip : "\n" + T("تحب أبدألك بملخص فرص النهارده؟", "Shall we start with today's opportunities?")) : tip;
    if (rn) txt += "\n" + rn;
    ss("bassem-hi", isoDay(new Date()));
    show(txt, { peek: !!peek, acts: first ? moodActs() + acts() : null });
  }
  function moodActs() { return '<button type="button" data-bs="fine">🤲 ' + esc(T("الحمد لله تمام", "All good, thank God")) + '</button><button type="button" data-bs="down">😔 ' + esc(T("مش أحسن حاجة النهارده", "Not my best day")) + "</button>"; }
  function hideBub() { if (!bub) return; stop(); bub.hidden = true; bub.classList.remove("peek"); fig.classList.remove("open"); layout(); ghostSoon(); }
  function minimise() { MINI = true; hideBub(); ls("bassem-min", "1"); dock(true); }
  function restore(open) { MINI = false; ls("bassem-min", "0"); unlocked = true; if (!ON) return; dock(false); layout(); if (open !== false) intro(false); }

  /* ---------- video call (Janna Live overlay with the Bassem persona) ---------- */
  function video() {
    stop(); closeWelcome();
    if (ME.expired) { show(renewTxt(), { acts: acts(false) }); return; }
    var J = window.JANNA_LIVE;
    if (J && typeof J.open === "function") { hideBub(); try { J.open({ persona: "bassem", lang: L }); } catch (e) { try { J.open(); } catch (x) {} } return; }
    show(T("مكالمة الفيديو مش متاحة على الصفحة دي دلوقتي. جرّب تاني بعد شوية، وأنا معاك هنا لحد كده.", "Video calls are not available on this page right now. Please try again shortly; I'm here with you meanwhile."), { acts: acts(false) });
  }

  /* ---------- welcome overlay (first sign-in) ---------- */
  var wel = null, welAV = null, ccObs = null;
  /* live captions (data/captions.js: fixed at the bottom, above every layer) show what he says while the welcome is open:
     keep a strip under the box for them — two caption lines from the start, more if a longer caption needs it (never shrinks while open) */
  function ccOn() { if (!window.MIGCAPTIONS) return false; try { return localStorage.getItem("mig-cc") !== "0"; } catch (e) { return true; } }
  function ccRoom() {
    if (!wel) return;
    var c = document.querySelector(".mig-cc"), need = 0, wl = wel.querySelector(".bs-wl"), bx = wel.querySelector(".bs-wbox");
    var wide = wl && bx && window.innerWidth > 760 && wl.getBoundingClientRect().width >= 200;
    document.documentElement.classList.toggle("bs-welcc", !!(c && wide));
    if (wide) {
      var a = wl.getBoundingClientRect(), b = bx.getBoundingClientRect(), de = document.documentElement.style;
      de.setProperty("--bs-ccl", Math.round(a.left + 12) + "px"); de.setProperty("--bs-cct", Math.round(b.top + 18) + "px"); de.setProperty("--bs-ccw", Math.round(a.width - 24) + "px");
      wel.style.removeProperty("--bs-cc"); return;
    }
    if (c && ccOn()) {
      var cs = getComputedStyle(c), lh = parseFloat(cs.lineHeight) || 1.7 * (parseFloat(cs.fontSize) || 16), pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), bot = parseFloat(cs.bottom) || 18;
      need = Math.ceil(bot + Math.max(2 * lh + pad, c.classList.contains("on") ? c.offsetHeight : 0) + 8);
    }
    var cur = parseFloat(wel.style.getPropertyValue("--bs-cc")) || 0;
    if (need > cur) wel.style.setProperty("--bs-cc", need + "px");
  }
  function ccWatch() {
    ccRoom(); setTimeout(ccRoom, 450); /* again once the box has finished sliding in */
    var c = document.querySelector(".mig-cc");
    if (c && window.MutationObserver && !ccObs) { ccObs = new MutationObserver(function () { ccRoom(); }); ccObs.observe(c, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] }); }
  }
  function ccUnwatch() { if (ccObs) { ccObs.disconnect(); ccObs = null; } document.documentElement.classList.remove("bs-welcc"); }
  window.addEventListener("resize", function () { if (wel) { wel.style.removeProperty("--bs-cc"); ccRoom(); } });
  function closeWelcome() { if (!wel) return; stop(); ccUnwatch(); var w = wel; wel = null; if (welAV) { AVS.splice(AVS.indexOf(welAV), 1); welAV = null; } w.remove(); document.documentElement.style.overflow = ""; ghostSoon(); if (welRet && welRet.focus) try { welRet.focus(); } catch (e) {} }
  var welRet = null;
  function welcome(force) {
    if (window.BASSEM_STAND) return; /* the standing cut-out greets instead (owner: no framed Bassem) */
    ME = info(); if (!ME.eligible) return false;
    /* the platform's own operations account (role admin) works on these pages: no welcome overlay over its navigation (review A3) */
    var su = srvUser(); if (!force && su && String(su.role || "") === "admin") return false;
    /* a 24 h session opened by an e-mailed request link (MIGAPI.linkSession): he came to answer that request — the welcome waits for the
       next e-mail-code sign-in instead of covering the quote form */
    try { if (!force && window.MIGAPI && MIGAPI.linkSession && MIGAPI.linkSession()) return false; } catch (e) {}
    var key = "bassem-welcomed:" + ME.user; if (!force && ls(key) === "1") return false;
    ls(key, "1"); closeWelcome(); hideBub(); welRet = document.activeElement;
    var mk = mkList(ME.markets || []), pr = Math.round(ME.used * 100 / ME.total);
    var B = [
      ["📰", T("أفتحلك المناقصات وطلبات الأسعار والمشاريع وأخبارها أول بأول.", "I open tenders, RFQs, projects and their news for you as they come.")],
      ["🌍", T("أجيبلك فرص جديدة كل يوم في أسواق باقتك: " + mk + ".", "I bring you new opportunities every day in your plan's markets: " + mk + ".")],
      ["🗞️", T("أتابعلك أخبار المشتريات والمشاريع اللي تهم قطاعك.", "I follow the procurement and project news that matters to your sector.")],
      ["🤝", T("أرشدك إزاي تتواصل مع الجهة وتتعاقد خطوة بخطوة.", "I guide you on how to contact the buyer and contract, step by step.")],
      ["✉️", T("أجهّزلك الإيميلات وتبعتها من المنصة، وأوصّلك الردود — ومفيش حاجة بتتبعت غير بموافقتك.", "I draft your emails, you send them through the platform and replies reach you — nothing is sent without your approval.")],
      ["📌", T("أتابع معاك كل صفقة لحد ما تتقفل.", "I follow every deal with you until it closes.")],
      ["📲", T("أبعتلك تنبيهات واتساب بالفرص والمواعيد المهمة (بعد موافقتك).", "I send you WhatsApp alerts about opportunities and key deadlines (with your consent).")]
    ];
    var X = ME.expired;
    var srcNote = ME.src === "activation" ? T("من تاريخ تفعيل اشتراكك", "from your activation date") : T("محسوبة من أول دخول ليك، لحد ما يتأكد تاريخ التفعيل", "counted from your first sign-in until the activation date is confirmed");
    wel = document.createElement("div"); wel.className = "bs-wel"; wel.setAttribute("translate", "no"); wel.setAttribute("role", "dialog"); wel.setAttribute("aria-modal", "true"); wel.setAttribute("aria-labelledby", "bsWT");
    wel.innerHTML = '<div class="bs-wbox" dir="' + (EN ? "ltr" : "rtl") + '" lang="' + L + '"><button type="button" class="bs-wx" data-bw="close" aria-label="' + T("إغلاق", "Close") + '">✕</button>'
      + '<div class="bs-wl"><div class="bs-wfig"><div class="bs-in"></div></div><div class="bs-who"><b>' + T("باسم", "Bassem") + "</b><small>" + T("مستشار أعمالك الشخصي", "Your personal business advisor") + "</small></div></div>"
      + '<div class="bs-wr"><h2 id="bsWT">' + esc(T("أهلاً يا " + ME.name + " 👋", "Welcome, " + ME.name + " 👋")) + "</h2>"
      + '<p class="lead">' + esc(X ? renewTxt() : T("أنا باسم، مستشار الأعمال بتاعك لمدة سنة. من النهارده أنا معاك كل يوم في " + ME.planName + ": بدوّرلك على الفرص، وبجهّزلك المراسلات، وبتابع معاك كل صفقة لحد ما تتقفل.", "I'm Bassem, your business advisor for one year. From today I'm with you every day on the " + ME.planName + ": I find opportunities, prepare your correspondence and follow every deal with you until it closes.")) + "</p>"
      + (X ? "" : '<ul class="bs-wli">' + B.map(function (x) { return "<li><i>" + x[0] + "</i><span>" + esc(x[1]) + "</span></li>"; }).join("") + "</ul>")
      + '<div class="bs-per"><div class="r"><b>⏳ ' + T("مدة الخدمة: 365 يوم", "Service period: 365 days") + '</b><span class="n">' + (ME.expired ? T("انتهت", "Ended") : esc(leftTxt(ME.left))) + '</span></div><div class="bs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="365" aria-valuenow="' + ME.used + '"><i style="width:' + Math.max(2, pr) + '%"></i></div><small>' + esc(T("من ", "From ") + fDay(ME.start) + T(" لحد ", " to ") + fDay(ME.end) + " · " + srcNote) + "</small></div>"
      + '<div class="bs-wact">' + (X ? '<a class="go" href="register.html#' + esc(ME.plan || "partner") + '">🔄 ' + T("جدّد الاشتراك", "Renew") + '</a><a class="vid" href="contact.html">' + T("تواصل معنا", "Contact us") + "</a>"
        : '<a class="go" href="advisor.html#brief" data-bw="go">🚀 ' + T("يلا نبدأ: ملخص فرص النهارده", "Let's start: today's opportunities") + '</a><button type="button" class="vid" data-bw="video">🎥 ' + T("كلّمني فيديو", "Video call me") + "</button>") + '<button type="button" class="later" data-bw="close">' + T("بعدين", "Later") + "</button></div></div></div>";
    document.body.appendChild(wel); document.documentElement.style.overflow = "hidden"; ccWatch();
    if (REAL) welAV = makeAV(wel.querySelector(".bs-in")); else wel.querySelector(".bs-in").innerHTML = '<img class="bs-photo" alt="" src="' + esc(HEAD) + '" style="position:static;width:100%;aspect-ratio:1;object-fit:cover;border-radius:50%">';
    blinkLoop();
    wel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-bw]"); if (!b) { if (e.target === wel) closeWelcome(); return; }
      var k = b.getAttribute("data-bw");
      if (k === "close") { closeWelcome(); return; }
      if (k === "video") { video(); return; }
      if (k === "go" && PAGE === "advisor") { e.preventDefault(); closeWelcome(); var s = document.getElementById("brief"); if (s) s.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); }
    });
    wel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeWelcome(); return; }
      if (e.key !== "Tab") return; var f = [].slice.call(wel.querySelectorAll("a,button")); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    setTimeout(function () { var g = wel && wel.querySelector(".go"); if (g) { try { g.focus({ preventScroll: true }); } catch (e) { g.focus(); } wel.querySelector(".bs-wbox").scrollTop = 0; } }, 60);
    if (X) { speak(T("أهلاً يا " + ME.name + ". ", "Welcome, " + ME.name + ". ") + renewTxt()); return true; }
    speak(T("أهلاً يا " + ME.name + ". أنا باسم، مستشار الأعمال بتاعك لمدة سنة. هفتحلك المناقصات وطلبات الأسعار والمشاريع، وأجيبلك فرص جديدة كل يوم، وأجهّزلك المراسلات، وأتابع معاك كل صفقة لحد ما تتقفل. يلا نبدأ بملخص فرص النهارده.", "Welcome, " + ME.name + ". I'm Bassem, your business advisor for one year. I'll open tenders, RFQs and projects for you, bring you new opportunities every day, prepare your correspondence and follow every deal with you until it closes. Let's start with today's opportunities."));
    return true;
  }

  /* ---------- events ---------- */
  var wired = false;
  function wire() {
    if (wired) return; wired = true;
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.isTrusted !== false) { unlocked = true; ttsBlocked = false; } }, true); });
    var toggle = function () { unlocked = true; if (bub.hidden) intro(false); else hideBub(); };
    if (REAL) {
      document.addEventListener("click", function (e) {
        if (!ON || fig.hidden || (e.target.closest && e.target.closest(".bs-bub,.bs-x,.bs-tag,.bs-mini,.bs-wel"))) return;
        if (hit(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); toggle(); }
      }, true);
      ["pointerdown", "mousedown"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (!ON || fig.hidden || (e.target.closest && e.target.closest(".bs-bub,.bs-x,.bs-tag,.bs-mini,.bs-wel"))) return; if (hit(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); } }, true); });
      var hr = 0; document.addEventListener("pointermove", function (e) { if (hr || e.pointerType === "touch" || !ON) return; var x = e.clientX, y = e.clientY; hr = requestAnimationFrame(function () { hr = 0; var h = !fig.hidden && hit(x, y) && !(document.elementFromPoint(x, y) || document.body).closest(".bs-bub,.bs-wel"); fig.classList.toggle("hot", h); document.documentElement.classList.toggle("bs-hot", h); }); }, { passive: true });
    } else fig.addEventListener("click", function (e) { if (e.target.closest(".bs-x")) return; toggle(); });
    fig.querySelector(".bs-x").addEventListener("click", function (e) { e.stopPropagation(); minimise(); });
    var tag = fig.querySelector(".bs-tag");
    tag.addEventListener("click", function (e) { e.stopPropagation(); unlocked = true; intro(false); });
    tag.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); unlocked = true; intro(false); } });
    mini.addEventListener("click", function () { restore(true); });
    bub.addEventListener("click", function (e) {
      unlocked = true; var b = e.target.closest("button,a"); if (!b) return;
      if (b.classList.contains("bs-cl")) { hideBub(); return; }
      if (b.classList.contains("bs-snd")) { soundOn = !soundOn; ls("bassem-snd", soundOn ? "1" : "0"); if (!soundOn) stop(); chrome(); return; }
      var k = b.getAttribute("data-bs");
      if (k === "video") { video(); return; }
      if (k === "fine") { show(T("يا رب دايماً دايماً بخير وسلامة 🤲", "May you always be well and safe 🤲") + "\n" + T("تحب أبدألك بملخص فرص النهارده؟", "Shall we start with today's opportunities?")); return; }
      if (k === "down") { show(T("ألف سلامة عليك… إحنا معاك، وإن شاء الله نحاول نبسطك ونساعدك.", "Sorry to hear that… we're with you, and we'll do our best to make your day better and help you.") + "\n" + T("خلّيني أشيل عنك حاجة: أفتحلك أهم فرصة النهارده؟", "Let me take something off your plate: shall I open today's most important opportunity?")); return; }
      if (k === "brief") { hideBub(); var s = document.getElementById("brief"); if (s) s.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); return; }
      stop();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && bub && !bub.hidden && !wel) hideBub(); });
    window.addEventListener("resize", layout); window.addEventListener("orientationchange", function () { setTimeout(layout, 300); });
    window.addEventListener("scroll", ghostSoon, { passive: true });
  }

  /* ---------- activation: Janna steps aside, Bassem takes over ---------- */
  function hideJanna() {
    document.documentElement.classList.add("bs-on");
    try { if (window.JANNA && typeof JANNA.stop === "function") JANNA.stop(); } catch (e) {}
  }
  function activate(fromLogin) {
    ME = info();
    if (!present(ME)) { if (ON) { ON = false; if (fig) { stop(); fig.hidden = true; mini.hidden = true; bub.hidden = true; } document.documentElement.classList.remove("bs-on"); fire(); } return; }
    hideJanna(); build(); ON = true; chrome(); blinkLoop();
    /* on the advisor page he waits as his round headshot (the page itself is his desk; no figure over its controls) */
    /* the admin requests monitor (inbox.html) is a working console: he waits docked and quiet there, as on the advisor */
    var quiet = PAGE === "advisor" || PAGE === "inbox" || PAGE === "dashboard", startMini = MINI || quiet; MINI = startMini;
    dock(startMini);
    layout(); fire();
    var shown = (PAGE === "dashboard" || PAGE === "advisor" || fromLogin) ? welcome(false) : false;
    if (shown) return;
    /* a short page tip once per page per tab session (he stays quiet on the advisor, where his advice is the page itself) */
    var sk = "bassem-seen:" + PAGE;
    if (!quiet && !startMini && ss(sk) !== "1") { ss(sk, "1"); setTimeout(function () { if (ON && bub.hidden && !wel) intro(true); }, fromLogin ? 400 : 1300); }
    else ghostSoon();
  }
  function fire() { try { window.dispatchEvent(new CustomEvent("bassem:change", { detail: { active: ON } })); } catch (e) {} }
  window.addEventListener("mig:login", function () { unlocked = true; activate(true); });
  /* the server answered (GET /api/me) or the member signed out: show / hide him to match the confirmed plan */
  window.addEventListener("mig:me", function () { var was = ON, i = info(); if (present(i) !== was) activate(false); else if (ON) { ME = i; chrome(); } });
  window.addEventListener("mig:logout", function () { activate(false); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) { var was = ON; ME = info(); if (present(ME) !== was) activate(false); } });

  /* ---------- public API ---------- */
  window.BASSEM = {
    info: function () { return info(); }, period: function (u, act) { return period(u, act); }, active: function () { return ON; },
    open: function () { if (ON) { restore(true); } }, say: function (t) { if (ON) show(String(t || "")); }, close: hideBub, minimise: minimise, restore: restore,
    welcome: function (force) { return welcome(force !== false); }, video: video, stop: stop,
    viseme: setV, blink: blinkAll, headshot: HEAD
  };
  function start() { if (present(ME)) activate(false); else fire(); }
  if (document.readyState !== "loading") setTimeout(start, 0); else document.addEventListener("DOMContentLoaded", start);
})();
