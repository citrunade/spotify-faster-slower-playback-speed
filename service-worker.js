// Service worker: owns the capture state and keeps the page speed and the
// offscreen pitch correction in step.

const DEFAULTS = {
  speed: 1.25, pitch: 0, tape: false, bass: 4, reverb: 0, tail: 0,
  // The on/off switch (toolbar icon): one setting for all of Chrome, kept across refreshes,
  // tabs and restarts.
  enabled: false,
  // "This song" switch: while on, each song keeps its own settings (songs never changed use the
  // usual ones). Off: every song uses the usual settings; saved ones are kept for next time.
  songMode: false,
};

const SOUND_KEYS = ['speed', 'pitch', 'tape', 'bass', 'reverb', 'tail'];
const getState = async () => chrome.storage.session.get({ tabId: null, latency: null });

// Per-song settings. session `songs`: { [tabId]: { key, title, artist } }, what each Spotify tab
// is playing. local `songSettings`: { [song key]: { speed, pitch, …, title, artist, savedAt } },
// songs given their own settings in the panel's "This song" tab.
async function ownSettings(tabId) {
  if (tabId == null) return null;
  const { songs = {} } = await chrome.storage.session.get('songs');
  const key = songs[tabId]?.key;
  if (!key) return null;
  const { songSettings = {} } = await chrome.storage.local.get('songSettings');
  return songSettings[key] || null;
}

// The settings a tab plays with: the usual ones, or its song's own. No tab given: the tab with
// the full sound engine.
async function getSettings(tabId) {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  if (tabId === undefined) ({ tabId } = await getState());
  const own = s.songMode ? await ownSettings(tabId) : null;
  if (own) for (const k of SOUND_KEYS) if (own[k] !== undefined) s[k] = own[k];
  return s;
}

async function hasOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctxs.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Process captured Spotify tab audio: pitch correction, bass and reverb.',
  });
}

// on: whether the page shows its speed button (only while on, like the YouTube version).
// light: switched on but this tab's sound isn't captured (capture needs a click on the icon in
// that tab): the page uses Chrome's own pitch-keeping speed change instead.
function sendRate(tabId, rate, on = true, light = false) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { cmd: 'rate', rate, on, light }).catch(() => {});
}

// Every open Spotify tab: the full engine's tab its speed, the others light mode or off.
async function sendRateAll() {
  const { tabId } = await getState();
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' }).catch(() => []);
  for (const t of tabs) {
    const s = await getSettings(t.id);
    if (!s.enabled) sendRate(t.id, 1, false);
    else sendRate(t.id, s.speed, true, t.id !== tabId);
  }
}

// Stops the sound engine. The switch itself is untouched: if it is still on, that tab carries
// on in light mode.
async function stop() {
  const { tabId } = await getState();
  await chrome.storage.session.set({ tabId: null, latency: null });
  await sendRateAll();
  if (await hasOffscreen()) {
    try { await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'stop' }); } catch {}
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

// streamId comes from the popup (user click). Without one we ask ourselves, which only
// works when Chrome was launched with --allowlisted-extension-id (the app window shortcut).
// Bumped when this file changes, so the panel can tell when Chrome still runs an older copy.
const WORKER = 9;
const START_TIMEOUT_MS = 15000;

// One start at a time: a page hello and a click arriving together must not race. A start that
// never finishes must not block every later click, so it is given up on after 20 s.
let starting = null;
function start(tabId, streamId) {
  if (!starting) {
    starting = Promise.race([
      startNow(tabId, streamId),
      new Promise((_, no) => setTimeout(() => no(new Error('Starting took too long')), START_TIMEOUT_MS + 5000)),
    ]).finally(() => { starting = null; });
  }
  return starting;
}

async function startNow(tabId, streamId) {
  const state = await getState();
  if (state.tabId != null) await stop();
  if (!streamId) streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const settings = await getSettings(tabId);
  // If the audio side never answers, the tab stays captured (and silent): give up and release it.
  const res = await Promise.race([
    chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'start', streamId, settings }),
    new Promise((r) => setTimeout(() => r({ ok: false, error: 'Audio processing did not start in time' }), START_TIMEOUT_MS)),
  ]);
  if (!res?.ok) {
    await stop();
    throw new Error(res?.error || 'Audio processing failed to start');
  }
  await chrome.storage.session.set({ tabId, latency: res.latency });
  sendRate(tabId, settings.speed);
  saveDiag('start');
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === 'offscreen') return false;
  (async () => {
    switch (msg?.cmd) {
      case 'stop': await stop(); return { ok: true };
      // From the app window's own button / panel (no toolbar icon there).
      case 'toggle': await toggle(await chrome.tabs.get(msg.tabId ?? sender.tab?.id)); return { ok: true };
      case 'status': {
        const st = await getState();
        const { enabled } = await getSettings();
        return { ...st, enabled, light: enabled && msg.tabId != null && msg.tabId !== st.tabId, worker: WORKER, shortcut: await shortcutKeys() };
      }
      case 'hello': reloadIfFilesChanged(); return hello(sender);
      case 'song': await onSong(sender, msg); return { ok: true };
      case 'ended': await stop(); return { ok: true };
    }
  })().then(
    (r) => reply(r ?? { ok: true }),
    (e) => reply({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});

// A Spotify page (re)loaded: tell it its speed and auto-start if allowed (works in the app
// window shortcut; in normal Chrome capture needs the icon click or Alt+Shift+S).
async function hello(sender) {
  const tab = sender.tab;
  if (!tab) return { rate: 1 };
  let appWindow = false;
  try { appWindow = (await chrome.windows.get(tab.windowId)).type !== 'normal'; } catch {}
  // The app window starts on by itself (that is what it is for) until switched off there.
  if (appWindow && (await chrome.storage.local.get('enabled')).enabled === undefined) await chrome.storage.local.set({ enabled: true });
  const settings = await getSettings(tab.id);
  const { tabId } = await getState();
  if (tabId == null && settings.enabled && sender.frameId === 0) {
    // Don't make the page wait: start() sends the speed to the tab once audio is running.
    start(tab.id).catch((e) => {
      // In normal Chrome this is expected (needs the icon click); keep it for diagnosis anyway.
      chrome.storage.local.set({ lastStartError: { at: Date.now(), auto: true, error: String(e?.message || e) } });
    });
  }
  // Switched on: this tab gets the speed right away (light until its sound is captured).
  const on = !!settings.enabled;
  return { rate: on ? settings.speed : 1, on, light: on && tabId !== tab.id, tabId: tab.id, appWindow, shortcut: await shortcutKeys() };
}

// Snapshot of the audio side, stored so problems can be diagnosed afterwards.
let diagTimer = 0;
function saveDiag(reason) {
  // Once, after things settle (not on every slider tick).
  clearTimeout(diagTimer);
  diagTimer = setTimeout(() => saveDiagNow(reason), 1500);
}
async function saveDiagNow(reason) {
  let audio;
  try { audio = await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'diag' }); }
  catch (e) { audio = { ok: false, error: String(e.message || e) }; }
  const { tabId } = await getState();
  await chrome.storage.local.set({ audioDiag: { at: Date.now(), reason, tabId, offscreen: await hasOffscreen(), audio } });
}

// Settings changed: pass them on. A slider drag fires many changes; push one at a time and
// always the newest, so a slow, older push can never land last and undo the newest value.
let pushing = false, pushAgain = false, speedChanged = false;
async function pushSettings() {
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  try {
    do {
      pushAgain = false;
      const { tabId } = await getState();
      if (tabId == null) return;
      const settings = await getSettings();
      if (await hasOffscreen()) {
        await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'settings', settings }).catch(() => {});
      }
      if (speedChanged) { speedChanged = false; sendRate(tabId, settings.speed); sendRateAllLight(); }
    } while (pushAgain);
  } finally {
    pushing = false;
  }
}

// Light tabs follow the chosen speed too (their song's own, if it has one).
async function sendRateAllLight() {
  if (!(await chrome.storage.local.get({ enabled: false })).enabled) return;
  const { tabId } = await getState();
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' }).catch(() => []);
  for (const t of tabs) if (t.id !== tabId) sendRate(t.id, (await getSettings(t.id)).speed, true, true);
}

// A tab started another song: switch to that song's own settings, or back to the usual ones.
async function onSong(sender, { key, title, artist }) {
  const tabId = sender.tab?.id;
  if (tabId == null || sender.frameId !== 0 || !key) return;
  const { songs = {} } = await chrome.storage.session.get('songs');
  if (songs[tabId]?.key === key) return;
  songs[tabId] = { key, title: String(title || ''), artist: String(artist || '') };
  await chrome.storage.session.set({ songs });
  const s = await getSettings(tabId);
  if (!s.enabled) return;
  const { tabId: engine } = await getState();
  if (tabId === engine) { speedChanged = true; pushSettings(); }
  else sendRate(tabId, s.speed, true, true);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) { updateBadge(); sendRateAll(); }
  const perSong = changes.songSettings || changes.songMode;
  if (area === 'local' && (changes.speed || perSong)) sendRateAllLight();
  if (area !== 'local' || !(perSong || SOUND_KEYS.some((k) => changes[k]))) return;
  if (changes.speed || perSong) speedChanged = true;
  pushSettings();
  saveDiag(Object.keys(changes).join(','));
});

// On/off: the toolbar icon or the keyboard shortcut (Alt+Shift+S by default). Both count as
// invoking the extension on that tab, which Chrome requires before it allows tab capture.
const isSpotifyUrl = (u) => /^https:\/\/open\.spotify\.com\//.test(u || '');
// Each click leaves a note of how far it got (lastClick), so a click that "does nothing" can be
// traced afterwards.
async function toggle(tab) {
  const note = (step, extra = {}) => chrome.storage.local.set({ lastClick: { at: Date.now(), step, tabId: tab?.id, ...extra } }).catch(() => {});
  try {
    note('clicked');
    // One switch for all of Chrome, remembered across refreshes, tabs and restarts.
    const { enabled } = await getSettings();
    const url = tab?.id ? tab.url || (await chrome.tabs.get(tab.id).catch(() => null))?.url : null;
    if (enabled) {
      // On, clicked in a Spotify tab that only has the speed: give it the full sound engine
      // instead of turning off. A click in the tab that already has it turns off.
      const { tabId } = await getState();
      if (isSpotifyUrl(url) && tab.id !== tabId) {
        note('upgrading');
        await start(tab.id);
        await sendRateAll();
        note('upgraded to full sound');
        return;
      }
      await chrome.storage.local.set({ enabled: false }); // every Spotify tab back to normal
      await stop();
      note('turned off');
      return;
    }
    await chrome.storage.local.set({ enabled: true }); // every Spotify tab gets the speed (light)
    // Clicked on a Spotify tab: that one gets the full engine.
    if (!url || !isSpotifyUrl(url)) { note('turned on (not on a Spotify tab)', { url: (url || '').slice(0, 60) }); return; }
    note('starting');
    await start(tab.id);
    await sendRateAll(); // after the "all tabs light" round, so this tab ends on the full engine
    note('turned on');
  } catch (e) {
    const error = String(e?.message || e);
    note('failed', { error });
    chrome.storage.local.set({ lastStartError: { at: Date.now(), auto: false, error } });
    if (tab?.id) toast(tab.id, `Sound engine couldn't start (speed still applies): ${error}`);
  }
}
const toast = (tabId, text) => chrome.tabs.sendMessage(tabId, { cmd: 'toast', text }, { frameId: 0 }).catch(() => {});

// The keys of the on/off shortcut as Chrome shows them ("Alt+Shift+S"), '' when none is set.
async function shortcutKeys() {
  try { return (await chrome.commands.getAll()).find((c) => c.name === 'toggle')?.shortcut || ''; } catch { return ''; }
}

// Right-click menu item: Chrome counts a click on it, like one on the toolbar icon, as the
// action it needs before the extension may capture a tab's sound. It turns the extension on
// if needed and gives this tab the full sound engine; it never turns anything off.
const MENU_ID = 'smooth-sound';
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID, title: 'Faster / Slower: smooth sound in this tab', contexts: ['all'], documentUrlPatterns: ['https://open.spotify.com/*'],
    }, () => void chrome.runtime.lastError);
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  try {
    const { tabId } = await getState();
    if (tab.id === tabId) { toast(tab.id, 'Smooth sound is already on in this tab.'); return; }
    await chrome.storage.local.set({ enabled: true });
    await start(tab.id);
    await sendRateAll();
    toast(tab.id, 'Smooth sound on in this tab.');
  } catch (e) {
    const error = String(e?.message || e);
    chrome.storage.local.set({ lastStartError: { at: Date.now(), auto: false, error } });
    toast(tab.id, `Sound engine couldn't start (speed still applies): ${error}`);
  }
});
chrome.action.onClicked.addListener(async (tab) => { if (!(await reloadIfFilesChanged())) toggle(tab); });
// Loaded from a folder (unpacked): when the folder holds a newer version, reload, so every
// Chrome profile using the folder picks it up (a second profile, like the app window, otherwise
// keeps running its old copy). Checked when this script starts, when a page loads and on clicks.
async function reloadIfFilesChanged() {
  try {
    if ((await chrome.management.getSelf()).installType !== 'development') return;
    const disk = await (await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' })).json();
    if (!disk.version || disk.version === chrome.runtime.getManifest().version) return false;
    // One try per new version every 10 min, so a reload that doesn't take can't loop.
    const { reloadTry } = await chrome.storage.local.get('reloadTry');
    if (reloadTry?.version === disk.version && Date.now() - reloadTry.at < 10 * 60e3) return false;
    await chrome.storage.local.set({ reloadTry: { version: disk.version, at: Date.now() } });
    chrome.runtime.reload();
    return true;
  } catch {}
  return false;
}
reloadIfFilesChanged();

// Note when this background script last loaded (to tell "never ran" from "ran and failed").
chrome.storage.local.set({ backgroundLoadedAt: Date.now(), backgroundWorker: WORKER }).catch(() => {});
chrome.commands.onCommand.addListener((command, tab) => { if (command === 'toggle') toggle(tab); });

// Toolbar badge: OFF while switched off, nothing while on.
async function updateBadge() {
  const { enabled } = await getSettings();
  chrome.action.setBadgeBackgroundColor({ color: '#5f5f5f' }).catch(() => {});
  chrome.action.setBadgeTextColor?.({ color: '#fff' })?.catch?.(() => {});
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' }).catch(() => {});
}
updateBadge();

chrome.tabs.onRemoved.addListener(async (closedId) => {
  const { tabId } = await getState();
  if (closedId === tabId) stop();
  const { songs } = await chrome.storage.session.get('songs');
  if (songs?.[closedId]) { delete songs[closedId]; await chrome.storage.session.set({ songs }); }
});

// After an install, update or "Reload extension", open Spotify pages still talk to the old
// copy; reload them so they pick up the new one (and auto-start again in the app window).
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'update') return;
  await chrome.storage.session.set({ tabId: null, latency: null }); // capture ended with the old copy
  // Tempo measuring and matching were removed: drop what they left behind.
  await chrome.storage.session.remove(['song', 'autoSpeed']).catch(() => {});
  await chrome.storage.local.remove(['bpmCache', 'bpmMatch', 'targetBpm', 'bpmUp', 'bpmDown', 'bpmCap', 'bpmCapMax']).catch(() => {});
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
  for (const t of tabs) chrome.tabs.reload(t.id).catch(() => {});
});

// A fresh browser session never has a live capture.
chrome.runtime.onStartup.addListener(() => chrome.storage.session.set({ tabId: null, latency: null, songs: {} }));
