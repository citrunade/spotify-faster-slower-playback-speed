// Isolated-world bridge: passes the speed from the extension to the page script.
const setRate = (rate) =>
  document.dispatchEvent(new CustomEvent('spotifystretch:rate', { detail: rate }));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.cmd === 'rate') setRate(msg.rate);
  if (msg?.cmd === 'ping') reply({ ok: true });
});

chrome.runtime.sendMessage({ cmd: 'getRate' })
  .then((r) => { if (r?.rate && r.rate !== 1) setRate(r.rate); })
  .catch(() => {});
