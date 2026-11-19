# -*- coding: utf-8 -*-
"""The installable app's icons (PWA: /manifest.webmanifest, /manifest.en.webmanifest, the <head> of every page), made from the
platform logo img/logo-site.png with Pillow. Run by hand after a logo change and commit the result; the build only copies two of
them to the site root (/favicon.ico, /apple-touch-icon.png) and checks that every icon it names exists (seo_build.part.py emit_pwa).

    python3 tools/app_icons.py            # writes img/app/*.png + img/app/favicon.ico (deterministic: same logo → same bytes)
    python3 tools/app_icons.py --check    # exit 1 when a file is missing or differs from what the logo gives

img/app/
  icon-192.png, icon-512.png          purpose "any": the round badge on a transparent background (desktop windows, Android menus)
  maskable-192.png, maskable-512.png  purpose "maskable": the badge at 78 % on a white plate, inside the 80 % safe zone of
                                      Android's adaptive icons (circle, squircle …); white = the manifest background_color
  monochrome-512.png                  purpose "monochrome": the scarab of the logo alone, white on transparent (only alpha is used)
  apple-touch-icon.png (180)          iPhone / iPad home screen: opaque (iOS paints transparency black), the badge at 86 %
  favicon-32.png, favicon.ico         browser tabs (the .ico holds 16, 32 and 48)
  sc-factories / sc-tenders / sc-rfq / sc-janna .png (96)   the manifest shortcuts (long-press on the app icon): the site's own
                                      factory icon (site.py FAC_ICON), a tender document, a request (paper plane), Janna's photo
The source logo is 210×200 px, so the 512 px icons are an upscale (Lanczos + a light unsharp mask): a larger master logo from the
owner can replace img/logo-site.png later, and this script gives sharper icons from it.
"""
import io
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
SRC = B + 'img/logo-site.png'
JANNA = B + 'img/janna.jpg'
OUT = B + 'img/app/'
WHITE = (255, 255, 255, 255)
PINK = (251, 233, 236, 255)       # #FBE9EC — the background of site.py FAC_ICON
RED = (200, 16, 46, 255)          # #C8102E — --green (the site's main red)
LZ = Image.Resampling.LANCZOS


def badge_master():
    """the round badge cropped square from the logo (its circle: x 6–206, y 1–199 in the 210×200 file)"""
    src = Image.open(SRC).convert('RGBA')
    a = src.split()[3].point(lambda v: 255 if v > 128 else 0)
    x0, y0, x1, y1 = a.getbbox()
    w, h = x1 - x0, y1 - y0
    s = max(w, h)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(src.crop((x0, y0, x1, y1)), ((s - w) // 2, (s - h) // 2))
    return sq, src


def scaled(im, d):
    out = im.resize((d, d), LZ)
    if d > im.size[0]:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
    return out


def on_canvas(badge, size, frac, bg=None):
    c = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    d = int(round(size * frac))
    c.alpha_composite(scaled(badge, d), ((size - d) // 2, (size - d) // 2))
    return c


def scarab(src, size=512, frac=0.6):
    """the black scarab inside the logo's inner disc (centre ≈ (107, 103), the disc's own ring at r ≈ 61 is left out) → white glyph"""
    r, g, b, a = src.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)                  # the max channel: black strokes, not the red band
    dark = mx.point(lambda v: 0 if v >= 150 else (255 if v <= 60 else int((150 - v) * 255 / 90)))
    dark = ImageChops.multiply(dark, a)
    disc = Image.new('L', src.size, 0)
    ImageDraw.Draw(disc).ellipse((107 - 56, 103 - 56, 107 + 56, 103 + 56), fill=255)
    dark = ImageChops.multiply(dark, disc).crop(ImageChops.multiply(dark, disc).getbbox())
    w, h = dark.size
    k = size * frac / max(w, h)
    nw, nh = int(round(w * k)), int(round(h * k))
    up = dark.resize((nw, nh), LZ).point(lambda v: 0 if v < 70 else (255 if v > 185 else int((v - 70) * 255 / 115)))
    glyph = Image.new('RGBA', (nw, nh), WHITE)
    glyph.putalpha(up)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(glyph, ((size - nw) // 2, (size - nh) // 2))
    return out


def tile(size=96, ss=4):
    """a shortcut tile: the pink rounded square of FAC_ICON, drawn 4× and reduced (anti-aliased); returns (image, draw, unit)"""
    S = size * ss
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 10 / 48), fill=PINK)
    return im, d, S / 48.0


def done(im, size=96):
    return im.resize((size, size), LZ)


def sc_factories():
    im, d, u = tile()
    # site.py FAC_ICON: <path d="M8 38V22l9 6v-6l9 6v-6l9 6V12h5v26z"/> (48×48), drawn in the middle 70 % so a circle mask keeps it
    pts = [(8, 38), (8, 22), (17, 28), (17, 22), (26, 28), (26, 22), (35, 28), (35, 12), (40, 12), (40, 38)]
    k, o = 0.72, 48 * 0.14
    d.polygon([((x * k + o) * u, (y * k + o + 1) * u) for x, y in pts], fill=RED)
    return done(im)


def sc_tenders():
    im, d, u = tile()
    w = int(2.4 * u)
    d.rounded_rectangle((15 * u, 10 * u, 33 * u, 38 * u), radius=int(2.5 * u), outline=RED, width=w)
    for y, x1 in ((17, 29), (22, 29), (27, 29), (32, 24)):
        d.line((19 * u, y * u, x1 * u, y * u), fill=RED, width=w)
    d.ellipse((28 * u, 29 * u, 36 * u, 37 * u), fill=RED)        # the stamp of an official tender
    return done(im)


def sc_rfq():
    im, d, u = tile()
    # a paper plane: the request goes out to the factories
    d.polygon([(9 * u, 23 * u), (39 * u, 10 * u), (31 * u, 37 * u), (23 * u, 29 * u)], fill=RED)
    d.polygon([(23 * u, 29 * u), (39 * u, 10 * u), (22 * u, 36 * u)], fill=(142, 11, 32, 255))
    d.line((23 * u, 29 * u, 39 * u, 10 * u), fill=PINK, width=int(1.4 * u))
    return done(im)


def sc_janna():
    ph = Image.open(JANNA).convert('RGBA')
    s = min(ph.size)
    ph = ph.crop(((ph.size[0] - s) // 2, (ph.size[1] - s) // 2, (ph.size[0] + s) // 2, (ph.size[1] + s) // 2))
    return ph.resize((96, 96), LZ)


def png_bytes(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return b.getvalue()


def ico_bytes(badge):
    b = io.BytesIO()
    big = on_canvas(badge, 48, 1.0)
    big.save(b, 'ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    return b.getvalue()


def build():
    badge, src = badge_master()
    files = {
        'icon-192.png': png_bytes(on_canvas(badge, 192, 0.96)),
        'icon-512.png': png_bytes(on_canvas(badge, 512, 0.96)),
        'maskable-192.png': png_bytes(on_canvas(badge, 192, 0.78, WHITE)),
        'maskable-512.png': png_bytes(on_canvas(badge, 512, 0.78, WHITE)),
        'monochrome-512.png': png_bytes(scarab(src)),
        'apple-touch-icon.png': png_bytes(on_canvas(badge, 180, 0.86, WHITE)),
        'favicon-32.png': png_bytes(on_canvas(badge, 32, 1.0)),
        'favicon.ico': ico_bytes(badge),
        'sc-factories.png': png_bytes(sc_factories()),
        'sc-tenders.png': png_bytes(sc_tenders()),
        'sc-rfq.png': png_bytes(sc_rfq()),
        'sc-janna.png': png_bytes(sc_janna()),
    }
    return files


def main(argv):
    files = build()
    check = '--check' in argv
    bad = []
    if not check:
        os.makedirs(OUT, exist_ok=True)
    for name, data in sorted(files.items()):
        p = OUT + name
        old = open(p, 'rb').read() if os.path.exists(p) else None
        if check:
            if old != data:
                bad.append(name)
            continue
        if old != data:
            with open(p, 'wb') as f:
                f.write(data)
        print('%-22s %6d bytes%s' % (name, len(data), '' if old != data else ' (unchanged)'))
    if check:
        print('app icons: ' + ('up to date' if not bad else 'missing or out of date: ' + ', '.join(bad) + ' — run python3 tools/app_icons.py'))
        return 1 if bad else 0
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
