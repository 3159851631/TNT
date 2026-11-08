/**
 * 多语言切换：中文 / 英文 / 日文 / 韩文
 * 通过匹配导航链接与常见按钮的原始中文文本来替换，切换后记在 localStorage。
 */
(() => {
  if (window.__tntLang) return;
  window.__tntLang = true;

  const LANGS = [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'EN' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
  ];

  // 导航（按 href 精确匹配）
  const NAV = {
    '/works/': { en: 'Works', ja: '作品', ko: '작품' },
    '/works/all/': { en: 'Archive', ja: '全作品', ko: '전체 작품' },
    '/comics/': { en: 'Comics', ja: '漫画', ko: '만화' },
    '/projects/': { en: 'Projects', ja: 'プロジェクト', ko: '프로젝트' },
    '/videos/': { en: 'Videos', ja: '動画', ko: '영상' },
    '/wiki/': { en: 'Game Wiki', ja: 'ゲーム Wiki', ko: '게임 위키' },
    '/about/': { en: 'About', ja: 'プロフィール', ko: '소개' },
    '/journal/': { en: 'Journal', ja: '日記', ko: '일지' },
    '/resume/': { en: 'Resume', ja: '履歴書', ko: '이력서' },
  };

  // 正文短语（按原始中文精确匹配）
  const TEXT = {
    查看作品: { en: 'View Works', ja: '作品を見る', ko: '작품 보기' },
    关于我: { en: 'About Me', ja: '私について', ko: '소개' },
    显示更多全部作品: { en: 'More works', ja: 'もっと見る', ko: '더 보기' },
    在做的东西: { en: 'In Development', ja: '制作中のもの', ko: '개발 중' },
    图鉴与设定: { en: 'Codex', ja: '図鑑と設定', ko: '도감과 설정' },
    视频: { en: 'Videos', ja: '動画', ko: '영상' },
    关于: { en: 'About', ja: 'プロフィール', ko: '소개' },
    作品: { en: 'Works', ja: '作品', ko: '작품' },
    全部作品: { en: 'Archive', ja: '全作品', ko: '전체 작품' },
    日记: { en: 'Journal', ja: '日記', ko: '일지' },
    个人动态: { en: 'Journal', ja: '日記', ko: '일지' },
    还在做的东西: { en: 'In Development', ja: '制作中', ko: '개발 중' },
    回到顶部: { en: 'Back to top', ja: 'トップへ', ko: '맨 위로' },
    跳到正文: { en: 'Skip to content', ja: '本文へ', ko: '본문으로' },
  };

  const BASE = { en: 'EN', ja: 'JA', ko: 'KO' };

  const store = {
    get() {
      try {
        return localStorage.getItem('tnt-lang') || 'zh';
      } catch (e) {
        return 'zh';
      }
    },
    set(v) {
      try {
        localStorage.setItem('tnt-lang', v);
      } catch (e) {
        /* ignore */
      }
    },
  };

  const original = new WeakMap();

  function remember(el) {
    if (!original.has(el)) original.set(el, el.textContent);
    return original.get(el);
  }

  function apply(lang) {
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);

    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || !NAV[href]) return;
      const zh = remember(a);
      a.textContent = lang === 'zh' ? zh : NAV[href][lang] || zh;
    });

    document.querySelectorAll('a, button, span, p, h3, li').forEach((el) => {
      if (el.children.length > 0) return;
      const zh = (original.get(el) || el.textContent || '').trim();
      if (!TEXT[zh]) return;
      if (!original.has(el)) original.set(el, el.textContent);
      const src = original.get(el);
      const lead = src.match(/^\s*/)[0];
      const tail = src.match(/\s*$/)[0];
      el.textContent = lang === 'zh' ? src : lead + (TEXT[zh][lang] || zh) + tail;
    });

    document.querySelectorAll('[data-lang-btn]').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-lang-btn') === lang);
    });
  }

  function buildSwitch() {
    if (document.querySelector('[data-lang-switch]')) return;
    const box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('data-lang-switch', '');
    box.innerHTML = LANGS.map(
      (l) => `<button type="button" data-lang-btn="${l.code}">${l.label}</button>`
    ).join('');
    document.body.appendChild(box);

    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lang-btn]');
      if (!btn) return;
      const lang = btn.getAttribute('data-lang-btn');
      store.set(lang);
      apply(lang);
    });
  }

  function init() {
    buildSwitch();
    apply(store.get());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
