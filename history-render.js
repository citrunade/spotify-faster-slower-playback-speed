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
  like: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.25-3.5h1.5v2.75h2.75v1.5H8.75v2.75h-1.5V8.75H4.5v-1.5h2.75z',
  radio: 'M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM4.11 3.05l1.06 1.06a5 5 0 0 0 0 7.78l-1.06 1.06a6.5 6.5 0 0 1 0-9.9zm7.78 0a6.5 6.5 0 0 1 0 9.9l-1.06-1.06a5 5 0 0 0 0-7.78z',
  artist: 'M8 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 4.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0zM1.5 15.5c0-3 2.9-5 6.5-5s6.5 2 6.5 5H13c0-2-2.1-3.5-5-3.5S3 13.5 3 15.5z',
  album: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-1.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM5.25 8a2.75 2.75 0 1 1 5.5 0 2.75 2.75 0 0 1-5.5 0z',
  remove: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm4.5-.75h7v1.5h-7z',
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
  svg.appendChild(path);
  return svg;
}

// null = divider line.
const SS_MENU = [
  ['play', 'Play'],
  ['queue', 'Add to queue'],
  ['like', 'Add to Liked Songs'],
  null,
  ['radio', 'Go to song radio'],
  ['artist', 'Go to artist'],
  ['album', 'Go to album'],
  null,
  ['remove', 'Remove from history'],
];

const SS_FONT = 'font-family:var(--encore-body-font-stack, inherit);';

async function ssRemoveFromHistory(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  const i = history.findIndex((e) => e.playedAt === entry.playedAt && ssHistoryKey(e) === ssHistoryKey(entry));
  if (i >= 0) { history.splice(i, 1); await chrome.storage.local.set({ history }); }
}

// Desktop-style menu for one song, at (x, y) in the viewport.
function ssOpenMenu(entry, x, y, onAction) {
  document.getElementById('ss-history-menu')?.remove();
  const menu = ssEl('div', 'position:fixed;z-index:2147483647;min-width:196px;max-width:350px;padding:4px;'
    + 'background:#282828;border-radius:4px;box-shadow:0 16px 24px rgba(0,0,0,.3),0 6px 8px rgba(0,0,0,.2);'
    + `${SS_FONT}font-size:.875rem;font-weight:400;line-height:1.25;`);
  menu.id = 'ss-history-menu';
  menu.setAttribute('role', 'menu');
  let lastWasDivider = true;
  for (const it of SS_MENU) {
    if (!it) {
      if (!lastWasDivider) menu.appendChild(ssEl('div', 'height:1px;margin:4px 0;background:rgba(255,255,255,.1);'));
      lastWasDivider = true;
      continue;
    }
    const [action, label] = it;
    if (action === 'album' && !entry.albumUrl) continue;
    if (action === 'artist' && !entry.artistUrl) continue;
    const item = ssEl('button', 'display:flex;align-items:center;gap:12px;width:100%;height:40px;padding:12px 8px 12px 12px;'
      + 'border:0;border-radius:2px;background:none;color:rgba(255,255,255,.9);font:inherit;text-align:left;cursor:default;white-space:nowrap;');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.append(ssIcon(action), ssEl('span', 'overflow:hidden;text-overflow:ellipsis;', label));
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.1)'; item.style.color = '#fff'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'none'; item.style.color = 'rgba(255,255,255,.9)'; });
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
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'mousedown' && menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('mousedown', close, true);
    document.removeEventListener('keydown', close, true);
  };
  setTimeout(() => {
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', close, true);
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
    play.appendChild(ssIcon('play', 16));
    play.addEventListener('click', (ev) => { ev.stopPropagation(); onAction('play', e); });
    cover.append(img, play);
    row.appendChild(cover);

    const playing = currentKey && ssHistoryKey(e) === currentKey;
    const text = ssEl('div', 'min-width:0;flex:1;display:flex;flex-direction:column;');
    text.appendChild(ssEl('div', `${ellipsis}font-size:1rem;font-weight:400;line-height:1.5;`
      + `color:${playing ? 'var(--text-bright-accent, #1ed760)' : 'var(--text-base, #fff)'};`, e.title));
    text.appendChild(ssEl('div', `${ellipsis}font-size:.875rem;font-weight:400;line-height:1.43;color:var(--text-subdued, #b3b3b3);`, e.artist || ''));
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
