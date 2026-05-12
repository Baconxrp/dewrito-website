(function($) {
	'use strict';

	$(window).on('load', function() {
		// Starfield canvas
		const canvas = document.createElement('canvas');
		canvas.id = 'starfield-canvas';
		canvas.style.position = 'fixed';
		canvas.style.top = '0';
		canvas.style.left = '0';
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.zIndex = '-1';
		document.body.prepend(canvas);

		const ctx = canvas.getContext('2d');
		let stars = [];
		let width, height;
		let scrollY = 0;

		// Three parallax layers: far (slow), mid (medium), near (fast)
		const LAYERS = [
			{ count: 180, minR: 0.2, maxR: 0.8, speed: 0.03, color: 'rgba(180,160,220,' },
			{ count: 100, minR: 0.5, maxR: 1.4, speed: 0.08, color: 'rgba(203,160,240,' },
			{ count: 40,  minR: 1.0, maxR: 2.2, speed: 0.18, color: 'rgba(255,220,255,' }
		];

		function resize() {
			width = canvas.width = window.innerWidth;
			height = canvas.height = window.innerHeight;
		}

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
						pulseSpeed: Math.random() * 0.025 + 0.005,
						pulseOffset: Math.random() * Math.PI * 2,
						layerOffset: Math.random() * 200 // for parallax drift
					});
				}
				idx++;
			}
		}

		function drawStars(time) {
			ctx.clearRect(0, 0, width, height);

			// Deep space gradient — shifts subtly with scroll for depth
			const scrollShift = scrollY * 0.0003;
			const gx = width / 2 + scrollShift * 200;
			const gy = height / 2 + scrollShift * 100;
			const grad = ctx.createRadialGradient(gx, gy, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
			grad.addColorStop(0, '#0a0520');
			grad.addColorStop(0.5, '#070318');
			grad.addColorStop(1, '#030112');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, width, height);

			// Nebulae — shift with scroll for parallax depth
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
			n2Grad.addColorStop(0, 'rgba(232, 75, 154, 0.04)');
			n2Grad.addColorStop(0.5, 'rgba(232, 75, 154, 0.015)');
			n2Grad.addColorStop(1, 'transparent');
			ctx.fillStyle = n2Grad;
			ctx.fillRect(0, 0, width, height);

			// Draw stars per layer
			for (const s of stars) {
				const layer = LAYERS[s.layer];
				const pulse = Math.sin(time * s.pulseSpeed + s.pulseOffset);
				const opacity = s.opacity * (0.5 + 0.5 * pulse);

				// Parallax Y offset
				const py = s.y - scrollY * layer.speed + s.layerOffset * layer.speed;
				const px = s.x + Math.sin(time * 0.0002 + s.pulseOffset) * (s.layer + 1) * 0.5;

				// Wrap stars that go off screen
				let drawY = py;
				if (drawY < -10) drawY += height + 20;
				if (drawY > height + 10) drawY -= height + 20;

				// Star glow
				const glow = ctx.createRadialGradient(px, drawY, 0, px, drawY, s.r * 5);
				glow.addColorStop(0, layer.color + (opacity * 0.5) + ')');
				glow.addColorStop(0.3, layer.color + (opacity * 0.15) + ')');
				glow.addColorStop(1, 'transparent');
				ctx.fillStyle = glow;
				ctx.beginPath();
				ctx.arc(px, drawY, s.r * 5, 0, Math.PI * 2);
				ctx.fill();

				// Star core
				ctx.fillStyle = layer.color + opacity + ')';
				ctx.beginPath();
				ctx.arc(px, drawY, s.r, 0, Math.PI * 2);
				ctx.fill();

				// Bright stars get a cross flare
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

		resize();
		createStars();
		requestAnimationFrame(drawStars);

		window.addEventListener('resize', () => {
			resize();
			createStars();
		});
	});

	// CRT / scanline overlay
	$(window).on('load', function() {
		const overlay = document.createElement('div');
		overlay.id = 'crt-overlay';
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.width = '100%';
		overlay.style.height = '100%';
		overlay.style.zIndex = '9999';
		overlay.style.pointerEvents = 'none';
		overlay.style.background = 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)';
		document.body.appendChild(overlay);
	});

	// Parallax scroll for page elements
	$(window).on('scroll', function() {
		scrollY = $(window).scrollTop();

		// Hero logo parallax — moves slower than scroll (floats down)
		const logo = $('.dewrito-logo-img');
		if (logo.length) {
			const heroH = $('.hero-section').outerHeight() || 600;
			const progress = Math.min(scrollY / heroH, 1);
			logo.css('transform', `translateY(${progress * 80}px) scale(${1 - progress * 0.15})`);
			logo.css('opacity', 1 - progress * 0.8);
		}

		// Hero text parallax — moves slightly faster (floats up)
		const heroText = $('.hero-text-wrapper');
		if (heroText.length) {
			const heroH = $('.hero-section').outerHeight() || 600;
			const progress = Math.min(scrollY / heroH, 1);
			heroText.css('transform', `translateY(${progress * -30}px)`);
			heroText.css('opacity', 1 - progress * 0.6);
		}

		// Intro boxes parallax — subtle float
		$('.intro-text-box').each(function(i) {
			const box = $(this);
			const rect = box[0].getBoundingClientRect();
			if (rect.top < window.innerHeight && rect.bottom > 0) {
				const dist = window.innerHeight - rect.top;
				const factor = (dist / window.innerHeight) * 0.05 * (i % 2 === 0 ? 1 : -1);
				box.css('transform', `translateY(${factor * 20}px)`);
			}
		});

		// Blog / featured boxes subtle parallax
		$('.featured-box').each(function() {
			const box = $(this);
			const rect = box[0].getBoundingClientRect();
			if (rect.top < window.innerHeight && rect.bottom > 0) {
				const dist = window.innerHeight - rect.top;
				const factor = (dist / window.innerHeight) * 0.03;
				box.css('transform', `translateY(${factor * 15}px)`);
			}
		});
	});
})(jQuery);
