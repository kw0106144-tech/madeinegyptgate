# -*- coding: utf-8 -*-
# «لوحة فريق الداتا — مكتب الاستقبال» — data-desk.html → /data-desk/ (clean URL; the SEO build 301s /data-desk.html). ACC-CONTRACT §12.2–§12.3
# (owner request 2026-11-18: a client comes to the office and wants to place an order, be registered by hand, or the team adds a
# project or a tender). Big buttons, big inputs, tablet first; Arabic first with full English. Logic: data/team-data.js · styles:
# data/team.css (inlined here). Endpoints: POST /api/team/desk/{inquiry,member,content}, GET /api/team/desk/mine (Worker, acc-core).
# Roles: data | admin | owner (window.MIGAPI /api/me; the Worker re-checks every call); anyone else → the live lock box.
# Every result shown is the server's answer (ref, routed count, member id + status, published/draft); offline → an honest message.
# noindex,nofollow and kept out of the sitemaps (below).
import os as _tmd_os, re as _tmd_re


def _tmd_css():
    f = B + 'data/team.css'
    return open(f, encoding='utf-8').read() if _tmd_os.path.exists(f) else ''


TEAM_DATA_BODY = '''
<div class="tm-root" id="tmRoot" translate="no">
<section class="tm-top"><div class="wrap"><div class="tm-hd"><nav class="crumb" id="tmCrumb"><a href="home.html">الرئيسية</a> › <span>مكتب الاستقبال</span></nav>
<h1 id="tmH1">لوحة فريق الداتا — مكتب الاستقبال</h1>
<p id="tmLead">لما عميل ييجي المقر: طلبية جديدة، تسجيل عضو يدوي، إضافة مشروع أو مناقصة أو طلب عرض سعر — وكل نتيجة هي رد السيرفر الحقيقي.</p></div>
<div class="tm-who" id="tmWho"></div></div></section>
<main class="wrap tm-main" id="top"><div id="tmApp" aria-live="polite"><div class="tm-card"><p class="tm-load">⏳ جارٍ التحميل…</p></div></div>
<noscript><p class="muted">اللوحة دي محتاجة JavaScript. This board needs JavaScript.</p></noscript></main>
</div>
<script src="data/team-data.js"></script>
'''

PAGES['data-desk'] = ('لوحة فريق الداتا — مكتب الاستقبال – صنع في مصر', '', globals().get('COMMON_CSS', '') + _tmd_css(), TEAM_DATA_BODY, '')

# staff page: noindex,nofollow (the sitemap builder skips noindex pages, so it stays out of every sitemap) and out of the old sitemap list
if 'seo_static_head' in globals():
    _tmd_static_head = seo_static_head

    def seo_static_head(key, title, *a, **k):
        h = _tmd_static_head(key, title, *a, **k)
        if key == 'data-desk':
            h = _tmd_re.sub(r'<meta name="robots" content="[^"]*"', '<meta name="robots" content="noindex,nofollow"', h, count=1)
        return h
if 'seo_files' in globals():
    _tmd_seo_files = seo_files

    def seo_files(OUT, keys):
        return _tmd_seo_files(OUT, [k for k in keys if k != 'data-desk'])
