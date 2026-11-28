# -*- coding: utf-8 -*-
import re, os, shutil
B = os.environ.get('MIG_ROOT') or (os.path.dirname(os.path.abspath(__file__)) + '/')
S = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/'
OUT = os.environ.get('MIG_OUT') or (B + 'site/')
if not OUT.endswith('/'): OUT += '/'
os.makedirs(OUT, exist_ok=True)
for _d in ('img', 'media'):
    if not os.path.exists(OUT + _d): os.symlink(B + _d, OUT + _d)
# data/: members-only opportunities (owner decision 2026-11-28) — tenders, RFQs, project and procurement news, contract awards and the
# contractors' material requests are for members. The published copies of data/oldtend.js, oldrfq.js, real.js and projects.js carry the
# teaser fields only (title, sector, governorate, country, dates, status: tools/opp_split.js writes them here as real files); the locked
# fields reach a member's page from the Worker (GET /api/me/opps, data/opp-full.js). Every other file is a symlink into the repository,
# as the whole folder was before (deploy/stage.py resolves them). The repository keeps the full records (the daily update writes them).
def _opp_split_data():
    import subprocess as _sp
    d = OUT + 'data'
    if os.path.islink(d):
        os.unlink(d)
    os.makedirs(d, exist_ok=True)
    for _n in sorted(os.listdir(B + 'data')):
        _p = d + '/' + _n
        if os.path.lexists(_p):
            if os.path.islink(_p) or os.path.isfile(_p):
                os.unlink(_p)
            else:
                continue
        os.symlink(B + 'data/' + _n, _p)
    r = _sp.run(['node', B + 'tools/opp_split.js', '--data', B + 'data', '--out', d], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('site.py: tools/opp_split.js failed (the members-only split of the data files):\n' + (r.stderr or r.stdout)[-2000:])
    print('members-only split: ' + r.stdout.strip())
_opp_split_data()
# Egypt: the old sample-factory logo placeholder is retired; any leftover placeholder in a part file gets this neutral factory icon
FAC_ICON = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2710%27 fill=%27%23FBE9EC%27/%3E%3Cpath d=%27M8 38V22l9 6v-6l9 6v-6l9 6V12h5v26z%27 fill=%27%23C8102E%27/%3E%3C/svg%3E"  # quote-free: it is injected inside JS string literals and HTML attributes
pass  # Egypt: no umbrella affiliation (no FGCI logo); logo-site.png is the Made in Egypt Gate logo (kept as is)
# key → fn(OUT, path): a page registered in PAGES that writes its own standalone files instead of page() (signin.part.py: /login/ + /en/login/)
PAGE_WRITERS = {}
exec(open(B + 'pages.part.py', encoding='utf-8').read())
exec(open(B + 'projects.part.py', encoding='utf-8').read())
exec(open(B + 'leads2.part.py', encoding='utf-8').read())
exec(open(B + 'register.part.py', encoding='utf-8').read())
exec(open(B + 'exportmarket.part.py', encoding='utf-8').read())
exec(open(B + 'registry.part.py', encoding='utf-8').read())
exec(open(B + 'bourse.part.py', encoding='utf-8').read())
exec(open(B + 'deal.part.py', encoding='utf-8').read())
exec(open(B + 'regions.part.py', encoding='utf-8').read())
exec(open(B + 'about.part.py', encoding='utf-8').read())
exec(open(B + 'radar.part.py', encoding='utf-8').read())
exec(open(B + 'map.part.py', encoding='utf-8').read())
exec(open(B + 'offers.part.py', encoding='utf-8').read())
exec(open(B + 'media2.part.py', encoding='utf-8').read())
# Egypt: no admin dashboard in this version (will be added later by the owner)
# exec(open(B + 'admin.part.py', encoding='utf-8').read())
exec(open(B + 'legal.part.py', encoding='utf-8').read())
exec(open(B + 'oldlists.part.py', encoding='utf-8').read())
exec(open(B + 'company.part.py', encoding='utf-8').read())
exec(open(B + 'sellers.part.py', encoding='utf-8').read())
exec(open(B + 'article.part.py', encoding='utf-8').read())
exec(open(B + 'city.part.py', encoding='utf-8').read())
exec(open(B + 'winner.part.py', encoding='utf-8').read())
exec(open(B + 'advisor.part.py', encoding='utf-8').read())
exec(open(B + 'seo.part.py', encoding='utf-8').read())
exec(open(B + 'seo_build.part.py', encoding='utf-8').read())  # SEO generator: build_static_seo, seo_prepare, seo_static_head, seo_rewrite_links …
exec(open(B + 'meeting.part.py', encoding='utf-8').read())  # meeting.html: scheduled meeting room with Janna (noindex; wraps seo_head/seo_files)
exec(open(B + 'inbox.part.py', encoding='utf-8').read())  # inbox.html → /inbox/: admin requests monitor (noindex, not in sitemap)
exec(open(B + 'seo-admin.part.py', encoding='utf-8').read())  # seo-admin.html → /seo-admin/: SEO workspace (admin/seo role; noindex)
exec(open(B + 'signin.part.py', encoding='utf-8').read())  # key «signin» → /login/ + /en/login/: «دخول المصانع» (e-mail code + «حساب قديم؟» old-password card; standalone, noindex) — not the legacy /login.html
exec(open(B + 'pay.part.py', encoding='utf-8').read())  # pay.html → /pay/: invoice payment page (public, noindex; ACC-CONTRACT §1.8)
exec(open(B + 'delete-account.part.py', encoding='utf-8').read())  # delete-account.html → /delete-account/: «حذف الحساب» requests (app parity; noindex; switch account_delete)
exec(open(B + 'research.part.py', encoding='utf-8').read())  # research.html → /research/: «بحث وكتابة عميقة», a member's document from Bassem (noindex; private: no analytics, never in the service worker)
exec(open(B + 'market-opportunities.part.py', encoding='utf-8').read())  # market-opportunities.html → /market-opportunities/: «فرص السوق», the web opportunities published at once, never their source (noindex; switch web_leads_public)
exec(open(B + 'team-seo.part.py', encoding='utf-8').read())  # seo-team.html → /seo-team/: «لوحة فريق الـ SEO» (roles seo/editor/admin/owner; noindex, not in sitemaps)
exec(open(B + 'team-data.part.py', encoding='utf-8').read())  # data-desk.html → /data-desk/: «لوحة فريق الداتا — مكتب الاستقبال» (roles data/admin/owner; noindex)
exec(open(B + 'panel.part.py', encoding='utf-8').read())  # key «admin» → /admin/: «لوحة التحكم» Admin Control Center (ACC-CONTRACT §1; standalone PAGE_WRITERS page, noindex,nofollow)
# deploy 2: the new Control Center lives at /admin/ (panel.part.py, written by PAGE_WRITERS['admin'] from the page loop) and the sign-in
# page is /login/ (signin.part.py). /panel.html and /login.html stay the owner's old system (deploy/legacy-live.txt, served by mis-egypt):
# never built here — login.part.py is not exec'd (its «حساب قديم؟» card moved to /login/), admin.part.py is never exec'd
for _k in ('panel', 'login'):
    PAGES.pop(_k, None)

prof = open(B + 'factory-profile.html').read()
BASE_CSS = re.search(r'<style>(.*?)</style>', prof, re.S).group(1)
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap">'

SHARED_CSS = '''
.util { background: var(--green-deep); color: #F6E4E6; font-size: .8rem; }
.util .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 18px; padding-block: 6px; }
.util .g { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.util a { color: #F6E4E6; }
.dd .menu.wide { display: grid; grid-template-columns: repeat(2, minmax(150px, 1fr)); column-gap: 4px; min-width: 340px; }
.dd .menu.wide a { white-space: normal; }
.dd .menu.wide a:first-child, .dd .menu.wide a:last-child { grid-column: 1 / -1; font-weight: 800; }
.util .lng span { display: inline-flex; align-items: center; gap: 6px; } .util .lng span[hidden] { display: none; }
.util .lng { display: inline-flex; align-items: center; gap: 6px; padding: 1px 10px 1px 8px; background: #fff; color: #8E0B20; border-color: #fff; font-weight: 700; }
.util .lng .flg { width: 20px; height: 13px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.15); flex: none; }
.btn-intl { background: var(--surface); color: var(--green); border-color: var(--green); }
.btn-intl:hover { background: var(--green-soft); }
/* the header must never push the page sideways: the English labels are longer, and a signed-in visitor also gets the bell + account
   chip (data/mig-api.js) — the «International Platforms» button then shows its globe only (its name stays in title / aria-label) */
@media (min-width: 761px) and (max-width: 1600px) { html[lang="en"] .hdr-acts .btn-intl .bi-t { display: none; } }
@media (min-width: 761px) and (max-width: 1720px) { .hdr-acts:has(.mig-ac) .btn-intl .bi-t { display: none; } }
.hdr-acts:has(.mig-ac) > .btn-gold { display: none; }


.util button { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #fff; border-radius: 6px; padding: 0 9px; cursor: pointer; font-size: .78rem; line-height: 1.8; }
.site-nav { align-items: center; flex-wrap: nowrap !important; gap: 0 !important; }
.site-nav > a, .site-nav .dd > a { white-space: nowrap; font-size: .88rem !important; padding: 6px 8px !important; display: inline-block; }
main#top { scroll-margin-top: 400px; }
.site-nav .dd { position: relative; }
.site-nav .dd > a::after { content: " ▾"; font-size: .7em; }
.site-nav .menu { position: absolute; top: 100%; inset-inline-start: 0; min-width: 220px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 18px 40px -18px rgba(0,0,0,.35); padding: 6px; display: flex; flex-direction: column; gap: 2px; opacity: 0; visibility: hidden; transform: translateY(8px); transition: all .2s ease; z-index: 40; }
.site-nav .dd:hover .menu, .site-nav .dd:focus-within .menu { opacity: 1; visibility: visible; transform: none; }
.site-nav .menu a { padding: 8px 10px; border-radius: 8px; font-weight: 600; font-size: .88rem; white-space: nowrap; }
.menu-btn2 { display: none; border: 0; background: var(--sunken); border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 1.1rem; }
@media (max-width: 1240px) {
  .site-nav { display: none !important; }
  .site-nav.open { display: flex !important; }
  .menu-btn2 { display: inline-flex; margin-inline-start: auto; }
  .site-hdr .wrap { flex-wrap: wrap; }
  .site-nav.open { display: flex; flex-direction: column; align-items: stretch; width: 100%; order: 5; gap: 2px; padding-bottom: 8px; }
  .site-nav.open .menu { position: static; opacity: 1; visibility: visible; transform: none; box-shadow: none; border: 0; padding: 0; padding-inline-start: 12px; min-width: 0; background: transparent; }
  .hdr-acts { margin-inline-start: 0; }
  /* the open menu scrolls inside the screen below the header (--nav-top: its top on screen, set by the menu script) and the page
     behind it stays put; it sits above the floating buttons (WhatsApp, back to top, Janna) and the captions while it is open */
  .site-nav.open { max-height: calc(100vh - var(--nav-top, 72px)); max-height: calc(100dvh - var(--nav-top, 72px)); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  /* the lock is on html only: overflow on body as well would make body a scroll container, and the sticky header (with the
     open menu inside it) would then sit at the top of the page, off-screen once the visitor has scrolled */
  html.nav-open { overflow: hidden; }
  html.nav-open .site-hdr { z-index: 80; }
  html.nav-open .mig-cc, html.nav-open .mig-ccbtn { visibility: hidden !important; }
  /* an accordion: every section starts closed and opens from its title (the section's own page is the first link inside it).
     Rows of at least 44px with a divider, the chevron at the row's end (it turns over when the section is open), the open
     section's links on a soft panel; the page you are on is marked. The generated pages' header has the same menu (NAV, seo_build nav_links()). */
  .site-nav.open { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 2px; }
  .site-nav.open > a, .site-nav.open .dd > a { display: flex; align-items: center; gap: 8px; min-height: 46px; box-sizing: border-box; padding: 10px 10px !important; font-size: .98rem !important; font-weight: 800; white-space: normal; border-radius: 0; border-bottom: 1px solid var(--line); }
  .site-nav.open > a:last-child, .site-nav.open > .dd:last-child > a { border-bottom: 0; }
  .site-nav.open .dd > a::after { content: "▾"; margin-inline-start: auto; font-size: .85em; color: var(--muted); transition: transform .2s ease; }
  .site-nav.open .dd.open > a { color: var(--green); border-bottom-color: transparent; }
  .site-nav.open .dd.open > a::after { content: "▾"; transform: rotate(180deg); color: var(--green); }
  .site-nav.open a.on { color: var(--green); box-shadow: inset -3px 0 0 var(--green); }
  html[dir=ltr] .site-nav.open a.on { box-shadow: inset 3px 0 0 var(--green); }
  .site-nav.open .dd.open > .menu { background: var(--sunken); border-radius: 12px; padding: 4px; margin: 0 0 8px; }
  .site-nav.open .menu a { display: flex; align-items: center; min-height: 44px; box-sizing: border-box; padding: 8px 12px; font-size: .92rem; white-space: normal; }
  .site-nav.open .dd:not(.open) > .menu { display: none; }
  @media (prefers-reduced-motion: reduce) { .site-nav.open .dd > a::after { transition: none; } }
}
.hdr-acts .btn-gold { background: var(--gold); color: #1A1204; }
@media (max-width: 760px) { .hdr-acts .hide-sm { display: none; } }
.site-ftr a { color: #F6E4E6; }
.site-ftr a:hover { color: var(--gold); }
.scroll-prog { position: fixed; top: env(safe-area-inset-top, 0px); inset-inline: 0; height: 3px; z-index: 50; background: linear-gradient(90deg, var(--gold), var(--green)); transform-origin: right; transform: scaleX(0); }
html[dir=ltr] .scroll-prog { transform-origin: left; }
.totop { position: fixed; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); inset-inline-start: calc(18px + env(safe-area-inset-left, 0px)); width: 46px; height: 46px; border-radius: 50%; border: 0; background: var(--green); color: #fff; font-size: 1.2rem; cursor: pointer; z-index: 45; box-shadow: 0 10px 24px -8px rgba(0,0,0,.4); transform: translateY(90px); transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.totop.show { transform: none; }

.sbn { position: relative; background: linear-gradient(180deg, #2A0710, #4A0510); padding-block: 26px 22px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); border-block: 1px solid rgba(192,147,0,.35); }
.sbn-in { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.sbn-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.sbn-badge { background: var(--gold); color: #1A1204; font-weight: 800; font-size: .8rem; padding: 3px 14px; border-radius: 99px; box-shadow: 0 0 0 4px rgba(192,147,0,.15); }
.sbn-dots { display: flex; gap: 5px; }
.sbn-dots button { width: 8px; height: 8px; border-radius: 99px; border: 0; padding: 0; background: rgba(255,255,255,.35); cursor: pointer; transition: width .3s ease, background .3s ease; }
.sbn-dots button.on { width: 22px; background: var(--gold); }
.sbn-stage { position: relative; aspect-ratio: 5.6 / 1; width: 100%; border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid rgba(192,147,0,.6); box-shadow: 0 0 0 4px rgba(192,147,0,.1), 0 14px 30px -18px rgba(0,0,0,.6); }
.sbn-s { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; transform: scale(1.03); transition: opacity .8s ease, transform 1.2s ease; pointer-events: none; overflow: hidden; }
.sbn-s.on { opacity: 1; transform: none; pointer-events: auto; }
.sbn-s .bg { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); object-fit: cover; filter: blur(18px) saturate(1.1); opacity: .55; }
.sbn-s .fg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.sbn-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(74,5,16,.75); color: #fff; font-size: 1.15rem; cursor: pointer; opacity: 0; transition: opacity .2s ease; }
.sbn-stage:hover .sbn-nav, .sbn-nav:focus-visible { opacity: 1; }
.sbn-nav.p { inset-inline-start: 8px; } .sbn-nav.n { inset-inline-end: 8px; }
.sbn-bar { position: absolute; bottom: 0; inset-inline: 0; height: 3px; background: rgba(0,0,0,.08); z-index: 2; }
.sbn-bar i { display: block; height: 100%; width: 0; background: var(--gold); margin-inline-start: auto; }
.sbn-cta { align-self: flex-end; color: var(--gold); font-size: .78rem; font-weight: 700; }
@media (max-width: 600px) { .sbn { padding-block: 18px 16px; } .sbn-nav { opacity: 1; width: 26px; height: 26px; font-size: 1rem; } }
.sbn.core { background: var(--green-soft); border-block-color: var(--line); }
.sbn.core .sbn-badge { background: var(--green); color: #fff; box-shadow: 0 0 0 4px rgba(200,16,46,.12); }
.sbn.core .sbn-stage { border-color: rgba(200,16,46,.35); box-shadow: 0 0 0 4px rgba(200,16,46,.08), 0 14px 30px -20px rgba(142,11,32,.5); }
.sbn.core .sbn-dots button { background: rgba(200,16,46,.25); } .sbn.core .sbn-dots button.on { background: var(--green); }
.sbn.core .sbn-bar i { background: var(--green); } .sbn.core .sbn-cta { color: var(--green); }
.sbn-empty { display: grid; place-items: center; background: repeating-linear-gradient(135deg, var(--sunken) 0 12px, var(--surface) 12px 24px); color: var(--muted); font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .sbn-s { transition: none; } }

.stratb { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 14px; padding: 8px max(16px, env(safe-area-inset-right, 0px)) 8px max(16px, env(safe-area-inset-left, 0px)); background: linear-gradient(90deg, #4A0510, #8E0B20, #4A0510); color: #fff; font-size: .84rem; border-bottom: 1px solid rgba(192,147,0,.4); }
.stratb span:first-child { color: var(--gold); font-weight: 800; } .stratb .go { background: var(--gold); color: #1A1204; border-radius: 99px; padding: 1px 12px; font-weight: 800; }
.wa-float { position: fixed; bottom: calc(74px + env(safe-area-inset-bottom, 0px)); inset-inline-start: calc(18px + env(safe-area-inset-left, 0px)); width: 46px; height: 46px; border-radius: 50%; background: #25D366; color: #fff; display: grid; place-items: center; z-index: 45; box-shadow: 0 10px 24px -8px rgba(0,0,0,.4); font-size: 1.3rem; }
/* Janna's welcome figure stands in the bottom-left corner in both languages (data/janna-welcome.js .jw-st, html.jw-on): the floating buttons keep
   the right-hand corner then (in English their inline start is the left, under her figure and its close button), and on phones they wait while her
   box is open (it spans the width above them) — audit 2026-11-27 */
html.jw-on .wa-float, html.jw-on .totop { inset-inline-start: auto; left: auto; right: calc(18px + env(safe-area-inset-right, 0px)); }
@media (max-width: 640px), (max-height: 520px) { html.jw-on body:has(> .jw-sb:not(.jw-aw)) .wa-float, html.jw-on body:has(> .jw-sb:not(.jw-aw)) .totop { visibility: hidden; } }
.ftr-refs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 22px; }
.ftr-refs a { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 14px; padding: 12px 16px; color: #fff; transition: background .2s ease, transform .2s ease; }
.ftr-refs a:hover { background: rgba(255,255,255,.16); transform: translateY(-2px); }
.ftr-refs a > span:first-child { font-size: 1.5rem; } .ftr-refs b { display: block; } .ftr-refs small { opacity: .8; font-size: .8rem; } .ftr-refs em { margin-inline-start: auto; font-style: normal; font-weight: 900; }
.ftr-refs .fr1 { background: var(--gold, #C09300); color: #fff; border-color: transparent; } .ftr-refs .fr1:hover { background: #D6AC2A; }
.soc-ic { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.soc-ic b { color: var(--gold, #C09300); font-size: .9rem; }
.soc-ic div { display: flex; flex-wrap: wrap; gap: 8px; }
.soc-ic a { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: #fff; transition: background .2s ease, transform .2s ease, color .2s ease; }
.soc-ic a:hover, .soc-ic a:focus-visible { background: #fff; color: var(--bc); transform: translateY(-3px); }
/* the icon of each account is the link's ::before: a CSS mask of its glyph (below) in the link's colour — white, the brand colour on hover */
.soc-ic a::before { content: ""; width: 19px; height: 19px; background: currentColor; -webkit-mask: var(--i) center / contain no-repeat; mask: var(--i) center / contain no-repeat; }
.soc-ic .s-wa { --bc: #25D366; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3.5 20.5l1.3-4.2A8.6 8.6 0 1 1 8 19.3z' fill='none' stroke='%23000' stroke-width='1.8' stroke-linejoin='round'/%3E%3Cpath d='M9 8.3c.3-.6.6-.6.9-.6h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.1.4 0 .6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6 0l.6-.6c.2-.2.4-.2.6-.1l1.7.8c.2.1.3.3.3.5 0 .7-.3 1.3-.9 1.6-.7.3-1.6.3-2.9-.3-1.9-.9-3.4-2.4-4.3-4.3-.5-1.1-.4-2.1-.1-2.7z' fill='%23000'/%3E%3C/svg%3E"); }
.soc-ic .s-x { --bc: #111111; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 4h4.2l11.8 16h-4.2z' fill='%23000'/%3E%3Cpath d='M19.4 4L4.6 20' stroke='%23000' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E"); }
.soc-ic .s-ig { --bc: #E1306C; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='3.5' y='3.5' width='17' height='17' rx='5' fill='none' stroke='%23000' stroke-width='1.9'/%3E%3Ccircle cx='12' cy='12' r='4' fill='none' stroke='%23000' stroke-width='1.9'/%3E%3Ccircle cx='17.2' cy='6.8' r='1.2' fill='%23000'/%3E%3C/svg%3E"); }
.soc-ic .s-in { --bc: #0A66C2; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='3' y='3' width='18' height='18' rx='3' fill='none' stroke='%23000' stroke-width='1.8'/%3E%3Cpath d='M7.5 10.2v6.3M7.5 7.6v.1M11 16.5v-3.6c0-1.5.9-2.6 2.3-2.6s2.2 1 2.2 2.6v3.6M11 10.2v6.3' fill='none' stroke='%23000' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E"); }
.soc-ic .s-yt { --bc: #FF0000; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2.8' y='5.8' width='18.4' height='12.4' rx='4' fill='none' stroke='%23000' stroke-width='1.8'/%3E%3Cpath d='M10 9.2v5.6l4.8-2.8z' fill='%23000'/%3E%3C/svg%3E"); }
.soc-ic .s-fb { --bc: #1877F2; --i: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z' fill='%23000'/%3E%3C/svg%3E"); }
@media (forced-colors: active) { .soc-ic a::before { forced-color-adjust: none; background: LinkText; } }
@media (prefers-reduced-motion: reduce) { .soc-ic a { transition: none; } .soc-ic a:hover { transform: none; } }
/* the platform footer on every page — site.py pages and the generated SEO pages alike (owner 2026-11-18: the structure of the
   Saudi footer; markup: seo_build.part.py site_footer()): «شركاء المنصة» strip → four columns → the two cards → «روابط سريعة» → bottom bar */
.site-ftr { padding-block: 0; }
.site-ftr .ftr-main { padding-block: 34px 20px; }
.site-ftr .cols p { opacity: .85; line-height: 1.85; }
.aff2 { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 14px; }
.site-ftr .aff2 > a { display: inline-flex; background: #fff; border-radius: 14px; padding: 8px 12px; box-shadow: 0 8px 20px -10px rgba(0,0,0,.5); }
.aff2 img { display: block; height: 60px; width: auto; }
.aff2 > span { font-size: .86rem; line-height: 1.6; opacity: .92; }
.aff2 small { display: block; margin-top: 2px; font-size: .78rem; opacity: .8; }
.ftr-partners { background: var(--sunken); color: var(--fg); border-top: 1px solid var(--line); padding-block: 24px 26px; }
.fp-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.fp-head h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: var(--fg); }
.site-ftr .fp-head a { color: var(--green); font-weight: 800; font-size: .88rem; white-space: nowrap; }
.site-ftr .fp-head a:hover { color: var(--green-deep); text-decoration: underline; }
/* the logos scroll inside the strip (swipe on phones); on a computer screen the strip's own script turns it into a slow loop */
.fp-run { overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
.fp-run::-webkit-scrollbar { display: none; }
.fp-track { display: flex; width: max-content; padding: 4px 16px 8px; }
.site-ftr .fp-card { flex: none; box-sizing: border-box; width: 196px; height: 94px; margin-inline-end: 16px; display: grid; place-items: center; padding: 12px 16px; border-radius: 14px; background: #fff; border: 1px solid var(--line); scroll-snap-align: center; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.fp-card img { display: block; max-width: 100%; max-height: 64px; width: auto; height: auto; object-fit: contain; filter: grayscale(.2); transition: filter .2s ease; }
.site-ftr .fp-card:hover, .site-ftr .fp-card:focus-visible { transform: translateY(-3px); border-color: var(--green); box-shadow: 0 12px 22px -16px rgba(142,11,32,.5); }
.fp-card:hover img, .fp-card:focus-visible img { filter: none; }
.fp-run.loop { overflow: hidden; scroll-snap-type: none; }
.fp-run.loop .fp-track { padding-inline: 0; }
.fp-run.go .fp-track { animation: fpRun 40s linear infinite; }
html[dir=ltr] .fp-run.go .fp-track { animation-name: fpRunL; }
.fp-run.go:hover .fp-track, .fp-run.go:focus-within .fp-track { animation-play-state: paused; }
@keyframes fpRun { to { transform: translateX(50%); } }
@keyframes fpRunL { to { transform: translateX(-50%); } }
.ftr-quick { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; align-items: baseline; margin-top: 18px; padding: 12px 16px; border-radius: 14px; background: rgba(0,0,0,.14); border: 1px solid rgba(255,255,255,.1); font-size: .8rem; }
.ftr-quick > b { grid-row: span 2; color: var(--gold); font-size: .86rem; font-weight: 800; white-space: nowrap; }
.fq-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
.fq-row > span { font-weight: 800; opacity: .72; }
.site-ftr .fq-row ul { flex-direction: row; flex-wrap: wrap; gap: 4px 0; opacity: 1; font-size: inherit; }
.fq-row li:not(:last-child)::after { content: "·"; margin-inline: 7px; opacity: .45; }
.fq-row a { opacity: .9; }
.site-ftr .bottom { margin-top: 18px; align-items: center; }
.site-ftr .bottom a { white-space: nowrap; }
.site-ftr .bottom .fnote { display: block; margin-top: 2px; font-size: .72rem; opacity: .85; }
/* The bottom corners of the screen hold fixed things that stay over the end of the page: Janna — her standing figure on Arabic pages
   (data/janna-welcome.js: 260×225 at the bottom-left, html.jw-on), else data/janna.js's corner figure (html:has(.jn-fig), up to
   min(27vh, 232px) tall) or round headshot (64px; on the members' tools, html.jn-quiet, with «LIVE» above it) — and, on site.py pages,
   «↑» and the WhatsApp button (46px, 18px in; right in Arabic, left in English), on the generated pages «اسأل جنة» until Janna loads.
   On a computer the end of the footer keeps clear of them, so every link can be scrolled out from under them: .ftr-dock («روابط سريعة»
   + the bottom bar; from 1180px .ftr-end, the two cards with them) takes a side inset as wide as what stands in that corner (--pl / --pr,
   less what the screen leaves beside the 1240px content, so none on a wide screen) and room above for Janna's height (--fh: nothing
   above the dock comes down into her corner). On a phone the footer ends with room for them. */
.site-ftr .ftr-end { --pl: 0px; --pr: 0px; --fh: 0px; }
html[dir=rtl] .site-ftr.ftr-app .ftr-end { --pr: 64px; }
html[dir=ltr] .site-ftr.ftr-app .ftr-end { --pl: 64px; }
html[dir=rtl]:not(.jw-on):has(> body > .ask-btn:not([hidden])) .site-ftr .ftr-end { --pl: 124px; }
html[dir=ltr]:has(> body > .ask-btn:not([hidden])) .site-ftr .ftr-end { --pr: 124px; }
html:not(.jw-on):not(.jn-quiet):has(> body > .jn-mini:not([hidden])) .site-ftr .ftr-end { --pr: 78px; }
html:not(.jw-on):not(.jn-quiet):has(> body > .jn-fig:not([hidden])) .site-ftr .ftr-end { --pr: calc(min(27vh, 232px) * 1.11 + 12px); --fh: calc(min(27vh, 232px) - 12px); }
/* … beside «↑» on an Arabic site.py page (data/janna.js stands 70px in there) */
html[dir=rtl]:not(.jw-on):not(.jn-quiet):has(> body > .jn-mini:not([hidden])) .site-ftr.ftr-app .ftr-end { --pr: 138px; }
html[dir=rtl]:not(.jw-on):not(.jn-quiet):has(> body > .jn-fig:not([hidden])) .site-ftr.ftr-app .ftr-end { --pr: calc(min(27vh, 232px) * 1.11 + 72px); }
html.jn-quiet.jn-qrtl .site-ftr .ftr-end { --pl: 80px; }
html.jn-quiet:not(.jn-qrtl) .site-ftr .ftr-end { --pr: 80px; }
html.jw-on .site-ftr .ftr-end { --pl: 254px; --fh: 206px; }
.site-ftr .ftr-dock { container-type: inline-size; }
@media (min-width: 641px) {
  .site-ftr .ftr-end { --il: max(0px, min(var(--pl), var(--pl) - (100vw - 1240px) / 2)); --ir: max(0px, min(var(--pr), var(--pr) - (100vw - 1240px) / 2)); }
  .site-ftr .ftr-dock { display: flex; flex-direction: column; justify-content: flex-end; box-sizing: border-box; min-height: var(--fh); padding-left: var(--il); padding-right: var(--ir); }
}
@media (min-width: 1180px) {
  .site-ftr .ftr-end { display: flex; flex-direction: column; justify-content: flex-end; box-sizing: border-box; min-height: var(--fh); padding-left: var(--il); padding-right: var(--ir); }
  .site-ftr .ftr-dock { min-height: 0; padding-left: 0; padding-right: 0; }
}
/* a narrow dock (a tablet with Janna beside it): «روابط سريعة» above its rows */
@container (max-width: 560px) {
  .site-ftr .ftr-quick { grid-template-columns: minmax(0, 1fr); }
  .site-ftr .ftr-quick > b { grid-row: auto; }
}
@media (max-width: 640px) {
  .site-ftr { padding-bottom: calc(150px + env(safe-area-inset-bottom, 0px)); }
  html.jw-on:has(> body > .jw-fig) .site-ftr { padding-bottom: calc(224px + env(safe-area-inset-bottom, 0px)); }
  .site-ftr .fp-card { width: 150px; height: 80px; padding: 10px 12px; margin-inline-end: 12px; }
  .fp-card img { max-height: 54px; }
  .ftr-quick { grid-template-columns: minmax(0, 1fr); }
  .ftr-quick > b { grid-row: auto; }
  .site-ftr .bottom { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .fp-run.go .fp-track { animation: none; } .site-ftr .fp-card, .fp-card img { transition: none; } }
.site-hdr { transition: box-shadow .3s ease; }
#mmore { white-space: normal; max-width: 100%; }
.site-hdr.scrolled { box-shadow: 0 8px 24px -14px rgba(0,0,0,.35); }
'''

# the main menu of EVERY page: header() below (the app pages) and seo_build.part.py nav_links() (the generated pages: the same items,
# sub-menus and clean URLs, English from the dictionary). Edit it here only; seo_build reads it from this file in standalone runs, so it
# stays a plain list from «NAV = [» to the closing «]» on its own line.
# «طلبات الأسعار» (owner 2026-11-25): every item but «تتبع حالة الطلب» opens for an active paid plan only — the menu points at the
# interactive pages (/rfq/search/, /tenders/search/, /awards/search/, agencies, market-opportunities, deal), which GATES below locks
# (feature «paid»); the generated hubs /rfq/, /tenders/, /awards/ stay public for search engines and already lock every detail.
NAV = [
 ('home', 'الرئيسية', 'home.html', [('الصفحة الرئيسية', 'home.html'), ('من نحن', 'about.html'), ('الرؤية والرسالة', 'about.html#vision'), ('الباقات والتسجيل', 'register.html#plans'), ('المنصات الدولية', 'intl.html'), ('البورصة الصناعية', 'bourse.html'), ('المركز القانوني', 'legal.html'), ('المراجع الرسمية ومواقع تهمك', 'useful-links.html')]),
 ('market', 'المنتجات', 'market.html', []),
 ('rfq', 'طلبات الأسعار', '/rfq/search/', [('سوق طلبات الأسعار (RFQs)', '/rfq/search/'), ('المناقصات الحكومية', '/tenders/search/'), ('الشركات الفائزة', '/awards/search/'), ('الجهات الحكومية', 'agencies.html'), ('كل الفرص المفتوحة', '/tenders/search/'), ('فرص السوق', 'market-opportunities.html'), ('دليل التمويل والشحن والتأمين', 'deal.html#finance'), ('تتبع حالة الطلب', 'track.html')]),
 ('projects', 'المشاريع', 'projects.html', [('مشاريع مصر', 'projects.html'), ('طلبات المواد من المقاولين', 'contractor-leads.html'), ('طلبات الاستشاريين', 'consultant-leads.html'), ('دليل المقاولين والموردين', 'contractors.html'), ('أخبار المشاريع', 'project-news.html')]),
 ('factories', 'المصانع', 'factories.html', []),
 ('cities', 'المحافظات', 'region.html', [('🗺️ كل المحافظات (27 محافظة)', 'region.html'), ('📍 خريطة الفرص في المدن', 'map.html')] + [(n, 'region.html#' + c) for c, n in [('CAI', 'القاهرة'), ('GIZ', 'الجيزة'), ('ALX', 'الإسكندرية'), ('QLB', 'القليوبية'), ('SHR', 'الشرقية'), ('MNF', 'المنوفية'), ('GHR', 'الغربية'), ('DKH', 'الدقهلية'), ('DMT', 'دمياط'), ('PTS', 'بورسعيد'), ('ISM', 'الإسماعيلية'), ('SUZ', 'السويس'), ('BNS', 'بني سويف'), ('AST', 'أسيوط'), ('SHG', 'سوهاج')]] + [('🏭 المناطق الصناعية والحرة والمدن الجديدة', 'cities.html')]),
 ('media', 'المركز الإعلامي', 'media-center.html', [('المركز الإعلامي', 'media-center.html'), ('البوابة الإخبارية', 'news.html'), ('المرئيات واللقاءات الصناعية', 'videos.html'), ('رزنامة المعارض والفعاليات', 'events.html')]),
 ('contact', 'اتصل بنا', 'contact.html', []),
]

FLAG_US = '<svg class="flg" viewBox="0 0 38 20" aria-hidden="true"><rect width="38" height="20" fill="#B22234"/><rect y="1.538" width="38" height="1.54" fill="#fff"/><rect y="4.614" width="38" height="1.54" fill="#fff"/><rect y="7.690" width="38" height="1.54" fill="#fff"/><rect y="10.766" width="38" height="1.54" fill="#fff"/><rect y="13.842" width="38" height="1.54" fill="#fff"/><rect y="16.918" width="38" height="1.54" fill="#fff"/><rect width="15.2" height="10.77" fill="#3C3B6E"/><circle cx="1.6" cy="1.3" r=".55" fill="#fff"/><circle cx="4.0" cy="1.3" r=".55" fill="#fff"/><circle cx="6.4" cy="1.3" r=".55" fill="#fff"/><circle cx="8.8" cy="1.3" r=".55" fill="#fff"/><circle cx="11.2" cy="1.3" r=".55" fill="#fff"/><circle cx="13.6" cy="1.3" r=".55" fill="#fff"/><circle cx="2.8" cy="3.3" r=".55" fill="#fff"/><circle cx="5.2" cy="3.3" r=".55" fill="#fff"/><circle cx="7.6" cy="3.3" r=".55" fill="#fff"/><circle cx="10.0" cy="3.3" r=".55" fill="#fff"/><circle cx="12.4" cy="3.3" r=".55" fill="#fff"/><circle cx="1.6" cy="5.3" r=".55" fill="#fff"/><circle cx="4.0" cy="5.3" r=".55" fill="#fff"/><circle cx="6.4" cy="5.3" r=".55" fill="#fff"/><circle cx="8.8" cy="5.3" r=".55" fill="#fff"/><circle cx="11.2" cy="5.3" r=".55" fill="#fff"/><circle cx="13.6" cy="5.3" r=".55" fill="#fff"/><circle cx="2.8" cy="7.3" r=".55" fill="#fff"/><circle cx="5.2" cy="7.3" r=".55" fill="#fff"/><circle cx="7.6" cy="7.3" r=".55" fill="#fff"/><circle cx="10.0" cy="7.3" r=".55" fill="#fff"/><circle cx="12.4" cy="7.3" r=".55" fill="#fff"/><circle cx="1.6" cy="9.3" r=".55" fill="#fff"/><circle cx="4.0" cy="9.3" r=".55" fill="#fff"/><circle cx="6.4" cy="9.3" r=".55" fill="#fff"/><circle cx="8.8" cy="9.3" r=".55" fill="#fff"/><circle cx="11.2" cy="9.3" r=".55" fill="#fff"/><circle cx="13.6" cy="9.3" r=".55" fill="#fff"/></svg>'
FLAG_EG = '<svg class="flg" viewBox="0 0 60 40" aria-hidden="true"><rect width="60" height="13.34" fill="#CE1126"/><rect y="13.33" width="60" height="13.34" fill="#fff"/><rect y="26.66" width="60" height="13.34" fill="#000"/><circle cx="30" cy="20" r="4.2" fill="#C09300"/></svg>'

def header(active):
    items = ''
    for k, name, href, sub in NAV:
        cls = ' class="on"' if k == active else ''
        if sub:
            items += ('<div class="dd"><a href="%s"%s>%s</a><div class="menu' + (' wide' if len(sub) > 9 else '') + '">%s</div></div>') % (href, cls, name, ''.join('<a href="%s">%s</a>' % (h, n) for n, h in sub))
        else:
            items += '<a href="%s"%s>%s</a>' % (href, cls, name)
    util = ('<div class="util"><div class="wrap"><div class="g"><a href="mailto:info@madeinegyptgate.com" data-mig-setting="contact_email">✉ info@madeinegyptgate.com</a><a href="https://wa.me/201279188996" target="_blank" rel="noopener" dir="ltr" data-mig-setting="whatsapp_number" data-mig-setting-text="whatsapp_display">01279188996</a><a href="suppliers.html">🏭 الموردون</a><a href="outlets.html">🏬 منافذ البيع</a><a href="contact.html#rfq-form">📝 إرسال طلب عرض</a></div>'
            '<div class="g"><span id="hijri"></span><span id="greg" class="num"></span><span id="clk" class="num"></span><button type="button" id="fsUp" dir="ltr" aria-label="تكبير الخط">A+</button><button type="button" id="fsDn" dir="ltr" aria-label="تصغير الخط">A−</button><button type="button" id="thm" aria-label="الوضع الليلي">◐</button><button type="button" id="lng" class="lng"><span class="l-en" lang="en" dir="ltr">' + FLAG_US + 'English</span><span class="l-ar" hidden translate="no">' + FLAG_EG + 'العربية</span></button></div></div></div>')
    return (util + '<header class="site-hdr"><div class="wrap"><a class="brand" href="home.html" aria-label="منصة صنع في مصر"><img src="img/logo-site.png" alt="منصة صنع في مصر"></a>'
            '<button class="menu-btn2" id="menuBtn2" type="button" aria-label="القائمة" aria-expanded="false">☰</button>'
            '<nav class="site-nav" id="siteNav" aria-label="القائمة الرئيسية">' + items + '</nav>'
            '<div class="hdr-acts"><a class="btn btn-sm btn-gold" href="register.html">✍️ التسجيل</a><a class="btn btn-sm btn-green hide-sm" href="signin.html" data-mig-dash="1" rel="nofollow">دخول</a><a class="btn btn-sm btn-intl hide-sm" href="intl.html" title="المنصات الدولية" aria-label="المنصات الدولية"><span aria-hidden="true">🌐</span> <span class="bi-t">المنصات الدولية</span></a></div></div></header>')

# the footer itself (partners strip, four columns, cards, quick links, bottom bar) is built by seo_build.part.py site_footer() for
# every page; site.py pages add the floating WhatsApp button and the toast after it
FOOTER_FLOAT = '''<a class="wa-float" href="https://wa.me/201279188996" aria-label="واتساب" data-mig-setting="whatsapp_number">💬</a>
<div class="toast" id="toast" hidden></div>'''

SHARED_JS = '''<script>
(function () {
  try { if (sessionStorage.getItem("mig-bye")) { sessionStorage.removeItem("mig-bye"); document.addEventListener("DOMContentLoaded", function () { var t = document.getElementById("toast"); if (t) { t.textContent = "تم تسجيل الخروج بنجاح 👋"; t.hidden = false; setTimeout(function () { t.hidden = true; }, 3000); } }); } } catch (e) {}
  /* SEO for detail pages: keep the title, description and social titles in sync with the item shown (hash routes). The canonical and
     og:url stay as the build wrote them (SEO spec: «must not touch canonical»): a fragment in a canonical is ignored by search engines
     and, on a page reached by a redirect (/radar/ → /register/#plans), it made the canonical point at «/register/#plans» */
  window.MIGSEO = function (t, d, extra) { try { if (t) document.title = t; function m(sel, v) { var e = document.querySelector(sel); if (e && v) e.setAttribute("content", v); } m('meta[property="og:title"]', document.title); m('meta[name="twitter:title"]', document.title); if (d) { m('meta[name="description"]', d); m('meta[property="og:description"]', d); m('meta[name="twitter:description"]', d); } if (extra) { var j = document.createElement("script"); j.type = "application/ld+json"; j.textContent = JSON.stringify(extra); document.head.appendChild(j); } } catch (e) {} };
  setTimeout(function () { if (location.hash.length > 1 && !window.__seoDone) { var h = document.querySelector("main h1, .phero h1, h1"); var ht = h ? h.textContent.trim() : "", sx = window.MIGLANG === "en" ? " – Made in Egypt Gate" : " – منصة صنع في مصر"; MIGSEO(ht ? ht + sx : document.title, ht ? ht + sx : ""); } }, 900);
  var $ = function (s) { return document.querySelector(s); };
  window.toast = typeof window.toast === "function" ? window.toast : function (m) { var t = $("#toast"); if (!t) return; t.textContent = window.MIGTR ? MIGTR(m) : m; t.hidden = false; clearTimeout(window.__tt); window.__tt = setTimeout(function () { t.hidden = true; }, 2600); };
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-toast]"); if (b && !window.__pageToast) { var tm = b.getAttribute("data-toast"); toast(window.MIGTR ? MIGTR(tm) : tm); } });
  /* the top bar: the Hijri and Gregorian dates and the clock, all in Cairo time (a visitor's own time zone gave yesterday's date next to
     the Cairo clock after midnight in Cairo, owner report 2026-11-19). Some page scripts (home, market) write the dates again in the
     visitor's time zone: the clock tick puts the Cairo date back (at DOMContentLoaded, then whenever it differs) */
  var TZ = "Africa/Cairo", DF = {};
  function dtf(k, loc, o) { if (!(k in DF)) { try { o.timeZone = TZ; DF[k] = new Intl.DateTimeFormat(loc, o); } catch (e) { delete o.timeZone; try { DF[k] = new Intl.DateTimeFormat(loc, o); } catch (x) { DF[k] = null; } } } return DF[k]; }
  function setTxt(sel, v) { var e = $(sel); if (e && v && e.textContent !== v) e.textContent = v; }
  function dates(now) {
    var h = dtf("h", "ar-EG-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" }), g = dtf("g", "ar-EG-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
    try { if (h) setTxt("#hijri", h.format(now)); } catch (e) {}
    try { if (g) setTxt("#greg", g.format(now)); } catch (e) {}
  }
  function clk() { var now = new Date(), c = dtf("c", "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); try { if (c) setTxt("#clk", c.format(now)); } catch (e) {} dates(now); }
  clk(); setInterval(clk, 1000); document.addEventListener("DOMContentLoaded", clk);
  var fs = 15; try { fs = +localStorage.getItem("mig-fs") || 15; } catch (e) {}
  function setFs(v) { fs = Math.max(13, Math.min(19, v)); document.body.style.fontSize = fs + "px"; try { localStorage.setItem("mig-fs", fs); } catch (e) {} }
  setFs(fs);
  $("#fsUp").onclick = function () { setFs(fs + 1); }; $("#fsDn").onclick = function () { setFs(fs - 1); };
  try { var th = localStorage.getItem("mig-theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {}
  $("#thm").onclick = function () { var r = document.documentElement, c = r.getAttribute("data-theme"); var dark = c ? c === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.setAttribute("data-theme", dark ? "light" : "dark"); try { localStorage.setItem("mig-theme", dark ? "light" : "dark"); } catch (e) {} };
  $("#lng").onclick = function () { MIGSETLANG(window.MIGLANG === "en" ? "ar" : "en"); };
  /* the phone menu (up to 1240px): it scrolls inside the screen below the header while the page behind it stays locked; each
     section opens from its title (accordion); a chosen link or Esc closes it */
  (function () {
    var b = $("#menuBtn2"), n = $("#siteNav"), de = document.documentElement; if (!b || !n) return;
    var mq = window.matchMedia ? matchMedia("(max-width: 1240px)") : null;
    function narrow() { return mq ? mq.matches : window.innerWidth <= 1240; }
    function fit() { if (n.classList.contains("open")) n.style.setProperty("--nav-top", Math.max(0, Math.round(n.getBoundingClientRect().top)) + "px"); }
    function set(o) {
      n.classList.toggle("open", o); b.setAttribute("aria-expanded", o ? "true" : "false"); b.textContent = o ? "✕" : "☰"; de.classList.toggle("nav-open", o && narrow());
      if (o) { n.scrollTop = 0; fit(); if (narrow()) [].forEach.call(n.querySelectorAll(".dd > a"), function (t) { t.setAttribute("aria-expanded", t.parentNode.classList.contains("open") ? "true" : "false"); }); }
    }
    b.onclick = function () { set(!n.classList.contains("open")); };
    n.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a"); if (!a || !n.classList.contains("open") || !narrow()) return;
      var d = a.parentNode, m = d && d.classList && d.classList.contains("dd") ? d.querySelector(".menu") : null;
      if (!m) { set(false); return; }
      e.preventDefault(); var x = !d.classList.contains("open"); d.classList.toggle("open", x); a.setAttribute("aria-expanded", x ? "true" : "false");
      if (x) { var nr = n.getBoundingClientRect(), mr = m.getBoundingClientRect(); if (mr.bottom > nr.bottom) n.scrollTop += Math.min(mr.bottom - nr.bottom + 8, a.getBoundingClientRect().top - nr.top); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && n.classList.contains("open")) { set(false); try { b.focus(); } catch (x) {} } });
    window.addEventListener("resize", function () { if (n.classList.contains("open")) { de.classList.toggle("nav-open", narrow()); fit(); } });
  })();
  if (!$("#sprog")) { var sp = document.createElement("div"); sp.className = "scroll-prog"; sp.id = "sprog"; document.body.appendChild(sp); var tp = document.createElement("button"); tp.className = "totop"; tp.id = "totop"; tp.setAttribute("aria-label", "العودة للأعلى"); tp.textContent = "↑"; document.body.appendChild(tp); }
  if (location.hash === "#top") { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} window.scrollTo(0, 0); }
  var hdr = $(".site-hdr");
  function os() { var h = document.documentElement, k = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight); $("#sprog").style.transform = "scaleX(" + k + ")"; $("#totop").classList.toggle("show", h.scrollTop > 700); if (hdr) hdr.classList.toggle("scrolled", h.scrollTop > 10); }
  window.addEventListener("scroll", os, { passive: true }); os();
  $("#totop").onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
})();
</script>'''

def sbn(cls, label, badge, slides, cta_href, cta_text):
    # slides: (img, alt, q[, href]) — href defaults to the factories directory (q pre-fills its search)
    sl = [x for x in slides if os.path.exists(B + x[0])]
    if not sl:
        stage = '<a class="sbn-s on sbn-empty" href="%s"><span>مساحة إعلانية محجوزة لـ%s</span></a>' % (cta_href, label)
    else:
        def _a(n, x):
            img, alt, q = x[0], x[1], x[2]
            href = x[3] if len(x) > 3 else 'factories.html'
            ext = ' target="_blank" rel="noopener"' if href.startswith('http') else ''
            dq = ' data-q="%s"' % q if q else ''
            lz = '' if n == 0 else ' loading="lazy"'
            return '<a class="sbn-s%s" href="%s"%s%s><img class="bg" src="%s" alt="" aria-hidden="true"%s><img class="fg" src="%s" alt="%s"%s></a>' % (' on' if n == 0 else '', href, ext, dq, img, lz, img, alt, lz)
        stage = ''.join(_a(n, x) for n, x in enumerate(sl))
    return ('<section class="sbn %s" aria-label="%s"><div class="sbn-in"><div class="sbn-head"><span class="sbn-badge">%s</span><span class="sbn-dots"></span></div>'
            '<div class="sbn-stage">%s<button class="sbn-nav p" type="button" aria-label="السابق">›</button><button class="sbn-nav n" type="button" aria-label="التالي">‹</button><span class="sbn-bar"><i></i></span></div>'
            '<a class="sbn-cta" href="%s" data-mig-buy>%s</a></div></section>') % (cls, label, badge, stage, cta_href, cta_text)  # «احجز باقة …»: a plan purchase (hidden in a store app while its buying is off, data/flags.js)

# Egypt: no partner banners yet (UAE banners removed) — both lists are empty, so each slot shows the «مساحة إعلانية محجوزة» placeholder
STRAT = sbn('strat', 'الشركاء الاستراتيجيين', '🏆 الشركاء الاستراتيجيون', [
    ('img/ban-s-arabcont-1.jpg', 'المقاولون العرب (عثمان أحمد عثمان وشركاه): الكباري والطرق والمباني العامة ومحطات الكهرباء والطاقة', '', 'https://www.arabcont.com'),
    ('img/ban-s-arabcont-2.jpg', 'المقاولون العرب – Arab Contractors', '', 'https://www.arabcont.com'),
    ('img/ban-s-soulwater.jpg', 'سول ووتر – Soul Water: محطات ومعدات معالجة وتنقية المياه', 'Soul Water'),
    ('img/ban-s-elsewedy.jpg', 'السويدي إليكتريك – Elsewedy Electric: الكابلات وملحقاتها', '', 'https://www.elsewedyelectric.com')], 'register.html#strategic', 'مساحتك هنا؟ احجز باقة الشريك الاستراتيجي ←')
PARTNER = sbn('core', 'الشركاء الأساسيين', '🤝 الشركاء الأساسيون', [
    ('img/ban-p-elmaleka.jpg', 'الملكة للتصنيع وتشكيل المعادن – ELMALEKA منذ 2005', 'الملكة'),
    ('img/ban-p-trust.jpg', 'تراست للأثاث المكتبي والفندقي – Trust Office and Hotel', 'Trust'),
    ('img/ban-p-lacto.jpg', 'لاكتو مصر – Lacto Misr: الألبان ومنتجاتها', '', 'https://www.lactomisr.com'),
    ('img/ban-p-elhelal.jpg', 'الهلال والنجمة الفضية – El Helal & Silver Star Egypt منذ 1945: الأدوات المنزلية البلاستيكية', 'الهلال')], 'register.html#partner', 'انضم إلى الشركاء الأساسيين ←')
# «شركاء المنصة» strip at the top of the footer on every page (seo_build.part.py site_footer(); also read from this file by a standalone
# generator run, so literal values only): the same real partners as STRAT / PARTNER above — edit the three lists together. Each logo is
# cut from the partner's own banner by tools/partner_logos.py. The card opens the partner's website, else the directory search for q
# (as the banner does). (logo, width, height, name AR, name EN, 'strat' | 'core', website, q, card background)
FTR_PARTNERS = [
    ('img/partners/arabcont.jpg', 142, 144, 'المقاولون العرب', 'The Arab Contractors', 'strat', 'https://www.arabcont.com', '', ''),
    ('img/partners/soulwater.jpg', 197, 144, 'سول ووتر – Soul Water', 'Soul Water', 'strat', '', 'Soul Water', ''),
    ('img/partners/elsewedy.jpg', 287, 144, 'السويدي إليكتريك', 'Elsewedy Electric', 'strat', 'https://www.elsewedyelectric.com', '', ''),
    ('img/partners/elmaleka.jpg', 119, 144, 'الملكة للتصنيع وتشكيل المعادن', 'ELMALEKA', 'core', '', 'الملكة', '#000'),
    ('img/partners/trust.jpg', 360, 131, 'تراست للأثاث المكتبي والفندقي', 'Trust Office and Hotel', 'core', '', 'Trust', ''),
    ('img/partners/lacto.jpg', 148, 144, 'لاكتو مصر', 'Lacto Misr', 'core', 'https://www.lactomisr.com', '', ''),
    ('img/partners/elhelal.jpg', 348, 144, 'الهلال والنجمة الفضية', 'El Helal & Silver Star', 'core', '', 'الهلال', ''),
]

# iPhone / iPad (WebKit on iOS, CSS.supports("-webkit-touch-callout", "none")), 2026-11-21: the strip's progress bar grows by a transform
# instead of its width (a width transition is a layout at every frame for the whole 5 s, even off screen) and a strip that is off screen
# does not turn its slides (each turn re-paints the blurred backdrop picture). The same look; desktop and Android are unchanged.
SBN_JS = """<script>(function(){var red=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches,ios=false;try{ios=!!(window.CSS&&CSS.supports&&CSS.supports("-webkit-touch-callout","none"))}catch(x){}[].forEach.call(document.querySelectorAll(".sbn"),function(sec,k){if(window.MIGOVL&&MIGOVL.banners)try{MIGOVL.banners(sec,k)}catch(x){}var st=sec.querySelector(".sbn-stage"),sl=[].slice.call(st.querySelectorAll(".sbn-s")),dots=sec.querySelector(".sbn-dots"),bar=sec.querySelector(".sbn-bar i"),cur=0,T,D=5000+k*700;if(sl.length<2){sec.querySelectorAll(".sbn-nav").forEach(function(b){b.hidden=true});return}dots.innerHTML=sl.map(function(_,i){return '<button type="button" aria-label="بانر '+(i+1)+'"'+(i?'':' class="on"')+'></button>'}).join("");var db=[].slice.call(dots.children);function show(n){cur=(n+sl.length)%sl.length;sl.forEach(function(s,i){s.classList.toggle("on",i===cur)});db.forEach(function(d,i){d.classList.toggle("on",i===cur)});if(bar&&!red){if(ios){bar.style.transition="none";bar.style.width="100%";bar.style.transformOrigin=document.documentElement.dir==="ltr"?"right":"left";bar.style.transform="scaleX(0)";void bar.offsetWidth;bar.style.transition="transform "+D+"ms linear";bar.style.transform="scaleX(1)"}else{bar.style.transition="none";bar.style.width="0";void bar.offsetWidth;bar.style.transition="width "+D+"ms linear";bar.style.width="100%"}}}var off=false;if(ios&&"IntersectionObserver"in window)new IntersectionObserver(function(e){off=!e[0].isIntersecting},{rootMargin:"200px 0px"}).observe(sec);function auto(){clearInterval(T);if(!red)T=setInterval(function(){if(!off)show(cur+1)},D)}sec.querySelector(".sbn-nav.n").onclick=function(){show(cur+1);auto()};sec.querySelector(".sbn-nav.p").onclick=function(){show(cur-1);auto()};dots.addEventListener("click",function(e){var i=db.indexOf(e.target);if(i>-1){show(i);auto()}});st.addEventListener("mouseenter",function(){clearInterval(T);if(bar){bar.style.transition="none"}});st.addEventListener("mouseleave",function(){show(cur);auto()});st.addEventListener("click",function(e){var a=e.target.closest(".sbn-s");if(a&&a.dataset.q){try{sessionStorage.setItem("mig-q",a.dataset.q)}catch(x){}}});var x0=null;st.addEventListener("touchstart",function(e){x0=e.touches[0].clientX},{passive:true});st.addEventListener("touchend",function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40){show(cur+(dx>0?1:-1));auto()}x0=null});show(0);auto()})})();</script>"""
GATES = {
 # the «طلبات الأسعار» menu (owner 2026-11-25): any active paid plan (data/plan.js FEAT.paid = 1; an expired plan counts as a visitor)
 'tenders': ('paid', 'المناقصات الحكومية'),
 'rfqs': ('paid', 'سوق طلبات الأسعار'),
 'winners': ('paid', 'الشركات الفائزة'),
 'agencies': ('paid', 'الجهات الحكومية'),
 'market-opportunities': ('paid', 'فرص السوق'),
 'deal': ('paid', 'دليل التمويل والشحن والتأمين'),
 'entity': ('awards', 'تفاصيل الترسيات والشركات الفائزة'),
 'winner': ('awards', 'ملف الشركة الفائزة وترسياتها'),
 'project': ('projects', 'تفاصيل المشروع وحزم المواد'),
 'radar': ('radar', 'تقرير رادار الفرص القطاعي'),
 'advisor': ('advisor', 'المستشار الذكي للصفقات'),
}
_ERR_OVERLAY = '<script>(function(){var shown=0;function rep(m,src,ln){if(shown++)return;var go=function(){var d=document.createElement("div");d.setAttribute("style","position:fixed;left:12px;bottom:12px;z-index:99999;max-width:420px;background:#fff3f3;color:#7a0c1c;border:1px solid #e5a1a8;border-radius:10px;padding:8px 30px 8px 10px;font:12px/1.5 Tajawal,sans-serif;direction:ltr;text-align:left;box-shadow:0 8px 20px -10px rgba(0,0,0,.4)");d.textContent="Page error (please send a screenshot): "+m+" @ "+String(src||"").split("/").pop().split("?")[0]+":"+(ln||"");var x=document.createElement("button");x.textContent="\\u00d7";x.setAttribute("style","position:absolute;right:6px;top:4px;border:0;background:none;font-size:16px;cursor:pointer;color:#7a0c1c");x.onclick=function(){d.remove();};d.appendChild(x);document.body.appendChild(d);};if(document.body)go();else document.addEventListener("DOMContentLoaded",go);}setTimeout(function(){if(document.readyState!=="loading")return;var done={};try{performance.getEntriesByType("resource").forEach(function(r){done[r.name.split("?")[0]]=1;});}catch(x){}var w=[].slice.call(document.scripts).filter(function(sc){return sc.src&&!done[sc.src.split("?")[0]];}).map(function(sc){return sc.src.split("/").pop().split("?")[0];});rep("page still loading after 10s; waiting for: "+(w.join(", ")||"(unknown)"),"","");},10000);window.addEventListener("error",function(e){if(e&&e.message)rep(e.message,e.filename,e.lineno);else if(e&&e.target&&e.target.src)rep("failed to load",e.target.src,"");},true);})();</script>'
_SCRIPT_RX = re.compile(r'<script src="(data/[\w-]+\.js)"[^>]*></script>')
def _dedupe_scripts(h):
    # the shared clients are now in every page head; a second copy appended by a part file (MIG_SCRIPTS, dash/track) is dropped
    seen = set()
    def f(m):
        if m.group(1) not in ('data/mig-api.js', 'data/mig-forms.js', 'data/holo.js'):
            return m.group(0)
        if m.group(1) in seen:
            return ''
        seen.add(m.group(1))
        return m.group(0)
    return _SCRIPT_RX.sub(f, h)
def _en_js(js):
    # English entries added by the part files (en_add → EN_NEW): pages that got a snapshot from winner.part.py receive only the entries
    # added after it (advisor, meeting, inbox, seo-admin, footer hubs …); every other page gets the whole set
    mk = 'var D=window.I18N_EN;if(!D)return;var A='
    if mk not in (js or ''):
        return '<script>' + EN_JS() + '</script>'
    try:
        have = _json_en.JSONDecoder().raw_decode(js[js.index(mk) + len(mk):])[0]
    except Exception:
        return '<script>' + EN_JS() + '</script>'
    late = dict((k, v) for k, v in EN_NEW.items() if k not in have)
    return ('<script>(function(){' + mk + _json_en.dumps(late, ensure_ascii=False) + ';for(var k in A)if(!(k in D))D[k]=A[k];})();</script>') if late else ''
def page(title, active, css, body, js, main=False, key='', app=False):
    # SEO §1.2: <title>, meta, fonts and CSS live in <head>; the error overlay only ships with MIG_DEBUG=1
    dbg = _ERR_OVERLAY if os.environ.get('MIG_DEBUG') == '1' else ''
    # window.MIGPAGE: the page key («dashboard», «advisor» …) — pages now live at clean URLs (/dashboard/), so scripts must not guess it from location.pathname
    bodyhtml = dbg + '<script>window.MIGPAGE="%s";</script>' % key + ('<script>window.BASSEM_STAND=1;</script>' if key in ('advisor', 'dashboard') and os.path.exists(B + 'data/bassem-stand.js') else '') + '<script src="data/i18n.js"></script><script>/* search helper for every page: in English, also match the English translation of an Arabic field (haystack + MIGHAY(field)) */ window.MIGHAY = function (s) { return window.MIGLANG === "en" && window.MIGTR ? " " + MIGTR(String(s || "")) : ""; };</script>' + '<script src="data/mig-overlay.js"></script><script src="data/overlay.js"></script>' + ('<script src="data/flags.js"></script>' if os.path.exists(B + 'data/flags.js') else '') + '<script src="data/plan.js"></script><script src="data/plans-live.js"></script><script src="data/mig-api.js"></script><script src="data/mig-forms.js"></script><script src="data/regions.js"></script><script src="data/opp-full.js"></script><script src="data/real.js"></script><script src="data/factories.js"></script>' + '<div dir="rtl" lang="ar">' + header(active) + body.replace('<!--STRAT-->', STRAT).replace('<!--PARTNER-->', PARTNER) + site_footer('ar', app=True) + FOOTER_FLOAT + '</div>' + '<script>window.MIGI18N_MORE&&MIGI18N_MORE()</script>' + SHARED_JS + SBN_JS + _en_js(js) + js + '<script src="data/bot-en.js"></script><script src="data/bot.js"></script><script src="data/captions.js" charset="utf-8"></script><script src="data/holo.js" defer></script><script src="data/janna-live.js" charset="utf-8"></script>' + ('<script src="data/janna-real.js" charset="utf-8"></script>' if os.path.exists(B + 'data/janna-real.js') else '<script src="data/janna-avatar.js" charset="utf-8"></script>') + ('<script src="data/janna-voice.js" charset="utf-8"></script>' if os.path.exists(B + 'data/janna-voice.js') else '') + ('<script src="data/bassem-real.js" charset="utf-8"></script>' if os.path.exists(B + 'data/bassem-real.js') else '') + '<script src="data/bassem.js" charset="utf-8"></script><script src="data/janna.js" charset="utf-8"></script>' + (('<script src="data/bassem-stand.js" defer></script>' if os.path.exists(B + 'data/bassem-stand.js') else '') if key in ('advisor', 'dashboard') else ('<script src="data/janna-welcome.js" defer></script>' if os.path.exists(B + 'data/janna-welcome.js') else '')) + '<script src="data/seo.js"></script><script src="data/settings-live.js"></script>' + ('<script src="data/link-fix.js" defer></script>' if os.path.exists(B + 'data/link-fix.js') else '')  # link-fix: legacy links straight to clean pages (owner 2026-11-18); deploy 2: overlay applier + plans/settings (P-S1a/b); standing Janna / Bassem (live hotfix #5-#8 ported)
    headhtml = seo_static_head(key, title, app=app) + FONTS + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}' + BASE_CSS + SHARED_CSS + css + '</style>'
    html = '<!doctype html>\n<html lang="ar" dir="rtl"><head>' + headhtml + '</head><body>' + bodyhtml + seo_static_tail() + '</body></html>'
    html = html.replace('{{LOGO_OGC}}', FAC_ICON)
    html = html.replace('@media (prefers-color-scheme: dark)', '@media not all').replace('matchMedia("(prefers-color-scheme: dark)").matches', '(document.documentElement.getAttribute("data-theme") === "dark")')
    # English first paint (bug sweep 2026-11-19, group 17): the page's parts of the English dictionary (tools/i18n_subset.py, loaded
    # like tools/company_media.py) — named in the MIGPAGE script; MIGI18N_MORE() above marks the end of the markup for data/i18n.js
    _t = B + 'tools/i18n_subset.py'
    if not hasattr(page, 'i18n') and os.path.exists(_t):
        page.i18n = {'__name__': 'i18n_subset', '__file__': _t}; exec(compile(open(_t, encoding='utf-8').read(), _t, 'exec'), page.i18n)
    # root = the build output: its data/ holds the PUBLISHED copies (members-only split), so a page's English part never carries the English of a locked text
    return page.i18n['page_part'](_dedupe_scripts(html), key, OUT, OUT) if hasattr(page, 'i18n') else _dedupe_scripts(html)
def split_part(path):
    s = open(path).read()
    css = ''.join(re.findall(r'<style>(.*?)</style>', s, re.S))
    s2 = re.sub(r'<style>.*?</style>', '', s, flags=re.S)
    js = ''.join('<script>' + x + '</script>' for x in re.findall(r'<script>(.*?)</script>', s2, re.S))
    body = re.sub(r'<script>.*?</script>', '', s2, flags=re.S)
    return css, body, js

# Egypt: no umbrella affiliation — any leftover GCC-affiliation phrase becomes the real operator
AFF_FIX = [('منصة تابعة لاتحاد الصناعات لدول مجلس التعاون الخليجي', 'منصة تديرها الجمعية المصرية للتنمية الصناعية'), ('المنصة تابعة لاتحاد الصناعات لدول مجلس التعاون الخليجي', 'المنصة تديرها الجمعية المصرية للتنمية الصناعية'), ('المنصة تابعة لاتحاد غرف دول مجلس التعاون الخليجي', 'المنصة تديرها الجمعية المصرية للتنمية الصناعية'), ('التابعة لاتحاد الصناعات لدول مجلس التعاون الخليجي', 'التي تديرها الجمعية المصرية للتنمية الصناعية'), ('التابعة لاتحاد غرف دول مجلس التعاون الخليجي', 'التي تديرها الجمعية المصرية للتنمية الصناعية')]
def fix(s):
    for a, b in AFF_FIX: s = s.replace(a, b)
    return s

pages = {}
# home
css, body, js = split_part(B + 'home2.part.html')
en_add([('أعضاء المنصة', 'Platform members')])
# members-only opportunities (owner 2026-11-28): the teasers' lock lines on the app pages (home strips, lists — data/opp-full.js)
en_add([('🔒 التفاصيل للأعضاء', '🔒 Details for members'), ('🔒 خبر المشروع للأعضاء — سجّل الآن', '🔒 The project news is for members — register now')])   # the home page's member-logo strip (the partners follow in the footer strip)
body = body.replace('<div class="scroll-prog" id="sprog"></div><button class="totop" id="totop" aria-label="العودة للأعلى">↑</button>', '')
pages['home'] = ('منصة صنع في مصر', 'home', css, fix(body), js.replace('{{DASH}}', 'dashboard.html').replace('{{PROFILE}}', 'factory.html'))
# honest counts (owner decision: no hand-written numbers): the home counters (%%N_…%% in home2.part.html) are computed here from the
# data files themselves; a file that cannot be read leaves «—» and the page's own script fills the counter from the loaded data
def _data_len(fn, var):
    try:
        import json as _jd
        _s = open(B + 'data/' + fn, encoding='utf-8').read(); _i = _s.index('window.' + var + '=') + len('window.' + var + '=')
        return len([x for x in _jd.JSONDecoder().raw_decode(_s[_i:].lstrip())[0] if x is not None])   # a null slot = a removed listing (data/oldfac.js)
    except Exception:
        return 0
def _fill_counts(h):
    for tok, fn, var in (('DIR', 'oldfac.js', 'MIGOLDFAC'), ('ZONES', 'zones.js', 'MIGZONES'), ('PROD', 'oldprod.js', 'MIGOLDP'), ('FAC', 'factories.js', 'MIGFAC')):
        n = _data_len(fn, var)
        h = h.replace('%%N_' + tok + 'F%%', '{:,}'.format(n) if n else '—').replace('%%N_' + tok + '%%', str(n))
    return h
pages['home'] = pages['home'][:3] + (_fill_counts(pages['home'][3]),) + pages['home'][4:]
# market
css, body, js = split_part(B + 'market.part.html')
pages['market'] = ('سوق صنع في مصر', 'market', css + '\n.spr { display: block; width: 100%; aspect-ratio: 1; background-size: 1000% 1000%; background-repeat: no-repeat; }\n.th { width: 100%; min-width: 0; } .th > .spr { width: 100%; height: 100%; min-width: 64px; min-height: 64px; }', body, '<script src="data/oldprod.js"></script><script src="data/oldfac.js"></script>' + js)
# dashboard
css, body, js = split_part(B + 'dash.part.html')
pages['dashboard'] = ('لوحتي – صنع في مصر', 'rfq', css, body, js + '<script src="data/dash-products.js"></script><script src="data/dash-company.js"></script>')  # deploy 2: «منتجاتي», «ملف الشركة», «فواتيري» (MIGDASH, P-D1)
# factory profile
pm = prof[prof.index('<main class="wrap" id="top">'):prof.index('<footer class="site-ftr">')]
pj = '<script>' + re.findall(r'<script>(.*?)</script>', prof, re.S)[-1] + '</script>'
_crumb = re.search(r'<a href="#top">الرئيسية</a><span>›</span><a href="#top">المصانع</a><span>›</span><a href="#top">(.*?)</a>', pm)
if _crumb:
    _sec = _crumb.group(1)
    _cat = next((c for k, c in [('زجاج', 'cat-glass'), ('معاد', 'cat-metal'), ('ألمنيوم', 'cat-metal'), ('حديد', 'cat-metal'), ('بناء', 'cat-build'), ('أسمنت', 'cat-build'), ('بلاستيك', 'cat-plastic'), ('غذ', 'cat-food'), ('كهرب', 'cat-elec'), ('بتروكيم', 'cat-petro'), ('دواء', 'cat-med'), ('أدوية', 'cat-med'), ('أثاث', 'cat-furn'), ('كيماو', 'cat-petro'), ('أسمدة', 'cat-petro'), ('سيراميك', 'cat-build'), ('هندس', 'cat-elec'), ('صلب', 'cat-metal')] if k in _sec), '')
    pm = pm.replace(_crumb.group(0), '<a href="home.html">الرئيسية</a><span>›</span><a href="factories.html">المصانع</a><span>›</span><a href="market.html%s">%s</a>' % ('#' + _cat if _cat else '', _sec))
for a, b in [('<a class="sim" href="#top"><span class="av">ز</span>', '<a class="sim" href="market.html#cat-glass"><span class="av">ز</span>'),
             ('<a class="sim" href="#top"><span class="av">أ</span>', '<a class="sim" href="market.html#cat-metal"><span class="av">أ</span>'),
             ('<a class="sim" href="#top"><span class="av">ب</span>', '<a class="sim" href="market.html#cat-build"><span class="av">ب</span>'),
             ('<a class="btn btn-green" href="#devnotes">إدارة ملف المصنع</a>', '<a class="btn btn-green" href="dashboard.html#profile">إدارة ملف المصنع</a>'),
             ('data-toast="يفتح صفحة المنتج في السوق">التفاصيل</button>', 'onclick="location.href=\'market.html\'">التفاصيل</button>')]:
    pm = pm.replace(a, b)
pm = pm.replace('<a class="sim" href="#top">', '<a class="sim" href="factories.html">')
pj = pj.replace('<button class="btn btn-sm btn-line" data-toast="يفتح صفحة المنتج في السوق">التفاصيل</button>', '<button class="btn btn-sm btn-line" type="button" data-pdet="\' + p[1] + \'">التفاصيل</button>')
# factory name for the page title comes from the sample profile itself (factory-profile.html <h1>)
_h1 = re.search(r'<h1[^>]*>(.*?)(?:<small|</h1>)', pm, re.S)
FAC_NAME = re.sub(r'<[^>]+>', '', _h1.group(1)).strip() if _h1 else ''
# PDET: generic product-details modal for the sample factory profile — reads the product card it was opened from
PDET = """<style>.pdov .box.oldv{grid-template-columns:1fr}.pdov{position:fixed;inset:0;z-index:90;background:rgba(26,4,9,.6);display:grid;place-items:center;padding:16px}.pdov .box{background:var(--surface);color:var(--fg);border-radius:18px;max-width:760px;width:100%;max-height:90vh;overflow:auto;display:grid;grid-template-columns:300px minmax(0,1fr)}.pdov .im{background:#FBEFF1 url(img/p0.jpg) center/cover;min-height:280px;border-radius:18px 0 0 18px;position:relative}.pdov .im b{position:absolute;bottom:12px;inset-inline-start:12px;background:rgba(74,5,16,.85);color:#fff;border-radius:8px;padding:2px 10px}.pdov .bd{padding:20px;display:flex;flex-direction:column;gap:10px}.pdov h2{font-size:1.25rem;font-weight:900}.pdov dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:.88rem}.pdov dt{color:var(--muted)}.pdov dd{margin:0;font-weight:700}.pdov .x{position:absolute;top:10px;inset-inline-end:10px;width:34px;height:34px;border-radius:50%;border:0;background:#fff;cursor:pointer;font-size:1rem}.pdov .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}@media(max-width:640px){.pdov .box{grid-template-columns:1fr}.pdov .im{border-radius:18px 18px 0 0;min-height:180px}}</style><script>(function(){
function esc(t){return String(t==null?"":t).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
document.addEventListener("click",function(e){var b=e.target.closest("[data-pdet]");if(!b)return;var v=b.getAttribute("data-pdet"),card=b.closest(".prod,article"),h=document.querySelector("main h1"),fac="";
if(h){fac=(h.childNodes[0]&&h.childNodes[0].nodeType===3?h.childNodes[0].textContent:h.textContent).trim();}
var t=card&&card.querySelector("h3")?card.querySelector("h3").textContent.trim():"منتج";var badge=card&&card.querySelector(".mm")?card.querySelector(".mm").textContent.trim():"";
var bg="",th=card&&card.querySelector(".thumb");if(th){var cs=getComputedStyle(th).backgroundImage;if(cs&&cs!=="none")bg=cs;var im=th.querySelector("img");if(!bg&&im)bg='url("'+im.currentSrc+'")';}
var rows="";if(card)[].forEach.call(card.querySelectorAll(".row"),function(r){var c=r.children;if(c.length>1)rows+="<dt>"+esc(c[0].textContent)+"</dt><dd"+(c[1].classList.contains("num")?' class="num" dir="ltr" style="text-align:right"':"")+">"+esc(c[1].textContent)+"</dd>";});
var o=document.createElement("div");o.className="pdov";o.innerHTML='<div class="box" role="dialog" aria-modal="true" aria-label="'+esc(t)+'" style="position:relative"><button class="x" type="button" aria-label="إغلاق">✕</button><div class="im"'+(bg?' style="background-image:'+esc(bg)+'"':"")+'>'+(badge?'<b class="num">'+esc(badge)+'</b>':"")+'</div><div class="bd"><span class="chip chip-green" style="align-self:flex-start">✓ صنع في مصر</span><h2>'+esc(t)+'</h2><dl>'+(fac?'<dt>المصنع</dt><dd>'+esc(fac)+'</dd>':"")+rows+'<dt>الحد الأدنى للطلب</dt><dd>حسب الاتفاق مع المصنع</dd><dt>الأسواق</dt><dd>السوق المصري والتصدير</dd></dl><div class="acts"><a class="btn btn-green" href="#rfq" data-prod="'+esc(v)+'" data-close="1">طلب سعر لهذا المنتج</a><a class="btn btn-line" href="market.html">منتجات القسم في السوق</a></div><span class="ph-note">المواصفات التفصيلية والشهادات تُرفع من لوحة المصنع.</span></div></div>';
document.body.appendChild(o);o.addEventListener("click",function(ev){if(ev.target===o||ev.target.closest(".x")||ev.target.closest("[data-close]")){o.remove();}});});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){var o=document.querySelector(".pdov");if(o)o.remove();}});
})();</script>"""
pages['factory'] = ('ملف المصنع – ' + FAC_NAME if FAC_NAME else 'ملف المصنع – صنع في مصر', 'factories', '', pm, pj + PDET)
pj_fix = pj.replace('data-toast="يفتح صفحة المنتج في السوق"', '')
# new pages
for key, (title, active, css2, body2, js2) in PAGES.items():
    h = HEROS.get(key)
    hero_html = hero(*h) if h else ''
    body2 = body2.replace('%HERO%', hero_html)
    js_full = ('<script>(function(){"use strict";var $=function(s){return document.querySelector(s)};var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};'
               'var HERO=function(img,crumb,t,p,a){return \'<section class="phero"><span class="bg" style="background-image:url(img/\'+img+\')"></span><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › \'+crumb+\'</nav><h1>\'+t+\'</h1><p>\'+p+\'</p>\'+(a?\'<div class="acts">\'+a+\'</div>\':"")+\'</div></section>\'};'
               + js2 + '})();</script>') if js2 else ''
    pages[key] = (title, active, css2, fix(body2), js_full)

DATA = '<script src="data/projects.js"></script><script src="data/indimg.js"></script>'
for k in ['home', 'projects', 'project', 'leads', 'contractor-leads', 'consultant-leads', 'lead', 'project-news']:
    t = pages[k]; pages[k] = (t[0], t[1], t[2] + (PLANS_CSS if k == 'home' else ''), t[3], DATA + ('<script src="data/world.js"></script><script src="data/zones.js"></script><script src="data/egadm.js"></script><script src="data/samap.js"></script><script src="data/products.js"></script><script src="data/deals.js"></script><script src="data/offers.js"></script><script src="data/oldfac.js"></script><script src="data/oldprod.js"></script><script src="data/oldtend.js"></script>' if k == 'home' else '') + ('<script>' + PLANS_JS.replace('var PLANS', 'window.plansHTML = null; var PLANS') + 'window.plansHTML = plansHTML;</script>' if k == 'home' else '') + t[4])
t = pages['tenders']; pages['tenders'] = (t[0], t[1], t[2], t[3], '<script src="data/oldtend.js"></script>' + t[4] + PDET.split('</style>')[0] + '</style>')
t = pages['rfqs']; pages['rfqs'] = (t[0], t[1], t[2], t[3], '<script src="data/oldrfq.js"></script>' + t[4] + PDET.split('</style>')[0] + '</style>')
t = pages['factories']; pages['factories'] = (t[0], t[1], t[2], t[3], '<script src="data/oldfac.js" async onload="window.__ofl && window.__ofl()"></script><script>' + open(B + 'data/facx.js', encoding='utf-8').read() + '</script>' + t[4] + PDET.split('</style>')[0] + '</style><script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){var o=document.querySelector(".pdov");if(o)o.remove();}});</script>')
t = pages['about']; pages['about'] = (t[0], t[1], t[2], t[3], '<script src="data/world.js"></script><script src="data/zones.js"></script><script src="data/egadm.js"></script><script src="data/samap.js"></script>' + t[4])
for _k in ('media-center', 'videos', 'home'):
    if _k in pages: t = pages[_k]; pages[_k] = (t[0], t[1], t[2], t[3], '<script src="data/videos.js"></script>' + t[4])
t = pages['city']; pages['city'] = (t[0], t[1], t[2], t[3], '<script src="data/zones.js"></script><script src="data/projects.js"></script><script src="data/indimg.js"></script><script src="data/oldfac.js"></script><script src="data/oldprod.js"></script><script src="data/facx.js"></script>' + t[4])
t = pages['company']; pages['company'] = (t[0], t[1], t[2], t[3], '<script src="data/oldfac.js"></script><script src="data/oldfacd.js"></script><script src="data/oldprod.js"></script><script src="data/facx.js"></script>' + t[4])
t = pages['suppliers']; pages['suppliers'] = (t[0], t[1], t[2], t[3], '<script src="data/oldfac.js"></script>' + t[4])
t = pages['outlets']; pages['outlets'] = (t[0], t[1], t[2], t[3], '<script src="data/offers.js"></script>' + t[4])
t = pages['offers']; pages['offers'] = (t[0], t[1], t[2], t[3], '<script src="data/offers.js"></script>' + t[4])
t = pages['offer']; pages['offer'] = (t[0], t[1], t[2], t[3], '<script src="data/world.js"></script><script src="data/offers.js"></script>' + t[4])
t = pages['cities']; pages['cities'] = (t[0], t[1], t[2], t[3], '<script src="data/zones.js"></script><script src="data/indimg.js"></script>' + t[4])
t = pages['event']; pages['event'] = (t[0], t[1], t[2], t[3], '<script src="data/world.js"></script>' + t[4])
t = pages['map']; pages['map'] = (t[0], t[1], t[2], t[3], '<script src="data/world.js"></script><script src="data/zones.js"></script><script src="data/egadm.js"></script><script src="data/samap.js"></script><script src="data/projects.js"></script><script src="data/indimg.js"></script>' + t[4])
t = pages['radar']; pages['radar'] = (t[0], t[1], t[2], t[3], '<script src="data/projects.js"></script><script src="data/indimg.js"></script><script src="data/registry.js"></script>' + t[4])
t = pages['region']; pages['region'] = (t[0], t[1], t[2], t[3], '<script src="data/products.js"></script><script src="data/oldfac.js"></script><script src="data/facx.js"></script><script src="data/projects.js"></script><script src="data/indimg.js"></script>' + t[4])
for k in ['winners', 'agencies', 'contractors', 'entity']:
    t = pages[k]; pages[k] = (t[0], t[1], t[2], t[3], '<script src="data/registry.js"></script>' + t[4])
t = pages['export-market']; pages['export-market'] = (t[0], t[1], t[2], t[3], '<script src="data/world.js"></script><script src="data/exportmap.js"></script>' + t[4])
t = pages['advisor']; pages['advisor'] = (t[0], t[1], t[2], t[3], '<script src="data/oldrfq.js"></script>' + ('<script src="data/advisor-guides.js" charset="utf-8"></script>' if os.path.exists(B + 'data/advisor-guides.js') else '') + t[4])
for k, (feat, ttl) in GATES.items():
    # advisor.html#login=<code> (Worker activation / e-mailed sign-in link) must reach the page on a new device: advisor.part.py signs in, or shows a lock box when the link is refused
    skip = ' && !/[#&]login=[A-Za-z0-9]{8,100}/.test(location.hash || "") && !(function(){try{return localStorage.getItem("mig-tok")}catch(e){return null}})()' if k == 'advisor' else ''
    # advisor.part.py waits for /api/me and shows its own lock box + e-mail-code sign-in to anyone without a partner plan (MIGPLAN.gate
    # exempts the advisor page by design). On the clean URL /advisor/ plan.js cannot tell the page from location.pathname, so the page key
    # (window.MIGPAGE) decides before MIGPLAN.gate is even asked (it would otherwise queue a redirect after /api/me).
    pre = ' && window.MIGPAGE !== "advisor"' if k == 'advisor' else ''
    if k not in pages:
        continue
    t = pages[k]; pages[k] = (t[0], t[1], t[2], '<script>(function(){ var P = window.MIGPLAN; if (P%s && (P.gate ? P.gate("%s") : !P.can("%s"))%s) { try { sessionStorage.setItem("mig-gate", "%s"); } catch (e) {} location.replace(P.gateUrl ? P.gateUrl("%s") : "register.html#plans"); } })();</script>' % (pre, feat, feat, skip, ttl, feat) + t[3], t[4])
import hashlib as _hl, re as _re
def _ver(m):
    f = OUT + 'data/' + m.group(1) + '.js'   # the PUBLISHED copy (members-only split: the redacted files differ from the repository's)
    h = _hl.md5(open(f, 'rb').read()).hexdigest()[:8] if os.path.exists(f) else '0'
    return 'src="data/%s.js?v=%s"' % (m.group(1), h)
def _bust(h):
    # cache-busting: every data file URL carries its content hash so browsers never mix a new page with an old data file
    f = B + 'data/i18n-en.js'
    v = _hl.md5(open(f, 'rb').read()).hexdigest()[:8] if os.path.exists(f) else '0'
    h = h.replace('<script src="data/i18n.js"></script>', '<script>window.MIGVER_EN="?v=%s"</script><script src="data/i18n.js"></script>' % v, 1)
    # members-only opportunities (data/opp-full.js): a member's locked fields go back into each data file right after it ran
    h = _re.sub(r'(<script src="data/(?:real|oldtend|oldrfq|projects)\.js"[^>]*></script>)', r'\1<script>window.MIGOPP&&MIGOPP.patch()</script>', h)
    return _re.sub(r'src="data/([\w-]+)\.js"', _ver, h)
for _k in ('panel', 'login'):
    pages.pop(_k, None)                        # legacy routes: /panel.html and /login.html stay on the owner's old system (deploy 2 keeps them)
seo_prepare(OUT)                       # SEO: hash maps for seo_rewrite_links (company.html#N → /factories/<slug>/ …)
if globals().get('PPROF'): pages['market'] = PPROF['market'](pages['market'])   # PPROF hook (seo_pprof.part.py): product-view CSS + quick-view data for /market/
_SC = SEO_STATE['cfg']
# English for the footer (site_footer: hub links, partners, quick links …): the generator renders both languages from the same data and
# markup, so the text nodes and the alt / title / aria-label values pair up one to one (entities decoded: «&» must not reach the page as «&amp;»)
import html as _html_en
def _txt_nodes(h):
    h = re.sub(r'<script\b[\s\S]*?</script>', '', h)
    return [_html_en.unescape(re.sub(r'\s+', ' ', t).strip()) for t in re.findall(r'>([^<>]+)<', h) if t.strip()] + \
           [_html_en.unescape(v) for v in re.findall(r'\s(?:alt|title|aria-label)="([^"]*)"', h)]
try:
    _fa, _fe = _txt_nodes(site_footer('ar', app=True)), _txt_nodes(site_footer('en', app=True))
    if len(_fa) == len(_fe):
        en_add([(a, b) for a, b in zip(_fa, _fe) if a != b and re.search('[؀-ۿ]', a)])
    else:
        print('footer EN pairs skipped: %d Arabic vs %d English strings' % (len(_fa), len(_fe)))
except Exception as _e:
    print('footer EN pairs skipped:', _e)
# the identity sentence (seo.part.py, approved English 2026-11-28): en_add's number pattern takes the comma after the year with it
# («Launched in 2020, it …» → «Launched in {n} it …»); the year alone is the number, the comma stays
for _k in list(EN_NEW):
    if 'Launched in {n} it is the first platform' in EN_NEW[_k]:
        EN_NEW[_k] = EN_NEW[_k].replace('Launched in {n} it is the first platform', 'Launched in {n}, it is the first platform')
def _meta_en(key, title, app):
    # English mode translates <meta content> (data/i18n.js): give this page's Arabic meta description its English, from the dictionary
    # when it covers the sentence, else an honest generic line with the page's English name (one entry, this page only)
    try:
        import html as _hm
        m = re.search(r'<meta name="description" content="([^"]*)"', seo_static_head(key, title, app=app))
        ar = _hm.unescape(m.group(1)) if m else ''
        if not ar or not re.search('[؀-ۿ]', ar):
            return ''
        d0 = (SEO.get(key) or ('',))[0]
        en = seo_tr(ar) or (seo_tr(d0) if d0 else None)
        if not en:
            t_en = seo_tr(title.split(' – ')[0]) if title else None
            en = (t_en + ' – ' if t_en and not re.search('[؀-ۿ]', t_en) else '') + 'Made in Egypt Gate, the B2B platform that connects Egyptian factories and suppliers with local and international buyers.'
        k = re.sub(r'[0-9٠-٩][0-9٠-٩,.:%/\-]*', '{n}', re.sub(r'\s+', ' ', ar).strip())
        return '<script>(function(){var D=window.I18N_EN;if(D&&!(%s in D))D[%s]=%s;})();</script>' % (_json_en.dumps(k, ensure_ascii=False), _json_en.dumps(k, ensure_ascii=False), _json_en.dumps(en, ensure_ascii=False))
    except Exception as e:
        print('meta EN skipped for', key, e)
        return ''
from urllib.parse import quote as _quote_url
def _login_href(p):
    # the header's «دخول»: the sign-in page with this page as ?next= (the same encoding as encodeURIComponent), except on the home page,
    # where it carries none: after the code the factory goes on to its dashboard, as on the Saudi page (data/mig-api.js loginUrl)
    if re.match(r'^/(?:en/?)?(?:index\.html|home\.html)?$', p or '/'):
        return '/login/'
    return '/login/?next=' + _quote_url(p, safe='')
for key, (title, active, css, body, js) in pages.items():
    if key == 'factory' or (key in _SC['shim_keys'] and key not in _SC['app_paths']):
        continue                               # retired demo profile / hash templates → shims written by build_static_seo
    app = key in _SC['generated_keys']
    if app and key not in _SC['app_paths']:
        continue                               # export-market → /export/<market>/ pages
    path = _SC['app_paths'][key] if app else _SC['static_paths'].get(key, '/%s/' % key)
    fp = OUT + path.lstrip('/') + 'index.html'
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    if key in PAGE_WRITERS:
        PAGE_WRITERS[key](OUT, path)           # a standalone page writes its own files (signin.part.py: /login/ and /en/login/)
        continue
    # every link is rewritten to its clean URL (data/mig-api.js finds the header sign-in link by its data-mig-dash attribute); the header's
    # «دخول» goes to the sign-in page with this page as ?next= (data/mig-api.js keeps it current: language, hash routes)
    open(fp, 'w').write(seo_rewrite_links(_bust(page(title, active, css, body, js + _meta_en(key, title, app), key=key, app=app))).replace(
        'href="/login/" data-mig-dash="1"', 'href="%s" data-mig-dash="1"' % _login_href(path), 1))   # home → OUT/index.html (static_paths home = "/")
seo_files(OUT, list(pages.keys()))
print(sorted(os.listdir(OUT)))
# janna.html — full-screen kiosk page for a physical hologram display (black background, Janna centred, tap to talk)
open(OUT + 'janna.html', 'w').write(_bust('''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>جنة · مساعدة منصة صنع في مصر</title><meta name="robots" content="noindex"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet"><style>html,body{background:#000;margin:0;height:100%}</style></head><body class="jn-kiosk"><script>window.JANNA_KIOSK=1;window.MIGPAGE="janna";try{var _l=/[?&]lang=(en|ar)\b/.exec(location.search);if(_l)sessionStorage.setItem("janna-lang",_l[1]);}catch(e){}</script><script src="data/i18n.js"></script><script src="data/bot-en.js"></script><script src="data/bot.js"></script><script src="data/captions.js" charset="utf-8"></script><script src="data/holo.js" defer></script>''' + ('<script src="data/janna-real.js" charset="utf-8"></script>' if os.path.exists(B + 'data/janna-real.js') else '<script src="data/janna-avatar.js" charset="utf-8"></script>') + ('<script src="data/janna-voice.js" charset="utf-8"></script>' if os.path.exists(B + 'data/janna-voice.js') else '') + '''<script src="data/janna.js" charset="utf-8"></script>''' + guard_tag() + '''</body></html>'''))  # «حماية الموقع»: data/guard.js on the kiosk too
SEO_STATS = build_static_seo(OUT)   # SEO §1: data pages, hubs, shims, sitemaps, robots.txt, _headers, _routes.json, _redirects, /_seo/*
print('SEO', {k: SEO_STATS[k] for k in ('pages_ar', 'pages_en', 'indexable', 'noindex', 'static_rows', 'sitemap_urls', 'problem_count', 'seconds')})
