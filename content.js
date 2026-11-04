// Isolated-world bridge: passes the speed from the extension to the page script,
// and in an app window (no toolbar icon) adds a small settings button to the page.
const setRate = (rate) =>
  document.dispatchEvent(new CustomEvent('spotifystretch:rate', { detail: rate }));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.cmd === 'rate') setRate(msg.rate);
  if (msg?.cmd === 'ping') reply({ ok: true });
});

chrome.runtime.sendMessage({ cmd: 'hello' })
  .then((r) => {
    if (r?.rate && r.rate !== 1) setRate(r.rate);
    if (r?.appWindow && window === window.top) addPanelButton(r.tabId);
  })
  .catch(() => {});

function addPanelButton(tabId) {
  const mount = () => {
    const host = document.createElement('div');
    host.id = 'spotify-stretch-host';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .btn { position: fixed; right: 16px; bottom: 104px; z-index: 2147483647;
          width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
          background: #1ed760; color: #000; font: 700 15px/36px system-ui, sans-serif;
          box-shadow: 0 2px 10px rgba(0,0,0,.5); opacity: .85; }
        .btn:hover { opacity: 1; }
        iframe { position: fixed; right: 16px; bottom: 148px; z-index: 2147483647;
          width: 280px; height: 330px; border: 0; border-radius: 10px;
          box-shadow: 0 6px 24px rgba(0,0,0,.6); background: #121212; display: none; }
        iframe.open { display: block; }
      </style>
      <button class="btn" title="Spotify Stretch settings">×</button>`;
    const btn = root.querySelector('.btn');
    btn.textContent = '×'; // multiplication sign, as in "1.25×"
    let frame = null;
    btn.addEventListener('click', () => {
      if (!frame) {
        frame = document.createElement('iframe');
        frame.src = chrome.runtime.getURL(`popup.html?tab=${tabId}`);
        root.appendChild(frame);
      }
      frame.classList.toggle('open');
    });
    document.documentElement.appendChild(host);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
