// Service worker: owns the capture state and keeps the page speed, the picture delay and the
// offscreen pitch correction in step.

const DEFAULTS = { speed: 1.25, pitch: 0, tape: false, bass: 0, reverb: 0, tail: 0, picture: true, sync: 0 };
const START_TIMEOUT_MS = 15000;

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) });
const getState = async () => chrome.storage.session.get({ tabId: null, latency: null, ad: false });

async function hasOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctxs.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Process captured YouTube tab audio: pitch correction, bass and reverb.',
  });
}

// What the page should do: speed, and how far to hold the picture back so it lines up with
// the processed (slightly late) sound. delay null = picture delay off.
async function pagePlan() {
  const { tabId, latency } = await getState();
  const s = await getSettings();
  if (tabId == null) return { rate: 1, delay: null };
  const delay = s.picture ? Math.max(0, (latency || 0) * 1000 + Number(s.sync || 0)) : null;
  return { rate: s.speed, delay };
}

async function sendPlan(tabId) {
  if (tabId == null) return;
  const plan = await pagePlan();
  chrome.tabs.sendMessage(tabId, { cmd: 'plan', ...plan }).catch(() => {});
}

// During an ad the page plays at normal speed, so the sound must not be pitch-corrected.
async function audioSettings() {
  const s = await getSettings();
  const { ad } = await getState();
  return ad ? { ...s, speed: 1 } : s;
}

async function stop() {
  const { tabId } = await getState();
  await chrome.storage.session.set({ tabId: null, latency: null, ad: false });
  if (tabId != null) chrome.tabs.sendMessage(tabId, { cmd: 'plan', rate: 1, delay: null }).catch(() => {});
  if (await hasOffscreen()) {
    try { await chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'stop' }); } catch {}
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

let starting = null;
function start(tabId, streamId) {
  if (!starting) starting = startNow(tabId, streamId).finally(() => { starting = null; });
  return starting;
}

async function startNow(tabId, streamId) {
  const state = await getState();
  if (state.tabId != null) await stop();
  if (!streamId) streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const settings = await getSettings();
  const res = await Promise.race([
    chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'start', streamId, settings }),
    new Promise((r) => setTimeout(() => r({ ok: false, error: 'Audio processing did not start in time' }), START_TIMEOUT_MS)),
  ]);
  if (!res?.ok) {
    await stop();
    throw new Error(res?.error || 'Audio processing failed to start');
  }
  await chrome.storage.session.set({ tabId, latency: res.latency, ad: false });
  await sendPlan(tabId);
  return res;
}

async function pushAudio() {
  if (!(await hasOffscreen())) return;
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'settings', settings: await audioSettings() }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === 'offscreen') return false;
  (async () => {
    switch (msg?.cmd) {
      case 'start': return start(msg.tabId, msg.streamId);
      case 'stop': await stop(); return { ok: true };
      case 'status': return getState();
      case 'ended': await stop(); return { ok: true };
      // A YouTube page (re)loaded or navigated: tell it what to do.
      case 'hello': {
        const { tabId } = await getState();
        return sender.tab && sender.tab.id === tabId ? pagePlan() : { rate: 1, delay: null };
      }
      case 'ad': {
        const { tabId, ad } = await getState();
        if (sender.tab?.id !== tabId || !!msg.ad === ad) return { ok: true };
        await chrome.storage.session.set({ ad: !!msg.ad });
        await pushAudio();
        return { ok: true };
      }
      case 'diag':
        return hasOffscreen().then((has) => (has ? chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'diag' }) : null));
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
  if (changes.speed || changes.pitch || changes.tape || changes.bass || changes.reverb || changes.tail) await pushAudio();
  if (changes.speed || changes.picture || changes.sync) await sendPlan(tabId);
});

chrome.tabs.onRemoved.addListener(async (closedId) => {
  const { tabId } = await getState();
  if (closedId === tabId) stop();
});

chrome.runtime.onStartup.addListener(() => chrome.storage.session.set({ tabId: null, latency: null, ad: false }));
