# -*- coding: utf-8 -*-
"""Logos for the «شركاء المنصة» strip above the footer (site.py FTR_PARTNERS), cut out of each partner's own banner (img/ban-*.jpg,
the same files as the STRAT / PARTNER sliders on the home page): crop box → trim the flat background → pad → fit 360×144 → JPEG.
Nothing is drawn or invented: every logo is a crop of the partner's banner (Trust: its light grey pattern behind the logo becomes white).

    python3 tools/partner_logos.py            # writes img/partners/*.jpg and prints the sizes for FTR_PARTNERS
"""
import os
import sys
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
SRC, DST = ROOT + 'img/', ROOT + 'img/partners/'
JOBS = [  # (output, banner, crop box in banner pixels, mode, trim tolerance)
    ('arabcont.jpg', 'ban-s-arabcont-1.jpg', (1610, 60, 1900, 330), None, 38),
    ('soulwater.jpg', 'ban-s-soulwater.jpg', (120, 50, 470, 300), None, 38),
    ('elsewedy.jpg', 'ban-s-elsewedy.jpg', (85, 95, 475, 295), None, 38),
    ('elmaleka.jpg', 'ban-p-elmaleka.jpg', (590, 70, 910, 425), None, 46),
    ('trust.jpg', 'ban-p-trust.jpg', (470, 120, 950, 290), 'whiten', 60),
    ('lacto.jpg', 'ban-p-lacto.jpg', (70, 50, 365, 350), None, 38),
    ('elhelal.jpg', 'ban-p-elhelal.jpg', (100, 80, 555, 270), None, 38),
]
MAXW, MAXH, PAD = 360, 144, 0.07


def main():
    os.makedirs(DST, exist_ok=True)
    for out, ban, box, mode, tol in JOBS:
        im = Image.open(SRC + ban).convert('RGB').crop(box)
        if mode == 'whiten':
            px = im.load()
            for y in range(im.size[1]):
                for x in range(im.size[0]):
                    r, g, b = px[x, y]
                    if max(r, g, b) > 200 and max(r, g, b) - min(r, g, b) < 28:
                        px[x, y] = (255, 255, 255)
        bg = im.getpixel((2, 2))
        diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L').point(lambda v: 255 if v > tol else 0)
        im = im.crop(diff.getbbox() or (0, 0) + im.size)
        w, h = im.size
        p = int(max(w, h) * PAD)
        canvas = Image.new('RGB', (w + 2 * p, h + 2 * p), bg)
        canvas.paste(im, (p, p))
        canvas.thumbnail((MAXW, MAXH), Image.LANCZOS)
        canvas.save(DST + out, 'JPEG', quality=88, optimize=True, progressive=True)
        print('img/partners/%s  %dx%d  %d bytes  (from img/%s)' % (out, canvas.size[0], canvas.size[1], os.path.getsize(DST + out), ban))
    return 0


if __name__ == '__main__':
    sys.exit(main())
