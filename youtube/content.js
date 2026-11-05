// Isolated-world bridge: takes the plan (speed, picture delay) from the extension and applies
// it to the page, and reports when an ad is playing (ads play at normal speed).
(() => {
  const picture = new FsPictureDelay();
  let plan = { rate: 1, delay: null };
  let ad = false;

  const setPageRate = (r) => document.dispatchEvent(new CustomEvent('fasterslower:rate', { detail: r }));

  function apply() {
    setPageRate(ad ? 1 : plan.rate);
    picture.setDelay(plan.delay);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.cmd === 'plan') {
      plan = { rate: msg.rate, delay: msg.delay };
      apply();
      // Started in the middle of an ad: say so, so the sound isn't pitch-corrected.
      if (ad && plan.rate !== 1) chrome.runtime.sendMessage({ cmd: 'ad', ad }).catch(() => {});
    }
    if (msg?.cmd === 'ping') reply({ ok: true });
  });

  // YouTube marks the player with "ad-showing" while an ad plays.
  const checkAd = () => {
    const now = !!document.querySelector('.html5-video-player.ad-showing');
    if (now === ad) return;
    ad = now;
    if (plan.rate !== 1) { apply(); chrome.runtime.sendMessage({ cmd: 'ad', ad }).catch(() => {}); }
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; checkAd(); });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // On (re)load, ask whether this tab is the one being processed.
  (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await chrome.runtime.sendMessage({ cmd: 'hello' });
        if (r && 'rate' in r) { plan = { rate: r.rate, delay: r.delay }; apply(); return; }
      } catch {}
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  })();
})();
