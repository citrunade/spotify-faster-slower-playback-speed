// "Drum tail": a transient sustainer. It follows the signal's loudness with a fast and a
// slow envelope. Right after a hit the fast one falls away while the slow one is still
// high; that gap is the hit's decay, and that's the part this lets through, louder.
// Steady sounds (held vocals, pads) keep both envelopes equal and pass nothing.
// Output is meant to be ADDED to the dry signal (parallel), scaled by `amount`.
class DrumTail extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    const c = (sec) => Math.exp(-1 / (sec * sampleRate));
    this.fastAtk = c(0.001); this.fastRel = c(0.025);
    this.slowAtk = c(0.02); this.slowRel = c(0.6);
    this.fast = 0; this.slow = 0; this.gain = 0;
    this.smooth = c(0.005);
  }

  process(inputs, outputs, params) {
    const input = inputs[0], output = outputs[0];
    const amount = params.amount[0];
    if (!input.length) return true;
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (const ch of input) { const v = Math.abs(ch[i]); if (v > x) x = v; }
      this.fast = x > this.fast ? this.fastAtk * this.fast + (1 - this.fastAtk) * x : this.fastRel * this.fast + (1 - this.fastRel) * x;
      this.slow = x > this.slow ? this.slowAtk * this.slow + (1 - this.slowAtk) * x : this.slowRel * this.slow + (1 - this.slowRel) * x;
      // How far into a decay we are: 0 on steady sound, grows as a hit fades.
      const decay = Math.min(8, Math.max(0, this.slow / (this.fast + 1e-5) - 1));
      const target = decay * amount * 1.5;
      this.gain = this.smooth * this.gain + (1 - this.smooth) * target;
      for (let c = 0; c < output.length; c++) {
        const src = input[c] || input[0];
        output[c][i] = src[i] * this.gain;
      }
    }
    return true;
  }
}

registerProcessor('drum-tail', DrumTail);
