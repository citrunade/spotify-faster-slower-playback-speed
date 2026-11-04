// Service worker: owns the capture state and keeps the page speed and the
// offscreen pitch correction in step.

const DEFAULTS = { speed: 1.25, pitch: 0, tape: false, bass: 4, reverb: 0, enabled: true };

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) });
const getState = async () => chrome.storage.session.get({ tabId: null, latency: null });

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

function sendRate(tabId, rate) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { cmd: 'rate', rate }).catch(() => {});
}

async function stop() {
  const { tabId } = await getState();
  await chrome.storage.session.set({ tabId: null, latency: null });
  sendRate(tabId, 1);
  if (await hasOffscreen()) {
    try { await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'stop' }); } catch {}
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

// streamId comes from the popup (user click). Without one we ask ourselves, which only
// works when Chrome was launched with --allowlisted-extension-id (the app window shortcut).
async function start(tabId, streamId) {
  const state = await getState();
  if (state.tabId != null) await stop();
  if (!streamId) streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const settings = await getSettings();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'start', streamId, settings });
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
      case 'start': return start(msg.tabId, msg.streamId);
      case 'stop': await stop(); return { ok: true };
      case 'status': return getState();
      case 'hello': return hello(sender);
      case 'ended': await stop(); return { ok: true };
    }
  })().then(
    (r) => reply(r ?? { ok: true }),
    (e) => reply({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});

// A Spotify page (re)loaded: tell it its speed, auto-start if allowed, and say whether
// it sits in an app window (no toolbar icon), where it should show its own settings button.
async function hello(sender) {
  const tab = sender.tab;
  if (!tab) return { rate: 1 };
  let appWindow = false;
  try { appWindow = (await chrome.windows.get(tab.windowId)).type !== 'normal'; } catch {}
  const settings = await getSettings();
  const { tabId } = await getState();
  if (tabId == null && settings.enabled && sender.frameId === 0) {
    // Don't make the page wait: start() sends the speed to the tab once audio is running.
    start(tab.id).catch(() => { /* normal Chrome: needs the icon click */ });
  }
  return { rate: tabId === tab.id ? settings.speed : 1, tabId: tab.id, appWindow };
}

// Snapshot of the audio side, stored so problems can be diagnosed afterwards.
async function saveDiag(reason) {
  await new Promise((r) => setTimeout(r, 1500));
  let audio;
  try { audio = await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'diag' }); }
  catch (e) { audio = { ok: false, error: String(e.message || e) }; }
  const { tabId } = await getState();
  await chrome.storage.local.set({ audioDiag: { at: Date.now(), reason, tabId, offscreen: await hasOffscreen(), audio } });
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(changes.speed || changes.pitch || changes.tape || changes.bass || changes.reverb)) return;
  const { tabId } = await getState();
  if (tabId == null) return;
  const settings = await getSettings();
  if (await hasOffscreen()) {
    chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'settings', settings }).catch(() => {});
  }
  if (changes.speed) sendRate(tabId, settings.speed);
  saveDiag(Object.keys(changes).join(','));
});

chrome.tabs.onRemoved.addListener(async (closedId) => {
  const { tabId } = await getState();
  if (closedId === tabId) stop();
});

// A fresh browser session never has a live capture.
chrome.runtime.onStartup.addListener(() => chrome.storage.session.set({ tabId: null, latency: null }));
