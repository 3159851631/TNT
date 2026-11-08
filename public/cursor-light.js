/**
 * 光标系统 — 中世纪罗盘式准星 + 实时坐标 + 淡暖色光迹 + 左键柔光。
 *
 * 约束：
 *  - 只在精确指针设备（鼠标/笔）启用；触屏站完全不动
 *  - 尊重 prefers-reduced-motion
 *  - 光迹空闲即停 rAF；准星只用 transform，不触发布局
 *  - devicePixelRatio 上限 2
 *  - 原生光标只在脚本成功接管后才隐藏（脚本挂了仍然有箭头）
 */
(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__tntCursorLight) return;
  window.__tntCursorLight = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduceMotion.matches || !finePointer.matches) return;

  const ROSE = '201,138,134';
  const ROSE_LIGHT = '224,164,156';
  const GOLD = '198,164,104';

  const TRAIL_LIFE = 420;
  const TRAIL_MAX = 30;
  const PARTICLE_MAX = 64;
  const PARTICLE_EVERY = 38;
  const CLICK_LIFE = 560;

  /* ---------------- 样式 ---------------- */
  const CSS = `
html.tnt-cur-on, html.tnt-cur-on * { cursor: none !important; }
html.tnt-cur-on input, html.tnt-cur-on textarea, html.tnt-cur-on select,
html.tnt-cur-on [contenteditable="true"] { cursor: text !important; }

.tnt-cur {
  position: fixed; left: 0; top: 0; width: 0; height: 0;
  z-index: 400; pointer-events: none;
  will-change: transform;
  filter: drop-shadow(0 0 1.5px rgba(0,0,0,.6)) drop-shadow(0 0 6px rgba(8,7,12,.4));
}
.tnt-cur__ring {
  position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px;
  border: 1.5px solid rgba(${GOLD},.6); border-radius: 50%;
  transition: width .22s var(--ease, ease), height .22s var(--ease, ease),
              margin .22s var(--ease, ease), border-color .22s, background .22s;
}
.tnt-cur__ring::before {
  content: ""; position: absolute; inset: 4px;
  border: 1px solid rgba(${ROSE_LIGHT},.2); border-radius: 50%;
}
.tnt-cur__cross { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.tnt-cur__cross::before, .tnt-cur__cross::after {
  content: ""; position: absolute; background: rgba(${GOLD},.4); transition: background .22s;
}
.tnt-cur__cross::before { left: -12px; top: -.5px; width: 24px; height: 1px; }
.tnt-cur__cross::after { left: -.5px; top: -12px; width: 1px; height: 24px; }
.tnt-cur__dot {
  position: absolute; left: 0; top: 0; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px;
  border-radius: 50%; background: #${'e0a49c'};
  box-shadow: 0 0 7px rgba(${ROSE_LIGHT},.85);
  transition: width .22s, height .22s, margin .22s;
}
.tnt-cur__coord {
  position: absolute; left: 15px; top: 13px;
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 9px; letter-spacing: .1em; white-space: nowrap;
  color: rgba(${GOLD},.55); text-shadow: 0 1px 3px rgba(0,0,0,.85);
}
.tnt-cur__coord i { font-style: normal; color: rgba(${ROSE_LIGHT},.5); margin-right: 4px; }
.tnt-cur__coord b { font-weight: 400; color: rgba(231,223,210,.6); margin-right: 9px; font-variant-numeric: tabular-nums; }

html.tnt-hover .tnt-cur__ring {
  width: 48px; height: 48px; margin: -24px 0 0 -24px;
  border-color: rgba(${ROSE_LIGHT},.9); background: rgba(${GOLD},.07);
}
html.tnt-hover .tnt-cur__ring::before { border-color: rgba(${ROSE_LIGHT},.4); }
html.tnt-hover .tnt-cur__cross::before, html.tnt-hover .tnt-cur__cross::after { background: rgba(${ROSE_LIGHT},.5); }
html.tnt-hover .tnt-cur__dot { width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; }

html.tnt-down .tnt-cur__ring {
  width: 16px; height: 16px; margin: -8px 0 0 -8px;
  border-color: rgba(${ROSE_LIGHT},1); background: rgba(${ROSE_LIGHT},.18);
}

@media (prefers-reduced-motion: reduce) {
  .tnt-cur__ring, .tnt-cur__dot { transition: none; }
}
`;

  function injectStyle() {
    if (document.getElementById('tnt-cur-style')) return;
    const s = document.createElement('style');
    s.id = 'tnt-cur-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- 准星 ---------------- */
  let curEl = null;
  let cxEl = null;
  let cyEl = null;

  function buildCursor() {
    if (curEl && curEl.isConnected) return;
    injectStyle();
    const el = document.createElement('div');
    el.className = 'tnt-cur';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<span class="tnt-cur__ring"></span>' +
      '<span class="tnt-cur__cross"></span>' +
      '<span class="tnt-cur__dot"></span>' +
      '<span class="tnt-cur__coord"><i>X</i><b data-cx>0000</b><i>Y</i><b data-cy>0000</b></span>';
    document.body.appendChild(el);
    curEl = el;
    cxEl = el.querySelector('[data-cx]');
    cyEl = el.querySelector('[data-cy]');
    document.documentElement.classList.add('tnt-cur-on');
  }

  const pad4 = (n) => String(Math.max(0, Math.round(n))).padStart(4, '0');

  /* ---------------- 光迹画布 ---------------- */
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
  let lastDraw = 0;
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
    initEmbers();
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected && ctx) return;
    const c = document.createElement('canvas');
    c.setAttribute('data-tnt-cursor-light', '');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:19;';
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

  /* ---------------- 萤火 / 火星 ---------------- */
  let sprite = null;
  const embers = [];

  function makeSprite() {
    const s = document.createElement('canvas');
    s.width = 32;
    s.height = 32;
    const g2 = s.getContext('2d');
    const grd = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255, 244, 220, 1)');
    grd.addColorStop(0.32, 'rgba(226, 168, 108, 0.5)');
    grd.addColorStop(1, 'rgba(196, 116, 74, 0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 32, 32);
    return s;
  }

  function newEmber(anywhere) {
    const depth = Math.random();
    return {
      x: Math.random() * vw,
      y: anywhere ? Math.random() * vh : vh + rand(10, 60),
      vx: rand(-0.06, 0.06),
      vy: rand(-0.3, -0.09) * (0.55 + depth),
      base: rand(-0.3, -0.09) * (0.55 + depth),
      depth,
      phase: Math.random() * Math.PI * 2,
      sway: rand(0.0003, 0.001),
      flick: rand(0.0015, 0.004),
      size: 1.5 + depth * 2.7,
    };
  }

  function initEmbers() {
    embers.length = 0;
    window.__tntEmbers = embers;
    if (!vw || !vh) return;
    const count = Math.max(16, Math.min(64, Math.round((vw * vh) / 22000)));
    for (let i = 0; i < count; i += 1) embers.push(newEmber(true));
  }

  function drawEmbers(t, dt) {
    if (!sprite) sprite = makeSprite();
    const R = 155;
    const step = dt * 0.06;
    for (let i = 0; i < embers.length; i += 1) {
      const e = embers[i];
      e.phase += e.sway * dt;

      // 鼠标靠近 → 往外吹散
      if (hasPointer && t - lastMove < 4000) {
        const dx = e.x - pointer.x;
        const dy = e.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * (1 - d / R) * 4.4;
          e.vx += (dx / d) * f;
          e.vy += (dy / d) * f * 0.7;
        }
      }

      // 慢慢回到原来的上飘速度
      e.vx *= 0.93;
      e.vy += (e.base - e.vy) * 0.035;

      e.x += (e.vx + Math.sin(e.phase * 2.4) * 0.09) * step;
      e.y += e.vy * step;

      if (e.y < -40) {
        embers[i] = newEmber(false);
        continue;
      }
      if (e.x < -40) e.x = vw + 40;
      else if (e.x > vw + 40) e.x = -40;

      const flick = 0.6 + 0.4 * Math.sin(t * e.flick + e.phase * 3);
      const a = (0.2 + e.depth * 0.4) * flick;
      const s = e.size * (1 + e.depth * 0.55);
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, e.x - s, e.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawTrail(t) {
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const k = 1 - (t - b.t) / TRAIL_LIFE;
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
    const a = 0.11 * (1 - idle);
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

    const busy =
      trail.length > 1 || particles.length > 0 || flashes.length > 0 || t - lastMove < 240;

    // 只有萤火在飘时降到约 30fps，省电
    if (!busy && t - lastDraw < 34) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    lastDraw = t;

    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';

    while (trail.length && trail[0] && t - trail[0].t > TRAIL_LIFE) trail.shift();

    drawEmbers(t, dt);
    drawTrail(t);
    drawHead(t);
    drawParticles(t, dt);
    drawFlashes(t);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (!document.hidden) rafId = requestAnimationFrame(frame);
    else running = false;
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  /* ---------------- 指针事件 ---------------- */
  let lastTarget = null;
  const INTERACTIVE = 'a,button,input,textarea,select,label,[role="button"],[data-wiki-map],.work-card,.gameart-card,.all-card__button,.social-link,.chip';

  function setCoords(x, y) {
    if (cxEl) cxEl.textContent = pad4(x);
    if (cyEl) cyEl.textContent = pad4(y);
  }

  function moveCursor(x, y) {
    if (!curEl) return;
    curEl.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  function onMove(e) {
    if (ageLocked()) return;
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    buildCursor();
    hasPointer = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    moveCursor(e.clientX, e.clientY);

    const t = now();
    lastMove = t;

    if (e.target !== lastTarget) {
      lastTarget = e.target;
      const hit = e.target && e.target.closest ? e.target.closest(INTERACTIVE) : null;
      document.documentElement.classList.toggle('tnt-hover', !!hit);
    }

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
    buildCursor();
    hasPointer = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    moveCursor(e.clientX, e.clientY);
    lastMove = now();
    document.documentElement.classList.add('tnt-down');
    flashes.push({ x: e.clientX, y: e.clientY, t: now() });
    start();
  }

  function onUp() {
    document.documentElement.classList.remove('tnt-down');
  }

  // 坐标文字用 rAF 节流，避免每个 pointermove 都写 DOM
  let coordRaf = 0;
  let pending = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      pending = { x: e.clientX, y: e.clientY };
      if (coordRaf) return;
      coordRaf = requestAnimationFrame(() => {
        coordRaf = 0;
        if (pending) setCoords(pending.x, pending.y);
      });
    },
    { passive: true }
  );

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });

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

  document.addEventListener('astro:page-load', () => {
    if (reduceMotion.matches) return;
    buildCursor();
    ensureCanvas();
    if (hasPointer) start();
  });

  ensureCanvas();
  start();
})();
