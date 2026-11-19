# -*- coding: utf-8 -*-
# «لوحة فريق الـ SEO» — seo-team.html → /seo-team/ (clean URL; the SEO build 301s /seo-team.html). ACC-CONTRACT §12.2 (owner request
# 2026-11-18: a separate, simple dashboard for the SEO team that works by hand). Arabic first, full English (T(ar, en) in the script),
# mobile/tablet friendly, the site's look (page(): header, footer, tokens). Logic: data/team-seo.js · styles: data/team.css (inlined here).
# It uses ONLY the existing SEO API /api/seo/* (functions/_lib/seo-api.js), exactly like seo-admin.html (same endpoints, same token);
# seo-admin.html stays the full workspace. Roles: seo | editor | admin | owner (window.MIGAPI /api/me; the API re-checks every call);
# anyone else sees the live lock box «غير مصرّح لك بدخول هذه الصفحة». noindex,nofollow and kept out of the sitemaps (below).
import os as _tms_os, re as _tms_re


def _tms_css():
    f = B + 'data/team.css'
    return open(f, encoding='utf-8').read() if _tms_os.path.exists(f) else ''


TEAM_SEO_BODY = '''
<div class="tm-root" id="tmRoot" translate="no">
<section class="tm-top"><div class="wrap"><div class="tm-hd"><nav class="crumb" id="tmCrumb"><a href="home.html">الرئيسية</a> › <span>لوحة فريق الـ SEO</span></nav>
<h1 id="tmH1">لوحة فريق الـ SEO</h1>
<p id="tmLead">عناوين الصفحات ووصفها في جوجل، الكلمات المفتاحية، التحويلات 301، فحص الصفحات والأرشفة — لفريق الـ SEO اللي شغال يدوي.</p></div>
<div class="tm-who" id="tmWho"></div></div></section>
<main class="wrap tm-main" id="top"><div id="tmApp" aria-live="polite"><div class="tm-card"><p class="tm-load">⏳ جارٍ التحميل…</p></div></div>
<noscript><p class="muted">اللوحة دي محتاجة JavaScript. This board needs JavaScript.</p></noscript></main>
</div>
<script src="data/team-seo.js"></script>
'''

PAGES['seo-team'] = ('لوحة فريق الـ SEO – صنع في مصر', '', globals().get('COMMON_CSS', '') + _tms_css(), TEAM_SEO_BODY, '')

# staff page: noindex,nofollow (the sitemap builder skips noindex pages, so it stays out of every sitemap) and out of the old sitemap list
if 'seo_static_head' in globals():
    _tms_static_head = seo_static_head

    def seo_static_head(key, title, *a, **k):
        h = _tms_static_head(key, title, *a, **k)
        if key == 'seo-team':
            h = _tms_re.sub(r'<meta name="robots" content="[^"]*"', '<meta name="robots" content="noindex,nofollow"', h, count=1)
        return h
if 'seo_files' in globals():
    _tms_seo_files = seo_files

    def seo_files(OUT, keys):
        return _tms_seo_files(OUT, [k for k in keys if k != 'seo-team'])
