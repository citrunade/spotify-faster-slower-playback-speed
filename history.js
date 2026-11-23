// "Recently played" for the web player (the desktop app has it, the web player doesn't):
// records each song that plays, adds a Recently played tab to Spotify's queue panel,
// and plays a song from the history when picked.
(() => {
  if (window !== window.top) return;

  const MAX = 200;
  const MIN_PLAY_POLLS = 2; // ~4 s of play before a song counts (skipping through doesn't)
  const LINK_WAIT_POLLS = 8; // after a reload the player bar's links can take a while: wait ~16 s

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

  let candidate = null, polls = 0, recordedKey = null, recordedLinks = false;
  setInterval(async () => {
    const playing = navigator.mediaSession?.playbackState === 'playing'
      || document.querySelector('[data-testid="control-button-playpause"]')?.getAttribute('aria-label') === 'Pause';
    if (!playing) return;
    const t = nowPlaying();
    if (!t) return;
    const key = ssHistoryKey(t);
    if (key !== candidate) { candidate = key; polls = 1; return; }
    if (++polls < MIN_PLAY_POLLS) return;
    const hasLinks = !!(t.albumUrl && t.artistUrl);
    if (!hasLinks && polls < LINK_WAIT_POLLS) return;
    // Already saved: only come back to it if its missing links have turned up.
    if (key === recordedKey && (recordedLinks || !hasLinks)) return;
    recordedKey = key;
    recordedLinks = hasLinks;
    const { history = [] } = await chrome.storage.local.get('history');
    if (history[0] && ssHistoryKey(history[0]) === key) {
      // The same song again: blank links never replace ones already saved.
      history[0] = { ...history[0], ...t, albumUrl: t.albumUrl || history[0].albumUrl, artistUrl: t.artistUrl || history[0].artistUrl, playedAt: Date.now() };
    } else history.unshift({ ...t, playedAt: Date.now() });
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
      const items = [...document.querySelectorAll('[role="menu"] li > button, [role="menu"] li > a')];
      if (!items.length) continue;
      const item = items.find((m) => re.test(m.textContent.trim()));
      if (item) { item.click(); return 'ok'; }
      more.click(); // close the menu again
      return 'no-item';
    }
    return 'no-menu';
  }

  // "Add to playlist" in Spotify's song menu opens a second menu: a search box, "New playlist"
  // and the user's playlists. Opens it and returns its buttons (null if it never showed).
  const isAddToPlaylist = (b) => /^Add to playlist$/i.test(b.textContent.trim());
  async function playlistButtons(row) {
    const more = row.querySelector('[data-testid="more-button"]') || rowButton(row, /^More options/);
    if (!more) return null;
    more.click();
    let opener = null;
    for (let i = 0; i < 15 && !opener; i++) {
      await sleep(100);
      opener = [...document.querySelectorAll('[role="menu"] li > button')].find(isAddToPlaylist);
    }
    if (!opener) { closeMenus(); return null; }
    // The second menu opens on hover in Spotify; a click as well, for good measure.
    for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter']) {
      opener.dispatchEvent(new MouseEvent(type, { bubbles: type.endsWith('over'), view: window }));
    }
    if (opener.getAttribute('aria-expanded') !== 'true') opener.click();
    // Wait for the second menu, and for its list to stop growing (it can load in a moment later).
    let prev = -1, steady = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const sub = [...document.querySelectorAll('[role="menu"]')]
        .find((m) => ![...m.querySelectorAll('li > button')].some(isAddToPlaylist) && m.querySelector('li > button'));
      const buttons = sub ? [...sub.querySelectorAll('li > button')] : [];
      if (buttons.length && buttons.length === prev) { if (++steady >= 3) return buttons; } else steady = 0;
      prev = buttons.length;
    }
    closeMenus();
    return null;
  }
  const buttonName = (b) => b.textContent.trim();
  function closeMenus() {
    for (let i = 0; i < 3 && document.querySelector('[role="menu"]'); i++) {
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    }
  }
  let playlistNames = null;

  // What each action does once the song's row is found. Returns a short result string.
  const ACTIONS = {
    playlists: async (row) => {
      const buttons = await playlistButtons(row);
      if (!buttons) return 'no-item';
      playlistNames = buttons.map(buttonName).filter(Boolean);
      closeMenus();
      return 'ok';
    },
    playlist: async (row, name) => {
      const buttons = await playlistButtons(row);
      const pick = buttons?.find((b) => buttonName(b) === name);
      if (!pick) { closeMenus(); return 'no-item'; }
      pick.click();
      // Already in that playlist: Spotify asks whether to add it again. Wait for the answer
      // before going back (and don't claim it was added).
      const asking = () => document.querySelector('dialog[open], [role="alertdialog"], [aria-modal="true"]');
      for (let i = 0; i < 8 && !asking(); i++) await sleep(100);
      if (!asking()) return 'ok';
      for (let i = 0; i < 300 && asking(); i++) await sleep(200); // at most a minute
      return 'asked';
    },
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
    exclude: (row) => menuItem(row, /^Exclude from your taste profile$/i),
    jam: (row) => menuItem(row, /^Start a Jam$/i),
    credits: async (row) => {
      const result = await menuItem(row, /^View credits$/i);
      if (result !== 'ok') return result;
      // The credits window shows over the frozen view: go back once it is closed.
      for (let i = 0; i < 30 && !document.querySelector('dialog[open]'); i++) await sleep(100);
      while (document.querySelector('dialog[open]')) await sleep(200);
      return 'ok';
    },
  };
  // Same idea for the artist's menu, from the ⋯ button on the artist's page. The exact wording
  // matters: if Spotify offers the opposite (Unfollow), nothing is clicked.
  const ARTIST_ACTIONS = {
    follow: /^Follow$/i,
    block: /^Don.t play this artist$/i,
    artistRadio: /^Go to artist radio$/i,
    report: /^Report$/i,
  };
  const STAYS = { radio: true, artistRadio: true }; // these leave the user on the new page
  const DONE = {
    queue: 'Added to queue', like: 'Added to Liked Songs', exclude: 'Excluded from your taste profile',
    follow: 'Following', block: 'Won’t play this artist',
  };
  const NOT_OFFERED = { follow: 'Already following', block: 'Already not playing this artist', exclude: 'Already excluded' };

  // Waits for the artist's page (not the page before it) and returns the bar with its ⋯ button.
  async function openArtistBar(entry) {
    for (let i = 0; i < 60; i++) { // up to ~12 s
      await sleep(200);
      if (location.pathname !== entry.artistUrl) continue;
      const bar = document.querySelector('main [data-testid="artist-page"] [data-testid="action-bar-row"]');
      if (!bar?.querySelector('[data-testid="more-button"]')) continue;
      const name = document.querySelector('main [data-testid="entityTitle"]')?.textContent;
      if (i > 15 || (name && loose(entry.artist).includes(loose(name)))) return bar;
    }
    return null;
  }

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
  // Returns the playlist names for 'playlists' (null if they couldn't be read).
  async function act(action, entry, arg) {
    // Songs saved without a link: a search for it instead of doing nothing.
    const searchFor = (text, kind = '') => `/search/${encodeURIComponent(text)}${kind}`;
    if (action === 'album') { navigate(entry.albumUrl || searchFor(`${entry.album} ${entry.artist}`, '/albums')); return; }
    if (action === 'artist') { navigate(entry.artistUrl || searchFor(entry.artist, '/artists')); return; }
    const artistAction = ARTIST_ACTIONS[action];
    if (!ACTIONS[action] && !artistAction) return;
    if (artistAction && !entry.artistUrl) { navigate(searchFor(entry.artist, '/artists')); return; }
    if (action === 'playlists' && !entry.albumUrl) return null; // the picker says it couldn't load
    if (!artistAction && !entry.albumUrl) { navigate(searchFor(`${entry.title} ${entry.artist}`)); return; }
    if (busy) return null;
    busy = true;
    playlistNames = null;
    const from = location.pathname;
    const page = artistAction ? entry.artistUrl : entry.albumUrl;
    const onAlbum = from === page;
    const frozen = onAlbum ? null : freezeMain();
    let result = 'not-found';
    try {
      navigate(page);
      if (artistAction) {
        const bar = await openArtistBar(entry);
        if (bar) result = await menuItem(bar, artistAction);
      } else {
        const want = norm(entry.title);
        const row = onAlbum ? (findRow(want).row || await scrollToFind(want)) : await openAlbumRow(entry);
        if (row) result = await ACTIONS[action](row, arg);
      }
    } catch (e) { result = `error: ${e.message}`; }
    note({ action, want: entry.title, from, album: page, result, titles: findRow('').rows.map(titleOf).slice(0, 30) });
    if (STAYS[action] && result === 'ok') { await sleep(400); frozen?.cover.remove(); busy = false; return; }
    if (result === 'not-found') {
      frozen?.cover.remove(); // leave them on the album so they can pick the song themselves
      toast(artistAction ? 'Couldn’t open that artist' : 'Couldn’t find that song on its album');
    } else {
      if (!onAlbum) history.back();
      await unfreezeMain(frozen, !onAlbum);
      if (result === 'ok' && action === 'playlist') toast(`Added to ${arg}`);
      else if (result === 'ok' && DONE[action]) toast(DONE[action]);
      else if (result === 'already') toast('Already in Liked Songs');
      else if (result === 'no-item' && NOT_OFFERED[action]) toast(NOT_OFFERED[action]);
      else if (result === 'no-item' && action === 'playlist') toast(`Couldn’t find the playlist “${arg}”`);
      else if (result !== 'ok' && result !== 'asked' && action !== 'playlists') toast('That didn’t work, try again'); // the picker says so itself
    }
    busy = false;
    return action === 'playlists' ? playlistNames : null;
  }


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
