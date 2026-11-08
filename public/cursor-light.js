/**
 * 光标光迹 — 一条很淡的暖色光线 + 小粒子，左键点击闪一下。
 *
 * 设计约束：
 *  - 只在精确指针设备（鼠标/笔）上启用，触屏站不做任何事
 *  - 尊重 prefers-reduced-motion
 *  - 空闲时立刻停止 requestAnimationFrame，不做无用的清屏
 *  - devicePixelRatio 上限 2，避免高分屏上白画几倍像素
 *  - 页面隐藏时暂停
 */
(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__tntCursorLight) return;
  window.__tntCursorLight = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduceMotion.matches || !finePointer.matches) return;

  // 与站点配色一致：玫瑰 / 浅玫瑰 / 金 / 紫
  const ROSE = '201,138,134';
  const ROSE_LIGHT = '224,164,156';
  const GOLD = '198,164,104';

  const TRAIL_LIFE = 420;   // 光线每段存活时间 ms
  const TRAIL_MAX = 30;
  const PARTICLE_MAX = 64;
  const PARTICLE_EVERY = 38; // 粒子生成间隔 ms
  const CLICK_LIFE = 560;

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let vw = 0;
  let vh = 0;
  let running = false;
  let rafId = 0;
  let lastT = 0;
  let nextParticle = 0;
  let lastMove = 0;
  let hasPointer = false;

  const trail = [];
  const particles = [];
  const flashes = [];
  const pointer = { x: 0, y: 0 };

  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const ageLocked = () => document.documentElement.classList.contains('age-locked');

  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected && ctx) return;
    const c = document.createElement('canvas');
    c.setAttribute('data-tnt-cursor-light', '');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText =
      'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:20;';
    document.body.appendChild(c);
    canvas = c;
    ctx = c.getContext('2d', { alpha: true });
    resize();
  }

  function spawnParticle(x, y) {
    if (particles.length >= PARTICLE_MAX) particles.shift();
    particles.push({
      x: x + rand(-6, 6),
      y: y + rand(-6, 6),
      vx: rand(-0.18, 0.18),
      vy: rand(-0.5, -0.12),
      life: 0,
      max: rand(520, 980),
      size: rand(0.7, 1.7),
      c: Math.random() < 0.28 ? GOLD : ROSE_LIGHT,
    });
  }

  function drawTrail(t) {
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const k = 1 - (t - b.t) / TRAIL_LIFE; // 1 = 刚画上去
      if (k <= 0) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 0.4) continue;
      const alpha = 0.36 * Math.pow(k, 1.15);
      if (alpha < 0.006) continue;
      ctx.strokeStyle = `rgba(${b.c || ROSE},${alpha})`;
      ctx.lineWidth = (0.8 + 3.6 * k) * (dist > 26 ? 0.55 : 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawHead(t) {
    const idle = (t - lastMove) / 400;
    if (idle >= 1) return;
    const r = 72;
    const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, r);
    const a = 0.12 * (1 - idle);
    g.addColorStop(0, `rgba(${ROSE_LIGHT},${a})`);
    g.addColorStop(0.5, `rgba(${GOLD},${a * 0.45})`);
    g.addColorStop(1, `rgba(${ROSE_LIGHT},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(pointer.x - r, pointer.y - r, r * 2, r * 2);
  }

  function drawParticles(t, dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      const k = 1 - p.life / p.max;
      ctx.fillStyle = `rgba(${p.c},${0.42 * k * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.55 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlashes(t) {
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const f = flashes[i];
      const k = (t - f.t) / CLICK_LIFE;
      if (k >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - k) * (1 - k);
      const r = 8 + ease * 82;
      const alpha = 0.2 * (1 - k) * (1 - k);

      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(${GOLD},${alpha * 0.7})`);
      g.addColorStop(0.55, `rgba(${ROSE},${alpha * 0.32})`);
      g.addColorStop(1, `rgba(${ROSE},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);

      ctx.strokeStyle = `rgba(${ROSE_LIGHT},${alpha * 0.85})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function frame(ts) {
    rafId = 0;
    ensureCanvas();
    if (!ctx) {
      running = false;
      return;
    }
    const t = ts || now();
    const dt = lastT ? Math.min(48, t - lastT) : 16;
    lastT = t;

    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';

    while (trail.length && t - trail[0].t > TRAIL_LIFE) trail.shift();

    drawTrail(t);
    drawHead(t);
    drawParticles(t, dt);
    drawFlashes(t);

    ctx.globalCompositeOperation = 'source-over';

    const busy =
      trail.length > 1 || particles.length > 0 || flashes.length > 0 || t - lastMove < 220;
    if (busy && !document.hidden) {
      rafId = requestAnimationFrame(frame);
    } else {
      running = false;
      lastT = 0;
      ctx.clearRect(0, 0, vw, vh);
    }
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  function onMove(e) {
    if (ageLocked()) return;
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    hasPointer = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    const t = now();
    lastMove = t;

    trail.push({ x: e.clientX, y: e.clientY, t, c: Math.random() < 0.3 ? GOLD : ROSE });
    if (trail.length > TRAIL_MAX) trail.shift();

    if (t - nextParticle > PARTICLE_EVERY) {
      nextParticle = t;
      spawnParticle(e.clientX, e.clientY);
    }
    start();
  }

  function onDown(e) {
    if (ageLocked()) return;
    if (e.button !== 0) return;
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    hasPointer = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    lastMove = now();
    flashes.push({ x: e.clientX, y: e.clientY, t: now() });
    start();
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 180);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      running = false;
    } else if (hasPointer) {
      start();
    }
  });

  // Wiki 用了 ClientRouter，换页时 canvas 可能被替换掉
  document.addEventListener('astro:page-load', () => {
    if (reduceMotion.matches) return;
    ensureCanvas();
    if (hasPointer) start();
  });

  ensureCanvas();
})();
