const SLIDERS = { speed: 1.25, pitch: 0, sync: 0, bass: 0, tail: 0, reverb: 0 };
const DEFAULTS = { ...SLIDERS, tape: false, picture: true };
const $ = (id) => document.getElementById(id);
const power = $('power'), status = $('status');
let tab = null;

const fmt = {
  speed: (v) => `${Number(v).toFixed(2)}×`,
  pitch: (v) => { const r = Math.round(v * 10) / 10; return r === 0 ? '0 st' : `${r > 0 ? '+' : ''}${r.toFixed(1)} st`; },
  sync: (v) => (Number(v) === 0 ? '0 ms' : `${v > 0 ? '+' : ''}${v} ms`),
  bass: (v) => `+${Number(v).toFixed(1)} dB`,
  reverb: (v) => `${Math.round(v * 100)}%`,
  tail: (v) => `${Math.round(v * 100)}%`,
};

const isYouTube = (t) => !!t?.url && /^https:\/\/(www|m|music)\.youtube\.com\//.test(t.url);

function showStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

// Pitch slider shows how it sounds compared with the original: 0 = original pitch.
// In tape mode the speed itself moves the pitch: the (greyed-out) slider just shows it.
const shownPitch = (s) => (s.tape ? 12 * Math.log2(s.speed) : Number(s.pitch || 0));

function render(s) {
  $('tape').checked = !!s.tape;
  $('pitch').disabled = $('pitchReset').disabled = !!s.tape;
  $('pitch').closest('section').classList.toggle('locked', !!s.tape);
  $('pitchHint').textContent = s.tape
    ? 'Tape mode: pitch moves with speed (slowed = deeper, sped up = higher). Turn it off to set the pitch yourself.'
    : 'Pitch stays original at any speed (0 st). Drag to shift it.';
  $('picture').checked = !!s.picture;
  $('sync').disabled = !s.picture;
  for (const k of Object.keys(SLIDERS)) {
    const v = k === 'pitch' ? shownPitch(s) : s[k];
    $(k).value = v;
    $(k + 'Out').textContent = fmt[k](v);
  }
  document.querySelectorAll('.presets button').forEach((b) =>
    b.classList.toggle('active', Math.abs(Number(b.dataset.speed) - s.speed) < 0.001));
}

function setOn(on, latency) {
  power.setAttribute('aria-pressed', String(on));
  power.textContent = on ? 'On' : 'Off';
  if (on) showStatus(latency ? `Running — sound about ${latency.toFixed(2)} s behind, picture matched` : 'Running');
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
    save({ [k]: k === 'pitch' ? Math.round(v * 100) / 100 : v });
  });
}
$('tape').addEventListener('change', (e) => save({ tape: e.target.checked }));
$('picture').addEventListener('change', (e) => save({ picture: e.target.checked }));
$('pitchReset').addEventListener('click', () => save({ pitch: 0 }));
document.querySelectorAll('.presets button').forEach((b) =>
  b.addEventListener('click', () => save({ speed: Number(b.dataset.speed) })));

power.addEventListener('click', async () => {
  power.disabled = true;
  try {
    if (power.getAttribute('aria-pressed') === 'true') {
      await chrome.runtime.sendMessage({ cmd: 'stop' });
      setOn(false);
      showStatus('Off — YouTube plays normally.');
    } else {
      showStatus('Starting…');
      // Ask for the capture first, while the click still counts as the user's gesture.
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const ready = await chrome.tabs.sendMessage(tab.id, { cmd: 'ping' }, { frameId: 0 }).catch(() => null);
      if (!ready) throw new Error('Reload the YouTube tab once (it was open before the extension was installed), then try again.');
      const res = await chrome.runtime.sendMessage({ cmd: 'start', tabId: tab.id, streamId });
      if (!res?.ok) throw new Error(res?.error || 'Could not start');
      setOn(true, res.latency);
    }
  } catch (e) {
    setOn(false);
    showStatus(String(e.message || e), true);
  } finally {
    power.disabled = !isYouTube(tab);
  }
});

$('version').textContent = `v${chrome.runtime.getManifest().version}`;

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  current = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  render(current);
  const state = await chrome.runtime.sendMessage({ cmd: 'status' });
  const onHere = state?.tabId != null && state.tabId === tab?.id;
  setOn(onHere, state?.latency);
  if (!isYouTube(tab)) {
    power.disabled = !onHere;
    if (!onHere) showStatus('Open a YouTube video in this tab first.');
  } else if (!onHere) {
    showStatus(state?.tabId != null ? 'Running in another tab — turning on here moves it.' : 'Off — YouTube plays normally.');
  }
})();
