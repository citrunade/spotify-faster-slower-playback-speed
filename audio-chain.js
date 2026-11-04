// Audio graph shared by the offscreen document and the test page:
// input -> Signalsmith Stretch (pitch down) -> low shelf (bass) -> dry + reverb -> output.
import SignalsmithStretch from './lib/SignalsmithStretch.mjs';

// Load the worklet from the bundled file instead of a blob: URL (MV3 CSP forbids blob scripts).
SignalsmithStretch.moduleUrl = new URL('./lib/SignalsmithStretch.mjs', import.meta.url).href;

export const semitonesFor = (speed) => -12 * Math.log2(speed);
// Total shift: undo the speed's pitch change (unless tape mode), then the user's own shift.
export const shiftFor = (s) => (s.tape ? 0 : semitonesFor(s.speed)) + (Number(s.pitch) || 0);

function makeImpulse(ctx, seconds = 2.4, decay = 3.2) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const pre = Math.floor(rate * 0.012);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export async function buildChain(ctx, input, settings) {
  const stretch = await SignalsmithStretch(ctx, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  input.connect(stretch);
  // Level meters for diagnostics (input before, output after pitch correction).
  const meterIn = ctx.createAnalyser(), meterOut = ctx.createAnalyser();
  meterIn.fftSize = meterOut.fftSize = 2048;
  input.connect(meterIn);
  stretch.connect(meterOut);
  const level = (an) => {
    const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b);
    let s = 0; for (const v of b) s += v * v;
    const rms = Math.sqrt(s / b.length);
    return rms > 0 ? Math.round(20 * Math.log10(rms)) : -999;
  };
  let applied = null;

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 120;
  stretch.connect(bass);

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx);
  bass.connect(dry).connect(ctx.destination);
  bass.connect(verb).connect(wet).connect(ctx.destination);

  stretch.start();

  const apply = (s, smooth = true) => {
    const t = ctx.currentTime;
    const set = (p, v) => (smooth ? p.setTargetAtTime(v, t, 0.05) : (p.value = v));
    applied = { semitones: Math.round(shiftFor(s) * 100) / 100, speed: s.speed, pitch: s.pitch, tape: !!s.tape };
    stretch.schedule({ semitones: shiftFor(s) });
    set(bass.gain, s.bass);
    const r = Math.max(0, Math.min(1, s.reverb));
    set(wet.gain, r * 0.5);
    set(dry.gain, 1 - r * 0.25);
  };
  apply(settings, false);

  const latency = await stretch.latency();
  return {
    stretch,
    latency,
    apply,
    diag: () => ({ ctx: ctx.state, inDb: level(meterIn), outDb: level(meterOut), applied }),
    disconnect() {
      try { input.disconnect(); } catch {}
      try { stretch.stop(); stretch.disconnect(); } catch {}
    },
  };
}
