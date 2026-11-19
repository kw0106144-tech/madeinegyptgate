# -*- coding: utf-8 -*-
"""Rich company profile for the static SEO pages /factories/<slug>/ (+ /en/ twins): the layout of the sister site's factory page
(madeinsaudigate.com/factory.html, adapted in factory-profile.html) built on REAL data only.

    breadcrumb → media carousel (counter, prev/next, swipe, keyboard, «فيديو»/«صورة» badge, caption per slide)
    → overlapping identity card (logo or monogram, honest badges, H1, other-language name, location, sector › sub-sector, RFQ,
      platform WhatsApp, favourite, share) → stats band (real facts only) → sticky section tabs with scrollspy
    → نبذة · المنتجات · [القدرات الإنتاجية] · الشهادات · [أسواق التصدير] · [الصور والفيديو] · طلب عرض سعر   + contact sidebar
    → منشآت مشابهة (logo / photo cards) → related links

Loaded by seo_build.part.py through its «# FPROF hook» lines with explicit helper injection:
    FPROF.update(fprof_module({... helpers ...}))  →  {'render': render(c, L, classic_body, meta) -> body, 'assets': assets(css, js) -> (css, js)}
render() keeps everything the classic page had (H1 + intro with the SEO overrides, breadcrumb, «عن المنشأة» text, the vtag/pubtag labels,
product links, similar companies, hub links, RFQ box text, facts with their links); <head>, title, description, canonical, hreflang,
robots and JSON-LD are untouched (a real logo may be added to the Organization). English: the EN gate decides on the CLASSIC body,
so the set of /en/ pages never changes; a new EN body that would fail the gate falls back to the classic body (counted in warnings).

Media index = tools/company_media.py (its docstring holds the full contract), keyed by the generator's own c['path'] (AR page):
    {"_meta": {...}, "<AR page path>": {"logo": {src,w,h,from}|null, "photos": [{src,w,h,sm,cap_ar,cap_en,credit,origin}],
        "videos": [{yt,title_ar,title_en,thumb,thumb_w,thumb_h,...}], "products": [{key,name_ar,name_en,img,cat_ar,cat_en,href,from}],
        "context": [{src,w,h,sm,cap_ar,cap_en,kind,credit}], "facts": {"<key>": {label_ar,label_en,value_ar,value_en,source,source_url?,href?}}}}
    sm = a ≤640 px copy (srcset), credit = {author, license, url} (Wikimedia Commons: shown on the page, CC BY / BY-SA need it),
    value_en null = no faithful English (the fact shows on the Arabic page only). Keys starting with "_" are metadata.
Where the index comes from (choice, 2026-11-18): REGENERATED IN THE BUILD. The first company page calls
    company_media.build_index(S, root=B, tr=tr, write=True)
on the generator's own model (≈1–2 s; deterministic, no network): seo/company-media.json and img/fprof/*.webp are refreshed (derivative
names hash source + settings, an unchanged input rewrites nothing, files no entry uses any more are removed), so a page can never use a
stale index and a data change shows up as a reviewable diff of seo/company-media.json + img/fprof/ — commit both with the data change
(the deploy serves img/fprof/ from the tree like every other /img/ file). Fallbacks: MIG_FPROF_MEDIA=<file> reads that file instead
(tests, previews); MIG_FPROF_MEDIA_REBUILD=0 reads the committed seo/company-media.json; a failing rebuild falls back to the committed
file with a warning (fprof_media_rebuild_failed). A company the index knows is shown exactly as the index says (its rejected blank /
placeholder / shared pictures stay out); one it does not know falls back to the generator's own logo and product crops.
Honesty: nothing is invented — no numbers, capacities, certificates, markets, specs or photos; sections without data are left out or show
an honest empty state that invites the company to add its own; every photo that is not the company's own is captioned «ليست صورة المنشأة»;
Commons photos carry their author + licence (hero caption on wide screens, «مصادر الصور» list in the photos section).
Privacy: no phone, mobile or e-mail of a company; contact paths are the platform's (RFQ, the platform WhatsApp, Janna).
Switch off with MIG_FPROF=0 (classic layout).
"""


def fprof_module(H):
    import os
    import re
    import json
    import time
    from urllib.parse import quote, unquote, urlparse

    S, B, SITE = H['S'], H['B'], H['SITE']
    esc, X, T, tr, lk, pct, nfc, sha = H['esc'], H['X'], H['T'], H['tr'], H['lk'], H['pct'], H['nfc'], H['sha']
    abs_url, crumbs, home_crumb = H['abs_url'], H['crumbs'], H['home_crumb']
    type_label, sec_name, gov_name, city_text = H['type_label'], H['sec_name'], H['gov_name'], H['city_text']
    company_desc_en, first_words, fmt_date = H['company_desc_en'], H['first_words'], H['fmt_date']
    is_team, is_pub, rfq_link, static_url, en_gate = H['is_team'], H['is_pub'], H['rfq_link'], H['static_url'], H['en_gate']
    VER_AR, VER_EN, PUB_AR, PUB_EN = H['VER_AR'], H['VER_EN'], H['PUB_AR'], H['PUB_EN']
    AR_RX = H['AR_RX']
    scrub = H.get('scrub') or (lambda t: t)       # the generator's privacy scrubber (phones, e-mails, raw URLs, street addresses)
    WA_NUMBER = '201279188996'          # the platform's own WhatsApp (never a company's)
    VARIANT_BUDGET_S = float(os.environ.get('MIG_FPROF_IMG_BUDGET') or 20)   # seconds of Pillow work per build for smaller photo copies
    LOCAL_RX = re.compile(r'^/(?![/\\])[^\s"<>\\]+$')
    YT_RX = re.compile(r'^[A-Za-z0-9_-]{11}$')
    URL_RX = re.compile(r'^https?://[^\s"<>]+$', re.I)
    LO_W = 300      # a picture narrower than this (the old site's 160 px product crops) is shown whole at ≤1.5× its size (CSS .lo), never stretched

    # ------------------------------------------------------------------ icons: CSS masks (one definition in the bundle, ~0 bytes per page)
    ICONS = {
        'pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
        'tag': '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
        'send': '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
        'chat': '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
        'heart': '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
        'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
        'globe': '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
        'check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
        'factory': '<path d="M2 21h20M3 21V10l6 4v-4l6 4v-4l6 4v7"/><path d="M17 3h3v8"/>',
        'building': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
        'box': '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
        'award': '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
        'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
        'play': '<path d="M8 5v14l11-7z" fill="#000"/>',
        'pause': '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
        'film': '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>',
        'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
        'spark': '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
        'plus': '<path d="M12 5v14M5 12h14"/>',
        'chev': '<path d="m9 18 6-6-6-6"/>',
        'map': '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15M15 6v15"/>',
        'layers': '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
        'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
        'gauge': '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0z"/>',
        'route': '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
    }

    def _svg_url(body):
        svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' "
               "stroke-linecap='round' stroke-linejoin='round'>" + body.replace('"', "'").replace('#', '%23') + '</svg>')
        return 'url("data:image/svg+xml,' + svg.replace('<', '%3C').replace('>', '%3E') + '")'

    ICON_CSS = ''.join('.fp-i-%s{--i:%s}' % (k, _svg_url(v)) for k, v in ICONS.items())
    HEART_FILL = _svg_url(ICONS['heart'].replace('/>', ' fill="#000"/>'))

    CSS = r'''
/* ===== FPROF: rich company profile (seo_fprof.part.py) — reuses the factory-profile.html classes, .fp scope for the additions ===== */
.fp{padding-bottom:40px}
.fp [hidden],.lbx[hidden],.toast[hidden]{display:none!important}
.fp-i{display:inline-block;width:1.15em;height:1.15em;flex:none;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat;vertical-align:-.2em}
.fp .crumbs-row{padding-block:12px 10px}
.fp .sx-crumbs ol{opacity:1;color:var(--muted)}
.fp .sx-crumbs a{color:var(--muted)}.fp .sx-crumbs a:hover{color:var(--green)}
.fp .sx-crumbs li[aria-current]{color:var(--fg);font-weight:700}
.fp .crumbs-row .sx-crumbs ol{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fp .crumbs-row .sx-crumbs ol::-webkit-scrollbar{display:none}
.fp .crumbs-row .sx-crumbs li{flex:none}
@media (max-width:700px){.fp .crumbs-row .sx-crumbs ol{padding-inline-end:26px;-webkit-mask-image:linear-gradient(to right,transparent,#000 26px);mask-image:linear-gradient(to right,transparent,#000 26px)}
html[dir=ltr] .fp .crumbs-row .sx-crumbs ol{-webkit-mask-image:linear-gradient(to left,transparent,#000 26px);mask-image:linear-gradient(to left,transparent,#000 26px)}}
.fp-hero{touch-action:pan-y;outline-offset:3px}
.fp-hero .slide{margin:0;visibility:hidden;transition:opacity .7s ease,visibility 0s .7s}
.fp-hero .slide.on{visibility:visible;transition:opacity .7s ease,visibility 0s}
.fp-hero .slide>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.fp-hero .slide.fr>.bg{position:absolute;inset:0;background:center/cover no-repeat;filter:blur(22px) saturate(1.15);transform:scale(1.25);opacity:.75}
.fp-hero .slide.fr>img.fg{inset:16px 0 auto;margin-inline:auto;height:calc(100% - 96px);width:auto;max-width:72%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:18px;padding:10px;box-shadow:0 24px 48px -20px rgba(0,0,0,.6);z-index:1}
.fp-hero .slide.cx.fr>img.fg{aspect-ratio:auto;object-fit:cover;padding:0;max-width:86%;border-radius:14px}
.fp-hero .slide.fr.lo>img.fg{max-height:260px}
.fp-hero .slide.vd.fr>img.fg{aspect-ratio:16/9;object-fit:cover;padding:0;max-width:86%;border-radius:14px;background:#000}
.fp-hero .slide .cap .cr{display:block;margin-top:3px;font-size:.72rem;font-weight:500;opacity:.88}
.fp-hero .slide .cap .nt{font-weight:800;color:#FFE7A3}
.fp-hero .slide .cap .cr a,.fp-credits a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.fp-credits{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--sunken);font-size:.75rem;color:var(--muted);line-height:1.7}
.fp-credits b{display:block;color:var(--fg);font-size:.8rem;margin-bottom:2px}
.fp-credits ul{margin:0;padding-inline-start:18px}
.fp-credits small{font-size:inherit}
.fp-hero .slide .cap{bottom:68px;line-height:1.55;z-index:2}
.fp-hero .slide .kind{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.93);color:var(--green-deep);font-weight:700;z-index:2}
.fp-hero .slide.cx .kind{background:rgba(26,18,4,.78);color:#FFE7A3}
.fp-hero .slide.vd>.vph{position:absolute;inset:0;background:radial-gradient(circle at 30% 30%,#5A1020,#16050A)}
.fp-hero .slide .play{z-index:3}
.fp-hero .slide .play .fp-i{width:34px;height:34px;margin-inline-start:4px}
.fp-hero .slide iframe{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:4;background:#000}
.fp-hero .slide.playing .cap,.fp-hero .slide.playing .kind,.fp-hero .slide.playing .play{display:none}
.fp-hero .s-nav,.fp-hero .counter,.fp-hero .fp-pp{z-index:5}
.fp-hero .fp-pp{position:absolute;top:14px;inset-inline-end:74px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.fp-hero .fp-pp .fp-i{width:14px;height:14px}.fp-hero .fp-pp .fp-i-play{display:none}.fp-hero .fp-pp[aria-pressed="true"] .fp-i-play{display:inline-block}.fp-hero .fp-pp[aria-pressed="true"] .fp-i-pause{display:none}
.fp-hero .s-nav .fp-i{width:22px;height:22px}
html[dir=ltr] .fp-hero .s-prev .fp-i,html[dir=rtl] .fp-hero .s-next .fp-i{transform:scaleX(-1)}
.fp-hero.fp-one .s-nav,.fp-hero.fp-one .counter,.fp-hero.fp-one .fp-pp{display:none}
.fp-hero.fp-empty{height:clamp(200px,26vw,320px);display:grid;place-items:center;text-align:center;color:#fff;background:radial-gradient(circle at 18% 22%,rgba(192,147,0,.28),transparent 42%),radial-gradient(circle at 82% 70%,rgba(255,255,255,.10),transparent 40%),linear-gradient(135deg,var(--green-deep),#3D0610)}
.fp-hero.fp-empty .in{padding:20px 24px 76px;max-width:560px;display:flex;flex-direction:column;align-items:center;gap:6px}
.fp-hero.fp-empty .fp-i{width:44px;height:44px;opacity:.85;margin-bottom:4px}
.fp-hero.fp-empty b{font-size:1.1rem}.fp-hero.fp-empty small{opacity:.85;font-size:.85rem}
.fp .pbar{z-index:6}
@media (min-width:701px){.fp .pbar{min-height:236px}.fp .ptitle{align-self:stretch;justify-content:center}}
.fp .plogo{overflow:hidden}
.fp .plogo img{width:100%;height:100%;object-fit:contain;display:block}
.fp .plogo-av{font-size:2.5rem;direction:inherit}
.fp .ptitle h1{overflow-wrap:anywhere}
.fp-alt{font-size:.95rem;font-weight:600;color:var(--muted);text-align:right;margin-top:-4px}
html[dir=ltr] .fp-alt{text-align:left}
.fp .ptitle .meta{gap:4px 14px}
.fp .ptitle .meta>span{align-items:flex-start}.fp .ptitle .meta>span .fp-i{margin-top:.3em}.fp .ptitle .meta>span>span{display:block}
.fp .ptitle .meta a{color:inherit;text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}
.fp .ptitle .meta a:hover{color:var(--green)}
.fp .badges .chip .fp-i{width:1em;height:1em}
.fp .chip.vchip{background:#ECFDF3;color:#05603A}:root[data-theme="dark"] .fp .chip.vchip{background:#0E2A1D;color:#86E2B5}
.fp .pacts{align-items:center}
.fp .pacts .btn{padding-block:11px}
.fp .pacts .icon-btn{width:46px;height:46px;padding:0}
.fp .btn-wa{color:#0b2e17}
.fp .badges .chip-gray,.fp .cert.fp-slot small,.fp-credits,.fp .owner .muted{color:color-mix(in srgb,var(--muted) 70%,var(--fg))}
.fp-toast{z-index:60}
@media (max-width:700px){.fp-toast{bottom:calc(80px + env(safe-area-inset-bottom,0px))}}
html.fp-askoff #seoAsk{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility 0s linear .2s}
.fp-fav[aria-pressed="true"]{color:var(--green);border-color:var(--green)}
.fp-fav[aria-pressed="true"] .fp-i-heart{--i:HEART_FILL}
.fp .facts{display:flex;flex-wrap:wrap;gap:1px;background:rgba(255,255,255,.16);border-radius:16px;overflow:hidden;margin-top:18px}
.fp .facts>.fx{flex:1 1 auto;min-width:0;background:var(--green-deep);padding:15px 18px;display:flex;flex-direction:column;gap:2px;border:0!important}
@media (max-width:700px){.fp .facts>.fx{flex:1 1 40%}}
.fp .facts>.fx b{font-size:1rem;line-height:1.5;color:#fff;overflow-wrap:anywhere;text-wrap:balance}
.fp .facts>.fx b.num{font-size:1.5rem;line-height:1.3}
.fp .facts>.fx b a{color:#fff;text-decoration:underline dotted rgba(255,255,255,.55);text-decoration-thickness:1px;text-underline-offset:5px}
.fp .facts>.fx b a:hover{text-decoration-style:solid}
.fp .facts>.fx span{font-size:.8rem;opacity:.8}
.fp .snav{top:var(--fp-hdr,70px);margin-top:20px}
.fp .snav .in{padding-block:8px}
.fp .pbody{padding-block:22px 10px}
/* desktop sidebar: only the contact card sticks under the tabs; it travels the whole height of the main column (.fp-stick grows to fill
   the column), and the facts / owner cards sit after it at the end of the column — .fp-free when even the contact card does not fit */
@media (min-width:981px){.fp .side-col{position:static;align-self:stretch}.fp .fp-stick{flex:1 0 auto}
.fp .fp-stick>.card{position:sticky;top:calc(var(--fp-hdr,70px) + 66px)}
.fp .side-col.fp-free .fp-stick{flex:none}.fp .side-col.fp-free .fp-stick>.card{position:static}}
.fp .card{scroll-margin-top:calc(var(--fp-hdr,70px) + 70px)}
.fp .card>header .muted{font-size:.85rem}
.fp #about>h2{order:-2}.fp #about>.lead{order:-1}
.fp #about>p{line-height:1.95}
.fp .vtag,.fp .pubtag{margin:0;display:flex;gap:8px;align-items:flex-start;line-height:1.7}
.fp .vtag .fp-i,.fp .pubtag .fp-i{margin-top:.3em}
.fp .spec th,.fp .spec td{vertical-align:top}
.fp .spec .src{display:block;font-size:.75rem;font-weight:600;color:var(--muted)}
.fp .prods{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:760px){.fp .prods{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:420px){.fp .prods{grid-template-columns:minmax(0,1fr)}}
.fp-plist{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.fp .prod.mini{flex-direction:row;align-items:flex-start;gap:12px;padding:12px}
.fp .prod.mini .mi{width:48px;height:48px;border-radius:12px;flex:none;display:grid;place-items:center;background:linear-gradient(135deg,var(--green-soft),var(--gold-soft));color:var(--green)}
.fp .prod.mini .mi .fp-i{width:24px;height:24px}
.fp .prod.mini .b{padding:0;flex:1;min-width:0;gap:4px}
.fp .prod.mini h3{font-size:.92rem}
.fp .prod.mini .row{justify-content:flex-start;gap:6px}
.fp .prod.mini .acts{margin:2px 0 0;padding:0}
.fp .prod.mini .acts .btn{flex:none;padding:4px 14px}
.fp-more{margin-top:12px}.fp-more>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--green);border:1px solid var(--line);border-radius:999px;padding:5px 14px;background:var(--surface)}
.fp-more>summary::-webkit-details-marker{display:none}.fp-more>summary:hover{border-color:var(--green)}.fp-more[open]>summary{margin-bottom:12px}
.fp-more>summary .fp-i{transform:rotate(90deg);transition:transform .2s}.fp-more[open]>summary .fp-i{transform:rotate(-90deg)}
.fp .prod{transition:border-color .2s ease,box-shadow .2s ease}
.fp .prod:hover{border-color:var(--green);box-shadow:0 14px 30px -22px rgba(0,0,0,.45)}
.fp-pimg{display:block;position:relative;aspect-ratio:4/3;background:#fff;border-bottom:1px solid var(--line);overflow:hidden}
.fp-pimg img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.fp .prod:hover .fp-pimg img{transform:scale(1.04)}
.fp-pimg.lo{display:grid;place-items:center}
.fp-pimg.lo img{width:min(100%,240px);height:auto;max-height:100%;object-fit:contain}
.fp .prod h3{line-height:1.5;overflow-wrap:anywhere}
.fp .prod h3 a{color:var(--fg)}.fp .prod h3 a:hover{color:var(--green)}
.fp .prod .acts .btn{padding-inline:8px}
.fp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.fp-kpi{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:14px;padding:14px;background:linear-gradient(135deg,var(--green-soft),transparent 70%)}
.fp-kpi .ic,.fp-mkt .ic{width:42px;height:42px;border-radius:12px;flex:none;display:grid;place-items:center;background:var(--surface);color:var(--green);box-shadow:0 6px 14px -10px rgba(0,0,0,.4)}
.fp-kpi .ic .fp-i,.fp-mkt .ic .fp-i{width:22px;height:22px}
.fp-kpi>div{min-width:0;display:flex;flex-direction:column;gap:2px}
.fp-kpi b{font-size:1.15rem;font-weight:800;line-height:1.45;color:var(--fg);overflow-wrap:anywhere}
.fp-kpi small{color:var(--muted);font-weight:700;font-size:.8rem}
.fp-kpi .src,.fp-mkt-src .src{font-size:.72rem;font-weight:600;color:var(--muted)}
.fp-mkts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.fp-mkt{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--surface)}
.fp-mkt b{font-weight:800;line-height:1.45;overflow-wrap:anywhere}
.fp-mkt.wide{grid-column:1/-1;align-items:flex-start}.fp-mkt.wide small{display:block;color:var(--muted);font-size:.8rem;font-weight:700}
.fp-mkt-src{grid-column:1/-1;margin-top:-2px}
.fp .cert.real{border-style:solid}
.fp .cert.fp-slot{background:var(--sunken)}
.fp .cert.fp-slot .ic{background:var(--surface);color:var(--muted)}
.fp .cert .ic .fp-i{width:20px;height:20px}
.fp-cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;background:var(--gold-soft);border-radius:12px;padding:12px 14px}
.fp-cta p{font-weight:700;font-size:.9rem;color:var(--fg)}
.fp .gal button{background:var(--sunken)}
.fp .gal button img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
.fp .gal button:hover img{transform:scale(1.06)}
.fp .gal button .t{z-index:1;max-width:calc(100% - 12px);text-align:start;line-height:1.45;white-space:normal;padding:2px 8px}
.fp .gal button.cx .t{background:rgba(26,18,4,.8);color:#FFE7A3}
.fp .gal button .v{z-index:1}
.fp .gal.n1,.fp .gal.n2{grid-template-columns:repeat(2,minmax(0,1fr))}.fp .gal.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.fp .gal.n1 button,.fp .gal.n2 button,.fp .gal.n3 button{aspect-ratio:4/3}
.fp .gal .up{border:2px dashed var(--line);background:var(--surface);color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;text-align:center;font-size:.8rem;font-weight:700;border-radius:10px;aspect-ratio:auto}
.fp .gal .up:hover{border-color:var(--green);color:var(--green)}
.fp .gal .up .fp-i{width:26px;height:26px}
@media (max-width:560px){.fp .gal.n3{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fp .gal button .v .fp-i{width:18px;height:18px;margin-inline-start:2px}
.fp .gal .vph{position:absolute;inset:0;background:radial-gradient(circle at 30% 30%,#5A1020,#16050A)}
.fp .rfq p{opacity:.95}
.fp .rfq .fp-acts{display:flex;flex-wrap:wrap;gap:10px}
.fp .rfq .note{color:rgba(255,255,255,.78)}
.fp .rfq .btn-line{background:transparent;color:#fff;border-color:rgba(255,255,255,.45)}
.fp .ci{align-items:center}
.fp .ci>div{min-width:0;flex:1}
.fp .ci .ic .fp-i{width:18px;height:18px}
.fp .ci b a{color:var(--green)}
.fp .ci .lnk{border:0;background:none;padding:0;font:inherit;font-weight:700;font-size:.92rem;color:var(--green);cursor:pointer;text-align:start}
.fp .ci .lnk:hover,.fp .ci b a:hover{text-decoration:underline}
.fp-map{--mr:rgba(255,255,255,.92);--mw:#CFE3EE;--mp:#E3EBD9;--mb:#EDF1EC;display:block;position:relative;height:150px;border-radius:12px;overflow:hidden;border:1px solid var(--line);color:var(--fg);
 background:linear-gradient(118deg,transparent 47%,var(--mr) 47.4%,var(--mr) 49.6%,transparent 50%),linear-gradient(28deg,transparent 58%,var(--mr) 58.3%,var(--mr) 60.2%,transparent 60.5%),linear-gradient(90deg,transparent 27%,var(--mr) 27.3%,var(--mr) 28.8%,transparent 29.1%),radial-gradient(circle at 84% 18%,var(--mw) 0 20%,transparent 21%),radial-gradient(circle at 14% 86%,var(--mp) 0 18%,transparent 19%),var(--mb)}
:root[data-theme="dark"] .fp-map{--mr:rgba(255,255,255,.13);--mw:#1D3240;--mp:#22301F;--mb:#241417}
.fp-map .pin{position:absolute;top:40%;left:50%;transform:translate(-50%,-60%);width:34px;height:34px;color:var(--green)}
.fp-map .lb{position:absolute;inset-inline:10px;bottom:10px;background:var(--surface);color:var(--fg);border-radius:9px;padding:6px 10px;font-size:.8rem;font-weight:700;display:flex;align-items:center;gap:6px;box-shadow:0 6px 16px -8px rgba(0,0,0,.35)}
.fp-map:hover .lb{color:var(--green)}
.fp .dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;font-size:.84rem;margin:0}
.fp .dl dt{color:var(--muted)}.fp .dl dd{margin:0;font-weight:700;overflow-wrap:anywhere}
.fp .owner .btn{align-self:flex-start;white-space:normal}
.fp-sims .dir-list{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.fp-sims .dir-list li{display:flex;gap:12px;align-items:flex-start;padding:12px;transition:border-color .2s ease,transform .2s ease}
.fp-sims .dir-list li:hover{border-color:var(--green);transform:translateY(-2px)}
.fp-sims li>div{min-width:0;flex:1}
.fp-sims li .nm{display:block;font-weight:800;line-height:1.5;overflow-wrap:anywhere;color:var(--fg)}
.fp-sims li .nm:hover{color:var(--green)}
.fp-sims li p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.fp-sl{width:64px;height:64px;border-radius:12px;flex:none;border:1px solid var(--line);background:#fff;display:grid;place-items:center;overflow:hidden;color:var(--green);font-weight:800;font-size:1.35rem}
.fp-sl img{width:100%;height:100%;object-fit:contain;display:block}
.fp-sl.ph img{object-fit:cover}
.fp-sl.av{background:var(--green-soft);border-color:transparent}
.fp-links{margin-top:18px}
.fp-links h2{font-size:1rem}
.lbx .lbm{display:grid;place-items:center;min-height:120px}
.lbx .lbm img{width:auto;max-width:100%}
.lbx .lbm iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:14px;background:#000}
.lbx-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#8E0B20;cursor:pointer;display:grid;place-items:center}
.lbx-nav .fp-i{width:22px;height:22px}
.lbx-p{inset-inline-start:-6px}.lbx-n{inset-inline-end:-6px}
html[dir=ltr] .lbx-p .fp-i,html[dir=rtl] .lbx-n .fp-i{transform:scaleX(-1)}
@media (max-width:700px){.fp .pacts .btn-gold{flex:1 1 170px}.fp .pacts .btn-wa{flex:1 1 104px}.fp .pacts .icon-btn{flex:none}.fp .pbar{padding:16px}.fp-hero .slide .cap{bottom:86px;font-size:.8rem;padding:4px 10px}.fp-hero .slide.fr>img.fg{height:calc(100% - 74px);top:12px}.fp-hero.fp-empty .in{padding-bottom:52px}.fp .facts>.fx{padding:13px 14px}}
@media (max-width:520px){.fp-hero .s-nav{width:36px;height:36px;top:43%}.fp-hero .s-prev{inset-inline-start:8px}.fp-hero .s-next{inset-inline-end:8px}.fp-hero .slide .cap{bottom:38px;inset-inline-start:auto;inset-inline-end:10px;max-width:calc(100% - 132px);font-size:.75rem;line-height:1.5}.fp-hero .slide .cap .cs{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.fp-hero .slide .cap .nt{display:block}.fp-hero .slide .cap .cr{display:none}.fp .card{padding:18px 16px}.fp-hero .slide.vd.fr>img.fg{height:calc(100% - 100px)}}
@media (prefers-reduced-motion:reduce){.fp-hero .slide,.fp-hero .slide.on{transition:none}}
''' .replace('HEART_FILL', HEART_FILL) + ICON_CSS + '\n'

    JS = r'''/* FPROF: company profile — carousel, tabs + scrollspy, product filter, lightbox, share, favourite, copy (seo_fprof.part.py) */
(function(){var d=document,R=d.getElementById("fp");if(!R)return;
var h=d.documentElement,W=window,EN=h.lang==="en",RTL=h.dir!=="ltr",RM=!!(W.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
function q(s,r){return(r||d).querySelector(s);}function qa(s,r){return[].slice.call((r||d).querySelectorAll(s));}
function tx(a,e){return EN?e:a;}function px(){return parseInt(h.style.getPropertyValue("--fp-hdr"),10)||0;}
function hdr(){var e=q(".site-hdr"),v=0;if(e){var p=getComputedStyle(e).position;if(p==="sticky"||p==="fixed")v=Math.round(e.getBoundingClientRect().height);}h.style.setProperty("--fp-hdr",v+"px");}
hdr();
var tt,te;function toast(m){if(!te){te=d.createElement("div");te.className="toast fp-toast";te.setAttribute("role","status");d.body.appendChild(te);}te.textContent=m;te.hidden=false;clearTimeout(tt);tt=setTimeout(function(){te.hidden=true;},2600);}
function copy(v,ok){function fb(){var t=d.createElement("textarea"),r=false;t.value=v;t.setAttribute("readonly","");t.style.cssText="position:fixed;top:0;opacity:0";d.body.appendChild(t);t.select();try{r=d.execCommand("copy");}catch(e){}d.body.removeChild(t);toast(r?ok:v);}
try{if(navigator.clipboard&&W.isSecureContext){navigator.clipboard.writeText(v).then(function(){toast(ok);},fb);return;}}catch(e){}fb();}
function ytFrame(id,t){var f=d.createElement("iframe");f.src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+"?autoplay=1&rel=0&playsinline=1";f.title=t||"YouTube";
f.setAttribute("allow","accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");f.setAttribute("allowfullscreen","");f.setAttribute("referrerpolicy","strict-origin-when-cross-origin");return f;}
/* media carousel: prev/next, counter, swipe, arrow keys, autoplay (off with reduced motion, paused on hover/focus/touch, stops on use) */
var hero=q(".fp-hero",R),sl=hero?qa(".slide",hero):[];if(sl.length){var n=sl.length,cur=0,tm=0,held=false,done=false,cn=q(".counter",hero);
var bgs=function(k){var b=q(".bg[data-bg]",sl[(k+n)%n]);if(b){b.style.backgroundImage='url("'+b.getAttribute("data-bg")+'")';b.removeAttribute("data-bg");}};
var show=function(i){cur=(i+n)%n;bgs(cur);bgs(cur+1);sl.forEach(function(e,k){var on=k===cur,f;e.classList.toggle("on",on);e.setAttribute("aria-hidden",on?"false":"true");if(!on&&(f=q("iframe",e))){e.removeChild(f);e.classList.remove("playing");}});if(cn)cn.textContent=(cur+1)+" / "+n;};
var stop=function(){done=true;if(pp){pp.setAttribute("aria-pressed","true");pp.setAttribute("aria-label",tx("تشغيل العرض التلقائي","Play the slideshow"));}};
var pp=q(".fp-pp",hero);show(0);if(!RM&&n>1){tm=setInterval(function(){if(!held&&!done&&!d.hidden)show(cur+1);},6000);if(pp){pp.hidden=false;pp.addEventListener("click",function(){var p=!done;done=p;pp.setAttribute("aria-pressed",p?"true":"false");pp.setAttribute("aria-label",p?tx("تشغيل العرض التلقائي","Play the slideshow"):tx("إيقاف العرض التلقائي","Pause the slideshow"));pp.title=pp.getAttribute("aria-label");});}}
var pv=q(".s-prev",hero),nx=q(".s-next",hero);if(pv)pv.addEventListener("click",function(){show(cur-1);stop();});if(nx)nx.addEventListener("click",function(){show(cur+1);stop();});
hero.addEventListener("mouseenter",function(){held=true;});hero.addEventListener("mouseleave",function(){held=false;});
hero.addEventListener("focusin",function(){held=true;});hero.addEventListener("focusout",function(){held=false;});
hero.addEventListener("keydown",function(e){if(n<2||(e.key!=="ArrowLeft"&&e.key!=="ArrowRight"))return;show(cur+((e.key==="ArrowLeft")===RTL?1:-1));stop();e.preventDefault();});
var x0=null,y0=0;hero.addEventListener("touchstart",function(e){var t=e.touches[0];x0=t.clientX;y0=t.clientY;held=true;},{passive:true});
hero.addEventListener("touchend",function(e){held=false;if(x0===null||n<2)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy))return;show(cur+((dx>0)===RTL?1:-1));stop();},{passive:true});
hero.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("[data-yt]"):null;if(!b)return;var s=b.closest(".slide");if(!s||q("iframe",s))return;stop();s.appendChild(ytFrame(b.getAttribute("data-yt"),b.getAttribute("data-title")));s.classList.add("playing");});}
/* sticky section tabs: smooth scroll under the header, scrollspy, active tab kept in view */
var nav=q(".snav",R),tabs=nav?qa("a[href*='#']",nav):[],box=nav?q(".in",nav):null,secs=tabs.map(function(a){return d.getElementById(a.getAttribute("href").split("#")[1]);});
function off(){return px()+(nav?nav.offsetHeight:0)+8;}
tabs.forEach(function(a,i){a.addEventListener("click",function(e){var s=secs[i];if(!s)return;e.preventDefault();var y=s.getBoundingClientRect().top+(W.pageYOffset||h.scrollTop)-off();
try{W.scrollTo({top:y,behavior:RM?"auto":"smooth"});}catch(x){W.scrollTo(0,y);}try{history.replaceState(null,"","#"+s.id);}catch(x){}});});
var last=-1,raf=0;function spy(){raf=0;var y=off()+14,idx=0;secs.forEach(function(s,i){if(s&&s.getBoundingClientRect().top<=y)idx=i;});if(idx===last)return;last=idx;
tabs.forEach(function(a,i){var on=i===idx;a.classList.toggle("on",on);if(!on){a.removeAttribute("aria-current");return;}a.setAttribute("aria-current","true");
if(box){var r=a.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.left<b.left||r.right>b.right)box.scrollLeft+=(r.left-b.left)-(b.width-r.width)/2;}});}
if(tabs.length){W.addEventListener("scroll",function(){if(!raf)raf=(W.requestAnimationFrame||setTimeout)(spy);},{passive:true});spy();}
/* product filter chips */
var fl=q("#fpFilter",R);if(fl)fl.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button[data-c]"):null;if(!b)return;var c=b.getAttribute("data-c"),k=0;
qa("button",fl).forEach(function(x){var on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on?"true":"false");});
if(c!=="*")qa("#fpProds details",R).forEach(function(x){x.open=true;});qa("#fpProds .prod",R).forEach(function(p){var v=c==="*"||p.getAttribute("data-cat")===c;p.hidden=!v;if(v)k++;});var ct=q("#fpPCount",R);if(ct)ct.textContent=k;});
/* gallery lightbox (photos + click-to-load videos), Esc / arrows / focus kept inside */
var G=qa("[data-lb]",R);if(G.length){var lb=d.createElement("div"),li=0,op=null;lb.className="lbx";lb.hidden=true;lb.setAttribute("role","dialog");lb.setAttribute("aria-modal","true");lb.setAttribute("aria-label",tx("عارض الصور والفيديو","Photo and video viewer"));d.body.appendChild(lb);
var draw=function(){var b=G[li],y=b.getAttribute("data-yt"),c=b.getAttribute("data-cap")||"",w=+b.getAttribute("data-w")||0,m,p;
lb.innerHTML='<div class="lbin"><button class="lbx-x" type="button">✕</button>'+(G.length>1?'<button class="lbx-nav lbx-p" type="button"><i class="fp-i fp-i-chev"></i></button><button class="lbx-nav lbx-n" type="button"><i class="fp-i fp-i-chev"></i></button>':"")+'<div class="lbm"></div><p></p></div>';
q(".lbx-x",lb).setAttribute("aria-label",tx("إغلاق","Close"));if(G.length>1){q(".lbx-p",lb).setAttribute("aria-label",tx("السابق","Previous"));q(".lbx-n",lb).setAttribute("aria-label",tx("التالي","Next"));}
m=q(".lbm",lb);if(y)m.appendChild(ytFrame(y,c));else{p=d.createElement("img");p.src=b.getAttribute("data-full");p.alt=c;if(w&&w<700){p.style.width=Math.min(Math.max(320,w*2),W.innerWidth-32)+"px";p.style.height="auto";}m.appendChild(p);}
q("p",lb).textContent=(G.length>1?(li+1)+" / "+G.length+" · ":"")+c+(b.getAttribute("data-cr")?" — "+b.getAttribute("data-cr"):"");};
var close=function(){lb.hidden=true;lb.innerHTML="";d.body.style.overflow="";if(op&&op.focus)op.focus();};
G.forEach(function(b,i){b.addEventListener("click",function(){op=b;li=i;draw();lb.hidden=false;d.body.style.overflow="hidden";q(".lbx-x",lb).focus();});});
lb.addEventListener("click",function(e){var t=e.target;if(t===lb||(t.closest&&t.closest(".lbx-x")))close();else if(t.closest&&t.closest(".lbx-p")){li=(li-1+G.length)%G.length;draw();}else if(t.closest&&t.closest(".lbx-n")){li=(li+1)%G.length;draw();}});
d.addEventListener("keydown",function(e){if(lb.hidden)return;if(e.key==="Escape")close();else if((e.key==="ArrowLeft"||e.key==="ArrowRight")&&G.length>1){li=(li+((e.key==="ArrowLeft")===RTL?1:-1)+G.length)%G.length;draw();}
else if(e.key==="Tab"){var f=qa("button,iframe",lb),a=f[0],z=f[f.length-1];if(!a)return;if(e.shiftKey&&d.activeElement===a){z.focus();e.preventDefault();}else if(!e.shiftKey&&d.activeElement===z){a.focus();e.preventDefault();}}});}
/* favourite (this device), share, copy, Ask Janna, RFQ prefilled with a product */
var fv=q("[data-fav]",R),FK="mig-favs",me=location.pathname;
function favs(){try{var l=JSON.parse(localStorage.getItem(FK)||"[]");return l&&l.filter?l:[];}catch(e){return[];}}
function isFav(){return favs().some(function(x){return x&&x.u===me;});}
function paint(){if(!fv)return;var on=isFav();fv.setAttribute("aria-pressed",on?"true":"false");fv.setAttribute("aria-label",on?tx("إزالة من المفضلة","Remove from favourites"):tx("أضف إلى المفضلة","Add to favourites"));fv.title=fv.getAttribute("aria-label");}
paint();
R.addEventListener("click",function(e){var t=e.target,b;if(!t.closest)return;
if((b=t.closest("[data-fav]"))){var on=!isFav(),l=favs().filter(function(x){return x&&x.u!==me;});if(on)l.unshift({u:me,n:b.getAttribute("data-name")||d.title,t:Date.now()});
try{localStorage.setItem(FK,JSON.stringify(l.slice(0,200)));}catch(x){}paint();toast(on?tx("أُضيفت إلى المفضلة على هذا الجهاز","Saved to favourites on this device"):tx("أُزيلت من المفضلة","Removed from favourites"));return;}
if((b=t.closest("[data-share]"))){var u=location.href.split("#")[0];if(navigator.share){navigator.share({title:d.title,url:u}).catch(function(){});}else copy(u,tx("تم نسخ رابط الملف","Profile link copied"));return;}
if((b=t.closest("[data-copy]"))){copy(b.getAttribute("data-copy"),tx("تم النسخ","Copied"));return;}
if((b=t.closest("[data-ask]"))){var a=d.getElementById("seoAsk");if(a&&!a.disabled)a.click();else toast(tx("جنة بتفتح دلوقتي…","Janna is opening…"));return;}
if((b=t.closest("a[data-rfq-item]"))){try{sessionStorage.setItem("mig-rfq-item",b.getAttribute("data-rfq-item"));}catch(x){}}});
/* the contact card sticks under the tabs on desktop only when it fits the screen */
var side=q(".side-col",R),stk=q(".fp-stick>.card",R);function fit(){if(side&&stk)side.classList.toggle("fp-free",stk.offsetHeight+px()+66+24>W.innerHeight);}
/* the floating «اسأل جنة» pill steps aside while it would cover a button of the identity card or a link of the facts band */
var ask=d.getElementById("seoAsk"),ctl=qa(".pacts a,.pacts button,.facts a",R),araf=0;
function clr(){araf=0;if(!ask)return;var a=ask.getBoundingClientRect(),hit=false;if(a.width)ctl.forEach(function(e){var b=e.getBoundingClientRect();if(b.width&&b.right>a.left&&b.left<a.right&&b.bottom>a.top&&b.top<a.bottom)hit=true;});h.classList.toggle("fp-askoff",hit);}
if(ask&&ctl.length){W.addEventListener("scroll",function(){if(!araf)araf=(W.requestAnimationFrame||setTimeout)(clr);},{passive:true});clr();}
fit();W.addEventListener("resize",function(){hdr();fit();last=-1;spy();clr();});W.addEventListener("load",function(){fit();clr();});
})();
'''

    # ------------------------------------------------------------------ media index (built / read once per build)
    def _company_media():
        """tools/company_media.py loaded like the generator's own parts: its source exec'd into a namespace (no sys.path change,
        no __pycache__ written into the tree)"""
        p = B + 'tools/company_media.py'
        ns = {'__name__': 'company_media_fprof', '__file__': p}
        with open(p, encoding='utf-8') as fh:
            exec(compile(fh.read(), p, 'exec'), ns)
        return ns

    def media_index():
        if 'fp_media' in S:
            return S['fp_media']
        t0 = time.time()
        f = os.environ.get('MIG_FPROF_MEDIA')
        raw, how = None, ''
        if not f and os.environ.get('MIG_FPROF_MEDIA_REBUILD') != '0' and os.path.isfile(B + 'tools/company_media.py'):
            try:
                raw, how = _company_media()['build_index'](S, root=B, tr=tr, write=True), 'rebuilt'
            except Exception as e:
                S['warnings'].append('fprof_media_rebuild_failed:%s:%s (committed seo/company-media.json used)' % (type(e).__name__, str(e)[:100]))
                raw = None
        if raw is None:
            f = f or (B + 'seo/company-media.json')
            try:
                with open(f, encoding='utf-8') as fh:
                    raw, how = json.load(fh), 'file'
            except FileNotFoundError:
                raw, how = {}, 'missing'
            except Exception as e:
                S['warnings'].append('fprof_media_unreadable:%s' % str(e)[:80])
                raw, how = {}, 'unreadable'
        idx = {}
        if isinstance(raw, dict):
            meta = raw.get('_meta') if isinstance(raw.get('_meta'), dict) else {}
            for w in (meta.get('warnings') or [])[:10]:
                S['warnings'].append('fprof_media:%s' % w)
            src = raw.get('companies') if isinstance(raw.get('companies'), dict) else raw
            for k, v in src.items():
                if isinstance(k, str) and k.startswith('/') and isinstance(v, dict):
                    idx[nfc(unquote(k))] = v
        S['fp_media'] = idx
        S['fp_exists'] = {}
        S['fp_media_info'] = {'how': how, 'entries': len(idx), 'seconds': round(time.time() - t0, 2)}
        print('fprof: media index %s (%d companies, %.1f s)' % (how, len(idx), time.time() - t0))
        return idx

    def _exists(src):
        """a local file the page can reference (OUT/img → the tree's img/); memoised"""
        ex = S.setdefault('fp_exists', {})
        if src not in ex:
            p = unquote(src.split('?', 1)[0]).lstrip('/')
            ex[src] = os.path.isfile(S['OUT'] + p) or os.path.isfile(B + p)
        return ex[src]

    def _img(d, sm=True):
        """{src, w, h[, sm]} of a local image the page can reference (sm = the index's ≤640 px copy, kept for srcset)"""
        if not isinstance(d, dict):
            return None
        src = d.get('src')
        if not isinstance(src, str) or not LOCAL_RX.match(src) or not _exists(src):
            return None
        try:
            w, h = int(d.get('w') or 0), int(d.get('h') or 0)
        except (TypeError, ValueError):
            return None
        if w <= 0 or h <= 0:
            return None
        out = {'src': src, 'w': w, 'h': h}
        if sm:
            s = _img(d.get('sm'), False)
            if s and s['w'] < w:
                out['sm'] = s
        return out

    def _txt(v):
        """a text from the media index, scrubbed like every company text (no phone / e-mail / street address can reach the page)"""
        return scrub(re.sub(r'\s+', ' ', v).strip()) if isinstance(v, str) else ''

    def _src(v):
        return re.sub(r'\s+', ' ', v).strip()[:300] if isinstance(v, str) else ''

    def _credit(d):
        """{author, license, url} of a Wikimedia Commons picture (author names are not scrubbed: they are the attribution the licence asks for)"""
        cr = d.get('credit') if isinstance(d, dict) else None
        if not isinstance(cr, dict):
            return None
        au = re.sub(r'\s+', ' ', str(cr.get('author') or '')).strip()[:80]
        lic = re.sub(r'\s+', ' ', str(cr.get('license') or '')).strip()[:40]
        url = cr.get('url') if isinstance(cr.get('url'), str) and URL_RX.match(cr.get('url')) else ''
        return {'author': au, 'license': lic, 'url': url} if (au or lic) else None

    def media_of(c):
        mc = S.setdefault('fp_mcache', {})
        if c['path'] not in mc:
            mc[c['path']] = _media_of(c)
        return mc[c['path']]

    def _media_of(c):
        m = media_index().get(nfc(unquote(c['path'])))
        out = {'indexed': isinstance(m, dict), 'logo': None, 'photos': [], 'videos': [], 'products': [], 'context': [], 'facts': []}
        m = m or {}
        out['logo'] = _img(m.get('logo'), False)
        for p in (m.get('photos') or [])[:24]:
            im = _img(p)
            if im:
                im.update(cap_ar=_txt(p.get('cap_ar')), cap_en=_txt(p.get('cap_en')), credit=_credit(p))
                out['photos'].append(im)
        for v in (m.get('videos') or [])[:8]:
            if isinstance(v, dict) and isinstance(v.get('yt'), str) and YT_RX.match(v['yt']):
                th = v.get('thumb')
                th = th if isinstance(th, str) and LOCAL_RX.match(th) and _exists(th) else None
                try:
                    tw, thh = int(v.get('thumb_w') or 480), int(v.get('thumb_h') or 360)
                except (TypeError, ValueError):
                    tw, thh = 480, 360
                out['videos'].append({'yt': v['yt'], 'title_ar': _txt(v.get('title_ar')), 'title_en': _txt(v.get('title_en')), 'thumb': th,
                                      'tw': tw if tw > 0 else 480, 'th': thh if thh > 0 else 360})
        for p in (m.get('products') or [])[:60]:
            if isinstance(p, dict) and (_txt(p.get('name_ar')) or _txt(p.get('name_en'))):
                href = p.get('href') if isinstance(p.get('href'), str) and LOCAL_RX.match(p.get('href') or '') else None
                out['products'].append({'name_ar': _txt(p.get('name_ar')), 'name_en': _txt(p.get('name_en')), 'img': _img(p.get('img'), False),
                                        'cat_ar': _txt(p.get('cat_ar')), 'cat_en': _txt(p.get('cat_en')), 'href': href, 'from': p.get('from') or ''})
        for p in (m.get('context') or [])[:6]:
            im = _img(p)
            if im:
                im.update(cap_ar=_txt(p.get('cap_ar')), cap_en=_txt(p.get('cap_en')), kind=p.get('kind') if p.get('kind') in ('zone', 'gov', 'sector') else 'zone',
                          credit=_credit(p))
                out['context'].append(im)
        facts = m.get('facts') if isinstance(m.get('facts'), dict) else {}
        for k, f in facts.items():
            if isinstance(f, dict) and _txt(f.get('value_ar') or f.get('value_en')) and _txt(f.get('label_ar') or f.get('label_en')):
                su = f.get('source_url') if isinstance(f.get('source_url'), str) and URL_RX.match(f.get('source_url')) else ''
                hr = f.get('href') if isinstance(f.get('href'), str) and LOCAL_RX.match(f.get('href')) else ''
                out['facts'].append(dict(key=str(k).lower(), label_ar=_txt(f.get('label_ar')), label_en=_txt(f.get('label_en')),
                                         value_ar=_txt(f.get('value_ar')), value_en=_txt(f.get('value_en')), source=_src(f.get('source')),
                                         source_url=su, href=hr, kind=c['kind']))
        return out

    # ------------------------------------------------------------------ smaller copies of big local photos (Pillow, memoised in S['crops'] so the stale clean-up keeps them)
    def variant(im, tw):
        if not im or im['w'] <= tw * 1.2:
            return None
        key = ('fp', im['src'], tw)
        if key in S['crops']:
            return S['crops'][key]
        S['crops'][key] = None
        if S.get('fp_vtime', 0) > VARIANT_BUDGET_S:      # build-time guard: past the budget the originals are used
            if not S.get('fp_vwarn'):
                S['fp_vwarn'] = 1
                S['warnings'].append('fprof_variant_budget: image copies stopped after %d s (originals used)' % VARIANT_BUDGET_S)
            return None
        t0 = time.time()
        rel = unquote(im['src'].split('?', 1)[0]).lstrip('/')
        fp = B + rel if os.path.isfile(B + rel) else S['OUT'] + rel
        try:
            from PIL import Image
            st = os.stat(fp)
            th = max(1, int(round(im['h'] * tw / float(im['w']))))
            # named by the source's CONTENT, never its mtime: a git checkout (CI) gives every file a new mtime, which renamed these
            # copies on every deploy and broke the image URLs of pages already open or cached
            dig = S.setdefault('fp_srcsha', {})
            if fp not in dig:
                with open(fp, 'rb') as fh:
                    dig[fp] = sha(fh.read(), 40)
            name = 'fp-%s.jpg' % sha('%s|%d|%s|%d' % (rel, st.st_size, dig[fp], tw), 14)
            out = S['OUT'] + 'assets/img/' + name
            if not os.path.exists(out):
                pic = Image.open(fp)
                pic.draft('RGB', (tw, th))
                pic = pic.convert('RGB').resize((tw, th), Image.LANCZOS)
                os.makedirs(S['OUT'] + 'assets/img', exist_ok=True)
                pic.save(out, 'JPEG', quality=78, optimize=True, progressive=True)
            S['crops'][key] = ('/assets/img/' + name, tw, th)
        except Exception as e:
            S['warnings'].append('fprof_variant:%s:%s' % (rel[:60], str(e)[:60]))
        S['fp_vtime'] = S.get('fp_vtime', 0) + time.time() - t0
        return S['crops'][key]

    def srcset(im, sizes, widths=(480, 960)):
        if im.get('sm'):        # the index ships a ≤640 px copy of every big photo: no extra file needed
            s = im['sm']
            return ' srcset="%s" sizes="%s"' % (esc('%s %dw, %s %dw' % (pct(s['src']), s['w'], pct(im['src']), im['w'])), sizes)
        vs = [v for v in (variant(im, w) for w in widths) if v]
        if not vs:
            return ''
        return ' srcset="%s" sizes="%s"' % (esc(', '.join(['%s %dw' % (pct(v[0]), v[1]) for v in vs] + ['%s %dw' % (pct(im['src']), im['w'])])), sizes)

    # ------------------------------------------------------------------ small helpers
    def en_only(L, s):
        """an extra text on an English page must not add Arabic (the EN gate counts text nodes)"""
        s = s or ''
        return '' if (L == 'en' and AR_RX.search(s)) else s

    def icon(k, cls=''):
        return '<i class="fp-i fp-i-%s%s" aria-hidden="true"></i>' % (k, (' ' + cls) if cls else '')

    PFX_RX = re.compile(r'^(?:شركة|شركه|الشركة|الشركه|مصنع|مصانع|المصنع|مؤسسة|مؤسسه|مجموعة|مجموعه|المجموعة|معامل|مكتب)\s+')

    def monogram(name):
        n = re.sub(r'[()«»"\'.,،\-–—_/|]+', ' ', name or '').strip()
        n = PFX_RX.sub('', n).strip() or n
        ws = n.split()
        if not ws:
            return '•'
        if re.match(r'[A-Za-z0-9]', ws[0]):
            lat = [w for w in ws if re.match(r'[A-Za-z0-9]', w)]
            return ''.join(w[0] for w in lat[:2]).upper()
        w0 = ws[0]
        if w0.startswith('ال') and len(w0) > 3:
            w0 = w0[2:]
        # a lone alef (ا أ إ آ) reads like «!» or «l» at monogram size: keep the next letter with it («إي» for إيجيتك)
        return w0[:2] if (w0[0] in 'اأإآٱ' and len(w0) > 1) else w0[0]

    PCAT = {'metal': ('منتجات معدنية', 'Metal products'), 'plastic': ('منتجات بلاستيكية', 'Plastic products'), 'food': ('منتجات غذائية', 'Food products'),
            'furn': ('أثاث وأخشاب', 'Furniture & wood'), 'build': ('مواد بناء', 'Building materials'), 'petro': ('بترول وبتروكيماويات', 'Petroleum & petrochemicals'),
            'cosm': ('مستحضرات تجميل', 'Cosmetics'), 'med': ('مستلزمات طبية', 'Medical supplies'), 'elec': ('منتجات كهربائية', 'Electrical products'),
            'glass': ('زجاج', 'Glass'), 'other': ('منتجات أخرى', 'Other products')}

    def prod_by_path():
        if 'fp_pbp' not in S:
            S['fp_pbp'] = {p['path']: p for p in S.get('products') or []}
        return S['fp_pbp']

    def products_of(c, L, md):
        """index products, then the classic page's product links, then its product names: nothing the classic page showed is lost.
        A company the index knows gets only the pictures the index accepted (no blank cell, no «صنع في مصر» placeholder, no picture
        shared by several listings, no company logo shown as a product); the generator's own crops are the fallback for the others."""
        out, seen_p, seen_n = [], set(), set()
        pbp = prod_by_path()
        own_crops = not md['indexed']
        for x in md['products']:
            rec = pbp.get(nfc(unquote(x['href']))) if x['href'] else None
            if rec:
                name = T(L, rec['name'], rec['name_en'])
            else:
                name = T(L, x['name_ar'], x['name_en']) if x['name_ar'] else x['name_en']
                if L == 'en' and AR_RX.search(name or ''):
                    continue        # an index-only product without an English name stays on the Arabic page
            img = x['img']
            if not img and own_crops and rec and rec.get('img_url'):
                img = {'src': rec['img_url'][0], 'w': rec['img_url'][1], 'h': rec['img_url'][2]}
            cat = (x['cat_ar'], x['cat_en']) if (x['cat_ar'] or x['cat_en']) else (PCAT.get(rec['cat']) if rec else None)
            href = (('/en' if L == 'en' and rec.get('en_ok') else '') + rec['path']) if rec else (lk(L, nfc(unquote(x['href']))) if x['href'] else None)
            out.append({'name': name, 'raw': x['name_ar'] or x['name_en'], 'img': img, 'cat': cat, 'href': href, 'from': x['from']})
            if rec:
                seen_p.add(rec['path'])
                seen_n.add(rec['name'])
            seen_n.add(x['name_ar'] or x['name_en'])
        for p in (c.get('prods') or []):
            if p['path'] in seen_p or p['name'] in seen_n:
                continue
            im = p.get('img_url') if own_crops else None
            out.append({'name': T(L, p['name'], p['name_en']), 'raw': p['name'], 'img': {'src': im[0], 'w': im[1], 'h': im[2]} if im else None,
                        'cat': PCAT.get(p['cat']), 'href': ('/en' if L == 'en' and p.get('en_ok') else '') + p['path'], 'from': 'listing'})
            seen_n.add(p['name'])
        pnames = {p['name'] for p in (c.get('prods') or [])}
        extra = [n for n in c['names'] if n not in pnames and n not in seen_n]
        for n in extra[:24]:
            out.append({'name': T(L, n), 'raw': n, 'img': None, 'cat': None, 'href': None, 'from': 'name'})
        return out

    def fact_text(f, L):
        lab = X(L, f['label_ar'] or f['label_en'], f['label_en'])
        val = X(L, f['value_ar'] or f['value_en'], f['value_en'])
        return lab, val

    def fact_val(f, L):
        """the fact's value (escaped); the group fact links to the group's own company page"""
        v = esc(fact_text(f, L)[1])
        if f.get('href'):
            return '<a href="%s">%s</a>' % (esc(lk(L, nfc(unquote(f['href'])))), v)
        return v

    def source_html(f, L):
        """where a fact comes from: the public page it was researched from, else the company's own description in the directory"""
        su, src = f.get('source_url') or '', f.get('source') or ''
        if not su and URL_RX.match(src):
            su = src
        if su:
            host = urlparse(su).netloc.replace('www.', '') or su
            return '<span class="src">%s <a href="%s" rel="nofollow noopener" target="_blank">%s</a></span>' % (X(L, 'المصدر:', 'Source:'), esc(su), esc(host))
        if src.startswith('data/'):     # an internal data file: say what it is, never its file name
            if f.get('key') == 'listed':
                t = X(L, 'بيانات البورصة المصرية على المنصة', 'the Egyptian Exchange data on the platform')
            elif f.get('kind') == 'member':
                t = X(L, 'وصف المنشأة في دليل المنصة', 'the company\'s description in the platform directory')
            else:
                t = X(L, 'وصف المنشأة في المصادر العامة', 'the public-source description of the company')
            return '<span class="src">%s %s</span>' % (X(L, 'المصدر:', 'Source:'), t)
        t = en_only(L, scrub(src))
        return ('<span class="src">%s %s</span>' % (X(L, 'المصدر:', 'Source:'), esc(t))) if t else ''

    FACT_GROUPS = (('vm', ('vision', 'mission')), ('cert', ('cert', 'iso', 'accredit', 'standard', 'quality')),
                   ('mkt', ('export', 'market', 'countries')), ('cap', ('capacity', 'production', 'lines', 'output', 'area', 'employees', 'workers', 'staff')))

    def group_facts(facts, L):
        g = {'vm': [], 'cert': [], 'mkt': [], 'cap': [], 'other': []}
        for f in facts:
            if L == 'en' and not (f['label_en'] and f['value_en']):
                continue
            grp = next((name for name, keys in FACT_GROUPS if any(k in f['key'] for k in keys)), 'other')
            g[grp].append(f)
        return g

    # ------------------------------------------------------------------ the page
    def page(c, L, meta):
        EN = L == 'en'
        P = '/en' if EN else ''
        path = P + c['path']
        url = abs_url(path)
        here = esc(pct(path))
        md = media_of(c)
        sec = S['sec_by_slug'].get(c['sslug'] or '')
        sh = S['hub_sector_by_slug'].get(c['sslug'] or '')
        g = S['gov_by_code'].get(c['gov'])
        gh = S['hub_gov_by_code'].get(c['gov']) if g else None
        z = S['zone_by_id'].get(c.get('zone') or '')
        team, pub = is_team(c), is_pub(c)
        name = T(L, c['name'], c.get('name_en'))
        ov = S['overrides'].get(S.get('cur_path') or path, {}) if S.get('overrides') else {}
        h1 = ov.get('h1') or name
        S['cur_h1'] = h1
        city = city_text(c, L)
        gname = gov_name(c['gov'], L)
        sep = ', ' if EN else '، '
        place = sep.join(x for x in [city, gname] if x)
        intro = ''
        if sec:
            intro = X(L, '%s: %s في قطاع %s%s.', '%s: %s in the %s sector%s.') % (
                name, type_label(c, L), X(L, sec['ar'], sec['en']), (' – ' + place) if place else '')
        intro = ov.get('intro') or intro
        desc_text = c['desc'] if not EN else (company_desc_en(c) or '')
        rfq = rfq_link(c, L)
        wa_msg = X(L, 'مرحباً، أستفسر عن «%s» في منصة صنع في مصر: %s', 'Hello, I have a question about "%s" on Made in Egypt Gate: %s') % (name, url)
        wa = 'https://wa.me/%s?text=%s' % (WA_NUMBER, quote(wa_msg, safe=''))
        ac = S['cfg'].get('assistant', {})
        ask_on = bool(ac.get('enabled') and S.get('assistant_src'))
        tl = type_label(c, L)
        lm = fmt_date(S['lastmod_of'].get(c['path']) or S['today'].isoformat(), L)
        prods = products_of(c, L, md)
        fg = group_facts(md['facts'], L)
        logo = md['logo'] or ({'src': c['logo_img'][0], 'w': c['logo_img'][1], 'h': c['logo_img'][2]} if c.get('logo_img') and not md['indexed'] else None)
        if md['logo'] and isinstance(meta.get('jsonld_page'), dict) and not meta['jsonld_page'].get('logo'):
            meta['jsonld_page']['logo'] = SITE + pct(md['logo']['src'])     # a real logo file only (rule: nothing invented in JSON-LD)

        # --- breadcrumb (same items as the classic page)
        items = [home_crumb(L), (X(L, 'دليل المصانع', 'Factory directory'), lk(L, '/factories/'))]
        if sh:
            items.append((X(L, sec['t_ar'], sec['t_en']), lk(L, sh['path'])))
        items.append((name, lk(L, c['path'])))
        ch, _ld = crumbs(items, L, url)

        # --- hero slides: own photos + videos + product photos, else the honest context photos
        slides = []
        for ph in md['photos']:
            cap = en_only(L, X(L, ph['cap_ar'], ph['cap_en'])) or X(L, 'صورة من المنشأة', 'Photo of the company')
            slides.append(('ph', ph, cap))
        for v in md['videos']:
            slides.append(('vd', v, en_only(L, X(L, v['title_ar'], v['title_en'] or v['title_ar'])) or X(L, 'فيديو عن المنشأة', 'Video about the company')))
        pimgs = [p for p in prods if p['img']]
        for p in pimgs[:max(0, 7 - len(slides))]:
            pn = en_only(L, p['name'])
            slides.append(('pr', p, (X(L, 'منتج: %s', 'Product: %s') % pn) if pn else X(L, 'صورة منتج', 'Product photo')))
        ctx_caps = []
        for cx in md['context']:
            cap = X(L, cx['cap_ar'], cx['cap_en'])
            cap = en_only(L, cap)
            if not cap:
                if cx['kind'] == 'gov' and gname:
                    cap = X(L, 'صورة من محافظة %s', 'A view of %s Governorate') % gname
                elif cx['kind'] == 'zone' and z:
                    cap = en_only(L, X(L, 'صورة من %s', 'A view of %s') % X(L, z['name_ar'], z.get('name_en') or ''))
                cap = cap or X(L, 'صورة من المنطقة', 'A view of the area')
            if EN and 'not a photo' not in cap.lower():
                cap += ' — not a photo of the company'
            elif not EN and 'ليست صورة' not in cap:
                cap += ' — ليست صورة المنشأة'
            ctx_caps.append(cap)
        if not slides:
            slides = [('cx', cx, ctx_caps[i]) for i, cx in enumerate(md['context'][:4])]
        hero_html = hero_block(slides, L, name)
        S['fp_pre'] = hero_preload(slides)      # applied by render() only when this body is the one published

        # --- identity card
        chips = []
        if team:
            chips.append('<span class="chip vchip">%s</span>' % X(L, VER_AR, VER_EN))
        elif pub:
            chips.append('<span class="chip chip-gold">%s</span>' % X(L, 'بيانات من مصادر عامة', 'Public-source data'))
        else:
            chips.append('<span class="chip chip-gray">%s</span>' % X(L, 'مدرجة في دليل المنصة', 'Listed in the directory'))
        tl_x = en_only(L, tl)
        if tl_x:
            chips.append('<span class="chip chip-gold">%s%s</span>' % (icon('factory' if c['type'] == 'مصنع' else 'building'), esc(tl_x)))
        chips.append('<span class="chip chip-gray">%s</span>' % X(L, 'الدليل الصناعي المصري B2B', 'Egypt B2B directory'))
        if logo:
            logo_html = '<img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">' % (esc(pct(logo['src'])), esc(X(L, 'شعار ', 'Logo of ') + name), logo['w'], logo['h'])
        else:
            logo_html = '<span class="plogo-av" role="img" aria-label="%s">%s</span>' % (esc(X(L, 'الحروف الأولى من اسم ', 'Initials of ') + name), esc(monogram(name)))
        alt_name = ''
        if not EN:
            en_n = c.get('name_en') or tr(c['name']) or ''
            if en_n and not AR_RX.search(en_n) and en_n.strip().lower() != c['name'].strip().lower():
                alt_name = '<p class="fp-alt" lang="en" dir="ltr">%s</p>' % esc(en_n)
        loc_line = sep.join(x for x in [en_only(L, zone_short(z, L)) if z else en_only(L, city), en_only(L, gname)] if x) or \
            X(L, 'مصر — المحافظة غير محددة', 'Egypt — governorate not specified')
        sub = sub_sector(c, L, sec)
        tag_parts = []
        if sec:
            sn = esc(X(L, sec['t_ar'], sec['t_en']))
            tag_parts.append('<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), sn) if sh else sn)
        if sub:
            tag_parts.append(esc(sub))
        meta_lines = '<div class="meta"><span>%s<span>%s</span></span></div>' % (icon('pin'), esc(loc_line))
        if tag_parts:
            meta_lines += '<div class="meta"><span>%s<span>%s</span></span></div>' % (icon('tag'), ' › '.join(tag_parts))
        acts = ('<a class="btn btn-gold" href="%s" rel="nofollow">%s%s</a>' % (esc(rfq), icon('send'), X(L, 'طلب عرض سعر (RFQ)', 'Request a quote (RFQ)'))
                + '<a class="btn btn-wa" href="%s" target="_blank" rel="nofollow noopener">%s%s</a>' % (esc(wa), icon('chat'), X(L, 'واتساب', 'WhatsApp'))
                + '<button class="btn btn-line icon-btn fp-fav" type="button" data-fav data-name="%s" aria-pressed="false" aria-label="%s" title="%s">%s</button>'
                % (esc(name), X(L, 'أضف إلى المفضلة', 'Add to favourites'), X(L, 'أضف إلى المفضلة', 'Add to favourites'), icon('heart'))
                + '<button class="btn btn-line icon-btn" type="button" data-share aria-label="%s" title="%s">%s</button>'
                % (X(L, 'مشاركة الملف', 'Share this profile'), X(L, 'مشاركة الملف', 'Share this profile'), icon('share')))
        idcard = ('<div class="pbar"><div class="plogo">%s</div><div class="ptitle"><div class="badges">%s</div><h1 data-seo="h1">%s</h1>%s%s</div>'
                  '<div class="pacts">%s</div></div>' % (logo_html, ''.join(chips), esc(h1), alt_name, meta_lines, acts))

        # --- stats band: real facts only
        band = []
        for f in fg['other'][:2]:
            lab, val = fact_text(f, L)
            band.append((lab, fact_val(f, L), bool(re.fullmatch(r'[\d٠-٩][\d٠-٩.,٫%+\s]*', val)) and len(val) <= 9))
        if sec:
            sv = esc(X(L, sec['ar'], sec['en']))
            band.append((X(L, 'القطاع', 'Sector'), ('<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), sv)) if sh else sv, False))
        if g:
            gv = esc(X(L, g['ar'], g['en']))
            band.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path'])), gv)) if gh else gv, False))
        else:
            band.append((X(L, 'المحافظة', 'Governorate'), esc(X(L, 'غير محددة', 'Not specified')), False))
        if z:
            band.append((X(L, 'المدينة / المنطقة الصناعية', 'City / industrial zone'), '<a href="%s" title="%s">%s</a>' % (
                esc(lk(L, z['path'])), esc(X(L, z['name_ar'], z.get('name_en') or z['name_ar'])), esc(zone_short(z, L))), False))
        elif city:
            band.append((X(L, 'المدينة', 'City'), esc(city), False))
        if prods:
            band.append((X(L, 'المنتجات المدرجة', 'Listed products'), str(len(prods)), True))
        status_short = X(L, 'موثّق', 'Verified') if team else X(L, 'غير مسجّل', 'Not registered') if pub else X(L, 'مدرجة', 'Listed')
        band.append((X(L, 'حالة الإدراج', 'Listing status'), esc(status_short), False))
        band.append((X(L, 'آخر تحديث', 'Last update'), esc(lm), False))
        band = band[:6]     # one row of single-line values on a laptop; listing status and last update are also in the badges and the facts card
        band_html = '<div class="facts" role="list" aria-label="%s">%s</div>' % (
            X(L, 'بيانات المنشأة', 'Company facts'),
            ''.join('<div class="fx" role="listitem"><b%s>%s</b><span>%s</span></div>' % (' class="num"' if num else '', v, esc(lab)) for lab, v, num in band))

        # --- sections
        secs = []          # (id, tab label, html)
        # about
        lab_note = ''
        if team:
            lab_note = '<p class="vtag">%s%s</p>' % (icon('check'), X(L, VER_AR + ' – راجع فريق المنصة بيانات هذه الشركة يدوياً.', VER_EN + ' – the platform team checked this company\'s details by hand.'))
        elif pub:
            lab_note = '<p class="pubtag">%s%s</p>' % (icon('info'), X(L, 'بيانات من مصادر عامة – غير مسجّل في المنصة. المعلومات أدناه منقولة من المصدر المذكور وليست ملفاً مسجّلاً من المنشأة.',
                                                                      'Public-source data – not registered on the platform. The details below come from the cited source; this is not a profile registered by the company.'))
        if desc_text:
            about_p = '<p>%s</p>' % esc(desc_text)
        elif EN and c['kind'] == 'public' and c['desc']:
            about_p = ''
        else:
            about_p = '<p class="muted">%s</p>' % X(L, 'لم تُضف المنشأة وصفاً لنشاطها بعد.', 'No business description has been added yet.')
        about = '<h2>%s</h2>%s' % (X(L, 'عن المنشأة', 'About the company'), about_p)
        if intro:
            about += '<p class="lead" data-seo="intro">%s</p>' % esc(intro)
        if fg['vm']:
            about += '<div class="vm">%s</div>' % ''.join('<div><b>%s</b><p>%s</p>%s</div>' % (esc(a), fact_val(f, L), source_html(f, L))
                                                          for f in fg['vm'] for a, b in [fact_text(f, L)])
        if fg['other']:
            about += '<table class="spec">%s</table>' % ''.join('<tr><th>%s</th><td>%s%s</td></tr>' % (esc(a), fact_val(f, L), source_html(f, L))
                                                               for f in fg['other'] for a, b in [fact_text(f, L)])
        if c['kind'] == 'member' and c['flags']:
            miss = [m for m in (S['inc_bits'].get(str(b)) for b in (1, 2, 4, 8, 16, 32, 64, 128) if c['flags'] & b) if m]
            if miss:
                miss_t = X(L, '، '.join(miss), ', '.join(T(L, m) for m in miss))
                about += '<p class="ph-note">%s: %s</p>' % (X(L, 'بيانات غير مكتملة', 'Incomplete data'), esc(en_only(L, miss_t) or 'see the Arabic page'))
        secs.append(('about', X(L, 'نبذة', 'Overview'), '<section class="card" id="about">%s</section>' % about))
        # products
        secs.append(('products', X(L, 'المنتجات', 'Products'), products_block(c, L, prods, rfq, sec)))
        # capacity / markets (real facts only: the figures and market names a description states, quoted with their source)
        if fg['cap']:
            secs.append(('capacity', X(L, 'القدرات الإنتاجية', 'Capacity'), capacity_block(L, fg['cap'])))
        secs.append(('certs', X(L, 'الشهادات', 'Certificates'), certs_block(L, fg['cert'])))
        if fg['mkt']:
            secs.append(('markets', X(L, 'أسواق التصدير', 'Export markets'), markets_block(L, fg['mkt'])))
        gal = gallery_block(L, md, prods, ctx_caps)
        if gal:
            secs.append(('media', X(L, 'الصور والفيديو', 'Photos & video'), gal))
        rfq_sec = ('<section class="card rfq" id="rfq"><h2>%s</h2><p>%s</p><div class="fp-acts"><a class="btn btn-gold" href="%s" rel="nofollow">%s%s</a>'
                   '<a class="btn btn-wa" href="%s" target="_blank" rel="nofollow noopener">%s%s</a>%s</div><p class="note">%s</p></section>'
                   % (X(L, 'اطلب عرض سعر', 'Request a quote'),
                      X(L, 'يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.',
                        'Your request reaches the matching registered factories automatically; if no registered factory matches, the platform team follows it up personally.'),
                      esc(rfq), icon('send'), X(L, 'اطلب عرض سعر مجاناً', 'Request a free quote'), esc(wa), icon('chat'), X(L, 'واتساب المنصة', 'Platform WhatsApp'),
                      ('<button class="btn btn-line" type="button" data-ask>%s%s</button>' % (icon('spark'), X(L, 'اسأل جنة', 'Ask Janna'))) if ask_on else '',
                      X(L, 'لا نعرض أرقام هواتف أو بريد المنشآت؛ التواصل يتم عبر نموذج طلب عرض السعر وقنوات المنصة فقط.',
                        'Company phone numbers and e-mails are not published; contact goes through the RFQ form and the platform\'s own channels only.')))
        secs.append(('rfq', X(L, 'طلب عرض سعر', 'Request a quote'), rfq_sec))
        tabs = '<nav class="snav" aria-label="%s"><div class="in">%s</div></nav>' % (
            X(L, 'أقسام ملف المنشأة', 'Profile sections'), ''.join('<a href="%s#%s"%s>%s</a>' % (here, sid, ' class="on"' if i == 0 else '', esc(lab)) for i, (sid, lab, _h) in enumerate(secs)))
        main_col = (lab_note + ''.join(hh for _i, _l, hh in secs))

        # --- contact sidebar
        rows = ['<div class="ci"><span class="ic">%s</span><div><small>%s</small><b><a href="%s" rel="nofollow">%s</a></b></div></div>'
                % (icon('send'), X(L, 'طلب عرض سعر', 'Request a quote'), esc(rfq), X(L, 'أرسل طلبك عبر المنصة', 'Send your request via the platform')),
                '<div class="ci"><span class="ic">%s</span><div><small>%s</small><b><a href="%s" target="_blank" rel="nofollow noopener">%s</a></b></div></div>'
                % (icon('chat'), X(L, 'واتساب المنصة', 'Platform WhatsApp'), esc(wa), X(L, 'راسل فريق المنصة عن هذه المنشأة', 'Message the platform team about this company'))]
        if ask_on:
            rows.append('<div class="ci"><span class="ic">%s</span><div><small>%s</small><b><button class="lnk" type="button" data-ask>%s</button></b></div></div>'
                        % (icon('spark'), X(L, 'المساعد الذكي', 'AI assistant'), X(L, 'اسأل جنة عن هذه المنشأة', 'Ask Janna about this company')))
        web = c.get('website') or ''
        if web and URL_RX.match(web):
            host = urlparse(web).netloc.replace('www.', '') or web
            rows.append('<div class="ci"><span class="ic">%s</span><div><small>%s</small><b><a href="%s" rel="noopener" target="_blank" dir="ltr">%s</a></b></div>'
                        '<button class="cp" type="button" data-copy="%s">%s</button></div>' % (icon('globe'), X(L, 'الموقع الرسمي', 'Official website'), esc(web), esc(host), esc(web), X(L, 'نسخ', 'Copy')))
        loc_txt = loc_line
        rows.append('<div class="ci"><span class="ic">%s</span><div><small>%s</small><b>%s</b></div><button class="cp" type="button" data-copy="%s">%s</button></div>'
                    % (icon('pin'), X(L, 'الموقع', 'Location'), esc(loc_txt), esc(loc_txt), X(L, 'نسخ', 'Copy')))
        mq = ' '.join(x for x in [c['name'], (z['name_ar'] if z else city_text(c, 'ar')), gov_name(c['gov'], 'ar'), 'مصر'] if x)
        maps = 'https://www.google.com/maps/search/?api=1&query=' + quote(mq, safe='')
        map_html = ('<a class="fp-map" href="%s" target="_blank" rel="nofollow noopener">%s<span class="lb">%s%s</span></a>'
                    '<span class="ph-note">%s</span>' % (esc(maps), icon('pin', 'pin'), icon('map'),
                                                       X(L, 'ابحث عن الموقع على خرائط Google', 'Search the location on Google Maps'),
                                                       X(L, 'بحث بالاسم والمدينة — ليس إحداثيات مؤكدة للمنشأة.', 'A search by name and city — not confirmed coordinates of the company.')))
        dl = [(X(L, 'النوع', 'Type'), esc(tl))]
        if c['kind'] == 'public' and c.get('source') and URL_RX.match(c['source']):
            dl.append((X(L, 'مصدر البيانات', 'Data source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(c['source']), esc(urlparse(c['source']).netloc.replace('www.', '') or c['source']))))
        dl.append((X(L, 'حالة العضوية', 'Listing status'), esc(X(L, VER_AR, VER_EN) if team else X(L, PUB_AR, PUB_EN) if pub else X(L, 'مدرجة في دليل المنصة', 'Listed in the platform directory'))))
        dl.append((X(L, 'آخر تحديث للبيانات', 'Data last updated'), esc(lm)))
        # the contact card is the one that sticks on desktop (short: it fits a laptop screen); the map, the facts and the owner card follow it
        contact = '<div class="fp-stick"><div class="card" id="contact"><h2>%s</h2><div class="contact-list">%s</div></div></div>' % (
            X(L, 'بيانات التواصل', 'Contact'), ''.join(rows))
        contact += '<div class="card fp-sfacts"><h2>%s</h2>%s<dl class="dl">%s</dl></div>' % (
            X(L, 'بيانات المنشأة', 'Company facts'), map_html, ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in dl))
        owner = ('<div class="card owner"><h2>%s</h2><p class="muted" style="font-size:.9rem">%s</p><a class="btn btn-green" href="%s">%s</a></div>'
                 % (X(L, 'هل هذه منشأتك؟', 'Is this your company?'),
                    X(L, 'سجّل منشأتك أو طالِب بهذا الملف لتضيف صورك وفيديوهاتك ومنتجاتك وشهاداتك، وتصلك طلبات المشترين المطابقة تلقائياً.',
                      'Register your company or claim this profile to add your own photos, videos, products and certificates, and receive matching buyer requests automatically.'),
                    esc(static_url('register', L)), X(L, 'سجّل منشأتك / طالِب بملفك', 'Register / claim this profile')))
        side = '<aside class="side-col" aria-label="%s">%s%s</aside>' % (X(L, 'التواصل', 'Contact'), contact, owner)

        # --- similar companies + related links (the classic page's links, kept crawlable)
        sim = S['sim_of'](c)
        sim_html = ''
        if sim:
            sim_html = '<div class="card fp-sims" id="similar"><h2>%s</h2><ul class="dir-list">%s</ul>%s</div>' % (
                X(L, 'منشآت مشابهة', 'Similar companies'), ''.join(sim_li(s, L) for s in sim), sg_link(c, L, sec))
        links = []
        if sh:
            links.append('<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), esc(X(L, '%s %s', '%s %s') % (X(L, sec['noun_ar'], sec['t_en']), X(L, sec['t_ar'], sec['noun_en'].lower())))))
        if gh:
            links.append('<a href="%s">%s</a>' % (esc(lk(L, gh['path'])), esc(X(L, 'المصانع والشركات في %s', 'Factories and companies in %s') % gname)))
        if z:
            zn = X(L, z['name_ar'], z.get('name_en') or '')
            if zn and not (EN and AR_RX.search(zn)):
                links.append('<a href="%s">%s</a>' % (esc(lk(L, z['path'])), esc(zn)))
        links.append('<a href="%s">%s</a>' % (esc(lk(L, '/factories/')), X(L, 'دليل المصانع المصرية', 'Egyptian factory directory')))
        links_html = '<nav class="card fp-links" aria-label="%s"><h2>%s</h2><div class="links">%s</div></nav>' % (
            X(L, 'روابط ذات صلة', 'Related links'), X(L, 'روابط ذات صلة', 'Related links'), ''.join(links))

        return ('<div class="fp" id="fp"><div class="wrap"><div class="crumbs-row">%s</div>%s%s%s%s<div class="pbody"><div class="main-col">%s</div>%s</div>%s%s</div></div>'
                % (ch, hero_html, idcard, band_html, tabs, main_col, side, sim_html, links_html))

    def zone_short(z, L):
        """«مدينة العاشر من رمضان – المناطق الصناعية» → «مدينة العاشر من رمضان» (the city part of an industrial city's name);
        English mirrors it: "10th of Ramadan City Industrial Zones" → "10th of Ramadan City" (the full name stays in the link title)"""
        if not z:
            return ''
        if L == 'en':
            n = z.get('name_en') or z['name_ar']
            return (re.sub(r'\s+Industrial Zones?$', '', n) or n) if z['id'].startswith('ic-') else n
        n = z['name_ar']
        return n.split(' – ')[0] if z['id'].startswith('ic-') and ' – ' in n else n

    def sub_sector(c, L, sec):
        """the old site's own category label of the company (MIGOLDFAC[12] / facx raw sector) when it adds something to the sector"""
        raw = ''
        try:
            if c['kind'] == 'member':
                raw = S['D']['fac'][c['i']][12] or ''
            else:
                raw = (S['D'].get('facx_raw_sector') or {}).get(c['name']) or ''
        except (KeyError, IndexError, TypeError):
            raw = ''
        raw = re.split(r'\s*[،|;]\s*', _txt(raw))[0] if raw else ''
        if not raw or len(raw) > 60:
            return ''
        if sec and (raw in (sec['ar'], sec['t_ar']) or raw in sec['ar']):
            return ''
        if L == 'en':
            v = tr(raw)
            return v if v and not AR_RX.search(v) else ''
        return raw

    LIC_RX = re.compile(r'^CC (BY(?:-SA)?) (\d\.\d)$', re.I)

    def credit_html(cr, L, cls='cr'):
        """«الصورة: <author> · <licence> · ويكيميديا كومنز»: the attribution CC BY / BY-SA ask for (author, licence link, source link)"""
        if not cr:
            return ''
        parts = []
        if cr['author']:
            au = esc(cr['author'])
            parts.append(('<bdi lang="ar">%s</bdi>' % au) if (L == 'en' and AR_RX.search(cr['author'])) else
                         ('<bdi lang="en" dir="ltr">%s</bdi>' % au) if (L == 'ar' and not AR_RX.search(cr['author'])) else au)
        if cr['license']:
            m = LIC_RX.match(cr['license'])
            parts.append('<a href="https://creativecommons.org/licenses/%s/%s/" rel="license nofollow noopener" target="_blank" dir="ltr">%s</a>'
                         % (m.group(1).lower(), m.group(2), esc(cr['license'])) if m else esc(X(L, 'ملكية عامة', 'Public domain') if 'public' in cr['license'].lower() else cr['license']))
        wc = X(L, 'ويكيميديا كومنز', 'Wikimedia Commons')
        parts.append(('<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(cr['url']), wc)) if cr['url'] else wc)
        return '<small class="%s">%s %s</small>' % (cls, X(L, 'الصورة:', 'Photo:'), ' · '.join(parts))

    def credit_text(cr, L):
        """the same attribution as plain text (lightbox caption)"""
        if not cr:
            return ''
        lic = X(L, 'ملكية عامة', 'Public domain') if 'public' in (cr['license'] or '').lower() else cr['license']
        return '%s %s' % (X(L, 'الصورة:', 'Photo:'), ' · '.join(x for x in [cr['author'], lic, X(L, 'ويكيميديا كومنز', 'Wikimedia Commons')] if x))

    NOTE_RX = re.compile(r'\s*—\s*((?:ليست صورة المنشأة|not a photo of (?:this|the) company)(?: أو منتجاتها| or its products)?)\s*$')

    def cap_html(cap):
        """caption text + its «ليست صورة المنشأة» note in its own span: on phones the text may be cut to two lines, the note never"""
        m = NOTE_RX.search(cap)
        if not m:
            return '<span class="cs">%s</span>' % esc(cap)
        return '<span class="cs">%s</span><span class="nt"> — %s</span>' % (esc(cap[:m.start()]), esc(m.group(1)))

    def framed(k, it):
        """a picture too small to fill the hero is shown whole in a frame over a blurred copy of itself (a video poster too:
        the local YouTube thumbnails are 480×360, stretched to the hero's width they would be 2.5× upscaled)"""
        if k == 'vd':
            return bool(it.get('thumb')) and it['tw'] < 900
        return k == 'pr' or (k == 'cx' and it['w'] < 900)

    def hero_preload(slides):
        """the hero's first picture for the generator's <link rel=preload> (meta['preload'] = (href, srcset)): only a first picture
        WITHOUT a srcset, whose one URL is the file the <img> loads (the head's imagesizes is the generator's own, so a srcset preload
        could pick another width than the <img> and download twice); None = no preload (the <img fetchpriority=high> is early anyway)"""
        if not slides:
            return None
        k, it, _cap = slides[0]
        if k == 'vd':
            return (pct(it['thumb']), '') if it.get('thumb') else None
        im = it['img'] if k == 'pr' else it
        if framed(k, im) or not srcset(im, '100vw', (960,)):
            return (pct(im['src']), '')
        return None

    def hero_block(slides, L, name):
        n = len(slides)
        if not n:
            return ('<div class="slider fp-hero fp-empty" role="img" aria-label="%s"><div class="in">%s<b>%s</b><small>%s</small></div></div>'
                    % (esc(X(L, 'لا توجد صور للمنشأة بعد', 'No photos of the company yet')), icon('image'),
                       X(L, 'لم تُضف صور أو فيديوهات للمنشأة بعد', 'No photos or videos of the company yet'),
                       X(L, 'يرفع المصنع صوره وفيديوهاته من لوحة التحكم، وتظهر هنا بعد مراجعة المنصة.', 'The factory uploads its photos and videos from its dashboard; they appear here after the platform reviews them.')))
        out = []
        for i, (k, it, cap) in enumerate(slides):
            first = i == 0
            att = ' fetchpriority="high" decoding="async"' if first else ' loading="lazy" decoding="async"'
            if k == 'cx':
                ic, lab = 'pin', (X(L, 'صورة المحافظة', 'Governorate photo') if it.get('kind') == 'gov' else
                                  X(L, 'صورة توضيحية', 'Illustration') if it.get('kind') == 'sector' else X(L, 'صورة المنطقة', 'Area photo'))
            else:
                ic, lab = {'ph': ('image', X(L, 'صورة', 'Photo')), 'vd': ('film', X(L, 'فيديو', 'Video')), 'pr': ('box', X(L, 'منتج', 'Product'))}[k]
            im = it['img'] if k == 'pr' else it
            fr = framed(k, im)
            lo = fr and k != 'vd' and im['w'] < LO_W
            cr = credit_html(it.get('credit'), L) if k in ('ph', 'cx') else ''
            if k == 'vd':   # video: local thumbnail (or a plain panel) + play button; the youtube-nocookie player loads only after a tap
                if fr:      # a small poster in a 16:9 frame over a blurred copy of itself (the frame also crops the thumbnail's letterbox bars)
                    bg = ('style="background-image:url(&quot;%s&quot;)"' if first else 'data-bg="%s"') % esc(pct(it['thumb']))
                    th = '<span class="bg" %s></span><img class="fg" src="%s" width="%d" height="%d" alt="%s"%s>' % (bg, esc(pct(it['thumb'])), it['tw'], it['th'], esc(cap), att)
                elif it['thumb']:
                    th = '<img src="%s" width="%d" height="%d" alt="%s"%s>' % (esc(pct(it['thumb'])), it['tw'], it['th'], esc(cap), att)
                else:
                    th = '<span class="vph"></span>'
                media = th + '<button class="play" type="button" data-yt="%s" data-title="%s" aria-label="%s">%s</button>' % (
                    esc(it['yt']), esc(cap), esc(X(L, 'تشغيل الفيديو: %s', 'Play video: %s') % cap), icon('play'))
            elif fr:    # the blurred backdrop of a later slide is set by the script when the slide comes up (no early download)
                bg = ('style="background-image:url(&quot;%s&quot;)"' if first else 'data-bg="%s"') % esc(pct(im['src']))
                media = ('<span class="bg" %s></span><img class="fg" src="%s" width="%d" height="%d" alt="%s"%s>'
                         % (bg, esc(pct(im['src'])), im['w'], im['h'], esc(cap), att))
            else:
                media = '<img src="%s"%s width="%d" height="%d" alt="%s"%s>' % (esc(pct(it['src'])), srcset(it, '(max-width: 1272px) 100vw, 1240px', (960,)), it['w'], it['h'], esc(cap), att)
            out.append('<figure class="slide %s%s%s%s" aria-roledescription="%s" aria-label="%s" aria-hidden="%s">%s<span class="kind chip">%s%s</span><figcaption class="cap">%s%s</figcaption></figure>'
                       % (k, ' fr' if fr else '', ' lo' if lo else '', ' on' if first else '', X(L, 'شريحة', 'slide'), esc(X(L, '%d من %d', '%d of %d') % (i + 1, n)),
                          'false' if first else 'true', media, icon(ic), esc(lab), cap_html(cap), cr))
        nav = ''
        if n > 1:
            nav = ('<span class="counter num"></span><button class="fp-pp" type="button" aria-pressed="false" aria-label="%s" title="%s" hidden>%s%s</button>'
                   '<button class="s-nav s-prev" type="button" aria-label="%s">%s</button><button class="s-nav s-next" type="button" aria-label="%s">%s</button>'
                   % (X(L, 'إيقاف العرض التلقائي', 'Pause the slideshow'), X(L, 'إيقاف العرض التلقائي', 'Pause the slideshow'), icon('pause'), icon('play'),
                      X(L, 'السابق', 'Previous'), icon('chev'), X(L, 'التالي', 'Next'), icon('chev')))
        return ('<section class="slider fp-hero%s" aria-roledescription="%s" aria-label="%s" tabindex="0">%s%s</section>'
                % ('' if n > 1 else ' fp-one', X(L, 'عرض متتابع', 'carousel'), esc(X(L, 'صور وفيديو: %s', 'Photos and video: %s') % name), ''.join(out), nav))

    def products_block(c, L, prods, rfq, sec):
        if not prods:
            return ('<section class="card" id="products"><h2>%s</h2><p class="muted">%s</p><div class="fp-cta"><p>%s</p><a class="btn btn-sm btn-green" href="%s">%s</a></div></section>'
                    % (X(L, 'المنتجات والخدمات', 'Products & services'), X(L, 'لم تُضف منتجات لهذه المنشأة بعد.', 'No products have been added for this company yet.'),
                       X(L, 'يضيف المصنع منتجاته وصورها من لوحة التحكم.', 'The factory adds its products and their photos from its dashboard.'),
                       esc(static_url('register', L)), X(L, 'هل هذه منشأتك؟', 'Is this your company?')))
        cats = []
        for p in prods:
            if p['cat']:
                lab = X(L, p['cat'][0] or p['cat'][1], p['cat'][1])
                if lab and not (L == 'en' and AR_RX.search(lab)):
                    p['ck'] = 'c' + sha(lab, 6)
                    p['cl'] = lab
                    if p['ck'] not in [x[0] for x in cats]:
                        cats.append((p['ck'], lab))
        filt = ''
        if len(cats) >= 2:
            cnt = {k: sum(1 for p in prods if p.get('ck') == k) for k, _l in cats}
            filt = '<div class="filter" id="fpFilter" role="group" aria-label="%s"><button type="button" class="on" data-c="*" aria-pressed="true">%s</button>%s</div>' % (
                X(L, 'تصفية المنتجات', 'Filter products'), X(L, 'الكل', 'All'),
                ''.join('<button type="button" data-c="%s" aria-pressed="false">%s <span class="num">%d</span></button>' % (k, esc(lab), cnt[k]) for k, lab in cats))
        cards, minis = [], []
        for p in prods:
            nm = esc(p['name'])
            ar_attr = ' lang="ar"' if (L == 'en' and AR_RX.search(p['name'])) else ''
            title = ('<a href="%s">%s</a>' % (esc(p['href']), nm)) if p['href'] else nm
            row = ('<div class="row"><span>%s</span><span>%s</span></div>' % (X(L, 'الفئة', 'Category'), esc(p['cl']))) if p.get('cl') else ''
            # the RFQ form's product field gets the name the buyer saw on this card (English on /en/, Arabic only when there is no English)
            btns = '<a class="btn btn-sm btn-green" href="%s" rel="nofollow" data-rfq-item="%s">%s</a>' % (esc(rfq), esc(p['name']), X(L, 'طلب سعر', 'Request price'))
            if p['href']:
                btns += '<a class="btn btn-sm btn-line" href="%s">%s</a>' % (esc(p['href']), X(L, 'التفاصيل', 'Details'))
            dc = (' data-cat="%s"' % p['ck']) if p.get('ck') else ''
            if p['img']:
                im = p['img']
                img = '<img src="%s" width="%d" height="%d" alt="%s" loading="lazy" decoding="async">' % (esc(pct(im['src'])), im['w'], im['h'], nm)
                pc = 'fp-pimg lo' if im['w'] < LO_W else 'fp-pimg'     # a small picture is shown whole at ≤1.5× its size, never stretched
                thumb = ('<a class="%s" href="%s" tabindex="-1" aria-hidden="true">%s</a>' % (pc, esc(p['href']), img)) if p['href'] else '<span class="%s">%s</span>' % (pc, img)
                cards.append('<article class="prod"%s>%s<div class="b"><h3%s>%s</h3>%s<div class="acts">%s</div></div></article>' % (dc, thumb, ar_attr, title, row, btns))
            else:   # a clean card without a photo: category icon, name, category, «طلب سعر» (no stand-in picture)
                minis.append('<article class="prod mini"%s><span class="mi" aria-hidden="true">%s</span><div class="b"><h3%s>%s</h3>%s<div class="acts">%s</div></div></article>'
                             % (dc, icon('box'), ar_attr, title, row, btns))

        def more(items, cls, first):
            # a long list: the first cards, then the rest behind «عرض الباقي» (a <details>: in the HTML, works without JS)
            if len(items) <= first + 2:
                return '<div class="%s">%s</div>' % (cls, ''.join(items))
            return ('<div class="%s">%s</div><details class="fp-more"><summary>%s%s</summary><div class="%s">%s</div></details>'
                    % (cls, ''.join(items[:first]), icon('chev'), X(L, 'عرض باقي المنتجات (%d)', 'Show the other products (%d)') % (len(items) - first), cls, ''.join(items[first:])))
        grid = (more(cards, 'prods', 9) if cards else '') + (more(minis, 'fp-plist', 12) if minis else '')
        n_img = sum(1 for p in prods if p['img'])
        note = X(L, 'المنتجات من بيانات المنشأة في دليل المنصة؛ تظهر صور المنتجات الحقيقية فقط، ويضيف المصنع منتجاته وصورها من لوحة التحكم.',
                 'Products come from the company\'s data in the platform directory; only real product photos are shown, and the factory adds its products and photos from its dashboard.')
        return ('<section class="card" id="products"><header><h2>%s <span class="chip chip-gray num" id="fpPCount">%d</span></h2>%s</header><div id="fpProds">%s</div>'
                '<span class="ph-note">%s%s</span></section>'
                % (X(L, 'المنتجات والخدمات', 'Products & services'), len(prods), filt, grid, note,
                   (X(L, ' (%d بصورة)', ' (%d with a photo)') % n_img) if n_img and n_img < len(prods) else ''))

    CAP_ICON = {'capacity': 'gauge', 'area': 'map', 'employees': 'building'}

    def capacity_block(L, facts):
        """one card per stated figure (production capacity, factory area, workforce): value, label, source — no chart for one number"""
        cards = ''.join('<div class="fp-kpi"><span class="ic">%s</span><div><b>%s</b><small>%s</small>%s</div></div>'
                        % (icon(next((v for k, v in CAP_ICON.items() if k in f['key']), 'gauge')), fact_val(f, L), esc(a), source_html(f, L))
                        for f in facts for a, b in [fact_text(f, L)])
        return ('<section class="card" id="capacity"><h2>%s</h2><div class="fp-kpis">%s</div><span class="ph-note">%s</span></section>'
                % (X(L, 'القدرات الإنتاجية', 'Production capacity'), cards,
                   X(L, 'أرقام كما وردت في وصف المنشأة؛ يحدّثها المصنع من لوحة التحكم.', 'Figures as stated in the company\'s description; the factory updates them from its dashboard.')))

    def markets_block(L, facts):
        """named markets as cards (the value is the list the description gives), a stated number of countries as a figure card"""
        cards = []
        for f in facts:
            a, b = fact_text(f, L)
            names = [x.strip() for x in re.split(r'\s*[،,]\s*', b) if x.strip()] if 'markets' in f['key'] else []
            if len(names) >= 2:
                cards += ['<div class="fp-mkt"><span class="ic">%s</span><b>%s</b></div>' % (icon('globe'), esc(x[:1].upper() + x[1:])) for x in names]
            else:
                cards.append('<div class="fp-mkt wide"><span class="ic">%s</span><div><b>%s</b><small>%s</small></div></div>' % (icon('route'), fact_val(f, L), esc(a)))
            src = source_html(f, L)
            if src:
                cards.append('<div class="fp-mkt-src">%s</div>' % src)
        return ('<section class="card" id="markets"><h2>%s</h2><div class="fp-mkts">%s</div></section>'
                % (X(L, 'أسواق التصدير', 'Export markets'), ''.join(cards)))

    def certs_block(L, facts):
        if facts:
            cards = ''.join('<div class="cert real"><span class="ic">%s</span><div><b>%s</b><small>%s</small>%s</div></div>'
                            % (icon('award'), fact_val(f, L), esc(a), source_html(f, L)) for f in facts for a, b in [fact_text(f, L)])
            return '<section class="card" id="certs"><h2>%s</h2><div class="certs">%s</div></section>' % (X(L, 'الشهادات والاعتمادات', 'Certificates & accreditations'), cards)
        slots = [(X(L, 'شهادات الجودة', 'Quality certificates')), (X(L, 'السجل الصناعي والتراخيص', 'Industrial register & licences')),
                 (X(L, 'شهادات المطابقة والاعتماد', 'Conformity & accreditation'))]
        cards = ''.join('<div class="cert fp-slot"><span class="ic">%s</span><div><b>%s</b><small>%s</small></div></div>' % (icon('plus'), esc(s), X(L, 'لم تُضف بعد', 'Not added yet')) for s in slots)
        return ('<section class="card" id="certs"><h2>%s</h2><div class="certs">%s</div><span class="ph-note">%s</span>'
                '<div class="fp-cta"><p>%s</p><a class="btn btn-sm btn-green" href="%s">%s</a></div></section>'
                % (X(L, 'الشهادات والاعتمادات', 'Certificates & accreditations'), cards,
                   X(L, 'يضيف المصنع شهاداته من لوحة التحكم وتظهر هنا بعد مراجعة المنصة.', 'The factory adds its certificates from its dashboard; they appear here after the platform reviews them.'),
                   X(L, 'هل هذه منشأتك؟ سجّل منشأتك أو طالِب بملفك', 'Is this your company? Register it or claim this profile'),
                   esc(static_url('register', L)), X(L, 'سجّل / طالِب بملفك', 'Register / claim')))

    def gallery_block(L, md, prods, ctx_caps):
        items = []
        for ph in md['photos'][:12]:
            cap = en_only(L, X(L, ph['cap_ar'], ph['cap_en'])) or X(L, 'صورة من المنشأة', 'Photo of the company')
            items.append(('ph', ph, cap))
        for v in md['videos'][:6]:
            items.append(('vd', v, en_only(L, X(L, v['title_ar'], v['title_en'] or v['title_ar'])) or X(L, 'فيديو عن المنشأة', 'Video about the company')))
        if len(items) < 4:
            for p in [p for p in prods if p['img']][:8 - len(items)]:
                pn = en_only(L, p['name'])
                items.append(('pr', p['img'], (X(L, 'منتج: %s', 'Product: %s') % pn) if pn else X(L, 'صورة منتج', 'Product photo')))
        for i, cx in enumerate(md['context'][:4]):
            items.append(('cx', cx, ctx_caps[i]))
        if not items:
            return ''
        n_ph = sum(1 for k, _i, _c in items if k in ('ph', 'pr'))
        n_vd = sum(1 for k, _i, _c in items if k == 'vd')
        n_cx = sum(1 for k, _i, _c in items if k == 'cx')
        def ar_n(k, one, two, few, many):
            return one if k == 1 else two if k == 2 else ('%d %s' % (k, few if 3 <= k % 100 <= 10 else many))
        cnt = []
        if n_ph:
            cnt.append(X(L, ar_n(n_ph, 'صورة واحدة', 'صورتان', 'صور', 'صورة'), '%d photo%s' % (n_ph, '' if n_ph == 1 else 's')))
        if n_vd:
            cnt.append(X(L, ar_n(n_vd, 'فيديو واحد', 'فيديوهان', 'فيديوهات', 'فيديو'), '%d video%s' % (n_vd, '' if n_vd == 1 else 's')))
        if n_cx:
            cnt.append(X(L, ar_n(n_cx, 'صورة واحدة للمكان', 'صورتان للمكان', 'صور للمكان', 'صورة للمكان'), '%d of the area' % n_cx))
        own = n_ph + n_vd
        btns = []
        many = len(items) + (0 if own else 1) >= 5
        for i, (k, it, cap) in enumerate(items):
            wide = ' wide' if i == 0 and many and k != 'pr' else ''
            if k == 'vd':
                th = ('<img src="%s" width="%d" height="%d" alt="%s" loading="lazy" decoding="async">' % (esc(pct(it['thumb'])), it['tw'], it['th'], esc(cap))) if it['thumb'] else '<span class="vph"></span>'
                btns.append('<button class="vd%s" type="button" data-lb data-yt="%s" data-cap="%s" aria-label="%s">%s<span class="v">%s</span><span class="t" aria-hidden="true">%s</span></button>'
                            % (wide, esc(it['yt']), esc(cap), esc(X(L, 'تشغيل الفيديو: %s', 'Play video: %s') % cap), th, icon('play'), esc(cap)))
            else:
                # tiles are at most ~600 px wide: the index's ≤640 px copy (else a smaller copy made here) is enough; the lightbox opens the original
                if it.get('sm'):
                    v = (it['sm']['src'], it['sm']['w'], it['sm']['h'])
                else:
                    v = variant(it, 960 if (wide or len(items) <= 3) else 480) if k != 'pr' else None
                tsrc, tw, th = (v[0], v[1], v[2]) if v else (it['src'], it['w'], it['h'])
                crt = credit_text(it.get('credit'), L) if k in ('ph', 'cx') else ''
                btns.append('<button class="%s%s" type="button" data-lb data-full="%s" data-w="%d" data-cap="%s"%s aria-label="%s"><img src="%s" width="%d" height="%d" alt="%s" loading="lazy" decoding="async"><span class="t" aria-hidden="true">%s</span></button>'
                            % (k, wide, esc(pct(it['src'])), it['w'], esc(cap), (' data-cr="%s"' % esc(crt)) if crt else '', esc(X(L, 'تكبير الصورة: %s', 'Enlarge photo: %s') % cap), esc(pct(tsrc)), tw, th, esc(cap), esc(cap)))
        if not own:     # no photo or video of the company itself yet: say so, and invite it to add them
            btns.append('<a class="up" href="%s">%s<span>%s</span><small>%s</small></a>' % (
                esc(static_url('register', L)), icon('plus'), X(L, 'صور وفيديو المنشأة', 'Photos & video of the company'), X(L, 'يضيفها المصنع من لوحة التحكم', 'Added by the factory from its dashboard')))
        ncls = ' n%d' % len(btns) if len(btns) <= 3 else ''
        note = X(L, 'الصور المعلَّمة «ليست صورة المنشأة» للتعريف بالمنطقة أو المحافظة فقط. يرفع المصنع صوره وفيديوهاته من لوحة التحكم، وتظهر هنا وفي أعلى الصفحة.',
                 'Pictures marked "not a photo of the company" only show the area or governorate. The factory uploads its own photos and videos from its dashboard; they appear here and at the top of the page.') if n_cx else \
            X(L, 'صور وفيديو المنشأة كما وردت في بياناتها على المنصة.', 'The company\'s photos and videos as listed in its platform data.')
        # attribution of every Wikimedia Commons picture on the page (CC BY / BY-SA: author, licence, source)
        crs, seen = [], set()
        for k, it, cap in items:
            cr = it.get('credit') if k in ('ph', 'cx') else None
            if cr and it['src'] not in seen:
                seen.add(it['src'])
                crs.append('<li>%s — %s</li>' % (esc(re.sub(r'\s*—\s*(?:ليست صورة المنشأة|not a photo of (?:this|the) company)(?: أو منتجاتها| or its products)?\s*$', '', cap)), credit_html(cr, L, 'crl')))
        credits = ('<div class="fp-credits"><b>%s</b><ul>%s</ul></div>' % (X(L, 'مصادر الصور وتراخيصها', 'Photo credits and licences'), ''.join(crs))) if crs else ''
        return ('<section class="card" id="media"><header><h2>%s</h2><span class="muted">%s</span></header><div class="gal%s">%s</div><span class="ph-note">%s</span>%s</section>'
                % (X(L, 'الصور والفيديو', 'Photos & video'), esc(' · '.join(cnt)), ncls, ''.join(btns), note, credits))

    def sim_li(s, L):
        nm = T(L, s['name'], s.get('name_en'))
        meta_ = ' · '.join(x for x in [type_label(s, L), gov_name(s['gov'], L) or X(L, 'المحافظة غير محددة', 'Governorate not given')] if x)
        snip = ''
        if L == 'ar' and s['desc']:
            snip = '<p>%s</p>' % esc(first_words(s['desc'], 18))
        elif L == 'en':
            v = company_desc_en(s)
            if v:
                snip = '<p>%s</p>' % esc(first_words(v, 18))
        lab = (('<span class="pub">%s</span>' % X(L, PUB_AR, PUB_EN)) if is_pub(s) else ('<span class="vf">%s</span>' % X(L, VER_AR, VER_EN)) if is_team(s) else '')
        sm = media_of(s)
        pic, cls = None, ''
        if sm['logo']:
            pic = sm['logo']
        elif s.get('logo_img') and not sm['indexed']:
            pic = {'src': s['logo_img'][0], 'w': s['logo_img'][1], 'h': s['logo_img'][2]}
        elif sm['photos']:
            pic, cls = sm['photos'][0], ' ph'
        elif sm['indexed']:     # a product photo the index accepted (never a placeholder)
            pp = next((p for p in sm['products'] if p['img']), None)
            if pp:
                pic = pp['img']
        else:
            pp = next((p for p in (s.get('prods') or []) if p.get('img_url')), None)
            if pp:
                pic = {'src': pp['img_url'][0], 'w': pp['img_url'][1], 'h': pp['img_url'][2]}
        if pic:
            if cls and pic.get('sm'):
                pic = pic['sm']
            v = variant(pic, 160) if cls else None
            src = v[0] if v else pic['src']
            vis = '<span class="fp-sl%s"><img src="%s" width="%d" height="%d" alt="%s" loading="lazy" decoding="async"></span>' % (
                cls, esc(pct(src)), v[1] if v else pic['w'], v[2] if v else pic['h'], esc(X(L, 'صورة ', 'Image: ') + nm))
        else:
            vis = '<span class="fp-sl av" aria-hidden="true">%s</span>' % esc(monogram(nm))
        lang = '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"'
        return '<li>%s<div><a class="nm" href="%s"%s>%s</a><span class="m">%s</span>%s%s</div></li>' % (vis, esc(lk(L, s['path'])), lang, esc(nm), esc(meta_), snip, lab)

    def sg_link(c, L, sec):
        sg = S['hub_sg_by_key'].get((c['sslug'], c['gov']))
        if sec and sg and sg['indexable'] and (L == 'ar' or sg.get('en')):
            return '<p><a href="%s">%s</a></p>' % (esc(lk(L, sg['path'])), esc(X(L, 'كل %s %s في %s (%d)', 'All %s %s in %s (%d)') % (
                X(L, sec['noun_ar'], sec['noun_en'].lower()), X(L, sec['t_ar'], sec['t_en']), gov_name(c['gov'], L), sg['n'])))
        return ''

    # ------------------------------------------------------------------ entry points
    def render(c, L, classic, meta):
        st = S.setdefault('fp_stats', {'ar': 0, 'en': 0, 'en_fallback': 0})
        if L == 'en':
            ok, why = (False, meta['en_fail']) if meta.get('en_fail') else en_gate(meta['title'], meta.get('h1'), classic)
            if not ok:
                meta['en_fail'] = why        # the same decision as the classic layout: this company has no /en/ twin
                return classic
        body = page(c, L, meta)
        pre = S.pop('fp_pre', None)
        if L == 'en':
            ok, why = en_gate(meta['title'], meta.get('h1'), body)
            if not ok:
                st['en_fallback'] += 1
                if st['en_fallback'] <= 10:
                    S['warnings'].append('fprof_en_fallback:%s:%s' % (c['path'], why))
                return classic
        st[L] += 1
        # the classic body is replaced, so its hero picture must not be preloaded: newer generators keep the classic hero's preload in
        # S['hero_pre'] and copy it into meta['preload'] unless meta has that key (finalize_page). The rich hero's own first picture is
        # preloaded instead when that is safe (hero_preload), else nothing. Older generators ignore both keys.
        S['hero_pre'] = None
        meta['preload'] = pre
        return body

    def assets(css, js):
        return css + '\n' + CSS, js + '\n' + JS

    return {'render': render, 'assets': assets, 'media_index': media_index}
