// Isolated-world bridge: passes the speed from the extension to the page script, and while
// the extension is on adds a speed button to Spotify's player bar (next to Queue / volume)
// that opens the settings panel. On/off itself is the toolbar icon or Alt+Shift+S.
const setRate = (rate, on = rate !== 1, light = false) => {
  document.dispatchEvent(new CustomEvent('spotifystretch:rate', { detail: light ? `${rate}|light` : String(rate) }));
  ui.light = on && light;
  ui.on = on;
  if (on) ui.rate = rate;
  ui.place?.();
  ui.render();
  ui.hintOnce();
};

const ui = {
  on: false,
  shortcut: 'Alt+Shift+S', // the on/off keys as set in Chrome ('' = none)
  speed: 1.25,
  rate: null, // speed actually playing
  tabId: null,
  btn: null,
  frame: null,
  render() {
    if (!this.btn) return;
    // App window, switched off: a dim "Off" that turns it on (there is no toolbar icon there).
    if (!this.on) {
      this.label.textContent = 'Off';
      this.btn.style.color = '';
      this.btn.style.opacity = '.6';
      this.btn.title = 'Faster / Slower is off: click to turn on';
      return;
    }
    this.btn.style.opacity = '';
    const sp = `${Number(this.rate ?? this.speed).toFixed(2).replace(/0$/, '')}×`;
    this.label.textContent = sp;
    this.btn.style.color = '#1ed760';
    this.btn.title = this.light ? `Faster / Slower: speed only in this tab. ${this.howTo()}` : 'Faster / Slower settings';
    // Speed only in this tab: a small amber dot on the button.
    if (!this.dot) {
      this.dot = document.createElement('span');
      this.dot.style.cssText = 'position:absolute;top:4px;right:2px;width:6px;height:6px;border-radius:50%;background:#ffb020;pointer-events:none;';
    }
    if (this.light) { this.btn.style.position = 'relative'; if (this.dot.parentElement !== this.btn) this.btn.appendChild(this.dot); }
    else this.dot.remove();
  },
  // Speed only in this tab: what to do for the smooth sound.
  howTo() {
    const keys = this.shortcut ? `press ${this.shortcut}` : "click the Faster / Slower icon in Chrome's toolbar";
    return `For smooth sound, ${keys} or right-click the page and choose "Faster / Slower: smooth sound in this tab".`;
  },
  // Once per tab (kept through refreshes): say that this tab has the speed only, and how to get
  // the smooth sound. Chrome only lets the user start it, never the extension itself.
  hinted: false,
  hintOnce() {
    if (this.hinted || !this.on || !this.light || window !== window.top) return;
    this.hinted = true;
    try { if (sessionStorage.getItem('ss-hinted')) return; sessionStorage.setItem('ss-hinted', '1'); } catch {}
    this.toast(`Speed only in this tab, which can sound choppy. ${this.howTo()}`, 9000);
  },
  toast(text, ms = 4500) {
    const t = this.toastEl || (this.toastEl = document.createElement('div'));
    t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:2147483647;max-width:70vw;'
      + 'padding:10px 16px;border-radius:8px;background:#2a2a2a;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.5);'
      + 'font:500 13px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none;transition:opacity .25s;';
    if (!t.isConnected) document.documentElement.appendChild(t);
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.opacity = '0'; }, ms);
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.cmd === 'rate') setRate(msg.rate, msg.on, msg.light);
  if (msg?.cmd === 'toast' && window === window.top) { ui.toast(msg.text); ui.render(); }
  if (msg?.cmd === 'ping') reply({ ok: true });
});

chrome.storage.local.get({ speed: 1.25 }).then((s) => { ui.speed = s.speed; ui.render(); });
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.speed) { ui.speed = c.speed.newValue; ui.render(); }
});

// Say hello to the background (which auto-starts the audio). Right after Chrome starts or the
// extension reloads, the background may not be ready yet and the message gets lost: retry.
(async () => {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await chrome.runtime.sendMessage({ cmd: 'hello' });
      if (r?.tabId != null) {
        ui.tabId = r.tabId;
        ui.appWindow = !!r.appWindow;
        if (typeof r.shortcut === 'string') ui.shortcut = r.shortcut;
        if (window === window.top) watchPlayerBar();
        if (r.on || (r.rate && r.rate !== 1)) setRate(r.rate, r.on ?? true, r.light);
        return;
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
})();

function makeButton(template) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'spotify-stretch-button';
  btn.setAttribute('aria-label', 'Faster / Slower speed settings');
  // Borrow Spotify's own button classes so it looks like its neighbours.
  btn.className = template?.className || '';
  Object.assign(btn.style, { minWidth: '36px', width: 'auto', padding: '0 4px', fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' });
  const label = document.createElement('span');
  label.style.pointerEvents = 'none';
  btn.appendChild(label);
  ui.label = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ui.on) { togglePanel(); return; }
    ui.label.textContent = '…';
    chrome.runtime.sendMessage({ cmd: 'toggle', tabId: ui.tabId }).catch(() => {});
  });
  return btn;
}

function togglePanel() {
  if (!ui.frame) {
    const f = document.createElement('iframe');
    f.src = chrome.runtime.getURL(`popup.html?tab=${ui.tabId}${ui.appWindow ? '&app=1' : ''}`);
    Object.assign(f.style, {
      position: 'fixed', zIndex: '2147483647', width: '280px', height: '460px', border: '0',
      borderRadius: '10px', boxShadow: '0 6px 24px rgba(0,0,0,.6)', background: '#121212', display: 'none',
    });
    document.documentElement.appendChild(f);
    ui.frame = f;
    document.addEventListener('click', () => { f.style.display = 'none'; });
    const origin = new URL(chrome.runtime.getURL('')).origin;
    window.addEventListener('message', (e) => {
      if (e.origin !== origin || !e.data?.spotifyStretchHeight) return;
      // Fit above the player bar; the panel scrolls inside if the window is short.
      const room = (ui.btn?.getBoundingClientRect().top ?? innerHeight) - 18;
      f.style.height = `${Math.min(e.data.spotifyStretchHeight, room)}px`;
    });
  }
  const f = ui.frame;
  if (f.style.display === 'block') { f.style.display = 'none'; return; }
  const r = ui.btn.getBoundingClientRect();
  f.style.right = `${Math.max(8, innerWidth - r.right - 8)}px`;
  f.style.bottom = `${innerHeight - r.top + 10}px`;
  f.style.display = 'block';
}

function watchPlayerBar() {
  const place = () => {
    // Only while on: when off, nothing of ours is in Spotify's bar (except in the app window,
    // which has no toolbar icon: there the button stays, to turn it back on).
    if (!ui.on && !ui.appWindow) {
      ui.btn?.remove();
      if (ui.frame) ui.frame.style.display = 'none';
      return;
    }
    if (!ui.on && ui.frame) ui.frame.style.display = 'none';
    if (ui.btn?.isConnected) { ui.render(); return; }
    // Right-hand group of the player bar: [Queue] [Connect] [Volume] [Full screen]
    const volume = document.querySelector('[data-testid="now-playing-bar"] [data-testid="volume-bar"]');
    const group = volume?.parentElement;
    if (!group) return;
    // Full-screen button: a plain (never "active") button, so we don't inherit an active dot.
    const template = document.querySelector('[data-testid="fullscreen-mode-button"]') || group.querySelector('button');
    ui.btn = ui.btn || makeButton(template);
    group.insertBefore(ui.btn, group.firstChild);
    ui.render();
  };
  ui.place = place;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; place(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  place();
}

// Tell the background which song this tab is playing (same key as Recently played), so a song
// with its own settings gets them the moment it starts.
if (window === window.top) {
  let lastKey = null;
  setInterval(() => {
    const m = navigator.mediaSession?.metadata;
    if (!m?.title) return;
    const key = `${m.title}|${m.artist || ''}|${m.album || ''}`;
    if (key === lastKey) return;
    chrome.runtime.sendMessage({ cmd: 'song', key, title: m.title, artist: m.artist || '' })
      .then(() => { lastKey = key; }, () => {});
  }, 300);
}
