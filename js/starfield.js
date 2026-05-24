// Dewrito Starfield — Fixed initialization
(function() {
  'use strict';

  function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let stars = [];
    let width = 0;
    let height = 0;
    let scrollY = 0;

    const LAYERS = [
      { count: 180, minR: 0.2, maxR: 0.8, speed: 0.03, color: 'rgba(180,160,220,' },
      { count: 100, minR: 0.5, maxR: 1.4, speed: 0.08, color: 'rgba(203,160,240,' },
      { count: 40,  minR: 1.0, maxR: 2.2, speed: 0.18, color: 'rgba(255,220,255,' }
    ];

    function createStars() {
      stars = [];
      let idx = 0;
      for (const layer of LAYERS) {
        for (let i = 0; i < layer.count; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * (height + 200) - 100,
            r: Math.random() * (layer.maxR - layer.minR) + layer.minR,
            opacity: Math.random() * 0.7 + 0.3,
            layer: idx,
            pulseSpeed: Math.random() * 0.008 + 0.001,
            pulseOffset: Math.random() * Math.PI * 2,
            layerOffset: Math.random() * 200
          });
        }
        idx++;
      }
    }

    function resizeCanvas() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      createStars();
    }

    function drawStars(time) {
      if (width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);

      const scrollShift = scrollY * 0.0003;
      const gx = width / 2 + scrollShift * 200;
      const gy = height / 2 + scrollShift * 100;
      const grad = ctx.createRadialGradient(gx, gy, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
      grad.addColorStop(0, '#0a0520');
      grad.addColorStop(0.5, '#070318');
      grad.addColorStop(1, '#030112');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Nebulae...
      const n1x = width * 0.3 - scrollY * 0.02;
      const n1y = height * 0.4 - scrollY * 0.03;
      const n1Grad = ctx.createRadialGradient(n1x, n1y, 0, n1x, n1y, 350);
      n1Grad.addColorStop(0, 'rgba(80, 23, 85, 0.06)');
      n1Grad.addColorStop(0.5, 'rgba(80, 23, 85, 0.02)');
      n1Grad.addColorStop(1, 'transparent');
      ctx.fillStyle = n1Grad;
      ctx.fillRect(0, 0, width, height);

      const n2x = width * 0.75 - scrollY * 0.015;
      const n2y = height * 0.65 - scrollY * 0.025;
      const n2Grad = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, 300);
      n2Grad.addColorStop(0, 'rgba(0, 180, 212, 0.04)');
      n2Grad.addColorStop(0.5, 'rgba(0, 180, 212, 0.015)');
      n2Grad.addColorStop(1, 'transparent');
      ctx.fillStyle = n2Grad;
      ctx.fillRect(0, 0, width, height);

      // Draw stars (same as before)
      for (const s of stars) {
        const layer = LAYERS[s.layer];
        const pulse = Math.sin(time * s.pulseSpeed + s.pulseOffset);
        const opacity = s.opacity * (0.5 + 0.5 * pulse);

        const py = s.y - scrollY * layer.speed + s.layerOffset * layer.speed;
        const px = s.x + Math.sin(time * 0.0002 + s.pulseOffset) * (s.layer + 1) * 0.5;

        let drawY = py;
        if (drawY < -10) drawY += height + 20;
        if (drawY > height + 10) drawY -= height + 20;

        const glow = ctx.createRadialGradient(px, drawY, 0, px, drawY, s.r * 5);
        glow.addColorStop(0, layer.color + (opacity * 0.5) + ')');
        glow.addColorStop(0.3, layer.color + (opacity * 0.15) + ')');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, drawY, s.r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = layer.color + opacity + ')';
        ctx.beginPath();
        ctx.arc(px, drawY, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.5 && opacity > 0.6) {
          ctx.strokeStyle = layer.color + (opacity * 0.15) + ')';
          ctx.lineWidth = 0.5;
          const flare = s.r * 3;
          ctx.beginPath();
          ctx.moveTo(px - flare, drawY);
          ctx.lineTo(px + flare, drawY);
          ctx.moveTo(px, drawY - flare);
          ctx.lineTo(px, drawY + flare);
          ctx.stroke();
        }
      }

      requestAnimationFrame(drawStars);
    }

    // ==================== FIXED TIMING ====================
    resizeCanvas();                    // First attempt
    requestAnimationFrame(drawStars);

    window.addEventListener('resize', resizeCanvas);

    // Multiple fallback triggers — this usually solves the huge stars issue
    window.addEventListener('load', () => {
      setTimeout(resizeCanvas, 10);
      setTimeout(resizeCanvas, 100);
      setTimeout(resizeCanvas, 300);
    });

    // Also try after a short delay in case of heavy layout
    setTimeout(resizeCanvas, 200);

    // Scroll parallax
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          scrollY = window.pageYOffset;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStarfield);
  } else {
    initStarfield();
  }
})();