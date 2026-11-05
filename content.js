// Isolated-world bridge: passes the speed from the extension to the page script,
// and adds a speed button to Spotify's player bar (next to Queue / volume) that opens
// the settings panel.
const setRate = (rate) => {
  document.dispatchEvent(new CustomEvent('spotifystretch:rate', { detail: rate }));
  ui.on = rate !== 1;
  ui.render();
};

const ui = {
  on: false,
  speed: 1.25,
  tabId: null,
  btn: null,
  frame: null,
  render() {
    if (!this.btn) return;
    this.label.textContent = `${Number(this.speed).toFixed(2).replace(/0$/, '')}×`;
    this.btn.style.color = this.on ? '#1ed760' : '';
    this.btn.setAttribute('aria-pressed', String(this.on));
    this.btn.title = this.on ? 'Faster / Slower: on' : 'Faster / Slower: off';
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.cmd === 'rate') setRate(msg.rate);
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
        if (r.rate && r.rate !== 1) setRate(r.rate);
        if (window === window.top) watchPlayerBar();
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
  Object.assign(btn.style, { minWidth: '36px', width: 'auto', padding: '0 4px', fontWeight: '700', fontSize: '11px' });
  const label = document.createElement('span');
  label.style.pointerEvents = 'none';
  btn.appendChild(label);
  ui.label = label;
  btn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  return btn;
}

function togglePanel() {
  if (!ui.frame) {
    const f = document.createElement('iframe');
    f.src = chrome.runtime.getURL(`popup.html?tab=${ui.tabId}`);
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
    if (ui.btn?.isConnected) return;
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
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; place(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  place();
}
