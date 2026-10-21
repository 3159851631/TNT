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
          return name.includes(query) || sub.includes(query) || String(item.type).includes(query);
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
