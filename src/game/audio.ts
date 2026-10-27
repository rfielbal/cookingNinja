import type { ArenaEvent, HitResult } from './events';
import type { FoodKind, Recipe, RecipeId } from './recipes';
import {
  loadKitchenSamples,
  makeKitchenFallback,
  type KitchenSample,
  type KitchenSampleBank,
  type KitchenSampleLoader,
} from './kitchen-samples';

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
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };
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

/** Local kitchen foley on the audio clock. Inaudible events are never queued. */
export class KitchenAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private samples: KitchenSampleBank = {};
  private fallback: KitchenSampleBank = {};
  private sampleAbort?: AbortController;
  private voices = new Set<Voice>();
  private mixing = new Set<Voice>();
  private mixStep = 0;
  private phase: AudioPhase = 'menu';
  private recipe: RecipeId = 'burger';
  private silent = false;
  private disposed = false;
  private lastSlash = -Infinity;
  private lastMix = -Infinity;
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
    private readonly loadSamples: KitchenSampleLoader = loadKitchenSamples,
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
        this.master.gain.value = 0.78;
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.14;
        this.master.connect(this.compressor);
        this.compressor.connect(ctx.destination);
        const controller = new AbortController();
        this.sampleAbort = controller;
        // Loading is independent from resume and never replays a sound on completion.
        void Promise.resolve()
          .then(() => this.loadSamples(ctx, controller.signal))
          .then((bank) => {
            if (this.context === ctx && !controller.signal.aborted && !this.disposed)
              this.samples = bank;
          })
          .catch(() => {
            /* Local procedural fallback remains available. */
          });
        ctx.onstatechange = () => {
          if (ctx !== this.context || this.disposed) return;
          if (ctx.state !== 'running') this.stopAll();
          this.notifyStatus();
        };
      } else if (this.context.state === 'running') {
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
  }

  setPhase(phase: AudioPhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    if (phase === 'paused' || phase === 'menu' || phase === 'ready') {
      this.stopAll();
      return;
    }
    // Preserve the final impact's short release underneath the result cue.
    this.stopMix();
  }

  /** State changes are silent. Audible event accents require a fresh play() call. */
  setEvent(_event: ArenaEvent) {}

  setMix(amount: number) {
    const value = safe(amount, 0, 0, 1);
    if (!this.canPlay() || this.phase !== 'mixing' || value < 0.04) {
      this.stopMix();
      return;
    }
    const now = this.context!.currentTime;
    if (now - this.lastMix < 0.19 - value * 0.105) return;
    this.lastMix = now;
    const step = this.mixStep++;
    const pan = Math.sin(step * 1.4) * 0.35;
    // A finite scrape follows this gesture only. It ends within 140 ms if JS stalls.
    this.sample('rustle', 0.16 + value * 0.2, pan, 0.85 + value * 0.3, 0, 0.14, true);
    if (step % 3 === 0)
      this.sample('plate', 0.05 + value * 0.055, -pan, 0.8 + (step % 5) * 0.025, 0, 0.1, true);
  }

  slash(strength = 0.6) {
    if (!this.canPlay() || !['ready', 'countdown', 'playing'].includes(this.phase)) return;
    const now = this.context!.currentTime;
    if (now - this.lastSlash < 0.085) return;
    this.lastSlash = now;
    const intensity = safe(strength, 0.6, 0, 1);
    this.sample(
      this.variation++ % 2 ? 'slice-a' : 'slice-b',
      0.1 + intensity * 0.12,
      0,
      0.96 + intensity * 0.08,
      0,
      0.14,
    );
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
    // Combos add a little weight, not an ever-higher electronic pitch.
    const weight = 1 + safe(context.combo, 0, 0, 16) * 0.006;
    switch (kind) {
      case 'good':
        this.cut(context.food, weight, pan);
        break;
      case 'bad':
        this.sample('wood-b', 0.66, pan, 0.8);
        this.sample('thud', 0.4, pan, 0.86, 0.016);
        break;
      case 'danger':
        this.sample('pot', 0.58, pan, 0.7, 0, 0.48);
        this.sample('thud', 0.7, pan, 0.72);
        this.sample('wood-b', 0.3, -pan, 0.8, 0.045);
        break;
      case 'shield':
        this.sample('plate', 0.45, pan, 1.06);
        this.sample('glass', 0.24, -pan, 1.04, 0.065);
        break;
      case 'blocked':
        this.sample('pot', 0.3, pan, 1.2, 0, 0.22);
        this.sample('glass', 0.19, -pan, 1.02, 0.015);
        break;
      case 'heal':
        this.sample('glass', 0.32, pan, 0.96);
        this.sample('plate', 0.28, -pan, 1.12, 0.09);
        break;
      case 'full-health':
        this.sample('glass', 0.17, pan, 1.08, 0, 0.14);
        break;
      case 'slow':
        this.sample('rustle', 0.26, pan, 0.75, 0, 0.2);
        this.sample('wood-a', 0.28, -pan, 0.82, 0.06);
        this.sample('wood-a', 0.18, pan, 0.75, 0.23);
        break;
      case 'rush':
        [0, 0.09, 0.15].forEach((delay, i) =>
          this.sample('wood-b', 0.32 + i * 0.07, (i - 1) * 0.25, 0.98 + i * 0.04, delay),
        );
        this.sample('slice-a', 0.26, 0.2, 1.08, 0.15);
        break;
      case 'rare-reveal':
        this.sample('glass', 0.22, -0.18, 1.08);
        this.sample('plate', 0.14, 0.18, 1.18, 0.12);
        break;
      case 'focus-start':
        this.sample('slice-b', 0.27, pan);
        this.sample('plate', 0.32, -pan, 0.98, 0.035);
        break;
      case 'focus-cut':
        this.cut(context.food, weight, pan, 0.8);
        break;
      case 'focus-end':
        this.sample('plate', 0.42, pan, 1);
        this.sample('wood-a', 0.3, -pan, 1.08, 0.07);
        this.sample('glass', 0.2, pan, 1.08, 0.14);
        break;
      case 'countdown':
        this.sample('wood-a', 0.42, 0, context.step === 1 ? 1.1 : 0.96);
        if (context.step === 1) this.sample('wood-a', 0.2, 0.12, 1.05, 0.075);
        break;
      case 'start':
        this.sample('wood-a', 0.42, -0.15);
        this.sample('wood-b', 0.4, 0.15, 1.03, 0.075);
        this.sample('plate', 0.34, 0, 1.12, 0.15);
        break;
      case 'mix-start':
        this.sample('plate', 0.38, -0.15, 0.88);
        this.sample('wood-a', 0.26, 0.15, 1.02, 0.07);
        break;
      case 'win':
        this.sample('plate', 0.5, 0, 0.92);
        this.sample('glass', 0.32, -0.2, 1.04, 0.14);
        this.sample('plate', 0.28, 0.2, 1.14, 0.27);
        this.sample('glass', 0.2, 0, 1.16, 0.38);
        break;
      case 'lose':
        this.sample('thud', 0.43, 0, 0.76);
        this.sample('pot', 0.27, -0.1, 0.8, 0.14, 0.28);
        break;
      case 'select':
        this.sample('wood-a', 0.22, 0, 1.13, 0, 0.07);
        break;
    }
  }

  /** Also cancels all future notes already scheduled on the audio clock. */
  stop() {
    this.phase = 'menu';
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
    this.sampleAbort?.abort();
    this.sampleAbort = undefined;
    this.samples = {};
    this.fallback = {};
    this.context = this.master = this.compressor = undefined;
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

  private cut(food: FoodKind | undefined, weight: number, pan: number, amount = 1) {
    const fallback: FoodKind =
      this.recipe === 'cake' ? 'chocolate' : this.recipe === 'tacos' ? 'onion' : 'lettuce';
    const texture = TEXTURES[food ?? fallback];
    const variation = this.variation++;
    const rate = 0.96 + ((variation * 7) % 9) * 0.01;
    const volume = amount * weight;
    this.sample('chop', 0.5 * volume, pan, rate, 0, 0.18);
    this.sample(variation % 2 ? 'wood-a' : 'wood-b', 0.18 * volume, pan, rate, 0.008, 0.1);
    if (texture === 'crisp' || texture === 'dry' || texture === 'powder')
      this.sample(
        'rustle',
        (texture === 'crisp' ? 0.3 : 0.17) * volume,
        pan,
        rate * 1.12,
        0.015,
        0.1,
      );
    else if (texture === 'brittle')
      this.sample('wood-a', 0.26 * volume, pan, rate * 1.2, 0.025, 0.065);
    else this.sample('thud', (texture === 'wet' ? 0.25 : 0.16) * volume, pan, rate * 0.86, 0, 0.12);
  }

  private sample(
    id: KitchenSample,
    level: number,
    pan = 0,
    rate = 1,
    delay = 0,
    maxDuration = 1,
    mixing = false,
  ) {
    const ctx = this.context!,
      start = ctx.currentTime + delay;
    const buffer = this.samples[id] ?? (this.fallback[id] ??= makeKitchenFallback(ctx, id));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, start);
    const duration = Math.min(buffer.duration / rate, maxDuration);
    const gain = ctx.createGain();
    // Keep the original sample's micro-dynamics; only soften its cut boundaries.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.003);
    gain.gain.setValueAtTime(level, start + Math.max(0.003, duration - 0.018));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(gain);
    const voice = this.route(source, gain, [], pan);
    if (mixing) this.mixing.add(voice);
    source.start(start);
    source.stop(start + duration);
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

  private route(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    extra: AudioNode[],
    pan: number,
  ): Voice {
    if (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value;
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
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    return voice;
  }

  private release(voice: Voice) {
    voice.source.onended = null;
    voice.nodes.forEach((node) => node.disconnect());
    this.voices.delete(voice);
    this.mixing.delete(voice);
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

  private stopMix() {
    [...this.mixing].forEach((voice) => this.kill(voice));
    this.lastMix = -Infinity;
    this.mixStep = 0;
  }

  private stopAll() {
    this.generation++;
    this.stopMix();
    [...this.voices].forEach((voice) => this.kill(voice));
    this.lastSounds.clear();
    this.lastSlash = -Infinity;
  }
}

export const audio = new KitchenAudio();
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());
