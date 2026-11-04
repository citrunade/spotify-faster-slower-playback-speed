const SLIDERS = { speed: 1.25, pitch: 0, bass: 4, reverb: 0 };
const DEFAULTS = { ...SLIDERS, tape: false };
const $ = (id) => document.getElementById(id);
const power = $('power'), status = $('status');
let tab = null;
// Opened inside the Spotify page (app window) instead of from the toolbar icon.
const embeddedTab = Number(new URLSearchParams(location.search).get('tab')) || null;

const fmt = {
  speed: (v) => `${Number(v).toFixed(2)}×`,
  pitch: (v) => (Number(v) === 0 ? '0 st' : `${v > 0 ? '+' : ''}${Number(v)} st`),
  bass: (v) => `+${Number(v).toFixed(1)} dB`,
  reverb: (v) => `${Math.round(v * 100)}%`,
};

function showStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function render(settings) {
  $('tape').checked = !!settings.tape;
  $('pitchHint').textContent = settings.tape
    ? 'Tape mode: pitch moves with speed (slowed = deeper, sped up = higher).'
    : 'Pitch stays original at any speed. Shift it here.';
  for (const k of Object.keys(SLIDERS)) {
    $(k).value = settings[k];
    $(k + 'Out').textContent = fmt[k](settings[k]);
  }
  document.querySelectorAll('.presets button').forEach((b) =>
    b.classList.toggle('active', Math.abs(Number(b.dataset.speed) - settings.speed) < 0.001));
}

function setOn(on, latency) {
  power.setAttribute('aria-pressed', String(on));
  power.textContent = on ? 'On' : 'Off';
  if (on) showStatus(latency ? `Running — about ${latency.toFixed(2)} s delay` : 'Running');
}

let current = { ...DEFAULTS };
async function save(patch) {
  current = { ...current, ...patch };
  render(current);
  await chrome.storage.local.set(patch);
}

for (const k of Object.keys(SLIDERS)) {
  $(k).addEventListener('input', (e) => save({ [k]: Number(e.target.value) }));
}
$('tape').addEventListener('change', (e) => save({ tape: e.target.checked }));
$('pitchReset').addEventListener('click', () => save({ pitch: 0 }));
// Inside the Spotify page the panel is an iframe: tell it how tall to be.
if (embeddedTab) {
  new ResizeObserver(() => parent.postMessage({ spotifyStretchHeight: document.body.scrollHeight + 32 }, '*'))
    .observe(document.body);
}
document.querySelectorAll('.presets button').forEach((b) =>
  b.addEventListener('click', () => save({ speed: Number(b.dataset.speed) })));

power.addEventListener('click', async () => {
  power.disabled = true;
  try {
    if (power.getAttribute('aria-pressed') === 'true') {
      await chrome.storage.local.set({ enabled: false });
      await chrome.runtime.sendMessage({ cmd: 'stop' });
      setOn(false);
      showStatus('Off — Spotify plays normally.');
    } else {
      showStatus('Starting…');
      await chrome.storage.local.set({ enabled: true });
      // From the toolbar: ask for the capture first, while the click still counts as the
      // user's gesture. Embedded in the app window, the background asks for it itself.
      const streamId = embeddedTab ? null
        : await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const ready = await chrome.tabs.sendMessage(tab.id, { cmd: 'ping' }, { frameId: 0 }).catch(() => null);
      if (!ready) throw new Error('Reload the Spotify tab once (it was open before the extension was installed), then try again.');
      const res = await chrome.runtime.sendMessage({ cmd: 'start', tabId: tab.id, streamId });
      if (!res?.ok) throw new Error(res?.error || 'Could not start');
      setOn(true, res.latency);
    }
  } catch (e) {
    setOn(false);
    let text = String(e.message || e);
    // Normal Chrome window: capture needs a click on the toolbar icon first.
    if (embeddedTab && /invoked|activeTab/i.test(text)) text = 'In a normal Chrome window, click the Spotify Stretch icon in the toolbar to turn it on.';
    showStatus(text, true);
  } finally {
    power.disabled = !isSpotify(tab);
  }
});

const isSpotify = (t) => !!t?.url && t.url.startsWith('https://open.spotify.com/');

(async () => {
  if (embeddedTab) {
    document.body.classList.add('embedded');
    tab = await chrome.tabs.get(embeddedTab);
  } else {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  current = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  render(current);
  const state = await chrome.runtime.sendMessage({ cmd: 'status' });
  const onHere = state?.tabId != null && state.tabId === tab?.id;
  setOn(onHere, state?.latency);
  if (!isSpotify(tab)) {
    power.disabled = !onHere;
    if (!onHere) showStatus('Open open.spotify.com in this tab first.');
  } else if (!onHere) {
    showStatus(state?.tabId != null ? 'Running in another tab — turning on here moves it.' : 'Off — Spotify plays normally.');
  }
})();
