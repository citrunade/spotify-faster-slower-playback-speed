// Runs in the Spotify page itself (MAIN world). Forces the player's media
// element(s) to the chosen speed with pitch keeping OFF (plain resample, no chop).
// Spotify's own rate writes are remembered and restored when we turn off.
(() => {
  if (window.__spotifyStretchRate) return;
  window.__spotifyStretchRate = true;

  const proto = HTMLMediaElement.prototype;
  const rateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  const pitchDesc = Object.getOwnPropertyDescriptor(proto, 'preservesPitch');
  const origPlay = proto.play;
  const els = new Set();
  const pageRate = new WeakMap();
  let forced = 1; // 1 = not forcing
  // Light mode (sound not captured): keep Chrome's own pitch keeping on while forcing the rate.
  let keepPitch = false;

  const nativeRate = (el) => rateDesc.get.call(el);

  function applyTo(el) {
    const on = forced !== 1;
    const target = on ? forced : (pageRate.get(el) ?? 1);
    try {
      if (pitchDesc) pitchDesc.set.call(el, !on || keepPitch);
      if (nativeRate(el) !== target) rateDesc.set.call(el, target);
    } catch {}
  }

  function track(el) {
    if (!els.has(el)) {
      els.add(el);
      // Loading a new track resets the rate to defaultPlaybackRate: put ours back.
      el.addEventListener('ratechange', () => {
        if (forced !== 1 && nativeRate(el) !== forced) applyTo(el);
      });
      el.addEventListener('loadstart', () => applyTo(el));
    }
    applyTo(el);
  }

  Object.defineProperty(proto, 'playbackRate', {
    configurable: true,
    enumerable: rateDesc.enumerable,
    // Report the real rate: Spotify moves its progress bar by it, so hiding it froze the bar.
    get() { return nativeRate(this); },
    set(v) { pageRate.set(this, v); track(this); },
  });

  proto.play = function (...args) {
    track(this);
    return origPlay.apply(this, args);
  };

  document.addEventListener('spotifystretch:rate', (e) => {
    // detail: "<rate>" (full engine corrects the pitch) or "<rate>|light" (Chrome keeps it).
    const [rs, mode] = String(e.detail).split('|');
    keepPitch = mode === 'light';
    const r = Number(rs);
    forced = r > 0 ? r : 1;
    document.querySelectorAll('audio, video').forEach(track);
    els.forEach(applyTo);
  });
})();
