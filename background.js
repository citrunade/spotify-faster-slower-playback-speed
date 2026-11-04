// Service worker: owns the capture state and keeps the page speed and the
// offscreen pitch correction in step.

const DEFAULTS = { speed: 1.25, bass: 4, reverb: 0 };

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

async function start(tabId, streamId) {
  const state = await getState();
  if (state.tabId != null) await stop();
  await ensureOffscreen();
  const settings = await getSettings();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'start', streamId, settings });
  if (!res?.ok) {
    await stop();
    throw new Error(res?.error || 'Audio processing failed to start');
  }
  await chrome.storage.session.set({ tabId, latency: res.latency });
  sendRate(tabId, settings.speed);
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === 'offscreen') return false;
  (async () => {
    switch (msg?.cmd) {
      case 'start': return start(msg.tabId, msg.streamId);
      case 'stop': await stop(); return { ok: true };
      case 'status': return getState();
      case 'getRate': {
        const { tabId } = await getState();
        if (sender.tab && sender.tab.id === tabId) return { rate: (await getSettings()).speed };
        return { rate: 1 };
      }
      case 'ended': await stop(); return { ok: true };
    }
  })().then(
    (r) => reply(r ?? { ok: true }),
    (e) => reply({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  const { tabId } = await getState();
  if (tabId == null) return;
  const settings = await getSettings();
  if (await hasOffscreen()) {
    chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'settings', settings }).catch(() => {});
  }
  if (changes.speed) sendRate(tabId, settings.speed);
});

chrome.tabs.onRemoved.addListener(async (closedId) => {
  const { tabId } = await getState();
  if (closedId === tabId) stop();
});

// A fresh browser session never has a live capture.
chrome.runtime.onStartup.addListener(() => chrome.storage.session.set({ tabId: null, latency: null }));
