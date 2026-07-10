# The Page-Turner

A scroll-driven book with a **genuine, kinematic page curl** — no libraries,
no canvas, no WebGL. The pages bend, the typography bends with them, and the
spine never moves.

**Made by Claude Fable (Anthropic) together with [Dimitrj Egloff](https://dimitrjegloff.ch).**

## How it works

CSS transforms are affine — a plane can turn but cannot bend. So each page is
cut into **strips that form a kinematic chain**: conceptually, every strip
hinges on the end of the previous one and rotates the same small angle
further, bending the page into a circular arc. Every strip carries its own
clipped copy of the page content, so the type deforms with the paper.

The chain is *computed, not nested*: the strips are DOM **siblings** on a
single 3D plane, and the script derives each strip's cumulative hinge
position and angle itself (plain circular-arc trigonometry). Each strip ends
up with one explicit transform — camera included:

```
perspective(d) · rotateY(base) · translate3d(hinge x, 0, hinge z) · rotateY(hinge angle)
```

Nothing about the motion is left for the browser to compose across elements —
which is exactly where engines disagree (see cross-browser notes below).

Three layers per strip, each with its own seam strategy:

| Layer | Overlap | Purpose |
|---|---|---|
| Paper base (behind, −0.22px) | generous, both sides | color-matched — fills wedge gaps invisibly, guarantees a paper back |
| Content copy (self-clipped) | 1.2px right only | real continuation covers front seams; backface-culled per strip |
| Curl light | none — it isn't a layer | a `brightness()` filter painted into the surfaces |

While a page **rests**, the intact original face is shown instead of the
strips — flawless native text rendering, and no seams can exist where there
are no slices. The strips take over only in flight.

The curl is **direction-aware**: paper bends against the motion, and
reversing mid-flight eases the bow through flat to the other side.

## Configuration

At the top of `script.js`:

```js
const CONFIG = {
  SEGMENTS: 12,          // strips per page; more = smoother curl
  CURL: 55,              // how far the free edge trails, in degrees
  SHADING: 0,            // curl light, 0–0.15 (0 = matte)
  SCROLL_PER_FLIP: 70,   // scroll runway per page turn, in vh
  PERSPECTIVE: 2400,     // camera distance in px
  MOBILE_BREAKPOINT: 900
};
```

## Adding pages

One page = one block inside `.book`:

```html
<article class="page" data-ribbon="VI">
  <div class="page-face">
    <!-- any HTML -->
  </div>
</article>
```

Scroll length, ribbon and controls adapt automatically. Page fronts alternate
between `--paper` and `--paper-2`; the generated paper back is color-matched
per page (solid backgrounds recommended on `.page-face`).

Small screens and `prefers-reduced-motion` readers get the same book as a
calm, static stack.

## Cross-browser notes

Three findings from the pixel-hunt, so you don't have to rediscover them:

- **Don't nest deep `preserve-3d` chains.** Gecko flattens them into a
  projected cascade. Compute the composition yourself and keep transformed
  elements as siblings.
- **Don't rely on the `perspective` *property* for non-direct children.**
  Gecko conjugates the camera about the wrong origin, so the whole page
  tilts. Use the `perspective()` transform *function* on the transformed
  elements themselves, wrapped in `translateX(±center)` to aim the camera
  wherever you want it.
- **Don't clip with an `overflow: hidden` wrapper inside a 3D context.**
  A clipping wrapper flattens its children, which silently disables their
  backface culling (the content shows from both sides). Let elements clip
  themselves with `clip-path` instead.

## Files

- `index.html` — the demo book (it documents itself)
- `style.css` — colors in `:root`, then stage, chain, demo styles
- `script.js` — config on top, then the machinery
- `standalone.html` — everything in one file, double-click to run
