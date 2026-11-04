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

// entries: newest first. onPick(entry) is called on click. currentKey marks the playing song.
function ssBuildHistoryList(entries, onPick, currentKey) {
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
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,.1)'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
    row.addEventListener('click', () => onPick(e));

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

    row.appendChild(ssEl('div', 'flex:none;font-size:12px;color:#b3b3b3;', ssTimeAgo(e.playedAt)));
    list.appendChild(row);
  }
  return list;
}
