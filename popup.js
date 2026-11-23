// Settings panel, shown inside the Spotify page while the extension is on (an iframe opened
// from the speed button in the player bar). On/off itself is the toolbar icon or Alt+Shift+S.
// Two tabs: "Usual" (every song) and "This song" (settings of its own for the song playing in
// this tab, remembered and used every time it plays).
const SLIDERS = { speed: 1.25, pitch: 0, bass: 4, tail: 0, reverb: 0 };
const CHECKS = { tape: false };
const DEFAULTS = { ...SLIDERS, ...CHECKS };
const KEYS = Object.keys(DEFAULTS);
const SONG_MAX = 2000; // songs with their own settings kept (oldest dropped)
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tab')) || null;

const fmt = {
  speed: (v) => `${Number(v).toFixed(2)}×`,
  pitch: (v) => { const r = Math.round(v * 10) / 10; return r === 0 ? '0 st' : `${r > 0 ? '+' : ''}${r.toFixed(1)} st`; },
  bass: (v) => `+${Number(v).toFixed(1)} dB`,
  reverb: (v) => `${Math.round(v * 100)}%`,
  tail: (v) => `${Math.round(v * 100)}%`,
};

let usual = { ...DEFAULTS }; // the usual settings
let songMap = {}; // song key → its own settings
let song = null; // { key, title, artist }: what this tab is playing
let view = 'usual'; // which tab is shown: 'usual' | 'song'
// The "This song" switch. Stays on from song to song: while on, each song keeps its own
// settings; a song never changed plays with the usual ones until something is changed for it.
let songMode = false;

const own = () => (songMode && song && songMap[song.key]) || null;
const pick = (o) => Object.fromEntries(KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
// What the controls show: on "This song" with its own settings, those; otherwise the usual ones.
const shown = () => (view === 'song' && own() ? { ...usual, ...pick(own()) } : usual);
const editingSong = () => view === 'song' && songMode && !!song;

function showStatus(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

// Pitch slider shows how the song sounds compared with the original: 0 = original pitch.
// In tape mode the speed itself moves the pitch: the (greyed-out) slider just shows it.
const shownPitch = (s) => (s.tape ? 12 * Math.log2(s.speed) : Number(s.pitch || 0));

function setSlider(el, v) {
  el.value = v;
  const min = Number(el.min), max = Number(el.max);
  el.style.setProperty('--p', `${((Number(el.value) - min) / (max - min)) * 100}%`);
}

function render() {
  const s = shown();
  const has = !!own();
  $('tabUsual').classList.toggle('active', view === 'usual');
  $('tabSong').classList.toggle('active', view === 'song');
  $('tabUsual').setAttribute('aria-selected', view === 'usual');
  $('tabSong').setAttribute('aria-selected', view === 'song');
  $('tabSong').classList.toggle('has', has);
  $('tabSong').title = has ? 'This song has its own settings' : '';

  $('songBar').hidden = view !== 'song';
  $('songTitle').textContent = song?.title || 'Nothing playing yet';
  $('songArtist').textContent = song?.artist || '';
  $('songOwn').checked = songMode;
  $('songReset').hidden = !has;
  $('scopeHint').textContent = view === 'song'
    ? (!songMode ? 'Turn on to give each song its own settings, remembered for next time.'
      : !song ? 'Play a song to change its settings.'
        : has ? 'Saved for this song. Used every time it plays.'
          : 'Usual settings for now. Change anything to save it for this song.')
    : (has ? 'The song playing now uses its own settings (This song).' : '');
  $('controls').disabled = view === 'song' && !(songMode && song);

  for (const k of Object.keys(CHECKS)) $(k).checked = !!s[k];
  // Tape mode decides the pitch from the speed, so the pitch controls are greyed out.
  $('pitch').disabled = $('pitchReset').disabled = !!s.tape;
  $('pitchGroup').classList.toggle('locked', !!s.tape);
  $('pitchHint').textContent = s.tape ? 'Pitch follows speed, like a record.' : '';
  for (const k of Object.keys(SLIDERS)) {
    const v = k === 'pitch' ? shownPitch(s) : s[k];
    setSlider($(k), v);
    $(k + 'Out').textContent = fmt[k](v);
  }
  document.querySelectorAll('.presets button').forEach((b) =>
    b.classList.toggle('active', Math.abs(Number(b.dataset.speed) - s.speed) < 0.001));
}

// Keeps the newest songs with their own settings, at most SONG_MAX.
function trimSongs(map) {
  const keys = Object.keys(map);
  if (keys.length <= SONG_MAX) return map;
  keys.sort((a, b) => (map[a].savedAt || 0) - (map[b].savedAt || 0));
  for (const k of keys.slice(0, keys.length - SONG_MAX)) delete map[k];
  return map;
}

// A slider drag fires dozens of changes a second: show each at once, but store (and so send
// to the sound engine) at most once per frame, always the newest value.
let pendingUsual = null, pendingSongs = false;

// Small "Saved" note, shown while a song's own settings change and for a moment after.
let savedTimer = 0;
function showSaved(text = 'Saved') {
  const el = $('saved');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

function save(patch) {
  if (editingSong()) {
    const base = own() || { ...pick(usual), title: song.title, artist: song.artist };
    songMap = trimSongs({ ...songMap, [song.key]: { ...base, ...patch, savedAt: Date.now() } });
    pendingSongs = true;
    showSaved();
  } else {
    usual = { ...usual, ...patch };
    pendingUsual = { ...pendingUsual, ...patch };
  }
  render();
  requestAnimationFrame(flush);
}
function flush() {
  const p = pendingUsual;
  pendingUsual = null;
  if (p) chrome.storage.local.set(p);
  if (pendingSongs) { pendingSongs = false; chrome.storage.local.set({ songSettings: songMap }); }
}

for (const k of Object.keys(SLIDERS)) {
  $(k).addEventListener('input', (e) => {
    const v = Number(e.target.value);
    save({ [k]: k === 'pitch' ? Math.round(v * 100) / 100 : v });
  });
  $(k).addEventListener('change', flush); // drag ended: store right away
}
for (const k of Object.keys(CHECKS)) $(k).addEventListener('change', (e) => { save({ [k]: e.target.checked }); flush(); });
$('pitchReset').addEventListener('click', () => { save({ pitch: 0 }); flush(); });
document.querySelectorAll('.presets button').forEach((b) =>
  b.addEventListener('click', () => { save({ speed: Number(b.dataset.speed) }); flush(); }));

const showView = (v) => { view = v; $('saved').classList.remove('show'); render(); };
$('tabUsual').addEventListener('click', () => showView('usual'));
$('tabSong').addEventListener('click', () => showView('song'));
// On: each song keeps its own settings, from now until switched off. Off: usual settings for
// every song (what was saved stays for when it is switched on again).
$('songOwn').addEventListener('change', (e) => {
  songMode = e.target.checked;
  chrome.storage.local.set({ songMode });
  render();
  showSaved(songMode ? 'Each song keeps its own settings' : 'Usual settings for every song');
});
// Forget this song's own settings: back to the usual ones.
$('songReset').addEventListener('click', () => {
  if (!song) return;
  const map = { ...songMap };
  delete map[song.key];
  songMap = map;
  pendingSongs = true;
  render();
  flush();
  showSaved('Back to usual settings');
});

// App window (no toolbar icon): the panel has its own Turn off button.
if (params.get('app')) {
  $('turnOff').hidden = false;
  $('turnOff').addEventListener('click', () => chrome.runtime.sendMessage({ cmd: 'toggle', tabId }));
}
// Re-reads the extension from disk; the background reloads Spotify tabs afterwards. Only shown
// when Chrome still runs an older copy.
$('reloadExt').addEventListener('click', () => chrome.runtime.reload());
// Chrome's own page for extension keyboard shortcuts (only an extension page can open it).
$('shortcutLink').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// The panel is an iframe in the Spotify page: tell it how tall to be.
document.body.classList.add('embedded');
new ResizeObserver(() => parent.postMessage({ spotifyStretchHeight: document.body.scrollHeight + 32 }, '*'))
  .observe(document.body);

(async () => {
  usual = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  ({ songSettings: songMap = {}, songMode = false } = await chrome.storage.local.get(['songSettings', 'songMode']));
  const { songs = {} } = await chrome.storage.session.get('songs').catch(() => ({}));
  song = songs[tabId] || null;
  view = songMode ? 'song' : 'usual'; // opens on This song while the switch is on
  render();
  const state = await chrome.runtime.sendMessage({ cmd: 'status', tabId }).catch(() => null);
  // Chrome can keep running an old copy of the background after the files change.
  if (state && state.worker == null) {
    showStatus(`Chrome is still running an older copy. Reload to use v${chrome.runtime.getManifest().version}.`, true);
    $('reloadExt').hidden = false;
  }
  else if (state?.light) {
    $('lightHelp').hidden = false;
    $('lightKeys').textContent = state.shortcut ? `press ${state.shortcut}, ` : '';
  }
  else if (state?.latency) showStatus(`Running · ${state.latency.toFixed(2)} s delay`);
})();

// Changed elsewhere (another window, a new song): follow along, unless we have newer ones queued.
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'session' && c.songs) {
    song = c.songs.newValue?.[tabId] || null;
    render();
    return;
  }
  if (area !== 'local') return;
  let changed = false;
  if (c.songSettings && !pendingSongs) { songMap = c.songSettings.newValue || {}; changed = true; }
  if (c.songMode) { songMode = !!c.songMode.newValue; changed = true; }
  if (!pendingUsual) for (const k of KEYS) if (c[k]) { usual[k] = c[k].newValue; changed = true; }
  if (changed) render();
});
