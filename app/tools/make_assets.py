#!/usr/bin/env python3
"""Icons, splash screens and store graphics of the native apps, made from the platform logo.

    python3 app/tools/make_assets.py                     # from the repository root, or: cd app && npm run assets
    python3 app/tools/make_assets.py --logo big-logo.png # a sharper master later (PNG with transparency, the round badge)

Source: img/logo-site.png (the round «منصة صنع في مصر / Made in Egypt Gate» badge of the site header, 210 x 200 px).
Brand colours: the site's header bar and footer red #8E0B20 (--green-deep in factory-profile.html), white ring.
Every file below is written again on each run (same input = same bytes), so it is safe to re-run and commit the result:

  Android  app/android/app/src/main/res/mipmap-*/ic_launcher*.png      launcher icons (legacy, round, adaptive foreground)
           app/android/app/src/main/res/values/ic_launcher_background.xml   adaptive icon background colour
           app/android/app/src/main/res/drawable*/splash.png           legacy splash images (port / land, every density)
           app/android/app/src/main/res/drawable-*dpi/splash_icon.png  Android 12+ splash icon (SplashScreen API)
  iOS      app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   1024 x 1024, no transparency
           app/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png    launch screen
  Stores   app/store/graphics/play-icon-512.png, play-feature-graphic-1024x500.png, appstore-icon-1024.png
  Web      app/www/offline.html  the inline logo (between <!--LOGO--> and <!--/LOGO-->)

The logo master is small (about 200 px): the big sizes are upscaled and look soft. Give a vector or a 1024 px+ master with
--logo and run again; nothing else changes.
"""
import argparse
import base64
import io
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, features
except ImportError:  # pragma: no cover
    sys.exit("Pillow is missing: python3 -m pip install pillow")

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(APP)
RES = os.path.join(APP, "android", "app", "src", "main", "res")
XC = os.path.join(APP, "ios", "App", "App", "Assets.xcassets")

RED = (0x8E, 0x0B, 0x20)       # header bar / footer / theme-color of the site
WHITE = (255, 255, 255)
GOLD = (0xC0, 0x93, 0x00)
DENSITIES = [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)]
SPLASH_PORT = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}


def load_badge(path):
    """the round badge, cropped to its circle and made square (transparent outside)"""
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    box = alpha.getbbox()
    if not box:
        sys.exit("the logo has no visible pixels: " + path)
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    return sq


def scaled(badge, d):
    """the badge at d x d px; upscaling is followed by a light unsharp mask"""
    out = badge.resize((d, d), Image.LANCZOS)
    if d > badge.size[0]:
        out = out.filter(ImageFilter.UnsharpMask(radius=max(1, d // 300), percent=60, threshold=2))
    return out


def ringed(badge, d, ring=0.045):
    """badge with a white ring around it, total diameter d (transparent corners)"""
    ss = 4  # supersampled ring edge
    big = d * ss
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((0, 0, big - 1, big - 1), fill=WHITE + (255,))
    layer = layer.resize((d, d), Image.LANCZOS)
    inner = int(round(d * (1 - 2 * ring)))
    b = scaled(badge, inner)
    off = (d - inner) // 2
    layer.alpha_composite(b, (off, off))
    return layer


def canvas(w, h, color=RED, alpha=False):
    return Image.new("RGBA", (w, h), color + (255,)) if not alpha else Image.new("RGBA", (w, h), (0, 0, 0, 0))


def place(base, art):
    base.alpha_composite(art, ((base.size[0] - art.size[0]) // 2, (base.size[1] - art.size[1]) // 2))
    return base


def rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * ss - 1, size * ss - 1), radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def save(img, path, rgb=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if rgb:
        bg = Image.new("RGB", img.size, RED)
        bg.paste(img, (0, 0), img if img.mode == "RGBA" else None)
        img = bg
    img.save(path, "PNG", optimize=True)
    return path


def android(badge, written):
    for name, k in DENSITIES:
        s = int(round(48 * k))
        # legacy square icon (Android 7): red rounded square, ringed badge
        sq = canvas(s, s)
        place(sq, ringed(badge, int(round(s * 0.84))))
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        out.paste(sq, (0, 0), rounded_mask(s, int(round(s * 0.18))))
        written.append(save(out, os.path.join(RES, "mipmap-" + name, "ic_launcher.png")))
        # legacy round icon
        rd = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        circ = canvas(s, s)
        place(circ, ringed(badge, int(round(s * 0.86))))
        rd.paste(circ, (0, 0), circle_mask(s))
        written.append(save(rd, os.path.join(RES, "mipmap-" + name, "ic_launcher_round.png")))
        # adaptive foreground (108 dp layer, 66 dp safe circle): the ringed badge inside the safe zone
        f = int(round(108 * k))
        fg = canvas(f, f, alpha=True)
        place(fg, ringed(badge, int(round(f * 0.60))))
        written.append(save(fg, os.path.join(RES, "mipmap-" + name, "ic_launcher_foreground.png")))
        # Android 12+ splash icon (288 dp canvas, shown inside a 192 dp circle): no background of its own
        sp = int(round(288 * k))
        si = canvas(sp, sp, alpha=True)
        place(si, ringed(badge, int(round(sp * 0.62))))
        written.append(save(si, os.path.join(RES, "drawable-" + name, "splash_icon.png")))
        # legacy splash images
        pw, ph = SPLASH_PORT[name]
        for orient, (w, h) in (("port", (pw, ph)), ("land", (ph, pw))):
            img = canvas(w, h)
            place(img, ringed(badge, int(round(min(w, h) * 0.42))))
            written.append(save(img, os.path.join(RES, "drawable-%s-%s" % (orient, name), "splash.png"), rgb=True))
    img = canvas(480, 320)
    place(img, ringed(badge, int(round(320 * 0.42))))
    written.append(save(img, os.path.join(RES, "drawable", "splash.png"), rgb=True))
    col = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(col, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#8E0B20</color>\n</resources>\n')
    written.append(col)


def ios(badge, written):
    icon = canvas(1024, 1024)
    place(icon, ringed(badge, 820))
    written.append(save(icon, os.path.join(XC, "AppIcon.appiconset", "AppIcon-512@2x.png"), rgb=True))
    splash = canvas(2732, 2732)
    place(splash, ringed(badge, 640))
    for n in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        written.append(save(splash, os.path.join(XC, "Splash.imageset", n), rgb=True))


def find_font(arg):
    cands = [arg] if arg else []
    cands += [os.path.join(APP, "tools", "fonts", "Cairo-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def store(badge, written, font_path):
    g = os.path.join(APP, "store", "graphics")
    icon = canvas(512, 512)
    place(icon, ringed(badge, 410))
    written.append(save(icon, os.path.join(g, "play-icon-512.png"), rgb=True))
    ai = canvas(1024, 1024)
    place(ai, ringed(badge, 820))
    written.append(save(ai, os.path.join(g, "appstore-icon-1024.png"), rgb=True))
    # Google Play feature graphic 1024 x 500: the badge and the platform name in both languages
    fg = canvas(1024, 500)
    d = ImageDraw.Draw(fg)
    d.rectangle((0, 462, 1024, 500), fill=(0x12, 0x07, 0x08, 255))
    d.rectangle((0, 456, 1024, 462), fill=GOLD + (255,))
    fg.alpha_composite(ringed(badge, 330), (1024 - 330 - 64, 60))
    if font_path and features.check("raqm"):
        big = ImageFont.truetype(font_path, 64, layout_engine=ImageFont.Layout.RAQM)
        small = ImageFont.truetype(font_path, 40, layout_engine=ImageFont.Layout.RAQM)
        d.text((600, 150), "منصة صنع في مصر", font=big, fill=WHITE + (255,), anchor="rm", direction="rtl", language="ar")
        d.text((600, 250), "Made in Egypt Gate", font=small, fill=(0xF6, 0xE4, 0xE6, 255), anchor="rm")
        d.text((600, 325), "madeinegyptgate.com", font=ImageFont.truetype(font_path, 30, layout_engine=ImageFont.Layout.RAQM),
               fill=GOLD + (255,), anchor="rm")
    written.append(save(fg, os.path.join(g, "play-feature-graphic-1024x500.png"), rgb=True))


def offline_logo(badge, written):
    page = os.path.join(APP, "www", "offline.html")
    if not os.path.exists(page):
        return
    s = open(page, encoding="utf-8").read()
    img = ringed(badge, 224, ring=0.04)
    buf = io.BytesIO()
    img.quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(buf, "PNG", optimize=True)
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    tag = '<!--LOGO--><img class="logo" src="%s" width="112" height="112" alt="منصة صنع في مصر – Made in Egypt Gate"><!--/LOGO-->' % uri
    new, n = re.subn(r"<!--LOGO-->.*?<!--/LOGO-->", lambda m: tag, s, flags=re.S)
    if n != 1:
        sys.exit("app/www/offline.html needs exactly one <!--LOGO-->…<!--/LOGO--> block")
    if new != s:
        open(page, "w", encoding="utf-8").write(new)
    written.append(page)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--logo", default=os.path.join(ROOT, "img", "logo-site.png"), help="the round badge as PNG with transparency")
    ap.add_argument("--font", default="", help="TTF for the feature graphic text (Cairo Bold if present, else DejaVu Sans Bold)")
    a = ap.parse_args()
    badge = load_badge(a.logo)
    written = []
    android(badge, written)
    ios(badge, written)
    store(badge, written, find_font(a.font))
    offline_logo(badge, written)
    print("logo %s (%d px master) -> %d files" % (os.path.relpath(a.logo, ROOT), badge.size[0], len(written)))


if __name__ == "__main__":
    main()
