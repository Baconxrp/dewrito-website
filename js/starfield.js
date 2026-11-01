// Dewrito Starfield
//
// Performance notes (mobile Firefox in particular):
// - No allocations per frame. Each layer's glow gradient is built once, centred on (0,0) with
//   radius 1, and every star reuses it via setTransform + globalAlpha. The old code built a new
//   gradient and two colour strings per star per frame (~60k short-lived objects a second), and
//   the garbage-collection pauses that caused showed up as stutter.
// - The sky and nebulae are three fixed layers moved with CSS transforms on scroll, which the
//   compositor handles without repainting. Rebuilding their gradients on every scroll frame
//   forced full-screen repaints.
// - The canvas is sized to the large viewport height (100lvh), so the mobile address bar showing
//   or hiding doesn't resize it, and stars are only regenerated when the width really changes.
// - Star count scales with screen area, so phones draw the same density as desktops instead of
//   cramming 320 stars into a third of the space.
(function () {
  'use strict';

  function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Honour the OS "reduce motion" setting: render one static frame instead of animating.
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const LAYERS = [
      { count: 180, minR: 0.2, maxR: 0.8, speed: 0.03, rgb: '180,160,220' },
      { count: 100, minR: 0.5, maxR: 1.4, speed: 0.08, rgb: '203,160,240' },
      { count: 40,  minR: 1.0, maxR: 2.2, speed: 0.18, rgb: '255,220,255' }
    ];
    // Star counts above are tuned for a 1280x800 screen; smaller screens get proportionally fewer.
    const REFERENCE_AREA = 1280 * 800;
    const TWO_PI = Math.PI * 2;

    let stars = [];
    let width = 0, height = 0, scrollY = 0;

    // ---------- per-layer drawing styles, built once ----------
    // Glow: radial gradient centred on 0,0 with radius 1; scaled per star with setTransform.
    // Colour stops use full opacity and the star's opacity is applied with globalAlpha, which
    // matches the old per-star gradients (their alphas scaled linearly with opacity).
    const glows = LAYERS.map(l => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${l.rgb},0.5)`);
      g.addColorStop(0.3, `rgba(${l.rgb},0.15)`);
      g.addColorStop(1, `rgba(${l.rgb},0)`);
      return g;
    });
    const cores = LAYERS.map(l => `rgb(${l.rgb})`);
    const flares = LAYERS.map(l => `rgba(${l.rgb},0.15)`);

    function createStars() {
      const scale = Math.min(1, Math.max(0.35, (width * height) / REFERENCE_AREA));
      stars = [];
      LAYERS.forEach((layer, idx) => {
        const n = Math.round(layer.count * scale);
        for (let i = 0; i < n; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * (height + 200) - 100,
            r: Math.random() * (layer.maxR - layer.minR) + layer.minR,
            opacity: Math.random() * 0.7 + 0.3,
            layer: idx,
            pulseSpeed: Math.random() * 0.008 + 0.001,
            pulseOffset: Math.random() * TWO_PI,
            layerOffset: Math.random() * 200
          });
        }
      });
    }

    // ---------- sky: three fixed layers, moved by transform on scroll ----------
    let sky = document.getElementById('starfield-sky');
    if (!sky) {
      sky = document.createElement('div');
      sky.id = 'starfield-sky';
      sky.setAttribute('aria-hidden', 'true');
      canvas.parentNode.insertBefore(sky, canvas);
    }
    sky.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;height:100lvh;z-index:-2;pointer-events:none;overflow:hidden;background-color:#030112;';
    sky.innerHTML = '';
    const layerBase = 'position:absolute;pointer-events:none;will-change:transform;';
    const skyMain = document.createElement('div');
    const nebula1 = document.createElement('div');
    const nebula2 = document.createElement('div');
    nebula1.style.cssText = layerBase + 'width:700px;height:700px;border-radius:50%;background:radial-gradient(circle closest-side, rgba(80,23,85,0.06), rgba(80,23,85,0.02) 50%, transparent 100%);';
    nebula2.style.cssText = layerBase + 'width:600px;height:600px;border-radius:50%;background:radial-gradient(circle closest-side, rgba(0,180,212,0.04), rgba(0,180,212,0.015) 50%, transparent 100%);';
    sky.append(skyMain, nebula1, nebula2);

    function layoutSky() {
      // Main glow: a circle 0.7x the larger side, drawn on an oversized layer so it can drift.
      const R = Math.round(Math.max(width, height) * 0.7);
      skyMain.style.cssText = layerBase + `left:${width / 2 - R}px;top:${height / 2 - R}px;width:${R * 2}px;height:${R * 2}px;`
        + 'background:radial-gradient(circle closest-side, #0a0520, #070318 50%, #030112 100%);';
      nebula1.style.left = (width * 0.3 - 350) + 'px';
      nebula1.style.top = (height * 0.4 - 350) + 'px';
      nebula2.style.left = (width * 0.75 - 300) + 'px';
      nebula2.style.top = (height * 0.65 - 300) + 'px';
      moveSky();
    }
    function moveSky() {
      // Same drift rates as before; transforms only, so no repaint.
      skyMain.style.transform = `translate3d(${scrollY * 0.06}px, ${scrollY * 0.03}px, 0)`;
      nebula1.style.transform = `translate3d(${-scrollY * 0.02}px, ${-scrollY * 0.03}px, 0)`;
      nebula2.style.transform = `translate3d(${-scrollY * 0.015}px, ${-scrollY * 0.025}px, 0)`;
    }

    // ---------- sizing ----------
    function measure() {
      // The canvas is styled 100% wide and 100lvh tall (large viewport), so its box doesn't
      // change when the mobile address bar shows or hides.
      const r = canvas.getBoundingClientRect();
      return { w: Math.round(r.width || window.innerWidth), h: Math.round(r.height || window.innerHeight) };
    }
    function resize(force) {
      const { w, h } = measure();
      if (!w || !h) return;
      const widthChanged = w !== width;
      // Ignore small height-only changes (address bar, on-screen keyboard); a real rotation or
      // window resize changes the width too.
      if (!force && !widthChanged && Math.abs(h - height) < 120) return;
      width = canvas.width = w;
      height = canvas.height = h;
      if (force || widthChanged || !stars.length) createStars();
      layoutSky();
      if (reduceMotion) drawStars(0);
    }

    // ---------- drawing ----------
    function drawStars(time) {
      if (width === 0 || height === 0) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 0.5;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const layer = LAYERS[s.layer];
        const opacity = s.opacity * (0.5 + 0.5 * Math.sin(time * s.pulseSpeed + s.pulseOffset));

        const px = s.x + Math.sin(time * 0.0002 + s.pulseOffset) * (s.layer + 1) * 0.5;
        let y = s.y - scrollY * layer.speed + s.layerOffset * layer.speed;
        if (y < -10) y += height + 20;
        if (y > height + 10) y -= height + 20;

        ctx.globalAlpha = opacity;

        // glow: the shared unit gradient, scaled to 5x the star radius
        const gr = s.r * 5;
        ctx.setTransform(gr, 0, 0, gr, px, y);
        ctx.fillStyle = glows[s.layer];
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, TWO_PI);
        ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // core
        ctx.fillStyle = cores[s.layer];
        ctx.beginPath();
        ctx.arc(px, y, s.r, 0, TWO_PI);
        ctx.fill();

        // cross flare on the bigger, brighter stars
        if (s.r > 1.5 && opacity > 0.6) {
          const flare = s.r * 3;
          ctx.strokeStyle = flares[s.layer];
          ctx.beginPath();
          ctx.moveTo(px - flare, y);
          ctx.lineTo(px + flare, y);
          ctx.moveTo(px, y - flare);
          ctx.lineTo(px, y + flare);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (!reduceMotion) requestAnimationFrame(drawStars);
    }

    // ---------- start ----------
    resize(true);
    requestAnimationFrame(drawStars);

    // Real resizes (rotation, window size). Debounced so dragging a window edge doesn't
    // regenerate the stars dozens of times.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resize(false), 150);
    });
    // Safety net for the old "huge stars" problem: if layout wasn't final when we first
    // measured, the size will differ once the page has loaded. No-op when nothing changed.
    window.addEventListener('load', () => resize(false));

    // Scroll parallax: stars read scrollY each frame; the sky moves by transform.
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || reduceMotion) return; // with reduce motion on, everything stays still
      ticking = true;
      requestAnimationFrame(() => {
        scrollY = window.pageYOffset;
        moveSky();
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStarfield);
  } else {
    initStarfield();
  }
})();
