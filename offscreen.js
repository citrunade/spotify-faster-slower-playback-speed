// Offscreen document: receives the captured tab audio, corrects the pitch and plays it.
import { buildChain } from './audio-chain.js';

let ctx = null, stream = null, chain = null;

async function start(streamId, settings) {
  await stop();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  ctx = new AudioContext({ latencyHint: 'playback' });
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  chain = await buildChain(ctx, src, settings);
  globalThis.__spotifyStretchChain = chain; // for diagnostics from DevTools
  stream.getAudioTracks().forEach((t) => {
    t.onended = () => chrome.runtime.sendMessage({ cmd: 'ended' }).catch(() => {});
  });
  const outLatency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
  return { ok: true, latency: chain.latency + outLatency };
}

async function stop() {
  chain?.disconnect();
  chain = null;
  stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  stream = null;
  if (ctx) { try { await ctx.close(); } catch {} }
  ctx = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen') return false;
  (async () => {
    if (msg.cmd === 'start') return start(msg.streamId, msg.settings);
    if (msg.cmd === 'stop') { await stop(); return { ok: true }; }
    if (msg.cmd === 'settings') { chain?.apply(msg.settings); return { ok: true }; }
    if (msg.cmd === 'diag') return chain ? { ok: true, ...chain.diag() } : { ok: false, error: 'no audio chain' };
  })().then(
    (r) => reply(r ?? { ok: true }),
    (e) => reply({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});
