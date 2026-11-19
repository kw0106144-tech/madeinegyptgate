REVIEW: VISUAL REALISM & IDENTITY (Janna figure rebuilt from the Yasmin photo). I edited no project files. My own working files are in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/rev/

## CRITICAL: the Yasmin build is no longer in the project. The site serves the old woman again.
- What happened: at 2026-11-18 00:29:37 UTC, after the build report (screenshots are timestamped 00:28), every owned file was overwritten within about 8 ms. Each one now matches its backup in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/janna-old-assets/ exactly:
  - /home/user/madeinegyptgate/data/janna.js equals janna.js.orig (240,199 B; `grep -c BUST` returns 0)
  - /home/user/madeinegyptgate/data/janna-real.js is back to the old contract (w 833, h 1854, has `finger`, no `kind`)
  - /home/user/madeinegyptgate/img/janna/{body,eyes-closed,head,mouth-1..3}.webp equal the old files (`cmp`). For example, body.webp is 94,974 B; the new one was 68,382 B.
  - /home/user/madeinegyptgate/img/janna.jpg is the old one (7,216 B).
  - The served copies under /home/user/madeinegyptgate/site/{data,img/janna} are reverted too.
- Repro (Playwright 1366x800 with sessionStorage `janna-stage=1`, then open about.html, news.html or legal.html): the old light-blue-blazer standing woman appears, with the pointing finger and a 143x320 figure box. Screenshot: /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/rev/d1-about-2300.png
- What survives: no copy of the new janna.js (the BUST layout code) exists anywhere. I searched the scratchpad and the project. No 68,382 B body.webp exists on disk either. Only the scratchpad sources remain in /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/yasmin/:
  - cut_hi_final.png
  - hi/eyes-closed.png and hi/mouth-1.png to hi/mouth-3.png
  - build.py and the other scripts
- Consequence: the assets can be re-emitted with build.py, but the janna.js layout changes have to be redone. The site currently contradicts the owner's decision: the site figure is not the live-video woman.
- Cause: unknown. It looks like a scripted restore from janna-old-assets, possibly a concurrent workflow.
- Because of this, I could not re-run live checks of the new figure (stage, arrival, dock). The findings below come from the new assets, which I read before the revert, and from the builder's screenshots.

## Findings on the Yasmin assets (as built before the revert)

**1. MEDIUM: the eyes-closed overlay looks like flat painted patches.**
- Repro: composite /home/user/madeinegyptgate/img/janna/eyes-closed.webp at (447,313) on body.webp. Zoom: rev/eyes_cmp.png.
- The closed lid is a uniform, untextured tan oval. It has a faint darker rim, no lid crease or eyeshadow texture, and a thin lash line.
- On the left eye, the original upper-lash fragments stay visible at the outer corner, so you see a double lash line.
- It reads as "goggles" or makeup in yasmin-site/ar1366-3-face-strip.png (5th frame) and in kiosk-strip.png (middle, 1920 kiosk, where the face is about 300 px). At dock size it passes (dock-zoom-dpr2.png).
- Each blink is short, but at stage and kiosk sizes it is noticeable.

**2. MEDIUM: the arrival claim is unverified, because the builder's "arrival" screenshots don't show an arrival.**
- yasmin-site/ar1366-6-arrival.png and en1366-6-arrival.png were taken on factories.html. They show the ghosted dock figure (opacity .32, no `.jn-come`), the same as -7-after-arrival.
- Cause: arrivalPlan() in janna.js returns null or `{big:false}` there, because the page's search and select fields sit under the 1.3x area.
- So the 1.3x step-forward with the bust was never captured. It needs a test on a page without fields near her, such as about.html or news.html.

**3. LOW: the denoise/upscale gives a slightly waxy, posterised skin.**
- Repro: rev/face_src_vs_body.png (left is the source at 1.5x Lanczos, right is body.webp).
- Forehead and cheeks show flat blotchy plateaus, and fine skin texture is lost (fastNlMeans h=1.2 plus WebP).
- Identity is preserved: same features, eyes and lips, with no hallucinated detail.
- It is visible only at the large stage and kiosk sizes.

**4. LOW: the mouth frames are aligned but only mildly distinct, and m3 is not clearly rounded.**
- Repro: rev/mouth_cmp.png.
- Checks passed:
  - overlay border alpha is 0 on all four sides
  - the feather differs from the body by a mean of about 0.4 and p99 ≤ 3.4 per channel, so there is no seam
  - no overlay pixel lands on transparent body area
- m2 opens and shows a hint of teeth, and m3 is open with similar width. When cycled they still look natural.
- Side effect: the jaw silhouette at the face sides cannot move, because the overlays never touch transparent pixels. This is invisible in practice.

**5. LOW: the ghost state makes the real face semi-transparent.**
- This is existing janna.js behaviour (`.jn-fig.ghost` → .jn-mood opacity .32 over page text), not new code.
- With a photographic face it reads as an eerie translucent woman over the hero or cards (ar1366-5-dock.png, ar1366-7-after-arrival.png).
- Not a regression, but it works against "looks like a real woman". Flagging it for the owner.

**6. LOW: kiosk portrait 1080x1920 has a large empty black gap between the bubble (top) and the bust (bottom half).**
- See kiosk-portrait-strip.png.
- She occupies only about the lower 50% of the screen. It is cosmetic.

## Verified OK (new assets, before the revert)
- **Identity:** she matches the live-avatar photo /tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/bg/yasmin.jpg (byte-identical to yasmin/src.jpg).
- **Cutout:**
  - hair and bun edges are clean on both white and dark backgrounds (rev/edge0.png), with no window remnants or light fringe
  - ear and jaw edges are clean (rev/edge3.png)
  - blazer edge alpha ramps over about 6 px with neutral dark colour
- **Bottom fade:** smooth over the last 7% (rev/edge1.png). The bottom row's alpha is at most 3, so there is no hard rectangle.
- **Stage screenshots:** ar1366-1-stage, -2-speaking, the mobile stage in ar390-strip, and dock-hello all look like a real presenter.
- **Mobile:** the headshot reads well at 390 px.