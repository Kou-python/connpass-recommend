'use strict';

(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const canvas = document.getElementById('cursor-fx');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('cursor-fx: 2D context unavailable');
    return;
  }

  const MAX_PARTICLES = 150;
  const particles = [];
  let W = 0, H = 0, dpr = 1;
  let accentColor = '#58a6ff';

  function readAccentColor() {
    accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#58a6ff';
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();
  readAccentColor();

  new MutationObserver(readAccentColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function Particle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
    this.size = 2 + Math.random() * 3;
  }

  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;
    this.life -= this.decay;
  };

  Particle.prototype.draw = function () {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, this.size * this.life), 0, Math.PI * 2);
    ctx.fill();
  };

  window.addEventListener('mousemove', function (e) {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      particles.push(new Particle(e.clientX, e.clientY));
    }
  });

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw();
      if (particles[i].life <= 0) {
        particles.splice(i, 1);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }

  loop();
})();
