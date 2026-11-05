// Runs inside the YouTube page itself (MAIN world). Forces the player's video element(s) to
// the chosen speed with pitch keeping OFF (plain resample, smooth; the extension corrects
// the pitch afterwards). YouTube's own rate writes are remembered and restored when we stop.
(() => {
  if (window.__fasterSlowerRate) return;
  window.__fasterSlowerRate = true;

  const proto = HTMLMediaElement.prototype;
  const rateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  const pitchDesc = Object.getOwnPropertyDescriptor(proto, 'preservesPitch');
  const origPlay = proto.play;
  const els = new Set();
  const pageRate = new WeakMap();
  let forced = 1; // 1 = not forcing

  const nativeRate = (el) => rateDesc.get.call(el);

  function applyTo(el) {
    const on = forced !== 1;
    const target = on ? forced : (pageRate.get(el) ?? 1);
    try {
      if (pitchDesc) pitchDesc.set.call(el, !on);
      if (nativeRate(el) !== target) rateDesc.set.call(el, target);
    } catch {}
  }

  function track(el) {
    if (!els.has(el)) {
      els.add(el);
      // A new video resets the rate to defaultPlaybackRate: put ours back.
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
    // Report the real rate so the page's own clock and progress bar stay right.
    get() { return nativeRate(this); },
    // YouTube reads the rate back and writes it again (new video, ads). That echo of our own
    // forced rate is not the viewer's choice: don't remember it, or turning off would keep it.
    set(v) {
      if (!(forced !== 1 && Number(v) === forced)) pageRate.set(this, v);
      track(this);
    },
  });

  proto.play = function (...args) {
    track(this);
    return origPlay.apply(this, args);
  };

  document.addEventListener('fasterslower:rate', (e) => {
    const r = Number(e.detail);
    forced = r > 0 ? r : 1;
    document.querySelectorAll('audio, video').forEach(track);
    els.forEach(applyTo);
  });
})();
