/**
 * AudioManager — one Web Audio graph for the whole game:
 *   sfx bus ─┐
 *            ├─ master → destination
 *   music ───┘
 *
 * Respects browser autoplay rules: nothing is created until an intentional
 * user gesture calls `unlock()`. Suspended contexts are resumed on the next
 * gesture or when the tab becomes visible again. Missing music slots are
 * silent by design (see src/config/audio.ts).
 */
import { AUDIO_TIMING, MUSIC, SFX, type MusicSlot, type SfxDef, type SfxId } from '../config/audio';
import type { Settings } from '../save/settings';
import { playRecipe } from './synth';

interface Voice { id: SfxId; endsAt: number }

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private lastPlayed = new Map<SfxId, number>();
  private voices: Voice[] = [];
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private currentSlot: MusicSlot | null = null;
  private musicSource: { node: AudioBufferSourceNode; gain: GainNode } | null = null;
  private settings: Settings;
  private hidden = false;
  /** Set when the requested slot has no assigned track (UI can report it). */
  missingMusicSlot: MusicSlot | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      if (!this.ctx) return;
      if (this.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  /** Call from a user-gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // Adopt the context the startup intro created on an earlier tap (same gesture-unlocked graph).
      const early = (window as unknown as { __sfEarlyAudio?: AudioContext }).__sfEarlyAudio;
      try {
        this.ctx = early && early.state !== 'closed' ? early : new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applySettings(this.settings);
      if (this.currentSlot) {
        const slot = this.currentSlot;
        this.currentSlot = null;
        this.playMusic(slot);
      }
    }
    if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume().catch(() => undefined);
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicOn ? s.musicVolume : 0, t, 0.08);
  }

  /** Plays an effect. `intensity` 0–1 modulates recipes like bounces/stars. */
  play(id: SfxId, opts: { intensity?: number; volume?: number; pitch?: number; isUi?: boolean } = {}): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    if (opts.isUi && !this.settings.buttonSounds) return;
    const def: SfxDef = SFX[id];
    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? -Infinity;
    if (now - last < def.cooldownMs) return;
    const t = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.endsAt > t);
    if (this.voices.length >= AUDIO_TIMING.maxTotalVoices) return;
    if (this.voices.filter((v) => v.id === id).length >= def.maxVoices) return;
    this.lastPlayed.set(id, now);
    const out = this.ctx.createGain();
    out.gain.value = def.volume * (opts.volume ?? 1);
    out.connect(this.sfxBus);
    const pitch = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * def.pitchVariance);
    let dur = 0.5;
    if (def.src && def.src.length > 0) {
      void this.playBuffer(def.src, out, pitch);
    } else if (def.synth) {
      dur = playRecipe(this.ctx, out, def.synth, pitch, Math.max(0, Math.min(1, opts.intensity ?? 1)));
    }
    this.voices.push({ id, endsAt: t + dur });
    // Disconnect the per-voice gain after it finishes.
    setTimeout(() => out.disconnect(), (dur + 0.3) * 1000);
  }

  private async playBuffer(src: string[], out: GainNode, pitch: number): Promise<void> {
    const buf = await this.loadBuffer(src);
    if (!buf || !this.ctx) return;
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.playbackRate.value = pitch;
    node.connect(out);
    node.start();
  }

  private loadBuffer(src: string[]): Promise<AudioBuffer | null> {
    const key = src.join('|');
    let p = this.buffers.get(key);
    if (!p) {
      p = (async () => {
        if (!this.ctx) return null;
        for (const s of src) {
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}${s}`);
            if (!res.ok) continue;
            return await this.ctx.decodeAudioData(await res.arrayBuffer());
          } catch {
            /* try next format */
          }
        }
        console.warn('[audio] could not load', src);
        return null;
      })();
      this.buffers.set(key, p);
    }
    return p;
  }

  /** Crossfades to a music slot. Unassigned slots fade the current track out. */
  playMusic(slot: MusicSlot): void {
    if (slot === this.currentSlot) return;
    this.currentSlot = slot;
    const track = MUSIC[slot];
    this.missingMusicSlot = track ? null : slot;
    if (!this.ctx || !this.musicBus) return;
    const fade = AUDIO_TIMING.musicCrossfadeSeconds;
    const t = this.ctx.currentTime;
    if (this.musicSource) {
      const old = this.musicSource;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => {
        try { old.node.stop(); } catch { /* already stopped */ }
        old.node.disconnect();
        old.gain.disconnect();
      }, fade * 1000 + 100);
      this.musicSource = null;
    }
    if (!track) return;
    void this.loadBuffer(track.src).then((buf) => {
      if (!buf || !this.ctx || !this.musicBus || this.currentSlot !== slot) return;
      const node = this.ctx.createBufferSource();
      node.buffer = buf;
      node.loop = track.loop;
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(track.volume, now + fade);
      node.connect(gain).connect(this.musicBus);
      node.start();
      this.musicSource = { node, gain };
    });
  }

  /** Short haptic buzz where the browser supports it (optional). */
  haptic(ms: number): void {
    if (!this.settings.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* unsupported */
    }
  }
}
