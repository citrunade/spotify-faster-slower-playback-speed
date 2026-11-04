const SLIDERS = { speed: 1.25, pitch: 0, bass: 4, bloom: 0, tail: 0, reverb: 0 };
const DEFAULTS = { ...SLIDERS, tape: false };
const $ = (id) => document.getElementById(id);
const power = $('power'), status = $('status');
let tab = null;
// Opened inside the Spotify page (app window) instead of from the toolbar icon.
const embeddedTab = Number(new URLSearchParams(location.search).get('tab')) || null;

const fmt = {
  speed: (v) => `${Number(v).toFixed(2)}×`,
  pitch: (v) => { const r = Math.round(v * 10) / 10; return r === 0 ? '0 st' : `${r > 0 ? '+' : ''}${r.toFixed(1)} st`; },
  bass: (v) => `+${Number(v).toFixed(1)} dB`,
  reverb: (v) => `${Math.round(v * 100)}%`,
  bloom: (v) => `${Math.round(v * 100)}%`,
  tail: (v) => `${Math.round(v * 100)}%`,
};

function showStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

// Pitch slider shows how the song sounds compared with the original: 0 = original pitch.
// In tape mode the speed itself moves the pitch, so the slider moves with speed.
// Only the user's own offset on top of that is stored.
const autoShift = (s) => (s.tape ? 12 * Math.log2(s.speed) : 0);
const shownPitch = (s) => autoShift(s) + Number(s.pitch || 0);

function render(settings) {
  $('tape').checked = !!settings.tape;
  $('pitchHint').textContent = settings.tape
    ? 'Tape mode: pitch moves with speed (slowed = deeper, sped up = higher). Drag to shift on top; Reset follows speed again.'
    : 'Pitch stays original at any speed (0 st). Drag to shift it.';
  for (const k of Object.keys(SLIDERS)) {
    const v = k === 'pitch' ? shownPitch(settings) : settings[k];
    $(k).value = v;
    $(k + 'Out').textContent = fmt[k](v);
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
  $(k).addEventListener('input', (e) => {
    const v = Number(e.target.value);
    // Slider value is the total shift; store only the part on top of the automatic one.
    save({ [k]: k === 'pitch' ? Math.round((v - autoShift(current)) * 100) / 100 : v });
  });
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

// ---- Recently played -----------------------------------------------------------
async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  $('historyList').replaceChildren(ssBuildHistoryList(history, pickHistory, null));
}
function pickHistory(action, entry) {
  if (embeddedTab) parent.postMessage({ spotifyStretchAction: { action, entry } }, '*');
  else if (isSpotify(tab)) { chrome.tabs.sendMessage(tab.id, { cmd: 'historyAction', action, entry }).catch(() => {}); window.close(); }
}
function showView(history) {
  $('viewHistory').hidden = !history;
  $('viewSettings').hidden = history;
  $('tabHistory').classList.toggle('active', history);
  $('tabSettings').classList.toggle('active', !history);
  if (history) renderHistory();
}
$('tabSettings').addEventListener('click', () => showView(false));
$('tabHistory').addEventListener('click', () => showView(true));
$('historyClear').addEventListener('click', async () => { await chrome.storage.local.set({ history: [] }); renderHistory(); });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.history && !$('viewHistory').hidden) renderHistory(); });

$('version').textContent = `v${chrome.runtime.getManifest().version}`;
// Re-reads the extension from disk; the background reloads Spotify tabs afterwards.
$('reloadExt').addEventListener('click', () => chrome.runtime.reload());

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
