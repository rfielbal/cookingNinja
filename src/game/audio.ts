import type { ArenaEvent, HitResult } from './events';
import type { FoodKind, Recipe, RecipeId } from './recipes';

export type AudioPhase =
  'menu' | 'ready' | 'countdown' | 'playing' | 'paused' | 'mixing' | 'result';
export type AudioKind =
  | HitResult
  | 'start'
  | 'win'
  | 'lose'
  | 'select'
  | 'rush'
  | 'heal'
  | 'full-health'
  | 'rare-reveal'
  | 'countdown'
  | 'mix-start'
  | 'focus-end';
export interface SoundContext {
  food?: FoodKind;
  combo?: number;
  /** Stereo position, -1 (left) to +1 (right). */
  pan?: number;
  /** Actual countdown number; this engine never runs its own countdown. */
  step?: number;
}
/** Browser output state. "running" cannot verify the device volume or speakers. */
export type AudioStatus =
  'locked' | 'running' | 'suspended' | 'interrupted' | 'muted' | 'unavailable';
type VisibilitySource = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[]; persistent: boolean };
type Channel = { voice: Voice; gain: GainNode; filter: BiquadFilterNode };
type Texture = 'crisp' | 'soft' | 'wet' | 'dry' | 'powder' | 'brittle';
const MAX_VOICES = 24;
const RESUME_TIMEOUT_MS = 1200;
const safe = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
const TEXTURES: Record<FoodKind, Texture> = {
  bread: 'dry',
  tortilla: 'dry',
  flour: 'powder',
  egg: 'brittle',
  chocolate: 'brittle',
  lettuce: 'crisp',
  onion: 'crisp',
  broccoli: 'crisp',
  chili: 'crisp',
  tomato: 'wet',
  strawberry: 'wet',
  fish: 'wet',
  patty: 'wet',
  chicken: 'wet',
  cheese: 'soft',
  avocado: 'soft',
};

/** Procedural kitchen foley on the audio clock. Inaudible events are never queued. */
export class KitchenAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private noiseBuffer?: AudioBuffer;
  private voices = new Set<Voice>();
  private ambience: Channel | null = null;
  private mixing: Channel | null = null;
  private phase: AudioPhase = 'menu';
  private event: ArenaEvent = 'normal';
  private recipe: RecipeId = 'burger';
  private silent = false;
  private disposed = false;
  private lastSlash = -Infinity;
  private lastMix = -Infinity;
  private mixAmount = 0;
  private lastSounds = new Map<AudioKind, number>();
  private variation = 0;
  private listeners = new Set<() => void>();
  private lastStatus: AudioStatus = 'locked';
  private failedCreation = false;
  private retryContext = false;
  private generation = 0;
  private unlockAttempt = 0;
  private testAttempt = 0;

  constructor(
    private readonly createContext: () => AudioContext = () =>
      new AudioContext({ latencyHint: 'interactive' }),
    private readonly page: VisibilitySource | undefined = typeof document === 'undefined'
      ? undefined
      : document,
  ) {
    page?.addEventListener('visibilitychange', this.onVisibility);
  }

  get muted() {
    return this.silent;
  }
  set muted(value: boolean) {
    if (this.silent === value) return;
    this.silent = value;
    if (value) this.stopAll();
    else this.ensureBackground();
    this.notifyStatus();
  }

  /** Stable methods for useSyncExternalStore, without exposing Web Audio internals. */
  getStatus = (): AudioStatus => {
    if (this.disposed) return 'unavailable';
    if (this.silent) return 'muted';
    if (this.failedCreation) return 'unavailable';
    if (!this.context) return 'locked';
    // Safari may expose "interrupted" even when older DOM typings omit it.
    const state: string = this.context.state;
    if (state === 'closed') return 'unavailable';
    if (state === 'interrupted') return 'interrupted';
    if (this.page?.hidden || state !== 'running') return 'suspended';
    return 'running';
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Invoke directly inside a trusted click, non-mouse pointerup or key handler.
   * Touch pointerdown and remote WebSocket messages cannot grant user activation.
   * Resolves promptly even if Safari leaves resume() pending after an interruption.
   */
  unlock(): Promise<boolean> {
    if (this.disposed || this.page?.hidden) return Promise.resolve(false);
    const attempt = ++this.unlockAttempt;
    try {
      if (this.context?.state === 'closed' || this.retryContext) this.releaseContext();
      if (!this.context) {
        const ctx = this.createContext();
        this.context = ctx;
        this.failedCreation = false;
        this.retryContext = false;
        this.master = ctx.createGain();
        this.master.gain.value = 0.56;
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.14;
        this.master.connect(this.compressor);
        this.compressor.connect(ctx.destination);
        ctx.onstatechange = () => {
          if (ctx !== this.context || this.disposed) return;
          if (ctx.state !== 'running') this.stopAll();
          else this.ensureBackground();
          this.notifyStatus();
        };
      } else if (this.context.state === 'running') {
        this.ensureBackground();
        this.notifyStatus();
        return Promise.resolve(this.canOutput());
      }
      const ctx = this.context;
      // Keep resume synchronous with the gesture; never put an await before this call.
      // A new gesture may retry even while an earlier, unauthorized resume is pending.
      let resume: Promise<void>;
      try {
        resume = ctx.resume();
      } catch {
        this.retryContext = true;
        this.notifyStatus();
        return Promise.resolve(false);
      }
      this.ensureBackground();
      this.notifyStatus();
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (resumed: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ctx !== this.context || this.disposed || attempt !== this.unlockAttempt) {
            resolve(false);
            return;
          }
          const running = resumed && ctx.state === 'running';
          this.retryContext = !running && ctx.state !== 'running';
          if (running) this.ensureBackground();
          this.notifyStatus();
          resolve(running && this.canOutput());
        };
        const timer = setTimeout(() => finish(false), RESUME_TIMEOUT_MS);
        void resume.then(
          () => finish(true),
          () => finish(false),
        );
      });
    } catch {
      this.releaseContext();
      this.failedCreation = true;
      this.notifyStatus();
      return Promise.resolve(false);
    }
  }

  /**
   * Explicit output check, including while gameplay is paused. Returns whether
   * its fresh cue was scheduled, not whether a person heard it. Never unmutes.
   */
  test(): Promise<boolean> {
    const attempt = ++this.testAttempt;
    const ready = this.unlock();
    const generation = this.generation;
    return ready.then((running) => {
      if (
        !running ||
        attempt !== this.testAttempt ||
        generation !== this.generation ||
        !this.canOutput()
      )
        return false;
      this.tone(523.25, 523.25, 0.18, 0.1, 'sine', -0.15);
      this.tone(783.99, 783.99, 0.25, 0.1, 'sine', 0.15, 0.12);
      return true;
    });
  }

  setRecipe(recipe: RecipeId | Recipe) {
    this.recipe = typeof recipe === 'string' ? recipe : recipe.id;
    this.updateAmbience();
  }

  setPhase(phase: AudioPhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    if (phase === 'paused' || phase === 'menu' || phase === 'ready') {
      this.stopAll();
      return;
    }
    // Preserve the final impact's short release underneath the result jingle.
    this.stopBackground();
    this.ensureBackground();
  }

  /** Modulates the sound bed only. Event cues remain explicit play() calls. */
  setEvent(event: ArenaEvent) {
    if (this.event === event) return;
    this.event = event;
    this.updateAmbience();
  }

  setMix(amount: number) {
    const value = safe(amount, 0, 0, 1);
    if (!this.canPlay() || this.phase !== 'mixing') {
      this.mixAmount = 0;
      return;
    }
    this.ensureBackground();
    const ctx = this.context!,
      channel = this.mixing;
    if (!channel) return;
    const now = ctx.currentTime;
    const stopping = value === 0 && this.mixAmount > 0;
    if (!stopping && now - this.lastMix < (value === 0 ? 0.12 : 0.03)) return;
    this.lastMix = now;
    this.mixAmount = value;
    channel.gain.gain.cancelScheduledValues(now);
    channel.gain.gain.setTargetAtTime(value * 0.075, now, 0.025);
    // Stale input goes silent on the audio clock, even when JS/rendering stalls.
    channel.gain.gain.setTargetAtTime(0, now + 0.15, 0.025);
    channel.filter.frequency.setTargetAtTime(340 + value * 1550, now, 0.035);
    (channel.voice.source as AudioBufferSourceNode).playbackRate.setTargetAtTime(
      0.65 + value * 0.9,
      now,
      0.035,
    );
  }

  slash(strength = 0.6) {
    if (!this.canPlay() || !['ready', 'countdown', 'playing'].includes(this.phase)) return;
    const now = this.context!.currentTime;
    if (now - this.lastSlash < 0.065) return;
    this.lastSlash = now;
    const intensity = safe(strength, 0.6, 0, 1);
    this.noise(
      0.065 + intensity * 0.045,
      0.025 + intensity * 0.028,
      2900 + intensity * 1600,
      650,
      'bandpass',
      0.65,
      0,
    );
    this.tone(2200 + intensity * 700, 800, 0.065, 0.006, 'sine', 0);
  }

  play(kind: AudioKind, context: SoundContext = {}) {
    if (!this.canPlay()) return;
    const now = this.context!.currentTime;
    const gap =
      kind === 'good'
        ? 0.018
        : kind === 'focus-cut'
          ? 0.07
          : kind === 'select'
            ? 0.04
            : kind === 'win' || kind === 'lose'
              ? 0.9
              : 0.09;
    if (now - (this.lastSounds.get(kind) ?? -Infinity) < gap) return;
    this.lastSounds.set(kind, now);
    const pan = safe(context.pan, 0, -0.8, 0.8);
    const pitch = 2 ** (safe(context.combo, 0, 0, 16) / 48);
    switch (kind) {
      case 'good':
        this.cut(context.food, pitch, pan);
        break;
      case 'bad':
        this.noise(0.16, 0.11, 950, 240, 'lowpass', 0.8, pan);
        this.tone(145, 48, 0.23, 0.15, 'triangle', pan);
        break;
      case 'danger':
        this.noise(0.38, 0.19, 1800, 130, 'lowpass', 0.6, pan);
        this.tone(100, 28, 0.48, 0.2, 'sine', pan);
        this.noise(0.06, 0.08, 4000, 600, 'bandpass', 1, pan);
        break;
      case 'shield':
        this.bells([392, 587.33, 783.99], 0.065, 0.075, pan);
        this.noise(0.24, 0.025, 1400, 4200, 'bandpass', 1.6, pan);
        break;
      case 'blocked':
        this.bell(987.77, 0.34, 0.085, pan);
        this.bell(1480, 0.22, 0.035, -pan, 0.02);
        this.noise(0.08, 0.04, 4200, 1800, 'highpass', 1, pan);
        break;
      case 'heal':
        this.bells([523.25, 659.25, 783.99, 1046.5], 0.075, 0.06, pan);
        this.noise(0.3, 0.018, 900, 2800, 'bandpass', 0.8, pan);
        break;
      case 'full-health':
        this.bells([783.99, 1046.5], 0.055, 0.04, pan);
        break;
      case 'slow':
        this.bells([1046.5, 783.99, 523.25], 0.09, 0.06, pan);
        this.noise(0.4, 0.035, 3500, 280, 'bandpass', 2.2, pan);
        break;
      case 'rush':
        this.noise(0.34, 0.06, 300, 3200, 'bandpass', 0.7, 0);
        this.tone(146.83, 293.66, 0.32, 0.065, 'triangle', 0);
        this.bells([587.33, 783.99], 0.08, 0.05, 0);
        break;
      case 'rare-reveal':
        this.bells([783.99, 1174.66, 1567.98], 0.085, 0.045, pan);
        this.noise(0.28, 0.015, 2500, 6500, 'highpass', 0.7, pan);
        break;
      case 'focus-start':
        this.bells([659.25, 987.77, 1318.51], 0.04, 0.065, pan);
        this.tone(130.81, 261.63, 0.15, 0.05, 'triangle', pan);
        break;
      case 'focus-cut':
        this.cut(context.food, pitch * 1.18, pan, 0.65);
        this.bell(1046.5 * pitch, 0.13, 0.028, pan);
        break;
      case 'focus-end':
        this.bells([783.99, 1046.5, 1318.51, 1567.98], 0.055, 0.055, pan);
        break;
      case 'countdown':
        this.tone(
          context.step === 1 ? 783.99 : 523.25,
          context.step === 1 ? 783.99 : 523.25,
          0.085,
          0.075,
          'sine',
          0,
        );
        this.noise(0.025, 0.025, 2500, 1800, 'bandpass', 1, 0);
        break;
      case 'start':
        this.bells([523.25, 659.25, 783.99], 0.045, 0.06, 0);
        break;
      case 'mix-start':
        this.bell(440, 0.4, 0.065, -0.15);
        this.noise(0.18, 0.04, 850, 1600, 'bandpass', 1.2, 0.15);
        break;
      case 'win':
        this.bells([523.25, 659.25, 783.99, 1046.5], 0.11, 0.085, 0);
        this.bell(1318.51, 0.95, 0.04, 0.25, 0.34);
        this.bell(1567.98, 0.85, 0.03, -0.25, 0.39);
        break;
      case 'lose':
        [392, 329.63, 261.63].forEach((frequency, index) =>
          this.tone(frequency, frequency * 0.96, 0.25, 0.055, 'triangle', 0, index * 0.14),
        );
        this.noise(0.16, 0.025, 650, 240, 'lowpass', 0.8, 0, 0.3);
        break;
      case 'select':
        this.tone(660, 880, 0.055, 0.035, 'sine', 0);
        this.noise(0.018, 0.016, 2000, 1400, 'bandpass', 1, 0);
        break;
    }
  }

  /** Also cancels all future notes already scheduled on the audio clock. */
  stop() {
    this.phase = 'menu';
    this.event = 'normal';
    this.stopAll();
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.page?.removeEventListener('visibilitychange', this.onVisibility);
    this.releaseContext();
    this.notifyStatus();
    this.listeners.clear();
  }

  private onVisibility = () => {
    if (this.page?.hidden) this.stopAll();
    else this.ensureBackground();
    this.notifyStatus();
  };

  private notifyStatus() {
    const status = this.getStatus();
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    this.listeners.forEach((listener) => listener());
  }

  private releaseContext() {
    this.stopAll();
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed') void this.context.close().catch(() => {});
    }
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.context = this.master = this.compressor = this.noiseBuffer = undefined;
    this.retryContext = false;
  }

  private canOutput() {
    return (
      !this.disposed &&
      !this.silent &&
      !this.page?.hidden &&
      this.context?.state === 'running' &&
      !!this.master
    );
  }

  private canPlay() {
    return this.phase !== 'paused' && this.canOutput();
  }

  private cut(food: FoodKind | undefined, pitch: number, pan: number, amount = 1) {
    const fallback: FoodKind =
      this.recipe === 'cake' ? 'chocolate' : this.recipe === 'tacos' ? 'onion' : 'lettuce';
    const texture = TEXTURES[food ?? fallback];
    // Small variations keep repeated ingredients recognizable without identical clicks.
    const p = pitch * (0.94 + ((this.variation++ * 7) % 13) / 100);
    if (texture === 'crisp') {
      this.noise(0.085, 0.09 * amount, 2500 * p, 1100, 'highpass', 0.7, pan);
      this.noise(0.035, 0.055 * amount, 4200, 1800, 'bandpass', 1.2, pan, 0.018);
      this.tone(175 * p, 90, 0.075, 0.065 * amount, 'triangle', pan);
    } else if (texture === 'wet') {
      this.noise(0.14, 0.085 * amount, 1550 * p, 280, 'lowpass', 1.7, pan);
      this.tone(240 * p, 75, 0.09, 0.07 * amount, 'sine', pan);
      this.noise(0.026, 0.035 * amount, 3200, 1600, 'bandpass', 0.8, pan);
    } else if (texture === 'brittle') {
      this.noise(0.045, 0.09 * amount, 3300 * p, 1400, 'highpass', 0.8, pan);
      this.tone(850 * p, 510 * p, 0.045, 0.035 * amount, 'triangle', pan);
      this.noise(0.035, 0.04 * amount, 2100, 850, 'bandpass', 1.1, pan, 0.03);
    } else if (texture === 'powder') {
      this.noise(0.2, 0.065 * amount, 4300 * p, 1900, 'highpass', 0.6, pan);
      this.tone(145, 90, 0.06, 0.03 * amount, 'sine', pan);
    } else {
      this.noise(
        texture === 'dry' ? 0.075 : 0.11,
        0.07 * amount,
        texture === 'dry' ? 2300 * p : 700 * p,
        400,
        'lowpass',
        0.65,
        pan,
      );
      this.tone(185 * p, 95, 0.075, 0.07 * amount, 'triangle', pan);
    }
  }

  private bells(notes: number[], spacing: number, level: number, pan: number) {
    notes.forEach((frequency, index) => this.bell(frequency, 0.44, level, pan, index * spacing));
  }

  private bell(frequency: number, duration: number, level: number, pan: number, delay = 0) {
    this.tone(frequency, frequency * 0.997, duration, level, 'sine', pan, delay);
    this.tone(
      frequency * 2.76,
      frequency * 2.75,
      duration * 0.38,
      level * 0.17,
      'sine',
      pan,
      delay,
    );
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    level: number,
    type: OscillatorType,
    pan: number,
    delay = 0,
  ) {
    const ctx = this.context!,
      start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration * 0.75);
    const gain = ctx.createGain();
    this.envelope(gain.gain, start, duration, level, 0.003);
    oscillator.connect(gain);
    this.route(oscillator, gain, [], pan);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);
  }

  private noise(
    duration: number,
    level: number,
    from: number,
    to: number,
    type: BiquadFilterType,
    q: number,
    pan: number,
    delay = 0,
  ) {
    const ctx = this.context!,
      start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
    const gain = ctx.createGain();
    this.envelope(gain.gain, start, duration, level, 0.002);
    source.connect(filter);
    filter.connect(gain);
    this.route(source, gain, [filter], pan);
    source.start(start, Math.random() * Math.max(0, source.buffer.duration - duration - 0.1));
    source.stop(start + duration + 0.015);
  }

  private envelope(
    param: AudioParam,
    start: number,
    duration: number,
    level: number,
    attack: number,
  ) {
    param.setValueAtTime(0, start);
    param.linearRampToValueAtTime(level, start + attack);
    param.exponentialRampToValueAtTime(0.0001, start + duration);
    param.linearRampToValueAtTime(0, start + duration + 0.01);
  }

  private getNoiseBuffer(): AudioBuffer {
    if (!this.noiseBuffer) {
      const ctx = this.context!;
      this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 4), ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private route(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    extra: AudioNode[],
    pan: number,
    persistent = false,
  ): Voice {
    if (this.voices.size >= MAX_VOICES) {
      const oldest = [...this.voices].find((voice) => !voice.persistent);
      if (oldest) this.kill(oldest);
    }
    const nodes: AudioNode[] = [source, ...extra, gain];
    if (typeof this.context!.createStereoPanner === 'function') {
      const panner = this.context!.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.master!);
      nodes.push(panner);
    } else gain.connect(this.master!);
    const voice = { source, nodes, persistent };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    return voice;
  }

  private release(voice: Voice) {
    voice.source.onended = null;
    voice.nodes.forEach((node) => node.disconnect());
    this.voices.delete(voice);
  }

  private kill(voice: Voice) {
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      /* Already stopped / never started. */
    }
    this.release(voice);
  }

  private loop(frequency: number, q: number, pan: number): Channel {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    const voice = this.route(source, gain, [filter], pan, true);
    source.start(ctx.currentTime, Math.random() * source.buffer.duration);
    return { voice, filter, gain };
  }

  private ensureBackground() {
    if (!this.canPlay()) return;
    if (this.phase === 'playing' && !this.ambience) {
      this.ambience = this.loop(800, 0.45, -0.12);
      this.updateAmbience();
    } else if (this.phase === 'mixing' && !this.mixing) {
      this.mixing = this.loop(340, 2, 0.08);
      // No old mixing energy is replayed after unmute or visibility return.
    }
  }

  private updateAmbience() {
    if (!this.ambience || !this.canPlay()) return;
    const now = this.context!.currentTime;
    const center = this.recipe === 'cake' ? 420 : this.recipe === 'tacos' ? 1120 : 780;
    this.ambience.filter.frequency.setTargetAtTime(
      center * (this.event === 'slow' ? 0.55 : 1),
      now,
      0.2,
    );
    this.ambience.gain.gain.setTargetAtTime(
      this.event === 'focus' ? 0.004 : this.event === 'rush' ? 0.018 : 0.01,
      now,
      0.15,
    );
  }

  private stopBackground() {
    if (this.ambience) this.kill(this.ambience.voice);
    if (this.mixing) this.kill(this.mixing.voice);
    this.ambience = this.mixing = null;
    this.mixAmount = 0;
    this.lastMix = -Infinity;
  }

  private stopAll() {
    this.generation++;
    this.stopBackground();
    [...this.voices].forEach((voice) => this.kill(voice));
    this.lastSounds.clear();
    this.lastSlash = -Infinity;
  }
}

export const audio = new KitchenAudio();
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());
