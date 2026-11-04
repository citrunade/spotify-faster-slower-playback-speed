// "Recently played" for the web player (the desktop app has it, the web player doesn't):
// records each song that plays, adds a Recently played tab to Spotify's queue panel,
// and plays a song from the history when picked.
(() => {
  if (window !== window.top) return;

  const MAX = 200;
  const MIN_PLAY_POLLS = 2; // ~4 s of play before a song counts (skipping through doesn't)

  // ---- Recording -------------------------------------------------------------------
  function nowPlaying() {
    const m = navigator.mediaSession?.metadata;
    if (!m || !m.title) return null;
    const w = document.querySelector('[data-testid="now-playing-widget-v2"], [data-testid="now-playing-widget"]');
    const href = (sel) => w?.querySelector(sel)?.getAttribute('href')?.split('?')[0] || null;
    const art = [...(m.artwork || [])];
    const bySize = (size) => art.find((a) => a.sizes === size)?.src;
    return {
      title: m.title,
      artist: m.artist || '',
      album: m.album || '',
      albumUrl: href('a[href^="/album/"]'),
      artistUrl: href('a[href^="/artist/"]'),
      cover: bySize('64x64') || bySize('300x300') || art[0]?.src || null,
    };
  }

  let candidate = null, polls = 0, recordedKey = null;
  setInterval(async () => {
    const playing = navigator.mediaSession?.playbackState === 'playing'
      || document.querySelector('[data-testid="control-button-playpause"]')?.getAttribute('aria-label') === 'Pause';
    if (!playing) return;
    const t = nowPlaying();
    if (!t) return;
    const key = ssHistoryKey(t);
    if (key !== candidate) { candidate = key; polls = 1; return; }
    if (++polls < MIN_PLAY_POLLS || key === recordedKey) return;
    recordedKey = key;
    const { history = [] } = await chrome.storage.local.get('history');
    if (history[0] && ssHistoryKey(history[0]) === key) history[0] = { ...history[0], ...t, playedAt: Date.now() };
    else history.unshift({ ...t, playedAt: Date.now() });
    await chrome.storage.local.set({ history: history.slice(0, MAX) });
  }, 2000);

  // ---- Playing a song from the history ---------------------------------------------
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  function navigate(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  async function play(entry) {
    if (!entry.albumUrl) {
      navigate(`/search/${encodeURIComponent(`${entry.title} ${entry.artist}`)}`);
      return;
    }
    navigate(entry.albumUrl);
    const want = norm(entry.title);
    for (let i = 0; i < 40; i++) { // wait up to ~8 s for the album's track list
      await new Promise((r) => setTimeout(r, 200));
      const rows = [...document.querySelectorAll('[data-testid="tracklist-row"]')];
      if (!rows.length) continue;
      const titleOf = (r) => norm(r.querySelector('[data-testid="internal-track-link"]')?.textContent);
      const row = rows.find((r) => titleOf(r) === want)
        || rows.find((r) => { const t = titleOf(r); return t && (want.startsWith(t) || t.startsWith(want)); });
      if (!row) { if (i > 15) return; continue; }
      row.scrollIntoView({ block: 'center' });
      const btn = [...row.querySelectorAll('button')].find((b) => /^Play /.test(b.getAttribute('aria-label') || ''));
      btn?.click();
      return;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.cmd === 'playHistory' && msg.entry) play(msg.entry);
  });
  const extOrigin = new URL(chrome.runtime.getURL('')).origin;
  window.addEventListener('message', (e) => {
    if (e.origin === extOrigin && e.data?.spotifyStretchPlay) play(e.data.spotifyStretchPlay);
  });

  // ---- "Recently played" tab in the queue panel -------------------------------------
  // Panel layout: aside[aria-label=Queue] > root > [header row (title + close), body (queue list)]
  function injectQueueTab() {
    const aside = document.querySelector('aside[aria-label="Queue"]');
    if (!aside || aside.querySelector('#ss-recent-tab')) return;
    const h1 = aside.querySelector('h1');
    const close = aside.querySelector('[data-testid="PanelHeader_CloseButton"]');
    if (!h1 || !close) return;
    const titleBox = [...close.closest('span')?.parentElement?.children || []].find((c) => c.contains(h1));
    const header = titleBox?.parentElement?.parentElement;
    const body = header?.nextElementSibling;
    if (!titleBox || !body) return;

    titleBox.style.display = 'flex';
    titleBox.style.alignItems = 'center';
    titleBox.style.gap = '16px';
    const queueTitle = titleBox.firstElementChild;

    const tab = document.createElement('button');
    tab.id = 'ss-recent-tab';
    tab.type = 'button';
    tab.className = h1.className;
    tab.textContent = 'Recently played';
    tab.style.cssText = 'background:none;border:0;padding:0;cursor:pointer;white-space:nowrap;';
    titleBox.appendChild(tab);

    const panel = document.createElement('div');
    panel.id = 'ss-recent-list';
    panel.style.cssText = 'display:none;overflow-y:auto;padding:0 8px 16px;flex:1 1 0;min-height:0;';
    body.after(panel);

    let showingRecent = false;
    const subdued = 'var(--text-subdued, #b3b3b3)';
    const setView = (recent) => {
      showingRecent = recent;
      if (recent) panel.style.height = `${body.getBoundingClientRect().height || 600}px`;
      body.style.display = recent ? 'none' : '';
      panel.style.display = recent ? 'block' : 'none';
      h1.style.color = recent ? subdued : '';
      tab.style.color = recent ? '' : subdued;
      queueTitle.style.cursor = recent ? 'pointer' : '';
      if (recent) render();
    };
    const render = async () => {
      if (!showingRecent) return;
      const { history = [] } = await chrome.storage.local.get('history');
      const cur = nowPlaying();
      panel.replaceChildren(ssBuildHistoryList(history, play, cur && ssHistoryKey(cur)));
    };
    tab.addEventListener('click', () => setView(true));
    queueTitle.addEventListener('click', () => { if (showingRecent) setView(false); });
    const onStore = (c, area) => {
      if (!panel.isConnected) { chrome.storage.onChanged.removeListener(onStore); return; }
      if (area === 'local' && c.history) render();
    };
    chrome.storage.onChanged.addListener(onStore);
    setView(false);
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; injectQueueTab(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
