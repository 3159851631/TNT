(() => {
  let cleanups = [];

  const initWiki = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  const listRoot = document.querySelector('[data-wiki-list]');
  if (listRoot) {
    const search = listRoot.querySelector('[data-wiki-search]');
    const chips = Array.from(listRoot.querySelectorAll('[data-wiki-chip]'));
    const items = Array.from(listRoot.querySelectorAll('[data-wiki-item]'));
    const count = listRoot.querySelector('[data-wiki-count]');
    let active = '全部';

    const apply = () => {
      const query = (search?.value || '').trim().toLowerCase();
      let shown = 0;
      items.forEach((el) => {
        const name = (el.dataset.name || '').toLowerCase();
        const type = (el.dataset.type || el.dataset.category || '').toLowerCase();
        const region = (el.dataset.region || '').toLowerCase();
        const text = (el.textContent || '').toLowerCase();
        const matchesQuery = !query || name.includes(query) || type.includes(query) || region.includes(query) || text.includes(query);
        const matchesType = active === '全部' || el.dataset.type === active || el.dataset.category === active;
        const show = matchesQuery && matchesType;
        el.style.display = show ? '' : 'none';
        if (show) shown += 1;
      });
      if (count) count.textContent = `${shown} / ${items.length}`;
    };

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        active = chip.dataset.wikiChip || '全部';
        apply();
      });
    });
    search?.addEventListener('input', apply);
    apply();
  }

  const searchPage = document.querySelector('[data-wiki-search-page]');
  if (searchPage) {
    const form = searchPage.querySelector('form');
    const input = searchPage.querySelector('input[name="q"]');
    const results = searchPage.querySelector('[data-wiki-results]');
    const empty = searchPage.querySelector('[data-wiki-empty]');
    let index = [];

    const params = new URLSearchParams(window.location.search);
    if (input) input.value = params.get('q') || '';

    const render = () => {
      if (!results) return;
      const query = (input?.value || '').trim().toLowerCase();
      if (!query) {
        results.innerHTML = '';
        if (empty) empty.textContent = '输入关键词，搜索区域、角色、怪物、物品和剧情。';
        return;
      }
      const hits = index
        .filter((item) => {
          const name = (item.name || '').toLowerCase();
          const sub = (item.sub || '').toLowerCase();
          const alias = (item.alias || '').toLowerCase();
          return name.includes(query) || sub.includes(query) || alias.includes(query) || String(item.type).includes(query);
        })
        .slice(0, 150);
      results.innerHTML = hits
        .map(
          (item) =>
            `<a class="wiki-search-result" href="${escapeHtml(item.url)}"><span class="wiki-search-result__type">${escapeHtml(item.type)}</span><span class="wiki-search-result__name">${escapeHtml(item.name)}</span><span class="wiki-search-result__sub">${escapeHtml(item.sub || '')}</span></a>`
        )
        .join('');
      if (empty) empty.textContent = hits.length ? '' : '没有找到匹配条目。';
    };

    fetch('/wiki-search.json')
      .then((response) => response.json())
      .then((data) => {
        index = data;
        render();
      })
      .catch(() => {
        if (empty) empty.textContent = '搜索索引加载失败，请刷新页面。';
      });

    input?.addEventListener('input', render);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = (input?.value || '').trim();
      history.replaceState(null, '', `/wiki/search/?q=${encodeURIComponent(query)}`);
      render();
    });
  }

  const hero = document.querySelector('[data-wiki-hero]');
  if (hero) {
    const slides = Array.from(hero.querySelectorAll('[data-wiki-hero-slide]'));
    if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let heroIndex = 0;
      const heroTimer = window.setInterval(() => {
        slides[heroIndex].classList.remove('is-active');
        heroIndex = (heroIndex + 1) % slides.length;
        slides[heroIndex].classList.add('is-active');
      }, 7000);
      cleanups.push(() => window.clearInterval(heroTimer));
    }
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'wiki-tooltip';
  document.body.appendChild(tooltip);
  cleanups.push(() => tooltip.remove());
  const tipTargets = Array.from(document.querySelectorAll('[data-tooltip]'));
  tipTargets.forEach((target) => {
    const show = (event) => {
      tooltip.textContent = target.dataset.tooltip || '';
      tooltip.classList.add('is-visible');
      move(event);
    };
    const move = (event) => {
      const x = Math.min(window.innerWidth - 300, event.clientX + 18);
      const y = Math.min(window.innerHeight - 90, event.clientY + 18);
      tooltip.style.left = `${Math.max(10, x)}px`;
      tooltip.style.top = `${Math.max(10, y)}px`;
    };
    target.addEventListener('pointerenter', show);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerleave', () => tooltip.classList.remove('is-visible'));
    cleanups.push(() => {
      target.removeEventListener('pointerenter', show);
      target.removeEventListener('pointermove', move);
    });
  });

  const avatarDrawer = document.querySelector('[data-wiki-avatar-drawer]');
  if (avatarDrawer) {
    const grid = avatarDrawer.querySelector('[data-wiki-avatar-grid]');
    const toggle = document.querySelector('[data-wiki-avatar-toggle]');
    const label = toggle?.querySelector('[data-wiki-avatar-toggle-label]');
    const avatars = grid ? Array.from(grid.querySelectorAll('.wiki-avatar')) : [];
    let open = false;
    let frame = 0;

    const rowStarts = () => {
      const tops = [];
      avatars.forEach((el) => {
        if (!tops.includes(el.offsetTop)) tops.push(el.offsetTop);
      });
      return tops.sort((a, b) => a - b);
    };

    const apply = (animate) => {
      if (!grid || !toggle) return;
      const tops = rowStarts();
      const hasMore = tops.length > 2;
      toggle.hidden = !hasMore;
      if (!hasMore) {
        avatarDrawer.style.maxHeight = '';
        avatarDrawer.classList.remove('is-open');
        return;
      }
      if (!animate) avatarDrawer.style.transition = 'none';
      const fullHeight = grid.offsetTop + grid.offsetHeight;
      avatarDrawer.style.maxHeight = `${open ? fullHeight : tops[2]}px`;
      avatarDrawer.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? '收起角色列表' : `展开全部 ${avatars.length} 位角色`;
      if (!animate) {
        void avatarDrawer.offsetHeight;
        avatarDrawer.style.transition = '';
      }
    };

    const onToggle = () => {
      open = !open;
      apply(true);
      if (!open) {
        window.setTimeout(() => toggle.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 560);
      }
    };

    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => apply(false));
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    observer?.observe(grid);

    toggle?.addEventListener('click', onToggle);
    window.addEventListener('resize', onResize);
    apply(false);

    cleanups.push(() => {
      toggle?.removeEventListener('click', onToggle);
      window.removeEventListener('resize', onResize);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      avatarDrawer.style.maxHeight = '';
    });
  }

  const videoButtons = Array.from(document.querySelectorAll('[data-wiki-video-play]'));
  videoButtons.forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      const cover = button.closest('.wiki-video__cover');
      if (!cover) return;
      const provider = button.dataset.provider || 'bilibili';
      if (provider === 'local' && button.dataset.local) {
        const videoEl = document.createElement('video');
        videoEl.className = 'wiki-video__player';
        videoEl.controls = true;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.preload = 'metadata';
        videoEl.src = button.dataset.local;
        cover.innerHTML = '';
        cover.appendChild(videoEl);
        return;
      }
      const bvid = button.dataset.bvid || '';
      const youtubeId = button.dataset.youtube || '';
      if (provider === 'youtube' && !youtubeId) return;
      if (provider !== 'youtube' && !bvid) return;
      const iframe = document.createElement('iframe');
      iframe.className = 'wiki-video__player';
      iframe.loading = 'lazy';
      iframe.title = button.dataset.title || '视频播放器';
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
      iframe.setAttribute('allowfullscreen', '');
      iframe.src =
        provider === 'youtube'
          ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0`
          : `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&high_quality=1&danmaku=0&autoplay=1`;
      cover.innerHTML = '';
      cover.appendChild(iframe);
    });
  });

  const viewer = document.querySelector('[data-wiki-map]');
  if (viewer) {
    const layers = Array.from(viewer.querySelectorAll('[data-wiki-map-layer]'));
    const image = layers[0];
    const reset = document.querySelector('[data-wiki-map-reset]');
    const zoomIn = document.querySelector('[data-wiki-map-in]');
    const zoomOut = document.querySelector('[data-wiki-map-out]');
    const layerButtons = Array.from(viewer.querySelectorAll('[data-wiki-map-toggle]'));
    let scale = 0.7;
    let x = 0;
    let y = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const apply = () => {
      layers.forEach((layer) => {
        layer.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
      });
    };
    const setScale = (value) => {
      scale = Math.max(0.6, Math.min(6, value));
      apply();
    };

    viewer.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        setScale(scale * (event.deltaY < 0 ? 1.14 : 0.88));
      },
      { passive: false }
    );

    viewer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, a, input, select, textarea, .wiki-map-layers, .wiki-map-controls')) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = x;
      originY = y;
      viewer.classList.add('is-dragging');
      viewer.setPointerCapture?.(event.pointerId);
    });
    viewer.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      x = originX + (event.clientX - startX);
      y = originY + (event.clientY - startY);
      apply();
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      viewer.classList.remove('is-dragging');
      if (event && viewer.hasPointerCapture?.(event.pointerId)) {
        viewer.releasePointerCapture(event.pointerId);
      }
    };
    viewer.addEventListener('pointerup', endDrag);
    viewer.addEventListener('pointercancel', endDrag);

    zoomIn?.addEventListener('click', () => setScale(scale * 1.2));
    zoomOut?.addEventListener('click', () => setScale(scale / 1.2));
    layerButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.wikiMapToggle;
        layers.forEach((layer) => layer.classList.toggle('is-active', layer.dataset.wikiMapLayer === target));
        layerButtons.forEach((btn) => {
          const active = btn === button;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });
    reset?.addEventListener('click', () => {
      scale = 1;
      x = 0;
      y = 0;
      apply();
    });
    apply();
  }
  };

  document.addEventListener('astro:page-load', initWiki);
  if (document.readyState !== 'loading') initWiki();
})();
