# -*- coding: utf-8 -*-
# SEO workspace («مساحة عمل SEO»): seo-admin.html → /seo-admin/ after the clean-URL build (docs/janna/SEO-SPEC.md §3).
# Admin-only (platform admin or the "seo" role), noindex + kept out of the sitemap (robots.txt also disallows /seo-admin/).
# Arabic first, every UI string bilingual in code: T(ar, en).  ES5 browser JS, no dependencies.
#
# Talks ONLY to the same-origin admin API /api/seo/* (functions/_lib/seo-api.js, Cloudflare Pages Function):
#   GET /health · GET /pages (filters, score, summary) · GET|PUT|DELETE /page · POST /rollback · GET /history
#   GET /export.csv?kind=pages|overrides|redirects · POST /import?kind=overrides|redirects&dry_run=1
#   GET|POST|DELETE /redirects · GET /test?url= · GET|PUT /config · POST /indexnow/key · POST /indexnow · GET /indexnow/log
#   POST /rebuild · GET|PUT /keywords · POST /gsc/import · GET /gsc
# Login: the platform session token (localStorage "mig-tok", e-mail code flow of data/mig-api.js when window.MIGAPI is present);
# without MIGAPI an admin can paste the token (kept in sessionStorage unless «remember me» is ticked).
# 401 → sign-in, 403 → «هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط», 503 → configuration hint.
# When /api/seo is not reachable (static preview, Functions not deployed) the page falls back to a READ-ONLY audit computed in
# the browser from the build manifest /_seo/pages.json (same scoring as the API); every write button is disabled then.
# Honesty: every number comes from the manifest / API; nothing is shown as saved without the server's answer; no rank is
# estimated — real positions and clicks only come from a Search Console CSV (API connection is phase 2, shown «غير متصل»).
# Safe in English mode: Arabic values are edited in <textarea> and wrapped in translate="no", so data/i18n.js never rewrites them.

SWK_CSS = r'''
:root { --swk-ok: #15803D; --swk-ok-bg: #E7F6EC; --swk-warn: #A15C07; --swk-warn-bg: #FFF4E0; --swk-bad: #B42318; --swk-bad-bg: #FDECEE; --swk-info: #1E4FB0; --swk-info-bg: #EEF3FD; }
:root[data-theme="dark"] { --swk-ok: #4ADE80; --swk-ok-bg: #0F2A1A; --swk-warn: #FBBF24; --swk-warn-bg: #2E2208; --swk-bad: #F87171; --swk-bad-bg: #2E1012; --swk-info: #93C5FD; --swk-info-bg: #102035; }
.swk-top { background: linear-gradient(135deg, #8E0B20, #C8102E); color: #fff; }
.swk-top .wrap { display: flex; justify-content: space-between; align-items: center; gap: 12px 18px; flex-wrap: wrap; padding-block: 16px; }
.swk-hd { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 420px; }
.swk-top .crumb { font-size: .8rem; opacity: .85; } .swk-top .crumb a { color: #fff; }
.swk-top h1 { font-size: clamp(1.25rem, 2.8vw, 1.75rem); font-weight: 900; line-height: 1.4; margin: 0; }
.swk-top p { opacity: .92; font-size: .88rem; max-width: 62em; margin: 0; }
.swk-who { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
.swk-who .chip { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.3); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swk-who .btn { background: #fff; color: #8E0B20; border-color: #fff; font-weight: 800; }
.swk-main { padding-block: 12px 70px; }
.swk-st { display: flex; flex-wrap: wrap; gap: 6px 8px; padding-block: 4px 12px; font-size: .8rem; align-items: center; }
.swk-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); border-radius: 99px; padding: 3px 12px; font-weight: 700; max-width: 100%; }
.swk-pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
.swk-pill.ok i { background: #16A34A; } .swk-pill.warn i { background: #D97706; } .swk-pill.bad i { background: #DC2626; }
.swk-pill button { border: 0; background: none; color: var(--green); font: inherit; font-weight: 800; cursor: pointer; padding: 0 2px; }
.swk { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 18px; align-items: start; }
.swk-nav { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 92px); display: flex; flex-direction: column; gap: 3px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 8px; min-width: 0; }
.swk-nav button { text-align: start; border: 0; background: transparent; font: inherit; font-weight: 700; font-size: .9rem; padding: 9px 12px; border-radius: 10px; cursor: pointer; color: var(--fg); display: flex; gap: 8px; align-items: center; }
.swk-nav button:hover { background: var(--sunken); }
.swk-nav button[aria-selected="true"] { background: var(--green-soft); color: var(--green); box-shadow: inset 3px 0 0 var(--green); }
html[dir="rtl"] .swk-nav button[aria-selected="true"] { box-shadow: inset -3px 0 0 var(--green); }
.swk-panel { min-width: 0; display: flex; flex-direction: column; gap: 16px; outline: none; }
.swk-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.swk-card h2 { font-size: 1.12rem; font-weight: 900; margin: 0; } .swk-card h3 { font-size: .98rem; font-weight: 800; margin: 0; }
.swk-card p { margin: 0; }
.swk-h { display: flex; justify-content: space-between; align-items: baseline; gap: 6px 12px; flex-wrap: wrap; }
.swk-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.swk-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.swk-kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.swk-kpi b { font-size: 1.45rem; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.3; }
.swk-kpi span { color: var(--muted); font-size: .8rem; }
.swk-kpi.hl { border-color: var(--green); background: var(--green-soft); }
.swk-msg { border-radius: 12px; padding: 10px 14px; font-size: .88rem; line-height: 1.8; border: 1px solid transparent; }
.swk-msg small { display: block; opacity: .8; font-size: .76rem; overflow-wrap: anywhere; }
.swk-msg.ok { background: var(--swk-ok-bg); color: var(--swk-ok); } .swk-msg.warn { background: var(--swk-warn-bg); color: var(--swk-warn); }
.swk-msg.bad { background: var(--swk-bad-bg); color: var(--swk-bad); } .swk-msg.info { background: var(--swk-info-bg); color: var(--swk-info); }
.swk-note { background: var(--gold-soft); color: var(--fg); border: 1px solid rgba(192,147,0,.35); border-radius: 12px; padding: 10px 14px; font-size: .86rem; line-height: 1.8; }
.swk-tw { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; max-width: 100%; }
.swk-t { width: 100%; border-collapse: collapse; font-size: .84rem; }
.swk-t th { text-align: start; background: var(--sunken); color: var(--muted); font-size: .74rem; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
.swk-t td { padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; }
.swk-t tr.row:hover td { background: var(--green-soft); cursor: pointer; }
.swk-t td.c, .swk-t th.c { width: 34px; text-align: center; }
.swk-t.pages { min-width: 900px; }
.swk-t .sch { font-size: .72rem; color: var(--muted); line-height: 1.5; max-width: 150px; }
.swk-pgb { display: block; width: 100%; border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: inherit; text-align: start; cursor: pointer; overflow-wrap: anywhere; }
.swk-pgb:hover, .swk-pgb:focus-visible { color: var(--green); text-decoration: underline; text-underline-offset: 3px; }
.swk-root code, .swk-ov code { direction: ltr; unicode-bidi: isolate; }
.swk-t code, .swk-code, .swk-li code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .76rem; color: var(--muted); overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.swk-t .pg code { display: block; }
.swk-t small { display: block; color: var(--muted); font-size: .72rem; }
.swk-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.swk-c { display: inline-flex; align-items: center; font-size: .7rem; font-weight: 800; padding: 0 8px; border-radius: 99px; background: var(--sunken); color: var(--muted); white-space: nowrap; line-height: 1.8; }
.swk-c.ov { background: var(--gold-soft); color: var(--gold-deep); } .swk-c.red { background: var(--swk-bad-bg); color: var(--swk-bad); } .swk-c.grn { background: var(--swk-ok-bg); color: var(--swk-ok); }
.swk-c.pub { background: var(--swk-info-bg); color: var(--swk-info); }
.swk-n { font-variant-numeric: tabular-nums; font-weight: 800; }
.swk-n.g, .g > .swk-n { color: var(--swk-ok); } .swk-n.a { color: var(--swk-warn); } .swk-n.r { color: var(--swk-bad); }
.swk-sc { display: inline-grid; place-items: center; min-width: 40px; height: 26px; padding: 0 6px; border-radius: 8px; font-weight: 900; font-size: .82rem; font-variant-numeric: tabular-nums; }
.swk-sc.g { background: var(--swk-ok-bg); color: var(--swk-ok); } .swk-sc.a { background: var(--swk-warn-bg); color: var(--swk-warn); } .swk-sc.r { background: var(--swk-bad-bg); color: var(--swk-bad); }
.swk-sc.n { background: var(--sunken); color: var(--muted); font-size: .7rem; height: auto; padding: 2px 6px; line-height: 1.4; }
.swk-ix { font-size: .74rem; font-weight: 800; color: var(--swk-ok); } .swk-ix.no { color: var(--muted); }
.swk-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.swk-tools > * { min-width: 0; }
.swk-in, .swk-tools select, .swk-tools textarea, .swk-tools input[type=text], .swk-tools input[type=url], .swk-f textarea, .swk-f select, .swk-f input[type=text], .swk-f input[type=url], .swk-f input[type=password] {
  font: inherit; font-size: .9rem; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; min-width: 0; max-width: 100%; }
.swk-tools textarea { resize: none; height: 40px; line-height: 22px; overflow: hidden; white-space: nowrap; flex: 2 1 240px; }
.swk-tools select { flex: 0 1 auto; }
.swk-f textarea { width: 100%; resize: vertical; line-height: 1.7; }
.swk-f input[type=text], .swk-f input[type=url], .swk-f input[type=password], .swk-f select { width: 100%; }
.swk-f textarea.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .78rem; line-height: 1.5; }
.swk-f textarea:focus, .swk-f input:focus, .swk-f select:focus, .swk-tools textarea:focus, .swk-tools select:focus { outline: 2px solid var(--green); outline-offset: 1px; }
.swk-f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.swk-f.bad textarea, .swk-f.bad input, .swk-f.bad select { border-color: var(--swk-bad); }
.swk-lb { font-weight: 800; font-size: .86rem; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.swk-cnt { font-variant-numeric: tabular-nums; font-size: .76rem; font-weight: 800; color: var(--muted); }
.swk-cnt.g { color: var(--swk-ok); } .swk-cnt.a { color: var(--swk-warn); } .swk-cnt.r { color: var(--swk-bad); }
.swk-def { font-size: .75rem; color: var(--muted); display: flex; gap: 2px 10px; flex-wrap: wrap; align-items: baseline; overflow-wrap: anywhere; }
.swk-def b { color: var(--fg); font-weight: 600; }
.swk-hint { font-size: .76rem; color: var(--muted); line-height: 1.7; }
.swk-er { color: var(--swk-bad); font-size: .8rem; font-weight: 700; min-height: 0; overflow-wrap: anywhere; }
.swk-er:empty { display: none; }
.swk-wn { color: var(--swk-warn); background: var(--swk-warn-bg); border-radius: 8px; padding: 4px 10px; font-size: .78rem; font-weight: 700; overflow-wrap: anywhere; }
.swk-wn:empty { display: none; }
/* data/plan.js shows admins a fixed «معاينة الإدارة كـ» plan-preview bar at the bottom of every page; plan gating has no
   meaning on this staff tool and the bar covered the workspace's bottom rows and buttons on phones */
.planpv { display: none !important; }
.swk-lnk { border: 0; background: none; color: var(--green); font: inherit; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 3px; }
.swk-lnk[disabled] { color: var(--muted); cursor: default; text-decoration: none; }
.swk-acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.swk-root .btn { white-space: normal; text-align: center; }
.swk-root .btn[disabled], .swk-ov .btn[disabled] { opacity: .5; cursor: not-allowed; }
.swk-danger { color: var(--swk-bad) !important; border-color: rgba(180,35,24,.35) !important; }
.swk-chk { display: inline-flex; align-items: center; gap: 6px; font-size: .86rem; font-weight: 700; cursor: pointer; }
.swk-chk input { accent-color: var(--green); width: 16px; height: 16px; }
.swk-bars { display: flex; flex-direction: column; gap: 6px; }
.swk-bar { display: grid; grid-template-columns: minmax(120px, 1.1fr) minmax(60px, 2fr) auto; gap: 10px; align-items: center; font-size: .85rem; border: 0; background: none; font: inherit; color: var(--fg); text-align: start; padding: 4px 6px; border-radius: 8px; cursor: pointer; }
.swk-bar:hover { background: var(--sunken); }
.swk-bar .tr { height: 10px; border-radius: 6px; background: var(--sunken); overflow: hidden; } .swk-bar .tr i { display: block; height: 100%; background: linear-gradient(90deg, var(--green), #F0566A); border-radius: 6px; }
html[dir="rtl"] .swk-bar .tr i { margin-inline-start: 0; }
.swk-bar b { font-variant-numeric: tabular-nums; }
.swk-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.swk-li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: var(--surface); color: var(--fg); font: inherit; text-align: start; cursor: pointer; width: 100%; }
.swk-li:hover { border-color: var(--green); background: var(--green-soft); }
.swk-li b { overflow-wrap: anywhere; font-size: .88rem; } .swk-li small { color: var(--muted); font-size: .74rem; overflow-wrap: anywhere; display: block; }
.swk-pager { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; font-size: .84rem; }
.swk-bulk { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: .84rem; }
.swk-bulk:empty { display: none; }
.swk-pre { background: var(--sunken); border-radius: 12px; padding: 12px 14px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .78rem; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; direction: ltr; text-align: left; max-height: 360px; overflow: auto; margin: 0; }
.swk-imp { display: flex; flex-direction: column; gap: 8px; }
.swk-imp-r:empty { display: none; }
.swk-file { position: relative; overflow: hidden; }
.swk-file input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.swk-login { max-width: 640px; }
.swk-tokbox summary { cursor: pointer; font-weight: 800; color: var(--green); }
.swk-tokbox form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.swk-toast { position: fixed; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); inset-inline: 0; margin: 0 auto; width: fit-content; max-width: calc(100% - 32px); background: var(--green-deep); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: .9rem; z-index: 9600; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
.swk-toast.bad { background: #7A1010; }
.swk-load { padding: 6px 2px; }
/* page editor drawer */
.swk-ov { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.5); display: flex; justify-content: flex-end; }
.swk-dr { width: min(1060px, 100%); height: 100%; background: var(--bg); color: var(--fg); display: flex; flex-direction: column; box-shadow: 0 0 40px rgba(0,0,0,.35); outline: none; font-family: var(--font); }
.swk-dr-h { background: var(--surface); border-bottom: 1px solid var(--line); padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; flex: none; }
.swk-dr-tt { display: flex; gap: 8px 12px; align-items: center; flex-wrap: wrap; min-width: 0; }
.swk-dr-tt h2 { font-size: 1.05rem; font-weight: 900; margin: 0; }
.swk-dr-tt code { font-size: .8rem; }
.swk-dr-tt .swk-x { margin-inline-start: auto; }
.swk-x { border: 1px solid var(--line); background: var(--surface); color: var(--fg); width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-size: 1rem; flex: none; }
.swk-dr-msg:empty { display: none; }
.swk-dr-b { overflow-y: auto; padding: 16px; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 16px; align-items: start; flex: 1 1 auto; overscroll-behavior: contain; }
.swk-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.swk-sec { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.swk-sec h3 { font-size: .95rem; font-weight: 900; margin: 0; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.swk-seg { display: inline-flex; background: var(--sunken); border-radius: 10px; padding: 3px; gap: 2px; }
.swk-seg button { border: 0; background: transparent; padding: 4px 12px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 700; font-size: .8rem; color: var(--muted); }
.swk-seg button[aria-pressed="true"] { background: var(--surface); color: var(--green); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.swk-chk-l { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: .82rem; }
.swk-chk-l li { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed var(--line); padding-block: 3px; }
.swk-chk-l li:last-child { border-bottom: 0; }
.swk-ok { color: var(--swk-ok); font-weight: 800; } .swk-no { color: var(--swk-bad); font-weight: 800; } .swk-na { color: var(--muted); font-weight: 700; }
.swk-hist { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.swk-hist li { border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; font-size: .8rem; display: flex; flex-direction: column; gap: 4px; }
.swk-hist .d { color: var(--muted); font-size: .74rem; }
.swk-diff { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.swk-diff li { border: 0; padding: 0; display: block; overflow-wrap: anywhere; }
.swk-diff del { color: var(--swk-bad); text-decoration: line-through; } .swk-diff ins { color: var(--swk-ok); text-decoration: none; font-weight: 700; }
/* Google-like previews (always light, like the real result page) */
.swk-serp { background: #fff; color: #202124; border: 1px solid #dadce0; border-radius: 12px; padding: 14px 16px; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }
.swk-serp .in { max-width: 100%; }
.swk-serp.d .in { width: 600px; } .swk-serp.m { max-width: 372px; } .swk-serp.m .in { width: 328px; }
.swk-serp .site { display: flex; gap: 10px; align-items: center; min-width: 0; }
.swk-serp .fav { width: 28px; height: 28px; border-radius: 50%; background: #f1f3f4; border: 1px solid #e3e3e3; display: grid; place-items: center; overflow: hidden; flex: none; }
.swk-serp .fav img { width: 18px; height: 18px; object-fit: contain; }
.swk-serp .sn { display: block; font-size: 14px; line-height: 20px; color: #202124; }
.swk-serp .su { display: block; font-size: 12px; line-height: 18px; color: #4d5156; direction: ltr; unicode-bidi: plaintext; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.swk-serp .st { font-size: 20px; line-height: 26px; color: #1a0dab; margin: 6px 0 3px; overflow-wrap: anywhere; }
.swk-serp .sd { font-size: 14px; line-height: 22px; color: #4d5156; overflow-wrap: anywhere; }
.swk-serp .sd.em { color: #70757a; font-style: italic; }
.swk-rtl { direction: rtl; text-align: right; } .swk-ltr { direction: ltr; text-align: left; }
.swk-rtl .su { text-align: right; }
.swk-soc { border: 1px solid #dadde1; border-radius: 12px; overflow: hidden; background: #fff; color: #1c1e21; max-width: 520px; font-family: Helvetica, Arial, sans-serif; }
.swk-soc .im { aspect-ratio: 1200 / 630; background: #e4e6eb; display: grid; place-items: center; color: #65676b; font-size: .8rem; overflow: hidden; }
.swk-soc .im img { width: 100%; height: 100%; object-fit: cover; display: block; }
.swk-soc .tx { padding: 10px 12px; background: #f0f2f5; display: flex; flex-direction: column; gap: 2px; }
.swk-soc small { color: #65676b; text-transform: uppercase; font-size: 12px; direction: ltr; }
.swk-soc b { font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
.swk-soc p { margin: 0; color: #65676b; font-size: 14px; line-height: 1.4; max-height: 2.8em; overflow: hidden; }
.swk-label { font-size: .72rem; font-weight: 800; color: var(--muted); }
@media (max-width: 1000px) {
  .swk { grid-template-columns: minmax(0, 1fr); }
  .swk-nav { position: static; flex-direction: row; overflow-x: auto; padding: 6px; gap: 4px; scrollbar-width: thin; }
  .swk-nav button { white-space: nowrap; flex: none; padding: 8px 12px; }
  .swk-nav button[aria-selected="true"], html[dir="rtl"] .swk-nav button[aria-selected="true"] { box-shadow: inset 0 -3px 0 var(--green); }
}
@media (max-width: 900px) {
  .swk-dr-b { grid-template-columns: minmax(0, 1fr); padding: 12px; }
  .swk-dr { width: 100%; }
  .swk-dr-h { padding: 10px 12px; }
}
@media (max-width: 600px) {
  .swk-card { padding: 14px; }
  .swk-kpi b { font-size: 1.2rem; }
  .swk-bar { grid-template-columns: minmax(0, 1fr) 70px auto; }
  .swk-tools textarea { flex-basis: 100%; }
  .swk-tools select { flex: 1 1 140px; }
  .swk-dr-h .btn { padding: 6px 10px; font-size: .8rem; }
}
@media (prefers-reduced-motion: reduce) { .swk-root *, .swk-ov * { transition: none !important; animation: none !important; } }
.swk-staff { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.swk-staff a { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid #E2E8F0; border-radius: 999px; background: #fff; color: #0F172A; font-size: .85rem; font-weight: 600; text-decoration: none; max-width: 100%; }
.swk-staff a:hover, .swk-staff a:focus-visible { border-color: #C8102E; color: #C8102E; }
.swk-staff a span { overflow-wrap: anywhere; }
'''

SWK_BODY = '''
<div class="swk-root" id="swkRoot" translate="no">
<section class="swk-top"><div class="wrap"><div class="swk-hd"><nav class="crumb" id="swkCrumb"><a href="home.html">الرئيسية</a> › <a href="dashboard.html">لوحتي</a> › <span>مساحة عمل SEO</span></nav>
<h1 id="swkH1">مساحة عمل SEO</h1><p id="swkLead">عناوين الصفحات ووصفها وفهرستها، التحويلات، robots وخرائط الموقع، والتحقق في محركات البحث — لفريق المنصة.</p>
<nav class="swk-staff" id="swkStaff" aria-label="أدوات فريق المنصة"><a href="inbox.html" rel="nofollow" id="swkLinkInbox">📥 <span>صندوق الطلبات ومتابعة المطابقة</span></a><a href="/panel.html" rel="nofollow" id="swkLinkPanel">🛠️ <span>لوحة الإدارة (الأعضاء والشركات والباقات والدفع والبريد)</span></a></nav></div>
<div class="swk-who" id="swkWho"></div></div></section>
<main class="wrap swk-main" id="top"><div id="swkApp" aria-live="polite" aria-busy="true"><p class="muted">⏳ جارٍ التحميل…</p></div>
<noscript><p class="muted">مساحة عمل SEO محتاجة JavaScript. The SEO workspace needs JavaScript.</p></noscript></main>
</div>
<script src="data/mig-api.js"></script>
'''

SWK_JS = r'''
(function () {
  if (window.__SWK_INIT) return; window.__SWK_INIT = 1;
  var EN = window.MIGLANG === "en";
  var T = function (ar, en) { return EN ? en : ar; };
  var MA = function () { return window.MIGAPI || null; };
  var BASE = String(window.SEO_API_BASE || "/api/seo").replace(/\/+$/, "");
  var SITE0 = "https://madeinegyptgate.com", TKL = "mig-tok", TKS = "swk-tok";
  var rootEl = document.getElementById("swkRoot"), appEl = document.getElementById("swkApp"), whoEl = document.getElementById("swkWho");
  if (!rootEl || !appEl) return;
  /* a staff tool: Janna's full-screen welcome stage must not cover the workspace (janna.js opens it at most once per tab
     session and skips it once this flag is set; this script runs before janna.js). Her small corner figure stays. */
  try { if (!window.sessionStorage.getItem("janna-stage")) window.sessionStorage.setItem("janna-stage", "1"); } catch (e) {}
  var OVF =["title", "description", "keywords", "h1", "intro", "canonical", "robots", "og_title", "og_description", "og_image", "jsonld"];
  var ROBOTS = ["index,follow", "noindex,follow", "noindex,nofollow", "index,follow,max-image-preview:large"];
  var DEF_TH = { min_hub_members: 5, min_tender_cat: 3, min_company_words: 80, min_company_words_with_products: 40, news_index_min_words: 150, tender_expired_index_days: 90, listing_page_size: 50, slug_mode: "legacy" };
  /* numeric thresholds the build may set in seo/config.json (→ /_seo/config.json); same ranges as functions/_lib/seo-api.js */
  var TH_RANGE = { min_hub_members: [1, 1000], min_tender_cat: [1, 1000], min_tender_entity: [1, 1000], min_gov_items: [1, 1000], min_company_words: [0, 5000],
    min_company_words_with_products: [0, 5000], min_company_products: [0, 1000], min_facx_words: [0, 5000], min_product_words: [0, 5000],
    news_index_min_words: [0, 5000], tender_expired_index_days: [0, 3650], listing_page_size: [10, 500], hub_min_words: [0, 5000], detail_min_words: [0, 5000] };
  var ISSUES = ["title_len", "desc_len", "no_h1", "multi_h1", "no_schema", "noindex", "img_alt", "thin", "overridden"];
  var S = { mode: "boot", preview: "", health: null, cfg: null, summary: null, edge: undefined, tab: "overview", list: null, sel: {}, selN: 0, pgSeq: 0,
    f: { q: "", type: "", lang: "", issue: "", override: false, sort: "", limit: 100, offset: 0 }, kw: null, kwSrc: "", kwP: null, drawer: null, imp: {} };
  var RENDER = {}, ACT = {}, FORM = {};

  /* ---------- helpers ---------- */
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function extend(a, b) { var o = {}, k; for (k in a) if (own(a, k)) o[k] = a[k]; for (k in b) if (own(b, k)) o[k] = b[k]; return o; }
  function nf(n) { n = +n || 0; try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }
  function fd(v, time) {
    if (v == null || v === "") return "—";
    var d = typeof v === "number" ? new Date(v) : new Date(String(v));
    if (isNaN(d.getTime())) return esc(v);
    var o = { year: "numeric", month: "short", day: "numeric" };
    if (time !== false && !/^\d{4}-\d\d-\d\d$/.test(String(v))) { o.hour = "2-digit"; o.minute = "2-digit"; }
    try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", o).format(d); } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function clen(s) { s = String(s == null ? "" : s); var m = s.match(/[\uD800-\uDBFF]/g); return m ? s.length - m.length : s.length; }
  function trunc(s, n) { s = String(s == null ? "" : s); return clen(s) > n ? s.slice(0, n - 1) + "…" : s; }
  function plain(v) { return v == null ? "" : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim(); }
  function store(kind, k, v) { try { var st = kind === "s" ? window.sessionStorage : window.localStorage; if (v === undefined) return st.getItem(k); if (v === null) st.removeItem(k); else st.setItem(k, v); } catch (e) {} return null; }
  function token() { var m = MA(); return (m && m.token && m.token()) || store("s", TKS) || store("l", TKL) || ""; }
  function site() { return String((S.health && S.health.site) || SITE0).replace(/\/+$/, ""); }
  function host() { try { return new URL(site()).host; } catch (e) { return "madeinegyptgate.com"; } }
  function encP(p) { try { return encodeURI(p); } catch (e) { return p; } }
  function absUrl(p) { return site() + encP(p); }
  function normPath(p) {
    var s = String(p == null ? "" : p).trim();
    if (/^https?:\/\//i.test(s)) { try { s = new URL(s).pathname; } catch (e) { return "/"; } }
    var cut = s.search(/[?#]/); if (cut >= 0) s = s.slice(0, cut);
    try { s = decodeURIComponent(s); } catch (e) { /* keep */ }
    if (s.normalize) s = s.normalize("NFC");
    return s.charAt(0) === "/" ? s : "/" + s;
  }
  function normAr(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim();
  }
  function isNoindex(r) { return /noindex/i.test(String(r || "")); }
  /* word thresholds per page type — line-by-line port of minWordsFor / builtThin / isHubType in functions/_lib/seo-score.js:
     spec defaults < what the build used (/_seo/config.json) < the admin's cfg.thresholds */
  function isHubType(t) { return /^hub|^gov$|^tender-(cat|entity)$|^sitemap|list|categor|directory|^(tenders|news-hub|events|awards|projects|rfqs|products|offers)$/i.test(String(t || "")); }
  function thn(v, d) { return v !== "" && v != null && isFinite(+v) ? +v : d; }
  function minWordsFor(type, th) {
    th = th || DEF_TH; var t = String(type || "");
    if (isHubType(t)) return thn(th.hub_min_words, 150);
    if (t === "company") return thn(th.min_company_words, 80);
    if (t === "company-public" || t === "company-verified") return thn(th.min_facx_words, thn(th.min_company_words, 80));
    if (t === "product") return thn(th.min_product_words, 80);
    if (t === "news") return thn(th.news_index_min_words, 150);
    return thn(th.detail_min_words, 80);
  }
  function builtThin(why) { return /^(thin|public_desc_)/i.test(String(why || "")); }
  function pickThresholds(cfg) {
    var out = {}, k, v; cfg = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {};
    for (k in cfg) if (own(cfg, k)) { v = cfg[k]; if (k === "slug_mode" && (v === "legacy" || v === "hash")) out[k] = v; else if (own(TH_RANGE, k) && typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= TH_RANGE[k][0] && v <= TH_RANGE[k][1]) out[k] = v; }
    return out;
  }
  function curTh() { var c = S.cfg || {}; return c.thresholds && typeof c.thresholds === "object" ? extend(DEF_TH, c.thresholds) : extend(DEF_TH, c.thresholds_override || {}); }
  function utf8len(s) { try { return unescape(encodeURIComponent(s)).length; } catch (e) { return String(s).length * 2; } }
  /* preview deployments (<hash>.<project>.pages.dev) share the production SEO data: the API refuses writes there
     (403 preview_read_only) unless SEO_PREVIEW_WRITES = "1" — same host rule as isPreviewHost in seo-api.js */
  function isPreviewHost(h) { h = String(h || "").toLowerCase().replace(/:\d+$/, ""); return /\.pages\.dev$/.test(h) && h.split(".").length > 3; }
  function ro() { return S.mode !== "ready" || S.preview === "ro"; }
  function dis() { return ro() ? " disabled" : ""; }
  function roText() {
    return S.preview === "ro" ? T("نسخة معاينة: الحفظ مقفول هنا لأن المعاينة بتشارك بيانات الـ SEO بتاعة الموقع الأساسي. عدّل من ", "Preview deployment: saving is off here because previews share the main site's SEO data. Edit on ") + "\u200e" + site() + "/seo-admin/\u200e"
      : T("وضع القراءة فقط: الحفظ محتاج واجهة الـ SEO على Cloudflare Pages.", "Read-only mode: saving needs the SEO API on Cloudflare Pages.");
  }
  /* how long until every edge location shows a change: the API's own figure (SEO_TTL + KV cache), else 2 minutes */
  function soonTxt(sec) {
    var s = +sec || ((S.health && +S.health.edge_ttl_s) ? +S.health.edge_ttl_s + 60 : 120), m = Math.max(1, Math.ceil(s / 60));
    return m <= 1 ? T("خلال دقيقة", "within a minute") : m === 2 ? T("خلال دقيقتين على الأكثر", "within two minutes at most") : T("خلال " + m + (m <= 10 ? " دقائق" : " دقيقة") + " على الأكثر", "within " + m + " minutes at most");
  }
  function loadingHtml(t) { return '<p class="muted swk-load">⏳ ' + esc(t || T("جارٍ التحميل…", "Loading…")) + "</p>"; }
  function panelEl() { return document.getElementById("swkPanel"); }
  var toastT = 0;
  function toast(m, bad) {
    var t = document.getElementById("swkToast");
    if (!t) { t = document.createElement("div"); t.id = "swkToast"; t.setAttribute("role", "status"); t.setAttribute("translate", "no"); document.body.appendChild(t); }
    t.className = "swk-toast" + (bad ? " bad" : ""); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 5200);
  }
  function chip(t, cls) { return '<span class="swk-c' + (cls ? " " + cls : "") + '">' + esc(t) + "</span>"; }

  /* ---------- labels ---------- */
  var TYPES = {
    "company": ["مصنع/شركة في الدليل", "Directory company"], "company-public": ["مصدر عام – غير مسجّل", "Public source – not registered"], "company-verified": ["✓ موثّق من فريق المنصة", "✓ Verified by the platform team"],
    "tender": ["مناقصة", "Tender"], "tender-cat": ["فئة مناقصات", "Tender category"], "tender-entity": ["جهة طارحة", "Tendering entity"],
    "hub-sector": ["قطاع", "Sector hub"], "hub-sector-gov": ["قطاع × محافظة", "Sector × governorate"], "hub-dir": ["دليل المصانع", "Directory"],
    "gov": ["محافظة", "Governorate"], "hub-gov": ["فهرس المحافظات", "Governorates hub"], "zone": ["منطقة صناعية", "Industrial zone"],
    "hub-zones": ["فهرس المناطق الصناعية", "Industrial zones hub"], "hub-free-zones": ["المناطق الحرة", "Free zones hub"],
    "product": ["منتج", "Product"], "hub-products": ["فهرس المنتجات", "Products hub"], "project": ["مشروع", "Project"], "hub-projects": ["فهرس المشاريع", "Projects hub"],
    "news": ["خبر", "News item"], "hub-news": ["الأخبار", "News hub"], "event": ["فعالية", "Event"], "hub-events": ["الفعاليات", "Events hub"],
    "award": ["ترسية", "Award"], "hub-awards": ["الترسيات", "Awards hub"], "offer": ["عرض", "Offer"], "hub-offers": ["العروض", "Offers hub"],
    "export": ["سوق تصدير", "Export market"], "hub-export": ["أسواق التصدير", "Export hub"], "rfq": ["طلب عرض سعر", "RFQ"], "hub-rfq": ["طلبات الأسعار", "RFQ hub"],
    "hub-tenders": ["المناقصات", "Tenders hub"], "sitemap-html": ["خريطة الموقع", "HTML sitemap"], "static": ["صفحة ثابتة", "Static page"], "home": ["الرئيسية", "Home"]
  };
  function typeLabel(t) { var x = TYPES[t]; return x ? T(x[0], x[1]) : (t || "—"); }
  var ISS = { title_len: ["طول العنوان", "Title length"], desc_len: ["طول الوصف", "Description length"], no_h1: ["بدون H1", "No H1"], multi_h1: ["أكثر من H1", "More than one H1"],
    no_schema: ["بدون بيانات منظمة", "No structured data"], noindex: ["غير مفهرسة", "Noindex"], img_alt: ["صور بدون نص بديل", "Images without alt"], thin: ["محتوى قليل", "Thin content"], overridden: ["عليها تعديل يدوي", "Overridden"] };
  function issLabel(k) { var x = ISS[k]; return x ? T(x[0], x[1]) : k; }
  var CHECKS = { title_len: ["طول العنوان 30–60 حرف", "Title 30–60 characters"], desc_len: ["طول الوصف 70–160 حرف", "Description 70–160 characters"], one_h1: ["H1 واحد بالظبط", "Exactly one H1"],
    canonical: ["canonical للصفحة نفسها (أو مقصود)", "Self canonical (or intentional)"], robots_sitemap: ["الفهرسة متسقة مع خريطة الموقع", "Robots consistent with the sitemap"],
    schema: ["بيانات منظمة (JSON-LD)", "Structured data (JSON-LD)"], img_alt: ["كل الصور ليها نص بديل", "All images have alt"], words: ["عدد الكلمات ≥ الحد", "Words ≥ threshold"],
    kw_title: ["الكلمة المستهدفة في العنوان", "Target keyword in title"], kw_h1: ["الكلمة المستهدفة في H1", "Target keyword in H1"], hreflang: ["hreflang متبادل", "Reciprocal hreflang"] };
  var KINDS = { override: ["تعديل صفحة", "Page override"], redirect: ["تحويل", "Redirect"], config: ["إعدادات", "Settings"], rollback: ["تراجع", "Rollback"], "import": ["استيراد", "Import"],
    keywords: ["كلمات مفتاحية", "Keywords"], gsc_import: ["استيراد Search Console", "Search Console import"], rebuild: ["إعادة بناء", "Rebuild"] };
  function kindLabel(k) { var x = KINDS[k]; return x ? T(x[0], x[1]) : (k || ""); }
  function pl(n, one, few) { var m = Math.abs(+n || 0) % 100; return m >= 3 && m <= 10 ? few : one; }
  function reasonLabel(w) {
    w = String(w || ""); var m;
    if (!w) return "";
    if ((m = /^thin_desc_(\d+)w$/.exec(w))) return T("وصف قصير: " + m[1] + pl(m[1], " كلمة", " كلمات"), "Short description: " + m[1] + " words");
    if ((m = /^public_desc_(\d+)w(?:<(\d+))?$/.exec(w))) return T("مصدر عام بوصف قصير: " + m[1] + pl(m[1], " كلمة", " كلمات"), "Public source, short description: " + m[1] + " words");
    if ((m = /^desc_(\d+)w$/.exec(w))) return T("الوصف: " + m[1] + pl(m[1], " كلمة", " كلمات"), "Description: " + m[1] + " words");
    if ((m = /^closed_(\d+)d(>\d+)?$/.exec(w))) return T("انتهت منذ " + m[1] + pl(m[1], " يوم", " أيام"), "Closed " + m[1] + " days ago");
    if ((m = /^members_(\d+)$/.exec(w))) return T("عدد المنشآت: " + m[1], "Members: " + m[1]);
    if ((m = /^items_(\d+)$/.exec(w))) return T("عدد العناصر: " + m[1], "Items: " + m[1]);
    var L = { duplicate_description: ["وصف مكرر", "Duplicate description"], no_deadline_incomplete: ["بدون موعد نهائي / بيانات ناقصة", "No deadline / incomplete"], summary_only: ["ملخص فقط (مش نص أصلي)", "Summary only (not original text)"],
      ephemeral_offer: ["عرض مؤقت", "Short-lived offer"], open: ["سارية", "Open"], image: ["فيها صورة", "Has an image"], directory: ["دليل", "Directory"], hub: ["فهرس", "Hub"], hub_daily: ["فهرس يومي", "Daily hub"],
      award_sourced: ["من مصدر موثّق", "Sourced"], project_sourced: ["من مصدر موثّق", "Sourced"], zone_data: ["بيانات المنطقة", "Zone data"], event: ["فعالية", "Event"], market: ["سوق", "Market"],
      rfq_public: ["طلب عام", "Public request"], tenders: ["مناقصات", "Tenders"], html_sitemap: ["خريطة HTML", "HTML sitemap"], static_page: ["صفحة ثابتة", "Static page"], override: ["تعديل يدوي", "Manual override"], build: ["من البناء", "From the build"] };
    return L[w] ? T(L[w][0], L[w][1]) : w;
  }
  function reasonGroup(w) { return String(w || "build").replace(/_\d+w(<\d+)?$/, "").replace(/_\d+d(>\d+)?$/, "").replace(/_\d+$/, ""); }
  var GROUPS = { thin_desc: ["وصف قصير", "Short description"], public_desc: ["مصدر عام بوصف قصير", "Public source, short description"], closed: ["مناقصات منتهية", "Closed tenders"], members: ["منشآت أقل من الحد", "Too few members"], items: ["عناصر أقل من الحد", "Too few items"], desc: ["وصف أقل من الحد", "Description below the threshold"] };
  function groupLabel(g) { return GROUPS[g] ? T(GROUPS[g][0], GROUPS[g][1]) : reasonLabel(g); }
  function lenCls(n, k) { if (k === "t") return n >= 30 && n <= 60 ? "g" : n >= 61 && n <= 65 ? "a" : "r"; return n >= 70 && n <= 160 ? "g" : (n >= 50 && n < 70) || (n > 160 && n <= 170) ? "a" : "r"; }
  function scoreCls(s) { return s >= 80 ? "g" : s >= 50 ? "a" : "r"; }
  function scoreBadge(it) {
    if (it.intentional_noindex) return '<span class="swk-sc n">' + esc(T("غير مفهرسة عمداً", "Noindex on purpose")) + "<br>" + nf(it.score) + "</span>";
    return '<span class="swk-sc ' + scoreCls(it.score) + '">' + nf(it.score) + "</span>";
  }

  /* ---------- score (same rules as functions/_lib/seo-score.js, spec §3.3) ---------- */
  function effective(row, ov) { var o = ov || {}; return { title: o.title || row.title || "", description: o.description || row.description || "", h1: o.h1 || row.h1 || "", canonical: o.canonical || row.canonical || "", robots: o.robots || row.robots || "index,follow" }; }
  function scorePage(row, ctx) {
    ctx = ctx || {};
    var ov = ctx.ov || null, eff = effective(row, ov), st = String(ctx.site || SITE0), noindex = isNoindex(eff.robots), checks = [], got = 0, max = 0;
    function add(id, pts, ok, partial, applies) { if (applies === false) return; var g = ok ? pts : (partial || 0); max += pts; got += g; checks.push({ id: id, pts: pts, got: g }); }
    var tl = clen(eff.title), dl = clen(eff.description);
    add("title_len", 15, tl >= 30 && tl <= 60, tl >= 61 && tl <= 65 ? 8 : 0);
    add("desc_len", 15, dl >= 70 && dl <= 160);
    var h1n = ov && ov.h1 ? Math.max(1, row.h1_count || 0) : (row.h1_count || 0);
    add("one_h1", 10, h1n === 1);
    var cs = String(eff.canonical || ""), base = st.replace(/\/+$/, "");
    var selfCanon = cs.indexOf(base + "/") === 0 && !/[?#]/.test(cs) && normPath(cs.slice(base.length)) === row.path;
    add("canonical", 10, selfCanon || !!(ov && ov.canonical));
    add("robots_sitemap", 10, !(ov && ov.robots) || isNoindex(ov.robots) === isNoindex(row.robots));
    add("schema", 10, (Array.isArray(row.schema) && row.schema.length > 0) || !!(ov && ov.jsonld));
    add("img_alt", 5, !(row.images_no_alt > 0));
    var th = extend(DEF_TH, ctx.thresholds || {});
    var minWords = minWordsFor(row.type, th);
    add("words", 10, (row.words || 0) >= minWords, 0, !noindex);
    var kw = normAr(ctx.target_kw || "");
    add("kw_title", 5, !!kw && normAr(eff.title).indexOf(kw) >= 0, 0, !!kw && !noindex);
    add("kw_h1", 5, !!kw && normAr(eff.h1).indexOf(kw) >= 0, 0, !!kw && !noindex);
    add("hreflang", 5, !row.alt || !!(ctx.twin && normPath(ctx.twin.alt || "") === row.path));
    var issues = [];
    if (tl < 30 || tl > 65) issues.push("title_len");
    if (dl < 70 || dl > 160) issues.push("desc_len");
    if (h1n === 0) issues.push("no_h1");
    if (h1n > 1) issues.push("multi_h1");
    if (!((Array.isArray(row.schema) && row.schema.length) || (ov && ov.jsonld))) issues.push("no_schema");
    if (noindex) issues.push("noindex");
    if (row.images_no_alt > 0) issues.push("img_alt");
    if ((row.words || 0) < minWords || builtThin(row.why)) issues.push("thin");
    if (ov) issues.push("overridden");
    var hit = function (id) { for (var i = 0; i < checks.length; i++) if (checks[i].id === id && checks[i].got > 0) return true; return false; };
    return { score: max ? Math.round((got / max) * 100) : 0, issues: issues, checks: checks, eff: eff, noindex: noindex, intentional_noindex: noindex && !(ov && ov.robots), kw_title: hit("kw_title"), kw_h1: hit("kw_h1"), minWords: minWords };
  }

  /* ---------- read-only mode: the build manifest scored in the browser ---------- */
  var LOCAL = null;
  function pick(r, ks) { for (var i = 0; i < ks.length; i++) { var v = r[ks[i]]; if (v != null && v !== "") return v; } return undefined; }
  function str(v) { return v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : ""; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function normRow(r, keyPath) {
    if (!r || typeof r !== "object") return null;
    var p = pick(r, ["p", "path", "url", "loc"]) || keyPath;
    if (typeof p !== "string" || !p) return null;
    var path = normPath(p), s = pick(r, ["s", "schema", "schema_types"]), h1raw = str(pick(r, ["h1", "h"])), h1n = pick(r, ["h1n", "h1_count"]), multi = h1raw === "MULTI", h1 = multi ? "" : h1raw;
    return { path: path, lang: str(pick(r, ["l", "lang"])) || (/^\/en(\/|$)/.test(path) ? "en" : "ar"), type: str(pick(r, ["t", "type", "kind"])),
      title: str(pick(r, ["ti", "title"])), description: str(pick(r, ["d", "desc", "description"])), h1: h1, h1_count: h1n != null ? num(h1n) : multi ? 2 : h1 ? 1 : 0,
      canonical: str(pick(r, ["c", "canonical"])), robots: str(pick(r, ["r", "robots"])) || "index,follow", words: num(pick(r, ["w", "words"])), images: num(pick(r, ["im", "imgs", "images"])),
      images_no_alt: num(pick(r, ["ina", "imgs_no_alt", "images_no_alt"])), schema: Array.isArray(s) ? s.map(String) : s ? String(s).split(/[\s,|]+/).filter(Boolean) : [],
      alt: str(pick(r, ["a", "alt", "alt_lang_path"])), lastmod: str(pick(r, ["lm", "lastmod"])), cluster: str(pick(r, ["k", "cluster"])), why: str(pick(r, ["why", "index_reason", "reason"])), kw: str(pick(r, ["kw", "target_kw"])) };
  }
  function normalizeManifest(raw) {
    var list = null, i;
    if (Array.isArray(raw)) list = raw.map(function (r) { return normRow(r); });
    else if (raw && typeof raw === "object") {
      var arr = Array.isArray(raw.pages) ? raw.pages : Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.items) ? raw.items : null;
      if (arr) list = arr.map(function (r) { return normRow(r); });
      else { list = []; for (i in raw) if (own(raw, i) && i.charAt(0) === "/") list.push(normRow(raw[i], i)); if (!list.length) list = null; }
    }
    if (!list) return null;
    var seen = {}, rows = [];
    for (i = 0; i < list.length; i++) { var r = list[i]; if (r && !seen[r.path]) { seen[r.path] = 1; rows.push(r); } }
    return rows;
  }
  var DIFF = { l: "L", low: "L", m: "M", medium: "M", h: "H", high: "H" };
  function normKw(raw) {
    var arr = Array.isArray(raw) ? raw : raw && Array.isArray(raw.clusters) ? raw.clusters : raw && Array.isArray(raw.items) ? raw.items : [];
    return arr.map(function (x) {
      if (!x || typeof x !== "object") return null;
      var c = plain(pick(x, ["cluster", "id", "key"]) || ""); if (!/^[A-Za-z0-9_-]{1,40}$/.test(c)) return null;
      var tu = str(pick(x, ["target_url", "url", "target"]) || ""); tu = tu ? (/^https?:\/\//i.test(tu) || tu.charAt(0) === "/" ? normPath(tu) : "") : "";
      var sec = pick(x, ["secondary_kw", "secondary", "secondaries"]);
      return { cluster: c, name: plain(x.name || ""), target_url: tu, target_kw: plain(pick(x, ["target_kw", "keyword", "kw"]) || ""),
        secondary_kw: (Array.isArray(sec) ? sec : sec ? String(sec).split(/[|,،]/) : []).map(plain).filter(Boolean).slice(0, 20), difficulty: DIFF[String(pick(x, ["difficulty", "kd"]) || "").toLowerCase()] || "" };
    }).filter(Boolean);
  }
  function getJson(u) { return fetch(u, { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); }); }
  function loadLocal() {
    var cands = ["/_seo/pages.json", "/seo-manifest.json", "/_seo/seo-manifest.json"], i = 0;
    function next() {
      if (i >= cands.length) return Promise.resolve(null);
      var u = cands[i++];
      return getJson(u).then(function (raw) { var rows = normalizeManifest(raw); return rows ? { rows: rows, src: u, raw: raw } : next(); }, function () { return next(); });
    }
    return next().then(function (m) {
      if (!m) return null;
      return Promise.all([getJson("/_seo/keywords.json").then(null, function () { return null; }), getJson("/_seo/redirects.json").then(null, function () { return null; }), getJson("/_seo/config.json").then(null, function () { return null; })]).then(function (x) {
        var kw = normKw(x[0]), byC = {}, byU = {}, byPath = {}, thB = pickThresholds(x[2]), th = extend(DEF_TH, thB);
        kw.forEach(function (k) { byC[k.cluster] = k; if (k.target_url) byU[k.target_url] = k; });
        m.rows.forEach(function (r) { byPath[r.path] = r; });
        var R = x[1] || {}, redCount = (R.exact ? Object.keys(R.exact).length : 0) + (Array.isArray(R.prefix) ? R.prefix.length : 0);
        var rows = m.rows.map(function (r) {
          var target = r.kw || (byU[r.path] || byC[r.cluster] || {}).target_kw || "";
          var s = scorePage(r, { target_kw: target, twin: r.alt ? byPath[normPath(r.alt)] : null, site: SITE0, thresholds: th });
          return extend(r, { override: null, meta: null, target_kw: target, effective: s.eff, score: s.score, issues: s.issues, kw_title: s.kw_title, kw_h1: s.kw_h1, intentional_noindex: s.intentional_noindex });
        });
        var byT = {}, byL = {}, iss = {}, nr = {}, idx = 0, sum = 0, lm = "";
        rows.forEach(function (r) {
          byT[r.type || "?"] = (byT[r.type || "?"] || 0) + 1; byL[r.lang] = (byL[r.lang] || 0) + 1; sum += r.score; if (r.lastmod > lm) lm = r.lastmod;
          r.issues.forEach(function (k) { iss[k] = (iss[k] || 0) + 1; });
          if (isNoindex(r.effective.robots)) { var w = r.why || "build"; nr[w] = (nr[w] || 0) + 1; } else idx++;
        });
        var summary = { pages: rows.length, by_type: byT, by_lang: byL, indexable: idx, noindex: rows.length - idx, noindex_reasons: nr, overrides: 0, issues: iss, avg_score: rows.length ? Math.round(sum / rows.length) : 0, last_build: lm, bundle_v: 0 };
        var bp = {}; rows.forEach(function (r) { bp[r.path] = r; });
        return { rows: rows, byPath: bp, summary: summary, kw: kw, kwSrc: x[0] ? "build" : "none", redCount: redCount, src: m.src, built: (m.raw && m.raw.built) || "", th: th, thB: thB };
      });
    });
  }
  function filterRows(rows, q) {
    var type = q.get("type") || "", lang = q.get("lang") || "", issue = q.get("issue") || "", text = normAr(q.get("q") || ""), ovOnly = /^(1|true|yes|on)$/i.test(q.get("override") || "");
    var items = rows.filter(function (r) { return (!type || r.type === type) && (!lang || r.lang === lang) && (!issue || r.issues.indexOf(issue) >= 0) && (!ovOnly || r.override) && (!text || normAr(r.path + " " + r.title + " " + r.h1 + " " + r.effective.title).indexOf(text) >= 0); });
    var sort = q.get("sort") || "";
    if (sort === "score") items = items.slice().sort(function (a, b) { return a.score - b.score; });
    else if (sort === "-score") items = items.slice().sort(function (a, b) { return b.score - a.score; });
    else if (sort === "path") items = items.slice().sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
    return items;
  }
  function localCfg() {
    var L = LOCAL || {};
    return { verify: {}, robots_extra: [], robots_blocked_agents: [], indexnow_key: "", indexnow_key_set: false, indexnow_key_url: "", thresholds: L.th || DEF_TH, thresholds_build: L.thB || {}, thresholds_override: {}, can: { verify: false, block_all: false }, site: SITE0, bundle_v: 0 };
  }
  function localApi(method, path) {
    var u = new URL(path, "http://x"), q = u.searchParams, p = u.pathname, L = LOCAL;
    var ok = function (o) { return Promise.resolve(o); };
    if (method !== "GET" || !L) return Promise.reject({ code: "read_only", status: 0, error: "read only" });
    if (p === "/pages") {
      var items = filterRows(L.rows, q), limit = Math.min(500, Math.max(1, parseInt(q.get("limit"), 10) || 100)), off = Math.max(0, parseInt(q.get("offset"), 10) || 0);
      return ok({ total: items.length, offset: off, limit: limit, items: items.slice(off, off + limit), summary: L.summary, issues: ISSUES, bundle_v: 0 });
    }
    if (p === "/page") {
      var pp = normPath(q.get("path") || ""), row = L.byPath[pp] || null;
      return ok({ path: pp, url: absUrl(pp), defaults: row, override: null, meta: null, effective: row ? row.effective : null, score: row ? row.score : null, issues: row ? row.issues : [], history: [], bundle_v: 0 });
    }
    if (p === "/keywords") return ok({ items: L.kw, source: L.kwSrc, at: "" });
    if (p === "/redirects") return ok({ admin: [], build_count: L.redCount, bundle_v: 0 });
    if (p === "/config") return ok(localCfg());
    if (p === "/history" || p === "/overrides" || p === "/indexnow/log") return ok({ items: [] });
    if (p === "/gsc") return ok({ connected: false, source: "none", imported: { pages: null, queries: null }, rows: [] });
    return Promise.reject({ code: "read_only", status: 0, error: "read only" });
  }

  /* ---------- transport: same-origin /api/seo with the platform token ---------- */
  function api(method, path, o) {
    o = o || {};
    if (S.mode === "local") return localApi(method, path, o);
    return new Promise(function (res, rej) {
      if (!window.fetch) { rej({ code: "offline", status: 0, error: "no fetch" }); return; }
      var h = { Accept: o.raw ? "text/csv, application/json" : "application/json" }, tk = token(), body, done = false;
      if (o.json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
      else if (o.text !== undefined) { h["Content-Type"] = "text/csv; charset=utf-8"; body = o.text; }
      if (tk) h.Authorization = "Bearer " + tk;
      var ctl = window.AbortController ? new AbortController() : null;
      var tm = setTimeout(function () { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej({ code: "offline", status: 0, error: "timeout" }); }, o.timeout || 30000);
      fetch(BASE + path, { method: method, headers: h, body: body, credentials: "same-origin", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (o.raw && r.ok && ct.indexOf("json") < 0) {
          var cd = r.headers.get("content-disposition") || "", m = /filename="?([^";]+)"?/i.exec(cd);
          return r.blob().then(function (b) { return { st: r.status, ok: true, j: { blob: b, name: m ? m[1] : "" } }; });
        }
        if (ct.indexOf("json") < 0) throw { code: "offline", status: r.status, error: "HTTP " + r.status };
        return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j || {} }; }, function () { throw { code: "offline", status: r.status, error: "bad json" }; });
      }).then(function (x) {
        if (done) return; done = true; clearTimeout(tm);
        if (x.ok) { res(x.j); return; }
        var e = { code: x.j.code || "http_" + x.st, error: x.j.error || "HTTP " + x.st, status: x.st, field: x.j.field, errors: x.j.errors, j: x.j };
        if (x.st === 401 && S.mode === "ready" && o.auth !== false) setTimeout(function () { showLogin(true); }, 0);
        if (e.code === "preview_read_only" && S.mode === "ready" && S.preview !== "ro" && !o.probe) setTimeout(previewReadOnly, 0);
        rej(e);
      }).catch(function (e) { if (done) return; done = true; clearTimeout(tm); rej(e && e.code ? e : { code: "offline", status: 0, error: String((e && e.message) || e) }); });
    });
  }
  var CFGMSG = {
    kv_off: ["مخزن التعديلات (Workers KV باسم SEO_KV) مش مربوط بمشروع Cloudflare Pages.", "The edit store (Workers KV binding SEO_KV) is not bound to the Cloudflare Pages project."],
    kv_error: ["مخزن التعديلات (KV) مش متاح دلوقتي. جرّب كمان شوية.", "The edit store (KV) is unavailable right now. Try again shortly."],
    auth_off: ["سر الدخول (ADVISOR_SECRET أو AUTH_SECRET) مش متضبوط في مشروع Pages، ولازم يكون نفس قيمة الـ Worker.", "The sign-in secret (ADVISOR_SECRET or AUTH_SECRET) is not set in the Pages project; it must equal the Worker's."],
    auth_backend_off: ["مفيش مصدر لصلاحيات الإدارة: اربط قاعدة D1 (DB) أو خدمة PLATFORM_API أو حدّد SEO_ADMIN_IDS في مشروع Pages.", "No admin-role source: bind the D1 database (DB), a PLATFORM_API service, or set SEO_ADMIN_IDS in the Pages project."],
    auth_store_error: ["مخزن الجلسات مش متاح دلوقتي. جرّب كمان شوية.", "The session store is unavailable right now. Try again shortly."],
    auth_backend_error: ["خدمة الدخول بتاعة المنصة مش متاحة دلوقتي. جرّب كمان شوية.", "The platform sign-in service is unavailable right now. Try again shortly."],
    manifest_unavailable: ["ملف البناء ‎/_seo/pages.json‎ مش منشور لسه. شغّل البناء الجديد (build_static_seo) وانشر الموقع.", "The build manifest /_seo/pages.json is not deployed yet. Run the new build (build_static_seo) and deploy."],
    server: ["حصل خطأ في السيرفر.", "Server error."]
  };
  var FIELDNAMES = { title: ["العنوان", "Title"], description: ["الوصف", "Description"], keywords: ["الكلمات", "Keywords"], h1: ["H1", "H1"], intro: ["المقدمة", "Intro"], canonical: ["canonical", "Canonical"],
    robots: ["robots", "Robots"], og_title: ["عنوان المشاركة", "Social title"], og_description: ["وصف المشاركة", "Social description"], og_image: ["صورة المشاركة", "Social image"], jsonld: ["JSON-LD", "JSON-LD"],
    target_kw: ["الكلمة المستهدفة", "Target keyword"], secondary_kw: ["الكلمات الثانوية", "Secondary keywords"], note: ["الملاحظة", "Note"], path: ["المسار", "Path"], from: ["من", "From"], to: ["إلى", "To"], code: ["الكود", "Code"] };
  /* the API refuses phones / WhatsApp numbers / e-mails in public override text (functions/_lib/seo-privacy.js):
     its message is bilingual «… / …» followed by « — field: «found values»» */
  function isContactErr(x) { return !!x && /لا يُسمح بأرقام الهاتف|not allowed on public pages/i.test(String(x.error || x.msg || "")); }
  function contactVals(s) { var m = /—\s*[\w.]+:\s*(«[\s\S]*»)\s*$/.exec(String(s || "")); return m ? m[1] : ""; }
  function contactMsg(vals) { return T("ممنوع أرقام تليفون أو واتساب أو إيميلات في الصفحات العامة؛ التواصل عن طريق نموذج «اطلب عرض سعر» بس.", "Phone numbers, WhatsApp numbers and e-mail addresses are not allowed on public pages; contact goes through the «Request a quote» form only.") + (vals ? " " + T("اللي لقيناه: ", "Found: ") + vals : ""); }
  function errText(e) {
    if (!e) return T("حصلت مشكلة، جرّب تاني.", "Something went wrong, please try again.");
    if (e.code === "read_only") return T("وضع القراءة فقط: التعديل محتاج اتصال بواجهة الـ SEO على Cloudflare Pages.", "Read-only mode: changes need the SEO API on Cloudflare Pages.");
    if (e.code === "preview_read_only") return T("دي نسخة معاينة: الحفظ مقفول هنا لأن المعاينة بتشارك بيانات الـ SEO بتاعة الموقع الأساسي. عدّل من ", "This is a preview deployment: saving is off here because previews share the main site's SEO data. Edit on ") + "\u200e" + site() + "/seo-admin/\u200e";
    if (e.code === "admin_only") {
      var w = String(e.error || ""), what = /verification/i.test(w) ? T("وسوم التحقق في محركات البحث (الوسم بيدّي صاحبه ملكية الموقع في Search Console)", "search-engine verification tags (a tag makes its holder an owner of the site in Search Console)")
        : /robots/i.test(w) ? T("سطور robots.txt اللي بتمنع الموقع كله عن محرك بحث", "robots.txt lines that block the whole site for a crawler") : "";
      return T("الإجراء ده للمدير بس", "Only an admin can do this") + (what ? T(": تغيير ", ": changing ") + what : "") + (/rollback/i.test(w) ? T(" — والتراجع ده كان هيغيّرها.", " — and this undo would change them.") : ".");
    }
    if (e.code === "no_urls") return T("مفيش جديد يتبعت", "Nothing new to send") + (e.j && e.j.skipped ? T(": " + nf(e.j.skipped) + " صفحة اتبعتت قبل كده بنفس حالتها.", ": " + nf(e.j.skipped) + " pages were already sent in their current state.") : ".");
    if (isContactErr(e)) { var cf = FIELDNAMES[String(e.field || "").replace(/\..*$/, "")]; return (cf ? T("في «" + cf[0] + "»: ", "In «" + cf[1] + "»: ") : "") + contactMsg(contactVals(e.error)); }
    if (e.code === "offline") return T("مفيش اتصال بواجهة الـ SEO (‎/api/seo‎). اتأكد إن الموقع منشور على Cloudflare Pages مع الـ Functions.", "The SEO API (/api/seo) cannot be reached. Make sure the site is deployed on Cloudflare Pages with its Functions.");
    if (e.status === 401) return T("الجلسة انتهت. ادخل تاني.", "Your session ended. Please sign in again.");
    if (e.status === 403 && (e.code === "forbidden" || !e.code)) return T("هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط", "This workspace is for the platform team (admin or SEO role) only");
    if (e.status === 429 || e.code === "rate_limited") return e.code === "daily_limit" ? T("وصلت للحد اليومي لإرسال IndexNow (20 مرة في اليوم). جرّب بكرة.", "The daily IndexNow limit (20 a day) is reached. Try again tomorrow.") : e.code === "too_soon" ? T("إعادة البناء مسموحة مرة كل 10 دقائق.", "A rebuild is allowed once every 10 minutes.") : T("تعديلات كتير في وقت قصير. استنى دقيقة وجرّب تاني.", "Too many changes in a short time. Wait a minute and try again.");
    if (CFGMSG[e.code]) return T(CFGMSG[e.code][0], CFGMSG[e.code][1]);
    if (e.code === "no_key") return T("ولّد مفتاح IndexNow الأول من تبويب «التحقق ومحركات البحث».", "Generate an IndexNow key first in the «Verification & engines» tab.");
    if (e.code === "unknown_path") return T("المسار ده مش صفحة منشورة على الموقع.", "This path is not a published page of the site.") + (e.error ? " (" + e.error + ")" : "");
    if (e.code === "redirect_loop") return T("التحويل ده هيعمل حلقة (loop).", "This redirect would create a loop.");
    if (e.code === "target_gone") return T("الهدف عليه 410 (محذوف).", "The target is marked 410 (gone).");
    if (e.code === "no_previous") return T("مفيش نسخة سابقة للتراجع ليها.", "There is no previous version to roll back to.");
    if (e.code === "bundle_too_large") return T("حجم التعديلات هيعدّي 5 ميجا. امسح تعديلات قديمة أو JSON-LD طويل الأول.", "The edits would exceed 5 MB. Remove old overrides or long JSON-LD first.");
    if (e.field && FIELDNAMES[String(e.field).replace(/\..*$/, "")]) { var fn = FIELDNAMES[String(e.field).replace(/\..*$/, "")]; return T("قيمة غير مقبولة في «" + fn[0] + "»: ", "Invalid value in «" + fn[1] + "»: ") + (e.error || e.code); }
    return T("حصلت مشكلة: ", "Something went wrong: ") + (e.error || e.code || "");
  }
  function errBox(e) { return '<div class="swk-msg bad" role="alert">' + esc(errText(e)) + (e && e.code && e.code !== "offline" && e.code !== "read_only" ? "<small dir=\"ltr\">" + esc(e.code + (e.error && e.error !== e.code ? " — " + e.error : "")) + "</small>" : "") + "</div>"; }
  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name || "export.csv"; a.style.display = "none"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
  }
  function download(path, name, btn) {
    if (btn) btn.disabled = true;
    return api("GET", path, { raw: true }).then(function (r) { saveBlob(r.blob, r.name || name); toast(T("اتنزّل الملف.", "File downloaded.")); }, function (e) { toast(errText(e), true); }).then(function () { if (btn) btn.disabled = false; });
  }
  var PG_HEAD = ["path", "lang", "type", "title", "title_len", "description", "desc_len", "h1", "words", "images", "images_no_alt", "schema", "robots", "canonical", "alt", "lastmod", "cluster", "why", "overridden", "target_kw", "score", "issues"];
  function csvCell(v) { var s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",;\r\n\t]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function rowsCsv(items) {
    var out = [PG_HEAD.map(csvCell).join(",")];
    items.forEach(function (r) { var e = r.effective || {}; out.push([r.path, r.lang, r.type, e.title, clen(e.title), e.description, clen(e.description), e.h1, r.words, r.images, r.images_no_alt, r.schema, e.robots, e.canonical, r.alt, r.lastmod, r.cluster, r.why, r.override ? 1 : 0, r.target_kw, r.score, r.issues].map(csvCell).join(",")); });
    return "﻿" + out.join("\r\n") + "\r\n";
  }
  function day() { return new Date().toISOString().slice(0, 10); }
  function exportPages(qs, name, btn) {
    if (S.mode === "local") { if (LOCAL) saveBlob(new Blob([rowsCsv(filterRows(LOCAL.rows, new URL("/pages" + qs, "http://x").searchParams))], { type: "text/csv;charset=utf-8" }), name); return; }
    download("/export.csv" + (qs ? qs + "&" : "?") + "kind=pages", name, btn);
  }

  /* ---------- boot & sign-in ---------- */
  function setBusy(b) { appEl.setAttribute("aria-busy", b ? "true" : "false"); }
  function paintWho() {
    if (!whoEl) return;
    var h = S.health, html = "";
    if (S.mode === "ready" && h) html = '<span class="chip">👤 <span dir="auto">' + esc((h.me && (h.me.email || h.me.id)) || T("عضو الفريق", "Team member")) + "</span> · " + esc(h.role === "seo" ? T("فريق SEO", "SEO team") : T("مدير", "Admin")) + "</span>" + (S.preview === "ro" ? '<span class="chip">👁️ ' + esc(T("معاينة: قراءة فقط", "Preview: read-only")) + "</span>" : "") + '<button class="btn btn-sm" type="button" data-act="logout">' + esc(T("تسجيل الخروج", "Sign out")) + "</button>";
    else if (S.mode === "local") html = '<span class="chip">👁️ ' + esc(T("وضع القراءة فقط", "Read-only mode")) + "</span>";
    whoEl.innerHTML = html;
  }
  function boot() {
    S.mode = "boot"; S.health = null; S.preview = ""; paintWho(); setBusy(true); closeEditor(true);
    appEl.innerHTML = '<div class="swk-card">' + loadingHtml(T("جارٍ الاتصال بواجهة الـ SEO…", "Connecting to the SEO API…")) + "</div>";
    api("GET", "/health", { timeout: 20000 }).then(function (h) { S.health = h; S.mode = "ready"; start(); }, function (e) {
      if (e.code === "offline") { startLocal(); return; }
      if (e.status === 401) { showLogin(!!token()); return; }
      if (e.status === 403) { showDenied(); return; }
      showConfig(e);
    });
  }
  /* On a preview host, ask the API once whether it takes writes here: an empty PUT /config changes nothing (no-op) and is
     answered 403 preview_read_only before any sign-in check when previews are read-only. Production hosts skip this. */
  function previewProbe() {
    if (!isPreviewHost(location.host)) { S.preview = ""; return Promise.resolve(); }
    return api("PUT", "/config", { json: {}, probe: true, timeout: 15000 }).then(function () { S.preview = "rw"; }, function (e) { S.preview = e && e.code === "preview_read_only" ? "ro" : ""; });
  }
  function previewReadOnly() {
    if (S.mode !== "ready" || S.preview === "ro") return;
    S.preview = "ro"; toast(roText(), true);
    var D = S.drawer;
    if (D && D.ov) { [].forEach.call(D.ov.querySelectorAll('[data-act="save"],[data-act="save-inx"],[data-act="del"],[data-act="h-load"],[data-act="f-reset"],[data-act="ld-fmt"],[data-act="ld-live"]'), function (x) { x.disabled = true; }); [].forEach.call(D.ov.querySelectorAll("[data-fld]"), function (x) { if (x.tagName === "SELECT") x.disabled = true; else x.readOnly = true; }); msg("warn", roText()); }
    var tab = S.tab; renderShell(); go(tab, true);
  }
  function start() {
    paintWho();
    Promise.all([api("GET", "/config").then(null, function () { return null; }), api("GET", "/pages?limit=1").then(null, function (e) { return { err: e }; }), previewProbe()]).then(function (r) {
      if (S.mode !== "ready") return;
      S.cfg = r[0];
      if (r[1] && r[1].summary) S.summary = r[1].summary; else S.sumErr = r[1] && r[1].err;
      paintWho(); renderShell(); edgeCheck();
      var h = parseHash(); go(h.tab || "overview", true); if (h.edit) openEditor(h.edit);
    });
  }
  function startLocal() {
    appEl.innerHTML = '<div class="swk-card">' + loadingHtml(T("واجهة الـ SEO مش متصلة؛ بحمّل تقرير قراءة فقط من ملف البناء…", "The SEO API is not connected; loading a read-only report from the build manifest…")) + "</div>";
    loadLocal().then(function (L) {
      if (!L) { showOffline(); return; }
      LOCAL = L; S.mode = "local";
      S.health = { local: true, site: SITE0, bundle_v: 0, manifest: { src: L.src, rows: L.rows.length }, build_redirects: L.redCount, redirects: 0, overrides: 0 };
      S.summary = L.summary; S.cfg = localCfg();
      paintWho(); renderShell(); edgeCheck();
      var h = parseHash(); go(h.tab || "overview", true); if (h.edit) openEditor(h.edit);
    }, function () { showOffline(); });
  }
  function showOffline() {
    S.mode = "offline"; paintWho(); setBusy(false);
    appEl.innerHTML = '<div class="swk-card"><h2>🔌 ' + esc(T("واجهة الـ SEO مش متصلة", "The SEO API is not connected")) + "</h2><p>" + esc(T("الصفحة دي بتشتغل مع واجهة ‎/api/seo‎ على Cloudflare Pages (Functions + مخزن KV). ولا ملف البناء ‎/_seo/pages.json‎ موجود على الدومين ده كمان، فمفيش حاجة نعرضها حتى للقراءة.", "This page works with the /api/seo API on Cloudflare Pages (Functions + KV store). The build manifest /_seo/pages.json is not on this host either, so there is nothing to show even read-only.")) + '</p><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="retry">↻ ' + esc(T("حاول تاني", "Try again")) + "</button></div></div>";
  }
  function showLogin(expired) {
    S.mode = "login"; S.health = null; paintWho(); setBusy(false); closeEditor(true);
    var m = MA();
    appEl.innerHTML = '<div class="swk-card swk-login"><h2>🔐 ' + esc(T("دخول فريق المنصة", "Platform team sign-in")) + "</h2>"
      + (expired ? '<p class="swk-msg warn">' + esc(T("الجلسة انتهت أو التوكن مش صالح. ادخل تاني.", "Your session ended or the token is not valid. Please sign in again.")) + "</p>" : "")
      + "<p>" + esc(T("المساحة دي للمدير أو لعضو فريق الـ SEO بس. كل تعديل بيتسجل باسمك، وتقدر ترجع فيه بضغطة.", "This workspace is for the admin or an SEO team member only. Every change is logged under your name and can be undone in one click.")) + "</p>"
      + (m && m.open ? '<div class="swk-acts"><button class="btn btn-green" type="button" data-act="login">🔑 ' + esc(T("الدخول بالبريد (كود من 6 أرقام)", "Sign in with e-mail (6-digit code)")) + "</button></div>" : "")
      + '<details class="swk-tokbox"' + (m && m.open ? "" : " open") + "><summary>" + esc(T("الدخول بتوكن المنصة", "Sign in with a platform token")) + "</summary>"
      + '<form data-form="token" novalidate><label class="swk-f"><span class="swk-lb">' + esc(T("التوكن (mig-tok)", "Token (mig-tok)")) + '</span><input type="password" name="tok" autocomplete="off" spellcheck="false" dir="ltr"></label>'
      + '<label class="swk-chk"><input type="checkbox" name="rem"> ' + esc(T("افتكرني على الجهاز ده", "Remember me on this device")) + "</label>"
      + '<p class="swk-er" role="alert"></p><div class="swk-acts"><button class="btn btn-green btn-sm" type="submit">' + esc(T("دخول", "Sign in")) + "</button></div>"
      + '<p class="swk-hint">' + esc(T("التوكن بيتعمل لما تدخل على المنصة بالبريد (بيتحفظ في المتصفح باسم mig-tok). ماتشاركهوش مع حد؛ وبيتلغي لما تعمل تسجيل خروج.", "The token is created when you sign in to the platform by e-mail (stored in the browser as mig-tok). Never share it; it is revoked when you sign out.")) + "</p></form></details></div>";
  }
  function showDenied() {
    S.mode = "denied"; paintWho(); setBusy(false); closeEditor(true);
    var u = MA() && MA().user ? MA().user() : null;
    appEl.innerHTML = '<div class="swk-card swk-login"><h2>⛔ ' + esc(T("هذه المساحة لفريق المنصة (مدير أو دور SEO) فقط", "This workspace is for the platform team (admin or SEO role) only")) + "</h2>"
      + (u && u.email ? '<p>' + esc(T("داخل حالياً بـ: ", "Signed in as: ")) + '<b dir="ltr">' + esc(u.email) + "</b></p>" : "")
      + "<p>" + esc(T("لو انت من فريق المنصة، اطلب من المدير يدّي حسابك دور «seo» أو «admin»، أو ادخل بحساب تاني.", "If you are on the platform team, ask the admin to give your account the «seo» or «admin» role, or sign in with another account.")) + '</p><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="switch">' + esc(T("الدخول بحساب تاني", "Use another account")) + '</button><a class="btn btn-line btn-sm" href="/">' + esc(T("الرئيسية", "Home")) + "</a></div></div>";
  }
  function showConfig(e) {
    S.mode = "config"; paintWho(); setBusy(false);
    appEl.innerHTML = '<div class="swk-card swk-login"><h2>⚙️ ' + esc(T("واجهة الـ SEO محتاجة إعداد", "The SEO API needs configuration")) + "</h2>" + errBox(e)
      + "<p class=\"swk-hint\">" + esc(T("ده إعداد بيعمله المطوّر مرة واحدة في مشروع Cloudflare Pages (ملف wrangler.toml والأسرار). التفاصيل في تقرير الدمج.", "This is a one-time setup a developer does in the Cloudflare Pages project (wrangler.toml and secrets). Details are in the integration notes.")) + '</p><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="retry">↻ ' + esc(T("حاول تاني", "Try again")) + "</button></div></div>";
  }
  FORM.token = function (f) {
    var t = String(f.elements.tok.value || "").trim(), er = f.querySelector(".swk-er");
    if (!/^[A-Za-z0-9._~+\/=-]{20,800}$/.test(t)) { er.textContent = T("ده مش شكل توكن صالح.", "This does not look like a valid token."); return; }
    if (f.elements.rem.checked) { store("l", TKL, t); store("s", TKS, null); } else store("s", TKS, t);
    boot();
  };
  ACT.login = function () { var m = MA(); if (!m || !m.open) return; m.open({ title: T("دخول فريق المنصة", "Platform team sign-in") }).then(function () { if (S.mode === "login" || S.mode === "denied") boot(); }, function () {}); };
  ACT["switch"] = function () { logout(); };
  ACT.retry = function () { boot(); };
  ACT.logout = function () { logout(); };
  function logout() {
    store("s", TKS, null);
    var m = MA(), p = m && m.logout && m.token && m.token() ? m.logout() : Promise.resolve();
    Promise.resolve(p).then(null, function () {}).then(function () { store("l", TKL, null); LOCAL = null; showLogin(false); });
  }

  /* ---------- shell, status, tabs ---------- */
  var TABS = [["overview", "📊", "نظرة عامة", "Overview"], ["pages", "📄", "الصفحات", "Pages"], ["keywords", "🎯", "الكلمات المفتاحية", "Keywords"], ["redirects", "↪️", "التحويلات", "Redirects"],
    ["robots", "🤖", "robots وخرائط الموقع", "robots & sitemaps"], ["verify", "✅", "التحقق ومحركات البحث", "Verification & engines"], ["rank", "📈", "ترتيب البحث", "Search ranking"]];
  function renderShell() {
    setBusy(false);
    appEl.innerHTML = (S.mode === "local" ? '<div class="swk-msg warn" role="note">⚠️ ' + esc(T("واجهة الـ SEO (‎/api/seo‎) مش متصلة على الدومين ده، فده تقرير «قراءة فقط» محسوب في المتصفح من ملف البناء (" + LOCAL.src + "). الحفظ والتحويلات والتحقق وIndexNow محتاجين نشر الموقع على Cloudflare Pages مع الـ Functions.", "The SEO API (/api/seo) is not connected on this host, so this is a read-only report computed in the browser from the build manifest (" + LOCAL.src + "). Saving, redirects, verification and IndexNow need the site deployed on Cloudflare Pages with its Functions.")) + "</div>" : "")
      + (S.mode === "ready" && S.preview === "ro" ? '<div class="swk-msg warn" role="note" id="swkPv">⚠️ ' + esc(T("دي نسخة معاينة (\u200e" + location.host + "\u200e): بتعرض بيانات الـ SEO الحقيقية للقراءة بس، والحفظ والتحويلات والتحقق وIndexNow مقفولين هنا عشان مايتكتبش على الموقع الأساسي من نسخة لسه ما اتراجعتش.", "This is a preview deployment (\u200e" + location.host + "\u200e): it shows the real SEO data read-only; saving, redirects, verification and IndexNow are off here so an unreviewed build never writes to the main site.")) + ' <a href="' + esc(site() + "/seo-admin/") + '" rel="noopener">' + esc(T("افتح مساحة العمل على الموقع الأساسي ↗", "Open the workspace on the main site ↗")) + "</a></div>" : "")
      + (S.mode === "ready" && S.preview === "rw" ? '<div class="swk-msg info" role="note" id="swkPv">ℹ️ ' + esc(T("نسخة معاينة (\u200e" + location.host + "\u200e) والحفظ مفتوح فيها (SEO_PREVIEW_WRITES=1). اتأكد إن المعاينة مربوطة بمخزن SEO منفصل عن الموقع الأساسي.", "Preview deployment (\u200e" + location.host + "\u200e) with saving enabled (SEO_PREVIEW_WRITES=1). Make sure previews are bound to an SEO store separate from the main site.")) + "</div>" : "")
      + '<div class="swk-st" id="swkSt"></div><div class="swk"><nav class="swk-nav" role="tablist" aria-label="' + esc(T("أقسام مساحة عمل SEO", "SEO workspace sections")) + '">'
      + TABS.map(function (t) { return '<button type="button" role="tab" id="swkTab-' + t[0] + '" aria-controls="swkPanel" aria-selected="false" tabindex="-1" data-tab="' + t[0] + '"><span aria-hidden="true">' + t[1] + "</span>" + esc(T(t[2], t[3])) + "</button>"; }).join("")
      + '</nav><section class="swk-panel" id="swkPanel" role="tabpanel" tabindex="-1"></section></div>';
    paintStatus();
  }
  function pill(cls, html) { return '<span class="swk-pill ' + (cls || "") + '"><i></i>' + html + "</span>"; }
  function vtxt(v) { v = +v || 0; return v ? fd(v) : "—"; }
  function paintStatus() {
    var el = document.getElementById("swkSt"); if (!el) return;
    var h = S.health || {}, v = +h.bundle_v || 0, e = S.edge, p = [];
    if (e === undefined) p.push(pill("", esc(T("الطبقة الطرفية: بنفحص…", "Edge layer: checking…"))));
    else if (e === null) p.push(pill(S.mode === "local" ? "warn" : "bad", esc(T("الطبقة الطرفية غير مفعّلة على الدومين ده", "Edge layer not active on this host"))));
    else if (S.mode === "local") p.push(pill("warn", esc(T("الطبقة الطرفية تعمل", "Edge layer live") + (+e ? T(" – نسخة ", " – version ") + vtxt(e) : "") + T("، لكن واجهة الإدارة ‎/api/seo‎ مش متاحة", ", but the admin API /api/seo is unreachable"))));
    else if (+e === v) p.push(pill("ok", esc(v ? T("الطبقة الطرفية تعمل – نسخة ", "Edge layer live – version ") + vtxt(v) : T("الطبقة الطرفية تعمل – مفيش تعديلات منشورة لسه", "Edge layer live – nothing published yet"))));
    else p.push(pill("warn", esc(T("الطبقة الطرفية بتتحدّث (الحافة: ", "Edge layer updating (edge: ") + vtxt(e) + T(" ← آخر نشر: ", " → last publish: ") + vtxt(v) + T("). التعديل بيظهر خلال دقيقة أو دقيقتين.", "). Changes show within a minute or two."))));
    p[0] = p[0].replace("</span>", ' <button type="button" data-act="edge" aria-label="' + esc(T("افحص تاني", "Check again")) + '">↻</button></span>');
    if (h.bundle_at) p.push(pill("", esc(T("آخر نشر: ", "Last publish: ") + fd(h.bundle_at))));
    if (S.summary && S.summary.last_build) p.push(pill("", esc(T("آخر بناء: ", "Last build: ") + fd(S.summary.last_build, false))));
    p.push(h.manifest ? pill("ok", esc(T("ملف البناء: ", "Build manifest: ") + nf(h.manifest.rows) + T(" صفحة", " pages"))) : pill("bad", esc(T("ملف البناء مش منشور", "Build manifest not deployed"))));
    if (S.mode === "ready") p.push(pill(h.deploy_hook ? "ok" : "warn", esc(h.deploy_hook ? T("إعادة البناء: متاحة", "Rebuild: available") : T("إعادة البناء: مش متضبوطة", "Rebuild: not configured"))));
    el.innerHTML = p.join("");
  }
  function edgeCheck() {
    S.edge = undefined; paintStatus();
    var done = function (x) { S.edge = x; paintStatus(); };
    try { fetch("/", { method: "HEAD", cache: "no-store", credentials: "same-origin" }).then(function (r) { done(r.headers.get("X-SEO-Edge")); }, function () { done(null); }); } catch (e) { done(null); }
  }
  ACT.edge = function () { edgeCheck(); };
  function parseHash() { var o = {}; String(location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) { try { o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} } }); return o; }
  function setHash(o) {
    var cur = parseHash(), k;
    for (k in o) if (own(o, k)) { if (o[k] == null || o[k] === "") delete cur[k]; else cur[k] = o[k]; }
    var s = Object.keys(cur).map(function (x) { return x + "=" + encodeURIComponent(cur[x]); }).join("&");
    try { history.replaceState(history.state, "", location.pathname + location.search + (s ? "#" + s : "")); } catch (e) {}
  }
  function go(tab, initial) {
    var okTab = TABS.some(function (t) { return t[0] === tab; }); if (!okTab) tab = "overview";
    S.tab = tab;
    [].forEach.call(appEl.querySelectorAll("[data-tab]"), function (b) { var on = b.getAttribute("data-tab") === tab; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    setHash({ tab: tab });
    var p = panelEl(); if (!p) return;
    p.setAttribute("aria-labelledby", "swkTab-" + tab);
    RENDER[tab](p);
    if (!initial) { try { p.focus({ preventScroll: true }); } catch (e) {} var nb = appEl.querySelector(".swk-nav"); if (nb && window.innerWidth <= 1000) { var r = nb.getBoundingClientRect(); if (r.top < 0) window.scrollBy(0, r.top - 90); } }
  }
  function card(title, inner, extra) { return '<section class="swk-card"' + (extra || "") + ">" + (title ? "<h2>" + title + "</h2>" : "") + inner + "</section>"; }

  /* ---------- tab 1: overview ---------- */
  RENDER.overview = function (p) {
    p.innerHTML = '<div class="swk-card">' + loadingHtml() + "</div>";
    var jobs = [api("GET", "/pages?limit=1"), api("GET", "/pages?sort=score&indexable=1&limit=200").then(null, function () { return { items: [] }; }),
      api("GET", "/pages?type=company&issue=noindex&limit=1").then(null, function () { return null; }), api("GET", "/history?limit=12").then(null, function () { return { items: [] }; })];
    Promise.all(jobs).then(function (r) {
      if (S.tab !== "overview") return;
      var sm = r[0].summary || {}, h = S.health || {}; S.summary = sm; paintStatus();
      var kpi = function (n, l, hl) { return '<div class="swk-kpi' + (hl ? " hl" : "") + '"><b>' + n + "</b><span>" + esc(l) + "</span></div>"; };
      var kpis = '<div class="swk-kpis">' + kpi(nf(sm.pages), T("كل الصفحات في ملف البناء", "Pages in the build manifest"), 1) + kpi(nf(sm.indexable), T("مفهرسة (index)", "Indexable")) + kpi(nf(sm.noindex), T("غير مفهرسة (noindex)", "Noindex"))
        + kpi(nf((sm.by_lang || {}).en || 0), T("صفحات إنجليزي", "English pages")) + kpi(nf(sm.overrides || 0), T("صفحات عليها تعديل يدوي", "Pages with overrides")) + kpi(nf(h.redirects || 0), T("تحويلات الإدارة", "Admin redirects"))
        + kpi(nf(h.build_redirects || 0), T("تحويلات البناء", "Build redirects")) + kpi(nf(sm.avg_score) + "<small style=\"font-size:.8rem;color:var(--muted)\">/100</small>", T("متوسط درجة SEO", "Average SEO score")) + "</div>";
      var iss = sm.issues || {}, isl = ISSUES.filter(function (k) { return iss[k]; }).sort(function (a, b) { return iss[b] - iss[a]; });
      var bars = isl.length ? '<div class="swk-bars">' + isl.map(function (k) { return '<button type="button" class="swk-bar" data-act="issue" data-v="' + k + '"><span>' + esc(issLabel(k)) + '</span><span class="tr"><i style="width:' + Math.max(2, Math.round(100 * iss[k] / Math.max(1, sm.pages))) + '%"></i></span><b>' + nf(iss[k]) + "</b></button>"; }).join("") + "</div>" : '<p class="muted">' + esc(T("مفيش مشاكل مسجّلة.", "No issues recorded.")) + "</p>";
      var nr = sm.noindex_reasons || {}, grp = {}, k;
      for (k in nr) if (own(nr, k)) { var g = reasonGroup(k); grp[g] = (grp[g] || 0) + nr[k]; }
      var gl = Object.keys(grp).sort(function (a, b) { return grp[b] - grp[a]; });
      var reasons = gl.length ? '<div class="swk-tw"><table class="swk-t"><thead><tr><th>' + esc(T("سبب عدم الفهرسة", "Noindex reason")) + "</th><th>" + esc(T("صفحات", "Pages")) + "</th></tr></thead><tbody>" + gl.map(function (g) { return "<tr><td>" + esc(groupLabel(g)) + ' <code>' + esc(g) + '</code></td><td class="swk-n">' + nf(grp[g]) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">' + esc(T("كل الصفحات مفهرسة.", "Every page is indexable.")) + "</p>";
      var bt = sm.by_type || {}, tl = Object.keys(bt).sort(function (a, b) { return bt[b] - bt[a]; });
      var types = '<div class="swk-tw"><table class="swk-t"><thead><tr><th>' + esc(T("النوع", "Type")) + "</th><th>" + esc(T("صفحات", "Pages")) + "</th><th></th></tr></thead><tbody>" + tl.map(function (t) { return "<tr><td>" + esc(typeLabel(t)) + ' <code>' + esc(t) + '</code></td><td class="swk-n">' + nf(bt[t]) + '</td><td><button type="button" class="swk-lnk" data-act="type" data-v="' + esc(t) + '">' + esc(T("اعرض", "Show")) + "</button></td></tr>"; }).join("") + "</tbody></table></div>";
      var weak = (r[1].items || []).filter(function (it) { return !isNoindex((it.effective || {}).robots); }).slice(0, 20);
      var weakHtml = weak.length ? '<ul class="swk-list">' + weak.map(function (it) { return '<li><button type="button" class="swk-li" data-act="edit" data-path="' + esc(it.path) + '">' + scoreBadge(it) + '<span><b dir="auto">' + esc((it.effective || {}).title || it.path) + '</b><small><code>' + esc(it.path) + "</code> · " + esc(it.issues.filter(function (x) { return x !== "overridden"; }).map(issLabel).join("، ")) + '</small></span><span aria-hidden="true">✎</span></button></li>'; }).join("") + "</ul>" : '<p class="muted">' + esc(T("مفيش صفحات مفهرسة ضعيفة في أول 200 نتيجة.", "No weak indexable pages in the first 200 results.")) + "</p>";
      var thinN = r[2] ? r[2].total : null;
      var thin = '<p>' + esc(T("مصانع وشركات في الدليل الصفحة بتاعتها مخفية عن البحث (noindex) لأن وصفها قصير أو مكرر. لما العضو يكمّل الوصف، الصفحة بتتفهرس تلقائياً في البناء الجاي.", "Directory companies whose page is hidden from search (noindex) because the description is short or duplicated. Once the member completes it, the page becomes indexable on the next build.")) + '</p><div class="swk-kpis">' + kpi(thinN == null ? "—" : nf(thinN), T("شركة محتاجة وصف", "Companies needing a description"), 1) + "</div>"
        + '<div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="thin-csv">⬇️ ' + esc(T("تحميل القائمة (CSV)", "Download the list (CSV)")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="thin-list">' + esc(T("اعرضها في الصفحات", "Show them in Pages")) + '</button></div><p class="swk-hint">' + esc(T("الملف فيه المسار واللغة والعنوان وسبب عدم الفهرسة وعدد الكلمات بس — من غير الوصف ولا أي بيانات تواصل. التواصل مع الأعضاء بيتم من لوحة الإدارة.", "The file holds the path, language, title, noindex reason and word count only — no description and no contact data. Members are contacted from the admin console.")) + "</p>";
      var hist = (r[3].items || []);
      var histHtml = hist.length ? '<ul class="swk-list">' + hist.map(function (x) { var pg = x.ref && x.ref.charAt(0) === "/"; return "<li>" + (pg ? '<button type="button" class="swk-li" data-act="edit" data-path="' + esc(x.ref) + '">' : '<div class="swk-li" style="cursor:default">') + chip(kindLabel(x.kind) + (x.via === "import" ? " · " + T("استيراد", "import") : "")) + '<span><b dir="auto">' + esc(x.ref || "") + "</b><small>" + esc(fd(x.at)) + " · " + esc(x.by_email || x.by || "") + "</small></span>" + (pg ? '<span aria-hidden="true">✎</span></button>' : "<span></span></div>") + "</li>"; }).join("") + "</ul>" : '<p class="muted">' + esc(T("مفيش تغييرات لسه.", "No changes yet.")) + "</p>";
      var pub = '<div class="swk-tw"><table class="swk-t"><tbody>'
        + "<tr><th>" + esc(T("نسخة التعديلات المنشورة", "Published bundle version")) + '</th><td><code>' + esc(String(h.bundle_v || 0)) + "</code> " + esc(h.bundle_at ? "(" + fd(h.bundle_at) + ")" : "") + "</td></tr>"
        + "<tr><th>" + esc(T("حجم التعديلات", "Bundle size")) + '</th><td class="swk-n">' + nf(Math.round((h.bundle_bytes || 0) / 102.4) / 10) + " KB / 5,120 KB</td></tr>"
        + "<tr><th>" + esc(T("آخر بناء للموقع", "Last site build")) + "</th><td>" + esc(fd(sm.last_build, false)) + "</td></tr></tbody></table></div>"
        + '<div class="swk-acts"><button class="btn btn-line btn-sm swk-danger" type="button" data-act="rollback"' + dis() + ">↶ " + esc(T("تراجع عن آخر نشر", "Undo the last publish")) + "</button></div>"
        + '<p class="swk-hint">' + esc(T("التراجع بيرجّع النسخة اللي قبل آخر حفظ (تعديلات الصفحات والتحويلات والإعدادات مع بعض). لو ضغطت مرتين بيرجع تاني للنسخة الأحدث.", "Undo restores the version before the last save (page edits, redirects and settings together). Pressing it twice restores the newer version again.")) + "</p>";
      p.innerHTML = kpis + '<div class="swk-grid2">' + card(esc(T("أهم المشاكل", "Top issues")), '<p class="swk-hint">' + esc(T("اضغط على أي مشكلة عشان تشوف صفحاتها.", "Click an issue to list its pages.")) + "</p>" + bars)
        + card(esc(T("ليه بعض الصفحات مش مفهرسة؟", "Why some pages are noindex")), '<p class="swk-hint">' + esc(T("قرارات البناء من بيانات حقيقية (مش أخطاء): صفحات رقيقة أو منتهية أو مؤقتة بتفضل متاحة للزوار من غير ما تدخل نتائج البحث.", "Build decisions from real data (not errors): thin, expired or short-lived pages stay available to visitors without entering search results.")) + "</p>" + reasons) + "</div>"
        + card(esc(T("أضعف 20 صفحة مفهرسة", "Weakest 20 indexable pages")), weakHtml + '<div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="weak-all">' + esc(T("كل الصفحات مرتبة بالدرجة", "All pages sorted by score")) + "</button></div>")
        + '<div class="swk-grid2">' + card(esc(T("شركات محتاجة وصف", "Companies waiting for a description")), thin) + card(esc(T("النشر والتراجع", "Publishing & undo")), pub) + "</div>"
        + '<div class="swk-grid2">' + card(esc(T("الصفحات حسب النوع", "Pages by type")), types) + card(esc(T("آخر التغييرات", "Latest changes")), histHtml) + "</div>";
    }, function (e) { if (S.tab === "overview") p.innerHTML = card("", errBox(e)); });
  };
  ACT.issue = function (b) { S.f = extend(S.f, { issue: b.getAttribute("data-v"), type: "", offset: 0, q: "", override: false, lang: "", sort: "" }); go("pages"); };
  ACT.type = function (b) { S.f = extend(S.f, { type: b.getAttribute("data-v"), issue: "", offset: 0, q: "", override: false, lang: "", sort: "" }); go("pages"); };
  ACT["weak-all"] = function () { S.f = extend(S.f, { sort: "score", issue: "", type: "", offset: 0, q: "", override: false, lang: "" }); go("pages"); };
  ACT["thin-list"] = function () { S.f = extend(S.f, { type: "company", issue: "noindex", offset: 0, q: "", override: false, lang: "", sort: "" }); go("pages"); };
  /* every row of a /pages query (≤ 500 per call), in API and read-only mode alike */
  function collectRows(qs) {
    var all = [];
    function next(off) { return api("GET", "/pages" + qs + (qs ? "&" : "?") + "limit=500&offset=" + off).then(function (j) { var it = j.items || []; all = all.concat(it); return it.length && all.length < (+j.total || 0) && off < 50000 ? next(off + 500) : all; }); }
    return next(0);
  }
  /* built here (not the API's full pages export) so the file carries exactly the columns the hint promises */
  ACT["thin-csv"] = function (b) {
    b.disabled = true;
    collectRows("?type=company&issue=noindex").then(function (items) {
      var out = [["path", "lang", "title", "noindex_reason", "reason", "words"].map(csvCell).join(",")];
      items.forEach(function (r) { out.push([r.path, r.lang, (r.effective || {}).title || r.title, r.why || "", reasonLabel(r.why), r.words].map(csvCell).join(",")); });
      saveBlob(new Blob(["﻿" + out.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }), "companies-needing-description-" + day() + ".csv");
      toast(T("اتنزّل الملف: ", "File downloaded: ") + nf(items.length) + T(" شركة.", " companies."));
    }, function (e) { toast(errText(e), true); }).then(function () { b.disabled = false; });
  };
  ACT.rollback = function (b) {
    if (ro()) return;
    if (!window.confirm(T("التراجع هيرجّع كل التعديلات المنشورة للنسخة اللي قبل آخر حفظ. متأكد؟", "Undo restores all published edits to the version before the last save. Are you sure?"))) return;
    b.disabled = true;
    api("POST", "/rollback", { json: {} }).then(function (j) {
      if (!j || j.ok !== true) throw { code: "bad_response", error: "no ok" };
      S.health.bundle_v = j.bundle_v; S.health.bundle_at = new Date().toISOString(); paintStatus();
      toast(T("اتعمل التراجع. النسخة المنشورة دلوقتي: ", "Undone. The published version is now: ") + vtxt(j.bundle_v)); refreshHealth(); setTimeout(edgeCheck, 4000); go("overview", true);
    }, function (e) { b.disabled = false; toast(errText(e), true); });
  };
  function refreshHealth() { if (S.mode !== "ready") return; api("GET", "/health").then(function (h) { S.health = h; paintStatus(); paintWho(); }, function () {}); }

  /* ---------- tab 2: pages ---------- */
  RENDER.pages = function (p) {
    var f = S.f, sm = S.summary || {}, bt = sm.by_type || {}, iss = sm.issues || {};
    var types = Object.keys(bt).sort(function (a, b) { return bt[b] - bt[a]; });
    if (f.type && types.indexOf(f.type) < 0) types.push(f.type);
    var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; };
    p.innerHTML = '<section class="swk-card"><div class="swk-h"><h2>' + esc(T("الصفحات", "Pages")) + '</h2><span class="muted" id="swkPgTot"></span></div>'
      + '<form class="swk-tools" data-form="pages" role="search">'
      + '<textarea name="q" rows="1" role="searchbox" aria-label="' + esc(T("بحث في المسار أو العنوان", "Search path or title")) + '" placeholder="' + esc(T("دوّر في المسار أو العنوان أو H1…", "Search path, title or H1…")) + '"></textarea>'
      + '<select name="type" aria-label="' + esc(T("النوع", "Type")) + '">' + opt("", T("كل الأنواع", "All types"), f.type) + types.map(function (t) { return opt(t, typeLabel(t) + (bt[t] ? " (" + nf(bt[t]) + ")" : ""), f.type); }).join("") + "</select>"
      + '<select name="lang" aria-label="' + esc(T("اللغة", "Language")) + '">' + opt("", T("كل اللغات", "All languages"), f.lang) + opt("ar", T("عربي", "Arabic"), f.lang) + opt("en", T("إنجليزي", "English"), f.lang) + "</select>"
      + '<select name="issue" aria-label="' + esc(T("المشكلة", "Issue")) + '">' + opt("", T("كل الحالات", "Any issue"), f.issue) + ISSUES.map(function (k) { return opt(k, issLabel(k) + (iss[k] ? " (" + nf(iss[k]) + ")" : ""), f.issue); }).join("") + "</select>"
      + '<select name="sort" aria-label="' + esc(T("الترتيب", "Sort")) + '">' + opt("", T("ترتيب البناء", "Build order"), f.sort) + opt("score", T("الأضعف أولاً", "Weakest first"), f.sort) + opt("-score", T("الأقوى أولاً", "Strongest first"), f.sort) + opt("path", T("حسب المسار", "By path"), f.sort) + "</select>"
      + '<label class="swk-chk"><input type="checkbox" name="override"' + (f.override ? " checked" : "") + "> " + esc(T("المعدّلة بس", "Overridden only")) + "</label>"
      + '<button class="btn btn-green btn-sm" type="submit">' + esc(T("بحث", "Search")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="pg-reset">' + esc(T("مسح الفلاتر", "Clear filters")) + "</button></form>"
      + '<div class="swk-bulk" id="swkBulk"></div><div id="swkPgRes"></div><div class="swk-pager" id="swkPager"></div></section>'
      + card(esc(T("التعديلات اليدوية (CSV)", "Manual overrides (CSV)")), '<p class="swk-hint">' + esc(T("صدّر كل التعديلات في ملف Excel/CSV، عدّل فيه، وارجع استورده. الاستيراد بيتجرب الأول (من غير ما يغيّر حاجة) ويوريك الفرق قبل التطبيق. صف فاضي لصفحة = حذف تعديلها.", "Export every override to an Excel/CSV file, edit it, then import it back. An import is always tried first (nothing changes) and shows the difference before you apply it. An empty row for a page deletes its override.")) + "</p>"
        + '<div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="ov-csv"' + dis() + ">⬇️ " + esc(T("تصدير التعديلات", "Export overrides")) + "</button>" + importBtn("overrides") + '</div><div class="swk-imp-r" id="swkImp-overrides" aria-live="polite"></div>');
    p.querySelector('textarea[name="q"]').value = f.q;
    paintBulk(); loadPages();
  };
  function importBtn(kind) { return '<label class="btn btn-line btn-sm swk-file' + (ro() ? '" aria-disabled="true' : "") + '">📥 ' + esc(T("استيراد CSV (تجربة أولاً)", "Import CSV (dry run first)")) + '<input type="file" accept=".csv,text/csv" data-imp="' + kind + '"' + dis() + "></label>"; }
  function qsOf(f, withPage) {
    var a = [];
    if (f.q) a.push("q=" + encodeURIComponent(f.q)); if (f.type) a.push("type=" + encodeURIComponent(f.type)); if (f.lang) a.push("lang=" + f.lang);
    if (f.issue) a.push("issue=" + f.issue); if (f.override) a.push("override=1"); if (f.sort) a.push("sort=" + encodeURIComponent(f.sort));
    if (withPage) { a.push("limit=" + f.limit); a.push("offset=" + f.offset); }
    return a.length ? "?" + a.join("&") : "";
  }
  function loadPages() {
    var res = document.getElementById("swkPgRes"); if (!res) return;
    res.innerHTML = loadingHtml(); var my = ++S.pgSeq;
    api("GET", "/pages" + qsOf(S.f, true)).then(function (j) { if (my !== S.pgSeq || S.tab !== "pages") return; S.list = j; if (j.summary) S.summary = j.summary; paintPages(); }, function (e) { if (my !== S.pgSeq) return; res.innerHTML = errBox(e); var pg = document.getElementById("swkPager"); if (pg) pg.innerHTML = ""; });
  }
  function kwCell(it) {
    if (!it.target_kw) return '<span class="swk-na">—</span>';
    if (it.intentional_noindex) return '<span class="swk-na" dir="auto">' + esc(trunc(it.target_kw, 28)) + "</span>";
    var a = it.kw_title ? '<span class="swk-ok">✓</span>' : '<span class="swk-no">✗</span>', b = it.kw_h1 ? '<span class="swk-ok">✓</span>' : '<span class="swk-no">✗</span>';
    return '<small dir="auto">' + esc(trunc(it.target_kw, 28)) + "</small>" + esc(T("عنوان ", "title ")) + a + " · H1 " + b;
  }
  function rowHtml(it) {
    var e = it.effective || {}, tl = clen(e.title), dl = clen(e.description), h1n = it.h1_count != null ? +it.h1_count : (e.h1 ? 1 : 0), noidx = isNoindex(e.robots), sel = !!S.sel[it.path];
    if (it.override && it.override.h1) h1n = Math.max(1, h1n);
    return '<tr class="row" data-path="' + esc(it.path) + '"><td class="c"><input type="checkbox" data-selp="' + esc(it.path) + '" aria-label="' + esc(T("تحديد ", "Select ") + it.path) + '"' + (sel ? " checked" : "") + "></td><td>" + scoreBadge(it) + "</td>"
      + '<td class="pg"><button type="button" class="swk-pgb" data-act="edit" data-path="' + esc(it.path) + '" dir="auto">' + esc(e.title || "—") + "</button><code>" + esc(it.path) + '</code><span class="swk-chips">' + chip(typeLabel(it.type), it.type === "company-public" ? "pub" : "") + chip(it.lang === "en" ? "EN" : "AR") + (it.override ? chip(T("معدّلة", "Overridden"), "ov") : "") + "</span></td>"
      + '<td><span class="swk-n ' + lenCls(tl, "t") + '">' + tl + '</span></td><td><span class="swk-n ' + lenCls(dl, "d") + '">' + dl + "</span></td>"
      + '<td><span class="swk-n ' + (h1n === 1 ? "g" : "r") + '">' + (h1n > 1 ? "n" : h1n) + '</span></td><td class="swk-n">' + nf(it.words) + "</td>"
      + '<td><span class="swk-n ' + (it.images_no_alt > 0 ? "r" : "g") + '">' + nf(it.images_no_alt) + "</span><small>/" + nf(it.images) + '</small></td><td class="sch">' + (it.schema && it.schema.length ? esc(it.schema.join(" · ")) : '<span class="swk-no">—</span>') + "</td>"
      + "<td>" + (noidx ? '<span class="swk-ix no">noindex</span><small>' + esc(reasonLabel(it.override && it.override.robots ? "override" : it.why)) + "</small>" : '<span class="swk-ix">' + esc(T("مفهرسة", "Indexable")) + "</span>" + (it.why ? "<small>" + esc(reasonLabel(it.why)) + "</small>" : "")) + "</td>"
      + "<td>" + kwCell(it) + "</td></tr>";
  }
  function paintPages() {
    var j = S.list, res = document.getElementById("swkPgRes"), f = S.f; if (!res || !j) return;
    var items = j.items || [], tot = document.getElementById("swkPgTot");
    if (tot) tot.textContent = T("النتائج: ", "Results: ") + nf(j.total) + T(" من ", " of ") + nf((S.summary || {}).pages || j.total) + T(" صفحة", " pages");
    var allSel = items.length && items.every(function (it) { return S.sel[it.path]; });
    res.innerHTML = items.length ? '<div class="swk-tw"><table class="swk-t pages"><thead><tr><th class="c"><input type="checkbox" data-selall aria-label="' + esc(T("تحديد كل الصفحات المعروضة", "Select every page shown")) + '"' + (allSel ? " checked" : "") + "></th>"
      + "<th>" + esc(T("الدرجة", "Score")) + "</th><th>" + esc(T("الصفحة (العنوان · المسار · النوع · اللغة)", "Page (title · path · type · language)")) + "</th><th>" + esc(T("العنوان", "Title")) + "</th><th>" + esc(T("الوصف", "Desc.")) + "</th><th>H1</th><th>" + esc(T("كلمات", "Words")) + "</th><th>" + esc(T("صور بلا alt", "No alt")) + "</th><th>Schema</th><th>" + esc(T("الفهرسة", "Index")) + "</th><th>" + esc(T("الكلمة المستهدفة", "Target keyword")) + "</th></tr></thead><tbody>"
      + items.map(rowHtml).join("") + "</tbody></table></div>" : '<p class="swk-msg info">' + esc(T("مفيش صفحات مطابقة للفلاتر دي.", "No pages match these filters.")) + "</p>";
    var a = j.total ? f.offset + 1 : 0, b = Math.min(j.total, f.offset + items.length);
    document.getElementById("swkPager").innerHTML = '<span class="muted">' + esc(T("عرض ", "Showing ") + nf(a) + "–" + nf(b) + T(" من ", " of ") + nf(j.total)) + '</span><span class="swk-acts">'
      + '<label class="swk-chk">' + esc(T("في الصفحة: ", "Per page: ")) + '<select data-psize aria-label="' + esc(T("عدد الصفوف", "Rows per page")) + '">' + [50, 100, 250, 500].map(function (n) { return '<option value="' + n + '"' + (n === f.limit ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>"
      + '<button class="btn btn-line btn-sm" type="button" data-act="pg-prev"' + (f.offset > 0 ? "" : " disabled") + ">" + esc(T("‹ السابق", "‹ Previous")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="pg-next"' + (f.offset + items.length < j.total ? "" : " disabled") + ">" + esc(T("التالي ›", "Next ›")) + "</button></span>";
    paintBulk();
  }
  function paintBulk() {
    var el = document.getElementById("swkBulk"); if (!el) return;
    var n = Object.keys(S.sel).length;
    el.innerHTML = '<button class="btn btn-line btn-sm" type="button" data-act="all-csv">⬇️ ' + esc(T("تصدير كل النتائج (CSV)", "Export all results (CSV)")) + "</button>"
      + (n ? '<span class="swk-c ov">' + esc(nf(n) + T(" صفحة محددة", " selected")) + '</span><button class="btn btn-line btn-sm" type="button" data-act="sel-csv">⬇️ ' + esc(T("تصدير المحدد", "Export selected")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="sel-inx"' + dis() + ">📣 " + esc(T("إبلاغ IndexNow بالمحدد", "Send selected to IndexNow")) + '</button><button class="swk-lnk" type="button" data-act="sel-clear">' + esc(T("إلغاء التحديد", "Clear selection")) + "</button>" : "");
  }
  FORM.pages = function (f) {
    S.f = extend(S.f, { q: plain(f.elements.q.value), type: f.elements.type.value, lang: f.elements.lang.value, issue: f.elements.issue.value, sort: f.elements.sort.value, override: !!f.elements.override.checked, offset: 0 });
    loadPages();
  };
  ACT["pg-reset"] = function () { S.f = extend(S.f, { q: "", type: "", lang: "", issue: "", sort: "", override: false, offset: 0 }); RENDER.pages(panelEl()); };
  ACT["pg-prev"] = function () { S.f.offset = Math.max(0, S.f.offset - S.f.limit); loadPages(); scrollToCard(); };
  ACT["pg-next"] = function () { S.f.offset += S.f.limit; loadPages(); scrollToCard(); };
  function scrollToCard() { var c = document.getElementById("swkPgRes"); if (c) { var r = c.getBoundingClientRect(); if (r.top < 0) window.scrollBy(0, r.top - 160); } }
  ACT["sel-clear"] = function () { S.sel = {}; paintPages(); };
  ACT["sel-csv"] = function () { var items = Object.keys(S.sel).map(function (k) { return S.sel[k]; }); saveBlob(new Blob([rowsCsv(items)], { type: "text/csv;charset=utf-8" }), "seo-pages-selected-" + day() + ".csv"); };
  ACT["all-csv"] = function (b) { exportPages(qsOf(S.f, false), "seo-pages-" + day() + ".csv", b); };
  ACT["ov-csv"] = function (b) { download("/export.csv?kind=overrides", "seo-overrides-" + day() + ".csv", b); };
  ACT["sel-inx"] = function (b) {
    var urls = Object.keys(S.sel).filter(function (k) { return !isNoindex((S.sel[k].effective || {}).robots); }).map(absUrl);
    if (!urls.length) { toast(T("كل الصفحات المحددة noindex؛ مفيش حاجة تتبعت.", "Every selected page is noindex; nothing to send."), true); return; }
    if (!window.confirm(T("هنبعت " + urls.length + " رابط لـ IndexNow (Bing وYandex وغيرهم). متأكد؟", "Send " + urls.length + " URLs to IndexNow (Bing, Yandex and others)?"))) return;
    sendIndexNow({ urls: urls }, b);
  };
  function sendIndexNow(body, btn, after) {
    if (btn) btn.disabled = true;
    api("POST", "/indexnow", { json: body }).then(function (j) {
      toast(j.ok ? T("اتبعت لـ IndexNow: ", "Sent to IndexNow: ") + nf(j.sent) + T(" رابط", " URLs") + (j.truncated ? T(" (أول 10,000)", " (first 10,000)") : "") + (j.skipped ? T(" · اتخطّينا " + nf(j.skipped) + " صفحة اتبعتت قبل كده بنفس حالتها", " · skipped " + nf(j.skipped) + " pages already sent in their current state") : "") : T("IndexNow رد: ", "IndexNow answered: ") + (j.status || "") + " " + (j.message || ""), !j.ok);
      if (after) after(j);
    }, function (e) { toast(errText(e), true); if (after) after(null, e); }).then(function () { if (btn) btn.disabled = false; });
  }

  /* ---------- CSV import (overrides / redirects), always dry run first ---------- */
  function importFile(input) {
    var kind = input.getAttribute("data-imp"), file = input.files && input.files[0], box = document.getElementById("swkImp-" + kind);
    if (!file || !box) return;
    if (file.size > 2 * 1024 * 1024) { box.innerHTML = '<p class="swk-msg bad">' + esc(T("الملف أكبر من 2 ميجا.", "The file is larger than 2 MB.")) + "</p>"; input.value = ""; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || ""); input.value = "";
      S.imp[kind] = { text: text, name: file.name };
      box.innerHTML = loadingHtml(T("بنجرب الاستيراد (من غير تغيير)…", "Trying the import (no changes)…"));
      api("POST", "/import?kind=" + kind + "&dry_run=1", { text: text }).then(function (j) { box.innerHTML = importResult(kind, j, true); }, function (e) { box.innerHTML = importErr(e); });
    };
    rd.onerror = function () { box.innerHTML = '<p class="swk-msg bad">' + esc(T("تعذّر قراءة الملف.", "Could not read the file.")) + "</p>"; };
    rd.readAsText(file, "utf-8");
  }
  function importErr(e) { return e && e.j && e.j.errors ? importResult(e.j.kind || "", e.j, false) : errBox(e); }
  function importResult(kind, j, dry) {
    var n = (j.create || 0) + (j.update || 0) + (j["delete"] || 0), errs = j.errors || [], warns = j.warnings || [];
    var head = '<div class="swk-kpis">' + [[j.create, T("جديد", "New")], [j.update, T("تعديل", "Updated")], [j["delete"], T("حذف", "Deleted")], [j.unchanged, T("بدون تغيير", "Unchanged")], [errs.length, T("أخطاء", "Errors")]].map(function (x) { return '<div class="swk-kpi"><b>' + nf(x[0] || 0) + "</b><span>" + esc(x[1]) + "</span></div>"; }).join("") + "</div>";
    var el = errs.length ? '<div class="swk-tw"><table class="swk-t"><thead><tr><th>' + esc(T("السطر", "Line")) + "</th><th>" + esc(T("الحقل", "Field")) + "</th><th>" + esc(T("المشكلة", "Problem")) + "</th></tr></thead><tbody>" + errs.slice(0, 50).map(function (x) { return '<tr><td class="swk-n">' + esc(x.line || "") + "</td><td><code>" + esc(x.field || "") + '</code></td><td dir="auto">' + esc(isContactErr(x) ? contactMsg(contactVals(x.msg)) : (x.msg || "")) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
    var wl = warns.length ? '<ul class="swk-hint">' + warns.slice(0, 20).map(function (x) { return "<li>" + esc((x.line ? T("سطر ", "line ") + x.line + ": " : "") + (x.msg || "")) + "</li>"; }).join("") + "</ul>" : "";
    var msg = dry ? (errs.length ? '<p class="swk-msg bad">' + esc(T("فيه أخطاء، فمش هيتطبق حاجة. صلّح الملف وجرّب تاني.", "There are errors, so nothing will be applied. Fix the file and try again.")) + "</p>" : n ? '<p class="swk-msg info">' + esc(T("دي تجربة: لسه ماتغيّرش حاجة. راجع الأرقام واضغط تطبيق.", "This was a dry run: nothing changed yet. Check the numbers, then apply.")) + '</p><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="imp-apply" data-kind="' + kind + '">✔ ' + esc(T("تطبيق ", "Apply ") + nf(n) + T(" تغيير", " changes")) + "</button></div>" : '<p class="swk-msg ok">' + esc(T("الملف مطابق للمنشور: صفر تغييرات.", "The file matches what is published: zero changes.")) + "</p>")
      : (j.applied ? '<p class="swk-msg ok">' + esc(T("اتطبق ونُشر (نسخة ", "Applied and published (version ") + vtxt(j.bundle_v) + T("). التعديل يظهر على الموقع ", "). Changes show on the site ") + soonTxt() + ".") + "</p>" : '<p class="swk-msg bad">' + esc(T("ماتطبقش حاجة.", "Nothing was applied.")) + "</p>");
    return head + msg + el + wl;
  }
  ACT["imp-apply"] = function (b) {
    var kind = b.getAttribute("data-kind"), x = S.imp[kind], box = document.getElementById("swkImp-" + kind); if (!x || !box) return;
    b.disabled = true; box.insertAdjacentHTML("beforeend", loadingHtml(T("بنطبّق…", "Applying…")));
    api("POST", "/import?kind=" + kind, { text: x.text }).then(function (j) {
      box.innerHTML = importResult(kind, j, false); delete S.imp[kind];
      if (j.bundle_v) { S.health.bundle_v = j.bundle_v; S.health.bundle_at = new Date().toISOString(); paintStatus(); setTimeout(edgeCheck, 4000); }
      refreshHealth(); if (kind === "redirects") loadRedirects(); else if (S.tab === "pages") loadPages();
    }, function (e) { box.innerHTML = importErr(e); });
  };

  /* ---------- tab 3: page editor drawer ---------- */
  var CV = null;
  function measure(text, font) { if (!CV) { try { CV = document.createElement("canvas").getContext("2d"); } catch (e) { CV = null; } } if (!CV) return clen(text) * (/20px/.test(font) ? 10 : 7); CV.font = font; return CV.measureText(text).width; }
  function fitLines(text, font, width, maxLines) {
    var words = String(text || "").split(/\s+/).filter(Boolean), lines = [], cur = "", i;
    for (i = 0; i < words.length; i++) {
      var w = words[i], t = cur ? cur + " " + w : w;
      if (measure(t, font) <= width) { cur = t; continue; }
      if (cur) lines.push(cur);
      cur = w;
      while (measure(cur, font) > width && cur.length > 1) { var k = cur.length - 1; while (k > 1 && measure(cur.slice(0, k), font) > width) k--; lines.push(cur.slice(0, k)); cur = cur.slice(k); }
    }
    if (cur) lines.push(cur);
    var full = measure(String(text || "").replace(/\s+/g, " ").trim(), font);
    if (lines.length <= maxLines) return { text: lines.join(" "), cut: false, px: Math.round(full) };
    var keep = lines.slice(0, maxLines), last = keep[maxLines - 1];
    while (last && measure(last + " …", font) > width) last = last.indexOf(" ") > 0 ? last.replace(/\s*\S+$/, "") : last.slice(0, -1);
    keep[maxLines - 1] = (last || "") + " …";
    return { text: keep.join(" "), cut: true, px: Math.round(full) };
  }
  function fitWidth(text, font, budget) {
    var s = String(text || "").replace(/\s+/g, " ").trim(), full = measure(s, font);
    if (full <= budget) return { text: s, cut: false, px: Math.round(full) };
    var words = s.split(" "), lo = 0, hi = words.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (measure(words.slice(0, mid).join(" ") + " …", font) <= budget) lo = mid; else hi = mid - 1; }
    return { text: words.slice(0, lo).join(" ") + " …", cut: true, px: Math.round(full) };
  }
  function crumbUrl(path) { var segs = String(path || "/").split("/").filter(Boolean); var s = host() + (segs.length ? " › " + segs.join(" › ") : ""); return trunc(s, 70); }
  function serpHtml(o, mode) {
    var m = mode === "m", t = m ? fitLines(o.title, "20px Arial", 328, 2) : fitLines(o.title, "20px Arial", 600, 1), d = o.desc ? (m ? fitLines(o.desc, "14px Arial", 328, 3) : fitWidth(o.desc, "14px Arial", 920)) : null;
    var rtl = o.lang !== "en";
    var html = '<div class="swk-serp ' + (m ? "m" : "d") + (rtl ? " swk-rtl" : " swk-ltr") + '" aria-label="' + esc(T("معاينة نتيجة جوجل", "Google result preview")) + '"><div class="in"><div class="site"><span class="fav"><img src="/img/logo-site.png" alt="" width="18" height="18"></span><span style="min-width:0"><span class="sn">' + esc(rtl ? "منصة صنع في مصر" : "Made in Egypt Gate") + '</span><span class="su">' + esc(crumbUrl(o.path)) + '</span></span></div><div class="st">' + esc(t.text || "—") + "</div>"
      + (d ? '<div class="sd">' + esc(d.text) + "</div>" : '<div class="sd em">' + esc(T("مفيش وصف: جوجل هيختار جملة من الصفحة.", "No description: Google will pick a snippet from the page.")) + "</div>") + "</div></div>";
    var w = [];
    if (t.cut) w.push(T("العنوان هيتقص في جوجل (عرضه ≈ " + t.px + "px والمتاح ≈ " + (m ? "سطرين" : "600px") + ").", "The title will be cut by Google (≈ " + t.px + "px wide, room ≈ " + (m ? "2 lines" : "600px") + ")."));
    if (d && d.cut) w.push(T("الوصف هيتقص (عرضه ≈ " + d.px + "px والمتاح ≈ " + (m ? "3 سطور" : "920px") + ").", "The description will be cut (≈ " + d.px + "px, room ≈ " + (m ? "3 lines" : "920px") + ")."));
    return html + '<p class="swk-hint">' + esc(T("معاينة تقريبية", "Approximate preview")) + " · " + esc(m ? T("موبايل", "mobile") : T("كمبيوتر", "desktop")) + "</p>" + (w.length ? '<p class="swk-msg warn">⚠️ ' + esc(w.join(" ")) + "</p>" : "");
  }
  function localImg(u) { u = String(u || ""); try { var x = new URL(u, location.href); if (x.host === host() || x.host === "www." + host()) return location.origin + x.pathname; } catch (e) {} return u; }
  function socHtml(o) {
    var img = o.image ? '<img src="' + esc(localImg(o.image)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : esc(T("مفيش صورة مشاركة", "No social image"));
    return '<div class="swk-soc"><div class="im">' + img + '</div><div class="tx"><small>' + esc(host()) + '</small><b dir="auto">' + esc(o.title || "—") + '</b><p dir="auto">' + esc(o.desc || "") + "</p></div></div><p class=\"swk-hint\">" + esc(T("معاينة تقريبية لبطاقة فيسبوك/واتساب/لينكدإن (الصورة 1200×630).", "Approximate Facebook/WhatsApp/LinkedIn card (image 1200×630).")) + "</p>";
  }
  /* ---------- contact data in public text: ES5 port of functions/_lib/seo-privacy.js (owner rule, spec §0) ----------
     Only a live warning here: the API is the final judge (it also knows SEO_PUBLIC_CONTACTS) and refuses with 400. */
  var PLATFORM_PHONES = ["+20238346757", "+201279188996"], PLATFORM_DOMAINS = ["madeinegyptgate.com"];
  function asciiDigits(s) { return String(s == null ? "" : s).replace(/[٠-٩۰-۹]/g, function (d) { return String(d.charCodeAt(0) & 0xf); }); }
  function phoneKey(v) { var d = asciiDigits(v).replace(/\D/g, "").replace(/^00/, ""); if (/^20\d{9,10}$/.test(d)) d = d.slice(2); return d.replace(/^0+/, ""); }
  function phoneOk(v) { var k = phoneKey(v), i; for (i = 0; i < PLATFORM_PHONES.length; i++) if (phoneKey(PLATFORM_PHONES[i]) === k) return true; return false; }
  function emailOk(domain) { var dom = String(domain || "").toLowerCase().replace(/\s+/g, "").replace(/[(\[{]dot[)\]}]/g, "."), i, a; for (i = 0; i < PLATFORM_DOMAINS.length; i++) { a = PLATFORM_DOMAINS[i]; if (dom === a || dom.slice(-a.length - 1) === "." + a) return true; } return false; }
  var PSEP = "[\\s\\-./()\\u00a0\\u200e\\u200f]*", NOPRE = "(^|[^\\d+])"; /* NOPRE stands in for the API's (?<![\d+]) look-behind (not ES5) */
  var MOBILE_SRC = NOPRE + "((?:(?:\\+|00)" + PSEP + "20" + PSEP + "|0)" + PSEP + "1[0125](?:" + PSEP + "\\d){8})(?!\\d)";
  var LAND_SRC = NOPRE + "((?:(?:\\+|00)" + PSEP + "20" + PSEP + "\\(?0?|\\(?0)(?:2\\)?(?:" + PSEP + "\\d){8}|3\\)?(?:" + PSEP + "\\d){7}|(?:4[0-8]|5[05-7]|6[2-9]|8[2468]|9[2-7])\\)?(?:" + PSEP + "\\d){7}))(?!\\d)";
  var WORD_SRC = "(?:الخط الساخن|خط ساخن|رقم الهاتف|رقم التليفون|تليفاكس|تليفون|تلفون|هاتف|فاكس|موبايل|محمول|جوال|واتساب|واتس اب|واتس|اتصل|اتصال|hot\\s?line|telephone|tel|phone|mobile|cell|fax|whats\\s?app|call)\\s*[:：\\-–]?\\s*((?:\\+|00)?\\d(?:" + PSEP + "\\d){4,})";
  var LINK_SRC = "(?:wa\\.me\\/\\+?\\d{6,}|whatsapp\\.com\\/send\\/?\\?phone=\\+?\\d{6,}|\\b(?:tel|sms|callto):\\+?[\\d\\s\\-.()]{5,})";
  var EMAIL_SRC = "[a-z0-9._%+-]+\\s*(?:@|＠|\\(\\s*at\\s*\\)|\\[\\s*at\\s*\\]|\\{\\s*at\\s*\\})\\s*([a-z0-9-]+(?:\\s*(?:\\.|\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\]|\\{\\s*dot\\s*\\})\\s*[a-z0-9-]+)+)";
  /* → [{kind:"phone"|"email", value}] (the platform's own published contacts are not reported) */
  function findContacts(text) {
    var s = asciiDigits(text), out = [], seen = {};
    function add(kind, v) { var k = kind === "phone" ? "p|" + phoneKey(v) : "e|" + String(v).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push({ kind: kind, value: String(v).trim() }); } }
    function scan(src, flags, grp, fn) { var rx = new RegExp(src, flags), m; while ((m = rx.exec(s))) { fn(m, m[grp]); if (rx.lastIndex === m.index) rx.lastIndex++; } }
    if (!s) return out;
    scan(MOBILE_SRC, "g", 2, function (m, v) { if (!phoneOk(v)) add("phone", v); });
    scan(LAND_SRC, "g", 2, function (m, v) { if (!phoneOk(v)) add("phone", v); });
    scan(WORD_SRC, "gi", 1, function (m, v) { if (!phoneOk(v)) add("phone", v); });
    scan(LINK_SRC, "gi", 0, function (m, v) { if (!phoneOk(v)) add("phone", v); });
    scan(EMAIL_SRC, "gi", 0, function (m, v) { if (!emailOk(m[1])) add("email", v); });
    return out;
  }
  var PHONE_KEYS = /^(telephone|faxnumber|phone|mobile|whatsapp)$/i, EMAIL_KEYS = /^email$/i;
  /* contact data anywhere in a JSON-LD value → [{kind, value, key}] */
  function findLdContacts(j) {
    var out = [];
    function walk(v, key, depth) {
      if (depth > 40) return;
      if (typeof v === "number") v = String(v);
      if (typeof v === "string") {
        if (PHONE_KEYS.test(key)) { if (v.trim() && !phoneOk(v)) out.push({ kind: "phone", value: v, key: key }); return; }
        if (EMAIL_KEYS.test(key)) { var e = v.trim().replace(/^mailto:/i, "").toLowerCase(), at = e.lastIndexOf("@"); if (e && !(at > 0 && emailOk(e.slice(at + 1)))) out.push({ kind: "email", value: v, key: key }); return; }
        findContacts(v).forEach(function (c) { out.push({ kind: c.kind, value: c.value, key: key }); });
      } else if (Array.isArray(v)) v.forEach(function (x) { walk(x, key, depth + 1); });
      else if (v && typeof v === "object") { for (var k in v) if (own(v, k)) walk(v[k], k, depth + 1); }
    }
    walk(j, "", 0);
    return out;
  }
  function contactList(found) { return found.slice(0, 3).map(function (c) { return "«" + trunc(c.value, 40) + "»"; }).join("، "); }
  var REQ = { Organization: ["name", "@id"], Product: ["name", "url"], Demand: ["name", "url"], NewsArticle: ["headline", "datePublished", "image"], Event: ["name", "startDate", "location"], Place: ["name"], ItemList: ["itemListElement"],
    Thing: ["name"], AdministrativeArea: ["name"], BreadcrumbList: ["itemListElement"], WebPage: ["url", "name"], CollectionPage: ["url", "name"] };
  function ctxOk(c) { return typeof c === "string" ? /schema\.org/i.test(c) : Array.isArray(c) ? c.some(ctxOk) : !!c && typeof c === "object" && ctxOk(c["@vocab"] || ""); }
  function checkLd(text) {
    var r = { ok: false, types: [], errors: [], warnings: [] }, s = String(text || "").trim();
    if (!s) { r.errors.push(T("مفيش JSON-LD.", "No JSON-LD.")); return r; }
    if (utf8len(s) > 20480) r.errors.push(T("أكبر من 20 كيلوبايت.", "Larger than 20 KB."));
    var o; try { o = JSON.parse(s); } catch (e) { r.errors.push(T("JSON غير صالح: ", "Invalid JSON: ") + String(e.message || e).slice(0, 140)); return r; }
    var tops = Array.isArray(o) ? o : [o];
    if (!tops.length || !tops.every(function (x) { return x && typeof x === "object" && ctxOk(x["@context"]); })) r.errors.push(T("لازم يكون فيه \"@context\" بـ schema.org في أول مستوى.", 'A top-level "@context" with schema.org is required.'));
    var nodes = []; tops.forEach(function (x) { if (x && Array.isArray(x["@graph"])) nodes = nodes.concat(x["@graph"]); else nodes.push(x); });
    nodes.forEach(function (n) {
      if (!n || typeof n !== "object") return;
      var ts = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      ts.forEach(function (t) {
        if (!t) { r.warnings.push(T("عنصر من غير @type.", "A node without @type.")); return; }
        r.types.push(String(t));
        (REQ[t] || []).forEach(function (k) { if (n[k] == null || n[k] === "" || (Array.isArray(n[k]) && !n[k].length)) r.errors.push(t + ": " + T("ناقص ", "missing ") + k); });
        if (/^(VideoObject|FAQPage|Review|AggregateRating)$/.test(t)) r.warnings.push(t + ": " + T("ماتستخدمهوش غير لو المحتوى حقيقي وظاهر في الصفحة (قاعدة الصدق).", "use it only when the content is real and visible on the page (honesty rule)."));
      });
    });
    var fc = findLdContacts(o);
    if (fc.length) { r.privacy = fc; r.errors.push(T("ممنوع أرقام تليفون أو واتساب أو إيميلات في البيانات المنظمة (قاعدة الخصوصية): ", "No phone numbers, WhatsApp numbers or e-mails in structured data (privacy rule): ") + contactList(fc)); }
    r.ok = !r.errors.length; return r;
  }
  function ensureKw() {
    if (S.kw) return Promise.resolve(S.kw);
    if (!S.kwP) S.kwP = api("GET", "/keywords").then(function (j) { S.kw = j.items || []; S.kwSrc = j.source || ""; return S.kw; }, function () { S.kwP = null; return []; });
    return S.kwP;
  }
  function clusterOf(row, path) { var k = S.kw || [], i; for (i = 0; i < k.length; i++) if (k[i].target_url === path) return k[i]; for (i = 0; i < k.length; i++) if (row && k[i].cluster === row.cluster) return k[i]; return null; }
  function openEditor(path) {
    path = normPath(path);
    if (S.drawer && !confirmLeave()) return;
    closeEditor(true);
    var D = S.drawer = { path: path, data: null, live: null, twin: null, view: "d", def: {}, defNote: {}, form: {}, saved: "" };
    var ov = document.createElement("div");
    ov.className = "swk-ov"; ov.setAttribute("translate", "no");
    ov.innerHTML = '<div class="swk-dr" role="dialog" aria-modal="true" aria-labelledby="swkDrT" tabindex="-1"><div class="swk-dr-h"><div class="swk-dr-tt"><h2 id="swkDrT">' + esc(T("تعديل SEO للصفحة", "Page SEO editor")) + '</h2><code>' + esc(path) + '</code><button class="swk-x" type="button" data-act="dr-close" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button></div></div><div class="swk-dr-b"><div class="swk-col">' + loadingHtml() + "</div></div></div>";
    document.body.appendChild(ov); D.ov = ov; D.ret = document.activeElement; document.documentElement.style.overflow = "hidden";
    try { ov.querySelector(".swk-dr").focus(); } catch (e) {}
    setHash({ edit: path });
    ensureKw().then(function () {
      return api("GET", "/page?path=" + encodeURIComponent(path));
    }).then(function (j) {
      if (S.drawer !== D) return;
      D.data = j; paintEditor(); loadLive();
      if (j.defaults && j.defaults.alt) api("GET", "/page?path=" + encodeURIComponent(normPath(j.defaults.alt))).then(function (t) { if (S.drawer !== D) return; D.twin = t.defaults || null; D.twinOk = true; paintAll(); }, function () { D.twinOk = true; });
    }, function (e) { if (S.drawer !== D) return; ov.querySelector(".swk-dr-b").innerHTML = '<div class="swk-col">' + errBox(e) + "</div>"; });
  }
  function confirmLeave() { var D = S.drawer; if (!D || !D.form || ro() || !D.data || snapshot() === D.saved) return true; return window.confirm(T("فيه تعديلات مش محفوظة. تقفل من غير حفظ؟", "There are unsaved changes. Close without saving?")); }
  function closeEditor(force) {
    var D = S.drawer; if (!D) return;
    if (!force && !confirmLeave()) return;
    S.drawer = null; if (D.ov && D.ov.parentNode) D.ov.parentNode.removeChild(D.ov); document.documentElement.style.overflow = "";
    setHash({ edit: null });
    if (!force) { try { if (D.ret && D.ret.focus && document.contains(D.ret)) D.ret.focus(); } catch (e) {} if (D.changed && S.tab === "pages") loadPages(); if (D.changed && S.tab === "overview") go("overview", true); }
  }
  ACT["dr-close"] = function () { closeEditor(false); };
  ACT.edit = function (b) { openEditor(b.getAttribute("data-path")); };
  function snapshot() { var D = S.drawer, o = {}; if (!D) return ""; OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) { o[k] = D.form[k] || ""; }); return JSON.stringify(o); }
  var FLD = {
    title: ["العنوان (title)", "Title tag", 2], description: ["الوصف (meta description)", "Meta description", 3], h1: ["العنوان الرئيسي (H1)", "Main heading (H1)", 2], intro: ["مقدمة الصفحة", "Intro paragraph", 4],
    keywords: ["الكلمات (meta keywords)", "Meta keywords", 2], og_title: ["عنوان المشاركة (OG)", "Social title (OG)", 2], og_description: ["وصف المشاركة (OG)", "Social description (OG)", 3], jsonld: ["البيانات المنظمة (JSON-LD)", "Structured data (JSON-LD)", 10]
  };
  function fieldHtml(k, hint) {
    var x = FLD[k], d = S.drawer.def[k] || "", note = S.drawer.defNote[k];
    return '<div class="swk-f" data-f="' + k + '"><label class="swk-lb" for="swkF-' + k + '"><span>' + esc(T(x[0], x[1])) + '</span><span class="swk-cnt" id="swkC-' + k + '"></span></label>'
      + '<textarea id="swkF-' + k + '" data-fld="' + k + '" rows="' + x[2] + '"' + (k === "jsonld" ? ' class="mono" dir="ltr" spellcheck="false"' : ' dir="auto"') + (EN || k === "jsonld" ? "" : ' placeholder="' + esc(d) + '"') + (ro() ? " readonly" : "") + "></textarea>"
      + '<div class="swk-def"><span>' + esc(T("قيمة البناء: ", "Build value: ")) + (d ? '<b dir="auto">' + esc(trunc(k === "jsonld" ? d.replace(/\s+/g, " ") : d, 170)) + "</b>" : "<b>—</b>") + (note ? " " + esc(note) : "") + '</span><button type="button" class="swk-lnk" data-act="f-reset" data-k="' + k + '"' + dis() + ">" + esc(T("رجوع للافتراضي", "Back to default")) + "</button></div>"
      + (hint ? '<p class="swk-hint">' + hint + "</p>" : "") + '<p class="swk-wn" id="swkW-' + k + '" role="status"></p><p class="swk-er" id="swkE-' + k + '" role="alert"></p></div>';
  }
  function plainField(k, label, inner, hint) {
    var d = S.drawer.def[k] || "";
    return '<div class="swk-f" data-f="' + k + '"><label class="swk-lb" for="swkF-' + k + '"><span>' + esc(label) + "</span></label>" + inner
      + '<div class="swk-def"><span>' + esc(T("قيمة البناء: ", "Build value: ")) + '<b dir="ltr">' + esc(d || "—") + '</b></span><button type="button" class="swk-lnk" data-act="f-reset" data-k="' + k + '"' + dis() + ">" + esc(T("رجوع للافتراضي", "Back to default")) + "</button></div>" + (hint ? '<p class="swk-hint">' + hint + "</p>" : "") + '<p class="swk-er" id="swkE-' + k + '" role="alert"></p></div>';
  }
  function paintEditor() {
    var D = S.drawer, j = D.data, row = j.defaults, box = D.ov.querySelector(".swk-dr");
    if (!row) {
      box.innerHTML = '<div class="swk-dr-h"><div class="swk-dr-tt"><h2 id="swkDrT">' + esc(T("تعديل SEO للصفحة", "Page SEO editor")) + "</h2><code>" + esc(D.path) + '</code><button class="swk-x" type="button" data-act="dr-close" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button></div></div><div class="swk-dr-b"><div class="swk-col"><p class="swk-msg warn">' + esc(T("المسار ده مش موجود في ملف البناء، فمش صفحة منشورة يتعمل لها تعديل.", "This path is not in the build manifest, so it is not a published page that can be edited.")) + "</p></div></div>";
      return;
    }
    var o = j.override || {}, m = j.meta || {};
    D.def = { title: row.title || "", description: row.description || "", h1: row.h1 || "", canonical: row.canonical || "", robots: row.robots || "index,follow", keywords: "", intro: "", og_title: "", og_description: "", og_image: "", jsonld: "" };
    D.defNote = {};
    OVF.forEach(function (k) { D.form[k] = o[k] != null ? String(o[k]) : ""; });
    if (D.form.jsonld) { try { D.form.jsonld = JSON.stringify(JSON.parse(D.form.jsonld), null, 2); } catch (e) {} }
    D.form.target_kw = m.target_kw || ""; D.form.secondary_kw = (m.secondary_kw || []).join("\n"); D.form.note = m.note || "";
    applyLive(); D.saved = snapshot();
    var hasOv = !!(j.override || j.meta), ex = esc(T(" (الافتراضي)", " (default)"));
    var robotsSel = '<select id="swkF-robots" data-fld="robots"' + dis() + '><option value="">' + esc(T("قيمة البناء", "Build value")) + " — " + esc(D.def.robots) + "</option>" + ROBOTS.map(function (r) { return '<option value="' + r + '">' + r + (r === D.def.robots ? ex : "") + "</option>"; }).join("") + "</select>";
    var isPub = row.type === "company-public";
    box.innerHTML = '<div class="swk-dr-h"><div class="swk-dr-tt"><h2 id="swkDrT">' + esc(T("تعديل SEO للصفحة", "Page SEO editor")) + '</h2><code>' + esc(D.path) + '</code><span class="swk-chips">' + chip(typeLabel(row.type), isPub ? "pub" : "") + chip(row.lang === "en" ? "EN" : "AR") + (hasOv ? chip(T("عليها تعديل", "Overridden"), "ov") : "") + '</span><span id="swkDrSc"></span><button class="swk-x" type="button" data-act="dr-close" aria-label="' + esc(T("إغلاق", "Close")) + '">✕</button></div>'
      + '<div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="save"' + dis() + ">💾 " + esc(T("حفظ ونشر", "Save & publish")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="save-inx"' + dis() + ">📣 " + esc(T("حفظ + إبلاغ محركات البحث (IndexNow)", "Save + notify search engines (IndexNow)")) + "</button>"
      + '<button class="btn btn-line btn-sm swk-danger" type="button" data-act="del"' + (ro() || !hasOv ? " disabled" : "") + ">🗑️ " + esc(T("حذف التعديل", "Delete override")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="hist">🕘 ' + esc(T("السجل", "History")) + " (" + nf((j.history || []).length) + ')</button><a class="btn btn-line btn-sm" href="' + esc(encP(D.path)) + '" target="_blank" rel="noopener">↗ ' + esc(T("افتح الصفحة", "Open page")) + "</a></div>"
      + (ro() ? '<p class="swk-msg warn">' + esc(roText()) + "</p>" : "") + '<div class="swk-dr-msg" id="swkDrMsg" aria-live="polite"></div></div>'
      + '<div class="swk-dr-b"><div class="swk-col">'
      + '<section class="swk-sec"><h3>' + esc(T("نتيجة البحث", "Search result")) + "</h3>" + fieldHtml("title", esc(T("الأفضل 30–60 حرف والكلمة المستهدفة في الأول. فوق 65 جوجل بيقصّه غالباً.", "Best 30–60 characters with the target keyword first. Above 65 Google usually cuts it."))) + fieldHtml("description", esc(T("الأفضل 70–160 حرف: الرقم والمكان والمنتجات، وفي الآخر «اطلب عرض سعر مجاناً».", "Best 70–160 characters: count, place and products, ending with a call to action.")))
      + '<div class="swk-h"><span class="swk-label">' + esc(T("معاينة جوجل", "Google preview")) + '</span><span class="swk-seg" role="group" aria-label="' + esc(T("نوع المعاينة", "Preview type")) + '"><button type="button" data-act="serp" data-v="d" aria-pressed="true">' + esc(T("كمبيوتر", "Desktop")) + '</button><button type="button" data-act="serp" data-v="m" aria-pressed="false">' + esc(T("موبايل", "Mobile")) + '</button></span></div><div id="swkSerp"></div></section>'
      + '<section class="swk-sec"><h3>' + esc(T("المحتوى", "Content")) + "</h3>" + fieldHtml("h1", esc(T("عنوان واحد بس في الصفحة؛ يفضل يحتوي الكلمة المستهدفة.", "Only one per page; ideally contains the target keyword."))) + fieldHtml("intro", esc(T("فقرة نص عادي (من غير HTML) بتظهر تحت العنوان الرئيسي، حتى 1,200 حرف.", "A plain-text paragraph (no HTML) shown under the main heading, up to 1,200 characters."))) + "</section>"
      + '<section class="swk-sec"><h3>' + esc(T("الفهرسة", "Indexing")) + "</h3>" + plainField("robots", T("الفهرسة (robots)", "Robots"), robotsSel, esc(T("noindex بيخفي الصفحة من نتائج البحث (بتفضل متاحة للزوار). خرائط الموقع بتتحدث مع البناء الجاي.", "noindex hides the page from search results (it stays available to visitors). Sitemaps update on the next build.")))
      + plainField("canonical", T("الرابط الأساسي (canonical)", "Canonical URL"), '<input type="url" id="swkF-canonical" data-fld="canonical" dir="ltr" spellcheck="false" inputmode="url"' + (ro() ? " readonly" : "") + ">", esc(T("سيبه فاضي عشان يفضل رابط الصفحة نفسها. لازم يبدأ بـ ", "Leave empty to keep the page's own URL. Must start with ") + site() + "/")) + "</section>"
      + '<section class="swk-sec"><h3>' + esc(T("المشاركة على السوشيال", "Social sharing")) + "</h3>" + fieldHtml("og_title") + fieldHtml("og_description")
      + plainField("og_image", T("صورة المشاركة (رابط https، مقاس 1200×630)", "Social image (https URL, 1200×630)"), '<input type="url" id="swkF-og_image" data-fld="og_image" dir="ltr" spellcheck="false" inputmode="url"' + (ro() ? " readonly" : "") + ">") + '<div id="swkSoc"></div></section>'
      + '<section class="swk-sec"><h3>' + esc(T("متقدم", "Advanced")) + "</h3>" + fieldHtml("keywords", esc(T("جوجل يتجاهلها؛ Yandex قد يستخدمها. افصل بفاصلة.", "Google ignores them; Yandex may use them. Separate with commas.")))
      + fieldHtml("jsonld", esc(T("لازم JSON صالح فيه \"@context\": \"https://schema.org\". من غير تليفونات أو إيميلات للمصانع.", 'Must be valid JSON with "@context": "https://schema.org". No factory phones or e-mails.')))
      + '<div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="ld-check">🔎 ' + esc(T("تحقق", "Validate")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="ld-fmt"' + dis() + ">{ } " + esc(T("تنسيق", "Format")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="ld-live"' + dis() + ">⤵ " + esc(T("ابدأ من بيانات الصفحة", "Start from the page's data")) + '</button><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://search.google.com/test/rich-results?url=' + encodeURIComponent(absUrl(D.path)) + '">Rich Results Test ↗</a><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://validator.schema.org/#url=' + encodeURIComponent(absUrl(D.path)) + '">validator.schema.org ↗</a></div><div id="swkLd" aria-live="polite"></div></section>'
      + '</div><aside class="swk-col">'
      + '<section class="swk-sec"><h3>' + esc(T("درجة SEO (مباشرة)", "SEO score (live)")) + '</h3><div id="swkScore"></div></section>'
      + '<section class="swk-sec"><h3>' + esc(T("الكلمة المستهدفة", "Target keyword")) + '</h3><div id="swkKwInfo" class="swk-hint"></div>'
      + '<div class="swk-f"><label class="swk-lb" for="swkF-target_kw">' + esc(T("الكلمة المستهدفة للصفحة دي", "Target keyword for this page")) + '</label><textarea id="swkF-target_kw" data-fld="target_kw" rows="1" dir="auto"' + (ro() ? " readonly" : "") + '></textarea><p class="swk-er" id="swkE-target_kw" role="alert"></p></div>'
      + '<div class="swk-f"><label class="swk-lb" for="swkF-secondary_kw">' + esc(T("كلمات ثانوية (واحدة في كل سطر)", "Secondary keywords (one per line)")) + '</label><textarea id="swkF-secondary_kw" data-fld="secondary_kw" rows="3" dir="auto"' + (ro() ? " readonly" : "") + '></textarea><p class="swk-er" id="swkE-secondary_kw" role="alert"></p></div>'
      + '<div id="swkKw"></div></section>'
      + '<section class="swk-sec"><h3>' + esc(T("ملاحظة للفريق", "Team note")) + '</h3><div class="swk-f"><label class="swk-lb" for="swkF-note">' + esc(T("مين طلب التعديل وليه (اختياري)", "Who asked for the change and why (optional)")) + '</label><textarea id="swkF-note" data-fld="note" rows="2" dir="auto"' + (ro() ? " readonly" : "") + '></textarea><p class="swk-er" id="swkE-note" role="alert"></p></div></section>'
      + '<section class="swk-sec" id="swkHist"><h3>' + esc(T("سجل التعديلات", "Change history")) + "</h3>" + histHtml(j.history || []) + "</section>"
      + "</aside></div>";
    OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) { var el = box.querySelector('[data-fld="' + k + '"]'); if (el) el.value = D.form[k] || ""; });
    paintAll();
    var first = box.querySelector('[data-fld="title"]'); if (first && !ro() && window.innerWidth > 900) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }
  function applyLive() {
    var D = S.drawer, L = D.live, o = (D.data && D.data.override) || {};
    if (!L || L.error != null || L.loading) return;
    ["keywords", "intro", "og_title", "og_description", "og_image", "jsonld"].forEach(function (k) {
      var hidden = o[k] || (k === "og_title" && o.title) || (k === "og_description" && o.description);
      if (hidden) { D.def[k] = ""; D.defNote[k] = T("(مش ظاهرة لأن الصفحة عليها تعديل)", "(hidden by the current override)"); }
      else { D.def[k] = k === "jsonld" && L.jsonld ? prettyLd(L.jsonld) : (L[k] || ""); D.defNote[k] = ""; }
    });
  }
  function prettyLd(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return s; } }
  function loadLive() {
    var D = S.drawer; if (!D) return; D.live = { loading: true };
    fetch(encP(D.path), { credentials: "same-origin", cache: "no-store" }).then(function (r) {
      if (!r.ok || (r.headers.get("content-type") || "").indexOf("html") < 0) throw { status: r.status };
      return r.text();
    }).then(function (html) { if (S.drawer !== D) return; D.live = parseLive(html); refreshDefaults(); }, function (e) { if (S.drawer !== D) return; D.live = { error: (e && e.status) || 0 }; paintAll(); });
  }
  function refreshDefaults() {
    var D = S.drawer; applyLive();
    ["keywords", "intro", "og_title", "og_description", "og_image", "jsonld"].forEach(function (k) {
      var f = D.ov.querySelector('[data-f="' + k + '"] .swk-def span'), d = D.def[k] || "", note = D.defNote[k];
      if (f) f.innerHTML = esc(T("قيمة البناء: ", "Build value: ")) + (d ? '<b dir="' + (k === "og_image" ? "ltr" : "auto") + '">' + esc(trunc(k === "jsonld" ? d.replace(/\s+/g, " ") : d, 170)) + "</b>" : "<b>—</b>") + (note ? " " + esc(note) : "");
      var ta = D.ov.querySelector('textarea[data-fld="' + k + '"]'); if (ta && !EN && k !== "jsonld") ta.setAttribute("placeholder", d);
    });
    paintAll();
  }
  function parseLive(html) {
    var d = new DOMParser().parseFromString(html, "text/html");
    var meta = function (sel) { var m = d.querySelector(sel); return m ? String(m.getAttribute("content") || "").trim() : ""; };
    var h1 = d.querySelector('h1[data-seo="h1"]') || d.querySelector("h1"), intro = d.querySelector('[data-seo="intro"]'), ld = d.querySelector('script[type="application/ld+json"][data-seo="page"]');
    var main = d.querySelector("main") || d.body, txt = "";
    if (main) { var c = main.cloneNode(true); [].forEach.call(c.querySelectorAll("script,style,noscript,template,nav,header,footer,svg,button"), function (x) { if (x.parentNode) x.parentNode.removeChild(x); }); txt = String(c.textContent || "").replace(/\s+/g, " ").trim(); }
    var h1t = h1 ? String(h1.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (h1t) { var i = txt.indexOf(h1t); if (i > 0) txt = txt.slice(i); }
    var words = txt ? txt.split(" ") : [], can = d.querySelector('link[rel="canonical"]');
    return { title: String((d.querySelector("title") || {}).textContent || "").trim(), description: meta('meta[name="description"]'), keywords: meta('meta[name="keywords"]'), robots: meta('meta[name="robots"]'),
      canonical: can ? can.getAttribute("href") || "" : "", og_title: meta('meta[property="og:title"]'), og_description: meta('meta[property="og:description"]'), og_image: meta('meta[property="og:image"]'),
      h1: h1t, intro: intro ? String(intro.textContent || "").replace(/\s+/g, " ").trim() : "", hasIntro: !!intro, hasH1: !!d.querySelector('h1[data-seo="h1"]'), jsonld: ld ? String(ld.textContent || "").trim() : "", first100: words.slice(0, 100).join(" "), words: words.length };
  }
  function formOv() { var D = S.drawer, o = {}; OVF.forEach(function (k) { var v = D.form[k]; if (v != null && String(v).trim() !== "") o[k] = k === "jsonld" || k === "canonical" || k === "og_image" || k === "robots" ? String(v).trim() : plain(v); }); return o; }
  function targetKw() { var D = S.drawer, row = D.data.defaults || {}, c = clusterOf(row, D.path); return plain(D.form.target_kw) || row.kw || (c && c.target_kw) || ""; }
  function paintAll() {
    var D = S.drawer; if (!D || !D.data || !D.data.defaults) return;
    var row = D.data.defaults, ov = formOv(), eff = effective(row, ov), box = D.ov;
    var cnt = function (k, n, cls, max) { var el = box.querySelector("#swkC-" + k); if (el) { el.textContent = n + (max ? " / " + max : "") + T(" حرف", " chars"); el.className = "swk-cnt " + (cls || ""); } };
    var tl = clen(eff.title), dl = clen(eff.description);
    cnt("title", tl, lenCls(tl, "t"), 60); cnt("description", dl, lenCls(dl, "d"), 160);
    ["h1", "og_title"].forEach(function (k) { var n = clen(ov[k] || ""); cnt(k, n, n > 120 ? "r" : "", 120); });
    ["intro"].forEach(function (k) { var n = clen(ov[k] || ""); cnt(k, n, n > 1200 ? "r" : "", 1200); });
    ["og_description"].forEach(function (k) { var n = clen(ov[k] || ""); cnt(k, n, n > 320 ? "r" : "", 320); });
    cnt("keywords", clen(ov.keywords || ""), clen(ov.keywords || "") > 255 ? "r" : "", 255);
    /* live privacy warning per field (the API refuses these on save) */
    ["title", "description", "keywords", "h1", "intro", "og_title", "og_description", "jsonld"].forEach(function (k) {
      var wEl = box.querySelector("#swkW-" + k); if (!wEl) return;
      var found = [];
      if (k === "jsonld") { if (ov.jsonld) { try { found = findLdContacts(JSON.parse(ov.jsonld)); } catch (e) { found = []; } } }
      else if (ov[k]) found = findContacts(ov[k]);
      wEl.textContent = found.length ? "⚠️ " + contactMsg(contactList(found)) : "";
    });
    var serp = box.querySelector("#swkSerp"); if (serp) serp.innerHTML = serpHtml({ title: eff.title, desc: eff.description, path: D.path, lang: row.lang }, D.view);
    var L = D.live && !D.live.loading && D.live.error == null ? D.live : null;
    var soc = box.querySelector("#swkSoc"); if (soc) soc.innerHTML = socHtml({ title: ov.og_title || ov.title || (L && L.og_title) || eff.title, desc: ov.og_description || ov.description || (L && L.og_description) || eff.description, image: ov.og_image || (L && L.og_image) || (site() + "/img/og-cover.jpg") });
    var tk = targetKw(), th = curTh();
    var sc = scorePage(row, { ov: Object.keys(ov).length ? ov : null, target_kw: tk, twin: D.twin, site: site(), thresholds: th });
    var hdr = box.querySelector("#swkDrSc"); if (hdr) hdr.innerHTML = scoreBadge({ score: sc.score, intentional_noindex: sc.intentional_noindex });
    var sb = box.querySelector("#swkScore");
    if (sb) sb.innerHTML = '<div class="swk-h"><span>' + scoreBadge({ score: sc.score, intentional_noindex: sc.intentional_noindex }) + " " + esc(T("من 100", "of 100")) + "</span>" + (D.data.score != null ? '<span class="swk-hint">' + esc(T("المنشور دلوقتي: ", "Published now: ") + D.data.score) + "</span>" : "") + "</div>"
      + (sc.intentional_noindex ? '<p class="swk-msg info">' + esc(T("الصفحة غير مفهرسة عمداً (قرار البناء: ", "This page is noindex on purpose (build decision: ") + reasonLabel(row.why) + T(")، فمش بتتحاسب على الكلمة المستهدفة وعدد الكلمات.", "), so the keyword and word-count checks do not apply.")) + "</p>" : "")
      + '<ul class="swk-chk-l">' + sc.checks.map(function (c) { var x = CHECKS[c.id] || [c.id, c.id]; return "<li><span>" + esc(T(x[0], x[1])) + (c.id === "words" ? " (" + nf(row.words) + " / " + nf(sc.minWords) + ")" : "") + '</span><span class="' + (c.got === c.pts ? "swk-ok" : c.got ? "swk-n a" : "swk-no") + '">' + c.got + "/" + c.pts + "</span></li>"; }).join("") + "</ul>"
      + (D.live && D.live.error != null ? '<p class="swk-hint">' + esc(T("مقدرناش نجيب الصفحة من الدومين ده (HTTP " + D.live.error + ")، ففحص أول 100 كلمة مش متاح.", "Could not fetch the page from this host (HTTP " + D.live.error + "), so the first-100-words check is unavailable.")) + "</p>" : "");
    var c = clusterOf(row, D.path), info = box.querySelector("#swkKwInfo");
    if (info) info.innerHTML = esc(T("المستخدمة في التقييم: ", "Used for scoring: ")) + (tk ? '<b dir="auto">' + esc(tk) + "</b>" : "—") + (plain(D.form.target_kw) ? " · " + esc(T("(من تعديلك)", "(your override)")) : row.kw ? " · " + esc(T("(من البناء)", "(from the build)")) : c ? " · " + esc(T("(من مجموعة الكلمات)", "(from the keyword cluster)")) : "")
      + (c ? "<br>" + esc(T("المجموعة ", "Cluster ")) + "<b>" + esc(c.cluster) + "</b>" + (c.name ? ": " + '<span dir="auto">' + esc(c.name) + "</span>" : "") + (c.difficulty ? " · " + esc(T("الصعوبة ", "difficulty ")) + esc(c.difficulty) : "") : "");
    var sec = String(D.form.secondary_kw || "").split(/\n|\|/).map(plain).filter(Boolean);
    if (!sec.length && c) sec = c.secondary_kw || [];
    var kwb = box.querySelector("#swkKw");
    if (kwb) {
      if (!tk) kwb.innerHTML = '<p class="swk-hint">' + esc(T("مفيش كلمة مستهدفة للصفحة دي.", "No target keyword for this page.")) + "</p>";
      else {
        var k = normAr(tk), has = function (s) { return normAr(s).indexOf(k) >= 0; }, mark = function (v) { return v == null ? '<span class="swk-na">' + esc(T("مش متاح", "n/a")) + "</span>" : v ? '<span class="swk-ok">✓</span>' : '<span class="swk-no">✗</span>'; };
        kwb.innerHTML = '<ul class="swk-chk-l"><li><span>' + esc(T("في العنوان", "In the title")) + "</span>" + mark(has(eff.title)) + "</li><li><span>" + esc(T("في H1", "In the H1")) + "</span>" + mark(has(eff.h1)) + "</li><li><span>" + esc(T("في الوصف", "In the description")) + "</span>" + mark(has(eff.description)) + "</li><li><span>" + esc(T("في أول 100 كلمة من الصفحة", "In the first 100 words")) + "</span>" + mark(L ? has(L.first100) : null) + "</li></ul>"
          + (sec.length ? '<p class="swk-hint">' + esc(T("الكلمات الثانوية الظاهرة في العنوان أو الوصف أو H1 أو أول 100 كلمة: ", "Secondary keywords found in the title, description, H1 or first 100 words: ")) + sec.slice(0, 12).map(function (s) { var n = normAr(s), hit = [eff.title, eff.description, eff.h1, L ? L.first100 : ""].some(function (x) { return normAr(x).indexOf(n) >= 0; }); return '<span class="swk-c ' + (hit ? "grn" : "") + '" dir="auto">' + (hit ? "✓ " : "") + esc(s) + "</span>"; }).join(" ") + "</p>" : "")
          + '<p class="swk-hint">' + esc(T("المقارنة بتتجاهل التشكيل واختلاف الألف والياء والتاء المربوطة.", "Matching ignores diacritics and alef / ya / ta-marbuta variants.")) + "</p>";
      }
    }
  }
  function histHtml(list) {
    if (!list.length) return '<p class="muted">' + esc(T("مفيش تعديلات سابقة على الصفحة دي.", "No earlier changes on this page.")) + "</p>";
    return '<ol class="swk-hist">' + list.map(function (h, i) {
      var b = (h.before && h.before.fields) || {}, a = (h.after && h.after.fields) || {}, bm = (h.before && h.before.meta) || {}, am = (h.after && h.after.meta) || {}, rows = [];
      OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) {
        var x = OVF.indexOf(k) >= 0 ? b[k] : bm[k], y = OVF.indexOf(k) >= 0 ? a[k] : am[k]; x = x == null ? "" : String(x); y = y == null ? "" : String(y);
        if (x !== y) rows.push("<li><b>" + esc(FIELDNAMES[k] ? T(FIELDNAMES[k][0], FIELDNAMES[k][1]) : k) + ":</b> " + (x ? '<del dir="auto">' + esc(trunc(x, 120)) + "</del> " : "") + "→ " + (y ? '<ins dir="auto">' + esc(trunc(y, 120)) + "</ins>" : '<span class="muted">' + esc(T("(قيمة البناء)", "(build value)")) + "</span>") + "</li>");
      });
      return '<li><span class="d">' + esc(fd(h.at)) + " · " + esc(h.by_email || h.by || "") + " · " + esc(kindLabel(h.kind)) + (h.via === "import" ? " · " + esc(T("استيراد", "import")) : "") + (!h.after ? " · " + esc(T("حذف", "deleted")) : "") + "</span>"
        + (rows.length ? '<ul class="swk-diff">' + rows.join("") + "</ul>" : "") + '<span><button type="button" class="swk-lnk" data-act="h-load" data-i="' + i + '"' + dis() + ">↶ " + esc(T("استرجاع", "Restore")) + '</button> <span class="swk-hint">' + esc(T("(بتتحمّل في النموذج، وبعدها «حفظ ونشر»)", "(loads into the form, then «Save & publish»)")) + "</span></span></li>";
    }).join("") + "</ol>";
  }
  ACT.hist = function () { var h = S.drawer && S.drawer.ov.querySelector("#swkHist"); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" }); };
  ACT["h-load"] = function (b) {
    var D = S.drawer, h = D && D.data.history[+b.getAttribute("data-i")]; if (!h) return;
    var a = (h.after && h.after.fields) || {}, am = (h.after && h.after.meta) || {};
    OVF.forEach(function (k) { D.form[k] = a[k] != null ? String(k === "jsonld" ? prettyLd(a[k]) : a[k]) : ""; });
    D.form.target_kw = am.target_kw || ""; D.form.secondary_kw = (am.secondary_kw || []).join("\n"); D.form.note = am.note || "";
    OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) { var el = D.ov.querySelector('[data-fld="' + k + '"]'); if (el) el.value = D.form[k]; });
    paintAll(); msg("info", T("الاسترجاع: النسخة دي اتحمّلت في النموذج. راجعها واضغط «حفظ ونشر» عشان ترجع على الموقع.", "Restore: that version is loaded in the form. Review it and press «Save & publish» to put it back on the site."));
    var t = D.ov.querySelector(".swk-dr-b"); if (t) t.scrollTop = 0;
  };
  ACT.serp = function (b) { var D = S.drawer; if (!D) return; D.view = b.getAttribute("data-v"); [].forEach.call(D.ov.querySelectorAll('[data-act="serp"]'), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); paintAll(); };
  ACT["f-reset"] = function (b) { var D = S.drawer, k = b.getAttribute("data-k"), el = D && D.ov.querySelector('[data-fld="' + k + '"]'); if (!el) return; el.value = ""; D.form[k] = ""; fieldErr(k, ""); paintAll(); try { el.focus(); } catch (e) {} };
  ACT["ld-check"] = function () {
    var D = S.drawer; if (!D) return;
    var src = String(D.form.jsonld || "").trim() ? D.form.jsonld : D.def.jsonld, out = D.ov.querySelector("#swkLd");
    if (!String(src || "").trim()) { out.innerHTML = '<p class="swk-msg warn">' + esc(T("مفيش JSON-LD في الحقل ولا في الصفحة المنشورة.", "No JSON-LD in the field or on the published page.")) + "</p>"; return; }
    var r = checkLd(src);
    out.innerHTML = '<div class="swk-msg ' + (r.ok ? "ok" : "bad") + '">' + (r.ok ? "✓ " + esc(T("صالح. الأنواع: ", "Valid. Types: ")) : "✗ " + esc(T("فيه أخطاء. الأنواع: ", "Has errors. Types: "))) + esc(r.types.join("، ") || "—") + (String(D.form.jsonld || "").trim() ? "" : "<small>" + esc(T("(اتفحصت بيانات الصفحة المنشورة لأن الحقل فاضي)", "(checked the published page's data because the field is empty)")) + "</small>") + "</div>"
      + (r.errors.length ? '<ul class="swk-er">' + r.errors.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + (r.warnings.length ? '<ul class="swk-hint">' + r.warnings.map(function (x) { return "<li>⚠️ " + esc(x) + "</li>"; }).join("") + "</ul>" : "")
      + '<p class="swk-hint">' + esc(T("الفحص هنا محلي (JSON + الحقول المطلوبة لكل نوع). للنتيجة الرسمية افتح Rich Results Test بعد النشر.", "This check is local (JSON + required keys per type). For the official result open the Rich Results Test after publishing.")) + "</p>";
  };
  ACT["ld-fmt"] = function () { var D = S.drawer, el = D && D.ov.querySelector('[data-fld="jsonld"]'); if (!el || !el.value.trim()) return; try { el.value = JSON.stringify(JSON.parse(el.value), null, 2); D.form.jsonld = el.value; fieldErr("jsonld", ""); } catch (e) { fieldErr("jsonld", T("JSON غير صالح: ", "Invalid JSON: ") + String(e.message || e).slice(0, 140)); } };
  ACT["ld-live"] = function () { var D = S.drawer, el = D && D.ov.querySelector('[data-fld="jsonld"]'); if (!el) return; var s = D.live && D.live.jsonld; if (!s) { toast(T("الصفحة المنشورة مفيهاش JSON-LD (data-seo=page).", "The published page has no JSON-LD (data-seo=page)."), true); return; } el.value = prettyLd(s); D.form.jsonld = el.value; paintAll(); };
  function fieldErr(k, m) { var D = S.drawer; if (!D) return; var p = D.ov.querySelector("#swkE-" + k), f = D.ov.querySelector('[data-f="' + k + '"]') || (p && p.parentNode); if (p) p.textContent = m || ""; if (f && f.classList) f.classList.toggle("bad", !!m); }
  function msg(cls, text, extra) { var el = S.drawer && S.drawer.ov.querySelector("#swkDrMsg"); if (el) el.innerHTML = '<div class="swk-msg ' + cls + '">' + esc(text) + (extra || "") + "</div>"; }
  function collect() {
    var D = S.drawer, b = { path: D.path }, ov = formOv(), k;
    for (k in ov) if (own(ov, k)) b[k] = ov[k];
    b.target_kw = plain(D.form.target_kw); b.secondary_kw = String(D.form.secondary_kw || "").split(/\n|\|/).map(plain).filter(Boolean); b.note = plain(D.form.note);
    return b;
  }
  function validateBody(b) {
    var errs = [], L = { title: [1, 120], h1: [1, 120], og_title: [1, 120], description: [1, 320], og_description: [1, 320], keywords: [1, 255], intro: [1, 1200] }, k;
    for (k in L) if (own(L, k) && b[k]) { var n = clen(b[k]); if (n > L[k][1]) errs.push([k, T("لازم يكون من " + L[k][0] + " لـ " + L[k][1] + " حرف (دلوقتي " + n + ").", "Must be " + L[k][0] + "–" + L[k][1] + " characters (now " + n + ").")]); }
    if (b.canonical) { var okc = false; try { var u = new URL(b.canonical); okc = u.protocol === "https:" && u.host === host() && b.canonical.indexOf("#") < 0; } catch (e) {} if (!okc) errs.push(["canonical", T("لازم رابط كامل يبدأ بـ ", "Must be an absolute URL starting with ") + site() + "/" + T(" ومن غير #.", " and without #.")]); }
    if (b.robots && ROBOTS.indexOf(b.robots) < 0) errs.push(["robots", T("قيمة غير مسموحة.", "Value not allowed.")]);
    if (b.og_image && !(/^https:\/\/\S+$/i.test(b.og_image) && b.og_image.length <= 500)) errs.push(["og_image", T("لازم رابط https (لحد 500 حرف).", "Must be an https URL (up to 500 characters).")]);
    /* JSON-LD structure errors block the save here; contact data only warns (the API decides, see findContacts) */
    if (b.jsonld) { var r = checkLd(b.jsonld); var hard = r.errors.filter(function (x) { return !/privacy|الخصوصية/.test(x); }); if (hard.length && !/^\s*[\[{]/.test(b.jsonld)) hard = [T("JSON غير صالح.", "Invalid JSON.")]; if (hard.length) errs.push(["jsonld", hard[0]]); }
    if (b.target_kw && clen(b.target_kw) > 120) errs.push(["target_kw", T("أطول من 120 حرف.", "Longer than 120 characters.")]);
    if (b.secondary_kw.length > 20 || b.secondary_kw.some(function (s) { return clen(s) > 120; })) errs.push(["secondary_kw", T("لحد 20 كلمة، كل واحدة لحد 120 حرف.", "Up to 20 keywords of up to 120 characters each.")]);
    if (b.note && clen(b.note) > 500) errs.push(["note", T("أطول من 500 حرف.", "Longer than 500 characters.")]);
    return errs;
  }
  function save(ping, btn) {
    var D = S.drawer; if (!D || ro() || !D.data || !D.data.defaults) return;
    OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) { fieldErr(k, ""); });
    var b = collect(), errs = validateBody(b);
    if (errs.length) { errs.forEach(function (e) { fieldErr(e[0], e[1]); }); msg("bad", T("صحّح الحقول المعلّمة بالأحمر.", "Fix the fields marked in red.")); var f = D.ov.querySelector(".swk-f.bad textarea, .swk-f.bad input, .swk-f.bad select"); if (f) { try { f.focus(); } catch (e) {} } return; }
    if (ping) b.ping_indexnow = true;
    var btns = D.ov.querySelectorAll('[data-act="save"],[data-act="save-inx"]'); [].forEach.call(btns, function (x) { x.disabled = true; });
    msg("info", T("بنحفظ وبننشر…", "Saving and publishing…"));
    api("PUT", "/page", { json: b }).then(function (r) {
      if (S.drawer !== D) return;
      if (!r || r.ok !== true) throw { code: "bad_response", error: T("السيرفر ماأكدش الحفظ.", "The server did not confirm the save.") };
      D.data.override = r.override || null; D.data.meta = r.meta || null; D.saved = snapshot(); D.changed = true;
      if (S.health) { S.health.bundle_v = r.bundle_v; if (r.changed) S.health.bundle_at = new Date().toISOString(); paintStatus(); }
      var ex = "";
      (r.warnings || []).forEach(function (w) { ex += "<small>⚠️ " + esc((FIELDNAMES[w.field] ? T(FIELDNAMES[w.field][0], FIELDNAMES[w.field][1]) + ": " : "") + (w.msg || "")) + "</small>"; });
      if (r.indexnow) ex += "<small>📣 IndexNow: " + esc(r.indexnow.ok ? T("اتبعت (", "sent (") + (r.indexnow.status || "") + ")" : (r.indexnow.code === "no_key" ? T("مفيش مفتاح IndexNow لسه — ولّده من تبويب التحقق.", "no IndexNow key yet — generate it in the verification tab.") : (r.indexnow.status || "") + " " + (r.indexnow.message || ""))) + "</small>";
      msg(r.changed ? "ok" : "info", r.changed ? T("✅ اتحفظ ونُشر (نسخة ", "✅ Saved and published (version ") + vtxt(r.bundle_v) + T("). التعديل يظهر على الموقع ", "). The change shows on the site ") + soonTxt(r.visible_within_s) + "." : T("مفيش تغيير عن آخر نسخة محفوظة.", "Nothing changed since the last saved version."), ex);
      reloadPageData(); setTimeout(edgeCheck, 3000);
    }, function (e) {
      if (S.drawer !== D) return;
      if (e.field) fieldErr(String(e.field).replace(/\..*$/, ""), isContactErr(e) ? contactMsg(contactVals(e.error)) : (e.error || errText(e)));
      (e.errors || []).forEach(function (x) { if (x.field) fieldErr(String(x.field).replace(/\..*$/, ""), isContactErr(x) ? contactMsg(contactVals(x.msg)) : (x.msg || "")); });
      msg("bad", errText(e));
    }).then(function () { [].forEach.call(btns, function (x) { x.disabled = ro(); }); });
  }
  function reloadPageData() {
    var D = S.drawer; if (!D) return;
    api("GET", "/page?path=" + encodeURIComponent(D.path)).then(function (j) {
      if (S.drawer !== D) return; D.data.history = j.history || []; D.data.score = j.score; D.data.override = j.override; D.data.meta = j.meta;
      var h = D.ov.querySelector("#swkHist"); if (h) h.innerHTML = "<h3>" + esc(T("سجل التعديلات", "Change history")) + "</h3>" + histHtml(D.data.history);
      var hb = D.ov.querySelector('[data-act="hist"]'); if (hb) hb.textContent = "🕘 " + T("السجل", "History") + " (" + nf(D.data.history.length) + ")";
      var del = D.ov.querySelector('[data-act="del"]'); if (del) del.disabled = ro() || !(j.override || j.meta);
      paintAll();
    }, function () {});
  }
  ACT.save = function (b) { save(false, b); };
  ACT["save-inx"] = function (b) { save(true, b); };
  ACT.del = function (b) {
    var D = S.drawer; if (!D || ro()) return;
    if (!window.confirm(T("حذف التعديل هيرجّع الصفحة لقيم البناء (العنوان والوصف وكل الحقول). متأكد؟", "Deleting the override returns the page to its build values (title, description and every field). Are you sure?"))) return;
    b.disabled = true;
    api("DELETE", "/page?path=" + encodeURIComponent(D.path)).then(function (r) {
      if (S.drawer !== D) return;
      D.changed = true; D.data.override = null; D.data.meta = null;
      if (S.health) { S.health.bundle_v = r.bundle_v; S.health.bundle_at = new Date().toISOString(); paintStatus(); }
      OVF.concat(["target_kw", "secondary_kw", "note"]).forEach(function (k) { D.form[k] = ""; var el = D.ov.querySelector('[data-fld="' + k + '"]'); if (el) el.value = ""; });
      D.saved = snapshot(); applyLive(); paintAll();
      msg("ok", r.removed ? T("اتحذف التعديل؛ الصفحة بترجع لقيم البناء ", "Override deleted; the page returns to its build values ") + soonTxt() + "." : T("مكانش فيه تعديل محفوظ.", "There was no saved override."));
      reloadPageData(); setTimeout(edgeCheck, 3000);
    }, function (e) { b.disabled = false; msg("bad", errText(e)); });
  };

  /* ---------- tab 4: keywords ---------- */
  RENDER.keywords = function (p) {
    p.innerHTML = card(esc(T("الكلمات المفتاحية", "Keywords")), loadingHtml());
    S.kw = null; S.kwP = null;
    ensureKw().then(function () { if (S.tab === "keywords") paintKw(p); });
  };
  function paintKw(p) {
    var items = S.kw || [], src = S.kwSrc;
    var srcNote = src === "kv" ? T("النسخة المعدّلة من الفريق (محفوظة في مخزن الـ SEO).", "The team's edited copy (saved in the SEO store).") : src === "build" ? T("من ملف البناء seo/keywords.json — أول حفظ هيعمل نسخة قابلة للتعديل.", "From the build file seo/keywords.json — the first save creates an editable copy.") : T("مفيش ملف كلمات منشور (‎/_seo/keywords.json‎). ضيف مجموعة عشان تبدأ.", "No keyword file is deployed (/_seo/keywords.json). Add a cluster to start.");
    var diffChip = function (d) { return d ? chip(d === "H" ? T("صعبة H", "Hard H") : d === "M" ? T("متوسطة M", "Medium M") : T("سهلة L", "Low L"), d === "H" ? "red" : d === "L" ? "grn" : "ov") : ""; };
    p.innerHTML = card(esc(T("الكلمات المفتاحية", "Keywords")), '<p class="swk-note">⏳ ' + esc(T("المنافسة على الكلمات العامة (مناقصات مصر، دليل المصانع) تحتاج 6–12 شهراً؛ الكلمات الطويلة أسرع.", "Competing for broad terms (Egypt tenders, factory directory) takes 6–12 months; long-tail keywords move faster.")) + "</p>"
      + '<p class="swk-hint">' + esc(srcNote) + " " + esc(T("التغطية = هل عنوان صفحة الهدف وH1 بتاعها فيهم الكلمة (بعد التعديلات المنشورة).", "Coverage = whether the target page's title and H1 contain the keyword (after published edits).")) + "</p>"
      + (items.length ? '<div class="swk-tw"><table class="swk-t" style="min-width:860px"><thead><tr><th>' + esc(T("المجموعة", "Cluster")) + "</th><th>" + esc(T("صفحة الهدف", "Target URL")) + "</th><th>" + esc(T("الكلمة المستهدفة", "Target keyword")) + "</th><th>" + esc(T("كلمات ثانوية", "Secondary")) + "</th><th>" + esc(T("الصعوبة", "Difficulty")) + "</th><th>" + esc(T("التغطية", "Coverage")) + "</th><th></th></tr></thead><tbody>"
        + items.map(function (k, i) { return '<tr data-kwi="' + i + '"><td><b>' + esc(k.cluster) + '</b><small dir="auto">' + esc(k.name || "") + "</small></td><td>" + (k.target_url ? '<button type="button" class="swk-lnk" data-act="edit" data-path="' + esc(k.target_url) + '"><code>' + esc(k.target_url) + "</code></button>" : "—") + '</td><td dir="auto"><b>' + esc(k.target_kw || "—") + '</b></td><td><span class="swk-chips">' + (k.secondary_kw || []).slice(0, 6).map(function (s) { return '<span class="swk-c" dir="auto">' + esc(s) + "</span>"; }).join("") + ((k.secondary_kw || []).length > 6 ? chip("+" + ((k.secondary_kw || []).length - 6)) : "") + "</span></td><td>" + diffChip(k.difficulty) + '</td><td id="swkCov-' + i + '">' + (k.target_url && k.target_kw ? loadingHtml("") : "—") + '</td><td><button type="button" class="btn btn-line btn-sm" data-act="kw-edit" data-i="' + i + '"' + dis() + ">✎ " + esc(T("تعديل", "Edit")) + "</button></td></tr>"; }).join("") + "</tbody></table></div>" : "")
      + '<div id="swkKwEd"></div><div class="swk-acts"><button type="button" class="btn btn-line btn-sm" data-act="kw-new"' + dis() + ">➕ " + esc(T("مجموعة جديدة", "New cluster")) + "</button></div>");
    var q = items.map(function (k, i) { return [k, i]; }).filter(function (x) { return x[0].target_url && x[0].target_kw; });
    function nextCov() {
      if (!q.length || S.tab !== "keywords") return;
      var x = q.shift(), k = x[0], i = x[1];
      api("GET", "/page?path=" + encodeURIComponent(k.target_url)).then(function (j) {
        var td = document.getElementById("swkCov-" + i); if (!td) return;
        if (!j.defaults) { td.innerHTML = '<span class="swk-no">' + esc(T("الصفحة مش في البناء", "Page not in the build")) + "</span>"; return; }
        var e = j.effective || {}, n = normAr(k.target_kw), a = normAr(e.title).indexOf(n) >= 0, b = normAr(e.h1).indexOf(n) >= 0;
        td.innerHTML = esc(T("العنوان ", "Title ")) + (a ? '<span class="swk-ok">✓</span>' : '<span class="swk-no">✗</span>') + " · H1 " + (b ? '<span class="swk-ok">✓</span>' : '<span class="swk-no">✗</span>') + (j.score != null ? " · " + scoreBadge({ score: j.score }) : "");
      }, function () { var td = document.getElementById("swkCov-" + i); if (td) td.textContent = "—"; }).then(function () { nextCov(); });
    }
    for (var c = 0; c < 4; c++) nextCov();
  }
  function kwForm(k, isNew) {
    return '<form class="swk-card" data-form="kw" style="margin-top:10px" novalidate><h3>' + esc(isNew ? T("مجموعة جديدة", "New cluster") : T("تعديل المجموعة ", "Edit cluster ") + k.cluster) + "</h3>"
      + '<div class="swk-grid2"><label class="swk-f"><span class="swk-lb">' + esc(T("رمز المجموعة (حروف إنجليزي/أرقام)", "Cluster id (latin letters/digits)")) + '</span><input type="text" name="cluster" dir="ltr" maxlength="40"' + (isNew ? "" : " readonly") + ' value="' + esc(k.cluster || "") + '"></label>'
      + '<label class="swk-f"><span class="swk-lb">' + esc(T("الصعوبة", "Difficulty")) + '</span><select name="difficulty">' + ["", "L", "M", "H"].map(function (d) { return '<option value="' + d + '"' + (d === (k.difficulty || "") ? " selected" : "") + ">" + (d || "—") + "</option>"; }).join("") + "</select></label></div>"
      + '<label class="swk-f"><span class="swk-lb">' + esc(T("صفحة الهدف (مسار يبدأ بـ /)", "Target URL (path starting with /)")) + '</span><textarea name="target_url" rows="1" dir="ltr"></textarea></label>'
      + '<label class="swk-f"><span class="swk-lb">' + esc(T("الكلمة المستهدفة", "Target keyword")) + '</span><textarea name="target_kw" rows="1" dir="auto"></textarea></label>'
      + '<label class="swk-f"><span class="swk-lb">' + esc(T("كلمات ثانوية (واحدة في كل سطر)", "Secondary keywords (one per line)")) + '</span><textarea name="secondary_kw" rows="4" dir="auto"></textarea></label>'
      + '<p class="swk-er" role="alert"></p><div class="swk-acts"><button class="btn btn-green btn-sm" type="submit">💾 ' + esc(T("حفظ", "Save")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="kw-cancel">' + esc(T("إلغاء", "Cancel")) + "</button></div></form>";
  }
  function openKwForm(k, isNew) {
    var ed = document.getElementById("swkKwEd"); if (!ed) return;
    ed.innerHTML = kwForm(k, isNew);
    var f = ed.querySelector("form"); f.elements.target_url.value = k.target_url || ""; f.elements.target_kw.value = k.target_kw || ""; f.elements.secondary_kw.value = (k.secondary_kw || []).join("\n");
    ed.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  ACT["kw-edit"] = function (b) { var k = (S.kw || [])[+b.getAttribute("data-i")]; if (k) openKwForm(k, false); };
  ACT["kw-new"] = function () { openKwForm({ cluster: "", difficulty: "", secondary_kw: [] }, true); };
  ACT["kw-cancel"] = function () { var ed = document.getElementById("swkKwEd"); if (ed) ed.innerHTML = ""; };
  FORM.kw = function (f) {
    var er = f.querySelector(".swk-er"), cl = String(f.elements.cluster.value || "").trim(), tu = plain(f.elements.target_url.value);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(cl)) { er.textContent = T("رمز المجموعة لازم 1–40 حرف إنجليزي أو رقم أو _ أو -.", "The cluster id must be 1–40 latin letters, digits, _ or -."); return; }
    if (tu && tu.charAt(0) !== "/" && !/^https?:\/\//i.test(tu)) { er.textContent = T("صفحة الهدف لازم مسار يبدأ بـ /", "The target URL must be a path starting with /"); return; }
    var body = { cluster: cl, target_url: tu ? normPath(tu) : "", target_kw: plain(f.elements.target_kw.value), secondary_kw: String(f.elements.secondary_kw.value || "").split(/\n|\|/).map(plain).filter(Boolean), difficulty: f.elements.difficulty.value };
    var old = null; (S.kw || []).forEach(function (k) { if (k.cluster === cl) old = k; }); if (old && old.name) body.name = old.name;
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true; er.textContent = "";
    api("PUT", "/keywords", { json: body }).then(function (j) { S.kw = j.items || S.kw; S.kwSrc = "kv"; toast(T("اتحفظت المجموعة ", "Cluster saved: ") + cl); paintKw(panelEl()); }, function (e) { btn.disabled = false; er.textContent = errText(e); });
  };

  /* ---------- tab 5: redirects ---------- */
  RENDER.redirects = function (p) {
    p.innerHTML = card(esc(T("إضافة أو تعديل تحويل", "Add or edit a redirect")), '<p class="swk-hint">' + esc(T("تحويلات الإدارة بتتنفذ على الحافة قبل أي حاجة تانية، وأي سلسلة بتتجمع لخطوة واحدة. 301 = دائم، 302 = مؤقت، 410 = الصفحة اتشالت نهائياً.", "Admin redirects run at the edge before anything else, and chains are collapsed to one hop. 301 = permanent, 302 = temporary, 410 = the page is gone for good.")) + "</p>"
      + '<form data-form="rd" novalidate><div class="swk-grid2"><label class="swk-f"><span class="swk-lb">' + esc(T("من (مسار على الموقع)", "From (a path on the site)")) + '</span><textarea name="from" rows="1" dir="ltr" placeholder="/old-page/"></textarea></label><label class="swk-f"><span class="swk-lb">' + esc(T("إلى (مسار أو رابط على نفس الموقع)", "To (a path or URL on this site)")) + '</span><textarea name="to" rows="1" dir="ltr" placeholder="/factories/"></textarea></label></div>'
      + '<div class="swk-grid2"><label class="swk-f"><span class="swk-lb">' + esc(T("النوع", "Type")) + '</span><select name="code"><option value="301">301 · ' + esc(T("دائم", "permanent")) + '</option><option value="302">302 · ' + esc(T("مؤقت", "temporary")) + '</option><option value="410">410 · ' + esc(T("محذوفة نهائياً", "gone")) + '</option></select></label><label class="swk-f"><span class="swk-lb">' + esc(T("ملاحظة (اختياري)", "Note (optional)")) + '</span><textarea name="note" rows="1" dir="auto"></textarea></label></div>'
      + '<p class="swk-er" role="alert"></p><div class="swk-acts"><button class="btn btn-green btn-sm" type="submit"' + dis() + ">💾 " + esc(T("حفظ التحويل", "Save redirect")) + '</button></div><div id="swkRdMsg" aria-live="polite"></div></form>')
      + card(esc(T("اختبار رابط", "Test a URL")), '<form data-form="rdtest" class="swk-tools" novalidate><textarea name="url" rows="1" dir="ltr" aria-label="' + esc(T("الرابط أو المسار", "URL or path")) + '" placeholder="/about.html"></textarea><button class="btn btn-green btn-sm" type="submit"' + dis() + ">▶ " + esc(T("اختبر", "Test")) + '</button></form><div id="swkRdTest" aria-live="polite"></div><p class="swk-hint">' + esc(T("بيمشي ورا التحويلات خطوة خطوة (لحد 5) ويقولك لو فيه أكتر من خطوة.", "Follows the redirects hop by hop (up to 5) and warns when there is more than one hop.")) + "</p>")
      + '<section class="swk-card"><div class="swk-h"><h2>' + esc(T("تحويلات الإدارة", "Admin redirects")) + '</h2><span class="muted" id="swkRdCnt"></span></div><form data-form="rdq" class="swk-tools" role="search"><textarea name="q" rows="1" aria-label="' + esc(T("بحث في التحويلات", "Search redirects")) + '" placeholder="' + esc(T("دوّر في من/إلى/الملاحظة…", "Search from/to/note…")) + '"></textarea><button class="btn btn-line btn-sm" type="submit">' + esc(T("بحث", "Search")) + "</button></form>"
      + '<div id="swkRdList"></div><div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="rd-csv"' + dis() + ">⬇️ " + esc(T("تصدير CSV", "Export CSV")) + "</button>" + importBtn("redirects") + '</div><div class="swk-imp-r" id="swkImp-redirects" aria-live="polite"></div></section>';
    loadRedirects();
  };
  function loadRedirects(q) {
    var el = document.getElementById("swkRdList"); if (!el) return;
    if (q !== undefined) S.rdq = q;
    el.innerHTML = loadingHtml();
    api("GET", "/redirects" + (S.rdq ? "?q=" + encodeURIComponent(S.rdq) : "")).then(function (j) {
      if (S.tab !== "redirects") return;
      S.rd = j.admin || [];
      var cnt = document.getElementById("swkRdCnt"); if (cnt) cnt.textContent = T("الإدارة: ", "Admin: ") + nf(S.rd.length) + T(" · تحويلات البناء (قراءة فقط): ", " · build redirects (read-only): ") + nf(j.build_count || 0);
      el.innerHTML = S.rd.length ? '<div class="swk-tw"><table class="swk-t" style="min-width:760px"><thead><tr><th>' + esc(T("من", "From")) + "</th><th>" + esc(T("إلى", "To")) + "</th><th>" + esc(T("النوع", "Type")) + "</th><th>" + esc(T("ملاحظة", "Note")) + "</th><th>" + esc(T("آخر تعديل", "Updated")) + "</th><th></th></tr></thead><tbody>"
        + S.rd.map(function (r, i) { return "<tr><td><code>" + esc(r.from) + "</code></td><td>" + (r.code === 410 ? '<span class="swk-na">—</span>' : "<code>" + esc(r.to) + "</code>") + "</td><td>" + chip(String(r.code), r.code === 410 ? "red" : r.code === 302 ? "ov" : "grn") + '</td><td dir="auto">' + esc(r.note || "") + "</td><td><small>" + esc(fd(r.updated_at || r.created_at)) + "</small></td><td><span class=\"swk-acts\"><button type=\"button\" class=\"swk-lnk\" data-act=\"rd-test\" data-i=\"" + i + '">' + esc(T("اختبر", "Test")) + '</button><button type="button" class="swk-lnk" data-act="rd-edit" data-i="' + i + '"' + dis() + ">" + esc(T("تعديل", "Edit")) + '</button><button type="button" class="swk-lnk" style="color:var(--swk-bad)" data-act="rd-del" data-i="' + i + '"' + dis() + ">" + esc(T("حذف", "Delete")) + "</button></span></td></tr>"; }).join("") + "</tbody></table></div>"
        : '<p class="swk-msg info">' + esc(S.rdq ? T("مفيش تحويلات مطابقة.", "No matching redirects.") : T("مفيش تحويلات من الإدارة لسه. تحويلات البناء (الروابط القديمة ‎.html‎ ووردبريس) شغالة تلقائياً.", "No admin redirects yet. The build redirects (old .html and WordPress URLs) work automatically.")) + "</p>";
    }, function (e) { el.innerHTML = errBox(e); });
  }
  FORM.rdq = function (f) { loadRedirects(plain(f.elements.q.value)); };
  FORM.rd = function (f) {
    var er = f.querySelector(".swk-er"), out = document.getElementById("swkRdMsg"), from = plain(f.elements.from.value), to = plain(f.elements.to.value), code = +f.elements.code.value;
    er.textContent = ""; out.innerHTML = "";
    if (!from || (from.charAt(0) !== "/" && !/^https?:\/\//i.test(from))) { er.textContent = T("«من» لازم مسار يبدأ بـ /", "«From» must be a path starting with /"); return; }
    if (normPath(from) === "/") { er.textContent = T("مينفعش تحوّل الصفحة الرئيسية.", "The home page cannot be redirected."); return; }
    if (code !== 410 && (!to || (to.charAt(0) !== "/" && !/^https:\/\//i.test(to)) || to.indexOf("//") === 0)) { er.textContent = T("«إلى» لازم مسار يبدأ بـ / أو رابط https على نفس الموقع (أو اختار 410).", "«To» must be a path starting with / or an https URL on this site (or choose 410)."); return; }
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    api("POST", "/redirects", { json: { from: from, to: code === 410 ? "" : to, code: code, note: plain(f.elements.note.value) } }).then(function (j) {
      var ex = "";
      if (j.collapsed) ex += "<small>" + esc(T("السلسلة اتجمعت للهدف النهائي: ", "The chain was collapsed to the final target: ") + ((j.redirect && j.redirect.to) || "")) + "</small>";
      if (j.repointed && j.repointed.length) ex += "<small>" + esc(T("اتعدّلت تحويلات تانية كانت بتشاور على المسار ده: ", "Other redirects pointing at this path were re-pointed: ") + j.repointed.join("، ")) + "</small>";
      (j.warnings || []).forEach(function (w) { ex += "<small>⚠️ " + esc(w.msg || "") + "</small>"; });
      out.innerHTML = '<div class="swk-msg ok">' + esc(T("✅ اتحفظ التحويل ونُشر. بيشتغل ", "✅ Redirect saved and published. It works ") + soonTxt() + ".") + ex + "</div>";
      if (S.health) { S.health.bundle_v = j.bundle_v; S.health.bundle_at = new Date().toISOString(); paintStatus(); }
      f.reset(); loadRedirects(); refreshHealth();
    }, function (e) { er.textContent = errText(e); }).then(function () { btn.disabled = ro(); });
  };
  ACT["rd-edit"] = function (b) { var r = (S.rd || [])[+b.getAttribute("data-i")], f = document.querySelector('form[data-form="rd"]'); if (!r || !f) return; f.elements.from.value = r.from; f.elements.to.value = r.to || ""; f.elements.code.value = String(r.code); f.elements.note.value = r.note || ""; f.scrollIntoView({ behavior: "smooth", block: "center" }); try { f.elements.to.focus(); } catch (e) {} };
  ACT["rd-del"] = function (b) {
    var r = (S.rd || [])[+b.getAttribute("data-i")]; if (!r) return;
    if (!window.confirm(T("حذف التحويل من ", "Delete the redirect from ") + r.from + T("؟", "?"))) return;
    b.disabled = true;
    api("DELETE", "/redirects?from=" + encodeURIComponent(r.from)).then(function (j) { toast(j.removed ? T("اتحذف التحويل.", "Redirect deleted.") : T("التحويل مكانش موجود.", "The redirect did not exist.")); if (S.health) { S.health.bundle_v = j.bundle_v; paintStatus(); } loadRedirects(); refreshHealth(); }, function (e) { b.disabled = false; toast(errText(e), true); });
  };
  ACT["rd-test"] = function (b) { var r = (S.rd || [])[+b.getAttribute("data-i")], f = document.querySelector('form[data-form="rdtest"]'); if (!r || !f) return; f.elements.url.value = r.from; FORM.rdtest(f); f.scrollIntoView({ behavior: "smooth", block: "center" }); };
  ACT["rd-csv"] = function (b) { download("/export.csv?kind=redirects", "seo-redirects-" + day() + ".csv", b); };
  FORM.rdtest = function (f) {
    var v = plain(f.elements.url.value), out = document.getElementById("swkRdTest"); if (!v || !out) return;
    var u = /^https?:\/\//i.test(v) ? v : location.origin + (v.charAt(0) === "/" ? "" : "/") + encP(v);
    out.innerHTML = loadingHtml();
    api("GET", "/test?url=" + encodeURIComponent(u)).then(function (j) {
      var ch = j.chain || [];
      out.innerHTML = '<div class="swk-tw"><table class="swk-t"><thead><tr><th>#</th><th>URL</th><th>' + esc(T("الحالة", "Status")) + "</th><th>" + esc(T("بيحوّل لـ", "Location")) + "</th></tr></thead><tbody>"
        + ch.map(function (c, i) { var st = c.status == null ? (c.external ? T("خارجي", "external") : "—") : String(c.status); return '<tr><td class="swk-n">' + (i + 1) + "</td><td><code>" + esc(c.url) + '</code></td><td><span class="swk-n ' + (c.status >= 200 && c.status < 300 ? "g" : c.status >= 300 && c.status < 400 ? "a" : "r") + '">' + esc(st) + "</span></td><td><code>" + esc(c.location || c.error || "") + "</code></td></tr>"; }).join("") + "</tbody></table></div>"
        + '<p class="swk-msg ' + (j.hops > 1 ? "warn" : j.final_status >= 200 && j.final_status < 300 ? "ok" : j.final_status === 410 ? "info" : "bad") + '">' + esc(T("عدد الخطوات: ", "Hops: ") + j.hops + T(" · الحالة النهائية: ", " · final status: ") + j.final_status) + (j.hops > 1 ? "<small>" + esc(T("أكتر من خطوة تحويل: اجمع السلسلة (حوّل الرابط الأول للهدف النهائي مباشرة).", "More than one redirect hop: collapse the chain (point the first URL at the final target directly).")) + "</small>" : "") + "</p>";
    }, function (e) { out.innerHTML = errBox(e); });
  };

  /* ---------- tab 6: robots & sitemaps ---------- */
  var RB_RX = /^(User-agent|Allow|Disallow|Crawl-delay|Sitemap):\s?\S*$/i;
  /* same rules as disallowsAll / blockedAgents in functions/_lib/seo-api.js: a Disallow value that matches EVERY path
     («/», «/*», «*», «/*$», «/**» …: Google reads * as any characters and $ as the end) under ANY user agent */
  function disallowsAll(v) { return v === "/" || /^\/?\*+\$?$/.test(v); }
  function blockedAgents(lines) {
    var out = {}, uas = [], inRules = false;
    (Array.isArray(lines) ? lines : []).forEach(function (l) {
      var s = String(l == null ? "" : l).trim(), i = s.indexOf(":"); if (!s || i < 0) return;
      var k = s.slice(0, i).trim().toLowerCase(), v = s.slice(i + 1).trim();
      if (k === "user-agent") { if (inRules) { uas = []; inRules = false; } if (v) uas.push(v.toLowerCase()); }
      else if (k !== "sitemap") { inRules = true; if (k === "disallow" && disallowsAll(v)) uas.forEach(function (u) { out[u] = 1; }); }
    });
    return Object.keys(out).sort();
  }
  function agentsText(list) { return list.map(function (a) { return a === "*" ? T("كل محركات البحث والزواحف («User-agent: *»)", "every crawler («User-agent: *»)") : "«" + a + "»"; }).join("، "); }
  function checkRobots(text) {
    var errs = [], ua = [], inRules = false, lines = String(text || "").split(/\r?\n/);
    lines.forEach(function (l, i) {
      var s = l.trim(); if (!s) return;
      if (s.length > 200 || !RB_RX.test(s)) { errs.push(T("سطر ", "Line ") + (i + 1) + T(": الشكل لازم «User-agent|Allow|Disallow|Crawl-delay|Sitemap: القيمة» ومن غير #", ': use "User-agent|Allow|Disallow|Crawl-delay|Sitemap: value" without #')); return; }
      var k = s.slice(0, s.indexOf(":")).trim().toLowerCase(), v = s.slice(s.indexOf(":") + 1).trim();
      if (k === "user-agent") { if (inRules) { ua = []; inRules = false; } if (!v) errs.push(T("سطر ", "Line ") + (i + 1) + T(": User-agent محتاج قيمة", ": User-agent needs a value")); ua.push(v); }
      else if (k === "sitemap") { if (!/^https:\/\//i.test(v)) errs.push(T("سطر ", "Line ") + (i + 1) + T(": Sitemap محتاج رابط https كامل", ": Sitemap needs an absolute https URL")); }
      else { if (!ua.length) errs.push(T("سطر ", "Line ") + (i + 1) + T(": حط سطر «User-agent:» قبل القواعد", ': put a "User-agent:" line before the rules')); inRules = true; }
    });
    if (lines.length > 100) errs.push(T("لحد 100 سطر بس.", "At most 100 lines."));
    /* only agents NEWLY shut out of the whole site need a confirmation (and an admin): the API's rule */
    var blocked = blockedAgents(lines), before = blockedAgents((S.cfg && S.cfg.robots_extra) || []);
    return { errs: errs, blocked: blocked, added: blocked.filter(function (a) { return before.indexOf(a) < 0; }) };
  }
  function canBlockAll() { return !(S.cfg && S.cfg.can && S.cfg.can.block_all === false); }
  function blockConfirm(agents) { return window.confirm(T("⚠️ السطور دي بتمنع الموقع كله عن: ", "⚠️ These lines block the WHOLE site for: ") + agentsText(agents) + T(". كل محركات البحث المذكورة هتشيل صفحات الموقع من نتائجها. متأكد 100%؟", ". Those search engines will drop every page of the site from their results. Are you 100% sure?")); }
  function rbBlockedHtml() {
    var cur = (S.cfg && S.cfg.robots_blocked_agents) || blockedAgents((S.cfg && S.cfg.robots_extra) || []);
    return cur.length ? '<div class="swk-msg bad" role="note">⛔ ' + esc(T("السطور الإضافية المنشورة دلوقتي بتمنع الموقع كله عن: ", "The published extra lines currently block the whole site for: ") + agentsText(cur) + T(". لو ده مش مقصود امسحها واحفظ.", ". If that is not intended, remove them and save.")) + "</div>" : "";
  }
  RENDER.robots = function (p) {
    var ex = (S.cfg && S.cfg.robots_extra) || [];
    p.innerHTML = '<section class="swk-card"><div class="swk-h"><h2>robots.txt</h2><button class="btn btn-line btn-sm" type="button" data-act="robots-reload">↻ ' + esc(T("تحديث", "Reload")) + '</button></div><p class="swk-hint">' + esc(T("الملف الحي زي ما محركات البحث شايفاه (البناء + سطور الإدارة الإضافية).", "The live file as search engines see it (the build + the admin's extra lines).")) + '</p><pre class="swk-pre" id="swkRobots">…</pre></section>'
      + card(esc(T("سطور إضافية في robots.txt", "Extra robots.txt lines")), '<p class="swk-hint">' + esc(T("بتتضاف في آخر الملف على الحافة. الافتراضي بيسمح لكل محركات البحث وزواحف الذكاء الاصطناعي؛ ماتمنعش صفحة عليها noindex (لازم جوجل يزحف عليها عشان يشوف الـ noindex).", "Appended at the end of the file at the edge. The default allows every search engine and AI crawler; never block a page that carries noindex (Google must crawl it to see the noindex).")) + "</p>"
        + '<div id="swkRbBlk">' + rbBlockedHtml() + "</div>"
        + (canBlockAll() ? "" : '<p class="swk-hint">🔒 ' + esc(T("منع الموقع كله عن أي محرك بحث (Disallow: / أو /*) للمدير بس.", "Blocking the whole site for any crawler (Disallow: / or /*) is for an admin only.")) + "</p>")
        + '<form data-form="robots" novalidate><label class="swk-f"><span class="swk-lb">' + esc(T("السطور (واحد في كل سطر)", "Lines (one per line)")) + '</span><textarea name="lines" rows="6" class="mono" dir="ltr" spellcheck="false" placeholder="User-agent: ExampleBot&#10;Disallow: /private/"' + (ro() ? " readonly" : "") + "></textarea></label>"
        + '<p class="swk-er" role="alert"></p><div class="swk-acts"><button class="btn btn-green btn-sm" type="submit"' + dis() + ">💾 " + esc(T("حفظ ونشر", "Save & publish")) + '</button></div><div id="swkRbMsg" aria-live="polite"></div></form>')
      + '<section class="swk-card"><div class="swk-h"><h2>' + esc(T("خرائط الموقع", "Sitemaps")) + '</h2><button class="btn btn-line btn-sm" type="button" data-act="sm-reload">↻ ' + esc(T("عدّ تاني", "Count again")) + '</button></div><p class="swk-hint">' + esc(T("‎/sitemap.xml‎ فهرس لملفات فرعية؛ كل ملف لحد 10,000 رابط. العدد محسوب هنا في المتصفح من الملفات المنشورة.", "/sitemap.xml indexes child files of up to 10,000 URLs each. Counts are computed here in the browser from the deployed files.")) + '</p><div id="swkSm"></div></section>'
      + card(esc(T("إعادة بناء الموقع", "Rebuild the site")), '<p class="swk-hint">' + esc(T("خرائط الموقع وملف البناء والتعديلات المدمجة في الصفحات بتتحدث مع كل نشر جديد. التعديلات نفسها شغالة فوراً على الطبقة الطرفية من غير إعادة بناء.", "Sitemaps, the build manifest and the edits baked into pages refresh with every deploy. The edits themselves are live at the edge right away, without a rebuild.")) + '</p><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="rebuild"' + dis() + ">🔄 " + esc(T("إعادة بناء الموقع", "Rebuild the site")) + '</button></div><div id="swkRbd" aria-live="polite"></div>');
    var ta = p.querySelector('textarea[name="lines"]'); if (ta) ta.value = ex.join("\n");
    loadRobots(); loadSitemaps();
  };
  function loadRobots() {
    var el = document.getElementById("swkRobots"); if (!el) return; el.textContent = "…";
    fetch("/robots.txt", { cache: "no-store", credentials: "same-origin" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.text(); }).then(function (t) { el.textContent = t; }, function (e) { el.textContent = T("تعذّر جلب ‎/robots.txt‎ (HTTP ", "Could not fetch /robots.txt (HTTP ") + ((e && e.status) || 0) + ")"; });
  }
  ACT["robots-reload"] = function () { loadRobots(); };
  FORM.robots = function (f, ev, confirmed) {
    var er = f.querySelector(".swk-er"), out = document.getElementById("swkRbMsg"), text = String(f.elements.lines.value || ""), c = checkRobots(text);
    er.textContent = ""; out.innerHTML = "";
    if (c.errs.length) { er.innerHTML = c.errs.map(esc).join("<br>"); return; }
    if (c.added.length && !canBlockAll()) { er.textContent = T("منع الموقع كله عن ", "Blocking the whole site for ") + agentsText(c.added) + T(" للمدير بس. اطلب من المدير لو ده مقصود.", " is for an admin only. Ask the admin if this is intended."); return; }
    if (c.added.length && !confirmed && !blockConfirm(c.added)) return;
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    api("PUT", "/config", { json: { robots_extra: lines, confirm_block_all: !!(c.added.length || confirmed) } }).then(function (j) {
      out.innerHTML = '<div class="swk-msg ok">' + esc(j.changed === false ? T("مفيش تغيير.", "Nothing changed.") : T("✅ اتحفظ ونُشر. robots.txt بيتحدث ", "✅ Saved and published. robots.txt updates ") + soonTxt() + ".") + "</div>";
      if (S.cfg) { S.cfg.robots_extra = lines; S.cfg.robots_blocked_agents = blockedAgents(lines); }
      var bk = document.getElementById("swkRbBlk"); if (bk) bk.innerHTML = rbBlockedHtml();
      if (S.health && j.bundle_v) { S.health.bundle_v = j.bundle_v; paintStatus(); }
      api("GET", "/config").then(function (cc) { S.cfg = cc; var b2 = document.getElementById("swkRbBlk"); if (b2) b2.innerHTML = rbBlockedHtml(); }, function () {});
      setTimeout(loadRobots, 1500);
    }, function (e) {
      /* the API found a whole-site block the check above did not: confirm with ITS list of agents, then send again */
      var ag = (e.errors || []).reduce(function (a, x) { return x && x.code === "confirm_block_all" && Array.isArray(x.agents) ? a.concat(x.agents) : a; }, []);
      if (e.code === "confirm_block_all" && !confirmed && canBlockAll() && blockConfirm(ag.length ? ag : ["*"])) { btn.disabled = false; FORM.robots(f, ev, true); return; }
      er.textContent = errText(e);
    }).then(function () { btn.disabled = ro(); });
  };
  function loadSitemaps() {
    var el = document.getElementById("swkSm"); if (!el) return;
    el.innerHTML = loadingHtml();
    var parse = function (t) { return new DOMParser().parseFromString(t, "application/xml"); };
    var txt = function (n, sel) { var x = n.getElementsByTagName(sel)[0]; return x ? String(x.textContent || "").trim() : ""; };
    var pathOf = function (loc) { try { return new URL(loc, location.href).pathname; } catch (e) { return loc; } };
    fetch("/sitemap.xml", { cache: "no-store" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.text(); }).then(function (t) {
      var d = parse(t);
      if (d.getElementsByTagName("parsererror").length) throw { bad: true };
      var maps = [].slice.call(d.getElementsByTagName("sitemap")).map(function (n) { return { loc: txt(n, "loc"), lastmod: txt(n, "lastmod"), n: null, newest: "" }; });
      if (!maps.length) { var urls = d.getElementsByTagName("url"); maps = [{ loc: "/sitemap.xml", lastmod: "", n: urls.length, newest: [].slice.call(urls).reduce(function (a, u) { var m = txt(u, "lastmod"); return m > a ? m : a; }, "") }]; }
      S.sm = maps; paintSm();
      var q = maps.filter(function (m) { return m.n == null; });
      function next() {
        if (!q.length) return; var m = q.shift();
        fetch(pathOf(m.loc), { cache: "no-store" }).then(function (r) { if (!r.ok) throw { status: r.status }; return r.text(); }).then(function (t2) {
          var dd = parse(t2), us = dd.getElementsByTagName("url"); m.n = us.length; m.newest = [].slice.call(us).reduce(function (a, u) { var x = txt(u, "lastmod"); return x > a ? x : a; }, ""); m.bad = !!dd.getElementsByTagName("parsererror").length;
        }, function (e) { m.n = -1; m.err = (e && e.status) || 0; }).then(function () { paintSm(); next(); });
      }
      for (var i = 0; i < 4; i++) next();
    }, function (e) { el.innerHTML = '<p class="swk-msg bad">' + esc(e && e.bad ? T("‎/sitemap.xml‎ مش XML صالح.", "/sitemap.xml is not valid XML.") : T("تعذّر جلب ‎/sitemap.xml‎ (HTTP ", "Could not fetch /sitemap.xml (HTTP ") + ((e && e.status) || 0) + ")") + "</p>"; });
  }
  function paintSm() {
    var el = document.getElementById("swkSm"), maps = S.sm || []; if (!el) return;
    var tot = 0, done = 0, newest = "";
    maps.forEach(function (m) { if (m.n != null) { done++; if (m.n > 0) tot += m.n; } var x = m.newest || m.lastmod; if (x > newest) newest = x; });
    el.innerHTML = '<div class="swk-kpis"><div class="swk-kpi hl"><b>' + nf(tot) + "</b><span>" + esc(T("رابط في خرائط الموقع", "URLs in the sitemaps") + (done < maps.length ? T(" (بنعدّ… ", " (counting… ") + done + "/" + maps.length + ")" : "")) + '</span></div><div class="swk-kpi"><b>' + nf(maps.length) + "</b><span>" + esc(T("ملف فرعي", "Child files")) + '</span></div><div class="swk-kpi"><b style="font-size:1rem">' + esc(fd(newest, false)) + "</b><span>" + esc(T("أحدث lastmod", "Newest lastmod")) + "</span></div></div>"
      + '<div class="swk-tw"><table class="swk-t"><thead><tr><th>' + esc(T("الملف", "File")) + "</th><th>" + esc(T("روابط", "URLs")) + "</th><th>" + esc(T("أحدث lastmod", "Newest lastmod")) + "</th></tr></thead><tbody>"
      + maps.map(function (m) { var p; try { p = new URL(m.loc, location.href).pathname; } catch (e) { p = m.loc; } return '<tr><td><a href="' + esc(p) + '" target="_blank" rel="noopener"><code>' + esc(p) + '</code></a></td><td class="swk-n">' + (m.n == null ? "…" : m.n < 0 ? '<span class="swk-no">HTTP ' + esc(m.err) + "</span>" : nf(m.n) + (m.n > 10000 ? ' <span class="swk-no">&gt;10,000</span>' : "") + (m.bad ? ' <span class="swk-no">XML ✗</span>' : "")) + "</td><td>" + esc(fd(m.newest || m.lastmod, false)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  ACT["sm-reload"] = function () { loadSitemaps(); };
  ACT.rebuild = function (b) {
    var out = document.getElementById("swkRbd"); b.disabled = true; out.innerHTML = loadingHtml();
    api("POST", "/rebuild", { json: {} }).then(function (j) {
      out.innerHTML = j.ok ? '<p class="swk-msg ok">' + esc(T("✅ اتطلب بناء جديد الساعة ", "✅ A new build was requested at ") + fd(j.triggered_at) + T(". النشر بياخد كام دقيقة.", ". Deploying takes a few minutes.")) + "</p>"
        : '<p class="swk-msg info">' + esc(j.reason === "deploy_hook_not_configured" ? T("التعديلات شغالة فوراً على الطبقة الطرفية؛ خرائط الموقع تتحدث مع النشر القادم.", "Edits are live at the edge right away; the sitemaps refresh with the next deploy.") : T("ماقدرناش نطلب البناء: ", "Could not request the build: ") + (j.reason || "")) + (j.reason === "deploy_hook_not_configured" ? "<small>" + esc(T("(زر إعادة البناء محتاج سر PAGES_DEPLOY_HOOK في مشروع Pages.)", "(The rebuild button needs the PAGES_DEPLOY_HOOK secret in the Pages project.)")) + "</small>" : "") + "</p>";
    }, function (e) { out.innerHTML = errBox(e); }).then(function () { b.disabled = ro(); });
  };

  /* ---------- tab 7: verification & search engines ---------- */
  var ENGINES = [["google", "Google Search Console", "google-site-verification", "https://search.google.com/search-console"], ["bing", "Bing Webmaster Tools", "msvalidate.01", "https://www.bing.com/webmasters"], ["yandex", "Yandex Webmaster", "yandex-verification", "https://webmaster.yandex.com"]];
  /* verification tokens make their holder an OWNER of the site in Search Console (incl. the Removals tool): admin only */
  function canVerify() { return !(S.cfg && S.cfg.can && S.cfg.can.verify === false); }
  RENDER.verify = function (p) {
    var v = (S.cfg && S.cfg.verify) || {}, vro = ro() || !canVerify(), vdis = vro ? " disabled" : "";
    p.innerHTML = card(esc(T("وسوم التحقق", "Verification meta tags")), '<p class="swk-note">💡 ' + esc(T("الأفضل في Google Search Console: خاصية «النطاق» (Domain) لـ madeinegyptgate.com بالتحقق عن طريق DNS في Cloudflare (سجل TXT). الوسوم هنا مفيدة لخاصية «بادئة URL» ولـ Bing وYandex. Bing كمان يقدر يستورد الموقع من Search Console مباشرة.", "Best in Google Search Console: a «Domain» property for madeinegyptgate.com verified by DNS in Cloudflare (a TXT record). The tags here help for a «URL prefix» property and for Bing and Yandex. Bing can also import the site straight from Search Console.")) + "</p>"
      + '<form data-form="verify" novalidate>' + ENGINES.map(function (e) { return '<label class="swk-f"><span class="swk-lb"><span>' + esc(e[1]) + '</span><a class="swk-hint" href="' + e[3] + '" target="_blank" rel="noopener">' + esc(T("افتح", "Open")) + ' ↗</a></span><input type="text" name="' + e[0] + '" dir="ltr" spellcheck="false" autocomplete="off" value="' + esc(v[e[0]] || "") + '"' + (vro ? " readonly" : "") + '><span class="swk-hint">' + esc(T("الصق قيمة content بس من: ", "Paste only the content value of: ")) + '<code>&lt;meta name="' + e[2] + '" content="<b>…</b>"&gt;</code>' + esc(T(" (أو الوسم كله وهنطلع القيمة). فاضي = يتشال.", " (or the whole tag and we extract it). Empty = removed.")) + "</span></label>"; }).join("")
      + (canVerify() || S.mode !== "ready" ? "" : '<p class="swk-msg info">🔒 ' + esc(T("تغيير وسوم التحقق للمدير بس: الوسم بيدّي صاحبه ملكية الموقع في Search Console (وفيها أداة إزالة الصفحات من البحث). تقدر تشوف الوسوم وتفحص الصفحة الرئيسية.", "Changing verification tags is for an admin only: a tag makes its holder an owner of the site in Search Console (including the tool that removes pages from search). You can still see the tags and check the home page.")) + "</p>")
      + '<p class="swk-er" role="alert"></p><div class="swk-acts"><button class="btn btn-green btn-sm" type="submit"' + vdis + ">💾 " + esc(T("حفظ ونشر", "Save & publish")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="verify-check">🔎 ' + esc(T("افحص الصفحة الرئيسية", "Check the home page")) + '</button></div><div id="swkVfMsg" aria-live="polite"></div><p class="swk-hint">' + esc(T("الوسوم دي بتظهر في الصفحة الرئيسية «/» بس، على الطبقة الطرفية.", "These tags appear on the home page «/» only, at the edge.")) + "</p></form>")
      + '<section class="swk-card"><h2>IndexNow</h2><p class="swk-hint">' + esc(T("بيبلّغ Bing وYandex وSeznam وNaver بالصفحات الجديدة أو المعدّلة أول ما تتحفظ؛ إمتى يزحفوا عليها ويفهرسوها ده قرارهم. جوجل مش بيستخدم IndexNow؛ بيعتمد على خرائط الموقع وSearch Console. الحد: 20 إرسال في اليوم.", "Notifies Bing, Yandex, Seznam and Naver about new or changed pages as soon as they are saved; when they crawl and index them is up to them. Google does not use IndexNow; it relies on sitemaps and Search Console. Limit: 20 submissions a day.")) + '</p><div id="swkInxKey"></div>'
      + '<div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="inx-since"' + dis() + ">📣 " + esc(T("الصفحات المعدّلة منذ آخر إرسال", "Pages changed since the last send")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="inx-all"' + dis() + ">📣 " + esc(T("كل خريطة الموقع (حتى 10,000)", "The whole sitemap (up to 10,000)")) + "</button></div>"
      + '<form data-form="inxurl" class="swk-tools" novalidate><textarea name="url" rows="1" dir="ltr" aria-label="' + esc(T("رابط محدد", "A specific URL")) + '" placeholder="/factories/"></textarea><button class="btn btn-green btn-sm" type="submit"' + dis() + ">📣 " + esc(T("رابط محدد", "A specific URL")) + "</button></form>"
      + '<h3>' + esc(T("سجل الإرسال", "Send log")) + '</h3><div id="swkInxLog"></div></section>';
    paintInxKey(); loadInxLog();
  };
  function paintInxKey(extra) {
    var el = document.getElementById("swkInxKey"); if (!el) return;
    var c = S.cfg || {}, key = c.indexnow_key || "";
    el.innerHTML = key ? '<div class="swk-msg ok">✓ ' + esc(T("مفتاح IndexNow متضبوط: ", "IndexNow key is set: ")) + '<code dir="ltr">' + esc(key) + '</code><small dir="ltr">' + esc(c.indexnow_key_url || (site() + "/" + key + ".txt")) + '</small></div><div class="swk-acts"><button class="btn btn-line btn-sm" type="button" data-act="inx-check">🔎 ' + esc(T("افحص ملف المفتاح", "Check the key file")) + '</button><button class="btn btn-line btn-sm" type="button" data-act="inx-key"' + dis() + ">🔑 " + esc(T("مفتاح جديد", "New key")) + "</button></div>" + (extra || "")
      : '<div class="swk-msg warn">' + esc(T("مفيش مفتاح IndexNow لسه.", "No IndexNow key yet.")) + '</div><div class="swk-acts"><button class="btn btn-green btn-sm" type="button" data-act="inx-key"' + dis() + ">🔑 " + esc(T("توليد مفتاح", "Generate a key")) + "</button></div>" + (extra || "");
  }
  ACT["inx-key"] = function (b) {
    if ((S.cfg || {}).indexnow_key && !window.confirm(T("المفتاح الجديد هيلغي القديم. تكمّل؟", "The new key replaces the old one. Continue?"))) return;
    b.disabled = true;
    api("POST", "/indexnow/key", { json: {} }).then(function (j) {
      S.cfg = extend(S.cfg || {}, { indexnow_key: j.key, indexnow_key_set: true, indexnow_key_url: j.key_url });
      if (S.health && j.bundle_v) { S.health.bundle_v = j.bundle_v; paintStatus(); }
      paintInxKey('<p class="swk-hint">' + esc(T("ملف المفتاح بيشتغل على الحافة ", "The key file goes live at the edge ") + soonTxt() + T("، وبعدها افحصه.", "; check it after that.")) + "</p>");
    }, function (e) { b.disabled = false; toast(errText(e), true); });
  };
  ACT["inx-check"] = function (b) {
    var key = (S.cfg || {}).indexnow_key; if (!key) return;
    b.disabled = true;
    fetch("/" + key + ".txt", { cache: "no-store" }).then(function (r) { return r.text().then(function (t) { return { ok: r.ok, t: t.trim(), st: r.status }; }); }).then(function (x) {
      paintInxKey(x.ok && x.t === key ? '<p class="swk-msg ok">✓ ' + esc(T("ملف المفتاح شغال وبيرجّع المفتاح الصح.", "The key file works and returns the right key.")) + "</p>" : '<p class="swk-msg bad">✗ ' + esc(T("ملف المفتاح مش شغال لسه (HTTP " + x.st + "). استنى دقيقة وجرّب تاني.", "The key file is not live yet (HTTP " + x.st + "). Wait a minute and try again.")) + "</p>");
    }, function () { paintInxKey('<p class="swk-msg bad">' + esc(T("تعذّر الفحص.", "Could not check.")) + "</p>"); });
  };
  function loadInxLog() {
    var el = document.getElementById("swkInxLog"); if (!el) return;
    el.innerHTML = loadingHtml();
    api("GET", "/indexnow/log").then(function (j) {
      S.inxLog = j.items || [];
      el.innerHTML = S.inxLog.length ? '<div class="swk-tw"><table class="swk-t"><thead><tr><th>' + esc(T("الوقت", "Time")) + "</th><th>" + esc(T("بواسطة", "By")) + "</th><th>" + esc(T("المصدر", "Source")) + "</th><th>" + esc(T("روابط", "URLs")) + "</th><th>" + esc(T("الرد", "Answer")) + "</th></tr></thead><tbody>"
        + S.inxLog.slice(0, 50).map(function (x) { return "<tr><td><small>" + esc(fd(x.at)) + '</small></td><td dir="ltr"><small>' + esc(x.by_email || x.by || "") + "</small></td><td>" + esc(x.source || "") + '</td><td class="swk-n">' + nf(x.count) + '</td><td><span class="swk-n ' + (x.ok ? "g" : "r") + '">' + esc(x.status || "—") + "</span> <small>" + esc(x.message || "") + "</small></td></tr>"; }).join("") + "</tbody></table></div>"
        : '<p class="muted">' + esc(T("مفيش إرسال لسه.", "Nothing sent yet.")) + "</p>";
    }, function (e) { el.innerHTML = errBox(e); });
  }
  ACT["inx-since"] = function (b) {
    var last = null; (S.inxLog || []).some(function (x) { if (x.ok) { last = x.at; return true; } return false; });
    if (!last) { toast(T("مفيش إرسال ناجح قبل كده؛ استخدم «كل خريطة الموقع» أول مرة.", "No successful send yet; use «The whole sitemap» the first time."), true); return; }
    if (!window.confirm(T("هنبعت الصفحات اللي اتعدّلت أو اتغيّر تاريخها في البناء من آخر إرسال ناجح (" + fd(last) + "). الصفحات اللي اتبعتت قبل كده بنفس حالتها مش هتتبعت تاني. تكمّل؟", "Send the pages edited, or re-dated by a build, since the last successful send (" + fd(last) + "). Pages already sent in their current state are skipped. Continue?"))) return;
    sendIndexNow({ since: last }, b, function (j, e) {
      /* nothing new: the API skipped pages it already sent in exactly this state (its ledger); offer a deliberate resend */
      if (e && e.code === "no_urls" && e.j && e.j.skipped && window.confirm(T("مفيش جديد من آخر إرسال: " + nf(e.j.skipped) + " صفحة اتبعتت قبل كده بنفس حالتها. تبعتهم تاني؟ (بيتحسب من حد الـ 20 إرسال في اليوم)", "Nothing new since the last send: " + nf(e.j.skipped) + " pages were already sent in their current state. Send them again? (counts toward the 20 sends a day)"))) { sendIndexNow({ since: last, resend: true }, b, function () { loadInxLog(); }); return; }
      loadInxLog();
    });
  };
  ACT["inx-all"] = function (b) { if (!window.confirm(T("هنبعت كل صفحات خريطة الموقع المفهرسة (حتى 10,000). ده بيتعمل مرة بعد الإطلاق. تكمّل؟", "Send every indexable sitemap page (up to 10,000)? Do this once after launch. Continue?"))) return; sendIndexNow({ all: true }, b, function () { loadInxLog(); }); };
  FORM.inxurl = function (f) {
    var v = plain(f.elements.url.value); if (!v) return;
    var u = /^https?:\/\//i.test(v) ? v : absUrl(normPath(v));
    sendIndexNow({ urls: [u] }, f.querySelector('button[type="submit"]'), function (j) { if (j && j.ok) f.reset(); loadInxLog(); });
  };
  function cleanToken(s) { s = String(s || "").trim(); var m = /content\s*=\s*["']([^"']+)["']/i.exec(s); if (m) s = m[1].trim(); return s.replace(/^(google-site-verification|msvalidate\.01|yandex-verification)\s*[=:]\s*/i, ""); }
  FORM.verify = function (f) {
    var er = f.querySelector(".swk-er"), out = document.getElementById("swkVfMsg"), v = {}, bad = [];
    er.textContent = ""; out.innerHTML = "";
    if (ro() || !canVerify()) { er.textContent = ro() ? roText() : errText({ code: "admin_only", error: "verification" }); return; }
    ENGINES.forEach(function (e) { var t = cleanToken(f.elements[e[0]].value); f.elements[e[0]].value = t; if (t && !/^[A-Za-z0-9_\-:.]{8,120}$/.test(t)) bad.push(e[1]); v[e[0]] = t; });
    if (bad.length) { er.textContent = T("قيمة غير صالحة في: ", "Invalid value in: ") + bad.join("، ") + T(" — الصق قيمة content بس (8–120 حرف: حروف وأرقام و _ - : .)", " — paste only the content value (8–120 characters: letters, digits, _ - : .)"); return; }
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    api("PUT", "/config", { json: { verify: v } }).then(function (j) {
      out.innerHTML = '<div class="swk-msg ok">' + esc(j.changed === false ? T("مفيش تغيير.", "Nothing changed.") : T("✅ اتحفظ ونُشر. الوسوم بتظهر في الصفحة الرئيسية ", "✅ Saved and published. The tags appear on the home page ") + soonTxt() + T("، وبعدها اضغط «تحقق» في أداة المحرك.", "; then press «Verify» in the engine's tool.")) + "</div>";
      if (S.health && j.bundle_v) { S.health.bundle_v = j.bundle_v; paintStatus(); }
      api("GET", "/config").then(function (c) { S.cfg = c; }, function () {});
    }, function (e) { er.textContent = errText(e); }).then(function () { btn.disabled = ro() || !canVerify(); });
  };
  ACT["verify-check"] = function (b) {
    var out = document.getElementById("swkVfMsg"); b.disabled = true; out.innerHTML = loadingHtml();
    fetch("/", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (t) {
      var d = new DOMParser().parseFromString(t, "text/html");
      out.innerHTML = '<ul class="swk-chk-l">' + ENGINES.map(function (e) { var m = d.querySelector('meta[name="' + e[2] + '"]'), want = ((S.cfg || {}).verify || {})[e[0]]; return "<li><span>" + esc(e[1]) + "</span>" + (m ? '<span class="swk-ok">✓ <code>' + esc(m.getAttribute("content") || "") + "</code></span>" : want ? '<span class="swk-no">' + esc(T("لسه مش ظاهر (استنى دقيقة)", "not visible yet (wait a minute)")) + "</span>" : '<span class="swk-na">' + esc(T("مش متضبوط", "not set")) + "</span>") + "</li>"; }).join("") + "</ul>";
    }, function () { out.innerHTML = '<p class="swk-msg bad">' + esc(T("تعذّر جلب الصفحة الرئيسية.", "Could not fetch the home page.")) + "</p>"; }).then(function () { b.disabled = false; });
  };

  /* ---------- tab 8: search ranking (honest) ---------- */
  RENDER.rank = function (p) {
    p.innerHTML = '<section class="swk-card"><h2>' + esc(T("ترتيب البحث", "Search ranking")) + '</h2><p class="swk-note">' + esc(T("لا نعرض ترتيباً تقديرياً. الترتيب الحقيقي ونقرات البحث تأتي فقط من Google Search Console وBing Webmaster Tools بعد ربطهما. لا أحد يضمن المركز الأول؛ نحن نحسّن كل ما نتحكم فيه.", "We never show an estimated rank. Real positions and search clicks only come from Google Search Console and Bing Webmaster Tools once they are connected. Nobody can guarantee the #1 spot; we improve everything we control.")) + "</p>"
      + '<div class="swk-tw"><table class="swk-t"><tbody><tr><th>Google Search Console API</th><td><span class="swk-c red">' + esc(T("غير متصل", "Not connected")) + "</span></td><td><small>" + esc(T("المرحلة 2: حساب خدمة (GSC_SA_JSON كسر في الـ Worker) يتضاف كمستخدم «مقيّد» في Search Console، وتحديث يومي تلقائي.", "Phase 2: a service account (GSC_SA_JSON as a Worker secret) added as a «Restricted» user in Search Console, with a daily automatic refresh.")) + "</small></td></tr>"
      + '<tr><th>Bing Webmaster API</th><td><span class="swk-c red">' + esc(T("غير متصل", "Not connected")) + "</span></td><td><small>" + esc(T("المرحلة 2: مفتاح API من Bing Webmaster (BING_WMT_KEY).", "Phase 2: an API key from Bing Webmaster (BING_WMT_KEY).")) + "</small></td></tr></tbody></table></div></section>"
      + card(esc(T("رفع تقرير الأداء من Search Console (CSV)", "Upload the Search Console performance report (CSV)")), '<ol class="swk-hint" style="margin:0;padding-inline-start:18px"><li>' + esc(T("Search Console ← الأداء ← نتائج البحث ← تصدير ← تنزيل CSV (بينزل ملف مضغوط).", "Search Console → Performance → Search results → Export → Download CSV (a zip file).")) + "</li><li>" + esc(T("فك الضغط وارفع «Pages.csv» (الصفحات) أو «Queries.csv» (طلبات البحث). كل رفع بيستبدل اللي قبله من نفس النوع.", "Unzip it and upload «Pages.csv» or «Queries.csv». Each upload replaces the previous one of the same kind.")) + "</li></ol>"
        + '<div class="swk-acts"><label class="btn btn-green btn-sm swk-file' + (ro() ? '" aria-disabled="true' : "") + '">📤 ' + esc(T("ارفع ملف CSV", "Upload a CSV file")) + '<input type="file" accept=".csv,text/csv" data-gsc="1"' + dis() + '></label></div><div id="swkGscUp" aria-live="polite"></div>')
      + '<section class="swk-card"><div class="swk-h"><h2>' + esc(T("بيانات Search Console المرفوعة", "Uploaded Search Console data")) + '</h2><span class="muted" id="swkGscSrc"></span></div><div id="swkGsc"></div></section>';
    ensureKw(); loadGsc();
  };
  function loadGsc() {
    var el = document.getElementById("swkGsc"); if (!el) return; el.innerHTML = loadingHtml();
    Promise.all([api("GET", "/gsc"), ensureKw()]).then(function (r) {
      var j = r[0], src = document.getElementById("swkGscSrc"), im = j.imported || {};
      if (src) src.textContent = j.source === "csv" ? T("المصدر: ملف CSV مرفوع", "Source: uploaded CSV") : T("لسه مفيش بيانات", "No data yet");
      var rows = j.rows || [], pages = rows.filter(function (x) { return x.kind === "page"; }), qs = rows.filter(function (x) { return x.kind === "query"; });
      var by = function (a, b) { return (b.clicks || 0) - (a.clicks || 0) || (b.impressions || 0) - (a.impressions || 0); };
      pages.sort(by); qs.sort(by);
      var kws = S.kw || [];
      var clusterFor = function (q) { var n = normAr(q), i, k; for (i = 0; i < kws.length; i++) { k = kws[i]; var t = normAr(k.target_kw); if (t && (n.indexOf(t) >= 0 || t.indexOf(n) >= 0)) return k; } for (i = 0; i < kws.length; i++) { k = kws[i]; if ((k.secondary_kw || []).some(function (s) { var t2 = normAr(s); return t2 && (n.indexOf(t2) >= 0 || t2.indexOf(n) >= 0); })) return k; } return null; };
      var pct = function (x) { x = +x || 0; return (x <= 1 ? x * 100 : x).toFixed(1) + "%"; };
      var head = function (first) { return "<thead><tr><th>" + first + "</th><th>" + esc(T("نقرات", "Clicks")) + "</th><th>" + esc(T("مرات الظهور", "Impressions")) + "</th><th>CTR</th><th>" + esc(T("متوسط الموضع", "Avg. position")) + "</th><th></th></tr></thead>"; };
      var nums = function (x) { return '<td class="swk-n">' + nf(x.clicks) + '</td><td class="swk-n">' + nf(x.impressions) + '</td><td class="swk-n">' + pct(x.ctr) + '</td><td class="swk-n">' + (+x.position || 0).toFixed(1) + "</td>"; };
      el.innerHTML = (!rows.length ? '<p class="swk-msg info">' + esc(T("لسه مفيش بيانات. ارفع تقرير الأداء من Search Console فوق.", "No data yet. Upload the Search Console performance report above.")) + "</p>" : "")
        + (pages.length ? "<h3>" + esc(T("الصفحات", "Pages")) + " <small class=\"muted\">" + esc(im.pages ? fd(im.pages.at) + " · " + nf(im.pages.rows) : "") + '</small></h3><div class="swk-tw"><table class="swk-t" style="min-width:680px">' + head(esc(T("الصفحة", "Page"))) + "<tbody>" + pages.slice(0, 300).map(function (x) { return "<tr><td><code>" + esc(x.path || x.page) + "</code></td>" + nums(x) + '<td><button type="button" class="swk-lnk" data-act="edit" data-path="' + esc(x.path || normPath(x.page)) + '">✎ ' + esc(T("المحرر", "Editor")) + "</button></td></tr>"; }).join("") + "</tbody></table></div>" : "")
        + (qs.length ? "<h3>" + esc(T("طلبات البحث", "Queries")) + " <small class=\"muted\">" + esc(im.queries ? fd(im.queries.at) + " · " + nf(im.queries.rows) : "") + '</small></h3><div class="swk-tw"><table class="swk-t" style="min-width:680px">' + head(esc(T("طلب البحث", "Query"))) + "<tbody>" + qs.slice(0, 300).map(function (x) { var k = clusterFor(x.query); return '<tr><td dir="auto">' + esc(x.query) + "</td>" + nums(x) + "<td>" + (k ? chip(T("مجموعة ", "Cluster ") + k.cluster, "ov") : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "");
    }, function (e) { el.innerHTML = errBox(e); });
  }
  function gscUpload(input) {
    var file = input.files && input.files[0], out = document.getElementById("swkGscUp"); if (!file || !out) return;
    if (file.size > 5 * 1024 * 1024) { out.innerHTML = '<p class="swk-msg bad">' + esc(T("الملف أكبر من 5 ميجا.", "The file is larger than 5 MB.")) + "</p>"; input.value = ""; return; }
    var rd = new FileReader();
    rd.onload = function () {
      input.value = ""; out.innerHTML = loadingHtml(T("بنرفع…", "Uploading…"));
      api("POST", "/gsc/import", { text: String(rd.result || "") }).then(function (j) { out.innerHTML = '<p class="swk-msg ok">' + esc(T("✅ اترفع: ", "✅ Uploaded: ") + nf(j.rows) + (j.kind === "pages" ? T(" صفحة", " pages") : T(" طلب بحث", " queries"))) + "</p>"; loadGsc(); }, function (e) { out.innerHTML = e.code === "gsc_format" ? '<p class="swk-msg bad">' + esc(T("ده مش تقرير أداء من Search Console (ملف Pages.csv أو Queries.csv).", "This is not a Search Console performance export (Pages.csv or Queries.csv).")) + "</p>" : errBox(e); });
    };
    rd.readAsText(file, "utf-8");
  }

  /* ---------- events ---------- */
  function inApp(t) { return !!(t && t.closest && (t.closest("#swkRoot") || t.closest(".swk-ov"))); }
  document.addEventListener("click", function (e) {
    var t = e.target; if (!inApp(t)) return;
    if (S.drawer && t.classList && t.classList.contains("swk-ov")) { closeEditor(false); return; }
    var tab = t.closest("[data-tab]"); if (tab) { go(tab.getAttribute("data-tab")); return; }
    var a = t.closest("[data-act]");
    if (a) { if (a.disabled) return; var fn = ACT[a.getAttribute("data-act")]; if (fn) { e.preventDefault(); fn(a, e); } return; }
    if (t.closest("input,a,button,label,select,textarea")) return;
    var row = t.closest("tr.row[data-path]"); if (row) openEditor(row.getAttribute("data-path"));
  });
  document.addEventListener("submit", function (e) { var f = e.target; if (!inApp(f)) return; var k = f.getAttribute("data-form"); if (k && FORM[k]) { e.preventDefault(); FORM[k](f, e); } });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!inApp(t)) return;
    if (t.hasAttribute("data-selp")) { var path = t.getAttribute("data-selp"), it = null; ((S.list && S.list.items) || []).forEach(function (x) { if (x.path === path) it = x; }); if (t.checked && it) S.sel[path] = it; else delete S.sel[path]; paintBulk(); var all = appEl.querySelector("[data-selall]"); if (all) all.checked = ((S.list && S.list.items) || []).every(function (x) { return S.sel[x.path]; }); return; }
    if (t.hasAttribute("data-selall")) { ((S.list && S.list.items) || []).forEach(function (x) { if (t.checked) S.sel[x.path] = x; else delete S.sel[x.path]; }); paintPages(); return; }
    if (t.hasAttribute("data-psize")) { S.f.limit = +t.value || 100; S.f.offset = 0; loadPages(); return; }
    if (t.hasAttribute("data-imp")) { importFile(t); return; }
    if (t.hasAttribute("data-gsc")) { gscUpload(t); return; }
    if (t.getAttribute("data-fld") === "robots" && S.drawer) { S.drawer.form.robots = t.value; paintAll(); return; }
    var pf = t.closest('form[data-form="pages"]'); if (pf && t.tagName === "SELECT") FORM.pages(pf);
    if (pf && t.type === "checkbox") FORM.pages(pf);
  });
  var inpT = 0;
  document.addEventListener("input", function (e) {
    var t = e.target; if (!inApp(t)) return;
    var k = t.getAttribute("data-fld");
    if (k && S.drawer) { S.drawer.form[k] = t.value; fieldErr(k, ""); clearTimeout(inpT); inpT = setTimeout(paintAll, 120); return; }
    var pf = t.closest('form[data-form="pages"]');
    if (pf && t.name === "q" && /\n/.test(t.value)) { t.value = t.value.replace(/\n/g, " "); FORM.pages(pf); }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (S.drawer && e.key === "Escape") { e.preventDefault(); closeEditor(false); return; }
    if (S.drawer && e.key === "Tab") {
      var box = S.drawer.ov.querySelector(".swk-dr"), f = [].slice.call(box.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')).filter(function (x) { return x.offsetParent !== null; });
      if (f.length) { var a = f[0], z = f[f.length - 1]; if (!box.contains(document.activeElement)) { e.preventDefault(); a.focus(); } else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      return;
    }
    if (!inApp(t)) return;
    if (e.key === "Enter" && t.tagName === "TEXTAREA" && t.rows === 1 && !e.shiftKey) { var fm = t.form || t.closest("form"); e.preventDefault(); if (fm && fm.getAttribute("data-form") && FORM[fm.getAttribute("data-form")]) FORM[fm.getAttribute("data-form")](fm, e); return; }
    if (t.getAttribute && t.getAttribute("role") === "tab" && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key)) {
      var tabs = [].slice.call(appEl.querySelectorAll('[role="tab"]')), i = tabs.indexOf(t), rtl = (document.documentElement.dir || "rtl") === "rtl", n = tabs.length;
      var d = e.key === "Home" ? -i : e.key === "End" ? n - 1 - i : (e.key === "ArrowDown" || (e.key === "ArrowLeft" ? rtl : e.key === "ArrowRight" ? !rtl : false)) ? 1 : -1;
      var nx = tabs[(i + d + n) % n]; e.preventDefault(); nx.focus(); go(nx.getAttribute("data-tab"));
    }
  });
  /* deep links pasted into an open workspace (#tab=…&edit=…): the page's own hash updates use replaceState and fire no event */
  window.addEventListener("hashchange", function () {
    if (S.mode !== "ready" && S.mode !== "local") return;
    var h = parseHash();
    if (h.tab && h.tab !== S.tab) go(h.tab, true);
    if (h.edit) { var want = normPath(h.edit); if (!S.drawer || S.drawer.path !== want) { openEditor(want); if (S.drawer && S.drawer.path !== want) setHash({ edit: S.drawer.path }); } }
    else if (S.drawer) closeEditor(false);
  });
  window.addEventListener("mig:login", function () { if (S.mode === "login" || S.mode === "denied") boot(); });
  window.addEventListener("mig:logout", function () { if (S.mode === "ready") showLogin(false); });
  window.addEventListener("beforeunload", function (e) { if (S.drawer && S.drawer.data && !ro() && snapshot() !== S.drawer.saved) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- language of the static shell ---------- */
  if (EN) {
    var h1 = document.getElementById("swkH1"), lead = document.getElementById("swkLead"), cr = document.getElementById("swkCrumb");
    if (h1) h1.textContent = "SEO workspace";
    if (lead) lead.textContent = "Page titles, descriptions and indexing, redirects, robots and sitemaps, and search-engine verification — for the platform team.";
    if (cr) { var as = cr.querySelectorAll("a"), sp = cr.querySelector("span"); if (as[0]) as[0].textContent = "Home"; if (as[1]) as[1].textContent = "My dashboard"; if (sp) sp.textContent = "SEO workspace"; }
    var stf = document.getElementById("swkStaff"), li = document.querySelector("#swkLinkInbox span"), lp = document.querySelector("#swkLinkPanel span");
    if (stf) stf.setAttribute("aria-label", "Platform team tools");
    if (li) li.textContent = "Requests inbox & matching monitor";
    if (lp) lp.textContent = "Admin panel (members, companies, plans, payments, mail)";
    try { document.title = "SEO workspace – Made in Egypt Gate"; } catch (e) {}
  }
  boot();
})();
'''

PAGES['seo-admin'] = ('مساحة عمل SEO – صنع في مصر', '', globals().get('COMMON_CSS', '') + SWK_CSS, SWK_BODY, SWK_JS)

# noindex + kept out of the sitemap (same pattern as meeting.part.py / inbox.part.py). robots.txt also disallows /seo-admin/.
if 'seo_head' in globals():
    _seo_head_swk = seo_head
    def seo_head(key, title):
        return '<meta name="robots" content="noindex, nofollow">\n' if key == 'seo-admin' else _seo_head_swk(key, title)
if 'seo_files' in globals():
    _seo_files_swk = seo_files
    def seo_files(OUT, keys):
        return _seo_files_swk(OUT, [k for k in keys if k != 'seo-admin'])
