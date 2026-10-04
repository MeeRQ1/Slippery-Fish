/**
 * The Slippery Fish theme — an ORIGINAL tune composed for this game and
 * synthesized live with Web Audio (no recordings, no samples, no licensed
 * material). An 8-bar loop in C major (I–vi–IV–V) at 108 BPM whose melody
 * "slips" between some notes with a short pitch glide.
 *
 * Arrangements:
 *  theme — melody, bass, light drums (main menu and its signs)
 *  map   — melody an octave lower + 16th arpeggios, soft drums (Adventure map)
 *  calm  — pad + gentle arpeggio, no drums (Daily, Infinite, Fishing)
 *
 * Scheduling uses the audio clock with a short look-ahead, so the loop is
 * seamless and pauses automatically when the AudioContext is suspended
 * (tab hidden). Volume/mute come from the music bus it is connected to.
 */
export type TuneStyle = 'theme' | 'map' | 'calm';

const BPM = 108;
const EIGHTH = 60 / BPM / 2;
const BAR = EIGHTH * 8;

/** Melody in MIDI note numbers per eighth (0 = rest). */
const MELODY: number[][] = [
  [76, 0, 79, 76, 72, 0, 74, 76],
  [72, 0, 69, 72, 76, 74, 72, 0],
  [69, 0, 72, 77, 76, 0, 74, 72],
  [74, 0, 71, 74, 79, 0, 0, 0],
  [76, 0, 79, 81, 79, 76, 72, 74],
  [76, 0, 72, 69, 72, 0, 76, 0],
  [77, 76, 74, 72, 69, 72, 74, 77],
  [79, 0, 74, 0, 71, 74, 72, 0],
];
/** Chord per bar: root (bass MIDI) and triad tones for arpeggios/pads. */
const CHORDS: Array<{ root: number; tones: number[] }> = [
  { root: 48, tones: [60, 64, 67] }, { root: 45, tones: [57, 60, 64] }, { root: 41, tones: [53, 57, 60] }, { root: 43, tones: [55, 59, 62] },
  { root: 48, tones: [60, 64, 67] }, { root: 45, tones: [57, 60, 64] }, { root: 41, tones: [53, 57, 60] }, { root: 43, tones: [55, 59, 62] },
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class ThemeTune {
  private timer = 0;
  private nextTime = 0;
  private step = 0; // eighth-note index in the 8-bar loop
  private out: GainNode;
  private noise: AudioBuffer;
  private lastNote = 0;

  constructor(private ctx: AudioContext, dest: AudioNode, private style: TuneStyle) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start(fade = 1.2): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(this.style === 'calm' ? 0.75 : 0.9, t + fade);
    this.nextTime = t + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 50);
    this.schedule();
  }

  /** Fades out and releases everything. */
  stop(fade = 0.8): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    window.clearInterval(this.timer);
    setTimeout(() => this.out.disconnect(), fade * 1000 + 200);
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') return;
    // Never pile up after a long pause: resync to "now".
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += EIGHTH;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 8), e = step % 8;
    const chord = CHORDS[bar]!;
    const style = this.style;
    // melody
    const m = MELODY[bar]![e]!;
    if (m && style !== 'calm') {
      const note = style === 'map' ? m - 12 : m;
      this.voice(note, t, EIGHTH * 0.9, style === 'map' ? 'triangle' : 'square', style === 'map' ? 0.11 : 0.075, this.lastNote && Math.abs(note - this.lastNote) >= 5 ? this.lastNote : 0, 2600);
      this.lastNote = note;
    }
    // bass on 1, "and of 2", 3
    if (e === 0 || e === 3 || e === 4) this.voice(e === 3 ? chord.root + 7 : chord.root, t, EIGHTH * (e === 3 ? 0.8 : 1.6), 'triangle', 0.16, 0, 900);
    // arpeggio (16ths) for map/calm
    if (style !== 'theme') {
      for (let k = 0; k < 2; k++) {
        const tone = chord.tones[(e * 2 + k) % 3]! + (style === 'calm' ? 12 : 12);
        this.voice(tone, t + (k * EIGHTH) / 2, EIGHTH * 0.45, 'sine', style === 'calm' ? 0.05 : 0.04, 0, 3000);
      }
    }
    // pad for calm
    if (style === 'calm' && e === 0) for (const tone of chord.tones) this.voice(tone, t, BAR * 0.98, 'sawtooth', 0.012, 0, 800, 0.4);
    // drums
    if (style !== 'calm') {
      if (e === 0 || e === 4) this.kick(t, style === 'map' ? 0.12 : 0.18);
      if (e === 2 || e === 6) this.hat(t, 0.045, 0.06, 1800);
      if (e % 2 === 1) this.hat(t, 0.025, 0.03, 7000);
    }
  }

  private voice(midi: number, t: number, dur: number, type: OscillatorType, vol: number, glideFrom: number, cutoff: number, attack = 0.008): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = type;
    if (glideFrom) {
      // The "slippery" slide between distant notes.
      o.frequency.setValueAtTime(hz(glideFrom), t);
      o.frequency.exponentialRampToValueAtTime(hz(midi), t + Math.min(0.06, dur * 0.4));
    } else o.frequency.setValueAtTime(hz(midi), t);
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + Math.min(dur, attack + 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, vol: number, dur: number, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

/** Which arrangement (if any) plays for a music slot that has no recorded track. */
export function tuneStyleFor(slot: string): TuneStyle | null {
  if (['main_menu', 'character_select', 'hoods', 'quests', 'shop', 'chests'].includes(slot)) return 'theme';
  if (slot === 'adventure') return 'map';
  if (['daily', 'infinite', 'fishing', 'ranked'].includes(slot)) return 'calm';
  return null; // gameplay slots stay quiet until recorded music is supplied
}
