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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Path of child indexes from root to el, to find "the same" element in a copy or re-render.
  const pathOf = (root, el) => {
    const p = [];
    for (let n = el; n && n !== root; n = n.parentElement) p.unshift([...n.parentElement.children].indexOf(n));
    return p;
  };
  const byPath = (root, p) => p.reduce((n, i) => n?.children[i], root);

  // Lays a frozen copy of the main view over it, so the page switching underneath
  // (album → play → back) isn't seen. Returns the scroll positions to restore later.
  function freezeMain() {
    const main = document.querySelector('main');
    if (!main) return null;
    const rect = main.getBoundingClientRect();
    const scrolled = [main, ...main.querySelectorAll('*')]
      .filter((e) => e.scrollTop > 0)
      .map((e) => ({ path: pathOf(main, e), top: e.scrollTop }));
    const cover = document.createElement('div');
    cover.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;`
      + `height:${rect.height}px;overflow:hidden;z-index:2147483646;pointer-events:none;background:#121212;`;
    const copy = main.cloneNode(true);
    copy.removeAttribute('id');
    copy.style.cssText += `;width:${rect.width}px;height:${rect.height}px;margin:0;`;
    cover.appendChild(copy);
    document.documentElement.appendChild(cover);
    for (const s of scrolled) { const e = byPath(copy, s.path); if (e) e.scrollTop = s.top; }
    return { cover, scrolled };
  }

  async function unfreezeMain(frozen) {
    if (!frozen) return;
    // Give Spotify a moment to re-render the previous page, then put its scroll back.
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      const main = document.querySelector('main');
      if (!main) continue;
      for (const s of frozen.scrolled) { const e = byPath(main, s.path); if (e) e.scrollTop = s.top; }
    }
    frozen.cover.remove();
  }

  // Looser comparison: letters and digits only ("Song (feat. X) - Lofi" ≈ "Song - Lofi").
  const loose = (s) => norm(s).replace(/\((feat|with)[^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

  function findRow(want) {
    const rows = [...document.querySelectorAll('[data-testid="tracklist-row"]')];
    const titleOf = (r) => norm(r.querySelector('[data-testid="internal-track-link"]')?.textContent);
    const lw = loose(want);
    return {
      titles: rows.map(titleOf).slice(0, 30),
      row: rows.find((r) => titleOf(r) === want)
        || rows.find((r) => { const t = loose(titleOf(r)); return t && lw && (t === lw || lw.startsWith(t) || t.startsWith(lw)); }),
    };
  }

  // Last attempt's details, kept so a failure can be diagnosed.
  const note = (d) => chrome.storage.local.set({ lastPlayAttempt: { at: Date.now(), ...d } }).catch(() => {});

  const pressPlay = (row) =>
    [...row.querySelectorAll('button')].find((b) => /^Play /.test(b.getAttribute('aria-label') || ''))?.click();

  async function play(entry) {
    if (!entry.albumUrl) {
      navigate(`/search/${encodeURIComponent(`${entry.title} ${entry.artist}`)}`);
      return;
    }
    const want = norm(entry.title);
    const onAlbum = location.pathname === entry.albumUrl;
    // Already on that album: just press play, nothing to hide.
    if (onAlbum) { const { row } = findRow(want); if (row) { pressPlay(row); return; } }

    const from = location.pathname;
    const frozen = onAlbum ? null : freezeMain();
    navigate(entry.albumUrl);
    // Wait up to ~10 s for the album's track list. Rows of the previous page can still be on
    // screen while the album loads, so keep looking the whole time instead of giving up early.
    let played = false, found = null, titles = [], hasButton = false;
    for (let i = 0; i < 50 && !played; i++) {
      await sleep(200);
      ({ row: found, titles } = findRow(want));
      if (!found) continue;
      const btn = [...found.querySelectorAll('button')].find((b) => /^Play /.test(b.getAttribute('aria-label') || ''));
      hasButton = !!btn;
      if (btn) { btn.click(); played = true; }
      else if (i > 10) { // no play button found: double-clicking a row also plays it in Spotify
        found.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        played = true;
      }
    }
    note({ want: entry.title, from, album: entry.albumUrl, found: !!found, hasButton, played, titles });
    // Played: go back to where the user was. Not found: stay on the album so they can pick it.
    if (played && !onAlbum) history.back();
    await unfreezeMain(frozen);
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
