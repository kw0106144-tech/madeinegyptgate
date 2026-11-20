# -*- coding: utf-8 -*-
"""APPDL — «تطبيق صنع في مصر»: the app download page, the Android APK channel and the Android App Links file.

Loaded by seo_build.part.py («# APPDL hook» lines: the loader at the end of _seo_build_module, the page spec in plan_pages, the CSS in
emit_assets, the redirect in emit_redirect_maps, the rules in emit_headers / emit_routes, emit() in build_static_seo, the footer link in
site_footer, data-apk in pwa_head). There are no store accounts yet (owner, 2026-11-20): Android installs the signed APK straight from
the site, iPhone installs the site itself from Safari (the PWA, seo_build.part.py emit_pwa) until the App Store.

  /app/ + /en/app/   a generated page (same head, header, footer, styles, canonical / hreflang, sitemap entry as the hubs):
                     the app icon, «تطبيق صنع في مصر» and one line in the site's own words (app/store short description);
                     · Android: «حمّل لأندرويد» → /app/android.apk with the version, size, Android minimum, SHA-256 of the file and
                       3 install steps — or, while no APK is published, «نسخة أندرويد قريباً جداً» (no dead button);
                     · iPhone: Safari → «شارك» → «إضافة إلى الشاشة الرئيسية» (the PWA); «قريباً على App Store» / «قريباً على
                       Google Play» as plain text (no store badges or links until the stores exist);
                     · desktop: a QR code of the page's own URL (an SVG made here at build time: qr_svg, no library);
                     · inside the native app (user agent "MIGApp") «إنت فاتح التطبيق بالفعل» instead of the cards (an inline
                       script marks <html> before the cards are painted); in an installed PWA (display-mode standalone) the Android
                       card stays as it is and the iPhone card says the platform is already on the Home Screen.
  downloads/android/ (repository) madeinegyptgate-<versionName>-<versionCode>.apk + latest.json {version, code, file, bytes, sha256,
                     min_sdk, published[, package, cert_sha256]}, written by tools/publish_apk.py (never by hand). The build copies
                     latest.json and the APKs to /downloads/android/ and writes «/app/android.apk /downloads/android/<file> 302» to
                     _redirects (no rule without an APK). A latest.json whose file is missing, whose bytes / sha256 do not match, or a
                     file over Pages' 25 MiB stops the build («app:» problems; deploy/stage.py check_app checks the upload again, and
                     refuses an APK whose signer assetlinks.json does not list — the debug key always).
  /.well-known/assetlinks.json   Android App Links for com.madeinegyptgate.app: seo/config.json "app" (package + the SHA-256 of the
                     signing certificates: the release key now, Google Play's app signing key when the Play app exists). No
                     apple-app-site-association: it needs the Apple Team ID (app/well-known/README.md).
_headers / _routes.json: the APKs are attachments of type application/vnd.android.package-archive, nosniff, cached a year (the file
names carry the version); assetlinks.json is application/json; /app/android.apk and /.well-known/* skip the Functions (Pages applies
_redirects and _headers there). The service worker never touches /downloads/ or /app/android.apk (seo_build.part.py PWA_DEF).
Browser code here is ES5 (CLAUDE.md 2.1).
"""

APPDL_DIR = 'downloads/android/'
APPDL_FILE_RX = r'^madeinegyptgate-([0-9][0-9A-Za-z._-]{0,39})-([1-9][0-9]{0,9})\.apk$'
APPDL_MAX_BYTES = 25 * 1024 * 1024            # Cloudflare Pages: 25 MiB per file
APPDL_PACKAGE = 'com.madeinegyptgate.app'
APPDL_PATH = '/app/'
APPDL_APK = '/app/android.apk'
# Android release of an API level (latest.json min_sdk → «أندرويد 7.0 أو أحدث»)
APPDL_ANDROID = {21: '5.0', 22: '5.1', 23: '6.0', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12',
                 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16'}

# ------------------------------------------------------------------------------------------------ QR code (ISO/IEC 18004)
# Byte mode (UTF-8), versions 1-9, error correction L/M/Q/H, the mask with the lowest penalty. Checked against python-qrcode
# (bit-identical symbols for the same mask) and decoded with zxing for every version and level (2026-11-20).
QR_ECC = {'L': (1, (7, 10, 15, 20, 26, 18, 20, 24, 30), (1, 1, 1, 1, 1, 2, 2, 2, 2)),
          'M': (0, (10, 16, 26, 18, 24, 16, 18, 22, 22), (1, 1, 1, 2, 2, 4, 4, 4, 5)),
          'Q': (3, (13, 22, 18, 26, 18, 24, 18, 22, 20), (1, 1, 2, 2, 4, 4, 6, 6, 8)),
          'H': (2, (17, 28, 22, 16, 22, 28, 26, 26, 24), (1, 1, 2, 4, 4, 4, 5, 6, 8))}   # (format bits, ECC codewords per block, blocks)


def _qr_raw_codewords(ver):
    n = (16 * ver + 128) * ver + 64
    if ver >= 2:
        k = ver // 7 + 2
        n -= (25 * k - 10) * k - 55
        if ver >= 7:
            n -= 36
    return n // 8


def _qr_gf_mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = ((z << 1) ^ ((z >> 7) * 0x11D)) & 0xFF
        z ^= ((y >> i) & 1) * x
    return z


def _qr_rs(data, degree):
    """the Reed-Solomon error-correction codewords of a block"""
    gen = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            gen[j] = _qr_gf_mul(gen[j], root)
            if j + 1 < degree:
                gen[j] ^= gen[j + 1]
        root = _qr_gf_mul(root, 2)
    rem = [0] * degree
    for b in data:
        f = b ^ rem[0]
        rem = rem[1:] + [0]
        for i in range(degree):
            rem[i] ^= _qr_gf_mul(gen[i], f)
    return rem


def _qr_align(ver):
    if ver == 1:
        return []
    k = ver // 7 + 2
    step = (ver * 4 + k * 2 + 1) // (k * 2 - 2) * 2
    pos, p = [6] + [0] * (k - 1), ver * 4 + 17 - 7
    for i in range(k - 1, 0, -1):
        pos[i] = p
        p -= step
    return pos


def qr_matrix(text, ecl='M'):
    """the modules of the QR code of text (rows of booleans, True = dark): byte mode, the smallest version 1-9 that holds it"""
    data = text.encode('utf-8')
    fbits, ecc_t, blk_t = QR_ECC[ecl]
    for ver in range(1, 10):
        cap = _qr_raw_codewords(ver) - ecc_t[ver - 1] * blk_t[ver - 1]
        if 4 + 8 + 8 * len(data) <= cap * 8:
            break
    else:
        raise ValueError('qr_matrix: %d bytes do not fit a version 1-9 QR code' % len(data))
    bits = [0, 1, 0, 0] + [(len(data) >> i) & 1 for i in range(7, -1, -1)]      # mode «byte», 8-bit count
    for b in data:
        bits += [(b >> i) & 1 for i in range(7, -1, -1)]
    bits += [0] * min(4, cap * 8 - len(bits))                                    # terminator, then whole bytes
    bits += [0] * (-len(bits) % 8)
    cw = [int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = 0xEC
    while len(cw) < cap:
        cw.append(pad)
        pad ^= 0xEC ^ 0x11
    nb, ecl_len, raw = blk_t[ver - 1], ecc_t[ver - 1], _qr_raw_codewords(ver)
    short_len, n_short = raw // nb, nb - raw % nb
    blocks, k = [], 0
    for i in range(nb):
        dl = short_len - ecl_len + (0 if i < n_short else 1)
        blocks.append((cw[k:k + dl], _qr_rs(cw[k:k + dl], ecl_len)))
        k += dl
    out = [d[i] for i in range(short_len - ecl_len + 1) for d, e in blocks if i < len(d)]
    out += [e[i] for i in range(ecl_len) for d, e in blocks]
    size = ver * 4 + 17
    m = [[False] * size for _ in range(size)]
    fn = [[False] * size for _ in range(size)]

    def put(x, y, dark):
        m[y][x] = dark
        fn[y][x] = True
    for i in range(size):                                                        # timing patterns
        put(6, i, i % 2 == 0)
        put(i, 6, i % 2 == 0)
    for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4)):                        # finder patterns + separators
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                if 0 <= cx + dx < size and 0 <= cy + dy < size:
                    put(cx + dx, cy + dy, max(abs(dx), abs(dy)) not in (2, 4))
    al = _qr_align(ver)
    for i, ax in enumerate(al):                                                  # alignment patterns
        for j, ay in enumerate(al):
            if (i, j) in ((0, 0), (0, len(al) - 1), (len(al) - 1, 0)):
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    put(ax + dx, ay + dy, max(abs(dx), abs(dy)) != 1)

    def draw_format(mask):
        d = fbits << 3 | mask
        r = d
        for _ in range(10):
            r = (r << 1) ^ ((r >> 9) * 0x537)
        b = (d << 10 | r) ^ 0x5412
        bit = lambda i: (b >> i) & 1 == 1
        for i in range(6):
            put(8, i, bit(i))
        put(8, 7, bit(6))
        put(8, 8, bit(7))
        put(7, 8, bit(8))
        for i in range(9, 15):
            put(14 - i, 8, bit(i))
        for i in range(8):
            put(size - 1 - i, 8, bit(i))
        for i in range(8, 15):
            put(8, size - 15 + i, bit(i))
        put(8, size - 8, True)                                                   # the dark module
    draw_format(0)
    if ver >= 7:
        r = ver
        for _ in range(12):
            r = (r << 1) ^ ((r >> 11) * 0x1F25)
        vb = ver << 12 | r
        for i in range(18):
            put(size - 11 + i % 3, i // 3, (vb >> i) & 1 == 1)
            put(i // 3, size - 11 + i % 3, (vb >> i) & 1 == 1)
    i, nbits, right = 0, len(out) * 8, size - 1                                  # the codewords, in the zigzag order
    while right >= 1:
        if right == 6:
            right = 5
        for vert in range(size):
            for j in range(2):
                x = right - j
                y = size - 1 - vert if ((right + 1) & 2) == 0 else vert
                if not fn[y][x] and i < nbits:
                    m[y][x] = (out[i >> 3] >> (7 - (i & 7))) & 1 == 1
                    i += 1
        right -= 2
    masks = (lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0, lambda x, y: (x + y) % 3 == 0,
             lambda x, y: (x // 3 + y // 2) % 2 == 0, lambda x, y: x * y % 2 + x * y % 3 == 0,
             lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0, lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0)

    def flip(mask):
        f = masks[mask]
        for yy in range(size):
            for xx in range(size):
                if not fn[yy][xx] and f(xx, yy):
                    m[yy][xx] = not m[yy][xx]

    def penalty():
        p = 0
        for ln in [row[:] for row in m] + [[m[yy][xx] for yy in range(size)] for xx in range(size)]:
            run, prev = 0, None
            for v in ln + [None]:
                if v == prev:
                    run += 1
                else:
                    if run >= 5:
                        p += run - 2
                    run, prev = 1, v
            s = ''.join('1' if v else '0' for v in ln)
            p += 40 * sum(1 for q in range(len(s)) if s.startswith('10111010000', q) or s.startswith('00001011101', q))
        p += 3 * sum(1 for yy in range(size - 1) for xx in range(size - 1) if m[yy][xx] == m[yy][xx + 1] == m[yy + 1][xx] == m[yy + 1][xx + 1])
        dark = sum(sum(1 for v in row if v) for row in m)
        return p + 10 * (abs(dark * 20 - size * size * 10) // (size * size))
    best = None
    for mask in range(8):
        flip(mask)
        draw_format(mask)
        sc = penalty()
        if best is None or sc < best[0]:
            best = (sc, mask)
        flip(mask)                                                               # the same XOR again: back to the unmasked symbol
    flip(best[1])
    draw_format(best[1])
    return m


def qr_svg(text, label, ecl='M', quiet=4):
    """an inline SVG of the QR code of text: one path of horizontal runs on a white square with the quiet zone (it scans in the dark
    theme too); role=img + aria-label, and no <title> (a generated page keeps its one <title> in <head>)"""
    m = qr_matrix(text, ecl)
    n = len(m) + 2 * quiet
    d = []
    for y, row in enumerate(m):
        x = 0
        while x < len(row):
            if row[x]:
                x0 = x
                while x < len(row) and row[x]:
                    x += 1
                d.append('M%d %dh%dv1h-%dz' % (x0 + quiet, y + quiet, x - x0, x - x0))
            else:
                x += 1
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="%s" shape-rendering="crispEdges" focusable="false">'
            '<rect width="%d" height="%d" fill="#fff"/><path fill="#111" d="%s"/></svg>' % (n, n, label, n, n, ''.join(d)))


# ------------------------------------------------------------------------------------------------ the page's CSS (the SEO bundle)
APPDL_CSS = r'''
.ad-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px;align-items:start}
.ad-card{border:1px solid var(--line);border-radius:18px;background:var(--surface);padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.ad-card h2{font-size:1.2rem;margin:0;display:flex;align-items:center;gap:8px;line-height:1.4}
.ad-card h3{font-size:1rem;margin:4px 0 0}
.ad-card p{margin:0;line-height:1.8}
.ad-btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:12px 20px;border-radius:14px;background:var(--green);color:#fff!important;font-weight:800;font-size:1.2rem;text-decoration:none!important;box-shadow:0 10px 22px -12px rgba(142,11,32,.7)}
.ad-btn:hover{filter:brightness(1.08)}.ad-btn:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.ad-btn svg{flex:none}
.ad-steps{margin:0;padding-inline-start:1.5em;display:flex;flex-direction:column;gap:6px;line-height:1.7}
.ad-steps svg{display:inline-block;vertical-align:-3px;margin:0 2px}
.ad-sha code{display:block;font-size:.76rem;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;direction:ltr;text-align:left;unicode-bidi:isolate;background:var(--sunken);border-radius:8px;padding:6px 8px;user-select:all}
.ad-soon{background:var(--gold-soft);border:1px dashed var(--gold);border-radius:12px;padding:10px 14px;font-weight:800;line-height:1.7}
.ad-store{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:.84rem;color:var(--muted);font-weight:700;background:var(--sunken)}
.ad-note{font-size:.85rem;color:var(--muted)}
.ad-inapp{display:none;flex-direction:column;gap:8px;background:#ECFDF3;border:1px solid #6CE9A6;color:#05603A;border-radius:16px;padding:16px 18px}
.ad-inapp b{font-size:1.15rem}
html.ad-native .ad-inapp{display:flex}
html.ad-native .ad-dl{display:none}
.ad-done{display:none;font-weight:800;color:var(--fg)}
html.ad-standalone.ad-ios .ad-c-ios .ad-done{display:block}
html.ad-standalone.ad-ios .ad-c-ios .ad-steps,html.ad-standalone.ad-ios .ad-c-ios .ad-how{display:none}
.ad-qr{display:none;align-items:center;text-align:center}
.ad-qr svg{width:200px;height:200px;border-radius:12px;border:1px solid var(--line)}
.ad-qr .ad-url{direction:ltr;font-weight:800;color:var(--fg)}
@media (min-width:900px) and (hover:hover){.ad-qr{display:flex}}
html.ad-phone .ad-qr{display:none!important}
html.ad-ios .ad-c-ios{order:-1}
'''

# down-arrow (the download button) and the iOS share icon (the same drawing as data/pwa.js)
APPDL_DL_SVG = ('<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" fill="none" '
                'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')
APPDL_SHARE_SVG = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" '
                   'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
# marks <html> before the cards are painted: ad-native in the platform's own app (user agent "MIGApp", app/capacitor.config.json),
# ad-android / ad-ios / ad-phone on phones (the QR code is for computers), ad-standalone in an installed PWA (the Android card
# stays; the iPhone card says the platform is installed). ES5.
APPDL_JS = ('(function(){var d=document.documentElement,n=navigator,u=n.userAgent||"",c=[],t=n.maxTouchPoints||0,s=false;'
            'if(/\\bMIGApp\\b/.test(u))c.push("ad-native");if(/Android/i.test(u))c.push("ad-android","ad-phone");'
            'else if(/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&t>1))c.push("ad-ios","ad-phone");else if(/Mobile/i.test(u))c.push("ad-phone");'
            'try{s=n.standalone===true||!!(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);}catch(e){}if(s)c.push("ad-standalone");'
            'if(c.length)d.className+=(d.className?" ":"")+c.join(" ");})();')


def appdl_module(H):
    """H = the namespace of seo_build.part.py's _seo_build_module (its locals() at the end): the helpers are taken by name"""
    import os
    import re
    import json
    import hashlib
    import shutil
    esc, X, S, B, SITE = H['esc'], H['X'], H['S'], H['B'], H['SITE']
    crumbs, home_crumb, hero, mk_title, mk_desc, abs_url, fmt_date = (H['crumbs'], H['home_crumb'], H['hero'], H['mk_title'], H['mk_desc'],
                                                                       H['abs_url'], H['fmt_date'])
    full_date = H['full_date']
    _GEN = {}   # per process: the APK's digest is computed once per file version (survives seo_build's _init)
    FP_RX = re.compile(r'^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$')
    PKG_RX = re.compile(r'^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$')

    def _sha256(path):
        st = os.stat(path)
        k = (path, st.st_size, st.st_mtime_ns)
        if k not in _GEN:
            h = hashlib.sha256()
            with open(path, 'rb') as f:
                for chunk in iter(lambda: f.read(1 << 20), b''):
                    h.update(chunk)
            _GEN[k] = h.hexdigest()
        return _GEN[k]

    def apk_info():
        """the published APK, from downloads/android/latest.json (tools/publish_apk.py): {'state': 'none' | 'ok' | 'bad', 'problems': […],
        and for 'ok' version, code, file, bytes, sha256, min_sdk, published, android (release name), mb (size)}"""
        if 'apk' in S:
            return S['apk']
        d = B + APPDL_DIR
        names = sorted(os.listdir(d)) if os.path.isdir(d) else []
        apks = [n for n in names if n.lower().endswith('.apk')]
        probs = []
        info = {'state': 'none', 'problems': probs, 'apks': [n for n in apks if re.match(APPDL_FILE_RX, n)]}
        for n in apks:
            if not re.match(APPDL_FILE_RX, n):
                probs.append('app: %s%s is not named madeinegyptgate-<versionName>-<versionCode>.apk (tools/publish_apk.py)' % (APPDL_DIR, n))
        if 'latest.json' not in names:
            if apks:
                probs.append('app: %s has APK files but no latest.json (publish with tools/publish_apk.py)' % APPDL_DIR)
            info['state'] = 'bad' if probs else 'none'
            S['apk'] = info
            return info
        try:
            j = json.load(open(d + 'latest.json', encoding='utf-8'))
        except Exception as e:
            probs.append('app: %slatest.json is not valid JSON (%s)' % (APPDL_DIR, e))
            j = None
        if isinstance(j, dict):
            v, c, f, n, h, ms, pub = (j.get('version'), j.get('code'), j.get('file'), j.get('bytes'), j.get('sha256'), j.get('min_sdk'),
                                      j.get('published'))
            if not isinstance(v, str) or not re.match(r'^[0-9][0-9A-Za-z._-]{0,39}$', v):
                probs.append('app: latest.json "version" %r is not a version name such as "1.0.0"' % (v,))
            if not isinstance(c, int) or isinstance(c, bool) or not 1 <= c <= 2100000000:
                probs.append('app: latest.json "code" %r is not an Android versionCode (1 … 2100000000)' % (c,))
            if not isinstance(f, str) or not re.match(APPDL_FILE_RX, f) or f != 'madeinegyptgate-%s-%s.apk' % (v, c):
                probs.append('app: latest.json "file" %r is not madeinegyptgate-<version>-<code>.apk of this version' % (f,))
            elif not os.path.isfile(d + f):
                probs.append('app: latest.json names %s%s, which is not in the repository' % (APPDL_DIR, f))
            else:
                size = os.path.getsize(d + f)
                if size > APPDL_MAX_BYTES:
                    probs.append('app: %s%s is %.1f MiB (Cloudflare Pages takes at most 25 MiB per file)' % (APPDL_DIR, f, size / 1048576.0))
                if n != size:
                    probs.append('app: latest.json "bytes" %r, but %s is %d bytes' % (n, f, size))
                if not isinstance(h, str) or not re.match(r'^[0-9a-f]{64}$', h):
                    probs.append('app: latest.json "sha256" is not 64 lower-case hex digits')
                elif _sha256(d + f) != h:
                    probs.append('app: latest.json "sha256" does not match %s (the file changed after publishing?)' % f)
            if not isinstance(ms, int) or isinstance(ms, bool) or not 21 <= ms <= 99:
                probs.append('app: latest.json "min_sdk" %r is not an Android API level (21 … 99)' % (ms,))
            if not full_date(pub):
                probs.append('app: latest.json "published" %r is not a date (YYYY-MM-DD)' % (pub,))
            if j.get('package') not in (None, APPDL_PACKAGE):
                probs.append('app: latest.json "package" %r is not %s' % (j.get('package'), APPDL_PACKAGE))
            for x in apks:
                if x != f and os.path.getsize(d + x) > APPDL_MAX_BYTES:     # (the published one is checked above)
                    probs.append('app: %s%s is over 25 MiB (Cloudflare Pages)' % (APPDL_DIR, x))
            if not probs:
                info.update({'state': 'ok', 'version': v, 'code': c, 'file': f, 'bytes': n, 'sha256': h, 'min_sdk': ms, 'published': pub,
                             'android': APPDL_ANDROID.get(ms) or ('API %d' % ms), 'mb': '%.1f' % (n / 1048576.0)})
        elif j is not None:
            probs.append('app: latest.json must be a JSON object')
        if probs:
            info['state'] = 'bad'
        S['apk'] = info
        return info

    def app_conf():
        """seo/config.json "app": {"android_package", "android_cert_sha256": ["AA:BB:…"]} → (package, fingerprints, problems)"""
        c = (S.get('cfg') or {}).get('app') or {}
        probs = []
        pkg = c.get('android_package') or APPDL_PACKAGE
        fps = c.get('android_cert_sha256') or []
        if not isinstance(pkg, str) or not PKG_RX.match(pkg):
            probs.append('app: seo/config.json app.android_package %r is not a package name' % (pkg,))
        if not isinstance(fps, list) or not fps:
            probs.append('app: seo/config.json app.android_cert_sha256 lists no signing certificate (the SHA-256 of the release key)')
            fps = []
        bad = [x for x in fps if not isinstance(x, str) or not FP_RX.match(x)]
        if bad:
            probs.append('app: seo/config.json app.android_cert_sha256 has a value that is not «AA:BB:…» (32 upper-case hex pairs): %r' % (bad[0],))
        return pkg, [x for x in fps if isinstance(x, str) and FP_RX.match(x)], probs

    def assetlinks():
        pkg, fps, probs = app_conf()
        if probs or not fps:
            return None, probs
        return [{'relation': ['delegate_permission/common.handle_all_urls'],
                 'target': {'namespace': 'android_app', 'package_name': pkg, 'sha256_cert_fingerprints': fps}}], []

    def key():
        a = apk_info()
        return ('app-dl', 2, [a.get(k) for k in ('state', 'version', 'code', 'sha256', 'published')])

    def render(L):
        en = L == 'en'
        P = '/en' if en else ''
        url = abs_url(P + APPDL_PATH)
        a = apk_info()
        ok = a.get('state') == 'ok'
        T = lambda ar, e: esc(X(L, ar, e))
        h1 = X(L, 'تطبيق صنع في مصر', 'Made in Egypt Gate app')
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'التطبيق', 'App'), P + APPDL_PATH)], L, url)
        intro = X(L, 'المنصة الوطنية B2B على موبايلك: مصانع وموردون ومنتجات ومناقصات وطلبات أسعار في مصر.',
                  'The national B2B platform on your phone: Egyptian factories, suppliers, products, tenders and RFQs.')
        top = hero(L, ch, h1, intro, logo='/img/app/icon-512.png')
        # the 512 px icon is shown 96 px wide: phones up to 2× take the 192 px file
        top = top.replace('<img class="logo" src="/img/app/icon-512.png"',
                          '<img class="logo" src="/img/app/icon-512.png" srcset="/img/app/icon-192.png 192w, /img/app/icon-512.png 512w" sizes="96px"', 1)
        # Android
        steps_and = ('<h3>%s</h3><ol class="ad-steps"><li>%s</li><li>%s</li><li>%s</li></ol>'
                     % (T('التثبيت في 3 خطوات', 'Install in 3 steps'),
                        T('افتح الملف بعد ما يخلص التحميل (من الإشعار أو من «التنزيلات»).', 'Open the file when the download finishes (from the notification or Downloads).'),
                        T('لو أندرويد سألك، اسمح بالتثبيت من هذا المصدر.', 'If Android asks, allow installing from this source.'),
                        T('اضغط «تثبيت»، وبعدها افتح التطبيق.', 'Tap Install, then open the app.')))
        if ok:
            facts = [(X(L, 'الإصدار', 'Version'), '<span dir="ltr">%s</span> %s' % (esc(a['version']), T('(رقم البناء %d)' % a['code'], '(build %d)' % a['code']))),
                     (X(L, 'الحجم', 'Size'), T('%s ميجابايت' % a['mb'], '%s MB' % a['mb'])),
                     (X(L, 'يعمل على', 'Works on'), T('أندرويد %s أو أحدث' % a['android'], 'Android %s or later' % a['android'])),
                     (X(L, 'تاريخ النشر', 'Published'), esc(fmt_date(a['published'], L)))]
            android = ('<a class="ad-btn" href="%s" data-ad="apk">%s<span>%s</span></a>'
                       '<p class="ad-note">%s</p>'
                       '<dl class="sx-facts">%s</dl>'
                       '<div class="ad-sha"><b>%s</b> <span class="ad-note">%s</span><code translate="no">%s</code></div>%s'
                       '<p class="ad-note">%s</p>'
                       % (APPDL_APK, APPDL_DL_SVG, T('حمّل لأندرويد', 'Download for Android'),
                          T('لو Chrome سألك قبل التنزيل، أكّد إنك عايز الملف. ولو التحميل ما بدأش، افتح الصفحة دي في Chrome.',
                            'If Chrome asks before the download, confirm that you want the file. If the download does not start, open this page in Chrome.'),
                          ''.join('<dt>%s</dt><dd>%s</dd>' % (esc(k), v) for k, v in facts),
                          'SHA-256', T('(بصمة الملف، للتأكد إنه الملف الأصلي)', '(the file’s fingerprint, to check it is the original)'), esc(a['sha256']),
                          steps_and,
                          T('النسخة الأحدث بتتثبّت فوق القديمة من غير ما تمسحها.', 'A newer version installs over the old one: no need to remove it first.')))
        else:
            android = ('<p class="ad-soon">%s</p><p>%s</p>'
                       % (T('⏳ نسخة أندرويد قريباً جداً.', '⏳ The Android app is coming very soon.'),
                          T('لحد ما تنزل، تقدر تثبّت المنصة من Chrome: افتح القائمة ⋮ واختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
                            'Until then, install the platform from Chrome: open the ⋮ menu and choose Install app or Add to Home screen.')))
        c_and = ('<section class="ad-card ad-c-and" id="android" aria-labelledby="adAnd"><h2 id="adAnd">%s</h2>%s<span class="ad-store">%s</span></section>'
                 % (T('أندرويد', 'Android'), android, T('قريباً على Google Play', 'Coming soon to Google Play')))
        # iPhone / iPad: the site itself from Safari (the PWA)
        c_ios = ('<section class="ad-card ad-c-ios" id="iphone" aria-labelledby="adIos"><h2 id="adIos">%s</h2><p class="ad-how">%s</p>'
                 '<p class="ad-done">%s</p><ol class="ad-steps"><li>%s</li><li>%s</li><li>%s</li></ol><span class="ad-store">%s</span></section>'
                 % (T('آيفون وآيباد', 'iPhone and iPad'),
                    T('ثبّت المنصة على الشاشة الرئيسية من Safari، وهتفتح زي التطبيق.', 'Add the platform to your Home Screen from Safari: it opens like an app.'),
                    T('✅ المنصة متثبّتة على شاشتك الرئيسية بالفعل.', '✅ The platform is already on your Home Screen.'),
                    T('افتح madeinegyptgate.com في Safari.', 'Open madeinegyptgate.com in Safari.'),
                    T('اضغط زر «شارك» ', 'Tap the Share button ') + APPDL_SHARE_SVG + '.',
                    T('اختار «إضافة إلى الشاشة الرئيسية»، وبعدها «إضافة».', 'Choose Add to Home Screen, then Add.'),
                    T('قريباً على App Store', 'Coming soon to the App Store')))
        # computers: the QR code of this page
        page_url = SITE + P + APPDL_PATH
        c_qr = ('<section class="ad-card ad-qr" aria-labelledby="adQr"><h2 id="adQr">%s</h2><p>%s</p>%s<span class="ad-url">%s</span></section>'
                % (T('على الكمبيوتر؟', 'On a computer?'), T('امسح الكود بكاميرا الموبايل عشان تفتح الصفحة دي عليه.', 'Scan the code with your phone’s camera to open this page on it.'),
                   qr_svg(page_url, T('رمز QR لصفحة تطبيق صنع في مصر', 'QR code of the Made in Egypt Gate app page')),
                   esc(page_url.replace('https://', ''))))
        inapp = ('<section class="ad-inapp" role="status"><b>%s</b><span>%s</span></section>'
                 % (T('✅ إنت فاتح التطبيق بالفعل', '✅ You already have the app open'),
                    T('التطبيق بيعرض المنصة نفسها، فأي جديد في الموقع بيظهر فيه على طول.', 'The app shows the platform itself, so anything new on the site appears in it right away.')))
        about = ('<section class="card2"><h2>%s</h2><p>%s</p></section>'
                 % (T('عن التطبيق', 'About the app'),
                    T('التطبيق بيفتح منصة صنع في مصر نفسها، فأي تحديث في الموقع بيظهر فيه على طول من غير ما تحدّث التطبيق: دليل المصانع، والسوق، والمناقصات وطلبات الأسعار، ومكالمة جنة المساعدة الذكية.',
                      'The app opens Made in Egypt Gate itself, so every update of the site is in it at once, with no app update: the factory directory, the marketplace, tenders and requests for quotation, and a call with Janna, the smart assistant.')))
        body = (top + '<div class="wrap sx-main ad-main"><script>%s</script>%s<div class="ad-dl"><div class="ad-grid">%s%s%s</div></div>%s</div>'
                % (APPDL_JS, inapp, c_and, c_ios, c_qr, about))
        if ok:
            desc = X(L, 'حمّل تطبيق منصة صنع في مصر لأندرويد مباشرة من الموقع، أو ثبّته على آيفون من Safari: مصانع وموردون ومنتجات ومناقصات وطلبات أسعار في مصر.',
                     'Download the Made in Egypt Gate app for Android from the site, or add it to your iPhone from Safari: Egyptian factories, products, tenders and RFQs.')
            page_ld = {'@context': 'https://schema.org', '@type': 'MobileApplication', '@id': url + '#app', 'name': X(L, 'منصة صنع في مصر', 'Made in Egypt Gate'),
                       'operatingSystem': 'Android %s+' % a['android'], 'applicationCategory': 'BusinessApplication', 'softwareVersion': a['version'],
                       'fileSize': '%s MB' % a['mb'], 'downloadUrl': abs_url(APPDL_APK), 'image': abs_url('/img/app/icon-512.png'),
                       'datePublished': a['published'], 'publisher': {'@id': SITE + '/#org'}}
        else:
            desc = X(L, 'تطبيق منصة صنع في مصر: ثبّت المنصة على شاشة موبايلك من المتصفح على آيفون وأندرويد، ونسخة أندرويد للتحميل المباشر قريباً جداً.',
                     'The Made in Egypt Gate app: add the platform to your phone’s home screen from the browser on iPhone and Android; the Android download is coming very soon.')
            page_ld = None
        meta = {'title': mk_title([X(L, 'تطبيق منصة صنع في مصر لأندرويد وآيفون', 'Made in Egypt Gate app for Android and iPhone')], L, suffix=False),
                'desc': mk_desc([desc], L, ''), 'h1': h1, 'og_type': 'website', 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld, 'jsonld_page': page_ld,
                'kw': '', 'keywords': X(L, 'تطبيق صنع في مصر، تحميل تطبيق أندرويد، تطبيق المصانع المصرية، منصة B2B', 'Made in Egypt Gate app, Android app download, Egyptian factories app, B2B platform')}
        return body, meta

    def redirect_rule():
        """the _redirects line of the stable link (302: it follows each new version), or None while no APK is published"""
        a = apk_info()
        return ('%s /%s%s 302' % (APPDL_APK, APPDL_DIR, a['file'])) if a.get('state') == 'ok' else None

    def headers():
        """_headers rules (the paths skip the Functions: routes_exclude + /downloads/* of emit_routes, so Pages applies them). The APKs
        are versioned: cached a year. Pages joins a header that two matching rules set («nosniff, nosniff»): this rule detaches the
        /* value first, then sets its own (the asset server applies a rule's «! Name» before its own lines)."""
        return ('/downloads/android/*.apk\n  Content-Type: application/vnd.android.package-archive\n  Content-Disposition: attachment\n'
                '  ! X-Content-Type-Options\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=31536000, immutable\n'
                '/downloads/android/latest.json\n  Cache-Control: public, max-age=300\n'
                '/.well-known/assetlinks.json\n  Content-Type: application/json\n  Cache-Control: public, max-age=3600\n')

    def emit(OUT):
        """the APK channel (/downloads/android/: latest.json + the APKs of the repository) and /.well-known/assetlinks.json"""
        a = apk_info()
        probs = list(a.get('problems') or [])
        dst = OUT + APPDL_DIR
        if os.path.islink(dst.rstrip('/')):
            os.unlink(dst.rstrip('/'))
        elif os.path.isdir(dst):
            shutil.rmtree(dst)
        copied = []
        if a.get('state') == 'ok':
            os.makedirs(dst, exist_ok=True)
            for n in ['latest.json'] + list(a.get('apks') or []):
                shutil.copy2(B + APPDL_DIR + n, dst + n)
                copied.append(n)
        al, aprobs = assetlinks()
        probs += aprobs
        wk = OUT + '.well-known/assetlinks.json'
        if os.path.exists(wk):
            os.remove(wk)
        if al:
            os.makedirs(OUT + '.well-known', exist_ok=True)
            with open(wk, 'w', encoding='utf-8') as f:
                f.write(json.dumps(al, indent=2) + '\n')
        return {'apk': {k: a.get(k) for k in ('state', 'version', 'code', 'file', 'bytes', 'sha256', 'min_sdk', 'published')},
                'copied': copied, 'assetlinks': bool(al), 'redirect': redirect_rule(), 'problems': probs}

    return {'css': APPDL_CSS, 'path': APPDL_PATH, 'render': render, 'key': key, 'apk_info': apk_info, 'emit': emit,
            'redirect_rule': redirect_rule, 'headers': headers, 'routes_exclude': ['/.well-known/*', APPDL_APK]}
