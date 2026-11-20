# AI Deal Advisor («المستشار الذكي للصفقات»): advisor.html — partner & strategic plans only (gated in site.py via GATES['advisor']).
# Bassem («باسم», data/bassem.js) is the member's personal business advisor here (365 days from activation): daily brief of real opportunities in the plan's markets (REAL.tenders_intl, REAL.tenders, MIGTEND, MIGRFQ),
# a deals pipeline, a deal room (contracting guide from data/advisor-guides.js, email composer, thread, timeline) and reminders.
# Backend: /api/advisor (Cloudflare Worker). When it is unreachable the page runs in DEMO mode (localStorage + mailto:).
# Activation link: advisor.html#login=<code> → POST /login {code} → token (sessionStorage "mig-adv-token", as live mode) + member.
# Platform mode: when the member is signed in to the platform (data/mig-api.js, e-mail code), the page waits for GET /api/me and, for a
# partner / strategic plan the SERVER confirmed, uses that platform token for /api/advisor/* (no activation link needed on any device).
# A plan the server does not confirm ends on the lock box; nothing here trusts a plan stored in the browser.
# All UI text is bilingual in code: T(ar, en).
PAGES['advisor'] = ('المستشار الذكي للصفقات – صنع في مصر', 'rfq', COMMON_CSS + '''
.advh { background: radial-gradient(ellipse at 15% 0%, #5A0614 0%, #8E0B20 50%, #4A0510 100%); color: #fff; border-bottom: 1px solid rgba(192,147,0,.4); }
.advh .wrap { padding-block: 26px 22px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.advh .av { width: 88px; height: 88px; border-radius: 50%; border: 3px solid var(--gold); object-fit: cover; flex: none; background: #fff; box-shadow: 0 0 0 6px rgba(192,147,0,.15); }
.advh .tx { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.advh .crumb { font-size: .8rem; opacity: .8; } .advh .crumb a { color: #fff; }
.advh h1 { font-size: clamp(1.25rem, 3vw, 1.95rem); font-weight: 900; }
.advh h1 small { display: block; font-size: .56em; color: #E2BE72; font-weight: 800; margin-top: 2px; }
.advh .say { opacity: .93; max-width: 62em; font-size: .95rem; }
.advh .bdg { display: flex; flex-wrap: wrap; gap: 6px; }
.advh .bdg span { background: rgba(255,255,255,.14); border-radius: 99px; padding: 2px 12px; font-size: .8rem; font-weight: 700; }
.advh .bdg .pl { background: var(--gold); color: #1A1204; }
.advh .bdg .demo { background: #FFF4E0; color: #8A5200; }
.advh .bdg .live { background: #E3F7EA; color: #0B6B35; }
.advh .bdg .lk { opacity: .6; text-decoration: line-through; }
.advh .acts { display: flex; gap: 8px; flex-wrap: wrap; }
.advh .acts .btn-gh { background: rgba(255,255,255,.12); color: #fff; border-color: rgba(255,255,255,.35); }
.advh .advmem { margin: 0; font-size: .82rem; opacity: .92; }
.advm { padding-block: 22px 70px; display: flex; flex-direction: column; gap: 22px; }
.advsec { display: flex; flex-direction: column; gap: 12px; scroll-margin-top: 90px; }
.advsec > header { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.advsec > header h2 { font-size: 1.22rem; font-weight: 900; display: flex; align-items: center; gap: 8px; }
.advsec > header h2::before { content: ""; width: 5px; height: 22px; border-radius: 3px; background: var(--gold); }
.advsec > header p { color: var(--muted); font-size: .86rem; }
.advwarn { background: var(--gold-soft); border: 1px dashed var(--gold); border-radius: 14px; padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; font-size: .9rem; }
.advk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.advk button { font: inherit; text-align: start; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--green); border-radius: 14px; padding: 12px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: transform .15s ease, box-shadow .15s ease; }
.advk button:hover { transform: translateY(-2px); box-shadow: 0 12px 22px -18px rgba(0,0,0,.5); }
.advk button.on { background: var(--green-soft); }
.advk b { font-size: 1.6rem; font-weight: 900; color: var(--green); font-variant-numeric: tabular-nums; line-height: 1.2; }
.advk span { font-size: .8rem; color: var(--muted); font-weight: 700; }
.advk .k2 { border-top-color: #D97706; } .advk .k2 b { color: #B45309; }
.advk .k3 { border-top-color: var(--gold); } .advk .k3 b { color: var(--gold-deep); }
.advk .k4 { border-top-color: #2563EB; } .advk .k4 b { color: #1D4ED8; }
.advrem { display: flex; flex-direction: column; gap: 6px; }
.advrem button { font: inherit; color: var(--fg); text-align: start; display: flex; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-inline-start: 4px solid var(--muted); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
.advrem button:hover { background: var(--sunken); }
.advrem .red { border-inline-start-color: #C0392B; } .advrem .amber { border-inline-start-color: #D97706; } .advrem .blue { border-inline-start-color: #2563EB; }
.advrem small { color: var(--muted); display: block; font-size: .78rem; }
.advrem em { font-style: normal; margin-inline-start: auto; font-size: .78rem; font-weight: 800; color: var(--green); white-space: nowrap; }
.advtabs { display: flex; gap: 6px; flex-wrap: wrap; }
.advtabs button { font: inherit; font-weight: 700; font-size: .86rem; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 6px 12px; cursor: pointer; color: var(--fg); display: inline-flex; gap: 6px; align-items: center; }
.advtabs button.on { background: var(--green-deep); color: #fff; border-color: var(--green-deep); }
.advtabs button.lk { color: var(--muted); border-style: dashed; }
.advtabs button i { font-style: normal; font-size: .72rem; background: var(--sunken); color: var(--muted); border-radius: 99px; padding: 0 7px; }
.advtabs button.on i { background: rgba(255,255,255,.2); color: #fff; }
.advtools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.advtools input[type=search], .advtools select { font: inherit; font-size: .88rem; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 7px 12px; min-width: 0; }
.advtools input[type=search] { flex: 1 1 220px; }
.advtools label { display: inline-flex; gap: 6px; align-items: center; font-size: .86rem; font-weight: 700; cursor: pointer; }
.advg { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.opc { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.opc.nw { border-color: rgba(200,16,46,.45); box-shadow: 0 10px 22px -20px rgba(142,11,32,.8); }
.opc-t { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.opc-t .fl { font-size: 1.15rem; line-height: 1; }
.opc h3 { font-size: .97rem; font-weight: 800; line-height: 1.6; overflow-wrap: anywhere; }
.opc-m { display: flex; flex-direction: column; gap: 2px; font-size: .82rem; color: var(--muted); }
.opc-m span { overflow-wrap: anywhere; }
.opc-f { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: .8rem; margin-top: auto; }
.opc-f a { font-weight: 700; }
.opc-a { display: flex; gap: 6px; flex-wrap: wrap; }
.opc-a .btn { flex: 1 1 auto; }
.chip-new { background: var(--green); color: #fff; }
.chip-blue { background: #E8F0FE; color: #1D4ED8; }
.cd-red { background: #FDECEC; color: #B42318; } .cd-amber { background: #FFF4E0; color: #A86400; } .cd-gray { background: var(--sunken); color: var(--muted); }
.advempty { background: var(--surface); border: 1px dashed var(--line); border-radius: 14px; padding: 22px; text-align: center; color: var(--muted); display: flex; flex-direction: column; gap: 8px; align-items: center; }
.advup { background: linear-gradient(135deg, #4A0510, #8E0B20); color: #fff; border-radius: 14px; padding: 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.advmore { align-self: center; }
.advkb { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 1fr); gap: 10px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; }
.kc { background: var(--sunken); border: 1px solid var(--line); border-radius: 14px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 180px; scroll-snap-align: start; transition: background .15s ease, border-color .15s ease; }
.kc.over { background: var(--green-soft); border-color: var(--green); border-style: dashed; }
.kc > h3 { font-size: .86rem; font-weight: 800; display: flex; gap: 6px; align-items: center; padding: 2px 4px; }
.kc > h3 i { font-style: normal; margin-inline-start: auto; background: var(--surface); border-radius: 99px; padding: 0 8px; font-size: .75rem; color: var(--muted); }
.kc-b { display: flex; flex-direction: column; gap: 8px; }
.kc-e { font-size: .76rem; color: var(--muted); text-align: center; padding: 10px 4px; border: 1px dashed var(--line); border-radius: 10px; }
.dc { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 6px; cursor: grab; font-size: .82rem; }
.dc.drag { opacity: .5; }
.dc .dc-o { font: inherit; border: 0; background: none; padding: 0; text-align: start; cursor: pointer; color: var(--fg); font-weight: 800; font-size: .86rem; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dc .dc-o:hover { color: var(--green); }
.dc small { color: var(--muted); }
.dc .dc-n { background: var(--sunken); border-radius: 8px; padding: 5px 8px; font-size: .78rem; }
.dc .dc-n.late { background: #FDECEC; color: #B42318; font-weight: 700; }
.dc select, .adr select, .adr input, .adr textarea { font: inherit; font-size: .84rem; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; min-width: 0; width: 100%; }
.adr { position: fixed; inset: 0; z-index: 100; background: rgba(26,4,9,.55); display: flex; justify-content: flex-start; }
.adr .pn { width: min(860px, 100%); height: 100%; background: var(--bg); overflow-y: auto; overscroll-behavior: contain; box-shadow: 0 0 40px rgba(0,0,0,.4); display: flex; flex-direction: column; animation: adrIn .25s ease both; }
@keyframes adrIn { from { transform: translateX(30px); opacity: .4; } to { transform: none; opacity: 1; } }
html[dir=ltr] .adr .pn { animation-name: adrInL; } @keyframes adrInL { from { transform: translateX(-30px); opacity: .4; } to { transform: none; opacity: 1; } }
.adr .pn-h { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--line); padding: 12px 16px calc(10px); padding-top: calc(12px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; gap: 8px; }
.adr .pn-h .r1 { display: flex; gap: 10px; align-items: flex-start; }
.adr .pn-h h2 { font-size: 1.05rem; font-weight: 900; line-height: 1.5; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.adr .x { border: 0; background: var(--sunken); width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1rem; flex: none; }
.adr .pn-b { padding: 16px; display: flex; flex-direction: column; gap: 14px; padding-bottom: calc(40px + env(safe-area-inset-bottom, 0px)); }
.adr .stg { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: .84rem; font-weight: 700; }
.adr .stg select { width: auto; }
.adr .seg2 { align-self: flex-start; }
.adr .card2 { padding: 16px; gap: 10px; }
.adr .card2 h3 { font-size: 1rem; font-weight: 800; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.adr dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: .88rem; margin: 0; }
.adr dt { color: var(--muted); } .adr dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.adr .f2 input, .adr .f2 select, .adr .f2 textarea { width: 100%; }
.adr .acts2 { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.adr .hint { font-size: .8rem; color: var(--muted); }
.jtip { background: var(--gold-soft); border: 1px solid rgba(192,147,0,.35); border-radius: 14px; padding: 12px 14px; display: flex; gap: 12px; align-items: flex-start; }
.jtip img { width: 44px; height: 44px; border-radius: 50%; flex: none; border: 2px solid var(--gold); }
.jtip ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: .88rem; flex: 1; }
.jtip li { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
.jtip li.red { color: #B42318; font-weight: 700; } .jtip li.amber { color: #8A5200; font-weight: 700; }
.jtip li .btn { padding: 1px 10px; font-size: .76rem; }
.ckl { display: flex; flex-direction: column; gap: 6px; list-style: none; margin: 0; padding: 0; }
.ckl label, .ckl li.pl { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); font-size: .88rem; cursor: pointer; }
.ckl li.pl { cursor: default; }
.ckl input { margin-top: 5px; accent-color: var(--green); width: 16px; height: 16px; flex: none; }
.ckl label.done span { text-decoration: line-through; color: var(--muted); }
.ckl small { display: block; color: var(--muted); font-size: .76rem; }
.gl { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; font-size: .88rem; }
.gl.warn li::marker { content: "⚠️ "; }
.prg { height: 8px; background: var(--sunken); border-radius: 99px; overflow: hidden; } .prg i { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--green)); border-radius: 99px; transition: width .3s ease; }
.thr { display: flex; flex-direction: column; gap: 10px; }
.msg { border-radius: 14px; padding: 10px 12px; font-size: .86rem; border: 1px solid var(--line); background: var(--surface); max-width: 92%; }
.msg.out { align-self: flex-start; background: var(--green-soft); border-color: rgba(200,16,46,.2); }
.msg.in { align-self: flex-end; }
.msg .mh { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: .75rem; color: var(--muted); }
.msg .ms { font-weight: 800; margin-top: 2px; }
.msg pre, .msg .ms, #mBody, #iBody { unicode-bidi: plaintext; }
.msg pre { white-space: pre-wrap; font: inherit; margin: 4px 0 0; overflow-wrap: anywhere; max-height: 260px; overflow: auto; }
.mlink { background: #FFF4E0; border: 1px solid #F3D19C; border-radius: 12px; padding: 10px 12px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: .86rem; }
.tl { list-style: none; margin: 0; padding: 0; border-inline-start: 2px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.tl li { position: relative; padding-inline-start: 16px; font-size: .86rem; }
.tl li::before { content: ""; position: absolute; inset-inline-start: -7px; top: 7px; width: 12px; height: 12px; border-radius: 50%; background: var(--gold); border: 2px solid var(--bg); }
.tl small { display: block; color: var(--muted); font-size: .75rem; }
.sct { display: flex; flex-wrap: wrap; gap: 6px; }
.sct label { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--line); border-radius: 99px; padding: 3px 12px; font-size: .82rem; cursor: pointer; background: var(--surface); }
.sct label:has(input:checked) { background: var(--green-soft); border-color: var(--green); color: var(--green); font-weight: 700; }
body.adr-on { overflow: hidden; }
/* site-wide floating widgets on this page: Janna waits docked as her round headshot (bottom corner, set in JS) and the Janna Live
   pill (vertically centred over the right/start edge, where the RTL headings, tabs and KPIs begin) moves into the hero as a button */
.jnl-btn { display: none !important; }
html { scroll-padding-bottom: 110px; }
.advm { padding-bottom: 120px; }
body.adr-on .toast { z-index: 130; }
/* while a drawer is open Janna's floating figure steps aside (her hit-test would otherwise catch clicks on the drawer's buttons) */
body.adr-on .jn-fig, body.adr-on .jn-mini, body.adr-on .jn-bub, body.adr-on .jn-beam, body.adr-on .jn-tap, body.adr-on .bs-fig, body.adr-on .bs-mini, body.adr-on .bs-bub { display: none !important; }
.advh .bdg .svc { background: rgba(192,147,0,.22); border: 1px solid rgba(226,190,114,.6); color: #FCE9B8; }
.advh .bdg .svc.end { background: #FDECEC; color: #B42318; border-color: #F3C9C9; }
.advh .bdg .who { background: #E3F7EA; color: #0B6B35; }
.advh .acts .advlv { background: #c8102e; color: #fff; border-color: #c8102e; }
/* activation link opened on a browser that is not (yet) on a partner plan: only the sign-in status / lock box shows */
/* after the 365-day service period: no daily brief and no video call, only the renewal (the member's own deals stay readable) */
html.adv-exp #brief { display: none !important; }
html.adv-gate .advh, html.adv-gate #reminders, html.adv-gate #brief, html.adv-gate #pipeline, html.adv-gate #advFoot { display: none !important; }
.advlock { margin: 0 auto; }
.advlog { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%; }
.advlog input { font: inherit; font-size: .88rem; flex: 1 1 220px; min-width: 0; border: 1px solid var(--line); border-radius: 10px; padding: 7px 12px; background: var(--surface); color: var(--fg); }
@media (max-width: 900px) { .advk { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .advh .wrap { padding-block: 18px 16px; gap: 12px; } .advh .av { width: 64px; height: 64px; }
  .advkb { grid-auto-flow: row; grid-auto-columns: auto; overflow: visible; }
  .kc { min-height: 0; } .kc.empty .kc-b { display: none; } .kc.empty { opacity: .8; }
  .adr dl { grid-template-columns: 1fr; gap: 0 0; } .adr dd { margin-bottom: 6px; }
  .msg { max-width: 100%; }
  .adr .pn-h h2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: .98rem; }
  /* deal-room tabs: all four always visible (2 × 2), never a hidden scroller */
  .adr .seg2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-self: stretch; width: 100%; }
  .adr .seg2 button { padding: 7px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (prefers-reduced-motion: reduce) { .adr .pn { animation: none; } .advk button, .kc { transition: none; } }
''', '''
<section class="advh" id="advH"><div class="wrap"><img class="av" src="img/bassem/head.webp" onerror="this.onerror=null;this.src='img/bassem.jpg'" alt="" width="88" height="88"><div class="tx" id="advHx" aria-live="polite"></div></div></section>
<main class="wrap advm" id="top">
  <div id="advWarn"></div>
  <section class="card2 advsec" id="reminders" aria-labelledby="advRemT"></section>
  <section class="advsec" id="brief" aria-labelledby="briefT"></section>
  <section class="advsec" id="pipeline" aria-labelledby="pipeT"></section>
  <p class="note2" id="advFoot"></p>
</main>
<div class="adr" id="advDr" hidden></div>
<script src="data/mig-api.js"></script>
''', r'''
var EN = window.MIGLANG === "en";
function T(a, e) { return EN ? e : a; }
/* ---------- links from Bassem's e-mails / WhatsApp ----------
   advisor.html#when=now|noon|evening|skip → once the member is signed in (platform session, partner / strategic plan confirmed by the server),
     today's call time is saved with MIGAPI.prefs({call_today_at: "<today, Cairo>T<HH:MM>"}) — now = in 5 minutes, noon = 13:00, evening = 19:00,
     skip = nothing is saved — and Bassem confirms it in his caption.
   advisor.html#live=1 (or ?live=1, the activation link) → Bassem's live video opens directly for a signed-in partner / strategic member;
     anyone else gets the normal lock box.
   Both are taken out of the address bar here, before data/janna-live.js (which also reads live=1) loads, and kept in this tab
   (sessionStorage, 30 minutes) across the sign-in or activation reload. */
var WHEN = "", WANTLIVE = false;
(function () {
  var h = String(location.hash || ""), q = String(location.search || ""), m = /(?:^#|&)when=(now|noon|evening|skip)(?=&|$)/.exec(h), ch = false;
  if (m) { WHEN = m[1]; ch = true; }
  if (/(?:^#|&)live=1(?=&|$)/.test(h) || /[?&]live=1(?=&|$)/.test(q)) { WANTLIVE = true; ch = true; }
  if (ch) {
    var h2 = h.replace(/^#/, "").split("&").filter(function (p) { return p && !/^(when|live)=/.test(p); }).join("&");
    var q2 = q.replace(/^\?/, "").split("&").filter(function (p) { return p && !/^live=/.test(p); }).join("&");
    try { history.replaceState(null, "", location.pathname + (q2 ? "?" + q2 : "") + (h2 ? "#" + h2 : "")); } catch (e) {}
    try { if (WHEN) sessionStorage.setItem("mig-adv-when", JSON.stringify({ v: WHEN, at: Date.now() })); if (WANTLIVE) sessionStorage.setItem("mig-adv-live", String(Date.now())); } catch (e) {}
  }
  try {
    var w = JSON.parse(sessionStorage.getItem("mig-adv-when") || "null"), l = +(sessionStorage.getItem("mig-adv-live") || 0);
    if (!WHEN && w && /^(now|noon|evening|skip)$/.test(w.v) && Date.now() - w.at < 18e5) WHEN = w.v;
    if (!WANTLIVE && l && Date.now() - l < 18e5) WANTLIVE = true;
  } catch (e) {}
})();
/* ids for locally kept items: the browser's crypto source (no pseudo-random numbers), else time + a counter */
function rid() { var s = ""; try { var a = new Uint8Array(6); window.crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += (a[i] % 36).toString(36); } catch (e) { rid.n = (rid.n || 0) + 1; s = Date.now().toString(36) + rid.n.toString(36); } return s; }
/* Bassem («باسم», data/bassem.js, loaded after this script) is the advisor persona on this page */
var BHEAD = "img/bassem/head.webp";
/* Janna's floating figure starts docked on this page (no teaser over the advisor's controls). Her site-wide setting is put back when
   the visitor leaves, unless they opened or minimised her here themselves. Runs before data/janna.js starts (DOMContentLoaded). */
(function () {
  var K = "janna-min", o = null, own = false; try { o = localStorage.getItem(K); localStorage.setItem(K, "1"); } catch (e) { return; }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".jn-mini,.jn-x,.jn-tag,.jn-fig,.jn-bub")) own = true; }, true);
  window.addEventListener("pagehide", function () { if (own) return; try { if (o == null) localStorage.removeItem(K); else localStorage.setItem(K, o); } catch (e) {} });
  window.addEventListener("pageshow", function (e) { if (e.persisted && !own) try { localStorage.setItem(K, "1"); } catch (x) {} });
})();
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function LG(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function LS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function say(m) { if (window.toast) window.toast(m); }
/* EN mode: the site's dictionary translator (data/i18n.js) also rewrites Arabic values of text inputs when they are inserted, and it
   does not honour translate="no" there. Member and opportunity data (subjects, next action, search…) must stay as typed: put it back. */
function keepVals(root) {
  if (!EN || !root || !window.MIGTR) return;
  Promise.resolve().then(function () {
    var L = [].slice.call(root.querySelectorAll("input")).filter(function (i) { return /[\u0600-\u06FF]/.test(i.value); }).map(function (i) { return [i, i.value, window.MIGTR(i.value)]; }).filter(function (x) { return x[2] !== x[1]; });
    if (L.length) requestAnimationFrame(function () { requestAnimationFrame(function () { L.forEach(function (x) { if (x[0].value === x[2]) x[0].value = x[1]; }); }); });
  });
}
if (EN) document.title = "AI Deal Advisor – Made in Egypt Gate";

/* ---------- dates ---------- */
function pad(n) { return (n < 10 ? "0" : "") + n; }
function isoD(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
var NOW = new Date(), TD = isoD(NOW);
function dn(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; }
function daysTo(s) { var v = dn(s); return isNaN(v) ? null : Math.round(v - dn(TD)); }
function addDays(s, n) { return new Date((dn(s) + n) * 864e5).toISOString().slice(0, 10); }
function daysSince(ts) { var t = Date.parse(ts); return isNaN(t) ? null : Math.floor((Date.now() - t) / 864e5); }
function fDL(s, lang) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); if (!m) return s || ""; try { return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch (e) { return s; } }
function fD(s) { return s ? fDL(s, EN ? "en" : "ar") : "—"; }
function fDT(ts) { try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); } catch (e) { return ts || ""; } }
function left(n) { if (n == null) return ""; if (n < 0) return T("انتهى موعد الإغلاق", "Closing date passed"); if (n === 0) return T("بيقفل النهارده", "Closes today"); if (n === 1) return T("فاضل يوم واحد", "1 day left"); if (n === 2) return T("فاضل يومين", "2 days left"); return EN ? n + " days left" : "فاضل " + n + (n <= 10 ? " أيام" : " يوم"); }
function cdCls(n) { return n == null ? "cd-gray" : n <= 3 ? "cd-red" : n <= 7 ? "cd-amber" : "cd-gray"; }

/* ---------- plan ---------- */
var MP = window.MIGPLAN, PK = MP ? MP.key : "visitor", PMK = (MP && MP.plan && MP.plan.markets) || [];
var PLN = { partner: ["باقة الشريك الأساسي", "Core Partner plan"], strategic: ["باقة الشريك الاستراتيجي", "Strategic Partner plan"] };
var MKT = { local: ["مصر (محلي)", "Egypt (local)", "🇪🇬"], gulf: ["الخليج", "Gulf", "🌴"], africa: ["أفريقيا", "Africa", "🌍"], asia: ["آسيا", "Asia", "🌏"], europe: ["أوروبا", "Europe", "🇪🇺"] };
var ORDER = ["local", "gulf", "africa", "asia", "europe"];
function inPlan(m) { return PMK.indexOf(m) > -1; }
function mName(m) { return MKT[m] ? T(MKT[m][0], MKT[m][1]) : (m || ""); }
var ISO = { "Egypt": "EG", "Mozambique": "MZ", "Eswatini": "SZ", "Niger": "NE", "Morocco": "MA", "Madagascar": "MG", "Cameroon": "CM", "Seychelles": "SC", "Ethiopia": "ET", "Congo, Democratic Republic of": "CD", "Rwanda": "RW", "Djibouti": "DJ", "Uganda": "UG", "Pakistan": "PK", "Mongolia": "MN", "Syrian Arab Republic": "SY", "Uzbekistan": "UZ", "Bangladesh": "BD", "Lebanon": "LB", "China": "CN", "Indonesia": "ID", "Spain": "ES", "Norway": "NO", "Romania": "RO", "Luxembourg": "LU", "Netherlands": "NL", "Cyprus": "CY", "Sweden": "SE", "France": "FR", "Malta": "MT", "Finland": "FI", "Czechia": "CZ", "Germany": "DE", "Bahrain": "BH", "Oman": "OM", "Saudi Arabia": "SA", "United Arab Emirates": "AE", "Kuwait": "KW", "Qatar": "QA", "Kenya": "KE", "Nigeria": "NG", "Ghana": "GH", "Tanzania": "TZ", "India": "IN", "Viet Nam": "VN", "Vietnam": "VN", "Italy": "IT", "United Kingdom": "GB", "Turkey": "TR", "Türkiye": "TR", "Jordan": "JO", "Iraq": "IQ", "Algeria": "DZ", "Tunisia": "TN", "Libya": "LY", "Sudan": "SD", "Senegal": "SN", "South Africa": "ZA", "Zambia": "ZM", "Malawi": "MW", "Philippines": "PH", "Nepal": "NP", "Sri Lanka": "LK", "Belgium": "BE", "Poland": "PL", "Portugal": "PT", "Greece": "GR", "Austria": "AT", "Denmark": "DK", "Ireland": "IE", "Tunisia ": "TN" };
function flag(o) { var c = ISO[o.country_en || ""]; if (!c) return MKT[o.market] ? MKT[o.market][2] : "🌐"; try { return String.fromCodePoint(127397 + c.charCodeAt(0), 127397 + c.charCodeAt(1)); } catch (e) { return "🌐"; } }
var KIND = { gov: ["مناقصة حكومية", "Government tender"], pvt: ["طلب قطاع خاص", "Private buyer"], rfq: ["طلب عرض سعر", "RFQ"], project: ["مشروع", "Project"], direct: ["تواصل مباشر", "Direct contact"] }; /* project / direct: deals Bassem's «ابعت» starts from the call (worker/src/advisor.js POST /send) */
function kName(k) { return KIND[k] ? T(KIND[k][0], KIND[k][1]) : (k || ""); }
var STG = [["discover", "اكتشاف", "Discover", "🔎"], ["contact", "تواصل", "Contact", "✉️"], ["offer", "تقديم عرض", "Offer", "📄"], ["negotiation", "تفاوض", "Negotiation", "🤝"], ["contract", "تعاقد", "Contract", "✍️"], ["delivery", "توريد وتنفيذ", "Delivery", "🚚"], ["won", "تمّت بنجاح", "Won", "🏆"], ["lost", "لم تكتمل", "Lost", "✖️"]];
function sName(s) { for (var i = 0; i < STG.length; i++) if (STG[i][0] === s) return STG[i][3] + " " + T(STG[i][1], STG[i][2]); return s || ""; }
function active(d) { return d.stage !== "won" && d.stage !== "lost"; }

/* ---------- sectors (groups used to match opportunities to the member profile) ---------- */
var SECT = [
  ["elec", "الكهرباء والكابلات", "Electrical & cables", /كهرب|كابل|محول|محولات|مولد|إنارة|انارة|لوحات/, /electric|cable|transformer|generator|lighting|insulator|switchgear|substation/i],
  ["build", "مواد البناء والزجاج", "Building materials & glass", /بناء|أسمنت|اسمنت|زجاج|سيراميك|خرسان/, /construct|cement|glass|ceramic|building material|concrete/i],
  ["metal", "المعادن والإنشاءات المعدنية", "Metals & steel structures", /معدن|معادن|حديد|ألمنيوم|ألومنيوم|صلب/, /steel|metal|alumin|iron/i],
  ["chem", "الكيماويات والبتروكيماويات والنفط", "Chemicals, petrochemicals & oil", /كيما|بتروكيم|نفط|غاز|أسمدة/, /chemical|petro|\boil\b|\bgas\b|fertili/i],
  ["pack", "البلاستيك والورق والتغليف", "Plastics, paper & packaging", /بلاستيك|تغليف|ورق|طباعة/, /plastic|packag|paper|print/i],
  ["food", "الصناعات الغذائية", "Food industries", /غذائ|أغذية|ألبان/, /\bfood|dairy|beverage/i],
  ["med", "الأدوية والطبي والمعامل", "Pharma, medical & labs", /أدوية|دواء|طبي|طبية|معامل|علمية|لقاحات/, /pharma|medic|hospital|laborator|drug|vaccin/i],
  ["furn", "الأثاث", "Furniture", /أثاث/, /furniture/i],
  ["mach", "الماكينات والمعدات وقطع الغيار", "Machinery, equipment & spares", /معدات|ماكينات|آلات|طلمبات|قطع غيار|العدد|أفران|موازين|مصاعد|خطوط الإنتاج/, /machin|equipment|pump|spare part|tools|elevator/i],
  ["hvac", "التكييف والتبريد", "HVAC & refrigeration", /تكييف|تبريد/, /hvac|air.?condition|refrigerat|cooling/i],
  ["safe", "السلامة والإطفاء", "Safety & firefighting", /سلامة|وقاية|إطفاء/, /safety|fire|protective/i],
  ["water", "المياه ومعالجتها", "Water & treatment", /مياه/, /water/i],
  ["office", "الأدوات المكتبية والحاسبات", "Office supplies & IT", /مكتبية|حاسب|حاسبات/, /office|computer|stationery/i],
  ["auto", "الإطارات والبطاريات والمركبات", "Tyres, batteries & vehicles", /إطارات|بطاريات|مركبات/, /tyre|\btire|batter|vehicle/i]
];
function grp(o) { var a = (o.sector_ar || "") + " " + (o.title_ar || ""), e = o.title_en || ""; return SECT.filter(function (s) { return s[3].test(a) || s[4].test(e); }).map(function (s) { return s[0]; }); }

/* ---------- member profile (localStorage; prefilled from the registration account if any) ---------- */
var KP = "mig-adv-profile";
function platformUser() { var A = window.MIGAPI; return A && A.token() ? A.user() : null; }
function fromAccount() {
  /* the platform account (server data cached by data/mig-api.js; re-confirmed by GET /api/me in detect()) */
  var u = platformUser(); if (u && u.id) return { u: String(u.id), n: u.company || u.name || "", m: u.email || "" };
  return null;
}
/* demo labels follow the page language: they are filled in at load and never stored (the stored profile keeps the flags only) */
var DEMO_CO = ["", ""], DEMO_ACCT = DEMO_CO, DEMO_PR = ["", ""]; /* no profile yet: never a sample company, product line or sector */
function isOne(v, a) { return v === a[0] || v === a[1]; }
function loadProfile() {
  var p = LG(KP, null), a = fromAccount();
  if (p && (p.company || p.demo || p.demoAcct) && !(p.demo && a)) return p;
  if (a && a.demo) return { id: a.u, demoAcct: true, email: "", sectors: [], products: "", phone: "", website: "", sender_name: "", sender_title: "", fromReg: true };
  if (a) return { id: a.u, company: a.n || "", email: a.m || "", sectors: [], products: "", phone: "", website: "", sender_name: "", sender_title: "", fromReg: true };
  return { id: "demo-" + rid(), email: "", sectors: [], products: "", phone: "", website: "", sender_name: "", sender_title: "", demo: true };
}
function localizeDemo() {
  if (PROF.demo) PROF.company = T(DEMO_CO[0], DEMO_CO[1]); else if (PROF.demoAcct) PROF.company = T(DEMO_ACCT[0], DEMO_ACCT[1]);
  if ((PROF.demo || PROF.demoAcct) && (!PROF.products || isOne(PROF.products, DEMO_PR))) PROF.products = T(DEMO_PR[0], DEMO_PR[1]);
}
function saveProf() { var c = {}, k; for (k in PROF) c[k] = PROF[k]; if (c.demo || c.demoAcct) { delete c.company; if (isOne(c.products, DEMO_PR)) delete c.products; } LS(KP, c); }
var PROF = loadProfile(); if (!PROF.sectors) PROF.sectors = []; localizeDemo(); saveProf();
function kws() { return String(PROF.products || "").split(/[,،;\n]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return s.length >= 3; }); }

/* ---------- opportunities (real data only) ---------- */
var RL = window.REAL || {};
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
var OPPS = [], SEEN = {};
(RL.tenders_intl || []).forEach(function (t) { if (!t || !t.ref) return; OPPS.push({ uid: "i:" + t.ref, ref: t.ref, kind: t.kind === "pvt" ? "pvt" : "gov", market: t.market, country_ar: t.country_ar, country_en: t.country_en, city: t.city, title_ar: t.title_ar, title_en: t.title_en, entity_ar: t.entity_ar, entity_en: t.entity_en || "", sector_ar: t.sector_ar, publish_date: t.publish_date, closing_date: t.closing_date, value: t.estimated_value, currency: t.currency, source_name: t.source_name, source_url: t.source_url }); });
function realRef(r) { r = refKey(r); return r.length > 2 ? r : ""; }
(RL.tenders || []).forEach(function (t) { if (!t) return; if (realRef(t.ref)) SEEN[realRef(t.ref)] = 1; OPPS.push({ uid: "e:" + (t.id || t.ref), ref: t.ref, kind: "gov", market: "local", country_ar: "مصر", country_en: "Egypt", city: t.city, title_ar: t.title_ar, title_en: t.title_en, entity_ar: t.entity_ar, entity_en: t.entity_en, sector_ar: t.sector_ar, publish_date: t.publish_date, closing_date: t.closing_date, bond: t.bid_bond_egp, booklet: t.booklet_price_egp, ptype: t.procurement_type, source_name: hostOf(t.source_url), source_url: t.source_url }); });
(window.MIGTEND || []).forEach(function (x) { if (!x || !x[9]) return; var ref = String(x[0]).replace(/^OFF:/, ""); if (realRef(ref)) { if (SEEN[ref]) return; SEEN[ref] = 1; } OPPS.push({ uid: "t:" + x[0], ref: ref, kind: "gov", market: "local", country_ar: "مصر", country_en: "Egypt", city: x[5], title_ar: x[3], entity_ar: x[4], sector_ar: x[6], closing_date: x[9], ptype: x[1], source_name: hostOf(x[11]), source_url: x[11] }); });
(window.MIGRFQ || []).forEach(function (x) { if (!x || !x[1] || daysTo(x[1]) < -60) return; var en = String(x[10] || ""), m = /Description:\s*([^.;]+)/i.exec(en), te = m ? m[1].trim() : ""; if (te) te = te.charAt(0).toUpperCase() + te.slice(1); OPPS.push({ uid: "r:" + x[0], ref: x[0], kind: "rfq", market: "local", country_ar: "مصر", country_en: "Egypt", city: "", title_ar: x[2], title_en: te ? "RFQ: " + te : "", entity_ar: "صاحب الطلب (عبر منصة صنع في مصر)", entity_en: "Requester (via Made in Egypt Gate)", sector_ar: x[9], publish_date: x[1], closing_date: x[6] || null, source_name: "madeinegyptgate.com", source_url: x[8] }); });
/* new since the previous visit day (first visit: last 7 days) */
var KV = "mig-adv-visit", VIS = LG(KV, null);
if (!VIS || !VIS.cur) VIS = { cur: TD, prev: addDays(TD, -8) }; else if (VIS.cur !== TD) VIS = { cur: TD, prev: VIS.cur };
LS(KV, VIS);
var SINCE = VIS.prev, DATA_ASOF = "";
OPPS.forEach(function (o) { var n = daysTo(o.closing_date); o.open = n == null || n >= 0; o.isNew = !!(o.publish_date && o.publish_date > SINCE); o.groups = grp(o); if (o.publish_date && o.publish_date > DATA_ASOF && o.publish_date <= TD) DATA_ASOF = o.publish_date; });
function rescore() { var K = kws(); OPPS.forEach(function (o) { var s = 0, n = daysTo(o.closing_date), hay = ((o.title_ar || "") + " " + (o.title_en || "")).toLowerCase(); o.match = PROF.sectors.some(function (k) { return o.groups.indexOf(k) > -1; }); o.kwm = K.some(function (k) { return hay.indexOf(k) > -1; }); if (o.match) s += 50; if (o.kwm) s += 25; if (o.isNew) s += 15; if (n != null && n >= 0) s += Math.max(0, 12 - n / 4); if (n != null && n < 2) s -= 6; o.score = s; }); }
rescore();
function oTitle(o) { return EN ? (o.title_en || o.title_ar || "") : (o.title_ar || o.title_en || ""); }
function oEnt(o) { return EN ? (o.entity_en || o.entity_ar || "") : (o.entity_ar || o.entity_en || ""); }
function oPlace(o) { var c = EN ? (o.country_en || o.country_ar) : (o.country_ar || o.country_en); return (o.city && o.city !== c ? o.city + (c ? " – " : "") : "") + (c || ""); }
function money(v, c) { var n = Number(v); if (!v || isNaN(n)) return ""; return n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " " + (c || ""); }
function byUid(uid) { for (var i = 0; i < OPPS.length; i++) if (OPPS[i].uid === uid) return OPPS[i]; return null; }

/* ---------- contracting guides (data/advisor-guides.js) ---------- */
var G = window.ADVISOR_GUIDES || null;
function items(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map(function (i) { return typeof i === "string" ? { ar: i, en: i } : i; }).filter(function (i) { return i && (i.ar || i.en); });
  if (x.steps) return items(x.steps);
  if (Array.isArray(x.ar) || Array.isArray(x.en)) { var a = x.ar || [], e = x.en || [], r = []; for (var i = 0; i < Math.max(a.length, e.length); i++) r.push({ ar: a[i] || e[i], en: e[i] || a[i] }); return r; }
  if (x.ar || x.en) return [{ ar: x.ar || x.en, en: x.en || x.ar }];
  return [];
}
function tx(i) { if (!i) return ""; if (typeof i === "string") return i; return EN ? (i.en || i.ar || "") : (i.ar || i.en || ""); }
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function findPortal(o) {
  if (!G || !G.portals || !o) return null; var P = G.portals, k, sn = String(o.source_name || "").toLowerCase(), h = hostOf(o.source_url);
  if (o.source_name && P[o.source_name]) return P[o.source_name];
  for (k in P) { var kl = k.toLowerCase(); if (sn && kl.length >= 3 && (sn.indexOf(kl) === 0 || kl.indexOf(sn) === 0 || new RegExp("(^|[^a-z])" + reEsc(kl) + "([^a-z]|$)").test(sn))) return P[k]; }
  for (k in P) { var ph = hostOf(P[k] && P[k].url); if (h && ph && (h === ph || h.slice(-ph.length - 1) === "." + ph)) return P[k]; }
  return null;
}
/* the official portal tied to a market when the notice itself came from a republisher (e.g. Egyptian tenders seen in the press) */
function marketPortal(o) { if (!G || !G.portals || o.kind !== "gov") return null; var c = []; for (var k in G.portals) { var a = G.portals[k] && G.portals[k].applies_to_markets; if (a && a.length === 1 && a[0] === o.market) c.push(G.portals[k]); } return c.length === 1 ? c[0] : null; }
var TPLN = { intro: ["رسالة تعريف بالشركة", "Company introduction"], request_documents: ["طلب كراسة الشروط/المستندات", "Request tender documents"], clarification: ["طلب استيضاح", "Request clarification"], submit_offer: ["تقديم العرض", "Submit offer"], follow_up: ["متابعة", "Follow-up"], negotiation: ["تفاوض", "Negotiation"], thank_you: ["شكر", "Thank you"] };
/* generic fallback used only while data/advisor-guides.js is unavailable */
var TPL0 = {
  intro: { subject_ar: "تعريف بشركة {company} – {title}", body_ar: "السادة/ {entity}\nعناية/ {contact_name}\n\nتحية طيبة وبعد،\nنتشرف بتعريفكم بشركة {company}، ونعمل في مجال: {products}.\nنرغب في المشاركة في: {title} (مرجع: {ref}).\nنرجو إفادتنا بالمستندات المطلوبة وطريقة التقديم.\n\nوتفضلوا بقبول فائق الاحترام،\n{sender_name}\n{sender_title}\n{company}\n{phone} · {email} · {website}", subject_en: "{company} – {title}", body_en: "Dear {contact_name},\n\nWe are {company}, working in: {products}.\nWe are interested in participating in: {title} (ref. {ref}).\nCould you please advise on the required documents and the submission procedure?\n\nKind regards,\n{sender_name}\n{sender_title}\n{company}\n{phone} · {email} · {website}" },
  follow_up: { subject_ar: "متابعة: {title}", body_ar: "السادة/ {entity}\nعناية/ {contact_name}\n\nنتابع مع سيادتكم رسالتنا السابقة بخصوص: {title} (مرجع: {ref}).\nنرجو التكرم بإفادتنا.\n\nمع خالص التحية،\n{sender_name}\n{company}\n{phone}", subject_en: "Follow-up: {title}", body_en: "Dear {contact_name},\n\nFollowing up on our previous message regarding: {title} (ref. {ref}).\nWe look forward to your reply.\n\nKind regards,\n{sender_name}\n{company}\n{phone}" }
};
function TPLS() { return (G && G.email_templates && Object.keys(G.email_templates).length) ? G.email_templates : TPL0; }
var PH = { company: ["اسم الشركة", "company name"], contact_name: ["اسم المسؤول", "contact name"], entity: ["الجهة", "buyer"], title: ["عنوان الفرصة", "opportunity title"], ref: ["الرقم المرجعي", "reference"], closing_date: ["موعد الإغلاق", "closing date"], products: ["منتجاتك", "your products"], sender_name: ["اسمك", "your name"], sender_title: ["وظيفتك", "your title"], phone: ["رقم الهاتف", "phone"], email: ["بريدك", "your email"], website: ["موقعك", "website"] };
function fill(s, d, o, lang) {
  var ar = lang !== "en", dl = function (a, v) { return a ? a[ar ? 0 : 1] : v; }, V = { company: dl(PROF.demo ? DEMO_CO : PROF.demoAcct ? DEMO_ACCT : null, PROF.company), contact_name: d.contact_name, entity: ar ? (o.entity_ar || o.entity_en) : (o.entity_en || o.entity_ar), title: ar ? (o.title_ar || o.title_en) : (o.title_en || o.title_ar), ref: refKey(o.ref) ? "\u2068" + refKey(o.ref) + "\u2069" : "", closing_date: o.closing_date ? fDL(o.closing_date, lang) : "", products: (PROF.demo || PROF.demoAcct) && isOne(PROF.products, DEMO_PR) ? dl(DEMO_PR) : PROF.products, sender_name: PROF.sender_name, sender_title: PROF.sender_title, phone: PROF.phone, email: PROF.email, website: PROF.website };
  s = String(s || ""); if (!refKey(o.ref)) s = s.replace(/\s*[(（]\s*(?:مرجع|المرجع|رقم المرجع|ref\.?|reference)\s*:?\s*\{ref\}\s*[)）]/gi, "");
  return s.replace(/\{(\w+)\}/g, function (m, k) { if (!(k in V)) return m; var v = V[k]; return v ? String(v) : "[" + (PH[k] ? PH[k][ar ? 0 : 1] : k) + "]"; }).replace(/[ \t]*·[ \t]*\[[^\]\n]+\][ \t]*(?=·|\n|$)/g, "");
}

/* ---------- API client (live) / demo store ---------- */
var API = String(window.ADVISOR_API || "/api/advisor").replace(/\/+$/, ""), LIVE = false, HEALTH = null, TOKEN = null, TK = "mig-adv-token", MODE_READY = false, NEEDLINK = false;
function tfetch(url, opt, ms) { return new Promise(function (res, rej) { var ctl = window.AbortController ? new AbortController() : null, done = false; opt = opt || {}; if (ctl) opt.signal = ctl.signal; var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej(new Error("timeout")); }, ms || 15000); try { fetch(url, opt).then(function (r) { if (done) return; done = true; clearTimeout(tm); res(r); }, function (e) { if (done) return; done = true; clearTimeout(tm); rej(e); }); } catch (e) { clearTimeout(tm); rej(e); } }); }
function session() {
  if (window.ADVISOR_TOKEN) { TOKEN = window.ADVISOR_TOKEN; return Promise.resolve(TOKEN); }
  return tfetch(API + "/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_id: PROF.id, company: PROF.company, email: PROF.email, plan: PK }) }, 8000).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.token) throw new Error(j.error || "session"); TOKEN = j.token; try { sessionStorage.setItem(TK, JSON.stringify({ t: TOKEN, k: PROF.id + "|" + PK })); } catch (e) {} return TOKEN; }); });
}
function api(method, path, body, retry) {
  var h = { Accept: "application/json" }; if (body) h["Content-Type"] = "application/json"; if (TOKEN) h.Authorization = "Bearer " + TOKEN;
  return tfetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }, 20000).then(function (r) {
    if (r.status === 401 && PLATFORM) { TOKEN = null; LIVE = false; PLATFORM = false; NEEDLINK = true; renderWarn(); renderHero(); try { if (window.MIGAPI) MIGAPI.me(true).catch(function () {}); } catch (x) {} var e0 = new Error(T("انتهت جلستك على المنصة — ادخل تاني بكود على بريدك", "Your platform session ended — sign in again with an e-mail code")); e0.status = 401; throw e0; }
    if (r.status === 401 && !retry) { TOKEN = null; try { sessionStorage.removeItem(TK); } catch (e) {} if (HEALTH && HEALTH.login === "activation") { NEEDLINK = true; LIVE = false; renderWarn(); renderHero(); var e1 = new Error(T("انتهت جلستك — اطلب رابط دخول جديد", "Your session ended — ask for a new sign-in link")); e1.status = 401; throw e1; } return session().then(function () { return api(method, path, body, true); }); }
    return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var er = new Error((j && j.error) || ("HTTP " + r.status)); er.status = r.status; er.code = (j && j.code) || ""; er.limit = (j && j.limit) || ""; throw er; } return j; });
  });
}
var PLATFORM = false, LINKSESS = false;
/* platform session (data/mig-api.js): the server's answer decides; the advisor API accepts the same token */
function platformDetect() {
  var A = window.MIGAPI; if (!A || !A.token()) return Promise.resolve(false);
  /* signed in by an e-mailed login link (24 h, answering requests only): Bassem needs the e-mail-code sign-in (the server refuses the link session) */
  if (A.linkSession && A.linkSession()) {
    GATED = true; document.documentElement.classList.add("adv-gate"); LINKSESS = true; LOGINERR = { m: T("إنت داخل برابط من الإيميل، وده للرد على الطلبات بس. عشان تفتح المستشار وباسم، ادخل بكود على بريد شركتك.", "You signed in with the e-mail link, which is for answering requests only. To open the Advisor and Bassem, sign in with a code sent to your company e-mail."), a: true }; renderWarn();
    /* the e-mail-code sign-in opens right away; after it the page reloads with the full session (and any #when / #live kept in this tab) */
    setTimeout(function () { if (A.linkSession() && !document.querySelector(".mig-dlg")) A.open({ email: (A.user() || {}).email || "", why: LOGINERR.m }).then(function () { location.reload(); }, function () {}); }, 500);
    return Promise.resolve("denied");
  }
  return A.me().then(function (r) {
    var u = r && r.user, pk = u ? A.planOf(u) : "visitor";
    if (!u || !PLN[pk]) { GATED = true; document.documentElement.classList.add("adv-gate"); LOGINERR = { m: T("حسابك على المنصة مش على باقة الشريك الأساسي أو الشريك الاستراتيجي حالياً، فالمستشار مش متاح ليه.", "Your platform account is not on the Core Partner or Strategic Partner plan right now, so the Advisor is not available."), a: false }; renderWarn(); return "denied"; }
    PK = pk; PMK = (MP && MP.PL && MP.PL[pk] && MP.PL[pk].markets) || PMK;
    if (PROF.id !== String(u.id)) { var keep = LG(KP, null); PROF = { id: String(u.id), company: u.company || u.name || "", email: u.email || "", sectors: (keep && keep.id === String(u.id) && keep.sectors) || [], products: (keep && keep.id === String(u.id) && keep.products) || "", phone: u.phone || "", website: "", sender_name: u.name || "", sender_title: "" }; saveProf(); }
    else { if (!PROF.company) PROF.company = u.company || u.name || ""; if (!PROF.email) PROF.email = u.email || ""; if (!PROF.sender_name) PROF.sender_name = u.name || ""; }
    TOKEN = A.token(); PLATFORM = true; return true;
  }, function (e) { return e && e.code === "offline" ? false : (e && e.status === 401 ? false : false); });
}
function detect() {
  if (window.ADVISOR_FORCE_DEMO) return Promise.resolve();
  return platformDetect().then(function (pm) {
    if (pm === "denied") { LIVE = false; TOKEN = null; return; }
    if (pm === true) return tfetch(API + "/health", { headers: { Accept: "application/json" } }, 2500).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j || !j.ok || j.store === "none") throw new Error("demo"); HEALTH = j; LIVE = true; NEEDLINK = false; }, function () { LIVE = false; HEALTH = null; });
    /* a gated visitor (lock box + sign-in) never opens an advisor session from the browser */
    if (GATED && !LOGIN) { LIVE = false; TOKEN = null; return; }
    return detectLink();
  });
}
function detectLink() {
  return tfetch(API + "/health", { headers: { Accept: "application/json" } }, 2500).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.ok || j.store === "none") throw new Error("demo"); HEALTH = j;
    var c = null; try { c = JSON.parse(sessionStorage.getItem(TK) || "null"); } catch (e) {}
    if (c && c.t && c.k === PROF.id + "|" + PK) { TOKEN = c.t; if (c.e && Date.parse(c.e) - Date.now() < 3 * 864e5) refreshToken(); return; }
    /* platform mode: sessions come only from an activation / e-mailed login link, the page never opens one itself */
    if (j.login === "activation") throw new Error("activation");
    return session();
  }).then(function () { LIVE = true; NEEDLINK = false; }, function (e) { LIVE = false; TOKEN = null; NEEDLINK = !!(e && e.message === "activation"); if (!NEEDLINK) HEALTH = null; });
}
function keepToken(j) { TOKEN = j.token; try { sessionStorage.setItem(TK, JSON.stringify({ t: j.token, k: j.member.id + "|" + String(j.member.plan || "").toLowerCase(), e: j.expires_at || "" })); } catch (e) {} }
/* a token close to expiry is renewed in the background (POST /refresh) */
function refreshToken() {
  return tfetch(API + "/refresh", { method: "POST", headers: { Accept: "application/json", Authorization: "Bearer " + TOKEN } }, 8000).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.token && j.member && j.member.id === PROF.id) keepToken(j); }, function () {});
}

/* ---------- activation link: advisor.html#login=<code> → POST /login {code} → {token, member} ---------- */
var LOGIN = /[#&]login=([A-Za-z0-9]{8,100})/.exec(location.hash || "");
var LOGINERR = null;
/* site.py lets an activation link through the plan gate (a new device / an e-mailed link has no partner plan stored yet):
   until the Worker confirms the member, the advisor's content stays hidden; a refused link ends on a lock box, never the demo page */
var GATED = !!(LOGIN && !(MP && MP.can("advisor")));
/* a visitor with no platform session and no activation session (site.py lets visitors reach the page through MIGPLAN.gate, so a partner on
   a new device — or one following Bassem's WhatsApp / e-mail link — can sign in here): lock box + sign-in with an e-mail code, never the demo */
(function () {
  var tok = ""; try { tok = localStorage.getItem("mig-tok") || ""; } catch (e) {}
  if (!LOGIN && !tok && !(MP && MP.can("advisor"))) { GATED = true; LOGINERR = { m: T("المستشار الذكي وباسم لأعضاء باقة الشريك الأساسي والشريك الاستراتيجي. لو إنت عضو، ادخل بكود يوصلك على بريد شركتك المسجّل.", "The AI Advisor and Bassem are for Core Partner and Strategic Partner members. If you are a member, sign in with a code sent to your registered company e-mail."), a: true }; }
})();
if (GATED) document.documentElement.classList.add("adv-gate");
/* opened from Bassem's e-mail without a session on this browser: say what the sign-in is for, and offer it right away (once) */
(function () {
  var tok = ""; try { tok = localStorage.getItem("mig-tok") || ""; } catch (e) {}
  if (tok || LOGIN || !(WHEN || WANTLIVE) || !GATED) return;
  LOGINERR = { m: WHEN && WHEN !== "skip" ? T("ادخل بكود يوصلك على بريد شركتك المسجّل، وأنا أحفظ ميعاد مكالمتنا النهارده على طول.", "Sign in with a code sent to your registered company e-mail and I'll save today's call time right away.") : WANTLIVE ? T("ادخل بكود يوصلك على بريد شركتك المسجّل، ومكالمة الفيديو معايا هتفتح على طول.", "Sign in with a code sent to your registered company e-mail and our video call opens right away.") : T("ادخل بكود يوصلك على بريد شركتك المسجّل.", "Sign in with a code sent to your registered company e-mail."), a: true };
  window.addEventListener("load", function () { setTimeout(function () { if (!window.MIGAPI || MIGAPI.token()) return; MIGAPI.open({ why: LOGINERR.m }).then(function () { location.reload(); }, function () {}); }, 600); });
})();
/* ---------- #when= / #live=1 once the page knows who is signed in (see the top of this script) ---------- */
/* Cairo's date and time (the server's clock for Bassem's messages), optionally some minutes ahead */
function cairoAt(addMin) {
  var d = new Date(Date.now() + (addMin || 0) * 6e4), o = {};
  try { new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); } catch (e) { o = {}; }
  if (!o.year) return { day: isoD(d), hm: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
  return { day: o.year + "-" + o.month + "-" + o.day, hm: (o.hour === "24" ? "00" : o.hour) + ":" + o.minute };
}
/* Bassem says it (speech bubble + the caption bar), and it stays written on the page */
function bassemTell(t, ok) {
  try { if (window.BASSEM && BASSEM.active && BASSEM.active()) BASSEM.say(t); } catch (e) {}
  try { if (window.MIGCAPTIONS) MIGCAPTIONS.show(t, { speaker: T("باسم", "Bassem") }); } catch (e) {}
  var w = $("#advWarn"); if (w) { var n = document.createElement("div"); n.className = "advwarn"; n.setAttribute("role", "status"); n.innerHTML = "<span>" + (ok === false ? "⚠️ " : "📅 ") + esc(t) + "</span>"; w.insertBefore(n, w.firstChild); }
  say(t);
}
/* the member is a partner / strategic member the server confirmed (platform session) — the only case that saves a call time */
function memberOK() { return PLATFORM && !GATED; }
/* the hero's 🎥 only once a server confirmed the session on this page: the platform's GET /api/me (memberOK) or the advisor server
   with an activation-link session (LIVE + its token) — a token stored in this browser alone is not enough */
function callOK() { return memberOK() || (LIVE && !!TOKEN && !GATED); }
function applyWhen() {
  if (!WHEN) return;
  var v = WHEN, A = window.MIGAPI; WHEN = "";
  var tok = !!(A && A.token());
  if (LINKSESS) { WHEN = v; return; } /* kept in this tab until the e-mail-code sign-in (offered in the box above) */
  if (!memberOK() || !tok) {
    /* a visitor on this browser: kept until the code sign-in (offered above), which reloads the page */
    if (GATED && !tok) { WHEN = v; return; }
    /* only an activation-link session here (no platform sign-in): the call time is saved once they sign in with a code */
    if (!tok && LIVE) { WHEN = v; $("#advWarn").insertAdjacentHTML("afterbegin", '<div class="advwarn"><span>📅 ' + esc(T("عشان أحفظ ميعاد مكالمتنا النهارده ادخل بكود على بريدك.", "To save today's call time, sign in with an e-mail code.")) + '</span><button class="btn btn-gold btn-sm" type="button" data-miglogin>🔑 ' + T("ادخل بكود على بريدك", "Sign in with an e-mail code") + "</button></div>"); return; }
    try { sessionStorage.removeItem("mig-adv-when"); } catch (e) {}
    /* signed in but the server could not confirm the plan right now (a refused plan already shows the lock box) */
    if (tok && !GATED && v !== "skip") bassemTell(T("ماقدرتش أوصل للسيرفر عشان أحفظ ميعاد مكالمتنا. افتح الرابط تاني بعد شوية.", "I couldn't reach the server to save our call time. Please open the link again shortly."), false);
    return;
  }
  try { sessionStorage.removeItem("mig-adv-when"); } catch (e) {}
  var u = A.user() || {}, who = (A.ui && A.ui.shortName ? A.ui.shortName(u) : u.name) || "";
  if (v === "skip") { bassemTell(T("ولا يهمك" + (who ? " يا " + who : "") + "، نشتغل سوا يوم تاني إن شاء الله. لو احتجتني في أي وقت أنا هنا.", "No problem" + (who ? ", " + who : "") + " — we'll work together another day. I'm here whenever you need me.")); return; }
  var now = cairoAt(0), at = v === "now" ? cairoAt(5) : { day: now.day, hm: v === "noon" ? "13:00" : "19:00" }, late = false;
  /* the time asked for has already passed today: the call link comes in 5 minutes instead (said so, never silently) */
  if (v !== "now" && at.hm <= now.hm) { at = cairoAt(5); late = true; }
  A.prefs({ call_today_at: at.day + "T" + at.hm }).then(function (j) {
    var got = String((j && j.prefs && j.prefs.call_today_at) || "");
    if (got.indexOf(at.day + "T" + at.hm) !== 0) throw { code: "bad_response", error: T("السيرفر ماحفظش الميعاد.", "The server did not store the time.") };
    var lbl = { now: T("كمان 5 دقايق", "in 5 minutes"), noon: T("الساعة 1 الضهر", "at 1 pm"), evening: T("الساعة 7 بالليل", "at 7 pm") }[v];
    bassemTell(late ? T("الميعاد ده عدّى النهارده" + (who ? " يا " + who : "") + "، فهبعتلك رابط مكالمة الفيديو كمان 5 دقايق (الساعة " + at.hm + " بتوقيت القاهرة).", "That time has already passed today" + (who ? ", " + who : "") + ", so I'll send you the video-call link in 5 minutes (" + at.hm + " Cairo time).")
      : T("اتفقنا" + (who ? " يا " + who : "") + " ✅ هبعتلك رابط مكالمة الفيديو " + lbl + " (" + at.hm + " بتوقيت القاهرة).", "Agreed" + (who ? ", " + who : "") + " ✅ I'll send you the video-call link " + lbl + " (" + at.hm + " Cairo time)."));
  }, function (e) { bassemTell(T("ماقدرتش أحفظ ميعاد مكالمتنا دلوقتي: ", "I couldn't save our call time right now: ") + (A.ui ? A.ui.errText(e) : ""), false); });
}
/* Bassem's live video for a signed-in partner / strategic member (data/bassem.js decides from the server-confirmed plan; an activation
   session counts too); everyone else keeps the lock box */
function applyLive() {
  if (!WANTLIVE) return;
  if ((GATED && !(window.MIGAPI && MIGAPI.token())) || LINKSESS) return; /* waits for the code sign-in (kept in this tab) */
  WANTLIVE = false; try { sessionStorage.removeItem("mig-adv-live"); } catch (e) {}
  if (GATED) return;
  var n = 0;
  (function go() {
    var B = window.BASSEM, i = B && B.info ? B.info() : null;
    if (i && i.eligible) { try { B.video(); } catch (e) {} return; }
    if ((!B || !i || i.pending) && n++ < 30) { setTimeout(go, 400); return; }
  })();
}
function loginFail(msg, askMail) { LOGINERR = { m: msg, a: askMail }; renderWarn(); }
function lockBox() {
  return '<div class="lockbox advlock" role="region" aria-label="' + esc(T("المستشار الذكي للصفقات", "AI Deal Advisor")) + '"><div class="lk-ic">🔒</div><h2>' + T("المستشار الذكي للصفقات متاح لأعضاء الشريك", "The AI Deal Advisor is for partner members") + "</h2><p>"
    + T("متاح لمشتركي <b>باقة الشريك الأساسي</b> أو <b>باقة الشريك الاستراتيجي</b> لمدة 365 يوم من التفعيل، مع باسم مستشار أعمالك الشخصي.", "Available to <b>Core Partner</b> and <b>Strategic Partner</b> members for 365 days from activation, with Bassem as your personal business advisor.")
    + '</p><div class="lk-acts"><a class="btn btn-gold" data-mig-buy href="register.html#partner">' + T("اشترك في باقة الشريك", "Join a partner plan") + '</a><a class="btn btn-line" href="contact.html">' + T("تواصل معنا", "Contact us") + "</a></div></div>";
}
function mailForm() { return (window.MIGAPI ? '<button class="btn btn-gold btn-sm" type="button" data-miglogin>🔑 ' + T("ادخل بكود على بريدك", "Sign in with an e-mail code") + "</button> " : "") + '<form class="advlog" id="advLog" novalidate><input type="email" name="email" dir="ltr" autocomplete="email" required placeholder="' + esc(T("بريد الشركة المسجّل", "Your registered company email")) + '" aria-label="' + esc(T("البريد الإلكتروني", "Email")) + '"><button class="btn btn-green btn-sm" type="submit">✉️ ' + T("ابعتلي رابط دخول", "Email me a sign-in link") + "</button></form>"; }
function activationLogin(code) {
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  $("#advWarn").innerHTML = '<div class="advwarn"><span>⏳ ' + T("بنسجّل دخولك من رابط التفعيل…", "Signing you in from your activation link…") + "</span></div>";
  return tfetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ code: code }) }, 12000).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok || !j || !j.token || !j.member || !j.member.id) { var e = new Error((j && j.error) || ("HTTP " + r.status)); e.status = r.status; throw e; }
      var m = j.member, plan = String(m.plan || "").toLowerCase();
      if (!PLN[plan]) { var e2 = new Error("plan not eligible"); e2.status = 403; throw e2; }
      keepToken(j);
      /* the member is now the signed-in account of this tab (like the dashboard login), on the plan the platform confirmed */
      try { localStorage.setItem("mig-plan", plan); sessionStorage.setItem("mig-auth", m.id); } catch (e) {}
      /* the 365-day period counts from the activation date the Worker keeps for the member (same on every device); without one,
         data/bassem.js falls back to this browser's first sign-in and says so — a device's first sign-in is never stored as the activation date */
      var wa = /^\d{4}-\d{2}-\d{2}/.exec(String(m.activated_at || m.activated || "")), old = advMember();
      LS("mig-adv-member", { id: m.id, company: m.company || "", email: m.email || "", plan: plan, verified: !!m.verified, activated_at: wa ? wa[0] : (old && old.id === m.id && old.src === "worker" ? old.activated_at : ""), src: wa ? "worker" : "" });
      var p = LG(KP, null); if (!p || p.id !== m.id || p.demo || p.demoAcct) p = { id: m.id, sectors: (p && p.sectors) || [], products: (p && !p.demo && !p.demoAcct && p.products) || "", phone: "", website: "", sender_name: "", sender_title: "" };
      p.id = m.id; p.company = m.company || p.company || m.email || m.id; p.email = m.email || p.email || ""; delete p.demo; delete p.demoAcct; LS(KP, p);
      try { sessionStorage.setItem("mig-adv-hello", p.company); } catch (e) {}
      location.reload();
      return new Promise(function () {});
    });
  }).catch(function (e) {
    var st = e && e.status;
    if (st === 401 || st === 400) loginFail(T("رابط الدخول ده اتستخدم قبل كده أو انتهت صلاحيته. اطلب رابط جديد يوصلك على بريد شركتك.", "This sign-in link was already used or has expired. Ask for a new one sent to your company email."), true);
    else if (st === 403) loginFail(T("حسابك مش على باقة الشريك الأساسي أو الشريك الاستراتيجي حالياً، فالمستشار مش متاح ليه. كلّمنا لو ده مش صحيح.", "Your account is not on the Core Partner or Strategic Partner plan right now, so the Advisor is not available. Contact us if this is wrong."), false);
    else loginFail(GATED ? T("مقدرناش نوصل لخادم المستشار دلوقتي. افتح رابط الدخول تاني بعد شوية.", "We couldn't reach the Advisor server right now. Open your sign-in link again shortly.") : T("مقدرناش نوصل لخادم المستشار دلوقتي. افتح الرابط تاني بعد شوية — ولحد كده الصفحة شغالة من غير اتصال بالخادم (محفوظة على جهازك).", "We couldn't reach the Advisor server right now. Open the link again shortly — meanwhile the page works offline (saved on this device)."), false);
    throw e;
  });
}
document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest("[data-miglogin]") || !window.MIGAPI) return; MIGAPI.open({ why: T("ادخل ببريد شركتك المسجّل وهيوصلك كود من 6 أرقام.", "Sign in with your registered company e-mail; a 6-digit code will arrive.") }).then(function () { location.reload(); }, function () {}); });
/* «send me a new sign-in link» (POST /login/email: same answer whether or not the address belongs to a member) */
document.addEventListener("submit", function (e) {
  if (e.target.id !== "advLog") return; e.preventDefault();
  var f = e.target, em = f.elements.email.value.trim(), b = f.querySelector("button");
  if (!EMRE.test(em)) { f.elements.email.focus(); say(T("اكتب بريد صحيح.", "Enter a valid email.")); return; }
  b.disabled = true;
  tfetch(API + "/login/email", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: em }) }, 10000).then(function (r) {
    if (r.ok) f.outerHTML = '<span><b>✓ ' + T("لو البريد ده مسجّل لعضو مفعّل، هيوصله رابط دخول جديد خلال دقايق.", "If this address belongs to an active member, a new sign-in link will arrive within minutes.") + "</b></span>";
    else { b.disabled = false; say(T("الخدمة دي مش متاحة دلوقتي، كلّمنا على الواتساب.", "This service is not available right now, please contact us on WhatsApp.")); }
  }, function () { b.disabled = false; say(T("مقدرناش نوصل للخادم، جرّب تاني.", "Could not reach the server, please try again.")); });
});
var KD = "mig-adv-deals", KM = "mig-adv-msgs-", KL = "mig-adv-local-", DEALS = [];
function loc(id) { var l = LG(KL + id, null) || {}; l.checks = l.checks || {}; l.events = l.events || []; return l; }
function saveLoc(id, l) { LS(KL + id, l); }
function ev(id, ar, en) { var l = loc(id); l.events.unshift({ at: new Date().toISOString(), ar: ar, en: en }); l.events = l.events.slice(0, 100); saveLoc(id, l); }
function oppOf(d) { var a = d.opportunity || {}, l = loc(d.id).opp || {}, o = {}, k; for (k in a) o[k] = a[k]; for (k in l) if (l[k] != null && l[k] !== "") o[k] = l[k]; if (!o.title_ar && !o.title_en) { o.title_ar = a.title; o.title_en = a.title; } if (!o.entity_ar && !o.entity_en) { o.entity_ar = a.entity; o.entity_en = a.entity; } if (!o.country_ar && !o.country_en) { o.country_ar = a.country; o.country_en = a.country; } return o; }
/* which deal belongs to an opportunity: the uid saved with the deal on this device decides; a deal without one (opened on another
   device) matches only on the same market + title + source + ref — a ref alone is not an identity (some notices have none, or "1"). */
function refKey(r) { r = r == null ? "" : String(r).trim(); return /^(null|undefined)$/i.test(r) ? "" : r; }
function sameOpp(a, o) { return !!a && a.market === o.market && String(a.title || "") === String(o.title_ar || o.title_en || "") && refKey(a.ref) === refKey(o.ref) && (!a.source_url || !o.source_url || a.source_url === o.source_url); }
function dealFor(o) { for (var i = 0; i < DEALS.length; i++) { var d = DEALS[i], l = loc(d.id).opp; if (l && l.uid) { if (l.uid === o.uid) return d; continue; } if (sameOpp(d.opportunity, o)) return d; } return null; }
function getDeal(id) { for (var i = 0; i < DEALS.length; i++) if (String(DEALS[i].id) === String(id)) return DEALS[i]; return null; }
function putDeal(d) { if (!d) return d; for (var i = 0; i < DEALS.length; i++) if (String(DEALS[i].id) === String(d.id)) { DEALS[i] = d; return d; } DEALS.unshift(d); return d; }
function listDeals() { return LIVE ? api("GET", "/deals").then(function (j) { return j.deals || []; }) : Promise.resolve(LG(KD, [])); }
function createDeal(o) {
  var c = { ref: refKey(o.ref), title: o.title_ar || o.title_en || "", entity: o.entity_ar || o.entity_en || "", market: o.market, country: o.country_ar || o.country_en || "", source_url: o.source_url || "", closing_date: o.closing_date || "", kind: o.kind };
  var p = LIVE ? api("POST", "/deals", { opportunity: c, stage: "discover" }).then(function (j) { var d = j.deal; if (j.existing && d) { var lo = loc(d.id).opp; if (lo && lo.uid && lo.uid !== o.uid) throw new Error(T("الخادم رجّع صفقة لفرصة تانية", "the server returned a deal for another opportunity")); d._existing = true; } return d; }) : Promise.resolve((function () { var now = new Date().toISOString(), d = { id: "d" + Date.now().toString(36) + rid().slice(0, 3), opportunity: c, stage: "discover", notes: "", next_action: "", due_date: "", contact_email: "", contact_name: "", value: "", created_at: now, updated_at: now }, a = LG(KD, []); a.unshift(d); LS(KD, a); return d; })());
  return p.then(function (d) { if (!d || !d.id) throw new Error("deal"); var l = loc(d.id), ex = d._existing; delete d._existing; if (!l.opp || !l.opp.uid) { l.opp = o; saveLoc(d.id, l); } if (!ex) ev(d.id, "بدأت الصفقة ودخلت مرحلة الاكتشاف", "Deal started (Discover stage)"); return putDeal(d); });
}
function patchDeal(id, f) {
  var p = LIVE ? api("PATCH", "/deals/" + encodeURIComponent(id), f).then(function (j) { return j.deal; }) : Promise.resolve((function () { var a = LG(KD, []), d = null; a.forEach(function (x) { if (x.id === id) { for (var k in f) x[k] = f[k]; x.updated_at = new Date().toISOString(); d = x; } }); LS(KD, a); return d; })());
  return p.then(function (d) { if (!d) { d = getDeal(id); if (d) for (var k in f) d[k] = f[k]; } return putDeal(d); });
}
function delDeal(id) { LS(KD, LG(KD, []).filter(function (x) { return x.id !== id; })); try { localStorage.removeItem(KM + id); localStorage.removeItem(KL + id); } catch (e) {} DEALS = DEALS.filter(function (x) { return x.id !== id; }); }
function listMsgs(id) { return (LIVE ? api("GET", "/deals/" + encodeURIComponent(id) + "/messages").then(function (j) { return j.messages || []; }) : Promise.resolve(LG(KM + id, []))).then(function (m) { meta(id, m); return m; }); }
function meta(id, msgs) { var l = loc(id), o = "", i = ""; msgs.forEach(function (m) { if (m.direction === "in") { if (m.at > i) i = m.at; } else if (m.at > o) o = m.at; }); l.lastOut = o; l.lastIn = i; l.nMsg = msgs.length; saveLoc(id, l); }
function awaiting(d) { var l = loc(d.id); return !!(active(d) && l.lastOut && (!l.lastIn || l.lastIn < l.lastOut)); }

/* ---------- Bassem's guidance (generic process advice, never facts about a specific buyer) ---------- */
var STIPS = {
  discover: [["اقرأ الإعلان الرسمي كاملاً من المصدر، وحدّد شروط الأهلية والمستندات المطلوبة وموعد الإغلاق.", "Read the full official notice at the source and note the eligibility rules, required documents and closing date."], ["قرّر بسرعة: هل منتجاتك وطاقتك الإنتاجية تناسب الكمية والمواصفات؟ لو أيوه انقل الصفقة لمرحلة التواصل.", "Decide quickly whether your products and capacity fit the quantity and specs; if yes, move the deal to Contact."]],
  contact: [["ابعت رسالة تعريف قصيرة واطلب كراسة الشروط أو المواصفات الفنية.", "Send a short introduction and request the tender documents or technical specs."], ["لو مفيش رد خلال 3 أيام عمل، ابعت رسالة متابعة مهذبة.", "If there is no reply within 3 working days, send a polite follow-up."]],
  offer: [["جهّز العرض الفني والعرض المالي، وافصلهم لو الكراسة طالبة كده.", "Prepare the technical and financial offers, in separate envelopes/files if the documents require it."], ["راجع العملة وشروط التسليم (Incoterms) ومدة صلاحية العرض قبل الإرسال.", "Check the currency, delivery terms (Incoterms) and offer validity before submitting."]],
  negotiation: [["حدّد أقل سعر وأقصى مدة توريد تقدر تلتزم بيهم قبل ما تبدأ التفاوض.", "Set your lowest price and longest acceptable lead time before negotiating."], ["وثّق أي تعديل في السعر أو الشروط كتابياً بالإيميل.", "Confirm every change in price or terms in writing by email."]],
  contract: [["راجع بنود الدفع والغرامات والضمانات قبل التوقيع، واستعن بمستشار قانوني في العقود الدولية.", "Review payment terms, penalties and guarantees before signing; use legal counsel for international contracts."], ["اتفق كتابياً على طريقة الدفع (اعتماد مستندي، تحويل…) وجدول التسليم.", "Agree in writing on the payment method (letter of credit, transfer…) and the delivery schedule."]],
  delivery: [["جهّز مستندات الشحن المطلوبة في العقد (فاتورة، قائمة تعبئة، شهادة منشأ…) قبل موعد الشحن.", "Prepare the shipping documents the contract requires (invoice, packing list, certificate of origin…) before shipment."], ["تابع التأمين على الشحنة وبلّغ المشتري برقم الشحنة.", "Arrange cargo insurance and share the shipment reference with the buyer."]],
  won: [["اطلب شهادة حسن تنفيذ أو خطاب توصية من العميل لملفك.", "Ask the client for a completion certificate or reference letter for your portfolio."]],
  lost: [["اطلب نتيجة الترسية وأسباب الاستبعاد إن أمكن، واستفد منها في الفرصة الجاية.", "Ask for the award result and, if possible, the reasons, and use them for the next bid."]]
};
function tipsFor(d, o) {
  var r = [], n = daysTo(o.closing_date), act = active(d), l = loc(d.id);
  if (act && n != null && ["discover", "contact", "offer"].indexOf(d.stage) > -1) {
    if (n < 0) r.push({ c: "red", t: T("موعد الإغلاق المعلن عدّى — اتأكد من الجهة لو فيه مدّ للموعد، وإلا انقل الصفقة لـ«لم تكتمل».", "The published closing date has passed — check with the buyer whether it was extended, otherwise mark the deal as Lost.") });
    else if (n <= 3) r.push({ c: "red", t: EN ? left(n) + " — finalise your offer and confirm how and where it must be submitted." : left(n) + (n ? " على الإغلاق" : "") + " — راجع العرض النهائي واتأكد من طريقة ومكان التقديم." });
    else if (n <= 7) r.push({ c: "amber", t: EN ? left(n) + " before closing — prepare the bid bond / guarantee letter if the documents require one." : left(n) + " على الإغلاق — جهّز خطاب الضمان (التأمين الابتدائي) لو الكراسة طالباه." });
    else if (n <= 14) r.push({ c: "amber", t: EN ? left(n) + " — send your clarification questions now; buyers usually set a deadline for questions before closing." : left(n) + " — ابعت استفساراتك دلوقتي؛ غالباً فيه موعد نهائي للأسئلة قبل الإغلاق." });
  }
  if (act && !d.contact_email) r.push({ c: "", t: T("مفيش بريد لجهة الاتصال لسه — هاته من صفحة الإعلان الرسمية أو كراسة الشروط وسجّله هنا (باسم ما بيخمّنش إيميلات).", "No contact email yet — take it from the official notice or tender documents and save it here (Bassem never guesses emails)."), a: "contact" });
  if (awaiting(d)) { var w = daysSince(l.lastOut); if (w != null && w >= 3) r.push({ c: "amber", t: EN ? "No reply for " + w + " days — send a follow-up." : "مفيش رد من " + w + " أيام — ابعت رسالة متابعة.", a: "follow_up" }); }
  if (act && d.due_date && daysTo(d.due_date) < 0) r.push({ c: "red", t: T("الخطوة الجاية متأخرة عن موعدها: ", "Next action is overdue: ") + (d.next_action || "") });
  if (act && !d.next_action) r.push({ c: "", t: T("حدّد الخطوة الجاية وموعدها عشان أفكّرك بيها.", "Set the next action and its due date so I can remind you."), a: "plan" });
  (STIPS[d.stage] || []).forEach(function (s) { r.push({ c: "", t: T(s[0], s[1]) }); });
  return r;
}
function reminders() {
  var r = [];
  DEALS.forEach(function (d) { if (!active(d)) return; var o = oppOf(d), t = oTitle(o), x;
    if (d.due_date) { x = daysTo(d.due_date); if (x != null && x < 0) r.push({ id: d.id, c: "red", p: 0, h: T("متأخر: ", "Overdue: ") + (d.next_action || T("الخطوة الجاية", "next action")), s: t, e: fD(d.due_date) }); else if (x != null && x <= 3) r.push({ id: d.id, c: "amber", p: 1 + x, h: (x === 0 ? T("النهارده: ", "Today: ") : T("قريباً: ", "Soon: ")) + (d.next_action || T("الخطوة الجاية", "next action")), s: t, e: fD(d.due_date) }); }
    x = daysTo(o.closing_date); if (x != null && x >= 0 && x <= 3 && ["discover", "contact", "offer", "negotiation"].indexOf(d.stage) > -1) r.push({ id: d.id, c: "red", p: x, h: left(x) + T(" على الإغلاق", " before closing"), s: t, e: fD(o.closing_date) });
    if (awaiting(d)) { var w = daysSince(loc(d.id).lastOut); if (w >= 3) r.push({ id: d.id, c: "blue", p: 5, h: EN ? "Awaiting reply for " + w + " days" : "مستني رد من " + w + " أيام", s: t, e: T("ابعت متابعة", "Send follow-up") }); }
  });
  return r.sort(function (a, b) { return a.p - b.p; });
}

/* ---------- rendering: hero ---------- */
function svcEnded() { var i = svcInfo(); return !!(i && i.expired); }
function renderHero() {
  var EXP = svcEnded(); document.documentElement.classList.toggle("adv-exp", EXP);
  var h = NOW.getHours(), g = h < 12 ? T("صباح الخير", "Good morning") : T("مساء الخير", "Good evening"), pl = PLN[PK] ? T(PLN[PK][0], PLN[PK][1]) : (MP && MP.plan ? MP.plan.n : "");
  var mk = ORDER.map(function (m) { return '<span' + (inPlan(m) ? "" : ' class="lk" title="' + esc(T("غير مشمول في باقتك", "Not in your plan")) + '"') + '>' + MKT[m][2] + " " + esc(mName(m)) + "</span>"; }).join("");
  var mode = !MODE_READY ? '<span>⏳ ' + T("جارٍ الاتصال بخادم المستشار…", "Connecting to the advisor server…") + "</span>" : LIVE ? '<span class="live">🟢 ' + T("متصل — الإرسال من المنصة والردود بتوصل هنا", "Live — emails sent from the platform, replies arrive here") + "</span>" : '<span class="demo">🟠 ' + T("من غير اتصال بخادم المستشار — الإرسال من بريدك", "Not connected to the advisor server — emails open in your mail app") + "</span>";
  $("#advHx").innerHTML = '<nav class="crumb"><a href="home.html">' + T("الرئيسية", "Home") + '</a> › <a href="dashboard.html">' + T("لوحة المصنع", "Factory dashboard") + "</a> › " + T("المستشار الذكي للصفقات", "AI Deal Advisor") + "</nav>"
    + "<h1>" + g + (EN ? ", " : " يا ") + esc(PROF.company) + " 👋<small>" + T("باسم، مستشار أعمالك", "Bassem, your business advisor") + "</small></h1>"
    + '<p class="say" id="advSay"></p>'
    + '<div class="bdg"><span class="pl">⭐ ' + esc(pl) + "</span>" + mk + "</div>"
    + '<div class="bdg">' + mode + svcChip() + whoChip() + "</div>"
    + '<div class="acts">' + (EXP ? '<a class="btn btn-gold btn-sm" data-mig-buy href="register.html#' + esc(PLN[PK] ? PK : "partner") + '">🔄 ' + T("جدّد الاشتراك", "Renew") + "</a>" : '<a class="btn btn-gold btn-sm" href="#brief">📰 ' + T("ملخص النهارده", "Today's brief") + "</a>") + '<a class="btn btn-sm btn-gh" href="#pipeline">📋 ' + T("صفقاتي", "My deals") + '</a><button class="btn btn-sm btn-gh" type="button" id="advSetB">⚙️ ' + T("بيانات شركتي", "My company profile") + "</button>"
    + (EXP || !callOK() ? "" : '<button class="btn btn-sm btn-gh advlv" type="button" id="advLive">🎥 ' + T("كلّم باسم فيديو", "Video call with Bassem") + "</button>")
    + ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied" ? '<button class="btn btn-sm btn-gh" type="button" id="advNot">🔔 ' + T("فعّل تنبيهات المتصفح", "Enable browser alerts") + "</button>" : "") + "</div>"
    /* owner 2026-11-18 23:50: Bassem's memory with the member stays and grows day after day (no «امسح ذاكرتي») — said plainly here,
       wherever the member can call him (callOK, as the video-call button: a demo visitor is not remembered) */
    + (EXP || !callOK() ? "" : '<p class="advmem">🧠 ' + T("باسم فاكر شغلكم سوا علشان يكمّل معاك يوم بعد يوم", "Bassem remembers your work together, so he carries on with you day after day") + "</p>");
  $("#advSetB").onclick = openSettings;
  var lv = $("#advLive"); if (lv) lv.onclick = function () {
    if (window.BASSEM && BASSEM.video) { BASSEM.video(); return; }
    if (window.JANNA_LIVE && JANNA_LIVE.open) { JANNA_LIVE.open({ persona: "bassem", lang: EN ? "en" : "ar" }); return; }
    say(T("مكالمة الفيديو مش متاحة دلوقتي، جرّب تاني بعد شوية.", "Video calls are not available right now, please try again shortly."));
  };
  var nb = $("#advNot"); if (nb) nb.onclick = function () { try { Notification.requestPermission().then(function (p) { if (p === "granted") { say(T("تمام! هبعتلك تنبيه بالتذكيرات المهمة.", "Done! I'll alert you about important reminders.")); notifyOnce(true); } renderHero(); renderSay(); }); } catch (e) {} };
  renderSay();
}
/* «مدة الخدمة»: 365 days from activation (bassem.js keeps the period: activation date when known, else the first sign-in) */
function svcInfo() {
  var B = window.BASSEM; if (!B || !B.info) return null;
  var i = B.info(); if (i && i.eligible) return i;
  var m = advMember(); return B.period ? B.period(PROF.id, m && m.id === PROF.id ? (m.activated_at || "") : "") : null;
}
function svcChip() {
  var i = svcInfo(); if (!i) return "";
  if (i.expired) return '<span class="svc end">⏳ ' + T("مدة الخدمة انتهت", "Service period ended") + '<span data-mig-buy>' + T(" — جدّد اشتراكك", " — please renew") + "</span></span>";
  return '<span class="svc" title="' + esc(T("من ", "From ") + fD(i.start) + T(" لحد ", " to ") + fD(i.end)) + '">⏳ ' + (EN ? "Service period: " + i.left + " of 365 days left" : "مدة الخدمة: " + i.left + " يوم متبقي من 365") + "</span>";
}
function advMember() { var m = LG("mig-adv-member", null); return m && m.id ? m : null; }
function whoChip() { var m = advMember(); return m && m.id === PROF.id && LIVE ? '<span class="who">👤 ' + esc(m.email || m.id) + "</span>" : ""; }
function openList() { return OPPS.filter(function (o) { return o.open && inPlan(o.market); }); }
function renderSay() {
  var el = $("#advSay"); if (!el) return;
  /* the platform's own app with buying off there (data/flags.js MIGFLAGS.buyOff, the store rules): the same words without «جدّد» */
  if (svcEnded()) { el.textContent = window.MIGFLAGS && MIGFLAGS.buyOff && MIGFLAGS.buyOff() ? T("مدة خدمتي السنوية معاك خلصت، فملخص الفرص اليومي والمكالمات وقفوا — وصفقاتك القديمة لسه موجودة هنا.", "My one-year service period with you has ended, so the daily brief and video calls have stopped — your earlier deals are still here.")
    : T("مدة خدمتي السنوية معاك خلصت، فملخص الفرص اليومي والمكالمات وقفوا. جدّد اشتراكك في باقة الشريك عشان نكمّل شغلنا سوا — وصفقاتك القديمة لسه موجودة هنا.", "My one-year service period with you has ended, so the daily brief and video calls have stopped. Renew your partner plan so we can keep working together — your earlier deals are still here."); return; }
  var L = openList(), nw = L.filter(function (o) { return o.isNew; }), mine = nw.filter(function (o) { return o.match || o.kwm; }).length, soon = L.filter(function (o) { var n = daysTo(o.closing_date); return n != null && n >= 0 && n <= 7; }).length, act = DEALS.filter(active).length, aw = DEALS.filter(awaiting).length;
  el.textContent = EN ? "Since your last visit I found " + nw.length + " new opportunities in your markets" + (mine ? " (" + mine + " match your sectors)" : "") + ", and " + soon + " close within a week. You have " + act + " active deals" + (aw ? " and " + aw + " awaiting a reply." : ".")
    : "من آخر زيارة لقيتلك " + nw.length + " فرصة جديدة في أسواقك" + (mine ? " (منهم " + mine + " في قطاعك)" : "") + "، و" + soon + " فرصة بتقفل خلال أسبوع. عندك " + act + " صفقة شغالة" + (aw ? " و" + aw + " مستنية رد." : ".");
}

/* ---------- rendering: profile warning + reminders ---------- */
function renderWarn() {
  if (LOGINERR) { $("#advWarn").innerHTML = '<div class="advwarn" role="alert"><span>⚠️ ' + esc(LOGINERR.m) + "</span>" + (LOGINERR.a ? mailForm() : "") + "</div>" + (GATED ? lockBox() : ""); return; }
  if (GATED) return;
  if (NEEDLINK && !LIVE && MODE_READY) { $("#advWarn").innerHTML = '<div class="advwarn"><span>🔑 ' + T("عشان تشتغل أونلاين (الإيميلات من المنصة والردود توصلك هنا) افتح رابط التفعيل اللي وصلك على بريد شركتك، أو اطلب رابط جديد. لحد كده الصفحة شغالة من غير اتصال بالخادم (محفوظة على جهازك).", "To work live (emails sent from the platform, replies arriving here) open the activation link sent to your company email, or ask for a new one. Meanwhile the page works offline (saved on this device).") + "</span>" + mailForm() + "</div>"; return; }
  var miss = []; if (PROF.demo) miss.push(T("اسم شركتك", "company name")); if (!PROF.email) miss.push(T("بريدك", "email")); if (!PROF.sectors.length) miss.push(T("قطاعاتك", "sectors")); if (!PROF.sender_name) miss.push(T("اسم المرسِل", "sender name"));
  $("#advWarn").innerHTML = miss.length ? '<div class="advwarn"><span>👋 ' + T("كمّل بيانات شركتك عشان أرتّب الفرص على مقاسك وأملأ الإيميلات تلقائياً: ", "Complete your company profile so I can rank opportunities for you and pre-fill emails: ") + "<b>" + esc(miss.join(T("، ", ", "))) + '</b></span><button class="btn btn-green btn-sm" type="button" data-set>⚙️ ' + T("كمّل البيانات", "Complete profile") + "</button></div>" : "";
}
function renderReminders() {
  var r = reminders(), el = $("#reminders");
  el.innerHTML = '<header style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><h2 id="advRemT" style="font-size:1.08rem">⏰ ' + T("باسم بيفكّرك", "Bassem's reminders") + '</h2><span class="note2">' + T("المتأخر والمستحق خلال 3 أيام", "Overdue and due within 3 days") + "</span></header>"
    + (r.length ? '<div class="advrem">' + r.slice(0, 8).map(function (x) { return '<button type="button" class="' + x.c + '" data-open="' + esc(x.id) + '"><span><b>' + esc(x.h) + "</b><small>" + esc(x.s) + "</small></span><em>" + esc(x.e) + "</em></button>"; }).join("") + "</div>"
      : '<p class="muted" style="font-size:.9rem">' + (DEALS.length ? T("مفيش تذكيرات عاجلة — كل حاجة تحت السيطرة 👌", "No urgent reminders — everything is on track 👌") : T("لسه ما بدأتش أي صفقة. اختار فرصة من ملخص النهارده واضغط «ابدأ صفقة» وأنا هتابعها معاك خطوة بخطوة.", "No deals yet. Pick an opportunity from today's brief and press “Start a deal” — I'll follow it with you step by step.")) + "</p>");
}
function notifyOnce(force) {
  try { if (!("Notification" in window) || Notification.permission !== "granted" || svcEnded()) return; if (!force && LG("mig-adv-notif-day", "") === TD) return; var r = reminders(), nw = openList().filter(function (o) { return o.isNew; }).length; if (!r.length && !nw && !force) return; LS("mig-adv-notif-day", TD);
    new Notification(T("باسم – المستشار الذكي للصفقات", "Bassem – AI Deal Advisor"), { body: EN ? r.length + " reminders · " + nw + " new opportunities" : r.length + " تذكير · " + nw + " فرصة جديدة", icon: BHEAD, lang: EN ? "en" : "ar", dir: EN ? "ltr" : "rtl" }); } catch (e) {}
}

/* ---------- rendering: daily brief ---------- */
var BS = { tab: "all", q: "", mine: false, only: "", sort: "rel", n: 12 };
function briefList() {
  var L = openList(), q = BS.q.trim().toLowerCase();
  if (BS.tab !== "all") L = L.filter(function (o) { return o.market === BS.tab; });
  if (BS.mine) L = L.filter(function (o) { return o.match || o.kwm; });
  if (BS.only === "new") L = L.filter(function (o) { return o.isNew; });
  if (BS.only === "soon") L = L.filter(function (o) { var n = daysTo(o.closing_date); return n != null && n >= 0 && n <= 7; });
  if (q) L = L.filter(function (o) { return [o.title_ar, o.title_en, o.entity_ar, o.entity_en, o.country_ar, o.country_en, o.sector_ar, o.ref, o.city].join(" ").toLowerCase().indexOf(q) > -1; });
  var cl = function (o) { var n = daysTo(o.closing_date); return n == null ? 9999 : n; };
  L.sort(BS.sort === "close" ? function (a, b) { return cl(a) - cl(b); } : BS.sort === "new" ? function (a, b) { return String(b.publish_date || "").localeCompare(String(a.publish_date || "")); } : function (a, b) { return (b.score - a.score) || (cl(a) - cl(b)); });
  return L;
}
function oppCard(o) {
  var n = daysTo(o.closing_date), d = dealFor(o), v = money(o.value, o.currency);
  return '<article class="opc' + (o.isNew ? " nw" : "") + '"><div class="opc-t"><span class="fl" aria-hidden="true">' + flag(o) + '</span><span class="chip chip-gray">' + esc(mName(o.market)) + '</span><span class="chip ' + (o.kind === "rfq" ? "chip-blue" : o.kind === "pvt" ? "chip-gold" : "chip-green") + '">' + esc(kName(o.kind)) + "</span>" + (o.isNew ? '<span class="chip chip-new">' + T("جديد", "New") + "</span>" : "") + (o.match || o.kwm ? '<span class="chip chip-gold">🎯 ' + T("يناسب نشاطك", "Fits your business") + "</span>" : "") + "</div>"
    + "<h3>" + esc(oTitle(o)) + "</h3>"
    + '<div class="opc-m"><span>🏛️ ' + esc(oEnt(o) || T("الجهة غير مذكورة", "Buyer not stated")) + "</span><span>📍 " + esc(oPlace(o)) + "</span>" + (o.sector_ar && !EN ? "<span>🏷️ " + esc(o.sector_ar) + "</span>" : "") + (v ? '<span class="num">💰 ' + T("القيمة التقديرية: ", "Estimated value: ") + esc(v) + "</span>" : "") + (o.bond ? '<span class="num">🛡️ ' + T("التأمين الابتدائي: ", "Bid bond: ") + Number(o.bond).toLocaleString("en-US") + T(" جنيه", " EGP") + "</span>" : "") + (o.booklet ? '<span class="num">📘 ' + T("ثمن الكراسة: ", "Documents fee: ") + Number(o.booklet).toLocaleString("en-US") + T(" جنيه", " EGP") + "</span>" : "") + (refKey(o.ref) ? '<span class="num">#️⃣ <bdi translate="no">' + esc(o.ref) + "</bdi></span>" : "") + "</div>"
    + '<div class="opc-f">' + (o.closing_date ? '<span class="chip ' + cdCls(n) + '">⏳ ' + esc(left(n)) + " · " + esc(fD(o.closing_date)) + "</span>" : '<span class="chip cd-gray">' + T("موعد الإغلاق غير معلن", "No closing date published") + "</span>") + (o.publish_date ? '<span class="muted">📅 ' + T("نُشرت ", "Published ") + esc(fD(o.publish_date)) + "</span>" : "") + (o.source_url ? '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener">' + T("المصدر الرسمي ↗", "Official source ↗") + "</a>" : "") + "</div>"
    + '<div class="opc-a">' + (d ? '<button class="btn btn-green btn-sm" type="button" data-open="' + esc(d.id) + '">📂 ' + T("افتح الصفقة", "Open deal") + " · " + esc(sName(d.stage)) + "</button>" : '<button class="btn btn-green btn-sm" type="button" data-start="' + esc(o.uid) + '">🚀 ' + T("ابدأ صفقة", "Start a deal") + "</button>") + '<button class="btn btn-line btn-sm" type="button" data-how="' + esc(o.uid) + '">🧭 ' + T("إزاي أتعاقد؟", "How do I contract?") + "</button></div></article>";
}
function renderBrief() {
  var L0 = openList(), el = $("#brief"), all = OPPS.filter(function (o) { return o.open; });
  var nNew = L0.filter(function (o) { return o.isNew; }).length, nSoon = L0.filter(function (o) { var n = daysTo(o.closing_date); return n != null && n >= 0 && n <= 7; }).length, nAct = DEALS.filter(active).length, nAw = DEALS.filter(awaiting).length;
  var tabs = '<button type="button" data-tab="all" class="' + (BS.tab === "all" ? "on" : "") + '">🌐 ' + T("كل أسواقي", "All my markets") + " <i>" + L0.length + "</i></button>" + ORDER.map(function (m) { var c = all.filter(function (o) { return o.market === m; }).length; return '<button type="button" data-tab="' + m + '" class="' + (BS.tab === m ? "on" : "") + (inPlan(m) ? "" : " lk") + '"' + (inPlan(m) ? "" : ' aria-label="' + esc(mName(m) + " – " + T("غير مشمول في باقتك", "not in your plan")) + '"') + ">" + (inPlan(m) ? MKT[m][2] : "🔒") + " " + esc(mName(m)) + " <i>" + c + "</i></button>"; }).join("");
  var body;
  if (BS.tab !== "all" && !inPlan(BS.tab)) {
    var cnt = all.filter(function (o) { return o.market === BS.tab; }).length;
    body = '<div class="advup"><div><b>🔒 ' + (EN ? mName(BS.tab) + " is not included in your plan" : "سوق " + esc(mName(BS.tab)) + " مش ضمن باقتك") + "</b><p style=\"opacity:.9;font-size:.88rem\">" + (EN ? cnt + " open opportunities are published in this market. Asia and Europe are included in the Strategic Partner plan." : "فيه " + cnt + " فرصة مفتوحة منشورة في السوق ده. أسواق آسيا وأوروبا متاحة في باقة الشريك الاستراتيجي.") + '</p></div><a class="btn btn-gold btn-sm" href="register.html#strategic">⬆️ ' + T("ترقية للشريك الاستراتيجي", "Upgrade to Strategic Partner") + "</a></div>";
  } else {
    var L = briefList();
    body = L.length ? '<div class="advg">' + L.slice(0, BS.n).map(oppCard).join("") + "</div>" + (L.length > BS.n ? '<button class="btn btn-line advmore" type="button" id="advMore">' + T("عرض المزيد", "Show more") + " (" + (L.length - BS.n) + ")</button>" : "")
      : '<div class="advempty"><b>🔍 ' + T("مفيش فرص مطابقة دلوقتي", "No matching opportunities right now") + "</b><span>" + T("جرّب تشيل الفلاتر أو تختار سوق تاني. بنضيف الفرص الجديدة من مصادرها الرسمية أول بأول.", "Try clearing the filters or choosing another market. New opportunities are added from their official sources as they are published.") + "</span></div>";
  }
  el.innerHTML = '<header><div><h2 id="briefT">📰 ' + T("ملخص النهارده", "Today's brief") + "</h2><p>" + (EN ? "Tenders, projects and buyer requests in your plan's markets, ranked for your business. New = published after " + fD(SINCE) + "." : "مناقصات ومشاريع وطلبات شراء في أسواق باقتك، مرتّبة حسب نشاطك. «جديد» = اتنشر بعد " + fD(SINCE) + ".") + "</p></div></header>"
    + '<div class="advk"><button type="button" data-only="new" class="' + (BS.only === "new" ? "on" : "") + '"><b>' + nNew + "</b><span>" + T("جديد من آخر زيارة", "New since last visit") + '</span></button><button type="button" class="k2' + (BS.only === "soon" ? " on" : "") + '" data-only="soon"><b>' + nSoon + "</b><span>" + T("بتقفل خلال 7 أيام", "Closing within 7 days") + '</span></button><button type="button" class="k3" data-go="pipeline"><b>' + nAct + "</b><span>" + T("صفقات شغالة", "Active deals") + '</span></button><button type="button" class="k4" data-go="pipeline"><b>' + nAw + "</b><span>" + T("مستنية رد", "Awaiting reply") + "</span></button></div>"
    + '<div class="advtabs" role="group" aria-label="' + T("الأسواق", "Markets") + '">' + tabs + "</div>"
    + '<div class="advtools"><input type="search" id="advQ" value="' + esc(BS.q) + '" placeholder="' + T("ابحث بالمنتج أو الجهة أو الدولة…", "Search by product, buyer or country…") + '" aria-label="' + T("بحث", "Search") + '"><select id="advSort" aria-label="' + T("الترتيب", "Sort") + '"><option value="rel"' + (BS.sort === "rel" ? " selected" : "") + ">" + T("الأنسب لنشاطك", "Best match") + '</option><option value="close"' + (BS.sort === "close" ? " selected" : "") + ">" + T("الأقرب إغلاقاً", "Closing soonest") + '</option><option value="new"' + (BS.sort === "new" ? " selected" : "") + ">" + T("الأحدث نشراً", "Newest") + '</option></select><label><input type="checkbox" id="advMine"' + (BS.mine ? " checked" : "") + "> " + T("يناسب نشاطي بس", "Fits my business only") + "</label>" + (BS.only ? '<button class="btn btn-line btn-sm" type="button" data-only="">✕ ' + (BS.only === "new" ? T("الجديد فقط", "New only") : T("بتقفل قريب", "Closing soon")) + "</button>" : "") + "</div>" + body;
  var q = $("#advQ"); q.oninput = function () { BS.q = q.value; BS.n = 12; clearTimeout(q._t); q._t = setTimeout(function () { renderBrief(); var q2 = $("#advQ"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 250); };
  keepVals(el);
  $("#advSort").onchange = function () { BS.sort = this.value; renderBrief(); };
  $("#advMine").onchange = function () { BS.mine = this.checked; BS.n = 12; renderBrief(); };
  var mb = $("#advMore"); if (mb) mb.onclick = function () { BS.n += 12; renderBrief(); };
  renderSay();
}

/* ---------- rendering: pipeline ---------- */
function renderPipeline() {
  var el = $("#pipeline");
  if (!MODE_READY) { el.innerHTML = '<header><h2 id="pipeT">📋 ' + T("صفقاتي", "My deals") + '</h2></header><div class="advempty">⏳ ' + T("جارٍ تحميل صفقاتك…", "Loading your deals…") + "</div>"; return; }
  el.innerHTML = '<header><div><h2 id="pipeT">📋 ' + T("صفقاتي", "My deals") + "</h2><p>" + T("اسحب الصفقة لمرحلة جديدة أو غيّر المرحلة من القائمة. اضغط على العنوان لفتح غرفة الصفقة.", "Drag a deal to another stage or change it from the list. Click a title to open the deal room.") + "</p></div><span class=\"note2\">" + (LIVE ? T("محفوظة على خادم المنصة", "Saved on the platform server") : T("من غير اتصال بالخادم: محفوظة على جهازك", "Offline: saved on this device")) + "</span></header>"
    + '<div class="advkb" id="advKb">' + STG.map(function (s) { var L = DEALS.filter(function (d) { return (d.stage || "discover") === s[0]; }); return '<section class="kc' + (L.length ? "" : " empty") + '" data-st="' + s[0] + '" aria-label="' + esc(T(s[1], s[2])) + '"><h3>' + s[3] + " " + esc(T(s[1], s[2])) + " <i>" + L.length + '</i></h3><div class="kc-b">' + (L.length ? L.map(dealCard).join("") : '<div class="kc-e">' + T("اسحب صفقة هنا", "Drop a deal here") + "</div>") + "</div></section>"; }).join("") + "</div>"
    + (DEALS.length ? "" : '<div class="advempty"><b>🚀 ' + T("ابدأ أول صفقة", "Start your first deal") + "</b><span>" + T("من ملخص النهارده اضغط «ابدأ صفقة» على أي فرصة تناسبك.", "From today's brief, press “Start a deal” on any opportunity that fits you.") + "</span></div>");
}
function dealCard(d) {
  var o = oppOf(d), n = daysTo(o.closing_date), late = d.due_date && daysTo(d.due_date) < 0 && active(d);
  return '<article class="dc" draggable="true" data-id="' + esc(d.id) + '"><button type="button" class="dc-o" data-open="' + esc(d.id) + '">' + esc(oTitle(o)) + "</button><small>" + flag(o) + " " + esc(oEnt(o) || oPlace(o)) + (o.closing_date && active(d) ? " · " + esc(left(n)) : "") + "</small>"
    + (d.next_action ? '<div class="dc-n' + (late ? " late" : "") + '">➡️ ' + esc(d.next_action) + (d.due_date ? " · " + esc(fD(d.due_date)) : "") + "</div>" : '<div class="dc-n" style="color:var(--muted)">➡️ ' + T("حدّد الخطوة الجاية", "Set the next action") + "</div>")
    + (awaiting(d) ? '<span class="chip chip-blue" style="align-self:flex-start">✉️ ' + T("مستنية رد", "Awaiting reply") + "</span>" : "")
    + '<select data-stage="' + esc(d.id) + '" aria-label="' + T("مرحلة الصفقة", "Deal stage") + '">' + STG.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === d.stage ? " selected" : "") + ">" + s[3] + " " + esc(T(s[1], s[2])) + "</option>"; }).join("") + "</select></article>";
}
function renderAll() { renderHero(); renderWarn(); renderReminders(); renderBrief(); renderPipeline(); if (DR.id) { var d = getDeal(DR.id); if (d && DR.tab !== "mail") openDeal(d.id, DR.tab, true); } }
function setStage(id, st) {
  var d = getDeal(id); if (!d || d.stage === st) return;
  var from = d.stage;
  patchDeal(id, { stage: st }).then(function () { ev(id, "اتنقلت الصفقة من «" + sNameAr(from) + "» إلى «" + sNameAr(st) + "»", "Moved from “" + sNameEn(from) + "” to “" + sNameEn(st) + "”"); say(T("اتنقلت الصفقة إلى ", "Deal moved to ") + sName(st)); renderAll(); }, function (e) { say(T("تعذّر تحديث المرحلة: ", "Could not update the stage: ") + e.message); renderPipeline(); });
}
function sNameAr(s) { for (var i = 0; i < STG.length; i++) if (STG[i][0] === s) return STG[i][1]; return s; }
function sNameEn(s) { for (var i = 0; i < STG.length; i++) if (STG[i][0] === s) return STG[i][2]; return s; }

/* ---------- deal room / guide drawer ---------- */
var DR = { id: null, tab: "over", prev: null };
function drawer(html) { var dr = $("#advDr"); if (dr.hidden) DR.prev = document.activeElement; dr.innerHTML = '<div class="pn" role="dialog" aria-modal="true" aria-labelledby="advDrT">' + html + "</div>"; dr.hidden = false; document.body.classList.add("adr-on"); keepVals(dr); return dr; }
function closeDr() { var dr = $("#advDr"); dr.hidden = true; dr.innerHTML = ""; document.body.classList.remove("adr-on"); DR.id = null; if (/^#deal=/.test(location.hash)) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} } if (DR.prev && DR.prev.focus && document.contains(DR.prev)) DR.prev.focus(); }
function head(o, extra) { return '<div class="pn-h"><div class="r1"><h2 id="advDrT">' + flag(o) + " " + esc(oTitle(o)) + '</h2><button class="x" type="button" data-close aria-label="' + T("إغلاق", "Close") + '">✕</button></div><div class="opc-t"><span class="chip chip-gray">' + esc(mName(o.market)) + '</span><span class="chip chip-green">' + esc(kName(o.kind)) + "</span>" + (o.closing_date ? '<span class="chip ' + cdCls(daysTo(o.closing_date)) + '">⏳ ' + esc(left(daysTo(o.closing_date))) + "</span>" : "") + "</div>" + (extra || "") + "</div>"; }
function detailsCard(o) {
  var v = money(o.value, o.currency);
  return '<div class="card2"><h3>📌 ' + T("تفاصيل الفرصة", "Opportunity details") + "</h3><dl>"
    + (refKey(o.ref) ? "<dt>" + T("الرقم المرجعي", "Reference") + '</dt><dd class="num" dir="auto" translate="no">' + esc(o.ref) + "</dd>" : "")
    + "<dt>" + T("الجهة / المشتري", "Buyer") + "</dt><dd>" + esc(oEnt(o) || "—") + "</dd><dt>" + T("المكان", "Location") + "</dt><dd>" + esc(oPlace(o) || "—") + "</dd>"
    + (o.sector_ar ? "<dt>" + T("القطاع", "Sector") + "</dt><dd>" + esc(o.sector_ar) + "</dd>" : "") + (o.ptype ? "<dt>" + T("نوع الطرح", "Procurement type") + "</dt><dd>" + esc(o.ptype) + "</dd>" : "")
    + "<dt>" + T("تاريخ النشر", "Published") + "</dt><dd>" + esc(fD(o.publish_date)) + "</dd><dt>" + T("موعد الإغلاق", "Closing date") + "</dt><dd>" + esc(o.closing_date ? fD(o.closing_date) + " (" + left(daysTo(o.closing_date)) + ")" : T("غير معلن", "Not published")) + "</dd>"
    + (v ? "<dt>" + T("القيمة التقديرية", "Estimated value") + '</dt><dd class="num">' + esc(v) + "</dd>" : "") + (o.bond ? "<dt>" + T("التأمين الابتدائي", "Bid bond") + '</dt><dd class="num">' + Number(o.bond).toLocaleString("en-US") + T(" جنيه", " EGP") + "</dd>" : "") + (o.booklet ? "<dt>" + T("ثمن الكراسة", "Documents fee") + '</dt><dd class="num">' + Number(o.booklet).toLocaleString("en-US") + T(" جنيه", " EGP") + "</dd>" : "")
    + (o.source_name ? "<dt>" + T("المصدر", "Source") + '</dt><dd dir="auto" translate="no">' + esc(o.source_name) + "</dd>" : "") + "</dl>"
    + (o.source_url ? '<a class="btn btn-line btn-sm" style="align-self:flex-start" href="' + esc(o.source_url) + '" target="_blank" rel="noopener">🔗 ' + T("افتح الإعلان الرسمي", "Open the official notice") + " ↗</a>" : "") + "</div>";
}
function guideHTML(o, d) {
  var l = d ? loc(d.id) : { checks: {} }, ck = l.checks, tot = 0, dn = 0, mg = G && G.markets ? G.markets[o.market] : null, pt = findPortal(o), ptRel = !pt && marketPortal(o), kd = G && G.kinds ? items(G.kinds[o.kind] || (o.kind === "rfq" ? null : G.kinds.gov)) : [];
  function list(arr, pre, sub) { return '<ul class="ckl">' + arr.map(function (i, n) { var k = pre + n; tot++; if (!d) return '<li class="pl"><span>' + esc(tx(i)) + (sub ? sub(i) : "") + "</span></li>"; var on = !!ck[k]; if (on) dn++; return '<li><label class="' + (on ? "done" : "") + '"><input type="checkbox" data-ck="' + esc(k) + '"' + (on ? " checked" : "") + "><span>" + esc(tx(i)) + (sub ? sub(i) : "") + "</span></label></li>"; }).join("") + "</ul>"; }
  function plain(arr, cls) { return arr.length ? '<ul class="gl' + (cls ? " " + cls : "") + '">' + arr.map(function (i) { return "<li>" + (i.hit ? "🎯 <b>" + esc(tx(i)) + "</b>" : esc(tx(i))) + (i.applies_to ? ' <small class="muted">(' + esc(Array.isArray(i.applies_to) ? i.applies_to.join(", ") : i.applies_to) + ")</small>" : "") + "</li>"; }).join("") + "</ul>" : ""; }
  function srcs(arr) { return arr && arr.length ? '<p class="hint">' + T("المصادر: ", "Sources: ") + arr.filter(function (s) { return s && s.url; }).map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || hostOf(s.url)) + " ↗</a>"; }).join(" · ") + "</p>" : ""; }
  var h = "";
  if (!G) h += '<div class="card2"><h3>🧭 ' + T("دليل التعاقد", "Contracting guide") + '</h3><p class="muted">' + T("دليل التعاقد التفصيلي للأسواق بيتحدّث حالياً. لحد ما يكمل: المرجع الأساسي هو الإعلان الرسمي وكراسة الشروط من المصدر.", "The detailed contracting guide is being updated. Meanwhile, the official notice and tender documents at the source are your main reference.") + "</p>" + (o.source_url ? '<a class="btn btn-line btn-sm" style="align-self:flex-start" href="' + esc(o.source_url) + '" target="_blank" rel="noopener">🔗 ' + T("الإعلان الرسمي", "Official notice") + " ↗</a>" : "") + "</div>";
  if (mg) {
    var ms = items(mg.steps), dc = items(mg.documents);
    h += '<div class="card2"><h3>🗺️ ' + T("خطوات التعاقد في ", "How to contract in ") + esc(tx({ ar: mg.name_ar, en: mg.name_en }) || mName(o.market)) + "</h3>" + (tx({ ar: mg.summary_ar, en: mg.summary_en }) ? '<p class="muted" style="font-size:.9rem">' + esc(tx({ ar: mg.summary_ar, en: mg.summary_en })) + "</p>" : "") + (ms.length ? list(ms, "m:") : "") + "</div>";
    if (dc.length) h += '<div class="card2"><h3>📁 ' + T("المستندات المطلوبة عادةً", "Documents usually required") + "</h3>" + list(dc, "d:") + "</div>";
    var ce = items(mg.certifications).map(function (c) { var at = String(c.applies_to || ""); return { ar: c.ar, en: c.en, applies_to: c.applies_to, hit: !!(o.country_en && at.toLowerCase().indexOf(String(o.country_en).toLowerCase()) > -1) }; }).sort(function (a, b) { return b.hit - a.hit; }), ps = items(mg.payment_shipping), ca = items(mg.cautions);
    if (ce.length || ps.length) h += '<div class="card2">' + (ce.length ? "<h3>🏅 " + T("الشهادات والمطابقة", "Certifications & conformity") + "</h3>" + plain(ce) : "") + (ps.length ? "<h3>🚢 " + T("الدفع والشحن", "Payment & shipping") + "</h3>" + plain(ps) : "") + "</div>";
    if (ca.length) h += '<div class="card2" style="border-color:#F3D19C"><h3>⚠️ ' + T("خلي بالك", "Watch out") + "</h3>" + plain(ca, "warn") + srcs(mg.sources) + "</div>"; else h += srcs(mg.sources);
  } else if (G) h += '<div class="card2"><h3>🗺️ ' + T("خطوات التعاقد", "How to contract") + '</h3><p class="muted">' + T("الدليل الخاص بالسوق ده لسه بيتجهّز. ارجع للإعلان الرسمي وكراسة الشروط.", "The guide for this market is being prepared. Refer to the official notice and tender documents.") + "</p></div>";
  if (!pt && ptRel) pt = ptRel;
  if (pt) {
    var hb = items(pt.how_to_bid);
    h += '<div class="card2"><h3>🏛️ ' + (ptRel ? T("البوابة الرسمية لهذا السوق: ", "Official portal for this market: ") : T("بوابة الطرح: ", "Procurement portal: ")) + (pt.url ? '<a href="' + esc(pt.url) + '" target="_blank" rel="noopener" dir="auto">' + esc(pt.name || hostOf(pt.url)) + " ↗</a>" : esc(pt.name || "")) + "</h3>" + (hb.length ? list(hb, "p:") : "")
      + "<dl>" + (tx(pt.registration) ? "<dt>" + T("التسجيل", "Registration") + "</dt><dd>" + esc(tx(pt.registration)) + "</dd>" : "") + (pt.language ? "<dt>" + T("لغة الطرح", "Language") + '</dt><dd dir="auto">' + esc(tx(pt.language)) + "</dd>" : "") + (tx(pt.bid_security) ? "<dt>" + T("ضمان العطاء", "Bid security") + "</dt><dd>" + esc(tx(pt.bid_security)) + "</dd>" : "") + (tx(pt.notes) ? "<dt>" + T("ملاحظات", "Notes") + "</dt><dd>" + esc(tx(pt.notes)) + "</dd>" : "") + "</dl>" + srcs(pt.sources) + "</div>";
  }
  if (kd.length) h += '<div class="card2"><h3>🧾 ' + (o.kind === "rfq" ? T("الرد على طلب عرض سعر", "Responding to an RFQ") : o.kind === "pvt" ? T("التعامل مع مشتري من القطاع الخاص", "Working with a private buyer") : T("خطوات المناقصة الحكومية", "Government tender steps")) + "</h3>" + list(kd, "k:") + "</div>";
  var pr = tot ? Math.round(dn * 100 / tot) : 0;
  return (d && tot ? '<div class="card2"><h3>✅ ' + T("تقدّمك في خطوات التعاقد", "Your contracting progress") + ' <span class="chip chip-green num">' + dn + " / " + tot + '</span></h3><div class="prg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pr + '"><i style="width:' + pr + '%"></i></div></div>' : "")
    + h + '<p class="hint">ℹ️ ' + (G && G.disclaimer && tx(G.disclaimer) ? esc(tx(G.disclaimer)) + (G.updated ? T(" (آخر تحديث ", " (updated ") + fD(G.updated) + ")" : "") : T("معلومات إرشادية عامة" + (G && G.updated ? " (آخر تحديث " + fD(G.updated) + ")" : "") + "؛ المرجع النهائي هو الإعلان الرسمي وكراسة الشروط ووثائق الجهة الطارحة.", "General guidance" + (G && G.updated ? " (updated " + fD(G.updated) + ")" : "") + "; the official notice and the buyer's tender documents always prevail.")) + "</p>";
}
function openGuide(uid) {
  var o = byUid(uid); if (!o) return; var d = dealFor(o); DR.id = null;
  drawer(head(o) + '<div class="pn-b"><div class="jtip"><img src="' + BHEAD + '" alt=""><ul><li>' + T("ده ملخص طريقة التعاقد للفرصة دي. لو عايزني أتابعها معاك وأحفظ تقدّمك وأجهّز الإيميلات، ابدأ صفقة.", "Here is how contracting works for this opportunity. To have me follow it with you, save your progress and draft emails, start a deal.") + "</li></ul></div>" + (d ? '<button class="btn btn-green" type="button" data-open="' + esc(d.id) + '">📂 ' + T("افتح الصفقة", "Open deal") + "</button>" : '<button class="btn btn-green" type="button" data-start="' + esc(o.uid) + '">🚀 ' + T("ابدأ صفقة واحفظ التقدّم", "Start a deal and track progress") + "</button>") + detailsCard(o) + guideHTML(o, null) + "</div>");
  focusDr();
}
function focusDr(sel) { setTimeout(function () { var x = (sel && document.querySelector(sel)) || document.querySelector("#advDr [data-close]"); if (x) x.focus(); }, 30); }
function startDeal(uid, btn) {
  var o = byUid(uid); if (!o) return; var ex = dealFor(o); if (ex) { openDeal(ex.id); return; }
  if (btn) btn.disabled = true;
  createDeal(o).then(function (d) { say(T("بدأنا الصفقة ✓ هتابعها معاك خطوة بخطوة", "Deal started ✓ I'll follow it with you step by step")); renderAll(); openDeal(d.id); }, function (e) { if (btn) btn.disabled = false; say(T("تعذّر بدء الصفقة: ", "Could not start the deal: ") + e.message); });
}
function openDeal(id, tab, keep, fsel) {
  var d = getDeal(id); if (!d) { say(T("الصفقة دي مش موجودة", "Deal not found")); return; }
  var o = oppOf(d), l = loc(d.id), sc = 0, pn = $("#advDr .pn");
  if (keep && pn) sc = pn.scrollTop;
  DR.id = d.id; DR.tab = tab || DR.tab || "over"; if (!keep && !tab) DR.tab = "over";
  try { if (location.hash !== "#deal=" + d.id) history.replaceState(null, "", "#deal=" + encodeURIComponent(d.id)); } catch (e) {}
  var tabs = [["over", "نظرة عامة", "Overview", "🧭"], ["mail", "المراسلات", "Emails", "✉️"], ["guide", "طريقة التعاقد", "How to contract", "📚"], ["log", "السجل", "Timeline", "🕓"]];
  var extra = '<div class="stg"><label for="advStg">' + T("المرحلة:", "Stage:") + '</label><select id="advStg" data-stage="' + esc(d.id) + '">' + STG.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === d.stage ? " selected" : "") + ">" + s[3] + " " + esc(T(s[1], s[2])) + "</option>"; }).join("") + "</select>" + (l.nMsg ? '<span class="chip chip-gray">✉️ ' + l.nMsg + "</span>" : "") + "</div>"
    + '<div class="seg2" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (t[0] === DR.tab) + '" data-dtab="' + t[0] + '" class="' + (t[0] === DR.tab ? "on" : "") + '">' + t[3] + " " + T(t[1], t[2]) + "</button>"; }).join("") + "</div>";
  var b = "";
  if (DR.tab === "over") {
    var tp = tipsFor(d, o);
    b += '<div class="jtip"><img src="' + BHEAD + '" alt=""><div style="flex:1;display:flex;flex-direction:column;gap:6px"><b>' + T("باسم بيقولك", "Bassem says") + "</b><ul>" + tp.map(function (t) { return '<li class="' + t.c + '"><span>💡 ' + esc(t.t) + "</span>" + (t.a === "follow_up" ? '<button class="btn btn-line" type="button" data-tpl="follow_up">' + T("اكتب المتابعة", "Draft follow-up") + "</button>" : t.a === "contact" ? '<button class="btn btn-line" type="button" data-focus="advCE">' + T("سجّل البريد", "Add email") + "</button>" : t.a === "plan" ? '<button class="btn btn-line" type="button" data-focus="advNA">' + T("حدّدها", "Set it") + "</button>" : "") + "</li>"; }).join("") + "</ul></div></div>";
    b += '<form class="card2" id="advPlan" novalidate><h3>🎯 ' + T("خطة العمل وجهة الاتصال", "Action plan & contact") + '</h3><div class="fgrid2">'
      + '<label class="f2 full">' + T("الخطوة الجاية", "Next action") + '<input id="advNA" name="next_action" maxlength="200" value="' + esc(d.next_action || "") + '" placeholder="' + T("مثال: طلب كراسة الشروط", "e.g. Request the tender documents") + '"></label>'
      + '<label class="f2">' + T("موعدها", "Due date") + '<input type="date" name="due_date" value="' + esc(d.due_date || "") + '"></label>'
      + '<label class="f2">' + T("قيمة الصفقة المتوقعة (اختياري)", "Expected deal value (optional)") + '<input name="value" maxlength="40" value="' + esc(d.value || "") + '" dir="auto"></label>'
      + '<label class="f2">' + T("اسم المسؤول عند الجهة", "Buyer contact name") + '<input name="contact_name" maxlength="120" value="' + esc(d.contact_name || "") + '" autocomplete="off"></label>'
      + '<label class="f2">' + T("بريد جهة الاتصال", "Buyer contact email") + '<input id="advCE" type="email" name="contact_email" maxlength="160" value="' + esc(d.contact_email || "") + '" dir="ltr" autocomplete="off"></label>'
      + '<p class="hint full">🔎 ' + T("باسم ما بيخمّنش عناوين بريد. هات البريد الرسمي من صفحة الإعلان أو كراسة الشروط", "Bassem never guesses email addresses. Take the official contact from the notice or tender documents") + (o.source_url ? ' — <a href="' + esc(o.source_url) + '" target="_blank" rel="noopener">' + T("افتح المصدر ↗", "open the source ↗") + "</a>" : "") + ".</p>"
      + '<label class="f2 full">' + T("ملاحظاتك", "Your notes") + '<textarea name="notes" maxlength="4000" style="min-height:90px">' + esc(d.notes || "") + "</textarea></label></div>"
      + '<p class="lgerr" id="advPE" role="alert" style="color:#B42318;font-weight:700;font-size:.85rem"></p><div class="acts2"><button class="btn btn-green btn-sm" type="submit">💾 ' + T("احفظ", "Save") + "</button>" + (LIVE ? "" : '<button class="btn btn-line btn-sm" type="button" data-del="' + esc(d.id) + '">🗑️ ' + T("احذف الصفقة", "Delete deal") + "</button>") + "</div></form>";
    b += detailsCard(o);
  } else if (DR.tab === "mail") {
    b += mailHTML(d, o);
  } else if (DR.tab === "guide") {
    b += guideHTML(o, d);
  } else {
    b += '<div class="card2"><h3>🕓 ' + T("سجل الصفقة", "Deal timeline") + '</h3><ul class="tl">' + (l.events.length ? l.events.map(function (e) { return "<li>" + esc(T(e.ar, e.en)) + "<small>" + esc(fDT(e.at)) + "</small></li>"; }).join("") : "<li>" + T("لسه مفيش أحداث.", "No events yet.") + "</li>") + "</ul></div>";
  }
  drawer(head(o, extra) + '<div class="pn-b">' + b + "</div>");
  var p2 = $("#advDr .pn"); if (keep && p2) p2.scrollTop = sc;
  if (DR.tab === "mail") initMail(d, o);
  if (!keep) focusDr(fsel);
}

/* ---------- emails ---------- */
function mailto(m) { return "mailto:" + String(m.to || "").split(/[,;\s]+/).filter(Boolean).map(encodeURIComponent).join(",").replace(/%40/g, "@") + "?" + (m.cc ? "cc=" + encodeURIComponent(m.cc).replace(/%40/g, "@") + "&" : "") + "subject=" + encodeURIComponent(m.subject || "") + "&body=" + encodeURIComponent(m.body || ""); }
function defTpl(d) { var t = TPLS(); if (awaiting(d) && t.follow_up) return "follow_up"; var m = { discover: "intro", contact: "request_documents", offer: "submit_offer", negotiation: "negotiation", contract: "thank_you", delivery: "thank_you", won: "thank_you", lost: "thank_you" }[d.stage] || "intro"; return t[m] ? m : (t.intro ? "intro" : Object.keys(t)[0]); }
function mailHTML(d, o) {
  var t = TPLS(), lang = (o.market === "local" || o.market === "gulf") ? "ar" : "en", canLive = LIVE && !(HEALTH && HEALTH.email === false);
  return '<div class="' + (canLive ? "okbox2" : "mlink") + '" style="font-size:.86rem;font-weight:600">' + (canLive ? "🟢 " + T("الرسالة هتتبعت من advisor@madeinegyptgate.com باسم شركتك، والردود هترجع هنا تلقائياً ونسخة منها لبريدك.", "The email is sent from advisor@madeinegyptgate.com in your company's name; replies come back here automatically, with a copy to your inbox.") : "🟠 <b>" + T("من غير اتصال بالخادم", "Offline") + "</b> — " + T("الإرسال من بريدك: هتتفتح الرسالة في برنامج البريد عندك، وبسجّلها هنا في المحادثة. لما يوصلك رد، الصقه بزر «سجّل الرد يدوياً».", "Sending from your own email: the message opens in your mail app and is logged here. When a reply arrives, paste it with “Log a reply manually”.")) + "</div>"
    + '<form class="card2" id="advMail" novalidate><h3>✍️ ' + T("اكتب رسالة", "Compose") + '</h3><div class="fgrid2">'
    + '<label class="f2">' + T("النموذج", "Template") + '<select id="mTpl">' + Object.keys(t).map(function (k) { return '<option value="' + esc(k) + '">' + esc(TPLN[k] ? T(TPLN[k][0], TPLN[k][1]) : k) + "</option>"; }).join("") + "</select></label>"
    + '<label class="f2">' + T("لغة الرسالة", "Email language") + '<select id="mLang"><option value="ar"' + (lang === "ar" ? " selected" : "") + '>العربية</option><option value="en"' + (lang === "en" ? " selected" : "") + ">English</option></select></label>"
    + '<label class="f2">' + T("إلى", "To") + '<input id="mTo" type="email" dir="ltr" value="' + esc(d.contact_email || "") + '" placeholder="' + esc(T("المستلم: هيتحدد لما نختار الجهة", "Recipient: set once we choose the buyer")) + '" autocomplete="off"></label>'
    + '<label class="f2">' + T("نسخة (اختياري)", "Cc (optional)") + '<input id="mCc" type="email" dir="ltr" autocomplete="off"></label>'
    + '<label class="f2 full">' + T("الموضوع", "Subject") + '<input id="mSub" dir="auto" maxlength="250"></label>'
    + '<label class="f2 full">' + T("نص الرسالة", "Message") + '<textarea id="mBody" dir="auto" style="min-height:220px"></textarea></label></div>'
    + '<p class="hint">' + T("النص اتملى تلقائياً من بيانات شركتك والصفقة — راجعه وعدّل اللي بين [ ] قبل الإرسال.", "Pre-filled from your profile and the deal — review it and replace anything in [ ] before sending.") + '</p><p id="mErr" role="alert" style="color:#B42318;font-weight:700;font-size:.85rem"></p>'
    + '<div class="acts2"><button class="btn btn-green" type="submit" id="mSend">' + (canLive ? "📤 " + T("ابعت من المنصة", "Send via the platform") : "📧 " + T("افتح في بريدي وسجّلها", "Open in my mail app & log it")) + '</button><button class="btn btn-line btn-sm" type="button" id="mRe">↺ ' + T("أعد ملء النموذج", "Refill template") + '</button></div><div id="mLink"></div></form>'
    + '<div class="card2"><h3 style="justify-content:space-between">💬 ' + T("المحادثة", "Thread") + (LIVE ? ' <button class="btn btn-line btn-sm" type="button" id="mRef">⟳ ' + T("تحديث", "Refresh") + "</button>" : "") + '</h3><div class="thr" id="mThr" translate="no"><p class="muted">⏳</p></div>'
    + (LIVE ? "" : '<details><summary style="cursor:pointer;font-weight:800;font-size:.9rem">📥 ' + T("سجّل الرد يدوياً", "Log a reply manually") + '</summary><form id="mIn" class="fgrid2" style="margin-top:10px" novalidate><label class="f2">' + T("من", "From") + '<input id="iFrom" dir="ltr" value="' + esc(d.contact_email || "") + '"></label><label class="f2">' + T("الموضوع", "Subject") + '<input id="iSub" dir="auto"></label><label class="f2 full">' + T("نص الرد", "Reply text") + '<textarea id="iBody" dir="auto" style="min-height:120px"></textarea></label><div class="full"><button class="btn btn-green btn-sm" type="submit">📥 ' + T("سجّل الرد", "Log reply") + "</button></div></form></details>") + "</div>";
}
function initMail(d, o) {
  var t = TPLS(), sel = $("#mTpl"); sel.value = DR.tpl && t[DR.tpl] ? DR.tpl : defTpl(d); DR.tpl = null;
  function refill() { var k = sel.value, lg = $("#mLang").value, tp = t[k] || {}; $("#mSub").value = fill(tp["subject_" + lg] || tp["subject_" + (lg === "en" ? "ar" : "en")] || "", d, o, lg); $("#mBody").value = fill(tp["body_" + lg] || tp["body_" + (lg === "en" ? "ar" : "en")] || "", d, o, lg); }
  refill(); sel.onchange = refill; $("#mLang").onchange = refill; $("#mRe").onclick = refill;
  var rf = $("#mRef"); if (rf) rf.onclick = function () { loadThread(d).then(function () { renderReminders(); renderBrief(); renderPipeline(); }); };
  /* live: new replies arrive through the Worker; refresh the open thread every minute */
  clearInterval(DR.poll); if (LIVE) DR.poll = setInterval(function () { if (DR.id !== d.id || DR.tab !== "mail" || !$("#mThr")) { clearInterval(DR.poll); return; } loadThread(d).then(function () { renderReminders(); renderBrief(); renderPipeline(); }); }, 60000);
  $("#advMail").addEventListener("submit", function (e) { e.preventDefault(); sendMail(d, o); });
  var fi = $("#mIn"); if (fi) fi.addEventListener("submit", function (e) { e.preventDefault(); var b = $("#iBody").value.trim(); if (!b) { $("#iBody").focus(); return; } var m = { id: "m" + Date.now().toString(36), direction: "in", from: $("#iFrom").value.trim(), to: PROF.email || "", subject: $("#iSub").value.trim(), body: b, at: new Date().toISOString(), manual: true }; var a = LG(KM + d.id, []); a.push(m); LS(KM + d.id, a); ev(d.id, "اتسجّل رد من " + (m.from || "الجهة"), "Reply logged from " + (m.from || "the buyer")); say(T("اتسجّل الرد ✓", "Reply logged ✓")); fi.reset(); loadThread(d).then(function () { renderReminders(); renderBrief(); renderPipeline(); }); });
  loadThread(d);
}
function loadThread(d) {
  var el = $("#mThr"); if (!el) return Promise.resolve();
  return listMsgs(d.id).then(function (ms) {
    if (!$("#mThr")) return;
    ms = ms.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    el.innerHTML = ms.length ? ms.map(function (m) { return '<div class="msg ' + (m.direction === "in" ? "in" : "out") + '"><div class="mh"><span>' + (m.direction === "in" ? "📥 " + T("وارد", "Received") : "📤 " + T("صادر", "Sent")) + (m.demo ? " · " + T("من بريدك (من غير اتصال بالخادم)", "from your mail app (offline)") : "") + (m.manual ? " · " + T("مسجّل يدوياً", "logged manually") : "") + '</span><span dir="ltr">' + esc(m.direction === "in" ? m.from : m.to) + "</span><span>" + esc(fDT(m.at)) + '</span></div><div class="ms" dir="auto">' + esc(m.subject || "") + '</div><pre dir="auto">' + esc(m.body || "") + "</pre></div>"; }).join("") : '<p class="muted" style="font-size:.88rem">' + T("لسه مفيش مراسلات في الصفقة دي.", "No emails in this deal yet.") + "</p>";
  }, function (e) { if ($("#mThr")) el.innerHTML = '<p style="color:#B42318">' + T("تعذّر تحميل المراسلات: ", "Could not load the thread: ") + esc(e.message) + "</p>"; });
}
var EMRE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/* every outcome of «ابعت» is also told on window "mig:advisor-mail" {deal, sent, code?, error?, limit?, to?, mailto?}: the live call's
   bassem_send_email waits for it (data/janna-live.js roomSend), so Bassem says «اتبعت» only when the platform answered sent */
function mailDone(o) { try { window.dispatchEvent(new CustomEvent("mig:advisor-mail", { detail: o })); } catch (e) {} }
function sendMail(d, o) {
  var m = { to: $("#mTo").value.trim(), cc: $("#mCc").value.trim(), subject: $("#mSub").value.trim(), body: $("#mBody").value }, er = $("#mErr"), canLive = LIVE && !(HEALTH && HEALTH.email === false);
  er.textContent = "";
  if (!EMRE.test(m.to)) { er.textContent = T("اكتب بريد صحيح للمرسَل إليه (من صفحة الإعلان الرسمية).", "Enter a valid recipient email (from the official notice)."); $("#mTo").focus(); mailDone({ deal: d.id, sent: false, code: "invalid_to" }); return; }
  if (m.cc && !m.cc.split(/[,;\s]+/).filter(Boolean).every(function (x) { return EMRE.test(x); })) { er.textContent = T("بريد النسخة مش صحيح.", "The Cc email is not valid."); $("#mCc").focus(); mailDone({ deal: d.id, sent: false, code: "invalid_cc" }); return; }
  if (!m.subject || !m.body.trim()) { er.textContent = T("الموضوع ونص الرسالة مطلوبين.", "Subject and message are required."); mailDone({ deal: d.id, sent: false, code: m.subject ? "body_required" : "subject_required" }); return; }
  if (/\[[^\]\n]{2,40}\]/.test(m.subject + m.body) && !$("#advMail").dataset.warned) { $("#advMail").dataset.warned = "1"; er.textContent = T("لسه فيه بيانات بين [ ] محتاجة تتكمّل. لو عايز تبعت كده اضغط إرسال تاني.", "Some [placeholders] are still empty. Press send again to send anyway."); mailDone({ deal: d.id, sent: false, code: "placeholders" }); return; }
  if (!m.cc) delete m.cc;
  var after = function () { if (!d.contact_email) patchDeal(d.id, { contact_email: m.to }).catch(function () {}); var go = d.stage === "discover" ? patchDeal(d.id, { stage: "contact" }).then(function () { ev(d.id, "اتنقلت الصفقة تلقائياً لمرحلة التواصل بعد أول رسالة", "Moved to Contact after the first email"); }) : Promise.resolve(); return go.catch(function () {}).then(function () { var sg = $("#advStg"), nd = getDeal(d.id); if (sg && nd) sg.value = nd.stage; return loadThread(getDeal(d.id) || d); }).then(function () { renderReminders(); renderBrief(); renderPipeline(); }); };
  var btn = $("#mSend"); btn.disabled = true;
  if (canLive) {
    api("POST", "/deals/" + encodeURIComponent(d.id) + "/email", m).then(function (j) {
      btn.disabled = false;
      if (j && j.sent) { ev(d.id, "اتبعتت رسالة «" + m.subject + "» إلى " + m.to, "Email “" + m.subject + "” sent to " + m.to); say(T("اتبعتت الرسالة ✓ الرد هيوصلك هنا", "Email sent ✓ The reply will arrive here")); mailDone({ deal: d.id, sent: true, to: m.to }); after(); }
      else { er.textContent = T("الخادم ما قدرش يبعت الرسالة", "The server could not send the email") + (j && j.error ? ": " + j.error : "") + T(". تقدر تبعتها من بريدك:", ". You can send it from your own mail app:"); $("#mLink").innerHTML = '<div class="mlink"><a class="btn btn-gold btn-sm" href="' + esc(mailto(m)) + '">📧 ' + T("افتح في بريدي", "Open in my mail app") + "</a></div>"; mailDone({ deal: d.id, sent: false, stored: true, error: (j && j.error) || "", to: m.to }); }
    }, function (e) { btn.disabled = false; er.textContent = T("تعذّر الاتصال بالخادم: ", "Could not reach the server: ") + e.message; $("#mLink").innerHTML = '<div class="mlink"><a class="btn btn-gold btn-sm" href="' + esc(mailto(m)) + '">📧 ' + T("ابعتها من بريدي بدلاً من كده", "Send from my mail app instead") + "</a></div>"; mailDone({ deal: d.id, sent: false, code: (e && e.code) || (e && e.status ? "http_" + e.status : "offline"), error: (e && e.message) || "", limit: (e && e.limit) || "", to: m.to }); });
    return;
  }
  var msg = { id: "m" + Date.now().toString(36), direction: "out", from: PROF.email || "", to: m.to, cc: m.cc || "", subject: m.subject, body: m.body, at: new Date().toISOString(), demo: true }, a = LG(KM + d.id, []); a.push(msg); LS(KM + d.id, a);
  ev(d.id, "اتجهّزت رسالة «" + m.subject + "» إلى " + m.to + " (من بريدك – من غير اتصال بالخادم)", "Email “" + m.subject + "” to " + m.to + " opened in your mail app (demo)");
  var href = mailto(m);
  $("#mLink").innerHTML = '<div class="mlink"><span>✅ ' + T("اتسجّلت في المحادثة. لو برنامج البريد ما اتفتحش:", "Logged in the thread. If your mail app did not open:") + '</span><a class="btn btn-gold btn-sm" id="mOpen" href="' + esc(href) + '">📧 ' + T("افتح الرسالة في بريدي", "Open the email in my mail app") + "</a></div>";
  btn.disabled = false; say(T("اتسجّلت الرسالة ✓ كمّل الإرسال من بريدك", "Logged ✓ Finish sending from your mail app"));
  try { if (!window.ADVISOR_NO_MAILTO) { var x = document.createElement("a"); x.href = href; x.style.display = "none"; document.body.appendChild(x); x.click(); x.remove(); } } catch (e2) {}
  mailDone({ deal: d.id, sent: false, mailto: true, to: m.to });
  after();
}

/* ---------- settings drawer ---------- */
function openSettings() {
  DR.id = null;
  drawer('<div class="pn-h"><div class="r1"><h2 id="advDrT">⚙️ ' + T("بيانات شركتي", "My company profile") + '</h2><button class="x" type="button" data-close aria-label="' + T("إغلاق", "Close") + '">✕</button></div><p class="hint">' + T("باسم بيستخدم البيانات دي عشان يرتّب الفرص على مقاسك ويملأ الإيميلات. محفوظة على جهازك.", "Bassem uses this to rank opportunities for you and pre-fill emails. Saved on this device.") + "</p></div>"
    + '<div class="pn-b"><form class="card2" id="advSF" novalidate><div class="fgrid2">'
    + '<label class="f2 full">' + T("اسم الشركة", "Company name") + '<input name="company" required maxlength="120" value="' + esc(PROF.demo ? "" : PROF.company) + '" dir="auto"></label>'
    + '<label class="f2">' + T("البريد الإلكتروني", "Email") + '<input name="email" type="email" dir="ltr" maxlength="160" value="' + esc(PROF.email) + '"></label>'
    + '<label class="f2">' + T("الهاتف", "Phone") + '<input name="phone" type="tel" dir="ltr" maxlength="40" value="' + esc(PROF.phone) + '"></label>'
    + '<label class="f2">' + T("الموقع الإلكتروني", "Website") + '<input name="website" dir="ltr" maxlength="160" value="' + esc(PROF.website) + '"></label>'
    + '<label class="f2">' + T("اسم المرسِل", "Sender name") + '<input name="sender_name" dir="auto" maxlength="80" value="' + esc(PROF.sender_name) + '"></label>'
    + '<label class="f2">' + T("وظيفة المرسِل", "Sender title") + '<input name="sender_title" dir="auto" maxlength="80" value="' + esc(PROF.sender_title) + '"></label>'
    + '<label class="f2 full">' + T("منتجاتك (افصل بينها بفاصلة)", "Your products (comma-separated)") + '<textarea name="products" dir="auto" maxlength="600" style="min-height:70px">' + esc(PROF.products) + "</textarea></label>"
    + '<fieldset class="f2 full" style="border:0;padding:0;margin:0"><legend style="font-weight:700;margin-bottom:6px">' + T("قطاعاتك", "Your sectors") + '</legend><div class="sct">' + SECT.map(function (s) { return '<label><input type="checkbox" name="sec" value="' + s[0] + '"' + (PROF.sectors.indexOf(s[0]) > -1 ? " checked" : "") + "> " + esc(T(s[1], s[2])) + "</label>"; }).join("") + "</div></fieldset></div>"
    + '<p id="sErr" role="alert" style="color:#B42318;font-weight:700;font-size:.85rem"></p><div class="acts2"><button class="btn btn-green" type="submit">💾 ' + T("احفظ البيانات", "Save profile") + "</button></div></form></div>");
  $("#advSF").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target, g = function (n) { return f.elements[n].value.trim(); };
    if (!g("company")) { $("#sErr").textContent = T("اكتب اسم الشركة.", "Enter the company name."); f.elements.company.focus(); return; }
    if (g("email") && !EMRE.test(g("email"))) { $("#sErr").textContent = T("البريد مش صحيح.", "The email is not valid."); f.elements.email.focus(); return; }
    var p = { id: PROF.demo ? (fromAccount() || {}).u || PROF.id : PROF.id, company: g("company"), email: g("email"), phone: g("phone"), website: g("website"), sender_name: g("sender_name"), sender_title: g("sender_title"), products: g("products"), sectors: [].slice.call(f.querySelectorAll("input[name=sec]:checked")).map(function (x) { return x.value; }) };
    PROF = p; LS(KP, p); rescore(); closeDr(); renderAll(); say(T("اتحفظت بياناتك ✓ رتّبتلك الفرص من جديد", "Profile saved ✓ Opportunities re-ranked"));
  });
  focusDr();
}

/* ---------- events ---------- */
document.addEventListener("click", function (e) {
  var t = e.target, b;
  if ((b = t.closest("[data-start]"))) { startDeal(b.getAttribute("data-start"), b); return; }
  if ((b = t.closest("[data-how]"))) { openGuide(b.getAttribute("data-how")); return; }
  if ((b = t.closest("[data-open]"))) { openDeal(b.getAttribute("data-open")); return; }
  if ((b = t.closest("[data-set]"))) { openSettings(); return; }
  if ((b = t.closest("[data-close]")) || t.id === "advDr") { closeDr(); return; }
  if ((b = t.closest("[data-dtab]"))) { DR.tab = b.getAttribute("data-dtab"); openDeal(DR.id, DR.tab, false, '#advDr [data-dtab="' + DR.tab + '"]'); return; }
  if ((b = t.closest("[data-tpl]"))) { DR.tpl = b.getAttribute("data-tpl"); openDeal(DR.id, "mail"); return; }
  if ((b = t.closest("[data-focus]"))) { var fe = document.getElementById(b.getAttribute("data-focus")); if (fe) { fe.focus(); fe.scrollIntoView({ block: "center" }); } return; }
  if ((b = t.closest("[data-del]"))) { var id = b.getAttribute("data-del"); if (confirm(T("تحذف الصفقة دي ومراسلاتها من جهازك؟", "Delete this deal and its emails from this device?"))) { delDeal(id); closeDr(); renderAll(); say(T("اتحذفت الصفقة", "Deal deleted")); } return; }
  if ((b = t.closest("[data-tab]"))) { BS.tab = b.getAttribute("data-tab"); BS.n = 12; renderBrief(); return; }
  if ((b = t.closest("[data-only]"))) { var v = b.getAttribute("data-only"); BS.only = BS.only === v ? "" : v; BS.n = 12; if (BS.only) BS.tab = "all"; renderBrief(); return; }
  if ((b = t.closest("[data-go]"))) { var s = document.getElementById(b.getAttribute("data-go")); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.matches("select[data-stage]")) { setStage(t.getAttribute("data-stage"), t.value); return; }
  if (t.matches("[data-ck]") && DR.id) { var l = loc(DR.id), k = t.getAttribute("data-ck"); if (t.checked) l.checks[k] = new Date().toISOString(); else delete l.checks[k]; saveLoc(DR.id, l); var lb = t.closest("label"); if (lb) lb.classList.toggle("done", t.checked); var all = document.querySelectorAll("#advDr [data-ck]"), dn = document.querySelectorAll("#advDr [data-ck]:checked").length, pr = all.length ? Math.round(dn * 100 / all.length) : 0, bar = document.querySelector("#advDr .prg"); if (bar) { bar.setAttribute("aria-valuenow", pr); bar.firstChild.style.width = pr + "%"; var c = bar.parentNode.querySelector("h3 .chip"); if (c) c.textContent = dn + " / " + all.length; } }
});
document.addEventListener("submit", function (e) {
  if (e.target.id !== "advPlan") return; e.preventDefault();
  var f = e.target, g = function (n) { return f.elements[n].value.trim(); }, er = $("#advPE"), id = DR.id, d = getDeal(id);
  if (g("contact_email") && !EMRE.test(g("contact_email"))) { er.textContent = T("بريد جهة الاتصال مش صحيح.", "The contact email is not valid."); f.elements.contact_email.focus(); return; }
  var p = { next_action: g("next_action"), due_date: g("due_date"), value: g("value"), contact_name: g("contact_name"), contact_email: g("contact_email"), notes: f.elements.notes.value };
  var ch = d && (d.next_action || "") !== p.next_action;
  patchDeal(id, p).then(function () { if (ch && p.next_action) ev(id, "الخطوة الجاية: " + p.next_action + (p.due_date ? " (" + p.due_date + ")" : ""), "Next action: " + p.next_action + (p.due_date ? " (" + p.due_date + ")" : "")); else ev(id, "اتحدّثت بيانات الصفقة", "Deal details updated"); say(T("اتحفظ ✓", "Saved ✓")); renderAll(); }, function (e2) { er.textContent = T("تعذّر الحفظ: ", "Could not save: ") + e2.message; });
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#advDr").hidden) closeDr(); });
/* drag & drop between pipeline columns */
document.addEventListener("dragstart", function (e) { var c = e.target.closest && e.target.closest(".dc"); if (!c) return; c.classList.add("drag"); try { e.dataTransfer.setData("text/plain", c.getAttribute("data-id")); e.dataTransfer.effectAllowed = "move"; } catch (x) {} });
document.addEventListener("dragend", function (e) { var c = e.target.closest && e.target.closest(".dc"); if (c) c.classList.remove("drag"); [].forEach.call(document.querySelectorAll(".kc.over"), function (k) { k.classList.remove("over"); }); });
document.addEventListener("dragover", function (e) { var k = e.target.closest && e.target.closest(".kc"); if (!k) return; e.preventDefault(); [].forEach.call(document.querySelectorAll(".kc.over"), function (x) { if (x !== k) x.classList.remove("over"); }); k.classList.add("over"); });
document.addEventListener("drop", function (e) { var k = e.target.closest && e.target.closest(".kc"); if (!k) return; e.preventDefault(); k.classList.remove("over"); var id = ""; try { id = e.dataTransfer.getData("text/plain"); } catch (x) {} if (id) setStage(id, k.getAttribute("data-st")); });

/* ---------- boot ---------- */
$("#advFoot").textContent = T("الفرص منشورة من مصادرها الرسمية (البنك الدولي، بوابة TED الأوروبية، مجالس المناقصات الخليجية، والمناقصات والطلبات المصرية)" + (DATA_ASOF ? " — آخر تحديث " + fD(DATA_ASOF) : "") + ". باسم مستشار آلي: نصايحه إرشادية عامة ولا تغني عن قراءة كراسة الشروط، والمنصة لا تُرسي العقود.", "Opportunities are published from their official sources (World Bank, EU TED, Gulf tender boards, Egyptian tenders and RFQs)" + (DATA_ASOF ? " — last updated " + fD(DATA_ASOF) : "") + ". Bassem is an automated advisor: his tips are general guidance and do not replace the tender documents; the platform does not award contracts.");
renderAll();
/* data/bassem.js loads after this script: the hero's service-period chip is filled in once it exists */
window.addEventListener("load", function () { renderHero(); });
window.addEventListener("bassem:change", function () { renderHero(); });
(function () { var h = null; try { h = sessionStorage.getItem("mig-adv-hello"); sessionStorage.removeItem("mig-adv-hello"); } catch (e) {} if (h) setTimeout(function () { say(EN ? "Welcome " + h + " — you're signed in ✓" : "أهلاً يا " + h + " — اتسجّل دخولك ✓"); }, 400); })();
(LOGIN ? activationLogin(LOGIN[1]).then(null, function () {}) : Promise.resolve()).then(detect).then(function () { return listDeals(); }).then(function (ds) { DEALS = Array.isArray(ds) ? ds : []; }, function (e) { DEALS = []; if (LIVE) say(T("تعذّر تحميل الصفقات من الخادم: ", "Could not load deals from the server: ") + e.message); }).then(function () {
  MODE_READY = true; renderAll(); notifyOnce(false);
  applyWhen(); applyLive();
  var h = /^#deal=(.+)$/.exec(location.hash || ""); if (h) openDeal(decodeURIComponent(h[1]));
  if (LIVE) DEALS.filter(function (d) { return active(d) && d.stage !== "discover"; }).slice(0, 12).forEach(function (d) { listMsgs(d.id).then(function () { renderReminders(); renderBrief(); renderPipeline(); }, function () {}); });
});
''')
