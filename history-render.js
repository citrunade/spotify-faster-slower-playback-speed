// Draws the "Recently played" list in Spotify's queue panel, styled like the queue rows,
// and its desktop-style song menu. Built with DOM calls only (song titles are untrusted text).

const ssHistoryKey = (e) => `${e.title}|${e.artist}|${e.album}`;

function ssTimeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ssEl(tag, style, text) {
  const el = document.createElement(tag);
  if (style) el.style.cssText = style;
  if (text != null) el.textContent = text;
  return el;
}

// Simple 16px line icons (our own drawings), filled with the text colour.
const SS_ICONS = {
  play: 'M4 2.5v11l9-5.5z',
  queue: 'M1 3h10v1.5H1zM1 7.25h10v1.5H1zM1 11.5h6V13H1zM12.25 9.5h1.5v2h2V13h-2v2h-1.5v-2h-2v-1.5h2z',
  like: 'M8 14 2.2 8.2a3.4 3.4 0 0 1 4.8-4.8l1 1 1-1a3.4 3.4 0 0 1 4.8 4.8z',
  exclude: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zM5.2 4.2 8 7l2.8-2.8 1 1L9 8l2.8 2.8-1 1L8 9l-2.8 2.8-1-1L7 8 4.2 5.2z',
  jam: 'M6 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM1 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5H9.5c0-1.9-1.5-3-3.5-3s-3.5 1.1-3.5 3zM11 3a2.2 2.2 0 0 1 0 4.4V6a.8.8 0 0 0 0-1.6zM12 9.7c1.9.4 3 2 3 4.3h-1.5c0-1.6-.7-2.6-1.9-2.9z',
  credits: 'M1 3h9v1.5H1zM1 7h6v1.5H1zM1 11h5v1.5H1zM12 3h1.5v8.2a2.3 2.3 0 1 1-1.5-2.1z',
  follow: 'M6 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM1 15c0-3 2.2-5 5-5s5 2 5 5H9.5c0-2-1.5-3.5-3.5-3.5S2.5 13 2.5 15zM12.25 3h1.5v2h2v1.5h-2v2h-1.5v-2h-2V5h2z',
  block: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zM3.5 4.6l1.1-1.1 7.9 7.9-1.1 1.1z',
  report: 'M5 1h6l4 4v6l-4 4H5l-4-4V5zm.6 1.5L2.5 5.6v4.8l3.1 3.1h4.8l3.1-3.1V5.6l-3.1-3.1zM7.25 4.5h1.5v4.5h-1.5zM7.25 10h1.5v1.5h-1.5z',
  radio: 'M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM4.11 3.05l1.06 1.06a5 5 0 0 0 0 7.78l-1.06 1.06a6.5 6.5 0 0 1 0-9.9zm7.78 0a6.5 6.5 0 0 1 0 9.9l-1.06-1.06a5 5 0 0 0 0-7.78z',
  artist: 'M8 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 4.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0zM1.5 15.5c0-3 2.9-5 6.5-5s6.5 2 6.5 5H13c0-2-2.1-3.5-5-3.5S3 13.5 3 15.5z',
  album: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-1.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM5.25 8a2.75 2.75 0 1 1 5.5 0 2.75 2.75 0 0 1-5.5 0z',
  remove: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm4.5-.75h7v1.5h-7z',
  playlist: 'M7.25 1.5h1.5v5.75h5.75v1.5H8.75v5.75h-1.5V8.75H1.5v-1.5h5.75z',
  chevron: 'M5.5 2.5 11 8l-5.5 5.5-1.06-1.06L8.88 8 4.44 3.56z',
  more: 'M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
};

function ssIcon(name, size = 16) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'flex:none;fill:currentColor;';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SS_ICONS[name]);
  path.setAttribute('fill-rule', 'evenodd');
  svg.appendChild(path);
  return svg;
}

// The Liked Songs tile: a white heart on a purple-to-green square.
function ssLikedIcon() {
  const tile = ssEl('span', 'flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:16px;'
    + 'border-radius:2px;background:linear-gradient(135deg,#450af5,#8e8ee5 60%,#c4efd9);color:#fff;');
  tile.appendChild(ssIcon('like', 10));
  return tile;
}

// Laid out like Spotify's own song menu: icons only on the top few items (the rest keep the
// same indent), the keyboard key on the right. null = divider line.
// [action, label, { icon, key, alt }] — key (with Alt if alt) picks the item while the menu is open.
const SS_MENU = [
  ['playlist', 'Add to playlist', { icon: 'playlist', key: 'P' }],
  ['like', 'Add to Liked Songs', { icon: 'like', key: 'L' }],
  ['queue', 'Add to queue', { icon: 'queue', key: 'Q' }],
  ['play', 'Play'],
  ['remove', 'Remove from history'],
  ['exclude', 'Exclude from your taste profile'],
  null,
  ['radio', 'Go to song radio', { key: 'R' }],
  ['artist', 'Go to artist', { key: 'A', alt: true }],
  ['album', 'Go to album', { key: 'A' }],
  ['credits', 'View credits'],
];

const SS_ARTIST_MENU = [
  ['follow', 'Follow'],
  ['block', 'Don’t play this artist'],
  ['artistRadio', 'Go to artist radio', { key: 'R' }],
  ['report', 'Report'],
];

const SS_FONT = 'font-family:var(--encore-body-font-stack, inherit);';

async function ssRemoveFromHistory(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  const i = history.findIndex((e) => e.playedAt === entry.playedAt && ssHistoryKey(e) === ssHistoryKey(entry));
  if (i >= 0) { history.splice(i, 1); await chrome.storage.local.set({ history }); }
}

// The user's playlists as Spotify last listed them in its "Add to playlist" menu: { names, at }.
// Kept for a while so the picker opens at once the next time.
let ssPlaylistCache = null;
const SS_PLAYLIST_CACHE_MS = 10 * 60e3;

// Playlist picker, beside the song menu: a search box and the playlists; picking one adds the
// song to it. onAction('playlists', entry) lists them, onAction('playlist', entry, name) adds.
async function ssOpenPlaylistPicker(menu, anchor, entry, onAction) {
  if (menu.querySelector('#ss-playlist-picker')) return;
  const W = 260;
  const picker = ssEl('div', `position:fixed;width:${W}px;max-height:360px;display:flex;flex-direction:column;padding:4px;`
    + 'background:#282828;border-radius:4px;box-shadow:0 16px 24px rgba(0,0,0,.3),0 6px 8px rgba(0,0,0,.2);');
  picker.id = 'ss-playlist-picker';
  picker.setAttribute('role', 'menu');
  const search = ssEl('input', 'flex:none;margin:4px 4px 6px;padding:8px 10px;border:0;border-radius:4px;outline:none;'
    + 'background:rgba(255,255,255,.1);color:#fff;font:inherit;');
  search.type = 'text';
  search.placeholder = 'Find a playlist';
  search.setAttribute('aria-label', 'Find a playlist');
  // Typing here must not reach Spotify's keyboard shortcuts (space = play/pause).
  search.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  const list = ssEl('div', 'overflow-y:auto;min-height:0;');
  const status = (text) => list.replaceChildren(ssEl('div', 'padding:10px 12px;color:rgba(255,255,255,.6);white-space:normal;', text));
  picker.append(search, list);
  menu.appendChild(picker);
  const m = menu.getBoundingClientRect(), a = anchor.getBoundingClientRect();
  picker.style.left = `${m.right + W - 4 <= innerWidth - 4 ? m.right - 4 : Math.max(4, m.left - W + 4)}px`;
  picker.style.top = `${Math.max(4, Math.min(a.top - 4, innerHeight - 364))}px`;

  const fill = (names) => {
    const q = search.value.trim().toLowerCase();
    const shown = names.filter((n) => !q || n.toLowerCase().includes(q));
    if (!shown.length) { status(q ? 'No playlist by that name' : 'No playlists found'); return; }
    list.replaceChildren(...shown.map((name) => {
      const b = ssEl('button', 'display:flex;align-items:center;width:100%;height:40px;padding:12px;border:0;border-radius:2px;'
        + 'background:none;color:rgba(255,255,255,.9);font:inherit;text-align:left;cursor:default;white-space:nowrap;');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.appendChild(ssEl('span', 'overflow:hidden;text-overflow:ellipsis;', name));
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,.1)'; b.style.color = '#fff'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'none'; b.style.color = 'rgba(255,255,255,.9)'; });
      b.addEventListener('click', (e) => { e.stopPropagation(); menu.remove(); onAction('playlist', entry, name); });
      return b;
    }));
  };

  let names = ssPlaylistCache && Date.now() - ssPlaylistCache.at < SS_PLAYLIST_CACHE_MS ? ssPlaylistCache.names : null;
  if (!names) {
    status('Loading your playlists…');
    const got = await onAction('playlists', entry);
    if (Array.isArray(got) && got.length) { names = got; ssPlaylistCache = { names, at: Date.now() }; }
  }
  if (!picker.isConnected) return;
  if (!names) { status('Couldn’t load your playlists. Try again, or add it from the song’s album.'); return; }
  fill(names);
  search.addEventListener('input', () => fill(names));
  search.focus();
}

// Desktop-style menu for one song (or its artist: items = SS_ARTIST_MENU), at (x, y) in the viewport.
function ssOpenMenu(entry, x, y, onAction, items = SS_MENU) {
  document.getElementById('ss-history-menu')?.remove();
  const menu = ssEl('div', 'position:fixed;z-index:2147483647;min-width:220px;max-width:350px;padding:4px;'
    + 'background:#282828;border-radius:6px;box-shadow:0 16px 24px rgba(0,0,0,.3),0 6px 8px rgba(0,0,0,.2);'
    + `${SS_FONT}font-size:.875rem;font-weight:400;line-height:1.25;`);
  menu.id = 'ss-history-menu';
  menu.setAttribute('role', 'menu');
  const keyed = []; // [{ key, alt, item }] for the keyboard keys
  let lastWasDivider = true;
  for (const it of items) {
    if (!it) {
      if (!lastWasDivider) menu.appendChild(ssEl('div', 'height:1px;margin:4px 0;background:rgba(255,255,255,.1);'));
      lastWasDivider = true;
      continue;
    }
    const [action, label, opt = {}] = it;
    const item = ssEl('button', 'display:flex;align-items:center;gap:12px;width:100%;height:36px;padding:0 12px;'
      + 'border:0;border-radius:2px;background:none;color:rgba(255,255,255,.9);font:inherit;text-align:left;cursor:default;white-space:nowrap;');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    // Items without an icon keep an empty space for one, so all the words line up.
    const icon = action === 'like' ? ssLikedIcon() : opt.icon ? ssIcon(opt.icon) : ssEl('span', 'flex:none;width:16px;');
    item.append(icon, ssEl('span', 'overflow:hidden;text-overflow:ellipsis;', label));
    const hint = opt.key && ssEl('span', 'flex:none;margin-left:auto;padding-left:24px;color:rgba(255,255,255,.6);font-size:.8125rem;',
      opt.alt ? `Alt ${opt.key}` : opt.key);
    if (hint) { item.appendChild(hint); keyed.push({ key: opt.key.toLowerCase(), alt: !!opt.alt, item }); }
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.1)'; item.style.color = '#fff'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'none'; item.style.color = 'rgba(255,255,255,.9)'; });
    if (action === 'playlist') {
      // Opens the playlist picker beside the menu (on hover, like the desktop app, or on click).
      const arrow = ssIcon('chevron');
      if (hint) { arrow.style.marginLeft = '12px'; } else arrow.style.marginLeft = 'auto';
      item.appendChild(arrow);
      let hoverTimer = 0;
      item.addEventListener('mouseenter', () => { hoverTimer = setTimeout(() => ssOpenPlaylistPicker(menu, item, entry, onAction), 250); });
      item.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
      item.addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(hoverTimer); ssOpenPlaylistPicker(menu, item, entry, onAction); });
      menu.appendChild(item);
      lastWasDivider = false;
      continue;
    }
    // Any other item closes the playlist picker when hovered.
    item.addEventListener('mouseenter', () => menu.querySelector('#ss-playlist-picker')?.remove());
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      if (action === 'remove') ssRemoveFromHistory(entry);
      else onAction(action, entry);
    });
    menu.appendChild(item);
    lastWasDivider = false;
  }
  if (menu.lastElementChild && !menu.lastElementChild.getAttribute('role')) menu.lastElementChild.remove();
  (document.body || document.documentElement).appendChild(menu);
  // Keep it on screen.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  const close = (e) => {
    if (!menu.isConnected) { stop(); return; }
    if (e.type === 'keydown' && e.key !== 'Escape') {
      if (menu.querySelector('#ss-playlist-picker input') === document.activeElement) return; // typing a playlist name
      // A key shown in the menu picks that item, and doesn't reach Spotify's own shortcuts.
      const hit = !e.ctrlKey && !e.metaKey && keyed.find((k) => k.key === e.key.toLowerCase() && k.alt === e.altKey);
      if (!hit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hit.item.click();
      return;
    }
    if (e.type === 'mousedown' && menu.contains(e.target)) return;
    menu.remove();
    stop();
  };
  const stop = () => {
    window.removeEventListener('mousedown', close, true);
    window.removeEventListener('keydown', close, true);
  };
  setTimeout(() => {
    window.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', close, true);
  });
}

// entries: newest first. onAction(action, entry): the play button on the cover or a double
// click plays; the ⋯ button or a right-click opens the menu. currentKey marks the playing song.
// Sizes follow Spotify's queue rows: 48px cover, 1rem title, .875rem artist line.
function ssBuildHistoryList(entries, onAction, currentKey) {
  const list = ssEl('div', `display:flex;flex-direction:column;${SS_FONT}`);
  list.setAttribute('role', 'list');
  if (!entries.length) {
    list.appendChild(ssEl('div', 'color:var(--text-subdued, #b3b3b3);font-size:.875rem;padding:16px 8px;line-height:1.5;',
      'Nothing yet. Songs show up here once they have played for a few seconds.'));
    return list;
  }
  const ellipsis = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  for (const e of entries) {
    const row = ssEl('div', 'display:flex;gap:12px;align-items:center;padding:8px;border-radius:4px;cursor:default;');
    row.className = 'ss-history-row';
    row.setAttribute('role', 'listitem');
    row.title = `${e.title} · played ${ssTimeAgo(e.playedAt)}`;
    row.addEventListener('dblclick', () => onAction('play', e));
    row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ssOpenMenu(e, ev.clientX, ev.clientY, onAction); });

    // Cover with a play button over it on hover, like the desktop queue.
    const cover = ssEl('div', 'position:relative;flex:none;width:48px;height:48px;border-radius:4px;overflow:hidden;background:#333;');
    const img = ssEl('img', 'width:100%;height:100%;object-fit:cover;display:block;');
    if (e.cover) img.src = e.cover;
    img.alt = '';
    const play = ssEl('button', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;'
      + 'border:0;padding:0;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;');
    play.type = 'button';
    play.setAttribute('aria-label', `Play ${e.title}`);
    play.appendChild(ssIcon('play', 24));
    play.addEventListener('click', (ev) => { ev.stopPropagation(); onAction('play', e); });
    cover.append(img, play);
    row.appendChild(cover);

    const playing = currentKey && ssHistoryKey(e) === currentKey;
    const text = ssEl('div', 'min-width:0;flex:1;display:flex;flex-direction:column;');
    text.appendChild(ssEl('div', `${ellipsis}font-size:1rem;font-weight:400;line-height:1.5;`
      + `color:${playing ? 'var(--text-bright-accent, #1ed760)' : 'var(--text-base, #fff)'};`, e.title));
    const artistLine = ssEl('div', `${ellipsis}font-size:.875rem;font-weight:400;line-height:1.43;color:var(--text-subdued, #b3b3b3);`);
    const artist = ssEl('span', 'cursor:pointer;', e.artist || '');
    artist.addEventListener('mouseenter', () => { artist.style.textDecoration = 'underline'; artist.style.color = 'var(--text-base, #fff)'; });
    artist.addEventListener('mouseleave', () => { artist.style.textDecoration = ''; artist.style.color = ''; });
    artist.addEventListener('click', (ev) => { ev.stopPropagation(); onAction('artist', e); });
    artist.addEventListener('dblclick', (ev) => ev.stopPropagation()); // goes to the artist, doesn't play
    // Right-click on the artist's name: the artist's menu instead of the song's.
    artist.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ssOpenMenu(e, ev.clientX, ev.clientY, onAction, SS_ARTIST_MENU);
    });
    artistLine.appendChild(artist);
    text.appendChild(artistLine);
    row.appendChild(text);

    const more = ssEl('button', 'flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;'
      + 'border:0;padding:0;border-radius:50%;background:none;color:var(--text-subdued, #b3b3b3);cursor:pointer;visibility:hidden;');
    more.type = 'button';
    more.setAttribute('aria-label', `More options for ${e.title}`);
    more.appendChild(ssIcon('more', 16));
    more.addEventListener('mouseenter', () => { more.style.color = '#fff'; });
    more.addEventListener('mouseleave', () => { more.style.color = 'var(--text-subdued, #b3b3b3)'; });
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const r = more.getBoundingClientRect();
      ssOpenMenu(e, r.right - 196, r.bottom + 4, onAction);
    });
    row.appendChild(more);
    const hover = (on) => {
      row.style.background = on ? 'rgba(255,255,255,.1)' : '';
      more.style.visibility = on ? 'visible' : 'hidden';
      play.style.display = on ? 'flex' : 'none';
    };
    row.addEventListener('mouseenter', () => hover(true));
    row.addEventListener('mouseleave', () => hover(false));
    list.appendChild(row);
  }
  return list;
}
