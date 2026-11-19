# -*- coding: utf-8 -*-
"""PPROF — the product view («صفحة المنتج») in the layout of the sister platform's product quick view (madeinsaudigate.com/market.html):
gallery │ info │ buy box, one design (same classes, same section order, same «more» strip) for
  1. the /market/ quick view of a price-on-request product — market.part.html renders it in JS with these classes, and
  2. the full product page /industrial_products/<slug>/ (+ /en/ twin) — rendered here at build time, crawlable without JS.

Loaded by seo_build.part.py («# PPROF hook» lines: the loader at the end of _seo_build_module, one line in render_product,
two lines in emit_assets) and used by site.py (one «# PPROF hook» line after seo_prepare: CSS + build-time data for /market/).
The head of every product page (title, meta description, canonical, hreflang, robots, JSON-LD) is still written by render_product /
finalize_page: only the <main> body changes, and every link, image and text of render_product's body stays on the page (its sector
photo, the photo's alt text and its Wikimedia Commons credit are the band that holds the breadcrumb).

Honesty (owner rule, REAL DATA ONLY): only fields present in the data. Where the sister site shows a price, wholesale tiers, rating,
stock, shipping time or a response time, this view shows «السعر عند الطلب» and the platform's quote-request path; the spec table has
only real rows; badges only when true («✓ موثّق» only for a company the platform team verified); the gallery shows the product's own
listing image only: a listing image that is the company's logo is shown as the logo (smaller, captioned «شعار الشركة», no zoom), and
an image the photo audit found not to show this product (another company's logo, a blank tile, an unrelated photo) or the old site's
shared placeholder is not shown at all («لا توجد صورة»); zoom is offered only for a photo with at least twice the pixels of its box.
The strip under the photo is labelled «منتجات أخرى من نفس المصنع» (other real products of the same supplier), never a fake gallery.
No unit is preselected for the quantity (the visitor picks one, or none). No factory contact anywhere: the WhatsApp button is the
platform's own number (as on the contact page).
"""

PPROF_WA = 'https://wa.me/201279188996'

# market categories (market.part.html CATS; «cosm» is listed there under «other»)
PPROF_CATS = {
    'food': ('الصناعات الغذائية', 'Food industries'), 'build': ('مواد البناء', 'Building materials'), 'plastic': ('البلاستيك والتغليف', 'Plastics & packaging'),
    'elec': ('الكهرباء والتكييف', 'Electrical & air conditioning'), 'glass': ('الزجاج', 'Glass'), 'metal': ('الحديد والمعادن', 'Iron, steel & metals'),
    'petro': ('البتروكيماويات والأسمدة', 'Petrochemicals & fertilizers'), 'med': ('الطبي والأدوية', 'Medical & pharmaceuticals'), 'furn': ('الأثاث', 'Furniture'),
    'other': ('منتجات صناعية متنوعة', 'Miscellaneous industrial products'),
}
# the units a visitor can pick for the quantity (a choice of the visitor, never a claim about the product); value = Arabic label.
# Nothing is preselected: a CT scanner in «عبوة» or a projects department in «طن» would be nonsense, so the quote carries the
# quantity alone until the visitor picks a unit.
PPROF_UNITS = [('قطعة', 'piece'), ('كرتونة', 'carton'), ('عبوة', 'pack'), ('كجم', 'kg'), ('طن', 'ton'), ('لتر', 'litre'), ('متر', 'metre'),
               ('م²', 'm²'), ('طقم', 'set'), ('لفة', 'roll'), ('شيكارة', 'bag'), ('حاوية', 'container')]
PPROF_UNIT_NONE = ('اختر الوحدة', 'Choose a unit')
# category icons (market.part.html ICON / CCOL): the placeholder of a product without a photo
PPROF_ICON = {'food': 'M4 10h16v10H4zM6 10V7a6 3 0 0 1 12 0v3', 'build': 'M3 21h18M5 21V9h14v12M9 9V5h6v4M8 13h2M14 13h2M8 17h2M14 17h2',
              'plastic': 'M9 3h6v4l2 3v11H7V10l2-3z', 'elec': 'M13 2 4 14h7l-1 8 9-12h-7z', 'glass': 'M4 4h16v16H4zM4 4l16 16M14 4l6 6',
              'metal': 'M3 7h18v4H3zM3 13h18v4H3z', 'petro': 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
              'med': 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z', 'furn': 'M5 10h14v4H5zM7 14v6M17 14v6M7 10V5h10v5', 'other': 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10'}
PPROF_CCOL = {'food': '#C09300', 'build': '#8B6B4A', 'plastic': '#1F6E8C', 'elec': '#C99A06', 'glass': '#5FA8C2', 'metal': '#5B6B7A', 'petro': '#C8102E',
              'med': '#B03A48', 'furn': '#7A5A3A', 'other': '#64748B'}
PPROF_WA_SVG = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>')

# The photo audit of the member listings (each listing image looked at by eye, 2026-11-18): the listing image of a product, by its cell
# in the old site's sprite sheets («sheet:cell» = data/oldprod.js fields 3 and 4), when it is not a photo of the product.
# 'logo' = the company's own logo; 'none' = not a picture of this product. Keyed by the image's cell, not by the product, so a photo a
# factory uploads later (a new cell or file) is never hidden by this table. The rows the data cleanup already dropped (sheet -1)
# are kept as guards in case an old copy of data/oldprod.js comes back.
PPROF_IMG_AUDIT = {
    '0:53': 'none',   # #56 Arab Contractors projects department: a near-blank white tile (a tiny emblem at its edge)
    '0:56': 'none',   # #59 Hi-Tech Lock: the logo of another name (AHRAM Security Group)
    '0:63': 'none',   # #67 El Nasr steel pipes: the logo of the parent holding (Metallurgical Industries Holding)
    '1:0': 'none',    # #105 Weima Steel: the logo of another name (YAZ ZAHRANCO GROUP)
    '1:77': 'none',   # guard: an aerial photo of ships in a sea channel (old cell of #179 French fries)
    '0:76': 'none',   # guard: AYAD GROUP logo (old cell of #81 Alfa Metal)
    '1:3': 'none',    # guard: Elswedy for Food Industries logo (old cell of #108 Arab Iron & Steel)
    '1:54': 'none',   # guard: El Nasr Forging banner (old cell of #160 Atta Sons)
    '0:48': 'none',   # guard: blank white tile (old cell of #49)
    '1:70': 'none',   # guard: blank white tile (old cell of #177)
    '1:2': 'none',    # guard: a lone red dot (old cell of #107)
    '0:42': 'logo', '0:43': 'logo', '0:44': 'logo', '0:45': 'logo', '0:49': 'logo', '0:50': 'logo', '0:51': 'logo', '0:52': 'logo', '0:54': 'logo',
    '0:55': 'logo', '0:57': 'logo', '0:58': 'logo', '0:59': 'logo', '0:61': 'logo', '0:62': 'logo', '0:64': 'logo', '0:68': 'logo', '0:71': 'logo',
    '0:73': 'logo', '0:74': 'logo', '0:75': 'logo', '0:80': 'logo', '0:81': 'logo', '0:82': 'logo', '0:85': 'logo', '0:86': 'logo', '0:87': 'logo',
    '0:89': 'logo', '0:90': 'logo', '0:92': 'logo', '0:93': 'logo', '0:94': 'logo', '0:99': 'logo', '1:1': 'logo', '1:4': 'logo', '1:6': 'logo',
    '1:7': 'logo', '1:8': 'logo', '1:31': 'logo', '1:37': 'logo', '1:40': 'logo', '1:43': 'logo', '1:44': 'logo', '1:45': 'logo', '1:46': 'logo',
    '1:47': 'logo', '1:48': 'logo', '1:49': 'logo', '1:50': 'logo', '1:51': 'logo', '1:52': 'logo', '1:53': 'logo', '1:55': 'logo', '1:56': 'logo',
    '1:57': 'logo', '1:58': 'logo', '1:59': 'logo', '1:60': 'logo', '1:61': 'logo', '1:62': 'logo', '1:63': 'logo', '1:64': 'logo', '1:65': 'logo',
    '1:66': 'logo', '1:67': 'logo', '1:68': 'logo', '1:69': 'logo', '1:71': 'logo',
}

# ------------------------------------------------------------------------------------------------------------------------------------
# ONE design: the /market/ quick view and the full product page use these classes (the market page inlines them through site.py,
# the product pages get them in the SEO bundle /assets/seo-<hash>.css through emit_assets). Logical properties: RTL and LTR alike.
PPROF_CSS = r'''
/* ===== product view «pv» (seo_pprof.part.py): /market/ quick view (price on request) + /industrial_products/<slug>/ ===== */
.pv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) 280px;grid-template-areas:"gal info buy" "more info buy";grid-template-rows:auto 1fr;gap:20px;align-items:start;color:var(--fg);text-align:start}
.pv>*{min-width:0}
.pv--page{grid-template-columns:minmax(0,340px) minmax(0,1fr) 300px;gap:24px}
.pv-gal{grid-area:gal;display:flex;flex-direction:column;gap:8px}
.pv-main{position:relative;display:grid;place-items:center;width:100%;aspect-ratio:1;margin:0;padding:0;border:0;border-radius:14px;background:#F4F6F5;overflow:hidden;color:inherit;font:inherit}
.pv-main>img,.pv-main>.spr{display:block;width:88%;height:88%;object-fit:contain;transform-origin:var(--zx,50%) var(--zy,50%);transition:transform .25s ease}
.pv-main>.spr{height:auto;aspect-ratio:1;min-width:0;min-height:0}
.pv-main>svg{width:40%;height:40%}
/* zoom is armed by the script only for a photo with at least twice the pixels of its box (the 160 px listing crops never are) */
.pv-main.zm{cursor:zoom-in}
.pv-main.zm:hover>img{transform:scale(1.08)}
.pv-main.zm.zoom{cursor:zoom-out}
.pv-main.zm.zoom>img{transform:scale(var(--zs,2))}
.pv-main.zm:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.pv-zh{position:absolute;bottom:8px;inset-inline-end:8px;background:rgba(255,255,255,.92);color:#475569;border-radius:999px;padding:1px 9px;font-size:.7rem;font-weight:700;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.pv-main.zoom .pv-zh{opacity:0}
/* a listing image that is the company's logo: smaller, on white, captioned as the logo */
.pv-main.pv-logo{width:72%;margin-inline:auto;background:#fff;border:1px solid var(--line)}
.pv-main.pv-logo>img,.pv-main.pv-logo>.spr{width:72%;height:72%}
.pv-main.pv-logo>.spr{height:auto}
.pv-thumbs{display:flex;flex-wrap:wrap;gap:6px}
.pv-thumbs button{width:56px;height:56px;padding:3px;border:2px solid var(--line);border-radius:8px;background:#F4F6F5;display:grid;place-items:center;overflow:hidden;cursor:pointer}
.pv-thumbs button.on{border-color:var(--gold)}
.pv-thumbs img,.pv-thumbs .spr{display:block;width:100%;height:100%;object-fit:contain;min-width:0;min-height:0}
.pv-note{display:inline-flex;align-items:center;gap:5px;font-size:.76rem;color:var(--muted);line-height:1.5}
.pv-note::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold);flex:none}
.pv-more{grid-area:more;display:flex;flex-direction:column;gap:6px;align-self:start}
.pv-mlist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.pv-mlist a,.pv-mlist button{display:grid;place-items:center;width:100%;aspect-ratio:1;padding:4px;border:1px solid var(--line);border-radius:10px;background:#F4F6F5;overflow:hidden;cursor:pointer;color:inherit;transition:border-color .2s ease}
.pv-mlist a:hover,.pv-mlist button:hover{border-color:var(--green)}
.pv-mlist img,.pv-mlist .spr{display:block;width:100%;height:100%;object-fit:contain;min-width:0;min-height:0}
.pv-mlist svg{width:58%;height:58%}
.pv-mall{align-self:flex-start;font:inherit;font-size:.8rem;font-weight:700;color:var(--green);background:none;border:0;padding:0;cursor:pointer}
.pv-info{grid-area:info;display:flex;flex-direction:column;gap:8px}
.pv-store{align-self:flex-start;font-size:.8rem;font-weight:700;color:var(--green)}
.pv-store:hover{text-decoration:underline}
.pv-title{margin:0;font-size:1.3rem;font-weight:800;line-height:1.45;overflow-wrap:anywhere}
.pv--page .pv-title{font-size:clamp(1.35rem,2.3vw,1.7rem)}
.pv-en{margin:-4px 0 0;font-size:.85rem;color:var(--muted)}
.pv-intro{margin:0;font-size:.9rem;color:var(--muted);line-height:1.8}
.pv-badges{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pv-badges .chip{white-space:normal}
.chip.pv-inc{background:#FFF4E0;color:#8A5300}
.pv-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}
.pv-price b{font-size:1.25rem;font-weight:800;color:var(--green)}
.pv-price small{font-size:.78rem;color:var(--muted)}
.pv .pv-h{margin:0;font-size:.9rem;font-weight:800;line-height:1.5}
.pv .pv-mt{margin:0;font-size:.86rem;font-weight:800}
.pv-rel .pv-rh{margin:4px 0 0;font-size:1rem;font-weight:800}
.pv-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.pv-steps li{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;border:1px solid var(--line);border-radius:10px;background:var(--surface);text-align:center;min-width:0}
.pv-steps li:first-child{border-color:var(--green);background:var(--green-soft)}
.pv-steps b{font-size:1.05rem;font-weight:800;line-height:1.3}
.pv-steps small{font-size:.72rem;color:var(--muted);line-height:1.45}
.pv-specs{width:100%;border-collapse:collapse;font-size:.85rem}
.pv-specs th{width:36%;padding:6px 0;padding-inline-end:10px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:600;text-align:start;vertical-align:top}
.pv-specs td{padding:6px 0;border-bottom:1px solid var(--line);font-weight:600;overflow-wrap:anywhere}
.pv-full{align-self:flex-start;font-size:.85rem;font-weight:700}
.pv-buy{grid-area:buy;display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.pv-big{font-size:1.45rem;font-weight:800;line-height:1.3}
.pv-sub{font-size:.8rem;color:var(--muted);line-height:1.6}
.pv-ql{font-size:.82rem;font-weight:700}
.pv-qrow{display:flex;gap:6px;align-items:stretch}
.pv-qty{flex:1;display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;min-width:0;background:var(--surface)}
.pv-qty button{flex:none;width:38px;height:38px;border:0;background:var(--sunken);color:var(--fg);cursor:pointer;font-size:1.1rem;line-height:1}
.pv-qty input{flex:1;min-width:0;width:40px;height:38px;border:0;background:transparent;color:var(--fg);font:inherit;font-weight:800;text-align:center}
.pv-unit{flex:none;max-width:52%;min-width:0;padding:0 6px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--fg);font:inherit;font-size:.85rem}
.pv-qnote{font-size:.76rem;color:var(--muted)}
.pv-buy .btn{width:100%;border-radius:99px;white-space:normal;text-align:center;line-height:1.4}
.pv-add{background:var(--gold);color:#1A1204}
.pv-buy .pv-wa{background:var(--surface);border-color:#25D366 !important;color:#0B7A3E;font-size:.86rem;gap:6px;padding-inline:10px}
.pv-tools{display:flex;gap:6px}
.pv-tools button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 8px;border:1px solid var(--line);border-radius:99px;background:var(--surface);color:var(--fg);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
.pv-tools button[aria-pressed="true"]{color:#C0392B;border-color:#F3B4AE}
.pv-msg{margin:0;font-size:.82rem;font-weight:700;color:#05603A;background:#ECFDF3;border-radius:10px;padding:6px 10px;line-height:1.6}
.pv-msg a{font-weight:800;color:inherit;text-decoration:underline}
.pv-seller{display:flex;gap:10px;align-items:center;padding-top:10px;border-top:1px solid var(--line);font-size:.82rem;line-height:1.5}
.pv-seller b{display:block;font-size:.86rem;overflow-wrap:anywhere}
.pv-seller .muted{display:block}
.pv-av{flex:none;width:40px;height:40px;border:1px solid var(--line);border-radius:10px;background:#fff;display:grid;place-items:center;overflow:hidden;font-weight:800;color:var(--green)}
.pv-av img{display:block;width:100%;height:100%;object-fit:contain}
.pv-av-lg{width:64px;height:64px;border-radius:14px;font-size:1.4rem}
@media(max-width:1000px){.pv,.pv--page{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"gal info" "more info" "buy buy"}}
@media(max-width:600px){.pv,.pv--page{grid-template-columns:minmax(0,1fr);grid-template-areas:"gal" "info" "buy" "more";grid-template-rows:auto;gap:16px}
.pv-main{max-width:360px;margin-inline:auto}.pv-main.pv-none{aspect-ratio:16/9;max-width:none}.pv-main.pv-none>svg{width:auto;height:46%}.pv-main.pv-logo{max-width:220px}.pv-thumbs{justify-content:center}.pv-title,.pv--page .pv-title{font-size:1.25rem}}
/* full product page only: the sector photo band holding the breadcrumb (render_product's hero photo, its alt text and its credit), the product card, the sections below */
.sx-hero.ph.sm.pv-band .wrap{min-height:0;padding-block:12px 14px;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 18px}
.sx-hero.ph.pv-band .hbg{animation:none;transform:none}
.pv-band .sx-cred{position:static;max-width:100%;white-space:normal;margin-inline-start:auto}
.pv-crumbbar{background:var(--surface);border-bottom:1px solid var(--line)}
.pv-crumbbar .wrap{padding-block:10px}
.pv-crumbbar .sx-crumbs{color:var(--muted)}
.pv-crumbbar .sx-crumbs a:hover{color:var(--green)}
.pv-page{padding-top:18px}
.pv-card{padding:22px}
.pv-row2{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:20px;align-items:start}
.pv-suprow{display:flex;gap:12px;align-items:center}
.pv-supt{display:flex;flex-direction:column;min-width:0}
.pv-supn{font-weight:800;font-size:1rem;overflow-wrap:anywhere}
.pv-supt .muted{font-size:.82rem}
.pv-sup .btn{align-self:flex-start}
.pv-ph{display:grid;place-items:center;width:100%;aspect-ratio:1;background:#F4F6F5}
.pv-ph svg{width:46%;height:46%}
@media(max-width:900px){.pv-row2{grid-template-columns:1fr}}
@media(max-width:600px){.pv-card{padding:16px}.pv-page{padding-top:12px}.pv-rel .plist{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pv-rel .plist b{padding:6px 7px;font-size:.78rem}}
'''

# behaviour of the full product page (in the SEO bundle /assets/seo-<hash>.js; ES5; runs only where .pv[data-pid] exists)
PPROF_JS = r'''
/* PPROF — product page: photo zoom (only for a photo big enough for it), quantity (Arabic-Indic digits too) + unit for the quote request /
   WhatsApp text / request basket (= the /market/ cart), save, share */
(function(){var d=document,R=d.querySelector(".pv[data-pid]");if(!R)return;
var EN=d.documentElement.lang==="en",T=function(a,e){return EN?e:a;},pid=R.getAttribute("data-pid")||"",nm=R.getAttribute("data-name")||"",url=R.getAttribute("data-url")||location.href,mk=R.getAttribute("data-maker")||"";
var $=function(s){return R.querySelector(s);},cl=function(e,s){return e.target&&e.target.closest?e.target.closest(s):null;};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});};
var get=function(k){try{return JSON.parse(localStorage.getItem(k)||"{}")||{};}catch(x){return{};}};
/* photo: zoom is offered only when the photo has at least twice the pixels of its box (scale capped at that ratio); click, Enter or
   Space zooms in on the point, the pointer pans, a second click or Esc zooms out */
var M=$(".pv-main[data-zoom]"),MI=M?M.querySelector("img"):null,zs=0;
function arm(){if(!MI||zs)return;var w=MI.getBoundingClientRect().width,r=w?MI.naturalWidth/w:0;if(r<2)return;zs=Math.min(2.2,r);
M.classList.add("zm");M.setAttribute("role","button");M.setAttribute("tabindex","0");M.setAttribute("aria-pressed","false");M.setAttribute("aria-label",T("تكبير الصورة","Zoom the photo"));M.style.setProperty("--zs",zs.toFixed(2));
var h=d.createElement("span");h.className="pv-zh";h.setAttribute("aria-hidden","true");h.textContent=T("🔍 اضغط للتكبير","🔍 Click to zoom");M.appendChild(h);}
if(MI){if(MI.complete&&MI.naturalWidth)arm();else MI.addEventListener("load",arm);}
function org(e){var r=M.getBoundingClientRect();if(!r.width||e.clientX==null)return;M.style.setProperty("--zx",Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100))+"%");M.style.setProperty("--zy",Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))+"%");}
function zoom(z,e){if(!zs)return;M.classList.toggle("zoom",z);M.setAttribute("aria-pressed",z?"true":"false");if(z&&e&&e.detail)org(e);else{M.style.removeProperty("--zx");M.style.removeProperty("--zy");}}
if(M){M.addEventListener("click",function(e){zoom(!M.classList.contains("zoom"),e);});M.addEventListener("keydown",function(e){if(zs&&(e.key==="Enter"||e.key===" ")){e.preventDefault();zoom(!M.classList.contains("zoom"));}});M.addEventListener("mousemove",function(e){if(M.classList.contains("zoom"))org(e);});}
d.addEventListener("keydown",function(e){if(e.key==="Escape"&&M&&M.classList.contains("zoom"))zoom(false);});
/* quantity + unit: the field is text (inputmode numeric) so «٢٥» is kept and read as 25; no unit is preselected */
var Q=$("#pvQty"),U=$("#pvUnit"),W=$(".pv-wa"),A=$(".pv-rfq"),G=$(".pv-msg");
function dg(s){return String(s==null?"":s).replace(/[٠-٩]/g,function(c){return String(c.charCodeAt(0)-1632);}).replace(/[۰-۹]/g,function(c){return String(c.charCodeAt(0)-1776);});}
function q(){var v=Math.floor(parseFloat(dg(Q?Q.value:"").replace(/[\s,٬]/g,"").replace("٫","."))||0);return v<1?1:v>9999999?9999999:v;}
function ut(){return U&&U.value&&U.selectedIndex>-1?U.options[U.selectedIndex].text:"";}
function qu(){var u=ut();return q()+(u?" "+u:"");}
function wa(){if(!W)return;var t=T("مرحباً، عايز أستفسر عن منتج على منصة صنع في مصر:","Hello, I would like to ask about a product on Made in Egypt Gate:")+"\n"+T("المنتج: ","Product: ")+nm+(mk?"\n"+T("المورد: ","Supplier: ")+mk:"")+"\n"+T("الكمية: ","Quantity: ")+qu()+"\n"+T("الرابط: ","Link: ")+url;W.setAttribute("href",W.getAttribute("href").split("?")[0]+"?text="+encodeURIComponent(t));}
R.addEventListener("click",function(e){var b=cl(e,"[data-q]");if(!b||!Q)return;Q.value=Math.max(1,q()+(+b.getAttribute("data-q")));wa();});
if(Q){Q.addEventListener("change",function(){Q.value=q();wa();});Q.addEventListener("input",wa);}
if(U)U.addEventListener("change",wa);
if(W)W.addEventListener("click",wa);
wa();
/* quote request: /rfq/new/ addresses the form to the supplier; the product and the quantity (+ unit when picked) fill the request form */
if(A)A.addEventListener("click",function(){try{sessionStorage.setItem("mig-rfq-item",nm);sessionStorage.setItem("mig-rfq-qty",qu());}catch(x){}});
function say(h){if(!G)return;G.innerHTML=h;G.hidden=false;}
/* request basket: the same list as the /market/ cart (localStorage mig-cart {id: qty} + mig-cart-u {id: unit}); sent from there */
var B=$(".pv-add");if(B)B.addEventListener("click",function(){var C=get("mig-cart"),CU=get("mig-cart-u"),u=U?U.value:"";if(C[pid]&&(CU[pid]||"")!==u)delete C[pid];C[pid]=(+C[pid]||0)+q();if(u)CU[pid]=u;else delete CU[pid];
try{localStorage.setItem("mig-cart",JSON.stringify(C));localStorage.setItem("mig-cart-u",JSON.stringify(CU));}catch(x){say(esc(T("المتصفح مش سامح بالحفظ؛ استخدم «اطلب عرض سعر».","Your browser does not allow saving; use «Request a quote».")));return;}
say("✓ "+esc(T("أُضيف لسلة الطلب","Added to the request basket"))+" ("+esc(C[pid]+(u?" "+ut():""))+") · <a href=\""+esc(B.getAttribute("data-basket")||"/market/#cart")+"\">"+esc(T("عرض السلة","View the basket"))+" ("+Object.keys(C).length+")</a>");});
/* save: the favourites of /market/ (localStorage mig-fav) */
var F=$(".pv-fav");function fs(on){F.setAttribute("aria-pressed",on?"true":"false");F.innerHTML=(on?"♥ ":"♡ ")+"<span>"+esc(on?T("محفوظ","Saved"):T("حفظ","Save"))+"</span>";}
if(F){fs(!!get("mig-fav")[pid]);F.addEventListener("click",function(){var V=get("mig-fav");if(V[pid])delete V[pid];else V[pid]=true;try{localStorage.setItem("mig-fav",JSON.stringify(V));}catch(x){}fs(!!V[pid]);});}
/* share: the system share sheet, else the link is copied */
var S=$(".pv-share");if(S)S.addEventListener("click",function(){var ok=function(){say(esc(T("تم نسخ رابط المنتج.","Product link copied.")));},ask=function(){try{window.prompt(T("انسخ الرابط:","Copy the link:"),url);}catch(x){}};
if(navigator.share){navigator.share({title:nm,url:url}).catch(function(){});return;}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(ok,ask);else ask();});
})();
'''


def pprof_module(H):
    """H = the namespace of seo_build.part.py's _seo_build_module (its locals() at the end): the helpers are taken by name"""
    import re
    import json
    from urllib.parse import quote
    esc, X, T, S, AR_RX = H['esc'], H['X'], H['T'], H['S'], H['AR_RX']
    gov_name, sec_name, type_label, is_team = H['gov_name'], H['sec_name'], H['type_label'], H['is_team']
    rfq_link, rfq_box, static_url, ar_count, fmt_n = H['rfq_link'], H['rfq_box'], H['static_url'], H['ar_count'], H['fmt_n']
    prod_img, hero_bg, vis_credit, photo_alt = H.get('prod_img'), H.get('hero_bg'), H.get('vis_credit'), H.get('photo_alt')
    SITE, ROOT = H['SITE'], H['B']
    VER_AR, VER_EN = H['VER_AR'], H['VER_EN']
    _GEN = {}   # per build (survives the S.clear() of seo_build's _init between seo_prepare and build_static_seo)

    def img_kinds():
        """product index → 'photo' | 'logo' | 'none': what the listing image is. Computed from the sprite cell itself (the /market/ hook
        runs before build_static_seo crops the images): the photo audit (PPROF_IMG_AUDIT), then the old site's shared placeholder, by the
        same two tests as seo_build's crop_cell / img_ph (one picture used by 3+ products, or the flat grey «Made In Egypt» box)"""
        if 'kinds' in _GEN:
            return _GEN['kinds']
        out, crops = {}, {}
        for p in S.get('products') or []:
            if not p.get('img'):
                out[p['i']] = 'none'
                continue
            a = PPROF_IMG_AUDIT.get('%d:%d' % (int(p['img'][0]), int(p['img'][1])))
            out[p['i']] = 'none' if a == 'none' else 'logo' if a == 'logo' else 'photo'
            crops[p['i']] = p['img']
        try:
            import io as _io, hashlib as _hl
            from PIL import Image, ImageStat
            sheets, key, cnt = {}, {}, {}
            for i, (sh_, c) in crops.items():
                if sh_ not in sheets:
                    sheets[sh_] = Image.open(ROOT + 'img/old/pr%d.jpg' % sh_).convert('RGB')
                im_ = sheets[sh_]
                w, h = im_.size
                cw, chh = w // 10, h // 10
                c = int(c)
                part = im_.crop(((c % 10) * cw, (c // 10) * chh, (c % 10 + 1) * cw, (c // 10 + 1) * chh))
                buf = _io.BytesIO()
                part.save(buf, 'JPEG', quality=84, optimize=True)
                k = _hl.sha1(buf.getvalue()).hexdigest()
                key[i] = k
                cnt[k] = cnt.get(k, 0) + 1
                st = ImageStat.Stat(part)
                mean, sd = sum(st.mean) / 3.0, sum(st.stddev) / 3.0
                raw = part.resize((40, 40)).tobytes()
                grey = sum(1 for j in range(0, len(raw), 3) if abs(raw[j] - raw[j + 1]) < 12 and abs(raw[j + 1] - raw[j + 2]) < 12 and 170 < raw[j] < 235) / 1600.0
                if 215 <= mean <= 235 and sd <= 32 and grey >= 0.5:
                    out[i] = 'none'
            for i, k in key.items():
                if cnt[k] >= 3:
                    out[i] = 'none'
        except Exception:
            pass
        _GEN['kinds'] = out
        return out

    def kind(x):
        """the image kind of a product on a page (build_static_seo has cropped the images by then): seo_build's own placeholder test
        (prod_img) and a missing crop (no Pillow) both mean «no photo»"""
        k = img_kinds().get(x['i'], 'none')
        if k != 'none' and (not x.get('img_url') or (prod_img and not prod_img(x))):
            k = 'none'
        return k

    def has_ar(s):
        return bool(AR_RX.search(s or ''))

    def icon(cat):
        c = cat if cat in PPROF_ICON else 'other'
        col = PPROF_CCOL[c]
        return ('<svg viewBox="0 0 24 24" fill="%s22" stroke="%s" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
                '<path d="%s"/></svg>' % (col, col, PPROF_ICON[c]))

    def market_listed(p):
        # market.part.html skips names that look like a file name or a run of one letter: those products are not in its cart
        return not (re.search(r'\.(jpe?g|png|gif|webp)$', p['name'], re.I) or re.search(r'(.)\1{4,}', p['name']))

    def unit_options(L):
        return ('<option value="" selected>%s</option>' % esc(X(L, PPROF_UNIT_NONE[0], PPROF_UNIT_NONE[1]))) + ''.join(
            '<option value="%s">%s</option>' % (esc(a), esc(a if L == 'ar' else e)) for a, e in PPROF_UNITS)

    def strip_of(p, L):
        """the «more» strip under the photo, the same in the quick view and on the page: up to 4 other products of the same supplier
        (kind 'f' factory / 'c' company), else of the same sector ('s'); listed in the market (the quick view opens them there), the
        product's own photo first; an English view lists only products with an English name"""
        mk = p.get('maker')

        def ok(x):
            return x is not p and market_listed(x) and (L == 'ar' or not has_ar(T('en', x['name'], x['name_en'])))
        src = [x for x in (mk.get('prods') if mk else []) if ok(x)]
        if src:
            k = 'f' if mk['type'] == 'مصنع' else 'c'
        else:
            src, k = [x for x in S.get('products') or [] if ok(x) and x.get('sslug') == p.get('sslug')], 's'
        order = {'photo': 0, 'logo': 1}
        kk = img_kinds()
        return k, sorted(src, key=lambda x: order.get(kk.get(x['i']), 2))[:4]

    def strip_title(k, L):
        return {'f': X(L, 'منتجات أخرى من نفس المصنع', 'More from this factory'), 'c': X(L, 'منتجات أخرى من نفس الشركة', 'More from this company'),
                's': X(L, 'منتجات مشابهة', 'Similar products')}[k]

    def product_body(p, L, ctx):
        """the <main> body of /industrial_products/<slug>/ in the product-view design. ctx = render_product's locals(): the breadcrumb,
        name, intro, description, facts, related products and sector photo it computed are reused, so the page keeps all its existing
        text, links and images."""
        P = '/en' if L == 'en' else ''
        url = ctx.get('url') or (SITE + P + p['path'])
        name = ctx.get('name') or T(L, p['name'], p['name_en'])
        ch = ctx.get('ch') or ''
        intro = ctx.get('intro') or ''
        d = ctx.get('d')
        facts = list(ctx.get('facts') or [])
        rel = list(ctx.get('rel') or [])
        mk = p.get('maker')
        mie = bool(p.get('mie'))
        # SEO admin overrides of the H1 / intro (as hero() applies them)
        ov = S['overrides'].get(S.get('cur_path'), {}) if S.get('overrides') else {}
        h1 = ov.get('h1') or name
        intro = ov.get('intro') or intro
        S['cur_h1'] = h1
        cat = p['cat'] if p['cat'] in PPROF_CATS else 'other'
        pid = 1000 + p['i']
        fac = bool(mk and mk['type'] == 'مصنع')
        mp = (('/en' if L == 'en' and mk.get('en_ok') else '') + mk['path']) if mk else ''
        mkn = T(L, mk['name'], mk.get('name_en')) if mk else ''
        mk_ok = bool(mk) and (L == 'ar' or not has_ar(mkn))      # an English page names an untranslated supplier only where it did before
        team = bool(mk and is_team(mk))
        flags = p.get('flags') or 0

        def plink(x):
            return ('/en' if L == 'en' and x.get('en_ok') else '') + x['path']

        def pname(x):
            return T(L, x['name'], x['name_en'])

        def pimg(x, lazy=True, prio=False, alt=None):
            if kind(x) == 'none':
                return ''
            im_ = x['img_url']
            return '<img src="%s" alt="%s" width="%d" height="%d"%s%s>' % (esc(im_[0]), esc(pname(x) if alt is None else alt), im_[1], im_[2],
                                                                       ' loading="lazy" decoding="async"' if lazy else '', ' fetchpriority="high"' if prio else '')

        # --- band: render_product's sector photo (the same file, alt text and Commons credit as its hero) behind the breadcrumb
        band = ''
        hp = ctx.get('hp')
        if hp and hero_bg:
            alt = photo_alt(hp, L, sec_name(p.get('sslug'), L, 't') or name) if photo_alt else ''
            bg = hero_bg(hp, alt)[0]
            if bg:
                band = '<div class="sx-hero ph sm pv-band">%s<div class="wrap">%s%s</div></div>' % (bg, ch, vis_credit(hp, L) if vis_credit else '')
        if not band:
            band = '<div class="pv-crumbbar"><div class="wrap">%s</div></div>' % ch

        # --- gallery: the product's own photo (eager, with its size), or its company logo shown as the logo, or the category icon
        k0 = kind(p)
        if k0 == 'photo':
            main_html = '<div class="pv-main" data-zoom="1">%s</div>' % pimg(p, lazy=False, prio=True)
            note = X(L, 'صورة المنتج من إعلانه على المنصة.', 'The product photo from its listing on the platform.')
        elif k0 == 'logo':
            lalt = (X(L, 'شعار ', 'Logo of ') + mkn) if mk_ok else X(L, 'شعار المورد', "The supplier's logo")
            main_html = '<div class="pv-main pv-logo">%s</div>' % pimg(p, lazy=False, alt=lalt)
            note = X(L, 'شعار الشركة من إعلانها على المنصة؛ لا توجد صورة للمنتج نفسه.', "The company's logo from its listing on the platform; there is no photo of the product itself.")
        else:
            main_html = '<div class="pv-main pv-none" role="img" aria-label="%s">%s</div>' % (esc(X(L, 'لا توجد صورة للمنتج', 'No product photo')), icon(p['cat']))
            note = X(L, 'لا توجد صورة لهذا المنتج في بيانات المنصة.', 'There is no photo of this product in the platform data.')
        gal = '<div class="pv-gal">%s<span class="pv-note">%s</span></div>' % (main_html, note)

        # --- related products: the supplier's other products, then similar ones (same sector) — the previous «منتجات ذات صلة» list
        # (render_product's rel) is a subset of the two lists, so every existing link stays; an English page lists a product whose
        # name has no English only when the previous list had it
        others = [x for x in (mk.get('prods') if mk else []) if x is not p]
        similar = [x for x in S['products'] if x is not p and x not in others and x.get('sslug') == p.get('sslug')]
        rel_ids = set(id(x) for x in rel)
        if L == 'en':
            others = [x for x in others if id(x) in rel_ids or not has_ar(pname(x))]
            similar = [x for x in similar if id(x) in rel_ids or not has_ar(pname(x))]
        others_g = others[:12]
        sim_g = similar[:8]
        extra = [x for x in rel if x not in others_g and x not in sim_g]   # never drop a link the previous body had
        sim_g += extra

        # --- the «more» strip under the photo (real images of other products; never presented as photos of this one)
        sk, strip = strip_of(p, L)
        more = ''
        if strip:
            more = '<div class="pv-more"><p class="pv-mt">%s</p><ul class="pv-mlist">%s</ul></div>' % (esc(strip_title(sk, L)), ''.join(
                '<li><a href="%s" title="%s">%s</a></li>' % (esc(plink(x)), esc(pname(x)), pimg(x) or icon(x.get('cat'))) for x in strip))

        # --- info column
        store = ('<a class="pv-store" href="%s">%s</a>' % (esc(mp), esc(X(L, 'زيارة ملف %s ←', 'Visit the %s profile →') % mkn if mk_ok else X(L, 'زيارة ملف المورد ←', 'Visit the supplier profile →')))) if mk else ''
        en_small = ''
        if L == 'ar':
            en_n = p['name_en'] or T('en', p['name'], p['name_en'])
            if en_n and not has_ar(en_n) and en_n.strip().lower() != p['name'].strip().lower():
                en_small = '<p class="pv-en"><bdi lang="en" dir="ltr">%s</bdi></p>' % esc(en_n)
        badges = []
        if team:
            badges.append('<span class="chip chip-green">%s</span>' % esc(X(L, VER_AR, VER_EN)))
        if mie:
            badges.append('<span class="chip chip-gold">%s</span>' % X(L, '🇪🇬 صنع في مصر', '🇪🇬 Made in Egypt'))
        badges.append('<span class="chip chip-gray">%s</span>' % X(L, 'منتج عضو في المنصة', 'Member product on the platform'))
        if flags:
            badges.append('<span class="chip pv-inc">%s</span>' % X(L, 'بيانات غير مكتملة', 'Incomplete data'))
        # spec rows, one order in both views: category, maker, seller type, governorate, sector, origin, incomplete data
        rows = [(X(L, 'القسم', 'Category'), '<a href="%s">%s</a>' % (esc(static_url('market', L, '#cat-' + cat)), esc(X(L, PPROF_CATS[cat][0], PPROF_CATS[cat][1]))))]
        for k, v in facts:
            rows.append((k, v))
            if mk and len(rows) == 2:
                rows.append((X(L, 'نوع البائع', 'Seller type'), esc(type_label(mk, L))))
        specs = '<table class="pv-specs"><tbody>%s</tbody></table>' % ''.join('<tr><th scope="row">%s</th><td>%s</td></tr>' % (k, v) for k, v in rows)
        info = ('<div class="pv-info">%s<h1 class="pv-title" id="pvT" data-seo="h1">%s</h1>%s%s<div class="pv-badges">%s</div>'
                '<div class="pv-price"><b>%s</b><small>%s</small></div><h2 class="pv-h">%s</h2><ol class="pv-steps"><li><b class="num">1</b><small>%s</small></li>'
                '<li><b class="num">2</b><small>%s</small></li><li><b class="num">3</b><small>%s</small></li></ol><h2 class="pv-h">%s</h2>%s</div>'
                % (store, esc(h1), en_small, ('<p class="pv-intro" data-seo="intro">%s</p>' % esc(intro)) if intro else '', ''.join(badges),
                   X(L, 'السعر عند الطلب', 'Price on request'), X(L, 'حسب الكمية والمواصفات', 'by quantity and specifications'),
                   X(L, 'كيف تحصل على عرض السعر', 'How to get a quote'), X(L, 'حدّد الكمية والوحدة', 'Choose the quantity and unit'),
                   X(L, 'ابعت طلب عرض السعر', 'Send the quote request'), X(L, 'ردود المصانع توصلك على بريدك', "Factories' replies reach your e-mail"),
                   X(L, 'بيانات المنتج', 'Product facts'), specs))

        # --- buy box: price on request, quantity + unit (visitor's choice), basket, quote request, platform WhatsApp, save/share, seller
        rfq = rfq_link(mk, L) if mk else rfq_link(None, L)
        wa_txt = (X(L, 'مرحباً، عايز أستفسر عن منتج على منصة صنع في مصر:', 'Hello, I would like to ask about a product on Made in Egypt Gate:') + '\n'
                  + X(L, 'المنتج: ', 'Product: ') + h1 + (('\n' + X(L, 'المورد: ', 'Supplier: ') + mkn) if mk_ok else '') + '\n' + X(L, 'الرابط: ', 'Link: ') + url)
        if mk and mk.get('logo_img'):
            av = '<img src="%s" alt="%s" width="%d" height="%d" loading="lazy">' % (esc(mk['logo_img'][0]), esc(X(L, 'شعار ', 'Logo of ') + mkn), mk['logo_img'][1], mk['logo_img'][2])
        elif mk:   # the initial of the supplier's name in the page's language
            av = esc(re.sub(r'^(مصنع|شركة|الشركة|مورد|منشأة|موزع|مؤسسة)\s+', '', mk['name'] if L == 'ar' else (mkn if mk_ok else '')).strip()[:1].upper() or X(L, '؟', '?'))
        else:
            av = X(L, '؟', '?')
        g = gov_name(mk['gov'], L) if mk and mk.get('gov') else ''
        if mk:
            seller = '<div class="pv-seller"><span class="pv-av" aria-hidden="%s">%s</span><div><b>%s</b><span class="muted">%s</span></div></div>' % (
                'false' if mk.get('logo_img') else 'true', av, esc(mkn if mk_ok else X(L, 'المورد', 'The supplier')), esc(' · '.join(x for x in (type_label(mk, L), g) if x)))
            seller += '<a class="btn btn-line btn-sm pv-prof" href="%s">%s</a>' % (esc(mp), X(L, 'ملف المصنع' if fac else 'ملف الشركة', 'Factory profile' if fac else 'Company profile'))
        else:
            seller = '<div class="pv-seller"><span class="pv-av" aria-hidden="true">%s</span><div><b>%s</b><span class="muted">%s</span></div></div>' % (
                av, X(L, 'المنشأة المنتجة غير محددة', 'Producer not named'), X(L, 'طلبك بيتبعت للمصانع المسجّلة المطابقة', 'Your request goes to the matching registered factories'))
        basket = ('<button class="btn pv-add" type="button" data-basket="%s">%s</button>' % (esc(static_url('market', L, '#cart')), X(L, 'أضف لسلة الطلب', 'Add to the request basket'))) if market_listed(p) else ''
        buy = ('<div class="pv-buy"><span class="pv-big">%s</span><span class="pv-sub">%s</span><label class="pv-ql" for="pvQty">%s</label>'
               '<div class="pv-qrow"><div class="pv-qty"><button type="button" data-q="-1" aria-label="%s">−</button><input id="pvQty" type="text" inputmode="numeric" pattern="[0-9٠-٩]*" autocomplete="off" value="1" aria-label="%s">'
               '<button type="button" data-q="1" aria-label="%s">+</button></div><select id="pvUnit" class="pv-unit" aria-label="%s">%s</select></div><span class="pv-qnote">%s</span>'
               '%s<a class="btn btn-green pv-rfq" href="%s" rel="nofollow">%s</a><a class="btn pv-wa" href="%s?text=%s" target="_blank" rel="nofollow noopener">%s<span>%s</span></a>'
               '<div class="pv-tools"><button type="button" class="pv-fav" aria-pressed="false">♡ <span>%s</span></button><button type="button" class="pv-share">⤴ <span>%s</span></button></div>'
               '<p class="pv-msg" role="status" aria-live="polite" hidden></p>%s</div>'
               % (X(L, 'السعر عند الطلب', 'Price on request'), X(L, 'لا توجد أسعار منشورة لهذا المنتج؛ السعر يحدده المصنع حسب الكمية والمواصفات.', 'No prices are published for this product; the factory sets the price by quantity and specifications.'),
                  X(L, 'الكمية المطلوبة', 'Quantity needed'), X(L, 'إنقاص الكمية', 'Decrease the quantity'), X(L, 'الكمية', 'Quantity'), X(L, 'زيادة الكمية', 'Increase the quantity'),
                  X(L, 'الوحدة', 'Unit'), unit_options(L), X(L, 'الكمية والوحدة بتتضاف لطلب عرض السعر.', 'The quantity and unit are added to your quote request.'),
                  basket, esc(rfq), X(L, 'اطلب عرض سعر', 'Request a quote'), PPROF_WA, esc(quote(wa_txt, safe='')), PPROF_WA_SVG, X(L, 'استفسر على واتساب المنصة', "Ask on the platform's WhatsApp"),
                  X(L, 'حفظ', 'Save'), X(L, 'مشاركة', 'Share'), seller))

        pv = ('<div class="pv pv--page" data-pid="%d" data-name="%s" data-url="%s" data-maker="%s">%s%s%s%s</div>'
              % (pid, esc(h1), esc(url), esc(mkn if mk_ok else ''), gal, info, buy, more))

        # --- below the view: about the product, about the supplier, the two product grids, the quote-request box
        about = '<section class="card2"><h2>%s</h2><p>%s</p></section>' % (X(L, 'عن المنتج', 'About the product'), esc(d or X(L, 'لم يُضف وصف تفصيلي للمنتج بعد.', 'No detailed description yet.')))
        if mk:
            n_p = len(mk.get('prods') or [])
            sec_t = sec_name(mk.get('sslug'), L) if mk.get('sslug') else ''
            meta_t = ' · '.join(x for x in (type_label(mk, L), sec_t if (L == 'ar' or not has_ar(sec_t)) else '', g) if x)
            sb = []
            if team:
                sb.append('<span class="chip chip-green">%s</span>' % esc(X(L, VER_AR, VER_EN)))
            else:
                sb.append('<span class="chip chip-gray">%s</span>' % X(L, 'مدرج في دليل المنصة', 'Listed in the platform directory'))
            sb.append('<span class="chip chip-gray">%s</span>' % X(L, ar_count(n_p, 'منتج واحد في الدليل', 'منتجان في الدليل', 'منتجات في الدليل', 'منتجاً في الدليل'),
                                                                     '%s %s in the directory' % (fmt_n(n_p), 'product' if n_p == 1 else 'products')))
            sup = ('<section class="card2 pv-sup"><h2>%s</h2><div class="pv-suprow"><span class="pv-av pv-av-lg" aria-hidden="%s">%s</span><div class="pv-supt"><a class="pv-supn" href="%s">%s</a>'
                   '<span class="muted">%s</span></div></div><div class="pv-badges">%s</div><a class="btn btn-line btn-sm" href="%s">%s</a></section>'
                   % (X(L, 'عن المورد', 'About the supplier'), 'false' if mk.get('logo_img') else 'true', av, esc(mp), esc(mkn if mk_ok else X(L, 'ملف المورد', 'Supplier profile')),
                      esc(meta_t), ''.join(sb), esc(mp), X(L, 'ملف المصنع ←' if fac else 'ملف الشركة ←', 'Factory profile →' if fac else 'Company profile →')))
        else:
            sup = ('<section class="card2 pv-sup"><h2>%s</h2><p class="muted">%s</p><a class="btn btn-line btn-sm" href="%s">%s</a></section>'
                   % (X(L, 'عن المورد', 'About the supplier'), X(L, 'المنشأة المنتجة غير محددة في بيانات هذا المنتج؛ طلب عرض السعر بيتبعت للمصانع المسجّلة المطابقة.',
                                                                  'The producer is not named in the data of this product; a quote request goes to the matching registered factories.'),
                      esc(('/en' if L == 'en' and '/en/factories/' in S.get('en_paths', set()) else '') + '/factories/'), X(L, 'دليل المصانع ←', 'Factory directory →')))

        def grid(items):
            return '<ul class="plist">%s</ul>' % ''.join('<li><a href="%s">%s<b>%s</b></a></li>' % (
                esc(plink(x)), pimg(x) or ('<span class="pv-ph">%s</span>' % icon(x.get('cat'))), esc(pname(x))) for x in items)
        below = '<div class="pv-row2">%s%s</div>' % (about, sup)
        relp = ''
        if others_g:
            all_l = ''
            if len(others) > len(others_g):
                all_l = '<p><a href="%s">%s</a></p>' % (esc(mp), esc(X(L, 'كل منتجات المصنع (%d) ←', 'All %d products of this supplier →') % (len(others) + 1)))
            relp += '<h3 class="pv-rh">%s</h3>%s%s' % (X(L, 'منتجات أخرى من نفس المصنع' if fac else 'منتجات أخرى من نفس الشركة', 'More from this factory' if fac else 'More from this company'), grid(others_g), all_l)
        if sim_g:
            relp += '<h3 class="pv-rh">%s</h3>%s' % (X(L, 'منتجات مشابهة', 'Similar products'), grid(sim_g))
        if relp:
            below += '<section class="card2 pv-rel"><h2>%s</h2>%s</section>' % (X(L, 'منتجات ذات صلة', 'Related products'), relp)
        below += rfq_box(L, rfq)
        return ('%s<div class="wrap sx-main pv-page"><section class="card2 pv-card" aria-labelledby="pvT">%s</section>%s</div>'
                % (band, pv, below))

    def market(t):
        """site.py hook (after seo_prepare): the /market/ page tuple (title, active, css, body, js) gets the product-view CSS and the
        build-time data of its quick view, per product index: [English name, «صنع في مصر» (the product page's test), «✓ موثّق» (platform
        team), image kind (0 its photo, 1 no photo: placeholder or not a picture of it, 2 the company's logo), the «more» strip of the
        product page in Arabic ([kind, index …], kind 'f' / 'c' / 's') and in English (0 when the same), the sector row of the product
        page ([Arabic, English] or 0)]; 'c' = the category labels of the page's «القسم» row, so both views show the same rows"""
        rows = {}
        kk = img_kinds()
        for p in S.get('products') or []:
            en = p['name_en'] or T('en', p['name'], p['name_en'])
            en = en if en and not has_ar(en) and en.strip().lower() != p['name'].strip().lower() else ''
            mk = p.get('maker')
            st = []
            for L in ('ar', 'en'):
                k, l = strip_of(p, L)
                st.append([k] + [x['i'] for x in l] if l else 0)
            sh = (S.get('hub_sector_by_slug') or {}).get(p.get('sslug') or '')
            sec = [sec_name(sh['sec']['slug'], 'ar'), sec_name(sh['sec']['slug'], 'en')] if sh else 0
            rows[str(p['i'])] = [en, 1 if p.get('mie') else 0, 1 if (mk and is_team(mk)) else 0, {'photo': 0, 'none': 1, 'logo': 2}[kk.get(p['i'], 'none')],
                                 st[0], 0 if st[1] == st[0] else st[1], sec]
        data = {'p': rows, 'u': [a for a, e in PPROF_UNITS], 'ue': [e for a, e in PPROF_UNITS], 'un': list(PPROF_UNIT_NONE), 'c': {k: list(v) for k, v in PPROF_CATS.items()}}
        js = ('<script>/* PPROF: build-time data of the price-on-request quick view (seo_pprof.part.py) */window.MIGPV=%s;</script>'
              % json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'))
        return (t[0], t[1], t[2] + '\n' + PPROF_CSS, t[3], js + t[4])

    return {'css': PPROF_CSS, 'js': PPROF_JS, 'product_body': product_body, 'market': market}
