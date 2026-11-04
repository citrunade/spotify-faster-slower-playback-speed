// Audio graph shared by the offscreen document and the test page:
// input -> Signalsmith Stretch (pitch) -> low shelf (bass) -> dry + reverb + low bloom + drum tail
// -> safety limiter -> output.
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

// Short, dark tail used for "low bloom": low-passed noise fading over ~1.2 s.
function makeBloomImpulse(ctx, seconds = 1.2) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const a = Math.exp(-2 * Math.PI * 180 / rate); // one-pole low-pass at ~180 Hz
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      y = a * y + (1 - a) * (Math.random() * 2 - 1);
      d[i] = y * Math.pow(1 - i / len, 2.5);
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < len; i++) d[i] /= peak * 40;
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

  // Everything meets here, then a limiter so stacked effects can't clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  limiter.connect(ctx.destination);

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx);
  bass.connect(dry).connect(limiter);
  bass.connect(verb).connect(wet).connect(limiter);

  // Low bloom: only the low end (bass, kick) gets a ~1 s dark tail, so it rings into the next hit.
  const bloomSplit = ctx.createBiquadFilter();
  bloomSplit.type = 'lowpass'; bloomSplit.frequency.value = 160; bloomSplit.Q.value = 0.7;
  const bloomVerb = ctx.createConvolver();
  bloomVerb.normalize = false;
  bloomVerb.buffer = makeBloomImpulse(ctx);
  const bloom = ctx.createGain();
  bass.connect(bloomSplit).connect(bloomVerb).connect(bloom).connect(limiter);

  // Drum tail: drum ranges only (snare body ~220 Hz, crack/hats above 5 kHz, kick below 120 Hz)
  // go through a transient sustainer that lets hits decay longer.
  await ctx.audioWorklet.addModule(new URL('./drum-tail-worklet.js', import.meta.url).href);
  const tail = new AudioWorkletNode(ctx, 'drum-tail', { outputChannelCount: [2] });
  const drumIn = ctx.createGain();
  const kick = ctx.createBiquadFilter(); kick.type = 'lowpass'; kick.frequency.value = 120;
  const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 220; body.Q.value = 0.8;
  const crack = ctx.createBiquadFilter(); crack.type = 'highpass'; crack.frequency.value = 5000;
  for (const f of [kick, body, crack]) { bass.connect(f); f.connect(drumIn); }
  drumIn.connect(tail).connect(limiter);

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
    set(bloom.gain, Math.max(0, Math.min(1, Number(s.bloom) || 0)) * 0.9);
    set(tail.parameters.get('amount'), Math.max(0, Math.min(1, Number(s.tail) || 0)));
  };
  apply(settings, false);

  const latency = await stretch.latency();
  return {
    stretch,
    output: limiter,
    latency,
    apply,
    diag: () => ({ ctx: ctx.state, inDb: level(meterIn), outDb: level(meterOut), applied }),
    disconnect() {
      try { input.disconnect(); } catch {}
      try { stretch.stop(); stretch.disconnect(); } catch {}
    },
  };
}
