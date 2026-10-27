import type { FoodKind, Recipe } from './recipes';
import { COUNTDOWN_SECONDS, CUT_SECONDS, MIX_FILL_SECONDS, MIX_SECONDS } from '../../shared/round';
import {
  ACTIVE_LIFETIME,
  DANGER_HEARTS,
  FOCUS_CUT_INTERVAL,
  FOCUS_MAX_BONUS,
  FOCUS_POINTS_PER_CUT,
  FOCUS_SECONDS,
  getRushWindow,
  HEART_SPAWN_TIMES,
  MAX_HEARTS,
  RUSH_CADENCE_MULTIPLIER,
  RUSH_WORLD_SPEED,
  rushDurationBetween,
  SHIELD_SECONDS,
  SHINY_SPAWN_TIMES,
  SLOW_POINTS,
  SLOW_SECONDS,
  SLOW_WORLD_SPEED,
  SPECIAL_SEQUENCE,
  SPECIAL_SPAWN_INTERVAL,
  type ArenaEvent,
  type ArenaKind,
  type FocusState,
  type HitResult,
} from './events';

export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'mixing' | 'result';
export interface GameState {
  phase: Phase;
  hearts: number;
  livesRecovered: number;
  score: number;
  combo: number;
  bestCombo: number;
  elapsed: number;
  remaining: number;
  countdown: number;
  mix: number;
  counts: Partial<Record<FoodKind, number>>;
  outcome: 'won' | 'hearts' | 'ingredients' | 'mix' | null;
  feedback: string;
  feedbackSerial: number;
  hits: number;
  mistakes: number;
  event: ArenaEvent;
  eventRemaining: number;
  worldSpeed: number;
  shieldRemaining: number;
  focus: FocusState | null;
}
export { COUNTDOWN_SECONDS, CUT_SECONDS, MIX_SECONDS } from '../../shared/round';
export class GameEngine {
  state: GameState = {
    phase: 'ready',
    hearts: MAX_HEARTS,
    livesRecovered: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    elapsed: 0,
    remaining: CUT_SECONDS,
    countdown: COUNTDOWN_SECONDS,
    mix: 0,
    counts: {},
    outcome: null,
    feedback: '',
    feedbackSerial: 0,
    hits: 0,
    mistakes: 0,
    event: 'normal',
    eventRemaining: 0,
    worldSpeed: 1,
    shieldRemaining: 0,
    focus: null,
  };
  private active = new Map<string, { kind: ArenaKind; at: number; shiny: boolean }>();
  private spawnClock = 0.4;
  private worldElapsed = 0;
  private slowRemaining = 0;
  private nextSpecialAt = SPECIAL_SPAWN_INTERVAL;
  private specialIndex = 0;
  private shinyIndex = 0;
  private heartIndex = 0;
  private focusElapsed = 0;
  private lastFocusCutAt = 0;
  private serial = 0;
  private pausedPhase: 'countdown' | 'playing' | 'mixing' = 'playing';
  constructor(
    readonly recipe: Recipe,
    private onSpawn: (id: string, kind: ArenaKind, target: boolean, shiny?: boolean) => void,
    private random = Math.random,
  ) {}
  start() {
    if (this.state.phase === 'ready') this.state.phase = 'countdown';
  }
  pause() {
    if (['countdown', 'playing', 'mixing'].includes(this.state.phase)) {
      this.pausedPhase = this.state.phase as typeof this.pausedPhase;
      this.state.phase = 'paused';
    }
  }
  resume() {
    if (this.state.phase === 'paused') this.state.phase = this.pausedPhase;
  }
  snapshot(): GameState {
    return {
      ...this.state,
      counts: { ...this.state.counts },
      focus: this.state.focus ? { ...this.state.focus } : null,
    };
  }
  get complete() {
    return this.recipe.ingredients.every(
      (kind) => (this.state.counts[kind] ?? 0) >= this.recipe.goal,
    );
  }
  tick(dt: number, stir = 0) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const s = this.state;
    if (s.phase === 'countdown') {
      s.countdown = Math.max(0, s.countdown - dt);
      if (s.countdown === 0) s.phase = 'playing';
      return;
    }
    if (s.phase === 'mixing') {
      dt = Math.min(dt, s.remaining);
      s.remaining = Math.max(0, s.remaining - dt);
      s.mix = Math.min(1, s.mix + (Math.max(0, Math.min(1, stir || 0)) * dt) / MIX_FILL_SECONDS);
      if (!s.remaining) {
        if (s.mix >= 0.35) {
          s.score += Math.round(s.mix * 500);
          this.finish('won');
        } else this.finish('mix');
      }
      return;
    }
    if (s.phase !== 'playing') return;
    if (s.focus) {
      this.focusElapsed = Math.min(FOCUS_SECONDS, this.focusElapsed + dt);
      s.focus.remaining = Math.max(0, FOCUS_SECONDS - this.focusElapsed);
      s.eventRemaining = s.focus.remaining;
      if (s.focus.remaining < 1e-9) {
        const focus = s.focus;
        s.score += focus.points;
        this.active.delete(focus.id);
        s.focus = null;
        this.refreshEvent(false);
        this.feedback(`+${focus.points} · ${focus.cuts} coupes !`);
      }
      return; // Recipe, power-ups, spawns and airborne objects stay frozen during focus.
    }
    dt = Math.min(dt, CUT_SECONDS - s.elapsed);
    const slowTime = Math.min(this.slowRemaining, dt);
    const afterSlow = s.elapsed + slowTime;
    const end = s.elapsed + dt;
    // Integrate both clocks across effect boundaries; the recipe timer is never slowed.
    const cadenceDelta =
      (slowTime + rushDurationBetween(s.elapsed, afterSlow) * (RUSH_CADENCE_MULTIPLIER - 1)) *
        SLOW_WORLD_SPEED +
      (dt - slowTime) +
      rushDurationBetween(afterSlow, end) * (RUSH_CADENCE_MULTIPLIER - 1);
    this.worldElapsed +=
      slowTime * SLOW_WORLD_SPEED +
      dt -
      slowTime +
      rushDurationBetween(afterSlow, end) * (RUSH_WORLD_SPEED - 1);
    this.slowRemaining = Math.max(0, this.slowRemaining - dt);
    if (this.slowRemaining < 1e-9) this.slowRemaining = 0;
    s.shieldRemaining = Math.max(0, s.shieldRemaining - dt);
    if (s.shieldRemaining < 1e-9) s.shieldRemaining = 0;
    s.elapsed = end;
    s.remaining = Math.max(0, CUT_SECONDS - s.elapsed);
    this.refreshEvent();
    for (const [id, item] of this.active)
      if (this.worldElapsed - item.at > ACTIVE_LIFETIME) this.active.delete(id);
    if (!s.remaining) {
      this.clearEffects();
      if (this.complete) {
        s.phase = 'mixing';
        s.remaining = MIX_SECONDS;
        this.active.clear();
      } else this.finish('ingredients');
      return;
    }
    this.spawnClock -= cadenceDelta;
    if (this.spawnClock <= 0) {
      this.spawnClock += this.recipe.spawnInterval;
      const target = this.random() > 0.24;
      const missing = this.recipe.ingredients.filter(
        (kind) => (s.counts[kind] ?? 0) < this.recipe.goal,
      );
      const choices = target
        ? missing.length
          ? missing
          : this.recipe.ingredients
        : this.recipe.traps;
      const kind =
        choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      this.spawn(kind, target);
    }
    // These announced objects use the real recipe clock and never replace needed ingredients.
    if (s.phase === 'playing' && s.elapsed >= this.nextSpecialAt) {
      const kind = SPECIAL_SEQUENCE[this.specialIndex % SPECIAL_SEQUENCE.length];
      this.specialIndex += 1;
      this.nextSpecialAt += SPECIAL_SPAWN_INTERVAL;
      this.spawn(kind, kind !== 'danger');
    }
    if (
      s.phase === 'playing' &&
      !s.focus &&
      this.shinyIndex < SHINY_SPAWN_TIMES.length &&
      s.elapsed >= SHINY_SPAWN_TIMES[this.shinyIndex]
    ) {
      this.shinyIndex += 1;
      const missing = this.recipe.ingredients.filter(
        (kind) => (s.counts[kind] ?? 0) < this.recipe.goal,
      );
      const choices = missing.length ? missing : this.recipe.ingredients;
      const kind =
        choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      this.spawn(kind, true, true);
    }
    if (
      s.phase === 'playing' &&
      !s.focus &&
      this.heartIndex < HEART_SPAWN_TIMES.length &&
      s.elapsed >= HEART_SPAWN_TIMES[this.heartIndex]
    ) {
      // An opportunity is used even at full health; it cannot be saved for later damage.
      this.heartIndex += 1;
      if (s.hearts < MAX_HEARTS) this.spawn('heart', true);
    }
  }
  private spawn(kind: ArenaKind, target: boolean, shiny = false) {
    const id = String(++this.serial);
    this.active.set(id, { kind, at: this.worldElapsed, shiny });
    this.onSpawn(id, kind, target, shiny);
  }
  hit(id: string): HitResult | null {
    if (this.state.phase !== 'playing') return null;
    const item = this.active.get(id);
    if (!item) return null;
    const s = this.state;
    if (s.focus) {
      if (
        id !== s.focus.id ||
        this.focusElapsed - this.lastFocusCutAt + 1e-9 < FOCUS_CUT_INTERVAL ||
        s.focus.points + FOCUS_POINTS_PER_CUT > FOCUS_MAX_BONUS
      )
        return null;
      this.lastFocusCutAt = this.focusElapsed;
      s.focus.cuts += 1;
      s.focus.points += FOCUS_POINTS_PER_CUT;
      return 'focus-cut';
    }
    if (!item.shiny) this.active.delete(id);
    if (item.kind === 'heart') {
      if (s.hearts >= MAX_HEARTS) {
        this.feedback('VIES AU MAXIMUM');
        return 'full-health';
      }
      s.hearts = Math.min(MAX_HEARTS, s.hearts + 1);
      s.livesRecovered += 1;
      this.feedback('+1 CŒUR · Une vie récupérée !');
      return 'heal';
    }
    if (item.kind === 'shield') {
      s.shieldRemaining = SHIELD_SECONDS;
      this.feedback(`BOUCLIER · Protection pendant ${SHIELD_SECONDS} s !`);
      return 'shield';
    }
    if (item.kind === 'slow') {
      this.countGoodHit();
      s.score += SLOW_POINTS;
      this.slowRemaining = SLOW_SECONDS;
      this.refreshEvent(false);
      this.feedback(`+${SLOW_POINTS} · RALENTI pendant ${SLOW_SECONDS} s !`);
      return 'slow';
    }
    if (item.kind === 'danger') {
      if (s.shieldRemaining > 0) {
        this.feedback('BOMBE BLOQUÉE · Le bouclier vous protège !');
        return 'blocked';
      }
      this.damage(DANGER_HEARTS);
      this.feedback(`BOMBE · −${DANGER_HEARTS} cœurs !`);
      return 'danger';
    }
    if (this.recipe.ingredients.includes(item.kind)) {
      s.counts[item.kind] = (s.counts[item.kind] ?? 0) + 1;
      this.countGoodHit();
      const points = 100 + Math.min(s.combo - 1, 10) * 10;
      s.score += points;
      if (item.shiny) {
        s.focus = { id, kind: item.kind, remaining: FOCUS_SECONDS, cuts: 0, points: 0 };
        this.focusElapsed = 0;
        this.lastFocusCutAt = 0;
        this.refreshEvent(false);
        this.feedback('FOCUS · Découpez autant que possible !');
        return 'focus-start';
      }
      this.feedback(`+${points} · ${s.combo > 1 ? `COMBO ×${s.combo}` : 'Bien coupé !'}`);
      return 'good';
    }
    if (s.shieldRemaining > 0) {
      this.feedback('PIÈGE BLOQUÉ · Le bouclier vous protège !');
      return 'blocked';
    }
    this.damage(1);
    this.feedback('Oups… pas dans la recette !');
    return 'bad';
  }
  private countGoodHit() {
    const s = this.state;
    s.hits += 1;
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
  }
  private damage(hearts: number) {
    const s = this.state;
    s.hearts = Math.max(0, s.hearts - hearts);
    s.mistakes += 1;
    s.combo = 0;
    if (!s.hearts) this.finish('hearts');
  }
  private feedback(message: string) {
    this.state.feedback = message;
    this.state.feedbackSerial += 1;
  }
  private refreshEvent(announce = true) {
    const s = this.state;
    const rush = getRushWindow(s.elapsed);
    const event: ArenaEvent = s.focus
      ? 'focus'
      : this.slowRemaining > 0
        ? 'slow'
        : rush
          ? 'rush'
          : 'normal';
    if (announce && event !== s.event) {
      // The arena and its event banner announce the transition without a second caption.
      this.feedback('');
    }
    s.event = event;
    s.eventRemaining = s.focus
      ? s.focus.remaining
      : this.slowRemaining > 0
        ? this.slowRemaining
        : rush
          ? rush.end - s.elapsed
          : 0;
    s.worldSpeed = s.focus
      ? 0
      : this.slowRemaining > 0
        ? SLOW_WORLD_SPEED
        : rush
          ? RUSH_WORLD_SPEED
          : 1;
  }
  private clearEffects() {
    this.slowRemaining = 0;
    this.state.event = 'normal';
    this.state.eventRemaining = 0;
    this.state.worldSpeed = 1;
    this.state.shieldRemaining = 0;
    this.state.focus = null;
  }
  private finish(outcome: GameState['outcome']) {
    this.state.phase = 'result';
    this.state.outcome = outcome;
    this.active.clear();
    this.clearEffects();
  }
}
