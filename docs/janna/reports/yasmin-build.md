I went with Yasmin (black blazer, blue turtleneck) for both. The site figure is now built from the same photo as the live video, so she's the same woman everywhere. I tested it with Playwright (AR/EN at 1366x800 and 390x844, plus the kiosk page) and looked at every screenshot. All 56 built pages load in AR desktop and EN mobile. The only console errors are a 404 on `/api/me` on dashboard.html, because the static server doesn't serve the API. That has nothing to do with Janna.

**How it looks now**
- **Shape:** waist-up (`kind:"bust"`), sitting at the bottom edge of the screen like a TV presenter.
  - The photo's bottom edge fades out over its last 7%, so there's no hard rectangle.
  - She has a soft natural shadow instead of the old floor ellipse.
  - Hair edges are clean, and none of the window background is left.
- **Welcome stage:** she rises in at the bottom beside the panel, about 73vh tall at 1366x800 and capped at 76vh. On phones she stands above the panel at 30vh, and the panel covers her faded lower edge, so she looks like she's behind it.
- **Docked corner (desktop):** `min(31vh,262px)` tall, about 273x248 at 1366x800, flush with the bottom. She still keeps clear of the WhatsApp/back-to-top buttons. Her bubble sits to her left.
- **Phones:** the corner is the new round headshot of her face.
- **Page arrival** (step forward 1.3x, 1.45x on phones) and **kiosk janna.html** (landscape and 1080x1920 portrait) both work with the new figure.
- **Pointing finger:** removed. The bubble now attaches to a point beside her left shoulder (`anchor`), and the pointing dot and beam are hidden. Breathing, sway (a slight head tilt) and the mood motions still run, and reduced-motion is respected.
- **Lips and blink:** while she speaks, all three mouth frames cycle (checked on desktop and mobile, AR and EN). The blink uses her own eyelid skin tone with a lash line on the lower lid, and the face doesn't shift. Close-ups of each frame are in `ar1366-3-face-strip.png`.
- **holo.js:** still finds `.jn-fig` (taller than 120px), and the z-order is unchanged.

**One thing outside my listed files:** I regenerated `img/janna.jpg` (160x160) from her headshot. The old build always wrote it too. bot.js and the meeting page use it as her avatar, and without this they would still show the old woman. The old version is backed up.

**What changed in `data/janna.js`:** only figure and layout code. I added a `BUST` flag, the "bust" styles, and a fallback so the bubble uses `anchor` when there's no `finger`. Every text, behaviour and intent is unchanged, and the build passed (`python3 site.py`).

**How I made the image:** two rembg BiRefNet masks averaged, edge colour cleaned so no window tint bleeds in, then a light JPEG clean-up, 1.5x Lanczos upscale and light sharpening. No AI upscaling, so her face isn't redrawn. The overlays only contain the pixels that change. They're matched to the compressed body image so frame swaps leave no seams.

**Asset sizes (`img/janna/`):**

| File | Size |
|---|---|
| body.webp (1243x1128) | 68,382 B |
| eyes-closed.webp (333x108) | 5,858 B |
| mouth-1.webp (351x246) | 48,836 B |
| mouth-2.webp (351x246) | 40,694 B |
| mouth-3.webp (351x246) | 36,028 B |
| head.webp (240x240) | 6,204 B |
| img/janna.jpg (160x160) | 5,292 B |

That's about 211 KB in total, against about 145 KB before. The mouth frames are the bulk, because they cover the chin movement.

New contract written to `data/janna-real.js`:
```
{"w":1243,"h":1128,"body":"img/janna/body.webp?v=15c81472",
 "eyes":{"x":447,"y":313,"w":333,"h":108,"closed":"img/janna/eyes-closed.webp?v=f142ffb8"},
 "mouth":{"x":429,"y":499,"w":351,"h":246,"frames":[null,"img/janna/mouth-1.webp?v=5bf0d684","img/janna/mouth-2.webp?v=9eb61b89","img/janna/mouth-3.webp?v=357eb566"]},
 "face":{"x":397,"y":195,"w":431,"h":488},"anchor":{"x":50,"y":820},
 "headshot":"img/janna/head.webp?v=0550a97f","kind":"bust"}
```

**Files**

Old assets, the old `janna-real.js`, old `janna.jpg` and `janna.js.orig` are backed up in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/janna-old-assets/`.

To rebuild, run these in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/yasmin/`, in order: `seg.py`, `cut.py`, `hi.py`, `lm.py`, `anim.py` (mouth), `eyes2.py` (eyes), then `build.py`. The test scripts are `qa.js` and `allpages.js`.

Everything below is in `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/yasmin-site/`:
- ar1366-1-stage.png
- ar1366-2-speaking.png
- ar1366-3-face-strip.png
- ar1366-4-dock-hello.png
- ar1366-5-dock.png
- ar1366-6-arrival.png
- ar1366-8-open.png
- en1366-strip.png
- ar390-strip.png
- en390-strip.png
- kiosk-strip.png
- kiosk-portrait-strip.png
- dock-zoom-dpr2.png