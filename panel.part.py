# -*- coding: utf-8 -*-
# Admin Control Center «لوحة التحكم» — /admin/ (key «admin»; /admin.html → /admin/ 301 from the build). Deploy 2, docs/janna/ACC-CONTRACT.md
# §1.1–§1.5 + the owner's decisions of 2026-11-18 («مفاتيح الخدمات», the WhatsApp switch, team roles seo / data).
# A STANDALONE page (never page()) with the look of the owner's live panel (docs/janna/legacy-live/panel.html: its CSS verbatim, below),
# its navigation, labels and order — every section backed by the Worker (/api/admin/cc/*, /api/seo/*, existing /api/admin/*) — plus every
# new section in the same navigation. The live panel itself stays where it is: /panel.html and /login.html are the owner's old system
# (deploy/legacy-live.txt, legacy routes — never built here). The logic is data/acc.js, the additions to the live CSS are data/acc.css.
# Page scripts, in order: data/mig-api.js (session `mig-tok`, e-mail-code dialog), data/mig-overlay.js with window.MIGOVL_ADMIN = 1
# (schema + row mappers, no setters; only when the file exists), data/acc.js, data/acc-dev.js («🛠️ المطوّر», owner only: registers its
# section through MIGACC.use; only when the file exists). The site's data files (oldfac.js, facx.js …) are loaded
# lazily by the sections that need them, with the build's ?v= hashes. The page lives in a sub-directory, so it carries the SEO build's
# <base href="/"> + fragment fix (BASE_FIX_HEAD / BASE_FIX_TAIL, as every clean-URL page): relative data/, img/ and api/ URLs resolve
# from the site root and «#section» links stay on /admin/.
# exec'd by site.py with the other parts (it registers PAGES['admin'] and PAGE_WRITERS['admin']); the page is written from site.py's
# page loop, after seo_prepare(), so _bust, SEO_STATE, STRAT and PARTNER exist by then.
import os as _acc_os, re as _acc_re, json as _acc_json, hashlib as _acc_hl


def _acc_ver(rel):
    """the 8-character content hash site.py's _ver() puts on data files (?v=…)"""
    f = B + rel
    return _acc_hl.md5(open(f, 'rb').read()).hexdigest()[:8] if _acc_os.path.exists(f) else '0'


def _acc_url(k):
    """URL of a site page in this build: clean URLs when the SEO generator's config is loaded (site.py), else the .html form"""
    try:
        cfg = SEO_STATE['cfg']
    except Exception:
        return '%s.html' % k
    if k in ('home', 'index'):
        return '/'
    sp = cfg.get('static_paths') or {}
    if k in ('login', 'signin'):
        return sp.get('signin') or '/login/'        # the sign-in page (signin.part.py); /login.html is the owner's old system
    if k in ('admin', 'panel'):
        return sp.get('admin') or '/admin/'         # this Control Center
    if k in (cfg.get('flat_pages') or []) or k in (cfg.get('legacy_live_pages') or []):
        return '/%s.html' % k
    if k in (cfg.get('shim_keys') or {}):
        return '/%s.html' % k                    # hash pages (company.html#…) stay shims that resolve to the static page
    return (cfg.get('static_paths') or {}).get(k) or '/%s/' % k


def _acc_json_js(o):
    """JSON safe inside a <script> element (no </script>, no U+2028/2029)"""
    return _acc_json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def _acc_cats():
    """base market categories = CATS of market.part.html ([key, Arabic label, icon]); store «تصنيفات السوق» lists and renames them"""
    try:
        src = open(B + 'market.part.html', encoding='utf-8').read()
        m = _acc_re.search(r'var CATS = (\[\[.*?\]\]);', src)
        return _acc_json.loads(m.group(1)) if m else []
    except Exception as e:
        print('panel: market categories not read:', e)
        return []


def _acc_banners():
    """built-in banners of this build (site.py STRAT / PARTNER strips): listed read-only in «البانرات الإعلانية» with «إخفاء البانر الأصلي»"""
    out = []
    for place, var in (('strategic', 'STRAT'), ('partner', 'PARTNER')):
        try:
            html_ = globals().get(var) or ''
        except Exception:
            html_ = ''
        for m in _acc_re.finditer(r'<a class="sbn-s[^"]*" href="([^"]*)"[^>]*>.*?<img class="fg" src="([^"]*)" alt="([^"]*)"', html_ or '', _acc_re.S):
            out.append({'place': place, 'link': m.group(1), 'img': m.group(2), 'alt': m.group(3)})
    return out


_ACC_DATA_FILES = ['regions', 'oldfac', 'oldfacd', 'factories', 'facx', 'oldprod', 'oldtend', 'oldrfq', 'offers', 'zones', 'real', 'videos', 'projects', 'products']


def _acc_cfg():
    """window.MIGACC_CFG — computed when the page is written (the clean URLs need seo_prepare(), the banners site.py's STRAT / PARTNER)"""
    return {
        'v': {k: _acc_ver('data/%s.js' % k) for k in _ACC_DATA_FILES},
        'urls': {k: _acc_url(k) for k in ('home', 'admin', 'dashboard', 'inbox', 'seo-admin', 'register', 'track', 'rfqs', 'tenders', 'market', 'factories', 'legal', 'pay', 'login', 'company', 'article', 'event', 'offer', 'project', 'winner', 'opportunity', 'seo-team', 'data-desk')},
        'cats': _acc_cats(),
        'banners': _acc_banners(),
        'site': 'https://madeinegyptgate.com/',
        'legacy_panel': '/panel.html',              # the owner's old admin (legacy route, kept as it is) — linked from «استيراد من النظام القديم»
    }

# The live panel's CSS, verbatim (docs/janna/legacy-live/panel.html). Additions live in data/acc.css.
_ACC_LIVE_CSS = '''
:root{--g:#8E0B20;--g2:#A50E26;--r:#B42318;--line:#E5E9E7;--bg:#F4F6F5}
*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,Arial,sans-serif;background:var(--bg);color:#0F172A;font-size:14px}
.lay{display:flex;min-height:100vh}
aside{width:250px;flex:none;background:var(--g);color:#fff;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow:auto}
.lg{padding:20px 16px;border-bottom:1px solid #ffffff22}.lg b{display:block;font-size:16px}.lg small{opacity:.7}
aside nav{padding:12px;flex:1}aside h4{margin:14px 10px 4px;font-size:11px;opacity:.55;font-weight:600}
aside button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;border:0;background:none;color:#fff;border-radius:12px;padding:11px 14px;cursor:pointer;font:inherit;font-size:15px;text-align:right;margin-bottom:2px}
aside button:hover{background:#ffffff14}aside button.on{background:var(--r)}
.bd{background:var(--r);color:#fff;border-radius:99px;font-size:11px;padding:1px 7px}aside button.on .bd{background:#fff;color:var(--r)}
.ft{padding:14px 16px;border-top:1px solid #ffffff22;font-size:12px}.ft a{color:#fff;opacity:.85;cursor:pointer}
main{flex:1;min-width:0;padding:24px 28px}
.ph{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:18px}.ph h1{margin:0;font-size:26px}.ph small{color:var(--r)}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px}
.kc{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;position:relative;overflow:hidden;cursor:default}
.kc:before{content:"";position:absolute;top:-24px;left:-24px;width:70px;height:70px;border-radius:50%;background:#E4ECE8}
.kc span{font-size:13px;color:#334155;position:relative}.kc b{display:block;font-size:30px;margin:6px 0 2px;position:relative}.kc small{color:var(--r);font-size:12px;position:relative}
.cd{background:#fff;border:1px solid var(--line);border-radius:16px;margin-bottom:16px;overflow:auto}.cd>h3{margin:0;padding:16px 18px 6px;font-size:17px}.cd .in{padding:8px 18px 16px}
.gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line)}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.bar input,.bar select{padding:10px 12px;border:1px solid #CBD5E1;border-radius:10px;font:inherit;min-width:200px;background:#fff}
.btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font:inherit;background:var(--g);color:#fff}.btn.r{background:var(--r)}.btn.l{background:#fff;color:#0F172A;border:1px solid var(--line)}.btn.d{background:#B42318}.btn.s{padding:5px 11px;font-size:12px}select.pl{padding:6px 8px;border:1px solid #CBD5E1;border-radius:8px;font:inherit;background:#fff}
table{width:100%;min-width:760px;border-collapse:collapse}td:nth-child(2){min-width:190px}th,td{max-width:300px;overflow-wrap:anywhere;padding:10px 12px;text-align:right;border-bottom:1px solid var(--line);vertical-align:top}th{background:#F8FAFC;font-size:12px;color:#475569;position:sticky;top:0}td small{color:#64748B}
.tag{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;background:#FBE9EC;color:var(--g)}.tag.p{background:#FEF3C7;color:#92400E}.tag.x{background:#FEE2E2;color:#B42318}
.pg{display:flex;gap:8px;align-items:center;justify-content:center;padding:12px}.note{background:#FFF7E6;border:1px solid #F5DFA6;color:#7A5B00;padding:10px 14px;border-radius:12px;margin-bottom:12px;font-size:13px}
#mo{position:fixed;inset:0;background:#0008;display:none;align-items:center;justify-content:center;z-index:9;padding:14px}#mo.on{display:flex}
#bx{background:#fff;border-radius:16px;padding:20px;width:min(96vw,640px);max-height:92vh;overflow:auto}#bx h2{margin:0 0 12px;color:var(--g)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fr .w{grid-column:1/-1}
label{display:block;font-size:13px;margin-bottom:3px;color:#334155}label input,label select,label textarea{display:block;width:100%;margin-top:4px;padding:9px;border:1px solid #CBD5E1;border-radius:9px;font:inherit}label textarea{min-height:90px}
#tt{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0F172A;color:#fff;padding:10px 18px;border-radius:10px;display:none;z-index:99}
@media(max-width:820px){.lay{flex-direction:column}aside{width:100%;height:auto;position:static}main{padding:14px}.fr{grid-template-columns:1fr}}
'''

# <html lang dir> before the first paint: ?lang=en|ar / localStorage mig-lang — the same rule and keys as data/i18n.js (not loaded here)
_ACC_LANG_JS = ('<script>(function(){var q=/[?&]lang=(en|ar)\\b/.exec(location.search),L="ar";try{if(q)localStorage.setItem("mig-lang",q[1]);'
                'L=localStorage.getItem("mig-lang")||"ar"}catch(e){if(q)L=q[1]}window.MIGLANG=L==="en"?"en":"ar";var d=document.documentElement;'
                'd.lang=window.MIGLANG;d.dir=window.MIGLANG==="en"?"ltr":"rtl"})();</script>')

# the skip link focuses the content without touching the hash (the panel routes on «#section»; «#ct» would reopen the home view)
_ACC_SKIP_JS = ('<script>document.addEventListener("click",function(e){var a=e.target.closest?e.target.closest(".skip"):null;if(!a)return;'
                'e.preventDefault();var c=document.getElementById("ct");if(c)try{c.focus()}catch(x){}},true);</script>')


def _acc_page():
    css_v = _acc_hl.md5(open(B + 'data/acc.css', 'rb').read()).hexdigest()[:8] if _acc_os.path.exists(B + 'data/acc.css') else '0'
    ovl = '<script src="data/mig-overlay.js"></script>' if _acc_os.path.exists(B + 'data/mig-overlay.js') else ''
    dev = '<script src="data/acc-dev.js"></script>' if _acc_os.path.exists(B + 'data/acc-dev.js') else ''   # «🛠️ المطوّر» (owner only; registers with MIGACC.use)
    if _acc_os.path.exists(B + 'data/acc-delete.js'):   # «طلبات حذف الحساب» (owner only, members.delete; registers with MIGACC.use — app parity plan)
        dev += '<script src="data/acc-delete.js"></script>'
    base_head = globals().get('seo_base_head') or '<base href="/">'                       # seo_build.part.py BASE_FIX_HEAD
    base_tail = seo_static_tail() if 'seo_static_tail' in globals() else ''               # BASE_FIX_TAIL: «#x» links stay on /admin/
    return ('<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + base_head +
            '<title>لوحة التحكم – صنع في مصر</title><meta name="robots" content="noindex,nofollow"><meta name="mig-acc" content="1">'
            '<meta name="referrer" content="strict-origin-when-cross-origin"><link rel="icon" href="img/logo-site.png">'
            + _ACC_LANG_JS + '<style>' + _ACC_LIVE_CSS + '</style><link rel="stylesheet" href="data/acc.css?v=' + css_v + '"></head>'
            '<body><a class="skip" href="#ct">تخطي إلى المحتوى</a><div class="lay"><aside id="sd"><div class="lg"><button type="button" id="mnu" class="mnu" aria-expanded="false" aria-controls="nv" aria-label="القائمة">☰</button>'
            '<b>صنع في مصر</b><small>لوحة التحكم</small></div><nav id="nv" aria-label="لوحة التحكم"></nav>'
            '<div class="ft"><span id="whoL">مسجّل باسم</span> <b id="who" dir="auto">—</b><br><a id="site" href="' + _acc_url('home') + '">فتح الموقع ↗</a> · <a id="lo" href="#" role="button">خروج</a>'
            ' · <button type="button" id="lng" class="lng" lang="en">English</button></div></aside>'
            '<main id="mn"><div id="ph"></div><div id="ct" tabindex="-1"><div class="cd"><div class="in">جارٍ التحميل…</div></div></div></main></div>'
            '<div id="mo"><div id="bx" role="dialog" aria-modal="true" aria-labelledby="bxT"></div></div><div id="tt" role="status" aria-live="polite"></div>'
            '<noscript><div class="note" style="margin:20px">لوحة التحكم محتاجة JavaScript شغّال في المتصفح.</div></noscript>'
            '<script>window.MIGOVL_ADMIN=1;window.MIGACC_CFG=' + _acc_json_js(_acc_cfg()) + ';</script>'
            '<script src="data/mig-api.js"></script>' + ovl + '<script src="data/acc.js"></script>' + dev + _ACC_SKIP_JS + base_tail
            # «حماية الموقع» (data/guard.js): the same copy shortcuts as every page; the staff pages send no report (the team's own tools)
            + (guard_tag() if 'guard_tag' in globals() else '') + '</body></html>')


def _acc_write(OUT_, path):
    """PAGE_WRITERS['admin']: /admin/index.html — _bust() versions every data script (?v=<content hash>) like on every other page"""
    html_ = _acc_page()
    html_ = _bust(html_) if '_bust' in globals() else html_
    fp = OUT_ + path.lstrip('/') + 'index.html'
    _acc_os.makedirs(_acc_os.path.dirname(fp), exist_ok=True)
    open(fp, 'w', encoding='utf-8').write(html_)
    print('admin (Control Center) →', path, len(html_), 'bytes')


PAGES['admin'] = ('لوحة التحكم – صنع في مصر', '', '', '', '')
SEO['admin'] = ('لوحة تحكم فريق منصة صنع في مصر.', '', 'WebPage', [], 'yearly', '0.0')
PAGE_WRITERS['admin'] = _acc_write
