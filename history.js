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

  // ---- Acting on a song from the history -------------------------------------------
  // The web player only offers song actions on a song's row, so we open the song's album
  // behind a frozen copy of the current view, use the row (play button or Spotify's own
  // "More options" menu), then go back. Menu items are matched by their English text.
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function navigate(path) {
    if (location.pathname === path) return;
    history.pushState({ key: Math.random().toString(36).slice(2, 8), state: {} }, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }

  // Path of child indexes from root to el, to find "the same" element in a copy or re-render.
  const pathOf = (root, el) => {
    const p = [];
    for (let n = el; n && n !== root; n = n.parentElement) p.unshift([...n.parentElement.children].indexOf(n));
    return p;
  };
  const byPath = (root, p) => p.reduce((n, i) => n?.children[i], root);

  // Lays a frozen copy of the main view over it, so the page switching underneath isn't seen.
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

  async function unfreezeMain(frozen, restoreScroll) {
    if (!frozen) return;
    for (let i = 0; i < 10 && restoreScroll; i++) { // let Spotify re-render, then put scroll back
      await sleep(100);
      const main = document.querySelector('main');
      if (!main) continue;
      for (const s of frozen.scrolled) { const e = byPath(main, s.path); if (e) e.scrollTop = s.top; }
    }
    frozen.cover.remove();
  }

  // Looser comparison: letters and digits only ("Song (feat. X) - Lofi" ≈ "Song - Lofi").
  const loose = (s) => norm(s).replace(/\((feat|with)[^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  // A row's song title: the title link if present, else the play button's label
  // ("Play <title> by <artists>"), else the row's text.
  const playLabel = (r) => [...r.querySelectorAll('button')]
    .map((b) => b.getAttribute('aria-label') || '').find((l) => /^Play /.test(l)) || '';
  const titleOf = (r) => norm(r.querySelector('[data-testid="internal-track-link"]')?.textContent
    || playLabel(r).replace(/^Play /, '') || r.innerText.replace(/^\s*\d+\s*/, ''));

  function rowMatches(r, want, lw) {
    const t = titleOf(r);
    if (t === want) return true;
    const lt = loose(t);
    // Title from a "Play X by Y" label or row text has extra words after the title.
    return !!(lt && lw && (lt === lw || lt.startsWith(lw) || (lt.length >= 4 && lw.startsWith(lt))));
  }

  // Only the main view: the queue panel has rows of the same kind.
  function findRow(want) {
    const main = document.querySelector('main');
    const rows = main ? [...main.querySelectorAll('[data-testid="tracklist-row"]')] : [];
    const lw = loose(want);
    const exact = want ? rows.find((r) => titleOf(r) === want) : null;
    return { rows, row: want ? (exact || rows.find((r) => rowMatches(r, want, lw)) || null) : null };
  }

  // Long albums only draw the rows on screen: scroll the view down until the song shows up.
  async function scrollToFind(want) {
    let { rows, row } = findRow(want);
    let sc = rows[0];
    while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    for (let i = 0; !row && sc && i < 25; i++) {
      const before = sc.scrollTop;
      sc.scrollTop += sc.clientHeight * 0.7;
      await sleep(200);
      ({ row } = findRow(want));
      if (sc.scrollTop === before) break; // reached the bottom
    }
    return row;
  }

  // Waits for the album page (title matches, rows drawn), then finds the song's row.
  async function openAlbumRow(entry) {
    const want = norm(entry.title);
    for (let i = 0; i < 60; i++) { // up to ~12 s
      await sleep(200);
      if (location.pathname !== entry.albumUrl) continue;
      const { rows, row } = findRow(want);
      if (row) return row;
      const pageTitle = document.querySelector('main [data-testid="entityTitle"]')?.textContent;
      const albumShown = pageTitle ? loose(pageTitle) === loose(entry.album) : i > 20;
      if (rows.length === 1 && pageTitle && albumShown) return rows[0]; // single: its only song
      if (rows.length && albumShown) return scrollToFind(want);
    }
    return null;
  }

  const rowButton = (row, re) => [...row.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || ''));

  async function menuItem(row, re) {
    const more = row.querySelector('[data-testid="more-button"]') || rowButton(row, /^More options/);
    if (!more) return 'no-menu';
    more.click();
    for (let i = 0; i < 15; i++) {
      await sleep(100);
      const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
      if (!items.length) continue;
      const item = items.find((m) => re.test(m.textContent.trim()));
      if (item) { item.click(); return 'ok'; }
      more.click(); // close the menu again
      return 'no-item';
    }
    return 'no-menu';
  }

  // What each action does once the song's row is found. Returns a short result string.
  const ACTIONS = {
    play: async (row) => {
      const btn = rowButton(row, /^Play\b/);
      if (btn) btn.click();
      else row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      return 'ok';
    },
    queue: (row) => menuItem(row, /^Add to queue$/i),
    like: async (row) => {
      if (rowButton(row, /^Remove from (your )?Liked Songs/i)) return 'already';
      return menuItem(row, /^(Add|Save) to (your )?Liked Songs$/i);
    },
    radio: (row) => menuItem(row, /^Go to song radio$/i),
  };
  const STAYS = { radio: true }; // these leave the user on the new page
  const DONE = { queue: 'Added to queue', like: 'Added to Liked Songs' };

  function toast(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:2147483647;'
      + 'background:#fff;color:#000;padding:8px 16px;border-radius:6px;font:600 14px system-ui,sans-serif;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.5);pointer-events:none;';
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // Last attempt's details, kept so a failure can be diagnosed.
  const note = (d) => chrome.storage.local.set({ lastPlayAttempt: { at: Date.now(), ...d } }).catch(() => {});

  let busy = false;
  async function act(action, entry) {
    if (action === 'album') { if (entry.albumUrl) navigate(entry.albumUrl); return; }
    if (action === 'artist') { if (entry.artistUrl) navigate(entry.artistUrl); return; }
    if (!ACTIONS[action]) return;
    if (!entry.albumUrl) { navigate(`/search/${encodeURIComponent(`${entry.title} ${entry.artist}`)}`); return; }
    if (busy) return;
    busy = true;
    const from = location.pathname;
    const onAlbum = from === entry.albumUrl;
    const frozen = onAlbum ? null : freezeMain();
    let result = 'not-found';
    try {
      navigate(entry.albumUrl);
      const want = norm(entry.title);
      const row = onAlbum ? (findRow(want).row || await scrollToFind(want)) : await openAlbumRow(entry);
      if (row) result = await ACTIONS[action](row);
    } catch (e) { result = `error: ${e.message}`; }
    note({ action, want: entry.title, from, album: entry.albumUrl, result, titles: findRow('').rows.map(titleOf).slice(0, 30) });
    if (STAYS[action] && result === 'ok') { await sleep(400); frozen?.cover.remove(); busy = false; return; }
    if (result === 'not-found') {
      frozen?.cover.remove(); // leave them on the album so they can pick the song themselves
      toast('Couldn’t find that song on its album');
    } else {
      if (!onAlbum) history.back();
      await unfreezeMain(frozen, !onAlbum);
      if (result === 'ok' && DONE[action]) toast(DONE[action]);
      else if (result === 'already') toast('Already in Liked Songs');
      else if (result !== 'ok') toast('That didn’t work, try again');
    }
    busy = false;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.cmd === 'historyAction' && msg.entry) act(msg.action, msg.entry);
  });
  const extOrigin = new URL(chrome.runtime.getURL('')).origin;
  window.addEventListener('message', (e) => {
    const d = e.data?.spotifyStretchAction;
    if (e.origin === extOrigin && d?.entry) act(d.action, d.entry);
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
      panel.replaceChildren(ssBuildHistoryList(history, act, cur && ssHistoryKey(cur)));
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
