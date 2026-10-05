/**
 * Procedural placeholder sound effects (Web Audio). Each recipe schedules a
 * handful of oscillator/noise nodes and returns its duration in seconds.
 * These are honest placeholders — swap any of them for recorded audio via the
 * `src` field in src/config/audio.ts.
 */
import type { SynthRecipe } from '../config/audio';

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  attack?: number;
  vol?: number;
  delay?: number;
  vibratoHz?: number;
  vibratoDepth?: number;
  curve?: 'exp' | 'lin';
}

interface NoiseOpts {
  dur: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  vol?: number;
  delay?: number;
  attack?: number;
}

let noiseBuffer: AudioBuffer | null = null;

function getNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t0: number, o: ToneOpts, pitch: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  const start = t0 + (o.delay ?? 0);
  const f0 = o.freq * pitch;
  osc.frequency.setValueAtTime(f0, start);
  if (o.freqEnd !== undefined) {
    const f1 = Math.max(1, o.freqEnd * pitch);
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(f1, start + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(f1, start + o.dur);
  }
  if (o.vibratoHz) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vibratoHz;
    lg.gain.value = (o.vibratoDepth ?? 0.03) * f0;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + o.dur + 0.05);
  }
  const vol = o.vol ?? 0.5;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + o.dur + 0.05);
}

function noise(ctx: BaseAudioContext, out: AudioNode, t0: number, o: NoiseOpts, pitch: number): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const start = t0 + (o.delay ?? 0);
  const g = ctx.createGain();
  let node: AudioNode = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime((o.freq ?? 1000) * pitch, start);
    if (o.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd * pitch), start + o.dur);
    f.Q.value = o.q ?? 1;
    src.connect(f);
    node = f;
  }
  const vol = o.vol ?? 0.4;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
  node.connect(g).connect(out);
  src.start(start, Math.random() * 0.5);
  src.stop(start + o.dur + 0.05);
}

/** Schedules the recipe on `out`; `pitch` multiplies frequencies; `intensity` 0–1 scales some recipes. */
export function playRecipe(ctx: BaseAudioContext, out: AudioNode, recipe: SynthRecipe, pitch = 1, intensity = 1): number {
  const t = ctx.currentTime + 0.005;
  const T = (o: ToneOpts) => tone(ctx, out, t, o, pitch);
  const N = (o: NoiseOpts) => noise(ctx, out, t, o, pitch);
  switch (recipe) {
    case 'hover': T({ type: 'sine', freq: 1500, freqEnd: 1800, dur: 0.05, vol: 0.25 }); return 0.06;
    case 'click': T({ type: 'triangle', freq: 520, freqEnd: 880, dur: 0.07, vol: 0.5 }); N({ dur: 0.03, filter: 'highpass', freq: 3000, vol: 0.15 }); return 0.08;
    case 'clickSoft': T({ type: 'sine', freq: 700, freqEnd: 980, dur: 0.06, vol: 0.4 }); return 0.07;
    case 'back': T({ type: 'triangle', freq: 820, freqEnd: 460, dur: 0.09, vol: 0.45 }); return 0.1;
    case 'denied': T({ type: 'square', freq: 180, dur: 0.09, vol: 0.18 }); T({ type: 'square', freq: 150, dur: 0.12, vol: 0.18, delay: 0.1 }); return 0.25;
    case 'chaChing':
      N({ dur: 0.08, filter: 'bandpass', freq: 2500, q: 0.8, vol: 0.35 });
      N({ dur: 0.07, filter: 'bandpass', freq: 3500, q: 1.2, vol: 0.3, delay: 0.08 });
      T({ type: 'sine', freq: 2093, dur: 0.6, vol: 0.32, delay: 0.14 });
      T({ type: 'sine', freq: 2637, dur: 0.7, vol: 0.28, delay: 0.17 });
      T({ type: 'sine', freq: 3136, dur: 0.6, vol: 0.18, delay: 0.2 });
      return 0.9;
    case 'chestClunk':
      T({ type: 'sine', freq: 140, freqEnd: 70, dur: 0.22, vol: 0.6 });
      N({ dur: 0.12, filter: 'bandpass', freq: 700, q: 2, vol: 0.4 });
      return 0.25;
    case 'chestJingle':
      for (let i = 0; i < 6; i++) T({ type: 'sine', freq: 1800 + i * 260 + (i % 2) * 400, dur: 0.25, vol: 0.18, delay: i * 0.05 });
      return 0.6;
    case 'paperStamp':
      N({ dur: 0.12, filter: 'bandpass', freq: 2200, q: 0.7, vol: 0.25 });
      T({ type: 'sine', freq: 160, freqEnd: 60, dur: 0.14, vol: 0.55, delay: 0.1 });
      N({ dur: 0.05, filter: 'lowpass', freq: 900, vol: 0.4, delay: 0.1 });
      return 0.3;
    case 'gearClick':
      N({ dur: 0.025, filter: 'highpass', freq: 2500, vol: 0.4 });
      N({ dur: 0.025, filter: 'highpass', freq: 2800, vol: 0.35, delay: 0.06 });
      T({ type: 'square', freq: 3200, dur: 0.05, vol: 0.06, delay: 0.06 });
      return 0.15;
    case 'bobber':
      T({ type: 'sine', freq: 280, freqEnd: 900, dur: 0.16, vol: 0.45 });
      N({ dur: 0.18, filter: 'highpass', freq: 1500, freqEnd: 6000, vol: 0.12, delay: 0.02 });
      return 0.22;
    case 'bell':
      T({ type: 'sine', freq: 880, dur: 1.1, vol: 0.35 });
      T({ type: 'sine', freq: 1760 * 1.01, dur: 0.7, vol: 0.15 });
      T({ type: 'triangle', freq: 2640, dur: 0.35, vol: 0.08 });
      return 1.2;
    case 'boing': {
      const f = 240 + intensity * 260;
      T({ type: 'sine', freq: f * 1.6, freqEnd: f, dur: 0.18 + intensity * 0.08, vol: 0.25 + intensity * 0.3, vibratoHz: 22, vibratoDepth: 0.06 });
      return 0.28;
    }
    case 'pop': T({ type: 'sine', freq: 600, freqEnd: 1300, dur: 0.07, vol: 0.5 }); N({ dur: 0.04, filter: 'bandpass', freq: 2000, vol: 0.2 }); return 0.1;
    case 'scoreChime':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => T({ type: 'triangle', freq: f, dur: 0.28, vol: 0.32, delay: i * 0.06 }));
      T({ type: 'sine', freq: 2093, dur: 0.4, vol: 0.12, delay: 0.24 });
      return 0.7;
    case 'thud': T({ type: 'sine', freq: 110 + intensity * 60, freqEnd: 50, dur: 0.12, vol: 0.4 + intensity * 0.3 }); N({ dur: 0.05, filter: 'lowpass', freq: 600, vol: 0.25 }); return 0.14;
    case 'heartbeat': T({ type: 'sine', freq: 70, freqEnd: 45, dur: 0.12, vol: 0.6 }); T({ type: 'sine', freq: 65, freqEnd: 42, dur: 0.12, vol: 0.45, delay: 0.18 }); return 0.35;
    case 'chomp':
      N({ dur: 0.06, filter: 'bandpass', freq: 900, q: 1.5, vol: 0.5 });
      N({ dur: 0.06, filter: 'bandpass', freq: 800, q: 1.5, vol: 0.5, delay: 0.12 });
      T({ type: 'sine', freq: 320, freqEnd: 120, dur: 0.18, vol: 0.4, delay: 0.24 });
      return 0.45;
    case 'whoosh': N({ dur: 0.28, filter: 'bandpass', freq: 500, freqEnd: 2200, q: 1.2, vol: 0.35, attack: 0.05 }); return 0.3;
    case 'beepLow': T({ type: 'square', freq: 330, dur: 0.07, vol: 0.12 }); T({ type: 'square', freq: 262, dur: 0.09, vol: 0.12, delay: 0.1 }); return 0.22;
    case 'deflate': N({ dur: 0.45, filter: 'lowpass', freq: 1800, freqEnd: 200, vol: 0.4, attack: 0.02 }); T({ type: 'sine', freq: 300, freqEnd: 90, dur: 0.45, vol: 0.2 }); return 0.5;
    case 'fanfare':
      [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [783.99, 0.52], [1046.5, 0.64]].forEach(([f, d]) => {
        T({ type: 'sawtooth', freq: f!, dur: 0.22, vol: 0.12, delay: d! });
        T({ type: 'triangle', freq: f!, dur: 0.24, vol: 0.22, delay: d! });
      });
      T({ type: 'triangle', freq: 1318.5, dur: 0.6, vol: 0.2, delay: 0.8 });
      return 1.5;
    case 'clang':
      T({ type: 'triangle', freq: 660, dur: 0.9, vol: 0.32 });
      T({ type: 'sine', freq: 1580, dur: 0.6, vol: 0.18 });
      T({ type: 'sine', freq: 2410, dur: 0.4, vol: 0.12 });
      N({ dur: 0.06, filter: 'highpass', freq: 2000, vol: 0.3 });
      return 1.0;
    case 'swoosh': N({ dur: 0.45, filter: 'bandpass', freq: 2500, freqEnd: 400, q: 1.5, vol: 0.35, attack: 0.1 }); return 0.5;
    case 'wahWah':
      T({ type: 'sawtooth', freq: 392, freqEnd: 370, dur: 0.35, vol: 0.12, vibratoHz: 5, vibratoDepth: 0.02 });
      T({ type: 'sawtooth', freq: 349, freqEnd: 330, dur: 0.35, vol: 0.12, delay: 0.38, vibratoHz: 5, vibratoDepth: 0.02 });
      T({ type: 'sawtooth', freq: 311, freqEnd: 260, dur: 0.8, vol: 0.12, delay: 0.76, vibratoHz: 6, vibratoDepth: 0.03 });
      return 1.6;
    case 'cry':
      T({ type: 'sine', freq: 700, freqEnd: 420, dur: 0.45, vol: 0.25, vibratoHz: 9, vibratoDepth: 0.05 });
      T({ type: 'sine', freq: 650, freqEnd: 380, dur: 0.6, vol: 0.22, delay: 0.5, vibratoHz: 9, vibratoDepth: 0.06 });
      return 1.15;
    case 'tromboneSad':
      [[294, 0, 0.42], [277, 0.45, 0.42], [262, 0.9, 0.42], [247, 1.35, 1.1]].forEach(([f, d, du]) => {
        T({ type: 'sawtooth', freq: f!, freqEnd: f! * 0.985, dur: du!, vol: 0.14, delay: d!, vibratoHz: d! > 1.3 ? 6 : 0, vibratoDepth: 0.025 });
        T({ type: 'triangle', freq: f! / 2, dur: du!, vol: 0.12, delay: d! });
      });
      return 2.6;
    case 'starDing': T({ type: 'sine', freq: 1046.5 * (0.9 + intensity * 0.35), dur: 0.35, vol: 0.3 }); T({ type: 'triangle', freq: 2093 * (0.9 + intensity * 0.35), dur: 0.2, vol: 0.1 }); return 0.4;
    case 'coin': T({ type: 'square', freq: 988, dur: 0.05, vol: 0.08 }); T({ type: 'square', freq: 1319, dur: 0.12, vol: 0.08, delay: 0.05 }); return 0.18;
    case 'fwip': N({ dur: 0.12, filter: 'bandpass', freq: 1200, freqEnd: 4000, q: 2, vol: 0.3 }); T({ type: 'sine', freq: 500, freqEnd: 1100, dur: 0.1, vol: 0.3, delay: 0.08 }); return 0.22;
    case 'chains':
      for (let i = 0; i < 7; i++) {
        N({ dur: 0.04, filter: 'bandpass', freq: 3000 + (i % 3) * 900, q: 6, vol: 0.25, delay: i * 0.045 + (i % 2) * 0.012 });
        T({ type: 'triangle', freq: 2200 + (i % 4) * 330, dur: 0.06, vol: 0.05, delay: i * 0.045 });
      }
      return 0.4;
    case 'woodCreak': T({ type: 'sawtooth', freq: 140, freqEnd: 190, dur: 0.35, vol: 0.06, vibratoHz: 30, vibratoDepth: 0.08, curve: 'lin' }); return 0.4;
    case 'woodKnock': T({ type: 'sine', freq: 230, freqEnd: 160, dur: 0.1, vol: 0.5 }); N({ dur: 0.05, filter: 'bandpass', freq: 1100, q: 3, vol: 0.3 }); return 0.12;
    case 'reel': for (let i = 0; i < 10; i++) N({ dur: 0.015, filter: 'highpass', freq: 4000, vol: 0.25, delay: i * 0.03 }); return 0.32;
    case 'splash': N({ dur: 0.35, filter: 'lowpass', freq: 3000, freqEnd: 500, vol: 0.4, attack: 0.01 }); T({ type: 'sine', freq: 400, freqEnd: 900, dur: 0.08, vol: 0.2 }); return 0.4;
    case 'gong': T({ type: 'sine', freq: 196, dur: 1.6, vol: 0.4 }); T({ type: 'sine', freq: 294 * 1.01, dur: 1.2, vol: 0.18 }); T({ type: 'sine', freq: 523, dur: 0.6, vol: 0.08 }); return 1.7;
    case 'puff': N({ dur: 0.18, filter: 'lowpass', freq: 1400, freqEnd: 300, vol: 0.35 }); return 0.2;
    case 'slideSeal': N({ dur: 0.35, filter: 'bandpass', freq: 1800, freqEnd: 700, q: 2, vol: 0.25 }); T({ type: 'sine', freq: 500, freqEnd: 350, dur: 0.2, vol: 0.15 }); return 0.36;
    case 'growl': T({ type: 'sawtooth', freq: 95, freqEnd: 80, dur: 0.35, vol: 0.12, vibratoHz: 28, vibratoDepth: 0.12 }); return 0.36;
    case 'knockLow': T({ type: 'sine', freq: 170 + intensity * 50, freqEnd: 110, dur: 0.09, vol: 0.45 }); N({ dur: 0.04, filter: 'bandpass', freq: 800, q: 4, vol: 0.28 }); return 0.11;
    case 'cheep':
      T({ type: 'sine', freq: 2600, freqEnd: 3400, dur: 0.06, vol: 0.22 });
      T({ type: 'sine', freq: 2900, freqEnd: 3900, dur: 0.07, vol: 0.2, delay: 0.09 });
      return 0.18;
    case 'gateChime': T({ type: 'triangle', freq: 1318.5, dur: 0.18, vol: 0.18 }); T({ type: 'triangle', freq: 1975.5, dur: 0.24, vol: 0.12, delay: 0.06 }); return 0.32;
    case 'bearGrowl': T({ type: 'sawtooth', freq: 78, freqEnd: 62, dur: 0.55, vol: 0.14, vibratoHz: 22, vibratoDepth: 0.15, attack: 0.05 }); N({ dur: 0.45, filter: 'lowpass', freq: 500, vol: 0.12, attack: 0.05 }); return 0.6;
    case 'wolfYip': T({ type: 'triangle', freq: 620, freqEnd: 980, dur: 0.12, vol: 0.22 }); T({ type: 'triangle', freq: 900, freqEnd: 560, dur: 0.16, vol: 0.18, delay: 0.12 }); return 0.3;
    case 'sealBark': for (let i = 0; i < 2; i++) { T({ type: 'square', freq: 260, freqEnd: 180, dur: 0.09, vol: 0.1, delay: i * 0.16 }); N({ dur: 0.08, filter: 'bandpass', freq: 900, q: 2, vol: 0.15, delay: i * 0.16 }); } return 0.3;
    case 'sprintEnd': N({ dur: 0.16, filter: 'bandpass', freq: 1400, freqEnd: 500, q: 1.2, vol: 0.2 }); return 0.18;
    case 'skid': N({ dur: 0.22, filter: 'highpass', freq: 3500, freqEnd: 2500, vol: 0.12, attack: 0.02 }); return 0.24;
    case 'bubble': T({ type: 'sine', freq: 500 + intensity * 400, freqEnd: 1300 + intensity * 500, dur: 0.07, vol: 0.18 }); return 0.08;
    case 'munch': for (let i = 0; i < 3; i++) N({ dur: 0.05, filter: 'bandpass', freq: 1300, q: 3, vol: 0.22, delay: i * 0.09 }); return 0.3;
    case 'sprinkle': for (let i = 0; i < 7; i++) T({ type: 'sine', freq: 1800 + (i % 3) * 420, dur: 0.05, vol: 0.08, delay: i * 0.035 }); return 0.3;
    case 'titleUnlock':
      [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => T({ type: 'triangle', freq: f, dur: 0.32, vol: 0.26, delay: i * 0.08 }));
      T({ type: 'sine', freq: 2637, dur: 0.5, vol: 0.08, delay: 0.32 });
      return 0.85;
    case 'mapWhoosh': N({ dur: 0.35, filter: 'bandpass', freq: 600, freqEnd: 1800, q: 0.9, vol: 0.18, attack: 0.08 }); return 0.36;
    case 'lampClick': T({ type: 'square', freq: 1400, dur: 0.02, vol: 0.08 }); T({ type: 'sine', freq: 520, dur: 0.12, vol: 0.12, delay: 0.02 }); return 0.15;
    case 'brandMotif': {
      // Inverse Smiles motif: a little minor "frown" figure that turns major — the sad mouth flipping into a smile.
      [[392, 0], [311.13, 0.12]].forEach(([f, d]) => T({ type: 'triangle', freq: f!, dur: 0.16, vol: 0.22, delay: d }));
      [[392, 0.34], [493.88, 0.44], [587.33, 0.54], [783.99, 0.66]].forEach(([f, d]) => T({ type: 'triangle', freq: f!, dur: 0.3, vol: 0.26, delay: d }));
      T({ type: 'sine', freq: 1567.98, dur: 0.6, vol: 0.08, delay: 0.66 });
      N({ dur: 0.08, filter: 'bandpass', freq: 2400, q: 3, vol: 0.12, delay: 0.92 });
      return 1.4;
    }
  }
}
