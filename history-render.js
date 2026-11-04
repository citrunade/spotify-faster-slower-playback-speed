// Shared by the page (content script) and the settings panel: draws the
// "Recently played" list. Built with DOM calls only (song titles are untrusted text).

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

const SS_MENU = [
  ['play', 'Play'],
  ['queue', 'Add to queue'],
  ['like', 'Add to Liked Songs'],
  ['radio', 'Go to song radio'],
  ['album', 'Go to album'],
  ['artist', 'Go to artist'],
  ['remove', 'Remove from history'],
];

async function ssRemoveFromHistory(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  const i = history.findIndex((e) => e.playedAt === entry.playedAt && ssHistoryKey(e) === ssHistoryKey(entry));
  if (i >= 0) { history.splice(i, 1); await chrome.storage.local.set({ history }); }
}

// Desktop-style menu for one song, at (x, y) in the viewport.
function ssOpenMenu(entry, x, y, onAction) {
  document.getElementById('ss-history-menu')?.remove();
  const menu = ssEl('div', 'position:fixed;z-index:2147483647;min-width:190px;padding:4px;background:#282828;'
    + 'border-radius:4px;box-shadow:0 16px 24px rgba(0,0,0,.3),0 6px 8px rgba(0,0,0,.2);font:14px system-ui,sans-serif;');
  menu.id = 'ss-history-menu';
  for (const [action, label] of SS_MENU) {
    if (action === 'album' && !entry.albumUrl) continue;
    if (action === 'artist' && !entry.artistUrl) continue;
    const item = ssEl('div', 'padding:10px 12px;color:#e5e5e5;border-radius:2px;cursor:pointer;white-space:nowrap;', label);
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.1)'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      if (action === 'remove') ssRemoveFromHistory(entry);
      else onAction(action, entry);
    });
    menu.appendChild(item);
  }
  document.documentElement.appendChild(menu);
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

// entries: newest first. onAction(action, entry): click = 'play'; the ⋯ button or a right-click
// opens a menu with the other actions. currentKey marks the playing song.
function ssBuildHistoryList(entries, onAction, currentKey) {
  const list = ssEl('div', 'display:flex;flex-direction:column;gap:2px;');
  if (!entries.length) {
    list.appendChild(ssEl('div', 'color:#b3b3b3;font-size:13px;padding:16px 8px;line-height:1.4;',
      'Nothing yet. Songs show up here once they have played for a few seconds.'));
    return list;
  }
  for (const e of entries) {
    const row = ssEl('div', 'display:flex;gap:12px;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;');
    row.className = 'ss-history-row';
    row.title = e.albumUrl ? `Play “${e.title}”` : e.title;
    row.addEventListener('click', () => onAction('play', e));
    row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ssOpenMenu(e, ev.clientX, ev.clientY, onAction); });

    const img = ssEl('img', 'width:40px;height:40px;border-radius:4px;flex:none;object-fit:cover;background:#333;');
    if (e.cover) img.src = e.cover;
    img.alt = '';
    row.appendChild(img);

    const text = ssEl('div', 'min-width:0;flex:1;');
    const playing = currentKey && ssHistoryKey(e) === currentKey;
    const ellipsis = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    text.appendChild(ssEl('div', `${ellipsis}font-size:14px;color:${playing ? '#1ed760' : '#fff'};`, e.title));
    text.appendChild(ssEl('div', `${ellipsis}font-size:13px;color:#b3b3b3;`, e.artist || ''));
    row.appendChild(text);

    const time = ssEl('div', 'flex:none;font-size:12px;color:#b3b3b3;', ssTimeAgo(e.playedAt));
    row.appendChild(time);
    const more = ssEl('button', 'flex:none;width:28px;height:28px;border:0;border-radius:50%;background:none;'
      + 'color:#fff;font:700 16px/1 system-ui,sans-serif;cursor:pointer;display:none;', '⋯');
    more.title = `More options for ${e.title}`;
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const r = more.getBoundingClientRect();
      ssOpenMenu(e, r.right - 190, r.bottom + 4, onAction);
    });
    row.appendChild(more);
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,.1)'; more.style.display = 'block'; time.style.display = 'none'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; more.style.display = 'none'; time.style.display = ''; });
    list.appendChild(row);
  }
  return list;
}
