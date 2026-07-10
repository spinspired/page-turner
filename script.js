/* ═══════════════════════════════════════════════════════════════════
 *
 *     
 * 
 *                ,..........   ..........,
 *            ,..,'   THE    '.' genuine  ',..,
 *           ,' ,'   PAGE     :    curl    ', ',
 *          ,' ,'  TURNER     :  kinematic  ', ',
 *         ,' ,'              :    chain     ', ',
 *        ,' ,'............., : ,.............', ',
 *       ,'  '............   '.'   ............'  ',
 *        '''''''''''''''''';''';''''''''''''''''''
 *                           ''' 
 *   
 *               Folded out of mathematics by
 *  
 *   C L A U D E   F A B L E  ×  D I M I T R J   E G L O F F
 *                 https://dimitrjegloff.ch
 * 
 *              scroll-driven · library-free
 * 
 * 
 *
 * ═══════════════════════════════════════════════════════════════════ */

/* ── Configuration ─────────────────────────────────────────────────
   Pages themselves are plain HTML: every <article class="page"> in
   .book is one leaf of the book. Add or remove pages freely — the
   scroll length, ribbon and controls adapt automatically.          */
const CONFIG = {
  SEGMENTS: 12,          // strips per page; more = smoother curl, costlier
  CURL: 55,              // how far the free edge trails, in degrees
  SHADING: 0,            // curl light, 0–0.15 (0 = matte, applied as a
                         // brightness() filter — no overlay geometry,
                         // therefore no seams by construction)
  SCROLL_PER_FLIP: 70,   // scroll runway per page turn, in vh
  PERSPECTIVE: 2400,     // camera distance in px
  MOBILE_BREAKPOINT: 900 // below this width pages stack statically
};

(function(){
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = window.matchMedia('(max-width: ' + CONFIG.MOBILE_BREAKPOINT + 'px)');

  const stage   = document.querySelector('.flipbook-stage');
  const book    = document.querySelector('.book');
  const pages   = Array.from(document.querySelectorAll('.book .page'));
  const ribbon  = document.querySelector('.ribbon');
  const readout = document.getElementById('readout');
  if (!stage || !book || pages.length < 2) return;

  const flips = pages.length - 1;              // the last page never flips
  const labels = pages.map((p, i) => p.dataset.ribbon || String(i + 1));
  const RAD = Math.PI / 180;

  /* The scroll runway grows with the page count. */
  stage.style.height = 'calc(100vh + ' + (flips * CONFIG.SCROLL_PER_FLIP) + 'vh)';

  /* Ribbon marks, one per page. */
  const marks = labels.map(label => {
    const mark = document.createElement('span');
    mark.textContent = label;
    ribbon.appendChild(mark);
    return mark;
  });

  /* ── Building the kinematic chain ────────────────────────────────
     Each page is cut into SEGMENTS vertical strips. The strips are
     SIBLINGS on a single 3D plane; the script computes each strip's
     cumulative hinge position and angle itself (plain circular-arc
     trigonometry). Mathematically identical to nesting the strips
     inside one another — but it never asks the browser to resolve a
     twelve-level preserve-3d chain, which some engines (Firefox)
     flatten into a projected cascade. Every strip carries its own
     clipped copy of the page content, so the type bends with the
     paper. While a page rests, the intact original face is shown
     instead of the strips: flawless native text rendering, and no
     seams can exist where there are no slices.                     */
  const chains = new Map();     // page → {parts, face, root, w}
  const lastState = new Map();  // page → last rendered state key

  function buildChains(){
    const W = book.clientWidth, H = book.clientHeight;
    const w = W / CONFIG.SEGMENTS;

    for (const page of pages){
      const face = page.querySelector('.page-face');
      let chain = chains.get(page);

      if (!chain){
        const paperColor = getComputedStyle(face).backgroundColor;
        const root = document.createElement('div');
        root.className = 'chain';
        const parts = [];

        for (let k = 0; k < CONFIG.SEGMENTS; k++){
          const seg = document.createElement('div');
          seg.className = 'segment';

          const paper = document.createElement('div');
          paper.className = 'paper-back';
          paper.style.background = paperColor;       // color-matched back

          const copy = document.createElement('div');
          copy.className = 'copy';
          const clone = face.cloneNode(true);
          clone.style.display = '';
          copy.appendChild(clone);

          seg.append(paper, copy);                   // paper behind the content
          root.appendChild(seg);                     // siblings — no nesting
          parts.push({ seg, copy, paper });
        }
        page.appendChild(root);
        chain = { parts, face, root };
        chains.set(page, chain);
      }
      chain.w = w;
      chain.center = W / 2; // the camera aims at the book's center

      /* Geometry — also refreshed on resize.
         · paper overlaps generously on both sides: color-matched, it
           fills the wedge gaps between curved segments invisibly
         · content overlaps 1.2px to the right only: real continuation
           covers the front seams; a left overlap would double-paint
         · at the free edge both retreat 3px so the content alone
           defines the silhouette — one crisp edge, never two       */
      chain.parts.forEach((t, k) => {
        const left    = k === 0 ? 0 : 0.8;
        const right   = k === CONFIG.SEGMENTS - 1 ? 0 : 1.2;
        const retreat = k === CONFIG.SEGMENTS - 1 ? 3 : 0;

        t.seg.style.left  = '0px';                   // placed via transform
        t.seg.style.width = w + 'px';

        t.paper.style.left  = (-left) + 'px';
        t.paper.style.width = (w + left + right - retreat) + 'px';

        t.copy.style.left   = (-(k * w)) + 'px';
        t.copy.style.width  = W + 'px';
        t.copy.style.height = H + 'px';
        const clip = 'inset(0 ' + (W - (k * w + w + right)).toFixed(2)
                   + 'px 0 ' + (k * w).toFixed(2) + 'px)';
        t.copy.style.clipPath = clip;
        t.copy.style.webkitClipPath = clip;
      });
      lastState.delete(page);                        // force a redraw
    }
  }

  function removeChains(){
    for (const [page, chain] of chains){
      chain.root.remove();
      chain.face.style.display = '';
      page.style.transform = '';
    }
    chains.clear(); lastState.clear();
  }

  /* ── Turn direction ──────────────────────────────────────────────
     Real paper always bends AGAINST the motion — the free edge trails.
     Turning back, the page bows the other way. If you reverse mid-
     flight the direction eases through flat instead of snapping.   */
  let direction = 1, directionTarget = 1, gliding = false;
  function glideDirection(){
    if (Math.abs(directionTarget - direction) < 0.02){
      direction = directionTarget; gliding = false; update(); return;
    }
    direction += (directionTarget - direction) * 0.12;
    update();
    requestAnimationFrame(glideDirection);
  }

  /* ── The scroll-driven update ────────────────────────────────────── */
  const smooth = t => t * t * (3 - 2 * t);
  let lastP = 0, ticking = false;

  function update(){
    if (reducedMotion || narrow.matches){ ticking = false; return; }
    const vh = window.innerHeight;
    const rect = stage.getBoundingClientRect();
    const runway = rect.height - vh;
    const p = Math.min(1, Math.max(0, -rect.top / runway)) * flips;  // 0 … flips

    if (Math.abs(p - lastP) > 0.0005){
      directionTarget = p > lastP ? 1 : -1;
      if (directionTarget !== direction && !gliding){
        gliding = true;
        requestAnimationFrame(glideDirection);
      }
    }

    for (let i = 0; i < pages.length; i++){
      const page = pages[i];
      const f = Math.min(1, Math.max(0, p - i));     // 0 = resting, 1 = turned
      const g = smooth(f);

      const state = (g > 0 && g < 1)
        ? g.toFixed(5) + '|' + direction.toFixed(3)
        : String(g);
      if (lastState.get(page) !== state){
        lastState.set(page, state);
        const bend = Math.sin(Math.PI * g);          // 0 → 1 → 0 across the turn

        const chain = chains.get(page);
        if (chain){
          /* The base rotation is baked into EVERY segment: one explicit
             transform per strip instead of a motion composed across
             several 3D levels. Engines project multi-level 3D
             differently (Gecko let the page flap downward) — with one
             finished matrix per strip there is nothing left to compose.
             All strips sit at left:0; their left edge IS the spine, so
             the rotation axis stays put to the pixel. */
          page.style.transform = '';
          /* At rest the intact face takes over from the strips. */
          const resting = g === 0;
          chain.face.style.display = resting ? '' : 'none';
          chain.root.style.display = resting ? 'none' : '';

          if (!resting){
            /* The arc, computed by hand: every hinge adds the same angle;
            each strip sits at the end of the previous one. Every strip
            gets ONE explicit transform, camera first — perspective() as
            a function, conjugated by translateX(±center) to project about
            the book's center (pixel-identical to the former ancestor
            perspective in Blink, finally correct in Gecko) — then the
            base rotation around the spine, then the strip's hinge
            position and angle. */
            const base =
              'translateX(' + chain.center.toFixed(2) + 'px) ' +
              'perspective(' + CONFIG.PERSPECTIVE + 'px) ' +
              'translateX(' + (-chain.center).toFixed(2) + 'px) ' +
              'rotateY(' + (-180 * g).toFixed(3) + 'deg) ';
            const trail = CONFIG.CURL * bend * direction;
            const step = trail / (CONFIG.SEGMENTS - 1);
            const w = chain.w;
            let x = 0, z = 0, phi = 0;

            chain.parts.forEach((t, k) => {
              t.seg.style.transform = base +
                'translate3d(' + x.toFixed(2) + 'px,0,' + z.toFixed(2) + 'px) ' +
                'rotateY(' + phi.toFixed(3) + 'deg)';

              /* Curl light, painted into the surfaces themselves. */
              const along = k / (CONFIG.SEGMENTS - 1);
              const fwd = (direction + 1) / 2;
              const dim = CONFIG.SHADING * bend * ((1 - along) * fwd + along * (1 - fwd));
              const filter = dim > 0.001 ? 'brightness(' + (1 - dim).toFixed(3) + ')' : '';
              t.copy.style.filter = filter;
              t.paper.style.filter = filter;

              /* Advance to the next hinge along this strip's plane. */
              x += w * Math.cos(phi * RAD);
              z -= w * Math.sin(phi * RAD);
              phi += step;
            });
          }
        }
      }

      /* Stacking: the turning page on top, resting pages in order,
         turned pages beneath. */
      if (f > 0 && f < 1)      page.style.zIndex = 60;
      else if (f >= 1)         page.style.zIndex = 5 + i;
      else                     page.style.zIndex = 40 - i;
    }

    /* Ribbon and readout. */
    const current = Math.min(flips, Math.floor(p + 0.5));
    marks.forEach((m, i) => m.classList.toggle('current', i === current));
    if (readout) readout.textContent = labels[current];
    lastP = p;
    ticking = false;
  }
  function requestUpdate(){
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', requestUpdate, { passive:true });
  window.addEventListener('resize', requestUpdate);

  /* ── Chain lifecycle ─────────────────────────────────────────────── */
  if (!reducedMotion && !narrow.matches) buildChains();
  narrow.addEventListener('change', () => {
    if (reducedMotion) return;
    if (narrow.matches) removeChains(); else buildChains();
  });
  window.addEventListener('resize', () => {
    if (!reducedMotion && !narrow.matches) buildChains();
  });
  update();

  /* Ribbon appears only while the book is on stage. */
  const visibility = new IntersectionObserver(entries => {
    ribbon.classList.toggle('active', entries[0].isIntersecting);
  }, { threshold: 0.02 });
  visibility.observe(stage);

  /* ── Controls: page buttons and skip in both directions ─────────── */
  function goTo(k){
    const top = window.scrollY + stage.getBoundingClientRect().top;
    const step = (stage.offsetHeight - window.innerHeight) / flips;
    window.scrollTo({ top: top + k * step + 2, behavior:'smooth' });
  }
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  on('btn-prev', () => goTo(Math.max(0, Math.ceil(lastP - 0.02) - 1)));
  on('btn-next', () => goTo(Math.min(flips, Math.floor(lastP + 0.02) + 1)));
  on('btn-skip-down', () => goTo(flips));
  on('btn-skip-up', () => {
    const top = window.scrollY + stage.getBoundingClientRect().top;
    window.scrollTo({ top: top - window.innerHeight * 0.9, behavior:'smooth' });
  });
})();
