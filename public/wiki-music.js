(() => {
  if (window.__tntWikiMusic) return;
  const root = document.querySelector('[data-wiki-music]');
  if (!root) return;
  const audios = Array.from(root.querySelectorAll('[data-wiki-audio]'));
  if (audios.length < 2) return;
  const toggle = root.querySelector('[data-wiki-music-toggle]');
  const label = root.querySelector('[data-wiki-music-label]');
  const STORAGE_KEY = 'tnt-wiki-music';
  const MASTER = 0.5;
  const FADE_SECONDS = 3;
  let on = localStorage.getItem(STORAGE_KEY) !== 'off';
  let current = 0;
  let switching = false;
  let unlocked = false;
  let ticker = 0;
  let crossfadeTimer = 0;

  const setUI = () => {
    root.classList.toggle('is-off', !on);
    if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (label) label.textContent = on ? '音乐 开' : '音乐 关';
  };

  const fade = (audio, from, to, ms) => {
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const crossfade = () => {
    if (switching) return;
    switching = true;
    const outgoing = audios[current];
    const incoming = audios[1 - current];
    try {
      incoming.pause();
      incoming.currentTime = 0;
    } catch (e) {
      // ignore
    }
    incoming.volume = 0;
    const playPromise = incoming.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
    fade(outgoing, MASTER, 0, FADE_SECONDS * 1000);
    fade(incoming, 0, MASTER, FADE_SECONDS * 1000);
    window.clearTimeout(crossfadeTimer);
    crossfadeTimer = window.setTimeout(() => {
      try {
        outgoing.pause();
        outgoing.currentTime = 0;
      } catch (e) {
        // ignore
      }
      outgoing.volume = 0;
      current = 1 - current;
      switching = false;
    }, FADE_SECONDS * 1000 + 80);
  };

  const tick = () => {
    if (!on || switching) return;
    const audio = audios[current];
    if (!audio || audio.paused || !Number.isFinite(audio.duration)) return;
    if (audio.duration - audio.currentTime <= FADE_SECONDS) crossfade();
  };

  const start = () => {
    const audio = audios[current];
    if (!audio) return;
    audio.volume = MASTER;
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
    if (!ticker) ticker = window.setInterval(tick, 250);
  };

  const stop = () => {
    if (ticker) {
      window.clearInterval(ticker);
      ticker = 0;
    }
    window.clearTimeout(crossfadeTimer);
    audios.forEach((audio) => {
      audio.pause();
    });
  };

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    if (on) start();
  };

  toggle?.addEventListener('click', () => {
    on = !on;
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    setUI();
    if (on) start();
    else stop();
  });

  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-age-enter]')) {
      unlock();
      if (on) start();
    }
  });

  setUI();
  if (on) start();
  window.__tntWikiMusic = true;
})();
